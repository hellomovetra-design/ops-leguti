"use client";
import { useEffect, useRef, useState } from "react";
import { Download, RefreshCw, Search, ChevronRight, X, Paperclip, Printer } from "lucide-react";
import { CHECK_COLUMNS, CourierCheck, checkCell, DELIVERY_AREAS, deliveryArea } from "@/lib/courier-checks";
import { useCourierChecks } from "./use-courier-checks";
import "./courier-carry-panel.css";

export function CourierCarryPanel() {
  const { items, error, loading, load } = useCourierChecks();
  const [query,setQuery]=useState(""),[from,setFrom]=useState(""),[to,setTo]=useState(""),[result,setResult]=useState(""),[area,setArea]=useState(""),[page,setPage]=useState(0);
  const [detailId,setDetailId]=useState<string|null>(null),[exporting,setExporting]=useState(false),[exportError,setExportError]=useState("");
  const drawer=useRef<HTMLDivElement>(null),exportLock=useRef(false);
  const filtered=items.filter(x=>(!from||x.inspection_date>=from)&&(!to||x.inspection_date<=to)&&(!result||x.result===result)&&(!area||deliveryArea(x.delivery_area)===area)&&[x.courier_name,x.courier_id,x.inspector_name,x.delivery_area,x.inspection_location].join(" ").toLowerCase().includes(query.toLowerCase().trim()));
  const validPeriod=!from||!to||from<=to,detail=items.find(item=>item.id===detailId);
  const currentPage=Math.min(page,Math.max(0,Math.ceil(filtered.length/25)-1)),visible=filtered.slice(currentPage*25,currentPage*25+25);
  const links=(item:CourierCheck)=>[...new Set([item.documentation_url,...(item.photos||[]).map(p=>p.url)].filter(Boolean))].filter(url=>{try{return ["http:","https:"].includes(new URL(url,"https://local.invalid").protocol)}catch{return false}});
  const date=(value:string)=>new Date(value+"T00:00:00Z").toLocaleDateString("id-ID",{timeZone:"Asia/Jakarta",day:"2-digit",month:"short",year:"numeric"});
  function filter(setter:(value:string)=>void,value:string){setter(value);setPage(0);setExportError("")}
  useEffect(()=>{
    if(!detail)return;
    const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;document.body.style.overflow="hidden";drawer.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const keyboard=(e:KeyboardEvent)=>{if(e.key==="Escape")setDetailId(null);if(e.key!=="Tab")return;const controls=drawer.current?.querySelectorAll<HTMLElement>('button,a[href]');if(!controls?.length)return;const first=controls[0],last=controls[controls.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}};
    document.addEventListener("keydown",keyboard);return()=>{document.body.style.overflow=overflow;document.removeEventListener("keydown",keyboard);previous?.focus()};
  },[!!detail]);
  async function download(){
    if(exportLock.current||!validPeriod||loading||error||!filtered.length)return;
    exportLock.current=true;setExporting(true);setExportError("");
    try{
      const [response,{courierReportXlsx}]=await Promise.all([fetch("/templates/pemeriksaan-connote.xlsx"),import("@/lib/courier-report-export")]);
      if(!response.ok)throw new Error("Template laporan belum dapat dimuat.");
      const output=courierReportXlsx(await response.arrayBuffer(),filtered,window.location.origin);
      const url=URL.createObjectURL(new Blob([new Uint8Array(output)],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
      const a=document.createElement("a");a.href=url;a.download=`pemeriksaan-connote-${from||"semua"}-${to||"tanggal"}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch(e){setExportError(e instanceof Error?e.message:"Report belum dapat diunduh.")}
    finally{exportLock.current=false;setExporting(false)}
  }
  return <section className="carry-panel">
    <div className="carry-controls">
      <div className="section-head"><div><div className="eyebrow">OPERASIONAL · BAWAAN KURIR</div><h1 className="headline">Bawaan Kurir</h1><p className="subtitle">Pemeriksaan connote dan dokumentasi bawaan kurir.</p></div><div className="carry-toolbar"><button disabled={loading||exporting||!!error||!validPeriod||!filtered.length} className="carry-primary" onClick={download}><Download size={16}/>{exporting?"Menyiapkan report…":"Unduh report Excel"}</button><button disabled={loading||!!error||!validPeriod||!filtered.length} onClick={()=>window.print()}><Printer size={16}/>Cetak</button></div></div>
      <fieldset className="carry-filters" disabled={exporting}>
        <label className="carry-search">Cari kurir / PIC<div><Search size={16}/><input aria-label="Cari kurir / PIC" value={query} onChange={e=>filter(setQuery,e.target.value)} placeholder="Nama, ID, lokasi pemeriksaan…"/></div></label>
        <label>Area delivery<select aria-label="Area delivery" value={area} onChange={e=>filter(setArea,e.target.value)}><option value="">Semua area</option>{DELIVERY_AREAS.map(value=><option key={value}>{value}</option>)}</select></label>
        <label>Hasil pemeriksaan<select aria-label="Hasil pemeriksaan" value={result} onChange={e=>filter(setResult,e.target.value)}><option value="">Semua hasil</option><option>Sesuai</option><option>Tidak Sesuai</option></select></label>
        <label>Dari tanggal<input type="date" value={from} onChange={e=>filter(setFrom,e.target.value)}/></label><label>Sampai tanggal<input type="date" value={to} onChange={e=>filter(setTo,e.target.value)}/></label>
        <button disabled={loading} aria-label="Perbarui laporan" onClick={()=>load()}><RefreshCw size={16}/></button>
      </fieldset>
      {!validPeriod&&<p className="carry-error" role="alert">Tanggal awal tidak boleh melebihi tanggal akhir.</p>}
      {error&&<p className="carry-error" role="alert">{error} Data sebelumnya belum diperbarui.</p>}{exportError&&<p className="carry-error" role="alert">{exportError}</p>}
      <div className="carry-list-info"><span>{loading?"Memuat pemeriksaan…":`${filtered.length} pemeriksaan · ${filtered.filter(x=>x.result==="Tidak Sesuai").length} tidak sesuai`}</span><small>Unduhan memuat seluruh hasil filter, bukan hanya halaman ini.</small></div>
      <div className="carry-table-scroll" aria-busy={loading}><table className="carry-table"><thead><tr><th>Kurir</th><th>Pemeriksaan</th><th>Area / PIC</th><th>Jumlah connote</th><th>Hasil</th><th>Detail</th></tr></thead><tbody>{validPeriod&&visible.map(item=><tr key={item.id}>
        <td><strong>{item.courier_name}</strong><small>{item.courier_id} · {item.position}</small></td><td>{date(item.inspection_date)}<small>{item.inspection_time.slice(0,5)} WIB</small></td><td>{deliveryArea(item.delivery_area)}<small>{item.inspector_name}</small></td>
        <td><div className="carry-counts"><span><small>Runsheet</small><b>{item.runsheet_count.toLocaleString("id-ID")}</b></span><span><small>Fisik</small><b>{item.physical_count.toLocaleString("id-ID")}</b></span></div><small className={item.physical_count!==item.runsheet_count?"carry-difference":""}>Selisih {item.physical_count-item.runsheet_count>0?"+":""}{item.physical_count-item.runsheet_count}</small></td>
        <td><span className={"carry-result "+(item.result==="Sesuai"?"ok":"issue")}>{item.result}</span></td><td><button className="carry-detail-button" aria-label={`Detail pemeriksaan ${item.courier_name} ${item.id}`} onClick={()=>setDetailId(item.id)}>Lihat detail<ChevronRight size={14}/></button>{links(item).length>0&&<small className="carry-attachment"><Paperclip size={12}/>Dokumentasi tersedia</small>}</td>
      </tr>)}{(!visible.length||!validPeriod)&&<tr><td colSpan={6} className="carry-empty">{loading?"Memuat pemeriksaan…":!validPeriod?"Perbaiki rentang tanggal untuk melihat laporan.":error?"Laporan belum tersedia.":"Belum ada pemeriksaan sesuai filter."}</td></tr>}</tbody></table></div>
      <div className="carry-pagination"><span>{filtered.length&&validPeriod?`${currentPage*25+1}–${Math.min((currentPage+1)*25,filtered.length)} dari ${filtered.length}`:"0 pemeriksaan"}</span><button disabled={!validPeriod||currentPage===0} onClick={()=>setPage(currentPage-1)}>Sebelumnya</button><button disabled={!validPeriod||(currentPage+1)*25>=filtered.length} onClick={()=>setPage(currentPage+1)}>Berikutnya</button></div>
    </div>
    {detail&&<div className="carry-backdrop" onClick={e=>{if(e.target===e.currentTarget)setDetailId(null)}}><div className="carry-drawer" ref={drawer} role="dialog" aria-modal="true" aria-labelledby="carry-detail-title"><div className="carry-drawer-head"><div><small>DETAIL PEMERIKSAAN</small><h2 id="carry-detail-title">{detail.courier_name}</h2><p>{detail.courier_id} · {detail.position}</p></div><button aria-label="Tutup detail pemeriksaan" onClick={()=>setDetailId(null)}><X size={20}/></button></div><span className={"carry-result "+(detail.result==="Sesuai"?"ok":"issue")}>{detail.result}</span>
      <dl className="carry-details">{CHECK_COLUMNS.filter(([key])=>key!=="documentation_url"&&key!=="result").map(([key,label])=><div key={key}><dt>{label}</dt><dd>{key==="inspection_date"?date(detail.inspection_date):key==="delivery_area"?deliveryArea(detail.delivery_area):checkCell(detail,key)||"—"}</dd></div>)}</dl>
      <section className="carry-evidence"><h3>Dokumentasi pemeriksaan</h3>{detail.photos?.length>0&&<div className="carry-photo-grid">{detail.photos.map((photo,i)=><a href={photo.url} key={i} target="_blank" rel="noreferrer"><img src={photo.url} alt={photo.name||`Foto pemeriksaan ${i+1}`} loading="lazy"/><span>Lihat foto penuh</span></a>)}</div>}{links(detail).length?links(detail).map((url,i)=><a className="carry-document-link" href={url} key={url} target="_blank" rel="noreferrer">Dokumentasi {i+1}<ChevronRight size={14}/></a>):<p>Belum ada dokumentasi.</p>}</section>
    </div></div>}
    <div className="carry-print-report"><div className="carry-print-title">Form Pemeriksaan Connote{from||to?` · ${from||"Awal"} s.d. ${to||"Sekarang"}`:""}</div><table className="carry-print-table"><colgroup>{[19,18,21,23,13,16,19,20,24,18,28,20,17,27].map((w,i)=><col key={i} style={{width:(w/283*100)+"%"}}/>)}</colgroup><thead><tr>{CHECK_COLUMNS.map(([key,label])=><th key={key}>{label}</th>)}</tr></thead><tbody>{validPeriod&&filtered.map(item=><tr key={item.id}>{CHECK_COLUMNS.map(([key])=><td key={key}>{key==="documentation_url"?links(item).map(url=><div key={url}>{typeof window!=="undefined"?new URL(url,window.location.origin).href:url}</div>):checkCell(item,key)}</td>)}</tr>)}</tbody></table></div>
  </section>;
}
