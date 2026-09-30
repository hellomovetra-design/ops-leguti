"use client";
import { useState } from "react";
import { PageHeader } from "./app-shell";
import { CHECK_COLUMNS, CourierCheck, checkCell } from "@/lib/courier-checks";
import { useCourierChecks } from "./use-courier-checks";
import "./courier-check-report.css";

export function CourierCheckReport() {
  const { items, error, loading, load } = useCourierChecks();
  const [query, setQuery] = useState(""), [from, setFrom] = useState(""), [to, setTo] = useState(""), [result, setResult] = useState("");
  const filtered = items.filter(x => (!from || x.inspection_date >= from) && (!to || x.inspection_date <= to) && (!result || x.result === result) && [x.courier_name, x.courier_id, x.inspector_name, x.delivery_area, x.inspection_location].join(" ").toLowerCase().includes(query.toLowerCase()));
  const validPeriod = !from || !to || from <= to;
  const links = (item: CourierCheck) => [...(item.documentation_url ? [item.documentation_url] : []), ...item.photos.map(p => p.url)];
  function csv() {
    const escape = (s: string) => '"' + (/^[=+@\-\t\r]/.test(s) ? "'" : "") + s.replaceAll('"', '""') + '"';
    const rows = [CHECK_COLUMNS.map(c => c[1]), ...filtered.map(item => CHECK_COLUMNS.map(([key]) => key === "documentation_url" ? links(item).map(link => new URL(link, window.location.origin).href).join(" | ") : checkCell(item, key)))];
    const url = URL.createObjectURL(new Blob(["\uFEFF" + rows.map(row => row.map(escape).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "pemeriksaan-connote.csv"; a.click(); URL.revokeObjectURL(url);
  }
  return <section className="courier-report">
    <div className="courier-report-controls"><PageHeader eyebrow="BAWAAN KURIR" title="Laporan Pemeriksaan Connote" subtitle="Laporan dari form PWA, mengikuti 14 kolom template pemeriksaan." />
      <div className="courier-report-filters">
        <label>Cari kurir / PIC<input value={query} onChange={e => setQuery(e.target.value)} placeholder="Nama, ID, area…" /></label>
        <label>Dari tanggal<input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
        <label>Sampai tanggal<input type="date" value={to} onChange={e => setTo(e.target.value)} /></label>
        <label>Hasil<select value={result} onChange={e => setResult(e.target.value)}><option value="">Semua hasil</option><option>Sesuai</option><option>Tidak Sesuai</option></select></label>
        <button type="button" onClick={() => load()}>Refresh</button>
        <button type="button" disabled={loading || !!error || !validPeriod || !filtered.length} onClick={csv}>Unduh CSV</button>
        <button type="button" disabled={loading || !!error || !validPeriod} onClick={() => window.print()}>Cetak laporan</button>
      </div>
      {!validPeriod && <p role="alert">Tanggal awal tidak boleh melebihi tanggal akhir.</p>}
      {error ? <p role="alert">{error} Data sebelumnya, jika ada, belum diperbarui.</p> : loading ? <p role="status">Memuat laporan…</p> : <p>{filtered.length} pemeriksaan · {filtered.filter(x => x.result === "Tidak Sesuai").length} tidak sesuai · Pembaruan otomatis setiap 60 detik.</p>}
    </div>
    <div className="courier-print-title">Form Pemeriksaan Connote{from || to ? " · " + (from || "Awal") + " s.d. " + (to || "Sekarang") : ""}</div>
    <div className="courier-report-scroll"><table className="courier-report-table">
      <colgroup>{[19,18,21,23,13,16,19,20,24,18,28,20,17,27].map((w,i) => <col key={i} style={{width: (w / 283 * 100) + "%"}} />)}</colgroup>
      <thead><tr>{CHECK_COLUMNS.map(([key,label]) => <th key={key} scope="col">{label}</th>)}</tr></thead>
      <tbody>{filtered.map(item => <tr key={item.id}>{CHECK_COLUMNS.map(([key]) => <td key={key}>{key === "documentation_url" ? links(item).map((url,i) => <a key={i} href={url} target="_blank" rel="noreferrer">Dokumentasi {i+1}<span className="courier-print-url">{url}</span><br /></a>) : key === "result" ? <span className={item.result === "Sesuai" ? "courier-result-ok" : "courier-result-issue"}>{item.result}</span> : checkCell(item,key)}</td>)}</tr>)}
      {!filtered.length && <tr className="courier-screen-empty"><td colSpan={14}>{loading ? "Memuat laporan…" : error ? "Laporan belum tersedia." : "Belum ada pemeriksaan pada filter ini."}</td></tr>}
      {Array.from({length:Math.max(0,15-filtered.length)},(_,i) => <tr className="courier-print-blank" key={"blank"+i}>{CHECK_COLUMNS.map(([key]) => <td key={key}>&nbsp;</td>)}</tr>)}
      </tbody>
    </table></div>
  </section>;
}
