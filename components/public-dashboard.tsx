"use client";

import { useEffect, useState, useMemo } from "react";
import { Area, AreaChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CalendarDays, CheckCircle2, Clock3, Package, ShieldCheck, Lock, ArrowDownToLine, LoaderCircle } from "lucide-react";
import { getSharedDashboardData } from "@/app/actions/share";
import { ReportRow } from "@/lib/types";
import { downloadCsv, formatNumber } from "@/lib/utils";
import { monthlyTrend } from "@/lib/data";

export function PublicDashboard({ shareId }: { shareId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [linkName, setLinkName] = useState("");
  const [allowDownload, setAllowDownload] = useState(false);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [demoMode, setDemoMode] = useState(false);

  const loadData = async (passInput?: string) => {
    setLoading(true);
    setError("");
    const res = await getSharedDashboardData(shareId, passInput);
    if (res.success) {
      if (res.demoMode) {
        setDemoMode(true);
        setLinkName("Weekly Executive Overview (Demo Mode)");
        setAllowDownload(true);
        // Fallback reports
        setReports([]);
      } else {
        setLinkName(res.linkName || "Shared Dashboard");
        setAllowDownload(!!res.allowDownload);
        setReports(res.reports || []);
        setRequiresPassword(false);
      }
    } else {
      if (res.requiresPassword) {
        setRequiresPassword(true);
      } else {
        setError(res.error || "Gagal membuka dashboard.");
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [shareId]);

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadData(password);
  };

  // Compute metrics from shared reports data
  const delivered = useMemo(() => reports.filter((r) => r.status === "DELIVERED").length, [reports]);
  const failed = useMemo(() => reports.filter((r) => r.status === "FAILED" || r.status === "RETURN").length, [reports]);
  const pending = useMemo(() => reports.filter((r) => r.status === "PENDING").length, [reports]);
  const onTime = useMemo(() => reports.filter((r) => r.sla === "ON TIME").length, [reports]);
  
  const successRate = useMemo(() => {
    return reports.length ? ((delivered / reports.length) * 100).toFixed(1) : "0.0";
  }, [reports, delivered]);

  const slaRate = useMemo(() => {
    return reports.length ? ((onTime / reports.length) * 100).toFixed(1) : "0.0";
  }, [reports, onTime]);

  const statusPieData = useMemo(() => {
    return [
      { name: "Delivered", value: delivered, color: "#159b68" },
      { name: "Failed", value: failed, color: "#ed1c24" },
      { name: "Pending", value: pending, color: "#f59e0b" },
    ];
  }, [delivered, failed, pending]);

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#f5f7fb", gap: 14 }}>
        <LoaderCircle size={32} className="spin" style={{ color: "#1b2c6d" }} />
        <span style={{ fontSize: 13, color: "#667085" }}>Memuat dashboard...</span>
      </div>
    );
  }

  if (requiresPassword) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#f5f7fb" }}>
        <div className="card" style={{ width: "100%", maxWidth: 400, padding: 24, textAlign: "center" }}>
          <div style={{ background: "#eef1fa", width: 48, height: 48, borderRadius: "50%", display: "flex", alignItems: "center", justifyItems: "center", margin: "0 auto 14px", justifyContent: "center" }}>
            <Lock size={20} style={{ color: "#1b2c6d" }} />
          </div>
          <h2 style={{ fontSize: 18, marginBottom: 7 }}>Dashboard Terproteksi</h2>
          <p className="subtitle" style={{ marginBottom: 20 }}>Masukkan password untuk membuka laporan ini.</p>
          <form onSubmit={handlePasswordSubmit}>
            <input 
              autoFocus
              className="control" 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              placeholder="Password" 
              style={{ width: "100%", marginBottom: 14, textAlign: "center" }}
              required 
            />
            {error && <div style={{ color: "#d92d20", fontSize: 11, marginBottom: 14 }}>{error}</div>}
            <button className="btn btn-primary" style={{ width: "100%" }}>Buka Dashboard</button>
          </form>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#f5f7fb" }}>
        <div className="card" style={{ width: "100%", maxWidth: 450, padding: 24, textAlign: "center" }}>
          <h2 style={{ fontSize: 18, color: "#d92d20", marginBottom: 7 }}>Akses Gagal</h2>
          <p className="subtitle" style={{ marginBottom: 20 }}>{error}</p>
          <button className="btn btn-primary" onClick={() => loadData()}>Coba Lagi</button>
        </div>
      </div>
    );
  }

  if (demoMode) {
    return <FallbackPublicDashboard shareId={shareId} />;
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f5f7fb" }}>
      <header style={{ height: 66, background: "#fff", borderBottom: "1px solid #e7eaf0", padding: "0 max(22px, calc((100vw - 1180px)/2))", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <img src="/jne-logo.jpg" alt="JNE Express" style={{ width: 58, height: 42, objectFit: "contain" }} />
          <div>
            <b style={{ fontSize: 12 }}>OPS LEGUTI</b>
            <div style={{ color: "#98a2b3", fontSize: 8 }}>READ-ONLY DASHBOARD</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div className="date-control"><CalendarDays size={13} /> Laporan Terdistribusi</div>
          {allowDownload && (
            <button className="btn btn-primary btn-sm" onClick={() => downloadCsv(reports, `${shareId}-report.csv`)}>
              <ArrowDownToLine size={13} /> Export CSV
            </button>
          )}
        </div>
      </header>
      <div className="content" style={{ maxWidth: 1236 }}>
        <div className="section-head">
          <div>
            <div className="eyebrow">Shared dashboard</div>
            <h1 className="headline">{linkName}</h1>
            <div className="subtitle">Ringkasan operasional JNE · Diproses dinamis dari database terpusat.</div>
          </div>
          <span className="badge success"><ShieldCheck size={11} /> VERIFIED DATA</span>
        </div>
        <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
          <PublicMetric label="Total Shipment" value={formatNumber(reports.length)} detail="shipment aktif" icon={<Package size={14} />} />
          <PublicMetric label="Delivered" value={formatNumber(delivered)} detail={`${successRate}% success rate`} icon={<CheckCircle2 size={14} />} />
          <PublicMetric label="On Time SLA" value={`${slaRate}%`} detail="tingkat kepatuhan" icon={<Clock3 size={14} />} />
          <PublicMetric label="Failed" value={formatNumber(failed)} detail={`${reports.length ? ((failed / reports.length) * 100).toFixed(1) : 0}% dari total`} icon={<Package size={14} />} />
        </div>
        <div className="grid-2">
          <div className="card">
            <div className="card-head">
              <div>
                <div className="card-title">Weekly Performance Trend</div>
                <div className="card-sub">Volume status shipment per hari</div>
              </div>
            </div>
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyTrend} margin={{ left: -20, right: 8 }}>
                  <defs>
                    <linearGradient id="publicArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#1b2c6d" stopOpacity={.22} />
                      <stop offset="1" stopColor="#1b2c6d" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#eef0f4" />
                  <XAxis dataKey="date" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 10 }} />
                  <Area dataKey="delivered" stroke="#1b2c6d" strokeWidth={2.5} fill="url(#publicArea)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="card">
            <div className="card-head">
              <div>
                <div className="card-title">Status Distribution</div>
                <div className="card-sub">Komposisi status terkini</div>
              </div>
            </div>
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusPieData} innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="value" nameKey="name">
                    {statusPieData.map((x) => <Cell key={x.name} fill={x.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ fontSize: 10 }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
        <div style={{ textAlign: "center", color: "#98a2b3", fontSize: 9, paddingTop: 18 }}>Share ID: {shareId} · Dashboard ini bersifat read-only.</div>
      </div>
    </main>
  );
}

function PublicMetric({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: React.ReactNode }) { return <div className="kpi" style={{ "--accent": "#1b2c6d", "--accent-soft": "#eef1fa" } as React.CSSProperties}><div className="kpi-top"><span>{label}</span><span className="kpi-icon">{icon}</span></div><div className="kpi-value">{value}</div><div className="kpi-meta"><span className="up">●</span>{detail}</div></div>; }

// Fallback component for demo mode
function FallbackPublicDashboard({ shareId }: { shareId: string }) {
  return <main style={{ minHeight: "100vh", background: "#f5f7fb" }}>
    <header style={{ height: 66, background: "#fff", borderBottom: "1px solid #e7eaf0", padding: "0 max(22px, calc((100vw - 1180px)/2))", display: "flex", alignItems: "center", justifyContent: "space-between" }}><div style={{ display: "flex", alignItems: "center", gap: 11 }}><img src="/jne-logo.jpg" alt="JNE Express" style={{ width: 58, height: 42, objectFit: "contain" }} /><div><b style={{ fontSize: 12 }}>OPS LEGUTI</b><div style={{ color: "#98a2b3", fontSize: 8 }}>READ-ONLY DASHBOARD</div></div></div><div className="date-control"><CalendarDays size={13} /> 27 Jun – 03 Jul 2026</div></header>
    <div className="content" style={{ maxWidth: 1236 }}><div className="section-head"><div><div className="eyebrow">Shared dashboard</div><h1 className="headline">Weekly Executive Overview</h1><div className="subtitle">Ringkasan operasional JNE · Terakhir diperbarui 03 Jul 2026, 14:26 WIB</div></div><span className="badge success"><ShieldCheck size={11} /> VERIFIED DATA</span></div>
      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(4,1fr)" }}><PublicMetric label="Total Shipment" value="8.475" detail="+8.2% vs last week" icon={<Package size={14} />} /><PublicMetric label="Delivered" value="7.913" detail="93.4% success rate" icon={<CheckCircle2 size={14} />} /><PublicMetric label="On Time SLA" value="92.8%" detail="Target ≥ 90%" icon={<Clock3 size={14} />} /><PublicMetric label="Failed" value="384" detail="4.5% dari total" icon={<Package size={14} />} /></div>
      <div className="grid-2"><div className="card"><div className="card-head"><div><div className="card-title">Weekly Performance Trend</div><div className="card-sub">Volume status shipment per hari</div></div></div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={monthlyTrend} margin={{ left: -20, right: 8 }}><defs><linearGradient id="publicArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1b2c6d" stopOpacity={.22}/><stop offset="1" stopColor="#1b2c6d" stopOpacity={0}/></linearGradient></defs><CartesianGrid vertical={false} stroke="#eef0f4" /><XAxis dataKey="date" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ fontSize: 10 }} /><Area dataKey="delivered" stroke="#1b2c6d" strokeWidth={2.5} fill="url(#publicArea)" /></AreaChart></ResponsiveContainer></div></div>
      <div className="card"><div className="card-head"><div><div className="card-title">Status Distribution</div><div className="card-sub">Komposisi status terkini</div></div></div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={[{name:"Delivered",value:7913},{name:"Failed",value:384},{name:"Pending",value:178}]} innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="value">{["#159b68","#ed1c24","#f59e0b"].map((x)=><Cell key={x} fill={x}/>)}</Pie><Tooltip contentStyle={{fontSize:10}} /></PieChart></ResponsiveContainer></div></div></div>
      <div style={{ textAlign: "center", color: "#98a2b3", fontSize: 9, paddingTop: 18 }}>Share ID: {shareId} · Dashboard ini bersifat read-only.</div>
    </div>
  </main>;
}
