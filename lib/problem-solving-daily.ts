export const DAILY_CATEGORIES = ["Jaringan", "Perangkat", "Aplikasi", "Operasional", "Lainnya"] as const;
export const DAILY_ADMIN_ROLES = ["super_admin", "admin", "spv"];
export const DAILY_STATUSES = { open: "Belum Ditangani", in_progress: "Diproses", completed: "Selesai" } as const;
export type DailyRecord = {
  id: string; title: string; category: string; incident_date: string; incident_time: string;
  unit: string; description: string; solution: string; status: keyof typeof DAILY_STATUSES;
  created_by: string; created_at: string; updated_at: string;
  photos: { path: string; name: string; url?: string }[];
  can_edit?: boolean;
};
export function jakartaNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const value = (key: string) => parts.find(p => p.type === key)?.value || "";
  return { incident_date: `${value("year")}-${value("month")}-${value("day")}`, incident_time: `${value("hour")}:${value("minute")}` };
}
export function incidentDay(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "—";
  const value = new Date(`${date}T12:00:00+07:00`);
  return Number.isNaN(+value) ? "—" : value.toLocaleDateString("id-ID", { weekday: "long", timeZone: "Asia/Jakarta" });
}
