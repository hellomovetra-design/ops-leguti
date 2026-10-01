"use client";
import { useCallback,useEffect,useRef,useState,FormEvent } from "react";
import { Plus,Search,X,ChevronRight,Paperclip,Camera } from "lucide-react";
import { PROBLEM_CATEGORIES,PROBLEM_STATUSES,PROBLEM_NEXT } from "@/lib/problem-records";
import "./problem-goods-panel.css";
type Problem=Record<string,any>&{id:string};
const emptyForm={awb:"",division:"",category:"INVALID",location:"",description:""};
const divisions=["Admin Inbound","Admin OTS","Admin Warehouse","Admin Delivery","Admin Customer Service"];
export function ProblemGoodsPanel(){
 const [items,setItems]=useState<Problem[]>([]),[q,setQ]=useState(""),[division,setDivision]=useState(""),[category,setCategory]=useState(""),[status,setStatus]=useState(""),[from,setFrom]=useState(""),[to,setTo]=useState(""),[offset,setOffset]=useState(0);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[more,setMore]=useState(false),[canCreate,setCanCreate]=useState(false),[canManage,setCanManage]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
 const [detailId,setDetailId]=useState<string|null>(null),[creating,setCreating]=useState(false),[form,setForm]=useState(emptyForm),[photos,setPhotos]=useState<File[]>([]),[previews,setPreviews]=useState<string[]>([]),[formError,setFormError]=useState("");
 const lock=useRef(false),sequence=useRef(0),dialogRef=useRef<HTMLDivElement>(null),fileRef=useRef<HTMLInputElement>(null);
 const detail=items.find(item=>item.id===detailId),open=creating||!!detail;
 const params=new URLSearchParams({q,division,category,status,from,to}).toString();
 const load=useCallback(async()=>{
  const ticket=++sequence.current;setLoading(true);
  try{const response=await fetch(`/api/ops-desk?type=problems&${params}&offset=${offset}`,{cache:"no-store"});const data=await response.json();if(!response.ok||data.error)throw new Error(data.error||"Laporan belum dapat dimuat.");if(ticket!==sequence.current)return;setItems(data.items||[]);setMore(!!data.has_more);setCanCreate(!!data.can_create);setCanManage(!!data.can_manage);setError("")}
  catch(e){if(ticket===sequence.current)setError(e instanceof Error?e.message:"Laporan belum dapat dimuat.")}
  finally{if(ticket===sequence.current)setLoading(false)}
 },[params,offset]);
 useEffect(()=>{const start=setTimeout(load,250),timer=setInterval(()=>{if(!lock.current)load()},60000);const focus=()=>{if(!lock.current)load()};window.addEventListener("focus",focus);return()=>{clearTimeout(start);clearInterval(timer);window.removeEventListener("focus",focus);sequence.current++}},[load]);
 useEffect(()=>{const urls=photos.map(file=>URL.createObjectURL(file));setPreviews(urls);return()=>urls.forEach(url=>URL.revokeObjectURL(url))},[photos]);
 const closeDialog=useCallback(()=>{if(lock.current)return;if(creating&&(photos.length||form.awb||form.division||form.location||form.description)&&!window.confirm("Tutup form dan buang isian yang belum disimpan?"))return;setCreating(false);setDetailId(null);setForm(emptyForm);setPhotos([]);setFormError("")},[creating,form,photos]);
 const closeRef=useRef(closeDialog);closeRef.current=closeDialog;
 useEffect(()=>{
  if(!open)return;const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;document.body.style.overflow="hidden";dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  const keyboard=(e:KeyboardEvent)=>{if(e.key==="Escape"){closeRef.current();return}if(e.key!=="Tab")return;const controls=dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled):not([type="file"]),select:not(:disabled),textarea:not(:disabled)');if(!controls?.length)return;const first=controls[0],last=controls[controls.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}};
  document.addEventListener("keydown",keyboard);return()=>{document.body.style.overflow=overflow;document.removeEventListener("keydown",keyboard);previous?.focus()};
 },[open]);
 function filter(setter:(value:string)=>void,value:string){setter(value);setOffset(0);setDetailId(null);setMessage("")}
 function update(field:keyof typeof emptyForm,value:string){setForm(current=>({...current,[field]:value}))}
 function choosePhotos(files:File[]){
  if(files.length>3||files.reduce((size,file)=>size+file.size,0)>3*1024*1024){setFormError("Pilih maksimal 3 foto dengan total ukuran 3 MB.");return}
  if(files.some(file=>!file.type.startsWith("image/"))){setFormError("Foto harus berupa file gambar.");return}setPhotos(files);setFormError("");
 }
 async function save(event:FormEvent){
  event.preventDefault();if(lock.current)return;if(!form.awb.trim()||!form.division.trim()){setFormError("Nomor AWB dan divisi wajib diisi.");return}
  lock.current=true;setBusy(true);setFormError("");setMessage("");
  try{const body=new FormData();body.append("action","problem");Object.entries(form).forEach(([key,value])=>body.append(key,value));photos.forEach(file=>body.append("photos",file));const response=await fetch("/api/ops-desk",{method:"POST",body});const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||"Laporan gagal disimpan.");setCreating(false);setForm(emptyForm);setPhotos([]);setMessage("Problem barang berhasil dicatat.");await load()}
  catch(e){setFormError(e instanceof Error?e.message:"Laporan gagal disimpan.")}
  finally{lock.current=false;setBusy(false)}
 }
 async function progress(row:Problem){
  const next=PROBLEM_NEXT[row.status];if(!next||lock.current)return;if(["resolved","closed"].includes(next.status)&&!window.confirm(`${next.label} untuk laporan ${row.awb}?`))return;
  lock.current=true;setBusy(true);setError("");setMessage("");
  try{const response=await fetch("/api/ops-desk",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"updateProblemStatus",id:row.id,status:next.status})});const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||"Status gagal diperbarui.");setMessage("Status laporan berhasil diperbarui.");await load()}
  catch(e){setError(e instanceof Error?e.message:"Status gagal diperbarui.")}
  finally{lock.current=false;setBusy(false)}
 }
 const time=(value:string)=>value?new Date(value).toLocaleString("id-ID",{timeZone:"Asia/Jakarta",day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}):"—";
 const divisionOptions=Array.from(new Set([...divisions,...items.map(item=>String(item.division||"")).filter(Boolean)]));
 return <section className="goods-panel">
  <div className="section-head"><div><div className="eyebrow">OPERASIONAL · BARANG PROBLEM</div><h1 className="headline">Barang Problem</h1><p className="subtitle">Laporan dari PWA dan admin, dalam satu daftar tindak lanjut.</p></div>{canCreate&&<button className="primary" disabled={busy||loading} onClick={()=>{setCreating(true);setDetailId(null);setFormError("")}}><Plus size={16}/>Catat problem</button>}</div>
  <fieldset className="goods-filters" disabled={busy}>
   <label className="goods-search">Cari laporan<div><Search size={16}/><input aria-label="Cari laporan" value={q} placeholder="AWB, keterangan, lokasi atau pelapor…" onChange={e=>filter(setQ,e.target.value)}/></div></label>
   <label>Divisi<select aria-label="Divisi" value={division} onChange={e=>filter(setDivision,e.target.value)}><option value="">Semua divisi</option>{divisionOptions.map(value=><option key={value}>{value}</option>)}</select></label>
   <label>Kategori<select aria-label="Kategori" value={category} onChange={e=>filter(setCategory,e.target.value)}><option value="">Semua kategori</option>{PROBLEM_CATEGORIES.map(value=><option key={value}>{value}</option>)}</select></label>
   <label>Status<select aria-label="Status" value={status} onChange={e=>filter(setStatus,e.target.value)}><option value="">Semua status</option>{Object.entries(PROBLEM_STATUSES).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
   <label>Dari tanggal<input type="date" value={from} onChange={e=>filter(setFrom,e.target.value)}/></label><label>Sampai tanggal<input type="date" value={to} onChange={e=>filter(setTo,e.target.value)}/></label>
  </fieldset>
  <div className="goods-list-head"><span>{loading?"Memuat laporan…":`${items.length} laporan di halaman ini`}</span><small>Tanggal berdasarkan WIB · Foto tersedia di detail laporan</small></div>
  {error&&<p className="goods-notice error" role="alert">{error}</p>}{message&&<p className="goods-notice" role="status">{message}</p>}
  <div className="goods-table-wrap" aria-busy={loading}><table className="goods-table"><thead><tr><th>AWB / Laporan</th><th>Kategori</th><th>Divisi / Lokasi</th><th>Tanggal</th><th>Status</th><th>Tindakan</th></tr></thead><tbody>{items.map(row=><tr key={row.id}>
   <td><strong className="goods-awb">{row.awb||"AWB belum dicatat"}</strong><small className="goods-description" title={row.description}>{row.description||"Tanpa keterangan"}</small>{row.photos?.length>0&&<small className="goods-attachment"><Paperclip size={12}/>{row.photos.length} foto pendukung</small>}</td>
   <td><span className="goods-category">{row.category||"LAINNYA"}</span></td><td><span>{row.division||"—"}</span><small>{row.location||"Lokasi belum dicatat"}</small></td><td className="goods-date">{time(row.created_at)}<small>WIB</small></td><td><span className={`goods-status ${row.status}`}>{PROBLEM_STATUSES[row.status]||row.status}</span></td>
   <td><div className="goods-actions">{canManage&&PROBLEM_NEXT[row.status]&&<button className="goods-action-main" disabled={busy||loading} onClick={()=>progress(row)}>{PROBLEM_NEXT[row.status].label}</button>}<button className="goods-detail-link" aria-label={`Lihat detail laporan ${row.id}`} onClick={()=>{setDetailId(row.id);setCreating(false)}}>Lihat detail<ChevronRight size={13}/></button></div></td>
  </tr>)}{!items.length&&<tr><td colSpan={6} className="goods-empty">{loading?"Memuat laporan…":error?"Laporan belum dapat dimuat.":"Belum ada laporan sesuai filter."}</td></tr>}</tbody></table></div>
  <div className="goods-pagination"><button disabled={busy||loading||offset===0} onClick={()=>setOffset(value=>Math.max(0,value-100))}>Sebelumnya</button><span>Halaman {offset/100+1}</span><button disabled={busy||loading||!more} onClick={()=>setOffset(value=>value+100)}>Berikutnya</button></div>
  {open&&<div className={"goods-backdrop"+(creating?" goods-form-backdrop":"")} onClick={e=>{if(e.target===e.currentTarget)closeDialog()}}><div className={creating?"goods-form-dialog":"goods-drawer"} ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="goods-dialog-title">
   <div className="goods-dialog-heading"><div><small>{creating?"INPUT LAPORAN ADMIN":"DETAIL BARANG PROBLEM"}</small><h2 id="goods-dialog-title">{creating?"Catat problem barang":detail?.awb}</h2></div><button aria-label="Tutup panel problem" disabled={busy} onClick={closeDialog}><X size={20}/></button></div>
   {creating?<form onSubmit={save} className="goods-form"><fieldset disabled={busy}>
    <div className="goods-form-row"><label>Nomor AWB *<input required value={form.awb} maxLength={120} onChange={e=>update("awb",e.target.value)} placeholder="Masukkan nomor resi"/></label><label>Kategori<select aria-label="Kategori laporan" value={form.category} onChange={e=>update("category",e.target.value)}>{PROBLEM_CATEGORIES.map(value=><option key={value}>{value}</option>)}</select></label></div>
    <label>Divisi admin *<select required aria-label="Divisi admin" value={form.division} onChange={e=>update("division",e.target.value)}><option value="">Pilih divisi</option>{divisions.map(value=><option key={value}>{value}</option>)}</select></label>
    <label>Lokasi barang<input value={form.location} onChange={e=>update("location",e.target.value)} placeholder="Contoh: Rak hold WH1"/></label><label>Keterangan<textarea rows={4} value={form.description} onChange={e=>update("description",e.target.value)} placeholder="Jelaskan kondisi dan kendala barang"/></label>
    <div className="goods-upload"><div><strong>Foto pendukung</strong><small>Opsional · Maksimal 3 foto, total 3 MB</small></div><button type="button" onClick={()=>fileRef.current?.click()}><Camera size={16}/>Pilih / ambil foto</button><input ref={fileRef} className="goods-file-input" aria-label="Foto pendukung" type="file" accept="image/*" capture="environment" multiple onChange={e=>{choosePhotos(Array.from(e.target.files||[]));e.target.value=""}}/>
     {previews.length>0&&<div className="goods-photo-preview">{previews.map((url,index)=><div key={url}><img src={url} alt={`Preview foto ${index+1}`}/><button type="button" aria-label={`Hapus foto ${index+1} dari form`} onClick={()=>setPhotos(current=>current.filter((file,i)=>i!==index))}><X size={13}/></button></div>)}</div>}
    </div>
   </fieldset>{formError&&<p className="goods-notice error" role="alert">{formError}</p>}<div className="goods-form-footer"><button type="button" disabled={busy} onClick={closeDialog}>Batal</button><button className="primary" type="submit" disabled={busy}>{busy?"Menyimpan…":"Simpan problem"}</button></div></form>:detail&&<>
    <span className={`goods-status ${detail.status}`}>{PROBLEM_STATUSES[detail.status]||detail.status}</span><dl className="goods-details">{[["Kategori",detail.category],["Divisi",detail.division],["Lokasi",detail.location],["Pelapor",detail.created_by_email],["Dibuat",`${time(detail.created_at)} WIB`],["Keterangan",detail.description],["Diverifikasi oleh",detail.verified_by],["Waktu verifikasi",detail.verified_at?`${time(detail.verified_at)} WIB`:null],["Diselesaikan oleh",detail.resolved_by],["Waktu selesai",detail.resolved_at?`${time(detail.resolved_at)} WIB`:null],["Catatan tindak lanjut",detail.status_note]].filter(([label,value])=>!!value).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <section className="goods-evidence"><h3>Foto pendukung</h3>{detail.photos?.length?<div>{detail.photos.map((photo:Record<string,any>)=><a key={photo.id} href={photo.url} target="_blank" rel="noreferrer"><img src={photo.url} alt={photo.file_name||"Foto bukti problem"} loading="lazy"/><span>Lihat foto penuh</span></a>)}</div>:<p>Belum ada foto pendukung.</p>}</section>
    {canManage&&PROBLEM_NEXT[detail.status]&&<button className="primary goods-drawer-action" disabled={busy||loading} onClick={()=>progress(detail)}>{busy?"Menyimpan…":PROBLEM_NEXT[detail.status].label}</button>}
   </>}
  </div></div>}
 </section>;
}
