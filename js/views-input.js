/* ==========================================================================
   views-input.js — Input Pengeluaran, Input Pemasukan, Upload Bon / Nota.
   ========================================================================== */
(function () {
  'use strict';
  const { esc, rp, dt, icon, pill } = UI;
  const { TX, FUND } = Core;
  const S = () => App.state;
  const sum = (a, f) => a.reduce((x, y) => x + (f ? f(y) : y), 0);
  const byDateDesc = (a, b) => b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt));

  function needProject(title) {
    return H.pageHead(title, 'Pilih project untuk mencatat transaksi.') + '<div class="card">' + H.empty('folder', 'Buat project dulu', 'Setiap pengeluaran dicatat ke sebuah project supaya budget dan laporannya jelas.', '<button class="btn btn-primary" data-act="project-new">' + icon('plus') + 'Buat project</button>') + '</div>';
  }

  /* ---------- Input Pengeluaran ---------- */
  const STATUS_OPTS = ['Draft', 'Tercatat', 'Siap Reimburse', 'Menunggu Approval', 'Revisi', 'Disetujui', 'Dibayar', 'Ditolak'];
  V.expense = () => {
    const s = S();
    if (!s.projects.length) return needProject('Input Pengeluaran');
    const f = App.ui.expense = App.ui.expense || { q: '', project: '', status: '', fund: '', limit: 30 };
    const qp = App.query.project; const defaults = {};
    if (qp && s.projects.some(p => p.id === qp)) { defaults.projectId = qp; f.project = qp; }
    return H.pageHead('Input Pengeluaran', 'Catat setiap pengeluaran saat terjadi. Boleh dicicil tiap hari.') +
      '<div class="grid g-form">' +
      '<section class="card"><div class="card-head"><div class="card-title">' + icon('plus') + 'Catat pengeluaran</div><a class="small" href="#/receipts">Foto nota dulu, isi nanti</a></div>' + H.expenseForm({ mode: 'create', defaults }) + '</section>' +
      '<section class="card flush"><div class="card-head"><div class="card-title">' + icon('file') + 'Daftar pengeluaran</div></div>' +
      '<div class="filters no-print" style="padding:0 22px;margin:14px 0 14px"><label class="search"><span class="sr-only">Cari pengeluaran</span>' + icon('search') + '<input type="search" placeholder="Cari deskripsi atau vendor" value="' + esc(f.q) + '" data-input="filter" data-view="expense" data-key="q"></label>' +
      '<select class="sel" aria-label="Filter project" data-change="filter" data-view="expense" data-key="project"><option value="">Semua project</option>' + s.projects.map(p => '<option value="' + p.id + '"' + (f.project === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') + '</select>' +
      '<select class="sel" aria-label="Filter status" data-change="filter" data-view="expense" data-key="status"><option value="">Semua status</option><option value="_unclaimed"' + (f.status === '_unclaimed' ? ' selected' : '') + '>Belum diajukan</option>' + STATUS_OPTS.map(x => '<option' + (f.status === x ? ' selected' : '') + '>' + x + '</option>').join('') + '</select>' +
      '<select class="sel" aria-label="Filter sumber dana" data-change="filter" data-view="expense" data-key="fund"><option value="">Semua sumber</option><option value="pribadi"' + (f.fund === 'pribadi' ? ' selected' : '') + '>Dana pribadi</option><option value="perusahaan"' + (f.fund === 'perusahaan' ? ' selected' : '') + '>Petty cash</option></select></div>' +
      '<div id="results">' + V.expense.results() + '</div></section></div>';
  };
  V.expense.results = () => {
    const s = S(), f = App.ui.expense || {};
    const q = (f.q || '').toLowerCase();
    const all = s.transactions.filter(t => t.type === 'expense' &&
      (!f.project || t.projectId === f.project) && (!f.fund || t.fund === f.fund) &&
      (!f.status || (f.status === '_unclaimed' ? (!t.claimId && t.status !== TX.REJECTED) : t.status === f.status)) &&
      (!q || (t.description + ' ' + t.vendor + ' ' + t.notaNo + ' ' + t.category).toLowerCase().includes(q))).sort(byDateDesc);
    const shown = all.slice(0, f.limit || 30);
    return '<div class="small muted" style="padding:0 22px 10px">' + all.length + ' transaksi · total ' + rp(sum(all.filter(t => t.status !== TX.REJECTED), t => t.amount)) + '</div>' +
      H.txTable(shown, { emptyTitle: all.length ? '' : 'Belum ada pengeluaran', emptyText: s.transactions.some(t => t.type === 'expense') ? 'Tidak ada yang cocok dengan filter.' : 'Isi formulir untuk mencatat pengeluaran pertama.', emptyIcon: 'search' }) +
      (all.length > shown.length ? '<div style="padding:14px;text-align:center"><button class="btn" data-act="more-rows" data-view="expense">Tampilkan lebih banyak (' + (all.length - shown.length) + ')</button></div>' : '');
  };
  Act['more-rows'] = d => { const f = App.ui[d.view]; f.limit = (f.limit || 30) + 30; App.refreshResults(d.view); };

  /* ---------- Input Pemasukan ---------- */
  V.income = () => {
    const s = S();
    const f = App.ui.income = App.ui.income || { q: '', project: '', limit: 30 };
    return H.pageHead('Input Pemasukan', 'Catat DP, termin, pelunasan klien, dan top-up petty cash.') +
      '<div class="grid g-form">' +
      '<section class="card"><div class="card-head"><div class="card-title">' + icon('down') + 'Catat pemasukan</div></div>' + H.incomeForm({ mode: 'create' }) + '</section>' +
      '<section class="card flush"><div class="card-head"><div class="card-title">' + icon('file') + 'Daftar pemasukan</div></div>' +
      '<div class="filters no-print" style="padding:0 22px;margin:14px 0 14px"><label class="search"><span class="sr-only">Cari pemasukan</span>' + icon('search') + '<input type="search" placeholder="Cari keterangan atau klien" value="' + esc(f.q) + '" data-input="filter" data-view="income" data-key="q"></label>' +
      '<select class="sel" aria-label="Filter project" data-change="filter" data-view="income" data-key="project"><option value="">Semua project</option><option value="_none"' + (f.project === '_none' ? ' selected' : '') + '>Tanpa project (petty cash)</option>' + s.projects.map(p => '<option value="' + p.id + '"' + (f.project === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') + '</select></div>' +
      '<div id="results">' + V.income.results() + '</div></section></div>';
  };
  V.income.results = () => {
    const s = S(), f = App.ui.income || {}, q = (f.q || '').toLowerCase();
    const all = s.transactions.filter(t => t.type === 'income' && (!f.project || (f.project === '_none' ? !t.projectId : t.projectId === f.project)) && (!q || (t.description + ' ' + t.client + ' ' + t.ref).toLowerCase().includes(q))).sort(byDateDesc);
    const shown = all.slice(0, f.limit || 30);
    const topup = sum(all.filter(t => t.category === Core.PETTY_TOPUP), t => t.amount);
    return '<div class="small muted" style="padding:0 22px 10px">' + all.length + ' pemasukan · total ' + rp(sum(all, t => t.amount)) + (topup ? ' (termasuk top-up petty cash ' + rp(topup) + ')' : '') + '</div>' +
      H.txTable(shown, { emptyTitle: 'Belum ada pemasukan', emptyText: 'Isi formulir untuk mencatat DP atau pembayaran klien.', emptyIcon: 'down' }) +
      (all.length > shown.length ? '<div style="padding:14px;text-align:center"><button class="btn" data-act="more-rows" data-view="income">Tampilkan lebih banyak (' + (all.length - shown.length) + ')</button></div>' : '');
  };

  /* ---------- Upload Bon / Nota ---------- */
  V.receipts = () => {
    const s = S();
    const inbox = s.receipts.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const drafts = s.transactions.filter(t => t.type === 'expense' && t.status === TX.DRAFT).sort(byDateDesc);
    return H.pageHead('Upload Bon / Nota', 'Foto nota begitu diterima, lengkapi datanya kapan saja.') +
      '<div class="grid g-main">' +
      '<section class="card"><div class="card-head"><div class="card-title">' + icon('camera') + 'Inbox nota' + (inbox.length ? '<span class="badge-n">' + inbox.length + '</span>' : '') + '</div></div>' +
      '<div class="capture mb"><label class="cap-btn">' + icon('camera') + 'Foto nota<input type="file" accept="image/*" capture="environment" data-change="receipts-picked"></label>' +
      '<label class="cap-btn">' + icon('upload') + 'Pilih dari galeri atau PDF<input type="file" accept="image/*,application/pdf" multiple data-change="receipts-picked"></label></div>' +
      (inbox.length ? '<div class="inbox-grid">' + inbox.map(r => '<figure class="inbox-item">' +
        (UI.isPdfId(r.photoId) ? '<button type="button" class="pdf-tile" data-act="photo-view" data-photo="' + r.photoId + '" aria-label="Buka PDF">' + icon('file') + '<span>PDF</span></button>' : '<img data-photo="' + r.photoId + '" data-act="photo-view" alt="Foto nota" loading="lazy">') +
        '<figcaption><span>' + UI.dtime(r.createdAt) + '</span><div class="row" style="flex-wrap:nowrap"><button class="btn btn-primary btn-sm sp" data-act="inbox-complete" data-id="' + r.id + '">Lengkapi data</button><button class="btn-x" data-act="inbox-delete" data-id="' + r.id + '" aria-label="Hapus nota">' + icon('trash') + '</button></div></figcaption></figure>').join('') + '</div>'
        : H.empty('image', 'Inbox kosong', 'Foto nota yang belum dilengkapi muncul di sini. Pilih beberapa foto sekaligus dari galeri jika perlu.')) +
      '</section>' +
      '<section class="card"><div class="card-head"><div class="card-title">' + icon('alert') + 'Draft menunggu nota' + (drafts.length ? '<span class="badge-n">' + drafts.length + '</span>' : '') + '</div></div>' +
      (drafts.length ? '<p class="small muted mb">Draft belum bisa diajukan sampai ada foto nota atau alasan tanpa nota.</p>' + drafts.map(t => '<div class="draft-row"><div><b>' + esc(t.description) + '</b><span class="sub">' + esc(H.projName(t.projectId)) + ' · ' + dt(t.date) + ' · ' + rp(t.amount) + '</span></div><label class="btn btn-primary btn-sm">' + icon('camera') + 'Lampirkan<input class="sr-only" type="file" accept="image/*,application/pdf" data-change="draft-attach" data-id="' + t.id + '"></label><button class="btn btn-sm" data-act="tx-edit" data-id="' + t.id + '">Ubah</button></div>').join('')
        : H.empty('checkc', 'Semua transaksi punya nota', 'Tidak ada Draft. Bagus — semuanya siap diajukan.')) +
      '</section></div>';
  };
  Change['receipts-picked'] = async el => {
    const files = [...(el.files || [])]; el.value = '';
    if (!files.length) return;
    UI.toast('Memproses ' + files.length + ' berkas…');
    let ok = 0, skip = 0;
    for (const file of files) {
      let r;
      try { r = await DB.savePhotoFile(file); } catch (e) { UI.toast(e.message || 'Berkas tidak bisa diproses.', 'error'); skip++; continue; }
      const out = await H.tryDup(c => Core.addReceiptToInbox(S(), { photoId: r.id, photoHash: r.hash, confirmDuplicate: c }, App.actor()));
      if (out.ok) ok++; else { DB.deletePhoto(r.id); skip++; if (out.error) H.fail(null, out.error); }
    }
    App.save(); App.render();
    if (ok) UI.toast(ok + ' nota masuk inbox' + (skip ? ', ' + skip + ' dilewati' : '') + '. Tekan “Lengkapi data” untuk mencatatnya.', 'success');
  };
  Change['draft-attach'] = async el => {
    const file = el.files && el.files[0]; el.value = ''; if (!file) return;
    let r; try { r = await DB.savePhotoFile(file); } catch (e) { return UI.toast(e.message || 'Berkas tidak bisa diproses.', 'error'); }
    let res;
    const out = await H.tryDup(c => { res = Core.updateExpense(S(), el.dataset.id, { photoId: r.id, photoHash: r.hash }, App.actor(), { confirmDuplicate: c }); });
    if (!out.ok) { DB.deletePhoto(r.id); if (out.error) H.fail(null, out.error); return; }
    if (res.removedPhotoId) DB.deletePhoto(res.removedPhotoId);
    App.save(); App.render(); UI.toast('Nota terlampir. Status sekarang: ' + res.tx.status, 'success');
  };
  Act['inbox-complete'] = d => {
    const r = S().receipts.find(x => x.id === d.id); if (!r) return;
    if (!S().projects.length) { UI.toast('Buat project dulu sebelum melengkapi nota.', 'error'); return; }
    const dlg = UI.makeDialog({
      title: 'Lengkapi data nota', wide: true,
      html: H.expenseForm({ mode: 'inbox', formId: 'inbox-form', photoId: r.photoId, hash: r.hash, lockPhoto: true, hiddenId: r.id }),
      footer: '<button class="btn" data-act="dlg-close">Batal</button><button class="btn btn-primary" type="submit" form="inbox-form">' + icon('check') + 'Simpan pengeluaran</button>'
    });
    UI.bindMoney(dlg.el); UI.hydratePhotos(dlg.el, S());
    setTimeout(() => { const f = dlg.el.querySelector('[name=description]'); if (f) f.focus(); }, 60);
  };
  Act['inbox-delete'] = async d => {
    if (!(await UI.confirmBox({ title: 'Hapus nota dari inbox?', message: 'Foto nota ini akan dihapus permanen dari perangkat.', okText: 'Hapus', danger: true }))) return;
    let out; if (App.commit(() => { out = Core.removeReceiptFromInbox(S(), d.id); }, 'Nota dihapus')) DB.deletePhoto(out.removedPhotoId);
  };
})();
