import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth-token";
import { getSupabaseServerClient } from "@/lib/supabase";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
const unavailable = () => json({ error: "Notifikasi belum dapat dimuat. Silakan coba lagi." }, 503);
export async function GET(req: NextRequest) {
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, process.env.INTERNAL_AUTH_SECRET);
  if (!session) return json({ error: "Silakan masuk kembali." }, 401);
  const db = getSupabaseServerClient();
  if (!db) return unavailable();
  const email = session.email.trim().toLowerCase();
  const id = req.nextUrl.searchParams.get("notification_id");
  if (id) {
    if (!uuid.test(id)) return json({ error: "Notifikasi tidak valid." }, 400);
    const notice = await db.from("ops_notifications").select("entity_type,entity_id").eq("id", id).eq("recipient_email", email).maybeSingle();
    if (notice.error) return unavailable();
    if (!notice.data) return json({ error: "Notifikasi tidak ditemukan." }, 404);
    const isProblem = notice.data.entity_type === "problem";
    if (!isProblem && notice.data.entity_type !== "request") return json({ error: "Detail belum tersedia." }, 404);
    const record = await db.from(isProblem ? "ops_problems" : "ops_requests").select("*").eq("id", notice.data.entity_id).eq(isProblem ? "created_by_email" : "created_by", email).maybeSingle();
    if (record.error) return unavailable();
    if (!record.data) return json({ error: "Laporan sudah tidak tersedia. Riwayat notifikasi tetap tersimpan." }, 404);
    return json({ item: { ...record.data, k: isProblem ? "problem" : "request", t: isProblem ? "Barang Problem" : "Request Helpdesk" } });
  }
  const offset = Number(req.nextUrl.searchParams.get("offset") || 0);
  if (!Number.isInteger(offset) || offset < 0 || offset > 10000) return json({ error: "Halaman tidak valid." }, 400);
  const [rows, unread] = await Promise.all([
    db.from("ops_notifications").select("id,kind,entity_type,entity_id,title,body,status,created_at,read_at").eq("recipient_email", email).order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + 30),
    db.from("ops_notifications").select("id", { count: "exact", head: true }).eq("recipient_email", email).is("read_at", null),
  ]);
  if (rows.error || unread.error) return unavailable();
  return json({ items: (rows.data || []).slice(0, 30), has_more: (rows.data || []).length > 30, unread: unread.count || 0 });
}
export async function POST(req: NextRequest) {
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, process.env.INTERNAL_AUTH_SECRET);
  if (!session) return json({ error: "Silakan masuk kembali." }, 401);
  const db = getSupabaseServerClient();
  if (!db) return unavailable();
  let body;
  try { body = await req.json(); } catch { return json({ error: "Permintaan tidak valid." }, 400); }
  if (!body || body.action !== "read" || (body.id !== undefined && !uuid.test(String(body.id)))) return json({ error: "Permintaan tidak valid." }, 400);
  let query = db.from("ops_notifications").update({ read_at: new Date().toISOString() }).eq("recipient_email", session.email.trim().toLowerCase()).is("read_at", null);
  if (body.id) query = query.eq("id", body.id);
  const result = await query.select("id");
  if (result.error) return unavailable();
  return json({ ok: true, ids: (result.data || []).map(row => row.id) });
}
