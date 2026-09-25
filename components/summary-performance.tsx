"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/app/providers";
import { PageHeader } from "./app-shell";
import { ArrowDownToLine, CalendarDays, CircleGauge, FileSpreadsheet, Percent, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

type PerformanceDay = {
  hari: string;
  tanggalLabel: string;
  reportDateStr: string;
  yesAwb: number;
  yesDelivered: number;
  yesPercent: number;
  ctcAwb: number; // CTC H+1
  ctcDelivered: number;
  ctcPercent: number;
  tiktokDomAwb: number;
  tiktokDomDelivered: number;
  tiktokDomPercent: number;
  tiktokCtcAwb: number; // TikTok CTC H+1
  tiktokCtcDelivered: number;
  tiktokCtcPercent: number;
};

type HubPerformance = {
  hubName: string;
  days: PerformanceDay[];
  totals: {
    yesAwb: number;
    yesDelivered: number;
    ctcAwb: number;
    ctcDelivered: number;
    tiktokDomAwb: number;
    tiktokDomDelivered: number;
    tiktokCtcAwb: number;
    tiktokCtcDelivered: number;
  };
};

const isSameDayCalendar = (d1Str: string, d2Str: string) => {
  if (!d1Str || !d2Str) return false;
  const d1 = new Date(d1Str);
  const d2 = new Date(d2Str);
  if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) return false;
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
};

const isH1OrLessCalendar = (delDateStr: string, repDateStr: string) => {
  if (!delDateStr || !repDateStr) return false;
  const del = new Date(delDateStr);
  const rep = new Date(repDateStr);
  if (Number.isNaN(del.getTime()) || Number.isNaN(rep.getTime())) return false;
  
  const delMidnight = new Date(del.getFullYear(), del.getMonth(), del.getDate());
  const repMidnight = new Date(rep.getFullYear(), rep.getMonth(), rep.getDate());
  
  const diffTime = delMidnight.getTime() - repMidnight.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays <= 1;
};

export function SummaryPerformance() {
  const { allReports, toast } = useApp();
  const [selectedMonthLabel, setSelectedMonthLabel] = useState<string>("");

  // Extract all available month labels from active reports (e.g. "Juli 2026")
  const availableMonths = useMemo(() => {
    const monthsSet = new Set<string>();
    const indonesianMonths = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    
    allReports.forEach((r) => {
      if (r.reportDate) {
        const d = new Date(r.reportDate);
        if (!Number.isNaN(d.getTime())) {
          monthsSet.add(`${indonesianMonths[d.getMonth()]} ${d.getFullYear()}`);
        }
      }
    });

    const months = Array.from(monthsSet);
    if (months.length === 0) {
      months.push("Juli 2026");
    }
    return months;
  }, [allReports]);

  // Set default selected month label
  const activeMonthLabel = selectedMonthLabel || availableMonths[0];

  // Helper to map English/Indonesian day names
  const indonesianDays = ["MINGGU", "SENIN", "SELASA", "RABU", "KAMIS", "JUMAT", "SABTU"];
  const indonesianMonthsShort = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];

  // Filter reports matching the selected month label (from all reports)
  const filteredReports = useMemo(() => {
    const indonesianMonths = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    
    return allReports.filter((r) => {
      if (!r.reportDate) return false;
      const d = new Date(r.reportDate);
      if (Number.isNaN(d.getTime())) return false;
      const label = `${indonesianMonths[d.getMonth()]} ${d.getFullYear()}`;
      return label.toLowerCase() === activeMonthLabel.toLowerCase();
    });
  }, [allReports, activeMonthLabel]);

  // Group by HUB and build day-by-day metrics
  const hubPerformances = useMemo((): HubPerformance[] => {
    if (filteredReports.length === 0) return [];

    // 1. Identify all hubs
    const hubNames = Array.from(
      new Set(
        filteredReports.map((r) => {
          const raw = String(r.leader ? "LEGUTI" : "MALOKO");
          const nameUpper = String(r.area ?? "").toUpperCase();
          if (nameUpper.includes("LEGUTI") || nameUpper.includes("LGT")) return "LEGUTI";
          if (nameUpper.includes("MALOKO") || nameUpper.includes("MLK")) return "MALOKO";
          return raw;
        })
      )
    ).sort();

    // 2. Identify the year and month of the selected period
    const firstRepDate = new Date(filteredReports[0].reportDate);
    const targetYear = firstRepDate.getFullYear();
    const targetMonth = firstRepDate.getMonth(); // 0-11

    // 3. Generate all days of that target month
    const totalDays = new Date(targetYear, targetMonth + 1, 0).getDate();
    const daysInMonth: Date[] = [];
    for (let day = 1; day <= totalDays; day++) {
      daysInMonth.push(new Date(targetYear, targetMonth, day));
    }

    return hubNames.map((hubName) => {
      // Filter reports strictly matching the specific hub from allReports (to support cross-month boundary)
      const hubReports = allReports.filter((r) => {
        const nameUpper = String(r.area ?? "").toUpperCase();
        if (hubName === "LEGUTI") {
          return nameUpper.includes("LEGUTI") || nameUpper.includes("LGT");
        } else {
          return nameUpper.includes("MALOKO") || nameUpper.includes("MLK");
        }
      });

      const daysData = daysInMonth.map((dateObj): PerformanceDay => {
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, "0");
        const day = String(dateObj.getDate()).padStart(2, "0");
        const dateStr = `${year}-${month}-${day}`;

        // Get tomorrow's date for H+1 query
        const nextDateObj = new Date(year, dateObj.getMonth(), dateObj.getDate() + 1);
        const nextYear = nextDateObj.getFullYear();
        const nextMonth = String(nextDateObj.getMonth() + 1).padStart(2, "0");
        const nextDay = String(nextDateObj.getDate()).padStart(2, "0");
        const nextDateStr = `${nextYear}-${nextMonth}-${nextDay}`;

        const dayName = indonesianDays[dateObj.getDay()];
        const formattedDate = `${dateObj.getDate()}-${indonesianMonthsShort[dateObj.getMonth()]}-${String(year).slice(-2)}`;

        // Reports on date D (for H+0)
        const dateReports = hubReports.filter((r) => r.reportDate === dateStr);
        // Reports on date D + 1 (for H+1)
        const nextDateReports = hubReports.filter((r) => r.reportDate === nextDateStr);

        // 1. YES H+0 Calculations (Source: Date D)
        const yesReports = dateReports.filter((r) => {
          const svc = String(r.service ?? "").toUpperCase();
          return svc.startsWith("YES") || svc.includes("YES") || svc.includes("H+0");
        });
        const yesAwb = yesReports.length;
        const yesDelivered = yesReports.filter(r => r.status === "DELIVERED").length;
        const yesPercent = yesAwb > 0 ? (yesDelivered / yesAwb) * 100 : 0;

        // 2. CTC H+1 Calculations (Source: Date D + 1)
        const ctcH1Reports = nextDateReports.filter((r) => {
          const svc = String(r.service ?? "").toUpperCase();
          const isCtc = svc.startsWith("CTC") || svc.includes("CTC") || svc.includes("LGT") || svc.includes("MLK");
          const isTikTok = String(r.shipperName ?? "").toUpperCase().includes("TIKTOK");
          return isCtc && !isTikTok;
        });
        const ctcAwb = ctcH1Reports.length;
        const ctcDelivered = ctcH1Reports.filter(r => r.status === "DELIVERED").length;
        const ctcPercent = ctcAwb > 0 ? (ctcDelivered / ctcAwb) * 100 : 0;

        // 3. TIKTOK DOMESTIK H+0 (Source: Date D)
        const tiktokDomReports = dateReports.filter((r) => {
          const isTikTok = String(r.shipperName ?? "").toUpperCase().includes("TIKTOK");
          const svc = String(r.service ?? "").toUpperCase();
          const isCtc = svc.startsWith("CTC") || svc.includes("CTC") || svc.includes("LGT") || svc.includes("MLK");
          return isTikTok && !isCtc;
        });
        const tiktokDomAwb = tiktokDomReports.length;
        const tiktokDomDelivered = tiktokDomReports.filter(r => r.status === "DELIVERED").length;
        const tiktokDomPercent = tiktokDomAwb > 0 ? (tiktokDomDelivered / tiktokDomAwb) * 100 : 0;

        // 4. TIKTOK CTC H+1 (Source: Date D + 1)
        const tiktokCtcReports = nextDateReports.filter((r) => {
          const isTikTok = String(r.shipperName ?? "").toUpperCase().includes("TIKTOK");
          const svc = String(r.service ?? "").toUpperCase();
          const isCtc = svc.startsWith("CTC") || svc.includes("CTC") || svc.includes("LGT") || svc.includes("MLK");
          return isTikTok && isCtc;
        });
        const tiktokCtcAwb = tiktokCtcReports.length;
        const tiktokCtcDelivered = tiktokCtcReports.filter(r => r.status === "DELIVERED").length;
        const tiktokCtcPercent = tiktokCtcAwb > 0 ? (tiktokCtcDelivered / tiktokCtcAwb) * 100 : 0;

        return {
          hari: dayName,
          tanggalLabel: formattedDate,
          reportDateStr: dateStr,
          yesAwb,
          yesDelivered,
          yesPercent,
          ctcAwb,
          ctcDelivered,
          ctcPercent,
          tiktokDomAwb,
          tiktokDomDelivered,
          tiktokDomPercent,
          tiktokCtcAwb,
          tiktokCtcDelivered,
          tiktokCtcPercent,
        };
      });

      // Calculate totals
      const totals = daysData.reduce(
        (acc, day) => {
          acc.yesAwb += day.yesAwb;
          acc.yesDelivered += day.yesDelivered;
          acc.ctcAwb += day.ctcAwb;
          acc.ctcDelivered += day.ctcDelivered;
          acc.tiktokDomAwb += day.tiktokDomAwb;
          acc.tiktokDomDelivered += day.tiktokDomDelivered;
          acc.tiktokCtcAwb += day.tiktokCtcAwb;
          acc.tiktokCtcDelivered += day.tiktokCtcDelivered;
          return acc;
        },
        {
          yesAwb: 0,
          yesDelivered: 0,
          ctcAwb: 0,
          ctcDelivered: 0,
          tiktokDomAwb: 0,
          tiktokDomDelivered: 0,
          tiktokCtcAwb: 0,
          tiktokCtcDelivered: 0,
        }
      );

      return {
        hubName,
        days: daysData,
        totals,
      };
    });
  }, [allReports, activeMonthLabel, indonesianDays, indonesianMonthsShort]);

  const handleExport = (hubPerf: HubPerformance) => {
    const headers = [
      "HARI", "TANGGAL",
      "YES H+0 AWB", "YES H+0 %",
      "CTC H+1 AWB", "CTC H+1 %",
      "TIKTOK DOMESTIK H+0 AWB", "TIKTOK DOMESTIK H+0 %",
      "TIKTOK CTC H+1 AWB", "TIKTOK CTC H+1 %"
    ];

    const rows = hubPerf.days.map((d) => [
      d.hari, d.tanggalLabel,
      d.yesDelivered > 0 ? d.yesDelivered : "", d.yesAwb > 0 ? `${d.yesPercent.toFixed(2)}%` : "",
      d.ctcDelivered > 0 ? d.ctcDelivered : "", d.ctcAwb > 0 ? `${d.ctcPercent.toFixed(2)}%` : "",
      d.tiktokDomDelivered > 0 ? d.tiktokDomDelivered : "", d.tiktokDomAwb > 0 ? `${d.tiktokDomPercent.toFixed(2)}%` : "",
      d.tiktokCtcDelivered > 0 ? d.tiktokCtcDelivered : "", d.tiktokCtcAwb > 0 ? `${d.tiktokCtcPercent.toFixed(2)}%` : ""
    ]);

    const grandYesPercent = hubPerf.totals.yesAwb > 0 ? (hubPerf.totals.yesDelivered / hubPerf.totals.yesAwb) * 100 : 0;
    const grandCtcPercent = hubPerf.totals.ctcAwb > 0 ? (hubPerf.totals.ctcDelivered / hubPerf.totals.ctcAwb) * 100 : 0;
    const grandTikTokDomPercent = hubPerf.totals.tiktokDomAwb > 0 ? (hubPerf.totals.tiktokDomDelivered / hubPerf.totals.tiktokDomAwb) * 100 : 0;
    const grandTikTokCtcPercent = hubPerf.totals.tiktokCtcAwb > 0 ? (hubPerf.totals.tiktokCtcDelivered / hubPerf.totals.tiktokCtcAwb) * 100 : 0;

    const totalsRow = [
      "GRAND TOTAL", "",
      hubPerf.totals.yesDelivered, hubPerf.totals.yesAwb > 0 ? `${grandYesPercent.toFixed(2)}%` : "0.00%",
      hubPerf.totals.ctcDelivered, hubPerf.totals.ctcAwb > 0 ? `${grandCtcPercent.toFixed(2)}%` : "0.00%",
      hubPerf.totals.tiktokDomDelivered, hubPerf.totals.tiktokDomAwb > 0 ? `${grandTikTokDomPercent.toFixed(2)}%` : "0.00%",
      hubPerf.totals.tiktokCtcDelivered, hubPerf.totals.tiktokCtcAwb > 0 ? `${grandTikTokCtcPercent.toFixed(2)}%` : "0.00%"
    ];

    const csvContent = "\ufeff" + [headers.join(","), ...rows.map(r => r.map(cell => `"${cell}"`).join(",")), totalsRow.map(cell => `"${cell}"`).join(",")].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Summary_Performance_${hubPerf.hubName}_${activeMonthLabel.replace(" ", "_")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast(`Berhasil mengekspor Laporan Summary Performance ${hubPerf.hubName}.`);
  };

  return (
    <>
      <PageHeader
        eyebrow="Monitoring Hub"
        title="Summary Performance All Kurir"
        subtitle="Analisis performa penyelesaian pengiriman berdasarkan produk YES H+0, CTC H+1, dan channel TikTok."
        actions={
          <div className="flex gap-2">
            <select
              className="control"
              style={{ width: 160 }}
              value={activeMonthLabel}
              onChange={(e) => setSelectedMonthLabel(e.target.value)}
            >
              {availableMonths.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        }
      />

      {allReports.length === 0 ? (
        <div className="card text-center" style={{ padding: "40px 20px" }}>
          <div style={{ background: "#fffbeb", width: 56, height: 56, borderRadius: "50%", display: "flex", alignItems: "center", justifyItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <ShieldAlert size={28} style={{ color: "#d97706" }} />
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>Belum Ada Data Laporan</h3>
          <p style={{ color: "#667085", fontSize: 13, maxWidth: 420, margin: "0 auto 16px" }}>
            Anda belum mengunggah file laporan harian JNE. Silakan unggah laporan harian di menu "Upload Report" untuk melihat visualisasi dan summary performance di sini.
          </p>
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="card text-center" style={{ padding: "40px 20px" }}>
          <div style={{ background: "#edf0fa", width: 56, height: 56, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <CalendarDays size={28} style={{ color: "#1b2c6d" }} />
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>Tidak Ada Data di Bulan {activeMonthLabel}</h3>
          <p style={{ color: "#667085", fontSize: 13, maxWidth: 420, margin: "0 auto" }}>
            Coba ganti filter periode bulan aktif menggunakan selektor di pojok kanan atas.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {hubPerformances.map((hubPerf) => {
            const grandYesPercent = hubPerf.totals.yesAwb > 0 ? (hubPerf.totals.yesDelivered / hubPerf.totals.yesAwb) * 100 : 0;
            const grandCtcPercent = hubPerf.totals.ctcAwb > 0 ? (hubPerf.totals.ctcDelivered / hubPerf.totals.ctcAwb) * 100 : 0;
            const grandTikTokDomPercent = hubPerf.totals.tiktokDomAwb > 0 ? (hubPerf.totals.tiktokDomDelivered / hubPerf.totals.tiktokDomAwb) * 100 : 0;
            const grandTikTokCtcPercent = hubPerf.totals.tiktokCtcAwb > 0 ? (hubPerf.totals.tiktokCtcDelivered / hubPerf.totals.tiktokCtcAwb) * 100 : 0;

            return (
              <div className="card" key={hubPerf.hubName} style={{ overflow: "hidden" }}>
                <div className="card-head" style={{ borderBottom: "1px solid #e7eaf0", paddingBottom: 16 }}>
                  <div>
                    <div className="card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <CircleGauge size={18} style={{ color: "#1b2c6d" }} />
                      HUB {hubPerf.hubName}
                    </div>
                    <div className="card-sub">Periode Data: {activeMonthLabel}</div>
                  </div>
                  <button className="btn btn-primary" onClick={() => handleExport(hubPerf)}>
                    <ArrowDownToLine size={13} style={{ marginRight: 5 }} /> Export CSV
                  </button>
                </div>

                <div className="table-wrap" style={{ maxHeight: 600, overflowY: "auto", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                  <table style={{ borderCollapse: "collapse", width: "100%", textAlign: "center", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#1b2c6d", color: "#ffffff" }}>
                        <th rowSpan={2} style={{ padding: "14px 10px", borderRight: "1px solid rgba(255,255,255,0.15)", verticalAlign: "middle", fontWeight: 700 }}>HARI</th>
                        <th rowSpan={2} style={{ padding: "14px 10px", borderRight: "2px solid #1b2c6d", verticalAlign: "middle", fontWeight: 700 }}>TANGGAL</th>
                        <th colSpan={2} style={{ background: "#2e3f7f", color: "#ffffff", padding: "10px", borderRight: "1px solid rgba(255,255,255,0.15)" }}>YES H+0</th>
                        <th colSpan={2} style={{ background: "#3b4d8d", color: "#ffffff", padding: "10px", borderRight: "1px solid rgba(255,255,255,0.15)" }}>CTC H+1</th>
                        <th colSpan={2} style={{ background: "#4b5c9e", color: "#ffffff", padding: "10px", borderRight: "1px solid rgba(255,255,255,0.15)" }}>TIKTOK DOMESTIK H+0</th>
                        <th colSpan={2} style={{ background: "#5569a9", color: "#ffffff", padding: "10px", borderRight: "2px solid #1b2c6d" }}>TIKTOK CTC H+1</th>
                      </tr>
                      <tr style={{ background: "#f1f5f9", color: "#1e293b", borderBottom: "2px solid #cbd5e1" }}>
                        <th style={{ padding: "8px 6px", fontSize: 11, borderRight: "1px solid #e2e8f0", fontWeight: 600 }}>AWB</th>
                        <th style={{ padding: "8px 6px", fontSize: 11, borderRight: "1px solid #cbd5e1", background: "#fefceb", fontWeight: 700, color: "#854d0e" }}>%</th>
                        <th style={{ padding: "8px 6px", fontSize: 11, borderRight: "1px solid #e2e8f0", fontWeight: 600 }}>AWB</th>
                        <th style={{ padding: "8px 6px", fontSize: 11, borderRight: "1px solid #cbd5e1", background: "#fff7ed", fontWeight: 700, color: "#c2410c" }}>%</th>
                        <th style={{ padding: "8px 6px", fontSize: 11, borderRight: "1px solid #e2e8f0", fontWeight: 600 }}>AWB</th>
                        <th style={{ padding: "8px 6px", fontSize: 11, borderRight: "1px solid #cbd5e1", background: "#f0fdf4", fontWeight: 700, color: "#166534" }}>%</th>
                        <th style={{ padding: "8px 6px", fontSize: 11, borderRight: "1px solid #e2e8f0", fontWeight: 600 }}>AWB</th>
                        <th style={{ padding: "8px 6px", fontSize: 11, borderRight: "2px solid #cbd5e1", background: "#eff6ff", fontWeight: 700, color: "#1e40af" }}>%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hubPerf.days.map((d, index) => {
                        const isSunday = d.hari.toUpperCase() === "MINGGU";
                        const rowBg = isSunday ? "#fff1f2" : index % 2 === 0 ? "#ffffff" : "#f8fafc";
                        const textStyle = isSunday ? { color: "#e11d48", fontWeight: 700 } : { color: "#334155" };

                        return (
                          <tr key={d.reportDateStr} style={{ background: rowBg, borderBottom: "1px solid #e2e8f0", transition: "background 0.15s ease" }} className="hover:bg-slate-100">
                            <td style={{ padding: "10px 8px", borderRight: "1px solid #e2e8f0", ...textStyle }}>{d.hari}</td>
                            <td style={{ padding: "10px 8px", borderRight: "2px solid #cbd5e1", ...textStyle }}>{d.tanggalLabel}</td>
                            
                            <td style={{ padding: "10px 8px", borderRight: "1px solid #e2e8f0", color: "#475569" }}>{d.yesDelivered > 0 ? d.yesDelivered : ""}</td>
                            <td style={{ padding: "10px 8px", borderRight: "1px solid #cbd5e1", background: d.yesAwb > 0 ? "#fffdf5" : undefined, fontWeight: d.yesAwb > 0 ? 600 : undefined, color: "#854d0e" }}>
                              {d.yesAwb > 0 ? `${d.yesPercent.toFixed(2)}%` : ""}
                            </td>
                            
                            <td style={{ padding: "10px 8px", borderRight: "1px solid #e2e8f0", color: "#475569" }}>{d.ctcDelivered > 0 ? d.ctcDelivered : ""}</td>
                            <td style={{ padding: "10px 8px", borderRight: "1px solid #cbd5e1", background: d.ctcAwb > 0 ? "#fffaf5" : undefined, fontWeight: d.ctcAwb > 0 ? 600 : undefined, color: "#c2410c" }}>
                              {d.ctcAwb > 0 ? `${d.ctcPercent.toFixed(2)}%` : ""}
                            </td>
                            
                            <td style={{ padding: "10px 8px", borderRight: "1px solid #e2e8f0", color: "#475569" }}>{d.tiktokDomDelivered > 0 ? d.tiktokDomDelivered : ""}</td>
                            <td style={{ padding: "10px 8px", borderRight: "1px solid #cbd5e1", background: d.tiktokDomAwb > 0 ? "#f4fdf8" : undefined, fontWeight: d.tiktokDomAwb > 0 ? 600 : undefined, color: "#166534" }}>
                              {d.tiktokDomAwb > 0 ? `${d.tiktokDomPercent.toFixed(2)}%` : ""}
                            </td>
                            
                            <td style={{ padding: "10px 8px", borderRight: "1px solid #e2e8f0", color: "#475569" }}>{d.tiktokCtcDelivered > 0 ? d.tiktokCtcDelivered : ""}</td>
                            <td style={{ padding: "10px 8px", borderRight: "2px solid #cbd5e1", background: d.tiktokCtcAwb > 0 ? "#f5f9ff" : undefined, fontWeight: d.tiktokCtcAwb > 0 ? 600 : undefined, color: "#1e40af" }}>
                              {d.tiktokCtcAwb > 0 ? `${d.tiktokCtcPercent.toFixed(2)}%` : ""}
                            </td>
                          </tr>
                        );
                      })}
                      
                      {/* Grand Total Row */}
                      <tr style={{ background: "#edf2f7", borderTop: "2px solid #1b2c6d", borderBottom: "2px solid #1b2c6d", fontWeight: 800 }}>
                        <td colSpan={2} style={{ padding: 14, borderRight: "2px solid #cbd5e1", textAlign: "left", color: "#1e293b" }}>GRAND TOTAL</td>
                        
                        <td style={{ padding: 14, borderRight: "1px solid #cbd5e1", color: "#1e293b" }}>{hubPerf.totals.yesDelivered}</td>
                        <td style={{ padding: 14, borderRight: "1px solid #cbd5e1", color: "#854d0e", background: "#fefceb" }}>
                          {hubPerf.totals.yesAwb > 0 ? `${grandYesPercent.toFixed(2)}%` : "0.00%"}
                        </td>
                        
                        <td style={{ padding: 14, borderRight: "1px solid #cbd5e1", color: "#1e293b" }}>{hubPerf.totals.ctcDelivered}</td>
                        <td style={{ padding: 14, borderRight: "1px solid #cbd5e1", color: "#c2410c", background: "#fff7ed" }}>
                          {hubPerf.totals.ctcAwb > 0 ? `${grandCtcPercent.toFixed(2)}%` : "0.00%"}
                        </td>
                        
                        <td style={{ padding: 14, borderRight: "1px solid #cbd5e1", color: "#1e293b" }}>{hubPerf.totals.tiktokDomDelivered}</td>
                        <td style={{ padding: 14, borderRight: "1px solid #cbd5e1", color: "#166534", background: "#f0fdf4" }}>
                          {hubPerf.totals.tiktokDomAwb > 0 ? `${grandTikTokDomPercent.toFixed(2)}%` : "0.00%"}
                        </td>
                        
                        <td style={{ padding: 14, borderRight: "1px solid #cbd5e1", color: "#1e293b" }}>{hubPerf.totals.tiktokCtcDelivered}</td>
                        <td style={{ padding: 14, borderRight: "2px solid #cbd5e1", color: "#1e40af", background: "#eff6ff" }}>
                          {hubPerf.totals.tiktokCtcAwb > 0 ? `${grandTikTokCtcPercent.toFixed(2)}%` : "0.00%"}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
