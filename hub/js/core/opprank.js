/* =====================================================================
 * OPPORTUNITY LAYER OF THE CENTRAL VERDICT — directive 18 (2026-11-19).
 * Runs inside the central engine (tradeengine.centralBuild → Hub.oppRank.enrich) on the same records every page reads,
 * so the dashboard, the alerts inbox and the market pages cannot disagree. It adds, per asset:
 *   st4     floor / ceiling state, separate from the trade signal: nearFloor · upConf · nearCeil · dnConf · strongUp · downTrend · none
 *   exec    analytic (attractive, not confirmed) · confirmed (central «تأییدشده») · executable (confirmed + tradable + liquid + no queue / halt + fresh data)
 *   cats    inbox categories: buy · scale · hold · holdIf · wait · tp · reduce · close · sell · risk
 *   pri     explainable priority score 0–100 (buy side), its parts and the penalties for concentration / correlation
 *   spri    priority of the sell side (positions first)
 *   grp     industry group of a stock (from its TSETMC sub-sector name) / fund type
 * And for the whole record: alloc — which asset class has the better opportunities now (rule-based aggregation, not back-tested).
 * Nothing here upgrades a signal: «executable» is a subset of the central «confirmed», never more.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  function isF(x) { return typeof x === 'number' && isFinite(x); }
  function cl(x, a, b) { return Math.max(a, Math.min(b, x)); }

  /* industry groups. The universe file carries TSETMC sub-sector names (≈136); they are grouped here by name into the market's
     main industry groups. Rules are explicit; a name that matches none stays visible under «سایر» with its own sub-sector. */
  var GROUPS = [
    ['funds-gold', 'صندوق طلا', /^صندوق طلا/], ['funds-silver', 'صندوق نقره', /^صندوق نقره/], ['funds-comm', 'صندوق کالایی', /^صندوق کالایی/], ['funds-lev', 'صندوق اهرمی', /^صندوق اهرمی/],
    ['funds-index', 'صندوق شاخصی', /^صندوق شاخصی/], ['funds-equity', 'صندوق سهامی', /^صندوق سهامی/], ['funds-sector', 'صندوق بخشی', /^صندوق بخشی/], ['funds-fixed', 'صندوق درآمد ثابت', /درآمد ثابت/], ['funds-mixed', 'صندوق مختلط', /مختلط/], ['funds-other', 'سایر صندوق‌ها', /^صندوق/],
    ['metal', 'فلزات اساسی', /آهن و فولاد|فلزات اساسی|فلزات گرانبها|سایر فلزات اساسی|ریخته|نورد/],
    ['mining', 'کانه‌های فلزی و معدنی', /استخراج (کانه|آهن|سایر کانه|سایر فلزات|سنگ)|کانه فلزی|زغال سنگ/],
    ['petro', 'محصولات شیمیایی و پتروشیمی', /شیمیایی|پتروشیمی|کود و ترکیبات|پلاستیک اولیه|حشره کش|شوینده|رنگ، بتونه/],
    ['refine', 'پالایشی و فرآورده‌های نفتی', /فرآورده|فراورده|نفتی|پالایش|استخراج نفت/],
    ['bank', 'بانک‌ها و مؤسسات اعتباری', /^بانک|واسطه های پولی|واسطه‌گری‌های پولی/],
    ['invest', 'سرمایه‌گذاری‌ها و واسطه‌گری مالی', /سرمایه.?گذاری|واسطه های مالی|لیزینگ|اداره ی بازارهای مالی|اوراق بهادار|فعالیتهای مالی|تامین وجوه/],
    ['insur', 'بیمه', /بیمه/],
    ['auto', 'خودرو و ساخت قطعات', /وسایل نقلیه|خودرو|تایر/],
    ['cement', 'سیمان، آهک و گچ', /سیمان|آهک و گچ|بتنی/],
    ['tile', 'کاشی، سرامیک و کانی غیرفلزی', /سرامیک|شیشه|معدنی غیرفلزی|نسوز/],
    ['pharma', 'مواد و محصولات دارویی', /دارو|دارویی/],
    ['food', 'غذایی و آشامیدنی', /غذایی|لبنیات|شکر|قند|روغن|نان|کاکائو|نشاسته|نوشیدنی|آبمیوه|ماءالشعیر|خوراک آماده دام/],
    ['agri', 'زراعت و محصولات کشاورزی', /زراعت|پرورش|کشاورزی/],
    ['it', 'مخابرات و فناوری اطلاعات', /مخابرات|نرم افزار|رایانه|ارزش افزوده|فرستنده رادیو/],
    ['transport', 'حمل‌ونقل', /حمل و نقل|حمل‌ونقل|دریایی|راه آهن/],
    ['utility', 'برق و انرژی', /برق|نیروی برق/],
    ['realestate', 'انبوه‌سازی و املاک', /املاک|مستغلات|ساختمان|عمران|پیمانکاری/],
    ['machinery', 'ماشین‌آلات و تجهیزات', /ماشین آلات|تجهیزات|موتورها|کابل|پمپ|بالابر|مولد|اجاق|باتری|لامپ|کارد و چنگال|وسایل خانگی|گیرنده رادیو/],
    ['textile', 'منسوجات، چرم و کاغذ', /نخ|پارچه|فرش|چرم|کاغذ|مقوا|تخته|چاپ/],
    ['multi', 'شرکت‌های چندرشته‌ای صنعتی', /چند رشته/]];
  function grpOf(r) {
    if (r.cls === 'intl') return { k: 'intl', fa: 'شاخص‌های جهانی', ok: true };
    // funds: the type from the exchange's fund registry (or from the fund's own name, marked unconfirmed)
    if (r.cls === 'fund' && r.ftype && Hub.tseRegistry && Hub.tseRegistry.FTFA[r.ftype]) return { k: 'funds-' + (r.ftype === 'lev' ? 'lev' : r.ftype === 'equity' ? 'equity' : r.ftype), fa: Hub.tseRegistry.FTFA[r.ftype], ok: r.ftSrc === 'registry', src: r.ftSrc === 'registry' ? 'ثبت صندوق‌ها' : 'از نام صندوق' };
    // shares: the official industry code of the exchange (csv of the market watch, names from the industry indices)
    if (r.cls === 'stock' && r.cs && r.csName) return { k: 'cs' + r.cs, fa: r.csName, ok: true, src: 'کد رسمی صنعت ' + r.cs };
    if (r.cls === 'gold') return { k: 'gold', fa: 'طلا و سکه' }; if (r.cls === 'fx') return { k: 'fx', fa: 'ارز' }; if (r.cls === 'crypto') return { k: 'crypto', fa: 'رمزارز' }; if (r.cls === 'commodity') return { k: 'commodity', fa: 'کالا و انرژی' };
    // no official code yet (registry not read on this device): the rule-based grouping of the sub-sector name, marked unconfirmed
    var s = String(r.sector || '');
    for (var i = 0; i < GROUPS.length; i++) if (GROUPS[i][2].test(s)) return { k: GROUPS[i][0], fa: GROUPS[i][1], ok: false, src: 'از نام زیرگروه (تأییدنشده)' };
    return { k: r.cls === 'fund' ? 'funds-other' : 'other', fa: r.cls === 'fund' ? 'سایر صندوق‌ها' : 'سایر صنایع', ok: false, src: 'طبقه‌بندی تأییدنشده' };
  }

  var ST4 = { nearFloor: 'نزدیک کف احتمالی (برگشت تأیید نشده)', upConf: 'تأیید برگشت صعودی', nearCeil: 'نزدیک سقف احتمالی', dnConf: 'تأیید برگشت نزولی', strongUp: 'روند صعودی، هنوز به سقف احتمالی نرسیده', downTrend: 'روند نزولی، کف احتمالی هنوز نزدیک نیست', none: 'بدون وضعیت کف یا سقف' };
  var EXFA = { analytic: 'فرصت تحلیلی (تأیید نشده)', confirmed: 'فرصت تأییدشده (اجرا محدود است)', executable: 'فرصت قابل اجرا', none: '—' };
  function st4Of(r) {
    var L = r.L || {}, t = r.tzState, up = 0, dn = 0, v = r.hzv || {};
    ['s', 'm', 'l'].forEach(function (k) { if (v[k] && v[k].view === 'up') up++; if (v[k] && v[k].view === 'down') dn++; });
    // «near» = inside the zone, or approaching it and at most one ATR away (the same rule as the bottom tier of the central verdict)
    var a = r.atrAbs, px = r.px, close = function (lv) { return isF(a) && isF(px) && isF(lv) && Math.abs(px - lv) <= a; };
    if (L.floor) { if (t === 'confirmed') return 'upConf'; if (t === 'inZone' || (t === 'approach' && close(Math.max(L.floor[0], L.floor[1])))) return 'nearFloor'; }
    if (L.ceil) { if (t === 'confirmed' || r.sell === 'confirmed') return 'dnConf'; if (t === 'inZone' || r.sell === 'inZone' || (t === 'approach' && close(Math.min(L.ceil[0], L.ceil[1])))) return 'nearCeil'; }
    if (r.tier === 'ok') return 'upConf';
    if (up >= 2 && !dn) return 'strongUp'; if (dn >= 2 && !up) return 'downTrend'; return 'none';
  }
  // what the user can actually trade: an index or a world commodity is not bought directly here
  var NOTRADE = { commodity: 'این دارایی در بازار داخلی مستقیماً قابل معامله نیست (فقط تحلیل).' };
  function execOf(r, ctx) {
    var why = [];
    if (r.cls === 'commodity') why.push(NOTRADE.commodity);
    if (r.cls === 'intl') why.push('شاخص جهانی: از داخل مستقیماً قابل معامله نیست (فقط تحلیل و زمینهٔ بازار).');
    if (r.key === 'g:ons') why.push('انس جهانی در بازار داخلی مستقیماً معامله نمی‌شود؛ ابزارهای مرتبط: صندوق‌های طلا و سکه.');
    if (r.queue === 'buy') why.push('صف خرید در جلسهٔ آخر: خرید در قیمت پیشنهادی ممکن نیست.');
    if (r.queue === 'sell') why.push('صف فروش در جلسهٔ آخر: خروج ممکن است چند جلسه طول بکشد.');
    if (r.liqOK === false) why.push('نقدشوندگی کمتر از حد تعیین‌شده (میانگین ارزش معاملات ۲۰ روزه).');
    if ((r.cls === 'stock' || r.cls === 'fund') && ctx.lastStock && isF(r.lastD) && r.lastD < ctx.lastStock) why.push('در آخرین جلسهٔ بازار معامله‌ای ثبت نشده (احتمال توقف نماد یا عدم معامله).');
    if (isF(r.age) && r.age > 96) why.push('دادهٔ قیمت قدیمی است (بیش از ۴ روز).');
    // data quality (directive 19 · 7): a series with open gaps is flagged and its signal is not «executable» until they are filled
    if ((r.cls === 'stock' || r.cls === 'fund') && Hub.ingest) { var c = Hub.ingest.cp('tse', r.sym), g = c && c.gaps || []; if (g.length > 3) why.push(g.length + ' روز معاملاتی مفقود در تاریخچهٔ این نماد (در به‌روزرسانی بعدی تکمیل می‌شود).'); }
    var conf = r.st === 'ok', ana = r.tier === 'wait' || r.tier === 'floor' || r.sell === 'inZone' || r.sell === 'confirmed';
    return { k: conf ? (why.length ? 'confirmed' : 'executable') : ana ? 'analytic' : 'none', why: why };
  }
  function catsOf(r) {
    var c = [], L = r.L || {}, a = r.act;
    if (r.held) {
      if (a === 'close' || a === 'sell') c.push('close', 'sell'); else if (a === 'reduce') { c.push(/هدف|سقف/.test(r.actWhy || '') ? 'tp' : 'reduce', 'sell'); } else if (a === 'scale') c.push('scale', 'buy'); else c.push('hold');
      if (isF(L.stop) && isF(r.px) && isF(r.atrAbs) && r.px - L.stop <= r.atrAbs) c.push('risk');
    } else {
      if (r.tier === 'ok') c.push(a === 'scale' ? 'scale' : 'buy'); if (r.tier === 'ok' && a === 'scale') c.push('buy');
      if (r.tier === 'wait' || r.tier === 'floor') c.push('wait');
      if (r.sell === 'confirmed' || r.sell === 'inZone') c.push('sell', 'tp'); else if (r.sell === 'bear') c.push('sell');
      // not a new buy, but fine to keep for someone who already holds it: up trend on the medium / long horizon, no sell condition
      var v = r.hzv || {}; if (r.tier !== 'ok' && !r.sell && r.st4 !== 'nearCeil' && r.st4 !== 'dnConf' && v.m && v.m.view === 'up' && (!v.l || v.l.view !== 'down')) c.push('holdIf');
    }
    if (r.rc === 'risk' || r.en === 'stop' || r.st === 'exp' && /حد ضرر/.test(r.why || '')) c.push('risk');
    return c.filter(function (x, i) { return c.indexOf(x) === i; });
  }
  // sell-side reason (directive 18 · 3-2)
  function sellWhy(r) {
    var L = r.L || {};
    if (r.held && (r.act === 'close' || r.act === 'sell')) return r.en === 'stop' || /حد ضرر|ابطال/.test(r.actWhy || '') ? ['stop', 'فعال‌شدن حد ضرر / شرط ابطال'] : ['exit', 'خروج کامل از معامله'];
    if (r.held && r.act === 'reduce') return /هدف|سقف/.test(r.actWhy || '') ? ['tp', 'فروش برای ذخیرهٔ سود'] : ['reduce', 'کاهش بخشی از موقعیت'];
    if (r.sell === 'confirmed' || r.sell === 'inZone') return ['tp', 'ذخیرهٔ سود در محدودهٔ سقف احتمالی'];
    if (isF(L.dnConf) && isF(r.px) && r.px < L.dnConf) return ['support', 'خروج به دلیل شکست حمایت (زیر سطح تأیید نزولی)'];
    return ['weak', 'فروش به دلیل تضعیف روند'];
  }

  /* priority score (buy side): weights sum to 100. Every part is shown to the user. */
  var W = { stage: 20, ev: 20, conf: 12, rr: 15, dist: 10, tf: 10, liq: 8, vol: 5 };
  var WFA = { stage: 'سطح تأیید', ev: 'شواهد بک‌تست (برون‌نمونه)', conf: 'اطمینان مدل', rr: 'بازده به ریسک', dist: 'نزدیکی به محدودهٔ ورود', tf: 'هم‌جهتی افق‌ها', liq: 'نقدشوندگی', vol: 'نوسان کمتر' };
  function partsOf(r, liqPct) {
    var L = r.L || {}, bt = r.bt, oos = bt && bt.oos, v = r.hzv || {}, up = 0, dn = 0;
    ['s', 'm', 'l'].forEach(function (k) { if (v[k] && v[k].view === 'up') up++; if (v[k] && v[k].view === 'down') dn++; });
    var ev = oos && oos.n >= 10 && isF(oos.pf) ? cl((oos.pf - 1) / 1, 0, 1) * 0.6 + cl((isF(oos.avgR) ? oos.avgR : 0) / 0.5, 0, 1) * 0.4 : ({ A: 0.8, B: 0.6, C: 0.3, D: 0.1 })[r.grade] || 0;
    var z = r.tier === 'floor' && L.floor ? L.floor : L.buy, d = 0;
    if (z && isF(r.px) && isF(r.atrAbs) && r.atrAbs > 0) { var lo = Math.min(z[0], z[1]), hi = Math.max(z[0], z[1]); d = r.px > hi ? (r.px - hi) / r.atrAbs : r.px < lo ? (lo - r.px) / r.atrAbs : 0; }
    return { stage: r.tier === 'ok' ? 1 : r.tier === 'wait' ? 0.45 : r.tier === 'floor' ? 0.3 : r.held ? 0.5 : 0, ev: ev, conf: isF(r.conf) ? cl((r.conf - 50) / 40, 0, 1) : 0, rr: isF(r.rr) && r.rr > 0 ? cl(r.rr / 4, 0, 1) : 0,
      dist: z ? Math.exp(-d / 2) : 0, tf: cl((up - 0.5 * dn) / 3, 0, 1), liq: r.cls === 'stock' || r.cls === 'fund' ? liqPct : r.cls === 'commodity' || r.cls === 'intl' || r.key === 'g:ons' ? 0 : 1, vol: isF(r.atrPct) ? 1 - cl(r.atrPct / 0.08, 0, 1) : 0.5 };
  }
  // daily log returns of the last 120 sessions, by date, for the correlation penalty
  function rets(z) { var X = z && z.R && z.R.X; if (!X || X.n < 60) return null; var o = {}; for (var i = Math.max(1, X.n - 120); i < X.n; i++) if (X.c[i - 1] > 0 && X.c[i] > 0) o[X.d[i]] = Math.log(X.c[i] / X.c[i - 1]); return o; }
  function corr(a, b) { if (!a || !b) return NaN; var x = [], y = []; Object.keys(a).forEach(function (d) { if (b[d] != null) { x.push(a[d]); y.push(b[d]); } }); var n = x.length; if (n < 40) return NaN;
    var mx = x.reduce(function (s, v) { return s + v; }, 0) / n, my = y.reduce(function (s, v) { return s + v; }, 0) / n, sxy = 0, sxx = 0, syy = 0;
    for (var i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) * (x[i] - mx); syy += (y[i] - my) * (y[i] - my); } return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN; }

  function enrich(by, R0) {
    var zmap = (R0 && R0.zmap) || {}, keys = Object.keys(by), ctx = { lastStock: 0 };
    keys.forEach(function (k) { var r = by[k]; if ((r.cls === 'stock' || r.cls === 'fund') && isF(r.lastD) && r.lastD > ctx.lastStock) ctx.lastStock = r.lastD; });
    var vals = keys.map(function (k) { return by[k]; }).filter(function (r) { return (r.cls === 'stock' || r.cls === 'fund') && isF(r.val20); }).map(function (r) { return r.val20; }).sort(function (a, b) { return a - b; });
    var pctOf = function (v) { if (!vals.length || !isF(v)) return 0; var lo = 0, hi = vals.length; while (lo < hi) { var m = (lo + hi) >> 1; if (vals[m] <= v) lo = m + 1; else hi = m; } return lo / vals.length; };
    keys.forEach(function (k) { var r = by[k], g = grpOf(r); r.grp = g.k; r.grpFa = g.fa; r.grpOk = g.ok !== false; r.grpSrc = g.src || ''; r.st4 = st4Of(r); r.st4Fa = ST4[r.st4]; var e = execOf(r, ctx); r.exec = e.k; r.execFa = EXFA[e.k]; r.execWhy = e.why; r.cats = catsOf(r);
      if (r.cats.indexOf('sell') >= 0) { var sw = sellWhy(r); r.sellK = sw[0]; r.sellFa = sw[1]; }
      r.liqPct = pctOf(r.val20);
      var buySide = r.cls !== 'option' && (r.tier === 'ok' || r.tier === 'wait' || r.tier === 'floor' || (r.held && r.act === 'scale'));   // options have their own market rank (directive 22 · 9)
      if (buySide) { var P = partsOf(r, r.liqPct), s = 0; Object.keys(W).forEach(function (q) { s += W[q] * P[q]; }); r.pri = { base: s, s: s, parts: P, pen: [] }; } else r.pri = null;
      // sell side: positions first (exit > stop near > reduce), then the analytic sell views
      r.spri = r.held ? ((r.act === 'close' || r.act === 'sell') ? 100 : r.act === 'reduce' ? 80 : r.cats.indexOf('risk') >= 0 ? 70 : 0) : r.sell === 'confirmed' ? 55 : r.sell === 'inZone' ? 40 : r.sell === 'bear' ? 20 + (isF(r.conf) ? r.conf / 10 : 0) : 0;
    });
    // concentration and correlation: walk down the ranking; each further pick from the same group, or highly correlated (ρ > 0.8)
    // with a better-ranked pick, is discounted — so the list is not five copies of one bet
    var L = keys.map(function (k) { return by[k]; }).filter(function (r) { return r.pri; }).sort(function (a, b) { return b.pri.base - a.pri.base; }), seen = {}, kept = [], RC = {};
    L.forEach(function (r) { var m = 1, pen = r.pri.pen, nG = seen[r.grp] || 0;
      if (nG) { var f = Math.pow(0.92, nG); m *= f; pen.push('هم‌گروه با ' + nG + ' فرصت بالاتر (' + r.grpFa + ') ×' + f.toFixed(2)); }
      if (kept.length < 60) { var me = RC[r.key] = RC[r.key] || rets(zmap[r.key]); for (var i = 0; i < kept.length; i++) { var o = kept[i], ro = RC[o.key] = RC[o.key] || rets(zmap[o.key]), c = corr(me, ro); if (isF(c) && c > 0.8) { m *= 0.9; pen.push('همبستگی ' + c.toFixed(2) + ' با ' + o.sym + ' ×0.90'); break; } } }
      r.pri.s = r.pri.base * m; seen[r.grp] = nG + 1; kept.push(r); });
    L.sort(function (a, b) { return b.pri.s - a.pri.s; }).forEach(function (r, i) { r.pri.rank = i + 1; });
    return alloc(by);
  }

  /* asset allocation view (directive 18 · suggestion 3): per asset class, breadth of up trends, quality of the best opportunities, confirmed count.
     classScore = 0.4 × share of assets with a medium-horizon up trend + 0.4 × mean priority of its best three / 100 + 0.2 × min(1, confirmed / 2).
     Rule-based aggregation of the engine's own verdicts; it has not been back-tested as an allocation strategy. */
  var CLSFA = { stock: 'سهام', fund: 'صندوق‌ها', gold: 'طلا و سکه', fx: 'ارز', crypto: 'رمزارز', commodity: 'کالا و انرژی (فقط تحلیل)', intl: 'شاخص‌های جهانی (فقط تحلیل)' };
  function alloc(by) {
    var M = {}; Object.keys(by).forEach(function (k) { var r = by[k], m = M[r.cls] = M[r.cls] || { cls: r.cls, n: 0, up: 0, dn: 0, ok: 0, exe: 0, wait: 0, floor: 0, ceil: 0, pri: [] };
      m.n++; var v = r.hzv && r.hzv.m; if (v && v.view === 'up') m.up++; if (v && v.view === 'down') m.dn++; if (r.tier === 'ok') m.ok++; if (r.exec === 'executable') m.exe++; if (r.tier === 'wait') m.wait++; if (r.tier === 'floor') m.floor++; if (r.st4 === 'nearCeil' || r.st4 === 'dnConf') m.ceil++; if (r.pri) m.pri.push(r.pri.s); });
    var rows = Object.keys(M).map(function (c) { var m = M[c]; m.pri.sort(function (a, b) { return b - a; }); var t3 = m.pri.slice(0, 3), avg = t3.length ? t3.reduce(function (s, v) { return s + v; }, 0) / t3.length : 0;
      m.breadth = m.n ? m.up / m.n : 0; m.top3 = avg; m.score = 0.4 * m.breadth + 0.4 * avg / 100 + 0.2 * Math.min(1, m.ok / 2); m.fa = CLSFA[c] || c;
      // «priority to enter» needs at least one confirmed signal in that market; a strong market without one is only «watch»
      m.verdict = c === 'commodity' || c === 'intl' ? 'فقط تحلیل' : m.score >= 0.55 && m.ok ? 'اولویت ورود' : m.score >= 0.55 ? 'مثبت، ولی بدون سیگنال تأییدشده — پایش' : m.score >= 0.35 ? 'خنثی — فقط فرصت‌های منتخب' : 'کم‌وزن / انتظار';
      return m; }).sort(function (a, b) { return b.score - a.score; });
    var tradable = rows.filter(function (m) { return m.cls !== 'commodity' && m.cls !== 'intl'; }), anyOk = tradable.some(function (m) { return m.ok > 0; }), best = tradable[0];
    // with no confirmed signal anywhere the answer is cash / fixed income until one appears; the strongest market is named as the one to watch
    var head = !anyOk ? { k: 'cash', best: best || null } : { k: best.cls, best: tradable.filter(function (m) { return m.ok; })[0] };
    return { rows: rows, head: head, rule: 'امتیاز بازار = ۰٫۴ × سهم دارایی‌های با روند میان‌مدت صعودی + ۰٫۴ × میانگین امتیاز سه فرصت برتر ÷ ۱۰۰ + ۰٫۲ × min(۱، تعداد تأییدشده ÷ ۲). قاعدهٔ تجمیع حکم‌های موتور است؛ به‌عنوان استراتژی تخصیص بک‌تست نشده.' };
  }

  Hub.oppRank = { enrich: enrich, grpOf: grpOf, GROUPS: GROUPS, ST4: ST4, EXFA: EXFA, W: W, WFA: WFA, corr: corr, rets: rets, CATFA: {
    all: 'همهٔ اعلان‌ها', buy: 'خرید', sell: 'فروش', scale: 'خرید پله‌ای', hold: 'نگهداری', wait: 'انتظار برای تأیید', tp: 'ذخیرهٔ سود', reduce: 'کاهش موقعیت', close: 'خروج کامل', change: 'تغییر یا ابطال سیگنال', risk: 'هشدار ریسک و حد ضرر' } };
})(typeof window !== 'undefined' ? window : globalThis);
