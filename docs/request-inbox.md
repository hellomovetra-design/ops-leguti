# Inbox request dan problem

## Preview lokal

Jalankan `npm run dev` lalu buka `http://127.0.0.1:3000/preview/inbox`.
Halaman ini tersedia hanya pada mode development, memakai data contoh di
localStorage, dan tidak mengirim pesan atau push ke pengguna sebenarnya.

- Tab **Tampilan PWA**: daftar percakapan user, kartu request, nama admin,
  pesan, balasan cepat, dan badge belum dibaca.
- Tab **Panel Admin**: daftar percakapan dan layar konfirmasi dua kolom.
- **Simulasikan request** membuat percakapan baru dari Andi Pratama.
- Balas sebagai Budi Santoso di Panel Admin, kemudian pindah ke Tampilan
  PWA untuk melihat nama penanggap dan balasan. Balasan user terlihat di admin.
- **Reset contoh** mengembalikan data awal.

## Integrasi aplikasi

Menu Inbox terdapat di navigasi PWA dan sidebar admin. Setiap request baru
atau laporan problem membuat satu thread unik secara atomik melalui trigger.
Request yang sudah ada dimasukkan ke riwayat tanpa mengirim push lama.
Request sukses membuka percakapan PWA jika migration sudah terpasang.

Percakapan menyimpan nama akun pada saat pesan dikirim. Identitas diambil
dari NIK/personel atau profil akun di server, tidak dari input browser.
Admin pertama tercatat dengan row lock, sehingga dua balasan bersamaan tidak
mengganti nama penanggap pertama. Semua pesan tetap menampilkan pengirimnya.

Admin/super_admin memakai scope admin untuk melihat Inbox operasional.
Scope user selalu dibatasi ke pemilik request, termasuk bagi admin yang
membuka PWA. Semua tabel/RPC hanya dapat dipakai service_role; API memverifikasi
sesi, scope, kepemilikan, origin, ukuran pesan, dan client id.

Riwayat dibatasi 30 pesan per halaman dan 50 thread per halaman. Pembaruan
badge/percakapan memakai polling 20 detik ketika halaman terlihat, bukan
subscription realtime publik. Pesan dibaca berdasarkan sequence yang benar-benar
ditampilkan, bukan waktu perangkat. Retry pengiriman memakai client id unik.

## Database dan push

Terapkan `supabase/migrations/20261003_request_inbox.sql` pada lingkungan yang
dituju setelah migration login NIK, PWA notifications, dan web push.
Penerapan SQL ini belum dilakukan otomatis oleh pembuatan preview lokal.

Notifikasi PC admin hanya dibuat untuk request/problem baru, bagi akun
ops_users dengan role admin/super_admin. Balasan admin membuat notifikasi PWA
untuk pemilik request. Balasan user memperbarui Inbox, tanpa push PC tambahan.
Klik push membuka thread yang sesuai. Status request tetap mengikuti workflow
yang sudah ada; membalas chat tidak otomatis menyetujui/menyelesaikan request.

Pastikan pengelola/admin terdaftar di ops_users dengan role yang benar.
Siapkan variabel WEB_PUSH dan webhook dispatcher sesuai `docs/web-push.md`.
Tiap PC/HP harus mengaktifkan izin dan mendaftarkan notifikasi perangkat.
Browser/OS menentukan pengiriman ketika ditutup; force-stop atau kebijakan
perangkat dapat mencegah push.

SQL mengubah return shape RPC ops_claim_push_deliveries dengan tambahan
destination. Terapkan migration sebelum menggunakan endpoint Inbox produksi.
Fallback untuk notifikasi status lama tetap menuju tab Notifikasi PWA.
