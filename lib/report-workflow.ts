export const REPORTS = {
  damage: { table: "ops_damage_cases", owner: "created_by", title: "Damage Case", path: "/dashboard/ops-desk/damage-cases", pending: ["open", "in_progress"] },
  problem: { table: "ops_problems", owner: "created_by_email", title: "Barang Problem", path: "/dashboard/ops-desk/problems", pending: ["open", "verified", "in_progress"] },
  barkur: { table: "ops_barkur", owner: "created_by", title: "BARKUR", path: "/dashboard/ops-desk/ots", pending: ["open", "investigating"] },
} as const;
export type ReportKind = keyof typeof REPORTS;
export const REPORT_ADMINS = ["super_admin", "admin", "spv", "coordinator", "jr_spv"];
export const reportKind = (value: string): value is ReportKind => Object.hasOwn(REPORTS, value);
export const awbKey = (value: string) => value.replace(/\s+/g, "").toUpperCase();
export function reportAge(created: string, status: string, now = Date.now()) {
  if (["completed", "resolved", "closed"].includes(status)) return null;
  const hours = Math.max(0, Math.floor((now - Date.parse(created)) / 3600000));
  if (!Number.isFinite(hours)) return null;
  return { hours, tone: hours >= 24 ? "urgent" : hours >= 3 ? "warning" : "normal", label: hours >= 24 ? `${Math.floor(hours / 24)} hari ${hours % 24} jam` : `${hours} jam` };
}
export const DUPLICATE_AWB = "AWB sudah dilaporkan pada modul ini. Cari laporan tersebut atau hubungi admin untuk tindak lanjut.";
export async function reportDuplicate(db:any,kind:ReportKind,awb:string,id:string){
 const result=await db.rpc("ops_report_awb_exists",{p_kind:kind,p_awb:awbKey(awb),p_exclude:id});
 if(result.error)throw Error("Pemeriksaan AWB belum tersedia. Terapkan migration 20261015_report_workflow.sql.");
 return !!result.data;
}
