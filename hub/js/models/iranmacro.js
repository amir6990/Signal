/* =====================================================================
 * IRAN MACRO MONITOR — the real economy behind the markets.
 * You enter each month's official numbers (PMI of the Iran Chamber, inflation of the Statistical Centre / Central Bank,
 * money, rates, growth, budget, energy); market prices come from this hub. Every number keeps its source, date and
 * status (verified / quoted from a secondary source). The analysis is rule-based and shown with its formula:
 * the cycle regime (growth × inflation), demand and cost pressure, margin squeeze, the leading gap between new orders
 * and inventories, inflation momentum, real rates, real exchange rate, the hyperinflation test, the gap between the
 * stock market and the real economy, and what each finding usually means for stocks, gold, coin, dollar and bonds.
 * Nothing is fetched from news or social media; a value without a primary source is marked "quoted".
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub; if (!root.document || !Hub.toolkit) return;
  var U = Hub.util, h = U.h, TK = Hub.toolkit, J = Hub.jalali, KEY = 'hub.iranmacro.v1';
  var MON = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
  function fa(x, d) { if (typeof x !== 'number' || !isFinite(x)) return '—'; var s = Math.abs(x) >= 1000 ? Math.round(x).toLocaleString('en-US') : x.toFixed(d == null ? 1 : d); return s.replace(/[0-9]/g, function (c) { return '۰۱۲۳۴۵۶۷۸۹'[c]; }).replace(/,/g, '٬').replace('.', '٫').replace(/^-/, '−'); }
  function sg(x, d) { return isFinite(x) ? (x > 0 ? '+' : '') + fa(x, d) : '—'; }
  function num(v) { return v === null || v === undefined || v === '' ? NaN : Number(String(v).replace(/[٬,]/g, '').replace(/[۰-۹]/g, function (c) { return '۰۱۲۳۴۵۶۷۸۹'.indexOf(c); }).replace('٫', '.')); }
  function plabel(id) { var p = String(id).split('-'); return MON[+p[1] - 1] + ' ' + p[0].replace(/[0-9]/g, function (c) { return '۰۱۲۳۴۵۶۷۸۹'[c]; }); }
  function prevId(id) { var p = String(id).split('-'), y = +p[0], m = +p[1] - 1; if (m < 1) { m = 12; y--; } return y + '-' + (m < 10 ? '0' : '') + m; }

  /* indicators: key, label, unit, group, what it measures, source to use */
  var G = [['pmi', 'شامخ صنعت (اتاق ایران)'], ['pmiw', 'شامخ کل اقتصاد و خدمات'], ['infl', 'تورم'], ['money', 'پول، بهره و بدهی'], ['fx', 'ارز و دارایی‌ها (خودکار از همین برنامه، قابل اصلاح)'], ['real', 'رشد، اشتغال، بودجه و انرژی']];
  var IND = [
    ['pmi', 'شامخ کل صنعت', 'شاخص', 'pmi', 'عدد ۵۰ مرز رونق و رکود است؛ بالای ۵۰ یعنی بیشتر بنگاه‌ها بهبود گزارش کرده‌اند (شاخص انتشار، نه درصد رشد)', 'اتاق ایران — مرکز پژوهش‌ها، گزارش ماهانهٔ شامخ'],
    ['pmi_out', 'مقدار تولید', 'شاخص', 'pmi', 'بالای ۵۰ = تولید بیشتر از ماه قبل', 'همان'], ['pmi_ord', 'سفارش‌های جدید مشتریان', 'شاخص', 'pmi', 'پیشرو: تقاضای ماه‌های آینده', 'همان'],
    ['pmi_sales', 'فروش محصولات', 'شاخص', 'pmi', 'درآمد و نقدینگی بنگاه', 'همان'], ['pmi_emp', 'اشتغال', 'شاخص', 'pmi', 'تعدیل یا جذب نیرو', 'همان'],
    ['pmi_inv_raw', 'موجودی مواد اولیه', 'شاخص', 'pmi', 'انبار مواد اولیه؛ کاهش = احتیاط یا کمبود نقدینگی', 'همان'], ['pmi_inp_px', 'قیمت خرید مواد اولیه', 'شاخص', 'pmi', 'فشار هزینه؛ ۹۴ یعنی تقریباً همه افزایش قیمت گزارش کرده‌اند (نه تورم ۹۴٪)', 'همان'],
    ['pmi_out_px', 'قیمت محصولات تولیدی', 'شاخص', 'pmi', 'قدرت انتقال هزینه به مشتری', 'همان'], ['pmi_exp', 'صادرات', 'شاخص', 'pmi', 'تقاضای خارجی', 'همان'],
    ['pmi_fg', 'موجودی محصول در انبار', 'شاخص', 'pmi', 'انبار کالای ساخته‌شده؛ بالا با فروش ضعیف = انباشت ناخواسته', 'همان'], ['pmi_next', 'انتظارات ماه آینده', 'شاخص', 'pmi', 'انتظار مدیران از ماه بعد', 'همان'],
    ['pmi_all', 'شامخ کل اقتصاد', 'شاخص', 'pmiw', 'صنعت، خدمات و کشاورزی با هم', 'اتاق ایران'], ['pmi_srv', 'شامخ خدمات و کسب‌وکار', 'شاخص', 'pmiw', 'بخش خدمات', 'اتاق ایران'],
    ['infl_pp', 'تورم نقطه‌به‌نقطه', '٪', 'infl', 'سطح قیمت این ماه نسبت به همان ماه سال قبل', 'مرکز آمار ایران (یا بانک مرکزی)'], ['infl_m', 'تورم ماهانه', '٪', 'infl', 'تغییر سطح قیمت نسبت به ماه قبل', 'مرکز آمار ایران'],
    ['infl_12', 'تورم سالانه (میانگین ۱۲ ماه)', '٪', 'infl', 'میانگین ۱۲ ماه اخیر نسبت به ۱۲ ماه قبل', 'مرکز آمار ایران'], ['infl_food', 'تورم نقطه‌به‌نقطهٔ خوراکی‌ها', '٪', 'infl', 'فشار بر سفرهٔ خانوار', 'مرکز آمار ایران'],
    ['infl_y1', 'تورم سال قبل (میانگین سالانه)', '٪', 'infl', 'برای آزمون تورم شدید سه‌ساله (IAS 29)', 'مرکز آمار ایران'], ['infl_y2', 'تورم دو سال قبل (میانگین سالانه)', '٪', 'infl', 'همان', 'مرکز آمار ایران'],
    ['m2', 'رشد نقدینگی (۱۲ ماهه)', '٪', 'money', 'رشد حجم پول', 'بانک مرکزی'], ['mb', 'رشد پایهٔ پولی (۱۲ ماهه)', '٪', 'money', 'پول پرقدرت', 'بانک مرکزی'],
    ['ibr', 'نرخ سود بین‌بانکی', '٪', 'money', 'هزینهٔ پول کوتاه‌مدت', 'بانک مرکزی'], ['ytm', 'بازده تا سررسید اخزا', '٪', 'money', 'نرخ بدون ریسک بازار سرمایه', 'TSETMC / فرابورس'],
    ['fx_free', 'دلار آزاد', 'ریال', 'fx', 'از دادهٔ همین برنامه (TGJU)', 'TGJU'], ['fx_free_y', 'دلار آزاد یک سال قبل', 'ریال', 'fx', 'برای نرخ ارز واقعی', 'TGJU'],
    ['fx_off', 'نرخ ارز مرکز مبادله (توافقی/حواله)', 'ریال', 'fx', 'شکاف با بازار آزاد', 'مرکز مبادلهٔ ارز و طلای ایران'], ['coin', 'سکه امامی', 'ریال', 'fx', 'از دادهٔ همین برنامه', 'TGJU'],
    ['tedpix', 'شاخص کل بورس', 'واحد', 'fx', 'از دادهٔ همین برنامه', 'TSETMC'], ['tedpix_y', 'شاخص کل بورس یک سال قبل', 'واحد', 'fx', 'بازده اسمی یک‌ساله', 'TSETMC'],
    ['gdp_q', 'رشد اقتصادی (آخرین فصل، با نفت)', '٪', 'real', 'رشد واقعی تولید ناخالص داخلی', 'مرکز آمار ایران / بانک مرکزی'], ['gdp_imf', 'پیش‌بینی رشد واقعی سال جاری (IMF)', '٪', 'real', 'چشم‌انداز اقتصاد جهانی صندوق بین‌المللی پول', 'IMF WEO DataMapper'],
    ['unemp', 'نرخ بیکاری', '٪', 'real', 'بیکاران به جمعیت فعال', 'مرکز آمار ایران'], ['deficit', 'کسری بودجهٔ عملیاتی (ماه یا دوره)', 'همت', 'real', 'همت = هزار میلیارد تومان', 'دیوان محاسبات / سازمان برنامه'],
    ['oil_exp', 'صادرات نفت خام', 'هزار بشکه در روز', 'real', 'درآمد ارزی دولت', 'منابع ردیابی نفتکش‌ها (ثانویه)'], ['power_cut', 'روزهای محدودیت برق صنایع در ماه', 'روز', 'real', 'ناترازی انرژی', 'توانیر / انجمن‌های صنفی']];
  var BY = {}; IND.forEach(function (r) { BY[r[0]] = r; });
  // Mehr 1405 values as published in Dr. Isaac Saeedian's stories (isaac_finance, 25 Aban 1405); kept as "quoted" until checked against the primary report
  var QSRC = 'نقل از استوری‌های دکتر آیزاک سعیدیان (isaac_finance، ۲۵ آبان ۱۴۰۵) — با گزارش اصلی تطبیق داده نشده';
  function sample() {
    var v = { pmi: 45.7, pmi_ord: 43.9, pmi_sales: 41.6, pmi_inp_px: 94.3, infl_pp: 88.7, infl_m: 4.4, gdp_imf: -5.4 }, src = {};
    Object.keys(v).forEach(function (k) { src[k] = { source: QSRC, date: '1405/08/25', st: 'quoted' }; });
    return { version: 1, tool: 'iran-macro', meta: { title: 'Iran macro', asOf: '', source: '' }, settings: {}, sources: {}, cur: '1405-07', periods: [{ id: '1405-07', v: v, src: src, at: Date.now() }], log: [] };
  }
  function ensure(S) { S.periods = S.periods || []; if (!S.periods.length) S.periods.push({ id: S.cur || '1405-07', v: {}, src: {}, at: Date.now() }); S.cur = S.cur || S.periods[S.periods.length - 1].id; S.log = S.log || []; return S; }
  function per(S, id) { return S.periods.filter(function (p) { return p.id === id; })[0] || null; }

  /* live market readings from this hub (no network): Iran markets store and the engine's central record */
  function hubMarkets() {
    var out = {}; try { var IM = Hub.iranMarkets, S0 = IM && U.store.get(IM.KEY, null); if (S0 && S0.data && Object.keys(S0.data).length) { var R0 = IM.run(JSON.parse(JSON.stringify(S0))); if (!R0.sample) R0.rows.forEach(function (a) { if (a.ok) out[a.name] = { last: a.last, y1: a.ret && a.ret.y1, m1: a.ret && a.ret.m1, m3: a.ret && a.ret.m3, date: a.date, lean: a.plan && a.plan.lean }; }); } } catch (e) { /* no market data */ }
    var C = U.store.get('hub.central.v1', null), by = {}; if (C && C.by) Object.keys(C.by).forEach(function (k) { var r = C.by[k]; by[r.sym] = r; }); out._central = by; return out;
  }

  /* the analysis — every rule shows its inputs and threshold */
  function run(S) {
    ensure(S); var P = per(S, S.cur) || S.periods[S.periods.length - 1], Pp = per(S, prevId(P.id)), v = function (k) { return num(P.v[k]); }, vp = function (k) { return Pp ? num(Pp.v[k]) : NaN; };
    var M = hubMarkets(), F = [], R = { P: P, Pp: Pp, M: M, F: F, checks: [] };
    var has = function (k) { return isFinite(v(k)); }, src = function (k) { var s = P.src && P.src[k]; return s ? (s.source || '—') + (s.date ? ' · ' + s.date : '') + (s.st === 'quoted' ? ' · نقل‌قول (تأییدنشده)' : s.st === 'verified' ? ' · تأییدشده با منبع اصلی' : '') : 'منبع وارد نشده'; };
    var card = function (o) { o.src = (o.keys || []).map(function (k) { return BY[k][1] + ': ' + src(k); }).join(' | '); o.quoted = (o.keys || []).some(function (k) { return !P.src || !P.src[k] || P.src[k].st !== 'verified'; }); F.push(o); };
    // auto-fill market inputs if empty
    var dol = M['دلار آزاد تهران'], coin = M['سکه امامی'], ix = M['شاخص کل بورس'];
    R.auto = { fx_free: dol && dol.last, fx_free_y: dol && isFinite(dol.y1) ? dol.last / (1 + dol.y1) : NaN, coin: coin && coin.last, tedpix: ix && ix.last, tedpix_y: ix && isFinite(ix.y1) ? ix.last / (1 + ix.y1) : NaN };
    var val = function (k) { return has(k) ? v(k) : num(R.auto[k]); };

    // 1. growth and demand
    var dem = ['pmi_ord', 'pmi_sales'].filter(has).map(v), demand = dem.length ? dem.reduce(function (a, b) { return a + b; }, 0) / dem.length : NaN;
    var growth = has('pmi') ? v('pmi') : has('pmi_all') ? v('pmi_all') : demand; R.growth = growth; R.demand = demand;
    if (has('pmi')) card({ tag: v('pmi') < 50 ? 'زنگ خطر رکود صنعتی' : 'رونق صنعتی', head: 'شامخ صنعت ' + plabel(P.id), num: fa(v('pmi')), sev: v('pmi') < 47 ? 'crit' : v('pmi') < 50 ? 'warn' : 'ok', keys: ['pmi'],
      what: (v('pmi') < 50 ? fa(50 - v('pmi')) + ' واحد زیر مرز ۵۰: بیشتر بنگاه‌های نمونه شرایط بدتری نسبت به ماه قبل گزارش کرده‌اند (انقباض).' : fa(v('pmi') - 50) + ' واحد بالای ۵۰: بهبود نسبت به ماه قبل.') + (isFinite(vp('pmi')) ? ' ماه قبل ' + fa(vp('pmi')) + ' (' + sg(v('pmi') - vp('pmi')) + ').' : ' عدد ماه قبل وارد نشده؛ جهت تغییر معلوم نیست.'),
      why: 'شامخ شاخص انتشار است، نه نرخ رشد: ۴۵ یعنی سهم گزارش «بدتر» از «بهتر» بیشتر است، نه اینکه تولید ۵٪ کم شده.', mkt: v('pmi') < 50 ? 'سود عملیاتی شرکت‌های وابسته به تقاضای داخلی تحت فشار است؛ بازده اسمی سهام در تورم بالا می‌تواند مثبت بماند (اثر تورمی)، اما رشد واقعی سود ضعیف است.' : 'محیط عملیاتی بنگاه‌ها رو به بهبود است.',
      watch: 'برگشت بالای ۵۰ در دو ماه متوالی، یا بهبود «سفارش‌های جدید» پیش از کل شاخص.' });
    if (has('pmi_ord')) card({ tag: 'هشدار برای آیندهٔ تولید', head: 'سفارش‌های جدید مشتریان', num: fa(v('pmi_ord')), sev: v('pmi_ord') < 47 ? 'crit' : v('pmi_ord') < 50 ? 'warn' : 'ok', keys: ['pmi_ord'],
      what: (v('pmi_ord') < 50 ? 'تقاضای تازه در حال کاهش است.' : 'تقاضای تازه در حال افزایش است.') + (has('pmi') ? ' فاصله با کل شاخص: ' + sg(v('pmi_ord') - v('pmi')) + (v('pmi_ord') < v('pmi') ? ' — سفارش‌ها ضعیف‌تر از کل است؛ تولید ماه‌های بعد احتمالاً ضعیف‌تر می‌شود.' : ' — سفارش‌ها از کل قوی‌ترند؛ نشانهٔ پیشرو برای بهبود.') : ''),
      why: 'سفارش امروز تولید فردا است؛ این زیرشاخص معمولاً جلوتر از کل شاخص حرکت می‌کند.', mkt: 'برای سهام تولیدی با بازار داخلی، ضعف سفارش‌ها فروش فصل بعد را تهدید می‌کند.', watch: 'سفارش‌ها بالاتر از موجودی کالای ساخته‌شده (فاصلهٔ پیشرو مثبت).' });
    if (has('pmi_sales')) card({ tag: 'نقدینگی بنگاه‌ها', head: 'فروش محصولات', num: fa(v('pmi_sales')), sev: v('pmi_sales') < 45 ? 'crit' : v('pmi_sales') < 50 ? 'warn' : 'ok', keys: ['pmi_sales'],
      what: v('pmi_sales') < 50 ? 'فروش کمتر از ماه قبل: ورود نقد به بنگاه کم شده و نیاز به سرمایهٔ در گردش بالا می‌رود.' : 'فروش بیشتر از ماه قبل.', why: 'فروش ضعیف + مواد اولیهٔ گران = فشار بر سرمایهٔ در گردش و تقاضای تسهیلات.', mkt: 'بانک‌ها: تقاضای وام سرمایه در گردش بالا، ریسک اعتباری هم بالا.', watch: 'فروش بالای ۵۰ همراه با کاهش موجودی انبار.' });
    // 2. cost pressure and margins
    if (has('pmi_inp_px')) { var sq = has('pmi_out_px') ? v('pmi_inp_px') - v('pmi_out_px') : NaN; R.squeeze = sq;
      card({ tag: 'هشدار هزینه‌های تولید', head: 'قیمت خرید مواد اولیه', num: fa(v('pmi_inp_px')), sev: v('pmi_inp_px') > 80 ? 'crit' : v('pmi_inp_px') > 60 ? 'warn' : 'ok', keys: ['pmi_inp_px'].concat(has('pmi_out_px') ? ['pmi_out_px'] : []),
        what: 'این عدد درصد تورم نیست؛ شاخص انتشار است: ' + fa(v('pmi_inp_px')) + ' یعنی تقریباً ' + fa((v('pmi_inp_px') - 50) * 2, 0) + '٪ خالص بنگاه‌ها افزایش قیمت خرید گزارش کرده‌اند.' + (isFinite(sq) ? ' فاصله با قیمت محصولات: ' + sg(sq) + (sq > 10 ? ' — بنگاه‌ها نمی‌توانند هزینه را کامل به مشتری منتقل کنند؛ حاشیهٔ سود فشرده می‌شود.' : ' — انتقال هزینه به مشتری تقریباً ممکن است.') : ' «قیمت محصولات» وارد نشده؛ فشار بر حاشیهٔ سود قابل محاسبه نیست.'),
        why: 'فشار هزینه همراه با تقاضای ضعیف همان ترکیب رکود تورمی در سطح بنگاه است.', mkt: 'شرکت‌های با قدرت قیمت‌گذاری (کالایی صادراتی، انحصاری) آسیب کمتری می‌بینند؛ تولیدکنندگان کالای مصرفی با رقابت بالا بیشترین فشار را دارند.', watch: 'کاهش این شاخص زیر ۶۵ یا رسیدن «قیمت محصولات» به آن.' }); }
    // 3. leading gap
    if (has('pmi_ord') && (has('pmi_fg') || has('pmi_inv_raw'))) { var inv = has('pmi_fg') ? v('pmi_fg') : v('pmi_inv_raw'), gap = v('pmi_ord') - inv; R.lead = gap;
      card({ tag: 'نشانگر پیشرو', head: 'فاصلهٔ سفارش‌ها و موجودی', num: sg(gap), sev: gap < -3 ? 'warn' : gap > 3 ? 'ok' : 'info', keys: ['pmi_ord', has('pmi_fg') ? 'pmi_fg' : 'pmi_inv_raw'],
        what: 'سفارش‌های جدید منهای ' + (has('pmi_fg') ? 'موجودی محصول در انبار' : 'موجودی مواد اولیه') + ' = ' + sg(gap) + (gap > 0 ? ': تقاضا از موجودی جلو زده؛ معمولاً پیش از افزایش تولید دیده می‌شود.' : ': موجودی نسبت به سفارش‌ها زیاد است؛ تولید ماه‌های بعد احتمالاً کم می‌شود.'), why: 'قاعدهٔ رایج تحلیل شاخص مدیران خرید (سفارش منهای موجودی).', mkt: '—', watch: 'تغییر علامت این فاصله.' }); }
    // 4. inflation momentum, hyperinflation test, real rates
    if (has('infl_m')) { var ann = (Math.pow(1 + v('infl_m') / 100, 12) - 1) * 100; R.ann = ann;
      card({ tag: has('infl_pp') && ann <= v('infl_pp') ? 'تورم بالا، سرعت رو به کاهش' : 'هشدار شتاب تورم', head: 'تورم ماهانه', num: fa(v('infl_m')) + '٪', sev: v('infl_m') > 4 ? 'crit' : v('infl_m') > 2.5 ? 'warn' : 'ok', keys: ['infl_m'].concat(has('infl_pp') ? ['infl_pp'] : []),
        what: 'اگر این سرعت ۱۲ ماه ادامه یابد، تورم سالانه ' + fa(ann) + '٪ می‌شود' + (has('infl_pp') ? (ann > v('infl_pp') ? ' — بالاتر از تورم نقطه‌به‌نقطهٔ ' + fa(v('infl_pp')) + '٪: تورم در حال شتاب‌گرفتن است.' : ' — پایین‌تر از تورم نقطه‌به‌نقطهٔ ' + fa(v('infl_pp')) + '٪: سرعت تورم در حال کم شدن است.') : '.'),
        why: 'تورم نقطه‌به‌نقطه گذشته را نشان می‌دهد؛ تورم ماهانهٔ سالانه‌شده سرعت فعلی را. یک ماه به‌تنهایی پرنوسان است؛ روند دو یا سه ماه را ببینید.', mkt: 'تورم شتابان معمولاً به نفع دارایی‌های حقیقی (طلا، سکه، ارز، سهام کالایی) و به ضرر دارایی‌های با درآمد ثابت ریالی است.', watch: 'تورم ماهانه زیر ۲٫۵٪ در دو ماه متوالی.' });
      var cagan = v('infl_m') >= 50, y3 = has('infl_y1') && has('infl_y2') && has('infl_12') ? ((1 + v('infl_12') / 100) * (1 + v('infl_y1') / 100) * (1 + v('infl_y2') / 100) - 1) * 100 : NaN; R.y3 = y3;
      card({ tag: 'هشدار دربارهٔ آیندهٔ پول ملی', head: 'آزمون ابرتورم', num: cagan ? 'بله' : 'خیر', sev: cagan ? 'crit' : isFinite(y3) && y3 >= 100 ? 'warn' : 'info', keys: ['infl_m'].concat(isFinite(y3) ? ['infl_12', 'infl_y1', 'infl_y2'] : []),
        what: 'تعریف کیگن (Cagan): تورم ماهانه ۵۰٪ یا بیشتر. امروز ' + fa(v('infl_m')) + '٪ ماهانه است، یعنی ' + fa(50 / v('infl_m'), 0) + ' برابر کمتر از آستانه. ' + (isFinite(y3) ? 'تورم انباشتهٔ سه سال ' + fa(y3) + '٪' + (y3 >= 100 ? ' — بالای ۱۰۰٪: طبق معیار IAS 29 اقتصاد «با تورم بسیار بالا» است و صورت‌های مالی باید تعدیل تورمی شوند.' : ' — زیر ۱۰۰٪.') : 'برای معیار سه‌سالهٔ IAS 29 تورم دو سال قبل وارد نشده است.'),
        why: 'تورم بسیار بالا با ابرتورم یکی نیست؛ آستانهٔ ابرتورم شکست کامل اعتماد به پول است.', mkt: 'در معیار IAS 29 سود حسابداری اسمی گمراه‌کننده است؛ ارزش‌گذاری سهام را بر پایهٔ جریان نقد واقعی یا دلاری انجام دهید.', watch: 'جهش تورم ماهانه بالای ۱۰٪، رشد پایهٔ پولی، کسری بودجه.' }); }
    if (has('infl_pp') && (has('ytm') || has('ibr'))) { var nom = has('ytm') ? v('ytm') : v('ibr'), rr = ((1 + nom / 100) / (1 + v('infl_pp') / 100) - 1) * 100; R.rr = rr;
      card({ tag: 'نرخ بهرهٔ واقعی', head: (has('ytm') ? 'بازده اخزا' : 'نرخ بین‌بانکی') + ' منهای تورم', num: fa(rr) + '٪', sev: rr < -20 ? 'crit' : rr < 0 ? 'warn' : 'ok', keys: [has('ytm') ? 'ytm' : 'ibr', 'infl_pp'],
        what: 'نرخ واقعی = (۱ + ' + fa(nom) + '٪) ÷ (۱ + ' + fa(v('infl_pp')) + '٪) − ۱ = ' + fa(rr) + '٪.' + (rr < 0 ? ' سپرده و اوراق ریالی قدرت خرید را حفظ نمی‌کنند.' : ' نرخ واقعی مثبت است.'), why: 'نرخ واقعی منفی انگیزهٔ فرار از ریال به دارایی‌های حقیقی است.', mkt: rr < 0 ? 'به نفع طلا، سکه، ارز و سهام با درآمد ارزی؛ به ضرر اوراق بلندمدت ریالی.' : 'اوراق ریالی رقیب جدی سهام می‌شوند.', watch: 'افزایش نرخ سود سیاستی یا کاهش تورم ماهانه.' }); }
    // 5. real exchange rate and markets vs inflation
    var fx0 = val('fx_free'), fx1 = val('fx_free_y');
    if (isFinite(fx0) && isFinite(fx1) && has('infl_pp')) { var fxc = (fx0 / fx1 - 1) * 100, rer = ((1 + fxc / 100) / (1 + v('infl_pp') / 100) - 1) * 100; R.rer = rer;
      card({ tag: 'هشدار دربارهٔ ارزش پول ملی', head: 'نرخ واقعی دلار در یک سال', num: sg(rer) + '٪', sev: rer < -10 ? 'warn' : 'info', keys: ['infl_pp'],
        what: 'دلار آزاد در یک سال ' + sg(fxc) + '٪ و سطح قیمت‌ها ' + fa(v('infl_pp')) + '٪ بالا رفته؛ تفاوت = ' + sg(rer) + '٪ (تورم خارجی لحاظ نشده).' + (rer < 0 ? ' دلار از تورم عقب مانده؛ ریال به‌طور واقعی گران‌تر شده و فشار جبرانی بر نرخ ارز انباشته است.' : ' دلار جلوتر از تورم رفته؛ بخشی از تورم آینده در نرخ ارز پیش‌خور شده.'),
        why: 'در اقتصادهای با تورم بالا، عقب‌ماندن نرخ ارز از تورم معمولاً دوام ندارد؛ زمان جبران قابل پیش‌بینی نیست.', mkt: rer < -10 ? 'ریسک جهش ارزی بالاتر؛ سهام صادرات‌محور و دارایی‌های ارزی بیمهٔ این ریسک‌اند.' : '—', watch: 'شکاف نرخ آزاد با مرکز مبادله و روند دلار در داشبورد.' }); }
    var ix0 = val('tedpix'), ix1 = val('tedpix_y');
    if (isFinite(ix0) && isFinite(ix1) && has('infl_pp')) { var ixr = ((ix0 / ix1) / (1 + v('infl_pp') / 100) - 1) * 100; R.ixr = ixr;
      card({ tag: 'بازار و اقتصاد واقعی', head: 'بازده واقعی یک‌سالهٔ شاخص کل', num: sg(ixr) + '٪', sev: ixr < 0 ? 'warn' : 'info', keys: ['infl_pp'],
        what: 'شاخص کل در یک سال ' + sg((ix0 / ix1 - 1) * 100) + '٪ (اسمی)؛ پس از کسر تورم ' + sg(ixr) + '٪.' + (isFinite(growth) && growth < 50 && ixr > 0 ? ' بورس در حال رشد واقعی است در حالی که شامخ زیر ۵۰ است: رشد بیشتر از پوشش تورمی و ارزی می‌آید تا بهبود تولید.' : ''),
        why: 'فاصلهٔ بورس و اقتصاد واقعی یعنی قیمت سهام تورم و نرخ ارز را منعکس می‌کند، نه رونق.', mkt: 'انتخاب سهم: درآمد ارزی و قدرت قیمت‌گذاری مهم‌تر از رشد تقاضای داخلی.', watch: 'همسویی دوبارهٔ شامخ با بورس.' }); }
    if (has('m2') && has('infl_pp')) { var rm = ((1 + v('m2') / 100) / (1 + v('infl_pp') / 100) - 1) * 100;
      card({ tag: 'پول', head: 'رشد واقعی نقدینگی', num: sg(rm) + '٪', sev: 'info', keys: ['m2', 'infl_pp'], what: 'نقدینگی ' + fa(v('m2')) + '٪ و تورم ' + fa(v('infl_pp')) + '٪ → حجم واقعی پول ' + sg(rm) + '٪.' + (rm < 0 ? ' حجم واقعی پول کوچک شده؛ کمبود نقدینگی بنگاه‌ها با همین سازگار است.' : ''), why: 'وقتی تورم از رشد پول جلو می‌زند، معمولاً انتظارات تورمی (سرعت گردش پول) عامل اصلی است.', mkt: '—', watch: 'رشد پایهٔ پولی.' }); }
    if (has('gdp_imf') || has('gdp_q')) { var gd = has('gdp_q') ? v('gdp_q') : v('gdp_imf');
      card({ tag: 'هشدار دربارهٔ رشد اقتصادی', head: has('gdp_q') ? 'رشد اقتصادی آخرین فصل' : 'پیش‌بینی IMF از رشد واقعی', num: sg(gd) + '٪', sev: gd < 0 ? 'crit' : gd < 2 ? 'warn' : 'ok', keys: [has('gdp_q') ? 'gdp_q' : 'gdp_imf'],
        what: gd < 0 ? 'انقباض اقتصاد واقعی: کیک درآمد ملی کوچک‌تر می‌شود.' : 'رشد مثبت.', why: 'پیش‌بینی IMF در هر انتشار تغییر می‌کند؛ تاریخ انتشار را کنار عدد ثبت کنید.', mkt: gd < 0 ? 'سود واقعی شرکت‌های داخلی‌محور کاهش؛ بانک‌ها با ریسک نکول بالاتر.' : '—', watch: 'انتشار بعدی چشم‌انداز اقتصاد جهانی (آوریل و اکتبر).' }); }
    // 6. the regime
    var inflLevel = has('infl_pp') ? v('infl_pp') : has('infl_12') ? v('infl_12') : NaN, accel = isFinite(R.ann) && has('infl_pp') ? R.ann - v('infl_pp') : NaN;
    if (isFinite(growth) && isFinite(inflLevel)) {
      var gUp = growth >= 50, iUp = isFinite(accel) ? accel > 0 : inflLevel > (has('infl_12') ? v('infl_12') : inflLevel);
      R.regime = !gUp && inflLevel >= 25 ? 'رکود تورمی' : !gUp ? 'رکود' : gUp && iUp ? 'رونق تورمی' : 'بهبود با کاهش تورم';
      var sc = Math.max(0, Math.min(100, (50 - growth) * 8 + Math.min(inflLevel, 100) * 0.5)); R.stag = sc;
      R.regimeWhy = 'رشد: ' + (has('pmi') ? 'شامخ صنعت ' : has('pmi_all') ? 'شامخ کل ' : 'میانگین سفارش و فروش ') + fa(growth) + (gUp ? ' (≥ ۵۰، رونق)' : ' (< ۵۰، انقباض)') + ' · تورم: ' + fa(inflLevel) + '٪' + (isFinite(accel) ? '، ' + (accel > 0 ? 'شتابان' : 'رو به کاهش') + ' (سالانه‌شدهٔ ماهانه ' + fa(R.ann) + '٪)' : '') + ' · شدت رکود تورمی = (۵۰ − رشد) × ۸ + min(تورم، ۱۰۰) × ۰٫۵ = ' + fa(sc, 0) + ' از ۱۰۰';
    }
    // market cross-check with the engine
    var cen = M._central || {}, pick = function (n) { return cen[n] || null; };
    R.mk = [['شاخص کل بورس', ix], ['دلار آزاد', dol, pick('دلار آزاد')], ['سکه امامی', coin, pick('سکه امامی')], ['طلای ۱۸ عیار', M['طلای ۱۸ عیار'], pick('طلای ۱۸ عیار')]].map(function (r) { var a = r[1], c = r[2];
      return [r[0], a ? fa(a.last) : '—', a ? sg(a.m1 * 100) + '٪ / ' + sg(a.m3 * 100) + '٪ / ' + sg(a.y1 * 100) + '٪' : '—', a && has('infl_pp') && isFinite(a.y1) ? sg(((1 + a.y1) / (1 + v('infl_pp') / 100) - 1) * 100) + '٪' : '—', c ? (c.pt ? c.pt.phase + ' · ' : '') + c.stFa + ' · ' + c.actFa : '—']; });
    // checks
    IND.forEach(function (r) { var x = v(r[0]); if (!isFinite(x)) return; if (r[2] === 'شاخص' && (x < 0 || x > 100)) R.checks.push({ level: 'crit', msg: r[1] + ': شاخص شامخ باید بین ۰ و ۱۰۰ باشد.' }); if (!P.src || !P.src[r[0]] || !P.src[r[0]].source) R.checks.push({ level: 'warn', msg: r[1] + ': منبع وارد نشده.' }); });
    if (has('infl_m') && has('infl_pp') && v('infl_m') * 12 < v('infl_pp') / 4) R.checks.push({ level: 'warn', msg: 'تورم ماهانه با تورم نقطه‌به‌نقطه سازگار به نظر نمی‌رسد؛ اعداد را با گزارش اصلی تطبیق دهید.' });
    R.nQuoted = Object.keys(P.v).filter(function (k) { return isFinite(num(P.v[k])) && (!P.src[k] || P.src[k].st !== 'verified'); }).length;
    return R;
  }

  /* screens */
  var SEVC = { crit: '#e5484d', warn: '#f5a524', ok: '#30a46c', info: '#8b8d98' };
  function cardEl(o) { return h('div', { class: 'mcard', style: 'border:1px solid var(--line);border-radius:12px;padding:14px 16px;background:var(--panel, transparent);display:flex;flex-direction:column;gap:6px' }, [
    h('span', { style: 'align-self:flex-start;font-size:12px;padding:2px 10px;border-radius:999px;background:' + SEVC[o.sev] + '22;color:' + SEVC[o.sev], text: o.tag }),
    h('div', { style: 'font-weight:700;font-size:17px', text: o.head }), h('div', { style: 'font-size:28px;font-weight:800;color:' + SEVC[o.sev], text: o.num }),
    h('p', { style: 'margin:0', text: o.what }), h('p', { class: 'small', style: 'margin:0', text: 'چرا مهم است: ' + o.why }),
    o.mkt && o.mkt !== '—' ? h('p', { class: 'small', style: 'margin:0', text: 'پیامد برای بازارها: ' + o.mkt }) : null, h('p', { class: 'small', style: 'margin:0', text: 'چه چیزی این خوانش را عوض می‌کند: ' + o.watch }),
    h('p', { class: 'small muted', style: 'margin:0', text: 'منبع: ' + o.src })]); }
  function table(head, rows) { return h('div', { class: 'grid-wrap' }, [h('table', { class: 'grid' }, [h('thead', null, [h('tr', null, head.map(function (t) { return h('th', { text: t }); }))]), h('tbody', null, rows.map(function (r) { return h('tr', null, r.map(function (c) { return h('td', null, [c && c.nodeType ? c : document.createTextNode(c == null ? '—' : String(c))]); })); }))])]); }
  function P_(t, c) { return h('p', { class: c || 'small', text: t }); }

  function dashTab(ctx) {
    var R = ctx.R, S = ctx.S, kids = [];
    kids.push(ctx.panel('جمع‌بندی: اقتصاد ایران در ' + plabel(R.P.id), [R.regime ? h('div', null, [h('div', { style: 'font-size:22px;font-weight:800', text: R.regime + (isFinite(R.stag) ? ' — شدت ' + fa(R.stag, 0) + ' از ۱۰۰' : '') }), P_(R.regimeWhy)]) : P_('برای تعیین وضعیت چرخه دست‌کم شامخ (یا سفارش و فروش) و تورم لازم است.', 'warn-t'),
      R.nQuoted ? P_(fa(R.nQuoted, 0) + ' عدد این ماه هنوز با منبع اصلی تأیید نشده‌اند (برچسب «نقل‌قول»). تحلیل روی همین عددها ساخته شده و با تأیید یا اصلاح آن‌ها خودکار عوض می‌شود.', 'warn-t') : null,
      table(['بازار', 'آخرین', 'بازده ۱ / ۳ / ۱۲ ماه (اسمی)', 'بازده واقعی ۱۲ ماه', 'خوانش موتور (مرحله · وضعیت · اقدام)'], R.mk), P_('ستون آخر از موتور مرکزی همین برنامه است؛ اگر اقتصاد واقعی و قیمت‌ها هم‌جهت نیستند، علت را در کارت «بازار و اقتصاد واقعی» ببینید.', 'small muted')]));
    kids.push(ctx.panel('کارت‌های تحلیلی (' + fa(R.F.length, 0) + ')', [R.F.length ? h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px' }, R.F.map(cardEl)) : P_('هنوز عددی وارد نشده است. از زبانهٔ «ورود داده‌ها» شروع کنید.')]));
    return ctx.group(kids);
  }
  function inputTab(ctx) {
    var S = ctx.S, R = ctx.R, P = R.P;
    var yr = h('input', { class: 'f-in', type: 'number', min: 1390, max: 1450, value: +P.id.split('-')[0], 'aria-label': 'سال', style: 'width:90px' }), mo = h('select', { class: 'f-in', 'aria-label': 'ماه' }, MON.map(function (m, i) { return h('option', { value: i + 1, text: m }); })); mo.value = +P.id.split('-')[1];
    var go = h('button', { class: 'btn', type: 'button', text: 'باز کردن / ساختن این ماه', onclick: function () { var id = yr.value + '-' + (mo.value < 10 ? '0' : '') + mo.value; if (!per(S, id)) { S.periods.push({ id: id, v: {}, src: {}, at: Date.now() }); S.periods.sort(function (a, b) { return a.id < b.id ? -1 : 1; }); } S.cur = id; ctx.rerender(); } });
    var auto = h('button', { class: 'btn', type: 'button', text: 'پرکردن خانه‌های بازار از دادهٔ همین برنامه', onclick: function () { var n = 0; ['fx_free', 'fx_free_y', 'coin', 'tedpix', 'tedpix_y'].forEach(function (k) { if (isFinite(R.auto[k]) && !isFinite(num(P.v[k]))) { P.v[k] = Math.round(R.auto[k]); P.src[k] = { source: BY[k][5] + ' (از دادهٔ ذخیره‌شدهٔ این برنامه)', date: new Date().toLocaleDateString('fa-IR'), st: 'verified' }; n++; } }); U.toast(n ? fa(n, 0) + ' خانه پر شد.' : 'دادهٔ بازار در دسترس نیست یا خانه‌ها پر بودند.'); ctx.rerender(); } });
    var imf = h('button', { class: 'btn', type: 'button', text: 'دریافت پیش‌بینی رشد از IMF', onclick: function () { if (!Hub.data || !Hub.data.web) { U.toast('اتصال داده در دسترس نیست.'); return; } imf.disabled = true;
      Hub.data.web('https://www.imf.org/external/datamapper/api/v1/NGDP_RPCH/IRN', 'IMF').then(function (j) { var v = j && j.values && j.values.NGDP_RPCH && j.values.NGDP_RPCH.IRN; if (!v) throw new Error('پاسخ IMF خالی بود'); var y = new Date().getFullYear(); while (y > 1990 && v[y] == null) y--;
        P.v.gdp_imf = Math.round(v[y] * 10) / 10; P.src.gdp_imf = { source: 'IMF WEO DataMapper · NGDP_RPCH · سال ' + y, date: new Date().toLocaleDateString('fa-IR'), st: 'verified' }; U.toast('رشد ' + y + ': ' + fa(v[y]) + '٪'); ctx.rerender(); }).catch(function (e) { U.toast('IMF در دسترس نیست: ' + e.message, 'warn'); imf.disabled = false; }); } });
    var groups = G.map(function (g) { var rows = IND.filter(function (r) { return r[3] === g[0]; }).map(function (r) { var k = r[0], s = P.src[k] = P.src[k] || { source: '', date: '', st: '' };
        var iv = h('input', { class: 'f-in', type: 'text', inputmode: 'decimal', value: isFinite(num(P.v[k])) ? String(P.v[k]) : '', placeholder: isFinite(num(R.auto[k])) ? 'خودکار: ' + fa(R.auto[k]) : '', 'aria-label': r[1], style: 'width:110px' });
        iv.addEventListener('change', function () { var x = num(iv.value); if (iv.value === '') delete P.v[k]; else if (isFinite(x)) P.v[k] = x; else { U.toast('عدد معتبر نیست: ' + r[1], 'warn'); return; } ctx.recompute(); });
        var is = h('input', { class: 'f-in', type: 'text', value: s.source || '', placeholder: r[5], 'aria-label': 'منبع ' + r[1] }); is.addEventListener('change', function () { s.source = is.value; ctx.recompute(); });
        var id_ = h('input', { class: 'f-in', type: 'text', value: s.date || '', placeholder: '۱۴۰۵/۰۸/۲۵', 'aria-label': 'تاریخ انتشار ' + r[1], style: 'width:110px' }); id_.addEventListener('change', function () { s.date = id_.value; ctx.recompute(); });
        var st = h('select', { class: 'f-in', 'aria-label': 'وضعیت ' + r[1] }, [['', '—'], ['verified', 'تأییدشده با منبع اصلی'], ['quoted', 'نقل‌قول (ثانویه)']].map(function (o) { return h('option', { value: o[0], text: o[1] }); })); st.value = s.st || ''; st.addEventListener('change', function () { s.st = st.value; ctx.recompute(); });
        var pv = R.Pp ? num(R.Pp.v[k]) : NaN;
        return [h('span', { title: r[4], text: r[1] }), r[2], iv, isFinite(pv) ? fa(pv) : '—', is, id_, st]; });
      return ctx.panel(g[1], [table(['شاخص', 'واحد', 'مقدار ' + plabel(P.id), 'ماه قبل', 'منبع', 'تاریخ انتشار', 'وضعیت'], rows)]); });
    return ctx.group([ctx.panel('ماه گزارش', [h('div', { class: 'row-ctl', style: 'flex-wrap:wrap;gap:8px' }, [mo, yr, go, auto, imf]),
      P_('هر ماه که گزارش تازه منتشر شد، ماه را انتخاب کنید و عددها را وارد کنید. خانه‌ای که خالی بماند در تحلیل استفاده نمی‌شود و کارت مربوط ساخته نمی‌شود. عدد را از گزارش اصلی (اتاق ایران برای شامخ، مرکز آمار برای تورم، بانک مرکزی برای پول) وارد کنید و وضعیت را «تأییدشده» بگذارید؛ عدد نقل‌شده از رسانه یا شبکهٔ اجتماعی «نقل‌قول» بماند.'),
      P_('عددهای مهر ۱۴۰۵ از استوری‌هایی که فرستادید پر شده و «نقل‌قول» علامت خورده‌اند؛ پیش از تصمیم با گزارش اصلی تطبیق دهید.', 'warn-t')])].concat(groups));
  }
  function histTab(ctx) {
    var S = ctx.S, ps = S.periods.slice(-12), keys = IND.filter(function (r) { return ps.some(function (p) { return isFinite(num(p.v[r[0]])); }); });
    var spark = function (vals) { var f = vals.filter(isFinite); if (f.length < 2) return '—'; var mn = Math.min.apply(null, f), mx = Math.max.apply(null, f), W = 90, H = 22, pts = vals.map(function (v, i) { return isFinite(v) ? (i * W / (vals.length - 1)).toFixed(1) + ',' + (mx === mn ? H / 2 : H - (v - mn) / (mx - mn) * H).toFixed(1) : null; }).filter(Boolean).join(' ');
      var ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'); svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('aria-hidden', 'true'); var pl = document.createElementNS(ns, 'polyline'); pl.setAttribute('points', pts); pl.setAttribute('fill', 'none'); pl.setAttribute('stroke', 'currentColor'); pl.setAttribute('stroke-width', '1.5'); svg.appendChild(pl); return svg; };
    var rows = keys.map(function (r) { var vals = ps.map(function (p) { return num(p.v[r[0]]); }); return [r[1]].concat(vals.map(function (v) { return isFinite(v) ? fa(v) : '—'; })).concat([spark(vals)]); });
    return ctx.group([ctx.panel('تاریخچهٔ ماهانه (۱۲ ماه آخر واردشده)', [rows.length ? table(['شاخص'].concat(ps.map(function (p) { return plabel(p.id); })).concat(['روند']), rows) : P_('هنوز داده‌ای ثبت نشده.')])]);
  }
  function guideTab(ctx) {
    var L = function (a) { return h('ul', { class: 'studio-l' }, a.map(function (x) { return h('li', { text: x }); })); };
    return ctx.group([ctx.panel('عددهایی که هر ماه لازم است و از کجا', [L(['شامخ صنعت و زیرشاخص‌ها (تولید، سفارش‌های جدید، فروش، اشتغال، موجودی مواد اولیه، قیمت خرید مواد اولیه، قیمت محصولات، صادرات، موجودی انبار، انتظارات): گزارش ماهانهٔ مرکز پژوهش‌های اتاق بازرگانی ایران، معمولاً اوایل ماه بعد.',
        'تورم نقطه‌به‌نقطه، ماهانه، سالانه و خوراکی‌ها: مرکز آمار ایران (یا بانک مرکزی اگر مرکز آمار منتشر نکرد؛ منبع را جدا ثبت کنید چون روش‌ها فرق دارند).',
        'رشد نقدینگی و پایهٔ پولی: گزیدهٔ آمارهای بانک مرکزی. نرخ بین‌بانکی: بانک مرکزی. بازده اخزا: ابزار «اوراق» همین برنامه یا TSETMC.',
        'دلار آزاد، سکه و شاخص کل: خودکار از دادهٔ همین برنامه (دکمهٔ «پرکردن خانه‌های بازار»). نرخ مرکز مبادله: سامانهٔ مرکز مبادلهٔ ارز و طلا.',
        'رشد فصلی: مرکز آمار / بانک مرکزی. پیش‌بینی IMF: دکمهٔ «دریافت پیش‌بینی رشد از IMF» (DataMapper، شاخص NGDP_RPCH).',
        'بیکاری: مرکز آمار. کسری بودجه: گزارش‌های دیوان محاسبات یا سازمان برنامه (به همت). صادرات نفت: منابع ردیابی نفتکش (ثانویه؛ «نقل‌قول»). محدودیت برق صنایع: توانیر و انجمن‌های صنفی.'])]),
      ctx.panel('قاعده‌ها', [L(['وضعیت چرخه: رشد = شامخ صنعت (یا کل، یا میانگین سفارش و فروش) با مرز ۵۰؛ تورم = نقطه‌به‌نقطه، با شتاب از مقایسهٔ تورم ماهانهٔ سالانه‌شده. زیر ۵۰ و تورم ≥ ۲۵٪ = رکود تورمی.',
        'شدت رکود تورمی = (۵۰ − رشد) × ۸ + min(تورم، ۱۰۰) × ۰٫۵، محدود به ۰ تا ۱۰۰. این یک نمرهٔ توصیفی است، نه احتمال.',
        'فشار بر حاشیهٔ سود = شاخص قیمت خرید مواد اولیه − شاخص قیمت محصولات (بالای ۱۰ = فشار).',
        'نشانگر پیشرو = سفارش‌های جدید − موجودی محصول در انبار (یا مواد اولیه).',
        'ابرتورم: تعریف کیگن، تورم ماهانه ≥ ۵۰٪. تورم بسیار بالا طبق IAS 29: تورم انباشتهٔ سه سال ≥ ۱۰۰٪.',
        'نرخ واقعی و نرخ ارز واقعی با فرمول فیشر: (۱ + نرخ اسمی) ÷ (۱ + تورم) − ۱. تورم خارجی در نرخ ارز واقعی لحاظ نشده است.',
        'پیامدهای بازار قاعده‌های تحلیلی رایج‌اند، نه پیش‌بینی آزموده‌شده. سنجش آماری رابطهٔ شامخ و بازده بازارها به دست‌کم ۳۶ ماه دادهٔ ثبت‌شده نیاز دارد و پس از آن اضافه می‌شود.'])])]);
  }
  TK.define({
    id: 'iran-macro', title: 'Iran economy: real-economy monitor (PMI, inflation, growth)', sections: ['iran'], priority: 0, version: 1, storeKey: KEY,
    summary: 'Monthly official numbers you enter — PMI and its sub-indices, inflation, money, rates, growth, budget and energy — turned into a cycle regime, analytical cards with sources, and what they mean for stocks, gold, coin, dollar and bonds.',
    sample: sample, blank: sample, run: run, scenarios: false,
    eyebrow: function () { return 'Iran economy · Real economy'; }, heading: function () { return 'پایش اقتصاد واقعی ایران: شامخ، تورم، رشد'; }, filename: function () { return 'Iran_Macro'; },
    kpis: function (ctx) { var R = ctx.R; return [['Regime', function () { return R.regime || '—'; }, function () { return isFinite(R.stag) ? 'شدت ' + fa(R.stag, 0) + ' از ۱۰۰' : 'دادهٔ کافی نیست'; }],
      ['PMI', function () { return fa(num(R.P.v.pmi)); }, function () { return plabel(R.P.id); }], ['Inflation (y/y)', function () { return isFinite(num(R.P.v.infl_pp)) ? fa(num(R.P.v.infl_pp)) + '٪' : '—'; }, function () { return isFinite(R.ann) ? 'سرعت فعلی ' + fa(R.ann) + '٪ سالانه' : ''; }],
      ['Real rate', function () { return isFinite(R.rr) ? fa(R.rr) + '٪' : '—'; }, function () { return 'اخزا یا بین‌بانکی منهای تورم'; }]]; },
    xlsx: function (S, R) { var b = Hub.xl.book(root.ExcelJS, 'IranMacro'), s = b.sheet('داده‌ها', [2, 34, 12].concat(S.periods.map(function () { return 14; })), { rightToLeft: true }); s.title('پایش اقتصاد واقعی ایران', 'هر ستون یک ماه؛ منبع و وضعیت هر عدد در برگهٔ «منابع»');
      ['شاخص', 'واحد'].concat(S.periods.map(function (p) { return plabel(p.id); })).forEach(function (t, i) { s.put(2 + i, 4, t, 'hdr'); });
      IND.forEach(function (r, k) { s.put(2, 5 + k, r[1], 'wrap'); s.put(3, 5 + k, r[2], 'wrap'); S.periods.forEach(function (p, j) { var x = num(p.v[r[0]]); s.put(4 + j, 5 + k, isFinite(x) ? x : '', 'in', 'dec'); }); });
      var s2 = b.sheet('منابع', [2, 14, 34, 60, 16, 18], { rightToLeft: true }); s2.title('منبع هر عدد'); ['ماه', 'شاخص', 'منبع', 'تاریخ', 'وضعیت'].forEach(function (t, i) { s2.put(2 + i, 4, t, 'hdr'); }); var r2 = 5;
      S.periods.forEach(function (p) { Object.keys(p.v).forEach(function (k) { var q = p.src[k] || {}; if (!BY[k]) return; [plabel(p.id), BY[k][1], q.source || '', q.date || '', q.st === 'verified' ? 'تأییدشده' : q.st === 'quoted' ? 'نقل‌قول' : ''].forEach(function (v, i) { s2.put(2 + i, r2, v, 'wrap'); }); r2++; }); });
      var s3 = b.sheet('تحلیل', [2, 26, 16, 90, 70], { rightToLeft: true }); s3.title('کارت‌های تحلیلی ' + plabel(R.P.id), R.regime ? R.regime + ' — ' + R.regimeWhy : ''); ['عنوان', 'عدد', 'خوانش', 'پیامد برای بازارها'].forEach(function (t, i) { s3.put(2 + i, 4, t, 'hdr'); });
      R.F.forEach(function (o, k) { [o.head, o.num, o.what, o.mkt].forEach(function (v, i) { s3.put(2 + i, 5 + k, v, 'wrap'); }); }); return b.wb || b; },
    tabs: [{ group: 'Outputs', items: [['dash', 'داشبورد و کارت‌های تحلیلی', dashTab], ['hist', 'تاریخچه', histTab], ['guide', 'منابع و قاعده‌ها', guideTab]] }, { group: 'Inputs', items: [['in', 'ورود داده‌ها (هر ماه)', inputTab]] }]
  });
})(window);
