import Link from "next/link";
import { ADMIN_MENUS } from "@/lib/admin-navigation";
import "./administrator.css";
export function AdministratorHome() {
  return <section><div className="section-head"><div><div className="eyebrow">PENGATURAN</div><h1 className="headline">Administrator</h1><p className="subtitle">Pusat pengelolaan data dan akses operasional.</p></div></div><div className="administrator-grid">{ADMIN_MENUS.map((item,index)=><Link href={item.href} className="card administrator-card" key={item.href}><span className="administrator-number">0{index+1}</span><h2>{item.label}</h2><p>{item.description}</p><span className="administrator-open">Buka menu →</span></Link>)}</div></section>;
}
