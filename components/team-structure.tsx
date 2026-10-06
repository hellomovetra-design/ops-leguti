"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, ChevronDown, ChevronRight, Maximize2, Search, Users, X } from "lucide-react";
import { DEFAULT_TEAM_PHOTO, TeamPerson, teamChildren, teamManagement, teamPhoto } from "@/lib/team-structure";
import "./team-structure.css";

function PersonPhoto({ person, large = false }: { person?: TeamPerson; large?: boolean }) {
  return <img className={large ? "team-drawer-photo" : "team-card-photo"} src={teamPhoto(person)} alt={person ? `Foto ${person.name}` : "Karikatur JNE"} onError={event => { if (!event.currentTarget.src.endsWith(DEFAULT_TEAM_PHOTO)) event.currentTarget.src = DEFAULT_TEAM_PHOTO; }} />;
}
const has = (person: TeamPerson, role: string) => new RegExp(role, "i").test(person.position);
export function TeamStructure() {
  const [rows, setRows] = useState<TeamPerson[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [hub, setHub] = useState("Semua Hub"), [division, setDivision] = useState("Semua Divisi"), [status, setStatus] = useState("Aktif"), [q, setQ] = useState("");
  const [tab, setTab] = useState<"tree" | "hub" | "list">("tree"), [open, setOpen] = useState<Record<string, boolean>>({}), [selected, setSelected] = useState<TeamPerson | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/ops-desk?type=employees&view=structure", { cache: "no-store", signal });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error("Data struktur belum dapat dimuat. Silakan coba lagi.");
      const text = (value: unknown) => String(value ?? "").trim();
      setRows((data.items || []).map((item: Record<string, unknown>) => ({
        nik: text(item.nik), name: text(item.name), position: text(item.position), dept: text(item.dept),
        hub: text(item.hub).toUpperCase(), superior: text(item.superior), superior_nik: text(item.superior_nik) || null, active: item.active !== false,
        photo_url: text(item.photo_url) || DEFAULT_TEAM_PHOTO,
      })).filter((item: TeamPerson) => item.name));
    } catch (failure) { if (!signal?.aborted) setError(failure instanceof Error ? failure.message : "Data belum tersedia."); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  useEffect(() => {
    if (!selected) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setSelected(null); };
    window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close);
  }, [selected]);
  const hubs = useMemo(() => Array.from(new Set(rows.map(person => person.hub).filter(Boolean))).sort((a, b) => a === "SPC LEGUTI" ? -1 : b === "SPC LEGUTI" ? 1 : a.localeCompare(b)), [rows]);
  const divisions = useMemo(() => Array.from(new Set(rows.map(person => person.dept).filter(Boolean))).sort(), [rows]);
  const visible = useMemo(() => rows.filter(person => (hub === "Semua Hub" || person.hub === hub) && (division === "Semua Divisi" || person.dept === division) && (status === "Semua Status" || (status === "Aktif" ? person.active : !person.active)) && `${person.name} ${person.nik} ${person.position} ${person.hub}`.toLowerCase().includes(q.trim().toLowerCase())), [rows, hub, division, status, q]);
  const { supervisor, junior } = useMemo(() => teamManagement(rows), [rows]);
  const toggle = (key: string, defaultOpen = false) => setOpen(current => ({ ...current, [key]: !(current[key] ?? defaultOpen) }));
  const personCard = (person: TeamPerson) => <button key={person.nik} type="button" className="team-person-card" onClick={() => setSelected(person)}><PersonPhoto person={person}/><span><strong>{person.name}</strong><small>{person.position || "Jabatan belum tercatat"}</small><small>{person.hub}</small></span><ChevronRight size={16}/></button>;
  const descendants = (parent: TeamPerson, ancestors: string[] = []): React.ReactNode => {
    if (ancestors.includes(parent.nik)) return null;
    const children = teamChildren(visible, parent);
    return children.length > 0 && <><button className="team-link" aria-expanded={!!open[parent.nik]} onClick={() => toggle(parent.nik)}>{open[parent.nik] ? "Tutup tim" : `Lihat tim · ${children.length}`}<ChevronDown size={14}/></button>{open[parent.nik] && <div className="team-nested">{children.map(child => <div key={child.nik}>{personCard(child)}{descendants(child, [...ancestors, parent.nik])}</div>)}</div>}</>;
  };
  const branch = (name: string) => {
    const people = visible.filter(person => person.hub === name), key = `hub:${name}`, expanded = open[key] ?? true;
    const coordinators = q.trim() ? people : people.filter(person => has(person, "coordinator|koordinator"));
    return <div className="team-branch" key={name}><button className="team-hub-node" aria-expanded={expanded} onClick={() => toggle(key, true)}><Building2 size={20}/><span><strong>{name}</strong><small>{people.length} personel sesuai filter</small></span><ChevronDown size={18} className={expanded ? "" : "team-collapsed"}/></button>{expanded && <div className="team-children"><div className="team-role-label">{q.trim() ? "HASIL PENCARIAN" : "KOORDINATOR"}</div>{coordinators.length ? coordinators.map(person => <div className="team-role-group" key={person.nik}>{personCard(person)}{!q.trim() && descendants(person)}</div>) : <p className="team-empty">{q.trim() ? "Tidak ada personel sesuai pencarian." : "Tidak ada koordinator sesuai filter."}</p>}</div>}</div>;
  };
  return <section className="team-structure-page">
    <div className="section-head"><div><div className="eyebrow">PERSONEL &amp; ORGANISASI</div><h1 className="headline">Struktur Tim</h1><div className="subtitle">Personel, jabatan, dan hubungan koordinasi dari database karyawan.</div></div><button type="button" className="btn" disabled={loading} onClick={() => void load()}>{loading ? "Memuat…" : "Muat ulang"}</button></div>
    <div className="structure-toolbar"><div className="search"><Search size={16}/><input aria-label="Cari personel" value={q} onChange={event => setQ(event.target.value)} placeholder="Cari nama, NIK, atau jabatan…"/></div><select aria-label="Filter hub" value={hub} onChange={event => setHub(event.target.value)}><option>Semua Hub</option>{hubs.map(name => <option key={name}>{name}</option>)}</select><select aria-label="Filter divisi" value={division} onChange={event => setDivision(event.target.value)}><option>Semua Divisi</option>{divisions.map(name => <option key={name}>{name}</option>)}</select><select aria-label="Filter status" value={status} onChange={event => setStatus(event.target.value)}><option>Aktif</option><option>Semua Status</option><option>Nonaktif</option></select><button type="button" className="btn" onClick={() => setOpen(Object.fromEntries([...rows.map(person => [person.nik, true]), ...hubs.map(name => [`hub:${name}`, true])]))}><Maximize2 size={14}/>Buka semua</button></div>
    <div className="structure-summary">{[
      { label: "Total Personel", count: visible.length, icon: true },
      { label: "Kurir Motor", count: visible.filter(person => has(person, "motor")).length },
      { label: "Kurir Mobil", count: visible.filter(person => has(person, "mobil")).length },
      { label: "Staf Operasional", count: visible.filter(person => !has(person, "motor|mobil|leader|coordinator|koordinator|supervisor|spv")).length },
      { label: "Total Hub", count: new Set(visible.map(person => person.hub).filter(Boolean)).size },
    ].map((item, index) => <button key={item.label} className={`structure-summary-card${item.icon ? " primary" : ""}`} onClick={() => setTab(index === 4 ? "hub" : "list")}>{item.icon && <Users size={22}/>}<span>{item.label}<strong>{loading || error ? "—" : item.count}</strong></span></button>)}</div>
    <div className="structure-tabs" aria-label="Tampilan struktur">{([['tree', 'Struktur Organisasi'], ['hub', 'Struktur per Hub'], ['list', 'Daftar Personel']] as const).map(([value, label]) => <button key={value} className={tab === value ? "active" : ""} aria-pressed={tab === value} onClick={() => setTab(value)}>{label}</button>)}</div>
    {error ? <div className="team-state" role="alert">{error}<button className="btn" onClick={() => void load()}>Coba lagi</button></div> : loading ? <div className="team-state" role="status">Memuat struktur karyawan…</div> : tab === "list" ? <div className="card employee-table-card"><div className="card-head"><div className="card-title">Daftar Personel</div><span>{visible.length} personel</span></div><div className="table-wrap"><table><thead><tr><th>Personel / NIK</th><th>Jabatan</th><th>Hub</th><th>Status</th><th>Detail</th></tr></thead><tbody>{visible.map(person => <tr key={person.nik}><td><div className="team-table-person"><PersonPhoto person={person}/><span><strong>{person.name}</strong><small>NIK {person.nik || "—"}</small></span></div></td><td>{person.position || "—"}</td><td>{person.hub || "—"}</td><td><span className={person.active ? "status-active" : "team-inactive"}>{person.active ? "Aktif" : "Nonaktif"}</span></td><td><button className="icon-btn" aria-label={`Detail ${person.name}`} onClick={() => setSelected(person)}><ChevronRight size={16}/></button></td></tr>)}</tbody></table>{visible.length === 0 && <p className="team-empty">Tidak ada personel sesuai filter.</p>}</div></div> : <div className="team-canvas">
      {tab === "tree" && <>{supervisor ? <button className="team-root" onClick={() => setSelected(supervisor)}><PersonPhoto person={supervisor} large/><span className="team-position-badge">SPV</span><strong>{supervisor.name}</strong><small>{supervisor.position}</small><small>{visible.length} personel · {hubs.length} hub</small></button> : <p className="team-empty">SPV belum teridentifikasi di database.</p>}{junior && <><div className="team-connector"/><button className="team-management" onClick={() => setSelected(junior)}><PersonPhoto person={junior}/><span><strong>{junior.name}</strong><small>{junior.position}</small></span><ChevronRight size={16}/></button></>}<div className="team-fork"/></>}
      <div className="team-hubs">{hubs.filter(name => hub === "Semua Hub" || name === hub).map(branch)}</div>{visible.length === 0 && <p className="team-empty">Tidak ada personel sesuai filter.</p>}
    </div>}
    {selected && <><button className="team-drawer-backdrop" aria-label="Tutup detail personel" onClick={() => setSelected(null)}/><aside className="team-drawer" role="dialog" aria-modal="true" aria-label={`Detail ${selected.name}`}><button autoFocus className="modal-close" aria-label="Tutup detail" onClick={() => setSelected(null)}><X size={18}/></button><PersonPhoto person={selected} large/><h2>{selected.name}</h2><p>{selected.position || "Jabatan belum tercatat"}</p><span className={selected.active ? "status-active" : "team-inactive"}>{selected.active ? "Aktif" : "Nonaktif"}</span><dl><dt>NIK</dt><dd>{selected.nik || "—"}</dd><dt>Jabatan</dt><dd>{selected.position || "—"}</dd><dt>Hub</dt><dd>{selected.hub || "—"}</dd><dt>Atasan Langsung</dt><dd>{selected.superior || "—"}</dd><dt>Departemen</dt><dd>{selected.dept || "—"}</dd></dl></aside></>}
  </section>;
}
