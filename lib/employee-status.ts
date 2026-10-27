// Approved operational capacity, not a count of employee records.
export const EMPLOYEE_FORMATION = 305;
// Requested total distributed using active hub data on 27 October 2026.
// Fixed quotas must not shrink when a person resigns or becomes inactive.
export const HUB_FORMATION: Record<string, number> = { "SPC LEGUTI": 239, "SP MALOKO": 66 };
export function employeeFormation<T extends StatusRecord & { hub?: unknown }>(rows: T[], hub: string | null = null) {
  const normalize = (value: unknown) => String(value || "").trim().replace(/\s+/g, " ").toUpperCase().replace(/^SP LEGUTI$/, "SPC LEGUTI");
  const scoped = hub ? rows.filter(row => normalize(row.hub) === normalize(hub)) : rows;
  const active = scoped.filter(row => employeeStatus(row) === "active").length;
  const formation = hub ? HUB_FORMATION[normalize(hub)] ?? 0 : EMPLOYEE_FORMATION;
  return { active, formation, shortage: Math.max(0, formation - active), surplus: Math.max(0, active - formation) };
}
export type EmployeeStatus = "active" | "inactive" | "resigned";
type StatusRecord = { active?: boolean; employment?: unknown };
export const EMPLOYEE_STATUS_LABELS: Record<EmployeeStatus, string> = {
  active: "Aktif", inactive: "Nonaktif", resigned: "Resign / Belum Diganti",
};
export function employeeStatus(row: StatusRecord): EmployeeStatus {
  const status = String(row.employment || "").trim().toLowerCase();
  if (/^resign(?:ed)?(?:\s*\/\s*belum\s+(?:ada\s+)?(?:pengganti|diganti))?$/.test(status)) return "resigned";
  if (row.active === false || /^(nonaktif|non aktif|inactive)$/.test(status)) return "inactive";
  return "active";
}
export function employeeState(row: StatusRecord) {
  const status = employeeStatus(row);
  return { active: status === "active", employment: status === "resigned" ? "Resign" : status === "inactive" ? "Nonaktif" : String(row.employment || "Aktif") };
}
export function employeeSummary<T extends StatusRecord>(rows: T[]) {
  const active = rows.filter(row => employeeStatus(row) === "active");
  const resigned = rows.filter(row => employeeStatus(row) === "resigned");
  const inactive = rows.filter(row => employeeStatus(row) === "inactive");
  return { formation: EMPLOYEE_FORMATION, active, resigned, inactive, current: [...active, ...resigned] };
}
