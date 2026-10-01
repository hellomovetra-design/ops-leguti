import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth-token";
import { getSupabaseServerClient } from "@/lib/supabase";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
async function context(req: NextRequest) {
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, process.env.INTERNAL_AUTH_SECRET);
  return session?.role === "super_admin" ? getSupabaseServerClient() : null;
}
export async function GET(req: NextRequest) {
  const db = await context(req);
  if (!db) return json({ error: "Hanya Super Admin yang dapat mengelola pengaitan NIK." }, 403);
  const [employees, links] = await Promise.all([
    db.from("ops_employees").select("nik,name,position,hub").eq("active", true).order("name").limit(1000),
    db.from("ops_user_employee_links").select("email,employee_nik"),
  ]);
  if (employees.error || links.error) return json({ error: "Pengaitan NIK belum dapat dimuat. Pastikan migration login NIK telah diterapkan." }, 503);
  return json({ employees: employees.data, links: links.data });
}
export async function POST(req: NextRequest) {
  const db = await context(req);
  if (!db) return json({ error: "Hanya Super Admin yang dapat mengelola pengaitan NIK." }, 403);
  let body;
  try { body = await req.json(); } catch { return json({ error: "Permintaan tidak valid." }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Permintaan tidak valid." }, 400);
  const email = String(body.email || "").trim().toLowerCase(), nik = String(body.nik || "").trim();
  const employee = await db.from("ops_employees").select("nik,name").eq("nik", nik).eq("active", true).maybeSingle();
  if (employee.error || !employee.data) return json({ error: "Pilih NIK karyawan aktif dari database." }, 400);
  // Supabase Auth is authoritative for account existence and application privileges.
  let user;
  for (let page = 1; ; page++) {
    const auth = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (auth.error) return json({ error: "Daftar akun belum dapat dimuat." }, 503);
    user = auth.data.users.find(item => item.email?.toLowerCase() === email);
    if (user || auth.data.users.length < 200) break;
  }
  const primary = (process.env.INTERNAL_SUPER_ADMIN_EMAIL || "ibadnarpatih@gmail.com").trim().toLowerCase();
  if (!user || email === primary || user.app_metadata?.role === "super_admin") return json({ error: "Pilih akun biasa. Super Admin tetap login dengan email." }, 400);
  const saved = await db.from("ops_user_employee_links").upsert({ email, employee_nik: nik, updated_at: new Date().toISOString() }, { onConflict: "email" }).select("email,employee_nik,updated_at").single();
  if (saved.error) return json({ error: saved.error.code === "23505" ? "NIK sudah digunakan akun lain." : "Pengaitan gagal. Pastikan migration telah diterapkan." }, 409);
  if (!saved.data || saved.data.email !== email || saved.data.employee_nik !== nik) return json({ error: "Pengaitan belum terkonfirmasi. Muat ulang daftar sebelum mencoba lagi." }, 503);
  return json({ ok: true, link: saved.data });
}
