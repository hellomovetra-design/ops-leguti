"use client";
import {useEffect,useRef,useState} from "react";
import {EmployeeSanction,SANCTION_KINDS} from "@/lib/employee-sanctions";
import {SANCTION_STAGES,SanctionStage} from "@/lib/coaching-workflow";
import {idleUpload,uploadReport} from "@/lib/report-upload";
import {ReportUploadStatus} from "./report-upload-status";
import {prepareCourierPhoto} from "@/lib/courier-photo";
type RecordInfo={id:string;kind:string;updated_at:string;workflow_status?:SanctionStage;employee_name?:string;employee_nik?:string;incident_date?:string;sent_hrd_at?:string;finalized_at?:string};
export function SanctionDocumentActions({record,scope,onDone}:{record:RecordInfo;scope:"admin"|"mine";onDone:()=>void}){
 const [open,setOpen]=useState(false),[hrdSigned,setHrdSigned]=useState(false),[scan,setScan]=useState<File|null>(null),[saving,setSaving]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState(""),[upload,setUpload]=useState(idleUpload);
 const lock=useRef(false),request=useRef(crypto.randomUUID());
 const stage=record.workflow_status||"awaiting_signatures";
 const url=(type:string)=>`/api/employee-sanctions/workflow?type=${type}&scope=${scope}&id=${record.id}`;
 useEffect(()=>{request.current=crypto.randomUUID();setOpen(false);setHrdSigned(false);setScan(null);setUpload(idleUpload)},[record.id,record.updated_at]);
 async function download(){
  if(lock.current)return;lock.current=true;setSaving(true);setError("");
  try{const response=await fetch(url("word"),{cache:"no-store"});if(!response.ok){const body=await response.json();throw Error(body.error||"Dokumen belum dapat diunduh.")}const blob=await response.blob(),link=document.createElement("a"),href=URL.createObjectURL(blob);link.href=href;link.download=`FORM_${record.kind==="coaching"?"COACHING":"SANKSI"}_${record.id}.docx`;link.click();setTimeout(()=>URL.revokeObjectURL(href),1000)}catch(error){setError(error instanceof Error?error.message:"Unduhan gagal.")}finally{lock.current=false;setSaving(false)}
 }
 async function submit(){
  if(lock.current)return;lock.current=true;setSaving(true);setError("");setNotice("");
  try{
   const form=new FormData();form.set("id",record.id);form.set("request_id",request.current);form.set("scope",scope);form.set("updated_at",record.updated_at);
   if(!scan||!hrdSigned)throw Error("Unggah dokumen dan konfirmasi tanda tangan lengkap.");
   const finalScan=scan.type.startsWith("image/")?await prepareCourierPhoto(scan):scan;
   if(finalScan.size>3*1024*1024)throw Error("Ukuran dokumen maksimal 3 MB.");
   form.set("action","finalize");form.set("signed_complete","true");form.set("final_scan",finalScan);
   await uploadReport("/api/employee-sanctions/workflow",form,setUpload);setNotice("Dokumen bertanda tangan berhasil disimpan. Sesi selesai dan dokumen dikunci.");setOpen(false);onDone();
  }catch(error){setError(error instanceof Error?error.message:"Dokumen belum tersimpan.")}finally{lock.current=false;setSaving(false)}
 }
 return <div className="sanction-document-actions"><span className={`sanction-stage stage-${stage}`}>{SANCTION_STAGES[stage]}</span>
 <div className="sanctions-actions">{<><button type="button" className="btn" disabled={saving} onClick={()=>void download()}>Unduh Word</button><a className="btn" href={url("print")} target="_blank" rel="noopener noreferrer">Cetak form</a></>}
 {stage==="final"?<a className="btn" href={url("final")}>Unduh scan final</a>:<button type="button" className="btn" disabled={saving} aria-expanded={open} onClick={()=>{setOpen(!open);setError("")}}>Unggah hasil TTD</button>}</div>
 {record.finalized_at&&<small>Final: {new Date(record.finalized_at).toLocaleString("id-ID",{timeZone:"Asia/Jakarta"})} WIB</small>}
 {open&&stage!=="final"&&<fieldset disabled={saving} className="sanction-workflow-form"><legend>Lampiran dokumen bertanda tangan</legend><p>Unduh dan cetak form, lengkapi tanda tangan, lalu unggah kembali untuk menyelesaikan sesi.</p><label>Dokumen hasil TTD<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e=>setScan(e.target.files?.[0]||null)}/></label><small>Satu PDF atau foto maksimal 3 MB. Untuk beberapa halaman, gabungkan menjadi PDF.</small><label><input type="checkbox" checked={hrdSigned} onChange={e=>setHrdSigned(e.target.checked)}/>Dokumen sudah lengkap ditandatangani sesuai form</label><p>Setelah diselesaikan, catatan dan dokumen dikunci.</p><button type="button" className="primary" disabled={saving} onClick={()=>void submit()}>{saving?"Menyimpan…":"Simpan dan selesaikan sesi"}</button></fieldset>}
 <ReportUploadStatus value={upload}/>{error&&<p className="sanctions-error" role="alert">{error}</p>}{notice&&<p className="sanctions-success" role="status">{notice}</p>}</div>;
}

export function MySanctionDocuments({onEdit,revision=0}:{onEdit:(record:EmployeeSanction)=>void;revision?:number}){
 async function edit(id:string){
  setError("");try{const response=await fetch(`/api/employee-sanctions?scope=mine&type=record&id=${id}`,{cache:"no-store"});const data=await response.json();if(!response.ok)throw Error(data.error||"Catatan belum dapat dimuat.");if(!data.item.can_edit)throw Error("Dokumen sudah dikunci.");onEdit(data.item);}catch(e){setError(e instanceof Error?e.message:"Catatan belum dapat dimuat.");}
 }

 const [open,setOpen]=useState(false),[items,setItems]=useState<RecordInfo[]>([]),[offset,setOffset]=useState(0),[more,setMore]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(""),[refresh,setRefresh]=useState(0);
 useEffect(()=>{if(!open)return;const controller=new AbortController();setLoading(true);fetch(`/api/employee-sanctions/workflow?type=mine&offset=${offset}`,{cache:"no-store",signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error||"Dokumen belum dimuat.");setItems(data.items||[]);setMore(!!data.has_more);setError("")}).catch(error=>{if(!controller.signal.aborted)setError(error.message)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});return()=>controller.abort()},[open,offset,refresh,revision]);
 return <section className="sanctions-my-documents"><button type="button" className="btn" aria-expanded={open} onClick={()=>setOpen(!open)}>Dokumen dan scan final saya</button>{open&&<div><h2>Tindak lanjut dokumen saya</h2><button type="button" className="btn" disabled={loading} onClick={()=>setRefresh(v=>v+1)}>Muat ulang</button>{loading?<p role="status">Memuat dokumen…</p>:error?<p role="alert">{error}</p>:items.length?items.map(item=><article className="mobile-card" key={item.id}><h3>{item.employee_name}</h3><p>{item.employee_nik} · {SANCTION_KINDS[item.kind as keyof typeof SANCTION_KINDS]} · {item.incident_date}</p>{(!item.workflow_status||item.workflow_status==="awaiting_signatures")&&<button type="button" className="btn" onClick={()=>void edit(item.id)}>Edit</button>}<SanctionDocumentActions record={item} scope="mine" onDone={()=>setRefresh(v=>v+1)}/></article>):<p>Belum ada dokumen yang Anda buat.</p>}<div className="sanctions-actions"><button type="button" className="btn" disabled={loading||offset===0} onClick={()=>setOffset(v=>Math.max(0,v-10))}>Sebelumnya</button><span>Halaman {offset/10+1}</span><button type="button" className="btn" disabled={loading||!more} onClick={()=>setOffset(v=>v+10)}>Selanjutnya</button></div></div>}</section>;
}
