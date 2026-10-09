import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, decodeBase64Url, encodeBase64Url, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth-token";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabase";
import { loginDestination } from "@/lib/access-policy";

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
  let body: { email?: unknown; identifier?: unknown; password?: unknown; next?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
  const input = body.identifier ?? body.email;
  const identifier = typeof input === "string" ? input.trim() : "";
  const attemptKey = JSON.stringify([ip, identifier.toLowerCase().slice(0, 254)]);
  const now = Date.now();
  for (const [key, value] of attempts) if (value.resetAt <= now) attempts.delete(key);
  const record = attempts.get(attemptKey);
  if (record && record.resetAt > now && record.count >= MAX_ATTEMPTS) {
    const retrySeconds = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
    const retryMinutes = Math.ceil(retrySeconds / 60);
    return NextResponse.json(
      { error: `Terlalu banyak percobaan. Coba lagi dalam ${retryMinutes} menit.` },
      { status: 429, headers: { "Retry-After": String(retrySeconds), "Cache-Control": "no-store" } },
    );
  }
  if (!record || record.resetAt <= now) attempts.set(attemptKey, { count: 0, resetAt: now + WINDOW_MS });
  let email = identifier.toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  const failed = () => {
    const current = attempts.get(attemptKey);
    attempts.set(attemptKey, { count: (current?.count || 0) + 1, resetAt: current?.resetAt || Date.now() + WINDOW_MS });
    return NextResponse.json({ error: "NIK/email atau password salah." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  };
  if (!identifier || identifier.length > 254 || password.length < 8 || password.length > 128) return failed();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const secret = process.env.INTERNAL_AUTH_SECRET;
  if (!supabaseUrl || !supabaseKey || !secret || secret.length < 32) {
    return NextResponse.json({ error: "Autentikasi internal belum dikonfigurasi." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  let employeeNik: string | undefined;
  if (!identifier.includes("@")) {
    const db = getSupabaseServerClient();
    if (!db) return NextResponse.json({ error: "Login NIK belum dikonfigurasi." }, { status: 503 });
    const link = await db.from("ops_user_employee_links").select("email,employee_nik").eq("employee_nik", identifier).maybeSingle();
    if (link.error) return NextResponse.json({ error: "Login NIK belum tersedia. Hubungi Super Admin untuk menerapkan migration." }, { status: 503 });
    if (!link.data) return failed();
    const employee = await db.from("ops_employees").select("nik,active").eq("nik", link.data.employee_nik).maybeSingle();
    if (employee.error) return NextResponse.json({ error: "Data karyawan belum dapat dimuat." }, { status: 503 });
    if (!employee.data?.active) return failed();
    email = link.data.email;
    employeeNik = employee.data.nik;
  }
  const authClient = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await authClient.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    if (error && (error.status === 429 || (error.status || 0) >= 500)) return NextResponse.json({ error: "Layanan login sedang sibuk. Silakan coba beberapa saat lagi." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    return failed();
  }

  const superAdminEmail = (process.env.INTERNAL_SUPER_ADMIN_EMAIL || "ibadnarpatih@gmail.com").trim().toLowerCase();
  const role = email === superAdminEmail ? "super_admin" : ((data.user.app_metadata?.role || "viewer") as "admin" | "spv" | "jr_spv" | "coordinator" | "viewer");
  // Email and NIK resolve to the same employee identity and structural permissions.
  // Resolve email links only after authenticating to avoid exposing account details.
  if (role !== "super_admin" && !employeeNik) {
    const db = getSupabaseServerClient();
    if (!db) return NextResponse.json({ error: "Data akun belum dapat dimuat." }, { status: 503 });
    const link = await db.from("ops_user_employee_links").select("employee_nik").eq("email", email).maybeSingle();
    if (link.error) return NextResponse.json({ error: "Data akun belum dapat dimuat." }, { status: 503 });
    if (!link.data) return NextResponse.json({ error: "Akun belum dikaitkan dengan data karyawan. Hubungi administrator." }, { status: 403 });
    const employee = await db.from("ops_employees").select("nik,active").eq("nik", link.data.employee_nik).maybeSingle();
    if (employee.error) return NextResponse.json({ error: "Data karyawan belum dapat dimuat." }, { status: 503 });
    if (!employee.data?.active) return failed();
    employeeNik = employee.data.nik;
  }
  if ((email === superAdminEmail && employeeNik) || (role !== "super_admin" && !employeeNik)) return failed();
  if (!["super_admin", "admin", "spv", "jr_spv", "coordinator", "viewer"].includes(role)) return failed();
  attempts.delete(attemptKey);
  const token = await createSessionToken(email, role, secret, employeeNik);
  const response = NextResponse.json({ ok: true, role, redirect: loginDestination(role, body.next) }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return response;
}
