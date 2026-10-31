# Google Authenticator untuk dashboard

Implementasi 31 Oktober 2026. TOTP memakai Supabase Auth MFA, kompatibel Google Authenticator. Tidak ada layanan QR pihak ketiga atau penyimpanan kunci TOTP pada tabel aplikasi.

## Aktivasi produksi

1. Jalankan `supabase/migrations/20261031_dashboard_mfa.sql` sebelum deploy. Migration membuat challenge privat dan menutup akses langsung `anon`/`authenticated` ke tabel serta fungsi `public.ops_*`. Aplikasi sudah memakai API server/service role untuk akses operasional; grant service role yang lama, termasuk audit append-only, dipertahankan. Tidak mengubah schema Auth atau storage dan tidak menghapus data operasional.
2. Pada Supabase Authentication / MFA, pastikan **TOTP enrollment** dan **TOTP verification** aktif. Browser Supabase produksi sudah diperiksa: TOTP Enabled, maksimum faktor per pengguna 10, pembatasan AAL1 15 menit aktif. Tidak ada toggle diubah saat audit.
3. Pastikan `INTERNAL_AUTH_SECRET` minimal 32 karakter dan `SUPABASE_SERVICE_ROLE_KEY` ada di Production. Tidak ada secret baru atau akun Gmail baru yang diperlukan. Secret existing tidak dicetak/disalin dalam audit ini.
4. Deploy kode berikut patch dependensi. Sesi dashboard lama tanpa MFA akan ditolak dan meminta login ulang. Staf `viewer` tetap login biasa untuk PWA. Semua akun yang memiliki akses dashboard wajib MFA, termasuk saat akun tersebut membuka PWA.
5. Login dengan password. Jika belum terpasang, pindai QR dengan Google Authenticator atau masukkan kunci manual sebagai akun berbasis waktu. Masukkan enam angka untuk menyelesaikan pemasangan/login. Jika sudah terpasang, hanya layar kode yang muncul.
6. Tes oleh pemilik akun di perangkatnya sendiri. Jangan kirim QR, kunci setup, kode OTP, atau password ke chat/grup. Tidak ada faktor produksi didaftarkan saat pengujian otomatis.

## Pengamanan alur

- Password benar belum menghasilkan sesi dashboard. Token Supabase sementara disimpan hanya dalam cookie HttpOnly, Secure di Production, SameSite Strict, AES-GCM terenkripsi dan berakhir 10 menit.
- Backend memilih faktor milik pengguna dari Supabase, tidak menerima factor ID dari browser. Faktor terverifikasi tidak diganti. Faktor TOTP setup lama yang belum diverifikasi dibersihkan oleh akun pemilik sebelum pemasangan ulang.
- Session baru dibuat hanya setelah Supabase menyatakan AAL2 dan nonce berhasil dikonsumsi sekali di PostgreSQL. Respons gagal/QR setup tidak menerbitkan sesi dashboard.
- Lima percobaan per challenge; maksimal sepuluh per akun pada window 15 menit sejak percobaan terakhir. Hitungan PostgreSQL memakai lock, tidak hilang saat serverless berganti instance atau login password diulang. Challenge lama lebih dari sehari dibersihkan saat verifikasi digunakan.
- Pemeriksa sesi pusat menolak role dashboard tanpa bukti MFA, termasuk cookie lama atau akun viewer yang baru dipromosikan. Role tetap diperiksa langsung dari database. Bukti MFA berlaku maksimal 30 hari; renewal cookie tidak memperpanjang umur bukti ini. Logout meminta password+OTP kembali.
- Endpoint login/MFA/logout memeriksa Origin. QR dan respons auth `no-store`. Token/OTP tidak disimpan di localStorage. Pemulihan/reset faktor tidak memiliki bypass khusus superadmin.

## Jika HP hilang atau setup gagal

Pilih Kembali ke login atau mulai ulang login jika sesi/QR kedaluwarsa. Kode memakai jam HP otomatis. Jika faktor sudah terverifikasi dan HP tidak tersedia, pemilik harus menghubungi pengelola Supabase yang tepercaya. Setelah identitas diverifikasi melalui prosedur perusahaan, reset faktor akun yang benar di Supabase Auth dan login ulang untuk memasang lagi. Jangan menghapus semua faktor atau menurunkan role sebagai jalan pintas. Belum ada fitur kode pemulihan/self-service reset atau daftar perangkat di aplikasi.

## Pemeriksaan yang sudah dilakukan

- Tes endpoint dengan mock Supabase: password-only/QR tidak memberi sesi, kode salah ditolak, AAL1 ditolak, AAL2 diterima, nonce tidak dapat dipakai ulang, peran terkini digunakan, CSRF dan batas percobaan.
- Tes PostgreSQL lokal: RLS, izin RPC service-only, retry lintas challenge, dan migration dijalankan ulang.
- Tes sesi/role dan akses: pemisahan PWA-dashboard, penolakan akses karyawan anonim/viewer, perubahan role, login NIK/email, cookie, logout, dan ekspor Excel.
- Pemeriksaan baca-saja produksi: HTTPS `/login` HTTP 200, CSP/X-Frame-Options/HSTS tersedia. Sampel query anonim `ops_employees` dan `ops_users` menghasilkan nol baris; `ops_employee_sanctions` ditolak izin. Query metadata baca-saja tambahan di console menunjukkan 0 tabel ops tanpa RLS dan 0 policy ops untuk public/anon/authenticated. Tiga fungsi security definer yang masih executable oleh browser adalah trigger: ops_employee_hierarchy_link, ops_courier_leader_link, ops_courier_sync_hierarchy. Fungsi return trigger tidak bisa dipanggil sebagai RPC biasa; ini temuan penguatan izin, bukan bukti kebocoran. SQL aktivasi mencabut izin yang tidak diperlukan. Tabel laporan legacy yang diuji tidak ditemukan.
- Patch dependensi: Next.js 15.5.28, Sharp 0.35.5, PostCSS 8.5.32 dan SheetJS 0.20.3 dari distribusi resmi. `npm audit` setelah patch melaporkan nol kerentanan; lockfile mengunci integrity paket. Upgrade mayor framework tidak dilakukan.

## Batas pemeriksaan

Ini pemeriksaan source, uji regresi, audit paket, dan beberapa probe baca-saja; bukan penetration test/certifikasi keamanan. Konfigurasi TOTP dan ringkasan metadata RLS telah diperiksa, tetapi belum ada penilaian menyeluruh untuk seluruh schema/storage, log insiden, perlindungan deployment lama, visibilitas riwayat Git, atau faktor Google Authenticator pemilik secara live. Password throttling tambahan aplikasi masih per-instance (Supabase juga punya throttling); limit OTP sudah persisten. Sesi aplikasi belum memiliki daftar perangkat atau pencabutan semua sesi otomatis pada reset password; pencabutan role berlaku langsung. Link evidence publik memang sengaja bisa dibuka pemegang link, terpisah dari data privat.
