# Update massal karyawan

Perbaikan insiden 28 Oktober 2026. Upload 84 baris pada 10:55 WIB menjalankan alur penggantian seluruh database: 221 karyawan aktif yang tidak tercantum pada file diubah menjadi Nonaktif. Pemeriksaan read-only menemukan 84 aktif dan 231 Nonaktif (315 data). Sebanyak 10 Nonaktif lainnya bukan bagian pemulihan ini.

## Aktivasi

1. Jalankan `supabase/repairs/20261028_recover_bulk_deactivation.sql` di SQL Editor Supabase. SQL memeriksa audit upload, tiga transaksi, snapshot lama/baru, status-only changes, dan tidak adanya edit berikutnya. Harus tepat 221 kandidat; bila tidak, seluruh pemulihan dibatalkan untuk audit ulang. Sesudah pemulihan, bila tidak ada perubahan lain, hasilnya 305 aktif dan 10 tidak aktif. Status semula, termasuk PKWT/PKWTT, dikembalikan dari riwayat, bukan dipukul rata Aktif.
2. Jalankan `supabase/migrations/20261028_employee_bulk_merge.sql`.
3. Deploy kode aplikasi sebelum mengizinkan upload massal berikutnya. SQL baru saja tidak menghentikan jalur upsert lama yang masih ter-deploy.

## Perilaku baru

- NIK adalah identitas penggabungan. Karyawan yang tidak ada dalam file tetap utuh.
- Kolom nama, jabatan, departemen, hub, level, dan atasan yang terisi memperbarui data terkait saja. Kolom kosong mempertahankan nilai tersimpan.
- Status aktif/nonaktif/resign, jenis kepegawaian, TGR, kontak, dan foto karyawan lama tidak ditimpa upload struktural. Perubahan status tetap lewat edit karyawan.
- NIK baru membuat satu data baru aktif. NIK ganda/missing ditolak; data yang sama dilewati.
- Atasan disimpan menggunakan NIK. Nama/alias hanya diterima jika unik, aktif, dan berjabatan atasan. Nama ambigu ditolak; isi SUPERIOR NIK/NIK ATASAN untuk menentukannya.
- Perubahan jabatan leader menjadi kurir mempertahankan status aktif. Pengalihan bawahannya tetap dilakukan eksplisit melalui Alihkan Tim.
- Seluruh batch satu transaksi. Kesalahan satu baris membatalkan semuanya. Trigger sinkronisasi master kurir tetap bekerja; area/kecamatan/shift dan metadata operasional tersimpan dipertahankan.
- Pesan hasil membedakan baru, diperbarui, dan tetap. Rumus/kuota ringkasan tidak diubah.

## Validasi

`node tests/employee-bulk-merge-db.cjs` menjalankan migration PostgreSQL lokal dengan trigger master/hierarki/audit asli. Cakupan: upload parsial, jabatan/atasan, status/identitas/kontak tetap, master sinkron, tidak menulis ulang, penolakan NIK ganda, transaksi rollback, serta hak akses.
