/* ==========================================================================
   views-dashboard.js — Dashboard, Project Management, detail project.
   ========================================================================== */
(function () {
  'use strict';
  const { esc, rp, rpShort, dt, icon, pill, fundTag } = UI;
  const { TX, CL, FUND } = Core;
  const S = () => App.state;
  const sum = (a, f) => a.reduce((x, y) => x + (f ? f(y) : y), 0);

  /* ---------- Util tampilan ---------- */
  function delta(cur, prev) {
    if (!prev) return cur ? '<span class="d-up">Baru bulan ini</span>' : '<span class="muted">Belum ada data</span>';
    const p = Math.round((cur - prev) / prev * 100);
    if (p === 0) return '<span class="muted">Sama seperti bulan lalu</span>';
    return '<b class="' + (p > 0 ? 'd-up' : 'd-down') + '">' + (p > 0 ? '+ ' : '− ') + Math.abs(p) + '%</b> vs bulan lalu';
  }
  function countDelta(cur, prev) {
    const d = cur - prev;
    if (d === 0) return '<span class="muted">Sama dengan bulan lalu</span>';
    return '<b class="' + (d > 0 ? 'd-up' : 'd-down') + '">' + (d > 0 ? '+ ' : '− ') + Math.abs(d) + '</b> vs bulan lalu';
  }
  function niceStep(x) { const p = Math.pow(10, Math.floor(Math.log10(x))); const n = x / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }
  function axis(v) { if (v >= 1e9) return (v / 1e9) + ' M'; if (v >= 1e6) return (v / 1e6) + ' jt'; if (v >= 1e3) return (v / 1e3) + ' rb'; return String(v); }
  function barChart(series) {
    const W = 640, Hh = 250, pl = 50, pr = 8, pt = 12, pb = 30, iw = W - pl - pr, ih = Hh - pt - pb;
    const max = Math.max(1, ...series.flatMap(s => [s.income, s.expense]));
    const step = niceStep(max / 4), top = step * Math.ceil(max / step);
    const y = v => pt + ih - (v / top) * ih;
    let g = '', bars = '';
    for (let v = 0; v <= top + 1e-6; v += step) g += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#e6ebf2" stroke-width="1"/><text x="' + (pl - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + axis(v) + '</text>';
    const gw = iw / series.length, bw = Math.min(24, gw * 0.3);
    series.forEach((s, i) => {
      const cx = pl + gw * i + gw / 2;
      const bar = (v, x, col, lab) => '<rect x="' + x + '" y="' + y(v) + '" width="' + bw + '" height="' + Math.max(0, ih - (y(v) - pt)) + '" rx="4" fill="' + col + '"><title>' + lab + ' ' + UI.monthLabel(s.key) + ': ' + rp(v) + '</title></rect>';
      bars += bar(s.income, cx - bw - 2, '#386a62', 'Pemasukan') + bar(s.expense, cx + 2, '#f2c230', 'Pengeluaran') + '<text x="' + cx + '" y="' + (Hh - 9) + '" text-anchor="middle">' + UI.monthShort(s.key) + '</text>';
    });
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + Hh + '" role="img" aria-label="Grafik pemasukan dan pengeluaran 6 bulan terakhir">' + g + bars + '</svg>';
  }
  const barCls = p => p >= 1 ? 'over' : p >= 0.8 ? 'warn' : 'good';

  /* ---------- Onboarding ---------- */
  function onboarding() {
    return '<img class="welcome-logo" src="img/numind-green.png" alt="Numind">' + H.pageHead('Selamat datang di KasProyek', 'Catat uang masuk dan keluar tiap project, simpan nota, lalu ajukan reimbursement tanpa risiko tertagih dua kali.') +
      '<div class="card"><div class="empty" style="padding:28px 8px"><div class="ic-wrap">' + icon('brief') + '</div><h3>Mulai dari project pertama</h3><p>Tiga langkah dasar:</p>' +
      '<ol class="steps"><li><span><b>Buat project dan tentukan budget</b>Satu project untuk satu pekerjaan klien.</span></li>' +
      '<li><span><b>Catat pengeluaran harian</b>Nominal, kategori, sumber dana, dan foto nota. Boleh dicicil tiap hari.</span></li>' +
      '<li><span><b>Ajukan setelah project selesai</b>Atau gabungkan beberapa project dalam pengajuan bulanan.</span></li></ol>' +
      '<div class="row mt" style="justify-content:center"><button class="btn btn-primary btn-lg" data-act="project-new">' + icon('plus') + 'Buat project pertama</button>' + (App.isAdmin() ? '<button class="btn btn-lg" data-act="demo-load">Coba dengan data contoh</button>' : '') + '</div>' +
      '<p class="small muted mt">Data tersimpan di perangkat ini dan bisa dipakai tanpa internet.</p></div></div>';
  }
  Act['demo-load'] = async () => {
    if (!App.isAdmin()) return UI.toast('Data contoh hanya bisa dimuat administrator.', 'error');
    if (S().projects.length || S().transactions.length) {
      if (!(await UI.confirmBox({ title: 'Tambahkan data contoh?', message: 'Data contoh akan ditambahkan ke data yang sudah ada. Anda bisa menghapusnya lewat Pengaturan → Hapus semua data.', okText: 'Tambahkan' }))) return;
    }
    App.commit(() => Core.seedDemo(S()), 'Data contoh dimuat. Tambahkan akun Finance di menu Pengguna untuk mencoba alur approval.');
  };

  /* ---------- Dashboard ---------- */
  function todoItems(D, role) {
    const rev = role !== 'producer', out = [];
    const claimsTotal = list => rp(sum(list, c => c.total));
    if (rev && D.waitingClaims.length) out.push({ c: 'o', n: D.waitingClaims.length, t: 'Pengajuan menunggu approval', sub: claimsTotal(D.waitingClaims), href: '#/approval' });
    if (rev && D.approvedClaims.length) out.push({ c: 'g', n: D.approvedClaims.length, t: 'Pengajuan siap dibayar', sub: claimsTotal(D.approvedClaims), href: '#/approval?tab=approved' });
    if (D.revisionClaims.length) out.push({ c: 'o', n: D.revisionClaims.length, t: 'Pengajuan perlu revisi', sub: rev ? 'Menunggu perbaikan Team' : 'Perbaiki lalu ajukan ulang', href: D.revisionClaims.length === 1 ? '#/claim/' + D.revisionClaims[0].id : '#/reimburse?tab=revision' });
    if (!rev && D.waitingClaims.length) out.push({ c: 'v', n: D.waitingClaims.length, t: 'Pengajuan menunggu approval', sub: claimsTotal(D.waitingClaims), href: '#/reimburse?tab=waiting' });
    if (D.drafts.length) out.push({ c: 'w', n: D.drafts.length, t: 'Transaksi Draft tanpa nota', sub: rp(sum(D.drafts, t => t.amount)) + ' belum bisa diajukan', href: '#/receipts' });
    if (D.readyProjects.length) out.push({ c: 'g', n: D.readyProjects.length, t: D.readyProjects.length === 1 ? 'Project siap diajukan' : 'Project siap diajukan', sub: D.readyProjects.map(p => p.name).slice(0, 2).join(', '), href: '#/reimburse' });
    if (D.closable.length) out.push({ c: 'v', n: D.closable.length, t: 'Project lewat tanggal selesai', sub: 'Tutup laporan pengeluaran', href: D.closable.length === 1 ? '#/project/' + D.closable[0].id : '#/projects' });
    if (D.overBudget.length) out.push({ c: 'o', n: D.overBudget.length, t: 'Budget hampir habis', sub: D.overBudget.map(p => p.name).slice(0, 2).join(', '), href: D.overBudget.length === 1 ? '#/project/' + D.overBudget[0].id : '#/projects' });
    return out;
  }

  V.dashboard = () => {
    const s = S();
    if (!s.projects.length && !s.transactions.length) return onboarding();
    const D = Core.dashboard(s), role = App.role(), m = Core.todayStr().slice(0, 7);
    const todo = todoItems(D, role);
    const cats = Core.categoryBreakdown(s, { from: m + '-01' }).slice(0, 5);
    const catsAll = cats.length ? cats : Core.categoryBreakdown(s).slice(0, 5);
    const catLabel = cats.length ? 'bulan ini' : 'semua waktu';
    const cmax = Math.max(1, ...catsAll.map(c => c.total));
    const series = Core.monthlySeries(s, 6);
    const running = s.projects.filter(p => !Core.isClosed(p)).map(p => Core.projectStats(s, p.id)).sort((a, b) => b.usedPct - a.usedPct).slice(0, 5);
    const recent = s.transactions.slice().sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 7);
    const cs = D.claims.cur, cp = D.claims.prev;
    const R = D.receivable;
    const chk = Core.integrityCheck(s);

    return H.pageHead('Dashboard', 'Ringkasan ' + UI.monthLabel(m) + (App.role() !== 'producer' ? '' : ''),
      '<a class="btn btn-primary" href="#/expense">' + icon('plus') + 'Catat pengeluaran</a><a class="btn" href="#/receipts">' + icon('camera') + 'Upload nota</a>') +
      (todo.length ? '<div class="todo mb" style="margin-bottom:20px">' + todo.map(i => '<a class="' + i.c + '" href="' + i.href + '"><span class="n">' + i.n + '</span><span class="t">' + esc(i.t) + '<small>' + esc(i.sub) + '</small></span></a>').join('') + '</div>' : '') +
      '<div class="grid g-kpi">' +
      '<div class="card kpi"><div class="top"><span class="chip green">' + icon('down') + '</span>Pemasukan bulan ini</div><div class="val">' + rp(D.month.income) + '</div><div class="note">' + delta(D.month.income, D.prev.income) + '</div></div>' +
      '<div class="card kpi"><div class="top"><span class="chip amber">' + icon('up') + '</span>Pengeluaran bulan ini</div><div class="val">' + rp(D.month.expense) + '</div><div class="note">' + delta(D.month.expense, D.prev.expense) + '</div></div>' +
      '<div class="card kpi"><div class="top"><span class="chip">' + icon('chart') + '</span>Saldo semua project</div><div class="val ' + (D.balance < 0 ? 'bad' : '') + '">' + rp(D.balance) + '</div><div class="note">Masuk ' + rpShort(D.totalIncome) + ', keluar ' + rpShort(D.totalExpense) + '</div></div>' +
      '<div class="card kpi"><div class="top"><span class="chip violet">' + icon('wallet') + '</span>Piutang reimbursement</div><div class="val">' + rp(R.total) + '</div><div class="note">Belum diajukan ' + rpShort(R.unclaimed) + ' · diproses ' + rpShort(R.waiting + R.revision + R.approved) + '</div></div>' +
      '<div class="card kpi"><div class="top"><span class="chip teal">' + icon('coins') + '</span>Saldo petty cash</div><div class="val ' + (D.petty.balance < 0 ? 'bad' : '') + '">' + rp(D.petty.balance) + '</div><div class="note">Terpakai ' + rpShort(D.petty.out) + ' dari ' + rpShort(D.petty.in) + '</div></div>' +
      '</div>' +

      '<div class="grid g-2 mt">' +
      '<section class="card"><div class="card-head"><div class="card-title">' + icon('users') + 'Status pengajuan</div><span class="small muted">' + UI.monthLabel(m) + '</span></div>' +
      '<div class="statrow">' +
      [['Diajukan', cs.requested, cp.requested], ['Disetujui', cs.approved, cp.approved], ['Ditolak', cs.rejected, cp.rejected], ['Pending', cs.pending, cp.pending]].map(x => '<div class="stat"><div class="l">' + x[0] + '</div><div class="v">' + x[1] + '</div><div class="d">' + countDelta(x[1], x[2]) + '</div></div>').join('') +
      '</div></section>' +
      '<section class="card"><div class="card-head"><div class="card-title">' + icon('users') + 'Jenis pengeluaran</div><span class="small muted">' + catLabel + '</span></div>' +
      (catsAll.length ? '<div class="hbars">' + catsAll.map(c => '<div class="hbar"><span>' + esc(c.category) + '</span><div class="bar"><i style="width:' + Math.max(3, Math.round(c.total / cmax * 100)) + '%"></i></div><span class="n">' + rpShort(c.total) + '</span></div>').join('') + '</div>' : '<p class="muted">Belum ada pengeluaran.</p>') +
      '</section></div>' +

      '<div class="grid g-main mt">' +
      '<section class="card"><div class="card-head"><div class="card-title">' + icon('chart') + 'Pemasukan dan pengeluaran</div><div class="legend"><span><i style="background:#386a62"></i>Pemasukan</span><span><i style="background:#f2c230"></i>Pengeluaran</span></div></div>' + barChart(series) + '</section>' +
      '<section class="card"><div class="card-head"><div class="card-title">' + icon('folder') + 'Budget project berjalan</div><a href="#/projects" class="small">Semua project</a></div>' +
      (running.length ? running.map(r => '<div class="proj-row" data-act="go" data-to="#/project/' + r.project.id + '"><div class="top"><span class="pn">' + esc(r.project.name) + '</span><span class="small strong">' + UI.pct(r.usedPct) + '</span></div><div class="bar ' + barCls(r.usedPct) + '"><i style="width:' + Math.min(100, Math.round(r.usedPct * 100)) + '%"></i></div><div class="meta"><span>' + rpShort(r.spent) + ' dari ' + rpShort(r.budget) + '</span><span>' + (r.remaining >= 0 ? 'Sisa ' + rpShort(r.remaining) : '<b class="bad">Lewat ' + rpShort(-r.remaining) + '</b>') + '</span></div></div>').join('') : '<p class="muted">Tidak ada project yang sedang berjalan.</p>') +
      '</section></div>' +

      '<section class="card flush mt"><div class="card-head"><div class="card-title">' + icon('clock') + 'Transaksi terbaru</div><a class="small" href="#/expense">Lihat semua</a></div>' + H.txTable(recent, { emptyTitle: 'Belum ada transaksi' }) + '</section>' +
      (chk.ok ? '' : '<div class="mt">' + H.banner('error', 'alert', '<b>Pemeriksaan integritas menemukan ' + chk.issues.filter(i => i.level === 'error').length + ' masalah.</b> Buka Pengaturan untuk melihat rinciannya.') + '</div>');
  };

  /* ---------- Daftar project ---------- */
  V.projects = () => {
    const s = S();
    const f = App.ui.projects = App.ui.projects || { q: '', status: '' };
    return H.pageHead('Project Management', 'Setiap project punya budget, pemasukan, dan laporan pengeluarannya sendiri.',
      '<button class="btn btn-primary" data-act="project-new">' + icon('plus') + 'Project baru</button>') +
      '<div class="filters no-print"><label class="search"><span class="sr-only">Cari project</span>' + icon('search') + '<input type="search" placeholder="Cari nama, kode, atau klien" value="' + esc(f.q) + '" data-input="filter" data-view="projects" data-key="q"></label>' +
      '<select class="sel" aria-label="Status project" data-change="filter" data-view="projects" data-key="status"><option value="">Semua status</option><option value="Berjalan"' + (f.status === 'Berjalan' ? ' selected' : '') + '>Berjalan</option><option value="Selesai"' + (f.status === 'Selesai' ? ' selected' : '') + '>Selesai</option></select></div>' +
      '<div id="results">' + V.projects.results() + '</div>';
  };
  V.projects.results = () => {
    const s = S(), f = App.ui.projects || {};
    const q = (f.q || '').toLowerCase();
    const list = s.projects.filter(p => (!f.status || p.status === f.status) && (!q || (p.name + ' ' + p.code + ' ' + p.client).toLowerCase().includes(q)))
      .sort((a, b) => Core.isClosed(a) - Core.isClosed(b) || b.createdAt.localeCompare(a.createdAt));
    if (!s.projects.length) return H.empty('folder', 'Belum ada project', 'Buat project untuk mulai mencatat pemasukan dan pengeluaran.', '<button class="btn btn-primary" data-act="project-new">' + icon('plus') + 'Buat project</button>');
    if (!list.length) return H.empty('search', 'Tidak ada project yang cocok', 'Ubah kata kunci atau filter status.');
    return '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Project</th><th>Status</th><th class="num">Budget</th><th>Terpakai</th><th class="num">Pemasukan</th><th class="num">Saldo</th><th class="num">Transaksi</th></tr></thead><tbody>' +
      list.map(p => {
        const r = Core.projectStats(s, p.id);
        return '<tr class="click" data-act="go" data-to="#/project/' + p.id + '"><td class="c-main"><b>' + esc(p.name) + '</b><span class="sub">' + esc(p.code) + (p.client ? ' · ' + esc(p.client) : '') + '</span></td>' +
          '<td data-label="Status">' + pill(p.status) + '</td><td class="num nowrap" data-label="Budget">' + rp(p.budget) + '</td>' +
          '<td data-label="Terpakai" style="min-width:190px"><div class="row between small" style="margin-bottom:5px"><span>' + rp(r.spent) + '</span><b>' + UI.pct(r.usedPct) + '</b></div><div class="bar ' + barCls(r.usedPct) + '"><i style="width:' + Math.min(100, Math.round(r.usedPct * 100)) + '%"></i></div></td>' +
          '<td class="num nowrap" data-label="Pemasukan">' + rp(r.income) + '</td><td class="num nowrap" data-label="Saldo"><b class="' + (r.balance < 0 ? 'bad' : '') + '">' + rp(r.balance) + '</b></td>' +
          '<td class="num" data-label="Transaksi">' + r.count + (r.drafts ? ' <span class="pill gray" title="Draft">' + r.drafts + ' draft</span>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  };

  /* ---------- Form & aksi project ---------- */
  function projectForm(p) {
    p = p || {};
    return '<form id="project-form" data-form="project-save" ' + (p.id ? 'data-id="' + p.id + '"' : '') + ' novalidate autocomplete="off"><div class="form-grid">' +
      '<label class="field span-2"><span>Nama project</span><input name="name" type="text" maxlength="100" value="' + esc(p.name || '') + '" placeholder="Mis. Video Company Profile" required></label>' +
      '<label class="field"><span>Klien <em>opsional</em></span><input name="client" type="text" maxlength="80" value="' + esc(p.client || '') + '"></label>' +
      '<label class="field"><span>Kode <em>kosongkan untuk otomatis</em></span><input name="code" type="text" maxlength="24" value="' + esc(p.code || '') + '" placeholder="' + esc(p.code || Core.nextProjectCode(S())) + '"></label>' +
      '<label class="field span-2"><span>Budget</span><div class="money"><input name="budget" data-money inputmode="numeric" value="' + (p.budget ? UI.num(p.budget) : '') + '" placeholder="0" required></div></label>' +
      '<label class="field"><span>Mulai <em>opsional</em></span><input name="startDate" type="date" value="' + esc(p.startDate || '') + '"></label>' +
      '<label class="field"><span>Target selesai <em>opsional</em></span><input name="endDate" type="date" value="' + esc(p.endDate || '') + '"></label>' +
      '<label class="field"><span>Penanggung jawab <em>opsional</em></span><input name="pic" type="text" maxlength="60" value="' + esc(p.pic || '') + '"></label>' +
      '<label class="field span-2"><span>Catatan <em>opsional</em></span><textarea name="notes" rows="2" maxlength="300">' + esc(p.notes || '') + '</textarea></label>' +
      '</div><div class="form-error" role="alert" hidden></div></form>';
  }
  function openProjectDialog(p) {
    const d = UI.makeDialog({
      title: p ? 'Ubah project' : 'Project baru', html: projectForm(p),
      footer: (p && !S().transactions.some(t => t.projectId === p.id) ? '<button class="btn btn-danger" data-act="project-delete" data-id="' + p.id + '">' + icon('trash') + 'Hapus</button><span class="sp"></span>' : '') + '<button class="btn" data-act="dlg-close">Batal</button><button class="btn btn-primary" type="submit" form="project-form">' + (p ? 'Simpan' : 'Buat project') + '</button>'
    });
    UI.bindMoney(d.el); setTimeout(() => d.el.querySelector('[name=name]').focus(), 40);
  }
  Act['project-new'] = () => openProjectDialog(null);
  Act['project-edit'] = d => openProjectDialog(S().projects.find(p => p.id === d.id));
  Forms['project-save'] = form => {
    const f = new FormData(form); const id = form.dataset.id;
    const data = { name: f.get('name'), client: f.get('client'), code: f.get('code'), budget: UI.parseAmount(f.get('budget')), startDate: f.get('startDate'), endDate: f.get('endDate'), pic: f.get('pic'), notes: f.get('notes') };
    let p;
    try { p = id ? Core.updateProject(S(), id, data) : Core.createProject(S(), data); } catch (e) { return H.fail(form, e); }
    App.save(); UI.closeAllDialogs();
    if (!id) { App.go('#/project/' + p.id); UI.toast('Project dibuat. Sekarang catat pengeluarannya.', 'success'); } else { App.render(); UI.toast('Project diperbarui', 'success'); }
  };
  Act['project-delete'] = async d => {
    if (!(await UI.confirmBox({ title: 'Hapus project?', message: 'Project ini belum punya transaksi dan akan dihapus.', okText: 'Hapus', danger: true }))) return;
    if (App.commit(() => Core.deleteProject(S(), d.id), 'Project dihapus')) { UI.closeAllDialogs(); App.go('#/projects'); }
  };
  Act['project-close'] = async d => {
    const p = H.proj(d.id), chk = Core.projectCloseCheck(S(), d.id);
    if (chk.drafts.length) {
      UI.makeDialog({
        title: 'Belum bisa menutup laporan',
        html: '<p class="mb">Masih ada <b>' + chk.drafts.length + ' transaksi Draft</b> (nota belum lengkap). Lengkapi notanya, beri alasan tanpa nota, atau hapus transaksinya dulu.</p><ul>' + chk.drafts.slice(0, 8).map(t => '<li>' + esc(t.description) + ' — ' + rp(t.amount) + '</li>').join('') + '</ul>',
        footer: '<button class="btn" data-act="dlg-close">Nanti</button><a class="btn btn-primary" href="#/receipts" data-act="dlg-close-go">Lengkapi nota</a>'
      });
      return;
    }
    if (!(await UI.confirmBox({ title: 'Tutup laporan pengeluaran?', html: '<p><b>' + esc(p.name) + '</b>: ' + chk.count + ' transaksi (' + rp(chk.total) + ') akan berstatus <b>Siap Reimburse</b>.</p><p class="muted mt">Pengeluaran susulan tetap bisa dicatat. Laporan bisa dibuka kembali selama belum diajukan.</p>', okText: 'Tutup laporan' }))) return;
    if (App.commit(() => Core.closeProject(S(), d.id, App.actor()))) UI.toast('Laporan ditutup. Siap diajukan.', 'success', { act: 'wizard-open-project', id: d.id, label: 'Ajukan sekarang' });
  };
  Act['project-reopen'] = async d => {
    if (!(await UI.confirmBox({ title: 'Buka kembali project?', message: 'Transaksi berstatus Siap Reimburse akan kembali menjadi Tercatat.', okText: 'Buka kembali' }))) return;
    App.commit(() => Core.reopenProject(S(), d.id, App.actor()), 'Project dibuka kembali');
  };
  Act['proj-tab'] = d => { App.ui.projTab = d.tab; App.render(); };

  /* ---------- Detail project ---------- */
  V.project = id => {
    const s = S(), p = s.projects.find(x => x.id === id);
    if (!p) return H.pageHead('Project tidak ditemukan', '', '<a class="btn" href="#/projects">Kembali ke daftar</a>');
    const r = Core.projectStats(s, id), chk = Core.projectCloseCheck(s, id), closed = Core.isClosed(p);
    const ep = Core.eligibleForClaim(s, { mode: 'project', fund: FUND.PERSONAL, projectIds: [id] }), ec = Core.eligibleForClaim(s, { mode: 'project', fund: FUND.COMPANY, projectIds: [id] });
    const tab = App.ui.projTab || 'exp';
    const txs = s.transactions.filter(t => t.projectId === id).sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt).localeCompare(String(a.createdAt)));
    const claims = s.claims.filter(c => c.projectIds.includes(id) && c.status !== CL.CANCELLED).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
    let banner = '';
    if (chk.drafts.length) banner = H.banner('warn', 'alert', '<b>' + chk.drafts.length + ' transaksi Draft.</b> Lengkapi nota agar laporan bisa ditutup dan diajukan.') + '<div class="mb"></div>';
    else if (closed && (ep.items.length || ec.items.length)) banner = '<div class="banner ok">' + icon('checkc') + '<div class="sp"><b>Project ditutup dan siap diajukan.</b> ' + (ep.items.length ? ep.items.length + ' transaksi dana pribadi (' + rp(ep.total) + ')' : '') + (ep.items.length && ec.items.length ? ', ' : '') + (ec.items.length ? ec.items.length + ' transaksi petty cash (' + rp(ec.total) + ')' : '') + '.</div><button class="btn btn-primary btn-sm" data-act="wizard-open" data-mode="project" data-project="' + id + '" data-fund="' + (ep.items.length ? 'pribadi' : 'perusahaan') + '">Ajukan sekarang</button></div><div class="mb"></div>';
    else if (closed) banner = H.banner('ok', 'checkc', 'Semua transaksi project ini sudah masuk pengajuan.') + '<div class="mb"></div>';
    else if (chk.count > 0) banner = H.banner('info', 'info', '<b>Pekerjaan sudah selesai?</b> Tutup laporan pengeluaran untuk menyiapkan pengajuan reimbursement.') + '<div class="mb"></div>';

    const actions = '<a class="btn btn-primary" href="#/expense?project=' + id + '">' + icon('plus') + 'Catat pengeluaran</a><button class="btn" data-act="project-edit" data-id="' + id + '">' + icon('edit') + 'Ubah</button>' +
      (closed ? '<button class="btn" data-act="project-reopen" data-id="' + id + '">' + icon('undo') + 'Buka kembali</button>' : '<button class="btn btn-dark" data-act="project-close" data-id="' + id + '">' + icon('lock') + 'Tutup laporan</button>');

    const content = tab === 'exp' ? H.txTable(txs.filter(t => t.type === 'expense'), { noProject: true, emptyTitle: 'Belum ada pengeluaran', emptyText: 'Catat pengeluaran pertama untuk project ini.', emptyAction: '<a class="btn btn-primary" href="#/expense?project=' + id + '">' + icon('plus') + 'Catat pengeluaran</a>' })
      : tab === 'inc' ? H.txTable(txs.filter(t => t.type === 'income'), { noProject: true, emptyTitle: 'Belum ada pemasukan', emptyText: 'Catat DP atau pembayaran dari klien.', emptyAction: '<a class="btn btn-primary" href="#/income">' + icon('plus') + 'Catat pemasukan</a>' })
        : H.claimTable(claims, { emptyTitle: 'Belum ada pengajuan', emptyText: 'Pengajuan muncul setelah transaksi project diajukan.' });

    return H.pageHead(p.name, esc(p.code) + (p.client ? ' · ' + esc(p.client) : '') + (p.startDate ? ' · ' + dt(p.startDate) + (p.endDate ? ' – ' + dt(p.endDate) : '') : ''), actions, '<a href="#/projects">Project Management</a>' + icon('chevr') + '<span>' + esc(p.name) + '</span>') +
      '<div class="row mb">' + pill(p.status) + (p.pic ? '<span class="small muted">PJ: ' + esc(p.pic) + '</span>' : '') + '</div>' + banner +
      '<div class="grid g-kpi">' +
      '<div class="card kpi"><div class="top"><span class="chip">' + icon('brief') + '</span>Budget</div><div class="val">' + rp(p.budget) + '</div><div class="note">' + (r.remaining >= 0 ? 'Sisa ' + rp(r.remaining) : '<b class="bad">Melebihi ' + rp(-r.remaining) + '</b>') + '</div></div>' +
      '<div class="card kpi"><div class="top"><span class="chip amber">' + icon('up') + '</span>Terpakai</div><div class="val">' + rp(r.spent) + '</div><div class="bar ' + barCls(r.usedPct) + '"><i style="width:' + Math.min(100, Math.round(r.usedPct * 100)) + '%"></i></div><div class="note">' + UI.pct(r.usedPct) + ' dari budget</div></div>' +
      '<div class="card kpi"><div class="top"><span class="chip violet">' + icon('wallet') + '</span>Dana pribadi</div><div class="val">' + rp(r.spentPersonal) + '</div><div class="note">Belum dibayar ' + rp(r.receivable) + '</div></div>' +
      '<div class="card kpi"><div class="top"><span class="chip teal">' + icon('coins') + '</span>Petty cash</div><div class="val">' + rp(r.spentCompany) + '</div><div class="note">Dana operasional perusahaan</div></div>' +
      '<div class="card kpi"><div class="top"><span class="chip green">' + icon('down') + '</span>Pemasukan</div><div class="val">' + rp(r.income) + '</div><div class="note">Saldo project <b class="' + (r.balance < 0 ? 'bad' : '') + '">' + rp(r.balance) + '</b></div></div></div>' +
      (p.notes ? '<p class="muted mt">' + esc(p.notes) + '</p>' : '') +
      '<section class="card flush mt"><div class="tabs" style="padding:6px 14px 0;margin:0">' +
      [['exp', 'Pengeluaran', txs.filter(t => t.type === 'expense').length], ['inc', 'Pemasukan', txs.filter(t => t.type === 'income').length], ['clm', 'Pengajuan', claims.length]].map(x => '<button class="' + (tab === x[0] ? 'on' : '') + '" data-act="proj-tab" data-tab="' + x[0] + '">' + x[1] + '<span class="badge-n" style="background:#e8ecf2;color:#4d576b">' + x[2] + '</span></button>').join('') + '</div>' + content + '</section>';
  };
})();
