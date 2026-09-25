"use client";

import { useRef, useState, useEffect, ChangeEvent } from "react";
import { ArrowDownToLine, FileUp, Search, Users, CheckCircle2, AlertCircle, RefreshCw, FileSpreadsheet, LoaderCircle } from "lucide-react";
import { sampleCouriers } from "@/lib/data";
import { Courier } from "@/lib/types";
import { PageHeader } from "./app-shell";
import { useApp } from "@/app/providers";
import { getActiveCouriers, uploadMasterCouriers } from "@/app/actions/couriers";
import { isSupabaseConfigured } from "@/lib/supabase";

function sheetToJsonWithSmartHeaders(XLSX: any, worksheet: any): any[] {
  const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[][];
  if (rawRows.length === 0) return [];

  const headerKeywords = [
    "id_kurir", "idkurir", "courier_id", "courierid", "nama_kurir", "namakurir", "courier_name", "couriername",
    "awb", "no_resi", "no.resi", "connote", "nomor_resi"
  ];

  let headerRowIndex = 0;
  for (let r = 0; r < Math.min(rawRows.length, 10); r++) {
    const row = rawRows[r];
    if (!Array.isArray(row)) continue;
    
    const hasKeyword = row.some((cell) => {
      if (typeof cell !== "string" && typeof cell !== "number") return false;
      const normalized = String(cell).trim().toLowerCase().replace(/[\s\.\-_]+/g, "_");
      return headerKeywords.some(kw => normalized === kw || normalized.includes(kw));
    });

    if (hasKeyword) {
      headerRowIndex = r;
      break;
    }
  }

  if (headerRowIndex > 0) {
    const headerRow = rawRows[headerRowIndex].map((h) => String(h ?? "").trim());
    const dataRows = rawRows.slice(headerRowIndex + 1);
    
    return dataRows.map((row) => {
      const obj: Record<string, any> = {};
      headerRow.forEach((hdr, colIdx) => {
        if (hdr) {
          obj[hdr] = row[colIdx] !== undefined ? row[colIdx] : "";
        }
      });
      return obj;
    });
  }

  return XLSX.utils.sheet_to_json(worksheet, { defval: "" });
}

export function MasterCouriers() {
  const { toast } = useApp();
  const ref = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState("Juli 2026");
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [loading, setLoading] = useState(false);

  // Modal upload states
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadStage, setUploadStage] = useState<"idle" | "selected" | "processing" | "success" | "error">("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadProgressText, setUploadProgressText] = useState("");
  const [uploadErrorMessage, setUploadErrorMessage] = useState("");

  const loadCouriers = async () => {
    setLoading(true);
    if (isSupabaseConfigured()) {
      const res = await getActiveCouriers();
      if (res.success && res.data) {
        setCouriers(res.data);
      }
    } else {
      const stored = localStorage.getItem("jne-ops-couriers");
      if (stored) {
        try {
          setCouriers(JSON.parse(stored));
        } catch {
          setCouriers(sampleCouriers);
        }
      } else {
        setCouriers(sampleCouriers);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    loadCouriers();
  }, []);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(file);
    setUploadStage("selected");
    setUploadErrorMessage("");
  };

  const executeCourierUpload = async () => {
    if (!uploadFile) return;
    setUploadStage("processing");
    setUploadProgress(0);
    setUploadProgressText("Membaca berkas...");
    
    const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));
    
    try {
      setUploadProgress(20);
      setUploadProgressText("Membaca baris data Excel...");
      await delay(450);

      const XLSX = await import("xlsx");
      let workbook;
      if (uploadFile.name.endsWith(".csv")) {
        const text = await uploadFile.text();
        workbook = XLSX.read(text, { type: "string" });
      } else {
        const buffer = await uploadFile.arrayBuffer();
        workbook = XLSX.read(buffer, { type: "array" });
      }

      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        throw new Error("Berkas Excel/CSV kosong atau tidak dapat dibaca.");
      }
      const raw = sheetToJsonWithSmartHeaders(XLSX, workbook.Sheets[sheetName]);

      setUploadProgress(50);
      setUploadProgressText("Normalisasi kolom dan verifikasi...");
      await delay(450);

      setUploadProgress(70);
      setUploadProgressText("Menyimpan master kurir...");

      const res = await uploadMasterCouriers(month, raw);
      if (res.success) {
        setUploadProgress(90);
        setUploadProgressText("Menyelesaikan penyimpanan...");
        await delay(300);

        if (res.demoMode && res.data) {
          const currentStored = localStorage.getItem("jne-ops-couriers");
          let updatedList: any[] = [];
          if (currentStored) {
            try {
              updatedList = JSON.parse(currentStored);
            } catch {
              updatedList = [];
            }
          }
          
          const mapped: Courier[] = res.data.map((row: any, idx: number) => {
            const dateObj = new Date(row.effective_month);
            const indonesianMonths = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
            const humanMonth = !Number.isNaN(dateObj.getTime()) 
              ? `${indonesianMonths[dateObj.getMonth()]} ${dateObj.getFullYear()}`
              : month;
            
            return {
              id: `local-courier-${Date.now()}-${idx}`,
              courierId: row.courier_id,
              name: row.courier_name,
              leader: row.leader || "-",
              shift: row.shift_kerja || "Pagi",
              vehicle: row.vehicle || "Motor",
              area: row.area || "-",
              district: row.kecamatan || "-",
              zone: row.zone || "-",
              kanit: row.kanit || "-",
              effectiveMonth: humanMonth,
              status: row.status_masuk === "Nonaktif" ? "Nonaktif" : "Aktif"
            };
          });

          const merged = [...mapped];
          updatedList.forEach((existing: any) => {
            const isDuplicate = mapped.some(
              (m: any) => m.courierId.toLowerCase() === existing.courierId.toLowerCase() && m.effectiveMonth.toLowerCase() === existing.effectiveMonth.toLowerCase()
            );
            if (!isDuplicate) {
              merged.push(existing);
            }
          });

          localStorage.setItem("jne-ops-couriers", JSON.stringify(merged));
          setCouriers(merged);
        } else {
          loadCouriers();
        }

        setUploadProgress(100);
        setUploadProgressText("Proses berhasil!");
        await delay(200);
        setUploadStage("success");
        toast(`Master kurir untuk bulan ${month} berhasil dimuat.`);
      } else {
        setUploadErrorMessage(res.error || "Gagal mengunggah master kurir.");
        setUploadStage("error");
      }
    } catch (err: any) {
      console.error(err);
      setUploadErrorMessage(`Gagal memproses file: ${err.message || String(err)}`);
      setUploadStage("error");
    }
  };

  const rows = couriers.filter((c) => 
    `${c.courierId} ${c.name} ${c.leader} ${c.area} ${c.effectiveMonth}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  return <>
    <PageHeader eyebrow="Reference data" title="Master Data Kurir" subtitle="Kelola identitas, wilayah, dan struktur kurir dengan histori versi bulanan." actions={<><button className="btn"><ArrowDownToLine size={13} /> Template</button><button className="btn btn-primary" onClick={() => ref.current?.click()}><FileUp size={13} /> Upload Master</button><input ref={ref} hidden type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} /></>} />
    <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
      <MasterMetric label="Total Master" value={rows.length.toString()} meta={month} />
      <MasterMetric label="Kurir Aktif" value={rows.filter(r => r.status === "Aktif").length.toString()} meta={`${Math.round(rows.length ? (rows.filter(r => r.status === "Aktif").length / rows.length * 100) : 0)}% dari total`} green />
      <MasterMetric label="Leader" value={Array.from(new Set(rows.map(r => r.leader))).filter(l => l !== "-").length.toString()} meta="teridentifikasi" />
      <MasterMetric label="Versi Bulan" value={Array.from(new Set(couriers.map(c => c.effectiveMonth))).length.toString()} meta="periode data master" />
    </div>
    <div className="card"><div className="card-head"><div><div className="card-title">Daftar Kurir</div><div className="card-sub">Master terbaru berlaku efektif per bulan</div></div><div className="actions"><div className="field"><Search size={13} /><input className="control" style={{ width: 220 }} placeholder="Cari kurir..." value={search} onChange={(e) => setSearch(e.target.value)} /></div><select className="control" style={{ width: 130 }} value={month} onChange={(e) => setMonth(e.target.value)}><option>Juli 2026</option><option>Juni 2026</option><option>Mei 2026</option></select></div></div>
      <div className="table-wrap"><table><thead><tr><th>Courier ID</th><th>Nama Kurir</th><th>Leader</th><th>Shift</th><th>Vehicle</th><th>Area</th><th>Kecamatan</th><th>Zone</th><th>Efektif</th><th>Status</th></tr></thead><tbody>
        {rows.map((c) => (
          <tr key={c.id}>
            <td className="awb">{c.courierId}</td>
            <td><b>{c.name}</b></td>
            <td>{c.leader}</td>
            <td>{c.shift}</td>
            <td>{c.vehicle}</td>
            <td>{c.area}</td>
            <td>{c.district}</td>
            <td>{c.zone}</td>
            <td>{c.effectiveMonth}</td>
            <td>
              <span className={`badge ${c.status === "Aktif" ? "success" : "neutral"}`}>
                {c.status.toUpperCase()}
              </span>
            </td>
          </tr>
        ))}
        {rows.length === 0 && <tr><td colSpan={10} style={{ textAlign: "center", padding: 25, color: "#98a2b3" }}>Tidak ada data kurir.</td></tr>}
      </tbody></table></div><div className="table-footer"><span>{rows.length} kurir ditampilkan</span><span>Master lama tidak dihapus saat versi baru diunggah.</span></div>
    </div>

    {/* Overlay Modal untuk Dua Langkah Upload & Progress */}
    {uploadStage !== "idle" && (
      <div style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(27, 44, 109, 0.4)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: 20
      }}>
        <div className="card" style={{ width: "100%", maxWidth: 460, padding: 24, textAlign: "center", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)", border: "1px solid #e7eaf0" }}>
          {uploadStage === "selected" && (
            <div>
              <div style={{ background: "#edf0fa", width: 56, height: 56, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                <FileSpreadsheet size={28} style={{ color: "#1b2c6d" }} />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 6 }}>Proses Master Kurir</h3>
              <p style={{ color: "#667085", fontSize: 12, marginBottom: 18 }}>
                Berkas: <b>{uploadFile?.name}</b><br />
                Akan diunggah ke versi master bulan: <b>{month}</b>
              </p>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button className="btn" type="button" onClick={() => { setUploadFile(null); setUploadStage("idle"); }} style={{ flex: 1, border: "1px solid #d0d5dd" }}>Batal</button>
                <button className="btn btn-primary" type="button" onClick={executeCourierUpload} style={{ flex: 1, background: "#159b68", borderColor: "#159b68" }}>Proses Sekarang</button>
              </div>
            </div>
          )}

          {uploadStage === "processing" && (
            <div>
              <div style={{ background: "#fffbeb", width: 56, height: 56, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                <LoaderCircle size={28} className="spin" style={{ color: "#d97706" }} />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Memproses Master Kurir: {uploadProgress}%</h3>
              <p style={{ color: "#667085", fontSize: 11, marginBottom: 18 }}>{uploadProgressText}</p>
              <div style={{ width: "100%", height: 8, background: "#f2f4f7", borderRadius: 9, overflow: "hidden", marginBottom: 6 }}>
                <div style={{ width: `${uploadProgress}%`, height: "100%", background: "#1b2c6d", borderRadius: 9, transition: "width 0.3s ease" }} />
              </div>
            </div>
          )}

          {uploadStage === "success" && (
            <div>
              <div style={{ background: "#e9f8f1", width: 56, height: 56, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                <CheckCircle2 size={28} style={{ color: "#159b68" }} />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: "#159b68", marginBottom: 6 }}>Proses Berhasil!</h3>
              <p style={{ color: "#667085", fontSize: 12, marginBottom: 20 }}>
                Data master kurir untuk periode <b>{month}</b> berhasil di-import dan diperbarui.
              </p>
              <button className="btn btn-primary" type="button" onClick={() => { setUploadFile(null); setUploadStage("idle"); }} style={{ width: "100%" }}>Selesai & Tutup</button>
            </div>
          )}

          {uploadStage === "error" && (
            <div>
              <div style={{ background: "#fff0f0", width: 56, height: 56, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                <AlertCircle size={28} style={{ color: "#ed1c24" }} />
              </div>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: "#ed1c24", marginBottom: 6 }}>Proses Gagal</h3>
              <p style={{ color: "#981b1b", fontSize: 12, fontWeight: 600, background: "#fff5f5", padding: "10px 14px", borderRadius: 8, marginBottom: 20, textAlign: "left" }}>
                {uploadErrorMessage}
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn" type="button" onClick={() => { setUploadFile(null); setUploadStage("idle"); }} style={{ flex: 1, border: "1px solid #d0d5dd" }}>Batal</button>
                <button className="btn btn-primary" type="button" onClick={executeCourierUpload} style={{ flex: 1, background: "#ed1c24", borderColor: "#ed1c24" }}><RefreshCw size={12} style={{ marginRight: 5 }} /> Coba Lagi</button>
              </div>
            </div>
          )}
        </div>
      </div>
    )}
  </>;
}

function MasterMetric({ label, value, meta, green }: { label: string; value: string; meta: string; green?: boolean }) { return <div className="kpi" style={{ "--accent": green ? "#159b68" : "#1b2c6d", "--accent-soft": green ? "#e9f8f1" : "#eef1fa" } as React.CSSProperties}><div className="kpi-top"><span>{label}</span><span className="kpi-icon"><Users size={14} /></span></div><div className="kpi-value">{value}</div><div className="kpi-meta"><span className="up">●</span>{meta}</div></div>; }
