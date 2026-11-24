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
  var LVL = { urgent: { fa: 'فوری', o: 0 }, critical: { fa: 'بسیار مهم', o: 1 }, important: { fa: 'مهم', o: 2 }, pre: { fa: 'پیش‌آگاهی', o: 3 }, info: { fa: 'اطلاع‌رسانی', o: 4 } };
  var TYPE = {
    buyOk: ['urgent', 'فرصت خرید تأیید شد', 'buy'], sellOk: ['urgent', 'فرصت فروش / خروج تأیید شد', 'sell'], stop: ['critical', 'حد ضرر فعال شد', 'sell'],
    tp: ['important', 'هدف سود محقق شد', 'sell'], actChg: ['important', 'اقدام پیشنهادی تغییر کرد', 'sell'], reduce: ['important', 'ذخیرهٔ سود / کاهش موقعیت', 'sell'],
    preBuy: ['pre', 'در آستانهٔ فرصت خرید — در انتظار تأیید', 'pre'], preBreak: ['pre', 'در آستانهٔ شکست سطح تأیید صعود', 'pre'], preFloor: ['pre', 'در محدودهٔ احتمالی کف — برگشت هنوز تأیید نشده', 'pre'],
    preCeil: ['pre', 'در محدودهٔ احتمالی سقف — فروش هنوز تأیید نشده', 'pre'], touch: ['pre', 'قیمت به سطح کلیدی رسید — محاسبهٔ دوباره', 'pre'],
    weak: ['info', 'سیگنال تضعیف یا باطل شد', 'info'], expired: ['info', 'سیگنال منقضی شد', 'info'], data: ['info', 'نیازمند تأیید داده', 'info'],
    watch: ['important', 'دارایی تحت پایش: تغییر وضعیت کف یا سقف', 'pre'],
    // time-cycle engine (directive 21 + addendum): only the asset's own cycle that passed its own walk-forward test raises these
    cycEarly: ['info', 'چرخهٔ زمانی: هشدار اولیه — نزدیک پنجرهٔ زمانی حساس', 'pre'], cycSerious: ['important', 'چرخهٔ زمانی: هشدار جدی — چند چرخهٔ معتبر همین دارایی هم‌زمان', 'pre'],
    cycConfirmed: ['important', 'چرخهٔ زمانی: هشدار تأییدشده — قیمت هم سناریو را تأیید کرد', 'pre'], cycInvalid: ['info', 'چرخهٔ زمانی: ابطال هشدار', 'info'] };
  // floor / ceiling states of the central record (directive 18 · 2-3); the watchlist (hub.watch.v1) is alerted on every change into one of them
  var S4FA = { nearFloor: 'نزدیک کف احتمالی (برگشت تأیید نشده)', upConf: 'تأیید برگشت صعودی', nearCeil: 'نزدیک سقف احتمالی', dnConf: 'تأیید برگشت نزولی' };
  var CLSFA = { stock: 'سهام', fund: 'صندوق', gold: 'طلا و سکه', fx: 'ارز', crypto: 'رمزارز', commodity: 'کالا و انرژی', intl: 'شاخص‌های جهانی', option: 'اختیار معامله' };
  function U() { return Hub.util; }
  function isF(x) { return typeof x === 'number' && isFinite(x); }
  function fa(x, d) { if (!isF(x)) return '—'; var a = Math.abs(x), s = a >= 1000 ? Math.round(x).toLocaleString('en-US') : x.toFixed(d == null ? (a < 10 ? 2 : a < 100 ? 1 : 0) : d); return s.replace(/[0-9]/g, function (c) { return '۰۱۲۳۴۵۶۷۸۹'[c]; }).replace(/,/g, '٬').replace('.', '٫'); }
  function defaults() { return { on: true, buy: true, sell: true, pre: true, info: true, sys: true, cls: { stock: true, fund: true, gold: true, fx: true, crypto: true, commodity: true }, minConf: 0, nearPct: 1.5, quietFrom: 23, quietTo: 7, heldOnly: false }; }
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
      case 'watch': return c.s4 === 'nearFloor' ? 'هنوز خرید نکنید؛ شرط تأیید: بسته‌شدن بالای ' + fa(c.tzConf) + '.' : c.s4 === 'upConf' ? 'برگشت صعودی تأیید شد؛ وضعیت سیگنال را در مرکز اعلان‌ها ببینید.' : c.s4 === 'nearCeil' ? 'اگر دارید: ذخیرهٔ بخشی از سود را بررسی کنید.' : c.s4 === 'dnConf' ? 'اگر دارید: خروج یا کاهش طبق سطح تأیید نزولی.' : '';
      default: return '';
    }
  }
  function fd(d) { return root.Hub && Hub.mktCal && Hub.mktCal.faDate ? Hub.mktCal.faDate(d) : String(d); }
  function ev(t, r, extra, why) { var c = card(r, extra), T = TYPE[t]; c.t = t; c.lvl = T[0]; c.lvlFa = LVL[T[0]].fa; c.title = T[1]; c.side = T[2]; c.next = nextAct(t, c); c.reason = why || c.why; c.at = Date.now(); return c; }

  /* ---- 1 · full layer: compare the new central verdict with the previous one ---- */
  function evaluateCentral(C, fresh) {
    var S = load(), out = [], by = (C && C.by) || {}, first = !Object.keys(S.snap).length, w0 = U().store.get('hub.watch.v1', null), WL = w0 && Array.isArray(w0.keys) ? w0.keys : [];
    Object.keys(by).forEach(function (k) {
      var r = by[k].key ? by[k] : Object.assign({ key: k }, by[k]), p = S.snap[k] || null, held = !!r.held, stale = fresh && fresh[r.cls] === false;
      if (!p && first) { S.snap[k] = { tier: r.tier, act: r.act, st: r.st, sell: r.sell, tzState: r.tzState, held: held, s4: r.st4 || r.s4 || null, cy: r.cyc ? r.cyc.lvl : r.cy ? r.cy.l : 'none' }; return; }   // the first run only records the baseline: nothing is «new» yet
      var was = p || {};
      if (r.tier === 'ok' && was.tier !== 'ok') out.push(ev(stale ? 'data' : 'buyOk', r, null, stale ? 'سیگنال خرید روی دادهٔ قدیمی؛ تا دریافت دادهٔ تازه قابل اقدام نیست.' : r.why));
      else if (was.tier === 'ok' && r.tier !== 'ok') out.push(ev(r.st === 'exp' ? 'expired' : 'weak', r, null, r.stFa + ' — ' + (r.rcWhy || r.why)));
      if (held && (r.act === 'close' || r.act === 'sell') && was.act !== r.act) out.push(ev(r.en === 'stop' ? 'stop' : 'sellOk', r, null, r.actWhy));
      else if (held && r.act === 'reduce' && was.act !== 'reduce') out.push(ev('reduce', r, null, r.actWhy));
      else if (!held && r.sell === 'confirmed' && was.sell !== 'confirmed') out.push(ev('sellOk', r, null, 'برگشت نزولی در محدودهٔ سقف احتمالی تأیید شد. ' + (r.actWhy || '')));
      if (r.tier === 'floor' && r.tzState === 'inZone' && was.tzState !== 'inZone') out.push(ev('preFloor', r));
      if (r.sell === 'inZone' && was.sell !== 'inZone') out.push(ev('preCeil', r));
      var s4 = r.st4 || r.s4 || null;
      if (WL.indexOf(k) >= 0 && s4 && S4FA[s4] && was.s4 !== undefined && was.s4 !== s4) out.push(ev('watch', r, { watch: true, s4: s4 }, 'وضعیت کف/سقف: ' + S4FA[s4] + '.'));
      // cycle levels: markets other than single shares / funds always; shares and funds only when held or on the watchlist
      var cy = r.cyc || (r.cy ? { lvl: r.cy.l, win: r.cy.w, st: r.cy.s } : null), cl = cy ? cy.lvl : 'none', pl = was.cy || 'none', cyOn = (r.cls !== 'stock' && r.cls !== 'fund') || held || WL.indexOf(k) >= 0;
      if (cyOn && was.cy !== undefined && cl !== pl) {
        if (cl === 'early' || cl === 'serious' || cl === 'confirmed') out.push(ev(cl === 'early' ? 'cycEarly' : cl === 'serious' ? 'cycSerious' : 'cycConfirmed', r, { watch: WL.indexOf(k) >= 0, cy: cy }, 'افق ' + ((r.cyc && r.cyc.hz) || '') + '؛ ' + ((r.cyc && r.cyc.stFa) || '') + '.'));
        else if (pl === 'early' || pl === 'serious' || pl === 'confirmed') out.push(ev('cycInvalid', r, { cy: cy }, 'سطح هشدار زمانی از «' + pl + '» به «' + cl + '» رسید.')); }
      S.snap[k] = { tier: r.tier, act: r.act, st: r.st, sell: r.sell, tzState: r.tzState, held: held, s4: s4, cy: cl };
    });
    S.cenAt = C && C.at || null; S.cenRun = Date.now();   // which central version the alert baseline reflects (directive 22 · 11, test 6)
    save(S); return out;
  }

  /* ---- 2 · light layer: a fresh price against the levels the central engine published ---- */
  function evaluatePrices(map, meta) {
    var S = load(), cen = U().store.get('hub.central.v1', null), by = cen && cen.by || {}, out = [], near = [], touched = [], np = (S.set.nearPct || 1.5) / 100;
    // a level matters only where the central verdict can still turn into a trade: blocked by the model gate, by data or by an ended setup → no pre-alert
    var BLOCK = { model: 1, valNone: 1, data: 1, expired: 1 };
    Object.keys(map || {}).forEach(function (k) {
      var q = map[k], r0 = by[k]; if (!r0 || !q || !(q.px > 0)) return;
      var r = Object.assign({ key: k }, r0, { px: q.px, L: r0.lv ? { buy: r0.lv.buy, stop: r0.lv.stop, tp: r0.lv.tp, upConf: r0.lv.up, dnConf: r0.lv.dn, floor: r0.lv.floor, ceil: r0.lv.ceil, tzConf: r0.lv.tzConf } : {} }), L = r.L, px = q.px, held = !!r0.held, live = r0.tier === 'ok' || held;
      var prev = S.px[k] && S.px[k].sid === (r0.sid || '') ? S.px[k].px : null; S.px[k] = { px: px, at: q.at || Date.now(), sid: r0.sid || '' };
      var w = function (lv) { return isF(lv) && Math.abs(px / lv - 1) <= np; }, X = { pxSrc: q.src, pxAt: q.at };
      if (w(L.stop) || w(L.upConf) || w(L.tzConf) || (L.tp && w(L.tp[0])) || (L.buy && (w(L.buy[0]) || w(L.buy[1])))) near.push(k);
      if (prev == null) return;   // first observation of this signal: recorded, nothing has crossed yet
      // events fire on a crossing between two checks, not on a state that already held
      var up = function (lv) { return isF(lv) && prev < lv && px >= lv; }, dn = function (lv) { return isF(lv) && prev > lv && px <= lv; }, into = function (z) { return z && isF(z[0]) && !(prev >= z[0] && prev <= z[1]) && px >= z[0] && px <= z[1]; };
      var open = r0.tier === 'wait' && !BLOCK[r0.rc];
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
  function idOf(e) { var lv = e.t === 'stop' ? e.stop : e.t === 'tp' ? e.tp1 : e.t === 'preBreak' || e.t === 'touch' ? e.up || e.tzConf : e.t === 'preFloor' || e.t === 'preCeil' ? e.tzConf : ''; return [e.key, e.t, e.sid || '', isF(lv) ? Math.round(lv) : ''].join('|') + (e.t === 'watch' ? '|' + e.s4 : ''); }
  function allowed(S, e) {
    var s = S.set; if (!s.on) return false; if (e.watch) return true;   // the user asked to watch this asset: class and side switches do not mute it
    if (s.cls && s.cls[e.cls] === false) return false;
    if (e.side === 'buy' && !s.buy) return false; if (e.side === 'sell' && !s.sell && e.t !== 'stop') return false; if ((e.side === 'pre') && !s.pre) return false; if (e.side === 'info' && !s.info) return false;
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
  function statusOf(e) { var c = U().store.get('hub.central.v1', null), r = c && c.by && c.by[e.key]; if (!r) return 'نامشخص (دارایی در محاسبهٔ اخیر نیست)';
    if (e.side === 'buy') return r.tier === 'ok' ? 'هنوز قابل اقدام' : 'دیگر قابل اقدام نیست: ' + r.stFa; if (e.side === 'sell') return r.held ? r.actFa : 'اطلاعی'; return r.tier ? 'وضعیت فعلی: ' + ({ ok: 'تأییدشده', wait: 'در انتظار تأیید', floor: 'محدودهٔ کف', none: 'فاقد فرصت', pos: 'موقعیت باز' })[r.tier] : '—'; }
  function requestPermission() { if (typeof Notification === 'undefined') return Promise.resolve('unsupported'); if (Notification.permission !== 'default') return Promise.resolve(Notification.permission); return Notification.requestPermission(); }
  function markRead() { var S = load(); S.log.forEach(function (e) { e.state = 'read'; }); save(S); }

  Hub.alerts = { quiet: function (e) { return quiet(load(), e); }, allowed: function (e) { return allowed(load(), e); }, KEY: KEY, LVL: LVL, TYPE: TYPE, load: load, save: save, defaults: defaults, evaluateCentral: evaluateCentral, evaluatePrices: evaluatePrices, deliver: deliver, statusOf: statusOf, requestPermission: requestPermission, markRead: markRead, card: card, nextAct: nextAct };
})(typeof window !== 'undefined' ? window : globalThis);
