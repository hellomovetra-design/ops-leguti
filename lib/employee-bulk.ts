// Monthly uploads update structural fields only. Status/contacts/IDs are edited separately.
export function employeeBulkRows(value: unknown) {
  if (!Array.isArray(value) || !value.length || value.length > 5000) throw Error("Unggah 1–5000 baris karyawan.");
  const seen = new Set<string>();
  return value.map((input: unknown) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw Error("Baris karyawan tidak valid.");
    const row = input as Record<string, unknown>;
    const result: Record<string,string> = {};
    for (const field of ["nik", "name", "position", "dept", "hub", "level", "superior", "superior_nik"]) {
      const text = String(row[field] ?? "").trim().replace(/\s+/g," ");
      if (text.length > (["nik","superior_nik"].includes(field) ? 80 : 250)) throw Error("Isian karyawan terlalu panjang.");
      if (text) result[field] = text;
    }
    if (!result.nik || !result.name) throw Error("Setiap baris wajib memiliki NIK dan nama. Tidak ada data yang disimpan.");
    if (seen.has(result.nik)) throw Error(`NIK ${result.nik} muncul lebih dari sekali. Perbaiki file sebelum menyimpan.`);
    seen.add(result.nik);
    return result;
  });
}
