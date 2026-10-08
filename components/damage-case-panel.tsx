"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ChevronRight, Download, ExternalLink, Package, Search, X } from "lucide-react";
import { DAMAGE_PHOTO_LABELS, DAMAGE_STATUSES, DamageCase } from "@/lib/damage-case";
import "./damage-case.css";

async function compactPhoto(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 20*1024*1024) throw new Error("Pilih foto JPG, PNG, atau WebP maksimal 20 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    const scale = Math.min(1, 1800/Math.max(image.width,image.height));
    const canvas = document.createElement("canvas"); canvas.width = Math.max(1,Math.round(image.width*scale)); canvas.height = Math.max(1,Math.round(image.height*scale));
    const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Foto belum dapat diproses.");
    ctx.fillStyle = "#fff"; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(image,0,0,canvas.width,canvas.height);
    for (const quality of [.86,.74,.62,.5]) {
      const blob = await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/jpeg",quality));
      if (blob && blob.size <= 700*1024) return new File([blob],file.name.replace(/\.[^.]+$/,"")+".jpg",{type:"image/jpeg"});
    }
    throw new Error("Foto masih terlalu besar. Pilih gambar dengan ukuran lebih kecil.");
  } finally { URL.revokeObjectURL(url); }
}
function PhotoPicker({ index, file, busy, onChange }: { index: number; file: File|null; busy: boolean; onChange: (file: File|null)=>void }) {
  const [preview,setPreview] = useState("");
  useEffect(()=>{if(!file){setPreview("");return;} const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url);},[file]);
  return <label className="damage-photo-picker"><span>{DAMAGE_PHOTO_LABELS[index]} *</span>{preview ? <img src={preview} alt={DAMAGE_PHOTO_LABELS[index]}/> : <span className="damage-photo-placeholder"><Camera size={24}/>Ambil foto</span>}<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy} required={!file} onChange={e=>onChange(e.target.files?.[0]||null)}/>{file&&<small>{Math.ceil(file.size/1024)} KB · Ketuk untuk mengganti</small>}</label>;
}
export function DamageGallery({ item }: { item: DamageCase }) {
  return <div className="damage-gallery">{item.photos.map((photo,index)=><a key={index} href={photo.url} target="_blank" rel="noopener noreferrer"><img src={photo.url} alt={DAMAGE_PHOTO_LABELS[index]} loading="lazy"/><span>{DAMAGE_PHOTO_LABELS[index]}</span></a>)}</div>;
}
export function DamageCasePanel({ admin = false, onSaved }: { admin?: boolean; onSaved?: (item: DamageCase)=>void }) {
  const [items,setItems]=useState<DamageCase[]>([]),[total,setTotal]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const [q,setQ]=useState(""),[status,setStatus]=useState(""),[offset,setOffset]=useState(0),[selected,setSelected]=useState<DamageCase|null>(null);
  const [from,setFrom]=useState(""),[to,setTo]=useState(""),[exporting,setExporting]=useState(false);
  const exportLock=useRef(false);
  const [form,setForm]=useState(()=>({id:crypto.randomUUID(),awb:"",trip:"",fleet:"",plate:"",remark:""}));
  const [files,setFiles]=useState<(File|null)[]>([null,null,null,null]),[processing,setProcessing]=useState<number[]>([]),[saving,setSaving]=useState(false),[notice,setNotice]=useState("");
  const [review,setReview]=useState({status:"open",resolution:""});
  const locked=useRef(false),photoVersions=useRef([0,0,0,0]),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const load=useCallback(async(signal?:AbortSignal)=>{
    setLoading(true);setError("");
    try {
      const p=new URLSearchParams({scope:admin?"admin":"mine",q,status,from,to,offset:String(offset)});
      const response=await fetch(`/api/damage-cases?${p}`,{cache:"no-store",signal}),data=await response.json();
      if(!response.ok)throw new Error(data.error||"Laporan belum dapat dimuat.");
      setItems(data.items||[]);setTotal(data.total||0);
    } catch(e){if(!signal?.aborted)setError(e instanceof Error?e.message:"Laporan belum dapat dimuat.");}
    finally{if(!signal?.aborted)setLoading(false);}
  },[admin,q,status,from,to,offset]);
  const downloadReport=async()=>{
    if(exportLock.current)return;exportLock.current=true;setExporting(true);setNotice("");
    try{
      const p=new URLSearchParams({type:"export",scope:"admin",q,status,from,to});
      const response=await fetch(`/api/damage-cases?${p}`,{cache:"no-store"});
      if(!response.ok){const data=await response.json();throw new Error(data.error||"Report belum dapat diunduh.");}
      const url=URL.createObjectURL(await response.blob()),link=document.createElement("a");
      link.href=url;link.download="report-damage-case.csv";document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
      setNotice("Report Damage Case berhasil diunduh.");
    }catch(e){setNotice(e instanceof Error?e.message:"Report belum dapat diunduh.");}
    finally{exportLock.current=false;setExporting(false);}
  };
  useEffect(()=>{const controller=new AbortController();const timer=setTimeout(()=>void load(controller.signal),200);return()=>{clearTimeout(timer);controller.abort();};},[load]);
  const choose=async(index:number,file:File|null)=>{
    const version=++photoVersions.current[index];setNotice("");
    setFiles(previous=>previous.map((f,i)=>i===index?null:f));
    if(!file)return;
    setProcessing(previous=>[...new Set([...previous,index])]);
    try{const photo=await compactPhoto(file);if(mounted.current&&version===photoVersions.current[index])setFiles(previous=>previous.map((f,i)=>i===index?photo:f));}
    catch(e){if(mounted.current)setNotice(e instanceof Error?e.message:"Foto belum dapat diproses.");}
    finally{if(mounted.current&&version===photoVersions.current[index])setProcessing(previous=>previous.filter(i=>i!==index));}
  };
  const submit=async(event:React.FormEvent)=>{
    event.preventDefault();if(locked.current||processing.length)return;
    if(files.some(file=>!file)){setNotice("Lengkapi foto AWB dan tiga foto bukti.");return;}
    locked.current=true;setSaving(true);setNotice("");
    try {
      const data=new FormData();data.append("action","create");Object.entries(form).forEach(([k,v])=>data.append(k,v));files.forEach((file,i)=>data.append(`photo${i}`,file!));
      const response=await fetch("/api/damage-cases",{method:"POST",body:data}),result=await response.json();
      if(!response.ok||!result.ok)throw new Error(result.error||"Laporan belum berhasil dikirim.");
      setForm({id:crypto.randomUUID(),awb:"",trip:"",fleet:"",plate:"",remark:""});setFiles([null,null,null,null]);
      setNotice("Damage Case berhasil dikirim.");void load();onSaved?.(result.item);
    }catch(e){setNotice(e instanceof Error?e.message:"Laporan belum berhasil dikirim.");}
    finally{locked.current=false;setSaving(false);}
  };
  const saveReview=async(event:React.FormEvent)=>{
    event.preventDefault();if(locked.current||!selected)return;locked.current=true;setSaving(true);setNotice("");
    try{const data=new FormData();Object.entries({action:"review",id:selected.id,updated_at:selected.updated_at,...review}).forEach(([k,v])=>data.append(k,v));const response=await fetch("/api/damage-cases",{method:"POST",body:data}),result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||"Perubahan belum tersimpan.");setSelected(result.item);setNotice("Status Damage Case berhasil diperbarui.");void load();}
    catch(e){setNotice(e instanceof Error?e.message:"Perubahan belum tersimpan.");}
    finally{locked.current=false;setSaving(false);}
  };
  const open=(item:DamageCase)=>{setSelected(item);setReview({status:item.status,resolution:item.resolution});setNotice("");};
  const copyEvidence=async()=>{
    if(!selected)return;
    try{await navigator.clipboard.writeText(new URL(selected.evidence_url,window.location.origin).href);setNotice("Tautan 4 foto bukti berhasil disalin.");}
    catch{setNotice("Tautan belum dapat disalin. Buka galeri lalu salin alamatnya.");}
  };
  return <section className={`damage-module${admin?" admin":""}`}>
    {admin?<div className="section-head"><div><div className="eyebrow">OPERASIONAL · GUDANG</div><h1 className="headline">Damage Case</h1><p className="subtitle">Laporan kerusakan barang saat bongkar muat.</p></div><div className="actions"><button className="btn" disabled={loading} onClick={()=>void load()}>Muat ulang</button><button className="primary" disabled={exporting||loading||!!error||total===0} onClick={()=>void downloadReport()}><Download size={16}/>{exporting?"Menyiapkan report…":"Unduh report"}</button></div></div>:<div className="pwa-page-title">Damage Case</div>}
    {!admin&&<form className="mobile-card pwa-form damage-form" onSubmit={submit} aria-busy={saving}>
      <h2>Laporan bongkar muat</h2><fieldset disabled={saving}>
        <label>No. AWB<input required maxLength={80} value={form.awb} onChange={e=>setForm({...form,awb:e.target.value.toUpperCase()})}/></label>
        <div className="mobile-grid"><label>Trip<input required maxLength={100} value={form.trip} onChange={e=>setForm({...form,trip:e.target.value})}/></label><label>Armada<input required maxLength={160} value={form.fleet} onChange={e=>setForm({...form,fleet:e.target.value})}/></label></div>
        <label>Nopol<input required maxLength={30} value={form.plate} onChange={e=>setForm({...form,plate:e.target.value.toUpperCase()})}/></label>
        <label>Remark problem<textarea required rows={4} maxLength={5000} value={form.remark} onChange={e=>setForm({...form,remark:e.target.value})}/></label>
        <div className="damage-photo-grid">{files.map((file,index)=><PhotoPicker key={`${form.id}-${index}`} index={index} file={file} busy={saving||processing.includes(index)} onChange={file=>void choose(index,file)}/>)}</div>
        {processing.length>0&&<p role="status">Menyiapkan foto…</p>}
        <button className="mobile-submit" disabled={saving||processing.length>0||files.some(f=>!f)}>{saving?"Mengirim…":"Kirim Damage Case"}</button>
      </fieldset>
    </form>}
    {notice&&<p className="damage-notice" role="status">{notice}</p>}
    <div className="damage-toolbar"><label className="search"><Search size={16}/><input aria-label="Cari AWB Damage Case" placeholder="Cari nomor AWB…" value={q} onChange={e=>{setQ(e.target.value);setOffset(0);}}/></label><select aria-label="Filter status Damage Case" value={status} onChange={e=>{setStatus(e.target.value);setOffset(0);}}><option value="">Semua status</option>{Object.entries(DAMAGE_STATUSES).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div>
    {admin&&<div className="damage-date-filters"><label>Dari tanggal<input type="date" value={from} max={to||undefined} onChange={e=>{setFrom(e.target.value);setOffset(0);}}/></label><label>Sampai tanggal<input type="date" value={to} min={from||undefined} onChange={e=>{setTo(e.target.value);setOffset(0);}}/></label><button className="btn" onClick={()=>{setQ("");setStatus("");setFrom("");setTo("");setOffset(0);}}>Reset filter</button></div>}
    {error?<p role="alert" className="damage-notice">{error}<button className="btn" onClick={()=>void load()}>Coba lagi</button></p>:loading?<p role="status">Memuat laporan…</p>:items.length?<div className="damage-records">{items.map(item=><button className="damage-record" key={item.id} onClick={()=>open(item)}><Package size={20}/><span><strong>{item.awb}</strong><small>{item.trip} · {item.plate}</small><small>{new Date(item.created_at).toLocaleString("id-ID",{timeZone:"Asia/Jakarta"})} WIB</small></span><em>{DAMAGE_STATUSES[item.status]}</em><ChevronRight size={16}/></button>)}</div>:<p className="pwa-empty">Belum ada laporan Damage Case.</p>}
    <div className="damage-pagination"><button className="btn" disabled={loading||offset===0} onClick={()=>setOffset(Math.max(0,offset-25))}>Sebelumnya</button><small>{total?`${offset+1}–${Math.min(offset+25,total)} dari ${total}`:"0 laporan"}</small><button className="btn" disabled={loading||offset+25>=total} onClick={()=>setOffset(offset+25)}>Berikutnya</button></div>
    {selected&&<section className="damage-detail card"><div className="damage-detail-head"><h2>AWB {selected.awb}</h2><button className="icon-btn" disabled={saving} aria-label="Tutup detail Damage Case" onClick={()=>setSelected(null)}><X size={18}/></button></div>
      <dl>{[["Trip",selected.trip],["Armada",selected.fleet],["Nopol",selected.plate],["Pengirim",selected.created_by],["Remark problem",selected.remark]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <a className="damage-evidence-link" href={selected.evidence_url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/>Buka tautan 4 foto bukti</a><button className="btn" type="button" onClick={()=>void copyEvidence()}>Salin tautan</button><DamageGallery item={selected}/>
      {admin?<form onSubmit={saveReview}><fieldset disabled={saving}><label>Status<select value={review.status} onChange={e=>setReview({...review,status:e.target.value})}>{Object.entries(DAMAGE_STATUSES).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>Tindak lanjut<textarea rows={3} maxLength={5000} required={review.status==="completed"} value={review.resolution} onChange={e=>setReview({...review,resolution:e.target.value})}/></label><button className="primary" disabled={saving}>{saving?"Menyimpan…":"Simpan tindak lanjut"}</button></fieldset></form>:<p>{DAMAGE_STATUSES[selected.status]}{selected.resolution&&` · ${selected.resolution}`}</p>}
    </section>}
  </section>;
}
export function DamageEvidencePage({ id }: { id: string }) {
  const [item,setItem]=useState<DamageCase|null>(null),[error,setError]=useState("");
  useEffect(()=>{const controller=new AbortController();fetch(`/api/damage-cases?id=${encodeURIComponent(id)}`,{cache:"no-store",signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||"Bukti tidak ditemukan.");setItem(data.item);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[id]);
  return <main className="damage-evidence-page"><h1>Bukti Damage Case</h1>{error?<p role="alert">{error}</p>:item?<><h2>AWB {item.awb}</h2><p>{item.trip} · {item.fleet} · {item.plate}</p><DamageGallery item={item}/></>:<p role="status">Memuat foto…</p>}</main>;
}
