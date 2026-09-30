export const CHECK_COLUMNS = [
  ["inspection_date", "Tanggal Pemeriksaan"], ["delivery_area", "Area Delivery"],
  ["inspector_name", "Nama PIC Pemeriksaan"], ["courier_name", "Nama Kurir yang Diperiksa"],
  ["courier_id", "ID Kurir"], ["position", "Posisi/Jabatan"], ["employment", "Status Kepegawaian"],
  ["runsheet_count", "Jumlah Connote pada Runsheet"], ["physical_count", "Jumlah Fisik Connote yang Dibawa Kurir"],
  ["result", "Hasil Pemeriksaan"], ["documentation_url", "Link Dokumentasi Pemeriksaan"],
  ["inspection_location", "Lokasi Pemeriksaan"], ["inspection_time", "Waktu Pemeriksaan"], ["notes", "Catatan/Keterangan"],
] as const;
export const DELIVERY_AREAS = ["SP LEGUTI", "SPC LEGUTI"] as const;
export function deliveryArea(value: string) {
  return value.trim().toUpperCase().startsWith("SPC") ? "SPC LEGUTI" : "SP LEGUTI";
}
export type Courier = { nik: string; name: string; position: string; employment: string; hub: string };
export type CourierCheck = {
  id: string; inspection_date: string; inspection_time: string; delivery_area: string;
  inspector_name: string; courier_id: string; courier_name: string; position: string; employment: string;
  runsheet_count: number; physical_count: number; result: "Sesuai" | "Tidak Sesuai";
  documentation_url: string; inspection_location: string; notes: string;
  photos: { name: string; url: string }[]; created_by: string; created_at: string; updated_at: string; can_edit: boolean;
};
export function courierRole(position: string) {
  if (/kurir.*motor|\brider\b/i.test(position)) return "Rider";
  if (/kurir.*mobil|\bdriver\b/i.test(position)) return "Driver";
  return "";
}
export function checkCell(record: CourierCheck, key: typeof CHECK_COLUMNS[number][0]) {
  return key === "inspection_time" ? record[key].slice(0, 5) + " WIB" : String(record[key] ?? "");
}
