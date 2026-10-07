import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { SESSION_COOKIE, verifySessionToken, SessionPayload } from "@/lib/auth-token";
import { DAILY_ADMIN_ROLES, DAILY_CATEGORIES, DAILY_STATUSES } from "@/lib/problem-solving-daily";
import { fetchFromImageKit, isImageKitConfigured, uploadToImageKit } from "@/lib/imagekit";
import { scopeHistory } from "@/lib/history-scope";

export const runtime = "nodejs";
const TABLE = "ops_problem_solving_daily";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });
const canEdit = (session: SessionPayload, record: any) => session.role !== "viewer" || record.created_by === session.email.toLowerCase();
const decorate = (session: SessionPayload, record: any) => ({ ...record, can_edit: canEdit(session, record), photos: (record.photos || []).map((p: any, index: number) => ({ name: p.name, url: `/api/problem-solving-daily?type=photo&id=${record.id}&index=${index}&v=${encodeURIComponent(record.updated_at)}` })) });
function databaseError(error: any) {
  return error?.code === "42P01" || error?.code === "PGRST205" ? "Fitur belum tersedia. Migration Problem Solving Daily perlu diterapkan oleh administrator." : "Database belum dapat memproses catatan. Silakan coba lagi.";
}
async function units(db: NonNullable<ReturnType<typeof getSupabaseServerClient>>) {
  const { data, error } = await db.from("ops_employees").select("hub");
  if (error) throw new Error("Data lokasi/unit belum dapat dimuat.");
  return [...new Set((data || []).map(row => String(row.hub || "").trim().toUpperCase()).filter(Boolean))].sort();
}
export async function GET(req: NextRequest) {
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, process.env.INTERNAL_AUTH_SECRET);
  if (!session) return json({ error: "Sesi tidak valid." }, 401);
  const db = getSupabaseServerClient();
  if (!db) return json({ error: "Penyimpanan belum dikonfigurasi." }, 503);
  try {
    const type = req.nextUrl.searchParams.get("type");
    const adminScope = req.nextUrl.searchParams.get("scope") === "admin";
    if (adminScope && !DAILY_ADMIN_ROLES.includes(session.role)) return json({ error: "Halaman ini khusus administrator." }, 403);
    if (type === "units") return json({ units: await units(db) });
    if (type === "photo") {
      const id = req.nextUrl.searchParams.get("id") || "";
      const index = Number(req.nextUrl.searchParams.get("index"));
      if (!uuid.test(id) || !Number.isInteger(index) || index < 0) return json({ error: "Foto tidak valid." }, 400);
      const result = await db.from(TABLE).select("created_by,photos").eq("id", id).maybeSingle();
      if (result.error) return json({ error: databaseError(result.error) }, 503);
      if (!result.data || !canEdit(session, result.data)) return json({ error: "Foto tidak ditemukan." }, 404);
      const path = result.data.photos?.[index]?.path;
      if (!path) return json({ error: "Foto tidak ditemukan." }, 404);
      if (path.startsWith("imagekit:")) {
        const file = await fetchFromImageKit(path.slice(9));
        return new NextResponse(file.body, { headers: { "Content-Type": file.headers.get("content-type") || "image/jpeg", "Cache-Control": "private, max-age=300" } });
      }
      const file = await db.storage.from("ops-daily-photos").download(path);
      if (file.error || !file.data) return json({ error: "Foto belum dapat dimuat." }, 404);
      return new NextResponse(file.data, { headers: { "Content-Type": file.data.type, "Cache-Control": "private, max-age=300" } });
    }
    let query = db.from(TABLE).select("*", { count: "exact" }).order("created_at", { ascending: false }).order("id", { ascending: false });
    query = scopeHistory(query, session, req.nextUrl.searchParams);
    let offset = 0;
    if (adminScope) {
      const params = req.nextUrl.searchParams;
      offset = Number(params.get("offset") || 0);
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) return json({ error: "Halaman tidak valid." }, 400);
      const status = params.get("status"), category = params.get("category"), unit = params.get("unit");
      const from = params.get("from"), to = params.get("to");
      if ((status && !Object.hasOwn(DAILY_STATUSES, status)) || (category && !DAILY_CATEGORIES.includes(category as any)) ||
        [from, to].some(value => value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value)) || (from && to && from > to)) return json({ error: "Filter tidak valid." }, 400);
      if (status) query = query.eq("status", status);
      if (category) query = query.eq("category", category);
      if (unit) query = query.eq("unit", unit);
      if (from) query = query.gte("incident_date", from);
      if (to) query = query.lte("incident_date", to);
      const search = (params.get("q") || "").trim();
      if (search.length > 160) return json({ error: "Pencarian terlalu panjang." }, 400);
      if (search) query = query.ilike("title", `%${search.replace(/[\\%_]/g, "\\$&")}%`);
    }
    const result = adminScope ? await query.range(offset, offset + 24) : await query.limit(200);
    if (result.error) return json({ error: databaseError(result.error) }, 503);
    return json({ items: (result.data || []).map(row => decorate(session, row)), total: result.count || 0 });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Catatan belum dapat dimuat." }, 503); }
}
export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== req.nextUrl.origin) return json({ ok: false, error: "Permintaan tidak valid." }, 403);
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, process.env.INTERNAL_AUTH_SECRET);
  if (!session) return json({ ok: false, error: "Sesi tidak valid." }, 401);
  const db = getSupabaseServerClient();
  if (!db) return json({ ok: false, error: "Penyimpanan belum dikonfigurasi." }, 503);
  try {
    const form = await req.formData();
    const get = (key: string) => String(form.get(key) || "").trim();
    const id = get("id"), reviewing = get("action") === "review", editing = get("action") === "update";
    if (reviewing) {
      if (!DAILY_ADMIN_ROLES.includes(session.role)) return json({ ok: false, error: "Tindakan ini khusus administrator." }, 403);
      const status = get("status"), solution = get("solution"), version = get("updated_at");
      if (!uuid.test(id) || !Object.hasOwn(DAILY_STATUSES, status) || solution.length > 10000 || !version || Number.isNaN(Date.parse(version))) return json({ ok: false, error: "Status, solusi, atau versi catatan tidak valid." }, 400);
      const result = await db.from(TABLE).update({ status, solution, updated_by: session.email.toLowerCase() }).eq("id", id).eq("updated_at", version).select().maybeSingle();
      if (result.error) return json({ ok: false, error: databaseError(result.error) }, 503);
      if (!result.data) return json({ ok: false, error: "Catatan berubah atau tidak tersedia. Muat ulang dan buka kembali catatan." }, 409);
      return json({ ok: true, item: decorate(session, result.data) });
    }
    if (!uuid.test(id) || !["create", "update"].includes(get("action"))) return json({ ok: false, error: "Catatan tidak valid." }, 400);
    const existing = await db.from(TABLE).select("*").eq("id", id).maybeSingle();
    if (existing.error) return json({ ok: false, error: databaseError(existing.error) }, 503);
    if (existing.data && !canEdit(session, existing.data)) return json({ ok: false, error: "Anda tidak memiliki akses untuk mengubah catatan ini." }, 403);
    if (editing && !existing.data) return json({ ok: false, error: "Catatan tidak ditemukan." }, 404);
    // Stable client id makes retries after a lost response safe.
    if (!editing && existing.data) return json({ ok: true, item: decorate(session, existing.data) });
    const values = { title: get("title"), category: get("category"), incident_date: get("incident_date"), incident_time: get("incident_time"), unit: get("unit").toUpperCase(), description: get("description"), solution: get("solution"), status: get("status"), updated_by: session.email.toLowerCase() };
    const parsedDate = new Date(`${values.incident_date}T00:00:00Z`);
    if (!values.title || values.title.length > 160 || !values.description || values.description.length > 10000 || values.solution.length > 10000 || !DAILY_CATEGORIES.includes(values.category as any) || !Object.hasOwn(DAILY_STATUSES, values.status) || !/^\d{4}-\d{2}-\d{2}$/.test(values.incident_date) || Number.isNaN(+parsedDate) || parsedDate.toISOString().slice(0, 10) !== values.incident_date || !/^([01]\d|2[0-3]):[0-5]\d$/.test(values.incident_time)) return json({ ok: false, error: "Lengkapi judul, uraian, kategori, status, tanggal, dan jam yang valid." }, 400);
    if (!(await units(db)).includes(values.unit)) return json({ ok: false, error: "Pilih lokasi/unit dari data yang tersedia." }, 400);
    const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
    const oldPhotos = existing.data?.photos || [];
    if (oldPhotos.length + files.length > 3 || files.reduce((sum, f) => sum + f.size, 0) > 3 * 1024 * 1024 || files.some(f => !["image/jpeg", "image/png", "image/webp"].includes(f.type))) return json({ ok: false, error: "Maksimal 3 foto JPG/PNG/WebP, total unggahan maksimal 3 MB." }, 400);
    const photos = [...oldPhotos];
    for (const file of files) {
      const path = `daily/${id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
      if (isImageKitConfigured()) {
        const image = await uploadToImageKit(file, path);
        photos.push({ path: `imagekit:${image.path}`, name: file.name });
      } else {
        const uploaded = await db.storage.from("ops-daily-photos").upload(path, file, { contentType: file.type });
        if (uploaded.error) throw new Error("Foto belum berhasil diunggah. Catatan belum disimpan.");
        photos.push({ path, name: file.name });
      }
    }
    const result = editing
      ? await db.from(TABLE).update({ ...values, photos }).eq("id", id).eq("updated_at", get("updated_at")).select().maybeSingle()
      : await db.from(TABLE).insert({ ...values, id, photos, created_by: session.email.toLowerCase() }).select().single();
    if (result.error) return json({ ok: false, error: databaseError(result.error) }, 503);
    if (!result.data) return json({ ok: false, error: "Catatan telah diperbarui pengguna lain. Buka ulang catatan sebelum menyimpan." }, 409);
    return json({ ok: true, item: decorate(session, result.data) });
  } catch (error) { return json({ ok: false, error: error instanceof Error ? error.message : "Gagal menyimpan catatan." }, 503); }
}
