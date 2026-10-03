"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, Download, Search, Trash2, MoreHorizontal, X, ChevronRight } from "lucide-react";
import { REQUEST_STATUSES, REQUEST_FILTER_STATUSES, requester } from "@/lib/request-report";
import "./request-helpdesk-panel.css";
type RequestRow = Record<string, any> & { id: string };
export function RequestHelpdeskPanel({ initialId = "" }: { initialId?: string }) {
  const [sourceId,setSourceId]=useState(initialId);
  const [items,setItems]=useState<RequestRow[]>([]), [q,setQ]=useState(""), [from,setFrom]=useState(""), [to,setTo]=useState(""), [status,setStatus]=useState(""), [archive,setArchive]=useState(initialId ? "all" : "active"), [offset,setOffset]=useState(0);
  const [selected,setSelected]=useState<string[]>([]), [loading,setLoading]=useState(true), [busy,setBusy]=useState(false), [exporting,setExporting]=useState(false), [more,setMore]=useState(false), [manage,setManage]=useState(false), [message,setMessage]=useState(""), [error,setError]=useState("");
  const lock=useRef(false), sequence=useRef(0);
  const [detailId,setDetailId]=useState<string|null>(initialId || null),[menuId,setMenuId]=useState<string|null>(null);
  const detail=items.find(item=>item.id===detailId);
  const drawerRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(!menuId)return;const close=(e:PointerEvent)=>{if(!(e.target instanceof Element)||!e.target.closest(".request-actions"))setMenuId(null)};const escape=(e:KeyboardEvent)=>{if(e.key==="Escape")setMenuId(null)};document.addEventListener("pointerdown",close);document.addEventListener("keydown",escape);return()=>{document.removeEventListener("pointerdown",close);document.removeEventListener("keydown",escape)}},[menuId]);
  useEffect(()=>{
    if(!detail)return;
    const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;document.body.style.overflow="hidden";drawerRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const keyboard=(e:KeyboardEvent)=>{if(e.key==="Escape"){setDetailId(null);return}if(e.key!=="Tab")return;const buttons=drawerRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]');if(!buttons?.length)return;const first=buttons[0],last=buttons[buttons.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}};
    document.addEventListener("keydown",keyboard);return()=>{document.body.style.overflow=overflow;document.removeEventListener("keydown",keyboard);previous?.focus()};
  },[detailId,!!detail]);
  const params=new URLSearchParams({q,from,to,status,archive,id:sourceId}).toString();
  const invalid=!!(from&&to&&from>to);
  const load=useCallback(async()=>{
    const ticket=++sequence.current;setLoading(true);
    try {
      const response=await fetch(`/api/ops-desk?type=requests&${params}&offset=${offset}`,{cache:"no-store"});const data=await response.json();
      if(!response.ok||data.error)throw new Error(data.error||"Request belum dapat dimuat.");
      if(ticket!==sequence.current)return;
      setItems(data.items||[]);setMore(!!data.has_more);setManage(!!data.can_manage);setError("");
      setSelected(current=>current.filter(id=>(data.items||[]).some((item:RequestRow)=>item.id===id)));
    }catch(e){if(ticket===sequence.current)setError(e instanceof Error?e.message:"Request belum dapat dimuat.")}
    finally{if(ticket===sequence.current)setLoading(false)}
  },[params,offset]);
  useEffect(()=>{setSelected([]);const start=setTimeout(load,250);const timer=setInterval(load,60000);const focus=()=>{if(!lock.current)load()};window.addEventListener("focus",focus);return()=>{clearTimeout(start);clearInterval(timer);window.removeEventListener("focus",focus);sequence.current++}},[load]);
  const filter=(setter:(value:string)=>void,value:string)=>{setter(value);setSourceId("");setOffset(0);setMessage("");setMenuId(null);setDetailId(null)};
  async function mutate(body:Record<string,any>, success:string, mail=false){
    if(lock.current)return;lock.current=true;setBusy(true);setError("");setMessage("");
    const mailWindow=mail?window.open("about:blank","_blank"):null;
    try{
      const response=await fetch("/api/ops-desk",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const data=await response.json();
      if(!response.ok||!data.ok)throw new Error(data.error||"Perubahan gagal disimpan.");
      if(mail&&data.mail){const m=data.mail;const href=`mailto:${m.to}?cc=${encodeURIComponent(m.cc||"")}&subject=${encodeURIComponent(m.subject||"")}&body=${encodeURIComponent(m.body||"")}`;if(mailWindow&&!mailWindow.closed)mailWindow.location.href=href;else window.location.href=href}
      setMessage(success);setSelected([]);setMenuId(null);await load();
    }catch(e){mailWindow?.close();setError(e instanceof Error?e.message:"Perubahan gagal disimpan.")}
    finally{lock.current=false;setBusy(false)}
  }
  function bulk(action:"deleteRequest"|"archiveRequest"){
    if(!selected.length)return;
    if(!window.confirm(action==="deleteRequest"?`Hapus permanen ${selected.length} request terpilih? Data tidak dapat dikembalikan. Unduh report dahulu bila diperlukan.`:`Arsipkan ${selected.length} request terpilih? Data tetap tersedia pada filter Arsip.`))return;
    mutate({action,ids:selected},action==="deleteRequest"?"Request terpilih berhasil dihapus permanen.":"Request terpilih berhasil diarsipkan.");
  }
  async function download(){
    if(exporting||invalid)return;setExporting(true);setError("");
    try{const response=await fetch(`/api/ops-desk?type=requests-export&${params}`,{cache:"no-store"});if(!response.ok){const data=await response.json();throw new Error(data.error||"Report gagal diunduh.")}const url=URL.createObjectURL(await response.blob());const link=document.createElement("a");link.href=url;link.download=`request-helpdesk-${from||"semua"}-${to||"tanggal"}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setMessage("Report seluruh request sesuai filter berhasil diunduh.")}catch(e){setError(e instanceof Error?e.message:"Report gagal diunduh.")}finally{setExporting(false)}
  }
  const time=(value:string)=>value?new Date(value).toLocaleString("id-ID",{timeZone:"Asia/Jakarta",day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}):"—";
  return <section className="request-panel">
    <div className="section-head"><div><div className="eyebrow">OPERASIONAL · TANGERANG SELATAN</div><h1 className="headline">Request Helpdesk</h1><p className="subtitle">Kelola request PWA, proses tindak lanjut, dan unduh riwayat laporan.</p></div><button className="primary" onClick={download} disabled={exporting||invalid||loading}><Download size={16}/>{exporting?"Menyiapkan report…":"Unduh report"}</button></div>
    <div className="request-filters">
      <label className="request-search"><span>Cari request</span><div><Search size={16}/><input aria-label="Cari request" placeholder="User pengaju, nama, ID atau resi…" value={q} onChange={e=>filter(setQ,e.target.value)}/></div></label>
      <label>Dari tanggal<input type="date" value={from} onChange={e=>filter(setFrom,e.target.value)}/></label>
      <label>Sampai tanggal<input type="date" value={to} onChange={e=>filter(setTo,e.target.value)}/></label>
      <label>Status<select aria-label="Status" value={status} onChange={e=>filter(setStatus,e.target.value)}><option value="">Semua status</option>{Object.entries(REQUEST_FILTER_STATUSES).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      <label>Riwayat<select aria-label="Riwayat" value={archive} onChange={e=>filter(setArchive,e.target.value)}><option value="active">Belum diarsipkan</option><option value="archived">Arsip</option><option value="all">Semua riwayat</option></select></label>
    </div>
    <p className="request-filter-note">Tanggal berdasarkan WIB. Unduh report mencakup semua halaman dan semua jenis request sesuai filter; kosongkan tanggal untuk seluruh periode.</p>
    {invalid&&<p className="request-notice error" role="alert">Tanggal awal tidak boleh melewati tanggal akhir.</p>}
    {error&&<p className="request-notice error" role="alert">{error}</p>}{message&&<p className="request-notice" role="status">{message}</p>}
    <div className="request-list-head"><span>{loading?"Memuat request…":`${items.length} request di halaman ini`}</span>{selected.length>0&&manage&&<div className="request-bulk"><b>{selected.length} dipilih</b><button disabled={busy||loading} onClick={()=>bulk("archiveRequest")}><Archive size={15}/>Arsipkan</button><button className="danger" disabled={busy||loading} onClick={()=>bulk("deleteRequest")}><Trash2 size={15}/>Hapus</button><button disabled={busy} onClick={()=>setSelected([])}>Batal</button></div>}</div>
    <div className="card table-wrap" aria-busy={loading}><table className="request-table"><thead><tr>{manage&&<th><input type="checkbox" aria-label="Pilih semua request di halaman ini" disabled={busy||loading||!items.length} checked={items.length>0&&selected.length===items.length} onChange={e=>setSelected(e.target.checked?items.map(x=>x.id):[])}/></th>}<th>USER PENGAJU</th><th>Jenis Request</th><th>No. Resi</th><th>Hub</th><th>Tanggal</th><th>Status</th><th>Tindakan</th></tr></thead><tbody>
      {items.map(row=><tr key={row.id}>{manage&&<td><input type="checkbox" aria-label={`Pilih request ${row.id}`} disabled={busy||loading} checked={selected.includes(row.id)} onChange={e=>setSelected(ids=>e.target.checked?[...ids,row.id]:ids.filter(id=>id!==row.id))}/></td>}
        <td><strong className="request-user">{row.requester_name||requester(row)}</strong>{row.requester_name&&row.requester_name!==requester(row)&&<small className="request-time">{requester(row)}</small>}</td>
        <td><strong>{row.type==="open_cl3"?"Open CL3":"Aktivasi User TGR"}</strong><button className="request-detail-link" onClick={()=>{setDetailId(row.id);setMenuId(null)}} aria-label={`Lihat detail request ${row.id}`}>Lihat detail<ChevronRight size={13}/></button></td>
        <td className="request-awb">{row.shipment_numbers||"—"}</td><td>{row.location||row.hub||"—"}</td><td className="request-date">{time(row.created_at)}<small>WIB</small></td><td><span className={`request-status ${row.status}`}>{REQUEST_STATUSES[row.status]||row.status}</span>{row.archived_at&&<small className="request-time">Diarsipkan</small>}</td>
        <td><div className="request-actions">{manage&&!row.archived_at&&row.status==="pending"&&<button className="request-action-main" disabled={busy||loading} onClick={()=>mutate({action:"approveRequest",id:row.id},"Request diproses; template email dibuka pada aplikasi email.",true)}>Proses request</button>}{manage&&!row.archived_at&&["approved","sent"].includes(row.status)&&<button className="request-action-main" disabled={busy||loading} onClick={()=>{if(window.confirm("Tandai request ini selesai / Close?"))mutate({action:"updateRequestStatus",id:row.id,status:"completed"},"Request berhasil diselesaikan.")}}>Tandai selesai</button>}
          <button aria-label={`Tindakan lainnya untuk request ${row.id}`} aria-expanded={menuId===row.id} disabled={busy||loading} onClick={()=>setMenuId(id=>id===row.id?null:row.id)}><MoreHorizontal size={18}/></button>
          {menuId===row.id&&<div className="request-menu-panel"><button onClick={()=>{setDetailId(row.id);setMenuId(null)}}>Lihat detail</button>{manage&&!row.archived_at&&["pending","approved","sent"].includes(row.status)&&<button className="danger" onClick={()=>{const reason=window.prompt("Alasan penolakan request:");if(reason?.trim())mutate({action:"updateRequestStatus",id:row.id,status:"rejected",reason},"Request ditolak.")}}>Tolak request</button>}{manage&&!row.archived_at&&row.status==="completed"&&<button onClick={()=>{if(window.confirm("Buka kembali request untuk diproses?"))mutate({action:"updateRequestStatus",id:row.id,status:"sent"},"Request dibuka kembali untuk diproses.")}}>Buka kembali</button>}</div>}
        </div></td>
      </tr>)}
      {!items.length&&<tr><td colSpan={manage?8:7} className="request-empty">{loading?"Memuat request…":error?"Daftar belum dapat dimuat.":"Tidak ada request sesuai filter."}</td></tr>}
    </tbody></table></div>
    <div className="request-pagination"><button disabled={offset===0||loading||busy} onClick={()=>setOffset(value=>Math.max(0,value-100))}>Sebelumnya</button><span>Halaman {offset/100+1}</span><button disabled={!more||loading||busy} onClick={()=>setOffset(value=>value+100)}>Berikutnya</button></div>
    {detail&&<div className="request-drawer-backdrop" onClick={e=>{if(e.target===e.currentTarget)setDetailId(null)}}><div className="request-drawer" ref={drawerRef} role="dialog" aria-modal="true" aria-labelledby="request-detail-title"><div className="request-drawer-heading"><div><small>DETAIL REQUEST</small><h2 id="request-detail-title">{detail.type==="open_cl3"?"Open CL3":"Aktivasi User TGR"}</h2></div><button aria-label="Tutup detail request" onClick={()=>setDetailId(null)}><X size={20}/></button></div><span className={`request-status ${detail.status}`}>{REQUEST_STATUSES[detail.status]||detail.status}</span><dl>{[["User pengaju",detail.requester_name?`${detail.requester_name} · ${requester(detail)}`:requester(detail)],["Dibuat",`${time(detail.created_at)} WIB`],["Hub",detail.location||detail.hub],["Nama karyawan",detail.name],["User ID",detail.user_id],["NIK",detail.nik],["No. resi",detail.shipment_numbers],["Keterangan",detail.reason],["Disetujui oleh",detail.approved_by],["Selesai",detail.completed_at?`${time(detail.completed_at)} WIB`:null],["Alasan penolakan",detail.rejection_reason],["Diarsipkan",detail.archived_at?`${time(detail.archived_at)} WIB`:null]].filter(([label,value])=>!!value).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><p className="request-drawer-note">Memproses request membuka template di aplikasi email. Status Selesai hanya ditetapkan setelah penanganan dikonfirmasi.</p></div></div>}
  </section>;
}
