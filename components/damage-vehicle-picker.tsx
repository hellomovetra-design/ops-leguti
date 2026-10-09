"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DamageVehicle, damagePlateKey } from "@/lib/damage-case";

export function DamageVehiclePicker({value,disabled,onChange}:{value:string;disabled:boolean;onChange:(value:string)=>void}) {
  const [items,setItems]=useState<DamageVehicle[]>([]);
  const [query,setQuery]=useState(""),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const load=useCallback(async(signal?:AbortSignal)=>{
    setLoading(true);setError("");
    try {
      const response=await fetch("/api/damage-cases?type=vehicles",{cache:"no-store",signal}),data=await response.json();
      if(!response.ok)throw new Error(data.error||"Daftar Nopol belum dapat dimuat.");
      setItems(data.items||[]);
    } catch(e){if(!signal?.aborted)setError(e instanceof Error?e.message:"Daftar Nopol belum dapat dimuat.");}
    finally{if(!signal?.aborted)setLoading(false);}
  },[]);
  useEffect(()=>{const controller=new AbortController();void load(controller.signal);return()=>controller.abort();},[load]);
  const matches=useMemo(()=>items.filter(item=>!query.trim()||damagePlateKey(item.plate).includes(damagePlateKey(query))||[item.vehicle_code,item.vehicle_type].some(text=>text.toUpperCase().includes(query.trim().toUpperCase()))),[items,query]);
  const selected=items.find(item=>item.plate===value);
  return <div className="damage-vehicle-picker">
    <label htmlFor="damage-vehicle-search">Cari Nopol<input id="damage-vehicle-search" type="search" value={query} disabled={disabled||loading} placeholder="Nomor plat atau nomor mobil…" autoComplete="off" onChange={e=>setQuery(e.target.value)}/></label>
    <label htmlFor="damage-vehicle-select">Nopol<select id="damage-vehicle-select" required value={value} disabled={disabled||loading||!!error||!items.length} onChange={e=>onChange(e.target.value)}>
      <option value="">{loading?"Memuat Nopol…":"Pilih Nopol"}</option>
      {selected&&!matches.includes(selected)&&<option value={selected.plate}>{selected.plate} · {selected.vehicle_code}</option>}
      {matches.map(item=><option key={item.plate} value={item.plate}>{item.plate} · {item.vehicle_code} · {item.vehicle_type}</option>)}
    </select></label>
    {error?<div role="alert"><small>{error}</small><button type="button" className="btn" disabled={disabled||loading} onClick={()=>void load()}>Coba lagi</button></div>:!loading&&<small role="status">{items.length===0?"Daftar Nopol belum tersedia.":matches.length===0?"Nopol tidak ditemukan. Ubah pencarian.":`${matches.length} kendaraan tersedia`}</small>}
  </div>;
}
