# Form Coaching dan penyelesaian dokumen

## Aktivasi

1. Jalankan `supabase/migrations/20261030_coaching_workflow.sql`, lalu `supabase/migrations/20261030_sanction_application_form.sql` setelah migration Sanksi dan bukti foto sebelumnya. Versi gabungan tersedia di `.tmp/coaching-sanction-workflow.sql`.
2. Deploy aplikasi. ImageKit tetap memakai konfigurasi Production yang sudah terpasang.
3. Catatan lama tetap dapat dibaca. Jika form tambahan belum lengkap, admin perlu melengkapinya lewat Edit sebelum unduh/cetak/kirim HRD. Tidak ada tanda tangan, isi form, atau status final yang dibuat otomatis dari data historis.

## Form

Referensi dibaca dari sheet **Form Coaching** pada `Form Coaching & Counseling.xlsx` yang dilampirkan user. Sheet **Form Counseling** belum diaktifkan sebagai jenis layanan baru karena permintaan hanya coaching.

Identitas karyawan berdasarkan NIK, jabatan/hub dan atasan tetap dari database. Nama pemberi coaching merupakan snapshot nama karyawan yang terhubung dengan akun login. Email tidak dipakai sebagai nama di dokumen. Akun yang belum dikaitkan dengan karyawan harus dikaitkan terlebih dahulu.

Tambahan form: waktu WIB, durasi 1–480 menit, kendala kinerja, target, tantangan, rencana aksi, summary, agreement dari coachee, serta dukungan opsional. Agreement dapat dibiarkan kosong untuk ditulis coachee pada hasil cetak. Keterangan dan hasil coaching lama menggunakan kendala dan summary sebagai ringkasan agar tidak ada dua isian yang saling bertentangan.

Setiap isian naratif maksimal 4.000 karakter. Bukti kegiatan/dokumen awal tetap 1–3 foto privat. Form Word A4 dan halaman cetak mencakup semua isian dan ruang tanda tangan karyawan, Leader/Koordinator, dan HRD. Isi panjang dapat melanjutkan ke halaman berikutnya tanpa dipotong.

## Tahapan

Revisi alur: jalankan `supabase/migrations/20261030_sanction_signed_completion.sql` setelah dua migration 20261030 sebelumnya.

- **Menunggu tanda tangan:** unduh/cetak, isi dan minta tanda tangan pada dokumen.
- **Unggah hasil TTD:** langsung tersedia di dashboard dan arsip milik sendiri pada PWA. Unggah satu PDF/foto maksimal 3 MB dan konfirmasi tanda tangan lengkap sesuai form. Tidak perlu tahap Kirim ke HRD.
- **Selesai:** file bertanda tangan disimpan privat, catatan dan dokumen dikunci. `signed_complete` merekam konfirmasi kelengkapan, tanpa mengarang konfirmasi HRD atau waktu pengiriman HRD.

Status `sent_hrd` historis tetap dibaca dan dapat diselesaikan dengan unggah yang sama. Endpoint lama tetap kompatibel. Form lama yang belum memiliki coaching_details perlu dilengkapi melalui Edit agar Word/cetak dapat dibuat; unggah dokumen lengkap bertanda tangan tetap diperbolehkan tanpa mengarang data form lama.

Admin/SPV dapat mengelola seluruh catatan di dashboard. Pemberi coaching dapat menindaklanjuti **hanya catatan buatannya sendiri** lewat **Dokumen dan scan final saya** di PWA. Daftar ini dimuat saat dibuka dengan pagination 10 baris, tanpa polling global atau pemuatan saat menu belum dibuka. Pencatatan coaching baru tetap mengikuti aturan jabatan; akses arsip milik sendiri tidak berubah menjadi akses dashboard.

Semua akses Word, cetak, dan scan memeriksa sesi + kepemilikan/peran. Scan disimpan privat di ImageKit dan diunduh melalui proxy aplikasi. Tidak ada link publik atau path rahasia di daftar. Dokumen Word tidak memuat email, kunci, URL privat, atau tanda tangan palsu.

Mutation memakai versi `updated_at` dan UUID operasi. Pengiriman ulang operasi yang sama setelah respons hilang tidak membuat scan baru. Konflik update membatalkan pemakaian upload yang kalah. Audit mencatat sebelum/sesudah setiap tahap, metadata file, pelaku, dan waktunya. Penguncian tahap juga diterapkan di PostgreSQL, bukan hanya tombol UI.

## Template ST / SP / GA

Referensi `Form Pemberian Sanksi untuk Karyawan.pdf` digunakan untuk ST/SP1/SP2/SP3/GA. Unduhan berupa Word asli (.docx), bukan PDF yang diubah ekstensi. Logo JNE diambil dari gambar yang tertanam dalam PDF referensi dan disertakan pada build server.

Form mencakup identitas, departemen, status kepegawaian, tanggal kontrak/tetap opsional, pilihan jenis pelanggaran, alasan, lokasi/tanggal, nama dua atasan terkait, catatan HCO, lima tempat tanda tangan, dan panduan pengajuan sesuai referensi. Departemen/status diambil server dari data karyawan. Tanggal kontrak tidak disamakan otomatis dengan tanggal masuk. Nama pemberi memakai data karyawan yang terhubung ke akun. Nama atasan terkait dapat diisi atau dibiarkan kosong untuk dilengkapi saat cetak. Catatan HCO hanya dapat diisi pengelola dashboard.

GA ditulis **Perjanjian Bersama (GA)** sesuai penjelasan user. Tidak ada keputusan PHK atau klausul perjanjian yang dibuat otomatis. Form ini merupakan formulir permintaan pemberian sanksi, bukan keputusan HRD otomatis.

Sebelum dikirim ke HRD, jenis sanksi memerlukan konfirmasi tanda tangan karyawan, pengaju, Atasan Terkait 1 dan 2. Konfirmasi HRD dan scan lengkap diwajibkan saat finalisasi. Pemberi melalui PWA dapat mengunggah final hanya untuk catatan miliknya sendiri; pengelola dashboard dapat mengelola seluruh catatan. Dokumen dan bukti tetap privat.

## Validasi

- `tests/coaching-workflow.cjs`: isian wajib, waktu/durasi, tahapan, versi, dan validasi PDF/foto.
- `tests/coaching-workflow-api.cjs`: kepemilikan PWA/admin, akses silang ditolak, download privat, tahapan tanda tangan, scan final, retry aman, dan konflik.
- `tests/employee-sanctions-db.cjs`: migration ulang, privasi, audit, syarat foto, transisi, dan final lock.
- Regresi API/SSR/kompresi foto dan TypeScript.
- Contoh Word data sintetis dirender memakai Microsoft Word lokal (renderer LibreOffice tidak tersedia), diekspor ke PDF A4 dan diperiksa visual. Contoh isian standar satu halaman; data panjang tidak dibatasi satu halaman.

Tidak ada catatan HR produksi dibuat atau diubah saat pengujian.
