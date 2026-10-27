import { employeeStatus } from "./employee-status";
export const SANCTION_KINDS = { coaching: "Coaching", st: "Surat Teguran (ST)", sp1: "SP 1", sp2: "SP 2", sp3: "SP 3", hc_ga: "Tindak lanjut HC/GA" } as const;
export type SanctionKind = keyof typeof SANCTION_KINDS;
export const SANCTION_ADMINS = ["super_admin", "admin", "spv"];
export type SanctionEmployee = { nik: string; name: string; position: string; hub: string; superior: string; superior_nik?: string | null; active: boolean; employment?: string };
export type EmployeeSanction = { id: string; employee_nik: string; employee_name: string; position: string; superior_name: string; superior_nik: string | null; hub: string; kind: SanctionKind; incident_date: string; description: string; coaching_result: string; created_by: string; created_at: string; updated_at: string; updated_by: string; can_edit?: boolean };
export function sanctionRecorder(person: { position?: string; active?: boolean; employment?: unknown } | null | undefined) {
  return !!person && employeeStatus(person) === "active" && /\bleader\b|\bcoordinator\b|\bkoordinator\b|\bsupervisor\b|\bspv\b/i.test(person.position || "");
}
export function sanctionTeam(rows: SanctionEmployee[], ownerNik: string) {
  const owner = rows.find(row => row.nik === ownerNik);
  if (!sanctionRecorder(owner)) return [];
  const normal = (v: string) => v.trim().replace(/\s+/g, " ").toLowerCase();
  const names = new Map<string, SanctionEmployee[]>();
  for (const row of rows) names.set(normal(row.name), [...(names.get(normal(row.name)) || []), row]);
  const visited = new Set([ownerNik]), queue = [owner!];
  while (queue.length) {
    const parent = queue.shift()!;
    for (const row of rows) {
      const linked = row.superior_nik ? row.superior_nik === parent.nik : !!row.superior && normal(row.superior) === normal(parent.name) && names.get(normal(parent.name))?.length === 1;
      if (linked && !visited.has(row.nik)) { visited.add(row.nik); queue.push(row); }
    }
  }
  return rows.filter(row => row.nik !== ownerNik && visited.has(row.nik) && employeeStatus(row) === "active");
}
export function sanctionValues(body: Record<string, unknown>) {
  const kind = String(body.kind || "");
  const description = String(body.description || "").trim(), coaching_result = String(body.coaching_result || "").trim(), incident_date = String(body.incident_date || "");
  if (!Object.hasOwn(SANCTION_KINDS, kind) || !description || description.length > 10000 || coaching_result.length > 10000) throw Error("Pilih jenis catatan dan isi keterangan maksimal 10.000 karakter.");
  if (kind === "coaching" && !coaching_result) throw Error("Isi hasil coaching.");
  const date = new Date(incident_date + "T00:00:00Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(incident_date) || Number.isNaN(+date) || date.toISOString().slice(0, 10) !== incident_date) throw Error("Tanggal catatan tidak valid.");
  return { kind: kind as SanctionKind, description, coaching_result, incident_date };
}
