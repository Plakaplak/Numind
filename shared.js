/* ==========================================================================
   shared.js — Komponen & aksi yang dipakai banyak halaman:
   tabel transaksi/pengajuan, form pengeluaran/pemasukan, detail transaksi,
   pratinjau foto nota, konfirmasi duplikat.
   ========================================================================== */
(function () {
  'use strict';
  const { esc, rp, dt, icon, pill, fundTag } = UI;
  const { TX, CL, FUND } = Core;
  const S = () => App.state;
  const H = window.H = {};

  /* ---------- Util ---------- */
  H.proj = id => S().projects.find(p => p.id === id);
  H.projName = id => { const p = H.proj(id); return p ? p.name : '—'; };
  H.claimOf = id => S().claims.find(c => c.id === id);
  H.empty = (ic, title, text, action) => '<div class="empty"><div class="ic-wrap">' + icon(ic) + '</div><h3>' + esc(title) + '</h3>' + (text ? '<p>' + esc(text) + '</p>' : '') + (action || '') + '</div>';
  H.pageHead = (title, sub, actions, crumbs) => '<div class="page-head"><div>' + (crumbs ? '<div class="crumb">' + crumbs + '</div>' : '') + '<h1>' + esc(title) + '</h1>' + (sub ? '<p class="sub">' + sub + '</p>' : '') + '</div>' + (actions ? '<div class="head-actions no-print">' + actions + '</div>' : '') + '</div>';
  H.banner = (kind, ic, html) => '<div class="banner ' + kind + '">' + icon(ic) + '<div class="sp">' + html + '</div></div>';

  H.projectSelect = (name, selected, o) => {
    o = o || {};
    const ps = S().projects.slice().sort((a, b) => (Core.isClosed(a) - Core.isClosed(b)) || a.name.localeCompare(b.name));
    let h = '<select name="' + name + '"' + (o.required ? ' required' : '') + (o.data ? ' ' + o.data : '') + '>';
    if (o.blank !== undefined) h += '<option value="">' + esc(o.blank) + '</option>';
    for (const p of ps) h += '<option value="' + p.id + '"' + (p.id === selected ? ' selected' : '') + '>' + esc(p.name) + (Core.isClosed(p) ? ' (selesai)' : '') + '</option>';
    return h + '</select>';
  };
  H.options = (list, selected) => list.map(v => '<option' + (v === selected ? ' selected' : '') + '>' + esc(v) + '</option>').join('');

  H.notaChip = t => {
    if (t.type === 'income') return '';
    if (t.photoId) { const pdf = UI.isPdfId(t.photoId); return '<button type="button" class="chip-file" data-act="photo-view" data-id="' + t.id + '" title="Lihat bukti nota">' + icon(pdf ? 'file' : 'image') + (pdf ? 'Nota.pdf' : 'Foto nota') + '</button>'; }
    if (t.noReceipt) return '<span class="chip-warn" title="' + esc(t.noReceiptReason) + '">' + icon('alert') + 'Tanpa nota</span>';
    return '<span class="chip-missing">' + icon('camera') + 'Belum ada nota</span>';
  };
  H.claimRef = t => {
    if (t.type !== 'expense') return '';
    const c = t.claimId && H.claimOf(t.claimId);
    if (c) return '<a class="sub" href="#/claim/' + c.id + '">' + esc(c.number) + '</a>';
    return t.status === TX.REJECTED ? '' : '<span class="sub">Belum diajukan</span>';
  };
  H.thumb = t => {
    if (!t.photoId) return t.noReceipt ? '<span class="chip-warn" title="' + esc(t.noReceiptReason) + '">' + icon('alert') + 'Tanpa nota</span>' : '<span class="chip-missing">' + icon('camera') + 'Belum ada</span>';
    if (UI.isPdfId(t.photoId)) return '<button type="button" class="thumb-pdf" data-act="photo-view" data-id="' + t.id + '" aria-label="Lihat PDF">' + icon('file') + '</button>';
    return '<img class="thumb" data-photo="' + t.photoId + '" data-act="photo-view" data-id="' + t.id + '" alt="Foto nota" loading="lazy">';
  };

  H.txRow = (t, o) => {
    o = o || {}; const inc = t.type === 'income';
    return '<tr class="click" data-act="tx-open" data-id="' + t.id + '">' +
      '<td class="c-main">' + esc(t.description) + ((t.vendor || t.client) ? '<span class="sub">' + esc(t.vendor || t.client) + '</span>' : '') +
        '<span class="sub show-narrow">' + dt(t.date) + ' · ' + (o.noProject ? '' : esc(H.projName(t.projectId)) + ' · ') + esc(t.category) + '</span></td>' +
      (o.noProject ? '' : '<td data-label="Project" class="col-lg">' + esc(H.projName(t.projectId)) + '</td>') +
      '<td data-label="Kategori" class="col-lg">' + esc(t.category) + '</td>' +
      '<td data-label="Tanggal" class="nowrap col-lg">' + dt(t.date) + '</td>' +
      '<td data-label="Sumber">' + (inc ? '<span class="tag tag-company">Pemasukan</span>' : fundTag(t.fund)) + '</td>' +
      '<td class="num nowrap" data-label="Nominal"><b class="' + (inc ? 'ok' : '') + '">' + (inc ? '+ ' : '') + rp(t.amount) + '</b></td>' +
      '<td data-label="' + (inc ? '' : 'Nota') + '">' + H.notaChip(t) + '</td>' +
      '<td data-label="Status">' + pill(inc ? TX.RECORDED : t.status, UI.txStatusLabel(S(), t)) + H.claimRef(t) + '</td></tr>';
  };
  H.txTable = (list, o) => {
    o = o || {};
    if (!list.length) return H.empty(o.emptyIcon || 'file', o.emptyTitle || 'Belum ada transaksi', o.emptyText || '', o.emptyAction || '');
    return '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Deskripsi</th>' + (o.noProject ? '' : '<th class="col-lg">Project</th>') + '<th class="col-lg">Kategori</th><th class="col-lg">Tanggal</th><th>Sumber</th><th class="num">Nominal</th><th>Nota</th><th>Status</th></tr></thead><tbody>' + list.map(t => H.txRow(t, o)).join('') + '</tbody></table></div>';
  };

  // Kop surat untuk nota dan laporan cetak: logo Numind, plus nama perusahaan bila diubah di Pengaturan.
  H.letterhead = company => {
    const name = (company || '').trim();
    return '<div class="letterhead"><img class="lh-logo" src="img/numind-black.png" alt="Numind">' + (name && name.toLowerCase() !== 'numind' ? '<div class="lh-co">' + esc(name) + '</div>' : '') + '</div>';
  };
  H.claimProjects = c => c.projectIds.map(id => H.projName(id)).join(', ') || '—';
  H.claimKind = c => (c.mode === 'project' ? 'Per project' : 'Per periode') + (c.period ? ' · ' + UI.monthLabel(c.period) : '');
  H.claimRow = c => {
    return '<tr class="click" data-act="go" data-to="#/claim/' + c.id + '">' +
      '<td class="c-main"><a href="#/claim/' + c.id + '"><b>' + esc(c.number) + '</b></a><span class="sub">' + esc(H.claimKind(c)) + '</span></td>' +
      '<td data-label="Dana">' + fundTag(c.fund) + '</td>' +
      '<td data-label="Project">' + esc(H.claimProjects(c)) + '</td>' +
      '<td class="num" data-label="Item">' + c.txIds.length + '</td>' +
      '<td class="num nowrap" data-label="Total"><b>' + rp(c.total) + '</b></td>' +
      '<td data-label="Diajukan" class="nowrap">' + dt(UI.dateOfISO(c.submittedAt)) + '</td>' +
      '<td data-label="Status">' + UI.claimPill(c) + '</td></tr>';
  };
  H.claimTable = (list, o) => {
    o = o || {};
    if (!list.length) return H.empty(o.emptyIcon || 'wallet', o.emptyTitle || 'Belum ada pengajuan', o.emptyText || '', o.emptyAction || '');
    return '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nomor</th><th>Dana</th><th>Project</th><th class="num">Item</th><th class="num">Total</th><th>Diajukan</th><th>Status</th></tr></thead><tbody>' + list.map(H.claimRow).join('') + '</tbody></table></div>';
  };

  /* ---------- Form pengeluaran ---------- */
  H.photoBlock = (photoId, o) => {
    o = o || {};
    const has = !!photoId;
    return '<div class="span-2" data-photo-block>' +
      '<input type="hidden" name="photoId" value="' + esc(photoId || '') + '"><input type="hidden" name="photoHash" value="' + esc(o.hash || '') + '">' +
      '<div class="field"><span>Bukti nota</span></div>' +
      '<div class="capture" data-capture' + (has ? ' hidden' : '') + '>' +
      '<label class="cap-btn">' + icon('camera') + 'Foto nota<input type="file" accept="image/*" capture="environment" data-change="photo-picked"></label>' +
      '<label class="cap-btn">' + icon('upload') + 'Galeri atau PDF<input type="file" accept="image/*,application/pdf" data-change="photo-picked"></label></div>' +
      '<div class="photo-prev" data-prev' + (has ? '' : ' hidden') + '>' +
      (has ? (UI.isPdfId(photoId) ? '<span class="pdf-ico" data-prev-ico>' + icon('file') + '</span>' : '<img data-photo="' + esc(photoId) + '" alt="Pratinjau nota" data-prev-ico>') : '<span data-prev-ico></span>') +
      '<div class="meta"><b>Nota terlampir</b><span class="muted" data-prev-name>' + (has ? (UI.isPdfId(photoId) ? 'Berkas PDF' : 'Foto nota') : '') + '</span><div data-prev-warn></div></div>' +
      (o.lock ? '' : '<button type="button" class="btn btn-sm" data-act="photo-clear">Ganti</button>') + '</div>' +
      '<label class="check mt" data-noreceipt' + (has ? ' hidden' : '') + '><input type="checkbox" name="noReceipt" data-change="noreceipt-toggle"' + (o.noReceipt ? ' checked' : '') + '><span>Tidak ada nota <small class="muted">(parkir, ojek, warung — wajib beri alasan)</small></span></label>' +
      '<label class="field mt" data-reason' + (o.noReceipt && !has ? '' : ' hidden') + '><span>Alasan tanpa nota</span><input name="noReceiptReason" type="text" maxlength="140" value="' + esc(o.reason || '') + '" placeholder="Mis. karcis parkir tidak diberikan petugas"></label>' +
      '</div>';
  };

  /** o: {tx, defaults, photoId, hash, lockPhoto, formId, mode:'create'|'edit'|'inbox', hiddenId} */
  H.expenseForm = o => {
    o = o || {};
    const s = S(), last = s.settings.last || {}, t = o.tx || {};
    const running = s.projects.find(p => !Core.isClosed(p));
    const v = {
      date: t.date || last.date || Core.todayStr(),
      projectId: t.projectId || (o.defaults && o.defaults.projectId) || last.projectId || (running || s.projects[0] || {}).id,
      category: t.category || last.category || 'Konsumsi',
      fund: t.fund || last.fund || FUND.PERSONAL,
      description: t.description || '', vendor: t.vendor || '', amount: t.amount || '', notaNo: t.notaNo || ''
    };
    if (v.date > Core.todayStr()) v.date = Core.todayStr();
    const photoId = o.photoId !== undefined ? o.photoId : (t.photoId || '');
    const rev = t.status === TX.REVISION;
    const locked = rev; // sumber dana terkunci setelah masuk pengajuan
    const form = o.formId || 'expense-form';
    return '<form id="' + form + '" data-form="' + (o.mode === 'edit' ? 'expense-edit' : o.mode === 'inbox' ? 'inbox-convert' : 'expense-create') + '" ' + (t.id ? 'data-id="' + t.id + '" ' : '') + (o.hiddenId ? 'data-receipt="' + o.hiddenId + '" ' : '') + 'data-orig-photo="' + esc(t.photoId || '') + '"' + (o.lockPhoto ? ' data-locked-photo="' + esc(photoId) + '"' : '') + ' novalidate autocomplete="off">' +
      (rev ? H.banner('warn', 'undo', '<b>Catatan dari Finance</b><br>' + esc(t.revNote || '')) + '<div class="mb"></div>' : '') +
      '<div class="form-grid">' +
      '<label class="field"><span>Tanggal</span><input type="date" name="date" value="' + v.date + '" max="' + Core.todayStr() + '" required></label>' +
      '<label class="field"><span>Project</span>' + H.projectSelect('projectId', v.projectId, { required: true }) + '</label>' +
      '<label class="field"><span>Kategori</span><select name="category">' + H.options(Core.CATEGORIES_EXPENSE, v.category) + '</select></label>' +
      '<label class="field"><span>Nominal</span><div class="money"><input name="amount" data-money inputmode="numeric" value="' + (v.amount ? UI.num(v.amount) : '') + '" placeholder="0" required></div></label>' +
      '<label class="field span-2"><span>Deskripsi</span><input name="description" type="text" maxlength="120" value="' + esc(v.description) + '" placeholder="Mis. Makan siang kru shooting hari 1" required></label>' +
      '<label class="field"><span>Toko / vendor <em>opsional</em></span><input name="vendor" type="text" maxlength="80" value="' + esc(v.vendor) + '"></label>' +
      '<label class="field"><span>No. nota <em>opsional</em></span><input name="notaNo" type="text" maxlength="40" value="' + esc(v.notaNo) + '"></label>' +
      '<fieldset class="span-2 opts-set" style="border:0;padding:0;margin:0"><legend class="field" style="margin-bottom:6px"><span>Sumber dana</span></legend><div class="opts">' +
      '<label class="opt"><input type="radio" name="fund" value="pribadi"' + (v.fund === FUND.PERSONAL ? ' checked' : '') + (locked ? ' disabled' : '') + '><span><b>Dana pribadi Producer</b><small>Saya talangi dulu. Menjadi piutang reimbursement ke perusahaan.</small></span></label>' +
      '<label class="opt"><input type="radio" name="fund" value="perusahaan"' + (v.fund === FUND.COMPANY ? ' checked' : '') + (locked ? ' disabled' : '') + '><span><b>Dana operasional perusahaan</b><small>Pakai kas kantor. Tercatat sebagai pemakaian petty cash, bukan tagihan.</small></span></label></div></fieldset>' +
      H.photoBlock(photoId, { hash: o.hash || t.photoHash, noReceipt: t.noReceipt, reason: t.noReceiptReason, lock: o.lockPhoto }) +
      (rev ? '<label class="field span-2"><span>Catatan perbaikan untuk Finance</span><textarea name="revReply" rows="2" placeholder="Jelaskan apa yang sudah diperbaiki" required>' + esc(t.revReply || '') + '</textarea></label>' : '') +
      '</div><div class="form-error" role="alert" hidden></div>' +
      (o.mode === 'create' ? '<div class="form-actions"><button class="btn btn-primary btn-lg" type="submit">' + icon('check') + 'Simpan pengeluaran</button></div>' : '') +
      '</form>';
  };
  // Radio yang dikunci (disabled) tidak ikut terkirim oleh FormData, jadi baca langsung dari elemen.
  const fundOf = (form, f) => { const r = form.querySelector('input[name=fund]:checked'); return (r && r.value) || f.get('fund') || undefined; };
  H.readExpense = form => {
    const f = new FormData(form);
    return {
      date: f.get('date'), projectId: f.get('projectId'), category: f.get('category'), description: f.get('description'), vendor: f.get('vendor'),
      amount: UI.parseAmount(f.get('amount')), fund: fundOf(form, f), notaNo: f.get('notaNo'),
      photoId: f.get('photoId') || null, photoHash: f.get('photoHash') || null,
      noReceipt: f.get('noReceipt') === 'on', noReceiptReason: f.get('noReceiptReason') || ''
    };
  };

  /* ---------- Form pemasukan ---------- */
  H.incomeForm = o => {
    o = o || {};
    const t = o.tx || {}, last = S().settings.last || {};
    const form = o.formId || 'income-form';
    return '<form id="' + form + '" data-form="' + (o.mode === 'edit' ? 'income-edit' : 'income-create') + '" ' + (t.id ? 'data-id="' + t.id + '"' : '') + ' novalidate autocomplete="off"><div class="form-grid">' +
      '<label class="field"><span>Tanggal</span><input type="date" name="date" value="' + (t.date || Core.todayStr()) + '" max="' + Core.todayStr() + '" required></label>' +
      '<label class="field"><span>Kategori</span><select name="category">' + H.options(Core.CATEGORIES_INCOME, t.category || 'DP / Termin') + '</select></label>' +
      '<label class="field span-2"><span>Project <em>kosongkan untuk top-up petty cash</em></span>' + H.projectSelect('projectId', t.projectId || last.incomeProjectId || '', { blank: '— Tanpa project —' }) + '</label>' +
      '<label class="field span-2"><span>Keterangan</span><input name="description" type="text" maxlength="120" value="' + esc(t.description || '') + '" placeholder="Mis. DP 50% Video Company Profile" required></label>' +
      '<label class="field"><span>Klien / pengirim <em>opsional</em></span><input name="client" type="text" maxlength="80" value="' + esc(t.client || '') + '"></label>' +
      '<label class="field"><span>No. invoice / ref <em>opsional</em></span><input name="ref" type="text" maxlength="40" value="' + esc(t.ref || '') + '"></label>' +
      '<label class="field span-2"><span>Nominal</span><div class="money"><input name="amount" data-money inputmode="numeric" value="' + (t.amount ? UI.num(t.amount) : '') + '" placeholder="0" required></div></label>' +
      '</div><div class="form-error" role="alert" hidden></div>' +
      (o.mode === 'edit' ? '' : '<div class="form-actions"><button class="btn btn-primary btn-lg" type="submit">' + icon('check') + 'Simpan pemasukan</button></div>') + '</form>';
  };
  H.readIncome = form => {
    const f = new FormData(form);
    return { date: f.get('date'), category: f.get('category'), projectId: f.get('projectId') || null, description: f.get('description'), client: f.get('client'), ref: f.get('ref'), amount: UI.parseAmount(f.get('amount')) };
  };

  /* ---------- Penanganan error & duplikat ---------- */
  H.formError = (form, msg) => {
    let el = form.querySelector('.form-error');
    if (!el) { el = document.createElement('div'); el.className = 'form-error'; el.setAttribute('role', 'alert'); form.appendChild(el); }
    el.hidden = !msg; el.textContent = msg || '';
    if (msg) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  H.confirmDup = dups => {
    const li = dups.map(d => {
      if (d.tx) return '<li><b>' + esc(d.tx.description) + '</b> — ' + dt(d.tx.date) + ', ' + rp(d.tx.amount) + ' <span class="muted">(' + esc(d.reasons.join(', ')) + ')</span></li>';
      return '<li><b>' + esc(d.label) + '</b> <span class="muted">(foto yang sama)</span></li>';
    }).join('');
    return UI.confirmBox({
      title: 'Mirip dengan data yang sudah ada',
      html: '<p>Supaya tidak ada penggantian ganda, pastikan ini memang transaksi yang berbeda.</p><ul>' + li + '</ul>',
      okText: 'Ya, ini transaksi berbeda', cancelText: 'Periksa lagi'
    });
  };
  /** Jalankan fn(confirmDuplicate). Jika ada duplikat, minta konfirmasi lalu ulangi. */
  H.tryDup = async fn => {
    try { return { ok: true, value: fn(false) }; }
    catch (e) {
      if (e && e.code === 'duplicate') {
        const dups = e.duplicates || (e.hit ? [{ label: e.hit.label }] : []);
        if (!(await H.confirmDup(dups))) return { ok: false, cancelled: true };
        try { return { ok: true, value: fn(true) }; } catch (e2) { return { ok: false, error: e2 }; }
      }
      return { ok: false, error: e };
    }
  };
  H.fail = (form, e) => {
    if (e instanceof Core.CoreError) { if (form) H.formError(form, e.message); else UI.toast(e.message, 'error'); }
    else { console.error(e); UI.toast('Terjadi kesalahan: ' + (e && e.message || e), 'error'); }
  };
  H.rememberLast = d => {
    const l = S().settings.last = S().settings.last || {};
    if (d.projectId) l.projectId = d.projectId; if (d.category) l.category = d.category; if (d.fund) l.fund = d.fund; if (d.date) l.date = d.date;
  };

  /* ---------- Foto: pilih, pratinjau, hapus ---------- */
  H.setPhoto = async (form, r) => {
    const old = form.elements.photoId.value;
    if (old && old !== form.dataset.origPhoto && old !== form.dataset.lockedPhoto) DB.deletePhoto(old);
    form.elements.photoId.value = r.id; form.elements.photoHash.value = r.hash;
    const blk = form.querySelector('[data-photo-block]');
    blk.querySelector('[data-capture]').hidden = true;
    const prev = blk.querySelector('[data-prev]'); prev.hidden = false;
    const holder = prev.querySelector('[data-prev-ico]');
    let node;
    if (r.kind === 'pdf') { node = document.createElement('span'); node.className = 'pdf-ico'; node.innerHTML = icon('file'); }
    else { node = document.createElement('img'); node.alt = 'Pratinjau nota'; node.src = (await DB.photoURL(r.id)) || ''; }
    node.setAttribute('data-prev-ico', ''); holder.replaceWith(node);
    prev.querySelector('[data-prev-name]').textContent = (r.kind === 'pdf' ? 'PDF' : 'Foto') + ' · ' + Math.max(1, Math.round(r.size / 1024)) + ' KB';
    const hit = Core.findReceiptHash(S(), r.hash);
    const warn = prev.querySelector('[data-prev-warn]');
    warn.innerHTML = hit && hit.id !== form.dataset.id ? '<div class="inline-warn">' + icon('alert') + ' Foto ini sama dengan nota di “' + esc(hit.label) + '”. Pastikan bukan nota yang sama.</div>' : '';
    const nr = blk.querySelector('[data-noreceipt]'); nr.hidden = true; nr.querySelector('input').checked = false;
    blk.querySelector('[data-reason]').hidden = true;
  };
  H.clearPhoto = form => {
    const old = form.elements.photoId.value;
    if (old && old !== form.dataset.origPhoto && old !== form.dataset.lockedPhoto) DB.deletePhoto(old);
    form.elements.photoId.value = ''; form.elements.photoHash.value = '';
    const blk = form.querySelector('[data-photo-block]');
    blk.querySelector('[data-capture]').hidden = false;
    blk.querySelector('[data-prev]').hidden = true;
    blk.querySelector('[data-noreceipt]').hidden = false;
  };
  Change['photo-picked'] = async el => {
    const file = el.files && el.files[0]; if (!file) return;
    const form = el.closest('form');
    el.disabled = true;
    try { H.setPhoto(form, await DB.savePhotoFile(file)); H.formError(form, ''); }
    catch (e) { UI.toast(e.message || 'Foto tidak bisa diproses.', 'error'); }
    finally { el.disabled = false; el.value = ''; }
  };
  Change['noreceipt-toggle'] = el => { const blk = el.closest('[data-photo-block]'); blk.querySelector('[data-reason]').hidden = !el.checked; if (el.checked) blk.querySelector('[name=noReceiptReason]').focus(); };
  Act['photo-clear'] = (d, el) => H.clearPhoto(el.closest('form'));

  Act['photo-view'] = async d => {
    const id = d.photo || (S().transactions.find(t => t.id === d.id) || {}).photoId;
    if (!id) return;
    const dlg = UI.makeDialog({ title: 'Bukti nota', wide: true, html: '<div class="photo-view"><p class="muted">Memuat…</p></div>' });
    const box = dlg.body.firstElementChild; let body;
    if (id.startsWith('demo-')) { const tx = S().transactions.find(t => t.photoId === id); body = '<img alt="Contoh nota" src="' + UI.demoReceiptURL(tx) + '"><p class="muted mt small">Ini contoh nota dari data demo.</p>'; }
    else {
      const u = await DB.photoURL(id);
      if (!u) body = '<p class="muted">Berkas nota tidak ditemukan di perangkat ini.</p>';
      else if (UI.isPdfId(id)) body = '<iframe src="' + u + '" title="Nota PDF"></iframe><p class="mt"><a class="btn" href="' + u + '" target="_blank" rel="noopener">Buka di tab baru</a></p>';
      else body = '<img alt="Foto nota" src="' + u + '"><p class="mt"><a class="btn btn-sm" href="' + u + '" download="nota.jpg">' + icon('download') + 'Unduh foto</a></p>';
    }
    box.innerHTML = body;
  };

  /* ---------- Detail transaksi ---------- */
  H.openTx = id => {
    const s = S(), t = s.transactions.find(x => x.id === id); if (!t) return;
    const inc = t.type === 'income', claim = t.claimId && H.claimOf(t.claimId);
    const notes = [];
    if (t.status === TX.REVISION && t.revNote) notes.push(H.banner('warn', 'undo', '<b>Finance meminta revisi</b><br>' + esc(t.revNote)));
    if (t.revReply && t.status !== TX.REVISION) notes.push(H.banner('info', 'info', '<b>Catatan perbaikan Producer</b><br>' + esc(t.revReply)));
    if (t.status === TX.REJECTED && t.rejectReason) notes.push(H.banner('error', 'x', '<b>Ditolak</b><br>' + esc(t.rejectReason)));
    if (t.noReceipt) notes.push(H.banner('warn', 'alert', '<b>Tanpa nota</b><br>' + esc(t.noReceiptReason)));
    if (t.dupConfirmed) notes.push(H.banner('warn', 'alert', 'Transaksi ini mirip dengan data lain dan sudah dikonfirmasi saat dicatat.'));
    if (t.status === TX.DRAFT) notes.push(H.banner('info', 'camera', '<b>Draft.</b> Tambahkan foto nota (atau alasan tanpa nota) agar bisa diajukan.'));
    const photo = t.photoId ? '<div class="mb">' + (UI.isPdfId(t.photoId) ? '<button type="button" class="btn" data-act="photo-view" data-id="' + t.id + '">' + icon('file') + 'Buka nota PDF</button>' : '<img class="thumb" style="width:100%;max-width:280px;height:auto;max-height:240px;object-fit:contain" data-photo="' + t.photoId + '" data-act="photo-view" data-id="' + t.id + '" alt="Foto nota">') + '</div>' : '';
    const dl = [['Tanggal', dt(t.date)], ['Project', t.projectId ? H.projName(t.projectId) : '—'], ['Kategori', t.category],
      [inc ? 'Klien / pengirim' : 'Toko / vendor', t.vendor || t.client || '—'], [inc ? 'No. invoice / ref' : 'No. nota', t.notaNo || t.ref || '—'],
      ['Nominal', rp(t.amount)]];
    if (!inc) dl.push(['Sumber dana', Core.FUND_LABEL[t.fund]]);
    dl.push(['Pengajuan', claim ? '<a href="#/claim/' + claim.id + '" data-act="dlg-close-go">' + esc(claim.number) + '</a>' : (inc ? '—' : 'Belum diajukan')]);
    dl.push(['Dicatat oleh', t.createdBy || '—']);
    const hist = (t.history || []).slice().reverse().map(h => '<li><span class="who">' + esc(h.action) + '</span> <span class="when">oleh ' + esc(h.by) + ' · ' + UI.dtime(h.at) + '</span>' + (h.note ? '<div class="what">' + esc(h.note) + '</div>' : '') + '</li>').join('');
    const foot = (Core.isDeletable(t) ? '<button class="btn btn-danger" data-act="tx-delete" data-id="' + t.id + '">' + icon('trash') + 'Hapus</button><span class="sp"></span>' : '') +
      '<button class="btn" data-act="dlg-close">Tutup</button>' +
      (Core.isEditable(t) ? '<button class="btn btn-primary" data-act="tx-edit" data-id="' + t.id + '">' + icon('edit') + (t.status === TX.REVISION ? 'Perbaiki' : 'Ubah') + '</button>' : '');
    const dlg = UI.makeDialog({
      title: t.description, wide: true,
      html: '<div class="row mb">' + pill(inc ? TX.RECORDED : t.status, UI.txStatusLabel(s, t)) + (inc ? '<span class="tag tag-company">Pemasukan</span>' : fundTag(t.fund)) + '</div>' +
        '<div class="stack">' + notes.join('') + photo + '<dl class="detail-grid">' + dl.map(x => '<div><dt>' + x[0] + '</dt><dd>' + (x[0] === 'Pengajuan' ? x[1] : esc(x[1])) + '</dd></div>').join('') + '</dl>' +
        (hist ? '<div><h3 class="strong mb">Riwayat</h3><ul class="tl">' + hist + '</ul></div>' : '') + '</div>',
      footer: foot
    });
    UI.hydratePhotos(dlg.el, s);
  };
  Act['tx-open'] = d => H.openTx(d.id);
  Act['dlg-close-go'] = () => UI.closeAllDialogs();

  Act['tx-delete'] = async d => {
    const t = S().transactions.find(x => x.id === d.id); if (!t) return;
    if (!(await UI.confirmBox({ title: 'Hapus transaksi?', message: '“' + t.description + '” (' + rp(t.amount) + ') akan dihapus permanen.', okText: 'Hapus', danger: true }))) return;
    let removed = null;
    if (App.commit(() => { removed = Core.deleteTransaction(S(), d.id); }, 'Transaksi dihapus')) { UI.closeAllDialogs(); if (removed && removed.removedPhotoId) DB.deletePhoto(removed.removedPhotoId); App.render(); }
  };

  Act['tx-edit'] = d => {
    const t = S().transactions.find(x => x.id === d.id); if (!t) return;
    UI.closeAllDialogs();
    const inc = t.type === 'income';
    const dlg = UI.makeDialog({
      title: (t.status === TX.REVISION ? 'Perbaiki: ' : 'Ubah: ') + t.description, wide: !inc,
      html: inc ? H.incomeForm({ tx: t, mode: 'edit', formId: 'edit-form' }) : H.expenseForm({ tx: t, mode: 'edit', formId: 'edit-form' }),
      footer: '<button class="btn" data-act="dlg-close">Batal</button><button class="btn btn-primary" type="submit" form="edit-form">Simpan perubahan</button>'
    });
    UI.bindMoney(dlg.el); UI.hydratePhotos(dlg.el, S());
  };

  Forms['expense-create'] = async form => {
    const data = H.readExpense(form);
    const r = await H.tryDup(c => Core.addExpense(S(), data, App.actor(), { confirmDuplicate: c }));
    if (r.cancelled) return;
    if (!r.ok) return H.fail(form, r.error);
    H.rememberLast(data); App.save();
    const st = r.value.status;
    App.render();
    UI.toast(st === TX.DRAFT ? 'Tersimpan sebagai Draft. Tambahkan foto nota agar bisa diajukan.' : 'Pengeluaran tersimpan (' + st + ')', st === TX.DRAFT ? '' : 'success');
    setTimeout(() => { const f = document.querySelector('#expense-form [name=description]'); if (f) f.focus(); }, 60);
  };
  Forms['expense-edit'] = async form => {
    const data = H.readExpense(form);
    if (form.elements.revReply) data.revReply = form.elements.revReply.value;
    let res;
    const r = await H.tryDup(c => { res = Core.updateExpense(S(), form.dataset.id, data, App.actor(), { confirmDuplicate: c }); return res; });
    if (r.cancelled) return;
    if (!r.ok) return H.fail(form, r.error);
    if (res.removedPhotoId) DB.deletePhoto(res.removedPhotoId);
    App.save(); UI.closeAllDialogs(); App.render();
    UI.toast(res.tx.status === TX.REVISION ? 'Perbaikan tersimpan. Ajukan ulang dari halaman pengajuan.' : 'Perubahan tersimpan', 'success');
  };
  Forms['inbox-convert'] = async form => {
    const data = H.readExpense(form);
    const r = await H.tryDup(c => Core.convertReceipt(S(), form.dataset.receipt, data, App.actor(), { confirmDuplicate: c }));
    if (r.cancelled) return;
    if (!r.ok) return H.fail(form, r.error);
    H.rememberLast(data); App.save(); UI.closeAllDialogs(); App.render();
    UI.toast('Nota dilengkapi menjadi pengeluaran (' + r.value.status + ')', 'success');
  };
  Forms['income-create'] = form => {
    const data = H.readIncome(form);
    try { Core.addIncome(S(), data, App.actor()); } catch (e) { return H.fail(form, e); }
    S().settings.last = Object.assign(S().settings.last || {}, { incomeProjectId: data.projectId || '' });
    App.save(); App.render(); UI.toast('Pemasukan tersimpan', 'success');
  };
  Forms['income-edit'] = form => {
    try { Core.updateIncome(S(), form.dataset.id, H.readIncome(form), App.actor()); } catch (e) { return H.fail(form, e); }
    App.save(); UI.closeAllDialogs(); App.render(); UI.toast('Perubahan tersimpan', 'success');
  };
})();
