"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownToLine, CheckCircle2, Clock3, MapPinned, Package, Truck, Award, ShieldAlert, Navigation } from "lucide-react";
import { useApp } from "@/app/providers";
import { PageHeader } from "./app-shell";
import { ReportTable } from "./report-table";
import { downloadCsv, downloadExcel } from "@/lib/utils";
import { monthlyTrend, inboundPerformance } from "@/lib/data";

type Variant = "daily" | "monthly" | "inbound" | "address" | "courier" | "leader" | "area" | "zone" | "attempt" | "status" | "sla" | "aging";

const copy: Record<Variant, { eyebrow: string; title: string; subtitle: string }> = {
  daily: { eyebrow: "Daily report", title: "Daily Performance", subtitle: "Ringkasan aktivitas dan hasil operasional per hari." },
  monthly: { eyebrow: "Monthly report", title: "Monthly Trends", subtitle: "Analisa tren volume, tingkat sukses, dan kepatuhan SLA bulanan." },
  inbound: { eyebrow: "Time intelligence", title: "Inbound Analysis", subtitle: "Identifikasi dampak jam inbound terhadap keberhasilan pengiriman." },
  address: { eyebrow: "Address intelligence", title: "Address Classification", subtitle: "Tinjau hasil klasifikasi OFFICE, RESIDENCE, dan UNKNOWN." },
  courier: { eyebrow: "Team productivity", title: "Courier Performance", subtitle: "Bandingkan produktivitas, success rate, dan konsistensi kurir." },
  leader: { eyebrow: "Team leadership", title: "Leader Performance", subtitle: "Bandingkan produktivitas, volume, dan success rate per Leader Kurir." },
  area: { eyebrow: "Geographic analytics", title: "Area Performance", subtitle: "Analisa volume pengiriman dan tingkat keberhasilan per Area operasional." },
  zone: { eyebrow: "Zone analytics", title: "Zona Performance", subtitle: "Tinjau performa SLA, volume, dan kendala per Zona operasional." },
  attempt: { eyebrow: "Delivery effort", title: "Attempt Analysis", subtitle: "Analisa jumlah attempt pengiriman dan recovery rate paket gagal." },
  status: { eyebrow: "POD intelligence", title: "Status Analysis", subtitle: "Sebaran status POD akhir (Delivered, Failed, Pending, Return) dan kendalanya." },
  sla: { eyebrow: "Service compliance", title: "SLA Analysis", subtitle: "Analisa ketepatan waktu pengiriman (On Time SLA vs Over SLA)." },
  aging: { eyebrow: "Delivery speed", title: "Aging Analysis", subtitle: "Analisa rata-rata hari pengiriman (aging) dari inbound hingga status akhir." }
};

export function AnalysisView({ variant }: { variant: Variant }) {
  const { reports, toast } = useApp();
  const [period, setPeriod] = useState("7 hari terakhir");
  
  const chartData = useMemo(() => {
    if (variant === "courier") {
      const names = Array.from(new Set(reports.map((row) => row.lastCourierName))).filter(Boolean).slice(0, 6);
      return names.map((name) => { 
        const data = reports.filter((r) => r.lastCourierName === name); 
        return { name: name.split(" ")[0], total: data.length, success: data.length ? Math.round(data.filter((r) => r.status === "DELIVERED").length / data.length * 100) : 0 }; 
      });
    }
    if (variant === "leader") {
      const leaders = Array.from(new Set(reports.map((row) => row.leader))).filter(l => l && l !== "Belum di-lookup").slice(0, 6);
      return leaders.map((name) => {
        const data = reports.filter((r) => r.leader === name);
        return { name, total: data.length, success: data.length ? Math.round(data.filter((r) => r.status === "DELIVERED").length / data.length * 100) : 0 };
      });
    }
    if (variant === "area") {
      const areas = Array.from(new Set(reports.map((row) => row.area))).filter(a => a && a !== "Belum di-lookup").slice(0, 6);
      return areas.map((name) => {
        const data = reports.filter((r) => r.area === name);
        return { name, total: data.length, success: data.length ? Math.round(data.filter((r) => r.status === "DELIVERED").length / data.length * 100) : 0 };
      });
    }
    if (variant === "zone") {
      const zones = Array.from(new Set(reports.map((row) => row.zone))).filter(z => z && z !== "-").slice(0, 6);
      return zones.map((name) => {
        const data = reports.filter((r) => r.zone === name);
        return { name, total: data.length, success: data.length ? Math.round(data.filter((r) => r.status === "DELIVERED").length / data.length * 100) : 0 };
      });
    }
    if (variant === "address") {
      return ["OFFICE", "RESIDENCE", "UNKNOWN"].map((name) => ({ name, value: reports.filter((r) => r.addressCategory === name).length }));
    }
    if (variant === "status") {
      return ["DELIVERED", "FAILED", "PENDING", "RETURN"].map((name) => ({ name, value: reports.filter((r) => r.status === name).length }));
    }
    if (variant === "sla") {
      return ["ON TIME", "OVER SLA"].map((name) => ({ name, value: reports.filter((r) => r.sla === name).length }));
    }
    if (variant === "aging") {
      const areas = Array.from(new Set(reports.map((row) => row.area))).filter(a => a && a !== "Belum di-lookup").slice(0, 6);
      return areas.map((name) => {
        const data = reports.filter((r) => r.area === name);
        const avg = data.length ? +(data.reduce((sum, r) => sum + r.aging, 0) / data.length).toFixed(1) : 0;
        return { name, value: avg };
      });
    }
    if (variant === "attempt") {
      const firstFailed = reports.filter(r => r.firstResult && r.firstResult !== "-" && r.firstResult !== "DELIVERED");
      const recovered = firstFailed.filter(r => r.status === "DELIVERED").length;
      const remainFailed = firstFailed.filter(r => r.status === "FAILED" || r.status === "RETURN").length;
      const pending = firstFailed.length - recovered - remainFailed;
      return [
        { name: "Recovered", value: recovered },
        { name: "Remain Failed", value: remainFailed },
        { name: "Pending", value: pending }
      ];
    }
    return [];
  }, [reports, variant]);

  const c = copy[variant];
  const delivered = reports.filter((r) => r.status === "DELIVERED").length;
  const onTime = reports.filter((r) => r.sla === "ON TIME").length;

  return <>
    <PageHeader eyebrow={c.eyebrow} title={c.title} subtitle={c.subtitle} actions={<><select className="btn" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Periode"><option>Hari ini</option><option>7 hari terakhir</option><option>Bulan ini</option></select><button className="btn" onClick={() => window.print()}><ArrowDownToLine size={13} /> PDF / Print</button><button className="btn" onClick={() => { downloadCsv(reports, `jne-${variant}.csv`); toast("CSV berhasil diunduh"); }}><ArrowDownToLine size={13} /> Export CSV</button><button className="btn btn-primary" onClick={async () => { await downloadExcel(reports, `jne-${variant}.xlsx`); toast("Excel berhasil diunduh"); }}><ArrowDownToLine size={13} /> Export Excel</button></>} />
    
    <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
      <Metric label="Total Shipment" value={reports.length} detail={period} icon={<Package size={14} />} />
      <Metric label="Success Rate" value={`${reports.length ? (delivered / reports.length * 100).toFixed(1) : 0}%`} detail={`${delivered} delivered`} icon={<CheckCircle2 size={14} />} />
      <Metric label="On Time SLA" value={`${reports.length ? (onTime / reports.length * 100).toFixed(1) : 0}%`} detail="target ≥ 90%" icon={<Clock3 size={14} />} />
      
      {variant === "address" && <Metric label="Unknown Address" value={reports.filter((r) => r.addressCategory === "UNKNOWN").length} detail="perlu tindakan" icon={<MapPinned size={14} />} />}
      {variant === "courier" && <Metric label="Courier Active" value={new Set(reports.map((r) => r.lastCourierId)).size} detail="kurir bertugas" icon={<Truck size={14} />} />}
      {variant === "leader" && <Metric label="Total Leader" value={new Set(reports.map((r) => r.leader).filter(x => x && x !== "Belum di-lookup")).size} detail="leader tim" icon={<Award size={14} />} />}
      {variant === "area" && <Metric label="Total Area" value={new Set(reports.map((r) => r.area).filter(x => x && x !== "Belum di-lookup")).size} detail="cakupan wilayah" icon={<Navigation size={14} />} />}
      {variant === "zone" && <Metric label="Active Zones" value={new Set(reports.map((r) => r.zone).filter(x => x && x !== "-")).size} detail="zona operasional" icon={<Navigation size={14} />} />}
      {variant === "attempt" && <Metric label="Total Redirection" value={reports.filter(r => r.courierChanged === "YA").length} detail="kurir dialihkan" icon={<Truck size={14} />} />}
      {variant === "status" && <Metric label="Total Failed & RTS" value={reports.filter(r => r.status === "FAILED" || r.status === "RETURN").length} detail="shipment gagal" icon={<ShieldAlert size={14} />} />}
      {variant === "sla" && <Metric label="Over SLA Count" value={reports.filter(r => r.sla === "OVER SLA").length} detail="terlambat" icon={<Clock3 size={14} />} />}
      {variant === "aging" && <Metric label="Rata-rata Aging" value={`${reports.length ? (reports.reduce((s, r) => s + r.aging, 0) / reports.length).toFixed(1) : 0} Hari`} detail="durasi pengiriman" icon={<Clock3 size={14} />} />}
      {(!["address", "courier", "leader", "area", "zone", "attempt", "status", "sla", "aging"].includes(variant)) && <Metric label="On Time SLA" value={`${reports.length ? (onTime / reports.length * 100).toFixed(1) : 0}%`} detail="target ≥ 90%" icon={<Clock3 size={14} />} />}
    </div>
    
    <div className="grid-even">
      <div className="card"><div className="card-head"><div><div className="card-title">{chartTitle(variant)}</div><div className="card-sub">{chartSubtitle(variant)}</div></div></div><div className="chart-wrap">{renderPrimary(variant, chartData)}</div></div>
      <div className="card"><div className="card-head"><div><div className="card-title">{variant === "courier" || variant === "leader" || variant === "area" || variant === "zone" ? "Success Rate Comparison (%)" : "Operational Breakdown"}</div><div className="card-sub">Perbandingan indikator penting</div></div></div><div className="chart-wrap">{renderSecondary(variant, reports, chartData)}</div></div>
    </div>
    <ReportTable rows={reports} />
  </>;
}

function Metric({ label, value, detail, icon }: { label: string; value: string | number; detail: string; icon: React.ReactNode }) {
  return <div className="kpi" style={{ "--accent": "#1b2c6d", "--accent-soft": "#eef1fa" } as React.CSSProperties}><div className="kpi-top"><span>{label}</span><span className="kpi-icon">{icon}</span></div><div className="kpi-value">{value}</div><div className="kpi-meta"><span className="up">●</span>{detail}</div></div>;
}

function chartTitle(v: Variant) {
  if (v === "inbound") return "Success Rate by Inbound Time";
  if (v === "address") return "Address Distribution";
  if (v === "courier") return "Shipment Volume by Courier";
  if (v === "leader") return "Shipment Volume by Leader";
  if (v === "area") return "Shipment Volume by Area";
  if (v === "zone") return "Shipment Volume by Zone";
  if (v === "attempt") return "Recovery of Failed First Attempts";
  if (v === "status") return "POD Status Distribution";
  if (v === "sla") return "SLA Compliance Ratio";
  if (v === "aging") return "Average Aging Days by Area";
  return "Shipment Volume Trend";
}

function chartSubtitle(v: Variant) {
  if (v === "inbound") return "Per kelompok jam manifest";
  if (v === "address") return "Proporsi hasil klasifikasi alamat";
  if (v === "courier") return "Total paket ditangani (8 besar)";
  if (v === "leader") return "Total paket ditangani per leader";
  if (v === "area") return "Total paket ditangani per wilayah";
  if (v === "zone") return "Total paket ditangani per zona";
  if (v === "attempt") return "Tindakan setelah pengiriman pertama gagal";
  if (v === "status") return "Persentase status terakhir paket";
  if (v === "sla") return "Perbandingan On Time vs Over SLA";
  if (v === "aging") return "Rata-rata hari pengantaran";
  return "Volume status harian";
}

function renderPrimary(v: Variant, data: Array<Record<string, any>>) {
  if (v === "address" || v === "status" || v === "sla" || v === "attempt") {
    const colors = v === "address" 
      ? ["#1b2c6d", "#ed1c24", "#cbd1de"] 
      : v === "status" 
        ? ["#159b68", "#ed1c24", "#f59e0b", "#7146c7"] 
        : v === "sla" 
          ? ["#159b68", "#ed1c24"]
          : ["#159b68", "#ed1c24", "#f59e0b"];
    return <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={54} outerRadius={88} paddingAngle={4}>{colors.map((color) => <Cell key={color} fill={color} />)}</Pie><Tooltip contentStyle={{ fontSize: 10 }} /><Legend wrapperStyle={{ fontSize: 10 }} /></PieChart></ResponsiveContainer>;
  }
  
  if (v === "courier" || v === "leader" || v === "area" || v === "zone") {
    return <ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ left: -25 }}><CartesianGrid vertical={false} stroke="#eef0f4" /><XAxis dataKey="name" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ fontSize: 10 }} /><Bar dataKey="total" fill="#1b2c6d" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer>;
  }
  
  if (v === "inbound") {
    return <ResponsiveContainer width="100%" height="100%"><BarChart data={inboundPerformance} margin={{ left: -25 }}><CartesianGrid vertical={false} stroke="#eef0f4" /><XAxis dataKey="category" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ fontSize: 10 }} /><Bar dataKey="success" fill="#159b68" radius={[4,4,0,0]} /><Bar dataKey="failed" fill="#ed1c24" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer>;
  }

  if (v === "aging") {
    return <ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ left: -25 }}><CartesianGrid vertical={false} stroke="#eef0f4" /><XAxis dataKey="name" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ fontSize: 10 }} /><Bar dataKey="value" fill="#1b2c6d" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer>;
  }

  return <ResponsiveContainer width="100%" height="100%"><LineChart data={monthlyTrend} margin={{ left: -25 }}><CartesianGrid vertical={false} stroke="#eef0f4" /><XAxis dataKey="date" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ fontSize: 10 }} /><Line dataKey="delivered" stroke="#1b2c6d" strokeWidth={2.5} dot={{ r: 2 }} /><Line dataKey="failed" stroke="#ed1c24" strokeWidth={1.8} dot={false} /></LineChart></ResponsiveContainer>;
}

function renderSecondary(v: Variant, reports: any[], primaryData: any[]) {
  let data: Array<{ name: string; value: number }>;
  
  if (v === "courier" || v === "leader" || v === "area" || v === "zone") {
    data = primaryData.map((item) => ({ name: item.name, value: item.success }));
    return <ResponsiveContainer width="100%" height="100%"><BarChart data={data} layout="vertical" margin={{ left: 22, right: 18 }}><CartesianGrid horizontal={false} stroke="#eef0f4" /><XAxis type="number" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} domain={[0, 100]} /><YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} width={70} /><Tooltip contentStyle={{ fontSize: 10 }} /><Bar dataKey="value" fill="#159b68" radius={[0,4,4,0]} /></BarChart></ResponsiveContainer>;
  }
  
  if (v === "address") {
    data = ["Jakarta Selatan", "Jakarta Timur", "Depok", "Bekasi"].map((name) => ({ name, value: reports.filter((r) => r.area === name && r.addressCategory === "OFFICE").length }));
  } else if (v === "inbound") {
    data = inboundPerformance.map((x) => ({ name: x.category, value: x.failed }));
  } else if (v === "sla") {
    data = ["Jakarta Selatan", "Jakarta Timur", "Depok", "Bekasi"].map((name) => {
      const areaRows = reports.filter(r => r.area === name);
      const overSla = areaRows.filter(r => r.sla === "OVER SLA").length;
      const rate = areaRows.length ? Math.round(overSla / areaRows.length * 100) : 0;
      return { name, value: rate };
    });
  } else if (v === "aging") {
    data = ["1 Hari", "2 Hari", "3 Hari", "4+ Hari"].map((label, idx) => {
      const count = idx === 3 
        ? reports.filter(r => r.aging >= 4).length 
        : reports.filter(r => r.aging === idx + 1).length;
      return { name: label, value: count };
    });
    return <ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ left: -25 }}><CartesianGrid vertical={false} stroke="#eef0f4" /><XAxis dataKey="name" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ fontSize: 10 }} /><Bar dataKey="value" fill="#ed1c24" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer>;
  } else if (v === "attempt") {
    data = [
      { name: "Satu Attempt", value: reports.filter(r => r.aging <= 1).length },
      { name: "Dua Attempt", value: reports.filter(r => r.aging === 2).length },
      { name: "Tiga+ Attempt", value: reports.filter(r => r.aging >= 3).length }
    ];
  } else {
    data = ["ON TIME", "OVER SLA"].map((name) => ({ name, value: reports.filter((r) => r.sla === name).length }));
  }
  
  return <ResponsiveContainer width="100%" height="100%"><BarChart data={data} layout="vertical" margin={{ left: 22, right: 18 }}><CartesianGrid horizontal={false} stroke="#eef0f4" /><XAxis type="number" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} width={70} /><Tooltip contentStyle={{ fontSize: 10 }} /><Bar dataKey="value" fill="#ed1c24" radius={[0,4,4,0]} /></BarChart></ResponsiveContainer>;
}
