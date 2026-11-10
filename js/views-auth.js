/* ==========================================================================
   views-auth.js — Layar Masuk/Daftar, sesi, halaman Pengguna, dialog Akun saya.
   Logika akun ada di auth.js. Berkas ini mengurus penyimpanan, sesi, dan tampilan.
   ========================================================================== */
(function () {
  'use strict';
  const { esc, icon } = UI;
  const SKEY = 'kasproyek.session';
  const ROLE_LABEL = Core.ROLES;
  const ROLE_TONE = { producer: 'blue', finance: 'violet', director: 'green' };
  const ROLE_INFO = { producer: 'Mencatat pengeluaran dan mengajukan reimbursement', finance: 'Memeriksa nota, menyetujui, dan mencatat pembayaran', director: 'Menyetujui pengajuan dan melihat seluruh laporan' };
  let auth = Auth.emptyAuth();
  let notice = '';
  let inflight = 0;          // > 0 saat ada proses yang sedang mengubah data akun; pemuatan ulang ditahan dulu
  let lastSig = '';

  const AuthUI = window.AuthUI = {
    async load() { auth = Auth.validateAuth(await DB.getKV('auth')); return auth; },
    save: () => DB.setKV('auth', auth),
    data: () => auth
  };
  const sig = u => (u ? [u.id, u.sv, u.role, u.admin, u.name, u.mustChange].join('|') : '');

  /* ---------- Sesi (di perangkat ini) ---------- */
  let memSession = null;     // cadangan bila storage browser diblokir (mode privat tertentu): sesi bertahan selama halaman terbuka
  function readSession() {
    try { const raw = localStorage.getItem(SKEY) || sessionStorage.getItem(SKEY); return raw ? JSON.parse(raw) : null; } catch (e) { return memSession; }
  }
  function clearSession() { memSession = null; try { localStorage.removeItem(SKEY); sessionStorage.removeItem(SKEY); } catch (e) { /* abaikan */ } }
  function writeSession(s) {
    clearSession();
    try { (s.remember ? localStorage : sessionStorage).setItem(SKEY, JSON.stringify(s)); } catch (e) { memSession = s; }
  }
  const current = () => Auth.resolveSession(auth, readSession());
  AuthUI.current = current;

  /** Tentukan apa yang tampil: layar masuk, ganti sandi wajib, atau aplikasi. */
  AuthUI.gate = () => {
    const u = current();
    lastSig = sig(u);
    if (!u) { App.leave(); renderAuth(auth.users.length ? (screen.mode === 'register' && auth.allowSignup ? 'register' : 'login') : 'first'); return; }
    if (u.mustChange) { App.leave(); renderAuth('change'); return; }
    screen.mode = 'login';                          // setelah keluar nanti, mulai dari tab Masuk
    const pub = Auth.publicUser(u);
    if (App.user && App.user.id === u.id) {
      const changed = App.user.role !== pub.role || App.user.admin !== pub.admin || App.user.name !== pub.name;
      App.user = pub; hideAuth(); if (changed) App.render();
      return;
    }
    hideAuth(); App.enter(pub);
  };
  AuthUI.logout = msg => { clearSession(); notice = msg || 'Anda sudah keluar.'; AuthUI.gate(); };

  /** Periksa ulang saat tab kembali aktif atau tab lain mengubah sesi/akun: peran berubah, akun dinonaktifkan, keluar dari tab lain. */
  AuthUI.recheck = async () => {
    if (inflight) return;
    try { await AuthUI.load(); } catch (e) { return; }
    if (!inflight && sig(current()) !== lastSig) AuthUI.gate();
  };
  window.addEventListener('storage', e => { if (e.key === SKEY || e.key === null) AuthUI.recheck(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') AuthUI.recheck(); });
  window.addEventListener('focus', () => AuthUI.recheck());
  setInterval(() => { if (!inflight && sig(current()) !== lastSig) AuthUI.gate(); }, 30000);   // sesi tanpa "tetap masuk" berakhir setelah 12 jam

  /* ---------- Layar masuk / daftar ---------- */
  let screen = { mode: 'login' };
  const root = () => document.getElementById('auth');
  function hideAuth() { document.body.dataset.auth = 'in'; const r = root(); if (r) { r.hidden = true; r.innerHTML = ''; } }

  const pwField = (name, label, o) => '<label class="field"><span>' + label + (o.hint ? '<em>' + o.hint + '</em>' : '') + '</span><div class="pw"><input name="' + name + '" type="' + (o.visible ? 'text' : 'password') + '" autocomplete="' + o.ac + '" required' + (o.visible ? ' autocapitalize="none" spellcheck="false"' : '') + (o.input ? ' data-input="' + o.input + '"' : '') + '>' +
    (o.gen ? '<button type="button" class="pw-btn" data-act="pw-generate" aria-label="Buat kata sandi acak" title="Buat kata sandi acak">' + icon('refresh') + '</button>'
      : '<button type="button" class="pw-btn" data-act="pw-toggle" aria-label="Tampilkan kata sandi" aria-pressed="false" title="Tampilkan kata sandi">' + icon('eye') + '</button>') +
    '</div>' + (o.meter ? '<div class="pw-hint" aria-live="polite"></div>' : '') + '</label>';
  const textField = (name, label, o) => '<label class="field"><span>' + label + '</span><input name="' + name + '" type="' + (o.type || 'text') + '" autocomplete="' + (o.ac || 'off') + '" required' + (o.type === 'email' ? ' inputmode="email" autocapitalize="none" spellcheck="false"' : '') + (o.max ? ' maxlength="' + o.max + '"' : '') + (o.value ? ' value="' + esc(o.value) + '"' : '') + '></label>';
  const roleSeg = (name, checked) => '<div class="seg" role="radiogroup" aria-label="Peran">' + Auth.ROLES.map(r => '<label><input type="radio" name="' + name + '" value="' + r + '"' + (checked === r ? ' checked' : '') + '>' + ROLE_LABEL[r] + '</label>').join('') + '</div>';
  const remember = '<label class="check"><input type="checkbox" name="remember" checked><span>Tetap masuk di perangkat ini <small class="muted">selama ' + Auth.SESSION_REMEMBER_DAYS + ' hari</small></span></label>';
  const errBox = '<div class="form-error" role="alert" hidden></div>';

  function renderAuth(mode) {
    screen.mode = mode;
    const hasData = !!(window.App && App.state && (App.state.projects.length || App.state.transactions.length));
    let tabs = '', body = '';
    if (mode === 'login' || mode === 'register') {
      tabs = auth.allowSignup
        ? '<div class="seg auth-tabs" role="tablist"><button type="button" role="tab" class="' + (mode === 'login' ? 'on' : '') + '" aria-selected="' + (mode === 'login') + '" data-act="auth-tab" data-mode="login">Masuk</button><button type="button" role="tab" class="' + (mode === 'register' ? 'on' : '') + '" aria-selected="' + (mode === 'register') + '" data-act="auth-tab" data-mode="register">Daftar</button></div>' : '';
    }
    if (mode === 'login') {
      body = '<h1>Masuk</h1><p class="auth-sub">Gunakan akun Anda untuk membuka KasProyek.</p>' +
        (notice ? '<div class="auth-note" role="status">' + esc(notice) + '</div>' : '') +
        '<form data-form="auth-login" novalidate>' +
        textField('email', 'Email', { type: 'email', ac: 'username' }) + pwField('password', 'Kata sandi', { ac: 'current-password' }) + remember + errBox +
        '<button class="btn btn-primary btn-lg btn-block" type="submit">Masuk</button></form>' +
        '<p class="auth-links"><button type="button" class="link-btn" data-act="auth-forgot">Lupa kata sandi?</button></p>' +
        (auth.allowSignup ? '' : '<p class="auth-links muted small">Pendaftaran mandiri sedang ditutup. Minta administrator membuatkan akun.</p>');
    } else if (mode === 'register') {
      body = '<h1>Daftar</h1><p class="auth-sub">Akun baru dimulai sebagai Team. Administrator dapat mengubah peran Anda.</p>' +
        '<form data-form="auth-register" novalidate>' + textField('name', 'Nama lengkap', { ac: 'name', max: 60 }) + textField('email', 'Email', { type: 'email', ac: 'username' }) +
        pwField('password', 'Kata sandi', { ac: 'new-password', hint: 'minimal 8 karakter', input: 'pw-hint', meter: true }) + pwField('password2', 'Ulangi kata sandi', { ac: 'new-password' }) + remember + errBox +
        '<button class="btn btn-primary btn-lg btn-block" type="submit">Daftar dan masuk</button></form>';
    } else if (mode === 'first') {
      body = '<h1>Buat akun pertama</h1><p class="auth-sub">Akun ini menjadi administrator. Anda yang mengatur akun orang lain nanti.</p>' +
        (hasData ? '<div class="auth-note" role="status">Data yang sudah ada di perangkat ini tetap utuh dan terbuka setelah Anda masuk.</div>' : '') +
        '<form data-form="auth-register" novalidate>' + textField('name', 'Nama lengkap', { ac: 'name', max: 60 }) + textField('email', 'Email', { type: 'email', ac: 'username' }) +
        '<div class="field"><span>Peran Anda <em>bisa diubah nanti</em></span>' + roleSeg('role', 'director') + '</div>' +
        pwField('password', 'Kata sandi', { ac: 'new-password', hint: 'minimal 8 karakter', input: 'pw-hint', meter: true }) + pwField('password2', 'Ulangi kata sandi', { ac: 'new-password' }) + remember + errBox +
        '<button class="btn btn-primary btn-lg btn-block" type="submit">Buat akun dan masuk</button></form>';
    } else if (mode === 'change') {
      const u = current();
      body = '<h1>Buat kata sandi baru</h1><p class="auth-sub">' + (u ? esc(u.name) + ', administrator' : 'Administrator') + ' mengatur kata sandi Anda. Pilih yang hanya Anda yang tahu.</p>' +
        '<form data-form="auth-change" novalidate>' + pwField('newPassword', 'Kata sandi baru', { ac: 'new-password', hint: 'minimal 8 karakter', input: 'pw-hint', meter: true }) + pwField('password2', 'Ulangi kata sandi baru', { ac: 'new-password' }) + errBox +
        '<button class="btn btn-primary btn-lg btn-block" type="submit">Simpan dan lanjut</button></form>' +
        '<p class="auth-links"><button type="button" class="link-btn" data-act="logout">Keluar</button></p>';
    }
    notice = '';
    const r = root();
    r.hidden = false; document.body.dataset.auth = 'out';
    r.innerHTML = '<div class="auth-wrap"><aside class="auth-side"><img class="auth-logo" src="img/numind-gold.png" alt="Numind" width="150" height="22">' +
      '<div class="auth-pitch"><h2>Satu nota, satu penggantian.</h2>' +
      '<ul><li>' + icon('camera') + '<span>Foto nota sekarang, lengkapi datanya nanti.</span></li><li>' + icon('shield') + '<span>Setiap transaksi hanya bisa masuk satu pengajuan.</span></li><li>' + icon('wallet') + '<span>Tetap bisa dipakai tanpa internet.</span></li></ul></div></aside>' +
      '<main class="auth-main"><div class="auth-card">' + tabs + body + '</div></main></div>';
    document.title = (mode === 'login' ? 'Masuk' : mode === 'change' ? 'Kata sandi baru' : 'Daftar') + ' — KasProyek';
    const first = r.querySelector('input:not([type=radio]):not([type=checkbox])');
    if (first && !matchMedia('(pointer: coarse)').matches) first.focus();
  }

  Act['auth-tab'] = d => renderAuth(d.mode);
  Act['pw-toggle'] = (d, el) => {
    const inp = el.parentElement.querySelector('input'), show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    el.setAttribute('aria-pressed', String(show)); el.title = el.ariaLabel = show ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi';
    el.innerHTML = icon(show ? 'eyeoff' : 'eye');
  };
  Act['pw-generate'] = (d, el) => {
    const inp = el.parentElement.querySelector('input'); inp.value = genPw(); inp.type = 'text'; inp.focus(); inp.select();
  };
  function genPw() {
    const al = 'abcdefghjkmnpqrstuvwxyz23456789', a = crypto.getRandomValues(new Uint8Array(12)); let s = '';
    for (let i = 0; i < 12; i++) { s += al[a[i] % al.length]; if (i % 4 === 3 && i < 11) s += '-'; }
    return s;
  }
  Inp['pw-hint'] = el => {
    const box = el.closest('.field').querySelector('.pw-hint'); if (!box) return;
    const v = el.value; if (!v) { box.textContent = ''; box.className = 'pw-hint'; return; }
    const issue = Auth.passwordIssue(v);
    if (issue) { box.textContent = issue; box.className = 'pw-hint bad'; }
    else if (v.length >= 12 && /[a-z]/i.test(v) && /\d|\W/.test(v)) { box.textContent = 'Kata sandi kuat.'; box.className = 'pw-hint good'; }
    else { box.textContent = 'Cukup. Lebih panjang lebih aman.'; box.className = 'pw-hint mid'; }
  };

  function busy(form, on, label) {
    if (!form) return;
    const btns = [...form.querySelectorAll('[type=submit]'), ...(form.id ? document.querySelectorAll('[type=submit][form="' + form.id + '"]') : [])];
    for (const b of btns) { if (on) { b.dataset.t = b.textContent; b.textContent = label; b.disabled = true; } else { b.textContent = b.dataset.t || b.textContent; b.disabled = false; } }
  }
  const same = (a, b) => { if (a !== b) throw new Auth.AuthError('Pengulangan kata sandi tidak sama.', 'password2', { field: 'password2' }); };
  /** Simpan data akun. Bila gagal, muat ulang dari penyimpanan supaya memori tidak berbeda dengan yang tersimpan. */
  async function commit() { try { await AuthUI.save(); } catch (e) { await AuthUI.load().catch(() => {}); throw e; } }
  /** Jalankan satu proses ubah-data-akun dengan tombol terkunci dan pemuatan ulang ditahan. fn() mengubah `auth`. */
  async function run(form, label, fn) {
    inflight++; busy(form, true, label);
    try { await AuthUI.load(); return await fn(); }       // selalu mulai dari data terbaru (tab lain mungkin sudah mengubahnya)
    finally { busy(form, false); inflight--; }
  }

  Forms['auth-login'] = async form => {
    const f = new FormData(form); H.formError(form, '');
    const u = await run(form, 'Memeriksa…', async () => {
      let user, e0;
      try { user = await Auth.login(auth, f.get('email'), f.get('password'), {}); } catch (e) { e0 = e; }
      try { await AuthUI.save(); } catch (e) { console.warn('Gagal menyimpan hitungan masuk', e); }   // percobaan gagal ikut tersimpan
      if (e0) throw e0;
      return user;
    }).catch(e => { if (form.elements.password) form.elements.password.value = ''; throw e; });
    writeSession(Auth.makeSession(u, { remember: !!f.get('remember') }));
    AuthUI.gate();
  };
  Forms['auth-register'] = async form => {
    const f = new FormData(form); H.formError(form, '');
    const u = await run(form, 'Membuat akun…', async () => {
      same(f.get('password'), f.get('password2'));
      const user = await Auth.register(auth, { name: f.get('name'), email: f.get('email'), password: f.get('password'), password2: f.get('password2'), role: f.get('role') }, {});
      user.lastLoginAt = Date.now();
      await commit();
      return user;
    });
    writeSession(Auth.makeSession(u, { remember: !!f.get('remember') }));
    AuthUI.gate();
    UI.toast('Selamat datang, ' + u.name.split(' ')[0] + '.', 'success');
  };
  Forms['auth-change'] = async form => {
    const sess = readSession(), f = new FormData(form); H.formError(form, '');
    if (!current()) return AuthUI.gate();
    const uid = sess.uid;
    const user = await run(form, 'Menyimpan…', async () => {
      same(f.get('newPassword'), f.get('password2'));
      await Auth.changePassword(auth, uid, null, f.get('newPassword'), { skipOld: true });
      await commit();
      return Auth.findById(auth, uid);
    });
    writeSession(Auth.makeSession(user, { remember: !!sess.remember }));
    AuthUI.gate();
    UI.toast('Kata sandi baru tersimpan.', 'success');
  };

  Act.logout = () => AuthUI.logout();
  Act['auth-forgot'] = () => {
    UI.makeDialog({
      title: 'Lupa kata sandi', cls: 'dlg-small',
      html: '<p>Kata sandi disimpan sebagai hash dan tidak bisa dilihat siapa pun, termasuk administrator. Cara mengaturnya ulang:</p>' +
        '<ol class="plain-steps"><li>Minta administrator membuka <b>Pengguna</b>, memilih nama Anda, lalu <b>Atur ulang kata sandi</b>.</li><li>Masuk dengan kata sandi sementara itu. Anda langsung diminta membuat kata sandi baru.</li></ol>' +
        '<details class="forgot-last"><summary>Administrator lupa dan tidak ada administrator lain</summary><p>Satu-satunya jalan adalah menghapus semua data di perangkat ini, termasuk akun. Setelah itu aplikasi kosong dan Anda membuat akun pertama lagi. Data bisa dipulihkan dari berkas cadangan JSON (Export Data) bila Anda punya.</p><button class="btn btn-danger btn-sm" data-act="auth-wipe">' + icon('trash') + 'Hapus semua data di perangkat ini</button></details>',
      footer: '<button class="btn btn-primary" data-act="dlg-close">Mengerti</button>'
    });
  };
  Act['auth-wipe'] = async () => {
    const t = await UI.promptBox({ title: 'Ketik HAPUS untuk menghapus semuanya', message: 'Akun, project, transaksi, dan foto nota di perangkat ini dihapus permanen.', label: 'Konfirmasi', multiline: false, danger: true, okText: 'Hapus semua', min: 5, error: 'Ketik HAPUS untuk melanjutkan.' });
    if (!t) return;
    if (t.trim().toUpperCase() !== 'HAPUS') return UI.toast('Konfirmasi tidak sesuai. Tidak ada yang dihapus.', 'error');
    clearSession(); await DB.clearAll(); location.reload();
  };

  /* ---------- Akun saya ---------- */
  const fmtWhen = ms => ms ? new Date(ms).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Belum pernah';
  const rolePill = u => '<span class="pill ' + ROLE_TONE[u.role] + '">' + ROLE_LABEL[u.role] + '</span>' + (u.admin ? ' <span class="pill gray">Administrator</span>' : '');

  Act['account-open'] = () => {
    UI.closePop();
    const u = App.user; if (!u) return;
    UI.makeDialog({
      title: 'Akun saya',
      html: '<div class="acct-head"><span class="avatar big">' + esc(UI.initials(u.name)) + '</span><div><b>' + esc(u.name) + '</b><div class="muted">' + esc(u.email) + '</div><div class="mt-s">' + rolePill(u) + '</div></div></div>' +
        '<form id="acct-name" data-form="account-name" novalidate class="acct-form"><label class="field"><span>Nama lengkap</span><input name="name" type="text" maxlength="60" autocomplete="name" value="' + esc(u.name) + '" required></label>' + errBox + '<div class="row"><button class="btn btn-sm" type="submit">Simpan nama</button></div></form>' +
        '<hr class="sep"><form id="acct-pw" data-form="account-password" novalidate class="acct-form"><h3 class="strong">Ganti kata sandi</h3>' +
        pwField('oldPassword', 'Kata sandi sekarang', { ac: 'current-password' }) + pwField('newPassword', 'Kata sandi baru', { ac: 'new-password', hint: 'minimal 8 karakter', input: 'pw-hint', meter: true }) + pwField('password2', 'Ulangi kata sandi baru', { ac: 'new-password' }) + errBox +
        '<div class="row"><button class="btn btn-sm" type="submit">Ganti kata sandi</button></div></form>' +
        '<p class="small muted mt">Peran diubah oleh administrator. Perubahan peran berlaku saat Anda masuk lagi.</p>',
      footer: '<button class="btn" data-act="dlg-close">Tutup</button>'
    });
  };
  /** Ubah data akun lewat satu pintu: muat data terbaru, jalankan fn, simpan, lalu segarkan tampilan.
   *  Bila yang diubah akun sendiri, sesi diterbitkan ulang supaya tidak terlempar keluar. */
  async function mutate(fn, targetId, form) {
    const r = await run(form, 'Menyimpan…', async () => {
      const out = await fn();
      await commit();
      if (targetId && App.user && targetId === App.user.id) {
        const cur = Auth.findById(auth, targetId), s = readSession() || {};
        if (cur) writeSession(Auth.makeSession(cur, { remember: s.remember }));
      }
      return out;
    });
    AuthUI.gate(); if (App.user) App.render();
    return r;
  }
  const me = () => App.user;

  Forms['account-name'] = async form => {
    const f = new FormData(form); H.formError(form, '');
    await mutate(() => Auth.updateProfile(auth, me().id, { name: f.get('name') }), me().id, form);
    const h = form.closest('dialog').querySelector('.acct-head b'); if (h) h.textContent = me().name;
    UI.toast('Nama disimpan', 'success');
  };
  Forms['account-password'] = async form => {
    const f = new FormData(form); H.formError(form, '');
    same(f.get('newPassword'), f.get('password2'));
    await mutate(() => Auth.changePassword(auth, me().id, f.get('oldPassword'), f.get('newPassword'), {}), me().id, form);
    form.reset(); form.querySelectorAll('.pw-hint').forEach(h => { h.textContent = ''; h.className = 'pw-hint'; });
    UI.toast('Kata sandi diganti', 'success');
  };

  /* ---------- Halaman Pengguna (administrator) ---------- */

  window.V.users = function () {
    const m = me();
    if (!m || !m.admin) return H.pageHead('Pengguna', '') + '<div class="card">' + H.empty('lock', 'Halaman ini hanya untuk administrator', 'Minta administrator mengubah peran atau akses Anda.', '<a class="btn btn-primary" href="#/dashboard">Ke Dashboard</a>') + '</div>';
    const us = auth.users.slice().sort((a, b) => (b.admin - a.admin) || a.name.localeCompare(b.name, 'id'));
    const rows = us.map(u => '<tr><td class="c-main">' + esc(u.name) + (u.id === m.id ? ' <span class="pill gray">Anda</span>' : '') + '<span class="sub">' + esc(u.email) + '</span></td>' +
      '<td data-label="Peran">' + rolePill(u) + '</td>' +
      '<td data-label="Terakhir masuk" class="nowrap">' + fmtWhen(u.lastLoginAt) + '</td>' +
      '<td data-label="Status">' + (u.disabled ? '<span class="pill gray">Nonaktif</span>' : u.mustChange ? '<span class="pill amber">Belum ganti kata sandi</span>' : '<span class="pill green">Aktif</span>') + '</td>' +
      '<td class="c-act"><button class="btn btn-sm" data-act="user-manage" data-id="' + u.id + '">Kelola</button></td></tr>').join('');
    return H.pageHead('Pengguna', us.length + ' akun · ' + Auth.activeAdmins(auth).length + ' administrator',
      '<button class="btn btn-primary" data-act="user-add">' + icon('plus') + 'Tambah pengguna</button>') +
      H.banner('info', 'info', 'Akun tersimpan di perangkat ini. Perangkat lain tidak berbagi akun maupun data, dan perubahan peran berlaku saat pengguna itu masuk lagi.') +
      '<div class="card mb" style="margin:16px 0"><label class="check"><input type="checkbox" data-change="signup-toggle"' + (auth.allowSignup ? ' checked' : '') + '><span><b>Izinkan orang mendaftar sendiri</b> <small class="muted">Matikan setelah semua anggota tim punya akun. Administrator tetap bisa menambah akun.</small></span></label></div>' +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Pengguna</th><th>Peran</th><th>Terakhir masuk</th><th>Status</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  };
  Change['signup-toggle'] = async el => {
    const allow = el.checked;
    try { await mutate(() => Auth.setAllowSignup(auth, me().id, allow)); }
    catch (e) { el.checked = !allow; throw e; }
    UI.toast(allow ? 'Pendaftaran mandiri dibuka' : 'Pendaftaran mandiri ditutup');
  };

  const adminCheck = (checked, tight) => '<label class="check' + (tight ? '' : ' mt') + '"><input type="checkbox" name="admin"' + (checked ? ' checked' : '') + '><span><b>Administrator</b> <small class="muted">Bisa mengelola pengguna dan pengaturan</small></span></label>';
  Act['user-add'] = () => {
    UI.makeDialog({
      title: 'Tambah pengguna', cls: 'dlg-small',
      html: '<form id="user-add-form" data-form="user-add" novalidate autocomplete="off"><div class="stack">' + textField('name', 'Nama lengkap', { max: 60 }) + textField('email', 'Email', { type: 'email' }) +
        '<div class="field"><span>Peran</span>' + roleSeg('role', 'producer') + '</div>' + adminCheck(false, true) +
        pwField('password', 'Kata sandi sementara', { ac: 'off', visible: true, gen: true, hint: 'diganti saat masuk pertama' }) + errBox + '</div></form>',
      footer: '<button class="btn" data-act="dlg-close">Batal</button><button class="btn btn-primary" type="submit" form="user-add-form">Tambah pengguna</button>'
    });
  };
  Forms['user-add'] = async form => {
    const f = new FormData(form); H.formError(form, '');
    const u = await mutate(() => Auth.register(auth, { name: f.get('name'), email: f.get('email'), password: f.get('password'), role: f.get('role'), admin: !!f.get('admin') }, { by: me().id }), null, form);
    UI.closeAllDialogs();
    UI.toast('Akun ' + u.name.split(' ')[0] + ' dibuat. Sampaikan kata sandi sementaranya; ia diminta menggantinya saat masuk pertama.', 'success');
  };

  Act['user-manage'] = d => {
    const u = Auth.findById(auth, d.id); if (!u) return;
    const self = u.id === me().id;
    UI.makeDialog({
      title: 'Kelola ' + u.name, cls: 'dlg-small',
      html: '<div class="muted small" style="margin-bottom:14px">' + esc(u.email) + ' · ' + (u.lastLoginAt ? 'terakhir masuk ' + fmtWhen(u.lastLoginAt) : 'belum pernah masuk') + '</div>' +
        '<form id="user-role-form" data-form="user-role" data-id="' + u.id + '" novalidate><div class="field"><span>Peran</span>' + roleSeg('role', u.role) + '</div><p class="small muted" style="margin-top:6px" id="role-info">' + esc(ROLE_INFO[u.role]) + '</p>' + adminCheck(u.admin) + errBox + '</form>' +
        '<hr class="sep"><div class="stack-s"><button class="btn btn-block" data-act="user-reset" data-id="' + u.id + '">' + icon('key') + 'Atur ulang kata sandi</button>' +
        (self ? '' : '<button class="btn btn-block" data-act="user-toggle" data-id="' + u.id + '">' + (u.disabled ? 'Aktifkan kembali akun' : 'Nonaktifkan akun') + '</button><button class="btn btn-block btn-danger" data-act="user-remove" data-id="' + u.id + '">' + icon('trash') + 'Hapus akun</button>') + '</div>',
      footer: '<button class="btn" data-act="dlg-close">Batal</button><button class="btn btn-primary" type="submit" form="user-role-form">Simpan perubahan</button>'
    });
  };
  Forms['user-role'] = async form => {
    const f = new FormData(form), id = form.dataset.id; H.formError(form, '');
    const changed = await mutate(() => {
      const t = Auth.findById(auth, id); if (!t) throw new Auth.AuthError('Akun tidak ditemukan.', 'not_found');
      const before = t.role + '|' + t.admin;
      Auth.setRole(auth, me().id, id, { role: f.get('role'), admin: !!f.get('admin') });
      return before !== t.role + '|' + t.admin;
    }, id, form);
    UI.closeAllDialogs();
    UI.toast(!changed ? 'Tidak ada perubahan' : 'Peran disimpan. ' + (id === me().id ? 'Berlaku sekarang.' : 'Berlaku saat pengguna itu masuk lagi.'), changed ? 'success' : '');
  };
  Act['user-reset'] = d => {
    const u = Auth.findById(auth, d.id); if (!u) return;
    UI.makeDialog({
      title: 'Atur ulang kata sandi', cls: 'dlg-small',
      html: '<p style="margin-bottom:14px">Buat kata sandi sementara untuk <b>' + esc(u.name) + '</b>. Ia diminta menggantinya saat masuk berikutnya, dan sesinya yang lama berakhir.</p>' +
        '<form id="user-reset-form" data-form="user-reset" data-id="' + u.id + '" novalidate autocomplete="off">' + pwField('password', 'Kata sandi sementara', { ac: 'off', visible: true, gen: true }) + errBox + '</form>',
      footer: '<button class="btn" data-act="dlg-close">Batal</button><button class="btn btn-primary" type="submit" form="user-reset-form">Atur ulang</button>'
    });
  };
  Forms['user-reset'] = async form => {
    const f = new FormData(form), id = form.dataset.id; H.formError(form, '');
    await mutate(() => Auth.resetPassword(auth, me().id, id, f.get('password'), {}), id, form);
    UI.closeAllDialogs();
    UI.toast('Kata sandi sementara tersimpan. Sampaikan ke pengguna.', 'success');
  };
  Act['user-toggle'] = async d => {
    const u = Auth.findById(auth, d.id); if (!u) return;
    const disable = !u.disabled;
    if (disable && !(await UI.confirmBox({ title: 'Nonaktifkan ' + u.name + '?', html: '<p>Ia tidak bisa masuk sampai Anda mengaktifkannya lagi. Catatan yang pernah dibuatnya tetap ada.</p>', okText: 'Nonaktifkan', danger: true }))) return;
    await mutate(() => Auth.setDisabled(auth, me().id, d.id, disable));
    UI.closeAllDialogs();
    UI.toast(disable ? 'Akun dinonaktifkan' : 'Akun diaktifkan kembali', 'success');
  };
  Act['user-remove'] = async d => {
    const u = Auth.findById(auth, d.id); if (!u) return;
    if (!(await UI.confirmBox({ title: 'Hapus akun ' + u.name + '?', html: '<p>Akun ini dihapus permanen. Catatan yang pernah dibuatnya tetap ada dengan namanya. Untuk menahan akses sementara, pilih <b>Nonaktifkan</b>.</p>', okText: 'Hapus akun', danger: true }))) return;
    await mutate(() => Auth.removeUser(auth, me().id, d.id));
    UI.closeAllDialogs();
    UI.toast('Akun dihapus', 'success');
  };

  /* Penjelasan peran ikut berganti saat dipilih. */
  document.addEventListener('change', e => {
    const r = e.target.closest('#user-role-form input[name=role]'); if (r) { const i = document.getElementById('role-info'); if (i) i.textContent = ROLE_INFO[r.value] || ''; }
  });
})();
