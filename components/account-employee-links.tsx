"use client";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, Search } from "lucide-react";
import "./account-employee-links.css";
type Employee = { nik: string; name: string; position: string; hub: string };
type User = { email: string; role: string };
export function AccountEmployeeLinks() {
 const [employees,setEmployees]=useState<Employee[]>([]),[users,setUsers]=useState<User[]>([]);
 const [links,setLinks]=useState<Record<string,string>>({}),[drafts,setDrafts]=useState<Record<string,string>>({});
 const [open,setOpen]=useState<string|null>(null),[search,setSearch]=useState(""),[message,setMessage]=useState("");
 const [errors,setErrors]=useState<Record<string,string>>({}),[saving,setSaving]=useState<string|null>(null),[loading,setLoading]=useState(true);
 const lock=useRef(false);
 useEffect(()=>{
  const controller=new AbortController();
  Promise.all([fetch("/api/admin/employee-access",{cache:"no-store",signal:controller.signal}),fetch("/api/ops-desk?type=users",{cache:"no-store",signal:controller.signal})]).then(async([a,b])=>{
   const data=await a.json(),accounts=await b.json();
   if(!a.ok||!b.ok||data.error||accounts.error)throw new Error(data.error||accounts.error||"Data akun belum dapat dimuat.");
   setEmployees(data.employees||[]);setUsers((accounts.items||[]).filter((user:User)=>user.role!=="super_admin"));
   const mapped=Object.fromEntries((data.links||[]).map((link:{email:string;employee_nik:string})=>[link.email,link.employee_nik]));
   setLinks(mapped);setDrafts(mapped);
  }).catch(e=>{if(e.name!=="AbortError")setMessage(e.message)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});
  return()=>controller.abort();
 },[]);
 async function save(email:string){
  const nik=drafts[email];
  if(lock.current||!nik||nik===links[email])return;
  if(links[email]&&!window.confirm("Ubah identitas NIK dan cakupan struktural akun ini?"))return;
  lock.current=true;setSaving(email);setMessage("");setErrors(value=>({...value,[email]:""}));
  try{
   const response=await fetch("/api/admin/employee-access",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,nik})});
   const data=await response.json();
   if(!response.ok||!data.ok||data.link?.email!==email||data.link?.employee_nik!==nik)throw new Error(data.error||"Penyimpanan belum terkonfirmasi. Muat ulang daftar untuk memeriksa.");
   setLinks(value=>({...value,[email]:data.link.employee_nik}));
   setMessage("Tersimpan: "+email+" menggunakan NIK "+nik+". Password tetap sama.");
  }catch(e){setErrors(value=>({...value,[email]:e instanceof Error?e.message:"Server tidak dapat dihubungi."}))}
  finally{lock.current=false;setSaving(null)}
 }
 const matches=employees.filter(e=>(e.name+" "+e.nik).toLowerCase().includes(search.trim().toLowerCase()));
 return <section className="card role-list-card nik-links" aria-label="Pengaitan login NIK">
  <div className="card-head"><div><div className="card-title">Login NIK & struktur personel</div><p className="card-sub">Pilih personel pada setiap akun, cari nama atau NIK, lalu simpan. Super Admin tetap memakai email.</p></div></div>
  {message&&<p className="nik-notice" role="status">{message}</p>}
  {loading?<p className="nik-notice" role="status">Memuat pengaitan NIK…</p>:<div className="table-wrap"><table><thead><tr><th>Akun</th><th>Personel / NIK login</th><th>Status penyimpanan</th><th>Aksi</th></tr></thead><tbody>{users.map(user=>{
   const selected=employees.find(e=>e.nik===drafts[user.email]),changed=!!drafts[user.email]&&drafts[user.email]!==links[user.email],saved=!!links[user.email]&&!changed;
   return <tr key={user.email}>
    <td><strong>{user.email}</strong><small className="nik-secondary">{links[user.email]?"NIK login tersimpan: "+links[user.email]:"Belum dapat login NIK"}</small></td>
    <td className="nik-personel-cell"><button type="button" className="nik-picker-trigger" aria-label={"Personel "+user.email} aria-expanded={open===user.email} disabled={!!saving} onClick={()=>{setOpen(open===user.email?null:user.email);setSearch("")}}>
     <span>{selected?<><strong>{selected.name}</strong><small>{selected.nik} · {selected.position} · {selected.hub}</small></>:drafts[user.email]?"NIK "+drafts[user.email]+" (personel tidak aktif)":"Pilih karyawan aktif"}</span><ChevronDown size={16}/></button>
     {open===user.email&&<div className="nik-picker-panel"><label className="nik-search"><Search size={16}/><input autoFocus type="search" aria-label={"Cari nama atau NIK untuk "+user.email} placeholder="Cari nama atau NIK…" value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==="Escape")setOpen(null)}}/></label>
      <div className="nik-picker-results" aria-label="Hasil pencarian personel">{matches.map(e=><button type="button" key={e.nik} aria-pressed={drafts[user.email]===e.nik} onClick={()=>{setDrafts(value=>({...value,[user.email]:e.nik}));setErrors(value=>({...value,[user.email]:""}));setMessage("");setOpen(null)}}><strong>{e.name}</strong><small>{e.nik} · {e.position} · {e.hub}</small></button>)}{!matches.length&&<p>Tidak ada nama atau NIK yang cocok.</p>}</div>
      <button type="button" className="nik-close" onClick={()=>setOpen(null)}>Tutup pencarian</button></div>}
    </td><td><span className={"nik-status "+(errors[user.email]?"failed":saved?"saved":changed?"pending":"empty")} role="status">{saving===user.email?"Menyimpan…":errors[user.email]?"Gagal disimpan":saved?<><CheckCircle2 size={14}/> Tersimpan</>:changed?"Belum disimpan":"Belum dikaitkan"}</span>{errors[user.email]&&<p className="nik-error" role="alert">{errors[user.email]}</p>}</td>
    <td><button type="button" className="nik-save" disabled={!!saving||!changed} onClick={()=>save(user.email)}>{saving===user.email?"Menyimpan…":saved?"Tersimpan":"Simpan NIK"}</button></td>
   </tr>;
  })}</tbody></table>{!users.length&&<p className="nik-notice">Belum ada akun biasa. Buat akun dahulu lalu muat ulang daftar pengaitan.</p>}</div>}
 </section>;
}
