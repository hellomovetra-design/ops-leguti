import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth-token";
import { fetchFromImageKit, isImageKitConfigured, uploadToImageKit } from "@/lib/imagekit";
import { applyRequestFilters, requestFilters, requestCsv } from "@/lib/request-report";
import { applyProblemFilters, problemFilters } from "@/lib/problem-records";
import { linkedEmployee } from "@/lib/employee-access";
import { after } from "next/server";
import { dispatchPush } from "@/lib/web-push";
import { scopeHistory } from "@/lib/history-scope";

const db = () => getSupabaseServerClient();
const SUPER_ADMIN_EMAIL = (process.env.INTERNAL_SUPER_ADMIN_EMAIL || "ibadnarpatih@gmail.com").trim().toLowerCase();
const HELP_DESK_TO = ["ithelpdesk@jne.co.id", "helpdesk3@jne.co.id", "helpdesk2@jne.co.id", "helpdesk4@jne.co.id", "tgr.itadmin@jne.co.id", "tgr.it@jne.co.id"].join(",");
const HELP_DESK_CC = ["adhitya.nugraha@jne.co.id", "giga.pratama@jne.co.id", "feri.achmad555@gmail.com", "tgr.adm2@jne.co.id"].join(",");
async function getSession(req: NextRequest) {
  return verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, process.env.INTERNAL_AUTH_SECRET);
}
async function audit(supabase: any, session: any, action: string, entityType: string, entityId?: string, metadata: Record<string, any> = {}) {
  await supabase.from("ops_audit_logs").insert({ actor_email: session.email, actor_role: session.role, action, entity_type: entityType, entity_id: entityId || null, metadata });
}
export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return NextResponse.json({ items: [], error: "Sesi tidak valid." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const p = req.nextUrl.searchParams, type = p.get("type") || "overview", q = p.get("q") || "";
  const supabase = db();
  if (!supabase && type === "employees") {
    const source = path.join(process.cwd(), "public", "struktur update 2026_SEPT.xlsx");
    if (fs.existsSync(source)) {
      const workbook = XLSX.readFile(source), sheet = workbook.Sheets["LEGUTI MALOKO"] || workbook.Sheets[workbook.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
      const items = raw.map(row => ({ nik: String(row.NIK || row.NIA || ""), name: row["FULL NAME"] || row.NAME || "", position: row.POSITION || "", dept: row.DEPT || "", hub: row.HUB || "", level: row.LEVEL || "", superior: row["SUPERIOR 1"] || "", employment: row.STATUS || "", start_date: row["TGL MASUK"] || "", active: true })).filter(row => row.nik || row.name).filter(row => !q || `${row.name} ${row.nik} ${row.position} ${row.hub}`.toLowerCase().includes(q.toLowerCase()));
      return NextResponse.json({ items, preview: true, source: "struktur update 2026_SEPT.xlsx" });
    }
  }
  if (!supabase) return NextResponse.json({ items: [], problems: 0, preview: true });
  if (type === "problem-photo") {
    const storagePath = p.get("path");
    if (!storagePath) return NextResponse.json({ error: "Path foto tidak ditemukan." }, { status: 400 });
    if (storagePath.startsWith("imagekit:")) {
      try {
        const file = await fetchFromImageKit(storagePath.slice("imagekit:".length));
        return new NextResponse(file.body, { headers: { "Content-Type": file.headers.get("content-type") || "image/jpeg", "Cache-Control": "private, max-age=300" } });
      } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Foto tidak ditemukan." }, { status: 404 }); }
    }
    const file = await supabase.storage.from("ops-problem-photos").download(storagePath);
    if (file.error || !file.data) return NextResponse.json({ error: file.error?.message || "Foto tidak ditemukan." }, { status: 404 });
    return new NextResponse(file.data, { headers: { "Content-Type": file.data.type || "application/octet-stream", "Cache-Control": "private, max-age=300" } });
  }
  if (type === "employee-photo") {
    const storagePath = p.get("path");
    if (!storagePath) return NextResponse.json({ error: "Path foto tidak ditemukan." }, { status: 400 });
    if (storagePath.startsWith("imagekit:")) {
      try {
        const file = await fetchFromImageKit(storagePath.slice("imagekit:".length));
        return new NextResponse(file.body, { headers: { "Content-Type": file.headers.get("content-type") || "image/jpeg", "Cache-Control": "private, max-age=300" } });
      } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Foto tidak ditemukan." }, { status: 404 }); }
    }
    const file = await supabase.storage.from("ops-profile-photos").download(storagePath);
    if (file.error || !file.data) return NextResponse.json({ error: file.error?.message || "Foto personel tidak ditemukan." }, { status: 404 });
    return new NextResponse(file.data, { headers: { "Content-Type": file.data.type || "application/octet-stream", "Cache-Control": "private, max-age=300" } });
  }
  if (type === "overview") {
    const [cases, problems, requests] = await Promise.all([supabase.from("ops_cases").select("id,awb,leader,zone,consignee,status,last_seen,created_at").order("last_seen", { ascending: false }).limit(50), supabase.from("ops_problems").select("id", { count: "exact", head: true }), supabase.from("ops_requests").select("id,type,status,shipment_numbers,name,nik,reason,location,email,created_at,email_subject").is("archived_at", null).order("created_at", { ascending: false }).limit(10)]);
    return NextResponse.json({ items: cases.data || [], problems: problems.count || 0, requests: requests.data || [], requestsError: requests.error?.message }, { headers: { "Cache-Control": "no-store" } });
  }
  const table = type === "employees" ? "ops_employees" : type === "problems" ? "ops_problems" : type === "users" ? "ops_users" : "ops_cases";
  if (type === "requests") {
    try {
      const filters = requestFilters(p), offset = Number(p.get("offset") || 0);
      if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("Halaman tidak valid.");
      const result = await applyRequestFilters(scopeHistory(supabase.from("ops_requests").select("*"), session, p), filters).order("created_at", { ascending: false }).order("id").range(offset, offset+100);
      if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
      const pageItems=(result.data||[]).slice(0,100);
      const emails=Array.from(new Set<string>(pageItems.map((row:Record<string,any>)=>String(row.created_by||row.email||"").trim().toLowerCase()).filter(Boolean)));
      const profiles=emails.length?await supabase.from("ops_user_profiles").select("email,display_name").in("email",emails):{data:[]};
      const names=new Map((profiles.data||[]).map(profile=>[profile.email,String(profile.display_name||"").trim()]));
      return NextResponse.json({ items: pageItems.map((row:Record<string,any>)=>({...row,requester_name:names.get(String(row.created_by||row.email||"").trim().toLowerCase())||""})), has_more: (result.data || []).length>100, can_manage: ["super_admin","admin"].includes(session.role) }, { headers: { "Cache-Control": "no-store" } });
    } catch(error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Filter tidak valid." }, { status:400 }); }
  }
  if (type === "requests-export") {
    try {
      const filters = requestFilters(p), rows: any[] = [];
      for (let offset=0;;offset+=1000) {
        let query = applyRequestFilters(scopeHistory(supabase.from("ops_requests").select("*"), session, p), filters);
        if (p.get("id")) query = query.eq("id",p.get("id"));
        const result = await query.order("created_at",{ascending:false}).order("id").range(offset,offset+999);
        if (result.error) return NextResponse.json({ error:result.error.message },{status:500});
        rows.push(...(result.data||[]));if ((result.data||[]).length<1000) break;
      }
      return new NextResponse(requestCsv(rows), { headers: { "Content-Type":"text/csv; charset=utf-8", "Content-Disposition":"attachment; filename=\"request-helpdesk.csv\"", "Cache-Control":"no-store" } });
    } catch(error) { return NextResponse.json({error:error instanceof Error?error.message:"Filter tidak valid."},{status:400}); }
  }
  if (type === "users") {
    if (session.role !== "super_admin") return NextResponse.json({ error: "Hanya Super Admin yang dapat melihat akun." }, { status: 403 });
    const [roleRows, authRows] = await Promise.all([
      supabase.from("ops_users").select("id,email,role,leader_name,created_at").order("created_at", { ascending: false }),
      supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);
    const byEmail = new Map<string, any>((roleRows.data || []).map((row: any) => [String(row.email).toLowerCase(), row]));
    for (const user of authRows.data.users || []) {
      const email = user.email?.toLowerCase();
      if (!email || byEmail.has(email)) continue;
      byEmail.set(email, { id: user.id, email, role: user.app_metadata?.role || "viewer", leader_name: user.user_metadata?.leader_name || null, created_at: user.created_at });
    }
    const items = Array.from(byEmail.values()).map((row) => row.email === SUPER_ADMIN_EMAIL ? { ...row, role: "super_admin" } : row).filter((row) => !q || row.email.includes(q.toLowerCase()));
    return NextResponse.json({ items, error: roleRows.error?.message || authRows.error?.message });
  }
  if (type === "profile") {
    let personelName = "";
    if (session.employee_nik) {
      try { personelName = (await linkedEmployee(supabase, session.email))?.name || ""; }
      catch { return NextResponse.json({ error: "Data personel akun belum dapat dimuat." }, { status: 503 }); }
    }
    const result = await supabase.from("ops_user_profiles").select("email,display_name,photo_path,updated_at").eq("email", session.email.toLowerCase()).maybeSingle();
    const photoPath = result.data?.photo_path || "";
    const version = result.data?.updated_at ? `&v=${encodeURIComponent(result.data.updated_at)}` : "";
    const photo_url = photoPath ? `/api/ops-desk?type=employee-photo&path=${encodeURIComponent(photoPath)}${version}` : "";
    return NextResponse.json({ profile: result.data ? { ...result.data, display_name: personelName || result.data.display_name, photo_url } : { email: session.email, display_name: personelName, photo_url: "" }, error: result.error?.message }, { headers: { "Cache-Control": "no-store" } });
  }
  const employeeFields = "nik,name,position,dept,hub,level,superior,superior_nik,active,employment,start_date,created_at";
  if (type === "employees" && p.get("view") === "structure") {
    const employees: any[] = [];
    for (let offset = 0; ; offset += 1000) {
      const page = await supabase.from("ops_employees").select(employeeFields).order("nik").range(offset, offset + 999);
      if (page.error) return NextResponse.json({ error: "Data struktur belum dapat dimuat." }, { status: 503 });
      employees.push(...(page.data || []));
      if ((page.data || []).length < 1000) break;
    }
    const photos = new Map<string, string>();
    for (let offset = 0; offset < employees.length; offset += 500) {
      const result = await supabase.from("ops_employee_photos").select("nik,storage_path").in("nik", employees.slice(offset, offset + 500).map(row => row.nik));
      if (result.error) return NextResponse.json({ error: "Foto personel belum dapat dimuat." }, { status: 503 });
      for (const photo of result.data || []) photos.set(photo.nik, photo.storage_path);
    }
    return NextResponse.json({ items: employees.map(row => ({ ...row, photo_url: photos.get(row.nik) ? `/api/ops-desk?type=employee-photo&path=${encodeURIComponent(photos.get(row.nik)!)}` : "/default-employee.jpg" })) }, { headers: { "Cache-Control": "private, no-store" } });
  }
  if(type==="problems"){
    try{
      const filters=problemFilters(p),offset=Number(p.get("offset")||0);
      if(!Number.isSafeInteger(offset)||offset<0)throw new Error("Halaman tidak valid.");
      const result=await applyProblemFilters(scopeHistory(supabase.from("ops_problems").select("*"),session,p,"created_by_email"),filters).order("created_at",{ascending:false}).order("id").range(offset,offset+100);
      if(result.error)return NextResponse.json({error:result.error.message},{status:500});
      const rows=(result.data||[]).slice(0,100);
      const photoResult=rows.length?await supabase.from("ops_problem_photos").select("id,problem_id,file_name,content_type,storage_path,created_at").in("problem_id",rows.map((row:Record<string,any>)=>row.id)).order("created_at",{ascending:true}):{data:[],error:null};
      if(photoResult.error)return NextResponse.json({error:"Foto laporan belum dapat dimuat. "+photoResult.error.message},{status:500});
      return NextResponse.json({items:rows.map((row:Record<string,any>)=>({...row,photos:(photoResult.data||[]).filter(photo=>photo.problem_id===row.id).map(photo=>({id:photo.id,file_name:photo.file_name,url:`/api/ops-desk?type=problem-photo&path=${encodeURIComponent(photo.storage_path)}`}))})),has_more:(result.data||[]).length>100,can_delete:["super_admin","admin"].includes(session.role),can_create:session.role!=="viewer",can_manage:["super_admin","admin","coordinator","spv","jr_spv"].includes(session.role)},{headers:{"Cache-Control":"no-store"}});
    }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Filter tidak valid."},{status:400})}
  }
  let query = supabase.from(table).select(table === "ops_employees" ? employeeFields : "*").order("created_at", { ascending: false });
  if (q) query = table === "ops_employees" ? query.or(`name.ilike.%${q}%,nik.ilike.%${q}%`) : table === "ops_problems" ? query.or(`awb.ilike.%${q}%,category.ilike.%${q}%`) : query.or(`awb.ilike.%${q}%,leader.ilike.%${q}%,zone.ilike.%${q}%`);
  const result = await query.limit(table === "ops_employees" ? 500 : table === "ops_cases" ? 100 : 100);
  if (table === "ops_employees" && result.data?.length) {
    const photoRows = await supabase.from("ops_employee_photos").select("nik,storage_path").in("nik", result.data.map((row: any) => row.nik));
    const photos = new Map((photoRows.data || []).map((row: any) => [row.nik, row.storage_path]));
    return NextResponse.json({ items: result.data.map((row: any) => { const photoPath = photos.get(row.nik) || ""; return { ...row, photo_url: photoPath ? `/api/ops-desk?type=employee-photo&path=${encodeURIComponent(photoPath)}` : "/default-employee.jpg" }; }), error: (result as any).error?.message }, { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate=120" } });
  }
  if (table === "ops_problems" && result.data?.length) {
    const ids = result.data.map((row: any) => row.id);
    const photos = await supabase.from("ops_problem_photos").select("id,problem_id,file_name,content_type,storage_path,created_at").in("problem_id", ids).order("created_at", { ascending: true });
    const photoRows = photos.data || [];
    const photoMap = new Map<string, any[]>();
    for (const photo of photoRows) {
      const item = { id: photo.id, file_name: photo.file_name, content_type: photo.content_type, url: `/api/ops-desk?type=problem-photo&path=${encodeURIComponent(photo.storage_path)}`, created_at: photo.created_at };
      photoMap.set(photo.problem_id, [...(photoMap.get(photo.problem_id) || []), item]);
    }
    return NextResponse.json({ items: result.data.map((row: any) => ({ ...row, photos: photoMap.get(row.id) || [] })), error: (result as any).error?.message });
  }
  return NextResponse.json({ items: result.data || [], error: result.error?.message });
}
export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session || !["super_admin", "admin", "coordinator", "spv", "jr_spv", "viewer"].includes(session.role)) return NextResponse.json({ ok: false, error: "Akses administrator diperlukan." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  const supabase = db(); if (!supabase) return NextResponse.json({ ok: false, preview: true, error: "Mode preview: Supabase belum dikonfigurasi" }, { status: 200 });
  const isMultipart = req.headers.get("content-type")?.includes("multipart/form-data");
  const multipart = isMultipart ? await req.formData() : null;
  const body = multipart ? Object.fromEntries(multipart.entries()) : await req.json();
  const pwaWriteActions = ["createRequest", "problem", "profile", "comment"];
  if (session.role === "viewer" && !pwaWriteActions.includes(String(body.action))) return NextResponse.json({ ok: false, error: "Akun ini hanya dapat melakukan transaksi melalui PWA." }, { status: 403 });
  // PWA uses `reason`; the admin form uses `description`. Store both in one field.
  if(body.action==="problem"){
    body.description=String(body.description||body.reason||"").trim();
    body.awb=String(body.awb||"").trim();body.division=String(body.division||"").trim();
    if(!body.awb||!body.division)return NextResponse.json({ok:false,error:"Nomor AWB dan divisi wajib diisi."},{status:400});
  }
  if (body.action === "employeePhoto") {
    const nik = String(body.nik || body.name || "").trim();
    const file = multipart?.get("photo");
    if (!nik || !(file instanceof File)) return NextResponse.json({ ok: false, error: "NIK dan foto wajib diisi." }, { status: 400 });
    const rawPath = `employees/${nik}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
    const image = isImageKitConfigured() ? await uploadToImageKit(file, rawPath) : null;
    const storagePath = image ? `imagekit:${image.path}` : rawPath;
    const uploaded = image ? { error: null } : await supabase.storage.from("ops-profile-photos").upload(storagePath, file, { contentType: file.type, upsert: false });
    if (uploaded.error) return NextResponse.json({ ok: false, error: uploaded.error.message }, { status: 400 });
    const saved = await supabase.from("ops_employee_photos").upsert({ nik, storage_path: storagePath, file_name: file.name, content_type: file.type, updated_at: new Date().toISOString() }, { onConflict: "nik" }).select().single();
    if (saved.error) return NextResponse.json({ ok: false, error: saved.error.message }, { status: 400 });
    return NextResponse.json({ ok: true, photo_url: `/api/ops-desk?type=employee-photo&path=${encodeURIComponent(storagePath)}` });
  }
  if (body.action === "role" && session.role !== "super_admin") return NextResponse.json({ ok: false, error: "Hanya super admin yang dapat membuat role." }, { status: 403 });
  if (body.action === "role" && !["super_admin", "admin", "viewer"].includes(String(body.role))) return NextResponse.json({ ok: false, error: "Jenis akses tidak valid." }, { status: 400 });
  if (body.action === "role") {
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    if (email === SUPER_ADMIN_EMAIL) body.role = "super_admin";
    if (!email || password.length < 8) return NextResponse.json({ ok: false, error: "Email dan password minimal 8 karakter wajib diisi." }, { status: 400 });
    const created = await supabase.auth.admin.createUser({ email, password, email_confirm: true, app_metadata: { role: body.role } });
    if (created.error && !created.error.message.toLowerCase().includes("already registered")) return NextResponse.json({ ok: false, error: created.error.message }, { status: 400 });
    if (created.error) {
      const listed = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const existing = listed.data.users.find(user => user.email?.toLowerCase() === email);
      if (!existing) return NextResponse.json({ ok: false, error: "User sudah terdeteksi tetapi tidak dapat ditemukan di Supabase Auth." }, { status: 409 });
      const updated = await supabase.auth.admin.updateUserById(existing.id, { password, user_metadata: { role: body.role }, app_metadata: { role: body.role } });
      if (updated.error) return NextResponse.json({ ok: false, error: updated.error.message }, { status: 400 });
    }
  }
  if (body.action === "createRequest") {
    const name = String(body.name || "").trim(), nik = String(body.nik || "").trim(), userId = String(body.userId || "").trim().toUpperCase();
    const isCl3 = body.type === "open_cl3";
    if (isCl3 && (!String(body.shipmentNumbers || "").trim() || !String(body.reason || "").trim())) return NextResponse.json({ ok: false, error: "Nomor Airwaybill dan keterangan wajib diisi." }, { status: 400 });
    if (!isCl3 && (!name || !nik || !userId || !String(body.reason || "").trim())) return NextResponse.json({ ok: false, error: "User ID, nama, NIK, dan alasan wajib diisi." }, { status: 400 });
    const subject = isCl3 ? "Request Open Status Shipment CL3 | CLOSE BY SYSTEM (ORIGIN)" : "Request Aktivasi User TGR - " + userId;
    const shipments = String(body.shipmentNumbers || "").split(/\r?\n|,/).map(x => x.trim()).filter(Boolean).join("\n");
    const emailBody = isCl3
      ? "Dear Team IT\n\nMohon di bantu Open Status Shipment CL3  | CLOSE BY SYSTEM (ORIGIN)\nDikarenakan shipment sudah berada di destinasi\n\n" + shipments + "\n\n--\nTerima kasih , Barakallahu Fiikum"
      : "Dear Team IT JNE TGR\n\nMohon dibantu pengaktifan kembali User ID TGR\n\nUser ID              : " + userId + "\nNama Karyawan       : " + name + "\nNIK Karyawan        : " + nik + "\nDepartemen          : " + String(body.department || "") + "\nLokasi Kerja        : " + String(body.location || "") + "\nAlasan              : " + String(body.reason || "");
    const result = await supabase.from("ops_requests").insert({ type: body.type || "activation_user", status: "pending", user_id: userId, name, nik, department: body.department, location: body.location, reason: body.reason, shipment_numbers: isCl3 ? shipments : null, email_subject: subject, email_body: emailBody, created_by: session.email, updated_at: new Date().toISOString(), last_action_at: new Date().toISOString() }).select().single();
    if (!result.error && result.data?.id) await audit(supabase, session, "create", "request", result.data.id, { type: body.type || "activation_user" });
    const inbox = !result.error && result.data?.id ? await supabase.from("ops_inbox_threads").select("id").eq("entity_type", "request").eq("entity_id", result.data.id).maybeSingle() : null;
    if (!result.error) after(() => dispatchPush().catch(() => console.error("Request push dispatch failed")));
    return NextResponse.json({ ok: !result.error, id: result.data?.id, item: result.data, inbox_thread_id: inbox?.data?.id, emailSubject: subject, emailBody, error: result.error?.message });
  }
  if (body.action === "approveRequest") {
    if (!['super_admin', 'admin'].includes(session.role)) return NextResponse.json({ ok: false, error: "Hanya Super Admin atau Admin Pengelola yang dapat memproses request." }, { status: 403 });
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ ok: false, error: "Request tidak valid." }, { status: 400 });
    const current = await supabase.from("ops_requests").select("*").eq("id", id).single();
    if (current.error || !current.data) return NextResponse.json({ ok: false, error: current.error?.message || "Request tidak ditemukan." }, { status: 404 });
    const updated = await supabase.from("ops_requests").update({ status: "approved", approved_by: session.email, approved_at: new Date().toISOString(), last_action_at: new Date().toISOString() }).eq("id", id).select().single();
    if (updated.error) return NextResponse.json({ ok: false, error: updated.error.message }, { status: 400 });
    await audit(supabase, session, "approve", "request", id);
    after(() => dispatchPush().catch(() => console.error("Push dispatch failed")));
    return NextResponse.json({ ok: true, request: updated.data, mail: { to: HELP_DESK_TO, cc: HELP_DESK_CC, subject: current.data.email_subject || "Request Helpdesk OPS LEGUTI", body: current.data.email_body || "" } });
  }
  if (body.action === "updateRequestStatus") {
    if (!['super_admin', 'admin'].includes(session.role)) return NextResponse.json({ ok: false, error: "Hanya Super Admin atau Admin Pengelola yang dapat memproses request." }, { status: 403 });
    const id = String(body.id || ""), nextStatus = String(body.status || "");
    if (!id || !['rejected', 'completed', 'sent'].includes(nextStatus)) return NextResponse.json({ ok: false, error: "Status request tidak valid." }, { status: 400 });
    const patch: Record<string, any> = { status: nextStatus, updated_at: new Date().toISOString(), last_action_at: new Date().toISOString() };
    if (nextStatus === "rejected") { patch.rejected_by = session.email; patch.rejected_at = new Date().toISOString(); patch.rejection_reason = String(body.reason || "Tidak ada alasan yang dicatat."); }
    if (nextStatus === "completed") { patch.completed_by = session.email; patch.completed_at = new Date().toISOString(); }
    if (nextStatus === "sent") { patch.sent_at = new Date().toISOString(); patch.completed_at = null; patch.completed_by = null; }
    const updated = await supabase.from("ops_requests").update(patch).eq("id", id).select().single();
    if (updated.error) return NextResponse.json({ ok: false, error: updated.error.message }, { status: 400 });
    await audit(supabase, session, nextStatus, "request", id, { reason: patch.rejection_reason || null });
    after(() => dispatchPush().catch(() => console.error("Push dispatch failed")));
    return NextResponse.json({ ok: true, request: updated.data });
  }
  if (body.action === "archiveRequest" || body.action === "deleteRequest") {
    if (!['super_admin', 'admin'].includes(session.role)) return NextResponse.json({ ok: false, error: "Hanya Super Admin atau Admin Pengelola yang dapat mengelola riwayat request." }, { status: 403 });
    const ids = Array.from(new Set<string>(Array.isArray(body.ids) ? body.ids.map((id:unknown)=>String(id)) : [String(body.id || "")]));
    if (!ids.length || ids.length>100 || ids.some(id=>!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))) return NextResponse.json({ok:false,error:"Pilih 1–100 request yang valid."},{status:400});
    const current = await supabase.from("ops_requests").select("id").in("id",ids);
    if (current.error) return NextResponse.json({ok:false,error:current.error.message},{status:500});
    if (current.data?.length!==ids.length) return NextResponse.json({ok:false,error:"Sebagian request tidak ditemukan. Muat ulang daftar."},{status:409});
    const result = body.action === "deleteRequest"
      ? await supabase.from("ops_requests").delete().in("id",ids).select("id")
      : await supabase.from("ops_requests").update({archived_at:new Date().toISOString(),archived_by:session.email,updated_at:new Date().toISOString(),last_action_at:new Date().toISOString()}).in("id",ids).select("id");
    if (result.error || result.data?.length!==ids.length) return NextResponse.json({ok:false,error:result.error?.message || "Tidak semua request berhasil diproses. Muat ulang daftar."},{status:409});
    await audit(supabase,session,body.action==="deleteRequest"?"delete":"archive","request",ids.length===1?ids[0]:undefined,{ids,count:ids.length});
    return NextResponse.json({ok:true,count:ids.length});
  }
  if (body.action === "updateProblemStatus") {
    if (!['super_admin', 'admin', 'coordinator', 'spv', 'jr_spv'].includes(session.role)) return NextResponse.json({ ok: false, error: "Anda tidak memiliki hak memproses problem." }, { status: 403 });
    const id = String(body.id || ""), nextStatus = String(body.status || "");
    if (!id || !['verified', 'in_progress', 'resolved', 'closed'].includes(nextStatus)) return NextResponse.json({ ok: false, error: "Status problem tidak valid." }, { status: 400 });
    const patch: Record<string, any> = { status: nextStatus, status_note: String(body.note || ""), updated_at: new Date().toISOString() };
    if (nextStatus === "verified") { patch.verified_by = session.email; patch.verified_at = new Date().toISOString(); }
    if (nextStatus === "resolved" || nextStatus === "closed") { patch.resolved_by = session.email; patch.resolved_at = new Date().toISOString(); }
    const updated = await supabase.from("ops_problems").update(patch).eq("id", id).select().single();
    if (updated.error) return NextResponse.json({ ok: false, error: updated.error.message }, { status: 400 });
    await audit(supabase, session, nextStatus, "problem", id, { note: patch.status_note || null });
    after(() => dispatchPush().catch(() => console.error("Push dispatch failed")));
    return NextResponse.json({ ok: true, problem: updated.data });
  }
  if (body.action === "deleteProblem") {
    if (!['super_admin', 'admin'].includes(session.role)) return NextResponse.json({ ok: false, error: "Hanya Super Admin atau Admin Pengelola yang dapat menghapus problem." }, { status: 403 });
    const id = String(body.id || "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return NextResponse.json({ ok: false, error: "Problem tidak valid." }, { status: 400 });
    const photos = await supabase.from("ops_problem_photos").select("storage_path").eq("problem_id", id);
    if (photos.error) return NextResponse.json({ ok: false, error: "Foto laporan belum dapat diperiksa. Silakan coba lagi." }, { status: 400 });
    const paths = (photos.data || []).map((photo: any) => photo.storage_path).filter(Boolean);
    const removed = await supabase.from("ops_problems").delete().eq("id", id).select("id");
    if (removed.error) return NextResponse.json({ ok: false, error: removed.error.message }, { status: 400 });
    if (!removed.data?.length) return NextResponse.json({ ok: false, error: "Laporan tidak ditemukan atau sudah dihapus." }, { status: 404 });
    // Photo records cascade with the report. Only clean legacy bucket files after deletion succeeds.
    const storagePaths = paths.filter((path: string) => !path.startsWith("imagekit:"));
    if (storagePaths.length) {
      try { await supabase.storage.from("ops-problem-photos").remove(storagePaths); }
      catch { console.warn("Problem deleted; legacy photo cleanup needs retry."); }
    }
    await audit(supabase, session, "delete", "problem", id, { photo_count: paths.length });
    return NextResponse.json({ ok: true });
  }
  if (body.action === "profile") {
    const file = multipart?.get("photo");
    const displayName = String(body.displayName || session.email.split("@")[0]).trim();
    let photoPath = (await supabase.from("ops_user_profiles").select("photo_path").eq("email", session.email.toLowerCase()).maybeSingle()).data?.photo_path || null;
    if (file instanceof File && file.size > 0) {
      if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) return NextResponse.json({ ok: false, error: "Foto harus berupa gambar maksimal 5 MB." }, { status: 400 });
      const rawPath = `${session.email.toLowerCase().replace(/[^a-z0-9]/g, "-")}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
      const image = isImageKitConfigured() ? await uploadToImageKit(file, `profiles/${rawPath}`) : null;
      photoPath = image ? `imagekit:${image.path}` : rawPath;
      const uploaded = image ? { error: null } : await supabase.storage.from("ops-profile-photos").upload(photoPath, file, { contentType: file.type });
      if (uploaded.error) return NextResponse.json({ ok: false, error: uploaded.error.message }, { status: 400 });
    }
    const saved = await supabase.from("ops_user_profiles").upsert({ email: session.email.toLowerCase(), display_name: displayName, photo_path: photoPath, updated_at: new Date().toISOString() }).select().single();
    const photoUrl = saved.data?.photo_path ? `/api/ops-desk?type=employee-photo&path=${encodeURIComponent(saved.data.photo_path)}&v=${encodeURIComponent(saved.data.updated_at || Date.now())}` : "";
    return NextResponse.json({ ok: !saved.error, profile: saved.data ? { ...saved.data, photo_url: photoUrl } : null, error: saved.error?.message }, { headers: { "Cache-Control": "no-store" } });
  }
  if (body.action === "resetUserPassword" || body.action === "deleteUser") {
    if (session.role !== "super_admin") return NextResponse.json({ ok: false, error: "Hanya super admin yang dapat mengelola akun." }, { status: 403 });
    const email = String(body.email || "").trim().toLowerCase();
    if (!email || email === SUPER_ADMIN_EMAIL) return NextResponse.json({ ok: false, error: "Akun super admin utama tidak dapat diubah dari sini." }, { status: 400 });
    const listed = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const authUser = listed.data.users.find(user => user.email?.toLowerCase() === email);
    if (!authUser) return NextResponse.json({ ok: false, error: "User Supabase tidak ditemukan." }, { status: 404 });
    if (body.action === "resetUserPassword") {
      const password = String(body.password || "");
      if (password.length < 8) return NextResponse.json({ ok: false, error: "Password minimal 8 karakter." }, { status: 400 });
      const updated = await supabase.auth.admin.updateUserById(authUser.id, { password });
      return NextResponse.json({ ok: !updated.error, error: updated.error?.message });
    }
    const unlinked = await supabase.from("ops_user_employee_links").delete().eq("email", email);
    if (unlinked.error && !["42P01", "PGRST205"].includes(unlinked.error.code)) return NextResponse.json({ ok: false, error: "Pengaitan NIK belum dapat dihapus; akun belum dihapus." }, { status: 503 });
    const removed = await supabase.auth.admin.deleteUser(authUser.id);
    if (removed.error) return NextResponse.json({ ok: false, error: removed.error.message }, { status: 400 });
    const roleRemoved = await supabase.from("ops_users").delete().eq("email", email);
    return NextResponse.json({ ok: !roleRemoved.error, error: roleRemoved.error?.message });
  }
  const photoFiles = multipart ? multipart.getAll("photos").filter((x): x is File => x instanceof File) : [];
  if (body.action === "bulkEmployees") {
    const incoming = (Array.isArray(body.rows) ? body.rows : []).map((row: any) => ({
      nik: String(row.nik || "").trim(), name: String(row.name || "").trim(), position: row.position || "", dept: row.dept || "", hub: row.hub || "", level: row.level || "", superior: row.superior || "", employment: row.employment || (row.active === false ? "Nonaktif" : "Aktif"), active: row.active !== false,
    })).filter((row: any) => row.nik && row.name);
    if (!incoming.length) return NextResponse.json({ ok: false, error: "Tidak ada baris karyawan valid. Pastikan NIK dan nama terisi." }, { status: 400 });
    const merged = incoming;
    const existing = await supabase.from("ops_employees").select("nik").limit(1000);
    if (existing.error) return NextResponse.json({ ok: false, error: existing.error.message }, { status: 500 });
    const incomingNiks = new Set(merged.map((row: any) => row.nik));
    const missingNiks = (existing.data || []).map((row: any) => String(row.nik || "").trim()).filter((nik: string) => nik && !incomingNiks.has(nik));
    let result: any = { error: null };
    for (let i = 0; i < merged.length; i += 100) {
      result = await supabase.from("ops_employees").upsert(merged.slice(i, i + 100), { onConflict: "nik" });
      if (result.error) break;
    }
    if (!result.error) {
      for (let i = 0; i < missingNiks.length; i += 100) {
        result = await supabase.from("ops_employees").update({ active: false, employment: "Nonaktif" }).in("nik", missingNiks.slice(i, i + 100));
        if (result.error) break;
      }
    }
    if (!result.error) await audit(supabase, session, "bulk_upsert", "employee", undefined, { rows: merged.length });
    return NextResponse.json({ ok: !result.error, imported: merged.length, deactivated: missingNiks.length, error: result.error?.message });
  }
  if (body.action === "deleteEmployee") { const result = await supabase.from("ops_employees").delete().eq("nik", body.nik); return NextResponse.json({ ok: !result.error, error: result.error?.message }); }
  if (body.action === "import") {
    const rows = (body.rows || []).map((r: Record<string, string>) => ({ ...r, status: "open", last_seen: new Date().toISOString() }));
    const result = await supabase.from("ops_cases").insert(rows); return NextResponse.json({ ok: !result.error, error: result.error?.message });
  }
  if (body.action === "comment") { const result = await supabase.from("ops_comments").insert({ case_id: body.id, author_name: body.authorName || "Admin OPS", body: body.body }); return NextResponse.json({ ok: !result.error, error: result.error?.message }); }
  if (body.action === "close") { const result = await supabase.from("ops_cases").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", body.id); return NextResponse.json({ ok: !result.error, error: result.error?.message }); }
  const table = body.action === "problem" ? "ops_problems" : ["employee", "updateEmployee"].includes(String(body.action)) ? "ops_employees" : "ops_users";
  const employeePayload = { nik: String(body.nik || "").trim(), name: String(body.name || "").trim(), position: body.position || "", dept: body.dept || "", hub: body.hub || "", level: body.level || "", superior: body.superior || "", employment: body.employment || (body.active === false ? "Nonaktif" : "Aktif"), active: body.active !== false };
  const payload = body.action === "role" ? { email: body.email, role: body.role, leader_name: body.leaderName || null } : body.action === "problem" ? { awb: body.awb, category: body.category, description: body.description, location: body.location, division: body.division, created_by: null, created_by_email: session.email, updated_at: new Date().toISOString() } : body.action === "employee" || body.action === "updateEmployee" ? employeePayload : body;
  const result = body.action === "employee" ? await supabase.from(table).insert(payload) : body.action === "updateEmployee" ? await supabase.from(table).update(payload).eq("nik", body.nik) : body.action === "role" ? await supabase.from(table).upsert(payload, { onConflict: "email" }).select("id").single() : await supabase.from(table).insert(payload).select(body.action === "problem" ? "*" : "id").single();
  if (body.action === "problem" && !result.error && photoFiles.length && result.data?.id) { for (const file of photoFiles) { const rawKey = `problems/${result.data.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`; const image = isImageKitConfigured() ? await uploadToImageKit(file, rawKey) : null; const key = image ? `imagekit:${image.path}` : rawKey; const uploaded = image ? { error: null } : await supabase.storage.from("ops-problem-photos").upload(key, file, { contentType: file.type }); if (!uploaded.error) await supabase.from("ops_problem_photos").insert({ problem_id: result.data.id, storage_path: key, file_name: file.name, content_type: file.type }); } }
  if (body.action === "problem" && !result.error && result.data?.id) await audit(supabase, session, "create", "problem", result.data.id, { photo_count: photoFiles.length, category: body.category });
  const inbox = body.action === "problem" && !result.error && result.data?.id ? await supabase.from("ops_inbox_threads").select("id").eq("entity_type", "problem").eq("entity_id", result.data.id).maybeSingle() : null;
  if (body.action === "problem" && !result.error) after(() => dispatchPush().catch(() => console.error("Problem push dispatch failed")));
  return NextResponse.json({ ok: !result.error, item: body.action === "problem" && result.data ? { ...payload, ...result.data } : undefined, inbox_thread_id: inbox?.data?.id, error: result.error?.message });
}
