// Approved operational capacity, not a count of employee records.
export const EMPLOYEE_FORMATION = 304;
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
