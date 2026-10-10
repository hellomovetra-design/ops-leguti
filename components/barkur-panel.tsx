"use client";
import { EvidenceShareControls } from "./evidence-share-controls";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Plus, Search, Download, X, Paperclip, ArrowUpRight, Pencil, Loader2, PackageSearch } from "lucide-react";
import { BARKUR_MAX_PHOTOS, BARKUR_MAX_UPLOAD_BYTES, BARKUR_STATUSES, BarkurRecord, jakartaInput, emailDelay } from "@/lib/barkur";
import "./barkur-panel.css";
const newForm = () => ({ awb: "", bag_number: "", origin: "", destination: "SPC LEGUTI", incident_at: jakartaInput(), email_sent_at: "", pic: "", description: "", status: "open", resolution: "", evidence_link: "" });
type Form = ReturnType<typeof newForm>;
const displayTime = (value: string | null) => value ? new Date(value).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" }) : "Belum dicatat";
export function BarkurPanel() {
  const [items, setItems] = useState<BarkurRecord[]>([]), [total,setTotal] = useState(0);
  const [q,setQ] = useState(""), [status,setStatus] = useState(""), [from,setFrom] = useState(""), [to,setTo] = useState(""), [offset,setOffset] = useState(0);
  const [loading,setLoading] = useState(true), [error,setError] = useState(""), [message,setMessage] = useState("");
  const [detail,setDetail] = useState<BarkurRecord|null>(null), [editing,setEditing] = useState<BarkurRecord|null>(null), [open,setOpen] = useState(false);
  const [form,setForm] = useState<Form>(newForm), [files,setFiles] = useState<(File|null)[]>(Array(BARKUR_MAX_PHOTOS).fill(null)), [previews,setPreviews] = useState<string[]>([]), [formError,setFormError] = useState("");
  const [busy,setBusy] = useState(false), [exporting,setExporting] = useState(false);
  const lock = useRef(false), request = useRef(0), recordId = useRef(""), dialog = useRef<HTMLDialogElement>(null), detailDialog = useRef<HTMLDialogElement>(null);
  const params = new URLSearchParams({q,status,from,to}).toString();
  const load = useCallback(async () => {
    const ticket = ++request.current; setLoading(true);
    try {
      const response = await fetch(`/api/barkur?${params}&offset=${offset}`, {cache:"no-store"}), data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || "Rekap belum dapat dimuat.");
      if (ticket === request.current) {setItems(data.items || []);setTotal(data.total || 0);setError("");}
    } catch (e) {if(ticket===request.current)setError(e instanceof Error?e.message:"Rekap belum dapat dimuat.");}
    finally {if(ticket===request.current)setLoading(false);}
  }, [params,offset]);
  useEffect(() => {const timer = setTimeout(()=>void load(),250); return()=>{clearTimeout(timer);request.current++;};}, [load]);
  useEffect(() => {const urls=files.map(file=>file?URL.createObjectURL(file):"");setPreviews(urls);return()=>urls.forEach(url=>URL.revokeObjectURL(url));},[files]);
  useEffect(() => {if(open&&!dialog.current?.open)dialog.current?.showModal();if(!open)dialog.current?.close();},[open]);
  useEffect(() => {if(detail&&!detailDialog.current?.open)detailDialog.current?.showModal();if(!detail)detailDialog.current?.close();},[detail]);
  const start = (record: BarkurRecord|null = null) => {
    setDetail(null);setEditing(record);recordId.current=record?.id||crypto.randomUUID();
    setForm(record?{awb:record.awb,bag_number:record.bag_number,origin:record.origin,destination:record.destination,incident_at:jakartaInput(new Date(record.incident_at)),email_sent_at:record.email_sent_at?jakartaInput(new Date(record.email_sent_at)):"",pic:record.pic,description:record.description,status:record.status,resolution:record.resolution,evidence_link:record.evidence_link}:newForm());
    setFiles(Array(BARKUR_MAX_PHOTOS).fill(null));setFormError("");setOpen(true);setMessage("");
  };
  const update = (key: keyof Form, value: string) => setForm(current=>({...current,[key]:value}));
  const filter = (setter: (value:string)=>void,value:string) => {setter(value);setOffset(0);};
  const chooseEvidence = (index: number, file: File|null) => {
    if(file && !["image/png","image/jpeg","image/webp"].includes(file.type)){setFormError("Pilih foto JPG, PNG, atau WebP.");return;}
    const next = files.map((current,i)=>i===index?file:current);
    if(next.reduce((sum,item)=>sum+(item?.size||0),0)>BARKUR_MAX_UPLOAD_BYTES){setFormError("Total foto baru maksimal 3 MB. Pilih gambar berukuran lebih kecil.");return;}
    setFiles(next);setFormError("");
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if(lock.current)return;lock.current=true;setBusy(true);setFormError("");
    try {
      const data = new FormData();Object.entries(form).forEach(([key,value])=>data.append(key,value));data.append("id",recordId.current);data.append("action",editing?"update":"create");if(editing)data.append("updated_at",editing.updated_at);files.forEach(file=>{if(file)data.append("evidence",file);});
      const response=await fetch("/api/barkur",{method:"POST",body:data}), result=await response.json();
      if(!response.ok||!result.ok)throw new Error(result.error||"Catatan belum berhasil disimpan.");
      setOpen(false);setFiles(Array(BARKUR_MAX_PHOTOS).fill(null));setMessage(editing?"Catatan BARKUR berhasil diperbarui.":"Catatan BARKUR dan bukti berhasil disimpan.");void load();
    }catch(e){setFormError(e instanceof Error?e.message:"Koneksi terputus. Isian tetap tersedia, silakan coba lagi.");}
    finally{lock.current=false;setBusy(false);}
  };
  const download = async () => {
    if(exporting)return;setExporting(true);setError("");
    try{const response=await fetch(`/api/barkur?type=export&${params}`,{cache:"no-store"});if(!response.ok){const data=await response.json();throw new Error(data.error||"Unduh gagal.");}const url=URL.createObjectURL(await response.blob()),a=document.createElement("a");a.href=url;a.download=`rekap-barkur-${from||"semua"}-${to||"tanggal"}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setMessage("Rekap sesuai filter berhasil diunduh.");}catch(e){setError(e instanceof Error?e.message:"Unduh gagal.");}finally{setExporting(false);}
  };
  return <section className="barkur-panel">
    <header className="section-head"><div><div className="eyebrow">MONITORING OTS · ARSIP BUKTI</div><h1 className="headline">Rekap BARKUR</h1><p className="subtitle">Barang kurang isi bag. Telusuri AWB dan temukan bukti email ke origin dalam satu tempat.</p></div><div className="actions"><button type="button" className="btn" disabled={exporting||loading||!!error} onClick={()=>void download()}><Download size={16}/>{exporting?"Mengunduh…":"Unduh rekap"}</button><button type="button" className="primary" onClick={()=>start()}><Plus size={16}/>Catat BARKUR</button></div></header>
    <div className="barkur-card">
      <div className="barkur-toolbar"><label className="search"><Search size={17}/><input aria-label="Cari rekap BARKUR" value={q} onChange={e=>filter(setQ,e.target.value)} placeholder="Cari AWB, nomor bag, origin, atau PIC…"/></label><label>Status<select value={status} onChange={e=>filter(setStatus,e.target.value)}><option value="">Semua status</option>{Object.entries(BARKUR_STATUSES).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label>Kejadian dari<input type="date" value={from} onChange={e=>filter(setFrom,e.target.value)}/></label><label>Sampai<input type="date" value={to} onChange={e=>filter(setTo,e.target.value)}/></label><button className="btn" type="button" onClick={()=>{setQ("");setStatus("");setFrom("");setTo("");setOffset(0);}}>Reset</button></div>
      {message&&<div className="barkur-notice success" role="status">{message}</div>}
      {error?<div className="barkur-empty" role="alert">{error}<button className="btn" onClick={()=>void load()}>Coba lagi</button></div>:loading?<div className="barkur-empty" role="status"><Loader2 size={22}/>Memuat rekap BARKUR…</div>:!items.length?<div className="barkur-empty"><PackageSearch size={32}/><strong>Belum ada rekap yang cocok</strong><span>Catat kejadian baru atau sesuaikan pencarian dan tanggal.</span></div>:<div className="table-wrap"><table className="barkur-table"><thead><tr>{["AWB / Nomor Bag","Origin → Penerima","Kejadian / Email (WIB)","PIC","Status","Bukti / Detail"].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{items.map(row=><tr key={row.id}><td><strong>{row.awb}</strong><small>Bag {row.bag_number}</small></td><td><strong>{row.origin}</strong><small>→ {row.destination}</small></td><td><span>{displayTime(row.incident_at)}</span><small>Email: {displayTime(row.email_sent_at)}</small></td><td>{row.pic}</td><td><span className={`barkur-badge ${row.status}`}>{BARKUR_STATUSES[row.status]}</span></td><td><button className="barkur-detail-button" onClick={()=>setDetail(row)}><Paperclip size={15}/>{row.evidence.length+(row.evidence_link?1:0)} bukti<ArrowUpRight size={14}/></button></td></tr>)}</tbody></table></div>}
      <footer className="barkur-pagination"><span>{loading||error?"—":`${total} catatan · ${items.length?offset+1:0}–${offset+items.length}`}</span><div><button className="btn" disabled={offset===0||loading} onClick={()=>setOffset(n=>Math.max(0,n-25))}>Sebelumnya</button><button className="btn" disabled={offset+25>=total||loading} onClick={()=>setOffset(n=>n+25)}>Berikutnya</button></div></footer>
    </div>
    <dialog ref={dialog} className="barkur-dialog" onCancel={e=>{e.preventDefault();if(!lock.current)setOpen(false);}}><form onSubmit={save}><header><div><small>MONITORING OTS</small><h2>{editing?"Perbarui BARKUR":"Catat BARKUR"}</h2><p>Waktu kejadian dan email menggunakan WIB.</p></div><button type="button" className="icon-btn" aria-label="Tutup form" disabled={busy} onClick={()=>setOpen(false)}><X size={20}/></button></header><fieldset disabled={busy}><div className="barkur-form-grid">
      {([['awb','Nomor AWB',80],['bag_number','Nomor bag',100],['origin','Origin pengirim',160],['destination','Unit penerima',160]] as const).map(([key,label,max])=><label key={key}>{label} *<input autoFocus={key==='awb'} required maxLength={max} value={form[key]} onChange={e=>update(key,e.target.value)}/></label>)}
      <label>Waktu kekurangan diketahui *<input type="datetime-local" required value={form.incident_at} onChange={e=>update("incident_at",e.target.value)}/></label><label>Waktu email dikirim<input type="datetime-local" min={form.incident_at} value={form.email_sent_at} onChange={e=>update("email_sent_at",e.target.value)}/></label>
      <label>PIC tindak lanjut *<input required maxLength={160} value={form.pic} onChange={e=>update("pic",e.target.value)}/></label><label>Status<select value={form.status} onChange={e=>update("status",e.target.value)}>{Object.entries(BARKUR_STATUSES).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
    </div><label>Uraian kekurangan<textarea rows={3} maxLength={10000} value={form.description} onChange={e=>update("description",e.target.value)} placeholder="Catat kondisi bag dan kiriman yang tidak ditemukan."/></label><label>Hasil penelusuran / tindak lanjut {form.status==='completed'?'*':''}<textarea rows={3} required={form.status==='completed'} maxLength={10000} value={form.resolution} onChange={e=>update("resolution",e.target.value)}/></label>
      <div className="barkur-evidence-box">
        <strong><Paperclip size={16}/> Foto bukti</strong><small>Tambahkan hingga 4 foto. Total unggahan baru maksimal 3 MB (JPG, PNG, WebP).</small>
        <div className="barkur-photo-slots">{Array.from({length:BARKUR_MAX_PHOTOS},(_,index)=>{
          const saved=editing?.evidence[index], fileIndex=index-(editing?.evidence.length||0);
          return saved?<a className="barkur-photo-slot saved" key={index} href={saved.url} target="_blank" rel="noopener noreferrer"><img src={saved.url} alt={`Bukti ${index+1}`} loading="lazy"/><strong>Foto {index+1}</strong><small>Tersimpan · Buka foto</small></a>:<div className="barkur-photo-slot" key={index}>
            <label><strong>Foto {index+1}</strong>{previews[fileIndex]?<img src={previews[fileIndex]} alt={`Preview bukti ${index+1}`}/>:<span className="barkur-photo-placeholder"><Plus size={24}/>Pilih foto</span>}<input type="file" aria-label={`Pilih foto bukti ${index+1}`} accept="image/png,image/jpeg,image/webp" onChange={e=>{const file=e.target.files?.[0];if(file)chooseEvidence(fileIndex,file);e.target.value="";}}/><small>{files[fileIndex]?.name||"Belum dipilih"}</small></label>
            {files[fileIndex]&&<button type="button" className="btn" onClick={()=>chooseEvidence(fileIndex,null)}>Batalkan foto</button>}
          </div>;
        })}</div>
        <label>Link Google Drive (bukti lama)<input type="url" maxLength={2048} placeholder="https://drive.google.com/…" value={form.evidence_link} onChange={e=>update("evidence_link",e.target.value)}/><small>Akses link lama tetap mengikuti izin berbagi Google Drive.</small></label>
      </div>
    </fieldset>{formError&&<div className="barkur-notice" role="alert">{formError}</div>}<footer><button className="btn" type="button" disabled={busy} onClick={()=>setOpen(false)}>Batal</button><button className="primary" type="submit" disabled={busy}>{busy?<><Loader2 size={16}/>Menyimpan…</>:"Simpan catatan"}</button></footer></form></dialog>
    <dialog ref={detailDialog} className="barkur-dialog" onCancel={()=>setDetail(null)}>{detail&&<><header><div><small>DETAIL BARKUR</small><h2>{detail.awb}</h2><span className={`barkur-badge ${detail.status}`}>{BARKUR_STATUSES[detail.status]}</span></div><button type="button" className="icon-btn" aria-label="Tutup detail" onClick={()=>setDetail(null)}><X size={20}/></button></header><dl className="barkur-details">{[["Nomor bag",detail.bag_number],["Origin",detail.origin],["Unit penerima",detail.destination],["PIC",detail.pic],["Kekurangan diketahui (WIB)",displayTime(detail.incident_at)],["Email dikirim (WIB)",displayTime(detail.email_sent_at)],["Selisih kejadian ke email",emailDelay(detail)],["Dicatat oleh",detail.created_by],["Terakhir diperbarui (WIB)",displayTime(detail.updated_at)]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p className="barkur-muted">Selisih waktu bersifat informatif, belum menjadi penilaian SLA 3 jam.</p><h3>Uraian kekurangan</h3><p className="barkur-text">{detail.description||"Belum dicatat."}</p><h3>Hasil penelusuran</h3><p className="barkur-text">{detail.resolution||"Belum dicatat."}</p><EvidenceShareControls kind="barkur" id={detail.id}/><h3>Bukti email</h3><p className="barkur-muted">Foto di bawah merupakan galeri internal. Gunakan link publik untuk membagikan bukti tanpa login.</p><div className="barkur-evidence-links">{detail.evidence.map((item,index)=><a key={item.url} href={item.url} target="_blank" rel="noopener noreferrer"><img src={item.url} alt={`Foto bukti ${index+1}`} loading="lazy"/><span>{item.name||`Bukti ${index+1}`}</span><ArrowUpRight size={16}/></a>)}{detail.evidence_link&&<a href={detail.evidence_link} target="_blank" rel="noopener noreferrer"><Paperclip size={16}/>Buka bukti Google Drive<ArrowUpRight size={16}/></a>}{!detail.evidence.length&&!detail.evidence_link&&<p>Belum ada bukti terlampir.</p>}</div><footer><button className="btn" onClick={()=>setDetail(null)}>Tutup</button><button className="primary" onClick={()=>start(detail)}><Pencil size={16}/>Edit catatan</button></footer></>}</dialog>
  </section>;
}
