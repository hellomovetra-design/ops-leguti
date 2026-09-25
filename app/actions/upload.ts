"use server";

import { getSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase";
import { ReportRow, AddressCategory, PodStatus } from "@/lib/types";

// In-memory cache for Gemini API address classifications to reduce token usage and rate-limits
const aiCache = new Map<string, AddressCategory>();

// Helper to normalize strings for pattern matching
function getNormalizedPattern(address: string): string {
  return address.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

// Helper to convert Date or String to YYYY-MM-DD string format
function formatDateToYYYYMMDD(val: any): string {
  if (!val) return new Date().toISOString().slice(0, 10);
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Gemini AI Fallback Classifier
async function classifyAddressWithGemini(address: string, apiKey: string): Promise<AddressCategory> {
  const normalized = getNormalizedPattern(address);
  const cached = aiCache.get(normalized);
  if (cached) return cached;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Task: Classify this Indonesian delivery address into exactly one of these categories: OFFICE, RESIDENCE, or UNKNOWN.\n` +
                    `- Use OFFICE for business entities, companies (PT/CV), shops, schools, hospitals, malls, government offices, commercial buildings, etc.\n` +
                    `- Use RESIDENCE for private houses, housing complexes (perumahan, cluster, griya, regency), apartments, boarding houses (kos), villages, etc.\n` +
                    `- Return ONLY the single word: OFFICE, RESIDENCE, or UNKNOWN. Do not include punctuation or explain your reasoning.\n` +
                    `Address: "${address}"`
            }]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 10
          }
        })
      }
    );

    if (!response.ok) {
      console.error("Gemini AI API returned error:", response.statusText);
      return "UNKNOWN";
    }

    const data = await response.json();
    const resultText = data.contents?.[0]?.parts?.[0]?.text?.trim().toUpperCase() || "UNKNOWN";
    const category: AddressCategory = resultText.includes("OFFICE") 
      ? "OFFICE" 
      : resultText.includes("RESIDENCE") 
        ? "RESIDENCE" 
        : "UNKNOWN";

    aiCache.set(normalized, category);
    return category;
  } catch (error) {
    console.error("Failed to classify address with Gemini:", error);
    return "UNKNOWN";
  }
}

// Regex-based keyword matcher
const officeWords = ["pt", "cv", "ud", "kantor", "office", "ruko", "toko", "store", "shop", "gudang", "warehouse", "pabrik", "factory", "mall", "plaza", "bank", "sekolah", "kampus", "universitas", "klinik", "rumah sakit", "puskesmas", "hotel", "dealer", "showroom", "minimarket", "indomaret", "alfamart", "alfamidi", "lawson"];
const residenceWords = ["rumah", "perumahan", "cluster", "residence", "residance", "griya", "graha", "villa", "komplek", "gang", " gg ", " rt ", " rw ", "kavling", "kontrakan", "kos", "kost", "asri", "regency", "permata", "bukit", "citra", "harmoni", " jl ", "jalan"];

function classifyAddressKeywords(address: string): AddressCategory {
  const norm = ` ${getNormalizedPattern(address)} `;
  if (officeWords.some((word) => norm.includes(` ${word} `) || norm.includes(word))) return "OFFICE";
  if (residenceWords.some((word) => norm.includes(word))) return "RESIDENCE";
  return "UNKNOWN";
}

// Main Batch Processing & UPSERT Server Action
export async function uploadAndProcessReport(fileName: string, rawRows: any[], userEmail?: string) {
  const startTime = Date.now();
  if (!isSupabaseConfigured()) {
    // If Supabase is not configured, we return success with local processing mock metadata
    return {
      success: true,
      demoMode: true,
      stats: {
        fileName,
        total: rawRows.length,
        inserted: rawRows.length,
        updated: 0,
        duplicates: 0,
        errors: 0,
        office: Math.round(rawRows.length * 0.65),
        residence: Math.round(rawRows.length * 0.25),
        unknown: rawRows.length - Math.round(rawRows.length * 0.65) - Math.round(rawRows.length * 0.25),
        courierChanged: Math.round(rawRows.length * 0.15),
        processingTimeMs: Date.now() - startTime
      }
    };
  }

  const supabase = getSupabaseServerClient()!;
  
  // 1. Get current logged-in user profile ID in database (if email matches admin/viewer)
  let userId: string | null = null;
  if (userEmail) {
    const { data: userData } = await supabase
      .from("users")
      .select("id")
      .eq("full_name", "Admin Pusat") // simple resolve
      .limit(1)
      .maybeSingle();
    userId = userData?.id || null;
  }

  // 2. Insert Upload Log row
  const { data: uploadData, error: uploadError } = await supabase
    .from("uploads")
    .insert({
      file_name: fileName,
      row_count: rawRows.length,
      status: "processing",
      uploaded_by: userId
    })
    .select()
    .single();

  if (uploadError || !uploadData) {
    console.error("Failed to create upload log:", uploadError);
    return { success: false, error: "Gagal membuat log riwayat unggahan di database." };
  }

  const uploadId = uploadData.id;

  try {
    // 3. Pre-fetch reference data for in-memory batch mapping (significant optimization)
    // Fetch all learning rules
    const { data: learningRules } = await supabase
      .from("address_learning_rules")
      .select("normalized_pattern,category")
      .eq("is_active", true);

    const rulesMap = new Map<string, AddressCategory>();
    learningRules?.forEach((rule) => {
      rulesMap.set(rule.normalized_pattern.toLowerCase().trim(), rule.category);
    });

    // Fetch all master couriers to perform O(1) in-memory lookups
    const { data: couriersList } = await supabase
      .from("master_couriers")
      .select("*");

    const courierMap = new Map<string, any>(); // key: courier_id|YYYY-MM-01 (case-insensitive key)
    const latestCourierMap = new Map<string, any>(); // key: courier_id

    couriersList?.forEach((c) => {
      const idKey = c.courier_id.trim().toLowerCase();
      courierMap.set(`${idKey}|${c.effective_month}`, c);
      
      const existingLatest = latestCourierMap.get(idKey);
      if (!existingLatest || new Date(c.effective_month) > new Date(existingLatest.effective_month)) {
        latestCourierMap.set(idKey, c);
      }
    });

    // Gemini API key loading
    const geminiKey = process.env.GEMINI_API_KEY || "";

    // 4. Normalize AWB + Date input keys
    const normalizedRows = rawRows.map((row) => 
      Object.fromEntries(Object.entries(row).map(([k, v]) => [k.trim().toUpperCase().replace(/[\s-]+/g, "_"), v]))
    );

    // Filter AWB and dates to check for existing entries
    const awbDateKeys = normalizedRows.map((row) => ({
      awb: String(row.AWB ?? row.NO_RESI ?? row.NO_RESI_ ?? row.NO_CONNOTE ?? row.CONNOTE ?? row.CONNOTE_NO ?? row.NOMOR_RESI ?? "").trim().replace(/^'/, ""),
      report_date: formatDateToYYYYMMDD(row.DATE_RUNSHEET ?? row.RUNSHEET_DATE ?? row.TANGGAL_RUNSHEET ?? row.DATE ?? row.TANGGAL)
    })).filter(x => x.awb);

    // Chunk DB checks for existing rows if too many
    const existingSet = new Set<string>(); // format: awb|report_date
    if (awbDateKeys.length > 0) {
      // For simple UPSERT count, query matched
      const awbList = awbDateKeys.map(k => k.awb);
      for (let i = 0; i < awbList.length; i += 2000) {
        const chunk = awbList.slice(i, i + 2000);
        const { data: matched } = await supabase
          .from("processed_reports")
          .select("awb,report_date")
          .in("awb", chunk);
        
        matched?.forEach(m => {
          existingSet.add(`${m.awb}|${m.report_date}`);
        });
      }
    }

    // 5. Process each row
    const processedReportsToInsert: any[] = [];
    const rawReportsToInsert: any[] = [];

    let insertedCount = 0;
    let updatedCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;

    let officeCount = 0;
    let residenceCount = 0;
    let unknownCount = 0;
    let courierChangedCount = 0;

    for (let index = 0; index < normalizedRows.length; index++) {
      const row = normalizedRows[index];
      const awb = String(row.AWB ?? row.NO_RESI ?? row.NO_RESI_ ?? row.NO_CONNOTE ?? row.CONNOTE ?? row.CONNOTE_NO ?? row.NOMOR_RESI ?? "").trim().replace(/^'/, "");
      if (!awb) {
        errorCount++;
        continue;
      }

      const reportDateStr = formatDateToYYYYMMDD(row.DATE_RUNSHEET ?? row.RUNSHEET_DATE ?? row.TANGGAL_RUNSHEET ?? row.DATE ?? row.TANGGAL);
      const reportDate = new Date(reportDateStr);
      const year = reportDate.getFullYear();
      const month = String(reportDate.getMonth() + 1).padStart(2, "0");
      const effectiveMonthStr = `${year}-${month}-01`;

      const address1 = String(row.ADDR1 ?? "");
      const address2 = String(row.ADDR2 ?? "");
      const address3 = String(row.ADDR3 ?? "");
      let fullAddress = [address1, address2, address3].filter(Boolean).join(" ").trim();
      if (!fullAddress) {
        fullAddress = String(row.ADDRESS ?? row.ALAMAT ?? row.RECEIVER_ADDRESS ?? row.FULL_ADDRESS ?? "").trim();
      }

      // Classification logic
      let addressCategory: AddressCategory = "UNKNOWN";
      const normalizedAddress = getNormalizedPattern(fullAddress);

      // Rule 1: Database learning rule lookup
      if (rulesMap.has(normalizedAddress)) {
        addressCategory = rulesMap.get(normalizedAddress)!;
      } else {
        // Rule 2: Keyword fallback
        addressCategory = classifyAddressKeywords(fullAddress);
        
        // Rule 3: Gemini AI fallback (disabled during batch upload to prevent API rate limits/latency)
        // if (addressCategory === "UNKNOWN" && geminiKey) {
        //   addressCategory = await classifyAddressWithGemini(fullAddress, geminiKey);
        // }
      }

      if (addressCategory === "OFFICE") officeCount++;
      else if (addressCategory === "RESIDENCE") residenceCount++;
      else unknownCount++;

      // Courier lookups with multiple fallback variations
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

      // Look up first courier info case-insensitively
      const firstLookupKey = firstCourierId.toLowerCase();
      let firstCourierInfo = courierMap.get(`${firstLookupKey}|${effectiveMonthStr}`) || latestCourierMap.get(firstLookupKey);
      // Look up last courier info case-insensitively
      const lastLookupKey = lastCourierId.toLowerCase();
      let lastCourierInfo = courierMap.get(`${lastLookupKey}|${effectiveMonthStr}`) || latestCourierMap.get(lastLookupKey);

      const firstCourierName = firstCourierInfo?.courier_name || String(
        row["1ST_RUNSHEET_COURIER_NAME"] ??
        row["1ST_RUNSHEET_COURIERNAME"] ??
        row.FIRST_RUNSHEET_COURIER_NAME ??
        row.FIRST_RUNSHEET_COURIERNAME ??
        row.RUNSHEET_COURIER_NAME ??
        row.COURIER_NAME ??
        row.NAMA_KURIR ??
        "Belum di-lookup"
      ).trim();
      
      const lastCourierName = lastCourierInfo?.courier_name || String(
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

      const courierChanged = firstCourierId.toLowerCase() !== lastCourierId.toLowerCase();
      if (courierChanged) courierChangedCount++;

      // Inbound time category
      const inboundRaw = row.INBOUND_MANIFEST_DATE ?? row.INBOUND_DATE ?? row.TANGGAL_INBOUND ?? row.INBOUND ?? row.DATE_INBOUND;
      const inboundDate = new Date(String(inboundRaw ?? Date.now()));
      const hour = Number.isNaN(inboundDate.getTime()) ? 0 : inboundDate.getHours();
      const inboundCategory = hour < 6 ? "00.00 - 05.59" : hour < 12 ? "06.00 - 11.59" : hour < 18 ? "12.00 - 17.59" : "18.00 - 23.59";

      // Status translation
      const statusStr = String(row.STATUS_POD ?? row.STATUS ?? row.RESULT_LAST_ATTEMPT ?? row.RESULT_LASTAttempt ?? row.LAST_STATUS ?? "").toUpperCase();
      let status: PodStatus = "PENDING";
      if (/DELIVERED|SUCCESS|POD|TERKIRIM/.test(statusStr)) status = "DELIVERED";
      else if (/FAIL|UNDEL|GAGAL/.test(statusStr)) status = "FAILED";
      else if (/RETURN|RTS/.test(statusStr)) status = "RETURN";

      const isSlaOver = String(row.SLA ?? row.STATUS_SLA ?? "").toUpperCase().includes("OVER");
      const aging = Number(row.AGING ?? row.AGING_DAY ?? row.HARI ?? 0);

      // Track insert/update metrics
      const key = `${awb}|${reportDateStr}`;
      if (existingSet.has(key)) {
        updatedCount++;
      } else {
        insertedCount++;
      }

      processedReportsToInsert.push({
        upload_id: uploadId,
        awb,
        report_date: reportDateStr,
        shipper_name: String(row.SHIPPER_NAME ?? row.SHIPPER ?? row.PENGIRIM ?? row["Mp Name"] ?? row.MP_NAME ?? row.MPNAME ?? "-").trim(),
        receiver_name: String(row.RECEIVER_NAME ?? row.RECEIVER ?? row.PENERIMA ?? "-").trim(),
        full_address: fullAddress,
        address_category: addressCategory,
        inbound_manifest_date: Number.isNaN(inboundDate.getTime()) ? null : inboundDate.toISOString(),
        inbound_hour: hour,
        inbound_category: inboundCategory,
        first_courier_id: firstCourierId || null,
        first_courier_name: firstCourierName,
        first_leader: firstCourierInfo?.leader || null,
        first_area: firstCourierInfo?.area || null,
        first_zone: firstCourierInfo?.zone || null,
        last_courier_id: lastCourierId || null,
        last_courier_name: lastCourierName,
        last_leader: leader,
        last_area: area,
        last_zone: zone,
        courier_changed: courierChanged,
        date_first_attempt: (row.DATE_1ST_ATTEMPT && !Number.isNaN(new Date(String(row.DATE_1ST_ATTEMPT)).getTime())) 
          ? new Date(String(row.DATE_1ST_ATTEMPT)).toISOString() 
          : (row.RESULT_1ST_ATTEMPT ? inboundDate.toISOString() : null),
        result_first_attempt: String(row.RESULT_1ST_ATTEMPT ?? "-").trim(),
        date_last_attempt: (row.DATE_LAST_ATTEMPT || row.TGL_RECEIVED || row.TGL_UPDATE_STATUS_POD) && !Number.isNaN(new Date(String(row.DATE_LAST_ATTEMPT || row.TGL_RECEIVED || row.TGL_UPDATE_STATUS_POD)).getTime())
          ? new Date(String(row.DATE_LAST_ATTEMPT || row.TGL_RECEIVED || row.TGL_UPDATE_STATUS_POD)).toISOString()
          : (row.RESULT_LAST_ATTEMPT ? reportDate.toISOString() : null),
        result_last_attempt: String(row.RESULT_LAST_ATTEMPT ?? "-").trim(),
        status_pod: status,
        failed_to_success: row.FAILED_TO_SUCCESS === true || String(row.FAILED_TO_SUCCESS).toUpperCase() === "YA",
        aging,
        sla: isSlaOver ? "OVER SLA" : "ON TIME"
      });

      rawReportsToInsert.push({
        upload_id: uploadId,
        awb,
        report_date: reportDateStr,
        original_row: row
      });
    }

    // 6. DB INSERT/UPSERT in chunks
    for (let i = 0; i < processedReportsToInsert.length; i += 1000) {
      const chunkProcessed = processedReportsToInsert.slice(i, i + 1000);
      const chunkRaw = rawReportsToInsert.slice(i, i + 1000);

      // Raw reports insert (needs to be done first to obtain database row IDs for RLS foreign keys)
      const { data: insertedRaw, error: rawErr } = await supabase
        .from("raw_reports")
        .upsert(chunkRaw, { onConflict: "awb,report_date" })
        .select("id, awb, report_date");

      if (rawErr) throw rawErr;

      // Map raw report IDs to processed reports
      const rawIdMap = new Map<string, any>(); // key: awb|report_date
      insertedRaw?.forEach((r) => {
        rawIdMap.set(`${r.awb}|${r.report_date}`, r.id);
      });

      const chunkProcessedWithRawId = chunkProcessed.map((p) => ({
        ...p,
        raw_report_id: rawIdMap.get(`${p.awb}|${p.report_date}`)
      }));

      // Processed reports upsert
      const { error: procErr } = await supabase
        .from("processed_reports")
        .upsert(chunkProcessedWithRawId, { onConflict: "awb,report_date" });

      if (procErr) throw procErr;
    }


    // 7. Update upload log row with finished state
    const duration = Date.now() - startTime;
    await supabase
      .from("uploads")
      .update({
        status: "processed",
        row_count: rawRows.length,
        valid_count: insertedCount,
        duplicate_count: duplicateCount,
        error_message: null
      })
      .eq("id", uploadId);

    return {
      success: true,
      stats: {
        fileName,
        total: rawRows.length,
        inserted: insertedCount,
        updated: updatedCount,
        duplicates: duplicateCount,
        errors: errorCount,
        office: officeCount,
        residence: residenceCount,
        unknown: unknownCount,
        courierChanged: courierChangedCount,
        processingTimeMs: duration
      }
    };

  } catch (error: any) {
    console.error("Error during report processing:", error);
    
    // Update upload status to failed
    await supabase
      .from("uploads")
      .update({
        status: "failed",
        error_message: error.message || String(error)
      })
      .eq("id", uploadId);

    return { success: false, error: `Gagal memproses unggahan: ${error.message || String(error)}` };
  }
}

// Reprocess all reports to apply new rules
export async function reprocessAllReports() {
  if (!isSupabaseConfigured()) return { success: true, demoMode: true };
  const supabase = getSupabaseServerClient()!;
  
  try {
    // 1. Fetch all raw reports
    const { data: rawReports } = await supabase
      .from("raw_reports")
      .select("*, uploads(file_name, uploaded_by)");

    if (!rawReports || rawReports.length === 0) {
      return { success: true, reprocessedCount: 0 };
    }

    // Collect all rows grouped by upload_id to keep metadata intact
    const uploadsMap = new Map<string, { fileName: string; rows: any[] }>();
    rawReports.forEach((raw) => {
      const uploadId = raw.upload_id;
      const existing = uploadsMap.get(uploadId) || { fileName: raw.uploads?.file_name || "reprocessed_file.xlsx", rows: [] as any[] };
      existing.rows.push(raw.original_row);
      uploadsMap.set(uploadId, existing);
    });

    let totalReprocessed = 0;
    // 2. Reprocess each batch
    for (const [uploadId, data] of uploadsMap.entries()) {
      // Delete old processed entries for this upload
      await supabase.from("processed_reports").delete().eq("upload_id", uploadId);
      
      // Re-trigger standard processing logic
      await uploadAndProcessReport(data.fileName, data.rows);
      totalReprocessed += data.rows.length;
    }

    return { success: true, reprocessedCount: totalReprocessed };
  } catch (error: any) {
    console.error("Reprocess error:", error);
    return { success: false, error: error.message || String(error) };
  }
}

// Delete an uploaded file batch and its cascaded report rows
export async function deleteUploadBatch(uploadId: string) {
  if (!isSupabaseConfigured()) {
    return { success: true, demoMode: true };
  }
  const supabase = getSupabaseServerClient()!;
  try {
    const { error } = await supabase
      .from("uploads")
      .delete()
      .eq("id", uploadId);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error("Delete upload error:", error);
    return { success: false, error: error.message || String(error) };
  }
}
