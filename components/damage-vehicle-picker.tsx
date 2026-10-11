"use client";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, Plus } from "lucide-react";
import { DamageVehicle, damageVehicleMatches } from "@/lib/damage-case";

export function DamageVehiclePicker({value,disabled,onChange,warehouse=false}:{value:string;disabled:boolean;onChange:(value:string)=>void;warehouse?:boolean}) {
  const label=warehouse?"Origin Warehouse":"Nopol";
  const [items,setItems]=useState<DamageVehicle[]>([]);
  const [query,setQuery]=useState(value),[loading,setLoading]=useState(true),[error,setError]=useState("");
  const [open,setOpen]=useState(false),[highlight,setHighlight]=useState(0);
  const [canCreate,setCanCreate]=useState(false),[adding,setAdding]=useState(false),[savingAsset,setSavingAsset]=useState(false),[assetError,setAssetError]=useState(''),[draft,setDraft]=useState({value:'',vehicle_code:'',vehicle_type:''});
  const assetLock=useRef(false);
  const input=useRef<HTMLInputElement>(null), listId=useId(), inputId=useId();
  const load=useCallback(async(signal?:AbortSignal)=>{
    setLoading(true);setError("");
    try {
      const response=await fetch(`/api/damage-cases?type=${warehouse?"warehouses":"vehicles"}`,{cache:"no-store",signal}),data=await response.json();
      if(!response.ok)throw new Error(data.error||`Daftar ${label} belum dapat dimuat.`);
      setCanCreate(data.can_create===true);
      setItems(warehouse?(data.items||[]).map((item:{name:string})=>({plate:item.name,vehicle_code:"",vehicle_type:""})):data.items||[]);
    } catch(e){if(!signal?.aborted)setError(e instanceof Error?e.message:`Daftar ${label} belum dapat dimuat.`);}
    finally{if(!signal?.aborted)setLoading(false);}
  },[warehouse,label]);
  useEffect(()=>{const controller=new AbortController();void load(controller.signal);return()=>controller.abort();},[load]);
  useEffect(()=>{if(value)setQuery(value);input.current?.setCustomValidity(value?"":`Pilih ${label} dari hasil pencarian.`);},[value,label]);
  const matches=useMemo(()=>items.filter(item=>damageVehicleMatches(item,query)),[items,query]);
  const choose=(item:DamageVehicle)=>{setQuery(item.plate);onChange(item.plate);setOpen(false);};
  const addAsset=async()=>{
    if(assetLock.current)return;assetLock.current=true;setSavingAsset(true);setAssetError('');
    try{
      const response=await fetch('/api/damage-assets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...draft,kind:warehouse?'warehouse':'vehicle'})}),data=await response.json();
      if(!response.ok)throw Error(data.error||'Aset belum berhasil disimpan.');
      setItems(current=>[...current.filter(item=>item.plate!==data.item.plate),data.item].sort((a,b)=>a.plate.localeCompare(b.plate)));choose(data.item);setAdding(false);
    }catch(e){setAssetError(e instanceof Error?e.message:'Aset belum berhasil disimpan.');}finally{assetLock.current=false;setSavingAsset(false);}
  };
  useEffect(()=>{document.getElementById(`${listId}-${highlight}`)?.scrollIntoView({block:"nearest"});},[highlight,listId]);
  return <div className="damage-vehicle-picker" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setOpen(false);}}>
    <label htmlFor={inputId}>{label}</label>
    <div className="damage-vehicle-combobox">
      <Search size={17} aria-hidden="true"/>
      <input ref={input} id={inputId} role="combobox" aria-autocomplete="list" aria-expanded={open&&!disabled} aria-controls={listId}
        aria-activedescendant={open&&matches[highlight]?`${listId}-${highlight}`:undefined}
        type="text" required value={query} disabled={disabled||savingAsset||adding} placeholder={loading?`Memuat ${label}…`:warehouse?"Cari dan pilih warehouse…":"Cari dan pilih Nopol / nomor mobil…"} autoComplete="off" autoCapitalize="characters"
        onFocus={()=>setOpen(true)} onChange={e=>{setQuery(e.target.value.toUpperCase());onChange("");setHighlight(0);setOpen(true);}}
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
        </button>):<div><p role="status">{items.length?`${label} tidak ditemukan. Ubah pencarian.`:`Daftar ${label} belum tersedia.`}</p>{canCreate&&query.trim()&&<button type="button" className="btn" onClick={()=>{setDraft({value:query.trim().toUpperCase(),vehicle_code:'',vehicle_type:''});setAssetError('');setAdding(true);setOpen(false);}}><Plus size={15}/>Tambah {label} baru</button>}</div>}
    </div>}
    {!open&&error&&<div role="alert"><small>{error}</small><button type="button" className="btn" disabled={disabled||loading} onClick={()=>void load()}>Coba lagi</button></div>}
    {adding&&canCreate&&<section className="damage-asset-create" aria-label={`Tambah ${label}`}><strong>Tambah {label} baru</strong><label>{label}<input disabled={savingAsset||disabled} value={draft.value} autoCapitalize="characters" maxLength={warehouse?100:30} placeholder={warehouse?'CONTOH: MEGA HUB':'CONTOH: B 9271 CCG'} onChange={e=>setDraft({...draft,value:e.target.value.toUpperCase()})}/></label>{!warehouse&&<><label>Nomor / kode armada<input disabled={savingAsset||disabled} value={draft.vehicle_code} maxLength={100} autoCapitalize="characters" placeholder="CONTOH: TGR132 / RENTAL" onChange={e=>setDraft({...draft,vehicle_code:e.target.value.toUpperCase()})}/></label><label>Jenis kendaraan<input disabled={savingAsset||disabled} value={draft.vehicle_type} maxLength={100} autoCapitalize="characters" placeholder="CONTOH: CDE / CDD LONG" onChange={e=>setDraft({...draft,vehicle_type:e.target.value.toUpperCase()})}/></label></>}<small>Aset tersimpan ke master dan langsung dipilih untuk laporan ini.</small>{assetError&&<p role="alert">{assetError}</p>}<div className="actions"><button type="button" className="primary" disabled={savingAsset||disabled||!draft.value.trim()||(!warehouse&&(!draft.vehicle_code.trim()||!draft.vehicle_type.trim()))} onClick={()=>void addAsset()}>{savingAsset?'Menyimpan…':'Simpan & pilih'}</button><button type="button" className="btn" disabled={savingAsset||disabled} onClick={()=>setAdding(false)}>Batal</button></div></section>}
  </div>;
}
