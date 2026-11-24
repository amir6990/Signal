/* =====================================================================
 * FIN — shared numeric helpers (Node-loadable).
 * stats() quartiles use linear interpolation, identical to Excel QUARTILE.INC
 * so the hub and the exported workbook agree to the decimal.
 * ===================================================================== */
(function (root) {
  'use strict';
  function num(v) { var x = Number(v); return isFinite(x) ? x : 0; }
  function stats(vals) {
    var v = vals.filter(function (x) { return x !== null && x !== '' && isFinite(x); }).map(Number).sort(function (a, b) { return a - b; });
    if (!v.length) return { n: 0, min: NaN, q1: NaN, median: NaN, mean: NaN, q3: NaN, max: NaN };
    function q(p) { var pos = (v.length - 1) * p, lo = Math.floor(pos), hi = Math.ceil(pos); return v[lo] + (v[hi] - v[lo]) * (pos - lo); }
    return { n: v.length, min: v[0], q1: q(0.25), median: q(0.5), mean: v.reduce(function (a, b) { return a + b; }, 0) / v.length, q3: q(0.75), max: v[v.length - 1] };
  }
  // bisection on a function with a sign change in [lo, hi]
  function solve(fn, lo, hi, tol) {
    var flo = fn(lo), fhi = fn(hi);
    if (!isFinite(flo) || !isFinite(fhi) || flo * fhi > 0) return null;
    for (var i = 0; i < 300; i++) {
      var mid = (lo + hi) / 2, fm = fn(mid);
      if (Math.abs(fm) < (tol || 1e-10) || hi - lo < 1e-12) return mid;
      if (fm * flo < 0) hi = mid; else { lo = mid; flo = fm; }
    }
    return (lo + hi) / 2;
  }
  function npv(rate, flows) { return flows.reduce(function (s, cf, t) { return s + cf / Math.pow(1 + rate, t); }, 0); }
  function irr(flows) { return solve(function (r) { return npv(r, flows); }, -0.99, 10); }
  function grid5(center, step) { return [-2, -1, 0, 1, 2].map(function (k) { return center + k * step; }); }

  // daily OHLC rows (oldest first) -> ATR (Wilder, simple average of first n TR) and annualised vol
  function priceStats(rows, n, periodsPerYear) {
    n = n || 14;
    if (!rows || rows.length < n + 1) return null;
    var tr = [], rets = [];
    for (var i = 1; i < rows.length; i++) {
      var hgh = rows[i].high, low = rows[i].low, pc = rows[i - 1].close;
      tr.push(Math.max(hgh - low, Math.abs(hgh - pc), Math.abs(low - pc)));
      if (pc > 0 && rows[i].close > 0) rets.push(Math.log(rows[i].close / pc));
    }
    var atr = tr.slice(0, n).reduce(function (a, b) { return a + b; }, 0) / n;
    for (var k = n; k < tr.length; k++) atr = (atr * (n - 1) + tr[k]) / n;
    var m = rets.reduce(function (a, b) { return a + b; }, 0) / rets.length;
    var sd = Math.sqrt(rets.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / (rets.length - 1));
    return { atr: atr, dailyVol: sd, annualVol: sd * Math.sqrt(periodsPerYear || 252), last: rows[rows.length - 1].close, n: rows.length, from: rows[0].date, to: rows[rows.length - 1].date };
  }

  root.Hub = root.Hub || {};
  var UNIT = { units: 1, thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12 };
  var UNITS = [['thousand', 'Thousands'], ['million', 'Millions'], ['billion', 'Billions'], ['trillion', 'Trillions']];
  function unitShort(u) { return { thousand: 'k', million: 'mn', billion: 'bn', trillion: 'tn' }[u] || ''; }
  // Excel expression giving the unit multiplier from a cell holding the unit name
  function unitXl(ref) { return 'IF(' + ref + '="thousand",1E3,IF(' + ref + '="million",1E6,IF(' + ref + '="billion",1E9,IF(' + ref + '="trillion",1E12,1))))'; }
  root.Hub.fin = { UNIT: UNIT, UNITS: UNITS, unitShort: unitShort, unitXl: unitXl, num: num, stats: stats, solve: solve, npv: npv, irr: irr, grid5: grid5, priceStats: priceStats };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Hub.fin;
})(typeof window !== 'undefined' ? window : globalThis);
