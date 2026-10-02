# Notifikasi perangkat OPS LEGUTI

Notifikasi dalam aplikasi tetap tersimpan di `ops_notifications`. Web Push adalah kanal tambahan; hanya status umum yang dikirim ke layar kunci, bukan email/AWB/isi laporan.

## Aktivasi

1. Terapkan `supabase/migrations/20261002_web_push.sql` setelah migration notifikasi.
2. Generate pasangan kunci sekali: `npx web-push generate-vapid-keys`. Simpan private key hanya sebagai environment variable server, jangan commit atau kirim melalui chat.
3. Tambahkan `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT=https://ops-leguti.vercel.app` di project Vercel OPS LEGUTI. Gunakan pasangan yang sama pada setiap deployment. Mengganti pasangan memerlukan pendaftaran ulang perangkat.
4. Generate secret acak minimal 32 byte untuk `WEB_PUSH_DISPATCH_SECRET`. Pasang database webhook INSERT pada `public.ops_notifications`, tujuan `https://ops-leguti.vercel.app/api/push/dispatch`, header `Authorization: Bearer <secret>` (gunakan secret yang sama).
5. Untuk retry yang terjadwal, panggil endpoint POST tersebut setiap menit melalui scheduler yang disetujui pengelola. Tanpa scheduler, retry terjadi pada perubahan status berikutnya atau pemanggilan webhook berikutnya. Webhook menerima perubahan dari SQL/integrasi lain; perubahan dari API admin langsung memicu pengiriman setelah response melalui Next `after()`.
6. Deploy, buka PWA → Notifikasi → Aktifkan notifikasi perangkat, lalu izinkan di HP. Pada iOS/iPadOS 16.4+, instal ke Layar Utama dan buka dari sana terlebih dahulu.

## Verifikasi perangkat nyata

- Login sebagai pengaju pada HP dan aktifkan notifikasi.
- Tutup PWA; admin konfirmasi request pengaju. Periksa notifikasi OS.
- Ketuk notifikasi: buka halaman Notifikasi PWA (login diperlukan jika sesi habis).
- Logout menonaktifkan subscription HP itu. Akun lain tidak boleh menerima notifikasi akun sebelumnya.
- Uji deny permission, koneksi offline, unsubscribe, endpoint 404/410, dan dua perangkat untuk satu akun.
- Worker tidak menyimpan cache halaman/API pribadi. Notifikasi push tetap bergantung pada izin OS, dukungan browser, internet, dan pembatasan baterai; menutup paksa browser/menonaktifkan notifikasi OS dapat mencegah pengiriman.

## Keandalan dan keamanan

Queue privat dibuat secara transaksional bersama notifikasi. Claim memakai `FOR UPDATE SKIP LOCKED` dan lease 5 menit; maksimal 5 usaha, retry exponential, batas usia 24 jam. Penerimaan oleh layanan push bukan jaminan ditampilkan OS. Crash antara send dan receipt bisa mengulang send; notification tag menggunakan ID yang sama untuk menggantikan notifikasi tersebut.

Subscription, queue dan RPC tidak dapat diakses role anon/authenticated. API memakai sesi server dan origin check, endpoint provider dibatasi. Semua secret hanya server-side. Endpoint dispatcher memakai bearer secret, bukan endpoint broadcast publik.
