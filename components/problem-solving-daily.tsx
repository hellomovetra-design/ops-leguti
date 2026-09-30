"use client";
import { useEffect, useRef, useState } from "react";
import { DAILY_CATEGORIES, DAILY_STATUSES, DailyRecord, incidentDay, jakartaNow } from "@/lib/problem-solving-daily";

type Props = { record: DailyRecord | null; items: DailyRecord[]; error: string; onSaved: (item: DailyRecord) => void; onOpen: (item: DailyRecord | null) => void };
export function ProblemSolvingDaily({ record, items, error, onSaved, onOpen }: Props) {
  const [form, setForm] = useState(() => record ? { ...record, incident_time: record.incident_time.slice(0, 5) } : { id: crypto.randomUUID(), title: "", category: "Jaringan", ...jakartaNow(), unit: "", description: "", solution: "", status: "open", updated_at: "" });
  const [availableUnits, setUnits] = useState<string[]>([]);
  const [unitError, setUnitError] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [failed, setFailed] = useState(false);
  const locked = useRef(false);
  const editable = !record || record.can_edit === true;
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/problem-solving-daily?type=units", { cache: "no-store", signal: controller.signal }).then(async r => {
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error || "Lokasi/unit belum dapat dimuat.");
      setUnits(data.units || []);
      if (!data.units?.length) setUnitError("Belum ada lokasi/unit pada data karyawan.");
    }).catch(e => { if (e.name !== "AbortError") setUnitError(e.message); });
    return () => controller.abort();
  }, []);
  const update = (key: string, value: string) => setForm(previous => ({ ...previous, [key]: value }));
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (locked.current || !editable) return;
    locked.current = true; setSaving(true); setNotice(""); setFailed(false);
    try {
      const data = new FormData();
      data.append("action", record ? "update" : "create");
      for (const key of ["id", "title", "category", "incident_date", "incident_time", "unit", "description", "solution", "status", "updated_at"] as const) data.append(key, String(form[key]));
      files.forEach(file => data.append("photos", file));
      const response = await fetch("/api/problem-solving-daily", { method: "POST", body: data });
      const result = await response.json();
      if (!response.ok || !result.ok || !result.item) throw new Error(result.error || "Catatan belum berhasil disimpan.");
      onSaved(result.item);
    } catch (e) { setFailed(true); setNotice(e instanceof Error ? e.message : "Gagal menyimpan catatan."); }
    finally { locked.current = false; setSaving(false); }
  };
  return <section className="pwa-daily">
    <div className="pwa-page-title">Problem Solving Daily</div>
    <form className="mobile-card pwa-form" onSubmit={submit}>
      <h2>{record ? "Detail kendala harian" : "Catat kendala harian"}</h2>
      <fieldset disabled={saving || !editable}>
        <label>Judul kendala<input required maxLength={160} value={form.title} onChange={e => update("title", e.target.value)} /></label>
        <label>Kategori<select value={form.category} onChange={e => update("category", e.target.value)}>{DAILY_CATEGORIES.map(value => <option key={value}>{value}</option>)}</select></label>
        <div className="mobile-grid">
          <label>Tanggal kejadian<input type="date" required value={form.incident_date} onChange={e => update("incident_date", e.target.value)} /></label>
          <label>Jam kejadian<input type="time" required value={form.incident_time} onChange={e => update("incident_time", e.target.value)} /></label>
        </div>
        <p className="pwa-daily-day">Hari: <output aria-label="Hari kejadian">{incidentDay(form.incident_date)}</output> · WIB</p>
        <label>Lokasi/unit<select required value={form.unit} onChange={e => update("unit", e.target.value)}><option value="">Pilih lokasi/unit</option>{form.unit && !availableUnits.includes(form.unit) && <option>{form.unit}</option>}{availableUnits.map(unit => <option key={unit}>{unit}</option>)}</select></label>
        {unitError && <p role="alert">{unitError}</p>}
        <label>Uraian kendala<textarea required maxLength={10000} rows={4} value={form.description} onChange={e => update("description", e.target.value)} /></label>
        <label>Tindakan/solusi<textarea maxLength={10000} rows={4} value={form.solution} onChange={e => update("solution", e.target.value)} /></label>
        <div className="pwa-daily-field"><label htmlFor="daily-status">Status</label><select id="daily-status" value={form.status} onChange={e => update("status", e.target.value)}>{Object.entries(DAILY_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        {editable && <label>Foto pendukung (opsional)<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e => {
          const selected = Array.from(e.target.files || []);
          if (selected.length + (record?.photos.length || 0) > 3 || selected.reduce((n, f) => n + f.size, 0) > 3 * 1024 * 1024 || selected.some(f => !["image/jpeg", "image/png", "image/webp"].includes(f.type))) { setFailed(true); setNotice("Maksimal 3 foto JPG/PNG/WebP, total unggahan maksimal 3 MB."); setFiles([]); e.target.value = ""; return; }
          setFiles(selected); setNotice("");
        }} /><small>{files.length} foto dipilih · Maksimal 3 foto, total unggahan 3 MB</small></label>}
      </fieldset>
      {record?.photos.map((photo, i) => <a key={i} href={photo.url} target="_blank" rel="noreferrer"><img className="pwa-daily-photo" src={photo.url} alt={photo.name || "Foto pendukung"} /></a>)}
      {editable && <button className="mobile-submit" type="submit" disabled={saving || !availableUnits.length}>{saving ? "Menyimpan…" : record ? "Simpan perubahan" : "Simpan catatan"}</button>}
      {notice && <p className={`pwa-profile-notice${failed ? " error" : ""}`} role={failed ? "alert" : "status"}>{notice}</p>}
      {record && <><small>Dibuat: {new Date(record.created_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB<br />Diperbarui: {new Date(record.updated_at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB</small><button type="button" className="pwa-profile-cancel" disabled={saving} onClick={() => onOpen(null)}>Catat kendala baru</button></>}
    </form>
    <div className="pwa-section"><h2>Catatan harian</h2></div>
    {error ? <p className="pwa-empty" role="alert">{error}</p> : items.length ? <div className="pwa-list">{items.map(item => <button key={item.id} className="pwa-list-item" onClick={() => onOpen(item)}><span><strong>{item.title}</strong><small>{item.unit} · {incidentDay(item.incident_date)}, {item.incident_date} {item.incident_time.slice(0, 5)} WIB</small></span><em>{DAILY_STATUSES[item.status]}</em></button>)}</div> : <p className="pwa-empty">Belum ada catatan harian.</p>}
  </section>;
}
