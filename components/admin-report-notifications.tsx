"use client";
import {useEffect,useRef,useState} from "react";
import {subscribeInboxRealtime} from "./inbox-realtime";
import {Bell,X} from "lucide-react";
import {PwaPushSettings} from "./pwa-push-settings";
import "./report-workflow.css";
export function AdminReportNotifications(){
 const [items,setItems]=useState<any[]>([]),[unread,setUnread]=useState(0),[error,setError]=useState(""),[offset,setOffset]=useState(0),[more,setMore]=useState(false),[busy,setBusy]=useState(false);
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{let alive=true;const load=async()=>{try{const r=await fetch(`/api/notifications?offset=${offset}`,{cache:"no-store"}),d=await r.json();if(!r.ok)throw Error(d.error);if(alive){setItems(d.items||[]);setUnread(d.unread||0);setMore(!!d.has_more);setError("");}}catch{if(alive)setError("Notifikasi belum dapat dimuat.");}};const stop=subscribeInboxRealtime(true,load);window.addEventListener("ops-inbox-read",load);return()=>{alive=false;stop();window.removeEventListener("ops-inbox-read",load);};},[offset]);
 async function open(item:any){
  if(busy)return;setBusy(true);
  try{const r=await fetch("/api/notifications",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"read",id:item.id})});if(!r.ok)throw Error();
   const url=typeof item.destination==="string"?item.destination:"";
   if(/^\/dashboard\/ops-desk\/(?:damage-cases|problems|ots)\?id=[0-9a-f-]{36}$/i.test(url)||/^\/dashboard\/ops-desk\/inbox\?thread=[0-9a-f-]{36}$/i.test(url))window.location.assign(url);
   else{setItems(rows=>rows.map(row=>row.id===item.id?{...row,read_at:new Date().toISOString()}:row));setUnread(n=>Math.max(0,n-(item.read_at?0:1)));}
  }catch{setError("Notifikasi belum dapat dibuka.");}finally{setBusy(false);}
 }
 return <><button className="icon-btn inbox-admin-shortcut" aria-label={`Notifikasi, ${unread} belum dibaca`} onClick={()=>dialog.current?.showModal()}><Bell size={15}/>{unread>0&&<span className="inbox-unread">{unread>99?"99+":unread}</span>}</button><dialog ref={dialog} className="report-admin-dialog"><header><h2>Notifikasi</h2><button className="icon-btn" aria-label="Tutup notifikasi" onClick={()=>dialog.current?.close()}><X size={18}/></button></header><PwaPushSettings audience="admin"/>{error&&<p role="alert">{error}</p>}{items.map(item=><article className={`report-admin-notice${item.read_at?"":" unread"}`} key={item.id}><strong>{item.title}</strong><p>{item.body}</p><small>{new Date(item.created_at).toLocaleString("id-ID",{timeZone:"Asia/Jakarta"})} WIB</small><button className="btn" disabled={busy} onClick={()=>void open(item)}>{item.destination?.includes("/inbox")?"Buka Inbox":item.destination?"Buka laporan":"Tandai dibaca"}</button></article>)}{!items.length&&!error&&<p>Belum ada notifikasi.</p>}<footer>{offset>0&&<button className="btn" onClick={()=>setOffset(n=>Math.max(0,n-30))}>Lebih baru</button>}{more&&<button className="btn" onClick={()=>setOffset(n=>n+30)}>Sebelumnya</button>}</footer></dialog></>;
}
