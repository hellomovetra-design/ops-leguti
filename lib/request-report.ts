export const REQUEST_STATUSES: Record<string, string> = { pending: "Diajukan", approved: "Diproses", sent: "Diproses", completed: "Selesai", rejected: "Ditolak", deleted: "Ditandai hapus" };
export const REQUEST_FILTER_STATUSES: Record<string,string> = {pending:"Diajukan",processing:"Diproses",completed:"Selesai",rejected:"Ditolak",deleted:"Ditandai hapus"};
export function requester(row: Record<string, any>) {
  return String(row.created_by || row.email || "").trim() || "Pengaju belum tercatat";
}
export function requestFilters(params: URLSearchParams) {
  const from = params.get("from") || "", to = params.get("to") || "";
  for (const day of [from, to]) if (day && (!/^\d{4}-\d{2}-\d{2}$/.test(day) || new Date(day+"T00:00:00Z").toISOString().slice(0,10) !== day)) throw new Error("Tanggal filter tidak valid.");
  if (from && to && from > to) throw new Error("Tanggal awal tidak boleh melewati tanggal akhir.");
  const status = params.get("status") || "";
  if (status && !REQUEST_STATUSES[status] && status!=="processing") throw new Error("Status filter tidak valid.");
  const archive = params.get("archive") || "active";
  if (!["active", "archived", "all"].includes(archive)) throw new Error("Filter arsip tidak valid.");
  return { from, to, status, archive, q: (params.get("q") || "").replace(/[,()%"_*\\]/g, " ").trim().slice(0,160) };
}
export function applyRequestFilters(query: any, filters: ReturnType<typeof requestFilters>) {
  if (filters.archive === "active") query = query.is("archived_at", null);
  if (filters.archive === "archived") query = query.not("archived_at", "is", null);
  if (filters.status === "processing") query = query.in("status",["approved","sent"]);
  else if (filters.status) query = query.eq("status", filters.status);
  else query = query.neq("status", "deleted");
  if (filters.from) query = query.gte("created_at", filters.from+"T00:00:00+07:00");
  if (filters.to) query = query.lte("created_at", filters.to+"T23:59:59.999+07:00");
  if (filters.q) query = query.or(["created_by","name","nik","user_id","shipment_numbers","reason"].map(field=>`${field}.ilike.%${filters.q}%`).join(","));
  return query;
}
export function requestCsv(rows: Record<string, any>[]) {
  const headers = ["ID", "USER PENGAJU", "JENIS REQUEST", "NAMA KARYAWAN", "USER ID", "NIK", "NO. RESI", "ZONA / HUB", "KETERANGAN", "STATUS", "STATUS FINAL", "DIBUAT (WIB)", "DISETUJUI OLEH", "SELESAI (WIB)", "DIARSIPKAN (WIB)"];
  const time=(value:any)=>value?new Date(value).toLocaleString("id-ID",{timeZone:"Asia/Jakarta"}):"";
  const cell=(value:any)=>{let text=String(value??"");if (/^[\s]*[=+@-]/.test(text)) text="'"+text;return '"'+text.replace(/"/g,'""')+'"'};
  return "\uFEFF"+[headers,...rows.map(r=>[r.id,requester(r),r.type==="open_cl3"?"Open CL3":"Aktivasi User TGR",r.name,r.user_id,r.nik,r.shipment_numbers,r.location,r.reason,REQUEST_STATUSES[r.status]||r.status,r.status==="completed"?"Close":r.status==="rejected"?"Ditolak":"Masih proses",time(r.created_at),r.approved_by,time(r.completed_at),time(r.archived_at)])].map(row=>row.map(cell).join(",")).join("\r\n");
}
