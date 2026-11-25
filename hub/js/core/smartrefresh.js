/* =====================================================================
 * SMART REFRESH & SIGNAL MONITORING — directive 16.
 * Two layers, one schedule per market (Tehran time):
 *   light  — fresh prices only (TSETMC market watch: every listed symbol in one call; TGJU live board), checked against
 *            the levels the central engine already published. Cheap, so it runs often, and more often when a price
 *            is close to an entry, confirmation, stop or target level.
 *   full   — every source + back-test validation + engine recompute (Hub.updateAll), then the central verdict is
 *            compared with the previous one. Runs at the end of each market's day and when the light layer sees a
 *            level touched (at most once per «minimum gap»).
 * Every run is stamped; failures are kept; a price that fails the sanity checks never produces an actionable alert.
 * Limits stated, not hidden: this runs while the hub is open (a tab, the desktop app or the home-screen app in the
 * foreground). Browsers pause timers in the background; when the hub is opened again a catch-up check runs at once.
 * Data are end-of-check prices: what happened between two checks is not seen (TSETMC gives the last trade, not ticks).
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  if (!root.document) return;
  var SKEY = 'hub.smartref.v1', STKEY = 'hub.smartref.state';
  var MK = { tse: 'بورس و فرابورس (سهام، صندوق‌ها)', tgju: 'طلا، سکه و ارز (TGJU)', full: 'به‌روزرسانی کامل و محاسبهٔ دوباره', eod: 'بازبینی پایان روز' };
  function U() { return Hub.util; }
  function defaults() {
    return { on: true, tse: { open: '09:00', close: '12:30', light: 10, near: 5 }, tgju: { from: '08:00', to: '22:00', light: 15, near: 5, days: [0, 1, 2, 3, 4, 5] },
      eodTse: '13:15', eodTgju: '21:30', fullOnEvent: true, minFullGap: 30, fullEod: true };
  }
  function set() { var s = Object.assign(defaults(), (U() && U().store.get(SKEY, null)) || {}); s.tse = Object.assign(defaults().tse, s.tse || {}); s.tgju = Object.assign(defaults().tgju, s.tgju || {}); return s; }
  function st() { var s = (U() && U().store.get(STKEY, null)) || {}; s.last = s.last || {}; s.err = s.err || {}; s.next = s.next || {}; s.near = s.near || []; s.log = Array.isArray(s.log) ? s.log : []; s.m = s.m || { checks: 0, events: 0, full: 0, lagMin: [] }; return s; }
  function saveSt(s) { s.log = s.log.slice(-200); s.m.lagMin = (s.m.lagMin || []).slice(-200); try { U().store.set(STKEY, s); } catch (e) { /* ignore */ } }
  // Tehran clock: day of week (0 = Saturday) and minutes since midnight
  function teh() { var d = new Date(), p = {}; try { new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tehran', weekday: 'short', hour: '2-digit', minute: '2-digit', year: 'numeric', month: '2-digit', day: '2-digit', hour12: false }).formatToParts(d).forEach(function (x) { p[x.type] = x.value; }); } catch (e) { return null; }
    var wd = { Sat: 0, Sun: 1, Mon: 2, Tue: 3, Wed: 4, Thu: 5, Fri: 6 }[p.weekday], h = +p.hour % 24, m = +p.minute; return { wd: wd, min: h * 60 + m, g: +p.year * 10000 + +p.month * 100 + +p.day, hm: ('0' + h).slice(-2) + ':' + ('0' + m).slice(-2) }; }
  function mins(hm) { var a = String(hm || '0:0').split(':'); return (+a[0] || 0) * 60 + (+a[1] || 0); }
  // a TSE session day: Saturday–Wednesday and not an official holiday (the market calendar knows the holidays; lunar ones ±1 day)
  function tseDay(T) { if (!T || T.wd > 4) return false; var MC = Hub.mktCal; if (!MC || !MC.nextSessions) return true;
    try { var y = new Date(Date.UTC(Math.floor(T.g / 10000), Math.floor(T.g / 100) % 100 - 1, T.g % 100) - 864e5), yg = y.getUTCFullYear() * 10000 + (y.getUTCMonth() + 1) * 100 + y.getUTCDate(); return MC.nextSessions('stock', yg, 1)[0] === T.g; } catch (e) { return true; } }
  function marketState(T, s) { T = T || teh(); if (!T) return {};
    var tseOpen = tseDay(T) && T.min >= mins(s.tse.open) && T.min <= mins(s.tse.close), tgOpen = s.tgju.days.indexOf(T.wd) >= 0 && T.min >= mins(s.tgju.from) && T.min <= mins(s.tgju.to);
    return { T: T, tse: tseOpen, tseDay: tseDay(T), tgju: tgOpen }; }
  function log(S, m, ok, txt) { S.log.push({ at: Date.now(), m: m, ok: ok, t: txt }); if (ok) { S.last[m] = Date.now(); delete S.err[m]; } else S.err[m] = { at: Date.now(), t: txt }; }

  /* ---- light layer ---- */
  function tsePrices() {
    var D = Hub.data, St = U().store.get('hub.sigstocks.v1', null); if (!D || !D.tse || !D.tse.session) return Promise.reject(new Error('ماژول داده در دسترس نیست'));
    return D.tse.session().then(function (ses) { var by = ses && (ses.by || ses.rows || ses) || {}, out = {}, bad = [], code = {};
      ((St && St.watch) || []).forEach(function (w) { if (w.insCode) code[String(w.insCode)] = w.symbol; });
      Object.keys(by).forEach(function (ic) { var q = by[ic], sym = code[ic]; if (!sym || !q) return; var px = q.last > 0 ? q.last : q.close;
        // sanity: a price, a trade today, and a move within the widest daily limit (± 10% plus a margin) — else not used for alerts
        if (!(px > 0)) return; if (!(q.trades > 0)) { bad.push(sym + ': بدون معامله (توقف یا بی‌معامله)'); return; } if (q.yclose > 0 && Math.abs(px / q.yclose - 1) > 0.12) { bad.push(sym + ': تغییر غیرعادی ' + Math.round((px / q.yclose - 1) * 100) + '٪'); return; }
        out['s:' + sym] = { px: px, at: Date.now(), src: 'TSETMC (آخرین معامله' + (q.hEven ? '، ساعت ' + String(q.hEven).padStart(6, '0').replace(/(\d\d)(\d\d)\d\d/, '$1:$2') : '') + ')' }; });
      return { map: out, bad: bad, n: Object.keys(out).length }; });
  }
  function tgjuPrices(T) {
    var D = Hub.data; if (!D || !D.tgjuNow) return Promise.reject(new Error('ماژول داده در دسترس نیست'));
    return D.tgjuNow().then(function (cur) { var out = {}, bad = [];
      var cen = U().store.get('hub.central.v1', null), want = cen && cen.by || {};   // only the instruments the engine analyses
      Object.keys(cur || {}).forEach(function (k) { var q = cur[k]; if (!want['g:' + k] || !q || !(q.close > 0)) return; if (T && q.date !== T.g) { bad.push(k + ': قیمت امروز نیست (' + q.date + ')'); return; } out['g:' + k] = { px: q.close, at: Date.now(), src: 'TGJU (ساعت ' + (q.time || '—') + ')' }; });
      return { map: out, bad: bad, n: Object.keys(out).length }; });
  }

  var BUSY = false;
  function light(m, S, T) {
    var p = m === 'tse' ? tsePrices() : tgjuPrices(T);
    return p.then(function (r) { var A = Hub.alerts, res = A ? A.evaluatePrices(r.map, { m: m }) : { events: [], near: [], touched: [] };
      S.m.checks++; S.near = (S.near || []).filter(function (k) { return k.indexOf(m === 'tse' ? 's:' : 'g:') !== 0; }).concat(res.near);
      log(S, m, true, fa(r.n) + ' قیمت بررسی شد' + (r.bad.length ? '؛ ' + fa(r.bad.length) + ' قیمت کنار گذاشته شد (اعتبارسنجی)' : '') + (res.events.length ? '؛ ' + fa(res.events.length) + ' رویداد' : ''));
      if (res.events.length) { S.m.events += res.events.length; if (A) A.deliver(res.events); }
      return res; }).catch(function (e) { log(S, m, false, String(e && e.message || e).slice(0, 160)); return { events: [], near: [], touched: [] }; });
  }
  function fa(n) { return String(n).replace(/[0-9]/g, function (c) { return '۰۱۲۳۴۵۶۷۸۹'[c]; }); }
  function full(S, why) {
    if (!Hub.updateAll || (Hub.updateBusy && Hub.updateBusy())) return false;
    /* never on a phone (2026-11-24, iPhone crash loop): a full update re-runs the back-test validation of every asset and needs ≈ 2 GB of
       memory; iOS kills the page, the home-screen app reopens, the catch-up run starts again — «A problem repeatedly occurred». On a phone
       only the light price checks run; the full run (and its validation) comes from the computer through the data sync. */
    if (U().lite && U().lite()) { if (!S.liteSkip || Date.now() - S.liteSkip > 6 * 36e5) { S.liteSkip = Date.now(); log(S, 'full', true, 'روی گوشی اجرا نشد (' + why + '): به‌روزرسانی کامل و اعتبارسنجی برای حافظهٔ گوشی سنگین است؛ نتیجهٔ کامل از کامپیوتر می‌رسد'); saveSt(S); } return false; }
    S.m.full++; log(S, 'full', true, 'شروع: ' + why); saveSt(S);
    return Hub.updateAll(null, null, function () { var S2 = st(); S2.last.full = Date.now(); saveSt(S2); afterFull(); });
  }
  // after any full update (scheduled, event-driven or the user's own button): recompute the central verdict and compare it with the last one
  function afterFull() {
    // directive 27: the learning cycle after a full update (computer only), at most once a day; its result is offered for release, not forced
    try { var LR = Hub.learnRun, LS = LR && LR.load(), lc = LS && LS.cycles.length ? LS.cycles[LS.cycles.length - 1].at : 0; if (LR && !(U().lite && U().lite()) && Date.now() - lc > 20 * 36e5) setTimeout(function () { LR.run({ auto: true }).catch(function () { /* logged in the cycle */ }); }, 4000); } catch (e) { /* optional */ }
    try { var R = Hub.tradeUI && Hub.tradeUI.engineNow ? Hub.tradeUI.engineNow(true) : null, X = R && R.X; if (!X || X.sample || !X.central) return;
      var fresh = freshness(); var evs = Hub.alerts ? Hub.alerts.evaluateCentral(X.central, fresh) : []; if (evs.length && Hub.alerts) Hub.alerts.deliver(evs);
      var S = st(); S.evalAt = Date.now(); S.evalUpd = (U().store.get('hub.updrun.v1', null) || {}).doneAt || null; log(S, 'eval', true, 'حکم مرکزی بازمحاسبه شد؛ ' + fa(evs.length) + ' رویداد'); saveSt(S);
    } catch (e) { var S3 = st(); log(S3, 'eval', false, 'محاسبهٔ دوباره ناموفق: ' + e.message); saveSt(S3); }
  }
  // per market: is the stored data fresh enough for an actionable alert?
  function freshness() { var out = {}, SG = Hub.signals, f = function (id) { return (SG && SG.feeds || []).filter(function (x) { return x.id === id; })[0]; };
    var age = function (key) { var x = U().store.get(key, null); return x && x.meta && x.meta.asOfTs ? (Date.now() - x.meta.asOfTs) / 36e5 : NaN; }, mx = SG && SG.maxAgeH ? SG.maxAgeH() : 96;
    var a1 = age('hub.sigstocks.v1'), a2 = age('hub.sig-gold.v1'), a3 = age('hub.sig-fx.v1'), a4 = age('hub.sigglobal.v1');
    out.stock = out.fund = !(a1 > mx); out.gold = !(a2 > mx); out.fx = !(a3 > mx); out.crypto = out.commodity = !(a4 > mx); return out; }

  function due(last, everyMin) { return !last || Date.now() - last >= everyMin * 60e3 - 15e3; }
  function tick(reason) {
    if (BUSY) return; var s = set(); if (!s.on) return; var S = st(), T = teh(); if (!T) return; var M = marketState(T, s), jobs = [];
    // a full update that finished since the last check (any trigger, also the user's button) → compare the central verdict
    var run = U().store.get('hub.updrun.v1', null); if (run && run.doneAt && run.doneAt !== S.evalUpd && !(Hub.updateBusy && Hub.updateBusy())) afterFull();
    var nearT = (S.near || []).some(function (k) { return k.indexOf('s:') === 0; }), nearG = (S.near || []).some(function (k) { return k.indexOf('g:') === 0; });
    if (M.tse && due(S.last.tse, nearT ? s.tse.near : s.tse.light)) jobs.push(['tse']);
    if (M.tgju && due(S.last.tgju, nearG ? s.tgju.near : s.tgju.light)) jobs.push(['tgju']);
    // end-of-day review: once per day after each market's own end time
    var eodT = M.tseDay && T.min >= mins(s.eodTse) && S.eodTse !== T.g, eodG = s.tgju.days.indexOf(T.wd) >= 0 && T.min >= mins(s.eodTgju) && S.eodTgju !== T.g;
    // a full update already done after today's end-of-day time counts as the review (no second heavy run)
    var at = function (hm) { return Date.now() - (T.min - mins(hm)) * 60e3; }, lastFull = Math.max(S.last.full || 0, run && run.doneAt || 0);
    if (eodT && lastFull >= at(s.eodTse)) { S.eodTse = T.g; eodT = false; } if (eodG && lastFull >= at(s.eodTgju)) { S.eodTgju = T.g; eodG = false; }
    S.next = { tse: M.tse ? (S.last.tse || Date.now()) + (nearT ? s.tse.near : s.tse.light) * 60e3 : null, tgju: M.tgju ? (S.last.tgju || Date.now()) + (nearG ? s.tgju.near : s.tgju.light) * 60e3 : null };
    if (!jobs.length && !(s.fullEod && (eodT || eodG))) { saveSt(S); return; }
    BUSY = true;
    jobs.reduce(function (p, j) { return p.then(function (acc) { return light(j[0], S, T).then(function (r) { return acc.concat(r.touched || []); }); }); }, Promise.resolve([]))
      .then(function (touched) {
        var gapOk = due(S.last.full, s.minFullGap);
        if (s.fullEod && (eodT || eodG) && gapOk) { if (eodT) S.eodTse = T.g; if (eodG) S.eodTgju = T.g; full(S, 'بازبینی پایان روز ' + (eodT ? 'بورس' : 'طلا و ارز')); }
        else if (s.fullOnEvent && touched.length && gapOk) { full(S, 'رسیدن قیمت به سطح کلیدی: ' + touched.slice(0, 5).map(function (k) { return k.slice(2); }).join('، ')); }
        saveSt(S);
      }).catch(function () { saveSt(S); }).then(function () { BUSY = false; });
  }
  function active() { var s = set(); return !!s.on; }
  var timer = null;
  function start() { if (timer) return; timer = setInterval(function () { try { tick('timer'); } catch (e) { BUSY = false; } }, 60e3);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') setTimeout(function () { try { tick('visible'); } catch (e) { BUSY = false; } }, 3000); });
    setTimeout(function () { try { tick('open'); } catch (e) { BUSY = false; } }, 20000); }
  Hub.smartRefresh = { light: function (m) { var S = st(); return light(m, S).then(function (r) { saveSt(S); return r; }); }, SKEY: SKEY, STKEY: STKEY, MK: MK, defaults: defaults, set: set, state: st, saveState: saveSt, marketState: marketState, teh: teh, tick: tick, active: active, afterFull: afterFull, freshness: freshness, light: function (m) { var S = st(); return light(m, S, teh()).then(function (r) { saveSt(S); return r; }); } };
  if (Hub.util) start(); else root.addEventListener('load', start);
})(typeof window !== 'undefined' ? window : globalThis);
