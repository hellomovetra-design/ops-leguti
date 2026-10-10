"use client";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { DamageVehicle, damageVehicleMatches } from "@/lib/damage-case";

export function DamageVehiclePicker({value,disabled,onChange,warehouse=false}:{value:string;disabled:boolean;onChange:(value:string)=>void;warehouse?:boolean}) {
  const label=warehouse?"Origin Warehouse":"Nopol";
  const [items,setItems]=useState<DamageVehicle[]>([]);
  const [query,setQuery]=useState(value),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const [open,setOpen]=useState(false),[highlight,setHighlight]=useState(0);
  const input=useRef<HTMLInputElement>(null), listId=useId(), inputId=useId();
  const load=useCallback(async(signal?:AbortSignal)=>{
    setLoading(true);setError("");
    try {
      const response=await fetch(`/api/damage-cases?type=${warehouse?"warehouses":"vehicles"}`,{cache:"no-store",signal}),data=await response.json();
      if(!response.ok)throw new Error(data.error||`Daftar ${label} belum dapat dimuat.`);
      setItems(warehouse?(data.items||[]).map((item:{name:string})=>({plate:item.name,vehicle_code:"",vehicle_type:""})):data.items||[]);
    } catch(e){if(!signal?.aborted)setError(e instanceof Error?e.message:`Daftar ${label} belum dapat dimuat.`);}
    finally{if(!signal?.aborted)setLoading(false);}
  },[warehouse,label]);
  useEffect(()=>{const controller=new AbortController();void load(controller.signal);return()=>controller.abort();},[load]);
  useEffect(()=>{if(value)setQuery(value);input.current?.setCustomValidity(value?"":`Pilih ${label} dari hasil pencarian.`);},[value,label]);
  const matches=useMemo(()=>items.filter(item=>damageVehicleMatches(item,query)),[items,query]);
  const choose=(item:DamageVehicle)=>{setQuery(item.plate);onChange(item.plate);setOpen(false);};
  useEffect(()=>{document.getElementById(`${listId}-${highlight}`)?.scrollIntoView({block:"nearest"});},[highlight,listId]);
  return <div className="damage-vehicle-picker" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setOpen(false);}}>
    <label htmlFor={inputId}>{label}</label>
    <div className="damage-vehicle-combobox">
      <Search size={17} aria-hidden="true"/>
      <input ref={input} id={inputId} role="combobox" aria-autocomplete="list" aria-expanded={open&&!disabled} aria-controls={listId}
        aria-activedescendant={open&&matches[highlight]?`${listId}-${highlight}`:undefined}
        type="text" required value={query} disabled={disabled} placeholder={loading?`Memuat ${label}…`:warehouse?"Cari dan pilih warehouse…":"Cari dan pilih Nopol / nomor mobil…"} autoComplete="off"
        onFocus={()=>setOpen(true)} onChange={e=>{setQuery(e.target.value);onChange("");setHighlight(0);setOpen(true);}}
        onKeyDown={e=>{
          if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();setOpen(true);setHighlight(n=>Math.max(0,Math.min(matches.length-1,n+(e.key==="ArrowDown"?1:-1))));}
          if(e.key==="Escape"){e.preventDefault();setOpen(false);}
          if(e.key==="Enter"&&open){e.preventDefault();if(matches[highlight])choose(matches[highlight]);}
        }}/>
      <ChevronDown size={16} aria-hidden="true"/>
    </div>
    {open&&!disabled&&<div className="damage-vehicle-options" id={listId} role="listbox" aria-label={`Daftar ${label}`}>
      {loading?<p role="status">Memuat pilihan…</p>:error?<div role="alert"><p>{error}</p><button type="button" className="btn" onClick={()=>void load()}>Coba lagi</button></div>:matches.length?matches.map((item,index)=>
        <button type="button" role="option" aria-selected={value===item.plate} id={`${listId}-${index}`} key={item.plate}
          className={highlight===index?"highlighted":""} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(item)}>
          <strong>{item.plate}</strong>{!warehouse&&<small>{item.vehicle_code} · {item.vehicle_type}</small>}
        </button>):<p role="status">{items.length?`${label} tidak ditemukan. Ubah pencarian.`:`Daftar ${label} belum tersedia.`}</p>}
    </div>}
    {!open&&error&&<div role="alert"><small>{error}</small><button type="button" className="btn" disabled={disabled||loading} onClick={()=>void load()}>Coba lagi</button></div>}
  </div>;
}
