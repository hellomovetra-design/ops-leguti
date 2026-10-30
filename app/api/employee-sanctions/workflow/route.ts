import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE,verifySessionToken } from "@/lib/auth-token";
import { getSupabaseServerClient } from "@/lib/supabase";
import { linkedEmployee } from "@/lib/employee-access";
import { SANCTION_ADMINS } from "@/lib/employee-sanctions";
import { coachingDetails,validateFinalDocument,workflowTransition,FinalDocument } from "@/lib/coaching-workflow";
import { coachingDocx,coachingPrintHtml } from "@/lib/coaching-document";
import { sanctionDocx,sanctionPrintHtml } from "@/lib/sanction-document";
import { sanctionDetails } from "@/lib/sanction-form";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fetchFromImageKit,isImageKitConfigured,uploadToImageKit,deleteFromImageKit } from "@/lib/imagekit";
export const runtime="nodejs";
const TABLE="ops_employee_sanctions",uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers});
async function context(req:NextRequest){
 const session=await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value,process.env.INTERNAL_AUTH_SECRET);
 if(!session)return {error:json({error:"Silakan login kembali."},401)};
 const db=getSupabaseServerClient(session.email);
 if(!db)return {error:json({error:"Database belum tersedia."},503)};
 return {session,db};
}
export async function GET(req:NextRequest){
 const c=await context(req);if(c.error)return c.error;
 const p=req.nextUrl.searchParams,id=p.get("id")||"",type=p.get("type")||"",admin=p.get("scope")==="admin";
 if(admin&&!SANCTION_ADMINS.includes(c.session!.role))return json({error:"Akses pengelola diperlukan."},403);
 if(type!=="mine"&&(!uuid.test(id)||!["word","print","final"].includes(type)))return json({error:"Permintaan dokumen tidak valid."},400);
 try{
  if(type==="mine"){
   const offset=Number(p.get("offset")||0);if(!Number.isSafeInteger(offset)||offset<0||offset>100000)return json({error:"Halaman tidak valid."},400);
   const result=await c.db!.from(TABLE).select("id,employee_name,employee_nik,kind,incident_date,workflow_status,updated_at,finalized_at,sent_hrd_at").eq("created_by",c.session!.email.toLowerCase()).order("created_at",{ascending:false}).order("id").range(offset,offset+10);
   if(result.error)return json({error:"Dokumen belum tersedia. Periksa migration coaching workflow."},503);
   return json({items:(result.data||[]).slice(0,10),has_more:(result.data||[]).length>10});
  }
  let query=c.db!.from(TABLE).select("*").eq("id",id);
  if(!admin)query=query.eq("created_by",c.session!.email.toLowerCase());
  const result=await query.maybeSingle();
  if(result.error)return json({error:"Dokumen belum tersedia. Periksa migration coaching workflow."},503);
  if(!result.data)return json({error:"Catatan tidak ditemukan."},404);
  const record=result.data;
  if(type==="final"){
   const file:FinalDocument|undefined=record.final_document;
   if(record.workflow_status!=="final"||!file?.path)return json({error:"Scan final belum tersedia."},404);
   const response=await fetchFromImageKit(file.path);
   const ext=file.content_type==="application/pdf"?"pdf":file.content_type==="image/png"?"png":file.content_type==="image/webp"?"webp":"jpg";
   return new NextResponse(response.body,{headers:{...headers,"Content-Type":file.content_type,"Content-Disposition":`attachment; filename="FINAL_${id}.${ext}"`}});
  }
  if(!record.recorder_name)record.recorder_name=(await linkedEmployee(c.db!,record.created_by))?.name||"";
  const coaching=record.kind==="coaching",logo=await readFile(path.join(process.cwd(),"assets/templates/sanction-jne-logo.jpg"));
  if(type==="print")return new NextResponse(coaching?coachingPrintHtml(record):sanctionPrintHtml(record,logo!),{headers:{...headers,"Content-Type":"text/html; charset=utf-8","Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'none'; base-uri 'none'"}});
  const doc=coaching?await coachingDocx(record,logo):await sanctionDocx(record,logo!);
  return new NextResponse(new Uint8Array(doc),{headers:{...headers,"Content-Type":"application/vnd.openxmlformats-officedocument.wordprocessingml.document","Content-Disposition":`attachment; filename="FORM_${coaching?"COACHING":"SANKSI"}_${id}.docx"`}});
 }catch(error){return json({error:error instanceof Error&&error.message==="Lengkapi form sesi coaching."?"Catatan ini belum memiliki form coaching lengkap. Klik Edit untuk melengkapi sebelum unduh/cetak. Dokumen yang sudah ditandatangani tetap dapat diunggah melalui Unggah hasil TTD.":error instanceof Error?error.message:"Dokumen belum dapat dibuat."},409)}
}
export async function POST(req:NextRequest){
 if(req.headers.get("origin")!==req.nextUrl.origin)return json({error:"Permintaan tidak valid."},403);
 const c=await context(req);if(c.error)return c.error;
 let uploaded:FinalDocument|null=null,attempted=false;
 try{
  if(Number(req.headers.get("content-length")||0)>4*1024*1024)return json({error:"Scan maksimal 3 MB."},413);
  const form=await req.formData(),body=Object.fromEntries(form.entries()),id=String(body.id||""),requestId=String(body.request_id||"");
  const admin=body.scope==="admin";
  if(admin&&!SANCTION_ADMINS.includes(c.session!.role))return json({error:"Akses pengelola diperlukan."},403);
  if(!uuid.test(id)||!uuid.test(requestId)||!["send_hrd","finalize"].includes(String(body.action)))return json({error:"Tindakan tidak valid."},400);
  let query=c.db!.from(TABLE).select("*").eq("id",id);
  if(!admin)query=query.eq("created_by",c.session!.email.toLowerCase());
  const found=await query.maybeSingle();
  if(found.error)return json({error:"Alur dokumen belum siap. Jalankan migration 20261030_coaching_workflow.sql."},503);
  if(!found.data)return json({error:"Catatan tidak ditemukan."},404);
  const record=found.data;
  if(record.workflow_request_id===requestId&&((body.action==="send_hrd"&&record.workflow_status==="sent_hrd")||(body.action==="finalize"&&record.workflow_status==="final")))return json({ok:true});
  let stage;
  try{stage=workflowTransition(record,body)}catch(error){return json({error:error instanceof Error?error.message:"Tahap tidak valid."},409)}
  if(!record.photos?.length)return json({error:"Lengkapi minimal satu foto bukti pada catatan sebelum diproses."},400);
  if(stage!=="final"){
   if(record.kind==="coaching")coachingDetails(record.coaching_details,"coaching");
   else sanctionDetails(record.sanction_details,record.kind);
  }
  const email=c.session!.email.toLowerCase(),now=new Date().toISOString();
  const values:Record<string,unknown>={workflow_status:stage,updated_by:email,workflow_request_id:requestId};
  if(!record.recorder_name){
   const recorder=await linkedEmployee(c.db!,record.created_by);
   if(!recorder?.name)return json({error:"Akun pemberi catatan belum terhubung ke data karyawan. Kaitkan NIK terlebih dahulu."},409);
   Object.assign(values,{recorder_name:recorder.name,recorder_nik:recorder.nik});
  }
  if(stage==="sent_hrd")Object.assign(values,{employee_signed:true,coach_signed:true,sent_hrd_at:now,sent_hrd_by:email,...(record.kind!=="coaching"?{approver_one_signed:true,approver_two_signed:true}:{})});
  else {
   const files=form.getAll("final_scan");if(files.length!==1||!(files[0] instanceof File))return json({error:"Unggah satu scan final PDF atau foto."},400);
   const file=files[0];await validateFinalDocument(file);
   if(!isImageKitConfigured())return json({error:"Penyimpanan dokumen belum siap."},503);
   const ext=file.type==="application/pdf"?"pdf":file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";
   const image=await uploadToImageKit(file,`sanctions-final/${id}/${requestId}-${crypto.randomUUID()}.${ext}`);
   uploaded={name:file.name.slice(0,200),path:image.path,fileId:image.fileId,content_type:file.type};
   Object.assign(values,{final_document:uploaded,signed_complete:body.signed_complete==="true",hrd_signed:body.hrd_signed==="true",finalized_at:now,finalized_by:email});
  }
  attempted=true;
  const saved=await c.db!.from(TABLE).update(values).eq("id",id).eq("updated_at",record.updated_at).eq("workflow_status",record.workflow_status).select("id").maybeSingle();
  if(saved.error)return json({error:"Dokumen belum terkonfirmasi tersimpan. Periksa status dan coba kembali dengan form yang sama."},503);
  if(!saved.data){if(uploaded)await deleteFromImageKit(uploaded.fileId).catch(()=>{});return json({error:"Catatan berubah. Muat ulang sebelum melanjutkan."},409)}
  return json({ok:true});
 }catch(error){return json({error:attempted?"Penyimpanan belum terkonfirmasi. Coba kembali dengan form yang sama.":error instanceof Error?error.message:"Dokumen belum dapat diproses."},503)}
 finally{if(uploaded&&!attempted)await deleteFromImageKit(uploaded.fileId).catch(()=>{})}
}
