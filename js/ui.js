/* ==========================================================================
   ui.js — Helper tampilan: format, ikon, pill, dialog, toast, popover.
   ========================================================================== */
(function (root) {
  'use strict';
  const { TX, CL, FUND } = Core;

  /* ----- Format ----- */
  const esc = s => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
  const rp = n => (n < 0 ? '−' : '') + 'Rp ' + nf.format(Math.abs(Math.round(n || 0)));
  const num = n => nf.format(Math.round(n || 0));
  function rpShort(n) {
    const a = Math.abs(n || 0), s = n < 0 ? '−' : '';
    const f = (v, u) => s + 'Rp ' + (Math.round(v * 10) / 10).toLocaleString('id-ID') + ' ' + u;
    if (a >= 1e9) return f(a / 1e9, 'M');
    if (a >= 1e6) return f(a / 1e6, 'jt');
    if (a >= 1e4) return f(a / 1e3, 'rb');
    return s + 'Rp ' + nf.format(a);
  }
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const MONL = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const DAYL = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  function dt(s) { if (!s) return '–'; const [y, m, d] = s.slice(0, 10).split('-').map(Number); return d + ' ' + MON[m - 1] + ' ' + y; }
  function dtLong(s) { const [y, m, d] = s.split('-').map(Number); const w = new Date(y, m - 1, d).getDay(); return DAYL[w] + ', ' + d + ' ' + MONL[m - 1] + ' ' + y; }
  function monthLabel(ym) { const [y, m] = ym.split('-').map(Number); return MONL[m - 1] + ' ' + y; }
  function monthShort(ym) { const [, m] = ym.split('-').map(Number); return MON[m - 1]; }
  function dtime(iso) {
    if (!iso) return '–'; const d = new Date(iso); if (isNaN(d)) return '–';
    return d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear() + ', ' + String(d.getHours()).padStart(2, '0') + '.' + String(d.getMinutes()).padStart(2, '0');
  }
  function dateOfISO(iso) { const d = new Date(iso); return isNaN(d) ? '' : Core.fmtDate(d); }
  function pct(v) { return Math.round((v || 0) * 100) + '%'; }
  function plural(n, one) { return n + ' ' + one; }
  function initials(name) { const p = String(name || '?').trim().split(/\s+/); return (p[0][0] + (p[1] ? p[1][0] : '')).toUpperCase(); }
  function parseAmount(s) { const d = String(s || '').replace(/[^\d]/g, ''); return d ? parseInt(d, 10) : 0; }

  /* ----- Ikon ----- */
  const IC = {
    home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
    up: '<line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>',
    down: '<line x1="17" y1="7" x2="7" y2="17"/><polyline points="17 17 7 17 7 7"/>',
    camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
    wallet: '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    checkc: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    chart: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
    clip: '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
    chevd: '<polyline points="6 9 12 15 18 9"/>',
    chevr: '<polyline points="9 18 15 12 9 6"/>',
    chevl: '<polyline points="15 18 9 12 15 6"/>',
    menu: '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
    edit: '<path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
    printer: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
    undo: '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    cal: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    brief: '<rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    coins: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
    archive: '<polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>',
    refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>'
  };
  const icon = (n, cls) => '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[n] || '') + '</svg>';

  /* ----- Status ----- */
  const STATUS_CLASS = {
    'Draft': 'gray', 'Tercatat': 'blue', 'Siap Reimburse': 'violet', 'Menunggu Approval': 'amber',
    'Revisi': 'orange', 'Disetujui': 'green', 'Dibayar': 'teal', 'Ditolak': 'red', 'Dibatalkan': 'gray',
    'Berjalan': 'blue', 'Selesai': 'teal'
  };
  const STATUS_ICON = { 'Draft': 'edit', 'Tercatat': 'check', 'Siap Reimburse': 'flag', 'Menunggu Approval': 'clock', 'Revisi': 'undo', 'Disetujui': 'checkc', 'Dibayar': 'coins', 'Ditolak': 'x', 'Dibatalkan': 'x' };
  function pill(status, label) {
    return '<span class="pill ' + (STATUS_CLASS[status] || 'gray') + '">' + (STATUS_ICON[status] ? icon(STATUS_ICON[status]) : '') + esc(label || status) + '</span>';
  }
  const fundTag = f => '<span class="tag ' + (f === FUND.PERSONAL ? 'tag-personal' : 'tag-company') + '">' + (f === FUND.PERSONAL ? 'Dana pribadi' : 'Petty cash') + '</span>';
  function claimStatusLabel(c) { return c.status === CL.PAID && c.fund === FUND.COMPANY ? 'Selesai' : c.status; }
  function claimPill(c) { return pill(c.status, claimStatusLabel(c)); }
  function txStatusLabel(state, t) {
    if (t.type === 'income') return 'Tercatat';
    if (t.status === TX.PAID && t.fund === FUND.COMPANY) return 'Selesai';
    return t.status;
  }

  /* ----- Dialog ----- */
  const dialogs = [];
  function makeDialog(opts) {
    const el = document.createElement('dialog');
    el.className = 'dlg' + (opts.wide ? ' wide' : '') + (opts.cls ? ' ' + opts.cls : '');
    el.innerHTML = '<div class="dlg-head"><h2>' + esc(opts.title || '') + '</h2><button class="icon-btn" data-act="dlg-close" aria-label="Tutup">' + icon('x') + '</button></div><div class="dlg-body">' + (opts.html || '') + '</div>' + (opts.footer ? '<div class="dlg-foot">' + opts.footer + '</div>' : '');
    document.body.appendChild(el);
    let closed = false, finished = false;
    // Peristiwa "close" pada <dialog> berjalan asinkron, jadi daftar dialog dibersihkan
    // langsung saat close() dipanggil. Kalau tidak, closeAllDialogs() berputar selamanya.
    const finish = () => {
      if (finished) return; finished = true;
      const i = dialogs.indexOf(api); if (i >= 0) dialogs.splice(i, 1);
      el.remove();
      if (opts.onClose) opts.onClose(api.result);
    };
    const api = {
      el, body: el.querySelector('.dlg-body'), foot: el.querySelector('.dlg-foot'), head: el.querySelector('.dlg-head h2'),
      close(result) {
        if (closed) return; closed = true; api.result = result;
        const i = dialogs.indexOf(api); if (i >= 0) dialogs.splice(i, 1);
        try { el.close(); } catch (e) { /* abaikan */ }
        finish();
      },
      result: undefined
    };
    // Tombol Esc menutup <dialog> secara native tanpa lewat api.close().
    el.addEventListener('close', () => { closed = true; finish(); });
    el.addEventListener('click', e => { if (e.target === el && !opts.sticky) api.close(); });
    dialogs.push(api);
    el.showModal();
    if (opts.onMount) opts.onMount(api);
    return api;
  }
  function closeTopDialog() { const d = dialogs[dialogs.length - 1]; if (d) d.close(); }
  function closeAllDialogs() { while (dialogs.length) dialogs[dialogs.length - 1].close(); }
  function dialogOf(el) { const d = el && el.closest && el.closest('dialog'); return d ? dialogs.find(x => x.el === d) : null; }

  function confirmBox(o) {
    return new Promise(resolve => {
      let answered = false;
      const d = makeDialog({
        title: o.title || 'Konfirmasi', cls: 'dlg-small',
        html: '<div class="confirm-msg">' + (o.html || esc(o.message || '')) + '</div>',
        footer: '<button class="btn" data-act="dlg-close">' + esc(o.cancelText || 'Batal') + '</button><button class="btn ' + (o.danger ? 'btn-danger' : 'btn-primary') + '" data-act="dlg-ok">' + esc(o.okText || 'Ya, lanjutkan') + '</button>',
        onClose: r => { if (!answered) { answered = true; resolve(r === 'ok'); } }
      });
      d.el.querySelector('[data-act="dlg-ok"]').addEventListener('click', () => { d.close('ok'); });
      const ok = d.el.querySelector('[data-act="dlg-ok"]'); if (ok) ok.focus();
    });
  }
  function promptBox(o) {
    return new Promise(resolve => {
      let answered = false;
      const d = makeDialog({
        title: o.title || 'Catatan', cls: 'dlg-small',
        html: (o.message ? '<p class="muted mb">' + esc(o.message) + '</p>' : '') +
          '<form data-form="noop" novalidate><label class="field"><span>' + esc(o.label || 'Catatan') + '</span>' +
          (o.multiline === false ? '<input name="v" type="text" autocomplete="off" value="' + esc(o.value || '') + '" placeholder="' + esc(o.placeholder || '') + '">' : '<textarea name="v" rows="3" placeholder="' + esc(o.placeholder || '') + '">' + esc(o.value || '') + '</textarea>') +
          '</span></label><div class="form-error" role="alert" hidden></div></form>',
        footer: '<button class="btn" data-act="dlg-close">Batal</button><button class="btn ' + (o.danger ? 'btn-danger' : 'btn-primary') + '" data-act="dlg-ok">' + esc(o.okText || 'Simpan') + '</button>',
        onClose: r => { if (!answered) { answered = true; resolve(null); } }
      });
      const field = d.el.querySelector('[name=v]'); setTimeout(() => field.focus(), 30);
      const submit = () => {
        const v = field.value.trim();
        if (o.required !== false && v.length < (o.min || 3)) {
          const er = d.el.querySelector('.form-error'); er.hidden = false; er.textContent = o.error || 'Tulis catatan minimal ' + (o.min || 3) + ' karakter.'; field.focus(); return;
        }
        answered = true; d.close('ok'); resolve(v);
      };
      d.el.querySelector('[data-act="dlg-ok"]').addEventListener('click', submit);
      d.el.querySelector('form').addEventListener('submit', e => { e.preventDefault(); submit(); });
    });
  }

  /* ----- Toast (ditaruh di dialog teratas agar tidak tertutup backdrop) ----- */
  function toast(msg, kind, action) {
    const top = dialogs[dialogs.length - 1];
    const parent = top ? top.el : document.body;
    let host = parent.querySelector(':scope > .toasts');
    if (!host) { host = document.createElement('div'); host.className = 'toasts'; host.setAttribute('role', 'status'); host.setAttribute('aria-live', 'polite'); parent.appendChild(host); }
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.innerHTML = '<span>' + esc(msg) + '</span>' + (action ? '<button class="toast-act" data-act="' + esc(action.act) + '"' + (action.id ? ' data-id="' + esc(action.id) + '"' : '') + '>' + esc(action.label) + '</button>' : '');
    host.appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    const life = action ? 9000 : (kind === 'error' ? 6500 : 3400);
    setTimeout(() => { el.classList.remove('in'); setTimeout(() => { el.remove(); if (host && !host.children.length && host.parentNode !== document.body) host.remove(); }, 250); }, life);
  }

  /* ----- Popover ----- */
  let popEl = null, popAnchor = null;
  function closePop() { if (popEl) { popEl.remove(); popEl = null; popAnchor = null; } }
  function openPop(anchor, html, cls) {
    if (popEl && popAnchor === anchor) { closePop(); return null; }
    closePop();
    popEl = document.createElement('div'); popEl.className = 'pop ' + (cls || ''); popEl.innerHTML = html; popAnchor = anchor;
    document.body.appendChild(popEl);
    const r = anchor.getBoundingClientRect();
    const w = popEl.offsetWidth;
    let left = Math.min(Math.max(8, r.right - w), window.innerWidth - w - 8);
    popEl.style.top = (r.bottom + 8) + 'px'; popEl.style.left = left + 'px';
    return popEl;
  }
  document.addEventListener('click', e => { if (popEl && !popEl.contains(e.target) && !(popAnchor && popAnchor.contains(e.target))) closePop(); }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePop(); });

  /* ----- Input nominal (pemisah ribuan) ----- */
  function bindMoney(root_) {
    (root_ || document).querySelectorAll('input[data-money]').forEach(inp => {
      if (inp._money) return; inp._money = true;
      const fmt = () => { const v = parseAmount(inp.value); inp.value = v ? nf.format(v) : ''; };
      inp.addEventListener('input', fmt); if (inp.value) fmt();
    });
  }

  /* ----- Download ----- */
  function download(filename, content, mime) {
    const parts = mime && mime.indexOf('csv') >= 0 ? ['﻿', content] : [content];
    const blob = new Blob(parts, { type: mime || 'application/octet-stream' });
    const u = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = u; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 4000);
  }

  /* ----- Receipt demo (SVG) ----- */
  function demoReceiptURL(tx, company) {
    const e = esc, amt = rp(tx.amount);
    const lines = [e((tx.vendor || 'Toko').slice(0, 26)), '', e(tx.description.slice(0, 30)), '', 'Subtotal ' + amt, 'PPN 0%', 'TOTAL ' + amt, '', 'Tunai / Transfer', 'Terima kasih'];
    let y = 120, body = '';
    lines.forEach((l, i) => { body += '<text x="40" y="' + y + '" font-size="' + (i === 0 ? 22 : 16) + '" font-weight="' + (i === 0 || l.indexOf('TOTAL') === 0 ? 700 : 400) + '">' + l + '</text>'; y += i === 0 ? 34 : 26; });
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="480" viewBox="0 0 360 480" font-family="Arial,sans-serif" fill="#2b2f38"><rect width="360" height="480" fill="#e9edf2"/><path d="M20 10h320v452l-12-10-12 10-12-10-12 10-12-10-12 10-12-10-12 10-12-10-12 10-12-10-12 10-12-10-12 10-12-10-12 10-12-10-12 10-12-10-12 10-12-10-12 10-12-10-12 10-12-10-12 10-12-10-12 10-12-10L20 462z" fill="#fff"/><text x="40" y="52" font-size="12" fill="#8a93a3">Contoh nota (data demo)</text><line x1="40" y1="66" x2="320" y2="66" stroke="#c9d0da" stroke-dasharray="4 4"/><text x="40" y="92" font-size="13" fill="#8a93a3">' + dt(tx.date) + (tx.notaNo ? ' · No. ' + e(tx.notaNo) : '') + '</text>' + body + '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  /* ----- Hidrasi foto: <img data-photo="id" data-tx="txId"> ----- */
  async function hydratePhotos(scope, state) {
    const imgs = (scope || document).querySelectorAll('img[data-photo]:not([data-ready])');
    for (const img of imgs) {
      const id = img.dataset.photo; img.dataset.ready = '1';
      try {
        if (id.startsWith('demo-')) {
          const tx = state && state.transactions.find(t => t.photoId === id);
          img.src = tx ? demoReceiptURL(tx) : '';
        } else {
          const u = await DB.photoURL(id);
          if (u) img.src = u; else img.replaceWith(Object.assign(document.createElement('span'), { className: 'thumb-missing', textContent: 'Foto hilang' }));
        }
      } catch (e) { /* abaikan */ }
    }
  }
  const isPdfId = id => String(id || '').startsWith('pdf_');

  root.V = {}; root.Act = {}; root.Forms = {}; root.Change = {}; root.Inp = {};
  root.UI = {
    esc, rp, num, rpShort, dt, dtLong, monthLabel, monthShort, dtime, dateOfISO, pct, plural, initials, parseAmount, MONL, MON,
    icon, pill, fundTag, claimPill, claimStatusLabel, txStatusLabel, STATUS_CLASS,
    makeDialog, closeTopDialog, closeAllDialogs, dialogOf, confirmBox, promptBox, toast, openPop, closePop,
    bindMoney, download, demoReceiptURL, hydratePhotos, isPdfId
  };
})(typeof self !== 'undefined' ? self : this);
