import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { fetchFromImageKit, isImageKitConfigured, uploadToImageKit, deleteFromImageKit } from "@/lib/imagekit";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth-token";
import { BARKUR_MAX_PHOTOS, BARKUR_MAX_UPLOAD_BYTES, BARKUR_ROLES, BARKUR_STATUSES, barkurUuid, barkurTime, driveEvidence, barkurFilters, applyBarkurFilters, barkurCsv, BarkurRecord } from "@/lib/barkur";
export const runtime = "nodejs";
const TABLE = "ops_barkur", BUCKET = "ops-barkur-evidence";
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const databaseError = (error: { code?: string; message?: string }) => ["42P01", "PGRST205"].includes(error.code || "") ? "Modul BARKUR belum siap. Terapkan migration 20261008_barkur.sql terlebih dahulu." : "Penyimpanan BARKUR belum dapat diakses. Silakan coba lagi.";
const decorate = (row: any) => ({ ...row, evidence: (row.evidence || []).map((item: any, index: number) => ({ name: item.name, url: `/api/barkur?type=evidence&id=${row.id}&index=${index}` })) });
async function context(req: NextRequest) {
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, process.env.INTERNAL_AUTH_SECRET);
  if (!session) return { error: json({ error: "Silakan login kembali." }, 401) };
  if (!BARKUR_ROLES.includes(session.role)) return { error: json({ error: "Akses dashboard diperlukan." }, 403) };
  const db = getSupabaseServerClient();
  if (!db) return { error: json({ error: "Penyimpanan belum dikonfigurasi." }, 503) };
  return { session, db };
}
export async function GET(req: NextRequest) {
  const ctx = await context(req); if (ctx.error) return ctx.error;
  const db = ctx.db!, params = req.nextUrl.searchParams;
  try {
    if (params.get("type") === "evidence") {
      const id = params.get("id") || "", index = Number(params.get("index"));
      if (!barkurUuid.test(id) || params.get("index") === null || !Number.isInteger(index) || index < 0 || index >= BARKUR_MAX_PHOTOS) return json({ error: "Bukti tidak valid." }, 400);
      const record = await db.from(TABLE).select("evidence").eq("id", id).maybeSingle();
      if (record.error) return json({ error: databaseError(record.error) }, 503);
      const item = record.data?.evidence?.[index];
      if (!item) return json({ error: "Bukti tidak ditemukan." }, 404);
      if (item.path.startsWith("imagekit:")) {
        const file = await fetchFromImageKit(item.path.slice(9));
        return new NextResponse(file.body, { headers: { "Content-Type": file.headers.get("content-type") || "image/png", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
      }
      const file = await db.storage.from(BUCKET).download(item.path);
      if (file.error || !file.data) return json({ error: "Bukti belum dapat dibuka." }, 404);
      return new NextResponse(file.data, { headers: { "Content-Type": file.data.type || "image/png", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
    }
    const filters = barkurFilters(params);
    if (params.get("type") === "export") {
      const rows: BarkurRecord[] = [];
      for (let offset = 0; ; offset += 1000) {
        const result = await applyBarkurFilters(db.from(TABLE).select("*"), filters).order("incident_at", { ascending: false }).order("id").range(offset, offset+999);
        if (result.error) return json({ error: databaseError(result.error) }, 503);
        rows.push(...(result.data || [])); if ((result.data || []).length < 1000) break;
      }
      // Request host is used only for exported same-origin evidence links.
      return new NextResponse(barkurCsv(rows, req.nextUrl.origin), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="rekap-barkur.csv"', "Cache-Control": "private, no-store" } });
    }
    const offset = Number(params.get("offset") || 0);
    if (!Number.isSafeInteger(offset) || offset < 0) return json({ error: "Halaman tidak valid." }, 400);
    const result = await applyBarkurFilters(db.from(TABLE).select("*", { count: "exact" }), filters).order("incident_at", { ascending: false }).order("id").range(offset, offset+24);
    if (result.error) return json({ error: databaseError(result.error) }, 503);
    return json({ items: (result.data || []).map(decorate), total: result.count || 0 });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Data belum dapat dimuat." }, 400); }
}
export async function POST(req: NextRequest) {
  const ctx = await context(req); if (ctx.error) return ctx.error;
  const db = ctx.db!, session = ctx.session!;
  const uploaded: string[] = [];
  const imagekitIds: string[] = [];
  let committed = false;
  try {
    const form = await req.formData(), get = (key: string) => String(form.get(key) || "").trim();
    const id = get("id"), action = get("action");
    if (!barkurUuid.test(id) || !["create", "update"].includes(action)) return json({ error: "Catatan tidak valid." }, 400);
    const existing = await db.from(TABLE).select("*").eq("id", id).maybeSingle();
    if (existing.error) return json({ error: databaseError(existing.error) }, 503);
    if (action === "create" && existing.data) return existing.data.created_by === session.email.toLowerCase() ? json({ ok: true, item: decorate(existing.data) }) : json({ error: "ID catatan sudah digunakan." }, 409);
    if (action === "update" && !existing.data) return json({ error: "Catatan tidak ditemukan." }, 404);
    if (existing.data && get("updated_at") !== existing.data.updated_at) return json({ error: "Catatan telah diperbarui pengguna lain. Tutup dan muat ulang sebelum mengedit." }, 409);
    const values = { awb: get("awb").toUpperCase(), bag_number: get("bag_number").toUpperCase(), origin: get("origin"), destination: get("destination"), pic: get("pic"), description: get("description"), status: get("status"), resolution: get("resolution"), incident_at: barkurTime(get("incident_at"), true)!, email_sent_at: barkurTime(get("email_sent_at")), evidence_link: driveEvidence(get("evidence_link")), updated_by: session.email.toLowerCase() };
    if (!values.awb || values.awb.length > 80 || !values.bag_number || values.bag_number.length > 100 || [values.origin, values.destination, values.pic].some(v => !v || v.length > 160) || values.description.length > 10000 || values.resolution.length > 10000 || values.evidence_link.length > 2048 || !Object.hasOwn(BARKUR_STATUSES, values.status)) return json({ error: "Lengkapi AWB, nomor bag, origin, unit penerima, PIC, dan status yang valid." }, 400);
    if (values.email_sent_at && values.email_sent_at < values.incident_at) return json({ error: "Waktu email tidak boleh sebelum kejadian." }, 400);
    if (values.status === "completed" && !values.resolution) return json({ error: "Isi hasil penelusuran sebelum menyelesaikan catatan." }, 400);
    const files = form.getAll("evidence").filter((file): file is File => file instanceof File && file.size > 0);
    const evidence = [...(existing.data?.evidence || [])];
    if (files.length + evidence.length > BARKUR_MAX_PHOTOS || files.reduce((n,f) => n+f.size, 0) > BARKUR_MAX_UPLOAD_BYTES || files.some(f => !["image/png", "image/jpeg", "image/webp"].includes(f.type))) return json({ error: "Maksimal 4 foto bukti JPG/PNG/WebP, total unggahan maksimal 3 MB." }, 400);
    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const valid = file.type === "image/png" ? [137,80,78,71,13,10,26,10].every((v,i) => bytes[i]===v) : file.type === "image/jpeg" ? bytes[0]===255 && bytes[1]===216 && bytes[2]===255 : String.fromCharCode(...bytes.slice(0,4)) === "RIFF" && String.fromCharCode(...bytes.slice(8,12)) === "WEBP";
      if (!valid) throw new Error("Isi berkas tidak sesuai format gambar.");
      const path = `${id}/${crypto.randomUUID()}.${file.type === "image/png" ? "png" : file.type === "image/jpeg" ? "jpg" : "webp"}`;
      if (isImageKitConfigured()) {
        const image = await uploadToImageKit(file, `barkur/${path}`);
        imagekitIds.push(image.fileId);
        evidence.push({ path: `imagekit:${image.path}`, name: file.name.slice(0,200) });
        continue;
      }
      const result = await db.storage.from(BUCKET).upload(path, file, { contentType: file.type });
      if (result.error) throw new Error("Upload bukti gagal. Pastikan bucket migration tersedia, lalu coba lagi.");
      uploaded.push(path); evidence.push({ path, name: file.name.slice(0,200) });
    }
    const result = existing.data
      ? await db.from(TABLE).update({ ...values, evidence }).eq("id", id).eq("updated_at", get("updated_at")).select().maybeSingle()
      : await db.from(TABLE).insert({ ...values, id, evidence, created_by: session.email.toLowerCase() }).select().single();
    if (result.error) return json({ error: databaseError(result.error) }, 503);
    if (!result.data) return json({ error: "Data berubah saat disimpan. Muat ulang dan coba lagi." }, 409);
    committed = true;
    return json({ ok: true, item: decorate(result.data) });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Data belum berhasil disimpan." }, 400); }
  finally {
    if (!committed && uploaded.length) await db.storage.from(BUCKET).remove(uploaded).catch(() => {});
    if (!committed) await Promise.all(imagekitIds.map(id => deleteFromImageKit(id).catch(() => {})));
  }
}
