import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { SESSION_COOKIE, verifySessionToken, SessionPayload } from "@/lib/auth-token";
import { DELIVERY_AREAS, deliveryArea } from "@/lib/courier-checks";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { fetchFromImageKit, isImageKitConfigured, uploadToImageKit } from "@/lib/imagekit";
import { linkedEmployee, scopedCouriers } from "@/lib/employee-access";

export const runtime = "nodejs";
const TABLE = "ops_courier_checks";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });
const canEdit = (session: SessionPayload, record: any) => session.role !== "viewer" || record.created_by === session.email.toLowerCase();
const photoUrl = (record: any, p: any, index: number) => p.public_token
  ? `/api/courier-checks?type=publicPhoto&id=${record.id}&index=${index}&token=${p.public_token}`
  : `/api/courier-checks?type=photo&id=${record.id}&index=${index}&v=${encodeURIComponent(record.updated_at)}`;
const decorate = (session: SessionPayload, record: any) => ({ ...record, can_edit: canEdit(session, record), photos: (record.photos || []).map((p: any, index: number) => ({ name: p.name, url: photoUrl(record, p, index) })) });
async function inspectorName(db: NonNullable<ReturnType<typeof getSupabaseServerClient>>, session: SessionPayload) {
  if (session.employee_nik) {
    const employee = await linkedEmployee(db, session.email);
    if (!employee?.active) throw new Error("Personel akun tidak aktif.");
    return employee.name;
  }
  const result = await db.from("ops_user_profiles").select("display_name").eq("email", session.email.toLowerCase()).maybeSingle();
  if (result.error) throw new Error("Profil pengguna belum dapat dimuat.");
  return String(result.data?.display_name || session.email.split("@")[0]).trim().slice(0,160);
}
function databaseError(error: any) {
  return error?.code === "42P01" || error?.code === "PGRST205" ? "Fitur belum tersedia. Migration Bawaan Kurir perlu diterapkan oleh administrator." : "Database belum dapat memproses catatan. Silakan coba lagi.";
}
export async function GET(req: NextRequest) {
  const publicPhoto = req.nextUrl.searchParams.get("type") === "publicPhoto";
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, process.env.INTERNAL_AUTH_SECRET);
  if (!session && !publicPhoto) return json({ error: "Sesi tidak valid." }, 401);
  const db = getSupabaseServerClient();
  if (!db) return json({ error: "Penyimpanan belum dikonfigurasi." }, 503);
  try {
    const type = req.nextUrl.searchParams.get("type");
    if (type === "couriers") { const items = await scopedCouriers(db, session!); return json({ couriers: items, units: DELIVERY_AREAS }); }
    if (type === "photo" || publicPhoto) {
      const id = req.nextUrl.searchParams.get("id") || "";
      const rawIndex = req.nextUrl.searchParams.get("index");
      const index = rawIndex === null ? -1 : Number(rawIndex);
      if (!uuid.test(id) || !Number.isInteger(index) || index < 0) return json({ error: "Foto tidak valid." }, 400);
      const token = req.nextUrl.searchParams.get("token") || "";
      if (publicPhoto && !/^[a-f0-9]{64}$/.test(token)) return json({ error: "Link foto tidak valid." }, 404);
      const result = await db.from(TABLE).select("created_by,photos").eq("id", id).maybeSingle();
      if (result.error) return json({ error: databaseError(result.error) }, 503);
      if (!result.data) return json({ error: "Foto tidak ditemukan." }, 404);
      const photo = result.data.photos?.[index];
      if (publicPhoto) {
        if (!photo?.public_token || !/^[a-f0-9]{64}$/.test(photo.public_token) || !timingSafeEqual(Buffer.from(token), Buffer.from(photo.public_token))) return json({ error: "Foto tidak ditemukan." }, 404);
      } else if (!session || !canEdit(session, result.data)) return json({ error: "Foto tidak ditemukan." }, 404);
      const path = photo?.path;
      if (!path) return json({ error: "Foto tidak ditemukan." }, 404);
      if (path.startsWith("imagekit:")) {
        const file = await fetchFromImageKit(path.slice(9));
        return new NextResponse(file.body, { headers: { "Content-Type": file.headers.get("content-type") || "image/jpeg", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
      }
      const file = await db.storage.from("ops-courier-photos").download(path);
      if (file.error || !file.data) return json({ error: "Foto belum dapat dimuat." }, 404);
      return new NextResponse(file.data, { headers: { "Content-Type": file.data.type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
    }
    let query = db.from(TABLE).select("*").order("created_at", { ascending: false });
    if (session!.role === "viewer") query = query.eq("created_by", session!.email.toLowerCase());
    const offset = Number(req.nextUrl.searchParams.get("offset") || 0);
    if (!Number.isInteger(offset) || offset < 0) return json({ error: "Halaman tidak valid." }, 400);
    const result = await query.range(offset, offset + 199);
    if (result.error) return json({ error: databaseError(result.error) }, 503);
    return json({ items: (result.data || []).map(row => decorate(session!, row)), has_more: result.data?.length === 200 });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Catatan belum dapat dimuat." }, 503); }
}
export async function POST(req: NextRequest) {
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, process.env.INTERNAL_AUTH_SECRET);
  if (!session) return json({ ok: false, error: "Sesi tidak valid." }, 401);
  const db = getSupabaseServerClient();
  if (!db) return json({ ok: false, error: "Penyimpanan belum dikonfigurasi." }, 503);
  try {
    const form = await req.formData();
    const get = (key: string) => String(form.get(key) || "").trim();
    const id = get("id"), editing = get("action") === "update";
    if (!uuid.test(id) || !["create", "update"].includes(get("action"))) return json({ ok: false, error: "Catatan tidak valid." }, 400);
    const existing = await db.from(TABLE).select("*").eq("id", id).maybeSingle();
    if (existing.error) return json({ ok: false, error: databaseError(existing.error) }, 503);
    if (existing.data && !canEdit(session, existing.data)) return json({ ok: false, error: "Anda tidak memiliki akses untuk mengubah catatan ini." }, 403);
    if (editing && !existing.data) return json({ ok: false, error: "Catatan tidak ditemukan." }, 404);
    // Stable client id makes retries after a lost response safe.
    if (!editing && existing.data) return json({ ok: true, item: decorate(session, existing.data) });
    const values = {
      inspection_date: get("inspection_date"), inspection_time: get("inspection_time"),
      delivery_area: deliveryArea(get("delivery_area")), inspector_name: existing.data?.inspector_name || await inspectorName(db, session),
      courier_id: get("courier_id"), courier_name: "", position: get("position"), employment: get("employment"),
      runsheet_count: Number(get("runsheet_count")), physical_count: Number(get("physical_count")),
      result: get("result"), documentation_url: existing.data?.documentation_url || "", inspection_location: get("inspection_location"),
      notes: get("notes"), updated_by: session.email.toLowerCase(),
    };
    const parsedDate = new Date(values.inspection_date + "T00:00:00Z");
    const required = [get("delivery_area"), values.inspector_name, values.inspection_location, values.employment, values.position];
    const counts = ["runsheet_count", "physical_count"];
    if (required.some(v => !v || v.length > 160) || !["SP LEGUTI","SPC LEGUTI","SP MALOKO"].includes(get("delivery_area").toUpperCase()) || values.notes.length > 10000 ||
        !["Sesuai", "Tidak Sesuai"].includes(values.result) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(values.inspection_date) || Number.isNaN(+parsedDate) ||
        parsedDate.toISOString().slice(0,10) !== values.inspection_date ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(values.inspection_time) ||
        counts.some(key => !/^\d+$/.test(get(key)) || Number(get(key)) > 1000000))
      return json({ ok: false, error: "Lengkapi semua kolom wajib, tanggal/jam valid, dan jumlah connote berupa bilangan bulat (0–1.000.000)." }, 400);
    // Preserve historical employee snapshot when editing an existing examination.
    const allowed = await scopedCouriers(db, session);
    const selected = allowed.find(row => row.nik === values.courier_id && deliveryArea(row.hub || "") === values.delivery_area);
    const historicalAdminEdit = editing && ["admin", "super_admin"].includes(session.role) && existing.data?.courier_id === values.courier_id && deliveryArea(existing.data.delivery_area) === values.delivery_area;
    if (!selected && !historicalAdminEdit) return json({ ok: false, error: "Personel tidak berada dalam area delivery atau struktur yang dapat Anda periksa." }, 403);
    if (existing.data && existing.data.courier_id === values.courier_id) {
      values.courier_name = existing.data.courier_name;
      if (existing.data.employment) values.employment = existing.data.employment;
    } else {
      const courier = selected;
      if (!courier) return json({ ok: false, error: "Pilih kurir aktif dari database karyawan." }, 400);
      values.courier_name = courier.name;
      if (courier.employment) values.employment = courier.employment;
    }
    const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
    const oldPhotos = existing.data?.photos || [];
    if (oldPhotos.length + files.length > 3 || files.reduce((sum, f) => sum + f.size, 0) > 3 * 1024 * 1024 || files.some(f => !["image/jpeg", "image/png", "image/webp"].includes(f.type))) return json({ ok: false, error: "Maksimal 3 foto JPG/PNG/WebP, total unggahan maksimal 3 MB." }, 400);
    const photos = [...oldPhotos];
    for (const file of files) {
      const path = `courier-checks/${id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
      if (isImageKitConfigured()) {
        const image = await uploadToImageKit(file, path);
        photos.push({ path: `imagekit:${image.path}`, name: file.name, public_token: randomBytes(32).toString("hex") });
      } else {
        const uploaded = await db.storage.from("ops-courier-photos").upload(path, file, { contentType: file.type });
        if (uploaded.error) throw new Error("Foto belum berhasil diunggah. Catatan belum disimpan.");
        photos.push({ path, name: file.name, public_token: randomBytes(32).toString("hex") });
      }
    }
    const publicIndex = photos.findIndex(p => !!p.public_token);
    if (publicIndex >= 0) values.documentation_url = new URL(photoUrl({ id }, photos[publicIndex], publicIndex), req.nextUrl.origin).href;
    const result = editing
      ? await db.from(TABLE).update({ ...values, photos }).eq("id", id).eq("updated_at", get("updated_at")).select().maybeSingle()
      : await db.from(TABLE).insert({ ...values, id, photos, created_by: session.email.toLowerCase() }).select().single();
    if (result.error) return json({ ok: false, error: databaseError(result.error) }, 503);
    if (!result.data) return json({ ok: false, error: "Catatan telah diperbarui pengguna lain. Buka ulang catatan sebelum menyimpan." }, 409);
    return json({ ok: true, item: decorate(session, result.data) });
  } catch (error) { return json({ ok: false, error: error instanceof Error ? error.message : "Gagal menyimpan catatan." }, 503); }
}
