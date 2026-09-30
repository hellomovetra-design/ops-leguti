"use client";
import { useEffect, useRef, useState } from "react";
import { CHECK_COLUMNS, Courier, CourierCheck, DELIVERY_AREAS, deliveryArea } from "@/lib/courier-checks";
import { jakartaNow } from "@/lib/problem-solving-daily";

type Props = { record: CourierCheck | null; onSaved: (item: CourierCheck) => void };
export function CourierCheckForm({ record, onSaved }: Props) {
  const [form, setForm] = useState(() => {
    const now = jakartaNow();
    return record ? { ...record, delivery_area: deliveryArea(record.delivery_area), inspection_time: record.inspection_time.slice(0,5), runsheet_count: String(record.runsheet_count), physical_count: String(record.physical_count) }
      : { id: crypto.randomUUID(), inspection_date: now.incident_date, inspection_time: now.incident_time, delivery_area: "", inspector_name: "", courier_id: "", courier_name: "", position: "", employment: "", runsheet_count: "", physical_count: "", result: "", documentation_url: "", inspection_location: "", notes: "", updated_at: "" };
  });
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [search, setSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [lookupError, setLookupError] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const editable = !record || record.can_edit;
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/courier-checks?type=couriers", { cache: "no-store", signal: controller.signal }).then(async r => {
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(data.error || "Data kurir belum tersedia.");
      setCouriers(data.couriers || []);
      if (!data.couriers?.length) setLookupError("Belum ada kurir aktif pada database karyawan.");
    }).catch(e => { if (e.name !== "AbortError") setLookupError(e.message); });
    if (!record) fetch("/api/ops-desk?type=profile", { cache: "no-store", signal: controller.signal }).then(async r => {
      const data = await r.json();
      if (!r.ok || data.error || !data.profile?.email) throw new Error("Nama akun belum dapat dimuat. Coba buka ulang form.");
      setForm(f => ({ ...f, inspector_name: data.profile.display_name?.trim() || data.profile.email.split("@")[0] }));
    }).catch(e => { if (e.name !== "AbortError") setProfileError(e.message); });
    return () => controller.abort();
  }, []);
  const update = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }));
  const label = (key: string) => CHECK_COLUMNS.find(c => c[0] === key)?.[1] || key;
  const selectCourier = (id: string) => {
    const courier = couriers.find(c => c.nik === id);
    if (!courier) return;
    setForm(f => ({ ...f, courier_id: id, courier_name: courier.name, position: courier.position || "", employment: courier.employment || "", delivery_area: f.delivery_area || deliveryArea(courier.hub || "") }));
    setPickerOpen(false); setSearch("");
  };
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current || !editable) return;
    if (!form.courier_id) { setError("Pilih kurir dari pencarian nama atau ID."); setPickerOpen(true); return; }
    lock.current = true; setSaving(true); setError("");
    try {
      const data = new FormData();
      data.append("action", record ? "update" : "create");
      for (const key of ["id", "updated_at", ...CHECK_COLUMNS.map(c => c[0])]) data.append(key, String(form[key as keyof typeof form] ?? ""));
      files.forEach(file => data.append("photos", file));
      const response = await fetch("/api/courier-checks", { method: "POST", body: data });
      const result = await response.json();
      if (!response.ok || !result.ok || !result.item) throw new Error(result.error || "Pemeriksaan belum berhasil disimpan.");
      onSaved(result.item);
    } catch (e) { setError(e instanceof Error ? e.message : "Gagal menyimpan pemeriksaan."); }
    finally { lock.current = false; setSaving(false); }
  }
  return <form className="mobile-card pwa-form courier-check-form" onSubmit={submit}>
    <h2>{record ? "Detail pemeriksaan connote" : "Form pemeriksaan connote"}</h2>
    <p className="courier-form-intro">Isi satu pemeriksaan per kurir. Kolom bertanda * wajib diisi.</p>
    {lookupError && <p role="alert">{lookupError}</p>}
    {profileError && <p role="alert">{profileError}</p>}
    <fieldset disabled={saving || !editable}>
      <label>{label("inspection_date")} *<input type="date" required value={form.inspection_date} onChange={e => update("inspection_date", e.target.value)} /></label>
      <label>{label("delivery_area")} *<select required value={form.delivery_area} onChange={e => update("delivery_area", e.target.value)}><option value="">Pilih area delivery</option>{DELIVERY_AREAS.map(u => <option key={u}>{u}</option>)}</select></label>
      <label>{label("inspector_name")} *<input required readOnly value={form.inspector_name} placeholder="Mengikuti akun login" /></label>
      <div className="courier-picker"><label id="courier-picker-label">{label("courier_name")} *</label>
        <button type="button" aria-labelledby="courier-picker-label" aria-expanded={pickerOpen} aria-controls="courier-picker-results" onClick={() => setPickerOpen(v => !v)}>{form.courier_name ? form.courier_name + " · " + form.courier_id : "Pilih kurir aktif"}<span aria-hidden="true">⌄</span></button>
        {pickerOpen && <div className="courier-picker-panel"><label>Cari nama atau ID kurir<input autoFocus type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Ketik nama atau ID…" /></label><div id="courier-picker-results" className="courier-picker-results">{couriers.filter(c => (c.name + " " + c.nik).toLowerCase().includes(search.toLowerCase().trim())).map(c => <button type="button" key={c.nik} onClick={() => selectCourier(c.nik)}><strong>{c.name}</strong><small>{c.nik} · {c.position}</small></button>)}{!couriers.some(c => (c.name + " " + c.nik).toLowerCase().includes(search.toLowerCase().trim())) && <p>Tidak ada kurir yang cocok.</p>}</div><button type="button" onClick={() => setPickerOpen(false)}>Tutup pencarian</button></div>}
      </div>
      <div className="mobile-grid"><label>{label("courier_id")}<input required readOnly value={form.courier_id} /></label><label>{label("position")} *<input required maxLength={160} value={form.position} onChange={e => update("position", e.target.value)} /></label></div>
      <label>{label("employment")} *<input required maxLength={160} readOnly={!!couriers.find(c => c.nik === form.courier_id)?.employment} value={form.employment} onChange={e => update("employment", e.target.value)} placeholder="Isi jika belum tersedia di data karyawan" /></label>
      <label>{label("runsheet_count")} *<input type="number" inputMode="numeric" min={0} max={1000000} step={1} required value={form.runsheet_count} onChange={e => update("runsheet_count", e.target.value)} /><small>Total connote pada aplikasi SCA Delivery.</small></label>
      <label>{label("physical_count")} *<input type="number" inputMode="numeric" min={0} max={1000000} step={1} required value={form.physical_count} onChange={e => update("physical_count", e.target.value)} /></label>
      {form.runsheet_count !== "" && form.physical_count !== "" && <p className="courier-count-hint">Selisih fisik − runsheet: {Number(form.physical_count) - Number(form.runsheet_count)} connote. Tentukan hasil setelah pemeriksaan.</p>}
      <label>{label("result")} *<select required value={form.result} onChange={e => update("result", e.target.value)}><option value="">Pilih hasil pemeriksaan</option><option>Sesuai</option><option>Tidak Sesuai</option></select></label>
      <label>{label("documentation_url")}<input readOnly value={form.documentation_url} placeholder={files.length ? "Link publik dibuat setelah foto disimpan" : "Otomatis dari foto dokumentasi"} /></label>
      {form.documentation_url && <a href={form.documentation_url} target="_blank" rel="noreferrer">Buka dokumentasi publik</a>}
      <label>Foto dokumentasi<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple onChange={e => {
        const selected = Array.from(e.target.files || []);
        if (selected.length + (record?.photos.length || 0) > 3 || selected.reduce((sum, f) => sum + f.size, 0) > 3 * 1024 * 1024 || selected.some(f => !["image/jpeg","image/png","image/webp"].includes(f.type))) { setError("Maksimal 3 foto JPG/PNG/WebP, total unggahan 3 MB."); setFiles([]); e.target.value = ""; return; }
        setFiles(selected); setError("");
      }} /><small>{files.length} foto dipilih · Setelah disimpan, siapa pun yang memiliki link dapat melihat foto tanpa login. Hindari informasi sensitif yang tidak diperlukan.</small></label>
      <label>{label("inspection_location")} *<input required maxLength={160} value={form.inspection_location} onChange={e => update("inspection_location", e.target.value)} placeholder="Nama cabang / lokasi pemeriksaan" /></label>
      <label>{label("inspection_time")} *<input type="time" required value={form.inspection_time} onChange={e => update("inspection_time", e.target.value)} /><small>WIB · Tanggal dan jam dapat diubah sesuai kejadian.</small></label>
      <label>{label("notes")}<textarea rows={3} maxLength={10000} value={form.notes} onChange={e => update("notes", e.target.value)} /></label>
    </fieldset>
    {record?.photos.map((p,i) => <a key={i} href={p.url} target="_blank" rel="noreferrer"><img className="pwa-daily-photo" src={p.url} alt={p.name || "Dokumentasi pemeriksaan"} /></a>)}
    {editable && <button className="mobile-submit" disabled={saving || (!record && !couriers.length)}>{saving ? "Menyimpan…" : record ? "Simpan perubahan" : "Simpan pemeriksaan"}</button>}
    {error && <p className="pwa-profile-notice error" role="alert">{error}</p>}
  </form>;
}
