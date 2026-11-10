// Pengujian logika akun. Jalankan: node tests/auth.test.js
'use strict';
const assert = require('assert');
const Auth = require('../js/auth.js');
const IT = 1000; // iterasi kecil agar pengujian cepat; produksi memakai Auth.ITERATIONS

let pass = 0, fail = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const rejects = async (p, code, msgRe) => {
  try { await p; } catch (e) {
    assert.strictEqual(e.name, 'AuthError', 'harus AuthError, dapat: ' + e.name + ' ' + e.message);
    if (code) assert.strictEqual(e.code, code, 'kode: ' + e.code + ' (' + e.message + ')');
    if (msgRe) assert.match(e.message, msgRe);
    return e;
  }
  assert.fail('seharusnya ditolak dengan ' + code);
};
const reg = (a, d, o) => Auth.register(a, Object.assign({ name: 'Rina Putri', email: 'rina@numind.id', password: 'kopi-susu-77' }, d), Object.assign({ iterations: IT }, o));
const lg = (a, e, p, o) => Auth.login(a, e, p, Object.assign({ iterations: IT }, o));

test('akun pertama otomatis menjadi administrator dengan peran pilihan', async () => {
  const a = Auth.emptyAuth();
  const u = await reg(a, { role: 'finance' });
  assert.strictEqual(u.admin, true); assert.strictEqual(u.role, 'finance');
  assert.strictEqual(a.users.length, 1);
});
test('akun pertama tanpa peran → Director', async () => {
  const a = Auth.emptyAuth(); const u = await reg(a, {}); assert.strictEqual(u.role, 'director');
});
test('kata sandi tidak disimpan sebagai teks asli; salt berbeda tiap akun', async () => {
  const a = Auth.emptyAuth();
  const u1 = await reg(a, {}); const u2 = await reg(a, { email: 'budi@numind.id', name: 'Budi' });
  assert.ok(!JSON.stringify(a).includes('kopi-susu-77'));
  assert.notStrictEqual(u1.pw.salt, u2.pw.salt); assert.notStrictEqual(u1.pw.hash, u2.pw.hash);
  assert.strictEqual(u1.pw.iter, IT);
});
test('pendaftar berikutnya menjadi Team non-admin, tidak bisa memilih peran sendiri', async () => {
  const a = Auth.emptyAuth(); await reg(a, {});
  const u = await reg(a, { email: 'budi@numind.id', name: 'Budi', role: 'director', admin: true });
  assert.strictEqual(u.role, 'producer'); assert.strictEqual(u.admin, false);
});
test('email dinormalkan dan tidak boleh kembar', async () => {
  const a = Auth.emptyAuth(); await reg(a, { email: '  Rina@Numind.ID ' });
  assert.strictEqual(a.users[0].email, 'rina@numind.id');
  await rejects(reg(a, { email: 'RINA@numind.id', name: 'Lain' }), 'email_taken');
});
test('validasi nama, email, kata sandi', async () => {
  const a = Auth.emptyAuth();
  await rejects(reg(a, { name: 'A' }), 'name');
  await rejects(reg(a, { email: 'bukan-email' }), 'email');
  await rejects(reg(a, { password: 'pendek1' }), 'password', /8 karakter/);
  await rejects(reg(a, { password: '1234567890' }), 'password');
  await rejects(reg(a, { password: 'aaaaaaaaaa' }), 'password');
  await rejects(reg(a, { password: 'password123' }), 'password', /mudah ditebak/);
  await rejects(reg(a, { password: 'rina@numind.id' }), 'password', /email/);
  await rejects(reg(a, { password2: 'beda-sekali-1' }), 'password2');
  assert.strictEqual(a.users.length, 0, 'tidak ada akun tersimpan setelah semua penolakan');
});
test('masuk berhasil dan mencatat waktu masuk; email tidak peka huruf besar', async () => {
  const a = Auth.emptyAuth(); await reg(a, {});
  const u = await lg(a, 'RINA@numind.id', 'kopi-susu-77', { now: 5000 });
  assert.strictEqual(u.lastLoginAt, 5000);
});
test('kata sandi salah dan email tak dikenal memberi pesan yang sama', async () => {
  const a = Auth.emptyAuth(); await reg(a, {});
  const e1 = await rejects(lg(a, 'rina@numind.id', 'salah-total-1'), 'bad_credentials');
  const e2 = await rejects(lg(a, 'hantu@numind.id', 'salah-total-1'), 'bad_credentials');
  assert.strictEqual(e1.message.split('.')[0], e2.message.split('.')[0]);
});
test('5 kegagalan beruntun mengunci sementara, bahkan untuk kata sandi benar', async () => {
  const a = Auth.emptyAuth(); await reg(a, {});
  const t = 1_000_000;
  for (let i = 0; i < 4; i++) await rejects(lg(a, 'rina@numind.id', 'salah-' + i + 'xx', { now: t }), 'bad_credentials');
  const e = await rejects(lg(a, 'rina@numind.id', 'salah-lagi-5', { now: t }), 'locked');
  assert.strictEqual(e.retryAfter, 30);
  await rejects(lg(a, 'rina@numind.id', 'kopi-susu-77', { now: t + 10_000 }), 'locked');
  const u = await lg(a, 'rina@numind.id', 'kopi-susu-77', { now: t + 31_000 });
  assert.ok(u, 'berhasil setelah kunci berakhir');
  assert.strictEqual(a.attempts['rina@numind.id'], undefined, 'hitungan gagal dihapus setelah berhasil');
});
test('kunci berlipat ganda pada rangkaian kegagalan berikutnya, maksimal 15 menit', async () => {
  const a = Auth.emptyAuth(); await reg(a, {});
  let t = 0, waits = [];
  for (let round = 0; round < 8; round++) {
    for (let i = 0; i < 5; i++) { try { await lg(a, 'rina@numind.id', 'salah-' + round + i + 'x', { now: t }); } catch (e) { if (e.code === 'locked') waits.push(e.retryAfter); } }
    t += 3600_000;
  }
  assert.deepStrictEqual(waits.slice(0, 5), [30, 60, 120, 240, 480]);
  assert.strictEqual(Math.max(...waits), 900);
});
test('akun dinonaktifkan tidak bisa masuk, tetapi status baru terungkap setelah kata sandi benar', async () => {
  const a = Auth.emptyAuth(); const admin = await reg(a, {}); const u = await reg(a, { email: 'budi@numind.id', name: 'Budi' });
  Auth.setDisabled(a, admin.id, u.id, true);
  await rejects(lg(a, 'budi@numind.id', 'salah-total-1'), 'bad_credentials');
  await rejects(lg(a, 'budi@numind.id', 'kopi-susu-77'), 'disabled');
});
test('sesi: ingat saya 30 hari, tanpa itu 12 jam; kedaluwarsa dan pencabutan', async () => {
  const a = Auth.emptyAuth(); const admin = await reg(a, {});
  const s1 = Auth.makeSession(admin, { remember: true, now: 0 }), s2 = Auth.makeSession(admin, { remember: false, now: 0 });
  assert.strictEqual(s1.exp, 30 * 86400000); assert.strictEqual(s2.exp, 12 * 3600000);
  assert.ok(Auth.resolveSession(a, s1, 1000));
  assert.strictEqual(Auth.resolveSession(a, s2, 13 * 3600000), null, 'kedaluwarsa');
  assert.strictEqual(Auth.resolveSession(a, null), null);
  const u = await reg(a, { email: 'budi@numind.id', name: 'Budi' });
  const sb = Auth.makeSession(u, { remember: true, now: 0 });
  Auth.setDisabled(a, admin.id, u.id, true);
  assert.strictEqual(Auth.resolveSession(a, sb, 1000), null, 'sesi akun nonaktif dicabut');
  Auth.setDisabled(a, admin.id, u.id, false);
  assert.strictEqual(Auth.resolveSession(a, sb, 1000), null, 'sesi lama tetap tidak berlaku setelah diaktifkan lagi');
  a.users.splice(a.users.indexOf(u), 1);
  assert.strictEqual(Auth.resolveSession(a, sb, 1000), null, 'akun dihapus');
});
test('ganti kata sandi: perlu sandi lama, aturan sama, sesi lama dicabut', async () => {
  const a = Auth.emptyAuth(); const u = await reg(a, {});
  const s = Auth.makeSession(u, { remember: true });
  await rejects(Auth.changePassword(a, u.id, 'salah-total-1', 'sandi-baru-99', { iterations: IT }), 'bad_credentials');
  await rejects(Auth.changePassword(a, u.id, 'kopi-susu-77', 'pendek', { iterations: IT }), 'password');
  await rejects(Auth.changePassword(a, u.id, 'kopi-susu-77', 'kopi-susu-77', { iterations: IT }), 'password', /berbeda/);
  await Auth.changePassword(a, u.id, 'kopi-susu-77', 'sandi-baru-99', { iterations: IT });
  assert.strictEqual(Auth.resolveSession(a, s), null);
  await rejects(lg(a, 'rina@numind.id', 'kopi-susu-77'), 'bad_credentials');
  assert.ok(await lg(a, 'rina@numind.id', 'sandi-baru-99'));
});
test('administrator membuat akun: wajib ganti sandi saat pertama masuk', async () => {
  const a = Auth.emptyAuth(); const admin = await reg(a, {});
  const u = await reg(a, { email: 'sari@numind.id', name: 'Sari', role: 'finance', password: 'sementara-12' }, { by: admin.id });
  assert.strictEqual(u.role, 'finance'); assert.strictEqual(u.mustChange, true); assert.strictEqual(u.createdBy, admin.id);
  const got = await lg(a, 'sari@numind.id', 'sementara-12'); assert.strictEqual(got.mustChange, true);
  await Auth.changePassword(a, u.id, 'sementara-12', 'sandi-milik-sari-1', { iterations: IT });
  assert.strictEqual(u.mustChange, false);
});
test('hanya administrator aktif yang boleh mengelola pengguna', async () => {
  const a = Auth.emptyAuth(); const admin = await reg(a, {}); const u = await reg(a, { email: 'budi@numind.id', name: 'Budi' });
  await rejects(reg(a, { email: 'x@numind.id', name: 'Xavier' }, { by: u.id }), 'forbidden');
  assert.throws(() => Auth.setRole(a, u.id, u.id, { role: 'director' }), e => e.code === 'forbidden');
  assert.throws(() => Auth.setDisabled(a, u.id, admin.id, true), e => e.code === 'forbidden');
  assert.throws(() => Auth.removeUser(a, u.id, admin.id), e => e.code === 'forbidden');
  assert.throws(() => Auth.setAllowSignup(a, u.id, false), e => e.code === 'forbidden');
  await rejects(Auth.resetPassword(a, u.id, admin.id, 'peretasan-123', { iterations: IT }), 'forbidden');
});
test('ubah peran dan jadikan admin; sesi pengguna itu dicabut agar peran baru berlaku', async () => {
  const a = Auth.emptyAuth(); const admin = await reg(a, {}); const u = await reg(a, { email: 'budi@numind.id', name: 'Budi' });
  const s = Auth.makeSession(u, {});
  Auth.setRole(a, admin.id, u.id, { role: 'finance' });
  assert.strictEqual(u.role, 'finance'); assert.strictEqual(Auth.resolveSession(a, s), null);
  Auth.setRole(a, admin.id, u.id, { admin: true }); assert.strictEqual(u.admin, true);
  assert.throws(() => Auth.setRole(a, admin.id, u.id, { role: 'raja' }), e => e.code === 'role');
});
test('menyimpan peran tanpa perubahan tidak mencabut sesi', async () => {
  const a = Auth.emptyAuth(); const admin = await reg(a, {}); const u = await reg(a, { email: 'budi@numind.id', name: 'Budi' });
  const s = Auth.makeSession(u, {}), sv = u.sv;
  Auth.setRole(a, admin.id, u.id, { role: u.role, admin: u.admin });
  assert.strictEqual(u.sv, sv); assert.ok(Auth.resolveSession(a, s));
  Auth.setRole(a, admin.id, u.id, { role: 'finance' });
  assert.strictEqual(u.sv, sv + 1); assert.strictEqual(Auth.resolveSession(a, s), null);
});
test('pengaman administrator terakhir', async () => {
  const a = Auth.emptyAuth(); const admin = await reg(a, {}); const u = await reg(a, { email: 'budi@numind.id', name: 'Budi' });
  assert.throws(() => Auth.setRole(a, admin.id, admin.id, { admin: false }), e => e.code === 'last_admin');
  assert.throws(() => Auth.setDisabled(a, admin.id, admin.id, true), e => e.code === 'self');
  assert.throws(() => Auth.removeUser(a, admin.id, admin.id), e => e.code === 'self');
  Auth.setRole(a, admin.id, u.id, { admin: true });
  Auth.setRole(a, admin.id, admin.id, { admin: false });       // sekarang boleh: Budi admin lain
  assert.throws(() => Auth.setRole(a, u.id, u.id, { admin: false }), e => e.code === 'last_admin');
  assert.throws(() => Auth.removeUser(a, u.id, u.id), e => e.code === 'self');
  Auth.removeUser(a, u.id, admin.id);                           // menghapus non-admin diperbolehkan
  assert.strictEqual(a.users.length, 1);
});
test('reset sandi oleh admin: wajib ganti, hitungan gagal dihapus, sesi dicabut', async () => {
  const a = Auth.emptyAuth(); const admin = await reg(a, {}); const u = await reg(a, { email: 'budi@numind.id', name: 'Budi' });
  for (let i = 0; i < 5; i++) await lg(a, 'budi@numind.id', 'salah-banget-' + i, { now: 100 }).catch(() => {});
  assert.ok(Auth.lockLeft(a, 'budi@numind.id', 100) > 0);
  const s = Auth.makeSession(u, {});
  await Auth.resetPassword(a, admin.id, u.id, 'sementara-baru-5', { iterations: IT });
  assert.strictEqual(u.mustChange, true); assert.strictEqual(Auth.lockLeft(a, 'budi@numind.id', 100), 0); assert.strictEqual(Auth.resolveSession(a, s), null);
  assert.ok(await lg(a, 'budi@numind.id', 'sementara-baru-5'));
  await rejects(Auth.resetPassword(a, admin.id, u.id, '123', { iterations: IT }), 'password');
});
test('pendaftaran mandiri bisa ditutup; admin tetap bisa menambah akun', async () => {
  const a = Auth.emptyAuth(); const admin = await reg(a, {});
  Auth.setAllowSignup(a, admin.id, false);
  await rejects(reg(a, { email: 'budi@numind.id', name: 'Budi' }), 'signup_closed');
  const u = await reg(a, { email: 'budi@numind.id', name: 'Budi' }, { by: admin.id });
  assert.ok(u);
});
test('hapus pengguna', async () => {
  const a = Auth.emptyAuth(); const admin = await reg(a, {}); const u = await reg(a, { email: 'budi@numind.id', name: 'Budi' });
  Auth.removeUser(a, admin.id, u.id); assert.strictEqual(a.users.length, 1);
});
test('ubah nama profil divalidasi', async () => {
  const a = Auth.emptyAuth(); const u = await reg(a, {});
  Auth.updateProfile(a, u.id, { name: '  Rina   Putri Lestari ' }); assert.strictEqual(u.name, 'Rina Putri Lestari');
  assert.throws(() => Auth.updateProfile(a, u.id, { name: '' }), e => e.code === 'name');
});
test('publicUser tidak membocorkan hash; validateAuth memperbaiki data rusak', async () => {
  const a = Auth.emptyAuth(); const u = await reg(a, {});
  const p = Auth.publicUser(u); assert.ok(!('pw' in p)); assert.ok(!JSON.stringify(p).includes(u.pw.hash));
  assert.deepStrictEqual(Auth.validateAuth(null).users, []);
  const bad = Auth.validateAuth({ users: [{ id: 'x' }, JSON.parse(JSON.stringify(u))] });
  assert.strictEqual(bad.users.length, 1); assert.strictEqual(bad.allowSignup, true);
});
test('serialisasi JSON bolak-balik tidak merusak verifikasi (penyimpanan IndexedDB/JSON)', async () => {
  const a = Auth.emptyAuth(); await reg(a, {});
  const b = Auth.validateAuth(JSON.parse(JSON.stringify(a)));
  assert.ok(await lg(b, 'rina@numind.id', 'kopi-susu-77'));
});
test('Unicode pada kata sandi dinormalkan (NFKC) dan tetap bisa dipakai', async () => {
  const a = Auth.emptyAuth(); await reg(a, { password: 'kata-sandi-é-2026' });
  assert.ok(await lg(a, 'rina@numind.id', 'kata-sandi-é-2026'));
});

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); pass++; console.log('  ok   ' + name); }
    catch (e) { fail++; console.log('  GAGAL ' + name + '\n        ' + (e && e.stack || e).toString().split('\n').slice(0, 4).join('\n        ')); }
  }
  console.log('\n' + pass + ' lulus, ' + fail + ' gagal');
  process.exit(fail ? 1 : 0);
})();
