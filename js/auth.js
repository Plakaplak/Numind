/* ==========================================================================
   auth.js — Akun di perangkat: daftar, masuk, sesi, kelola pengguna.
   Logika murni (UMD) supaya bisa diuji di Node. Penyimpanan ada di views-auth.js.

   Batas keamanan, tolong dibaca:
   - Kata sandi disimpan sebagai hash PBKDF2-SHA256 + salt acak, bukan teks asli.
   - Akun dan data tersimpan di perangkat ini. Orang yang menguasai perangkat dan paham
     alat pengembang browser tetap bisa membaca data. Login mencegah pemakaian lewat
     aplikasi dan mengatribusikan setiap aksi ke satu orang, bukan enkripsi data.
   - Untuk keamanan lintas orang dan lintas perangkat, dibutuhkan backend.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Auth = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ROLES = ['producer', 'finance', 'director'];
  const ITERATIONS = 600000;          // rekomendasi OWASP untuk PBKDF2-HMAC-SHA256
  const FAILS_PER_LOCK = 5;           // setiap 5 kegagalan beruntun → kunci sementara
  const LOCK_BASE_SEC = 30, LOCK_MAX_SEC = 900;
  const SESSION_REMEMBER_DAYS = 30, SESSION_SHORT_HOURS = 12;
  const SETUP_KEY = '#setup';           // kunci hitungan percobaan kode administrator (email selalu mengandung @, jadi tidak bentrok)
  const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // 32 huruf/angka tanpa I, O, 0, 1 supaya tidak membingungkan

  class AuthError extends Error {
    constructor(message, code, extra) { super(message); this.name = 'AuthError'; this.code = code; if (extra) Object.assign(this, extra); }
  }
  const err = (m, c, x) => new AuthError(m, c, x);
  const clock = o => (o && o.now !== undefined ? o.now : Date.now());   // now: 0 tetap valid

  /* ---------- Kripto ---------- */
  function webcrypto() {
    const c = typeof globalThis !== 'undefined' && globalThis.crypto;
    if (c && c.subtle) return c;
    if (typeof require === 'function') { try { return require('crypto').webcrypto; } catch (e) { /* lanjut */ } }
    throw err('Masuk dan daftar butuh koneksi aman. Buka aplikasi lewat alamat https:// atau localhost.', 'no_crypto');
  }
  const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), ch => ch.charCodeAt(0));
  async function derive(password, salt, iterations) {
    const c = webcrypto();
    const key = await c.subtle.importKey('raw', new TextEncoder().encode(String(password).normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
    return new Uint8Array(await c.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
  }
  function safeEqual(a, b) {
    if (a.length !== b.length) return false;
    let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
    return d === 0;
  }
  async function makePw(password, iterations) {
    const salt = webcrypto().getRandomValues(new Uint8Array(16));
    const iter = iterations || ITERATIONS;
    return { salt: b64(salt), hash: b64(await derive(password, salt, iter)), iter };
  }
  async function verifyPw(password, pw) {
    return safeEqual(await derive(password, unb64(pw.salt), pw.iter), unb64(pw.hash));
  }
  function newId() {
    const a = webcrypto().getRandomValues(new Uint8Array(9));
    return 'usr_' + [...a].map(x => x.toString(36).padStart(2, '0')).join('').slice(0, 12);
  }

  /* ---------- Kode administrator ----------
     Akun administrator pertama hanya bisa dibuat oleh orang yang memegang kode ini. Aplikasi hanya menyimpan
     hash-nya (js/config.js). Ini pagar kebijakan, bukan brankas: karena semuanya berjalan di perangkat,
     orang yang paham alat pengembang bisa mengubah config.js di salinannya sendiri. */
  const normCode = c => String(c == null ? '' : c).normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '');
  function generateSetupCode() {
    const a = webcrypto().getRandomValues(new Uint8Array(12));
    let s = ''; for (let i = 0; i < 12; i++) { s += CODE_ALPHABET[a[i] % 32]; if (i % 4 === 3 && i < 11) s += '-'; }
    return s;
  }
  /** Hash kode untuk disimpan di config.js: {salt, hash, iter}. */
  async function makeSetupGate(code, iterations) {
    const n = normCode(code);
    if (n.length < 8) throw err('Kode administrator minimal 8 huruf atau angka.', 'setup_code');
    return makePw(n, iterations);
  }
  async function checkSetupCode(gate, code) {
    const n = normCode(code);
    return n.length >= 8 && verifyPw(n, gate);
  }
  const validGate = g => !!(g && typeof g.salt === 'string' && typeof g.hash === 'string' && g.iter > 0);

  /* ---------- Validasi ---------- */
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const normEmail = e => String(e == null ? '' : e).trim().toLowerCase();
  const WEAK = new Set(['12345678', '123456789', '1234567890', '11111111', '00000000', 'qwertyui', 'qwerty123', 'password', 'password1', 'password123', 'passw0rd', 'katasandi', 'katasandi1', 'admin123', 'iloveyou', 'abc12345', 'indonesia']);
  function passwordIssue(pw, ctx) {
    pw = String(pw == null ? '' : pw);
    if (pw.length < 8) return 'Kata sandi minimal 8 karakter.';
    if (pw.length > 128) return 'Kata sandi terlalu panjang (maksimal 128 karakter).';
    if (/^\d+$/.test(pw)) return 'Kata sandi tidak boleh hanya angka. Tambahkan huruf.';
    if (/^(.)\1+$/.test(pw)) return 'Kata sandi tidak boleh satu karakter yang diulang.';
    const low = pw.toLowerCase();
    if (WEAK.has(low)) return 'Kata sandi ini terlalu mudah ditebak. Pilih yang lain.';
    if (ctx && ctx.email) { const e = normEmail(ctx.email); if (low === e || low === e.split('@')[0]) return 'Jangan memakai email sebagai kata sandi.'; }
    return null;
  }
  function cleanName(n) { return String(n == null ? '' : n).trim().replace(/\s+/g, ' '); }
  function checkName(n) {
    const name = cleanName(n);
    if (name.length < 2) throw err('Isi nama lengkap (minimal 2 huruf).', 'name', { field: 'name' });
    if (name.length > 60) throw err('Nama terlalu panjang (maksimal 60 karakter).', 'name', { field: 'name' });
    return name;
  }

  /* ---------- Data ---------- */
  function emptyAuth() { return { v: 1, allowSignup: true, users: [], attempts: {} }; }
  function validateAuth(a) {
    if (!a || typeof a !== 'object' || !Array.isArray(a.users)) return emptyAuth();
    a.v = 1; a.allowSignup = a.allowSignup !== false; a.attempts = a.attempts && typeof a.attempts === 'object' ? a.attempts : {};
    a.users = a.users.filter(u => u && u.id && u.email && u.pw && u.pw.salt && u.pw.hash && u.pw.iter);
    for (const u of a.users) { if (!ROLES.includes(u.role)) u.role = 'producer'; u.admin = !!u.admin; u.sv = u.sv || 1; }
    return a;
  }
  function publicUser(u) {
    return u && { id: u.id, name: u.name, email: u.email, role: u.role, admin: !!u.admin, disabled: !!u.disabled, mustChange: !!u.mustChange, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt || null };
  }
  const findById = (auth, id) => auth.users.find(u => u.id === id);
  const activeAdmins = auth => auth.users.filter(u => u.admin && !u.disabled);
  function needAdmin(auth, adminId) {
    const a = findById(auth, adminId);
    if (!a || !a.admin || a.disabled) throw err('Hanya administrator yang bisa melakukan ini.', 'forbidden');
    return a;
  }
  function lastAdminGuard(auth, target) {
    if (target.admin && !target.disabled && activeAdmins(auth).length <= 1) throw err('Harus ada minimal satu administrator aktif.', 'last_admin');
  }

  /* ---------- Daftar ---------- */
  /** d: {name,email,password,password2?,role?,admin?}. o: {by: id admin yang membuatkan, now, iterations}. */
  async function register(auth, d, o) {
    o = o || {};
    const now = clock(o);
    const name = checkName(d.name);
    const email = normEmail(d.email);
    if (!EMAIL_RE.test(email)) throw err('Email tidak valid. Contoh: nama@kantor.com', 'email', { field: 'email' });
    if (auth.users.some(u => u.email === email)) throw err('Email ini sudah terdaftar. Silakan masuk.', 'email_taken', { field: 'email' });
    const issue = passwordIssue(d.password, { email });
    if (issue) throw err(issue, 'password', { field: 'password' });
    if (d.password2 !== undefined && d.password2 !== d.password) throw err('Pengulangan kata sandi tidak sama.', 'password2', { field: 'password2' });

    const first = auth.users.length === 0;
    let role = 'producer', admin = false, mustChange = false, createdBy = null;
    if (first) {
      role = ROLES.includes(d.role) ? d.role : 'director'; admin = true;
      if (o.setup !== undefined && o.setup !== null) {   // akun pertama = administrator, jadi butuh kode dari pengelola
        if (!validGate(o.setup)) throw err('Pengaturan kode administrator rusak atau tidak termuat. Hubungi pengelola aplikasi.', 'setup_config');   // gagal tertutup, bukan terbuka
        const wait = lockLeft(auth, SETUP_KEY, now);
        if (wait) throw err('Terlalu banyak percobaan kode. Coba lagi dalam ' + fmtWait(wait) + '.', 'locked', { retryAfter: wait, field: 'setupCode' });
        if (!normCode(d.setupCode)) throw err('Isi kode administrator. Kode diberikan oleh pengelola aplikasi.', 'setup_code', { field: 'setupCode' });
        if (!(await checkSetupCode(o.setup, d.setupCode))) {
          const left = noteFail(auth, SETUP_KEY, now), w2 = lockLeft(auth, SETUP_KEY, now);
          throw err(w2 ? 'Terlalu banyak percobaan kode. Coba lagi dalam ' + fmtWait(w2) + '.' : 'Kode administrator salah.' + (left <= 2 ? ' Sisa ' + left + ' percobaan sebelum dikunci sementara.' : ''), w2 ? 'locked' : 'setup_code', { retryAfter: w2, field: 'setupCode' });
        }
        delete auth.attempts[SETUP_KEY];
      }
    } else if (o.by) {
      const a = needAdmin(auth, o.by);
      role = ROLES.includes(d.role) ? d.role : 'producer'; admin = !!d.admin; mustChange = true; createdBy = a.id;
    } else if (!auth.allowSignup) {
      throw err('Pendaftaran mandiri sedang ditutup. Minta administrator membuatkan akun.', 'signup_closed');
    }
    const pw = await makePw(d.password, o.iterations);
    if (auth.users.some(u => u.email === email)) throw err('Email ini sudah terdaftar. Silakan masuk.', 'email_taken', { field: 'email' });
    if (first !== (auth.users.length === 0)) throw err('Daftar pengguna berubah saat Anda mendaftar. Muat ulang halaman.', 'race');
    const u = { id: newId(), name, email, role, admin, pw, mustChange, disabled: false, sv: 1, createdAt: now, createdBy, lastLoginAt: null };
    auth.users.push(u);
    return u;
  }

  /* ---------- Masuk ---------- */
  function lockLeft(auth, email, now) {
    const t = auth.attempts[email];
    return t && t.until && t.until > now ? Math.ceil((t.until - now) / 1000) : 0;
  }
  function noteFail(auth, email, now) {
    const t = auth.attempts[email] || (auth.attempts[email] = { n: 0, until: 0 });
    t.n += 1;
    if (t.n % FAILS_PER_LOCK === 0) t.until = now + Math.min(LOCK_MAX_SEC, LOCK_BASE_SEC * Math.pow(2, t.n / FAILS_PER_LOCK - 1)) * 1000;
    const keys = Object.keys(auth.attempts);
    if (keys.length > 200) for (const k of keys) { const x = auth.attempts[k]; if (!(x.until > now)) delete auth.attempts[k]; }
    return FAILS_PER_LOCK - (t.n % FAILS_PER_LOCK);
  }
  let dummy = null;
  async function dummyVerify(password, iter) {
    if (!dummy || dummy.iter !== iter) dummy = await makePw('tidak-dipakai-' + Math.random(), iter);
    await verifyPw(password, dummy);
  }

  /** Mengembalikan user bila berhasil. Melempar AuthError bila gagal. */
  async function login(auth, email, password, o) {
    o = o || {};
    const now = clock(o);
    email = normEmail(email);
    if (!email || !password) throw err('Isi email dan kata sandi.', 'missing', { field: email ? 'password' : 'email' });
    if (!auth.users.length) throw err('Belum ada akun di perangkat ini. Akun disimpan per perangkat: impor berkas akun dari administrator, atau buat akun pertama dengan kode administrator.', 'no_accounts');
    const wait = lockLeft(auth, email, now);
    if (wait) throw err('Terlalu banyak percobaan. Coba lagi dalam ' + fmtWait(wait) + '.', 'locked', { retryAfter: wait });
    const u = auth.users.find(x => x.email === email);
    let ok = false;
    if (u) ok = await verifyPw(password, u.pw); else await dummyVerify(password, o.iterations || ITERATIONS); // waktu tunggu sama, tidak membocorkan akun
    if (!u || !ok) {
      const left = noteFail(auth, email, now);
      const w2 = lockLeft(auth, email, now);
      throw err(w2 ? 'Terlalu banyak percobaan. Coba lagi dalam ' + fmtWait(w2) + '.' : 'Email atau kata sandi salah.' + (left <= 2 ? ' Sisa ' + left + ' percobaan sebelum dikunci sementara.' : ''), w2 ? 'locked' : 'bad_credentials', { retryAfter: w2, field: 'password' });
    }
    if (u.disabled) throw err('Akun ini dinonaktifkan. Hubungi administrator.', 'disabled');
    delete auth.attempts[email];
    u.lastLoginAt = now;
    return u;
  }
  function fmtWait(sec) { return sec >= 90 ? Math.ceil(sec / 60) + ' menit' : sec + ' detik'; }

  /* ---------- Sesi ---------- */
  function makeSession(user, o) {
    o = o || {}; const now = clock(o);
    return { uid: user.id, sv: user.sv, remember: !!o.remember, exp: now + (o.remember ? SESSION_REMEMBER_DAYS * 86400000 : SESSION_SHORT_HOURS * 3600000) };
  }
  function resolveSession(auth, s, now) {
    now = now === undefined ? Date.now() : now;
    if (!s || !s.uid || !(s.exp > now)) return null;
    const u = findById(auth, s.uid);
    return u && !u.disabled && u.sv === s.sv ? u : null;
  }

  /* ---------- Akun sendiri ---------- */
  async function changePassword(auth, userId, oldPw, newPw, o) {
    o = o || {};
    const u = findById(auth, userId); if (!u) throw err('Akun tidak ditemukan.', 'not_found');
    if (!o.skipOld && !(await verifyPw(oldPw || '', u.pw))) throw err('Kata sandi lama salah.', 'bad_credentials', { field: 'oldPassword' });
    const issue = passwordIssue(newPw, { email: u.email }); if (issue) throw err(issue, 'password', { field: 'newPassword' });
    if (await verifyPw(newPw, u.pw)) throw err('Kata sandi baru harus berbeda dari yang lama.', 'password', { field: 'newPassword' });
    u.pw = await makePw(newPw, o.iterations); u.mustChange = false; u.sv += 1;
    return u;
  }
  function updateProfile(auth, userId, d) {
    const u = findById(auth, userId); if (!u) throw err('Akun tidak ditemukan.', 'not_found');
    u.name = checkName(d.name); return u;
  }

  /* ---------- Kelola pengguna (administrator) ---------- */
  async function resetPassword(auth, adminId, userId, tempPw, o) {
    needAdmin(auth, adminId);
    const u = findById(auth, userId); if (!u) throw err('Akun tidak ditemukan.', 'not_found');
    const issue = passwordIssue(tempPw, { email: u.email }); if (issue) throw err(issue, 'password', { field: 'password' });
    u.pw = await makePw(tempPw, (o || {}).iterations); u.mustChange = true; u.sv += 1;
    if (auth.attempts[u.email]) delete auth.attempts[u.email];
    return u;
  }
  function setRole(auth, adminId, userId, d) {
    needAdmin(auth, adminId);
    const u = findById(auth, userId); if (!u) throw err('Akun tidak ditemukan.', 'not_found');
    const role = d.role === undefined ? u.role : d.role;
    if (!ROLES.includes(role)) throw err('Peran tidak dikenal.', 'role');
    const admin = d.admin === undefined ? u.admin : !!d.admin;
    if (u.admin && !admin) lastAdminGuard(auth, u);
    if (u.role !== role || u.admin !== admin) u.sv += 1;       // simpan tanpa perubahan tidak mengeluarkan siapa pun
    u.role = role; u.admin = admin;
    return u;
  }
  function setDisabled(auth, adminId, userId, disabled) {
    needAdmin(auth, adminId);
    const u = findById(auth, userId); if (!u) throw err('Akun tidak ditemukan.', 'not_found');
    if (u.id === adminId) throw err('Anda tidak bisa menonaktifkan akun sendiri.', 'self');
    if (disabled) lastAdminGuard(auth, u);
    u.disabled = !!disabled; u.sv += 1;
    return u;
  }
  function removeUser(auth, adminId, userId) {
    needAdmin(auth, adminId);
    const u = findById(auth, userId); if (!u) throw err('Akun tidak ditemukan.', 'not_found');
    if (u.id === adminId) throw err('Anda tidak bisa menghapus akun sendiri.', 'self');
    lastAdminGuard(auth, u);
    auth.users.splice(auth.users.indexOf(u), 1);
    return u;
  }
  function setAllowSignup(auth, adminId, allow) { needAdmin(auth, adminId); auth.allowSignup = !!allow; return auth; }

  /* ---------- Pindah akun antar perangkat ---------- */
  const ACCOUNT_FILE = 'kasproyek-akun';
  /** Isi berkas akun. PERINGATAN: memuat hash kata sandi semua pengguna. Sampaikan hanya lewat jalur tepercaya. */
  function exportAccounts(auth, o) {
    return {
      app: ACCOUNT_FILE, v: 1, exportedAt: clock(o), allowSignup: auth.allowSignup !== false,
      users: auth.users.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, admin: !!u.admin, disabled: !!u.disabled, mustChange: !!u.mustChange, pw: { salt: u.pw.salt, hash: u.pw.hash, iter: u.pw.iter }, createdAt: u.createdAt || 0, createdBy: u.createdBy || null, lastLoginAt: u.lastLoginAt || null }))
    };
  }
  const isB64Len = (s, n) => { try { return typeof s === 'string' && unb64(s).length === n; } catch (e) { return false; } };
  /** Muat berkas akun ke perangkat yang belum punya akun. Berkas harus memuat minimal satu administrator aktif. */
  function importAccounts(auth, file) {
    if (auth.users.length) throw err('Perangkat ini sudah punya akun. Impor hanya untuk perangkat yang masih kosong.', 'not_empty');
    if (!file || typeof file !== 'object' || file.app !== ACCOUNT_FILE || file.v !== 1 || !Array.isArray(file.users)) throw err('Ini bukan berkas akun KasProyek. Pilih berkas yang diekspor dari halaman Pengguna.', 'bad_file');
    if (file.users.length === 0 || file.users.length > 500) throw err('Berkas akun kosong atau terlalu besar.', 'bad_file');
    const seen = new Set(), seenId = new Set(), users = [];
    for (const r of file.users) {
      const email = normEmail(r && r.email);
      if (!r || typeof r !== 'object' || !EMAIL_RE.test(email) || seen.has(email)) throw err('Berkas akun rusak: data pengguna tidak lengkap.', 'bad_file');
      const id = String(r.id || '');
      if (!/^usr_[a-z0-9]{6,20}$/.test(id) || seenId.has(id)) throw err('Berkas akun rusak: ada ID pengguna yang tidak valid.', 'bad_file');
      const pw = r.pw;
      if (!pw || !isB64Len(pw.salt, 16) || !isB64Len(pw.hash, 32) || !Number.isInteger(pw.iter) || pw.iter < 1000 || pw.iter > 5000000) throw err('Berkas akun rusak: data kata sandi tidak valid.', 'bad_file');
      const num = v => (Number.isFinite(v) && v >= 0 ? v : 0);
      let name; try { name = checkName(r.name); } catch (e) { throw err('Berkas akun rusak: ada pengguna tanpa nama yang valid.', 'bad_file'); }
      seen.add(email); seenId.add(id);
      users.push({ id, name, email, role: ROLES.includes(r.role) ? r.role : 'producer', admin: r.admin === true, pw: { salt: pw.salt, hash: pw.hash, iter: pw.iter }, mustChange: r.mustChange === true, disabled: r.disabled === true, sv: 1, createdAt: num(r.createdAt), createdBy: typeof r.createdBy === 'string' ? r.createdBy : null, lastLoginAt: r.lastLoginAt ? num(r.lastLoginAt) : null });
    }
    if (!users.some(u => u.admin && !u.disabled)) throw err('Berkas akun ini tidak punya administrator aktif, jadi tidak dimuat.', 'bad_file');
    auth.users = users; auth.allowSignup = file.allowSignup !== false; auth.attempts = {};
    return users.length;
  }

  return {
    ROLES, ITERATIONS, AuthError, SESSION_REMEMBER_DAYS,
    emptyAuth, validateAuth, publicUser, findById, activeAdmins,
    normEmail, passwordIssue, EMAIL_RE,
    register, login, makeSession, resolveSession, lockLeft,
    normCode, generateSetupCode, makeSetupGate, checkSetupCode, exportAccounts, importAccounts,
    changePassword, updateProfile, resetPassword, setRole, setDisabled, removeUser, setAllowSignup
  };
});
