"use client";

import { ChangeEvent, DragEvent, useRef, useState, useEffect } from "react";
import { Check, FileSpreadsheet, FileUp, Info, LoaderCircle, UploadCloud, AlertCircle, RefreshCw, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useApp } from "@/app/providers";
import { PageHeader } from "./app-shell";
import { parseUploadedRows } from "@/lib/utils";
import { uploadAndProcessReport, deleteUploadBatch } from "@/app/actions/upload";
import { getUploadLogs } from "@/app/actions/reports";
import { isSupabaseConfigured } from "@/lib/supabase";

type UploadLog = {
  id: string;
  file_name: string;
  row_count: number;
  valid_count: number;
  duplicate_count: number;
  status: string;
  uploaded_at: string;
  error_message: string | null;
};

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

const allowedKeys = [
  "AWB", "NO_RESI", "NO_RESI_", "NO_CONNOTE", "CONNOTE", "CONNOTE_NO", "NOMOR_RESI",
  "DATE_RUNSHEET", "RUNSHEET_DATE", "TANGGAL_RUNSHEET", "DATE", "TANGGAL",
  "ADDR1", "ADDR2", "ADDR3", "ADDRESS", "ALAMAT", "RECEIVER_ADDRESS", "FULL_ADDRESS",
  "1ST_RUNSHEET_COURIER_ID", "1ST_RUNSHEET_COURIERID", "FIRST_RUNSHEET_COURIER_ID", 
  "FIRST_RUNSHEET_COURIERID", "RUNSHEET_COURIER_ID", "COURIER_ID", "ID_KURIR",
  "RUNSHEET_COURIER_NAME", "LAST_RUNSHEET_COURIER_NAME", "LAST_RUNSHEET_COURIERNAME", 
  "COURIER_NAME", "NAMA_KURIR", "LEADER", "LEADER_KURIR", "SPV",
  "AREA", "WILAYAH", "SEKTOR", "ZONE", "ZONA",
  "STATUS_POD", "STATUS", "RESULT_LAST_ATTEMPT", "RESULT_LASTAttempt", "LAST_STATUS",
  "SLA", "STATUS_SLA", "AGING", "AGING_DAY", "HARI",
  "SHIPPER_NAME", "SHIPPER", "PENGIRIM", "RECEIVER_NAME", "RECEIVER", "PENERIMA",
  "DATE_1ST_ATTEMPT", "RESULT_1ST_ATTEMPT", "DATE_LAST_ATTEMPT", "TGL_RECEIVED", 
  "TGL_UPDATE_STATUS_POD", "FAILED_TO_SUCCESS", "SERVICE", "JASA", "LAYANAN",
  "HUB INB", "HUB_INB", "HUBINB", "MP NAME", "MP_NAME", "MPNAME"
];

function filterReportRows(rawRows: any[]): any[] {
  const allowedSet = new Set(allowedKeys.map(k => k.toUpperCase()));
  return rawRows.map(row => {
    const filtered: Record<string, any> = {};
    Object.entries(row).forEach(([key, val]) => {
      const upperKey = key.trim().toUpperCase();
      if (allowedSet.has(upperKey)) {
        filtered[key] = val;
      }
    });
    return filtered;
  });
}

function filterHubRows(rows: any[]): any[] {
  return rows.filter((row) => {
    // Check HUB INB column first
    const hubInb = String(row.HUB_INB ?? row["HUB INB"] ?? row.HUBINB ?? "").toUpperCase();
    if (hubInb) {
      return (
        hubInb.includes("LEGUTI") ||
        hubInb.includes("LGT") ||
        hubInb.includes("MALOKO") ||
        hubInb.includes("MLK")
      );
    }
    
    // Fallback 1: check HVO_HUB / HVO_HUB_NAME
    const hvoName = String(row.HVO_HUB_NAME ?? row.HVO_HUB ?? row.HVO_HUB_DESTINATION_NAME ?? "").toUpperCase();
    if (hvoName) {
      return (
        hvoName.includes("SRG") ||
        hvoName.includes("BARITO") ||
        hvoName.includes("MALOKO") ||
        hvoName.includes("SERANG") ||
        hvoName.includes("CGK") ||
        hvoName.includes("TGR") ||
        hvoName.includes("LEGUTI") ||
        hvoName.includes("VETERAN")
      );
    }
    
    // Fallback 2: check courier ID prefix
    const courierId = String(row.RUNSHEET_COURIER_ID ?? row.COURIER_ID ?? row.ID_KURIR ?? "").toUpperCase();
    if (courierId) {
      return (
        courierId.startsWith("TGR") ||
        courierId.startsWith("SRG") ||
        courierId.startsWith("MLK")
      );
    }
    
    return true; // Keep if undetermined to be safe
  });
}

export function UploadReport() {
  const inputRef = useRef<HTMLInputElement>(null);
  const { addReports, toast, refreshReports, allReports } = useApp();
  const router = useRouter();
  const [drag, setDrag] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [stage, setStage] = useState<"idle" | "selected" | "processing" | "success" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [summary, setSummary] = useState<{ total: number; valid: number; duplicate: number } | null>(null);
  const [logs, setLogs] = useState<UploadLog[]>([]);

  const loadLogs = async () => {
    if (isSupabaseConfigured()) {
      const res = await getUploadLogs();
      if (res.success && res.data) {
        setLogs(res.data);
      }
    }
  };

  const handleDeleteUpload = async (uploadId: string) => {
    if (confirm("Apakah Anda yakin ingin menghapus data dari file unggahan ini? Seluruh data laporan yang terkait dengan file ini akan ikut dihapus secara permanen.")) {
      const res = await deleteUploadBatch(uploadId);
      if (res.success) {
        toast("Data laporan berhasil dihapus.");
        await loadLogs();
        await refreshReports();
      } else {
        toast("Gagal menghapus data: " + res.error);
      }
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const handleFileSelect = (selectedFile?: File) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    setFileName(selectedFile.name);
    setStage("selected");
    setErrorMessage("");
    setSummary(null);
  };

  const executeProcessing = async () => {
    if (!file) return;
    setStage("processing");
    setProgress(0);
    setProgressText("Mempersiapkan berkas...");

    const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

    try {
      setProgress(15);
      setProgressText("Membaca data Excel/CSV...");
      await delay(450);

      const XLSX = await import("xlsx");
      let workbook;
      if (file.name.endsWith(".csv")) {
        const text = await file.text();
        workbook = XLSX.read(text, { type: "string", cellDates: true });
      } else {
        const data = await file.arrayBuffer();
        workbook = XLSX.read(data, { type: "array", cellDates: true });
      }

      let sheetName = workbook.SheetNames[0];
      let candidateSheets: { name: string; rowCount: number }[] = [];

      for (const name of workbook.SheetNames) {
        const sheet = workbook.Sheets[name];
        const tempRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];
        if (tempRows.length > 0) {
          const hasAwb = tempRows.slice(0, 15).some(row => 
            Array.isArray(row) && row.some(cell => {
              const s = String(cell).trim().toUpperCase();
              return s === "AWB" || s === "NO_RESI" || s === "CONNOTE" || s === "NO_CONNOTE" || s === "NOMOR_RESI" || s === "AWB ";
            })
          );
          if (hasAwb) {
            candidateSheets.push({ name, rowCount: tempRows.length });
          }
        }
      }

      if (candidateSheets.length > 0) {
        candidateSheets.sort((a, b) => b.rowCount - a.rowCount);
        sheetName = candidateSheets[0].name;
      }

      if (!sheetName) {
        throw new Error("Berkas Excel/CSV kosong atau tidak dapat dibaca.");
      }
      const rawRows = sheetToJsonWithSmartHeaders(XLSX, workbook.Sheets[sheetName]);
      const hubFiltered = filterHubRows(rawRows);
      const rows = filterReportRows(hubFiltered);

      setProgress(35);
      setProgressText("Menganalisis baris dan normalisasi kolom...");
      await delay(450);

      setProgress(60);
      setProgressText("Melakukan verifikasi data & lookup kurir...");
      await delay(100);
      
      const interval = setInterval(() => {
        setProgress((prev) => (prev < 90 ? prev + 3 : prev));
      }, 300);

      const res = await uploadAndProcessReport(file.name, rows);
      clearInterval(interval);

      if (res.success) {
        setProgress(95);
        setProgressText("Mematangkan struktur data...");
        await delay(300);

        if (res.demoMode) {
          let masterCouriers: any[] = [];
          const storedCouriers = localStorage.getItem("jne-ops-couriers");
          if (storedCouriers) {
            try {
              masterCouriers = JSON.parse(storedCouriers);
            } catch {
              masterCouriers = [];
            }
          }
          if (masterCouriers.length === 0) {
            const { sampleCouriers } = await import("@/lib/data");
            masterCouriers = sampleCouriers;
          }
          const parsed = parseUploadedRows(rows, masterCouriers);
          addReports(parsed);
          setSummary({ total: parsed.length, valid: parsed.length, duplicate: 0 });
          toast(`${parsed.length} baris diproses secara demo.`);
        } else {
          addReports([]); 
          if (res.stats) {
            setSummary({
              total: res.stats.total,
              valid: res.stats.inserted,
              duplicate: res.stats.updated + res.stats.duplicates
            });
            toast(`Upload berhasil: ${res.stats.inserted} baru.`);
          }
          loadLogs();
        }

        setProgress(100);
        setProgressText("Proses selesai!");
        await delay(200);
        setStage("success");
      } else {
        setErrorMessage(res.error || "Gagal memproses unggahan.");
        setStage("error");
      }
    } catch (e: any) {
      console.error(e);
      setErrorMessage(`Gagal memproses file: ${e.message || String(e)}`);
      setStage("error");
    }
  };

  const drop = (event: DragEvent) => {
    event.preventDefault();
    setDrag(false);
    handleFileSelect(event.dataTransfer.files[0]);
  };

  return <>
    <PageHeader eyebrow="Data ingestion" title="Upload Daily Report" subtitle="Upload report mentah; sistem akan membersihkan, lookup, dan mengklasifikasikan data otomatis." />
    <div className="grid-2" style={{ gridTemplateColumns: "minmax(0,1.35fr) minmax(300px,.65fr)" }}>
      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Report Harian</div>
            <div className="card-sub">Unggah file excel laporan pengiriman JNE</div>
          </div>
        </div>
        <div className="panel-pad" style={{ paddingTop: 3 }}>
          {stage === "idle" && (
            <div className={`upload-zone ${drag ? "drag" : ""}`} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={drop} onClick={() => inputRef.current?.click()}>
              <div>
                <div className="upload-icon"><UploadCloud size={24} /></div>
                <div style={{ fontSize: 13, fontWeight: 800 }}>Tarik file laporan ke sini</div>
                <div style={{ color: "#98a2b3", fontSize: 10, margin: "7px 0 13px" }}>Format didukung: XLSX, XLS, dan CSV — maksimal 25 MB</div>
                <button className="btn btn-primary" type="button"><FileUp size={13} /> Pilih File</button>
              </div>
              <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e: ChangeEvent<HTMLInputElement>) => handleFileSelect(e.target.files?.[0])} />
            </div>
          )}

          {stage === "selected" && (
            <div className="upload-zone selected" style={{ cursor: "default", borderStyle: "solid", borderColor: "#d0d5dd" }}>
              <div style={{ width: "100%", padding: 14 }}>
                <div className="upload-icon" style={{ background: "#edf0fa", margin: "0 auto 10px" }}><FileSpreadsheet size={24} style={{ color: "#1b2c6d" }} /></div>
                <div style={{ fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fileName}</div>
                <div style={{ color: "#667085", fontSize: 11, margin: "7px 0 16px" }}>File siap diproses. Klik tombol "Mulai Proses" di bawah untuk mendeteksi data & melakukan lookup.</div>
                <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                  <button className="btn" type="button" onClick={() => { setFile(null); setFileName(""); setStage("idle"); }} style={{ border: "1px solid #d0d5dd" }}>Batal</button>
                  <button className="btn btn-primary" type="button" onClick={executeProcessing} style={{ background: "#159b68", borderColor: "#159b68" }}>Mulai Proses</button>
                </div>
              </div>
            </div>
          )}

          {stage === "processing" && (
            <div className="upload-zone processing" style={{ cursor: "default", borderStyle: "solid", borderColor: "#ffe4e6" }}>
              <div style={{ width: "100%", padding: 14 }}>
                <div className="upload-icon" style={{ background: "#fffbeb", margin: "0 auto 10px" }}><LoaderCircle size={24} className="spin" style={{ color: "#d97706" }} /></div>
                <div style={{ fontSize: 13, fontWeight: 800 }}>Memproses File: {progress}%</div>
                <div style={{ color: "#667085", fontSize: 10, marginTop: 4, marginBottom: 12 }}>{progressText}</div>
                <div style={{ width: "80%", height: 8, background: "#f2f4f7", borderRadius: 9, margin: "0 auto 10px", overflow: "hidden" }}>
                  <div style={{ width: `${progress}%`, height: "100%", background: "#1b2c6d", borderRadius: 9, transition: "width 0.3s ease" }} />
                </div>
              </div>
            </div>
          )}

          {stage === "success" && (
            <div className="upload-zone success" style={{ cursor: "default", borderStyle: "solid", borderColor: "#159b68", background: "#f9fbf9" }}>
              <div style={{ width: "100%", padding: 14 }}>
                <div className="upload-icon" style={{ background: "#e9f8f1", margin: "0 auto 10px" }}><CheckCircle2 size={24} style={{ color: "#159b68" }} /></div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#159b68" }}>Proses Laporan Berhasil!</div>
                <div style={{ color: "#667085", fontSize: 10, margin: "6px 0 14px" }}>Data telah berhasil di-lookup dan disimpan ke dalam dashboard.</div>
                
                {summary && (
                  <div className="mini-stats" style={{ maxWidth: 380, margin: "0 auto 16px", border: "1px solid #d2f1e4", borderRadius: 9, overflow: "hidden" }}>
                    <div className="mini-stat" style={{ padding: "8px 6px" }}><div className="mini-label" style={{ fontSize: 8 }}>TOTAL BARIS</div><div className="mini-value" style={{ fontSize: 16 }}>{summary.total}</div></div>
                    <div className="mini-stat" style={{ padding: "8px 6px" }}><div className="mini-label" style={{ fontSize: 8, color: "#159b68" }}>BARU / INSERT</div><div className="mini-value" style={{ fontSize: 16, color: "#159b68" }}>{summary.valid}</div></div>
                    <div className="mini-stat" style={{ padding: "8px 6px" }}><div className="mini-label" style={{ fontSize: 8, color: "#ed1c24" }}>DUPLIKAT / UPDATE</div><div className="mini-value" style={{ fontSize: 16, color: "#ed1c24" }}>{summary.duplicate}</div></div>
                  </div>
                )}
                
                <button className="btn" type="button" onClick={() => { setFile(null); setFileName(""); setStage("idle"); setSummary(null); }} style={{ border: "1px solid #d0d5dd" }}>Unggah File Lain</button>
              </div>
            </div>
          )}

          {stage === "error" && (
            <div className="upload-zone error" style={{ cursor: "default", borderStyle: "solid", borderColor: "#ed1c24", background: "#fff5f5" }}>
              <div style={{ width: "100%", padding: 14 }}>
                <div className="upload-icon" style={{ background: "#fff0f0", margin: "0 auto 10px" }}><AlertCircle size={24} style={{ color: "#ed1c24" }} /></div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#ed1c24" }}>Proses Laporan Gagal</div>
                <div style={{ color: "#981b1b", fontSize: 11, margin: "6px auto 14px", maxWidth: "90%", fontWeight: 600 }}>{errorMessage}</div>
                <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                  <button className="btn" type="button" onClick={() => { setFile(null); setFileName(""); setStage("idle"); }} style={{ border: "1px solid #d0d5dd" }}>Kembali</button>
                  <button className="btn btn-primary" type="button" onClick={executeProcessing} style={{ background: "#ed1c24", borderColor: "#ed1c24" }}><RefreshCw size={12} style={{ marginRight: 5 }} /> Ulangi Proses</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="card">
        <div className="card-head">
          <div>
            <div className="card-title">Alur Pemrosesan</div>
            <div className="card-sub">Dijalankan otomatis setelah upload</div>
          </div>
        </div>
        <div className="panel-pad" style={{ paddingTop: 3 }}>
          <div className="steps">
            {["Validasi & normalisasi kolom", "Parsing tanggal & deduplikasi", "Lookup master kurir bulanan", "Klasifikasi tipe alamat (AI fallback)", "Kalkulasi inbound, attempt & SLA"].map((title, index) => (
              <div className={`step ${stage === "success" ? "done" : ""}`} key={title}>
                <div className="step-no">{stage === "success" ? <Check size={12} /> : index + 1}</div>
                <div>
                  <div className="step-title">{title}</div>
                  <div className="step-desc">{index === 2 ? "Menggunakan versi master sesuai bulan report." : index === 3 ? "Menggunakan kamus, regex, & Gemini AI." : "Pemeriksaan otomatis dan audit trail tersimpan."}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
    <div className="info-strip" style={{ marginBottom: 14 }}><Info size={17} style={{ flex: "0 0 auto" }} /><span>Deduplikasi dicegah menggunakan kombinasi kunci <b>AWB + tanggal report</b> di database PostgreSQL.</span></div>
    <div className="card">
      <div className="card-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div className="card-title">Riwayat Upload</div>
          <div className="card-sub">Batch terbaru dan status pemrosesan database</div>
        </div>
        {!isSupabaseConfigured() && (
          <button className="btn" onClick={() => {
            if (confirm("Apakah Anda yakin ingin menghapus seluruh data demo harian Anda?")) {
              localStorage.removeItem("jne-ops-reports");
              refreshReports();
              toast("Seluruh data laporan demo berhasil dibersihkan.");
            }
          }} style={{ color: "#ed1c24", borderColor: "#fecaca" }}>
            Hapus Semua Data Demo
          </button>
        )}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nama File</th>
              <th>Tanggal Upload</th>
              <th>Jumlah Data</th>
              <th>Valid/Insert</th>
              <th>Update/Duplicate</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
      {isSupabaseConfigured() ? (
        logs.length > 0 ? (
          logs.map((log) => (
            <tr key={log.id}>
              <td><b>{log.file_name}</b></td>
              <td>{new Date(log.uploaded_at).toLocaleString("id-ID")}</td>
              <td>{log.row_count}</td>
              <td>{log.valid_count}</td>
              <td>{log.duplicate_count}</td>
              <td>
                <span className={`badge ${log.status === "processed" ? "success" : log.status === "failed" ? "failed" : "pending"}`}>
                  {log.status.toUpperCase()}
                </span>
              </td>
              <td style={{ display: "flex", gap: 8 }}>
                <button className="btn" onClick={() => router.push("/dashboard")}>
                  {log.status === "processed" ? "Lihat" : "Detail"}
                </button>
                <button className="btn" onClick={() => handleDeleteUpload(log.id)} style={{ color: "#ed1c24", borderColor: "#fecaca" }}>
                  Hapus
                </button>
              </td>
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan={7} style={{ textAlign: "center", color: "#98a2b3", padding: "20px 0" }}>
              Tidak ada riwayat unggahan berkas.
            </td>
          </tr>
        )
      ) : (
        // Demo Mode (Local Browser Storage)
        allReports.length > 0 ? (
          <tr>
            <td><b>data_aktif_demo.xlsx</b></td>
            <td>Aktif (Penyimpanan Lokal Browser)</td>
            <td>{allReports.length} AWB</td>
            <td>{allReports.length}</td>
            <td>0</td>
            <td><span className="badge success">PROCESSED</span></td>
            <td style={{ display: "flex", gap: 8 }}>
              <button className="btn" onClick={() => router.push("/dashboard")}>
                Lihat
              </button>
              <button className="btn" onClick={() => {
                if (confirm("Apakah Anda yakin ingin menghapus seluruh data laporan demo?")) {
                  localStorage.removeItem("jne-ops-reports");
                  refreshReports();
                  toast("Seluruh data laporan demo berhasil dibersihkan.");
                }
              }} style={{ color: "#ed1c24", borderColor: "#fecaca" }}>
                Hapus
              </button>
            </td>
          </tr>
        ) : (
          <tr>
            <td colSpan={7} style={{ textAlign: "center", color: "#98a2b3", padding: "20px 0" }}>
              Tidak ada riwayat unggahan berkas.
            </td>
          </tr>
        )
      )}
    </tbody></table></div></div>
  </>;
}
