import { Courier, ReportRow } from "./types";

// Data demo modul lama dikosongkan sementara.
// Saat ini aplikasi difokuskan ke Breakdown YES yang membaca workbook langsung di browser.
export const sampleReports: ReportRow[] = [];
export const sampleCouriers: Courier[] = [];
export const monthlyTrend: Array<{ date: string; delivered: number; failed: number; pending: number }> = [];
export const inboundPerformance: Array<{ category: string; success: number; failed: number }> = [];
