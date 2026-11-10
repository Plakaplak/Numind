/* ==========================================================================
   views-report.js — Financial Report, Export Data, Pengaturan.
   ========================================================================== */
(function () {
  'use strict';
  const { esc, rp, rpShort, dt, icon, pill, fundTag } = UI;
  const { TX, CL, FUND } = Core;
  const S = () => App.state;
  const sum = (a, f) => a.reduce((x, y) => x + (f ? f(y) : y), 0);

  /* ======================= Financial Report ======================= */
  const RANGES = [['all', 'Semua waktu'], ['thismonth', 'Bulan ini'], ['lastmonth', 'Bulan lalu'], ['3m', '3 bulan terakhir'], ['year', 'Tahun ini'], ['custom', 'Pilih tanggal']];
  function rangeOf(f) {
    const T = Core.todayStr(), m = T.slice(0, 7);
    switch (f.range) {
      case 'thismonth': return { from: m + '-01', to: Core.lastDayOfMonth(m), label: UI.monthLabel(m) };
      case 'lastmonth': { const pm = Core.addMonths(m, -1); return { from: pm + '-01', to: Core.lastDayOfMonth(pm), label: UI.monthLabel(pm) }; }
      case '3m': { const a = Core.addMonths(m, -2) + '-01'; return { from: a, to: T, label: dt(a) + ' – ' + dt(T) }; }
      case 'year': return { from: T.slice(0, 4) + '-01-01', to: T.slice(0, 4) + '-12-31', label: 'Tahun ' + T.slice(0, 4) };
      case 'custom': return { from: f.from || '', to: f.to || '', label: (f.from ? dt(f.from) : 'Awal') + ' – ' + (f.to ? dt(f.to) : 'Sekarang') };
      default: return { from: '', to: '', label: 'Semua waktu' };
    }
  }
  V.report = () => {
    const s = S();
    const f = App.ui.report = App.ui.report || { range: 'all', from: '', to: '', project: '' };
    const rg = rangeOf(f);
    const R = Core.reportData(s, { from: rg.from, to: rg.to, projectId: f.project });
    const pc = Core.pettyCash(s), rec = Core.receivable(s);
    const pcRows = pc.entries.filter(e => (!rg.from || e.date >= rg.from) && (!rg.to || e.date <= rg.to) && (!f.project || e.projectId === f.project || e.kind === 'masuk'));
    const cmax = Math.max(1, ...R.byCategory.map(c => c.total));
    const projName = f.project ? H.projName(f.project) : 'Semua project';

    return H.pageHead('Financial Report', esc(rg.label) + ' · ' + esc(projName),
      '<button class="btn" data-act="export" data-kind="transactions-report">' + icon('download') + 'CSV</button><button class="btn btn-primary" data-act="report-print">' + icon('printer') + 'Cetak / PDF</button>') +
      '<div class="print-only" style="margin-bottom:12px">' + H.letterhead(s.settings.company) + '<div style="margin-top:10px">Laporan keuangan · ' + esc(rg.label) + ' · ' + esc(projName) + '<br><span class="small">Dicetak ' + dt(Core.todayStr()) + '</span></div></div>' +
      '<div class="filters no-print"><select class="sel" aria-label="Periode" data-change="report-filter" data-key="range">' + RANGES.map(r => '<option value="' + r[0] + '"' + (f.range === r[0] ? ' selected' : '') + '>' + r[1] + '</option>').join('') + '</select>' +
      (f.range === 'custom' ? '<input class="sel" type="date" aria-label="Dari tanggal" value="' + esc(f.from) + '" data-change="report-filter" data-key="from" style="padding-right:12px"><span class="muted">sampai</span><input class="sel" type="date" aria-label="Sampai tanggal" value="' + esc(f.to) + '" data-change="report-filter" data-key="to" style="padding-right:12px">' : '') +
      '<select class="sel" aria-label="Project" data-change="report-filter" data-key="project"><option value="">Semua project</option>' + s.projects.map(p => '<option value="' + p.id + '"' + (f.project === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') + '</select></div>' +

      '<div class="grid g-kpi">' +
      '<div class="card kpi"><div class="top"><span class="chip green">' + icon('down') + '</span>Pemasukan</div><div class="val">' + rp(R.totals.income) + '</div><div class="note">Tidak termasuk top-up petty cash</div></div>' +
      '<div class="card kpi"><div class="top"><span class="chip amber">' + icon('up') + '</span>Pengeluaran</div><div class="val">' + rp(R.totals.expense) + '</div><div class="note">Pribadi ' + rpShort(R.totals.personal) + ' · petty cash ' + rpShort(R.totals.company) + '</div></div>' +
      '<div class="card kpi"><div class="top"><span class="chip">' + icon('chart') + '</span>Selisih</div><div class="val ' + (R.totals.net < 0 ? 'bad' : 'ok') + '">' + rp(R.totals.net) + '</div><div class="note">' + (R.totals.rejected ? 'Pengeluaran ditolak ' + rp(R.totals.rejected) + ' tidak dihitung' : 'Pemasukan dikurangi pengeluaran') + '</div></div>' +
      '<div class="card kpi"><div class="top"><span class="chip violet">' + icon('wallet') + '</span>Piutang reimbursement</div><div class="val">' + rp(rec.total) + '</div><div class="note">Posisi saat ini, belum dibayar</div></div></div>' +

      '<section class="card flush mt"><div class="card-head"><div class="card-title">' + icon('folder') + 'Per project</div></div>' +
      (R.byProject.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Project</th><th class="num">Budget</th><th class="num">Pemasukan</th><th class="num">Pengeluaran</th><th>Terhadap budget</th><th class="num">Saldo</th></tr></thead><tbody>' +
        R.byProject.map(r => '<tr><td class="c-main"><a href="#/project/' + r.project.id + '"><b>' + esc(r.project.name) + '</b></a><span class="sub">' + esc(r.project.code) + ' · ' + esc(r.project.status) + '</span></td><td class="num nowrap" data-label="Budget">' + rp(r.project.budget) + '</td><td class="num nowrap" data-label="Pemasukan">' + rp(r.income) + '</td><td class="num nowrap" data-label="Pengeluaran">' + rp(r.expense) + '<span class="sub">pribadi ' + rpShort(r.personal) + ' · petty ' + rpShort(r.company) + '</span></td><td data-label="Terhadap budget" style="min-width:150px"><div class="bar ' + (r.usedPct >= 1 ? 'over' : r.usedPct >= .8 ? 'warn' : 'good') + '"><i style="width:' + Math.min(100, Math.round(r.usedPct * 100)) + '%"></i></div><span class="sub">' + UI.pct(r.usedPct) + '</span></td><td class="num nowrap" data-label="Saldo"><b class="' + (r.balance < 0 ? 'bad' : '') + '">' + rp(r.balance) + '</b></td></tr>').join('') +
        '</tbody><tfoot><tr><td>Total</td><td></td><td class="num">' + rp(R.totals.income) + '</td><td class="num">' + rp(R.totals.expense) + '</td><td></td><td class="num">' + rp(R.totals.net) + '</td></tr></tfoot></table></div>' : H.empty('chart', 'Belum ada data pada periode ini')) + '</section>' +

      '<div class="grid g-2 mt"><section class="card"><div class="card-head"><div class="card-title">' + icon('chart') + 'Per kategori pengeluaran</div></div>' +
      (R.byCategory.length ? '<div class="hbars">' + R.byCategory.map(c => '<div class="hbar"><span>' + esc(c.category) + '</span><div class="bar"><i style="width:' + Math.max(3, Math.round(c.total / cmax * 100)) + '%"></i></div><span class="n">' + rpShort(c.total) + '</span></div>').join('') + '</div>' : '<p class="muted">Belum ada pengeluaran.</p>') + '</section>' +
      '<section class="card"><div class="card-head"><div class="card-title">' + icon('wallet') + 'Posisi piutang reimbursement</div></div><div class="hbars">' +
      [['Belum diajukan', rec.unclaimed, 'Siap Reimburse'], ['Menunggu approval', rec.waiting, 'Menunggu Approval'], ['Perlu revisi', rec.revision, 'Revisi'], ['Disetujui, belum dibayar', rec.approved, 'Disetujui'], ['Sudah dibayar', rec.paid, 'Dibayar'], ['Draft (nota belum lengkap)', rec.draft, 'Draft']].map(x => '<div class="row between" style="padding:2px 0">' + pill(x[2], x[0]) + '<b>' + rp(x[1]) + '</b></div>').join('') +
      '</div><p class="small muted mt">Hanya dana pribadi Team. Pemakaian dana perusahaan dicatat di petty cash.</p></section></div>' +

      '<section class="card flush mt"><div class="card-head"><div class="card-title">' + icon('coins') + 'Buku petty cash</div><span class="small muted">Saldo sekarang <b style="color:var(--ink)">' + rp(pc.balance) + '</b> · masuk ' + rpShort(pc.in) + ' · keluar ' + rpShort(pc.out) + '</span></div>' +
      (pcRows.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Keterangan</th><th>Tanggal</th><th>Project</th><th class="num">Masuk</th><th class="num">Keluar</th><th class="num">Saldo</th></tr></thead><tbody>' +
        pcRows.map(e => '<tr><td class="c-main">' + esc(e.desc) + (e.ref ? '<span class="sub">' + esc(e.ref) + '</span>' : '') + '</td><td data-label="Tanggal" class="nowrap">' + dt(e.date) + '</td><td data-label="Project">' + esc(e.projectId ? H.projName(e.projectId) : '—') + '</td><td class="num nowrap ok" data-label="Masuk">' + (e.kind === 'masuk' ? rp(e.amount) : '') + '</td><td class="num nowrap" data-label="Keluar">' + (e.kind === 'keluar' ? rp(e.amount) : '') + '</td><td class="num nowrap" data-label="Saldo"><b>' + rp(e.balance) + '</b></td></tr>').join('') + '</tbody></table></div>' : H.empty('coins', 'Belum ada pergerakan petty cash', 'Catat top-up di Input Pemasukan, dan pengeluaran dengan sumber dana perusahaan.')) +
      (pc.rejected ? '<p class="small muted" style="padding:12px 22px">Pengeluaran petty cash yang ditolak (' + rp(pc.rejected) + ') tidak dihitung dan perlu dikembalikan ke kas.</p>' : '') + '</section>' +

      '<section class="card flush mt"><div class="card-head"><div class="card-title">' + icon('file') + 'Laporan pertanggungjawaban</div></div>' + H.claimTable(R.claims.slice().sort((a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt))), { emptyTitle: 'Tidak ada pengajuan pada periode ini' }) + '</section>';
  };
  Change['report-filter'] = el => {
    const f = App.ui.report; f[el.dataset.key] = el.value;
    if (el.dataset.key === 'range' && el.value === 'custom' && !f.from) { f.from = Core.todayStr().slice(0, 7) + '-01'; f.to = Core.todayStr(); }
    App.render();
  };
  Act['report-print'] = () => {
    const prev = document.title; document.title = 'Laporan Keuangan — ' + (S().settings.company || 'KasProyek');
    window.addEventListener('afterprint', () => { document.title = prev; }, { once: true });
    window.print();
  };

  /* ======================= Export Data ======================= */
  V.export = () => {
    const s = S();
    const f = App.ui.export = App.ui.export || { from: '', to: '', project: '', photos: true };
    const card = (ic, title, text, body, btn) => '<section class="card"><div class="card-head"><div class="card-title">' + icon(ic) + title + '</div></div><p class="muted mb">' + text + '</p>' + (body || '') + '<div class="mt">' + btn + '</div></section>';
    return H.pageHead('Export Data', 'Unduh data untuk Excel atau Google Sheets, cetak laporan ke PDF, dan simpan cadangan.') +
      '<div class="card mb" style="margin-bottom:20px"><label class="check"><input type="checkbox" data-change="csv-delim"' + (s.settings.csvSemicolon ? ' checked' : '') + '><span><b>Format Excel Indonesia</b> — pemisah titik koma (;). Matikan jika Google Sheets versi bahasa Inggris tidak membaca kolom dengan benar.</span></label></div>' +
      '<div class="grid g-2">' +
      card('file', 'Transaksi (CSV)', 'Semua pemasukan dan pengeluaran beserta status, sumber dana, dan nomor pengajuan.',
        '<div class="form-grid"><label class="field"><span>Dari tanggal</span><input type="date" value="' + esc(f.from) + '" data-change="export-filter" data-key="from"></label><label class="field"><span>Sampai tanggal</span><input type="date" value="' + esc(f.to) + '" data-change="export-filter" data-key="to"></label><label class="field span-2"><span>Project</span><select data-change="export-filter" data-key="project"><option value="">Semua project</option>' + s.projects.map(p => '<option value="' + p.id + '"' + (f.project === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') + '</select></label></div>',
        '<button class="btn btn-primary" data-act="export" data-kind="transactions">' + icon('download') + 'Unduh transaksi</button>') +
      card('folder', 'Project (CSV)', 'Ringkasan budget, pengeluaran, pemasukan, dan piutang tiap project.', '', '<button class="btn btn-primary" data-act="export" data-kind="projects">' + icon('download') + 'Unduh project</button>') +
      card('wallet', 'Pengajuan (CSV)', 'Daftar pengajuan reimbursement dan laporan petty cash beserta status approval dan pembayaran.', '', '<button class="btn btn-primary" data-act="export" data-kind="claims">' + icon('download') + 'Unduh pengajuan</button>') +
      card('coins', 'Buku petty cash (CSV)', 'Pergerakan petty cash dengan saldo berjalan.', '', '<button class="btn btn-primary" data-act="export" data-kind="petty">' + icon('download') + 'Unduh petty cash</button>') +
      card('printer', 'Laporan PDF', 'Buka Financial Report, pilih periode, lalu Cetak / PDF. Detail tiap pengajuan juga bisa dicetak dengan lampiran foto nota.', '', '<a class="btn btn-primary" href="#/report">' + icon('chart') + 'Buka Financial Report</a> <a class="btn" href="#/reimburse">Pilih pengajuan</a>') +
      card('shield', 'Cadangan dan pemulihan', 'Seluruh data tersimpan di perangkat ini. Simpan cadangan berkala, atau pindahkan data ke perangkat lain.',
        '<label class="check" style="margin-bottom:12px"><input type="checkbox" data-change="export-photos"' + (f.photos ? ' checked' : '') + '><span>Sertakan foto nota <small class="muted">(berkas lebih besar)</small></span></label>',
        '<div class="row"><button class="btn btn-primary" data-act="export" data-kind="backup">' + icon('download') + 'Unduh cadangan</button><label class="btn" style="cursor:pointer">' + icon('upload') + 'Pulihkan dari cadangan<input class="sr-only" type="file" accept="application/json,.json" data-change="restore-file"></label></div>') +
      '</div>';
  };
  Change['export-filter'] = el => { App.ui.export[el.dataset.key] = el.value; };
  Change['export-photos'] = el => { App.ui.export.photos = el.checked; };
  Change['csv-delim'] = el => { S().settings.csvSemicolon = el.checked; App.save(); UI.toast(el.checked ? 'Pemisah: titik koma (;)' : 'Pemisah: koma (,)'); };
  Act.export = async d => {
    const s = S(), delim = s.settings.csvSemicolon ? ';' : ',', f = App.ui.export || {}, stamp = Core.todayStr(), csv = 'text/csv;charset=utf-8';
    try {
      if (d.kind === 'transactions') { UI.download('transaksi-' + stamp + '.csv', Core.csvTransactions(s, { from: f.from, to: f.to, projectId: f.project }, delim), csv); }
      else if (d.kind === 'transactions-report') { const r = App.ui.report || {}, rg = rangeOf(r); UI.download('laporan-transaksi-' + stamp + '.csv', Core.csvTransactions(s, { from: rg.from, to: rg.to, projectId: r.project }, delim), csv); }
      else if (d.kind === 'projects') UI.download('project-' + stamp + '.csv', Core.csvProjects(s, delim), csv);
      else if (d.kind === 'claims') UI.download('pengajuan-' + stamp + '.csv', Core.csvClaims(s, delim), csv);
      else if (d.kind === 'petty') UI.download('petty-cash-' + stamp + '.csv', Core.csvPettyCash(s, delim), csv);
      else if (d.kind === 'backup') {
        UI.toast('Menyiapkan cadangan…');
        const obj = Core.exportBackup(s);
        if (f.photos) obj.photos = await DB.exportPhotos(s);
        UI.download('kasproyek-cadangan-' + stamp + '.json', JSON.stringify(obj), 'application/json');
        UI.toast('Cadangan diunduh', 'success');
      }
    } catch (e) { H.fail(null, e); }
  };
  Change['restore-file'] = async el => {
    const file = el.files && el.files[0]; el.value = ''; if (!file) return;
    let obj;
    try { obj = JSON.parse(await file.text()); } catch (e) { return UI.toast('Berkas bukan JSON yang valid.', 'error'); }
    let res; try { res = Core.importBackup(obj); } catch (e) { return H.fail(null, e); }
    const st = res.state;
    if (!(await UI.confirmBox({ title: 'Pulihkan dari cadangan?', html: '<p>Data saat ini akan <b>diganti</b> dengan isi cadangan: ' + st.projects.length + ' project, ' + st.transactions.length + ' transaksi, ' + st.claims.length + ' pengajuan.</p>' + (res.integrity.ok ? '' : '<p class="bad mt">Peringatan: pemeriksaan integritas menemukan masalah pada cadangan ini.</p>') + '<p class="muted mt">Unduh cadangan data saat ini lebih dulu bila perlu.</p>', okText: 'Ganti data', danger: true }))) return;
    try { if (obj.photos) await DB.importPhotos(obj.photos); } catch (e) { UI.toast('Sebagian foto gagal dipulihkan: ' + e.message, 'error'); }
    App.replaceState(st); UI.toast('Data dipulihkan', 'success');
  };

  /* ======================= Pengaturan ======================= */
  Act['settings-open'] = async () => {
    UI.closePop();
    if (!App.isAdmin()) return UI.toast('Pengaturan hanya bisa dibuka administrator.', 'error');
    const s = S(), chk = Core.integrityCheck(s);
    let usage = '';
    try { if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); usage = (e.usage / 1048576).toFixed(1) + ' MB terpakai'; } } catch (e) { /* abaikan */ }
    const errs = chk.issues.filter(i => i.level === 'error'), warns = chk.issues.filter(i => i.level !== 'error');
    const dlg = UI.makeDialog({
      title: 'Pengaturan', wide: true,
      html: '<form id="settings-form" data-form="settings-save" novalidate autocomplete="off"><div class="form-grid">' +
        '<label class="field"><span>Nama perusahaan</span><input name="company" type="text" maxlength="60" value="' + esc(s.settings.company) + '"></label>' +
        '<p class="small muted span-2" style="align-self:end">Nama dan peran tiap orang diatur di menu <a href="#/users" data-act="dlg-close">Pengguna</a>. Team mencatat dan mengajukan, Finance dan Director menyetujui dan mencatat pembayaran.</p></div><div class="form-error" role="alert" hidden></div></form>' +
        '<hr style="border:0;border-top:1px solid var(--line);margin:22px 0">' +
        '<h3 class="strong mb">Kesehatan data</h3>' + (errs.length ? H.banner('error', 'alert', '<b>' + errs.length + ' masalah integritas</b><ul>' + errs.slice(0, 6).map(i => '<li>' + esc(i.msg) + '</li>').join('') + '</ul>') : H.banner('ok', 'shield', '<b>Integritas aman.</b> Tidak ada transaksi yang masuk ke lebih dari satu pengajuan, dan semua total cocok.')) +
        (warns.length ? '<div class="mt">' + H.banner('warn', 'info', '<ul style="margin:0;padding-left:18px">' + warns.slice(0, 5).map(i => '<li>' + esc(i.msg) + '</li>').join('') + '</ul>') + '</div>' : '') +
        '<p class="small muted mt">Penyimpanan: ' + (DB.mode() === 'idb' ? 'IndexedDB (aman untuk foto)' : 'localStorage cadangan (tanpa foto permanen)') + (usage ? ' · ' + usage : '') + '</p>' +
        '<hr style="border:0;border-top:1px solid var(--line);margin:22px 0">' +
        '<div class="row"><button class="btn" data-act="demo-load">Muat data contoh</button><button class="btn btn-danger" data-act="wipe-all">' + icon('trash') + 'Hapus semua data</button></div>',
      footer: '<button class="btn" data-act="dlg-close">Tutup</button><button class="btn btn-primary" type="submit" form="settings-form">Simpan</button>'
    });
    void dlg;
  };
  Forms['settings-save'] = form => {
    const f = new FormData(form), st = S().settings;
    if (!App.isAdmin()) throw new Core.CoreError('Pengaturan hanya bisa diubah administrator.', 'forbidden');
    st.company = (f.get('company') || '').trim() || 'Numind';
    App.save(); UI.closeAllDialogs(); App.render(); UI.toast('Pengaturan disimpan', 'success');
  };
  Act['wipe-all'] = async () => {
    if (!App.isAdmin()) return UI.toast('Hanya administrator yang bisa menghapus data.', 'error');
    if (!(await UI.confirmBox({ title: 'Hapus semua data?', html: '<p>Seluruh project, transaksi, pengajuan, dan foto nota di perangkat ini akan <b>dihapus permanen</b>. Akun pengguna tidak ikut terhapus.</p><p class="muted mt">Unduh cadangan dulu di Export Data bila perlu.</p>', okText: 'Lanjut', danger: true }))) return;
    const t = await UI.promptBox({ title: 'Ketik HAPUS untuk menghapus', label: 'Konfirmasi', multiline: false, danger: true, okText: 'Hapus semua', min: 5, error: 'Ketik HAPUS untuk melanjutkan.' });
    if (!t || t.trim().toUpperCase() !== 'HAPUS') { if (t) UI.toast('Konfirmasi tidak sesuai. Data tidak dihapus.', 'error'); return; }
    await DB.clearData(); UI.closeAllDialogs();
    App.replaceState(Core.emptyState()); UI.toast('Semua data dihapus');
  };
})();
