export const EMPLOYMENT_LABELS = {
  permanent: "Tetap (PKWTT)",
  contract: "Kontrak (PKWT)",
  outsource: "Outsource",
  unknown: "Belum Terdata",
} as const;

export type EmploymentType = keyof typeof EMPLOYMENT_LABELS;

// Employment type is independent of active/resigned/inactive status.
// Freelance is grouped under Outsource per the dashboard's business categories.
// Preserve the original contract value in storage; never classify by NIK or TGR ID.
export function employeeEmployment(row: { employment?: unknown; employment_type?: unknown }): EmploymentType {
  if (Object.hasOwn(EMPLOYMENT_LABELS, String(row.employment_type || ""))) return row.employment_type as EmploymentType;
  const value = String(row.employment || "").trim().toUpperCase().replace(/[\s_-]+/g, " ");
  if (["PKWTT", "TETAP", "KARYAWAN TETAP", "PERMANENT"].includes(value)) return "permanent";
  if (["PKWT", "KONTRAK", "KARYAWAN KONTRAK"].includes(value)) return "contract";
  if (["OUTSOURCE", "OUTSOURCING", "OUTSOURCED", "OS", "ALIH DAYA"].includes(value)) return "outsource";
  if (["FREELANCE", "FREELANCER", "FL"].includes(value)) return "outsource";
  return "unknown";
}
