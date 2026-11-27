/* =====================================================================
 * CENTRAL REFERENCE — directive 22 «Global Data & Signal Consistency Framework» (2026-11-20).  Hub.central
 *
 * One asset → one analytic state → one central signal → one set of trading data, in every section.
 *   asset master    every covered asset with a unique, stable Asset ID (AID) that survives a change of symbol, name, market or class:
 *                   TSE instruments by their TSETMC insCode (TSE-<insCode>), TGJU series by key (TGJU-<key>), world markets by id
 *                   (GLB-<id>), options by contract insCode or symbol (OPT-…). Name, symbol, market, class, industry, instrument type,
 *                   active flag, data source and coverage state are kept with it (store hub.assets.v1).
 *   signal store    the central record of the last engine run (hub.central.v1, written by tradeengine.centralSave) — the only
 *                   source any page may show a verdict, level or rank from. Each record carries its AID, signal ID, version, created /
 *                   updated time, validity date and data state.
 *   ledger          every version of every signal, by AID (hub.sigledger.v1): what the verdict, levels and rank were and when they
 *                   changed — so the state at any past moment can be rebuilt.
 *   presenter       present(rec): the one normalised view of a record (verdict, rank, price, levels, version) that every page uses;
 *                   pages differ in layout, filters and detail, never in content.
 *   why-not         whyNot(key): why an asset is not shown as an opportunity (not covered, no data, excluded class, filter …).
 * Analysis models (the stock workshop score, the gold bubble, the FX spread, the options model …) are inputs of the engine; their own
 * labels are shown only as «model input», never as a signal.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  var CKEY = 'hub.central.v1', LKEY = 'hub.sigledger.v1', AKEY = 'hub.assets.v1', MAXV = 30;
  function U() { return Hub.util; }
  function isF(x) { return typeof x === 'number' && isFinite(x); }
  function st() { return U() && U().store; }

  /* ---------- asset master ---------- */
  var CLSFA = { stock: 'سهام', fund: 'صندوق', gold: 'طلا و سکه', fx: 'ارز', crypto: 'رمزارز', commodity: 'کالا و انرژی', intl: 'شاخص جهانی', option: 'اختیار معامله', index: 'شاخص' };
  var MAP = null;   // legacy key → AID (rebuilt with the master)
  function aidOf(key, hint) {
    if (!key) return null; if (MAP && MAP[key]) return MAP[key];
    var k = String(key), m;
    if ((m = /^s:(.+)$/.exec(k))) return hint && hint.insCode ? 'TSE-' + hint.insCode : 'TSE-SYM-' + m[1];
    if ((m = /^g:(.+)$/.exec(k))) return 'TGJU-' + m[1];
    if ((m = /^x:(.+)$/.exec(k))) return 'GLB-' + m[1];
    if ((m = /^o:(.+)$/.exec(k))) return hint && hint.insCode ? 'OPT-' + hint.insCode : 'OPT-SYM-' + m[1];
    if ((m = /^ix:(.+)$/.exec(k))) return 'IDX-' + m[1];
    return 'KEY-' + k;
  }
  function buildMaster() {
    var S = st(); if (!S) return null; var A = {}, map = {}, add = function (key, o) { if (Hub.universe && Hub.universe.outKey(key)) return; var aid = aidOf(key, o); var a = A[aid] = A[aid] || { aid: aid, keys: [] }; Object.keys(o).forEach(function (q) { if (o[q] != null && o[q] !== '') a[q] = o[q]; }); if (a.keys.indexOf(key) < 0) a.keys.push(key); map[key] = aid; };
    var R = Hub.tseRegistry && Hub.tseRegistry.get ? Hub.tseRegistry.get() : null, SS = S.get('hub.sigstocks.v1', null);
    // shares and funds: the watch list of the stock store (insCode is the stable id); the registry adds the official industry and fund type
    if (SS && SS.watch) SS.watch.forEach(function (w) { if (!w.symbol) return; var d = SS.data && SS.data[w.symbol], px = d && d.px || [], ri = w.insCode && R && R.ins ? R.ins[w.insCode] : null;
      add('s:' + w.symbol, { insCode: w.insCode || null, sym: w.symbol, name: w.name || (ri && ri.name) || w.symbol, market: w.market || (ri ? ({ 1: 'بورس', 2: 'فرابورس', 4: 'بازار پایه' })[ri.flow] || '' : ''), cls: w.ftype || /صندوق/.test(w.sector || '') ? 'fund' : 'stock',
        ind: w.csName || w.sector || '', indCode: w.cs || '', type: w.ftype ? 'fund-' + w.ftype : ri ? 'yVal-' + ri.yVal : '', active: w.active !== false, inWhy: w.inactiveWhy || '', src: 'TSETMC', rows: px.length, last: px.length ? px[px.length - 1].date : null, idStable: !!w.insCode }); });
    ['hub.sig-gold.v1', 'hub.sig-fx.v1'].forEach(function (k) { var T = S.get(k, null); if (!T || !T.ins) return; T.ins.forEach(function (x) { if (!x.key) return; var rows = T.data && T.data[x.key] || [];
      add('g:' + x.key, { sym: x.series, name: x.series, market: 'بازار آزاد (TGJU)', cls: /^price_(dollar|eur|aed|gbp|try|cny)|tether|usdt/i.test(x.key) ? 'fx' : 'gold', ind: k === 'hub.sig-gold.v1' ? 'طلا و سکه' : 'ارز', type: x.type || '', active: x.active !== false, src: 'TGJU', rows: rows.length, last: rows.length ? rows[rows.length - 1].date : null, idStable: true }); }); });
    if (Hub.globalMkt && Hub.globalMkt.SER) Hub.globalMkt.SER.forEach(function (x) { add('x:' + String(x.id).replace(/^g:/, ''), { sym: x.name, name: x.name, market: 'بازار جهانی', cls: x.intl ? 'intl' : x.mk === 'crypto' ? 'crypto' : x.mk === 'rates' ? 'rate' : 'commodity', ind: x.mk || '', active: true, src: x.src || 'جهانی', idStable: true }); });
    // every central record is in the master (options, and anything the engine analysed that the lists above do not name)
    var C = S.get(CKEY, null); if (C && C.by) Object.keys(C.by).forEach(function (k) { if (!map[k]) { var r = C.by[k]; add(k, { sym: r.sym, name: r.sym, cls: r.cls, active: true, src: r.cls === 'option' ? 'TSETMC' : '', idStable: false }); } });
    var OUT = {}; ((C && C.outside) || []).forEach(function (q) { OUT[q.sym] = q.why; });
    Object.keys(A).forEach(function (aid) { var a = A[aid], r = C && C.by ? a.keys.map(function (k) { return C.by[k]; }).filter(Boolean)[0] : null; a.inCentral = !!r; a.clsFa = CLSFA[a.cls] || a.cls || '';
      a.cover = !a.active ? 'غیرفعال' + (a.inWhy ? ': ' + a.inWhy : '') : !r && OUT[a.sym] ? 'خارج از موتور: ' + OUT[a.sym] : r ? (r.st === 'nodata' ? 'در موتور، دادهٔ ناکافی' : 'تحت پوشش موتور مرکزی') : a.cls === 'fund' && /fixed/.test(a.type || '') ? 'خارج از موتور فنی (صندوق درآمد ثابت؛ معیار بازده)' : isF(a.rows) && a.rows < 30 ? 'تاریخچه کمتر از ۳۰ جلسه' : 'در موتور مرکزی نیست'; });
    MAP = map; var M = { at: Date.now(), n: Object.keys(A).length, A: A, map: map }; try { S.set(AKEY, M); } catch (e) { /* ignore */ } return M; }
  function master() { var S = st(), M = S && S.get(AKEY, null); if (!M) M = buildMaster(); else if (!MAP) MAP = M.map; return M; }

  /* ---------- signal ID, version, ledger ---------- */
  function hashOf(o) { var s = JSON.stringify(o), h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  function r4(x) { return isF(x) ? Number(x.toPrecision(6)) : null; }
  // the decision content of a signal: a change in any of these is a new version
  function content(s) { var lv = s.lv || {}; return { st: s.st, act: s.act, stage: s.stage || null, tier: s.tier || null, rank: s.rank || null, buy: lv.buy ? [r4(lv.buy[0]), r4(lv.buy[1])] : null, stop: r4(lv.stop), tp: (lv.tp || []).slice(0, 3).map(r4), up: r4(lv.up), dn: r4(lv.dn), inv: r4(lv.inv) }; }
  /* called by tradeengine.centralSave with the slim records about to be stored: stamps AID, signal ID, version, created / updated time,
     and appends a ledger entry for every record whose decision content changed. Returns { nNew, nChanged }. */
  function stamp(slim, at, upd) {
    var S = st(); if (!S) return null; var L = S.get(LKEY, null) || { v: 1, by: {} }, nNew = 0, nCh = 0; master();
    Object.keys(slim).forEach(function (k) { var s = slim[k], aid = s.aid || aidOf(k), c = content(s), h = hashOf(c), H = L.by[aid] = L.by[aid] || [], last = H[H.length - 1];
      s.aid = aid; s.sigId = aid + ':' + (s.hzc || 'M');
      if (!last || last.h !== h) { var created = last && last.sid === (s.sid || null) && last.created ? last.created : at; H.push({ v: last ? last.v + 1 : 1, at: at, upd: upd || null, h: h, sid: s.sid || null, created: created, key: k, sym: s.sym, px: s.px, c: c }); if (H.length > MAXV) H.splice(0, H.length - MAXV); if (last) nCh++; else nNew++; }
      var cur = H[H.length - 1]; s.ver = cur.v; s.created = cur.created; s.updAt = at; s.verAt = cur.at; });
    L.at = at; try { S.set(LKEY, L); } catch (e) { /* ignore */ } return { nNew: nNew, nChanged: nCh }; }
  function ledger(aid) { var L = st() && (st().getRO || st().get)(LKEY, null); return L && L.by ? (aid ? L.by[aid] || [] : L.by) : aid ? [] : {}; }
  // the state of a signal at a past moment (directive 22 · 13): the last version issued at or before `at`
  function asOf(aid, at) { var H = ledger(aid), o = null; H.forEach(function (x) { if (x.at <= at) o = x; }); return o; }

  /* ---------- the stored central record (the only source of verdicts) ---------- */
  function get() { var S = st(); return S ? (S.getRO || S.get)(CKEY, null) : null; }   // shared read-only object: do not mutate
  function rec(key) { var C = get(); return C && C.by ? C.by[key] || null : null; }
  /* present(r): the one normalised view of a central record — full (engine run) or slim (stored) — used by every page */
  function present(r) {
    if (!r) return null; var L = r.L || null, lv = r.lv || {};
    var buy = L ? L.buy : lv.buy, stop = L ? L.stop : lv.stop, tp = L ? L.tp || [] : lv.tp || [], up = L ? L.upConf : lv.up, dn = L ? L.dnConf : lv.dn, inv = L ? L.inv : lv.inv;
    return { key: r.key || null, aid: r.aid || aidOf(r.key), sym: r.sym, cls: r.cls, st: r.st, stFa: r.stFa, act: r.act, actFa: r.actFa, tier: r.tier || null, tierFa: r.tierFa || null,
      rank: isF(r.rank) ? r.rank : null, rankCls: isF(r.rankCls) ? r.rankCls : null, pri: r.pri && isF(r.pri.s) ? r.pri.s : isF(r.pri) ? r.pri : null, conf: isF(r.conf) ? r.conf : null, strength: r.strength || null,
      px: isF(r.px) ? r.px : null, date: r.date || null, hz: r.hz || null, buy: buy && isF(buy[0]) ? [Math.min(buy[0], buy[1]), Math.max(buy[0], buy[1])] : null, stop: isF(stop) ? stop : null,
      tp: (tp || []).filter(isF).slice(0, 3), up: isF(up) ? up : null, dn: isF(dn) ? dn : null, inv: isF(inv) ? inv : null, rr: isF(r.rr) ? r.rr : lv && isF(lv.rr) ? lv.rr : null,
      ver: r.ver || null, sigId: r.sigId || null, created: r.created || null, updAt: r.updAt || null, validUntil: r.validUntil || null, dataState: r.dataState || null, why: r.why || '', mv: r.mv || null, exec: r.exec || r.ex || null, xo: r.xo && !r.xo.na ? (r.xo.ty ? r.xo : { ty: r.xo.type, ord: r.xo.order, w: r.xo.worst, fp: r.xo.fillP, rw: r.xo.rrWorst, ok: r.xo.ok, ref: r.xo.ref, rd: r.xo.refDate, at: r.xo.calcAt, txt: r.xo.txt }) : null }; }
  var TIERORD = { ok: 0, pos: 1, wait: 2, floor: 3, none: 4 };
  // the one ordering of opportunities: the cross-market rank; then the market rank (options); then tier; then symbol
  function cmp(a, b) { var ra = isF(a.rank) ? a.rank : 1e9, rb = isF(b.rank) ? b.rank : 1e9; if (ra !== rb) return ra - rb; var ca = isF(a.rankCls) ? a.rankCls : 1e9, cb = isF(b.rankCls) ? b.rankCls : 1e9; if (ca !== cb) return ca - cb;
    var ta = TIERORD[a.tier] != null ? TIERORD[a.tier] : 5, tb = TIERORD[b.tier] != null ? TIERORD[b.tier] : 5; if (ta !== tb) return ta - tb; return String(a.sym).localeCompare(String(b.sym), 'fa'); }
  function list(filter) { var C = get(); if (!C || !C.by) return []; return Object.keys(C.by).map(function (k) { var r = C.by[k]; return present(Object.assign({ key: k }, r)); }).filter(filter || function () { return true; }).sort(cmp); }
  /* why an asset is not shown as an opportunity (directive 22 · 10) */
  function whyNot(key) {
    var r = rec(key); if (r) { if (r.tier === 'ok') return null; return r.stFa + ' — ' + (r.rcFa || r.why || '').toString().slice(0, 220); }
    var M = master(), aid = aidOf(key), a = M && M.A[aid]; if (!a) return 'این دارایی در فهرست مرکزی دارایی‌ها نیست (پوشش داده نمی‌شود).';
    return a.cover || 'در موتور مرکزی نیست';
  }
  function verdictFa(p) { return p ? p.actFa + ' — ' + p.stFa : 'بدون رکورد مرکزی'; }
  /* the one trend of a series (directive 23 · 7): the central record's labels when the engine analyses it; otherwise the same three
     rules run on the given rows. Labels are per horizon; momentum, channel readings and the trading verdict are separate concepts. */
  var TFA = { up: 'صعودی', down: 'نزولی', flat: 'خنثی', none: 'دادهٔ کم' };
  function trend(key, rows) { var r = key ? rec(key) : null, TE = Hub.tradeEngine;
    if (r && r.tr) return { src: 'central', date: r.tr.d, s: { v: r.tr.s, sub: r.tr.sb }, m: { v: r.tr.m, sub: r.tr.mb }, l: { v: r.tr.l, sub: r.tr.lb } };
    var o = TE && TE.trendRows && rows ? TE.trendRows(rows, key) : null; if (!o) return null; return { src: 'rule', date: o.date, s: o.s, m: o.m, l: o.l }; }
  function trendFa(T) { if (!T) return 'روند: دادهٔ کافی نیست'; var f = function (x) { return (TFA[x.v] || x.v) + (x.sub === 'pullback' ? ' (در اصلاح)' : x.sub === 'bounce' ? ' (در برگشت)' : ''); };
    return 'روند (قاعدهٔ واحد سیستم) کوتاه: ' + f(T.s) + ' · میان: ' + f(T.m) + ' · بلند: ' + f(T.l); }
  /* entry validity NOW (2026-11-25, خودران: the phone showed a 3-day-old «buy» while the live price was 4 % above the entry zone and above the
     entry-invalidation level; the user bought there). Every buy is checked against the latest price — the live quote of the light price check
     when it is newer than the verdict — and against the verdict's age. Returns { k, px, at, src, fa, short, stale, ageD }:
       in      — inside the entry zone: the verdict stands
       above   — above the zone: entry passed, do not buy; wait for a return to the zone
       invalid — above the entry-invalidation level: this plan no longer holds; a new verdict is needed
       below   — under the zone (not at the stop): wait; the setup is weakening
       stopped — at or under the stop: the plan failed                                                                      */
  var LPX = 'hub.livepx.v1';
  function livePx(k) { var L = U() && (U().store.getRO || U().store.get)(LPX, null), q = L && L.by && L.by[k]; return q && q[0] > 0 ? { px: q[0], at: q[1] || L.at } : null; }
  function entryNow(r, opt) { opt = opt || {}; if (!r) return null; var lv = r.lv || {}, L = r.L || {}, z = lv.buy || L.buy, stop = isF(lv.stop) ? lv.stop : L.stop, inv = isF(lv.inv) ? lv.inv : L.inv;
    var q = livePx(r.key || opt.key), t0 = r.pxAt || (opt.C && opt.C.at) || 0, px = r.px, at = t0, src = 'حکم';
    if (q && q.at > t0 && q.px > 0) { px = q.px; at = q.at; src = 'قیمت لحظه‌ای'; }
    var ageD = opt.C && opt.C.at ? (Date.now() - opt.C.at) / 864e5 : null, stale = ageD != null && ageD > 1.2;
    var buy = r.act === 'buy' || r.tier === 'ok', o = { px: px, at: at, src: src, stale: stale, ageD: ageD, k: 'none', fa: '', short: '' }; if (!buy || !z || !isF(px)) return o;
    var lo = Math.min(z[0], z[1]), hi = Math.max(z[0], z[1]), f = function (x) { return Hub.util && Hub.util.fmtNum ? Hub.util.fmtNum(x) : Math.round(x).toLocaleString('fa-IR'); }, pc = function (x) { return (100 * x).toFixed(1) + '٪'; };
    if (isF(stop) && px <= stop) { o.k = 'stopped'; o.short = 'حد ضرر خورده'; o.fa = 'قیمت ' + f(px) + ' به حد ضرر ' + f(stop) + ' رسیده است: طرح شکست خورده؛ خرید نکنید.'; }
    else if (isF(inv) && px >= inv) { o.k = 'invalid'; o.short = 'ورود باطل'; o.fa = 'قیمت ' + f(px) + ' از سطح ابطال ورود ' + f(inv) + ' گذشته است: این طرح دیگر معتبر نیست؛ خرید نکنید و منتظر حکم تازه باشید.'; }
    else if (px > hi * 1.002) { o.k = 'above'; o.short = 'ورود گذشته'; o.fa = 'قیمت ' + f(px) + ' ' + pc(px / hi - 1) + ' بالای سقف محدودهٔ ورود (' + f(lo) + '–' + f(hi) + ') است: خرید نکنید؛ فقط با بازگشت به محدوده، با سفارش محدود حداکثر ' + f(hi) + '.'; }
    else if (px < lo * 0.998) { o.k = 'below'; o.short = 'زیر محدوده'; o.fa = 'قیمت ' + f(px) + ' زیر محدودهٔ ورود است: صبر کنید تا دوباره به محدوده برگردد یا حکم تازه بیاید.'; }
    else { o.k = 'in'; o.short = 'داخل محدوده'; o.fa = 'قیمت ' + f(px) + ' داخل محدودهٔ ورود ' + f(lo) + '–' + f(hi) + ' است.'; }
    if (stale) o.fa += ' حکم ' + (ageD).toFixed(1).replace('.', '٫') + ' روز پیش محاسبه شده است؛ پیش از خرید به‌روزرسانی کنید.';
    o.ok = o.k === 'in' && !stale; return o; }
  /* ---------- directive 28 · 3-2: the life stage of an opportunity — ONE function, used by the opportunities centre, the summary dashboard,
     the alerts and the integrity monitor. It reads only the central record (full engine record or the stored / published slim one) and the
     latest live quote (entryNow), so every page shows the same stage for the same asset.
       watch      فرصت تحت پایش      — first evidence (awaiting confirmation, inside a probable floor zone, weak pre-move reading); not actionable
       pre        پیش‌آگاهی معاملاتی  — the probability of the move / of reaching the entry rose (near the confirmation level, price inside the
                                      entry zone without confirmation, the pre-move model on, inside a probable ceiling for holders); not actionable
       confirmed  سیگنال تأییدشده      — the rules are met AND the entry is valid now (live price inside the zone, verdict not older than 1.2 days)
       progress   در حال تحقق         — the move started: price left the zone upward (no chasing), or an open position is being managed
       ended      خاتمه‌یافته          — stop hit, entry invalidated, or a confirmed signal withdrawn / expired in the last 7 days
       none       بدون فرصت
     A confirmed verdict with a limitation (stale verdict, data that failed control, sample data) is NOT shown as confirmed (directive 28 · 9-12):
     it is shown one stage lower with the limitation named. */
  var LIFE = { confirmed: 'سیگنال تأییدشده', progress: 'در حال تحقق', pre: 'پیش‌آگاهی معاملاتی', watch: 'تحت پایش', ended: 'خاتمه‌یافته', none: 'بدون فرصت' };
  var LIFEO = { confirmed: 0, progress: 1, pre: 2, watch: 3, ended: 4, none: 5 };
  var BLOCKRC = { model: 1, valNone: 1, data: 1 };
  // pre-move model reading of either shape: full {up:{p,thr,on,watch}} or slim {u:[p,thr,flag]}
  function pmOf(r) { var q = r && r.pm; if (!q) return { u: null, d: null };
    var f = function (x, y) { return x ? { p: x.p, thr: x.thr, on: !!x.on, watch: !!x.watch } : Array.isArray(y) ? { p: y[0], thr: y[1], on: y[2] === 1, watch: y[2] === 2 } : null; };
    return { u: f(q.up, q.u), d: f(q.dn, q.d) }; }
  // pend: the decision being taken at an engine run, before this run's ledger entry exists — the record itself counts as the newest entry
  function withPend(H, r, pend) { if (!pend) return H; var last = H[H.length - 1]; return H.concat([{ v: last ? last.v + 1 : 1, at: pend, c: { tier: r.tier || null, st: r.st || null } }]); }
  function endedRecent(r, now, pend) { var aid = r.aid || aidOf(r.key), H = withPend(aid ? ledger(aid) : [], r, pend); if (!H.length) return null; var cur = H[H.length - 1];
    if (cur.c && cur.c.tier === 'ok') return null; for (var i = H.length - 2; i >= 0; i--) { if (H[i].c && H[i].c.tier === 'ok') { var endAt = H[i + 1].at; return now - endAt <= 7 * 864e5 ? { at: endAt, from: H[i] } : null; } } return null; }
  // when the signal entered its current state (the first ledger version of the current run of that state)
  function sinceSt(r, stv, pend) { var aid = r.aid || aidOf(r.key), H = withPend(aid ? ledger(aid) : [], r, pend), at = null; for (var i = H.length - 1; i >= 0; i--) { if (H[i].c && H[i].c.st === stv) at = H[i].at; else break; } return at || r.updAt || null; }
  function life(r, opt) {
    opt = opt || {}; if (!r) return null; var now = opt.now || Date.now(), lv = r.lv || {}, L = r.L || {}, z = lv.buy || L.buy, up = isF(lv.up) ? lv.up : L.upConf, px = r.px;
    var e = entryNow(r, opt), pm = pmOf(r), out = function (k, side, why, extra) { return Object.assign({ k: k, fa: LIFE[k], o: LIFEO[k], side: side || 'buy', why: why || '', e: e,
      isNew: !!(r.created && now - r.created <= 36 * 36e5 && (k === 'confirmed' || k === 'pre' || k === 'progress')), pm: pm }, extra || {}); };
    var limWhy = r.dataState === 'sample' ? 'دادهٔ نمونه' : r.heldPrev ? 'دادهٔ تازه از کنترل کیفیت عبور نکرد (آخرین حکم معتبر حفظ شده)' : r.dataState === 'stale' || r.dataBad ? 'دادهٔ این دارایی کهنه یا ناقص است' : e && e.stale ? 'حکم ' + (e.ageD || 0).toFixed(1).replace('.', '٫') + ' روز پیش محاسبه شده' : '';
    // an open position: the move is in progress; the action (hold / reduce / exit) comes from the central verdict
    if (r.held) return out('progress', /^(close|sell|reduce)$/.test(r.act) ? 'sell' : 'buy', 'موقعیت باز — ' + (r.actFa || ''), { lim: limWhy || null });
    // an expired plan (its horizon ran out without the trade) is never active, whatever tier it still carries; «ended» for 7 days, then nothing
    if (r.st === 'exp') { var xa = opt.noLedger ? null : sinceSt(r, 'exp', opt.pend); return xa && now - xa <= 7 * 864e5 ? out('ended', 'buy', 'سیگنال منقضی شد: افق طرح بدون تحقق تمام شد' + (r.rcFa ? ' — ' + r.rcFa : '') + '.', { endAt: xa }) : out('none', 'buy', 'طرح قبلی منقضی شده است' + (r.rcFa ? ' — ' + r.rcFa : '') + '.'); }
    if (r.tier === 'ok' || r.act === 'buy') {
      if (e && (e.k === 'stopped' || e.k === 'invalid')) return out('ended', 'buy', e.fa);
      if (e && e.k === 'above') return out('progress', 'buy', e.fa);
      if (e && e.k === 'below') return out('watch', 'buy', e.fa);
      if (limWhy) return out('pre', 'buy', 'سیگنال خرید با محدودیت: ' + limWhy + ' — تا رفع محدودیت اقدام نکنید.', { lim: limWhy });
      return out('confirmed', 'buy', e && e.fa ? e.fa : 'شرایط ورود طبق قواعد سیستم احراز شده است.'); }
    if (r.sell === 'confirmed') return limWhy ? out('pre', 'sell', 'برگشت نزولی با محدودیت: ' + limWhy + ' — پیش از اقدام به‌روزرسانی کنید.', { lim: limWhy }) : out('confirmed', 'sell', 'برگشت نزولی تأیید شده (برای دارندگان: خروج).');
    var er = opt.noLedger ? null : endedRecent(r, now, opt.pend);
    if (er) return out('ended', 'buy', 'سیگنال خرید تأییدشدهٔ قبلی (نسخهٔ ' + er.from.v + ') ' + new Date(er.at).toLocaleDateString('fa-IR') + ' کنار رفت: ' + (r.stFa || '') + (r.rcFa ? ' — ' + r.rcFa : ''), { endAt: er.at });
    var blocked = BLOCKRC[r.rc], nearUp = isF(up) && isF(px) && px < up && up / px - 1 <= 0.03, inZ = z && isF(px) && px >= Math.min(z[0], z[1]) && px <= Math.max(z[0], z[1]);
    if (r.tier === 'wait' && !blocked) {
      if (nearUp) return out('pre', 'buy', 'قیمت کمتر از ۳٪ تا سطح تأیید صعود فاصله دارد؛ شرط تأیید: بسته‌شدن بالای سطح تأیید.');
      if (inZ) return out('pre', 'buy', 'قیمت داخل محدودهٔ ورود است؛ شرط تأیید هنوز برقرار نیست.');
      if (pm.u && pm.u.on) return out('pre', 'buy', 'مدل یادگیرندهٔ پیش‌آگاهی احتمال شروع حرکت صعودی را بالا می‌بیند.');
      return out('watch', 'buy', 'در انتظار تأیید: ' + (r.rcFa || r.stFa || '')); }
    if (r.tier === 'floor') return r.tzState === 'inZone' ? out('pre', 'buy', 'قیمت داخل محدودهٔ احتمالی کف است؛ ورود فقط پس از تأیید برگشت.') : out('watch', 'buy', 'نزدیک محدودهٔ احتمالی کف؛ برگشت تأیید نشده.');
    if (r.sell === 'inZone') return out('pre', 'sell', 'قیمت در محدودهٔ احتمالی سقف است (برای دارندگان: ذخیرهٔ سود را بررسی کنید).');
    if (pm.u && pm.u.on && !blocked) return out('pre', 'buy', 'مدل یادگیرندهٔ پیش‌آگاهی احتمال شروع حرکت صعودی را بالا می‌بیند؛ حکم مرکزی هنوز فرصت نمی‌بیند.');
    var cy = r.cyc ? { l: r.cyc.lvl, w: r.cyc.win } : r.cy ? { l: r.cy.l, w: r.cy.w } : null;
    if (cy && cy.w && cy.w.type === 'L' && (cy.l === 'serious' || cy.l === 'confirmed')) return out('watch', 'buy', 'چرخهٔ زمانی معتبرِ همین دارایی پنجرهٔ احتمالی کف را نشان می‌دهد (' + (cy.l === 'confirmed' ? 'قیمت هم تأیید کرده' : 'چند چرخه هم‌جهت') + ')؛ حکم مرکزی هنوز فرصت نمی‌بیند.');
    if (r.tier === 'wait' || (pm.u && pm.u.watch)) return out('watch', 'buy', blocked ? 'تحت پایش؛ ' + (r.rcFa || 'مدل یا اعتبارسنجی اجازهٔ تأیید نمی‌دهد') : 'نشانهٔ اولیهٔ مدل پیش‌آگاهی (زیر آستانه).');
    return out('none', 'buy', r.rcFa || r.stFa || ''); }

  /* ---------- DIRECTIVE 31: the ONE final trading decision of an asset (and of each horizon) ----------
     Before this, four vocabularies were shown as «the action»: the engine's position-aware action (r.act), the opportunities centre's
     life-stage action (actKey), the decision desk's pipeline action (now/zone/waitBrk…, x.act) and the 15-field action (actionOf). The
     trading centre showed the first and third, the dashboard the second — the same asset could read «عدم اقدام» on one page and «فروش» or
     «انتظار» on the other. Now: decision(r) is the only function that turns a central record (+ the latest live quote) into the action;
     every page, list, alert, widget and report reads it, and the concepts stay apart:
       trend (direction per horizon) · strength (confidence band) · opportunity (tier) · pre-warning / confirmed signal (life stage) ·
       final action (a9, one of the nine standard actions) · position (held or not — the action depends on it) · order state (never inferred here). */
  var A9 = { buy: 'خرید', scale: 'خرید پله‌ای', hold: 'نگهداری', wait: 'انتظار برای تأیید', reduce: 'کاهش موقعیت', tp: 'ذخیرهٔ سود', sell: 'فروش', close: 'بستن موقعیت', none: 'عدم اقدام' };
  var A9EN = { buy: 'Buy', scale: 'Scale In', hold: 'Hold', wait: 'Wait for Confirmation', reduce: 'Reduce', tp: 'Take Profit', sell: 'Sell', close: 'Close', none: 'No Action' };
  var A9O = { close: 0, sell: 1, buy: 2, scale: 3, tp: 4, reduce: 5, hold: 6, wait: 7, none: 8 };
  var SIGFA = { buyOk: 'سیگنال خرید تأییدشده', sellOk: 'سیگنال فروش (برگشت نزولی) تأییدشده', pre: 'پیش‌آگاهی', watch: 'تحت پایش', ended: 'سیگنال پایان‌یافته', none: 'بدون سیگنال' };
  var HZK = { s: 'S', m: 'M', l: 'L' }, HZFA = { S: 'کوتاه‌مدت', M: 'میان‌مدت', L: 'بلندمدت' };
  // the final action for the recorded position (held or not); l = life(r)
  function finalOf(r, l) {
    var a = r.engAct || r.act, e = l && l.e, aw = r.engWhy || r.actWhy;
    if (r.held) { if (e && e.k === 'stopped') return ['close', 'حد ضرر فعال شده است: بستن موقعیت.'];
      if (a === 'close') return ['close', aw || 'بستن موقعیت']; if (a === 'sell') return ['sell', aw || 'فروش'];
      if (a === 'reduce' || a === 'tp') return a === 'tp' || /سقف|هدف/.test(aw || '') ? ['tp', aw || 'ذخیرهٔ سود در هدف / سقف احتمالی'] : ['reduce', aw || 'کاهش موقعیت'];
      if (a === 'scale') return ['scale', aw || 'افزودن پله‌ای در محدودهٔ ورود'];
      if (r.sell === 'inZone' || r.sell === 'confirmed') return ['tp', r.sell === 'confirmed' ? 'برگشت نزولی تأیید شده؛ ذخیرهٔ سود / خروج پله‌ای.' : 'قیمت در محدودهٔ احتمالی سقف است؛ ذخیرهٔ سود را بررسی کنید.'];
      return ['hold', aw || 'نگهداری']; }
    var k = l ? l.k : 'none', side = l ? l.side : 'buy';
    if (k === 'confirmed') return side === 'sell' ? ['none', 'سیگنال فروش تأییدشده؛ این دارایی را ندارید: خرید نکنید (اگر دارید: خروج).'] : [a === 'scale' ? 'scale' : 'buy', l.why || 'شرایط ورود احراز شده و قیمت در محدودهٔ ورود است.'];
    if (k === 'progress') return ['wait', l.why || 'ورود گذشته؛ فقط با بازگشت به محدوده.'];
    if (k === 'pre') return side === 'sell' ? ['none', l.why || 'محدودهٔ احتمالی سقف (برای دارندگان).'] : ['wait', l.why || 'پیش‌آگاهی؛ منتظر تأیید.'];
    if (k === 'watch') return a === 'wait' || r.tier === 'wait' || r.tier === 'floor' ? ['wait', l.why || 'در انتظار تأیید.'] : ['none', l.why || 'تحت پایش؛ هنوز اقدامی لازم نیست.'];
    if (k === 'ended') return ['none', l.why || 'سیگنال پایان یافته است.'];
    return a === 'wait' ? ['wait', aw || r.why || 'در انتظار تأیید.'] : ['none', r.rcFa || r.why || 'سیگنال معتبری نیست.']; }
  function sigOf(r, l) { var k = l ? l.k : 'none'; if (k === 'confirmed' || (k === 'progress' && !r.held)) return l.side === 'sell' ? 'sellOk' : 'buyOk'; if (r.held && r.tier === 'ok') return 'buyOk'; return SIGFA[k] ? k : 'none'; }
  /* decision(r, opt): THE decision of one central record. opt.C = the central record set (for the verdict age); opt.now for tests.
     The live quote (hub.livepx.v1) is part of it: the same record + the same quote = the same decision on every page. */
  function decision(r, opt) {
    if (!r) return null; opt = opt || {}; var C0 = opt.C || get(); var key = r.key || opt.key, rr = r.key ? r : Object.assign({ key: key }, r), p = present(rr);
    var l = life(rr, { C: C0, now: opt.now, noLedger: opt.noLedger, pend: opt.pend }), f = finalOf(rr, l), sg = sigOf(rr, l), hv = rr.hzv || {}, prim = rr.hzc || 'M', hz = {};
    ['s', 'm', 'l'].forEach(function (h) { var H = HZK[h], v = hv[h] || null; hz[H] = { hz: H, fa: HZFA[H], primary: H === prim, view: v ? v.view : null, gate: v ? v.code : null, gateFa: v ? v.status || v.fa : null,
      a9: H === prim ? f[0] : 'none', why: H === prim ? f[1] : 'برای این افق طرح معاملاتی صادر نشده است' + (v && v.view ? ' (جهت روند: ' + (TFA[v.view] || v.view) + ')' : '') + '؛ فقط افق اصلی (' + HZFA[prim] + ') حکم اجرایی دارد.' }; });
    var lp = livePx(key);
    return Object.assign(p, { key: key, life: l, stage: l.k, stageFa: l.fa, a9: f[0], a9Fa: A9[f[0]], a9En: A9EN[f[0]], a9Why: f[1], a9o: A9O[f[0]], sig: sg, sigFa: SIGFA[sg], side: l.side,
      held: !!rr.held, hzc: prim, hzFa: HZFA[prim], hzd: hz, engAct: rr.act || null, engActFa: rr.actFa || null, pxLive: l.e && l.e.src === 'قیمت لحظه‌ای' ? l.e.px : null, pxv: lp ? lp.at : null,
      calAt: C0 && C0.at || null, run: C0 && C0.run || null, engVer: rr.mv || null, decVer: DECVER }); }
  var DECVER = 'd31.1';
  function decisionOf(key, opt) { var C0 = (opt && opt.C) || get(), r = C0 && C0.by ? C0.by[key] : null; return r ? decision(Object.assign({ key: key }, r), Object.assign({}, opt, { C: C0 })) : null; }
  /* ---------- the one list, filter and order of opportunities (moved here from the opportunities centre so the trading centre uses the SAME
     code): filters only narrow the set; they never change a decision or a rank ---------- */
  var MKO = [['tse', 'بورس تهران'], ['ifb', 'فرابورس'], ['base', 'بازار پایه'], ['bourse', 'بورس/فرابورس (بازار نامشخص)'], ['gold', 'طلا'], ['coin', 'سکه'], ['fx', 'ارز'], ['crypto', 'رمزارز'],
    ['oil', 'نفت و انرژی'], ['commodity', 'کالا و فلزات'], ['intl', 'بازارهای بین‌المللی'], ['option', 'اختیار معامله']];
  var MKFA = {}; MKO.forEach(function (m) { MKFA[m[0]] = m[1]; });
  function mkOf(r) { if (r.__mk) return r.__mk; var c = r.cls, m = String(r.mkt || ''), s = String(r.sym || '') + ' ' + String(r.name || '') + ' ' + String(r.key || ''), k;
    if (c === 'stock' || c === 'fund') k = /پایه/.test(m) ? 'base' : /فرابورس|فرا\s*بورس|ifb/i.test(m) ? 'ifb' : /بورس|tse/i.test(m) ? 'tse' : 'bourse';
    else if (c === 'gold') k = /سکه|sekee|sekeb|nim|rob|gerami|bahar|emami/i.test(s) ? 'coin' : 'gold';
    else if (c === 'commodity') k = /نفت|برنت|گاز|oil|brent|wti|gas|انرژی/i.test(s) ? 'oil' : 'commodity';
    else k = c === 'fx' ? 'fx' : c === 'crypto' ? 'crypto' : c === 'intl' ? 'intl' : c === 'option' ? 'option' : 'commodity';
    try { r.__mk = k; } catch (e) { /* frozen */ } return k; }
  var ACTIVE = { confirmed: 1, progress: 1, pre: 1, watch: 1 };
  function byStage(a, b) { var la = a.life ? a.life.o : 9, lb = b.life ? b.life.o : 9; if (la !== lb) return la - lb;
    var sa = a.life && a.life.side === 'sell' ? 1 : 0, sb = b.life && b.life.side === 'sell' ? 1 : 0; if (sa !== sb) return sa - sb;
    var ra = isF(a.rank) ? a.rank : 1e9, rb = isF(b.rank) ? b.rank : 1e9; if (ra !== rb) return ra - rb;
    var pa = a.pri && isF(a.pri.s) ? a.pri.s : isF(a.pri) ? a.pri : -1, pb = b.pri && isF(b.pri.s) ? b.pri.s : isF(b.pri) ? b.pri : -1; if (pa !== pb) return pb - pa;
    var ua = a.life && a.life.pm && a.life.pm.u && isF(a.life.pm.u.p) ? a.life.pm.u.p : -1, ub = b.life && b.life.pm && b.life.pm.u && isF(b.life.pm.u.p) ? b.life.pm.u.p : -1; if (ua !== ub) return ub - ua;
    return String(a.sym).localeCompare(String(b.sym), 'fa'); }
  // the per-market rank of the active opportunities (mrank): computed once over ALL records, before any filter
  function mranks(recs) { var cnt = {}; recs.filter(function (r) { return r.life && ACTIVE[r.life.k]; }).sort(byStage).forEach(function (r) { var m = mkOf(r); cnt[m] = (cnt[m] || 0) + 1; r.mrank = cnt[m]; }); return recs; }
  /* every record of the central set with its decision attached (r.dec, r.life), per-market ranks set; each call reads the current store */
  // the published / stored record has the slim shape: rebuild the parts every page reads (levels as L, R:R, priority score)
  function norm(r) { if (typeof r.pri === 'number') r.pri = { s: r.pri, base: r.pri, pen: [] }; if (!isF(r.rr) && r.lv && isF(r.lv.rr)) r.rr = r.lv.rr; if (!r.L && r.lv) r.L = { buy: r.lv.buy, stop: r.lv.stop, tp: r.lv.tp || [], upConf: r.lv.up, dnConf: r.lv.dn, floor: r.lv.floor, ceil: r.lv.ceil, tzConf: r.lv.tzConf, inv: r.lv.inv, tzInv: r.lv.tzInv, tzStop: r.lv.tzStop, tzT: r.lv.tzT || [], dnTp: r.lv.dnTp || [], win: r.lv.win || null, far: !!r.lv.far }; if (r.grpFa == null) r.grpFa = ''; if (r.execFa == null) r.execFa = (r.ex && r.ex.fa) || ''; return r; }
  function decided(opt) { var C0 = (opt && opt.C) || get(); if (!C0 || !C0.by) return []; var recs = Object.keys(C0.by).map(function (k) { var r = norm(Object.assign({ key: k }, C0.by[k])), d = decision(r, { C: C0, now: opt && opt.now });
      r.dec = d; r.life = d.life; return r; }); return mranks(recs); }

  /* settle(by): writes the final decision onto every record (engine run). The engine's own proposal moves to engAct / engActFa / engWhy. */
  // the inbox categories follow the final action: no «buy» category on an asset whose final action is not a buy
  function catsFix(r) { if (!Array.isArray(r.cats) || r.held) return; if (r.act !== 'buy' && r.act !== 'scale') { var had = r.cats.indexOf('buy') >= 0 || r.cats.indexOf('scale') >= 0; r.cats = r.cats.filter(function (c) { return c !== 'buy' && c !== 'scale'; }); if (had && r.cats.indexOf('wait') < 0) r.cats.push('wait'); } }
  function settle(by, opt) { opt = opt || {}; var C0 = { at: opt.at || Date.now(), by: by }, n = 0;
    Object.keys(by).forEach(function (k) { var r = by[k]; if (!r.engAct) { r.engAct = r.act || 'none'; r.engActFa = r.actFa || ''; r.engWhy = r.actWhy || ''; }
      var d = decision(Object.assign({ key: k }, r), { C: C0, noLedger: opt.noLedger, pend: C0.at }); r.act = d.a9; r.actFa = A9[d.a9]; r.actWhy = d.a9Why; r.stage = d.stage; r.sig = d.sig; r.decVer = DECVER; r.decAt = C0.at; catsFix(r); n++; });
    return n; }
  /* refresh(): the decision moves with time and the live quote (entry left the zone, verdict became old, stop hit) without a new engine run.
     It is re-taken on the STORED record (and on the in-memory run of this page), as a new version in the ledger, and every open page is told.
     One writer at a time: the store is read, changed and written in one synchronous step. */
  /* other open pages learn of a change through the shared store itself (util: a write is announced and the key reloaded from IndexedDB, then
     'hub:store' fires) — so a page never reacts before it can read the new record */
  var LISTEN = [];
  function onChange(fn) { LISTEN.push(fn); }
  function tell(msg) { LISTEN.forEach(function (f) { try { f(msg); } catch (e) { /* ignore */ } }); try { root.dispatchEvent(new CustomEvent('hub:central', { detail: msg })); } catch (e) { /* ignore */ } }
  var STT = null;
  try { if (root.document) root.document.addEventListener('hub:store', function (ev) { var k = ev && ev.detail && ev.detail.k; if (k !== CKEY && k !== 'hub.central.sig') return;
    clearTimeout(STT); STT = setTimeout(function () { var C0 = get(); if (C0) tell({ kind: 'store', remote: true, at: C0.at, decAt: C0.decAt || null }); }, 1200); }); } catch (e) { /* ignore */ }
  function refresh(opt) { opt = opt || {}; var S = st(); if (!S) return { n: 0 }; var Cs = S.get(CKEY, null); if (!Cs || !Cs.by) return { n: 0 };
    var ch = [], now = opt.now || Date.now();
    Object.keys(Cs.by).forEach(function (k) { var r = Cs.by[k]; if (!r.engAct) { r.engAct = r.act || 'none'; r.engActFa = r.actFa || ''; r.engWhy = r.actWhy || ''; r.decVer = DECVER; }   // a record from before directive 31: its engine action becomes the input, once
      var d = decision(Object.assign({ key: k }, r), { C: Cs, now: now }); if (d.a9 !== r.act || d.stage !== r.stage) { ch.push({ key: k, sym: r.sym, a: r.act, b: d.a9, s0: r.stage, s1: d.stage, why: d.a9Why });
        r.act = d.a9; r.actFa = A9[d.a9]; r.actWhy = d.a9Why; r.stage = d.stage; r.sig = d.sig; r.decAt = now; catsFix(r); } });
    if (!ch.length) return { n: 0 };
    stamp(Cs.by, now, 'live'); Cs.decAt = now; Cs.decCh = ch.slice(0, 80); S.set(CKEY, Cs);
    // the same change on this page's in-memory run, so the page never shows the old decision next to the new one
    var M = Hub.tradeUI && Hub.tradeUI.engineMemo ? Hub.tradeUI.engineMemo() : null, MC = M && M.central;
    if (MC && MC.by && MC.at === Cs.at) ch.forEach(function (c) { var r = MC.by[c.key], s0 = Cs.by[c.key]; if (!r) return; ['act', 'actFa', 'actWhy', 'stage', 'sig', 'decAt', 'ver', 'verAt', 'updAt', 'cats'].forEach(function (f) { r[f] = s0[f]; }); });
    // the alerts read the same changed decisions (confirmation, entry passed, invalidation) — no second rule set
    if (Hub.alerts && Hub.alerts.evaluateCentral && !opt.noAlerts) { try { var evs = Hub.alerts.evaluateCentral(Cs, null); if (evs && evs.length && Hub.alerts.deliver) Hub.alerts.deliver(evs); } catch (e) { /* alerts are best-effort */ } }
    if (!opt.quiet) tell({ kind: 'decision', at: Cs.at, decAt: now, n: ch.length }); return { n: ch.length, ch: ch }; }
  // the clock moves the decision too (a verdict older than 1.2 days is not «confirmed»; an ended signal leaves the list after 7 days)
  try { if (typeof setInterval === 'function' && root.document) setInterval(function () { try { if (!root.document.hidden) refresh(); } catch (e) { /* ignore */ } }, 5 * 60e3); } catch (e) { /* ignore */ }
  function announce(C0, sig) { tell({ kind: 'run', at: C0 && C0.at, run: C0 && C0.run, sig: sig || null }); }
  /* ---------- the one filter and sort of the opportunity lists (both centres use these; filters narrow the set, never a decision) ---------- */
  function trendOf(r) { var v = r.hzv || {}, u = 0, d = 0; ['s', 'm', 'l'].forEach(function (k) { if (v[k] && v[k].view === 'up') u++; if (v[k] && v[k].view === 'down') d++; });
    return u >= 2 && !d ? 'up' : d >= 2 && !u ? 'down' : u && d ? 'mixed' : u ? 'up' : d ? 'down' : 'flat'; }
  function strengthOf(r) { return isF(r.conf) ? (r.conf >= 70 ? 'strong' : r.conf >= 55 ? 'mid' : 'weak') : 'weak'; }
  function pxNow(r) { var e = r.entryNow || (r.life && r.life.e) || {}; return isF(e.px) && e.src === 'قیمت لحظه‌ای' ? e.px : r.px; }
  function distOf(r) { var L = r.L || {}, z = L.buy, px = pxNow(r); if (!isF(px) || !(px > 0)) return null;
    if (!z || !isF(z[0])) return isF(L.upConf) ? L.upConf / px - 1 : null; var lo = Math.min(z[0], z[1]), hi = Math.max(z[0], z[1]); return px > hi * 1.002 ? px / hi - 1 : px < lo * 0.998 ? px / lo - 1 : 0; }   // same ±0.2 % tolerance as entryNow
  function hzOf(r) { var L = r.L || {}; if (r.decVer && r.hzc) return r.hzc;   // directive 31: the plan's own horizon code (engine), one definition
    if (isF(r.days)) return r.days <= 20 ? 'S' : r.days <= 60 ? 'M' : 'L';
    if (L.win && L.win.from && L.win.to) { var g = function (d) { return Date.UTC(Math.floor(d / 1e4), Math.floor(d / 100) % 100 - 1, d % 100); }, dd = (g(L.win.to) - Date.now()) / 864e5; return dd <= 28 ? 'S' : dd <= 85 ? 'M' : 'L'; }
    return r.hzc === 'S' ? 'S' : 'M'; }
  function o0() { return { q: '', mk: 'all', cls: 'all', act: 'all', life: 'active', side: 'all', tr: 'all', hz: 'all', str: 'all', minHit: '', minRR: '', maxDist: '', s4: 'all', exec: 'all', isNew: false, top: false, sort: 'stage' }; }
  function OF(S) { if (!S.o) S.o = o0(); var d = o0(); Object.keys(d).forEach(function (k) { if (S.o[k] === undefined) S.o[k] = d[k]; }); return S.o; }
  function passO(f, r) { var l = r.life || { k: 'none' };
    if (f.life === 'active' ? !ACTIVE[l.k] : f.life === 'actionable' ? !(l.k === 'confirmed' || l.k === 'progress' || l.k === 'pre') : f.life !== 'all' && l.k !== f.life) return false;
    if (f.isNew && !l.isNew) return false;
    if (f.top && !(isF(r.mrank) && r.mrank <= 10)) return false;
    if (f.mk !== 'all' && mkOf(r) !== f.mk) return false;
    if (f.cls !== 'all' && r.cls !== f.cls) return false;
    if (f.q && String(r.sym + ' ' + (r.name || '') + ' ' + (r.sector || '') + ' ' + (r.grpFa || '')).indexOf(String(f.q).trim()) < 0) return false;
    if (f.act !== 'all' && (r.act || 'none') !== f.act) return false;
    if (f.side !== 'all' && l.side !== f.side) return false;
    if (f.tr !== 'all' && trendOf(r) !== f.tr) return false;
    if (f.hz !== 'all' && hzOf(r) !== f.hz) return false;
    if (f.str !== 'all' && strengthOf(r) !== f.str) return false;
    if (f.minHit !== '' && !(r.bt && isF(r.bt.hit) && 100 * r.bt.hit >= Number(f.minHit))) return false;
    if (f.minRR !== '' && !(isF(r.rr) && r.rr >= Number(f.minRR))) return false;
    if (f.maxDist !== '') { var d = distOf(r); if (!isF(d) || Math.abs(d) * 100 > Number(f.maxDist)) return false; }
    if (f.s4 !== 'all' && r.st4 !== f.s4) return false;
    if (f.exec !== 'all' && r.exec !== f.exec) return false;
    return true; }
  function sortO(f, A) { var num = function (fn, asc) { return function (a, b) { var x = fn(a), y = fn(b), bad = asc ? 1e18 : -1e18; x = isF(x) ? x : bad; y = isF(y) ? y : bad; return (asc ? x - y : y - x) || byStage(a, b); }; };
    var K = { stage: byStage, rank: num(function (r) { return r.rank; }, true), rr: num(function (r) { return r.rr; }), hit: num(function (r) { return r.bt && r.bt.hit; }), dist: num(function (r) { var d = distOf(r); return isF(d) ? Math.abs(d) : null; }, true),
      pm: num(function (r) { var u = r.life && r.life.pm && r.life.pm.u; return u && u.p; }), liq: num(function (r) { return r.val20; }), name: function (a, b) { return String(a.sym).localeCompare(String(b.sym), 'fa'); } };
    return A.sort(K[f.sort] || byStage); }
  /* the trade plan as every page shows it: buy side (entry zone, stop, targets) or sell side (exit / profit-taking zone at the probable top,
     invalidation of the bearish view instead of a stop, downside targets) — from the record's levels only */
  function planOf(r) { var L = r.L || {}, l = r.life || (r.dec && r.dec.life) || {}, px = isF(r.px) ? r.px : null;
    if (l.side === 'sell') { var dn = (L.ceil && L.tzT && L.tzT.length ? L.tzT : L.dnTp || []).filter(function (v) { return isF(v) && (px == null || v < px); });
      return { side: 'sell', zone: L.ceil || null, zoneFa: 'محدودهٔ خروج / ذخیرهٔ سود', stop: isF(L.inv) ? L.inv : L.ceil ? Math.max(L.ceil[0], L.ceil[1]) : null, stopFa: 'ابطال دید نزولی (بسته‌شدن بالای)', tp: dn.slice(0, 3) }; }
    return { side: 'buy', zone: L.buy || null, zoneFa: 'محدودهٔ ورود', stop: isF(L.stop) ? L.stop : null, stopFa: 'حد ضرر', tp: (L.tp || []).filter(isF).slice(0, 3) }; }
  var flt = { trendOf: trendOf, strengthOf: strengthOf, pxNow: pxNow, distOf: distOf, hzOf: hzOf, o0: o0, OF: OF, passO: passO, sortO: sortO };
  Hub.central = { planOf: planOf, norm: norm, flt: flt, settle: settle, refresh: refresh, onChange: onChange, announce: announce, tell: tell, A9: A9, A9EN: A9EN, A9O: A9O, SIGFA: SIGFA, HZFA: HZFA, finalOf: finalOf, decision: decision, decisionOf: decisionOf, decided: decided, mranks: mranks, DECVER: DECVER, MKO: MKO, MKFA: MKFA, mkOf: mkOf, ACTIVE: ACTIVE, byStage: byStage, life: life, LIFE: LIFE, LIFEO: LIFEO, pmOf: pmOf, entryNow: entryNow, livePx: livePx, LPX: LPX, trend: trend, trendFa: trendFa, TFA: TFA, CKEY: CKEY, LKEY: LKEY, AKEY: AKEY, CLSFA: CLSFA, aidOf: aidOf, buildMaster: buildMaster, master: master, stamp: stamp, ledger: ledger, asOf: asOf, get: get, rec: rec, present: present, cmp: cmp, list: list, whyNot: whyNot, verdictFa: verdictFa, content: content, hashOf: hashOf };
})(typeof window !== 'undefined' ? window : globalThis);
