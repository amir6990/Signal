/* =====================================================================
 * TRADING & INTELLIGENT SIGNALS — UI of the trading engine (js/core/tradeengine.js)
 *   1 run & data (mode, account, user-controlled updates, 76-symbol watchlist, news)
 *   2 actionable signals (every mandatory field) · 3 portfolio construction
 *   4 position monitoring · 5 trading risk · 6 models bank (weights, on/off)
 *   7 back-test (in-sample vs out-of-sample) · 8 six test scenarios · 9 report + Excel
 *   Trading tools group: the existing market-data, signal, position and roadmap tools.
 * Not investment advice: the engine proposes, the user decides and executes.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  if (!root.document || !Hub.toolkit || !Hub.tradeEngine || !Hub.signals) return;
  var U = Hub.util, h = U.h, G = Hub.grid, TK = Hub.toolkit, TE = Hub.tradeEngine, SG = Hub.signals, TB = function () { return Hub.tradeBank; };
  var fa = TE.fa, pct = TE.pct, BT = null, BTkey = '';
  var MODE = [['signal', 'فقط سیگنال (Signal-Only)'], ['portfolio', 'ساخت سبد (Portfolio Construction)'], ['monitor', 'پایش موقعیت‌ها (Position Monitoring)'], ['full', 'سیستماتیک کامل (Full Systematic)']];
  var CLS = { stock: 'سهم', fund: 'صندوق', gold: 'طلا و سکه', fx: 'ارز', option: 'اختیار معامله' };
  var TYPEC = { long: 'fit-rec', short: 'fit-no', close: 'fit-no', hold: 'sev-info' };
  var FEEDIDS = SG.FEEDIDS, FAT = SG.FAT;   // feed list and names: signals.js (shared with the pages that show data ages)

  function ensure(S) {
    var d = TE.defaults(); if (!S.e) S.e = d;
    S.e.acct = Object.assign({}, d.acct, S.e.acct || {}); S.e.acct.limits = Object.assign({}, d.acct.limits, S.e.acct.limits || {}); S.e.classes = Object.assign({}, d.classes, S.e.classes || {});
    if (!S.e.ev || typeof S.e.ev !== 'object') S.e.ev = { on: true, k: {}, v: 2 }; if (!S.e.ev.k) S.e.ev.k = {}; if (S.e.ev.v !== 2) { S.e.ev.v = 2; S.e.ev.on = true; delete S.e.ev.k.X; }   // strict mode is the default: models without a study do not vote
    (function () { var Bk = Hub.tradeBank, m = {}; if (!Bk || !Bk.EV) return; Object.keys(TE.BASEW).forEach(function (id) { var e = Bk.EV[id]; if (!e || Bk.MULT[e.g] == null) return; var k = S.e.ev.k[e.g]; m[id] = k !== '' && k != null && isFinite(Number(k)) ? Number(k) : Bk.MULT[e.g]; }); S.e.ev.m = m; })();
    ['news', 'positions'].forEach(function (k) { if (!Array.isArray(S.e[k])) S.e[k] = []; }); ['w', 'off'].forEach(function (k) { if (!S.e[k] || typeof S.e[k] !== 'object') S.e[k] = {}; });
    ['mode', 'market', 'minConf', 'strongConf'].forEach(function (k) { if (S.e[k] == null) S.e[k] = d[k]; });
    S.e.learn = Object.assign({ wr: {}, block: {}, riskMult: 1, log: [], auto: false }, S.e.learn || {});
    S.e.val = Object.assign({ gate: 'strict', th: {}, db: null, reg: {}, hist: [] }, S.e.val || {}); if (!S.e.val.th) S.e.val.th = {}; if (!S.e.val.reg) S.e.val.reg = {}; if (!Array.isArray(S.e.val.hist)) S.e.val.hist = [];
    if (!S.f) S.f = { type: 'act', cls: 'all', n: 30 };
    return S.e;
  }
  function list(a) { return h('ul', { class: 'studio-l' }, (a || []).filter(Boolean).map(function (x) { return h('li', { text: x }); })); }
  function table(head, rows, cls) { return h('div', { class: 'grid-wrap' }, [h('table', { class: 'grid aud se ' + (cls || '') }, [h('thead', null, [h('tr', null, head.map(function (t) { return h('th', { class: 'lbl', text: t }); }))]), h('tbody', null, rows.map(function (r) { return h('tr', r.attrs || null, (r.cells || r).map(function (c) { return c && c.nodeType ? h('td', null, [c]) : h('td', { class: 'small', style: 'white-space:normal', 'data-notr': '1', text: c == null ? '' : String(c) }); })); }))])]); }
  function chip(t, cls) { return h('span', { class: 'sev ' + (cls || 'sev-info'), 'data-notr': '1', text: t }); }
  function px(x, c) { return fa(x, c && (c.cls === 'fx' || c.unit === 'دلار') && Math.abs(x) < 100 ? 2 : 0); }
  function isArtifact() { return /claude\.ai|claudeusercontent|anthropic/.test(location.host); }
  var feed = SG.feed, loadFeed = SG.loadFeed, feedState = SG.feedState;
  function sigText(c) {
    var U2 = c.unit === 'دلار' ? ' دلار' : '';
    if (c.type === 'hold') return (c.candidate ? 'عدم صدور سیگنال — ' : 'نگه‌داری / بدون اقدام — ') + c.sym + ': ' + (c.why[0] || '') + '؛ ' + c.timing;
    return 'سیگنال ' + c.typeFa + ' ' + c.sym + ' (' + c.strength + '، ' + c.status + (c.val ? '، درجه ' + c.val.grade : '') + '): ورود ' + px(c.lo, c) + '–' + px(c.hi, c) + U2 + '، حد ضرر ' + px(c.stop, c) + '، هدف ۱ ' + px(c.tp1, c) + ' | هدف ۲ ' + px(c.tp2, c) + ' | هدف ۳ ' + px(c.tp3, c) +
      '، R:R تا هدف ۲ ≈ ۱:' + fa(c.rr2, 1) + '، حجم ' + pct(c.posPct, 1) + ' از سرمایه (ریسک ' + pct(c.riskPct, 2) + ')، اطمینان ' + fa(c.conf, 0) + '٪، افق ' + c.horizon.fa + '. دلایل: ' + c.top.slice(0, 4).map(function (x) { return x.why; }).join('؛ ') +
      '. ابطال: ' + c.inval.slice(0, 2).join('؛ ') + '.';
  }

  /* ---------- 1 · run, settings and data ---------- */
  function runTab(ctx) {
    var S = ctx.S, E = ensure(S), X = ctx.R.X, A = E.acct;
    var o = function (k, label, obj, key, opts, help) { return { key: k, label: label, options: opts, help: help, get: function () { return String(obj[key]); }, set: function (v) { obj[key] = v; } }; };
    var f = G.form({ id: 'te-run', onChange: ctx.rerender, fields: [{ type: 'head', label: 'بازار' },
      o('mk', 'قواعد بازار', E, 'market', [['iran', 'ایران (بدون فروش استقراضی، دامنهٔ نوسان، صف)'], ['global', 'جهانی (فروش استقراضی ارز مجاز اگر فعال شود)']]),
      { key: 'as', label: 'فروش استقراضی (فقط حالت جهانی)', options: [['no', 'خیر'], ['yes', 'بله']], get: function () { return E.allowShort ? 'yes' : 'no'; }, set: function (v) { E.allowShort = v === 'yes'; } },
      { type: 'head', label: 'حساب و قواعد ریسک' },
      ctx.field('eq', 'سرمایهٔ حساب (ریال؛ برای تعداد سهم و مبلغ ریسک)', 'e.acct.equity', 'num', { optional: true }),
      ctx.field('rp', 'ریسک هر معامله (درصد سرمایه)', 'e.acct.riskPct', 'pct'), ctx.field('mp', 'حداکثر وزن هر موقعیت', 'e.acct.maxPosPct', 'pct'),
      ctx.field('mh', 'حداکثر ریسک کل باز (heat)', 'e.acct.maxHeat', 'pct'), ctx.field('mn', 'حداکثر تعداد موقعیت', 'e.acct.maxPos', 'int'), ctx.field('sc', 'سقف وزن هر گروه صنعت', 'e.acct.sectorCap', 'pct'),
      ctx.field('rr', 'حداقل نسبت بازده به ریسک تا هدف ۲', 'e.acct.minRR', 'dec'), ctx.field('tv', 'نوسان هدف سالانهٔ هر موقعیت', 'e.acct.targetVol', 'pct'),
      { type: 'head', label: 'فرض‌های اجرایی بازار ایران (از مقررات روز بررسی کنید)' },
      { type: 'head', label: 'دامنهٔ نوسان روزانه بر حسب بازار (جدول واردشده توسط شما، آبان ۱۴۰۵؛ نسبت به قیمت پایانی روز قبل)' },
      ctx.field('l1', 'بورس تهران (بازار اول و دوم)', 'e.acct.limits.tse', 'pct'), ctx.field('l2', 'فرابورس (بازار اول و دوم)', 'e.acct.limits.ifb', 'pct'),
      ctx.field('l3', 'بازار پایه زرد', 'e.acct.limits.yellow', 'pct'), ctx.field('l4', 'بازار پایه نارنجی', 'e.acct.limits.orange', 'pct'), ctx.field('l5', 'بازار پایه قرمز (و پایهٔ با رنگ نامشخص)', 'e.acct.limits.red', 'pct'),
      ctx.field('l6', 'صندوق سهامی عادی (ETF)', 'e.acct.limits.etf', 'pct'), ctx.field('l7', 'صندوق سهامی اهرمی', 'e.acct.limits.lev', 'pct'), ctx.field('l8', 'صندوق طلا و کالایی (معمولاً؛ بسته به صندوق)', 'e.acct.limits.gold', 'pct'), ctx.field('l9', 'صندوق درآمد ثابت (معمولاً یا محدودتر)', 'e.acct.limits.fixed', 'pct'),
      ctx.field('lp', 'دامنه برای نماد با بازار نامشخص', 'e.acct.limitPct', 'pct'), ctx.field('cp', 'هزینهٔ رفت‌وبرگشت (کارمزد + مالیات + لغزش)', 'e.acct.costPct', 'pct2'),
      ctx.field('mv', 'حداقل میانگین ارزش معاملات روزانه (ریال)', 'e.acct.minVal', 'num'), ctx.field('lq', 'حداکثر سهم موقعیت از ارزش معاملات روزانه', 'e.acct.liqPct', 'pct'),
      { type: 'head', label: 'آستانه‌های سیگنال' }, ctx.field('c1', 'حداقل اطمینان برای سیگنال (متوسط)', 'e.minConf', 'dec'), ctx.field('c2', 'اطمینان سیگنال قوی (به‌علاوهٔ هم‌سویی ≥ ۳ خانوادهٔ مدل)', 'e.strongConf', 'dec')] });
    var boxes = h('div', { class: 'row-ctl', style: 'flex-wrap:wrap' }, ['stock', 'gold', 'fx', 'option'].map(function (k) { var cb = h('input', { type: 'checkbox', 'aria-label': CLS[k] }); cb.checked = E.classes[k] !== false; cb.addEventListener('change', function () { E.classes[k] = cb.checked; ctx.rerender(); }); return h('label', { class: 'chk-l', style: 'margin-inline-end:14px' }, [cb, document.createTextNode(' ' + (k === 'stock' ? 'سهام و صندوق‌ها' : CLS[k]))]); }));
    var news = ctx.list({ id: 'te-news', path: 'e.news', onChange: ctx.rerender, newRow: function () { return { asset: '', dir: -0.5, impact: 'med', note: '', fresh: true }; }, cols: [
      { key: 'asset', label: 'نماد (* = همه)', kind: 'text' }, { key: 'dir', label: 'جهت (۱− منفی … ۱+ مثبت)', fmt: 'dec' },
      { key: 'impact', label: 'اثر', kind: 'select', options: function () { return [['low', 'کم'], ['med', 'متوسط'], ['high', 'زیاد (شوک)']]; } }, { key: 'note', label: 'خبر', kind: 'text' }, { key: 'fresh', label: 'تازه (امروز)', kind: 'bool' }] });
    return ctx.group([modePanel(ctx), ctx.panel('اجرا و تنظیمات', [h('p', { class: 'f-help', text: 'موتور از دادهٔ ذخیره‌شدهٔ ابزارهای سیگنال (سهام، طلا، ارز، اختیار) می‌خواند، ۲۳ مدل رأی‌دهنده را روی هر دارایی اجرا می‌کند و برای هر کدام یک سیگنال استاندارد با ورود، حد ضرر، اهداف، حجم، اطمینان، دلایل و شرایط ابطال می‌دهد. سیگنال بدون مدیریت ریسک صادر نمی‌شود. این ابزار توصیهٔ سرمایه‌گذاری نیست؛ تصمیم و اجرا با شماست.' }),
      boxes, f]), ctx.panel('داده‌ها', [Hub.dataCenterLink('دریافت و به‌روزرسانی داده فقط در «مرکز مدیریت داده‌ها» در زبانهٔ داشبورد انجام می‌شود.')]), Hub.dataSync && Hub.mdSyncTab ? Hub.mdSyncTab(ctx) : null, ctx.panel('اخبار و رویدادها (ورودی مدل احساسات)', [h('p', { class: 'f-help', text: 'خبر مهم را اینجا ثبت کنید. خبر «زیاد» و «تازه» سیگنال خرید را مشروط می‌کند (یا اگر منفی است، متوقف). موتور خبر را خودش نمی‌خواند؛ برای تحلیل خودکار متن خبر از پرامپت زبانهٔ گزارش استفاده کنید.' }), news])]);
  }
  // one action for everything: every feed in turn (a failed feed keeps its last good data and never stops the others),
  // then the engine cache is cleared and the validation is rerun on the new data, so the dashboard, signals, pulse and widget
  // all read the same fresh state.
  var UPD = { busy: false, lines: [], st: {} }, FRESH_MIN = 10;
  function seriesN(St) { return Object.keys((St && St.data) || {}).filter(function (k) { return k[0] !== '_'; }).length; }
  /* items received in this run: when a feed stamps its items (St.at per series, snap.*.at), count those stamped since t0 —
     a feed whose failures outnumber its stored series (global markets: 2 series + 4 snapshots, 8 failed lookups) no longer shows 0 received */
  function recvN(St, errs, t0) {
    var at = St && St.at, sn = (St && St.snap) || {};
    if (at && typeof at === 'object') { var n = 0; Object.keys(at).forEach(function (k) { if (at[k] >= t0) n++; }); Object.keys(sn).forEach(function (k) { if (sn[k] && sn[k].at >= t0) n++; }); return n; }
    return Math.max(0, seriesN(St) - errs.length);
  }
  /* update ID: one per run, written on every feed log, on the validation it triggered and on the run summary, so every section can tell
     which update its data and its calculations belong to (Tehran time, e.g. UPD-14050824-1347) */
  function updId(t) { var J = Hub.jalali, th = new Date(t + 3.5 * 36e5), p2 = function (x) { return (x < 10 ? '0' : '') + x; }, j = J ? J.d2j(J.g2d(th.getUTCFullYear(), th.getUTCMonth() + 1, th.getUTCDate())) : null;
    return 'UPD-' + (j ? j.jy + p2(j.jm) + p2(j.jd) : th.toISOString().slice(0, 10).replace(/-/g, '')) + '-' + p2(th.getUTCHours()) + p2(th.getUTCMinutes()); }   // Iran has no daylight saving since 1401: UTC+3:30
  function updateEverything(ctx, onDone, opt) {
    opt = opt || {};
    // on a phone the back-test validation is not run inside an update (≈ 2 GB of memory; iOS closes the page): data only, unless the
    // validation is asked for explicitly (opt.forceVal); the full validation comes from the computer through the data sync
    if (U.lite && U.lite() && !opt.forceVal && !opt.calcOnly) opt = Object.assign({}, opt, { dataOnly: true, liteAuto: true });
    /* phone viewer: «update» = the computer's latest published data (central record, gold / FX, news) + a light check of current prices
       against the central levels (alerts). No stock history and no engine run on the phone. */
    if (viewerMode() && !opt.forceVal && !opt.calcOnly) { if (UPD.busy) return; UPD.busy = true; var t0 = Date.now(), msg = [];
      var D = Hub.dataSync, SR = Hub.smartRefresh, step = function (p, lab) { return Promise.resolve(p).then(function (r) { msg.push(lab(r)); }, function (e) { msg.push(lab(null) + ' — ناموفق: ' + (e && e.message || e)); }); };
      step(D && D.pull ? D.pull(false) : null, function (r) { return r ? 'دادهٔ منتشرشدهٔ کامپیوتر: ' + (r.updated && r.updated.length ? fa(r.updated.length, 0) + ' مجموعهٔ تازه' : 'تغییری نبود') : 'دریافت از کامپیوتر'; })
        .then(function () { return step(SR && SR.light ? SR.light('tgju') : null, function (r) { return 'قیمت لحظه‌ای طلا و ارز بررسی شد'; }); })
        .then(function () { return step(SR && SR.light ? SR.light('tse') : null, function (r) { return 'قیمت لحظه‌ای بورس بررسی شد'; }); })
        .then(function () { UPD.busy = false; MEMO = null; U.toast('به‌روزرسانی سبک گوشی (' + fa((Date.now() - t0) / 1000, 0) + ' ثانیه): ' + msg.join(' · '), 'good'); if (ctx && ctx.rerender) ctx.rerender(); if (Hub.rerenderAll) Hub.rerenderAll(); if (onDone) onDone(true); });
      return; }
    if (UPD.busy) return; var TS = function () { return ctx.S || U.store.get('hub.tradingEngine.v1', null); }; UPD.busy = true; UPD.lines = []; UPD.st = {}; UPD.at = Date.now(); UPD.phase = 'fetch'; UPD.calcOk = undefined; UPD.id = updId(UPD.at); UPD.dataOnly = !!opt.dataOnly;
    try { var R0 = U.store.get('hub.updrun.v1', null) || {}; U.store.set('hub.updrun.v1', Object.assign({}, R0, { cur: { id: UPD.id, at: UPD.at, dataOnly: UPD.dataOnly, st: 'running' } })); } catch (e) { /* optional */ }
    var say = function (i, t, k) { UPD.lines[i] = { t: t, k: k || '' }; var el = document.getElementById('upd-log'); if (el) { U.clear(el); UPD.lines.forEach(function (l) { if (l) el.appendChild(h('p', { class: 'small ' + l.k, 'data-notr': '1', text: l.t })); }); } };
    // every data feed of the hub: trading feeds first, then the Iran-economy series, the temporal tool and anything else registered
    var seen = {}, q = FEEDIDS.map(feed).concat(SG.feeds).filter(function (f) { if (!f || seen[f.id]) return false; seen[f.id] = 1; return true; }), fails = 0, parts = 0;
    var NAME = function (f) { return FAT[f.id] || ({ 'sig-temporal': 'تحلیل زمانی (چرخه‌ها و پنجره‌ها)', 'long-view': 'تحلیل مالی اقتصاد ایران (سری‌ها)', 'sig-global': 'بازارهای جهانی و رمزارز (CoinGecko، نوبیتکس، OKX، Alpha Vantage)' })[f.id] || f.title; };
    q.reduce(function (p, f, i) { return p.then(function () {
      if (opt.calcOnly) { UPD.st[f.id] = 'fresh'; say(i, NAME(f) + ': دریافت نشد (فقط محاسبات روی دادهٔ موجود)', 'muted'); return; }
      var St = loadFeed(f), st0 = feedState(f), lg0 = (U.store.get(FLOG, {}) || {})[f.id];
      // fetched in the last 10 minutes with no error: still valid, not fetched again (the time it was fetched is shown)
      if (st0.live && isFinite(st0.age) && st0.age * 60 < FRESH_MIN && lg0 && lg0.ok && !lg0.msg) { UPD.st[f.id] = 'fresh'; say(i, NAME(f) + ': ' + fa(st0.age * 60, 0) + ' دقیقه پیش دریافت شده و معتبر است؛ دوباره دریافت نشد', 'good-t'); return; }
      UPD.st[f.id] = 'fetch'; say(i, NAME(f) + ' …'); var t0 = Date.now() - 1000;
      var tryOnce = function (k) { return SG.safeFetch(f.fetch, St, function (a, b, q) { say(i, NAME(f) + ' … ' + fa(a, 0) + ' / ' + fa(b, 0) + ' · ' + q); })
        .catch(function (e) { if (k > 0) throw e; say(i, NAME(f) + ': خطا (' + e.message + ')؛ تلاش دوباره …', 'warn-t'); return new Promise(function (r) { setTimeout(r, 2000); }).then(function () { St = loadFeed(f); return tryOnce(1); }); }); };
      return tryOnce(0)
        .then(function (errs) { U.store.set(f.storeKey, St); var n = seriesN(St); flog(f.id, true, errs.length ? 'بخشی ناموفق: ' + SG.summErr(errs) : (errs.notes && errs.notes.length ? errs.notes.join(' · ') : ''), { n: recvN(St, errs, t0), fail: errs.length, upd: UPD.id }); if (errs.length) parts++; UPD.st[f.id] = 'proc'; say(i, NAME(f) + (errs.length ? ': به‌روز شد، بخشی ناموفق — ' + SG.summErr(errs) : ': به‌روز شد'), errs.length ? 'warn-t' : 'good-t'); },
          function (e) { fails++; flog(f.id, false, e.message, { n: 0, fail: seriesN(St), upd: UPD.id }); UPD.st[f.id] = 'err'; say(i, NAME(f) + ': ناموفق، دادهٔ قبلی حفظ شد (جدید معرفی نمی‌شود) — ' + e.message, 'crit-t'); });
    }); }, Promise.resolve()).then(function () {
      // news feeds (economy section) and the live market inputs of the valuation models that were used before
      var k = q.length, jobs = []; if (opt.calcOnly) return;
      if (Hub.news && Hub.news.fetchAll) { var ES = U.store.get('hub.efi.v1', null), fd = ES && Array.isArray(ES.feeds) && ES.feeds.length ? ES.feeds : null; say(k, 'خبرها (خوراک‌های RSS) …');
        jobs.push(Hub.news.fetchAll(fd).then(function (r) { if (!r.ok) fails++; else if (r.ok < r.total) parts++; say(k, 'خبرها: ' + (r.ok ? fa(r.ok, 0) + ' از ' + fa(r.total, 0) + ' خوراک به‌روز شد' : 'هیچ خوراکی جواب نداد؛ خبرهای قبلی حفظ شد'), r.ok ? (r.ok < r.total ? 'warn-t' : 'good-t') : 'crit-t'); }, function (e) { fails++; say(k, 'خبرها: ناموفق — ' + e.message, 'crit-t'); })); }
      if (Hub.macro && Hub.macro.ITEMS) { var used = []; Object.keys(Hub.macro.ITEMS).forEach(function (it) { Object.keys(Hub.macro.ITEMS[it].sources || {}).forEach(function (sk) { var c = Hub.macro.current(it, sk); if (c && c.live) used.push([it, sk]); }); });
        if (used.length) { say(k + 1, 'ورودی‌های بازار مدل‌های ارزش‌گذاری (نرخ بدون ریسک، صرف ریسک، تورم) …');
          jobs.push(Promise.all(used.map(function (u) { return Hub.macro.refresh(u[0], u[1]).then(function () { return 0; }, function () { return 1; }); })).then(function (r) { var bad = r.reduce(function (a, b) { return a + b; }, 0); say(k + 1, 'ورودی‌های مدل‌های ارزش‌گذاری: ' + fa(used.length - bad, 0) + ' از ' + fa(used.length, 0) + ' به‌روز شد' + (bad ? ' (بقیه مقدار قبلی)' : ''), bad ? 'warn-t' : 'good-t'); })); } }
      return Promise.all(jobs);
    }).then(function () { q = q.concat([{}, {}]);
      if (Hub.dataSync) Hub.dataSync.notify(); TE.clearCache();
      UPD.phase = 'calc';
      if (!opt.calcOnly && !Object.keys(UPD.st).some(function (k) { return UPD.st[k] === 'proc'; })) { UPD.calcOk = null; say(q.length, 'هیچ دادهٔ تازه‌ای دریافت نشد؛ محاسبات وابسته دوباره اجرا نشد و نتایج قبلی با تاریخ خودشان باقی ماندند.', 'warn-t'); return; }
      if (UPD.dataOnly) { UPD.calcOk = false; say(q.length, 'فقط دریافت داده: بک‌تست و اعتبارسنجی اجرا نشد. سیگنال‌ها با دادهٔ تازه نمایش داده می‌شوند، اما وضعیت محاسبات «در انتظار تکمیل محاسبات» است تا «به‌روزرسانی کامل» یا «اجرای محاسبات» زده شود.', 'warn-t'); return; }
      /* directive 19 · 9 — smart recompute: the back-test and validation use official (closed) rows only. When this update added or
         revised no official row in any series and the stored validation matches the settings, it is not run again; signals are still
         re-judged below on the fresh prices. */
      var IGR = Hub.ingest ? Hub.ingest.runs().filter(function (r) { return r.at >= UPD.at; }) : [], offNew = IGR.reduce(function (a, r) { return a + (r.rowsAdded || 0) + (r.revised || 0) + (r.unknown ? 1 : 0); }, 0);
      var SV = TS() || sample(), EV = ensure(SV), dbOk = EV.val && EV.val.db && !EV.val.db.sample && TE.valSig && EV.val.db.sig === TE.valSig(EV);
      UPD.offNew = IGR.length ? offNew : null;
      if (!opt.forceVal && IGR.length && offNew === 0 && dbOk) { UPD.calcOk = true; UPD.valSkip = true; say(q.length, 'بک‌تست و اعتبارسنجی دوباره اجرا نشد: هیچ ردیف رسمی تازه یا اصلاح‌شده‌ای دریافت نشد و اعتبارسنجی قبلی با تنظیمات فعلی معتبر است (فقط سیگنال‌ها با قیمت تازه دوباره سنجیده می‌شوند).', 'good-t'); return; }
      UPD.valSkip = false;
      say(q.length, 'محاسبات وابسته: بک‌تست و اعتبارسنجی روی دادهٔ تازه …');
      var S0 = TS() || sample(), E = ensure(S0), lite = !!(S0.valRun && (S0.valRun.st === 'running' || (S0.valRun.lite && S0.valRun.st === 'ok'))); S0.valRun = { at: Date.now(), st: 'running', lite: lite }; try { U.store.set('hub.tradingEngine.v1', S0); } catch (e) { /* full */ }
      return TE.validateAsync(E, undefined, S0.j || [], function (i, n, ph) { S0.valRun.i = i; S0.valRun.n = n; if (S0.valRun.ph !== ph) { S0.valRun.ph = ph; try { U.store.set('hub.tradingEngine.v1', S0); } catch (e) { /* full */ } } }, { lite: lite }).then(function (r) { BT = r.bt; BTkey = btKey(E); if (E.val.db) E.val.db.upd = opt.calcOnly ? ((U.store.get('hub.updrun.v1', null) || {}).id || UPD.id) : UPD.id; S0.valRun = { at: Date.now(), st: E.val.db ? 'ok' : 'nodata', msg: 'نتیجه‌ای ثبت نشد', lite: lite, upd: UPD.id };
        try { U.store.set('hub.tradingEngine.v1', S0); } catch (e) { /* full */ } say(q.length, 'اعتبارسنجی نسخهٔ ' + fa(E.val.db ? E.val.db.ver : 0, 0) + ' انجام شد.', 'good-t'); UPD.calcOk = true; },
        function (e) { S0.valRun = { at: Date.now(), st: 'err', msg: String(e && e.message || e) }; try { U.store.set('hub.tradingEngine.v1', S0); } catch (e2) { /* full */ } say(q.length, 'اعتبارسنجی ناموفق: ' + e.message, 'crit-t'); UPD.calcOk = false; });
    }).then(function () {
      // signal validation is part of every update, also «data only»: each signal is re-judged against the new prices and the central
      // record (one status and one action per asset) is rebuilt and stored for every section. Back-test (strategy history) and
      // signal validation (is today's call still valid) are reported separately.
      try { TE.clearCache(); var S1 = TS() || sample(), R1 = TE.run(ensure(S1), undefined, { upd: UPD.id }), C1 = R1.centralSaved, cnt = {}, CB = R1.central ? R1.central.by : {};
        Object.keys(CB).forEach(function (k) { cnt[CB[k].st] = (cnt[CB[k].st] || 0) + 1; });
        var ST6 = { ok: 'تأییدشده', cond: 'مشروط', review: 'نیازمند بررسی مجدد', rej: 'ردشده', exp: 'منقضی‌شده', nodata: 'فاقد دادهٔ کافی' };
        UPD.sigVal = { at: Date.now(), cnt: cnt, changes: C1 && C1.changes ? C1.changes.length : 0, crit: R1.consistency ? R1.consistency.crit : 0, bt: UPD.calcOk === true ? 'اجرا شد' : UPD.dataOnly ? 'اجرا نشد (فقط داده)' : 'بدون تغییر' };
        say(q.length, 'اعتبارسنجی سیگنال‌ها با دادهٔ تازه: ' + Object.keys(ST6).map(function (k) { return ST6[k] + ' ' + fa(cnt[k] || 0, 0); }).join(' · ') + ' — تغییر وضعیت: ' + fa(UPD.sigVal.changes, 0) + (UPD.sigVal.crit ? ' — ' + fa(UPD.sigVal.crit, 0) + ' مغایرت اثرگذار' : ' — بدون مغایرت') + ' · بک‌تست: ' + UPD.sigVal.bt, 'good-t'); }
      catch (e) { UPD.sigVal = { at: Date.now(), err: e.message }; say(q.length, 'اعتبارسنجی سیگنال‌ها ناموفق: ' + e.message, 'crit-t'); }
    }).then(function () {
      var DS = Hub.dataSync, c = DS ? DS.cfg() : {}; if (!DS || !c.token || !c.widgetAuto || UPD.dataOnly) return;
      say(q.length + 1, 'انتشار دادهٔ ویجت …'); TE.clearCache();
      try { var W = TE.run(ensure(TS() || sample())).widget(); return DS.publishWidget(W).then(function () { say(q.length + 1, 'دادهٔ ویجت منتشر شد؛ ویجت در تازه‌سازی بعدی iOS آن را می‌خواند (معمولاً چند تا چند ده دقیقه).', 'good-t'); }, function (e) { say(q.length + 1, 'انتشار ویجت ناموفق: ' + e.message, 'crit-t'); }); } catch (e) { say(q.length + 1, 'انتشار ویجت ناموفق: ' + e.message, 'crit-t'); }
    }).then(function () {
      // dependent calculations: auditor result, caches; then the run summary the data center shows
      try { if (Hub.auditCore) Hub.auditCore.reset(); TE.clearCache(); } catch (e) { /* optional */ }
      Object.keys(UPD.st).forEach(function (k) { if (UPD.st[k] === 'proc') UPD.st[k] = UPD.calcOk === false ? 'pend' : 'ok'; });
      try { var PR = U.store.get('hub.updrun.v1', null) || {}; U.store.set('hub.updrun.v1', opt.calcOnly ? Object.assign({}, PR, { cur: null, calcId: UPD.calcOk ? PR.id || UPD.id : PR.calcId, sigVal: UPD.sigVal }) : { id: UPD.id, at: UPD.at, doneAt: Date.now(), st: UPD.st, calcOk: UPD.calcOk === null ? null : UPD.calcOk !== false, dataOnly: UPD.dataOnly, fails: fails, nFeeds: q.length - 2, nOk: Object.keys(UPD.st).filter(function (k) { return UPD.st[k] === 'ok' || UPD.st[k] === 'fresh' || UPD.st[k] === 'pend'; }).length, nErr: Object.keys(UPD.st).filter(function (k) { return UPD.st[k] === 'err'; }).length, calcId: UPD.calcOk ? UPD.id : (PR.calcId || null), sigVal: UPD.sigVal }); } catch (e) { /* optional */ }
      UPD.phase = 'done'; UPD.busy = false; UPD.doneAt = Date.now(); U.toast(fails ? fa(fails, 0) + ' منبع ناموفق بود؛ بقیه به‌روز شد.' : parts ? 'به‌روز شد، ولی ' + fa(parts, 0) + ' بخش ناقص ماند (جزئیات در جدول).' : 'همه‌چیز به‌روز شد.', fails || parts ? 'warn' : 'good'); ctx.rerender(); if (onDone) onDone(); });
    ctx.rerender();
  }
  function updPanel(ctx, compact) {
    var b = h('button', { class: 'btn primary', type: 'button', text: UPD.busy ? 'در حال به‌روزرسانی…' : 'به‌روزرسانی همهٔ بخش‌ها (همهٔ داده‌ها + اعتبارسنجی)', disabled: UPD.busy, onclick: function () { updateEverything(ctx); } });
    var log = h('div', { id: 'upd-log', 'aria-live': 'polite' }, UPD.lines.filter(Boolean).map(function (l) { return h('p', { class: 'small ' + l.k, 'data-notr': '1', text: l.t }); }));
    var ages = SG.agesText();
    var NS = Hub.news && Hub.news.store ? Hub.news.store() : null; if (NS && NS.meta && NS.meta.asOfTs) ages += ' · خبرها: ' + SG.ageText((Date.now() - NS.meta.asOfTs) / 3600e3);
    return h('div', { class: 'upd-box' }, [h('div', { class: 'row-ctl' }, [b]), h('p', { class: 'small muted', text: 'سن داده‌ها: ' + ages }), log]);
  }
  // shared by every section: one button, one update of all feeds, news, valuation inputs, validation and widget
  Hub.updateAll = function (rerender, opt, onDone) { if (UPD.busy) return false; updateEverything({ S: null, rerender: rerender || function () {} }, onDone, opt); return true; };
  Hub.updateBusy = function () { return !!UPD.busy; };
  Hub.updateAllPanel = function (ctx) { var p = updPanel({ S: null, rerender: ctx && ctx.rerender ? ctx.rerender : function () {} }), b = p.querySelector('button'); if (b) b.replaceWith(Hub.dataCenterLink()); return p; };
  /* ---------- central data management: the only place where data is fetched ----------
     every feed with its source, fetch time, market reference time, time zone and price basis, unit, status and last errors;
     group buttons per market; one "update everything"; company statements status. Other sections only link here. */
  var FLOG = 'hub.feedlog.v1';
  function flog(id, ok, msg, x) { try { var L = U.store.get(FLOG, {}) || {}; L[id] = Object.assign({ at: Date.now(), ok: ok, msg: msg || '' }, x || {}); U.store.set(FLOG, L); } catch (e) { /* optional */ } }
  var FMETA = { 'sig-stocks': { cal: 'stock', unit: 'ریال؛ شاخص بر حسب واحد شاخص' }, 'sig-gold': { cal: 'gold', unit: 'ریال؛ انس بر حسب دلار' }, 'sig-fx': { cal: 'fx', unit: 'ریال' }, 'sig-options': { cal: 'stock', unit: 'ریال' },
    'sig-global': { cal: 'crypto', unit: 'دلار', note: 'رمزارز: نقطهٔ ۰۰:۰۰ UTC (CoinGecko)؛ کالا و انرژی: روز کاری Alpha Vantage' }, 'long-view': { cal: 'tgju', unit: 'به تفکیک سری' }, 'sig-temporal': { cal: 'tgju', unit: 'به تفکیک سری' } };
  function feedName(f) { return FAT[f.id] || ({ 'sig-temporal': 'تحلیل زمانی (چرخه‌ها و پنجره‌ها)', 'long-view': 'سری‌های اقتصاد ایران', 'sig-global': 'رمزارز و بازارهای جهانی (کالا، انرژی، نرخ)' })[f.id] || f.title || f.id; }
  // latest market date inside a feed's data (yyyymmdd), whatever the layout: arrays of rows or { px: rows }
  function mktDate(S) { var m = 0, walk = function (v) { var rows = Array.isArray(v) ? v : v && Array.isArray(v.px) ? v.px : v && Array.isArray(v.rows) ? v.rows : null; if (rows && rows.length) { var d = +(rows[rows.length - 1].date || (Array.isArray(rows[rows.length - 1]) ? rows[rows.length - 1][0] : 0)); if (d > 19000101 && d < 21000101 && d > m) m = d; } };
    Object.keys((S && S.data) || {}).forEach(function (k) { var v = S.data[k]; walk(v); if (v && typeof v === 'object' && !Array.isArray(v) && !v.px && !v.rows) Object.keys(v).forEach(function (q) { walk(v[q]); }); }); return m; }
  /* ===================== DATA UPDATE CENTER (one page, one command) =====================
     The command fetches every source, checks it, stores it in the shared stores, then re-runs what depends on it
     (back-test and validation, auditor result, caches) and records the outcome per data group. Every other section reads
     the same stores and shows only the time and validity of its data. */
  var DEPS = [
    { id: 'sig-stocks', data: 'قیمت و معاملات سهام، صندوق‌ها، شاخص‌ها', deps: ['تحلیل تکنیکال و روند', 'سطوح حمایت/مقاومت و تأیید', 'سیگنال و ورود/خروج/حد ضرر', 'رتبه‌بندی فرصت‌ها و سهام', 'بک‌تست و اعتبارسنجی', 'داشبورد و پیش‌بینی شاخص'], calc: true },
    { id: 'sig-fx', data: 'دلار، ارزها و تتر', deps: ['تحلیل ارز', 'طلا (حباب و ارزش ذاتی)', 'سری دلاری سهام', 'بک‌تست و اعتبارسنجی', 'داشبورد'], calc: true },
    { id: 'sig-gold', data: 'طلا، سکه و انس', deps: ['تحلیل طلا و سکه', 'استراتژی حباب طلا (XG1)', 'فرصت‌های معاملاتی', 'بک‌تست و اعتبارسنجی'], calc: true },
    { id: 'sig-global', data: 'بیت‌کوین، اتریوم، نفت، گاز، نرخ بهرهٔ آمریکا', deps: ['تحلیل رمزارز و کالا', 'سیگنال و فرصت‌ها', 'بک‌تست', 'نمای کلی بازارها'], calc: true },
    { id: 'sig-options', data: 'اختیار معامله', deps: ['سیگنال اختیار', 'داشبورد'], calc: true },
    { id: 'long-view', data: 'سری‌های اقتصاد ایران', deps: ['تحلیل سه‌افقی بازارهای ایران', 'گزارش اقتصاد ایران (EFI)', 'تاریخ‌های کلیدی و سناریوها'] },
    { id: 'sig-temporal', data: 'سری تحلیل زمانی', deps: ['چرخه‌ها و پنجره‌های زمانی'] },
    { id: 'macro', data: 'نرخ بدون ریسک، صرف ریسک، تورم (ورودی ارزش‌گذاری)', deps: ['DCF و WACC', 'هزینهٔ سرمایه', 'تأمین مالی'] },
    { id: 'news', data: 'خبرها (خوراک RSS)', deps: ['مدل احساسات', 'گزارش اقتصاد ایران'] },
    { id: 'company', data: 'صورت‌های مالی شرکت (فایل)', deps: ['حسابرس سخت‌گیر', 'ارزش‌گذاری و مدل شرکت', 'تأمین مالی و ظرفیت بدهی'] }];
  Hub.dataDeps = { list: DEPS, register: function (d) { if (d && d.id && !DEPS.some(function (x) { return x.id === d.id; })) DEPS.push(d); } };
  // what the directive asks to cover, and whether a source is connected; nothing is estimated where no source exists
  var COVER = [['سهام، صندوق‌ها و ETF: قیمت، آخرین معامله، پایانی، حجم و ارزش', 'متصل', 'TSETMC'], ['شاخص کل و هم‌وزن', 'متصل', 'TSETMC'], ['سایر شاخص‌های بورس (صنعت، فرابورس)', 'وصل نیست', '—'],
    ['دلار، ارزهای اصلی و تتر', 'متصل', 'TGJU'], ['طلای داخلی، سکه و انس', 'متصل', 'TGJU'], ['بیت‌کوین و اتریوم (قیمت دلاری، تاریخچه)', 'متصل', 'CoinGecko'], ['حجم و ارزش بازار رمزارز', 'وصل نیست', 'CoinGecko در این نسخه فقط قیمت'],
    ['نفت، گاز، مس، آلومینیوم، نرخ بهره و اوراق آمریکا', 'متصل (با کلید Alpha Vantage)', 'Alpha Vantage'], ['شاخص‌های سهام بین‌المللی', 'وصل نیست', '—'], ['دادهٔ کلان (تورم و…)', 'بخشی (ورودی‌های ارزش‌گذاری)', 'منابع تنظیم‌شده در «منابع داده و کلیدها»'],
    ['صورت‌های مالی و گزارش‌های کدال، ماهانه، تولید و فروش، اطلاعیه‌ها، مجامع', 'وصل نیست', 'فقط از فایل Excel/PDF شما'], ['سود تقسیمی و افزایش سرمایه', 'وصل نیست', 'تعدیل قیمت از قیمت دیروز TSETMC انجام می‌شود'],
    ['مقررات و ابزارهای تأمین مالی، نرخ‌ها', 'نسخهٔ ذخیره‌شده در برنامه', 'تاریخ هر قاعده در موتور انطباق ذکر شده؛ به‌روزرسانی خودکار ندارد']];
  var ST8D = { none: ['به‌روزرسانی نشده', 'none'], fetch: ['در حال دریافت', 'stale'], proc: ['در حال پردازش', 'stale'], ok: ['به‌روزرسانی موفق', 'fresh'], part: ['به‌روزرسانی ناقص', 'stale'], err: ['خطا در دریافت', 'none'], old: ['داده قدیمی یا نامعتبر', 'none'], pend: ['در انتظار تکمیل محاسبات', 'stale'], fresh: ['معتبر (دوباره دریافت نشد)', 'fresh'] };
  function valAt() { var T = U.store.get('hub.tradingEngine.v1', null), db = T && T.e && T.e.val && T.e.val.db; return db && !db.sample ? db.at : 0; }
  function groupState(f, lg) {
    var st = feedState(f), cur = UPD.busy ? UPD.st[f.id] : null, dep = DEPS.filter(function (d) { return d.id === f.id; })[0];
    if (cur === 'fetch' || cur === 'proc') return cur;
    if (lg && !lg.ok) return 'err'; if (!st.live) return 'none'; if (st.k === 'stale') return 'old';
    if (dep && dep.calc && st.S.meta.asOfTs && valAt() < st.S.meta.asOfTs) return 'pend';
    if (lg && lg.msg) return 'part'; return 'ok';
  }
  function centerPage(ctx) {
    var uctx = { S: null, rerender: ctx.rerender }, LG = U.store.get(FLOG, {}) || {}, RUN = U.store.get('hub.updrun.v1', null), MC = Hub.mktCal;
    var sn = {}, all = FEEDIDS.map(feed).concat(SG.feeds).filter(function (f) { if (!f || sn[f.id]) return false; sn[f.id] = 1; return true; });
    var states = all.map(function (f) { return groupState(f, LG[f.id]); }), cnt = {}; states.forEach(function (k) { cnt[k] = (cnt[k] || 0) + 1; });
    var big = h('button', { class: 'btn primary', type: 'button', style: 'font-size:1.05rem;padding:.7rem 1.2rem', text: UPD.busy ? 'در حال به‌روزرسانی…' : 'به‌روزرسانی کامل تمام اطلاعات', disabled: UPD.busy, onclick: function () { updateEverything(uctx); } });
    var dOnly = h('button', { class: 'btn', type: 'button', text: 'فقط دریافت داده (بدون بک‌تست)', disabled: UPD.busy, title: 'سبک برای گوشی: داده‌ها دریافت و ذخیره می‌شوند؛ بک‌تست و اعتبارسنجی بعداً', onclick: function () { updateEverything(uctx, null, { dataOnly: true }); } });
    var calcOnly = h('button', { class: 'btn ghost', type: 'button', text: 'فقط اجرای محاسبات روی دادهٔ موجود', disabled: UPD.busy, onclick: function () { updateEverything(uctx, null, { calcOnly: true }); } });
    // a run that did not finish (the page was closed or the phone reloaded it): resume; feeds fetched in the last 10 minutes are not fetched again
    var resume = !UPD.busy && RUN && RUN.cur && RUN.cur.st === 'running' ? h('div', { class: 'callout warn' }, [h('p', { text: 'به‌روزرسانی ' + RUN.cur.id + ' (شروع ' + new Date(RUN.cur.at).toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' }) + ') ناتمام ماند. ادامهٔ آن منابعی را که در ۱۰ دقیقهٔ اخیر دریافت شده‌اند دوباره دریافت نمی‌کند.' }),
      h('button', { class: 'btn primary', type: 'button', text: 'ادامهٔ به‌روزرسانی ناتمام', onclick: function () { updateEverything(uctx, null, { dataOnly: !!RUN.cur.dataOnly }); } })]) : null;
    // one clock for the page: now, last session, last fetch, last calculation (stored in UTC, shown in Tehran time)
    var tz = { timeZone: 'Asia/Tehran' }, fS = all.filter(function (f) { return f.id === 'sig-stocks'; })[0], stS = fS ? feedState(fS) : null, ses = stS && stS.live ? stS.S.meta.session : null;
    var T0 = U.store.get('hub.tradingEngine.v1', null), vdb = T0 && T0.e && T0.e.val && T0.e.val.db && !T0.e.val.db.sample ? T0.e.val.db : null;
    var clock = h('div', { class: 'grid-2' }, [table(['زمان', 'مقدار'], [
      ['اکنون (تهران)', new Date().toLocaleString('fa-IR', tz)],
      ['آخرین جلسهٔ معاملاتی بورس', ses ? (MC ? MC.faDate(ses.date) : ses.date) + (ses.time ? '، ساعت ' + ses.time : '') + ' — ' + (ses.stateFa || ses.state) + ' (' + fa(ses.live || 0, 0) + ' نماد با قیمت همین جلسه)' : 'دریافت نشده'],
      ['آخرین به‌روزرسانی موفق', RUN && RUN.doneAt ? new Date(RUN.doneAt).toLocaleString('fa-IR', tz) + ' · شناسه ' + (RUN.id || '—') + (RUN.dataOnly ? ' (فقط داده)' : '') : '—'],
      ['اعتبارسنجی سیگنال‌ها با دادهٔ تازه (در هر به‌روزرسانی)', RUN && RUN.sigVal ? (RUN.sigVal.err ? 'ناموفق: ' + RUN.sigVal.err : new Date(RUN.sigVal.at).toLocaleString('fa-IR', tz) + ' · ' + [['ok', 'تأییدشده'], ['cond', 'مشروط'], ['review', 'بررسی مجدد'], ['rej', 'ردشده'], ['exp', 'منقضی'], ['nodata', 'فاقد داده']].map(function (q) { return q[1] + ' ' + fa(RUN.sigVal.cnt[q[0]] || 0, 0); }).join(' · ') + ' · تغییر وضعیت ' + fa(RUN.sigVal.changes, 0) + (RUN.sigVal.crit ? ' · ' + fa(RUN.sigVal.crit, 0) + ' مغایرت' : ' · بدون مغایرت')) : 'هنوز با این نسخه اجرا نشده'],
      ['آخرین بک‌تست استراتژی‌ها (جدا از اعتبارسنجی سیگنال)', vdb ? new Date(vdb.at).toLocaleString('fa-IR', tz) + ' · نسخهٔ ' + fa(vdb.ver, 0) + ' · شناسه ' + (vdb.upd || 'پیش از شناسه‌گذاری') : 'اجرا نشده'],
      ['همگام‌سازی داده و محاسبات', RUN && RUN.id && vdb ? (vdb.upd === RUN.id ? 'هم‌نسخه: داده و محاسبات هر دو از ' + RUN.id : 'در انتظار همگام‌سازی: داده از ' + RUN.id + '، محاسبات از ' + (vdb.upd || 'اجرای قبلی') + ' — «به‌روزرسانی کامل» یا «اجرای محاسبات»') : '—'],
      ['منابع در آخرین اجرا', RUN && RUN.nFeeds ? fa(RUN.nFeeds, 0) + ' بررسی‌شده · ' + fa(RUN.nOk || 0, 0) + ' موفق · ' + fa(RUN.nErr || 0, 0) + ' ناموفق' : '—']])]);
    var nL = UPD.lines.filter(Boolean).length, tot = all.length + 3, pr = UPD.busy ? Math.min(99, Math.round(100 * nL / tot)) : RUN ? 100 : 0;
    var bar = h('div', { style: 'height:8px;border-radius:4px;background:var(--line);overflow:hidden' }, [h('div', { style: 'height:100%;width:' + pr + '%;background:var(--accent, #d9a441)' })]);
    var phase = UPD.busy ? ({ fetch: 'مرحلهٔ ۱ از ۳: دریافت و بررسی داده‌ها', calc: 'مرحلهٔ ۲ از ۳: محاسبات وابسته (بک‌تست، اعتبارسنجی، حسابرس)', done: 'پایان' })[UPD.phase] || '' : RUN ? 'آخرین اجرای کامل: ' + new Date(RUN.at).toLocaleString('fa-IR') + ' تا ' + new Date(RUN.doneAt).toLocaleString('fa-IR') + (RUN.fails ? ' · ' + fa(RUN.fails, 0) + ' منبع ناموفق' : ' · همهٔ منابع موفق') + (RUN.calcOk === null ? ' · دادهٔ تازه‌ای نیامد؛ محاسبات دوباره اجرا نشد' : RUN.calcOk ? ' · محاسبات وابسته کامل' : ' · محاسبات وابسته ناقص (دادهٔ تازه دریافت شد ولی اعتبارسنجی کامل نشد)') : 'هنوز به‌روزرسانی کاملی اجرا نشده است';
    var sumTxt = Object.keys(cnt).map(function (k) { return ST8D[k][0] + ': ' + fa(cnt[k], 0); }).join(' · ');
    var p1 = ctx.panel('مرکز دریافت و به‌روزرسانی داده‌ها', [h('p', { class: 'f-help', text: 'یک فرمان: همهٔ منابع دریافت و بررسی می‌شوند، دادهٔ معتبر در مخزن مشترک ثبت می‌شود و همهٔ محاسبات وابسته (سیگنال‌ها، سطوح، رتبه‌بندی، بک‌تست و اعتبارسنجی، حسابرس، داشبورد و گزارش‌ها) با دادهٔ تازه دوباره اجرا می‌شوند. هیچ بخش دیگری دکمهٔ دریافت جداگانه ندارد.' }),
      h('div', { class: 'row-ctl' }, [big, dOnly, calcOnly]), resume, bar, h('p', { class: 'small', 'data-notr': '1', text: phase }), clock, h('p', { class: 'small', 'data-notr': '1', text: 'وضعیت گروه‌ها: ' + sumTxt }),
      h('div', { id: 'upd-log', 'aria-live': 'polite' }, UPD.lines.filter(Boolean).map(function (l) { return h('p', { class: 'small ' + l.k, 'data-notr': '1', text: l.t }); })),
      h('p', { class: 'small muted', text: 'منبعی که در ۱۰ دقیقهٔ اخیر بی‌خطا دریافت شده دوباره دریافت نمی‌شود (زمان دریافتش نمایش داده می‌شود). منبع ناموفق یک بار دیگر آزموده می‌شود؛ اگر باز ناموفق بود، آخرین دادهٔ معتبر با تاریخ خودش حفظ می‌شود و جدید معرفی نمی‌شود؛ دادهٔ ساختگی جایگزین نمی‌شود.' })]);
    // status of every data group
    var rows = all.map(function (f, i) { var st = feedState(f), lg = LG[f.id], k = states[i], dep = DEPS.filter(function (d) { return d.id === f.id; })[0], md = st.live ? mktDate(st.S) : 0, va = valAt();
      return [feedName(f), f.src || '—', st.live ? (st.S.meta.asOf || '—') + ' (' + SG.ageText(st.age) + ')' : '—', md ? (MC ? MC.faDate(md) : md) : '—', h('span', { class: 'data-age ' + ST8D[k][1], text: ST8D[k][0] }),
        lg && lg.n != null ? fa(lg.n, 0) + ' / ' + fa(lg.fail || 0, 0) : '—', !st.live ? 'نمونه — برای تصمیم معتبر نیست' : st.k === 'stale' ? 'کهنه (بیش از ' + fa(SG.maxAgeH(), 0) + ' ساعت)' : 'تازه',
        dep && dep.calc ? (va && st.S.meta.asOfTs && va >= st.S.meta.asOfTs ? 'بک‌تست/اعتبارسنجی به‌روز (' + new Date(va).toLocaleString('fa-IR') + ')' : 'بک‌تست/اعتبارسنجی هنوز روی این داده اجرا نشده') + '؛ بقیه هنگام نمایش از همین داده' : 'هنگام نمایش از همین داده محاسبه می‌شود',
        lg ? new Date(lg.at).toLocaleString('fa-IR') + (lg.ok ? '' : ' — ' + lg.msg) : '—']; });
    var NS = Hub.news && Hub.news.store ? Hub.news.store() : null, nAt = NS && NS.meta && NS.meta.asOfTs;
    rows.push(['خبرها (خوراک RSS)', 'خوراک‌های تنظیم‌شده', nAt ? new Date(nAt).toLocaleString('fa-IR') : '—', '—', h('span', { class: 'data-age ' + (nAt ? ((Date.now() - nAt) / 36e5 > SG.maxAgeH() ? 'stale' : 'fresh') : 'none'), text: nAt ? ((Date.now() - nAt) / 36e5 > SG.maxAgeH() ? 'داده قدیمی' : 'به‌روزرسانی موفق') : 'به‌روزرسانی نشده' }), '—', '—', 'مدل احساسات و گزارش اقتصاد هنگام نمایش', '—']);
    var rec = Hub.companyData && Hub.companyData.get(), AR = rec && Hub.auditCore ? Hub.auditCore.result() : null;
    rows.push(['صورت‌های مالی شرکت', 'فایل Excel/PDF', rec ? rec.savedAt : '—', rec && rec.blocks[0] ? rec.blocks[0].years.join('، ') : '—', h('span', { class: 'data-age ' + (rec ? 'fresh' : 'none'), text: rec ? 'واردشده' : 'به‌روزرسانی نشده' }), rec ? fa(rec.blocks.length, 0) + ' صورت' : '—', rec ? 'از فایل' : '—', AR ? 'حسابرس ' + AR.id + ' (خودکار با هر فایل)' : '—', rec ? rec.savedAt : '—']);
    var p2 = ctx.panel('وضعیت هر گروه داده', [table(['گروه داده', 'منبع', 'آخرین دریافت', 'زمان مرجع داده (آخرین تاریخ بازار)', 'وضعیت', 'دریافت‌شده / ناموفق', 'اعتبار داده', 'محاسبات وابسته', 'زمان آخرین تکمیل'], rows)]);
    var p3 = ctx.panel('نقشهٔ وابستگی داده‌ها', [table(['داده', 'بخش‌های وابسته (پس از به‌روزرسانی دوباره محاسبه می‌شوند)'], DEPS.map(function (d) { return [d.data, d.deps.join('، ')]; })), h('p', { class: 'small muted', text: 'بخش تازه با Hub.dataDeps.register به این نقشه و به فرمان به‌روزرسانی کامل وصل می‌شود؛ هر منبعی که در فهرست منابع ثبت شود خودکار در فرمان کامل قرار می‌گیرد.' })]);
    var p4 = ctx.panel('پوشش منابع', [table(['اطلاعات', 'وضعیت منبع', 'منبع / توضیح'], COVER), h('p', { class: 'small muted', text: 'برای اطلاعاتی که منبع ماشین‌خوان وصل نیست، داده‌ای ساخته یا تخمین زده نمی‌شود.' })]);
    // automatic refresh while the page is open
    var A = U.store.get(AKEY, { on: false, min: 60, calc: false }), on = h('input', { type: 'checkbox', 'aria-label': 'auto' }), calc = h('input', { type: 'checkbox', 'aria-label': 'calc' }), mins = h('select', { class: 'f-sel', 'aria-label': 'فاصله' }, [[30, '۳۰ دقیقه'], [60, '۱ ساعت'], [180, '۳ ساعت'], [360, '۶ ساعت']].map(function (o) { return h('option', { value: String(o[0]), text: o[1] }); }));
    on.checked = !!A.on; calc.checked = !!A.calc; mins.value = String(A.min || 60); var saveA = function () { U.store.set(AKEY, { on: on.checked, min: +mins.value, calc: calc.checked }); U.toast('تنظیم به‌روزرسانی خودکار ذخیره شد.', 'good'); };
    [on, calc, mins].forEach(function (el) { el.addEventListener('change', saveA); });
    var p5 = ctx.panel('به‌روزرسانی خودکار (فقط وقتی برنامه باز است)', [h('label', { class: 'small' }, [on, ' فعال']), h('label', { class: 'small' }, [' هر ', mins]), h('label', { class: 'small' }, [calc, ' همراه با بک‌تست و اعتبارسنجی (سنگین؛ روی گوشی توصیه نمی‌شود)']),
      h('p', { class: 'small muted', text: 'در هر نوبت فقط منابعی که از آستانهٔ تازگی گذشته‌اند دریافت می‌شوند. بازارهای ۲۴ ساعته (رمزارز) و بورس ایران با همین فاصله بررسی می‌شوند؛ دادهٔ بورس فقط پس از ثبت جلسهٔ تازه در TSETMC تغییر می‌کند. وقتی برنامه بسته است، مرورگر اجازهٔ اجرا نمی‌دهد. فرمان دستی همیشه در دسترس است.' })]);
    var det = h('details', { class: 'fold' }, [h('summary', { text: 'جزئیات منابع، دریافت یک گروه و ابزار نمادها (برای بررسی خطا؛ لازم نیست)' }), dataPanel(ctx)]);
    // history depth: an update only adds rows; is there enough history for every horizon?
    var AU = Hub.histMerge ? Hub.histMerge.audit() : [], NE = Hub.histMerge ? Hub.histMerge.NEED : { m: 260, l: 560, full: 1250 };
    var p6 = ctx.panel('عمق داده‌های تاریخی (هر به‌روزرسانی فقط داده اضافه می‌کند)', [table(['گروه داده', 'سری‌ها', 'کمترین / میانه / بیشترین روز', 'کمتر از ' + fa(NE.m, 0) + ' روز (کوتاه و میان‌مدت ناکافی)', 'میان ' + fa(NE.m, 0) + ' و ' + fa(NE.l, 0) + ' (بلندمدت ناکافی)', 'دست‌کم ' + fa(NE.full, 0) + ' روز (اعتبارسنجی کامل)', 'آخرین به‌روزرسانی: حفظ تاریخچه'],
      AU.map(function (a) { var lg = a.log; return [a.fa + (a.live ? '' : ' (نمونه)'), fa(a.n, 0), a.n ? fa(a.min, 0) + ' / ' + fa(a.med, 0) + ' / ' + fa(a.max, 0) : '—', a.short.length ? fa(a.short.length, 0) + ': ' + a.short.slice(0, 6).join('، ') + (a.short.length > 6 ? ' …' : '') : '—', a.noLong.length ? fa(a.noLong.length, 0) : '—', fa(a.full, 0),
        lg ? fa(lg.kept, 0) + ' سری با تاریخچهٔ قبلی تکمیل شد' + (lg.missing ? '، ' + fa(lg.missing, 0) + ' سری دریافت‌نشده با تاریخچهٔ قبلی ماند' : '') + (lg.unit && lg.unit.length ? '؛ واحد متفاوت (مخلوط نشد): ' + lg.unit.join('، ') : '') + ' — ' + new Date(lg.at).toLocaleString('fa-IR') : '—']; })),
      h('p', { class: 'small muted', text: 'قاعده: داده‌های تازه به انتهای سری اضافه می‌شوند و ردیف رسمی جای ردیف موقت همان روز را می‌گیرد؛ سری‌ای که در یک به‌روزرسانی دریافت نشود یا کوتاه‌تر برگردد، تاریخچهٔ ذخیره‌شده‌اش را حفظ می‌کند. اگر منبع جایگزین واحد دیگری داشته باشد، دو سری مخلوط نمی‌شوند. سقف هر سری ' + fa(Hub.histMerge ? Hub.histMerge.CAP : 3000, 0) + ' ردیف. نیاز موتور: کوتاه و میان‌مدت ' + fa(NE.m, 0) + '، بلندمدت ' + fa(NE.l, 0) + '، اعتبارسنجی کامل ' + fa(NE.full, 0) + ' جلسه. در گوشی، نخستین دریافت هر نماد غیرهسته ' + fa(NE.l, 0) + ' جلسه است و تاریخچهٔ عمیق‌تر از همگام‌سازی کامپیوتر حفظ می‌شود.' })]);
    return ctx.group([p1, p6, p2, p3, p4, p5, det]);
  }
  var AKEY = 'hub.autoupd.v1';
  // automatic refresh while the hub is open: stale feeds only, never while an update is running
  if (root.document) setInterval(function () { try {
    var A = U.store.get(AKEY, null); if (!A || !A.on || UPD.busy) return; if (Hub.smartRefresh && Hub.smartRefresh.active()) return;   // the market-aware scheduler supersedes the fixed interval var last = U.store.get('hub.autoupd.last', 0); if (Date.now() - last < (A.min || 60) * 60e3) return;
    U.store.set('hub.autoupd.last', Date.now()); var sn = {}, stale = FEEDIDS.map(feed).concat(SG.feeds).filter(function (f) { if (!f || sn[f.id]) return false; sn[f.id] = 1; var st = feedState(f); return st.live && isFinite(st.age) && st.age * 60 >= (A.min || 60); });
    if (!stale.length) return; if (A.calc && !(U.lite && U.lite())) { updateEverything({ S: null, rerender: function () {} }); return; }   /* never the full run with validation on a phone (memory) */
    stale.reduce(function (p, f) { return p.then(function () { var St = loadFeed(f), t0 = Date.now() - 1000; return SG.safeFetch(f.fetch, St, function () {}).then(function (errs) { U.store.set(f.storeKey, St); flog(f.id, true, errs.length ? 'بخشی ناموفق: ' + SG.summErr(errs) : (errs.notes && errs.notes.length ? errs.notes.join(' · ') : ''), { n: recvN(St, errs, t0), fail: errs.length, auto: true }); }, function (e) { flog(f.id, false, e.message, { auto: true }); }); }); }, Promise.resolve()).then(function () { TE.clearCache(); });
  } catch (e) { /* the timer must never break the page */ } }, 5 * 60e3);
  TK.define({ id: 'data-center', title: 'Data update center', sections: ['data'], priority: -100, version: 1, storeKey: 'hub.dataCenter.v1', noFile: true,
    summary: 'One command updates every data source and re-runs everything that depends on it.', sample: function () { return { version: 1 }; }, run: function () { return { checks: [] }; },
    eyebrow: function () { return 'Data · one command for the whole hub'; }, heading: function () { return 'مرکز دریافت و به‌روزرسانی داده‌ها'; },
    tabs: [{ group: 'Data', items: [['center', 'مرکز به‌روزرسانی', centerPage]] }] });
  function dataPanel(ctx) {
    var wrap = h('div'), log = h('div', { 'aria-live': 'polite' }), busy = false, symIn = h('input', { class: 'f-in', type: 'text', placeholder: 'مثلاً: فولاد، شپنا، طلا', 'aria-label': 'نمادهای انتخابی', style: 'min-width:260px' });
    function doFetch(f, only, label) {
      if (busy) return; busy = true; paint();
      var St = loadFeed(f), line = h('p', { class: 'small', 'data-notr': '1', text: label + ' … ' }); log.appendChild(line);
      var fn = only ? function (S2, p) { return SG.stocks.fetch(S2, p, only); } : f.fetch;
      SG.safeFetch(fn, St, function (a, b, k) { line.textContent = label + ' … ' + fa(a, 0) + ' / ' + fa(b, 0) + ' · ' + k; })
        .then(function (errs) { U.store.set(f.storeKey, St); flog(f.id, true, errs.length ? 'بخشی ناموفق: ' + SG.summErr(errs) : ''); TE.clearCache(); if (Hub.dataSync) Hub.dataSync.notify(); line.className = 'small ' + (errs.length ? 'warn-t' : 'good-t'); line.textContent = label + ': به‌روز شد' + (errs.length ? ' · بخشی ناموفق: ' + SG.summErr(errs) : ''); })
        .catch(function (e) { flog(f.id, false, e.message); line.className = 'small crit-t'; line.textContent = label + ': ناموفق — ' + e.message; })
        .then(function () { busy = false; ctx.rerender(); });
    }
    function paint() {
      U.clear(wrap);
      var sn = {}, LG = U.store.get(FLOG, {}) || {}, MC = Hub.mktCal, all = FEEDIDS.map(feed).concat(SG.feeds).filter(function (f) { if (!f || sn[f.id]) return false; sn[f.id] = 1; return true; });
      var rows = all.map(function (f) { var st = feedState(f), fm = FMETA[f.id] || { cal: 'tgju', unit: '—' }, sp = MC ? MC.spec(fm.cal) : null, md = st.k === 'none' ? 0 : mktDate(st.S), lg = LG[f.id];
        return [feedName(f), f.src || (sp && sp.src) || '—', f.size ? f.size(st.S) : '—', st.k === 'none' ? '—' : (st.S.meta.asOf || '—') + ' (' + SG.ageText(st.age) + ')', md ? (MC ? MC.faDate(md) : md) : '—',
          (fm.note || (sp ? sp.basis + '؛ ' + sp.tz : '—')), fm.unit, h('span', { class: 'data-age ' + st.k, text: st.k === 'none' ? 'دادهٔ نمونه (نامعتبر برای تصمیم)' : st.k === 'stale' ? 'کهنه' : 'به‌روز' }),
          lg ? (lg.ok ? (lg.msg ? '⚠ ' + lg.msg : '✓ موفق') : '✗ ناموفق — ' + lg.msg) + ' (' + new Date(lg.at).toLocaleString('fa-IR') + ')' : '—',
          h('button', { class: 'btn ghost', type: 'button', text: 'به‌روزرسانی', disabled: busy || UPD.busy, onclick: function () { doFetch(f, null, feedName(f)); } })]; });
      var rec = Hub.companyData && Hub.companyData.get(), N = rec && Hub.companyData.notes ? Hub.companyData.notes() : null;
      rows.push(['داده‌های بنیادی و صورت‌های مالی', 'فایل Excel / PDF شرکت', rec ? rec.blocks.length + ' صورت' : 'وارد نشده', rec ? rec.savedAt : '—', rec && rec.blocks[0] ? rec.blocks[0].years.join('، ') : '—', 'سال مالی شرکت', rec ? (rec.unit || '') + ' ' + (rec.currency || '') : '—',
        h('span', { class: 'data-age ' + (rec ? 'fresh' : 'none'), text: rec ? (N && N.report ? 'استخراج: ' + N.report.statusFa : 'واردشده') : 'ندارد' }), 'منبع زنده وصل نیست؛ ورود از نوار «Company data» در ابزارهای مالی',
        h('button', { class: 'btn ghost', type: 'button', text: 'ورود فایل', onclick: function () { location.hash = '#financing'; } })]);
      wrap.appendChild(table(['داده', 'منبع', 'دامنه', 'زمان دریافت (سن)', 'آخرین تاریخ بازار در داده', 'مبنای قیمت و منطقهٔ زمانی', 'واحد', 'وضعیت', 'آخرین دریافت', ''], rows));
      wrap.appendChild(h('p', { class: 'small muted', text: 'هر منبع زمان خودش را دارد: «زمان دریافت» لحظه‌ای است که داده از منبع گرفته شد و «آخرین تاریخ بازار» آخرین روزی است که منبع برای آن قیمت ثبت کرده. داده‌های منابع مختلف با زمان‌های متفاوت هم‌زمان فرض نمی‌شوند؛ هر جدول و سیگنال تاریخ دادهٔ خودش را نشان می‌دهد.' }));
      var grp = function (label, id) { var f = feed(id) || SG.feeds.filter(function (q) { return q.id === id; })[0]; return f ? h('button', { class: 'btn', type: 'button', text: label, disabled: busy || UPD.busy, onclick: function () { doFetch(f, null, label); } }) : null; };
      wrap.appendChild(h('div', { class: 'row-ctl', style: 'flex-wrap:wrap' }, [grp('سهام، شاخص‌ها و صندوق‌ها', 'sig-stocks'), grp('ارز و تتر', 'sig-fx'), grp('طلا، سکه و انس', 'sig-gold'), grp('رمزارز و بازارهای جهانی', 'sig-global'), grp('اختیار معامله', 'sig-options'), grp('سری‌های اقتصاد ایران', 'long-view')])); if (UPD.lines.length) wrap.appendChild(h('div', { id: 'upd-log' }, UPD.lines.filter(Boolean).map(function (l) { return h('p', { class: 'small ' + l.k, 'data-notr': '1', text: l.t }); })));
      var fs = feed('sig-stocks'); /* only real data is extended and saved: rendering this panel before the stored data is loaded used to save the sample watch list over it */ if (fs && SG.stocks.mergeUniverse && feedState(fs).live) { var St0 = loadFeed(fs), nU = SG.stocks.mergeUniverse(St0); if (nU) { U.store.set(fs.storeKey, St0); U.toast(fa(nU, 0) + ' نماد از فهرست ۱۴۰۵/۰۸/۲۰ به دیده‌بان اضافه شد.', 'good'); } }
      var stS = fs ? feedState(fs) : null, miss = [];
      if (stS) stS.S.watch.forEach(function (w) { if (w.active === false || !w.symbol) return; var d = stS.live && stS.S.data[w.symbol]; if (!d || !d.px || d.px.length < 30) miss.push(w.symbol); });
      var merge = h('button', { class: 'btn', type: 'button', text: 'افزودن فهرست ' + fa(SG.stocks.WATCH.length, 0) + ' نماد شما به دیده‌بان', disabled: busy, onclick: function () {
        if (!this.dataset.armed) { this.dataset.armed = '1'; this.textContent = 'تأیید: نمادهای جدید اضافه می‌شوند؛ نمادها و داده‌های فعلی حفظ می‌شوند'; return; }
        var St = loadFeed(fs), smp = !feedState(fs).live, n = smp ? (St = SG.stocks.sample(), St.watch.length) : SG.stocks.mergeWatch(St); U.store.set(fs.storeKey, St);
        U.toast(smp ? 'دیده‌بان با ' + fa(n, 0) + ' نماد ساخته شد (دادهٔ نمونه تا دریافت دادهٔ واقعی).' : fa(n, 0) + ' نماد جدید اضافه شد. برای دریافت داده «فقط نمادهای بدون داده» را بزنید.', 'good'); ctx.rerender(); } });
      wrap.appendChild(h('div', { class: 'row-ctl', style: 'flex-wrap:wrap' }, [
        h('button', { class: 'btn primary', type: 'button', text: 'به‌روزرسانی همه‌چیز (+ اعتبارسنجی)', disabled: busy || UPD.busy, onclick: function () { updateEverything(ctx.S && ctx.S.e ? ctx : { S: null, rerender: ctx.rerender }); } }),
        h('button', { class: 'btn', type: 'button', text: 'فقط نمادهای بدون داده (' + fa(miss.length, 0) + ')', disabled: busy || !miss.length || !fs, onclick: function () { doFetch(fs, miss, 'نمادهای بدون داده'); } }),
        symIn, h('button', { class: 'btn', type: 'button', text: 'به‌روزرسانی نمادهای انتخابی', disabled: busy || !fs, onclick: function () { var only = symIn.value.split(/[،,\s]+/).map(function (x) { return x.trim(); }).filter(Boolean); if (!only.length) { U.toast('نماد را وارد کنید.', 'warn'); return; } doFetch(fs, only, 'نمادهای انتخابی'); } }), merge]));
    }
    paint();
    var P0 = ctx.panel('مرکز مدیریت داده‌ها و به‌روزرسانی', [isArtifact() ? h('p', { class: 'neg', text: 'این نسخهٔ آنلاین درخواست بیرونی را مسدود می‌کند؛ برای دادهٔ زنده فایل HTML را روی کامپیوتر خودتان (با پروکسی محلی، زبانهٔ «مرکز دادهٔ بازار») باز کنید.' }) : null,
      h('p', { class: 'f-help', text: 'هیچ داده‌ای خودکار دریافت نمی‌شود مگر اینکه بخواهید. به‌روزرسانی ناموفق آخرین دادهٔ سالم را حفظ می‌کند؛ به‌روزرسانی نمادهای انتخابی دادهٔ بقیهٔ نمادها را دست نمی‌زند. سیگنال روی دادهٔ نمونه «غیرقابل اجرا» و روی دادهٔ کهنه «مشروط» است. کدهای TSETMC (insCode) فهرست شما در اولین دریافت سنجیده می‌شوند؛ اگر نمادی خطا داد، کد آن را در زبانهٔ «سیگنال سهام» خالی کنید تا از نام نماد پیدا شود.' }), wrap, log]);
    P0.id = 'data-center'; return P0;
  }

  /* ---------- 2 · signals ---------- */
  function fieldRows(c) {
    var hold = c.type === 'hold', r = [];
    r.push(['دارایی', c.sym + ' — ' + c.name + ' (' + (CLS[c.cls] || c.cls) + (c.sector ? '، ' + c.sector : '') + ')']);
    r.push(['نوع سیگنال', c.typeFa]); r.push(['قدرت · وضعیت اجرا', c.strength + ' · ' + c.status]);
    r.push(['اطمینان', fa(c.conf, 0) + '٪' + (isFinite(c.agree) ? ' (هم‌سویی وزنی مدل‌ها ' + pct(c.agree, 0) + '، خانواده‌های هم‌جهت ' + fa(c.fam || 0, 0) + ')' : '')]);
    r.push([hold ? 'شرط و محدودهٔ ورود (در صورت فعال شدن)' : 'محدودهٔ ورود', px(c.lo, c) + ' تا ' + px(c.hi, c) + ' ' + c.unit + (c.P && c.P.type ? ' — ' + ({ breakout: 'شکست', pullback: 'پولبک (سفارش محدود)', trigger: 'شرطی', exit: 'خروج' }[c.P.type] || '') : '')]);
    r.push(['حد ضرر', px(c.stop, c) + (c.P && c.P.stopSrc ? ' — ' + c.P.stopSrc : '') + (c.close ? ' (' + pct(Math.abs(c.stop / c.entry - 1), 1) + ' از ورود)' : '')]);
    r.push(['اهداف', 'هدف ۱: ' + px(c.tp1, c) + ' | هدف ۲: ' + px(c.tp2, c) + ' | هدف ۳: ' + px(c.tp3, c)]);
    r.push(['نسبت بازده به ریسک (پس از هزینه)', 'تا هدف ۱: ۱:' + fa(c.rr1, 1) + ' · تا هدف ۲: ۱:' + fa(c.rr2, 1)]);
    r.push(['حجم پیشنهادی', hold ? '— (بدون اقدام)' : pct(c.posPct, 1) + ' از سرمایه · ریسک ' + pct(c.riskPct, 2) + ' از سرمایه' + (isFinite(c.units) && c.units ? ' · ' + fa(c.units, 0) + (c.cls === 'option' ? ' قرارداد' : ' واحد') + (isFinite(c.riskAmt) ? ' · ریسک ' + fa(c.riskAmt, 0) + ' ریال' : '') : ' (سرمایه را وارد کنید تا تعداد محاسبه شود)')]);
    r.push(['افق زمانی', c.horizon.fa]); r.push(['زمان‌بندی', c.timing]); r.push(['رژیم بازار دارایی', TE.REG[c.regime] || c.regime]);
    r.push(['برنامهٔ خروج', c.exit || '—']);
    r.push(['دادهٔ مبنا', (c.sample ? 'دادهٔ نمونه' : 'به‌روزرسانی ' + (c.asOf || '—')) + (c.date ? ' · آخرین جلسه ' + c.date : '')]);
    return r;
  }
  function sigCard(c) {
    var copy = h('button', { class: 'mini', type: 'button', text: 'کپی متن سیگنال', onclick: function () { var t = sigText(c); if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { U.toast('کپی شد.', 'good'); }); else U.toast(t, 'info'); } });
    var head = h('div', { class: 'sig-head' }, [h('strong', { 'data-notr': '1', text: c.sym }), chip(c.typeFa, TYPEC[c.type]), chip(c.strength, c.strength === 'قوی' ? 'fit-rec' : c.strength === 'متوسط' ? 'fit-cond' : 'sev-info'),
      chip(c.status, /^قابل اجرا/.test(c.status) ? 'fit-rec' : /^مشروط/.test(c.status) ? 'fit-cond' : 'fit-no')].concat(c.val ? [chip('درجه ' + c.val.grade, GCHIP[c.val.grade])] : []).concat([h('span', { class: 'sig-conf', 'data-notr': '1', text: 'اطمینان ' + fa(c.conf, 0) + '٪' }), copy]));
    var body = c.ticket ? [h('h4', { text: 'دستور معامله' }), table(['', ''], c.ticket, 'sig-t ticket'), h('h4', { text: 'جزئیات سیگنال' }), table(['فیلد', 'مقدار'], fieldRows(c), 'sig-t')] : [table(['فیلد', 'مقدار'], fieldRows(c), 'sig-t')];
    body.push(h('h4', { text: 'مدل‌ها و دلایل' })); body.push(list(c.top.map(function (x) { var m = TB().get(x.m); return (m ? m.fa : x.m) + ': ' + x.why; })));
    if (c.against && c.against.length) { body.push(h('h4', { text: 'مدل‌های مخالف' })); body.push(list(c.against.map(function (x) { var m = TB().get(x.m); return (m ? m.fa : x.m) + ': ' + x.why; }))); }
    var vb = valBlock(c); if (vb) body = body.concat(vb);
    if (c.why.length || c.cond.length) { body.push(h('h4', { text: 'شرایط و محدودیت‌ها' })); body.push(list(c.why.concat(c.cond))); }
    body.push(h('h4', { text: 'شرایط ابطال' })); body.push(list(c.inval));
    if (c.notes.length) { body.push(h('h4', { text: 'ملاحظات اجرایی' })); body.push(list(c.notes)); }
    return h('div', { class: 'sig-card t-' + c.type, id: 'sig-' + encodeURIComponent(c.key) }, [head, h('details', { open: c.type !== 'hold' }, [h('summary', { 'data-notr': '1', text: sigText(c) })].concat(body))]);
  }
  /* ---------- 12 · mandatory validation: state, run, per-signal block, database ---------- */
  var GCHIP = { A: 'fit-rec', B: 'fit-rec', C: 'fit-cond', D: 'fit-no' };
  var VTHFA = { costX: 'آزمون فشار هزینه (چند برابر هزینهٔ فعلی؛ ۱ = بدون فشار)', nA: 'حداقل معاملات برای A', nB: 'حداقل معاملات برای B', nC: 'حداقل معاملات برای C', oosA: 'حداقل معاملات خارج از نمونه برای A', oosB: 'حداقل معاملات خارج از نمونه برای B', pfA: 'حداقل ضریب سود خارج از نمونه برای A', pfB: 'حداقل ضریب سود خارج از نمونه برای B',
    expA: 'حداقل امید ریاضی خارج از نمونه برای A (R)', tA: 'حداقل t برای A', tB: 'حداقل t برای B', foldA: 'سهم بلوک‌های سودده برای A', foldB: 'سهم بلوک‌های سودده برای B', decay: 'حداقل نسبت امید ریاضی خارج به درون نمونه برای A', maxAge: 'حداکثر فاصلهٔ اعتبارسنجی با داده (روز)' };
  function runVal(ctx, btn) {
    var S = ctx.S, E = ensure(S); if (btn) { btn.disabled = true; btn.textContent = 'در حال اعتبارسنجی (چند ثانیه تا دقیقه)…'; }
    // the attempt is written down before it starts: if the phone closes the page mid-way (memory), the next visit says so instead of silently showing "not run"
    // a run that did not finish last time → this time the lighter mode (models on the last 760 sessions), so the phone can complete it
    var lite = !!(S.valRun && S.valRun.st === 'running') || !!(S.valRun && S.valRun.lite && S.valRun.st === 'ok');
    S.valRun = { at: Date.now(), st: 'running', lite: lite }; try { U.store.set('hub.tradingEngine.v1', S); } catch (e) { /* storage full */ }
    var t0 = Date.now(), done = function (r) { try { BT = r.bt; BTkey = btKey(E); S._sampleBT = r.sample;
        S.valRun = E.val.db ? { at: Date.now(), st: 'ok', ms: Date.now() - t0, ver: E.val.db.ver, lite: lite } : { at: Date.now(), st: 'nodata', msg: r.sample ? 'همهٔ داده‌ها نمونه‌اند (دادهٔ واقعی دریافت نشده)' : 'هیچ دارایی با تاریخچهٔ کافی پیدا نشد' };
        U.toast(E.val.db ? 'اعتبارسنجی نسخهٔ ' + fa(E.val.db.ver, 0) + ' ثبت شد (' + fa(E.val.db.nTrades, 0) + ' معاملهٔ شبیه‌سازی‌شده، ' + fa((Date.now() - t0) / 1000, 0) + ' ثانیه' + (lite ? '؛ حالت سبک: مدل‌ها روی ۷۶۰ جلسهٔ آخر، افق بلندمدت بدون داده' : '') + ').' : 'اعتبارسنجی اجرا شد اما نتیجه‌ای ثبت نشد: ' + S.valRun.msg, E.val.db ? 'good' : 'warn'); }
      catch (e) { fail(e); return; }
      try { U.store.set('hub.tradingEngine.v1', S); } catch (e) { /* storage full */ }
      ctx.rerender(); }, fail = function (e) { S.valRun = { at: Date.now(), st: 'err', msg: String(e && e.message || e) }; U.toast('اعتبارسنجی ناموفق: ' + S.valRun.msg, 'crit'); try { U.store.set('hub.tradingEngine.v1', S); } catch (e2) { /* storage full */ } ctx.rerender(); };
    // runs in small steps so the phone's browser keeps control (it closes a page that freezes or holds too much memory)
    setTimeout(function () { var saved = -1, PH = { prep: 'تحلیل نمادها', cross: 'مدل‌های بین‌نمادی', bt: 'بک‌تست', db: 'ثبت نتایج' };
      TE.validateAsync(E, undefined, S.j || [], function (i, n, ph) { if (btn) btn.textContent = 'در حال اعتبارسنجی — ' + PH[ph] + (n ? ': ' + fa(i, 0) + ' از ' + fa(n, 0) : '') + '…';
        // checkpoint: if the page is closed mid-way, the next visit says where it stopped
        var chg = S.valRun.ph !== ph; S.valRun.i = i; S.valRun.n = n; S.valRun.ph = ph; if (chg || i - saved >= 10 || i === n) { saved = i; try { U.store.set('hub.tradingEngine.v1', S); } catch (e) { /* storage full */ } } }, { lite: lite }).then(done, fail); }, 30);
  }
  function valPoolFa(v, c) { return (CLS[c.cls] || c.cls) + (v.matched ? ' در رژیم «' + (TE.REG[c.regime] || c.regime) + '»' : ' در همهٔ رژیم‌ها (نمونهٔ رژیم فعلی کافی نیست)'); }
  function valBlock(c) {
    var v = c.val; if (!v) return null;
    var ev = v.ev, rows = [['درجه', 'درجه ' + v.grade + ' — ' + v.fa + (v.ver ? ' · نسخهٔ اعتبارسنجی ' + fa(v.ver, 0) + (v.asOf ? ' · داده تا ' + TE.shamsi(v.asOf) : '') : '')]];
    if (ev) {
      var o = ev.oos || {}, rr = isFinite(ev.avgW) && ev.avgL > 0 ? ev.avgW / ev.avgL : NaN;
      rows.push(['نمونهٔ شواهد', valPoolFa(v, c)]);
      rows.push(['معاملات تاریخی · نرخ برد · ضریب سود', fa(ev.n, 0) + ' · ' + pct(ev.hit, 0) + ' · ' + (isFinite(ev.pf) ? fa(ev.pf, 2) : '—')]);
      rows.push(['امید ریاضی · R:R واقعی · حداکثر افت', fa(ev.avgR, 2) + 'R · ' + (isFinite(rr) ? '۱:' + fa(rr, 2) : '—') + ' · ' + fa(ev.mdd, 1) + 'R']);
      rows.push(['خارج از نمونه', o.n ? fa(o.n, 0) + ' معامله · برد ' + pct(o.hit, 0) + ' · ضریب سود ' + (isFinite(o.pf) ? fa(o.pf, 2) : '—') + ' · امید ریاضی ' + fa(o.avgR, 2) + 'R' : 'معاملهٔ خارج از نمونه‌ای نبود']);
      rows.push(['بازده (ساده، یک دارایی میانگین)', pct(ev.retCum, 1) + ' تجمعی · ' + (isFinite(ev.retAnn) ? pct(ev.retAnn, 1) : '—') + ' سالانه (با ریسک ' + pct(E0r(), 1) + ' برای هر معامله)']);
      if (v.asset) rows.push(['روی خود این نماد', fa(v.asset.n, 0) + ' معاملهٔ شبیه‌سازی‌شده · امید ریاضی ' + fa(v.asset.avgR, 2) + 'R (نمونهٔ یک نماد کوچک است و ملاک درجه نیست)']);
    }
    var body = [h('h4', { text: 'اعتبارسنجی و شواهد (الزام ۱۲)' }), table(['فیلد', 'مقدار'], rows, 'sig-t')];
    if (v.ok && v.ok.length && (v.grade === 'A' || v.grade === 'B')) { body.push(h('p', { class: 'small muted', text: 'شواهد حمایت‌کننده:' })); body.push(list(v.ok)); }
    if (v.reasons.length || v.caps.length) { body.push(h('p', { class: 'small muted', text: v.grade === 'A' ? 'محدودیت‌ها:' : 'چرا درجه بالاتر نیست:' })); body.push(list(v.reasons.concat(v.caps))); }
    if (c.candidate) body.push(h('p', { class: 'neg', text: 'عدم صدور سیگنال: الگوی «' + c.candidate.typeFa + '» با اطمینان ' + fa(c.candidate.conf, 0) + '٪ دیده شد ولی شواهد اعتبارسنجی برای ورود کافی نیست. این یک سیگنال معاملاتی نیست.' }));
    return body;
  }
  var E0cache = null; function E0r() { return E0cache && E0cache.acct ? Number(E0cache.acct.riskPct) || 0.01 : 0.01; }
  function valStatePanel(ctx, X) {
    var S = ctx.S, E = ensure(S); E0cache = E; var db = E.val.db, st = X.valState, cnt = { A: 0, B: 0, C: 0, D: 0 };
    X.cards.forEach(function (c) { if (c.val && (c.type === 'long' || c.type === 'short' || c.candidate)) cnt[c.val.grade]++; });
    var msg = st === 'none' ? 'اعتبارسنجی هنوز اجرا نشده است؛ طبق الزام ۱۲ هیچ سیگنال خریدی تأییدشده نیست.' : st === 'stale' ? 'تنظیمات (وزن‌ها، آستانه‌ها، هزینه یا موتور) پس از آخرین اعتبارسنجی تغییر کرده؛ باید دوباره بک‌تست شود، تا آن زمان سیگنال‌ها تأییدنشده‌اند.' : st === 'sample' ? 'اعتبارسنجی روی دادهٔ نمونه انجام شده و بی‌اعتبار است.' :
      'اعتبارسنجی نسخهٔ ' + fa(db.ver, 0) + ' (' + new Date(db.at).toLocaleDateString('fa-IR') + ') · داده تا ' + TE.shamsi(db.asOf) + ' · ' + fa(db.nTrades, 0) + ' معامله روی ' + fa(db.nAssets, 0) + ' دارایی.';
    var gate = h('select', { class: 'f-sel', 'aria-label': 'رفتار با درجه C و D' }, [h('option', { value: 'strict', text: 'سخت‌گیرانه — درجه C و D = عدم صدور سیگنال (پیشنهادی، مطابق الزام)' }), h('option', { value: 'warn', text: 'فقط هشدار — سیگنال می‌ماند و درجه نمایش داده می‌شود' })]);
    gate.value = E.val.gate === 'warn' ? 'warn' : 'strict'; gate.addEventListener('change', function () { E.val.gate = gate.value; try { U.store.set('hub.tradingEngine.v1', S); } catch (e) { /* ignore */ } ctx.rerender(); });
    var btn = h('button', { class: 'btn primary', type: 'button', text: db && st === 'ok' ? 'اعتبارسنجی دوباره' : 'اجرای اعتبارسنجی', onclick: function () { runVal(ctx, btn); } });
    return ctx.panel('وضعیت اعتبارسنجی (الزام ۱۲: بدون بک‌تست، بدون سیگنال)', [h('p', { class: st === 'ok' ? 'f-help' : 'neg', text: msg }),
      h('p', { class: 'f-help', text: 'سیگنال‌های خرید امروز: درجه A ' + fa(cnt.A, 0) + ' · B ' + fa(cnt.B, 0) + ' · C ' + fa(cnt.C, 0) + ' · D ' + fa(cnt.D, 0) + (X.counts.gated ? ' — ' + fa(X.counts.gated, 0) + ' مورد به «عدم صدور سیگنال» تبدیل شد.' : '') + ' خروج‌ها و حد ضرر هرگز مسدود نمی‌شوند. «درجه» یعنی قدرت شواهد، نه احتمال سود.' }),
      h('div', { class: 'row-ctl' }, [btn, h('label', { class: 'f-help' }, ['رفتار با C و D: ', gate])])]);
  }
  function poolRow(label, p) {
    if (!p || !p.n) return [label, '۰', '—', '—', '—', '—', '—', '—', '—', '—', '—', '—'];
    var o = p.oos || {}, rr = isFinite(p.avgW) && p.avgL > 0 ? p.avgW / p.avgL : NaN;
    return [label, fa(p.n, 0), pct(p.hit, 0), isFinite(rr) ? '۱:' + fa(rr, 2) : '—', isFinite(p.pf) ? fa(p.pf, 2) : '—', fa(p.avgR, 2) + 'R', fa(p.mdd, 1) + 'R', o.n ? fa(o.n, 0) + ' · ' + fa(o.avgR, 2) + 'R' : '—', isFinite(p.tc) ? fa(p.tc, 2) : '—', (p.nFolds ? fa(p.posFolds, 0) + '/' + fa(p.nFolds, 0) : '—'), isFinite(p.c2) ? fa(p.c2, 2) + 'R' : '—', isFinite(p.retAnn) ? pct(p.retAnn, 1) : '—'];
  }
  function valDetailPanels(ctx) {
    var S = ctx.S, E = ensure(S), db = E.val.db, out = [];
    if (!db) return [ctx.panel('نتیجهٔ اعتبارسنجی', [h('p', { class: 'muted', text: 'هنوز اجرا نشده است. دکمهٔ «اجرای اعتبارسنجی» (زبانهٔ سیگنال‌ها یا همین‌جا) را بزنید.' })])];
    var keys = Object.keys(db.pools).filter(function (k) { return k === 'all' || k.indexOf('c:') === 0; }).sort(function (a, b) { return (db.pools[b].n || 0) - (db.pools[a].n || 0); });
    var lab = function (k) { if (k === 'all') return 'همهٔ معاملات'; var p = k.slice(2).split('|'); return (CLS[p[0]] || p[0]) + (p[1] ? ' · ' + (TE.REG[p[1]] || p[1]) : ' · همهٔ رژیم‌ها'); };
    out.push(ctx.panel('عملکرد بک‌تست به تفکیک دارایی و رژیم بازار', [
      h('p', { class: 'f-help', text: 'هر ردیف مجموعهٔ شواهدی است که کارت‌های همان نوع دارایی و رژیم از آن درجه می‌گیرند. دورهٔ بک‌تست: ' + TE.shamsi(db.from) + ' تا ' + TE.shamsi(db.asOf) + '؛ مرز درون/خارج از نمونه ' + TE.shamsi(db.split) + '. «t» بر پایهٔ میانگین ماهانه است (معاملات یک ماه مستقل فرض نمی‌شوند). «هزینه ×۲» امید ریاضی با هزینهٔ دو برابر است.' }),
      table(['نمونه', 'معامله', 'نرخ برد', 'R:R واقعی', 'ضریب سود', 'امید ریاضی', 'حداکثر افت', 'خارج از نمونه', 't', 'بلوک سودده', 'هزینه ×۲', 'بازده سالانه'], keys.map(function (k) { return poolRow(lab(k), db.pools[k]); }))]));
    var all = db.pools.all || {};
    out.push(ctx.panel('پایداری، حساسیت و حسابرسی', [
      h('h4', { text: 'پایداری زمانی (چهار بلوک پیاپی از معاملات)' }),
      table(['بلوک', 'معامله', 'از', 'تا', 'امید ریاضی'], (all.folds || []).map(function (f, i) { return f ? [fa(i + 1, 0), fa(f.n, 0), TE.shamsi(f.from), TE.shamsi(f.to), fa(f.avgR, 2) + 'R'] : [fa(i + 1, 0), 'کمتر از ۵', '—', '—', '—']; })),
      h('h4', { text: 'حساسیت به آستانهٔ اطمینان و هزینه' }),
      table(['آستانهٔ اطمینان', 'معامله', 'نرخ برد', 'امید ریاضی', 'ضریب سود'], (db.sens || []).map(function (s) { return [fa(s.th, 0) + '٪', fa(s.n, 0), s.n ? pct(s.hit, 0) : '—', s.n ? fa(s.avgR, 2) + 'R' : '—', s.n && isFinite(s.pf) ? fa(s.pf, 2) : '—']; }).concat([['هزینه ×۱ (فعلی ' + pct(db.cost, 1) + ')', fa(all.n || 0, 0), '—', fa(all.avgR, 2) + 'R', '—'], ['هزینه ×۲', fa(all.n || 0, 0), '—', isFinite(all.c2) ? fa(all.c2, 2) + 'R' : '—', '—'], ['هزینه ×۳', fa(all.n || 0, 0), '—', isFinite(all.c3) ? fa(all.c3, 2) + 'R' : '—', '—']])),
      h('p', { class: db.audit && db.audit.ok ? 'f-help' : 'neg', text: 'حسابرسی نگاه به آینده (هر مدل روی سری بریده‌شده در همان روز دوباره محاسبه و با رأی روی سری کامل مقایسه شد): ' + (db.audit ? db.audit.note : 'انجام نشد') })]));
    out.push(ctx.panel('محدودیت‌های بک‌تست (شفافیت)', [list(TE.VLIM)]));
    var th = Object.assign({}, TE.VTH, E.val.th), ins = Object.keys(TE.VTH).filter(function (k) { return k !== 'ddMode'; }).map(function (k) {
      var i = h('input', { class: 'cell-in', type: 'text', inputmode: 'decimal', style: 'width:70px', 'aria-label': VTHFA[k], value: String(th[k]) });
      i.addEventListener('change', function () { var x = Number(i.value); if (!isFinite(x) || x < 0) { U.toast('عدد معتبر وارد کنید.', 'warn'); return; } E.val.th[k] = x; try { U.store.set('hub.tradingEngine.v1', S); } catch (e) { /* ignore */ } ctx.rerender(); });
      return h('label', { class: 'f-help', style: 'display:inline-block;margin:4px 12px 4px 0' }, [VTHFA[k] + ': ', i]);
    });
    out.push(ctx.panel('آستانه‌های درجه‌بندی (قابل تنظیم)', [h('p', { class: 'f-help', text: 'این آستانه‌ها قاعدهٔ طراحی‌شدهٔ ابزارند، نه استاندارد علمی؛ سخت‌تر کردنشان محافظه‌کارانه‌تر است. تغییر آنها نیازی به بک‌تست دوباره ندارد (فقط درجه‌ها را دوباره حساب می‌کند). درجه A: همهٔ شرط‌ها؛ B: نمونه، خارج از نمونه، سودآوری، معناداری و پایداری در حد پایین‌تر؛ C: شواهد مثبت ولی ناکافی؛ D: بدون شواهد یا منفی.' }), h('div', null, ins),
      h('button', { class: 'btn ghost', type: 'button', text: 'بازگشت به پیش‌فرض', onclick: function () { E.val.th = {}; ctx.rerender(); } })]));
    // drawdown test of the strategy selection: how a portfolio lives it (default) or the pooled sum of every trade (the earlier rule)
    var dd = h('select', { class: 'f-sel', 'aria-label': 'ملاک افت' }, [h('option', { value: 'portfolio', text: 'سبد ماهانهٔ هم‌وزن (پیش‌فرض)' }), h('option', { value: 'pooled', text: 'جمع همهٔ معاملات همهٔ دارایی‌ها (قاعدهٔ قبلی)' })]); dd.value = th.ddMode || 'portfolio';
    dd.addEventListener('change', function () { E.val.th.ddMode = dd.value; try { U.store.set('hub.tradingEngine.v1', S); } catch (e) { /* ignore */ } U.toast('ملاک افت تغییر کرد؛ اعتبارسنجی باید دوباره اجرا شود.', 'warn'); ctx.rerender(); });
    out.push(ctx.panel('ملاک آزمون افت در انتخاب استراتژی', [h('label', { class: 'f-help' }, ['ملاک: ', dd]), h('p', { class: 'f-help', text: 'قاعدهٔ قبلی افت را روی جمع R همهٔ معاملات همهٔ دارایی‌های یک بازار می‌سنجید؛ این عدد با تعداد دارایی‌ها بزرگ می‌شود (بازاری با ۷۶۱ سهم فقط به‌خاطر اندازه‌اش رد می‌شد، در حالی که طلا با ۱۰ دارایی رد نمی‌شد). ملاک پیش‌فرض: هر ماه، معاملاتِ باز شده یک سبد هم‌وزن با ۱R ریسک است؛ افت = بیشترین افت تجمعی این سبد. آستانه همان ۱۵R (کوتاه و میان‌مدت) و ۱۰R (بلندمدت) است. تغییر ملاک اعتبارسنجی را منقضی می‌کند.' })]));
    return out;
  }
  function dbPanel(ctx) {
    var S = ctx.S, E = ensure(S), V = E.val, rs = Object.keys(V.reg || {}).map(function (k) { return V.reg[k]; });
    if (!rs.length) return ctx.panel('بانک استراتژی و سیگنال (Strategy & Signal Database)', [h('p', { class: 'muted', text: 'پس از نخستین اعتبارسنجی، هر استراتژی با نسخه، نتایج بک‌تست، عملکرد واقعی و تاریخ آخرین اعتبارسنجی اینجا ثبت می‌شود.' })]);
    var nm = function (id) { if (id === 'ensemble') return TE.RULEFA.ensemble; if (/^xgold:/.test(id)) return 'بین‌بازاری طلا XG1 — ' + id.slice(6); var m = TB().get(id); return m ? m.fa : id; };
    var ens = V.reg.ensemble, dl = h('button', { class: 'btn', type: 'button', text: 'دریافت بانک (JSON)', onclick: function () { var blob = new Blob([JSON.stringify({ engine: TE.ENG_VER, db: V.db, registry: V.reg, history: V.hist }, null, 1)], { type: 'application/json' }), a = h('a', { href: URL.createObjectURL(blob), download: 'strategy-signal-db.json' }); document.body.appendChild(a); a.click(); a.remove(); } });
    return ctx.panel('بانک استراتژی و سیگنال (Strategy & Signal Database)', [
      h('p', { class: 'f-help', text: 'هر ردیف یک استراتژی است. «نسخه» با هر تغییر وزن/آستانه/هزینه بالا می‌رود؛ هر نسخه باید دوباره بک‌تست شود. استراتژی‌ای که در دو اعتبارسنجی پیاپی خارج از نمونه لبه نداشته باشد «معلق» می‌شود و نباید دوباره به آن تکیه کرد. قاعدهٔ هر مدل: رأی ≥ ۰٫۵ ← خرید، افق ۲۰ روز.' }),
      ens && ens.drift ? h('p', { class: 'neg', text: 'هشدار: ' + ens.drift + '.' }) : null,
      table(['استراتژی', 'نسخه', 'آخرین اعتبارسنجی', 'امضای پارامترها', 'درون نمونه', 'خارج از نمونه', 't', 'بلوک سودده', 'عملکرد واقعی', 'وضعیت'], rs.sort(function (a, b) { return (a.id === 'ensemble' ? -1 : 0) - (b.id === 'ensemble' ? -1 : 0) || ((b.oos && b.oos.n) || 0) - ((a.oos && a.oos.n) || 0); }).map(function (r) {
        return [nm(r.id), fa(r.ver, 0), new Date(r.last).toLocaleDateString('fa-IR'), r.sig, r.is && r.is.n ? fa(r.is.n, 0) + ' · ' + fa(r.is.avgR, 2) + 'R' : '—', r.oos && r.oos.n ? fa(r.oos.n, 0) + ' · ' + fa(r.oos.avgR, 2) + 'R · PF ' + (isFinite(r.oos.pf) ? fa(r.oos.pf, 2) : '—') : '—', isFinite(r.t) ? fa(r.t, 2) : '—', r.folds || '—', r.live ? fa(r.live.n, 0) + ' · ' + fa(r.live.avgR, 2) + 'R' : (r.id === 'ensemble' ? 'معامله‌ای ثبت نشده' : '—'), r.status]; })),
      h('h4', { text: 'تاریخچهٔ اعتبارسنجی‌ها' }),
      table(['نسخه', 'زمان', 'داده تا', 'امضا', 'معامله', 'امید ریاضی', 'خارج از نمونه', 'حسابرسی نگاه به آینده'], (V.hist || []).slice().reverse().map(function (x) { return [fa(x.ver, 0), new Date(x.at).toLocaleString('fa-IR'), TE.shamsi(x.asOf), x.sig, fa(x.n, 0), fa(x.avgR, 2) + 'R', fa(x.oosN, 0) + ' · ' + (x.oosN ? fa(x.oosAvgR, 2) + 'R' : '—'), x.audit ? 'پاک' : 'اختلاف/ناقص']; })),
      h('div', { class: 'row-ctl' }, [dl])]);
  }


  /* ---------- 13 · multi-market layer: central ranking, coverage, macro engine ---------- */
  var HZFA = { s: 'کوتاه‌مدت (تا ۱۰ جلسه)', m: 'میان‌مدت (۱۰ تا ۴۰ جلسه)', l: 'بلندمدت (بیش از ۴۰ جلسه)' };
  function macState(S) { if (!S.mac || typeof S.mac !== 'object') S.mac = { series: [], log: [] }; if (!Array.isArray(S.mac.series)) S.mac.series = []; if (!Array.isArray(S.mac.log)) S.mac.log = []; return S.mac; }
  function saveS(S) { try { U.store.set('hub.tradingEngine.v1', S); } catch (e) { /* storage full */ } }
  function macroPanel(ctx) {
    var S = ctx.S, M = macState(S), ME = Hub.macroEval, out = h('div');
    var nm = h('input', { class: 'f-in', type: 'text', 'aria-label': 'نام متغیر', placeholder: 'نام متغیر (مثلاً تورم ماهانه، نقدینگی، PMI)' });
    var per = h('select', { class: 'f-sel', 'aria-label': 'دورهٔ فصلی' }, [['0', 'بدون الگوی فصلی'], ['4', 'فصلی (۴)'], ['12', 'ماهانه با الگوی سالانه (۱۲)']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
    var hh = h('input', { class: 'cell-in', type: 'text', inputmode: 'numeric', style: 'width:60px', value: '1', 'aria-label': 'افق پیش‌بینی (دوره)' });
    var ta = h('textarea', { class: 'f-area', rows: 5, 'aria-label': 'سری', placeholder: 'هر خط یک مشاهده، قدیم به جدید: «برچسب دوره، فاصله، مقدار» مثل  1403/05 41.2  . عددها فارسی هم پذیرفته می‌شوند. مقدارها را از منبع رسمی بردارید و منبع را در نام بنویسید.' });
    var add = h('button', { class: 'btn', type: 'button', text: 'افزودن سری', onclick: function () {
      var p = ME.parse(ta.value); if (p.bad.length) { U.toast('خط‌های نامعتبر: ' + p.bad.slice(0, 8).join('، '), 'warn'); return; } if (p.rows.length < 12) { U.toast('دست‌کم ۱۲ مشاهده لازم است.', 'warn'); return; }
      M.series.push({ id: 'm' + Date.now(), name: (nm.value || 'متغیر بدون نام').trim(), period: Number(per.value) || 0, h: Math.max(1, Math.floor(Number(hh.value)) || 1), labels: p.rows.map(function (r) { return r.label; }), vals: p.rows.map(function (r) { return r.v; }) }); saveS(S); ctx.rerender(); } });
    var items = M.series.map(function (sr) {
      var R = ME.evaluate(sr.vals, { h: sr.h, period: sr.period }), body = [];
      body.push(h('h4', { text: sr.name + ' — ' + sr.vals.length + ' مشاهده، افق ' + sr.h + ' دوره' }));
      if (!R.ok) body.push(h('p', { class: 'neg', text: R.note })); else {
        body.push(table(['مدل', 'تعداد پیش‌بینی', 'MAE', 'خطای نسبی به مدل ساده', 'آمارهٔ DM', 'درستی جهت', 'اریبی'], Object.keys(R.models).map(function (k) { var m = R.models[k]; return [m.fa + (m.beats ? ' ✔' : ''), fa(m.n, 0), fa(m.mae, 3), m.rel != null ? fa(m.rel, 2) : '۱٫۰۰ (مبنا)', m.dm != null && isFinite(m.dm) ? fa(m.dm, 2) : '—', isFinite(m.dir) ? pct(m.dir, 0) : '—', fa(m.bias, 3)]; })));
        body.push(h('p', { class: 'f-help', text: R.verdict + ' ✔ یعنی خطای نسبی کمتر از ۰٫۹۵ و DM ≥ ۲ با دست‌کم ۳۰ پیش‌بینی. ارزیابی با پنجرهٔ گسترشی است و هر پیش‌بینی فقط داده تا همان نقطه را دیده است.' }));
        var f = R.fc, last = sr.labels[sr.labels.length - 1];
        body.push(h('p', { text: 'پیش‌بینی ' + sr.h + ' دورهٔ بعد از «' + last + '» با ' + ME.MODELS[f.model].fa + ': ' + fa(f.point, 3) + ' (بازهٔ ۱۰٪ تا ۹۰٪ از خطاهای خارج از نمونهٔ گذشتهٔ همین مدل: ' + fa(f.lo, 3) + ' تا ' + fa(f.hi, 3) + '). بازه تضمین نیست.' }));
        body.push(h('div', { class: 'row-ctl' }, [h('button', { class: 'btn', type: 'button', text: 'ثبت این پیش‌بینی برای سنجش بعدی', onclick: function () { M.log.push({ id: 'l' + Date.now(), sid: sr.id, name: sr.name, h: sr.h, from: last, model: f.model, point: f.point, lo: f.lo, hi: f.hi, at: new Date().toISOString().slice(0, 10), actual: null }); saveS(S); ctx.rerender(); } }),
          h('button', { class: 'btn ghost', type: 'button', text: 'حذف سری', onclick: function () { M.series = M.series.filter(function (x) { return x.id !== sr.id; }); S.mac.series = M.series; saveS(S); ctx.rerender(); } })])); }
      return h('div', null, body); });
    var lg = M.log.map(function (l) {
      var i = h('input', { class: 'cell-in', type: 'text', inputmode: 'decimal', style: 'width:90px', 'aria-label': 'مقدار تحقق‌یافته', value: l.actual == null ? '' : String(l.actual) });
      i.addEventListener('change', function () { var v = Number(String(i.value).replace(/,/g, '')); l.actual = i.value.trim() === '' || !isFinite(v) ? null : v; saveS(S); ctx.rerender(); });
      var done = l.actual != null, e = done ? l.actual - l.point : NaN;
      return [l.name, l.at, 'از «' + l.from + '» + ' + fa(l.h, 0) + ' دوره', fa(l.point, 3), fa(l.lo, 3) + ' تا ' + fa(l.hi, 3), i, done ? fa(e, 3) : '—', done ? (l.actual >= l.lo && l.actual <= l.hi ? 'درون بازه' : 'بیرون بازه') : 'در انتظار']; });
    var gr = M.log.filter(function (l) { return l.actual != null; });
    return ctx.panel('موتور کلان: ارزیابی پیش‌بینی متغیرهای اقتصادی (بدون معیار بک‌تست معاملاتی)', [
      h('p', { class: 'f-help', text: 'متغیر کلان (تورم، نقدینگی، رشد، نرخ بهره، PMI، شکاف نرخ ارز…) ابزار معاملاتی نیست؛ پس با سود و زیان سنجیده نمی‌شود، با خطای پیش‌بینی خارج از نمونه در برابر پیش‌بینی ساده سنجیده می‌شود. داده‌ها را شما از منبع رسمی وارد می‌کنید (ابزار هنوز دریافت خودکار آمار کلان ندارد). مدل‌ها ساده‌اند (آخرین مقدار، روند، خودرگرسیون روی تغییرها، فصلی)؛ تأخیر زمانی، علیت و روابط چندمتغیره بررسی نمی‌شوند.' }),
      h('div', { class: 'row-ctl' }, [nm, per, h('label', { class: 'f-help' }, ['افق: ', hh]), add]), ta].concat(items.length ? items : [h('p', { class: 'muted', text: 'هنوز سری‌ای اضافه نشده است.' })]).concat([
      h('h4', { text: 'ثبت پیش‌بینی‌ها و سنجش با مقدار تحقق‌یافته' + (gr.length ? ' — ' + fa(gr.length, 0) + ' مورد سنجیده شد: میانگین قدر مطلق خطا ' + fa(gr.reduce(function (a, l) { return a + Math.abs(l.actual - l.point); }, 0) / gr.length, 3) + '، درون بازه ' + fa(gr.filter(function (l) { return l.actual >= l.lo && l.actual <= l.hi; }).length, 0) + ' از ' + fa(gr.length, 0) : '') }),
      lg.length ? table(['متغیر', 'ثبت', 'مبنا', 'پیش‌بینی', 'بازه', 'مقدار تحقق‌یافته', 'خطا', 'وضعیت'], lg) : h('p', { class: 'muted', text: 'پیش‌بینی ثبت‌شده‌ای نیست.' })]));
  }

  function xgPanel(ctx) {
    var S = ctx.S, E = ensure(S), X = ctx.R.X, G2 = X.xg, cfg = Object.assign({}, TE.XGD, E.xg || {}), body = [];
    var inp = function (k, lab, w) { var i = h('input', { class: 'cell-in', type: 'text', inputmode: 'decimal', style: 'width:' + (w || 60) + 'px', 'aria-label': lab, value: cfg[k] == null ? '' : String(cfg[k]) });
      i.addEventListener('change', function () { var v = i.value.trim() === '' ? null : Number(i.value); if (v != null && !isFinite(v)) { U.toast('عدد معتبر وارد کنید.', 'warn'); return; } E.xg = E.xg || {}; E.xg[k] = v; saveS(S); ctx.rerender(); });
      return h('label', { class: 'f-help', style: 'display:inline-block;margin:4px 12px 4px 0' }, [lab + ': ', i]); };
    body.push(h('p', { class: 'f-help', text: 'راهبرد XG1 (آزمون مستقل): «حباب» هر طلای داخلی نسبت به ارزش ذاتی از اونس جهانی و دلار آزاد (همان فرمول ابزار طلا). اگر حباب نسبت به میانگین L روز اخیرش دست‌کم zIn انحراف معیار پایین‌تر باشد، طلای داخلی نسبت به جهانی ارزان است ← خرید؛ خروج با بازگشت حباب به میانگین، حد ضرر یا پایان مهلت. تصمیم با قیمت پایانی روز و اجرا با قیمت روز بعد. هر طلا جدا آزموده می‌شود (سری‌ها به هم بسیار وابسته‌اند و جمع کردنشان نمونه را بادکرده نشان می‌دهد).' }));
    body.push(h('div', null, [inp('L', 'پنجرهٔ میانگین L (روز)'), inp('zIn', 'آستانهٔ ورود zIn'), inp('zOut', 'آستانهٔ خروج zOut'), inp('T', 'مهلت (جلسه)'), inp('k', 'ضریب حد ضرر k'), inp('cost', 'هزینهٔ رفت‌وبرگشت (خالی = هزینهٔ حساب)', 70)]));
    body.push(h('p', { class: 'small muted', text: 'هزینهٔ فعلی ' + pct(G2 && G2.cost, 2) + '. برای طلای فیزیکی و سکه فاصلهٔ قیمت خرید و فروش و اجرت ساخت معمولاً از کارمزد بورس بیشتر است؛ عدد واقعی بازار خودتان را وارد کنید (این ابزار آن را نمی‌داند).' }));
    if (!G2 || !G2.inst || !G2.inst.length) { body.push(h('p', { class: 'neg', text: (G2 && G2.note) || 'سری طلای داخلی با وزن و عیار تعریف‌شده پیدا نشد.' })); return ctx.panel('تحلیل بین‌بازاری: طلای داخلی در برابر طلای جهانی', body); }
    if (G2.sample) body.push(h('p', { class: 'neg', text: 'دادهٔ طلا نمونه (ساختگی) است؛ همهٔ نتیجه‌ها درجه D و بی‌اعتبارند. از «مرکز دادهٔ بازار» طلا را به‌روز کنید.' }));
    body.push(table(['طلا', 'دوره', 'حباب امروز', 'میانگین حباب', 'z', 'وضعیت', 'معامله', 'امید ریاضی', 'خارج از نمونه', 'برتری بر نگه‌داری', 'حساسیت پارامتر', 'درجه', 'سیگنال'], G2.inst.map(function (o) {
      if (o.none) return [o.name, '—', '—', '—', '—', o.none, '—', '—', '—', '—', '—', '—', '—'];
      var e = o.ev, oo = e.oos || {}, w = o.now;
      return [o.name, TE.shamsi(o.from) + ' تا ' + TE.shamsi(o.to), pct(w.prem, 1), pct(w.premMean, 1), isFinite(w.z) ? fa(w.z, 2) : '—', w.state, fa(e.n || 0, 0), e.n ? fa(e.avgR, 2) + 'R' : '—', oo.n ? fa(oo.n, 0) + ' · ' + fa(oo.avgR, 2) + 'R' : '—', isFinite(o.lift) ? pct(o.lift, 2) + ' (t ' + fa(o.liftT, 1) + ')' : '—', fa(o.gridPos, 0) + '/' + fa(o.gridN, 0), chip(o.grade, GCHIP[o.grade]),
        o.signal === 'buy' ? chip('خرید تأییدشده', 'fit-rec') : o.signal === 'unconfirmed' ? chip('عدم صدور سیگنال — شواهد کافی نیست', 'fit-no') : '—']; })));
    G2.inst.filter(function (o) { return !o.none; }).forEach(function (o) {
      var w = o.now, d = [h('summary', { text: o.name + ' — درجه ' + o.grade + ' (' + o.fa + ')' })];
      d.push(table(['فیلد', 'مقدار'], [['آخرین قیمت (' + TE.shamsi(w.date) + ')', fa(w.last, 0)], ['قیمت هدف (بازگشت حباب به میانگین، با اونس و دلار امروز)', fa(w.target, 0)], ['حد ضرر', fa(w.stop, 0)], ['R:R', isFinite(w.rr) ? '۱:' + fa(w.rr, 2) : '—'], ['مهلت', fa(cfg.T, 0) + ' جلسه'],
        ['شرط ابطال', 'بسته‌شدن زیر حد ضرر؛ یا افت بیشتر حباب در حالی که اونس و دلار ثابت‌اند (یعنی عامل داخلی مثل سیاست بانک مرکزی یا عرضهٔ سکه، نه قیمت جهانی، حباب را می‌راند)'],
        ['ریسک‌ها', 'هدف با اونس و دلار امروز محاسبه شده و با تغییر آن‌ها جابه‌جا می‌شود؛ قیمت TGJU قیمت معامله‌شدهٔ شما نیست؛ حباب ممکن است به‌خاطر تغییر ساختاری (مالیات، پیش‌فروش، حراج، محدودیت واردات) میانگین تازه پیدا کند.'],
        ['خوانش «گران نسبت به جهانی»', o.hi.n ? 'بازده ۲۰ روز بعد از آن: ' + pct(o.hi.m, 2) + ' در ' + fa(o.hi.n, 0) + ' مورد، در برابر ' + pct(o.hi.any, 2) + ' برای هر روز (' + fa(o.hi.nAny, 0) + ' نمونهٔ بدون هم‌پوشانی). نمونهٔ کوچک فقط توصیف است، نه سیگنال فروش.' : 'در این دوره رخ نداد.'],
        ['برتری بر نگه‌داری ساده', isFinite(o.lift) ? 'میانگین بازدهٔ معامله‌ها منهای میانگین بازدهٔ نگه‌داری ' + fa(o.Hb, 0) + ' جلسه‌ای از هر روز = ' + pct(o.lift, 2) + ' (t ' + fa(o.liftT, 2) + '). بدون این آزمون، رشد تورمی طلا هر خریدی را سودده نشان می‌دهد.' : '—'],
        ['حسابرسی نگاه به آینده', o.audit.diff ? 'اختلاف یافت شد' : 'بدون اختلاف در ' + fa(o.audit.chk, 0) + ' مقایسه']], 'sig-t'));
      d.push(h('p', { class: 'small muted', text: o.grade === 'A' ? 'شرایط برقرار:' : 'چرا درجهٔ بالاتر نیست:' })); d.push(list(o.grade === 'A' ? o.ok : o.reasons));
      d.push(table(['L', 'zIn', 'معامله', 'امید ریاضی'], o.grid.map(function (g) { return [fa(g.L, 0), fa(g.zIn, 1), fa(g.n, 0), g.n ? fa(g.avgR, 2) + 'R' : '—']; })));
      if (o.trades.length) d.push(table(['ورود', 'خروج', 'z ورود', 'نتیجه', 'بازده', 'دلیل خروج'], o.trades.slice().reverse().map(function (t) { return [TE.shamsi(t.d), TE.shamsi(t.xd), fa(t.z, 2), fa(t.r, 2) + 'R', pct(t.ret, 2), { tp: 'بازگشت به میانگین', stop: 'حد ضرر', time: 'مهلت' }[t.exit] || t.exit]; })));
      body.push(h('details', null, d)); });
    body.push(h('p', { class: 'f-help', text: 'محدودیت‌ها: تاریخچه همان مقدار دریافتی از TGJU است (هدف دریافت ۱٬۲۵۰ جلسه، تعیین‌شده بر اساس افق‌ها) و با ۱۲۰ روز گرم‌شدن، معامله‌ها کم می‌مانند؛ نمونهٔ کم یعنی درجهٔ پایین، نه رد راهبرد. اونس در روزهای تعطیل جهانی از آخرین روز قبل برداشته می‌شود. دلار آزاد TGJU مبنای ذاتی است، نه نرخ رسمی یا نیمایی.' }));
    return ctx.panel('تحلیل بین‌بازاری: طلای داخلی در برابر طلای جهانی (راهبرد XG1)', body);
  }

  /* ---------- dashboard: priorities first (directive 14), forecast, active signals, market pulse, phone widget ---------- */
  var KINDFA = { urgent: 'فوری (موقعیت شما)', now: 'فوری', conditional: 'مشروط', wait: 'مشروط — هنوز نخرید', none: '—', cashalt: 'تا فعال‌شدن شرط' };
  function prioTable(P) { return table(['رتبه', 'بازار / دارایی', 'اقدام پیشنهادی', 'افق زمانی', 'ریسک', 'درجهٔ اعتبار', 'دلیل اولویت'], P.map(function (p) { return [fa(p.rank, 0), p.market + ' · ' + p.asset, p.action, p.horizon, p.risk, p.grade, p.why]; })); }
  function prioCards(P) { return h('div', { class: 'prio-list' }, P.map(function (p) {
    var col = p.kind === 'urgent' ? 'fit-no' : p.kind === 'now' ? 'fit-rec' : p.kind === 'conditional' ? 'fit-cond' : 'sev-info';
    return h('details', { class: 'prio-card k-' + p.kind }, [h('summary', null, [h('div', { class: 'mini-l1' }, [h('span', { class: 'prio-rank', 'data-notr': '1', text: fa(p.rank, 0) }), h('strong', { 'data-notr': '1', text: p.asset }), chip(p.action, col), p.grade !== '—' ? chip('درجه ' + p.grade, GCHIP[p.grade]) : null]),
      h('div', { class: 'mini-l2', 'data-notr': '1', text: p.market + ' · ' + p.horizon + ' · ریسک ' + p.risk + ' · ' + KINDFA[p.kind] })]),
      h('div', { class: 'mini-body' }, [table(['فیلد', 'مقدار'], [['دلیل اولویت', p.why], ['شرط ورود / اقدام', p.cond || '—'], ['شرط ابطال', p.inval || '—']].concat(p.stop ? [['حد ضرر · اهداف', fa(p.stop, 0) + ' · ' + (p.tp || []).map(function (x) { return fa(x, 0); }).join(' / ')]] : []).concat(isFinite(p.expR) ? [['امید ریاضی خارج از نمونهٔ شواهد', fa(p.expR, 2) + 'R در هر معامله']] : []), 'sig-t')])]); })); }

  /* ---------- decision panels: best action across markets, top opportunities with reasoning, market forecasts ---------- */
  var DIRC = { up: 'fit-rec', down: 'fit-no', upw: 'fit-cond', downw: 'fit-cond', flat: 'sev-info', none: 'sev-info', unknown: 'sev-info' }, DIRA = { up: '↑ صعودی', down: '↓ نزولی', upw: '↗ ضعیف صعودی', downw: '↘ ضعیف نزولی', flat: '↔ خنثی', none: 'بدون داده', unknown: 'نامشخص' };
  function fpx(f, v) { return isFinite(v) ? fa(v, f.cls === 'gold' && f.key === 'g:ons' ? 1 : 0) : '—'; }
  function oppCard(f) {
    var rows = [['جهت پیش‌بینی', DIRA[f.dir] + ' (کوتاه و میان‌مدت، از رأی مدل‌ها) · بلندمدت: ' + DIRA[f.long] + ' (' + f.longBasis + ')'],
      ['اقدام پیشنهادی', f.scen[0].act], ['شرط تأیید', f.confirm], ['شرط ابطال', f.invalid],
      ['بازهٔ ۲۰ جلسه (۱۰٪ · میانه · ۹۰٪ بازده‌های گذشتهٔ همین دارایی)', f.r20 ? fpx(f, f.last * (1 + f.r20[0])) + ' · ' + fpx(f, f.last * (1 + f.r20[1])) + ' · ' + fpx(f, f.last * (1 + f.r20[2])) : 'تاریخچه کافی نیست'],
      ['احتمال بالاتر بودن', f.prob && f.prob.length ? f.prob.map(function (q) { return fa(q.h, 0) + ' جلسه: ' + pct(q.p, 0) + (q.skill ? ' (مدل با مهارت)' : ' (نرخ پایه؛ مبنای پیش‌بینی معتبر نیست)'); }).join(' · ') : 'مبنای معتبر برای احتمال نیست'],
      ['بازده مورد انتظار هر معامله (بک‌تست)', isFinite(f.expRet) ? pct(f.expRet, 2) + ' (امید ریاضی خارج از نمونهٔ ' + fa(f.expN, 0) + ' معامله × فاصلهٔ حد ضرر ' + pct(f.riskFrac, 1) + ')' : '—'],
      ['ریسک نزولی ۲۰ جلسه (۱۰٪ بدترین)', pct(f.down20, 1)], ['درجهٔ اعتبار', f.label],
      ['چرا (مدل‌های موافق)', f.drivers.join('؛ ') || '—'], ['چه چیزی این انتخاب را اشتباه می‌کند', [f.invalid].concat(f.against).join('؛ ')],
      ['با چه مقایسه شد', 'رتبه بر اساس جذابیت = وزن درجه × اطمینان × بازده مورد انتظار ÷ ریسک نزولی؛ گزینه‌های بعدی: ' + (f.vs && f.vs.length ? f.vs.join('، ') : '—')], ['از آن صرف‌نظر کنید اگر', f.invalid + '؛ یا درجهٔ اعتبار به D برسد']];
    return h('details', { class: 'prio-card k-' + (f.confirmed ? 'now' : 'conditional') }, [h('summary', null, [h('div', { class: 'mini-l1' }, [h('span', { class: 'prio-rank', 'data-notr': '1', text: fa(f.rank, 0) }), h('strong', { 'data-notr': '1', text: f.sym }), chip(CLS[f.cls] || f.cls, 'sev-info'), chip(DIRA[f.dir], DIRC[f.dir]), chip(f.confirmed ? 'درجه ' + f.grade : 'مشروط · ' + f.grade, f.confirmed ? 'fit-rec' : 'fit-cond')]),
      h('div', { class: 'mini-l2', 'data-notr': '1', text: f.scen[0].act })]), h('div', { class: 'mini-body' }, [table(['فیلد', 'مقدار'], rows, 'sig-t')])]);
  }
  function decisionPanels(ctx) {
    var S = ctx.S, E = ensure(S), X = ctx.R.X, D = X.decide(), B = D.best, out = [];
    var cr = h('input', { class: 'cell-in', type: 'text', inputmode: 'decimal', style: 'width:70px', 'aria-label': 'نرخ سود سالانهٔ نقد (٪)', value: isFinite(E.cashRate) ? String(Math.round(E.cashRate * 1000) / 10) : '' });
    cr.addEventListener('change', function () { var v = Number(cr.value); E.cashRate = cr.value.trim() === '' || !isFinite(v) ? null : v / 100; saveS(S); ctx.rerender(); });
    var cov = Object.keys(D.by).map(function (k) { var b = D.by[k]; return (k === 'stock' ? 'سهام و صندوق' : CLS[k] || k) + ' ' + fa(b.n, 0); }).join('، ');
    out.push(ctx.panel('بهترین اقدام من در شرایط فعلی', [updPanel(ctx), h('p', { class: 'today-head', text: B.text }), h('p', { text: B.why }),
      h('p', { class: 'small', text: isFinite(B.cashRet) ? 'مقایسه با نقد: نرخ ' + pct(B.cashRate, 1) + ' سالانه ≈ ' + pct(B.cashRet, 2) + ' در افق معامله‌ها.' : 'برای مقایسه با نگه‌داری نقد، نرخ سود سالانهٔ نقد (سپرده یا اوراق) را وارد کنید:' }), h('label', { class: 'f-help' }, ['نرخ سود سالانهٔ نقد (٪): ', cr]),
      h('p', { class: 'small muted', text: B.reinvest }),
      h('p', { class: 'small muted', text: 'بررسی‌شده: ' + fa(D.screened, 0) + ' دارایی (' + cov + ')؛ ' + fa(D.ranked, 0) + ' مورد دید صعودی و امید ریاضی مثبت در بک‌تست داشتند. بدون داده (بررسی نشد): رمزارز، سهام و کالاهای جهانی، اوراق و نرخ بهره. پیش‌بینی، سیگنال و بهترین اقدام سه چیز جدا هستند: پیش‌بینی جهت است، سیگنال یعنی شواهد بک‌تست برای ورود کافی است، بهترین اقدام مقایسهٔ همهٔ گزینه‌ها با هم و با نقد است.' })]));
    out.push(ctx.panel('فرصت‌های برتر میان همهٔ بازارهای تحت پوشش (' + fa(D.top.length, 0) + ')', D.top.length ? [h('p', { class: 'small muted', text: 'تعداد تابع کیفیت است، نه سهمیه. روی هر مورد بزنید: اقدام، محدوده، احتمال، بازده و ریسک، دلیل انتخاب، مقایسه و شرط ابطال.' })].concat(D.top.map(oppCard)) : [h('p', { class: 'muted', text: 'هیچ دارایی با دید صعودی و امید ریاضی مثبت در بک‌تست نیست.' })]));
    out.push(ctx.panel('پیش‌بینی بازارها', [table(['بازار', 'جهت مورد انتظار', 'مبنا'], D.markets.map(function (m) { return [m.name, chip(DIRA[m.dir], DIRC[m.dir]), m.note]; })),
      h('details', null, [h('summary', { text: 'پیش‌بینی همهٔ دارایی‌ها (' + fa(D.all.length, 0) + ')' }), table(['دارایی', 'بازار', 'کوتاه/میان‌مدت', 'بلندمدت', 'بازهٔ ۲۰ جلسه', 'اطمینان', 'درجه'], D.all.slice().sort(function (a, b) { return Math.abs(b.S) - Math.abs(a.S); }).slice(0, 80).map(function (f) {
        return [f.sym, CLS[f.cls] || f.cls, DIRA[f.dir], DIRA[f.long], f.r20 ? pct(f.r20[0], 0) + ' تا ' + pct(f.r20[2], 0) : '—', fa(f.conf, 0) + '٪', f.grade]; }))]),
      h('p', { class: 'small muted', text: 'جهت کوتاه و میان‌مدت از رأی ترکیبی مدل‌های موتور است (نه سیگنال)؛ برچسب «مشروط و تأییدنشده» یعنی بک‌تست هنوز آن را به درجهٔ B نرسانده. احتمال فقط وقتی آمده که مدل روی همان سری از نرخ پایه بهتر بوده باشد.' })]));
    return out;
  }

  /* ---------- data health, source hierarchy, global and crypto snapshot, intermarket ---------- */
  function healthPanels(ctx) {
    var GMK = Hub.globalMkt; if (!GMK) return [];
    var Hh = GMK.health(), bad = Hh.items.filter(function (i) { return !i.ok; }).length + Hh.cross.filter(function (c) { return !c.ok; }).length, out = [];
    out.push(ctx.panel('سلامت داده‌ها (' + (bad ? fa(bad, 0) + ' هشدار' : 'بدون هشدار') + ')', [
      h('p', { class: 'small muted', text: 'برای هر سری: تاریخ آخرین داده نسبت به تقویم همان بازار، شکاف‌ها، جهش‌های غیرعادی (بیش از ۶ انحراف معیار یا ۲۵٪)، و مقایسه با منبع مستقل. داده‌ای که هشدار دارد به‌عنوان قیمت جاری قابل اتکا نیست.' }),
      table(['سری', 'منبع', 'آخرین', 'تاریخ', 'سن (روز)', 'وضعیت'], Hh.items.map(function (i) { return [i.name, i.src, fa(i.last, i.last < 100 ? 2 : 0), i.date ? TE.shamsi(i.date) : '—', isFinite(i.age) ? fa(i.age, 0) : '—', i.ok ? chip('سالم', 'fit-rec') : chip(i.issues.join('؛ '), 'fit-cond')]; })),
      h('h4', { text: 'مقایسه بین منابع مستقل' }),
      Hh.cross.length ? table(['مقایسه', 'الف', 'ب', 'اختلاف', 'وضعیت', 'توضیح'], Hh.cross.map(function (c) { return [c.label, fa(c.a, c.a < 100 ? 2 : 0), fa(c.b, c.b < 100 ? 2 : 0), pct(c.diff, 2), c.ok ? chip('در حد معمول', 'fit-rec') : chip('اختلاف غیرعادی (بیش از ' + pct(c.tol, 1).replace('+', '') + ')', 'fit-no'), c.why]; })) : h('p', { class: 'muted', text: 'هنوز دو منبع مستقل برای مقایسه دریافت نشده است.' }),
      h('details', null, [h('summary', { text: 'سلسله‌مراتب منابع (در اختلاف، کدام مبناست)' }), table(['بازار', 'منبع اصلی', 'کنترل/پشتیبان'], GMK.HIER)])]));
    var G = GMK.store(), sn = G && G.snap || {}, rows = [];
    if (sn.cgGlobal) rows.push(['ارزش کل بازار رمزارز', fa(sn.cgGlobal.mcap / 1e12, 2) + ' تریلیون دلار · تغییر ۲۴ ساعت ' + pct((sn.cgGlobal.chg || 0) / 100, 1), 'CoinGecko']);
    if (sn.cgGlobal) rows.push(['سهم بیت‌کوین از بازار', pct((sn.cgGlobal.dom || 0) / 100, 1).replace('+', ''), 'CoinGecko']);
    if (sn.nbx) { var nbs = sn.nbx.src || 'نوبیتکس'; rows.push(['بیت‌کوین به ریال (' + nbs + ')', fa(sn.nbx.btcRls.last, 0) + ' ریال', nbs + ' (آخرین معامله)']); rows.push(['تتر به ریال (' + nbs + ')', fa(sn.nbx.usdtRls.last, 0) + ' ریال', nbs + ' (آخرین معامله)']); }
    if (sn.funding) rows.push(['Funding Rate بیت‌کوین (قرارداد دائمی)', pct(sn.funding.rate, 4), (sn.funding.src || 'OKX') + '؛ مثبت = خریداران اهرمی کارمزد می‌دهند']);
    if (sn.oi) rows.push(['Open Interest بیت‌کوین', fa(sn.oi.oiCcy, 0) + ' BTC', (sn.oi.src || 'OKX') + ' (فقط همین صرافی)']);
    if (sn.fng) rows.push(['شاخص ترس و طمع رمزارز', fa(sn.fng.v, 0) + ' (' + sn.fng.label + ')', 'alternative.me']);
    var errs = G && G.lastErrs || [];
    out.push(ctx.panel('بازارهای جهانی و رمزارز', [rows.length ? table(['شاخص', 'مقدار', 'منبع'], rows) : h('p', { class: 'muted', text: 'هنوز دریافت نشده؛ «به‌روزرسانی همهٔ بخش‌ها» را بزنید.' }),
      h('p', { class: 'small muted', text: 'نفت برنت از TGJU؛ WTI، گاز طبیعی، مس و آلومینیوم از Alpha Vantage با کلید شما (روزی یا هفته‌ای یک بار)؛ بازده ۱۰ سالهٔ آمریکا از وزارت خزانه‌داری آمریکا و نرخ فدرال از فدرال رزرو نیویورک (هر دو رسمی)؛ شاخص‌های جهانی از سرویس نمودار CNBC. Yahoo و FRED از شبکهٔ شما جواب نمی‌دهند و حذف شدند. همه قیمت پایانی روزند، نه لحظه‌ای.' }),
      errs.length ? h('details', null, [h('summary', { text: 'خطاهای آخرین دریافت (' + fa(errs.length, 0) + ')' }), list(errs)]) : null]));
    var IM = GMK.intermarket();
    out.push(ctx.panel('همبستگی بین‌بازاری', [IM.length ? table(['جفت', 'همبستگی ۶۰ روز', 'همبستگی ۲۵۰ روز', 'وضعیت'], IM.map(function (r) { return [r.label, isFinite(r.c60) ? fa(r.c60, 2) : '—', isFinite(r.c250) ? fa(r.c250, 2) : '—', r.brk ? chip('تغییر رابطه (بیش از ۰٫۴)', 'fit-cond') : '—']; })) : h('p', { class: 'muted', text: 'دادهٔ کافی برای جفت‌ها نیست.' }),
      h('p', { class: 'small muted', text: 'همبستگی بازده روزانه در تاریخ‌های مشترک؛ همبستگی رابطهٔ علّی نیست. «تغییر رابطه» یعنی همبستگی اخیر با یک سال گذشته فرق جدی دارد؛ تحلیل‌هایی که روی رابطهٔ قدیمی تکیه دارند باید بازبینی شوند.' })]));
    return out;
  }
  /* ---------- Trading Decision Dashboard: overview · top opportunities · scenarios · monitoring · risk (one source: decide().desk) ---------- */
  var STC8 = { confirmed: 'fit-rec', t1: 'fit-rec', t2: 'fit-rec', t3: 'fit-rec', priceok: 'fit-cond', near: 'fit-cond', pending: 'fit-ok', nosig: 'fit-ok', bear: 'fit-no', stopped: 'fit-no', invalid: 'fit-no', expired: 'fit-ok' };
  var DIRS = { up: '↑ صعودی', down: '↓ نزولی', flat: '↔ خنثی', upw: '↗ ضعیف صعودی', downw: '↘ ضعیف نزولی', none: 'بدون داده' };
  function isF(v) { return typeof v === 'number' && isFinite(v); }
  function nd(x, v) { return fa(v, x && x.unit === 'دلار' ? 1 : x && /٪/.test(x.unit || '') ? 2 : 0); }
  function stChip(k, t) { return h('span', { class: 'sev ' + (STC8[k] || 'fit-ok'), text: t || (TE.ST8 || {})[k] || k }); }
  function deskPanels(ctx) {
    var S = ctx.S, X = ctx.R.X, D = X.decide(), K = D.desk; if (!K) return [];
    var tr = K.track, upd = tr && tr.active.length ? tr.active.map(function (s) { return s.upd; }).sort().pop() : null, ps = [];
    var stOf = function (x) { var s = x.track; return s ? s.st : x.S.state; };
    // ---- one verdict for every view: central record summary and the consistency monitor
    (function () {
      var C = X.central, CM = X.consistency; if (!C) return; var all = Object.keys(C.by).map(function (k) { return C.by[k]; });
      var grp = function (f) { return all.filter(f); }, nm = function (a) { return a.length ? a.slice(0, 12).map(function (r) { return r.sym; }).join('، ') + (a.length > 12 ? ' و ' + fa(a.length - 12, 0) + ' مورد دیگر' : '') : 'هیچ'; };
      var buy = grp(function (r) { return r.act === 'buy' || r.act === 'scale'; }).sort(function (a, b) { return (a.rank || 99) - (b.rank || 99); }), ex = grp(function (r) { return r.held && /^(sell|close|reduce)$/.test(r.act); }), hold = grp(function (r) { return r.held && r.act === 'hold'; });
      var near = grp(function (r) { return r.act === 'wait' && r.en === 'in'; }), waitA = grp(function (r) { return r.act === 'wait' && r.en !== 'in'; }), rej = grp(function (r) { return r.st === 'rej' && r.rank == null && r.conf >= 60; });
      ps.push(ctx.panel('تصمیم موتور مرکزی (همان خروجی در همهٔ بخش‌ها)', [
        table(['گروه', 'تعداد', 'دارایی‌ها'], [['خرید یا خرید پله‌ای (تأییدشده، قیمت در محدودهٔ ورود)', fa(buy.length, 0), nm(buy)], ['فروش / کاهش / بستن (دارایی‌هایی که دارید)', fa(ex.length, 0), nm(ex)], ['نگهداری (دارایی‌هایی که دارید)', fa(hold.length, 0), nm(hold)],
          ['نزدیک ورود (قیمت در محدوده، شرطی مانده)', fa(near.length, 0), nm(near)], ['انتظار برای تأیید یا اصلاح قیمت', fa(waitA.length, 0), nm(waitA)], ['ردشدهٔ مهم (اطمینان مدل ≥ ۶۰٪ ولی دروازهٔ اعتبار رد)', fa(rej.length, 0), nm(rej)]]),
        h('p', { class: 'small muted', text: 'سیگنال برای هر دارایی یکی است؛ اقدام به موقعیت شما بستگی دارد: سیگنال نزولی برای کسی که دارایی را ندارد «عدم اقدام» است و برای دارنده «فروش» یا «کاهش». موتور مرکزی: ' + new Date(C.at).toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' }) + (X.centralSaved && X.centralSaved.upd ? ' · ' + X.centralSaved.upd : '') }),
        CM ? h('div', {}, [h('p', { class: CM.crit ? 'warn-t' : 'small', text: 'کنترل سازگاری: ' + (CM.crit ? fa(CM.crit, 0) + ' مغایرت اثرگذار (خروجی مربوط منتشر نمی‌شود)' : 'بدون مغایرت اثرگذار') + (CM.warn ? ' · ' + fa(CM.warn, 0) + ' هشدار' : '') }),
          CM.list.length ? table(['شدت', 'مغایرت', 'دارایی', 'جزئیات'], CM.list.slice(0, 30).map(function (m) { return [m.sev === 'crit' ? 'اثرگذار' : 'هشدار', m.what, m.sym, m.detail]; })) : null]) : null]));
      var CS = X.centralSaved; if (CS && CS.changes && CS.changes.length) ps.push(ctx.panel('تغییر وضعیت سیگنال‌ها نسبت به اجرای قبلی (' + fa(CS.changes.length, 0) + ')', [table(['دارایی', 'قبلی', 'جدید', 'قیمت اکنون', 'دلیل'], CS.changes.slice(0, 40).map(function (c) { return [c.sym, c.from, c.to, fa(c.px), (c.why || '').slice(0, 160)]; })), h('p', { class: 'small muted', text: 'سابقهٔ قبلی پاک نمی‌شود: ' + fa((CS.hist || []).length, 0) + ' نوبت تغییر ثبت شده است.' })]));
    })();
    // ---- at a glance: the eight questions of the directive
    var bestMk = K.over.filter(function (o) { return o.opp; })[0], nearL = K.near.concat(K.opp.filter(function (x) { return stOf(x) === 'near' || stOf(x) === 'pending'; })).slice(0, 5);
    var o0 = (K.top10 || [])[0];
    var T = K.top10 || [], by = function (st) { return T.filter(function (x) { return x.st9 === st; }); }, names = function (a) { return a.length ? a.map(function (x) { return x.sym; }).join('، ') : 'هیچ'; };
    var entryNow = T.filter(function (x) { return x.act.k === 'now' || x.act.k === 'zone'; }), SG0 = K.strat || {}, selTxt = Object.keys(SG0).filter(function (k) { return SG0[k].sel; }).map(function (k) { var s = SG0[k], p = k.split('|'); return (TE.MKFA[p[0]] || p[0]) + ' / ' + (TE.HZ[p[1]] ? TE.HZ[p[1]].fa.split(' ')[0] : p[1]) + ': ' + s.rows[s.sel].fa + ' (' + fa(s.rows[s.sel].oos.avgR, 2) + 'R برون‌نمونه)'; }).join('؛ ');
    var A0 = tr && tr.acc;
    var gl = [['۱۰ فرصت برتر فعلی (همهٔ بازارها)', T.length ? T.map(function (x) { return x.sym + ' (' + x.mk + ')'; }).join('، ') : 'هیچ فرصت واجد شرایطی نیست'], ['واقعاً سیگنال ورود دارند (اقدام: ورود)', names(entryNow) + (entryNow.length ? '' : ' — ورود فقط با درجهٔ A/B و قیمت در محدودهٔ ورود')],
      // one status set for every list (directive 12.7 / 13): the price pattern alone is not «confirmed» — the gate and today's price decide
      ['تأییدشده (دروازهٔ اعتبار گذشته و قیمت در محدودهٔ ورود)', names(T.filter(function (x) { return x.v6 && x.v6.st === 'ok'; }))], ['مشروط (یک یا چند شرط هنوز برقرار نیست)', names(T.filter(function (x) { return x.v6 && x.v6.st === 'cond'; }))], ['نیازمند بررسی مجدد (قیمت بالاتر از محدودهٔ ورود)', names(T.filter(function (x) { return x.v6 && x.v6.st === 'review'; }))],
      ['اقدام هر فرصت', T.length ? T.map(function (x) { return x.sym + ': ' + x.act.fa; }).join('؛ ') : '—'], ['ورود / خروج / حد ضرر / اهداف (رتبهٔ ۱)', o0 ? (function () { var l = o0.act.lv || { entry: [o0.S.bull.lo, o0.S.bull.hi], stop: o0.S.bull.stop, tp: o0.S.bull.tp }; return o0.sym + ': ورود ' + nd(o0, l.entry[0]) + '–' + nd(o0, l.entry[1]) + ' · خروج پله‌ای ' + nd(o0, l.tp[0]) + '–' + nd(o0, l.tp[1]) + ' · حد ضرر ' + nd(o0, l.stop) + ' · اهداف ' + l.tp.map(function (v) { return nd(o0, v); }).join(' / '); })() : '—'],
      ['عملکرد تاریخی استراتژی منتخب', selTxt || 'اعتبارسنجی اجرا نشده'], ['شرط تغییر تصمیم (رتبهٔ ۱)', o0 ? o0.act.chg : '—'], ['دقت گذشتهٔ سیستم', A0 && A0.closed ? fa(A0.dirOK, 0) + ' از ' + fa(A0.dirKnown, 0) + ' جهت درست، ' + fa(A0.tgt, 0) + ' به هدف، ' + fa(A0.stop, 0) + ' حد ضرر (از ' + fa(A0.closed, 0) + ' سیگنال بسته)' : 'هنوز سیگنال بسته‌شده‌ای نیست']];
    ps.push(ctx.panel('مرکز تصمیم معاملاتی — در یک نگاه', [table(['پرسش', 'پاسخ'], gl), h('p', { class: 'small muted', text: 'منبع همهٔ این پنل‌ها همان تحلیل گزارش و فهرست اقدامات است. ' + fa(D.screened, 0) + ' دارایی در ' + fa(K.over.length, 0) + ' بازار بررسی شد' + (upd ? '؛ آخرین به‌روزرسانی پایش: ' + new Date(upd).toLocaleString('fa-IR') : '') + '.' })]));
    var ST9C = { active: 'fit-rec', retest: 'fit-rec', pos: 'fit-rec', target: 'fit-ok', near: 'fit-cond', nc: 'fit-ok', missed: 'fit-cond', stop: 'fit-no', invalid: 'fit-no', bear: 'fit-no', nosig: 'fit-ok' };
    var ACTC = { now: 'fit-rec', zone: 'fit-rec', hold: 'fit-rec', reduce: 'fit-cond', exit: 'fit-no', waitBrk: 'fit-cond', waitPb: 'fit-cond', wait: 'fit-cond', missed: 'fit-no', badRR: 'fit-no', none: 'fit-ok' };
    var chip9 = function (x) { return h('span', { class: 'sev ' + (ST9C[x.st9] || 'fit-ok'), text: x.st9fa }); }, chipA = function (x) { return h('span', { class: 'sev ' + (ACTC[x.act.k] || 'fit-ok'), text: x.act.fa }); };
    var LV = function (x) { var l = x.act.lv || { entry: [x.S.bull.lo, x.S.bull.hi], stop: x.S.bull.stop, tp: x.S.bull.tp, rr: x.S.bull.rr2 }; return l; };
    // ---- signal status against today's price (one status per signal, directives 12 and 13)
    var C6 = { ok: 'fit-rec', cond: 'fit-cond', review: 'fit-cond', rej: 'fit-no', exp: 'fit-no', nodata: 'fit-ok' };
    var chip6 = function (x) { var v = x.v6; return v ? h('span', { class: 'sev ' + (C6[v.st] || 'fit-ok'), text: v.stFa + ' · ' + v.enFa }) : chip9(x); };
    var hm = function (ts) { return ts ? new Date(ts).toLocaleString('fa-IR', { timeZone: 'Asia/Tehran', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; };
    var pxTxt = function (x) { var v = x.v6; if (!v) return nd(x, x.last) + ' (' + x.date + ')'; var q = v.px;
      return nd(x, q.v) + ' ' + (q.unit || '') + ' — ' + q.kind + (isFinite(q.lastTrade) && q.lastTrade > 0 && Math.abs(q.lastTrade / q.v - 1) > 0.0005 ? ' · آخرین معامله ' + nd(x, q.lastTrade) : '') + ' · منبع ' + (q.src || '—') + ' · دریافت ' + hm(q.fetched); };
    var issueTxt = function (x) { var i = x.v6 && x.v6.issue; return i && isFinite(i.p) ? nd(x, i.p) + ' (' + i.d + ') ← ' + pct(i.chg, 1) + ' تا اکنون' : 'در دفتر سیگنال ثبت نشده'; };
    var VDB = S.e && S.e.val && S.e.val.db, btAt = VDB && !VDB.sample && VDB.at ? new Date(VDB.at).toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' }) : 'اجرا نشده';
    var bt6 = function (x) { var b = x.v6 && x.v6.bt; if (!b) return 'بک‌تست معتبری برای ' + (x.gate ? x.gate.fa.split(' ')[0] : 'این افق') + ' نیست (آخرین اجرا: ' + btAt + ')';
      return (b.k || '') + ': موفقیت ' + pct(b.hit, 0) + ' · PF ' + fa(b.pf, 2) + ' · افت حداکثر ' + fa(b.mdd, 1) + 'R · ' + fa(b.n, 0) + ' معامله · برون‌نمونه ' + (b.oos && b.oos.n ? fa(b.oos.n, 0) + ' معامله، ' + fa(b.oos.avgR, 2) + 'R، PF ' + fa(b.oos.pf, 2) : 'ندارد') + ' · آخرین بک‌تست ' + btAt; };
    (function () {
      // first what can be acted on (confirmed, conditional, to re-check), then open positions, then the rest of the top ten; at most 25 rows
      var ORD6 = { ok: 0, cond: 1, review: 2, rej: 3, nodata: 4, exp: 5 }, seen6 = {}, rows6 = K.items.filter(function (x) { return x.v6 && (x.v6.st === 'ok' || x.v6.st === 'cond' || x.v6.st === 'review'); })
        .concat(K.held, K.top10 || []).filter(function (x) { if (seen6[x.key]) return false; seen6[x.key] = 1; return true; })
        .sort(function (a, b) { return (ORD6[a.v6 ? a.v6.st : 'nodata'] - ORD6[b.v6 ? b.v6.st : 'nodata']) || (b.score || 0) - (a.score || 0) || (b.conf || 0) - (a.conf || 0); }).slice(0, 25);
      var cnt = {}; K.items.forEach(function (x) { if (x.v6) cnt[x.v6.st] = (cnt[x.v6.st] || 0) + 1; });
      ps.push(ctx.panel('وضعیت سیگنال‌ها با قیمت فعلی', [
        h('p', { class: 'small', text: 'شمار همهٔ دارایی‌ها بر پایهٔ وضعیت: ' + Object.keys(K.ST6 || {}).map(function (k) { return K.ST6[k] + ' ' + fa(cnt[k] || 0, 0); }).join(' · ') + '. هر سیگنال پس از هر به‌روزرسانی دوباره با قیمت فعلی سنجیده می‌شود؛ محدودهٔ ورود برای دنبال کردن قیمت جابه‌جا نمی‌شود.' }),
        rows6.length ? table(['دارایی', 'قیمت مرجع (نوع، منبع، زمان دریافت)', 'قیمت هنگام صدور ← تغییر', 'محدودهٔ ورود (اولیه / فعلی)', 'فاصلهٔ قیمت از ورود', 'وضعیت سیگنال · وضعیت ورود', 'حد ضرر', 'اهداف', 'بازده به ریسک از قیمت فعلی', 'بک‌تست و اعتبارسنجی', 'اقدام پیشنهادی', 'دلیل'],
          rows6.map(function (x) { var v = x.v6 || {}, l = v.lv || LV(x), i0 = v.issue && v.issue.lv0;
            return [x.sym + ' (' + x.mk + ')', pxTxt(x), issueTxt(x), (i0 ? nd(x, i0.lo) + '–' + nd(x, i0.hi) + ' / ' : '') + nd(x, l.entry[0]) + '–' + nd(x, l.entry[1]), v.en === 'in' ? 'داخل محدوده' : pct(v.dist, 1), chip6(x), nd(x, l.stop), l.tp.map(function (q) { return nd(x, q); }).join(' / '), fa(v.rr, 1), bt6(x), v.st === 'ok' ? chipA(x) : h('span', { class: 'sev fit-cond', text: v.st === 'review' ? (v.en === 'missed' ? 'عدم ورود — فرصت ازدست‌رفته' : 'انتظار برای پولبک به محدوده') : v.st === 'cond' ? 'ورود مشروط — منتظر تحقق شرط' : v.st === 'exp' ? 'خارج از فهرست فعال' : 'عدم ورود' }), v.why]; }))
          : h('p', { class: 'muted', text: 'سیگنالی برای نمایش نیست.' }),
        h('p', { class: 'small muted', text: 'تأییدشده = استراتژی آزموده‌شده + شرط ورود برقرار + قیمت داخل محدوده. مشروط = استراتژی معتبر ولی یک شرط هنوز برقرار نیست. نیازمند بررسی مجدد = قیمت از محدوده خارج شده یا شواهد کهنه است. ردشده = استراتژی معتبر برای این بازار و افق نیست. منقضی‌شده = هدف یا حد ضرر یا پایان افق. قیمت بورس ایران: آخرین قیمت جلسه با تاریخ جلسه؛ طلا و ارز: قیمت لحظه‌ای TGJU با ساعت آن.' })]));
    })();
    // ---- A · market overview
    var macro = (D.markets || []).filter(function (m) { return /بهره|فلزات/.test(m.name); });
    // ---- A · markets at a glance: one row per key asset, trend on three horizons, change, data time
    var ARW = { up: '▲ صعودی', down: '▼ نزولی', flat: '◆ خنثی', none: '— دادهٔ کم' }, zOf = function (x) { return X.zmap && X.zmap[x.key]; };
    var chgOf = function (x, k) { var z = zOf(x); if (!z) return NaN; var c = z.R.X.c, n = z.R.X.n; return n > k ? c[n - 1] / c[n - 1 - k] - 1 : NaN; };
    var trOf = function (x) { var z = zOf(x); if (!z) return null; var R = z.R, t = R.X.n - 1; var o = { s: TE.trendView(R.X, R.I, t, 's'), m: TE.trendView(R.X, R.I, t, 'm'), l: TE.trendView(R.X, R.I, t, 'l') }; if (TE.trendEv) o.x = { s: TE.trendEv(R.X, R.I, t, 's'), m: TE.trendEv(R.X, R.I, t, 'm'), l: TE.trendEv(R.X, R.I, t, 'l') }; return o; };
    var ageTxt = function (h0) { return isFinite(h0) ? (h0 < 1 ? 'کمتر از ۱ ساعت پیش' : h0 < 48 ? fa(h0, 0) + ' ساعت پیش' : fa(h0 / 24, 0) + ' روز پیش' + (h0 > 96 ? ' ⚠ قدیمی' : '')) : '—'; };
    var trTxt = function (q, X2) { var x = X2 || (q && q.x); return q ? ['s', 'm', 'l'].map(function (k) { var e = x && x[k]; return (ARW[q[k]] || '—') + (e && e.sub ? (e.sub === 'pullback' ? ' (در اصلاح)' : ' (در برگشت)') : ''); }).join(' / ') : '—'; };
    var row1 = function (mk, x, note) { var q = trOf(x), dom = q ? (q.m !== 'flat' && q.m !== 'none' ? q.m : q.s) : null; return [mk, x.sym, nd(x, x.last) + ' (' + x.date + ')', pct(chgOf(x, 1), 1) + ' / ' + pct(chgOf(x, 5), 1), trTxt(q), dom ? ARW[dom] : '—', ageTxt(x.age), note || '']; };
    var byCls = {}; K.items.forEach(function (x) { (byCls[x.cls] = byCls[x.cls] || []).push(x); });
    var find = function (re) { return K.items.filter(function (x) { return re.test(x.sym + ' ' + (x.name || '')); })[0]; };
    var ovRows = [];
    (X.idxv || []).forEach(function (v) { ovRows.push(v.ok ? ['سهام — شاخص', v.name, fa(v.last) + ' (' + v.dateFa + ')', pct(v.chg1, 1) + ' / ' + pct(v.chg5, 1), trTxt(v.tr), ARW[v.dom] || '—', v.sample ? 'دادهٔ نمونه' : '—', v.chk ? v.chk.fa : ''] : ['سهام — شاخص', v.name, '—', '—', '—', '—', '—', v.why]); });
    K.over.forEach(function (o) { if (o.cls === 'stock' || o.cls === 'fund') ovRows.push([o.fa, fa(o.n, 0) + ' نماد', '—', '—', 'صعودی ' + fa(o.up, 0) + ' · نزولی ' + fa(o.down, 0) + ' · خنثی ' + fa(o.flat, 0), DIRS[o.dir], '—', fa(o.opp, 0) + ' فرصت معتبر']); });
    ['gold', 'fx', 'crypto', 'commodity'].forEach(function (c) { (byCls[c] || []).slice(0, 6).forEach(function (x) { ovRows.push(row1(TE.MKFA[c] || c, x)); }); });
    var miss = [];
    if (!find(/انس|اونس|ounce|\bons\b/i)) miss.push('انس جهانی طلا: در دادهٔ این موتور نیست (در ابزار «تحلیل بازارهای ایران» یا سیگنال طلا اضافه کنید)');
    if (!find(/تتر|usdt|tether/i)) miss.push('تتر: منبع قیمت تتر به موتور وصل نیست');
    if (!(byCls.crypto || []).length) miss.push('رمزارز: دادهٔ بیت‌کوین در موتور نیست (زبانهٔ بازارهای جهانی را به‌روز کنید)');
    var movers = K.items.map(function (x) { return { x: x, c5: chgOf(x, 5) }; }).filter(function (q) { return isFinite(q.c5); }).sort(function (a, b) { return Math.abs(b.c5) - Math.abs(a.c5); }).slice(0, 5);
    ps.push(ctx.panel('نمای کلی بازارها', [table(['بازار', 'دارایی', 'آخرین قیمت (تاریخ داده)', 'تغییر ۱ / ۵ جلسه', 'روند کوتاه / میان / بلند', 'جهت غالب (میان‌مدت)', 'زمان دریافت داده', 'وضعیت / یادداشت'], ovRows.concat(macro.map(function (m) { return [m.name, '—', '—', '—', '—', DIRS[m.dir] || m.dir, '—', m.note]; }))),
      h('p', { class: 'small', text: 'بیشترین تغییر ۵ جلسهٔ اخیر: ' + (movers.length ? movers.map(function (q) { return q.x.sym + ' ' + pct(q.c5, 1); }).join('، ') : '—') + '. محرک‌های خبری: منبع خبر ماشین‌خوان به این بخش وصل نیست؛ فقط حرکت قیمت گزارش می‌شود.' }),
      miss.length ? h('p', { class: 'small warn-t', text: 'پوشش‌داده‌نشده: ' + miss.join('؛ ') + '.' }) : null,
      h('p', { class: 'small muted', text: 'روند: کوتاه = قیمت و شیب میانگین ۲۰ جلسه؛ میان = قیمت > میانگین ۵۰ > میانگین ۲۰۰؛ بلند = قیمت و شیب میانگین ۲۰۰ و بازده ۲۵۰ جلسه (حداقل ۲۷۰ جلسه داده). همان قواعد دروازهٔ اعتبار سیگنال.' }),
      h('details', { class: 'fold' }, [h('summary', { text: 'جمع‌بندی هر بازار (تعداد، فرصت، ریسک، جذابیت)' }), table(['بازار', 'دارایی', 'صعودی / نزولی / خنثی', 'جهت غالب', 'فرصت معتبر', 'ریسک (نوسان میانه)', 'جذابیت نسبی', 'یادداشت'], K.over.map(function (o) { return [o.fa, fa(o.n, 0), fa(o.up, 0) + ' / ' + fa(o.down, 0) + ' / ' + fa(o.flat, 0), DIRS[o.dir], fa(o.opp, 0), o.risk, o.att ? pct(o.att, 0) : '—', o.note]; }))])]));
    // ---- indices: the standard block
    (function () { var V = (X.idxv || []).filter(function (v) { return v.ok; }); if (!V.length) return;
      ps.push(ctx.panel('شاخص‌های بورس', V.map(function (v) { var q = v.chk || {};
        return h('div', null, [h('h4', { text: v.name + (v.sample ? ' (دادهٔ نمونه)' : '') }), table(['مؤلفه', 'مقدار'], [
          ['مقدار فعلی (تاریخ)', fa(v.last) + ' (' + v.dateFa + ')'], ['تغییر روزانه / ۵ / ۲۰ جلسه', pct(v.chg1, 2) + ' / ' + pct(v.chg5, 1) + ' / ' + pct(v.chg20, 1)],
          ['روند کوتاه / میان / بلند', trTxt(v.tr, v.trx)], ['شواهد روند (کوتاه · میان · بلند)', v.trx ? ['s', 'm', 'l'].map(function (k) { var e = v.trx[k]; return e.fa + ': ' + e.ev + (e.subTxt ? ' — ' + e.subTxt : ''); }).join(' | ') + '. ' + v.trx.s.rule + '. این برچسب‌ها توصیف ساختار گذشته‌اند، نه پیش‌بینی.' : '—'], ['مقاومت‌ها (بالاترین ۶۰ / ۱۲۰ / ۲۵۰ جلسه)', v.res.length ? v.res.map(function (x) { return fa(x) + ' (' + pct(x / v.last - 1, 1) + ')'; }).join(' · ') : 'بالاتر از سطح تأیید مقاومتی نیست'],
          ['حمایت‌ها (پایین‌ترین ۶۰ / ۱۲۰ جلسه، میانگین ۲۰۰)', v.sup.length ? v.sup.map(function (x) { return fa(x) + ' (' + pct(x / v.last - 1, 1) + ')'; }).join(' · ') : 'پایین‌تر از سطح تأیید حمایتی نیست'],
          ['سطح تأیید صعودی (فاصله)', fa(v.up) + ' (' + pct(q.dUp, 1) + ') — بالاترین مقدار پایانی ۲۰ جلسهٔ پیش از ' + v.dateFa], ['سطح تأیید نزولی (فاصله)', fa(v.dn) + ' (' + pct(q.dDn, 1) + ') — پایین‌ترین مقدار پایانی ۲۰ جلسهٔ پیش از ' + v.dateFa],
          ['وضعیت تحقق', (q.fa || '—') + (q.checks && q.checks.length ? ' ⚠ ' + q.checks.join('؛ ') : '')], ['سناریوی صعودی', v.bull], ['سناریوی نزولی', v.bear],
          ['زمان‌بندی', v.win ? v.win.basis + '؛ بررسی در ' + fa(v.win.n, 0) + ' جلسهٔ ' + v.win.startFa + ' تا ' + v.win.endFa + '؛ ' + v.win.expiry + '. ' + v.win.note : '—'], ['اقدام پیشنهادی', v.act]])]); }).concat([h('p', { class: 'small muted', text: 'سطوح از مقادیر پایانی گذشته محاسبه می‌شوند، نه از قیمت امروز؛ تأیید با یک بسته‌شدن روزانه. این قواعد برای شاخص بک‌تست جداگانه ندارند.' })])));
    })();
    // ---- B · ten best opportunities and back-test results (fewer when fewer qualify)
    var SG = K.strat || {}, btOf = function (x) { var s = SG[x.cls + '|' + x.hk]; if (!s) return 'بک‌تست اجرا نشده'; var k = s.sel, r = k ? s.rows[k] : s.rows.ens; if (!r) return 'نمونه ندارد';
      return (k ? r.fa : 'ترکیبی (بدون استراتژی پایدار)') + ': ' + fa(r.n, 0) + ' معامله، موفقیت ' + pct(r.hit, 0) + '، ' + fa(r.avgR, 2) + 'R، PF ' + fa(r.pf, 2) + (isF(r.sharpe) ? '، شارپ ' + fa(r.sharpe, 2) : ''); };
    var lvTxt = function (x) { var q = x.S && x.S.chk; if (!q) return nd(x, x.S.bull.confirm) + ' / ' + nd(x, x.S.bear.confirm); return '▲ ' + nd(x, q.up) + ' (' + pct(q.dUp, 1) + ') · ▼ ' + nd(x, q.dn) + ' (' + pct(q.dDn, 1) + ') — ' + q.fa + (q.checks.length ? ' ⚠ ' + q.checks.join('؛ ') : ''); };
    var winTxt = function (x) { var w = x.S && x.S.win; return w ? w.startFa + ' تا ' + w.endFa + ' (' + fa(w.n, 0) + ' جلسه)؛ ' + w.basis : '—'; };
    var HF = S.t10h || '', T10 = (HF ? K.opp.filter(function (x) { return x.hk === HF || (x.okH || []).indexOf(HF) >= 0; }).slice(0, 10) : K.top10) || [];
    var hfSel = h('select', { class: 'f-sel', 'aria-label': 'افق' }, [['', 'همهٔ افق‌ها'], ['s', 'کوتاه‌مدت'], ['m', 'میان‌مدت'], ['l', 'بلندمدت']].map(function (o) { return h('option', { value: o[0], text: o[1] }); })); hfSel.value = HF; hfSel.addEventListener('change', function () { S.t10h = hfSel.value; ctx.rerender(); });
    ps.push(ctx.panel('۱۰ فرصت برتر معاملاتی و نتایج بک‌تست (' + fa(T10.length, 0) + (K.opp.length > 10 ? ' از ' + fa(K.opp.length, 0) : '') + ')', [h('div', { class: 'row-ctl' }, [hfSel]),
      T10.length ? table(['رتبه', 'دارایی', 'بازار', 'شناسهٔ سیگنال · تولید · آخرین اعتبارسنجی', 'قیمت مرجع (نوع، منبع، زمان دریافت)', 'جهت', 'افق / دروازهٔ اعتبار', 'وضعیت سیگنال', 'تأیید صعودی / نزولی (فاصله از قیمت)', 'مهلت و مبنای تأیید', 'نقطهٔ ورود', 'نقطهٔ خروج', 'حد ضرر', 'هدف ۱ / ۲ / ۳', 'بازده بالقوه', 'ریسک', 'بازده به ریسک', 'عملکرد بک‌تست (استراتژی منتخب بازار و افق)', 'درجهٔ اطمینان', 'اقدام پیشنهادی'], T10.map(function (x, i) { var l = LV(x), cl = x.last;
        var vAt = X.central ? new Date(X.central.at).toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' }) : '—', iss = x.v6 && x.v6.issue;
        return [fa(i + 1, 0), x.sym, x.mk, (x.track && x.track.id ? x.track.id : 'ثبت نشده') + ' · تولید ' + (iss && iss.d ? iss.d : '—') + ' · اعتبارسنجی ' + vAt, pxTxt(x), DIRS[x.dir], x.gate ? x.gate.fa.split(' ')[0] + ' · ' + x.gate.status + (x.okH && x.okH.length ? ' (معتبر در: ' + x.okH.map(function (q) { return x.hzs[q].fa.split(' ')[0]; }).join('، ') + ')' : '') : '—', chip6(x), lvTxt(x), winTxt(x), nd(x, l.entry[0]) + '–' + nd(x, l.entry[1]), nd(x, Math.min(l.tp[0], l.tp[1])) + '–' + nd(x, Math.max(l.tp[0], l.tp[1])) + ' (پله‌ای)؛ زیر ' + nd(x, l.stop) + ' خروج', nd(x, l.stop), l.tp.map(function (v) { return nd(x, v); }).join(' / '),
          pct((l.tp[1] - cl) / cl, 1), pct(cl > l.stop ? (cl - l.stop) / cl : NaN, 1), fa(l.rr, 1), bt6(x), fa(x.conf, 0) + '٪ · درجه ' + x.grade, chipA(x)]; }))
        : h('p', { class: 'warn-t', text: 'در حال حاضر هیچ فرصت واجد شرایطی در بازارهای تحت پوشش نیست؛ فهرست با دارایی ضعیف پر نمی‌شود.' }),
      h('p', { class: 'small muted', text: 'رتبه = درجهٔ اعتبار × اطمینان × بازده به ریسک × نقدشوندگی × وضعیت واقعی سیگنال (فعال ۱، بازآزمایی ۰٫۹، آستانه ۰٫۷، تأییدنشده ۰٫۵، ازدست‌رفته ۰٫۳۵) × هم‌سویی با استراتژی منتخب بازار (۱٫۱۵ اگر در افق سیگنال داده، ۰٫۸۵ اگر نداده). بازده و ریسک از قیمت فعلی محاسبه شده‌اند. اقدام ورود فقط با درجهٔ A/B؛ در غیر این صورت «انتظار».' }),
      K.opp.length > 10 ? h('details', { class: 'fold' }, [h('summary', { text: 'بقیهٔ فرصت‌های واجد شرایط (' + fa(K.opp.length - 10, 0) + ')' }), table(['دارایی', 'بازار', 'وضعیت', 'اقدام'], K.opp.slice(10).map(function (x) { return [x.sym, x.mk, x.st9fa, x.act.fa]; }))]) : null,
      K.bear.length ? table(['دید نزولی تأییدشده', 'بازار', 'قیمت', 'تأیید', 'اهداف نزولی', 'دارندگان: محدودهٔ خروج', 'ابطال'], K.bear.slice(0, 10).map(function (x) { var d = x.S.bear; return [x.sym, x.mk, nd(x, x.last), x.path.date ? x.path.date : nd(x, d.confirm), d.tp.map(function (v) { return nd(x, v); }).join(' / '), nd(x, d.exitLo) + '–' + nd(x, d.exitHi), nd(x, d.invalid)]; })) : null]));
    // ---- stock ranking, separate from the all-market list: every selected stock and fund, same fields
    (function () {
      var st = K.items.filter(function (x) { return x.cls === 'stock' || x.cls === 'fund'; }); if (!st.length) return;
      var bn = function (v) { return isFinite(v) ? fa(v / 1e9, 0) + ' میلیارد ریال' : '—'; };
      st.sort(function (a, b) { return (b.elig ? 1 : 0) - (a.elig ? 1 : 0) || (b.score || 0) - (a.score || 0) || (b.conf || 0) - (a.conf || 0); });
      var lim = S.rkAll ? st.length : Math.min(25, st.length), more = h('button', { class: 'btn btn-sm', type: 'button', text: S.rkAll ? 'نمایش ۲۵ نماد اول' : 'نمایش همهٔ ' + fa(st.length, 0) + ' نماد', onclick: function () { S.rkAll = !S.rkAll; ctx.rerender(); } });
      ps.push(ctx.panel('رتبه‌بندی سهام و صندوق‌های منتخب (' + fa(st.length, 0) + ')', [table(['رتبه', 'نماد', 'آخرین معامله / پایانی', 'ارزش / حجم آخرین جلسه', 'نقدشوندگی', 'روند کوتاه / میان / بلند', 'بنیادی', 'ورود / خروج', 'حد ضرر / اهداف', 'تأیید صعودی / نزولی (فاصله)', 'وضعیت سیگنال', 'بک‌تست (افق نماد)', 'اقدام'],
        st.slice(0, lim).map(function (x, i) { var z = zOf(x), R = z && z.R, t = R ? R.X.n - 1 : -1, last = z && z.a.rows.length ? z.a.rows[z.a.rows.length - 1] : null, l = LV(x), v20 = R ? R.X.val.slice(-20).reduce(function (a, b) { return a + b; }, 0) / 20 : NaN;
          return [fa(i + 1, 0) + (x.elig ? '' : ' (غیرواجد)'), x.sym, (last && isFinite(last.last) && last.last > 0 ? nd(x, last.last) : '—') + ' / ' + nd(x, x.last), R ? bn(R.X.val[t]) + ' / ' + fa(R.X.v[t] / 1e6, 1) + ' میلیون سهم' : '—', (x.liqOK === false || (x.c && x.c.liqOK === false) ? 'کم ⚠' : 'کافی') + (isFinite(v20) ? ' (میانگین ارزش ۲۰ جلسه ' + bn(v20) + ')' : ''),
            trTxt(trOf(x)), 'دادهٔ بنیادی به این بخش وصل نیست', nd(x, l.entry[0]) + '–' + nd(x, l.entry[1]) + ' / ' + nd(x, Math.min(l.tp[0], l.tp[1])) + '–' + nd(x, Math.max(l.tp[0], l.tp[1])), nd(x, l.stop) + ' / ' + l.tp.map(function (v) { return nd(x, v); }).join(' · '), lvTxt(x), chip6(x), bt6(x), chipA(x)]; })),
        st.length > 25 ? h('div', { class: 'row-ctl' }, [more]) : null,
        h('p', { class: 'small muted', text: 'ترتیب: نمادهای واجد شرایط به ترتیب امتیاز فرصت، سپس بقیه به ترتیب درجهٔ اطمینان. «آخرین معامله» آخرین قیمت معامله‌شدهٔ روز در TSETMC و «پایانی» قیمت پایانی همان روز است؛ سطوح و تأییدها بر پایهٔ قیمت پایانی‌اند.' })]));
    })();
    // ---- signal state: was it confirmed, when, is entry still open, missed, invalidated
    var stRows = T10.concat(K.held.filter(function (x) { return T10.indexOf(x) < 0; }));
    if (stRows.length) ps.push(ctx.panel('وضعیت واقعی سیگنال‌ها', [table(['دارایی', 'وضعیت', 'تأیید شده؟', 'زمان تأیید', 'تثبیت', 'ورود هنوز فعال؟', 'حد ضرر یا ابطال فعال شده؟', 'شرح مسیر قیمت'], stRows.map(function (x) { var p = x.path, conf = /^(active|missed|retest|target|invalid)$/.test(p.st) && p.date;
      return [x.sym, chip9(x), conf ? 'بله' : p.st === 'bear' ? 'نزولی: بله' : 'خیر', conf || (p.st === 'bear' ? p.date : '—'), conf ? (p.held ? 'تثبیت شد' : 'شکست موقت') : '—', p.st === 'active' || p.st === 'retest' ? 'بله' : p.st === 'missed' ? 'خیر — ازدست‌رفته' : '—', p.st === 'invalid' ? 'بله' : 'خیر', p.why]; }))]));
    // ---- current decision per asset
    if (stRows.length) ps.push(ctx.panel('تصمیم فعلی', [table(['دارایی', 'اقدام فعلی', 'دلیل', 'سطح ورود', 'حد ضرر', 'اهداف', 'شرط تغییر تصمیم'], stRows.map(function (x) { var l = LV(x); return [x.sym, chipA(x), x.act.why, nd(x, l.entry[0]) + '–' + nd(x, l.entry[1]), nd(x, l.stop), l.tp.map(function (v) { return nd(x, v); }).join(' / '), x.act.chg]; })),
      h('p', { class: 'small muted', text: 'سه مفهوم جداست: بک‌تست (اگر این استراتژی در گذشته اجرا می‌شد چه می‌شد)، پایش سیگنال (سیگنالی که صادر شد تا امروز چه مسیری رفت) و تصمیم فعلی (با قیمت امروز چه باید کرد). استراتژی خوب در بک‌تست و سیگنال تأییدشده هنوز ممکن است در قیمت فعلی ورود نداشته باشد.' })]));
    // ---- signal validation status: one row per signal and horizon; no row is "confirmed" without a Validation ID and all eight checks
    (function () {
      var E = ensure(S), db = E.val && E.val.db, GC = { ok: 'fit-rec', review: 'fit-cond', nocond: 'fit-cond', nobt: 'fit-no', nodata: 'fit-no', down: 'fit-no' };
      var gChip = function (g) { return h('span', { class: 'sev ' + (GC[g.code] || 'fit-ok'), text: g.status }); };
      var btSt = function (g) { return !db ? 'انجام نشده' : db.sample ? 'ناکافی (دادهٔ نمونه)' : !g.k ? 'ناکافی (استراتژی معتبر نیست)' : g.row && g.row.ok ? 'انجام‌شده و معتبر' : 'نامعتبر'; };
      var per = db && db.from ? TE.shamsi(db.from) + ' تا ' + TE.shamsi(db.asOf) : '—', at = db ? new Date(db.at).toLocaleString('fa-IR') : '—';
      var conf = function (x, g) { return g.code === 'ok' ? 'درجه ' + x.grade + ' · ' + fa(x.conf, 0) + '٪' : 'پایین — ' + g.status; };
      var src = (K.top10 || []).concat(K.held || []).filter(function (x, i, a) { return a.indexOf(x) === i; }), rows = [];
      src.forEach(function (x) { ['s', 'm', 'l'].forEach(function (hh) { var g = x.hzs && x.hzs[hh]; if (!g) return; if (hh !== x.hk && g.code !== 'ok' && !g.fired) return; rows.push({ x: x, g: g }); }); });
      var pick = function (x, hh) { S.valKey = x.key; S.valH = hh; ctx.rerender(); };
      var tb = rows.length ? table(['دارایی', 'افق زمانی', 'استراتژی', 'وضعیت بک‌تست', 'آخرین بک‌تست', 'دورهٔ آزمون', 'تعداد معاملات', 'Win Rate', 'Profit Factor', 'Max Drawdown', 'Out-of-Sample', 'وضعیت فعلی', 'درجهٔ اطمینان', 'شناسهٔ سیگنال / اعتبارسنجی', 'شناسنامه'],
        rows.map(function (q) { var x = q.x, g = q.g, r = g.row; return [x.sym + ' (' + x.mk + ')', g.fa, g.kfa || 'ندارد', btSt(g), at, per, r ? fa(r.n, 0) : '—', r ? pct(r.hit, 0) : '—', r ? fa(r.pf, 2) : '—', r ? fa(r.mdd, 1) + 'R' : '—', r && r.oos && r.oos.n ? fa(r.oos.n, 0) + ' معامله · ' + fa(r.oos.avgR, 2) + 'R' : '—', gChip(g), conf(x, g),
          h('bdi', { 'data-notr': '1', dir: 'ltr', class: 'small', text: g.sigId + (g.valId ? ' · ' + g.valId : ' · no Validation ID') }), h('button', { class: 'btn btn-sm', text: 'نمایش', onclick: function () { pick(x, g.h); } })]; }))
        : h('p', { class: 'small muted', text: 'سیگنالی برای اعتبارسنجی در فهرست نیست.' });
      var cur = null, curG = null; K.items.forEach(function (x) { if (x.key === S.valKey && x.hzs) { cur = x; curG = x.hzs[S.valH] || x.gate; } }); if (!cur && rows.length) { cur = rows[0].x; curG = rows[0].g; }
      var body = [tb, h('p', { class: 'small muted', text: 'درون‌روزی: دادهٔ درون‌روزی (کندل ساعتی/دقیقه‌ای) به سامانه وصل نیست؛ برای این افق سیگنالی صادر نمی‌شود. تاریخچهٔ لازم را سامانه خودش تعیین و دریافت می‌کند: کوتاه‌مدت ۴۵۰، میان‌مدت ۷۰۰، بلندمدت ۱٬۲۵۰ جلسه (گرم‌شدن شاخص‌ها + ۱، ۲ و ۳ سال آزمون)؛ حداقل هر دارایی برای صدور سیگنال: ۲۶۰ / ۲۶۰ / ۵۶۰ جلسه. هر سیگنال تنها وقتی «معتبر» است که هر هشت کنترل دروازه را بگذراند؛ در غیر این صورت اقدام «ورود» صادر نمی‌شود.' })];
      if (cur && curG) {
        var g = curG, x = cur, r = g.row, key = x.cls + '|' + g.h, sr = db && db.strat ? db.strat[key] : null, lv = g.lv, V = E.val || {}, hist = (V.selHist || []).filter(function (q) { return q.key === key; });
        var tk = (K.track && K.track.sig || []).filter(function (s) { return s.key === x.key && (s.h || 'm') === g.h; }), last = tk[tk.length - 1];
        var rg = Object.keys(r && r.byRg || {}).map(function (k) { var v = r.byRg[k]; return (({ up: 'صعودی', down: 'نزولی', range: 'خنثی/رنج', hv: 'پرنوسان', crisis: 'بحرانی', unk: 'نامشخص' })[k] || k) + ': ' + fa(v[0], 0) + ' معامله، موفقیت ' + pct(v[1], 0) + '، ' + fa(v[2], 2) + 'R'; }).join(' · ');
        var c3 = g.chk.filter(function (c) { return c.c === 'bt'; })[0], c4 = g.chk.filter(function (c) { return c.c === 'recent'; })[0], cx = g.chk.filter(function (c) { return !c.ok; });
        var sel = h('select', { class: 'f-sel', 'aria-label': 'سیگنال' }, rows.map(function (q, i) { return h('option', { value: String(i), text: q.x.sym + ' — ' + q.g.fa }); }));
        rows.forEach(function (q, i) { if (q.x === x && q.g.h === g.h) sel.value = String(i); }); sel.addEventListener('change', function () { var q = rows[+sel.value]; pick(q.x, q.g.h); });
        var Q = [['۱. افق زمانی', g.fa],
          ['۲. استراتژی', g.kfa ? g.kfa + (g.k === 'ens' ? ' (ترکیب رأی مدل‌ها و جریان پول)' : ' — قاعدهٔ ورود ثابت و قابل بازتولید') : 'هیچ استراتژی‌ای برای ' + x.mk + ' / ' + g.fa + ' معتبر نشده'],
          ['۳. آیا بک‌تست انجام شده؟', btSt(g) + (sr ? ' — ' + sr.why : '') + (sr && sr.data ? ' · ' + sr.data : '')],
          ['۴. آخرین بک‌تست', db ? at + ' · نسخهٔ ' + fa(db.ver, 0) + ' · موتور ' + (db.eng || '—') + ' · داده ' + per + ' · مرز درون/برون‌نمونه ' + TE.shamsi(db.split) : 'اجرا نشده'],
          ['۵. عملکرد تاریخی و برون‌نمونه', r && r.n ? fa(r.n, 0) + ' معامله، موفقیت ' + pct(r.hit, 0) + '، میانگین سود ' + fa(r.avgW, 2) + 'R و زیان ' + fa(r.avgL, 2) + 'R، نسبت سود به زیان ' + fa(r.payoff, 2) + '، PF ' + fa(r.pf, 2) + '، بیشینهٔ افت ' + fa(r.mdd, 1) + 'R؛ برون‌نمونه ' + (r.oos && r.oos.n ? fa(r.oos.n, 0) + ' معامله، ' + fa(r.oos.avgR, 2) + 'R' : 'ندارد') + '؛ بلوک‌های مثبت ' + r.folds + '؛ با هزینهٔ دوبرابر ' + fa(r.c2, 2) + 'R' + (rg ? '؛ به تفکیک رژیم — ' + rg : '') : 'نتیجه‌ای نیست'],
          ['۶. آیا در شرایط فعلی همچنان معتبر است؟', c4 ? c4.t : '—'],
          ['۷. شرط ورود اکنون محقق شده یا در انتظار تأیید؟', g.fired ? 'محقق شده — ' + g.chk.filter(function (c) { return c.c === 'cond'; })[0].t : 'محقق نشده — ' + (g.chk.filter(function (c) { return c.c === 'cond'; })[0] || {}).t],
          ['۸. آیا قبلاً صادر یا تأیید شده؟', last ? 'بله: ' + (last.sid || '—') + ' در ' + last.d0fa + ' — وضعیت ' + (TE.ST8[last.st] || last.st) + (last.pEnd != null ? '، بازده تا پایان ' + pct(last.ret, 1) : '') : 'خیر، سابقه‌ای در دفتر سیگنال‌ها برای این افق نیست'],
          ['۹. ورود، حد ضرر، اهداف، ابطال', 'ورود ' + nd(x, lv.entry[0]) + '–' + nd(x, lv.entry[1]) + ' · حد ضرر ' + nd(x, lv.stop) + ' · اهداف ' + lv.tp.map(function (v) { return nd(x, v); }).join(' / ') + ' · بازده به ریسک از قیمت فعلی ' + fa(g.rrNow, 1) + ' (' + lv.src + ')' + ' · ابطال: بسته‌شدن زیر حد ضرر' + ((x.c.inval || []).length ? '؛ ' + x.c.inval.join('؛ ') : '')],
          ['۱۰. چه عواملی اعتبار را کاهش می‌دهد؟', (cx.length ? cx.map(function (c) { return c.t; }).join('؛ ') + '؛ ' : '') + (r && r.decay ? 'افت بلوک اخیر؛ ' : '') + ((x.f && x.f.against) || []).join('؛ ') || 'موردی دیده نشد']];
        var CF = { data: 'داده: تازگی و کفایت', strat: 'استراتژی برای بازار × افق', bt: 'بک‌تست معتبر و به‌روز', recent: 'ارزیابی اخیر و رژیم فعلی', cond: 'انطباق با قاعدهٔ ورود', dup: 'تکراری / باطل‌شده نبودن', rr: 'سطوح و بازده به ریسک', exec: 'ریسک اجرایی و بازار' };
        var lockB = sr ? h('div', { class: 'row-ctl' }, [
          g.k ? h('button', { class: 'btn btn-sm', text: sr.locked ? 'لغو قفل استراتژی' : 'قفل روی «' + g.kfa + '»', onclick: function () { V.lock = V.lock || {}; if (sr.locked) delete V.lock[key]; else V.lock[key] = g.k; sr.locked = !sr.locked; ctx.rerender(); } }) : null,
          hist.length > 1 && hist[hist.length - 2].sel && sr.rows[hist[hist.length - 2].sel] ? h('button', { class: 'btn btn-sm', text: 'بازگشت به نسخهٔ قبل («' + TE.STRFA[hist[hist.length - 2].sel] + '»)', onclick: function () { var k0 = hist[hist.length - 2].sel; V.lock = V.lock || {}; V.lock[key] = k0; sr.was = sr.sel; sr.sel = k0; sr.locked = true; sr.why = 'بازگشت دستی کاربر به «' + TE.STRFA[k0] + '»' + (sr.rows[k0].ok ? '' : ' — این استراتژی آزمون‌های فعلی را نمی‌گذراند'); ctx.rerender(); } }) : null]) : null;
        body.push(h('h3', { text: 'شناسنامهٔ سیگنال' }), h('div', { class: 'row-ctl' }, [sel]),
          h('p', null, [gChip(g), document.createTextNode(' ' + x.sym + ' · ' + g.fa + ' · ' + (g.view === 'up' ? 'خرید' : g.view === 'down' ? 'دید نزولی' : 'بدون جهت')), h('br'), h('span', { class: 'small', text: 'شناسهٔ سیگنال: ' }), h('bdi', { 'data-notr': '1', dir: 'ltr', class: 'small', text: g.sigId }), h('br'), h('span', { class: 'small', text: 'شناسهٔ اعتبارسنجی: ' }), g.valId ? h('bdi', { 'data-notr': '1', dir: 'ltr', class: 'small', text: g.valId }) : h('span', { class: 'small warn-t', text: 'ندارد — این سیگنال تأییدشده معرفی نمی‌شود' })]),
          table(['پرسش الزامی', 'پاسخ'], Q),
          table(['کنترل دروازهٔ اعتبار', 'نتیجه', 'جزئیات'], g.chk.map(function (c) { return [CF[c.c] || c.c, c.ok ? '✓' : '✗', c.t]; })),
          r && r.sens ? h('p', { class: 'small', text: 'آزمون حساسیت پارامتر: ' + r.sens.map(function (q) { return fa(q.p, 2) + ' → ' + fa(q.n, 0) + ' معامله، ' + fa(q.avgR, 2) + 'R'; }).join(' · ') }) : null,
          sr ? table(['استراتژی هم‌افق رقیب', 'معاملات', 'برون‌نمونه', 'نتیجه'], Object.keys(sr.rows).map(function (k) { var w = sr.rows[k]; return [w.fa + (k === sr.sel ? ' ★' : ''), fa(w.n, 0), w.oos && w.oos.n ? fa(w.oos.n, 0) + ' · ' + fa(w.oos.avgR, 2) + 'R' : '—', w.ok ? 'پایدار' : w.why]; })) : null,
          hist.length ? table(['نسخهٔ اعتبارسنجی', 'زمان', 'استراتژی منتخب', 'قبلی', 'برون‌نمونه هنگام انتخاب', 'دلیل'], hist.slice().reverse().map(function (q) { return [fa(q.ver, 0), new Date(q.at).toLocaleString('fa-IR'), q.sel ? TE.STRFA[q.sel] : 'هیچ', q.was ? TE.STRFA[q.was] : '—', q.oos ? fa(q.oos.n, 0) + ' · ' + fa(q.oos.avgR, 2) + 'R' : '—', q.why]; })) : null,
          lockB, h('p', { class: 'small muted', text: 'قفل یا بازگشت فقط استراتژی منتخب را ثابت می‌کند؛ اگر آن استراتژی آزمون‌ها را نگذراند، دروازهٔ اعتبار همچنان سیگنال را رد می‌کند. این انتخاب در نسخهٔ بعدی اعتبارسنجی هم حفظ و در تاریخچه ثبت می‌شود.' }));
      }
      ps.push(ctx.panel('وضعیت اعتبار و اعتبارسنجی سیگنال', body));
    })();
    // ---- back-test panel: per market × horizon, the strategies compared and the one selected
    if (Object.keys(SG).length) { var rgN = { up: 'صعودی', down: 'نزولی', range: 'رنج', hv: 'پرنوسان', crisis: 'بحرانی', unk: 'نامشخص' }, mkN = TE.MKFA || {};
      ps.push(ctx.panel('بک‌تست: مقایسهٔ استراتژی‌ها و استراتژی منتخب هر بازار و افق', Object.keys(SG).sort().map(function (key) { var s = SG[key], cls = key.split('|')[0], hz = TE.HZ[key.split('|')[1]];
        return h('div', null, [h('h4', { text: (mkN[cls] || cls) + ' / ' + (hz ? hz.fa : key) + ' — ' + (s.sel ? 'منتخب: ' + s.rows[s.sel].fa : 'بدون استراتژی پایدار') }), h('p', { class: 'small', text: s.why + (s.data ? ' · ' + s.data : '') }),
          table(['استراتژی', 'معاملات', 'موفقیت', 'میانگین سود (R)', 'میانگین زیان (R)', 'نسبت سود به زیان', 'PF', 'بیشینهٔ افت (R): سبد ماهانهٔ هم‌وزن / جمع همهٔ معاملات', 'شارپ', 'سورتینو', 'میانگین نگهداری (جلسه)', 'گردش (معامله/دارایی/سال)', 'برون‌نمونه', 'بلوک‌های مثبت', 'با هزینهٔ دوبرابر', 'به تفکیک رژیم (n، موفقیت، R)', 'وضعیت'],
            Object.keys(s.rows).map(function (k) { var r = s.rows[k]; return [r.fa + (k === s.sel ? ' ★' : ''), fa(r.n, 0), pct(r.hit, 0), fa(r.avgW, 2), fa(r.avgL, 2), fa(r.payoff, 2), fa(r.pf, 2), (isF(r.mddP) ? fa(r.mddP, 1) + ' / ' : '') + fa(r.mdd, 1) + (r.ddMode === 'pooled' ? ' (ملاک: جمع)' : ' (ملاک: سبد)'), isF(r.sharpe) ? fa(r.sharpe, 2) : '—', isF(r.sortino) ? fa(r.sortino, 2) : '—', fa(r.days, 0), isF(r.turnover) ? fa(r.turnover, 1) : '—',
              r.oos.n ? fa(r.oos.n, 0) + ' · ' + fa(r.oos.avgR, 2) + 'R' : '—', r.folds, fa(r.c2, 2) + 'R', Object.keys(r.byRg || {}).map(function (g) { var v = r.byRg[g]; return (rgN[g] || g) + ' ' + fa(v[0], 0) + '/' + pct(v[1], 0) + '/' + fa(v[2], 2); }).join('؛ '), r.ok ? 'پایدار' : r.why]; }))]); })
        .concat([h('p', { class: 'small muted', text: 'روی دادهٔ تاریخی ذخیره‌شده، روز به روز بدون نگاه به آینده؛ ورود در قیمت باز روز بعد؛ کارمزد و لغزش (تنظیم «هزینهٔ رفت‌وبرگشت»)؛ صف خرید در سقف دامنه = ورود ممکن نیست؛ صف فروش در کف دامنه = خروج به اولین روز قابل معامله منتقل می‌شود؛ ۶۰٪ اول درون‌نمونه، بقیه برون‌نمونه؛ پایداری در ۴ بلوک زمانی. پارامترهای استراتژی‌ها از پیش ثابت‌اند و روی داده بهینه نشده‌اند. انتخاب = بیشترین «میانگین R برون‌نمونه × سهم بلوک‌های مثبت» میان استراتژی‌هایی که همهٔ آزمون‌ها را گذرانده‌اند، نه بیشترین بازده گذشته. مقادیر بر حسب R (واحد ریسک هر معامله)؛ با ریسک ۱٪ هر R ≈ ۱٪ سرمایه. توقف نماد در داده به‌صورت روز معامله‌نشده دیده می‌شود.' })]))); }
    // ---- signal history and accountability
    if (tr && tr.acc) { var A = tr.acc, rt = function (a, b) { return b ? fa(a, 0) + ' از ' + fa(b, 0) + ' (' + pct(a / b, 0) + ')' : '—'; };
      ps.push(ctx.panel('دقت پیش‌بینی‌های گذشته (پاسخ‌گویی سیستم)', [table(['پرسش', 'پاسخ'], [['سیگنال‌های صادرشده', fa(A.issued, 0) + ' (' + fa(A.closed, 0) + ' بسته‌شده)'], ['جهت درست در پایان (قیمت پایانی > قیمت صدور)', rt(A.dirOK, A.dirKnown)], ['رسیدن به هدف (حداقل هدف ۱)', rt(A.tgt, A.closed)], ['خروج با حد ضرر', rt(A.stop, A.closed)], ['اصلاً به نقطهٔ ورود نرسید', rt(A.noEntry, A.closed)], ['تأیید شد ولی ورود مناسب ایجاد نکرد (ازدست‌رفته)', fa(A.missed, 0)],
        ['خطاهای اصلی', Object.keys(A.errs).sort(function (a, b) { return A.errs[b] - A.errs[a]; }).map(function (k) { return k + ': ' + fa(A.errs[k], 0); }).join('؛ ') || '—']]),
        table(['بازار', 'صادر', 'بسته', 'جهت درست', 'هدف', 'حد ضرر', 'بدون ورود', 'ازدست‌رفته'], Object.keys(A.byMk).map(function (k) { var g = A.byMk[k]; return [k, fa(g.n, 0), fa(g.closed, 0), rt(g.dirOK, g.closed), fa(g.tgt, 0), fa(g.stop, 0), fa(g.noEntry, 0), fa(g.missed, 0)]; })),
        table(['استراتژی منتخب هنگام صدور', 'صادر', 'بسته', 'جهت درست', 'هدف', 'حد ضرر'], Object.keys(A.byStrat).map(function (k) { var g = A.byStrat[k]; return [(TE.STRFA && TE.STRFA[k]) || (k === 'none' ? 'بدون استراتژی پایدار' : k), fa(g.n, 0), fa(g.closed, 0), rt(g.dirOK, g.closed), fa(g.tgt, 0), fa(g.stop, 0)]; })),
        h('details', { class: 'fold' }, [h('summary', { text: 'تاریخچهٔ همهٔ سیگنال‌ها (' + fa(tr.sig.length, 0) + ')' }), table(['دارایی', 'صدور', 'قیمت صدور', 'سطوح اولیه (ورود / حد ضرر / اهداف)', 'اقدام هنگام صدور', 'وضعیت فعلی یا نهایی', 'تغییرات بعدی', 'نتیجه'], tr.sig.slice().reverse().slice(0, 80).map(function (s) { var L0 = s.lv0 || s.lv;
          return [s.sym, s.d0fa, isF(s.p0) ? fa(s.p0, 0) : '—', fa(L0.lo, 0) + '–' + fa(L0.hi, 0) + ' / ' + fa(L0.stop, 0) + ' / ' + L0.tp.map(function (v) { return fa(v, 0); }).join('، '), s.act0 || '—', TE.ST8[s.st] || s.st, s.hist.slice(1).map(function (e) { return (e.date || '') + ': ' + (TE.ST8[e.to] || e.to); }).join(' ← ') || '—',
            s.pEnd != null ? (s.dirOK ? 'جهت درست' : 'جهت نادرست') + ' · ' + fa(s.pEnd, 0) + (s.maxT ? ' · هدف ' + fa(s.maxT, 0) : '') : 'باز']; }))]),
        h('p', { class: 'small muted', text: 'هر سیگنال با زمان صدور، قیمت مبنا، افق، شرط تأیید، حد ضرر و اهداف ثبت می‌شود و سطوح اولیه هرگز بازنویسی نمی‌شوند؛ سیگنال ناموفق حذف نمی‌شود. این ارزیابی فقط از سیگنال‌هایی است که از نسخهٔ جدید به بعد صادر شده‌اند.' })])); }
    // ---- C · scenarios per asset
    var pool = K.opp.concat(K.bear).concat(K.items.filter(function (x) { return K.opp.indexOf(x) < 0 && K.bear.indexOf(x) < 0; })), cur = pool.filter(function (x) { return x.key === S.deskKey; })[0] || pool[0];
    if (cur) { var ps2 = h('select', { class: 'f-sel', 'aria-label': 'دارایی سناریو' }, pool.map(function (x) { return h('option', { value: x.key, text: x.sym + ' — ' + x.mk + (x.elig ? ' (فرصت)' : K.bear.indexOf(x) >= 0 ? ' (نزولی)' : '') }); })); ps2.value = cur.key; ps2.addEventListener('change', function () { S.deskKey = ps2.value; ctx.rerender(); });
      var b = cur.S.bull, d = cur.S.bear, n = cur.S.neutral, st = stOf(cur), pr = (cur.prob || []).length ? cur.prob.map(function (q) { return fa(q.h, 0) + ' جلسه: ' + pct(q.p, 0) + ' احتمال بالاتر' + (q.skill ? '' : ' (نرخ پایه)'); }).join(' · ') : 'برآورد معتبر احتمال وجود ندارد؛ درجهٔ اطمینان کیفی: ' + (cur.conf >= 70 ? 'زیاد' : cur.conf >= 55 ? 'متوسط' : 'کم') + ' (' + fa(cur.conf, 0) + '٪، درجه ' + cur.grade + ')';
      ps.push(ctx.panel('سناریوهای معاملاتی', [h('div', { class: 'row-ctl' }, [ps2]), table(['مؤلفه', 'اطلاعات'], [
        ['دارایی', cur.sym + ' · ' + cur.mk + ' · قیمت ' + nd(cur, cur.last) + ' ' + (cur.unit || '') + ' (' + cur.date + ')'], ['جهت مورد انتظار', DIRS[cur.dir] + ' · امتیاز ترکیبی ' + fa(cur.c.S, 2)],
        ['سناریوی صعودی', 'تأیید: ' + b.confirmTxt + ' · اهداف ' + b.tp.map(function (v) { return nd(cur, v); }).join(' / ')], ['سناریوی نزولی', 'تأیید: ' + d.confirmTxt + ' · اهداف ' + d.tp.map(function (v) { return nd(cur, v); }).join(' / ') + ' (' + d.tpSrc + ')'], ['سناریوی خنثی', n.txt],
        ['نقطهٔ ورود', nd(cur, b.lo) + '–' + nd(cur, b.hi) + (b.type === 'breakout' || b.type === 'trigger' ? ' (پس از تأیید شکست)' : b.type === 'pullback' ? ' (سفارش محدود در پولبک)' : '')], ['محدودهٔ خروج', b.exitTxt + ' · ' + d.exitTxt],
        ['حد ضرر', nd(cur, b.stop) + ' — ' + b.stopSrc], ['اهداف', b.tp.map(function (v, i) { return 'هدف ' + fa(i + 1, 0) + ': ' + nd(cur, v); }).join(' · ')], ['نسبت بازده به ریسک', 'تا هدف ۱: ' + fa(b.rr1, 1) + ' · تا هدف ۲: ' + fa(b.rr2, 1) + ' (پس از هزینهٔ معامله)'],
        ['شرایط ابطال', (cur.c.inval || []).join('؛ ') || '—'], ['افق زمانی', cur.hz ? cur.hz.fa : '—'], ['محرک‌ها', (cur.f.drivers || []).join('؛ ') || '—'], ['خلاف جهت', (cur.f.against || []).join('؛ ') || '—'],
        ['احتمال / اطمینان', pr], ['کیفیت داده', cur.S.quality + (cur.c.src ? ' · منبع ' + cur.c.src : '')], ['وضعیت فعلی', h('span', null, [stChip(st, cur.track ? TE.ST8[cur.track.st] : cur.S.stateFa), document.createTextNode(cur.elig ? '' : ' — فرصت نیست: ' + (cur.notWhy.join('، ') || '—'))])]])]));
    }
    // ---- D · signal monitoring with history
    if (tr) { var nm = function (s) { return s.sym; }, lastWhy = function (s) { var e = s.hist[s.hist.length - 1]; return e ? e.why + (e.date ? ' (' + e.date + ')' : '') : '—'; };
      ps.push(ctx.panel('پایش سیگنال‌ها', [
        tr.active.length ? table(['دارایی', 'وضعیت', 'ثبت', 'سطح تأیید', 'ورود', 'حد ضرر', 'اهداف', 'آخرین تغییر و دلیل'], tr.active.map(function (s) { var L = s.lv; return [nm(s), stChip(s.st), s.d0fa, fa(L.confirm, 0), fa(L.lo, 0) + '–' + fa(L.hi, 0), fa(L.stop, 0), L.tp.map(function (v) { return fa(v, 0); }).join(' / '), lastWhy(s)]; })) : h('p', { class: 'small muted', text: 'سیگنال فعالی در پایش نیست.' }),
        tr.closed.length ? h('details', { class: 'fold' }, [h('summary', { text: 'سیگنال‌های بسته، باطل یا منقضی (' + fa(tr.closed.length, 0) + ')' }), table(['دارایی', 'وضعیت نهایی', 'ثبت', 'دلیل'], tr.closed.map(function (s) { return [nm(s), stChip(s.st), s.d0fa, lastWhy(s)]; }))]) : null,
        (function () { var lv = [].concat.apply([], tr.sig.map(function (s) { return s.lvlog.map(function (l) { return [s.sym, l.f, fa(l.o, 0) + ' ← ' + fa(l.n, 0), l.why, new Date(l.at).toLocaleString('fa-IR')]; }); })).slice(-20).reverse(); return lv.length ? h('details', { class: 'fold' }, [h('summary', { text: 'تغییر سطوح با دلیل (' + fa(lv.length, 0) + ')' }), table(['دارایی', 'سطح', 'قبلی ← جدید', 'دلیل', 'زمان'], lv)]) : null; })(),
        h('p', { class: 'small muted', text: 'هر بار داده به‌روز شود، هر سیگنال از روز ثبت جلسه‌به‌جلسه بازپخش می‌شود: تأیید، هدف ۱ و ۲ و ۳، حد ضرر، ابطال پیش از ورود، پایان افق. تا ورود رخ نداده، سطوح با ساختار جدید بازمحاسبه و تغییرشان ثبت می‌شود؛ پس از ورود ثابت می‌مانند (جز انتقال حد ضرر به نقطهٔ ورود بعد از هدف ۱). سیگنال باطل یا منقضی در فهرست فرصت‌ها نمی‌آید.' })])); }
    // ---- E · risk and allocation
    var RK = K.risk; if (RK && RK.rows.length) ps.push(ctx.panel('مدیریت ریسک و تخصیص سرمایه', [table(['دارایی', 'ریسک هر معامله', 'سرمایهٔ پیشنهادی', 'حداکثر زیان', 'فاصلهٔ حد ضرر', 'نقدشوندگی (میانگین ۲۰ روز، میلیارد ریال)', 'ریسک نگهداری در افق (۱σ)'], RK.rows.map(function (r) { return [r.x.sym, pct(r.riskPct, 1) + ' سرمایه', pct(r.posPct, 1) + (isF(r.capital) ? ' (' + fa(r.capital / 1e9, 1) + ' میلیارد ریال)' : ''), isF(r.maxLoss) ? fa(r.maxLoss / 1e9, 2) + ' میلیارد ریال' : pct(r.riskPct, 1) + ' سرمایه', pct(r.x.risk, 1), isF(r.liq) ? fa(r.liq, 1) + (r.liqOK ? '' : ' (کم)') : '—', pct(r.hold, 1)]; })),
      h('p', { class: (RK.overHeat ? 'warn-t' : 'small muted'), text: 'جمع ریسک اگر همهٔ فرصت‌ها گرفته شوند: ' + pct(RK.heat, 1) + ' از سقف ' + pct(RK.heatMax, 1) + (RK.overHeat ? ' — بیش از سقف؛ فقط بالاترین‌های فهرست را بگیرید' : '') + '. تمرکز بر حسب بازار: ' + Object.keys(RK.conc).map(function (k) { return k + ' ' + pct(RK.conc[k], 0); }).join('، ') + (isF(RK.eq) ? '' : ' (سرمایهٔ حساب در «تنظیمات حساب» وارد نشده؛ مبالغ ریالی محاسبه نمی‌شوند)') }),
      RK.corrNames.length > 1 ? table(['همبستگی ۶۰ روزه'].concat(RK.corrNames), RK.corr.map(function (row, i) { return [RK.corrNames[i]].concat(row.map(function (v) { return isF(v) ? fa(v, 2) : '—'; })); })) : null]));
    return ps;
  }

  /* ---------- decision board (directive «dashboard optimisation»): 1 market overview · 2 opportunities and actions per market · 3 details (folded) ----------
     Everything here is read from the same desk items and central record the rest of the hub uses; nothing is recomputed differently. */
  var LVMEMO = { s: null, r: null };
  function lvResult() {
    var IM = Hub.iranMarkets; if (!IM) return null; var S0 = U.store.get(IM.KEY, null); if (!S0 || !S0.data || !Object.keys(S0.data).length) return null;
    if (LVMEMO.s === S0 && LVMEMO.r) return LVMEMO.r;
    try { var r = IM.run(S0); if (r.sample) return null; LVMEMO.s = S0; LVMEMO.r = r; return r; } catch (e) { return null; }
  }
  function shamsiTE(g) { try { return Hub.mktCal.faDate(g); } catch (e) { return String(g); } }
  function decisionBoard(ctx) {
    var S = ctx.S, X = ctx.R.X, D = X.decide(), K = D.desk, C = X.central; if (!K || !C) return null;
    var zOf = function (x) { return X.zmap && X.zmap[x.key]; };
    var tr3 = function (x) { var z = zOf(x); if (!z) return null; var R = z.R, t = R.X.n - 1; if (t < 30) return null;
      return { s: TE.trendView(R.X, R.I, t, 's'), m: TE.trendView(R.X, R.I, t, 'm'), l: TE.trendView(R.X, R.I, t, 'l'), rsi: R.I.rsi[t], mh: R.I.macdH[t], mh5: R.I.macdH[t - 5] }; };
    var strOf = function (q) { if (!q) return { fa: 'دادهٔ کم', v: 0 }; var u = ['s', 'm', 'l'].filter(function (k) { return q[k] === 'up'; }).length, d = ['s', 'm', 'l'].filter(function (k) { return q[k] === 'down'; }).length;
      return u === 3 ? { fa: 'صعودی قوی (هر سه افق)', v: 3 } : u === 2 && !d ? { fa: 'صعودی متوسط (۲ از ۳ افق)', v: 2 } : d === 3 ? { fa: 'نزولی قوی (هر سه افق)', v: -3 } : d === 2 && !u ? { fa: 'نزولی متوسط (۲ از ۳ افق)', v: -2 }
        : u && d ? { fa: 'متضاد: ' + (q.s === 'up' ? 'کوتاه صعودی' : q.s === 'down' ? 'کوتاه نزولی' : 'کوتاه خنثی') + '، ' + (q.m === 'up' ? 'میان صعودی' : q.m === 'down' ? 'میان نزولی' : 'میان خنثی'), v: u - d } : u ? { fa: 'صعودی ضعیف', v: 1 } : d ? { fa: 'نزولی ضعیف', v: -1 } : { fa: 'خنثی', v: 0 }; };
    var momOf = function (q) { if (!q || !isFinite(q.rsi)) return '—'; var r = q.rsi, m = isFinite(q.mh) && isFinite(q.mh5) ? (q.mh > q.mh5 ? 'رو به افزایش' : 'رو به کاهش') : '';
      return 'RSI ' + fa(r, 0) + ' (' + (r >= 70 ? 'اشباع خرید' : r >= 55 ? 'فشار خرید' : r > 45 ? 'خنثی' : r > 30 ? 'فشار فروش' : 'اشباع فروش') + ')' + (m ? '؛ مومنتوم ' + m : ''); };
    var cen = function (x) { return C.by[x.key] || null; };
    var ORDC = ['stock', 'fund', 'gold', 'fx', 'crypto', 'commodity'], byC = {}; K.items.forEach(function (x) { (byC[x.cls] = byC[x.cls] || []).push(x); });
    var Q = {}; K.items.forEach(function (x) { Q[x.key] = tr3(x); });
    var nameL = function (a, n) { n = n || 8; return a.length ? a.slice(0, n).map(function (x) { return x.sym; }).join('، ') + (a.length > n ? ' و ' + fa(a.length - n, 0) + ' مورد دیگر' : '') : '—'; };
    var LVR = lvResult();
    var out = { s1: [], s2: [] };

    /* ---- 1 · market overview: trend, strength, momentum, risks — with a plain sentence per market */
    var ov = ORDC.filter(function (c) { return (byC[c] || []).length; }).map(function (c) {
      var A = byC[c], n = A.length, up = 0, dn = 0, st3 = 0, ob = 0, os = 0, rs = [], stale = A.filter(function (x) { return isFinite(x.age) && x.age > 96; }), nearR = [], nearS = [];
      A.forEach(function (x) { var q = Q[x.key], s = strOf(q); if (s.v > 0) up++; else if (s.v < 0) dn++; if (Math.abs(s.v) === 3) st3++; if (q && isFinite(q.rsi)) { rs.push(q.rsi); if (q.rsi >= 70) ob++; if (q.rsi <= 30) os++; }
        var k = x.S && x.S.chk; if (k && isFinite(k.dUp) && k.dUp >= 0 && k.dUp <= 0.02) nearR.push(x); if (k && isFinite(k.dDn) && k.dDn <= 0 && k.dDn >= -0.02) nearS.push(x); });
      rs.sort(function (a, b) { return a - b; }); var rm = rs.length ? rs[Math.floor(rs.length / 2)] : NaN, dom = up > dn * 1.5 && up >= 0.4 * n ? 'صعودی' : dn > up * 1.5 && dn >= 0.4 * n ? 'نزولی' : 'بدون جهت غالب';
      var risk = []; if (stale.length) risk.push(fa(stale.length, 0) + ' دارایی با دادهٔ قدیمی‌تر از ۴ روز (' + nameL(stale, 4) + ')'); if (ob) risk.push(fa(ob, 0) + ' دارایی در اشباع خرید (RSI ≥ ۷۰)');
      if (nearR.length) risk.push('نزدیک سطح تأیید صعود / مقاومت (کمتر از ۲٪): ' + nameL(nearR, 5)); if (nearS.length) risk.push('نزدیک از دست دادن حمایت (کمتر از ۲٪): ' + nameL(nearS, 5));
      var said = dom === 'صعودی' ? 'بیشتر دارایی‌های این بازار روند صعودی دارند؛ ' + (rm >= 65 ? 'ولی RSI میانه بالاست، پس خرید تازه در اصلاح بهتر از تعقیب قیمت است.' : 'خرید فقط روی سیگنال‌های تأییدشده.')
        : dom === 'نزولی' ? 'بیشتر دارایی‌ها روند نزولی دارند؛ خرید تازه پرریسک است و دارندگان حد ضرر را رعایت کنند.' : 'بازار جهت روشنی ندارد؛ انتخاب تک‌دارایی و حجم کمتر.';
      return [TE.MKFA[c] || c, fa(n, 0), 'صعودی ' + fa(up, 0) + ' · نزولی ' + fa(dn, 0) + ' · خنثی/متضاد ' + fa(n - up - dn, 0) + ' → ' + dom, fa(st3, 0) + ' دارایی با روند هم‌جهت در هر سه افق', isFinite(rm) ? 'RSI میانه ' + fa(rm, 0) + ' · اشباع خرید ' + fa(ob, 0) + ' · اشباع فروش ' + fa(os, 0) : '—', risk.join('؛ ') || 'ریسک ویژه‌ای در داده دیده نشد', said]; });
    (X.idxv || []).forEach(function (v) { if (!v.ok) return; var q = v.chk || {};
      var nUp = v.tr ? ['s', 'm', 'l'].filter(function (k) { return v.tr[k] === 'up'; }).length : 0, nDn = v.tr ? ['s', 'm', 'l'].filter(function (k) { return v.tr[k] === 'down'; }).length : 0;
      ov.unshift(['شاخص — ' + v.name + ' · ' + fa(v.last) + ' (' + v.dateFa + ')', '—', (v.tr ? ['s', 'm', 'l'].map(function (k) { return ({ up: 'صعودی', down: 'نزولی', flat: 'خنثی', none: '—' })[v.tr[k]] || '—'; }).join(' / ') : '—') + ' (کوتاه / میان / بلند)', nUp === 3 ? 'صعودی قوی (هر سه افق)' : nDn === 3 ? 'نزولی قوی (هر سه افق)' : nUp > nDn ? 'صعودی ' + fa(nUp, 0) + ' از ۳ افق' : nDn > nUp ? 'نزولی ' + fa(nDn, 0) + ' از ۳ افق' : 'متضاد یا خنثی',
        'تغییر ۱ / ۵ / ۲۰ جلسه: ' + pct(v.chg1, 1) + ' / ' + pct(v.chg5, 1) + ' / ' + pct(v.chg20, 1) + (isFinite(v.rsi) ? ' · RSI ' + fa(v.rsi, 0) : ''), (isFinite(q.dUp) && q.dUp <= 0.02 && q.dUp >= 0 ? 'نزدیک مقاومت ' + fa(v.up) + ' (' + pct(q.dUp, 1) + ')؛ ' : '') + (isFinite(q.dDn) && q.dDn >= -0.02 && q.dDn <= 0 ? 'نزدیک حمایت ' + fa(v.dn) + ' (' + pct(q.dDn, 1) + ')؛ ' : '') + 'مقاومت ' + fa(v.up) + ' · حمایت ' + fa(v.dn), v.act || '']); });
    out.s1.push(ctx.panel('وضعیت کلی بازار — روند، قدرت، مومنتوم و ریسک', [table(['بازار', 'تعداد', 'روند (کوتاه/میان/بلند هم‌وزن)', 'قدرت روند', 'مومنتوم', 'ریسک‌های اصلی', 'خوانش ساده'], ov),
      h('p', { class: 'small muted', text: 'قدرت روند = تعداد افق‌های هم‌جهت (کوتاه: میانگین ۲۰، میان: میانگین ۵۰ و ۲۰۰، بلند: میانگین ۲۰۰ و بازده ۲۵۰ جلسه). مومنتوم = RSI ۱۴ و جهت هیستوگرام MACD نسبت به ۵ جلسهٔ قبل. هیچ درصدی در این جدول احتمال نیست.' })]));
    if (LVR) {
      var rowsL = LVR.rows.filter(function (a) { return a.ok; }).map(function (a) { var M = a.h.m.ok ? a.h.m : a.h.s; var p = a.plan || {};
        return [a.name, fa(a.last), M.ok ? (M.pos * 100 > 100 ? 'بالای سقف کانال' : M.pos < 0 ? 'زیر کف کانال' : fa(M.pos * 100, 0) + '٪ از کف تا سقف') + ' — کانال ' + fa(M.lo) + ' تا ' + fa(M.up) : '—', M.ok ? 'RSI ' + fa(M.rsi, 0) + (M.dv.bear ? ' · واگرایی منفی' : M.dv.bull ? ' · واگرایی مثبت' : '') : '—', p.lean ? Hub.iranMarkets.LEAN[p.lean][0] : '—', (p.why || []).slice(0, 2).join('؛ ') || '—']; });
      if (rowsL.length) out.s1.push(ctx.panel('بازارهای ایران — خوانش کانال میان‌مدت', [table(['بازار', 'آخرین', 'جایگاه در کانال (مقدار)', 'مومنتوم', 'خوانش کانال و مومنتوم', 'دلیل'], rowsL), h('p', { class: 'small muted', text: 'از ابزار «تحلیل بازارهای ایران» با همان داده؛ جزئیات سه افق، تضاد افق‌ها و توضیح هر عدد در همان ابزار است.' })]));
    }

    /* ---- 2 · opportunities and actions */
    var stage = function (x, l) { var b = x.S && x.S.bull || {}, lo = Math.min(l.entry[0], l.entry[1]), hi = Math.max(l.entry[0], l.entry[1]), md = (lo + hi) / 2;
      if (!(lo > 0)) return '—'; return b.type === 'breakout' || b.type === 'trigger' ? '۵۰٪ پس از تثبیت بالای ' + nd(x, b.confirm || hi) + '، ۵۰٪ در بازگشت به ' + nd(x, lo) + '–' + nd(x, md) : '۴۰٪ در ' + nd(x, hi) + '، ۳۰٪ در ' + nd(x, md) + '، ۳۰٪ در ' + nd(x, lo); };
    var lvl = function (x) { var v = x.v6 || {}; return v.lv || (x.act && x.act.lv) || { entry: [x.S.bull.lo, x.S.bull.hi], stop: x.S.bull.stop, tp: x.S.bull.tp, rr: x.S.bull.rr2 }; };
    var conf2 = function (x) { var k = x.S && x.S.chk; return k ? ['▲ ' + nd(x, k.up) + ' (' + pct(k.dUp, 1) + ')', '▼ ' + nd(x, k.dn) + ' (' + pct(k.dDn, 1) + ')'] : [nd(x, x.S.bull.confirm), nd(x, x.S.bear.confirm)]; };
    var row = function (x, rk) { var r = cen(x) || {}, l = lvl(x), q = Q[x.key], s = strOf(q), cf = conf2(x), b = x.S.bull, why = (x.f && x.f.drivers && x.f.drivers[0]) || r.why || '—', risk = (x.c && x.c.inval && x.c.inval[0]) || (x.f && x.f.against && x.f.against[0]) || ('بسته‌شدن زیر ' + nd(x, l.stop));
      return [rk, x.sym, isFinite(x.score) ? fa(x.score, 2) : '—', fa(x.conf, 0) + '٪ · ' + (x.grade || '—'), s.fa, (r.stFa || '—') + ' · ' + (r.enFa || '—'), h('b', { text: r.actFa || (x.act && x.act.fa) || '—' }),
        nd(x, l.entry[0]) + '–' + nd(x, l.entry[1]), stage(x, l), cf[0], cf[1], nd(x, l.stop), (l.tp || []).map(function (v) { return nd(x, v); }).join(' / '), isFinite(b.exitLo) ? nd(x, b.exitLo) + '–' + nd(x, b.exitHi) : '—', fa(l.rr, 1), (x.tz && x.tz.zone ? TE.tzText(x.tz, function (v) { return nd(x, v); }) : '—') + (x.pt && x.pt.tg[0] && x.pt.tg[0].w && x.pt.tg[0].w.fromFa ? ' · هدف ' + nd(x, x.pt.tg[0].p) + ' بین ' + x.pt.tg[0].w.fromFa + ' و ' + x.pt.tg[0].w.toFa : ''), why + (x.tzNote ? '؛ ' + x.tzNote : ''), risk]; };
    var HEAD = ['رتبه', 'دارایی', 'امتیاز', 'اطمینان · درجه', 'روند', 'وضعیت سیگنال · ورود', 'اقدام', 'محدودهٔ ورود', 'ورود پله‌ای', 'تأیید صعود (فاصله)', 'تأیید نزول (فاصله)', 'حد ضرر', 'اهداف', 'محدودهٔ خروج', 'R:R', 'کف / سقف احتمالی، تأیید برگشت و زمان هدف', 'دلیل اصلی', 'ریسک اصلی / ابطال'];
    // action groups first: what to do today
    var all = Object.keys(C.by).map(function (k) { return C.by[k]; }), g = function (f) { return all.filter(f); };
    var enter = g(function (r) { return r.act === 'buy' || r.act === 'scale'; }), nearE = g(function (r) { return r.act === 'wait' && r.en === 'in'; }), hold = g(function (r) { return r.held && r.act === 'hold'; }),
      exitL = g(function (r) { return r.held && /^(sell|close|reduce)$/.test(r.act); }), none = g(function (r) { return r.act === 'none'; });
    var nm = function (a) { return a.length ? a.slice(0, 15).map(function (r) { return r.sym + ' (' + (r.mk || '') + ')'; }).join('، ') + (a.length > 15 ? ' و ' + fa(a.length - 15, 0) + ' مورد دیگر' : '') : 'هیچ'; };
    out.s2.push(ctx.panel('اقدام امروز', [table(['پرسش', 'تعداد', 'دارایی‌ها'], [['ورود کنم؟ (خرید / خرید پله‌ای: تأییدشده و قیمت در محدوده)', fa(enter.length, 0), nm(enter)], ['نزدیک ورود (قیمت در محدوده، یک شرط مانده)', fa(nearE.length, 0), nm(nearE)],
      ['نگه دارم؟ (دارایی‌هایی که دارید)', fa(hold.length, 0), nm(hold)], ['کاهش یا خروج؟ (دارایی‌هایی که دارید)', fa(exitL.length, 0), nm(exitL)], ['عدم اقدام', fa(none.length, 0), 'ردشده، منقضی، فاقد داده یا نزولی برای کسی که دارایی را ندارد']]),
      enter.length ? null : h('p', { class: 'small', text: 'امروز هیچ دارایی‌ای همهٔ شرط‌های ورود را ندارد؛ نقد ماندن یک تصمیم است، نه کوتاهی. فهرست «در انتظار تأیید» پایین هر بازار نشان می‌دهد کدام نزدیک‌ترند.' })]));
    // per market: top 10 eligible (no padding) + watch list of strong trends without an entry
    ORDC.forEach(function (c) { var A = byC[c] || []; if (!A.length) return;
      var top = K.opp.filter(function (x) { return x.cls === c; }).slice(0, 10), inTop = {}; top.forEach(function (x) { inTop[x.key] = 1; });
      var watch = A.filter(function (x) { if (inTop[x.key] || x.elig) return false; var r = cen(x) || {}, s = strOf(Q[x.key]); if (r.st === 'nodata') return false; return s.v >= 2 || r.st === 'cond' || r.st === 'review'; })
        .sort(function (a, b) { return strOf(Q[b.key]).v - strOf(Q[a.key]).v || (b.conf || 0) - (a.conf || 0); });
      var wRow = function (x) { var r = cen(x) || {}, l = lvl(x), cf = conf2(x), s = strOf(Q[x.key]);
        return [x.sym, s.fa, momOf(Q[x.key]), fa(x.conf, 0) + '٪', (r.stFa || '—') + ' · ' + (r.enFa || '—'), r.actFa || '—', cf[0], nd(x, l.entry[0]) + '–' + nd(x, l.entry[1]) + ' (اصلاح تا محدوده)', nd(x, l.stop), (x.notWhy || []).slice(0, 2).join('؛ ') || r.why || '—']; };
      var WN = S['wAll_' + c] ? watch.length : Math.min(10, watch.length);
      out.s2.push(ctx.panel((TE.MKFA[c] || c) + ' — ' + fa(top.length, 0) + ' فرصت واجد شرایط' + (watch.length ? ' · ' + fa(watch.length, 0) + ' در انتظار تأیید' : ''), [
        top.length ? table(HEAD, top.map(function (x, i) { return row(x, fa(i + 1, 0)); })) : h('p', { class: 'small', text: 'در این بازار هیچ دارایی‌ای همهٔ شرط‌های فرصت را ندارد؛ فهرست با دارایی ضعیف پر نمی‌شود.' }),
        watch.length ? h('div', {}, [h('h4', { text: 'در انتظار تأیید یا اصلاح قیمت (روند قوی یا سیگنال مشروط، بدون ورود معتبر)' }), table(['دارایی', 'روند', 'مومنتوم', 'اطمینان', 'وضعیت سیگنال · ورود', 'اقدام (موتور مرکزی)', 'سطح تأیید صعود (فاصله)', 'ورود پس از اصلاح', 'حد ضرر', 'چرا هنوز فرصت نیست'], watch.slice(0, WN).map(wRow)),
          watch.length > 10 ? h('button', { class: 'btn btn-sm', type: 'button', text: S['wAll_' + c] ? 'نمایش ۱۰ مورد اول' : 'نمایش همهٔ ' + fa(watch.length, 0) + ' مورد', onclick: function () { S['wAll_' + c] = !S['wAll_' + c]; ctx.rerender(); } }) : null]) : null])); });
    // turning points: probable bottom in downtrends, probable top in uptrends (directive 9) — next to entry, exit, confirmation and stop
    (function () {
      var near = function (t) { if (!t || !t.zone) return 99; if (t.state === 'inZone' || t.state === 'confirmed') return 0; var d = t.side === 'down' ? (t.px - t.zone[1]) / t.atr : (t.zone[0] - t.px) / t.atr; return d < 0 ? 0 : d; };
      var pr = function (t) { var K = t.K, dn = t.side === 'down'; return (dn ? 'کف' : 'سقف') + ' در این محدوده طی ' + fa(TE.TZH, 0) + ' جلسه: ' + pct(K.hit, 0) + ' · رسیدن به ' + (dn ? 'حمایت' : 'مقاومت') + ' اول: ' + pct(K.l1, 0) + ' · برگشت کاذب پس از تأیید: ' + pct(K.fake, 0) + ' (برون‌نمونه، ' + fa(K.nOS, 0) + ' مورد)'; };
      var rowsD = [], rowsU = [];
      var add = function (nm, mk, t, x, held) { if (!t || !t.zone) return; var f = x ? function (v) { return nd(x, v); } : function (v) { return fa(v); }, dn = t.side === 'down', tr = dn ? 'روند نزولی' : 'روند صعودی';
        var r = [nm, mk, (t.corr ? (dn ? 'اصلاح در روند بزرگ‌تر صعودی' : 'جهش در روند بزرگ‌تر نزولی') : tr) + ' · قدرت ' + t.strFa, f(t.px), t.T.map(function (q) { return f(q.p); }).join(' / '), f(t.zone[0]) + '–' + f(t.zone[1]) + (t.inZ.length ? ' (' + (dn ? 'حمایت ' : 'مقاومت ') + t.inZ.map(f).join('، ') + ' داخل محدوده)' : ''),
          (dn ? t.sup : t.res).map(f).join(' / ') || '—', h('b', { text: t.stFa }),
          dn ? (t.state === 'confirmed' ? 'برگشت تأیید شد؛ خرید فقط اگر سیگنال مرکزی هم تأیید کند' : t.state === 'broke' ? 'سناریو باطل؛ صبر برای محدودهٔ پایین‌تر' : 'انتظار برای تکمیل اصلاح') : (t.state === 'confirmed' ? (held ? 'کاهش موقعیت (ذخیرهٔ سود)' : 'خرید تازه نکنید') : t.state === 'inZone' ? 'نگهداری و بررسی ذخیرهٔ سود' : 'نگهداری'),
          (dn ? 'بسته‌شدن بالای ' : 'بسته‌شدن زیر ') + f(t.conf), f(t.stop), dn ? (t.after.map(f).join(' / ') || '—') : (t.after.map(f).join(' / ') || '—'), f(t.inv), fa(t.evN, 0) + (t.ev.length ? ': ' + t.ev.join('؛ ') : ''), pr(t)];
        (dn ? rowsD : rowsU).push({ r: r, k: near(t) + (t.state === 'confirmed' ? -1 : 0) }); };
      (X.idxv || []).forEach(function (v) { if (v.ok && v.tz) add(v.name + ' (فقط سناریو)', 'شاخص', v.tz, null, false); });
      K.items.forEach(function (x) { var t = x.tz; if (!t || !t.zone) return; if (near(t) > 1.5 && !x.pos && !x.elig) return; add(x.sym, x.mk, t, x, !!x.pos); });
      var sortT = function (a) { return a.sort(function (p, q) { return p.k - q.k; }).map(function (o) { return o.r; }); };
      var hdD = ['دارایی', 'بازار', 'وضعیت و قدرت روند', 'قیمت', 'اهداف نزولی ۱ / ۲ / ۳', 'محدودهٔ احتمالی کف', 'حمایت‌ها', 'وضعیت', 'اقدام فعلی', 'شرط خرید (تأیید برگشت صعودی)', 'حد ضرر خرید پس از ورود', 'اهداف پس از برگشت', 'ابطال سناریوی برگشت (بسته‌شدن زیر)', 'شواهد توقف ریزش', 'احتمال‌ها (رویداد، افق، نمونه)'];
      var hdU = ['دارایی', 'بازار', 'وضعیت و قدرت روند', 'قیمت', 'اهداف صعودی ۱ / ۲ / ۳', 'محدودهٔ احتمالی سقف', 'مقاومت‌ها', 'وضعیت', 'اقدام فعلی', 'شرط فروش (تأیید برگشت نزولی)', 'حد خروج موقعیت خرید', 'حمایت‌ها پس از برگشت', 'ابطال سناریوی سقف (بسته‌شدن بالای)', 'شواهد تضعیف رشد', 'احتمال‌ها (رویداد، افق، نمونه)'];
      var D0 = sortT(rowsD), U0 = sortT(rowsU), all0 = !!S.tzAll, cut = function (a) { return all0 ? a : a.slice(0, 15); };
      if (!D0.length && !U0.length) return;
      out.s2.push(ctx.panel('نقاط برگشت: کف احتمالی در روند نزولی، سقف احتمالی در روند صعودی', [
        h('p', { class: 'small', text: 'رسیدن به محدودهٔ کف یا سقف به‌تنهایی سیگنال نیست؛ خرید یا فروش فقط پس از «تأیید برگشت» (بسته‌شدن قیمت پایانی آن سوی سطح تأیید) و فقط اگر وضعیت مرکزی همان دارایی اجازه دهد. محدوده = صدک ۲۵ تا ۷۵ حرکت ' + fa(TE.TZH, 0) + ' جلسه‌ای همان بازار در همان وضعیت روند (بر حسب ATR)، برآورد روی ۷۰٪ اول تاریخچه و سنجش روی ۳۰٪ آخر. فهرست: دارایی‌های داخل یا نزدیک محدوده (کمتر از ۱٫۵ ATR)، دارایی‌هایی که دارید و فرصت‌های واجد شرایط.' }),
        D0.length ? h('div', {}, [h('h4', { text: 'روند نزولی — کف احتمالی و فرصت خرید (' + fa(D0.length, 0) + ')' }), table(hdD, cut(D0))]) : null,
        U0.length ? h('div', {}, [h('h4', { text: 'روند صعودی — سقف احتمالی و ذخیرهٔ سود (' + fa(U0.length, 0) + ')' }), table(hdU, cut(U0))]) : null,
        D0.length > 15 || U0.length > 15 ? h('button', { class: 'btn btn-sm', type: 'button', text: all0 ? 'نمایش ۱۵ مورد اول هر جدول' : 'نمایش همه', onclick: function () { S.tzAll = !S.tzAll; ctx.rerender(); } }) : null]));
    })();
    // price & time (directive 10): every target with its window, the kind of correction under way, four scenarios with measured frequencies
    (function () {
      var sel = K.items.filter(function (x) { var p = x.pt, t = x.tz; if (!p || !t || !t.zone) return false; return x.cls === 'gold' || x.cls === 'fx' || x.elig || x.pos || t.state === 'inZone' || t.state === 'confirmed' || p.tc.type === 'time'; });
      if (!sel.length && !(K.gold && K.gold.ok)) return;
      var ORD = { gold: 0, fx: 1, stock: 2, fund: 3, crypto: 4, commodity: 5 }; sel.sort(function (a, b) { return (ORD[a.cls] - ORD[b.cls]) || (b.score || 0) - (a.score || 0); });
      var win = function (w) { return w && w.fromFa ? w.fromFa + ' تا ' + w.toFa + ' (' + fa(w.a, 0) + ' تا ' + fa(w.b, 0) + ' جلسه)' : '—'; };
      var rows = sel.map(function (x) { var p = x.pt, t = x.tz, f = function (v) { return nd(x, v); }, dn = t.side === 'down', T1 = p.tg[0], T2 = p.tg[1], r = cen(x) || {};
        var tgt = p.tg.map(function (T, i) { return (i ? 'هدف ۲: ' : 'هدف ۱: ') + f(T.p) + (T.none ? ' (نمونه کم؛ زمان برآورد نمی‌شود)' : ' — ' + win(T.w) + '؛ رسیدن پیش از ابطال طی ۶۰ جلسه: ' + pct(T.pReach, 0) + '، داخل بازه: ' + pct(T.pWin, 0)); }).join(' | ');
        var sc = T1 && !T1.none ? '۱ رسیدن به هدف در بازه با اصلاح کم ' + pct(T1.scen[0], 0) + ' · ۲ تأخیر زمانی (نه هدف، نه ابطال، نه اصلاح عمیق) ' + pct(T1.scen[1], 0) + ' · ۳ اصلاح عمیق‌تر (بیش از نیمهٔ فاصله تا ابطال) پیش از هدف ' + pct(T1.scen[2], 0) + ' · ۴ ابطال پیش از هدف ' + pct(T1.scen[3], 0) + ' (برون‌نمونه، ' + fa(T1.n, 0) + ' مورد)' : '—';
        var tcx = p.tcFa + (p.tcRange ? '؛ محدودهٔ نوسان ' + f(p.tcRange[0]) + '–' + f(p.tcRange[1]) + '، ' + fa(p.tcDur, 0) + ' جلسه تا اینجا' + (p.tcWin ? '؛ خروج از محدوده معمولاً ' + win(p.tcWin) + '، شکست هم‌جهت با روند بزرگ‌تر: ' + pct(p.tcPWith, 0) + ' (برون‌نمونه، ' + fa(p.tcN, 0) + ')' : '') : '');
        var dv = p.div.length ? p.div.map(function (d) { return d.src + ': ' + d.fa + ' — فاصلهٔ دو نقطهٔ چرخش ' + fa(d.gap, 0) + (d.wk ? ' هفته' : ' جلسه') + ' (' + fa(d.p1) + ' ← ' + fa(d.p2) + ')، ' + d.weight; }).join(' · ') : 'واگرایی ندارد';
        return [x.sym + (x.cls === 'gold' || x.cls === 'fx' ? '' : ' (' + x.mk + ')'), h('b', { text: p.phase }), (dn ? 'نزولی' : 'صعودی') + (t.corr ? ' (اصلاح در روند بزرگ‌تر)' : '') + (p.wk ? ' · هفتگی ' + ({ up: 'صعودی', down: 'نزولی', flat: 'خنثی' })[p.wk.tr] + '، RSI هفتگی ' + fa(p.wk.rsi, 0) : ''), f(t.px), tgt, tcx,
          f(t.zone[0]) + '–' + f(t.zone[1]), win(p.zoneW), (dn ? 'بسته‌شدن بالای ' : 'بسته‌شدن زیر ') + f(t.conf), 'اهداف: با تأیید برگشت روند (همان ستون قبل) باطل می‌شوند؛ محدودهٔ ' + (dn ? 'کف' : 'سقف') + ': با بسته‌شدن ' + (dn ? 'زیر ' : 'بالای ') + f(t.inv) + ' باطل می‌شود' + (p.valid ? '؛ ' + p.valid.rule : ''), sc,
          isFinite(p.age) ? fa(p.age, 0) + ' جلسه از آخرین ' + (dn ? 'سقف' : 'کف') + ' اصلی (صدک ' + fa(p.agePct * 100, 0) + ')' + (p.exhaust ? ' — فرسودگی زمانی' : '') : '—', dv, r.actFa || '—']; });
      var hd = ['دارایی', 'مرحلهٔ چرخه', 'روند (روزانه · هفتگی)', 'قیمت', 'سناریوی قیمتی و زمانی اهداف', 'نوع اصلاح', 'محدودهٔ کف/سقف احتمالی', 'زمان احتمالی تشکیل کف/سقف', 'تأیید برگشت روند', 'ابطال و اعتبار زمانی', 'چهار سناریو تا پایان بازهٔ هدف ۱', 'سن روند', 'واگرایی‌ها و پیوت‌ها', 'اقدام (موتور مرکزی)'];
      var kids = [h('p', { class: 'small', text: 'زمان‌ها بر حسب جلسهٔ معاملاتی روزانه و تبدیل‌شده به تاریخ با تقویم همان بازار (تعطیلات کسر شده). بازهٔ هر هدف = صدک ۲۵ تا ۷۵ تعداد جلسه‌هایی که در گذشته، در همان بازار و همان وضعیت روند، حرکتی به همان اندازه (بر حسب ATR) پیش از رسیدن به سطح ابطال طول کشیده؛ احتمال‌ها فراوانی برون‌نمونه‌اند. تایم‌فریم یک‌ساعته و چهارساعته تحلیل نمی‌شود چون منبع دادهٔ درون‌روزی نداریم؛ هفتگی از دادهٔ روزانه ساخته می‌شود.' })];
      if (K.gold) { var G = K.gold; kids.push(h('h4', { text: 'طلای داخلی، انس جهانی و دلار' }));
        kids.push(G.ok ? table(['مورد', 'مقدار'], [['قیمت طلای ۱۸ عیار (هر گرم)', fa(G.g) + ' ریال (' + shamsiTE(G.gDate) + ')'], ['ارزش ذاتی از انس × دلار × ۰٫۷۵ ÷ ۳۱٫۱۰۳۵', fa(G.imp) + ' ریال — انس ' + fa(G.o, 2) + ' دلار (' + shamsiTE(G.oDate) + ')، دلار آزاد ' + fa(G.u) + ' ریال (' + shamsiTE(G.uDate) + ')'],
          ['حباب / کف قیمت طلای داخلی', pct(G.pr, 1) + ' — صدک ' + fa(G.prPct * 100, 0) + ' یک سال اخیر (میانه ' + pct(G.prMed, 1) + '، دهک‌ها ' + pct(G.prQ[0], 1) + ' تا ' + pct(G.prQ[1], 1) + ')'],
          ].concat(G.dec.map(function (d) { var big = Object.keys(d.sh).sort(function (a, b) { return Math.abs(d.sh[b]) - Math.abs(d.sh[a]); })[0]; return ['تغییر ' + fa(d.k, 0) + ' جلسه‌ای و منشأ آن', 'طلای ۱۸ ' + pct(d.g, 1) + ' = انس ' + pct(d.o, 1) + ' + دلار ' + pct(d.u, 1) + ' + تغییر حباب ' + pct(d.p, 1) + ' (ترکیب لگاریتمی) → عامل اصلی: ' + ({ o: 'انس جهانی', u: 'دلار', p: 'حباب داخلی' })[big]]; })))
          : h('p', { class: 'small muted', text: G.why }));
        if (G.ok) kids.push(h('p', { class: 'small muted', text: 'مسیر طلای داخلی فقط از نمودار خودش خوانده نمی‌شود: اگر حباب در دهک بالایی باشد، افت دلار یا انس با فشار مضاعف همراه است؛ اگر در دهک پایینی باشد، بخشی از افت انس یا دلار جذب حباب می‌شود. این جدول پیش‌بینی نیست؛ وزن هر عامل در حرکت اخیر را نشان می‌دهد.' })); }
      if (rows.length) kids.push(table(hd, S.ptAll ? rows : rows.slice(0, 20)));
      if (rows.length > 20) kids.push(h('button', { class: 'btn btn-sm', type: 'button', text: S.ptAll ? 'نمایش ۲۰ مورد اول' : 'نمایش همهٔ ' + fa(rows.length, 0) + ' مورد', onclick: function () { S.ptAll = !S.ptAll; ctx.rerender(); } }));
      out.s2.push(ctx.panel('قیمت و زمان: اهداف با بازهٔ زمانی، نوع اصلاح و چهار سناریو', kids));
    })();
    // scenario levels: indices (not tradable) and every market of the Iran markets tool — the former «۵. راه‌حل» table
    var scn = [], BULLL = function (l) { return l === 'up' || l === 'upw' ? true : l === 'dn' || l === 'dnw' ? false : null; };
    (X.idxv || []).forEach(function (v) { if (!v.ok) return; var q = v.chk || {}; scn.push([v.name + ' (شاخص — فقط سناریو)', fa(v.last), q.fa || '—', fa(v.up) + ' (' + pct(q.dUp, 1) + ')', fa(v.dn) + ' (' + pct(q.dDn, 1) + ')', '—', (v.res || []).slice(0, 2).map(function (x) { return fa(x); }).join(' / ') || '—', (v.sup || []).slice(0, 2).map(function (x) { return fa(x); }).join(' / ') || '—', v.act || '—']); });
    if (LVR) LVR.rows.forEach(function (a) { var p = a.plan; if (!p || !p.up || !(p.lv && p.lv.hi10 > 0)) return; var idx = a.kind === 'tse-index';
      // an index already shown from the engine gets the channel model's lean added to its row, not a second row with other levels
      if (idx) { var eq = /هم‌وزن/.test(a.name), row = scn.filter(function (r) { return /شاخص/.test(r[0]) && /هم‌وزن/.test(r[0]) === eq; })[0];
        if (row) { row[2] += ' · مدل کانال (ابزار بازارهای ایران): ' + Hub.iranMarkets.LEAN[p.lean][0] + ((BULLL(p.lean) === false && /بالای سطح تأیید صعودی/.test(row[2])) || (BULLL(p.lean) === true && /زیر سطح تأیید نزولی/.test(row[2])) ? ' — با موتور هم‌جهت نیست؛ تمایل کانال از جایگاه قیمت در کانال می‌آید و روند موتور از میانگین‌ها' : ''); return; } }
      scn.push([a.name + (idx ? ' (شاخص — فقط سناریو)' : ''), fa(a.last), Hub.iranMarkets.LEAN[p.lean][0] + (p.chk ? ' · ' + p.chk.fa : ''), fa(p.lv.hi10) + (p.chk ? ' (' + pct(p.chk.dUp, 1) + ')' : ''), fa(p.lv.lo10) + (p.chk ? ' (' + pct(p.chk.dDn, 1) + ')' : ''), idx ? '—' : fa(p.stopL), p.upT.map(function (v) { return fa(v); }).join(' / ') || '—', p.dnT.map(function (v) { return fa(v); }).join(' / ') || '—', idx ? 'فقط سناریو؛ شاخص قابل معامله نیست. ' + (p.lean === 'up' || p.lean === 'upw' ? 'صعود تأییدشده = محیط مساعدتر برای سهام' : 'نزول تأییدشده = سخت‌گیری بیشتر در خرید سهام') : p.act]); });
    if (scn.length) out.s2.push(ctx.panel('سطوح و سناریوهای همهٔ بازارها (شاخص، ارز، طلا، سکه، نفت و …)', [table(['بازار', 'آخرین', 'تمایل / وضعیت', 'تأیید صعود بالای', 'تأیید نزول زیر', 'حد ضرر خرید', 'اهداف صعودی', 'اهداف نزولی', 'اقدام'], scn),
      h('p', { class: 'small muted', text: 'تأیید = بسته‌شدن قیمت پایانی بالاتر یا پایین‌تر از سطح (بالاترین / پایین‌ترین قیمت پایانی ۱۰ جلسهٔ قبل در ابزار بازارهای ایران؛ ۲۰ جلسه برای شاخص‌ها در موتور). شاخص‌ها و سری‌های غیرقابل‌معامله فقط سناریو دارند، نه ورود و حد ضرر. اقدام این جدول از ابزار بازارهای ایران است و برای دارایی‌های موتور، اقدام همان ستون جدول‌های بالاست.' })]));
    // why is symbol X not on the dashboard?
    var qIn = h('input', { class: 'f-in', type: 'search', placeholder: 'نماد یا نام، مثلاً پسهند یا طلای ۱۸', 'aria-label': 'جست‌وجوی نماد', value: S.whyQ || '' }), res = h('div', {});
    var look = function () { var t = (qIn.value || '').trim(); S.whyQ = t; res.innerHTML = ''; if (!t) return;
      var hit = K.items.filter(function (x) { return (x.sym + ' ' + (x.name || '')).indexOf(t) >= 0; }).slice(0, 5);
      if (!hit.length) { res.appendChild(h('p', { class: 'warn-t', text: '«' + t + '» در دادهٔ موتور نیست. علت‌های ممکن: نماد در فهرست نمادهای ابزار «سیگنال سهام» / «طلا و سکه» / «ارز» نیست، یا دادهٔ تاریخی آن دریافت نشده، یا کمتر از حداقل جلسه داده دارد. در ابزار مربوط نماد را اضافه و «به‌روزرسانی همه‌چیز» را اجرا کنید.' })); return; }
      hit.forEach(function (x) { var r = cen(x) || {}, rk = K.opp.indexOf(x), mkTop = K.opp.filter(function (y) { return y.cls === x.cls; }).indexOf(x), s = strOf(Q[x.key]), l = lvl(x);
        var where = mkTop >= 0 && mkTop < 10 ? 'در ۱۰ فرصت برتر ' + x.mk + ' (رتبهٔ ' + fa(mkTop + 1, 0) + ')' : rk >= 0 ? 'واجد شرایط ولی خارج از ۱۰ مورد اول ' + x.mk + ' (رتبهٔ ' + fa(mkTop + 1, 0) + ')' : (s.v >= 2 || r.st === 'cond' || r.st === 'review') && r.st !== 'nodata' ? 'در فهرست «در انتظار تأیید یا اصلاح قیمت» ' + x.mk : 'در فهرست فرصت‌ها نیست';
        res.appendChild(table(['مورد', 'مقدار'], [['دارایی', x.sym + ' · ' + x.mk + ' · قیمت ' + nd(x, x.last) + ' (' + x.date + ')'], ['جای آن در داشبورد', where], ['وضعیت مرکزی', (r.stFa || '—') + ' · ' + (r.enFa || '—') + ' — ' + (r.why || '')], ['اقدام', (r.actFa || '—') + (r.actWhy ? ' — ' + r.actWhy : '')],
          ['روند و مومنتوم', s.fa + ' · ' + momOf(Q[x.key])], ['قیمت و زمان', x.pt ? x.pt.phase + ' · ' + x.pt.tg.map(function (T, i) { return 'هدف ' + fa(i + 1, 0) + ' ' + nd(x, T.p) + (T.w && T.w.fromFa ? ' بین ' + T.w.fromFa + ' و ' + T.w.toFa : ''); }).join(' · ') + ' · ' + x.pt.tcFa : '—'], ['کف / سقف احتمالی', x.tz ? (x.tz.zone ? TE.tzText(x.tz, function (v) { return nd(x, v); }) + ' · ابطال ' + nd(x, x.tz.inv) : x.tz.why) : 'برآورد نشده (کمتر از ۲۶۰ جلسه داده)'], ['چرا فرصت نیست', x.elig ? 'واجد شرایط است' : (x.notWhy || []).join('؛ ') || '—'], ['سطوح', 'ورود ' + nd(x, l.entry[0]) + '–' + nd(x, l.entry[1]) + ' · حد ضرر ' + nd(x, l.stop) + ' · اهداف ' + (l.tp || []).map(function (v) { return nd(x, v); }).join(' / ')],
          ['بک‌تست', r.bt ? (r.bt.k || '') + ': ' + fa(r.bt.n, 0) + ' معامله · موفقیت ' + pct(r.bt.hit, 0) + ' · PF ' + fa(r.bt.pf, 2) : 'بک‌تست معتبری برای این افق نیست']])); }); };
    qIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') look(); }); var bQ = h('button', { class: 'btn btn-sm', type: 'button', text: 'چرا اینجاست یا نیست؟', onclick: look });
    out.s2.push(ctx.panel('جست‌وجو: هر نماد کجای داشبورد است و چرا', [h('div', { class: 'row-ctl' }, [qIn, bQ]), res, h('p', { class: 'small muted', text: 'پاسخ از همان رکورد مرکزی خوانده می‌شود که داشبورد، سیگنال‌ها، ابزار سهام و سبد از آن استفاده می‌کنند.' })]));
    if (S.whyQ) setTimeout(look, 0);
    return out;
  }
  function dashTab(ctx) {
    var S = ctx.S, E = ensure(S), X = ctx.R.X, P = X.prio || [], ps = [], db = E.val.db;
    var maxD = 0; X.list.forEach(function (z) { if (!z.a.sample) maxD = Math.max(maxD, z.R.X.d[z.R.X.n - 1]); });
    var top = P[0], head = !top ? 'داده‌ای نیست.' : top.kind === 'none' ? 'بهترین اقدام فعلی: اقدام نکردن (نگه‌داری نقد). ' + top.why : top.kind === 'urgent' ? 'اول: ' + top.action + ' ' + top.asset + ' — ' + top.why : 'بهترین اقدام فعلی: ' + top.action + ' ' + top.asset + ' (درجه ' + top.grade + '، ' + top.horizon + ').';
    var dcpRef = null;
    try { ps = ps.concat(deskPanels(ctx)); } catch (e) { ps.push(h('p', { class: 'warn-t', text: 'خطا در مرکز تصمیم: ' + e.message })); }
    try { var LGd = U.store.get(FLOG, {}) || {}, sn2 = {}, fl = FEEDIDS.map(feed).concat(SG.feeds).filter(function (f) { if (!f || sn2[f.id]) return false; sn2[f.id] = 1; return true; }), c2 = {};
      fl.forEach(function (f) { var k = groupState(f, LGd[f.id]); c2[k] = (c2[k] || 0) + 1; }); var RUN2 = U.store.get('hub.updrun.v1', null);
      var dcp = ctx.panel('وضعیت داده‌ها', [h('p', { class: 'small', 'data-notr': '1', text: Object.keys(c2).map(function (k) { return ST8D[k][0] + ': ' + fa(c2[k], 0); }).join(' · ') + (RUN2 ? ' · آخرین به‌روزرسانی کامل: ' + new Date(RUN2.doneAt).toLocaleString('fa-IR') : '') }),
        h('div', { class: 'row-ctl' }, [h('button', { class: 'btn primary', type: 'button', text: 'رفتن به مرکز به‌روزرسانی داده‌ها', onclick: function () { location.hash = '#data-center'; } })])]);
      ps.splice(ps.length ? 1 : 0, 0, dcp); dcpRef = dcp; } catch (e) { ps.push(h('p', { class: 'warn-t', text: 'خطا در وضعیت داده: ' + e.message })); }
    ps = ps.concat(decisionPanels(ctx));
    ps.push(h('details', { class: 'fold' }, [h('summary', { text: 'فهرست اقدامات (حفاظت از موقعیت‌ها، سیگنال‌ها، انتظار)' }), ctx.panel('فهرست اقدامات', [prioCards(P.slice(0, S.dashN || 5)), h('div', { class: 'wide-only' }, [prioTable(P.slice(0, 10))])])]));
    ps.push(ctx.panel('پیش‌بینی شاخص کل', [ixfBlock(X)]));
    ps = ps.concat(healthPanels(ctx));
    var act = P.filter(function (p) { return p.tier === 2 || p.tier === 3; }), W = X.widget();
    ps.push(ctx.panel('سیگنال‌های فعال و هشدارها', [act.length ? table(['دارایی', 'اقدام', 'درجه', 'آخرین', 'ورود', 'حد ضرر', 'اهداف'], act.map(function (p) { return [p.asset, p.action, p.grade, fa(p.last, 0), p.entry ? fa(p.entry[0], 0) + '–' + fa(p.entry[1], 0) : '—', fa(p.stop, 0), (p.tp || []).map(function (x) { return fa(x, 0); }).join(' / ')]; })) : h('p', { class: 'muted', text: 'سیگنال تأییدشدهٔ فعالی نیست.' }),
      W.alerts.length ? list(W.alerts.map(function (a) { return '⚠︎ ' + a; })) : h('p', { class: 'small muted', text: 'هشداری نیست (نزدیک شدن به محدودهٔ ورود یا حد ضرر).' })]));
    ps.push(ctx.panel('نبض بازار', [h('div', { class: 'pulse-grid' }, (X.pulse || []).map(function (q) {
      if (q.none) return h('div', { class: 'pulse-tile none' }, [h('div', { class: 'pt-n', text: q.name }), h('div', { class: 'pt-v', text: 'داده ندارد' })]);
      return h('div', { class: 'pulse-tile' + (q.stale ? ' stale' : '') }, [h('div', { class: 'pt-n', text: q.name }), h('div', { class: 'pt-v', 'data-notr': '1', text: fa(q.v, q.unit === 'دلار' ? 1 : q.unit === '٪' ? 2 : 0) }),
        h('div', { class: 'pt-c ' + (q.c1 >= 0 ? 'good-t' : 'neg'), 'data-notr': '1', text: 'روز ' + pct(q.c1, 1) + ' · ۲۰ روز ' + pct(q.c20, 1) }), h('div', { class: 'pt-x', 'data-notr': '1', text: 'کف/سقف ۲۰ روز: ' + fa(q.lo20, q.unit === 'دلار' ? 1 : q.unit === '٪' ? 2 : 0) + ' – ' + fa(q.hi20, q.unit === 'دلار' ? 1 : q.unit === '٪' ? 2 : 0) }),
        h('div', { class: 'pt-x', 'data-notr': '1', text: q.fc && q.fc.length ? 'احتمال بالاتر بودن: ' + q.fc.map(function (f) { return fa(f.h, 0) + ' روز ' + pct(f.p, 0) + (f.skill ? '' : ' (نرخ پایه)'); }).join(' · ') : 'پیش‌بینی: داده کافی نیست' }),
        q.lv ? h('div', { class: 'pt-x', 'data-notr': '1', text: (q.lv.tp ? 'حد سود ' + fa(q.lv.tp, 0) + ' · ' : '') + (q.lv.side === 'down' ? 'ابطال دید منفی ' : 'حد ضرر ') + fa(q.lv.stop, q.unit === 'دلار' ? 1 : q.unit === '٪' ? 2 : 0) + ' — ' + q.lv.act + (q.lv.grade ? ' (درجه ' + q.lv.grade + ')' : '') }) : null,
        h('div', { class: 'pt-d', text: TE.shamsi(q.date) + (q.stale ? ' — قدیمی' : '') })]); })),
      h('p', { class: 'small muted', text: '«نرخ پایه» یعنی مدل پیش‌بینی روی همین سری از حدس ساده بهتر نبوده و فقط سهم دوره‌های مثبت گذشته آمده است. حد سود و ضرر از کارت موتور برای همان دارایی است؛ اگر «تأییدنشده» نوشته شده، سطح طرح است نه سیگنال معاملاتی. قیمت‌ها پایانی روز از TSETMC و TGJU هستند، نه لحظه‌ای؛ تاریخ هر عدد زیر آن آمده و عدد بیش از ۴ روز «قدیمی» علامت می‌خورد. بیت‌کوین، نفت و نرخ بهره هنوز به موتور وصل نیستند.' })]));
    var DS = Hub.dataSync, c = DS ? DS.cfg() : {}, wtg = h('input', { type: 'checkbox', 'aria-label': 'انتشار فایل ویجت' }); wtg.checked = !!c.widget;
    wtg.addEventListener('change', function () { DS.setCfg({ widget: wtg.checked }); U.toast(wtg.checked ? 'از انتشار بعدی، فایل ویجت هم منتشر می‌شود.' : 'فایل ویجت دیگر منتشر نمی‌شود.', 'info'); });
    var dl = h('button', { class: 'btn', type: 'button', text: 'دریافت اسکریپت ویجت (HubWidget.js)', onclick: function () { var src = (root.HUB_WIDGET_SRC || ''); if (!src) { U.toast('اسکریپت در این نسخه نیست.', 'warn'); return; } var a = h('a', { href: URL.createObjectURL(new Blob([src], { type: 'text/javascript' })), download: 'HubWidget.js' }); document.body.appendChild(a); a.click(); a.remove(); } });
    var send = h('button', { class: 'btn primary', type: 'button', text: 'ارسال به ویجت (Scriptable)', onclick: function () {
      var j = X.widget(); j.priorities.forEach(function (p) { if (p.why && p.why.length > 140) p.why = p.why.slice(0, 140) + '…'; });
      var url = 'scriptable:///run/' + encodeURIComponent(S.wName || 'HubWidget') + '?clip=1'; /* data travels through the clipboard: a long link can arrive cut */ if (!j.asOf) { U.toast('دادهٔ واقعی نیست؛ اول داده را به‌روز کنید.', 'warn'); return; } var go2 = function () { location.href = url; }; if (!navigator.clipboard) { U.toast('کلیپ‌بورد در این مرورگر در دسترس نیست.', 'warn'); return; } navigator.clipboard.writeText(JSON.stringify(j)).then(function () { U.toast('داده کپی شد؛ Scriptable باز می‌شود. اگر باز نشد، خودتان Scriptable را باز کنید و اسکریپت HubWidget را یک بار اجرا کنید.', 'good'); setTimeout(go2, 400); }, function () { U.toast('کپی انجام نشد؛ دوباره بزنید.', 'warn'); }); } });
    var cp = h('button', { class: 'btn ghost', type: 'button', text: 'کپی اسکریپت', onclick: function () { if (navigator.clipboard && root.HUB_WIDGET_SRC) navigator.clipboard.writeText(root.HUB_WIDGET_SRC).then(function () { U.toast('کپی شد؛ در Scriptable یک اسکریپت تازه بسازید و بچسبانید.', 'good'); }); } });
    var nI = h('select', { class: 'f-sel', 'aria-label': 'تعداد اولویت‌ها' }, [3, 5, 8].map(function (k) { return h('option', { value: String(k), text: fa(k, 0) + ' اولویت' }); })); nI.value = String(S.dashN || 5); nI.addEventListener('change', function () { S.dashN = Number(nI.value); saveS(S); ctx.rerender(); });
    var tk = h('input', { class: 'f-in', type: 'password', autocomplete: 'off', 'aria-label': 'توکن GitHub', placeholder: c.token ? 'توکن ذخیره شده است (برای تغییر، توکن تازه بچسبانید)' : 'github_pat_…', style: 'min-width:220px' });
    tk.addEventListener('change', function () { var v = tk.value.trim(); if (v) { DS.setCfg({ token: v }); tk.value = ''; U.toast('توکن ذخیره شد (فقط در همین مرورگر).', 'good'); ctx.rerender(); } });
    var au = h('input', { type: 'checkbox', 'aria-label': 'انتشار خودکار ویجت' }); au.checked = !!c.widgetAuto; au.addEventListener('change', function () { DS.setCfg({ widgetAuto: au.checked }); ctx.rerender(); });
    var pubNow = h('button', { class: 'btn', type: 'button', text: 'انتشار دادهٔ ویجت همین حالا', disabled: !c.token, onclick: function () { pubNow.disabled = true; DS.publishWidget(X.widget()).then(function () { U.toast('منتشر شد؛ ویجت در تازه‌سازی بعدی آن را می‌خواند.', 'good'); ctx.rerender(); }, function (e) { U.toast('ناموفق: ' + e.message, 'crit'); pubNow.disabled = false; }); } });
    var lw = DS && DS.lastWidgetPub ? DS.lastWidgetPub() : null;
    ps.push(ctx.panel('به‌روزرسانی خودکار ویجت', [h('p', { class: 'f-help', text: 'ریشهٔ قدیمی ماندن ویجت: ویجت فقط وقتی داده تازه می‌گیرد که کسی آن را جایی منتشر کند؛ تا حالا این کار با دکمهٔ «ارسال به ویجت» (دستی) انجام می‌شد. راه خودکار: با یک توکن GitHub، هر «به‌روزرسانی همه‌چیز» فایل ویجت را در مخزن شما منتشر می‌کند و ویجت در هر تازه‌سازی آن را می‌خواند. iOS خودش زمان تازه‌سازی را تعیین می‌کند (معمولاً چند تا چند ده دقیقه)؛ لحظه‌ای و تضمین‌شده نیست.' }),
      h('p', { class: 'small muted', text: 'امنیت: توکن فقط در حافظهٔ همین مرورگر می‌ماند و فقط به api.github.com فرستاده می‌شود. توکن «fine-grained» بسازید که فقط به مخزن Signal و فقط Contents (خواندن و نوشتن) دسترسی دارد. فایل ویجت عمومی است (بدون موقعیت و سرمایهٔ شما).' }),
      h('div', { class: 'row-ctl' }, [tk]), h('label', { class: 'chk-l' }, [au, document.createTextNode(' انتشار خودکار پس از هر «به‌روزرسانی همه‌چیز»')]), h('div', { class: 'row-ctl' }, [pubNow]),
      h('p', { class: 'small ' + (lw ? 'good-t' : 'muted'), text: lw ? 'آخرین انتشار ویجت: ' + new Date(lw.at).toLocaleString('fa-IR') : 'هنوز منتشر نشده است.' })]));
    ps.push(ctx.panel('ویجت صفحهٔ اصلی گوشی', [
      h('p', { class: 'f-help', text: 'وب‌اپ (PWA) در iOS نمی‌تواند ویجت صفحهٔ اصلی بسازد؛ ویجت واقعی iOS فقط از یک اپ بومی می‌آید. راه عملی بدون ساخت اپ: اپ رایگان Scriptable که ویجت واقعی صفحهٔ اصلی می‌سازد. این اسکریپت فایل data/widget.json را از سایت خود هاب می‌خواند؛ همان خروجی همین داشبورد که کامپیوتر هنگام انتشار داده می‌سازد.' }),
      h('ol', { class: 'studio-l' }, ['در کامپیوتر: «انتشار فایل ویجت» را روشن کنید و داده را منتشر کنید (زبانهٔ همگام‌سازی). فایل ویجت عمومی است: فقط اولویت‌ها و سیگنال‌های بازار، بدون موقعیت‌ها و سرمایهٔ شما.', 'در آیفون: Scriptable را از App Store نصب کنید، اسکریپت تازه بسازید و متن اسکریپت را بچسبانید (دکمهٔ کپی یا فایل).', 'روی صفحهٔ اصلی ویجت Scriptable (کوچک، متوسط یا بزرگ) اضافه کنید؛ در Edit Widget اسکریپت را انتخاب کنید و در Parameter یکی از priorities، signals یا pulse را بنویسید (سه ویجت جدا).', 'لمس ویجت داشبورد هاب را باز می‌کند. iOS خودش زمان تازه‌سازی را تعیین می‌کند (معمولاً هر چند ده دقیقه). اگر اینترنت نباشد، آخرین دادهٔ معتبر با برچسب «آفلاین» و زمان آن نشان داده می‌شود.'].map(function (t) { return h('li', { text: t }); })),
      h('div', { class: 'row-ctl' }, [send]), h('p', { class: 'small muted', text: 'روی آیفون: این دکمه اسکریپت HubWidget را در Scriptable باز می‌کند و دادهٔ امروز را به آن می‌دهد؛ ویجت در تازه‌سازی بعدی آن را نشان می‌دهد. نام اسکریپت در Scriptable باید دقیقاً HubWidget باشد (اسکریپت تازه «Untitled Script» نام دارد؛ تغییرش دهید). داده هم‌زمان کپی می‌شود؛ اگر Scriptable باز نشد، خودتان آن را باز کنید و اسکریپت را یک بار اجرا کنید. هر بار داده را به‌روز کردید دوباره بزنید (یا انتشار از کامپیوتر را راه بیندازید تا خودکار شود).' }), h('div', { class: 'row-ctl' }, [h('label', { class: 'chk-l' }, [wtg, document.createTextNode(' انتشار فایل ویجت همراه داده (فقط روی کامپیوتر)')]), dl, cp, nI]),
      h('p', { class: 'small muted', text: 'اعلان: اسکریپت وقتی هشدار تازه‌ای (ورود به محدودهٔ خرید، نزدیکی به حد ضرر) ببیند، اعلان محلی گوشی می‌فرستد. اعلان Push واقعی وب به یک سرور ارسال‌کننده نیاز دارد که این پروژه ندارد. هر اعلان فقط به اندازهٔ تازگی فایل ویجت به‌روز است (یعنی به آخرین انتشار از کامپیوتر بستگی دارد).' }),
      h('details', null, [h('summary', { text: 'پیش‌نمایش داده‌ای که ویجت می‌بیند (JSON)' }), h('pre', { class: 'small', style: 'white-space:pre-wrap;overflow-wrap:anywhere', 'data-notr': '1', text: JSON.stringify(W, null, 1) })])]));
    // three sections (directive: decision-centric dashboard): 1 overview · 2 opportunities and actions · 3 everything else, folded
    var B0 = null; try { B0 = decisionBoard(ctx); } catch (e) { B0 = { s1: [h('p', { class: 'warn-t', text: 'خطا در داشبورد تصمیم: ' + e.message })], s2: [] }; }
    if (B0) { var rest0 = ps.filter(function (p) { return p !== dcpRef; });
      ps = (dcpRef ? [dcpRef] : []).concat([h('h2', { class: 'dash-sec', text: '۱. وضعیت کلی بازار' })], B0.s1, [h('h2', { class: 'dash-sec', text: '۲. فرصت‌ها و اقدام‌ها' })], B0.s2,
        [h('h2', { class: 'dash-sec', text: '۳. تحلیل تکمیلی و جزئیات' }), h('details', { class: 'fold', open: S.detOpen ? true : null, ontoggle: function (e) { S.detOpen = e.target.open; } }, [h('summary', { text: 'نمایش پنل‌های تکمیلی: موتور مرکزی و کنترل سازگاری، وضعیت سیگنال‌ها، شاخص‌ها، رتبه‌بندی سهام، اعتبارسنجی، بک‌تست، دقت گذشته، سناریوها، پایش، ریسک، ویجت (' + fa(rest0.length, 0) + ' پنل)' })].concat(rest0))]); }
    return ctx.group(ps);
  }
  function mkTab(ctx) {
    var S = ctx.S, E = ensure(S), X = ctx.R.X, db = E.val.db, MK = X.markets, ps = [];
    var rk = MK.rows.map(function (m) { if (m.x) { var bo = m.best && m.best.o; return ['بین‌بازاری طلا (XG1)', fa(m.assets, 0), fa(m.A, 0), fa(m.B, 0), fa(m.gated, 0), 'آزمون جدا برای هر طلا', bo ? bo.name + ' (درجه ' + bo.grade + ')' : '—']; } var b = m.best && m.best.c; return [CLS[m.cls] || m.cls, fa(m.assets, 0), fa(m.A, 0), fa(m.B, 0), fa(m.gated, 0), m.pool ? fa(m.pool.n, 0) + ' · ' + (m.pool.oosN ? fa(m.pool.oosAvgR, 2) + 'R' : '—') : 'بدون اعتبارسنجی', b ? b.sym + ' (درجه ' + b.val.grade + '، اطمینان ' + fa(b.conf, 0) + '٪)' : '—']; });
    ps.push(ctx.panel('موتور مرکزی: امروز کدام بازار فرصت تأییدشده دارد؟', [
      MK.xtop && MK.xtop.length ? h('p', { class: 'f-help', text: 'بین‌بازاری طلا (XG1): ' + MK.xtop.map(function (o) { return 'خرید ' + o.name + ' — درجه ' + o.grade + '، آخرین ' + fa(o.now.last, 0) + '، هدف ' + fa(o.now.target, 0) + '، حد ضرر ' + fa(o.now.stop, 0); }).join(' · ') }) : null,
      MK.none || !MK.top.length ? (MK.none ? h('p', { class: 'neg', text: 'عدم صدور سیگنال: در هیچ‌یک از بازارهای تحت پوشش موتور فرصت با درجهٔ A یا B نیست' + (X.valState === 'ok' ? '.' : ' (اعتبارسنجی معتبر و به‌روز نیست؛ ابتدا در زبانهٔ «سیگنال‌ها» اجرا کنید).') }) : null) :
        table(['#', 'نماد', 'بازار', 'سیگنال', 'درجه', 'اطمینان', 'R:R تا هدف ۲', 'ورود', 'حد ضرر'], MK.top.map(function (c, i) { return [fa(i + 1, 0), c.sym, CLS[c.cls] || c.cls, c.typeFa, c.val.grade, fa(c.conf, 0) + '٪', '۱:' + fa(c.rr2, 1), px(c.lo, c) + '–' + px(c.hi, c), px(c.stop, c)]; })),
      h('h4', { text: 'رتبهٔ بازارها (امتیاز = ۲×سیگنال A + ۱×سیگنال B؛ تساوی با امید ریاضی خارج از نمونهٔ بازار)' }),
      table(['بازار', 'دارایی', 'سیگنال A', 'سیگنال B', 'مسدود (C/D)', 'شواهد بازار: معامله · امید ریاضی خارج از نمونه', 'بهترین'], rk),
      h('p', { class: 'f-help', text: 'رتبه‌بندی فقط میان بازارهایی است که موتور پوشش می‌دهد (جدول پایین). نبودن فرصت در بازارهای بدون پوشش (رمزارز، کالا، اوراق…) به معنای نبودن فرصت در آن‌ها نیست؛ یعنی بررسی نشده‌اند.' })]));
    var arch = [['موتور بازار: سهام و صندوق', 'فعال', 'رأی ۲۳ مدل، رژیم، بک‌تست، درجه‌بندی'], ['موتور بازار: طلا / ارز', 'فعال (سری روزانهٔ TGJU)', 'همان هستهٔ تکنیکال؛ متغیرهای بنیادی مخصوص طلا/ارز نیست'], ['موتور بازار: اختیار معامله', 'فعال بدون اعتبارسنجی', 'قیمت‌گذاری و نقدشوندگی؛ تاریخچه ندارد'],
      ['موتورهای بازار: رمزارز، کالا، اوراق، آتی، فارکس، سهام جهانی', 'ساخته نشده', 'نیاز به داده‌ی تاریخی معتبر و منطق اختصاصی هر بازار'], ['موتور کلان', 'فعال (ورود دستی سری)', 'ارزیابی پیش‌بینی با خطای خارج از نمونه؛ پایین همین صفحه'],
      ['موتور مرکزی', 'جزئی', 'رتبه‌بندی بازارها بر پایهٔ سیگنال‌های تأییدشده؛ جفت‌ها و نسبت‌ها در امتیاز «مقطعی» هستند. نخستین راهبرد بین‌بازاری با آزمون مستقل: طلای داخلی در برابر جهانی (XG1)؛ بقیهٔ واگرایی‌ها (نفت و سهام انرژی، شکست همبستگی) هنوز نه']];
    ps.push(xgPanel(ctx));
    ps.push(ctx.panel('معماری چندموتوره', [table(['موتور', 'وضعیت', 'توضیح'], arch)]));
    var cov = TE.MARKETS.map(function (m) { var n = 0; X.list.forEach(function (z) { if (m.cls.indexOf(z.a.cls) > -1) n++; }); if (m.id === 'option') n = X.cards.filter(function (c) { return c.cls === 'option'; }).length;
      var v = m.cls.some(function (c) { return db && db.pools && db.pools['c:' + c] && db.pools['c:' + c].n >= 15; }); return [m.fa, m.cls.length ? fa(n, 0) : '۰', m.data, m.bt, m.cls.length ? (v ? 'اعتبارسنجی‌شده' : 'تأییدنشده — اعتبارسنجی اجرا نشده یا نمونه کم') : 'تأییدنشده — پوشش ندارد']; });
    ps.push(ctx.panel('پوشش بازارها و وضعیت اعتبارسنجی', [h('p', { class: 'f-help', text: 'هر بازاری که داده یا اعتبارسنجی مستقل ندارد «تأییدنشده» می‌ماند و در رتبه‌بندی نمی‌آید. گسترش پوشش باید تدریجی و بر پایهٔ داده‌ی واقعی باشد؛ داده‌ی این بازارها را باید به ابزار وصل کرد (نیازمند منبع معتبر و کلید).' }), table(['بازار', 'دارایی در موتور', 'داده', 'روش اعتبارسنجی', 'وضعیت'], cov)]));
    if (db) { var keys = Object.keys(db.pools).filter(function (k) { return k.indexOf('h:') === 0 || /^c:[a-z]+#/.test(k); }).sort();
      ps.push(ctx.panel('بانک اعتبارسنجی به تفکیک بازار، افق و رژیم', [h('p', { class: 'f-help', text: 'افق بر پایهٔ مدت نگه‌داری واقعی معامله‌های شبیه‌سازی‌شده است. تفکیک بازار × رژیم در زبانهٔ «بک‌تست» آمده است.' }),
        table(['بازار · افق', 'معامله', 'نرخ برد', 'ضریب سود', 'امید ریاضی', 'خارج از نمونه'], keys.map(function (k) { var p = db.pools[k], o = p.oos || {}, a = k.replace(/^c:/, '').split('#'), hz = a[a.length - 1].replace(/^h:/, ''); return [(a.length > 1 ? (CLS[a[0]] || a[0]) + ' · ' : 'همه · ') + (HZFA[hz] || hz), fa(p.n, 0), pct(p.hit, 0), isFinite(p.pf) ? fa(p.pf, 2) : '—', fa(p.avgR, 2) + 'R', o.n ? fa(o.n, 0) + ' · ' + fa(o.avgR, 2) + 'R' : '—']; }))])); }
    ps.push(macroPanel(ctx));
    return ctx.group(ps);
  }

  function filtered(S, X) {
    var f = S.f; return X.cards.filter(function (c) { if (f.cls !== 'all' && (f.cls === 'stock' ? c.cls !== 'stock' && c.cls !== 'fund' : c.cls !== f.cls)) return false;
      if (f.type === 'act') return c.type !== 'hold'; if (f.type === 'long') return c.type === 'long'; if (f.type === 'strong') return c.type === 'long' && c.strength === 'قوی'; return true; });
  }
  function optPanel(ctx, X, S) {
    if (S.f.cls !== 'all' && S.f.cls !== 'option') return null;
    var oc = X.cards.filter(function (c) { return c.cls === 'option' && c.ticket; }), g = function (c, k) { var r = c.ticket.filter(function (x) { return x[0] === k; })[0]; return r ? r[1] : '—'; };
    if (!oc.length && !(X.optSkip || []).length) return null;
    return ctx.panel('اختیار معامله — دستور خرید و فروش (فقط قراردادهای قابل معامله)', [h('p', { class: 'f-help', text: 'فقط قراردادهایی آمده‌اند که هم الان می‌شود خرید و هم بعداً فروخت: هر دو طرف تابلو (خریدار و فروشنده) فعال، فاصلهٔ قیمت خرید و فروش حداکثر ۱۰٪ و حجم یا موقعیت باز کافی (درجهٔ A یا B). تعداد قرارداد به ۲۰٪ حجم روزانه و ۱۰٪ موقعیت‌های باز محدود شده تا خروج ممکن باشد. آستانه‌ها در «تنظیمات» ابزار سیگنال اختیار قابل تغییرند.' }),
      oc.length ? table(['قرارداد', 'اقدام', 'زمان', 'قیمت سفارش', 'حد ضرر', 'اهداف فروش', 'آخرین مهلت فروش', 'سربه‌سر در سررسید', 'نقدشوندگی'], oc.map(function (c) { return [c.sym + ' — ' + c.name, g(c, 'اقدام'), g(c, 'زمان خرید') !== '—' ? g(c, 'زمان خرید') : g(c, 'زمان'), g(c, 'قیمت سفارش'), g(c, 'حد ضرر'), g(c, 'اهداف فروش') !== '—' ? g(c, 'اهداف فروش') : g(c, 'بازخرید و خروج'), g(c, 'آخرین مهلت فروش'), g(c, 'نقطهٔ سربه‌سر در سررسید'), g(c, 'نقدشوندگی')]; })) : h('p', { class: 'muted', text: 'هیچ قراردادی با سیگنال، شرط نقدشوندگی را ندارد.' }),
      (X.optSkip || []).length ? h('details', null, [h('summary', { text: 'قراردادهای با امتیاز بالا که به‌خاطر نقدشوندگی کنار گذاشته شدند (' + fa(X.optSkip.length, 0) + ')' }), table(['قرارداد', 'پایه', 'نوع', 'قیمت اعمال', 'سررسید', 'دلیل'], X.optSkip.map(function (x) { return [x.sym, x.und, x.type === 'Call' ? 'اختیار خرید' : 'اختیار فروش', fa(x.strike, 0), x.expiry, x.why]; }))]) : null]);
  }
  /* ---------- signals tab: answer first, then confirmed buys, exits, unconfirmed, options, everything ---------- */
  function lineOf(c) { return c.type === 'hold' && !c.candidate ? '' : 'ورود ' + px(c.lo, c) + '–' + px(c.hi, c) + ' · حد ضرر ' + px(c.stop, c) + ' · هدف ' + px(c.tp2, c) + ' · R:R ۱:' + fa(c.rr2, 1) + (c.type === 'long' ? ' · حجم ' + pct(c.posPct, 1) : ''); }
  function miniCard(c, kind) {
    var g = c.val ? chip('درجه ' + c.val.grade, GCHIP[c.val.grade]) : null, act = kind === 'cand' ? chip('تأییدنشده', 'sev-info') : chip(c.typeFa, TYPEC[c.type]);
    var sum = h('summary', null, [h('div', { class: 'mini-l1' }, [h('strong', { 'data-notr': '1', text: c.sym }), act, g, h('span', { class: 'mini-conf', 'data-notr': '1', text: 'اطمینان ' + fa(c.conf, 0) + '٪' })]),
      h('div', { class: 'mini-l2', 'data-notr': '1', text: kind === 'cand' ? (c.candidate.typeFa + ' · ' + (c.val && c.val.reasons[0] ? 'مانع اصلی: ' + c.val.reasons[0] : '')) : lineOf(c) })]);
    return h('details', { class: 'sig-mini t-' + (kind === 'cand' ? 'hold' : c.type) }, [sum, h('div', { class: 'mini-body' }, [sigCard(c)])]);
  }
  // why are the candidates of one market blocked? group them by their evidence pool (they share the same back-test numbers)
  function whyBlocked(X, clsList) {
    var cand = X.cards.filter(function (c) { return c.candidate && clsList.indexOf(c.cls) > -1; }), P = {};
    cand.forEach(function (c) { var v = c.val, k = v.pool || 'none'; var o = P[k] = P[k] || { k: k, n: 0, v: v, c: c, caps: {} }; o.n++; v.caps.forEach(function (x) { o.caps[x] = (o.caps[x] || 0) + 1; }); });
    return { n: cand.length, pools: Object.keys(P).map(function (k) { return P[k]; }).sort(function (a, b) { return b.n - a.n; }) };
  }
  function ixfBlock(X) {
    var F = X.ixf; if (!F || !F.H) return h('p', { class: 'f-help', text: 'پیش‌بینی شاخص: تاریخچهٔ شاخص کل در داده‌ها نیست. از «مرکز دادهٔ بازار» سهام را به‌روز کنید.' });
    var ok = F.H.filter(function (o) { return o.ok; }), sk = ok.filter(function (o) { return o.skill; }), out = [];
    out.push(h('h4', { text: 'پیش‌بینی شاخص کل (نه توصیف گذشته)' }));
    if (!ok.length) { out.push(h('p', { class: 'neg', text: F.H[0].note || 'داده کافی نیست.' })); return h('div', { class: 'why-box' }, out); }
    out.push(h('p', { class: 'today-sub', text: sk.length ? sk.map(function (o) { return 'تا ' + fa(o.h, 0) + ' جلسهٔ بعد: احتمال بالاتر بودن شاخص ' + pct(o.p, 0) + ' (مدل در آزمون خارج از نمونه از نرخ پایه دقیق‌تر بود)'; }).join(' · ')
      : 'مدل پیش‌بینی روی تاریخچهٔ شاخص شما از «نرخ پایه» دقیق‌تر نبود؛ پس پیش‌بینی جهت با مهارت اثبات‌شده ندارم. بهترین برآورد موجود نرخ پایه است: ' + ok.map(function (o) { return fa(o.h, 0) + ' جلسه: ' + pct(o.pBase, 0) + ' احتمال مثبت'; }).join('، ') + '.' }));
    out.push(table(['افق', 'احتمال بالاتر بودن', 'نرخ پایه', 'مدل بهتر از نرخ پایه؟', 'بازدهٔ تاریخی همین افق (۱۰٪ · میانه · ۹۰٪)'], F.H.map(function (o) {
      if (!o.ok) return [fa(o.h, 0) + ' جلسه', '—', '—', o.note, '—'];
      return [fa(o.h, 0) + ' جلسه', pct(o.p, 0) + (o.skill ? '' : ' (نرخ پایه)'), pct(o.pBase, 0), o.skill ? 'بله — مهارت ' + pct(o.bss, 1) + '، DM ' + fa(o.dm, 1) : 'خیر — مهارت ' + (isFinite(o.bss) ? pct(o.bss, 1) : '—') + '، DM ' + (isFinite(o.dm) ? fa(o.dm, 1) : '—') + (o.nEff < 20 ? '، دوره‌های مستقل ' + fa(o.nEff, 0) + ' (کمتر از ۲۰)' : ''), pct(o.q[0], 1) + ' · ' + pct(o.q[1], 1) + ' · ' + pct(o.q[2], 1)]; })));
    out.push(h('p', { class: 'small muted', text: 'روش: رگرسیون لجستیک روی بازده ۵، ۲۰ و ۶۰ روزه، فاصله از میانگین ۵۰ روزه، نوسان ۲۰ روزه و فاصله از سقف ۱۲۰ روزه؛ آزمون پیش‌رونده با داده تا همان روز. «مهارت» = کاهش خطای براییر نسبت به نرخ پایه؛ پذیرش فقط با DM ≥ ۲ و دست‌کم ۲۰ دورهٔ مستقل. داده: ' + TE.shamsi(F.from) + ' تا ' + TE.shamsi(F.to) + ' (' + fa(F.n, 0) + ' روز). احتمال، تضمین نیست؛ و پیش‌بینی شاخص کل دربارهٔ تک‌سهم‌ها نیست.' }));
    return h('div', { class: 'why-box' }, out);
  }
  function todayPanel(ctx, X, E) {
    var conf = X.cards.filter(function (c) { return (c.type === 'long' || c.type === 'short') && c.cls !== 'option'; }), xg = (X.markets && X.markets.xtop) || [], st = X.valState, body = [];
    var bySt = conf.filter(function (c) { return c.cls === 'stock' || c.cls === 'fund'; });
    var VR = ctx.S && ctx.S.valRun, engV = ' (موتور ' + TE.ENG_VER + ')', vrNote = st === 'none' && VR ? (VR.st === 'running' ? 'اعتبارسنجی قبلی (' + new Date(VR.at).toLocaleTimeString('fa-IR') + ') ' + (({ prep: 'در مرحلهٔ تحلیل نمادها', cross: 'در مرحلهٔ مدل‌های بین‌نمادی', bt: 'در بک‌تست', db: 'در ثبت نتایج' })[VR.ph] || 'پیش از شروع') + (VR.n ? ' (' + fa(VR.i, 0) + ' از ' + fa(VR.n, 0) + ')' : '') + (VR.lite ? ' — حتی در حالت سبک' : '') + ' نیمه‌کاره ماند؛ احتمالاً مرورگر گوشی صفحه را به‌خاطر کمبود حافظه دوباره بارگذاری کرده است. اجرای بعدی خودکار در «حالت سبک» انجام می‌شود (مدل‌ها روی ۷۶۰ جلسهٔ آخر؛ حافظهٔ کمتر). «اجرای اعتبارسنجی» را بزنید و تا پایان شمارش صبر کنید؛ اگر باز تکرار شد، همین پیام را بفرستید.' : VR.st === 'err' ? 'آخرین اعتبارسنجی با خطا متوقف شد: ' + VR.msg : VR.st === 'nodata' ? 'آخرین اعتبارسنجی اجرا شد اما نتیجه‌ای ثبت نشد: ' + VR.msg : '') : '';
    var head = st !== 'ok' ? (st === 'none' ? 'هنوز اعتبارسنجی اجرا نشده؛ تا آن زمان هیچ خریدی تأییدشده نیست.' + (vrNote ? ' ' + vrNote : '') + engV : st === 'stale' ? 'تنظیمات بعد از آخرین اعتبارسنجی عوض شده؛ دوباره اعتبارسنجی کنید.' : 'اعتبارسنجی روی دادهٔ نمونه است و اعتبار ندارد.')
      : conf.length || xg.length ? 'امروز ' + fa(conf.length + xg.length, 0) + ' خرید تأییدشده: ' + conf.slice(0, 6).map(function (c) { return c.sym + ' (' + c.val.grade + ')'; }).concat(xg.map(function (o) { return o.name + ' (' + o.grade + ')'; })).join('، ') + (conf.length > 6 ? ' و…' : '') + '.'
      : 'امروز هیچ خرید تأییدشده‌ای نیست (عدم صدور سیگنال).';
    body.push(h('p', { class: 'today-head', text: head }));
    body.push(ixfBlock(X));
    if (X.market) body.push(h('p', { class: 'f-help', text: 'رژیم شاخص کل: ' + (TE.REG[X.market.rg] || X.market.rg) + '. ' + (X.market.rg === 'up' ? 'رژیم صعودی یعنی جهت کلی بازار مثبت است، نه اینکه خرید هر سهمی تأیید شده باشد؛ ' : '') + 'تأیید فقط وقتی است که همین منطق در گذشته روی همین نوع دارایی، پس از هزینه، سود پایدار داده باشد.' }));
    if (st === 'ok' && !bySt.length) {
      var W = whyBlocked(X, ['stock', 'fund']);
      if (W.n) {
        body.push(h('h4', { text: 'چرا سهام و صندوق خرید تأییدشده ندارد؟ (' + fa(W.n, 0) + ' الگوی خرید دیده شد)' }));
        W.pools.slice(0, 3).forEach(function (o) {
          var v = o.v, ev = v.ev, oo = ev && ev.oos || {}, c = o.c;
          var lines = ev ? ['شواهد: ' + valPoolFa(v, c) + ' — ' + fa(ev.n, 0) + ' معاملهٔ شبیه‌سازی‌شده، نرخ برد ' + pct(ev.hit, 0) + '، امید ریاضی ' + fa(ev.avgR, 2) + 'R، خارج از نمونه ' + (oo.n ? fa(oo.n, 0) + ' معامله با ' + fa(oo.avgR, 2) + 'R' : 'ندارد') + '.'] : [];
          body.push(h('div', { class: 'why-box' }, [h('p', { text: fa(o.n, 0) + ' سیگنال، درجه ' + v.grade + ' (' + v.fa + ')' }), list(lines.concat(v.reasons.map(function (r) { return 'شرط برآورده‌نشده: ' + r; }))),
            Object.keys(o.caps).length ? h('p', { class: 'small muted', text: 'محدودیت‌های تک‌سیگنال: ' + Object.keys(o.caps).map(function (k) { return k + ' (' + fa(o.caps[k], 0) + ')'; }).join('؛ ') }) : null]));
        });
        body.push(h('p', { class: 'f-help', text: 'این تصمیم شماست: سخت‌گیری را می‌توانید در «تنظیمات اعتبارسنجی» پایین همین صفحه تغییر دهید (مثلاً آزمون فشار هزینه، یا حالت «فقط هشدار»). پایین آوردن آستانه شواهد را قوی‌تر نمی‌کند؛ فقط سیگنال بیشتری نشان می‌دهد.' }));
      }
    }
    var vb = h('button', { class: st === 'ok' ? 'btn' : 'btn primary', type: 'button', text: st === 'ok' ? 'اعتبارسنجی دوباره (پس از به‌روزرسانی داده)' : 'اجرای اعتبارسنجی', onclick: function () { runVal(ctx, vb); } });
    var VR2 = ctx.S && ctx.S.valRun, fullB = VR2 && VR2.lite && VR2.st === 'ok' ? h('button', { class: 'btn', type: 'button', text: 'تلاش برای اعتبارسنجی کامل (۱٬۲۵۰ جلسه)', onclick: function () { VR2.lite = false; runVal(ctx, fullB); } }) : null;
    if (VR2 && VR2.lite && VR2.st === 'ok') body.push(h('p', { class: 'small muted', text: 'آخرین اعتبارسنجی در حالت سبک انجام شد: مدل‌ها روی ۷۶۰ جلسهٔ آخر آزموده شده‌اند و افق بلندمدت داده ندارد.' }));
    body.push(h('div', { class: 'row-ctl' }, [vb, fullB]));
    return ctx.panel('امروز در یک نگاه', body);
  }
  function sigTab(ctx) {
    var S = ctx.S, E = ensure(S), X = ctx.R.X, ps = [];
    if (X.sample) ps.push(h('p', { class: 'neg', text: 'بخشی از داده‌ها نمونه (ساختگی) است؛ سیگنال‌های آن‌ها «غیرقابل اجرا» هستند. از «مرکز دادهٔ بازار» داده را به‌روز کنید.' }));
    ps.push(todayPanel(ctx, X, E));
    var conf = X.cards.filter(function (c) { return (c.type === 'long' || c.type === 'short') && c.cls !== 'option'; }).sort(function (a, b) { var ra = a.central && a.central.rank || 1e9, rb = b.central && b.central.rank || 1e9; return ra - rb; });   // one order: the central rank (directive 22 · 9)
    ps.push(ctx.panel('خریدهای تأییدشده (' + fa(conf.length, 0) + ')', conf.length ? [h('p', { class: 'small muted', text: 'روی هر ردیف بزنید تا جزئیات، شواهد بک‌تست و شرایط ابطال باز شود.' })].concat(conf.map(function (c) { return miniCard(c, 'conf'); })) : [h('p', { class: 'muted', text: 'خرید تأییدشده‌ای نیست.' })]));
    var exits = X.cards.filter(function (c) { return c.type === 'close' && c.cls !== 'option'; }), held = {}; (E.positions || []).forEach(function (p) { held[p.asset] = 1; });
    var mine = exits.filter(function (c) { return held[c.sym] || held[c.name]; });
    ps.push(ctx.panel('فروش / بستن — فقط اگر این دارایی را دارید (' + fa(exits.length, 0) + ')', [mine.length ? h('p', { class: 'neg', text: 'از موقعیت‌های ثبت‌شدهٔ شما: ' + mine.map(function (c) { return c.sym; }).join('، ') }) : h('p', { class: 'small muted', text: 'اگر موقعیت‌هایتان را در «پایش موقعیت‌ها» ثبت کنید، این‌جا فقط همان‌ها برجسته می‌شوند. فروش استقراضی در بورس ایران نیست؛ این سیگنال یعنی «اگر دارید، بفروشید؛ اگر ندارید، نخرید».' }),
      h('details', null, [h('summary', { text: 'نمایش همه' })].concat(exits.slice(0, 60).map(function (c) { return miniCard(c, 'exit'); })))]));
    var cand = X.cards.filter(function (c) { return c.candidate; }).sort(function (a, b) { return b.conf - a.conf; });
    ps.push(ctx.panel('الگوهای خرید تأییدنشده (' + fa(cand.length, 0) + ') — سیگنال معاملاتی نیستند', [h('details', null, [h('summary', { text: 'نمایش ' + fa(Math.min(30, cand.length), 0) + ' مورد با بیشترین اطمینان' })].concat(cand.slice(0, 30).map(function (c) { return miniCard(c, 'cand'); })))]));
    var op = optPanel(ctx, X, S); if (op) ps.push(h('details', { class: 'fold' }, [h('summary', { text: 'اختیار معامله — دستورهای خرید و فروش' }), op]));
    var ff = G.form({ id: 'te-f', onChange: ctx.rerender, fields: [
      { key: 'ty', label: 'نمایش', options: [['act', 'فقط اقدام'], ['long', 'فقط خرید'], ['strong', 'فقط خرید قوی'], ['all', 'همه']], get: function () { return S.f.type; }, set: function (v) { S.f.type = v; } },
      { key: 'cl', label: 'نوع دارایی', options: [['all', 'همه'], ['stock', 'سهام و صندوق'], ['gold', 'طلا و سکه'], ['fx', 'ارز'], ['option', 'اختیار معامله']], get: function () { return S.f.cls; }, set: function (v) { S.f.cls = v; } }] });
    var L = filtered(S, X), top = L.slice(0, S.f.n || 30);
    var sum = table(['نماد', 'نوع', 'درجه', 'اطمینان', 'ورود', 'حد ضرر', 'هدف ۲', 'R:R', 'وضعیت'], L.map(function (c) { var hd = c.type === 'hold'; return [c.sym, chip(c.typeFa, TYPEC[c.type]), c.val ? c.val.grade : '—', fa(c.conf, 0) + '٪', hd ? '—' : px(c.lo, c) + '–' + px(c.hi, c), hd ? '—' : px(c.stop, c), hd ? '—' : px(c.tp2, c), hd ? '—' : '۱:' + fa(c.rr2, 1), c.status]; }));
    ps.push(h('details', { class: 'fold' }, [h('summary', { text: 'همهٔ سیگنال‌ها با فیلتر و جزئیات کامل' }), ctx.panel('همهٔ سیگنال‌ها', [h('p', { class: 'f-help', text: '«قوی» = اطمینان ≥ ' + fa(E.strongConf, 0) + '٪ و هم‌سویی دست‌کم سه خانوادهٔ مدل؛ «متوسط» = اطمینان ≥ ' + fa(E.minConf, 0) + '٪.' }), ff, sum].concat(top.map(sigCard)))]));
    ps.push(h('details', { class: 'fold' }, [h('summary', { text: 'تنظیمات اعتبارسنجی و حالت اجرا' }), valStatePanel(ctx, X), modeBanner(E, 'sig')]));
    return ctx.group(ps);
  }

  /* ---------- 3 · portfolio ---------- */
  /* ---------- mode: what each one does, and its output ---------- */
  var ORDER = ['signal', 'portfolio', 'monitor', 'full'];
  function modePanel(ctx) {
    var E = ensure(ctx.S), M = TE.MODES;
    var rows = ORDER.map(function (k) {
      var rb = h('input', { type: 'radio', name: 'te-mode', value: k, 'aria-label': M[k].fa }); rb.checked = E.mode === k;
      rb.addEventListener('change', function () { E.mode = k; ctx.rerender(); });
      return { attrs: { class: E.mode === k ? 'mode-on' : '' }, cells: [h('label', { class: 'chk-l' }, [rb, document.createTextNode(' ' + M[k].fa)]), M[k].does, M[k].out, M[k].where, M[k].fit] };
    });
    var go = h('button', { class: 'btn primary', type: 'button', text: 'نمایش خروجی حالت «' + M[E.mode].fa + '»', onclick: function () { var t = document.querySelector('#view > .tool > nav.tabs [data-tab="plan"]'); if (t) t.click(); } });
    return ctx.panel('۱. حالت عملکرد را انتخاب کنید', [h('p', { class: 'f-help', text: 'حالت تعیین می‌کند موتور چه چیزی را به چه ترتیبی برای شما آماده کند. خروجی هر حالت در زبانهٔ «خروجی حالت انتخابی» نمایش داده می‌شود؛ زبانه‌های دیگر جزئیات همان خروجی‌اند.' }),
      table(['حالت', 'چه می‌کند', 'خروجی', 'کجا ببینید', 'مناسب برای'], rows, 'mode-t'), h('div', { class: 'row-ctl' }, [go])]);
  }
  function modeBanner(E, tab) {
    var M = TE.MODES[E.mode] || TE.MODES.full, note = {
      sig: { signal: 'این زبانه خروجی اصلی حالت فعلی است.', portfolio: 'در حالت ساخت سبد، همهٔ سیگنال‌ها اینجا هستند اما فقط آن‌هایی که از قیود سبد عبور کنند در «ساخت سبد» می‌آیند.', monitor: 'در حالت پایش، خرید جدید پیشنهاد نمی‌شود؛ این زبانه فقط برای اطلاع است.', full: 'در حالت سیستماتیک کامل، اجرای این سیگنال‌ها از طریق «خروجی حالت انتخابی» و با ظرفیت باقی‌ماندهٔ سبد است.' },
      pf: { signal: 'در حالت «فقط سیگنال» سبد برای اطلاع ساخته می‌شود و حجم هر سیگنال مستقل است.', portfolio: 'این زبانه خروجی اصلی حالت فعلی است (سبد تازه، بدون در نظر گرفتن موقعیت‌های باز).', monitor: 'در حالت پایش، سبد جدید ساخته نمی‌شود؛ این جدول فقط برای اطلاع است.', full: 'در حالت سیستماتیک کامل، موقعیت‌های باز شما از ظرفیت سبد (تعداد، ریسک کل، وزن گروه) کم شده است.' },
      pos: { signal: 'در حالت «فقط سیگنال» موقعیت‌های باز در خروجی وارد نمی‌شوند.', portfolio: 'در حالت ساخت سبد، موقعیت‌های باز در ظرفیت سبد حساب نمی‌شوند.', monitor: 'این زبانه خروجی اصلی حالت فعلی است.', full: 'در حالت سیستماتیک کامل، اقدام این موقعیت‌ها در صدر برنامهٔ اقدام می‌آید.' } }[tab];
    return h('p', { class: 'mode-banner', text: 'حالت فعلی: ' + M.fa + ' — ' + (note ? note[E.mode] : M.does) });
  }
  var PRI = { 0: 'crit-t', 1: 'crit-t', 2: 'good-t', 3: 'warn-t' };
  function planText(X) { return X.plan.map(function (a, i) { return (i + 1) + '. [' + a.kind + '] ' + a.asset + ': ' + a.act + (a.when ? ' — ' + a.when : ''); }).join('\n'); }
  function planTab(ctx) {
    var S = ctx.S, E = ensure(S), X = ctx.R.X, M = X.mode, P = X.pf, k = E.mode, parts = [];
    var copy = h('button', { class: 'btn', type: 'button', text: 'کپی برنامه', onclick: function () { var t = 'حالت: ' + M.fa + '\n' + planText(X); if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { U.toast('کپی شد.', 'good'); }); } });
    var rows = X.plan.map(function (a, i) { return [fa(i + 1, 0), h('span', { class: PRI[a.pri] || '', 'data-notr': '1', text: a.kind }), a.asset, a.act, a.when]; });
    var head = ctx.panel('خروجی حالت: ' + M.fa, [h('p', { class: 'mode-banner', text: M.does }), h('p', { class: 'f-help', text: 'خروجی: ' + M.out }),
      X.sample ? h('p', { class: 'neg', text: 'بخشی از داده‌ها نمونه است؛ سیگنال‌های دادهٔ نمونه وارد برنامه نمی‌شوند. از زبانهٔ «اجرا، تنظیمات و داده» داده را به‌روز کنید.' }) : null,
      rows.length ? table(['#', 'نوع اقدام', 'نماد', 'اقدام', 'زمان'], rows) : h('p', { class: 'muted', text: k === 'monitor' ? 'موقعیتی ثبت نشده است؛ موقعیت‌های باز را در زبانهٔ «پایش موقعیت‌ها» وارد کنید.' : 'اقدامی برای جلسهٔ بعد نیست.' }),
      h('div', { class: 'row-ctl' }, [copy])]);
    parts.push(head);
    if (k === 'portfolio' || k === 'full') parts.push(allocPanel(ctx));
    if (k === 'monitor' || k === 'full') parts.push(ctx.panel('ریسک دفتر', [table(['سنجه', 'مقدار'], [['وضعیت حساب', X.risk.state], ['VaR تاریخی ۹۵٪ یک‌روزه (ریال)', fa(X.risk.var95, 0)], ['ریسک باز موقعیت‌ها (ریال)', fa(X.risk.heatOpen, 0)]].concat(X.risk.stress.slice(0, 3).map(function (s) { return [s.name, fa(s.pnl, 0) + ' ریال']; })))]));
    return ctx.group(parts);
  }
  function allocPanel(ctx) {
    var E = ensure(ctx.S), P = ctx.R.X.pf, eq = Number(E.acct.equity) || NaN, rows = [];
    if (P.full && P.weightOld) rows.push(['موقعیت‌های باز فعلی', pct(P.weightOld, 1), isFinite(eq) ? fa(P.weightOld * eq, 0) : '—']);
    [['stock', 'سهام و صندوق‌ها (خرید جدید)'], ['gold', 'طلا و سکه (خرید جدید)'], ['fx', 'ارز (خرید جدید)']].forEach(function (x) { var w = P.byClass[x[0]] || 0; rows.push([x[1], pct(w, 1), isFinite(eq) ? fa(w * eq, 0) : '—']); });
    rows.push(['نقد', pct(P.cash, 1), isFinite(eq) ? fa(P.cash * eq, 0) : '—']);
    var why = P.cash > 0.4 ? 'نقد بالا است چون فقط ' + fa(P.pick.length, 0) + ' سیگنال از همهٔ فیلترها و قیود عبور کرد (قیف زبانهٔ «ساخت سبد» دلیل را نشان می‌دهد). موتور برای پر کردن سبد، سیگنال ضعیف نمی‌خرد؛ فهرست انتظار نامزدهای بعدی است.' : '';
    return ctx.panel('تخصیص کل سرمایه', [table(['بخش', 'وزن', 'مبلغ (ریال)'], rows), why ? h('p', { class: 'f-help', text: why }) : null, h('p', { class: 'small muted', text: 'ریسک کل سبد: ' + pct(P.heat, 2) + ' از سقف ' + pct(E.acct.maxHeat, 1) + (P.full ? ' (شامل ' + pct(P.heatOld, 2) + ' ریسک موقعیت‌های باز)' : '') + ' · جای خالی: ' + fa(P.slots, 0) + ' موقعیت' })]);
  }

  /* ---------- 3 · portfolio ---------- */
  function pfTab(ctx) {
    var S = ctx.S, E = ensure(S), X = ctx.R.X, P = X.pf, eq = Number(E.acct.equity) || NaN, A = E.acct;
    // every pick comes from the central signal record: its rank, status, back-test and the reason it is in the basket
    var whyIn = function (c) { var r = c.central; if (!r) return 'بدون رکورد مرکزی'; var b = r.bt; return (r.rank ? 'رتبهٔ ' + fa(r.rank, 0) + ' در فرصت‌های مرکزی · ' : '') + r.stFa + ' · ' + r.actFa + (b ? ' · بک‌تست ' + (b.k || '') + ': ' + fa(b.n, 0) + ' معامله، PF ' + fa(b.pf, 2) + (b.oos && b.oos.n ? '، برون‌نمونه ' + fa(b.oos.avgR, 2) + 'R' : '') : ''); };
    var rows = P.pick.map(function (c, i) { return [fa(i + 1, 0), c.sym, c.sector || CLS[c.cls], c.strength + ' · ' + fa(c.conf, 0) + '٪', pct(c.posPct, 1), pct(c.riskPct, 2) + (P.heat > 0 ? ' (' + pct(c.riskPct / P.heat, 0) + ' از ریسک سبد)' : ''), isFinite(c.units) ? fa(c.units, 0) : '—', isFinite(eq) ? fa(c.posPct * eq, 0) : '—', px(c.lo, c) + '–' + px(c.hi, c), px(c.stop, c), px(c.tp2, c), isFinite(c.tp2) && isFinite(c.entry) ? pct(c.posPct * (c.tp2 - c.entry) / c.entry, 2) : '—', whyIn(c)]; });
    var wrows = P.watch.map(function (w, i) { var c = w.c, r = c.central; return [fa(i + 1, 0), c.sym, c.sector || CLS[c.cls], fa(c.conf, 0) + '٪', r ? r.stFa + ': ' + r.why : w.why, pct(c.potPct, 1), c.timing]; });
    var heatOut = P.out.filter(function (x) { return /ریسک کل/.test(x.why); }).length, slotOut = P.out.filter(function (x) { return /تعداد موقعیت/.test(x.why); }).length, tips = [];
    if (heatOut) tips.push(fa(heatOut, 0) + ' سیگنال فقط به دلیل سقف ریسک کل (' + pct(A.maxHeat, 1) + ') کنار رفت. با ریسک ' + pct(A.riskPct, 1) + ' برای هر معامله، این سقف حداکثر حدود ' + fa(Math.floor(A.maxHeat / A.riskPct + 1e-9), 0) + ' موقعیت قوی را جا می‌دهد؛ برای سبد بزرگ‌تر یا سقف را بالا ببرید یا ریسک هر معامله را کم کنید (زبانهٔ اجرا).');
    if (slotOut) tips.push(fa(slotOut, 0) + ' سیگنال به دلیل سقف تعداد موقعیت (' + fa(A.maxPos, 0) + ') کنار رفت.');
    if (P.near) tips.push(fa(P.near, 0) + ' دارایی صعودی با اطمینان بین ' + fa(E.minConf - 10, 0) + '٪ و ' + fa(E.minConf, 0) + '٪ هست؛ کاهش حداقل اطمینان آن‌ها را وارد می‌کند، اما با کیفیت سیگنال کمتر — این تصمیم شماست.');
    return ctx.group([modeBanner(E, 'pf'),
      ctx.panel('چرا سبد این تعداد نماد دارد؟ (قیف انتخاب)', [h('p', { class: 'f-help', text: 'هر مرحله نشان می‌دهد چند دارایی باقی ماند و بقیه چرا کنار رفتند. موتور سبد را با سیگنال ضعیف پر نمی‌کند؛ اگر سیگنال واجد شرایط کم است، باقی سرمایه نقد می‌ماند و نامزدهای بعدی در فهرست انتظار می‌آیند.' }),
        table(['مرحله', 'باقی‌مانده', 'کنارگذاشته‌ها و دلیل'], P.funnel.map(function (f) { return [f[0], fa(f[1], 0), f[2]]; })), tips.length ? list(tips) : null]),
      allocPanel(ctx),
      ctx.panel('الف) خرید جدید — قابل اجرا (' + fa(P.pick.length, 0) + ')', [h('p', { class: 'f-help', text: 'قیود: حداکثر ' + fa(A.maxPos, 0) + ' موقعیت، ریسک کل ≤ ' + pct(A.maxHeat, 1) + '، وزن هر گروه ≤ ' + pct(A.sectorCap, 0) + '، همبستگی بازدهی ۶۰ روزه < ' + fa(A.corrMax, 2) + (P.full ? '؛ موقعیت‌های باز شما از ظرفیت کم شده‌اند.' : '.') }),
        h('p', { class: 'small muted', text: 'فقط دارایی‌هایی که موتور مرکزی «تأییدشده» دانسته وارد سبد می‌شوند؛ قیود سبد (تعداد، ریسک کل، سقف گروه، همبستگی ۶۰ روزه) بعد از آن اعمال می‌شود. این فهرست با رتبه‌بندی فرصت‌ها یکی نیست: یک فرصت معتبر ممکن است به دلیل همبستگی یا سقف ریسک کنار برود.' }),
        table(['#', 'نماد', 'گروه', 'قدرت · اطمینان', 'وزن', 'ریسک (سهم از ریسک سبد)', 'تعداد', 'مبلغ (ریال)', 'ورود', 'حد ضرر', 'هدف ۲', 'اثر بر بازده سبد تا هدف ۲', 'چرا در سبد (موتور مرکزی)'], rows.length ? rows : [['—', 'هیچ سیگنال خرید تأییدشده‌ای در موتور مرکزی نیست؛ سرمایه نقد می‌ماند (قیف بالا را ببینید)', '', '', '', '', '', '', '', '', '', '', '']])]),
      ctx.panel('ب) فهرست انتظار — نامزدهای بعدی (' + fa(P.watch.length, 0) + ')', [h('p', { class: 'f-help', text: 'دارایی‌های با تمایل صعودی که هنوز یک شرط را ندارند. فعلاً نخرید؛ اگر مانع برطرف شد (مثلاً قیمت از سطح شکست عبور کرد یا اطمینان بالا رفت)، در اجرای بعدی به بخش «الف» می‌آیند. وزن ستون آخر با نصف ریسک محاسبه شده است.' }),
        wrows.length ? table(['#', 'نماد', 'گروه', 'اطمینان', 'مانع فعلی', 'وزن در صورت فعال شدن', 'شرط و زمان ورود'], wrows) : h('p', { class: 'muted', text: 'نامزد صعودی دیگری با دادهٔ واقعی نیست.' })]),
      P.full ? ctx.panel('د) موقعیت‌های فعلی شما در همین سبد', [X.mon.length ? table(['نماد', 'آخرین قیمت', 'سود/زیان', 'اقدام'], X.mon.map(function (m) { return [m.p.asset, isFinite(m.close) ? fa(m.close, 0) : '—', isFinite(m.pl) ? pct(m.pl, 1) : '—', h('span', { class: LVL[m.lvl] || '', 'data-notr': '1', text: m.act })]; })) : h('p', { class: 'muted', text: 'موقعیت بازی ثبت نشده است؛ سبد از صفر ساخته شد.' }),
        h('p', { class: 'f-help', text: 'سبد کامل بعد از اجرا = موقعیت‌های فعلی که می‌مانند (این جدول) + خرید جدید (بخش الف) + نقد. موقعیت‌هایی که اقدامشان «خروج» است از ظرفیت کم نشده‌اند.' })]) : null,
      ctx.panel('ج) سیگنال‌های خرید که وارد سبد نشدند', [P.out.length ? table(['نماد', 'اطمینان', 'دلیل'], P.out.map(function (x) { return [x.c.sym, fa(x.c.conf, 0) + '٪', x.why]; })) : h('p', { class: 'muted', text: 'موردی نیست.' })])]);
  }

  /* ---------- 4 · positions ---------- */
  var LVL = { crit: 'crit-t', warn: 'warn-t', good: 'good-t', ok: '' };
  function posTab(ctx) {
    var S = ctx.S, E = ensure(S), X = ctx.R.X;
    var lst = ctx.list({ id: 'te-pos', path: 'e.positions', onChange: ctx.rerender, newRow: function () { return { asset: '', date: '', entry: null, stop: null, tp1: null, qty: null, partial: false }; }, cols: [
      { key: 'asset', label: 'نماد', kind: 'text' }, { key: 'date', label: 'تاریخ ورود (۱۴۰۵/۰۸/۱۰)', kind: 'text' }, { key: 'entry', label: 'قیمت ورود', optional: true }, { key: 'stop', label: 'حد ضرر فعلی', optional: true },
      { key: 'tp1', label: 'هدف ۱', optional: true }, { key: 'qty', label: 'تعداد', optional: true }, { key: 'partial', label: 'هدف ۱ گرفته شد', kind: 'bool' }],
      extra: function (paint) { return [h('button', { class: 'btn ghost', type: 'button', text: 'افزودن سبد پیشنهادی به فهرست', onclick: function () { var J = Hub.jalali, d = J ? J.jstr(Math.floor(Date.now() / 864e5) + 2440588) : ''; X.pf.pick.forEach(function (c) { E.positions.push({ asset: c.sym, date: d, entry: Math.round(c.entry), stop: Math.round(c.stop), tp1: Math.round(c.tp1), qty: isFinite(c.units) ? c.units : null, partial: false }); }); ctx.rerender(); } })]; } });
    var rows = X.mon.map(function (m) { var p = m.p; return { cells: [p.asset, isFinite(m.close) ? fa(m.close, 0) : '—', isFinite(m.pl) ? pct(m.pl, 1) : '—', isFinite(m.r) ? fa(m.r, 2) + 'R' : '—', isFinite(m.held) ? fa(m.held, 0) : '—', h('span', { class: LVL[m.lvl] || '', text: m.act }), m.newStop ? fa(m.newStop, 0) : '—', isFinite(m.risk) ? fa(m.risk, 0) : '—'] }; });
    return ctx.group([modeBanner(E, 'pos'), ctx.panel('موقعیت‌های باز شما', [h('p', { class: 'f-help', text: 'موقعیت‌ها را وارد کنید (یا سبد پیشنهادی را اضافه کنید). موتور هر بار با آخرین داده بررسی می‌کند: فعال شدن حد ضرر، منفی شدن سیگنال، رژیم بحرانی، رسیدن به هدف ۱ (فروش یک‌سوم و حد ضرر سربه‌سر)، ۱R سود (سربه‌سر)، ۲R سود (حد ضرر متحرک: بالاترین بسته‌شدن − ۳ ATR) و خروج زمانی.' }), lst]),
      ctx.panel('اقدام پیشنهادی برای هر موقعیت', [rows.length ? table(['نماد', 'آخرین قیمت', 'سود/زیان', 'بر حسب R', 'جلسه‌های نگه‌داری', 'اقدام', 'حد ضرر جدید', 'ریسک باقی‌مانده (ریال)'], rows) : h('p', { class: 'muted', text: 'موقعیتی ثبت نشده است.' })])]);
  }

  /* ---------- 5 · risk ---------- */
  function riskTab(ctx) {
    var S = ctx.S, E = ensure(S), X = ctx.R.X, K = X.risk;
    var f = G.form({ id: 'te-dd', onChange: ctx.rerender, fields: [ctx.field('eq2', 'سرمایهٔ فعلی حساب (ریال)', 'e.acct.equity', 'num', { optional: true }), ctx.field('pk', 'بیشترین سرمایهٔ تاریخی حساب (سقف)', 'e.acct.peak', 'num', { optional: true }),
      ctx.field('ds', 'حد نرم افت سرمایه', 'e.acct.ddSoft', 'pct'), ctx.field('dh', 'حد سخت افت سرمایه', 'e.acct.ddHard', 'pct'), ctx.field('cm', 'حداکثر همبستگی مجاز دو موقعیت', 'e.acct.corrMax', 'dec')] });
    var st = /^اضطراری/.test(K.state) ? 'crit-t' : /^کاهش/.test(K.state) ? 'warn-t' : 'good-t';
    var cm = K.labels.length ? table([''].concat(K.labels), K.labels.map(function (l, i) { return [l].concat(K.corr[i].map(function (v) { return isFinite(v) ? fa(v, 2) : '—'; })); })) : h('p', { class: 'muted', text: 'موقعیت باز یا پیشنهادی با تعداد مشخص نیست (سرمایه را وارد کنید یا موقعیت ثبت کنید).' });
    return ctx.group([ctx.panel('وضعیت ریسک حساب', [f, h('p', { class: st, text: 'افت از سقف: ' + (isFinite(K.dd) ? pct(K.dd, 1) : '—') + ' · وضعیت: ' + K.state })]),
      ctx.panel('ارزش در معرض ریسک (یک‌روزه) و آزمون فشار', [h('p', { class: 'f-help', text: 'دفتر = موقعیت‌های باز + سبد پیشنهادی (با تعداد). VaR تاریخی از ' + fa(K.nDays, 0) + ' روز بازده هم‌زمان؛ VaR پارامتریک = ۱٫۶۴۵ و ۲٫۳۲۶ انحراف معیار. سناریوهای فشار با بتای ۱۲۰ روزه به شاخص و دلار محاسبه می‌شوند؛ «نامشخص» یعنی دادهٔ شاخص یا دلار نیست.' }),
        table(['سنجه', '۹۵٪', '۹۹٪'], [['VaR تاریخی (ریال)', fa(K.var95, 0), fa(K.var99, 0)], ['VaR پارامتریک (ریال)', fa(K.pvar95, 0), fa(K.pvar99, 0)], ['ارزش دفتر (ریال)', fa(K.value, 0), '']]),
        table(['سناریو', 'سود/زیان (ریال)', 'درصد سرمایه', 'دارایی بدون داده'], K.stress.map(function (s) { return [s.name, fa(s.pnl, 0), isFinite(s.pct) ? pct(s.pct, 1) : '—', s.miss ? fa(s.miss, 0) + ' (نامشخص)' : '—']; }))]),
      ctx.panel('ماتریس همبستگی (بازده روزانهٔ ۶۰ روز)', [cm]), ctx.panel('قواعد اضطراری و حدود', [table(['قاعده', 'مقدار / عمل'], K.rules)])]);
  }

  /* ---------- 6 · models bank ---------- */
  function modelsTab(ctx) {
    var S = ctx.S, E = ensure(S), Bk = TB(), bt = BT && BT.rules ? BT.rules.reduce(function (o, r) { o[r.m] = r; return o; }, {}) : {};
    var K = function (g) { return isFinite(Number(E.ev.k[g])) && E.ev.k[g] !== '' && E.ev.k[g] != null ? Number(E.ev.k[g]) : Bk.MULT[g]; };
    E.ev.m = {}; Object.keys(TE.BASEW).forEach(function (id) { var e = Bk.EV[id]; if (e && Bk.MULT[e.g] != null) E.ev.m[id] = K(e.g); });
    var cmp = h('div', { 'aria-live': 'polite' }), tg = h('input', { type: 'checkbox', 'aria-label': 'اعمال اعتبار علمی در وزن‌ها' }); tg.checked = !!E.ev.on; tg.addEventListener('change', function () { E.ev.on = tg.checked; ctx.rerender(); });
    var kin = ['A', 'B', 'C', 'D'].map(function (g) { var i = h('input', { class: 'cell-in', type: 'text', inputmode: 'decimal', style: 'width:56px', 'aria-label': 'ضریب ' + Bk.GRADE[g], value: String(K(g)) }); i.addEventListener('change', function () { var v = Number(i.value); if (!isFinite(v) || v < 0 || v > 2) { U.toast('ضریب باید بین ۰ و ۲ باشد.', 'warn'); return; } E.ev.k[g] = v; ctx.rerender(); }); return h('label', { class: 'chk-l', 'data-notr': '1' }, [document.createTextNode(Bk.GRADE[g] + ' × '), i]); });
    var cmpBtn = h('button', { class: 'btn', type: 'button', 'data-notr': '1', text: 'مقایسهٔ بک‌تست: با و بدون وزن‌دهی علمی', onclick: function () { cmpBtn.disabled = true; cmp.textContent = 'در حال اجرا (دو بک‌تست)…'; setTimeout(function () { try {
      var was = E.ev.on; E.ev.on = false; var a = TE.backtest(E); E.ev.on = true; var b = TE.backtest(E); E.ev.on = was; U.clear(cmp);
      cmp.appendChild(table(['حالت', 'معاملات خارج از نمونه', 'نرخ برد', 'میانگین R', 'ضریب سود', 'حداکثر افت'], [['وزن‌های فعلی، بدون اعتبار علمی', a.OOS], ['با ضریب اعتبار علمی', b.OOS]].map(function (x) { var o = x[1]; return [x[0], fa(o.n || 0, 0), o.n ? pct(o.hit, 0) : '—', o.n ? fa(o.avgR, 2) + 'R' : '—', o.n && isFinite(o.pf) ? fa(o.pf, 2) : '—', o.n ? fa(o.mdd, 1) + 'R' : '—']; })));
      cmp.appendChild(h('p', { class: 'small muted', 'data-notr': '1', text: (ctx.R.X.sample ? 'روی دادهٔ نمونه اجرا شد و بی‌معناست. ' : '') + (Math.min(a.OOS.n || 0, b.OOS.n || 0) < 30 ? 'کمتر از ۳۰ معاملهٔ خارج از نمونه: تفاوت دو ردیف از نظر آماری قابل اتکا نیست. ' : '') + 'این مقایسه فقط می‌گوید روی دادهٔ شما کدام بهتر بوده؛ انتخاب بر پایهٔ همین یک عدد خودش نوعی بیش‌برازش است.' })); } catch (e) { cmp.textContent = 'ناموفق: ' + e.message; } cmpBtn.disabled = false; }, 40); } });
    var rows = Bk.M.map(function (m) {
      var inBase = TE.BASEW[m.id] != null, w = h('input', { class: 'cell-in', type: 'text', inputmode: 'decimal', style: 'width:60px', 'aria-label': 'وزن ' + m.fa, value: inBase ? String(E.w[m.id] != null ? E.w[m.id] : TE.BASEW[m.id]) : '', disabled: !inBase });
      w.addEventListener('change', function () { var v = Number(w.value); if (!isFinite(v) || v < 0) { U.toast('وزن باید عدد نامنفی باشد.', 'warn'); return; } E.w[m.id] = v; ctx.rerender(); });
      var cb = h('input', { type: 'checkbox', 'aria-label': 'فعال ' + m.fa, disabled: !inBase }); cb.checked = inBase && !E.off[m.id]; cb.addEventListener('change', function () { E.off[m.id] = !cb.checked; ctx.rerender(); });
      var ev = bt[m.id], evT = ev ? (ev.oos.n ? 'خارج از نمونه: ' + fa(ev.oos.n, 0) + ' معامله، میانگین ' + fa(ev.oos.avgR, 2) + 'R' + (ev.ok ? ' ✓' : ' ✗') : 'معامله‌ای نبود') : (m.id === 'mlrank' ? ctx.R.X.ml.why : '');
      var e0 = Bk.EV[m.id], grade = e0 ? Bk.GRADE[e0.g] + '' : m.st === 'dev' ? 'توسعه‌ای' : '—', gcls = e0 ? { A: 'fit-rec', B: 'fit-cond', C: 'fit-no', D: 'fit-no', N: 'sev-info' }[e0.g] : 'sev-info';
      var det = h('details', null, [h('summary', { text: m.fa }), list((e0 ? ['اعتبار علمی (' + Bk.GRADE[e0.g] + '): ' + e0.t + (e0.r.length ? ' [' + e0.r.map(function (n) { return fa(n, 0); }).join('، ') + ']' : '')] : []).concat(['منطق: ' + m.logic, 'افق: ' + m.horizon + ' · رژیم مناسب: ' + m.regimes + ' · دارایی: ' + m.assets, 'منبع معرفی روش (کتاب یا مقالهٔ اصلی؛ از دانستهٔ قبلی، در بازبینی آبان ۱۴۰۵ جست‌وجو نشد): ' + m.src].concat(e0 ? [] : ['شواهد: ' + m.evidence]).concat([ 'نقطهٔ ضعف: ' + m.weak, 'ملاحظهٔ ایران: ' + m.iran])))]);
      return [det, h('span', { class: 'sev ' + gcls, 'data-notr': '1', text: grade }), Bk.FAM[m.fam], { dir: 'رأی جهت', lvl: 'سطوح', size: 'اندازه', filter: 'فیلتر' }[m.role] || m.role, Bk.ST[m.st], inBase ? w : (m.id === 'options' ? 'کارت جداگانه' : m.st === 'dev' ? '—' : 'در اندازه‌گذاری'), inBase ? cb : '—', evT || '—'];
    });
    var cnt = { A: 0, B: 0, C: 0, D: 0 }; Object.keys(TE.BASEW).forEach(function (id) { var e = Bk.EV[id]; if (e && cnt[e.g] != null) cnt[e.g]++; });
    var evPanel = ctx.panel('اعتبار علمی مدل‌ها', [h('p', { class: 'f-help', 'data-notr': '1', text: 'برای همهٔ مدل‌ها جست‌وجوی مقاله انجام شده است (آبان ۱۴۰۵). مدل‌های رأی‌دهنده: قوی ' + fa(cnt.A, 0) + '، مختلط ' + fa(cnt.B, 0) + '، ضعیف یا ردشده ' + fa(cnt.C, 0) + '، و ' + fa(cnt.D, 0) + ' مدل که برایشان مطالعهٔ مستقیمی وجود ندارد. در حالت سخت‌گیرانه (پیش‌فرض) مدل‌های بدون مطالعه رأی نمی‌دهند (ضریب صفر) و مدل‌های ضعیف نصف وزن دارند. شرح و منبع هر مدل با باز کردن ردیفش دیده می‌شود. ستون «شواهد روی دادهٔ شما» سنجش دوم است و از بک‌تست می‌آید.' }),
      h('label', { class: 'chk-l', 'data-notr': '1' }, [tg, document.createTextNode(' حالت سخت‌گیرانه: اعتبار علمی در وزن مدل‌ها اعمال شود (وزن هر مدل × ضریب درجه‌اش)')]),
      h('div', { class: 'row-ctl', style: 'flex-wrap:wrap' }, kin), h('p', { class: 'small muted', 'data-notr': '1', text: 'ضریب‌ها فرض این ابزارند، نه یافتهٔ علمی؛ می‌توانید تغییرشان دهید. سیستم یادگیری همچنان جداگانه وزن‌ها را با نتیجهٔ معاملات خودتان تعدیل می‌کند. وضعیت فعلی: ' + (E.ev.on ? 'اعمال می‌شود.' : 'اعمال نمی‌شود (فقط نمایش).') }),
      h('div', { class: 'row-ctl' }, [cmpBtn]), cmp,
      h('details', null, [h('summary', { 'data-notr': '1', text: 'فهرست منابع (' + fa(Bk.EVREFS.length, 0) + ')' }), h('ol', { class: 'studio-l' }, Bk.EVREFS.map(function (x) { return h('li', { 'data-notr': '1', dir: 'ltr', style: 'text-align:left', text: x }); }))])]);
    return ctx.group([evPanel, ctx.panel('بانک مدل‌ها (' + fa(Bk.M.length, 0) + ' مدل)', [h('p', { class: 'f-help', text: 'وزن‌ها پیش‌فرض‌های ثابت هستند (بهینه‌سازی نشده‌اند تا بیش‌برازش رخ ندهد). در رژیم روندی وزن مدل‌های روند ×۱٫۳ و نوسان‌گرها ×۰٫۶ و در رژیم رنج برعکس؛ در رژیم پرنوسان همه ×۰٫۸. مدل یادگیری ماشین فقط وقتی رأی می‌دهد که AUC خارج از نمونه ≥ ۰٫۵۵ باشد. مدل‌های «توسعه‌ای» در امتیاز نیستند. ستون شواهد پس از اجرای بک‌تست پر می‌شود.' }),
      table(['مدل (برای جزئیات باز کنید)', 'اعتبار علمی', 'خانواده', 'نقش', 'وضعیت', 'وزن', 'فعال', 'شواهد روی دادهٔ شما'], rows),
      h('div', { class: 'row-ctl' }, [h('button', { class: 'btn ghost', type: 'button', text: 'بازگشت به وزن‌های پیش‌فرض', onclick: function () { E.w = {}; E.off = {}; ctx.rerender(); } }), h('span', { class: 'muted small', text: 'بازبینی منابع: ' + Bk.REVIEWED })])])]);
  }

  /* ---------- 7 · back-test ---------- */
  function btKey(E) { return JSON.stringify([E.ev && E.ev.on ? E.ev.m : 0, E.w, E.off, E.acct.costPct, E.acct.limitPct, E.minConf, E.classes]) + '|' + ['hub.sigstocks.v1', 'hub.sig-gold.v1', 'hub.sig-fx.v1'].map(function (k) { var s = U.store.get(k, null); return s && s.meta ? s.meta.asOf : ''; }).join(); }
  function srow(name, s) { return [name, fa(s.n || 0, 0), s.n ? pct(s.hit, 0) : '—', s.n ? fa(s.avgR, 2) + 'R' : '—', s.n && isFinite(s.pf) ? fa(s.pf, 2) : '—', s.n ? fa(s.mdd, 1) + 'R' : '—', s.n ? fa(s.days, 0) : '—', s.n && isFinite(s.kelly) ? pct(s.kelly, 0) : '—']; }
  function btTab(ctx) {
    var S = ctx.S, E = ensure(S), out = h('div'), stale = BT && BTkey !== btKey(E);
    function paint() {
      U.clear(out); if (!BT) { out.appendChild(h('p', { class: 'muted', text: 'هنوز اجرا نشده است.' })); return; }
      var b = BT, warn = [];
      if (stale) warn.push('تنظیمات یا داده پس از آخرین اجرا تغییر کرده است؛ دوباره اجرا کنید.');
      if (b.OOS.n < 30) warn.push('تعداد معاملات خارج از نمونه (' + fa(b.OOS.n, 0) + ') کمتر از ۳۰ است؛ نتیجه از نظر آماری قابل اتکا نیست.');
      if (b.IS.n && b.OOS.n && b.IS.avgR > 0 && b.OOS.avgR < b.IS.avgR * 0.5) warn.push('عملکرد خارج از نمونه کمتر از نصف درون نمونه است — نشانهٔ احتمالی بیش‌برازش یا تغییر رژیم.');
      if (b.OOS.n && b.OOS.avgR <= 0) warn.push('امید ریاضی خارج از نمونه منفی یا صفر است؛ روی این داده، سیگنال‌ها لبهٔ اثبات‌شده ندارند.');
      if (S._sampleBT) warn.push('روی دادهٔ نمونه (ساختگی) اجرا شده است؛ نتیجه فقط برای آزمون عملکرد ابزار است.');
      if (warn.length) out.appendChild(h('div', { class: 'f-help' }, [list(warn)]));
      out.appendChild(table(['دوره', 'تعداد', 'نرخ برد', 'میانگین R', 'ضریب سود', 'حداکثر افت', 'روز نگه‌داری', 'کلی'], [srow('درون نمونه (۶۰٪ اول تاریخ‌ها)', b.IS), srow('خارج از نمونه (۴۰٪ آخر)', b.OOS), srow('کل', b.all)]));
      out.appendChild(h('h3', { text: 'کالیبراسیون اطمینان (خارج از نمونه)' }));
      out.appendChild(table(['بازهٔ اطمینان', 'تعداد', 'نرخ برد', 'میانگین R'], b.buckets.map(function (x) { return [fa(x.b[0], 0) + '–' + fa(Math.min(x.b[1], 100), 0) + '٪', fa(x.n || 0, 0), x.n ? pct(x.hit, 0) : '—', x.n ? fa(x.avgR, 2) + 'R' : '—']; })));
      out.appendChild(h('p', { class: 'small muted', text: 'اگر میانگین R در بازه‌های اطمینان بالاتر بیشتر نباشد، عدد «اطمینان» کالیبره نیست و باید آن را رتبه‌ای (نه احتمالی) خواند.' }));
      out.appendChild(h('h3', { text: 'شواهد هر مدل به‌تنهایی (قاعده: رأی ≥ ۰٫۵ ← خرید)' }));
      out.appendChild(table(['مدل', 'درون نمونه', 'خارج از نمونه', 'نتیجه'], b.rules.map(function (r) { var m = TB().get(r.m); return [m ? m.fa : r.m, fa(r.is.n || 0, 0) + ' · ' + (r.is.n ? fa(r.is.avgR, 2) + 'R' : '—'), fa(r.oos.n || 0, 0) + ' · ' + (r.oos.n ? fa(r.oos.avgR, 2) + 'R' : '—'), r.ok ? 'شواهد مثبت' : r.oos.n < 10 ? 'دادهٔ کافی نیست' : 'شواهد ندارد']; })));
      var tr = b.trades.slice().sort(function (p, q) { return q.d - p.d; }).slice(0, 40);
      out.appendChild(h('h3', { text: 'آخرین معاملات شبیه‌سازی‌شده' }));
      out.appendChild(table(['دارایی', 'تاریخ ورود', 'اطمینان', 'نتیجه (R)', 'خروج', 'روز'], tr.map(function (t) { return [t.asset, String(t.d), fa(t.conf, 0), fa(t.r, 2), { stop: 'حد ضرر', tp1: 'هدف ۱', tp2: 'هدف ۲', tp3: 'هدف ۳', time: 'زمانی' }[t.exit] || t.exit, fa(t.days, 0)]; })));
    }
    var go = h('button', { class: 'btn primary', type: 'button', text: 'اجرای بک‌تست و اعتبارسنجی', onclick: function () { runVal(ctx, go); } });
    paint();
    return ctx.group([ctx.panel('بک‌تست با تفکیک درون و خارج از نمونه', [h('p', { class: 'f-help', text: 'همان کد سیگنال امروز، روز به روز و فقط با دادهٔ تا همان روز (بدون نگاه به آینده). ورود در قیمت بازشدن جلسهٔ بعد؛ در صف خرید (سقف قفل) ورود ممکن نیست؛ خروج پله‌ای (یک‌سوم در هدف ۱ و حد ضرر سربه‌سر، یک‌سوم در هدف ۲، بقیه با حد ضرر متحرک یا هدف ۳)، خروج زمانی، هزینهٔ رفت‌وبرگشت ' + pct(E.acct.costPct, 1) + '. فقط خرید (بازار ایران). وزن‌ها روی این داده تنظیم نشده‌اند؛ بنابراین بخش خارج از نمونه آزمون واقعی است. محدودیت: لغزش در صف فروش و شکاف قیمتی فقط تا قیمت بازشدن مدل می‌شود.' }), h('div', { class: 'row-ctl' }, [go]), out])].concat(valDetailPanels(ctx)).concat([dbPanel(ctx)]));
  }

  /* ---------- 8 · scenarios ---------- */
  function scenTab(ctx) {
    var E = ensure(ctx.S), res = TE.SCEN.map(function (sc) { try { return TE.runScenario(sc, E); } catch (e) { return { sc: sc, err: e.message, pass: false }; } }), n = res.filter(function (r) { return r.pass; }).length;
    var rows = res.map(function (r) { var c = r.card; return [r.sc.fa, r.sc.expect, c ? c.typeFa + ' · ' + c.strength + ' · ' + c.status : r.err, c ? TE.REG[c.regime] : '', c ? fa(c.conf, 0) + '٪' : '', c ? (c.why.concat(c.cond)).join('؛ ') || '—' : '', h('span', { class: r.pass ? 'good-t' : 'crit-t', text: r.pass ? '✓ موفق' : '✗ ناموفق' })]; });
    return ctx.group([ctx.panel('شش سناریوی آزمون (' + fa(n, 0) + ' از ' + fa(res.length, 0) + ' موفق)', [h('p', { class: 'f-help', text: 'سری‌های قیمت ساختگی با پاسخ معلوم (۲۶۰ جلسه، با جریان پول حقیقی) از همان موتور و با تنظیمات فعلی شما عبور می‌کنند و رفتار مورد انتظار به‌طور خودکار بررسی می‌شود. اگر تنظیمات را تغییر دهید و آزمونی ناموفق شود، یعنی قواعد شما در آن وضعیت رفتار ناامن دارد.' }),
      table(['سناریو', 'رفتار مورد انتظار', 'خروجی موتور', 'رژیم', 'اطمینان', 'دلیل / شرط', 'نتیجه'], rows)]),
      ctx.panel('کارت کامل سناریوها', res.filter(function (r) { return r.card; }).map(function (r) { return sigCard(r.card); }))]);
  }

  /* ---------- 9 · report ---------- */
  function aiPrompt(X, E) {
    var act = X.cards.filter(function (c) { return c.type !== 'hold'; }).slice(0, 15);
    return ['You are a multi-agent trading desk reviewing signals produced by a rule-based engine for the Tehran Stock Exchange, the Iranian free gold/FX market and TSE options. Work as five agents in sequence and write in Persian:',
      '1) Technical analyst: check each signal against the stated indicator reasons; flag contradictions.', '2) Flow & market-structure analyst: individual/institutional money flow, queues, daily price limits, liquidity.', '3) Fundamental & macro analyst: only from facts below or that the user supplies; mark every external claim as needing verification; invent no news or numbers.',
      '4) Risk manager: sizing, heat, correlation, stop placement versus price-limit gaps; veto anything that breaks the rules.', '5) Devil\'s advocate: the strongest case against each strong signal.', 'Then the chief strategist returns ONE JSON object: {"marketView":"...","signals":[{"asset":"...","engineType":"...","verdict":"confirm|downgrade|reject","why":"...","risks":["..."]}],"portfolioComments":["..."],"riskWarnings":["..."],"missingData":["..."]}. The final decision stays with the user; this is not investment advice.',
      '# Context', 'Mode: ' + E.mode + ' | Market rules: ' + E.market + ' | Index regime: ' + (X.market ? X.market.rg : 'n/a') + ' | Risk state: ' + X.risk.state + ' | ML ranker: ' + X.ml.why + (X.sample ? ' | WARNING: part of the data is synthetic sample data' : ''),
      '# Signals', act.map(function (c) { return c.sym + ' [' + c.cls + ', ' + c.sector + '] ' + c.type + ' ' + c.strength + (c.val ? ' validation-grade ' + c.val.grade : '') + ' conf ' + c.conf + ' regime ' + c.regime + ' entry ' + Math.round(c.lo) + '-' + Math.round(c.hi) + ' stop ' + Math.round(c.stop) + ' TP ' + [c.tp1, c.tp2, c.tp3].map(Math.round).join('/') + ' RR2 ' + c.rr2.toFixed(2) + ' size ' + (c.posPct * 100).toFixed(1) + '% | reasons: ' + c.top.map(function (x) { return x.m + ': ' + x.why; }).join('; ') + ' | against: ' + c.against.map(function (x) { return x.m + ': ' + x.why; }).join('; ') + ' | conditions: ' + c.cond.concat(c.why).join('; '); }).join('\n'),
      '# Portfolio', X.pf.pick.map(function (c) { return c.sym + ' ' + (c.posPct * 100).toFixed(1) + '%'; }).join(', ') + ' | heat ' + (X.pf.heat * 100).toFixed(2) + '%',
      '# News entered by the user', (E.news || []).map(function (n) { return n.asset + ': ' + n.note + ' (dir ' + n.dir + ', ' + n.impact + ')'; }).join('\n') || 'none'].join('\n');
  }
  function reportTab(ctx) {
    var S = ctx.S, E = ensure(S), X = ctx.R.X, st = h('div', { class: 'studio-status', 'aria-live': 'polite' }), ta = h('textarea', { class: 'f-area', rows: 3, 'aria-label': 'پرامپت', placeholder: 'اگر کلیپ‌بورد مسدود بود، پرامپت اینجا نمایش داده می‌شود' }), out = h('div');
    var act = X.cards.filter(function (c) { return c.type !== 'hold'; }), lg = act.filter(function (c) { return c.type === 'long'; });
    var mode = (MODE.filter(function (m) { return m[0] === E.mode; })[0] || MODE[3])[1];
    var fresh = FEEDIDS.map(function (id) { var f = feed(id); if (!f) return null; var s = feedState(f); return FAT[id] + ': ' + (s.k === 'none' ? 'دادهٔ نمونه' : (s.k === 'stale' ? 'کهنه' : 'به‌روز') + ' (' + (s.S.meta.asOf || '') + ')'); }).filter(Boolean);
    var body = h('div', { class: 'report-body' }, [h('h3', { text: '۱. خلاصهٔ اجرایی' }), list([
      'حالت: ' + mode + ' · دارایی‌های بررسی‌شده: ' + fa(X.n, 0) + ' (+ ' + fa(X.cards.filter(function (c) { return c.cls === 'option'; }).length, 0) + ' اختیار معامله)',
      'سیگنال خرید: ' + fa(X.counts.long, 0) + ' (قوی ' + fa(X.counts.strong, 0) + ') · بستن/عدم خرید: ' + fa(X.counts.close, 0) + ' · نگه‌داری: ' + fa(X.counts.hold, 0),
      X.market ? 'رژیم شاخص کل: ' + TE.REG[X.market.rg] : 'دادهٔ شاخص کل در دسترس نیست', 'وضعیت ریسک حساب: ' + X.risk.state, 'مدل یادگیری ماشین: ' + X.ml.why]),
      h('h3', { text: 'برنامهٔ اقدام — حالت ' + X.mode.fa }), X.plan.length ? list(X.plan.slice(0, 20).map(function (a) { return '[' + a.kind + '] ' + a.asset + ': ' + a.act + (a.when ? ' — ' + a.when : ''); })) : h('p', { class: 'muted', text: '—' }),
      h('h3', { text: '۲. سیگنال‌های برتر' }), lg.length ? list(lg.slice(0, 8).map(sigText)) : h('p', { class: 'muted', text: 'سیگنال خرید واجد شرایطی نیست.' }),
      h('h3', { text: '۳. سبد پیشنهادی' }), list(X.pf.pick.map(function (c) { return c.sym + ' — وزن ' + pct(c.posPct, 1) + '، ریسک ' + pct(c.riskPct, 2); }).concat(X.pf.watch.map(function (w) { return 'انتظار: ' + w.c.sym + ' — مانع: ' + w.why; })).concat(['ریسک کل ' + pct(X.pf.heat, 2) + '، نقد ' + pct(X.pf.cash, 1)]).concat(X.pf.funnel.map(function (f) { return 'قیف — ' + f[0] + ': ' + fa(f[1], 0); }))),
      h('h3', { text: '۴. پایش موقعیت‌ها' }), X.mon.length ? list(X.mon.map(function (m) { return m.p.asset + ': ' + m.act; })) : h('p', { class: 'muted', text: 'موقعیتی ثبت نشده است.' }),
      h('h3', { text: '۵. ریسک' }), list(['VaR تاریخی ۹۵٪ یک‌روزه: ' + fa(X.risk.var95, 0) + ' ریال'].concat(X.risk.stress.map(function (s) { return s.name + ': ' + fa(s.pnl, 0) + ' ریال'; }))),
      h('h3', { text: '۶. اعتبار داده و مدل' }), list(fresh.concat([BT ? 'بک‌تست خارج از نمونه: ' + fa(BT.OOS.n, 0) + ' معامله، میانگین ' + fa(BT.OOS.avgR, 2) + 'R، نرخ برد ' + pct(BT.OOS.hit, 0) : 'بک‌تست هنوز اجرا نشده است (زبانهٔ بک‌تست).'])),
      h('h3', { text: 'اعتبار علمی مدل‌های رأی‌دهنده' }), (function () { var Bk2 = TB(), by = { A: [], B: [], C: [], D: [] }; Object.keys(TE.BASEW).forEach(function (id) { var e = Bk2.EV[id], m = Bk2.get(id); if (e && by[e.g] && !(E.off || {})[id]) by[e.g].push(m ? m.fa : id); });
        return list(['A', 'B', 'C', 'D'].map(function (g) { return Bk2.GRADE[g] + ' (' + fa(by[g].length, 0) + '): ' + (by[g].join('؛ ') || '—'); }).concat([E.ev && E.ev.on ? 'ضریب اعتبار علمی در وزن‌ها اعمال شده است.' : 'ضریب اعتبار علمی در وزن‌ها اعمال نشده است (زبانهٔ بانک مدل‌ها).', 'منابع هر درجه: زبانهٔ «بانک مدل‌ها».'])); })(),
      h('h3', { text: '۷. محدودیت‌ها' }), list(['فقط دادهٔ روزانه؛ تایم‌فریم ۴ ساعته و درون‌روز در دسترس نیست (مدل چند بازهٔ زمانی با روزانه/هفتگی/ماهانه کار می‌کند).', 'دامنهٔ نوسان، کارمزد و مالیات فرض‌اند؛ از مقررات روز بورس بررسی کنید.', 'مدل‌های FinBERT، XGBoost/LSTM و یادگیری تقویتی توسعه‌ای‌اند و در امتیاز نیستند.', 'اطمینان یک امتیاز قاعده‌محور است، نه احتمال؛ کالیبراسیون آن در بک‌تست نشان داده می‌شود.', 'این گزارش توصیهٔ سرمایه‌گذاری نیست؛ تصمیم و اجرا با شماست.'])]);
    var pr = h('button', { class: 'btn primary', type: 'button', text: 'چاپ / ذخیره به PDF', onclick: function () { document.body.classList.add('printing-report'); setTimeout(function () { root.print(); document.body.classList.remove('printing-report'); }, 50); } });
    var cp = h('button', { class: 'btn', type: 'button', text: 'کپی پرامپت میز معاملات چندعاملی (Claude)', onclick: function () { var p = aiPrompt(X, E); if (navigator.clipboard) navigator.clipboard.writeText(p).then(function () { U.toast('پرامپت کپی شد.', 'good'); }, function () { ta.value = p; }); else ta.value = p; } });
    var ai = h('button', { class: 'btn', type: 'button', text: 'بازبینی با هوش مصنوعی (در صورت اتصال)', onclick: function () {
      var sp = Hub.ai ? Hub.ai.sampler() : Promise.resolve(null);
      sp.then(function (s) { if (!s) { st.textContent = 'هوش مصنوعی وصل نیست؛ از «کپی پرامپت» استفاده کنید.'; return; } st.textContent = 'در حال بازبینی…'; return s.json(aiPrompt(X, E), { modelTier: 'complex' }).then(function (j) { S.ai = { json: j, at: new Date().toLocaleString('fa-IR') }; st.textContent = 'انجام شد · ' + S.ai.at; paintAI(); }); }).catch(function (e) { st.textContent = 'درخواست ناموفق: ' + (e && (e.message || e.code)); });
    } });
    function paintAI() { U.clear(out); var j = S.ai && S.ai.json; if (!j) return; out.appendChild(h('p', null, [h('strong', { text: j.marketView || '' })]));
      if (Array.isArray(j.signals)) out.appendChild(table(['دارایی', 'نظر', 'دلیل', 'ریسک‌ها'], j.signals.map(function (x) { return [x.asset, x.verdict, x.why, (x.risks || []).join('؛ ')]; })));
      ['portfolioComments', 'riskWarnings', 'missingData'].forEach(function (k) { if (Array.isArray(j[k]) && j[k].length) out.appendChild(list(j[k])); }); }
    paintAI();
    var PR = ctx.R.X.prio || [];
    return ctx.group([ctx.panel('اولویت‌های امروز (ابتدای گزارش)', [prioTable(PR.slice(0, 10))]), ctx.panel('گزارش معامله‌گری', [h('div', { class: 'row-ctl' }, [pr, h('span', { class: 'muted', text: 'خروجی اکسل از دکمهٔ «خروجی اکسل» بالای صفحه.' })]), body]),
      ctx.panel('بازبینی میز معاملات چندعاملی (اختیاری)', [h('p', { class: 'f-help', text: 'پنج نقش (تحلیلگر تکنیکال، جریان پول، بنیادی و کلان، مدیر ریسک، منتقد) سیگنال‌ها را نقد می‌کنند و مدیر ارشد جمع‌بندی می‌کند. پاسخ پیش‌نویس است؛ هیچ خبر یا عددی نباید از خود مدل ساخته شود.' }), h('div', { class: 'row-ctl' }, [ai, cp]), st, ta, out])]);
  }

  /* ---------- continuous learning ---------- */
  function saveState(S) { try { U.store.set('hub.tradingEngine.v1', S); } catch (e) { /* storage full */ } }
  var TAGS = [['', '—'], ['plan', 'طبق برنامه'], ['late', 'ورود دیر (ترس از جا ماندن)'], ['early', 'خروج زودتر از برنامه'], ['stop', 'جابه‌جایی یا نادیده‌گرفتن حد ضرر'], ['size', 'حجم بیشتر از برنامه'], ['revenge', 'معاملهٔ تلافی‌جویانه'], ['skip', 'سیگنال را نگرفتم']];
  var EXITFA = { stop: 'حد ضرر', 'gap-stop': 'حد ضرر با شکاف', breakeven: 'سربه‌سر پس از هدف ۱', trail: 'حد ضرر متحرک', tp3: 'هدف ۳', time: 'زمانی', 'no-fill': 'ورود نشد', 'gap-below-stop': 'باطل پیش از ورود', avoid: 'پرهیز' };
  var STFA = { pending: 'در انتظار ورود', open: 'باز', closed: 'بسته', unfilled: 'ورود نشد', graded: 'ارزیابی‌شده' };
  function st4(name, s) { return [name, fa(s.n || 0, 0), s.n ? pct(s.hit, 0) : '—', s.n ? fa(s.avgR, 2) + 'R' : '—', s.n && isFinite(s.pf) ? fa(s.pf, 2) : '—', s.n ? fa(s.mdd, 1) + 'R' : '—']; }
  function learnPrompt(L, E, S) {
    return ['You are a trading performance coach reviewing a rule-based signal engine and the trader who executes it (Tehran Stock Exchange, gold, FX). Write in Persian. Use ONLY the numbers below; invent nothing.',
      'Return ONE JSON object: {"summary":"...","analyticErrors":["..."],"psychologicalErrors":["..."],"patterns":["..."],"ruleChanges":[{"change":"...","evidence":"...","risk":"..."}],"keepDoing":["..."],"experimentsNextPeriod":["..."]}. Flag every conclusion that rests on fewer than 20 trades as weak evidence.',
      '# Live closed signals', JSON.stringify(L.live), '# By regime', L.byRegime.map(function (g) { return g.k + ': n=' + g.n + ' avgR=' + g.avgR.toFixed(2); }).join(' | '), '# By confidence', L.byConf.map(function (g) { return g.k + ': n=' + g.n + ' avgR=' + g.avgR.toFixed(2); }).join(' | '),
      '# Exit types', L.byExit.map(function (g) { return g.k + ': ' + g.n; }).join(' | '), '# Recurring reasons (rule-based)', L.reasons.slice(0, 12).map(function (r) { return r.k + ' ×' + r.n + ' (avg ' + (r.r / r.n).toFixed(2) + 'R)'; }).join('\n'),
      '# Trader execution tags (self-reported)', L.tags.map(function (t) { return t.k + ' ×' + t.n + (t.g ? ' gap vs plan ' + (t.gap / t.g).toFixed(2) + 'R' : ''); }).join(' | ') || 'none recorded',
      '# Trader notes', (S.j || []).filter(function (j) { return j.note; }).slice(-15).map(function (j) { return j.sym + ' ' + j.d + ': ' + j.note; }).join('\n') || 'none',
      '# Current learned settings', JSON.stringify({ minConf: E.minConf, learn: { wr: E.learn.wr, block: E.learn.block, riskMult: E.learn.riskMult } })].join('\n');
  }
  /* model evaluation after every update (directive «continuous learning»): signal outcomes, back-test of strategies, forecast error, release log.
     Back-test and live-signal validation are reported separately; every number is computed from data already in the hub. */
  function evalPanel(ctx) {
    var S = ctx.S, E = ensure(S), X = ctx.R.X, D = X.decide(), K = D.desk; if (!K) return null;
    var A = K.track && K.track.acc, V = E.val || {}, db = V.db, SGs = K.strat || {}, out = [];
    var rt = function (a, b) { return b ? pct(a / b, 0) + ' (' + fa(a, 0) + ' از ' + fa(b, 0) + ')' : '— (نمونه ندارد)'; };
    out.push(h('h3', { text: '۱. سیگنال‌های واقعی صادرشده (پایش، نه بک‌تست)' }));
    out.push(A && A.closed ? table(['معیار', 'مقدار', 'توضیح'], [['Precision جهت', rt(A.dirOK, A.dirKnown), 'از سیگنال‌های خرید بسته‌شده با تغییر قیمت، چند درصد جهتشان درست بود'], ['رسیدن به هدف ۱', rt(A.tgt, A.closed), 'سهم سیگنال‌های بسته‌شده که دست‌کم به هدف اول رسیدند'], ['خوردن حد ضرر', rt(A.stop, A.closed), ''], ['ورود نشد / ازدست‌رفته', fa(A.noEntry || 0, 0) + ' / ' + fa(A.missed || 0, 0), 'سیگنالی که هرگز اجرا نشد در Precision شمرده نمی‌شود'],
      ['Recall', 'محاسبه نمی‌شود', 'برای Recall باید همهٔ حرکت‌های صعودی بازار شمرده شود، نه فقط سیگنال‌های صادرشده؛ Recall روی پیش‌بینی‌های walk-forward (بخش ۳) گزارش می‌شود']])
      : h('p', { class: 'small muted', text: 'هنوز سیگنال واقعی بسته‌شده‌ای نیست؛ این بخش با گذشت زمان پر می‌شود.' }));
    out.push(h('h3', { text: '۲. بک‌تست استراتژی‌ها (walk-forward، جدا از اعتبارسنجی سیگنال)' }));
    var ks = Object.keys(SGs).sort(); out.push(ks.length ? table(['بازار · افق', 'استراتژی منتخب (champion)', 'معاملات', 'موفقیت', 'PF', 'شارپ', 'بیشینهٔ افت', 'برون‌نمونه'], ks.map(function (k) { var s = SGs[k], r = s.sel ? s.rows[s.sel] : null, p = k.split('|');
      return [(TE.MKFA[p[0]] || p[0]) + ' · ' + (TE.HZ[p[1]] ? TE.HZ[p[1]].fa.split(' ')[0] : p[1]), r ? r.fa : 'بدون استراتژی پایدار', r ? fa(r.n, 0) : '—', r ? pct(r.hit, 0) : '—', r ? fa(r.pf, 2) : '—', r && isFinite(r.sharpe) ? fa(r.sharpe, 2) : '—', r ? fa(r.mdd, 1) + 'R' : '—', r && r.oos && r.oos.n ? fa(r.oos.n, 0) + ' معامله · ' + fa(r.oos.avgR, 2) + 'R · PF ' + fa(r.oos.pf, 2) : '—']; }))
      : h('p', { class: 'small muted', text: 'بک‌تست اجرا نشده است (مرکز به‌روزرسانی → به‌روزرسانی کامل یا اجرای محاسبات).' }));
    out.push(h('h3', { text: '۳. خطای پیش‌بینی (احتمال بالاتر بودن قیمت، walk-forward)' }));
    var agg = {}; K.items.forEach(function (x) { (x.prob || []).forEach(function (q) { if (!isFinite(q.brier)) return; var g = agg[q.h] = agg[q.h] || { n: 0, b: 0, bb: 0, sk: 0, pc: 0, pw: 0, rc: 0, rw: 0 }; g.n++; g.b += q.brier; g.bb += q.brierBase; if (q.skill) g.sk++;
      if (isFinite(q.prec) && q.nCall) { g.pc += q.prec * q.nCall; g.pw += q.nCall; } if (isFinite(q.rec)) { g.rc += q.rec; g.rw++; } }); });
    var hs = Object.keys(agg).sort(function (a, b) { return a - b; });
    out.push(hs.length ? table(['افق (جلسه)', 'دارایی', 'Brier مدل', 'Brier نرخ پایه', 'مهارت (BSS)', 'دارای مهارت معنادار', 'Precision (p ≥ ۶۰٪)', 'Recall'], hs.map(function (k) { var g = agg[k], bm = g.b / g.n, bb = g.bb / g.n;
      return [fa(+k, 0), fa(g.n, 0), fa(bm, 3), fa(bb, 3), pct(1 - bm / bb, 1), fa(g.sk, 0) + ' از ' + fa(g.n, 0), g.pw ? pct(g.pc / g.pw, 0) : '—', g.rw ? pct(g.rc / g.rw, 0) : '—']; }))
      : h('p', { class: 'small muted', text: 'پیش‌بینی walk-forward برای هیچ دارایی‌ای محاسبه نشده (حداقل ۳۰۰ جلسه داده لازم است).' }));
    out.push(h('p', { class: 'small muted', text: 'Brier کمتر بهتر است؛ BSS مثبت یعنی مدل از «نرخ پایه» (سهم دوره‌های صعودی گذشته) بهتر بوده. «مهارت معنادار» فقط وقتی است که آزمون Diebold–Mariano هم t ≥ ۲ بدهد؛ بدون آن ابزار فقط نرخ پایه را نشان می‌دهد. Precision و Recall روی همان پیش‌بینی‌های بیرون از نمونهٔ آموزش حساب شده‌اند.' }));
    out.push(h('h3', { text: '۵. تشخیص کف و سقف (ارزیابی جدا از سایر سیگنال‌ها)' }));
    var TC = K.tzCal || {}, tk = Object.keys(TC), RGF = { up: 'صعودی', down: 'نزولی', flat: 'خنثی', none: 'نامشخص' };
    out.push(tk.length ? table(['بازار · نوع', 'نمونه (برآورد / سنجش)', 'محدوده بر حسب ATR (صدک ۲۵–۷۵)', 'نقطهٔ برگشت داخل محدوده', 'خطای فاصله (میانه، ATR)', 'رسیدن به سطح اول', 'زمان تا کف/سقف (میانه، جلسه)', 'تأیید برگشت رخ داد', 'برگشت کاذب', 'میانگین R معاملهٔ برگشتی', 'به تفکیک روند بلندمدت (داخل محدوده)'],
      [].concat.apply([], tk.map(function (k) { return ['down', 'up'].map(function (sd) { var c = TC[k][sd]; if (!c || !c.nOS) return null;
        return [(TE.POOLFA[k] || TE.MKFA[k] || k) + ' · ' + (sd === 'down' ? 'کف (روند نزولی)' : 'سقف (روند صعودی)'), fa(c.nIS, 0) + ' / ' + fa(c.nOS, 0), fa(c.q25, 1) + ' تا ' + fa(c.q75, 1), pct(c.hit, 0), fa(c.err, 1), pct(c.l1, 0), fa(c.bars, 0), pct(c.conf, 0), pct(c.fake, 0) + ' از ' + fa(c.nConf, 0), fa(c.avgR, 2) + 'R',
          Object.keys(c.byRg).map(function (g) { var q = c.byRg[g]; return (RGF[g] || g) + ' ' + pct(q.hit / q.n, 0) + ' (' + fa(q.n, 0) + ')'; }).join(' · ')]; }).filter(Boolean); })))
      : h('p', { class: 'small muted', text: 'دادهٔ کافی برای ارزیابی نیست (حداقل ۲۶۰ جلسه برای هر دارایی).' }));
    out.push(h('p', { class: 'small muted', text: 'روش: در هر ' + fa(3, 0) + ' جلسه که دارایی در روند نزولی یا صعودی بود، حرکت ' + fa(TE.TZH, 0) + ' جلسهٔ بعد (تا پایین‌ترین کف یا بالاترین سقف) بر حسب ATR ثبت شد. محدوده از ۷۰٪ اول تاریخچه برآورد شده و همهٔ نرخ‌ها روی ۳۰٪ آخر (برون‌نمونه) است. محدودهٔ صدک ۲۵ تا ۷۵ اگر کالیبره باشد حدود ۵۰٪ موارد را می‌گیرد؛ عدد بسیار کمتر یعنی محدوده‌ها زودهنگام یا دیرهنگام‌اند. معاملهٔ برگشتی: ورود با بسته‌شدن آن سوی بیشینه/کمینهٔ ۱۰ جلسه پس از نقطهٔ برگشت، حد ضرر نیم ATR آن سوی نقطهٔ برگشت، هدف ۲R، حداکثر ' + fa(TE.TZH, 0) + ' جلسه؛ «کاذب» یعنی حد ضرر پیش از هدف خورد. اگر برگشت کاذب بالا یا میانگین R منفی باشد، امتیاز فرصت از «تأیید برگشت» تقویت نمی‌شود (شرط: حداقل ۳۰ تأیید و برگشت کاذب کمتر از ۵۰٪).' }));
    out.push(h('h3', { text: '۶. قیمت و زمان (دو بُعد جدا: دقت قیمت و دقت زمان)' }));
    var prow = []; tk.forEach(function (k) { ['down', 'up'].forEach(function (sd) { var c = TC[k][sd], q = c && c.pt; if (!q) return; var f = q.fp[1][1];
      prow.push([(TE.POOLFA[k] || TE.MKFA[k] || k) + ' · ' + (sd === 'down' ? 'نزولی' : 'صعودی'), fa(f.nIS, 0) + ' / ' + fa(f.nOS, 0), pct(f.reachOS, 0), isFinite(f.q25) ? fa(f.q25, 0) + ' تا ' + fa(f.q75, 0) + ' جلسه' : '—', pct(f.inW, 0), pct(f.early, 0) + ' / ' + pct(f.late, 0), fa(f.mae, 0),
        f.pOS.slice(1).map(function (v) { return pct(v, 0); }).join(' / '), q.tc.nOS ? pct(q.tc.pOS, 0) + ' (' + fa(q.tc.nOS, 0) + ')' : '—', isFinite(q.age.revOld) ? pct(q.age.revOld, 0) + ' در برابر ' + pct(q.age.revAll, 0) + ' (' + fa(q.age.nOld, 0) + ')' : '—']); }); });
    out.push(prow.length ? table(['بازار · روند', 'نمونه (برآورد / سنجش)', 'رسیدن به هدف ۲ ATR پیش از ابطال ۲ ATR (۶۰ جلسه)', 'بازهٔ زمانی پیش‌بینی‌شده', 'تحقق داخل بازهٔ زمانی (از موارد رسیده)', 'زودتر / دیرتر از بازه', 'خطای زمان (میانه، جلسه)', 'سناریوها ۱/۲/۳/۴ تا پایان بازه', 'اصلاح زمانی: شکست هم‌جهت با روند بزرگ‌تر', 'برگشت پس از روند «پیر» (سن > صدک ۷۵) در برابر همه'], prow) : h('p', { class: 'small muted', text: 'دادهٔ کافی نیست.' }));
    var REG = U.store.get(TE.PTKEY, null);
    if (REG && REG.done && REG.done.length) { var cc = { inWin: 0, early: 0, late: 0, inv: 0, dirOkTimeMiss: 0, miss: 0 }; REG.done.forEach(function (q) { if (cc[q.res] != null) cc[q.res]++; }); var nn = REG.done.length;
      out.push(table(['نتیجهٔ پیش‌بینی‌های ثبت‌شده (زنده)', 'تعداد', 'سهم'], [['قیمت درست، زمان درست (داخل بازه)', fa(cc.inWin, 0), pct(cc.inWin / nn, 0)], ['قیمت درست، زودتر از بازه', fa(cc.early, 0), pct(cc.early / nn, 0)], ['قیمت درست، دیرتر از بازه', fa(cc.late, 0), pct(cc.late / nn, 0)],
        ['جهت درست ولی هدف تا پایان بازه نرسید (خطای زمان)', fa(cc.dirOkTimeMiss, 0), pct(cc.dirOkTimeMiss / nn, 0)], ['هدف نرسید و جهت هم غلط بود', fa(cc.miss, 0), pct(cc.miss / nn, 0)], ['ابطال پیش از هدف', fa(cc.inv, 0), pct(cc.inv / nn, 0)], ['هنوز باز (در انتظار نتیجه)', fa(REG.open.length, 0), '—']]));
    } else out.push(h('p', { class: 'small muted', text: 'ثبت زنده از همین نسخه آغاز شد: هر پیش‌بینی هدف اول با بازهٔ زمانی‌اش ذخیره و پس از پایان بازه در دو بُعد قیمت و زمان سنجیده می‌شود.' + (REG ? ' پیش‌بینی‌های باز: ' + fa(REG.open.length, 0) + '.' : '') }));
    out.push(h('p', { class: 'small muted', text: 'روش: در هر ۳ جلسه از تاریخچهٔ هر دارایی در روند صعودی یا نزولی، اولین جلسه‌ای که قیمت ۱، ۲، ۳، ۵ و ۸ ATR در جهت روند و ۰٫۵ تا ۳ ATR خلاف آن رفت ثبت شد (پنجرهٔ ۶۰ جلسه). بازهٔ زمانی هر هدف از ۷۰٪ اول تاریخچه برآورد و روی ۳۰٪ آخر سنجیده شده است. اصلاح زمانی = دست‌کم ۵ جلسه از آخرین سقف/کف و برگشت کمتر از ۲۳٫۶٪ موج قبلی؛ اصلاح قیمتی = برگشت ≥ ۳۸٫۲٪. فیبوناچی زمانی و چرخه‌های طیفی پیاده نشده‌اند چون اعتبار برون‌نمونه‌شان سنجیده نشده؛ سن روند فقط وقتی امتیاز را کم می‌کند که در دادهٔ برون‌نمونه برگشت پس از روند پیر دست‌کم ۵ واحد درصد بیشتر بوده باشد.' }));
    out.push(h('h3', { text: '۴. چرخهٔ انتشار مدل و تغییرات' }));
    var SH = (V.selHist || []).slice().reverse().slice(0, 12), LG = (E.learn && E.learn.log || []).slice().reverse().slice(0, 8);
    out.push(!SH.length && !LG.length ? h('p', { class: 'small muted', text: 'هنوز تغییری ثبت نشده: استراتژی منتخب هیچ بازار و افقی عوض نشده و تنظیم یادگرفته‌شده‌ای اعمال نشده است.' }) : table(['زمان', 'نوع', 'تغییر', 'دلیل / منشأ'], SH.map(function (q) { var p = q.key.split('|'); return [new Date(q.at).toLocaleString('fa-IR'), 'استراتژی منتخب (نسخهٔ اعتبارسنجی ' + fa(q.ver, 0) + ')', (TE.MKFA[p[0]] || p[0]) + ' · ' + (TE.HZ[p[1]] ? TE.HZ[p[1]].fa.split(' ')[0] : p[1]) + ': ' + (q.was ? (TE.STRFA[q.was] || q.was) : '—') + ' ← ' + (q.sel ? TE.STRFA[q.sel] || q.sel : 'بدون استراتژی'), q.why || '—']; })
      .concat(LG.map(function (x) { return [new Date(x.at).toLocaleString('fa-IR'), 'تنظیم یادگرفته‌شده', x.ch.join('؛ '), x.note || '—']; }))));
    out.push(h('p', { class: 'small muted', text: 'ضد بیش‌برازش: انتخاب استراتژی روی داده‌ای که تا همان روز در دسترس بوده (walk-forward)، با بخش برون‌نمونه؛ استراتژی جدید فقط وقتی جایگزین می‌شود که با فاصلهٔ معنادار (هیسترزیس ۲۵٪) بهتر باشد؛ قفل و بازگشت به نسخهٔ قبل در «وضعیت اعتبار و اعتبارسنجی سیگنال» و بازگشت آخرین تنظیم در «پیشنهادهای اصلاح» است. تغییر خودکار تنظیمات فقط وقتی انجام می‌شود که «اعمال خودکار» را روشن کرده باشید. ویژگی‌های بازار ایران که در موتور لحاظ شده: دامنهٔ نوسان روزانه، صف خرید و فروش، تعطیلات و جلسه‌های رسمی، تفاوت قیمت پایانی و آخرین معامله.' }));
    return ctx.panel('ارزیابی مدل پس از هر به‌روزرسانی' + (db && db.at ? ' — آخرین اعتبارسنجی ' + new Date(db.at).toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' }) : ''), out);
  }
  function learnTab(ctx) {
    var S = ctx.S, E = ensure(S), X = ctx.R.X; S.j = S.j || []; S.lp = S.lp || 0;
    var L = TE.learnStats(S.j, BT, S.lp), P = TE.learnPropose(L, E), Bk = TB(), GN = { trend: 'روندی', range: 'رنج', vol: 'پرنوسان', other: 'نامشخص' };
    var per = G.form({ id: 'te-lp', onChange: ctx.rerender, fields: [{ key: 'p', label: 'دورهٔ بازبینی', options: [['0', 'همهٔ سابقه'], ['30', '۳۰ روز اخیر'], ['90', '۹۰ روز اخیر'], ['180', '۶ ماه اخیر']], get: function () { return String(S.lp); }, set: function (v) { S.lp = Number(v); } },
      { key: 'a', label: 'اعمال خودکار اصلاح‌ها', options: [['no', 'خیر — من هر پیشنهاد را تأیید می‌کنم (پیشنهادی)'], ['yes', 'بله — در چارچوب محدودیت‌ها خودکار اعمال شود']], get: function () { return E.learn.auto ? 'yes' : 'no'; }, set: function (v) { E.learn.auto = v === 'yes'; }, help: 'در هر دو حالت: حداقل ۲۰ معامله برای هر تغییر، حداکثر ۱۰٪ تغییر وزن در هر گام، محدودهٔ ۰٫۵ تا ۱٫۵، ثبت در دفتر تغییرات و قابل بازگشت.' }] });
    var intro = ctx.panel('چرخهٔ یادگیری مستمر', [h('p', { class: 'f-help', text: '۱) هر سیگنال خرید یا پرهیز روی دادهٔ واقعی، با برنامه و رأی مدل‌هایش در دفتر ثبت می‌شود. ۲) در اجراهای بعدی، با داده‌های تازه و همان قواعد بک‌تست نتیجه‌اش سنجیده می‌شود (ورود شد یا نه، حد ضرر، اهداف، خروج زمانی، بیشترین سود و زیان بین راه). ۳) دلیل موفقیت یا شکست برچسب می‌خورد و الگوهای تکراری استخراج می‌شود. ۴) بر اساس معاملات بسته‌شده، اصلاح‌های کوچک و محدود پیشنهاد می‌شود: وزن هر مدل در هر رژیم، حداقل اطمینان، توقف خرید در رژیم زیان‌ده، و کاهش ریسک پس از افت. خطای روانی را ماشین نمی‌بیند؛ آن را در «اجرای واقعی من» خودتان ثبت کنید.' }),
      per, table(['سیگنال ثبت‌شده', 'بسته‌شده', 'باز / در انتظار', 'ورود نشد', 'شواهد قابل استفاده (واقعی ×۲ + بک‌تست خارج از نمونه)'], [[fa(L.all, 0), fa(L.live.n || 0, 0), fa(L.pending, 0), fa(L.unfilled, 0), fa(L.nEv, 0) + (BT ? '' : ' — بک‌تست اجرا نشده؛ برای شواهد بیشتر زبانهٔ بک‌تست را اجرا کنید')]]),
      L.live.n < TE.LMIN ? h('p', { class: 'warn-t', text: 'هنوز کمتر از ' + fa(TE.LMIN, 0) + ' معاملهٔ واقعی بسته شده است. تا آن زمان پیشنهادها بیشتر بر بک‌تست تکیه دارند و باید با احتیاط خوانده شوند.' }) : null]);
    var perf = ctx.panel('عملکرد واقعی سیگنال‌ها', [table(['منبع', 'تعداد', 'نرخ موفقیت', 'میانگین R (ریسک به ریوارد تحقق‌یافته)', 'ضریب سود', 'حداکثر افت'], [st4('سیگنال‌های واقعی بسته‌شده', L.live), st4('۲۰ معاملهٔ واقعی اخیر', L.last20), st4('بک‌تست خارج از نمونه', L.sim)]),
      h('p', { class: 'small muted', text: 'میانگین بیشترین سود بین راه: ' + (isFinite(L.mfe) ? fa(L.mfe, 2) + 'R' : '—') + ' · بیشترین زیان بین راه: ' + (isFinite(L.mae) ? fa(L.mae, 2) + 'R' : '—') + ' · سیگنال‌های «پرهیز/بستن» درست: ' + (L.bear.n ? fa(L.bear.ok, 0) + ' از ' + fa(L.bear.n, 0) : '—') }),
      h('h3', { text: 'به تفکیک شرایط بازار در زمان سیگنال' }), table(['رژیم', 'تعداد', 'نرخ موفقیت', 'میانگین R', 'ضریب سود', 'حداکثر افت'], L.byRegime.length ? L.byRegime.map(function (g) { return st4(TE.REG[g.k] || g.k, g); }) : [['—', '', '', '', '', '']]),
      h('h3', { text: 'به تفکیک قدرت، اطمینان، دارایی و نوع خروج' }), table(['گروه', 'تعداد', 'نرخ موفقیت', 'میانگین R', 'ضریب سود', 'حداکثر افت'],
        L.byStrength.map(function (g) { return st4('قدرت: ' + g.k, g); }).concat(L.byConf.map(function (g) { return st4('اطمینان ' + g.k + ' (واقعی + بک‌تست)', g); })).concat(L.byClass.map(function (g) { return st4('دارایی: ' + (CLS[g.k] || g.k), g); })).concat(L.byExit.map(function (g) { return st4('خروج: ' + (EXITFA[g.k] || g.k), g); })))]);
    var pat = ctx.panel('الگوهای تکراری', [h('h3', { text: 'دلایل موفقیت و شکست (برچسب خودکار)' }), L.reasons.length ? table(['الگو', 'تکرار', 'میانگین نتیجه'], L.reasons.slice(0, 14).map(function (r) { return [r.k, fa(r.n, 0), fa(r.r / r.n, 2) + 'R']; })) : h('p', { class: 'muted', text: 'هنوز معاملهٔ بسته‌شده‌ای نیست.' }),
      h('h3', { text: 'هر مدل در هر رژیم: هم‌رأیی با آن چقدر سود داشت؟' }), L.models.length ? table(['مدل', 'رژیم', 'معامله', 'واقعی', 'لبه (R)', 'پس از تعدیل نمونه', 'ضریب فعلی'], L.models.slice(0, 40).map(function (a) { var m = Bk.get(a.m), cur = (E.learn.wr[a.g] && E.learn.wr[a.g][a.m]) || 1; return [m ? m.fa : a.m, GN[a.g], fa(a.n, 0), fa(a.live, 0), h('span', { class: a.edge >= 0 ? 'good-t' : 'crit-t', 'data-notr': '1', text: fa(a.edge, 2) }), fa(a.shrunk, 2), fa(cur, 2)]; })) : h('p', { class: 'muted', text: '—' }),
      h('p', { class: 'small muted', text: 'لبه = میانگین (جهت رأی مدل × نتیجهٔ معامله بر حسب R). مثبت یعنی وقتی مدل موافق بود معامله‌ها بهتر و وقتی مخالف بود بدتر بودند. تعدیل نمونه: لبه × n ÷ (n + ۳۰).' })]);
    var applyBtn = function (list, label, cls) { return h('button', { class: 'btn ' + (cls || ''), type: 'button', text: label, onclick: function () { var ch = TE.learnApply(E, list, 'تأیید دستی'); U.toast(fa(ch.length, 0) + ' تغییر اعمال شد.', 'good'); ctx.rerender(); } }); };
    var prop = ctx.panel('پیشنهادهای اصلاح (' + fa(P.length, 0) + ')', [P.length ? table(['نوع', 'تغییر', 'شواهد', ''], P.map(function (p) {
      var kind = { weight: 'وزن مدل', block: 'فیلتر ورود', minConf: 'حداقل اطمینان', risk: 'مدیریت ریسک' }[p.kind], m = p.m && Bk.get(p.m);
      var chg = p.kind === 'weight' ? (m ? m.fa : p.m) + ' در رژیم ' + GN[p.g] + ': ' + fa(p.from, 2) + ' ← ' + fa(p.to, 2) : p.kind === 'block' ? (p.to ? 'توقف خرید در ' : 'آزادسازی خرید در ') + (TE.REG[p.rg] || p.rg) : p.kind === 'minConf' ? fa(p.from, 0) + '٪ ← ' + fa(p.to, 0) + '٪' : 'ضریب ریسک ' + fa(p.from, 2) + ' ← ' + fa(p.to, 2);
      return [kind, chg, p.why, applyBtn([p], 'اعمال')]; })) : h('p', { class: 'muted', text: 'با شواهد فعلی تغییری پیشنهاد نمی‌شود (یا نمونه کافی نیست، یا تنظیمات فعلی با نتایج سازگار است).' }),
      P.length ? h('div', { class: 'row-ctl' }, [applyBtn(P, 'اعمال همهٔ پیشنهادها', 'primary')]) : null,
      h('h3', { text: 'تنظیمات یادگرفته‌شدهٔ فعلی' }), list([
        'ضریب‌های وزن: ' + (Object.keys(E.learn.wr).map(function (g) { return GN[g] + ' → ' + Object.keys(E.learn.wr[g]).map(function (m) { var b = Bk.get(m); return (b ? b.fa : m) + ' ×' + fa(E.learn.wr[g][m], 2); }).join('، '); }).join(' | ') || 'هنوز تغییری نکرده'),
        'رژیم‌های متوقف برای خرید: ' + (Object.keys(E.learn.block).map(function (k) { return TE.REG[k] || k; }).join('، ') || 'هیچ'), 'ضریب ریسک: ' + fa(isFinite(E.learn.riskMult) ? E.learn.riskMult : 1, 2) + ' · حداقل اطمینان: ' + fa(E.minConf, 0) + '٪']),
      h('h3', { text: 'دفتر تغییرات' }), (E.learn.log || []).length ? table(['زمان', 'تغییرها', 'منشأ'], E.learn.log.slice().reverse().slice(0, 12).map(function (x) { return [new Date(x.at).toLocaleString('fa-IR'), x.ch.join('؛ '), x.note || '']; })) : h('p', { class: 'muted', text: 'تغییری ثبت نشده است.' }),
      (E.learn.log || []).length ? h('div', { class: 'row-ctl' }, [h('button', { class: 'btn ghost', type: 'button', text: 'بازگشت آخرین تغییر', onclick: function () { TE.learnRevert(E); ctx.rerender(); } })]) : null]);
    // journal with the trader's own execution record
    var rows = S.j.slice().reverse().slice(0, 60).map(function (j) {
      var inp = function (k, w) { var i = h('input', { class: 'cell-in', type: 'text', inputmode: 'decimal', style: 'width:' + w + 'px', 'aria-label': k, value: j[k] == null ? '' : String(j[k]) }); i.addEventListener('change', function () { var v = Number(String(i.value).replace(/[٬,]/g, '')); j[k] = i.value.trim() === '' || !isFinite(v) ? null : v; var Rr = j.e && j.stop ? j.e - j.stop : (j.lo + j.hi) / 2 - j.stop; j.ar = isFinite(j.ae) && isFinite(j.ax) && j.ae && j.ax && Rr > 0 ? (j.ax - j.ae) / Rr : null; saveState(S); }); return i; };
      var sel = h('select', { class: 'cell-in', 'aria-label': 'برچسب اجرا' }, TAGS.map(function (t) { return h('option', { value: t[1] === '—' ? '' : t[1], text: t[1] }); })); sel.value = j.tag || ''; sel.addEventListener('change', function () { j.tag = sel.value; saveState(S); });
      var note = h('input', { class: 'cell-in', type: 'text', style: 'width:160px', 'aria-label': 'یادداشت', value: j.note || '' }); note.addEventListener('change', function () { j.note = note.value; saveState(S); });
      return [j.d, j.sym, j.type === 'long' ? 'خرید' : 'پرهیز', fa(j.conf, 0) + '٪', TE.REG[j.rg] || j.rg, STFA[j.st] || j.st, isFinite(j.r) ? h('span', { class: j.r > 0 ? 'good-t' : 'crit-t', 'data-notr': '1', text: fa(j.r, 2) + 'R' }) : '—', EXITFA[j.exit] || j.exit || '—', (j.diag || []).join('؛ ') || '—', inp('ae', 80), inp('ax', 80), isFinite(j.ar) && j.ar != null ? fa(j.ar, 2) + 'R' : '—', sel, note]; });
    var jr = ctx.panel('دفتر سیگنال‌ها و اجرای واقعی من', [h('p', { class: 'f-help', text: 'شش ستون آخر را خودتان پر کنید: قیمت ورود و خروج واقعی، و اینکه طبق برنامه عمل کردید یا نه. اختلاف نتیجهٔ واقعی با برنامه («شکاف اجرا») خطای رفتاری را به عدد تبدیل می‌کند.' }),
      rows.length ? table(['تاریخ سیگنال', 'نماد', 'نوع', 'اطمینان', 'رژیم', 'وضعیت', 'نتیجهٔ برنامه', 'خروج', 'دلیل', 'ورود واقعی', 'خروج واقعی', 'نتیجهٔ واقعی', 'نحوهٔ اجرا', 'یادداشت'], rows) : h('p', { class: 'muted', text: 'هنوز سیگنالی روی دادهٔ واقعی ثبت نشده است. پس از به‌روزرسانی داده، سیگنال‌ها خودکار ثبت می‌شوند.' }),
      L.tags.length ? table(['نحوهٔ اجرا', 'تعداد', 'میانگین شکاف اجرا (واقعی − برنامه)'], L.tags.map(function (t) { return [t.k, fa(t.n, 0), t.g ? fa(t.gap / t.g, 2) + 'R' : '—']; })) : null,
      S.j.length ? h('div', { class: 'row-ctl' }, [h('button', { class: 'btn ghost', type: 'button', text: 'پاک‌کردن دفتر', onclick: function () { if (!this.dataset.armed) { this.dataset.armed = '1'; this.textContent = 'تأیید: همهٔ سابقهٔ سیگنال‌ها پاک می‌شود'; return; } S.j = []; ctx.rerender(); } })]) : null]);
    var ta = h('textarea', { class: 'f-area', rows: 3, 'aria-label': 'پرامپت بازبینی' });
    var rev = ctx.panel('بازبینی دوره با هوش مصنوعی (اختیاری)', [h('p', { class: 'f-help', text: 'آمار، الگوها، برچسب‌های اجرا و یادداشت‌های شما را برای یک بازبینی نوشتاری (خطاهای تحلیلی و روانی، آزمایش‌های دورهٔ بعد) آماده می‌کند. خروجی پیشنهاد است؛ تغییر قواعد فقط از جدول بالا و با شواهد عددی انجام می‌شود.' }),
      h('div', { class: 'row-ctl' }, [h('button', { class: 'btn', type: 'button', text: 'کپی پرامپت بازبینی', onclick: function () { var p = learnPrompt(L, E, S); if (navigator.clipboard) navigator.clipboard.writeText(p).then(function () { U.toast('کپی شد.', 'good'); }, function () { ta.value = p; }); else ta.value = p; } })]), ta]);
    var evp = null; try { evp = evalPanel(ctx); } catch (e) { evp = h('p', { class: 'warn-t', text: 'خطا در ارزیابی مدل: ' + e.message }); }
    return ctx.group([intro, evp, perf, pat, prop, jr, rev]);
  }

  /* ---------- Excel ---------- */
  function excel(b, X, E) {
    var opt = { rightToLeft: true }, put = function (sh, r, vals, kind) { vals.forEach(function (v, i) { sh.put(1 + i, r, v == null || (typeof v === 'number' && !isFinite(v)) ? '' : v, kind || (typeof v === 'number' ? 'calc' : 'wrap'), typeof v === 'number' ? (Math.abs(v) < 10 && v % 1 ? 'dec' : 'money') : undefined); }); };
    var s1 = b.sheet('سیگنال‌ها', [2, 10, 22, 12, 22, 8, 22, 9, 12, 12, 12, 12, 12, 12, 8, 8, 9, 9, 16, 18, 60, 50, 50], opt);
    s1.title('سیگنال‌های موتور معامله‌گری', 'حالت: ' + E.mode + ' · ' + new Date().toLocaleString('fa-IR') + (X.sample ? ' · بخشی از داده نمونه است' : '') + ' · توصیهٔ سرمایه‌گذاری نیست');
    put(s1, 4, ['نماد', 'نام', 'نوع دارایی', 'نوع سیگنال', 'قدرت', 'وضعیت', 'اطمینان', 'ورود از', 'ورود تا', 'حد ضرر', 'هدف ۱', 'هدف ۲', 'هدف ۳', 'R:R ۱', 'R:R ۲', 'وزن', 'ریسک', 'تعداد', 'افق', 'دلایل', 'شرایط', 'ابطال'], 'hdr');
    X.cards.forEach(function (c, i) { var r = 5 + i; var rd = function (v) { return Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100; }; put(s1, r, [c.sym, c.name, CLS[c.cls] || c.cls, c.typeFa, c.strength, c.status, c.conf, rd(c.lo), rd(c.hi), rd(c.stop), rd(c.tp1), rd(c.tp2), rd(c.tp3), Math.round(c.rr1 * 100) / 100, Math.round(c.rr2 * 100) / 100, c.posPct, c.riskPct, isFinite(c.units) ? c.units : '', c.horizon.fa, c.top.map(function (x) { return x.why; }).join('؛ '), c.why.concat(c.cond).join('؛ '), c.inval.join('؛ ')]);
      s1.put(16, r, c.posPct || 0, 'calc', 'pct'); s1.put(17, r, c.riskPct || 0, 'calc', 'pct2'); });
    var s2 = b.sheet('سبد پیشنهادی', [2, 10, 18, 14, 12, 12, 14, 14, 14], opt); s2.title('سبد پیشنهادی', 'ریسک کل ' + pct(X.pf.heat, 2) + ' · نقد ' + pct(X.pf.cash, 1));
    put(s2, 4, ['نماد', 'گروه', 'اطمینان', 'وزن', 'ریسک', 'تعداد', 'ورود', 'حد ضرر'], 'hdr');
    X.pf.pick.forEach(function (c, i) { put(s2, 5 + i, [c.sym, c.sector, c.conf, c.posPct, c.riskPct, isFinite(c.units) ? c.units : '', c.entry, c.stop]); s2.put(4, 5 + i, c.posPct, 'calc', 'pct'); s2.put(5, 5 + i, c.riskPct, 'calc', 'pct2'); });
    var y = 7 + X.pf.pick.length; put(s2, y, ['خارج از سبد', 'دلیل'], 'hdr'); X.pf.out.forEach(function (x, i) { put(s2, y + 1 + i, [x.c.sym, x.why]); });
    var yw = y + 3 + X.pf.out.length; put(s2, yw, ['فهرست انتظار', 'اطمینان', 'مانع', 'وزن در صورت فعال شدن', 'شرط ورود'], 'hdr'); X.pf.watch.forEach(function (w, i) { put(s2, yw + 1 + i, [w.c.sym, w.c.conf, w.why, w.c.potPct, w.trig]); s2.put(5, yw + 1 + i, w.c.potPct, 'calc', 'pct'); });
    var yf = yw + 3 + X.pf.watch.length; put(s2, yf, ['قیف انتخاب', 'باقی‌مانده', 'دلیل'], 'hdr'); X.pf.funnel.forEach(function (f, i) { put(s2, yf + 1 + i, [f[0], f[1], f[2]]); });
    var s0 = b.sheet('برنامهٔ اقدام', [2, 6, 16, 14, 80, 30], opt); s0.title('خروجی حالت: ' + X.mode.fa, X.mode.does);
    put(s0, 4, ['#', 'نوع اقدام', 'نماد', 'اقدام', 'زمان'], 'hdr'); X.plan.forEach(function (a, i) { put(s0, 5 + i, [i + 1, a.kind, a.asset, a.act, a.when]); });
    var s3 = b.sheet('پایش موقعیت‌ها', [2, 10, 14, 14, 12, 10, 60, 14], opt); s3.title('پایش موقعیت‌ها');
    put(s3, 4, ['نماد', 'ورود', 'آخرین', 'سود/زیان', 'R', 'اقدام', 'حد ضرر جدید'], 'hdr'); X.mon.forEach(function (m, i) { put(s3, 5 + i, [m.p.asset, Number(m.p.entry) || '', m.close, m.pl, m.r, m.act, m.newStop || '']); if (isFinite(m.pl)) s3.put(4, 5 + i, m.pl, 'calc', 'pct'); });
    var K = X.risk, s4 = b.sheet('ریسک', [2, 40, 20, 20, 16], opt); s4.title('ریسک', 'وضعیت: ' + K.state);
    put(s4, 4, ['سنجه', '۹۵٪', '۹۹٪'], 'hdr'); put(s4, 5, ['VaR تاریخی (ریال)', K.var95, K.var99]); put(s4, 6, ['VaR پارامتریک (ریال)', K.pvar95, K.pvar99]);
    put(s4, 8, ['سناریوی فشار', 'سود/زیان (ریال)', 'درصد سرمایه', 'بدون داده'], 'hdr'); K.stress.forEach(function (s, i) { put(s4, 9 + i, [s.name, s.pnl, isFinite(s.pct) ? s.pct : '', s.miss]); });
    y = 11 + K.stress.length; put(s4, y, ['قاعده', 'مقدار'], 'hdr'); K.rules.forEach(function (r, i) { put(s4, y + 1 + i, r); });
    var s5 = b.sheet('مدل‌ها', [2, 30, 16, 14, 10, 10, 60, 50], opt); s5.title('بانک مدل‌ها و وزن‌ها');
    put(s5, 4, ['مدل', 'خانواده', 'وضعیت', 'وزن پایه', 'وزن شما', 'منطق', 'منبع'], 'hdr');
    TB().M.forEach(function (m, i) { put(s5, 5 + i, [m.fa, TB().FAM[m.fam], TB().ST[m.st], TE.BASEW[m.id] != null ? TE.BASEW[m.id] : '', E.off[m.id] ? 'خاموش' : (E.w[m.id] != null ? E.w[m.id] : ''), m.logic, m.src]); });
    if (BT) { var s6 = b.sheet('بک‌تست', [2, 30, 10, 10, 12, 12, 12, 10], opt); s6.title('بک‌تست', 'مرز درون/خارج از نمونه: ' + BT.split);
      put(s6, 4, ['دوره', 'تعداد', 'نرخ برد', 'میانگین R', 'ضریب سود', 'حداکثر افت R', 'روز'], 'hdr');
      [['درون نمونه', BT.IS], ['خارج از نمونه', BT.OOS], ['کل', BT.all]].forEach(function (x, i) { var s = x[1]; put(s6, 5 + i, [x[0], s.n || 0, s.hit, s.avgR, s.pf, s.mdd, s.days]); if (s.n) s6.put(3, 5 + i, s.hit, 'calc', 'pct'); });
      put(s6, 9, ['مدل', 'تعداد OOS', 'میانگین R OOS', 'نتیجه'], 'hdr'); BT.rules.forEach(function (r, i) { put(s6, 10 + i, [r.m, r.oos.n || 0, r.oos.avgR, r.ok ? 'شواهد مثبت' : 'ندارد']); }); }
    var dbx = E.val && E.val.db; if (dbx) { var sv = b.sheet('اعتبارسنجی', [2, 30, 10, 10, 10, 12, 12, 12, 16, 10, 12, 12], opt); sv.title('اعتبارسنجی (الزام ۱۲)', 'نسخه ' + dbx.ver + ' · داده تا ' + TE.shamsi(dbx.asOf) + ' · مرز خارج از نمونه ' + TE.shamsi(dbx.split));
      put(sv, 4, ['نمونه', 'معامله', 'نرخ برد', 'ضریب سود', 'امید ریاضی R', 'حداکثر افت R', 'خارج از نمونه (تعداد)', 'خارج از نمونه R', 't (ماهانه)', 'هزینه ×۲ R', 'بازده سالانه'], 'hdr');
      Object.keys(dbx.pools).filter(function (k) { return k === 'all' || k.indexOf('c:') === 0; }).forEach(function (k, i) { var p = dbx.pools[k], o = p.oos || {}; put(sv, 5 + i, [k, p.n, p.hit, p.pf, p.avgR, p.mdd, o.n || 0, o.avgR, p.tc, p.c2, p.retAnn]); });
      var yv = 7 + Object.keys(dbx.pools).length; put(sv, yv, ['محدودیت‌های بک‌تست'], 'hdr'); TE.VLIM.forEach(function (l, i) { sv.put(1, yv + 1 + i, l, 'wrap'); });
      var yc = yv + 3 + TE.VLIM.length; put(sv, yc, ['نماد', 'نوع', 'درجه', 'نمونهٔ شواهد', 'معامله', 'امید ریاضی خارج از نمونه R', 'دلیل درجه'], 'hdr');
      X.cards.filter(function (c) { return c.val; }).forEach(function (c, i) { var v = c.val; put(sv, yc + 1 + i, [c.sym, c.typeFa, v.grade, v.pool, v.ev ? v.ev.n : '', v.ev && v.ev.oos ? v.ev.oos.avgR : '', v.reasons.concat(v.caps).join('؛ ')]); }); }
    // signal validation gate: one row per asset × horizon with the Signal ID, Validation ID and every check; and the strategy selection per market × horizon
    try { var DK = X.decide().desk; if (DK) { var sg = b.sheet('اعتبار سیگنال', [2, 12, 10, 12, 26, 22, 30, 34, 10, 10, 10, 10, 12, 60], opt); sg.title('وضعیت اعتبار و اعتبارسنجی سیگنال', 'هر سیگنال فقط با گذشتن از هر هشت کنترل «معتبر» است؛ درون‌روزی: داده وصل نیست');
      put(sg, 4, ['دارایی', 'بازار', 'افق', 'استراتژی', 'وضعیت', 'شناسهٔ سیگنال', 'شناسهٔ اعتبارسنجی', 'معاملات', 'Win Rate', 'PF', 'MDD (R)', 'OOS (R)', 'کنترل‌های ردشده'], 'hdr'); var yy = 5;
      DK.items.forEach(function (x) { ['s', 'm', 'l'].forEach(function (hh) { var g = x.hzs && x.hzs[hh]; if (!g) return; var r = g.row || {}; put(sg, yy++, [x.sym, x.mk, g.fa.split(' ')[0], g.kfa || '—', g.status, g.sigId, g.valId || '—', r.n || '', r.hit, r.pf, r.mdd, r.oos && r.oos.n ? r.oos.avgR : '', g.chk.filter(function (c) { return !c.ok; }).map(function (c) { return c.t; }).join('؛ ')]); }); });
      yy += 2; put(sg, yy++, ['بازار / افق', 'استراتژی منتخب', 'قبلی', 'قفل', 'دلیل'], 'hdr'); Object.keys(DK.strat || {}).sort().forEach(function (k) { var q = DK.strat[k]; put(sg, yy++, [k, q.sel ? TE.STRFA[q.sel] : 'هیچ', q.was ? TE.STRFA[q.was] : '', q.locked ? 'بله' : '', q.why]); });
      yy += 2; put(sg, yy++, ['تاریخچهٔ انتخاب', 'نسخه', 'زمان', 'منتخب', 'قبلی', 'دلیل'], 'hdr'); ((E.val && E.val.selHist) || []).forEach(function (q) { put(sg, yy++, [q.key, q.ver, new Date(q.at).toISOString().slice(0, 16), q.sel ? TE.STRFA[q.sel] : 'هیچ', q.was ? TE.STRFA[q.was] : '', q.why]); }); } } catch (e) { /* the gate sheet is optional; the rest of the workbook is unaffected */ }
    var JR = (X.journal || []); var s8 = b.sheet('دفتر یادگیری', [2, 12, 10, 8, 8, 14, 12, 10, 14, 60, 12, 12, 16, 30], opt); s8.title('دفتر سیگنال‌ها و نتیجه', 'نتیجه بر حسب R (ریسک اولیه)');
    put(s8, 4, ['تاریخ', 'نماد', 'نوع', 'اطمینان', 'رژیم', 'وضعیت', 'نتیجه R', 'خروج', 'دلیل', 'ورود واقعی', 'خروج واقعی', 'نحوهٔ اجرا', 'یادداشت'], 'hdr');
    JR.slice().reverse().forEach(function (j, i) { put(s8, 5 + i, [j.d, j.sym, j.type === 'long' ? 'خرید' : 'پرهیز', j.conf, TE.REG[j.rg] || j.rg, STFA[j.st] || j.st, isFinite(j.r) ? Math.round(j.r * 100) / 100 : '', EXITFA[j.exit] || j.exit || '', (j.diag || []).join('؛ '), j.ae || '', j.ax || '', j.tag || '', j.note || '']); });
    var s7 = b.sheet('فرض‌ها', [2, 46, 22, 60], opt); s7.title('فرض‌ها و قواعد'); var A = E.acct;
    put(s7, 4, ['فرض', 'مقدار', 'توضیح'], 'hdr');
    [['ریسک هر معامله', A.riskPct, 'درصد سرمایه؛ متوسط و مشروط نصف، پرنوسان نصف، بحران صفر'], ['حداکثر وزن موقعیت', A.maxPosPct, ''], ['حداکثر ریسک کل', A.maxHeat, ''], ['سقف وزن گروه', A.sectorCap, ''], ['نوسان هدف', A.targetVol, 'وزن ≤ سقف × نوسان هدف ÷ نوسان دارایی'],
      ['حداقل R:R تا هدف ۲', A.minRR, ''], ['دامنهٔ نوسان (فرض)', A.limitPct, 'از مقررات روز بررسی شود'], ['هزینهٔ رفت‌وبرگشت', A.costPct, 'کارمزد + مالیات + لغزش'], ['حداقل ارزش معاملات روزانه (ریال)', A.minVal, ''], ['حداقل اطمینان', E.minConf, ''], ['اطمینان قوی', E.strongConf, '+ هم‌سویی ≥ ۳ خانواده']]
      .forEach(function (r, i) { s7.put(1, 5 + i, r[0], 'wrap'); s7.put(2, 5 + i, r[1], 'in', r[1] < 1 && r[1] > 0 ? 'pct2' : 'money'); s7.put(3, 5 + i, r[2], 'wrap'); });
  }

  /* ---------- trading tools (embedded, existing) ---------- */
  var TOOLS = [['market-data', 'مرکز دادهٔ بازار'], ['sig-stocks', 'سیگنال سهام'], ['sig-gold', 'سیگنال طلا و سکه'], ['sig-fx', 'سیگنال ارز و تتر'], ['sig-options', 'سیگنال اختیار معامله'], ['position', 'اندازهٔ موقعیت و ریسک'], ['rm-trading', 'نقشهٔ راه معامله‌گری']];
  var NOTE = 'همان ابزار مستقل با دادهٔ ذخیره‌شدهٔ خودش؛ هر تغییری اینجا در موتور سیگنال هم دیده می‌شود.';

  function sample() { return { version: 1, tool: 'trading-engine', settings: { lang: 'auto' }, sources: {}, e: TE.defaults(), f: { type: 'act', cls: 'all', n: 30 } }; }
  function run(S) {
    var E = ensure(S);
    var X = TE.run(E), ch = [];
    // learning loop: log new real-data signals, grade the ones whose outcome is now known, optionally apply bounded changes
    S.j = S.j || []; E.learn = Object.assign({ wr: {}, block: {}, riskMult: 1, log: [], auto: false }, E.learn || {});
    var added = TE.journalAdd(S.j, X.cards, { market: X.market && X.market.rg }), graded = TE.journalEval(S.j, X.zmap, E);
    if (E.learn.auto && graded) { var last = E.learn.log[E.learn.log.length - 1]; if (!last || Date.now() - last.at > 20 * 3600e3) { var pr = TE.learnPropose(TE.learnStats(S.j, BT, 0), E); if (pr.length) TE.learnApply(E, pr, 'خودکار'); } }
    if (added || graded) { try { U.store.set('hub.tradingEngine.v1', S); } catch (e) { /* storage full */ } }
    X.learn = { added: added, graded: graded };
    if (X.sample) ch.push({ level: 'warning', msg: 'بخشی از داده‌ها نمونه است؛ سیگنال‌های آن غیرقابل اجراست.' });
    if (/^اضطراری/.test(X.risk.state)) ch.push({ level: 'critical', msg: X.risk.state }); else if (/^کاهش/.test(X.risk.state)) ch.push({ level: 'warning', msg: X.risk.state });
    if (!X.n) ch.push({ level: 'warning', msg: 'هیچ دارایی با دادهٔ کافی نیست.' });
    return { X: X, checks: ch };
  }
  var TEDEF = {
    id: 'trading-engine', title: 'Trading & intelligent signals', sections: ['trading'], priority: -20, version: 1, storeKey: 'hub.tradingEngine.v1', noFile: true,
    summary: 'One engine over all trading data: market regime, 23 voting models in one ensemble, standard actionable signals (entry, stop, three targets, R:R, size, confidence, horizon, reasons, invalidation, Iran execution notes), portfolio construction, position monitoring, VaR and stress tests, out-of-sample back-test, six test scenarios, report and Excel.',
    sample: sample, blank: sample, run: run, scenarios: false,
    eyebrow: function () { return 'Trading · Intelligent signals'; }, heading: function () { return 'معامله‌گری و سیگنال‌های هوشمند'; }, filename: function () { return 'Trading_signals'; },
    xlsx: function (S, R) { var b = Hub.xl.book(root.ExcelJS, 'Trading'); R.X.journal = S.j || []; excel(b, R.X, ensure(S)); return b.wb; },
    kpis: function (ctx) { var X = function () { return ctx.R.X; }; return [
      ['Mode', function () { return X().mode.fa.split(' (')[0]; }, function () { return 'خروجی: زبانهٔ «خروجی حالت انتخابی»'; }],
      ['Buy signals', function () { return fa(X().counts.long, 0); }, function () { return 'قوی ' + fa(X().counts.strong, 0) + ' · بستن ' + fa(X().counts.close, 0); }],
      ['Index regime', function () { return X().market ? TE.REG[X().market.rg] : '—'; }, function () { var v = (X().idxv || [])[0], e = v && v.trx && v.trx.s; return 'شاخص کل بورس (میان‌مدت: ADX ≥ ۲۰ و قیمت بالای میانگین ۵۰ روزهٔ رو به بالا)' + (e && e.sub ? ' — کوتاه‌مدت ' + e.fa + ': ' + e.subTxt : ''); }],
      ['Portfolio', function () { return fa(X().pf.pick.length, 0) + ' خرید · ' + fa(X().pf.watch.length, 0) + ' انتظار'; }, function () { return 'ریسک کل ' + pct(X().pf.heat, 2) + ' · نقد ' + pct(X().pf.cash, 0); }],
      ['Account risk', function () { return X().risk.state.split(/[:(]/)[0].trim(); }, function () { return isFinite(X().risk.dd) ? 'افت ' + pct(X().risk.dd, 1) : 'سرمایه را وارد کنید'; }]]; },
    tabs: [{ group: 'Intelligent trading', items: [['dash', 'داشبورد', dashTab], ['run', 'اجرا، تنظیمات و داده', runTab], ['plan', 'خروجی حالت انتخابی', planTab], ['sig', 'سیگنال‌ها', sigTab], ['mk', 'بازارها و موتور مرکزی', mkTab], ['pf', 'ساخت سبد', pfTab], ['pos', 'پایش موقعیت‌ها', posTab], ['risk', 'مدیریت ریسک', riskTab], ['models', 'بانک مدل‌ها', modelsTab], ['bt', 'بک‌تست', btTab], ['learn', 'یادگیری و بازبینی', learnTab], ['scen', 'سناریوهای آزمون', scenTab], ['report', 'گزارش', reportTab]] },
      { group: 'Trading tools', items: TOOLS.map(function (t) { return ['t-' + t[0], t[1], TK.embedTab(t[0], NOTE)]; }) }]
  };
  // phone: the light viewer (central record of the computer) unless the full engine was asked for in this session
  if (viewerMode()) TK.define(Object.assign({}, TEDEF, { run: function () { return viewR() || { X: { viewer: true, n: 0 }, checks: [] }; }, kpis: function () { return []; },
    tabs: [{ group: 'Intelligent trading', items: [['phone', 'نمای سبک گوشی', phoneTab]] }] }));
  else TK.define(TEDEF);
  /* one engine run shared by every page (trading dashboard centre, alerts): recomputed only when the data, the settings or the journal change */
  var MEMO = null;
  /* ---------- phone viewer (2026-11-24, «هنوز خیلی سنگینه»): on a phone the engine is not run. The verdicts, levels, ranks and
     alerts are the central record the computer published (hub/data/central.json, ≈ 1.5 MB); the phone does not load 170 MB of stock
     history or run 1,000+ analyses. One tap runs the full engine on the phone for this session (heavy: iOS may close the app). ---------- */
  function fullOnPhone() { try { return sessionStorage.getItem('hub.fullEngine') === '1'; } catch (e) { return false; } }
  function viewerMode() { return !!(U.lite && U.lite()) && !fullOnPhone(); }
  function viewR() { var C = U.store.get('hub.central.v1', null); if (!C || !C.by) return null; var S0 = U.store.get('hub.tradingEngine.v1', null) || sample(), by = C.by, ks = Object.keys(by);
    var cnt = { long: 0, strong: 0, close: 0 }; ks.forEach(function (k) { if (by[k].tier === 'ok') cnt.long++; });
    return { X: { viewer: true, central: C, centralSaved: C, E: ensure(S0), zmap: {}, cards: [], list: [], n: ks.length, sample: false, counts: cnt, idxv: [], ixf: null, consistency: null, learn: {} }, checks: [] }; }
  function goFull() { try { sessionStorage.setItem('hub.fullEngine', '1'); } catch (e) { /* private mode */ } location.reload(); }
  function phoneTab(ctx) { return { el: phoneView(ctx) }; }
  function phoneView(ctx) {
    var C = U.store.get('hub.central.v1', null), D = Hub.dataSync, snap = D && D.lastPull ? D.lastPull() : null;
    if (!C || !C.by) return h('div', { class: 'panel' }, [h('p', { class: 'small', text: 'هنوز حکم مرکزی از کامپیوتر دریافت نشده است. روی کامپیوتر «به‌روزرسانی همه» و سپس «انتشار برای گوشی» را بزنید؛ این صفحه در باز شدن بعدی آن را می‌گیرد.' })]);
    var by = C.by, recs = Object.keys(by).map(function (k) { if (!by[k].key) by[k].key = k; return by[k]; }), age = C.at ? (Date.now() - C.at) / 36e5 : null;
    var nf = function (x) { return typeof x === 'number' && isFinite(x) ? fa(x, Math.abs(x) < 10 ? 2 : 0) : '—'; }, z = function (q) { return q && q.length === 2 ? nf(Math.min(q[0], q[1])) + ' – ' + nf(Math.max(q[0], q[1])) : '—'; };
    var by2 = function (t) { return recs.filter(function (r) { return r.tier === t; }).sort(function (a, b) { return (a.rank || 1e9) - (b.rank || 1e9); }); };
    var tbl = function (rows) { return h('div', { class: 'grid-wrap' }, [h('table', { class: 'grid aud' }, [h('thead', null, [h('tr', null, ['دارایی', 'وضعیت فرصت', 'قیمت', 'وضعیت اکنون', 'اقدام', 'محدودهٔ ورود', 'حد ضرر', 'هدف‌ها', 'موفقیت تاریخی', 'رتبه'].map(function (t) { return h('th', { class: 'lbl', text: t }); }))]),
      h('tbody', null, rows.map(function (r) { var lv = r.lv || {}; var e = Hub.central && Hub.central.entryNow ? Hub.central.entryNow(Object.assign({ key: r.key || ('s:' + r.sym) }, r), { C: C }) : null; var lf = Hub.central && Hub.central.life ? Hub.central.life(Object.assign({ key: r.key || ('s:' + r.sym) }, r), { C: C }) : null; return h('tr', null, [r.sym, lf ? lf.fa + (lf.isNew ? ' (جدید)' : '') : '—', nf(e && e.px || r.px) + (e && e.src === 'قیمت لحظه‌ای' ? ' (لحظه‌ای)' : ''), e && e.k !== 'none' ? (e.ok ? '✓ ' : '✗ ') + e.fa : '—', e && e.k !== 'none' && !e.ok ? 'خرید نکنید' : (r.actFa || '—'), z(lv.buy), nf(lv.stop), (lv.tp || []).map(nf).join(' / ') || '—', r.bt && r.bt.hit ? fa(100 * r.bt.hit, 0) + '٪ از ' + fa(r.bt.n, 0) : '—', r.rank ? fa(r.rank, 0) : '—'].map(function (c) { return h('td', { 'data-notr': '1', text: String(c) }); })); }))])]); };
    var ok = by2('ok'), wait = by2('wait');
    return h('div', null, [
      h('div', { class: 'panel' }, [h('h3', { text: 'نمای سبک گوشی' }), h('p', { class: 'small', 'data-notr': '1', text: 'در گوشی موتور اجرا نمی‌شود تا اپ سبک بماند و بسته نشود. حکم‌ها، سطوح و رتبه‌ها همان حکم مرکزی کامپیوتر است (یک مرجع برای هر دو).' }),
        h('p', { class: 'small', 'data-notr': '1', text: 'زمان محاسبه روی کامپیوتر: ' + (C.at ? new Date(C.at).toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' }) : 'نامعلوم') + (age != null ? ' (' + (age < 24 ? fa(age, 1) + ' ساعت' : fa(age / 24, 1) + ' روز') + ' پیش)' : '') + ' · ' + fa(recs.length, 0) + ' دارایی' }),
        age != null && age > 30 ? h('p', { class: 'small bad-t', 'data-notr': '1', text: 'حکم مرکزی بیش از یک روز پیش محاسبه شده است. برای تازه شدن: روی کامپیوتر «به‌روزرسانی همه» و «انتشار برای گوشی» (یا انتشار خودکار پس از به‌روزرسانی را روشن کنید).' }) : document.createTextNode(''),
        h('div', { class: 'row-ctl' }, [h('a', { class: 'btn primary', href: 'desk.html#trade-center/opp', text: 'مرکز جامع فرصت‌ها (همهٔ سیگنال‌ها با فیلتر)' }), h('button', { class: 'btn ghost', type: 'button', text: 'اجرای کامل موتور روی همین گوشی (سنگین)', onclick: function () { if (window.confirm('اجرای کامل موتور در گوشی حافظهٔ زیادی می‌گیرد و ممکن است iOS اپ را ببندد. ادامه می‌دهید؟')) goFull(); } })])]),
      h('div', { class: 'panel' }, [h('h3', { text: 'فرصت‌های خرید تأییدشده (' + fa(ok.length, 0) + ')' }), ok.length ? tbl(ok.slice(0, 40)) : h('p', { class: 'small', text: 'در حکم مرکزی فعلی فرصت تأییدشده‌ای نیست.' })]),
      h('div', { class: 'panel' }, [h('h3', { text: 'در انتظار تأیید (' + fa(wait.length, 0) + ')' }), wait.length ? tbl(wait.slice(0, 40)) : h('p', { class: 'small', text: '—' })])]); }
  function engineNow(force) {
    var S = U.store.get('hub.tradingEngine.v1', null) || sample(), u = U.store.get('hub.updrun.v1', null) || {}, ce = U.store.get('hub.central.v1', null) || {};
    var sig = [u.id, u.doneAt, JSON.stringify(S.e || {}).length, (S.j || []).length, FEEDIDS.map(feed).concat(SG.feeds).filter(Boolean).map(function (f) { var x = U.store.get(f.storeKey, null); return x && x.meta ? x.meta.asOfTs || x.meta.asOf || '' : ''; }).join(',')].join('|');
    if (!force && MEMO && MEMO.sig === sig && Date.now() - MEMO.at < 15 * 60e3) return MEMO.R;
    if (viewerMode()) { var VR = viewR(); if (VR) { MEMO = { sig: sig, at: Date.now(), R: VR }; return VR; } }
    var R = run(S); MEMO = { sig: sig, at: Date.now(), R: R };
    // directive 22 · 11, test 7: after every engine run the integrity monitor checks every section against the new central record
    if (Hub.integrity && !INTEG) { INTEG = setTimeout(function () { INTEG = null; try { Hub.integrity.run({ why: 'پس از اجرای موتور / به‌روزرسانی' }); } catch (e) { /* reported on the monitor page */ } }, 1500); }
    return R;
  }
  var INTEG = null;
  Hub.tradeUI = { sigText: sigText, excel: excel, aiPrompt: aiPrompt, engineNow: engineNow, engineMemo: function () { return MEMO ? MEMO.R.X || MEMO.R : null; }, clearMemo: function () { MEMO = null; } };
  // the phone widget's opportunity list, checked against the central record (rank and verdict)
  if (Hub.integrity) Hub.integrity.register('widget', 'ویجت گوشی (فرصت‌های برتر)', function () { var X = MEMO && (MEMO.R.X || MEMO.R); if (!X || !X.widget) return null; var W = X.widget(), C0 = Hub.central.get(); if (!W || !W.decision || !C0) return null;
    var bySym = {}; Object.keys(C0.by).forEach(function (k) { bySym[C0.by[k].sym + '|' + k] = k; });
    return { rows: (W.decision.opps || []).filter(function (o) { return o.rank != null || o.verdict; }).map(function (o) { var k = Object.keys(bySym).filter(function (q) { return q.indexOf(o.asset + '|') === 0; }).map(function (q) { return bySym[q]; })[0]; return k ? { key: k, sym: o.asset, rank: o.rank, ver: o.ver } : null; }).filter(Boolean) }; }, { fields: ['rank', 'ver'] });
})(typeof window !== 'undefined' ? window : globalThis);
