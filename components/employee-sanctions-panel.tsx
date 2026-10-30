"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { VIOLATION_TYPES,emptySanction } from "@/lib/sanction-form";
import { employeeEmployment,EMPLOYMENT_LABELS } from "@/lib/employee-employment";
import { COACHING_FIELDS,emptyCoaching } from "@/lib/coaching-workflow";
import { MySanctionDocuments,SanctionDocumentActions } from "./sanction-document-actions";
import { fetchSanctionRecap, RECAP_HEADERS, sanctionRecapRows } from "@/lib/sanction-recap";
import { PersonPicker } from "./person-picker";
import { visiblePoll } from "@/lib/visible-poll";
import { prepareCourierPhoto } from "@/lib/courier-photo";
import { idleUpload, uploadReport } from "@/lib/report-upload";
import { ReportUploadStatus } from "./report-upload-status";
import { EmployeeSanction, SANCTION_KINDS, SanctionEmployee, SanctionKind } from "@/lib/employee-sanctions";
import "./team-transfer.css";
import "./employee-sanctions.css";
const blank = () => ({ id: crypto.randomUUID(), employee_nik: "", kind: "" as SanctionKind | "", incident_date: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()), description: "", coaching_result: "", updated_at: "",coaching_details:emptyCoaching(),sanction_details:emptySanction() });
export function EmployeeSanctionsPanel({ admin = false }: { admin?: boolean }) {
  const [documentRevision,setDocumentRevision]=useState(0);
  const [exporting,setExporting]=useState(false);
  const exportLock=useRef(false);
  const [recorderName,setRecorderName] = useState("");
  const [photos,setPhotos]=useState<File[]>([]),[previews,setPreviews]=useState<string[]>([]),[processing,setProcessing]=useState(false),[upload,setUpload]=useState(idleUpload);
  const processingLock=useRef(false);
  useEffect(()=>{const urls=photos.map(file=>URL.createObjectURL(file));setPreviews(urls);return()=>urls.forEach(url=>URL.revokeObjectURL(url))},[photos]);
  const [people,setPeople] = useState<SanctionEmployee[]>([]), [items,setItems] = useState<EmployeeSanction[]>([]);
  const [form,setForm] = useState(blank), [editing,setEditing] = useState<EmployeeSanction|null>(null), [show,setShow] = useState(!admin);
  const [q,setQ] = useState(""), [search,setSearch] = useState(""), [kind,setKind] = useState(""), [offset,setOffset] = useState(0), [more,setMore] = useState(false);
  const [loading,setLoading] = useState(true), [peopleLoading,setPeopleLoading] = useState(true), [peopleError,setPeopleError] = useState(""), [error,setError] = useState(""), [saveError,setSaveError] = useState(""), [notice,setNotice] = useState(""), [saving,setSaving] = useState(false);
  const scope = admin ? "admin" : "mine", lock = useRef(false), sequence = useRef(0), formTop = useRef<HTMLDivElement>(null);
  const selected = editing ? { nik: editing.employee_nik, name: editing.employee_name, position: editing.position, hub: editing.hub, superior: editing.superior_name,dept:editing.sanction_details?.department,employment:editing.sanction_details?.employment_status } : people.find(person => person.nik === form.employee_nik);
  useEffect(()=>{const t=setTimeout(()=>{setSearch(q);setOffset(0)},300);return()=>clearTimeout(t)},[q]);
  useEffect(()=>{const c=new AbortController();setPeopleLoading(true);fetch(`/api/employee-sanctions?scope=${scope}&type=employees`,{cache:"no-store",signal:c.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||"Data karyawan belum tersedia.");setPeople(d.items||[]);setRecorderName(d.recorder_name||"");setPeopleError("")}).catch(e=>{if(!c.signal.aborted)setPeopleError(e.message)}).finally(()=>{if(!c.signal.aborted)setPeopleLoading(false)});return()=>c.abort()},[scope]);
  const load=useCallback(async()=>{
    if (!admin) return;
    const ticket=++sequence.current;setLoading(true);
    try{const p=new URLSearchParams({scope,q:search,kind,offset:String(offset)});const r=await fetch(`/api/employee-sanctions?${p}`,{cache:"no-store"}),d=await r.json();if(ticket!==sequence.current)return;if(!r.ok)throw Error(d.error||"Catatan belum tersedia.");setItems(d.items||[]);setMore(!!d.has_more);setError("")}catch(e){if(ticket===sequence.current)setError(e instanceof Error?e.message:"Periksa koneksi Anda.")}finally{if(ticket===sequence.current)setLoading(false)}
  },[admin,scope,search,kind,offset]);
  useEffect(()=>{if(!admin)return;const stop=visiblePoll(async()=>{if(!lock.current)await load()});return()=>{sequence.current++;stop()}},[admin,load]);
  const start=(record:EmployeeSanction|null)=>{if(lock.current||processingLock.current)return;setPhotos([]);setUpload(idleUpload);setEditing(record);setForm(record?{id:record.id,employee_nik:record.employee_nik,kind:record.kind,incident_date:record.incident_date,description:record.description,coaching_result:record.coaching_result,updated_at:record.updated_at,coaching_details:{...emptyCoaching(),...record.coaching_details},sanction_details:{...emptySanction(),...record.sanction_details}}:blank());setShow(true);setNotice("");setSaveError("");setTimeout(()=>formTop.current?.scrollIntoView({block:"start",behavior:"smooth"}),0)};
  async function downloadRecap(){
    if(exportLock.current)return;exportLock.current=true;setExporting(true);setError("");setNotice("");
    try{
      const rows=await fetchSanctionRecap(q.trim(),kind);
      if(!rows.length)throw Error("Tidak ada catatan pada filter ini untuk diunduh.");
      const XLSX=await import("xlsx"),now=new Date(),stamp=now.toLocaleString("id-ID",{timeZone:"Asia/Jakarta"});
      const sheet=XLSX.utils.aoa_to_sheet([["REKAP SANKSI DAN COACHING"],[`Diperbarui: ${stamp} WIB`],[`Jenis: ${kind?SANCTION_KINDS[kind as SanctionKind]:"Semua"} | Pencarian: ${q.trim()||"Semua"} | ${rows.length} catatan`],[],RECAP_HEADERS,...sanctionRecapRows(rows)]);
      sheet["!merges"]=[0,1,2].map(r=>({s:{r,c:0},e:{r,c:RECAP_HEADERS.length-1}}));
      sheet["!cols"]=RECAP_HEADERS.map((_,i)=>({wch:[8,14,28,20,28,28,20,22,60,60,28,32,24,14,18,16,...Array(7).fill(55),40,40,28,24,22,24,28,28,55][i]||25}));
      sheet["!autofilter"]={ref:`A5:${XLSX.utils.encode_col(RECAP_HEADERS.length-1)}${rows.length+5}`};
      const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,"Sanksi dan Coaching");
      XLSX.writeFile(book,`rekap-sanksi-coaching-${new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jakarta"}).format(now)}.xlsx`);
      setNotice(`${rows.length} catatan berhasil diunduh.`);
    }catch(e){setError(e instanceof Error?e.message:"Unduhan gagal. Silakan coba kembali.");}finally{exportLock.current=false;setExporting(false);}
  }
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
    try{const data=new FormData();for(const [key,value]of Object.entries({...form,scope,action:editing?"update":"create"}))data.set(key,typeof value==="object"?JSON.stringify(value):String(value));for(const file of photos)data.append("photos",file);await uploadReport("/api/employee-sanctions",data,setUpload);setNotice(editing?"Perubahan berhasil disimpan.":"Catatan dan bukti berhasil disimpan.");setPhotos([]);setForm(blank());setEditing(null);setDocumentRevision(v=>v+1);if(admin)setShow(false);await load();}catch(e){setSaveError(e instanceof Error?e.message:"Penyimpanan belum terkonfirmasi. Coba kembali dengan form yang sama.")}finally{lock.current=false;setSaving(false)}
  }
  return <section className={`sanctions-module ${admin?"sanctions-admin":"sanctions-pwa"}`}>
    <div className="section-head"><div><div className="eyebrow">PEMBINAAN KARYAWAN</div><h1 className="headline">Sanksi & Coaching</h1><p className="subtitle">{admin?"Kelola catatan pembinaan dan tindak lanjut karyawan.":"Catat pembinaan karyawan dalam tim Anda."}</p></div>{admin&&<div className="sanctions-actions"><button type="button" className="btn" disabled={exporting||saving||processing} onClick={()=>void downloadRecap()}>{exporting?"Mengunduh…":"Unduh rekap"}</button><button type="button" className="primary" disabled={saving||processing} onClick={()=>start(null)}>Tambah catatan</button></div>}</div>
    <div ref={formTop} className="sanctions-form-anchor"/>
    {show&&<form className={admin?"card sanctions-form":"mobile-card pwa-form sanctions-form"} onSubmit={submit}>
      <h2>{editing?"Edit catatan":"Catat pembinaan karyawan"}</h2><fieldset disabled={saving||processing}>
      <div className="sanctions-kind-picker" role="group" aria-label="Jenis catatan">{Object.entries(SANCTION_KINDS).map(([value,label])=><button key={value} type="button" aria-pressed={form.kind===value} onClick={()=>setForm(f=>({...f,kind:value as SanctionKind}))}>{label}</button>)}</div>
      {form.kind==="hc_ga"&&<p className="sanctions-hint">GA dicatat sebagai pengajuan Perjanjian Bersama.</p>}
      {peopleLoading&&<p role="status">Memuat pilihan karyawan…</p>}{peopleError&&<p className="sanctions-error" role="alert">{peopleError}</p>}
      <PersonPicker label="Nama karyawan" placeholder="Cari nama atau NIK lalu pilih" items={editing&&selected?[selected]:people} value={form.employee_nik} disabled={saving||peopleLoading||!!editing||!!peopleError} onChange={nik=>setForm(f=>({...f,employee_nik:nik}))}/>
      <div className="sanctions-fields"><label>NIK<input readOnly value={selected?.nik||""}/></label><label>Jabatan<input readOnly value={selected?.position||""}/></label><label>Atasan<input readOnly value={selected?.superior||""}/></label><label>Tanggal<input type="date" required value={form.incident_date} onChange={e=>setForm(f=>({...f,incident_date:e.target.value}))}/></label></div>
      {form.kind&&form.kind!=="coaching"&&<section className="sanction-application-fields"><h3>Formulir permintaan pemberian sanksi</h3><div className="sanctions-fields"><label>Departement<input readOnly value={editing?.sanction_details?.department||selected?.dept||""}/></label><label>Status kepegawaian<input readOnly value={editing?.sanction_details?.employment_status||(selected?EMPLOYMENT_LABELS[employeeEmployment(selected)]:"")}/></label><label>Tanggal Kontrak/Tetap<input type="date" value={form.sanction_details.contract_date} onChange={e=>setForm(f=>({...f,sanction_details:{...f.sanction_details,contract_date:e.target.value}}))}/></label><label>Lokasi pengajuan<input required maxLength={250} value={form.sanction_details.location} onChange={e=>setForm(f=>({...f,sanction_details:{...f.sanction_details,location:e.target.value}}))}/></label></div><h4>Jenis pelanggaran *</h4><div className="sanction-violation-grid">{Object.entries(VIOLATION_TYPES).map(([key,label])=><label key={key}><input type="checkbox" checked={form.sanction_details.violations.includes(key)} onChange={e=>setForm(f=>({...f,sanction_details:{...f.sanction_details,violations:e.target.checked?[...f.sanction_details.violations,key]:f.sanction_details.violations.filter(value=>value!==key)}}))}/>{label}</label>)}</div>{form.sanction_details.violations.includes("other")&&<label>Keterangan lain-lain<input required maxLength={250} value={form.sanction_details.other_violation} onChange={e=>setForm(f=>({...f,sanction_details:{...f.sanction_details,other_violation:e.target.value}}))}/></label>}<div className="sanctions-fields"><label>Nama Atasan Terkait 1<input maxLength={250} value={form.sanction_details.approver_one} onChange={e=>setForm(f=>({...f,sanction_details:{...f.sanction_details,approver_one:e.target.value}}))}/></label><label>Nama Atasan Terkait 2<input maxLength={250} value={form.sanction_details.approver_two} onChange={e=>setForm(f=>({...f,sanction_details:{...f.sanction_details,approver_two:e.target.value}}))}/></label></div>{admin&&<label>Catatan HCO<textarea rows={3} maxLength={4000} value={form.sanction_details.hco_notes} onChange={e=>setForm(f=>({...f,sanction_details:{...f.sanction_details,hco_notes:e.target.value}}))}/></label>}</section>}
      {form.kind!=="coaching"&&<label>Alasan pemberian sanksi *<textarea required rows={4} maxLength={10000} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}/></label>}
      <label>Pemberi coaching / sanksi<input readOnly value={(editing?editing.recorder_name:recorderName)||"Belum terhubung"}/></label>
      {form.kind!=="coaching"&&<label>Hasil pembinaan<textarea rows={4} maxLength={10000} value={form.coaching_result} onChange={e=>setForm(f=>({...f,coaching_result:e.target.value}))}/></label>}
      {form.kind==="coaching"&&<section className="coaching-session-fields"><h3>Form sesi coaching</h3><div className="sanctions-fields"><label>Waktu sesi (WIB)<input type="time" required value={form.coaching_details.session_time} onChange={e=>setForm(f=>({...f,coaching_details:{...f.coaching_details,session_time:e.target.value}}))}/></label><label>Durasi (menit)<input type="number" min={1} max={480} required value={form.coaching_details.duration_minutes} onChange={e=>setForm(f=>({...f,coaching_details:{...f.coaching_details,duration_minutes:e.target.value}}))}/></label></div>{Object.entries(COACHING_FIELDS).map(([key,label])=><label key={key}>{label}{!["support","agreement"].includes(key)?" *":""}<textarea rows={key==="action_plan"?6:3} maxLength={4000} required={!["support","agreement"].includes(key)} value={form.coaching_details[key as keyof typeof COACHING_FIELDS]} onChange={e=>setForm(f=>({...f,coaching_details:{...f.coaching_details,[key]:e.target.value}}))}/></label>)}</section>}
      <div className="sanctions-evidence"><h3>Bukti coaching / sanksi *</h3><p>Foto dokumen tertulis atau kegiatan coaching. Minimal 1, maksimal 3 foto.</p>
      <div className="sanctions-photo-actions"><label className="btn">Ambil foto<input type="file" accept="image/*" capture="environment" disabled={saving||processing||photos.length+(editing?.photos?.length||0)>=3} onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value="";void pickPhotos(files)}}/></label><label className="btn">Pilih dari galeri<input type="file" accept="image/*" multiple disabled={saving||processing||photos.length+(editing?.photos?.length||0)>=3} onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value="";void pickPhotos(files)}}/></label></div>
      {processing&&<p role="status">Menyiapkan foto…</p>}<div className="sanctions-photo-grid">{editing?.photos?.map((photo,index)=><a key={photo.url} href={photo.url} target="_blank" rel="noopener noreferrer"><img src={photo.url} alt={`Bukti tersimpan ${index+1}`} loading="lazy"/></a>)}{previews.map((url,index)=><div key={url}><img src={url} alt={`Bukti baru ${index+1}`}/><button type="button" disabled={saving||processing} onClick={()=>setPhotos(current=>current.filter((_,i)=>i!==index))}>Hapus</button></div>)}</div><small>{photos.length+(editing?.photos?.length||0)} dari 3 foto</small></div>
      </fieldset><div className="sanctions-actions"><button className={admin?"primary":"mobile-submit"} disabled={saving||processing||!selected||!form.kind||peopleLoading||!!peopleError}>{saving?"Menyimpan…":"Simpan catatan"}</button>{(admin||editing)&&<button type="button" className="btn" disabled={saving||processing} onClick={()=>{if(admin)setShow(false);setEditing(null);setForm(blank());setPhotos([]);setSaveError("")}}>Batal</button>}</div><ReportUploadStatus value={upload}/>{saveError&&<p className="sanctions-error" role="alert">{saveError}</p>}
    </form>}
    {!admin&&<MySanctionDocuments onEdit={start} revision={documentRevision}/>}
    {notice&&<p className="sanctions-success" role="status">{notice}</p>}
    {admin&&<div className="card sanctions-list"><header><h2>Rekap Sanksi & Coaching</h2><div className="sanctions-filters"><label>Cari nama<input type="search" value={q} onChange={e=>setQ(e.target.value)} placeholder="Nama karyawan"/></label><label>Jenis catatan<select value={kind} onChange={e=>{setKind(e.target.value);setOffset(0)}}><option value="">Semua jenis</option>{Object.entries(SANCTION_KINDS).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><button type="button" className="btn" disabled={loading||saving} onClick={()=>void load()}>Muat ulang</button></div></header>
    {error?<p className="sanctions-error" role="alert">{error}</p>:loading?<p role="status">Memuat catatan…</p>:!items.length?<p>Belum ada catatan pada pilihan ini.</p>:<div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Nama</th><th>NIK</th><th>Jabatan</th><th>Atasan</th><th>Jenis Sanksi / Tindak Lanjut</th><th>Keterangan</th><th>Hasil Coaching</th><th>Pemberi Coaching / Sanksi</th><th>Bukti</th><th>Dokumen dan tanda tangan</th>{admin&&<th>Aksi</th>}</tr></thead><tbody>{items.map(item=><tr key={item.id}><td>{item.incident_date}</td><td>{item.employee_name}</td><td>{item.employee_nik}</td><td>{item.position||"—"}</td><td>{item.superior_name||"—"}</td><td>{SANCTION_KINDS[item.kind]}</td><td className="sanctions-text">{item.description}</td><td className="sanctions-text">{item.coaching_result||"—"}</td><td>{item.recorder_name||"Belum terhubung"}</td><td><div className="sanctions-photo-grid">{item.photos?.map((photo,index)=><a key={photo.url} href={photo.url} target="_blank" rel="noopener noreferrer"><img src={photo.url} alt={`Bukti ${index+1}`} loading="lazy"/></a>)}</div>{!item.photos?.length&&"Belum ada bukti"}</td><td><SanctionDocumentActions record={item} scope="admin" onDone={()=>void load()}/></td>{admin&&<td><button className="btn" disabled={saving||processing||!item.can_edit} onClick={()=>start(item)}>Edit</button></td>}</tr>)}</tbody></table></div>}
    <footer><button type="button" className="btn" disabled={!offset||loading||saving} onClick={()=>setOffset(n=>Math.max(0,n-50))}>Sebelumnya</button><span>Halaman {Math.floor(offset/50)+1}</span><button type="button" className="btn" disabled={!more||loading||saving} onClick={()=>setOffset(n=>n+50)}>Berikutnya</button></footer></div>}
  </section>;
}
