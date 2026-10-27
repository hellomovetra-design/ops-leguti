import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken, SessionPayload } from "@/lib/auth-token";
import { getSupabaseServerClient } from "@/lib/supabase";
import { linkedEmployee } from "@/lib/employee-access";
import { SANCTION_ADMINS, SANCTION_KINDS, sanctionRecorder, sanctionTeam, sanctionValues, SanctionEmployee } from "@/lib/employee-sanctions";
import { employeeStatus } from "@/lib/employee-status";
export const runtime = "nodejs";
const TABLE = "ops_employee_sanctions";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
type DB = NonNullable<ReturnType<typeof getSupabaseServerClient>>;
async function access(db: DB, session: SessionPayload, admin: boolean) {
  if (admin) return SANCTION_ADMINS.includes(session.role);
  if (session.role === "super_admin") return true;
  return sanctionRecorder(await linkedEmployee(db, session.email));
}
async function employees(db: DB, session: SessionPayload, admin: boolean) {
  const rows: SanctionEmployee[] = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await db.from("ops_employees").select("nik,name,position,hub,superior,superior_nik,active,employment").order("nik").range(offset, offset + 999);
    if (result.error) throw Error("Data karyawan belum dapat dimuat.");
    rows.push(...(result.data || []));
    if ((result.data || []).length < 1000) break;
  }
  const unrestricted = admin || session.role === "super_admin";
  const owner = unrestricted ? null : await linkedEmployee(db, session.email);
  return (unrestricted ? rows.filter(row => employeeStatus(row) === "active") : sanctionTeam(rows, owner?.nik || "")).sort((a,b) => a.name.localeCompare(b.name));
}
const dbMessage = (error: { code?: string }) => ["42P01", "PGRST205"].includes(error.code || "") ? "Modul Sanksi belum siap. Administrator perlu menjalankan migration 20261027_employee_sanctions.sql." : "Catatan belum dapat diproses. Coba lagi.";
export async function GET(req: NextRequest) {
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, process.env.INTERNAL_AUTH_SECRET);
  if (!session) return json({ error: "Silakan login kembali." }, 401);
  const db = getSupabaseServerClient();
  if (!db) return json({ error: "Penyimpanan belum siap." }, 503);
  try {
    const p = req.nextUrl.searchParams, admin = p.get("scope") === "admin";
    if (!await access(db, session, admin)) return json({ error: admin ? "Akses pengelola diperlukan." : "Pencatatan PWA hanya untuk Superadmin atau karyawan aktif dengan jabatan leader, koordinator, SPV/JR SPV." }, 403);
    const type = p.get("type") || "list";
    if (type === "employees") return json({ items: await employees(db, session, admin), recorder_name: (await linkedEmployee(db, session.email))?.name || "" });
    if (type !== "list") return json({ error: "Permintaan tidak valid." }, 400);
    const offset = Number(p.get("offset") || 0), kind = p.get("kind") || "", search = (p.get("q") || "").trim();
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000 || search.length > 160 || (kind && !Object.hasOwn(SANCTION_KINDS, kind))) return json({ error: "Filter tidak valid." }, 400);
    let query = db.from(TABLE).select("*").order("created_at", { ascending: false }).order("id");
    // Leadership does not grant global visibility. PWA sees only its own records.
    if (!admin) query = query.eq("created_by", session.email.toLowerCase());
    if (kind) query = query.eq("kind", kind);
    if (search) query = query.ilike("employee_name", `%${search.replace(/[\\%_]/g, "\\$&")}%`);
    const result = await query.range(offset, offset + 50);
    if (result.error) return json({ error: dbMessage(result.error) }, 503);
    const rows = (result.data || []).slice(0,50);
    const names = new Map<string,string>();
    const emails = [...new Set(rows.map(row => String(row.created_by).toLowerCase()))];
    if (emails.length) {
      const links = await db.from("ops_user_employee_links").select("email,employee_nik").in("email", emails);
      if (links.error) throw Error("Nama pemberi belum dapat dimuat.");
      const niks = [...new Set((links.data || []).map(link => link.employee_nik))];
      if (niks.length) {
        const people = await db.from("ops_employees").select("nik,name").in("nik", niks);
        if (people.error) throw Error("Nama pemberi belum dapat dimuat.");
        const byNik = new Map((people.data || []).map(person => [person.nik, person.name]));
        for (const link of links.data || []) names.set(link.email.toLowerCase(), byNik.get(link.employee_nik) || "");
      }
    }
    return json({ items: rows.map(row => ({ ...row, recorder_name: names.get(String(row.created_by).toLowerCase()) || "", can_edit: admin })), has_more: (result.data || []).length > 50 });
  } catch { return json({ error: "Akses atau data belum dapat diperiksa. Coba lagi." }, 503); }
}
export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== req.nextUrl.origin) return json({ error: "Permintaan tidak valid." }, 403);
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, process.env.INTERNAL_AUTH_SECRET);
  if (!session) return json({ error: "Silakan login kembali." }, 401);
  const db = getSupabaseServerClient(session.email);
  if (!db) return json({ error: "Penyimpanan belum siap." }, 503);
  try {
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return json({ error: "Permintaan tidak valid." }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Permintaan tidak valid." }, 400);
    const admin = body.scope === "admin";
    if (!await access(db, session, admin)) return json({ error: "Anda tidak memiliki akses untuk tindakan ini." }, 403);
    const id = String(body.id || ""), action = String(body.action || "");
    if (!uuid.test(id) || !["create", "update"].includes(action)) return json({ error: "Catatan tidak valid." }, 400);
    if (action === "update" && !admin) return json({ error: "Koreksi catatan hanya dapat dilakukan admin atau SPV." }, 403);
    const email = session.email.toLowerCase();
    let existingQuery = db.from(TABLE).select("*").eq("id", id);
    if (!admin) existingQuery = existingQuery.eq("created_by", email);
    const existing = await existingQuery.maybeSingle();
    if (existing.error) return json({ error: dbMessage(existing.error) }, 503);
    if (action === "update" && !existing.data) return json({ error: "Catatan tidak ditemukan." }, 404);
    if (action === "create" && existing.data) return json({ ok: true, item: existing.data });
    let values;
    try { values = sanctionValues(body); } catch (e) { return json({ error: e instanceof Error ? e.message : "Isian tidak valid." }, 400); }
    if (action === "update") {
      const version = String(body.updated_at || "");
      if (!version || Number.isNaN(Date.parse(version))) return json({ error: "Versi catatan tidak valid." }, 400);
      const result = await db.from(TABLE).update({ ...values, updated_by: email }).eq("id", id).eq("updated_at", version).select().maybeSingle();
      if (result.error) return json({ error: dbMessage(result.error) }, 503);
      if (!result.data) return json({ error: "Catatan berubah. Muat ulang sebelum menyimpan." }, 409);
      return json({ ok: true, item: result.data });
    }
    const person = (await employees(db, session, admin)).find(row => row.nik === String(body.employee_nik || ""));
    if (!person) return json({ error: "Pilih karyawan aktif dalam tim yang dapat Anda kelola." }, 403);
    const result = await db.from(TABLE).insert({ ...values, id, employee_nik: person.nik, employee_name: person.name, position: person.position, superior_nik: person.superior_nik || null, superior_name: person.superior || "", hub: person.hub, created_by: email, updated_by: email }).select().single();
    if (result.error) {
      if (result.error.code === "23505") {
        const retry = await db.from(TABLE).select("*").eq("id", id).eq("created_by", email).maybeSingle();
        if (!retry.error && retry.data) return json({ ok: true, item: retry.data });
        return json({ error: "ID catatan tidak tersedia. Buka form baru." }, 409);
      }
      return json({ error: dbMessage(result.error) }, 503);
    }
    return json({ ok: true, item: result.data });
  } catch { return json({ error: "Penyimpanan belum terkonfirmasi. Coba kembali dengan form yang sama." }, 503); }
}
