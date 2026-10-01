# Login NIK dan cakupan Bawaan Kurir

## Aktivasi

1. Terapkan `supabase/migrations/20261001_employee_login.sql` sebelum deployment.
2. Super Admin tetap masuk memakai email dan kata sandi yang sudah ada.
3. Di Administrator, bagian **Login NIK & struktur personel**, pilih personel dari database untuk setiap akun biasa, lalu **Simpan NIK**.
4. Akun biasa masuk memakai nilai `ops_employees.nik` persis, termasuk nol awal, dan kata sandi Supabase Auth yang sudah ada. `tgrid` tidak digunakan sebagai identifier login.

**Penting:** setelah deployment ini, akun biasa tidak dapat login memakai email. Akun belum dikaitkan tidak dapat login NIK. Jangan menghapus akun lama atau mengganti password hanya untuk mengubah identifier login. Email internal tetap digunakan untuk pemilik laporan, foto profil, audit, dan autentikasi Supabase.

Saat membuat akun baru, email tetap diperlukan oleh Supabase Auth. Setelah membuat akun, klik **Muat ulang daftar pengaitan NIK** dan kaitkan personelnya. Super Admin tidak perlu dikaitkan. Satu NIK hanya untuk satu akun. Pengaitan yang berubah meminta konfirmasi.

## Cakupan struktural

- Admin Pengelola dan Super Admin: semua kurir/leader aktif, dibatasi area delivery yang dipilih.
- Akun lain: personel aktif di bawah karyawan terkait, termasuk rantai koordinator → leader → kurir.
- Struktur memakai `superior` yang berisi nama atasan. Nama atasan ganda ditolak, bukan ditebak. Hub yang tidak dikenal tidak dianggap SP MALOKO.
- Form hanya menampilkan personel hasil filter server; POST memvalidasi ulang personel dan area sebelum upload atau penyimpanan.
- Personel terpilih mengisi NIK/ID, jabatan, dan status kepegawaian. Jabatan tetap dapat diedit. PIC memakai nama karyawan akun NIK; Super Admin yang tidak terhubung memakai profil akunnya.
- Riwayat menyimpan snapshot; admin dapat memperbarui pemeriksaan historis dengan personel nonaktif tanpa mengganti identitas atau area.

Hak akses aplikasi tidak otomatis berubah akibat jabatan. Koordinator yang mempunyai role `viewer` tetap role `viewer`. Tidak ada reset akun, password, atau perubahan laporan historis pada migration.

## Verifikasi lokal tanpa data produksi

```powershell
node tests/nik-access.cjs
node tests/courier-scoped-api.cjs
npx tsc --noEmit
npm run build
```

Tes menggunakan database/Auth simulasi. Pemeriksaan UI lokal memakai fixture: input NIK, simpan pengaitan akun, filter area, autofill, dan lebar 320/390/430px.
