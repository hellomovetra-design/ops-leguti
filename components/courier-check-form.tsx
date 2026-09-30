"use client";
import { useEffect, useRef, useState } from "react";
import { CHECK_COLUMNS, Courier, CourierCheck, courierRole } from "@/lib/courier-checks";
import { jakartaNow } from "@/lib/problem-solving-daily";

type Props = { record: CourierCheck | null; onSaved: (item: CourierCheck) => void };
export function CourierCheckForm({ record, onSaved }: Props) {
  const [form, setForm] = useState(() => {
    const now = jakartaNow();
    return record ? { ...record, inspection_time: record.inspection_time.slice(0,5), runsheet_count: String(record.runsheet_count), physical_count: String(record.physical_count) }
      : { id: crypto.randomUUID(), inspection_date: now.incident_date, inspection_time: now.incident_time, delivery_area: "", inspector_name: "", courier_id: "", courier_name: "", position: "", employment: "", runsheet_count: "", physical_count: "", result: "", documentation_url: "", inspection_location: "", notes: "", updated_at: "" };
  });
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [units, setUnits] = useState<string[]>([]);
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
      setCouriers(data.couriers || []); setUnits(data.units || []);
      if (!data.couriers?.length) setLookupError("Belum ada kurir aktif pada database karyawan.");
    }).catch(e => { if (e.name !== "AbortError") setLookupError(e.message); });
    return () => controller.abort();
  }, []);
  const update = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }));
  const label = (key: string) => CHECK_COLUMNS.find(c => c[0] === key)?.[1] || key;
  const selectCourier = (id: string) => {
    const courier = couriers.find(c => c.nik === id);
    if (!courier) return;
    setForm(f => ({ ...f, courier_id: id, courier_name: courier.name, position: courierRole(courier.position), employment: courier.employment || "", delivery_area: f.delivery_area || courier.hub || "" }));
  };
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current || !editable) return;
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
    <fieldset disabled={saving || !editable}>
      <label>{label("inspection_date")} *<input type="date" required value={form.inspection_date} onChange={e => update("inspection_date", e.target.value)} /></label>
      <label>{label("delivery_area")} *<input required maxLength={160} list="courier-areas" value={form.delivery_area} onChange={e => update("delivery_area", e.target.value)} placeholder="Nama facility / area delivery" /><datalist id="courier-areas">{units.map(u => <option key={u} value={u} />)}</datalist></label>
      <label>{label("inspector_name")} *<input required maxLength={160} value={form.inspector_name} onChange={e => update("inspector_name", e.target.value)} placeholder="Nama security officer pemeriksa" /></label>
      <label>{label("courier_name")} *<select required value={form.courier_id} onChange={e => selectCourier(e.target.value)}><option value="">Pilih kurir aktif</option>{record && !couriers.some(c => c.nik === record.courier_id) && <option value={record.courier_id}>{record.courier_name} · {record.courier_id} (data tersimpan)</option>}{couriers.map(c => <option key={c.nik} value={c.nik}>{c.name} · {c.nik}</option>)}</select></label>
      <div className="mobile-grid"><label>{label("courier_id")}<input readOnly value={form.courier_id} /></label><label>{label("position")}<input readOnly value={form.position} /></label></div>
      <label>{label("employment")} *<input required maxLength={160} readOnly={!!couriers.find(c => c.nik === form.courier_id)?.employment} value={form.employment} onChange={e => update("employment", e.target.value)} placeholder="Isi jika belum tersedia di data karyawan" /></label>
      <label>{label("runsheet_count")} *<input type="number" inputMode="numeric" min={0} max={1000000} step={1} required value={form.runsheet_count} onChange={e => update("runsheet_count", e.target.value)} /><small>Total connote pada aplikasi SCA Delivery.</small></label>
      <label>{label("physical_count")} *<input type="number" inputMode="numeric" min={0} max={1000000} step={1} required value={form.physical_count} onChange={e => update("physical_count", e.target.value)} /></label>
      {form.runsheet_count !== "" && form.physical_count !== "" && <p className="courier-count-hint">Selisih fisik − runsheet: {Number(form.physical_count) - Number(form.runsheet_count)} connote. Tentukan hasil setelah pemeriksaan.</p>}
      <label>{label("result")} *<select required value={form.result} onChange={e => update("result", e.target.value)}><option value="">Pilih hasil pemeriksaan</option><option>Sesuai</option><option>Tidak Sesuai</option></select></label>
      <label>{label("documentation_url")}<input type="url" maxLength={2048} value={form.documentation_url} onChange={e => update("documentation_url", e.target.value)} placeholder="https://… (opsional jika mengunggah foto)" /></label>
      <label>Foto dokumentasi<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e => {
        const selected = Array.from(e.target.files || []);
        if (selected.length + (record?.photos.length || 0) > 3 || selected.reduce((sum, f) => sum + f.size, 0) > 3 * 1024 * 1024 || selected.some(f => !["image/jpeg","image/png","image/webp"].includes(f.type))) { setError("Maksimal 3 foto JPG/PNG/WebP, total unggahan 3 MB."); setFiles([]); e.target.value = ""; return; }
        setFiles(selected); setError("");
      }} /><small>{files.length} foto dipilih · Foto menjadi link dokumentasi pada laporan.</small></label>
      <label>{label("inspection_location")} *<input required maxLength={160} value={form.inspection_location} onChange={e => update("inspection_location", e.target.value)} placeholder="Nama cabang / lokasi pemeriksaan" /></label>
      <label>{label("inspection_time")} *<input type="time" required value={form.inspection_time} onChange={e => update("inspection_time", e.target.value)} /><small>WIB · Tanggal dan jam dapat diubah sesuai kejadian.</small></label>
      <label>{label("notes")}<textarea rows={3} maxLength={10000} value={form.notes} onChange={e => update("notes", e.target.value)} /></label>
    </fieldset>
    {record?.photos.map((p,i) => <a key={i} href={p.url} target="_blank" rel="noreferrer"><img className="pwa-daily-photo" src={p.url} alt={p.name || "Dokumentasi pemeriksaan"} /></a>)}
    {editable && <button className="mobile-submit" disabled={saving || (!record && !couriers.length)}>{saving ? "Menyimpan…" : record ? "Simpan perubahan" : "Simpan pemeriksaan"}</button>}
    {error && <p className="pwa-profile-notice error" role="alert">{error}</p>}
  </form>;
}
