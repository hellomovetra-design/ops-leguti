"use client";

import { Filter, Search } from "lucide-react";

export type Filters = { search: string; status: string; category: string; area: string; changed: string };

export function ReportFilters({ value, onChange, areas = [] }: { value: Filters; onChange: (filters: Filters) => void; areas?: string[] }) {
  const update = (key: keyof Filters, next: string) => onChange({ ...value, [key]: next });
  return (
    <div className="filter-bar">
      <div className="field"><Search size={14} /><input className="control" placeholder="Cari AWB, penerima, atau kurir..." value={value.search} onChange={(e) => update("search", e.target.value)} /></div>
      <select className="control" value={value.status} onChange={(e) => update("status", e.target.value)} aria-label="Status POD">
        <option value="">Semua Status POD</option><option>DELIVERED</option><option>FAILED</option><option>PENDING</option><option>RETURN</option>
      </select>
      <select className="control" value={value.category} onChange={(e) => update("category", e.target.value)} aria-label="Kategori alamat">
        <option value="">Semua Kategori</option><option>OFFICE</option><option>RESIDENCE</option><option>UNKNOWN</option>
      </select>
      <select className="control" value={value.area} onChange={(e) => update("area", e.target.value)} aria-label="Area">
        <option value="">Semua Area</option>{areas.map((area) => <option key={area}>{area}</option>)}
      </select>
      <select className="control" value={value.changed} onChange={(e) => update("changed", e.target.value)} aria-label="Kurir berubah">
        <option value="">Kurir Berubah?</option><option>YA</option><option>TIDAK</option>
      </select>
      <button className="btn" onClick={() => onChange({ search: "", status: "", category: "", area: "", changed: "" })}><Filter size={13} /> Reset</button>
    </div>
  );
}
