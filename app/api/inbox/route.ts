import { after, NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth-token";
import { getSupabaseServerClient } from "@/lib/supabase";
import { canAccessInbox, INBOX_ADMIN_ROLES } from "@/lib/inbox";
import { dispatchPush } from "@/lib/web-push";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
const unavailable = () => json({ error: "Inbox belum tersedia. Pengelola perlu menyiapkan database Inbox terlebih dahulu." }, 503);

async function context(req: NextRequest, scope: unknown) {
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, process.env.INTERNAL_AUTH_SECRET);
  if (!session) return { response: json({ error: "Silakan masuk kembali." }, 401) };
  if (scope !== "user" && scope !== "admin") return { response: json({ error: "Akses Inbox tidak valid." }, 400) };
  const admin = scope === "admin";
  if (admin && !INBOX_ADMIN_ROLES.includes(session.role)) return { response: json({ error: "Inbox admin hanya tersedia untuk administrator." }, 403) };
  const db = getSupabaseServerClient();
  if (!db || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { response: unavailable() };
  return { db, session, email: session.email.trim().toLowerCase(), admin };
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const ctx = await context(req, params.get("scope") || "user");
  if (ctx.response) return ctx.response;
  const { db, session, email, admin } = ctx;
  const id = params.get("thread_id"), before = params.get("before"), offset = Number(params.get("offset") || 0);
  if ((id && !uuid.test(id)) || !Number.isSafeInteger(offset) || offset < 0 || offset > 10000 || (before !== null && (!id || !Number.isSafeInteger(Number(before)) || Number(before) < 1))) return json({ error: "Halaman Inbox tidak valid." }, 400);
  const feed = await db.rpc("ops_inbox_list", { p_email: email, p_admin: admin, p_offset: offset });
  if (feed.error) return unavailable();
  if (params.get("summary") === "1") return json({ unread: feed.data?.unread || 0 });
  if (!id) return json({ ...feed.data, email });
  const selected = await db.from("ops_inbox_threads").select("*").eq("id", id).maybeSingle();
  if (selected.error) return unavailable();
  if (!selected.data || !canAccessInbox(selected.data, email, session.role, admin)) return json({ error: "Percakapan tidak ditemukan." }, 404);
  let query = db.from("ops_inbox_messages").select("id,seq,thread_id,sender_email,sender_name,sender_role,kind,body,created_at,client_id").eq("thread_id", id).order("seq", { ascending: false }).limit(31);
  if (before) query = query.lt("seq", Number(before));
  const messages = await query;
  if (messages.error) return unavailable();
  return json({ ...feed.data, email, thread: selected.data, messages: (messages.data || []).slice(0, 30).reverse(), more_messages: (messages.data || []).length > 30 });
}

export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== req.nextUrl.origin) return json({ error: "Permintaan tidak valid." }, 403);
  let body;
  try { body = await req.json(); } catch { return json({ error: "Permintaan tidak valid." }, 400); }
  const ctx = await context(req, body?.scope || "user");
  if (ctx.response) return ctx.response;
  const { db, session, email, admin } = ctx;
  if (!body || !["send", "read"].includes(body.action) || !uuid.test(String(body.thread_id || ""))) return json({ error: "Percakapan tidak valid." }, 400);
  if (body.action === "read") {
    if (!Number.isSafeInteger(body.seq) || body.seq < 1) return json({ error: "Status dibaca tidak valid." }, 400);
    const selected = await db.from("ops_inbox_threads").select("id,owner_email").eq("id", body.thread_id).maybeSingle();
    if (selected.error) return unavailable();
    if (!selected.data || !canAccessInbox(selected.data, email, session.role, admin)) return json({ error: "Percakapan tidak ditemukan." }, 404);
    const result = await db.rpc("ops_inbox_mark_read", { p_thread: body.thread_id, p_email: email, p_seq: body.seq });
    return result.error ? unavailable() : json({ ok: true });
  }
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!text || text.length > 2000 || !uuid.test(String(body.client_id || ""))) return json({ error: "Pesan wajib diisi, maksimal 2.000 karakter." }, 400);
  const started = performance.now();
  const result = await db.rpc("ops_inbox_send_fast", { p_thread: body.thread_id, p_email: email, p_admin: admin, p_body: text, p_client: body.client_id });
  if (result.error?.code === "P0002") return json({ error: "Percakapan tidak ditemukan." }, 404);
  if (result.error) return json({ error: "Pesan belum terkirim. Isian tetap tersimpan, silakan coba lagi." }, 503);
  after(() => dispatchPush().catch(() => console.error("Inbox push dispatch failed")));
  const response = json({ ok: true, message: result.data });
  response.headers.set("Server-Timing", `db;dur=${(performance.now() - started).toFixed(1)}`);
  return response;
}
