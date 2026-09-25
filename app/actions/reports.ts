"use server";

import { getSupabaseServerClient, isSupabaseConfigured } from "@/lib/supabase";
import { ReportRow, PodStatus } from "@/lib/types";

// Helper to convert database processed report structure to frontend ReportRow type
function mapDbRowToReportRow(row: any): ReportRow {
  const originalRow = row.raw_reports?.original_row || {};
  const serviceKey = Object.keys(originalRow).find(
    (k) => k.trim().toUpperCase() === "SERVICE" || k.trim().toUpperCase() === "JASA" || k.trim().toUpperCase() === "LAYANAN"
  );
  const service = serviceKey ? String(originalRow[serviceKey] ?? "").trim() : "";

  return {
    id: String(row.id),
    awb: row.awb,
    reportDate: row.report_date,
    uploadDate: new Date(row.processed_at || Date.now()).toISOString().slice(0, 10),
    inboundDate: row.inbound_manifest_date || new Date().toISOString(),
    shipperName: row.shipper_name || "-",
    receiverName: row.receiver_name || "-",
    address: row.full_address || "",
    addressCategory: row.address_category,
    inboundCategory: row.inbound_category || "00.00 - 05.59 WIB",
    firstCourierId: row.first_courier_id || "",
    firstCourierName: row.first_courier_name || "",
    lastCourierId: row.last_courier_id || "",
    lastCourierName: row.last_courier_name || "",
    leader: row.last_leader || "",
    area: row.last_area || "",
    zone: row.last_zone || "",
    firstResult: row.result_first_attempt || "-",
    lastResult: row.result_last_attempt || "-",
    status: row.status_pod as PodStatus,
    courierChanged: row.courier_changed ? "YA" : "TIDAK",
    sla: row.sla || "ON TIME",
    aging: Number(row.aging || 0),
    service
  };
}

// Fetch all reports (using the latest status per AWB as main data)
export async function getActiveReports() {
  if (!isSupabaseConfigured()) {
    return { success: true, demoMode: true, data: [] };
  }

  const supabase = getSupabaseServerClient()!;
  try {
    const { data, error } = await supabase
      .from("processed_reports")
      .select("*, raw_reports(original_row)")
      .order("report_date", { ascending: false });

    if (error) throw error;

    const mapped = data?.map(mapDbRowToReportRow) || [];
    return { success: true, data: mapped };
  } catch (error: any) {
    console.error("Failed to fetch active reports:", error);
    return { success: false, error: error.message || String(error) };
  }
}

// Fetch the complete status change history for a specific AWB
export async function getAwbHistory(awb: string) {
  if (!isSupabaseConfigured()) {
    return { success: true, demoMode: true, data: [] };
  }

  const supabase = getSupabaseServerClient()!;
  try {
    const { data, error } = await supabase
      .from("processed_reports")
      .select("*")
      .eq("awb", awb)
      .order("report_date", { ascending: true });

    if (error) throw error;

    const mapped = data?.map(mapDbRowToReportRow) || [];
    return { success: true, data: mapped };
  } catch (error: any) {
    console.error(`Failed to fetch history for AWB ${awb}:`, error);
    return { success: false, error: error.message || String(error) };
  }
}

// Fetch the upload logs
export async function getUploadLogs() {
  if (!isSupabaseConfigured()) {
    return { success: true, demoMode: true, data: [] };
  }

  const supabase = getSupabaseServerClient()!;
  try {
    const { data, error } = await supabase
      .from("uploads")
      .select("*")
      .order("uploaded_at", { ascending: false });

    if (error) throw error;

    return { success: true, data };
  } catch (error: any) {
    console.error("Failed to fetch upload logs:", error);
    return { success: false, error: error.message || String(error) };
  }
}

// Manual Address Category correction by admin
export async function updateAddressCategory(awb: string, reportDate: string, nextCategory: "OFFICE" | "RESIDENCE", textAddress: string) {
  if (!isSupabaseConfigured()) {
    return { success: true, demoMode: true };
  }

  const supabase = getSupabaseServerClient()!;
  try {
    // 1. Update processed report category
    const { error: updateErr } = await supabase
      .from("processed_reports")
      .update({
        address_category: nextCategory,
        address_category_manual: true
      })
      .eq("awb", awb)
      .eq("report_date", reportDate);

    if (updateErr) throw updateErr;

    // 2. Save correction as a learning rule (normalized pattern check)
    const normalized = textAddress.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    if (normalized.length > 5) {
      await supabase
        .from("address_learning_rules")
        .upsert({
          pattern: textAddress,
          normalized_pattern: normalized,
          category: nextCategory,
          confidence: 100,
          source_address: textAddress
        }, { onConflict: "normalized_pattern" });
    }

    return { success: true };
  } catch (error: any) {
    console.error("Failed to update address category:", error);
    return { success: false, error: error.message || String(error) };
  }
}
