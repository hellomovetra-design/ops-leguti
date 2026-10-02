import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth-token";
import { getSupabaseServerClient } from "@/lib/supabase";
import { pushConfigured, validPushEndpoint } from "@/lib/web-push";

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET(req: NextRequest) {
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, process.env.INTERNAL_AUTH_SECRET);
  if (!session) return json({ error: "Silakan masuk kembali." }, 401);
  return json({ configured: pushConfigured(), publicKey: pushConfigured() ? process.env.WEB_PUSH_PUBLIC_KEY : null });
}
export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== req.nextUrl.origin) return json({ error: "Permintaan tidak valid." }, 403);
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, process.env.INTERNAL_AUTH_SECRET);
  if (!session) return json({ error: "Silakan masuk kembali." }, 401);
  const db = getSupabaseServerClient();
  if (!db || !process.env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: "Notifikasi perangkat belum tersedia." }, 503);
  let body;
  try { body = await req.json(); } catch { return json({ error: "Permintaan tidak valid." }, 400); }
  if (!body || !["subscribe", "unsubscribe", "status"].includes(body.action) || !validPushEndpoint(body.subscription?.endpoint)) return json({ error: "Perangkat tidak valid." }, 400);
  const email = session.email.trim().toLowerCase();
  const endpoint = body.subscription.endpoint;
  const hash = createHash("sha256").update(endpoint).digest("hex");
  if (body.action === "status") {
    const result = await db.from("ops_push_subscriptions").select("id").eq("endpoint_hash", hash).eq("recipient_email", email).maybeSingle();
    return json(result.error ? { error: "Status perangkat belum tersedia." } : { active: !!result.data }, result.error ? 503 : 200);
  }
  if (body.action === "unsubscribe") {
    const result = await db.from("ops_push_subscriptions").delete().eq("endpoint_hash", hash).eq("recipient_email", email);
    return json(result.error ? { error: "Belum berhasil menonaktifkan notifikasi." } : { ok: true }, result.error ? 503 : 200);
  }
  if (!pushConfigured()) return json({ error: "Notifikasi perangkat belum diaktifkan oleh pengelola." }, 503);
  const keys = body.subscription.keys;
  if (!keys || !/^[A-Za-z0-9_-]{87}$/.test(keys.p256dh || "") || !/^[A-Za-z0-9_-]{22}$/.test(keys.auth || "")) return json({ error: "Kunci perangkat tidak valid." }, 400);
  // Do not transfer an endpoint from another account using knowledge of its URL alone.
  const existing = await db.from("ops_push_subscriptions").select("recipient_email").eq("endpoint_hash", hash).maybeSingle();
  if (existing.error) return json({ error: "Pendaftaran perangkat belum tersedia." }, 503);
  if (existing.data && existing.data.recipient_email !== email) return json({ error: "Matikan notifikasi akun sebelumnya di perangkat ini terlebih dahulu." }, 409);
  const payload = { endpoint_hash: hash, endpoint, recipient_email: email, p256dh: keys.p256dh, auth: keys.auth, updated_at: new Date().toISOString() };
  const result = existing.data
    ? await db.from("ops_push_subscriptions").update(payload).eq("endpoint_hash", hash).eq("recipient_email", email)
    : await db.from("ops_push_subscriptions").insert(payload);
  return json(result.error ? { error: "Perangkat belum berhasil didaftarkan." } : { ok: true }, result.error ? 503 : 200);
}
