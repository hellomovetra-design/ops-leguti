"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownToLine, CheckCircle2, CircleAlert, Clock3, Package, RefreshCw, RotateCcw, Truck } from "lucide-react";
import { useApp } from "@/app/providers";
import { PageHeader } from "./app-shell";
import { Filters, ReportFilters } from "./report-filters";
import { ReportTable } from "./report-table";
import { downloadCsv, downloadExcel, formatNumber } from "@/lib/utils";

const initialFilters: Filters = { search: "", status: "", category: "", area: "", changed: "" };

export function DashboardOverview() {
  const { reports, toast } = useApp();
  const [filters, setFilters] = useState(initialFilters);
  const filtered = useMemo(() => reports.filter((row) => {
    const search = filters.search.toLowerCase();
    return (!search || `${row.awb} ${row.receiverName} ${row.lastCourierName}`.toLowerCase().includes(search))
      && (!filters.status || row.status === filters.status)
      && (!filters.category || row.addressCategory === filters.category)
      && (!filters.area || row.area === filters.area)
      && (!filters.changed || row.courierChanged === filters.changed);
  }), [reports, filters]);

  const count = (value: string, key: "status" | "addressCategory" | "sla" | "courierChanged") => filtered.filter((row) => row[key] === value).length;
  const delivered = count("DELIVERED", "status");
  const failed = count("FAILED", "status") + count("RETURN", "status");
  const pending = count("PENDING", "status");
  const onTime = count("ON TIME", "sla");
  const changed = count("YA", "courierChanged");
  const successRate = filtered.length ? delivered / filtered.length * 100 : 0;
  const areas = Array.from(new Set(reports.map((row) => row.area)));
  const addressData = [
    { name: "Office", value: count("OFFICE", "addressCategory"), color: "#1b2c6d" },
    { name: "Residence", value: count("RESIDENCE", "addressCategory"), color: "#ed1c24" },
    { name: "Unknown", value: count("UNKNOWN", "addressCategory"), color: "#d5dae5" },
  ];

  // Dynamic Shipment Performance Trend (last 7 days of dates present in the active dataset)
  const monthlyTrendData = useMemo(() => {
    const trendMap = new Map<string, { date: string; delivered: number; failed: number; pending: number }>();
    
    // Get unique dates from reports and sort them ascending
    const uniqueDates = Array.from(new Set(reports.map((r) => r.reportDate)))
      .sort((a, b) => a.localeCompare(b))
      .slice(-7); // Last 7 active days of data

    const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"];
    uniqueDates.forEach((dateStr) => {
      const d = new Date(dateStr);
      const label = !Number.isNaN(d.getTime()) ? `${d.getDate()} ${months[d.getMonth()]}` : dateStr;
      trendMap.set(dateStr, { date: label, delivered: 0, failed: 0, pending: 0 });
    });

    reports.forEach((row) => {
      const entry = trendMap.get(row.reportDate);
      if (entry) {
        if (row.status === "DELIVERED") {
          entry.delivered++;
        } else if (row.status === "FAILED" || row.status === "RETURN") {
          entry.failed++;
        } else {
          entry.pending++;
        }
      }
    });

    if (trendMap.size === 0) {
      return [
        { date: "No data", delivered: 0, failed: 0, pending: 0 }
      ];
    }

    return Array.from(trendMap.values());
  }, [reports]);

  // Dynamic Inbound Time vs Performance
  const inboundPerformanceData = useMemo(() => {
    const categories = [
      { key: "00.00 - 05.59", label: "00–06" },
      { key: "06.00 - 11.59", label: "06–12" },
      { key: "12.00 - 17.59", label: "12–18" },
      { key: "18.00 - 23.59", label: "18–24" }
    ];

    return categories.map((cat) => {
      const matching = reports.filter((r) => r.inboundCategory && r.inboundCategory.startsWith(cat.key.slice(0, 5)));
      const deliveredCount = matching.filter((r) => r.status === "DELIVERED").length;
      const failedCount = matching.filter((r) => r.status === "FAILED" || r.status === "RETURN").length;
      const total = deliveredCount + failedCount;

      const success = total > 0 ? Math.round((deliveredCount / total) * 100) : 0;
      const failedPct = total > 0 ? Math.round((failedCount / total) * 100) : 0;

      return {
        category: cat.label,
        success,
        failed: failedPct
      };
    });
  }, [reports]);

  // Dynamic First Attempt Recovery Rate
  const recoveryStats = useMemo(() => {
    let recovered = 0;
    let stillFailed = 0;
    let stillPending = 0;

    reports.forEach((row) => {
      const isFirstFailed = row.firstResult && row.firstResult !== "DELIVERED" && row.firstResult !== "-";
      if (isFirstFailed) {
        if (row.status === "DELIVERED") {
          recovered++;
        } else if (row.status === "FAILED" || row.status === "RETURN") {
          stillFailed++;
        } else if (row.status === "PENDING") {
          stillPending++;
        }
      }
    });

    const total = recovered + stillFailed + stillPending;
    const recoveryRate = total > 0 ? (recovered / total) * 100 : 0;

    return {
      recovered,
      stillFailed,
      stillPending,
      total,
      recoveryRate
    };
  }, [reports]);

  return (
    <>
      <PageHeader eyebrow="Operational Command Center" title="Daily Operations Overview" subtitle="Pantau performa shipment, SLA, dan produktivitas kurir dalam satu tampilan." actions={<><button className="btn" onClick={() => window.print()}><ArrowDownToLine size={13} /> PDF / Print</button><button className="btn" onClick={() => { downloadCsv(filtered, "jne-ops-overview.csv"); toast("CSV berhasil diunduh"); }}><ArrowDownToLine size={13} /> Export CSV</button><button className="btn btn-primary" onClick={async () => { await downloadExcel(filtered, "jne-ops-overview.xlsx"); toast("Excel berhasil diunduh"); }}><ArrowDownToLine size={13} /> Export Excel</button></>} />
      <ReportFilters value={filters} onChange={setFilters} areas={areas} />

      <div className="kpi-grid">
        <Kpi label="Total Shipment" value={formatNumber(filtered.length)} meta="vs periode sebelumnya" change="+8.2%" icon={<Package size={14} />} color="#1b2c6d" soft="#edf0fa" />
        <Kpi label="Delivered" value={formatNumber(delivered)} meta={`${successRate.toFixed(1)}% success rate`} change="+4.6%" icon={<CheckCircle2 size={14} />} color="#159b68" soft="#e9f8f1" />
        <Kpi label="Failed / Return" value={formatNumber(failed)} meta={`${filtered.length ? (failed / filtered.length * 100).toFixed(1) : 0}% dari total`} change="-1.8%" icon={<CircleAlert size={14} />} color="#ed1c24" soft="#fff0f0" negative />
        <Kpi label="Pending" value={formatNumber(pending)} meta="perlu tindak lanjut" change="-3.1%" icon={<Clock3 size={14} />} color="#f59e0b" soft="#fff7e6" negative />
        <Kpi label="On Time SLA" value={formatNumber(onTime)} meta={`${filtered.length ? (onTime / filtered.length * 100).toFixed(1) : 0}% patuh SLA`} change="+2.4%" icon={<CheckCircle2 size={14} />} color="#2e73d2" soft="#edf5ff" />
        <Kpi label="Kurir Berubah" value={formatNumber(changed)} meta="shipment dialihkan" change={`${filtered.length ? (changed / filtered.length * 100).toFixed(1) : 0}%`} icon={<Truck size={14} />} color="#7146c7" soft="#f3edff" />
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><div><div className="card-title">Shipment Performance Trend</div><div className="card-sub">Tren status shipment selama 7 hari terakhir</div></div><div className="legend-row"><span className="legend"><span className="dot" style={{ background: "#1b2c6d" }} />Delivered</span><span className="legend"><span className="dot" style={{ background: "#ed1c24" }} />Failed</span><span className="legend"><span className="dot" style={{ background: "#f59e0b" }} />Pending</span></div></div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%"><AreaChart data={monthlyTrendData} margin={{ top: 12, right: 8, left: -20, bottom: 0 }}><defs><linearGradient id="delivered" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#1b2c6d" stopOpacity={.18}/><stop offset="95%" stopColor="#1b2c6d" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef0f4" /><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: "#98a2b3" }} /><YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: "#98a2b3" }} /><Tooltip contentStyle={{ fontSize: 10, borderRadius: 8, border: "1px solid #e7eaf0" }} /><Area type="monotone" dataKey="delivered" stroke="#1b2c6d" strokeWidth={2.4} fill="url(#delivered)" /><Area type="monotone" dataKey="failed" stroke="#ed1c24" strokeWidth={1.7} fill="transparent" /><Area type="monotone" dataKey="pending" stroke="#f59e0b" strokeWidth={1.4} fill="transparent" /></AreaChart></ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <div className="card-head"><div><div className="card-title">Address Classification</div><div className="card-sub">Distribusi tipe alamat penerima</div></div></div>
          <div className="chart-wrap" style={{ height: 215 }}>
            <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={addressData} cx="50%" cy="50%" innerRadius={59} outerRadius={82} paddingAngle={3} dataKey="value" stroke="none">{addressData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}</Pie><text x="50%" y="48%" textAnchor="middle" className="donut-center">{filtered.length}</text><text x="50%" y="58%" textAnchor="middle" className="donut-label">TOTAL DATA</text><Tooltip contentStyle={{ fontSize: 10, borderRadius: 8 }} /></PieChart></ResponsiveContainer>
          </div>
          <div className="mini-stats">{addressData.map((item) => <div className="mini-stat" key={item.name}><div className="mini-label"><span className="dot" style={{ background: item.color, display: "inline-block", marginRight: 5 }} />{item.name}</div><div className="mini-value">{item.value}</div></div>)}</div>
        </div>
      </div>

      <div className="grid-even">
        <div className="card">
          <div className="card-head"><div><div className="card-title">Inbound Time vs Performance</div><div className="card-sub">Success/fail berdasarkan waktu inbound manifest</div></div></div>
          <div className="chart-wrap" style={{ height: 230 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={inboundPerformanceData} margin={{ left: -22, right: 8 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef0f4" /><XAxis dataKey="category" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: "#98a2b3" }} /><YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: "#98a2b3" }} /><Tooltip contentStyle={{ fontSize: 10, borderRadius: 8 }} /><Bar dataKey="success" stackId="a" fill="#1b2c6d" radius={[0,0,3,3]} /><Bar dataKey="failed" stackId="a" fill="#ed1c24" radius={[3,3,0,0]} /></BarChart></ResponsiveContainer></div>
        </div>
        <div className="card">
          <div className="card-head"><div><div className="card-title">First Attempt Recovery</div><div className="card-sub">Shipment gagal di attempt pertama yang berhasil dipulihkan</div></div></div>
          <div className="panel-pad" style={{ paddingTop: 7 }}>
            {[
              { label: "Gagal → Delivered", value: recoveryStats.recovered, color: "#159b68" },
              { label: "Tetap Failed", value: recoveryStats.stillFailed, color: "#ed1c24" },
              { label: "Masih Pending", value: recoveryStats.stillPending, color: "#f59e0b" }
            ].map((item) => {
              const pct = recoveryStats.total > 0 ? (item.value / recoveryStats.total) * 100 : 0;
              return (
                <div key={item.label} style={{ marginBottom: 19 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 7 }}>
                    <span style={{ fontWeight: 700 }}>{item.label}</span>
                    <span style={{ color: "#667085" }}>{item.value} shipment ({pct.toFixed(1)}%)</span>
                  </div>
                  <div style={{ height: 7, borderRadius: 9, background: "#f0f2f5", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: item.color, borderRadius: 9 }} />
                  </div>
                </div>
              );
            })}
            <div className="info-strip">
              <RotateCcw size={16} style={{ flex: "0 0 auto" }} />
              <span>
                <b>{recoveryStats.recoveryRate.toFixed(1)}% recovery rate</b><br />
                {recoveryStats.total > 0 
                  ? `${recoveryStats.recovered} dari ${recoveryStats.total} shipment gagal berhasil dikirim pada attempt berikutnya.` 
                  : "Belum ada data shipment gagal di attempt pertama untuk menghitung pemulihan."
                }
              </span>
            </div>
          </div>
        </div>
      </div>
      <ReportTable rows={filtered} compact />
    </>
  );
}

function Kpi({ label, value, meta, change, icon, color, soft, negative }: { label: string; value: string; meta: string; change: string; icon: React.ReactNode; color: string; soft: string; negative?: boolean }) {
  return <div className="kpi" style={{ "--accent": color, "--accent-soft": soft } as React.CSSProperties}><div className="kpi-top"><span>{label}</span><span className="kpi-icon">{icon}</span></div><div className="kpi-value">{value}</div><div className="kpi-meta"><span className={negative ? "down" : "up"}>{change}</span><span>{meta}</span></div></div>;
}
