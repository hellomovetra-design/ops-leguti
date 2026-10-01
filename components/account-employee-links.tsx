"use client";
import { useEffect, useState } from "react";

type Employee = { nik: string; name: string; position: string; hub: string };
type User = { email: string; role: string };
export function AccountEmployeeLinks() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([fetch("/api/admin/employee-access", { signal: controller.signal }), fetch("/api/ops-desk?type=users", { signal: controller.signal })]).then(async ([a, b]) => {
      const data = await a.json(), accounts = await b.json();
      if (!a.ok || !b.ok || data.error || accounts.error) throw new Error(data.error || accounts.error || "Data akun belum dapat dimuat.");
      setEmployees(data.employees || []);
      setUsers((accounts.items || []).filter((user: User) => user.role !== "super_admin"));
      const mapped = Object.fromEntries((data.links || []).map((link: { email: string; employee_nik: string }) => [link.email, link.employee_nik]));
      setLinks(mapped); setDrafts(mapped);
    }).catch(e => { if (e.name !== "AbortError") setMessage(e.message); });
    return () => controller.abort();
  }, []);
  async function save(email: string) {
    if (busy || !drafts[email]) return;
    if (links[email] && links[email] !== drafts[email] && !window.confirm("Ubah identitas NIK dan cakupan struktural akun ini?")) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/employee-access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, nik: drafts[email] }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Pengaitan belum tersimpan.");
      setLinks(value => ({ ...value, [email]: drafts[email] }));
      setMessage("NIK berhasil dikaitkan. Pengguna login dengan NIK tersebut dan password yang sudah ada.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Server tidak dapat dihubungi."); }
    finally { setBusy(false); }
  }
  return <section className="card role-list-card" aria-label="Pengaitan login NIK">
    <div className="card-head"><div><div className="card-title">Login NIK & struktur personel</div><p className="card-sub">Kaitkan setiap akun biasa ke satu karyawan aktif. Email tetap untuk identitas akun dan laporan; login memakai NIK. Super Admin tetap memakai email.</p></div></div>
    <div style={{ padding: "0 16px 16px" }}><label>Cari personel<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Nama, NIK, jabatan, atau hub" className="login-input" /></label></div>
    {message && <p role="status" style={{ padding: "0 16px" }}>{message}</p>}
    <div className="table-wrap"><table><thead><tr><th>Akun</th><th>Personel / NIK login</th><th>Aksi</th></tr></thead><tbody>{users.map(user => <tr key={user.email}>
      <td>{user.email}<small style={{ display: "block" }}>{links[user.email] ? `NIK login: ${links[user.email]}` : "Belum dikaitkan — belum dapat login NIK"}</small></td>
      <td><select aria-label={`Personel ${user.email}`} disabled={busy} value={drafts[user.email] || ""} onChange={e => setDrafts(value => ({ ...value, [user.email]: e.target.value }))} style={{ maxWidth: "100%", width: 380, padding: 10 }}>
        <option value="">Pilih karyawan aktif</option>{employees.filter(employee => employee.nik === drafts[user.email] || `${employee.name} ${employee.nik} ${employee.position} ${employee.hub}`.toLowerCase().includes(search.trim().toLowerCase())).map(employee => <option key={employee.nik} value={employee.nik}>{employee.nik} · {employee.name} · {employee.position} · {employee.hub}</option>)}
      </select></td><td><button className="table-action" disabled={busy || !drafts[user.email] || drafts[user.email] === links[user.email]} onClick={() => save(user.email)}>Simpan NIK</button></td>
    </tr>)}</tbody></table></div>
  </section>;
}
