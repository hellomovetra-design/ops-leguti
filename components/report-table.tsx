"use client";

import { MoreHorizontal } from "lucide-react";
import { ReportRow } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ReportTable({ rows, compact = false }: { rows: ReportRow[]; compact?: boolean }) {
  const shown = compact ? rows.slice(0, 7) : rows.slice(0, 14);
  return (
    <div className="card">
      <div className="card-head">
        <div><div className="card-title">Detail Shipment</div><div className="card-sub">Data terbaru sesuai filter aktif</div></div>
        <button className="icon-btn" style={{ width: 31, height: 31 }} aria-label="Menu tabel"><MoreHorizontal size={15} /></button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>AWB / No. Resi</th><th>Penerima</th><th>Status POD</th><th>Kategori</th><th>Kurir Terakhir</th><th>Leader</th><th>Area / Zone</th><th>SLA</th><th>Kurir</th></tr></thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.id}>
                <td><div className="awb">{row.awb}</div><div style={{ color: "#98a2b3", marginTop: 3 }}>{row.reportDate}</div></td>
                <td><div style={{ fontWeight: 700 }}>{row.receiverName}</div><div style={{ color: "#98a2b3", marginTop: 3 }}>{row.shipperName}</div></td>
                <td><span className={cn("badge", row.status === "DELIVERED" ? "success" : row.status === "FAILED" || row.status === "RETURN" ? "failed" : "pending")}><span className="dot" style={{ background: "currentColor" }} />{row.status}</span></td>
                <td><span className={cn("badge", row.addressCategory === "OFFICE" ? "office" : row.addressCategory === "RESIDENCE" ? "residence" : "neutral")}>{row.addressCategory}</span></td>
                <td><div style={{ fontWeight: 700 }}>{row.lastCourierName}</div><div style={{ color: "#98a2b3", marginTop: 3 }}>{row.lastCourierId}</div></td>
                <td>{row.leader}</td>
                <td><div>{row.area}</div><div style={{ color: "#98a2b3", marginTop: 3 }}>{row.zone}</div></td>
                <td><span className={cn("badge", row.sla === "ON TIME" ? "success" : "failed")}>{row.sla}</span></td>
                <td><span className={cn("badge", row.courierChanged === "YA" ? "pending" : "neutral")}>{row.courierChanged === "YA" ? "Berubah" : "Tetap"}</span></td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={9} style={{ textAlign: "center", padding: 35, color: "#98a2b3" }}>Tidak ada data sesuai filter.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="table-footer"><span>Menampilkan {shown.length} dari {rows.length} data</span><div className="pagination"><button className="page-btn">‹</button><button className="page-btn active">1</button><button className="page-btn">2</button><button className="page-btn">3</button><button className="page-btn">›</button></div></div>
    </div>
  );
}
