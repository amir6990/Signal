/* =====================================================================
 * SMART TRADING ALERTS — directive 17.
 * One source of truth: alerts are derived only from the central signal record (Hub.tradeEngine central verdict,
 * store hub.central.v1) and from fresh prices checked against the levels stored there. This module never decides
 * a buy or a sell on its own logic; it reports a change of the central verdict, or a price that reached a level the
 * central engine already published (entry zone, confirmation level, stop, target, probable bottom / top zone).
 *
 *   evaluateCentral(C)          C = full central record of an engine run → events (new confirmed buy / sell,
 *                               changed action, weakened / invalidated, bottom / top zone stages)
 *   evaluatePrices(map, meta)   map = { key: { px, at, src } } from the light price check → events (stop, target,
 *                               entry zone, confirmation level touched) and the keys that need a closer watch
 *   deliver(events)             dedup → history (hub.alerts.v1) → in-app toast → system notification (if allowed)
 *
 * Honest limits: a system notification needs the hub (browser tab or home-screen app) to be running; a phone that has
 * closed the app gets nothing until it is opened again (then a catch-up check runs). Sending to a closed app needs a
 * push server, which this hub does not have.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  var KEY = 'hub.alerts.v1';
  // importance (how urgent) — separate from the kind below; «پیش‌آگاهی» and «اطلاع‌رسانی» are kinds, not levels (directive 26 · 3)
  var LVL = { urgent: { fa: 'فوری', o: 0 }, critical: { fa: 'بسیار مهم', o: 1 }, important: { fa: 'مهم', o: 2 }, pre: { fa: 'عادی', o: 3 }, info: { fa: 'کم‌اهمیت', o: 4 } };
  /* directive 26 · 3 — two kinds of alert:
       اطلاع‌رسانی (notification): an event that HAS happened — a signal confirmed or withdrawn, a stop or target hit, a key level crossed,
                                   a significant price move, a change of the floor / ceiling state;
       پیش‌آگاهی (early warning):  the PROBABILITY of an event in the near future from current evidence — price near a confirmation level,
                                   inside a probable floor / ceiling zone, a time-cycle window. Never a trading instruction. */
  var KIND = { notif: 'اطلاع‌رسانی (رویداد رخ‌داده)', early: 'پیش‌آگاهی (احتمال رویداد)' };
  var KOF = { buyOk: 'notif', sellOk: 'notif', stop: 'notif', tp: 'notif', actChg: 'notif', reduce: 'notif', touch: 'notif', weak: 'notif', expired: 'notif', data: 'notif', watch: 'notif', cycInvalid: 'notif',
    move: 'notif', moveLive: 'notif', brk: 'notif', brkDn: 'notif', preBuy: 'early', preMove: 'early', preMoveDn: 'early', preBreak: 'early', preFloor: 'early', preCeil: 'early', cycEarly: 'early', cycSerious: 'early', cycConfirmed: 'early' };
  var TYPE = {
    buyOk: ['urgent', 'فرصت خرید تأیید شد', 'buy'], sellOk: ['urgent', 'فرصت فروش / خروج تأیید شد', 'sell'], stop: ['critical', 'حد ضرر فعال شد', 'sell'],
    tp: ['important', 'هدف سود محقق شد', 'sell'], actChg: ['important', 'اقدام پیشنهادی تغییر کرد', 'sell'], reduce: ['important', 'ذخیرهٔ سود / کاهش موقعیت', 'sell'],
    preMove: ['pre', 'پیش‌آگاهی: احتمال شروع حرکت صعودی (مدل یادگیرنده) — سیگنال خرید نیست', 'pre'], preMoveDn: ['pre', 'پیش‌آگاهی: احتمال شروع افت (مدل یادگیرنده) — برای دارندگان', 'pre'],
    preBuy: ['pre', 'در آستانهٔ فرصت خرید — در انتظار تأیید', 'pre'], preBreak: ['pre', 'در آستانهٔ شکست سطح تأیید صعود', 'pre'], preFloor: ['pre', 'در محدودهٔ احتمالی کف — برگشت هنوز تأیید نشده', 'pre'],
    preCeil: ['pre', 'در محدودهٔ احتمالی سقف — فروش هنوز تأیید نشده', 'pre'], touch: ['pre', 'قیمت به سطح کلیدی رسید — محاسبهٔ دوباره', 'pre'],
    weak: ['info', 'سیگنال تضعیف یا باطل شد', 'info'], expired: ['info', 'سیگنال منقضی شد', 'info'], data: ['info', 'نیازمند تأیید داده', 'info'],
    watch: ['important', 'دارایی تحت پایش: تغییر وضعیت کف یا سقف', 'pre'],
    // time-cycle engine (directive 21 + addendum): only the asset's own cycle that passed its own walk-forward test raises these
    cycEarly: ['info', 'چرخهٔ زمانی: هشدار اولیه — نزدیک پنجرهٔ زمانی حساس', 'pre'], cycSerious: ['important', 'چرخهٔ زمانی: هشدار جدی — چند چرخهٔ معتبر همین دارایی هم‌زمان', 'pre'],
    cycConfirmed: ['important', 'چرخهٔ زمانی: هشدار تأییدشده — قیمت هم سناریو را تأیید کرد', 'pre'], cycInvalid: ['info', 'چرخهٔ زمانی: ابطال هشدار', 'info'],
    // directive 26 · 1, 5, 8: price moves are events of their own — reported whether or not a buy is (still) confirmable
    move: ['important', 'حرکت مهم قیمت', 'move'], moveLive: ['important', 'جهش قیمت از آخرین تحلیل (قیمت لحظه‌ای؛ هنوز بسته نشده)', 'move'],
    brk: ['important', 'شکست مقاومت: بسته‌شدن بالای سقف ۲۰ جلسه', 'move'], brkDn: ['important', 'شکست حمایت: بسته‌شدن زیر کف ۲۰ جلسه', 'move'] };
  // floor / ceiling states of the central record (directive 18 · 2-3); the watchlist (hub.watch.v1) is alerted on every change into one of them
  var S4FA = { nearFloor: 'نزدیک کف احتمالی (برگشت تأیید نشده)', upConf: 'تأیید برگشت صعودی', nearCeil: 'نزدیک سقف احتمالی', dnConf: 'تأیید برگشت نزولی' };
  var CLSFA = { stock: 'سهام', fund: 'صندوق', gold: 'طلا و سکه', fx: 'ارز', crypto: 'رمزارز', commodity: 'کالا و انرژی', intl: 'شاخص‌های جهانی', option: 'اختیار معامله' };
  function U() { return Hub.util; }
  function isF(x) { return typeof x === 'number' && isFinite(x); }
  function fa(x, d) { if (!isF(x)) return '—'; var a = Math.abs(x), s = a >= 1000 ? Math.round(x).toLocaleString('en-US') : x.toFixed(d == null ? (a < 10 ? 2 : a < 100 ? 1 : 0) : d); return s.replace(/[0-9]/g, function (c) { return '۰۱۲۳۴۵۶۷۸۹'[c]; }).replace(/,/g, '٬').replace('.', '٫'); }
  function defaults() { return { on: true, buy: true, sell: true, pre: true, info: true, move: true, sys: true, cls: { stock: true, fund: true, gold: true, fx: true, crypto: true, commodity: true }, minConf: 0, nearPct: 1.5, quietFrom: 23, quietTo: 7, heldOnly: false }; }
  function load() { var S = (U() && U().store.get(KEY, null)) || {}; S.set = Object.assign(defaults(), S.set || {}); S.set.cls = Object.assign(defaults().cls, S.set.cls || {}); S.log = Array.isArray(S.log) ? S.log : []; S.sent = S.sent || {}; S.snap = S.snap || {}; S.stats = Object.assign({ n: 0, sys: 0, sysFail: 0 }, S.stats || {}); S.stats.byType = S.stats.byType || {}; S.px = S.px || {};
    // v2 (2026-11-18): alerts on crossings only; the level-state alerts of the first live test (hundreds of «touch») are cleared once
    if (S.v !== 2) { S.log = []; S.sent = {}; S.px = {}; S.v = 2; } return S; }
  function save(S) { try { var cut = Date.now() - 20 * 864e5; Object.keys(S.sent).forEach(function (k) { if (S.sent[k] < cut) delete S.sent[k]; }); S.log = S.log.slice(-500); U().store.set(KEY, S); } catch (e) { /* storage full: alerts still shown */ } }
  function tehranHour() { try { return +new Date().toLocaleString('en-US', { timeZone: 'Asia/Tehran', hour: '2-digit', hour12: false }) % 24; } catch (e) { return new Date().getHours(); } }

  // the fields every alert carries (directive 17 · 4), taken from the central record — nothing invented
  function card(r, extra) {
    var L = r.L || r.lv || {}, buy = L.buy, tp = L.tp || [];
    return Object.assign({ key: r.key, sym: r.sym, cls: r.cls, mk: CLSFA[r.cls] || r.cls, sid: r.sid || null, act: r.actFa || '', st: r.stFa || '', tier: r.tierFa || '', px: r.px,
      zone: buy && isF(buy[0]) ? [buy[0], buy[1]] : null, up: isF(L.upConf) ? L.upConf : L.up, dn: isF(L.dnConf) ? L.dnConf : L.dn, stop: L.stop, tp1: tp[0], tp2: tp[1], rr: isF(r.rr) ? r.rr : L.rr,
      hz: r.hz || '', conf: r.conf, why: r.why || r.rcWhy || '', inv: isF(L.inv) ? 'بسته‌شدن ' + (r.tier === 'ok' ? 'زیر ' + fa(L.stop) : 'بالای ' + fa(L.inv)) : isF(L.stop) ? 'بسته‌شدن زیر ' + fa(L.stop) : '',
      dataAt: r.date || '', floor: L.floor || null, ceil: L.ceil || null, tzConf: L.tzConf }, extra || {});
  }
  // «next action» in one line (directive 17 · closing note): what to do now, not only what happened
  function nextAct(t, c) {
    switch (t) {
      case 'preMove': return 'تحت پایش قرار دهید؛ هنوز سیگنال خرید نیست — ورود فقط با تأیید حکم مرکزی (سطح تأیید) یا در محدودهٔ ورود طرح.';
      case 'preMoveDn': return 'اگر این دارایی را دارید: حد ضرر را نزدیک‌تر کنید یا بخشی را بفروشید؛ اگر ندارید، خرید نکنید.';
      case 'buyOk': return c.zone && isF(c.px) && c.px <= c.zone[1] && c.px >= c.zone[0] ? 'الان داخل محدودهٔ ورود است: پلهٔ اول را بخرید؛ حد ضرر ' + fa(c.stop) + '.' : c.zone ? 'ورود فقط در محدودهٔ ' + fa(c.zone[0]) + '–' + fa(c.zone[1]) + '؛ قیمت را تعقیب نکنید. حد ضرر ' + fa(c.stop) + '.' : 'جزئیات ورود را در داشبورد ببینید.';
      case 'sellOk': return 'اگر این دارایی را دارید: خروج (فروش) طبق سطح ' + (isF(c.dn) ? fa(c.dn) : '—') + '؛ اگر ندارید، خرید نکنید.';
      case 'stop': return 'حد ضرر ' + fa(c.stop) + ' شکسته شد: موقعیت را ببندید؛ منتظر برگشت نمانید.';
      case 'tp': return 'یک‌سوم موقعیت را بفروشید و حد ضرر باقی را به نقطهٔ ورود ببرید.';
      case 'reduce': return 'بخشی از سود را ذخیره کنید و حد ضرر باقی‌مانده را نزدیک کنید.';
      case 'preBuy': return 'هنوز خرید نکنید: منتظر تأیید (' + (isF(c.up) ? 'بسته‌شدن بالای ' + fa(c.up) : 'شرط ورود') + ') بمانید.';
      case 'preBreak': return 'منتظر بسته‌شدن جلسه بالای ' + fa(c.up) + ' بمانید؛ لمس لحظه‌ای تأیید نیست.';
      case 'preFloor': return 'خرید نکنید تا برگشت تأیید شود (بسته‌شدن بالای ' + fa(c.tzConf) + ').';
      case 'preCeil': return 'اگر دارید: ذخیرهٔ بخشی از سود یا حد ضرر متحرک؛ فروش کامل فقط با بسته‌شدن زیر ' + fa(c.tzConf) + '.';
      case 'touch': return 'قیمت لحظه‌ای به سطح رسید؛ تأیید یا ابطال پس از محاسبهٔ دوباره با دادهٔ پایانی اعلام می‌شود.';
      case 'weak': return 'اقدام قبلی دیگر معتبر نیست؛ وضعیت جدید را در داشبورد ببینید.';
      case 'cycEarly': case 'cycSerious': case 'cycConfirmed': return c.cy && c.cy.win ? 'پنجرهٔ احتمالی ' + c.cy.win.typeFa + ': ' + fd(c.cy.win.a) + ' تا ' + fd(c.cy.win.b) + '. هشدار زمانی دستور معامله نیست؛ با قیمت و سایر موتورها بسنجید.' : '';
      case 'cycInvalid': return 'پیش‌بینی زمانی قبلی دیگر معتبر نیست.';
      case 'move': case 'moveLive': case 'brk': return c.entry ? (c.entry.k === 'passed' ? 'قیمت را تعقیب نکنید: ' + c.entry.fa + '.' : c.entry.k === 'in' ? 'قیمت داخل محدودهٔ ورود طرح مرکزی است؛ اقدام فقط طبق حکم مرکزی (' + (c.act || c.tier || '—') + ').' : c.entry.fa + '؛ حرکت قیمت به‌تنهایی سیگنال خرید نیست.') : 'حرکت قیمت به‌تنهایی سیگنال خرید یا فروش نیست؛ حکم مرکزی را ببینید.';
      case 'brkDn': return 'اگر دارید: حد ضرر و طرح خروج را بررسی کنید؛ شکست حمایت به‌تنهایی دستور فروش نیست مگر حکم مرکزی آن را تأیید کند.';
      case 'watch': return c.s4 === 'nearFloor' ? 'هنوز خرید نکنید؛ شرط تأیید: بسته‌شدن بالای ' + fa(c.tzConf) + '.' : c.s4 === 'upConf' ? 'برگشت صعودی تأیید شد؛ وضعیت سیگنال را در مرکز اعلان‌ها ببینید.' : c.s4 === 'nearCeil' ? 'اگر دارید: ذخیرهٔ بخشی از سود را بررسی کنید.' : c.s4 === 'dnConf' ? 'اگر دارید: خروج یا کاهش طبق سطح تأیید نزولی.' : '';
      default: return '';
    }
  }
  function pctS(x) { return isF(x) ? (x > 0 ? '+' : '') + fa(x * 100, 1) + '٪' : '—'; }
  // what drove the move, in one sentence (decomposition from the central record)
  function dcxTxt(d) { var o = d && d.o; if (!o) return '';
    var p = function (x) { return isF(x) ? pctS(Math.exp(x) - 1) : 'نامعلوم'; };
    if (d.k === 'usdt') return 'تفکیک: دلار آزاد ' + p(o.dollar) + (o.worldKnown ? '، قیمت جهانی تتر ' + p(o.world) : '، قیمت جهانی تتر (USDT/USD) دریافت نشده') + '، فاصلهٔ تتر از دلار ' + p(o.spread) + '.';
    if (d.k === 'gold') return 'تفکیک: اونس ' + p(o.ounce) + '، دلار ' + p(o.dollar) + '، حباب ' + p(o.bubble) + ' (حباب از ' + pctS(o.bub0) + ' به ' + pctS(o.bub1) + ').';
    if (d.k === 'fund') return isF(o.nav) ? 'تفکیک: NAV ' + p(o.nav) + '، فاصلهٔ قیمت از NAV ' + p(o.premium) + ' (اکنون ' + pctS(o.prem1) + ').' : 'NAV ابتدای دوره ثبت نشده (تاریخچهٔ NAV از این نسخه جمع می‌شود)؛ فاصلهٔ فعلی قیمت از NAV ' + pctS(o.prem1) + '.';
    return ''; }
  function fd(d) { return root.Hub && Hub.mktCal && Hub.mktCal.faDate ? Hub.mktCal.faDate(d) : String(d); }
  // horizon of each alert type (directive 26 · 4): the plan's horizon for the buy / sell plan, the turning-zone window for floor / ceiling, the move's own window for a move
  var HZS = { preFloor: 1, preCeil: 1, watch: 1, touchTz: 1 }, DIRS = { buyOk: 1, preBuy: 1, preBreak: 1, preFloor: 1, brk: 1, tp: 0 }, DIRD = { sellOk: 1, stop: 1, preCeil: 1, reduce: 1, brkDn: 1 };
  function hzOf(t, r, c) {
    if (t === 'move' || t === 'moveLive' || t === 'brk' || t === 'brkDn') return { c: 'E', fa: c.mvH ? 'رویداد گذشته: ' + fa(c.mvH, 0) + (r.cls === 'crypto' ? ' روز' : ' جلسه') + ' اخیر' : 'رویداد گذشته (از آخرین تحلیل)' };
    if (/^cyc/.test(t)) return { c: 'C', fa: (r.cyc && r.cyc.hz) || 'افق چرخهٔ زمانی' };
    if (t === 'preMove' || t === 'preMoveDn') return { c: 'S', fa: 'کوتاه‌مدت — شروع حرکت در ۵ جلسهٔ آینده، تا ۱۰ جلسه' };
    if (HZS[t]) { var w = r.L && r.L.win; return { c: 'S', fa: 'کوتاه‌مدت — پنجرهٔ کف / سقف احتمالی' + (w && w.from ? ' (' + fd(w.from) + ' تا ' + fd(w.to) + ')' : '') }; }
    return { c: r.hzc || 'M', fa: r.hz || 'افق طرح معاملاتی' }; }
  function condOf(t, c, r) { var L = r.L || {}, z = c.zone, f = L.floor, g = L.ceil;
    switch (t) {
      case 'preBuy': case 'preBreak': return { ok: isF(c.up) ? 'بسته‌شدن جلسه بالای ' + fa(c.up) : 'شرط ورود طرح', no: isF(c.stop) ? 'بسته‌شدن زیر ' + fa(c.stop) : z ? 'بسته‌شدن زیر ' + fa(z[0]) : '—' };
      case 'preFloor': return { ok: isF(c.tzConf) ? 'بسته‌شدن بالای ' + fa(c.tzConf) : '—', no: f && isF(f[0]) ? 'بسته‌شدن زیر کف محدوده ' + fa(Math.min(f[0], f[1])) : '—' };
      case 'preCeil': return { ok: isF(c.tzConf) ? 'بسته‌شدن زیر ' + fa(c.tzConf) + ' (برگشت نزولی)' : '—', no: g && isF(g[0]) ? 'بسته‌شدن بالای سقف محدوده ' + fa(Math.max(g[0], g[1])) : '—' };
      case 'preMove': case 'preMoveDn': return { ok: 'شروع حرکت مهم (' + (t === 'preMove' ? 'صعود' : 'افت') + ' ≥ ۲٫۵ برابر نوسان معمول) در ۵ جلسهٔ آینده', no: 'نبود چنین حرکتی تا ۱۵ جلسه؛ یا بسته‌شدن ' + (t === 'preMove' ? 'زیر' : 'بالای') + ' قیمت مبنا به اندازهٔ ۲ برابر نوسان' };
      case 'buyOk': return { ok: 'تأییدشده', no: isF(c.stop) ? 'بسته‌شدن زیر ' + fa(c.stop) : '—' };
      case 'move': case 'moveLive': case 'brk': case 'brkDn': return { ok: 'رویداد رخ داده است (شرط تأیید ندارد)', no: '—' };
      default: return { ok: '—', no: c.inv || '—' }; } }
  function ev(t, r, extra, why) { var c = card(r, extra), T = TYPE[t]; c.t = t; c.lvl = T[0]; c.lvlFa = LVL[T[0]].fa; c.title = T[1]; c.side = T[2]; c.next = nextAct(t, c); c.reason = why || c.why; c.at = Date.now();
    c.kind = KOF[t] || 'notif'; c.kindFa = KIND[c.kind]; var hz = hzOf(t, r, c); c.hzc = hz.c; c.hzFa = hz.fa;
    c.dirFa = c.dir === 1 || DIRS[t] ? 'صعودی' : c.dir === -1 || DIRD[t] ? 'نزولی' : '—';
    c.confFa = isF(r.conf) ? 'امتیاز اطمینان مدل ' + fa(r.conf, 0) + '٪ (امتیاز قاعده‌محور؛ احتمال کالیبره‌شده نیست)' : '—';
    var cd = condOf(t, c, r); c.okCond = cd.ok; c.noCond = cd.no;
    var cen = U() && U().store.get('hub.central.v1', null); c.mver = r.mv || (cen && cen.by && cen.by[r.key] && cen.by[r.key].mv) || ''; c.cenAt = (cen && cen.at) || null; c.dataD = r.date || '';
    c.event = c.kind === 'early' ? 'مورد انتظار: ' + (t === 'preCeil' ? 'برگشت نزولی از محدودهٔ سقف احتمالی' : t === 'preFloor' ? 'برگشت صعودی از محدودهٔ کف احتمالی' : /^cyc/.test(t) ? 'نقطهٔ عطف زمانی' : 'تأیید صعود (بسته‌شدن بالای سطح تأیید)') : 'رخ‌داده: ' + T[1];
    return c; }

  /* ---- 1 · full layer: compare the new central verdict with the previous one ---- */
  function evaluateCentral(C, fresh) {
    var S = load(), out = [], by = (C && C.by) || {}, first = !Object.keys(S.snap).length, w0 = U().store.get('hub.watch.v1', null), WL = w0 && Array.isArray(w0.keys) ? w0.keys : [];
    var mv = [], pre = [], PRE_MAX = 15, np = (S.set.nearPct || 1.5) / 100;
    function moveEvents(r, mine, list) { var m = r.mvx, MV = Hub.moves; if (!m || !m.h || !MV) return;
      // noise control: many shares and funds → only «strong» moves (rank ≥ 99th percentile of their own history) unless held / watched;
      // gold, FX, crypto and commodities (few series) from «significant»; illiquid shares never on their own
      var big = r.cls === 'stock' || r.cls === 'fund', need = big && !mine ? 3 : 2, b = m.h.filter(function (o) { return o.h === m.best; })[0];
      if (big && !mine && r.liqOK === false) return;
      var X = { mvx: m, mvH: b && b.h, dir: m.dir, entry: MV.entryOf(r), sl: r.sl || null, dcx: r.dcx || null };
      if (m.lv >= need && b) list.push({ z: Math.abs(b.z), e: ev('move', r, X, (m.dir > 0 ? 'افزایش ' : 'کاهش ') + pctS(b.r) + ' در ' + fa(b.h, 0) + (r.cls === 'crypto' ? ' روز' : ' جلسه') + ' (' + fa(Math.abs(b.z), 1) + ' برابر نوسان معمول خود دارایی' + (b.rk != null ? '؛ بزرگ‌تر از ' + fa(b.rk * 100, 0) + '٪ حرکت‌های هم‌اندازهٔ تاریخچه‌اش' : '') + ')' + (isF(m.volR) ? '؛ حجم ' + fa(m.volR, 1) + ' برابر میانهٔ ۲۰ جلسه' : '') + '. ' + dcxTxt(r.dcx)) });
      if (m.brkNew && m.brk && (!big || mine || m.lv >= 1)) list.push({ z: 2 + (b ? Math.abs(b.z) / 10 : 0), e: ev(m.brk > 0 ? 'brk' : 'brkDn', r, X, 'بسته‌شدن ' + fa(r.px) + (m.brk > 0 ? ' بالای سقف' : ' زیر کف') + ' ۲۰ جلسهٔ قبل (' + fa(m.brkLv) + ').') });
    }
    Object.keys(by).forEach(function (k) {
      var r = by[k].key ? by[k] : Object.assign({ key: k }, by[k]), p = S.snap[k] || null, held = !!r.held, stale = fresh && fresh[r.cls] === false;
      // directive 26 · 1, 5, 8: important moves and breakouts of the closing data — on every run, also the first (an absolute event, not a change of state)
      if (!stale) moveEvents(r, held || WL.indexOf(k) >= 0, mv);
      if (!p && first) { S.snap[k] = { tier: r.tier, act: r.act, st: r.st, sell: r.sell, tzState: r.tzState, held: held, s4: r.st4 || r.s4 || null, cy: r.cyc ? r.cyc.lvl : r.cy ? r.cy.l : 'none' }; return; }   // the first run only records the baseline: nothing is «new» yet
      var was = p || {};
      if (r.tier === 'ok' && was.tier !== 'ok') out.push(ev(stale ? 'data' : 'buyOk', r, null, stale ? 'سیگنال خرید روی دادهٔ قدیمی؛ تا دریافت دادهٔ تازه قابل اقدام نیست.' : r.why));
      else if (was.tier === 'ok' && r.tier !== 'ok') out.push(ev(r.st === 'exp' ? 'expired' : 'weak', r, null, r.stFa + ' — ' + (r.rcWhy || r.why)));
      if (held && (r.act === 'close' || r.act === 'sell') && was.act !== r.act) out.push(ev(r.en === 'stop' ? 'stop' : 'sellOk', r, null, r.actWhy));
      else if (held && r.act === 'reduce' && was.act !== 'reduce') out.push(ev('reduce', r, null, r.actWhy));
      else if (!held && r.sell === 'confirmed' && was.sell !== 'confirmed') out.push(ev('sellOk', r, null, 'برگشت نزولی در محدودهٔ سقف احتمالی تأیید شد. ' + (r.actWhy || '')));
      var Lr = r.L || {}, upL = isF(Lr.upConf) ? Lr.upConf : r.lv && r.lv.up, nearUp = (r.tier === 'wait' || (r.tier === 'none' && r.rc === 'expired')) && !(r.rc === 'model' || r.rc === 'valNone' || r.rc === 'data') && isF(upL) && r.px < upL && upL / r.px - 1 <= np;
      /* a snapshot from before this rule has no nearUp: that run is its baseline (otherwise every asset already near its level fires at once);
         shares and funds that are neither held nor watched need adequate liquidity; at most PRE_MAX per run, the closest first */
      if (nearUp && was.nearUp === false && (!(r.cls === 'stock' || r.cls === 'fund') || held || WL.indexOf(k) >= 0 || r.liqOK !== false)) pre.push({ d: upL / r.px - 1, mine: held || WL.indexOf(k) >= 0, e: ev('preBreak', r, null, 'قیمت پایانی ' + fa(r.px) + ' در فاصلهٔ ' + pctS(upL / r.px - 1) + ' از سطح تأیید ' + fa(upL) + (r.rc === 'expired' ? ' (طرح قبلی منقضی شده؛ این سطح تأیید طرح تازه است)' : '') + '.') });
      if (r.tier === 'floor' && r.tzState === 'inZone' && was.tzState !== 'inZone') out.push(ev('preFloor', r));
      if (r.sell === 'inZone' && was.sell !== 'inZone') out.push(ev('preCeil', r));
      var s4 = r.st4 || r.s4 || null;
      if (WL.indexOf(k) >= 0 && s4 && S4FA[s4] && was.s4 !== undefined && was.s4 !== s4) out.push(ev('watch', r, { watch: true, s4: s4 }, 'وضعیت کف/سقف: ' + S4FA[s4] + '.'));
      // cycle levels: markets other than single shares / funds always; shares and funds only when held or on the watchlist
      var cy = r.cyc || (r.cy ? { lvl: r.cy.l, win: r.cy.w, st: r.cy.s } : null), cl = cy ? cy.lvl : 'none', pl = was.cy || 'none', cyOn = (r.cls !== 'stock' && r.cls !== 'fund') || held || WL.indexOf(k) >= 0;
      if (cyOn && was.cy !== undefined && cl !== pl) {
        if (cl === 'early' || cl === 'serious' || cl === 'confirmed') out.push(ev(cl === 'early' ? 'cycEarly' : cl === 'serious' ? 'cycSerious' : 'cycConfirmed', r, { watch: WL.indexOf(k) >= 0, cy: cy }, 'افق ' + ((r.cyc && r.cyc.hz) || '') + '؛ ' + ((r.cyc && r.cyc.stFa) || '') + '.'));
        else if (pl === 'early' || pl === 'serious' || pl === 'confirmed') out.push(ev('cycInvalid', r, { cy: cy }, 'سطح هشدار زمانی از «' + pl + '» به «' + cl + '» رسید.')); }
      var pv = S.snap[k] || {}; S.snap[k] = { tier: r.tier, act: r.act, st: r.st, sell: r.sell, tzState: r.tzState, held: held, s4: s4, cy: cl, nearUp: !!nearUp, pmU: pv.pmU, pmD: pv.pmD };   // pmU / pmD: the learned warning's previous state (set below)
    });
    // directive 26 · 8: priority by importance and size; at most 25 move events per run, the rest counted in one line of the log
    mv.sort(function (a, b) { return LVL[a.e.lvl].o - LVL[b.e.lvl].o || b.z - a.z; }); mv.slice(0, 25).forEach(function (q) { out.push(q.e); }); if (mv.length > 25) S.mvOver = { at: Date.now(), n: mv.length - 25 };
    // directive 27: the active learned version's pre-move warnings (on newly; the down side only for held or watched assets)
    var pm = []; Object.keys(by).forEach(function (k) { var r = by[k], q = r.pm; if (!q) return; var held = !!r.held, watch = WL.indexOf(k) >= 0, was = (S.snap && S.snap[k]) || {};
      ['up', 'dn'].forEach(function (d) { var x = q[d]; if (!x) return; var key = d === 'up' ? 'pmU' : 'pmD'; if (S.snap && S.snap[k]) S.snap[k][key] = !!x.on;
        if (!x.on || was[key] !== false) return; if (d === 'dn' && !held && !watch) return; if ((r.cls === 'stock' || r.cls === 'fund') && !held && !watch && r.liqOK === false) return;
        var e = ev(d === 'up' ? 'preMove' : 'preMoveDn', r, null, 'امتیاز مدل ' + Math.round(100 * x.p) + '٪ در برابر آستانهٔ ' + Math.round(100 * x.thr) + '٪ (نسخهٔ ' + x.ver + ')' + (x.why && x.why.length ? '؛ نشانه‌ها: ' + x.why.join('، ') : '') + '.'); e.ver = x.ver; e.pmSig = x.sig; e.pmP = x.p; pm.push({ p: x.p - x.thr, mine: held || watch, e: e }); }); });
    pm.sort(function (a, b) { return (b.mine - a.mine) || b.p - a.p; }); pm.slice(0, 15).forEach(function (q) { out.push(q.e); });
    pre.sort(function (a, b) { return (b.mine - a.mine) || a.d - b.d; }); pre.slice(0, PRE_MAX).forEach(function (q) { out.push(q.e); }); S.preOver = pre.length > PRE_MAX ? { at: Date.now(), n: pre.length - PRE_MAX } : null;
    S.cenAt = C && C.at || null; S.cenRun = Date.now();   // which central version the alert baseline reflects (directive 22 · 11, test 6)
    save(S); return out;
  }

  /* ---- 2 · light layer: a fresh price against the levels the central engine published ---- */
  function evaluatePrices(map, meta) {
    // keep the latest live quote per asset: Hub.central.entryNow checks every displayed buy against it
    try { var LQ = U().store.get('hub.livepx.v1', null) || { by: {} }, now0 = Date.now(); Object.keys(map || {}).forEach(function (k) { var q = map[k]; if (q && q.px > 0) LQ.by[k] = [q.px, q.at || now0]; }); LQ.at = now0; U().store.set('hub.livepx.v1', LQ); } catch (e) { /* optional */ }
    var S = load(), cen = U().store.get('hub.central.v1', null), by = cen && cen.by || {}, out = [], near = [], touched = [], np = (S.set.nearPct || 1.5) / 100;
    // a level matters only where the central verdict can still turn into a trade: blocked by the model gate, by data or by an ended setup → no pre-alert
    var BLOCK = { model: 1, valNone: 1, data: 1, expired: 1 };
    Object.keys(map || {}).forEach(function (k) {
      var q = map[k], r0 = by[k]; if (!r0 || !q || !(q.px > 0)) return;
      var r = Object.assign({ key: k }, r0, { px: q.px, L: r0.lv ? { buy: r0.lv.buy, stop: r0.lv.stop, tp: r0.lv.tp, upConf: r0.lv.up, dnConf: r0.lv.dn, floor: r0.lv.floor, ceil: r0.lv.ceil, tzConf: r0.lv.tzConf } : {} }), L = r.L, px = q.px, held = !!r0.held, live = r0.tier === 'ok' || held;
      var prev = S.px[k] && S.px[k].sid === (r0.sid || '') ? S.px[k].px : null; S.px[k] = { px: px, at: q.at || Date.now(), sid: r0.sid || '' };
      var w = function (lv) { return isF(lv) && Math.abs(px / lv - 1) <= np; }, X = { pxSrc: q.src, pxAt: q.at };
      if (w(L.stop) || w(L.upConf) || w(L.tzConf) || (L.tp && w(L.tp[0])) || (L.buy && (w(L.buy[0]) || w(L.buy[1])))) near.push(k);
      // directive 26 · 1, 8: a jump of the live price since the last analysis, scaled by the asset's own daily volatility (σ of the central record)
      var sg = r0.mvx && r0.mvx.sig, lr = r0.px > 0 ? Math.log(px / r0.px) : NaN, zl = isF(sg) && sg > 0 ? lr / sg : NaN, bigL = r0.cls === 'stock' || r0.cls === 'fund';
      if (isF(zl) && Math.abs(zl) >= (bigL && !held ? 3.5 : 2.5) && !(bigL && !held && r0.liqOK === false)) out.push(ev('moveLive', r, Object.assign({ dir: zl > 0 ? 1 : -1, entry: Hub.moves ? Hub.moves.entryOf(r) : null }, X), 'قیمت لحظه‌ای ' + fa(px) + ' نسبت به قیمت آخرین تحلیل ' + fa(r0.px) + ' ' + pctS(px / r0.px - 1) + ' (' + fa(Math.abs(zl), 1) + ' برابر نوسان روزانهٔ معمول خود دارایی)؛ با دادهٔ پایانی دوباره بررسی می‌شود.'));
      if (prev == null) return;   // first observation of this signal: recorded, nothing has crossed yet
      // events fire on a crossing between two checks, not on a state that already held
      var up = function (lv) { return isF(lv) && prev < lv && px >= lv; }, dn = function (lv) { return isF(lv) && prev > lv && px <= lv; }, into = function (z) { return z && isF(z[0]) && !(prev >= z[0] && prev <= z[1]) && px >= z[0] && px <= z[1]; };
      var open = (r0.tier === 'wait' && !BLOCK[r0.rc]) || (r0.tier === 'none' && r0.rc === 'expired' && isF(L.upConf));   // directive 26 · 5: an expired setup with a new confirmation level keeps its early warning
      if (live && dn(L.stop)) { out.push(ev('stop', r, X, 'قیمت ' + fa(px) + ' به حد ضرر ' + fa(L.stop) + ' رسید.')); touched.push(k); return; }
      if (live && L.tp && up(L.tp[0])) { out.push(ev('tp', r, X, 'قیمت ' + fa(px) + ' به هدف اول ' + fa(L.tp[0]) + ' رسید.')); touched.push(k); }
      if (open && up(L.upConf)) { out.push(ev('touch', r, X, 'قیمت ' + fa(px) + ' از سطح تأیید صعود ' + fa(L.upConf) + ' گذشت (هنوز بسته نشده).')); touched.push(k); }
      else if (open && into(L.buy)) out.push(ev('preBuy', r, X, 'قیمت ' + fa(px) + ' وارد محدودهٔ ورود ' + fa(L.buy[0]) + '–' + fa(L.buy[1]) + ' شد؛ شرط تأیید هنوز برقرار نیست.'));
      else if (open && w(L.upConf) && px < L.upConf && Math.abs(prev / L.upConf - 1) > np) out.push(ev('preBreak', r, X, 'قیمت ' + fa(px) + ' به فاصلهٔ کمتر از ' + fa(S.set.nearPct, 1) + '٪ از سطح تأیید ' + fa(L.upConf) + ' رسید.'));
      if (r0.tier === 'floor' && up(L.tzConf)) { out.push(ev('touch', r, X, 'قیمت ' + fa(px) + ' از سطح تأیید برگشت ' + fa(L.tzConf) + ' گذشت؛ تأیید با بسته‌شدن.')); touched.push(k); }
      if (L.ceil && up(L.ceil[0]) && r0.sell !== 'inZone') out.push(ev('preCeil', r, X, 'قیمت ' + fa(px) + ' وارد محدودهٔ سقف احتمالی ' + fa(L.ceil[0]) + '–' + fa(L.ceil[1]) + ' شد.'));
    });
    save(S);
    return { events: out, near: near, touched: touched, meta: meta || null };
  }

  /* ---- 3 · delivery: dedup, history, toast, system notification ---- */
  function idOf(e) { if (e.t === 'move' || e.t === 'brk' || e.t === 'brkDn') return [e.key, e.t, (e.mvx && e.mvx.d) || '', e.dir || ''].join('|'); if (e.t === 'moveLive') return [e.key, e.t, new Date(e.at).toISOString().slice(0, 10), e.dir || ''].join('|');
    var lv = e.t === 'stop' ? e.stop : e.t === 'tp' ? e.tp1 : e.t === 'preBreak' || e.t === 'touch' ? e.up || e.tzConf : e.t === 'preFloor' || e.t === 'preCeil' ? e.tzConf : ''; return [e.key, e.t, e.sid || '', isF(lv) ? Math.round(lv) : ''].join('|') + (e.t === 'watch' ? '|' + e.s4 : ''); }
  function allowed(S, e) {
    var s = S.set; if (!s.on) return false; if (e.watch) return true;   // the user asked to watch this asset: class and side switches do not mute it
    if (s.cls && s.cls[e.cls] === false) return false;
    if (e.side === 'buy' && !s.buy) return false; if (e.side === 'sell' && !s.sell && e.t !== 'stop') return false; if ((e.side === 'pre') && !s.pre) return false; if (e.side === 'info' && !s.info) return false; if (e.side === 'move' && s.move === false) return false;
    if (s.minConf && isF(e.conf) && e.conf < s.minConf && e.side !== 'sell') return false; return true;
  }
  function quiet(S, e) { var s = S.set, h = tehranHour(); if (e.lvl === 'urgent' || e.lvl === 'critical') return false; return s.quietFrom > s.quietTo ? (h >= s.quietFrom || h < s.quietTo) : (h >= s.quietFrom && h < s.quietTo); }
  function sysNotify(e, S) {
    if (!S.set.sys || typeof Notification === 'undefined' || Notification.permission !== 'granted' || quiet(S, e)) return Promise.resolve(false);
    var body = [e.mk + ' · ' + (e.act || e.tier), 'قیمت ' + fa(e.px) + (e.zone ? ' · ورود ' + fa(e.zone[0]) + '–' + fa(e.zone[1]) : '') + (isF(e.stop) ? ' · حد ضرر ' + fa(e.stop) : '') + (isF(e.tp1) ? ' · هدف ۱ ' + fa(e.tp1) : ''), e.next].filter(Boolean).join('\n');
    var opt = { body: body, tag: e.id, renotify: e.lvl === 'urgent' || e.lvl === 'critical', requireInteraction: e.lvl === 'urgent' || e.lvl === 'critical', data: { url: './desk.html#trade-center', key: e.key }, dir: 'rtl', lang: 'fa' };
    var t = e.lvlFa + ' · ' + e.title + ' — ' + e.sym;
    var sw = root.navigator && navigator.serviceWorker && navigator.serviceWorker.getRegistration ? navigator.serviceWorker.getRegistration() : Promise.resolve(null);
    return sw.then(function (reg) { if (reg && reg.showNotification) return reg.showNotification(t, opt).then(function () { return true; }); new Notification(t, opt); return true; }).catch(function () { return false; });
  }
  function deliver(events) {
    var S = load(), fresh = [], now = Date.now();
    (events || []).forEach(function (e) { e.id = idOf(e); var ttl = e.side === 'pre' || e.t === 'touch' ? 864e5 : 5 * 864e5; if (S.sent[e.id] && now - S.sent[e.id] < ttl) return; if (!allowed(S, e)) return; S.sent[e.id] = now; fresh.push(e); });
    fresh.sort(function (a, b) { return LVL[a.lvl].o - LVL[b.lvl].o; });
    fresh.forEach(function (e) { e.state = 'new'; S.log.push(e); S.stats.n++; S.stats.byType[e.t] = (S.stats.byType[e.t] || 0) + 1; });
    save(S);
    // toasts: urgent ones one by one, the rest grouped so the urgent ones are not lost (directive 17 · 11)
    var T = U() && U().toast; if (T) { var hi = fresh.filter(function (e) { return e.lvl === 'urgent' || e.lvl === 'critical'; }), lo = fresh.length - hi.length;
      hi.slice(0, 3).forEach(function (e) { T(e.lvlFa + ': ' + e.title + ' — ' + e.sym + '. ' + e.next, 'warn'); }); if (lo) T(fa(lo, 0) + ' اعلان دیگر (پیش‌آگاهی / اطلاع‌رسانی) در «مرکز اعلان‌ها».', 'good'); }
    return fresh.reduce(function (p, e) { return p.then(function () { return sysNotify(e, S).then(function (ok) { e.sys = ok ? 'sent' : (S.set.sys ? 'not-sent' : 'off'); if (ok) S.stats.sys++; else if (S.set.sys) S.stats.sysFail++; }); }); }, Promise.resolve())
      .then(function () { var S2 = load(); fresh.forEach(function (e) { var x = S2.log.filter(function (y) { return y.id === e.id && y.at === e.at; })[0]; if (x) x.sys = e.sys; }); S2.stats = S.stats; save(S2); return fresh; });
  }
  // a later central verdict marks earlier alerts as still actionable or not (directive 17 · 8)
  /* directive 26 · 4: every alert is checked against the CURRENT central record — the claim it made (a zone, a level, a verdict) is re-tested
     with the latest levels, so an alert issued on an earlier run is marked stale instead of contradicting the dashboard */
  function check(e) {
    var c = U().store.get('hub.central.v1', null), r = c && c.by && c.by[e.key], at = c && c.at ? new Date(c.at).toLocaleString('fa-IR-u-nu-arabext', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'numeric' }) : '—';
    if (!r) return { k: 'gone', fa: 'نامشخص (دارایی در محاسبهٔ اخیر نیست)' };
    var L = r.lv || {}, px = r.px, inZ = function (z) { return z && isF(z[0]) && px >= Math.min(z[0], z[1]) && px <= Math.max(z[0], z[1]); }, zs = function (z) { return fa(Math.min(z[0], z[1])) + '–' + fa(Math.max(z[0], z[1])); }, tierFa = ({ ok: 'تأییدشده', wait: 'در انتظار تأیید', floor: 'محدودهٔ کف', none: 'فاقد فرصت', pos: 'موقعیت باز' })[r.tier] || '—';
    var hzNote = e.hzc && e.hzc !== (r.hzc || 'M') ? ' · افق متفاوت: حکم مرکزی ' + (r.hz || 'میان‌مدت') + ' = ' + tierFa : '';
    switch (e.t) {
      case 'preCeil': return !L.ceil ? { k: 'stale', fa: 'منقضی: در محاسبهٔ ' + at + ' محدودهٔ سقف احتمالی تعریف نشده است' } : inZ(L.ceil) ? { k: 'valid', fa: 'هنوز معتبر: قیمت ' + fa(px) + ' داخل محدودهٔ سقف احتمالی ' + zs(L.ceil) + hzNote } : { k: 'stale', fa: 'منقضی: با محاسبهٔ ' + at + ' سقف احتمالی ' + zs(L.ceil) + ' است و قیمت ' + fa(px) + ' داخل آن نیست' + hzNote };
      case 'preFloor': return !L.floor ? { k: 'stale', fa: 'منقضی: در محاسبهٔ ' + at + ' محدودهٔ کف احتمالی تعریف نشده است' } : inZ(L.floor) ? { k: 'valid', fa: 'هنوز معتبر: قیمت داخل محدودهٔ کف احتمالی ' + zs(L.floor) + hzNote } : { k: 'stale', fa: 'منقضی: کف احتمالی فعلی ' + zs(L.floor) + '؛ قیمت ' + fa(px) + hzNote };
      case 'preBuy': case 'preBreak': case 'touch': return r.tier === 'ok' ? { k: 'done', fa: 'رخ داد: خرید تأیید شد (' + at + ')' } : isF(L.up) && px < L.up ? { k: 'valid', fa: 'هنوز معتبر: منتظر بسته‌شدن بالای ' + fa(L.up) + ' (' + tierFa + ')' } : isF(L.up) ? { k: 'stale', fa: 'منقضی: قیمت ' + fa(px) + ' از سطح تأیید ' + fa(L.up) + ' گذشته ولی خرید تأیید نشد — ' + (r.why || tierFa).slice(0, 90) } : { k: 'stale', fa: 'منقضی: سطح تأیید در محاسبهٔ ' + at + ' وجود ندارد' };
      case 'buyOk': return r.tier === 'ok' ? { k: 'valid', fa: 'هنوز قابل اقدام' } : { k: 'stale', fa: 'دیگر قابل اقدام نیست: ' + r.stFa };
      case 'sellOk': case 'stop': case 'reduce': return { k: 'info', fa: r.held ? r.actFa : 'اطلاعی (دارایی در پرتفوی ثبت نشده)' };
      case 'move': case 'moveLive': case 'brk': case 'brkDn': return { k: 'event', fa: 'رویداد رخ‌داده؛ حکم فعلی: ' + tierFa + (r.tier !== 'ok' && r.why ? ' — ' + r.why.slice(0, 80) : '') };
      default: return { k: 'info', fa: r.tier ? 'وضعیت فعلی: ' + tierFa : '—' }; } }
  function statusOf(e) { return check(e).fa; }
  /* consistency audit (directive 26 · 4, 9): active alerts vs the current verdict. Opposite directions on the SAME horizon from the same
     central run are a system error; on different horizons they are allowed but must be labelled */
  function audit() {
    var S = load(), c = U().store.get('hub.central.v1', null), cut = Date.now() - 3 * 864e5, act = S.log.filter(function (e) { return e.at >= cut; }), out = { n: act.length, stale: [], conflicts: [], hz: [], at: c && c.at };
    var up = { buyOk: 1, preBuy: 1, preBreak: 1, preFloor: 1 }, dn = { sellOk: 1, preCeil: 1, stop: 1 };
    act.forEach(function (e) { var k = check(e), r = c && c.by && c.by[e.key]; if (k.k === 'stale') out.stale.push({ e: e, why: k.fa }); if (!r || k.k === 'stale') return;
      var eDir = up[e.t] ? 1 : dn[e.t] ? -1 : 0, rDir = r.tier === 'ok' || r.tier === 'wait' ? 1 : r.sell === 'confirmed' ? -1 : 0; if (!eDir || !rDir || eDir === rDir) return;
      var same = (e.hzc || 'M') === (r.hzc || 'M'), row = { sym: e.sym, alert: e.title, alertHz: e.hzFa || '', verdict: (r.tierFa || r.tier) + ' / ' + (r.actFa || ''), verdictHz: r.hz || 'میان‌مدت', sameRun: e.cenAt && c && e.cenAt === c.at };
      if (same) out.conflicts.push(row); else out.hz.push(row); });
    return out; }
  /* early warnings graded by what happened next (directive 26 · 8): within 10 sessions of the alert, did the expected event occur?
     getRows(key) → daily rows [{date, close}] of the central engine. Stored on the alert as e.out. */
  function grade(getRows) {
    var S = load(), n = 0, gi = function (ms) { var d = new Date(ms + 3.5 * 36e5); return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); };
    S.log.forEach(function (e) { if ((KOF[e.t] || 'notif') !== 'early' && e.t !== 'move' && e.t !== 'moveLive') return; if (e.out && e.out.k !== 'pending') return; var rows = getRows(e.key); if (!rows || !rows.length) return;
      var d0 = gi(e.at), after = rows.filter(function (q) { return q.date > d0; }).slice(0, 10), hit = null, lv;
      if (e.t === 'move' || e.t === 'moveLive') { if (after.length >= 5 && isF(e.px)) { var r5 = after[4].close / e.px - 1; e.out = { k: (e.dir || 0) * r5 > 0 ? 'cont' : 'rev', r5: r5, d: after[4].date }; n++; } return; }
      if (e.t === 'preMove' || e.t === 'preMoveDn') { var dd = e.t === 'preMove' ? 1 : -1, sg = e.pmSig || 0.02, a15 = rows.filter(function (q) { return q.date > d0; }).slice(0, 15); a15.forEach(function (q, j) { if (!hit && isF(e.px) && dd * Math.log(q.close / e.px) / (sg * Math.sqrt(j + 1)) >= 2.5) hit = q; });
        e.out = hit ? { k: 'occurred', d: hit.date, after: a15.indexOf(hit) + 1 } : a15.length >= 15 ? { k: 'not', d: a15[14].date } : { k: 'pending', n: a15.length }; n++; return; }
      after.forEach(function (q) { if (hit) return;
        if ((e.t === 'preBreak' || e.t === 'preBuy') && isF(lv = e.up) && q.close >= lv) hit = q;
        else if (e.t === 'preFloor' && isF(lv = e.tzConf) && q.close >= lv) hit = q;
        else if (e.t === 'preCeil' && isF(lv = e.tzConf) && q.close <= lv) hit = q;
        else if (/^cyc/.test(e.t)) hit = null; });
      if (/^cyc/.test(e.t)) return;
      e.out = hit ? { k: 'occurred', d: hit.date, after: after.indexOf(hit) + 1 } : after.length >= 10 ? { k: 'not', d: after[9].date } : { k: 'pending', n: after.length }; n++; });
    if (n) save(S); var st = {}; S.log.forEach(function (e) { if (!e.out) return; var x = st[e.t] = st[e.t] || { n: 0, occurred: 0, not: 0, pending: 0, cont: 0, rev: 0 }; x.n++; x[e.out.k] = (x[e.out.k] || 0) + 1; }); return st; }
  /* missed opportunities (directive 26 · 5-7, 8): recent significant rises and whether a warning came before them; when none did, the cause from
     the ledger state at the start of the move — data (stale / missing), threshold (gated by validation or confidence), decision logic (expired /
     entry passed), model (no setup), alert logic (a pre-alertable state existed but no warning was sent), delay (warning came after the move began) */
  function missed() {
    var S = load(), c = U().store.get('hub.central.v1', null), C = Hub.central, out = []; if (!c || !c.by) return out;
    var ms = function (d) { return Date.UTC(Math.floor(d / 1e4), Math.floor(d / 100) % 100 - 1, d % 100) - 3.5 * 36e5; };
    Object.keys(c.by).forEach(function (k) { var r = c.by[k], m = r.mvx; if (!m || !m.h || m.dir !== 1 || m.lv < 2 || r.cls === 'option') return;
      var b = m.h.filter(function (o) { return o.h === m.best; })[0]; if (!b || !b.d0) return;
      var t0 = ms(b.d0) + 9 * 36e5, t1 = ms(m.d) + 12.5 * 36e5, prior = S.log.filter(function (e) { return e.key === k && /^(buyOk|preBuy|preBreak|preFloor|move|moveLive|brk)$/.test(e.t); });
      var before = prior.filter(function (e) { return e.at >= t0 - 10 * 864e5 && e.at <= t0 + 36e5 * 4; }), during = prior.filter(function (e) { return e.at > t0 + 36e5 * 4; });
      var st0 = C && C.asOf ? C.asOf(C.aidOf ? C.aidOf(k) : k, t0) : null, cause, fa0;
      if (before.length) { cause = 'warned'; fa0 = 'پیش از حرکت هشدار داده شد: ' + before[before.length - 1].title; }
      else if (!st0) { var H0 = C && C.ledger ? C.ledger(C.aidOf ? C.aidOf(k) : k) : [], f0 = H0 && H0.length ? H0[0].at : null; cause = f0 && f0 > t0 ? 'nohist' : 'data'; fa0 = cause === 'nohist' ? 'علت قابل تعیین نیست: دفتر سیگنال این دستگاه برای این دارایی از ' + new Date(f0).toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' }) + ' آغاز شده و حکمِ آغاز حرکت ثبت نشده است' : 'در آغاز حرکت حکمی برای این دارایی ثبت نشده بود، در حالی که دفتر سیگنال پیش‌تر وجود داشت (داده یا به‌روزرسانی در آن روزها انجام نشده بود)'; }
      else if (st0.c && st0.c.tier === 'ok') { cause = 'alert'; fa0 = 'حکم مرکزی خرید تأییدشده بود ولی اعلانی پیش از حرکت ثبت نشد (منطق اعلان)'; }
      else if (st0.c && st0.c.tier === 'wait') { cause = 'threshold'; fa0 = 'طرح «در انتظار تأیید» بود؛ تأیید پیش از حرکت برقرار نشد (آستانهٔ تأیید سخت‌گیرانه یا قیمت از سطح تأیید جهید)'; }
      else if (st0.c && st0.c.st === 'exp') { cause = 'logic'; fa0 = 'طرح قبلی منقضی بود و تا شکل‌گیری طرح تازه پیش‌آگاهی صادر نمی‌شد (منطق تصمیم — در این نسخه اصلاح شد)'; }
      else if (st0.c && /^(rej|cond)$/.test(st0.c.st)) { cause = 'threshold'; fa0 = 'سیگنال به‌دلیل دروازهٔ اعتبارسنجی یا اطمینان «مشروط / ردشده» بود (آستانه)'; }
      else { cause = 'model'; fa0 = 'مدل الگوی ورود معتبری پیش از حرکت نساخته بود (خطای مدل یا حرکت بدون نشانهٔ فنی)'; }
      var first = during.concat(before).sort(function (a, b) { return a.at - b.at; })[0], delay = first ? (first.at - t1) / 36e5 : NaN;
      out.push({ key: k, sym: r.sym, cls: r.cls, h: b.h, r: b.r, z: b.z, lv: m.lv, d0: b.d0, d1: m.d, cause: cause, why: fa0, firstAlert: first ? { t: first.title, at: first.at } : null, delayH: delay, tier: r.tierFa || r.tier, entry: Hub.moves ? Hub.moves.entryOf(r) : null }); });
    return out.sort(function (a, b) { return b.lv - a.lv || Math.abs(b.z) - Math.abs(a.z); }); }
  function requestPermission() { if (typeof Notification === 'undefined') return Promise.resolve('unsupported'); if (Notification.permission !== 'default') return Promise.resolve(Notification.permission); return Notification.requestPermission(); }
  function markRead() { var S = load(); S.log.forEach(function (e) { e.state = 'read'; }); save(S); }

  Hub.alerts = { KIND: KIND, KOF: KOF, check: check, audit: audit, grade: grade, missed: missed, quiet: function (e) { return quiet(load(), e); }, allowed: function (e) { return allowed(load(), e); }, KEY: KEY, LVL: LVL, TYPE: TYPE, load: load, save: save, defaults: defaults, evaluateCentral: evaluateCentral, evaluatePrices: evaluatePrices, deliver: deliver, statusOf: statusOf, requestPermission: requestPermission, markRead: markRead, card: card, nextAct: nextAct };
})(typeof window !== 'undefined' ? window : globalThis);
