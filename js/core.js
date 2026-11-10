/* ==========================================================================
   core.js — Logika keuangan KasProyek (murni, tanpa DOM).
   Dipakai oleh browser (window.Core) dan Node (tes otomatis).

   Aturan emas yang dijaga di sini:
   1. Satu transaksi hanya boleh masuk SATU pengajuan (claimId tunggal).
   2. Transaksi yang sudah Dibayar / Ditolak tidak bisa diajukan lagi.
   3. Dana pribadi  -> piutang reimbursement ke perusahaan.
      Dana perusahaan -> pemakaian petty cash (laporan pertanggungjawaban, tanpa pembayaran).
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Core = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- Konstanta ---------- */
  const TX = Object.freeze({
    DRAFT: 'Draft', RECORDED: 'Tercatat', READY: 'Siap Reimburse',
    WAITING: 'Menunggu Approval', REVISION: 'Revisi', APPROVED: 'Disetujui',
    PAID: 'Dibayar', REJECTED: 'Ditolak'
  });
  const CL = Object.freeze({
    WAITING: 'Menunggu Approval', REVISION: 'Revisi', APPROVED: 'Disetujui',
    PAID: 'Dibayar', REJECTED: 'Ditolak', CANCELLED: 'Dibatalkan'
  });
  const FUND = Object.freeze({ PERSONAL: 'pribadi', COMPANY: 'perusahaan' });
  const FUND_LABEL = { pribadi: 'Dana pribadi Team', perusahaan: 'Dana operasional perusahaan' };
  const ROLES = { producer: 'Team', finance: 'Finance', director: 'Director' };
  const PERMS = { approve: ['finance', 'director'], pay: ['finance', 'director'] };

  const CATEGORIES_EXPENSE = [
    'Talent & Model', 'Crew & Freelance', 'Sewa Peralatan', 'Lokasi & Perizinan',
    'Properti & Set', 'Wardrobe & MUA', 'Konsumsi', 'Transportasi', 'Akomodasi',
    'Post-Production', 'Software & Lisensi', 'Percetakan & Produksi', 'Perlengkapan', 'Lain-lain'
  ];
  const CATEGORIES_INCOME = ['Pembayaran Klien', 'DP / Termin', 'Top-up Petty Cash', 'Lain-lain'];
  const PETTY_TOPUP = 'Top-up Petty Cash';
  const MAX_AMOUNT = 1e12;

  class CoreError extends Error {
    constructor(message, code) { super(message); this.name = 'CoreError'; this.code = code || 'invalid'; }
  }
  const err = (m, c) => new CoreError(m, c);

  /* ---------- Waktu & utilitas ---------- */
  let _now = () => new Date();
  function setClock(fn) { _now = fn || (() => new Date()); }
  function withClock(dateStr, fn) {
    const prev = _now;
    const base = new Date(dateStr + 'T10:00:00');
    let tick = 0;
    _now = () => new Date(base.getTime() + (tick++) * 1000);
    try { return fn(); } finally { _now = prev; }
  }
  const pad = n => String(n).padStart(2, '0');
  function fmtDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function nowISO() { return _now().toISOString(); }
  function todayStr() { return fmtDate(_now()); }
  function isValidDate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, d] = s.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  }
  function isValidMonth(s) { return typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s); }
  function addDays(dateStr, n) { const [y, m, d] = dateStr.split('-').map(Number); return fmtDate(new Date(y, m - 1, d + n)); }
  function addMonths(ym, n) { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function monthKey(dateStr) { return String(dateStr || '').slice(0, 7); }
  function lastDayOfMonth(ym) { const [y, m] = ym.split('-').map(Number); return fmtDate(new Date(y, m, 0)); }
  function money(n) { const v = Math.round(Number(n)); return Number.isFinite(v) ? v : 0; }
  const sum = (arr, f) => arr.reduce((a, x) => a + (f ? f(x) : x), 0);
  let _seq = 0;
  function uid(prefix) { return prefix + '_' + Date.now().toString(36) + (++_seq).toString(36) + Math.random().toString(36).slice(2, 6); }
  const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

  function emptyState() {
    return {
      v: 1,
      settings: { company: 'Numind', userName: '', role: 'producer', csvSemicolon: true, last: {} },
      projects: [], transactions: [], claims: [], receipts: [], counters: {}
    };
  }

  /* ---------- Pencarian entitas ---------- */
  function getProject(state, id) { const p = state.projects.find(x => x.id === id); if (!p) throw err('Project tidak ditemukan.', 'notfound'); return p; }
  function getTx(state, id) { const t = state.transactions.find(x => x.id === id); if (!t) throw err('Transaksi tidak ditemukan.', 'notfound'); return t; }
  function getClaim(state, id) { const c = state.claims.find(x => x.id === id); if (!c) throw err('Pengajuan tidak ditemukan.', 'notfound'); return c; }
  function claimItems(state, claim) {
    const m = new Map(state.transactions.map(t => [t.id, t]));
    return claim.txIds.map(id => m.get(id)).filter(Boolean);
  }
  function assertCan(actor, perm) {
    if (!actor || !PERMS[perm].includes(actor.role)) {
      throw err('Peran ' + (ROLES[actor && actor.role] || 'ini') + ' tidak punya izin untuk aksi ini. Hanya Finance atau Director yang bisa melakukannya.', 'forbidden');
    }
  }
  function logTo(entity, action, actor, note) {
    (entity.history = entity.history || []).push({ at: nowISO(), action, by: (actor && actor.name) || '-', role: (actor && actor.role) || '', note: note || '' });
  }

  /* ---------- Project ---------- */
  function nextProjectCode(state) {
    const t = todayStr(); const yymm = t.slice(2, 4) + t.slice(5, 7);
    let n = state.projects.filter(p => p.code.startsWith('PRJ-' + yymm)).length + 1, code;
    do { code = 'PRJ-' + yymm + '-' + pad(n); n++; } while (state.projects.some(p => p.code === code));
    return code;
  }
  function cleanProject(state, d, existing) {
    const name = (d.name || '').trim();
    if (!name) throw err('Nama project wajib diisi.');
    const budget = money(d.budget || 0);
    if (budget < 0 || budget > MAX_AMOUNT) throw err('Budget tidak valid.');
    if (d.startDate && !isValidDate(d.startDate)) throw err('Tanggal mulai tidak valid.');
    if (d.endDate && !isValidDate(d.endDate)) throw err('Tanggal selesai tidak valid.');
    if (d.startDate && d.endDate && d.endDate < d.startDate) throw err('Tanggal selesai tidak boleh sebelum tanggal mulai.');
    const code = (d.code || '').trim() || (existing ? existing.code : nextProjectCode(state));
    if (state.projects.some(p => p.code.toLowerCase() === code.toLowerCase() && (!existing || p.id !== existing.id))) throw err('Kode project "' + code + '" sudah dipakai.');
    return { code, name, client: (d.client || '').trim(), budget, startDate: d.startDate || '', endDate: d.endDate || '', pic: (d.pic || '').trim(), notes: (d.notes || '').trim() };
  }
  function createProject(state, d) {
    const p = Object.assign({ id: uid('prj'), status: 'Berjalan', createdAt: nowISO(), closedAt: null }, cleanProject(state, d));
    state.projects.push(p); return p;
  }
  function updateProject(state, id, d) {
    const p = getProject(state, id);
    Object.assign(p, cleanProject(state, Object.assign({}, p, d), p));
    return p;
  }
  function deleteProject(state, id) {
    getProject(state, id);
    if (state.transactions.some(t => t.projectId === id)) throw err('Project yang sudah punya transaksi tidak bisa dihapus.');
    state.projects = state.projects.filter(p => p.id !== id);
  }
  const isClosed = p => p.status === 'Selesai';

  /* ---------- Transaksi pengeluaran ---------- */
  function isComplete(t) {
    if (t.type === 'income') return true;
    return !!t.photoId || (!!t.noReceipt && (t.noReceiptReason || '').trim().length >= 5);
  }
  function unclaimedStatus(state, t) {
    if (!isComplete(t)) return TX.DRAFT;
    const p = state.projects.find(x => x.id === t.projectId);
    return p && isClosed(p) ? TX.READY : TX.RECORDED;
  }
  function cleanExpense(state, d) {
    const o = {};
    if (!isValidDate(d.date)) throw err('Tanggal tidak valid.');
    if (d.date > todayStr()) throw err('Tanggal pengeluaran tidak boleh di masa depan.');
    o.date = d.date;
    const prj = state.projects.find(p => p.id === d.projectId);
    if (!prj) throw err('Pilih project untuk pengeluaran ini.');
    o.projectId = prj.id;
    if (!CATEGORIES_EXPENSE.includes(d.category)) throw err('Pilih kategori pengeluaran.');
    o.category = d.category;
    o.description = (d.description || '').trim();
    if (o.description.length < 2) throw err('Deskripsi pengeluaran wajib diisi.');
    o.vendor = (d.vendor || '').trim();
    const amt = money(d.amount);
    if (!(amt > 0)) throw err('Nominal harus lebih dari 0.');
    if (amt > MAX_AMOUNT) throw err('Nominal terlalu besar.');
    o.amount = amt;
    if (d.fund !== FUND.PERSONAL && d.fund !== FUND.COMPANY) throw err('Pilih sumber dana.');
    o.fund = d.fund;
    o.notaNo = (d.notaNo || '').trim();
    o.photoId = d.photoId || null;
    o.photoHash = o.photoId ? (d.photoHash || null) : null;
    o.noReceipt = !o.photoId && !!d.noReceipt;
    o.noReceiptReason = o.noReceipt ? (d.noReceiptReason || '').trim() : '';
    if (o.noReceipt && o.noReceiptReason.length < 5) throw err('Tulis alasan kenapa tidak ada nota (minimal 5 karakter).');
    return o;
  }

  /** Cari transaksi yang kemungkinan sama. Tidak melempar error — UI meminta konfirmasi. */
  function findDuplicates(state, d, excludeId) {
    const res = [];
    for (const t of state.transactions) {
      if (t.type !== 'expense' || t.id === excludeId || t.status === TX.REJECTED) continue;
      const reasons = [];
      if (d.photoHash && t.photoHash && d.photoHash === t.photoHash) reasons.push('Foto nota yang sama');
      if (d.notaNo && t.notaNo && norm(d.notaNo) === norm(t.notaNo) && (!d.vendor || !t.vendor || norm(d.vendor) === norm(t.vendor))) reasons.push('Nomor nota yang sama');
      if (d.date && d.date === t.date && money(d.amount) === t.amount && d.projectId === t.projectId) reasons.push('Tanggal, nominal, dan project yang sama');
      if (reasons.length) res.push({ tx: t, reasons });
    }
    return res;
  }
  function findReceiptHash(state, hash) {
    if (!hash) return null;
    const t = state.transactions.find(x => x.type === 'expense' && x.photoHash === hash && x.status !== TX.REJECTED);
    if (t) return { kind: 'tx', id: t.id, label: t.description };
    const r = state.receipts.find(x => x.hash === hash);
    if (r) return { kind: 'inbox', id: r.id, label: 'Inbox nota' };
    return null;
  }

  function addExpense(state, d, actor, opts) {
    opts = opts || {};
    const c = cleanExpense(state, d);
    const dups = findDuplicates(state, c);
    if (dups.length && !opts.confirmDuplicate) {
      const e = err('Transaksi ini mirip dengan data yang sudah ada.', 'duplicate'); e.duplicates = dups; throw e;
    }
    const tx = Object.assign({
      id: uid('trx'), type: 'expense', status: TX.DRAFT, claimId: null,
      createdBy: (actor && actor.name) || '-', createdAt: nowISO(), updatedAt: nowISO(),
      dupConfirmed: dups.length > 0, history: []
    }, c);
    tx.status = unclaimedStatus(state, tx);
    logTo(tx, 'dibuat', actor, tx.status === TX.DRAFT ? 'Draft — nota belum lengkap' : (dups.length ? 'Duplikat dikonfirmasi pengguna' : ''));
    state.transactions.push(tx);
    return tx;
  }

  function isEditable(t) {
    if (t.type === 'income') return true;
    if (t.status === TX.REVISION) return true;
    return !t.claimId && [TX.DRAFT, TX.RECORDED, TX.READY].includes(t.status);
  }
  function isDeletable(t) {
    if (t.type === 'income') return true;
    return !t.claimId && [TX.DRAFT, TX.RECORDED, TX.READY].includes(t.status);
  }

  function updateExpense(state, id, patch, actor, opts) {
    opts = opts || {};
    const t = getTx(state, id);
    if (t.type !== 'expense') throw err('Bukan transaksi pengeluaran.');
    if (!isEditable(t)) throw err('Transaksi ini sudah masuk pengajuan dan tidak bisa diubah.', 'locked');
    if (t.status === TX.REVISION) {
      if (patch.fund && patch.fund !== t.fund) throw err('Sumber dana tidak bisa diubah setelah masuk pengajuan.');
      if (!(patch.revReply || '').trim() || patch.revReply.trim().length < 3) throw err('Tulis catatan perbaikan untuk Finance.');
    }
    const merged = Object.assign({}, t, patch);
    const c = cleanExpense(state, merged);
    const dups = findDuplicates(state, c, t.id);
    if (dups.length && !opts.confirmDuplicate && (c.photoHash !== t.photoHash || c.date !== t.date || c.amount !== t.amount || c.notaNo !== t.notaNo)) {
      const e = err('Perubahan ini membuat transaksi mirip dengan data lain.', 'duplicate'); e.duplicates = dups; throw e;
    }
    const oldPhoto = t.photoId;
    Object.assign(t, c, { updatedAt: nowISO() });
    if (dups.length && opts.confirmDuplicate) t.dupConfirmed = true;
    if (t.status === TX.REVISION) {
      t.fixedAt = nowISO(); t.revReply = patch.revReply.trim();
      logTo(t, 'diperbaiki', actor, t.revReply);
    } else {
      t.status = unclaimedStatus(state, t);
      logTo(t, 'diubah', actor, '');
    }
    return { tx: t, removedPhotoId: oldPhoto && oldPhoto !== t.photoId ? oldPhoto : null };
  }

  function deleteTransaction(state, id) {
    const t = getTx(state, id);
    if (!isDeletable(t)) throw err('Transaksi yang sudah diajukan tidak bisa dihapus.', 'locked');
    state.transactions = state.transactions.filter(x => x.id !== id);
    return { removedPhotoId: t.photoId || null };
  }

  /* ---------- Pemasukan ---------- */
  function cleanIncome(state, d) {
    const o = {};
    if (!isValidDate(d.date)) throw err('Tanggal tidak valid.');
    if (d.date > todayStr()) throw err('Tanggal pemasukan tidak boleh di masa depan.');
    o.date = d.date;
    if (!CATEGORIES_INCOME.includes(d.category)) throw err('Pilih kategori pemasukan.');
    o.category = d.category;
    if (d.projectId) { getProject(state, d.projectId); o.projectId = d.projectId; }
    else {
      if (d.category !== PETTY_TOPUP && d.category !== 'Lain-lain') throw err('Pilih project untuk pembayaran dari klien.');
      o.projectId = null;
    }
    o.description = (d.description || '').trim();
    if (o.description.length < 2) throw err('Keterangan pemasukan wajib diisi.');
    o.client = (d.client || '').trim();
    o.ref = (d.ref || '').trim();
    const amt = money(d.amount);
    if (!(amt > 0)) throw err('Nominal harus lebih dari 0.');
    if (amt > MAX_AMOUNT) throw err('Nominal terlalu besar.');
    o.amount = amt;
    return o;
  }
  function addIncome(state, d, actor) {
    const c = cleanIncome(state, d);
    const tx = Object.assign({ id: uid('inc'), type: 'income', status: TX.RECORDED, claimId: null, createdBy: (actor && actor.name) || '-', createdAt: nowISO(), updatedAt: nowISO(), history: [] }, c);
    logTo(tx, 'dibuat', actor, '');
    state.transactions.push(tx);
    return tx;
  }
  function updateIncome(state, id, patch, actor) {
    const t = getTx(state, id);
    if (t.type !== 'income') throw err('Bukan transaksi pemasukan.');
    const c = cleanIncome(state, Object.assign({}, t, patch));
    Object.assign(t, c, { updatedAt: nowISO() });
    logTo(t, 'diubah', actor, '');
    return t;
  }

  /* ---------- Inbox nota (foto dulu, data menyusul) ---------- */
  function addReceiptToInbox(state, d, actor) {
    if (!d.photoId) throw err('Foto nota belum ada.');
    const hit = findReceiptHash(state, d.photoHash);
    if (hit && !d.confirmDuplicate) { const e = err('Foto ini sudah pernah diunggah.', 'duplicate'); e.hit = hit; throw e; }
    const r = { id: uid('rcp'), photoId: d.photoId, hash: d.photoHash || null, createdAt: nowISO(), by: (actor && actor.name) || '-', note: (d.note || '').trim() };
    state.receipts.push(r);
    return r;
  }
  function removeReceiptFromInbox(state, id) {
    const r = state.receipts.find(x => x.id === id);
    if (!r) throw err('Nota tidak ditemukan di inbox.', 'notfound');
    state.receipts = state.receipts.filter(x => x.id !== id);
    return { removedPhotoId: r.photoId };
  }
  /** Ubah nota di inbox menjadi pengeluaran. Foto berpindah kepemilikan ke transaksi. */
  function convertReceipt(state, receiptId, d, actor, opts) {
    const r = state.receipts.find(x => x.id === receiptId);
    if (!r) throw err('Nota tidak ditemukan di inbox.', 'notfound');
    const tx = addExpense(state, Object.assign({}, d, { photoId: r.photoId, photoHash: r.hash }), actor, opts);
    state.receipts = state.receipts.filter(x => x.id !== receiptId);
    return tx;
  }

  /* ---------- Menutup project ---------- */
  function projectExpenses(state, projectId) { return state.transactions.filter(t => t.type === 'expense' && t.projectId === projectId); }
  function projectCloseCheck(state, projectId) {
    const p = getProject(state, projectId);
    const txs = projectExpenses(state, projectId);
    const drafts = txs.filter(t => t.status === TX.DRAFT);
    const active = txs.filter(t => t.status !== TX.REJECTED);
    return { project: p, alreadyClosed: isClosed(p), drafts, count: active.length, total: sum(active, t => t.amount), ready: !isClosed(p) && drafts.length === 0 };
  }
  function closeProject(state, projectId, actor) {
    const c = projectCloseCheck(state, projectId);
    if (c.alreadyClosed) throw err('Laporan pengeluaran project ini sudah ditutup.');
    if (c.drafts.length) throw err('Masih ada ' + c.drafts.length + ' transaksi Draft (nota belum lengkap). Lengkapi atau hapus dulu sebelum menutup laporan.', 'blocked');
    const p = c.project;
    p.status = 'Selesai'; p.closedAt = nowISO();
    for (const t of projectExpenses(state, projectId)) {
      if (t.status === TX.RECORDED && !t.claimId) { t.status = TX.READY; logTo(t, 'siap reimburse', actor, 'Project ditutup'); }
    }
    return p;
  }
  function reopenProject(state, projectId, actor) {
    const p = getProject(state, projectId);
    if (!isClosed(p)) throw err('Project ini belum ditutup.');
    const claimed = projectExpenses(state, projectId).filter(t => t.claimId && t.status !== TX.REJECTED);
    if (claimed.length) throw err('Project tidak bisa dibuka kembali karena ' + claimed.length + ' transaksinya sudah masuk pengajuan.', 'blocked');
    p.status = 'Berjalan'; p.closedAt = null;
    for (const t of projectExpenses(state, projectId)) {
      if (t.status === TX.READY && !t.claimId) { t.status = TX.RECORDED; logTo(t, 'dibuka kembali', actor, 'Project dibuka kembali'); }
    }
    return p;
  }

  /* ---------- Pengajuan (claim) ---------- */
  /** q = { mode:'project'|'periode', fund, projectIds:[], period:'YYYY-MM' } */
  function eligibleForClaim(state, q) {
    const base = state.transactions.filter(t => t.type === 'expense' && t.fund === q.fund && !t.claimId);
    let scope;
    if (q.mode === 'project') {
      const id = (q.projectIds || [])[0];
      scope = base.filter(t => t.projectId === id);
    } else {
      scope = base.filter(t => monthKey(t.date) === q.period && (!q.projectIds || !q.projectIds.length || q.projectIds.includes(t.projectId)));
    }
    const items = scope.filter(t => t.status === TX.RECORDED || t.status === TX.READY);
    const drafts = scope.filter(t => t.status === TX.DRAFT);
    return { items, drafts, total: sum(items, t => t.amount) };
  }
  function nextClaimNumber(state, fund) {
    const prefix = fund === FUND.PERSONAL ? 'RB' : 'PC';
    const t = todayStr(); const ym = t.slice(0, 4) + t.slice(5, 7);
    const key = prefix + ym;
    state.counters[key] = (state.counters[key] || 0) + 1;
    return prefix + '-' + ym + '-' + String(state.counters[key]).padStart(3, '0');
  }
  function submitClaim(state, q, actor, note) {
    if (q.mode !== 'project' && q.mode !== 'periode') throw err('Pilih jenis pengajuan: per project atau per periode.');
    if (q.fund !== FUND.PERSONAL && q.fund !== FUND.COMPANY) throw err('Pilih sumber dana.');
    if (q.mode === 'project') {
      if (!q.projectIds || q.projectIds.length !== 1) throw err('Pilih satu project.');
      const p = getProject(state, q.projectIds[0]);
      if (!isClosed(p)) throw err('Project "' + p.name + '" belum ditutup. Tutup laporan pengeluaran dulu.', 'blocked');
    } else if (!isValidMonth(q.period)) throw err('Pilih periode (bulan) pengajuan.');

    const el = eligibleForClaim(state, q);
    if (q.mode === 'project' && el.drafts.length) throw err('Masih ada ' + el.drafts.length + ' transaksi Draft di project ini. Lengkapi notanya atau hapus dulu.', 'blocked');
    if (!el.items.length) throw err('Tidak ada transaksi yang bisa diajukan untuk pilihan ini.', 'empty');

    // Validasi ulang — jaga agar tidak ada transaksi ganda masuk
    for (const t of el.items) {
      if (t.claimId) throw err('Transaksi "' + t.description + '" sudah ada di pengajuan lain.', 'double');
      if (t.fund !== q.fund) throw err('Sumber dana transaksi tidak sama dengan pengajuan.', 'double');
    }
    const number = nextClaimNumber(state, q.fund);
    const projectIds = [...new Set(el.items.map(t => t.projectId))];
    const claim = {
      id: uid('clm'), number, mode: q.mode, fund: q.fund, projectIds,
      period: q.mode === 'periode' ? q.period : null,
      txIds: el.items.map(t => t.id), total: el.total, status: CL.WAITING,
      createdBy: (actor && actor.name) || '-', createdAt: nowISO(), submittedAt: nowISO(),
      note: (note || '').trim(), revisionCount: 0, approvals: [], payment: null, archivedAt: null
    };
    logTo(claim, 'diajukan', actor, claim.note);
    state.claims.push(claim);
    for (const t of el.items) { t.claimId = claim.id; t.status = TX.WAITING; logTo(t, 'diajukan', actor, number); }
    return claim;
  }

  function recalcClaim(state, claim) {
    claim.total = sum(claimItems(state, claim).filter(t => t.status !== TX.REJECTED), t => t.amount);
    claim.rejectedTotal = sum(claimItems(state, claim).filter(t => t.status === TX.REJECTED), t => t.amount);
  }
  function needClaim(state, claimId, statuses) {
    const c = getClaim(state, claimId);
    if (!statuses.includes(c.status)) throw err('Status pengajuan sekarang "' + c.status + '", aksi ini tidak tersedia.', 'state');
    return c;
  }
  function needNote(note, label) {
    note = (note || '').trim();
    if (note.length < 3) throw err('Tulis ' + label + ' (minimal 3 karakter).');
    return note;
  }

  function flagRevision(state, claimId, txId, note, actor) {
    assertCan(actor, 'approve');
    const c = needClaim(state, claimId, [CL.WAITING]);
    if (!c.txIds.includes(txId)) throw err('Transaksi bukan bagian dari pengajuan ini.');
    note = needNote(note, 'catatan revisi untuk Team');
    const t = getTx(state, txId);
    if (t.status !== TX.WAITING) throw err('Hanya transaksi berstatus Menunggu Approval yang bisa diminta revisi.', 'state');
    t.status = TX.REVISION; t.revNote = note; t.flaggedAt = nowISO(); t.fixedAt = null; t.revReply = '';
    logTo(t, 'diminta revisi', actor, note);
    return t;
  }
  function unflagRevision(state, claimId, txId, actor) {
    assertCan(actor, 'approve');
    const c = needClaim(state, claimId, [CL.WAITING]);
    if (!c.txIds.includes(txId)) throw err('Transaksi bukan bagian dari pengajuan ini.');
    const t = getTx(state, txId);
    if (t.status !== TX.REVISION) throw err('Transaksi ini tidak sedang ditandai revisi.', 'state');
    t.status = TX.WAITING; t.revNote = ''; t.flaggedAt = null;
    logTo(t, 'tanda revisi dibatalkan', actor, '');
    return t;
  }
  function rejectLine(state, claimId, txId, reason, actor) {
    assertCan(actor, 'approve');
    const c = needClaim(state, claimId, [CL.WAITING]);
    if (!c.txIds.includes(txId)) throw err('Transaksi bukan bagian dari pengajuan ini.');
    reason = needNote(reason, 'alasan penolakan');
    const t = getTx(state, txId);
    if (t.status !== TX.WAITING && t.status !== TX.REVISION) throw err('Transaksi ini tidak bisa ditolak pada status "' + t.status + '".', 'state');
    t.status = TX.REJECTED; t.rejectReason = reason;
    logTo(t, 'ditolak', actor, reason);
    recalcClaim(state, c);
    if (!claimItems(state, c).some(x => x.status !== TX.REJECTED)) {
      c.status = CL.REJECTED; c.archivedAt = nowISO();
      logTo(c, 'ditolak', actor, 'Semua transaksi ditolak');
      c.approvals.push({ at: nowISO(), by: actor.name, role: actor.role, action: 'ditolak', note: 'Semua transaksi ditolak' });
    }
    return t;
  }
  function sendRevision(state, claimId, note, actor) {
    assertCan(actor, 'approve');
    const c = needClaim(state, claimId, [CL.WAITING]);
    const flagged = claimItems(state, c).filter(t => t.status === TX.REVISION);
    if (!flagged.length) throw err('Tandai minimal satu transaksi yang perlu direvisi.');
    c.status = CL.REVISION;
    const n = (note || '').trim() || (flagged.length + ' transaksi perlu diperbaiki');
    c.approvals.push({ at: nowISO(), by: actor.name, role: actor.role, action: 'revisi', note: n });
    logTo(c, 'revisi', actor, n);
    return c;
  }
  function approveClaim(state, claimId, note, actor) {
    assertCan(actor, 'approve');
    const c = needClaim(state, claimId, [CL.WAITING]);
    const items = claimItems(state, c);
    if (items.some(t => t.status === TX.REVISION)) throw err('Masih ada transaksi yang ditandai revisi. Kirim revisi atau batalkan tandanya.', 'blocked');
    const waiting = items.filter(t => t.status === TX.WAITING);
    if (!waiting.length) throw err('Tidak ada transaksi yang bisa disetujui.');
    for (const t of waiting) { t.status = TX.APPROVED; logTo(t, 'disetujui', actor, ''); }
    c.status = CL.APPROVED; c.approvedAt = nowISO(); c.approvedBy = actor.name;
    recalcClaim(state, c);
    c.approvals.push({ at: nowISO(), by: actor.name, role: actor.role, action: 'disetujui', note: (note || '').trim() });
    logTo(c, 'disetujui', actor, note);
    return c;
  }
  function rejectClaim(state, claimId, reason, actor) {
    assertCan(actor, 'approve');
    const c = needClaim(state, claimId, [CL.WAITING, CL.REVISION]);
    reason = needNote(reason, 'alasan penolakan');
    for (const t of claimItems(state, c)) {
      if (t.status !== TX.REJECTED) { t.status = TX.REJECTED; t.rejectReason = reason; logTo(t, 'ditolak', actor, reason); }
    }
    c.status = CL.REJECTED; c.archivedAt = nowISO();
    recalcClaim(state, c);
    c.approvals.push({ at: nowISO(), by: actor.name, role: actor.role, action: 'ditolak', note: reason });
    logTo(c, 'ditolak', actor, reason);
    return c;
  }
  function resubmitClaim(state, claimId, actor) {
    const c = needClaim(state, claimId, [CL.REVISION]);
    const flagged = claimItems(state, c).filter(t => t.status === TX.REVISION);
    const notFixed = flagged.filter(t => !t.fixedAt);
    if (notFixed.length) throw err(notFixed.length + ' transaksi belum diperbaiki. Perbaiki dan tulis catatan untuk Finance dulu.', 'blocked');
    for (const t of flagged) { t.status = TX.WAITING; logTo(t, 'diajukan ulang', actor, t.revReply); }
    c.status = CL.WAITING; c.revisionCount = (c.revisionCount || 0) + 1;
    recalcClaim(state, c);
    c.approvals.push({ at: nowISO(), by: (actor && actor.name) || '-', role: (actor && actor.role) || '', action: 'diajukan ulang', note: flagged.length + ' transaksi diperbaiki' });
    logTo(c, 'diajukan ulang', actor, '');
    return c;
  }
  /** Tarik pengajuan (belum disetujui). Transaksi kembali bebas diajukan di pengajuan lain. */
  function cancelClaim(state, claimId, reason, actor) {
    const c = needClaim(state, claimId, [CL.WAITING, CL.REVISION]);
    for (const t of claimItems(state, c)) {
      if (t.status === TX.REJECTED) continue;
      t.claimId = null; t.revNote = ''; t.flaggedAt = null; t.fixedAt = null;
      t.status = unclaimedStatus(state, t);
      logTo(t, 'pengajuan ditarik', actor, c.number);
    }
    c.status = CL.CANCELLED; c.archivedAt = nowISO();
    c.approvals.push({ at: nowISO(), by: (actor && actor.name) || '-', role: (actor && actor.role) || '', action: 'dibatalkan', note: (reason || '').trim() });
    logTo(c, 'dibatalkan', actor, reason);
    return c;
  }
  function payClaim(state, claimId, pay, actor) {
    assertCan(actor, 'pay');
    const c = needClaim(state, claimId, [CL.APPROVED]);
    pay = pay || {};
    const date = pay.date || todayStr();
    if (!isValidDate(date)) throw err('Tanggal pembayaran tidak valid.');
    if (date > todayStr()) throw err('Tanggal pembayaran tidak boleh di masa depan.');
    const isPersonal = c.fund === FUND.PERSONAL;
    if (isPersonal && !(pay.method || '').trim()) throw err('Pilih metode pembayaran.');
    for (const t of claimItems(state, c)) {
      if (t.status === TX.APPROVED) { t.status = TX.PAID; t.paidAt = date; logTo(t, isPersonal ? 'dibayar' : 'selesai', actor, c.number); }
    }
    c.status = CL.PAID; c.paidAt = date; c.archivedAt = nowISO();
    c.payment = { date, method: (pay.method || '').trim(), ref: (pay.ref || '').trim(), by: (actor && actor.name) || '-' };
    c.approvals.push({ at: nowISO(), by: actor.name, role: actor.role, action: isPersonal ? 'dibayar' : 'diselesaikan', note: [c.payment.method, c.payment.ref].filter(Boolean).join(' · ') });
    logTo(c, isPersonal ? 'dibayar' : 'diselesaikan', actor, c.payment.ref);
    return c;
  }
  function claimCapabilities(state, claim, role) {
    const items = claimItems(state, claim);
    const flagged = items.filter(t => t.status === TX.REVISION).length;
    const waiting = items.filter(t => t.status === TX.WAITING).length;
    const reviewer = PERMS.approve.includes(role);
    const w = claim.status === CL.WAITING;
    return {
      flagged, waiting,
      canReview: reviewer && w,
      canApprove: reviewer && w && flagged === 0 && waiting > 0,
      canSendRevision: reviewer && w && flagged > 0,
      canRejectAll: reviewer && (w || claim.status === CL.REVISION),
      canPay: PERMS.pay.includes(role) && claim.status === CL.APPROVED,
      canResubmit: claim.status === CL.REVISION,
      canCancel: claim.status === CL.WAITING || claim.status === CL.REVISION
    };
  }

  /* ---------- Statistik ---------- */
  const active = t => t.status !== TX.REJECTED;

  function projectStats(state, projectId) {
    const p = getProject(state, projectId);
    const r = { project: p, budget: p.budget, income: 0, spent: 0, spentPersonal: 0, spentCompany: 0, rejected: 0, count: 0, drafts: 0, receivable: 0, paidPersonal: 0, unclaimed: 0 };
    for (const t of state.transactions) {
      if (t.projectId !== projectId) continue;
      if (t.type === 'income') { r.income += t.amount; continue; }
      r.count++;
      if (t.status === TX.REJECTED) { r.rejected += t.amount; continue; }
      r.spent += t.amount;
      if (t.fund === FUND.PERSONAL) {
        r.spentPersonal += t.amount;
        if (t.status === TX.PAID) r.paidPersonal += t.amount;
        else if (t.status !== TX.DRAFT) r.receivable += t.amount;
      } else r.spentCompany += t.amount;
      if (t.status === TX.DRAFT) r.drafts++;
      if (!t.claimId && (t.status === TX.RECORDED || t.status === TX.READY)) r.unclaimed += t.amount;
    }
    r.remaining = p.budget - r.spent;
    r.usedPct = p.budget > 0 ? r.spent / p.budget : (r.spent > 0 ? 1 : 0);
    r.balance = r.income - r.spent;
    return r;
  }

  function pettyCash(state) {
    const entries = [];
    for (const t of state.transactions) {
      if (t.type === 'income' && t.category === PETTY_TOPUP) entries.push({ id: t.id, date: t.date, createdAt: t.createdAt, kind: 'masuk', desc: t.description, amount: t.amount, ref: t.ref || '', projectId: t.projectId, status: 'Tercatat' });
      else if (t.type === 'expense' && t.fund === FUND.COMPANY) {
        if (t.status === TX.REJECTED) continue;
        entries.push({ id: t.id, date: t.date, createdAt: t.createdAt, kind: 'keluar', desc: t.description, amount: t.amount, ref: t.notaNo || '', projectId: t.projectId, status: t.status });
      }
    }
    entries.sort((a, b) => a.date === b.date ? String(a.createdAt).localeCompare(String(b.createdAt)) : a.date.localeCompare(b.date));
    let bal = 0, tin = 0, tout = 0;
    for (const e of entries) { if (e.kind === 'masuk') { bal += e.amount; tin += e.amount; } else { bal -= e.amount; tout += e.amount; } e.balance = bal; }
    const rejected = sum(state.transactions.filter(t => t.type === 'expense' && t.fund === FUND.COMPANY && t.status === TX.REJECTED), t => t.amount);
    return { entries, in: tin, out: tout, balance: bal, rejected };
  }

  function receivable(state) {
    const r = { unclaimed: 0, waiting: 0, revision: 0, approved: 0, paid: 0, draft: 0, total: 0 };
    for (const t of state.transactions) {
      if (t.type !== 'expense' || t.fund !== FUND.PERSONAL) continue;
      if (t.status === TX.RECORDED || t.status === TX.READY) r.unclaimed += t.amount;
      else if (t.status === TX.WAITING) r.waiting += t.amount;
      else if (t.status === TX.REVISION) r.revision += t.amount;
      else if (t.status === TX.APPROVED) r.approved += t.amount;
      else if (t.status === TX.PAID) r.paid += t.amount;
      else if (t.status === TX.DRAFT) r.draft += t.amount;
    }
    r.total = r.unclaimed + r.waiting + r.revision + r.approved;
    return r;
  }

  function claimSubmitMonth(c) {
    // submittedAt adalah ISO UTC; ambil tanggal lokal
    const d = new Date(c.submittedAt); return isNaN(d) ? '' : fmtDate(d).slice(0, 7);
  }
  function claimMonthStats(state, ym) {
    const cs = state.claims.filter(c => claimSubmitMonth(c) === ym && c.status !== CL.CANCELLED);
    return {
      requested: cs.length,
      approved: cs.filter(c => c.status === CL.APPROVED || c.status === CL.PAID).length,
      rejected: cs.filter(c => c.status === CL.REJECTED).length,
      pending: cs.filter(c => c.status === CL.WAITING || c.status === CL.REVISION).length
    };
  }

  function categoryBreakdown(state, f) {
    f = f || {};
    const m = new Map();
    for (const t of state.transactions) {
      if (t.type !== 'expense' || !active(t)) continue;
      if (f.from && t.date < f.from) continue;
      if (f.to && t.date > f.to) continue;
      if (f.projectId && t.projectId !== f.projectId) continue;
      const e = m.get(t.category) || { category: t.category, total: 0, count: 0 };
      e.total += t.amount; e.count++; m.set(t.category, e);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }

  function monthlySeries(state, n, refDate) {
    const cur = monthKey(refDate || todayStr());
    const out = [];
    for (let i = n - 1; i >= 0; i--) out.push({ key: addMonths(cur, -i), income: 0, expense: 0 });
    const idx = new Map(out.map(o => [o.key, o]));
    for (const t of state.transactions) {
      const o = idx.get(monthKey(t.date)); if (!o) continue;
      if (t.type === 'income') { if (t.category !== PETTY_TOPUP) o.income += t.amount; }
      else if (active(t)) o.expense += t.amount;
    }
    return out;
  }

  function dashboard(state, refDate) {
    refDate = refDate || todayStr();
    const m = monthKey(refDate), pm = addMonths(m, -1);
    const inc = state.transactions.filter(t => t.type === 'income' && t.category !== PETTY_TOPUP);
    const exp = state.transactions.filter(t => t.type === 'expense' && active(t));
    const month = { income: sum(inc.filter(t => monthKey(t.date) === m), t => t.amount), expense: sum(exp.filter(t => monthKey(t.date) === m), t => t.amount) };
    const prev = { income: sum(inc.filter(t => monthKey(t.date) === pm), t => t.amount), expense: sum(exp.filter(t => monthKey(t.date) === pm), t => t.amount) };
    const totalIncome = sum(inc, t => t.amount), totalExpense = sum(exp, t => t.amount);
    const drafts = state.transactions.filter(t => t.type === 'expense' && t.status === TX.DRAFT);
    const readyProjects = state.projects.filter(p => isClosed(p) && (eligibleForClaim(state, { mode: 'project', fund: FUND.PERSONAL, projectIds: [p.id] }).items.length || eligibleForClaim(state, { mode: 'project', fund: FUND.COMPANY, projectIds: [p.id] }).items.length));
    const closable = state.projects.filter(p => !isClosed(p) && projectCloseCheck(state, p.id).count > 0 && projectCloseCheck(state, p.id).drafts.length === 0 && p.endDate && p.endDate <= refDate);
    const overBudget = state.projects.filter(p => !isClosed(p) && p.budget > 0 && projectStats(state, p.id).usedPct >= 0.9);
    return {
      month, prev, totalIncome, totalExpense, balance: totalIncome - totalExpense,
      receivable: receivable(state), petty: pettyCash(state),
      claims: { cur: claimMonthStats(state, m), prev: claimMonthStats(state, pm) },
      drafts, readyProjects, closable, overBudget,
      waitingClaims: state.claims.filter(c => c.status === CL.WAITING),
      revisionClaims: state.claims.filter(c => c.status === CL.REVISION),
      approvedClaims: state.claims.filter(c => c.status === CL.APPROVED)
    };
  }

  function reportData(state, f) {
    f = f || {};
    const inRange = t => (!f.from || t.date >= f.from) && (!f.to || t.date <= f.to) && (!f.projectId || t.projectId === f.projectId);
    const txs = state.transactions.filter(inRange);
    const income = txs.filter(t => t.type === 'income' && t.category !== PETTY_TOPUP);
    const topups = txs.filter(t => t.type === 'income' && t.category === PETTY_TOPUP);
    const expense = txs.filter(t => t.type === 'expense' && active(t));
    const rejected = txs.filter(t => t.type === 'expense' && !active(t));
    const projMap = new Map();
    const row = id => { if (!projMap.has(id)) { const p = state.projects.find(x => x.id === id); projMap.set(id, { project: p || null, income: 0, expense: 0, personal: 0, company: 0 }); } return projMap.get(id); };
    for (const t of income) if (t.projectId) row(t.projectId).income += t.amount;
    for (const t of expense) { const r = row(t.projectId); r.expense += t.amount; if (t.fund === FUND.PERSONAL) r.personal += t.amount; else r.company += t.amount; }
    const byProject = [...projMap.values()].filter(r => r.project).map(r => Object.assign(r, { balance: r.income - r.expense, usedPct: r.project.budget > 0 ? r.expense / r.project.budget : 0 }))
      .sort((a, b) => b.expense - a.expense);
    const claims = state.claims.filter(c => {
      if (c.status === CL.CANCELLED) return false;
      const d = fmtDate(new Date(c.submittedAt));
      return (!f.from || d >= f.from) && (!f.to || d <= f.to) && (!f.projectId || c.projectIds.includes(f.projectId));
    });
    return {
      totals: { income: sum(income, t => t.amount), expense: sum(expense, t => t.amount), net: sum(income, t => t.amount) - sum(expense, t => t.amount), personal: sum(expense.filter(t => t.fund === FUND.PERSONAL), t => t.amount), company: sum(expense.filter(t => t.fund === FUND.COMPANY), t => t.amount), rejected: sum(rejected, t => t.amount), topups: sum(topups, t => t.amount) },
      byProject, byCategory: categoryBreakdown(state, f), claims
    };
  }

  /* ---------- Integritas: pastikan tidak ada penggantian ganda ---------- */
  function integrityCheck(state) {
    const issues = [];
    const add = (level, msg, ref) => issues.push({ level, msg, ref });
    const txById = new Map(state.transactions.map(t => [t.id, t]));
    const claimById = new Map(state.claims.map(c => [c.id, c]));
    const seen = new Map();
    for (const c of state.claims) {
      if (c.status === CL.CANCELLED) continue;
      let total = 0;
      for (const id of c.txIds) {
        const t = txById.get(id);
        if (!t) { add('error', 'Pengajuan ' + c.number + ' merujuk transaksi yang tidak ada.', c.id); continue; }
        if (!seen.has(id)) seen.set(id, []);
        seen.get(id).push(c.number);
        if (t.claimId !== c.id) add('error', 'Transaksi "' + t.description + '" ada di ' + c.number + ' tetapi menunjuk pengajuan lain.', t.id);
        if (t.fund !== c.fund) add('error', 'Sumber dana "' + t.description + '" berbeda dengan ' + c.number + '.', t.id);
        if (t.status !== TX.REJECTED) {
          total += t.amount;
          if (c.status === CL.PAID && t.status !== TX.PAID) add('error', c.number + ' berstatus Dibayar tetapi "' + t.description + '" belum.', t.id);
          if (c.status === CL.APPROVED && t.status !== TX.APPROVED) add('error', c.number + ' berstatus Disetujui tetapi "' + t.description + '" belum.', t.id);
        }
      }
      if (total !== c.total) add('error', 'Total ' + c.number + ' tidak sama dengan jumlah transaksinya.', c.id);
    }
    for (const [id, list] of seen) {
      if (list.length > 1) add('error', 'Transaksi "' + (txById.get(id) || {}).description + '" masuk ke lebih dari satu pengajuan (' + list.join(', ') + ').', id);
    }
    const inFlow = [TX.WAITING, TX.REVISION, TX.APPROVED, TX.PAID, TX.REJECTED];
    const hashes = new Map();
    for (const t of state.transactions) {
      if (t.type !== 'expense') continue;
      if (!state.projects.some(p => p.id === t.projectId)) add('error', 'Transaksi "' + t.description + '" tidak punya project.', t.id);
      if (inFlow.includes(t.status) && !t.claimId) add('error', 'Transaksi "' + t.description + '" berstatus ' + t.status + ' tetapi tidak terhubung ke pengajuan.', t.id);
      if (!inFlow.includes(t.status) && t.claimId) add('error', 'Transaksi "' + t.description + '" berstatus ' + t.status + ' tetapi sudah terhubung ke pengajuan.', t.id);
      if (t.claimId && !claimById.has(t.claimId)) add('error', 'Transaksi "' + t.description + '" menunjuk pengajuan yang tidak ada.', t.id);
      if (t.photoHash && t.status !== TX.REJECTED) {
        if (!hashes.has(t.photoHash)) hashes.set(t.photoHash, []);
        hashes.get(t.photoHash).push(t);
      }
    }
    for (const list of hashes.values()) {
      if (list.length > 1 && list.slice(1).some(t => !t.dupConfirmed)) add('warn', 'Foto nota yang sama dipakai di ' + list.length + ' transaksi: ' + list.map(t => '"' + t.description + '"').join(', ') + '.', list[0].id);
      else if (list.length > 1) add('info', 'Foto nota yang sama dipakai di ' + list.length + ' transaksi (sudah dikonfirmasi pengguna).', list[0].id);
    }
    return { ok: !issues.some(i => i.level === 'error'), issues };
  }

  /* ---------- Pencarian global ---------- */
  function searchAll(state, q) {
    q = norm(q); if (q.length < 2) return { projects: [], transactions: [], claims: [] };
    const has = (...f) => f.some(x => norm(x).includes(q));
    return {
      projects: state.projects.filter(p => has(p.name, p.code, p.client)).slice(0, 5),
      transactions: state.transactions.filter(t => has(t.description, t.vendor, t.notaNo, t.category, t.ref, t.client)).slice(0, 8),
      claims: state.claims.filter(c => has(c.number)).slice(0, 5)
    };
  }

  /* ---------- CSV ---------- */
  function csvCell(v, delim) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return String(v);
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // cegah formula-injection di Excel
    if (s.includes('"') || s.includes(delim) || /[\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function toCSV(headers, rows, delim) {
    delim = delim || ',';
    return [headers].concat(rows).map(r => r.map(c => csvCell(c, delim)).join(delim)).join('\r\n');
  }
  const projName = (state, id) => { const p = state.projects.find(x => x.id === id); return p ? p.name : ''; };
  const projCode = (state, id) => { const p = state.projects.find(x => x.id === id); return p ? p.code : ''; };
  function claimNumberOf(state, t) { const c = t.claimId && state.claims.find(x => x.id === t.claimId); return c ? c.number : ''; }

  function csvTransactions(state, f, delim) {
    f = f || {};
    const rows = state.transactions.filter(t => (!f.from || t.date >= f.from) && (!f.to || t.date <= f.to) && (!f.projectId || t.projectId === f.projectId))
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(t => [t.id, t.date, t.type === 'income' ? 'Pemasukan' : 'Pengeluaran', projCode(state, t.projectId), projName(state, t.projectId), t.category, t.description, t.vendor || t.client || '', t.notaNo || t.ref || '', t.type === 'expense' ? FUND_LABEL[t.fund] : '', t.type === 'income' ? t.amount : -t.amount, t.type === 'income' ? 'Tercatat' : t.status, claimNumberOf(state, t), t.type === 'expense' ? (t.photoId ? 'Ya' : 'Tidak') : '', t.noReceiptReason || '', t.createdBy || '']);
    return toCSV(['ID', 'Tanggal', 'Jenis', 'Kode Project', 'Project', 'Kategori', 'Deskripsi', 'Vendor / Klien', 'No. Nota / Ref', 'Sumber Dana', 'Nominal (Rp)', 'Status', 'No. Pengajuan', 'Foto Nota', 'Alasan Tanpa Nota', 'Dicatat Oleh'], rows, delim);
  }
  function csvProjects(state, delim) {
    const rows = state.projects.map(p => { const s = projectStats(state, p.id); return [p.code, p.name, p.client, p.status, p.startDate, p.endDate, p.budget, s.spent, s.remaining, s.income, s.balance, s.spentPersonal, s.spentCompany, s.receivable]; });
    return toCSV(['Kode', 'Project', 'Klien', 'Status', 'Mulai', 'Selesai', 'Budget (Rp)', 'Terpakai (Rp)', 'Sisa Budget (Rp)', 'Pemasukan (Rp)', 'Saldo (Rp)', 'Dana Pribadi (Rp)', 'Dana Perusahaan (Rp)', 'Piutang Reimburse (Rp)'], rows, delim);
  }
  function csvClaims(state, delim) {
    const rows = state.claims.map(c => [c.number, c.mode === 'project' ? 'Per project' : 'Per periode', c.fund === FUND.PERSONAL ? 'Reimbursement (dana pribadi)' : 'Petty cash (dana perusahaan)', c.projectIds.map(id => projName(state, id)).join(' + '), c.period || '', c.txIds.length, c.total, c.status, c.submittedAt ? fmtDate(new Date(c.submittedAt)) : '', c.approvedBy || '', c.payment ? c.payment.date : '', c.payment ? c.payment.method : '', c.payment ? c.payment.ref : '', c.revisionCount || 0]);
    return toCSV(['No. Pengajuan', 'Jenis', 'Dana', 'Project', 'Periode', 'Jumlah Item', 'Total (Rp)', 'Status', 'Tanggal Diajukan', 'Disetujui Oleh', 'Tanggal Bayar', 'Metode', 'No. Referensi', 'Jumlah Revisi'], rows, delim);
  }
  function csvClaimDetail(state, claimId, delim) {
    const c = getClaim(state, claimId);
    const rows = claimItems(state, c).map((t, i) => [i + 1, t.date, projName(state, t.projectId), t.category, t.description, t.vendor, t.notaNo, t.noReceipt ? 'Tanpa nota: ' + t.noReceiptReason : (t.photoId ? 'Ada foto' : ''), t.amount, t.status]);
    rows.push(['', '', '', '', 'TOTAL', '', '', '', c.total, c.status]);
    return toCSV(['No', 'Tanggal', 'Project', 'Kategori', 'Deskripsi', 'Vendor', 'No. Nota', 'Bukti', 'Nominal (Rp)', 'Status'], rows, delim);
  }
  function csvPettyCash(state, delim) {
    const pc = pettyCash(state);
    const rows = pc.entries.map(e => [e.date, e.kind === 'masuk' ? 'Masuk' : 'Keluar', e.desc, projName(state, e.projectId), e.ref, e.kind === 'masuk' ? e.amount : -e.amount, e.balance, e.status]);
    return toCSV(['Tanggal', 'Arus', 'Keterangan', 'Project', 'Ref / No. Nota', 'Nominal (Rp)', 'Saldo (Rp)', 'Status'], rows, delim);
  }

  /* ---------- Backup ---------- */
  function exportBackup(state) { return { app: 'kasproyek', version: 1, exportedAt: nowISO(), data: state }; }
  function validateState(s) {
    if (!s || typeof s !== 'object') throw err('Berkas backup tidak valid.');
    for (const k of ['projects', 'transactions', 'claims', 'receipts']) if (!Array.isArray(s[k])) throw err('Berkas backup rusak: bagian "' + k + '" tidak ada.');
    s.settings = Object.assign(emptyState().settings, s.settings || {});
    s.counters = s.counters || {};
    return s;
  }
  function importBackup(obj) {
    if (!obj || obj.app !== 'kasproyek' || !obj.data) throw err('Ini bukan berkas backup KasProyek.');
    const s = validateState(obj.data);
    const chk = integrityCheck(s);
    return { state: s, integrity: chk };
  }

  /* ---------- Data contoh ---------- */
  function seedDemo(state) {
    const T = todayStr();
    const d = n => addDays(T, -n);
    const producer = { name: 'Raka', role: 'producer' };
    const finance = { name: 'Dewi', role: 'finance' };
    const director = { name: 'Pak Hendra', role: 'director' };
    let photo = 0;
    const P = () => { photo++; return { photoId: 'demo-' + photo, photoHash: 'demo-hash-' + photo }; };
    const exp = (prj, date, category, description, vendor, amount, fund, extra) => {
      if (date > T) return null;
      return withClock(date, () => addExpense(state, Object.assign({ date, projectId: prj.id, category, description, vendor, amount, fund: fund || FUND.PERSONAL }, extra === 'draft' ? {} : (extra && extra.noReceipt ? extra : P())), producer));
    };
    const inc = (prj, date, category, description, amount, ref) => withClock(date, () => addIncome(state, { date, projectId: prj ? prj.id : null, category, description, amount, ref: ref || '' }, producer));

    // Project 1 — selesai & sudah dibayar
    const p1 = withClock(d(80), () => createProject(state, { code: 'PRJ-2609-01', name: 'Video Company Profile', client: 'PT Maju Jaya', budget: 85000000, startDate: d(75), endDate: d(33), pic: 'Raka', notes: 'Shooting 2 hari + motion graphic.' }));
    inc(p1, d(72), 'DP / Termin', 'DP 50% Video Company Profile', 42500000, 'INV-0921');
    inc(p1, d(31), 'DP / Termin', 'Pelunasan Video Company Profile', 42500000, 'INV-0934');
    exp(p1, d(68), 'Sewa Peralatan', 'Sewa kamera cinema & lensa 2 hari', 'Rental Lensa Pro', 9500000, FUND.PERSONAL);
    exp(p1, d(66), 'Talent & Model', 'Honor talent narator', 'Studio Suara', 3500000, FUND.PERSONAL);
    exp(p1, d(64), 'Transportasi', 'Bensin & tol survei lokasi', 'SPBU / Tol', 428500, FUND.PERSONAL);
    exp(p1, d(60), 'Konsumsi', 'Makan siang kru shooting hari 1', 'RM Padang Sederhana', 1850000, FUND.PERSONAL);
    exp(p1, d(60), 'Lokasi & Perizinan', 'Izin shooting gedung kantor klien', 'Pengelola Gedung', 2500000, FUND.PERSONAL);
    exp(p1, d(59), 'Crew & Freelance', 'Honor operator drone', 'Freelance — Bima', 2800000, FUND.PERSONAL);
    exp(p1, d(45), 'Software & Lisensi', 'Lisensi musik royalty-free', 'Artlist', 1250000, FUND.PERSONAL);
    exp(p1, d(60), 'Konsumsi', 'Snack & air mineral kru', 'Alfamart', 345000, FUND.COMPANY);
    exp(p1, d(64), 'Perlengkapan', 'Baterai & kabel HDMI', 'Toko Elektronik Jaya', 275000, FUND.COMPANY);
    // Project 2 — berjalan
    const p2 = withClock(d(45), () => createProject(state, { code: 'PRJ-2610-01', name: 'Photoshoot Katalog Ramadan', client: 'Batik Nusa', budget: 42000000, startDate: d(40), endDate: addDays(T, 12), pic: 'Raka', notes: 'Katalog 24 look, 2 lokasi.' }));
    inc(p2, d(38), 'DP / Termin', 'DP 50% Photoshoot Katalog', 21000000, 'INV-0958');
    exp(p2, d(36), 'Sewa Peralatan', 'Sewa studio foto 3 hari', 'Studio Kilau', 8500000, FUND.PERSONAL);
    exp(p2, d(35), 'Wardrobe & MUA', 'Sewa wardrobe & MUA', 'Atelier Rias', 4200000, FUND.PERSONAL);
    exp(p2, d(34), 'Talent & Model', 'Honor 4 model', 'Agensi Model Kita', 9600000, FUND.PERSONAL);
    exp(p2, d(33), 'Properti & Set', 'Properti backdrop & bunga', 'Pasar Bunga', 1875000, FUND.PERSONAL);
    exp(p2, d(32), 'Transportasi', 'Taksi online pengiriman wardrobe', 'Grab', 186000, FUND.PERSONAL, { noReceipt: true, noReceiptReason: 'Struk aplikasi tidak tersimpan, bukti ada di riwayat perjalanan' });
    exp(p2, d(30), 'Konsumsi', 'Catering tim shoot', 'Dapur Ibu', 1540000, FUND.PERSONAL);
    exp(p2, d(29), 'Percetakan & Produksi', 'Cetak proof katalog A3', 'Printing Express', 760000, FUND.PERSONAL);
    exp(p2, d(31), 'Transportasi', 'Parkir studio 3 hari', 'Parkir Studio Kilau', 45000, FUND.COMPANY, { noReceipt: true, noReceiptReason: 'Karcis parkir tidak diberikan petugas' });
    exp(p2, d(30), 'Konsumsi', 'Air mineral & snack kru', 'Indomaret', 120000, FUND.COMPANY);
    exp(p2, d(5), 'Percetakan & Produksi', 'Cetak revisi katalog 5 set', 'Printing Express', 540000, FUND.PERSONAL);
    exp(p2, d(2), 'Perlengkapan', 'Beli kain background', 'Toko Kain Mawar', 320000, FUND.PERSONAL, 'draft');
    // Project 3 — berjalan, banyak aktivitas baru
    const p3 = withClock(d(22), () => createProject(state, { code: 'PRJ-2611-01', name: 'Event Launching Produk', client: 'Kopi Senja', budget: 120000000, startDate: d(20), endDate: addDays(T, 25), pic: 'Raka', notes: 'Launching 1 hari, 300 undangan.' }));
    inc(p3, d(18), 'DP / Termin', 'DP 50% Event Launching', 60000000, 'INV-0987');
    inc(null, d(24), PETTY_TOPUP, 'Top-up petty cash dari kas kantor', 5000000, 'KK-221');
    inc(null, d(8), PETTY_TOPUP, 'Top-up petty cash tambahan', 3000000, 'KK-229');
    exp(p3, d(17), 'Konsumsi', 'Konsumsi rapat koordinasi vendor', 'Kafe Titik Temu', 640000, FUND.COMPANY);
    exp(p3, d(16), 'Percetakan & Produksi', 'Cetak banner & x-banner', 'Cetak Cepat', 3250000, FUND.PERSONAL);
    exp(p3, d(14), 'Perlengkapan', 'Perlengkapan dekorasi booth', 'Ace Hardware', 2100000, FUND.PERSONAL);
    exp(p3, d(12), 'Talent & Model', 'Deposit MC acara', 'Agensi MC Prima', 4000000, FUND.PERSONAL);
    exp(p3, d(9), 'Sewa Peralatan', 'DP sewa sound system & lighting', 'Sinar Audio', 5500000, FUND.PERSONAL);
    exp(p3, d(6), 'Transportasi', 'Kurir sampel produk ke venue', 'Grab Express', 215000, FUND.COMPANY);
    exp(p3, d(3), 'Percetakan & Produksi', 'Fotokopi & jilid proposal', 'Fotokopi 24 Jam', 85000, FUND.COMPANY, 'draft');
    exp(p3, d(1), 'Perlengkapan', 'Souvenir sampel untuk tamu VIP', 'Toko Souvenir', 450000, FUND.PERSONAL, 'draft');

    // Alur P1: tutup -> ajukan -> setujui -> bayar
    withClock(d(31), () => closeProject(state, p1.id, producer));
    const c1 = withClock(d(30), () => submitClaim(state, { mode: 'project', fund: FUND.PERSONAL, projectIds: [p1.id] }, producer, 'Reimbursement project Video Company Profile'));
    withClock(d(29), () => approveClaim(state, c1.id, 'Nota lengkap, disetujui.', director));
    withClock(d(27), () => payClaim(state, c1.id, { date: d(27), method: 'Transfer bank', ref: 'TRF-0921-A' }, finance));
    const c2 = withClock(d(30), () => submitClaim(state, { mode: 'project', fund: FUND.COMPANY, projectIds: [p1.id] }, producer, 'Pertanggungjawaban petty cash Video Company Profile'));
    withClock(d(29), () => approveClaim(state, c2.id, '', finance));
    withClock(d(29), () => payClaim(state, c2.id, { date: d(29) }, finance));

    // Pengajuan per periode (bulan lalu) — dana pribadi menunggu approval; petty cash minta revisi
    const prev = addMonths(monthKey(T), -1);
    try {
      withClock(d(4), () => submitClaim(state, { mode: 'periode', fund: FUND.PERSONAL, projectIds: [], period: prev }, producer, 'Pengajuan gabungan ' + prev));
    } catch (e) { if (!(e instanceof CoreError)) throw e; }
    try {
      const c4 = withClock(d(4), () => submitClaim(state, { mode: 'periode', fund: FUND.COMPANY, projectIds: [], period: prev }, producer, 'Petty cash ' + prev));
      const flag = claimItems(state, c4).find(t => t.noReceipt) || claimItems(state, c4)[0];
      if (flag) {
        withClock(d(3), () => flagRevision(state, c4.id, flag.id, 'Mohon lampirkan bukti lain (mis. tangkapan layar riwayat) untuk transaksi ini.', finance));
        withClock(d(3), () => sendRevision(state, c4.id, 'Satu transaksi perlu bukti tambahan.', finance));
      }
    } catch (e) { if (!(e instanceof CoreError)) throw e; }
    return state;
  }

  return {
    TX, CL, FUND, FUND_LABEL, ROLES, PERMS, CATEGORIES_EXPENSE, CATEGORIES_INCOME, PETTY_TOPUP, CoreError,
    setClock, withClock, nowISO, todayStr, fmtDate, isValidDate, isValidMonth, addDays, addMonths, monthKey, lastDayOfMonth, money, uid,
    emptyState, getProject, getTx, getClaim, claimItems,
    createProject, updateProject, deleteProject, isClosed, nextProjectCode,
    isComplete, addExpense, updateExpense, deleteTransaction, isEditable, isDeletable, findDuplicates, findReceiptHash,
    addIncome, updateIncome,
    addReceiptToInbox, removeReceiptFromInbox, convertReceipt,
    projectCloseCheck, closeProject, reopenProject,
    eligibleForClaim, submitClaim, flagRevision, unflagRevision, rejectLine, sendRevision, approveClaim, rejectClaim, resubmitClaim, cancelClaim, payClaim, claimCapabilities,
    projectStats, pettyCash, receivable, categoryBreakdown, monthlySeries, dashboard, reportData, integrityCheck, searchAll,
    toCSV, csvTransactions, csvProjects, csvClaims, csvClaimDetail, csvPettyCash,
    exportBackup, importBackup, validateState, seedDemo
  };
});
