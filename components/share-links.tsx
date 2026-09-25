"use client";

import { useEffect, useState } from "react";
import { Copy, Eye, Link2, Lock, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "./app-shell";
import { useApp } from "@/app/providers";
import { createShareLink, getShareLinksList, deleteShareLink, toggleShareLinkActive } from "@/app/actions/share";
import { isSupabaseConfigured } from "@/lib/supabase";

type LocalShareLink = {
  id: string;
  name: string;
  slug: string;
  access: "Public" | "Password";
  expires: string;
  views: number;
  active: boolean;
};

export function ShareLinks() {
  const { toast } = useApp();
  const [links, setLinks] = useState<LocalShareLink[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [accessType, setAccessType] = useState("Public");
  const [password, setPassword] = useState("");
  const [expiry, setExpiry] = useState("");
  const [allowDownload, setAllowDownload] = useState("true");

  const loadLinks = async () => {
    if (isSupabaseConfigured()) {
      const res = await getShareLinksList();
      if (res.success && res.data) {
        const mapped = res.data.map((l: any) => ({
          id: l.id,
          name: l.name,
          slug: l.slug,
          access: l.password_hash ? ("Password" as const) : ("Public" as const),
          expires: l.expires_at ? new Date(l.expires_at).toLocaleDateString("id-ID") : "Tidak ada",
          views: l.view_count || 0,
          active: l.is_active
        }));
        setLinks(mapped);
      }
    } else {
      setLinks([
        { id: "weekly-executive-7f3a", name: "Weekly Executive Dashboard", slug: "weekly-executive-7f3a", access: "Public", expires: "10/7/2026", views: 28, active: true },
        { id: "ops-review-b19c", name: "Operational Review Area JKS", slug: "ops-review-b19c", access: "Password", expires: "31/7/2026", views: 14, active: true },
      ]);
    }
  };

  useEffect(() => {
    loadLinks();
  }, []);

  const create = async () => {
    if (!name.trim()) return;
    const isPublic = accessType === "Public";
    const passValue = isPublic ? undefined : password;

    const res = await createShareLink(
      name,
      isPublic,
      passValue,
      expiry || undefined,
      allowDownload === "true",
      {}
    );

    if (res.success) {
      toast("Share link berhasil dibuat");
      setName("");
      setPassword("");
      setExpiry("");
      setShowForm(false);
      loadLinks();
    } else {
      toast(res.error || "Gagal membuat share link.");
    }
  };

  const remove = async (id: string) => {
    const res = await deleteShareLink(id);
    if (res.success) {
      toast("Share link berhasil dihapus");
      loadLinks();
    } else {
      toast("Gagal menghapus share link.");
    }
  };

  const toggleActive = async (id: string, currentActive: boolean) => {
    const res = await toggleShareLinkActive(id, !currentActive);
    if (res.success) {
      toast(`Status link berhasil ${!currentActive ? "diaktifkan" : "dinonaktifkan"}`);
      loadLinks();
    } else {
      toast("Gagal mengubah status link.");
    }
  };

  const copy = async (slug: string) => {
    const shareUrl = `${location.origin}/public/${slug}`;
    await navigator.clipboard?.writeText(shareUrl);
    toast("Link disalin ke clipboard");
  };

  return <>
    <PageHeader eyebrow="Controlled sharing" title="Share Links" subtitle="Bagikan dashboard read-only secara aman kepada pimpinan atau mitra." actions={<button className="btn btn-primary" onClick={() => setShowForm(true)}><Plus size={13} /> Buat Share Link</button>} />
    {showForm && <div className="card" style={{ marginBottom: 14 }}><div className="card-head"><div><div className="card-title">Link Baru</div><div className="card-sub">Atur nama dan tingkat akses</div></div></div><div className="panel-pad" style={{ paddingTop: 3 }}><div className="form-grid">
      <div><label className="form-label">Nama Dashboard</label><input autoFocus className="control" value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: Laporan Mingguan Direksi" /></div>
      <div><label className="form-label">Tipe Akses</label><select className="control" value={accessType} onChange={(e) => setAccessType(e.target.value)}><option value="Public">Public read-only (tanpa login)</option><option value="Password">Private dengan password</option></select></div>
      {accessType === "Password" && <div><label className="form-label">Password Tautan</label><input className="control" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Masukkan password pengaman" /></div>}
      <div><label className="form-label">Tanggal Kedaluwarsa</label><input className="control" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></div>
      <div><label className="form-label">Izin Download</label><select className="control" value={allowDownload} onChange={(e) => setAllowDownload(e.target.value)}><option value="true">Diizinkan</option><option value="false">Tidak diizinkan</option></select></div>
    </div><div className="actions" style={{ marginTop: 14, justifyContent: "flex-end" }}><button className="btn" onClick={() => setShowForm(false)}>Batal</button><button className="btn btn-red" onClick={create}>Generate Link</button></div></div></div>}
    <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}><ShareMetric label="Link Aktif" value={links.filter((x) => x.active).length} icon={<Link2 size={15} />} /><ShareMetric label="Total Views" value={links.reduce((s, x) => s + x.views, 0)} icon={<Eye size={15} />} /><ShareMetric label="Protected Links" value={links.filter((x) => x.access === "Password").length} icon={<Lock size={15} />} /></div>
    <div className="card"><div className="card-head"><div><div className="card-title">Dashboard yang Dibagikan</div><div className="card-sub">Akses eksternal dan aktivitas terkini</div></div></div><div className="table-wrap"><table><thead><tr><th>Nama</th><th>Share URL</th><th>Akses</th><th>Kedaluwarsa</th><th>Views</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{links.map((link) => <tr key={link.id}><td><b>{link.name}</b></td><td><span style={{ color: "#667085" }}>/public/{link.slug}</span></td><td><span className={`badge ${link.access === "Public" ? "office" : "pending"}`}>{link.access === "Password" && <Lock size={9} />}{link.access.toUpperCase()}</span></td><td>{link.expires}</td><td>{link.views}</td><td><button className={`badge ${link.active ? "success" : "neutral"}`} style={{ border: 0, cursor: "pointer" }} onClick={() => toggleActive(link.id, link.active)}>{link.active ? "ACTIVE" : "DISABLED"}</button></td><td><div className="actions"><button className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => copy(link.slug)} aria-label="Salin link"><Copy size={13} /></button><button className="icon-btn" style={{ width: 30, height: 30, color: "#d92d20" }} onClick={() => remove(link.id)} aria-label="Hapus"><Trash2 size={13} /></button></div></td></tr>)}</tbody></table></div></div>
  </>;
}
function ShareMetric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) { return <div className="kpi" style={{ "--accent": "#1b2c6d", "--accent-soft": "#eef1fa" } as React.CSSProperties}><div className="kpi-top"><span>{label}</span><span className="kpi-icon">{icon}</span></div><div className="kpi-value">{value}</div><div className="kpi-meta"><span className="up">●</span>terpantau sistem</div></div>; }
