import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";

const source = process.argv[2];
const target = process.argv[3];
if (!source || !target) throw new Error("Usage: node scripts/export-employees-csv.mjs <source.xlsx> <target.csv>");

const workbook = XLSX.readFile(source, { cellDates: true });
const sheet = workbook.Sheets["LEGUTI MALOKO"] || workbook.Sheets[workbook.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

const normalized = rows
  .map((row) => ({
    nik: String(row.NIK || row.NIA || "").trim(),
    name: String(row["FULL NAME"] || "").trim(),
    position: String(row.POSITION || "").trim(),
    dept: String(row.DEPT || "").trim(),
    hub: String(row.HUB || "").trim().replace(/^SPC Leguti$/i, "SPC LEGUTI").replace(/^SP Maloko$/i, "SP MALOKO"),
    level: String(row.LEVEL || "").trim(),
    superior: String(row["SUPERIOR 1"] || "").trim(),
    employment: String(row.STATUS || "").trim(),
    start_date: row["TGL MASUK"] instanceof Date ? row["TGL MASUK"].toISOString().slice(0, 10) : String(row["TGL MASUK"] || "").trim(),
    tgrid: String(row.TGRID || "").trim(),
    active: true,
  }))
  .filter((row) => row.nik && row.name);

const seen = new Set();
for (const row of normalized) {
  if (seen.has(row.nik)) throw new Error(`Duplicate NIK: ${row.nik}`);
  seen.add(row.nik);
}

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(normalized)), "utf8");
console.log(JSON.stringify({ rows: normalized.length, target }));
