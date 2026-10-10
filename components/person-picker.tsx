"use client";
import {useEffect,useId,useRef,useState} from 'react';
import {ChevronDown,Search} from 'lucide-react';
import {PersonOption,personMatches} from '@/lib/person-picker';
export function PersonPicker({label,placeholder,items,value,disabled,onChange}:{label:string;placeholder:string;items:PersonOption[];value:string;disabled:boolean;onChange:(nik:string)=>void}){
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[highlight,setHighlight]=useState(0);
 const inputId=useId(),listId=useId(),option=useRef<HTMLButtonElement|null>(null);
 const selected=items.find(person=>person.nik===value),matches=items.filter(person=>personMatches(person,query));
 useEffect(()=>{if(open)option.current?.scrollIntoView({block:'nearest'});},[open,highlight]);
 useEffect(()=>{setHighlight(0);},[query,items]);
 const choose=(person:PersonOption)=>{onChange(person.nik);setOpen(false);setQuery('');};
 const active=Math.min(highlight,Math.max(0,matches.length-1));
 return <div className="person-picker" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null)){setOpen(false);setQuery('');}}}>
  <label htmlFor={inputId}>{label}</label>
  <div className="person-picker-input"><Search size={16} aria-hidden="true"/><input id={inputId} role="combobox" aria-expanded={open&&!disabled} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={open&&matches[active]?`${listId}-${active}`:undefined} disabled={disabled} autoComplete="off" placeholder={placeholder} value={open?query:selected?`${selected.name} · ${selected.nik}`:''} onClick={()=>{if(!open){setOpen(true);setQuery('');setHighlight(0);}}} onFocus={()=>{setOpen(true);setQuery('');setHighlight(0);}} onChange={e=>{setQuery(e.target.value);setOpen(true);onChange('');}} onKeyDown={e=>{
   if(e.key==='Escape'){e.preventDefault();setOpen(false);}
   if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setOpen(true);setHighlight(Math.max(0,Math.min(matches.length-1,active+(e.key==='ArrowDown'?1:-1))));}
   if(e.key==='Enter'&&open){e.preventDefault();if(matches[active])choose(matches[active]);}
  }}/><ChevronDown size={16} aria-hidden="true"/></div>
  {open&&!disabled&&<div className="person-picker-options" id={listId} role="listbox" aria-label={`Pilihan ${label}`}>
   {matches.length?matches.map((person,index)=><button type="button" key={person.nik} id={`${listId}-${index}`} role="option" aria-selected={value===person.nik} ref={index===active?option:undefined} className={index===active?'highlighted':''} onMouseDown={e=>e.preventDefault()} onMouseEnter={()=>setHighlight(index)} onClick={()=>choose(person)}><strong>{person.name}</strong><small>{[person.nik,person.position,person.hub].filter(Boolean).join(' · ')}</small></button>):<p role="status">Tidak ada personel sesuai pencarian.</p>}
  </div>}
 </div>;
}
