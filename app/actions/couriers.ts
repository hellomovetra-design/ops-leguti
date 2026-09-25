"use server";

import { getSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase";
import { Courier } from "@/lib/types";

// Helper to convert Indonesian/English month strings like "Juli 2026" into "YYYY-MM-01"
function parseMonthStringToDate(monthStr: string): string {
  const mStr = monthStr.toLowerCase().trim();
  const months: Record<string, string> = {
    jan: "01", januari: "01", january: "01",
    feb: "02", peb: "02", februari: "02", february: "02",
    mar: "03", maret: "03", march: "03",
    apr: "04", april: "04",
    may: "05", mei: "05",
    jun: "06", juni: "06", june: "06",
    jul: "07", juli: "07", july: "07",
    agu: "08", agt: "08", agustus: "08", august: "08",
    sep: "09", september: "09",
    okt: "10", oktober: "10", october: "10",
    nov: "11", nop: "11", november: "11",
    des: "12", desember: "12", december: "12"
  };
  
  const words = mStr.split(/\s+/);
  let year = new Date().getFullYear();
  let month = "01";
  
  for (const word of words) {
    if (/^\d{4}$/.test(word)) {
      year = parseInt(word);
    } else {
      const key = Object.keys(months).find(k => word.startsWith(k));
      if (key) month = months[key];
    }
  }
  return `${year}-${month}-01`;
}

// Convert DB columns to Courier frontend interface
function mapDbToCourier(row: any): Courier {
  // Convert date format "YYYY-MM-DD" to human readable "Juli 2026"
  const dateObj = new Date(row.effective_month);
  const indonesianMonths = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const humanMonth = !Number.isNaN(dateObj.getTime()) 
    ? `${indonesianMonths[dateObj.getMonth()]} ${dateObj.getFullYear()}`
    : "Juli 2026";

  return {
    id: String(row.id),
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
}

// Fetch all courier master listings
export async function getActiveCouriers() {
  if (!isSupabaseConfigured()) {
    return { success: true, demoMode: true, data: [] };
  }

  const supabase = getSupabaseServerClient()!;
  try {
    const { data, error } = await supabase
      .from("master_couriers")
      .select("*")
      .order("uploaded_at", { ascending: false });

    if (error) throw error;

    const mapped = data?.map(mapDbToCourier) || [];
    return { success: true, data: mapped };
  } catch (error: any) {
    console.error("Failed to fetch master couriers:", error);
    return { success: false, error: error.message || String(error) };
  }
}

// Upload new master couriers list
export async function uploadMasterCouriers(monthLabel: string, rawRows: any[]) {
  if (!isSupabaseConfigured()) {
    const effectiveMonthDate = parseMonthStringToDate(monthLabel);
    // Normalize properties
    const normalizedRows = rawRows.map((row) => 
      Object.fromEntries(Object.entries(row).map(([k, v]) => [k.trim().toUpperCase().replace(/[\s-]+/g, "_"), v]))
    );

    const couriersToUpsert: any[] = [];
    normalizedRows.forEach((row) => {
      const courierId = String(
        row.COURIER_ID ?? 
        row.ID_KURIR ?? 
        row.IDKURIR ?? 
        row.KODE_KURIR ?? 
        row.KODE ?? 
        row.ID ?? 
        ""
      ).trim().replace(/^'/, "");
      
      const courierName = String(
        row.COURIER_NAME ?? 
        row.NAMA_KURIR ?? 
        row.NAMA ?? 
        row.NAMA_LENGKAP ?? 
        row.NAMA_AGEN ?? 
        ""
      ).trim();
      
      if (courierId && courierName) {
        couriersToUpsert.push({
          courier_id: courierId,
          courier_name: courierName,
          leader: String(row.LEADER ?? row.LEADER_KURIR ?? row.SPV ?? row.SUPERVISOR ?? ""),
          shift_kerja: String(row.SHIFT ?? row.SHIFT_KERJA ?? "Pagi"),
          vehicle: String(row.VEHICLE ?? row.KENDARAAN ?? row.VICH ?? "Motor"),
          area: String(row.AREA ?? row.WILAYAH ?? row.SEKTOR ?? row.RAYON ?? ""),
          kecamatan: String(row.KECAMATAN ?? row.DISTRICT ?? row.KEC ?? ""),
          zone: String(row.ZONE ?? row.ZONA ?? ""),
          kanit: String(row.KANIT ?? row.KEPALA_UNIT ?? ""),
          kode: String(row.KODE ?? row.KODE_AGEN ?? ""),
          kpi: Number(row.KPI ?? 100),
          status_masuk: String(row.STATUS ?? row.STATUS_MASUK ?? row.MASUK ?? "Aktif"),
          effective_month: effectiveMonthDate
        });
      }
    });

    if (couriersToUpsert.length === 0) {
      return { success: false, error: "Tidak ada data kurir valid yang ditemukan. Pastikan kolom Excel mencakup ID Kurir / Courier ID dan Nama Kurir." };
    }

    return { success: true, demoMode: true, data: couriersToUpsert };
  }

  const supabase = getSupabaseServerClient()!;
  const effectiveMonthDate = parseMonthStringToDate(monthLabel);

  try {
    // Normalize properties
    const normalizedRows = rawRows.map((row) => 
      Object.fromEntries(Object.entries(row).map(([k, v]) => [k.trim().toUpperCase().replace(/[\s-]+/g, "_"), v]))
    );

    const couriersToUpsert: any[] = [];
    normalizedRows.forEach((row) => {
      const courierId = String(
        row.COURIER_ID ?? 
        row.ID_KURIR ?? 
        row.IDKURIR ?? 
        row.KODE_KURIR ?? 
        row.KODE ?? 
        row.ID ?? 
        ""
      ).trim().replace(/^'/, "");
      
      const courierName = String(
        row.COURIER_NAME ?? 
        row.NAMA_KURIR ?? 
        row.NAMA ?? 
        row.NAMA_LENGKAP ?? 
        row.NAMA_AGEN ?? 
        ""
      ).trim();
      
      if (courierId && courierName) {
        couriersToUpsert.push({
          courier_id: courierId,
          courier_name: courierName,
          leader: String(row.LEADER ?? row.LEADER_KURIR ?? row.SPV ?? row.SUPERVISOR ?? ""),
          shift_kerja: String(row.SHIFT ?? row.SHIFT_KERJA ?? "Pagi"),
          vehicle: String(row.VEHICLE ?? row.KENDARAAN ?? row.VICH ?? "Motor"),
          area: String(row.AREA ?? row.WILAYAH ?? row.SEKTOR ?? row.RAYON ?? ""),
          kecamatan: String(row.KECAMATAN ?? row.DISTRICT ?? row.KEC ?? ""),
          zone: String(row.ZONE ?? row.ZONA ?? ""),
          kanit: String(row.KANIT ?? row.KEPALA_UNIT ?? ""),
          kode: String(row.KODE ?? row.KODE_AGEN ?? ""),
          kpi: Number(row.KPI ?? 100),
          status_masuk: String(row.STATUS ?? row.STATUS_MASUK ?? row.MASUK ?? "Aktif"),
          effective_month: effectiveMonthDate
        });
      }
    });

    if (couriersToUpsert.length === 0) {
      return { success: false, error: "Tidak ada data kurir valid yang ditemukan. Periksa nama kolom berkas Excel Anda." };
    }

    // Upsert in batches of 200
    for (let i = 0; i < couriersToUpsert.length; i += 200) {
      const chunk = couriersToUpsert.slice(i, i + 200);
      const { error: upsertErr } = await supabase
        .from("master_couriers")
        .upsert(chunk, { onConflict: "courier_id,effective_month" });

      if (upsertErr) throw upsertErr;
    }

    return { success: true, count: couriersToUpsert.length };
  } catch (error: any) {
    console.error("Failed to upload master couriers:", error);
    return { success: false, error: error.message || String(error) };
  }
}
