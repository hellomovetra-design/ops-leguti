import {NextResponse,after} from "next/server";
import {DUPLICATE_AWB,awbKey,reportDuplicate} from "./report-workflow";
import {PROBLEM_CATEGORIES} from "./problem-records";
import {damageImageValid} from "./damage-case";
import {isImageKitConfigured,uploadToImageKit,deleteFromImageKit} from "./imagekit";
import {dispatchPush} from "./web-push";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function createProblemReport(db:any,session:{email:string},body:Record<string,any>,form:FormData|null){
 const json=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"private, no-store"}});
 const photos:{storage_path:string;file_name:string;content_type:string;fileId?:string}[]=[];
 let attempted=false,keep=false;
 try{
  const id=body.id?String(body.id):crypto.randomUUID();
  if(!uuid.test(id))return json({ok:false,error:"ID laporan tidak valid."},400);
  const previous=await db.from("ops_problems").select("*").eq("id",id).maybeSingle();
  if(previous.error)throw Error("Laporan belum dapat diperiksa.");
  if(previous.data)return previous.data.created_by_email?.toLowerCase()===session.email.toLowerCase()?json({ok:true,item:previous.data}):json({error:"ID laporan sudah digunakan."},409);
  const values={awb:awbKey(String(body.awb||"")),category:String(body.category||"LAINNYA"),division:String(body.division||"").trim(),location:String(body.location||"").trim(),description:String(body.description||body.reason||"").trim()};
  if(!values.awb||values.awb.length>120||!values.division||values.division.length>160||values.location.length>500||values.description.length>10000||!PROBLEM_CATEGORIES.includes(values.category as any))return json({ok:false,error:"Isi AWB, divisi, dan keterangan yang valid."},400);
  if(await reportDuplicate(db,"problem",values.awb,id))return json({ok:false,error:DUPLICATE_AWB},409);
  const files=form?.getAll("photos")||[];
  if(files.length>3||files.some(f=>!(f instanceof File)||!f.size||f.size>3*1024*1024)||files.reduce((n,f)=>n+(f instanceof File?f.size:0),0)>3*1024*1024)return json({ok:false,error:"Maksimal 3 foto, total 3 MB."},400);
  for(const file of files as File[]){
   if(!damageImageValid(new Uint8Array(await file.arrayBuffer()),file.type))throw Error("Foto harus JPG, PNG, atau WebP yang valid.");
   const path=`problems/${id}/${crypto.randomUUID()}.${file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg"}`;
   if(isImageKitConfigured()){const image=await uploadToImageKit(file,path);photos.push({storage_path:`imagekit:${image.path}`,file_name:file.name.slice(0,200),content_type:file.type,fileId:image.fileId});}
   else{const r=await db.storage.from("ops-problem-photos").upload(path,file,{contentType:file.type});if(r.error)throw Error("Foto belum berhasil diunggah.");photos.push({storage_path:path,file_name:file.name.slice(0,200),content_type:file.type});}
  }
  attempted=true;
  const result=await db.rpc("ops_create_problem_report",{p_id:id,p_values:values,p_photos:photos.map(({fileId,...photo})=>photo),p_actor:session.email.toLowerCase()});
  if(result.error){
   if(result.error.code==="23505"&&result.error.message?.includes("AWB_DUPLICATE")){attempted=false;return json({ok:false,error:DUPLICATE_AWB},409);}
   if(["PGRST202","42883"].includes(result.error.code)){attempted=false;return json({ok:false,error:"Terapkan migration 20261015_report_workflow.sql sebelum mengirim laporan."},503);}
   const check=await db.from("ops_problems").select("*").eq("id",id).maybeSingle();
   if(check.data?.created_by_email?.toLowerCase()===session.email.toLowerCase()){keep=true;return json({ok:true,item:check.data});}
   throw Error("Penyimpanan belum terkonfirmasi. Coba kirim lagi untuk memeriksa laporan yang sama.");
  }
  keep=!result.data._reused;if(result.data._reused)attempted=false;
  const {_reused,...item}=result.data;
  after(()=>dispatchPush().catch(()=>console.error("Problem push dispatch failed")));
  const inbox=await db.from("ops_inbox_threads").select("id").eq("entity_type","problem").eq("entity_id",id).maybeSingle();
  return json({ok:true,item,inbox_thread_id:inbox.data?.id});
 }catch(e){return json({ok:false,error:e instanceof Error?e.message:"Laporan belum berhasil disimpan."},503);}
 finally{if(!keep&&!attempted)await Promise.all(photos.map(photo=>photo.fileId?deleteFromImageKit(photo.fileId).catch(()=>{}):db.storage.from("ops-problem-photos").remove([photo.storage_path]).catch(()=>{})));}
}
