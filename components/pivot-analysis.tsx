"use client";

import { useMemo, useState } from "react";
import { ArrowDownToLine, Play, TableProperties } from "lucide-react";
import { useApp } from "@/app/providers";
import { PageHeader } from "./app-shell";

const fields = [
  ["leader", "Leader"], ["area", "Area"], ["zone", "Zone"], ["status", "Status POD"],
  ["addressCategory", "Kategori Alamat"], ["inboundCategory", "Kategori Inbound"], ["lastCourierName", "Kurir"], ["sla", "SLA"], ["courierChanged", "Kurir Berubah"],
] as const;

export function PivotAnalysis() {
  const { reports, toast } = useApp();
  const [rowField, setRowField] = useState("leader");
  const [columnField, setColumnField] = useState("status");
  const [aggregation, setAggregation] = useState("count");
  const [version, setVersion] = useState(0);
  const pivot = useMemo(() => {
    const rows = Array.from(new Set(reports.map((item) => String(item[rowField as keyof typeof item]))));
    const columns = Array.from(new Set(reports.map((item) => String(item[columnField as keyof typeof item]))));
    const matrix = rows.map((row) => {
      const rowReports = reports.filter((item) => String(item[rowField as keyof typeof item]) === row);
      const values = columns.map((column) => {
        const matches = rowReports.filter((item) => String(item[columnField as keyof typeof item]) === column);
        if (aggregation === "percentage") return rowReports.length ? +(matches.length / rowReports.length * 100).toFixed(1) : 0;
        if (aggregation === "average") return matches.length ? +(matches.reduce((sum, item) => sum + item.aging, 0) / matches.length).toFixed(1) : 0;
        if (aggregation === "sum") return matches.reduce((sum, item) => sum + item.aging, 0);
        return matches.length;
      });
      return { row, values, total: aggregation === "percentage" ? 100 : aggregation === "average" ? +(rowReports.reduce((s, i) => s + i.aging, 0) / (rowReports.length || 1)).toFixed(1) : aggregation === "sum" ? rowReports.reduce((s, i) => s + i.aging, 0) : rowReports.length };
    });
    return { rows: matrix, columns };
  }, [reports, rowField, columnField, aggregation, version]);

  const exportPivotCsv = () => {
    const header = [fields.find((f) => f[0] === rowField)?.[1] || "Row", ...pivot.columns, "Grand Total"].join(",");
    const lines = [header, ...pivot.rows.map((row) => [row.row, ...row.values, row.total].join(","))];
    const url = URL.createObjectURL(new Blob(["\ufeff", lines.join("\n")], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "jne-pivot-analysis.csv"; a.click(); URL.revokeObjectURL(url);
    toast("Data pivot CSV berhasil diekspor");
  };

  const exportPivotExcel = async () => {
    const XLSX = await import("xlsx");
    const header = [fields.find((f) => f[0] === rowField)?.[1] || "Row", ...pivot.columns, "Grand Total"];
    const dataRows = pivot.rows.map((row) => [row.row, ...row.values, row.total]);
    const worksheet = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Pivot Analysis");
    XLSX.writeFile(workbook, "jne-pivot-analysis.xlsx");
    toast("Data pivot Excel berhasil diekspor");
  };

  return <>
    <PageHeader eyebrow="Custom analytics" title="Pivot Analysis" subtitle="Susun analisa lintas dimensi tanpa mengubah data sumber." actions={<div className="actions"><button className="btn" onClick={exportPivotCsv}><ArrowDownToLine size={13} /> Export CSV</button><button className="btn btn-primary" onClick={exportPivotExcel}><ArrowDownToLine size={13} /> Export Excel</button></div>} />
    <div className="card" style={{ marginBottom: 14 }}><div className="card-head"><div><div className="card-title">Pivot Builder</div><div className="card-sub">Pilih dimensi dan metode agregasi</div></div></div><div className="panel-pad" style={{ paddingTop: 4 }}><div className="pivot-builder">
      <SelectField label="Row Field" value={rowField} onChange={setRowField} />
      <SelectField label="Column Field" value={columnField} onChange={setColumnField} />
      <div><label className="form-label">Value Field</label><select className="control"><option>AWB / No. Resi</option><option>Aging</option></select></div>
      <div><label className="form-label">Aggregation</label><select className="control" value={aggregation} onChange={(e) => setAggregation(e.target.value)}><option value="count">Count</option><option value="sum">Sum Aging</option><option value="average">Average Aging</option><option value="percentage">Percentage</option></select></div>
      <button className="btn btn-red" onClick={() => { setVersion((x) => x + 1); toast("Pivot berhasil diperbarui"); }}><Play size={12} fill="currentColor" /> Generate</button>
    </div></div></div>
    <div className="info-strip" style={{ marginBottom: 14 }}><TableProperties size={17} style={{ flex: "0 0 auto" }} /><span>Pivot menampilkan <b>{pivot.rows.length} baris</b> × <b>{pivot.columns.length} kolom</b>. Nilai dihitung dari {reports.length} shipment sesuai data aktif.</span></div>
    <div className="card"><div className="card-head"><div><div className="card-title">Pivot Result</div><div className="card-sub">{fields.find((f) => f[0] === rowField)?.[1]} vs {fields.find((f) => f[0] === columnField)?.[1]}</div></div></div><div className="table-wrap"><table><thead><tr><th>{fields.find((f) => f[0] === rowField)?.[1]}</th>{pivot.columns.map((column) => <th key={column}>{column}</th>)}<th>Grand Total</th></tr></thead><tbody>{pivot.rows.map((row) => <tr key={row.row}><td style={{ fontWeight: 800 }}>{row.row}</td>{row.values.map((value, i) => <td key={pivot.columns[i]}>{value}{aggregation === "percentage" ? "%" : ""}</td>)}<td style={{ fontWeight: 800, background: "#fafbfc" }}>{row.total}{aggregation === "percentage" ? "%" : ""}</td></tr>)}</tbody></table></div></div>
  </>;
}

function SelectField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <div><label className="form-label">{label}</label><select className="control" value={value} onChange={(e) => onChange(e.target.value)}>{fields.map(([key, name]) => <option value={key} key={key}>{name}</option>)}</select></div>;
}
