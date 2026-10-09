import { employeeEmployment, EmploymentType } from "./employee-employment";
import { employeeStatus, EmployeeStatus } from "./employee-status";

export type Segment = "motor" | "mobil" | "staff" | "leader" | "coordinator";
type Person = { active?: boolean; employment?: unknown; employment_type?: unknown; position?: unknown; hub?: unknown; name?: unknown; nik?: unknown; superior?: unknown };
export type DashboardFilters = { status: EmployeeStatus | "current"; employment: EmploymentType | "all"; segment: Segment | null; hub: string | null; query: string };
export function inSegment(row: Person, segment: Segment) {
  const position = String(row.position || "");
  if (segment === "staff") return !/motor|mobil|leader|coordinator/i.test(position);
  return new RegExp(segment, "i").test(position);
}
// Facet counts apply every other selection, so alternatives remain selectable.
export function filterEmployees<T extends Person>(rows: T[], filters: DashboardFilters, exclude?: keyof DashboardFilters) {
  return rows.filter(row => {
    const status = employeeStatus(row);
    return (exclude === "status" || (filters.status === "current" ? status !== "inactive" : status === filters.status))
      && (exclude === "employment" || filters.employment === "all" || employeeEmployment(row) === filters.employment)
      && (exclude === "segment" || !filters.segment || inSegment(row, filters.segment))
      && (exclude === "hub" || !filters.hub || String(row.hub || "").toUpperCase() === filters.hub)
      && `${row.name || ""} ${row.nik || ""} ${row.position || ""} ${row.hub || ""} ${row.superior || ""}`.toLowerCase().includes(filters.query.trim().toLowerCase());
  });
}
