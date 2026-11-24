/* =====================================================================
 * IRAN MARKETS — financial analysis of Iran's economy and markets (tool id kept as `long-view`):
 *   the same reproducible reading on three horizons for every series
 *     short  : daily bars, last ~3 months        medium : weekly bars, last ~18 months        long : weekly bars, last ~5 years
 *     (log-scale regression channel with quantile bands, RSI(14) on the same bars, divergence between the last two swing highs / lows)
 *   series: TSE indices, free-market dollar, tether, euro, dirham, gold coin, 18k gold, world gold, bitcoin, Brent, plus ratios (index in dollars)
 *   time analysis for every series: dominant cycles, day counts and Fibonacci time ratios from the major pivots, merged into one calendar of key dates
 *   inflation context (user input) and real returns; a ready-to-edit market note; a plain-language guide to every model
 * The channel is a regression fit, not a hand-drawn line. Rule-based output, not investment advice.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub; if (!root.document || !Hub.toolkit || !Hub.longView || !Hub.signals) return;
  var U = Hub.util, h = U.h, G = Hub.grid, TK = Hub.toolkit, LV = Hub.longView, SG = Hub.signals, KEY = 'hub.longview.v1';
  function fa(x, d) { if (typeof x !== 'number' || !isFinite(x)) return '—'; var s = Math.abs(x) >= 1000 ? Math.round(x).toLocaleString('en-US') : x.toFixed(d == null ? (Math.abs(x) >= 100 ? 0 : 2) : d); return s.replace(/,/g, '٬').replace(/\./g, '٫').replace(/\d/g, function (c) { return '۰۱۲۳۴۵۶۷۸۹'[c]; }); }
  function pct(x, d) { return typeof x === 'number' && isFinite(x) ? (x > 0 ? '+' : '') + fa(x * 100, d == null ? 0 : d) + '٪' : '—'; }
  function sh(g) { var J = Hub.jalali, s = String(g || ''); return J && s.length === 8 ? J.jstr(J.g2d(+s.slice(0, 4), +s.slice(4, 6), +s.slice(6, 8))) : s; }
  var J = Hub.jalali;
  // name, kind, key, priced in foreign currency (no comparison with rial inflation)
  var ASSETS = [['شاخص کل بورس', 'tse-index', '32097828799138957'], ['شاخص هم‌وزن بورس', 'tse-index', '67130298613737946'], ['دلار آزاد تهران', 'tgju', 'price_dollar_rl'], ['تتر (USDT)', 'tgju', 'crypto-tether-irr'], ['یورو', 'tgju', 'price_eur'], ['درهم امارات', 'tgju', 'price_aed'],
    ['سکه امامی', 'tgju', 'sekee'], ['طلای ۱۸ عیار', 'tgju', 'geram18'], ['انس جهانی طلا', 'tgju', 'ons', true], ['بیت‌کوین (دلار)', 'tgju', 'crypto-bitcoin', true], ['نفت برنت', 'tgju', 'oil_brent', true], ['شاخص کل به دلار', 'ratio', 'شاخص کل بورس / دلار آزاد تهران', true]];
  var READ = { correction: ['احتمال اصلاح', 'fit-no'], stretched: ['نزدیک سقف کانال', 'fit-cond'], rebound: ['احتمال بازگشت صعودی', 'fit-rec'], depressed: ['نزدیک کف کانال', 'fit-cond'], weakening: ['تضعیف مومنتوم', 'fit-cond'], improving: ['بهبود مومنتوم', 'fit-rec'], 'trend-up': ['شیب کانال صعودی', 'sev-info'], 'trend-down': ['شیب کانال نزولی', 'sev-info'] };
  var ZONE = { top: 'نزدیک سقف', upper: 'نیمهٔ بالایی', mid: 'میانه', lower: 'نیمهٔ پایینی', bottom: 'نزدیک کف' };
  // plain-language reading of each model output: what happened, what it means, what to do (directive: decision-centric dashboard §3)
  var MEAN = {
    correction: ['قیمت نزدیک سقف کانال است و هم‌زمان قدرت خرید (RSI) در سقف تازه کمتر از سقف قبلی بوده است.', 'احتمال اصلاح یا توقف صعود بیشتر از معمول است؛ این یک هشدار است، نه سیگنال فروش قطعی.', 'خرید تازه نکنید؛ دارندگان حد ضرر را نزدیک کنند یا بخشی را بفروشند.'],
    stretched: ['قیمت در یک‌دهم بالایی کانال است (بیش از ۹۰٪ فاصلهٔ کف تا سقف).', 'فضای صعود تا سقف کانال کم است؛ ریسک به بازده برای خرید تازه نامناسب است.', 'منتظر اصلاح به سمت میانهٔ کانال بمانید؛ دارندگان نگه دارند.'],
    rebound: ['قیمت نزدیک کف کانال است و قدرت فروش در کف تازه کمتر از کف قبلی بوده است.', 'احتمال برگشت به سمت میانهٔ کانال بیشتر از معمول است؛ هنوز تأیید نشده.', 'خرید فقط پس از تأیید صعود (بسته‌شدن بالای سطح تأیید)؛ حد ضرر زیر کف اخیر.'],
    depressed: ['قیمت در یک‌دهم پایینی کانال است (کمتر از ۱۰٪ فاصلهٔ کف تا سقف).', 'ارزان نسبت به روند همین دوره، ولی روند نزولی هنوز می‌تواند ادامه یابد.', 'منتظر نشانهٔ برگشت بمانید؛ خرید پله‌ای فقط با حد ضرر روشن.'],
    weakening: ['قدرت حرکت صعودی کم شده است (RSI پایین‌تر از دورهٔ قبل یا شیب ضعیف‌تر).', 'احتمال ادامهٔ رشد کمتر از قبل است، اما سیگنال نزولی قطعی نیست.', 'خرید تازه با احتیاط و حجم کمتر؛ دارندگان نگه دارند و حد ضرر را رعایت کنند.'],
    improving: ['قدرت حرکت بهتر شده است.', 'احتمال ادامهٔ حرکت صعودی بیشتر شده، هنوز تأییدشده نیست.', 'روی سطح تأیید صعود منتظر شکست و تثبیت بمانید.'],
    'trend-up': ['شیب کانال صعودی است و قیمت در محدودهٔ عادی کانال حرکت می‌کند.', 'روند غالب صعودی است.', 'نگهداری؛ خرید در اصلاح به نیمهٔ پایینی کانال.'],
    'trend-down': ['شیب کانال نزولی است.', 'روند غالب نزولی است.', 'خرید نکنید؛ دارندگان در برگشت‌ها سبک کنند.'] };
  function rsiTxt(r) { if (!isFinite(r)) return '—'; return r >= 70 ? 'فشار خرید بالا (اشباع خرید)؛ به‌تنهایی سیگنال فروش نیست' : r >= 55 ? 'فشار خرید غالب' : r > 45 ? 'خنثی' : r > 30 ? 'فشار فروش غالب' : 'فشار فروش شدید (اشباع فروش)؛ به‌تنهایی سیگنال خرید نیست'; }
  function posLbl(x) { var p = x.pos * 100; return 'جایگاه در کانال ' + fa(p, 0) + '٪' + (p > 100 ? ' (بالای سقف)' : p < 0 ? ' (زیر کف)' : ''); }
  function posTxt(x) { var p = x.pos * 100; return fa(p, 0) + '٪ از کف تا سقف — قیمت ' + fa(x.last) + ' در کانال ' + fa(x.lo) + ' تا ' + fa(x.up) + (p > 100 ? ' (بالاتر از سقف کانال)' : p < 0 ? ' (پایین‌تر از کف کانال)' : ' (' + ZONE[x.zone] + ')'); }
  function dvTxt(x) { if (x.dv.bear) return 'واگرایی منفی: قیمت سقف بالاتری زد (' + fa(x.dv.bear.p1) + ' ← ' + fa(x.dv.bear.p2) + ') ولی RSI سقف پایین‌تری ساخت (' + fa(x.dv.bear.r1, 0) + ' ← ' + fa(x.dv.bear.r2, 0) + ')؛ روند صعودی ضعیف‌تر شده'; if (x.dv.bull) return 'واگرایی مثبت: قیمت کف پایین‌تری زد ولی RSI کف بالاتری ساخت؛ فشار فروش ضعیف‌تر شده'; return 'واگرایی ندارد'; }
  var HZ = [{ id: 's', name: 'کوتاه‌مدت', sub: 'حدود ۳ ماه · کندل روزانه', bars: 'd', key: 'sWin', def: 60, f: [5, 20], u: 'روز' }, { id: 'm', name: 'میان‌مدت', sub: 'حدود ۱۸ ماه · کندل هفتگی', bars: 'w', key: 'mWin', def: 78, f: [4, 13], u: 'هفته' }, { id: 'l', name: 'بلندمدت', sub: 'حدود ۵ سال · کندل هفتگی', bars: 'w', key: 'lWin', def: 260, f: [26, 52], u: 'هفته' }];
  function hz(id) { return HZ.filter(function (x) { return x.id === id; })[0] || HZ[2]; }
  var pack = function (rows) { return rows.map(function (r) { return [r.date, Math.round((r.open || r.close) * 1e4) / 1e4, Math.round((r.high || r.close) * 1e4) / 1e4, Math.round((r.low || r.close) * 1e4) / 1e4, Math.round(r.close * 1e4) / 1e4]; }); };
  var unpack = function (a) { return (a || []).map(function (r) { return Array.isArray(r) ? { date: r[0], open: r[1], high: r[2], low: r[3], close: r[4] } : r; }); };
  function series(S, name) { var d = (S.data || {})[name]; if (!d) return { w: [], d: [] }; if (Array.isArray(d)) return { w: unpack(d), d: [] }; return { w: unpack(d.w), d: unpack(d.d) }; }
  function gdate(jdn) { var g = J.d2g(jdn); return g.gy * 10000 + g.gm * 100 + g.gd; }
  function synthD(seed, n, start, drift, vol) { var s = seed, r = function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }, g = function () { return Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(6.2832 * r()); }, out = [], p = start, d0 = J.g2d(2026, 11, 10) - Math.round(n * 7 / 5);
    for (var i = 0; i < n; i++) { var o = p; p = p * Math.exp(drift + vol * g() + 0.004 * Math.sin(i / 37) + 0.003 * Math.sin(i / 11)); out.push({ date: gdate(d0 + Math.round(i * 7 / 5)), open: o, high: Math.max(o, p) * 1.004, low: Math.min(o, p) * 0.996, close: p }); } return out; }
  function store(rows) { return { w: pack(LV.weekly(rows)), d: pack(rows.slice(-900)) }; }
  function ensure(S) {
    if (!S.opt) S.opt = {}; ['sWin', 'mWin', 'lWin'].forEach(function (k, i) { if (!(S.opt[k] >= 0) || S.opt[k] === '') S.opt[k] = HZ[i].def; }); if (!S.opt.cover) S.opt.cover = 0.95; if (!S.opt.ahead) S.opt.ahead = 120;
    if (!S.macro) S.macro = {}; if (!S.hz) S.hz = 'm';
    if (!S.v2) { S.v2 = 1; ASSETS.forEach(function (a) { if (!S.assets.some(function (x) { return x.kind === a[1] && x.key === a[2]; })) S.assets.push({ name: a[0], kind: a[1], key: a[2], usd: !!a[3], active: true }); });
      S.assets.forEach(function (x) { if (x.key === 'ons') x.usd = true; }); }
    if (!S.v3) { S.v3 = 1; S.assets = S.assets.filter(function (x) { return !(x.kind === 'tse' && (x.key === '46348559193224090' || x.name === 'فولاد')); }); if (S.data) delete S.data['فولاد']; if (S.sel === 'فولاد') S.sel = S.assets[0] && S.assets[0].name; }
    if (!Array.isArray(S.tj)) S.tj = [];
    return S;
  }
  function sample() {
    var S = { version: 1, v2: 1, v3: 1, tj: [], tool: 'long-view', meta: { title: 'Iran markets', asOf: '', source: 'Illustrative synthetic data — press Fetch' }, settings: { lang: 'auto' }, sources: {},
      assets: ASSETS.map(function (a) { return { name: a[0], kind: a[1], key: a[2], usd: !!a[3], active: true }; }), data: {}, opt: { sWin: 60, mWin: 78, lWin: 260, cover: 0.95, ahead: 120 }, sel: ASSETS[0][0], hz: 'm',
      macro: { annual: 0.714, point: 0.835, monthly: 0.046, asOf: 'مهر ۱۴۰۵', src: 'اعداد واردشدهٔ شما (منبع اعلامی: مرکز آمار ایران) — پیش از انتشار با منبع رسمی تطبیق دهید' } };
    var st = [2.2e6, 6e5, 9e5, 9.2e5, 1.05e6, 2.5e5, 9e7, 8e6, 2600, 9e4, 75, 2.4];
    S.assets.forEach(function (a, i) { S.data[a.name] = store(synthD(11 + i * 7, 1500, st[i] / 4 || 1000, 0.0011 + 0.0002 * (i % 3), 0.013)); });
    return S;
  }
  /* ---------- data ---------- */
  function ratioRows(A, B) { var out = [], j = 0, lb = null; A.forEach(function (r) { while (j < B.length && B[j].date <= r.date) { lb = B[j]; j++; } if (lb && lb.close > 0 && r.close > 0) { var v = r.close / lb.close; out.push({ date: r.date, open: v, high: v, low: v, close: v }); } }); return out; }
  function fetchAll(S, progress) {
    ensure(S); var D = Hub.data, list = S.assets.filter(function (a) { return a.active !== false && a.name && a.key; }), data = {}, raw = {}, errs = [], live = S.meta && !/synthetic|Illustrative/i.test(S.meta.source || '');
    if (live) Object.keys(S.data || {}).forEach(function (k) { data[k] = S.data[k]; });
    var direct = list.filter(function (a) { return a.kind !== 'ratio'; }), ratios = list.filter(function (a) { return a.kind === 'ratio'; }), i = 0;
    var one = function () { if (i >= direct.length) return Promise.resolve(); var a = direct[i++]; progress && progress(i, direct.length, a.name);
      var code = null, q = a.kind === 'tse-index' ? D.tse.index(a.key) : a.kind === 'tse' ? (/^\d{10,}$/.test(a.key) ? Promise.resolve(a.key) : D.tse.resolve(a.key)).then(function (c) { code = c; return D.tse.daily(c, 3000); }).then(LV.adjust) : D.tgju(a.key);
      return q.then(function (rows) { rows = rows.filter(function (r) { return r.close > 0; }); rows = withToday(a, rows, code); if (rows.length < 60) throw new Error('فقط ' + rows.length + ' روز داده'); raw[a.name] = rows; data[a.name] = store(rows); }).catch(function (e) { errs.push(a.name + ': ' + e.message); }).then(one); };
    // today's value (provisional until the source publishes the day): TSETMC session snapshot for indices and symbols, TGJU current prices
    var LIVE = { s: null, t: null }, withToday = function (a, rows, code) { var l = rows[rows.length - 1], c = null, v;
      if (a.kind === 'tse-index' && LIVE.s) { v = a.key === '32097828799138957' ? LIVE.s.idx.total : a.key === '67130298613737946' ? LIVE.s.idx.ew : NaN; if (v > 0) c = { date: LIVE.s.date, close: v, high: v, low: v }; }
      else if (a.kind === 'tse' && LIVE.s && code) { var m = LIVE.s.by[String(code)]; if (m && m.trades > 0 && m.close > 0) c = { date: m.date, close: m.close, high: m.high, low: m.low }; }
      else if (a.kind !== 'tse' && a.kind !== 'tse-index' && LIVE.t) { var n0 = LIVE.t[a.key]; if (n0) c = { date: n0.date, close: n0.close, high: n0.high, low: n0.low }; }
      if (!c || !l || c.date < l.date || (c.date === l.date && !l.live)) return rows;
      var r = { date: c.date, open: l.date === c.date ? l.open : c.close, high: c.high, low: c.low, close: c.close, live: 1 }; rows = rows.slice(); if (l.date === c.date) rows[rows.length - 1] = r; else rows.push(r); return rows; };
    var pre = Promise.all([D.tse.session ? D.tse.session().then(function (x) { LIVE.s = x; }, function () { /* history only */ }) : 0, D.tgjuNow ? D.tgjuNow().then(function (x) { LIVE.t = x; }, function () { /* history only */ }) : 0]);
    return pre.then(function () { return Promise.all([one(), one(), one()]); }).then(function () {
      ratios.forEach(function (a) { var p = String(a.key).split('/').map(function (x) { return x.trim(); }), A = raw[p[0]], B = raw[p[1]];
        if (!A || !B) { if (!data[a.name]) errs.push(a.name + ': دو سری پایه دریافت نشد'); return; } var r = ratioRows(A, B); if (r.length >= 60) data[a.name] = store(r); else errs.push(a.name + ': هم‌پوشانی تاریخ کم است'); });
      S.data = data; if (errs.length >= list.length && list.length) throw new Error(SG.summErr(errs)); SG.stampData(S, 'TSETMC + TGJU'); S.lastErrs = errs.slice(0, 20); try { record(S); } catch (e) { /* the track record is optional */ } return errs; });
  }
  function family(a) { var k = String(a.key || ''); return a.kind === 'tse-index' || a.kind === 'tse' || a.kind === 'ratio' ? 'بورس' : /^crypto-tether|^price_/.test(k) ? 'ارز' : /^(sek|geram|gerami|mesghal|ons|nim|rob|silver)/.test(k) ? 'طلا' : /^crypto-/.test(k) ? 'رمزارز' : /oil/.test(k) ? 'نفت' : a.name; }
  /* ---------- learning: how did each kind of time window do on these series' own history? ---------- */
  function record(S) {
    var cls = {}, n = 0, used = 0;
    S.assets.forEach(function (a) { if (a.active === false || a.kind === 'ratio') return; var D = series(S, a.name); if (D.d.length < 340) return; var e = LV.evalWindows(D.d); used++; n += e.n;
      Object.keys(e.cls).forEach(function (k) { var q = cls[k] || (cls[k] = { n: 0, hit: 0, exp: 0, vr: 0, mv: 0, mvB: 0 }), z = e.cls[k]; Object.keys(q).forEach(function (f) { q[f] += z[f]; }); }); });
    S.tstat = { at: Date.now(), asOf: S.meta && S.meta.asOf, series: used, n: n, cls: cls, sample: !S.meta || /synthetic|Illustrative/i.test(S.meta.source || '') };
    // readings (channel position, divergence, trend) on each horizon: forward return after the reading vs after any tested bar
    var rs = {}; HZ.forEach(function (H) { var agg = { cls: {}, all: { n: 0, sum: 0, sq: 0, pos: 0 } };
      S.assets.forEach(function (a) { if (a.active === false) return; var D = series(S, a.name), src = H.bars === 'd' ? D.d : D.w; if (!src.length) return; var e = LV.evalReadings(src, { bars: H.bars, win: Number(S.opt[H.key]) || H.def, fwd: H.f[1], cover: Number(S.opt.cover) || 0.95 });
        ['n', 'sum', 'sq', 'pos'].forEach(function (f) { agg.all[f] += e.all[f]; }); Object.keys(e.cls).forEach(function (k) { var q = agg.cls[k] || (agg.cls[k] = { n: 0, sum: 0, sq: 0, pos: 0 }); ['n', 'sum', 'sq', 'pos'].forEach(function (f) { q[f] += e.cls[k][f]; }); }); });
      rs[H.id] = agg; });
    S.rstat = rs;
    return S.tstat;
  }
  // back-test counts + live journal (live outcomes count double); weight = shrunk lift, bounded 0.5…1.5
  function stats(S) {
    var out = {}, add = function (k, hit, exp, vr, n, live) { var q = out[k] || (out[k] = { n: 0, hit: 0, exp: 0, vr: 0, live: 0, liveHit: 0, mv: 0, mvB: 0 }); q.n += n; q.hit += hit; q.exp += exp; q.vr += vr; if (live) { q.live += n / 2; q.liveHit += hit / 2; } };
    var T = S.tstat && S.tstat.cls || {}; Object.keys(T).forEach(function (k) { add(k, T[k].hit, T[k].exp, T[k].vr, T[k].n); out[k].mv = T[k].mv; out[k].mvB = T[k].mvB; });
    (S.tj || []).forEach(function (j) { if (j.hit == null) return; add(j.c, 2 * j.hit, 2 * j.b, 2 * j.b * (1 - j.b), 2, true); });
    Object.keys(out).forEach(function (k) { var q = out[k]; q.rate = q.n ? q.hit / q.n : NaN; q.base = q.n ? q.exp / q.n : NaN; q.lift = q.exp > 0 ? q.hit / q.exp : NaN; q.z = q.vr > 0 ? (q.hit - q.exp) / Math.sqrt(q.vr) : 0;
      q.verdict = q.n < 20 ? 'few' : q.z >= 3 ? 'good' : q.z <= -2 ? 'bad' : 'none'; q.w = q.n < 20 || !isFinite(q.lift) ? 1 : Math.max(0.5, Math.min(1.5, 1 + (q.lift - 1) * q.n / (q.n + 50))); q.move = q.mvB > 0 ? q.mv / q.mvB : NaN; });
    return out;
  }
  var VERD = { few: ['نمونه کم است', 'sev-info'], good: ['بهتر از تصادف', 'fit-rec'], bad: ['بدتر از تصادف', 'fit-no'], none: ['فرقی با تصادف ندارد', 'sev-info'] };
  function clsName(k) { var m = k.split('-'); return m[0] === 'gann' ? 'شمارش ' + fa(+m[1], 0) + ' روز از سقف/کف اصلی (گن)' : m[0] === 'fib' ? 'نسبت زمانی فیبوناچی ' + m[1].replace('.', '٫').replace(/\d/g, function (c) { return '۰۱۲۳۴۵۶۷۸۹'[c]; }) : (m[0] === 'trough' ? 'کف چرخه' : 'قلهٔ چرخه') + (m[1] === 'short' ? ' (چرخه‌های تا ۱۵۰ روز)' : ' (چرخه‌های بلندتر از ۱۵۰ روز)'); }
  // live journal: every window due within 30 days is written down when first seen, and graded once 5 bars after its date exist
  function journal(S, A, D) {
    if (!A.tw || D.d.length < 60) return; var x = D.d, n = x.length, c = x.map(function (r) { return r.close; }), jd = x.map(function (r) { return LV.jdnOf(r.date); }), d0 = jd[n - 1], T = null, base = null, have = {};
    S.tj.forEach(function (j) { if (j.a === A.name) have[j.k] = 1; });
    A.tw.forEach(function (w) { if (w.days < 1 || w.days > 30) return; var cl = LV.winClass(w), tg = d0 + w.days, k = cl + '|' + (w.type === 'trough' || w.type === 'peak' ? Math.round(tg / 7) : tg); if (have[k]) return; have[k] = 1; S.tj.push({ a: A.name, k: k, c: cl, ty: w.type, tg: tg, is: d0, hit: null }); });
    S.tj.forEach(function (j) { if (j.a !== A.name || j.hit != null || j.tg > d0) return; if (!T) { T = LV.turns(c); var m = 0, b = { any: 0, lo: 0, hi: 0 }; for (var i = Math.max(0, n - 400); i <= T.last; i++) { m++; if (T.lo[i] || T.hi[i]) b.any++; if (T.lo[i]) b.lo++; if (T.hi[i]) b.hi++; } base = m ? { any: b.any / m, lo: b.lo / m, hi: b.hi / m } : { any: 0.4, lo: 0.2, hi: 0.2 }; }
      var k2 = 0; while (k2 < n && jd[k2] < j.tg) k2++; if (k2 >= n || k2 > T.last) return; if (jd[k2] - j.tg > 4) { j.hit = -1; return; }
      j.hit = LV.hitAt(T, { type: j.ty }, k2) ? 1 : 0; j.b = j.ty === 'trough' ? base.lo : j.ty === 'peak' ? base.hi : base.any; j.px = c[k2]; });
    S.tj = S.tj.filter(function (j) { return j.hit !== -1; }); if (S.tj.length > 1500) S.tj = S.tj.slice(-1500);
  }
  /* ---------- validity: what the literature says, and what these series' own history says ---------- */
  // reading record on one horizon: reads = classes pooled, sign = the direction the reading claims (−1 weaker than usual, +1 stronger)
  function rv(S, hid, reads, sign) {
    var A = S.rstat && S.rstat[hid]; if (!A || !A.all.n) return { v: 'na', n: 0 }; var q = { n: 0, sum: 0, pos: 0 }; reads.forEach(function (k) { var c = A.cls[k]; if (c) { q.n += c.n; q.sum += c.sum; q.pos += c.pos; } });
    var mAll = A.all.sum / A.all.n, sd = Math.sqrt(Math.max(1e-12, A.all.sq / A.all.n - mAll * mAll)); if (!q.n) return { v: 'na', n: 0, all: mAll };
    var m = q.sum / q.n, t = (m - mAll) / (sd / Math.sqrt(q.n)); return { n: q.n, mean: Math.exp(m) - 1, all: Math.exp(mAll) - 1, t: t, pos: q.pos / q.n, v: q.n < 20 ? 'few' : t * sign >= 3 ? 'ok' : t * sign <= -2 ? 'against' : 'none' };
  }
  function grp(ST, re) { var q = { n: 0, hit: 0, exp: 0, vr: 0 }; Object.keys(ST).forEach(function (k) { if (re.test(k)) ['n', 'hit', 'exp', 'vr'].forEach(function (f) { q[f] += ST[k][f]; }); }); q.rate = q.n ? q.hit / q.n : NaN; q.base = q.n ? q.exp / q.n : NaN; q.z = q.vr > 0 ? (q.hit - q.exp) / Math.sqrt(q.vr) : 0; q.v = !q.n ? 'na' : q.n < 20 ? 'few' : q.z >= 3 ? 'ok' : q.z <= -2 ? 'against' : 'none'; return q; }
  var VV = { na: 'هنوز محاسبه نشده', few: 'نمونه کم است', ok: 'در این داده تأیید شد', against: 'در این داده خلافش دیده شد', none: 'در این داده تأیید نشد (فرقی با حالت عادی ندارد)' };
  var REFS = ['Moskowitz, T. J., Ooi, Y. H., & Pedersen, L. H. (2012). Time series momentum. Journal of Financial Economics.',
    'Park, C.-H., & Irwin, S. H. (2007). What do we know about the profitability of technical analysis? Journal of Economic Surveys.',
    'Sullivan, R., Timmermann, A., & White, H. (1999). Data-snooping, technical trading rule performance, and the bootstrap. Journal of Finance.',
    'Rink, K. (2023). The predictive ability of technical trading rules: an empirical analysis of developed and emerging equity markets. Financial Markets and Portfolio Management.',
    'Batchelor, R., & Ramyar, R. (2006). Magic numbers in the Dow.',
    'Granger, C. W. J., & Morgenstern, O. (1963). Spectral analysis of New York stock market prices.',
    'Kitkanasiri, C., et al. (2025). Market efficiency and technical trading: an empirical study of MACD and RSI indicators in major Asian stock indices. ABAC Journal.',
    'Raissi, S., et al. (2011). Profitability of Iranian stock market based on technical analysis trading rules. Journal of Optimization in Industrial Engineering.'];
  var GRADE = { A: 'قوی', B: 'مختلط', C: 'ضعیف یا ردشده', D: 'تعریف حسابی', P: 'قاعدهٔ احتیاطی (عرف حرفه‌ای)' };
  function fmtRv(x, H) { return x.v === 'na' || !x.n ? VV.na : fa(x.n, 0) + ' مورد؛ میانگین بازده ' + fa(H.f[1], 0) + ' ' + H.u + ' بعد ' + pct(x.mean, 1) + ' در برابر ' + pct(x.all, 1) + ' عادی — ' + VV[x.v]; }
  function validity(S, ST) {
    var Hm = hz('m'), top = rv(S, 'm', ['stretched', 'correction'], -1), bot = rv(S, 'm', ['depressed', 'rebound'], 1), trU = rv(S, 'm', ['trend-up'], 1), dvB = rv(S, 'm', ['weakening', 'correction'], -1), dvU = rv(S, 'm', ['improving', 'rebound'], 1);
    var g = grp(ST, /^gann-/), f = grp(ST, /^fib-/), c = grp(ST, /^(trough|peak)-/), tw = function (q) { return q.v === 'na' ? VV.na : fa(q.n, 0) + ' مورد؛ برخورد با چرخش واقعی ' + fa(q.rate * 100, 0) + '٪ در برابر ' + fa(q.base * 100, 0) + '٪ تصادفی — ' + VV[q.v]; };
    return { top: top, bot: bot, trU: trU, dvB: dvB, dvU: dvU, gann: g, fib: f, cyc: c, cycleOk: c.v === 'ok', timeOk: g.v === 'ok' || f.v === 'ok' || c.v === 'ok',
      rows: [
        { m: 'ادامهٔ روند (شیب کانال میان‌مدت و بازده ۳ ماه هم‌جهت)', g: 'A', src: 'پایداری بازده ۱ تا ۱۲ ماهه در ۵۸ قرارداد آتی سهام، ارز، کالا و اوراق؛ برگشت جزئی در افق‌های بلندتر [۱]', own: fmtRv(trU, Hm), use: 'در خوانش کانال و مومنتوم حساب می‌شود' },
        { m: 'جایگاه در کانال (نزدیک سقف یا کف به‌عنوان نشانهٔ برگشت)', g: 'B', src: 'آزمون مستقیمی برای کانال رگرسیونی نیافتم. پشتوانهٔ غیرمستقیم: برگشت جزئی بازده در افق‌های بلندتر [۱]؛ مرور ۹۵ مطالعه: ۵۶ نتیجهٔ مثبت برای قواعد تکنیکال، با ایراد داده‌کاوی [۲][۳]؛ عملکرد قواعد در خارج از نمونه پایدار نبوده [۴]', own: 'سقف: ' + fmtRv(top, Hm) + ' | کف: ' + fmtRv(bot, Hm), use: top.v === 'against' && bot.v === 'against' ? 'از خوانش کانال و مومنتوم کنار گذاشته شد' : 'در خوانش کانال و مومنتوم حساب می‌شود؛ هر سمت که در داده خلافش دیده شود کنار می‌رود' },
        { m: 'RSI و واگرایی', g: 'B', src: 'در ده بازار آسیایی قواعد RSI و MACD بیشتر مواقع از خرید و نگه‌داری بهتر نبودند [۷]. دربارهٔ خودِ واگرایی مطالعهٔ معتبری نیافتم', own: 'واگرایی منفی: ' + fmtRv(dvB, Hm) + ' | مثبت: ' + fmtRv(dvU, Hm), use: 'با وزن ۱ در تمایل؛ هر سمت که در داده خلافش دیده شود کنار می‌رود' },
        { m: 'چرخه‌های زمانی (پریودوگرام، FLD)', g: 'C', src: 'تحلیل طیفی قیمت سهام نیویورک: حرکت کوتاه‌مدت با گام تصادفی سازگار است و مؤلفه‌های فصلی و چرخهٔ تجاری اهمیت ناچیزی دارند [۶]', own: tw(c), use: c.v === 'ok' ? 'چون در این داده تأیید شد، در تمایل حساب می‌شود' : 'در خوانش کانال و مومنتوم حساب نمی‌شود؛ فقط یادآور تاریخ' },
        { m: 'نسبت‌های زمانی فیبوناچی', g: 'C', src: 'در شاخص داوجونز، نسبت طول و مدت روندهای پیاپی بیش از حد تصادف دور نسبت‌های فیبوناچی جمع نمی‌شوند [۵]', own: tw(f), use: 'فقط یادآور تاریخ؛ در تمایل و سطوح نقشی ندارد' },
        { m: 'شمارش روز گن و مربع نُه', g: 'C', src: 'مطالعهٔ دانشگاهی معتبری که اثربخشی‌اش را نشان دهد نیافتم', own: tw(g), use: 'فقط یادآور تاریخ؛ در تمایل و سطوح نقشی ندارد' },
        { m: 'بازده واقعی = (۱ + بازده اسمی) ÷ (۱ + تورم) − ۱', g: 'D', src: 'تعریف است، نه فرضیه. دقتش به عدد تورم واردشده بستگی دارد', own: '—', use: 'مبنای مقایسهٔ دارایی‌ها با تورم' },
        { m: 'ریسک ۱٪ در هر معامله و حد ضرر بر پایهٔ ATR', g: 'P', src: 'قاعدهٔ رایج مدیریت ریسک؛ یافتهٔ علمی دربارهٔ عدد ۱٪ نیست', own: '—', use: 'حد بالای زیان هر تصمیم را محدود می‌کند' }] };
  }
  /* ---------- solution: scenarios, levels and action for one market around a key date (rule-based) ---------- */
  function plan(A, V) {
    V = V || {}; var m = A.h.m, sh2 = A.h.s, c0 = A.cy && A.cy.ok && A.cy.cycles[0], sc = 0, why = [], topOk = !V.top || V.top.v !== 'against', botOk = !V.bot || V.bot.v !== 'against';
    if (m.ok && isFinite(A.ret.m3)) { if (m.ch.b > 0 && A.ret.m3 > 0) { sc += 1; why.push('شیب کانال میان‌مدت و بازده ۳ ماه هر دو مثبت‌اند'); } else if (m.ch.b < 0 && A.ret.m3 < 0) { sc -= 1; why.push('شیب کانال میان‌مدت و بازده ۳ ماه هر دو منفی‌اند'); } }
    if (m.ok) { if (m.pos >= 0.65 && !topOk) why.push('نزدیکی به سقف کانال حساب نشد چون در دادهٔ همین بازارها خلافش دیده شده'); else if (m.pos <= 0.35 && !botOk) why.push('نزدیکی به کف کانال حساب نشد چون در دادهٔ همین بازارها خلافش دیده شده'); else if (m.pos >= 0.9) { sc -= 2; why.push('قیمت نزدیک سقف کانال میان‌مدت است'); } else if (m.pos >= 0.65) { sc -= 1; why.push('قیمت در نیمهٔ بالایی کانال میان‌مدت است'); } else if (m.pos <= 0.1) { sc += 2; why.push('قیمت نزدیک کف کانال میان‌مدت است'); } else if (m.pos <= 0.35) { sc += 1; why.push('قیمت در نیمهٔ پایینی کانال میان‌مدت است'); } }
    if (((m.ok && m.dv.bear) || (sh2.ok && sh2.dv.bear)) && !(V.dvB && V.dvB.v === 'against')) { sc -= 1; why.push('واگرایی منفی RSI دیده می‌شود'); } if (((m.ok && m.dv.bull) || (sh2.ok && sh2.dv.bull)) && !(V.dvU && V.dvU.v === 'against')) { sc += 1; why.push('واگرایی مثبت RSI دیده می‌شود'); }
    if (c0 && c0.strength >= 0.4 && V.cycleOk) { if (c0.phase < 0.5) { sc -= 1; why.push('چرخهٔ غالب در نیمهٔ نزولی است'); } else { sc += 1; why.push('چرخهٔ غالب در نیمهٔ صعودی است'); } }
    var r3 = A.ret && isFinite(A.ret.m3) ? A.ret.m3 : 0, lean = sc <= -2 ? 'dn' : sc >= 2 ? 'up' : sc === 1 ? 'upw' : sc === -1 ? 'dnw' : r3 > 0 ? 'upw' : r3 < 0 ? 'dnw' : 'flat', /* never a bare «no lean»: a weak lean is stated with its strength */ L = A.lv || {}, px = A.last, uniq = function (a) { return a.filter(function (v, i) { return isFinite(v) && a.indexOf(v) === i; }); };
    var dnT = uniq([sh2.ok && sh2.mid, sh2.ok && sh2.lo, m.ok && m.mid, m.ok && m.lo].filter(function (v) { return v && v < L.lo10 * 0.995; }).sort(function (a, b) { return b - a; })).slice(0, 2);
    var upT = uniq([sh2.ok && sh2.up, m.ok && m.up, m.ok && m.upF1].filter(function (v) { return v && v > L.hi10 * 1.005; }).sort(function (a, b) { return a - b; })).slice(0, 2);
    var stopL = L.lo10 - 0.5 * (L.atr || 0), riskL = L.hi10 > 0 ? L.hi10 / stopL - 1 : NaN;
    if (!sc && r3) why.push('شواهد هم‌وزن‌اند؛ جهت از بازده ۳ ماه (' + pct(r3) + ') گرفته شد و ضعیف است');
    var P2 = { lean: lean, why: why, lv: L, dnT: dnT, upT: upT, stopL: stopL, riskL: riskL, text: [] };
    if (!(L.hi10 > 0)) return P2;
    var MC = Hub.mktCal, W = MC ? MC.window(L.cls || 'tgju', L.lastD, 5, L.dates || []) : null, lastFa = W ? W.lastFa : '';
    P2.chk = MC ? MC.levels(px, L.hi10, L.lo10, L.atr, { src: 'بالاترین/پایین‌ترین قیمت پایانی ۱۰ جلسهٔ پیش از ' + lastFa, upAt: px > L.hi10 ? lastFa : null, dnAt: px < L.lo10 ? lastFa : null }) : null; P2.win = W;
    P2.when = W ? 'زمان‌بندی: مبنای قیمت «' + W.basis + '» (' + W.tz + ')؛ بررسی در ' + fa(W.n, 0) + ' جلسهٔ ' + W.startFa + ' تا ' + W.endFa + '، هر جلسه پس از ثبت قیمت پایانی؛ یک بسته‌شدن کافی است (قاعدهٔ این ابزار، بک‌تست نشده). ' + W.expiry + '. ' + W.note : '';
    P2.status = P2.chk ? 'وضعیت فعلی (قیمت پایانی ' + lastFa + ': ' + fa(px) + '): ' + P2.chk.fa + '؛ فاصله تا تأیید صعودی ' + pct(P2.chk.dUp, 1) + '، تا تأیید نزولی ' + pct(P2.chk.dDn, 1) + '.' + (P2.chk.checks.length ? ' کنترل: ' + P2.chk.checks.join('؛ ') + '.' : '') : '';
    P2.up = 'صعودی: اگر قیمت پایانی یکی از جلسه‌های ' + (W ? W.startFa + ' تا ' + W.endFa : 'پنج جلسهٔ بعد') + ' بالای ' + fa(L.hi10) + ' (بالاترین قیمت پایانی ۱۰ جلسهٔ پیش از ' + lastFa + ') بسته شود، حرکت صعودی تأیید می‌شود' + (upT.length ? '؛ سطوح بعدی: ' + upT.map(function (v) { return fa(v) + ' (' + pct(v / px - 1) + ')'; }).join(' و ') : '') + '.';
    if (P2.chk && P2.chk.state === 'above') P2.up = 'صعودی: تأیید شده — قیمت پایانی ' + lastFa + ' (' + fa(px) + ') بالای ' + fa(L.hi10) + ' (بالاترین قیمت پایانی ۱۰ جلسهٔ پیش از آن) بسته شد' + (upT.length ? '؛ سطوح بعدی: ' + upT.map(function (v) { return fa(v) + ' (' + pct(v / px - 1) + ')'; }).join(' و ') : '') + '. اگر قیمت پایانی یکی از جلسه‌های ' + (W ? W.startFa + ' تا ' + W.endFa : 'بعد') + ' دوباره زیر ' + fa(L.hi10) + ' بسته شود، تأیید شکست خورده است.';
    P2.dn = 'نزولی: اگر قیمت پایانی یکی از همین جلسه‌ها زیر ' + fa(L.lo10) + ' (پایین‌ترین قیمت پایانی ۱۰ جلسهٔ پیش از ' + lastFa + ') بسته شود، اصلاح تأیید می‌شود' + (dnT.length ? '؛ سطوح بعدی: ' + dnT.map(function (v) { return fa(v) + ' (' + pct(v / px - 1) + ')'; }).join(' و ') : '') + '.';
    if (P2.chk && P2.chk.state === 'below') P2.dn = 'نزولی: تأیید شده — قیمت پایانی ' + lastFa + ' (' + fa(px) + ') زیر ' + fa(L.lo10) + ' (پایین‌ترین قیمت پایانی ۱۰ جلسهٔ پیش از آن) بسته شد' + (dnT.length ? '؛ سطوح بعدی: ' + dnT.map(function (v) { return fa(v) + ' (' + pct(v / px - 1) + ')'; }).join(' و ') : '') + '. اگر قیمت پایانی یکی از جلسه‌های ' + (W ? W.startFa + ' تا ' + W.endFa : 'بعد') + ' دوباره بالای ' + fa(L.lo10) + ' بسته شود، تأیید شکست خورده است.';
    P2.flat = 'خنثی: اگر قیمت پایانی تا پایان جلسهٔ ' + (W ? W.endFa : 'پنجم') + ' بین ' + fa(L.lo10) + ' و ' + fa(L.hi10) + ' بماند، هیچ سناریویی تأیید نشده، سیگنال منقضی است و سطوح با دادهٔ تازه دوباره محاسبه می‌شوند.';
    P2.act = lean === 'dn' ? 'اقدام پیشنهادی مدل (تمایل نزولی): از ۳ روز پیش از تاریخ خرید تازه نکنید. حد ضرر موقعیت‌های باز را به ' + fa(stopL) + ' (کمی زیر کف ۱۰ روز) بیاورید. اگر قیمت زیر ' + fa(L.lo10) + ' بسته شد، یک‌سوم تا نصف موقعیت را ببندید و باقی را تا سطح بعدی نگه دارید.'
      : lean === 'up' ? 'اقدام پیشنهادی مدل (تمایل صعودی): پیش‌دستی نکنید؛ خرید فقط پس از بسته‌شدن بالای ' + fa(L.hi10) + '، در دو یا سه پله، با حد ضرر ' + fa(stopL) + ' (فاصلهٔ ورود تا حد ضرر حدود ' + pct(-riskL).replace('-', '') + ').'
      : lean === 'upw' ? 'اقدام پیشنهادی مدل (تمایل ضعیف صعودی): سناریوی محتمل‌تر ادامهٔ صعود است ولی شواهد قوی نیست؛ خرید فقط پس از بسته‌شدن بالای ' + fa(L.hi10) + '، با حجم نصف و حد ضرر ' + fa(stopL) + '. اگر زیر ' + fa(L.lo10) + ' بسته شد، دید صعودی باطل است.'
      : lean === 'dnw' ? 'اقدام پیشنهادی مدل (تمایل ضعیف نزولی): سناریوی محتمل‌تر افت است ولی شواهد قوی نیست؛ خرید تازه نکنید و حد ضرر موقعیت‌های باز را به ' + fa(stopL) + ' بیاورید. با بسته‌شدن بالای ' + fa(L.hi10) + ' دید نزولی باطل است.'
      : 'اقدام پیشنهادی مدل (بدون تمایل): موقعیت تازه نگیرید؛ روی ' + fa(L.hi10) + ' و ' + fa(L.lo10) + ' هشدار قیمت بگذارید و با شکست هر کدام طبق سناریوی همان سمت عمل کنید.';
    P2.risk = 'مدیریت ریسک: در هر معامله حداکثر ۱٪ سرمایه را ریسک کنید؛ حجم = ۱٪ سرمایه ÷ فاصلهٔ ورود تا حد ضرر. نوسان روزانهٔ معمول این بازار (ATR ۱۴ روزه) ' + fa(L.atr) + ' (' + pct(L.atr / px, 1).replace('+', '') + ') است؛ حد ضرر نزدیک‌تر از آن با نوسان عادی می‌خورد.';
    return P2;
  }
  /* directive 22: this page analyses series on three horizons; it does not issue trading signals of its own. For a series the central
     engine trades (gold, coins, currencies, shares; bitcoin and Brent from their world feeds), the verdict, confirmation levels, stop and
     action are the central record's — the model's channel levels stay as analysis. Series without a central record (indices, ratios …)
     keep a clearly marked analytic scenario. */
  var CENK = { 'crypto-bitcoin': 'x:btc', oil_brent: 'x:brent' };
  function cenKeyOf(A) { if (A.kind === 'tgju') return CENK[A.key] || 'g:' + A.key; if (A.kind === 'tse') return 's:' + A.key; return null; }
  function cenPlan(A) {
    var P2 = A.plan, C = Hub.central, k = cenKeyOf(A), r = k && C ? C.rec(k) : null; if (!P2) return;
    if (!r) { P2.act = 'اقدام: این صفحه حکم معاملاتی صادر نمی‌کند — ' + (k ? 'این دارایی اکنون حکم مرکزی ندارد' : 'این سری در موتور مرکزی معامله نمی‌شود') + (P2.lv && isFinite(P2.lv.hi10) ? '. فقط سطوح پایش: بسته‌شدن بالای ' + fa(P2.lv.hi10) + ' یا زیر ' + fa(P2.lv.lo10) + '.' : '.'); P2.noCen = true;
      P2.cen = null; P2.status = 'سناریوی تحلیلی این صفحه — ' + (k ? 'این دارایی اکنون رکورد مرکزی ندارد (' + (C ? C.whyNot(k) : '') + ')' : 'این سری در موتور مرکزی معامله نمی‌شود') + '؛ سطوح زیر سیگنال معاملاتی نیستند. ' + (P2.status || ''); return; }
    var p = C.present(Object.assign({ key: k }, r)), f = function (x) { return fa(x); };
    P2.cen = p; P2.status = 'حکم مرکزی (یکسان در همهٔ بخش‌ها): ' + p.actFa + ' — ' + p.stFa + (p.rank ? '؛ رتبهٔ ' + fa(p.rank, 0) : '') + (p.ver ? '؛ نسخهٔ ' + fa(p.ver, 0) : '') + (r.px != null ? '؛ قیمت مبنا ' + f(p.px) + ' (' + (p.date || '') + ')' : '') + (k.indexOf('x:') === 0 ? ' — قیمت مرکزی از منبع جهانی است و با قیمت TGJU این صفحه ممکن است فرق کند.' : '.');
    P2.up = 'تأیید صعود (مرکزی): ' + (p.up != null ? 'بسته‌شدن بالای ' + f(p.up) : 'سطح مرکزی ندارد') + (p.buy ? '؛ محدودهٔ ورود ' + f(p.buy[0]) + ' تا ' + f(p.buy[1]) : '');
    P2.dn = 'تأیید نزول (مرکزی): ' + (p.dn != null ? 'بسته‌شدن زیر ' + f(p.dn) : 'سطح مرکزی ندارد');
    P2.act = 'اقدام (مرکزی): ' + p.actFa + (p.tp.length ? '؛ اهداف ' + p.tp.map(f).join('، ') : '') + '. «' + (LEAN[P2.lean] || ['—'])[0] + '» فقط خوانش تحلیلی این صفحه است؛ روند و حکم نیست.';
    P2.stopL = p.stop != null ? p.stop : NaN; P2.lv = Object.assign({}, P2.lv, { hi10: p.up != null ? p.up : P2.lv.hi10, lo10: p.dn != null ? p.dn : P2.lv.lo10 }); P2.flat = 'بین دو سطح تأیید: تا عبور قیمت پایانی از یکی از سطوح مرکزی، حکم مرکزی همین است.';
    P2.risk = 'حد ضرر مرکزی: ' + (p.stop != null ? f(p.stop) : '—') + '. ' + (P2.risk || '');
  }
  /* directive 23 · 6-7: this is the page's channel-and-momentum reading, not the trend (one system rule: Hub.central.trend) and not a
     trading verdict (only the central engine issues one). The labels say so. */
  var LEAN = { dn: ['خوانش کانال و مومنتوم: نزولی (قوی)', 'fit-no'], up: ['خوانش کانال و مومنتوم: صعودی (قوی)', 'fit-rec'], dnw: ['خوانش کانال و مومنتوم: نزولی ضعیف', 'fit-cond'], upw: ['خوانش کانال و مومنتوم: صعودی ضعیف', 'fit-cond'], flat: ['خوانش کانال و مومنتوم: بدون جهت', 'sev-info'] };
  function retSince(rows, days) { if (!rows.length) return NaN; var t = rows[rows.length - 1], target = LV.jdnOf(t.date) - days, k = rows.length - 1; while (k > 0 && LV.jdnOf(rows[k].date) > target) k--; if (LV.jdnOf(rows[k].date) > target + 10 || LV.jdnOf(rows[k].date) < target - 20) return NaN; return t.close / rows[k].close - 1; }
  function run(S) {
    ensure(S); var cover = Number(S.opt.cover) || 0.95, today = 0, smp0 = !S.meta || /synthetic|Illustrative/i.test(S.meta.source || '');
    var rows = S.assets.filter(function (a) { return a.active !== false && a.name; }).map(function (a) {
      var D = series(S, a.name), A = { name: a.name, kind: a.kind, key: a.key, usd: !!a.usd, h: {}, ok: false };
      HZ.forEach(function (H) { var src = H.bars === 'd' ? D.d : D.w, win = Number(S.opt[H.key]); A.h[H.id] = src.length ? LV.analyse(src, { bars: H.bars, win: win, cover: cover, f: H.f }) : { ok: false, why: H.bars === 'd' ? 'دادهٔ روزانه ندارد؛ دوباره دریافت کنید' : 'داده ندارد' }; if (A.h[H.id].ok) A.ok = true; });
      var base = D.d.length ? D.d : D.w; if (base.length) { A.last = base[base.length - 1].close; A.date = base[base.length - 1].date; today = Math.max(today, LV.jdnOf(A.date)); }
      var long = D.d.length && LV.jdnOf(D.d[D.d.length - 1].date) - LV.jdnOf(D.d[0].date) > 380 ? D.d : D.w;
      A.ret = { m1: retSince(D.d.length ? D.d : D.w, 30), m3: retSince(D.d.length ? D.d : D.w, 91), y1: retSince(long, 365) };
      try { A.trx = Hub.central && Hub.central.trend ? Hub.central.trend(cenKeyOf(A), D.d.length >= 30 ? D.d : null) : null; } catch (e) { A.trx = null; } A.trFa = Hub.central && Hub.central.trendFa ? Hub.central.trendFa(A.trx) : '';
      if (D.d.length >= 120) { A.cy = LV.cycles(D.d, { bars: 600 }); A.piv = LV.autoPivots(D.d, 300); A.tw = LV.timeWindows(D.d, A.cy, A.piv, { ahead: Number(S.opt.ahead) || 120 }).filter(function (w) { return (w.type !== 'peak' && w.type !== 'trough') || w.strength >= 0.4; }); var low = A.piv.filter(function (q) { return q.kind === 'low'; })[0]; A.sq = low ? LV.sq9(low.price, A.last, 3) : []; A.sqBase = low && low.price;
        var dd = D.d, k0 = dd.length, tr = 0, cnt = 0; for (var q2 = Math.max(1, k0 - 14); q2 < k0; q2++) { tr += Math.max(dd[q2].high - dd[q2].low, Math.abs(dd[q2].high - dd[q2 - 1].close), Math.abs(dd[q2].low - dd[q2 - 1].close)); cnt++; }
        var l10 = dd.slice(-11, -1), lastR = dd[dd.length - 1]; A.lv = { atr: cnt ? tr / cnt : 0, hi10: Math.max.apply(null, l10.map(function (r) { return r.close; })), lo10: Math.min.apply(null, l10.map(function (r) { return r.close; })) };
        // the levels are the highest / lowest close of the 10 sessions before the last one; the last close is compared against them
        A.lv.cls = a.kind === 'tse-index' ? 'index' : a.kind === 'tse' ? 'stock' : /(^|_)ons$|^ons/.test(String(a.key || '')) ? 'ounce' : 'tgju';
        A.lv.lastD = lastR.date; A.lv.dates = dd.slice(-150).map(function (r) { return r.date; });
        if (!smp0 && a.kind !== 'ratio') journal(S, A, D); }
      return A; });
    var ST = stats(S), V = validity(S, ST); rows.forEach(function (A) { if (A.ok) { A.plan = plan(A, V); cenPlan(A); } });
    // one calendar for all series: windows within 4 days of each other form one date
    var all = []; rows.forEach(function (A) { (A.tw || []).forEach(function (w) { all.push({ day: LV.jdnOf(A.date) + w.days, w: w, name: A.name }); }); }); all.sort(function (u, v) { return u.day - v.day; });
    var cal = [], cur = null; all.forEach(function (x) { if (x.day < today - 3) return; if (!cur || x.day - cur.from > 4) { cur = { from: x.day, to: x.day, items: [] }; cal.push(cur); } cur.to = x.day; cur.items.push(x); });
    // importance is judged against what is normal for this calendar: with many series, a few coincidences in any 5 days are expected.
    // Related markets count once (dollar, tether, euro and dirham are one family), so four currencies agreeing is not four confirmations.
    var fam = {}; S.assets.forEach(function (a) { fam[a.name] = family(a); });
    var ahead = Number(S.opt.ahead) || 120, wOf = function (x) { var q = ST[LV.winClass(x.w)]; return q ? q.w : 1; }, mean = cal.length ? cal.reduce(function (t, c) { return t + c.items.reduce(function (u, x) { return u + wOf(x); }, 0); }, 0) / Math.max(1, cal.length) : 0;
    cal.forEach(function (c) { var as = {}, fm = {}, ty = {}; c.items.forEach(function (x) { as[x.name] = 1; fm[fam[x.name] || x.name] = 1; ty[x.w.type === 'peak' || x.w.type === 'trough' ? 'cycle' : x.w.type] = 1; }); c.assets = Object.keys(as); c.fams = Object.keys(fm); c.types = Object.keys(ty).length; c.n = c.items.length; c.score = c.items.reduce(function (u, x) { return u + wOf(x); }, 0); c.in = c.from - today; c.x = mean ? c.score / mean : 0;
      c.rank = c.fams.length >= 3 && c.types >= 2 && c.x >= 1.6 ? 2 : c.fams.length >= 2 && c.x >= 1.25 ? 1 : 0; });
    var smp = !S.meta || /synthetic|Illustrative/i.test(S.meta.source || '');
    return { rows: rows, cal: cal, calMean: mean, ST: ST, V: V, today: today, sample: smp, checks: smp ? [{ level: 'warning', msg: 'دادهٔ نمونه (ساختگی) — برای تحلیل واقعی «دریافت» را بزنید.' }] : [] };
  }
  /* ---------- text ---------- */
  function lines(A0, H, M) {
    var A = A0.h[H.id]; if (!A.ok) return [A0.name + ' (' + H.name + '): ' + (A.why || 'دادهٔ کافی نیست')];
    var L = [], dv = A.dv, tf = H.bars === 'd' ? 'روزانه' : 'هفتگی';
    L.push('قیمت ' + fa(A.last) + ' (' + sh(A.date) + ')؛ جایگاه در کانال ' + H.name + ': ' + posTxt(A) + '.');
    if (dv.bear) L.push('واگرایی منفی ' + tf + ': قیمت سقف بالاتری زده (' + fa(dv.bear.p1) + ' ← ' + fa(dv.bear.p2) + ') اما RSI سقف پایین‌تری ساخته (' + fa(dv.bear.r1, 0) + ' ← ' + fa(dv.bear.r2, 0) + ')؛ نشانهٔ تضعیف مومنتوم صعودی.');
    if (dv.bull) L.push('واگرایی مثبت ' + tf + ': قیمت کف پایین‌تری زده اما RSI کف بالاتری ساخته (' + fa(dv.bull.r1, 0) + ' ← ' + fa(dv.bull.r2, 0) + ')؛ نشانهٔ تضعیف فشار فروش.');
    if (!dv.bear && !dv.bull) L.push('RSI ' + tf + ' ' + fa(A.rsi, 0) + '؛ واگرایی فعالی دیده نمی‌شود.');
    L.push('سطوح کانال اکنون (و فاصلهٔ قیمت امروز تا آن‌ها): سقف ' + fa(A.up) + ' (' + pct(A.toUp) + ')، میانه ' + fa(A.mid) + ' (' + pct(A.toMid) + ')، کف ' + fa(A.lo) + ' (' + pct(A.toLo) + '). پهنای کانال (سقف به کف): ' + pct(A.width).replace('+', '') + '.');
    L.push('ادامهٔ کانال: در ' + fa(H.f[0], 0) + ' ' + H.u + ' سقف ≈ ' + fa(A.upF1) + ' و کف ≈ ' + fa(A.loF1) + '؛ در ' + fa(H.f[1], 0) + ' ' + H.u + ' سقف ≈ ' + fa(A.upF2) + '، میانه ≈ ' + fa(A.midF2) + ' و کف ≈ ' + fa(A.loF2) + '. شیب کانال: ' + pct(A.ch.growth) + ' سالانه‌شده.');
    if (H.id === 'l' && isFinite(A0.ret.y1)) L.push('بازده یک‌ساله: ' + pct(A0.ret.y1) + (isFinite(M.point) && M.point && !A0.usd ? '؛ در برابر تورم نقطه‌به‌نقطهٔ ' + pct(M.point, 1).replace('+', '') + ' یعنی بازده واقعی ' + pct((1 + A0.ret.y1) / (1 + M.point) - 1) + '.' : '.'));
    L.push('اعتبار کانال: ' + A.quality + ' (R² = ' + fa(A.ch.r2, 2) + '، ' + fa(A.win, 0) + ' ' + H.u + '، نزدیک‌شدن به سقف ' + fa(A.touchU, 0) + ' بار و به کف ' + fa(A.touchL, 0) + ' بار)' + (A.quality === 'ضعیف' ? ' — در این افق خط مستقیم توصیف خوبی از قیمت نیست؛ به سطوح این کانال کم‌تر تکیه کنید.' : '.'));
    var M0 = MEAN[A.read]; if (M0) { L.push('چه شد: ' + M0[0]); L.push('یعنی چه: ' + M0[1] + ' RSI ' + fa(A.rsi, 0) + ': ' + rsiTxt(A.rsi) + '.'); L.push(A0 && A0.plan && A0.plan.cen ? 'حکم مرکزی: ' + A0.plan.cen.actFa + ' — ' + A0.plan.cen.stFa : 'خوانش تحلیلی (حکم معاملاتی نیست): ' + M0[2]); }
    return L;
  }
  // directive §4: explain conflicts between horizons instead of leaving the reader to reconcile them
  var BULL = { rebound: 1, improving: 1, 'trend-up': 1, depressed: 1 }, BEAR = { correction: 1, weakening: 1, 'trend-down': 1, stretched: 1 };
  function conflict(A0) {
    var ok = HZ.filter(function (H) { return A0.h[H.id] && A0.h[H.id].ok; }); if (ok.length < 2) return '';
    var up = ok.filter(function (H) { return BULL[A0.h[H.id].read]; }), dn = ok.filter(function (H) { return BEAR[A0.h[H.id].read]; });
    if (!up.length || !dn.length) return '';
    var nm = function (L) { return L.map(function (H) { return H.name + ' «' + READ[A0.h[H.id].read][0] + '»'; }).join('، '); };
    var longBull = BULL[A0.h[ok[ok.length - 1].id].read];
    return 'تضاد افق‌ها: ' + nm(up) + ' در برابر ' + nm(dn) + '. ' + (longBull ? 'یعنی ضعف یا اصلاح کوتاه‌تر در دل روند بزرگ‌تر صعودی است؛ برای دارندهٔ بلندمدت معمولاً فرصت خرید در اصلاح است، برای معامله‌گر کوتاه‌مدت فعلاً زود است.' : 'یعنی جهش کوتاه‌تر در دل روند بزرگ‌تر ضعیف یا نزولی است؛ این جهش را فرصت سبک‌کردن بدانید نه شروع روند تازه.') + ' افق تصمیم خودتان را مبنا بگیرید.';
  }
  function brief(A) { return HZ.map(function (H) { var x = A.h[H.id]; return H.name + ': ' + (x.ok ? READ[x.read][0] + ' (' + posLbl(x) + ')' : '—'); }).join(' · '); }
  function winText(w) { var pv = function (k) { return k === 'low' ? 'کف اصلی' : 'سقف اصلی'; };
    return w.type === 'gann' ? fa(w.n, 0) + ' روز پس از ' + pv(w.from) : w.type === 'fib' ? 'نسبت زمانی ' + String(w.n).replace('.', '٫').replace(/\d/g, function (c) { return '۰۱۲۳۴۵۶۷۸۹'[c]; }) + ' × فاصلهٔ ' + w.from.split('>').map(pv).join(' تا ') + ' (' + fa(w.span, 0) + ' روز)' : (w.type === 'trough' ? 'کف' : 'قلهٔ') + ' چرخهٔ حدود ' + fa(w.n, 0) + ' روزه'; }
  var RANK = [['کم', 'sev-info'], ['متوسط', 'fit-cond'], ['زیاد', 'fit-no']];
  function calDate(c) { return c.from === c.to ? J.jstr(c.from) : J.jstr(c.from) + ' تا ' + J.jstr(c.to).slice(5); }
  function note(R, S) {
    var M = S.macro || {}, T = [], ix = R.rows.filter(function (a) { return a.ok && a.kind === 'tse-index'; });
    if (isFinite(M.annual) || isFinite(M.point)) { T.push('تورم ' + (M.asOf || '') + ': سالانه ' + pct(M.annual, 1).replace('+', '') + '، نقطه‌به‌نقطه ' + pct(M.point, 1).replace('+', '') + '، ماهانه ' + pct(M.monthly, 1).replace('+', '') + (isFinite(M.monthly) ? ' (سالانه‌شده: ' + pct(Math.pow(1 + M.monthly, 12) - 1).replace('+', '') + ')' : '') + '.');
      T.push('کاهش تورم نقطه‌ای به معنای ارزان‌شدن نیست؛ یعنی قیمت‌ها همچنان به‌طور متوسط ' + pct(M.point, 1).replace('+', '') + ' بالاتر از ماه مشابه سال قبل‌اند. هر دارایی ریالی که بازده یک‌ساله‌اش کمتر از این عدد باشد، قدرت خرید از دست داده است.'); T.push(''); }
    R.rows.forEach(function (a) { if (!a.ok) return; T.push('▪ ' + a.name + ' — ' + fa(a.last) + ' — بازده ۱ ماه ' + pct(a.ret.m1) + '، ۳ ماه ' + pct(a.ret.m3) + '، ۱ سال ' + pct(a.ret.y1) + (isFinite(M.point) && isFinite(a.ret.y1) && !a.usd ? ' (واقعی ' + pct((1 + a.ret.y1) / (1 + M.point) - 1) + ')' : ''));
      HZ.forEach(function (H) { var x = a.h[H.id]; if (!x.ok) return; T.push('  ' + H.name + ': ' + READ[x.read][0] + '؛ ' + posLbl(x) + ' (کانال ' + fa(x.lo) + ' تا ' + fa(x.up) + ')؛ RSI ' + fa(x.rsi, 0) + (x.dv.bear ? '؛ واگرایی منفی' : x.dv.bull ? '؛ واگرایی مثبت' : '') + '؛ فاصله تا میانه ' + fa(x.mid) + ': ' + pct(x.toMid) + '، تا کف ' + fa(x.lo) + ': ' + pct(x.toLo) + '، تا سقف ' + fa(x.up) + ': ' + pct(x.toUp) + (x.quality === 'ضعیف' ? ' (اعتبار کانال ضعیف)' : '') + '.' + (MEAN[x.read] ? ' اقدام: ' + MEAN[x.read][2] : '')); }); var cf = conflict(a); if (cf) T.push('  ' + cf); T.push(''); });
    var hot = R.cal.filter(function (c) { return c.rank >= 1 && c.in <= 60; }).slice(0, 5);
    if (hot.length) { T.push('تاریخ‌های کلیدی ۶۰ روز آینده (هم‌زمانی چند نشانهٔ زمانی):'); hot.forEach(function (c) { T.push('  ' + calDate(c) + ' — ' + fa(c.n, 0) + ' نشانه در ' + c.fams.join('، ') + ' (اهمیت ' + RANK[c.rank][0] + ')'); }); T.push(''); }
    var warn = ix.filter(function (a) { return ['m', 'l'].some(function (k) { return a.h[k].ok && (a.h[k].read === 'correction' || a.h[k].read === 'stretched'); }); }), low = ix.filter(function (a) { return ['m', 'l'].some(function (k) { return a.h[k].ok && (a.h[k].read === 'rebound' || a.h[k].read === 'depressed'); }); });
    if (warn.length) T.push('جمع‌بندی مدل: ' + warn.map(function (a) { return a.name; }).join(' و ') + ' در افق میان‌مدت یا بلندمدت در محدودهٔ سقف کانال است' + (warn.some(function (a) { return a.h.m.ok && a.h.m.dv.bear || a.h.l.ok && a.h.l.dv.bear; }) ? ' و واگرایی منفی هفتگی دارد' : '') + '. قاعدهٔ این مدل در چنین وضعی: شناسایی بخشی از سود یا کاهش بخشی از وزن سهام (مثلاً یک‌سوم) و بالا آوردن حد ضرر باقی‌مانده؛ ورود جدید پس از اصلاح به خط میانی یا رفع واگرایی.');
    else if (low.length) T.push('جمع‌بندی مدل: ' + low.map(function (a) { return a.name; }).join(' و ') + ' در افق میان‌مدت یا بلندمدت در محدودهٔ کف کانال است. قاعدهٔ این مدل: خرید پله‌ای با حد ضرر زیر کف کانال؛ تأیید با واگرایی مثبت یا بازگشت RSI هفتگی به بالای ۴۰.');
    else T.push('جمع‌بندی مدل: شاخص‌های بورس در افق میان‌مدت و بلندمدت در محدودهٔ سقف یا کف کانال نیستند؛ قاعدهٔ این مدل اقدام خاصی نمی‌خواهد.');
    T.push('این متن خروجی قاعده‌محور یک مدل است، نه توصیهٔ خرید یا فروش. کانال توصیف گذشته است، واگرایی هشدار است نه زمان‌سنج، و تاریخ‌های زمانی فقط فهرست بازبینی‌اند.' + (R.sample ? ' (دادهٔ نمونه)' : ''));
    return T.join('\n');
  }
  /* ---------- chart ---------- */
  function chart(A, H, name) {
    var NS = 'http://www.w3.org/2000/svg', el = function (t, a, txt) { var e = document.createElementNS(NS, t); Object.keys(a || {}).forEach(function (k) { e.setAttribute(k, a[k]); }); if (txt != null) e.textContent = txt; return e; };
    var from = A.ch.from, s0 = Math.max(0, from - Math.round(A.win * 0.35)), fwd = H.f[1], n = A.n, N = n - s0 + fwd, W = 920, H1 = 330, H2 = 110, PL = 8, PR = 86, PT = 10, GAP = 26, x = function (i) { return PL + (W - PL - PR) * (i - s0) / (N - 1); };
    var vis = A.W.slice(s0), vals = [A.ch.at(from, -1), A.ch.at(from, 1), A.ch.at(n - 1 + fwd, 1), A.ch.at(n - 1 + fwd, -1)]; vis.forEach(function (w) { vals.push(w.low || w.close, w.high || w.close); });
    var mn = Math.log(Math.min.apply(null, vals) * 0.97), mx = Math.log(Math.max.apply(null, vals) * 1.03), y = function (v) { return PT + (H1 - PT) * (1 - (Math.log(v) - mn) / (mx - mn)); }, yr = function (v) { return H1 + GAP + H2 * (1 - v / 100); }, tf = H.bars === 'd' ? 'روزانه' : 'هفتگی';
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + (H1 + GAP + H2 + 22), role: 'img', 'aria-label': 'نمودار ' + tf + ' لگاریتمی ' + name + ' با کانال روند و RSI', style: 'width:100%;height:auto;display:block' });
    var ticks = [], e0 = Math.floor(mn / Math.LN10), e1 = Math.ceil(mx / Math.LN10), ks = (mx - mn) < 0.9 ? [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8] : [1, 2, 5];
    var mk = function (set) { var t = []; for (var e = e0 - 1; e <= e1; e++) set.forEach(function (k) { var v = k * Math.pow(10, e); if (Math.log(v) > mn && Math.log(v) < mx) t.push(v); }); return t; };
    ticks = mk(ks); if (ticks.length < 4) ticks = mk([1, 1.5, 2, 3, 4, 5, 7]); if (ticks.length < 4) ticks = mk([1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 2, 2.2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8, 9]); if (ticks.length > 9) ticks = ticks.filter(function (_, i) { return i % 2 === 0; });
    ticks.forEach(function (v) { svg.appendChild(el('line', { x1: PL, x2: W - PR, y1: y(v), y2: y(v), stroke: 'var(--line)', 'stroke-width': 0.6 })); svg.appendChild(el('text', { x: W - PR + 6, y: y(v) + 4, fill: 'var(--muted)', 'font-size': 11 }, fa(v))); });
    var cut = H.bars === 'd' ? 7 : 4, lastK = null; vis.forEach(function (w, k) { var i = s0 + k, key = sh(w.date).slice(0, cut); if (key !== lastK) { if (lastK !== null) { svg.appendChild(el('line', { x1: x(i), x2: x(i), y1: PT, y2: H1 + GAP + H2, stroke: 'var(--line)', 'stroke-width': 0.5, 'stroke-dasharray': '2 4' })); svg.appendChild(el('text', { x: x(i) + 3, y: H1 + GAP + H2 + 16, fill: 'var(--muted)', 'font-size': 11 }, key.replace(/\d/g, function (c) { return '۰۱۲۳۴۵۶۷۸۹'[c]; }))); } lastK = key; } });
    [[1, 'var(--crit)'], [0, 'var(--muted)'], [-1, 'var(--good, #3fb27f)']].forEach(function (b) {
      svg.appendChild(el('line', { x1: x(from), y1: y(A.ch.at(from, b[0])), x2: x(n - 1), y2: y(A.ch.at(n - 1, b[0])), stroke: b[1], 'stroke-width': 1.4, 'stroke-dasharray': b[0] === 0 ? '5 4' : '' }));
      svg.appendChild(el('line', { x1: x(n - 1), y1: y(A.ch.at(n - 1, b[0])), x2: x(n - 1 + fwd), y2: y(A.ch.at(n - 1 + fwd, b[0])), stroke: b[1], 'stroke-width': 1.2, 'stroke-dasharray': '3 5', opacity: 0.8 })); });
    svg.appendChild(el('polyline', { points: vis.map(function (w, k) { return x(s0 + k).toFixed(1) + ',' + y(w.close).toFixed(1); }).join(' '), fill: 'none', stroke: 'var(--accent)', 'stroke-width': 1.6 }));
    svg.appendChild(el('circle', { cx: x(n - 1), cy: y(A.last), r: 3.5, fill: 'var(--accent)' })); svg.appendChild(el('text', { x: x(n - 1) + 8, y: y(A.last) - 6, fill: 'var(--text)', 'font-size': 12, 'font-weight': 600 }, fa(A.last)));
    [30, 50, 70].forEach(function (v) { svg.appendChild(el('line', { x1: PL, x2: W - PR, y1: yr(v), y2: yr(v), stroke: 'var(--line)', 'stroke-width': 0.6, 'stroke-dasharray': v === 50 ? '2 4' : '' })); svg.appendChild(el('text', { x: W - PR + 6, y: yr(v) + 4, fill: 'var(--muted)', 'font-size': 11 }, fa(v, 0))); });
    svg.appendChild(el('polyline', { points: A.R.map(function (v, i) { return i >= s0 && isFinite(v) ? x(i).toFixed(1) + ',' + yr(v).toFixed(1) : ''; }).filter(Boolean).join(' '), fill: 'none', stroke: '#9b7fd1', 'stroke-width': 1.3 }));
    svg.appendChild(el('text', { x: PL + 4, y: H1 + GAP - 6, fill: 'var(--muted)', 'font-size': 11 }, 'RSI ' + tf + ' (۱۴): ' + fa(A.rsi, 0)));
    [['bear', 'var(--crit)'], ['bull', 'var(--good, #3fb27f)']].forEach(function (d) { var v = A.dv[d[0]]; if (!v || v.i1 < s0) return;
      svg.appendChild(el('line', { x1: x(v.i1), y1: y(v.p1), x2: x(v.i2), y2: y(v.p2), stroke: d[1], 'stroke-width': 2 })); svg.appendChild(el('line', { x1: x(v.i1), y1: yr(v.r1), x2: x(v.i2), y2: yr(v.r2), stroke: d[1], 'stroke-width': 2 }));
      svg.appendChild(el('text', { x: x(v.i2) - 4, y: yr(Math.max(v.r1, v.r2)) - 6, fill: d[1], 'font-size': 12, 'font-weight': 600, 'text-anchor': 'end' }, d[0] === 'bear' ? 'واگرایی منفی' : 'واگرایی مثبت')); });
    return h('div', { class: 'lv-chart', dir: 'ltr' }, [svg]);
  }
  function table(head, rows, cls) { return h('div', { class: 'grid-wrap' }, [h('table', { class: 'grid aud se' }, [h('thead', null, [h('tr', null, head.map(function (t) { return h('th', { class: 'lbl', 'data-notr': '1', text: t }); }))]), h('tbody', null, rows.map(function (r, i) { return h('tr', { class: cls ? cls(i) : '' }, r.map(function (c) { return c && c.nodeType ? h('td', null, [c]) : h('td', { class: 'small', 'data-notr': '1', style: 'white-space:normal', text: c == null ? '' : String(c) }); })); }))])]); }
  function chip(k, extra) { var r = READ[k] || ['—', 'sev-info']; return h('span', { class: 'sev ' + r[1], 'data-notr': '1', text: r[0] + (extra || '') }); }
  function P(t, cls) { return h('p', { class: cls || 'f-help', 'data-notr': '1', text: t }); }
  function goTab(id) { setTimeout(function () { var b = document.querySelectorAll('[data-tab="' + id + '"]'); if (b.length) b[b.length - 1].click(); }, 50); }
  function hzPick(ctx, id) { var S = ctx.S; return { key: id, label: 'افق', options: HZ.map(function (H) { return [H.id, H.name + ' — ' + H.sub]; }), get: function () { return S.hz; }, set: function (v) { S.hz = v; } }; }

  /* ---------- tabs ---------- */
  function overviewTab(ctx) {
    var S = ctx.S, R = ctx.R, M = S.macro || {}, ta = h('textarea', { class: 'f-area', rows: 18, 'aria-label': 'یادداشت بازار', dir: 'rtl' }); ta.value = note(R, S);
    var cell = function (a, id) { var x = a.h[id]; if (!x.ok) return '—'; return h('a', { href: '#', title: 'نمودار', onclick: function (e) { e.preventDefault(); S.sel = a.name; S.hz = id; ctx.rerender(); goTab('chart'); } }, [chip(x.read, ' · ' + posLbl(x) + ' · قیمت ' + fa(x.last) + (x.dv.bear ? ' · واگرایی −' : x.dv.bull ? ' · واگرایی +' : ''))]); };
    var rows = R.rows.map(function (a) { return [a.name, fa(a.last), cell(a, 's'), cell(a, 'm'), cell(a, 'l'), pct(a.ret.m1), pct(a.ret.m3), pct(a.ret.y1) + (isFinite(M.point) && isFinite(a.ret.y1) && !a.usd ? ' (واقعی ' + pct((1 + a.ret.y1) / (1 + M.point) - 1) + ')' : '')]; });
    var hot = R.cal.filter(function (c) { return c.rank >= 1; }).slice(0, 6), fail = (S.lastErrs || []);
    var copy = h('button', { class: 'btn primary', type: 'button', text: 'کپی یادداشت', 'data-notr': '1', onclick: function () { if (navigator.clipboard) navigator.clipboard.writeText(ta.value).then(function () { U.toast('کپی شد.', 'good'); }); else ta.select(); } });
    return ctx.group([ctx.panel('نمای کلی بازارها در سه افق', [R.sample ? P('دادهٔ نمونه است؛ از زبانهٔ «داده و تنظیمات» دریافت کنید.', 'neg') : null,
      P('هر خانه: خوانش مدل · جایگاه قیمت در کانال همان افق (۰٪ = کف کانال، ۱۰۰٪ = سقف) · واگرایی RSI اگر باشد. روی هر خانه بزنید تا نمودارش باز شود. کوتاه‌مدت: حدود ۳ ماه با کندل روزانه؛ میان‌مدت: حدود ۱۸ ماه هفتگی؛ بلندمدت: حدود ۵ سال هفتگی.'),
      table(['سری', 'آخرین', 'کوتاه‌مدت', 'میان‌مدت', 'بلندمدت', 'بازده ۱ ماه', 'بازده ۳ ماه', 'بازده ۱ سال'], rows),
      !R.sample && R.rows.some(function (a) { return !a.h.s.ok; }) ? P('برای سری‌های بدون داده یا بدون ستون کوتاه‌مدت، یک بار از زبانهٔ «داده و تنظیمات» دریافت کنید (این نسخه دادهٔ روزانه را هم نگه می‌دارد).', 'small warn-t') : null,
      fail.length && !R.sample ? P('دریافت‌نشده در آخرین به‌روزرسانی: ' + fail.join(' · '), 'small warn-t') : null,
      isFinite(M.point) ? P('تورم ' + (M.asOf || '') + ' (ورودی شما): سالانه ' + pct(M.annual, 1).replace('+', '') + ' · نقطه‌به‌نقطه ' + pct(M.point, 1).replace('+', '') + ' · ماهانه ' + pct(M.monthly, 1).replace('+', '') + '. «واقعی» = بازده یک‌ساله پس از کسر تورم نقطه‌به‌نقطه؛ برای سری‌های ارزی حساب نمی‌شود.', 'small muted') : null]),
      ctx.panel('نزدیک‌ترین تاریخ‌های کلیدی', [hot.length ? table(['تاریخ', 'چند روز دیگر', 'اهمیت', 'نشانه', 'در کدام بازارها'], hot.map(function (c) { return [calDate(c), fa(Math.max(0, c.in), 0), h('span', { class: 'sev ' + RANK[c.rank][1], 'data-notr': '1', text: RANK[c.rank][0] }), fa(c.n, 0) + ' (' + fa(c.x, 1) + ' برابر عادی)', c.assets.join('، ')]; })) : P('تاریخ هم‌زمانی در بازهٔ تعیین‌شده نیست.', 'muted'), P('شرح هر تاریخ و روش محاسبه: زبانهٔ «تحلیل زمانی و تاریخ‌های کلیدی».', 'small muted')]),
      ctx.panel('یادداشت بازار (قابل ویرایش)', [P('متن از روی همین اعداد ساخته می‌شود؛ پیش از انتشار ویرایش کنید.'), ta, h('div', { class: 'row-ctl' }, [copy])])]);
  }
  function horizonTab(ctx) {
    var S = ctx.S, R = ctx.R, H = hz(S.hz), f = G.form({ id: 'lv-h', onChange: ctx.rerender, fields: [hzPick(ctx, 'hz')] });
    var rows = R.rows.map(function (a) { var x = a.h[H.id]; if (!x.ok) return [a.name, '—', '—', '—', '—', '—', '—', '—', '—', x.why || '—'];
      var link = h('a', { href: '#', 'data-notr': '1', text: a.name, onclick: function (e) { e.preventDefault(); S.sel = a.name; ctx.rerender(); goTab('chart'); } });
      var M = MEAN[x.read] || ['', '', ''];
      return [link, fa(x.last), posTxt(x), fa(x.rsi, 0) + ' — ' + rsiTxt(x.rsi), dvTxt(x), h('div', {}, [chip(x.read), h('div', { class: 'small', text: M[0] + ' ' + M[1] }), h('div', { class: 'small', text: a.plan && a.plan.cen ? 'حکم مرکزی: ' + a.plan.cen.actFa + ' — ' + a.plan.cen.stFa : 'خوانش تحلیلی افق (حکم معاملاتی نیست): ' + M[2] })]),
        fa(x.up) + ' (فاصله ' + pct(x.toUp) + ')', fa(x.mid) + ' (فاصله ' + pct(x.toMid) + ')', fa(x.lo) + ' (فاصله ' + pct(x.toLo) + ')', fa(x.upF2) + ' / ' + fa(x.loF2), pct(x.ch.growth), x.quality]; });
    return ctx.group([ctx.panel('جزئیات افق ' + H.name + ' (' + H.sub + ')', [f, P('ستون‌های سقف، خط میانی و کف: مقدار هر خط و فاصلهٔ قیمت امروز تا آن. «سقف / کف آینده» جای همان خط‌ها در ' + fa(H.f[1], 0) + ' ' + H.u + ' بعد است. «شیب» رشد سالانه‌شدهٔ خط میانی است. اگر «اعتبار» ضعیف است، خط مستقیم توصیف خوبی از این دوره نیست و فاصله‌ها را جدی نگیرید.'),
      P('همهٔ درصدها نامشان را دارند: «جایگاه در کانال» درصد فاصله از کف تا سقف است (۰٪ = کف، ۱۰۰٪ = سقف)؛ «فاصله» تغییر لازم از قیمت امروز تا آن خط است؛ هیچ‌کدام احتمال نیستند.'),
      table(['سری', 'آخرین', 'جایگاه در کانال (درصد و مقدار)', 'RSI ۱۴ (مقدار و معنی)', 'مومنتوم و واگرایی', 'خوانش، معنی و اقدام', 'سقف کانال (فاصله از قیمت)', 'خط میانی (فاصله)', 'کف کانال (فاصله)', 'سقف / کف در ' + fa(H.f[1], 0) + ' ' + H.u, 'شیب سالانه', 'اعتبار'], rows)])]);
  }
  function chartTab(ctx) {
    var S = ctx.S, R = ctx.R, H = hz(S.hz), ok = R.rows.filter(function (a) { return a.h[H.id].ok; }), A0 = ok.filter(function (a) { return a.name === S.sel; })[0] || ok[0];
    var f = G.form({ id: 'lv-c', onChange: ctx.rerender, fields: [{ key: 's', label: 'سری', options: (ok.length ? ok : R.rows).map(function (a) { return [a.name, a.name]; }), get: function () { return A0 ? A0.name : ''; }, set: function (v) { S.sel = v; } }, hzPick(ctx, 'hz')] });
    if (!A0) return ctx.group([ctx.panel('نمودار', [f, P('در این افق سری با دادهٔ کافی نیست.', 'muted')])]);
    var A = A0.h[H.id];
    return ctx.group([ctx.panel(A0.name + ' — ' + H.name + ' — ' + READ[A.read][0], [f, chart(A, H, A0.name), P('خط قرمز: سقف کانال · خط‌چین خاکستری: میانه · خط سبز: کف · خط‌چین‌های سمت راست: ادامهٔ کانال تا ' + fa(H.f[1], 0) + ' ' + H.u + ' آینده · محور قیمت لگاریتمی است.', 'small muted'),
      h('ul', { class: 'studio-l' }, lines(A0, H, S.macro || {}).map(function (l) { return h('li', { 'data-notr': '1', text: l }); })),
      table(['سطح', 'اکنون', fa(H.f[0], 0) + ' ' + H.u + ' بعد', fa(H.f[1], 0) + ' ' + H.u + ' بعد'], [['سقف کانال', fa(A.up), fa(A.upF1), fa(A.upF2)], ['خط میانی', fa(A.mid), fa(A.midF1), fa(A.midF2)], ['کف کانال', fa(A.lo), fa(A.loF1), fa(A.loF2)]]),
      P('سه افق این سری: ' + brief(A0), 'small muted'), conflict(A0) ? P(conflict(A0), 'small') : null])]);
  }
  function STR(v) { return v >= 0.7 ? 'قوی' : v >= 0.4 ? 'متوسط' : 'ضعیف'; }
  function timeTab(ctx) {
    var S = ctx.S, R = ctx.R, withT = R.rows.filter(function (a) { return a.cy && a.cy.ok; }), A = withT.filter(function (a) { return a.name === S.sel; })[0] || withT[0];
    var only = S.calAll ? R.cal : R.cal.filter(function (c) { return c.rank >= 1; });
    var tg = h('label', { class: 'chk-l' }, [(function () { var i = h('input', { type: 'checkbox', 'aria-label': 'نمایش همه' }); i.checked = !!S.calAll; i.addEventListener('change', function () { S.calAll = i.checked; ctx.rerender(); }); return i; })(), document.createTextNode(' تاریخ‌های کم‌اهمیت (تک‌نشانه) هم نشان داده شود')]);
    var cyRows = withT.map(function (a) { var c = a.cy.cycles[0]; if (!c) return [a.name, '—', '—', '—', '—', '—', '—'];
      return [a.name, 'حدود ' + fa(c.calDays, 0) + ' روز (' + fa(c.period, 0) + ' کندل)', STR(c.strength) + (a.cy.weak ? ' · نامطمئن' : ''), c.phase < 0.5 ? 'نیمهٔ نزولی (از قله به سمت کف)' : 'نیمهٔ صعودی (از کف به سمت قله)', J.jstr(LV.jdnOf(a.date) + c.troughIn) + ' (' + fa(c.troughIn, 0) + ' روز)', J.jstr(LV.jdnOf(a.date) + c.peakIn) + ' (' + fa(c.peakIn, 0) + ' روز)', '±' + pct(c.swing / 2).replace('+', '')]; });
    var ST = R.ST || {}, byName = {}; R.rows.forEach(function (a) { byName[a.name] = a; });
    var pvn = function (k) { return k === 'low' ? 'کف' : 'سقف'; }, pc0 = function (v) { return isFinite(v) ? fa(v * 100, 0) + '٪' : '—'; };
    var explain = function (x) { var w = x.w, nm = x.name, q = ST[LV.winClass(w)], t;
      if (w.type === 'gann') t = fa(w.n, 0) + ' روز تقویمی از ' + pvn(w.from) + ' اصلی ' + nm + ' (' + sh(w.pd) + '، قیمت ' + fa(w.pp) + ') می‌گذرد. در روش گن، این شمارش‌ها زمان‌هایی‌اند که چرخش یا شتاب قیمت محتمل‌تر دانسته می‌شود.';
      else if (w.type === 'fib') { var pr = w.from.split('>'); t = 'حرکت ' + nm + ' از ' + pvn(pr[0]) + ' اصلی (' + sh(w.pd0) + ') تا ' + pvn(pr[1]) + ' اصلی (' + sh(w.pd) + ') ' + fa(w.span, 0) + ' روز طول کشید؛ ' + String(w.n).replace('.', '٫').replace(/\d/g, function (c) { return '۰۱۲۳۴۵۶۷۸۹'[c]; }) + ' برابر همان مدت (' + fa(Math.round(w.span * w.n), 0) + ' روز) پس از ' + pvn(pr[1]) + ' به این تاریخ می‌رسد. در تحلیل زمانی فیبوناچی این نسبت‌ها زمان احتمالی پایان یا چرخش حرکت بعدی دانسته می‌شوند.'; }
      else t = 'چرخهٔ حدود ' + fa(w.n, 0) + ' روزهٔ ' + nm + ' (' + fa(w.bars, 0) + ' کندل، قدرت ' + STR(w.strength) + ') طبق برازش فعلی در این تاریخ به ' + (w.type === 'trough' ? 'کف' : 'قلهٔ') + ' خود می‌رسد؛ یعنی اگر این موج ادامه یابد، ' + (w.type === 'trough' ? 'فشار نزولی ناشی از آن حوالی این تاریخ تمام می‌شود.' : 'نیروی صعودی ناشی از آن حوالی این تاریخ تمام می‌شود.');
      return t + (q && q.n >= 20 ? ' سابقه: از ' + fa(q.n, 0) + ' مورد مشابه در گذشتهٔ همین بازارها، ' + pc0(q.rate) + ' با یک چرخش واقعی هم‌زمان شد (نرخ تصادفی ' + pc0(q.base) + ') — ' + VERD[q.verdict][0] + '.' : ' سابقه: ' + (q ? 'نمونه کم است (' + fa(q.n, 0) + ' مورد).' : 'هنوز محاسبه نشده.')); };
    var card = function (c, open) {
      var hits = 0, exps = 0, k = 0; c.items.forEach(function (x) { var q = ST[LV.winClass(x.w)]; if (q && q.n >= 20) { hits += q.rate; exps += q.base; k++; } });
      var imp = 'اهمیت ' + RANK[c.rank][0] + ': ' + fa(c.n, 0) + ' نشانه از ' + fa(c.fams.length, 0) + ' خانوادهٔ بازار (' + c.fams.join('، ') + ')؛ تراکم وزنی ' + fa(c.x, 1) + ' برابر یک بازهٔ معمولی همین تقویم. ' +
        (k ? 'احتمال تأثیر، بر پایهٔ سابقه: نشانه‌های این تاریخ در گذشته به‌طور میانگین ' + pc0(hits / k) + ' مواقع با چرخش واقعی (±۲ کندل) هم‌زمان بوده‌اند؛ یک روز تصادفی ' + pc0(exps / k) + '. ' + (hits / k > exps / k * 1.15 ? 'یعنی اندکی بهتر از تصادف.' : hits / k < exps / k * 0.87 ? 'یعنی بدتر از تصادف؛ به این تاریخ وزن کمی بدهید.' : 'یعنی تفاوت معناداری با تصادف ندارد؛ این تاریخ را فقط یادآور بازبینی بدانید، نه پیش‌بینی.') : 'احتمال تأثیر: کارنامه هنوز محاسبه نشده؛ پایین همین صفحه «محاسبهٔ کارنامه» را بزنید.');
      var names = c.assets.filter(function (n) { return byName[n] && byName[n].plan && byName[n].plan.up; });
      var mk = function (n) { var A0 = byName[n], P2 = A0.plan; return h('div', { class: 'lv-plan' }, [h('p', { 'data-notr': '1' }, [h('strong', { text: n + ' — قیمت ' + fa(A0.last) + ' — ' }), h('span', { text: (A0.trFa || '') + ' · ' }), h('span', { class: 'sev ' + LEAN[P2.lean][1], text: LEAN[P2.lean][0] }), document.createTextNode(P2.why.length ? ' (چون ' + P2.why.join('؛ ') + ')' : ' (نشانهٔ جهت‌داری در کانال، RSI یا چرخه نیست)')]),
        h('ul', { class: 'studio-l' }, [P2.status, P2.when, P2.up, P2.dn, P2.flat, P2.act, P2.risk].filter(Boolean).map(function (t) { return h('li', { 'data-notr': '1', text: t }); }))]); };
      var d = h('details', { class: 'lv-card' }, [h('summary', { 'data-notr': '1' }, [h('strong', { text: calDate(c) + ' (' + (c.in <= 0 ? 'همین روزها' : fa(c.in, 0) + ' روز دیگر') + ')' }), document.createTextNode(' — '), h('span', { class: 'sev ' + RANK[c.rank][1], text: 'اهمیت ' + RANK[c.rank][0] }), document.createTextNode(' — ' + fa(c.n, 0) + ' نشانه در ' + c.fams.join('، '))]),
        h('h4', { 'data-notr': '1', text: '۱. این تاریخ چه می‌گوید' }), h('ul', { class: 'studio-l' }, c.items.map(function (x) { return h('li', { 'data-notr': '1', text: explain(x) }); })),
        h('h4', { 'data-notr': '1', text: '۲. درجهٔ اهمیت و احتمال تأثیر' }), P(imp),
        h('h4', { 'data-notr': '1', text: '۳. سناریوهای بازار، سطوح قیمت، پیشنهاد عملی و مدیریت ریسک' }), names.length ? h('div', null, names.map(mk)) : P('برای بازارهای این تاریخ دادهٔ روزانهٔ کافی نیست.', 'muted'),
        h('h4', { 'data-notr': '1', text: '۴. یادآوری' }), P('این تحلیل فقط بر چرخه‌ها و شمارش‌های زمانی تکیه دارد و جهت حرکت را نمی‌گوید. سطوح و اقدام‌ها خروجی قاعده‌محور مدل‌اند، نه توصیهٔ خرید یا فروش؛ پیش از هر تصمیم با تحلیل تکنیکال (روند، حجم، سطوح) و بنیادی (سود شرکت‌ها، نرخ بهره، ارز، تورم، خبر) ترکیب کنید.', 'small muted')]);
      if (open) d.setAttribute('open', ''); return d; };
    // track record
    var keys = Object.keys(ST).sort(function (u, v) { return ST[v].n - ST[u].n; }), tj = S.tj || [], graded = tj.filter(function (j) { return j.hit === 0 || j.hit === 1; }), st = h('span', { class: 'small muted', 'aria-live': 'polite' });
    var recBtn = h('button', { class: 'btn', type: 'button', 'data-notr': '1', text: S.tstat ? 'محاسبهٔ دوبارهٔ کارنامه' : 'محاسبهٔ کارنامه', onclick: function () { recBtn.disabled = true; st.textContent = ' در حال بازبینی گذشته (چند ثانیه)…'; setTimeout(function () { try { record(S); } catch (e) { U.toast(String(e.message || e), 'warn'); } ctx.rerender(); }, 60); } });
    var all0 = { n: 0, hit: 0, exp: 0, vr: 0 }; keys.forEach(function (k) { ['n', 'hit', 'exp', 'vr'].forEach(function (f) { all0[f] += ST[k][f]; }); });
    var scoreP = ctx.panel('کارنامه و یادگیری: هر نوع نشانهٔ زمانی در عمل چقدر درست بوده است', [
      P('روش: برای هر بازار، در هر ۱۰ کندلِ گذشته، نشانه‌های زمانی فقط با دادهٔ تا همان روز دوباره حساب می‌شود و هر نشانه‌ای که تا ۳۰ روز بعدش سررسید داشته با واقعیت سنجیده می‌شود. «برخورد» یعنی در فاصلهٔ ±۲ کندل از تاریخ، قیمت واقعاً چرخیده باشد (بسته‌شدنی که از ۵ کندل قبل و ۵ کندل بعدش بالاتر یا پایین‌تر است؛ برای کف چرخه فقط کف و برای قله فقط قله). «تصادفی» یعنی سهم روزهایی که بدون هیچ تحلیلی هم نزدیک یک چرخش‌اند. «نسبت تحرک» = اندازهٔ حرکت ۱۰ کندل بعد از این تاریخ‌ها نسبت به حرکت ۱۰ کندلهٔ معمول (بالاتر از ۱ یعنی بعدش بازار پرتحرک‌تر بوده). وزن هر نوع نشانه در تقویم بالا از همین کارنامه می‌آید (بین ۰٫۵ و ۱٫۵، با احتیاط برای نمونهٔ کم) و با هر به‌روزرسانی داده و هر تاریخ سپری‌شده دوباره تنظیم می‌شود.'),
      h('div', { class: 'row-ctl' }, [recBtn, st]),
      S.tstat ? P('آخرین محاسبه: ' + fa(S.tstat.n, 0) + ' نشانهٔ سنجیده‌شده در ' + fa(S.tstat.series, 0) + ' بازار' + (S.tstat.sample ? ' — روی دادهٔ نمونه (ساختگی)؛ بی‌معنا تا وقتی دادهٔ واقعی دریافت شود' : '') + '. جمع کل: نرخ برخورد ' + pc0(all0.n ? all0.hit / all0.n : NaN) + ' در برابر ' + pc0(all0.n ? all0.exp / all0.n : NaN) + ' تصادفی.', 'small muted') : P('هنوز محاسبه نشده است. پس از هر «دریافت» خودکار حساب می‌شود.', 'small warn-t'),
      keys.length ? table(['نوع نشانه', 'تعداد', 'نرخ برخورد', 'تصادفی', 'نسبت به تصادف', 'نسبت تحرک', 'داوری', 'وزن در تقویم', 'زنده (سپری‌شده)'], keys.map(function (k) { var q = ST[k]; return [clsName(k), fa(q.n, 0), pc0(q.rate), pc0(q.base), isFinite(q.lift) ? fa(q.lift, 2) + '×' : '—', isFinite(q.move) ? fa(q.move, 2) + '×' : '—', h('span', { class: 'sev ' + VERD[q.verdict][1], 'data-notr': '1', text: VERD[q.verdict][0] }), fa(q.w, 2), q.live ? fa(q.liveHit, 0) + ' از ' + fa(q.live, 0) : '—']; })) : null,
      P('دفتر زنده: ' + fa(tj.length, 0) + ' نشانه ثبت شده، ' + fa(graded.length, 0) + ' مورد سررسیدشده و سنجیده‌شده' + (graded.length ? ' (' + fa(graded.filter(function (j) { return j.hit === 1; }).length, 0) + ' برخورد)' : '') + '. هر بار که برنامه با دادهٔ واقعی باز می‌شود، نشانه‌های ۳۰ روز آینده ثبت و موارد سررسیدشده (پس از ۵ کندل) سنجیده می‌شوند؛ نتیجهٔ زنده دو برابر بازبینی گذشته وزن دارد.', 'small muted'),
      graded.length ? table(['بازار', 'نشانه', 'تاریخ', 'نتیجه'], graded.slice(-12).reverse().map(function (j) { return [j.a, clsName(j.c), J.jstr(j.tg), j.hit ? 'چرخش رخ داد' : 'چرخشی نبود']; })) : null,
      P('حد این یادگیری: فقط «زمان چرخش» سنجیده می‌شود، نه سودآوری معامله؛ بازارهای هم‌خانواده (دلار، تتر، یورو، درهم) نمونه‌های مستقل نیستند و عدد «تعداد» را بزرگ‌تر از واقع نشان می‌دهند؛ و هر ۲۰ نوع نشانه‌ای که بیازماییم، یکی به‌تصادف «بهتر از تصادف» درمی‌آید.', 'small muted')]);
    var parts = [ctx.panel('تاریخ‌های کلیدی پیش رو — شرح، اهمیت، سناریو و اقدام', [P('هر ردیف را باز کنید. برای هر سری سه نوع «نشانهٔ زمانی» حساب می‌شود (شمارش روز گن از سقف و کف اصلی، نسبت‌های زمانی فیبوناچی، کف و قلهٔ چرخه‌های غالب). وقتی چند نشانه از چند بازار در فاصلهٔ ۴ روز کنار هم بیفتند، آن بازه یک «تاریخ کلیدی» است. اهمیت نسبت به وضع عادی همین تقویم سنجیده می‌شود (میانگین وزنی فعلی: ' + fa(R.calMean || 0, 1) + ' در هر بازه). «زیاد»: دست‌کم سه خانوادهٔ بازار، دو نوع نشانه و تراکم ۱٫۶ برابر میانگین. «متوسط»: دو خانواده و ۱٫۲۵ برابر. ارزها با هم یک خانواده‌اند.'),
      h('div', { class: 'row-ctl' }, [tg]), only.length ? h('div', { class: 'stack' }, only.slice(0, 14).map(function (c, i) { return card(c, i === 0); })) : P('در ' + fa(S.opt.ahead, 0) + ' روز آینده تاریخ هم‌زمانی نیست.', 'muted')]),
      scoreP,
      ctx.panel('چرخهٔ غالب هر بازار', [P('چرخهٔ غالب = دوره‌ای که نوسان قیمت حول روندش بیشترین شباهت را به یک موج منظم با آن طول دارد (از ۶۰۰ کندل روزانهٔ اخیر). «قدرت» نسبت دامنهٔ این موج به کل نوسان حول روند است؛ «نامطمئن» یعنی چرخهٔ دوم تقریباً به همان اندازه قوی است و نمی‌شود یکی را غالب دانست. «دامنه» نوسان معمول قیمت حول روند در این چرخه است.'),
        table(['بازار', 'طول چرخه', 'قدرت', 'اکنون در', 'کف بعدی چرخه', 'قلهٔ بعدی چرخه', 'دامنه'], cyRows)])];
    if (A) { var f = G.form({ id: 'lv-t', onChange: ctx.rerender, fields: [{ key: 's', label: 'سری', options: withT.map(function (a) { return [a.name, a.name]; }), get: function () { return A.name; }, set: function (v) { S.sel = v; } }] }), d0 = LV.jdnOf(A.date), pv = function (k) { return k === 'low' ? 'کف اصلی' : 'سقف اصلی'; };
      parts.push(ctx.panel('جزئیات زمانی یک بازار: ' + A.name, [f,
        h('h4', { 'data-notr': '1', text: 'نقاط محوری (خودکار: کف و سقف ۳۰۰ کندل اخیر)' }), table(['نقطه', 'تاریخ', 'قیمت', 'چند روز پیش'], A.piv.map(function (q) { return [pv(q.kind), sh(q.date), fa(q.price), fa(d0 - LV.jdnOf(q.date), 0)]; })),
        h('h4', { 'data-notr': '1', text: 'سه چرخهٔ قوی‌تر' }), table(['طول (کندل)', '≈ روز تقویمی', 'قدرت', 'فاز', 'کندل تا کف', 'کف بعدی', 'قلهٔ بعدی', 'FLD', 'قیمت در برابر FLD'], A.cy.cycles.map(function (c) { return [fa(c.period, 0), fa(c.calDays, 0), fa(c.strength, 2) + ' (' + STR(c.strength) + ')', fa(c.phase, 2), fa(c.barsToTrough, 0), J.jstr(d0 + c.troughIn), J.jstr(d0 + c.peakIn), fa(c.fld), c.above ? 'بالاتر (نیم‌چرخه صعودی بوده)' : 'پایین‌تر (نیم‌چرخه نزولی بوده)']; })),
        h('h4', { 'data-notr': '1', text: 'پنجره‌های زمانی پیش روی این بازار' }), table(['تاریخ', 'چند روز دیگر', 'نشانه'], (A.tw || []).map(function (w) { return [J.jstr(d0 + w.days), fa(Math.max(0, w.days), 0), winText(w)]; })),
        h('h4', { 'data-notr': '1', text: 'سطوح مربع نُه گن حول کف اصلی (' + fa(A.sqBase) + ')' }), table(['سطح قیمت', 'فاصله از قیمت امروز', 'زاویه از کف اصلی'], (A.sq || []).map(function (q) { return [fa(q.level), pct(q.dist, 1), fa(q.angle, 0) + '°']; })),
        P('مربع نُه: ریشهٔ دوم قیمت کف اصلی را هر بار ۰٫۲۵ (معادل ۴۵ درجه) بالا می‌برد و دوباره به توان دو می‌رساند. فقط سه سطح بالاتر و سه سطح پایین‌تر از قیمت امروز نشان داده می‌شود.', 'small muted')])); }
    return ctx.group(parts);
  }
  function guideTab(ctx) {
    var sec = function (t, items) { return ctx.panel(t, [h('ul', { class: 'studio-l' }, items.map(function (x) { return h('li', { 'data-notr': '1', text: x }); }))]); };
    var V = ctx.R.V;
    return ctx.group([
      ctx.panel('اعتبار علمی هر روش و نقش آن در راه‌حل', [P('درجهٔ پشتوانه از پژوهش‌های منتشرشده است (شماره‌ها به فهرست منابع در پایان گزارش اشاره دارند)؛ «سابقه در این داده» از بازبینی گذشتهٔ همین بازارها می‌آید و با هر دریافت داده به‌روز می‌شود.'), table(['روش', 'پشتوانهٔ پژوهشی', 'خلاصهٔ شواهد', 'سابقه در این داده', 'نقش در راه‌حل'], V.rows.map(function (r) { return [r.m, GRADE[r.g], r.src, r.own, r.use]; })), h('ol', { class: 'studio-l' }, REFS.map(function (x) { return h('li', { 'data-notr': '1', dir: 'ltr', style: 'text-align:left', text: x }); }))]),
      sec('۱. کانال روند (در هر سه افق)', ['چه می‌کند: روی لگاریتم قیمت یک خط راست برازش می‌شود (رگرسیون). این «خط میانی» است. خط سقف و کف با همان شیب، جایی کشیده می‌شوند که ۹۵٪ قیمت‌های آن دوره میانشان بماند (سقف از بالاترین انحراف‌ها و کف از پایین‌ترین‌ها، هر کدام جدا).',
        'جایگاه در کانال: ۰٪ یعنی قیمت روی کف کانال، ۵۰٪ حدود میانه، ۱۰۰٪ روی سقف. بالای ۹۰٪ «نزدیک سقف» و زیر ۱۰٪ «نزدیک کف» خوانده می‌شود.',
        'تا سقف / میانه / کف: درصد فاصلهٔ قیمت امروز تا هر خط. منفی یعنی آن خط پایین‌تر از قیمت است.',
        'چرا قبلاً فاصله‌ها خیلی بزرگ بود: کانال روی کل تاریخچه (برای شاخص کل بیش از ۱۵ سال) و با پهنای یکسان در دو طرف کشیده می‌شد؛ یک دورهٔ پرنوسان قدیمی کل کانال را پهن می‌کرد. حالا بلندمدت ۵ سال اخیر است، دو طرف جدا اندازه‌گیری می‌شود و افق‌های کوتاه‌تر کانال خودشان را دارند.',
        'اعتبار: «قوی» یعنی خط راست دوره را خوب توصیف می‌کند (R² بالا) و قیمت چند بار به هر دو خط نزدیک شده. «ضعیف» یعنی به سطوح آن کانال تکیه نکنید. کانال توصیف گذشته است؛ شکست کانال همیشه ممکن است.']),
      sec('۲. RSI و واگرایی', ['RSI (۱۴ کندل) قدرت نسبی افزایش‌ها به کاهش‌هاست، بین ۰ و ۱۰۰. کوتاه‌مدت روی کندل روزانه و دو افق دیگر روی کندل هفتگی.',
        'واگرایی منفی: قیمت سقف تازه‌ای بالاتر از سقف قبلی می‌زند ولی RSI در سقف دوم پایین‌تر است (و در سقف اول دست‌کم ۶۰ بوده). یعنی صعود با قدرت کمتری ادامه یافته.',
        'واگرایی مثبت: برعکس، در دو کف پیاپی (RSI کف اول حداکثر ۴۰).', 'واگرایی هشدار است، نه زمان‌سنج: می‌تواند هفته‌ها پیش از برگشت قیمت دیده شود یا اصلاً به برگشت نرسد.']),
      sec('۳. خوانش‌ها', ['احتمال اصلاح: نزدیک سقف کانال و واگرایی منفی با هم.', 'نزدیک سقف کانال: بالای ۹۰٪ کانال، بدون واگرایی.', 'احتمال بازگشت صعودی: نزدیک کف و واگرایی مثبت.', 'نزدیک کف کانال: زیر ۱۰٪ کانال، بدون واگرایی.', 'تضعیف / بهبود مومنتوم: واگرایی هست ولی قیمت در لبهٔ کانال نیست.', 'روند صعودی / نزولی: هیچ‌کدام از موارد بالا؛ فقط جهت شیب کانال.',
        'وقتی افق‌ها هم‌نظر نیستند (مثلاً کوتاه‌مدت «احتمال اصلاح» و بلندمدت «روند صعودی») یعنی اصلاح در دل روند بزرگ‌تر؛ افق تصمیم خودتان را ملاک بگیرید.']),
      sec('۴. تحلیل زمانی: چرخه‌ها', ['روند کلی از لگاریتم قیمت کم می‌شود؛ بعد برای هر طول موج از ۲۰ تا ۲۵۰ کندل سنجیده می‌شود که باقی‌مانده چقدر به یک موج منظم با آن طول شبیه است. سه طول موج قوی‌تر و جدا از هم «چرخه‌های غالب»اند.',
        'دوره (کندل): طول چرخه برحسب روز معاملاتی. «≈ روز»: همان به روز تقویمی.', 'دامنه / قدرت: دامنهٔ موج نسبت به کل نوسان حول روند. نزدیک ۱ یعنی بیشتر نوسان را همین چرخه توضیح می‌دهد؛ زیر ۰٫۴ ضعیف است.',
        'فاز: جای امروز در چرخه. ۰ = قله، ۰٫۵ = کف، ۱ = قلهٔ بعد. پس فاز ۰٫۱۴ یعنی تازه از قلهٔ چرخه گذشته‌ایم.', 'کندل تا کف / کف بعدی / قلهٔ بعدی: اگر همین موج ادامه یابد، کف و قلهٔ بعدی‌اش کِی می‌رسد.',
        'FLD: قیمتِ نیم‌چرخه پیش. قیمت بالاتر از آن یعنی در نیم‌چرخهٔ اخیر بازار بالا آمده است. (در نسخهٔ قبل به اشتباه «بالای ابر» ترجمه شده بود.)',
        'محدودیت: طول چرخهٔ غالب با اضافه‌شدن داده جابه‌جا می‌شود و بازارها موج منظم نیستند. این خروجی فهرست بازبینی است، نه سیگنال.']),
      sec('۵. تحلیل زمانی: شمارش روز و نسبت‌های زمانی', ['نقاط محوری: کف اصلی و سقف اصلی ۳۰۰ کندل اخیر هر بازار (خودکار).', 'شمارش روز گن: ۳۰، ۴۵، ۶۰، ۹۰، ۱۲۰، ۱۴۴، ۱۸۰ و ۳۶۰ روز تقویمی پس از هر نقطهٔ محوری. مثال: «۶۰ روز پس از سقف اصلی».',
        'نسبت زمانی فیبوناچی: فاصلهٔ زمانی دو نقطهٔ محوری آخر در ۰٫۳۸۲، ۰٫۶۱۸، ۱، ۱٫۶۱۸ و ۲٫۶۱۸ ضرب و از نقطهٔ دوم جلو برده می‌شود. مثال: «۰٫۳۸۲ × ۲۵۳ روز» یعنی ۹۷ روز پس از نقطهٔ دوم.',
        'مربع نُه گن: سطوح قیمتی حول یک قیمت پایه (این‌جا کف اصلی). در ابزار تفصیلی قبلی قیمت پایه و نقاط محوری پس از دریافت داده به‌روز نمی‌شد و از دادهٔ نمونه می‌ماند؛ برای همین فاصله‌هایی مثل «۶۹٪−» می‌دیدید. اصلاح شد.',
        'پشتوانهٔ آماری این شمارش‌ها ضعیف است. ارزش عملی‌شان فقط در «هم‌زمانی» است: وقتی چند نشانهٔ مستقل از چند بازار روی یک بازه می‌افتد، آن بازه را برای بازبینی موقعیت‌ها علامت بزنید.']),
      sec('۶. مبنا و منابع تحلیل زمانی', ['مبنای مستقیم: همان روش‌های مکانیکی فایل Temporal_Analysis خود شما (اسکن چرخه، FLD، مربع نُه، شمارش روز گن و نسبت‌های زمانی فیبوناچی از نقاط محوری) که به این برنامه منتقل و برای چند بازار گسترش داده شد.',
        'شمارش روز و مربع نُه: روش‌های منسوب به W. D. Gann (دههٔ ۱۹۳۰ تا ۱۹۵۰). شمارش‌های ۳۰، ۴۵، ۶۰، ۹۰، ۱۲۰، ۱۴۴، ۱۸۰ و ۳۶۰ از تقسیم دایرهٔ ۳۶۰ درجه و عدد ۱۴۴ (مربع ۱۲) می‌آیند.',
        'چرخه‌ها و FLD: J. M. Hurst، کتاب The Profit Magic of Stock Transaction Timing (۱۹۷۰). روش یافتن طول چرخه در این برنامه پریودوگرام (برازش موج سینوسی به روش کمترین مربعات روی سری بدون روند) است که ابزار استاندارد تحلیل طیفی است.',
        'RSI: J. Welles Wilder، کتاب New Concepts in Technical Trading Systems (۱۹۷۸). کانال: رگرسیون خطی کمترین مربعات روی لگاریتم قیمت.',
        'نسبت‌های زمانی فیبوناچی: عرف رایج تحلیل تکنیکال؛ منبع علمی معتبری که اثربخشی‌اش را نشان دهد سراغ ندارم.',
        'اعتبار علمی: تا جایی که می‌دانم، پژوهش دانشگاهی معتبری قدرت پیش‌بینی شمارش‌های گن و نسبت‌های زمانی فیبوناچی را تأیید نکرده است. به همین دلیل برنامه به‌جای ادعای «احتمال بالا»، برای هر نوع نشانه نرخ برخورد واقعی‌اش را روی دادهٔ خود همین بازارها اندازه می‌گیرد و کنار نرخ تصادفی نشان می‌دهد (زبانهٔ تحلیل زمانی، بخش کارنامه).',
        'سناریوها و سطوح: قاعده‌محورند. تمایل از جایگاه در کانال میان‌مدت، واگرایی RSI و نیمهٔ چرخهٔ غالب می‌آید؛ سطح تأیید صعود و نزول بالاترین و پایین‌ترین بسته‌شدن ۱۰ روز اخیر است؛ سطوح بعدی خطوط کانال کوتاه‌مدت و میان‌مدت‌اند؛ حد ضرر نیم ATR زیر کف ۱۰ روز.']),
      sec('۷. بازده واقعی و سری‌های نسبت', ['بازده واقعی = (۱ + بازده یک‌ساله) ÷ (۱ + تورم نقطه‌به‌نقطه) − ۱. تورم ورودی شماست و خودکار دریافت نمی‌شود.', '«شاخص کل به دلار» = شاخص کل تقسیم بر دلار آزاد همان روز؛ نشان می‌دهد بورس نسبت به دلار گران یا ارزان شده است. هر نسبت دیگری را در «داده و تنظیمات» با نوع «نسبت دو سری» و نوشتن «نام اول / نام دوم» بسازید.',
        'تفاوت تتر و دلار آزاد، یا طلای ۱۸ و انس × دلار (حباب)، در ابزارهای «سیگنال ارز و تتر» و «سیگنال طلا و سکه» حساب می‌شود.'])]);
  }
  /* ---------- report: answer first, then the reasons, the evidence, the validity of each method, and the solution ---------- */
  function buildReport(R, S) {
    var M = S.macro || {}, rp = S.rep || {}, pick = rp.sel && rp.sel.length ? rp.sel : null, rows = R.rows.filter(function (a) { return a.ok && (!pick || pick.indexOf(a.name) >= 0); }), B = [], V = R.V, names = function (l) { return l.map(function (a) { return a.name; }).join('، '); };
    var mOk = rows.filter(function (a) { return a.h.m.ok; }), top = mOk.filter(function (a) { return a.h.m.pos >= 0.9; }), bot = mOk.filter(function (a) { return a.h.m.pos <= 0.1; }), bear = rows.filter(function (a) { return (a.h.m.ok && a.h.m.dv.bear) || (a.h.s.ok && a.h.s.dv.bear); }), bull = rows.filter(function (a) { return (a.h.m.ok && a.h.m.dv.bull) || (a.h.s.ok && a.h.s.dv.bull); });
    var ln = function (k) { return rows.filter(function (a) { return a.plan && a.plan.lean === k; }); }, dn = ln('dn'), up = ln('up'), fl = ln('flat');
    var rial = rows.filter(function (a) { return !a.usd && isFinite(a.ret.y1); }), beat = isFinite(M.point) ? rial.filter(function (a) { return a.ret.y1 > M.point; }) : [];
    var next = R.cal.filter(function (c) { return c.rank >= 1; })[0];
    B.push({ t: 'h1', x: rp.title || 'گزارش تحلیل مالی بازارهای ایران' });
    B.push({ t: 'meta', x: 'تاریخ داده: ' + (S.meta.asOf || '—') + ' · منبع: ' + (R.sample ? 'دادهٔ نمونه (ساختگی)' : (S.meta.source || '—')) + (rp.by ? ' · تهیه‌کننده: ' + rp.by : '') + ' · ' + fa(rows.length, 0) + ' بازار' });
    if (R.sample) B.push({ t: 'warn', x: 'این گزارش روی دادهٔ نمونه ساخته شده و اعدادش واقعی نیست. پیش از استفاده، داده را دریافت کنید.' });
    if (!rows.length) { B.push({ t: 'p', x: 'این بخش قابل تکمیل نیست: برای هیچ بازاری دادهٔ کافی وجود ندارد.' }); return B; }
    // 1 answer
    B.push({ t: 'h2', x: '۱. نتیجهٔ اصلی' });
    B.push({ t: 'lead', x: 'از ' + fa(rows.length, 0) + ' بازار، خوانش کانال و مومنتوم در ' + fa(dn.length, 0) + ' بازار نزولی' + (dn.length ? ' (' + names(dn) + ')' : '') + '، در ' + fa(up.length, 0) + ' بازار صعودی' + (up.length ? ' (' + names(up) + ')' : '') + ' و در ' + fa(fl.length, 0) + ' بازار بدون جهت است. ' +
      (dn.length ? 'اقدام اصلی: در بازارهای با تمایل نزولی خرید تازه متوقف و حد ضرر موقعیت‌های باز بالا آورده شود. ' : '') + (up.length ? 'در بازارهای با تمایل صعودی، خرید فقط پس از تأیید قیمتی و پله‌ای. ' : '') + (!dn.length && !up.length ? 'اقدام اصلی: تغییری در موقعیت‌ها لازم نیست؛ فقط سطوح تأیید پایش شود. ' : '') +
      (isFinite(M.point) && rial.length ? 'در یک سال گذشته ' + fa(beat.length, 0) + ' از ' + fa(rial.length, 0) + ' دارایی ریالی از تورم نقطه‌به‌نقطهٔ ' + pct(M.point, 1).replace('+', '') + ' جلو زده‌اند' + (beat.length ? ' (' + names(beat) + ')' : '') + '.' : '') });
    // 2 reasons
    B.push({ t: 'h2', x: '۲. سه دلیل کلیدی' });
    B.push({ t: 'ol', x: [
      'جایگاه و روند: در افق میان‌مدت ' + fa(top.length, 0) + ' بازار نزدیک سقف کانال' + (top.length ? ' (' + names(top) + ')' : '') + ' و ' + fa(bot.length, 0) + ' بازار نزدیک کف' + (bot.length ? ' (' + names(bot) + ')' : '') + ' است؛ شیب کانال میان‌مدت در ' + fa(mOk.filter(function (a) { return a.h.m.ch.b > 0; }).length, 0) + ' از ' + fa(mOk.length, 0) + ' بازار صعودی است.',
      'مومنتوم و زمان: واگرایی منفی RSI در ' + fa(bear.length, 0) + ' بازار' + (bear.length ? ' (' + names(bear) + ')' : '') + ' و واگرایی مثبت در ' + fa(bull.length, 0) + ' بازار' + (bull.length ? ' (' + names(bull) + ')' : '') + ' دیده می‌شود. ' + (next ? 'نزدیک‌ترین تاریخ کلیدی: ' + calDate(next) + ' (' + fa(Math.max(0, next.in), 0) + ' روز دیگر، اهمیت ' + RANK[next.rank][0] + '). ' : 'تاریخ کلیدی هم‌زمانی در افق تقویم نیست. ') + (V.timeOk ? '' : 'نشانه‌های زمانی در دادهٔ همین بازارها بهتر از تصادف نبوده‌اند، پس فقط یادآور بازبینی‌اند.'),
      isFinite(M.point) ? 'تورم و بازده واقعی: با تورم نقطه‌به‌نقطهٔ ' + pct(M.point, 1).replace('+', '') + ' (' + (M.asOf || '—') + '، ورودی کاربر)، ' + (rial.length ? 'بهترین بازده واقعی یک‌ساله: ' + (function () { var b = rial.slice().sort(function (u, v) { return v.ret.y1 - u.ret.y1; }); return b[0].name + ' ' + pct((1 + b[0].ret.y1) / (1 + M.point) - 1) + '؛ بدترین: ' + b[b.length - 1].name + ' ' + pct((1 + b[b.length - 1].ret.y1) / (1 + M.point) - 1) + '.'; })() : 'بازده یک‌ساله برای دارایی‌های ریالی در دسترس نیست.') : 'تورم و بازده واقعی: این بخش قابل تکمیل نیست، چون عدد تورم وارد نشده است.'] });
    // 3 evidence
    B.push({ t: 'h2', x: '۳. شواهد' });
    B.push({ t: 'h3', x: 'وضعیت هر بازار در سه افق' });
    var cell = function (x) { return x.ok ? READ[x.read][0] + ' · ' + posLbl(x) + (x.dv.bear ? ' · واگرایی −' : x.dv.bull ? ' · واگرایی +' : '') : '—'; };
    B.push({ t: 'table', head: ['بازار', 'آخرین', 'کوتاه‌مدت', 'میان‌مدت', 'بلندمدت', 'اعتبار کانال میان‌مدت'], rows: rows.map(function (a) { return [a.name, fa(a.last), cell(a.h.s), cell(a.h.m), cell(a.h.l), a.h.m.ok ? a.h.m.quality : '—']; }) });
    B.push({ t: 'small', x: 'درصد = جایگاه قیمت در کانال همان افق (۰٪ کف، ۱۰۰٪ سقف). کوتاه‌مدت: ' + fa(S.opt.sWin, 0) + ' کندل روزانه؛ میان‌مدت: ' + fa(S.opt.mWin, 0) + ' هفته؛ بلندمدت: ' + (Number(S.opt.lWin) ? fa(S.opt.lWin, 0) + ' هفته' : 'کل تاریخچه') + '.' });
    B.push({ t: 'h3', x: 'بازده‌ها و فاصله تا خطوط کانال میان‌مدت' });
    B.push({ t: 'table', head: ['بازار', '۱ ماه', '۳ ماه', '۱ سال', 'واقعی ۱ سال', 'تا سقف', 'تا میانه', 'تا کف'], rows: rows.map(function (a) { var m = a.h.m; return [a.name, pct(a.ret.m1), pct(a.ret.m3), pct(a.ret.y1), isFinite(M.point) && isFinite(a.ret.y1) && !a.usd ? pct((1 + a.ret.y1) / (1 + M.point) - 1) : '—', m.ok ? pct(m.toUp) : '—', m.ok ? pct(m.toMid) : '—', m.ok ? pct(m.toLo) : '—']; }) });
    var hot = R.cal.filter(function (c) { return c.rank >= 1; }).slice(0, 6);
    B.push({ t: 'h3', x: 'تاریخ‌های کلیدی پیش رو' });
    if (hot.length) B.push({ t: 'table', head: ['تاریخ', 'روز دیگر', 'اهمیت', 'نشانه‌ها', 'بازارها'], rows: hot.map(function (c) { return [calDate(c), fa(Math.max(0, c.in), 0), RANK[c.rank][0], fa(c.n, 0) + ' (' + fa(c.x, 1) + ' برابر عادی)', c.assets.join('، ')]; }) }); else B.push({ t: 'p', x: 'تاریخ هم‌زمانی با اهمیت متوسط یا زیاد در ' + fa(S.opt.ahead, 0) + ' روز آینده نیست.' });
    // 4 validity
    B.push({ t: 'h2', x: '۴. اعتبار علمی هر روش و سابقهٔ آن در دادهٔ همین بازارها' });
    B.push({ t: 'p', x: 'هر روش دو بار سنجیده می‌شود: یک بار با پژوهش‌های منتشرشده و یک بار روی تاریخچهٔ خود این بازارها (بازبینی گذشته با دادهٔ تا همان روز). فقط روش‌هایی که پشتوانهٔ پژوهشی دارند، یا در این داده تأیید شده‌اند، در «خوانش کانال و مومنتوم» و راه‌حل نقش دارند. برای «تأیید» آستانهٔ سخت‌گیرانه (سه انحراف معیار) لازم است، چون بازارها به هم وابسته‌اند و چندین روش هم‌زمان آزموده می‌شود؛ برای «کنار گذاشتن» دو انحراف معیار کافی است.' });
    B.push({ t: 'table', head: ['روش', 'پشتوانهٔ پژوهشی', 'خلاصهٔ شواهد', 'سابقه در این داده', 'نقش در راه‌حل'], rows: V.rows.map(function (r) { return [r.m, GRADE[r.g], r.src, r.own, r.use]; }) });
    if (!S.rstat || !S.tstat) B.push({ t: 'warn', x: 'ستون «سابقه در این داده» هنوز محاسبه نشده است؛ در زبانهٔ تحلیل زمانی «محاسبهٔ کارنامه» را بزنید یا داده را دریافت کنید.' });
    else if (S.tstat.sample) B.push({ t: 'small', x: 'سابقه روی دادهٔ نمونه حساب شده و بی‌معناست.' });
    // 5 solution
    B.push({ t: 'h2', x: '۵. راه‌حل' });
    var ord = dn.concat(up, fl).filter(function (a) { return a.plan && a.plan.up; });
    B.push({ t: 'h3', x: 'اقدام‌ها به ترتیب اولویت' });
    if (ord.length) B.push({ t: 'table', head: ['بازار', 'حکم مرکزی', 'روند (قاعدهٔ واحد سیستم)', 'خوانش کانال و مومنتوم (نه حکم)', 'چرا', 'تأیید صعود بالای', 'تأیید نزول زیر', 'حد ضرر خرید', 'منبع سطوح'], rows: ord.map(function (a) { var p2 = a.plan; return [a.name, p2.cen ? p2.cen.actFa + ' — ' + p2.cen.stFa : 'ندارد (در موتور مرکزی معامله نمی‌شود)', (a.trFa || '—').replace(/^روند \(قاعدهٔ واحد سیستم\) /, ''), LEAN[p2.lean][0], p2.why.join('؛ ') || '—', fa(p2.lv.hi10), fa(p2.lv.lo10), p2.cen ? fa(p2.stopL) : '—', p2.cen ? 'حکم مرکزی (نسخهٔ ' + fa(p2.cen.ver || 0, 0) + ')' : 'سطوح پایش تحلیلی؛ سیگنال نیست']; }) });
    ord.forEach(function (a) { B.push({ t: 'h4', x: a.name + ' — ' + (a.trFa || '') + ' · ' + LEAN[a.plan.lean][0] }); B.push({ t: 'ul', x: [a.plan.status, a.plan.when, a.plan.up, a.plan.dn, a.plan.flat, a.plan.act] }); });
    if (!ord.length) B.push({ t: 'p', x: 'این بخش قابل تکمیل نیست: دادهٔ روزانهٔ کافی برای سطوح و سناریوها نیست (یک بار «دریافت» را بزنید).' });
    B.push({ t: 'h3', x: 'مدیریت ریسک مشترک' });
    B.push({ t: 'ul', x: ['در هر تصمیم حداکثر ۱٪ سرمایه ریسک شود: حجم = ۱٪ سرمایه ÷ فاصلهٔ ورود تا حد ضرر.', 'حد ضرر نزدیک‌تر از نوسان روزانهٔ معمول (ATR) گذاشته نشود.', 'بازارهای هم‌خانواده (دلار، تتر، یورو، درهم؛ یا سکه و طلا) یک ریسک‌اند؛ مجموع موقعیت در یک خانواده مثل یک موقعیت حساب شود.', 'در بازهٔ ±۳ روز تاریخ‌های کلیدی با اهمیت زیاد، موقعیت اهرمی تازه گرفته نشود' + (V.timeOk ? '.' : '؛ این فقط احتیاط است، چون نشانه‌های زمانی در این داده بهتر از تصادف نبوده‌اند.')] });
    B.push({ t: 'h3', x: 'چه چیزی این نتیجه را عوض می‌کند' });
    B.push({ t: 'ul', x: ['بسته‌شدن قیمت بیرون از دو سطح تأیید هر بازار (جدول بالا): همان روز سناریوی آن سمت فعال می‌شود.', 'عدد تازهٔ تورم یا تغییر محسوس نرخ ارز: بازده واقعی و ترتیب دارایی‌ها باید دوباره حساب شود.', 'به‌روزرسانی کارنامه: اگر روشی در دادهٔ تازه «خلافش دیده شد»، خودکار از خوانش کانال و مومنتوم کنار می‌رود.'] });
    if (rp.view) { B.push({ t: 'h3', x: 'جمع‌بندی و نظر تحلیلگر' }); String(rp.view).split('\n').filter(Boolean).forEach(function (l) { B.push({ t: 'p', x: l }); }); }
    // 6 limits + refs
    B.push({ t: 'h2', x: '۶. محدودیت‌ها و منابع' });
    B.push({ t: 'ul', x: ['خروجی قاعده‌محور است، نه توصیهٔ خرید یا فروش؛ تصمیم نهایی با تحلیلگر است.', 'عامل‌های بنیادی (سود شرکت‌ها، نرخ بهره، بودجه، تحریم، خبر) در مدل نیستند و باید جدا سنجیده شوند.', 'تورم ورودی کاربر است' + (M.src ? ' (' + M.src + ')' : '') + '.', 'سابقه‌سنجی فقط جهت و زمان را می‌سنجد، نه سود پس از کارمزد و لغزش؛ بازارهای هم‌خانواده نمونه‌های مستقل نیستند.', 'کانال توصیف گذشته است و شکست آن همیشه ممکن است؛ هر جا «اعتبار کانال» ضعیف است، سطوح آن بازار کم‌اعتبار است.'] });
    B.push({ t: 'h3', x: 'منابع' }); B.push({ t: 'ol', x: REFS });
    return B;
  }
  function esc(x) { return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function repHtml(B) { return B.map(function (b) { var li = function (a) { return a.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join(''); };
    return b.t === 'h1' ? '<h1>' + esc(b.x) + '</h1>' : /^h[234]$/.test(b.t) ? '<' + b.t + '>' + esc(b.x) + '</' + b.t + '>' : b.t === 'ul' ? '<ul>' + li(b.x) + '</ul>' : b.t === 'ol' ? '<ol>' + li(b.x) + '</ol>' : b.t === 'table' ? '<table><thead><tr>' + b.head.map(function (x) { return '<th>' + esc(x) + '</th>'; }).join('') + '</tr></thead><tbody>' + b.rows.map(function (r) { return '<tr>' + r.map(function (x) { return '<td>' + esc(x) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>' : '<p class="' + b.t + '">' + esc(b.x) + '</p>'; }).join('\n'); }
  function repDoc(B) { return '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>' + esc(B[0].x) + '</title><style>body{font-family:Vazirmatn,Tahoma,Arial,sans-serif;direction:rtl;text-align:right;line-height:1.9;max-width:900px;margin:24px auto;padding:0 16px;color:#111}h1{font-size:22px;border-bottom:2px solid #b8860b;padding-bottom:8px}h2{font-size:17px;margin-top:26px;color:#7a5a00}h3{font-size:15px;margin-top:18px}h4{font-size:14px;margin:14px 0 4px}table{border-collapse:collapse;width:100%;margin:8px 0;font-size:12.5px}th,td{border:1px solid #bbb;padding:5px 7px;vertical-align:top;text-align:right}th{background:#f1ead8}p.lead{font-size:15px;font-weight:600;background:#faf5e6;padding:10px 12px;border-right:4px solid #b8860b}p.meta,p.small{color:#555;font-size:12.5px}p.warn{color:#a40000;font-weight:600}li{margin-bottom:5px}@page{size:A4;margin:14mm}@media print{body{margin:0;max-width:none;font-size:11.5px}table{font-size:10px;page-break-inside:auto}tr{page-break-inside:avoid}h2,h3,h4{page-break-after:avoid}}</style></head><body>' + repHtml(B) + '</body></html>'; }
  function repText(B) { return B.map(function (b) { return b.t === 'h1' ? b.x + '\n' + '='.repeat(30) : /^h[234]$/.test(b.t) ? '\n' + b.x : b.t === 'ul' || b.t === 'ol' ? b.x.map(function (x, i) { return (b.t === 'ol' ? (i + 1) + '. ' : '• ') + x; }).join('\n') : b.t === 'table' ? [b.head.join(' | ')].concat(b.rows.map(function (r) { return r.join(' | '); })).join('\n') : b.x; }).join('\n'); }
  function reportTab(ctx) {
    var S = ctx.S, R = ctx.R; if (!S.rep) S.rep = { title: '', by: '', view: '', sel: [] };
    var B = buildReport(R, S), body = h('div', { class: 'report-body print-report lv-report', 'data-notr': '1' });
    B.forEach(function (b) { var li = function (a) { return a.map(function (x) { return h('li', { text: x }); }); };
      body.appendChild(b.t === 'h1' ? h('h2', { class: 'rep-title', text: b.x }) : b.t === 'h2' ? h('h3', { text: b.x }) : b.t === 'h3' ? h('h4', { text: b.x }) : b.t === 'h4' ? h('h5', { text: b.x }) : b.t === 'ul' ? h('ul', { class: 'studio-l' }, li(b.x)) : b.t === 'ol' ? h('ol', { class: 'studio-l' }, li(b.x)) : b.t === 'table' ? table(b.head, b.rows) : h('p', { class: b.t === 'lead' ? 'rep-lead' : b.t === 'warn' ? 'neg' : b.t === 'meta' || b.t === 'small' ? 'small muted' : '', text: b.x })); });
    var fn = 'Iran_Markets_Report_' + String(S.meta.asOf || '').replace(/[^\d]/g, '').slice(0, 8);
    var btns = Hub.report.buttons(function () { return B; }, fn);
    var all = R.rows.filter(function (a) { return a.ok; }), box = h('div', { class: 'row-ctl', style: 'flex-wrap:wrap' }, all.map(function (a) { var i = h('input', { type: 'checkbox', 'aria-label': a.name }); i.checked = !S.rep.sel.length || S.rep.sel.indexOf(a.name) >= 0; i.addEventListener('change', function () { var cur = S.rep.sel.length ? S.rep.sel.slice() : all.map(function (x) { return x.name; }); if (i.checked) { if (cur.indexOf(a.name) < 0) cur.push(a.name); } else cur = cur.filter(function (x) { return x !== a.name; }); S.rep.sel = cur.length === all.length ? [] : cur; ctx.rerender(); }); return h('label', { class: 'chk-l', 'data-notr': '1' }, [i, document.createTextNode(' ' + a.name)]); }));
    var f = G.form({ id: 'lv-r', onChange: ctx.rerender, fields: [{ key: 'ti', label: 'عنوان گزارش', type: 'text', get: function () { return S.rep.title || ''; }, set: function (v) { S.rep.title = v; } }, { key: 'by', label: 'تهیه‌کننده', type: 'text', get: function () { return S.rep.by || ''; }, set: function (v) { S.rep.by = v; } }] });
    var view = h('textarea', { class: 'f-area', rows: 4, dir: 'rtl', 'aria-label': 'نظر تحلیلگر', placeholder: 'نظر و تصمیم خودتان (اختیاری؛ در بخش راه‌حل گزارش می‌آید)' }); view.value = S.rep.view || ''; view.addEventListener('change', function () { S.rep.view = view.value; ctx.rerender(); });
    return ctx.group([ctx.panel('تنظیم گزارش', [P('گزارش از همین داده و مدل‌ها ساخته می‌شود: اول نتیجه، بعد سه دلیل، بعد شواهد، اعتبار علمی هر روش، و در پایان راه‌حل. بازارها را انتخاب کنید و اگر خواستید نظر خودتان را اضافه کنید.'), f, h('p', { class: 'small muted', 'data-notr': '1', text: 'بازارهای گزارش:' }), box, view, btns]), ctx.panel('پیش‌نمایش گزارش', [Hub.report.lintPanel(function () { return B; }), body]), ctx.panel('گزارش در قالب مقاله', [Hub.report.articlePanel(function () { return B; }, { name: 'Iran_Markets_Article' })])]);
  }
  function dataTab(ctx) {
    var S = ctx.S;
    var lst = ctx.list({ id: 'lv-a', path: 'assets', onChange: ctx.rerender, newRow: function () { return { name: '', kind: 'tgju', key: '', usd: false, active: true }; }, cols: [{ key: 'name', label: 'نام نمایشی', kind: 'text' },
      { key: 'kind', label: 'نوع', kind: 'select', options: function () { return [['tse-index', 'شاخص (کد TSETMC)'], ['tse', 'نماد بورسی (نماد یا کد)'], ['tgju', 'کلید TGJU'], ['ratio', 'نسبت دو سری (نام اول / نام دوم)']]; } }, { key: 'key', label: 'نماد / کد / کلید / نسبت', kind: 'text' }, { key: 'usd', label: 'ارزی', kind: 'bool' }, { key: 'active', label: 'فعال', kind: 'bool' }] });
    var o = G.form({ id: 'lv-o', onChange: ctx.rerender, fields: [ctx.field('ws', 'پنجرهٔ کوتاه‌مدت (کندل روزانه)', 'opt.sWin', 'int'), ctx.field('wm', 'پنجرهٔ میان‌مدت (هفته)', 'opt.mWin', 'int'), ctx.field('wl', 'پنجرهٔ بلندمدت (هفته؛ ۰ = کل تاریخچه)', 'opt.lWin', 'int'), ctx.field('cv', 'پوشش کانال', 'opt.cover', 'pct'), ctx.field('ah', 'افق تقویم زمانی (روز)', 'opt.ahead', 'int')] });
    var m = G.form({ id: 'lv-m', onChange: ctx.rerender, fields: [ctx.field('ma', 'تورم سالانه (میانگین ۱۲ ماه)', 'macro.annual', 'pct', { optional: true }), ctx.field('mp', 'تورم نقطه‌به‌نقطه', 'macro.point', 'pct', { optional: true }), ctx.field('mm', 'تورم ماهانه', 'macro.monthly', 'pct2', { optional: true }),
      { key: 'md', label: 'ماه گزارش', type: 'text', get: function () { return S.macro.asOf || ''; }, set: function (v) { S.macro.asOf = v; } }, { key: 'ms', label: 'منبع', type: 'text', get: function () { return S.macro.src || ''; }, set: function (v) { S.macro.src = v; } }] });
    return ctx.group([ctx.panel('دریافت داده', [Hub.updateAllPanel ? Hub.updateAllPanel(ctx) : h('div', { class: 'upd-box' }, [h('div', { class: 'row-ctl' }, [Hub.dataCenterLink()]), Hub.signals && Hub.signals.agesText ? h('p', { class: 'small muted', text: 'سن داده‌ها: ' + Hub.signals.agesText() }) : null, h('div', { id: 'upd-log', 'aria-live': 'polite' })]), h('p', { class: 'small muted', text: 'دکمهٔ بالا همهٔ بخش‌ها را با هم به‌روز می‌کند (معامله‌گری، اقتصاد ایران، خبرها، ورودی‌های مدل‌ها). دکمهٔ پایین فقط سری‌های همین بخش را.' }), SG.fetchBar ? SG.fetchBar(ctx, fetchAll, 'Fetch all series (TSETMC, TGJU)') : null,
      P('برای هر سری کل تاریخچهٔ در دسترس گرفته می‌شود (شاخص‌ها: کل تاریخچه؛ نمادها: تا ۳۰۰۰ روز، تعدیل‌شده؛ TGJU: هرچه برمی‌گرداند). ۶۰۰ کندل روزانهٔ آخر و کل کندل‌های هفتگی ذخیره می‌شود. بورس فقط با اینترنت داخل ایران می‌آید.'),
      (S.lastErrs || []).length ? P('دریافت‌نشده در آخرین بار: ' + S.lastErrs.join(' · '), 'small warn-t') : null]),
      ctx.panel('سری‌ها', [P('کلیدهای TGJU همان نشانی صفحهٔ هر شاخص در tgju.org است (مثلاً price_dollar_rl). کلیدهای بیت‌کوین (crypto-bitcoin) و نفت برنت (oil_brent) را نتوانستم از این‌جا بیازمایم؛ اگر دریافت نشدند، کلید درست را از نشانی صفحهٔ همان شاخص بردارید و این‌جا اصلاح کنید. «ارزی» یعنی قیمت به دلار است و با تورم ریالی مقایسه نمی‌شود.'), lst]),
      ctx.panel('پنجره‌ها و تنظیمات', [o]), ctx.panel('تورم (ورودی شما)', [P('این اعداد خودکار دریافت نمی‌شوند. از گزارش ماهانهٔ مرکز آمار ایران وارد کنید.'), m])]);
  }
  Hub.iranMarkets = { KEY: KEY, run: run, series: series, ensure: ensure, sample: sample, READ: READ, LEAN: LEAN, HZ: HZ, ZONE: ZONE, family: family, calDate: calDate, RANK: RANK };
  SG.feeds.push({ id: 'long-view', title: 'Iran markets: three-horizon history', storeKey: KEY, sample: sample, fetch: fetchAll, size: function (S) { return S.assets.filter(function (a) { return a.active !== false; }).length + ' سری'; }, src: 'TSETMC + TGJU' });
  TK.define({
    id: 'long-view', title: 'Iran economy: financial market analysis', sections: ['iran'], priority: 1, version: 1, storeKey: KEY,
    summary: 'Tehran exchange, dollar, tether, gold, coin, bitcoin and oil on three horizons (short, medium, long): trend channel, RSI divergence, time cycles and one calendar of key dates, inflation-adjusted returns and a ready-to-edit market note.',
    sample: sample, blank: sample, run: run, scenarios: false,
    eyebrow: function () { return 'Iran economy · Markets'; }, heading: function () { return 'تحلیل مالی اقتصاد ایران'; }, filename: function () { return 'Iran_Markets'; },
    xlsx: function (S, R) { var b = Hub.xl.book(root.ExcelJS, 'IranMarkets'), put = function (s, r, vals) { vals.forEach(function (v, i) { s.put(1 + i, r, v, typeof v === 'number' ? 'calc' : 'wrap', typeof v === 'number' ? (Math.abs(v) < 10 && v % 1 ? 'dec' : 'money') : undefined); }); }, rd = function (v, k) { return isFinite(v) ? Math.round(v * (k || 1) * 10) / 10 : ''; };
      HZ.forEach(function (H) { var s = b.sheet(H.name, [2, 22, 14, 12, 8, 10, 18, 14, 14, 14, 10, 10, 10, 14, 14, 10, 8], { rightToLeft: true }); s.title('تحلیل ' + H.name + ' — ' + H.sub, (S.meta.asOf || '') + (R.sample ? ' · دادهٔ نمونه' : ''));
        ['سری', 'آخرین', 'جایگاه (٪)', 'RSI', 'واگرایی', 'خوانش', 'سقف', 'میانه', 'کف', 'تا سقف ٪', 'تا میانه ٪', 'تا کف ٪', 'سقف آینده', 'کف آینده', 'شیب سالانه ٪', 'R²'].forEach(function (t, i) { s.put(1 + i, 4, t, 'hdr'); });
        R.rows.forEach(function (a, k) { var x = a.h[H.id]; if (!x.ok) { s.put(1, 5 + k, a.name, 'wrap'); return; } put(s, 5 + k, [a.name, x.last, Math.round(x.pos * 100), Math.round(x.rsi), x.dv.bear ? 'منفی' : x.dv.bull ? 'مثبت' : '', READ[x.read][0], x.up, x.mid, x.lo, rd(x.toUp, 100), rd(x.toMid, 100), rd(x.toLo, 100), x.upF2, x.loF2, rd(x.ch.growth, 100), Math.round(x.ch.r2 * 100) / 100]); }); });
      var s3 = b.sheet('بازده', [2, 22, 14, 12, 12, 12], { rightToLeft: true }); s3.title('بازده‌ها (٪)'); ['سری', 'آخرین', '۱ ماه', '۳ ماه', '۱ سال'].forEach(function (t, i) { s3.put(1 + i, 4, t, 'hdr'); }); R.rows.forEach(function (a, k) { put(s3, 5 + k, [a.name, a.last || '', rd(a.ret.m1, 100), rd(a.ret.m3, 100), rd(a.ret.y1, 100)]); });
      var s4 = b.sheet('تقویم زمانی', [2, 22, 12, 10, 10, 110], { rightToLeft: true }); s4.title('تاریخ‌های کلیدی پیش رو'); ['تاریخ', 'روز دیگر', 'اهمیت', 'تعداد', 'شرح'].forEach(function (t, i) { s4.put(1 + i, 4, t, 'hdr'); });
      R.cal.forEach(function (c, k) { put(s4, 5 + k, [calDate(c), Math.max(0, c.in), RANK[c.rank][0], c.n, c.items.map(function (x) { return x.name + ': ' + winText(x.w); }).join(' | ')]); });
      var s5 = b.sheet('چرخه‌ها', [2, 22, 12, 12, 10, 10, 14, 14], { rightToLeft: true }); s5.title('چرخه‌های غالب'); ['سری', 'طول (کندل)', 'روز تقویمی', 'قدرت', 'فاز', 'کف بعدی', 'قلهٔ بعدی'].forEach(function (t, i) { s5.put(1 + i, 4, t, 'hdr'); }); var r5 = 5;
      R.rows.forEach(function (a) { if (!a.cy || !a.cy.ok) return; a.cy.cycles.forEach(function (c) { put(s5, r5++, [a.name, c.period, c.calDays, Math.round(c.strength * 100) / 100, Math.round(c.phase * 100) / 100, J.jstr(LV.jdnOf(a.date) + c.troughIn), J.jstr(LV.jdnOf(a.date) + c.peakIn)]); }); });
      var s6 = b.sheet('کارنامهٔ زمانی', [2, 44, 10, 12, 12, 12, 12, 22, 10], { rightToLeft: true }); s6.title('کارنامهٔ نشانه‌های زمانی', 'نرخ برخورد با چرخش واقعی (±۲ کندل) در برابر نرخ تصادفی'); ['نوع نشانه', 'تعداد', 'نرخ برخورد ٪', 'تصادفی ٪', 'نسبت', 'نسبت تحرک', 'داوری', 'وزن'].forEach(function (t, i) { s6.put(1 + i, 4, t, 'hdr'); });
      Object.keys(R.ST || {}).forEach(function (k, i) { var q = R.ST[k]; put(s6, 5 + i, [clsName(k), q.n, rd(q.rate, 100), rd(q.base, 100), isFinite(q.lift) ? Math.round(q.lift * 100) / 100 : '', isFinite(q.move) ? Math.round(q.move * 100) / 100 : '', VERD[q.verdict][0], Math.round(q.w * 100) / 100]); });
      var s7 = b.sheet('سناریوها', [2, 22, 14, 14, 90], { rightToLeft: true }); s7.title('سناریوها و اقدام پیشنهادی مدل برای هر بازار'); ['بازار', 'قیمت', 'تمایل', 'شرح'].forEach(function (t, i) { s7.put(1 + i, 4, t, 'hdr'); }); var r7 = 5;
      R.rows.forEach(function (a) { if (!a.plan || !a.plan.up) return; [a.plan.up, a.plan.dn, a.plan.flat, a.plan.act, a.plan.risk].forEach(function (t, i) { put(s7, r7++, [i ? '' : a.name, i ? '' : a.last, i ? '' : LEAN[a.plan.lean][0], t]); }); });
      var s2 = b.sheet('یادداشت بازار', [2, 120], { rightToLeft: true }); s2.title('یادداشت بازار'); note(R, S).split('\n').forEach(function (l, i) { s2.put(1, 4 + i, l, 'wrap'); }); return b.wb; },
    kpis: function (ctx) { var r = function () { return ctx.R.rows.filter(function (a) { return a.ok; }); }, cnt = function (fn) { var n = []; r().forEach(function (a) { if (['m', 'l'].some(function (k) { return a.h[k].ok && fn(a.h[k]); })) n.push(a.name); }); return n; }; return [
      ['Series', function () { return fa(r().length, 0); }, function () { return 'سه افق: کوتاه، میان، بلند'; }],
      ['Near channel top', function () { return fa(cnt(function (x) { return x.pos >= 0.9; }).length, 0); }, function () { return cnt(function (x) { return x.pos >= 0.9; }).join('، ') || 'میان‌مدت یا بلندمدت'; }],
      ['Bearish divergence', function () { return fa(cnt(function (x) { return x.dv.bear; }).length, 0); }, function () { return cnt(function (x) { return x.dv.bear; }).join('، ') || 'هفتگی'; }],
      ['Near channel bottom', function () { return fa(cnt(function (x) { return x.pos <= 0.1; }).length, 0); }, function () { return cnt(function (x) { return x.pos <= 0.1; }).join('، ') || 'میان‌مدت یا بلندمدت'; }],
      ['Next key date', function () { var c = ctx.R.cal.filter(function (x) { return x.rank >= 1; })[0]; return c ? J.jstr(c.from) : '—'; }, function () { var c = ctx.R.cal.filter(function (x) { return x.rank >= 1; })[0]; return c ? fa(Math.max(0, c.in), 0) + ' روز دیگر · اهمیت ' + RANK[c.rank][0] : 'تحلیل زمانی'; }]]; },
    tabs: [{ group: 'Outputs', items: [['outlook', 'نمای کلی و یادداشت بازار', overviewTab], ['hz', 'کوتاه‌مدت، میان‌مدت، بلندمدت', horizonTab], ['chart', 'نمودار کانال و RSI', chartTab], ['time', 'تحلیل زمانی و تاریخ‌های کلیدی', timeTab], ['report', 'گزارش و راه‌حل', reportTab], ['guide', 'راهنمای مدل‌ها و اعتبار علمی', guideTab]] },
      { group: 'Inputs', items: [['data', 'داده و تنظیمات', dataTab], ['t-sig-temporal', 'تحلیل زمانی تفصیلی (یک سری)', TK.embedTab('sig-temporal', 'همان ابزار مستقل تحلیل زمانی برای یک سری دلخواه، با نقاط محوری و تنظیمات دستی.')]] }]
  });
})(window);
