# KasProyek

Aplikasi web progresif (PWA) untuk mencatat pemasukan, pengeluaran, dan reimbursement di kantor kreatif. Cocok untuk anggota Team yang menalangi biaya project, Finance yang memeriksa nota, dan Director yang menyetujui.

Tidak perlu server, database, atau proses build. Semua data tersimpan di perangkat dan aplikasi tetap berjalan tanpa internet.

## Cara menjalankan

Aplikasi ini hanya berkas statis. Service worker dan fitur "Pasang aplikasi" butuh **HTTPS** atau **localhost**, jadi jangan buka dengan klik ganda pada `index.html`.

**Coba di komputer sendiri**

```bash
cd kasproyek
python3 -m http.server 8080
```

Buka `http://localhost:8080`. Di perangkat yang masih kosong, layar **Masuk** tampil lebih dulu. Akun administrator pertama dibuat lewat tab **Akun pertama** dan butuh **kode administrator** dari pengelola (lihat [Kode administrator](#kode-administrator)). Anggota tim lain tidak mendaftar sebagai administrator: mereka diberi akun atau berkas akun oleh administrator (lihat [Akun dan peran](#akun-dan-peran)). Tambahkan `?demo=1` (`http://localhost:8080/?demo=1`) untuk mengisi data contoh setelah akun pertama dibuat: 3 project, sekitar 35 transaksi, pengajuan yang sudah dibayar, menunggu approval, dan perlu revisi.

**Pasang untuk tim**

Unggah seluruh folder ke hosting statis berbasis HTTPS: Netlify, Vercel, Cloudflare Pages, GitHub Pages, atau server kantor. Tidak ada pengaturan khusus. Setelah dibuka, Chrome dan Edge menawarkan tombol **Pasang aplikasi**. Di iPhone atau iPad: Safari → Bagikan → **Tambahkan ke Layar Utama**.

Setiap kali berkas berubah, naikkan `VERSION` di `sw.js` (misalnya `kasproyek-v1.0.1`) supaya perangkat yang sudah memasang mengambil versi baru. Pengguna akan melihat tombol **Muat ulang**.

## Menu

| Menu | Fungsi |
|---|---|
| Dashboard | Ringkasan bulan ini, saldo, piutang reimbursement, saldo petty cash, tugas yang menunggu |
| Project Management | Daftar project, budget, penutupan laporan project |
| Input Pengeluaran | Catat per hari dan boleh dicicil. Pilih dana pribadi atau dana perusahaan, lampirkan foto nota |
| Input Pemasukan | DP, termin, pelunasan, dan top-up petty cash |
| Upload Bon / Nota | Foto banyak nota dulu, lengkapi datanya nanti |
| Reimbursement | Siap diajukan, riwayat pengajuan, dan pembuat pengajuan |
| Approval Center | Antrean untuk Finance dan Director: setujui, minta revisi, tolak, tandai dibayar |
| Financial Report | Laporan per project, kategori, posisi piutang, dan petty cash |
| Export Data | CSV dan cadangan JSON (opsional beserta foto nota) |
| Pengguna | Khusus administrator: tambah akun, ubah peran, atur ulang kata sandi, nonaktifkan, buka atau tutup pendaftaran mandiri |

## Akun dan peran

Setiap orang masuk dengan email dan kata sandi sendiri. Nama yang tampil di riwayat approval dan pembayaran diambil dari akun, bukan diketik manual.

| Peran | Bisa |
|---|---|
| Team | Mencatat pengeluaran dan pemasukan, mengunggah nota, membuat dan memperbaiki pengajuan |
| Finance | Semua milik Team, ditambah memeriksa, menyetujui, meminta revisi, menolak, dan mencatat pembayaran |
| Director | Sama dengan Finance: memeriksa, menyetujui, meminta revisi, menolak, dan mencatat pembayaran |

**Administrator** adalah penanda terpisah dari peran: administrator mengelola pengguna dan membuka Pengaturan. Satu orang bisa Director sekaligus administrator.

- **Akun pertama** di sebuah perangkat otomatis menjadi administrator, tetapi hanya bisa dibuat oleh pemegang [kode administrator](#kode-administrator). Pemiliknya memilih peran awalnya (bawaan: Director).
- **Pendaftar berikutnya** masuk sebagai Team. Administrator mengubah perannya di menu Pengguna. Perubahan berlaku saat orang itu masuk lagi, karena sesinya dicabut.
- **Administrator juga bisa membuat akun** dengan kata sandi sementara. Pemilik akun diminta menggantinya saat masuk pertama. Setelah semua anggota tim punya akun, matikan **Izinkan orang mendaftar sendiri** di halaman Pengguna.
- **Lupa kata sandi?** Administrator memilih **Atur ulang kata sandi** pada nama orang itu. Kata sandi disimpan sebagai hash, jadi tidak ada yang bisa melihatnya, termasuk administrator.
- **Administrator terakhir tidak bisa dicopot atau dinonaktifkan**, dan tidak ada yang bisa menghapus atau menonaktifkan akunnya sendiri.
- **Lima kali salah berturut-turut** mengunci percobaan masuk untuk email itu selama 30 detik, lalu berlipat ganda sampai 15 menit.
- **Tetap masuk di perangkat ini** berlaku 30 hari. Tanpa centang itu, sesi berakhir saat tab ditutup (maksimal 12 jam). Keluar di satu tab ikut mengeluarkan tab lain.
- **Jalan terakhir** bila satu-satunya administrator lupa kata sandi: di layar Masuk pilih **Lupa kata sandi?**, lalu hapus semua data di perangkat. Setelah itu buat akun administrator lagi dengan kode administrator (atau impor berkas akun). Pulihkan data dari cadangan JSON bila ada. Cadangan tidak memuat akun maupun kata sandi.

## Kode administrator

Akun administrator pertama hanya bisa dibuat oleh orang yang memegang kode ini, supaya tidak semua orang yang membuka aplikasi bisa menjadi administrator.

- Aplikasi **tidak menyimpan kodenya**, hanya hash PBKDF2-nya di `js/config.js` (`adminSetup`). Kodenya diberikan pengelola kepada calon administrator, di luar aplikasi.
- Kode salah 5 kali berturut-turut mengunci percobaan 30 detik, lalu berlipat ganda sampai 15 menit. Huruf besar/kecil, spasi, dan tanda hubung diabaikan.
- Syarat ini hanya untuk **akun pertama**. Pendaftar berikutnya dan akun buatan administrator tidak diminta kode.
- **Mengganti kode** (misalnya kode bocor): buka `tools/kode-admin.html` di browser, buat kode acak atau tulis sendiri, lalu tempel baris `adminSetup` yang muncul ke `js/config.js` dan unggah ulang aplikasi. Akun yang sudah ada tidak terpengaruh. Setelah itu naikkan `VERSION` di `sw.js`.
- Bila `js/config.js` hilang atau rusak, pembuatan akun pertama **ditolak** (gagal tertutup). Mengisi `adminSetup: null` mematikan syarat kode, tidak disarankan.
- Kode ini juga kunci pemulihan: bila semua administrator lupa kata sandi, pemegang kode bisa membuat administrator baru setelah data perangkat dihapus.
- Ini **pagar kebijakan, bukan brankas**: berkas `config.js` ikut terkirim ke browser, jadi orang yang paham alat pengembang bisa mengubahnya di salinannya sendiri, atau menyusun berkas akun palsu. Itu hanya memengaruhi perangkatnya sendiri, tidak akun di perangkat lain. Pembatasan yang sungguh-sungguh butuh server.

## Memakai akun yang sama di perangkat lain

Akun disimpan per perangkat. Cara memindahkannya:

1. Administrator membuka **Pengguna → Ekspor akun** dan mengunduh berkas `kasproyek-akun-….json`.
2. Berkas dikirim ke anggota tim lewat jalur tepercaya. **Berkas ini memuat hash kata sandi semua pengguna**, jadi perlakukan sebagai data sensitif dan jangan unggah ke tempat umum.
3. Di perangkat tujuan (yang masih kosong), layar **Masuk** punya tombol **Impor akun dari berkas**. Setelah impor, masuk dengan email dan kata sandi masing-masing.

Catatan: impor hanya untuk perangkat yang belum punya akun, dan berkasnya harus memuat minimal satu administrator aktif. Yang pindah hanya akun, bukan project atau transaksi (untuk itu pakai cadangan di Export Data). Setelah dipindah, akun di tiap perangkat berjalan sendiri-sendiri: kata sandi atau peran yang diubah di satu perangkat tidak ikut berubah di perangkat lain.

## Alur kerja

1. Buat project dan tentukan budget.
2. Catat pengeluaran tiap hari. Satu project boleh berisi banyak catatan kecil.
3. Lampirkan foto nota. Tanpa nota, isi alasan. Kalau keduanya kosong, transaksi menjadi **Draft**.
4. Tutup laporan project. Semua transaksi menjadi **Siap Reimburse**.
5. Buat pengajuan, **per project** atau **per periode** (beberapa project digabung bulanan).
6. Finance memeriksa. Per transaksi bisa diminta revisi atau ditolak, sisanya disetujui.
7. Setelah disetujui, Finance menandai **Dibayar** dengan tanggal, metode, dan nomor referensi.

Status transaksi: Draft → Tercatat → Siap Reimburse → Menunggu Approval → Revisi / Disetujui / Ditolak → Dibayar.

### Aturan dana

- **Dana pribadi Team**: menjadi piutang reimbursement dan bernomor `RB-YYYYMM-NNN`.
- **Dana perusahaan**: dihitung sebagai pemakaian petty cash dan bernomor `PC-YYYYMM-NNN`. Laporannya tetap disetujui, tetapi tidak ada pembayaran.
- Saldo petty cash = top-up pemasukan dikurangi pengeluaran dana perusahaan.

### Pencegahan penggantian ganda

- Satu transaksi hanya bisa masuk **satu** pengajuan aktif. Menarik (membatalkan) pengajuan membebaskan transaksinya untuk diajukan lagi. Transaksi yang ditolak bersifat final, dan transaksi yang sudah dibayar terkunci.
- Aplikasi memperingatkan transaksi yang mirip: foto nota yang sama (sidik jari SHA-256), nomor nota dan toko yang sama, atau tanggal, nominal, dan project yang sama. Penginput harus mengonfirmasi bahwa itu transaksi berbeda.
- `Core.integrityCheck` memeriksa seluruh data dan melaporkan transaksi yang terhitung dua kali.

## Struktur berkas

```
index.html              kerangka halaman
manifest.webmanifest    metadata PWA
sw.js                   service worker (offline-first)
css/app.css             seluruh gaya, termasuk cetak
js/core.js              logika bisnis murni (status, validasi, pengajuan, laporan, CSV, data contoh)
js/auth.js              logika akun: daftar, masuk, hash kata sandi (PBKDF2), kode administrator, penguncian, sesi, peran, ekspor/impor akun
js/config.js            pengaturan pengelola: hash kode administrator dan teks bantuannya
js/db.js                penyimpanan IndexedDB (data dan foto), localStorage sebagai cadangan jika IndexedDB tidak tersedia
js/ui.js                format, ikon, dialog, toast, popover
js/shared.js            form dan tabel yang dipakai bersama
js/views-*.js           halaman: dashboard & project, input, pengajuan & approval, laporan & ekspor, masuk/daftar & pengguna
js/app.js               router, navigasi, pencarian, notifikasi, pemasangan PWA
img/                    logo Numind (emas untuk header gelap, hijau untuk halaman sambutan, hitam untuk cetak) dan huruf "n" vektor
icons/                  ikon aplikasi (huruf "n" emas di latar hijau tua)
tools/make-icons.py     membuat ulang semua ikon; ubah warna di bagian atas berkas bila perlu
tools/kode-admin.html   membuat kode administrator baru dan baris konfigurasinya (buka langsung di browser)
tests/core.test.js      37 pengujian logika bisnis
tests/auth.test.js      42 pengujian logika akun, kode administrator, dan pindah akun
```

Menguji logika:

```bash
node tests/core.test.js
node tests/auth.test.js
```

## Logo dan ikon

- Header desktop memakai logo Numind versi emas, karena kontrasnya paling baik di latar gelap. Di ponsel, header memakai ikon aplikasi.
- Nota pengajuan dan laporan keuangan yang dicetak memakai versi hitam sebagai kop. Nama perusahaan dari Pengaturan muncul di bawah logo bila berbeda dari "Numind".
- Ikon aplikasi memakai huruf "n" dari logo, emas di atas hijau tua, karena logo lengkap terlalu lebar untuk ikon persegi. Setelah mengganti ikon, naikkan `VERSION` di `sw.js`. Ikon yang sudah terpasang di layar utama baru berubah setelah aplikasi dipasang ulang.

## Batasan yang perlu diketahui

- **Akun hanya berlaku di perangkat ini.** Akun, kata sandi, dan sesi disimpan di browser perangkat yang sama dengan datanya. Perangkat lain punya daftar akun sendiri yang kosong, jadi akun yang dibuat di komputer kantor tidak otomatis ada di ponsel. Anda bisa memindahkannya dengan [ekspor dan impor akun](#memakai-akun-yang-sama-di-perangkat-lain), tetapi sesudahnya tiap perangkat berjalan sendiri. Untuk satu daftar akun yang selalu sinkron di banyak perangkat, butuh backend.
- **Login adalah pagar aplikasi, bukan brankas data.** Kata sandi disimpan sebagai hash (PBKDF2-SHA256, 600.000 putaran, garam acak per akun) dan tidak pernah sebagai teks biasa. Tetapi project, transaksi, dan foto nota di perangkat **tidak dienkripsi**. Orang yang menguasai browser itu dan paham cara membuka DevTools bisa membaca atau mengubah data, dan melewati layar masuk. Login mencegah salah pakai dan memastikan nama serta peran tercatat dengan benar. Untuk melindungi dari orang yang sengaja berniat buruk, butuh backend dengan autentikasi dan penyimpanan di server.
- **Masuk dan daftar butuh HTTPS atau localhost**, karena pengacakan kata sandi memakai fitur kripto browser yang hanya tersedia di koneksi aman. Dibuka lewat `http://` alamat jaringan lokal akan menampilkan pesan yang menjelaskannya.
- **Data tersimpan per perangkat.** Dua orang di dua perangkat tidak melihat data yang sama. Untuk berpindah perangkat atau menggabungkan, pakai **Export Data → Cadangan dan pemulihan** lalu **Pulihkan dari cadangan**. Sinkronisasi otomatis antar pengguna memerlukan backend.
- **Hapus data situs atau cache browser menghapus data aplikasi.** Aplikasi meminta penyimpanan permanen, tetapi browser boleh menolak. Unduh cadangan JSON secara berkala.
- **Cetak / PDF** memakai dialog cetak browser (pilih "Simpan sebagai PDF"). Foto nota dilampirkan di halaman berikutnya.
- Foto nota dikompres ke JPEG (maksimum 1600 px). PDF disimpan apa adanya, maksimum 8 MB.
- Ekspor CSV memakai BOM UTF-8 dan pemisah titik koma secara bawaan, supaya terbaca benar di Excel dengan pengaturan regional Indonesia. Pindah ke koma di halaman Export Data bila Google Sheets berbahasa Inggris tidak memisahkan kolom dengan benar.
