# KasProyek

Aplikasi web progresif (PWA) untuk mencatat pemasukan, pengeluaran, dan reimbursement di kantor kreatif. Cocok untuk Producer yang menalangi biaya project, Finance yang memeriksa nota, dan Director yang menyetujui.

Tidak perlu server, database, atau proses build. Semua data tersimpan di perangkat dan aplikasi tetap berjalan tanpa internet.

## Cara menjalankan

Aplikasi ini hanya berkas statis. Service worker dan fitur "Pasang aplikasi" butuh **HTTPS** atau **localhost**, jadi jangan buka dengan klik ganda pada `index.html`.

**Coba di komputer sendiri**

```bash
cd kasproyek
python3 -m http.server 8080
```

Buka `http://localhost:8080`. Tambahkan `?demo=1` (`http://localhost:8080/?demo=1`) untuk mengisi data contoh: 3 project, sekitar 35 transaksi, pengajuan yang sudah dibayar, menunggu approval, dan perlu revisi.

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

- **Dana pribadi Producer**: menjadi piutang reimbursement dan bernomor `RB-YYYYMM-NNN`.
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
js/db.js                penyimpanan IndexedDB (data dan foto), localStorage sebagai cadangan jika IndexedDB tidak tersedia
js/ui.js                format, ikon, dialog, toast, popover
js/shared.js            form dan tabel yang dipakai bersama
js/views-*.js           halaman: dashboard & project, input, pengajuan & approval, laporan & ekspor
js/app.js               router, navigasi, pencarian, notifikasi, pemasangan PWA
img/                    logo Numind (emas untuk header gelap, hijau untuk halaman sambutan, hitam untuk cetak) dan huruf "n" vektor
icons/                  ikon aplikasi (huruf "n" emas di latar hijau tua)
tools/make-icons.py     membuat ulang semua ikon; ubah warna di bagian atas berkas bila perlu
tests/core.test.js      37 pengujian logika
```

Menguji logika inti:

```bash
node tests/core.test.js
```

## Logo dan ikon

- Header desktop memakai logo Numind versi emas, karena kontrasnya paling baik di latar gelap. Di ponsel, header memakai ikon aplikasi.
- Nota pengajuan dan laporan keuangan yang dicetak memakai versi hitam sebagai kop. Nama perusahaan dari Pengaturan muncul di bawah logo bila berbeda dari "Numind".
- Ikon aplikasi memakai huruf "n" dari logo, emas di atas hijau tua, karena logo lengkap terlalu lebar untuk ikon persegi. Setelah mengganti ikon, naikkan `VERSION` di `sw.js`. Ikon yang sudah terpasang di layar utama baru berubah setelah aplikasi dipasang ulang.

## Batasan yang perlu diketahui

- **Peran hanya pengaturan tampilan.** Producer, Finance, dan Director dipilih dari menu akun di perangkat itu. Tidak ada login, jadi siapa pun yang memegang perangkat bisa berganti peran. Untuk pemakaian lintas orang yang sebenarnya, butuh backend dengan autentikasi.
- **Data tersimpan per perangkat.** Dua orang di dua perangkat tidak melihat data yang sama. Untuk berpindah perangkat atau menggabungkan, pakai **Export Data → Cadangan dan pemulihan** lalu **Pulihkan dari cadangan**. Sinkronisasi otomatis antar pengguna memerlukan backend.
- **Hapus data situs atau cache browser menghapus data aplikasi.** Aplikasi meminta penyimpanan permanen, tetapi browser boleh menolak. Unduh cadangan JSON secara berkala.
- **Cetak / PDF** memakai dialog cetak browser (pilih "Simpan sebagai PDF"). Foto nota dilampirkan di halaman berikutnya.
- Foto nota dikompres ke JPEG (maksimum 1600 px). PDF disimpan apa adanya, maksimum 8 MB.
- Ekspor CSV memakai BOM UTF-8 dan pemisah titik koma secara bawaan, supaya terbaca benar di Excel dengan pengaturan regional Indonesia. Pindah ke koma di halaman Export Data bila Google Sheets berbahasa Inggris tidak memisahkan kolom dengan benar.
