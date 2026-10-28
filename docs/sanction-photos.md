# Bukti Coaching / Sanksi

Jalankan `supabase/migrations/20261028_sanction_photos.sql`, kemudian deploy aplikasi.

- PWA dan dashboard memakai form yang sama: minimal satu, maksimal tiga foto JPG/PNG/WebP. Bukti tertulis diunggah sebagai foto dokumen.
- Kamera dan galeri terpisah. Kompresi dilakukan berurutan di HP menjadi JPEG maksimal 900 KB per foto, total unggahan maksimal 3 MB. Ada preview, hapus foto baru sebelum kirim, progres unggah, serta konfirmasi sukses/gagal. Isian/foto dipertahankan saat gagal.
- Foto disimpan privat di ImageKit. Tidak ada fallback publik atau public evidence share. URL aplikasi memeriksa sesi dan lingkup: pengelola berwenang melalui scope admin; pengguna PWA hanya catatan miliknya sendiri. Path/fileId ImageKit tidak dikirim ke browser.
- Metadata disimpan pada kolom JSONB `photos` dan ikut audit history. Bukti lama tidak dihapus saat edit; foto baru dapat ditambahkan sampai total tiga. Catatan lama tanpa bukti tetap bisa dibaca, tetapi saat diedit wajib dilengkapi minimal satu foto.
- UUID catatan tetap saat retry create: respons hilang tidak membuat catatan/foto ganda setelah server mengonfirmasi record yang sama. Edit memakai optimistic version. Upload yang gagal di tengah dibersihkan; jika hasil penulisan database tidak pasti, aset tidak dihapus agar bukti dari catatan yang mungkin sudah tersimpan tetap utuh.
- Validasi jumlah, total ukuran, MIME dan signature JPG/PNG/WebP dilakukan kembali di server. Database menolak jumlah kosong pada insert/update dan array lebih dari tiga.

Validasi: `tests/sanction-photos.cjs`, `tests/employee-sanctions-api.cjs`, `tests/employee-sanctions-db.cjs`, `tests/sanctions-pwa-form.cjs`, dan regresi kompresi `tests/courier-photo.cjs`. Semua memakai mock atau PostgreSQL lokal, tanpa menulis catatan sanksi produksi.
