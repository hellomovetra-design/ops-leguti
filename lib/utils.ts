import { AddressCategory, PodStatus, ReportRow } from "./types";

export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

const officeWords = ["pt", "cv", "ud", "kantor", "office", "ruko", "toko", "store", "shop", "gudang", "warehouse", "pabrik", "factory", "mall", "plaza", "bank", "sekolah", "kampus", "universitas", "klinik", "rumah sakit", "puskesmas", "hotel", "dealer", "showroom", "minimarket", "indomaret", "alfamart", "alfamidi", "lawson"];
const residenceWords = ["rumah", "perumahan", "cluster", "residence", "residance", "griya", "graha", "villa", "komplek", "gang", " gg ", " rt ", " rw ", "kavling", "kontrakan", "kos", "kost", "asri", "regency", "permata", "bukit", "citra", "harmoni", " jl ", "jalan"];

export function classifyAddress(address: string): AddressCategory {
  const normalized = ` ${address.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ")} `;
  if (officeWords.some((word) => normalized.includes(` ${word} `) || normalized.includes(word))) return "OFFICE";
  if (residenceWords.some((word) => normalized.includes(word))) return "RESIDENCE";
  return "UNKNOWN";
}

export function normalizeStatus(value: unknown): PodStatus {
  const status = String(value ?? "").toUpperCase();
  if (/DELIVERED|SUCCESS|POD|TERKIRIM/.test(status)) return "DELIVERED";
  if (/FAIL|UNDEL|GAGAL/.test(status)) return "FAILED";
  if (/RETURN|RTS/.test(status)) return "RETURN";
  return "PENDING";
}

export function parseUploadedRows(rows: Record<string, unknown>[], masterCouriers: any[] = []): ReportRow[] {
  const normalized = rows.map((row) => 
    Object.fromEntries(Object.entries(row).map(([key, value]) => [key.trim().toUpperCase().replace(/[\s-]+/g, "_"), value]))
  );

  // Setup courier mapping
  const courierMap = new Map<string, any>(); // key: courier_id|effectiveMonth (lowercase)
  const latestCourierMap = new Map<string, any>(); // key: courier_id (lowercase)

  masterCouriers.forEach((c) => {
    const idKey = String(c.courierId ?? c.courier_id ?? "").trim().toLowerCase();
    const effMonth = String(c.effectiveMonth ?? c.effective_month ?? "").trim().toLowerCase();
    
    // Normalize effective month label from human format like "Juli 2026" or "2026-07-01"
    let monthKey = effMonth;
    if (effMonth.includes("-")) {
      const d = new Date(effMonth);
      if (!Number.isNaN(d.getTime())) {
        const indonesianMonths = ["januari", "februari", "maret", "april", "mei", "juni", "juli", "agustus", "september", "oktober", "november", "desember"];
        monthKey = `${indonesianMonths[d.getMonth()]} ${d.getFullYear()}`;
      }
    }
    
    if (idKey) {
      courierMap.set(`${idKey}|${monthKey}`, c);
      
      const existingLatest = latestCourierMap.get(idKey);
      const isNewer = !existingLatest || (c.effectiveMonth && existingLatest.effectiveMonth && new Date(c.effectiveMonth) > new Date(existingLatest.effectiveMonth));
      if (isNewer) {
        latestCourierMap.set(idKey, c);
      }
    }
  });

  const indonesianMonths = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

  return normalized.map((row, index) => {
    // Address extraction
    const address1 = String(row.ADDR1 ?? "");
    const address2 = String(row.ADDR2 ?? "");
    const address3 = String(row.ADDR3 ?? "");
    let address = [address1, address2, address3].filter(Boolean).join(" ").trim();
    if (!address) {
      address = String(row.ADDRESS ?? row.ALAMAT ?? row.RECEIVER_ADDRESS ?? row.FULL_ADDRESS ?? "").trim();
    }

    // Inbound time
    const inboundRaw = row.INBOUND_MANIFEST_DATE ?? row.INBOUND_DATE ?? row.TANGGAL_INBOUND ?? row.INBOUND ?? row.DATE_INBOUND;
    const inbound = new Date(String(inboundRaw ?? Date.now()));
    const hour = Number.isNaN(inbound.getTime()) ? 0 : inbound.getHours();
    const inboundCategory = hour < 6 ? "00.00 - 05.59 WIB" : hour < 12 ? "06.00 - 11.59 WIB" : hour < 18 ? "12.00 - 17.59 WIB" : "18.00 - 23.59 WIB";
    
    // Courier IDs
    const firstCourierId = String(
      row["1ST_RUNSHEET_COURIER_ID"] ??
      row["1ST_RUNSHEET_COURIERID"] ??
      row.FIRST_RUNSHEET_COURIER_ID ??
      row.FIRST_RUNSHEET_COURIERID ??
      row.RUNSHEET_COURIER_ID ??
      row.COURIER_ID ??
      row.ID_KURIR ??
      ""
    ).trim().replace(/^'/, "");
    
    const lastCourierId = String(
      row.RUNSHEET_COURIER_ID ??
      row.LAST_RUNSHEET_COURIER_ID ??
      row.LAST_RUNSHEET_COURIERID ??
      firstCourierId
    ).trim().replace(/^'/, "");

    // Report Date
    const rawReportDate = row.DATE_RUNSHEET ?? row.RUNSHEET_DATE ?? row.TANGGAL_RUNSHEET ?? row.DATE ?? row.TANGGAL;
    let reportDate = "";
    let reportMonthLabel = "juli 2026";
    
    if (rawReportDate) {
      const d = new Date(rawReportDate as any);
      if (!Number.isNaN(d.getTime())) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        reportDate = `${year}-${month}-${day}`;
        reportMonthLabel = `${indonesianMonths[d.getMonth()]} ${year}`.toLowerCase();
      } else {
        reportDate = new Date().toISOString().slice(0, 10);
      }
    } else {
      reportDate = new Date().toISOString().slice(0, 10);
    }

    // Lookup courier details locally
    const firstLookupKey = firstCourierId.toLowerCase();
    const lastLookupKey = lastCourierId.toLowerCase();
    const firstCourierInfo = courierMap.get(`${firstLookupKey}|${reportMonthLabel}`) || latestCourierMap.get(firstLookupKey);
    const lastCourierInfo = courierMap.get(`${lastLookupKey}|${reportMonthLabel}`) || latestCourierMap.get(lastLookupKey);

    const firstCourierName = firstCourierInfo?.name || firstCourierInfo?.courier_name || String(
      row["1ST_RUNSHEET_COURIER_NAME"] ??
      row["1ST_RUNSHEET_COURIERNAME"] ??
      row.FIRST_RUNSHEET_COURIER_NAME ??
      row.FIRST_RUNSHEET_COURIERNAME ??
      row.RUNSHEET_COURIER_NAME ??
      row.COURIER_NAME ??
      row.NAMA_KURIR ??
      "Belum di-lookup"
    ).trim();
    
    const lastCourierName = lastCourierInfo?.name || lastCourierInfo?.courier_name || String(
      row.RUNSHEET_COURIER_NAME ??
      row.LAST_RUNSHEET_COURIER_NAME ??
      row.LAST_RUNSHEET_COURIERNAME ??
      row.COURIER_NAME ??
      row.NAMA_KURIR ??
      firstCourierName
    ).trim();

    let area = "";
    const hubInb = String(row.HUB_INB ?? row["HUB INB"] ?? row.HUBINB ?? "").toUpperCase();
    if (hubInb.includes("LEGUTI") || hubInb.includes("LGT")) {
      area = "LEGUTI";
    } else if (hubInb.includes("MALOKO") || hubInb.includes("MLK")) {
      area = "MALOKO";
    }

    if (!area) {
      area = lastCourierInfo?.area || String(row.AREA ?? row.WILAYAH ?? row.SEKTOR ?? "").trim();
    }

    if (!area || area === "Belum di-lookup") {
      const hvoName = String(row.HVO_HUB_NAME ?? row.HVO_HUB ?? row.HVO_HUB_DESTINATION_NAME ?? "").toUpperCase();
      if (hvoName.includes("SRG") || hvoName.includes("BARITO") || hvoName.includes("MALOKO") || hvoName.includes("SERANG")) {
        area = "MALOKO";
      } else if (hvoName.includes("CGK") || hvoName.includes("TGR") || hvoName.includes("LEGUTI") || hvoName.includes("VETERAN")) {
        area = "LEGUTI";
      } else {
        area = "Belum di-lookup";
      }
    }

    let leader = lastCourierInfo?.leader || String(row.LEADER ?? row.LEADER_KURIR ?? row.SPV ?? "").trim();
    if (!leader || leader === "Belum di-lookup") {
      leader = area === "LEGUTI" ? "SPV LEGUTI" : area === "MALOKO" ? "SPV MALOKO" : "Belum di-lookup";
    }

    const zone = lastCourierInfo?.zone || String(row.ZONE ?? row.ZONA ?? "-").trim();

    const statusVal = row.STATUS_POD ?? row.STATUS ?? row.RESULT_LAST_ATTEMPT ?? row.RESULT_LASTAttempt ?? row.LAST_STATUS;
    const status = normalizeStatus(statusVal);

    const isSlaOver = String(row.SLA ?? row.STATUS_SLA ?? "").toUpperCase().includes("OVER");
    const aging = Number(row.AGING ?? row.AGING_DAY ?? row.HARI ?? 0);

    const deliveryRaw = row.TGL_RECEIVED ?? row.TGL_UPDATE_STATUS_POD ?? row.DATE_LAST_ATTEMPT ?? row.DATE_1ST_ATTEMPT;
    let deliveryDate = "";
    if (deliveryRaw) {
      const d = new Date(deliveryRaw as any);
      if (!Number.isNaN(d.getTime())) {
        deliveryDate = d.toISOString();
      }
    }

    return {
      id: `upload-${Date.now()}-${index}`,
      awb: String(row.AWB ?? row.NO_RESI ?? row.NO_RESI_ ?? row.NO_CONNOTE ?? row.CONNOTE ?? row.CONNOTE_NO ?? row.NOMOR_RESI ?? `ROW-${index + 1}`).trim().replace(/^'/, ""),
      reportDate,
      uploadDate: new Date().toISOString().slice(0, 10),
      inboundDate: Number.isNaN(inbound.getTime()) ? new Date().toISOString() : inbound.toISOString(),
      shipperName: String(row.SHIPPER_NAME ?? row.SHIPPER ?? row.PENGIRIM ?? row["Mp Name"] ?? row.MP_NAME ?? row.MPNAME ?? "-").trim(),
      receiverName: String(row.RECEIVER_NAME ?? row.RECEIVER ?? row.PENERIMA ?? "-").trim(),
      address,
      addressCategory: classifyAddress(address),
      inboundCategory,
      firstCourierId,
      firstCourierName,
      lastCourierId,
      lastCourierName,
      leader,
      area,
      zone,
      firstResult: String(row.RESULT_1ST_ATTEMPT ?? "-").trim(),
      lastResult: String(row.RESULT_LAST_ATTEMPT ?? "-").trim(),
      status,
      courierChanged: firstCourierId.toLowerCase() !== lastCourierId.toLowerCase() ? "YA" : "TIDAK",
      sla: isSlaOver ? "OVER SLA" : "ON TIME",
      aging,
      deliveryDate: deliveryDate || undefined,
      service: String(row.SERVICE ?? row.JASA ?? row.LAYANAN ?? "").trim()
    };
  });
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("id-ID").format(value);
}

export function downloadCsv(rows: ReportRow[], filename = "jne-report.csv") {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]) as Array<keyof ReportRow>;
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const csv = [keys.join(","), ...rows.map((row) => keys.map((key) => escape(row[key])).join(","))].join("\n");
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function downloadExcel(rows: any[], filename = "jne-report.xlsx") {
  if (!rows.length) return;
  const XLSX = await import("xlsx");
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
  XLSX.writeFile(workbook, filename);
}
