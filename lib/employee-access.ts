import { getSupabaseServerClient } from "@/lib/supabase";
import { SessionPayload } from "@/lib/auth-token";
import { Courier, courierRole } from "@/lib/courier-checks";

export type TeamEmployee = Courier & { superior: string; superior_nik?: string | null; active: boolean };
const normalized = (value: string | null | undefined) => (value || "").trim().replace(/\s+/g, " ").toLowerCase();
export function structuralCouriers(rows: TeamEmployee[], nik: string, unrestricted = false) {
  const eligible = (row: TeamEmployee) => row.active && (courierRole(row.position) || /\bleader\b/i.test(row.position));
  if (unrestricted) return rows.filter(eligible);
  const owner = rows.find(row => row.nik === nik && row.active);
  if (!owner) throw new Error("Akun belum dikaitkan dengan karyawan aktif. Hubungi Super Admin.");
  const names = new Map<string, TeamEmployee[]>();
  rows.forEach(row => { const name = normalized(row.name); names.set(name, [...(names.get(name) || []), row]); });
  const descendants = new Set<string>();
  const pending = [owner];
  const visited = new Set<string>();
  while (pending.length) {
    const parent = pending.pop()!;
    if (visited.has(parent.nik)) continue;
    visited.add(parent.nik);
    // Legacy name links fail closed when ambiguous; NIK links remain unambiguous.
    if (names.get(normalized(parent.name))?.length !== 1 && rows.some(row => !row.superior_nik && normalized(row.superior) === normalized(parent.name))) throw new Error("Nama atasan ganda di struktur. Administrator perlu memperbaiki struktur terlebih dahulu.");
    for (const row of rows) {
      if ((row.superior_nik ? row.superior_nik !== parent.nik : normalized(row.superior) !== normalized(parent.name)) || row.nik === owner.nik) continue;
      descendants.add(row.nik);
      pending.push(row);
    }
  }
  return rows.filter(row => descendants.has(row.nik) && eligible(row));
}
export async function linkedEmployee(db: NonNullable<ReturnType<typeof getSupabaseServerClient>>, email: string) {
  const link = await db.from("ops_user_employee_links").select("employee_nik").eq("email", email.toLowerCase()).maybeSingle();
  if (link.error) throw new Error("Pengaitan NIK belum tersedia. Terapkan migration login NIK terlebih dahulu.");
  if (!link.data) return null;
  const employee = await db.from("ops_employees").select("nik,name,position,employment,hub,superior,active").eq("nik", link.data.employee_nik).maybeSingle();
  if (employee.error) throw new Error("Data personel belum dapat dimuat.");
  return employee.data as TeamEmployee | null;
}
export async function scopedCouriers(db: NonNullable<ReturnType<typeof getSupabaseServerClient>>, session: SessionPayload) {
  const rows: TeamEmployee[] = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await db.from("ops_employees").select("nik,name,position,employment,hub,superior,superior_nik,active").order("nik").range(offset, offset + 999);
    if (result.error) throw new Error("Data kurir belum dapat dimuat.");
    rows.push(...(result.data as TeamEmployee[] || []));
    if ((result.data || []).length < 1000) break;
  }
  const unrestricted = ["admin", "super_admin"].includes(session.role);
  const owner = unrestricted ? null : await linkedEmployee(db, session.email);
  return structuralCouriers(rows, owner?.nik || "", unrestricted);
}
