import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth-token";

const db = () => getSupabaseServerClient();
const SUPER_ADMIN_EMAIL = (process.env.INTERNAL_SUPER_ADMIN_EMAIL || "ibadnarpatih@gmail.com").trim().toLowerCase();
const HELP_DESK_TO = ["ithelpdesk@jne.co.id", "helpdesk3@jne.co.id", "helpdesk2@jne.co.id", "helpdesk4@jne.co.id", "tgr.itadmin@jne.co.id", "tgr.it@jne.co.id"].join(",");
const HELP_DESK_CC = ["adhitya.nugraha@jne.co.id", "giga.pratama@jne.co.id", "feri.achmad555@gmail.com", "tgr.adm2@jne.co.id"].join(",");
async function getSession(req: NextRequest) {
  return verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value, process.env.INTERNAL_AUTH_SECRET);
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
  if (type === "overview") {
    const [cases, problems, requests] = await Promise.all([supabase.from("ops_cases").select("*").order("last_seen", { ascending: false }), supabase.from("ops_problems").select("id", { count: "exact", head: true }), supabase.from("ops_requests").select("*").order("created_at", { ascending: false })]);
    return NextResponse.json({ items: cases.data || [], problems: problems.count || 0, requests: requests.data || [], requestsError: requests.error?.message });
  }
  const table = type === "employees" ? "ops_employees" : type === "problems" ? "ops_problems" : type === "users" ? "ops_users" : "ops_cases";
  if (type === "requests") {
    const result = await supabase.from("ops_requests").select("*").order("created_at", { ascending: false });
    return NextResponse.json({ items: result.data || [], error: result.error?.message });
  }
  if (type === "users") {
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
    const result = await supabase.from("ops_user_profiles").select("email,display_name,photo_path,updated_at").eq("email", session.email.toLowerCase()).maybeSingle();
    const signed = result.data?.photo_path ? await supabase.storage.from("ops-profile-photos").createSignedUrl(result.data.photo_path, 3600) : null;
    return NextResponse.json({ profile: result.data ? { ...result.data, photo_url: signed?.data?.signedUrl || "" } : { email: session.email, display_name: "", photo_url: "" }, error: result.error?.message });
  }
  let query = supabase.from(table).select("*").order("created_at", { ascending: false });
  if (q) query = table === "ops_employees" ? query.or(`name.ilike.%${q}%,nik.ilike.%${q}%`) : table === "ops_problems" ? query.or(`awb.ilike.%${q}%,category.ilike.%${q}%`) : query.or(`awb.ilike.%${q}%,leader.ilike.%${q}%,zone.ilike.%${q}%`);
  const result = await query; return NextResponse.json({ items: result.data || [], error: result.error?.message });
}
export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session || !["super_admin", "admin", "coordinator", "spv", "jr_spv", "viewer"].includes(session.role)) return NextResponse.json({ ok: false, error: "Akses administrator diperlukan." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  const supabase = db(); if (!supabase) return NextResponse.json({ ok: false, preview: true, error: "Mode preview: Supabase belum dikonfigurasi" }, { status: 200 });
  const isMultipart = req.headers.get("content-type")?.includes("multipart/form-data");
  const multipart = isMultipart ? await req.formData() : null;
  const body = multipart ? Object.fromEntries(multipart.entries()) : await req.json();
  const pwaWriteActions = ["createRequest", "problem", "profile", "comment"];
  if (session.role === "viewer" && !pwaWriteActions.includes(String(body.action))) return NextResponse.json({ ok: false, error: "Staff Biasa hanya dapat melihat data di dashboard. Input transaksi dilakukan melalui PWA." }, { status: 403 });
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
    if (isCl3 && !String(body.shipmentNumbers || "").trim()) return NextResponse.json({ ok: false, error: "Minimal satu nomor shipment wajib diisi." }, { status: 400 });
    if (!isCl3 && (!name || !nik || !userId || !String(body.reason || "").trim())) return NextResponse.json({ ok: false, error: "User ID, nama, NIK, dan alasan wajib diisi." }, { status: 400 });
    const subject = isCl3 ? "Request Open Status Shipment CL3 | CLOSE BY SYSTEM (ORIGIN)" : "Request Aktivasi User TGR - " + userId;
    const shipments = String(body.shipmentNumbers || "").split(/\r?\n|,/).map(x => x.trim()).filter(Boolean).join("\n");
    const emailBody = isCl3
      ? "Dear Team IT\n\nMohon di bantu Open Status Shipment CL3  | CLOSE BY SYSTEM (ORIGIN)\nDikarenakan shipment sudah berada di destinasi\n\n" + shipments + "\n\n--\nTerima kasih , Barakallahu Fiikum"
      : "Dear Team IT JNE TGR\n\nMohon dibantu pengaktifan kembali User ID TGR\n\nUser ID              : " + userId + "\nNama Karyawan       : " + name + "\nNIK Karyawan        : " + nik + "\nDepartemen          : " + String(body.department || "") + "\nLokasi Kerja        : " + String(body.location || "") + "\nAlasan              : " + String(body.reason || "");
    const result = await supabase.from("ops_requests").insert({ type: body.type || "activation_user", status: "pending", user_id: userId, name, nik, department: body.department, location: body.location, reason: body.reason, email_subject: subject, email_body: emailBody }).select().single();
    return NextResponse.json({ ok: !result.error, id: result.data?.id, emailSubject: subject, emailBody, error: result.error?.message });
  }
  if (body.action === "approveRequest") {
    if (!['super_admin', 'admin'].includes(session.role)) return NextResponse.json({ ok: false, error: "Hanya Super Admin atau Admin Pengelola yang dapat memproses request." }, { status: 403 });
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ ok: false, error: "Request tidak valid." }, { status: 400 });
    const current = await supabase.from("ops_requests").select("*").eq("id", id).single();
    if (current.error || !current.data) return NextResponse.json({ ok: false, error: current.error?.message || "Request tidak ditemukan." }, { status: 404 });
    const updated = await supabase.from("ops_requests").update({ status: "approved", approved_by: session.email, approved_at: new Date().toISOString() }).eq("id", id).select().single();
    if (updated.error) return NextResponse.json({ ok: false, error: updated.error.message }, { status: 400 });
    return NextResponse.json({ ok: true, request: updated.data, mail: { to: HELP_DESK_TO, cc: HELP_DESK_CC, subject: current.data.email_subject || "Request Helpdesk OPS LEGUTI", body: current.data.email_body || "" } });
  }
  if (body.action === "profile") {
    const file = multipart?.get("photo");
    const displayName = String(body.displayName || session.email.split("@")[0]).trim();
    let photoPath = (await supabase.from("ops_user_profiles").select("photo_path").eq("email", session.email.toLowerCase()).maybeSingle()).data?.photo_path || null;
    if (file instanceof File && file.size > 0) {
      if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) return NextResponse.json({ ok: false, error: "Foto harus berupa gambar maksimal 5 MB." }, { status: 400 });
      photoPath = `${session.email.toLowerCase().replace(/[^a-z0-9]/g, "-")}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
      const uploaded = await supabase.storage.from("ops-profile-photos").upload(photoPath, file, { contentType: file.type });
      if (uploaded.error) return NextResponse.json({ ok: false, error: uploaded.error.message }, { status: 400 });
    }
    const saved = await supabase.from("ops_user_profiles").upsert({ email: session.email.toLowerCase(), display_name: displayName, photo_path: photoPath, updated_at: new Date().toISOString() }).select().single();
    return NextResponse.json({ ok: !saved.error, profile: saved.data, error: saved.error?.message });
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
    const removed = await supabase.auth.admin.deleteUser(authUser.id);
    if (removed.error) return NextResponse.json({ ok: false, error: removed.error.message }, { status: 400 });
    const roleRemoved = await supabase.from("ops_users").delete().eq("email", email);
    return NextResponse.json({ ok: !roleRemoved.error, error: roleRemoved.error?.message });
  }
  const photoFiles = multipart ? multipart.getAll("photos").filter((x): x is File => x instanceof File) : [];
  if (body.action === "bulkEmployees") { const result = await supabase.from("ops_employees").upsert(body.rows || [], { onConflict: "nik" }); return NextResponse.json({ ok: !result.error, error: result.error?.message }); }
  if (body.action === "deleteEmployee") { const result = await supabase.from("ops_employees").delete().eq("nik", body.nik); return NextResponse.json({ ok: !result.error, error: result.error?.message }); }
  if (body.action === "import") {
    const rows = (body.rows || []).map((r: Record<string, string>) => ({ ...r, status: "open", last_seen: new Date().toISOString() }));
    const result = await supabase.from("ops_cases").insert(rows); return NextResponse.json({ ok: !result.error, error: result.error?.message });
  }
  if (body.action === "comment") { const result = await supabase.from("ops_comments").insert({ case_id: body.id, author_name: body.authorName || "Admin OPS", body: body.body }); return NextResponse.json({ ok: !result.error, error: result.error?.message }); }
  if (body.action === "close") { const result = await supabase.from("ops_cases").update({ status: "closed", closed_at: new Date().toISOString() }).eq("id", body.id); return NextResponse.json({ ok: !result.error, error: result.error?.message }); }
  const table = body.action === "problem" ? "ops_problems" : body.action === "employee" ? "ops_employees" : "ops_users";
  const payload = body.action === "role" ? { email: body.email, role: body.role, leader_name: body.leaderName || null } : body.action === "problem" ? { awb: body.awb, category: body.category, description: body.description, location: body.location, division: body.division } : body;
  const result = body.action === "employee" ? await supabase.from(table).insert(payload) : body.action === "updateEmployee" ? await supabase.from(table).update(payload).eq("nik", body.nik) : body.action === "role" ? await supabase.from(table).upsert(payload, { onConflict: "email" }).select("id").single() : await supabase.from(table).insert(payload).select("id").single();
  if (body.action === "problem" && !result.error && photoFiles.length && result.data?.id) { for (const file of photoFiles) { const key = `problems/${result.data.id}/${crypto.randomUUID()}-${file.name}`; const uploaded = await supabase.storage.from("ops-problem-photos").upload(key, file, { contentType: file.type }); if (!uploaded.error) await supabase.from("ops_problem_photos").insert({ problem_id: result.data.id, storage_path: key, file_name: file.name, content_type: file.type }); } }
  return NextResponse.json({ ok: !result.error, error: result.error?.message });
}
