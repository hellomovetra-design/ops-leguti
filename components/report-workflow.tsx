"use client";
import {useEffect,useState} from "react";
import {REPORTS,ReportKind,reportAge} from "@/lib/report-workflow";
import {DAMAGE_STATUSES} from "@/lib/damage-case";
import {BARKUR_STATUSES} from "@/lib/barkur";
import {PROBLEM_STATUSES} from "@/lib/problem-records";
import "./report-workflow.css";
export function ReportAge({created,status}:{created:string;status:string}){
 const [now,setNow]=useState<number|null>(null);
 useEffect(()=>{setNow(Date.now());const t=setInterval(()=>setNow(Date.now()),60000);return()=>clearInterval(t);},[]);
 const age=now===null?null:reportAge(created,status,now);
 return age?<small className={`report-age ${age.tone}`}>Belum selesai · {age.label}</small>:null;
}
export function ReportQueue({kind,revision}:{kind:ReportKind;revision?:unknown}){
 const [group,setGroup]=useState<any>(null),[error,setError]=useState("");
 useEffect(()=>{let alive=true;const load=async()=>{try{const r=await fetch("/api/report-activity?type=queue",{cache:"no-store"}),data=await r.json();if(!r.ok)throw Error(data.error);if(alive){setGroup(data.groups?.find((g:any)=>g.kind===kind));setError("");}}catch{if(alive)setError("Antrean belum dapat dimuat.");}};void load();const t=setInterval(load,60000);return()=>{alive=false;clearInterval(t);};},[kind,revision]);
 return <aside className="report-queue"><strong>Perlu tindak lanjut{group?` · ${group.total} laporan`:""}</strong><small>Antrean terlama di bawah ini tetap terlihat meskipun daftar utama menampilkan laporan terbaru. Peringatan 3 jam dan 24 jam bersifat pengingat, bukan SLA resmi.</small>{error?<p role="alert">{error}</p>:!group?<p>Memuat antrean…</p>:group.items.length?<div>{group.items.map((row:any)=><a key={row.id} href={row.url}><b>{row.awb}</b><ReportAge created={row.created_at} status={row.status}/></a>)}</div>:<p>Tidak ada laporan tertunda.</p>}</aside>;
}
export function ReportHistory({kind,id,revision}:{kind:ReportKind;id:string;revision?:unknown}){
 const [items,setItems]=useState<any[]>([]),[error,setError]=useState(""),[offset,setOffset]=useState(0),[more,setMore]=useState(false);
 useEffect(()=>setOffset(0),[id,kind]);
 useEffect(()=>{let alive=true;setError("");fetch(`/api/report-activity?type=history&kind=${kind}&id=${id}&offset=${offset}`,{cache:"no-store"}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);if(alive){setItems(d.items||[]);setMore(!!d.has_more);}}).catch(e=>{if(alive){setItems([]);setError(e.message);}});return()=>{alive=false;};},[kind,id,revision,offset]);
 const labels:Record<string,string>=kind==="damage"?DAMAGE_STATUSES:kind==="problem"?PROBLEM_STATUSES:BARKUR_STATUSES;
 return <section className="report-history"><h3>Riwayat tindak lanjut</h3><small>Dicatat otomatis sejak fitur riwayat diaktifkan.</small>{error?<p role="alert">{error}</p>:!items.length?<p>Belum ada riwayat tercatat.</p>:<ol>{items.map(row=><li key={row.id}><strong>{row.action==="create"?"Laporan dibuat":`${labels[row.old_status]||row.old_status} → ${labels[row.new_status]||row.new_status}`}</strong><small>{row.actor_email||"Perubahan database"} · {new Date(row.created_at).toLocaleString("id-ID",{timeZone:"Asia/Jakarta"})} WIB</small>{row.new_note&&<p>{row.new_note}</p>}{row.action==="update"&&row.old_note!==row.new_note&&<small>Catatan sebelumnya: {row.old_note||"—"}</small>}</li>)}</ol>}<div>{offset>0&&<button type="button" className="btn" onClick={()=>setOffset(n=>Math.max(0,n-30))}>Lebih baru</button>}{more&&<button type="button" className="btn" onClick={()=>setOffset(n=>n+30)}>Lebih lama</button>}</div></section>;
}
export function DuplicateAwb({kind,awb,exclude=""}:{kind:ReportKind;awb:string;exclude?:string}){
 const [message,setMessage]=useState("");
 useEffect(()=>{setMessage("");if(!awb.trim())return;const controller=new AbortController();const timer=setTimeout(()=>{const p=new URLSearchParams({type:"duplicate",kind,awb,id:exclude});fetch(`/api/report-activity?${p}`,{cache:"no-store",signal:controller.signal}).then(async r=>{const d=await r.json();if(r.ok&&!controller.signal.aborted)setMessage(d.duplicate?d.message:"");}).catch(()=>{});},500);return()=>{clearTimeout(timer);controller.abort();};},[kind,awb,exclude]);
 return message?<p className="report-duplicate" role="alert">{message}</p>:null;
}
