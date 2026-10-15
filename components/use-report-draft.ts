"use client";
import {useEffect,useRef,useState} from "react";
const DB="ops-report-drafts",STORE="drafts";
async function database():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error("Penyimpanan perangkat terkunci."));});}
async function storage(mode:"get"|"put"|"delete"|"clear",key:string,value?:unknown){
 const db=await database();try{return await new Promise<any>((resolve,reject)=>{const tx=db.transaction(STORE,mode==="get"?"readonly":"readwrite"),s=tx.objectStore(STORE);const r=mode==="get"?s.get(key):mode==="put"?s.put(value,key):mode==="clear"?s.clear():s.delete(key);let result:any;r.onsuccess=()=>{result=r.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}
}
export async function clearReportDrafts(){await storage("clear","");}
type Draft={id:string;[key:string]:unknown};
export function useReportDraft<T extends Draft>(kind:string,enabled:boolean,value:T,hasContent:boolean,restore:(value:T)=>void){
 const [ready,setReady]=useState(!enabled),[message,setMessage]=useState("");
 const restoreRef=useRef(restore),key=useRef(""),chain=useRef(Promise.resolve()),cleared=useRef("");restoreRef.current=restore;
 useEffect(()=>{
  if(!enabled){setReady(true);return;}let alive=true;key.current="";setReady(false);
  (async()=>{try{const r=await fetch("/api/ops-desk?type=profile",{cache:"no-store"}),d=await r.json();if(!r.ok||!d.profile?.email)throw Error();
   const accountKey=`${d.profile.email.toLowerCase()}:${kind}`;await chain.current.catch(()=>{});const saved=await storage("get",accountKey);
   if(!alive)return;key.current=accountKey;
   if(saved&&saved.savedAt>Date.now()-7*86400000){restoreRef.current(saved.value);setMessage("Draft dan foto dipulihkan dari perangkat ini.");}else if(saved)await storage("delete",accountKey);
  }catch{if(alive)setMessage("Penyimpanan draft perangkat tidak tersedia. Jangan tutup halaman sebelum laporan terkirim.");}finally{if(alive)setReady(true);}})();return()=>{alive=false;};
 },[kind,enabled]);
 useEffect(()=>{
  if(!enabled||!ready||!key.current||cleared.current===value.id)return;
  const accountKey=key.current,snapshot={savedAt:Date.now(),value};
  chain.current=chain.current.catch(()=>{}).then(()=>storage(hasContent?"put":"delete",accountKey,snapshot)).then(()=>setMessage(hasContent?"Draft dan foto tersimpan di perangkat ini.":""),()=>setMessage("Draft belum tersimpan di perangkat. Jangan tutup halaman sebelum laporan terkirim."));
 },[value,hasContent,ready,enabled]);
 const clear=async()=>{cleared.current=value.id;const accountKey=key.current;await chain.current.catch(()=>{});if(accountKey)await storage("delete",accountKey).catch(()=>{});setMessage("");};
 return {ready,message,clear};
}
