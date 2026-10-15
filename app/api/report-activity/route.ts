import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth-token";
import { getSupabaseServerClient } from "@/lib/supabase";
import { REPORTS, REPORT_ADMINS, reportKind, awbKey, DUPLICATE_AWB } from "@/lib/report-workflow";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
export async function GET(req:NextRequest){
 const session=await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value,process.env.INTERNAL_AUTH_SECRET);
 if(!session)return json({error:"Silakan login kembali."},401);
 const db=getSupabaseServerClient(),admin=REPORT_ADMINS.includes(session.role),p=req.nextUrl.searchParams;
 if(!db)return json({error:"Penyimpanan belum tersedia."},503);
 try{
  const type=p.get("type"),kind=p.get("kind")||"",id=p.get("id")||"";
  if(type==="queue"){
   if(!admin)return json({error:"Akses dashboard diperlukan."},403);
   const groups=await Promise.all(Object.entries(REPORTS).map(async([kind,config])=>{
    const result=await db.from(config.table).select("id,awb,status,created_at",{count:"exact"}).in("status",[...config.pending]).order("created_at").order("id").limit(10);
    if(result.error)throw result.error;
    return {kind,title:config.title,total:result.count||0,items:(result.data||[]).map(row=>({...row,kind,title:config.title,url:`${config.path}?id=${row.id}`}))};
   }));
   return json({groups});
  }
  if(!reportKind(kind))return json({error:"Modul tidak valid."},400);
  const config=REPORTS[kind];
  if(type==="duplicate"){
   const awb=awbKey(p.get("awb")||"");
   if(!awb||awb.length>120|| (id&&!uuid.test(id)))return json({error:"AWB tidak valid."},400);
   // Database RPC returns only a boolean; never exposes another user's report.
   const result=await db.rpc("ops_report_awb_exists",{p_kind:kind,p_awb:awb,p_exclude:id||null});
   if(result.error)throw result.error;
   return json({duplicate:!!result.data,message:result.data?DUPLICATE_AWB:""});
  }
  if(type!=="history"||!uuid.test(id))return json({error:"Catatan tidak valid."},400);
  let query=db.from(config.table).select("id").eq("id",id);
  if(!admin)query=query.eq(config.owner,session.email.toLowerCase());
  const record=await query.maybeSingle();
  if(record.error)throw record.error;
  if(!record.data)return json({error:"Laporan tidak ditemukan."},404);
  const offset=Number(p.get("offset")||0);
  if(!Number.isSafeInteger(offset)||offset<0||offset>100000)return json({error:"Halaman tidak valid."},400);
  const result=await db.from("ops_report_history").select("id,action,actor_email,old_status,new_status,old_note,new_note,created_at").eq("entity_type",kind).eq("entity_id",id).order("created_at",{ascending:false}).order("id",{ascending:false}).range(offset,offset+29);
  if(result.error)throw result.error;
  return json({items:(result.data||[]).map(row=>({...row,actor_email:admin?row.actor_email:row.actor_email?"Admin / pelapor":"Perubahan database"})),has_more:(result.data||[]).length===30});
 }catch{return json({error:admin?"Fitur tindak lanjut belum tersedia. Pastikan migration 20261015_report_workflow.sql sudah diterapkan.":"Riwayat belum tersedia. Silakan hubungi pengelola."},503);}
}
