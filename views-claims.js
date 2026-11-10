/* ==========================================================================
   views-claims.js — Reimbursement, wizard pengajuan, detail pengajuan
   (laporan berbentuk nota), Approval Center.
   ========================================================================== */
(function () {
  'use strict';
  const { esc, rp, rpShort, dt, icon, pill, fundTag } = UI;
  const { TX, CL, FUND } = Core;
  const S = () => App.state;
  const sum = (a, f) => a.reduce((x, y) => x + (f ? f(y) : y), 0);
  const subDesc = (a, b) => String(b.submittedAt).localeCompare(String(a.submittedAt));
  const live = () => S().claims.filter(c => c.status !== CL.CANCELLED);
  const thisMonth = () => Core.todayStr().slice(0, 7);

  /* ======================= Reimbursement ======================= */
  const TABS = [['all', 'Semua', () => true], ['waiting', 'Menunggu approval', c => c.status === CL.WAITING], ['revision', 'Revisi', c => c.status === CL.REVISION], ['approved', 'Disetujui', c => c.status === CL.APPROVED], ['done', 'Selesai', c => c.status === CL.PAID], ['rejected', 'Ditolak', c => c.status === CL.REJECTED]];

  function readyList() {
    const s = S(), out = [];
    for (const p of s.projects.filter(Core.isClosed)) {
      for (const fund of [FUND.PERSONAL, FUND.COMPANY]) {
        const e = Core.eligibleForClaim(s, { mode: 'project', fund, projectIds: [p.id] });
        if (e.items.length) out.push({ kind: 'project', fund, project: p, n: e.items.length, total: e.total, drafts: e.drafts.length });
      }
    }
    const cur = thisMonth();
    for (const ym of [Core.addMonths(cur, -2), Core.addMonths(cur, -1), cur]) {
      for (const fund of [FUND.PERSONAL, FUND.COMPANY]) {
        const e = Core.eligibleForClaim(s, { mode: 'periode', fund, projectIds: [], period: ym });
        if (e.items.length) out.push({ kind: 'periode', fund, period: ym, n: e.items.length, total: e.total, projects: new Set(e.items.map(t => t.projectId)).size, drafts: e.drafts.length });
      }
    }
    return out;
  }

  V.reimburse = () => {
    const s = S(), cs = live();
    const tab = App.query.tab || 'all';
    const ready = readyList();
    const unclaimedP = s.transactions.filter(t => t.type === 'expense' && t.fund === FUND.PERSONAL && !t.claimId && (t.status === TX.RECORDED || t.status === TX.READY));
    const waiting = cs.filter(c => c.status === CL.WAITING), rev = cs.filter(c => c.status === CL.REVISION);
    const appr = cs.filter(c => c.status === CL.APPROVED && c.fund === FUND.PERSONAL);
    const paidM = cs.filter(c => c.status === CL.PAID && c.fund === FUND.PERSONAL && (c.paidAt || '').slice(0, 7) === thisMonth());
    const def = TABS.find(t => t[0] === tab) || TABS[0];
    const list = (def[0] === 'all' ? s.claims : cs.filter(def[2])).slice().sort(subDesc);
    return H.pageHead('Reimbursement', 'Ajukan per project setelah selesai, atau gabungkan beberapa project dalam satu pengajuan bulanan.',
      '<button class="btn btn-primary" data-act="wizard-open">' + icon('plus') + 'Buat pengajuan</button>') +
      '<div class="grid g-kpi">' +
      '<div class="card kpi"><div class="top"><span class="chip violet">' + icon('flag') + '</span>Siap diajukan</div><div class="val">' + rp(sum(unclaimedP, t => t.amount)) + '</div><div class="note">' + unclaimedP.length + ' transaksi dana pribadi</div></div>' +
      '<div class="card kpi"><div class="top"><span class="chip amber">' + icon('clock') + '</span>Menunggu approval</div><div class="val">' + waiting.length + '</div><div class="note">' + rp(sum(waiting, c => c.total)) + '</div></div>' +
      '<div class="card kpi"><div class="top"><span class="chip" style="background:var(--orange-soft);color:var(--orange)">' + icon('undo') + '</span>Perlu revisi</div><div class="val">' + rev.length + '</div><div class="note">' + (rev.length ? 'Perbaiki lalu ajukan ulang' : 'Tidak ada') + '</div></div>' +
      '<div class="card kpi"><div class="top"><span class="chip green">' + icon('checkc') + '</span>Disetujui, belum dibayar</div><div class="val">' + rp(sum(appr, c => c.total)) + '</div><div class="note">' + appr.length + ' pengajuan</div></div>' +
      '<div class="card kpi"><div class="top"><span class="chip teal">' + icon('coins') + '</span>Dibayar bulan ini</div><div class="val">' + rp(sum(paidM, c => c.total)) + '</div><div class="note">' + paidM.length + ' pengajuan</div></div></div>' +

      '<section class="card mt"><div class="card-head"><div class="card-title">' + icon('flag') + 'Siap diajukan sekarang</div></div>' +
      (ready.length ? '<div class="ready-list">' + ready.map(r => '<div class="ready-row"><div class="sp"><b>' + (r.kind === 'project' ? esc(r.project.name) : UI.monthLabel(r.period)) + '</b><span class="sub">' + (r.kind === 'project' ? 'Per project · project sudah ditutup' : 'Per periode · ' + r.projects + ' project') + ' · ' + r.n + ' transaksi · <b>' + rp(r.total) + '</b>' + (r.drafts ? ' · <span class="bad">' + r.drafts + ' Draft belum ikut</span>' : '') + '</span></div>' + fundTag(r.fund) +
        '<button class="btn btn-sm btn-primary" data-act="wizard-open" data-mode="' + r.kind + '" data-fund="' + r.fund + '"' + (r.kind === 'project' ? ' data-project="' + r.project.id + '"' : ' data-period="' + r.period + '"') + '>Ajukan</button></div>').join('') + '</div>'
        : '<p class="muted">Belum ada transaksi yang menunggu diajukan. Pengeluaran yang sudah lengkap notanya akan muncul di sini.</p>') + '</section>' +

      '<section class="card flush mt"><div class="card-head"><div class="card-title">' + icon('wallet') + 'Riwayat pengajuan</div></div>' +
      '<div class="tabs" style="padding:8px 14px 0;margin:10px 0 0">' + TABS.map(t => { const n = t[0] === 'all' ? s.claims.length : cs.filter(t[2]).length; return '<button class="' + (tab === t[0] ? 'on' : '') + '" data-act="go" data-to="#/reimburse' + (t[0] === 'all' ? '' : '?tab=' + t[0]) + '">' + t[1] + '<span class="badge-n" style="background:#e8ecf2;color:#4d576b">' + n + '</span></button>'; }).join('') + '</div>' +
      H.claimTable(list, { emptyTitle: 'Belum ada pengajuan di sini', emptyText: 'Pengajuan yang dibuat akan tampil dengan statusnya.' }) + '</section>';
  };

  /* ======================= Wizard pengajuan ======================= */
  let W = null;
  const wizEl = () => document.getElementById('wiz');
  const hasItems = q => Core.eligibleForClaim(S(), q).items.length;

  Act['wizard-open'] = d => {
    const s = S();
    if (!s.projects.length) { UI.toast('Buat project dan catat pengeluaran dulu.', 'error'); return; }
    const cur = thisMonth(), prev = Core.addMonths(cur, -1);
    W = { mode: d.mode || '', fund: d.fund || FUND.PERSONAL, projectId: d.project || '', period: d.period || '', excluded: [], note: '' };
    if (!W.mode) {
      const closed = s.projects.find(p => Core.isClosed(p) && (hasItems({ mode: 'project', fund: FUND.PERSONAL, projectIds: [p.id] }) || hasItems({ mode: 'project', fund: FUND.COMPANY, projectIds: [p.id] })));
      W.mode = closed ? 'project' : 'periode'; if (closed) W.projectId = closed.id;
    }
    wizDefaults(prev, cur);
    UI.makeDialog({
      title: 'Buat pengajuan', wide: true, html: '<div id="wiz"></div>',
      footer: '<button class="btn" data-act="dlg-close">Batal</button><button class="btn btn-primary" id="wiz-submit" data-act="wizard-submit" disabled>Ajukan</button>'
    });
    wizardRender();
  };
  Act['wizard-open-project'] = d => Act['wizard-open']({ mode: 'project', project: d.id });
  function wizDefaults(prev, cur) {
    prev = prev || Core.addMonths(thisMonth(), -1); cur = cur || thisMonth();
    const s = S();
    if (W.mode === 'project') {
      if (!W.projectId) { const c = s.projects.filter(Core.isClosed); const w = c.find(p => hasItems({ mode: 'project', fund: W.fund, projectIds: [p.id] })) || c[0]; W.projectId = w ? w.id : ''; }
      if (W.projectId && !hasItems({ mode: 'project', fund: W.fund, projectIds: [W.projectId] }) && hasItems({ mode: 'project', fund: W.fund === FUND.PERSONAL ? FUND.COMPANY : FUND.PERSONAL, projectIds: [W.projectId] })) W.fund = W.fund === FUND.PERSONAL ? FUND.COMPANY : FUND.PERSONAL;
    } else if (!W.period) W.period = hasItems({ mode: 'periode', fund: W.fund, projectIds: [], period: prev }) ? prev : cur;
  }
  function wizState() {
    const s = S();
    if (W.mode === 'project') {
      const q = { mode: 'project', fund: W.fund, projectIds: W.projectId ? [W.projectId] : [], period: null };
      const el = W.projectId ? Core.eligibleForClaim(s, q) : { items: [], drafts: [], total: 0 };
      return { q, el, involved: [], blocked: el.drafts.length > 0 };
    }
    const all = Core.eligibleForClaim(s, { mode: 'periode', fund: W.fund, projectIds: [], period: W.period });
    const involved = [...new Set(all.items.concat(all.drafts).map(t => t.projectId))];
    const ids = involved.filter(id => !W.excluded.includes(id));
    const q = { mode: 'periode', fund: W.fund, projectIds: ids, period: W.period };
    const el = ids.length ? Core.eligibleForClaim(s, q) : { items: [], drafts: [], total: 0 };
    return { q, el, involved, blocked: false };
  }
  function wizardRender(focusName) {
    const box = wizEl(); if (!box) return;
    const s = S(), st = wizState(), el = st.el;
    const months = []; for (let i = 0; i < 12; i++) months.push(Core.addMonths(thisMonth(), -i));
    const closedProjects = s.projects.filter(Core.isClosed);
    const personal = W.fund === FUND.PERSONAL;
    let sel = '';
    if (W.mode === 'project') {
      sel = '<label class="field"><span>Project</span><select name="projectId" data-change="wiz">' + (W.projectId ? '' : '<option value="">Pilih project…</option>') +
        s.projects.slice().sort((a, b) => Core.isClosed(b) - Core.isClosed(a) || a.name.localeCompare(b.name)).map(p => '<option value="' + p.id + '"' + (p.id === W.projectId ? ' selected' : '') + (Core.isClosed(p) ? '' : ' disabled') + '>' + esc(p.name) + (Core.isClosed(p) ? '' : ' (belum ditutup)') + '</option>').join('') + '</select></label>' +
        (closedProjects.length ? '' : '<div class="banner warn" style="margin-top:10px">' + icon('alert') + '<div class="sp">Belum ada project yang ditutup. Buka project lalu pilih <b>Tutup laporan</b>, atau pakai pengajuan per periode.</div></div>');
    } else {
      sel = '<label class="field"><span>Periode</span><select name="period" data-change="wiz">' + months.map(ym => { const n = Core.eligibleForClaim(s, { mode: 'periode', fund: W.fund, projectIds: [], period: ym }).items.length; return '<option value="' + ym + '"' + (ym === W.period ? ' selected' : '') + '>' + UI.monthLabel(ym) + (n ? ' — ' + n + ' transaksi' : '') + '</option>'; }).join('') + '</select></label>' +
        (st.involved.length > 1 ? '<fieldset style="border:0;padding:0;margin:12px 0 0"><legend class="field" style="margin-bottom:6px"><span>Project yang ikut</span></legend><div class="wiz-checks">' + st.involved.map(id => '<label class="check"><input type="checkbox" name="prj" value="' + id + '" data-change="wiz"' + (W.excluded.includes(id) ? '' : ' checked') + '><span>' + esc(H.projName(id)) + '</span></label>').join('') + '</div></fieldset>' : '');
    }
    const items = el.items.slice().sort((a, b) => a.date.localeCompare(b.date));
    box.innerHTML =
      '<div class="stack" style="gap:16px">' +
      '<div class="form-grid"><div><div class="field"><span>Jenis pengajuan</span></div><div class="seg"><label><input type="radio" name="mode" value="project" data-change="wiz"' + (W.mode === 'project' ? ' checked' : '') + '>Per project</label><label><input type="radio" name="mode" value="periode" data-change="wiz"' + (W.mode === 'periode' ? ' checked' : '') + '>Per periode</label></div>' +
      '<p class="small muted" style="margin-top:6px">' + (W.mode === 'project' ? 'Seluruh pengeluaran satu project, diajukan setelah project selesai.' : 'Pengeluaran beberapa project digabung menjadi satu pengajuan bulanan.') + '</p></div>' + '<div>' + sel + '</div></div>' +
      '<fieldset style="border:0;padding:0;margin:0"><legend class="field" style="margin-bottom:6px"><span>Sumber dana</span></legend><div class="opts">' +
      '<label class="opt"><input type="radio" name="fund" value="pribadi" data-change="wiz"' + (personal ? ' checked' : '') + '><span><b>Reimbursement</b><small>Dana pribadi Producer. Perusahaan mengganti setelah disetujui.</small></span></label>' +
      '<label class="opt"><input type="radio" name="fund" value="perusahaan" data-change="wiz"' + (!personal ? ' checked' : '') + '><span><b>Laporan petty cash</b><small>Dana operasional perusahaan. Dipertanggungjawabkan, tanpa pembayaran.</small></span></label></div></fieldset>' +
      (st.blocked ? H.banner('error', 'alert', '<b>' + el.drafts.length + ' transaksi Draft di project ini.</b> Lengkapi nota atau hapus dulu. <a href="#/receipts" data-act="dlg-close-go">Buka Upload Nota</a>') : '') +
      (!st.blocked && W.mode === 'periode' && el.drafts.length ? H.banner('warn', 'alert', '<b>' + el.drafts.length + ' transaksi Draft tidak ikut diajukan</b> karena notanya belum lengkap.') : '') +
      '<div><div class="row between mb"><b>Transaksi yang akan diajukan</b><span class="small muted">' + items.length + ' transaksi · <b style="color:var(--ink)">' + rp(el.total) + '</b></span></div>' +
      (items.length ? '<div class="wiz-list">' + items.map(t => '<div class="wiz-row"><div class="sp"><b>' + esc(t.description) + '</b><span class="sub">' + dt(t.date) + ' · ' + esc(H.projName(t.projectId)) + ' · ' + esc(t.category) + (t.noReceipt ? ' · tanpa nota' : '') + '</span></div><b class="nowrap">' + rp(t.amount) + '</b></div>').join('') + '</div>'
        : '<div class="banner">' + icon('info') + '<div class="sp">' + (W.mode === 'project' && !W.projectId ? 'Pilih project yang sudah ditutup.' : 'Tidak ada transaksi yang bisa diajukan untuk pilihan ini. Transaksi yang sudah diajukan atau belum lengkap notanya tidak ikut.') + '</div></div>') + '</div>' +
      '<label class="field"><span>Catatan untuk approver <em>opsional</em></span><textarea name="note" rows="2" maxlength="300" data-input="wiz-note" placeholder="Mis. Reimbursement shooting company profile, nota lengkap">' + esc(W.note) + '</textarea></label>' +
      '<p class="small muted">Setiap transaksi hanya bisa masuk satu pengajuan, jadi tidak akan ada penggantian ganda.</p></div>';
    const b = document.getElementById('wiz-submit');
    if (b) { b.disabled = !items.length || st.blocked; b.textContent = personal ? 'Ajukan reimbursement (' + rp(el.total) + ')' : 'Ajukan laporan petty cash (' + rp(el.total) + ')'; }
    if (focusName) { const f = box.querySelector('[name="' + focusName + '"]:checked') || box.querySelector('select[name="' + focusName + '"]'); if (f) f.focus(); }
  }
  Change.wiz = el => {
    if (!W) return;
    const n = el.name;
    if (n === 'mode') { W.mode = el.value; W.excluded = []; wizDefaults(); }
    else if (n === 'fund') { W.fund = el.value; W.excluded = []; if (W.mode === 'project') wizDefaults(); }
    else if (n === 'projectId') { W.projectId = el.value; }
    else if (n === 'period') { W.period = el.value; W.excluded = []; }
    else if (n === 'prj') { W.excluded = el.checked ? W.excluded.filter(x => x !== el.value) : W.excluded.concat(el.value); }
    wizardRender(n === 'prj' ? '' : n);
  };
  Inp['wiz-note'] = el => { if (W) W.note = el.value; };
  Act['wizard-submit'] = () => {
    if (!W) return;
    const st = wizState(); let claim;
    if (App.commit(() => { claim = Core.submitClaim(S(), { mode: st.q.mode, fund: st.q.fund, projectIds: st.q.projectIds, period: st.q.period }, App.actor(), W.note); })) {
      UI.closeAllDialogs(); W = null; App.go('#/claim/' + claim.id);
      UI.toast(claim.number + ' diajukan untuk approval', 'success');
    }
  };

  /* ======================= Detail pengajuan (nota) ======================= */
  const ACT_LABEL = { 'diajukan': 'mengajukan', 'diajukan ulang': 'mengajukan ulang', 'revisi': 'meminta revisi', 'disetujui': 'menyetujui', 'ditolak': 'menolak', 'dibatalkan': 'menarik pengajuan', 'dibayar': 'menandai dibayar', 'diselesaikan': 'menyelesaikan' };
  const ACT_CLS = { 'revisi': 'orange', 'disetujui': 'green', 'ditolak': 'red', 'dibayar': 'teal', 'diselesaikan': 'teal', 'dibatalkan': '' };

  function claimLine(t, i, c, cap) {
    const rej = t.status === TX.REJECTED, notes = [];
    if (t.status === TX.REVISION && t.revNote) notes.push('<div class="row-note"><b>Finance:</b> ' + esc(t.revNote) + '</div>');
    if (t.revReply && (t.status === TX.REVISION || t.status === TX.WAITING)) notes.push('<div class="row-note reply"><b>Producer:</b> ' + esc(t.revReply) + '</div>');
    if (rej && t.rejectReason) notes.push('<div class="row-note rej"><b>Ditolak:</b> ' + esc(t.rejectReason) + '</div>');
    if (t.noReceipt) notes.push('<div class="row-note">Tanpa nota: ' + esc(t.noReceiptReason) + '</div>');
    if (t.dupConfirmed) notes.push('<div class="row-note">Mirip transaksi lain, dikonfirmasi saat dicatat.</div>');
    let act = '';
    if (cap.canReview && t.status === TX.WAITING) act = '<div class="row"><button class="btn btn-sm" data-act="line-flag" data-claim="' + c.id + '" data-id="' + t.id + '">' + icon('undo') + 'Revisi</button><button class="btn-x" data-act="line-reject" data-claim="' + c.id + '" data-id="' + t.id + '" aria-label="Tolak transaksi ini" title="Tolak">' + icon('x') + '</button></div>';
    else if (cap.canReview && t.status === TX.REVISION) act = '<button class="btn btn-sm" data-act="line-unflag" data-claim="' + c.id + '" data-id="' + t.id + '">Batalkan revisi</button>';
    else if (c.status === CL.REVISION && t.status === TX.REVISION) act = t.fixedAt ? '<span class="pill green">' + icon('check') + 'Diperbaiki</span>' : '<button class="btn btn-sm btn-primary" data-act="tx-edit" data-id="' + t.id + '">Perbaiki</button>';
    return '<tr class="' + (rej ? 'rej' : '') + '"><td data-label="No" class="nowrap">' + (i + 1) + '</td>' +
      '<td class="c-main"><button type="button" class="link-btn" style="text-align:left;font-weight:600;color:var(--ink)" data-act="tx-open" data-id="' + t.id + '">' + esc(t.description) + '</button><span class="sub">' + esc(H.projName(t.projectId)) + ' · ' + esc(t.category) + (t.vendor ? ' · ' + esc(t.vendor) : '') + (t.notaNo ? ' · No. ' + esc(t.notaNo) : '') + '</span><span class="sub show-narrow">' + dt(t.date) + '</span>' + notes.join('') + (act ? '<div class="line-act no-print">' + act + '</div>' : '') + '</td>' +
      '<td data-label="Tanggal" class="nowrap col-lg">' + dt(t.date) + '</td>' +
      '<td data-label="Bukti">' + H.thumb(t) + '</td>' +
      '<td data-label="Nominal" class="num nowrap amt"><b>' + rp(t.amount) + '</b></td>' +
      '<td data-label="Status">' + pill(t.status, UI.txStatusLabel(S(), t)) + '</td></tr>';
  }

  V.claim = id => {
    const s = S(), c = s.claims.find(x => x.id === id);
    if (!c) return H.pageHead('Pengajuan tidak ditemukan', '', '<a class="btn" href="#/reimburse">Kembali</a>');
    const items = Core.claimItems(s, c), role = App.role(), cap = Core.claimCapabilities(s, c, role), personal = c.fund === FUND.PERSONAL;
    const rev = role !== 'producer';
    const co = s.settings.company || 'Perusahaan';
    let banner = '';
    if (c.status === CL.REVISION) banner = cap.flagged ? H.banner('warn', 'undo', '<b>Finance meminta revisi untuk ' + cap.flagged + ' transaksi.</b> ' + (rev ? 'Menunggu Producer memperbaiki.' : 'Perbaiki setiap baris yang ditandai, lalu tekan Ajukan ulang.')) : '';
    else if (c.status === CL.WAITING) banner = H.banner('info', 'clock', rev ? '<b>Periksa setiap bukti nota.</b> Anda bisa meminta revisi atau menolak per transaksi, lalu menyetujui sisanya.' : '<b>Menunggu approval Finance atau Director.</b> Pengajuan masih bisa ditarik selama belum disetujui.');
    else if (c.status === CL.APPROVED) banner = H.banner('ok', 'checkc', personal ? '<b>Disetujui' + (c.approvedBy ? ' oleh ' + esc(c.approvedBy) : '') + '.</b> Menunggu pembayaran reimbursement.' : '<b>Disetujui.</b> Tandai selesai untuk menutup laporan petty cash.');
    else if (c.status === CL.PAID) banner = H.banner('ok', 'coins', personal ? '<b>Sudah dibayar</b> ' + dt(c.payment && c.payment.date) + (c.payment && c.payment.method ? ' via ' + esc(c.payment.method) : '') + (c.payment && c.payment.ref ? ' · ref ' + esc(c.payment.ref) : '') + '. Laporan diarsipkan.' : '<b>Selesai</b> ' + dt(c.payment && c.payment.date) + '. Laporan petty cash diarsipkan.');
    else if (c.status === CL.REJECTED) banner = H.banner('error', 'x', '<b>Pengajuan ditolak.</b> Transaksi yang ditolak bersifat final dan tidak bisa diajukan lagi.');
    else if (c.status === CL.CANCELLED) banner = H.banner('info', 'info', 'Pengajuan ini ditarik. Transaksinya bisa diajukan kembali.');

    const people = [];
    for (const e of (c.history || [])) if (e.action === 'diajukan') { people.push(e.by); break; }
    const ttl = personal ? 'Laporan Pengajuan Reimbursement' : 'Laporan Pertanggungjawaban Petty Cash';
    const meta = [['Jenis', H.claimKind(c)], ['Sumber dana', Core.FUND_LABEL[c.fund]], ['Project', H.claimProjects(c)], ['Diajukan oleh', c.createdBy || '—'], ['Tanggal diajukan', dt(UI.dateOfISO(c.submittedAt))]];
    if (c.approvedAt) meta.push(['Disetujui', dt(UI.dateOfISO(c.approvedAt)) + (c.approvedBy ? ' · ' + c.approvedBy : '')]);
    if (c.payment) meta.push([personal ? 'Dibayar' : 'Selesai', dt(c.payment.date)]);

    const bar = [];
    if (cap.canRejectAll) bar.push('<button class="btn btn-danger" data-act="claim-reject" data-id="' + id + '">Tolak pengajuan</button>');
    if (cap.canCancel) bar.push('<button class="btn btn-danger" data-act="claim-cancel" data-id="' + id + '">' + icon('undo') + 'Tarik pengajuan</button>');
    if (cap.canSendRevision) bar.push('<button class="btn" data-act="claim-send-revision" data-id="' + id + '">' + icon('send') + 'Kirim revisi (' + cap.flagged + ')</button>');
    if (cap.canReview) bar.push('<button class="btn btn-dark" data-act="claim-approve" data-id="' + id + '"' + (cap.canApprove ? '' : ' disabled title="Selesaikan tanda revisi dulu"') + '>' + icon('check') + 'Setujui semua</button>');
    if (cap.canPay) bar.push('<button class="btn btn-primary" data-act="claim-pay" data-id="' + id + '">' + icon(personal ? 'coins' : 'check') + (personal ? 'Tandai dibayar' : 'Tandai selesai') + '</button>');
    if (cap.canResubmit) bar.push('<button class="btn btn-primary" data-act="claim-resubmit" data-id="' + id + '">' + icon('send') + 'Ajukan ulang</button>');
    const info = cap.canReview ? (cap.flagged ? cap.flagged + ' transaksi ditandai revisi' : cap.waiting + ' transaksi menunggu keputusan') : (c.status === CL.REVISION ? (items.filter(t => t.status === TX.REVISION && !t.fixedAt).length + ' baris belum diperbaiki') : '');

    const hist = (c.history || []).slice().reverse().map(h => '<li class="' + (ACT_CLS[h.action] || '') + '"><span class="who">' + esc(h.by) + '</span> <span class="muted">' + esc(ACT_LABEL[h.action] || h.action) + '</span><div class="when">' + UI.dtime(h.at) + (h.role ? ' · ' + esc(Core.ROLES[h.role] || h.role) : '') + '</div>' + (h.note ? '<div class="what">' + esc(h.note) + '</div>' : '') + '</li>').join('');
    const withPhoto = items.filter(t => t.photoId && !UI.isPdfId(t.photoId));

    return H.pageHead(c.number, esc(H.claimKind(c)) + ' · ' + esc(Core.FUND_LABEL[c.fund]),
      '<button class="btn" data-act="claim-print" data-id="' + id + '">' + icon('printer') + 'Cetak / PDF</button><button class="btn" data-act="claim-csv" data-id="' + id + '">' + icon('download') + 'CSV</button>',
      '<a href="#/reimburse">Reimbursement</a>' + icon('chevr') + '<span>' + esc(c.number) + '</span>') +
      (banner ? '<div class="no-print mb">' + banner + '</div>' : '') +
      '<div class="grid g-main" style="align-items:start"><div>' +
      '<div class="paper-wrap"><article class="paper">' +
      '<header class="paper-head"><div>' + H.letterhead(co) + '<div class="ttl" style="margin-top:10px">' + ttl + '</div></div><div class="no"><b>' + esc(c.number) + '</b><span class="no-print">' + UI.claimPill(c) + '</span><span class="print-only small">' + esc(UI.claimStatusLabel(c)) + '</span></div></header>' +
      '<dl class="paper-meta">' + meta.map(m => '<div><dt>' + m[0] + '</dt><dd>' + esc(m[1]) + '</dd></div>').join('') + '</dl>' +
      (c.note ? '<p class="small" style="padding:12px 0;border-bottom:2px dashed #ccd3de"><span class="muted">Catatan pengaju:</span> ' + esc(c.note) + '</p>' : '') +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>No</th><th>Deskripsi</th><th class="col-lg">Tanggal</th><th>Bukti</th><th class="num">Nominal</th><th>Status</th></tr></thead><tbody>' + items.map((t, i) => claimLine(t, i, c, cap)).join('') + '</tbody></table></div>' +
      '<div class="paper-total"><span class="l">' + (personal ? 'Total yang diganti' : 'Total pemakaian petty cash') + (c.rejectedTotal ? ' <span class="small muted">(ditolak ' + rp(c.rejectedTotal) + ')</span>' : '') + '</span><span class="v">' + rp(c.total) + '</span></div>' +
      '<div class="paper-sign"><div>Dibuat oleh<br><b>' + esc(c.createdBy || '') + '</b></div><div>Diperiksa Finance</div><div>Disetujui Director</div></div>' +
      '</article></div>' +
      (bar.length ? '<div class="action-bar solo no-print">' + (info ? '<span class="info">' + esc(info) + '</span>' : '') + bar.join('') + '</div>' : '') +
      '</div><div class="stack no-print">' +
      '<section class="card"><div class="card-head"><div class="card-title">' + icon('file') + 'Ringkasan</div></div><dl class="detail-grid" style="grid-template-columns:1fr 1fr"><div><dt>Total</dt><dd>' + rp(c.total) + '</dd></div><div><dt>Transaksi</dt><dd>' + items.filter(t => t.status !== TX.REJECTED).length + ' dari ' + items.length + '</dd></div>' + (c.rejectedTotal ? '<div><dt>Ditolak</dt><dd class="bad">' + rp(c.rejectedTotal) + '</dd></div>' : '') + '<div><dt>Revisi</dt><dd>' + (c.revisionCount || 0) + 'x</dd></div></dl></section>' +
      '<section class="card"><div class="card-head"><div class="card-title">' + icon('clock') + 'Riwayat</div></div><ul class="tl">' + hist + '</ul></section></div></div>' +
      (withPhoto.length ? '<section class="attachments"><h3>Lampiran bukti nota — ' + esc(c.number) + '</h3><div class="att-grid">' + withPhoto.map((t, i) => '<figure><img data-photo="' + t.photoId + '" alt="Nota ' + esc(t.description) + '"><figcaption><b>' + esc(t.description) + '</b><br>' + dt(t.date) + ' · ' + rp(t.amount) + '</figcaption></figure>').join('') + '</div></section>' : '');
  };

  /* ---- Aksi pengajuan ---- */
  const getC = id => S().claims.find(x => x.id === id);
  Act['claim-approve'] = async d => {
    const c = getC(d.id);
    const note = await UI.promptBox({ title: 'Setujui pengajuan', message: c.number + ' — ' + rp(c.total) + '. Transaksi yang ditolak tidak ikut dihitung.', label: 'Catatan untuk Producer (opsional)', required: false, okText: 'Setujui' });
    if (note === null) return;
    App.commit(() => Core.approveClaim(S(), d.id, note, App.actor()), c.number + ' disetujui');
  };
  Act['claim-reject'] = async d => {
    const c = getC(d.id);
    const reason = await UI.promptBox({ title: 'Tolak seluruh pengajuan', message: 'Penolakan bersifat final: semua transaksi di ' + c.number + ' tidak bisa diajukan lagi. Pilih Revisi jika masih bisa diperbaiki.', label: 'Alasan penolakan', danger: true, okText: 'Tolak pengajuan' });
    if (!reason) return;
    App.commit(() => Core.rejectClaim(S(), d.id, reason, App.actor()), 'Pengajuan ditolak', 'error');
  };
  Act['claim-send-revision'] = async d => {
    const note = await UI.promptBox({ title: 'Kirim revisi ke Producer', message: 'Transaksi yang ditandai akan dikembalikan untuk diperbaiki.', label: 'Pesan umum (opsional)', required: false, okText: 'Kirim revisi' });
    if (note === null) return;
    App.commit(() => Core.sendRevision(S(), d.id, note, App.actor()), 'Revisi dikirim ke Producer');
  };
  Act['line-flag'] = async d => {
    const t = S().transactions.find(x => x.id === d.id);
    const note = await UI.promptBox({ title: 'Minta revisi', message: t.description + ' — ' + rp(t.amount), label: 'Apa yang perlu diperbaiki?', placeholder: 'Mis. Nota buram, mohon foto ulang', okText: 'Tandai revisi' });
    if (!note) return;
    App.commit(() => Core.flagRevision(S(), d.claim, d.id, note, App.actor()), 'Ditandai revisi. Tekan “Kirim revisi” saat selesai memeriksa.');
  };
  Act['line-unflag'] = d => App.commit(() => Core.unflagRevision(S(), d.claim, d.id, App.actor()), 'Tanda revisi dibatalkan');
  Act['line-reject'] = async d => {
    const t = S().transactions.find(x => x.id === d.id);
    const reason = await UI.promptBox({ title: 'Tolak transaksi', message: t.description + ' — ' + rp(t.amount) + '. Penolakan bersifat final.', label: 'Alasan penolakan', danger: true, okText: 'Tolak transaksi' });
    if (!reason) return;
    App.commit(() => Core.rejectLine(S(), d.claim, d.id, reason, App.actor()), 'Transaksi ditolak');
  };
  Act['claim-resubmit'] = d => App.commit(() => Core.resubmitClaim(S(), d.id, App.actor()), 'Diajukan ulang ke Finance');
  Act['claim-cancel'] = async d => {
    const c = getC(d.id);
    const reason = await UI.promptBox({ title: 'Tarik pengajuan?', message: 'Transaksi di ' + c.number + ' kembali tersedia dan bisa diajukan ulang. Pengajuan ini ditandai Dibatalkan.', label: 'Alasan (opsional)', required: false, danger: true, okText: 'Tarik pengajuan' });
    if (reason === null) return;
    if (App.commit(() => Core.cancelClaim(S(), d.id, reason, App.actor()), 'Pengajuan ditarik')) App.go('#/reimburse');
  };
  Act['claim-pay'] = d => {
    const c = getC(d.id), personal = c.fund === FUND.PERSONAL;
    const dlg = UI.makeDialog({
      title: personal ? 'Tandai dibayar' : 'Tandai selesai', cls: 'dlg-small',
      html: '<p class="mb"><b>' + esc(c.number) + '</b> — ' + rp(c.total) + '</p><form id="pay-form" data-form="claim-pay" data-id="' + c.id + '" novalidate><div class="stack" style="gap:14px">' +
        '<label class="field"><span>' + (personal ? 'Tanggal bayar' : 'Tanggal selesai') + '</span><input type="date" name="date" value="' + Core.todayStr() + '" max="' + Core.todayStr() + '"></label>' +
        (personal ? '<label class="field"><span>Metode</span><select name="method"><option>Transfer bank</option><option>Tambahkan ke payroll</option><option>Tunai</option><option>E-wallet</option></select></label>' : '') +
        '<label class="field"><span>No. referensi <em>opsional</em></span><input name="ref" type="text" maxlength="40" placeholder="Mis. TRF-0921-A"></label></div><div class="form-error" role="alert" hidden></div></form>',
      footer: '<button class="btn" data-act="dlg-close">Batal</button><button class="btn btn-primary" type="submit" form="pay-form">' + (personal ? 'Konfirmasi pembayaran' : 'Konfirmasi selesai') + '</button>'
    });
    void dlg;
  };
  Forms['claim-pay'] = form => {
    const f = new FormData(form), c = getC(form.dataset.id);
    try { Core.payClaim(S(), c.id, { date: f.get('date'), method: f.get('method') || '', ref: f.get('ref') }, App.actor()); } catch (e) { return H.fail(form, e); }
    App.save(); UI.closeAllDialogs(); App.render();
    UI.toast(c.fund === FUND.PERSONAL ? 'Pembayaran dicatat. Laporan diarsipkan.' : 'Laporan petty cash diselesaikan.', 'success');
  };
  Act['claim-csv'] = d => { const c = getC(d.id); UI.download(c.number + '.csv', Core.csvClaimDetail(S(), d.id, S().settings.csvSemicolon ? ';' : ','), 'text/csv;charset=utf-8'); };
  Act['claim-print'] = async d => {
    const c = getC(d.id), prev = document.title;
    document.title = c.number + ' — ' + (S().settings.company || 'KasProyek');
    await UI.hydratePhotos(document, S());
    await Promise.all([...document.querySelectorAll('.attachments img')].map(i => (i.decode ? i.decode().catch(() => { }) : null)));
    window.addEventListener('afterprint', () => { document.title = prev; }, { once: true });
    window.print();
  };
  Act['reimburse-tab'] = d => App.go('#/reimburse' + (d.tab === 'all' ? '' : '?tab=' + d.tab));

  /* ======================= Approval Center ======================= */
  const A_TABS = [['waiting', 'Menunggu', c => c.status === CL.WAITING], ['revision', 'Revisi', c => c.status === CL.REVISION], ['approved', 'Siap dibayar', c => c.status === CL.APPROVED], ['done', 'Selesai', c => c.status === CL.PAID], ['rejected', 'Ditolak', c => c.status === CL.REJECTED]];
  V.approval = () => {
    const s = S(), role = App.role(), rev = role !== 'producer';
    const tab = App.query.tab || 'waiting';
    const cs = live();
    const def = A_TABS.find(t => t[0] === tab) || A_TABS[0];
    const list = cs.filter(def[2]).sort((a, b) => def[0] === 'waiting' ? String(a.submittedAt).localeCompare(String(b.submittedAt)) : subDesc(a, b));
    const waiting = cs.filter(c => c.status === CL.WAITING), appr = cs.filter(c => c.status === CL.APPROVED);
    const paidM = cs.filter(c => c.status === CL.PAID && c.fund === FUND.PERSONAL && (c.paidAt || '').slice(0, 7) === thisMonth());
    const card = c => {
      const items = Core.claimItems(s, c), flagged = items.filter(t => t.status === TX.REVISION).length, cap = Core.claimCapabilities(s, c, role);
      const noReceipt = items.filter(t => t.noReceipt).length;
      return '<article class="card claim-card"><div class="row between"><div><a href="#/claim/' + c.id + '"><b>' + esc(c.number) + '</b></a> <span class="muted small">' + esc(H.claimKind(c)) + '</span></div>' + UI.claimPill(c) + '</div>' +
        '<div><div class="strong">' + esc(H.claimProjects(c)) + '</div><div class="small muted">Diajukan ' + esc(c.createdBy || '') + ' · ' + dt(UI.dateOfISO(c.submittedAt)) + ' · ' + c.txIds.length + ' transaksi' + (c.revisionCount ? ' · revisi ' + c.revisionCount + 'x' : '') + '</div></div>' +
        '<div class="row" style="gap:6px">' + fundTag(c.fund) + (flagged ? '<span class="pill orange">' + icon('undo') + flagged + ' perlu revisi</span>' : '') + (noReceipt ? '<span class="pill amber">' + icon('alert') + noReceipt + ' tanpa nota</span>' : '') + '</div>' +
        '<div class="row between"><b class="amount">' + rp(c.total) + '</b><div class="row">' + (cap.canPay ? '<button class="btn btn-primary btn-sm" data-act="claim-pay" data-id="' + c.id + '">' + (c.fund === FUND.PERSONAL ? 'Bayar' : 'Selesaikan') + '</button>' : '') + '<a class="btn ' + (cap.canReview ? 'btn-dark' : '') + ' btn-sm" href="#/claim/' + c.id + '">' + (cap.canReview ? 'Tinjau' : 'Lihat') + '</a></div></div></article>';
    };
    return H.pageHead('Approval Center', 'Periksa bukti nota, setujui, minta revisi, atau tolak. Pembayaran dicatat setelah disetujui.') +
      (!rev ? '<div class="mb">' + H.banner('info', 'shield', 'Anda masuk sebagai <b>' + Core.ROLES[role] + '</b>, jadi halaman ini hanya untuk dilihat. Ganti peran ke <b>Finance</b> atau <b>Director</b> lewat menu akun (kanan atas) untuk menyetujui.') + '</div>' : '') +
      '<div class="grid g-kpi" style="margin-bottom:20px">' +
      '<div class="card kpi"><div class="top"><span class="chip amber">' + icon('clock') + '</span>Menunggu keputusan</div><div class="val">' + waiting.length + '</div><div class="note">' + rp(sum(waiting, c => c.total)) + '</div></div>' +
      '<div class="card kpi"><div class="top"><span class="chip green">' + icon('checkc') + '</span>Disetujui, belum dibayar</div><div class="val">' + rp(sum(appr.filter(c => c.fund === FUND.PERSONAL), c => c.total)) + '</div><div class="note">' + appr.length + ' pengajuan</div></div>' +
      '<div class="card kpi"><div class="top"><span class="chip teal">' + icon('coins') + '</span>Dibayar bulan ini</div><div class="val">' + rp(sum(paidM, c => c.total)) + '</div><div class="note">' + paidM.length + ' pengajuan</div></div></div>' +
      '<div class="tabs">' + A_TABS.map(t => { const n = cs.filter(t[2]).length; return '<button class="' + (tab === t[0] ? 'on' : '') + '" data-act="go" data-to="#/approval?tab=' + t[0] + '">' + t[1] + (n ? '<span class="badge-n"' + (t[0] === 'waiting' || t[0] === 'revision' ? '' : ' style="background:#e8ecf2;color:#4d576b"') + '>' + n + '</span>' : '') + '</button>'; }).join('') + '</div>' +
      (list.length ? '<div class="grid g-2">' + list.map(card).join('') + '</div>' : '<div class="card">' + H.empty('checkc', tab === 'waiting' ? 'Tidak ada yang menunggu' : 'Belum ada pengajuan di sini', tab === 'waiting' ? 'Semua pengajuan sudah diputuskan.' : 'Pengajuan dengan status ini akan muncul di sini.') + '</div>');
  };
})();
