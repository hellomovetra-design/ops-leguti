"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { DAILY_CATEGORIES, DAILY_STATUSES, DailyRecord } from "@/lib/problem-solving-daily";
import { PageHeader } from "./app-shell";
import "./admin-daily-panel.css";

export function AdminDailyPanel() {
  const [items, setItems] = useState<DailyRecord[]>([]), [units, setUnits] = useState<string[]>([]);
  const [q, setQ] = useState(""), [search, setSearch] = useState(""), [status, setStatus] = useState(""), [category, setCategory] = useState(""), [unit, setUnit] = useState(""), [from, setFrom] = useState(""), [to, setTo] = useState("");
  const [page, setPage] = useState(0), [total, setTotal] = useState(0), [loading, setLoading] = useState(true), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<DailyRecord | null>(null), [solution, setSolution] = useState(""), [reviewStatus, setReviewStatus] = useState("open"), [saving, setSaving] = useState(false), [saveError, setSaveError] = useState("");
  const sequence = useRef(0), lock = useRef(false), detail = useRef<HTMLDivElement>(null);
  useEffect(() => { const timer = setTimeout(() => { setSearch(q); setPage(0); }, 300); return () => clearTimeout(timer); }, [q]);
  const load = useCallback(async () => {
    const ticket = ++sequence.current; setLoading(true);
    try {
      const params = new URLSearchParams({ scope: "admin", offset: String(page * 25), q: search, status, category, unit, from, to });
      const response = await fetch(`/api/problem-solving-daily?${params}`, { cache: "no-store" });
      const data = await response.json();
      if (ticket !== sequence.current) return;
      if (!response.ok) throw new Error(data.error || "Catatan belum dapat dimuat.");
      setItems(data.items || []); setTotal(data.total || 0); setError("");
    } catch (e) { if (ticket === sequence.current) setError(e instanceof Error ? e.message : "Periksa koneksi Anda."); }
    finally { if (ticket === sequence.current) setLoading(false); }
  }, [page, search, status, category, unit, from, to]);
  useEffect(() => {
    void load();
    const refresh = () => { if (document.visibilityState === "visible" && !lock.current) void load(); };
    const timer = setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => { sequence.current++; clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [load]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/problem-solving-daily?type=units", { cache: "no-store", signal: controller.signal }).then(async response => {
      const data = await response.json(); if (response.ok) setUnits(data.units || []);
    }).catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!selected) return;
    const previous = document.activeElement as HTMLElement | null, overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; detail.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !lock.current) setSelected(null);
      if (event.key !== "Tab") return;
      const controls = detail.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],textarea,select');
      if (!controls?.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", key); previous?.focus(); };
  }, [!!selected]);
  const open = (item: DailyRecord) => { setSelected(item); setSolution(item.solution); setReviewStatus(item.status); setSaveError(""); };
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!selected || lock.current) return;
    lock.current = true; setSaving(true); setSaveError(""); setNotice("");
    try {
      const form = new FormData();
      Object.entries({ action: "review", id: selected.id, updated_at: selected.updated_at, solution, status: reviewStatus }).forEach(([key, value]) => form.append(key, value));
      const response = await fetch("/api/problem-solving-daily", { method: "POST", body: form });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Perubahan belum tersimpan.");
      setSelected(null); setNotice("Status dan solusi berhasil diperbarui. PWA menggunakan catatan yang sama."); void load();
    } catch (e) { setSaveError(e instanceof Error ? e.message : "Perubahan belum tersimpan."); }
    finally { lock.current = false; setSaving(false); }
  }
  const filter = (setter: (value: string) => void, value: string) => { setter(value); setPage(0); };
  return <section className="admin-daily">
    <PageHeader eyebrow="OPERASIONAL · CATATAN HARIAN" title="Problem Solving Daily" subtitle="Pantau kendala dari PWA dan perbarui tindakan penanganannya." actions={<button disabled={loading} onClick={() => void load()}><RefreshCw size={16}/>Muat ulang</button>}/>
    <div className="admin-daily-filters">
      <label>Cari judul<input value={q} onChange={e => setQ(e.target.value)} placeholder="Judul kendala…" maxLength={160}/></label>
      <label>Status<select value={status} onChange={e => filter(setStatus, e.target.value)}><option value="">Semua status</option>{Object.entries(DAILY_STATUSES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Kategori<select value={category} onChange={e => filter(setCategory, e.target.value)}><option value="">Semua kategori</option>{DAILY_CATEGORIES.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Lokasi/unit<select value={unit} onChange={e => filter(setUnit, e.target.value)}><option value="">Semua unit</option>{units.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Dari tanggal<input type="date" value={from} onChange={e => filter(setFrom, e.target.value)}/></label><label>Sampai tanggal<input type="date" value={to} onChange={e => filter(setTo, e.target.value)}/></label>
    </div>
    {notice && <p className="admin-daily-notice" role="status">{notice}</p>}{error && <p className="admin-daily-error" role="alert">{error}</p>}
    <p className="admin-daily-info" role="status">{loading ? "Memuat catatan…" : `${total} catatan sesuai filter`} · Pembaruan otomatis setiap 15 detik</p>
    <div className="table-wrap" aria-busy={loading}><table><thead><tr><th>Kendala</th><th>Kejadian</th><th>Unit</th><th>Pengirim</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td><strong>{item.title}</strong><small>{item.category} · {item.photos.length} foto</small></td><td>{item.incident_date}<small>{item.incident_time.slice(0,5)} WIB</small></td><td>{item.unit}</td><td>{item.created_by}</td><td><span className="pill">{DAILY_STATUSES[item.status]}</span></td><td><button className="table-action" onClick={() => open(item)}>Lihat / tangani</button></td></tr>)}</tbody></table>{!items.length && <p className="admin-daily-info">{loading ? "Memuat…" : error ? "Data belum tersedia." : "Belum ada catatan sesuai filter."}</p>}</div>
    <div className="admin-daily-pagination"><span>Halaman {page + 1} · {total} catatan</span><button disabled={loading || page === 0} onClick={() => setPage(page - 1)}>Sebelumnya</button><button disabled={loading || (page + 1) * 25 >= total} onClick={() => setPage(page + 1)}>Berikutnya</button></div>
    {selected && <div className="admin-daily-overlay"><div className="admin-daily-detail" role="dialog" aria-modal="true" aria-labelledby="daily-detail-title" ref={detail}>
      <header><h2 id="daily-detail-title">{selected.title}</h2><button disabled={saving} aria-label="Tutup detail" onClick={() => setSelected(null)}><X size={20}/></button></header>
      <p>{selected.category} · {selected.unit} · {selected.incident_date} {selected.incident_time.slice(0,5)} WIB</p><small>Pengirim: {selected.created_by}</small>
      <h3>Uraian kendala</h3><p className="admin-daily-description">{selected.description}</p>
      <div className="admin-daily-photos">{selected.photos.map((photo, i) => <a key={i} href={photo.url} target="_blank" rel="noreferrer"><img src={photo.url} alt={photo.name || "Foto pendukung"}/></a>)}</div>
      <form onSubmit={save}><label>Status penanganan<select disabled={saving} value={reviewStatus} onChange={e => setReviewStatus(e.target.value)}>{Object.entries(DAILY_STATUSES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Tindakan / solusi<textarea disabled={saving} rows={6} maxLength={10000} value={solution} onChange={e => setSolution(e.target.value)}/></label>
      {saveError && <p className="admin-daily-error" role="alert">{saveError} <button type="button" disabled={saving} onClick={() => { setSelected(null); void load(); }}>Muat ulang catatan</button></p>}
      <button className="admin-daily-save" disabled={saving}>{saving ? "Menyimpan…" : "Simpan status dan solusi"}</button></form>
    </div></div>}
  </section>;
}
