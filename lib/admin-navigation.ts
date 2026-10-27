export const ADMIN_MENUS = [
  { href: "/master/employees", label: "Data Karyawan", description: "Tambah dan edit karyawan, identitas, kontak, status, serta alihkan tim." },
  { href: "/master/couriers", label: "Master Kurir", description: "Kelola TGR ID, penempatan kurir, impor massal, dan unduhan database." },
  { href: "/master/personnel-changes", label: "Perubahan Personel", description: "Telusuri riwayat perubahan data dan perpindahan personel." },
  { href: "/settings/ops-access/users", label: "Akses Pengguna", description: "Kelola akun, role, pengaitan NIK, dan akses aplikasi." },
] as const;
export function inAdministrator(path: string) {
  return path === "/settings/ops-access" || path.startsWith("/settings/ops-access/") || ADMIN_MENUS.some(item => path === item.href || path.startsWith(item.href + "/"));
}
