import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, decodeBase64Url, encodeBase64Url, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth-token";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const attempts = new Map<string, { count: number; resetAt: number }>();
const IS_LOCAL_DEV = process.env.NODE_ENV !== "production";
const MAX_ATTEMPTS = IS_LOCAL_DEV ? 50 : 5;
const WINDOW_MS = IS_LOCAL_DEV ? 2 * 60 * 1000 : 15 * 60 * 1000;
const encoder = new TextEncoder();

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function derivePasswordHash(password: string, salt: string) {
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: decodeBase64Url(salt), iterations: 210_000 },
    material,
    256,
  );
  return new Uint8Array(bits);
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const record = attempts.get(ip);
  if (record && record.resetAt > now && record.count >= MAX_ATTEMPTS) {
    const retrySeconds = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
    const retryMinutes = Math.ceil(retrySeconds / 60);
    return NextResponse.json(
      { error: `Terlalu banyak percobaan. Coba lagi dalam ${retryMinutes} menit.` },
      { status: 429, headers: { "Retry-After": String(retrySeconds), "Cache-Control": "no-store" } },
    );
  }
  if (!record || record.resetAt <= now) attempts.set(ip, { count: 0, resetAt: now + WINDOW_MS });

  let body: { email?: unknown; password?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 }); }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || password.length < 8 || password.length > 128) {
    return NextResponse.json({ error: "Email atau password salah." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secret = process.env.INTERNAL_AUTH_SECRET;
  if (!supabaseUrl || !supabaseKey || !secret || secret.length < 32) {
    return NextResponse.json({ error: "Autentikasi internal belum dikonfigurasi." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const authClient = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await authClient.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    const active = attempts.get(ip)!;
    active.count += 1;
    return NextResponse.json({ error: "Email atau password salah." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  attempts.delete(ip);
  const superAdminEmail = (process.env.INTERNAL_SUPER_ADMIN_EMAIL || "ibadnarpatih@gmail.com").trim().toLowerCase();
  const role = email === superAdminEmail ? "super_admin" : ((data.user.app_metadata?.role || "viewer") as "admin" | "spv" | "jr_spv" | "coordinator" | "viewer");
  const token = await createSessionToken(email, role, secret);
  const response = NextResponse.json({ ok: true, role }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return response;
}
