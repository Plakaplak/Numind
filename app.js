/* ==========================================================================
   app.js — Kerangka aplikasi: state, router, navigasi, popover, pencarian,
   penyimpanan, pemasangan PWA, service worker.
   ========================================================================== */
(function () {
  'use strict';
  const { esc, rp, icon } = UI;
  const { TX, CL } = Core;
  const App = window.App = { state: null, ui: {}, query: {}, route: { name: 'dashboard', params: [] }, installEvent: null };

  const NAV = [
    { id: 'dashboard', label: 'Dashboard', ic: 'home', group: '' },
    { id: 'projects', label: 'Project Management', ic: 'folder', group: '' },
    { id: 'expense', label: 'Input Pengeluaran', ic: 'up', group: 'Catat' },
    { id: 'income', label: 'Input Pemasukan', ic: 'down', group: 'Catat' },
    { id: 'receipts', label: 'Upload Bon / Nota', ic: 'camera', group: 'Catat' },
    { id: 'reimburse', label: 'Reimbursement', ic: 'wallet', group: 'Pengajuan' },
    { id: 'approval', label: 'Approval Center', ic: 'checkc', group: 'Pengajuan' },
    { id: 'report', label: 'Financial Report', ic: 'chart', group: 'Laporan' },
    { id: 'export', label: 'Export Data', ic: 'download', group: 'Laporan' }
  ];
  const ACTIVE_OF = { project: 'projects', claim: 'reimburse' };
  const TITLE_OF = { project: 'Detail Project', claim: 'Detail Pengajuan' };

  /* ---------- Peran & penyimpanan ---------- */
  App.role = () => (App.state && App.state.settings.role) || 'producer';
  App.actor = () => ({ name: ((App.state.settings.userName || '').trim()) || Core.ROLES[App.role()], role: App.role() });

  let saveTimer = null;
  async function flush() {
    try { await DB.saveState(App.state); } catch (e) { console.error(e); UI.toast('Gagal menyimpan data di perangkat ini: ' + (e && e.message), 'error'); }
  }
  App.save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(flush, 120); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { clearTimeout(saveTimer); flush(); } });
  window.addEventListener('pagehide', () => { clearTimeout(saveTimer); flush(); });

  App.commit = (fn, msg, kind) => {
    try { fn(); } catch (e) { H.fail(null, e); return false; }
    App.save(); App.render();
    if (msg) UI.toast(msg, kind || 'success');
    return true;
  };
  App.replaceState = st => { App.state = st; App.ui = {}; App.save(); App.render(); DB.gcPhotos(st); };
  App.refreshResults = view => {
    const box = document.getElementById('results');
    if (box && V[view] && V[view].results) { box.innerHTML = V[view].results(); UI.hydratePhotos(box, App.state); }
  };

  /* ---------- Router ---------- */
  function parseHash() {
    const raw = (location.hash || '').replace(/^#\/?/, '');
    const [path, qs] = raw.split('?');
    const seg = path.split('/').filter(Boolean);
    const query = {}; (qs || '').split('&').filter(Boolean).forEach(p => { const [k, v] = p.split('='); query[decodeURIComponent(k)] = decodeURIComponent(v || ''); });
    return { name: seg[0] || 'dashboard', params: seg.slice(1).map(decodeURIComponent), query };
  }
  App.go = hash => { if (location.hash === hash) App.render(); else location.hash = hash; };
  function onRoute() {
    const r = parseHash(); App.route = r; App.query = r.query;
    UI.closeAllDialogs(); UI.closePop();
    App.render(true);
    window.scrollTo(0, 0);
    const v = document.getElementById('view'); if (v) v.focus({ preventScroll: true });
  }
  window.addEventListener('hashchange', onRoute);

  /* ---------- Render ---------- */
  App.render = () => {
    const r = App.route, view = document.getElementById('view');
    const fn = V[r.name];
    let html;
    if (!fn) html = H.pageHead('Halaman tidak ditemukan', '', '<a class="btn btn-primary" href="#/dashboard">Ke Dashboard</a>');
    else { try { html = fn.apply(null, r.params); } catch (e) { console.error(e); html = H.pageHead('Terjadi kesalahan', '') + '<div class="card">' + H.empty('alert', 'Halaman ini tidak bisa ditampilkan', String(e && e.message || e), '<a class="btn btn-primary" href="#/dashboard">Ke Dashboard</a>') + '</div>'; } }
    view.innerHTML = html;
    UI.bindMoney(view); UI.hydratePhotos(view, App.state);
    renderChrome();
  };

  function counts() {
    const s = App.state, role = App.role(), rev = role !== 'producer';
    const cs = s.claims.filter(c => c.status !== CL.CANCELLED);
    const waiting = cs.filter(c => c.status === CL.WAITING).length, appr = cs.filter(c => c.status === CL.APPROVED).length, revi = cs.filter(c => c.status === CL.REVISION).length;
    const drafts = s.transactions.filter(t => t.type === 'expense' && t.status === TX.DRAFT).length;
    return { approval: rev ? waiting + appr : 0, reimburse: revi, receipts: s.receipts.length + drafts, waiting, appr, revi, drafts };
  }
  function renderChrome() {
    const s = App.state, r = App.route, active = ACTIVE_OF[r.name] || r.name, c = counts();
    const badge = id => (c[id] ? '<span class="nav-count">' + c[id] + '</span>' : '');
    let side = '', lastGroup = null;
    for (const n of NAV) {
      if (n.group !== lastGroup && n.group) side += '<div class="nav-group">' + n.group + '</div>';
      lastGroup = n.group;
      side += '<a class="nav-item' + (active === n.id ? ' active' : '') + '" href="#/' + n.id + '"' + (active === n.id ? ' aria-current="page"' : '') + '>' + icon(n.ic) + '<span>' + n.label + '</span>' + badge(n.id) + '</a>';
    }
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.navigator.standalone;
    const canInstall = !!App.installEvent || ios;
    side += '<div class="side-foot">' + (canInstall ? '<button class="btn btn-sm btn-block" data-act="install-app">' + icon('download') + 'Pasang aplikasi</button>' : '') +
      '<span>Peran: <b style="color:var(--ink)">' + Core.ROLES[App.role()] + '</b> · <button class="link-btn" data-act="settings-open" style="font-size:12.5px">Ubah</button></span><span>Data tersimpan di perangkat ini dan bisa dipakai offline.</span></div>';
    document.getElementById('sidebar').innerHTML = side;

    const bn = (id, ic, label, href) => '<a class="bn' + (active === id ? ' active' : '') + '" href="' + href + '">' + icon(ic) + '<span>' + label + '</span>' + badge(id) + '</a>';
    document.getElementById('bottomNav').innerHTML = bn('dashboard', 'home', 'Beranda', '#/dashboard') + bn('projects', 'folder', 'Project', '#/projects') +
      '<button class="bn fab" data-act="quick-add" data-sheet="1" aria-label="Tambah catatan"><span class="fab-c">' + icon('plus') + '</span></button>' +
      bn('reimburse', 'wallet', 'Reimburse', '#/reimburse') + '<button class="bn" data-act="more-open">' + icon('menu') + '<span>Menu</span>' + (c.approval ? '<span class="nav-count">' + c.approval + '</span>' : '') + '</button>';

    const nav = NAV.find(n => n.id === active);
    const name = TITLE_OF[r.name] || (nav ? nav.label : 'KasProyek');
    document.getElementById('pageName').textContent = name;
    document.title = name + ' — KasProyek';
    const nm = (s.settings.userName || Core.ROLES[App.role()] || 'K');
    document.getElementById('avatar').textContent = UI.initials(nm);
    document.getElementById('avatar').title = Core.ROLES[App.role()];
    const rev = App.role() !== 'producer';
    document.getElementById('bellDot').hidden = !((rev && (c.waiting || c.appr)) || c.revi || c.drafts);
  }

  /* ---------- Event delegation ---------- */
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const a = e.target.closest('a[href]');
    if (a && a !== el && el.contains(a) && !a.hasAttribute('data-act')) return;
    const fn = Act[el.dataset.act]; if (!fn) return;
    if (el.closest('.pop')) UI.closePop();
    try { const r = fn(el.dataset, el, e); if (r && r.catch) r.catch(err => H.fail(null, err)); } catch (err) { H.fail(null, err); }
  });
  document.addEventListener('submit', e => {
    const f = e.target.closest('form[data-form]'); if (!f) return;
    e.preventDefault();
    const fn = Forms[f.dataset.form]; if (!fn || f.dataset.busy) return;
    f.dataset.busy = '1';
    let r; try { r = fn(f, e); } catch (err) { delete f.dataset.busy; return H.fail(f, err); }
    Promise.resolve(r).catch(err => H.fail(f, err)).finally(() => { delete f.dataset.busy; });
  });
  document.addEventListener('change', e => {
    const el = e.target.closest('[data-change]'); if (!el) return;
    const fn = Change[el.dataset.change]; if (!fn) return;
    try { const r = fn(el, e); if (r && r.catch) r.catch(err => H.fail(null, err)); } catch (err) { H.fail(null, err); }
  });
  document.addEventListener('input', e => {
    const el = e.target.closest('[data-input]'); if (!el) return;
    const fn = Inp[el.dataset.input]; if (fn) fn(el, e);
  });

  Act.go = d => App.go(d.to);
  Act['dlg-close'] = (d, el) => { const dlg = UI.dialogOf(el); if (dlg) dlg.close(); };
  const setFilter = el => { const { view, key } = el.dataset; const f = App.ui[view] = App.ui[view] || {}; f[key] = el.value; if ('limit' in f) f.limit = 30; App.refreshResults(view); };
  Change.filter = setFilter; Inp.filter = setFilter;
  Act['reload-app'] = () => location.reload();

  /* ---------- Menu cepat, akun, notifikasi ---------- */
  const QUICK = [['up', 'Catat pengeluaran', '#/expense', 'Nominal, kategori, foto nota'], ['down', 'Catat pemasukan', '#/income', 'DP, termin, top-up petty cash'], ['camera', 'Upload bon / nota', '#/receipts', 'Foto dulu, lengkapi nanti'], ['wallet', 'Buat pengajuan', null, 'Per project atau per periode']];
  Act['quick-add'] = (d, el) => {
    if (d.sheet) {
      UI.makeDialog({ title: 'Tambah catatan', cls: 'dlg-small', html: '<div class="stack" style="gap:8px">' + QUICK.map(q => q[2] ? '<a class="pop-item" href="' + q[2] + '" data-act="dlg-close">' + icon(q[0]) + '<span>' + q[1] + '<small>' + q[3] + '</small></span></a>' : '<button class="pop-item" data-act="wizard-from-sheet">' + icon(q[0]) + '<span>' + q[1] + '<small>' + q[3] + '</small></span></button>').join('') + '</div>' });
      return;
    }
    UI.openPop(el, '<div class="pop-title">Tambah catatan</div>' + QUICK.map(q => q[2] ? '<a class="pop-item" href="' + q[2] + '">' + icon(q[0]) + '<span>' + q[1] + '<small>' + q[3] + '</small></span></a>' : '<button class="pop-item" data-act="wizard-open">' + icon(q[0]) + '<span>' + q[1] + '<small>' + q[3] + '</small></span></button>').join(''));
  };
  Act['wizard-from-sheet'] = (d, el) => { const dlg = UI.dialogOf(el); if (dlg) dlg.close(); setTimeout(() => Act['wizard-open']({}), 30); };

  Act['user-open'] = (d, el) => {
    const roles = [['producer', 'Producer', 'Mencatat dan mengajukan'], ['finance', 'Finance', 'Memeriksa, menyetujui, membayar'], ['director', 'Director', 'Menyetujui pengajuan']];
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.navigator.standalone;
    UI.openPop(el, '<div class="pop-title">Masuk sebagai ' + esc(App.state.settings.userName || '') + '</div>' +
      roles.map(r => '<button class="pop-item' + (App.role() === r[0] ? ' on' : '') + '" data-act="set-role" data-role="' + r[0] + '">' + icon(App.role() === r[0] ? 'check' : 'user') + '<span>' + r[1] + '<small>' + r[2] + '</small></span></button>').join('') +
      '<hr><button class="pop-item" data-act="settings-open">' + icon('sliders') + 'Pengaturan</button>' +
      (App.installEvent || ios ? '<button class="pop-item" data-act="install-app">' + icon('download') + 'Pasang aplikasi</button>' : ''));
  };
  Act['set-role'] = d => { App.state.settings.role = d.role; App.save(); App.render(); UI.toast('Peran sekarang: ' + Core.ROLES[d.role]); };

  function notifItems() {
    const s = App.state, role = App.role(), rev = role !== 'producer', out = [];
    for (const c of s.claims) {
      if (rev && c.status === CL.WAITING) out.push({ ic: 'clock', t: c.number + ' menunggu approval', sub: rp(c.total) + ' · ' + (c.createdBy || ''), href: '#/claim/' + c.id });
      if (rev && c.status === CL.APPROVED) out.push({ ic: 'coins', t: c.number + ' siap dibayar', sub: rp(c.total), href: '#/claim/' + c.id });
      if (c.status === CL.REVISION) out.push({ ic: 'undo', t: c.number + ' perlu revisi', sub: rev ? 'Menunggu perbaikan Producer' : 'Perbaiki lalu ajukan ulang', href: '#/claim/' + c.id });
    }
    const drafts = s.transactions.filter(t => t.type === 'expense' && t.status === TX.DRAFT);
    if (drafts.length) out.push({ ic: 'camera', t: drafts.length + ' transaksi Draft tanpa nota', sub: 'Lengkapi agar bisa diajukan', href: '#/receipts' });
    if (s.receipts.length) out.push({ ic: 'image', t: s.receipts.length + ' nota di inbox belum dilengkapi', sub: 'Buka Upload Bon / Nota', href: '#/receipts' });
    return out.slice(0, 8);
  }
  Act['notif-open'] = (d, el) => {
    const items = notifItems();
    UI.openPop(el, '<div class="pop-title">Perlu perhatian</div>' + (items.length ? items.map(i => '<a class="pop-item" href="' + i.href + '">' + icon(i.ic) + '<span>' + esc(i.t) + '<small>' + esc(i.sub) + '</small></span></a>').join('') : '<div style="padding:18px 12px;color:var(--muted);font-size:14px">Tidak ada yang perlu ditindaklanjuti.</div>'), 'wide');
  };
  Act['more-open'] = () => {
    const c = counts();
    UI.makeDialog({
      title: 'Menu', html: '<div class="sheet-grid">' + NAV.map(n => '<a class="sheet-tile" href="#/' + n.id + '" data-act="dlg-close">' + icon(n.ic) + n.label + (c[n.id] ? '<span class="nav-count">' + c[n.id] + '</span>' : '') + '</a>').join('') +
        '<button class="sheet-tile" data-act="more-settings">' + icon('sliders') + 'Pengaturan</button><button class="sheet-tile" data-act="more-role">' + icon('user') + 'Peran: ' + Core.ROLES[App.role()] + '</button></div>'
    });
  };
  Act['more-settings'] = (d, el) => { const dlg = UI.dialogOf(el); if (dlg) dlg.close(); setTimeout(Act['settings-open'], 30); };
  Act['more-role'] = (d, el) => {
    const dlg = UI.dialogOf(el); if (dlg) dlg.close();
    setTimeout(() => UI.makeDialog({ title: 'Peran di perangkat ini', cls: 'dlg-small', html: '<div class="stack" style="gap:6px">' + [['producer', 'Producer', 'Mencatat dan mengajukan'], ['finance', 'Finance', 'Memeriksa, menyetujui, membayar'], ['director', 'Director', 'Menyetujui pengajuan']].map(r => '<button class="pop-item' + (App.role() === r[0] ? ' on' : '') + '" data-act="set-role-close" data-role="' + r[0] + '">' + icon(App.role() === r[0] ? 'check' : 'user') + '<span>' + r[1] + '<small>' + r[2] + '</small></span></button>').join('') + '</div>' }), 30);
  };
  Act['set-role-close'] = (d, el) => { const dlg = UI.dialogOf(el); if (dlg) dlg.close(); Act['set-role'](d); };

  /* ---------- Pencarian ---------- */
  Act['search-open'] = () => {
    const dlg = UI.makeDialog({ title: 'Cari', html: '<label class="search" style="max-width:none;margin-bottom:12px"><span class="sr-only">Kata kunci</span>' + icon('search') + '<input type="search" id="q" placeholder="Project, transaksi, vendor, no. nota, no. pengajuan" data-input="search" autocomplete="off"></label><div id="search-res"><p class="muted small">Ketik minimal 2 huruf.</p></div>' });
    setTimeout(() => dlg.el.querySelector('#q').focus(), 40);
  };
  Inp.search = el => {
    const res = Core.searchAll(App.state, el.value), box = document.getElementById('search-res'); if (!box) return;
    const q = el.value.trim(); if (q.length < 2) { box.innerHTML = '<p class="muted small">Ketik minimal 2 huruf.</p>'; return; }
    const row = (act, attrs, a, b) => '<button class="res-item" data-act="' + act + '" ' + attrs + '><span>' + esc(a) + '</span><span class="muted small">' + esc(b) + '</span></button>';
    const parts = [];
    if (res.projects.length) parts.push('<div class="res-group">Project</div>' + res.projects.map(p => row('search-go', 'data-to="#/project/' + p.id + '"', p.name, p.code)).join(''));
    if (res.claims.length) parts.push('<div class="res-group">Pengajuan</div>' + res.claims.map(c => row('search-go', 'data-to="#/claim/' + c.id + '"', c.number, c.status)).join(''));
    if (res.transactions.length) parts.push('<div class="res-group">Transaksi</div>' + res.transactions.map(t => row('search-tx', 'data-id="' + t.id + '"', t.description, rp(t.amount) + ' · ' + UI.dt(t.date))).join(''));
    box.innerHTML = parts.length ? parts.join('') : '<p class="muted">Tidak ada hasil untuk “' + esc(q) + '”.</p>';
  };
  Act['search-go'] = d => { UI.closeAllDialogs(); App.go(d.to); };
  Act['search-tx'] = d => { UI.closeAllDialogs(); setTimeout(() => H.openTx(d.id), 30); };

  /* ---------- Pasang PWA ---------- */
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); App.installEvent = e; if (App.state) renderChrome(); });
  window.addEventListener('appinstalled', () => { App.installEvent = null; if (App.state) renderChrome(); UI.toast('KasProyek terpasang', 'success'); });
  Act['install-app'] = async () => {
    if (App.installEvent) { App.installEvent.prompt(); try { await App.installEvent.userChoice; } catch (e) { /* abaikan */ } App.installEvent = null; renderChrome(); return; }
    UI.makeDialog({ title: 'Pasang di layar utama', cls: 'dlg-small', html: '<p>Di iPhone atau iPad: buka menu <b>Bagikan</b> di Safari, lalu pilih <b>Tambahkan ke Layar Utama</b>.</p><p class="muted mt">Setelah terpasang, KasProyek terbuka seperti aplikasi biasa dan tetap bisa dipakai tanpa internet.</p>', footer: '<button class="btn btn-primary" data-act="dlg-close">Mengerti</button>' });
  };

  /* ---------- Status jaringan ---------- */
  function netUpdate() {
    const n = document.getElementById('net'), t = document.getElementById('netText');
    const on = navigator.onLine; n.classList.toggle('off', !on); t.textContent = on ? 'Online' : 'Offline — data tetap tersimpan';
    n.title = on ? 'Terhubung ke internet' : 'Tidak ada internet. Semua fitur tetap berjalan.';
  }
  window.addEventListener('online', () => { netUpdate(); UI.toast('Kembali online'); });
  window.addEventListener('offline', () => { netUpdate(); UI.toast('Anda offline. Semua fitur tetap berjalan, data tersimpan di perangkat.'); });

  /* ---------- Mulai ---------- */
  async function init() {
    await DB.init();
    let st;
    try { st = await DB.loadState(); } catch (e) { console.error(e); }
    if (st) {
      try { App.state = Core.validateState(st); }
      catch (e) { try { localStorage.setItem('kasproyek.corrupt', JSON.stringify(st)); } catch (x) { /* abaikan */ } App.state = Core.emptyState(); setTimeout(() => UI.toast('Data lama tidak terbaca dan disimpan terpisah.', 'error'), 500); }
    } else App.state = Core.emptyState();
    if (!App.state.settings.last) App.state.settings.last = {};
    if (App.state.settings.company === 'Studio Kreatif') App.state.settings.company = 'Numind'; // nama bawaan versi awal
    const qs = new URLSearchParams(location.search);
    if (qs.get('demo') === '1' && !App.state.projects.length) { Core.seedDemo(App.state); App.save(); }
    if (['producer', 'finance', 'director'].includes(qs.get('role'))) App.state.settings.role = qs.get('role');
    DB.onRemoteChange(async () => { const s2 = await DB.loadState(); if (s2) { try { App.state = Core.validateState(s2); App.render(); } catch (e) { /* abaikan */ } } });
    netUpdate(); onRoute();
    DB.gcPhotos(App.state);
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').then(reg => {
        reg.addEventListener('updatefound', () => { const nw = reg.installing; if (nw) nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) UI.toast('Versi baru KasProyek tersedia.', '', { act: 'reload-app', label: 'Muat ulang' }); }); });
      }).catch(e => console.warn('Service worker gagal didaftarkan:', e));
    }
  }
  init().catch(e => { console.error(e); document.getElementById('view').innerHTML = '<div class="card"><div class="empty"><h3>KasProyek gagal dimulai</h3><p>' + esc(e && e.message || e) + '</p></div></div>'; });
})();
