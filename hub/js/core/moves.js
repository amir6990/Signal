/* =====================================================================
 * MARKET MOVE DETECTOR — directive 26 (2026-11-24).  Hub.moves   (pure functions, Node-loadable)
 *
 * The trading signal answers «is there an executable plan»; this module answers a different question: «did something important
 * happen to the price», so that a move is reported even when no buy is (or can any longer be) confirmed.
 *
 *   horizons    TSE / TGJU assets: 1, 3 and 5 sessions (5 ≈ one trading week); crypto (24/7, one row per calendar day): 1, 3 and 7 days;
 *               4-hour bars for crypto where the feed provides them (h = 1, 3, 6 bars); and «since the last update» (price of this run
 *               against the price of the previous central run, see sinceLast).
 *   scale       the asset's own volatility — no fixed % threshold for all markets:
 *               σ = 1.4826 × median absolute deviation of the daily log returns of the last 250 observations (robust: the jump being
 *               measured does not inflate its own yardstick); z = log return over h ÷ (σ √h);
 *               rank = share of the asset's own non-overlapping h-returns (last 750 observations) that are smaller in the same direction.
 *   levels      notable      |z| ≥ 2.0 and rank ≥ 0.90
 *               significant  |z| ≥ 2.5 and rank ≥ 0.95
 *               strong       |z| ≥ 3.5 and rank ≥ 0.99
 *               With fewer than 60 h-returns the rank is not used (z only) and the record says so. These cut-offs are this tool's
 *               design choice (editable through opt.th), not a published standard.
 *   volume      last volume ÷ median volume of the 20 sessions before (only where the market reports volume)
 *   breakout    close above the highest high of the previous 20 sessions (breakdown: below the lowest low) — an event of the closing
 *               data. «Significant rise», «resistance breakout», «uptrend confirmation» (central trend) and «buy signal» (central tier)
 *               are four different things and are reported separately (stateOf).
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  var TH = { notable: [2.0, 0.90], significant: [2.5, 0.95], strong: [3.5, 0.99] };
  var LVFA = ['عادی', 'قابل توجه', 'مهم', 'بسیار مهم'];
  function isF(x) { return typeof x === 'number' && isFinite(x); }
  function median(a) { var b = a.filter(isF).slice().sort(function (x, y) { return x - y; }), n = b.length; return n ? (n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2) : NaN; }
  function sigmaOf(c, end, win) {
    var r = []; for (var i = Math.max(1, end - win + 1); i <= end; i++) if (c[i] > 0 && c[i - 1] > 0) r.push(Math.log(c[i] / c[i - 1]));
    if (r.length < 30) return NaN; var m = median(r), d = median(r.map(function (x) { return Math.abs(x - m); }));
    /* MAD collapses when most days are unchanged (thin trading, halts, price limits — common on the Tehran exchange): with more than half
       the returns at zero it is 0 or near 0 and every ordinary move looks extreme. The mean absolute deviation × √(π/2) is the same
       estimate of σ for normal returns but does not collapse, so the larger of the two is used. */
    var mad = r.reduce(function (a, x) { return a + Math.abs(x - m); }, 0) / r.length, s = Math.max(1.4826 * d, 1.2533 * mad);
    if (s > 0) { var cl = r.map(function (x) { return Math.max(m - 5 * s, Math.min(m + 5 * s, x)); }), mc = cl.reduce(function (a, x) { return a + x; }, 0) / cl.length; s = Math.max(s, Math.sqrt(cl.reduce(function (a, x) { return a + (x - mc) * (x - mc); }, 0) / Math.max(1, cl.length - 1))); } // standard deviation with tails clipped at ±5 robust σ: catches mixtures of many zero days and real moves
    if (!(s > 0)) { var mu = r.reduce(function (a, b) { return a + b; }, 0) / r.length; s = Math.sqrt(r.reduce(function (a, b) { return a + (b - mu) * (b - mu); }, 0) / Math.max(1, r.length - 1)); }
    return s > 0 ? s : NaN; }
  function levelOf(z, rk, th) { th = th || TH; var a = Math.abs(z), ok = function (k) { return a >= th[k][0] && (rk == null || rk >= th[k][1]); };
    return !isF(z) ? 0 : ok('strong') ? 3 : ok('significant') ? 2 : ok('notable') ? 1 : 0; }
  /* one horizon: simple and log return, z, empirical rank in the asset's own history */
  function horizon(c, t, h, sig, opt) {
    if (t - h < 0 || !(c[t] > 0) || !(c[t - h] > 0)) return null;
    var lr = Math.log(c[t] / c[t - h]), z = isF(sig) ? lr / (sig * Math.sqrt(h)) : NaN, dir = lr > 0 ? 1 : lr < 0 ? -1 : 0;
    var past = [], lim = Math.max(h, t - (opt.rankWin || 750)); for (var j = t - h; j - h >= lim; j -= h) if (c[j] > 0 && c[j - h] > 0) past.push(Math.log(c[j] / c[j - h]));
    var rk = null; if (past.length >= 60 && dir) { var same = past.filter(function (x) { return dir > 0 ? x <= lr : x >= lr; }).length; rk = same / past.length; }
    return { h: h, r: c[t] / c[t - h] - 1, z: z, rk: rk, nr: past.length, lv: levelOf(z, rk, opt.th), d0: null };
  }
  /* profile(X, opt): X = { d: dates, c: closes, h: highs, l: lows, v: volumes, n } (the engine's bar arrays)
     opt.hs = horizons (default [1,3,5]; crypto [1,3,7]); opt.t = bar index (default last) → compact record kept on the central record */
  function profile(X, opt) {
    opt = opt || {}; var n = X && (X.n || (X.c || []).length); if (!n || n < 32) return { n: n || 0, na: 'تاریخچهٔ کمتر از ۳۲ مشاهده؛ نوسان خود دارایی قابل برآورد نیست' };
    var c = X.c, t = isF(opt.t) ? opt.t : n - 1, sig = sigmaOf(c, t, opt.sigWin || 250), hs = opt.hs || [1, 3, 5];
    var H = hs.map(function (h) { var o = horizon(c, t, h, sig, opt); if (o && X.d) o.d0 = X.d[t - h]; return o; }).filter(Boolean);
    var best = null; H.forEach(function (o) { if (!best || o.lv > best.lv || (o.lv === best.lv && Math.abs(o.z) > Math.abs(best.z))) best = o; });
    var hi20 = -Infinity, lo20 = Infinity; for (var i = Math.max(0, t - 20); i < t; i++) { var hh = X.h ? X.h[i] : c[i], ll = X.l ? X.l[i] : c[i]; if (hh > hi20) hi20 = hh; if (ll < lo20) lo20 = ll; }
    var brk = t >= 21 ? (c[t] > hi20 ? 1 : c[t] < lo20 ? -1 : 0) : 0, brkPrev = t >= 22 ? (function () { var a = -Infinity, b = Infinity; for (var i = Math.max(0, t - 21); i < t - 1; i++) { var hh = X.h ? X.h[i] : c[i], ll = X.l ? X.l[i] : c[i]; if (hh > a) a = hh; if (ll < b) b = ll; } return c[t - 1] > a ? 1 : c[t - 1] < b ? -1 : 0; })() : 0;
    var vr = NaN; if (X.v && X.v[t] > 0) { var vv = []; for (var k = Math.max(0, t - 20); k < t; k++) if (X.v[k] > 0) vv.push(X.v[k]); if (vv.length >= 10) vr = X.v[t] / median(vv); }
    return { n: n, t: t, d: X.d ? X.d[t] : null, px: c[t], sig: sig, h: H, best: best ? best.h : null, lv: best ? best.lv : 0, dir: best && best.lv ? (best.r > 0 ? 1 : -1) : 0,
      brk: brk, brkNew: brk !== 0 && brk !== brkPrev, brkLv: brk > 0 ? hi20 : brk < 0 ? lo20 : NaN, volR: vr, rankNote: H.some(function (o) { return o.rk == null; }) ? 'برای بعضی افق‌ها کمتر از ۶۰ بازدهٔ مستقل در تاریخچه بود؛ فقط z به کار رفت' : '' };
  }
  /* «since the last update»: price of this run vs the previous run's price, scaled by the daily σ (elapsed sessions ≥ 1) */
  function sinceLast(px0, at0, px, at, sig, sess) {
    if (!(px0 > 0) || !(px > 0)) return null; var lr = Math.log(px / px0), k = Math.max(1, sess || 1), z = isF(sig) ? lr / (sig * Math.sqrt(k)) : NaN;
    return { px0: px0, at0: at0 || null, r: px / px0 - 1, z: z, lv: levelOf(z, null) }; }
  /* entry status of a rising asset against the central plan (directive 26 · 1-5): a fast rise is not a buy */
  function entryOf(rec, mv) {
    var L = rec && (rec.L || rec.lv) || {}, buy = L.buy, px = rec && rec.px, atr = rec && rec.atrAbs;
    if (!buy || !isF(buy[0]) || !(px > 0)) return { k: 'none', fa: 'طرح ورود فعالی در حکم مرکزی نیست' };
    var lo = Math.min(buy[0], buy[1]), hi = Math.max(buy[0], buy[1]), pad = isF(atr) ? 0.25 * atr : 0.005 * px;
    if (px >= lo && px <= hi) return { k: 'in', fa: 'قیمت داخل محدودهٔ ورود است', lo: lo, hi: hi };
    if (px > hi + pad) return { k: 'passed', fa: 'قیمت ' + pctFa(px / hi - 1) + ' بالاتر از سقف محدودهٔ ورود است؛ فرصت ورود اولیه گذشته — ورود دوباره فقط پس از اصلاح / پولبک به محدودهٔ ' + num(lo) + '–' + num(hi) + ' یا تثبیت و طرح تازه', lo: lo, hi: hi, gap: px / hi - 1 };
    if (px > hi) return { k: 'top', fa: 'قیمت کمی بالاتر از سقف محدودهٔ ورود است (کمتر از ۰٫۲۵ ATR)', lo: lo, hi: hi };
    return { k: 'below', fa: 'قیمت زیر محدودهٔ ورود است', lo: lo, hi: hi };
  }
  /* four separate states (directive 26 · 1-4) from the move profile and the central record */
  function stateOf(rec, mv) {
    var m = mv || rec.mvx || {}, up = m.dir > 0 && m.lv >= 2, dn = m.dir < 0 && m.lv >= 2, trUp = rec.s4 === 'strongUp' || rec.st4 === 'strongUp' || rec.st4 === 'upConf' || rec.s4 === 'upConf' || (rec.tr && rec.tr.m === 'up') || (rec.trx && rec.trx.m && rec.trx.m.v === 'up');
    return { rise: up, fall: dn, breakUp: m.brk > 0, breakDn: m.brk < 0, trendUp: !!trUp, buy: rec.tier === 'ok', entry: entryOf(rec, m) };
  }
  /* decompositions — what drove the move (log contributions; they add up to the asset's own log change)
     fx:   tether (rial) = tether in dollars (world) × implied dollar rate; implied rate vs the free-market dollar = tether spread
     gold: 18k gram = ounce/31.1035 × 0.75 × dollar × (1 + bubble)
     fund: price = NAV × (1 + premium) */
  function at(rows, d) { for (var i = rows.length - 1; i >= 0; i--) if (rows[i].date <= d) return rows[i]; return null; }
  function decompUSDT(tU, usd, wU, d1, d0) {
    var a1 = at(tU, d1), a0 = at(tU, d0), b1 = at(usd, d1), b0 = at(usd, d0); if (!a1 || !a0 || !b1 || !b0) return null;
    var w1 = wU && at(wU, d1), w0 = wU && at(wU, d0), lT = Math.log(a1.close / a0.close), lD = Math.log(b1.close / b0.close), lW = w1 && w0 ? Math.log(w1.close / w0.close) : NaN;
    return { tether: lT, dollar: lD, world: lW, spread: lT - lD - (isF(lW) ? lW : 0), prem1: a1.close / b1.close - 1, prem0: a0.close / b0.close - 1, worldKnown: isF(lW) }; }
  function decompGold(g18, ons, usd, d1, d0) {
    var g1 = at(g18, d1), g0 = at(g18, d0), o1 = at(ons, d1), o0 = at(ons, d0), u1 = at(usd, d1), u0 = at(usd, d0); if (!g1 || !g0 || !o1 || !o0 || !u1 || !u0) return null;
    var iv = function (o, u) { return o.close / 31.1035 * 0.75 * u.close; }, b1 = g1.close / iv(o1, u1) - 1, b0 = g0.close / iv(o0, u0) - 1;
    return { gold: Math.log(g1.close / g0.close), ounce: Math.log(o1.close / o0.close), dollar: Math.log(u1.close / u0.close), bubble: Math.log((1 + b1) / (1 + b0)), bub1: b1, bub0: b0 }; }
  function decompFund(px1, px0, nav1, nav0) {
    if (!(px1 > 0 && px0 > 0)) return null; var o = { price: Math.log(px1 / px0), prem1: nav1 > 0 ? px1 / nav1 - 1 : NaN, prem0: nav0 > 0 ? px0 / nav0 - 1 : NaN };
    o.nav = nav1 > 0 && nav0 > 0 ? Math.log(nav1 / nav0) : NaN; o.premium = isF(o.nav) ? o.price - o.nav : NaN; return o; }
  // price-behaviour class of a commodity fund: correlation of its daily returns with domestic gold and silver (directive 26 · 7)
  function corrClass(fund, gold, silver, win) {
    win = win || 120; var g = {}, s = {}; gold.forEach(function (r) { g[r.date] = r.close; }); (silver || []).forEach(function (r) { s[r.date] = r.close; });
    var F = fund.filter(function (r) { return r.close > 0 && g[r.date] > 0; }).slice(-(win + 1)), x = [], y = [], w = [];
    for (var i = 1; i < F.length; i++) { var a = F[i], b = F[i - 1]; if (!(g[b.date] > 0)) continue; x.push(Math.log(a.close / b.close)); y.push(Math.log(g[a.date] / g[b.date])); w.push(s[a.date] > 0 && s[b.date] > 0 ? Math.log(s[a.date] / s[b.date]) : NaN); }
    var cor = function (p, q) { var P = [], Q = []; p.forEach(function (v, i) { if (isF(v) && isF(q[i])) { P.push(v); Q.push(q[i]); } }); var k = P.length; if (k < 40) return { r: NaN, n: k };
      var mp = P.reduce(function (u, v) { return u + v; }, 0) / k, mq = Q.reduce(function (u, v) { return u + v; }, 0) / k, sp = 0, sq = 0, c = 0; for (var j = 0; j < k; j++) { c += (P[j] - mp) * (Q[j] - mq); sp += (P[j] - mp) * (P[j] - mp); sq += (Q[j] - mq) * (Q[j] - mq); } return { r: sp > 0 && sq > 0 ? c / Math.sqrt(sp * sq) : NaN, n: k }; };
    var cg = cor(x, y), cs = cor(x, w), k = 'unknown';
    if (isF(cg.r) && cg.r >= 0.5 && (!isF(cs.r) || cg.r >= cs.r + 0.1)) k = 'gold'; else if (isF(cs.r) && cs.r >= 0.5 && (!isF(cg.r) || cs.r >= cg.r + 0.1)) k = 'silver';
    return { k: k, rGold: cg.r, rSilver: cs.r, n: Math.max(cg.n, cs.n) }; }
  /* fund vs 18k gold and 999 silver in one regression (directive 26 · 7, revised after the live test of 2026-11-24): domestic gold and
     silver share the dollar, so a silver fund also correlates with gold (measured: silver funds r ≈ 0.73 with gold vs 0.54 with silver) and
     a plain correlation calls it gold. The standardised coefficients of the joint regression separate them: gold funds ≈ 0.86–0.94 on gold and
     ≤ 0 on silver; silver funds ≈ 0.6–0.72 on gold and clearly > 0 on silver. Daily returns beyond ±20 % (unit changes / splits in the
     fund's price series) are dropped. Returns { k: 'gold' | 'silver' | 'unknown', bG, bS, n }. */
  function fundBeta(fund, gold, silver, win) {
    win = win || 120; var g = {}, s = {}; gold.forEach(function (r) { g[r.date] = r.close; }); (silver || []).forEach(function (r) { s[r.date] = r.close; });
    var F = fund.filter(function (r) { return r.close > 0 && g[r.date] > 0 && s[r.date] > 0; }).slice(-(win + 1)), x = [], a = [], b = [];
    for (var i = 1; i < F.length; i++) { var p = F[i], q = F[i - 1], rx = Math.log(p.close / q.close), ra = Math.log(g[p.date] / g[q.date]), rb = Math.log(s[p.date] / s[q.date]);
      if (Math.abs(rx) > 0.2 || Math.abs(ra) > 0.2 || Math.abs(rb) > 0.2) continue; x.push(rx); a.push(ra); b.push(rb); }
    var k = x.length; if (k < 40) return { k: 'unknown', bG: NaN, bS: NaN, n: k };
    var m = function (v) { return v.reduce(function (u, w) { return u + w; }, 0) / k; }, mx = m(x), ma = m(a), mb = m(b), saa = 0, sbb = 0, sab = 0, sxa = 0, sxb = 0, sxx = 0;
    for (var j = 0; j < k; j++) { var A = a[j] - ma, B = b[j] - mb, X = x[j] - mx; saa += A * A; sbb += B * B; sab += A * B; sxa += X * A; sxb += X * B; sxx += X * X; }
    var det = saa * sbb - sab * sab; if (!(det > 0) || !(sxx > 0)) return { k: 'unknown', bG: NaN, bS: NaN, n: k };
    var bG = (sxa * sbb - sxb * sab) / det * Math.sqrt(saa / sxx), bS = (sxb * saa - sxa * sab) / det * Math.sqrt(sbb / sxx);
    return { k: bG >= 0.82 && bS < 0.05 ? 'gold' : bS >= 0.08 && bG < 0.8 ? 'silver' : 'unknown', bG: bG, bS: bS, n: k }; }
  function num(x) { if (!isF(x)) return '—'; var a = Math.abs(x), s = a >= 1000 ? Math.round(x).toLocaleString('en-US') : x.toFixed(a < 10 ? 2 : a < 100 ? 1 : 0); return s.replace(/[0-9]/g, function (c) { return '۰۱۲۳۴۵۶۷۸۹'[c]; }).replace(/,/g, '٬').replace('.', '٫'); }
  function pctFa(x, d) { return isF(x) ? (x > 0 ? '+' : '') + num(x * 100 * 1).replace(/٫\d+$/, function (m) { return d === 0 ? '' : m; }) + '٪' : '—'; }
  Hub.moves = { TH: TH, LVFA: LVFA, profile: profile, horizon: horizon, sigmaOf: sigmaOf, levelOf: levelOf, sinceLast: sinceLast, entryOf: entryOf, stateOf: stateOf,
    decompUSDT: decompUSDT, decompGold: decompGold, decompFund: decompFund, corrClass: corrClass, fundBeta: fundBeta, median: median };
  if (typeof module !== 'undefined' && module.exports) module.exports = Hub.moves;
})(typeof window !== 'undefined' ? window : globalThis);
