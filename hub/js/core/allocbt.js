/* =====================================================================
 * ALLOCATION MODEL — testable version (directive 19 · 5, 2026-11-19).
 * The earlier market score aggregated the engine's verdicts of today; those cannot be rebuilt for past months, so it could not be tested.
 * This model uses only point-in-time quantities that exist for every past month, and is back-tested with costs and an out-of-sample split.
 *
 * Classes (rial): Iranian shares = total index of TSETMC (dividends included in the index) · gold = 18-carat gold (TGJU) · US dollar
 * (free market, TGJU) · bitcoin in rial (bitcoin × dollar, only when ≥ 2 years overlap) · cash = fixed-income funds (mean daily return of
 * the fixed-income ETFs in the store) or, without them, the cash rate set in the engine settings (stated as an assumption).
 * Score of a class at a rebalance date t (only data up to t):
 *     trend = +1 if close > its N-day average, else −1          momentum = clamp(M-day return ÷ 15%, −1, +1)
 *     score = 0.5 × trend + 0.5 × momentum; shares: 0.4 × trend + 0.4 × momentum + 0.2 × (2 × breadth − 1),
 *     breadth = share of covered shares above their 50-day average (point in time)
 * Rule: every R sessions hold the best class (top1) or the best two equally (top2) whose score > threshold; the rest in cash.
 * Grid (16 variants): N ∈ {100, 200}, M ∈ {63, 126}, top1 / top2, threshold ∈ {0, 0.5}. The variant is chosen on the first 60% of the
 * months (in-sample, by Sharpe) and judged on the last 40% (out of sample) against buy-and-hold of each class, an equal-weight mix and cash.
 * Costs (round trip, applied to the traded fraction; assumptions, editable here): shares 1.25% fee + 0.2% slippage, gold 0.5% (gold ETF),
 * dollar 1.0% (dealer spread), bitcoin 0.5%, cash 0.1%. Monthly rebalancing only (liquidity of Iranian shares, price limits).
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  var KEY = 'hub.allocbt.v1', COST = { stock: 0.0145, gold: 0.005, usd: 0.01, btc: 0.005, cash: 0.001 };
  var FA = { stock: 'سهام (شاخص کل)', gold: 'طلا (۱۸ عیار)', usd: 'دلار آزاد', btc: 'بیت‌کوین (ریالی)', cash: 'نقد / درآمد ثابت' };
  function U() { return Hub.util; }
  function isF(x) { return typeof x === 'number' && isFinite(x); }
  function byDate(rows) { var m = {}; (rows || []).forEach(function (r) { if (r && r.close > 0 && !r.live) m[r.date] = r.close; }); return m; }

  /* inputs from the stores; returns { cal, P: {class: closes on cal (forward filled)}, cash: daily return on cal, cashSrc, breadth, notes } */
  function inputs(E) {
    var g = function (k) { return U().store.get(k, null); }, ST = g('hub.sigstocks.v1'), GD = g('hub.sig-gold.v1'), FX = g('hub.sig-fx.v1'), GL = g('hub.sigglobal.v1'), notes = [];
    var idx = ST && ST.data && ST.data._idx && ST.data._idx.total || [], cal = idx.filter(function (r) { return !r.live && r.close > 0; }).map(function (r) { return r.date; });
    if (cal.length < 400) return { err: 'شاخص کل کمتر از ۴۰۰ جلسه تاریخچه دارد.' };
    var src = { stock: byDate(idx), gold: byDate(GD && GD.data && GD.data.geram18), usd: byDate((FX && FX.data && FX.data.price_dollar_rl) || (ST && ST.data && ST.data._usd)) };
    var btc = GL && GL.data && GL.data.btc; if (btc && btc.length > 500) { var bu = byDate(btc), out = {}, lu = null; cal.forEach(function (d) { if (src.usd[d]) lu = src.usd[d]; if (bu[d] && lu) out[d] = bu[d] * lu; }); if (Object.keys(out).length > 480) src.btc = out; else notes.push('بیت‌کوین: هم‌پوشانی کمتر از دو سال؛ وارد آزمون نشد.'); } else notes.push('بیت‌کوین: تاریخچهٔ کمتر از ۵۰۰ روز؛ وارد آزمون نشد.');
    var P = {}; Object.keys(src).forEach(function (k) { var last = null, a = cal.map(function (d) { if (src[k][d]) last = src[k][d]; return last; }); P[k] = a; });
    // common start: every class must have a price
    var s0 = 0; Object.keys(P).forEach(function (k) { var i = P[k].findIndex(function (v) { return v > 0; }); if (i > s0) s0 = i; });
    // cash: fixed-income ETFs of the store (mean daily return), else the engine's cash rate
    var fixed = (ST && ST.watch || []).filter(function (w) { return w.ftype === 'fixed' && ST.data[w.symbol] && ST.data[w.symbol].px && ST.data[w.symbol].px.length > 200; });
    var cash = cal.map(function () { return NaN; }), cashSrc;
    if (fixed.length) { var M = fixed.map(function (w) { return byDate(ST.data[w.symbol].px); });
      cash = cal.map(function (d, i) { if (!i) return 0; var r = M.map(function (m) { return m[d] && m[cal[i - 1]] ? m[d] / m[cal[i - 1]] - 1 : NaN; }).filter(function (x) { return isF(x) && Math.abs(x) < 0.05; }); return r.length ? r.reduce(function (a, b) { return a + b; }, 0) / r.length : NaN; });
      cashSrc = 'میانگین بازده روزانهٔ ' + fixed.length + ' صندوق درآمد ثابت'; }
    var cr = E && isF(E.cashRate) ? E.cashRate : NaN, dRate = isF(cr) ? Math.pow(1 + cr, 1 / 240) - 1 : NaN;
    cash = cash.map(function (x) { return isF(x) ? x : isF(dRate) ? dRate : NaN; });
    if (!fixed.length) cashSrc = isF(cr) ? 'نرخ ثابت ' + (cr * 100).toFixed(1) + '٪ سالانه از تنظیمات موتور (فرض)' : null;
    if (!cashSrc) return { err: 'بازده نقد مشخص نیست: نه صندوق درآمد ثابتی با تاریخچه در داده‌هاست و نه نرخ نقد در تنظیمات موتور وارد شده است.' };
    // breadth of shares: share above their 50-day average, point in time (only symbols with history at that date)
    var syms = Object.keys(ST.data || {}).filter(function (k) { return k[0] !== '_' && ST.data[k].px && ST.data[k].px.length > 60; }), cnt = cal.map(function () { return 0; }), up = cal.map(function () { return 0; }), pos = {};
    cal.forEach(function (d, i) { pos[d] = i; });
    syms.forEach(function (k) { var px = ST.data[k].px.filter(function (r) { return !r.live && r.close > 0; }), s = 0, q = [];
      for (var j = 0; j < px.length; j++) { q.push(px[j].close); s += px[j].close; if (q.length > 50) s -= q.shift(); var i = pos[px[j].date]; if (i == null || q.length < 50) continue; cnt[i]++; if (px[j].close > s / 50) up[i]++; } });
    var br = cal.map(function (d, i) { return cnt[i] >= 30 ? up[i] / cnt[i] : NaN; });
    return { cal: cal.slice(s0), P: Object.keys(P).reduce(function (o, k) { o[k] = P[k].slice(s0); return o; }, {}), cash: cash.slice(s0), cashSrc: cashSrc, breadth: br.slice(s0), notes: notes, nSyms: syms.length, fixedN: fixed.length };
  }
  function score(I, k, t, N, M) {
    var p = I.P[k]; if (t < Math.max(N, M)) return NaN; var s = 0; for (var i = t - N + 1; i <= t; i++) s += p[i]; var ma = s / N, tr = p[t] > ma ? 1 : -1, mo = Math.max(-1, Math.min(1, (p[t] / p[t - M] - 1) / 0.15));
    if (k === 'stock') { var b = I.breadth[t]; return isF(b) ? 0.4 * tr + 0.4 * mo + 0.2 * (2 * b - 1) : 0.5 * tr + 0.5 * mo; }
    return 0.5 * tr + 0.5 * mo; }
  // weights at t for one variant
  function weights(I, t, v) { var C = Object.keys(I.P), sc = C.map(function (k) { return [k, score(I, k, t, v.N, v.M)]; }).filter(function (x) { return isF(x[1]) && x[1] > v.thr; }).sort(function (a, b) { return b[1] - a[1]; }), w = { cash: 1 };
    var pick = sc.slice(0, v.top); if (pick.length) { w.cash = 1 - pick.length / v.top; pick.forEach(function (x) { w[x[0]] = 1 / v.top; }); } return w; }
  /* simulate from index a to b (cal positions), rebalancing every R sessions */
  function sim(I, v, a, b, fixedW) {
    var C = Object.keys(I.P).concat(['cash']), w = null, nav = [1], cost = 0, turn = 0, R = v.R || 21, held = {};
    for (var t = a; t < b; t++) {
      if ((t - a) % R === 0) { var nw = fixedW ? fixedW(t) : weights(I, t, v), tr = 0; C.forEach(function (k) { var d = Math.abs((nw[k] || 0) - (held[k] || 0)); tr += d; cost += d * COST[k] / 2; }); turn += tr / 2; var nv = nav[nav.length - 1] * (1 - C.reduce(function (s, k) { return s + Math.abs((nw[k] || 0) - (held[k] || 0)) * COST[k] / 2; }, 0)); nav[nav.length - 1] = nv; held = {}; C.forEach(function (k) { held[k] = nw[k] || 0; }); w = nw; }
      // daily drift of the holdings
      var g = 0, tot = 0; C.forEach(function (k) { var r = k === 'cash' ? I.cash[t + 1] : I.P[k][t + 1] / I.P[k][t] - 1; if (!isF(r)) r = 0; held[k] = (held[k] || 0) * (1 + r); tot += held[k]; });
      g = tot; C.forEach(function (k) { held[k] = tot > 0 ? held[k] / tot : 0; }); nav.push(nav[nav.length - 1] * g);
    }
    return { nav: nav, cost: cost, turn: turn };
  }
  function stats(nav, cashR, a) { var n = nav.length - 1; if (n < 20) return null; var r = [], ex = []; for (var i = 1; i < nav.length; i++) { var x = nav[i] / nav[i - 1] - 1; r.push(x); ex.push(x - (isF(cashR[a + i]) ? cashR[a + i] : 0)); }
    var mu = r.reduce(function (s, v) { return s + v; }, 0) / n, sd = Math.sqrt(r.reduce(function (s, v) { return s + (v - mu) * (v - mu); }, 0) / Math.max(1, n - 1)), me = ex.reduce(function (s, v) { return s + v; }, 0) / n, se = Math.sqrt(ex.reduce(function (s, v) { return s + (v - me) * (v - me); }, 0) / Math.max(1, n - 1));
    var pk = nav[0], mdd = 0; nav.forEach(function (v) { if (v > pk) pk = v; mdd = Math.min(mdd, v / pk - 1); });
    return { tot: nav[nav.length - 1] / nav[0] - 1, cagr: Math.pow(nav[nav.length - 1] / nav[0], 240 / n) - 1, vol: sd * Math.sqrt(240), mdd: mdd, sharpe: se > 0 ? me / se * Math.sqrt(240) : NaN, n: n }; }
  // regime of each session by the total index's 63-session return: bull > +5%, bear < −5%, flat otherwise
  function regimeStats(I, nav, a) { var o = { bull: [], bear: [], flat: [] }, p = I.P.stock; for (var i = 1; i < nav.length; i++) { var t = a + i, k = t >= 63 ? p[t - 1] / p[t - 63] - 1 : 0, g = k > 0.05 ? 'bull' : k < -0.05 ? 'bear' : 'flat'; o[g].push(nav[i] / nav[i - 1] - 1); }
    var out = {}; Object.keys(o).forEach(function (g) { var a2 = o[g]; out[g] = a2.length ? { n: a2.length, ann: Math.pow(a2.reduce(function (s, x) { return s * (1 + x); }, 1), 240 / a2.length) - 1 } : null; }); return out; }

  function run(E) {
    var I = inputs(E); if (I.err) return { err: I.err };
    var n = I.cal.length, cut = Math.floor(n * 0.6), start = 200, grid = [];
    if (n - start < 300) return { err: 'تاریخچهٔ مشترک کافی نیست (' + n + ' جلسه).' };
    [100, 200].forEach(function (N) { [63, 126].forEach(function (M) { [1, 2].forEach(function (top) { [0, 0.5].forEach(function (thr) { grid.push({ N: N, M: M, top: top, thr: thr, R: 21 }); }); }); }); });
    grid.forEach(function (v) { var s1 = sim(I, v, start, cut), s2 = sim(I, v, cut, n - 1); v.is = stats(s1.nav, I.cash, start); v.oos = stats(s2.nav, I.cash, cut); v.costIS = s1.cost; v.costOOS = s2.cost; v.turnOOS = s2.turn / ((n - 1 - cut) / 240); v.nav = s2.nav; });
    var best = grid.filter(function (v) { return v.is && isF(v.is.sharpe); }).sort(function (a, b) { return b.is.sharpe - a.is.sharpe; })[0];
    // benchmarks over the same out-of-sample period
    var C = Object.keys(I.P), bm = {};
    C.concat(['cash']).forEach(function (k) { var s = sim(I, { R: 1e9 }, cut, n - 1, function () { var w = {}; w[k] = 1; return w; }); bm[k] = { st: stats(s.nav, I.cash, cut), cost: s.cost }; });
    var ew = sim(I, { R: 21 }, cut, n - 1, function () { var w = {}; C.forEach(function (k) { w[k] = 1 / C.length; }); return w; }); bm.ew = { st: stats(ew.nav, I.cash, cut), cost: ew.cost };
    var bmax = C.map(function (k) { return bm[k].st; }).filter(Boolean).sort(function (a, b) { return b.sharpe - a.sharpe; })[0];
    var o = best && best.oos, ok = !!(o && bm.ew.st && o.sharpe > bm.ew.st.sharpe && bmax && o.sharpe >= bmax.sharpe && o.cagr > (bm.cash.st ? bm.cash.st.cagr : -1));
    var allOOS = grid.map(function (v) { return v.oos ? v.oos.sharpe : NaN; }).filter(isF).sort(function (a, b) { return a - b; });
    var cur = weights(I, n - 1, best || grid[0]), sc = C.map(function (k) { return { k: k, fa: FA[k], s: score(I, k, n - 1, (best || grid[0]).N, (best || grid[0]).M) }; });
    return { at: Date.now(), from: I.cal[start], cut: I.cal[cut], to: I.cal[n - 1], classes: C, best: best && { N: best.N, M: best.M, top: best.top, thr: best.thr, is: best.is, oos: best.oos, costOOS: best.costOOS, turnOOS: best.turnOOS, reg: regimeStats(I, best.nav, cut) },
      bm: bm, ok: ok, oosRange: allOOS.length ? [allOOS[0], allOOS[Math.floor(allOOS.length / 2)], allOOS[allOOS.length - 1]] : null, cur: cur, sc: sc, cashSrc: I.cashSrc, notes: I.notes, nSyms: I.nSyms, fixedN: I.fixedN, FA: FA, COST: COST,
      bReg: { ew: regimeStats(I, ew.nav, cut) } };
  }
  /* cached by the last dates of the inputs: recomputed only when a new official row arrived (smart recompute) */
  function get(E) {
    var g = function (k) { return U().store.get(k, null); }, ST = g('hub.sigstocks.v1'), GD = g('hub.sig-gold.v1'), FX = g('hub.sig-fx.v1');
    var l = function (a) { a = (a || []).filter(function (r) { return !r.live; }); return a.length ? a[a.length - 1].date + ':' + a.length : ''; };
    var sig = [l(ST && ST.data && ST.data._idx && ST.data._idx.total), l(GD && GD.data && GD.data.geram18), l(FX && FX.data && FX.data.price_dollar_rl), E && E.cashRate].join('|'), C = g(KEY);
    if (C && C.sig === sig && C.res) return C.res;
    var res; try { res = run(E); } catch (e) { res = { err: e.message }; }
    try { U().store.set(KEY, { sig: sig, res: res }); } catch (e) { /* ignore */ }
    return res;
  }
  Hub.allocBT = { run: run, get: get, FA: FA, COST: COST, KEY: KEY };
})(typeof window !== 'undefined' ? window : globalThis);
