/* =====================================================================
 * TRADING DASHBOARD CENTRE — directive 15 (with 16 and 17 shown here).
 * One page for the trading decision. Everything on it is read from the central signal record of the same engine run
 * (Hub.tradeEngine → X.central): no second signal logic. The page adds only presentation:
 *   · update & monitoring status (smart refresh, last / next check, freshness, errors)
 *   · priority actions (held positions first, then confirmed buys, then confirmations about to happen)
 *   · opportunities in four readiness tiers (confirmed / awaiting confirmation / probable bottom zone / none) + the sell side
 *   · the 15 trading fields per asset, «not computable» where the engine has no value
 *   · gold & coins: bear and bull scenario fields, coin bubbles (global and domestic intrinsic value)
 *   · «why no buy»: every asset counted once with its first blocking reason and the five root causes
 *   · consistency across modules and across horizons · alerts centre · schedule settings
 * Not investment advice: the engine proposes, the user decides.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub; if (!root.document || !Hub || !Hub.toolkit || !Hub.tradeEngine) return;
  var U = Hub.util, h = U.h, TK = Hub.toolkit, TE = Hub.tradeEngine, KEY = 'hub.tradeCenter.v1';
  var fa = TE.fa, pct = TE.pct;
  var CLS = { stock: 'سهام', fund: 'صندوق', gold: 'طلا و سکه', fx: 'ارز', crypto: 'رمزارز', commodity: 'کالا و انرژی', intl: 'شاخص‌های جهانی', option: 'اختیار معامله' };
  var ORD = ['stock', 'fund', 'gold', 'fx', 'crypto', 'commodity', 'option'];
  var TIERC = { ok: 'fit-rec', wait: 'sev-warn', floor: 'sev-info', none: 'sev-muted', pos: 'sev-info' };
  var VFA = { up: 'صعودی', down: 'نزولی', flat: 'خنثی', none: 'دادهٔ کم' };
  var NC = 'دادهٔ کافی برای برآورد نیست (کمتر از ۳۰ جلسه تاریخچه)';
  // gold instruments and their gold content (same table as the gold signal tool: grams × purity)
  var GOLDS = [['ons', 'انس طلا'], ['geram18', 'طلای ۱۸ عیار', 1, 0.75], ['geram24', 'طلای ۲۴ عیار', 1, 0.995], ['mesghal', 'مثقال طلا', 4.6083, 0.705], ['sekee', 'سکه امامی', 8.133, 0.9], ['sekeb', 'سکه بهار آزادی', 8.133, 0.9],
    ['nim', 'نیم سکه', 4.0665, 0.9], ['rob', 'ربع سکه', 2.03325, 0.9], ['gerami', 'سکه گرمی', 1.0166, 0.9]];

  function isF(x) { return typeof x === 'number' && isFinite(x); }
  function n(x, c) { return isF(x) ? fa(x, c && c.cls === 'fx' && Math.abs(x) < 100 ? 2 : Math.abs(x) < 10 ? 2 : Math.abs(x) < 100 ? 1 : 0) : NC; }
  function zone(z) { return z && isF(z[0]) && isF(z[1]) ? n(Math.min(z[0], z[1])) + ' – ' + n(Math.max(z[0], z[1])) : NC; }
  function sh(g) { return g ? TE.shamsi(g) : ''; }
  function chip(t, cls) { return h('span', { class: 'sev ' + (cls || 'sev-info'), 'data-notr': '1', text: t }); }
  function table(head, rows, cls) { return h('div', { class: 'grid-wrap' }, [h('table', { class: 'grid aud se ' + (cls || '') }, [h('thead', null, [h('tr', null, head.map(function (t) { return h('th', { class: 'lbl', text: t }); }))]),
    h('tbody', null, rows.map(function (r) { return h('tr', null, r.map(function (c) { return h('td', { 'data-notr': '1' }, [c instanceof Node ? c : document.createTextNode(c == null ? '—' : String(c))]); })); }))])]); }
  function P(t, cls) { return h('p', { class: cls || 'small', 'data-notr': '1', text: t }); }
  function dt(ms) { return ms ? new Date(ms).toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' }) : '—'; }
  function ago(ms) { if (!ms) return '—'; var m = Math.round((Date.now() - ms) / 60e3); return m < 1 ? 'همین حالا' : m < 60 ? fa(m, 0) + ' دقیقه پیش' : m < 1440 ? fa(m / 60, 1) + ' ساعت پیش' : fa(m / 1440, 1) + ' روز پیش'; }

  /* ---------------- data: one engine run, the central record ---------------- */
  function sample() { return { version: 2, tool: 'trade-center', g: null, cmp: [], sel: null, icat: 'all', bsub: 'idx', lim: 60 }; }
  function run(S) {
    var R = Hub.tradeUI && Hub.tradeUI.engineNow ? Hub.tradeUI.engineNow() : null, X = R && R.X, C = X && X.central;
    var recs = C ? Object.keys(C.by).map(function (k) { return C.by[k]; }) : [];
    var ch = []; if (!X) ch.push({ level: 'critical', msg: 'موتور معاملاتی در دسترس نیست.' }); else if (X.sample) ch.push({ level: 'warning', msg: 'بخشی از داده‌ها نمونه است؛ هیچ سیگنالی قابل اجرا نیست.' });
    return { X: X, C: C, recs: recs, checks: ch };
  }
  function trendOf(r) { var v = r.hzv || {}, u = 0, d = 0; ['s', 'm', 'l'].forEach(function (k) { if (v[k] && v[k].view === 'up') u++; if (v[k] && v[k].view === 'down') d++; });
    return u >= 2 && !d ? 'up' : d >= 2 && !u ? 'down' : u && d ? 'mixed' : u ? 'up' : d ? 'down' : 'flat'; }
  var TRFA = { up: 'صعودی', down: 'نزولی', mixed: 'متضاد میان افق‌ها', flat: 'خنثی' };
  function strengthOf(r) { return isF(r.conf) ? (r.conf >= 70 ? 'strong' : r.conf >= 55 ? 'mid' : 'weak') : 'weak'; }
  var STRFA = { strong: 'قوی (اطمینان ≥ ۷۰٪)', mid: 'متوسط (۵۵ تا ۷۰٪)', weak: 'ضعیف (< ۵۵٪)' };

  /* ---------------- priority actions (directive 15 · 1-2) ---------------- */
  // label → priority bucket; inside a bucket the order is quality: confidence × reward/risk × liquidity
  function actionOf(r) {
    var L = r.L || {}, near = function (lv, p) { return isF(lv) && isF(r.px) && r.px < lv && lv / r.px - 1 <= p; };
    if (r.held) { if (r.act === 'close') return ['exit', 0, 'خروج از معامله']; if (r.act === 'sell') return ['exit', 0, 'فروش (خروج کامل)']; if (r.act === 'reduce') return ['tp', 1, /سقف|هدف/.test(r.actWhy || '') ? 'ذخیرهٔ سود در محدودهٔ مشخص' : 'کاهش موقعیت']; if (r.act === 'scale') return ['buy', 2, 'افزایش تدریجی موقعیت (Scale In)']; return ['hold', 5, 'نگهداری موقعیت']; }
    if (r.tier === 'ok') return ['buy', 1, isF(r.px) && L.buy && r.px <= L.buy[1] ? 'خرید در محدودهٔ مشخص' : 'خرید فقط با پولبک به محدوده'];
    if (r.sell === 'confirmed') return ['sell', 3, 'فروش پس از تأیید برگشت نزولی (اگر دارید)'];
    if (r.tier === 'wait' && near(L.upConf, 0.03)) return ['brk', 3, 'خرید پس از تأیید شکست مقاومت'];
    if (r.tier === 'wait' && L.buy && isF(r.px) && r.px >= L.buy[0] && r.px <= L.buy[1]) return ['conf', 4, 'عدم اقدام تا دریافت تأیید (قیمت در محدودهٔ ورود)'];
    if (r.tier === 'floor' && r.tzState === 'inZone') return ['floor', 4, 'انتظار برای اصلاح قیمت و ورود در کف'];
    if (r.sell === 'inZone') return ['ceil', 4, 'ذخیرهٔ سود اگر دارید (محدودهٔ سقف احتمالی)'];
    return null;
  }

  /* ---------------- the 15 trading fields of one asset (directive 15 · 1-1-ج) ---------------- */
  /* directive 23 · 4: every trade field gets a number. The engine's own level is used when it exists; otherwise a labelled estimate:
     an alternative entry scenario (structural / floor / staged, never a confirmed signal), the nearest structural support or
     resistance (or ATR multiples where price is at an all-time extreme), and a random-walk time estimate ((distance / ATR)² sessions). */
  function rwWin(r, lvl) { var a = r.alt && r.alt.atr; if (!isF(lvl) || !isF(a) || !(a > 0) || !isF(r.px)) return null; var k = Math.pow(Math.abs(lvl - r.px) / a, 2), lo = Math.max(1, Math.ceil(k / 2)), hi = Math.max(2, Math.ceil(2 * k));
    return 'حدود ' + fa(lo, 0) + ' تا ' + fa(hi, 0) + ' جلسه (برآورد گام تصادفی بر پایهٔ ATR؛ اطمینان پایین)'; }
  function fbOf(r) { var L = r.L || {}, A = r.alt || {}, a = A.atr, b = A.best || (A.list || [])[0], E = {};
    var lab = function (v, est) { return { v: v, est: est || null }; }, has = isF(a) && a > 0;
    E.buy = L.buy ? lab(L.buy) : b ? lab([b.entry, b.entry + 0.3 * a], 'سناریوی جایگزین — ' + b.fa + (b.ok ? '' : ' (R:R کمتر از حداقل)') + '؛ آزموده‌نشده') : has && isF(L.upConf) ? lab([L.upConf, L.upConf + 0.3 * a], 'پس از تأیید؛ برآورد ATR') : lab(null);
    E.stop = isF(L.stop) ? lab(L.stop) : b ? lab(b.stop, 'سناریوی جایگزین') : lab(null);
    E.tp = (L.tp || []).filter(isF).length ? lab((L.tp || []).filter(isF)) : b ? lab(b.tp, 'سناریوی جایگزین؛ ' + b.tpSrc) : lab([]);
    E.rr = isF(r.rr) ? lab(r.rr) : b ? lab(b.rr, 'سناریوی جایگزین') : lab(null);
    var sup = (L.sup || []).filter(isF), res = (L.res || []).filter(isF);
    E.sup = lab(sup, L.supSrc && /برآورد|کل تاریخچه/.test(L.supSrc) ? L.supSrc : null); E.res = lab(res, L.resSrc && /برآورد|کل تاریخچه/.test(L.resSrc) ? L.resSrc : null);
    E.floor = L.floor ? lab(L.floor) : has && sup.length ? lab([sup[0] - 0.25 * a, sup[0] + 0.25 * a], 'برآورد از نزدیک‌ترین حمایت؛ مدل کف احتمالی برای این وضعیت فعال نیست') : lab(null);
    E.ceil = L.ceil ? lab(L.ceil) : has && res.length ? lab([res[0] - 0.25 * a, res[0] + 0.25 * a], 'برآورد از نزدیک‌ترین مقاومت؛ مدل سقف احتمالی برای این وضعیت فعال نیست') : lab(null);
    E.dnTp = (L.floor && L.tzT && L.tzT.length ? L.tzT : (L.dnTp || [])).filter(isF); if (!E.dnTp.length) { E.dnTp = sup.slice(0, 3); E.dnEst = 'حمایت‌های ساختاری'; }
    E.after = (L.after || []).filter(isF); if (!E.after.length) { E.after = E.dnTp.slice(0, 3); E.afEst = 'برآورد: حمایت‌ها / اهداف نزولی'; }
    E.winF = L.win && L.floor ? sh(L.win.from) + ' تا ' + sh(L.win.to) : rwWin(r, E.floor.v ? (E.floor.v[0] + E.floor.v[1]) / 2 : NaN);
    E.winC = L.win && L.ceil ? sh(L.win.from) + ' تا ' + sh(L.win.to) : rwWin(r, E.ceil.v ? (E.ceil.v[0] + E.ceil.v[1]) / 2 : NaN);
    E.winT = L.win && L.win.from ? sh(L.win.from) + ' تا ' + sh(L.win.to) + (isF(L.win.T1) ? ' (هدف ' + n(L.win.T1) + ')' : '') : isF(r.days) && (L.tp || []).filter(isF).length ? 'افق ' + fa(r.days, 0) + ' جلسه' : rwWin(r, (E.tp.v || [])[0]);
    return E; }
  function E2(F) { return F.after.length ? lst(F.after) + (F.afEst ? ' (' + F.afEst + ')' : '') : NC; }
  function fv(o, f) { if (!o || o.v == null || (Array.isArray(o.v) && !o.v.length)) return NC; var t = f ? f(o.v) : isF(o.v) ? n(o.v) : String(o.v); return t + (o.est ? ' (' + o.est + ')' : ''); }
  function lst(v) { return v.slice(0, 3).map(function (x) { return n(x); }).join(' / '); }
  function fields(r) {
    var L = r.L || {}, tp = L.tp || [], top = Math.max(isF(tp[1]) ? tp[1] : -Infinity, isF(tp[0]) ? tp[0] : -Infinity), w = L.win;
    // later targets: target 3, then the statistical upside targets of a probable-top zone that lie above target 2 (downside projections are not profit targets of a long)
    var more = (isF(tp[2]) ? [tp[2]] : []).concat(L.ceil ? (L.tzT || []).filter(function (v) { return isF(v) && v > top && !tp.some(function (t) { return Math.abs(t / v - 1) < 0.005; }); }) : []).sort(function (a, b) { return a - b; });
    var bear = r.tier === 'floor' || trendOf(r) === 'down', F = fbOf(r);
    return [
      ['۱. قیمت فعلی', n(r.px, r) + (r.pxKind ? ' — ' + r.pxKind : '')],
      ['۲. محدودهٔ مناسب خرید', L.buy ? zone(L.buy) + (r.tier === 'ok' ? '' : bear ? ' (فقط پس از تأیید برگشت)' : ' (فقط پس از برقراری شرط تأیید)') : fv(F.buy, zone)],
      ['۳. سطح تأیید صعودی', isF(L.upConf) ? n(L.upConf) + (L.upD ? ' (' + pct(L.upD.pct, 1) + '، ' + n(L.upD.amt) + ' از قیمت)' : '') + (L.upTxt ? ' — ' + L.upTxt : '') + (isF(L.struct) && L.struct < L.upConf ? ' · تأیید ساختاری زودتر: بسته‌شدن بالای ' + n(L.struct) + ' (' + pct(L.struct / r.px - 1, 1) + ')' : '') : isF(L.struct) ? n(L.struct) + ' (تأیید ساختاری)' : NC],
      ['۴. سطح تأیید نزولی', isF(L.dnConf) ? n(L.dnConf) + (L.dnD ? ' (' + pct(L.dnD.pct, 1) + '، ' + n(L.dnD.amt) + ' از قیمت)' : '') + (L.dnTxt ? ' — ' + L.dnTxt : '') : NC],
      ['۵. محدودهٔ احتمالی کف', L.floor ? zone(L.floor) + (isF(L.tzConf) ? ' · تأیید برگشت: بسته‌شدن بالای ' + n(L.tzConf) : '') + (L.stage ? ' · ' + L.stage.fa : '') : fv(F.floor, zone)],
      ['۶. محدودهٔ احتمالی سقف', L.ceil ? zone(L.ceil) + (isF(L.tzConf) ? ' · تأیید برگشت نزولی: بسته‌شدن زیر ' + n(L.tzConf) : '') + (L.stage ? ' · ' + L.stage.fa : '') : fv(F.ceil, zone)],
      ['۷. حد سود اول', isF(tp[0]) ? n(tp[0]) : fv({ v: (F.tp.v || [])[0], est: F.tp.est })], ['۸. حد سود دوم', isF(tp[1]) ? n(tp[1]) : fv({ v: (F.tp.v || [])[1], est: F.tp.est })],
      ['۹. حد سودهای بعدی', more.length ? more.slice(0, 3).map(function (v) { return n(v); }).join(' / ') : 'توجیه‌شده نیست'],
      ['۱۰. حد ضرر', isF(L.stop) ? n(L.stop) : fv(F.stop)], ['۱۱. نسبت بازده به ریسک (از قیمت فعلی)', isF(r.rr) ? fa(r.rr, 1) : fv(F.rr, function (v) { return fa(v, 1); })],
      ['۱۲. بازهٔ زمانی احتمالی تحقق هدف', w && w.from ? sh(w.from) + ' تا ' + sh(w.to) + (isF(w.T1) ? ' (هدف ' + n(w.T1) + ')' : '') : F.winT || NC],
      ['۱۳. اقدام پیشنهادی', (actionOf(r) || [0, 0, r.actFa])[2] + ' — ' + (r.actWhy || '')],
      ['۱۴. دلیل اصلی', r.st === 'ok' ? r.why : (r.rcFa ? r.rcFa + ': ' : '') + (r.rcWhy || r.why || '—')],
      ['۱۵. شرط ابطال سناریو', r.tier === 'floor' && isF(L.tzInv) ? 'بسته‌شدن زیر ' + n(L.tzInv) + ' (شکست محدودهٔ کف)' : isF(L.stop) ? 'بسته‌شدن زیر ' + n(L.stop) + (isF(L.inv) && trendOf(r) === 'down' ? '؛ دید نزولی با بسته‌شدن بالای ' + n(L.inv) + ' باطل می‌شود' : '') : isF(F.stop.v) ? 'بسته‌شدن زیر ' + n(F.stop.v) + ' (' + F.stop.est + ')' : isF(L.inv) ? 'دید نزولی با بسته‌شدن بالای ' + n(L.inv) + ' باطل می‌شود' : NC],
      ['وضعیت سیگنال (مرکزی)', r.stFa + ' · ' + r.tierFa + (r.sid ? ' · شناسه ' + r.sid : '')],
      ['افق‌ها', ['s', 'm', 'l'].map(function (k) { var v = r.hzv && r.hzv[k]; return v ? v.fa.split(' (')[0] + ': ' + (VFA[v.view] || v.view) : ''; }).filter(Boolean).join(' · ') || NC],
      ['تاریخ داده', (r.date || '—') + (isF(r.age) ? ' (' + fa(r.age, 0) + ' ساعت پیش دریافت شده)' : '')],
      ['ردیابی تصمیم', 'شناسهٔ سیگنال ' + (r.sigId || r.sid || '—') + ' · نسخهٔ ' + (r.ver || '—') + ' · مدل ' + (r.mv || '—') + ' · افق ' + (r.hz || '—') + ' · زمان محاسبه ' + (r.updAt ? new Date(r.updAt).toLocaleString('fa-IR') : '—') + (r.heldPrev ? ' · آخرین حکم معتبر حفظ شد (دادهٔ تازه از کنترل کیفیت عبور نکرد)' : '')],
      ['اجرای سفارش', r.xo && !r.xo.na ? r.xo.txt + (r.xo.ok ? '' : ' — قابل اجرا نیست: ' + r.xo.whyNot) : r.xo && r.xo.whyNot ? r.xo.whyNot : '—'],
      ['روند (قاعدهٔ واحد سیستم)', Hub.central && Hub.central.trendFa ? Hub.central.trendFa(r.trx).replace(/^روند \(قاعدهٔ واحد سیستم\) /, '') : '—'],
      ['سناریوهای ورود جایگزین (آزموده‌نشده)', r.alt && r.alt.list && r.alt.list.length ? r.alt.list.map(function (q) { return q.fa + ': ورود ' + n(q.entry) + ' (' + pct(q.dist, 1) + ')، حد ضرر ' + n(q.stop) + '، اهداف ' + n(q.tp[0]) + ' / ' + n(q.tp[1]) + '، R:R ' + fa(q.rr, 1) + (q.ok ? '' : ' (کمتر از حداقل)'); }).join(' | ') : '—'],
      // directive 18 · 2-2: the remaining items of the per-asset sheet
      ['وضعیت کف و سقف', r.st4Fa || NC],
      ['محدودهٔ فروش / ذخیرهٔ سود', L.ceil ? zone(L.ceil) + ' (سقف احتمالی)' : isF(tp[0]) ? n(tp[0]) + (isF(tp[1]) ? ' – ' + n(tp[1]) : '') + ' (اهداف سود)' : fv(F.ceil, zone)],
      ['اهداف احتمالی نزولی', (L.floor && L.tzT && L.tzT.length ? L.tzT : (L.dnTp || [])).filter(isF).slice(0, 3).map(function (v) { return n(v); }).join(' / ') || (F.dnTp.length ? lst(F.dnTp) + ' (' + (F.dnEst || '') + ')' : NC)],
      ['حمایت‌ها / مقاومت‌های مهم', ((L.sup || []).filter(isF).slice(0, 3).map(function (v) { return n(v); }).join('، ') || '—') + ' / ' + ((L.res || []).filter(isF).slice(0, 3).map(function (v) { return n(v); }).join('، ') || '—')],
      ['درجهٔ اطمینان و اعتبار تحلیل', (isF(r.conf) ? 'اطمینان مدل ' + fa(r.conf, 0) + '٪' : 'اطمینان نامشخص') + (r.grade ? ' · درجهٔ اعتبارسنجی ' + r.grade : '') + (r.bt && r.bt.oos && isF(r.bt.oos.n) ? ' · برون‌نمونه: ' + fa(r.bt.oos.n, 0) + ' معامله، میانگین ' + (isF(r.bt.oos.avgR) ? fa(r.bt.oos.avgR, 2) + 'R' : '—') + (isF(r.bt.oos.pf) ? '، PF ' + fa(r.bt.oos.pf, 2) : '') : ' · شواهد برون‌نمونه ندارد')],
      ['قابلیت اجرا', (r.execFa || '—') + (r.execWhy && r.execWhy.length ? ' — ' + r.execWhy.join(' ') : '')],
      ['چرخهٔ زمانی (موتور مستقل)', r.cyc ? r.cyc.stFa + (r.cyc.win ? ' · پنجرهٔ ' + r.cyc.win.typeFa + ' ' + sh(r.cyc.win.a) + ' تا ' + sh(r.cyc.win.b) + ' (' + r.cyc.hz + ')' : '') + ' · ' + (r.cyc.valid.length ? 'سطح: ' + r.cyc.lvFa : 'روش معتبری برای این بازار نیست؛ هشدار صادر نمی‌شود') : 'محاسبه نشده (اعتبارسنجی چرخه‌ها هنوز اجرا نشده یا تاریخچه کوتاه است)'],
      ['امتیاز اولویت', r.pri ? fa(r.pri.s, 0) + ' از ۱۰۰ (رتبهٔ ' + fa(r.rank, 0) + ') — ' + priWhy(r) : 'فرصت خرید نیست؛ امتیاز ندارد']];
  }
  // the parts of the priority score, largest contributions first, and the penalties
  function priWhy(r) { var OR = Hub.oppRank; if (!r.pri || !OR) return '';
    var p = r.pri.parts, a = Object.keys(OR.W).map(function (k) { return [k, OR.W[k] * p[k]]; }).sort(function (x, y) { return y[1] - x[1]; });
    return a.map(function (x) { return OR.WFA[x[0]] + ' ' + fa(x[1], 0) + '/' + fa(OR.W[x[0]], 0); }).join('، ') + (r.pri.pen.length ? ' · کسر: ' + faD(r.pri.pen.join('؛ ')) : ''); }
  // short form for tables: the score and its three largest parts; the full breakdown in the tooltip and in the asset sheet
  function priShort(r, noN) { var OR0 = Hub.oppRank; if (!r.pri || !OR0) return '—'; var p = r.pri.parts, a = Object.keys(OR0.W).map(function (k) { return [k, OR0.W[k] * p[k]]; }).sort(function (x, y) { return y[1] - x[1]; }).slice(0, 3);
    return h('span', { title: priWhy(r), 'data-notr': '1', text: (noN ? '' : fa(r.pri.s, 0) + ' · ') + a.map(function (x) { return OR0.WFA[x[0]]; }).join('، ') + (r.pri.pen.length ? ' · با کسر' : '') }); }
  function faD(t) { return String(t).replace(/[0-9]/g, function (c) { return '۰۱۲۳۴۵۶۷۸۹'[c]; }).replace(/\./g, '٫'); }
  function assetRow(r, open) { var a = actionOf(r);
    return h('details', { class: 'prio-card', open: !!open }, [h('summary', null, [h('div', { class: 'mini-l1' }, [h('strong', { 'data-notr': '1', text: r.sym }), chip(CLS[r.cls] || r.cls, 'sev-info'), chip(r.tierFa, TIERC[r.tier]), a ? chip(a[2], a[1] <= 1 ? 'fit-rec' : 'sev-warn') : null,
      h('span', { class: 'small', 'data-notr': '1', text: 'قیمت ' + n(r.px, r) + (r.L && r.L.buy ? ' · ورود ' + zone(r.L.buy) : '') + (r.L && isF(r.L.stop) ? ' · ضرر ' + n(r.L.stop) : '') + (r.L && r.L.tp && isF(r.L.tp[0]) ? ' · هدف ۱ ' + n(r.L.tp[0]) : '') + (isF(r.rr) ? ' · R:R ' + fa(r.rr, 1) : '') })])]),
      table(['مورد', 'مقدار'], fields(r))]); }

  /* ---------------- tab 1: decision dashboard ---------------- */
  function statusPanel(ctx, R) {
    var SR = Hub.smartRefresh, s = SR ? SR.set() : null, st = SR ? SR.state() : null, M = SR ? SR.marketState(null, s) : {}, run0 = U.store.get('hub.updrun.v1', null), A = Hub.alerts ? Hub.alerts.load() : null, C = R.C, cs = R.X && R.X.centralSaved;
    var nNew = A ? A.log.filter(function (e) { return e.state === 'new'; }).length : 0, act = R.recs.filter(function (r) { return r.tier === 'ok' || r.held; }).length, nearN = st ? (st.near || []).length : 0;
    var chg = cs && cs.changes ? cs.changes.length : 0, inval = R.recs.filter(function (r) { return r.st === 'exp'; }).length, F = SR ? SR.freshness() : {};
    var rows = [['آخرین به‌روزرسانی کامل موفق', run0 && run0.doneAt ? dt(run0.doneAt) + ' (' + ago(run0.doneAt) + ') · ' + (run0.id || '') : 'انجام نشده'],
      ['محاسبهٔ حکم مرکزی', C ? dt(C.at) : '—'],
      ['پایش سبک بورس', !SR ? 'غیرفعال' : (M.tse ? 'بازار باز' : 'بازار بسته') + ' · آخرین: ' + ago(st.last.tse) + (st.next.tse ? ' · بعدی: ' + dt(st.next.tse) : '') + (st.err.tse ? ' · خطا: ' + st.err.tse.t : '')],
      ['پایش سبک طلا و ارز', !SR ? 'غیرفعال' : (M.tgju ? 'در ساعات پایش' : 'خارج از ساعات پایش') + ' · آخرین: ' + ago(st.last.tgju) + (st.next.tgju ? ' · بعدی: ' + dt(st.next.tgju) : '') + (st.err.tgju ? ' · خطا: ' + st.err.tgju.t : '')],
      ['تازگی داده‌ها', ORD.map(function (c) { return CLS[c] + ': ' + (F[c] === false ? 'قدیمی (نیازمند تأیید داده)' : 'تازه'); }).join(' · ')],
      ['سیگنال‌های فعال (خرید تأییدشده + موقعیت باز)', fa(act, 0)], ['فرصت‌های نزدیک به سطح کلیدی (پایش با تناوب بیشتر)', fa(nearN, 0)], ['اعلان‌های جدید', fa(nNew, 0)],
      ['سیگنال‌های تغییرکرده در آخرین محاسبه / منقضی‌شده', fa(chg, 0) + ' / ' + fa(inval, 0)],
      ['خطاهای اخیر', st && Object.keys(st.err).length ? Object.keys(st.err).map(function (k) { return (SR.MK[k] || k) + ': ' + st.err[k].t; }).join(' · ') : 'ندارد']];
    var btns = h('div', { class: 'row-ctl' }, [h('button', { class: 'btn primary', type: 'button', text: Hub.updateBusy && Hub.updateBusy() ? 'به‌روزرسانی در حال اجرا…' : 'به‌روزرسانی کامل و محاسبهٔ دوباره', disabled: !!(Hub.updateBusy && Hub.updateBusy()), onclick: function () { if (Hub.updateAll) Hub.updateAll(ctx.rerender, null, function () { if (Hub.smartRefresh) Hub.smartRefresh.afterFull(); ctx.recompute ? ctx.recompute() : ctx.rerender(); }); U.toast('به‌روزرسانی کامل شروع شد؛ پیشرفت در «مرکز مدیریت داده‌ها».', 'good'); } }),
      h('button', { class: 'btn', type: 'button', text: 'بررسی فوری قیمت‌ها (پایش سبک)', onclick: function () { if (!SR) return; Promise.all([SR.light('tse'), SR.light('tgju')]).then(function (r) { U.toast('پایش انجام شد: ' + fa(r[0].events.length + r[1].events.length, 0) + ' رویداد.', 'good'); ctx.rerender(); }); } })]);
    return ctx.panel('وضعیت به‌روزرسانی و پایش بازار', [btns, table(['مورد', 'وضعیت'], rows)]);
  }
  function overview(ctx, R) {
    var rows = ORD.map(function (c) { var A = R.recs.filter(function (r) { return r.cls === c; }); if (!A.length) return null;
      var t = { up: 0, down: 0, mixed: 0, flat: 0 }, hz = { s: [0, 0], m: [0, 0], l: [0, 0] }, conf = [], ceil = 0, floor = 0, stale = 0;
      A.forEach(function (r) { t[trendOf(r)]++; ['s', 'm', 'l'].forEach(function (k) { var v = r.hzv && r.hzv[k]; if (v && v.view === 'up') hz[k][0]++; if (v && v.view === 'down') hz[k][1]++; }); if (isF(r.conf)) conf.push(r.conf); if (r.near === 'ceil' && r.sell === 'inZone') ceil++; if (r.tier === 'floor') floor++; if (isF(r.age) && r.age > 96) stale++; });
      conf.sort(function (a, b) { return a - b; }); var dom = t.up > t.down * 1.5 && t.up >= 0.4 * A.length ? 'صعودی' : t.down > t.up * 1.5 && t.down >= 0.4 * A.length ? 'نزولی' : 'بدون جهت غالب', hzt = function (k) { return 'صعودی ' + fa(hz[k][0], 0) + ' / نزولی ' + fa(hz[k][1], 0); };
      var risk = []; if (stale) risk.push(fa(stale, 0) + ' دادهٔ قدیمی'); if (ceil) risk.push(fa(ceil, 0) + ' در محدودهٔ سقف'); if (floor) risk.push(fa(floor, 0) + ' نزدیک کف');
      return [CLS[c], fa(A.length, 0), dom + ' (' + fa(Math.max(t.up, t.down), 0) + ' از ' + fa(A.length, 0) + ')', conf.length ? 'میانهٔ اطمینان ' + fa(conf[Math.floor(conf.length / 2)], 0) + '٪' : '—', hzt('s'), hzt('m'), hzt('l'), risk.join('؛ ') || '—']; }).filter(Boolean);
    var ch = (R.X && R.X.centralSaved && R.X.centralSaved.changes || []).slice(0, 8).map(function (c) { return c.sym + ': ' + c.from + ' ← ' + c.to; });
    return ctx.panel('الف · نمای کلی بازارها', [table(['بازار', 'تعداد', 'روند غالب', 'قدرت / اطمینان', 'کوتاه‌مدت', 'میان‌مدت', 'بلندمدت', 'ریسک‌ها'], rows),
      P('روند هر افق با همان قاعدهٔ دروازهٔ اعتبار: کوتاه = قیمت و میانگین ۲۰؛ میان = میانگین‌های ۵۰ و ۲۰۰؛ بلند = میانگین ۲۰۰ و قیمت ۲۵۰ جلسه پیش.', 'small muted'),
      ch.length ? h('div', null, [P('تغییرات اخیر حکم مرکزی:'), h('ul', { class: 'studio-l' }, ch.map(function (t) { return h('li', { 'data-notr': '1', text: t }); }))]) : P('در آخرین محاسبه تغییری در حکم مرکزی ثبت نشد.', 'small muted')]); }
  /* ---------------- tab 2: gold & coins (directive 15 · 2) ---------------- */
  function series(X, k) { var z = X && X.zmap && X.zmap['g:' + k]; return z && z.a && !z.a.sample ? z.R.X : null; }
  function bubbles(X) {
    var O = series(X, 'ons'), D = series(X, 'price_dollar_rl'), G = series(X, 'geram18'); if (!O || !D) return { ok: false, why: 'سری انس یا دلار آزاد در داده نیست.' };
    var m = function (S) { var o = {}; for (var i = 0; i < S.n; i++) o[S.d[i]] = S.c[i]; return o; }, mo = m(O), md = m(D), mg = G ? m(G) : {};
    return { ok: true, rows: GOLDS.filter(function (g) { return g[2] && g[0] !== 'geram18'; }).concat([['geram18', 'طلای ۱۸ عیار', 1, 0.75]]).map(function (g) { var S = series(X, g[0]); if (!S) return null;
      var lo = null, ld = null, lg = null, hist = [], dom = [];
      for (var i = 0; i < S.n; i++) { var d = S.d[i]; if (mo[d] != null) lo = mo[d]; if (md[d] != null) ld = md[d]; if (mg[d] != null) lg = mg[d]; if (lo && ld) hist.push(S.c[i] / (g[2] * g[3] / 31.1035 * lo * ld) - 1); if (lg && g[0] !== 'geram18') dom.push(S.c[i] / (g[2] * g[3] / 0.75 * lg) - 1); }
      var last = hist.slice(-250), b = hist[hist.length - 1], sorted = last.slice().sort(function (a, c) { return a - c; });
      return { k: g[0], name: g[1], px: S.c[S.n - 1], d: S.d[S.n - 1], intr: g[2] * g[3] / 31.1035 * lo * ld, b: b, med: sorted.length ? sorted[Math.floor(sorted.length / 2)] : NaN, rank: last.length ? last.filter(function (v) { return v <= b; }).length / last.length : NaN, n: last.length, dom: dom.length ? dom[dom.length - 1] : NaN }; }).filter(Boolean),
      at: { o: O.d[O.n - 1], u: D.d[D.n - 1] } };
  }
  function goldTab(ctx) {
    var R = ctx.R, X = R.X, G = R.recs.filter(function (r) { return r.cls === 'gold'; }), ordK = GOLDS.map(function (g) { return 'g:' + g[0]; });
    G.sort(function (a, b) { var i = ordK.indexOf(a.key), j = ordK.indexOf(b.key); return (i < 0 ? 99 : i) - (j < 0 ? 99 : j); });
    if (!G.length) return ctx.panel('طلا و سکه', [P('هیچ دارایی طلا و سکه با دادهٔ کافی در محاسبه نیست. «طلا و سکه (TGJU)» را در مرکز داده به‌روز کنید.')]);
    var bear = G.filter(function (r) { return r.near === 'floor' || trendOf(r) === 'down'; }), bull = G.filter(function (r) { return bear.indexOf(r) < 0; });
    var dn = table(['دارایی', 'قیمت', 'اهداف احتمالی نزولی', 'حمایت‌های مهم', 'محدودهٔ احتمالی کف', 'بازهٔ زمانی رسیدن به کف', 'سطح تأیید برگشت صعودی', 'محدودهٔ خرید پس از تأیید', 'حد ضرر خرید', 'اهداف پس از ورود', 'مرحله / وضعیت'],
      bear.map(function (r) { var L = r.L || {}, F = fbOf(r), cf = isF(L.tzConf) && L.floor ? L.tzConf : L.upConf; return [r.sym, n(r.px, r), F.dnTp.length ? lst(F.dnTp) + (F.dnEst ? ' (' + F.dnEst + ')' : '') : NC, fv(F.sup, lst),
        fv(F.floor, zone), F.winF || NC, isF(cf) ? 'بسته‌شدن بالای ' + n(cf) + ' (' + pct(cf / r.px - 1, 1) + ')' : NC, fv(F.buy, zone), isF(L.tzStop) && L.floor ? n(L.tzStop) : fv(F.stop),
        fv(F.tp, lst), (L.stage ? L.stage.fa + ' — ' : '') + r.tierFa]; }));
    var up = table(['دارایی', 'قیمت', 'اهداف احتمالی صعودی', 'مقاومت‌های مهم', 'محدودهٔ احتمالی سقف', 'بازهٔ زمانی رسیدن به سقف', 'سطح تأیید برگشت نزولی', 'محدودهٔ ذخیرهٔ سود / فروش', 'حد خروج', 'اهداف احتمالی پس از اصلاح', 'مرحله / وضعیت'],
      bull.map(function (r) { var L = r.L || {}, F = fbOf(r), cf = L.ceil && isF(L.tzConf) ? L.tzConf : L.dnConf; return [r.sym, n(r.px, r), L.ceil && L.tzT.length ? lst(L.tzT) : fv(F.tp, lst), fv(F.res, lst),
        fv(F.ceil, zone), F.winC || NC, isF(cf) ? 'بسته‌شدن زیر ' + n(cf) + ' (' + pct(cf / r.px - 1, 1) + ')' : NC, fv(F.ceil, zone), L.ceil && isF(L.tzStop) ? n(L.tzStop) : isF(L.dnConf) ? n(L.dnConf) : NC,
        E2(F), (L.stage ? L.stage.fa + ' — ' : '') + r.tierFa]; }));
    var B = bubbles(X), bt = B.ok ? table(['دارایی', 'قیمت', 'ارزش ذاتی (انس × دلار)', 'حباب نسبت به ارزش جهانی', 'میانهٔ ۲۵۰ روز', 'رتبهٔ حباب فعلی در ۲۵۰ روز', 'حباب نسبت به طلای ۱۸ داخلی'], B.rows.map(function (o) {
      return [o.name, n(o.px), n(o.intr), pct(o.b, 1), pct(o.med, 1), isF(o.rank) ? 'صدک ' + fa(o.rank * 100, 0) + ' (از ' + fa(o.n, 0) + ' روز)' : '—', o.k === 'geram18' ? '—' : pct(o.dom, 1)]; })) : P(B.why);
    var GL = null; try { GL = TE.goldLink ? TE.goldLink(X) : null; } catch (e) { GL = null; }
    var glP = GL && GL.ok ? P('طلای ۱۸ داخلی ' + n(GL.g) + ' در برابر ارزش ضمنی ' + n(GL.imp) + ' (انس ' + n(GL.o) + ' × دلار ' + n(GL.u) + ' × ۰٫۷۵ ÷ ۳۱٫۱۰۳۵): اختلاف ' + pct(GL.pr, 1) + ' — صدک ' + fa(GL.prPct * 100, 0) + ' در ' + fa(GL.n, 0) + ' روز. تجزیهٔ تغییر ۲۰ روزه: ' + (GL.dec || []).filter(function (d) { return d.k === 20; }).map(function (d) { return 'طلا ' + pct(d.g, 1) + ' = انس ' + pct(d.o, 1) + ' + دلار ' + pct(d.u, 1) + ' + اختلاف ' + pct(d.p, 1); }).join('')) : null;
    return ctx.group([ctx.panel('طلا و سکه — شرایط نزولی (کف خرید)', [P('هر سه مرحله جدا: ۱ نزدیک شدن به محدوده · ۲ انتظار برای تأیید · ۳ تأیید و اقدام. رسیدن به حمایت به‌تنهایی دستور خرید نیست.', 'small muted'), bear.length ? dn : P('هیچ داراییِ طلا در روند نزولی یا نزدیک کف نیست.')]),
      ctx.panel('طلا و سکه — شرایط صعودی (سقف فروش)', [bull.length ? up : P('هیچ داراییِ طلا در روند صعودی نیست.')]),
      ctx.panel('رابطهٔ متغیرها: انس، دلار، طلای داخلی و حباب سکه', [glP, bt, P('ارزش ذاتی = وزن (گرم) × عیار ÷ ۳۱٫۱۰۳۵ × انس جهانی × دلار آزاد. سکهٔ تمام: ۸٫۱۳۳ گرم با عیار ۹۰۰؛ نیم و ربع و گرمی به نسبت وزن (همان جدول ابزار سیگنال طلا). حباب داخلی = قیمت ÷ (طلای خالص سکه به گرم ۱۸ عیار × قیمت طلای ۱۸) − ۱. رتبه یعنی حباب امروز از چند درصد روزهای ۲۵۰ روز اخیر بیشتر است؛ این یک توصیف است، نه پیش‌بینی.', 'small muted')]),
      ctx.panel('جزئیات کامل هر دارایی طلا (۱۵ مورد)', G.map(function (r) { return assetRow(r, false); }))]); }

  /* ---------------- tab 3: why no buy (directive 15 · 3, test 4) ---------------- */
  function whyTab(ctx) {
    var R = ctx.R, C = R.C, F = C && C.funnel; if (!F) return ctx.panel('چرا سیگنال خرید نیست؟', [P('حکم مرکزی محاسبه نشده است.')]);
    var RC = TE.RCFA || {}, nb = F.n - (F.tier.ok || 0);
    var head = [P('دارایی‌های بررسی‌شده: ' + fa(F.n, 0) + ' از ' + fa(F.universe, 0) + ' دارایی دارای داده · خرید تأییدشده: ' + fa(F.tier.ok || 0, 0) + ' · در انتظار تأیید: ' + fa(F.tier.wait || 0, 0) + ' · نزدیک کف: ' + fa(F.tier.floor || 0, 0) + ' · فاقد فرصت: ' + fa(F.tier.none || 0, 0) + (F.tier.pos ? ' · موقعیت باز: ' + fa(F.tier.pos, 0) : '') + '.', ''),
      F.main ? h('div', { class: 'callout ' + (F.main.k === 'market' ? 'info' : 'warn') }, [P('علت اصلی نبودِ خرید: ' + F.main.fa + ' — ' + fa(F.main.n, 0) + ' از ' + fa(nb, 0) + ' دارایی (' + pct(F.main.share, 0) + ').', '')]) : null,
      F.valState !== 'ok' ? h('div', { class: 'callout warn' }, [P(F.valState === 'none' ? 'اعتبارسنجی (بک‌تست استراتژی‌ها) اجرا نشده است: طبق قاعدهٔ دروازهٔ اعتبار هیچ سیگنالی «تأییدشده» نمی‌شود، حتی اگر قیمت و روند مناسب باشد. این علت فنی است، نه شرایط بازار.' : F.valState === 'stale' ? 'اعتبارسنجی مربوط به تنظیمات قبلی است؛ تا اجرای دوباره، سیگنال‌ها تأیید نمی‌شوند.' : 'اعتبارسنجی روی دادهٔ نمونه است.', ''),
        h('button', { class: 'btn primary', type: 'button', text: 'اجرای به‌روزرسانی کامل همراه با اعتبارسنجی', onclick: function () { if (Hub.updateAll) Hub.updateAll(ctx.rerender, null, function () { if (Hub.smartRefresh) Hub.smartRefresh.afterFull(); }); } })]) : null];
    var cz = Object.keys(F.cause).sort(function (a, b) { return F.cause[b] - F.cause[a]; }).map(function (k) { return [(TE.CAUSEFA || {})[k] || k, fa(F.cause[k], 0), pct(F.cause[k] / Math.max(1, nb), 0)]; });
    var rcs = Object.keys(F.rc).sort(function (a, b) { return F.rc[b] - F.rc[a]; });
    var byc = ORD.filter(function (c) { return F.byCls[c]; }).map(function (c) { var o = F.byCls[c], top = Object.keys(o.rc).sort(function (a, b) { return o.rc[b] - o.rc[a]; }).slice(0, 3).map(function (k) { return RC[k] + ' (' + fa(o.rc[k], 0) + ')'; }).join('؛ ');
      return [CLS[c], fa(o.n, 0), fa(o.ok || 0, 0), fa(o.wait || 0, 0), fa(o.floor || 0, 0), fa(o.none || 0, 0), top || '—']; });
    // filters too strict? assets whose only blocker is the model gate while trend and price conditions favour a buy
    var gateOnly = R.recs.filter(function (r) { return r.tier === 'wait' && /^(valNone|model|grade|conf)$/.test(r.rc || ''); });
    var detail = rcs.map(function (k) { var A = R.recs.filter(function (r) { return r.rc === k && r.tier !== 'ok'; });
      return h('details', { class: 'fold' }, [h('summary', { text: RC[k] + ' — ' + fa(A.length, 0) + ' دارایی' }), table(['نماد', 'بازار', 'سطح آمادگی', 'شرح قابل ردیابی'], A.map(function (r) { return [r.sym, CLS[r.cls] || r.cls, r.tierFa, (r.rcWhy || r.why || '').slice(0, 220)]; }))]); });
    var out = F.outside && F.outside.length ? h('details', { class: 'fold' }, [h('summary', { text: 'بیرون از پوشش تحلیل — ' + fa(F.outside.length, 0) + ' دارایی' }), table(['نماد', 'بازار', 'علت'], F.outside.slice(0, 300).map(function (o) { return [o.sym, CLS[o.cls] || o.cls, o.why]; }))]) : P('همهٔ دارایی‌های دارای داده تحلیل شدند (هیچ دارایی بیرون از پوشش نیست).', 'small muted');
    return ctx.group([ctx.panel('چرا سیگنال خرید نیست؟ (هر دارایی یک بار، با نخستین علت مانع)', head),
      ctx.panel('پنج علت ریشه‌ای', [table(['علت', 'تعداد دارایی', 'سهم از دارایی‌های بدون خرید'], cz), P('دسته‌بندی: شرایط بازار = روند، نقطهٔ ورود، نقدشوندگی، ریسک رژیم · سخت‌گیری فیلتر = دروازهٔ اعتبار مدل، درجهٔ اعتبارسنجی، اطمینان و R:R · نقص داده · محدودیت پوشش · خطای ارتباط ماژول‌ها/اعتبارسنجی اجرانشده. معیار سیگنال برای پر کردن فهرست پایین آورده نمی‌شود.', 'small muted'),
        h('div', { class: 'callout info' }, [P(fa(gateOnly.length, 0) + ' دارایی از نظر روند و قیمت جذاب‌اند و فقط دروازهٔ اعتبار مدل مانع آن‌هاست' + (gateOnly.length ? ' (' + gateOnly.slice(0, 12).map(function (r) { return r.sym; }).join('، ') + (gateOnly.length > 12 ? ' و …' : '') + ')' : '') + '. اگر این عدد زیاد است، راه درست اجرای اعتبارسنجی با دادهٔ تازه یا بازبینی استراتژی همان بازار است، نه برداشتن دروازه.', '')])]),
      ctx.panel('به تفکیک بازار', [table(['بازار', 'بررسی‌شده', 'تأییدشده', 'در انتظار تأیید', 'نزدیک کف', 'فاقد فرصت', 'سه علت پرتکرار'], byc)]),
      ctx.panel('فهرست کامل به تفکیک علت (قابل ردیابی)', detail.concat([out]))]); }

  /* ---------------- tab 4: one verdict everywhere (directive 15 · 4) ---------------- */
  function syncTab(ctx) {
    var R = ctx.R, X = R.X, CM = X && X.consistency, C = R.C; if (!C) return ctx.panel('هماهنگی سیگنال‌ها', [P('حکم مرکزی محاسبه نشده است.')]);
    var mods = [['مرکز داشبورد معاملاتی (همین صفحه)', 'رکورد مرکزی (X.central)'], ['زبانهٔ سیگنال‌ها و کارت‌ها', 'centralApply: کارت خرید بدون تأیید مرکزی به «نگه‌داری» برمی‌گردد'], ['داشبورد تصمیم معامله‌گری و فرصت‌های برتر', 'همان رکورد مرکزی'],
      ['اعلان‌ها', 'فقط تغییر حکم مرکزی یا رسیدن قیمت به سطوح همان رکورد'], ['ثبت تغییرات و تاریخچه', 'hub.central.v1 (هر بار محاسبه)']];
    var conf = R.recs.filter(function (r) { var v = r.hzv || {}, a = ['s', 'm', 'l'].map(function (k) { return v[k] && v[k].view; }); return a.indexOf('up') >= 0 && a.indexOf('down') >= 0; });
    var hzRows = conf.slice(0, 200).map(function (r) { var v = r.hzv; return [r.sym, CLS[r.cls] || r.cls, ['s', 'm', 'l'].map(function (k) { return v[k] ? v[k].fa.split(' (')[0] + ' ' + (VFA[v[k].view] || '') : ''; }).filter(Boolean).join(' · '),
      (v.s && v.s.view === 'down' && (v.m && v.m.view === 'up' || v.l && v.l.view === 'up')) ? 'اصلاح کوتاه‌مدت در روند بزرگ‌تر صعودی: معامله‌گر کوتاه‌مدت صبر کند؛ سرمایه‌گذار میان/بلندمدت فقط در محدودهٔ ورود و با حد ضرر' : 'جهش کوتاه‌مدت در روند بزرگ‌تر نزولی: خرید میان‌مدت توصیه نمی‌شود؛ کوتاه‌مدت فقط با حد ضرر نزدیک'];
    });
    var crit = CM ? CM.list.filter(function (m) { return m.sev === 'crit'; }) : [];
    return ctx.group([ctx.panel('یک حکم در همهٔ بخش‌ها', [table(['بخش', 'منبع داده'], mods), CM ? h('div', { class: 'callout ' + (CM.crit ? 'warn' : 'info') }, [P('پایش یکپارچگی: ' + fa(CM.crit, 0) + ' تناقض جدی، ' + fa(CM.warn, 0) + ' هشدار (زمان: ' + dt(CM.at) + ').', '')]) : null,
        CM && CM.list.length ? table(['شدت', 'مورد', 'نماد', 'جزئیات'], CM.list.map(function (m) { return [m.sev === 'crit' ? 'جدی' : 'هشدار', m.what, m.sym, m.detail]; })) : P('هیچ تناقضی میان بخش‌ها دیده نشد.', 'small'),
        P('آزمون هماهنگی: هر سیگنال «تأییدشده» در موتور مرکزی باید در فرصت‌ها، اقدامات و این صفحه با همان سطوح دیده شود؛ نبود آن در فهرست فرصت‌ها «تناقض جدی» ثبت می‌شود. تعداد تناقض‌های جدی فعلی: ' + fa(crit.length, 0) + '.', 'small muted')]),
      ctx.panel('سیگنال‌های متفاوت در افق‌های مختلف (' + fa(conf.length, 0) + ') — تناقض سیستمی نیستند', [P('افق‌ها جدا ثبت شده‌اند؛ اقدام بر پایهٔ افق معاملاتی شما انتخاب شود. دو بخش با داده و افق یکسان همیشه یک حکم دارند، چون هر دو از همین رکورد می‌خوانند.', 'small muted'), hzRows.length ? table(['نماد', 'بازار', 'جهت هر افق', 'معنا برای اقدام'], hzRows) : P('موردی نیست.')])]); }

  /* ---------------- tab 5: alerts centre (directive 17) ---------------- */
  function alertsTab(ctx) {
    var A = Hub.alerts; if (!A) return ctx.panel('مرکز اعلان‌ها', [P('ماژول اعلان بارگذاری نشده است.')]);
    var S = A.load(), s = S.set, perm = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
    var cb = function (obj, k, lab) { var i = h('input', { type: 'checkbox', 'aria-label': lab }); i.checked = !!obj[k]; i.addEventListener('change', function () { obj[k] = i.checked; A.save(S); }); return h('label', { class: 'small', style: 'margin-inline-end:.8rem' }, [i, ' ' + lab]); };
    var num = function (k, lab, w) { var i = h('input', { type: 'number', class: 'f-in', style: 'width:' + (w || 5) + 'rem', value: s[k], 'aria-label': lab }); i.addEventListener('change', function () { s[k] = Number(i.value); A.save(S); }); return h('label', { class: 'small', style: 'margin-inline-end:.8rem' }, [lab + ' ', i]); };
    var permP = h('div', { class: 'row-ctl' }, [P('اعلان سیستمی (Push در همین دستگاه): ' + ({ granted: 'اجازه داده شده', denied: 'رد شده — از تنظیمات مرورگر/گوشی باز کنید', default: 'هنوز درخواست نشده', unsupported: 'در این مرورگر پشتیبانی نمی‌شود (در آیفون: برنامه را به صفحهٔ اصلی اضافه کنید)' })[perm] + '.', 'small'),
      perm === 'default' ? h('button', { class: 'btn primary', type: 'button', text: 'اجازهٔ ارسال اعلان', onclick: function () { A.requestPermission().then(function () { ctx.rerender(); }); } }) : null,
      h('button', { class: 'btn ghost', type: 'button', text: 'اعلان آزمایشی', onclick: function () { A.deliver([Object.assign(A.card({ key: 'test', sym: 'آزمایش', cls: 'stock', px: NaN, L: {} }), { t: 'info', lvl: 'info', lvlFa: 'اطلاع‌رسانی', title: 'اعلان آزمایشی', side: 'info', next: 'این فقط یک آزمایش است.', reason: 'آزمایش کانال اعلان', at: Date.now(), sid: String(Date.now()) })]).then(function () { ctx.rerender(); }); } })]);
    var setP = ctx.panel('تنظیمات اعلان', [permP, h('div', null, [cb(s, 'on', 'اعلان‌ها فعال'), cb(s, 'buy', 'خرید'), cb(s, 'sell', 'فروش و خروج'), cb(s, 'pre', 'پیش‌آگاهی (در انتظار تأیید)'), cb(s, 'info', 'تغییر/ابطال'), cb(s, 'sys', 'اعلان سیستمی')]),
      h('div', null, ORD.map(function (c) { return cb(s.cls, c, CLS[c]); })), h('div', null, [num('minConf', 'حداقل اطمینان (٪)'), num('nearPct', 'فاصلهٔ پیش‌آگاهی تا سطح (٪)'), num('quietFrom', 'ساعت سکوت از'), num('quietTo', 'تا')]),
      P('حد ضرر و خروج اضطراری در ساعات سکوت هم ارسال می‌شوند. اعلان تکراری برای همان رویداد ارسال نمی‌شود (پیش‌آگاهی تا ۲۴ ساعت، بقیه تا ۵ روز) مگر وضعیت تغییر کند.', 'small muted')]);
    var log = S.log.slice().reverse().slice(0, 150);
    var rows = log.map(function (e) { return [dt(e.at), e.lvlFa, e.title, e.sym + ' (' + (e.mk || '') + ')', n(e.px), e.zone ? zone(e.zone) : '—', isF(e.up) ? n(e.up) : '—', isF(e.stop) ? n(e.stop) : '—', [e.tp1, e.tp2].filter(isF).map(function (v) { return n(v); }).join(' / ') || '—', isF(e.rr) ? fa(e.rr, 1) : '—', e.next || '', (e.reason || '').slice(0, 160), e.inv || '—', e.sys === 'sent' ? 'ارسال شد' : e.sys === 'off' ? 'خاموش' : e.sys ? 'ارسال نشد' : '—', e.key === 'test' ? '—' : A.statusOf(e)]; });
    var st = S.stats || {}, lp = ctx.panel('تاریخچهٔ اعلان‌ها (' + fa(S.log.length, 0) + ')', [h('div', { class: 'row-ctl' }, [h('button', { class: 'btn ghost', type: 'button', text: 'علامت خوانده‌شده برای همه', onclick: function () { A.markRead(); ctx.rerender(); } })]),
      P('کل اعلان‌ها ' + fa(st.n || 0, 0) + ' · اعلان سیستمی ارسال‌شده ' + fa(st.sys || 0, 0) + ' · ناموفق ' + fa(st.sysFail || 0, 0), 'small muted'),
      rows.length ? table(['زمان', 'سطح', 'عنوان', 'دارایی', 'قیمت', 'محدودهٔ ورود', 'سطح تأیید', 'حد ضرر', 'اهداف', 'R:R', 'اقدام بعدی', 'دلیل', 'شرط ابطال', 'اعلان سیستمی', 'وضعیت امروز'], rows) : P('هنوز اعلانی ثبت نشده است. اولین محاسبه فقط خط مبنا را ثبت می‌کند؛ از محاسبهٔ بعدی، تغییرها اعلان می‌شوند.')]);
    var lim = ctx.panel('محدودیت‌ها (صریح)', [h('ul', { class: 'studio-l' }, ['اعلان سیستمی وقتی ارسال می‌شود که هاب باز باشد (زبانهٔ مرورگر، برنامهٔ دسکتاپ یا برنامهٔ صفحهٔ اصلی گوشی). در گوشی، وقتی برنامه بسته یا در پس‌زمینه است، مرورگر زمان‌سنج را متوقف می‌کند؛ با باز شدن برنامه، بررسی جبرانی فوراً اجرا می‌شود.',
      'ارسال به برنامهٔ بسته با اجرای ساعتی GitHub انجام می‌شود (بخش بالا)؛ تأخیر تا یک ساعت، و برای سهام فقط پس از انتشار دادهٔ تازه از کامپیوتر یا گوشی.',
      'قیمت پایش سبک، آخرین معامله در لحظهٔ بررسی است؛ نوسان میان دو بررسی دیده نمی‌شود. تأیید شکست یا برگشت فقط با قیمت پایانی و محاسبهٔ دوباره اعلام می‌شود.', 'ایمیل و پیام‌رسان وصل نیستند.'].map(function (t) { return h('li', { text: t }); }))]);
    return ctx.group([lp, setP, closedPanel(ctx), lim]); }
  /* push to a closed app: scheduled GitHub job + Web Push (approved by the owner) */
  function closedPanel(ctx) {
    var WP = Hub.webPush, DS = Hub.dataSync; if (!WP || !DS) return null;
    var c = DS.cfg(), loc = WP.state(), out = h('div', { 'aria-live': 'polite' }), say = function (t, k) { U.clear(out); out.appendChild(P(t, 'small ' + (k || ''))); };
    var copy = function (t) { try { navigator.clipboard.writeText(t); U.toast('کپی شد.', 'good'); } catch (e) { /* manual copy */ } };
    // step 0 (PC): the GitHub token and the snapshot publishing live here too — the full sync page is «مرکز دادهٔ بازار ← همگام‌سازی با گوشی» (#market-data)
    // the browser's password manager may refill a password field on every render: never re-render from here, and ignore the value already saved
    var tk = h('input', { class: 'f-in', type: 'password', autocomplete: 'new-password', name: 'hub-gh-token-' + Date.now(), 'data-lpignore': 'true', placeholder: c.token ? 'توکن ثبت شده است (برای تغییر، توکن تازه را بچسبانید)' : 'توکن fine-grained GitHub را اینجا بچسبانید', 'aria-label': 'توکن GitHub', style: 'min-width:280px' });
    tk.addEventListener('change', function () { var v = tk.value.trim(); tk.value = ''; if (!v || v === DS.cfg().token) return; if (DS.tokOK && !DS.tokOK(v)) { tkSt.textContent = 'وضعیت: متن چسبانده‌شده توکن معتبر GitHub نیست (باید با github_pat_ شروع شود).'; return; } DS.setCfg({ token: v }); tkSt.textContent = 'وضعیت: ثبت شده (همین حالا).'; pubB.disabled = false; k1.disabled = false; add.disabled = false; U.toast('توکن در همین مرورگر ثبت شد.', 'good'); });
    var tkSt = h('p', { class: 'small', text: 'وضعیت: ' + (!c.token ? 'ثبت نشده' : DS.tokOK && !DS.tokOK(c.token) ? 'ثبت شده ولی قالب آن درست نیست — توکن را دوباره از GitHub کپی کنید و اینجا بچسبانید' : 'ثبت شده') + '.' });
    var au = h('input', { type: 'checkbox', 'aria-label': 'انتشار خودکار' }); au.checked = !!c.auto; au.addEventListener('change', function () { DS.setCfg({ auto: au.checked }); U.toast(au.checked ? 'انتشار خودکار روشن شد.' : 'انتشار خودکار خاموش شد.', 'good'); });
    var pubB = h('button', { class: 'btn', type: 'button', text: 'انتشار داده‌ها و حکم مرکزی الان', disabled: !c.token, onclick: function () { say('در حال انتشار…'); DS.publish(null, function (t) { say('در حال انتشار — ' + t + ' …'); }).then(function (i) { say('منتشر شد' + (i.stocks === 'full' ? ' (سهام با تاریخچهٔ کامل؛ تا یک هفته فقط ۴۰ جلسهٔ آخر منتشر می‌شود)' : i.stocks === 'tail40' ? ' (سهام: ۴۰ جلسهٔ آخر)' : '') + ': ' + i.files.join('، ') + '.', 'good-t'); }, function (e) { say('انتشار ناموفق: ' + e.message + (/fetch/i.test(e.message) ? ' (اتصال به api.github.com قطع شد؛ اگر فیلترشکن روشن/خاموش شد یا اینترنت ضعیف است، دوباره بزنید — بخش‌هایی که منتشر شده‌اند لازم نیست تکرار شوند)' : ''), 'crit-t'); }); } });
    var step0 = h('div', { class: 'callout ' + (c.token ? 'info' : 'warn') }, [P('۰. توکن GitHub (فقط یک بار، روی کامپیوتر): فقط مخزن ' + c.repo + ' و فقط Contents: Read and write. فقط در همین مرورگر ذخیره و فقط به api.github.com فرستاده می‌شود.', 'small'), tkSt,
      h('label', { class: 'small' }, ['توکن: ', tk]), h('div', { class: 'row-ctl' }, [h('label', { class: 'chk-l' }, [au, document.createTextNode(' بعد از هر به‌روزرسانی موفق، خودکار منتشر شود')]), pubB,
        h('button', { class: 'btn ghost', type: 'button', text: 'آزمون توکن', onclick: function () { say('در حال آزمون…'); DS.testToken().then(function (r) { say(r.why, r.ok ? 'good-t' : 'crit-t'); }); } })])]);
    var k1 = h('button', { class: 'btn', type: 'button', text: loc.pub ? 'ساخت دوبارهٔ کلید (اشتراک‌های قبلی باطل می‌شوند)' : '۱. ساخت کلید و انتشار کلید عمومی', disabled: !c.token, onclick: function () {
      say('در حال ساخت کلید…'); WP.keys().then(function (r) { ctx.rerender(); }).catch(function (e) { say('ناموفق: ' + e.message, 'crit-t'); }); } });
    var priv = loc.priv ? h('div', { class: 'callout warn' }, [P('کلید خصوصی را یک بار به‌عنوان «Repository secret» با نام ' + WP.SECRET + ' در GitHub ذخیره کنید (فقط شما و اجرای زمان‌بندی‌شده به آن دسترسی دارید؛ در مخزن عمومی نوشته نمی‌شود):', 'small'),
      h('code', { 'data-notr': '1', style: 'word-break:break-all;display:block;padding:.4rem;user-select:all', text: loc.priv }), h('div', { class: 'row-ctl' }, [h('button', { class: 'btn ghost', type: 'button', text: 'کپی کلید خصوصی', onclick: function () { copy(loc.priv); } }), h('a', { class: 'btn ghost', href: WP.SECRET_URL, target: '_blank', rel: 'noopener', text: 'باز کردن صفحهٔ ساخت Secret در GitHub' })])]) : null;
    var sub = h('button', { class: 'btn primary', type: 'button', text: '۲. فعال‌سازی اعلان روی همین دستگاه (برنامهٔ بسته)', onclick: function () { say('در حال ثبت…');
      WP.subscribe().then(function (r) { if (r.registered) say('این دستگاه ثبت شد. از اجرای بعدی (حداکثر یک ساعت) اعلان‌ها حتی با برنامهٔ بسته می‌رسند.', 'good-t');
        else { U.clear(out); out.appendChild(P('روی این دستگاه توکن GitHub نیست. این متن را کپی کنید و در کامپیوتر در «۳. افزودن اشتراک دستگاه دیگر» بچسبانید:', 'small')); out.appendChild(h('code', { 'data-notr': '1', style: 'word-break:break-all;display:block;padding:.4rem;user-select:all', text: r.text })); out.appendChild(h('button', { class: 'btn ghost', type: 'button', text: 'کپی', onclick: function () { copy(r.text); } })); } })
        .catch(function (e) { say('ناموفق: ' + e.message, 'crit-t'); }); } });
    var ta = h('textarea', { class: 'f-in', rows: '3', style: 'width:100%', placeholder: 'متن اشتراک گوشی را اینجا بچسبانید', 'aria-label': 'اشتراک' });
    var add = h('button', { class: 'btn', type: 'button', text: '۳. افزودن اشتراک دستگاه دیگر', disabled: !c.token, onclick: function () { say('در حال ثبت…'); WP.addSub(ta.value.trim()).then(function () { ta.value = ''; say('اشتراک ثبت شد.', 'good-t'); }).catch(function (e) { say('ناموفق: ' + e.message, 'crit-t'); }); } });
    var off = h('button', { class: 'btn ghost', type: 'button', text: 'لغو اشتراک همین دستگاه', onclick: function () { WP.unsubscribe().then(function () { say('اشتراک این دستگاه لغو شد (از فهرست مخزن در اجرای بعدی حذف می‌شود).'); }); } });
    var st = h('p', { class: 'small muted', text: '…' }); WP.status().then(function (x) { st.textContent = x.ok ? 'این دستگاه: ' + (x.sub ? 'مشترک است' : 'مشترک نیست') + ' · اجازهٔ اعلان: ' + x.perm : 'این مرورگر Web Push ندارد (در آیفون: iOS ۱۶٫۴+ و باز کردن برنامه از صفحهٔ اصلی).'; });
    return ctx.panel('اعلان وقتی برنامه بسته است (اجرای زمان‌بندی‌شده در GitHub)', [
      P('اجرای «push-alerts» در GitHub هر ساعت در روزهای شنبه تا پنجشنبه (۸:۱۷ تا ۲۲:۱۷ تهران) و پس از هر انتشار داده اجرا می‌شود: حکم مرکزی منتشرشده را با قبلی مقایسه می‌کند و قیمت لحظه‌ای طلا، سکه و ارز را از TGJU با سطوح همان حکم می‌سنجد؛ همان قواعد اعلانِ برنامه. TSETMC به سرورهای GitHub جواب نمی‌دهد؛ پس اعلان سهام فقط پس از انتشار دادهٔ کامپیوتر/گوشی است (انتشار خودکار پس از به‌روزرسانی را در «همگام‌سازی با گوشی» روشن کنید). موقعیت‌های شما منتشر نمی‌شوند؛ اعلان‌های مخصوص موقعیت باز فقط روی دستگاه است.', 'small muted'),
      step0, h('div', { class: 'row-ctl' }, [k1, sub, off]), priv, h('div', null, [ta, add]), st, out,
      P(c.token ? 'توکن GitHub روی این دستگاه هست.' : 'توکن GitHub روی این دستگاه نیست (مرحله‌های ۱ و ۳ روی کامپیوتر انجام می‌شوند).', 'small muted')]); }

  /* ---------------- tab 6: schedule & monitoring (directive 16) ---------------- */
  function refreshTab(ctx) {
    var SR = Hub.smartRefresh; if (!SR) return ctx.panel('زمان‌بندی', [P('ماژول زمان‌بندی بارگذاری نشده است.')]);
    var s = SR.set(), S = SR.state(), M = SR.marketState(null, s), save = function () { U.store.set(SR.SKEY, s); U.toast('ذخیره شد.', 'good'); };
    var inp = function (obj, k, lab, type, w) { var i = h('input', { type: type || 'number', class: 'f-in', style: 'width:' + (w || 5) + 'rem', value: obj[k], 'aria-label': lab }); i.addEventListener('change', function () { obj[k] = type === 'time' ? i.value : Number(i.value); save(); }); return h('label', { class: 'small', style: 'margin-inline-end:.8rem' }, [lab + ' ', i]); };
    var onI = h('input', { type: 'checkbox' }); onI.checked = !!s.on; onI.addEventListener('change', function () { s.on = onI.checked; save(); });
    var ev = h('input', { type: 'checkbox' }); ev.checked = !!s.fullOnEvent; ev.addEventListener('change', function () { s.fullOnEvent = ev.checked; save(); });
    var eod = h('input', { type: 'checkbox' }); eod.checked = !!s.fullEod; eod.addEventListener('change', function () { s.fullEod = eod.checked; save(); });
    var set1 = ctx.panel('برنامهٔ به‌روزرسانی هر بازار (ساعت تهران)', [h('label', { class: 'small' }, [onI, ' پایش هوشمند فعال (جایگزین به‌روزرسانی خودکار با فاصلهٔ ثابت)']),
      h('div', null, [P('بورس و فرابورس:', 'small'), inp(s.tse, 'open', 'شروع', 'time', 7), inp(s.tse, 'close', 'پایان', 'time', 7), inp(s.tse, 'light', 'پایش سبک هر (دقیقه)'), inp(s.tse, 'near', 'نزدیک سطح کلیدی هر (دقیقه)'), inp(s, 'eodTse', 'بازبینی پایان روز', 'time', 7)]),
      h('div', null, [P('طلا، سکه و ارز (TGJU):', 'small'), inp(s.tgju, 'from', 'از', 'time', 7), inp(s.tgju, 'to', 'تا', 'time', 7), inp(s.tgju, 'light', 'پایش سبک هر (دقیقه)'), inp(s.tgju, 'near', 'نزدیک سطح کلیدی هر (دقیقه)'), inp(s, 'eodTgju', 'بازبینی پایان روز', 'time', 7)]),
      h('div', null, [h('label', { class: 'small', style: 'margin-inline-end:.8rem' }, [ev, ' به‌روزرسانی کامل وقتی قیمت به سطح کلیدی می‌رسد']), h('label', { class: 'small', style: 'margin-inline-end:.8rem' }, [eod, ' بازبینی جامع پایان روز']), inp(s, 'minFullGap', 'حداقل فاصلهٔ دو به‌روزرسانی کامل (دقیقه)')]),
      P('پیش‌فرض‌ها نقطهٔ شروع جدول دستورالعمل‌اند (کوتاه‌مدت ۵ تا ۱۵ دقیقه، روزانه در پایان جلسه) و باید با نتیجهٔ سنجش زیر اصلاح شوند. ساعات جلسهٔ بورس از منبع رسمی در برنامه تأیید نشده و قابل تنظیم است؛ تعطیلات رسمی از تقویم بازار خوانده می‌شود (تعطیلات قمری ±۱ روز).', 'small muted')]);
    var rows = [['بورس و فرابورس', M.tse ? 'باز (پایش فعال)' : M.tseDay ? 'روز معاملاتی، خارج از ساعت جلسه' : 'تعطیل', ago(S.last.tse), S.next.tse ? dt(S.next.tse) : '—', S.err.tse ? S.err.tse.t : '—'],
      ['طلا، سکه و ارز', M.tgju ? 'در ساعات پایش' : 'خارج از ساعات پایش', ago(S.last.tgju), S.next.tgju ? dt(S.next.tgju) : '—', S.err.tgju ? S.err.tgju.t : '—'],
      ['به‌روزرسانی کامل', Hub.updateBusy && Hub.updateBusy() ? 'در حال اجرا' : '—', ago(S.last.full), 'پایان روز یا رویداد', S.err.full ? S.err.full.t : '—'],
      ['محاسبهٔ دوبارهٔ حکم مرکزی و مقایسه', '—', ago(S.evalAt), 'پس از هر به‌روزرسانی کامل', S.err.eval ? S.err.eval.t : '—']];
    var m = S.m || {}, near = (S.near || []);
    var stP = ctx.panel('وضعیت پایش (اکنون ' + (M.T ? M.T.hm : '—') + ' تهران)', [table(['لایه / بازار', 'وضعیت', 'آخرین اجرای موفق', 'اجرای بعدی', 'خطا'], rows),
      P('دارایی‌های نزدیک سطح کلیدی (پایش با تناوب بیشتر): ' + (near.length ? near.slice(0, 30).map(function (k) { return k.slice(2); }).join('، ') + (near.length > 30 ? ' …' : '') : 'هیچ'), 'small'),
      P('سنجش عملکرد: ' + fa(m.checks || 0, 0) + ' بررسی سبک · ' + fa(m.events || 0, 0) + ' رویداد · ' + fa(m.full || 0, 0) + ' به‌روزرسانی کامل خودکار. تأخیر شناسایی حداکثر برابر فاصلهٔ پایش است؛ نرخ هشدار کاذب و فرصت ازدست‌رفته پس از چند هفته اجرا از تاریخچهٔ اعلان‌ها و ثبت سیگنال‌ها قابل اندازه‌گیری است.', 'small muted')]);
    var lg = ctx.panel('گزارش اجرا (۴۰ مورد آخر)', [table(['زمان', 'لایه', 'نتیجه', 'شرح'], S.log.slice().reverse().slice(0, 40).map(function (l) { return [dt(l.at), SR.MK[l.m] || ({ eval: 'محاسبهٔ دوباره' })[l.m] || l.m, l.ok ? 'موفق' : 'ناموفق', l.t]; }))]);
    return ctx.group([stP, set1, lg]); }

  /* =====================================================================
   * DIRECTIVE 18 — floor / ceiling for every market, the action inbox, cross-market ranking, allocation, compare, watchlist, history.
   * Everything below reads the central record (C.by, enriched by Hub.oppRank inside the engine run) and the engine's index views;
   * no second signal logic. Shared filter state: S.g; selected asset: S.sel; compare list: S.cmp; watchlist: store hub.watch.v1.
   * ===================================================================== */
  var OR = function () { return Hub.oppRank || { CATFA: {}, ST4: {}, EXFA: {}, GROUPS: [], W: {}, WFA: {} }; };
  var WKEY = 'hub.watch.v1';
  function watchList() { var w = U.store.get(WKEY, null); return w && Array.isArray(w.keys) ? w.keys : []; }
  function watchToggle(k) { var L = watchList(), i = L.indexOf(k); if (i >= 0) L.splice(i, 1); else L.push(k); U.store.set(WKEY, { keys: L, at: Date.now() }); return i < 0; }
  function g0() { return { q: '', cls: 'all', grp: [], cat: 'all', str: 'all', hz: 'all', st4: 'all', exec: 'all', minRR: '', minLiq: '', days: '', sort: 'pri' }; }
  function G(S) { if (!S.g) S.g = g0(); if (!Array.isArray(S.g.grp)) S.g.grp = []; return S.g; }
  // age of the signal, in days, from the signal registry (first identification date)
  function sigAge() { var T = U.store.get('hub.tradedesk.v1', null), o = {}, now = Date.now() / 864e5;
    (T && T.sig || []).forEach(function (s) { var d = s.d0, t = Date.UTC(Math.floor(d / 10000), Math.floor(d / 100) % 100 - 1, d % 100) / 864e5, a = now - t; if (!(s.key in o) || a < o[s.key]) o[s.key] = a; }); return o; }
  function passG(S, r, ages, fixed) { var f = G(S), x = fixed || {};
    if (!x.cls && f.cls !== 'all' && r.cls !== f.cls) return false;
    if (f.q && String(r.sym + ' ' + (r.name || '') + ' ' + (r.sector || '')).indexOf(f.q.trim()) < 0) return false;
    if (!x.grp && f.grp.length && f.grp.indexOf(r.grp) < 0) return false;
    if (!x.cat && f.cat !== 'all' && (r.cats || []).indexOf(f.cat) < 0) return false;
    if (f.str !== 'all' && strengthOf(r) !== f.str) return false;
    if (f.hz !== 'all' && !(r.hzv && r.hzv[f.hz] && r.hzv[f.hz].view === 'up')) return false;
    if (f.st4 !== 'all' && r.st4 !== f.st4) return false;
    if (f.exec !== 'all' && r.exec !== f.exec) return false;
    if (f.minRR !== '' && !(isF(r.rr) && r.rr >= Number(f.minRR))) return false;
    if (f.minLiq !== '' && (r.cls === 'stock' || r.cls === 'fund') && !(isF(r.val20) && r.val20 / 1e9 >= Number(f.minLiq))) return false;
    if (f.days !== '' && !(ages && isF(ages[r.key]) && ages[r.key] <= Number(f.days))) return false;
    return true; }
  var SORTS = { pri: function (r) { return r.pri ? r.pri.s : r.spri ? r.spri / 10 : -1; }, rr: function (r) { return isF(r.rr) ? r.rr : -1; }, liq: function (r) { return isF(r.val20) ? r.val20 : r.cls === 'stock' || r.cls === 'fund' ? -1 : 1e30; },
    conf: function (r) { return isF(r.conf) ? r.conf : -1; }, hz: function (r) { return isF(r.days) ? -r.days : -1e9; }, name: null };
  function sortG(S, A) { var k = G(S).sort, f = SORTS[k]; return f ? A.sort(function (a, b) { return f(b) - f(a); }) : A.sort(function (a, b) { return String(a.sym).localeCompare(String(b.sym), 'fa'); }); }
  // the shared filter bar (directive 18 · 6): every filter combines with the others
  function gBar(ctx, S, opt) {
    opt = opt || {}; var f = G(S), O = OR();
    var sel = function (k, opts, lab) { var s = h('select', { class: 'f-sel', 'aria-label': lab }, opts.map(function (o) { return h('option', { value: o[0], text: o[1] }); })); s.value = f[k]; s.addEventListener('change', function () { f[k] = s.value; S.lim = 60; ctx.rerender(); }); return h('label', { class: 'small' }, [lab + ' ', s]); };
    var inp = function (k, lab, ph, w, type) { var i = h('input', { type: type || 'number', class: 'f-in', style: 'width:' + (w || 5) + 'rem', value: f[k], placeholder: ph || '', 'aria-label': lab }); i.addEventListener('change', function () { f[k] = i.value; S.lim = 60; ctx.rerender(); }); return h('label', { class: 'small' }, [lab + ' ', i]); };
    var grps = (opt.groups || []); var gs = grps.length ? h('select', { class: 'f-sel', multiple: true, size: Math.min(6, grps.length), 'aria-label': 'صنعت یا گروه', style: 'min-width:14rem' }, grps.map(function (g) { var o = h('option', { value: g[0], text: g[1] + ' (' + fa(g[2], 0) + ')' }); if (f.grp.indexOf(g[0]) >= 0) o.selected = true; return o; })) : null;
    if (gs) gs.addEventListener('change', function () { f.grp = Array.prototype.filter.call(gs.options, function (o) { return o.selected; }).map(function (o) { return o.value; }); S.lim = 60; ctx.rerender(); });
    return h('div', { class: 'row-ctl', style: 'flex-wrap:wrap;gap:.5rem;align-items:flex-start' }, [
      h('label', { class: 'small' }, ['نماد یا نام ', (function () { var q = h('input', { type: 'search', class: 'f-in', value: f.q || '', placeholder: 'جست‌وجو', 'aria-label': 'جست‌وجوی نماد' }); q.addEventListener('change', function () { f.q = q.value; S.lim = 60; ctx.rerender(); }); return q; })()]),
      opt.noCls ? null : sel('cls', [['all', 'همهٔ بازارها']].concat(ORD.map(function (c) { return [c, CLS[c]]; })), 'بازار / کلاس'),
      gs ? h('label', { class: 'small' }, ['صنعت یا گروه (چند انتخابی) ', gs]) : null,
      opt.noCat ? null : sel('cat', [['all', 'همه']].concat(['buy', 'sell', 'scale', 'hold', 'holdIf', 'wait', 'tp', 'reduce', 'close', 'risk'].map(function (c) { return [c, c === 'holdIf' ? 'نگهداری اگر دارید' : O.CATFA[c] || c]; })), 'نوع اقدام'),
      sel('str', [['all', 'همه'], ['strong', 'قوی'], ['mid', 'متوسط'], ['weak', 'ضعیف']], 'قدرت سیگنال'),
      sel('hz', [['all', 'همه'], ['s', 'کوتاه‌مدت صعودی'], ['m', 'میان‌مدت صعودی'], ['l', 'بلندمدت صعودی']], 'افق زمانی'),
      sel('st4', [['all', 'همه']].concat(Object.keys(O.ST4).map(function (k) { return [k, O.ST4[k]]; })), 'نزدیک کف یا سقف'),
      sel('exec', [['all', 'همه'], ['executable', 'قابل اجرا'], ['confirmed', 'تأییدشده'], ['analytic', 'تحلیلی (تأییدنشده)'], ['none', 'بدون فرصت']], 'وضعیت تأیید'),
      inp('minRR', 'حداقل R:R', '', 4), inp('minLiq', 'حداقل ارزش معاملات ۲۰ روزه (میلیارد ریال)', '', 6), inp('days', 'سیگنال در N روز اخیر', '', 4),
      sel('sort', [['pri', 'امتیاز اولویت'], ['rr', 'بازده به ریسک'], ['liq', 'نقدشوندگی'], ['conf', 'قدرت / اطمینان'], ['hz', 'افق کوتاه‌تر'], ['name', 'نام']], 'مرتب‌سازی'),
      h('button', { class: 'btn ghost', type: 'button', text: 'پاک کردن فیلترها', onclick: function () { S.g = g0(); S.lim = 60; ctx.rerender(); } })]); }

  // a compact row of an asset for the market pages: the floor / ceiling sheet in one line
  function star(ctx, r) { var on = watchList().indexOf(r.key) >= 0; return h('button', { class: 'btn ghost', type: 'button', title: on ? 'حذف از فهرست پایش' : 'افزودن به فهرست پایش', 'aria-label': 'پایش', text: on ? '★' : '☆', onclick: function () { var a = watchToggle(r.key); U.toast(a ? r.sym + ' به فهرست پایش اضافه شد.' : r.sym + ' از فهرست پایش حذف شد.', 'good'); ctx.rerender(); } }); }
  function cmpBox(ctx, S, r) { S.cmp = S.cmp || []; var i = h('input', { type: 'checkbox', 'aria-label': 'مقایسه ' + r.sym, title: 'افزودن به مقایسه' }); i.checked = S.cmp.indexOf(r.key) >= 0;
    i.addEventListener('change', function () { var j = S.cmp.indexOf(r.key); if (i.checked && j < 0) { if (S.cmp.length >= 6) { i.checked = false; U.toast('حداکثر ۶ دارایی برای مقایسه.', 'warn'); return; } S.cmp.push(r.key); } else if (!i.checked && j >= 0) S.cmp.splice(j, 1); ctx.rerender(); }); return i; }
  function symBtn(ctx, S, r) { return h('button', { class: 'btn ghost', type: 'button', 'data-notr': '1', text: r.sym, title: 'نمایش همهٔ اطلاعات این دارایی', onclick: function () { S.sel = r.key; ctx.rerender(); try { root.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { /* ignore */ } } }); }
  function pxTime(r) { return n(r.px, r) + (r.pxAt ? ' · ' + ago(r.pxAt) : r.date ? ' · ' + r.date : ''); }
  function marketTable(ctx, S, A, opt) {
    opt = opt || {}; var lim = S.lim || 60, shown = A.slice(0, lim);
    var rows = shown.map(function (r) { var L = r.L || {}, F = fbOf(r), w = L.win, tp = (L.tp || []).filter(isF), dn = (L.floor && L.tzT && L.tzT.length ? L.tzT : L.dnTp || []).filter(isF); if (!tp.length && F.tp.v && F.tp.v.length) tp = F.tp.v; if (!dn.length) dn = F.dnTp;
      return [star(ctx, r), cmpBox(ctx, S, r), symBtn(ctx, S, r), opt.grp ? r.grpFa : CLS[r.cls] || r.cls, pxTime(r), r.st4Fa || '—', fv(F.floor, zone), fv(F.ceil, zone), L.buy ? zone(L.buy) : L.far ? 'طرح آزموده‌شده: ' + pct(L.far.dist, 1) + ' بالاتر از قیمت؛ ' + fv(F.buy, zone) : fv(F.buy, zone),
        (isF(L.upConf) ? '↑ ' + n(L.upConf) + ' (' + pct(L.upConf / r.px - 1, 1) + ')' : '↑ —') + ' / ' + (isF(L.dnConf) ? '↓ ' + n(L.dnConf) + ' (' + pct(L.dnConf / r.px - 1, 1) + ')' : '↓ —'), isF(L.stop) ? n(L.stop) : fv(F.stop), (tp.length ? '↑ ' + tp.slice(0, 2).map(function (v) { return n(v); }).join('، ') : '') + (dn.length ? (tp.length ? ' · ' : '') + '↓ ' + dn.slice(0, 2).map(function (v) { return n(v); }).join('، ') : '') || '—',
        w && w.from ? sh(w.from) + ' تا ' + sh(w.to) : F.winT || '—', TRFA[trendOf(r)], isF(r.conf) ? fa(r.conf, 0) + '٪' + (r.grade ? ' · ' + r.grade : '') : '—', (actionOf(r) || [0, 0, r.actFa])[2] + ' · ' + (r.execFa || ''), r.pri ? fa(r.pri.s, 0) : '—']; });
    var more = A.length > lim ? h('button', { class: 'btn ghost', type: 'button', text: 'نمایش ' + fa(Math.min(60, A.length - lim), 0) + ' مورد بیشتر (از ' + fa(A.length, 0) + ')', onclick: function () { S.lim = lim + 60; ctx.rerender(); } }) : null;
    return h('div', null, [rows.length ? table(['پایش', 'مقایسه', 'نماد', opt.grp ? 'گروه' : 'بازار', 'قیمت · زمان', 'وضعیت کف/سقف', 'کف احتمالی', 'سقف احتمالی', 'محدودهٔ خرید', 'تأیید صعود / نزول', 'حد ضرر', 'اهداف ↑ / ↓', 'بازهٔ زمانی', 'روند', 'اطمینان', 'اقدام · اجرا', 'امتیاز'], rows) : P('موردی با این فیلترها نیست.'), more]); }
  // the full sheet of the selected asset, shown on top of any market page
  function selPanel(ctx, S, R) { var r = S.sel && R.C && R.C.by[S.sel]; if (!r) return null;
    return ctx.panel('دارایی انتخاب‌شده: ' + r.sym + ' (' + (CLS[r.cls] || r.cls) + (r.grpFa && r.cls !== 'gold' ? ' · ' + r.grpFa : '') + ')', [h('div', { class: 'row-ctl' }, [star(ctx, r), h('button', { class: 'btn ghost', type: 'button', text: 'بستن', onclick: function () { S.sel = null; ctx.rerender(); } })]),
      P('محدوده‌های کف و سقف احتمالی‌اند، نه قیمت قطعی: کف فقط با «بسته‌شدن بالای سطح تأیید برگشت» و سقف فقط با «بسته‌شدن زیر سطح تأیید برگشت نزولی» به فرصت معاملاتی تبدیل می‌شوند.', 'small muted'), table(['مورد', 'مقدار'], fields(r))]); }
  function groupsOf(A) { var m = {}; A.forEach(function (r) { var g = m[r.grp] = m[r.grp] || [r.grp, r.grpFa, 0]; g[2]++; }); return Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return b[2] - a[2]; }); }
  // the four states of directive 18 · 2-3, counted
  function st4Line(A) { var O = OR(), c = {}; A.forEach(function (r) { c[r.st4] = (c[r.st4] || 0) + 1; }); return Object.keys(O.ST4).filter(function (k) { return c[k]; }).map(function (k) { return O.ST4[k] + ': ' + fa(c[k], 0); }).join(' · '); }
  function marketPage(ctx, title, A, opt) {
    var S = ctx.S, R = ctx.R, ages = sigAge(), F = sortG(S, A.filter(function (r) { return passG(S, r, ages, { cls: true, cat: opt && opt.noCat }); }));
    return ctx.panel(title + ' — ' + fa(F.length, 0) + (F.length !== A.length ? ' از ' + fa(A.length, 0) : '') + ' دارایی', [P(st4Line(A), 'small'), gBar(ctx, S, { noCls: true, groups: opt && opt.groups }), marketTable(ctx, S, F, opt)]); }

  /* ---------------- section 1: comprehensive dashboard ---------------- */
  function allocPanel(ctx, R) { var A = R.C && R.C.alloc; if (!A || !A.rows) return null;
    var hd = A.head || {}, b = hd.best, txt = hd.k === 'cash' ? 'اولویت فعلی: نقد / درآمد ثابت تا شکل‌گیری فرصت تأییدشده — در هیچ بازاری سیگنال خرید تأییدشده نیست.' + (b ? ' بازار با بیشترین پتانسیل برای پایش: ' + b.fa + ' (امتیاز ' + fa(b.score * 100, 0) + ').' : '')
      : 'بیشترین اولویت فعلی: ' + b.fa + ' (امتیاز ' + fa(b.score * 100, 0) + '، ' + fa(b.ok, 0) + ' فرصت تأییدشده، ' + fa(b.exe, 0) + ' قابل اجرا).';
    return ctx.panel('کیفیت فرصت‌های امروز در هر بازار (از حکم موتور؛ بک‌تست نشده)', [h('div', { class: 'callout ' + (hd.k === 'cash' ? 'warn' : 'info') }, [P(txt, '')]),
      table(['بازار', 'دارایی', 'روند میان‌مدت صعودی', 'تأییدشده / قابل اجرا', 'در انتظار تأیید', 'نزدیک کف', 'نزدیک یا تأیید سقف', 'میانگین امتیاز ۳ فرصت برتر', 'امتیاز بازار', 'جمع‌بندی'], A.rows.map(function (m) {
        return [m.fa, fa(m.n, 0), fa(m.up, 0) + ' (' + pct(m.breadth, 0) + ')', fa(m.ok, 0) + ' / ' + fa(m.exe, 0), fa(m.wait, 0), fa(m.floor, 0), fa(m.ceil, 0), fa(m.top3, 0), fa(m.score * 100, 0), m.verdict]; })),
      P(A.rule + ' «تأییدشده» یعنی حکم مرکزی؛ «قابل اجرا» یعنی علاوه بر آن نقدشوندگی، نبود صف/توقف و تازگی داده هم برقرار است. نرخ سود بی‌ریسک (درآمد ثابت) در تنظیمات موتور: ' + (isF(R.X && R.X.E && R.X.E.cashRate) ? pct(R.X.E.cashRate, 1) + ' سالانه' : 'وارد نشده') + '.', 'small muted')]); }
  function bestRows(R, k) { return R.recs.filter(function (r) { return isF(r.rank); }).sort(function (a, b) { return a.rank - b.rank; }).slice(0, k || 15); }
  // execution of the order (directive 23 · 1): order price, worst probable fill, fill probability in 3 sessions, R:R at the worst fill
  function xoCell(r) { var o = r.xo; if (!o || o.na) return '—'; return (o.type === 'stop' ? 'شرطی ' : 'محدود ') + n(o.order, r) + ' · بدترین ' + n(o.worst, r) + ' · احتمال اجرا ' + (isF(o.fillP) ? pct(o.fillP, 0) : '؟') + ' · R:R ' + (isF(o.rrWorst) ? fa(o.rrWorst, 1) : '—') + (o.ok ? '' : ' — قابل اجرا نیست'); }
  function bestPanel(ctx, S, R, k) { var A = bestRows(R, k);
    return ctx.panel('بهترین فرصت‌های کل بازار (همهٔ بازارها در یک رتبه‌بندی)', [P('رتبه بر پایهٔ امتیاز قابل توضیح (سطح تأیید، شواهد بک‌تست، اطمینان، بازده به ریسک، نزدیکی به ورود، هم‌جهتی افق‌ها، نقدشوندگی، نوسان) با کسر برای هم‌گروهی و همبستگی بالا. رتبهٔ اول توصیهٔ قطعی یا تضمین بازده نیست؛ تا وقتی «وضعیت» تأییدشده نیست، خرید نیست.', 'small muted'),
      A.length ? table(['رتبه', 'نماد', 'بازار / گروه', 'قیمت مرجع', 'وضعیت', 'محدودهٔ ورود', 'اجرای سفارش (۳ جلسه)', 'حد ضرر', 'هدف ۱ / ۲', 'R:R', 'امتیاز', 'چرا این رتبه (جزئیات با نگه‌داشتن نشانگر یا انتخاب نماد)'], A.map(function (r) { var L = r.L || {}, tp = L.tp || [];
        return [fa(r.rank, 0), symBtn(ctx, S, r), (CLS[r.cls] || r.cls) + (r.cls === 'stock' || r.cls === 'fund' ? ' · ' + r.grpFa : ''), n(r.px, r), r.tierFa + ' · ' + r.execFa, L.buy ? zone(L.buy) : L.floor ? 'کف ' + zone(L.floor) : '—', xoCell(r), isF(L.stop) ? n(L.stop) : '—', [tp[0], tp[1]].filter(isF).map(function (v) { return n(v); }).join(' / ') || '—', isF(r.rr) ? fa(r.rr, 1) : '—', fa(r.pri.s, 0), priShort(r, true)]; })) : P('هیچ دارایی فرصت خرید (تأییدشده، در انتظار تأیید یا نزدیک کف) ندارد.')]); }
  /* all actions in priority order, with filters on action, market and central status (user request 2026-11-21). Groups: exit and stop →
     confirmed buy → take profit → buy / sell after a confirmation → waiting / floor; inside a group the one central order (Hub.central.cmp). */
  var AGRP = [['exit', 'خروج و حد ضرر'], ['buy', 'خرید تأییدشده'], ['tp', 'ذخیرهٔ سود'], ['cond', 'خرید یا فروش پس از تأیید'], ['wait', 'انتظار برای تأیید یا کف']];
  function agrpOf(r) { var c = r.cats || []; if (r.act === 'close' || r.act === 'sell' || r.act === 'reduce' || c.indexOf('close') >= 0 || c.indexOf('reduce') >= 0) return 0; if (r.tier === 'ok') return 1; if (r.held && c.indexOf('tp') >= 0) return 2;
    if (r.act === 'wait' || r.sell === 'inZone' || r.sell === 'confirmed') return 3; if (r.tier === 'wait' || r.tier === 'floor') return 4; return -1; }
  function actionsPanel(ctx, S, R) {
    var F0 = S.af = S.af || { act: 'all', cls: 'all', st: 'all' }, all = R.recs.map(function (r) { return { r: r, g: agrpOf(r) }; }).filter(function (x) { return x.g >= 0; });
    var cnt = function (k, v) { return all.filter(function (x) { return (k === 'act' ? x.r.actFa : k === 'cls' ? x.r.cls : x.r.st) === v; }).length; };
    var uniq = function (f) { var o = {}; all.forEach(function (x) { o[f(x.r)[0]] = f(x.r)[1]; }); return Object.keys(o).map(function (k) { return [k, o[k]]; }); };
    var sel = function (k, lab, opts) { var s = h('select', { class: 'f-sel', 'aria-label': lab }, [h('option', { value: 'all', text: 'همه' })].concat(opts.map(function (o) { return h('option', { value: o[0], text: o[1] + ' (' + fa(cnt(k, o[0]), 0) + ')' }); }))); s.value = F0[k]; s.addEventListener('change', function () { F0[k] = s.value; S.alim = 60; ctx.rerender(); }); return h('label', { class: 'small' }, [lab + ' ', s]); };
    var L = all.filter(function (x) { var r = x.r; return (F0.act === 'all' || r.actFa === F0.act) && (F0.cls === 'all' || r.cls === F0.cls) && (F0.st === 'all' || r.st === F0.st); })
      .sort(function (a, b) { return a.g - b.g || Hub.central.cmp(a.r, b.r); }), lim = S.alim || 60;
    var rows = L.slice(0, lim).map(function (x) { var r = x.r, Lr = r.L || {}, p = Hub.central.present(r), F = fbOf(r);
      return [r.actFa, symBtn(ctx, S, r), CLS[r.cls] || r.cls, n(r.px, r), Lr.buy ? zone(Lr.buy) : fv(F.buy, zone), xoCell(r), isF(Lr.upConf) ? n(Lr.upConf, r) + ' (' + pct(Lr.upConf / r.px - 1, 1) + ')' : isF(Lr.struct) ? n(Lr.struct, r) + ' (ساختاری)' : '—', isF(Lr.stop) ? n(Lr.stop, r) : fv(F.stop), p.tp.length ? n(p.tp[0], r) : fv({ v: (F.tp.v || [])[0], est: F.tp.est }), isF(r.rr) ? faD(r.rr.toFixed(1)) : fv(F.rr, function (v) { return fa(v, 1); }), isF(r.conf) ? fa(r.conf, 0) + '٪' : '—', r.stFa, isF(r.rank) ? fa(r.rank, 0) : isF(r.rankCls) ? 'اختیار #' + fa(r.rankCls, 0) : '—', AGRP[x.g][1]]; });
    return ctx.panel('اقدام‌ها به ترتیب اولویت — ' + fa(L.length, 0) + (L.length < all.length ? ' از ' + fa(all.length, 0) : ''), [
      P('ترتیب: ' + AGRP.map(function (g) { return g[1]; }).join(' ← ') + '؛ درون هر گروه همان رتبهٔ مرکزی که همهٔ بخش‌ها نشان می‌دهند. فقط ردیف‌های «خرید تأییدشده» سیگنال قطعی‌اند؛ بقیه پیش‌سیگنال‌اند.', 'small muted'),
      h('div', { class: 'row-ctl', style: 'flex-wrap:wrap;gap:.5rem' }, [sel('act', 'اقدام', uniq(function (r) { return [r.actFa, r.actFa]; })), sel('cls', 'بازار', ORD.filter(function (c) { return cnt('cls', c); }).map(function (c) { return [c, CLS[c]]; })),
        sel('st', 'وضعیت مرکزی', uniq(function (r) { return [r.st, r.stFa]; })), h('button', { class: 'btn ghost', type: 'button', text: 'پاک کردن فیلترها', onclick: function () { S.af = { act: 'all', cls: 'all', st: 'all' }; ctx.rerender(); } })]),
      L.length ? table(['اقدام', 'نماد', 'بازار', 'قیمت مرجع', 'محدودهٔ ورود', 'اجرای سفارش (۳ جلسه)', 'تأیید صعود', 'حد ضرر', 'هدف ۱', 'R:R', 'اطمینان', 'وضعیت مرکزی', 'رتبهٔ مرکزی', 'گروه'], rows) : P('با این فیلترها موردی نیست.'),
      L.length > lim ? h('button', { class: 'btn ghost', type: 'button', text: 'نمایش ' + fa(Math.min(60, L.length - lim), 0) + ' مورد بیشتر', onclick: function () { S.alim = lim + 60; ctx.rerender(); } }) : null]); }
  function nearConfPanel(ctx, S, R) { var A = R.recs.filter(function (r) { var L = r.L || {}; return r.tier === 'wait' && isF(L.upConf) && isF(r.px) && r.px < L.upConf && L.upConf / r.px - 1 <= 0.03 || r.tier === 'floor' && r.tzState === 'inZone'; })
      .sort(function (a, b) { return (b.pri ? b.pri.s : 0) - (a.pri ? a.pri.s : 0); }).slice(0, 15);
    return ctx.panel('فرصت‌های نزدیک به تأیید', [P('در انتظار تأیید با فاصلهٔ کمتر از ۳٪ تا سطح تأیید صعود، یا داخل محدودهٔ کف احتمالی. هنوز سیگنال خرید نیستند.', 'small muted'),
      A.length ? table(['نماد', 'بازار', 'قیمت', 'شرط تأیید', 'فاصله', 'امتیاز'], A.map(function (r) { var L = r.L || {}, lv = r.tier === 'floor' ? L.tzConf : L.upConf; return [symBtn(ctx, S, r), CLS[r.cls] || r.cls, n(r.px, r), isF(lv) ? 'بسته‌شدن بالای ' + n(lv) : '—', isF(lv) && isF(r.px) ? pct(lv / r.px - 1, 1) : '—', r.pri ? fa(r.pri.s, 0) : '—']; })) : P('موردی نیست.')]); }
  function dash18(ctx) { var S = ctx.S, R = ctx.R; if (!R.C) return ctx.panel('مرکز داشبورد معاملاتی', [P('حکم مرکزی هنوز محاسبه نشده است. ابتدا داده‌ها را به‌روزرسانی کنید.'), Hub.dataCenterLink ? Hub.dataCenterLink('') : null]);
    return ctx.group([selPanel(ctx, S, R), allocBTPanel(ctx, R), allocPanel(ctx, R), bestPanel(ctx, S, R, 15), actionsPanel(ctx, S, R), nearConfPanel(ctx, S, R), overview(ctx, R), statusPanel(ctx, R)].filter(Boolean)); }

  /* ---------------- section 2: the action inbox (directive 18 · 3) ---------------- */
  var CATS = ['all', 'buy', 'sell', 'scale', 'hold', 'wait', 'tp', 'reduce', 'close', 'change', 'risk'];
  function inboxTab(ctx) {
    var S = ctx.S, R = ctx.R, O = OR(), C = R.C; if (!C) return ctx.panel('مرکز اعلان‌ها', [P('حکم مرکزی محاسبه نشده است.')]);
    var cur = S.icat || 'all', ages = sigAge(), A = Hub.alerts ? Hub.alerts.load() : { log: [] }, cs = R.X && R.X.centralSaved || {};
    var inC = function (c) { return R.recs.filter(function (r) { return (r.cats || []).indexOf(c) >= 0 || (c === 'hold' && (r.cats || []).indexOf('holdIf') >= 0); }); };
    var chg = (cs.hist || []).slice().reverse().reduce(function (a, hh) { return a.concat((hh.ch || []).map(function (c) { return Object.assign({ at: hh.at }, c); })); }, []), chgLog = A.log.filter(function (e) { return e.t === 'weak' || e.t === 'expired'; });
    var riskLog = A.log.filter(function (e) { return e.t === 'stop' || e.t === 'data'; });
    var count = function (c) { return c === 'all' ? R.recs.filter(function (r) { return (r.cats || []).length; }).length : c === 'change' ? chg.length + chgLog.length : c === 'risk' ? inC('risk').length + riskLog.length : inC(c).length; };
    var chips = h('div', { class: 'row-ctl', style: 'flex-wrap:wrap;gap:.35rem', role: 'tablist' }, CATS.map(function (c) { return h('button', { class: 'btn' + (c === cur ? ' primary' : ' ghost'), type: 'button', role: 'tab', 'aria-selected': c === cur ? 'true' : 'false', text: O.CATFA[c] + ' (' + fa(count(c), 0) + ')', onclick: function () { S.icat = c; S.lim = 60; ctx.rerender(); } }); }));
    var head = ctx.panel('مرکز اعلان‌ها — صندوق اقدام‌های معاملاتی', [chips, P('همهٔ فهرست‌ها از همان حکم مرکزی ساخته می‌شوند که داشبورد و صفحه‌های بازار می‌خوانند؛ با هر محاسبهٔ دوباره، همه با هم به‌روز می‌شوند. فقط «خرید» و «خرید پله‌ای» با وضعیت «قابل اجرا» یا «تأییدشده» سیگنال قطعی‌اند؛ «انتظار برای تأیید» و فروش‌های تحلیلی پایش‌اند.', 'small muted'), gBar(ctx, S, { noCat: true, groups: groupsOf(R.recs) })]);
    var F = function (L) { return L.filter(function (r) { return passG(S, r, ages, { cat: true }); }); };
    // directive 22 · 10: a filter only hides; how many it hides is always said, and the order is the one central rank (options: their market rank)
    var hidN = function (L0, L1) { return L0.length > L1.length ? P('فیلترهای شما ' + fa(L0.length - L1.length, 0) + ' مورد از این فهرست را پنهان کرده‌اند (محتوای سیگنال‌ها تغییر نکرده است).', 'small muted') : null; };
    var buyT = function (L0, ttl, empty) { var L = F(L0).sort(function (a, b) { return Hub.central.cmp(a, b); }); var lim = S.lim || 60;
      return ctx.panel(ttl + ' — ' + fa(L.length, 0), [hidN(L0, L), L.length ? table(['رتبه', 'پایش', 'مقایسه', 'نماد', 'بازار', 'قیمت', 'محدودهٔ ورود', 'حد ضرر', 'هدف ۱', 'هدف ۲', 'R:R', 'افق', 'قدرت / اطمینان', 'وضعیت تأیید', 'اقدام پیشنهادی', 'امتیاز (سه عامل اصلی)'], L.slice(0, lim).map(function (r) { var Lv = r.L || {}, tp = Lv.tp || [];
        return [isF(r.rank) ? fa(r.rank, 0) : isF(r.rankCls) ? 'اختیار #' + fa(r.rankCls, 0) : '—', star(ctx, r), cmpBox(ctx, S, r), symBtn(ctx, S, r), (CLS[r.cls] || r.cls) + (r.cls === 'stock' || r.cls === 'fund' ? ' · ' + r.grpFa : ''), n(r.px, r), Lv.buy ? zone(Lv.buy) : Lv.floor ? 'کف ' + zone(Lv.floor) : '—', isF(Lv.stop) ? n(Lv.stop) : '—', isF(tp[0]) ? n(tp[0]) : '—', isF(tp[1]) ? n(tp[1]) : '—', isF(r.rr) ? fa(r.rr, 1) : '—', r.hz || '—',
          ({ strong: 'قوی', mid: 'متوسط', weak: 'ضعیف' })[strengthOf(r)] + (isF(r.conf) ? ' · ' + fa(r.conf, 0) + '٪' : ''), r.execFa + (r.execWhy && r.execWhy.length && r.exec !== 'analytic' ? ' — ' + r.execWhy[0] : ''), (actionOf(r) || [0, 0, r.actFa])[2], priShort(r)]; })) : P(empty),
        L.length > lim ? h('button', { class: 'btn ghost', type: 'button', text: 'نمایش بیشتر', onclick: function () { S.lim = lim + 60; ctx.rerender(); } }) : null]); };
    var SKF = { tp: 'ذخیرهٔ سود', weak: 'تضعیف روند', support: 'شکست حمایت', stop: 'حد ضرر', reduce: 'کاهش بخشی', exit: 'خروج کامل' };
    var sellT = function (L0, ttl) { var L = F(L0).sort(function (a, b) { return (b.spri || 0) - (a.spri || 0); }); var by = {}; L.forEach(function (r) { by[r.sellK] = (by[r.sellK] || 0) + 1; });
      return ctx.panel(ttl + ' — ' + fa(L.length, 0), [hidN(L0, L), P('به تفکیک علت: ' + (Object.keys(by).map(function (k) { return SKF[k] + ' ' + fa(by[k], 0); }).join(' · ') || '—') + '. فروش استقراضی در بازار ایران نیست: برای دارایی‌ای که ندارید، «فروش» یعنی «نخرید».', 'small muted'),
        L.length ? table(['پایش', 'نماد', 'بازار', 'پرتفوی شما؟', 'علت', 'قیمت', 'سقف احتمالی', 'تأیید برگشت نزولی', 'سطح تأیید نزولی', 'حد ضرر', 'اقدام'], L.slice(0, S.lim || 60).map(function (r) { var Lv = r.L || {};
          return [star(ctx, r), symBtn(ctx, S, r), CLS[r.cls] || r.cls, r.held ? 'بله — موقعیت باز' : 'خیر — فرصت فروش تحلیلی', r.sellFa || '—', n(r.px, r), Lv.ceil ? zone(Lv.ceil) : '—', Lv.ceil && isF(Lv.tzConf) ? 'زیر ' + n(Lv.tzConf) : '—', isF(Lv.dnConf) ? n(Lv.dnConf) : '—', isF(Lv.stop) ? n(Lv.stop) : '—', r.held ? r.actFa + ' — ' + (r.actWhy || '') : (actionOf(r) || [0, 0, 'اگر دارید: طبق سطح تأیید نزولی خارج شوید؛ اگر ندارید نخرید'])[2]]; })) : P('موردی نیست.')]); };
    var out = [head];
    if (cur === 'all') {
      out.push(ctx.panel('خلاصهٔ همهٔ اقدام‌ها', [table(['دسته', 'تعداد', 'برترین مورد'], CATS.slice(1).map(function (c) { var L = c === 'change' ? [] : inC(c).sort(function (a, b) { return (b.pri ? b.pri.s : b.spri || 0) - (a.pri ? a.pri.s : a.spri || 0); });
        return [O.CATFA[c], fa(count(c), 0), L[0] ? L[0].sym + ' (' + (CLS[L[0].cls] || '') + ')' : c === 'change' && chg[0] ? chg[0].sym + ': ' + chg[0].to : '—']; }))]));
      var recent = A.log.slice().reverse().slice(0, 40);
      out.push(ctx.panel('آخرین اعلان‌ها', [recent.length ? table(['زمان', 'سطح', 'عنوان', 'دارایی', 'قیمت', 'اقدام بعدی', 'وضعیت امروز'], recent.map(function (e) { return [dt(e.at), e.lvlFa, e.title, e.sym, n(e.px), e.next || '', e.key === 'test' ? '—' : Hub.alerts.statusOf(e)]; })) : P('هنوز اعلانی ثبت نشده است.')]));
    } else if (cur === 'buy') out.push(buyT(inC('buy'), 'فرصت‌های خرید (تأییدشده)', 'هیچ فرصت خرید تأییدشده‌ای در هیچ بازاری نیست. نزدیک‌ترین‌ها در «انتظار برای تأیید» هستند.'));
    else if (cur === 'scale') out.push(buyT(inC('scale'), 'خرید پله‌ای (Scale In)', 'موردی نیست: خرید پله‌ای فقط برای سیگنال تأییدشده با قدرت متوسط یا افزایش موقعیت باز.'));
    else if (cur === 'wait') out.push(buyT(inC('wait'), 'انتظار برای تأیید (فرصت تحلیلی، خرید نیست)', 'موردی نیست.'));
    else if (cur === 'sell') out.push(sellT(inC('sell'), 'فروش، ذخیرهٔ سود و خروج'));
    else if (cur === 'tp') out.push(sellT(inC('tp'), 'ذخیرهٔ سود'));
    else if (cur === 'reduce') out.push(sellT(inC('reduce'), 'کاهش موقعیت'));
    else if (cur === 'close') out.push(sellT(inC('close'), 'خروج کامل'));
    else if (cur === 'hold') {
      var held = F(R.recs.filter(function (r) { return r.held && (r.cats || []).indexOf('hold') >= 0; })), hif = F(R.recs.filter(function (r) { return (r.cats || []).indexOf('holdIf') >= 0; })).sort(function (a, b) { return (b.conf || 0) - (a.conf || 0); });
      out.push(ctx.panel('نگهداری موقعیت‌های شما — ' + fa(held.length, 0), [held.length ? table(['نماد', 'بازار', 'قیمت', 'حد ضرر', 'دلیل'], held.map(function (r) { var Lv = r.L || {}; return [symBtn(ctx, S, r), CLS[r.cls], n(r.px, r), isF(Lv.stop) ? n(Lv.stop) : '—', r.actWhy || '']; })) : P('موقعیت بازی در «پایش موقعیت‌ها» ثبت نشده است.')]));
      out.push(ctx.panel('مناسب برای نگهداری اگر دارید (خرید تازه نیست) — ' + fa(hif.length, 0), [P('روند میان‌مدت صعودی و شرط فروش فعال نیست، ولی برای خرید تازه تأیید ندارد (مثلاً قیمت بالاتر از محدودهٔ ورود است). «بهترین دارایی برای نگهداری» با «بهترین فرصت خرید» یکی نیست.', 'small muted'),
        hif.length ? table(['نماد', 'بازار', 'قیمت', 'روند', 'چرا خرید تازه نیست', 'مرجع ریسک (حد ضرر یا تأیید نزولی)'], hif.slice(0, S.lim || 60).map(function (r) { var Lv = r.L || {}; return [symBtn(ctx, S, r), (CLS[r.cls] || '') + (r.grpFa && r.cls === 'stock' ? ' · ' + r.grpFa : ''), n(r.px, r), TRFA[trendOf(r)], r.rcFa || r.stFa, isF(Lv.dnConf) ? 'بسته‌شدن زیر ' + n(Lv.dnConf) : isF(Lv.stop) ? n(Lv.stop) : '—']; })) : P('موردی نیست.')]));
    } else if (cur === 'change') {
      out.push(ctx.panel('تغییر یا ابطال سیگنال — ' + fa(chg.length + chgLog.length, 0), [chg.length ? table(['زمان محاسبه', 'نماد', 'از', 'به', 'قیمت', 'دلیل'], chg.slice(0, 150).map(function (c) { return [dt(c.at), c.sym, c.from, c.to, n(c.px), (c.why || '').slice(0, 160)]; })) : P('در محاسبه‌های اخیر تغییری ثبت نشده است.'),
        chgLog.length ? table(['زمان', 'رویداد', 'نماد', 'شرح'], chgLog.slice().reverse().slice(0, 60).map(function (e) { return [dt(e.at), e.title, e.sym, (e.reason || '').slice(0, 160)]; })) : null]));
    } else if (cur === 'risk') {
      var rk = F(inC('risk')).sort(function (a, b) { return (b.held ? 1 : 0) - (a.held ? 1 : 0); });
      out.push(ctx.panel('هشدارهای ریسک و حد ضرر — ' + fa(rk.length + riskLog.length, 0), [rk.length ? table(['نماد', 'بازار', 'پرتفوی شما؟', 'قیمت', 'حد ضرر', 'شرح'], rk.slice(0, S.lim || 60).map(function (r) { var Lv = r.L || {}; return [symBtn(ctx, S, r), CLS[r.cls] || r.cls, r.held ? 'بله' : 'خیر', n(r.px, r), isF(Lv.stop) ? n(Lv.stop) : '—', r.held && isF(Lv.stop) ? 'قیمت در فاصلهٔ کمتر از یک ATR از حد ضرر' : (r.rcWhy || r.why || '').slice(0, 160)]; })) : P('موردی نیست.'),
        riskLog.length ? table(['زمان', 'رویداد', 'نماد', 'اقدام'], riskLog.slice().reverse().slice(0, 60).map(function (e) { return [dt(e.at), e.title, e.sym, e.next || '']; })) : null]));
    }
    return ctx.group(out);
  }

  /* ---------------- section 3: market pages ---------------- */
  function goldTab18(ctx) { var g = goldTab(ctx); var A = ctx.R.recs.filter(function (r) { return r.cls === 'gold'; }); if (!A.length) return g;
    return ctx.group([selPanel(ctx, ctx.S, ctx.R), g, marketPage(ctx, 'طلا و سکه — جدول کف و سقف و اقدام', A, { noCat: false })].filter(Boolean)); }
  function corr60(R, a, b) { var O = OR(), z = R.X && R.X.zmap || {}; return O.corr ? O.corr(O.rets(z[a]), O.rets(z[b])) : NaN; }
  function fxTab(ctx) { var S = ctx.S, R = ctx.R, A = R.recs.filter(function (r) { return r.cls === 'fx'; }); if (!A.length) return ctx.panel('ارز', [P('دادهٔ ارز در محاسبه نیست. «ارز (TGJU)» را در مرکز داده به‌روز کنید.')]);
    var G2 = U.store.get('hub.sigglobal.v1', null), nb = G2 && G2.snap && G2.snap.nbx, usd = R.C.by['g:price_dollar_rl'], usdt = R.C.by['g:crypto-tether-irr'];
    var rows = [['دلار آزاد (TGJU) در برابر تتر (TGJU)', usd && usdt && isF(usd.px) && isF(usdt.px) ? pct(usdt.px / usd.px - 1, 2) + ' (تتر ' + n(usdt.px) + '، دلار ' + n(usd.px) + ')' : 'دادهٔ یکی از دو نرخ نیست'],
      ['تتر در نوبیتکس', nb && nb.usdtRls ? n(nb.usdtRls.last) + ' ریال (' + ago(nb.at) + ')' + (usd && isF(usd.px) ? ' · اختلاف با دلار آزاد ' + pct(nb.usdtRls.last / usd.px - 1, 2) : '') : 'دریافت نشده'],
      ['همبستگی بازده روزانهٔ دلار با طلای ۱۸ عیار (۱۲۰ جلسه)', faD(isF(corr60(R, 'g:price_dollar_rl', 'g:geram18')) ? corr60(R, 'g:price_dollar_rl', 'g:geram18').toFixed(2) : '—')],
      ['همبستگی دلار با سکهٔ امامی', faD(isF(corr60(R, 'g:price_dollar_rl', 'g:sekee')) ? corr60(R, 'g:price_dollar_rl', 'g:sekee').toFixed(2) : '—')]];
    return ctx.group([selPanel(ctx, S, R), marketPage(ctx, 'ارز — کف، سقف و محدوده‌های اقدام', A, {}), ctx.panel('عوامل اثرگذار بر ارز (داده‌های موجود)', [table(['عامل', 'مقدار'], rows),
      P('متغیرهای پولی و تورمی، سیاست ارزی و ریسک ژئوپلیتیک در «پایش اقتصاد کلان ایران» و «خبرها» هستند و در خود محدوده‌های کف و سقف وارد نشده‌اند (این محدوده‌ها از رفتار قیمت همان بازار برآورد می‌شوند). نرخ رسمی/مرکز مبادله در داده‌ها نیست؛ عدد تخمینی به‌جای آن نمایش داده نمی‌شود.', 'small muted')])].filter(Boolean)); }
  function cryptoTab(ctx) { var S = ctx.S, R = ctx.R, A = R.recs.filter(function (r) { return r.cls === 'crypto'; }); var G2 = U.store.get('hub.sigglobal.v1', null), sn = G2 && G2.snap || {}, z = R.X && R.X.zmap || {};
    var crash = function (k) { var Z = z[k], X = Z && Z.R && Z.R.X; if (!X || X.n < 200) return '—'; var c = 0, t = 0; for (var i = 7; i < X.n; i++) { t++; if (X.c[i] / X.c[i - 7] - 1 <= -0.15) c++; } return pct(c / t, 1) + ' از ' + fa(t, 0) + ' پنجرهٔ ۷ روزه (' + fa(X.n, 0) + ' روز داده)'; };
    var rows = [['تاریخچهٔ در دسترس بیت‌کوین', z['x:btc'] ? fa(z['x:btc'].R.X.n, 0) + ' روز' + (z['x:btc'].R.X.n < 700 ? ' — کمتر از نیاز تحلیل هفتگی و محدودهٔ کف/سقف؛ با به‌روزرسانی روی کامپیوتر از KuCoin تکمیل می‌شود' : '') : 'نیست'],
      ['ریسک سقوط شدید (سهم پنجره‌های ۷ روزه با افت ≥ ۱۵٪)', 'BTC: ' + crash('x:btc') + ' · ETH: ' + crash('x:eth')],
      ['همبستگی بیت‌کوین با انس طلا / نفت برنت (۱۲۰ روز)', faD([corr60(R, 'x:btc', 'g:ons'), corr60(R, 'x:btc', 'x:brent')].map(function (v) { return isF(v) ? v.toFixed(2) : '—'; }).join(' / '))],
      ['Funding Rate', sn.funding ? faD((sn.funding.rate * 100).toFixed(4)) + '٪ (' + sn.funding.src + '، ' + ago(sn.funding.at) + ')' : 'دریافت نشده'],
      ['Open Interest', sn.oi ? fa(sn.oi.oiCcy, 0) + ' BTC (' + sn.oi.src + ')' : 'دریافت نشده'],
      ['شاخص ترس و طمع', sn.fng ? fa(sn.fng.v, 0) + ' — ' + sn.fng.label : 'دریافت نشده'], ['ارزش کل بازار رمزارز / سهم بیت‌کوین', sn.cgGlobal ? fa(sn.cgGlobal.mcap / 1e12, 2) + ' تریلیون دلار / ' + fa(sn.cgGlobal.dom, 1) + '٪ (فقط عکس لحظه‌ای؛ تاریخچه ندارد)' : 'دریافت نشده'],
      ['بیت‌کوین به ریال (نوبیتکس)', sn.nbx && sn.nbx.btcRls ? n(sn.nbx.btcRls.last) + ' ریال' : 'دریافت نشده']];
    return ctx.group([selPanel(ctx, S, R), A.length ? marketPage(ctx, 'رمزارز — کف، سقف، ورود، خروج و حد ضرر', A, {}) : ctx.panel('رمزارز', [P('دادهٔ رمزارز در محاسبه نیست.')]),
      ctx.panel('دادهٔ اختصاصی بازار رمزارز', [table(['مورد', 'مقدار'], rows), P('بازار رمزارز ۲۴ ساعته است: پایش سبک خودکار فعلاً فقط بورس و TGJU را می‌پوید؛ رمزارز با هر به‌روزرسانی کامل و در اجرای ساعتی GitHub (فقط حکم منتشرشده) بررسی می‌شود. جریان ورود/خروج سرمایه به صرافی‌ها (آن‌چین) در داده‌ها نیست.', 'small muted')])].filter(Boolean)); }
  function otherTab(ctx) { var S = ctx.S, R = ctx.R, A = R.recs.filter(function (r) { return r.cls === 'commodity'; }), UV = Hub.universe;
    return ctx.group([selPanel(ctx, S, R), A.length ? marketPage(ctx, 'کالا و انرژی (فقط تحلیل؛ در بازار داخلی مستقیم قابل معامله نیست)', A, {}) : ctx.panel('کالا و انرژی', [P('داده‌ای در محاسبه نیست.')]),
      UV ? ctx.panel('دامنهٔ رسمی تحلیل (Universe)', [table(['طبقه', 'شرح'], Object.keys(UV.IN).map(function (k) { return [k, UV.IN[k]]; })),
        P('شاخص‌های سهام جهانی (Hang Seng، S&P 500، Nikkei و ...) از دامنه حذف شده‌اند: دریافت، ذخیره، تحلیل، رتبه‌بندی و اعلان نمی‌شوند. نسخهٔ دامنه: ' + UV.VER, 'small muted')]) : null].filter(Boolean)); }

  // Tehran exchange: indices, stocks by industry, funds by type (directive 18 · 2-4, 5)
  function breadth(R) { var z = R.X && R.X.zmap || {}, ks = Object.keys(z).filter(function (k) { var a = z[k].a; return a && (a.cls === 'stock' || a.cls === 'fund') && !a.sample; }), last = 0;
    ks.forEach(function (k) { var X = z[k].R.X; if (X.d[X.n - 1] > last) last = X.d[X.n - 1]; });
    var up = 0, dn = 0, fl = 0, val = 0, val20 = 0, rf = 0, rf5 = 0, nrf = 0, grp = {};
    ks.forEach(function (k) { var Z = z[k], X = Z.R.X, n0 = X.n; if (X.d[n0 - 1] !== last || n0 < 25) return; var c = X.c[n0 - 1], p = X.c[n0 - 2]; if (c > p) up++; else if (c < p) dn++; else fl++;
      val += X.val[n0 - 1] || 0; for (var i = n0 - 21; i < n0 - 1; i++) val20 += (X.val[i] || 0) / 20;
      var ct = Z.a.ct || []; if (ct.length) { var L = ct[ct.length - 1]; if (L.date === last) { rf += (L.buyI || 0) - (L.sellI || 0); nrf++; } ct.slice(-5).forEach(function (q) { rf5 += (q.buyI || 0) - (q.sellI || 0); }); }
      var r = R.C.by[k]; if (r && n0 > 6) { var g = grp[r.grp] = grp[r.grp] || { fa: r.grpFa, v: [] }; g.v.push(c / X.c[n0 - 6] - 1); } });
    var G2 = Object.keys(grp).map(function (k) { var v = grp[k].v.sort(function (a, b) { return a - b; }); return { fa: grp[k].fa, n: v.length, med: v[Math.floor(v.length / 2)] }; }).filter(function (g) { return g.n >= 3; }).sort(function (a, b) { return b.med - a.med; });
    return { last: last, up: up, dn: dn, fl: fl, val: val, val20: val20, rf: rf, rf5: rf5, nrf: nrf, grp: G2 }; }
  function idxCard(ctx, v, F) { if (!v || !v.ok) return ctx.panel(v ? v.name : 'شاخص', [P(v && v.why || 'دادهٔ شاخص در دسترس نیست.')]);
    var tz = v.tz, tr = function (k) { return ({ up: 'صعودی', down: 'نزولی', flat: 'خنثی', none: '—' })[v.tr[k]] || v.tr[k]; };
    var H = F && F.H ? F.H.filter(function (q) { return q.ok; }) : [];
    var rows = [['مقدار و تاریخ', fa(v.last, 0) + ' (' + v.dateFa + ') · تغییر ۱، ۵ و ۲۰ جلسه: ' + [v.chg1, v.chg5, v.chg20].map(function (x) { return pct(x, 1); }).join('، ')], ['روند کوتاه / میان / بلند', v.trx ? v.trx.s.fa + ' / ' + v.trx.m.fa + ' / ' + v.trx.l.fa : tr('s') + ' / ' + tr('m') + ' / ' + tr('l')], ['شواهد روند', v.trx ? ['s', 'm', 'l'].map(function (k) { var e = v.trx[k]; return ({ s: 'کوتاه', m: 'میان', l: 'بلند' })[k] + ': ' + e.ev + (e.subTxt ? ' — ' + e.subTxt : ''); }).join(' | ') + '. قاعده‌ها: ' + v.trx.s.rule + '؛ ' + v.trx.m.rule + '؛ ' + v.trx.l.rule + '. توصیف ساختار است، نه پیش‌بینی.' : '—'],
      ['کف یا سقف احتمالی', tz && tz.zone ? (tz.side === 'down' ? 'کف ' : 'سقف ') + fa(tz.zone[0], 0) + '–' + fa(tz.zone[1], 0) + ' · ' + (tz.stFa || '') + (isF(tz.conf) ? ' · تأیید برگشت: بسته‌شدن ' + (tz.side === 'down' ? 'بالای ' : 'زیر ') + fa(tz.conf, 0) : '') + (isF(tz.pZone) ? ' · احتمال رسیدن به محدوده (برون‌نمونه) ' + pct(tz.pZone, 0) : '') : 'برآورد نشده'],
      ['سطح تأیید صعود / نزول', fa(v.up, 0) + ' / ' + fa(v.dn, 0)], ['مقاومت‌ها / حمایت‌ها', (v.res.map(function (x) { return fa(x, 0); }).join('، ') || '—') + ' / ' + (v.sup.map(function (x) { return fa(x, 0); }).join('، ') || '—')],
      ['سناریوی صعودی', v.bull], ['سناریوی نزولی', v.bear], ['احتمال ادامهٔ رشد (بالاتر بودن پس از ۵ و ۲۰ جلسه)', H.length ? H.map(function (q) { return fa(q.h, 0) + ' جلسه: ' + pct(q.p, 0) + (q.skill ? '' : ' (برابر نرخ پایه؛ مهارت پیش‌بینی ندارد)'); }).join(' · ') : 'برآورد نشده'],
      ['شدت و مدت احتمالی اصلاح', tz && tz.side === 'up' && tz.after && tz.after.length ? 'پس از تأیید برگشت از سقف، اهداف نزولی آماری: ' + tz.after.filter(isF).slice(0, 2).map(function (x) { return fa(x, 0) + ' (' + pct(x / v.last - 1, 1) + ')'; }).join('، ') : 'تا تأیید برگشت نزولی برآورد نمی‌شود'],
      ['بازهٔ زمانی', v.win && v.win.from ? sh(v.win.from) + ' تا ' + sh(v.win.to) : '—'], ['اقدام', v.act]];
    return ctx.panel(v.name, [table(['مورد', 'مقدار'], rows)]); }
  function bourseTab(ctx) {
    var S = ctx.S, R = ctx.R, sub = S.bsub || 'idx', X = R.X || {}, A = R.recs.filter(function (r) { return r.cls === 'stock' || r.cls === 'fund'; });
    var tabs = h('div', { class: 'row-ctl', role: 'tablist' }, [['idx', 'شاخص‌ها و وضعیت کلی بازار'], ['stk', 'سهام به تفکیک صنعت'], ['fund', 'صندوق‌ها به تفکیک نوع']].map(function (t) { return h('button', { class: 'btn' + (sub === t[0] ? ' primary' : ' ghost'), type: 'button', role: 'tab', text: t[1], onclick: function () { S.bsub = t[0]; S.g = g0(); S.lim = 60; ctx.rerender(); } }); }));
    var out = [ctx.panel('بورس و فرابورس', [tabs]), selPanel(ctx, S, R)];
    if (sub === 'idx') {
      var iv = X.idxv || [], B = breadth(R), dv = iv[0] && iv[1] && iv[0].ok && iv[1].ok ? iv[0].chg20 - iv[1].chg20 : NaN;
      iv.forEach(function (v, i) { out.push(idxCard(ctx, v, i === 0 ? X.ixf : null)); });
      out.push(ctx.panel('گستردگی بازار در آخرین جلسه (' + (B.last ? sh(B.last) : '—') + ')', [table(['مورد', 'مقدار'], [
        ['نمادهای مثبت / منفی / بدون تغییر', fa(B.up, 0) + ' / ' + fa(B.dn, 0) + ' / ' + fa(B.fl, 0) + (B.dn ? ' (نسبت ' + fa(B.up / B.dn, 2) + ')' : '')],
        ['ارزش معاملات (سهام و صندوق‌های پوشش‌داده‌شده)', fa(B.val / 1e10, 0) + ' میلیارد تومان در برابر میانگین ۲۰ جلسه ' + fa(B.val20 / 1e10, 0) + (B.val20 ? ' (' + pct(B.val / B.val20 - 1, 0) + ')' : '')],
        ['ورود و خروج پول حقیقی', (B.nrf ? fa(B.rf / 1e10, 0) + ' میلیارد تومان در آخرین جلسه (' + fa(B.nrf, 0) + ' نماد)' : 'دادهٔ حقیقی/حقوقی آخرین جلسه نیست') + ' · ۵ جلسه: ' + fa(B.rf5 / 1e10, 0) + ' میلیارد تومان'],
        ['گروه‌های پیشرو (میانهٔ بازده ۵ جلسه)', B.grp.slice(0, 5).map(function (g) { return g.fa + ' ' + pct(g.med, 1); }).join('، ') || '—'], ['گروه‌های ضعیف', B.grp.slice(-5).reverse().map(function (g) { return g.fa + ' ' + pct(g.med, 1); }).join('، ') || '—'],
        ['هم‌جهتی شاخص کل و هم‌وزن', isF(dv) ? 'تغییر ۲۰ جلسه: کل ' + pct(iv[0].chg20, 1) + '، هم‌وزن ' + pct(iv[1].chg20, 1) + ' — ' + (Math.abs(dv) < 0.02 ? 'هم‌جهت' : dv > 0 ? 'واگرایی: رشد متمرکز در نمادهای بزرگ' : 'واگرایی: نمادهای کوچک قوی‌تر از بزرگ‌ها') : '—']]),
        P('این ارقام از نمادهای تحت پوشش هاب (' + fa(A.length, 0) + ' نماد و صندوق) حساب می‌شوند، نه کل بازار.', 'small muted')]));
      out.push(idxTable(ctx));
      var rel = A.filter(function (r) { return /^funds-(index|equity|sector|lev)$/.test(r.grp); }).sort(function (a, b) { return (b.pri ? b.pri.s : 0) - (a.pri ? a.pri.s : 0); });
      out.push(ctx.panel('ابزارهای قابل معامله مرتبط با شاخص', [P('خود شاخص قابل خرید نیست. صندوق‌های شاخصی، سهامی، بخشی و اهرمی تحت پوشش، با حکم مرکزی خودشان:', 'small muted'),
        rel.length ? table(['نماد', 'نوع', 'قیمت', 'وضعیت کف/سقف', 'وضعیت سیگنال', 'اقدام', 'امتیاز'], rel.map(function (r) { return [symBtn(ctx, S, r), r.grpFa, n(r.px, r), r.st4Fa, r.tierFa, (actionOf(r) || [0, 0, r.actFa])[2], r.pri ? fa(r.pri.s, 0) : '—']; })) : P('صندوق شاخصی یا سهامی در فهرست نمادها نیست.')]));

    } else if (sub === 'stk') {
      var st = A.filter(function (r) { return r.cls === 'stock'; });
      out.push(marketPage(ctx, 'سهام به تفکیک صنعت', st, { groups: groupsOf(st), grp: true }));
      var nOk = st.filter(function (r) { return r.grpOk; }).length, unk = st.filter(function (r) { return !r.grpOk; });
      out.push(ctx.panel('طبقه‌بندی صنایع', [P('مبنا: کد رسمی صنعت هر نماد در دیده‌بان بازار TSETMC (csv) و نام همان کد از شاخص‌های صنعت. ' + fa(nOk, 0) + ' از ' + fa(st.length, 0) + ' نماد با کد رسمی طبقه‌بندی شده‌اند.' + (unk.length ? ' ' + fa(unk.length, 0) + ' نماد «طبقه‌بندی تأییدنشده» دارند (کد رسمی هنوز خوانده نشده؛ گروه موقت از نام زیرگروه): ' + unk.slice(0, 40).map(function (r) { return r.sym; }).join('، ') + (unk.length > 40 ? ' و …' : '') + '. با اولین به‌روزرسانی کامل روی کامپیوتر تکمیل می‌شوند.' : ''), 'small')]));
    } else {
      var fd = A.filter(function (r) { return r.cls === 'fund'; });
      out.push(marketPage(ctx, 'صندوق‌ها به تفکیک نوع', fd, { groups: groupsOf(fd), grp: true }));
      out.push(fixedPanel(ctx));
    }
    return ctx.group(out.filter(Boolean)); }

  /* ---------------- compare, watchlist, history (directive 18 · 9) ---------------- */
  function cmpTab(ctx) {
    var S = ctx.S, R = ctx.R, by = R.C ? R.C.by : {}, K = (S.cmp || []).filter(function (k) { return by[k]; }), W = watchList().filter(function (k) { return by[k]; });
    var cmp = K.length ? (function () { var A = K.map(function (k) { return by[k]; }), col = function (f) { return A.map(f); };
      var rows = [['بازار', col(function (r) { return CLS[r.cls] || r.cls; })], ['قیمت', col(function (r) { return n(r.px, r); })],
        ['بازده مورد انتظار تا هدف ۱', col(function (r) { var t = r.L && r.L.tp && r.L.tp[0]; return isF(t) && isF(r.px) ? pct(t / r.px - 1, 1) : '—'; })],
        ['ریسک تا حد ضرر', col(function (r) { var s2 = r.L && r.L.stop; return isF(s2) && isF(r.px) ? pct(s2 / r.px - 1, 1) : '—'; })], ['بازده به ریسک', col(function (r) { return isF(r.rr) ? fa(r.rr, 1) : '—'; })],
        ['افق زمانی', col(function (r) { return r.hz || '—'; })], ['درجهٔ اطمینان', col(function (r) { return isF(r.conf) ? fa(r.conf, 0) + '٪' + (r.grade ? ' · ' + r.grade : '') : '—'; })],
        ['نقدشوندگی (ارزش ۲۰ روزه)', col(function (r) { return isF(r.val20) ? fa(r.val20 / 1e10, 1) + ' میلیارد تومان' : r.cls === 'commodity' ? 'غیرقابل معامله' : 'بازار پیوسته'; })],
        ['روند', col(function (r) { return TRFA[trendOf(r)]; })], ['وضعیت کف/سقف', col(function (r) { return r.st4Fa; })], ['وضعیت سیگنال', col(function (r) { return r.tierFa + ' · ' + r.execFa; })], ['امتیاز اولویت', col(function (r) { return r.pri ? fa(r.pri.s, 0) : '—'; })]];
      var cm = A.map(function (a) { return [a.sym].concat(A.map(function (b) { if (a === b) return '۱'; var c = corr60(R, a.key, b.key); return isF(c) ? faD(c.toFixed(2)) : '—'; })); });
      return ctx.panel('مقایسهٔ فرصت‌ها (' + fa(K.length, 0) + ')', [table(['مورد'].concat(A.map(function (r) { return r.sym; })), rows.map(function (q) { return [q[0]].concat(q[1]); })),
        P('همبستگی بازده روزانه (۱۲۰ جلسهٔ اخیر):', 'small'), table([''].concat(A.map(function (r) { return r.sym; })), cm), h('button', { class: 'btn ghost', type: 'button', text: 'پاک کردن مقایسه', onclick: function () { S.cmp = []; ctx.rerender(); } })]); })()
      : ctx.panel('مقایسهٔ فرصت‌ها', [P('برای مقایسه، در جدول‌های بازار یا مرکز اعلان‌ها خانهٔ «مقایسه» چند دارایی (حداکثر ۶) را بزنید.')]);
    var wl = ctx.panel('فهرست تحت پایش (' + fa(W.length, 0) + ')', [P('برای دارایی‌های این فهرست، وقتی به محدودهٔ کف یا سقف احتمالی نزدیک شوند، برگشت تأیید شود یا سیگنال معتبر شکل بگیرد، اعلان «دارایی تحت پایش» فرستاده می‌شود (حتی اگر اعلان آن بازار خاموش باشد).', 'small muted'),
      W.length ? table(['', 'نماد', 'بازار', 'قیمت', 'وضعیت کف/سقف', 'فاصله تا کف', 'فاصله تا سقف', 'فاصله تا تأیید صعود', 'وضعیت سیگنال'], W.map(function (k) { var r = by[k], L = r.L || {}, d = function (z, hi) { return z && isF(r.px) ? pct((hi ? Math.max(z[0], z[1]) : Math.min(z[0], z[1])) / r.px - 1, 1) : '—'; };
        return [star(ctx, r), symBtn(ctx, S, r), CLS[r.cls] || r.cls, n(r.px, r), r.st4Fa, d(L.floor, true), d(L.ceil, false), isF(L.upConf) && isF(r.px) ? pct(L.upConf / r.px - 1, 1) : '—', r.tierFa]; })) : P('فهرست خالی است؛ با ستارهٔ ☆ کنار هر دارایی اضافه کنید.')]);
    return ctx.group([selPanel(ctx, S, R), cmp, wl].filter(Boolean)); }
  var SGFA = { pending: 'در انتظار', near: 'نزدیک ورود', priceok: 'قیمت مناسب', confirmed: 'وارد شد', t1: 'هدف ۱', t2: 'هدف ۲', t3: 'هدف ۳', stopped: 'حد ضرر', invalid: 'باطل پیش از ورود', expired: 'منقضی', missed: 'ورود ازدست‌رفته' };
  function histTab(ctx) {
    var T = U.store.get('hub.tradedesk.v1', null), L = (T && T.sig || []).slice().reverse(); if (!L.length) return ctx.panel('تاریخچه و عملکرد فرصت‌ها', [P('هنوز فرصتی در دفتر ثبت سیگنال (hub.tradedesk.v1) ثبت نشده است.')]);
    var closed = L.filter(function (s) { return isF(s.ret); }), ent = L.filter(function (s) { return s.dIn || /^(confirmed|t1|t2|t3|stopped)$/.test(s.st); }), hit = L.filter(function (s) { return s.maxT >= 1; }), stp = L.filter(function (s) { return s.st === 'stopped'; }), inv = L.filter(function (s) { return s.st === 'invalid'; }), mis = L.filter(function (s) { return s.st === 'missed' || (s.hist || []).some(function (q) { return q.to === 'missed'; }); });
    var avg = closed.length ? closed.reduce(function (a, s) { return a + s.ret; }, 0) / closed.length : NaN;
    return ctx.group([ctx.panel('خلاصهٔ عملکرد (' + fa(L.length, 0) + ' فرصت ثبت‌شده)', [table(['مورد', 'مقدار'], [['ورود انجام‌شده (قیمت به محدوده رسید یا تأیید شد)', fa(ent.length, 0)], ['رسیدن به دست‌کم هدف ۱', fa(hit.length, 0) + (ent.length ? ' (' + pct(hit.length / ent.length, 0) + ' از ورودها)' : '')],
      ['فعال‌شدن حد ضرر', fa(stp.length, 0)], ['ابطال پیش از ورود', fa(inv.length, 0)], ['ورود ازدست‌رفته (قیمت پیش از تأیید از محدوده گذشت)', fa(mis.length, 0)], ['میانگین بازده فرصت‌های بسته‌شده', isF(avg) ? pct(avg, 1) + ' (' + fa(closed.length, 0) + ' مورد)' : '—']]),
      P('«ازدست‌رفته به دلیل تأخیر داده یا اعلان» جدا ثبت نمی‌شود: دفتر فقط می‌داند قیمت پیش از تأیید از محدوده گذشته است. زمان ارسال هر اعلان در تاریخچهٔ اعلان‌ها هست و برای این مقایسه باید کنار هم گذاشته شوند.', 'small muted')]),
      ctx.panel('فهرست فرصت‌ها (۲۰۰ مورد آخر)', [table(['نماد', 'شناسایی', 'قیمت مبنا', 'ورود', 'وضعیت', 'بیشترین هدف', 'بستن', 'بازده', 'آخرین تغییر'], L.slice(0, 200).map(function (s) { var lg = (s.hist || [])[s.hist ? s.hist.length - 1 : 0];
        return [s.sym || s.key, s.d0fa || sh(s.d0), n(s.p0), s.dIn ? sh(s.dIn) : '—', SGFA[s.st] || s.st, s.maxT ? 'هدف ' + fa(s.maxT, 0) : '—', s.closedAt || '—', isF(s.ret) ? pct(s.ret, 1) : '—', lg ? (lg.why || '').slice(0, 120) : '—']; }))])]); }

  /* =====================================================================
   * DIRECTIVE 19 — coverage report, incremental-update log, industry indices, fixed-income funds, world indices, tested allocation model
   * ===================================================================== */
  function kb(b) { return isF(b) ? (b > 1048576 ? fa(b / 1048576, 1) + ' مگابایت' : fa(b / 1024, 0) + ' کیلوبایت') : '—'; }
  function coverageTab(ctx) {
    var S = ctx.S, CV = Hub.coverage; if (!CV) return ctx.panel('پوشش داده', [P('ماژول گزارش پوشش بارگذاری نشده است.')]);
    var B = CV.build(), cur = S.covCat || 'all';
    var gt = table(['بازار / کلاس', 'مورد انتظار', 'شناسایی‌شده', 'با شناسهٔ معتبر', 'با تاریخچهٔ کامل', 'به‌روز', 'دارای نقص', 'بدون منبع', 'آخرین داده', 'نقص‌ها به تفکیک'], B.groups.map(function (g) {
      return [g.fa, g.exp == null ? 'نامشخص (فهرست مرجع خوانده نشده)' : fa(g.exp, 0), fa(g.ident, 0), fa(g.valid, 0), fa(g.full, 0), fa(g.fresh, 0), fa(g.defect, 0), fa(g.noSrc, 0), g.last ? sh(g.last) : '—', Object.keys(g.cats).map(function (c) { return fa(+c, 0) + ': ' + fa(g.cats[c], 0); }).join(' · ') || '—']; }));
    var rg = B.reg ? 'فهرست مرجع TSETMC (' + sh(B.reg.date) + '): ' + fa(B.reg.n, 0) + ' سهم و صندوق در دیده‌بان بازار، ' + fa(B.reg.idx, 0) + ' شاخص، ' + fa(B.reg.ind, 0) + ' گروه صنعت رسمی، ' + fa(B.reg.funds, 0) + ' صندوق در ثبت صندوق‌ها.' + (B.reg.errs.length ? ' خطاها: ' + B.reg.errs.join('؛ ') : '')
      : 'فهرست مرجع TSETMC هنوز خوانده نشده است: با اولین به‌روزرسانی کامل روی کامپیوتر (اینترنت ایران)، دیده‌بان بازار، فهرست همهٔ شاخص‌ها و ثبت صندوق‌ها خوانده و شناسه‌ها خودکار ثبت می‌شوند. تا آن زمان «مورد انتظار» نامشخص است.';
    var cats = h('div', { class: 'row-ctl', style: 'flex-wrap:wrap;gap:.35rem' }, [['all', 'همه']].concat(Object.keys(CV.CAT).map(function (c) { return [c, fa(+c, 0) + '. ' + CV.CAT[c]]; })).map(function (q) {
      return h('button', { class: 'btn' + (cur === q[0] ? ' primary' : ' ghost'), type: 'button', text: q[1] + ' (' + fa(q[0] === 'all' ? B.items.length : B.nCat[q[0]] || 0, 0) + ')', onclick: function () { S.covCat = q[0]; ctx.rerender(); } }); }));
    var L = B.items.filter(function (it) { return cur === 'all' || it.cats.indexOf(+cur) >= 0; });
    var list = L.length ? table(['دارایی', 'گروه', 'منبع', 'نوع نقص', 'شرح دقیق', 'اقدام اصلاحی'], L.slice(0, 400).map(function (it) { return [it.name, it.grp, it.src, it.cats.map(function (c) { return fa(c, 0) + '. ' + CV.CAT[c]; }).join('؛ '), it.why || '—', it.cats.map(function (c) { return CV.ACT[c]; }).filter(function (x, i, a) { return a.indexOf(x) === i; }).join('؛ ')]; })) : P('موردی نیست.');
    return ctx.group([ctx.panel('گزارش جامع پوشش داده', [P(rg, 'small'), gt, P('«به‌روز» یعنی آخرین ردیف رسمی برابر آخرین جلسهٔ بازار است یا ردیف امروزِ دیده‌بان بازار ثبت شده. «با تاریخچهٔ کامل» یعنی دست‌کم ۹۰٪ عمق هدف، یا همهٔ تاریخچه‌ای که منبع دارد (نماد جوان).', 'small muted')]),
      ctx.panel('فهرست نقص‌ها (' + fa(B.items.length, 0) + ')', [cats, list, L.length > 400 ? P('۴۰۰ مورد اول نمایش داده شد.', 'small muted') : null]), ingestPanel(ctx), fixPanel(ctx)]); }
  function ingestPanel(ctx) {
    var IG = Hub.ingest; if (!IG) return null; var R = IG.runs().slice().reverse(), KF = { tse: 'بورس', tgju: 'TGJU', global: 'جهانی' };
    var rows = R.slice(0, 30).map(function (r) { var p = r.plan || {}; return [dt(r.at), r.name || KF[r.kind] || r.kind, fa((r.ms || 0) / 1000, 1) + ' ثانیه', fa(r.req || 0, 0), kb(r.bytes), fa(r.rowsAdded || 0, 0), fa(r.revised || 0, 0),
      r.kind === 'tse' ? 'بدون درخواست ' + fa(p.none || 0, 0) + ' · جلسهٔ جدید ' + fa(p.tail || 0, 0) + ' · شکاف ' + fa(p.gap || 0, 0) + ' · بازبینی ' + fa(p.revise || 0, 0) + ' · اولیه ' + fa(p.initial || 0, 0) + (r.idx ? ' · شاخص: کامل ' + fa(r.idx.full, 0) + '، افزودن ' + fa(r.idx.append, 0) : '') : '—',
      (r.stages || []).map(function (s) { return s.name + ' ' + fa(s.ms / 1000, 1) + 'ث/' + fa(s.req, 0) + ' درخواست'; }).join(' · ') || '—', r.err || '—']; });
    // full load vs incremental: the first run in which the stock feed loaded initial histories against the latest one without
    var tse = R.filter(function (r) { return r.kind === 'tse' && !r.err; }), full = tse.filter(function (r) { return (r.plan && r.plan.initial || 0) > 50; })[0], inc = tse.filter(function (r) { return !(r.plan && r.plan.initial); })[0];
    var cmp = full && inc ? table(['', 'دریافت کامل (' + dt(full.at) + ')', 'افزایشی (' + dt(inc.at) + ')', 'کاهش'], [['زمان', fa(full.ms / 1000, 0) + ' ثانیه', fa(inc.ms / 1000, 0) + ' ثانیه', pct(1 - inc.ms / full.ms, 0)], ['تعداد درخواست', fa(full.req, 0), fa(inc.req, 0), pct(1 - inc.req / full.req, 0)], ['حجم دریافتی', kb(full.bytes), kb(inc.bytes), pct(1 - inc.bytes / full.bytes, 0)], ['ردیف افزوده', fa(full.rowsAdded || 0, 0), fa(inc.rowsAdded || 0, 0), '—']])
      : P('مقایسهٔ «کامل در برابر افزایشی» پس از اولین به‌روزرسانی با تاریخچهٔ اولیه و یک به‌روزرسانی افزایشی بعد از آن نمایش داده می‌شود (هر دو روی همین دستگاه).', 'small muted');
    return ctx.panel('دریافت افزایشی: زمان، درخواست و حجم هر به‌روزرسانی', [cmp, rows.length ? table(['زمان', 'منبع', 'مدت', 'درخواست', 'حجم', 'ردیف جدید', 'اصلاح‌شده', 'برنامهٔ دریافت', 'مراحل', 'خطا'], rows) : P('هنوز به‌روزرسانی‌ای با نسخهٔ افزایشی اجرا نشده است.'),
      P('در هر به‌روزرسانی: ردیف امروز همهٔ نمادها از یک درخواست دیده‌بان بازار می‌آید؛ برای هر نماد فقط در صورت نیاز درخواست جدا ارسال می‌شود: جلسه‌های جاافتاده پس از آخرین ردیف رسمی، روزهای مفقود وسط تاریخچه، یا نوبت بازبینی ۵ ردیف اخیر (هر نماد یک بار در ۵ به‌روزرسانی). روزی که منبع در آن ردیفی ندارد (توقف نماد) ثبت و دوباره درخواست نمی‌شود. بک‌تست و اعتبارسنجی فقط وقتی دوباره اجرا می‌شوند که ردیف رسمی تازه یا اصلاح‌شده‌ای آمده باشد.', 'small muted')]); }
  function fixPanel(ctx) { var IG = Hub.ingest; if (!IG) return null; var F = IG.fixes().slice().reverse(); if (!F.length) return ctx.panel('اصلاحات منبع داده', [P('هنوز اصلاحی در ردیف‌های قبلی دیده نشده است.', 'small')]);
    var FF = { close: 'پایانی', high: 'سقف', low: 'کف', open: 'اولین', vol: 'حجم' };
    return ctx.panel('اصلاحات منبع داده (' + fa(F.length, 0) + ' مورد اخیر)', [table(['زمان', 'منبع', 'دارایی', 'تاریخ ردیف', 'فیلد', 'قبلی', 'جدید'], F.slice(0, 150).map(function (x) { return [dt(x.at), x.s, x.k, sh(x.d), FF[x.f] || x.f, n(x.o), n(x.n)]; }))]); }

  // industry indices and all Iranian indices with the engine's index view (trend, probable floor / ceiling, confirmation levels)
  function idxTable(ctx) {
    var ST = U.store.get('hub.sigstocks.v1', null), M = ST && ST.idxMeta || {}, ext = ST && ST.data && ST.data._idx && ST.data._idx.ext || {}, IV = TE.indexView, keys = Object.keys(ext);
    if (!keys.length) return ctx.panel('شاخص‌های قیمت، فرابورس و صنایع', [P('هنوز دریافت نشده‌اند: با اولین به‌روزرسانی کامل روی کامپیوتر، فهرست همهٔ شاخص‌های بورس و فرابورس از TSETMC خوانده و تاریخچهٔ هر کدام یک بار دریافت می‌شود؛ بعد از آن فقط مقدار روزانه اضافه می‌شود.', 'small')]);
    var rows = keys.map(function (c) { var m = M[c] || {}, v = null; try { v = IV ? IV(ext[c], m.name || c) : null; } catch (e) { v = null; } return { c: c, m: m, v: v, n: ext[c].length }; })
      .sort(function (a, b) { return (b.m.headline ? 1 : 0) - (a.m.headline ? 1 : 0) || (a.m.flow || 1) - (b.m.flow || 1) || String(a.m.code || '').localeCompare(String(b.m.code || '')); });
    var trf = function (x) { return ({ up: 'صعودی', down: 'نزولی', flat: 'خنثی', none: '—' })[x] || x || '—'; };
    return ctx.panel('شاخص‌های قیمت، فرابورس و صنایع (' + fa(rows.length, 0) + ')', [table(['شاخص', 'بازار', 'کد صنعت', 'مقدار', 'تغییر ۲۰ جلسه', 'روند کوتاه/میان/بلند', 'کف یا سقف احتمالی', 'تأیید صعود / نزول', 'تاریخچه'], rows.map(function (o) { var v = o.v;
      return [o.m.name || o.c, o.m.flow === 2 ? 'فرابورس' : 'بورس', o.m.code || (o.m.headline ? 'شاخص اصلی' : '—'), v && v.ok ? fa(v.last, 0) : '—', v && v.ok ? pct(v.chg20, 1) : '—', v && v.ok ? trf(v.tr.s) + ' / ' + trf(v.tr.m) + ' / ' + trf(v.tr.l) : (v && v.why) || '—',
        v && v.ok && v.tz && v.tz.zone ? (v.tz.side === 'down' ? 'کف ' : 'سقف ') + fa(v.tz.zone[0], 0) + '–' + fa(v.tz.zone[1], 0) + ' (' + (v.tz.stFa || '') + ')' : '—', v && v.ok ? fa(v.up, 0) + ' / ' + fa(v.dn, 0) : '—', fa(o.n, 0) + ' جلسه']; })),
      P('شناسه و نام هر شاخص از فهرست شاخص‌های TSETMC (GetIndexB1LastAll) خوانده شده؛ کد دورقمی صنعت از نام شاخص صنعت. همان محاسبهٔ شاخص کل (indexView موتور) برای همهٔ شاخص‌ها.', 'small muted')]); }
  // fixed-income funds: yield, NAV gap, liquidity — not technical signals (directive 19 · 2-2)
  function fixedPanel(ctx) {
    var ST = U.store.get('hub.sigstocks.v1', null), W = (ST && ST.watch || []).filter(function (w) { return w.ftype === 'fixed' && w.active !== false; });
    if (!W.length) return ctx.panel('صندوق‌های درآمد ثابت', [P('هنوز صندوق درآمد ثابتی در فهرست نیست: با اولین به‌روزرسانی کامل روی کامپیوتر، همهٔ صندوق‌های قابل معامله از دیده‌بان بازار TSETMC اضافه و نوعشان از ثبت صندوق‌ها (Fund/GetFunds) تعیین می‌شود.', 'small')]);
    var ann = function (px, days) { var L = px[px.length - 1], t = Date.UTC(Math.floor(L.date / 1e4), Math.floor(L.date / 100) % 100 - 1, L.date % 100) - days * 864e5, b = null; for (var i = px.length - 1; i >= 0; i--) { var r = px[i], ti = Date.UTC(Math.floor(r.date / 1e4), Math.floor(r.date / 100) % 100 - 1, r.date % 100); if (ti <= t) { b = r; break; } } if (!b) return NaN; return Math.pow(L.close / b.close, 365 / days) - 1; };
    var rows = W.map(function (w) { var d = ST.data[w.symbol] || {}, px = (d.px || []).filter(function (r) { return r.close > 0; }); if (px.length < 25) return { w: w, short: true }; var L = px[px.length - 1], nav = d.nav && d.nav.length ? d.nav[d.nav.length - 1].nav : w.nav;
      var drop = px.slice(-250).some(function (r, i, a) { return i && r.close / a[i - 1].close - 1 < -0.005; }), val = px.slice(-20).reduce(function (s, r) { return s + (r.val || 0); }, 0) / Math.min(20, px.length);
      return { w: w, px: L.close, y30: ann(px, 30), y90: ann(px, 90), y365: ann(px, 365), gap: nav > 0 ? L.close / nav - 1 : NaN, val: val, drop: drop, n: px.length }; }).sort(function (a, b) { return (b.y90 || -9) - (a.y90 || -9); });
    return ctx.panel('صندوق‌های درآمد ثابت (' + fa(W.length, 0) + ') — بازده، فاصله از NAV و نقدشوندگی', [table(['نماد', 'نوع از', 'قیمت', 'بازدهٔ سالانه‌شدهٔ ۳۰ روز', '۹۰ روز', '۳۶۵ روز', 'قیمت در برابر NAV', 'ارزش معاملات ۲۰ روزه', 'یادداشت'], rows.map(function (o) {
      return o.short ? [o.w.symbol, o.w.ftSrc === 'registry' ? 'ثبت صندوق‌ها' : 'نام', '—', '—', '—', '—', '—', '—', 'تاریخچه کمتر از ۲۵ جلسه'] : [o.w.symbol, o.w.ftSrc === 'registry' ? 'ثبت صندوق‌ها' : 'نام (تأییدنشده)', fa(o.px, 0), pct(o.y30, 1), pct(o.y90, 1), pct(o.y365, 1), isF(o.gap) ? pct(o.gap, 2) : 'NAV منتشر نشده', fa(o.val / 1e10, 1) + ' میلیارد تومان', o.drop ? 'افت قیمت در تقسیم سود دیده شد: بازده قیمتی کمتر از بازده کل است' : '—']; })),
      P('تحلیل تکنیکال (کف و سقف، سیگنال) روی این صندوق‌ها اجرا نمی‌شود: قیمت آن‌ها انباشت سود است. بازده با قیمت پایانی حساب شده؛ NAV ابطال از دیده‌بان بازار (pRedTran) روزانه ثبت می‌شود. همین صندوق‌ها مبنای «نقد / درآمد ثابت» در مدل تخصیص هستند.', 'small muted')]); }

  // the tested allocation model (Hub.allocBT) beside the engine's opportunity-quality view
  function allocBTPanel(ctx, R) { var AB = Hub.allocBT; if (!AB) return null; var E = R.X && R.X.E, r = AB.get(E);
    // the cash return: fixed-income funds when their history exists; until then the annual rate the user sets (same field as the engine's settings)
    var crIn = function () { var TS = U.store.get('hub.tradingEngine.v1', null) || {}, e = TS.e || {}, i = h('input', { class: 'f-in', type: 'text', inputmode: 'decimal', style: 'width:5rem', 'aria-label': 'نرخ سود سالانهٔ نقد (٪)', value: isF(e.cashRate) ? String(Math.round(e.cashRate * 1000) / 10) : '' });
      i.addEventListener('change', function () { var v = Number(i.value), T2 = U.store.get('hub.tradingEngine.v1', null) || {}; T2.e = T2.e || {}; T2.e.cashRate = i.value.trim() === '' || !isF(v) ? null : v / 100; U.store.set('hub.tradingEngine.v1', T2); if (Hub.tradeUI && Hub.tradeUI.clearMemo) Hub.tradeUI.clearMemo(); ctx.recompute ? ctx.recompute() : ctx.rerender(); });
      return h('label', { class: 'small' }, ['نرخ سود سالانهٔ نقد/درآمد ثابت (٪، فرض شما تا دریافت تاریخچهٔ صندوق‌های درآمد ثابت): ', i]); };
    if (r.err) return ctx.panel('مدل تخصیص سرمایه (بک‌تست‌شده)', [P('اجرا نشد: ' + r.err, 'small'), /نقد/.test(r.err) ? crIn() : null]);
    var b = r.best, st = function (x) { return x ? [pct(x.cagr, 1), pct(x.vol, 1), pct(x.mdd, 1), isF(x.sharpe) ? fa(x.sharpe, 2) : '—'] : ['—', '—', '—', '—']; };
    var cur = Object.keys(r.cur).filter(function (k) { return r.cur[k] > 0; }).map(function (k) { return (r.FA[k] || k) + ' ' + pct(r.cur[k], 0); }).join(' + ');
    var rowsB = [['مدل (پارامترهای انتخاب‌شده روی ۶۰٪ اول)'].concat(st(b && b.oos), [b ? pct(b.costOOS, 2) : '—'])].concat(Object.keys(r.bm).map(function (k) { return [(k === 'ew' ? 'وزن برابر همهٔ بازارها (ماهانه)' : 'نگهداری ' + (r.FA[k] || k))].concat(st(r.bm[k].st), [pct(r.bm[k].cost, 2)]); }));
    var verdict = r.ok ? 'در دورهٔ برون‌نمونه، مدل از وزن برابر و بهترین نگهداری ساده (بر پایهٔ شارپ) و از نقد (بازده) بهتر بوده است.' : 'تأیید نشد: در دورهٔ برون‌نمونه مدل از همهٔ روش‌های مرجع بهتر نبوده است. پیشنهاد تخصیص این مدل «اثبات‌شده» نیست و فقط نمایش داده می‌شود.';
    var rg = b && b.reg ? ['bull', 'bear', 'flat'].map(function (g) { var x = b.reg[g], y = r.bReg.ew[g]; return ({ bull: 'صعودی', bear: 'نزولی', flat: 'خنثی' })[g] + ': مدل ' + (x ? pct(x.ann, 0) : '—') + ' / وزن برابر ' + (y ? pct(y.ann, 0) : '—') + (x ? ' (' + fa(x.n, 0) + ' جلسه)' : ''); }).join(' · ') : '—';
    return ctx.panel('مدل تخصیص سرمایه بین بازارها — قابل آزمون', [h('div', { class: 'callout ' + (r.ok ? 'info' : 'warn') }, [P('تخصیص فعلی مدل: ' + (cur || 'نقد') + '. ' + verdict, '')]),
      table(['بازار', 'امتیاز فعلی (روند و مومنتوم' + (r.nSyms ? '، گستردگی سهام' : '') + ')'], r.sc.map(function (x) { return [x.fa, isF(x.s) ? fa(x.s, 2) : '—']; })),
      P('آزمون برون‌نمونه: ' + sh(r.cut) + ' تا ' + sh(r.to) + ' (برآورد پارامتر: ' + sh(r.from) + ' تا ' + sh(r.cut) + '). پارامترها: میانگین ' + fa(b.N, 0) + ' روزه، مومنتوم ' + fa(b.M, 0) + ' روزه، ' + (b.top === 1 ? 'یک بازار برتر' : 'دو بازار برتر') + '، آستانهٔ امتیاز ' + fa(b.thr, 1) + '، تعادل ماهانه. گردش سالانه ' + fa(b.turnOOS, 1) + ' برابر.', 'small'),
      table(['روش', 'بازده سالانه‌شده', 'نوسان سالانه', 'حداکثر افت', 'شارپ (نسبت به نقد)', 'جمع هزینهٔ معامله'], rowsB),
      P('عملکرد سالانه‌شده به تفکیک رژیم بازار (بازده ۶۳ جلسهٔ شاخص کل): ' + rg, 'small'),
      P('دامنهٔ شارپ برون‌نمونهٔ همهٔ ۱۶ حالت شبکه (کمینه / میانه / بیشینه): ' + (r.oosRange ? r.oosRange.map(function (x) { return fa(x, 2); }).join(' / ') : '—') + ' — برای اینکه نتیجه فقط حاصل انتخاب بهترین حالت نباشد.', 'small muted'),
      /فرض/.test(r.cashSrc) ? crIn() : null,
      P('بازده نقد: ' + r.cashSrc + '. هزینه‌ها (رفت‌وبرگشت، فرض قابل تغییر در کد): سهام ۱٫۴۵٪، طلا ۰٫۵٪، دلار ۱٪، بیت‌کوین ۰٫۵٪، نقد ۰٫۱٪. ' + (r.notes.length ? r.notes.join(' ') + ' ' : '') + 'همهٔ بازده‌ها ریالی و اسمی‌اند (تورم کسر نشده).', 'small muted')]); }

  /* =====================================================================
   * DIRECTIVE 21 — time cycles and turning points (Hub.cycles): an independent engine, its own validation and forecast record
   * ===================================================================== */
  var CYRUN = null;
  function cyDate(d) { return d ? sh(d) : '—'; }
  function cyChart(v) {
    // last 300 sessions, the medium-horizon turning points, the coming window of each horizon
    var S = v.S; if (!S) return null; var n = S.n, a0 = Math.max(0, n - 300), C = S.c.slice(a0), lo = Math.min.apply(null, C), hi = Math.max.apply(null, C), Wd = 900, Ht = 220, ext = 60;
    var X = function (i) { return (i - a0) / (n - a0 + ext) * Wd; }, Y = function (p) { return Ht - 10 - (p - lo) / ((hi - lo) || 1) * (Ht - 20); };
    var pts = C.map(function (c, j) { return X(a0 + j).toFixed(1) + ',' + Y(c).toFixed(1); }).join(' ');
    var hm = v.hz.filter(function (g) { return g.hz === 'm'; })[0], kc = hm && hm.k || (hm && hm.H && hm.H.scales[0] ? hm.H.scales[0].k : 4), P = Hub.cycles.zigzag(S, kc).filter(function (p) { return p.i >= a0; }), mk = P.map(function (p) { return '<circle cx="' + X(p.i).toFixed(1) + '" cy="' + Y(p.p).toFixed(1) + '" r="3.5" fill="' + (p.type === 'H' ? 'var(--bad, #d55)' : 'var(--good, #3a8)') + '"/>'; }).join('');
    var col = { s: 'rgba(120,160,255,.18)', m: 'rgba(255,190,80,.22)', l: 'rgba(200,120,255,.18)' }, wins = v.hz.map(function (h) { if (!h.base) return ''; var x1 = X(h.base.a), x2 = Math.min(Wd, X(h.base.b)); if (x1 > Wd) return ''; return '<rect x="' + x1.toFixed(1) + '" y="0" width="' + Math.max(2, x2 - x1).toFixed(1) + '" height="' + Ht + '" fill="' + col[h.hz] + '"><title>' + h.hzFa + ': ' + (h.win ? h.win.typeFa + ' ' + cyDate(h.win.a) + ' تا ' + cyDate(h.win.b) : '') + (h.base.valid ? '' : ' (روش تأییدنشده)') + '</title></rect>'; }).join('');
    var svg = '<svg viewBox="0 0 ' + Wd + ' ' + Ht + '" style="width:100%;height:auto;direction:ltr" role="img" aria-label="نمودار قیمت، نقاط عطف و پنجره‌های زمانی">' + wins + '<polyline fill="none" stroke="currentColor" stroke-width="1.4" points="' + pts + '"/>' + mk + '<line x1="' + X(n - 1).toFixed(1) + '" y1="0" x2="' + X(n - 1).toFixed(1) + '" y2="' + Ht + '" stroke="currentColor" stroke-dasharray="3 3" opacity=".5"/></svg>';
    var d = h('div'); d.innerHTML = svg; return h('div', null, [d, P_('سبز: کف تأییدشده، قرمز: سقف تأییدشده (افق میان‌مدتِ همین دارایی، روی مقیاس منتخب خودش). نوارهای رنگی: پنجرهٔ بعدی هر افق (آبی کوتاه، نارنجی میان، بنفش بلند). خط‌چین: آخرین جلسه.')]); }
  function P_(t) { return P(t, 'small muted'); }
  // other engines on the same market (directive 21 · 8): trend, floor / ceiling state, volatility, other markets in the same window
  function cyConfirm(R, v, h) { var key = v.key, r = R.C && (R.C.by[key] || R.C.by[key.replace(/^x:/, 'g:')]), out = [];
    if (!h.base) return '—'; var top = h.base.type === 'H';
    if (r) { var hv = r.hzv || {}, sTr = hv.s && hv.s.view; if (top && sTr === 'down' || !top && sTr === 'up') out.push('روند کوتاه‌مدت هم‌جهت'); else if (sTr) out.push('روند کوتاه‌مدت خلاف');
      if (top && (r.st4 === 'nearCeil' || r.st4 === 'dnConf') || !top && (r.st4 === 'nearFloor' || r.st4 === 'upConf')) out.push(r.st4Fa); }
    var S = v.S; if (S && S.n > 80) { var a14 = S.atr[S.n - 1], a60 = S.atr[S.n - 61]; if (a14 > a60 * 1.25) out.push('نوسان رو به افزایش'); }
    return out.length ? out.join('؛ ') : 'سایر موتورها تأییدی نشان نمی‌دهند'; }
  function cyAction(h) { if (!h.base) return '—'; if (h.st === 'invalid') return 'بدون اقدام (چرخهٔ بدون پشتوانهٔ آماری)';
    var top = h.base.type === 'H', c = isF(h.conf) ? n(h.conf) : '—';
    if (h.lvl === 'confirmed') return top ? 'اگر دارید: کاهش یا ذخیرهٔ سود طبق حد ضرر موتور؛ خرید تازه نه' : 'زمان و قیمت هم‌جهت شدند؛ ورود فقط با سیگنال تأییدشدهٔ موتور مرکزی';
    if (h.lvl === 'serious' || h.lvl === 'early') return top ? 'پایش؛ تأیید با بسته‌شدن زیر ' + c : 'پایش؛ تأیید کف با بسته‌شدن بالای ' + c;
    return 'پایش'; }
  function cyclesTab(ctx) {
    var S = ctx.S, R = ctx.R, CY = Hub.cycles; if (!CY) return ctx.panel('چرخه‌های زمانی', [P('موتور چرخه‌های زمانی بارگذاری نشده است.')]);
    var D = CY.load();
    // each asset's own engine is (re)computed in the background: markets first, then shares and funds; at most ~8 s per opening
    var go = function (force) { CYRUN = { i: 0, n: 1, tot: 0 }; CY.refresh(function (i, nn, tot) { CYRUN.i = i; CYRUN.n = nn; CYRUN.tot = tot; }, { budget: 8000, force: force }).then(function () { CYRUN = null; S.cyChecked = Date.now(); if (Hub.tradeUI && Hub.tradeUI.clearMemo) Hub.tradeUI.clearMemo(); ctx.recompute ? ctx.recompute() : ctx.rerender(); }); };
    if (!CYRUN && (S.cyForce || !D || !S.cyChecked || Date.now() - S.cyChecked > 6 * 3600e3 && D.pending)) { var fz = S.cyForce === 'all'; S.cyForce = false; go(fz); }
    if (CYRUN && !D) return ctx.panel('چرخه‌های زمانی و نقاط عطف — موتورهای مستقل هر دارایی', [P('ساخت پروفایل چرخهٔ اختصاصی هر دارایی (فقط از تاریخچهٔ خود آن دارایی) … ' + fa(CYRUN.i, 0) + ' از ' + fa(CYRUN.n, 0)), h('button', { class: 'btn ghost', type: 'button', text: 'نمایش وضعیت', onclick: function () { ctx.rerender(); } })]);
    var A = CY.all(R), Pm = D.P, all0 = Object.keys(Pm).map(function (k) { return Pm[k]; }), ok = all0.filter(function (p) { return p.ok; });
    var tests = [], nV = { market: 0, stock: 0, fund: 0 }; ok.forEach(function (p) { p.hz.forEach(function (hh) { if (hh.test) { tests.push({ p: p, h: hh }); if (hh.test.valid) nV[hh.test.fam]++; } }); });
    var byKey = {}; A.markets.concat(A.stocks).forEach(function (v) { if (v.ok) byKey[v.key] = v; }); CY.track(A.markets.concat(A.stocks)); var G = CY.grade(byKey);
    var crN = CY.crit() === 'fdr' ? 'FDR' : 'Holm', fam = D.fam || {}, nValid = nV.market + nV.stock + nV.fund;
    var head = ctx.panel('چرخه‌های زمانی و نقاط عطف — موتور مستقل هر دارایی', [
      h('div', { class: 'callout ' + (nValid ? 'info' : 'warn') }, [P('پروفایل اختصاصی ' + fa(ok.length, 0) + ' دارایی ساخته شده' + (D.pending ? ' (' + fa(D.pending, 0) + ' دارایی در صف؛ با هر بار بازکردن این بخش ادامه می‌یابد)' : '') + '. آزمون‌ها: بازارها ' + fa(fam.market || 0, 0) + '، سهام ' + fa(fam.stock || 0, 0) + '، صندوق‌ها ' + fa(fam.fund || 0, 0) + ' (هر دارایی × هر افق یک آزمون). معتبر با ' + crN + ': بازارها ' + fa(nV.market, 0) + '، سهام ' + fa(nV.stock, 0) + '، صندوق‌ها ' + fa(nV.fund, 0) + '. فقط چرخهٔ معتبرِ خودِ هر دارایی هشدار می‌سازد.', '')]),
      P_('اصل معماری: چرخهٔ هر دارایی فقط از تاریخچهٔ خود آن دارایی استخراج می‌شود — مقیاس نقاط عطف، طول چرخه، روش و سابقهٔ اعتبارسنجی مستقل است و هیچ دارایی چرخه یا اعتبار را از دیگری به ارث نمی‌برد. ارتباط بازارها فقط در لایهٔ جداگانهٔ «هم‌زمانی» بررسی می‌شود. افق‌ها با طول چرخهٔ خودِ دارایی تعیین می‌شوند (کوتاه ≤ ۴۰، میان ۴۰ تا ۱۲۰، بلند بیش از ۱۲۰ جلسه). روش هر افق با اعتبارسنجی پیش‌روندهٔ تودرتو انتخاب می‌شود: در آغاز هر بلوک ۶۰ جلسه‌ای روشی که تا آن روز بهترین کارنامه را داشته انتخاب و فقط روی بلوک بعد نمره داده می‌شود؛ پس خودِ «انتخاب بهترین روش» هم برون‌نمونه سنجیده می‌شود.'),
      h('div', { class: 'row-ctl' }, [h('button', { class: 'btn ghost', type: 'button', text: D.pending ? 'ادامهٔ محاسبه' : 'بازبینی دارایی‌های تغییرکرده', onclick: function () { S.cyForce = true; ctx.rerender(); } }), h('button', { class: 'btn ghost', type: 'button', text: 'محاسبهٔ دوبارهٔ همه', onclick: function () { S.cyForce = 'all'; ctx.rerender(); } }), P_(CYRUN ? 'در حال محاسبه … ' + fa(CYRUN.i, 0) + ' از ' + fa(CYRUN.n, 0) : 'آخرین محاسبه: ' + dt(D.at))])]);
    var cr = CY.crit();
    var tC = ctx.panel('معیار اعتبار', [h('div', { class: 'row-ctl' }, [['holm', 'سخت‌گیر (Holm): حتی یک چرخهٔ کاذب در هر گروه مجاز نیست'], ['fdr', 'متعادل (FDR): حداکثر ۵٪ چرخه‌های معتبر کاذب']].map(function (q2) { return h('button', { class: 'btn' + (cr === q2[0] ? ' primary' : ' ghost'), type: 'button', text: q2[1], onclick: function () { CY.setCrit(q2[0]); if (Hub.tradeUI && Hub.tradeUI.clearMemo) Hub.tradeUI.clearMemo(); ctx.recompute ? ctx.recompute() : ctx.rerender(); } }); })),
      P_('هر دو معیار همیشه محاسبه می‌شوند و جدول هر دو را نشان می‌دهد؛ اصلاح آزمون‌های متعدد درون هر گروه (بازارها، سهام، صندوق‌ها) انجام می‌شود. این انتخاب فقط مبنای سطح هشدار را تعیین می‌کند.')]);
    var mth = function (b) { return b ? CY.MFA[b.m] + ' (مقیاس ' + faD(String(b.k)) + '×ATR)' : '—'; };
    var hr = function (v0) { return v0 && isF(v0.prec) ? pct(v0.prec, 0) + ' (مبنا ' + pct(v0.p0, 0) + ')' : '—'; };
    // markets
    var mk = A.markets.filter(function (v) { return v.ok; }), sel = S.cySel && byKey[S.cySel] ? byKey[S.cySel] : mk[0];
    var rowsM = [], rowsU = [];
    mk.forEach(function (v) { v.hz.forEach(function (hh) { if (!hh.base) return; var valid = hh.base.valid;
      var row = [h('button', { class: 'btn ghost', type: 'button', text: v.sym, onclick: function () { S.cySel = v.key; ctx.rerender(); } }), hh.hzFa, hh.stFa, hh.cyc ? fa(hh.cyc.med, 0) + ' جلسه (' + fa(hh.cyc.q1, 0) + '–' + fa(hh.cyc.q3, 0) + ')' : '—',
        hh.last ? (hh.last.type === 'H' ? 'سقف ' : 'کف ') + cyDate(hh.last.d) + ' (' + fa(hh.last.since, 0) + ' جلسه پیش)' : '—', hh.win ? hh.win.typeFa + ': ' + cyDate(hh.win.a) + ' تا ' + cyDate(hh.win.b) : '—', hh.pr ? n(hh.pr[0]) + ' – ' + n(hh.pr[1]) : hh.prX ? 'قیمت از دامنهٔ معمول نوسان گذشته؛ فقط هشدار زمانی' : '—',
        isF(hh.conf) ? (hh.base.type === 'L' ? 'بسته‌شدن بالای ' : 'بسته‌شدن زیر ') + n(hh.conf) : '—', 'گذشتن از ' + cyDate(hh.win && hh.win.b) + ' بدون نقطهٔ عطف', mth(hh.base), hr(hh.base.v), hh.sc ? fa(hh.sc.s, 0) : '—'];
      if (valid) rowsM.push(row.concat([hh.lvFa, cyConfirm(R, v, hh), cyAction(hh)])); else rowsU.push(row); }); });
    var tM = ctx.panel('بازارها — پنجره‌های زمانی از چرخهٔ معتبر خودِ هر بازار (' + fa(rowsM.length, 0) + ')', [rowsM.length ? table(['بازار', 'افق', 'وضعیت', 'طول چرخهٔ خودِ بازار (میانه)', 'آخرین نقطهٔ عطف', 'پنجرهٔ حساس بعدی', 'محدودهٔ قیمت مرتبط', 'شرط تأیید', 'شرط ابطال', 'روش منتخب این بازار', 'نرخ تحقق برون‌نمونه', 'امتیاز', 'سطح هشدار', 'تأیید سایر موتورها', 'اقدام پیشنهادی'], rowsM)
      : P('در هیچ بازاری چرخهٔ اختصاصی از آزمون برون‌نمونه با اصلاح آزمون‌های متعدد (' + crN + ') عبور نکرد؛ برای بازارها هشدار زمانی صادر نمی‌شود. علت هر مورد در جدول اعتبارسنجی و پنل کیفیت داده آمده است.')]);
    var tU = ctx.panel('پنجره‌های چرخه‌های تأییدنشده (فقط برای شفافیت؛ مبنای تصمیم یا اعلان نیستند) — ' + fa(rowsU.length, 0), [rowsU.length ? table(['بازار', 'افق', 'وضعیت', 'طول چرخه (میانه)', 'آخرین نقطهٔ عطف', 'پنجرهٔ بعدی', 'محدودهٔ قیمت', 'شرط تأیید', 'شرط ابطال', 'روش منتخب', 'نرخ تحقق برون‌نمونه (و مبنای تصادفی)', 'امتیاز'], rowsU) : P('—')]);
    // the asset-specific cycle profile of the selected market (items 1–12 of the addendum)
    var prof = sel && sel.prof, iv = function (d0) { return d0 ? fa(d0.med, 0) + ' (' + fa(d0.q1, 0) + '–' + fa(d0.q3, 0) + ')؛ ضریب تغییر ' + faD(d0.cv.toFixed(2)) : '—'; }, ga = G.byAsset && sel ? G.byAsset[sel.key] : null;
    var tP = prof && prof.ok ? ctx.panel('پروفایل چرخهٔ اختصاصی: ' + sel.sym, [
      P('تاریخچهٔ خودِ دارایی: ' + fa(prof.n, 0) + ' جلسهٔ معامله‌شده از ' + cyDate(prof.from) + ' تا ' + cyDate(prof.to) + (prof.dropped ? ' (' + fa(prof.dropped, 0) + ' جلسهٔ بسته/بی‌معامله/قیمت راکد حذف شد)' : '') + '؛ سقف و کف روزانه: ' + (prof.hl ? 'دارد' : 'فقط قیمت پایانی') + '؛ پنجرهٔ طیفی ' + fa(prof.W, 0) + ' جلسه؛ آزمون از ' + cyDate(prof.start) + '.', 'small'),
      table(['افق', 'مقیاس نقاط عطف', 'تعداد نقاط عطف', 'سقف تا سقف', 'کف تا کف', 'سقف تا کف', 'کف تا سقف', 'تغییر طول چرخه (نیمهٔ اخیر ÷ نیمهٔ قبل)'], [].concat.apply([], prof.hz.map(function (hh) { return hh.scales.map(function (s) { return [hh.fa, faD(String(s.k)) + '×ATR', fa(s.nPiv, 0), iv(s.iv.HH), iv(s.iv.LL), iv(s.iv.HL), iv(s.iv.LH), isF(s.iv.drift) ? faD(s.iv.drift.toFixed(2)) : '—']; }); }))),
      table(['افق', 'روش‌های آزموده', 'روش منتخب امروز', 'تاریخچهٔ انتخاب روش', 'پیش‌بینی برون‌نمونه (خوشه)', 'دقت / مبنا', 'p / Holm / FDR', 'خطای زمانی برون‌نمونه (میانه، جلسه)', 'سیاست B: انتخاب از آخرین نقطهٔ تغییر رژیم (دقت / مبنا، p)', 'توان آزمون (احتمال تشخیص برتری ۱۵٪)', 'نتیجه'], prof.hz.map(function (hh) { var o = hh.oos || {}, t2 = hh.test, ob = hh.oosB || {}, pw = hh.pow;
        return [hh.fa, fa(hh.nCfg, 0), hh.cur ? CY.MFA[hh.cur.m] + ' @' + faD(String(hh.cur.k)) : 'هیچ روشی برتری نداشت', (hh.hist || []).map(function (x) { return cyDate(x.d) + ': ' + (x.id ? CY.MFA[x.id.split('@')[0]] + ' @' + faD(x.id.split('@')[1]) : 'بدون روش'); }).join(' ← ') || '—',
          o.n ? fa(o.n, 0) + ' (' + fa(o.ne, 0) + ')' : '—', isF(o.prec) ? pct(o.prec, 1) + ' / ' + pct(o.p0, 1) : '—', t2 ? faD(t2.p.toPrecision(2)) + ' / ' + faD(t2.pH.toFixed(3)) + ' / ' + faD(t2.pB.toFixed(3)) : '—', isF(o.err) ? fa(o.err, 1) : '—', isF(ob.prec) ? pct(ob.prec, 1) + ' / ' + pct(ob.p0, 1) + '، p ' + faD(ob.p.toPrecision(2)) + (hh.testB ? '، Holm ' + faD(hh.testB.pH.toFixed(3)) : '') : 'نمونه کمتر از ۸', pw ? pct(pw.pw, 0) + (pw.need ? ' (برای p<۰٫۰۵ دقتی ' + fa(pw.liftNeed, 2) + ' برابر مبنا لازم است)' : '') : '—', t2 ? (t2.valid ? 'معتبر' + (t2.viaB ? ' (سیاست B)' : '') : WHY(t2, o) + (pw && pw.pw < 0.5 ? ' — توان آزمون کم است: «نامعتبر» به معنای نبود چرخه نیست' : '')) : 'نمونهٔ برون‌نمونه کمتر از ۸']; })),
      prof.reg ? P_('رژیم رفتاری (مدل مارکوف پنهان دو حالته روی بازده روزانهٔ خود دارایی): اکنون ' + (prof.reg.state === 'hi' ? 'رژیم پرنوسان' : 'رژیم کم‌نوسان') + ' (احتمال رژیم پرنوسان ' + pct(prof.reg.pHi, 0) + ')؛ نوسان سالانهٔ دو رژیم ' + pct(prof.reg.vol[0], 0) + ' و ' + pct(prof.reg.vol[1], 0) + '؛ ماندگاری میانگین ' + fa(prof.reg.dur[0], 0) + ' و ' + fa(prof.reg.dur[1], 0) + ' جلسه. نقاط تغییر نوسان (تقسیم دودویی، جریمهٔ BIC): ' + ((prof.cps || []).map(cyDate).join('، ') || 'یافت نشد') + '. این بخش توصیفی است و پیش‌بینی چرخه نیست.') : null,
      P_('چند چرخهٔ هم‌زمان (توصیفی، از طیف خودِ دارایی روی ' + fa(prof.W, 0) + ' جلسهٔ اخیر): ' + ((prof.peaks || []).map(function (p2) { return fa(p2.per, 0) + ' جلسه (سهم توان ' + pct(p2.share, 1) + '، p در برابر نوفهٔ قرمز ' + faD(p2.p.toFixed(2)) + ')'; }).join('؛ ') || '—') + '. خطای پیش‌بینی‌های ثبت‌شدهٔ این دارایی: ' + (ga ? fa(ga.hit, 0) + ' از ' + fa(ga.n, 0) + ' داخل پنجره' + (ga.err.length ? '؛ میانهٔ خطای زمانی ' + fa(ga.err.sort(function (a, b) { return a - b; })[Math.floor(ga.err.length / 2)], 0) + ' جلسه' : '') : 'هنوز پیش‌بینی ارزیابی‌شده‌ای نیست') + '.')]) : null;
    // shares and funds — each from its own engine
    var st = A.stocks.filter(function (v) { return v.ok && v.head.lvl !== 'none'; }).sort(function (a, b) { return (b.head.sc ? b.head.sc.s : 0) - (a.head.sc ? a.head.sc.s : 0); });
    var tS = ctx.panel('سهام و صندوق‌ها با هشدار از چرخهٔ معتبر خودِ همان نماد (' + fa(st.length, 0) + ')', [st.length ? table(['نماد', 'افق', 'سطح', 'وضعیت', 'پنجره', 'محدودهٔ قیمت', 'شرط تأیید', 'روش منتخب', 'نرخ تحقق برون‌نمونه', 'امتیاز'], st.slice(0, 60).map(function (v) { var hh = v.head;
      return [v.sym, hh.hzFa, hh.lvFa, hh.stFa, hh.win ? hh.win.typeFa + ': ' + cyDate(hh.win.a) + ' تا ' + cyDate(hh.win.b) : '—', hh.pr ? n(hh.pr[0]) + ' – ' + n(hh.pr[1]) : hh.prX ? 'قیمت از دامنهٔ معمول نوسان گذشته؛ فقط هشدار زمانی' : '—', isF(hh.conf) ? n(hh.conf) : '—', mth(hh.base), hr(hh.base && hh.base.v), hh.sc ? fa(hh.sc.s, 0) : '—']; })) : P('موردی نیست.'),
      P_('هر نماد موتور و سابقهٔ اعتبارسنجی خودش را دارد. هشدار زمانی دستور معامله نیست؛ سیگنال خرید و فروش فقط از حکم مرکزی می‌آید.')]);
    // the separate cross-market layer
    var SY = D.sync || {}, sigP = (SY.pairs || []).filter(function (p2) { return p2.q < 0.1; });
    var tY = ctx.panel('لایهٔ بین‌بازاری (جدا از موتورهای مستقل؛ چیزی به آن‌ها برنمی‌گرداند)', [
      A.sync.length ? table(['بازهٔ مشترک', 'بازارها (هر کدام از چرخهٔ معتبر خودش)', 'شواهد تاریخی هم‌زمانی'], A.sync.map(function (g) { return [cyDate(g.a) + ' تا ' + cyDate(g.b), g.items.map(function (i) { return i.sym + ' (' + i.type + '، ' + i.hz + ')'; }).join('، '), g.ev.length ? g.ev.map(function (e) { return e.symA + '–' + e.symB + ': q ' + faD(e.q.toFixed(2)); }).join('؛ ') : '—']; })) : P('اکنون پنجرهٔ معتبرِ هم‌پوشانی میان بازارهای مختلف نیست.'),
      sigP.length ? table(['جفت بازار', 'هم‌زمانی نقاط عطف (±۵ روز)', 'انتظار تصادفی', 'p', 'q (FDR)'], sigP.slice(0, 15).map(function (p2) { return [p2.symA + ' – ' + p2.symB, pct(p2.obs, 0), pct(p2.exp, 0), faD(p2.p.toFixed(3)), faD(p2.q.toFixed(3))]; })) : P_('هیچ جفت بازاری هم‌زمانی تاریخی نقاط عطفِ معنادار (q کمتر از ۰٫۱) نشان نداد' + (SY.pairs ? ' (' + fa(SY.pairs.length, 0) + ' جفت آزموده شد)' : '') + '.'),
      P_('روش: نقاط عطف هر بازار روی مقیاس میان‌مدتِ خودش؛ سهم نقاط عطف یک بازار که نقطهٔ عطف بازار دیگر در ±۵ روز تقویمی آن بود، در برابر ۱۹۹ جابه‌جایی دایره‌ای نقاط عطف بازار دوم (زمان‌بندی تصادفی، همان تعداد و فاصله). هم‌زمانی رابطهٔ علّی یا جهت حرکت را ثابت نمی‌کند.')]);
    var selP = sel ? ctx.panel('نمودار: ' + sel.sym, [cyChart(sel)]) : null;
    // validation: one row per asset × horizon (the out-of-sample record of that asset's own method choice)
    var vf = S.cyVal || 'mk', vt = tests.filter(function (x) { return vf === 'mk' ? x.h.test.fam === 'market' : vf === 'valid' ? x.h.test.valid : x.h.test.fam !== 'market'; }).sort(function (a, b) { return a.h.oos.p - b.h.oos.p; }).slice(0, vf === 'st' ? 120 : 400);
    var tV = ctx.panel('اعتبارسنجی پیش‌روندهٔ تودرتو — هر دارایی × هر افق', [h('div', { class: 'row-ctl' }, [['mk', 'بازارها'], ['valid', 'معتبرها'], ['st', 'سهام و صندوق‌ها (۱۲۰ مورد با کمترین p)']].map(function (q2) { return h('button', { class: 'btn' + (vf === q2[0] ? ' primary' : ' ghost'), type: 'button', text: q2[1], onclick: function () { S.cyVal = q2[0]; ctx.rerender(); } }); })),
      vt.length ? table(['دارایی', 'افق', 'روش منتخب امروز', 'پیش‌بینی برون‌نمونه (خوشهٔ مستقل)', 'دقت', 'مبنای تصادفی', 'برتری', 'p', 'Holm', 'FDR', 'خطای زمانی (میانه)', 'دقت جهت', 'نتیجه', 'علت / دادهٔ لازم'], vt.map(function (x) { var o = x.h.oos, t2 = x.h.test;
        return [x.p.sym, x.h.fa, x.h.cur ? CY.MFA[x.h.cur.m] + ' @' + faD(String(x.h.cur.k)) : '—', fa(o.n, 0) + ' (' + fa(o.ne, 0) + ')', pct(o.prec, 1), pct(o.p0, 1), pct(o.skill, 1), faD(o.p < 0.001 ? o.p.toExponential(1) : o.p.toFixed(3)), faD(t2.pH.toFixed(3)), faD(t2.pB.toFixed(3)), isF(o.err) ? fa(o.err, 1) : '—', isF(o.dir) ? pct(o.dir, 0) : '—', t2.valid ? 'معتبر' : 'نامعتبر', WHY(t2, o)]; })) : P('موردی نیست.'),
      P_('دقت = سهم پنجره‌هایی که نقطهٔ عطف همان نوع داخلشان رخ داد، فقط برای پیش‌بینی‌های روشی که در همان زمان انتخاب شده بود. مبنا = همان عرض پنجره در هر فاصلهٔ ممکن. p یک‌طرفهٔ دوجمله‌ای روی خوشه‌های مستقل؛ Holm و FDR درون گروه همان دارایی (بازارها / سهام / صندوق‌ها). معتبر = برتری مثبت، نسبت دقت به مبنا دست‌کم ۱٫۱۵، دست‌کم ۱۵ خوشه و p اصلاح‌شده کمتر از ۰٫۰۵. «خوشهٔ لازم» تقریب نرمال است.')]);
    var DQ = CY.dataQuality(), cnt = {}; tests.forEach(function (x) { cnt[x.h.test.why] = (cnt[x.h.test.why] || 0) + 1; });
    var tQ = ctx.panel('چرا چرخه‌ها معتبر نمی‌شوند؟ کیفیت و عمق دادهٔ هر بازار', [
      P('آزمون‌ها بر حسب علت: معتبر ' + fa(cnt.valid || 0, 0) + ' · فقط FDR ' + fa(cnt.fdr || 0, 0) + ' · بی‌برتری ' + fa(cnt.noskill || 0, 0) + ' · برتری ناچیز ' + fa(cnt.small || 0, 0) + ' · دادهٔ کم ' + fa(cnt.thin || 0, 0) + ' · برتری اثبات‌نشده (نمونهٔ کم) ' + fa(cnt.power || 0, 0), 'small'),
      DQ.length ? table(['بازار', 'جلسه‌های معامله‌شده', 'از', 'تا', 'جلسهٔ حذف‌شده', 'بیشترین نقاط عطف کوتاه / میان / بلند', 'سقف و کف روزانه', 'وضعیت'], DQ.map(function (q2) { var pv = q2.piv || {};
        return [q2.sym, fa(q2.n, 0), cyDate(q2.from), cyDate(q2.to), fa(q2.dropped || 0, 0), fa(pv.s || 0, 0) + ' / ' + fa(pv.m || 0, 0) + ' / ' + fa(pv.l || 0, 0), q2.hl ? 'دارد' : 'فقط قیمت پایانی', q2.note]; })) : null,
      P_('عمق هدف: ۳۰۰۰ جلسه برای طلا، سکه و ارز (یک‌بار از TGJU)، ۱۵۰۰ روز برای رمزارز (KuCoin). شاخص‌های صنایع و جهانی پس از به‌روزرسانی کامل روی دستگاه اضافه می‌شوند.')]);
    var tG = ctx.panel('ثبت و ارزیابی پیش‌بینی‌های زمانی (پیش از وقوع)', [P('پیش‌بینی‌های چرخه‌های معتبر هر دارایی با تاریخ صدور ثبت می‌شوند و تغییر نمی‌کنند؛ ۱۰ جلسه پس از پایان هر پنجره نمره می‌گیرند. باز: ' + fa(G.open || 0, 0) + ' · ارزیابی‌شده: ' + fa(G.n || 0, 0), 'small'),
      (G.list || []).length ? table(['صدور', 'دارایی', 'افق', 'روش', 'نوع', 'پنجره', 'نتیجه'], G.list.slice(0, 40).map(function (f) { return [cyDate(f.d0), f.sym, ({ s: 'کوتاه', m: 'میان', l: 'بلند' })[f.hz] || '—', CY.MFA[f.m] + ' @' + faD(String(f.k)), f.type === 'L' ? 'کف' : 'سقف', cyDate(f.from) + ' تا ' + cyDate(f.to), f.res ? ({ hit: 'داخل پنجره', early: 'زودتر', late: 'دیرتر', miss: 'رخ نداد' })[f.res.r] + (f.res.turn ? ' (' + cyDate(f.res.turn) + ')' : '') : 'باز']; })) : P_('هنوز پیش‌بینی‌ای ثبت نشده است.')]);
    return ctx.group([head, tC, tM, selP, tP, tS, tY, tG, tU, tV, tQ].filter(Boolean));
  }
  function WHY(t2, o) { var w = t2.why;
    return w === 'valid' ? 'معتبر با هر دو معیار' : w === 'fdr' ? 'فقط با معیار FDR معتبر' : w === 'noskill' ? 'بی‌برتری: دقت در حد شانس' : w === 'small' ? 'برتری ناچیز (کمتر از ۱۵٪ بالاتر از شانس)'
      : w === 'thin' ? 'دادهٔ کم: ' + fa(o.ne, 0) + ' خوشه (حداقل ۱۵)' + (t2.neNeed ? '؛ حدود ' + fa(t2.neNeed, 0) + ' خوشه لازم' : '')
      : 'برتری دیده می‌شود اما نمونه برای اثبات کم است' + (t2.neNeed ? ': حدود ' + fa(t2.neNeed, 0) + ' خوشه لازم، ' + fa(o.ne, 0) + ' موجود' : ''); }

  // a tab returns a group; a single panel (early return) is wrapped so the toolkit always receives { el }
  function W(fn) { return function (ctx) { var r = fn(ctx); return r && r.el && !r.nodeType ? r : ctx.group([r]); }; }
  /* ---------------- monitoring: system integrity (directive 22) ---------------- */
  var INTRES = null;
  function integrityTab(ctx) {
    var S = ctx.S, IG = Hub.integrity, CEN = Hub.central; if (!IG || !CEN) return ctx.panel('کنترل یکپارچگی سیستم', [P('ماژول کنترل یکپارچگی بارگذاری نشده است.')]);
    var Lg = IG.log(), last = INTRES || Lg.last, M = CEN.master(), C0 = CEN.get();
    var runBtn = h('button', { class: 'btn primary', type: 'button', text: 'اجرای همهٔ آزمون‌ها اکنون', onclick: function () { runBtn.disabled = true; setTimeout(function () { INTRES = IG.run({ why: 'دستی (صفحهٔ نظارت)' }); ctx.rerender(); }, 30); } });
    var selfBtn = h('button', { class: 'btn ghost', type: 'button', text: 'آزمون خطای عمدی (تشخیص اختلاف)', onclick: function () { var r = IG.selfTest(); U.toast(r.ok ? 'خطای عمدی تشخیص داده شد: ' + r.caught.join('، ') + ' (' + r.sym + ')' : 'آزمون خطای عمدی ناموفق: ' + (r.why || ('فقط ' + (r.caught || []).length + ' از ۳ مورد')), r.ok ? 'good' : 'warn'); S.selfRes = r; ctx.rerender(); } });
    var head = ctx.panel('کنترل یکپارچگی سیستم — یک دارایی، یک حکم، در همهٔ بخش‌ها', [
      P('اصل: هر حکم، رتبه، قیمت مبنا و سطح معاملاتی که در هر بخش دیده می‌شود از «مرجع مرکزی» (آخرین اجرای موتور، hub.central.v1) خوانده می‌شود. این صفحه دو کنترل جدا اجرا می‌کند: یکسانی داده (همهٔ بخش‌ها همان نسخه را می‌خوانند) و یکسانی تصمیم (برای یک دارایی، افق و زمان تحلیل، همان حکم و همان سطوح). پس از هر اجرای موتور خودکار اجرا می‌شود.', 'small'),
      C0 ? P('مرجع مرکزی: محاسبهٔ ' + dt(C0.at) + (C0.run ? ' · اجرای شمارهٔ ' + fa(C0.run, 0) : '') + (C0.upd ? ' · ' + C0.upd : '') + ' · ' + fa(Object.keys(C0.by || {}).length, 0) + ' رکورد · فهرست مرکزی دارایی‌ها: ' + fa(M ? M.n : 0, 0) + ' دارایی با شناسهٔ یکتا.', 'small') : P('مرجع مرکزی هنوز ساخته نشده است.', 'warn-t'),
      h('div', { class: 'row-ctl' }, [runBtn, selfBtn]), S.selfRes ? P('آخرین آزمون خطای عمدی: ' + (S.selfRes.ok ? 'موفق — هر سه اختلاف عمدی (' + S.selfRes.caught.join('، ') + ') روی ' + S.selfRes.sym + ' شناسایی شد.' : 'ناموفق — ' + (S.selfRes.why || 'تشخیص ناقص')), S.selfRes.ok ? 'small good-t' : 'small warn-t') : null]);
    if (!last) return ctx.group([head, ctx.panel('نتیجه', [P('هنوز آزمونی اجرا نشده است.')])]);
    var tRows = Object.keys(IG.TFA).map(function (t) { var x = last.tests[t] || { n: 0, bad: 0 }; return [t + ' · ' + IG.TFA[t], fa(x.n, 0), fa(x.bad, 0), x.bad ? 'اختلاف' : 'بدون اختلاف']; });
    var res = ctx.panel('آخرین اجرا: ' + dt(last.at) + ' — ' + (last.why || '') + ' — ' + (last.ok ? 'بدون اختلاف حل‌نشده' : fa(last.nMM, 0) + ' اختلاف حل‌نشده'), [
      h('div', { class: 'callout ' + (last.ok ? 'info' : 'warn') }, [P(last.ok ? 'همهٔ بخش‌ها همان حکم، رتبه، قیمت و سطوح مرجع مرکزی را نشان می‌دهند.' : 'اختلاف‌ها پنهان نشده‌اند؛ جدول زیر بخش، دارایی، مقدار مرکزی، مقدار نمایش‌داده‌شده و علت را نشان می‌دهد.', '')]),
      last.fixedFrom ? P('اصلاح خودکار: ' + fa(last.fixedFrom.n, 0) + ' اختلاف پیدا شد → ' + last.fixedFrom.acts.join('، ') + ' → آزمون دوباره: ' + fa(last.nMM, 0) + ' باقی ماند.', 'small') : null,
      table(['آزمون', 'مقایسه', 'اختلاف', 'نتیجه'], tRows),
      table(['بخش (مصرف‌کنندهٔ مرجع)', 'ردیف‌های بررسی‌شده', 'اختلاف', 'زمان (ms)', 'یادداشت'], (last.cons || []).map(function (c) { return [c.title, c.err ? 'خطا' : c.skip ? '—' : fa(c.n, 0), c.err ? c.err : c.skip ? c.skip : fa(c.bad, 0), isF(c.ms) ? fa(c.ms, 0) : '—', c.note || '']; })),
      last.mm.length ? table(['آزمون', 'بخش', 'دارایی', 'فیلد', 'مقدار مرکزی', 'مقدار نمایش‌داده‌شده', 'علت', 'اصلاح'], last.mm.slice(0, 80).map(function (m) { return [m.test, m.sec, m.sym || m.key, m.field, m.cen, m.shown, m.cause, m.fix || 'اصلاح خودکار ممکن نبود — گزارش شد']; })) : null,
      (last.fixed || []).length ? h('details', null, [h('summary', { text: 'اختلاف‌هایی که خودکار اصلاح شدند (' + fa(last.fixed.length, 0) + ')' }), table(['بخش', 'دارایی', 'فیلد', 'علت', 'اصلاح'], last.fixed.map(function (m) { return [m.sec, m.sym || m.key, m.field, m.cause, m.fix]; }))]) : null,
      (last.info || []).length ? h('ul', { class: 'studio-l' }, last.info.map(function (t) { return h('li', { text: t }); })) : null]);
    // why is an asset not shown? (directive 22 · 10)
    var q = S.whyQ || '', inp = h('input', { type: 'search', class: 'f-in', value: q, placeholder: 'نماد یا نام', 'aria-label': 'جست‌وجوی دارایی' }); inp.addEventListener('change', function () { S.whyQ = inp.value.trim(); ctx.rerender(); });
    var hits = []; if (q && M) Object.keys(M.A).forEach(function (aid) { var a = M.A[aid]; if (String(a.sym || '').indexOf(q) >= 0 || String(a.name || '').indexOf(q) >= 0) hits.push(a); });
    var whyP = ctx.panel('چرا این دارایی در فهرست فرصت‌ها نیست؟', [h('label', { class: 'small' }, ['جست‌وجو ', inp]), q ? (hits.length ? table(['دارایی', 'شناسهٔ یکتا', 'بازار / کلاس', 'منبع', 'وضعیت پوشش', 'حکم مرکزی / علت نبودن در فرصت‌ها', 'نسخه'], hits.slice(0, 30).map(function (a) { var k = a.keys[0], r = CEN.rec(k);
      return [a.sym + (a.name && a.name !== a.sym ? ' — ' + a.name : ''), a.aid + (a.idStable ? '' : ' (موقت)'), (a.market || '') + ' · ' + (a.clsFa || ''), a.src || '—', a.cover || '—', r && r.tier === 'ok' ? 'فرصت خرید تأییدشده (رتبهٔ ' + (r.rank || r.rankCls || '—') + ')' : CEN.whyNot(k) || '—', r && r.ver ? 'v' + r.ver : '—']; })) : P('در فهرست مرکزی دارایی‌ها چیزی با این نام نیست؛ یعنی این دارایی پوشش داده نمی‌شود.')) : P('نماد را بنویسید تا وضعیت پوشش، حکم مرکزی و علت دیده‌نشدن آن را ببینید.', 'small muted')]);
    // traceability: the versions of a signal (directive 22 · 13)
    var sel = S.sel || (hits[0] && hits[0].keys[0]) || null, aid = sel ? CEN.aidOf(sel) : null, H = aid ? CEN.ledger(aid) : [];
    var trace = ctx.panel('سابقهٔ نسخه‌های سیگنال' + (sel ? ': ' + ((CEN.rec(sel) || {}).sym || sel) : ''), [sel ? (H.length ? table(['نسخه', 'زمان', 'به‌روزرسانی', 'وضعیت / اقدام', 'سطح فرصت', 'رتبه', 'قیمت', 'محدودهٔ ورود', 'حد ضرر', 'اهداف'], H.slice().reverse().map(function (v) { var c = v.c || {};
      return ['v' + fa(v.v, 0), dt(v.at), v.upd || '—', (c.st || '') + ' / ' + (c.act || ''), c.tier || '—', c.rank ? fa(c.rank, 0) : '—', n(v.px), c.buy ? zone(c.buy) : '—', isF(c.stop) ? n(c.stop) : '—', (c.tp || []).filter(isF).map(function (x) { return n(x); }).join('، ') || '—']; })) : P('برای این دارایی هنوز نسخه‌ای ثبت نشده است.')) : P('یک دارایی را (با جست‌وجوی بالا یا از هر فهرست) انتخاب کنید.', 'small muted')]);
    var hist = ctx.panel('تاریخچهٔ آزمون‌های یکپارچگی', [(Lg.runs || []).length ? table(['زمان', 'علت اجرا', 'نتیجه', 'اختلاف حل‌نشده', 'اصلاح خودکار', 'نسخهٔ مرجع'], Lg.runs.slice().reverse().slice(0, 20).map(function (x) { return [dt(x.at), x.why || '', x.ok ? 'سالم' : 'اختلاف', fa(x.nMM, 0), fa(x.nFixed || 0, 0), x.central ? dt(x.central.at) : '—']; })) : P('—')]);
    var cons = ctx.panel('بخش‌های متصل به مرجع مرکزی', [table(['بخش', 'فیلدهای مقایسه‌شده'], IG.consumers().map(function (c) { return [c.title, c.fields.map(function (f) { return IG.FFA[f] || f; }).join('، ')]; }).concat([['داشبورد معاملاتی، صندوق اقدام‌ها، صفحه‌های بازار', 'مستقیم از اجرای موتور = مرجع (آزمون نسخه و همهٔ فیلدها)'], ['کارت‌های معامله‌گری هوشمند', 'اقدام و سطوح هر کارت در برابر رکورد مرکزی'], ['بازارهای ایران (تحلیل سه‌افقی)', 'برای دارایی‌های دارای رکورد مرکزی: حکم و سطوح از مرجع؛ بقیه «سناریوی تحلیلی» با برچسب'], ['اعلان‌ها و ویجت', 'فقط از مرجع؛ نسخهٔ ارزیابی‌شده ثبت می‌شود']])),
      P('مدل‌های تحلیلی (امتیاز کارگاه سهام، حباب طلا، اسپرد ارز، مدل اختیار، چرخه‌ها، تحلیل کانال) ورودی موتورند؛ برچسب خودشان فقط به‌عنوان «ورودی مدل» و با علت تفاوت با حکم مرکزی نشان داده می‌شود.', 'small muted')]);
    return ctx.group([head, res, whyP, trace, cons, hist]);
  }
  TK.define({
    id: 'trade-center', title: 'Trading dashboard centre', sections: ['desk'], priority: -200, version: 1, storeKey: KEY, noFile: true,
    summary: 'One decision page fed by the central signal engine: market overview, priority actions, opportunities by readiness (confirmed, awaiting confirmation, probable bottom, none), the 15 trading fields per asset, gold and coin floors and ceilings with coin bubbles, why there is no buy, cross-module consistency, alerts and the market-aware schedule.',
    sample: sample, blank: sample, run: run, scenarios: false,
    eyebrow: function () { return 'Trading · Decision centre'; }, heading: function () { return 'مرکز داشبورد معاملاتی'; }, filename: function () { return 'Trading_center'; },
    kpis: function (ctx) { var R = function () { return ctx.R; }, cnt = function (t) { return R().recs.filter(function (r) { return r.tier === t; }).length; }; return [
      ['Confirmed buys', function () { return fa(cnt('ok'), 0); }, function () { return 'از ' + fa(R().recs.length, 0) + ' دارایی بررسی‌شده'; }],
      ['Awaiting confirmation', function () { return fa(cnt('wait'), 0); }, function () { return 'نزدیک کف: ' + fa(cnt('floor'), 0); }],
      ['Sell / exit', function () { return fa(R().recs.filter(function (r) { return r.sell === 'confirmed' || (r.held && /^(close|sell|reduce)$/.test(r.act)); }).length, 0); }, function () { return 'محدودهٔ سقف: ' + fa(R().recs.filter(function (r) { return r.sell === 'inZone'; }).length, 0); }],
      ['New alerts', function () { var A = Hub.alerts ? Hub.alerts.load() : null; return fa(A ? A.log.filter(function (e) { return e.state === 'new'; }).length : 0, 0); }, function () { var u = U.store.get('hub.updrun.v1', null); return u && u.doneAt ? 'به‌روزرسانی ' + ago(u.doneAt) : 'به‌روزرسانی نشده'; }]]; },
    tabs: [{ group: 'بخش ۱ · داشبورد جامع', items: [['dash', 'داشبورد جامع بازارها', W(dash18)], ['cmp', 'مقایسه و فهرست پایش', W(cmpTab)], ['hist', 'تاریخچه و عملکرد فرصت‌ها', W(histTab)]] },
      { group: 'بخش ۲ · مرکز اعلان‌ها', items: [['inbox', 'صندوق اقدام‌ها (خرید، فروش، …)', W(inboxTab)], ['alerts', 'تاریخچه و تنظیمات اعلان', W(alertsTab)]] },
      { group: 'بخش ۳ · تحلیل بازارها', items: [['gold', 'طلا و سکه', W(goldTab18)], ['fx', 'ارز', W(fxTab)], ['crypto', 'رمزارز', W(cryptoTab)], ['bourse', 'بورس و فرابورس', W(bourseTab)], ['other', 'کالا و سایر بازارها', W(otherTab)], ['cycles', 'چرخه‌های زمانی و نقاط عطف', W(cyclesTab)]] },
      { group: 'نظارت', items: [['cov', 'پوشش داده و دریافت افزایشی', W(coverageTab)], ['why', 'چرا خرید نیست؟', W(whyTab)], ['integ', 'کنترل یکپارچگی سیستم', W(integrityTab)], ['sync', 'هماهنگی سیگنال‌ها', W(syncTab)], ['refresh', 'زمان‌بندی و پایش', W(refreshTab)]] }]
  });
  Hub.tradeCenter = { actionOf: actionOf, fields: fields, bubbles: bubbles, trendOf: trendOf };
  // the dashboard's best list and buy inbox, through the same row builders the page renders (directive 22 · 11)
  if (Hub.integrity) {
    var tcRows = function (pick) { return function () { var X = Hub.tradeUI && Hub.tradeUI.engineMemo ? Hub.tradeUI.engineMemo() : null, C0 = X && X.central; if (!C0) return null; var R = { recs: Object.keys(C0.by).map(function (k) { return C0.by[k]; }) };
      return { at: C0.at, rows: pick(R).map(function (r) { var p = Hub.central.present(r); return { key: r.key, sym: r.sym, act: p.act, st: p.st, tier: p.tier, rank: p.rank, rankCls: p.rankCls, px: p.px, buy: p.buy, stop: p.stop, tp1: p.tp.length ? p.tp[0] : null, ver: p.ver }; }) }; }; };
    Hub.integrity.register('tc-best', 'داشبورد معاملاتی — بهترین فرصت‌های کل بازار', tcRows(function (R) { return bestRows(R, 15); }));
    Hub.integrity.register('tc-buy', 'مرکز اعلان‌ها — فرصت‌های خرید (تأییدشده)', tcRows(function (R) { return R.recs.filter(function (r) { return (r.cats || []).indexOf('buy') >= 0; }).sort(Hub.central.cmp); }));
  }
})(window);
