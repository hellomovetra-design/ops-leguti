export const damagePlateKey = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");
export type DamageVehicle = { plate: string; vehicle_code: string; vehicle_type: string };
export function damageVehicleMatches(item: DamageVehicle, query: string) {
  const key=damagePlateKey(query);
  return !key || [item.plate,item.vehicle_code,item.vehicle_type].some(text=>damagePlateKey(text).includes(key));
}
export const DAMAGE_ADMINS = ["super_admin", "admin", "spv"];
export const DAMAGE_STATUSES = { open: "Baru", in_progress: "Diproses", completed: "Selesai" } as const;
export const DAMAGE_PHOTO_LABELS = ["Foto AWB", "Bukti 1", "Bukti 2", "Bukti 3"] as const;
export const DAMAGE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function damageCsv(rows: DamageCase[], origin: string) {
  const time = (value: string) => new Date(value).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
  const cell = (value: unknown) => {
    let text = String(value ?? "");
    if (/^\s*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  };
  const data = [["NO", "WAKTU LAPORAN (WIB)", "NO AWB", "ORIGIN WAREHOUSE", "ARMADA (DATA LAMA)", "NOPOL", "REMARK PROBLEM", "STATUS", "TINDAK LANJUT", "PENGIRIM", "LINK FOTO BUKTI", "DIPERBARUI (WIB)"], ...rows.map((row,index) => [index+1, time(row.created_at), row.awb, row.trip, row.fleet, row.plate, row.remark, DAMAGE_STATUSES[row.status], row.resolution, row.created_by, `${origin}/pwa/damage-evidence/${row.id}`, time(row.updated_at)])];
  return "\uFEFF" + data.map(row => row.map(cell).join(",")).join("\r\n");
}
export type DamageCase = { id: string; awb: string; trip: string; fleet: string; plate: string; remark: string; status: keyof typeof DAMAGE_STATUSES; resolution: string; created_by: string; created_at: string; updated_at: string; evidence_url: string; photos: { name: string; url: string; slot?: number }[] };
export function damageValues(get: (key: string) => string) {
  const values = { awb: get("awb").trim().toUpperCase(), trip: get("trip").trim(), fleet: (get("fleet") || "").trim(), plate: get("plate").trim().toUpperCase(), remark: get("remark").trim() };
  for (const [key, limit] of [["awb", 80], ["trip", 100], ["plate", 30], ["remark", 5000]] as const) {
    if (!values[key] || values[key].length > limit) throw new Error("Lengkapi AWB, origin warehouse, nopol, dan remark problem sesuai batas kolom.");
  }
  if (values.fleet.length > 160) throw new Error("Armada maksimal 160 karakter.");
  return values;
}
export function damageImageValid(bytes: Uint8Array, type: string) {
  if (type === "image/jpeg") return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === "image/png") return [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v);
  return type === "image/webp" && String.fromCharCode(...bytes.slice(0,4)) === "RIFF" && String.fromCharCode(...bytes.slice(8,12)) === "WEBP";
}
