/* ==========================================================================
   config.js — Pengaturan yang dipegang pengelola aplikasi.

   adminSetup  Hash kode administrator. Akun pertama (administrator) hanya bisa dibuat dengan kode ini.
               Yang tersimpan hanya hash-nya, bukan kodenya. Untuk mengganti kode, buka tools/kode-admin.html
               lalu tempel hasilnya di sini. Isi null untuk mematikan syarat kode (tidak disarankan).
   setupHint   Teks bantuan di bawah kolom kode (opsional), misalnya siapa yang memegang kodenya.

   Batas keamanan: berkas ini ikut terkirim ke browser, jadi ini pagar kebijakan, bukan brankas.
   Orang yang paham alat pengembang bisa mengubahnya di salinannya sendiri. Keamanan penuh butuh backend.
   ========================================================================== */
window.KASPROYEK_CONFIG = {
  adminSetup: {"salt":"7V0LsmB95Y9W2aCes8JXKA==","hash":"HUNq7JPzw+27AVBwKSKZePQWj0Gyo7JY7hdzGPh0jzQ=","iter":600000},
  setupHint: 'Tidak punya kode? Hubungi pengelola aplikasi Numind.'
};
