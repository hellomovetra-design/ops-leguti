"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {useEffect,useId,useState} from "react";
import {ChevronDown,type LucideIcon} from "lucide-react";
import {cn} from "@/lib/utils";
export function SidebarMenuGroup({label,icon:Icon,items,active,onNavigate}:{label:string;icon:LucideIcon;items:readonly {href:string;label:string}[];active:boolean;onNavigate:()=>void}){
 const pathname=usePathname(),id=useId();
 const [expanded,setExpanded]=useState(active);
 useEffect(()=>{if(active)setExpanded(true)},[pathname,active]);
 return <div><button type="button" className={cn("nav-item nav-group-toggle",active&&"active")} aria-expanded={expanded} aria-controls={id} onClick={()=>setExpanded(value=>!value)}><Icon size={16} strokeWidth={active?2.4:1.8}/><span>{label}</span><ChevronDown size={14} className={cn("nav-group-chevron",expanded&&"expanded")}/></button>{expanded&&<div id={id} className="administrator-subnav">{items.map(item=><Link key={item.href} href={item.href} onClick={onNavigate} aria-current={pathname===item.href?"page":undefined} className={cn("nav-item",pathname===item.href&&"active")}>{item.label}</Link>)}</div>}</div>;
}
