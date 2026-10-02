# Master operasional kurir

Route `/master/couriers` menggunakan `/api/courier-master`. Data produksi tidak otomatis diimpor ketika aplikasi dijalankan.

## Aktivasi

1. Terapkan `supabase/migrations/20261002_courier_master_sync.sql` di SQL Editor proyek Supabase yang digunakan aplikasi.
2. Migration mengaitkan TGRID valid yang sudah ada pada `ops_employees` ke master operasional terpisah. Duplikat TGRID menghentikan migration, bukan digabung otomatis. NIK, akun login, foto, dan laporan lama tidak diubah.
3. Login sebagai Admin Pengelola atau Super Admin, buka Master Kurir, pilih Update massal, periode, dan file `.xlsx` asli.
4. Sheet `KURIR` dibaca dari header baris 2. `Sheet2` bersifat opsional; tidak otomatis menjadi sumber utama. `ORION` tidak dijadikan sumber identitas.
5. Periksa preview. Konfirmasi perubahan ID freelance atau koreksi nama hanya setelah memastikan identitas. Konflik ganda dalam file perlu diperbaiki sebelum import. Klik Periksa ulang setelah mengubah konfirmasi.
6. Konfirmasi & simpan menjalankan seluruh perubahan dalam satu transaksi. Preview kedaluwarsa ditolak jika admin lain lebih dulu menyimpan.

## Sinkronisasi

- TGRID unik, terpisah dari NIK. Teks dibersihkan dari spasi berlebih; kapitalisasi nama saja tidak menimbulkan penulisan ulang.
- Isian kosong pada upload mempertahankan nilai lama, bukan menghapusnya. KPI nol adalah nilai yang sah.
- TGRID baru dibuat, TGRID sama dengan perubahan diperbarui, isian identik dilewati. Tidak ada salinan master per bulan.
- TGRID yang tidak ada pada upload tetap dipertahankan. Import tidak mengaktifkan/nonaktifkan karyawan.
- TGRFL ke TGR membutuhkan keputusan eksplisit admin. Record ID dan kaitan NIK tetap sama, ID lama disimpan sebagai alias dan tidak boleh dipakai balik.
- Log menyimpan selisih kolom hanya ketika benar-benar ada perubahan. Upload tanpa perubahan tidak menulis log atau menaikkan revisi.
- Karyawan baru yang belum memiliki NIK tetap dapat tercatat pada master operasional, tanpa menciptakan akun login. Tidak ada pengaitan otomatis berdasarkan nama saja.

## Unduhan

Semua pengguna internal dengan sesi valid dapat membaca dan mengunduh master aktif. Hanya Admin Pengelola/Super Admin dapat memperbarui. Hak akses yang lebih rinci dapat ditambahkan melalui konfigurasi role aplikasi; tidak ada hak edit baru untuk staf biasa.

Excel mempertahankan styles, lebar kolom, nama sheet dan pengaturan cetak dari template sanitised. `KURIR` berisi master aktif terbaru; `ORION` menyediakan TGRID/nama dengan nama Orion kosong karena belum ada sumbernya; `Sheet2` memuat freelance. `Sheet1` tetap kosong. Data contoh, shared strings, pivot cache dan metadata pembuat asli dibuang. PivotTable sumber tidak dipertahankan karena akan membawa data/cache lama.

Periode pada unduhan adalah label laporan terbaru, bukan snapshot historis atau jaminan semua personel diperbarui pada periode tersebut. File diunduh sebagai `.xlsx` nyata, bukan CSV yang diganti ekstensi.

## Verifikasi

`node tests/courier-master.cjs`, `node tests/courier-master-api.cjs`, `npx tsc --noEmit`, dan `npm run build`.

Tes SQL transaksi pada Supabase nyata perlu dilakukan setelah migration diterapkan. Sumber Excel dan data produksi tidak diubah oleh tes.
