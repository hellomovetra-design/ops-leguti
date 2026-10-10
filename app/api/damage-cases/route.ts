import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth-token";
import { DAMAGE_ADMINS, DAMAGE_STATUSES, DAMAGE_UUID, damagePlateKey, damageCsv, damageImageValid, damageValues } from "@/lib/damage-case";
import { fetchFromImageKit, isImageKitConfigured, uploadToImageKit, deleteFromImageKit } from "@/lib/imagekit";
export const runtime = "nodejs";
import {exportEvidenceLinks} from '@/lib/evidence-export';
import {evidenceReportWorkbook} from '@/lib/evidence-report-workbook';
const TABLE = "ops_damage_cases", BUCKET = "ops-damage-photos";
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const failure = (error: { code?: string }) => ["42P01", "PGRST205"].includes(error.code || "") ? "Fitur Damage Case belum siap. Terapkan migration 20261008_damage_cases.sql." : "Data belum dapat diproses. Silakan coba lagi.";
const decorate = (row: any) => ({ ...row, evidence_url: `/pwa/damage-evidence/${row.id}`, photos: row.photos.map((p: any, index: number) => ({ name: p.name, slot: p.slot ?? index, url: `/api/damage-cases?type=photo&id=${row.id}&index=${index}` })) });
async function context(req: NextRequest) {
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, process.env.INTERNAL_AUTH_SECRET);
  if (!session) return { error: json({ error: "Silakan login kembali." }, 401) };
  const db = getSupabaseServerClient();
  if (!db) return { error: json({ error: "Penyimpanan belum siap." }, 503) };
  return { session, db, admin: DAMAGE_ADMINS.includes(session.role) };
}
export async function GET(req: NextRequest) {
  const ctx = await context(req); if (ctx.error) return ctx.error;
  const { db, session, admin } = ctx; const p = req.nextUrl.searchParams;
  try {
    const id = p.get("id"), type = p.get("type");
    if (type === "warehouses") {
      const result = await db!.from("ops_damage_warehouse_master").select("name").eq("active", true).order("name").range(0,999);
      if (result.error) return json({error:"Daftar warehouse belum siap. Terapkan migration 20261010_damage_warehouse_master.sql."},503);
      return json({items:result.data || []});
    }
    if (type === "vehicles") {
      const result = await db!.from("ops_damage_vehicle_master").select("plate,vehicle_code,vehicle_type").eq("active", true).order("plate").range(0,999);
      if (result.error) return json({error:"Daftar Nopol belum siap. Terapkan migration 20261009_damage_vehicle_master.sql."},503);
      return json({items:result.data || []});
    }
    if (type === "export" && !admin) return json({ error: "Unduh report khusus administrator." }, 403);
    if (id || type === "photo") {
      if (!id || !DAMAGE_UUID.test(id)) return json({ error: "Catatan tidak valid." }, 400);
      let query = db!.from(TABLE).select("*").eq("id", id);
      if (!admin) query = query.eq("created_by", session!.email.toLowerCase());
      const row = await query.maybeSingle();
      if (row.error) return json({ error: failure(row.error) }, 503);
      if (!row.data) return json({ error: "Catatan tidak ditemukan." }, 404);
      if (type !== "photo") return json({ item: decorate(row.data) });
      const index = Number(p.get("index"));
      if (p.get("index") === null || !Number.isInteger(index) || index < 0 || index > 3) return json({ error: "Foto tidak valid." }, 400);
      const path = row.data.photos[index]?.path;
      if (!path) return json({ error: "Foto tidak ditemukan." }, 404);
      if (path.startsWith("imagekit:")) {
        const file = await fetchFromImageKit(path.slice(9));
        return new NextResponse(file.body, { headers: { "Content-Type": file.headers.get("content-type") || "image/jpeg", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
      }
      const file = await db!.storage.from(BUCKET).download(path);
      if (file.error || !file.data) return json({ error: "Foto belum dapat dibuka." }, 404);
      return new NextResponse(file.data, { headers: { "Content-Type": file.data.type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
    }
    const scope = p.get("scope");
    if (scope === "admin" && !admin) return json({ error: "Akses administrator diperlukan." }, 403);
    const offset = Number(p.get("offset") || 0), q = (p.get("q") || "").trim(), status = p.get("status");
    const from = p.get("from") || "", to = p.get("to") || "";
    if ([from,to].some(day => day && (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day)) || new Date(day).toISOString().slice(0,10) !== day)) || (from && to && from > to)) return json({ error: "Rentang tanggal tidak valid." }, 400);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000 || q.length > 80 || (status && !Object.hasOwn(DAMAGE_STATUSES, status))) return json({ error: "Filter tidak valid." }, 400);
    const filtered = () => {
      let query = db!.from(TABLE).select("*", { count: "exact" });
      if (scope !== "admin" && type !== "export") query = query.eq("created_by", session!.email.toLowerCase());
      if (q) query = query.ilike("awb", `%${q.replace(/[\\%_]/g, "\\$&")}%`);
      if (status) query = query.eq("status", status);
      if (from) query = query.gte("created_at", `${from}T00:00:00+07:00`);
      if (to) query = query.lte("created_at", `${to}T23:59:59.999999+07:00`);
      return query.order("created_at", { ascending: false }).order("id");
    };
    if (type === "export") {
      const rows = [];
      for (let page = 0; ; page += 1000) {
        const result = await filtered().range(page,page+999);
        if (result.error) return json({ error: failure(result.error) }, 503);
        rows.push(...(result.data || []));
        if ((result.data || []).length < 1000) break;
      }
      const links=await exportEvidenceLinks(db!, 'damage',rows.filter(row=>(row.photos||[]).some((photo:any)=>photo.path)).map(row=>row.id),session!.email,req.nextUrl.origin);
      const csv=damageCsv(rows,req.nextUrl.origin,links),xlsx=p.get('format')==='xlsx';
      return new NextResponse(xlsx?evidenceReportWorkbook(csv,'Damage Case'):csv, { headers: { "Content-Type": xlsx?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':"text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="report-damage-case.${xlsx?'xlsx':'csv'}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
    }
    const query = filtered();
    const result = await query.order("created_at", { ascending: false }).order("id").range(offset, offset+24);
    if (result.error) return json({ error: failure(result.error) }, 503);
    return json({ items: (result.data || []).map(decorate), total: result.count || 0 });
  } catch { return json({ error: "Data belum dapat dimuat. Silakan coba lagi." }, 503); }
}
export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== req.nextUrl.origin) return json({ error: "Permintaan tidak valid." }, 403);
  const ctx = await context(req); if (ctx.error) return ctx.error;
  const { db, session, admin } = ctx;
  const uploaded: { path: string; name: string; slot: number; fileId?: string }[] = [];
  let insertAttempted = false;
  try {
    if (Number(req.headers.get("content-length") || 0) > 4*1024*1024) return json({ error: "Unggahan terlalu besar." }, 413);
    const form = await req.formData(), get = (key: string) => String(form.get(key) || "");
    const id = get("id"), action = get("action");
    if (!DAMAGE_UUID.test(id) || !["create", "review"].includes(action)) return json({ error: "Catatan tidak valid." }, 400);
    if (action === "review") {
      if (!admin) return json({ error: "Tindakan ini khusus administrator." }, 403);
      const status = get("status"), resolution = get("resolution").trim(), version = get("updated_at");
      if (!Object.hasOwn(DAMAGE_STATUSES, status) || resolution.length > 5000 || !version || Number.isNaN(Date.parse(version)) || (status === "completed" && !resolution)) return json({ error: "Isi status dan tindak lanjut yang valid. Catatan selesai wajib memiliki tindak lanjut." }, 400);
      const result = await db!.from(TABLE).update({ status, resolution, updated_by: session!.email.toLowerCase() }).eq("id", id).eq("updated_at", version).select().maybeSingle();
      if (result.error) return json({ error: failure(result.error) }, 503);
      if (!result.data) return json({ error: "Data telah berubah. Muat ulang dan coba kembali." }, 409);
      return json({ ok: true, item: decorate(result.data) });
    }
    const existing = await db!.from(TABLE).select("*").eq("id", id).maybeSingle();
    if (existing.error) return json({ error: failure(existing.error) }, 503);
    if (existing.data) return existing.data.created_by === session!.email.toLowerCase() ? json({ ok: true, item: decorate(existing.data) }) : json({ error: "ID laporan sudah digunakan." }, 409);
    const values = damageValues(get);
    const warehouse = await db!.from("ops_damage_warehouse_master").select("name").eq("name_key",damagePlateKey(values.trip)).eq("active",true).maybeSingle();
    if (warehouse.error) return json({error:"Master warehouse belum dapat diakses. Silakan coba lagi."},503);
    if (!warehouse.data) return json({error:"Pilih Origin Warehouse yang tersedia pada daftar."},400);
    values.trip=warehouse.data.name;
    const vehicle = await db!.from("ops_damage_vehicle_master").select("plate").eq("plate_key",damagePlateKey(values.plate)).eq("active",true).maybeSingle();
    if (vehicle.error) return json({error:"Master Nopol belum dapat diakses. Silakan coba lagi."},503);
    if (!vehicle.data) return json({error:"Pilih Nopol yang tersedia pada daftar kendaraan."},400);
    values.plate=vehicle.data.plate;
    const entries = Array.from({length:4},(_,slot)=>({slot,file:form.get(`photo${slot}`)})).filter(entry=>entry.file!==null);
    if (Array.from(form.keys()).some(key=>key.startsWith("photo")&&!/^photo[0-3]$/.test(key)) || Array.from({length:4},(_,i)=>form.getAll(`photo${i}`).length).some(n=>n>1) || !entries.length || entries.some(({file})=>!(file instanceof File)||file.size<=0||file.size>1024*1024) || entries.reduce((n,{file})=>n+(file instanceof File?file.size:0),0)>3*1024*1024) return json({error:"Tambahkan 1–4 foto. Maksimal 1 MB per foto, total 3 MB."},400);
    const photos=entries as {slot:number;file:File}[];
    for (const {file} of photos) if (!damageImageValid(new Uint8Array(await file.arrayBuffer()), file.type)) return json({ error: "Gunakan foto JPG, PNG, atau WebP yang valid." }, 400);
    const imagekit = isImageKitConfigured();
    const uploads = await Promise.allSettled(photos.map(async ({file,slot}, i) => {
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      const path = `${id}/${crypto.randomUUID()}-${i}.${ext}`;
      if (imagekit) {
        const result = await uploadToImageKit(file, `damage-cases/${path}`);
        uploaded[i] = { path: `imagekit:${result.path}`, name: file.name.slice(0,200), slot, fileId: result.fileId };
      } else {
        const result = await db!.storage.from(BUCKET).upload(path, file, { contentType: file.type });
        if (result.error) throw new Error("Foto gagal diunggah. Silakan coba lagi.");
        uploaded[i] = { path, name: file.name.slice(0,200), slot };
      }
    }));
    if (uploads.some(r=>r.status === "rejected")) throw new Error("Foto gagal diunggah. Laporan belum disimpan; silakan coba lagi.");
    insertAttempted = true;
    const result = await db!.from(TABLE).insert({ ...values, id, photos: uploaded.map(({path,name,slot})=>({path,name,slot})), created_by: session!.email.toLowerCase(), updated_by: session!.email.toLowerCase() }).select().single();
    if (result.error) {
      // A lost response can happen after commit. Keep photos; retry the stable ID safely.
      const check = await db!.from(TABLE).select("*").eq("id", id).maybeSingle();
      if (check.data?.created_by === session!.email.toLowerCase()) return json({ ok: true, item: decorate(check.data) });
      return json({ error: "Penyimpanan belum terkonfirmasi. Tekan kirim lagi untuk memeriksa laporan yang sama." }, 503);
    }
    return json({ ok: true, item: decorate(result.data) });
  } catch (error) { return json({ error: error instanceof Error ? error.message : "Laporan belum berhasil disimpan." }, 400); }
  finally {
    if (!insertAttempted) await Promise.all(uploaded.filter(Boolean).map(photo => photo.fileId ? deleteFromImageKit(photo.fileId).catch(()=>{}) : db!.storage.from(BUCKET).remove([photo.path]).catch(()=>{})));
  }
}
