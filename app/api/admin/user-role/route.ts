import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth-token";
import { getSupabaseServerClient } from "@/lib/supabase";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function POST(req: NextRequest) {
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, process.env.INTERNAL_AUTH_SECRET);
  if (!session) return json({ error: "Silakan login kembali." }, 401);
  if (!["super_admin", "admin", "spv"].includes(session.role)) return json({ error: "Hanya Super Admin, Admin Pengelola, atau SPV yang dapat mengubah role." }, 403);
  if (req.headers.get("origin") !== req.nextUrl.origin) return json({ error: "Permintaan tidak valid." }, 403);
  const db = getSupabaseServerClient();
  if (!db) return json({ error: "Penyimpanan belum siap." }, 503);
  let body;
  try { body = await req.json(); } catch { return json({ error: "Permintaan tidak valid." }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Permintaan tidak valid." }, 400);
  const email = String(body.email || "").trim().toLowerCase(), role = String(body.role || ""), previousRole = String(body.previousRole || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !["super_admin", "admin", "spv", "viewer"].includes(role)) return json({ error: "Akun atau role tidak valid." }, 400);
  const primary = (process.env.INTERNAL_SUPER_ADMIN_EMAIL || "ibadnarpatih@gmail.com").trim().toLowerCase();
  if ((email === primary || (email === session.email.toLowerCase() && session.role === "super_admin")) && role !== "super_admin") return json({ error: "Role Super Admin utama dan akun Anda sendiri tidak dapat diturunkan." }, 400);
  try {
    let user;
    for (let page = 1; ; page++) {
      const result = await db.auth.admin.listUsers({ page, perPage: 200 });
      if (result.error) return json({ error: "Daftar akun belum dapat dimuat." }, 503);
      user = result.data.users.find(item => item.email?.toLowerCase() === email);
      if (user || result.data.users.length < 200) break;
    }
    if (!user) return json({ error: "Akun tidak ditemukan. Muat ulang daftar pengguna." }, 404);
    const oldRole = email === primary ? "super_admin" : user.app_metadata?.role || "viewer";
    if (previousRole !== oldRole) return json({ error: "Role sudah berubah. Muat ulang daftar sebelum mengedit." }, 409);
    const previous = await db.from("ops_users").select("leader_name").eq("email", email).maybeSingle();
    if (previous.error) return json({ error: "Data akses belum dapat dimuat." }, 503);
    const updated = await db.auth.admin.updateUserById(user.id, { app_metadata: { ...user.app_metadata, role } });
    if (updated.error) return json({ error: "Role belum berhasil diperbarui." }, 503);
    const saved = await db.from("ops_users").upsert({ email, role, leader_name: previous.data?.leader_name || null }, { onConflict: "email" });
    if (saved.error) {
      const rollback = await db.auth.admin.updateUserById(user.id, { app_metadata: { ...user.app_metadata, role: oldRole } });
      return json({ error: rollback.error ? "Sinkronisasi role bermasalah. Muat ulang dan periksa akses akun sebelum melanjutkan." : "Perubahan role dibatalkan karena data akses belum dapat disimpan." }, 503);
    }
    return json({ ok: true, email, role });
  } catch { return json({ error: "Perubahan belum terkonfirmasi. Muat ulang daftar pengguna sebelum mencoba lagi." }, 503); }
}
