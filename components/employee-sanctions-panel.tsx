"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { PersonPicker } from "./person-picker";
import { visiblePoll } from "@/lib/visible-poll";
import { prepareCourierPhoto } from "@/lib/courier-photo";
import { idleUpload, uploadReport } from "@/lib/report-upload";
import { ReportUploadStatus } from "./report-upload-status";
import { EmployeeSanction, SANCTION_KINDS, SanctionEmployee, SanctionKind } from "@/lib/employee-sanctions";
import "./team-transfer.css";
import "./employee-sanctions.css";
const blank = () => ({ id: crypto.randomUUID(), employee_nik: "", kind: "" as SanctionKind | "", incident_date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()), description: "", coaching_result: "", updated_at: "" });
export function EmployeeSanctionsPanel({ admin = false }: { admin?: boolean }) {
  const [recorderName,setRecorderName] = useState("");
  const [photos,setPhotos]=useState<File[]>([]),[previews,setPreviews]=useState<string[]>([]),[processing,setProcessing]=useState(false),[upload,setUpload]=useState(idleUpload);
  const processingLock=useRef(false);
  useEffect(()=>{const urls=photos.map(file=>URL.createObjectURL(file));setPreviews(urls);return()=>urls.forEach(url=>URL.revokeObjectURL(url))},[photos]);
  const [people,setPeople] = useState<SanctionEmployee[]>([]), [items,setItems] = useState<EmployeeSanction[]>([]);
  const [form,setForm] = useState(blank), [editing,setEditing] = useState<EmployeeSanction|null>(null), [show,setShow] = useState(!admin);
  const [q,setQ] = useState(""), [search,setSearch] = useState(""), [kind,setKind] = useState(""), [offset,setOffset] = useState(0), [more,setMore] = useState(false);
  const [loading,setLoading] = useState(true), [peopleLoading,setPeopleLoading] = useState(true), [peopleError,setPeopleError] = useState(""), [error,setError] = useState(""), [saveError,setSaveError] = useState(""), [notice,setNotice] = useState(""), [saving,setSaving] = useState(false);
  const scope = admin ? "admin" : "mine", lock = useRef(false), sequence = useRef(0), formTop = useRef<HTMLDivElement>(null);
  const selected = editing ? { nik: editing.employee_nik, name: editing.employee_name, position: editing.position, hub: editing.hub, superior: editing.superior_name } : people.find(person => person.nik === form.employee_nik);
  useEffect(()=>{const t=setTimeout(()=>{setSearch(q);setOffset(0)},300);return()=>clearTimeout(t)},[q]);
  useEffect(()=>{const c=new AbortController();setPeopleLoading(true);fetch(`/api/employee-sanctions?scope=${scope}&type=employees`,{cache:"no-store",signal:c.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||"Data karyawan belum tersedia.");setPeople(d.items||[]);setRecorderName(d.recorder_name||"");setPeopleError("")}).catch(e=>{if(!c.signal.aborted)setPeopleError(e.message)}).finally(()=>{if(!c.signal.aborted)setPeopleLoading(false)});return()=>c.abort()},[scope]);
  const load=useCallback(async()=>{
    if (!admin) return;
    const ticket=++sequence.current;setLoading(true);
    try{const p=new URLSearchParams({scope,q:search,kind,offset:String(offset)});const r=await fetch(`/api/employee-sanctions?${p}`,{cache:"no-store"}),d=await r.json();if(ticket!==sequence.current)return;if(!r.ok)throw Error(d.error||"Catatan belum tersedia.");setItems(d.items||[]);setMore(!!d.has_more);setError("")}catch(e){if(ticket===sequence.current)setError(e instanceof Error?e.message:"Periksa koneksi Anda.")}finally{if(ticket===sequence.current)setLoading(false)}
  },[admin,scope,search,kind,offset]);
  useEffect(()=>{if(!admin)return;const stop=visiblePoll(async()=>{if(!lock.current)await load()});return()=>{sequence.current++;stop()}},[admin,load]);
  const start=(record:EmployeeSanction|null)=>{if(lock.current||processingLock.current)return;setPhotos([]);setUpload(idleUpload);setEditing(record);setForm(record?{id:record.id,employee_nik:record.employee_nik,kind:record.kind,incident_date:record.incident_date,description:record.description,coaching_result:record.coaching_result,updated_at:record.updated_at}:blank());setShow(true);setNotice("");setSaveError("");setTimeout(()=>formTop.current?.scrollIntoView({block:"start",behavior:"smooth"}),0)};
  async function pickPhotos(files:File[]){
    if(lock.current||processingLock.current||!files.length)return;
    if(photos.length+(editing?.photos?.length||0)+files.length>3){setSaveError("Maksimal 3 foto bukti.");return;}
    processingLock.current=true;setProcessing(true);setSaveError("");setUpload(idleUpload);
    try{const prepared:File[]=[];for(const file of files)prepared.push(await prepareCourierPhoto(file));setPhotos(current=>[...current,...prepared]);}
    catch(error){setSaveError(error instanceof Error?error.message:"Foto belum dapat diproses.");}
    finally{processingLock.current=false;setProcessing(false);}
  }
  async function submit(e:React.FormEvent){
    e.preventDefault();if(lock.current||processingLock.current)return;if(!selected||!form.kind){setSaveError("Pilih jenis catatan dan karyawan.");return;}
    if(photos.length+(editing?.photos?.length||0)<1){setSaveError("Tambahkan minimal 1 foto bukti.");return;}
    lock.current=true;setSaving(true);setSaveError("");setNotice("");
    try{const data=new FormData();for(const [key,value]of Object.entries({...form,scope,action:editing?"update":"create"}))data.set(key,String(value));for(const file of photos)data.append("photos",file);await uploadReport("/api/employee-sanctions",data,setUpload);setNotice(editing?"Perubahan berhasil disimpan.":"Catatan dan bukti berhasil disimpan.");setPhotos([]);setForm(blank());setEditing(null);if(admin)setShow(false);await load();}catch(e){setSaveError(e instanceof Error?e.message:"Penyimpanan belum terkonfirmasi. Coba kembali dengan form yang sama.")}finally{lock.current=false;setSaving(false)}
  }
  return <section className={`sanctions-module ${admin?"sanctions-admin":"sanctions-pwa"}`}>
    <div className="section-head"><div><div className="eyebrow">PEMBINAAN KARYAWAN</div><h1 className="headline">Sanksi & Coaching</h1><p className="subtitle">{admin?"Kelola catatan pembinaan dan tindak lanjut karyawan.":"Catat pembinaan karyawan dalam tim Anda."}</p></div>{admin&&<button type="button" className="primary" disabled={saving||processing} onClick={()=>start(null)}>Tambah catatan</button>}</div>
    <div ref={formTop} className="sanctions-form-anchor"/>
    {show&&<form className={admin?"card sanctions-form":"mobile-card pwa-form sanctions-form"} onSubmit={submit}>
      <h2>{editing?"Edit catatan":"Catat pembinaan karyawan"}</h2><fieldset disabled={saving||processing}>
      <div className="sanctions-kind-picker" role="group" aria-label="Jenis catatan">{Object.entries(SANCTION_KINDS).map(([value,label])=><button key={value} type="button" aria-pressed={form.kind===value} onClick={()=>setForm(f=>({...f,kind:value as SanctionKind}))}>{label}</button>)}</div>
      {form.kind==="hc_ga"&&<p className="sanctions-hint">Rujukan tindak lanjut HC/GA, bukan tingkat sanksi.</p>}
      {peopleLoading&&<p role="status">Memuat pilihan karyawan…</p>}{peopleError&&<p className="sanctions-error" role="alert">{peopleError}</p>}
      <PersonPicker label="Nama karyawan" placeholder="Cari nama atau NIK lalu pilih" items={editing&&selected?[selected]:people} value={form.employee_nik} disabled={saving||peopleLoading||!!editing||!!peopleError} onChange={nik=>setForm(f=>({...f,employee_nik:nik}))}/>
      <div className="sanctions-fields"><label>NIK<input readOnly value={selected?.nik||""}/></label><label>Jabatan<input readOnly value={selected?.position||""}/></label><label>Atasan<input readOnly value={selected?.superior||""}/></label><label>Tanggal<input type="date" required value={form.incident_date} onChange={e=>setForm(f=>({...f,incident_date:e.target.value}))}/></label></div>
      <label>Keterangan<textarea required rows={4} maxLength={10000} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}/></label>
      <label>Pemberi coaching / sanksi<input readOnly value={(editing?editing.recorder_name:recorderName)||"Belum terhubung"}/></label>
      <label>Hasil coaching{form.kind==="coaching"?" *":""}<textarea required={form.kind==="coaching"} rows={4} maxLength={10000} value={form.coaching_result} onChange={e=>setForm(f=>({...f,coaching_result:e.target.value}))}/></label>
      <div className="sanctions-evidence"><h3>Bukti coaching / sanksi *</h3><p>Foto dokumen tertulis atau kegiatan coaching. Minimal 1, maksimal 3 foto.</p>
      <div className="sanctions-photo-actions"><label className="btn">Ambil foto<input type="file" accept="image/*" capture="environment" disabled={saving||processing||photos.length+(editing?.photos?.length||0)>=3} onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value="";void pickPhotos(files)}}/></label><label className="btn">Pilih dari galeri<input type="file" accept="image/*" multiple disabled={saving||processing||photos.length+(editing?.photos?.length||0)>=3} onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value="";void pickPhotos(files)}}/></label></div>
      {processing&&<p role="status">Menyiapkan foto…</p>}<div className="sanctions-photo-grid">{editing?.photos?.map((photo,index)=><a key={photo.url} href={photo.url} target="_blank" rel="noopener noreferrer"><img src={photo.url} alt={`Bukti tersimpan ${index+1}`} loading="lazy"/></a>)}{previews.map((url,index)=><div key={url}><img src={url} alt={`Bukti baru ${index+1}`}/><button type="button" disabled={saving||processing} onClick={()=>setPhotos(current=>current.filter((_,i)=>i!==index))}>Hapus</button></div>)}</div><small>{photos.length+(editing?.photos?.length||0)} dari 3 foto</small></div>
      </fieldset><div className="sanctions-actions"><button className={admin?"primary":"mobile-submit"} disabled={saving||processing||!selected||!form.kind||peopleLoading||!!peopleError}>{saving?"Menyimpan…":"Simpan catatan"}</button>{admin&&<button type="button" className="btn" disabled={saving||processing} onClick={()=>{setShow(false);setEditing(null);setSaveError("")}}>Batal</button>}</div><ReportUploadStatus value={upload}/>{saveError&&<p className="sanctions-error" role="alert">{saveError}</p>}
    </form>}
    {notice&&<p className="sanctions-success" role="status">{notice}</p>}
    {admin&&<div className="card sanctions-list"><header><h2>Rekap Sanksi & Coaching</h2><div className="sanctions-filters"><label>Cari nama<input type="search" value={q} onChange={e=>setQ(e.target.value)} placeholder="Nama karyawan"/></label><label>Jenis catatan<select value={kind} onChange={e=>{setKind(e.target.value);setOffset(0)}}><option value="">Semua jenis</option>{Object.entries(SANCTION_KINDS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><button type="button" className="btn" disabled={loading||saving} onClick={()=>void load()}>Muat ulang</button></div></header>
    {error?<p className="sanctions-error" role="alert">{error}</p>:loading?<p role="status">Memuat catatan…</p>:!items.length?<p>Belum ada catatan pada pilihan ini.</p>:<div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Nama</th><th>NIK</th><th>Jabatan</th><th>Atasan</th><th>Jenis Sanksi / Tindak Lanjut</th><th>Keterangan</th><th>Hasil Coaching</th><th>Pemberi Coaching / Sanksi</th><th>Bukti</th>{admin&&<th>Aksi</th>}</tr></thead><tbody>{items.map(item=><tr key={item.id}><td>{item.incident_date}</td><td>{item.employee_name}</td><td>{item.employee_nik}</td><td>{item.position||"—"}</td><td>{item.superior_name||"—"}</td><td>{SANCTION_KINDS[item.kind]}</td><td className="sanctions-text">{item.description}</td><td className="sanctions-text">{item.coaching_result||"—"}</td><td>{item.recorder_name||"Belum terhubung"}</td><td><div className="sanctions-photo-grid">{item.photos?.map((photo,index)=><a key={photo.url} href={photo.url} target="_blank" rel="noopener noreferrer"><img src={photo.url} alt={`Bukti ${index+1}`} loading="lazy"/></a>)}</div>{!item.photos?.length&&"Belum ada bukti"}</td>{admin&&<td><button className="btn" disabled={saving||processing} onClick={()=>start(item)}>Edit</button></td>}</tr>)}</tbody></table></div>}
    <footer><button type="button" className="btn" disabled={!offset||loading||saving} onClick={()=>setOffset(n=>Math.max(0,n-50))}>Sebelumnya</button><span>Halaman {Math.floor(offset/50)+1}</span><button type="button" className="btn" disabled={!more||loading||saving} onClick={()=>setOffset(n=>n+50)}>Berikutnya</button></footer></div>}
  </section>;
}
