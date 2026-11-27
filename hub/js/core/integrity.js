/* =====================================================================
 * SYSTEM INTEGRITY MONITOR — directive 22 · 11-13 (2026-11-20).  Hub.integrity
 *
 * Two independent controls:
 *   Data consistency      every section reads the same version of the same data (stored central record = the engine run on screen;
 *                         no section older than the central record; the central record not older than its input data)
 *   Decision consistency  for the same asset, horizon and analysis time, every section shows the same verdict, rank and levels
 * Every section that shows a verdict registers a consumer: a function returning exactly what that section shows (it is the same row
 * builder the page renders from). The monitor compares each consumer with the central record, field by field:
 *   T1 asset list     every asset shown is in the master list; every confirmed central opportunity is reachable; coverage gaps named
 *   T2 signals        verdict (action, status, tier)
 *   T3 prices         base price and data date
 *   T4 levels         entry zone, stop, first target, confirmation levels
 *   T5 rank           one rank: unique, contiguous, identical on every page; the dashboard top list = the first ranks
 *   T6 staleness      no section on an older central version; the central record not older than the data it was computed from
 *   T7 after refresh  the whole run repeats after every engine run (hook in the trading engine)
 * On a mismatch: the asset, section, field, central value and shown value are recorded with the cause found; where a reload from the
 * central record can fix it (stale engine memo, stale master list, stale alert baseline), it is reloaded and the test is run again; the
 * outcome is logged. Nothing is hidden: an unresolved mismatch stays in the report. Log: hub.integrity.v1 (last 40 runs).
 * selfTest(): injects a deliberate mismatch into a test consumer and checks that it is caught (directive 22 · 14, test 7).
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  var KEY = 'hub.integrity.v1', CONS = [];
  function U() { return Hub.util; }
  function isF(x) { return typeof x === 'number' && isFinite(x); }
  function C() { return Hub.central; }
  function S0Get(k) { try { return U().store.get(k, null); } catch (e) { return null; } }
  /* register(id, title, fn, opt): fn() → { rows: [{ key, act, st, tier, rank, rankCls, px, buy, stop, tp1, up, dn, ver }], at?, note? } or null
     opt.fields: the fields this section shows (only those are compared) */
  function register(id, title, fn, opt) { CONS = CONS.filter(function (c) { return c.id !== id; }); CONS.push({ id: id, title: title, fn: fn, fields: (opt && opt.fields) || ['act', 'st', 'tier', 'rank', 'px', 'buy', 'stop', 'tp1', 'ver'], kind: opt && opt.kind || 'page' }); }
  function consumers() { return CONS.map(function (c) { return { id: c.id, title: c.title, fields: c.fields, kind: c.kind }; }); }
  var FFA = { act: 'اقدام', st: 'وضعیت', tier: 'سطح فرصت', rank: 'رتبه', rankCls: 'رتبهٔ بازار', px: 'قیمت مبنا', buy: 'محدودهٔ ورود', stop: 'حد ضرر', tp1: 'هدف ۱', up: 'تأیید صعود', dn: 'تأیید نزول', ver: 'نسخهٔ سیگنال', date: 'تاریخ داده', life: 'وضعیت فرصت' };
  var TFA = { T1: 'فهرست دارایی‌ها', T2: 'سیگنال‌ها', T3: 'قیمت‌ها', T4: 'سطوح معاملاتی', T5: 'رتبه‌بندی', T6: 'دادهٔ قدیمی', T7: 'پس از به‌روزرسانی', T8: 'اعلان‌ها در برابر حکم مرکزی', T9: 'پوشش صندوق‌های طلا و نقره', T10: 'پوشش تشخیص حرکت', T11: 'وضعیت فرصت (چرخهٔ عمر) و فهرست فعال', T12: 'حکم نهایی یکتا (اقدام، مرحله، افق)' };
  var TEST = { act: 'T2', st: 'T2', tier: 'T2', px: 'T3', date: 'T3', buy: 'T4', stop: 'T4', tp1: 'T4', up: 'T4', dn: 'T4', rank: 'T5', rankCls: 'T5', ver: 'T6', life: 'T11' };
  function factsOf(key, r) { var p = C().present(Object.assign({ key: key }, r)); return { key: key, act: p.act, st: p.st, tier: p.tier, rank: p.rank, rankCls: p.rankCls, px: p.px, buy: p.buy, stop: p.stop, tp1: p.tp.length ? p.tp[0] : null, up: p.up, dn: p.dn, ver: p.ver, date: p.date, sym: p.sym, life: lifeK(key, r) }; }
  function lifeK(key, r) { var CE = C(); if (!CE.life) return null; try { var o = CE.life(Object.assign({ key: key }, r), { C: CE.get() }); return o ? o.k : null; } catch (e) { return null; } }
  function same(a, b) { if (a == null && b == null) return true; if (a == null || b == null) return false;
    if (Array.isArray(a) || Array.isArray(b)) { if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false; for (var i = 0; i < a.length; i++) if (!same(a[i], b[i])) return false; return true; }
    if (isF(a) && isF(b)) return Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b)); return a === b; }
  var fmt = function (v) { return v == null ? '—' : Array.isArray(v) ? v.map(fmt).join(' – ') : isF(v) ? String(Math.round(v * 100) / 100) : String(v); };

  // the live engine run on screen, without forcing a new run
  function liveCentral() { var T = Hub.tradeUI; var R = T && T.engineMemo ? T.engineMemo() : null; return R && R.central ? R : null; }

  /* run(opt): opt.fix (default true) — reload stale parts and test again; opt.extra — additional consumers (self-test); opt.why — trigger */
  function run(opt) {
    opt = opt || {}; var t0 = Date.now(), Cs = C().get(), out = { at: t0, self: !!opt.self, why: opt.why || 'دستی', tests: {}, mm: [], info: [], fixed: [], cons: [], central: Cs ? { at: Cs.at, run: Cs.run || null, upd: Cs.upd || null, n: Object.keys(Cs.by || {}).length } : null };
    Object.keys(TFA).forEach(function (t) { out.tests[t] = { n: 0, bad: 0 }; });
    var bad = function (t, o) { out.tests[t].bad++; o.test = t; out.mm.push(o); };
    if (!Cs || !Cs.by) { out.info.push('مرجع مرکزی هنوز ساخته نشده است (موتور یک بار اجرا نشده).'); return finish(out); }
    var by = Cs.by, M = C().buildMaster();
    /* ---- T1 asset list ---- */
    var keys = Object.keys(by); out.tests.T1.n += keys.length;
    keys.forEach(function (k) { var aid = by[k].aid; if (!aid) bad('T1', { sec: 'مرجع مرکزی', key: k, sym: by[k].sym, field: 'شناسهٔ یکتا', cen: '—', shown: 'ندارد', cause: 'رکورد بدون شناسهٔ دارایی', fix: 'محاسبهٔ دوبارهٔ موتور' });
      else if (!M.A[aid]) bad('T1', { sec: 'فهرست مرکزی دارایی‌ها', key: k, sym: by[k].sym, field: 'شناسهٔ یکتا', cen: aid, shown: 'در فهرست نیست', cause: 'فهرست دارایی‌ها از رکورد مرکزی عقب است', fix: '' }); });
    var dup = {}; Object.keys(M.A).forEach(function (aid) { var a = M.A[aid]; if (a.keys.length > 1) dup[aid] = a.keys; });
    Object.keys(dup).forEach(function (aid) { out.info.push('یک دارایی با چند کلید: ' + aid + ' ← ' + dup[aid].join('، ')); });
    var notStable = Object.keys(M.A).filter(function (aid) { return /^TSE-SYM-/.test(aid); }); if (notStable.length) out.info.push(notStable.length + ' سهم/صندوق هنوز کد یکتای TSETMC (insCode) ندارند و شناسه‌شان موقتاً از نماد ساخته شده؛ با اولین به‌روزرسانی ثبت نماد تکمیل می‌شود.');
    var cov = {}; Object.keys(M.A).forEach(function (aid) { var a = M.A[aid]; if (!a.inCentral) cov[a.cover] = (cov[a.cover] || 0) + 1; });
    Object.keys(cov).forEach(function (c) { out.info.push('پوشش: ' + c + ' — ' + cov[c] + ' دارایی (دلیل نبودن در فهرست فرصت‌ها مشخص است)'); });
    /* ---- data consistency: the stored record and the engine run on screen are the same version ---- */
    var L = liveCentral();
    if (L) { var LC = L.central; out.tests.T6.n++;
      if (LC.at !== Cs.at) { bad('T6', { sec: 'موتور روی صفحه', key: '*', sym: 'همه', field: 'نسخهٔ مرجع', cen: new Date(Cs.at).toISOString(), shown: new Date(LC.at).toISOString(), cause: 'اجرای موتورِ روی صفحه با آخرین مرجع ذخیره‌شده یکی نیست', fix: '' }); }
      else keys.forEach(function (k) { var a = factsOf(k, by[k]), lr = LC.by[k]; if (!lr) { bad('T1', { sec: 'موتور روی صفحه', key: k, sym: a.sym, field: 'حضور', cen: 'هست', shown: 'نیست', cause: 'خطای پردازشی', fix: '' }); return; }
        var b = factsOf(k, lr); ['act', 'st', 'tier', 'rank', 'rankCls', 'px', 'buy', 'stop', 'tp1', 'up', 'dn', 'ver'].forEach(function (f) { out.tests[TEST[f]].n++; if (!same(a[f], b[f])) bad(TEST[f], { sec: 'داشبورد معاملاتی (اجرای موتور)', key: k, sym: a.sym, field: FFA[f], cen: fmt(a[f]), shown: fmt(b[f]), cause: 'تفاوت رکورد ذخیره‌شده و اجرای روی صفحه', fix: '' }); }); });
      /* decision consistency inside the run: the trading cards follow the central verdict and levels */
      (L.cards || []).forEach(function (c) { var r = LC.by[c.key]; if (!r) return; out.tests.T2.n++;
        if ((c.type === 'long' || c.type === 'short') && r.st !== 'ok') bad('T2', { sec: 'کارت‌های معامله‌گری هوشمند', key: c.key, sym: c.sym, field: 'اقدام', cen: r.actFa + ' — ' + r.stFa, shown: c.typeFa, cause: 'کارت خرید بدون تأیید مرکزی', fix: '' });
        var Lr = r.L || {}; if ((c.type === 'long' || c.candidate) && !(Lr.buy && isF(Lr.stop)) && isF(c.lo) && !c.noCenLv) { out.tests.T4.n++; bad('T4', { sec: 'کارت‌های معامله‌گری هوشمند', key: c.key, sym: c.sym, field: 'محدودهٔ ورود', cen: 'سطح مرکزی ندارد', shown: fmt([c.lo, c.hi]), cause: 'کارت سطوح خودش را نشان می‌دهد', fix: '' }); }
        if ((c.type === 'long' || c.candidate) && Lr.buy && isF(Lr.stop)) { out.tests.T4.n++; if (!same([Math.min(c.lo, c.hi), Math.max(c.lo, c.hi)], [Math.min(Lr.buy[0], Lr.buy[1]), Math.max(Lr.buy[0], Lr.buy[1])]) || !same(c.stop, Lr.stop)) bad('T4', { sec: 'کارت‌های معامله‌گری هوشمند', key: c.key, sym: c.sym, field: 'محدودهٔ ورود / حد ضرر', cen: fmt(Lr.buy) + ' / ' + fmt(Lr.stop), shown: fmt([c.lo, c.hi]) + ' / ' + fmt(c.stop), cause: 'کارت سطوح خودش را نشان می‌دهد', fix: '' }); } });
      /* T5: one rank — unique, contiguous; the dashboard best list = the first ranks; the widget follows the same order */
      var rk = keys.map(function (k) { return LC.by[k]; }).filter(function (r) { return r && isF(r.rank); }).map(function (r) { return r.rank; }).sort(function (a, b) { return a - b; }); out.tests.T5.n++;
      for (var i = 0; i < rk.length; i++) if (rk[i] !== i + 1) { bad('T5', { sec: 'رتبه‌بندی مرکزی', key: '*', sym: 'همه', field: 'رتبه', cen: 'پیوسته از ۱', shown: 'شکاف یا تکرار در رتبهٔ ' + (i + 1), cause: 'خطای پردازشی رتبه‌بندی', fix: '' }); break; }
      keys.forEach(function (k) { var r = LC.by[k]; if (r && r.pri && isF(r.pri.rank) && r.rank !== r.pri.rank) bad('T5', { sec: 'رتبه‌بندی مرکزی', key: k, sym: r.sym, field: 'رتبه', cen: fmt(r.pri.rank), shown: fmt(r.rank), cause: 'دو تعریف رتبه', fix: '' }); });
      /* T1: no confirmed opportunity dropped by a link between modules — every confirmed central buy is in the buy category of the inbox */
      keys.forEach(function (k) { var r = LC.by[k]; if (!r || r.tier !== 'ok' || r.held) return; var en = C().entryNow ? C().entryNow(Object.assign({ key: k }, r), { C: LC }) : null; if (en && en.k !== 'none' && !en.ok) return;   /* entry not valid at the live price / old verdict: deliberately not a buy (2026-11-25) */ out.tests.T1.n++; if ((r.cats || []).indexOf('buy') < 0 && (r.cats || []).indexOf('scale') < 0) bad('T1', { sec: 'مرکز اعلان‌ها (دستهٔ خرید)', key: k, sym: r.sym, field: 'حضور', cen: 'خرید تأییدشده', shown: 'در دستهٔ خرید نیست', cause: 'دسته‌بندی اقدام با سطح فرصت هماهنگ نیست', fix: '' }); });
    } else out.info.push('موتور در این صفحه هنوز اجرا نشده؛ آزمون تطبیق با اجرای روی صفحه در اجرای بعدی انجام می‌شود.');
    /* ---- T6: the central record is not older than its input data ---- */
    var S0 = U().store, inputs = [['hub.sigstocks.v1', 'سهام و صندوق‌ها'], ['hub.sig-gold.v1', 'طلا و سکه'], ['hub.sig-fx.v1', 'ارز'], ['hub.sigglobal.v1', 'بازارهای جهانی']];
    inputs.forEach(function (q) { var D = S0.get(q[0], null), ts = D && D.meta && D.meta.asOfTs; if (!ts) return; out.tests.T6.n++; if (ts > Cs.at + 60e3) bad('T6', { sec: 'مرجع مرکزی', key: '*', sym: q[1], field: 'زمان محاسبه', cen: new Date(Cs.at).toISOString(), shown: 'دادهٔ ' + new Date(ts).toISOString(), cause: 'داده پس از آخرین محاسبهٔ موتور به‌روز شده؛ حکم‌ها مربوط به دادهٔ قبلی‌اند', fix: '' }); });
    var AL = Hub.alerts ? Hub.alerts.load() : null; if (AL && AL.cenAt) { out.tests.T6.n++; if (AL.cenAt < Cs.at) out.info.push('اعلان‌ها آخرین بار با نسخهٔ قبلی مرجع مرکزی ارزیابی شدند (در به‌روزرسانی بعدی هماهنگ می‌شوند؛ اعلان‌ها هرگز حکم مستقل نمی‌سازند).'); }
    /* ---- directive 26 · 4, 7, 9: alerts against the current verdict, gold / silver fund coverage, move-detection coverage ---- */
    if (Hub.alerts && Hub.alerts.audit) { var au = Hub.alerts.audit(); out.tests.T8.n += au.n || 0;
      (au.conflicts || []).forEach(function (q) { bad('T8', { sec: 'مرکز اعلان‌ها', key: '*', sym: q.sym, field: 'جهت در افق یکسان', cen: q.verdict + ' (' + q.verdictHz + ')', shown: q.alert + ' (' + (q.alertHz || 'بدون افق') + ')', cause: 'اعلان فعال با حکم فعلی در همان افق تناقض دارد', fix: 'اعلان را با «وضعیت امروز» بخوانید؛ در ارزیابی بعدی اعتبار آن بازبینی می‌شود' }); });
      if ((au.stale || []).length) out.info.push(au.stale.length + ' اعلان فعال دیگر با حکم فعلی معتبر نیست (منسوخ؛ در ستون «وضعیت امروز» علامت خورده است).');
      if ((au.hz || []).length) out.info.push(au.hz.length + ' اعلان با حکم فعلی در افق متفاوت هم‌جهت نیست (مجاز: افق‌ها جدا هستند).'); }
    var RG = Hub.tseRegistry && Hub.tseRegistry.get ? Hub.tseRegistry.get() : null;
    if (RG && RG.ins) { var syms = {}; keys.forEach(function (k) { syms[by[k].sym] = 1; }); var outW = {}; ((Cs.funnel && Cs.funnel.outside) || []).forEach(function (q) { outW[q.sym] = q.why; });
      var SS = S0Get('hub.sigstocks.v1'), W = {}; ((SS && SS.watch) || []).forEach(function (w) { W[w.symbol] = w; });
      Object.keys(RG.ins).forEach(function (cd) { var o = RG.ins[cd]; if (o.type !== 'fund' || (o.seen ? o.seen !== RG.date : o.navD !== RG.date) || !/gold|silver|commodity/.test(o.ftype || '')) return; out.tests.T9.n++;
        if (syms[o.sym]) return; var w = W[o.sym], base = /^(.+?)[2-9]$/.exec(o.sym), npx = SS && SS.data && SS.data[o.sym] && SS.data[o.sym].px ? SS.data[o.sym].px.length : 0;
        if (!w && base && syms[base[1]]) { out.info.push('صندوق ' + o.sym + ' نماد فرعیِ «' + base[1] + '» است (تابلوی دیگر همان صندوق)؛ تحلیل از نماد اصلی.'); return; }
        if (w && w.active !== false && !outW[o.sym] && npx < 30) { out.info.push('صندوق ' + o.sym + ' بیرون از موتور: تاریخچهٔ کوتاه (' + npx + ' جلسه؛ حداقل ۳۰).'); return; }
        if (!w) bad('T9', { sec: 'فهرست دیده‌بان هاب', key: 's:' + o.sym, sym: o.sym, field: 'حضور', cen: 'در دیده‌بان بازار معامله شده', shown: 'در فهرست هاب نیست', cause: 'همگام‌سازی فهرست با ثبت صندوق‌ها انجام نشده', fix: 'به‌روزرسانی سهام و صندوق‌ها' });
        else if (w.active !== false && !outW[o.sym]) bad('T9', { sec: 'موتور تحلیل', key: 's:' + o.sym, sym: o.sym, field: 'حضور', cen: 'فعال در فهرست', shown: 'در حکم مرکزی نیست', cause: 'علت حذف ثبت نشده', fix: 'اجرای دوبارهٔ موتور' });
        else out.info.push('صندوق ' + o.sym + ' بیرون از موتور: ' + (w.active === false ? 'غیرفعال' : outW[o.sym])); }); }
    keys.forEach(function (k) { var r = by[k]; if (r.cls === 'option') return; out.tests.T10.n++;
      if (!r.mvx && (r.n || 0) >= 32) bad('T10', { sec: 'تشخیص حرکت', key: k, sym: r.sym, field: 'پروفایل حرکت', cen: (r.n || 0) + ' مشاهده', shown: 'محاسبه نشد', cause: 'خطای پردازشی در تشخیص حرکت', fix: 'اجرای دوبارهٔ موتور' }); });
    /* ---- T11 (directive 28): the active opportunity list — one row per asset, no confirmed buy whose entry is not valid now, no ended / expired
       signal among the active ones ---- */
    if (C().life) { var seenA = {}; keys.forEach(function (k) { var r = by[k], o = null; try { o = C().life(Object.assign({ key: k }, r), { C: Cs }); } catch (e) { o = null; } if (!o) return; out.tests.T11.n++;
      if (o.k === 'confirmed' && o.side === 'buy' && o.e && o.e.k !== 'none' && !o.e.ok) bad('T11', { sec: 'مرکز جامع فرصت‌ها', key: k, sym: r.sym, field: 'وضعیت فرصت', cen: o.fa, shown: o.e.fa, cause: 'سیگنال تأییدشده با ورود نامعتبر در قیمت فعلی', fix: '' });
      if ((o.k === 'confirmed' || o.k === 'progress') && !r.held && (r.st === 'exp' || (o.e && (o.e.k === 'stopped' || o.e.k === 'invalid')))) bad('T11', { sec: 'مرکز جامع فرصت‌ها', key: k, sym: r.sym, field: 'وضعیت فرصت', cen: o.fa, shown: r.stFa || '—', cause: 'سیگنال منقضی یا ابطال‌شده در فهرست فعال', fix: '' });
      if (o.k !== 'none' && o.k !== 'ended') { var aid = r.aid || C().aidOf(k); if (seenA[aid]) bad('T11', { sec: 'مرکز جامع فرصت‌ها', key: k, sym: r.sym, field: 'یکتایی', cen: aid, shown: 'تکرار با ' + seenA[aid], cause: 'یک دارایی دو بار در فهرست فعال', fix: '' }); else seenA[aid] = k; } }); }
    /* ---- T12 (directive 31): the stored final action is THE decision now (no drift since the live quote / the clock moved), it is one of the
       nine standard actions, the plan's horizon code matches its horizon, and no section shows an action of another vocabulary ---- */
    if (C().decision) { out.tests.T12 = out.tests.T12 || { n: 0, bad: 0 }; keys.forEach(function (k) { var r = by[k]; var d = null; try { d = C().decision(Object.assign({ key: k }, r), { C: Cs }); } catch (e) { d = null; } if (!d) return; out.tests.T12.n++;
      if (!C().A9[r.act]) bad('T12', { sec: 'رکورد مرکزی', key: k, sym: r.sym, field: 'اقدام', cen: 'یکی از ۹ اقدام استاندارد', shown: String(r.act), cause: 'اقدام خارج از واژگان استاندارد', fix: '' });
      else if (d.a9 !== r.act || d.stage !== r.stage) bad('T12', { sec: 'رکورد مرکزی', key: k, sym: r.sym, field: 'حکم نهایی', cen: d.a9Fa + ' · ' + d.stageFa, shown: (r.actFa || r.act) + ' · ' + (r.stage || '—'), cause: 'حکم ذخیره‌شده با قیمت لحظه‌ای / زمان فعلی به‌روز نشده', fix: 'Hub.central.refresh' }); }); }
    /* ---- every registered section against the stored record ---- */
    CONS.concat(opt.extra || []).forEach(function (cn) { var res = null, t1 = Date.now(); try { res = cn.fn(); } catch (e) { out.cons.push({ id: cn.id, title: cn.title, err: e.message }); return; }
      if (!res) { out.cons.push({ id: cn.id, title: cn.title, skip: 'در این دستگاه داده ندارد' }); return; }
      var nb = 0, rows = res.rows || [];
      if (res.at && res.at !== Cs.at) { out.tests.T6.n++; nb++; bad('T6', { sec: cn.title, key: '*', sym: 'همه', field: 'نسخهٔ مرجع', cen: new Date(Cs.at).toISOString(), shown: new Date(res.at).toISOString(), cause: 'این بخش نسخهٔ دیگری از مرجع را خوانده', fix: '' }); }
      rows.forEach(function (x) { var r = by[x.key]; out.tests.T1.n++;
        if (!r) { if (x.act != null) { nb++; bad('T1', { sec: cn.title, key: x.key, sym: x.sym || x.key, field: 'حضور در مرجع', cen: 'رکورد ندارد', shown: fmt(x.act), cause: 'این بخش برای دارایی بیرون از مرجع حکم نشان می‌دهد', fix: '' }); } return; }
        var a = factsOf(x.key, r); cn.fields.forEach(function (f) { if (!(f in x)) return; out.tests[TEST[f]].n++; if (!same(a[f], x[f])) { nb++; bad(TEST[f], { sec: cn.title, key: x.key, sym: a.sym, field: FFA[f], cen: fmt(a[f]), shown: fmt(x[f]), cause: cn.cause || 'این بخش مقدار مرکزی را نشان نمی‌دهد', fix: '' }); } }); });
      out.cons.push({ id: cn.id, title: cn.title, n: rows.length, bad: nb, ms: Date.now() - t1, note: res.note || '' }); });
    /* ---- reload from the central record where that can fix it, then test again (once) ---- */
    if (opt.fix !== false && !opt.retry && out.mm.length) {
      var acts = []; if (out.mm.some(function (m) { return /اجرای روی صفحه|نسخهٔ مرجع/.test(m.cause); }) && Hub.tradeUI && Hub.tradeUI.idleRun) { Hub.tradeUI.idleRun('کنترل یکپارچگی: نتیجهٔ صفحه با مرجع مرکزی یکی نیست'); out.sched = 'اجرای دوبارهٔ موتور برای اولین لحظهٔ بیکاری زمان‌بندی شد'; }   /* never a blocking re-run from inside a check (2026-11-25) */
      if (out.mm.some(function (m) { return /فهرست دارایی‌ها از رکورد مرکزی عقب/.test(m.cause); })) { C().buildMaster(); acts.push('بازسازی فهرست مرکزی دارایی‌ها'); }
      if (out.mm.some(function (m) { return m.test === 'T12' && /به‌روز نشده/.test(m.cause); }) && C().refresh) { C().refresh(); acts.push('به‌روزرسانی حکم‌های ذخیره‌شده با قیمت لحظه‌ای و زمان فعلی'); }
      if (out.mm.some(function (m) { return /داده پس از آخرین محاسبه/.test(m.cause); }) && Hub.tradeUI && Hub.tradeUI.idleRun) { Hub.tradeUI.idleRun('کنترل یکپارچگی: دادهٔ تازه پس از آخرین محاسبه'); out.sched = 'محاسبهٔ دوباره با دادهٔ تازه برای اولین لحظهٔ بیکاری زمان‌بندی شد'; }
      if (acts.length) { var again = run(Object.assign({}, opt, { retry: true, why: out.why + ' — آزمون دوباره پس از اصلاح' })); again.fixedFrom = { n: out.mm.length, acts: acts }; again.mm.forEach(function (m) { m.fix = 'پس از «' + acts.join('، ') + '» هنوز باقی است'; });
        out.mm.forEach(function (m) { var still = again.mm.some(function (x) { return x.sec === m.sec && x.key === m.key && x.field === m.field; }); if (!still) { m.fix = 'اصلاح شد: ' + acts.join('، '); again.fixed.push(m); } }); return again; }
    }
    return finish(out);
  }
  function finish(out) { out.ms = Date.now() - out.at; out.ok = !out.mm.length; out.nMM = out.mm.length;
    // T7: a run triggered by an engine run / refresh counts as the post-refresh check of everything above
    if (/پس از/.test(out.why || '')) { var nn = 0; ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'].forEach(function (t) { nn += out.tests[t].n; }); out.tests.T7 = { n: nn, bad: out.mm.length }; }
    if (!out.self) { var S = (U() && U().store.get(KEY, null)) || { runs: [] }; S.runs.push({ at: out.at, why: out.why, ok: out.ok, nMM: out.nMM, nFixed: out.fixed.length, tests: out.tests, central: out.central, mm: out.mm.slice(0, 60), fixed: out.fixed.slice(0, 40), cons: out.cons, info: out.info.slice(0, 20), ms: out.ms }); S.runs = S.runs.slice(-40); S.last = S.runs[S.runs.length - 1]; try { U().store.set(KEY, S); } catch (e) { /* ignore */ } }
    return out; }
  function log() { return (U() && U().store.get(KEY, null)) || { runs: [] }; }
  /* selfTest(): a deliberate mismatch in a test section — verdict, stop and rank changed on one asset — must be caught as three
     mismatches in that section; nothing of it is stored as a real result */
  function selfTest() {
    var Cs = C().get(); if (!Cs || !Cs.by) return { ok: false, why: 'مرجع مرکزی نیست' };
    var k = Object.keys(Cs.by).filter(function (q) { var r = Cs.by[q]; return r.lv && isF(r.lv.stop) && isF(r.rank); })[0]; if (!k) return { ok: false, why: 'رکوردی با حد ضرر و رتبه نیست' };
    var f = factsOf(k, Cs.by[k]), bad = Object.assign({}, f, { act: f.act === 'buy' ? 'none' : 'buy', stop: f.stop * 0.9, rank: f.rank + 1 });
    var res = run({ fix: false, self: true, why: 'آزمون خطای عمدی', extra: [{ id: 'self', title: 'بخش آزمایشی (خطای عمدی)', fields: ['act', 'stop', 'rank'], fn: function () { return { rows: [bad] }; } }] });
    res.self = true; var got = res.mm.filter(function (m) { return m.sec === 'بخش آزمایشی (خطای عمدی)'; });
    return { ok: got.length === 3, caught: got.map(function (m) { return m.field; }), sym: f.sym, expect: 3 }; }
  Hub.integrity = { KEY: KEY, register: register, consumers: consumers, run: run, selfTest: selfTest, log: log, TFA: TFA, FFA: FFA };
})(typeof window !== 'undefined' ? window : globalThis);
