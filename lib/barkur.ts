export const BARKUR_ROLES = ["super_admin", "admin", "coordinator", "spv", "jr_spv"];
export const BARKUR_STATUSES = { open: "Belum Ditangani", investigating: "Ditelusuri", completed: "Selesai" } as const;
export type BarkurRecord = {
  id: string; awb: string; bag_number: string; origin: string; destination: string;
  incident_at: string; email_sent_at: string | null; pic: string; description: string;
  status: keyof typeof BARKUR_STATUSES; resolution: string; evidence_link: string;
  evidence: { path: string; name: string; url: string }[];
  created_by: string; updated_by: string; created_at: string; updated_at: string;
};
export const barkurUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function jakartaInput(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const p = (key: string) => parts.find(part => part.type === key)?.value;
  return `${p("year")}-${p("month")}-${p("day")}T${p("hour")}:${p("minute")}`;
}
export function barkurTime(value: string, required = false) {
  if (!value && !required) return null;
  if (!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error("Tanggal dan jam tidak valid.");
  const date = new Date(value + ":00+07:00");
  if (Number.isNaN(+date) || jakartaInput(date) !== value) throw new Error("Tanggal dan jam tidak valid.");
  return date.toISOString();
}
export function driveEvidence(value: string) {
  if (!value) return "";
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Link bukti harus berupa URL Google Drive yang valid."); }
  if (url.protocol !== "https:" || !["drive.google.com", "docs.google.com"].includes(url.hostname) || url.username || url.password) throw new Error("Gunakan link HTTPS Google Drive untuk bukti lama.");
  return url.href;
}
export function emailDelay(row: Pick<BarkurRecord, "incident_at" | "email_sent_at">) {
  if (!row.email_sent_at) return "Belum dicatat";
  const minutes = Math.floor((+new Date(row.email_sent_at) - +new Date(row.incident_at)) / 60000);
  return minutes < 0 ? "Waktu tidak valid" : `${Math.floor(minutes / 60)} jam ${minutes % 60} menit`;
}
export function barkurFilters(params: URLSearchParams) {
  const q = (params.get("q") || "").replace(/[,()%"_*\\]/g, " ").trim().slice(0, 160);
  const status = params.get("status") || "", from = params.get("from") || "", to = params.get("to") || "";
  if (status && !Object.hasOwn(BARKUR_STATUSES, status)) throw new Error("Status tidak valid.");
  for (const day of [from, to]) if (day && (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day)) || new Date(day).toISOString().slice(0,10) !== day)) throw new Error("Tanggal filter tidak valid.");
  if (from && to && from > to) throw new Error("Tanggal awal melewati tanggal akhir.");
  return { q, status, from, to };
}
export function applyBarkurFilters(query: any, filters: ReturnType<typeof barkurFilters>) {
  if (filters.q) query = query.or(["awb", "bag_number", "origin", "destination", "pic"].map(key => `${key}.ilike.%${filters.q}%`).join(","));
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.from) query = query.gte("incident_at", filters.from + "T00:00:00+07:00");
  if (filters.to) query = query.lte("incident_at", filters.to + "T23:59:59.999+07:00");
  return query;
}
export function barkurCsv(rows: BarkurRecord[], base: string) {
  const time = (value: string | null) => value ? new Date(value).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) : "";
  const cell = (value: unknown) => { let text = String(value ?? ""); if (/^\s*[=+@-]/.test(text)) text = "'" + text; return '"' + text.replace(/"/g, '""') + '"'; };
  return "\uFEFF" + [["AWB", "NO BAG", "ORIGIN", "UNIT PENERIMA", "KEJADIAN (WIB)", "EMAIL DIKIRIM (WIB)", "SELISIH KE EMAIL", "PIC", "KETERANGAN", "STATUS", "HASIL PENELUSURAN", "BUKTI EMAIL", "DICATAT OLEH"], ...rows.map(row => [row.awb, row.bag_number, row.origin, row.destination, time(row.incident_at), time(row.email_sent_at), emailDelay(row), row.pic, row.description, BARKUR_STATUSES[row.status], row.resolution, [row.evidence_link, ...row.evidence.map((_, index) => `${base}/api/barkur?type=evidence&id=${row.id}&index=${index}`)].filter(Boolean).join("\n"), row.created_by])].map(row => row.map(cell).join(",")).join("\r\n");
}
