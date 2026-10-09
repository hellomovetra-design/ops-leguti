import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";
import { getSupabaseServerClient } from "@/lib/supabase";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth-token";
import { IncomingCourier, MasterRow, missingMasterFields, normalizeCourier, planImport } from "@/lib/courier-master";
import { masterCourierXlsx } from "@/lib/courier-master-export";
export const runtime="nodejs";
const headers={"Cache-Control":"private, no-store"};
const json=(v:unknown,status=200)=>NextResponse.json(v,{status,headers});
const digest=(v:unknown)=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
async function state(db:any){
  const first=await db.from("ops_courier_master_revision").select("revision").eq("singleton",true).single();
  if(first.error)throw new Error("Master kurir belum tersedia. Terapkan migration 20261002_courier_master_sync.sql terlebih dahulu.");
  const records:MasterRow[]=[],aliases:any[]=[];
  for(const [table,target,key] of [["ops_courier_master",records,"tgrid"],["ops_courier_id_aliases",aliases,"tgrid"]] as const){
    for(let n=0;;n+=1000){const r=await db.from(table).select("*").order(key).range(n,n+999);if(r.error)throw new Error(r.error.message);target.push(...(r.data??[]));if((r.data??[]).length<1000)break;}
  }
  const last=await db.from("ops_courier_master_revision").select("revision").eq("singleton",true).single();
  if(last.error||first.data.revision!==last.data.revision)throw new Error("Data berubah saat dimuat. Silakan muat ulang.");
  return {records,aliases,revision:last.data.revision};
}
const validMonth=(month:string)=>/^\d{4}-(0[1-9]|1[0-2])$/.test(month);
export async function GET(req:NextRequest){
  const session=await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value,process.env.INTERNAL_AUTH_SECRET);
  if(!session)return json({error:"Silakan login kembali."},401);
  const db=getSupabaseServerClient();if(!db)return json({error:"Database belum terhubung."},503);
  try{
    const s=await state(db);
    if(req.nextUrl.searchParams.get("download")==="1"){
      const month=req.nextUrl.searchParams.get("month")??"";if(!validMonth(month))return json({error:"Periode unduh tidak valid."},400);
      const template=await readFile(path.join(process.cwd(),"assets","templates","courier-master.xlsx"));
      const complete=s.records.filter(x=>x.active&&!missingMasterFields(x).length);
      if(!complete.length)return json({error:"Belum ada master lengkap yang dapat diunduh. Lengkapi tujuh kolom operasional wajib terlebih dahulu."},409);
      const output=masterCourierXlsx(template,complete,month);
      return new NextResponse(Buffer.from(output),{headers:{...headers,"Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","Content-Disposition":`attachment; filename="UPDATE_KURIR_${month}.xlsx"`}});
    }
    return json({items:s.records,revision:s.revision,incomplete:s.records.filter(x=>x.active&&missingMasterFields(x).length).length,can_manage:["admin","super_admin","spv"].includes(session.role)});
  }catch(e){return json({error:e instanceof Error?e.message:"Master kurir gagal dimuat."},503);}
}
export async function POST(req:NextRequest){
  const session=await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value,process.env.INTERNAL_AUTH_SECRET);
  if(!session)return json({error:"Silakan login kembali."},401);
  if(!["admin","super_admin","spv"].includes(session.role))return json({error:"Hanya Super Admin, Admin Pengelola, atau SPV yang dapat mengubah master kurir."},403);
  if(req.headers.get("origin")!==req.nextUrl.origin)return json({error:"Asal permintaan tidak valid."},403);
  const db=getSupabaseServerClient();if(!db)return json({error:"Database belum terhubung."},503);
  try{
    let body:any,input:IncomingCourier[];
    if(req.headers.get("content-type")?.includes("multipart/form-data")){
      const f=await req.formData(),file=f.get("file");
      if(!(file instanceof File)||file.size>10*1024*1024||!file.name.toLowerCase().endsWith(".xlsx"))return json({error:"Gunakan file .xlsx maksimal 10 MB."},400);
      const book=XLSX.read(await file.arrayBuffer(),{type:"array"});
      if(!book.Sheets.KURIR)throw new Error("Sheet KURIR tidak ditemukan pada file.");
      input=[];
      for(const name of f.get("include_extra")==="true"?["KURIR","Sheet2"]:["KURIR"]){
        if(!book.Sheets[name])continue;
        const rows=XLSX.utils.sheet_to_json<Record<string,unknown>>(book.Sheets[name],{range:1,defval:""});
        rows.forEach((r,i)=>{if(Object.values(r).some(v=>String(v??"").trim()))input.push(normalizeCourier(r,`${name}:${i+3}`));});
      }
      body={action:"preview",month:f.get("month"),decisions:{}};
    }else{
      if(Number(req.headers.get("content-length")||0)>2*1024*1024)throw new Error("Batch terlalu besar.");
      body=await req.json();
      if(!Array.isArray(body.rows))throw new Error("Daftar kurir tidak valid.");
      input=body.rows.map((r:any)=>normalizeCourier(Object.fromEntries(["ID KURIR","NAMA KURIR","LEADER","SHIFT KERJA","VICH","AREA","KEC","ZONE","KANIT","KODE","KPI"].map((k,i)=>[k,r[["tgrid","name","leader","shift","vehicle","area","district","zone","kanit","code","kpi"][i]]])),String(r.row??"Manual")));
    }
    if(!validMonth(String(body.month))||!input.length||input.length>5000)throw new Error("Pilih periode dan unggah 1–5000 baris kurir.");
    if(input.some(x=>Object.values(x).some(v=>String(v).length>250)))throw new Error("Isian kolom maksimal 250 karakter.");
    const s=await state(db),plan=planImport(input,s.records,s.aliases,body.decisions??{});
    const review=digest({revision:s.revision,input,operations:plan.operations,counts:plan.counts,month:body.month});
    if(body.action==="preview")return json({rows:input,entries:plan.entries,counts:plan.counts,revision:s.revision,review});
    if(body.action!=="commit")throw new Error("Aksi tidak valid.");
    if(plan.counts.blocked)return json({error:"Masih ada identitas atau baris yang perlu diperiksa."},409);
    if(body.review!==review)return json({error:"Preview sudah berubah. Periksa ulang sebelum menyimpan."},409);
    const result=await db.rpc("ops_sync_courier_master",{p_revision:s.revision,p_operations:plan.operations,p_month:body.month+"-01",p_actor:session.email});
    if(result.error)return json({error:result.error.message},409);
    return json({ok:true,counts:plan.counts});
  }catch(e){return json({error:e instanceof Error?e.message:"Import tidak berhasil."},400);}
}
