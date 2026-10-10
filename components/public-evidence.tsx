"use client";
import { useEffect,useState } from 'react';
import './evidence-share.css';
export function PublicEvidence({token}:{token:string}) {
  const [data,setData]=useState<{awb:string;title:string;photos:{label:string;url:string}[]}|null>(null),[error,setError]=useState('');
  useEffect(()=>{const controller=new AbortController();fetch(`/api/evidence/${encodeURIComponent(token)}`,{cache:'no-store',signal:controller.signal}).then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body.error);setData(body)}).catch(e=>{if(e.name!=='AbortError')setError('Tautan tidak tersedia atau sudah dinonaktifkan.')});return()=>controller.abort()},[token]);
  return <main className="public-evidence"><header><img src="/branding/app-icon-180.png" alt="OPS LEGUTI"/><div><small>OPS LEGUTI · FOTO BUKTI</small><h1>{data?.title||'Bukti pelaporan'}</h1></div></header>{error?<p role="alert">{error}</p>:!data?<p role="status">Memuat foto bukti…</p>:<><p className="evidence-awb">AWB <strong>{data.awb}</strong></p><div className="public-evidence-grid">{data.photos.map(photo=><figure key={photo.url}><a href={photo.url} target="_blank" rel="noreferrer"><img src={photo.url} alt={photo.label}/></a><figcaption>{photo.label} · Klik untuk melihat ukuran penuh</figcaption></figure>)}</div></>}<footer>© 2026 OPS LEGUTI · Developed by movetra.id</footer></main>;
}
