"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Bell, LogOut, Menu, RefreshCw, Settings, X, PackageSearch, Boxes, LayoutDashboard, Network, ArrowLeftRight, UserRound } from "lucide-react";
import { useApp } from "@/app/providers";
import { cn } from "@/lib/utils";

const navGroups = [
  {
    label: "MODUL OPERASIONAL",
    items: [
      { href: "/dashboard/ops-desk", label: "Ringkasan", icon: LayoutDashboard },
      { href: "/master/employees", label: "Karyawan", icon: UserRound },
      { href: "/master/structure", label: "Struktur Tim", icon: Network },
      { href: "/master/personnel-changes", label: "Perubahan Personel", icon: ArrowLeftRight },
      { href: "/dashboard/ops-desk/ots", label: "Monitoring OTS", icon: PackageSearch },
      { href: "/dashboard/ops-desk/problems", label: "Problem Barang", icon: Boxes },
    ],
  },
  { label: "PENGATURAN", items: [{ href: "/settings/ops-access", label: "Akses Leader", icon: Settings }] },
];

export function AppShell({ title, children }: { title: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { toast } = useApp();
  const displayTitle = title;

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };

  return (
    <div className="app-shell">
      <div className={cn("overlay", open && "open")} onClick={() => setOpen(false)} />
      <aside className={cn("sidebar", open && "open")}>
        <div className="brand">
          <img src="/jne-logo.jpg" alt="JNE Express" className="brand-mark" />
          <div>
            <div className="brand-title">OPS LEGUTI</div>
            <div className="brand-sub">OPS DESK</div>
          </div>
          <button className="mobile-toggle" style={{ color: "white", marginLeft: "auto" }} onClick={() => setOpen(false)} aria-label="Tutup menu"><X size={18} /></button>
        </div>

        <nav className="nav">
          {navGroups.map((group) => (
            <div key={group.label}>
              <div className="nav-label">{group.label}</div>
              {group.items.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link className={cn("nav-item", active && "active")} href={item.href} key={item.href} onClick={() => setOpen(false)}>
                    <item.icon size={16} strokeWidth={active ? 2.4 : 1.8} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-user">
          <div className="avatar">AP</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="user-name">Admin Pusat</div>
            <div className="user-role">Internal</div>
          </div>
          <button onClick={logout} title="Keluar" aria-label="Keluar" style={{ border: 0, background: "transparent", color: "#9ea9cc", cursor: "pointer", padding: 4 }}><LogOut size={15} /></button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="top-left">
            <button className="mobile-toggle icon-btn" onClick={() => setOpen(true)} aria-label="Buka menu"><Menu size={18} /></button>
            <div>
              <div className="breadcrumb">JNE Ops Leguti / Modul Aktif</div>
              <div className="page-title">{displayTitle}</div>
            </div>
          </div>
          <div className="top-actions">
            <button className="icon-btn" aria-label="Refresh" onClick={() => toast("OPS Desk siap diperbarui")}>
              <RefreshCw size={15} />
            </button>
            <button className="icon-btn" aria-label="Notifikasi"><Bell size={15} /></button>
          </div>
        </header>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}

export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow: string; title: string; subtitle: string; actions?: React.ReactNode }) {
  return (
    <div className="section-head">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="headline">{title}</h1>
        <div className="subtitle">{subtitle}</div>
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}
