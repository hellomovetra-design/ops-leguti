import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth-token";

const db = () => getSupabaseServerClient();
const SUPER_ADMIN_EMAIL = (process.env.INTERNAL_SUPER_ADMIN_EMAIL || "ibadnarpatih@gmail.com").trim().toLowerCase();
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
    const [cases, problems] = await Promise.all([supabase.from("ops_cases").select("*").order("last_seen", { ascending: false }), supabase.from("ops_problems").select("id", { count: "exact", head: true })]);
    return NextResponse.json({ items: cases.data || [], problems: problems.count || 0 });
  }
  const table = type === "employees" ? "ops_employees" : type === "problems" ? "ops_problems" : type === "users" ? "ops_users" : "ops_cases";
  let query = supabase.from(table).select("*").order("created_at", { ascending: false });
  if (q) query = table === "ops_employees" ? query.or(`name.ilike.%${q}%,nik.ilike.%${q}%`) : table === "ops_problems" ? query.or(`awb.ilike.%${q}%,category.ilike.%${q}%`) : query.or(`awb.ilike.%${q}%,leader.ilike.%${q}%,zone.ilike.%${q}%`);
  const result = await query; return NextResponse.json({ items: result.data || [], error: result.error?.message });
}
export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session || !["super_admin", "admin", "spv", "jr_spv"].includes(session.role)) return NextResponse.json({ ok: false, error: "Akses administrator diperlukan." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  const supabase = db(); if (!supabase) return NextResponse.json({ ok: false, preview: true, error: "Mode preview: Supabase belum dikonfigurasi" }, { status: 200 });
  const isMultipart = req.headers.get("content-type")?.includes("multipart/form-data");
  const multipart = isMultipart ? await req.formData() : null;
  const body = multipart ? Object.fromEntries(multipart.entries()) : await req.json();
  if (body.action === "role" && session.role !== "super_admin") return NextResponse.json({ ok: false, error: "Hanya super admin yang dapat membuat role." }, { status: 403 });
  if (body.action === "role" && !["pending", "leader", "admin", "spv", "jr_spv"].includes(String(body.role))) return NextResponse.json({ ok: false, error: "Jenis role tidak valid." }, { status: 400 });
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
  const result = body.action === "employee" ? await supabase.from(table).insert(payload) : body.action === "updateEmployee" ? await supabase.from(table).update(payload).eq("nik", body.nik) : await supabase.from(table).insert(payload).select("id").single();
  if (body.action === "problem" && !result.error && photoFiles.length && result.data?.id) { for (const file of photoFiles) { const key = `problems/${result.data.id}/${crypto.randomUUID()}-${file.name}`; await supabase.storage.from("ops-problem-photos").upload(key, file, { contentType: file.type }); } }
  return NextResponse.json({ ok: !result.error, error: result.error?.message });
}
