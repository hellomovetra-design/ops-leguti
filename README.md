# JNE Ops Insight

Dashboard operasional berbasis Next.js untuk upload, cleaning, lookup master kurir, klasifikasi alamat, analisa inbound/attempt, pivot, dan export report.

## Menjalankan lokal

1. Salin `.env.example` menjadi `.env.local` bila memakai Supabase.
2. Di Windows, klik dua kali `START-DASHBOARD.cmd`. Alternatif melalui PowerShell: `npm.cmd run dev`.
3. Buka `http://localhost:3000` dan masuk memakai kredensial internal yang dikonfigurasi di `.env.local`.

## Keamanan internal

- Halaman dashboard dilindungi autentikasi server-side.
- Sesi memakai cookie HttpOnly, SameSite Strict, dan kedaluwarsa setelah 8 jam.
- Lima kegagalan login dari alamat yang sama akan diblokir selama 15 menit.
- Kredensial internal disimpan sebagai hash PBKDF2 di `.env.local`, bukan password asli.
- Jangan membagikan `.env.local` atau membuka port aplikasi langsung ke internet.
- Secara default server hanya mendengarkan `127.0.0.1`, sehingga tidak dapat dibuka dari perangkat lain.

Schema PostgreSQL tersedia di `supabase/schema.sql` dan sudah mencakup RLS untuk role Admin/Viewer.
