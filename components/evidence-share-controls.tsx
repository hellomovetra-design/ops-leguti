"use client";
import { useEffect,useState } from 'react';
import type { EvidenceKind } from '@/lib/evidence-share';
import './evidence-share.css';
export function EvidenceShareControls({kind,id}:{kind:EvidenceKind;id:string}) {
  const [url,setUrl]=useState<string|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  async function request(action:string) {
    const response=await fetch('/api/evidence-shares',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,id,action})});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'Link belum dapat diproses.');return data.url as string|null;
  }
  useEffect(()=>{let active=true;setUrl(null);setNotice('');request('status').then(value=>{if(active)setUrl(value)}).catch(()=>{});return()=>{active=false}},[kind,id]);
  async function act(action:'create'|'revoke') {
    if(busy)return;
    if(action==='revoke'&&!confirm('Nonaktifkan link? Penerima tidak dapat lagi membuka foto melalui tautan ini.'))return;
    setBusy(true);setNotice('');
    try{const value=await request(action);setUrl(value);if(value){try{await navigator.clipboard.writeText(new URL(value,location.origin).href);setNotice('Link publik disalin. Penerima tidak perlu login.')}catch{setNotice('Link siap. Salin alamat dari kolom di bawah.')}}else setNotice('Link publik dinonaktifkan.');}catch(e){setNotice(e instanceof Error?e.message:'Terjadi kesalahan.')}finally{setBusy(false)}
  }
  return <section className="evidence-sharing"><h3>Bagikan foto bukti</h3><p>Siapa pun yang memiliki link dapat melihat AWB dan foto bukti tanpa login.</p><div className="evidence-sharing-actions"><button type="button" disabled={busy} onClick={()=>void act('create')}>{busy?'Memproses…':url?'Salin link publik':'Buat & salin link publik'}</button>{url&&<button type="button" disabled={busy} onClick={()=>void act('revoke')}>Nonaktifkan link</button>}</div>{url&&<input readOnly aria-label="Link publik foto bukti" value={typeof window==='undefined'?url:new URL(url,window.location.origin).href} onFocus={e=>e.target.select()}/>} {notice&&<p role="status">{notice}</p>}</section>;
}
