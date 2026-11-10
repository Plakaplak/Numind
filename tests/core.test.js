/* Tes otomatis logika inti. Jalankan:  node tests/core.test.js */
'use strict';
const assert = require('assert');
const C = require('../js/core.js');
const { TX, CL, FUND } = C;

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok   ' + name); }
  catch (e) { failed++; console.log('  GAGAL ' + name + '\n        ' + (e && e.message)); if (process.env.VERBOSE) console.log(e.stack); }
}
function throwsCode(fn, code) {
  try { fn(); } catch (e) { assert.strictEqual(e.code, code, 'kode error seharusnya ' + code + ' tapi ' + e.code + ' (' + e.message + ')'); return e; }
  assert.fail('seharusnya melempar error ' + code);
}

C.setClock(() => new Date('2026-11-10T10:00:00'));
const producer = { name: 'Raka', role: 'producer' };
const finance = { name: 'Dewi', role: 'finance' };
const director = { name: 'Hendra', role: 'director' };

function fresh() {
  const s = C.emptyState();
  const p = C.createProject(s, { name: 'Project A', budget: 10000000 });
  return { s, p };
}
let n = 0;
function exp(s, p, o) {
  n++;
  return C.addExpense(s, Object.assign({ date: '2026-11-05', projectId: p.id, category: 'Konsumsi', description: 'Item ' + n, amount: 100000 + n, fund: FUND.PERSONAL, photoId: 'p' + n, photoHash: 'h' + n }, o), producer);
}

console.log('Transaksi & status');
test('nota lengkap -> Tercatat, tanpa nota -> Draft', () => {
  const { s, p } = fresh();
  assert.strictEqual(exp(s, p).status, TX.RECORDED);
  assert.strictEqual(exp(s, p, { photoId: null, photoHash: null }).status, TX.DRAFT);
});
test('tanpa nota + alasan -> Tercatat, alasan pendek ditolak', () => {
  const { s, p } = fresh();
  assert.strictEqual(exp(s, p, { photoId: null, photoHash: null, noReceipt: true, noReceiptReason: 'Karcis parkir tidak diberikan' }).status, TX.RECORDED);
  assert.throws(() => exp(s, p, { photoId: null, photoHash: null, noReceipt: true, noReceiptReason: 'x' }), /alasan/i);
});
test('validasi: tanggal masa depan, nominal 0, tanpa project, kategori salah', () => {
  const { s, p } = fresh();
  assert.throws(() => exp(s, p, { date: '2026-11-11' }), /masa depan/);
  assert.throws(() => exp(s, p, { amount: 0 }), /Nominal/);
  assert.throws(() => exp(s, p, { projectId: 'nope' }), /project/i);
  assert.throws(() => exp(s, p, { category: 'Asal' }), /kategori/i);
  assert.throws(() => exp(s, p, { fund: 'lain' }), /sumber dana/i);
});
test('mendeteksi duplikat dan butuh konfirmasi', () => {
  const { s, p } = fresh();
  exp(s, p, { amount: 250000, date: '2026-11-04', photoId: 'a', photoHash: 'same' });
  const e = throwsCode(() => exp(s, p, { amount: 250000, date: '2026-11-04', photoId: 'b', photoHash: 'same2' }), 'duplicate');
  assert.ok(e.duplicates.length === 1);
  const e2 = throwsCode(() => exp(s, p, { amount: 99, photoId: 'c', photoHash: 'same' }), 'duplicate');
  assert.ok(e2.duplicates[0].reasons.includes('Foto nota yang sama'));
  const t = C.addExpense(s, { date: '2026-11-04', projectId: p.id, category: 'Konsumsi', description: 'Konfirmasi', amount: 250000, fund: FUND.PERSONAL, photoId: 'd', photoHash: 'h-d' }, producer, { confirmDuplicate: true });
  assert.strictEqual(t.dupConfirmed, true);
});
test('mengedit Draft + menambah nota -> Tercatat; foto lama dilaporkan', () => {
  const { s, p } = fresh();
  const t = exp(s, p, { photoId: null, photoHash: null });
  const r = C.updateExpense(s, t.id, { photoId: 'baru', photoHash: 'hb' }, producer);
  assert.strictEqual(r.tx.status, TX.RECORDED);
  const r2 = C.updateExpense(s, t.id, { photoId: 'ganti', photoHash: 'hc' }, producer);
  assert.strictEqual(r2.removedPhotoId, 'baru');
});

console.log('Menutup project');
test('Draft menghalangi penutupan; setelah dihapus bisa ditutup -> Siap Reimburse', () => {
  const { s, p } = fresh();
  const a = exp(s, p); const d = exp(s, p, { photoId: null, photoHash: null });
  throwsCode(() => C.closeProject(s, p.id, producer), 'blocked');
  C.deleteTransaction(s, d.id);
  C.closeProject(s, p.id, producer);
  assert.strictEqual(a.status, TX.READY);
  assert.strictEqual(p.status, 'Selesai');
});
test('transaksi baru di project tertutup langsung Siap Reimburse', () => {
  const { s, p } = fresh(); exp(s, p); C.closeProject(s, p.id, producer);
  assert.strictEqual(exp(s, p).status, TX.READY);
});
test('buka kembali project mengembalikan status; diblokir jika sudah diajukan', () => {
  const { s, p } = fresh(); const a = exp(s, p); C.closeProject(s, p.id, producer);
  C.reopenProject(s, p.id, producer);
  assert.strictEqual(a.status, TX.RECORDED);
  C.closeProject(s, p.id, producer);
  C.submitClaim(s, { mode: 'project', fund: FUND.PERSONAL, projectIds: [p.id] }, producer);
  throwsCode(() => C.reopenProject(s, p.id, producer), 'blocked');
});

console.log('Pengajuan & anti-ganda');
test('per project: wajib ditutup dulu', () => {
  const { s, p } = fresh(); exp(s, p);
  throwsCode(() => C.submitClaim(s, { mode: 'project', fund: FUND.PERSONAL, projectIds: [p.id] }, producer), 'blocked');
});
test('per project: Draft memblokir pengajuan', () => {
  const { s, p } = fresh(); exp(s, p); C.closeProject(s, p.id, producer);
  exp(s, p, { photoId: null, photoHash: null }); // Draft baru di project tertutup
  throwsCode(() => C.submitClaim(s, { mode: 'project', fund: FUND.PERSONAL, projectIds: [p.id] }, producer), 'blocked');
});
test('transaksi tidak bisa masuk dua kali (project lalu periode)', () => {
  const { s, p } = fresh(); const a = exp(s, p); const b = exp(s, p);
  C.closeProject(s, p.id, producer);
  const c1 = C.submitClaim(s, { mode: 'project', fund: FUND.PERSONAL, projectIds: [p.id] }, producer);
  assert.strictEqual(c1.txIds.length, 2);
  assert.strictEqual(a.claimId, c1.id);
  throwsCode(() => C.submitClaim(s, { mode: 'periode', fund: FUND.PERSONAL, projectIds: [], period: '2026-11' }, producer), 'empty');
  assert.strictEqual(b.status, TX.WAITING);
  assert.ok(C.integrityCheck(s).ok);
});
test('hybrid: pengajuan periode menggabung beberapa project, lalu project hanya sisanya', () => {
  const s = C.emptyState();
  const p1 = C.createProject(s, { name: 'P1', budget: 1 }), p2 = C.createProject(s, { name: 'P2', budget: 1 });
  exp(s, p1, { date: '2026-10-10' }); exp(s, p2, { date: '2026-10-12' }); exp(s, p1, { date: '2026-11-02' });
  const c = C.submitClaim(s, { mode: 'periode', fund: FUND.PERSONAL, projectIds: [], period: '2026-10' }, producer);
  assert.strictEqual(c.txIds.length, 2);
  assert.strictEqual(c.projectIds.length, 2);
  C.closeProject(s, p1.id, producer);
  const c2 = C.submitClaim(s, { mode: 'project', fund: FUND.PERSONAL, projectIds: [p1.id] }, producer);
  assert.strictEqual(c2.txIds.length, 1);
  assert.ok(C.integrityCheck(s).ok);
});
test('periode: Draft tidak ikut diajukan, tapi tidak memblokir', () => {
  const { s, p } = fresh(); exp(s, p); exp(s, p, { photoId: null, photoHash: null });
  const c = C.submitClaim(s, { mode: 'periode', fund: FUND.PERSONAL, projectIds: [], period: '2026-11' }, producer);
  assert.strictEqual(c.txIds.length, 1);
});
test('dana pribadi & perusahaan dipisah ke pengajuan berbeda', () => {
  const { s, p } = fresh(); exp(s, p); exp(s, p, { fund: FUND.COMPANY });
  C.closeProject(s, p.id, producer);
  const a = C.submitClaim(s, { mode: 'project', fund: FUND.PERSONAL, projectIds: [p.id] }, producer);
  const b = C.submitClaim(s, { mode: 'project', fund: FUND.COMPANY, projectIds: [p.id] }, producer);
  assert.ok(a.number.startsWith('RB-') && b.number.startsWith('PC-'));
  assert.strictEqual(a.txIds.length, 1); assert.strictEqual(b.txIds.length, 1);
  assert.notStrictEqual(a.number, b.number);
});
test('nomor pengajuan berurutan', () => {
  const { s, p } = fresh(); exp(s, p, { date: '2026-10-01' }); exp(s, p, { date: '2026-11-01' });
  const a = C.submitClaim(s, { mode: 'periode', fund: FUND.PERSONAL, projectIds: [], period: '2026-10' }, producer);
  const b = C.submitClaim(s, { mode: 'periode', fund: FUND.PERSONAL, projectIds: [], period: '2026-11' }, producer);
  assert.strictEqual(a.number, 'RB-202611-001'); assert.strictEqual(b.number, 'RB-202611-002');
});
test('transaksi dalam pengajuan terkunci (tidak bisa diubah/dihapus)', () => {
  const { s, p } = fresh(); const a = exp(s, p);
  C.submitClaim(s, { mode: 'periode', fund: FUND.PERSONAL, projectIds: [], period: '2026-11' }, producer);
  throwsCode(() => C.updateExpense(s, a.id, { amount: 1 }, producer), 'locked');
  throwsCode(() => C.deleteTransaction(s, a.id), 'locked');
});

console.log('Approval, revisi, penolakan, pembayaran');
function submitted(count, fund) {
  const { s, p } = fresh();
  const items = []; for (let i = 0; i < count; i++) items.push(exp(s, p, { fund: fund || FUND.PERSONAL }));
  const c = C.submitClaim(s, { mode: 'periode', fund: fund || FUND.PERSONAL, projectIds: [], period: '2026-11' }, producer);
  return { s, p, items, c };
}
test('Producer tidak boleh menyetujui; Finance/Director boleh', () => {
  const { s, c } = submitted(2);
  throwsCode(() => C.approveClaim(s, c.id, '', producer), 'forbidden');
  C.approveClaim(s, c.id, 'ok', director);
  assert.strictEqual(c.status, CL.APPROVED);
});
test('alur penuh: revisi -> perbaiki -> ajukan ulang -> setujui -> bayar', () => {
  const { s, items, c } = submitted(3);
  C.flagRevision(s, c.id, items[0].id, 'Nota buram, foto ulang', finance);
  throwsCode(() => C.approveClaim(s, c.id, '', finance), 'blocked');
  C.sendRevision(s, c.id, '', finance);
  assert.strictEqual(c.status, CL.REVISION);
  throwsCode(() => C.resubmitClaim(s, c.id, producer), 'blocked');
  assert.throws(() => C.updateExpense(s, items[0].id, { amount: 123000 }, producer), /catatan perbaikan/);
  C.updateExpense(s, items[0].id, { amount: 123000, photoId: 'foto-baru', photoHash: 'hb', revReply: 'Foto sudah diganti' }, producer);
  C.resubmitClaim(s, c.id, producer);
  assert.strictEqual(c.status, CL.WAITING); assert.strictEqual(c.revisionCount, 1);
  assert.ok(items.every(t => t.status === TX.WAITING));
  C.approveClaim(s, c.id, '', finance);
  assert.ok(items.every(t => t.status === TX.APPROVED));
  throwsCode(() => C.payClaim(s, c.id, { date: '2026-11-10' }, producer), 'forbidden');
  throwsCode(() => C.payClaim(s, c.id, { date: '2026-11-10' }, finance), 'invalid'); // metode wajib
  C.payClaim(s, c.id, { date: '2026-11-10', method: 'Transfer', ref: 'TRF-1' }, finance);
  assert.strictEqual(c.status, CL.PAID);
  assert.ok(items.every(t => t.status === TX.PAID));
  assert.strictEqual(c.total, items.reduce((a, t) => a + t.amount, 0));
  assert.ok(C.integrityCheck(s).ok, JSON.stringify(C.integrityCheck(s).issues));
});
test('transaksi Dibayar tidak bisa diajukan ulang / diubah / dihapus', () => {
  const { s, items, c } = submitted(1);
  C.approveClaim(s, c.id, '', finance); C.payClaim(s, c.id, { method: 'Transfer' }, finance);
  throwsCode(() => C.submitClaim(s, { mode: 'periode', fund: FUND.PERSONAL, projectIds: [], period: '2026-11' }, producer), 'empty');
  throwsCode(() => C.updateExpense(s, items[0].id, { amount: 5 }, producer), 'locked');
  throwsCode(() => C.deleteTransaction(s, items[0].id), 'locked');
});
test('tolak satu baris: total dihitung ulang; semua ditolak -> pengajuan ditolak', () => {
  const { s, items, c } = submitted(2);
  const before = c.total;
  C.rejectLine(s, c.id, items[0].id, 'Bukan biaya project', finance);
  assert.strictEqual(c.total, before - items[0].amount);
  assert.strictEqual(c.rejectedTotal, items[0].amount);
  C.rejectLine(s, c.id, items[1].id, 'Nota tidak sah', finance);
  assert.strictEqual(c.status, CL.REJECTED);
  assert.ok(C.integrityCheck(s).ok);
});
test('tolak semua; transaksi Ditolak final (tidak bisa diajukan lagi)', () => {
  const { s, items, c } = submitted(2);
  throwsCode(() => C.rejectClaim(s, c.id, '', finance), 'invalid');
  C.rejectClaim(s, c.id, 'Di luar kebijakan', finance);
  assert.ok(items.every(t => t.status === TX.REJECTED));
  throwsCode(() => C.submitClaim(s, { mode: 'periode', fund: FUND.PERSONAL, projectIds: [], period: '2026-11' }, producer), 'empty');
});
test('setujui sebagian setelah ada baris ditolak', () => {
  const { s, items, c } = submitted(3);
  C.rejectLine(s, c.id, items[2].id, 'Tidak relevan', finance);
  C.approveClaim(s, c.id, '', finance);
  assert.strictEqual(items[2].status, TX.REJECTED);
  assert.strictEqual(items[0].status, TX.APPROVED);
  assert.strictEqual(c.total, items[0].amount + items[1].amount);
  assert.ok(C.integrityCheck(s).ok);
});
test('tarik pengajuan: transaksi bebas lagi dan bisa diajukan ulang tanpa ganda', () => {
  const { s, items, c } = submitted(2);
  C.cancelClaim(s, c.id, 'Salah periode', producer);
  assert.strictEqual(c.status, CL.CANCELLED);
  assert.ok(items.every(t => t.claimId === null && t.status === TX.RECORDED));
  const c2 = C.submitClaim(s, { mode: 'periode', fund: FUND.PERSONAL, projectIds: [], period: '2026-11' }, producer);
  assert.strictEqual(c2.txIds.length, 2);
  assert.ok(C.integrityCheck(s).ok);
  throwsCode(() => C.cancelClaim(s, c2.id, '', producer) && C.cancelClaim(s, c.id, '', producer), 'state');
});
test('tidak bisa menarik pengajuan yang sudah disetujui', () => {
  const { s, c } = submitted(1);
  C.approveClaim(s, c.id, '', finance);
  throwsCode(() => C.cancelClaim(s, c.id, '', producer), 'state');
});
test('petty cash: selesai tanpa metode pembayaran', () => {
  const { s, c } = submitted(1, FUND.COMPANY);
  C.approveClaim(s, c.id, '', finance); C.payClaim(s, c.id, {}, finance);
  assert.strictEqual(c.status, CL.PAID); assert.strictEqual(c.payment.method, '');
});
test('claimCapabilities mengikuti peran & status', () => {
  const { s, items, c } = submitted(2);
  assert.strictEqual(C.claimCapabilities(s, c, 'producer').canApprove, false);
  assert.strictEqual(C.claimCapabilities(s, c, 'finance').canApprove, true);
  C.flagRevision(s, c.id, items[0].id, 'perbaiki', finance);
  const cap = C.claimCapabilities(s, c, 'finance');
  assert.strictEqual(cap.canApprove, false); assert.strictEqual(cap.canSendRevision, true);
});

console.log('Keuangan & laporan');
test('statistik project: budget, terpakai, piutang, saldo', () => {
  const { s, p } = fresh();
  C.addIncome(s, { date: '2026-11-01', projectId: p.id, category: 'DP / Termin', description: 'DP', amount: 5000000 }, producer);
  exp(s, p, { amount: 1000000 }); exp(s, p, { amount: 500000, fund: FUND.COMPANY }); exp(s, p, { amount: 200000, photoId: null, photoHash: null });
  const st = C.projectStats(s, p.id);
  assert.strictEqual(st.spent, 1700000); assert.strictEqual(st.spentPersonal, 1200000); assert.strictEqual(st.spentCompany, 500000);
  assert.strictEqual(st.receivable, 1000000); // Draft tidak dihitung piutang
  assert.strictEqual(st.drafts, 1); assert.strictEqual(st.income, 5000000); assert.strictEqual(st.balance, 3300000);
  assert.ok(Math.abs(st.usedPct - 0.17) < 1e-9);
});
test('petty cash: top-up masuk, dana perusahaan keluar, saldo berjalan', () => {
  const { s, p } = fresh();
  C.addIncome(s, { date: '2026-11-01', category: C.PETTY_TOPUP, description: 'Top-up', amount: 1000000 }, producer);
  exp(s, p, { fund: FUND.COMPANY, amount: 250000, date: '2026-11-02' });
  exp(s, p, { fund: FUND.PERSONAL, amount: 777000 });
  const pc = C.pettyCash(s);
  assert.strictEqual(pc.balance, 750000); assert.strictEqual(pc.entries.length, 2); assert.strictEqual(pc.entries[1].balance, 750000);
});
test('pemasukan klien wajib project; top-up petty cash tidak', () => {
  const { s } = fresh();
  assert.throws(() => C.addIncome(s, { date: '2026-11-01', category: 'Pembayaran Klien', description: 'x1', amount: 5 }, producer), /project/i);
  assert.ok(C.addIncome(s, { date: '2026-11-01', category: C.PETTY_TOPUP, description: 'x1', amount: 5 }, producer));
});
test('laporan & breakdown kategori & seri bulanan', () => {
  const { s, p } = fresh();
  exp(s, p, { category: 'Konsumsi', amount: 300000, date: '2026-10-20' }); exp(s, p, { category: 'Konsumsi', amount: 200000 }); exp(s, p, { category: 'Transportasi', amount: 100000 });
  C.addIncome(s, { date: '2026-11-02', projectId: p.id, category: 'DP / Termin', description: 'DP', amount: 900000 }, producer);
  const cat = C.categoryBreakdown(s);
  assert.strictEqual(cat[0].category, 'Konsumsi'); assert.strictEqual(cat[0].total, 500000);
  const ser = C.monthlySeries(s, 3, '2026-11-10');
  assert.deepStrictEqual(ser.map(x => x.key), ['2026-09', '2026-10', '2026-11']);
  assert.strictEqual(ser[1].expense, 300000); assert.strictEqual(ser[2].income, 900000);
  const r = C.reportData(s, { from: '2026-11-01', to: '2026-11-30' });
  assert.strictEqual(r.totals.expense, 300000); assert.strictEqual(r.totals.net, 600000);
});

console.log('Integritas, CSV, backup, data contoh');
test('integrityCheck mendeteksi transaksi ganda di dua pengajuan', () => {
  const { s, items, c } = submitted(2);
  const hacked = JSON.parse(JSON.stringify(c)); hacked.id = 'clm_x'; hacked.number = 'RB-HACK'; hacked.txIds = [items[0].id];
  s.claims.push(hacked);
  const r = C.integrityCheck(s);
  assert.strictEqual(r.ok, false);
  assert.ok(r.issues.some(i => /lebih dari satu pengajuan/.test(i.msg)));
});
test('integrityCheck mendeteksi total tidak cocok', () => {
  const { s, c } = submitted(1); c.total += 1;
  assert.ok(C.integrityCheck(s).issues.some(i => /Total/.test(i.msg)));
});
test('CSV: koma, kutip, baris baru, dan proteksi formula', () => {
  const csv = C.toCSV(['A', 'B'], [['=SUM(A1)', 'a,b'], ['"q"', 'x\ny'], [5, -3]], ',');
  const lines = csv.split('\r\n');
  assert.strictEqual(lines[1], "'=SUM(A1),\"a,b\"");
  assert.ok(csv.includes('"""q"""'));
  assert.ok(csv.includes('5,-3'));
});
test('ekspor CSV transaksi & pengajuan berisi data', () => {
  const { s, c } = submitted(2);
  assert.strictEqual(C.csvTransactions(s, {}, ';').split('\r\n').length, 3);
  assert.ok(C.csvClaims(s, ',').includes(c.number));
  assert.ok(C.csvClaimDetail(s, c.id, ',').includes('TOTAL'));
  assert.ok(C.csvProjects(s, ',').includes('Project A'));
});
test('backup -> restore menghasilkan data identik dan terverifikasi', () => {
  const { s, c } = submitted(2);
  const json = JSON.parse(JSON.stringify(C.exportBackup(s)));
  const r = C.importBackup(json);
  assert.strictEqual(r.state.claims.length, 1); assert.strictEqual(r.integrity.ok, true);
  assert.throws(() => C.importBackup({ app: 'lain' }), /bukan berkas/i);
  assert.throws(() => C.importBackup({ app: 'kasproyek', data: { projects: [] } }), /rusak/i);
});
test('data contoh: lengkap dan lolos pemeriksaan integritas', () => {
  const s = C.emptyState(); C.seedDemo(s);
  assert.strictEqual(s.projects.length, 3);
  assert.ok(s.transactions.length > 30);
  const by = st => s.claims.filter(c => c.status === st).length;
  assert.ok(by(CL.PAID) >= 2, 'ada pengajuan Dibayar');
  assert.ok(by(CL.WAITING) >= 1, 'ada pengajuan Menunggu Approval');
  assert.ok(by(CL.REVISION) >= 1, 'ada pengajuan Revisi');
  assert.ok(s.transactions.some(t => t.status === TX.DRAFT), 'ada Draft');
  assert.ok(s.transactions.some(t => t.status === TX.RECORDED && !t.claimId), 'ada Tercatat belum diajukan');
  const chk = C.integrityCheck(s);
  assert.ok(chk.ok, JSON.stringify(chk.issues));
  assert.ok(C.pettyCash(s).balance > 0);
  assert.ok(C.dashboard(s).claims.cur.requested + C.dashboard(s).claims.prev.requested >= 2);
});
test('data contoh tetap valid untuk tanggal "hari ini" lain (tanggal 1 & 31)', () => {
  for (const day of ['2026-12-01', '2027-01-31', '2026-03-02']) {
    C.setClock(() => new Date(day + 'T10:00:00'));
    const s = C.emptyState(); C.seedDemo(s);
    const chk = C.integrityCheck(s);
    assert.ok(chk.ok, day + ' ' + JSON.stringify(chk.issues));
  }
  C.setClock(() => new Date('2026-11-10T10:00:00'));
});

console.log('\n' + passed + ' lulus, ' + failed + ' gagal');
process.exit(failed ? 1 : 0);
