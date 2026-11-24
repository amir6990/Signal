/* =====================================================================
 * TSETMC REGISTRY — directive 19 · 2 (2026-11-19).
 * The system finds the identifiers itself from the exchange's own feeds; the user is not asked for codes.
 *   market watch (ClosingPrice/GetMarketWatch, already fetched by every update): every instrument with its insCode, symbol (lva), name (lvc),
 *       official industry code (csv), paper type (yVal), flow, board, fund NAV (pRedTran) and shares
 *   index list (Index/GetIndexB1LastAll/All/1 and /2): every headline and industry index with its insCode and today's value; the
 *       industry indices carry the official two-digit industry code in their name → the code → industry-name table
 *   fund registry (Fund/GetFunds/{type}, weekly): fund type, manager, NAV, size; matched to the traded units by name
 * Paper types (yVal) as grouped by the iran-bourse-mcp client: shares 300 303 313, base market 309, funds 305 380.
 * Stored in hub.registry.v1. Nothing is guessed silently: a fund whose type is read from its name only is marked «by name».
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  var KEY = 'hub.registry.v1', STOCK = { 300: 1, 303: 1, 313: 1, 309: 1 }, FUND = { 305: 1, 380: 1 };
  var FT = { 4: 'fixed', 5: 'commodity', 6: 'equity', 7: 'mixed', 21: 'sector', 22: 'lev', 23: 'index' };
  var FTFA = { fixed: 'صندوق درآمد ثابت', mixed: 'صندوق مختلط', equity: 'صندوق سهامی', index: 'صندوق شاخصی', sector: 'صندوق بخشی', lev: 'صندوق اهرمی', gold: 'صندوق طلا', silver: 'صندوق نقره', commodity: 'صندوق کالایی', other: 'سایر صندوق‌ها' };
  function U() { return Hub.util; }
  function get() { return (U() && U().store.get(KEY, null)) || null; }
  function norm(s) { return String(s || '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/صندوق|سرمایه ?گذاری|س\.|قابل معامله|در اوراق بهادار|با درآمد ثابت|درآمد ثابت|مختلط|سهامی|سهام|اهرمی|شاخصی|بخشی|[\s‌\-–_.,،()]+/g, ''); }
  // type of a traded fund from its own name (fallback when the registry has no unique match)
  function typeByName(nm) { var s = String(nm || '');
    if (/درآمد ?ثابت|د\.ثابت|با درآمد|[-–]\s*د\s*$/.test(s)) return 'fixed';   // «-د» at the end of a TSETMC fund name marks a fixed-income unit (checked again by price behaviour in the engine) if (/مختلط/.test(s)) return 'mixed'; if (/اهرم/.test(s)) return 'lev'; if (/شاخص/.test(s)) return 'index'; if (/بخشی/.test(s)) return 'sector';
    if (/طلا|سکه/.test(s)) return 'gold'; if (/نقره/.test(s)) return 'silver'; if (/کالا|زعفران|کالایی/.test(s)) return 'commodity'; if (/سهام/.test(s)) return 'equity'; return 'other'; }

  /* refresh(sess, opt): sess = Hub.data.tse.session() result. opt.funds: also read the fund registry (weekly) */
  function refresh(sess, opt) {
    opt = opt || {}; var T = Hub.data && Hub.data.tse; if (!T || !sess || !sess.by) return Promise.resolve(get());
    var R = get() || { v: 1, ins: {}, ind: {}, idx: [], fundReg: null };
    var lists = Promise.all([T.indexList ? T.indexList(1).catch(function (e) { return { err: e.message }; }) : [], T.indexList ? T.indexList(2).catch(function (e) { return { err: e.message }; }) : []]);
    var weekly = opt.funds || !R.fundReg || Date.now() - R.fundReg.at > 7 * 864e5;
    var fundsP = weekly && T.funds ? Promise.all(Object.keys(FT).map(function (t) { return T.funds(t).then(function (a) { return { t: t, a: a }; }, function (e) { return { t: t, a: [], err: e.message }; }); })) : Promise.resolve(null);
    return Promise.all([lists, fundsP]).then(function (r) {
      var L1 = r[0][0], L2 = r[0][1], errs = [];
      if (L1 && L1.err) errs.push('فهرست شاخص‌های بورس: ' + L1.err); if (L2 && L2.err) errs.push('فهرست شاخص‌های فرابورس: ' + L2.err);
      var idx = [].concat(Array.isArray(L1) ? L1 : [], Array.isArray(L2) ? L2 : []);
      if (idx.length) { R.idx = idx; R.idxAt = Date.now(); idx.forEach(function (x) { if (x.code && !x.headline && !R.ind[x.code]) R.ind[x.code] = x.name; if (x.code && !x.headline && x.flow === 1) R.ind[x.code] = x.name; }); }
      if (r[1]) { var F = []; r[1].forEach(function (q) { if (q.err) errs.push('ثبت صندوق‌ها (نوع ' + q.t + '): ' + q.err); (q.a || []).forEach(function (f) { F.push({ t: FT[q.t], reg: f.regNo, name: String(f.mfName || f.name || '').trim(), nav: Number(f.navRed) || null, manager: f.manager || f.investmentManager || '', start: f.initiationDate || null, net: Number(f.netAsset) || null, units: Number(f.units) || null, at: f.recordDate || null }); }); });
        if (F.length) R.fundReg = { at: Date.now(), list: F }; }
      // instruments from the market watch: shares and funds, with the official industry code
      var reg = R.fundReg && R.fundReg.list || [], byN = reg.map(function (f) { return { f: f, k: norm(f.name) }; }).filter(function (x) { return x.k.length >= 3; }), nIns = 0;
      var faN = function (x) { return String(x || '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[\s‌]+/g, '').trim(); }, bySy = {}; reg.forEach(function (f) { var q = /\(([^()]+)\)\s*$/.exec(String(f.name || '')); if (q) bySy[faN(q[1])] = { f: f, k: norm(f.name) }; });
      Object.keys(sess.by).forEach(function (code) { var m = sess.by[code]; if (!m.sym || !(STOCK[m.yVal] || FUND[m.yVal])) return; nIns++;
        var o = R.ins[code] = R.ins[code] || {}; o.seen = sess.date; o.sym = m.sym; o.name = m.name; o.cs = m.cs || o.cs || ''; o.csName = R.ind[o.cs] || o.csName || ''; o.yVal = m.yVal; o.flow = m.flow; o.board = m.board; o.type = FUND[m.yVal] ? 'fund' : 'stock'; o.seen = sess.date;
        if (o.type === 'fund') { o.nav = m.nav || o.nav || null; o.navD = m.nav ? sess.date : o.navD || null;
          /* directive 26 · 7 — match first by the symbol the registry writes in brackets («… (نقراط)»), then by name; a registry type that
             contradicts the traded name (a «کالای / طلا / نقره» unit matched to a fixed-income or equity fund of a similar name) is not used */
          var k = norm(m.name), sy = bySy[faN(m.sym)], hit = sy ? [sy] : byN.filter(function (x) { return k.indexOf(x.k) >= 0 || x.k.indexOf(k) >= 0 && k.length >= 4; });
          var nameT = typeByName(m.name), comm = /کالا|طلا|سکه|نقره/.test(m.name);
          if (hit.length === 1 && !(comm && !/commodity|gold|silver/.test(hit[0].f.t))) { o.ftype = hit[0].f.t; o.ftSrc = sy ? 'registry-symbol' : 'registry'; o.manager = hit[0].f.manager; o.start = hit[0].f.start; o.reg = hit[0].f.reg; }
          else { o.ftype = nameT; o.ftSrc = hit.length === 1 ? 'name (نوع ثبت‌شده با نام معامله‌ای سازگار نبود: ' + (FTFA[hit[0].f.t] || hit[0].f.t) + ')' : 'name'; }
          // registry type 5 («کالایی») holds gold, silver and other commodity funds: the name decides when it says so (طلا / سکه → gold, نقره → silver);
          // otherwise the fund's own price behaviour does (syncWatch → byPrice)
          if (o.ftype === 'commodity' || o.ftype === 'gold' || o.ftype === 'silver') { var reg = hit.length === 1 ? hit[0].f.name : '', both = m.name + ' ' + reg; if (/نقره/.test(both)) o.ftype = 'silver'; else if (/طلا|سکه/.test(both)) o.ftype = 'gold'; }
          // NAV history (pRedTran of each update; directive 26 · 5-4): price vs NAV and the NAV change over a move
          if (m.nav > 0) { R.navH = R.navH || {}; var nh = R.navH[code] = R.navH[code] || []; if (!nh.length || nh[nh.length - 1][0] !== sess.date) nh.push([sess.date, m.nav]); else nh[nh.length - 1][1] = m.nav; if (nh.length > 250) nh.splice(0, nh.length - 250); } } });
      R.at = Date.now(); R.date = sess.date; R.nIns = nIns; R.errs = errs; R.v = 1;
      /* second route for the industry code (cross-check, directive 20): if the market watch carries no csv for a share (field name not
         confirmed by every client library), its official sector is read from Instrument/GetInstrumentInfo (sector.cSecVal / lSecVal, the
         field the hub's quote already uses) — at most 60 per update, kept for good, so the whole market is covered within a few updates */
      var miss = Object.keys(R.ins).filter(function (c) { var o = R.ins[c]; return o.type === 'stock' && (!o.cs || !o.csName) && !o.csTried; }).slice(0, 60), j = 0;
      var one = function () { if (j >= miss.length || !T.instrumentInfo) return Promise.resolve(); var c = miss[j++], o = R.ins[c];
        return T.instrumentInfo(c).then(function (i) { var sc = i && i.sector || {}; o.csTried = 1; if (sc.cSecVal) { o.cs = String(sc.cSecVal).trim(); o.csName = String(sc.lSecVal || R.ind[o.cs] || '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').trim(); o.csSrc = 'GetInstrumentInfo'; if (o.cs && o.csName && !R.ind[o.cs]) R.ind[o.cs] = o.csName; } }, function () { /* retried next update */ }).then(one); };
      return Promise.all([one(), one(), one(), one()]).then(function () { try { U().store.set(KEY, R); } catch (e) { /* ignore */ } return R; }); });
  }
  /* bring the stock store's watch list in line with the registry: official industry code / name and fund type on every row; every share
     and fund of the market watch that is missing is added (active, marked «added by the registry»). Returns the number added. */
  function syncWatch(S, R) {
    R = R || get(); if (!R || !R.ins || !S || !Array.isArray(S.watch)) return 0;
    var byCode = {}, bySym = {}, added = 0, mwSym = {}; S.watch.forEach(function (w) { if (w.insCode) byCode[w.insCode] = w; bySym[w.symbol] = w; });
    Object.keys(R.ins).forEach(function (c) { mwSym[R.ins[c].sym] = R.ins[c]; });
    /* secondary listings of the same issuer (2026-11-21): the market watch also lists the issuer's other boards under its symbol plus a digit
       — «وکار3», «شپنا3», «کابگن2» … with the same company name and only scattered block trades (measured: 499 of the 873 instruments
       the registry first added; most with < 260 sessions, some with none). One issuer is one asset: the main symbol carries the analysis,
       the secondary listing is not added (and is set aside if an earlier update added it). Digits 3-9: base symbol present is enough;
       digit 2: the names must also match (some «…2» symbols are separate funds). */
    var normN = function (x) { return String(x || '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[\s‌.\-()]+/g, ''); };
    var dupOf = function (sym, name) { var m = /^(.+?)([2-9])$/.exec(sym || ''); if (!m) return null; var b = mwSym[m[1]] || bySym[m[1]]; if (!b) return null; return m[2] !== '2' || normN(b.name) === normN(name) ? m[1] : null; };
    var nDup = 0; S.watch.forEach(function (w) { if (w.src !== 'registry' || w.dupOf) return; var d = dupOf(w.symbol, w.name); if (d) { w.active = false; w.dupOf = d; w.inactiveWhy = 'نماد فرعیِ همان ناشر (بازار یا تابلوی دیگر) — تحلیل از نماد اصلی «' + d + '»'; if (S.data && S.data[w.symbol]) delete S.data[w.symbol]; nDup++; } });
    R.nDupOff = nDup;
    Object.keys(R.ins).forEach(function (code) { var o = R.ins[code], w = byCode[code] || bySym[o.sym];
      if (!w && dupOf(o.sym, o.name)) return;
      if (!w) { w = { symbol: o.sym, name: o.name, insCode: code, sector: '', market: o.flow === 1 ? 'بورس' : o.flow === 2 ? 'فرابورس' : o.flow === 4 ? 'بازار پایه' : '', board: o.board || '', ftype: '', lim: null, active: true, src: 'registry', addedAt: R.date }; S.watch.push(w); added++; }
      if (!w.insCode) w.insCode = code; w.cs = o.cs; w.csName = o.csName; w.csAt = R.date;
      if (o.type === 'fund') { w.ftype = o.ftype || 'other'; w.ftSrc = o.ftSrc; w.nav = o.nav; w.navD = o.navD; } });
    byPrice(S, R);
    return added;
  }
  /* commodity funds (registry type 5 holds gold, silver and other commodities) — directive 26 · 7, revised after the live test of 2026-11-24:
     1) the trading symbol or name says it: «نقر…» / نقره / سیلور / سیمین → silver; طلا / سکه → gold (the registry name is often only
        «صندوق س.کالای …», but the symbol of the silver series of a manager starts with «نقر»);
     2) otherwise the price behaviour: joint regression on 18k gold and 999 silver (Hub.moves.fundBeta); unclear → stays «کالایی».
     The behaviour is also computed for funds decided by the registry or the name, and a disagreement is written on the row (never hidden). */
  function byPrice(S, R) {
    var G = U() && U().store.get('hub.sig-gold.v1', null), gold = G && G.data && G.data.geram18, silv = G && G.data && G.data.silver_999, MV = Hub.moves; if (!S || !Array.isArray(S.watch)) return 0; var n = 0;
    var SIL = /^نقر|نقره|سیلور|سیمین/, GLD = /طلا|سکه|گلد/, FA = { gold: 'طلا', silver: 'نقره' };
    S.watch.forEach(function (w) { if (!/^(gold|silver|commodity)$/.test(w.ftype || '')) return; var o = w.insCode && R && R.ins && R.ins[w.insCode];
      var byPx = /^رفتار قیمت/.test(w.ftSrc || ''), nm = (w.name || '') + ' ' + ((o && o.name) || ''), sk = SIL.test(w.symbol) || /نقره|سیلور|سیمین/.test(nm) ? 'silver' : GLD.test(w.symbol + ' ' + nm) ? 'gold' : null;
      var d = S.data && S.data[w.symbol], px = d && d.px, b = MV && MV.fundBeta && gold && silv && px && px.length >= 41 ? MV.fundBeta(px, gold, silv, 120) : null;
      if (b) w.ftCorr = { g: Math.round(b.bG * 100) / 100, s: Math.round(b.bS * 100) / 100, n: b.n, k: b.k, m: 'beta' };
      var set = function (k, src) { if (w.ftype !== k || w.ftSrc !== src) n++; w.ftype = k; w.ftSrc = src; if (o) { o.ftype = k; o.ftSrc = src; } };
      if (sk && (w.ftype === 'commodity' || byPx || w.ftype !== sk && /^name/.test(w.ftSrc || ''))) set(sk, 'نماد یا نام معامله‌ای (' + FA[sk] + ')' + (b && b.k !== 'unknown' && b.k !== sk ? ' — رفتار قیمت با ' + FA[b.k] + ' سازگارتر است؛ بررسی شود' : ''));
      else if (!sk && (w.ftype === 'commodity' || byPx) && b) { if (b.k === 'gold' || b.k === 'silver') set(b.k, 'رفتار قیمت (رگرسیون هم‌زمان بر طلای ۱۸ و نقرهٔ ۹۹۹: ضریب طلا ' + b.bG.toFixed(2) + '، نقره ' + b.bS.toFixed(2) + '، ' + b.n + ' جلسه)'); else if (byPx) set('commodity', 'کالایی — رفتار قیمت نه طلا نه نقره را روشن نشان می‌دهد (ضریب طلا ' + (isFinite(b.bG) ? b.bG.toFixed(2) : '—') + '، نقره ' + (isFinite(b.bS) ? b.bS.toFixed(2) : '—') + ')'); }
      else if (b && b.k !== 'unknown' && b.k !== w.ftype && (w.ftype === 'gold' || w.ftype === 'silver') && !/بررسی شود/.test(w.ftSrc || '')) w.ftSrc = (w.ftSrc || '') + ' — رفتار قیمت با ' + FA[b.k] + ' سازگارتر است؛ بررسی شود'; });
    return n; }
  Hub.tseRegistry = { KEY: KEY, get: get, refresh: refresh, syncWatch: syncWatch, byPrice: byPrice, typeByName: typeByName, FTFA: FTFA, STOCK: STOCK, FUND: FUND };
})(typeof window !== 'undefined' ? window : globalThis);
