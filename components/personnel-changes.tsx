"use client";
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {ArrowLeftRight,Download,Search} from 'lucide-react';
import {ACTION_LABELS,personnelDiff,PersonnelChange} from '@/lib/personnel-history';
import './personnel-changes.css';
const date=(value:string)=>new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Jakarta'}).format(new Date(value));
export function PersonnelChanges(){
 const [query,setQuery]=useState(''),[action,setAction]=useState(''),[from,setFrom]=useState(''),[to,setTo]=useState('');
 const [page,setPage]=useState(0),[rows,setRows]=useState<PersonnelChange[]>([]),[more,setMore]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[exporting,setExporting]=useState(false),[notice,setNotice]=useState('');
 const filters=new URLSearchParams({q:query,action,from,to}).toString();
 useEffect(()=>{setPage(0);},[query,action,from,to]);
 useEffect(()=>{
  const controller=new AbortController();setLoading(true);setError('');
  const timer=window.setTimeout(async()=>{try{
   const response=await fetch(`/api/personnel-changes?${filters}&offset=${page*50}`,{cache:'no-store',signal:controller.signal}),data=await response.json();
   if(!response.ok)throw new Error(data.error||'Riwayat belum dapat dimuat.');
   if(!controller.signal.aborted){setRows(data.items);setMore(data.has_more);}
  }catch(e){if(!controller.signal.aborted){setRows([]);setMore(false);setError(e instanceof Error?e.message:'Riwayat belum dapat dimuat.');}}
  finally{if(!controller.signal.aborted)setLoading(false);}},250);
  return()=>{window.clearTimeout(timer);controller.abort();};
 },[filters,page]);
 const download=async()=>{if(exporting)return;setExporting(true);setNotice('');try{
  const [response,XLSX]=await Promise.all([fetch(`/api/personnel-changes?${filters}&export=1`,{cache:'no-store'}),import('xlsx')]),data=await response.json();
  if(!response.ok)throw new Error(data.error||'Laporan belum dapat diunduh.');
  if(!data.items.length)throw new Error('Tidak ada riwayat pada filter ini.');
  const output=[['Tanggal (WIB)','NIK','Nama','Jenis perubahan','Admin pengubah','Kolom','Sebelum','Sesudah'],...data.items.flatMap((row:PersonnelChange)=>{
   const diffs=personnelDiff(row);return (diffs.length?diffs:[{field:'Data lainnya',before:'',after:''}]).map(diff=>[date(row.created_at),row.employee_nik,row.employee_name,ACTION_LABELS[row.action],row.actor_email||'Tidak tercatat',diff.field,diff.before,diff.after]);
  })];
  const sheet=XLSX.utils.aoa_to_sheet(output);sheet['!cols']=[25,20,30,22,35,23,42,42].map(wch=>({wch}));sheet['!autofilter']={ref:sheet['!ref']!};
  const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'Perubahan Personel');XLSX.writeFile(book,'riwayat-perubahan-personel.xlsx');setNotice(`${data.items.length} riwayat berhasil diunduh.`);
 }catch(e){setNotice(e instanceof Error?e.message:'Unduhan gagal.');}finally{setExporting(false);}};
 return <div className="personnel-history"><div className="section-head"><div><div className="eyebrow">OPERASIONAL · PERSONAL</div><h1 className="headline">Perubahan Personel</h1><div className="subtitle">Riwayat perubahan data, struktur tim, dan status karyawan.</div></div><div className="actions"><Link className="btn" href="/master/employees">Kelola karyawan</Link><button className="btn" disabled={exporting||loading} onClick={()=>void download()}><Download size={15}/>{exporting?'Mengunduh…':'Unduh laporan'}</button></div></div>
  <div className="card personnel-history-filter"><div className="search"><Search size={16}/><input aria-label="Cari riwayat" placeholder="Cari nama, NIK, atau admin..." value={query} onChange={e=>setQuery(e.target.value)}/></div><label>Jenis perubahan<select value={action} onChange={e=>setAction(e.target.value)}><option value="">Semua perubahan</option>{Object.entries(ACTION_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label>Dari tanggal<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>Sampai tanggal<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label></div>
  {notice&&<p role="status">{notice}</p>}
  <div className="card"><div className="card-head"><div className="card-title">Riwayat perubahan</div><span className="card-sub">{loading?'Memuat…':`${rows.length} riwayat ditampilkan`}</span></div>
   {loading?<p className="personnel-history-state" role="status">Memuat riwayat…</p>:error?<p className="personnel-history-state" role="alert">{error}</p>:!rows.length?<div className="personnel-history-state"><ArrowLeftRight size={28}/><h3>Belum ada riwayat pada filter ini</h3><p>Perubahan setelah pencatatan diaktifkan akan tampil di sini. Data lama tidak dibuat ulang sebagai riwayat.</p></div>:<div className="table-wrap"><table><thead><tr><th>Waktu / pengubah</th><th>Personel</th><th>Jenis perubahan</th><th>Detail</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td><strong>{date(row.created_at)}</strong><small>{row.actor_email||'Pengubah tidak tercatat'}</small></td><td><strong>{row.employee_name}</strong><small>NIK {row.employee_nik}</small></td><td><span className={`personnel-action action-${row.action}`}>{ACTION_LABELS[row.action]}</span></td><td><details><summary>{personnelDiff(row).length} perubahan · lihat detail</summary><div className="personnel-diffs">{personnelDiff(row).map(diff=><div key={diff.field}><strong>{diff.field}</strong><span>{diff.before||'—'}</span><span className="personnel-arrow">→</span><span>{diff.after||'—'}</span></div>)}</div></details></td></tr>)}</tbody></table></div>}
   <div className="personnel-history-pages"><button className="btn" disabled={page===0||loading} onClick={()=>setPage(p=>p-1)}>Sebelumnya</button><span>Halaman {page+1}</span><button className="btn" disabled={!more||loading} onClick={()=>setPage(p=>p+1)}>Berikutnya</button></div>
  </div><p className="personnel-history-help">Tambah dan edit melalui menu Karyawan. Status resign dan nonaktif mengikuti data karyawan; identitas pengganti tidak disimpulkan otomatis.</p>
 </div>;
}
