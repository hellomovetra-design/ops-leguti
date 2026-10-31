import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken, SessionPayload } from "@/lib/auth-token";
import { getSupabaseServerClient } from "@/lib/supabase";
import { sanctionRecorderIdentity } from "@/lib/sanction-recorder";
import { linkedEmployee } from "@/lib/employee-access";
import { SANCTION_ADMINS, SANCTION_KINDS, sanctionRecorder, sanctionTeam, sanctionValues, SanctionEmployee } from "@/lib/employee-sanctions";
import { employeeStatus } from "@/lib/employee-status";
import { fetchFromImageKit } from "@/lib/imagekit";
import { coachingDetails } from "@/lib/coaching-workflow";
import { sanctionDetails } from "@/lib/sanction-form";
import { employeeEmployment,EMPLOYMENT_LABELS } from "@/lib/employee-employment";
import { validateSanctionPhotos, uploadSanctionPhotos, discardSanctionPhotos, sanctionPhotoView, SanctionPhoto } from "@/lib/sanction-photos";
export const runtime = "nodejs";
const TABLE = "ops_employee_sanctions";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
type DB = NonNullable<ReturnType<typeof getSupabaseServerClient>>;
function sanctionRecordView(row:Record<string,any>,scope:string){
  return {...row,photos:sanctionPhotoView(row as {id:string;updated_at:string;photos?:SanctionPhoto[]},scope),final_document:row.final_document?{name:row.final_document.name,url:`/api/employee-sanctions/workflow?type=final&scope=${scope}&id=${row.id}`} : null};
}
async function access(db: DB, session: SessionPayload, admin: boolean) {
  if (admin) return SANCTION_ADMINS.includes(session.role);
  if (session.role === "super_admin") return true;
  return sanctionRecorder(await linkedEmployee(db, session.email));
}
async function employees(db: DB, session: SessionPayload, admin: boolean) {
  const rows: SanctionEmployee[] = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await db.from("ops_employees").select("nik,name,position,dept,hub,superior,superior_nik,active,employment,employment_type").order("nik").range(offset, offset + 999);
    if (result.error) throw Error("Data karyawan belum dapat dimuat.");
    rows.push(...(result.data || []));
    if ((result.data || []).length < 1000) break;
  }
  const unrestricted = admin || session.role === "super_admin";
  const owner = unrestricted ? null : await linkedEmployee(db, session.email);
  return (unrestricted ? rows.filter(row => employeeStatus(row) === "active") : sanctionTeam(rows, owner?.nik || "")).sort((a,b) => a.name.localeCompare(b.name));
}
const dbMessage = (error: { code?: string }) => ["42703", "PGRST204"].includes(error.code || "") ? "Bukti coaching belum siap. Jalankan migration 20261028_sanction_photos.sql." : ["42P01", "PGRST205"].includes(error.code || "") ? "Modul Sanksi belum siap. Administrator perlu menjalankan migration 20261027_employee_sanctions.sql." : "Catatan belum dapat diproses. Coba lagi.";
export async function GET(req: NextRequest) {
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, process.env.INTERNAL_AUTH_SECRET);
  if (!session) return json({ error: "Silakan login kembali." }, 401);
  const db = getSupabaseServerClient();
  if (!db) return json({ error: "Penyimpanan belum siap." }, 503);
  try {
    const p = req.nextUrl.searchParams, admin = p.get("scope") === "admin";
    if (!await access(db, session, admin)) return json({ error: admin ? "Akses pengelola diperlukan." : "Pencatatan PWA hanya untuk Superadmin atau karyawan aktif dengan jabatan leader, koordinator, SPV/JR SPV." }, 403);
    const type = p.get("type") || "list";
    if (type === "photo") {
      const id=p.get("id")||"", index=Number(p.get("index"));
      if(!uuid.test(id)||!p.has("index")||!Number.isInteger(index)||index<0||index>2)return json({error:"Foto tidak valid."},400);
      let query=db.from(TABLE).select("created_by,photos").eq("id",id);
      if(!admin)query=query.eq("created_by",session.email.toLowerCase());
      const record=await query.maybeSingle();
      if(record.error)return json({error:dbMessage(record.error)},503);
      const photo=record.data?.photos?.[index];
      if(!photo?.path)return json({error:"Foto tidak ditemukan."},404);
      const file=await fetchFromImageKit(photo.path);
      return new NextResponse(file.body,{headers:{"Content-Type":photo.content_type||"image/jpeg","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
    }
    if(type==="record"){
      const id=p.get("id")||"";if(!uuid.test(id))return json({error:"Catatan tidak valid."},400);
      let query=db.from(TABLE).select("*").eq("id",id);if(!admin)query=query.eq("created_by",session.email.toLowerCase());
      const result=await query.maybeSingle();if(result.error)return json({error:dbMessage(result.error)},503);
      if(!result.data)return json({error:"Catatan tidak ditemukan."},404);
      const row=result.data;return json({item:{...sanctionRecordView(row,admin?"admin":"mine"),can_edit:!row.workflow_status||row.workflow_status==="awaiting_signatures"}});
    }
    if (type === "employees") return json({ items: await employees(db, session, admin), recorder_name: (await sanctionRecorderIdentity(db, session.email, session))?.name || "" });
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
    return json({ items: rows.map(row => ({ ...sanctionRecordView(row,admin?"admin":"mine"), recorder_name: row.recorder_name||names.get(String(row.created_by).toLowerCase()) || "", can_edit: (!row.workflow_status||row.workflow_status==="awaiting_signatures") })), has_more: (result.data || []).length > 50 });
  } catch { return json({ error: "Akses atau data belum dapat diperiksa. Coba lagi." }, 503); }
}
export async function POST(req: NextRequest) {
  if (req.headers.get("origin") !== req.nextUrl.origin) return json({ error: "Permintaan tidak valid." }, 403);
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, process.env.INTERNAL_AUTH_SECRET);
  if (!session) return json({ error: "Silakan login kembali." }, 401);
  const db = getSupabaseServerClient(session.email);
  if (!db) return json({ error: "Penyimpanan belum siap." }, 503);
  let uploaded:SanctionPhoto[]=[], attempted=false;
  try {
    let body: Record<string, unknown>;
    let files:File[]=[];
    if(Number(req.headers.get("content-length")||0)>4*1024*1024)return json({error:"Total unggahan terlalu besar."},413);
    try {
      if(req.headers.get("content-type")?.includes("multipart/form-data")){
        const form=await req.formData();body=Object.fromEntries(form.entries());
        const parts=form.getAll("photos");
        if(parts.some(part=>!(part instanceof File)))return json({error:"Foto tidak valid."},400);
        files=parts as File[];
      } else body = await req.json();
    } catch { return json({ error: "Permintaan tidak valid." }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Permintaan tidak valid." }, 400);
    const admin = body.scope === "admin";
    if (!await access(db, session, admin)) return json({ error: "Anda tidak memiliki akses untuk tindakan ini." }, 403);
    const id = String(body.id || ""), action = String(body.action || "");
    if (!uuid.test(id) || !["create", "update"].includes(action)) return json({ error: "Catatan tidak valid." }, 400);
    const email = session.email.toLowerCase();
    let existingQuery = db.from(TABLE).select("*").eq("id", id);
    if (!admin) existingQuery = existingQuery.eq("created_by", email);
    const existing = await existingQuery.maybeSingle();
    if (existing.error) return json({ error: dbMessage(existing.error) }, 503);
    if (action === "update" && !existing.data) return json({ error: "Catatan tidak ditemukan." }, 404);
    if(action==="update"&&existing.data.workflow_status&&existing.data.workflow_status!=="awaiting_signatures")return json({error:"Dokumen yang sudah dikirim ke HRD atau final tidak dapat diubah."},409);
    if (action === "create" && existing.data) return json({ ok: true, item:sanctionRecordView(existing.data,admin?"admin":"mine") });
    let values;
    try {
      const details=coachingDetails(body.coaching_details,String(body.kind));
      const application=sanctionDetails(body.sanction_details,String(body.kind));
      if(application&&!admin)application.hco_notes=existing.data?.sanction_details?.hco_notes||"";
      values = {...sanctionValues(details?{...body,description:details.obstacles,coaching_result:details.summary}:body),coaching_details:details,sanction_details:application};
    } catch (e) { return json({ error: e instanceof Error ? e.message : "Isian tidak valid." }, 400); }
    const oldPhotos:SanctionPhoto[]=existing.data?.photos||[];
    try { await validateSanctionPhotos(files,oldPhotos.length); } catch(error) {return json({error:error instanceof Error?error.message:"Foto tidak valid."},400);}
    // Explicit readiness check avoids uploading assets before the photos column exists.
    const ready=await db.from(TABLE).select("photos,coaching_details,sanction_details,workflow_status,recorder_name").limit(1);
    if(ready.error)return json({error:"Form belum siap. Jalankan migration 20261030_coaching_workflow.sql dan 20261030_sanction_application_form.sql."},503);
    if (action === "update") {
      const version = String(body.updated_at || "");
      if (!version || Number.isNaN(Date.parse(version))) return json({ error: "Versi catatan tidak valid." }, 400);
      if(existing.data.updated_at!==version)return json({error:"Catatan berubah. Muat ulang sebelum menyimpan."},409);
      const originalRecorder=existing.data.recorder_name?null:await sanctionRecorderIdentity(db,existing.data.created_by,session);
      const recorderSnapshot=originalRecorder?.name?{recorder_name:originalRecorder.name,recorder_nik:originalRecorder.nik}:{};
      if(values.sanction_details){
        const person=await db.from("ops_employees").select("dept,employment,employment_type").eq("nik",existing.data.employee_nik).maybeSingle();
        if(person.error)return json({error:"Identitas karyawan belum dapat diperiksa."},503);
        values.sanction_details.department=existing.data.sanction_details?.department||person.data?.dept||"";
        values.sanction_details.employment_status=existing.data.sanction_details?.employment_status||(person.data?EMPLOYMENT_LABELS[employeeEmployment(person.data)]:"");
      }
      uploaded=await uploadSanctionPhotos(files,id);
      attempted=true;
      const result = await db.from(TABLE).update({ ...values,...recorderSnapshot, photos:[...oldPhotos,...uploaded], updated_by: email }).eq("id", id).eq("updated_at", version).select().maybeSingle();
      if (result.error) return json({ error: dbMessage(result.error) }, 503);
      if (!result.data) {await discardSanctionPhotos(uploaded);return json({ error: "Catatan berubah. Muat ulang sebelum menyimpan." }, 409);}
      return json({ ok: true, item:sanctionRecordView(result.data,admin?"admin":"mine") });
    }
    const person = (await employees(db, session, admin)).find(row => row.nik === String(body.employee_nik || ""));
    if (!person) return json({ error: "Pilih karyawan aktif dalam tim yang dapat Anda kelola." }, 403);
    const recorder=await sanctionRecorderIdentity(db,session.email,session);
    if(!recorder?.name)return json({error:"Akun pemberi coaching/sanksi belum terhubung ke data karyawan. Hubungi administrator untuk mengaitkan NIK."},409);
    if(values.sanction_details){values.sanction_details.department=person.dept||"";values.sanction_details.employment_status=EMPLOYMENT_LABELS[employeeEmployment(person)];}
    uploaded=await uploadSanctionPhotos(files,id);
    attempted=true;
    const result = await db.from(TABLE).insert({ ...values,recorder_nik:recorder.nik,recorder_name:recorder.name, photos:uploaded, id, employee_nik: person.nik, employee_name: person.name, position: person.position, superior_nik: person.superior_nik || null, superior_name: person.superior || "", hub: person.hub, created_by: email, updated_by: email }).select().single();
    if (result.error) {
      if (result.error.code === "23505") {
        await discardSanctionPhotos(uploaded);
        const retry = await db.from(TABLE).select("*").eq("id", id).eq("created_by", email).maybeSingle();
        if (!retry.error && retry.data) return json({ ok: true, item:sanctionRecordView(retry.data,admin?"admin":"mine") });
        return json({ error: "ID catatan tidak tersedia. Buka form baru." }, 409);
      }
      return json({ error: dbMessage(result.error) }, 503);
    }
    return json({ ok: true, item:sanctionRecordView(result.data,admin?"admin":"mine") });
  } catch(error) { return json({ error: !attempted&&error instanceof Error?error.message:"Penyimpanan belum terkonfirmasi. Coba kembali dengan form yang sama." }, 503); }
  finally { if(!attempted)await discardSanctionPhotos(uploaded); }
}
