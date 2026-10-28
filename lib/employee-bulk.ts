// Monthly uploads update structural fields and start date. Status/contacts/IDs are edited separately.
export function employeeStartDate(value: unknown, date1904 = false): string {
  if (value === undefined || value === null || String(value).trim() === "") return "";
  if (typeof value === "number") {
    const serial = Math.floor(value);
    if (!Number.isFinite(serial) || serial < (date1904 ? 0 : 1) || (!date1904 && serial === 60) || serial > 2957000) throw Error("Tanggal masuk Excel tidak valid.");
    const millis = date1904 ? Date.UTC(1904,0,1) + serial*86400000 : Date.UTC(1899,11,30) + (serial < 60 ? serial+1 : serial)*86400000;
    return employeeStartDate(new Date(millis).toISOString().slice(0,10));
  }
  const raw = String(value).trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const local = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(raw);
  if (!iso && !local) throw Error("Tanggal masuk harus berupa tanggal Excel, YYYY-MM-DD, atau DD/MM/YYYY.");
  const year = Number(iso ? iso[1] : local![3]), month = Number(iso ? iso[2] : local![2]), day = Number(iso ? iso[3] : local![1]);
  const date = new Date(Date.UTC(year,month-1,day));
  if (year < 1900 || date.getUTCFullYear()!==year || date.getUTCMonth()!==month-1 || date.getUTCDate()!==day) throw Error("Tanggal masuk tidak valid.");
  return date.toISOString().slice(0,10);
}

export function employeeBulkExcelRows(rows: Record<string,unknown>[], date1904 = false) {
  return rows.map((source,index) => {
    const row = Object.fromEntries(Object.entries(source).map(([key,value])=>[key.trim().replace(/\s+/g," ").toUpperCase(),value]));
    try {
      return { nik:String(row.NIK||row.NIA||""), name:row["FULL NAME"]||row.NAME||"", position:row.POSITION||"", dept:row.DEPT||"", hub:row.HUB||"", level:row.LEVEL||"", superior:row["SUPERIOR 1"]||"", superior_nik:row["SUPERIOR NIK"]||row["NIK ATASAN"]||"", start_date:employeeStartDate(row["TGL MASUK"]??row["TANGGAL MASUK"]??row.START_DATE,date1904) };
    } catch(error) { throw Error(`Baris ${index+2}: ${error instanceof Error?error.message:"Tanggal masuk tidak valid."}`); }
  });
}

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
    const startDate = employeeStartDate(row.start_date);
    if (startDate) result.start_date = startDate;
    if (!result.nik || !result.name) throw Error("Setiap baris wajib memiliki NIK dan nama. Tidak ada data yang disimpan.");
    if (seen.has(result.nik)) throw Error(`NIK ${result.nik} muncul lebih dari sekali. Perbaiki file sebelum menyimpan.`);
    seen.add(result.nik);
    return result;
  });
}
