/* =====================================================================
 * TRADING ENGINE — regime, 23 voting models, one ensemble, a standard
 * actionable signal, sizing, position monitoring, portfolio risk, back-test.
 *   Data: the hub's own feeds (TSETMC stocks with حقیقی/حقوقی flow, TGJU gold
 *   and FX, TSETMC options), read from their storage; sample data is flagged.
 *   Every vote is computed causally (only bars up to t), so the back-test uses
 *   the same code as today's signal. Weights are fixed priors, not optimised;
 *   out-of-sample results are reported, not tuned.
 * Not investment advice: the user decides and executes.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  var clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); }, isF = function (x) { return typeof x === 'number' && isFinite(x); };
  var mean = function (a) { var s = 0, k = 0; for (var i = 0; i < a.length; i++) if (isF(a[i])) { s += a[i]; k++; } return k ? s / k : NaN; };
  var sd = function (a) { var m = mean(a), s = 0, k = 0; for (var i = 0; i < a.length; i++) if (isF(a[i])) { s += (a[i] - m) * (a[i] - m); k++; } return k > 1 ? Math.sqrt(s / (k - 1)) : NaN; };
  var sgn = function (x) { return x > 0 ? 1 : x < 0 ? -1 : 0; };
  function fa(x, d) { if (!isF(x)) return '—'; var s = Math.abs(x) >= 1000 ? Math.round(x).toLocaleString('en-US') : x.toFixed(d == null ? (Math.abs(x) >= 100 ? 0 : 2) : d); return s.replace(/,/g, '٬').replace(/\./g, '٫').replace(/\d/g, function (c) { return '۰۱۲۳۴۵۶۷۸۹'[c]; }); }
  function pct(x, d) { return isF(x) ? fa(x * 100, d == null ? 1 : d) + '٪' : '—'; }

  /* ---------------- defaults ---------------- */
  function defaults() {
    return { mode: 'full', market: 'iran', classes: { stock: true, gold: true, fx: true, option: true },
      acct: { equity: null, riskPct: 0.01, maxPosPct: 0.15, maxHeat: 0.06, maxPos: 8, sectorCap: 0.30, targetVol: 0.35, minRR: 1.5, limitPct: 0.03, limits: { tse: 0.03, ifb: 0.03, yellow: 0.03, orange: 0.02, red: 0.01, etf: 0.03, lev: 0.06, gold: 0.10, fixed: 0.03 }, costPct: 0.012, liqPct: 0.10, minVal: 3e10, corrMax: 0.8, peak: null, ddSoft: 0.10, ddHard: 0.20 },
      minConf: 55, strongConf: 70, w: {}, off: {}, news: [], positions: [], learn: { wr: {}, block: {}, riskMult: 1, log: [], auto: false }, val: { gate: 'strict', th: {}, db: null, reg: {}, hist: [] } };
  }
  var BASEW = { trend: 1, macd: 0.6, adx: 0.5, ichimoku: 0.8, mtf: 1, evidence: 1, rsi: 0.6, boll: 0.5, stoch: 0.3, hybrid: 0.8, candles: 0.3, smc: 0.6, fib: 0.3, vp: 0.5, flow: 1, tse: 0.8, gfx: 0.8, channel: 0.5, wdiv: 0.4, factor: 0.8, pairs: 0.5, cross: 0.5, temporal: 0.3, mlrank: 0.7, sentiment: 0.8 };
  var FAMOF = { trend: 'trend', macd: 'trend', adx: 'trend', ichimoku: 'trend', mtf: 'trend', evidence: 'trend', rsi: 'osc', boll: 'osc', stoch: 'osc', hybrid: 'osc', candles: 'struct', smc: 'struct', fib: 'struct', vp: 'struct', flow: 'flow', tse: 'flow', gfx: 'flow', channel: 'struct', wdiv: 'osc', factor: 'quant', pairs: 'quant', cross: 'quant', temporal: 'quant', mlrank: 'quant', sentiment: 'ai' };
  var HZ = { channel: 'l', rsi: 's', boll: 's', stoch: 's', candles: 's', temporal: 's', mlrank: 's', sentiment: 's', factor: 'l' };
  var REG = { up: 'روند صعودی', down: 'روند نزولی', range: 'رنج (بدون روند)', hv: 'پرنوسان', crisis: 'بحرانی', unk: 'نامشخص (دادهٔ کم)' };

  /* ---------------- series and indicators ---------------- */
  // back-adjust for capital increases / dividends with TSETMC "yesterday price"; keeps the raw last close
  function prep(rows) {
    var n = rows.length, f = 1, X = { d: [], o: [], h: [], l: [], c: [], v: [], val: [], yc: [], lock: [], raw: [] };
    var tmp = new Array(n);
    for (var i = n - 1; i >= 0; i--) {
      var r = rows[i], o = isF(r.open) && r.open > 0 ? r.open : r.close;
      tmp[i] = { d: r.date, o: o * f, h: r.high * f, l: r.low * f, c: r.close * f, v: r.vol || 0, val: r.val || 0, yc: r.yclose, raw: r.close, lock: r.high === r.low && r.yclose > 0 ? sgn(r.close - r.yclose) : 0 };
      if (i > 0 && r.yclose > 0 && rows[i - 1].close > 0 && Math.abs(r.yclose / rows[i - 1].close - 1) > 0.002) f *= r.yclose / rows[i - 1].close;
    }
    tmp.forEach(function (x) { ['d', 'o', 'h', 'l', 'c', 'v', 'val', 'yc', 'lock', 'raw'].forEach(function (k) { X[k].push(x[k]); }); });
    X.n = n; return X;
  }
  function sma(a, k) { var o = new Array(a.length).fill(NaN), s = 0; for (var i = 0; i < a.length; i++) { s += a[i]; if (i >= k) s -= a[i - k]; if (i >= k - 1) o[i] = s / k; } return o; }
  function ema(a, k) { var o = new Array(a.length).fill(NaN), al = 2 / (k + 1), e = NaN; for (var i = 0; i < a.length; i++) { e = isF(e) ? e + al * (a[i] - e) : (i >= k - 1 ? mean(a.slice(i - k + 1, i + 1)) : NaN); o[i] = e; } return o; }
  function wilder(a, k) { var o = new Array(a.length).fill(NaN), e = NaN; for (var i = 0; i < a.length; i++) { if (!isF(a[i])) continue; if (!isF(e)) { if (i >= k) { e = mean(a.slice(i - k + 1, i + 1)); } } else e = (e * (k - 1) + a[i]) / k; o[i] = e; } return o; }
  function stdA(a, k) { var o = new Array(a.length).fill(NaN); for (var i = k - 1; i < a.length; i++) o[i] = sd(a.slice(i - k + 1, i + 1)); return o; }
  function indicators(X) {
    var c = X.c, h = X.h, l = X.l, n = X.n, I = {};
    I.s20 = sma(c, 20); I.s50 = sma(c, 50); I.s200 = sma(c, 200); I.sd20 = stdA(c, 20);
    var e12 = ema(c, 12), e26 = ema(c, 26), mac = c.map(function (_, i) { return e12[i] - e26[i]; }), sig = ema(mac.map(function (x) { return isF(x) ? x : 0; }), 9);
    I.macdH = mac.map(function (x, i) { return isF(x) && i >= 34 ? x - sig[i] : NaN; });
    var up = [NaN], dn = [NaN], tr = [NaN], pdm = [NaN], mdm = [NaN];
    for (var i = 1; i < n; i++) { var d = c[i] - c[i - 1]; up.push(Math.max(d, 0)); dn.push(Math.max(-d, 0)); tr.push(Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
      var um = h[i] - h[i - 1], dm = l[i - 1] - l[i]; pdm.push(um > dm && um > 0 ? um : 0); mdm.push(dm > um && dm > 0 ? dm : 0); }
    var au = wilder(up, 14), ad = wilder(dn, 14); I.rsi = au.map(function (u, i) { return isF(u) && isF(ad[i]) ? (ad[i] === 0 ? 100 : 100 - 100 / (1 + u / ad[i])) : NaN; });
    I.atr = wilder(tr, 14); var sp = wilder(pdm, 14), sm = wilder(mdm, 14);
    I.pdi = sp.map(function (x, i) { return I.atr[i] > 0 ? 100 * x / I.atr[i] : NaN; }); I.mdi = sm.map(function (x, i) { return I.atr[i] > 0 ? 100 * x / I.atr[i] : NaN; });
    var dx = I.pdi.map(function (p, i) { var m = I.mdi[i]; return isF(p) && isF(m) && p + m > 0 ? 100 * Math.abs(p - m) / (p + m) : NaN; }); I.adx = wilder(dx, 14);
    I.bbU = I.s20.map(function (m, i) { return m + 2 * I.sd20[i]; }); I.bbL = I.s20.map(function (m, i) { return m - 2 * I.sd20[i]; }); I.bbW = I.s20.map(function (m, i) { return m > 0 ? 4 * I.sd20[i] / m : NaN; });
    I.stK = c.map(function (x, i) { if (i < 13) return NaN; var hh = Math.max.apply(null, h.slice(i - 13, i + 1)), ll = Math.min.apply(null, l.slice(i - 13, i + 1)); return hh > ll ? 100 * (x - ll) / (hh - ll) : 50; });
    I.stK = sma(I.stK.map(function (x) { return isF(x) ? x : 50; }), 3); I.stD = sma(I.stK.map(function (x) { return isF(x) ? x : 50; }), 3);
    var lr = c.map(function (x, i) { return i ? Math.log(x / c[i - 1]) : NaN; }); I.lr = lr;
    I.vol20 = lr.map(function (_, i) { return i >= 20 ? sd(lr.slice(i - 19, i + 1)) * Math.sqrt(250) : NaN; });
    I.volPct = I.vol20.map(function (v, i) { if (!isF(v) || i < 80) return NaN; var w = I.vol20.slice(Math.max(20, i - 250), i + 1).filter(isF); return w.filter(function (x) { return x <= v; }).length / w.length; });
    return I;
  }
  function regimeAt(X, I, t) {
    if (t < 60 || !isF(I.adx[t])) return 'unk';
    var c = X.c[t], hi = Math.max.apply(null, X.c.slice(Math.max(0, t - 59), t + 1)), dd = c / hi - 1, vp = I.volPct[t];
    if (isF(vp) && vp >= 0.95 && dd <= -0.15) return 'crisis';
    if (isF(vp) && vp >= 0.85) return 'hv';
    var sl = I.s50[t] / I.s50[t - 10] - 1;
    if (I.adx[t] >= 20 && c > I.s50[t] && sl > 0) return 'up';
    if (I.adx[t] >= 20 && c < I.s50[t] && sl < 0) return 'down';
    return 'range';
  }
  function swings(X, t, look) { // fractal pivots (2 bars each side) in the last `look` bars, confirmed by t
    var H = [], L = [];
    for (var i = Math.max(2, t - look); i <= t - 2; i++) {
      if (X.h[i] >= X.h[i - 1] && X.h[i] >= X.h[i - 2] && X.h[i] >= X.h[i + 1] && X.h[i] >= X.h[i + 2]) H.push(i);
      if (X.l[i] <= X.l[i - 1] && X.l[i] <= X.l[i - 2] && X.l[i] <= X.l[i + 1] && X.l[i] <= X.l[i + 2]) L.push(i);
    }
    return { H: H, L: L };
  }
  function hiN(a, t, k) { return Math.max.apply(null, a.slice(Math.max(0, t - k + 1), t + 1)); }
  function loN(a, t, k) { return Math.min.apply(null, a.slice(Math.max(0, t - k + 1), t + 1)); }

  /* ---------------- per-model votes at bar t: { v ∈ [-1,1] | NaN, why } ---------------- */
  var VOTE = {
    trend: function (X, I, t) { if (t < 55) return null; var c = X.c[t], s200 = isF(I.s200[t]) ? I.s200[t] : null;
      var k = (c > I.s20[t]) + (c > I.s50[t]) + (s200 ? c > s200 : c > I.s50[t]) + (I.s20[t] > I.s50[t]) + (s200 ? I.s50[t] > s200 : I.s50[t] > I.s50[t - 10]);
      var v = k / 5 * 2 - 1; return { v: v, why: 'قیمت ' + (c > I.s50[t] ? 'بالای' : 'زیر') + ' میانگین ۵۰ روزه' + (s200 ? ' و ' + (c > s200 ? 'بالای' : 'زیر') + ' ۲۰۰ روزه' : '') + '؛ ' + fa(k, 0) + ' شرط از ۵ صعودی' }; },
    macd: function (X, I, t) { var m = I.macdH[t], a = I.atr[t]; if (!isF(m) || !(a > 0) || t < 38) return null; var v = clamp(m / a * 2, -1, 1) * 0.7 + sgn(m - I.macdH[t - 3]) * 0.3; return { v: v, why: 'هیستوگرام MACD ' + (m > 0 ? 'مثبت' : 'منفی') + ' و ' + (m > I.macdH[t - 3] ? 'رو به افزایش' : 'رو به کاهش') }; },
    adx: function (X, I, t) { var a = I.adx[t]; if (!isF(a)) return null; var v = sgn(I.pdi[t] - I.mdi[t]) * clamp((a - 15) / 20, 0, 1); return { v: v, why: 'ADX ' + fa(a, 0) + (a >= 25 ? ' (روند قوی)' : a >= 20 ? ' (روند متوسط)' : ' (بدون روند)') + '، ' + (I.pdi[t] > I.mdi[t] ? '+DI غالب' : '−DI غالب') }; },
    ichimoku: function (X, I, t) { if (t < 77) return null; var mid = function (a, b) { return (hiN(X.h, t - a, b - a + 1) + loN(X.l, t - a, b - a + 1)) / 2; };
      var ten = mid(0, 8), kij = mid(0, 25), sA = (mid(26, 34) + mid(26, 51)) / 2, sB = mid(26, 77), c = X.c[t], pos = c > Math.max(sA, sB) ? 1 : c < Math.min(sA, sB) ? -1 : 0;
      var v = clamp(pos * 0.6 + sgn(sA - sB) * 0.2 + sgn(ten - kij) * 0.2, -1, 1); return { v: v, why: 'قیمت ' + (pos > 0 ? 'بالای' : pos < 0 ? 'زیر' : 'درون') + ' ابر، تنکان ' + (ten > kij ? 'بالای' : 'زیر') + ' کیجون', kijun: kij, cloudTop: Math.max(sA, sB), cloudBot: Math.min(sA, sB) }; },
    mtf: function (X, I, t) { if (t < 130) return null; var c = X.c;
      var tf = function (step, k) { var s = []; for (var j = 0; j < k; j++) s.push(c[t - j * step]); var m = mean(s); return sgn(c[t] - m) * 0.6 + sgn(c[t] - c[t - step * 3]) * 0.4; };
      var d = tf(1, 20), w = tf(5, 10), m = tf(21, 6), all = sgn(d) === sgn(w) && sgn(w) === sgn(m) && sgn(d) !== 0;
      return { v: clamp((d + w + m) / 3 * (all ? 1.2 : 0.7), -1, 1), why: 'روزانه ' + (d > 0 ? '↑' : '↓') + '، هفتگی ' + (w > 0 ? '↑' : '↓') + '، ماهانه ' + (m > 0 ? '↑' : '↓') + (all ? ' — هم‌راستا' : ' — ناهم‌راستا') }; },
    evidence: function (X, I, t) { if (t < 60) return null; var c = X.c[t], up = hiN(X.h, t - 1, 55), dn = loN(X.l, t - 1, 55), A = c > up ? 1 : c < dn ? -1 : 0, B = t >= 120 ? sgn(c / X.c[t - 120] - 1) : 0;
      return { v: A ? A * 0.6 + B * 0.4 : B * 0.6, why: (A > 0 ? 'شکست سقف ۵۵ روزه' : A < 0 ? 'شکست کف ۵۵ روزه' : 'درون کانال ۵۵ روزه') + (t >= 120 ? '، بازده ۱۲۰ روزه ' + pct(c / X.c[t - 120] - 1, 0) : ''), lvl: up }; },
    rsi: function (X, I, t, rg) { var r = I.rsi[t]; if (!isF(r)) return null; var v;
      if (rg === 'up') v = r >= 80 ? -0.3 : r >= 50 ? 0.4 : r < 40 ? -0.3 : 0; else if (rg === 'down') v = r <= 20 ? 0.3 : r <= 50 ? -0.4 : r > 60 ? 0.3 : 0;
      else v = r < 30 ? clamp((30 - r) / 15, 0, 1) : r > 70 ? -clamp((r - 70) / 15, 0, 1) : 0;
      if ((rg === 'range' || rg === 'hv') && r > 30 && I.rsi[t - 1] <= 30) v = 0.8;
      return { v: v, why: 'RSI ' + fa(r, 0) + (r < 30 ? ' (اشباع فروش)' : r > 70 ? ' (اشباع خرید)' : '') + (r > 30 && I.rsi[t - 1] <= 30 ? '، بازگشت از اشباع فروش' : '') }; },
    boll: function (X, I, t, rg) { if (!isF(I.bbW[t]) || t < 120) return null; var c = X.c[t], pb = (c - I.bbL[t]) / (I.bbU[t] - I.bbL[t]), ws = I.bbW.slice(t - 119, t).filter(isF).sort(function (a, b) { return a - b; }), sq = I.bbW[t - 1] <= ws[Math.floor(ws.length * 0.2)];
      var v = sq && c > I.bbU[t] ? 0.8 : sq && c < I.bbL[t] ? -0.8 : rg === 'range' || rg === 'hv' ? (pb < 0 ? 0.6 : pb > 1 ? -0.6 : (0.5 - pb) * 0.4) : 0;
      return { v: v, why: '%B ' + fa(pb, 2) + (sq ? '، پس از فشردگی باند' : '') + (sq && c > I.bbU[t] ? ' — شکست باند بالا' : '') }; },
    stoch: function (X, I, t) { var k = I.stK[t], d = I.stD[t]; if (!isF(k) || t < 20) return null; var cu = k > d && I.stK[t - 1] <= I.stD[t - 1], cd = k < d && I.stK[t - 1] >= I.stD[t - 1];
      return { v: cu && k < 30 ? 0.8 : cd && k > 70 ? -0.8 : 0, why: '%K ' + fa(k, 0) + (cu && k < 30 ? '، تقاطع صعودی از ناحیهٔ اشباع فروش' : cd && k > 70 ? '، تقاطع نزولی از اشباع خرید' : '') }; },
    hybrid: function (X, I, t, rg) { if (t < 70 || !isF(I.vol20[t])) return null;
      if (rg === 'up' || rg === 'down') { var m = X.c[t - 5] / X.c[t - 65] - 1, s = I.vol20[t] * Math.sqrt(60 / 250); return { v: clamp(m / s / 1.5, -1, 1), why: 'مومنتوم ۶۰ روزه ' + pct(m, 0) + ' (تعدیل‌شده با نوسان)' }; }
      var z = (X.c[t] - I.s20[t]) / I.sd20[t]; return { v: clamp(-z / 2, -1, 1), why: 'فاصلهٔ قیمت از میانگین ۲۰ روزه ' + fa(z, 1) + ' انحراف معیار (بازگشت به میانگین)' }; },
    candles: function (X, I, t) { if (t < 25) return null; var o = X.o, c = X.c, h = X.h, l = X.l; if (h[t] === l[t]) return { v: 0, why: 'روز قفل‌شده (صف) — الگو معنا ندارد' };
      var body = Math.abs(c[t] - o[t]), rng = h[t] - l[t], lo20 = loN(l, t, 20), hi20 = hiN(h, t, 20), v = 0, w = 'الگوی خاصی نیست';
      if (c[t] > o[t] && c[t - 1] < o[t - 1] && c[t] >= o[t - 1] && o[t] <= c[t - 1]) { v = 0.7; w = 'پوشای صعودی'; }
      else if (c[t] < o[t] && c[t - 1] > o[t - 1] && c[t] <= o[t - 1] && o[t] >= c[t - 1]) { v = -0.7; w = 'پوشای نزولی'; }
      else if (Math.min(o[t], c[t]) - l[t] >= 2 * body && h[t] - Math.max(o[t], c[t]) <= 0.3 * rng && l[t] <= lo20 * 1.02) { v = 0.6; w = 'چکش نزدیک کف ۲۰ روزه'; }
      else if (h[t] - Math.max(o[t], c[t]) >= 2 * body && Math.min(o[t], c[t]) - l[t] <= 0.3 * rng && h[t] >= hi20 * 0.98) { v = -0.6; w = 'ستارهٔ دنباله‌دار نزدیک سقف ۲۰ روزه'; }
      else if (h[t - 1] < h[t - 2] && l[t - 1] > l[t - 2]) { if (c[t] > h[t - 1]) { v = 0.5; w = 'شکست صعودی اینسایدبار'; } else if (c[t] < l[t - 1]) { v = -0.5; w = 'شکست نزولی اینسایدبار'; } }
      return { v: v, why: w }; },
    smc: function (X, I, t) { if (t < 40) return null; var S = swings(X, t, 60); if (S.H.length < 2 || S.L.length < 2) return { v: 0, why: 'نقطهٔ چرخش کافی نیست' };
      var sh = X.h[S.H[S.H.length - 1]], sl = X.l[S.L[S.L.length - 1]], psh = X.h[S.H[S.H.length - 2]], psl = X.l[S.L[S.L.length - 2]], c = X.c[t];
      var struct = sh > psh && sl > psl ? 1 : sh < psh && sl < psl ? -1 : 0, bos = c > sh ? 1 : c < sl ? -1 : 0, choch = bos && bos !== struct && struct !== 0;
      var ob = null; if (bos > 0 || struct > 0) { for (var i = t - 1; i > t - 25 && i > 0; i--) if (X.c[i] < X.o[i]) { ob = { lo: X.l[i], hi: X.h[i] }; break; } }
      var fvg = 0; for (var j = t - 1; j > t - 20 && j > 2; j--) if (X.l[j] > X.h[j - 2] && loN(X.l, t, t - j) > X.h[j - 2]) { fvg = 1; break; }
      var inOB = ob && c >= ob.lo && c <= ob.hi * 1.01;
      var v = clamp(struct * 0.4 + bos * 0.4 + (inOB && struct >= 0 ? 0.3 : 0) + fvg * 0.1, -1, 1);
      return { v: v, why: (struct > 0 ? 'ساختار صعودی (سقف و کف بالاتر)' : struct < 0 ? 'ساختار نزولی' : 'ساختار خنثی') + (bos ? (choch ? '، تغییر ماهیت (CHoCH)' : '، شکست ساختار (BOS)') : '') + (inOB ? '، قیمت در اوردربلاک' : '') + (fvg ? '، شکاف ارزش منصفانهٔ صعودی پرنشده' : ''), swingLow: sl, swingHigh: sh, ob: ob }; },
    fib: function (X, I, t, rg) { if (t < 60) return null; var a = t - 59, hi = -Infinity, lo = Infinity, ih = a, il = a;
      for (var i = a; i <= t; i++) { if (X.h[i] > hi) { hi = X.h[i]; ih = i; } if (X.l[i] < lo) { lo = X.l[i]; il = i; } }
      if (!(hi > lo)) return null; var c = X.c[t], up = il < ih, r = up ? (hi - c) / (hi - lo) : (c - lo) / (hi - lo), v = 0;
      if (up) v = r >= 0.382 && r <= 0.618 && rg !== 'down' ? 0.6 : r > 0.786 ? -0.4 : r < 0.1 ? 0.2 : 0; else v = r >= 0.382 && r <= 0.618 && rg !== 'up' ? -0.6 : r > 0.786 ? 0.4 : 0;
      return { v: v, why: 'موج ' + (up ? 'صعودی' : 'نزولی') + ' ۶۰ روزه، اصلاح ' + pct(r, 0), ext1: up ? lo + 1.272 * (hi - lo) : NaN, ext2: up ? lo + 1.618 * (hi - lo) : NaN, hi: hi, lo: lo }; },
    vp: function (X, I, t) { if (t < 60) return null; var a = t - 59, hi = hiN(X.h, t, 60), lo = loN(X.l, t, 60), B = 24, bins = new Array(B).fill(0), tot = 0;
      if (!(hi > lo)) return null; for (var i = a; i <= t; i++) { var v0 = X.v[i]; if (!(v0 > 0)) continue; var b1 = Math.floor((X.l[i] - lo) / (hi - lo) * (B - 1e-9)), b2 = Math.floor((X.h[i] - lo) / (hi - lo) * (B - 1e-9)); for (var b = b1; b <= b2; b++) bins[b] += v0 / (b2 - b1 + 1); tot += v0; }
      if (!tot) return null; var p = bins.indexOf(Math.max.apply(null, bins)), lo_ = p, hi_ = p, acc = bins[p];
      while (acc < 0.7 * tot && (lo_ > 0 || hi_ < B - 1)) { var nl = lo_ > 0 ? bins[lo_ - 1] : -1, nh = hi_ < B - 1 ? bins[hi_ + 1] : -1; if (nh >= nl) { hi_++; acc += nh; } else { lo_--; acc += nl; } }
      var bw = (hi - lo) / B, poc = lo + (p + 0.5) * bw, val = lo + lo_ * bw, vah = lo + (hi_ + 1) * bw, c = X.c[t];
      return { v: c > vah ? 0.5 : c < val ? -0.5 : c > poc ? 0.15 : -0.15, why: 'قیمت ' + (c > vah ? 'بالای ناحیهٔ ارزش' : c < val ? 'زیر ناحیهٔ ارزش' : 'درون ناحیهٔ ارزش') + '؛ POC ' + fa(poc), poc: poc, vah: vah, val: val }; },
    flow: function (X, I, t, rg, A) { var F = A.flowAt && A.flowAt(t); if (!F) return null; var v = clamp(F.r5 * 4, -1, 1) * 0.5 + clamp(F.r20 * 4, -1, 1) * 0.3 + (isF(F.bp) && F.bp > 0 ? clamp(Math.log(F.bp) / Math.LN2, -1, 1) * 0.2 : 0);
      return { v: clamp(v, -1, 1), why: 'خالص ورود پول حقیقی ۵ روزه ' + (F.n5 > 0 ? 'مثبت' : 'منفی') + ' (' + pct(F.r5, 0) + ' ارزش معاملات)' + (isF(F.bp) ? '، قدرت خریدار حقیقی ' + fa(F.bp, 2) : ''), net5: F.n5, r5: F.r5 }; }
  };
  // flow series aligned to bar index (TSETMC client type: individuals' buy / sell values)
  function flowAccessor(X, ct) {
    if (!ct || !ct.length) return null; var byD = {}; ct.forEach(function (r) { byD[r.date] = r; });
    var net = X.d.map(function (d) { var r = byD[d]; return r ? r.buyI - r.sellI : NaN; }), tv = X.d.map(function (d) { var r = byD[d]; return r ? r.buyI + r.buyN : NaN; });
    return function (t) { var s5 = 0, v5 = 0, s20 = 0, v20 = 0, k = 0; for (var i = t; i > t - 20 && i >= 0; i--) { if (!isF(net[i])) continue; k++; if (t - i < 5) { s5 += net[i]; v5 += tv[i]; } s20 += net[i]; v20 += tv[i]; }
      if (k < 5) return null; var r = byD[X.d[t]], bp = r && r.buyIc && r.sellIc && r.sellI ? (r.buyI / r.buyIc) / (r.sellI / r.sellIc) : NaN;
      return { n5: s5, r5: v5 ? s5 / v5 : 0, r20: v20 ? s20 / v20 : 0, bp: bp }; };
  }

  /* ---------------- universe from the hub's feeds ---------------- */
  function getStore(key, sampleFn) { var U = Hub.util; var s = U && U.store.get(key, null); return s && s.version === 1 ? s : sampleFn(); }
  function isSampleSrc(s) { return !s || /synthetic|illustrative|نمونه/i.test(s); }
  var FIXSKIP = [];
  function universe(E) {
    var SG = Hub.signals, out = [], cls = E.classes || {}; FIXSKIP = [];
    if (!SG) return out;
    var st = getStore('hub.sigstocks.v1', SG.stocks.sample), smp = isSampleSrc(st.meta.source), age = SG.dataAge ? SG.dataAge(st) : NaN, srows = {};
    try { SG.stocks.run(st).rows.forEach(function (r) { srows[r.symbol] = r; }); } catch (e) { /* composite optional */ }
    var usd = st.data && st.data._usd, idx = st.data && st.data._idx && st.data._idx.total;
    if (cls.stock !== false) st.watch.filter(function (w) { return w.active !== false && w.symbol; }).forEach(function (w) {
      var d = (st.data || {})[w.symbol]; if (!d || !d.px || d.px.length < 30) return;
      // fixed-income funds are not run through the technical signal engine (directive 19 · 2-2): their price is a smooth accrual of
      // interest; they are analysed by yield, NAV gap and liquidity on the market page and serve as the cash alternative
      if (w.ftype === 'fixed') return;
      // second route (directive 22, root cause of fixed-income funds ranked as top buys): a fund whose type the registry could not read is
      // recognised by its price behaviour — a smooth accrual (tiny daily moves, almost every day up) is a fixed-income unit, whatever its name
      if (w.ftype === 'other' || w.ftype === '' && /صندوق/.test((w.sector || '') + (w.name || '')) || w.src === 'registry' && /صندوق/.test(w.name || '')) { var cz = d.px.slice(-121).map(function (r) { return r.close; }).filter(function (v) { return v > 0; }), up = 0, sd = 0, m0 = 0, nR = cz.length - 1;
        if (nR >= 60) { var rr = []; for (var q = 1; q < cz.length; q++) { var g = cz[q] / cz[q - 1] - 1; rr.push(g); if (g > 0) up++; } m0 = rr.reduce(function (a, b) { return a + b; }, 0) / nR; sd = Math.sqrt(rr.reduce(function (a, b) { return a + (b - m0) * (b - m0); }, 0) / nR);
          if (sd < 0.0025 && up / nR > 0.75 && m0 > 0) { FIXSKIP.push({ sym: w.symbol, cls: 'fund', why: 'رفتار قیمت مانند صندوق درآمد ثابت (نوسان روزانه ' + (sd * 100).toFixed(2) + '٪، ' + Math.round(up / nR * 100) + '٪ روزها مثبت): از موتور فنی خارج شد' }); return; } } }
      out.push({ key: 's:' + w.symbol, sym: w.symbol, name: w.name || w.symbol, cls: w.ftype || /صندوق/.test(w.sector || '') ? 'fund' : 'stock', sector: w.sector || '', cs: w.cs || '', csName: w.csName || '', ftSrc: w.ftSrc || '', market: w.market || '', board: w.board || '', ftype: w.ftype || '', lim: Number(w.lim) || 0, bl: st.bl && st.bl.by ? st.bl.by[w.symbol] || null : null, blAt: st.bl ? st.bl.at : null, blT: st.bl ? st.bl.time : '', rows: d.px, ct: d.ct, sample: smp, asOf: st.meta.asOf, age: age, comp: srows[w.symbol], unit: 'ریال', pm: { src: 'TSETMC', at: st.meta.asOfTs, session: st.meta.session || null } });
    });
    var addTG = function (key, sample, c, nameKey) {
      var S = getStore(key, sample), smp2 = isSampleSrc(S.meta.source), age2 = SG.dataAge ? SG.dataAge(S) : NaN, rr = {};
      try { (c === 'gold' ? SG.gold.run(S) : SG.fx.run(S)).rows.forEach(function (r) { rr[r.key || r.series] = r; }); } catch (e) { /* optional */ }
      S.ins.filter(function (x) { return x.active !== false && x.key; }).forEach(function (x) {
        var rows = (S.data || {})[x.key]; if (!rows || rows.length < 30) return;
        if (out.some(function (a) { return a.tg === x.key; })) return;          // the free-market dollar appears in both lists
        var isFx = /^price_(dollar|eur|aed|gbp|try|cny)|tether|usdt/i.test(x.key), cl2 = isFx ? 'fx' : x.key === 'ons' ? 'gold' : c;   // a currency is FX even when it comes from the gold list (it is there as an input of the intrinsic value)
        out.push({ key: 'g:' + x.key, tg: x.key, sym: x.series, name: x.series, cls: cl2, sector: /silver/.test(x.key) ? 'نقره' : cl2 === 'gold' ? 'طلا و سکه' : 'ارز', rows: rows.map(function (r) { return { date: r.date, open: r.open, high: r.high, low: r.low, close: r.close, vol: 0, val: 0, yclose: 0, live: r.live, ts: r.ts }; }), sample: smp2, asOf: S.meta.asOf, age: age2, pm: { src: 'TGJU', at: S.meta.asOfTs, now: S.meta.now || null }, comp: rr[x.key] || rr[x.series], unit: x.key === 'ons' ? 'دلار' : 'ریال' });
      });
    };
    if (cls.gold !== false) addTG('hub.sig-gold.v1', SG.gold.sample, 'gold');
    if (cls.fx !== false) addTG('hub.sig-fx.v1', SG.fx.sample, 'fx');
    var opt = null; if (cls.option !== false) { var os = getStore('hub.sigoptions.v1', SG.options.sample); try { opt = { R: SG.options.run(os), S: os, sample: isSampleSrc(os.meta.source), asOf: os.meta.asOf, age: SG.dataAge ? SG.dataAge(os) : NaN }; } catch (e) { opt = null; } }
    return { assets: out, usd: usd, idx: idx, idxAll: st.data && st.data._idx ? { total: st.data._idx.total, ew: st.data._idx.ew } : null, idxSample: smp, opt: opt };
  }

  /* ---------------- per-asset analysis (cached) ---------------- */
  var CACHE = {};
  // full = votes for every bar (back-test); otherwise only the last TAIL bars, which is all the live cards read (a large watchlist would otherwise take minutes on a phone)
  var TAIL = 3;
  /* model votes are back-tested on the last BTWIN sessions only (≈ 3 years: the medium horizon's 700-session need + margin);
     the fixed-rule strategies (short / medium / long) still use the whole history. Keeps a 76-symbol × 1250-session validation inside a phone's memory. */
  var BTWIN = 760;
  function analyse(a, full) {
    var ck = a.key + '|' + a.rows.length + '|' + a.rows[a.rows.length - 1].date + '|' + a.rows[a.rows.length - 1].close + '|' + (a.ct ? a.ct.length : 0);
    if (CACHE[ck + '|F']) return CACHE[ck + '|F']; if (!full && CACHE[ck]) return CACHE[ck];
    var X = prep(a.rows), I = indicators(X), n = X.n, A = { flowAt: flowAccessor(X, a.ct) }, V = {}, RG = [];
    Object.keys(VOTE).forEach(function (m) { V[m] = new Array(n).fill(null); });
    var t0 = full ? Math.max(25, n - BTWIN) : Math.max(25, n - TAIL);
    for (var t = 0; t < n; t++) { var rg = regimeAt(X, I, t); RG.push(rg); if (t < t0) continue; var keepWhy = t >= n - TAIL; Object.keys(VOTE).forEach(function (m) { try { var o = VOTE[m](X, I, t, rg, A); if (o && !keepWhy) o.why = ''; V[m][t] = o; } catch (e) { V[m][t] = null; } }); }   // back-test bars keep the number, not the explanation text (memory on phones)
    var LV = Hub.longView; V.channel = new Array(n).fill(null); V.wdiv = new Array(n).fill(null);            // long-view school: log channel position and weekly RSI divergence
    if (LV && !full && n > 150) { try { var lv0 = LV.votesAt(X, n - 1); V.channel[n - 1] = lv0.channel; V.wdiv[n - 1] = lv0.wdiv; } catch (e) { /* skip */ } }
    else if (LV) for (t = Math.max(150, t0); t < n; t++) { if (t !== n - 1 && t % 5 && V.channel[t - 1]) { V.channel[t] = V.channel[t - 1]; V.wdiv[t] = V.wdiv[t - 1]; continue; }   // weekly quantities: refresh every 5th bar and on the last bar
      try { var lv = LV.votesAt(X, t); V.channel[t] = lv.channel; V.wdiv[t] = lv.wdiv; } catch (e) { /* skip */ } }
    var res = { X: X, I: I, V: V, RG: RG, A: A, full: !!full };
    // one cached analysis per asset: older versions of the same asset (before a data update) are dropped, otherwise every update added a copy
    Object.keys(CACHE).forEach(function (k) { if (k.indexOf(a.key + '|') === 0 && k.indexOf(ck) !== 0) delete CACHE[k]; });
    CACHE[ck + (full ? '|F' : '')] = res; return res;
  }
  // date-aligned close lookups for cross-asset work
  function byDate(rows) { var m = {}; (rows || []).forEach(function (r) { m[r.date] = r.close; }); return m; }
  function beta(X, refMap, t, k) { var x = [], y = []; for (var i = Math.max(1, t - k); i <= t; i++) { var a = refMap[X.d[i]], b = refMap[X.d[i - 1]]; if (a > 0 && b > 0) { x.push(Math.log(a / b)); y.push(Math.log(X.c[i] / X.c[i - 1])); } }
    if (x.length < 30) return NaN; var mx = mean(x), my = mean(y), cv = 0, vx = 0; for (var j = 0; j < x.length; j++) { cv += (x[j] - mx) * (y[j] - my); vx += (x[j] - mx) * (x[j] - mx); } return vx > 0 ? cv / vx : NaN; }

  /* full per-bar model votes for one asset (back-test window), built from its light analysis on demand and dropped after use:
     the back-test walks the assets one at a time, so a phone holds one asset's votes at a time instead of all 80 (the page used to run out of memory) */
  function fullOf(z) {
    var R = z.R, X = R.X, I = R.I, n = X.n, t0 = Math.max(25, n - BTWIN), V = Object.assign({}, z.Vs || R.V);
    Object.keys(VOTE).forEach(function (m) { V[m] = new Array(n).fill(null); });
    for (var t = t0; t < n; t++) { var keepWhy = t >= n - TAIL, rg = R.RG[t]; Object.keys(VOTE).forEach(function (m) { try { var o = VOTE[m](X, I, t, rg, R.A); if (o && !keepWhy) o.why = ''; V[m][t] = o; } catch (e) { V[m][t] = null; } }); }
    var LV = Hub.longView; V.channel = new Array(n).fill(null); V.wdiv = new Array(n).fill(null);
    if (LV) for (t = Math.max(150, t0); t < n; t++) { if (t !== n - 1 && t % 5 && V.channel[t - 1]) { V.channel[t] = V.channel[t - 1]; V.wdiv[t] = V.wdiv[t - 1]; continue; } try { var lv = LV.votesAt(X, t); V.channel[t] = lv.channel; V.wdiv[t] = lv.wdiv; } catch (e) { /* skip */ } }
    return Object.assign({}, z, { R: { X: X, I: I, V: V, RG: R.RG, A: R.A, full: true } });
  }

  /* ---------------- cross-sectional and engine-level models ---------------- */
  function crossModels(list, U, E, full) {
    // factor ranks per date: momentum 120d excl. 5d, low volatility, liquidity
    var stocks = list.filter(function (z) { return z.a.cls === 'stock' || z.a.cls === 'fund'; }), dates = {};
    stocks.forEach(function (z) { z.X = z.R.X; z.di = {}; z.X.d.forEach(function (d, i) { z.di[d] = i; dates[d] = 1; }); z.F = new Array(z.X.n).fill(null); });
    var dl = Object.keys(dates).map(Number).sort(function (a, b) { return a - b; }); if (!full) dl = dl.slice(-TAIL);
    dl.forEach(function (d) {
      var rows = []; stocks.forEach(function (z) { var i = z.di[d]; if (i == null || i < 125) return; var X = z.X, I = z.R.I, mom = X.c[i - 5] / X.c[i - 125] - 1, vl = I.vol20[i], liq = mean(X.val.slice(i - 19, i + 1)); if (isF(mom) && isF(vl)) rows.push({ z: z, i: i, mom: mom, vl: vl, liq: liq || 0 }); });
      if (rows.length < 6) return; var rk = function (k, inv) { var s = rows.slice().sort(function (p, q) { return inv ? q[k] - p[k] : p[k] - q[k]; }); s.forEach(function (r, j) { r[k + 'R'] = j / (s.length - 1); }); };
      rk('mom'); rk('vl', true); rk('liq');
      var keepW = dl.indexOf(d) >= dl.length - TAIL; rows.forEach(function (r) { var sc = r.momR * 0.5 + r.vlR * 0.3 + r.liqR * 0.2; r.z.F[r.i] = { v: clamp((sc - 0.5) * 2, -1, 1), why: keepW ? 'رتبهٔ عاملی ' + pct(sc, 0) + ' (مومنتوم ' + pct(r.momR, 0) + '، نوسان پایین ' + pct(r.vlR, 0) + '، نقدشوندگی ' + pct(r.liqR, 0) + ')' : '' }; });
    });
    stocks.forEach(function (z) { z.R.V.factor = z.F; });
    // cross-asset: beta to the free-market dollar when the dollar trends
    var usdM = byDate(U.usd), usdRows = U.usd || [], usdC = usdRows.map(function (r) { return r.close; });
    list.forEach(function (z) { var X = z.R.X; z.R.V.cross = new Array(X.n).fill(null); if (!usdRows.length || z.a.tg === 'price_dollar_rl') return;
      var ui = {}; usdRows.forEach(function (r, i) { ui[r.date] = i; });
      for (var t = full ? 60 : Math.max(60, X.n - TAIL); t < X.n; t++) { var k = ui[X.d[t]]; if (k == null || k < 50) continue; var b = beta(X, usdM, t, 60); if (!isF(b)) continue;
        var m50 = mean(usdC.slice(k - 49, k + 1)), tr = sgn(usdC[k] / m50 - 1) * (usdC[k] > usdC[k - 10] === usdC[k] > m50 ? 1 : 0.5);
        z.R.V.cross[t] = { v: clamp(b * 2, -1, 1) * tr * 0.8, why: t < X.n - TAIL ? '' : 'بتای دلاری ' + fa(b, 2) + '، روند دلار آزاد ' + (tr > 0 ? 'صعودی' : tr < 0 ? 'نزولی' : 'خنثی') }; } });
    // seasonality: mean return of the next session's Shamsi month and weekday, only when |t| ≥ 2
    var J = Hub.jalali;
    list.forEach(function (z) { var X = z.R.X; z.R.V.temporal = new Array(X.n).fill(null); if (!J || X.n < 200) return;
      var info = X.d.map(function (d) { var g = String(d), jd = J.g2d(+g.slice(0, 4), +g.slice(4, 6), +g.slice(6, 8)); return { m: J.d2j(jd).jm, w: J.dow(jd) }; });
      for (var t = full ? 200 : Math.max(200, X.n - TAIL); t < X.n; t++) { var nx = info[Math.min(t + 1, X.n - 1)], rm = [], rw = []; for (var i = 1; i <= t; i++) { var r = X.c[i] / X.c[i - 1] - 1; if (info[i].m === nx.m) rm.push(r); if (info[i].w === nx.w) rw.push(r); }
        var ts = function (a) { var s = sd(a); return a.length > 8 && s > 0 ? mean(a) / (s / Math.sqrt(a.length)) : 0; }, tm = ts(rm), tw = ts(rw), v = (Math.abs(tm) >= 2 ? sgn(tm) * 0.5 : 0) + (Math.abs(tw) >= 2 ? sgn(tw) * 0.5 : 0);
        z.R.V.temporal[t] = { v: v, why: t < X.n - TAIL ? '' : 'اثر ماه شمسی t=' + fa(tm, 1) + '، اثر روز هفته t=' + fa(tw, 1) + (v ? '' : ' — معنادار نیست') }; } });
  }
  // walk-forward logistic regression ranking (stocks); active only if out-of-sample AUC ≥ 0.55
  /* mlRank (a logistic model trained on every stock and day) and pairs depend only on the price data; they were refitted on every
     screen refresh and twice per validation. Same data → reuse the last result (and the per-bar ML votes it wrote). */
  var MEMO = {};
  function dataSig(list) { return list.map(function (z) { var X = z.R.X; return z.a.key + ':' + X.n + ':' + X.d[X.n - 1] + ':' + X.c[X.n - 1]; }).join('|'); }
  function mlRank(list) { var sg = dataSig(list), m = MEMO.ml;
    if (m && m.sig === sg) { list.forEach(function (z) { if (m.v[z.a.key]) z.R.V.mlrank = m.v[z.a.key]; }); return m.r; }
    var r = mlRank0(list), v = {}; list.forEach(function (z) { if (z.R.V.mlrank) v[z.a.key] = z.R.V.mlrank; }); MEMO.ml = { sig: sg, r: r, v: v }; return r; }
  function pairs(list) { var sg = dataSig(list); if (MEMO.pr && MEMO.pr.sig === sg) return MEMO.pr.r; var r = pairs0(list); MEMO.pr = { sig: sg, r: r }; return r; }
  function mlRank0(list) {
    var st = list.filter(function (z) { return z.a.cls === 'stock' || z.a.cls === 'fund'; }), S = [];
    var feat = function (z, t) { var X = z.R.X, I = z.R.I, c = X.c; if (t < 65 || !isF(I.adx[t]) || !isF(I.vol20[t])) return null; var F = z.R.A.flowAt ? z.R.A.flowAt(t) : null;
      return [c[t] / c[t - 20] - 1, c[t] / c[t - 60] - 1, I.rsi[t] / 100 - 0.5, c[t] / I.s50[t] - 1, I.vol20[t], F ? F.r5 : 0, I.adx[t] / 50, (c[t] - I.bbL[t]) / (I.bbU[t] - I.bbL[t]) - 0.5].map(function (x) { return isF(x) ? x : 0; }); };
    st.forEach(function (z) { var X = z.R.X; for (var t = 65; t < X.n; t++) { var f = feat(z, t); if (!f) continue; S.push({ z: z, t: t, d: X.d[t], f: f, y: t + 10 < X.n ? (X.c[t + 10] > X.c[t] ? 1 : 0) : null }); } });
    var lab = S.filter(function (s) { return s.y !== null; }); if (lab.length < 400) return { active: false, why: 'دادهٔ کافی برای آموزش نیست (' + fa(lab.length, 0) + ' نمونه)' };
    var ds = lab.map(function (s) { return s.d; }).sort(function (a, b) { return a - b; }), split = ds[Math.floor(ds.length * 0.7)];
    var train = lab.filter(function (s) { return s.d < split; }), test = lab.filter(function (s) { return s.d > split; });
    var dsTrain = train.map(function (s) { return s.d; }).sort(function (a, b) { return a - b; }); var cut = dsTrain[Math.max(0, dsTrain.length - 1)]; // purge: drop last 10 sessions of train (labels overlap test)
    var trDates = {}; train.forEach(function (s) { trDates[s.d] = 1; }); var td = Object.keys(trDates).map(Number).sort(function (a, b) { return a - b; }), purge = td[Math.max(0, td.length - 11)];
    train = train.filter(function (s) { return s.d <= purge; });
    function fit(rows) { var k = rows[0].f.length, mu = [], sg = [], w = new Array(k + 1).fill(0);
      for (var j = 0; j < k; j++) { var col = rows.map(function (r) { return r.f[j]; }); mu.push(mean(col)); sg.push(sd(col) || 1); }
      var Z = rows.map(function (r) { return r.f.map(function (x, j) { return (x - mu[j]) / sg[j]; }); });
      for (var it = 0; it < 250; it++) { var g = new Array(k + 1).fill(0); for (var i = 0; i < Z.length; i++) { var s = w[k]; for (j = 0; j < k; j++) s += w[j] * Z[i][j]; var p = 1 / (1 + Math.exp(-s)), e = p - rows[i].y; for (j = 0; j < k; j++) g[j] += e * Z[i][j]; g[k] += e; }
        for (j = 0; j <= k; j++) w[j] -= 0.5 * (g[j] / Z.length + (j < k ? 0.01 * w[j] : 0)); }
      return function (f) { var s = w[k]; for (var j = 0; j < k; j++) s += w[j] * (f[j] - mu[j]) / sg[j]; return 1 / (1 + Math.exp(-s)); }; }
    function auc(rows, P) { var sc = rows.map(function (r) { return [P(r.f), r.y]; }).sort(function (a, b) { return a[0] - b[0]; }), pos = 0, neg = 0, rs = 0; sc.forEach(function (x, i) { if (x[1]) { pos++; rs += i + 1; } else neg++; }); return pos && neg ? (rs - pos * (pos + 1) / 2) / (pos * neg) : NaN; }
    if (train.length < 200 || test.length < 100) return { active: false, why: 'دادهٔ کافی برای آزمون خارج از نمونه نیست' };
    var thin = function (rows, cap) { if (rows.length <= cap) return rows; var k = Math.ceil(rows.length / cap); return rows.filter(function (r, i) { return i % k === 0; }); };   // fitting cost grows with rows × iterations: an even-stride sample keeps a large watchlist fast
    var P1 = fit(thin(train, 30000)), A1 = auc(test, P1), hit = test.filter(function (r) { return (P1(r.f) > 0.5) === (r.y === 1); }).length / test.length;
    var active = A1 >= 0.55;
    var P2 = active ? fit(thin(lab, 30000)) : null;
    // votes: out-of-sample period uses the train-only model; today uses the model on all labelled data
    st.forEach(function (z) { var X = z.R.X; z.R.V.mlrank = new Array(X.n).fill(null); if (!active) return;
      for (var t = 65; t < X.n; t++) { if (X.d[t] <= split) continue; var f = feat(z, t); if (!f) continue; var p = (t >= X.n - 11 ? P2 : P1)(f); z.R.V.mlrank[t] = { v: clamp((p - 0.5) * 4, -1, 1), why: 'احتمال بازده مثبت ۱۰ روزه ' + pct(p, 0) + ' (AUC خارج از نمونه ' + fa(A1, 2) + ')' }; } });
    return { active: active, auc: A1, hit: hit, nTrain: train.length, nTest: test.length, split: split, why: active ? 'فعال: AUC خارج از نمونه ' + fa(A1, 2) + '، دقت ' + pct(hit, 0) : 'غیرفعال: AUC خارج از نمونه ' + fa(A1, 2) + ' کمتر از ۰٫۵۵ (قدرت پیش‌بینی کافی نیست)' };
  }
  // pairs inside a sector: z-score of the log price ratio (hedge ratio by OLS), latest bar only
  function pairs0(list) {
    var out = [], by = {}; list.filter(function (z) { return z.a.cls === 'stock' || z.a.cls === 'fund' || z.a.cls === 'gold'; }).forEach(function (z) { var k = z.a.cls === 'gold' ? 'طلا' : z.a.sector; (by[k] = by[k] || []).push(z); });
    Object.keys(by).forEach(function (sec) { var g = by[sec]; for (var i = 0; i < g.length; i++) for (var j = i + 1; j < g.length; j++) {
      var A = g[i].R.X, B = g[j].R.X, bm = {}; B.d.forEach(function (d, k) { bm[d] = B.c[k]; }); var x = [], y = [];
      for (var k = 0; k < A.n; k++) if (bm[A.d[k]] > 0) { x.push(Math.log(bm[A.d[k]])); y.push(Math.log(A.c[k])); }
      if (x.length < 120) continue; x = x.slice(-120); y = y.slice(-120);
      var rx = x.slice(1).map(function (v, k2) { return v - x[k2]; }), ry = y.slice(1).map(function (v, k2) { return v - y[k2]; }), mx = mean(rx), my = mean(ry), cv = 0, vx = 0, vy = 0;
      for (var q = 0; q < rx.length; q++) { cv += (rx[q] - mx) * (ry[q] - my); vx += (rx[q] - mx) * (rx[q] - mx); vy += (ry[q] - my) * (ry[q] - my); }
      var rho = cv / Math.sqrt(vx * vy); if (!(rho >= 0.6)) continue;
      var Mx = mean(x), My = mean(y), cxy = 0, vxx = 0; for (q = 0; q < x.length; q++) { cxy += (x[q] - Mx) * (y[q] - My); vxx += (x[q] - Mx) * (x[q] - Mx); } var bt = cxy / vxx;
      var spr = y.map(function (v, q2) { return v - bt * x[q2]; }), w = spr.slice(-60), z = (spr[spr.length - 1] - mean(w)) / sd(w);
      if (Math.abs(z) >= 2) { var cheap = z < 0 ? g[i] : g[j], dear = z < 0 ? g[j] : g[i]; out.push({ cheap: cheap.a, dear: dear.a, z: z, rho: rho, sector: sec });
        cheap.pair = { v: 0.6, why: 'ارزان‌تر از ' + dear.a.sym + ' (z نسبت قیمت ' + fa(z, 1) + '، همبستگی ' + fa(rho, 2) + ')' }; dear.pair = { v: -0.4, why: 'گران‌تر از ' + cheap.a.sym + ' (z ' + fa(-z, 1) + ')' }; } } });
    return out;
  }

  /* ---------------- ensemble at bar t ---------------- */
  var RGRP = { up: 'trend', down: 'trend', range: 'range', hv: 'vol', crisis: 'vol', unk: 'other' };
  function weights(E, rg) {
    var w = {}; Object.keys(BASEW).forEach(function (m) { if ((E.off || {})[m]) return; var b = isF(Number((E.w || {})[m])) ? Number(E.w[m]) : BASEW[m], f = FAMOF[m];
      if (f === 'trend') b *= rg === 'up' || rg === 'down' ? 1.3 : rg === 'range' ? 0.6 : 1; if (f === 'osc' && m !== 'hybrid') b *= rg === 'range' ? 1.3 : rg === 'up' || rg === 'down' ? 0.6 : rg === 'crisis' ? 0.4 : 1;
      if (E.ev && E.ev.on && E.ev.m && isF(E.ev.m[m])) b *= E.ev.m[m];   // literature prior (models tab): weaker published evidence → lower weight
      if (rg === 'hv') b *= 0.8; var lw = E.learn && E.learn.wr && E.learn.wr[RGRP[rg] || 'other']; if (lw && isF(lw[m])) b *= lw[m];   // multipliers learned from closed trades (bounded 0.5–1.5)
      w[m] = b; });
    return w;
  }
  function ensemble(z, t, E, extra) {
    var R = z.R, rg = R.RG[t], W = weights(E, rg), sum = 0, wt = 0, votes = [];
    Object.keys(W).forEach(function (m) { var o = extra && extra[m] !== undefined ? extra[m] : (R.V[m] ? R.V[m][t] : null); if (!o || !isF(o.v)) return; votes.push({ m: m, v: o.v, w: W[m], why: o.why, o: o }); sum += W[m] * o.v; wt += W[m]; });
    var S = wt ? sum / wt : 0, sg = sgn(S), agreeW = 0, nzW = 0, fam = {};
    votes.forEach(function (x) { if (x.v !== 0) { nzW += x.w; if (sgn(x.v) === sg) agreeW += x.w; } var f = FAMOF[x.m]; (fam[f] = fam[f] || []).push(x.v * x.w); });
    var famAgree = Object.keys(fam).filter(function (f) { var s = fam[f].reduce(function (a, b) { return a + b; }, 0); return sgn(s) === sg && Math.abs(s) >= 0.1; }).length;
    return { S: S, agree: nzW ? agreeW / nzW : 0, fam: famAgree, votes: votes, rg: rg, n: votes.length };
  }
  function confidence(en, n, extraPen) {
    var c0 = 35 + 55 * Math.min(1, Math.abs(en.S) / 0.6), q = n >= 200 ? 1 : n >= 120 ? 0.9 : 0.75, rq = { crisis: 0.6, hv: 0.85, unk: 0.8 }[en.rg] || 1;
    return clamp(c0 * (0.6 + 0.4 * en.agree) * q * rq - (extraPen || 0), 0, 95);
  }

  /* ---------------- trade plan for a bar ---------------- */

  /* daily price limit per asset: the symbol's own entry, else its market / board / fund type from the account table (user-supplied, Aban 1405), else the general assumption */
  var LIMD = { tse: 0.03, ifb: 0.03, yellow: 0.03, orange: 0.02, red: 0.01, etf: 0.03, lev: 0.06, gold: 0.10, fixed: 0.03 };
  var MKT = { 'بورس': 'tse', 'فرابورس': 'ifb' }, BRD = { 'زرد': 'yellow', 'نارنجی': 'orange', 'قرمز': 'red' }, FTY = { etf: 'صندوق سهامی', lev: 'صندوق اهرمی', gold: 'صندوق طلا/کالایی', fixed: 'صندوق درآمد ثابت' };
  function limitOf(a, ac) {
    if (!a || !(a.cls === 'stock' || a.cls === 'fund')) return { lim: 0, src: '' };
    var L = Object.assign({}, LIMD, (ac && ac.limits) || {}), g = function (k) { var v = Number(L[k]); return v > 0 ? v : LIMD[k]; };
    if (Number(a.lim) > 0) return { lim: Number(a.lim), src: 'دامنهٔ واردشده برای همین نماد' };
    if (a.ftype && LIMD[a.ftype]) return { lim: g(a.ftype), src: FTY[a.ftype] };
    if (a.market === 'بازار پایه') { var b = BRD[a.board]; if (b) return { lim: g(b), src: 'بازار پایهٔ ' + a.board }; return { lim: g('red'), src: 'بازار پایه با رنگ تابلوی نامشخص؛ محتاطانه‌ترین دامنه فرض شد — رنگ تابلو را در دیده‌بان وارد کنید', unk: true }; }
    if (MKT[a.market]) return { lim: g(MKT[a.market]), src: a.market };
    return { lim: Number(ac && ac.limitPct) || 0.03, src: 'فرض عمومی (بازار نماد نامشخص)' };
  }
  function plan(z, t, dir, E, opt) {
    opt = opt || {}; var X = z.R.X, I = z.R.I, V = z.R.V, c = X.c[t], atr = I.atr[t], ac = E.acct, isTSE = z.a.cls === 'stock' || z.a.cls === 'fund', LO = limitOf(z.a, ac), lim = isTSE ? LO.lim : 0;
    if (!(atr > 0)) return null;
    var smc = V.smc[t] || {}, fib = V.fib[t] || {}, vp = V.vp[t] || {}, ev = V.evidence[t] || {}, hi20 = hiN(X.h, t - 1, 20), hi60 = hiN(X.h, t, 60), lo20 = loN(X.l, t, 20);
    var basis = isF(opt.entry) ? opt.entry : c, bandHi = lim ? basis * (1 + lim) : Infinity, bandLo = lim ? basis * (1 - lim) : -Infinity;
    var P = { dir: dir, atr: atr, close: c, lim: lim, limSrc: LO.src, limUnk: !!LO.unk, bandHi: bandHi, bandLo: bandLo };
    if (dir > 0) {
      var brk = c >= hi20, trig = brk ? hi20 : NaN;               // breakout only when the close is already above the prior 20-day high
      if (opt.trigger) { P.lo = opt.trigger; P.hi = opt.trigger + 0.3 * atr; P.type = 'trigger'; P.trigger = opt.trigger; }
      else if (brk) { P.lo = c; P.hi = c + 0.3 * atr; P.type = 'breakout'; P.trigger = trig; }
      else { var sup = [I.s20[t], vp.poc, vp.vah, smc.ob && smc.ob.hi, I.s50[t]].filter(function (x) { return isF(x) && x < c && x > c - 1.2 * atr; }); P.lo = Math.max(c - 0.6 * atr, sup.length ? Math.max.apply(null, sup) : -Infinity); P.hi = c; P.type = 'pullback'; }
      if (isF(opt.entry)) { P.lo = opt.entry; P.hi = opt.entry; }
      P.clipped = P.hi > bandHi || P.lo < bandLo; P.lo = Math.max(P.lo, bandLo); P.hi = Math.min(P.hi, bandHi); if (P.hi < P.lo) P.hi = P.lo;
      P.entry = (P.lo + P.hi) / 2;
      var swl = isF(smc.swingLow) && smc.swingLow < P.entry ? smc.swingLow : lo20, st = Math.min(swl, smc.ob && smc.ob.lo < P.entry ? smc.ob.lo : Infinity) - 0.25 * atr, k = opt.short ? 2 : 2.5;
      P.stop = P.entry - st >= atr && P.entry - st <= 3.5 * atr ? st : P.entry - k * atr; P.stopSrc = P.stop === st ? 'ساختاری (کف چرخش/اوردربلاک − ۰٫۲۵ ATR)' : fa(k, 1) + ' برابر ATR';
      var R = P.entry - P.stop, cand = [hi20, hi60, vp.vah, fib.ext1, fib.ext2, fib.hi].filter(function (x) { return isF(x) && x > P.entry + 0.8 * R; }).sort(function (a, b) { return a - b; });
      var pick = function (minV, fallback) { var x = cand.filter(function (y) { return y >= minV; })[0]; return isF(x) ? x : fallback; };
      P.tp1 = pick(P.entry + R, P.entry + 1.5 * R); P.tp2 = pick(Math.max(P.tp1 + 0.5 * R, P.entry + 2 * R), Math.max(P.entry + 2.5 * R, P.tp1 + R)); P.tp3 = pick(P.tp2 + 0.5 * R, Math.max(P.entry + 4 * R, P.tp2 + R));
      P.R = R;
      // directive 23 · 1: the top of the entry zone is the highest price at which the plan still pays the minimum R:R to target 2
      // after slippage (hiRR), not the current price. Pullback: up to 0.3 ATR above the reference close (next-session headroom);
      // breakout: up to 0.3 ATR above the trigger. If hiRR is below the reference price, the zone lies under the market: buy only on a dip.
      if (!isF(opt.entry)) { var mr = Number(ac.minRR) || 1.5, sl = slipOf(z, z.a), hiRR = (P.tp2 + mr * P.stop) / (1 + mr) / (1 + sl);
        P.hiRR = hiRR; P.ref = c; var cap = P.type === 'pullback' ? c + 0.3 * atr : P.hi;
        if (hiRR <= P.stop + 0.25 * atr) { P.noRR = true; P.hi = Math.min(Math.max(cap, P.lo), bandHi); P.hiSrc = 'atr'; }   // no price above the stop pays the minimum R:R: the zone is kept, the plan fails the R:R test
        else { P.hi = Math.min(Math.max(cap, P.lo), hiRR, bandHi); P.hiSrc = P.hi === hiRR ? 'rr' : P.hi === bandHi ? 'band' : 'atr';
          if (P.hi < P.lo) { P.lo = Math.max(P.stop + 0.25 * atr, P.hi - 0.3 * atr, bandLo); P.under = true; } } }
    } else {
      P.lo = c - 0.2 * atr; P.hi = c + 0.3 * atr; P.entry = c; P.stop = Math.max(isF(smc.swingHigh) && smc.swingHigh > c ? smc.swingHigh : hi20, c + atr) + 0.25 * atr; P.R = P.stop - P.entry; P.type = 'exit';
      P.tp1 = P.entry - 1.5 * P.R; P.tp2 = P.entry - 2.5 * P.R; P.tp3 = P.entry - 4 * P.R; P.stopSrc = 'سقف چرخش یا ۱ ATR بالاتر + ۰٫۲۵ ATR';
    }
    var cost = P.entry * (Number(ac.costPct) || 0);
    P.rr1 = (Math.abs(P.tp1 - P.entry) - cost) / (P.R + cost); P.rr2 = (Math.abs(P.tp2 - P.entry) - cost) / (P.R + cost);
    P.limitDays = lim ? Math.ceil(P.R / (P.entry * lim)) : 0;
    return P;
  }
  function horizonOf(votes, S) { var w = { s: 0, m: 0, l: 0 }; votes.forEach(function (x) { if (sgn(x.v) !== sgn(S)) return; w[HZ[x.m] || 'm'] += x.w * Math.abs(x.v); });
    var k = w.s > w.m && w.s > w.l ? 's' : w.l > w.m ? 'l' : 'm'; return { k: k, fa: { s: 'کوتاه‌مدت (تا ۲ هفته)', m: 'میان‌مدت (۲ تا ۸ هفته)', l: 'بلندمدت (بیش از ۲ ماه)' }[k], days: { s: 10, m: 40, l: 120 }[k] }; }
  function nextSession(lastDate) {
    var J = Hub.jalali; if (!J) return null; var today = Math.floor(Date.now() / 864e5) + 2440588, g = String(lastDate || ''), jd = g.length === 8 ? J.g2d(+g.slice(0, 4), +g.slice(4, 6), +g.slice(6, 8)) : today - 1;
    var now = new Date(), late = now.getHours() * 60 + now.getMinutes() >= 12 * 60 + 30;       // TSE continuous trading ends 12:30 Tehran time (local clock assumed)
    var d = Math.max(jd + 1, today + (late ? 1 : 0)), H = J.holidays(d - 5, d + 40, true); for (var i = 0; i < 30; i++) { if (!J.isOff(d, 2, H)) break; d++; } return J.jstr(d);
  }

  function shamsi(g) { var J = Hub.jalali; if (!J || !g) return String(g || ''); g = String(g); return J.jstr(J.g2d(+g.slice(0, 4), +g.slice(4, 6), +g.slice(6, 8))); }
  /* ---------------- signal card (mandatory fields) ---------------- */
  var TYPE = { long: 'خرید (Long)', short: 'فروش استقراضی (Short)', close: 'بستن موقعیت / فروش در صورت داشتن', hold: 'نگه‌داری / بدون اقدام' };
  function card(z, E, ctx) {
    var X = z.R.X, t = X.n - 1, a = z.a, ac = E.acct, extra = {};
    extra.tse = a.comp && isF(a.comp.score) ? { v: clamp(a.comp.score / 10, -1, 1), why: 'امتیاز کاربرگ «سیگنال سهام» ' + fa(a.comp.score, 1) + ' از ۱۰ (' + (a.comp.signal || '') + ')' } : null;
    if (a.cls === 'gold' || a.cls === 'fx') { extra.tse = null; extra.gfx = a.comp && isF(a.comp.score) ? { v: clamp(a.comp.score / 10, -1, 1), why: 'امتیاز کاربرگ ' + (a.cls === 'gold' ? 'طلا (روند و حباب)' : 'ارز (روند و اسپرد تتر)') + ' ' + fa(a.comp.score, 1) + ' از ۱۰' } : null; }
    if (z.pair) extra.pairs = z.pair;
    var nw = (E.news || []).filter(function (x) { return x.asset && (x.asset === a.sym || x.asset === a.name || x.asset === '*'); }), shock = null;
    if (nw.length) { var last = nw[nw.length - 1], imp = { low: 0.3, med: 0.5, high: 0.8 }[last.impact] || 0.5, dirN = clamp(Number(last.dir) || 0, -1, 1); extra.sentiment = { v: dirN * imp, why: 'خبر: ' + (last.note || '—') + ' (جهت ' + fa(dirN, 1) + '، اثر ' + ({ low: 'کم', med: 'متوسط', high: 'زیاد' }[last.impact] || 'متوسط') + ')' }; if (last.impact === 'high' && last.fresh !== false) shock = last; }
    var en = ensemble(z, t, E, extra), liqOK = !(a.cls === 'stock' || a.cls === 'fund') || mean(X.val.slice(-20)) >= (Number(ac.minVal) || 0);
    var conf = Math.round(confidence(en, X.n, liqOK ? 0 : 15)), dirS = en.S >= 0.2 ? 1 : en.S <= -0.2 ? -1 : 0;
    var queue = X.lock[t] > 0 ? 'buy' : X.lock[t] < 0 ? 'sell' : null, regime = en.rg, iran = E.market !== 'global';
    var type = 'hold', status = 'قابل اجرا', strength = conf >= E.strongConf && en.fam >= 3 ? 'قوی' : conf >= E.minConf ? 'متوسط' : 'ضعیف', why = [], cond = [];
    if (dirS > 0 && conf >= E.minConf) type = 'long'; else if (dirS < 0 && conf >= E.minConf) type = iran || a.cls !== 'fx' && !E.allowShort ? 'close' : 'short';
    var P = type === 'close' || type === 'short' ? plan(z, t, -1, E) : plan(z, t, 1, E, type === 'hold' ? { trigger: hiN(X.h, t, 20) + 0.05 * z.R.I.atr[t] } : {});
    if (!P) return null;
    if (type === 'long') {
      if (regime === 'crisis') { type = 'hold'; why.push('رژیم بحرانی: خرید جدید مجاز نیست'); }
      else if (E.learn && E.learn.block && E.learn.block[regime]) { type = 'hold'; why.push('قاعدهٔ یادگیری: خرید در رژیم «' + (REG[regime] || regime) + '» متوقف است (امید ریاضی منفی در معاملات بسته‌شده)'); }
      else if (P.rr2 < (Number(ac.minRR) || 1.5)) { type = 'hold'; why.push('نسبت ریسک به بازده تا هدف ۲ (' + fa(P.rr2, 1) + ') کمتر از حداقل ' + fa(Number(ac.minRR) || 1.5, 1)); }
      if (!liqOK) { type = 'hold'; why.push('نقدشوندگی ناکافی: میانگین ارزش معاملات ۲۰ روزه کمتر از حد'); }
      if (shock && Number(shock.dir) < 0) { type = 'hold'; why.push('خبر منفی مهم: تا تأیید قیمت صبر کنید'); }
      else if (shock) { status = 'مشروط'; cond.push('خبر مهم امروز: ورود فقط پس از تثبیت قیمت یک جلسه بالای ' + fa(P.hi)); }
      if (queue === 'buy') { status = 'مشروط'; cond.push('صف خرید در جلسهٔ آخر: ورود فقط اگر صف باز شود و قیمت در محدودهٔ ورود معامله شود'); }
      if (queue === 'sell') { type = 'hold'; why.push('صف فروش در جلسهٔ آخر'); }
      if (P.type === 'breakout') cond.push('شکست: ورود فقط اگر قیمت بالای ' + fa(P.trigger) + ' تثبیت شود');
    }
    if (queue === 'buy' && type !== 'long') cond.push('صف خرید در جلسهٔ آخر: خرید در صف توصیه نمی‌شود؛ پس از باز شدن صف دوباره ارزیابی کنید');
    if (queue === 'sell' && type !== 'long') cond.push('صف فروش در جلسهٔ آخر: اگر موقعیت دارید، در اولین فرصت باز شدن صف خارج شوید');
    if (type === 'hold' && dirS > 0 && !why.length) why.push('اطمینان ' + fa(conf, 0) + '٪ کمتر از حداقل ' + fa(E.minConf, 0) + '٪');
    if (type === 'hold' && dirS === 0) why.push('رأی مدل‌ها خنثی است (امتیاز ترکیبی ' + fa(en.S, 2) + ')');
    if (a.sample) { status = 'غیرقابل اجرا — دادهٔ نمونه'; }
    else if (isF(a.age) && a.age > 48) { status = status === 'قابل اجرا' ? 'مشروط — دادهٔ کهنه' : status; cond.push('داده ' + fa(a.age / 24, 0) + ' روز قدیمی است؛ پیش از اجرا به‌روزرسانی کنید'); }
    // size
    var mult = type === 'long' || type === 'short' ? (strength === 'قوی' ? 1 : 0.5) * (status.indexOf('مشروط') === 0 ? 0.5 : 1) * (regime === 'hv' ? 0.5 : regime === 'crisis' ? 0 : 1) * (E.learn && isF(E.learn.riskMult) ? E.learn.riskMult : 1) : 0;
    var riskPct = (Number(ac.riskPct) || 0.01) * mult, vol = z.R.I.vol20[t], volCap = isF(vol) && vol > 0 ? Math.min(Number(ac.maxPosPct) || 0.15, (Number(ac.maxPosPct) || 0.15) * (Number(ac.targetVol) || 0.35) / vol) : Number(ac.maxPosPct) || 0.15;
    var perUnitRisk = P.R + P.entry * (Number(ac.costPct) || 0), posPct = Math.min(riskPct * P.entry / perUnitRisk, volCap), eq = Number(ac.equity) || NaN;
    var liqCap = (a.cls === 'stock' || a.cls === 'fund') && isF(eq) ? (Number(ac.liqPct) || 0.1) * mean(X.val.slice(-20)) / eq : Infinity; posPct = Math.min(posPct, liqCap);
    var units = isF(eq) ? Math.floor(eq * posPct / P.entry) : NaN, riskAmt = isF(units) ? units * perUnitRisk : NaN;
    var potRisk = (Number(ac.riskPct) || 0.01) * 0.5 * (regime === 'hv' ? 0.5 : regime === 'crisis' ? 0 : 1), potPct = Math.min(potRisk * P.entry / perUnitRisk, volCap, liqCap);
    var hz = horizonOf(en.votes, en.S), top = en.votes.filter(function (x) { return sgn(x.v) === sgn(en.S || 1) && x.v !== 0; }).sort(function (p, q) { return Math.abs(q.v * q.w) - Math.abs(p.v * p.w); }).slice(0, 6);
    var against = en.votes.filter(function (x) { return x.v !== 0 && sgn(x.v) !== sgn(en.S || 1); }).sort(function (p, q) { return Math.abs(q.v * q.w) - Math.abs(p.v * p.w); }).slice(0, 3);
    var inval = []; if (type === 'long' || type === 'hold') { inval.push('بسته‌شدن زیر ' + fa(P.stop)); if (P.type === 'breakout') inval.push('بازگشت و بسته‌شدن زیر سطح شکست ' + fa(P.trigger)); if (z.R.V.flow[t]) inval.push('خروج پول حقیقی ۵ روزه بیش از ۱۰٪ ارزش معاملات'); inval.push('تغییر رژیم به «روند نزولی» یا «بحرانی»'); inval.push('خروج زمانی: اگر تا ' + fa(hz.days, 0) + ' جلسه به ۰٫۵R سود نرسید'); }
    else inval.push('بسته‌شدن بالای ' + fa(P.stop) + ' (دیدگاه منفی باطل می‌شود)');
    var notes = [];
    if (a.cls === 'stock' || a.cls === 'fund') { notes.push('دامنهٔ نوسان جلسهٔ بعد (±' + pct(P.lim, 0) + '؛ مبنا: ' + P.limSrc + '): ' + fa(P.bandLo) + ' تا ' + fa(P.bandHi) + (P.clipped ? ' — محدودهٔ ورود به دامنه محدود شد' : ''));
      if (P.limitDays > 1) notes.push('حد ضرر ' + fa(P.limitDays, 0) + ' دامنهٔ نوسان فاصله دارد؛ در صف فروش ممکن است چند جلسه طول بکشد و پایین‌تر اجرا شود');
      notes.push('میانگین ارزش معاملات ۲۰ روزه: ' + fa(mean(X.val.slice(-20)) / 1e9, 1) + ' میلیارد ریال' + (liqOK ? '' : ' (کمتر از حد)')); notes.push('فروش استقراضی در بورس تهران در دسترس نیست؛ سیگنال منفی یعنی بستن یا نخریدن');
      if (a.cls === 'fund') notes.push('صندوق قابل معامله: قیمت را با ارزش خالص دارایی (NAV) مقایسه کنید'); notes.push('دامنهٔ دقیق هر نماد ممکن است متفاوت باشد (بازگشایی پس از مجمع، احتیاطی و…)؛ پیش از سفارش در TSETMC یا سامانهٔ کارگزاری ببینید'); }
    else if (a.cls === 'gold' || a.cls === 'fx') { notes.push('قیمت‌ها از TGJU (بازار آزاد)؛ اسپرد خرید و فروش فیزیکی و کارمزد صرافی/طلافروشی را کم کنید'); if (a.cls === 'gold' && a.comp && isF(a.comp.z)) notes.push('حباب نسبت به ارزش ذاتی: z = ' + fa(a.comp.z, 1)); notes.push('فروش استقراضی فیزیکی ممکن نیست؛ سیگنال منفی یعنی فروش موجودی یا نخریدن'); }
    var next = nextSession(X.d[t]);
    var timing = type === 'long' ? (P.type === 'breakout' ? 'جلسهٔ بعد (' + next + ')، فقط پس از تثبیت بالای ' + fa(P.trigger) : P.type === 'pullback' ? 'جلسهٔ بعد (' + next + ')، با سفارش محدود در محدودهٔ ورود' : 'جلسهٔ بعد (' + next + ')') : type === 'hold' ? 'فعلاً ورود نکنید؛ شرط ورود: ' + (dirS > 0 ? 'تثبیت بالای ' + fa(P.lo) : 'بهبود رأی مدل‌ها') : 'جلسهٔ بعد (' + next + ')';
    return { key: a.key, sym: a.sym, name: a.name, cls: a.cls, sector: a.sector, unit: a.unit, type: type, typeFa: TYPE[type], strength: strength, status: status, conf: conf, S: en.S, fam: en.fam, agree: en.agree, regime: regime,
      P: P, lo: P.lo, hi: P.hi, entry: P.entry, stop: P.stop, tp1: P.tp1, tp2: P.tp2, tp3: P.tp3, rr1: P.rr1, rr2: P.rr2, riskPct: riskPct * (type === 'long' || type === 'short' ? 1 : 0), posPct: type === 'long' || type === 'short' ? posPct : 0, potPct: potPct, potRisk: potRisk, units: type === 'long' || type === 'short' ? units : 0, riskAmt: riskAmt, horizon: hz, timing: timing, next: next,
      top: top, against: against, why: why, cond: cond, inval: inval, notes: notes, close: X.c[t], raw: X.raw[t], date: shamsi(X.d[t]), atr: P.atr, sample: a.sample, age: a.age, asOf: a.asOf, queue: queue, liqOK: liqOK, vol: vol, votes: en.votes,
      exit: type === 'long' ? 'هدف ۱: فروش یک‌سوم و انتقال حد ضرر به نقطهٔ ورود · هدف ۲: فروش یک‌سوم دیگر و حد ضرر متحرک (بالاترین بسته‌شدن − ۳ ATR) · باقی‌مانده تا هدف ۳ یا فعال‌شدن حد ضرر متحرک · خروج اضطراری در رژیم بحرانی یا عبور افت سرمایه از حد سخت' : type === 'close' ? 'خروج پله‌ای در محدودهٔ ورود؛ اگر موقعیت ندارید نخرید' : '—' };
  }
  // underlying price at which the option is worth `target`, at today's IV and time (bisection; calls rise and puts fall with S)
  function undFor(o, target, r) {
    var B = Hub.signals && Hub.signals.bs; if (!B || !isF(o.iv) || !(o.days > 0) || !(target > 0)) return NaN;
    var T = Math.max(o.days, 1) / 365, lo = o.strike * 0.2, hi = o.strike * 5, call = o.type === 'Call';
    for (var i = 0; i < 70; i++) { var m = (lo + hi) / 2, v = B(o.type, m, o.strike, T, r, o.iv).price; if ((v < target) === call) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  // option cards: only contracts you can buy now AND sell later (liquidity grade A/B), each with an explicit order ticket
  function optionCards(O, E) {
    if (!O || !O.R) return [];
    var ac = E.acct, eq = Number(ac.equity) || NaN, P0 = O.R.P || {}, rf = isF(P0.RiskFree) ? P0.RiskFree : 0.3, next = nextSession(null);
    var ok = function (o) { return o.liqGrade === 'A' || o.liqGrade === 'B'; };
    var buys = O.R.rows.filter(function (o) { return /buy/i.test(o.signal || '') && ok(o); }).slice(0, 25), sells = O.R.rows.filter(function (o) { return /^Sell/.test(o.signal || '') && ok(o); }).sort(function (a, b) { return (b.ivrv || 0) - (a.ivrv || 0); }).slice(0, 10);
    return buys.concat(sells).map(function (o) {
      var buy = /buy/i.test(o.signal), strong = /Strong/.test(o.signal) && o.liqGrade === 'A', p = o.price, conf = clamp(45 + Math.abs(o.score || 0) * 5 + (o.pct || 0) * 15 - (o.liqGrade === 'B' ? 8 : 0), 0, 90), mult = strong ? 1 : 0.5, size = o.size || 1000, call = o.type === 'Call';
      var two = o.bid > 0 && o.ask > 0, mid = two ? (o.bid + o.ask) / 2 : p, kind = call ? 'اختیار خرید' : 'اختیار فروش';
      var c = { key: 'o:' + o.symbol, sym: o.symbol, name: kind + ' ' + o.underlying + '، قیمت اعمال ' + fa(o.strike) + '، سررسید ' + (o.expiry || '—'), cls: 'option', sector: o.underlying, expiry: o.expiry, unit: 'ریال', strength: strong ? 'قوی' : 'متوسط', conf: conf, regime: '—', sample: O.sample, asOf: O.asOf, age: O.age };
      var liq = 'درجهٔ نقدشوندگی ' + o.liqGrade + (isF(o.spread) ? '؛ فاصلهٔ خرید و فروش ' + pct(o.spread, 1) : '') + (isF(o.avgVol) ? '؛ حجم ' + fa(o.avgVol, 0) + ' قرارداد' : '') + (isF(o.oi) ? '؛ موقعیت باز ' + fa(o.oi, 0) : '') + (isF(o.bidQ) ? '؛ عمق: ' + fa(o.bidQ, 0) + ' قرارداد در خرید / ' + fa(o.askQ, 0) + ' در فروش' : '');
      var maxC = isF(o.maxContracts) ? o.maxContracts : Infinity;
      if (buy) {
        var limit = two ? Math.min(o.ask, Math.round(mid + 0.25 * (o.ask - o.bid))) : p, maxP = two ? o.ask : p * 1.03, e = limit, stp = Math.round(e * 0.6), R = e - stp;
        var dS = call ? (isF(o.lv && o.lv.resistance) && o.lv.resistance > o.S ? o.lv.resistance - o.S : NaN) : (isF(o.lv && o.lv.support) && o.lv.support < o.S ? o.S - o.lv.support : NaN);
        var tp1 = isF(dS) && isF(o.delta) ? Math.max(e * 1.4, e + Math.abs(o.delta) * dS + 0.5 * (o.gamma || 0) * dS * dS) : e * 1.6, tp2 = Math.max(e + 2.5 * R, tp1 * 1.15), tp3 = Math.max(e + 4 * R, tp2 * 1.15);
        var u = function (x) { var v = undFor(o, x, rf); return isF(v) ? ' (≈ ' + o.underlying + ' ' + fa(v, 0) + ')' : ''; }, be = call ? o.strike + e : o.strike - e;
        Object.assign(c, { type: 'long', typeFa: 'خرید ' + kind, lo: two ? Math.min(o.bid, limit) : p, hi: maxP, entry: e, stop: stp, tp1: tp1, tp2: tp2, tp3: tp3, rr1: (tp1 - e) / R, rr2: (tp2 - e) / R,
          inval: ['کاهش قیمت اختیار به ' + fa(stp) + ' (۴۰٪ زیان)' + u(stp), call ? 'بسته‌شدن ' + o.underlying + ' زیر حمایت ' + fa(o.lv && o.lv.support) : 'بسته‌شدن ' + o.underlying + ' بالای مقاومت ' + fa(o.lv && o.lv.resistance), 'از بین رفتن قیمت خریدار (bid) در تابلو برای دو جلسه — خطر گیر افتادن'],
          exit: 'یک‌سوم در هدف ۱ و حد ضرر به قیمت خرید؛ یک‌سوم در هدف ۲؛ باقی در هدف ۳. در هر حال تا ' + (o.exitBy || 'چند روز پیش از سررسید') + ' کامل بفروشید.' });
        var perC = (e - stp) * size, riskB = isF(eq) ? eq * (Number(ac.riskPct) || 0.01) * mult : NaN, uR = isF(riskB) ? Math.floor(riskB / perC) : NaN;
        c.units = isF(uR) ? Math.min(uR, maxC) : (isF(o.maxContracts) ? o.maxContracts : NaN); c.capped = isF(uR) && uR > maxC;
        var cost = isF(c.units) ? c.units * e * size : NaN, exCash = isF(c.units) ? c.units * o.strike * size : NaN;
        c.ticket = [['قرارداد', o.symbol + ' — ' + c.name + '، هر قرارداد ' + fa(size, 0) + ' سهم'],
          ['اقدام', 'خرید ' + (isF(c.units) ? fa(c.units, 0) + ' قرارداد' : '(سرمایه را وارد کنید تا تعداد محاسبه شود)') + (c.capped ? ' — به‌خاطر نقدشوندگی از ' + fa(uR, 0) + ' کم شد' : '') + (isF(c.units) && o.askQ > 0 && c.units > o.askQ ? '. در بهترین عرضه فقط ' + fa(o.askQ, 0) + ' قرارداد هست: سفارش را پله‌ای (چند سفارش کوچک، در یک یا چند جلسه) ثبت کنید و بالاتر از سقف قیمت نخرید' : '')],
          ['زمان خرید', 'جلسهٔ ' + next + '، با سفارش محدود (نه قیمت بازار)'],
          ['شرط ورود', call ? (isF(o.lv && o.lv.support) ? 'اگر ' + o.underlying + ' پیش از خرید زیر ' + fa(o.lv.support, 0) + ' (حمایت) بسته شد، نخرید' : 'روند صعودی ' + o.underlying + ' باید ادامه داشته باشد') : (isF(o.lv && o.lv.resistance) ? 'اگر ' + o.underlying + ' پیش از خرید بالای ' + fa(o.lv.resistance, 0) + ' (مقاومت) بسته شد، نخرید' : 'روند نزولی ' + o.underlying + ' باید ادامه داشته باشد')],
          ['قیمت سفارش', fa(limit, 0) + ' ریال برای هر سهم' + (two ? '؛ بیشتر از ' + fa(maxP, 0) + ' (بهترین عرضهٔ فعلی) نخرید' : '')],
          ['مبلغ کل خرید', isF(cost) ? fa(cost, 0) + ' ریال (+ کارمزد)' : '—'],
          ['حد ضرر', fa(stp, 0) + u(stp)], ['اهداف فروش', 'هدف ۱: ' + fa(tp1, 0) + u(tp1) + ' | هدف ۲: ' + fa(tp2, 0) + u(tp2) + ' | هدف ۳: ' + fa(tp3, 0) + u(tp3)],
          ['آخرین مهلت فروش', (o.exitBy || '—') + ' — ' + fa(isF(P0.ExitDaysBeforeExpiry) ? P0.ExitDaysBeforeExpiry : 3, 0) + ' روز کاری پیش از سررسید ' + o.expiry + '؛ نزدیک سررسید خریدار کم می‌شود'],
          ['نقطهٔ سربه‌سر در سررسید', o.underlying + ' ' + (call ? 'بالای ' : 'زیر ') + fa(be, 0) + ' (قیمت اعمال ' + (call ? '+' : '−') + ' قیمت خرید)'],
          ['اعمال در سررسید', 'اگر تا سررسید نگه داشتید، فقط وقتی اعمال کنید که ' + o.underlying + (call ? ' بالاتر از ' : ' پایین‌تر از ') + fa(o.strike, 0) + ' (قیمت اعمال) باشد. سود خالص اعمال وقتی مثبت است که از ' + fa(be, 0) + ' عبور کند. ' +
            (call ? 'اعمال فیزیکی اختیار خرید یعنی خرید سهم به قیمت ' + fa(o.strike, 0) + ': حدود ' + (isF(exCash) ? fa(exCash, 0) : '—') + ' ریال نقدینگی لازم دارد.' : 'اعمال فیزیکی اختیار فروش یعنی فروش سهم به قیمت ' + fa(o.strike, 0) + ': باید ' + (isF(c.units) ? fa(c.units * size, 0) : '—') + ' سهم ' + o.underlying + ' داشته باشید.') +
            ' قبل از سررسید: اگر بهترین قیمت خرید تابلو از ارزش ذاتی کمتر بود، اعمال بهتر از فروش است؛ وگرنه فروش در بازار بهتر است (ارزش زمانی را هم می‌گیرید). روش تسویه (فیزیکی/نقدی) و مهلت ثبت درخواست اعمال را در مشخصات همین قرارداد در TSETMC ببینید.'],
          ['نقدشوندگی', liq + (isF(o.maxContracts) ? '؛ سقف قابل اجرا ' + fa(o.maxContracts, 0) + ' قرارداد' : '')]];
      } else {
        var ws = two ? Math.max(o.bid, Math.round(mid - 0.25 * (o.ask - o.bid))) : p;
        Object.assign(c, { type: 'close', typeFa: 'فروش (نوشتن) ' + kind + ' — فقط با پوشش', lo: two ? o.bid : p * 0.97, hi: two ? ws : p, entry: ws, stop: ws * 1.6, tp1: ws * 0.6, tp2: ws * 0.4, tp3: ws * 0.2, rr1: 0.67, rr2: 1,
          inval: ['افزایش قیمت اختیار به ' + fa(ws * 1.6, 0), call ? 'شکست مقاومت ' + o.underlying : 'شکست حمایت ' + o.underlying], exit: 'بازخرید در ۶۰٪ سود، یا حداکثر تا ' + (o.exitBy || 'پیش از سررسید') });
        c.units = isF(o.maxContracts) ? o.maxContracts : NaN;
        c.ticket = [['قرارداد', o.symbol + ' — ' + c.name + '، هر قرارداد ' + fa(size, 0) + ' سهم'], ['اقدام', 'فروش (نوشتن) — فقط اگر ' + (call ? fa(size, 0) + ' سهم ' + o.underlying + ' برای هر قرارداد دارید (کاورد کال)' : 'وجه تضمین کافی دارید')],
          ['زمان', 'جلسهٔ ' + next + '، سفارش محدود'], ['قیمت سفارش', 'حداقل ' + fa(ws, 0) + ' ریال برای هر سهم'], ['دلیل', 'نوسان ضمنی ' + pct(o.iv, 0) + ' در برابر نوسان تحقق‌یافتهٔ ' + pct(o.rv, 0) + ': پریمیوم گران است'],
          ['بازخرید و خروج', 'بازخرید در ' + fa(ws * 0.4, 0) + ' (۶۰٪ سود) یا اگر به ' + fa(ws * 1.6, 0) + ' رسید؛ حداکثر تا ' + (o.exitBy || '—')], ['ریسک اعمال', 'اگر در سررسید ' + o.underlying + (call ? ' بالای ' : ' زیر ') + fa(o.strike, 0) + ' باشد، اعمال می‌شود و ' + (call ? 'سهم شما به قیمت اعمال فروخته می‌شود' : 'باید سهم را به قیمت اعمال بخرید')],
          ['نقدشوندگی', liq]];
      }
      c.posPct = isF(eq) && isF(c.units) ? c.units * c.entry * size / eq : (Number(ac.riskPct) || 0.01) * mult * c.entry / Math.abs(c.entry - c.stop); c.riskPct = buy ? (Number(ac.riskPct) || 0.01) * mult : 0;
      c.horizon = { k: 's', fa: 'تا ' + (o.exitBy || o.expiry) + ' (سررسید ' + (o.expiry || '') + '، ' + fa(o.days, 0) + ' روز)', days: o.days };
      c.status = O.sample ? 'غیرقابل اجرا — دادهٔ نمونه' : c.units === 0 ? 'غیرقابل اجرا — نقدشوندگی برای حتی یک قرارداد کافی نیست' : buy ? (o.liqGrade === 'A' ? 'قابل اجرا' : 'قابل اجرا — نقدشوندگی متوسط، حجم کم') : 'مشروط — نیاز به سهم پایه یا وجه تضمین';
      c.timing = 'جلسهٔ ' + next + '، سفارش محدود';
      c.top = [{ m: 'options', why: o.why || '', v: buy ? 1 : -1, w: 1 }]; c.why = []; c.cond = o.liqGrade === 'B' ? ['نقدشوندگی متوسط: فقط با سفارش محدود و حداکثر ' + (isF(o.maxContracts) ? fa(o.maxContracts, 0) : '—') + ' قرارداد'] : [];
      c.notes = ['IV ' + pct(o.iv, 0) + '، نوسان تحقق‌یافته ' + pct(o.rv, 0) + '، نسبت ' + fa(o.ivrv, 2), 'دلتا ' + fa(o.delta, 2) + '، تتا روزانه ' + fa(o.theta, 1) + ' ریال (کاهش ارزش زمانی هر روز)', o.strikeVsLevels || '', liq,
        o.ivrv >= (P0.ExpensiveIVRatio || 1.3) ? 'IV گران: به‌جای خرید، کاورد کال (با سهم پایه) یا اسپرد را بررسی کنید' : o.ivrv <= (P0.CheapIVRatio || 0.8) ? 'IV ارزان: خرید اختیار مقرون‌به‌صرفه‌تر است' : '', 'معادل قیمت پایه با فرض ثابت ماندن IV و زمان فعلی است؛ با گذشت زمان، همان قیمت پایه ارزش کمتری برای اختیار می‌سازد.'].filter(Boolean);
      c.o = o; return c;
    });
  }
  // contracts that look attractive but cannot be traded safely — shown so the user knows why they were skipped
  function optionSkipped(O) { if (!O || !O.R) return []; return O.R.rows.filter(function (o) { return o.liqGrade === 'C' && isF(o.score) && Math.abs(o.score) >= 2; }).slice(0, 15).map(function (o) { return { sym: o.symbol, und: o.underlying, expiry: o.expiry, strike: o.strike, type: o.type, why: o.liqWhy || 'نقدشوندگی ناکافی' }; }); }

  /* ---------------- portfolio, monitoring, risk ---------------- */
  function corrOf(za, zb, k) { var A = za.R.X, B = zb.R.X, bm = {}; B.d.forEach(function (d, i) { if (i) bm[d] = Math.log(B.c[i] / B.c[i - 1]); }); var x = [], y = [];
    for (var i = Math.max(1, A.n - k); i < A.n; i++) if (isF(bm[A.d[i]])) { x.push(Math.log(A.c[i] / A.c[i - 1])); y.push(bm[A.d[i]]); }
    if (x.length < 30) return NaN; var mx = mean(x), my = mean(y), c = 0, vx = 0, vy = 0; for (var j = 0; j < x.length; j++) { c += (x[j] - mx) * (y[j] - my); vx += (x[j] - mx) * (x[j] - mx); vy += (y[j] - my) * (y[j] - my); } return c / Math.sqrt(vx * vy); }
  var BLOCK = [['رژیم بحرانی', 'رژیم بحرانی'], ['نسبت ریسک به بازده', 'R:R کمتر از حداقل'], ['نقدشوندگی', 'نقدشوندگی ناکافی'], ['خبر منفی', 'خبر منفی مهم'], ['صف فروش', 'صف فروش'], ['اطمینان', 'اطمینان کمتر از حداقل']];
  function blocker(c) { var w = (c.why || []).join(' '); for (var i = 0; i < BLOCK.length; i++) if (w.indexOf(BLOCK[i][0]) >= 0) return BLOCK[i][1]; return 'سایر'; }
  // portfolio: new buys under the constraints; in Full Systematic mode the open positions count against heat, sector and the slot limit.
  // A watch list (bullish but not yet actionable) fills the remaining slots with entry conditions; the funnel says why each asset dropped out.
  function portfolio(cards, zmap, E, mon) {
    var ac = E.acct, eq = Number(ac.equity) || NaN, full = E.mode === 'full', pick = [], out = [], watch = [], heat = 0, sec = {}, wsum = 0, held = {}, heatOld = 0, wOld = 0, maxPos = Number(ac.maxPos) || 8;
    if (full) (mon || []).forEach(function (m) { if (!m.z || m.lvl === 'crit') return; held[m.z.a.key] = m; if (isF(eq) && eq > 0) { heatOld += (m.risk || 0) / eq; var w = (m.value || 0) / eq; wOld += w; sec[m.z.a.sector] = (sec[m.z.a.sector] || 0) + w; } });
    var slots = Math.max(0, maxPos - Object.keys(held).length);
    heat = heatOld;
    var base = cards.filter(function (c) { return c.cls !== 'option'; });
    base.filter(function (c) { return c.type === 'long'; }).sort(function (a, b) { return b.conf - a.conf; }).forEach(function (c) {
      var why = null;
      if (held[c.key]) why = 'در سبد فعلی شماست (زبانهٔ پایش)';
      else if (c.status.indexOf('غیرقابل') === 0) why = 'دادهٔ نمونه — ابتدا داده را به‌روز کنید';
      else if (c.status.indexOf('مسدود') === 0) why = c.status;
      else if (pick.length >= slots) why = 'سقف تعداد موقعیت (' + fa(maxPos, 0) + ')';
      else if (heat + c.riskPct > (Number(ac.maxHeat) || 0.06) + 1e-9) why = 'سقف ریسک کل سبد (' + pct(Number(ac.maxHeat) || 0.06, 1) + ')';
      else if ((sec[c.sector] || 0) + c.posPct > (Number(ac.sectorCap) || 0.3) + 1e-9) why = 'سقف وزن گروه «' + c.sector + '»';
      else { var hi = pick.filter(function (p) { var r = corrOf(zmap[c.key], zmap[p.key], 60); return isF(r) && r >= (Number(ac.corrMax) || 0.8); })[0]; if (hi) why = 'همبستگی بالا با ' + hi.sym; }
      if (why) { out.push({ c: c, why: why }); return; }
      pick.push(c); heat += c.riskPct; sec[c.sector] = (sec[c.sector] || 0) + c.posPct; wsum += c.posPct;
    });
    // watch list: bullish lean, real data, not held, not already picked
    var wMax = Math.max(slots - pick.length, 5);
    // watch list = what the central engine calls «conditional» or «re-evaluate» (a rejected or expired call is not waiting for anything)
    base.filter(function (c) { return c.type === 'hold' && c.S >= 0.1 && !c.sample && !held[c.key] && c.potPct > 0 && (!c.central || c.central.st === 'cond' || c.central.st === 'review'); }).sort(function (a, b) { return b.conf - a.conf || b.S - a.S; }).forEach(function (c) {
      if (watch.length >= wMax) return; watch.push({ c: c, why: blocker(c), trig: c.timing });
    });
    // funnel
    var N = base.length, bull = base.filter(function (c) { return c.S >= 0.2; }), confOK = bull.filter(function (c) { return c.conf >= E.minConf; }), lg = base.filter(function (c) { return c.type === 'long'; }), real = lg.filter(function (c) { return !c.sample; });
    var lost = {}; confOK.filter(function (c) { return c.type !== 'long'; }).forEach(function (c) { var k = blocker(c); lost[k] = (lost[k] || 0) + 1; });
    var funnel = [['دارایی با دادهٔ کافی', N, ''], ['جهت صعودی (امتیاز ترکیبی ≥ ۰٫۲)', bull.length, fa(N - bull.length, 0) + ' دارایی جهت خنثی یا نزولی دارند'],
      ['اطمینان ≥ ' + fa(E.minConf, 0) + '٪', confOK.length, fa(bull.length - confOK.length, 0) + ' دارایی صعودی‌اند اما اطمینان کافی ندارند'],
      ['عبور از فیلترهای ریسک', lg.length, Object.keys(lost).map(function (k) { return k + ': ' + fa(lost[k], 0); }).join('، ') || '—'],
      ['دادهٔ واقعی (نه نمونه)', real.length, fa(lg.length - real.length, 0) + ' سیگنال روی دادهٔ نمونه است'],
      ['ورود به سبد (پس از قیود سبد)', pick.length, out.filter(function (x) { return !/نمونه/.test(x.why); }).length ? fa(out.filter(function (x) { return !/نمونه/.test(x.why); }).length, 0) + ' سیگنال به دلیل قیود سبد کنار رفت' : '—']];
    var near = base.filter(function (c) { return c.type === 'hold' && c.S >= 0.2 && !c.sample && blocker(c) === 'اطمینان کمتر از حداقل' && c.conf >= E.minConf - 10; }).length;
    var byClass = {}; pick.forEach(function (c) { var k = c.cls === 'fund' ? 'stock' : c.cls; byClass[k] = (byClass[k] || 0) + c.posPct; });
    return { pick: pick, out: out, watch: watch, held: held, heat: heat, heatOld: heatOld, weightOld: wOld, weight: wsum, cash: Math.max(0, 1 - wsum - wOld), byClass: byClass, funnel: funnel, near: near, slots: slots, full: full };
  }
  // mode-specific output: an ordered action list for the next session
  function actionPlan(E, cards, pf, mon, rk, C) {
    var m = E.mode, A = [], add = function (pri, kind, asset, act, when, ref) { A.push({ pri: pri, kind: kind, asset: asset, act: act, when: when || '', ref: ref }); };
    var useMon = m === 'monitor' || m === 'full', useNew = m !== 'monitor';
    if (/^اضطراری|^کاهش/.test(rk.state)) add(0, 'قاعدهٔ ریسک حساب', 'کل حساب', rk.state, 'فوری');
    if (useMon) mon.forEach(function (x) { var pr = x.lvl === 'crit' ? 1 : x.lvl === 'warn' ? 3 : x.lvl === 'good' ? 2 : 8; if (true) add(pr, pr === 1 ? 'خروج' : pr === 2 ? 'مدیریت موقعیت' : pr === 3 ? 'بازبینی' : 'نگه‌داری', x.p.asset, x.act, pr <= 2 ? 'جلسهٔ بعد' : '', x); });
    // signal-only: one line per asset from the central record — the action follows the asset's state and whether you hold it
    if (m === 'signal' && C) { var PR = { close: 1, sell: 1, reduce: 2, buy: 3, scale: 3, hold: 5, wait: 6, none: 9 };
      cards.forEach(function (c) { var r = C.by[c.key]; if (!r || (r.act === 'none' && !r.held)) return;
        var lv = isF(r.lo) ? 'ورود ' + fa(r.lo) + '–' + fa(r.hi) + '، حد ضرر ' + fa(r.stop) + (r.tp.length ? '، اهداف ' + r.tp.map(function (t) { return fa(t); }).join(' / ') : '') : '';
        add(PR[r.act] || 7, r.actFa, c.sym, r.stFa + (lv ? ' · ' + lv : '') + ' — ' + r.actWhy, r.act === 'buy' || r.act === 'scale' ? c.timing : r.act === 'wait' ? 'پس از تحقق شرط' : 'جلسهٔ بعد', c); });
      var nNone = cards.filter(function (c) { var r = C.by[c.key]; return r && r.act === 'none' && !r.held; }).length; if (nNone) add(10, 'عدم اقدام', fa(nNone, 0) + ' دارایی', 'سیگنال معتبری ندارند یا نزولی‌اند و آن‌ها را ندارید؛ فهرست کامل در «سیگنال‌ها».', ''); }
    else if (m === 'signal') cards.filter(function (c) { return c.type !== 'hold'; }).forEach(function (c) { add(c.type === 'long' ? 4 : 5, c.typeFa, c.sym, c.type === 'long' ? 'ورود ' + fa(c.lo) + '–' + fa(c.hi) + '، حد ضرر ' + fa(c.stop) + '، هدف ۲ ' + fa(c.tp2) + '، حجم ' + pct(c.posPct, 1) + ' (' + c.strength + '، ' + c.status + ')' : 'اگر دارید، خارج شوید یا نخرید (اطمینان ' + fa(c.conf, 0) + '٪)', c.timing, c); });
    else if (useNew && !/^اضطراری|^کاهش/.test(rk.state)) {
      pf.pick.forEach(function (c) { add(4, 'خرید جدید', c.sym, 'سفارش محدود ' + fa(c.lo) + '–' + fa(c.hi) + '، حد ضرر ' + fa(c.stop) + '، هدف‌ها ' + fa(c.tp1) + ' / ' + fa(c.tp2) + ' / ' + fa(c.tp3) + '، وزن ' + pct(c.posPct, 1) + (isF(c.units) && c.units ? ' (' + fa(c.units, 0) + ' واحد)' : ''), c.timing, c); });
      pf.watch.forEach(function (w) { var r = C && C.by[w.c.key]; add(6, 'انتظار برای تأیید', w.c.sym, 'هنوز خرید نکنید — ' + (r ? r.stFa + ': ' + r.why : 'مانع: ' + w.why) + '. وزن در صورت فعال شدن ' + pct(w.c.potPct, 1), w.trig, w.c); });
    }
    // full: assets with a valid bearish view that you do not hold → «no action (do not buy)»; options without history are not listed
    if (m === 'full') cards.filter(function (c) { return c.type === 'close' && c.cls !== 'option' && !mon.some(function (x) { return x.z && x.z.a.key === c.key; }); }).slice(0, 10).forEach(function (c) { var r = C && C.by[c.key]; add(7, 'عدم اقدام', c.sym, 'دید نزولی (اطمینان ' + fa(c.conf, 0) + '٪) و این دارایی را ندارید: خرید نکنید؛ اگر دارید آن را در «پایش موقعیت‌ها» ثبت کنید تا اقدام فروش/کاهش محاسبه شود', '', c); });
    return A.sort(function (a, b) { return a.pri - b.pri; });
  }
  var MODES = {
    signal: { fa: 'فقط سیگنال (Signal-Only)', does: 'برای هر دارایی جداگانه یک سیگنال کامل می‌سازد؛ قیود سبد و موقعیت‌های باز شما را در نظر نمی‌گیرد.', out: 'فهرست همهٔ سیگنال‌های خرید و بستن با ورود، حد ضرر، اهداف و حجم مستقل هر کدام.', where: 'زبانهٔ «خروجی حالت» و «سیگنال‌ها»', fit: 'دیدن فرصت‌ها، بدون تصمیم دربارهٔ کل سرمایه' },
    portfolio: { fa: 'ساخت سبد (Portfolio Construction)', does: 'سیگنال‌های خرید را با قیود سبد (تعداد، ریسک کل، سقف گروه، همبستگی) به یک سبد تازه تبدیل می‌کند و جای خالی را با فهرست انتظار پر می‌کند.', out: 'سبد پیشنهادی با وزن، تعداد و مبلغ هر نماد، تخصیص به سهام/طلا/ارز/نقد، فهرست انتظار و قیف دلیل حذف.', where: 'زبانهٔ «خروجی حالت» و «ساخت سبد»', fit: 'شروع از نقد یا ساخت سبد جدید' },
    monitor: { fa: 'پایش موقعیت‌ها (Position Monitoring)', does: 'فقط موقعیت‌های بازی را که در «پایش موقعیت‌ها» ثبت کرده‌اید با آخرین داده بررسی می‌کند؛ خرید جدید پیشنهاد نمی‌شود.', out: 'برای هر موقعیت: نگه‌داری، خروج، فروش پله‌ای، حد ضرر سربه‌سر یا متحرک، خروج زمانی؛ به‌علاوهٔ ریسک دفتر فعلی.', where: 'زبانهٔ «خروجی حالت»، «پایش موقعیت‌ها» و «مدیریت ریسک»', fit: 'مدیریت روزانهٔ سبدی که دارید' },
    full: { fa: 'سیستماتیک کامل (Full Systematic)', does: 'همهٔ مراحل به ترتیب: قواعد ریسک حساب ← خروج‌ها و تنظیم حد ضررهای سبد فعلی ← خرید جدید فقط در ظرفیت باقی‌مانده (ریسک، تعداد و وزن گروه موقعیت‌های باز کم می‌شود) ← فهرست انتظار ← نمادهایی که نباید خرید.', out: 'یک برنامهٔ اقدام اولویت‌بندی‌شده برای جلسهٔ بعد که مستقیم قابل اجراست.', where: 'زبانهٔ «خروجی حالت» (برنامهٔ اقدام)', fit: 'اجرای کامل و منضبط سیستم، هر روز' } };
  function monitor(E, zmap, cardsByKey) {
    var J = Hub.jalali, today = Math.floor(Date.now() / 864e5) + 2440588;
    return (E.positions || []).filter(function (p) { return p.asset; }).map(function (p) {
      var z = Object.keys(zmap).map(function (k) { return zmap[k]; }).filter(function (x) { return x.a.sym === p.asset || x.a.name === p.asset; })[0], o = { p: p };
      if (!z) { o.act = 'دادهٔ این دارایی در فیدها نیست'; o.lvl = 'warn'; return o; }
      var X = z.R.X, t = X.n - 1, c = X.c[t], atr = z.R.I.atr[t], en = Number(p.entry), st = Number(p.stop), q = Number(p.qty) || 0, R = en - st;
      o.close = c; o.pl = en > 0 ? c / en - 1 : NaN; o.r = R > 0 ? (c - en) / R : NaN; o.plAmt = q * (c - en);
      var hiC = Math.max.apply(null, X.c.slice(Math.max(0, t - 60))), chand = hiC - 3 * atr, d0 = J ? J.parse(p.date) : NaN, held = isF(d0) ? Math.round((today - d0) * 5 / 7) : NaN, cd = cardsByKey[z.a.key];
      o.held = held; o.atr = atr; o.chand = chand;
      if (c <= st) { o.act = 'خروج فوری: حد ضرر فعال شده (' + fa(st) + ')'; o.lvl = 'crit'; }
      else if (cd && cd.type === 'close' && cd.conf >= E.minConf) { o.act = 'خروج یا کاهش: سیگنال موتور منفی شده (اطمینان ' + fa(cd.conf, 0) + '٪)'; o.lvl = 'crit'; }
      else if (cd && cd.regime === 'crisis') { o.act = 'خروج اضطراری: رژیم بحرانی'; o.lvl = 'crit'; }
      else if (isF(Number(p.tp1)) && c >= Number(p.tp1) && !p.partial) { o.act = 'فروش یک‌سوم در هدف ۱ و انتقال حد ضرر به ' + fa(en); o.lvl = 'good'; o.newStop = en; }
      else if (o.r >= 2) { o.newStop = Math.max(st, chand, en); o.act = 'حد ضرر متحرک: انتقال به ' + fa(o.newStop) + ' (بالاترین بسته‌شدن − ۳ ATR)'; o.lvl = 'good'; }
      else if (o.r >= 1 && st < en) { o.newStop = en; o.act = 'انتقال حد ضرر به نقطهٔ سربه‌سر (' + fa(en) + ')'; o.lvl = 'good'; }
      else if (isF(held) && cd && held > cd.horizon.days && o.r < 0.5) { o.act = 'خروج زمانی: ' + fa(held, 0) + ' جلسه بدون پیشرفت کافی'; o.lvl = 'warn'; }
      else { o.act = 'نگه‌داری؛ حد ضرر فعلی معتبر است'; o.lvl = 'ok'; }
      o.risk = q * Math.max(0, c - Math.max(st, o.newStop || st)); o.value = q * c; o.z = z; return o;
    });
  }
  function risk(E, zmap, mon, pf, U) {
    var ac = E.acct, eq = Number(ac.equity) || NaN, pk = Number(ac.peak) || eq, dd = isF(eq) && pk > 0 ? eq / pk - 1 : NaN;
    var state = !isF(dd) ? 'نامشخص (سرمایه و سقف سرمایه را وارد کنید)' : -dd >= (Number(ac.ddHard) || 0.2) ? 'اضطراری: بستن همهٔ موقعیت‌ها و توقف معامله' : -dd >= (Number(ac.ddSoft) || 0.1) ? 'کاهش: ورود جدید ممنوع، ریسک هر معامله نصف' : 'عادی';
    var book = mon.filter(function (m) { return m.z && Number(m.p.qty) > 0; }).map(function (m) { return { z: m.z, units: Number(m.p.qty), label: m.p.asset, src: 'باز' }; });
    pf.pick.forEach(function (c) { if (isF(c.units) && c.units > 0) book.push({ z: zmap[c.key], units: c.units, label: c.sym, src: 'پیشنهادی' }); });
    var dates = null; book.forEach(function (b) { var s = {}; b.z.R.X.d.forEach(function (d) { s[d] = 1; }); dates = dates ? dates.filter(function (d) { return s[d]; }) : Object.keys(s).map(Number); });
    dates = (dates || []).sort(function (a, b) { return a - b; }).slice(-250);
    var pnl = []; for (var i = 1; i < dates.length; i++) { var s = 0; book.forEach(function (b) { var X = b.z.R.X, m = {}; if (!b.m) { X.d.forEach(function (d, k) { m[d] = X.c[k]; }); b.m = m; } s += b.units * (b.m[dates[i]] - b.m[dates[i - 1]]); }); pnl.push(s); }
    var srt = pnl.slice().sort(function (a, b) { return a - b; }), q = function (p) { return srt.length ? -srt[Math.floor(srt.length * p)] : NaN; }, sgm = sd(pnl);
    var value = book.reduce(function (s, b) { return s + b.units * b.z.R.X.c[b.z.R.X.n - 1]; }, 0);
    var idxM = byDate(U.idx), usdM = byDate(U.usd), lim = Number(ac.limitPct) || 0.03;
    var stress = [['شاخص کل −۱۰٪', function (b) { var bt = beta(b.z.R.X, idxM, b.z.R.X.n - 1, 120); return isF(bt) ? -0.10 * bt : NaN; }], ['دلار آزاد +۲۰٪', function (b) { var bt = beta(b.z.R.X, usdM, b.z.R.X.n - 1, 120); return isF(bt) ? 0.20 * bt : NaN; }],
      ['دلار آزاد −۱۰٪', function (b) { var bt = beta(b.z.R.X, usdM, b.z.R.X.n - 1, 120); return isF(bt) ? -0.10 * bt : NaN; }], ['سه جلسه صف فروش (کف دامنه)', function (b) { return b.z.a.cls === 'stock' || b.z.a.cls === 'fund' ? Math.pow(1 - limitOf(b.z.a, ac).lim, 3) - 1 : 0; }], ['بحران فراگیر −۱۵٪', function () { return -0.15; }]]
      .map(function (s) { var tot = 0, miss = 0; book.forEach(function (b) { var r = s[1](b); if (!isF(r)) { miss++; r = 0; } tot += b.units * b.z.R.X.c[b.z.R.X.n - 1] * r; }); return { name: s[0], pnl: tot, pct: isF(eq) ? tot / eq : NaN, miss: miss }; });
    var labels = book.map(function (b) { return b.label + ' (' + b.src + ')'; }), corr = book.map(function (a) { return book.map(function (b) { return a === b ? 1 : corrOf(a.z, b.z, 60); }); });
    var heatOpen = mon.reduce(function (s, m) { return s + (m.risk || 0); }, 0);
    var rules = [['حداکثر ریسک هر معامله', pct(Number(ac.riskPct), 2) + ' از سرمایه'], ['حداکثر ریسک کل (heat)', pct(Number(ac.maxHeat), 1) + (isF(eq) ? ' — باز: ' + pct(heatOpen / eq, 2) + '، پیشنهادی: ' + pct(pf.heat, 2) : '')], ['افت سرمایه — حد نرم', pct(Number(ac.ddSoft), 0) + ': توقف ورود جدید و نصف‌شدن ریسک'], ['افت سرمایه — حد سخت', pct(Number(ac.ddHard), 0) + ': بستن همه و توقف'], ['همبستگی', 'دو موقعیت با همبستگی ≥ ' + fa(Number(ac.corrMax), 2) + ' هم‌زمان باز نمی‌شوند'], ['رژیم بحرانی', 'هیچ خرید جدیدی؛ موقعیت‌ها با حد ضرر تنگ‌تر'], ['صف فروش', 'موقعیت در صف فروش: خروج در اولین فرصت باز شدن صف']];
    return { dd: dd, state: state, var95: q(0.05), var99: q(0.01), pvar95: 1.645 * sgm, pvar99: 2.326 * sgm, nDays: pnl.length, value: value, stress: stress, corr: corr, labels: labels, rules: rules, heatOpen: heatOpen, eq: eq };
  }

  /* ---------------- back-test (same votes, long-only, next-bar entry) ---------------- */
  function simTrades(z, E, decide, from) {
    var X = z.R.X, I = z.R.I, n = X.n, tr = [], pos = null, cost = Number(E.acct.costPct) || 0, lim = limitOf(z.a, E.acct).lim;
    for (var t = from; t < n - 1; t++) {
      if (pos) { var o = X.o[t + 1], h = X.h[t + 1], l = X.l[t + 1], c = X.c[t + 1], done = false; pos.days++;
        var shut = function (px, frac, why) { pos.r += frac * ((px - pos.e) / pos.R); pos.left -= frac; if (pos.left <= 1e-9) { pos.r -= cost * pos.e / pos.R; pos.exit = why; tr.push(pos); pos = null; done = true; } };
        var lockDn = lim && h === l && c < X.c[t];
        if (pos.pend) { if (!lockDn) shut(o, pos.left, 'stop-queue'); continue; }
        if (l <= pos.stop) { if (lockDn) { pos.pend = true; continue; } shut(Math.min(o, pos.stop), pos.left, 'stop'); }
        if (!done && !pos.t1 && h >= pos.tp1) { pos.t1 = true; shut(pos.tp1, 1 / 3, 'tp1'); if (pos) pos.stop = Math.max(pos.stop, pos.e); }
        if (!done && pos && pos.t1 && !pos.t2 && h >= pos.tp2) { pos.t2 = true; shut(pos.tp2, 1 / 3, 'tp2'); }
        if (!done && pos && pos.t2 && h >= pos.tp3) shut(pos.tp3, pos.left, 'tp3');
        if (!done && pos && pos.t2) pos.stop = Math.max(pos.stop, hiN(X.c, t + 1, 22) - 3 * I.atr[t + 1]);
        if (!done && pos && pos.days >= pos.hz && pos.r + pos.left * ((c - pos.e) / pos.R) < 0.5) shut(c, pos.left, 'time');
        continue; }
      var d = decide(t); if (!d) continue;
      var op = X.o[t + 1]; if (lim && X.h[t + 1] === X.l[t + 1] && X.c[t + 1] > X.c[t]) continue;   // locked limit-up: cannot buy
      var P = plan(z, t, 1, E, { entry: op, short: d.hz === 's' }); if (!P || !(P.R > 0)) continue;
      pos = { e: op, cr: cost * op / P.R, stop: P.stop, R: P.R, tp1: P.tp1, tp2: P.tp2, tp3: P.tp3, r: 0, left: 1, t: t + 1, d: X.d[t + 1], days: 0, hz: d.days || 40, hk: d.hz, conf: d.conf, t1: false, t2: false, rg: d.rg, v: d.v, agree: d.agree };
    }
    return tr;
  }
  function stats(tr) { if (!tr.length) return { n: 0 }; var w = tr.filter(function (x) { return x.r > 0; }), l = tr.filter(function (x) { return x.r <= 0; }), gw = w.reduce(function (s, x) { return s + x.r; }, 0), gl = -l.reduce(function (s, x) { return s + x.r; }, 0);
    var cum = 0, pk = 0, mdd = 0; tr.slice().sort(function (a, b) { return a.d - b.d; }).forEach(function (x) { cum += x.r; pk = Math.max(pk, cum); mdd = Math.min(mdd, cum - pk); });
    var p = w.length / tr.length, aw = w.length ? gw / w.length : 0, al = l.length ? gl / l.length : 0, k = al > 0 && aw > 0 ? p - (1 - p) / (aw / al) : NaN;
    return { n: tr.length, hit: p, avgR: (gw - gl) / tr.length, pf: gl > 0 ? gw / gl : NaN, mdd: mdd, totR: gw - gl, avgW: aw, avgL: al, kelly: k, days: mean(tr.map(function (x) { return x.days; })) }; }
  /* ---------------- strategies per horizon (directive: multi-timeframe selection, validation gate, controlled learning) ----------------
   * s = swing (days–weeks, hold ≤ 10 sessions) · m = position (weeks–months, ≤ 40) · l = investment (months+, ≤ 120; needs ≥ 2 years of data).
   * Intraday is not covered: no intraday data source is connected. Every rule has fixed parameters chosen in advance; the
   * sensitivity test re-runs it with a lower and a higher parameter — a strategy whose result depends on one setting is rejected.
   * The ensemble's own trades are split by the horizon the engine gave them. Thresholds differ by horizon (more trades are
   * required where trades are cheap to generate). */
  var HZN = { s: { fa: 'کوتاه‌مدت (چند روز تا چند هفته)', win: 5, n: 30, oos: 12, mdd: -15 }, m: { fa: 'میان‌مدت (چند هفته تا چند ماه)', win: 10, n: 20, oos: 8, mdd: -15 }, l: { fa: 'بلندمدت (چند ماه به بالا)', win: 20, n: 10, oos: 4, mdd: -10 } };
  /* history needed per horizon, in trading sessions (Iran ≈ 240 a year), set by the strategies themselves:
     warm = longest look-back of that horizon's strategies including the high value of the sensitivity test
            (s: MA200 filter → 200; m: MA200 + brk55 at 70 → 200; l: ltrend needs p + 250 with p up to 250 → 500);
     test = years of out-of-sample-capable history for walk-forward blocks: s 1 year, m 2 years, l 3 years
            (holding periods 10 / 40 / 120 sessions → about 24 / 6 / 2 independent trades per asset a year);
     need = warm + test, rounded up; min = the per-asset floor to issue a signal at all (warm + 60 sessions).
     The download target is the largest need, so one fetch serves all three horizons. */
  var HIST = { s: { warm: 200, test: 240, need: 450, min: 260 }, m: { warm: 200, test: 480, need: 700, min: 260 }, l: { warm: 500, test: 720, need: 1250, min: 560 } }; HIST.max = 1250;
  var STRATS = {
    brk: { h: 's', fa: 'شکست سقف کوتاه‌مدت', days: 10, p: [20, 15, 25], f: function (X, I, t, p) { return X.c[t] > hiN(X.h, t - 1, p) && X.c[t - 1] <= hiN(X.h, t - 2, p); } },
    pb: { h: 's', fa: 'پولبک به میانگین ۲۰ در روند صعودی', days: 10, p: [20, 15, 30], f: function (X, I, t, p) { var m = p === 20 ? I.s20 : null, mv = m ? m[t] : mean(X.c.slice(t - p + 1, t + 1)); return X.l[t] <= mv && X.c[t] > mv && I.s50[t] > I.s200[t] && I.s50[t] > I.s50[t - 5]; } },
    mrev: { h: 's', fa: 'بازگشت به میانگین (RSI پایین در روند بلندمدت صعودی)', days: 10, p: [30, 25, 35], f: function (X, I, t, p) { return I.rsi[t] < p && I.rsi[t - 1] >= p && X.c[t] > I.s200[t]; } },
    trend: { h: 'm', fa: 'روندی (قیمت > میانگین ۵۰ > میانگین ۲۰۰)', days: 40, p: [50, 40, 60], f: function (X, I, t, p) { var a = p === 50 ? I.s50[t] : mean(X.c.slice(t - p + 1, t + 1)), a1 = p === 50 ? I.s50[t - 1] : mean(X.c.slice(t - p, t)), a5 = p === 50 ? I.s50[t - 5] : mean(X.c.slice(t - p - 4, t - 4)); return X.c[t] > a && a > I.s200[t] && a > a5 && !(X.c[t - 1] > a1 && a1 > I.s200[t - 1]); } },
    mom: { h: 'm', fa: 'مومنتوم (بازده ۶۰ روزه بالا و ۲۰ روزه مثبت)', days: 40, p: [0.15, 0.10, 0.20], f: function (X, I, t, p) { var r60 = X.c[t] / X.c[t - 60] - 1, r20 = X.c[t] / X.c[t - 20] - 1, p60 = X.c[t - 1] / X.c[t - 61] - 1; return r60 > p && r20 > 0 && !(p60 > p); } },
    brk55: { h: 'm', fa: 'شکست سقف ۵۵ روزه', days: 40, p: [55, 40, 70], f: function (X, I, t, p) { return X.c[t] > hiN(X.h, t - 1, p) && X.c[t - 1] <= hiN(X.h, t - 2, p); } },
    ltrend: { h: 'l', fa: 'روند بلندمدت (بالای میانگین ۲۰۰ صعودی و بازده سالانه مثبت)', days: 120, p: [200, 150, 250], f: function (X, I, t, p) { if (t < p + 250) return false; var a = mean(X.c.slice(t - p + 1, t + 1)), a20 = mean(X.c.slice(t - p - 19, t - 19)), ap = mean(X.c.slice(t - p, t)); return X.c[t] > a && a > a20 && X.c[t] / X.c[t - 250] > 1 && !(X.c[t - 1] > ap); } },
    hi52: { h: 'l', fa: 'شکست سقف ۵۲ هفته', days: 120, p: [250, 200, 300], f: function (X, I, t, p) { if (t < p + 1) return false; return X.c[t] > hiN(X.h, t - 1, p) && X.c[t - 1] <= hiN(X.h, t - 2, p); } } };
  var STRFA = { ens: 'ترکیبی موتور (رأی مدل‌ها + جریان پول)' }; Object.keys(STRATS).forEach(function (k) { STRFA[k] = STRATS[k].fa; });
  function stratTrades(list, E, k, p) { var out = []; list.forEach(function (z) { if (z.a.cls === 'option') return; var Xz = z.R.X, Iz = z.R.I, S0 = STRATS[k];
    var tr2 = simTrades(z, E, function (t) { return t >= 200 && S0.f(Xz, Iz, t, p) ? { conf: 0, days: S0.days, hz: S0.h, rg: z.R.RG[t] } : null; }, 60); tr2.forEach(function (x) { x.asset = z.a.sym; x.cls = z.a.cls; }); out = out.concat(tr2); }); return out; }
  /* selection per market × horizon: every test must pass (sample, out-of-sample, walk-forward blocks, doubled cost, drawdown,
     parameter sensitivity); among those, stability score = out-of-sample R × share of positive blocks. Hysteresis: the strategy
     selected in the previous validation is kept unless it fails or a challenger beats it by more than 25% (no switching for a short-term better return). */
  function stratSel(bt, E, list) {
    var th = Object.assign({}, VTH, E.val && E.val.th), rp = Number(E.acct.riskPct) || 0.01, out = {}, prev = E.val && E.val.db && E.val.db.strat || {};
    Object.keys(bt.strat || {}).forEach(function (key) { var o = bt.strat[key], cls = key.split('|')[0], h = key.split('|')[1], H = HZN[h], rows = {};
      Object.keys(o).forEach(function (k) { var v = vstats(o[k], bt.split, rp); if (!v.n) { rows[k] = { fa: STRFA[k], n: 0, ok: false, fails: ['هیچ معامله‌ای'], oos: { n: 0 }, byRg: {} }; return; } var fr = v.nFolds ? v.posFolds / v.nFolds : 0;
        var fails = []; if (v.n < H.n) fails.push('نمونه کم (' + fa(v.n, 0) + ' < ' + fa(H.n, 0) + ')'); if (v.oos.n < H.oos) fails.push('برون‌نمونه کم'); else if (!(v.oos.avgR > 0)) fails.push('برون‌نمونه منفی'); if (fr < th.foldB) fails.push('ناپایدار در بلوک‌های زمانی'); if (!(v.c2 > 0)) fails.push('با هزینهٔ دوبرابر منفی'); var ddUse = th.ddMode === 'pooled' ? v.mdd : v.mddP; if (ddUse < H.mdd) fails.push('افت بیش از ' + fa(-H.mdd, 0) + 'R (' + (th.ddMode === 'pooled' ? 'جمع همهٔ معاملات' : 'سبد ماهانهٔ هم‌وزن') + ': ' + fa(ddUse, 1) + 'R)');
        var last = (v.folds || []).filter(Boolean).slice(-1)[0], decay = last && v.avgR > 0 && last.avgR < th.decay * v.avgR;
        rows[k] = { fa: STRFA[k], n: v.n, hit: v.hit, avgR: v.avgR, avgW: v.avgW, avgL: v.avgL, payoff: v.payoff, pf: v.pf, mdd: v.mdd, mddP: v.mddP, ddMode: th.ddMode || 'portfolio', sharpe: v.sharpe, sortino: v.sortino, days: v.days, turnover: v.turnover, oos: v.oos, is: v.is, folds: fa(v.posFolds, 0) + '/' + fa(v.nFolds, 0), c2: v.c2, byRg: v.byRg, years: v.years,
          recent: last ? last.avgR : NaN, decay: !!decay, fails: fails, ok: !fails.length, score: !fails.length ? v.oos.avgR * fr : NaN }; });
      // parameter sensitivity, only for rule strategies that passed (the ensemble's own robustness is the cost / block tests)
      Object.keys(rows).forEach(function (k) { var r = rows[k]; if (!r.ok || k === 'ens' || !STRATS[k]) return; var ps = STRATS[k].p.slice(1), zl = list.filter(function (z) { return z.a.cls === cls; });
        var res = ps.map(function (p) { var s2 = stats(stratTrades(zl, E, k, p)); return { p: p, n: s2.n, avgR: s2.avgR }; }); r.sens = res;
        if (res.some(function (q) { return !(q.n >= 5) || !(q.avgR > 0); })) { r.ok = false; r.score = NaN; r.fails.push('حساس به پارامتر (با ' + res.map(function (q) { return fa(q.p, 2) + ': ' + (q.n ? fa(q.avgR, 2) + 'R' : 'بدون معامله'); }).join('، ') + ')'); } });
      Object.keys(rows).forEach(function (k) { var r = rows[k]; r.why = r.ok ? 'برون‌نمونه ' + fa(r.oos.n, 0) + ' معامله، ' + fa(r.oos.avgR, 2) + 'R؛ ' + r.folds + ' بلوک مثبت؛ مثبت با هزینهٔ دوبرابر؛ افت ' + fa(r.mdd, 1) + 'R' + (r.sens ? '؛ پایدار در برابر تغییر پارامتر' : '') : r.fails.join('؛ '); });
      var cand = Object.keys(rows).filter(function (k) { return rows[k].ok; }).sort(function (a, b) { return rows[b].score - rows[a].score; }), best = cand[0] || null, was = prev[key] && prev[key].sel, why;
      if (was && rows[was] && rows[was].ok && best && best !== was && !(rows[best].score > 1.25 * rows[was].score)) { why = 'استراتژی قبلی «' + rows[was].fa + '» حفظ شد: همچنان همهٔ آزمون‌ها را می‌گذراند و «' + rows[best].fa + '» بیش از ۲۵٪ بهتر نیست'; best = was; }
      else if (best) why = (was && was !== best ? (rows[was] && rows[was].ok ? 'تغییر از «' + rows[was].fa + '»: جایگزین بیش از ۲۵٪ پایدارتر' : 'تغییر از «' + (STRFA[was] || was) + '»: آزمون‌ها را دیگر نمی‌گذراند') + '. ' : '') + 'انتخاب «' + rows[best].fa + '» — ' + rows[best].why;
      else why = 'هیچ استراتژی‌ای همهٔ آزمون‌ها را برای این بازار و افق نگذراند؛ سیگنال قابل اتکایی در این افق وجود ندارد.';
      var lk = E.val && E.val.lock && E.val.lock[key]; if (lk && rows[lk]) { why = 'قفل کاربر روی «' + rows[lk].fa + '»' + (lk !== best ? ' (انتخاب خودکار: ' + (best ? '«' + rows[best].fa + '»' : 'هیچ') + ')' : '') + (rows[lk].ok ? '' : ' — هشدار: این استراتژی آزمون‌ها را نمی‌گذراند (' + rows[lk].why + ')؛ دروازهٔ اعتبار سیگنال آن را رد می‌کند'); best = lk; }
      var dataNote = h !== 'l' && list.filter(function (z) { return z.a.cls === cls; }).every(function (z) { return z.R.X.n < HIST[h].need; }) ? 'تاریخچهٔ همهٔ دارایی‌های این بازار کمتر از ' + fa(HIST[h].need, 0) + ' جلسهٔ هدف این افق است؛ نتایج بر نمونهٔ کوتاه‌تر استوارند' : h === 'l' && !Object.keys(rows).some(function (k) { return rows[k].n >= H.n; }) ? 'تاریخچهٔ داده برای افق بلندمدت کافی نیست (' + fa(HIST.l.need, 0) + ' جلسه لازم است: ' + fa(HIST.l.warm, 0) + ' جلسه گرم‌شدن + ' + fa(HIST.l.test, 0) + ' جلسه آزمون). یک بار «به‌روزرسانی داده» بزنید؛ اگر منبع تاریخچهٔ کمتری بدهد، همین پیام می‌ماند' : '';
      out[key] = { cls: cls, h: h, rows: rows, sel: best, was: was || null, changed: !!(was && best !== was), why: why, data: dataNote, locked: !!(lk && rows[lk]) }; });
    return out;
  }

  function btSplit(list) { var dset = []; list.forEach(function (z) { dset = dset.concat(z.R.X.d); }); dset.sort(function (a, b) { return a - b; }); return dset[Math.floor(dset.length * 0.6)]; }
  // one asset: full per-bar votes are built, simulated and dropped (only the trades are kept)
  function btAsset(z0, E, all, rules) { if (z0.a.cls === 'option') return all; var z = z0.R.full ? z0 : fullOf(z0);
      var tr = simTrades(z, E, function (t) { if (t < 60) return null; var en = ensemble(z, t, E, {}), conf = confidence(en, t + 1, 0); if (en.S < 0.2 || conf < E.minConf || en.rg === 'crisis') return null; var hz = horizonOf(en.votes, en.S), vv = {}; en.votes.forEach(function (x) { if (x.v) vv[x.m] = Math.round(x.v * 100) / 100; }); return { conf: conf, days: hz.days, hz: hz.k, rg: en.rg, v: vv, agree: en.agree }; }, 60);
      tr.forEach(function (x) { x.asset = z.a.sym; x.cls = z.a.cls; }); all = all.concat(tr);
      Object.keys(BASEW).forEach(function (m) { if (!z.R.V[m]) return; var rt = simTrades(z, E, function (t) { var o = z.R.V[m][t]; return o && o.v >= 0.5 ? { conf: 0, days: 20, hz: 'm' } : null; }, 60); rt.forEach(function (x) { x.asset = z.a.sym; }); (rules[m] = rules[m] || []).push.apply(rules[m], rt); }); return all; }
  function backtest(list, E) {
    var split = btSplit(list), all = [], rules = {};
    list.forEach(function (z0) { all = btAsset(z0, E, all, rules); });
    return btFinish(list, E, split, all, rules);
  }
  /* the same back-test without freezing the page: one asset per step, the browser gets control back between steps
     (a phone's browser closes a page that holds the main thread or too much memory for too long) */
  function backtestAsync(list, E, prog) {
    var split = btSplit(list), all = [], rules = {}, i = 0, N = list.length;
    return new Promise(function (res, rej) {
      (function step() { try { var t0 = Date.now(); while (i < N && Date.now() - t0 < 120) { all = btAsset(list[i], E, all, rules); i++; }
        if (prog) prog(i, N); if (i < N) return setTimeout(step, 0); setTimeout(function () { try { res(btFinish(list, E, split, all, rules)); } catch (e) { rej(e); } }, 0); } catch (e) { rej(e); } })();
    });
  }
  function btFinish(list, E, split, all, rules) {
    var audit = lookahead(list);
    var strat = {}; Object.keys(STRATS).forEach(function (k) { var h = STRATS[k].h; stratTrades(list, E, k, STRATS[k].p[0]).forEach(function (x) { var key = x.cls + '|' + h, o = (strat[key] = strat[key] || {}); (o[k] = o[k] || []).push(x); }); });
    all.forEach(function (x) { var key = x.cls + '|' + (x.hk || 'm'), o = (strat[key] = strat[key] || {}); (o.ens = o.ens || []).push(x); });
    Object.keys(strat).forEach(function (key) { var cls = key.split('|')[0]; Object.keys(STRATS).forEach(function (k) { if (STRATS[k].h === key.split('|')[1] && !strat[key][k]) strat[key][k] = []; }); strat[key].ens = strat[key].ens || []; });
    var IS = all.filter(function (x) { return x.d <= split; }), OOS = all.filter(function (x) { return x.d > split; });
    var buckets = [[55, 65], [65, 75], [75, 101]].map(function (b) { var s = stats(OOS.filter(function (x) { return x.conf >= b[0] && x.conf < b[1]; })); s.b = b; return s; });
    var rs = Object.keys(rules).map(function (m) { var o = stats(rules[m].filter(function (x) { return x.d > split; })), i = stats(rules[m].filter(function (x) { return x.d <= split; })); return { m: m, is: i, oos: o, ok: o.n >= 10 && o.avgR > 0 && o.pf > 1.1, v: vstats(rules[m], split, Number(E.acct.riskPct) || 0.01) }; });
    return { split: split, IS: stats(IS), OOS: stats(OOS), all: stats(all), buckets: buckets, rules: rs, trades: all, strat: strat, audit: audit };
  }

  /* ---------------- 12 · mandatory validation framework ----------------
   * No entry signal is "confirmed" without evidence. Evidence = the engine's own back-test on the stored history
   * (day-by-day, data up to that day only, entry at next open, costs, price limits), summarised per pool (asset class × regime),
   * tested out of sample (time split), in 4 consecutive blocks (walk-forward stability), under doubled / tripled costs,
   * with a per-model look-ahead audit and a month-clustered significance test (trades in the same month are not independent).
   * A card gets grade A–D from explicit, adjustable thresholds (VTH). C and D entry signals are NOT issued ("no signal").
   * Protective exits (stop, invalidation, close advice) are graded but never suppressed.
   * The evidence is stored (Strategy & Signal Database) and expires when weights, costs, thresholds or the engine change. */
  var ENG_VER = '2026.11-val4', MODEL_VER = 'd23-1405.09.01';   // MODEL_VER: version of the decision model (levels, execution, trend, verdict) stamped on every central record
  var VTH = { ddMode: 'portfolio', costX: 2, nA: 60, nB: 30, nC: 15, oosA: 20, oosB: 10, pfA: 1.3, pfB: 1.1, expA: 0.1, tA: 2, tB: 1, foldA: 0.75, foldB: 0.5, decay: 0.5, maxAge: 30 };
  var VLIM = [
    'بک‌تست فقط هستهٔ تاریخی‌پذیر موتور را می‌آزماید (مدل‌های قیمت، حجم و جریان پول حقیقی). امتیاز کاربرگ سهام/طلا/ارز، خبر، جفت‌ها و رتبه‌بندی مقطعی در تاریخچه ذخیره نشده‌اند و در بک‌تست نیستند.',
    'فهرست نمادها عکس لحظه‌ای نمادهای فعلی است؛ نمادهای حذف‌شده یا از‌دست‌رفته در آن نیستند (سوگیری بقا قابل حذف نیست و نتیجه خوش‌بینانه‌تر از واقع است).',
    'هزینهٔ معامله یک درصد کلی است (کارمزد + لغزش)؛ اسپرد و عمق تابلو جدا مدل نشده‌اند. ورود با قیمت بازگشایی جلسهٔ بعد فرض شده است.',
    'گیرکردن در صف فروش (قفل کف دامنه) در بک‌تست مدل نشده؛ زیان واقعی ممکن است از حد ضرر بیشتر باشد. ورود در سقف قفل مجاز نشده است.',
    'قیمت‌ها با «قیمت دیروز» برای افزایش سرمایه و سود تعدیل شده‌اند؛ تعدیل از آگاهی بعدی استفاده می‌کند و ممکن است اندکی متفاوت از آنچه آن روز دیده می‌شد باشد.',
    'معناداری آماری با فرض استقلال ماه‌ها سنجیده شده؛ معاملهٔ نمادهای مختلف در یک دوره همبسته است و این فرض خوش‌بینانه است.',
    'بازده تجمعی/سالانه ساده (بدون سود مرکب) و برای «یک دارایی میانگین» با ریسک ثابت هر معامله است؛ اثر هم‌زمانی موقعیت‌ها و سقف ریسک سبد در آن نیست.',
    'حساسیت پارامترها فقط برای آستانهٔ اطمینان (سخت‌گیرانه‌تر) و هزینه (×۲، ×۳) آزموده شده است؛ حد ضرر/هدف و وزن مدل‌ها آزموده نشده‌اند.',
    'نتیجهٔ موفق بک‌تست تضمین سود نیست؛ «درجه» یعنی قدرت شواهد، نه احتمال سود.'];
  function ncdf(z) { var t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2), p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; }
  function tstat(a) { var b = a.filter(isF); if (b.length < 8) return NaN; var s = sd(b); return s > 0 ? mean(b) / (s / Math.sqrt(b.length)) : NaN; }
  function d2days(d) { var y = Math.floor(d / 10000), m = Math.floor(d / 100) % 100, dd = d % 100; return y > 1900 && y < 2200 ? Date.UTC(y, m - 1, dd) / 864e5 : NaN; }
  function valSig(E) {
    var s = JSON.stringify([ENG_VER, E.minConf, E.strongConf, E.market,   // the working mode (signal / portfolio / monitor / full) changes the action list, not the back-test
       E.acct && E.acct.costPct, E.acct && E.acct.limitPct, E.acct && E.acct.limits, E.acct && E.acct.minRR, E.ev && E.ev.on ? E.ev.m : 0, E.w, E.off, E.classes, E.learn && E.learn.wr, E.learn && E.learn.block, (E.val && E.val.th && E.val.th.ddMode) || VTH.ddMode]), h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(16);
  }
  // full statistics of one pool of simulated trades
  function vstats(tr, split, rp) {
    var s = stats(tr); if (!s.n) return s;
    var rs = tr.map(function (x) { return x.r; }); s.sd = sd(rs); s.t = tstat(rs);
    var g = {}; tr.forEach(function (x) { var k = Math.floor(x.d / 100); (g[k] = g[k] || []).push(x.r); });
    var mm = Object.keys(g).map(function (k) { return mean(g[k]); }); s.months = mm.length; s.tc = mm.length >= 6 ? tstat(mm) : NaN; s.p = isF(s.tc) ? 1 - ncdf(s.tc) : NaN;
    var os = stats(tr.filter(function (x) { return x.d > split; })), is = stats(tr.filter(function (x) { return x.d <= split; }));
    s.oos = os.n ? { n: os.n, hit: os.hit, avgR: os.avgR, pf: os.pf, mdd: os.mdd } : { n: 0 }; s.is = is.n ? { n: is.n, hit: is.hit, avgR: is.avgR, pf: is.pf } : { n: 0 };
    var srt = tr.slice().sort(function (a, b) { return a.d - b.d; }), K = 4, sz = Math.ceil(srt.length / K); s.folds = [];
    for (var f = 0; f < K; f++) { var ch = srt.slice(f * sz, (f + 1) * sz); s.folds.push(ch.length >= 5 ? { n: ch.length, avgR: mean(ch.map(function (x) { return x.r; })), from: ch[0].d, to: ch[ch.length - 1].d } : null); }
    var fv = s.folds.filter(Boolean); s.nFolds = fv.length; s.posFolds = fv.filter(function (q) { return q.avgR > 0; }).length;
    s.crm = mean(tr.map(function (x) { return x.cr || 0; })); s.c2 = mean(tr.map(function (x) { return x.r - (x.cr || 0); })); s.c3 = mean(tr.map(function (x) { return x.r - 2 * (x.cr || 0); }));
    var as = {}; tr.forEach(function (x) { as[x.asset] = 1; }); s.nAssets = Object.keys(as).length;
    s.payoff = s.avgL > 0 ? s.avgW / s.avgL : NaN;
    var msum = Object.keys(g).sort().map(function (k) { return g[k].reduce(function (a, b) { return a + b; }, 0); });
    /* drawdown as a portfolio lives it: each month the trades opened are one equal-weight basket (1R of risk spread over the month's signals);
       the pooled sum of every trade of every asset grows with the number of assets and would reject a large market (761 stocks) for its size alone */
    var cumP = 0, pkP = 0; s.mddP = 0; Object.keys(g).sort().forEach(function (k) { cumP += mean(g[k]); pkP = Math.max(pkP, cumP); s.mddP = Math.min(s.mddP, cumP - pkP); });
    if (msum.length >= 6) { var mu = mean(msum), sdv = sd(msum), dd = Math.sqrt(mean(msum.map(function (v) { return v < 0 ? v * v : 0; }))); s.sharpe = sdv > 0 ? mu / sdv * Math.sqrt(12) : NaN; s.sortino = dd > 0 ? mu / dd * Math.sqrt(12) : NaN; }
    var rgx = {}; tr.forEach(function (x) { (rgx[x.rg || 'unk'] = rgx[x.rg || 'unk'] || []).push(x); }); s.byRg = {}; Object.keys(rgx).forEach(function (k) { var q = stats(rgx[k]); s.byRg[k] = [q.n, Math.round(q.hit * 100) / 100, Math.round(q.avgR * 100) / 100]; });
    s.queue = tr.filter(function (x) { return x.exit === 'stop-queue'; }).length;
    var d0 = Math.min.apply(null, srt.slice(0, 1).map(function (x) { return x.d; })), d1 = srt[srt.length - 1].d, yrs = (d2days(d1) - d2days(d0)) / 365.25; s.years = isF(yrs) ? yrs : NaN; s.turnover = isF(yrs) && yrs > 0 && s.nAssets ? s.n / yrs / s.nAssets : NaN;
    s.retCum = s.totR / Math.max(1, s.nAssets) * rp; s.retAnn = s.years > 0.5 ? s.retCum / s.years : NaN;
    return s;
  }
  function sensitivity(tr, E) { return [0, 5, 10, 15].map(function (d) { var th = E.minConf + d, s = stats(tr.filter(function (x) { return x.conf >= th; })); return { th: th, n: s.n || 0, avgR: s.n ? s.avgR : NaN, pf: s.n ? s.pf : NaN, hit: s.n ? s.hit : NaN }; }); }
  // look-ahead audit: recompute every model on a series cut at day t and compare its vote at t with the vote from the full series
  function lookahead(list) {
    var cand = list.filter(function (z) { return z.a.cls !== 'option' && z.R.X.n >= 140 && z.a.rows && z.a.rows.length >= 140; }), res = { assets: 0, checks: 0, diffs: 0, models: {}, ok: null, note: '' };
    if (!cand.length) { res.note = 'دارایی با تاریخچهٔ کافی برای حسابرسی نبود.'; return res; }
    var pick = [], step = Math.max(1, Math.floor(cand.length / 4)); for (var i = 0; i < cand.length && pick.length < 4; i += step) pick.push(cand[i]);
    pick.forEach(function (z0) { var z = z0.R.full ? z0 : fullOf(z0);
      var X = z.R.X, n = X.n, ts = [0.55, 0.7, 0.85].map(function (q) { return Math.floor(n * q); }).concat([n - 3]); res.assets++;
      ts.forEach(function (t) {
        var cut = 0; z.a.rows.forEach(function (r, k) { if (r.date <= X.d[t]) cut = k + 1; }); if (cut < 60) return;
        var sub = Object.assign({}, z.a, { key: z.a.key + '|LA' + t, rows: z.a.rows.slice(0, cut), ct: z.a.ct ? z.a.ct.filter(function (c) { return c.date <= X.d[t]; }) : z.a.ct }), R2;
        try { R2 = analyse(sub, true); } catch (e) { return; }
        var last = R2.X.n - 1; if (R2.X.d[last] !== X.d[t]) return;
        Object.keys(R2.V).forEach(function (m) {
          var a = R2.V[m][last], b = z.R.V[m] ? z.R.V[m][t] : null; if (!a && !b) return; res.checks++;
          var bad = !a || !b ? true : Math.abs(a.v - b.v) > 1e-6 * (1 + Math.abs(b.v)); if (bad) { res.diffs++; res.models[m] = (res.models[m] || 0) + 1; }
        });
        Object.keys(CACHE).forEach(function (k) { if (k.indexOf('|LA' + t + '|') > -1) delete CACHE[k]; });
      });
    });
    res.ok = res.checks >= 20 && res.diffs === 0; res.note = res.checks < 20 ? 'تعداد مقایسه‌ها کم بود (' + res.checks + ')؛ حسابرسی قطعی نیست.' : res.diffs ? res.diffs + ' اختلاف از ' + res.checks + ' مقایسه (مدل‌ها: ' + Object.keys(res.models).join('، ') + ')؛ احتمال استفاده از اطلاعات آینده یا اثر تعدیل قیمت.' : 'بدون اختلاف در ' + res.checks + ' مقایسه.';
    return res;
  }
  function makeDB(bt, list, E) {
    var tr = bt.trades, split = bt.split, rp = Number(E.acct.riskPct) || 0.01, pools = {}, add = function (k, arr) { if (arr.length) pools[k] = vstats(arr, split, rp); };
    add('all', tr); var cls = {}, rgs = {}; tr.forEach(function (x) { (cls[x.cls] = cls[x.cls] || []).push(x); (rgs[x.rg] = rgs[x.rg] || []).push(x); });
    Object.keys(cls).forEach(function (c) { add('c:' + c, cls[c]); var rg = {}; cls[c].forEach(function (x) { (rg[x.rg] = rg[x.rg] || []).push(x); }); Object.keys(rg).forEach(function (r) { add('c:' + c + '|' + r, rg[r]); }); });
    Object.keys(rgs).forEach(function (r) { add('r:' + r, rgs[r]); });
    var hzs = {}; tr.forEach(function (x) { var k = x.days <= 10 ? 's' : x.days <= 40 ? 'm' : 'l'; (hzs[k] = hzs[k] || []).push(x); (hzs[x.cls + '#' + k] = hzs[x.cls + '#' + k] || []).push(x); });
    Object.keys(hzs).forEach(function (k) { add(k.indexOf('#') > -1 ? 'c:' + k : 'h:' + k, hzs[k]); });   // by actual holding period: s ≤ 10 sessions, m ≤ 40, l longer
    var ba = {}, ga = {}; tr.forEach(function (x) { (ga[x.asset] = ga[x.asset] || []).push(x); }); Object.keys(ga).forEach(function (k) { var s = stats(ga[k]); ba[k] = [s.n, Math.round(s.hit * 100) / 100, Math.round(s.avgR * 100) / 100]; });
    var rules = {}; bt.rules.forEach(function (r) { rules[r.m] = { is: r.is, oos: r.oos, ok: r.ok, v: r.v ? { t: r.v.t, tc: r.v.tc, nFolds: r.v.nFolds, posFolds: r.v.posFolds, c2: r.v.c2 } : null }; });
    var asOf = 0, from = 1e9; list.forEach(function (z) { asOf = Math.max(asOf, z.R.X.d[z.R.X.n - 1]); from = Math.min(from, z.R.X.d[0]); });
    return { at: Date.now(), asOf: asOf, from: from, split: split, sig: valSig(E), eng: ENG_VER, sample: list.every(function (z) { return z.a.sample; }), nAssets: list.length, nTrades: tr.length, pools: pools, byAsset: ba, sens: sensitivity(tr, E), audit: bt.audit || lookahead(list), rules: rules, strat: stratSel(bt, E, list), minConf: E.minConf, cost: Number(E.acct.costPct) || 0 };
  }
  var GRD = { A: 'اعتبار بالا', B: 'اعتبار مناسب', C: 'اعتبار پایین', D: 'فاقد اعتبار کافی' };
  function gradeCard(c, E, db, today) {
    var th = Object.assign({}, VTH, E.val && E.val.th), V = { grade: 'D', fa: GRD.D, reasons: [], caps: [], ok: [], ev: null, pool: '', matched: false, sig: c.type }, no = function (why) { V.reasons.push(why); return V; };
    if (!db) return no('اعتبارسنجی اجرا نشده است؛ بدون بک‌تست، سیگنال تأییدنشده است. در زبانهٔ «بک‌تست» دکمهٔ اجرای اعتبارسنجی را بزنید.');
    V.ver = db.ver; V.at = db.at; V.asOf = db.asOf;
    if (db.sample) return no('اعتبارسنجی روی دادهٔ نمونه (ساختگی) اجرا شده و بی‌اعتبار است.');
    if (db.sig !== valSig(E)) return no('وزن‌ها، آستانه‌ها یا هزینه پس از آخرین اعتبارسنجی تغییر کرده‌اند؛ هر تغییر باید دوباره بک‌تست شود.');
    if (c.cls === 'option') return no('بک‌تست اختیار معامله ممکن نیست: تاریخچهٔ تابلوی قراردادها (قیمت، نوسان ضمنی، سررسید) ذخیره نشده است؛ این سیگنال تأییدنشده است.');
    if (c.sample) return no('دادهٔ این دارایی نمونه است.');
    var age = isF(today) && isF(d2days(today)) && isF(d2days(db.asOf)) ? d2days(today) - d2days(db.asOf) : 0; V.age = age;
    if (age > 2 * th.maxAge) return no('اعتبارسنجی منقضی است (' + fa(age, 0) + ' روز از آخرین داده‌ای که با آن آزموده شد). دوباره اجرا کنید.');
    var ev = db.pools['c:' + c.cls + '|' + c.regime], matched = !!(ev && ev.n >= th.nC), key = 'c:' + c.cls + '|' + c.regime;
    if (!matched) { ev = db.pools['c:' + c.cls]; key = 'c:' + c.cls; }
    if (!ev || !(ev.n >= th.nC)) return no('نمونهٔ تاریخی کافی نیست: کمتر از ' + fa(th.nC, 0) + ' معاملهٔ شبیه‌سازی‌شده برای این نوع دارایی.');
    V.ev = ev; V.pool = key; V.matched = matched; var oos = ev.oos || { n: 0 }, is = ev.is || { n: 0 }, tt = isF(ev.tc) ? ev.tc : NaN, fs = ev.nFolds ? ev.posFolds / ev.nFolds : NaN;
    var s5 = (db.sens || [])[1], at = db.byAsset && db.byAsset[c.sym], conf = { A: [], B: [] };
    var chk = function (A, B, fa1) { conf.A.push([A, fa1]); conf.B.push([B, fa1]); };
    chk(ev.n >= th.nA, ev.n >= th.nB, 'تعداد معاملات تاریخی ' + fa(ev.n, 0) + ' (حداقل A: ' + fa(th.nA, 0) + '، B: ' + fa(th.nB, 0) + ')');
    chk(oos.n >= th.oosA, oos.n >= th.oosB, 'معاملات خارج از نمونه ' + fa(oos.n, 0) + ' (حداقل A: ' + fa(th.oosA, 0) + '، B: ' + fa(th.oosB, 0) + ')');
    chk(oos.n > 0 && oos.avgR > th.expA, oos.n > 0 && oos.avgR > 0, 'امید ریاضی خارج از نمونه ' + (oos.n ? fa(oos.avgR, 2) + 'R' : '—'));
    chk(oos.n > 0 && oos.pf >= th.pfA, oos.n > 0 && oos.pf >= th.pfB, 'ضریب سود خارج از نمونه ' + (oos.n && isF(oos.pf) ? fa(oos.pf, 2) : '—'));
    chk(isF(tt) && tt >= th.tA, isF(tt) && tt >= th.tB, 'معناداری (آمارهٔ t بر پایهٔ میانگین ماهانه) ' + (isF(tt) ? fa(tt, 2) : 'قابل محاسبه نیست'));
    chk(ev.nFolds >= 3 && fs >= th.foldA, ev.nFolds >= 3 && fs >= th.foldB, 'پایداری: ' + fa(ev.posFolds || 0, 0) + ' از ' + fa(ev.nFolds || 0, 0) + ' بلوک زمانی سودده');
    var cs = isF(ev.crm) ? ev.avgR - (th.costX - 1) * ev.crm : ev.c2; V.cs = cs;
    chk(isF(cs) && cs > 0, isF(cs) && cs > 0, 'امید ریاضی اگر هزینه ' + fa(th.costX, 1) + ' برابر شود: ' + (isF(cs) ? fa(cs, 2) + 'R' : '—') + ' (هزینهٔ هر معامله به‌طور میانگین ' + (isF(ev.crm) ? fa(ev.crm, 2) + 'R' : '—') + ' است)');
    chk(!(is.n && is.avgR > 0) || (oos.n > 0 && oos.avgR >= th.decay * is.avgR), true, 'افت از درون به خارج نمونه (' + (is.n ? fa(is.avgR, 2) : '—') + 'R ← ' + (oos.n ? fa(oos.avgR, 2) : '—') + 'R)');
    chk(matched, true, matched ? 'شواهد از همین رژیم بازار (' + (REG[c.regime] || c.regime) + ')' : 'نمونهٔ کافی از رژیم فعلی نیست؛ شواهد کل رژیم‌ها آمده است');
    chk(!s5 || s5.n < 10 || s5.avgR > 0, true, 'با آستانهٔ اطمینان ۵ واحد سخت‌گیرانه‌تر امید ریاضی ' + (s5 && s5.n ? fa(s5.avgR, 2) + 'R' : '—'));
    chk(!!(db.audit && db.audit.ok), true, 'حسابرسی نگاه به آینده: ' + (db.audit ? db.audit.note : 'انجام نشده'));
    chk(c.strength === 'قوی', true, 'هم‌سویی خانواده‌های مدل: قدرت سیگنال «' + c.strength + '»');
    var okA = conf.A.every(function (x) { return x[0]; }), okB = conf.B.every(function (x) { return x[0]; }), g;
    if (okA) g = 'A'; else if (okB) g = 'B'; else if (ev.avgR > 0 && !(isF(ev.pf) && ev.pf < 1) && !(oos.n && oos.avgR <= 0)) g = 'C'; else g = 'D';
    var fail = (g === 'A' ? [] : (g === 'B' ? conf.A : conf.B)).filter(function (x) { return !x[0]; }).map(function (x) { return x[1]; });
    V.ok = conf.A.filter(function (x) { return x[0]; }).map(function (x) { return x[1]; }); V.reasons = fail;
    if (g === 'D') V.reasons.unshift(oos.n && oos.avgR <= 0 ? 'امید ریاضی خارج از نمونه صفر یا منفی است.' : ev.avgR <= 0 ? 'امید ریاضی کل نمونه صفر یا منفی است.' : 'شواهد ناکافی یا ناپایدار.');
    var rank = { A: 3, B: 2, C: 1, D: 0 }, cap = function (to, why) { if (rank[g] > rank[to]) { g = to; V.caps.push(why); } };
    if (c.regime === 'crisis') cap('C', 'رژیم بحرانی: رفتار با دورهٔ بک‌تست قابل‌قیاس نیست.'); if (c.regime === 'hv') cap('B', 'رژیم پرنوسان: نوسان فعلی از دورهٔ عادی بک‌تست بیشتر است.');
    if (!c.liqOK) cap('C', 'نقدشوندگی ۲۰ روزه کمتر از حداقل است.'); if (isF(c.age) && c.age > 48) cap('B', 'دادهٔ دارایی بیش از ۴۸ ساعت قدیمی است.');
    if (age > th.maxAge) cap('B', 'آخرین اعتبارسنجی ' + fa(age, 0) + ' روز با داده‌های فعلی فاصله دارد (حداکثر ' + fa(th.maxAge, 0) + ').');
    if (c.queue) cap('B', 'صف در جلسهٔ آخر: شرایط اجرا با بک‌تست (ورود در بازگشایی) متفاوت است.');
    V.grade = g; V.fa = GRD[g]; if (at) V.asset = { n: at[0], hit: at[1], avgR: at[2] };
    return V;
  }
  // grades every entry signal; C and D entries are replaced by an explicit "no signal" (protective exits are never suppressed)
  function gateCards(cards, db, E, today) {
    var strict = !(E.val && E.val.gate === 'warn'), blocked = 0;
    cards.forEach(function (c) {
      if (c.type === 'hold') { c.val = null; return; }
      var v = gradeCard(c, E, db, today); c.val = v; v.blocked = false;
      if ((c.type === 'long' || c.type === 'short') && (v.grade === 'C' || v.grade === 'D')) {
        v.blocked = strict; if (!strict) { c.cond.unshift('اعتبارسنجی درجه ' + v.grade + ' (' + v.fa + ') است؛ حالت «فقط هشدار» فعال است.'); return; }
        c.candidate = { type: c.type, typeFa: c.typeFa, strength: c.strength, conf: c.conf, status: c.status }; c.type = 'hold'; c.typeFa = 'عدم صدور سیگنال — شواهد کافی نیست'; c.status = 'تأییدنشده — درجه ' + v.grade;
        c.why.unshift('الگوی ' + (c.candidate.type === 'long' ? 'خرید' : 'فروش') + ' دیده شد ولی اعتبارسنجی درجه ' + v.grade + ' (' + v.fa + ') دارد؛ هنوز شواهد کافی برای ورود وجود ندارد.');
        c.posPct = 0; c.riskPct = 0; c.units = NaN; blocked++;
      }
    });
    return blocked;
  }
  // Strategy & Signal Database: every strategy with version, parameters signature, back-test, live result and last validation date
  var RULEFA = { ensemble: 'گروه رأی‌دهی (سیگنال خرید ترکیبی)' };
  function registry(V, db, J, E) {
    V.reg = V.reg || {}; V.hist = V.hist || [];
    var live = null; try { var L = learnStats(J || [], null, 0); live = L && L.live && L.live.n ? { n: L.live.n, avgR: L.live.avgR, hit: L.live.hit } : null; } catch (e) { live = null; }
    var xg0 = null; try { xg0 = xgStrategy(E); } catch (e) { xg0 = null; }
    var items = [{ id: 'ensemble', is: db.pools.all && db.pools.all.is, oos: db.pools.all && db.pools.all.oos, v: db.pools.all }];
    Object.keys(db.rules).forEach(function (m) { var r = db.rules[m]; items.push({ id: m, is: r.is, oos: r.oos, v: r.v, ok: r.ok }); });
    if (xg0 && !xg0.sample) xg0.inst.forEach(function (o) { if (o.ev && o.ev.n) items.push({ id: 'xgold:' + o.key, is: o.ev.is, oos: o.ev.oos, v: o.ev, ok: o.grade === 'A' || o.grade === 'B' }); });
    items.forEach(function (it) {
      var r = V.reg[it.id] = V.reg[it.id] || { id: it.id, ver: 1, hist: [], first: db.at }; if (r.sig && r.sig !== db.sig) r.ver++; r.sig = db.sig; r.last = db.at; r.asOf = db.asOf;
      var o = it.oos || { n: 0 }; r.is = it.is && it.is.n ? { n: it.is.n, avgR: it.is.avgR } : { n: 0 }; r.oos = o.n ? { n: o.n, avgR: o.avgR, pf: o.pf, hit: o.hit } : { n: 0 };
      r.t = it.v && isF(it.v.tc) ? it.v.tc : NaN; r.folds = it.v && it.v.nFolds ? it.v.posFolds + '/' + it.v.nFolds : '';
      r.hist.push({ ver: db.ver, at: db.at, n: o.n || 0, avgR: o.n ? o.avgR : NaN }); r.hist = r.hist.slice(-12);
      var lastTwo = r.hist.slice(-2), bad = lastTwo.length === 2 && lastTwo.every(function (x) { return x.n >= 10 && isF(x.avgR) && x.avgR <= 0; });
      r.status = !o.n || o.n < 10 ? 'نامشخص (نمونهٔ خارج از نمونه کمتر از ۱۰)' : bad ? 'معلق — دو اعتبارسنجی پیاپی بدون لبه' : o.avgR > 0 && (it.ok !== false) ? 'دارای شواهد مثبت' : 'بدون لبه در این اعتبارسنجی';
      if (it.id === 'ensemble') { r.live = live; r.drift = live && live.n >= 20 && o.n && live.avgR < o.avgR - 0.15 ? 'عملکرد واقعی (' + fa(live.avgR, 2) + 'R) از بک‌تست خارج از نمونه (' + fa(o.avgR, 2) + 'R) پایین‌تر است' : ''; }
    });
    V.hist.push({ ver: db.ver, at: db.at, asOf: db.asOf, sig: db.sig, n: db.nTrades, avgR: db.pools.all ? db.pools.all.avgR : NaN, oosN: db.pools.all && db.pools.all.oos ? db.pools.all.oos.n : 0, oosAvgR: db.pools.all && db.pools.all.oos ? db.pools.all.oos.avgR : NaN, audit: db.audit && db.audit.ok });
    V.hist = V.hist.slice(-20);
    // version history of the per market × horizon selection: one line per change (or first selection), kept for rollback
    V.selHist = V.selHist || []; Object.keys(db.strat || {}).forEach(function (key) { var s = db.strat[key], prevS = V.selHist.filter(function (q) { return q.key === key; }).slice(-1)[0];
      if (!prevS || prevS.sel !== s.sel) V.selHist.push({ key: key, ver: db.ver, at: db.at, asOf: db.asOf, sel: s.sel, was: prevS ? prevS.sel : null, why: s.why, eng: db.eng,
        oos: s.sel && s.rows[s.sel] && s.rows[s.sel].oos ? { n: s.rows[s.sel].oos.n, avgR: s.rows[s.sel].oos.avgR } : null }); });
    V.selHist = V.selHist.slice(-200);
  }
  // full validation run on the stored data: updates E0.val (database + registry) in place
  /* full validation without freezing or exhausting a phone's browser:
     1) each asset's analysis built in short slices; 2) cross-sectional models; 3) back-test one asset per slice; 4) database.
     opt.lite: models back-tested on the last 760 sessions only (fallback after a run that did not finish; the long horizon then lacks data and says so).
     prog(i, n, phase) reports progress so the caller can checkpoint it. */
  function validateAsync(E0, U0, J, prog, opt) {
    var E = merge(defaults(), JSON.parse(JSON.stringify(E0 || {}))), U = U0 || universe(E), lite = !!(opt && opt.lite);
    if (lite) U = Object.assign({}, U, { assets: (U.assets || []).map(function (a) { return a.rows && a.rows.length > BTWIN ? Object.assign({}, a, { rows: a.rows.slice(-BTWIN) }) : a; }) });
    var A = (U.assets || []).filter(function (a) { return a.rows && a.rows.length >= 30; }), k = 0, tick = function (f) { return new Promise(function (res, rej) { setTimeout(function () { try { res(f()); } catch (e) { rej(e); } }, 0); }); };
    var slices = function () { return new Promise(function (res, rej) { (function step() { try { var t0 = Date.now(); while (k < A.length && Date.now() - t0 < 120) { try { analyse(A[k], false); } catch (e) { /* skipped later as in run() */ } k++; }
      if (prog) prog(k, A.length, 'prep'); if (k < A.length) return setTimeout(step, 0); res(); } catch (e) { rej(e); } })(); }); };
    return slices().then(function () { if (prog) prog(0, 0, 'cross'); return tick(function () { return run(E0, U, { prep: true }); }); })
      .then(function (P) { return backtestAsync(P.blist, P.E, prog ? function (i, n) { prog(i, n, 'bt'); } : null); })
      .then(function (bt) { if (prog) prog(0, 0, 'db'); return tick(function () {
        var r = run(E0, U, { bt: bt }), db = r.valDb; Object.keys(CACHE).forEach(function (q) { if (/\|F$/.test(q)) delete CACHE[q]; });
        if (db) { db.lite = lite; var V = E0.val = E0.val || {}; V.db = db; registry(V, db, J, r.E); } r.lite = lite; return r; }); });
  }
  function validate(E0, U0, J) {
    var r = run(E0, U0, { backtest: true }), db = r.valDb;
    // the full per-bar analyses are only needed during the back-test; free them (the live run rebuilds the small version)
    Object.keys(CACHE).forEach(function (k) { if (/\|F$/.test(k)) delete CACHE[k]; });
    if (!db) return r;
    var V = E0.val = E0.val || {}; V.db = db; registry(V, db, J, r.E); return r;
  }

  /* ---------------- cross-market strategy XG1: domestic gold premium over world gold (independent test) ----------------
   * Premium b_t = ln(domestic price / intrinsic), intrinsic = ounce (USD) / 31.1035 × grams × purity × free-market dollar
   * (ounce and dollar carried forward to the domestic date; same formula as the gold signal tool).
   * z_t = (b_t − mean) / sd over the trailing L days (data to t only). Long the domestic instrument when z ≤ −zIn; exit when
   * z ≥ zOut, on the stop (entry − k × mean absolute daily change of 20 days) or after T sessions. Decision at close t,
   * execution at close t+1 (no intraday assumption). No short (physical gold). Each instrument is tested on its own.
   * Extra tests specific to this strategy: (1) lift over the drift — Iranian gold rises with inflation, so the trades must beat
   * holding for the same number of days from any day; (2) a 3 × 3 parameter grid (L × zIn) — the result must not depend on one setting;
   * (3) the "expensive" reading (z ≥ zIn): forward 20-day return after it vs any day, non-overlapping. */
  var XGD = { on: true, L: 120, zIn: 1.5, zOut: 0, T: 40, k: 3, cost: null, primary: 'geram18' };
  function xgSeries(S, ins) {
    var g = Number(ins.grams), pu = Number(ins.purity), D = S.data || {}, rows = D[ins.key], ons = D.ons, usd = D.price_dollar_rl;
    if (!(g > 0 && pu > 0) || !rows || !ons || !usd || rows.length < 60) return null;
    var srt = function (a) { return a.filter(function (r) { return isF(r.close) && r.close > 0; }).slice().sort(function (p, q) { return p.date - q.date; }); };
    var R = srt(rows), O = srt(ons), Ud = srt(usd), io = -1, iu = -1, out = { d: [], p: [], b: [], imp: [] };
    R.forEach(function (r) { while (io + 1 < O.length && O[io + 1].date <= r.date) io++; while (iu + 1 < Ud.length && Ud[iu + 1].date <= r.date) iu++; if (io < 0 || iu < 0) return;
      var I = O[io].close / 31.1035 * g * pu * Ud[iu].close; out.d.push(r.date); out.p.push(r.close); out.imp.push(I); out.b.push(Math.log(r.close / I)); });
    return out.d.length >= 60 ? out : null;
  }
  function xgZ(b, L) { var z = new Array(b.length).fill(NaN); for (var t = L - 1; t < b.length; t++) { var w = b.slice(t - L + 1, t + 1), m = mean(w), s = sd(w); z[t] = s > 0 ? (b[t] - m) / s : NaN; } return z; }
  function xgSim(X, P, cost, sym) {
    var z = xgZ(X.b, P.L), p = X.p, n = p.length, tr = [], pos = null, ad = new Array(n).fill(NaN);
    for (var i = 20; i < n; i++) { var s = 0; for (var j = i - 19; j <= i; j++) s += Math.abs(p[j] - p[j - 1]); ad[i] = s / 20; }
    for (var t = P.L; t < n - 1; t++) {
      if (pos) { pos.days++; var why = z[t] >= P.zOut ? 'tp' : p[t] <= pos.stop ? 'stop' : pos.days >= P.T ? 'time' : null;
        if (why) { var ex = p[t + 1]; pos.r = (ex - pos.e) / pos.R - pos.cr; pos.ret = ex / pos.e - 1 - cost; pos.exit = why; pos.xd = X.d[t + 1]; tr.push(pos); pos = null; t++; }
        continue; }
      if (isF(z[t]) && z[t] <= -P.zIn && isF(ad[t]) && ad[t] > 0) { var e = p[t + 1], R = P.k * ad[t]; pos = { e: e, R: R, stop: e - R, cr: cost * e / R, d: X.d[t + 1], days: 0, conf: 0, rg: 'xg', asset: sym, cls: 'xgold', z: z[t] }; }
    }
    return { tr: tr, z: z, ad: ad };
  }
  function xgStrategy(E) {
    var SG = Hub.signals, cfg = Object.assign({}, XGD, E.xg || {}), out = { cfg: cfg, inst: [], note: '' };
    if (!SG || !SG.gold || cfg.on === false) { out.note = 'ابزار طلا در دسترس نیست یا راهبرد خاموش است.'; return out; }
    var S = getStore('hub.sig-gold.v1', SG.gold.sample), smp = isSampleSrc(S.meta && S.meta.source), cost = isF(cfg.cost) ? cfg.cost : Number(E.acct.costPct) || 0, th = Object.assign({}, VTH, E.val && E.val.th);
    out.sample = smp; out.asOf = S.meta && S.meta.asOf; out.cost = cost;
    (S.ins || []).filter(function (x) { return x.active !== false && Number(x.grams) > 0 && Number(x.purity) > 0; }).forEach(function (ins) {
      var X = xgSeries(S, ins); if (!X) { out.inst.push({ key: ins.key, name: ins.series, none: 'سری داخلی، اونس یا دلار کمتر از ۶۰ روز است یا نیست.' }); return; }
      var sim = xgSim(X, cfg, cost, ins.series), tr = sim.tr, n = X.p.length, dset = X.d.slice(cfg.L), split = dset[Math.floor(dset.length * 0.6)] || X.d[n - 1];
      var ev = vstats(tr, split, Number(E.acct.riskPct) || 0.01);
      // drift baseline: hold the same number of sessions from any day
      var Hb = Math.max(1, Math.round(ev.n ? ev.days : cfg.T / 2)), base = [];
      for (var t = cfg.L; t + 1 + Hb < n; t++) base.push(X.p[t + 1 + Hb] / X.p[t + 1] - 1 - cost);
      var tret = tr.map(function (x) { return x.ret; }), lift = mean(tret) - mean(base), se = Math.sqrt((tret.length > 1 ? Math.pow(sd(tret), 2) / tret.length : NaN) + (base.length > 1 ? Math.pow(sd(base), 2) / base.length : 0)), liftT = se > 0 ? lift / se : NaN;
      // parameter grid
      var grid = []; [60, 120, 250].forEach(function (L) { [1, 1.5, 2].forEach(function (zi) { var g2 = xgSim(X, Object.assign({}, cfg, { L: L, zIn: zi }), cost, ins.series).tr, s2 = stats(g2); grid.push({ L: L, zIn: zi, n: s2.n || 0, avgR: s2.n ? s2.avgR : NaN }); }); });
      var gridPos = grid.filter(function (g) { return g.n >= 3 && g.avgR > 0; }).length, gridN = grid.filter(function (g) { return g.n >= 3; }).length;
      // expensive reading: forward 20-day return after z ≥ zIn vs any day (non-overlapping)
      var hiR = [], anyR = []; for (t = cfg.L; t + 21 < n; t += 1) { var f = X.p[t + 21] / X.p[t + 1] - 1; if ((t - cfg.L) % 20 === 0) anyR.push(f); }
      for (t = cfg.L; t + 21 < n; t++) if (sim.z[t] >= cfg.zIn) { hiR.push(X.p[t + 21] / X.p[t + 1] - 1); t += 20; }
      // look-ahead audit: z from a series cut at t equals z from the full series
      var chk = 0, diff = 0; [0.5, 0.7, 0.9].forEach(function (q) { var tt = Math.floor(n * q); if (tt < cfg.L) return; var zc = xgZ(X.b.slice(0, tt + 1), cfg.L)[tt]; chk++; if (!(Math.abs(zc - sim.z[tt]) < 1e-9 || (!isF(zc) && !isF(sim.z[tt])))) diff++; });
      // grade
      var oos = ev.oos || { n: 0 }, tt2 = isF(ev.tc) ? ev.tc : ev.t, fs = ev.nFolds ? ev.posFolds / ev.nFolds : NaN, A = [], B = [], ck = function (a, b2, why) { A.push([a, why]); B.push([b2, why]); };
      if (ev.n) {
        ck(ev.n >= th.nA, ev.n >= th.nB, 'معاملات ' + fa(ev.n, 0) + ' (حداقل A ' + fa(th.nA, 0) + '، B ' + fa(th.nB, 0) + ')');
        ck(oos.n >= th.oosA, oos.n >= th.oosB, 'خارج از نمونه ' + fa(oos.n || 0, 0) + ' معامله');
        ck(oos.n > 0 && oos.avgR > th.expA, oos.n > 0 && oos.avgR > 0, 'امید ریاضی خارج از نمونه ' + (oos.n ? fa(oos.avgR, 2) + 'R' : '—'));
        ck(oos.n > 0 && oos.pf >= th.pfA, oos.n > 0 && oos.pf >= th.pfB, 'ضریب سود خارج از نمونه ' + (oos.n && isF(oos.pf) ? fa(oos.pf, 2) : '—'));
        ck(isF(tt2) && tt2 >= th.tA, isF(tt2) && tt2 >= th.tB, 'معناداری t ' + (isF(tt2) ? fa(tt2, 2) : 'قابل محاسبه نیست'));
        ck(ev.nFolds >= 3 && fs >= th.foldA, ev.nFolds >= 3 && fs >= th.foldB, 'پایداری ' + fa(ev.posFolds || 0, 0) + ' از ' + fa(ev.nFolds || 0, 0) + ' بلوک');
        var cs2 = isF(ev.crm) ? ev.avgR - (th.costX - 1) * ev.crm : ev.c2; ck(isF(cs2) && cs2 > 0, isF(cs2) && cs2 > 0, 'با هزینهٔ ' + fa(th.costX, 1) + ' برابر ' + (isF(cs2) ? fa(cs2, 2) + 'R' : '—'));
        ck(isF(liftT) && liftT >= 2, isF(liftT) && lift > 0 && liftT >= 1, 'برتری بر نگه‌داری ساده (رشد تورمی طلا) ' + (isF(lift) ? pct(lift, 2) : '—') + ' با t ' + (isF(liftT) ? fa(liftT, 2) : '—'));
        ck(gridN >= 6 && gridPos >= 6, gridN >= 6 && gridPos >= 5, 'حساسیت پارامتر: ' + fa(gridPos, 0) + ' از ' + fa(gridN, 0) + ' ترکیب L × آستانه سودده');
        ck(chk >= 3 && !diff, true, 'حسابرسی نگاه به آینده: ' + (diff ? 'اختلاف' : 'بدون اختلاف در ' + fa(chk, 0) + ' مقایسه'));
      }
      var okA = ev.n && A.every(function (x) { return x[0]; }), okB = ev.n && B.every(function (x) { return x[0]; }), gr = smp ? 'D' : okA ? 'A' : okB ? 'B' : ev.n >= th.nC && ev.avgR > 0 && !(oos.n && oos.avgR <= 0) ? 'C' : 'D';
      var reasons = smp ? ['دادهٔ طلا نمونه (ساختگی) است.'] : !ev.n ? ['در این دوره هیچ معامله‌ای رخ نداد.'] : (gr === 'A' ? [] : gr === 'B' ? A : B).filter(function (x) { return !x[0]; }).map(function (x) { return x[1]; });
      var zl = sim.z[n - 1], m = mean(X.b.slice(-cfg.L)), last = X.p[n - 1], tgt = X.imp[n - 1] * Math.exp(m), stop = last - cfg.k * sim.ad[n - 1];
      var state = !isF(zl) ? 'نامشخص' : zl <= -cfg.zIn ? 'ارزان نسبت به جهانی' : zl >= cfg.zIn ? 'گران نسبت به جهانی' : 'در محدودهٔ عادی';
      out.inst.push({ key: ins.key, name: ins.series, n: n, from: X.d[0], to: X.d[n - 1], split: split, ev: ev, grade: gr, fa: GRD[gr], reasons: reasons, ok: A.filter(function (x) { return x[0]; }).map(function (x) { return x[1]; }),
        lift: lift, liftT: liftT, Hb: Hb, grid: grid, gridPos: gridPos, gridN: gridN, hi: { n: hiR.length, m: mean(hiR), any: mean(anyR), nAny: anyR.length }, audit: { chk: chk, diff: diff },
        now: { z: zl, prem: Math.exp(X.b[n - 1]) - 1, premMean: Math.exp(m) - 1, state: state, last: last, target: tgt, stop: stop, rr: last > stop ? (tgt - last) / (last - stop) : NaN, date: X.d[n - 1] },
        signal: isF(zl) && zl <= -cfg.zIn ? (gr === 'A' || gr === 'B' ? 'buy' : 'unconfirmed') : 'none', trades: tr.slice(-12) });
    });
    return out;
  }

  /* ---------------- index forecast: probability that the total index is higher after h sessions ----------------
   * Not a regime label: a forecast, and it has to prove skill. Features at day t use data to t only: log returns over 5, 20 and
   * 60 sessions, distance to the 50-day average, 20-day volatility, distance from the 120-day high. Ridge logistic regression,
   * walk-forward (expanding window, refit every 20 sessions, at least 120 training days). Benchmark = the base rate (share of
   * h-day periods that ended higher in the training data, also causal). Skill only if the Brier score beats the base rate and
   * a Diebold–Mariano test on squared errors (Newey–West, lag h−1, because h-day targets overlap) gives t ≥ 2 with ≥ 20
   * non-overlapping periods. Without skill the tool shows the base rate and says the model adds nothing. */
  function ixFeat(c, t) { if (t < 120) return null; var l = function (a, b) { return Math.log(c[a] / c[b]); }, r = [], m50 = 0, hi = 0;
    for (var i = t - 19; i <= t; i++) r.push(Math.log(c[i] / c[i - 1])); for (i = t - 49; i <= t; i++) m50 += c[i] / 50; for (i = t - 119; i <= t; i++) hi = Math.max(hi, c[i]);
    return [l(t, t - 5), l(t, t - 20), l(t, t - 60), Math.log(c[t] / m50), sd(r), Math.log(c[t] / hi)]; }
  function solve(A, b) { var n = b.length, M = A.map(function (r, i) { return r.concat([b[i]]); }); for (var i = 0; i < n; i++) { var p = i; for (var k = i + 1; k < n; k++) if (Math.abs(M[k][i]) > Math.abs(M[p][i])) p = k; var tmp = M[i]; M[i] = M[p]; M[p] = tmp; if (Math.abs(M[i][i]) < 1e-12) return null;
      for (k = i + 1; k < n; k++) { var f = M[k][i] / M[i][i]; for (var j = i; j <= n; j++) M[k][j] -= f * M[i][j]; } } var x = new Array(n); for (i = n - 1; i >= 0; i--) { var s = M[i][n]; for (j = i + 1; j < n; j++) s -= M[i][j] * x[j]; x[i] = s / M[i][i]; } return x; }
  function logit(Xs, ys, lam) {   // ridge logistic regression by Newton steps; features standardised; intercept not penalised
    var k = Xs[0].length, mu = [], sg = []; for (var j = 0; j < k; j++) { var col = Xs.map(function (x) { return x[j]; }); mu.push(mean(col)); sg.push(sd(col) || 1); }
    var Z = Xs.map(function (x) { return [1].concat(x.map(function (v, j) { return (v - mu[j]) / sg[j]; })); }), w = new Array(k + 1).fill(0);
    for (var it = 0; it < 25; it++) { var H = [], g = new Array(k + 1).fill(0); for (var a = 0; a <= k; a++) H.push(new Array(k + 1).fill(0));
      Z.forEach(function (z, i) { var e = 0; for (var q = 0; q <= k; q++) e += w[q] * z[q]; var p = 1 / (1 + Math.exp(-e)), d = p * (1 - p); for (q = 0; q <= k; q++) { g[q] += (ys[i] - p) * z[q]; for (var r = 0; r <= k; r++) H[q][r] += d * z[q] * z[r]; } });
      for (a = 1; a <= k; a++) { g[a] -= lam * w[a]; H[a][a] += lam; } var st = solve(H, g); if (!st) break; var mx = 0; for (a = 0; a <= k; a++) { w[a] += st[a]; mx = Math.max(mx, Math.abs(st[a])); } if (mx < 1e-7) break; }
    return function (x) { var e = w[0]; for (var j = 0; j < k; j++) e += w[j + 1] * (x[j] - mu[j]) / sg[j]; return 1 / (1 + Math.exp(-e)); };
  }
  function indexForecast(rows, opts) {
    opts = opts || {}; var R = (rows || []).filter(function (r) { return isF(r.close) && r.close > 0; }).slice().sort(function (a, b) { return a.date - b.date; }), c = R.map(function (r) { return r.close; }), n = c.length;
    var out = { n: n, from: n ? R[0].date : null, to: n ? R[n - 1].date : null, H: [] }, DM = Hub.macroEval && Hub.macroEval.dm;
    (opts.h || [5, 20, 60]).forEach(function (h) {
      var o = { h: h, ok: false }; out.H.push(o); var t0 = 120 + 120;   // 120 days for the features + 120 training rows
      if (n < t0 + h + 40) { o.note = 'تاریخچهٔ شاخص کوتاه است: برای افق ' + fa(h, 0) + ' جلسه دست‌کم ' + fa(t0 + h + 40, 0) + ' روز لازم است (موجود: ' + fa(n, 0) + '). داده سهام را دوباره دریافت کنید تا تاریخچهٔ کامل شاخص بیاید.'; return; }
      var F = []; for (var t = 0; t < n; t++) F.push(ixFeat(c, t));
      var pr = [], fit = null, base = NaN;
      for (t = t0; t + h < n; t++) {
        if (!fit || (t - t0) % 20 === 0) { var Xs = [], ys = []; for (var u = 120; u + h <= t; u++) { Xs.push(F[u]); ys.push(c[u + h] > c[u] ? 1 : 0); } base = mean(ys); fit = logit(Xs, ys, 50); }
        var y = c[t + h] > c[t] ? 1 : 0; pr.push({ t: t, p: fit(F[t]), b: base, y: y, ret: c[t + h] / c[t] - 1 });
      }
      var bm = mean(pr.map(function (x) { return (x.p - x.y) * (x.p - x.y); })), bb = mean(pr.map(function (x) { return (x.b - x.y) * (x.b - x.y); })), dl = pr.map(function (x) { return (x.b - x.y) * (x.b - x.y) - (x.p - x.y) * (x.p - x.y); });
      o.n = pr.length; o.nEff = Math.floor(pr.length / h); o.brier = bm; o.brierBase = bb; o.bss = bb > 0 ? 1 - bm / bb : NaN; o.dm = DM ? DM(dl, h) : NaN;
      o.hit = mean(pr.map(function (x) { return (x.p >= 0.5 ? 1 : 0) === x.y ? 1 : 0; })); o.hitBase = mean(pr.map(function (x) { return (x.b >= 0.5 ? 1 : 0) === x.y ? 1 : 0; })); o.upRate = mean(pr.map(function (x) { return x.y; }));
      var hiP = pr.filter(function (x) { return x.p >= 0.6; }), loP = pr.filter(function (x) { return x.p <= 0.4; });
      // classification view of the same walk-forward forecasts: «up» call = p ≥ 0.6. precision = share of up calls that ended higher; recall = share of higher periods that were called
      var ups = pr.filter(function (x) { return x.y === 1; }); o.prec = hiP.length ? mean(hiP.map(function (x) { return x.y; })) : NaN; o.rec = ups.length ? ups.filter(function (x) { return x.p >= 0.6; }).length / ups.length : NaN; o.nCall = hiP.length; o.mae = mean(pr.map(function (x) { return Math.abs(x.p - x.y); }));
      o.hiP = { n: hiP.length, up: mean(hiP.map(function (x) { return x.y; })), ret: mean(hiP.map(function (x) { return x.ret; })) }; o.loP = { n: loP.length, up: mean(loP.map(function (x) { return x.y; })), ret: mean(loP.map(function (x) { return x.ret; })) };
      o.skill = o.nEff >= 20 && o.bss > 0 && o.dm >= 2;
      // today's forecast: fit on everything known now
      var Xa = [], ya = []; for (u = 120; u + h < n; u++) { Xa.push(F[u]); ya.push(c[u + h] > c[u] ? 1 : 0); } var fa2 = logit(Xa, ya, 50);
      o.pModel = fa2(F[n - 1]); o.pBase = mean(ya); o.p = o.skill ? o.pModel : o.pBase;
      var hr = []; for (u = 0; u + h < n; u += h) hr.push(c[u + h] / c[u] - 1); hr.sort(function (a, b) { return a - b; }); o.q = [hr[Math.floor(hr.length * 0.1)], hr[Math.floor(hr.length * 0.5)], hr[Math.min(hr.length - 1, Math.floor(hr.length * 0.9))]]; o.nQ = hr.length;
      o.ok = true;
    });
    return out;
  }

  /* ---------------- intelligent prioritisation, market pulse and the widget feed (one source for the dashboard and the widget) ----------------
   * Rank order (evidence first, attractiveness second — the two are kept apart):
   *   1 protective actions on positions you hold (stop hit, crisis exit, signal turned negative, time exit)
   *   2 confirmed buys (grade A, then B), ordered by attractiveness = out-of-sample expectancy of their evidence × confidence
   *   3 cross-market confirmed buys (XG1)
   *   4 conditional: the strongest unconfirmed patterns → "wait for confirmation" (never "buy")
   *   5 "hold cash / no action" when there is no confirmed buy.
   * Risk label from the asset's 20-day volatility (annualised): < 25% low, < 45% medium, otherwise high. Horizon from the card. */
  function riskFa(vol) { return !isF(vol) ? 'نامشخص' : vol < 0.25 ? 'کم' : vol < 0.45 ? 'متوسط' : 'زیاد'; }
  function hzFa(c) { var k = c.horizon && c.horizon.k; return k === 's' ? 'کوتاه‌مدت' : k === 'l' ? 'بلندمدت' : 'میان‌مدت'; }
  // the action list is a view of the same decision (decide): urgent actions on held positions, then the ranked opportunities, then cash
  function priorities(X, E) {
    var D = X.decide(), P = [];
    D.best.urgent.forEach(function (u) { P.push({ tier: 1, kind: 'urgent', asset: u.asset, market: 'موقعیت شما', action: u.action, horizon: 'فوری', risk: 'زیاد', grade: '—', why: u.why, cond: 'جلسهٔ معاملاتی بعد', inval: '—', personal: true }); });
    // directive 22: confirmation, order and levels come from the central record (one verdict, one rank, one set of levels)
    var CB = X.central && X.central.by || {}, rk = function (f) { var r = CB[f.key]; return r && isF(r.rank) ? r.rank : 1e9; };
    D.top.slice().sort(function (a, b) { return rk(a) - rk(b); }).forEach(function (f0) { var c = f0.key && X.cards.filter(function (x) { return x.key === f0.key; })[0], cr = CB[f0.key], Lc = cr && cr.L || {};
      var f = Object.assign({}, f0, { confirmed: cr ? cr.tier === 'ok' : f0.confirmed }); if (cr) c = Object.assign({}, c || {}, { lo: Lc.buy ? Lc.buy[0] : c && c.lo, hi: Lc.buy ? Lc.buy[1] : c && c.hi, stop: isF(Lc.stop) ? Lc.stop : c && c.stop, tp1: (Lc.tp || [])[0], tp2: (Lc.tp || [])[1], tp3: (Lc.tp || [])[2], rr2: isF(cr.rr) ? cr.rr : c && c.rr2 });
      P.push({ tier: f.confirmed ? 2 : 4, kind: f.confirmed ? 'now' : 'wait', key: f.key, asset: f.sym, market: CLSFA[f.cls] || f.cls, action: f.confirmed ? 'خرید' : 'خرید مشروط (هنوز نخرید)', horizon: c ? hzFa(c) : 'میان‌مدت', risk: c ? riskFa(c.vol) : 'متوسط', grade: f.grade, att: f.score,
        why: f.drivers[0] ? f.drivers[0] + (isF(f.expRet) ? '؛ بازده مورد انتظار هر معامله ' + pct(f.expRet, 1) : '') : f.label, cond: f.confirmed ? (c ? 'ورود ' + fa(c.lo, 0) + '–' + fa(c.hi, 0) : f.scen[0].act) : 'فعال‌شدن: ' + f.confirm, inval: f.invalid,
        entry: c && f.confirmed ? [c.lo, c.hi] : null, stop: c ? c.stop : null, tp: c ? [c.tp1, c.tp2, c.tp3] : null, rr: c ? c.rr2 : NaN, expR: f.expRet, last: f.last, date: c ? c.date : '' }); });
    if (D.best.kind === 'cash' || !D.top.some(function (f) { return f.confirmed; })) P.push({ tier: 5, kind: D.best.kind === 'cash' ? 'none' : 'cashalt', asset: 'وجه نقد', market: 'همهٔ بازارهای تحت پوشش', action: D.best.kind === 'cash' ? 'نگه‌داری نقد' : 'نقد تا فعال‌شدن خرید مشروط', horizon: '—', risk: 'کم', grade: '—', why: D.best.kind === 'cash' ? D.best.why : 'هیچ خرید تأییدشده‌ای نیست؛ تا شرط فعال‌شدن گزینه‌های بالا برقرار نشده، نقد بمانید.', cond: '—', inval: D.best.reinvest });
    P.forEach(function (p, i) { p.rank = i + 1; });
    return P;
  }
  function pulse(X, U) {
    var now = Date.now() / 864e5, it = [], byKey = {}; (X.cards || []).forEach(function (c) { byKey[c.key] = c; });
    var add = function (name, rows, unit, key) {
      if (!rows || rows.length < 2) { it.push({ name: name, none: true }); return; }
      var r = rows.slice().sort(function (a, b) { return a.date - b.date; }), L = r[r.length - 1], p1 = r[r.length - 2], p20 = r[Math.max(0, r.length - 21)], age = now - d2days(L.date);
      var w20 = r.slice(-20), o = { name: name, v: L.close, unit: unit, c1: L.close / p1.close - 1, c20: L.close / p20.close - 1, date: L.date, age: isF(age) ? Math.floor(age) : null, stale: !isF(age) || age > 4,
        hi20: Math.max.apply(null, w20.map(function (x) { return isF(x.high) && x.high > 0 ? x.high : x.close; })), lo20: Math.min.apply(null, w20.map(function (x) { return isF(x.low) && x.low > 0 ? x.low : x.close; })) };
      // forecast: the same skill-gated model as the index, on this series (cached per series state)
      var fk = 'FC|' + name + '|' + r.length + '|' + L.date + '|' + L.close; if (!CACHE[fk]) { try { CACHE[fk] = indexForecast(r, { h: [5, 20] }); } catch (e) { CACHE[fk] = null; } }
      var F = CACHE[fk]; o.fc = F ? F.H.filter(function (q) { return q.ok; }).map(function (q) { return { h: q.h, p: q.p, skill: q.skill }; }) : []; if (F && !o.fc.length) o.fcNote = F.H[0] && F.H[0].note;
      // levels: from the engine's own card for this asset (confirmed signal, or plan levels of an unconfirmed one)
      var cr = key && X.central && X.central.by[key]; if (cr && cr.L && isF(cr.L.stop)) { var tok = cr.tier === 'ok'; o.lv = { stop: cr.L.stop, tp: cr.sell ? null : (cr.L.tp || [])[1], side: cr.sell ? 'down' : 'up', conf: tok, grade: cr.grade || null, act: cr.actFa + ' — ' + cr.stFa, ver: cr.ver || null }; it.push(o); return; }
      var c = key && byKey[key]; if (c && isF(c.stop)) { var conf = (c.type === 'long' || c.type === 'short') && c.val && (c.val.grade === 'A' || c.val.grade === 'B');
        o.lv = { stop: c.stop, tp: c.type === 'close' ? null : c.tp2, side: c.type === 'close' ? 'down' : 'up', conf: conf, grade: c.val ? c.val.grade : null, act: conf ? c.typeFa : c.candidate ? 'تأییدنشده' : c.type === 'close' ? 'منفی: نخرید / اگر دارید بفروشید' : 'بدون سیگنال' }; }
      it.push(o); };
    add('شاخص کل بورس', U && U.idx, 'واحد');
    var byTg = {}; (X.list || []).forEach(function (z) { if (z.a.tg) byTg[z.a.tg] = z.a; });
    [['price_dollar_rl', 'دلار آزاد', 'ریال'], ['crypto-tether-irr', 'تتر', 'ریال'], ['geram18', 'طلای ۱۸ عیار (گرم)', 'ریال'], ['sekee', 'سکه امامی', 'ریال'], ['ons', 'اونس جهانی طلا', 'دلار']].forEach(function (k) { var a = byTg[k[0]]; add(k[1], a && !a.sample ? a.rows : null, k[2], a && a.key); });
    var GM = Hub.globalMkt ? Hub.globalMkt.rowsAll() : [], gp = function (name, ids, unit) { for (var i = 0; i < ids.length; i++) { var o = GM.filter(function (g) { return g.id === ids[i]; })[0]; if (o && o.rows.length >= 2) return add(name + ' (' + o.src + ')', o.rows, unit); } it.push({ name: name, none: true }); };
    gp('بیت‌کوین', ['g:btc', 'lv:crypto-bitcoin'], 'دلار'); gp('نفت برنت', ['g:brent', 'lv:oil_brent'], 'دلار'); gp('بازده اوراق ۱۰ سالهٔ آمریکا', ['g:ust10'], '٪');
    return it;
  }
  function widget(X, E, U) {
    var P = priorities(X, E).filter(function (p) { return !p.personal; }), F = X.ixf, alerts = [];
    X.cards.filter(function (c) { return c.type === 'long' && c.val && (c.val.grade === 'A' || c.val.grade === 'B'); }).forEach(function (c) { if (c.close <= c.stop * 1.02) alerts.push(c.sym + ': قیمت به حد ضرر نزدیک است'); });
    var maxD = 0; (X.list || []).forEach(function (z) { if (!z.a.sample) maxD = Math.max(maxD, z.R.X.d[z.R.X.n - 1]); });
    var D = X.decide ? X.decide() : null, num0 = function (v) { return isF(v) ? Math.round(v * 100) / 100 : null; };
    var dec = D ? { best: { kind: D.best.kind, text: D.best.text, why: D.best.why, reinvest: D.best.reinvest, grade: D.best.f ? D.best.f.grade : null, horizon: D.best.f ? 'میان‌مدت' : null },
      screened: D.screened, ranked: D.ranked,
      opps: D.top.slice().sort(function (a, b) { var CB = X.central && X.central.by || {}, ra = CB[a.key] && isF(CB[a.key].rank) ? CB[a.key].rank : 1e9, rb = CB[b.key] && isF(CB[b.key].rank) ? CB[b.key].rank : 1e9; return ra - rb; }).map(function (f) { var cr = X.central && X.central.by[f.key]; return { rank: cr ? cr.rank : null, verdict: cr ? cr.actFa + ' — ' + cr.stFa : null, ver: cr ? cr.ver : null, asset: f.sym, market: CLSFA[f.cls] || f.cls, dir: f.dir, label: f.label, grade: f.grade, last: num0(f.last), lo20: num0(f.lo20), hi20: num0(f.hi20), r20: f.r20 ? f.r20.map(num0) : null, expRet: num0(f.expRet), confirm: f.confirm, invalid: f.invalid, act: f.scen[0].act, prob: f.prob, entry: f.desk ? [num0(f.desk.S.bull.lo), num0(f.desk.S.bull.hi)] : null, exit: f.desk ? [num0(f.desk.S.bull.exitLo), num0(f.desk.S.bull.exitHi)] : null, stop: f.desk ? num0(f.desk.S.bull.stop) : null, tp: f.desk ? f.desk.S.bull.tp.map(num0) : null, status: f.desk ? (f.desk.track ? ST8[f.desk.track.st] : f.desk.S.stateFa) : null }; }),
      markets: D.markets.map(function (m) { return { name: m.name, dir: m.dir, note: m.note }; }) } : null;
    return { v: 2, at: new Date().toISOString(), asOf: maxD || null, asOfFa: maxD ? shamsi(maxD) : '', decision: dec, val: X.valState, valVer: E.val && E.val.db ? E.val.db.ver : null,
      priorities: P.slice(0, 5).map(function (p) { return { rank: p.rank, asset: p.asset, market: p.market, action: p.action, horizon: p.horizon, risk: p.risk, grade: p.grade, why: p.why, kind: p.kind }; }),
      signals: P.filter(function (p) { return p.tier === 2 || p.tier === 3; }).slice(0, 8).map(function (p) { return { asset: p.asset, action: p.action, entry: p.entry, stop: p.stop, tp: p.tp, last: p.last, grade: p.grade }; }),
      alerts: alerts.slice(0, 6), pulse: pulse(X, U).map(function (q) { return q.none ? { name: q.name, none: true } : { name: q.name, v: q.v, unit: q.unit, c1: q.c1, c20: q.c20, date: q.date, dateFa: shamsi(q.date), stale: q.stale, hi20: q.hi20, lo20: q.lo20, fc: q.fc, lv: q.lv }; }),
      forecast: F && F.H ? F.H.filter(function (o) { return o.ok; }).map(function (o) { return { h: o.h, p: o.p, skill: o.skill, base: o.pBase }; }) : [] };
  }

  /* ---------------- forecast ≠ signal ≠ best action ----------------
   * Forecast (every asset): the engine's directional view = sign of the ensemble vote (|S| ≥ 0.15), long-run trend from the
   * 200-day (or 120-day) average and its slope, expected ranges = 10/50/90% of this asset's own historical 5- and 20-session
   * returns (a distribution of the past, not a promise), drivers = the models voting for / against, confirmation and
   * invalidation levels, action per scenario. A probability is given only where the skill-gated model beat the base rate on
   * that series; otherwise the base rate is shown and labelled. Every forecast without A/B evidence is labelled «پیش‌بینی مشروط و تأییدنشده».
   * Best action (all covered markets): screen every non-sample asset, rank by attractiveness = evidence weight × confidence ×
   * evidence-based expected return per trade (out-of-sample expectancy of its back-test pool × its stop distance in %) ÷ its
   * historical 20-session downside (10% quantile). Compare with cash at the user's rate. Count follows quality, not a quota. */
  var GW = { A: 1, B: 0.8, C: 0.5, D: 0.25 };
  function qret(cl, h) { var r = [], n = cl.length; for (var t = Math.max(0, n - 750); t + h < n; t += Math.max(1, Math.floor(h / 2))) r.push(cl[t + h] / cl[t] - 1); if (r.length < 20) return null; r.sort(function (a, b) { return a - b; }); var Q = function (p) { return r[Math.min(r.length - 1, Math.floor(p * (r.length - 1)))]; }; return [Q(0.1), Q(0.5), Q(0.9)]; }
  function forecastAsset(c, z, full, db) {
    var X = z.R.X, cl = X.c.slice(0, X.n), n = cl.length, last = cl[n - 1], f = { key: c.key, sym: c.sym, name: c.name, cls: c.cls, last: last, date: c.date, unit: c.unit };
    f.dir = c.S >= 0.15 ? 'up' : c.S <= -0.15 ? 'down' : 'flat'; f.S = c.S; f.conf = c.conf;
    var L = n >= 220 ? 200 : 120, m = sma(cl, L), mN = m[n - 1], m20 = m[n - 21];
    f.long = !isF(mN) || !isF(m20) ? 'unknown' : last > mN && mN > m20 ? 'up' : last < mN && mN < m20 ? 'down' : 'flat'; f.longBasis = 'قیمت نسبت به میانگین ' + L + ' روزه و شیب آن';
    f.r5 = qret(cl, 5); f.r20 = qret(cl, 20);
    var w20 = cl.slice(-20); f.hi20 = Math.max.apply(null, w20); f.lo20 = Math.min.apply(null, w20);
    f.drivers = (c.top || []).slice(0, 3).map(function (t) { return t.why; }).filter(Boolean); f.against = (c.against || []).slice(0, 2).map(function (t) { return t.why; }).filter(Boolean);
    var v = c.val, ok = v && (v.grade === 'A' || v.grade === 'B') && (c.type === 'long'); f.grade = v ? v.grade : 'D'; f.confirmed = ok;
    var ev = v && v.ev; if (!ev && db && db.pools) { var pk = db.pools['c:' + c.cls + '|' + c.regime]; ev = pk && pk.n >= 15 ? pk : db.pools['c:' + c.cls]; } var oo = ev && ev.oos; f.riskFrac = isF(c.entry) && isF(c.stop) && c.entry > c.stop ? (c.entry - c.stop) / c.entry : NaN;
    f.expRet = oo && oo.n && isF(oo.avgR) && isF(f.riskFrac) ? oo.avgR * f.riskFrac : NaN; f.expDays = ev && isF(ev.days) ? ev.days : NaN; f.expN = oo ? oo.n || 0 : 0;
    f.down20 = f.r20 ? f.r20[0] : NaN;
    if (f.dir === 'up') { f.confirm = 'بسته‌شدن بالای ' + fa(Math.max(f.hi20, c.hi || 0), 0) + ' (سقف ۲۰ روز / بالای محدودهٔ ورود)'; f.invalid = 'بسته‌شدن زیر ' + fa(isF(c.stop) && c.stop < last ? c.stop : f.lo20, 0); }
    else if (f.dir === 'down') { f.confirm = 'بسته‌شدن زیر ' + fa(f.lo20, 0) + ' (کف ۲۰ روز)'; f.invalid = 'بسته‌شدن بالای ' + fa(c.type === 'close' && isF(c.stop) && c.stop > last ? c.stop : f.hi20, 0); }
    else { f.confirm = 'شکست سقف ' + fa(f.hi20, 0) + ' (دید صعودی) یا کف ' + fa(f.lo20, 0) + ' (دید نزولی)'; f.invalid = '—'; }
    f.toSignal = ok ? 'سیگنال تأییدشده است.' : (v && v.reasons && v.reasons.length ? 'برای تبدیل به سیگنال: ' + v.reasons.slice(0, 2).join('؛ ') : 'برای تبدیل به سیگنال: اعتبارسنجی با درجهٔ B یا A لازم است.');
    f.scen = f.dir === 'up' ? [{ k: 'اصلی: صعودی', act: ok ? 'خرید در ' + fa(c.lo, 0) + '–' + fa(c.hi, 0) + '، حد ضرر ' + fa(c.stop, 0) + '، هدف ' + fa(c.tp2, 0) : 'خرید مشروط: فقط پس از ' + f.confirm + ' و رسیدن درجه به B؛ تا آن زمان نخرید' }, { k: 'جایگزین: برگشت', act: 'با ' + f.invalid + ' دید صعودی باطل است؛ نخرید' }]
      : f.dir === 'down' ? [{ k: 'اصلی: نزولی', act: 'نخرید؛ اگر دارید کاهش دهید یا با حد ضرر محافظت کنید' }, { k: 'جایگزین: برگشت', act: 'با ' + f.invalid + ' دید نزولی باطل می‌شود' }]
      : [{ k: 'اصلی: خنثی', act: 'انتظار؛ ورود فقط پس از شکست سقف ' + fa(f.hi20, 0) }, { k: 'جایگزین', act: 'شکست کف ' + fa(f.lo20, 0) + ' = دید نزولی' }];
    f.label = ok ? 'سیگنال تأییدشده (درجه ' + f.grade + ')' : 'پیش‌بینی مشروط و تأییدنشده';
    if (full) { var fk = 'FC|' + c.key + '|' + n + '|' + X.d[n - 1] + '|' + last; if (!CACHE[fk]) { try { CACHE[fk] = indexForecast(cl.map(function (v2, i) { return { date: X.d[i], close: v2 }; }), { h: [5, 20] }); } catch (e) { CACHE[fk] = null; } }
      var F = CACHE[fk]; f.prob = F ? F.H.filter(function (q) { return q.ok; }).map(function (q) { return { h: q.h, p: q.p, skill: q.skill, brier: q.brier, brierBase: q.brierBase, bss: q.bss, prec: q.prec, rec: q.rec, nCall: q.nCall, upRate: q.upRate, nEff: q.nEff }; }) : []; }
    return f;
  }
  // forecast of a market series that is not a tradable card (crypto, oil, rates, metals): always a direction with its strength
  function seriesView(o) {
    var r = o.rows.filter(function (x) { return isF(x.close) && x.close > 0; }), n = r.length, cl = r.map(function (x) { return x.close; }), last = cl[n - 1];
    var ret = function (k) { return n > k ? last / cl[n - 1 - k] - 1 : NaN; }, r20 = ret(20), r60 = ret(60), m50 = n >= 50 ? mean(cl.slice(-50)) : NaN;
    var sc = (r20 > 0 ? 1 : r20 < 0 ? -1 : 0) + (r60 > 0 ? 1 : r60 < 0 ? -1 : 0) + (isF(m50) ? (last > m50 ? 1 : -1) : 0);
    var dir = sc >= 2 ? 'up' : sc <= -2 ? 'down' : sc > 0 ? 'upw' : sc < 0 ? 'downw' : (r20 >= 0 ? 'upw' : 'downw');
    var v = { name: o.name, src: o.src, unit: o.unit, last: last, date: r[n - 1].date, r20: r20, r60: r60, dir: dir, why: 'بازده ۲۰ داده ' + pct(r20, 1) + '، ۶۰ داده ' + pct(r60, 1) + (isF(m50) ? '، قیمت ' + (last > m50 ? 'بالای' : 'زیر') + ' میانگین ۵۰' : ''), prob: [] };
    if (n >= 300) { var fk = 'FCS|' + o.id + '|' + n + '|' + v.date + '|' + last; if (!CACHE[fk]) { try { CACHE[fk] = indexForecast(r, { h: [5, 20] }); } catch (e) { CACHE[fk] = null; } } var F = CACHE[fk]; v.prob = F ? F.H.filter(function (q) { return q.ok; }).map(function (q) { return { h: q.h, p: q.p, skill: q.skill }; }) : []; }
    return v;
  }
  /* ---------------- TRADING DECISION DESK (directive: forecast → opportunities in every market → scenarios → monitoring) ----------------
   * Every level comes from the engine's own structure rules (plan): entry zone from breakout / pullback supports, stop from the
   * swing low or order block minus 0.25 ATR (else k·ATR, labelled), targets from prior highs, value-area and Fibonacci
   * extensions (R-multiples only as a labelled fallback). The bear scenario uses the 20-day low as confirmation and
   * structural supports (60/120-day lows, 200-day average, value-area low) as targets. Exit zone = where profits are taken
   * (target 1 → target 2), forced exit = stop, time exit = horizon. Probability only where the skill-gated model beat the
   * base rate on that series; otherwise a qualitative confidence. No quota: an asset is an opportunity only if its view is
   * up, confidence ≥ the floor, reward/risk to target 2 ≥ the minimum, data is fresh and real, and back-test expectancy (when
   * it exists) is not negative. */
  var MKFA = { stock: 'سهام', fund: 'صندوق', gold: 'طلا و سکه', fx: 'ارز', crypto: 'رمزارز', commodity: 'کالا و انرژی', option: 'اختیار معامله' };
  var ST8 = { nosig: 'بدون سیگنال معتبر', pending: 'در انتظار تأیید', near: 'نزدیک به نقطهٔ ورود', priceok: 'شرط قیمتی برقرار؛ منتظر تأیید شواهد', confirmed: 'سیگنال تأییدشده', t1: 'در محدودهٔ هدف اول', t2: 'در محدودهٔ هدف دوم', t3: 'هدف سوم محقق شد', stopped: 'حد ضرر فعال شد', invalid: 'سناریو باطل شد', expired: 'پایان اعتبار سیگنال', bear: 'سناریوی نزولی تأیید شد', missed: 'تأیید شد؛ ورود ازدست‌رفته (منتظر بازآزمایی)' };
  var ACTIVE = { pending: 1, near: 1, priceok: 1, confirmed: 1, t1: 1, t2: 1, missed: 1 };
  function scenariosOf(c, z, E) {
    var X = z.R.X, I = z.R.I, V = z.R.V, t = X.n - 1, cl = X.c[t], atr = I.atr[t]; if (!(atr > 0)) return null;
    var isLong = c.type === 'long' || (c.candidate && c.candidate.type === 'long');
    var Pb = isLong && c.P && c.P.dir > 0 ? c.P : plan(z, t, 1, E, { trigger: hiN(X.h, t - 1, 20) + 0.05 * atr }), Pd = plan(z, t, -1, E);
    if (!Pb || !Pd) return null;
    var hi20 = hiN(X.h, t - 1, 20), lo20 = loN(X.l, t - 1, 20), vp = V.vp[t] || {}, fib = V.fib[t] || {};
    var bConf = Pb.type === 'pullback' ? Pb.hi : isF(Pb.trigger) ? Pb.trigger : hi20;
    var bull = { confirm: bConf, confirmTxt: Pb.type === 'pullback' ? 'حفظ قیمت در محدودهٔ ورود و بسته‌شدن بالای ' + fa(Pb.hi) : 'بسته‌شدن بالای ' + fa(bConf) + ' (شکست سقف ۲۰ روزه)', lo: Pb.lo, hi: Pb.hi, entry: Pb.entry, stop: Pb.stop, stopSrc: Pb.stopSrc,
      tp: [Pb.tp1, Pb.tp2, Pb.tp3], rr1: Pb.rr1, rr2: Pb.rr2, exitLo: Math.min(Pb.tp1, Pb.tp2), exitHi: Math.max(Pb.tp1, Pb.tp2), type: Pb.type,
      exitTxt: 'خروج با سود: یک‌سوم در هدف ۱ (' + fa(Pb.tp1) + ')، یک‌سوم در هدف ۲ (' + fa(Pb.tp2) + ')، باقی تا هدف ۳ (' + fa(Pb.tp3) + ') با حد ضرر متحرک؛ خروج با زیان: بسته‌شدن زیر ' + fa(Pb.stop) + '؛ خروج زمانی: ' + fa(c.horizon.days, 0) + ' جلسه بدون رسیدن به هدف ۱' };
    var bc = lo20, sup = [loN(X.l, t, 60), loN(X.l, t, 120), I.s200 ? I.s200[t] : NaN, vp.val, fib.lo].filter(function (x) { return isF(x) && x < bc - 0.3 * atr; }).sort(function (a, b) { return b - a; }).filter(function (x, i, a) { return !i || a[i - 1] - x > 0.3 * atr; });
    var fb = [bc - 2 * atr, bc - 4 * atr, bc - 6 * atr], btp = [0, 1, 2].map(function (i) { return isF(sup[i]) ? sup[i] : fb[i]; });
    for (var bi = 1; bi < 3; bi++) if (btp[bi] > btp[bi - 1] - 0.3 * atr) btp[bi] = btp[bi - 1] - 0.3 * atr;   // monotone downward
    btp = btp.map(function (v) { return Math.max(v, bc * 0.2); });
    var bear = { confirm: bc, confirmTxt: 'بسته‌شدن زیر ' + fa(bc) + ' (شکست کف ۲۰ روزه)', tp: btp, tpSrc: sup.length >= 3 ? 'ساختاری (کف‌های ۶۰/۱۲۰ روزه، میانگین ۲۰۰، کف ناحیهٔ ارزش)' : 'تا ' + fa(sup.length, 0) + ' هدف ساختاری؛ بقیه ۲، ۴ و ۶ برابر ATR زیر سطح تأیید (سطح ساختاری پایین‌تری نبود)', invalid: Pd.stop,
      exitLo: c.type === 'close' ? Pd.lo : bc - 0.3 * atr, exitHi: c.type === 'close' ? Pd.hi : bc, exitTxt: c.type === 'close' ? 'دارندگان: فروش در محدودهٔ ' + fa(Pd.lo) + '–' + fa(Pd.hi) + '؛ ' : 'دارندگان: اگر ' + fa(bc) + ' شکسته شد، فروش در ' + fa(bc - 0.3 * atr) + '–' + fa(bc) + '؛ ' };
    bear.exitTxt += 'دید نزولی با بسته‌شدن بالای ' + fa(Pd.stop) + ' باطل می‌شود.' + (/^(stock|fund|gold)$/.test(c.cls) || (c.cls === 'fx' && !E.allowShort) ? ' فروش استقراضی در دسترس نیست: سناریوی نزولی یعنی فروش موجودی یا نخریدن.' : '');
    var neutral = { lo: lo20, hi: hi20, txt: 'نوسان میان ' + fa(lo20) + ' و ' + fa(hi20) + '؛ تا شکست یکی از دو سطح اقدام نکنید.' };
    var grade = c.val ? c.val.grade : 'D', confirmed = c.type === 'long' && (grade === 'A' || grade === 'B');
    var st = c.S <= -0.2 && cl <= bc ? 'bear' : confirmed ? 'confirmed' : !isLong && Math.abs(c.S) < 0.15 ? 'nosig' : cl >= bConf ? 'priceok' : bConf - cl <= 0.5 * atr ? 'near' : 'pending';
    if (!isLong && c.S > -0.2 && st !== 'nosig' && st !== 'bear' && c.conf < E.minConf) st = 'nosig';
    var dq = []; if (c.sample) dq.push('دادهٔ نمونه'); if (isF(c.age) && c.age > 96) dq.push('داده ' + fa(c.age / 24, 0) + ' روز قدیمی'); if (c.global) dq.push('بازار جهانی؛ در بک‌تست موتور نیست'); if (/^(gold|fx)$/.test(c.cls)) dq.push('قیمت بازار آزاد (TGJU)؛ اسپرد خرید و فروش لحاظ نشده');
    if ((c.cls === 'stock' || c.cls === 'fund') && !c.liqOK) dq.push('نقدشوندگی کم: اجرای معامله و اختلاف قیمت خرید و فروش محدودکننده است');
    // exact timing: the next N sessions of this market (N = the entry window of the horizon the strategies were tested with), each judged on its own close
    var MC = Hub.mktCal, hk = c.horizon && HZN[c.horizon.k] ? c.horizon.k : 'm', dFa = shamsi(X.d[t]), win = null, chk = null;
    try { win = MC ? MC.window(c.cls === 'option' ? 'stock' : c.cls, X.d[t], HZN[hk].win, X.d) : null; chk = MC ? MC.levels(cl, bConf, bc, atr, { src: 'سقف/کف ۲۰ جلسهٔ پیش از ' + dFa, upAt: cl > bConf ? dFa : null, dnAt: cl < bc ? dFa : null }) : null; } catch (e) { win = null; }
    if (chk && chk.checks.some(function (q) { return /خطای منطقی/.test(q); })) dq.push('سطوح تأیید ناسازگارند و منتشر نمی‌شوند');
    var when = win ? 'تأیید با یک بسته‌شدن (' + win.basis + '، ' + win.tz + ') در یکی از ' + fa(win.n, 0) + ' جلسهٔ ' + win.startFa + ' تا ' + win.endFa + ' (پنجرهٔ شرط ورود افق ' + HZN[hk].fa.split(' ')[0] + ' در بک‌تست)؛ ' + win.expiry + '.' : '';
    return { bull: bull, bear: bear, neutral: neutral, state: st, stateFa: ST8[st], grade: grade, isLong: isLong, atr: atr, close: cl, dq: dq, quality: dq.length ? 'محدود: ' + dq.join('؛ ') : 'دادهٔ واقعی و به‌روز', win: win, chk: chk, when: when, asOfFa: dFa };
  }
  /* ---------------- where the price actually is in the signal's life (not "if X then confirmed") ----------------
   * Looks back over the horizon for the last close above the prior 20-day high (the bullish confirmation event) and
   * replays the bars since then: did the break hold (no close back below the level in the next 3 sessions), did the
   * stop or a target trade, is the price still inside the logical entry zone (level … level + ½ ATR), has it run away
   * (entry missed), or is it back at the level (retest). Levels of a confirmed event are the plan made AT that bar, so they
   * are not rewritten after the fact. The current action follows the state, the reward/risk from today's price, and the
   * evidence grade (an entry without A/B evidence stays "wait"). */
  var ST9 = { nc: 'تأیید نشده', near: 'در آستانهٔ تأیید', active: 'تأییدشده — فرصت ورود فعال', missed: 'تأییدشده — فرصت ورود ازدست‌رفته', retest: 'در حال اصلاح — آمادهٔ بررسی مجدد', pos: 'موقعیت فعال — معامله در جریان', target: 'هدف محقق شد', stop: 'حد ضرر فعال شد', invalid: 'سناریو باطل شد', bear: 'سناریوی نزولی تأیید شد', nosig: 'بدون سیگنال معتبر' };
  var ACT9 = { now: 'ورود در قیمت فعلی', zone: 'ورود در محدودهٔ مشخص', waitBrk: 'انتظار برای تأیید شکست', waitPb: 'انتظار برای پولبک یا اصلاح', hold: 'نگهداری موقعیت', reduce: 'کاهش موقعیت', exit: 'خروج کامل', missed: 'عدم ورود — فرصت ازدست‌رفته', badRR: 'عدم معامله — نسبت بازده به ریسک نامناسب', none: 'عدم ورود', wait: 'انتظار' };
  function pathState(z, c, S, E) {
    var X = z.R.X, I = z.R.I, t = X.n - 1, cl = X.c[t], atr = I.atr[t], W = Math.min(40, Math.max(10, c.horizon ? c.horizon.days : 20)), minRR = Number(E.acct.minRR) || 1.5;
    var tb = -1, L = NaN; for (var k = t; k >= Math.max(60, t - W + 1); k--) { var lv = hiN(X.h, k - 1, 20); if (X.c[k] > lv) { tb = k; L = lv; break; } }
    var o = { W: W };
    var bd = -1, Lb = NaN; for (var j = t; j >= Math.max(60, t - W + 1); j--) { var lw = loN(X.l, j - 1, 20); if (X.c[j] < lw) { bd = j; Lb = lw; break; } }
    if (bd > tb && c.S <= -0.2 && cl < Lb) { o.st = 'bear'; o.date = shamsi(X.d[bd]); o.level = Lb; o.why = 'بسته‌شدن ' + fa(X.c[bd]) + ' زیر کف ۲۰ روزه ' + fa(Lb) + ' در ' + o.date + '؛ قیمت هنوز زیر آن است'; return o; }
    if (tb < 0) { var hi20 = hiN(X.h, t - 1, 20); o.level = hi20; o.st = hi20 - cl <= 0.5 * atr ? 'near' : 'nc'; o.why = 'در ' + fa(W, 0) + ' جلسهٔ اخیر بسته‌شدنی بالای سقف ۲۰ روزه رخ نداده؛ سطح تأیید ' + fa(hi20) + (o.st === 'near' ? '، قیمت در فاصلهٔ نیم ATR' : '، قیمت ' + pct(hi20 / cl - 1, 1) + ' پایین‌تر'); return o; }
    var Pt = plan(z, tb, 1, E, { entry: X.c[tb] }); if (!Pt) { o.st = 'nc'; o.level = L; o.why = 'برنامهٔ معامله در روز تأیید ساخته نشد'; return o; }
    var aB = I.atr[tb], eLo = L, eHi = L + aB, fb = false, ran = false, hiS = -Infinity, loS = Infinity, hit = 0;
    // the zone is the breakout level up to 1 ATR above it, cut at the highest price that still pays the minimum R:R (directive 23 · 1)
    eHi = Math.max(L + 0.25 * aB, zoneTop(z, E, Pt.stop, Pt.tp2, eHi)); if (!(eLo > Pt.stop)) eLo = Math.min(eHi, Pt.stop + 0.25 * aB);
    for (var q = tb + 1; q <= t; q++) { if (q <= tb + 3 && X.c[q] < L) fb = true; if (X.c[q] > eHi + 0.25 * aB) ran = true; hiS = Math.max(hiS, X.h[q]); loS = Math.min(loS, X.l[q]); }
    if (hiS >= Pt.tp1) hit = 1; if (hiS >= Pt.tp2) hit = 2; if (hiS >= Pt.tp3) hit = 3;
    o.date = shamsi(X.d[tb]); o.dIdx = tb; o.level = L; o.entry = [eLo, eHi]; o.stop = Pt.stop; o.stopSrc = Pt.stopSrc; o.tp = [Pt.tp1, Pt.tp2, Pt.tp3]; o.held = !fb; o.ago = t - tb; o.hit = hit;
    o.rrNow = cl > Pt.stop ? (Pt.tp2 - cl) / (cl - Pt.stop) : NaN; o.riskNow = cl > Pt.stop ? (cl - Pt.stop) / cl : NaN; o.retNow = (Pt.tp2 - cl) / cl;
    var ev = 'تأیید در ' + o.date + ' (' + fa(o.ago, 0) + ' جلسه پیش): بسته‌شدن ' + fa(X.c[tb]) + ' بالای سقف ۲۰ روزه ' + fa(L) + (fb ? '؛ در ۳ جلسهٔ بعد زیر سطح برگشت (شکست موقت)' : '؛ تثبیت شد');
    if (loS <= Pt.stop) { o.st = hit ? 'target' : 'invalid'; o.why = ev + '؛ سپس کف ' + fa(loS) + ' به سطح ابطال ' + fa(Pt.stop) + ' رسید' + (hit ? ' (پس از رسیدن به هدف ' + fa(hit, 0) + ')' : ''); o.closed = true; return o; }
    if (fb && cl < L) { o.st = 'nc'; o.why = ev + '؛ قیمت اکنون زیر سطح است و تأیید از اعتبار افتاد؛ منتظر شکست تازه'; o.level = hiN(X.h, t - 1, 20); return o; }
    if (hit) { o.st = 'target'; o.why = ev + '؛ سقف ' + fa(hiS) + ' به هدف ' + fa(hit, 0) + ' (' + fa(o.tp[hit - 1]) + ') رسیده است'; return o; }
    if (cl >= eLo && cl <= eHi + 0.25 * aB) { o.st = ran ? 'retest' : 'active'; o.why = ev + (ran ? '؛ قیمت از محدودهٔ ورود بالا رفت و اکنون به آن برگشته (بازآزمایی سطح)' : '؛ قیمت هنوز در محدودهٔ منطقی ورود ' + fa(eLo) + '–' + fa(eHi) + ' است'); return o; }
    if (cl > eHi + 0.25 * aB) { o.st = 'missed'; o.why = ev + '؛ قیمت ' + fa(cl) + ' از محدودهٔ ورود ' + fa(eLo) + '–' + fa(eHi) + ' فاصله گرفته (' + pct(cl / eHi - 1, 1) + ' بالاتر)؛ از اینجا بازده به ریسک تا هدف ۲ = ' + fa(o.rrNow, 1); return o; }
    o.st = 'retest'; o.weak = true; o.why = ev + '؛ قیمت ' + fa(cl) + ' زیر سطح شکست ولی بالای حد ضرر است (اصلاح؛ نشانهٔ تضعیف)'; return o;
  }
  // the action now: price state × reward/risk from today × evidence grade × an open position
  function actionNow(x, E, pos) {
    var p = x.path, g = x.grade, ok = g === 'A' || g === 'B', minRR = Number(E.acct.minRR) || 1.5, a, why, chg, lv = null;
    if (pos) { var m = pos.mon || {}; if (p.st === 'bear' || /^خروج/.test(m.act || '') || (x.track && x.track.st === 'stopped')) { a = 'exit'; why = m.act || p.why; chg = '—'; }
      else if (/کاهش|یک‌سوم/.test(m.act || '') || (x.track && x.track.st === 't1') || x.c.S < 0) { a = 'reduce'; why = m.act || 'هدف اول محقق شده یا امتیاز موتور منفی شده'; chg = 'خروج کامل با بسته‌شدن زیر ' + fa(pos.stop || p.stop); }
      else { a = 'hold'; why = m.act || 'روند معتبر است و حد ضرر فعال نشده'; chg = 'کاهش در هدف ۱، خروج زیر حد ضرر'; }
      return { k: a, fa: ACT9[a], why: why, chg: chg, st: 'pos' }; }
    switch (p.st) {
      case 'bear': a = 'none'; why = p.why + '. اگر دارید: فروش در ' + fa(x.S.bear.exitLo) + '–' + fa(x.S.bear.exitHi); chg = 'بسته‌شدن بالای ' + fa(x.S.bear.invalid) + ' دید نزولی را باطل می‌کند'; break;
      case 'nc': case 'near': a = 'waitBrk'; why = p.why; chg = 'بسته‌شدن بالای ' + fa(p.level) + ' ← بررسی ورود'; lv = { entry: [x.S.bull.lo, x.S.bull.hi], stop: x.S.bull.stop, tp: x.S.bull.tp, rr: x.S.bull.rr2 }; break;
      case 'active': lv = { entry: p.entry, stop: p.stop, tp: p.tp, rr: p.rrNow };
        if (!(p.rrNow >= minRR)) { a = 'badRR'; why = p.why + '؛ بازده به ریسک از قیمت فعلی ' + fa(p.rrNow, 1) + ' < ' + fa(minRR, 1); chg = 'پولبک به ' + fa(p.entry[0]) + ' نسبت را بهتر می‌کند'; }
        else { a = x.last <= p.entry[1] ? 'now' : 'zone'; why = p.why; chg = 'بسته‌شدن زیر ' + fa(p.stop) + ' = ابطال'; } break;
      case 'retest': lv = { entry: p.entry, stop: p.stop, tp: p.tp, rr: p.rrNow }; a = p.weak ? 'waitPb' : 'zone'; why = p.why; chg = p.weak ? 'بسته‌شدن دوباره بالای ' + fa(p.level) + ' ← ورود؛ زیر ' + fa(p.stop) + ' ← ابطال' : 'زیر ' + fa(p.stop) + ' ← ابطال'; break;
      case 'missed': lv = { entry: p.entry, stop: p.stop, tp: p.tp, rr: p.rrNow }; a = p.rrNow >= minRR * 1.5 ? 'zone' : 'missed'; why = p.why + (a === 'missed' ? '. ورود در قیمت فعلی توصیه نمی‌شود، حتی با روند صعودی.' : '؛ با وجود فاصله، بازده به ریسک هنوز کافی است — فقط در پولبک به محدوده'); chg = 'پولبک به ' + fa(p.entry[0]) + '–' + fa(p.entry[1]) + ' بدون شکستن ' + fa(p.stop); break;
      case 'target': a = 'none'; why = p.why + '؛ بخش اصلی حرکت گذشته است'; chg = 'تنظیم تازه (اصلاح و شکست جدید)'; break;
      case 'invalid': a = 'none'; why = p.why; chg = 'شکل‌گیری تنظیم جدید'; break;
      default: a = 'wait'; why = p.why || ''; chg = '—';
    }
    var G = x.gate; if ((a === 'now' || a === 'zone') && G && G.code !== 'ok') { var f1 = G.chk.filter(function (c) { return !c.ok; })[0]; why = 'شرط قیمتی ورود برقرار است (' + ACT9[a] + ')، اما دروازهٔ اعتبار ' + G.fa + ': «' + G.status + '»' + (f1 ? ' — ' + f1.t : '') + '. تا عبور از دروازه فقط پیگیری کنید. ' + why; a = 'wait'; chg = 'عبور از دروازهٔ اعتبار (' + G.status + ') + ' + chg; }
    return { k: a, fa: ACT9[a], why: why, chg: chg, lv: lv, st: p.st };
  }

  /* ---------------- per-horizon signals and the validation gate (no signal is "confirmed" without passing all eight checks) ---------------- */
  var GST = { ok: 'معتبر — سیگنال تأییدشده', nodata: 'داده ناکافی', nobt: 'بک‌تست نامعتبر', review: 'استراتژی نیازمند بازنگری', nocond: 'سیگنال فاقد تأیید کافی', down: 'دید نزولی (استراتژی فروش آزموده نشده)' };
  function valIdOf(db, cls, h, k) { var y = db && db.at ? new Date(db.at).getFullYear() : ''; return db ? 'VAL-' + y + '-' + ('0000' + (db.ver || 0)).slice(-5) + '-' + cls + '-' + h + '-' + k : null; }
  function liveBy() { var o = {}, R = Hub.util && Hub.util.store ? Hub.util.store.get(DKEY, null) : null; (R && R.sig || []).forEach(function (s) { if (ACTIVE[s.st] || !s.strat) return; var k = s.cls + '|' + (s.h || 'm') + '|' + s.strat, g = o[k] = o[k] || { n: 0, stop: 0, ok: 0 }; g.n++; if (s.st === 'stopped') g.stop++; if (s.dirOK) g.ok++; }); return o; }
  function hzSignals(x, z, E, db, live) {
    var X = z.R.X, I = z.R.I, t = X.n - 1, cl = X.c[t], atr = I.atr[t], minRR = Number(E.acct.minRR) || 1.5, th = Object.assign({}, VTH, E.val && E.val.th), rg = z.R.RG[t], out = {};
    ['s', 'm', 'l'].forEach(function (h) {
      var H = HZN[h], need = HIST[h].min, view, lv, chk = [], add = function (c, ok, txt) { chk.push({ c: c, ok: ok, t: txt }); return ok; };
      if (h === 's') view = cl > I.s20[t] && I.s20[t] > I.s20[t - 5] ? 'up' : cl < I.s20[t] && I.s20[t] < I.s20[t - 5] ? 'down' : 'flat';
      else if (h === 'm') view = cl > I.s50[t] && I.s50[t] > I.s200[t] ? 'up' : cl < I.s50[t] && I.s50[t] < I.s200[t] ? 'down' : 'flat';
      else view = X.n < 270 ? 'none' : cl > I.s200[t] && I.s200[t] > I.s200[t - 20] && cl > X.c[t - 250] ? 'up' : cl < I.s200[t] && I.s200[t] < I.s200[t - 20] ? 'down' : 'flat';
      // levels for this horizon, from today's price
      if (h === 'l') { var st = Math.min(loN(X.l, t, 120), I.s200[t]) - 0.5 * atr, R = cl - st, h250 = X.n > 250 ? hiN(X.h, t, 250) : NaN; lv = { entry: [cl - 0.5 * atr, cl], stop: st, tp: [isF(h250) && h250 > cl + R ? h250 : cl + 2 * R, cl + 3 * R, cl + 5 * R], src: 'حد ضرر زیر کف ۱۲۰ روزه / میانگین ۲۰۰؛ هدف ۱ سقف ۵۲ هفته اگر بالاتر از ۱R است، بقیه ۳ و ۵ برابر ریسک' }; var zt = zoneTop(z, E, lv.stop, lv.tp[1], cl + 0.3 * atr); if (zt > lv.stop + 0.25 * atr) { lv.entry[1] = zt; if (zt < lv.entry[0]) lv.entry[0] = Math.max(lv.stop + 0.25 * atr, zt - 0.3 * atr); } else lv.entry[1] = cl + 0.3 * atr; }
      else { var p = x.path; lv = p && (p.st === 'active' || p.st === 'retest' || p.st === 'missed') ? { entry: p.entry, stop: p.stop, tp: p.tp, src: 'برنامهٔ روز تأیید (' + p.date + ')' } : { entry: [x.S.bull.lo, x.S.bull.hi], stop: x.S.bull.stop, tp: x.S.bull.tp, src: 'برنامهٔ ساختاری امروز' }; }
      var rrNow = cl > lv.stop ? (lv.tp[1] - cl) / (cl - lv.stop) : NaN;
      var key = x.cls + '|' + h, sr = db && db.strat ? db.strat[key] : null, k = sr && sr.sel, row = k ? sr.rows[k] : null;
      // 1 data
      var d1 = add('data', !x.c.sample && !(isF(x.c.age) && x.c.age > 96) && X.n >= need, x.c.sample ? 'دادهٔ نمونه' : isF(x.c.age) && x.c.age > 96 ? 'داده ' + fa(x.c.age / 24, 0) + ' روز قدیمی' : X.n < need ? 'تاریخچه ' + fa(X.n, 0) + ' جلسه؛ این افق دست‌کم ' + fa(need, 0) + ' جلسه می‌خواهد (هدف دریافت: ' + fa(HIST.max, 0) + ')' : 'تازه و کافی (' + fa(X.n, 0) + ' جلسه، منبع ' + (x.c.src || (x.cls === 'gold' || x.cls === 'fx' ? 'TGJU' : 'TSETMC')) + ')');
      // 2 strategy for this market × horizon
      var d2 = add('strat', !!k, k ? '«' + STRFA[k] + '» برای ' + (MKFA[x.cls] || x.cls) + ' / ' + H.fa : sr ? sr.why : 'اعتبارسنجی اجرا نشده یا این بازار در آن نبوده');
      // 3 back-test valid and current
      var age = db ? (Date.now() - db.at) / 864e5 : NaN, lag = db && isF(d2days(db.asOf)) && isF(d2days(X.d[t])) ? d2days(X.d[t]) - d2days(db.asOf) : NaN;
      var d3 = add('bt', !!(db && !db.sample && db.sig === valSig(E) && row && row.ok && !(age > 2 * th.maxAge) && !(lag > 2 * th.maxAge)), !db ? 'اعتبارسنجی اجرا نشده' : db.sample ? 'روی دادهٔ نمونه' : db.sig !== valSig(E) ? 'تنظیمات پس از آخرین اعتبارسنجی تغییر کرده' : age > 2 * th.maxAge ? 'اعتبارسنجی قدیمی (' + fa(age, 0) + ' روز پیش اجرا شده)' : lag > 2 * th.maxAge ? 'داده ' + fa(lag, 0) + ' روز جلوتر از آخرین اعتبارسنجی است' : row ? (row.ok ? 'آخرین اعتبارسنجی: نسخهٔ ' + fa(db.ver, 0) + '؛ ' + row.why : row.why) : 'استراتژی منتخب ندارد');
      // 4 still reliable now: recent block, live record, current regime
      var lb = row ? live[x.cls + '|' + h + '|' + k] : null, rgv = row && row.byRg && row.byRg[rg], bad = [];
      if (row && row.decay) bad.push('بلوک زمانی آخر ضعیف‌تر از نصف میانگین'); if (lb && lb.n >= 8 && lb.stop / lb.n > 0.6) bad.push('در اجرای ثبت‌شده ' + fa(lb.stop, 0) + ' از ' + fa(lb.n, 0) + ' سیگنال به حد ضرر خورده'); if (rgv && rgv[0] >= 10 && rgv[2] <= 0) bad.push('در رژیم فعلی (' + (REG[rg] || rg) + ') میانگین ' + fa(rgv[2], 2) + 'R');
      var d4 = add('recent', !!row && !bad.length, !row ? '—' : bad.length ? bad.join('؛ ') : 'بلوک آخر و رژیم فعلی (' + (REG[rg] || rg) + ') قابل قبول' + (lb ? '؛ اجرای ثبت‌شده ' + fa(lb.n, 0) + ' سیگنال' : ''));
      // 5 today's market matches the strategy's entry rule
      var fired = null; if (k && k !== 'ens' && STRATS[k]) { for (var q = t; q >= Math.max(201, t - H.win + 1); q--) if (STRATS[k].f(X, I, q, STRATS[k].p[0])) { fired = shamsi(X.d[q]); break; } }
      else if (k === 'ens') fired = (x.c.type === 'long' || (x.c.candidate && x.c.candidate.type === 'long')) && x.c.horizon && x.c.horizon.k === h ? 'سیگنال امروز موتور' : null;
      var d5 = add('cond', !!fired, fired ? 'شرط ورود «' + STRFA[k] + '» برقرار شد: ' + fired : k ? 'شرط ورود «' + STRFA[k] + '» در ' + fa(H.win, 0) + ' جلسهٔ اخیر برقرار نشده' : '—');
      // 6 not a repeat of an expired / invalidated call
      var reg = (Hub.util && Hub.util.store ? (Hub.util.store.get(DKEY, null) || {}).sig || [] : []).filter(function (s) { return s.key === x.key && (s.h || 'm') === h; }).slice(-1)[0], dup = reg && /^(invalid|expired|stopped)$/.test(reg.st) && reg.closedAt && reg.d0 >= X.d[Math.max(0, t - H.win)];
      add('dup', !dup, dup ? 'همین تنظیم اخیراً ' + (ST8[reg.st] || reg.st) + ' (' + reg.closedAt + ')' : reg && ACTIVE[reg.st] ? 'قبلاً صادر شده: ' + reg.sid + ' (' + (ST8[reg.st] || reg.st) + ')' : 'تکراری نیست');
      // 7 levels and reward / risk from today's price
      add('rr', rrNow >= minRR, 'ورود ' + fa(lv.entry[0]) + '–' + fa(lv.entry[1]) + '، حد ضرر ' + fa(lv.stop) + '، اهداف ' + lv.tp.map(function (v) { return fa(v); }).join(' / ') + '؛ بازده به ریسک از قیمت فعلی ' + fa(rrNow, 1));
      // 8 execution and market-specific risk
      var lock = limitOf(z.a, E.acct).lim && X.h[t] === X.l[t] && cl > X.c[t - 1], exb = []; if (lock) exb.push('صف خرید (قفل سقف دامنه)'); if ((x.cls === 'stock' || x.cls === 'fund') && !x.c.liqOK) exb.push('نقدشوندگی کم'); if (rg === 'crisis') exb.push('رژیم بحرانی');
      add('exec', !exb.length, exb.length ? exb.join('؛ ') : 'محدودیت اجرایی دیده نشد');
      var fail = chk.filter(function (c) { return !c.ok; }), code = view !== 'up' ? (view === 'down' ? 'down' : !d1 ? 'nodata' : 'nocond') : !d1 ? 'nodata' : !d2 || !d3 ? 'nobt' : !d4 ? 'review' : fail.length ? 'nocond' : 'ok';
      out[h] = { h: h, fa: H.fa, view: view, k: k, kfa: k ? STRFA[k] : null, row: row, fired: fired, chk: chk, code: code, status: GST[code], lv: lv, rrNow: rrNow, valId: k ? valIdOf(db, x.cls, h, k) : null, sigId: 'SIG-' + x.sym + '-' + X.d[t] + '-' + h, why: sr ? sr.why : '', data: sr ? sr.data : '' };
    });
    return out;
  }

  /* direction per horizon, one rule set for every view (same rules as the validation gate):
     short: close vs MA20 and MA20 rising over 5 sessions; medium: close > MA50 > MA200 (or the reverse);
     long: close vs MA200, MA200 rising over 20 sessions and above the close of 250 sessions ago (needs ≥ 270 sessions) */
  function trendView(X, I, t, h) {
    var cl = X.c[t];
    if (h === 's') return cl > I.s20[t] && I.s20[t] > I.s20[t - 5] ? 'up' : cl < I.s20[t] && I.s20[t] < I.s20[t - 5] ? 'down' : 'flat';
    if (h === 'm') return cl > I.s50[t] && I.s50[t] > I.s200[t] ? 'up' : cl < I.s50[t] && I.s50[t] < I.s200[t] ? 'down' : 'flat';
    return X.n < 270 ? 'none' : cl > I.s200[t] && I.s200[t] > I.s200[t - 20] && cl > X.c[t - 250] ? 'up' : cl < I.s200[t] && I.s200[t] < I.s200[t - 20] ? 'down' : 'flat';
  }
  /* trendEv (2026-11-21): the trend label with its evidence and its current sub-state, so no page shows a bare «صعودی» while the price
     has been falling for days. The label keeps its rule (above); the sub-state is a separate, stated description of the last sessions:
       pullback — label up, and the close is below its 10-session average or the last 3 closes fell (n sessions, % off the 20-session high)
       bounce   — label down, and the close is above its 10-session average or the last 3 closes rose
     Both are descriptions of the series, not forecasts (the index direction model has no proven skill — see «پیش‌بینی شاخص کل»). */
  function trendEv(X, I, t, h) {
    var v = trendView(X, I, t, h), c = X.c, cl = c[t], f = function (x) { return fa(x, Math.abs(x) < 100 ? 2 : 0); }, pc = function (x) { return (x >= 0 ? '+' : '−') + fa(Math.abs(x) * 100, 1) + '٪'; };
    var s10 = 0, k10 = 0; for (var i = Math.max(0, t - 9); i <= t; i++) { s10 += c[i]; k10++; } s10 /= k10;
    var dn = 0, up = 0; for (var j = t; j > 0 && c[j] < c[j - 1]; j--) dn++; for (var j2 = t; j2 > 0 && c[j2] > c[j2 - 1]; j2--) up++;
    var hi20 = maxC(c, t - 19, t), lo20 = minC(c, t - 19, t), sub = null, subTxt = '';
    // the counter-move test is scaled to the horizon: short = below SMA10 or 3+ down closes; medium = below SMA20; long = below SMA50
    var ref = h === 's' ? s10 : h === 'm' ? I.s20[t] : I.s50[t], refN = h === 's' ? '۱۰' : h === 'm' ? '۲۰' : '۵۰', ok = isFinite(ref);
    if (v === 'up' && ok && (cl < ref || (h === 's' && dn >= 3))) { sub = 'pullback'; subTxt = 'در اصلاح: ' + fa(dn, 0) + ' جلسهٔ پیاپی منفی، ' + pc(cl / hi20 - 1) + ' از سقف ۲۰ جلسه' + (cl < ref ? '، زیر میانگین ' + refN + ' روزه (' + f(ref) + ')' : ''); }
    else if (v === 'down' && ok && (cl > ref || (h === 's' && up >= 3))) { sub = 'bounce'; subTxt = 'در برگشت: ' + fa(up, 0) + ' جلسهٔ پیاپی مثبت، ' + pc(cl / lo20 - 1) + ' از کف ۲۰ جلسه' + (cl > ref ? '، بالای میانگین ' + refN + ' روزه (' + f(ref) + ')' : ''); }
    var ev = h === 's' ? 'پایانی ' + f(cl) + (cl > I.s20[t] ? ' بالای' : ' زیر') + ' میانگین ۲۰ روزه ' + f(I.s20[t]) + '؛ شیب ۵ جلسهٔ آن ' + pc(I.s20[t] / I.s20[t - 5] - 1)
      : h === 'm' ? 'پایانی ' + (cl > I.s50[t] ? 'بالای' : 'زیر') + ' میانگین ۵۰ روزه ' + f(I.s50[t]) + '؛ میانگین ۵۰ ' + (I.s50[t] > I.s200[t] ? 'بالای' : 'زیر') + ' میانگین ۲۰۰ (' + f(I.s200[t]) + ')'
      : X.n < 270 ? 'تاریخچه کمتر از ۲۷۰ جلسه' : 'پایانی ' + (cl > I.s200[t] ? 'بالای' : 'زیر') + ' میانگین ۲۰۰ روزه؛ شیب ۲۰ جلسهٔ آن ' + pc(I.s200[t] / I.s200[t - 20] - 1) + '؛ نسبت به ۲۵۰ جلسه پیش ' + pc(cl / c[t - 250] - 1);
    var RULE = { s: 'قاعده: صعودی = پایانی بالای میانگین ۲۰ روزه و میانگین در ۵ جلسه بالا رفته؛ نزولی = عکس آن؛ وگرنه خنثی', m: 'قاعده: صعودی = پایانی بالای میانگین ۵۰ و میانگین ۵۰ بالای ۲۰۰؛ نزولی = عکس؛ وگرنه خنثی', l: 'قاعده: صعودی = بالای میانگین ۲۰۰ روزهٔ رو به بالا و بالاتر از ۲۵۰ جلسه پیش؛ نزولی = زیر میانگین ۲۰۰ رو به پایین؛ وگرنه خنثی' };
    var LB = { up: 'صعودی', down: 'نزولی', flat: 'خنثی', none: 'دادهٔ کم' };
    return { v: v, sub: sub, fa: LB[v] + (sub === 'pullback' ? ' (در اصلاح)' : sub === 'bounce' ? ' (در برگشت)' : ''), subTxt: subTxt, ev: ev, rule: RULE[h] };
  }
  function maxC(c, a, b) { var m = -Infinity; for (var i = Math.max(0, a); i <= b; i++) if (c[i] > m) m = c[i]; return m; }
  function minC(c, a, b) { var m = Infinity; for (var i = Math.max(0, a); i <= b; i++) if (c[i] < m) m = c[i]; return m; }
  /* ---------------- turning points (directive 9): probable bottom zone in a downtrend, probable top zone in an uptrend ----------------
     Zones are ranges, never a single price. Their width comes from the empirical distribution of how far price travelled within the
     next TZH sessions in the same trend state, measured in ATR, estimated on the first 70% of each history (in-sample) and scored on
     the last 30% (out-of-sample). Every probability shown names its event, horizon, method and sample size.
     Reaching a zone is never a signal by itself: a reversal needs a close beyond the confirmation level. */
  var TZH = 20, TZK = 3, TZSTEP = 3;
  function tzPivots(X, k) { var P = [], n = X.n; for (var i = k; i < n - k; i++) { var hi = true, lo = true; for (var j = i - k; j <= i + k; j++) { if (j === i) continue; if (X.h[j] > X.h[i]) hi = false; if (X.l[j] < X.l[i]) lo = false; } if (hi) P.push({ i: i, k: 'H', p: X.h[i] }); if (lo) P.push({ i: i, k: 'L', p: X.l[i] }); } return P; }
  function tzState(X, I, t) { var s = trendView(X, I, t, 's'), m = trendView(X, I, t, 'm'), l = trendView(X, I, t, 'l');
    var side = s === 'down' || (m === 'down' && s !== 'up') ? 'down' : s === 'up' || (m === 'up' && s !== 'down') ? 'up' : 'flat';
    // a short-term move against the larger trend is a correction, not a new trend
    var big = m === 'up' || (m !== 'down' && l === 'up') ? 'up' : m === 'down' || (m !== 'up' && l === 'down') ? 'down' : 'flat';
    return { side: side, s: s, m: m, l: l, big: big, corr: side !== 'flat' && big !== 'flat' && big !== side }; }
  // supports (below) and resistances (above) from confirmed swing points of the last 250 sessions, merged within half an ATR
  function tzLevels(P, t, px, a, k) { var lo = [], hi = [];
    P.forEach(function (q) { if (q.i + k > t || q.i < t - 250) return; if (q.k === 'L' && q.p < px * 0.997) lo.push(q); if (q.k === 'H' && q.p > px * 1.003) hi.push(q); });
    var merge = function (arr, desc) { arr.sort(function (u, v) { return desc ? v.p - u.p : u.p - v.p; }); var out = []; arr.forEach(function (q) { var last = out[out.length - 1]; if (last && Math.abs(q.p - last.p) < 0.5 * a) { last.n++; last.recent = Math.max(last.recent, q.i); } else out.push({ p: q.p, n: 1, recent: q.i }); }); return out; };
    return { sup: merge(lo, true), res: merge(hi, false) }; }
  function qtl(a, q) { if (!a.length) return NaN; var s = a.slice().sort(function (u, v) { return u - v; }), p = (s.length - 1) * q, i = Math.floor(p); return s[i] + (s[Math.min(i + 1, s.length - 1)] - s[i]) * (p - i); }
  /* walk one history: every TZSTEP sessions in a trend state, record how far price went within TZH sessions (in ATR), whether the first
     level was reached, and what a reversal trade (close beyond the 10-session extreme after touching the far side) would have returned */
  function tzCases(X, I, P, Pm) {
    var out = [], n = X.n, c = X.c, h = X.h, l = X.l, LM = Pm ? ptLastMajor(Pm, n, PTK) : null;
    for (var t = 210; t < n - TZH - 1; t += TZSTEP) {
      var a = I.atr[t]; if (!(a > 0)) continue; var st = tzState(X, I, t); if (st.side === 'flat') continue;
      var Lv = tzLevels(P, t, c[t], a, TZK), dn = st.side === 'down', ext = dn ? Infinity : -Infinity, at = t;
      for (var u = t + 1; u <= t + TZH; u++) { if (dn ? l[u] < ext : h[u] > ext) { ext = dn ? l[u] : h[u]; at = u; } }
      var mv = dn ? (c[t] - ext) / a : (ext - c[t]) / a, L1 = dn ? Lv.sup[0] : Lv.res[0];
      // reversal after the extreme: confirmation = close beyond the extreme close of the prior 10 sessions; false if the extreme is broken within 10 sessions after
      var conf = -1; for (u = at + 1; u <= Math.min(n - 1, at + TZH); u++) { var ref = dn ? maxC(c, u - 10, u - 1) : minC(c, u - 10, u - 1); if (dn ? c[u] > ref : c[u] < ref) { conf = u; break; } }
      var fake = null, R = NaN;
      if (conf > 0) { fake = false; var stop = dn ? ext - 0.5 * a : ext + 0.5 * a, risk = Math.abs(c[conf] - stop), tgt = dn ? c[conf] + 2 * risk : c[conf] - 2 * risk;
        for (u = conf + 1; u <= Math.min(n - 1, conf + TZH); u++) { if (dn ? l[u] <= stop : h[u] >= stop) { fake = true; R = -1; break; } if (dn ? h[u] >= tgt : l[u] <= tgt) { R = 2; break; } }
        if (!isF(R)) { var e = c[Math.min(n - 1, conf + TZH)]; R = risk > 0 ? (dn ? e - c[conf] : c[conf] - e) / risk : NaN; } }
      var cs = { t: t, f: t / n, side: st.side, big: st.big, corr: st.corr, mv: mv, bars: at - t, l1: L1 ? (dn ? ext <= L1.p : ext >= L1.p) : null, l1d: L1 ? Math.abs(c[t] - L1.p) / a : NaN, conf: conf > 0, fake: fake, R: R, rg: st.l };
      ptCase(cs, X, I, t, a, dn, st, LM); out.push(cs);
    }
    return out;
  }
  /* ---------------- price & time (directive 10) ----------------
     Every price target gets a time window. Windows, scenario frequencies and the time-correction read are all measured on the same
     histories as the turning-point zones: estimated on the first 70% of each history, scored on the last 30%. Daily data only:
     timing is in trading sessions (converted to calendar dates with the market calendar); there is no intraday source, so 1h/4h are not analysed. */
  // calibration pools: coins, bullion (18k, 24k, mesghal) and the world ounce behave differently, so each is measured on its own
  function poolKey(x) { return x.cls === 'gold' ? (/سکه/.test(x.sym) ? 'coin' : /انس/.test(x.sym) ? 'ounce' : 'gold') : x.cls; }
  var POOLFA = { coin: 'سکه', gold: 'طلا (۱۸، ۲۴ عیار و مثقال)', ounce: 'انس جهانی' };
  var PTW = 60, PTK = 10, FAV = [1, 2, 3, 5, 8], ADV = [1, 2, 3], PTX = 40;
  function ptLastMajor(Pm, n, k) { var L = new Int32Array(n), H = new Int32Array(n), lL = -1, lH = -1, j = 0;
    for (var t = 0; t < n; t++) { while (j < Pm.length && Pm[j].i + k <= t) { if (Pm[j].k === 'L') lL = Pm[j].i; else lH = Pm[j].i; j++; } L[t] = lL; H[t] = lH; } return { L: L, H: H }; }
  // where the market stands after its last extreme in the direction of the larger trend: still trending, correcting in price, in time, or both
  function tcState(X, I, t, a, b) {
    var h = X.h, l = X.l, c = X.c, up = b !== 'down', i0 = t, k, ext = up ? -Infinity : Infinity;
    for (k = Math.max(0, t - 30); k <= t; k++) if (up ? h[k] >= ext : l[k] <= ext) { ext = up ? h[k] : l[k]; i0 = k; }
    var far = up ? Infinity : -Infinity; for (k = Math.max(0, i0 - 40); k <= i0; k++) far = up ? Math.min(far, l[k]) : Math.max(far, h[k]);
    var leg = Math.abs(ext - far), retr = leg > 0 ? (up ? ext - c[t] : c[t] - ext) / leg : 0, dur = t - i0, lo = Infinity, hi = -Infinity;
    for (k = i0; k <= t; k++) { lo = Math.min(lo, l[k]); hi = Math.max(hi, h[k]); }
    var R = I.rsi, pk = up ? -Infinity : Infinity; for (k = Math.max(0, i0 - 3); k <= Math.min(t, i0 + 3); k++) if (isF(R[k])) pk = up ? Math.max(pk, R[k]) : Math.min(pk, R[k]);
    var type = dur < 3 ? 'trend' : retr >= 0.382 ? 'price' : retr < 0.236 && dur >= 5 ? 'time' : 'mixed';
    return { type: type, up: up, ext: ext, i0: i0, dur: dur, retr: retr, lo: lo, hi: hi, rngA: (hi - lo) / a, rsiChg: isF(pk) && isF(R[t]) ? R[t] - pk : NaN }; }
  function ptCase(cs, X, I, t, a, dn, st, LM) {
    var n = X.n, c0 = X.c[t], W = Math.min(PTW, n - 1 - t), tf = [0, 0, 0, 0, 0], ta = [0, 0, 0], th = [0, 0, 0], i, u;
    for (u = 1; u <= W; u++) { var fav = (dn ? c0 - X.l[t + u] : X.h[t + u] - c0) / a, adv = (dn ? X.h[t + u] - c0 : c0 - X.l[t + u]) / a;
      for (i = 0; i < 5; i++) if (!tf[i] && fav >= FAV[i]) tf[i] = u; for (i = 0; i < 3; i++) { if (!ta[i] && adv >= ADV[i]) ta[i] = u; if (!th[i] && adv >= ADV[i] / 2) th[i] = u; } }
    cs.full = W === PTW; cs.tf = tf; cs.ta = ta; cs.th = th; cs.rev2 = !!(ta[1] && (!tf[1] || ta[1] < tf[1]));
    if (LM) { var lp = dn ? LM.H[t] : LM.L[t]; cs.age = lp >= 0 ? t - lp : NaN; }
    var b = st.big !== 'flat' ? st.big : st.side, tc = tcState(X, I, t, a, b); cs.tc = tc.type; cs.tcUp = tc.up;
    if (tc.type === 'time') { cs.tcOut = null; for (u = t + 1; u <= Math.min(n - 1, t + PTX); u++) { if (X.c[u] > tc.hi) { cs.tcOut = tc.up ? 'with' : 'against'; cs.tcBars = u - t; break; } if (X.c[u] < tc.lo) { cs.tcOut = tc.up ? 'against' : 'with'; cs.tcBars = u - t; break; } } }
  }
  // judged at the end of the predicted window W: 4 invalidation first · 3 a pullback beyond half the invalidation distance came first (deeper correction) · 1 target first with a shallow pullback · 2 none of these by W (time delay)
  function scen(q, i, j, W) { var w = W || PTW, A = q.ta[j] && q.ta[j] <= w ? q.ta[j] : 0, D = q.th[j] && q.th[j] <= w ? q.th[j] : 0, T = q.tf[i] && q.tf[i] <= w ? q.tf[i] : 0;
    return A && (!T || A < T) ? 4 : D && (!T || D < T) ? 3 : T ? 1 : 2; }
  function reach(q, i, j) { return !!(q.tf[i] && (!q.ta[j] || q.tf[i] < q.ta[j])); }
  function ptCalib(IS, OS) {
    var fi = IS.filter(function (q) { return q.full; }), fo = OS.filter(function (q) { return q.full; }), fp = [];
    FAV.forEach(function (dT, i) { fp[i] = ADV.map(function (dI, j) {
      var bI = fi.filter(function (q) { return reach(q, i, j); }).map(function (q) { return q.tf[i]; }), q25 = qtl(bI, 0.25), q50 = qtl(bI, 0.5), q75 = qtl(bI, 0.75);
      var Wq = Math.ceil(q75) || PTW, cnt = [0, 0, 0, 0, 0], nR = 0, inW = 0, early = 0, late = 0, err = []; fo.forEach(function (q) { cnt[scen(q, i, j, Wq)]++; if (reach(q, i, j)) { nR++; var b = q.tf[i]; if (b >= q25 && b <= q75) inW++; else if (b < q25) early++; else late++; err.push(Math.abs(b - q50)); } });
      var cI = [0, 0, 0, 0, 0]; fi.forEach(function (q) { cI[scen(q, i, j, Wq)]++; });
      return { nIS: fi.length, nOS: fo.length, q25: q25, q50: q50, q75: q75, W: Wq, pIS: cI.map(function (v) { return fi.length ? v / fi.length : NaN; }), pOS: cnt.map(function (v) { return fo.length ? v / fo.length : NaN; }),
        reachOS: fo.length ? nR / fo.length : NaN, inW: nR ? inW / nR : NaN, early: nR ? early / nR : NaN, late: nR ? late / nR : NaN, mae: qtl(err, 0.5), byW: fo.length ? fo.filter(function (q) { return reach(q, i, j) && q.tf[i] <= q75; }).length / fo.length : NaN }; }); });
    var bI2 = IS.map(function (q) { return q.bars; }), b25 = qtl(bI2, 0.25), b75 = qtl(bI2, 0.75);
    var tcI = IS.filter(function (q) { return q.tc === 'time' && q.tcOut; }), tcO = OS.filter(function (q) { return q.tc === 'time' && q.tcOut; });
    var pw = function (A) { return A.length ? A.filter(function (q) { return q.tcOut === 'with'; }).length / A.length : NaN; };
    var ages = IS.map(function (q) { return q.age; }).filter(isF), a75 = qtl(ages, 0.75), a90 = qtl(ages, 0.9), oA = OS.filter(function (q) { return isF(q.age); });
    var rv = function (A) { return A.length ? A.filter(function (q) { return q.rev2; }).length / A.length : NaN; }, old = oA.filter(function (q) { return q.age > a75; });
    var tcN = { trend: 0, price: 0, time: 0, mixed: 0 }; OS.forEach(function (q) { if (tcN[q.tc] != null) tcN[q.tc]++; });
    return { fp: fp, bQ: [b25, b75], bCov: OS.length ? OS.filter(function (q) { return q.bars >= b25 && q.bars <= b75; }).length / OS.length : NaN,
      tc: { pIS: pw(tcI), nIS: tcI.length, pOS: pw(tcO), nOS: tcO.length, bars: qtl(tcI.map(function (q) { return q.tcBars; }), 0.5), barsQ: [qtl(tcI.map(function (q) { return q.tcBars; }), 0.25), qtl(tcI.map(function (q) { return q.tcBars; }), 0.75)], share: tcN },
      age: { all: ages, a75: a75, a90: a90, revAll: rv(oA), revOld: rv(old), nOld: old.length, nAll: oA.length } };
  }
  var nearI = function (arr, v) { var b = 0; arr.forEach(function (x, i) { if (Math.abs(x - v) < Math.abs(arr[b] - v)) b = i; }); return b; };
  function sessWin(cls, X, a0, b0) { var t = X.n - 1, n = Math.max(1, Math.ceil(b0)); try { var L = Hub.mktCal.nextSessions(cls === 'fund' || cls === 'option' ? 'stock' : cls, X.d[t], n, X.d); var s = L[Math.max(0, Math.ceil(a0) - 1)], e = L[L.length - 1]; return { a: Math.ceil(a0), b: n, from: s, to: e, fromFa: Hub.mktCal.faDate(s), toFa: Hub.mktCal.faDate(e) }; } catch (er) { return { a: Math.ceil(a0), b: n }; } }
  // weekly bars from daily (Iranian week, Saturday start); used for the weekly trend and weekly divergences
  function toWeekly(X) { var J = Hub.jalali, W = { d: [], o: [], h: [], l: [], c: [], v: [] }, key = null;
    for (var i = 0; i < X.n; i++) { var g = String(X.d[i]), jd = J.g2d(+g.slice(0, 4), +g.slice(4, 6), +g.slice(6, 8)), k = jd - J.dow(jd);
      if (k !== key) { key = k; W.d.push(X.d[i]); W.o.push(X.o[i]); W.h.push(X.h[i]); W.l.push(X.l[i]); W.c.push(X.c[i]); W.v.push(X.v[i] || 0); }
      else { var m = W.c.length - 1; W.h[m] = Math.max(W.h[m], X.h[i]); W.l[m] = Math.min(W.l[m], X.l[i]); W.c[m] = X.c[i]; W.d[m] = X.d[i]; W.v[m] += X.v[i] || 0; } }
    W.n = W.c.length; return W; }
  function rsiW(c, p) { var r = new Array(c.length).fill(NaN), g = 0, s = 0; for (var i = 1; i < c.length; i++) { var d = c[i] - c[i - 1], up = Math.max(d, 0), dn = Math.max(-d, 0);
    if (i <= p) { g += up / p; s += dn / p; if (i === p) r[i] = s ? 100 - 100 / (1 + g / s) : 100; } else { g = (g * (p - 1) + up) / p; s = (s * (p - 1) + dn) / p; r[i] = s ? 100 - 100 / (1 + g / s) : 100; } } return r; }
  /* algorithmic divergences on the last two confirmed swing points (k bars each side) within `look` bars: regular and hidden, on an oscillator */
  function divs(S, osc, k, look, nm, P, prov) { var out = [], n = S.c.length, t = n - 1;
    ['H', 'L'].forEach(function (kd) { var pv = P.filter(function (q) { return q.k === kd && q.i + k <= t && q.i >= t - look && isF(osc[q.i]); });
      // a still-forming swing point at the right edge (highest high / lowest low of the last k+1 bars, beyond the last confirmed one) counts as provisional
      if (prov) { var bi = t; for (var u = t - k; u <= t; u++) if (kd === 'H' ? S.h[u] >= S.h[bi] : S.l[u] <= S.l[bi]) bi = u; var lastC = pv[pv.length - 1];
        if (isF(osc[bi]) && (!lastC || bi > lastC.i) && (!lastC || (kd === 'H' ? S.h[bi] > S.h[lastC.i] * 0.98 : S.l[bi] < S.l[lastC.i] * 1.02))) pv = pv.concat([{ i: bi, k: kd, p: kd === 'H' ? S.h[bi] : S.l[bi], prov: true }]); }
      if (pv.length < 2) return;
      // regular divergence: the latest swing point against the most extreme earlier one in the window (how peaks are joined on a chart);
      // hidden divergence: the latest against the one just before it
      var p2 = pv[pv.length - 1], prev = pv.slice(0, -1), ext = prev.reduce(function (b, q) { return (kd === 'H' ? q.p > b.p : q.p < b.p) ? q : b; }, prev[0]), last = prev[prev.length - 1];
      [[ext, 'reg'], [last, 'hid']].forEach(function (pr) { var p1 = pr[0], o1 = osc[p1.i], o2 = osc[p2.i], gap = p2.i - p1.i, ty = null;
      if (pr[1] === 'reg') { if (kd === 'H' && p2.p > p1.p && o2 < o1) ty = 'reg-bear'; if (kd === 'L' && p2.p < p1.p && o2 > o1) ty = 'reg-bull'; }
      else { if (kd === 'H' && p2.p < p1.p && o2 > o1) ty = 'hid-bear'; if (kd === 'L' && p2.p > p1.p && o2 < o1) ty = 'hid-bull'; }
      if (ty) out.push({ wk: /هفتگی/.test(nm), ty: ty, src: nm + (p2.prov ? ' (نقطهٔ دوم هنوز تثبیت نشده)' : ''), p1: p1.p, p2: p2.p, o1: o1, o2: o2, gap: gap, ago: t - p2.i, d1: S.d[p1.i], d2: S.d[p2.i] }); }); });
    return out; }
  var DVF = { 'reg-bear': 'واگرایی منفی معمولی (سقف بالاتر قیمت، سقف پایین‌تر نوسانگر)', 'hid-bear': 'واگرایی منفی مخفی (سقف پایین‌تر قیمت، سقف بالاتر نوسانگر؛ ادامهٔ نزول)', 'reg-bull': 'واگرایی مثبت معمولی (کف پایین‌تر قیمت، کف بالاتر نوسانگر)', 'hid-bull': 'واگرایی مثبت مخفی (کف بالاتر قیمت، کف پایین‌تر نوسانگر؛ ادامهٔ صعود)' };
  function ptAnalysis(X, I, z, Kc, cls, P) {
    if (!z || !z.zone || !Kc || !Kc[z.side] || !Kc[z.side].pt) return null;
    var K = Kc[z.side], Q = K.pt, t = X.n - 1, a = z.atr, px = z.px, dn = z.side === 'down', o = { side: z.side };
    // the trend-direction targets are invalidated by a confirmed reversal, so the adverse distance is the confirmation level
    var dI = Math.abs(z.conf - px) / a, j = nearI(ADV, dI);
    o.tg = z.T.slice(0, 2).map(function (T) { var dT = Math.abs(T.p - px) / a, i = nearI(FAV, dT), f = Q.fp[i][j]; if (!(f.nIS >= 30) || !isF(f.q25)) return { p: T.p, src: T.src, none: true };
      return { p: T.p, src: T.src, dT: dT, i: i, j: j, w: sessWin(cls, X, f.q25, f.q75), q50: f.q50, pReach: f.reachOS, pWin: f.byW, scen: f.pOS.slice(1), n: f.nOS, f: f }; });
    o.inv = z.conf; o.dI = dI;
    o.zoneW = isF(Q.bQ[0]) ? sessWin(cls, X, Math.max(1, Q.bQ[0]), Math.max(1, Q.bQ[1])) : null;
    var b = z.st.big !== 'flat' ? z.st.big : z.side, tc = tcState(X, I, t, a, b); o.tc = tc;
    o.tcFa = { trend: 'ادامهٔ روند (نزدیک آخرین ' + (tc.up ? 'سقف' : 'کف') + ')', price: 'اصلاح قیمتی (' + fa(tc.retr * 100, 0) + '٪ از آخرین موج برگشته)', time: 'اصلاح زمانی (نوسان در محدوده، برگشت فقط ' + fa(tc.retr * 100, 0) + '٪ موج)', mixed: 'اصلاح ترکیبی قیمتی و زمانی (برگشت ' + fa(tc.retr * 100, 0) + '٪ موج)' }[tc.type];
    if (tc.type === 'time' || tc.type === 'mixed') { o.tcRange = [tc.lo, tc.hi]; o.tcDur = tc.dur; var T0 = Q.tc; if (T0.nIS >= 20 && isF(T0.bars)) { o.tcWin = sessWin(cls, X, Math.max(1, T0.barsQ[0]), Math.max(1, T0.barsQ[1])); o.tcPWith = T0.pOS; o.tcN = T0.nOS; } }
    var ages = Q.age.all, ag = NaN; var Pm = tzPivots(X, PTK); for (var k = Pm.length - 1; k >= 0; k--) { if (Pm[k].i + PTK > t) continue; if (Pm[k].k === (dn ? 'H' : 'L')) { ag = t - Pm[k].i; break; } }
    o.age = ag; o.agePct = isF(ag) && ages.length ? ages.filter(function (v) { return v <= ag; }).length / ages.length : NaN; o.ageEdge = isF(Q.age.revOld) && isF(Q.age.revAll) && Q.age.nOld >= 30 ? Q.age.revOld - Q.age.revAll : NaN;
    o.exhaust = isF(o.agePct) && o.agePct > 0.9 && o.ageEdge >= 0.05;
    // divergences: daily RSI and MACD histogram, weekly RSI, price vs volume
    var D = divs(X, I.rsi, TZK, 60, 'RSI روزانه', P).concat(divs(X, I.macdH, TZK, 60, 'MACD روزانه', P));
    try { var Wk = toWeekly(X); if (Wk.n >= 40) { var Pw = tzPivots(Wk, 2), Rw = rsiW(Wk.c, 14); D = D.concat(divs(Wk, Rw, 2, 80, 'RSI هفتگی', Pw, true)); var s20 = 0, s40 = 0, nw = Wk.n; for (var q = nw - 40; q < nw; q++) { s40 += Wk.c[q] / 40; if (q >= nw - 20) s20 += Wk.c[q] / 20; } o.wk = { tr: Wk.c[nw - 1] > s20 && s20 > s40 ? 'up' : Wk.c[nw - 1] < s20 && s20 < s40 ? 'down' : 'flat', rsi: Rw[nw - 1], n: nw }; } } catch (e) { o.wk = null; }
    var vH = P.filter(function (q) { return q.k === (dn ? 'L' : 'H') && q.i + TZK <= t && q.i >= t - 60; }).slice(-2);
    if (vH.length === 2) { var va = function (i) { var s = 0; for (var u = Math.max(0, i - 2); u <= i + 2; u++) s += X.v[u] || 0; return s; }; if ((dn ? vH[1].p < vH[0].p : vH[1].p > vH[0].p) && va(vH[1].i) < 0.8 * va(vH[0].i)) D.push({ ty: dn ? 'vol-bull' : 'vol-bear', src: 'حجم', p1: vH[0].p, p2: vH[1].p, o1: va(vH[0].i), o2: va(vH[1].i), gap: vH[1].i - vH[0].i, ago: t - vH[1].i }); }
    var bigFa = z.st.big === 'up' ? 'روند بزرگ‌تر صعودی' : z.st.big === 'down' ? 'روند بزرگ‌تر نزولی' : 'روند';
    o.div = D.map(function (d) { var bear = d.ty.indexOf('bear') >= 0, hid = d.ty.indexOf('hid') === 0, vol = d.ty.indexOf('vol') === 0;
      d.fa = d.ty === 'vol-bear' ? 'سقف بالاتر قیمت با حجم کمتر' : d.ty === 'vol-bull' ? 'کف پایین‌تر قیمت با حجم کمتر' : DVF[d.ty];
      // regular divergence = the move it opposes is losing strength; hidden = the larger trend tends to resume; neither is a reversal on its own
      if (hid) d.weight = bear ? 'نشانهٔ ادامهٔ روند نزولی' : 'نشانهٔ ادامهٔ روند صعودی' + (z.st.big === 'up' && dn ? ' (پایان اصلاح جاری محتمل‌تر)' : '');
      else if (d.wk && o.wk && o.wk.tr !== 'flat') { var wUp = o.wk.tr === 'up', against = bear === wUp;
        d.weight = against ? 'کاهش قدرت روند ' + (wUp ? 'صعودی' : 'نزولی') + ' هفتگی' + (bear === dn ? '؛ با حرکت روزانهٔ جاری هم‌جهت است و احتمال ادامهٔ ' + (dn ? 'اصلاح' : 'جهش') + ' را بالا می‌برد' : '') + '؛ به‌تنهایی برگشت روند هفتگی نیست' : 'هم‌جهت با روند هفتگی'; }
      else { var opp = bear ? !dn : dn; d.weight = opp ? ((bear ? 'کاهش قدرت صعود' : 'کاهش قدرت نزول') + (z.state === 'confirmed' ? '؛ همراه با تأیید برگشت = شواهد برگشت' : '؛ به‌تنهایی برگشت نیست' + (vol ? '' : ' (تا تأیید برگشت)'))) : 'هم‌جهت با حرکت جاری (' + (dn ? 'اصلاح/نزول' : 'صعود') + ')؛ در ' + bigFa + ' وزن کمی دارد'; }
      return d; });
    // the market's phase, in one label
    o.phase = z.state === 'confirmed' ? 'تأیید برگشت' : z.state === 'broke' ? 'سناریوی برگشت باطل؛ ادامهٔ حرکت' : z.state === 'inZone' ? 'نزدیک نقطهٔ برگشت (داخل محدوده)' : tc.type === 'time' ? 'اصلاح زمانی' : tc.type === 'price' ? 'اصلاح قیمتی' : tc.type === 'mixed' ? 'اصلاح ترکیبی' : 'ادامهٔ روند';
    var T1 = o.tg[0]; o.valid = T1 && T1.w && T1.w.to ? { to: T1.w.to, toFa: T1.w.toFa, rule: 'اگر هدف اول تا ' + T1.w.toFa + ' محقق نشد ولی برگشت روند (' + fa(o.inv) + ') هم تأیید نشد: «تأخیر زمانی» — سناریو معتبر می‌ماند ولی احتمالش کمتر است و دوباره ارزیابی می‌شود.' } : null;
    return o;
  }
  /* domestic gold vs ounce and dollar: implied price of 18k = ounce × dollar × 0.75 / 31.1035; the premium and what drove the last moves */
  function goldLink(X0) { var find = function (s) { var k = Object.keys(X0.zmap || {}).filter(function (k) { var z = X0.zmap[k]; return z && z.a && z.a.sym === s && !z.a.sample; })[0]; return k ? X0.zmap[k].R.X : null; };
    var G = find('طلای ۱۸ عیار'), O = find('انس طلا'), U = find('دلار آزاد'); if (!G || !O || !U) return { ok: false, why: 'یکی از سری‌های طلای ۱۸، انس یا دلار آزاد در داده نیست.' };
    var idx = function (S) { var m = {}; for (var i = 0; i < S.n; i++) m[S.d[i]] = S.c[i]; return m; }, mo = idx(O), mu = idx(U), rows = [], lo = null, lu = null;
    for (var i = 0; i < G.n; i++) { var d = G.d[i]; if (mo[d] != null) lo = mo[d]; if (mu[d] != null) lu = mu[d]; if (lo && lu) rows.push({ d: d, g: G.c[i], o: lo, u: lu, imp: lo * lu * 0.75 / 31.1035 }); }
    if (rows.length < 60) return { ok: false, why: 'روزهای مشترک سه سری کمتر از ۶۰ است.' };
    rows.forEach(function (r) { r.pr = r.g / r.imp - 1; }); var L = rows[rows.length - 1], last = rows.slice(-250), pr = last.map(function (r) { return r.pr; });
    var dec = function (k) { var A = rows[rows.length - 1 - k]; if (!A) return null; var lg = Math.log(L.g / A.g), lo2 = Math.log(L.o / A.o), lu2 = Math.log(L.u / A.u), lp = Math.log((1 + L.pr) / (1 + A.pr)); return { k: k, g: Math.exp(lg) - 1, o: Math.exp(lo2) - 1, u: Math.exp(lu2) - 1, p: Math.exp(lp) - 1, sh: { o: lo2 / lg, u: lu2 / lg, p: lp / lg } }; };
    return { ok: true, d: L.d, g: L.g, o: L.o, u: L.u, imp: L.imp, pr: L.pr, prPct: pr.filter(function (v) { return v <= L.pr; }).length / pr.length, prMed: qtl(pr, 0.5), prQ: [qtl(pr, 0.1), qtl(pr, 0.9)], n: last.length, dec: [dec(5), dec(20), dec(60)].filter(Boolean),
      oDate: O.d[O.n - 1], uDate: U.d[U.n - 1], gDate: G.d[G.n - 1] }; }
  /* live registry: each price & time call is stored once and judged later in two separate dimensions — price and time */
  var PTKEY = 'hub.pt.v1';
  function ptRegister(DK, X0) { var U = Hub.util; if (!U || !U.store) return null; var S = U.store.get(PTKEY, null) || { open: [], done: [] }, now = Date.now(), byK = {};
    S.open.forEach(function (q) { byK[q.k] = q; });
    DK.items.forEach(function (x) { var p = x.pt, z = X0.zmap[x.key]; if (!z) return; var Xs = z.R.X, t = Xs.n - 1;
      // judge open calls on this asset with the bars that came after them
      var q = byK[x.key]; if (q) { var i0 = Xs.d.indexOf(q.d); if (i0 >= 0) { var hitAt = 0, invAt = 0; for (var u = i0 + 1; u <= t; u++) { if (!hitAt && (q.dn ? Xs.l[u] <= q.T : Xs.h[u] >= q.T)) hitAt = u - i0; if (!invAt && (q.dn ? Xs.c[u] > q.inv : Xs.c[u] < q.inv)) invAt = u - i0; }
        var age = t - i0, res = null; if (invAt && (!hitAt || invAt < hitAt)) res = 'inv'; else if (hitAt) res = hitAt < q.a ? 'early' : hitAt <= q.b ? 'inWin' : 'late'; else if (age > q.b) res = (q.dn ? Xs.c[t] < q.px : Xs.c[t] > q.px) ? 'dirOkTimeMiss' : 'miss';
        if (res) { q.res = res; q.at = Xs.d[t]; q.hitAt = hitAt; q.age = age; S.done.push(q); S.open = S.open.filter(function (y) { return y !== q; }); delete byK[x.key]; } } }
      if (!byK[x.key] && p && p.tg[0] && !p.tg[0].none && p.tg[0].w) { var T = p.tg[0]; var nq = { k: x.key, sym: x.sym, cls: x.cls, d: Xs.d[t], px: x.tz.px, dn: x.tz.side === 'down', T: T.p, inv: p.inv, a: T.w.a, b: T.w.b, pW: T.pWin, at0: now }; S.open.push(nq); byK[x.key] = nq; } });
    S.done = S.done.slice(-3000); S.at = now; try { U.store.set(PTKEY, S); } catch (e) { /* storage full: keep in memory only */ }
    var c = { inWin: 0, early: 0, late: 0, inv: 0, dirOkTimeMiss: 0, miss: 0 }; S.done.forEach(function (q) { if (c[q.res] != null) c[q.res]++; }); S.sum = c; return S; }
  /* calibration pool per market class: zone = interquartile range of the in-sample move; scored out-of-sample */
  function tzCalib(pool) {
    var r = {}; ['down', 'up'].forEach(function (sd) {
      var A = pool.filter(function (q) { return q.side === sd; }), IS = A.filter(function (q) { return q.f < 0.7; }), OS = A.filter(function (q) { return q.f >= 0.7; });
      var mv = IS.map(function (q) { return q.mv; }), q25 = qtl(mv, 0.25), q50 = qtl(mv, 0.5), q75 = qtl(mv, 0.75), q90 = qtl(mv, 0.9);
      var hit = OS.filter(function (q) { return q.mv >= q25 && q.mv <= q75; }).length, l1 = OS.filter(function (q) { return q.l1 != null; }), cf = OS.filter(function (q) { return q.conf; });
      var Rs = cf.map(function (q) { return q.R; }).filter(isF), byRg = {};
      OS.forEach(function (q) { var g = byRg[q.rg] = byRg[q.rg] || { n: 0, hit: 0 }; g.n++; if (q.mv >= q25 && q.mv <= q75) g.hit++; });
      r[sd] = { nIS: IS.length, nOS: OS.length, q25: q25, q50: q50, q75: q75, q90: q90, hit: OS.length ? hit / OS.length : NaN,
        err: OS.length ? qtl(OS.map(function (q) { return Math.abs(q.mv - q50); }), 0.5) : NaN, l1: l1.length ? l1.filter(function (q) { return q.l1; }).length / l1.length : NaN, nl1: l1.length,
        bars: qtl(OS.map(function (q) { return q.bars; }), 0.5), conf: OS.length ? cf.length / OS.length : NaN, fake: cf.length ? cf.filter(function (q) { return q.fake; }).length / cf.length : NaN, nConf: cf.length,
        avgR: Rs.length ? Rs.reduce(function (u, v) { return u + v; }, 0) / Rs.length : NaN, byRg: byRg, corr: OS.filter(function (q) { return q.corr; }).length };
      try { r[sd].pt = ptCalib(IS, OS); } catch (e) { r[sd].pt = null; }
    });
    return r;
  }
  /* today's zones for one asset, using its class calibration */
  function turnZones(X, I, Cb, P) {
    var t = X.n - 1, c = X.c, a = I.atr[t]; if (t < 210 || !(a > 0) || !Cb) return null;
    P = P || tzPivots(X, TZK); var st = tzState(X, I, t), Lv = tzLevels(P, t, c[t], a, TZK), px = c[t];
    var side = st.side === 'flat' ? (st.big === 'flat' ? null : st.big) : st.side; if (!side) return { side: 'flat', st: st, px: px, sup: Lv.sup.slice(0, 3), res: Lv.res.slice(0, 3), why: 'روند کوتاه و میان‌مدت جهت روشنی ندارند؛ محدودهٔ کف یا سقف برآورد نمی‌شود.' };
    var K = Cb[side]; if (!K || !(K.nIS >= 30) || !isF(K.q25)) return { side: side, st: st, px: px, sup: Lv.sup.slice(0, 3), res: Lv.res.slice(0, 3), why: 'نمونهٔ تاریخی این بازار برای برآورد محدوده کافی نیست (کمتر از ۳۰ مورد).' };
    var dn = side === 'down', sg = dn ? -1 : 1, zFar = px + sg * K.q75 * a, zNear = px + sg * K.q25 * a, lo = Math.min(zFar, zNear), hi = Math.max(zFar, zNear);
    var lv = dn ? Lv.sup : Lv.res, inZ = lv.filter(function (q) { return q.p >= lo - 0.25 * a && q.p <= hi + 0.25 * a; });
    // targets: real levels first (supports / resistances), completed with the statistical projections when levels run out
    var reach = K.q90 * a * 1.25, T = lv.filter(function (q) { return Math.abs(q.p - px) <= reach; }).slice(0, 3).map(function (q) { return { p: q.p, src: (dn ? 'حمایت' : 'مقاومت') + ' سقف/کف تاریخی (' + fa(q.n, 0) + ' بار)' }; });
    [K.q50, K.q90].forEach(function (m, i) { if (T.length < 3) { var p = px + sg * m * a; if (!T.some(function (q) { return Math.abs(q.p - p) < 0.5 * a; })) T.push({ p: p, src: 'برآورد آماری (' + (i ? 'صدک ۹۰' : 'میانه') + ' حرکت ' + fa(TZH, 0) + ' جلسه‌ای)' }); } });
    T.sort(function (u, v) { return dn ? v.p - u.p : u.p - v.p; }); T = T.slice(0, 3);
    // reversal confirmation: close beyond the extreme close of the 10 sessions before today, and beyond the last swing point against the trend
    var ext10 = dn ? maxC(c, t - 10, t - 1) : minC(c, t - 10, t - 1), swing = null;
    for (var j = P.length - 1; j >= 0; j--) { var q = P[j]; if (q.i + TZK > t) continue; if (q.k === (dn ? 'H' : 'L') && (dn ? q.p > px : q.p < px)) { swing = q; break; } if (q.i < t - 60) break; }
    var conf = dn ? Math.min(ext10, swing ? swing.p : Infinity) : Math.max(ext10, swing ? swing.p : -Infinity);
    var lo10 = minC(X.l, t - 10, t), hi10 = maxC(X.h, t - 10, t), touched = dn ? lo10 <= hi + 0.25 * a : hi10 >= lo - 0.25 * a;
    var done = dn ? px > ext10 && touched : px < ext10 && touched, broke = dn ? px < lo - 0.5 * a : px > hi + 0.5 * a;
    var inv = dn ? lo - 0.5 * a : hi + 0.5 * a, stop = dn ? Math.min(lo10, lo) - 0.5 * a : (swing ? Math.max(swing.p, minC(X.l, t - 10, t)) : minC(X.l, t - 10, t)) - 0.5 * a;   // down: stop for a long bought on the reversal; up: exit level for a long already held
    var after = (dn ? Lv.res : Lv.sup).slice(0, 2).map(function (q) { return q.p; }); if (!after.length && isF(I.s50[t])) after = [I.s50[t]];
    // evidence that the move is stopping (counted, not weighted): zone, divergence, RSI turn, climax volume, failed break, wick, larger trend
    var R = I.rsi, E = [], o = X.o, v = X.v, av = 0, k2; for (k2 = t - 20; k2 < t; k2++) av += (v[k2] || 0) / 20;
    var inZone = dn ? px <= hi + 0.25 * a && px >= lo - 0.5 * a : px >= lo - 0.25 * a && px <= hi + 0.5 * a; if (inZone) E.push('قیمت داخل محدودهٔ ' + (dn ? 'کف' : 'سقف') + ' احتمالی');
    var pv = P.filter(function (q) { return q.k === (dn ? 'L' : 'H') && q.i + TZK <= t && q.i >= t - 40; }).slice(-2);
    if (pv.length === 2 && (dn ? pv[1].p < pv[0].p && R[pv[1].i] > R[pv[0].i] + 1 : pv[1].p > pv[0].p && R[pv[1].i] < R[pv[0].i] - 1)) E.push('واگرایی ' + (dn ? 'مثبت' : 'منفی') + ' RSI (قیمت ' + fa(pv[0].p) + ' ← ' + fa(pv[1].p) + '، RSI ' + fa(R[pv[0].i], 0) + ' ← ' + fa(R[pv[1].i], 0) + ')');
    var rx = dn ? Math.min(R[t - 1], R[t - 2], R[t - 3]) : Math.max(R[t - 1], R[t - 2], R[t - 3]); if (dn ? rx < 35 && R[t] > R[t - 1] : rx > 65 && R[t] < R[t - 1]) E.push('RSI از ' + (dn ? 'اشباع فروش' : 'اشباع خرید') + ' برگشته (' + fa(rx, 0) + ' ← ' + fa(R[t], 0) + ')');
    if (av > 0) for (k2 = t - 5; k2 < t; k2++) if (v[k2] > 2 * av && (dn ? c[k2] < o[k2] : c[k2] > o[k2]) && v[t] < v[k2]) { E.push('حجم اوج ' + (dn ? 'فروش' : 'خرید') + ' (' + fa(v[k2] / av, 1) + ' برابر میانگین) و کاهش حجم پس از آن'); break; }
    var L0 = dn ? Lv.sup[0] : Lv.res[0]; if (L0) for (k2 = t - 2; k2 <= t; k2++) if (dn ? X.l[k2] < L0.p && c[k2] > L0.p : X.h[k2] > L0.p && c[k2] < L0.p) { E.push('شکست ناموفق ' + (dn ? 'حمایت ' : 'مقاومت ') + fa(L0.p)); break; }
    var body = Math.abs(c[t] - o[t]), wick = dn ? Math.min(c[t], o[t]) - X.l[t] : X.h[t] - Math.max(c[t], o[t]); if (!X.lock[t] && wick > 2 * body && wick > 0.3 * a) E.push('سایهٔ ' + (dn ? 'پایین' : 'بالا') + 'ی بلند در آخرین جلسه');
    if (st.corr) E.push('روند بزرگ‌تر ' + (st.big === 'up' ? 'صعودی' : 'نزولی') + ' است: این حرکت ' + (dn ? 'اصلاح' : 'جهش') + ' در دل روند بزرگ‌تر است');
    var state = broke ? 'broke' : done ? 'confirmed' : inZone ? 'inZone' : 'approach';
    var STF = dn ? { approach: 'در مسیر کاهش (بالای محدودهٔ کف)', inZone: 'داخل محدودهٔ کف احتمالی — منتظر تأیید', confirmed: 'برگشت صعودی تأیید شد', broke: 'محدودهٔ کف شکسته شد؛ سناریوی برگشت باطل' }
      : { approach: 'در مسیر رشد (زیر محدودهٔ سقف)', inZone: 'داخل محدودهٔ سقف احتمالی — مراقب تضعیف', confirmed: 'برگشت نزولی تأیید شد', broke: 'محدودهٔ سقف شکسته شد؛ سناریوی سقف باطل، روند ادامه دارد' };
    var str = (['s', 'm', 'l'].filter(function (k) { return st[k] === side; }).length);
    return { side: side, st: st, corr: st.corr, strength: str, strFa: (str >= 3 ? 'قوی' : str === 2 ? 'متوسط' : 'ضعیف') + ' (' + fa(str, 0) + ' از ۳ افق)', px: px, atr: a, zone: [lo, hi], inZ: inZ.map(function (q) { return q.p; }),
      T: T, sup: Lv.sup.slice(0, 3).map(function (q) { return q.p; }), res: Lv.res.slice(0, 3).map(function (q) { return q.p; }), conf: conf, inv: inv, stop: stop, after: after, ev: E, evN: E.length, state: state, stFa: STF[state], K: K,
      pZone: K.hit, pL1: K.l1, pFake: K.fake, n: K.nOS, method: 'محدوده = صدک ۲۵ تا ۷۵ حرکت ' + fa(TZH, 0) + ' جلسه‌ای همین بازار در همین وضعیت روند، بر حسب ATR ۱۴؛ برآورد روی ۷۰٪ اول داده، سنجش روی ۳۰٪ آخر' };
  }
  function tzText(z, nd) { if (!z || !z.zone) return z ? z.why || '' : ''; var dn = z.side === 'down';
    return (dn ? 'روند نزولی' : 'روند صعودی') + (z.corr ? ' (اصلاح در روند بزرگ‌تر ' + (z.st.big === 'up' ? 'صعودی' : 'نزولی') + ')' : '') + ' · ' + (dn ? 'کف' : 'سقف') + ' احتمالی ' + nd(z.zone[0]) + '–' + nd(z.zone[1]) + ' · تأیید برگشت ' + (dn ? 'بالای ' : 'زیر ') + nd(z.conf) + ' · ' + z.stFa; }
  function pc(v) { return isF(v) ? (v >= 0 ? '+' : '') + fa(v * 100, 1) + '٪' : '—'; }
  /* the standard block for an index: value, change, trend per horizon, support / resistance, the two confirmation levels
     (highest / lowest close of the 20 sessions before the last), state, scenarios with targets, invalidation, timing and action */
  function indexView(rows, name, E, sample) {
    if (!rows || rows.length < 60) return { name: name, ok: false, why: 'دادهٔ شاخص دریافت نشده یا کمتر از ۶۰ جلسه است' };
    var a = { key: 'ix:' + name, sym: name, cls: 'index', rows: rows.map(function (r) { return { date: r.date, open: r.close, high: r.high || r.close, low: r.low || r.close, close: r.close, vol: 0, val: 0 }; }) };
    var R = analyse(a, false), X = R.X, I = R.I, t = X.n - 1, cl = X.c[t], atr = I.atr[t], dFa = shamsi(X.d[t]);
    var tz = null; if (X.n >= 260) { try { var ckI = 'TZI|' + name + '|' + X.n + '|' + X.d[t] + '|' + cl; if (!CACHE[ckI]) { var PI = tzPivots(X, TZK); CACHE[ckI] = { P: PI, cal: tzCalib(tzCases(X, I, PI)) }; } tz = turnZones(X, I, CACHE[ckI].cal, CACHE[ckI].P); } catch (e) { tz = null; } }
    var up = maxC(X.c, t - 20, t - 1), dn = minC(X.c, t - 20, t - 1);
    var uniq = function (arr) { return arr.filter(function (v, i) { return !i || Math.abs(v / arr[i - 1] - 1) > 0.005; }); };
    var res = uniq([maxC(X.c, t - 60, t - 1), maxC(X.c, t - 120, t - 1), X.n > 251 ? maxC(X.c, t - 250, t - 1) : NaN].filter(function (v) { return isF(v) && v > up * 1.002; }).sort(function (p, q) { return p - q; }));
    var sup = uniq([minC(X.c, t - 60, t - 1), minC(X.c, t - 120, t - 1), I.s200[t]].filter(function (v) { return isF(v) && v < dn * 0.998; }).sort(function (p, q) { return q - p; }));
    var MC = Hub.mktCal, chk = MC ? MC.levels(cl, up, dn, atr, { src: 'بالاترین/پایین‌ترین مقدار پایانی ۲۰ جلسهٔ پیش از ' + dFa, upAt: cl > up ? dFa : null, dnAt: cl < dn ? dFa : null }) : null;
    var win = MC ? MC.window('index', X.d[t], HZN.m.win, X.d) : null, tr = { s: trendView(X, I, t, 's'), m: trendView(X, I, t, 'm'), l: trendView(X, I, t, 'l') }; var trx = { s: trendEv(X, I, t, 's'), m: trendEv(X, I, t, 'm'), l: trendEv(X, I, t, 'l') };
    var dom = tr.m !== 'flat' && tr.m !== 'none' ? tr.m : tr.s;
    var act = chk && chk.state === 'above' ? (tr.m === 'up' ? 'روند میان‌مدت صعودی و سطح تأیید صعودی شکسته شده: خرید سهام فقط با سیگنال معتبر خود هر سهم؛ مرجع ریسک سبد: بسته‌شدن زیر ' + fa(dn) + '.' : 'سطح تأیید صعودی شکسته شده ولی روند میان‌مدت هنوز صعودی نیست: فقط سیگنال‌های معتبر تک‌سهم، بدون افزایش وزن کلی سهام.')
      : chk && chk.state === 'below' ? 'سطح تأیید نزولی شکسته شده: خرید تازه نکنید، حد ضرر موقعیت‌های باز را اجرا کنید و وزن سهام را تا بسته‌شدن دوباره بالای ' + fa(dn) + ' کاهش دهید.'
      : 'بین دو سطح: تا بسته‌شدن بالای ' + fa(up) + ' یا زیر ' + fa(dn) + ' جهت بازار تأیید نشده است؛ تصمیم را به سیگنال‌های معتبر تک‌سهم محدود کنید.';
    return { tz: tz, name: name, ok: true, sample: !!sample, last: cl, date: X.d[t], dateFa: dFa, chg1: cl / X.c[t - 1] - 1, chg5: X.n > 5 ? cl / X.c[t - 5] - 1 : NaN, chg20: X.n > 20 ? cl / X.c[t - 20] - 1 : NaN, atr: atr,
      tr: tr, trx: trx, dom: dom, up: up, dn: dn, res: res, sup: sup, chk: chk, win: win, rg: R.RG[t], n: X.n,
      bull: 'صعودی: تأیید با یک بسته‌شدن بالای ' + fa(up) + (res.length ? '؛ اهداف ' + res.slice(0, 2).map(function (v) { return fa(v) + ' (' + pc(v / cl - 1) + ')'; }).join(' و ') : '؛ مقاومت بالاتری در ۲۵۰ جلسه نیست') + '؛ ابطال: بسته‌شدن دوباره زیر ' + fa(dn) + '.',
      bear: 'نزولی: تأیید با یک بسته‌شدن زیر ' + fa(dn) + (sup.length ? '؛ اهداف ' + sup.slice(0, 2).map(function (v) { return fa(v) + ' (' + pc(v / cl - 1) + ')'; }).join(' و ') : '؛ حمایت پایین‌تری در ۱۲۰ جلسه و میانگین ۲۰۰ نیست') + '؛ ابطال: بسته‌شدن دوباره بالای ' + fa(up) + '.', act: act };
  }

  /* ======= one status per signal, checked against today's price (directives 12 and 13) =======
     Six statuses: تأییدشده (validated strategy, entry condition met, price inside the entry zone) · مشروط (validated strategy, an entry
     condition not met yet) · نیازمند بررسی مجدد (price left the zone or the evidence is stale) · ردشده (no validated strategy) ·
     منقضی‌شده (target reached, invalidated or the window ran out) · فاقد دادهٔ کافی. The entry state compares the current price with the
     zone: داخل / بالاتر / پایین‌تر / ازدست‌رفته. The zone is never moved up to follow the price: above the zone the answer is wait for a
     pullback, a separately validated breakout, or no entry. */
  var ST6 = { ok: 'تأییدشده', cond: 'مشروط', review: 'نیازمند بررسی مجدد', rej: 'ردشده', exp: 'منقضی‌شده', nodata: 'فاقد دادهٔ کافی' };
  var EN6 = { in: 'داخل محدودهٔ ورود', above: 'بالاتر از محدودهٔ ورود', below: 'پایین‌تر از محدودهٔ ورود', missed: 'ورود ازدست‌رفته', stop: 'زیر حد ضرر', none: '—' };
  function hhmm(h) { h = Number(h) || 0; return h ? ('0' + Math.floor(h / 10000)).slice(-2) + ':' + ('0' + Math.floor(h / 100) % 100).slice(-2) : ''; }
  // the price the signal is judged on: live for 24-hour markets, the session's last trade for the exchange, the last valid close when closed
  function pxRef(x, z) {
    var a = z && z.a, rows = a ? a.rows : [], r = rows[rows.length - 1] || {}, pm = (a && a.pm) || {}, ses = pm.session, src = pm.src || x.c && x.c.src || '';
    var o = { v: x.last, unit: x.unit || '', src: src, date: r.date, dateFa: x.date, live: !!r.live, fetched: pm.at || null };
    if (x.cls === 'stock' || x.cls === 'fund') {
      o.lastTrade = r.last > 0 ? r.last : NaN; o.time = r.live ? hhmm(r.hEven) : '';
      o.kind = r.live ? (ses && ses.open ? 'لحظه‌ای — بازار باز (قیمت پایانی تا ساعت ' + o.time + ')' : 'آخرین قیمت جلسهٔ امروز' + (o.time ? ' (ساعت ' + o.time + ')' : '') + ' — پایانی رسمی هنوز منتشر نشده') : 'قیمت پایانی رسمی جلسهٔ ' + x.date;
    } else if (x.cls === 'gold' || x.cls === 'fx') { o.time = r.ts ? String(r.ts).slice(11, 16) : ''; o.kind = r.live ? 'قیمت لحظه‌ای TGJU (ساعت ' + o.time + ' تهران)' : 'آخرین قیمت ثبت‌شدهٔ روز ' + x.date + ' در TGJU'; }
    else o.kind = 'آخرین دادهٔ ' + (src || 'منبع') + ' (' + x.date + ')' + (x.cls === 'crypto' ? '؛ بازار ۲۴ ساعته' : '');
    return o;
  }
  function sigView(x, E, z) {
    var g = x.gate || {}, p = x.path || {}, minRR = Number(E.acct && E.acct.minRR) || 1.5, cl = x.last, atr = x.S && x.S.atr, lv = (x.act && x.act.lv) || (g.lv ? { entry: g.lv.entry, stop: g.lv.stop, tp: g.lv.tp } : null);
    var o = { px: pxRef(x, z), lv: lv, st: 'cond', en: 'none', why: '' };
    var tr0 = x.track, l0 = tr0 && tr0.lv0, moved = false;
    // directive 13.4: the entry zone is not moved up to keep an old call alive. If the issued zone (lv0) sits below today's recomputed zone
    // and the gate has not passed, the price is judged against the issued zone; the new zone only counts after the gate passes.
    if (l0 && isF(l0.hi) && isF(l0.stop) && l0.stop < l0.lo && lv && lv.entry && Math.max(lv.entry[0], lv.entry[1]) > l0.hi * 1.001 && g.code !== 'ok') { moved = true; lv = { entry: [l0.lo, l0.hi], stop: l0.stop, tp: l0.tp || lv.tp }; }
    var tol = isF(atr) ? 0.25 * atr : 0, lo = lv && lv.entry ? Math.min(lv.entry[0], lv.entry[1]) : NaN, hi = lv && lv.entry ? Math.max(lv.entry[0], lv.entry[1]) : NaN;
    o.rr = lv && cl > lv.stop ? (lv.tp[1] - cl) / (cl - lv.stop) : NaN;
    // a stop only exists after entry: a breakout plan whose confirmation level is still above the price has not been triggered,
    // so a price under its (entry-relative) stop is "waiting below the entry", not "stopped out"
    var bu = x.S && x.S.bull, trg = tr0 && tr0.dIn ? true : !(bu && bu.type !== 'pullback' && isF(bu.confirm) && cl < bu.confirm);
    if (isF(lo) && isF(cl)) { o.en = lv.stop && cl <= lv.stop && trg ? 'stop' : lv.stop && cl <= lv.stop ? 'below' : cl > hi + tol ? (o.rr >= minRR ? 'above' : 'missed') : cl < lo ? 'below' : 'in'; o.dist = cl > hi ? cl / hi - 1 : cl < lo ? cl / lo - 1 : 0; }
    var tr = x.track; if (tr) { o.issue = { p: tr.p0, d: tr.d0fa, id: tr.sid || tr.id, lv0: tr.lv0, chg: isF(tr.p0) && tr.p0 > 0 ? cl / tr.p0 - 1 : NaN }; }
    var nm = x.sym, z0 = isF(lo) ? fa(lo) + '–' + fa(hi) : '—';
    if (x.c && x.c.sample || g.code === 'nodata') { o.st = 'nodata'; o.why = (g.chk && g.chk[0] && !g.chk[0].ok ? g.chk[0].t : 'دادهٔ کافی برای ارزیابی نیست') + '؛ سیگنال صادر نمی‌شود.'; }
    else if (p.st === 'target' || p.st === 'invalid' || o.en === 'stop' || (tr && /^(expired|stopped|invalid|t3)$/.test(tr.st))) { o.st = 'exp'; o.why = p.st === 'target' ? 'هدف قبلی محقق شده؛ بخش اصلی حرکت گذشته است. منتظر تنظیم تازه.' : o.en === 'stop' ? (tr0 && tr0.dIn ? 'پس از ورود، قیمت ' + fa(cl) + ' به حد ضرر ' + fa(lv.stop) + ' رسیده؛ سیگنال بسته شد.' : 'ابطال پیش از ورود: قیمت ' + fa(cl) + ' از محدودهٔ ورود عبور کرد و زیر سطح ابطال ' + fa(lv.stop) + ' رفت؛ طرح کنار گذاشته شد.') : p.st === 'invalid' ? 'ابطال ساختار: ' + (p.why || '') + '. طرح قبلی کنار گذاشته شد؛ تا شکل‌گیری تنظیم تازه سیگنالی نیست.'
      : 'سیگنال ثبت‌شدهٔ قبلی بسته شده: ' + ({ expired: 'افق زمانی آن تمام شد' + (tr.dIn ? ' بدون رسیدن به هدف' : ' و تأیید ورود رخ نداد'), stopped: 'پس از ورود به حد ضرر رسید', invalid: 'پیش از ورود باطل شد (بسته‌شدن زیر سطح ابطال یا ازبین‌رفتن شرایط فرصت)', t3: 'به هدف سوم رسید' }[tr.st] || tr.st) + '. تا تنظیم تازه سیگنالی نیست.'; }
    else if (g.code === 'nobt' || g.code === 'review' || g.code === 'down') { o.st = 'rej'; o.why = 'دروازهٔ اعتبار ' + (g.fa || '') + ': ' + g.status + (g.chk ? ' — ' + String((g.chk.filter(function (c) { return !c.ok; })[0] || {}).t || '').replace(/[.؛\s]+$/, '') : '') + '. تا رفع این مورد سیگنال تأییدشده نیست.'; }
    else if (o.en === 'missed') { o.st = 'review'; o.why = 'قیمت فعلی ' + fa(cl) + ' از سقف محدودهٔ ورود ' + z0 + ' عبور کرده (' + pct(o.dist, 1) + ')؛ ورود در محدودهٔ قبلی دیگر ممکن نیست و از این قیمت بازده به ریسک ' + fa(o.rr, 1) + ' است. تعقیب قیمت توصیه نمی‌شود؛ با اصلاح به محدوده یا تأیید شکست و تثبیت مقاومتی تازه (فقط با استراتژی آزموده‌شده) دوباره ارزیابی می‌شود.'; }
    else if (o.en === 'above') { o.st = 'review'; o.why = 'قیمت ' + fa(cl) + ' بالاتر از محدودهٔ ورود ' + z0 + ' است (' + pct(o.dist, 1) + ')؛ محدوده جابه‌جا نمی‌شود. ورود فقط در پولبک به محدوده؛ بازده به ریسک از قیمت فعلی ' + fa(o.rr, 1) + '.'; }
    else if (g.code === 'ok' && o.en === 'in' && x.act && (x.act.k === 'now' || x.act.k === 'zone')) { o.st = 'ok'; o.why = 'دروازهٔ اعتبار ' + g.fa + ' گذشت (' + (g.kfa || '') + ') و قیمت ' + fa(cl) + ' داخل محدودهٔ ورود ' + z0 + ' است.'; }
    else { o.st = 'cond'; var f1 = g.chk ? g.chk.filter(function (c) { return !c.ok; })[0] : null;
      o.why = (o.en === 'in' ? 'قیمت داخل محدودهٔ ورود ' + z0 + ' است، اما ' : o.en === 'below' ? 'قیمت ' + pct(o.dist, 1) + ' پایین‌تر از محدودهٔ ورود ' + z0 + ' است (حمایت و حد ضرر دوباره بررسی شود)؛ ' : '') + (f1 ? 'شرط «' + String(f1.t).replace(/[.؛\s]+$/, '') + '» هنوز برقرار نیست' : g.status ? 'دروازهٔ اعتبار: ' + g.status : 'شرط ورود برقرار نیست') + '.'; }
    if (moved) { o.lv = lv; o.moved = true; o.why += ' (محدودهٔ ورود صادرشده ' + fa(lo) + '–' + fa(hi) + ' ملاک است؛ محدودهٔ بازمحاسبه‌شدهٔ بالاتر فقط پس از عبور از دروازهٔ اعتبار به‌کار می‌رود — تعقیب قیمت نه.)'; }
    o.stFa = ST6[o.st]; o.enFa = EN6[o.en];
    var r = g.row; o.bt = r ? { n: r.n, hit: r.hit, pf: r.pf, mdd: r.mdd, avgR: r.avgR, oos: r.oos, k: g.kfa } : null;
    return o;
  }
  function okOnlyIfElig(x) { var v = x.v6; if (v && v.st === 'ok' && !x.elig) { v.st = 'cond'; v.stFa = ST6.cond; v.why = 'دروازهٔ اعتبار و قیمت برقرارند، اما غربال فرصت رد شد: ' + (x.notWhy.join('، ') || 'شرط فرصت') + '.'; } }
  function deskBuild(X, E, all, db) {
    var ac = E.acct || {}, minRR = Number(ac.minRR) || 1.5, items = [];
    all.forEach(function (f) {
      var c = X.cards.filter(function (x) { return x.key === f.key; })[0], z = X.zmap[f.key]; if (!c || !z) return;
      var S = scenariosOf(c, z, E); if (!S) return;
      var why = [], elig = S.isLong && f.dir === 'up';
      if (!S.isLong || f.dir !== 'up') why.push(f.dir === 'down' ? 'دید نزولی' : 'دید صعودی کافی نیست');
      if (c.conf < E.minConf) { elig = false; why.push('اطمینان ' + fa(c.conf, 0) + '٪ کمتر از حداقل'); }
      if (!(S.bull.rr2 >= minRR)) { elig = false; why.push('بازده به ریسک تا هدف ۲ = ' + fa(S.bull.rr2, 1)); }
      if (c.sample) { elig = false; why.push('دادهٔ نمونه'); }
      if (isF(c.age) && c.age > 96) { elig = false; why.push('دادهٔ قدیمی'); }
      if (db && isF(f.expRet) && f.expRet <= 0) { elig = false; why.push('امید ریاضی منفی در بک‌تست'); }
      var g = GW[S.grade] || 0.25, liq = (c.cls === 'stock' || c.cls === 'fund') && !c.liqOK ? 0.5 : 1, risk = isF(S.bull.entry) && S.bull.entry > S.bull.stop ? (S.bull.entry - S.bull.stop) / S.bull.entry : NaN;
      var exp = isF(S.bull.entry) ? (S.bull.tp[1] - S.bull.entry) / S.bull.entry : NaN;
      var path = pathState(z, c, S, E);
      items.push({ path: path, key: c.key, sym: c.sym, name: c.name, cls: c.cls, mk: MKFA[c.cls] || c.cls, unit: c.unit, last: S.close, date: c.date, age: c.age, dir: f.dir, conf: c.conf, grade: S.grade, f: f, c: c, S: S, elig: elig, notWhy: why,
        score: elig ? g * c.conf / 100 * Math.min(S.bull.rr2, 4) * liq : NaN, expMove: exp, expRet: f.expRet, risk: risk, rr: S.bull.rr2, hz: c.horizon, prob: f.prob || [], vol: c.vol, global: !!c.global });
    });
    var LIVE = liveBy();
    var posBy = {}; (X.mon || []).forEach(function (m) { if (m.p && m.p.key) posBy[m.p.key] = { stop: m.p.stop, mon: m }; }); (E.positions || []).forEach(function (p) { if (p.key && !posBy[p.key]) posBy[p.key] = { stop: p.stop, mon: {} }; });
    var SF = { active: 1, retest: 0.9, near: 0.7, nc: 0.5, missed: 0.35, target: 0.2, invalid: 0, bear: 0, nosig: 0 };
    items.forEach(function (x) { x.pos = posBy[x.key] || null; x.act = actionNow(x, E, x.pos); x.st9 = x.pos ? 'pos' : x.path.st; x.st9fa = ST9[x.st9];
      if (x.elig && (x.path.st === 'invalid' || x.path.st === 'bear')) { x.elig = false; x.notWhy.push(ST9[x.path.st]); }
      // the market's selected strategy (by out-of-sample stability): did it fire on this asset within the horizon?
      x.hzs = hzSignals(x, X.zmap[x.key], E, db, LIVE); x.hk = x.c.horizon && HZN[x.c.horizon.k] ? x.c.horizon.k : 'm'; x.gate = x.hzs[x.hk];
      x.okH = ['s', 'm', 'l'].filter(function (h) { return x.hzs[h].code === 'ok'; });
      x.sel = { k: x.gate.k, fa: x.gate.kfa, fired: x.gate.fired };
      if (x.elig) { x.score *= (SF[x.path.st] != null ? SF[x.path.st] : 0.5); x.score *= x.okH.length ? 1.2 : x.gate.k ? (x.gate.fired ? 1 : 0.85) : 0.8; } });
    items.forEach(function (x) { x.act = actionNow(x, E, x.pos); });
    items.forEach(function (x) { try { x.v6 = sigView(x, E, X.zmap[x.key]); } catch (e) { x.v6 = null; }
      // a call that no longer fits today's price does not stay in the list of active opportunities
      // rejected calls (back-test invalid / strategy under review / bearish view) are not opportunities either (directive 12.6–12.7)
      var v = x.v6; if (x.elig && v && (v.st === 'exp' || v.st === 'nodata' || v.st === 'rej' || v.en === 'missed')) { x.elig = false; x.notWhy.push(v.stFa + ': ' + v.why.split('؛')[0]); }
      else if (x.elig && v && v.en === 'above') x.score *= 0.6;
      // a call the opportunity screen did not pass (confidence, direction, reward/risk to target 2, liquidity …) is not shown as confirmed
      okOnlyIfElig(x); });
    // turning points (directive 9): calibrate per market class on its own histories, then place each asset's probable bottom / top zone
    var tzPool = {}, tzP = {};
    items.forEach(function (x) { var z = X.zmap[x.key]; if (!z || z.a.sample) return; var R = z.R, Xs = R.X; if (Xs.n < 260) return;
      var ck = 'TZ|' + x.key + '|' + Xs.n + '|' + Xs.d[Xs.n - 1] + '|' + Xs.c[Xs.n - 1];
      if (!CACHE[ck]) { try { var P0 = tzPivots(Xs, TZK); CACHE[ck] = { P: P0, cs: tzCases(Xs, R.I, P0, tzPivots(Xs, PTK)) }; } catch (e) { CACHE[ck] = { P: null, cs: [] }; } }
      tzP[x.key] = CACHE[ck].P; var pk = poolKey(x); (tzPool[pk] = tzPool[pk] || []).push.apply(tzPool[pk], CACHE[ck].cs); });
    var tzCal = {}; Object.keys(tzPool).forEach(function (k) { tzCal[k] = tzCalib(tzPool[k]); });
    items.forEach(function (x) { var z = X.zmap[x.key]; x.tz = null; if (!z || !tzP[x.key]) return; try { x.tz = turnZones(z.R.X, z.R.I, tzCal[poolKey(x)], tzP[x.key]); } catch (e) { x.tz = null; }
      var t = x.tz; if (!t || !t.zone) return;
      // the zones feed the ranking: buying into a probable top is penalised; a confirmed top reversal removes the opportunity; a confirmed bottom reversal with a usable track record is preferred
      if (x.elig && t.side === 'up' && t.state === 'inZone') { x.score *= 0.75; x.tzNote = 'قیمت داخل محدودهٔ سقف احتمالی (' + fa(t.zone[0]) + '–' + fa(t.zone[1]) + ')؛ امتیاز × ۰٫۷۵'; }
      if (x.elig && t.side === 'up' && t.state === 'confirmed') { x.elig = false; x.notWhy.push('برگشت نزولی در محدودهٔ سقف احتمالی تأیید شده (بسته‌شدن زیر ' + fa(t.conf) + ')'); }
      try { x.pt = ptAnalysis(z.R.X, z.R.I, t, tzCal[poolKey(x)], x.cls, tzP[x.key]); } catch (e) { x.pt = null; }
      // a trend that is old by the market's own history, where old trends have reversed more often out of sample, is a weaker long
      if (x.elig && t.side === 'up' && x.pt && x.pt.exhaust) { x.score *= 0.85; x.tzNote = (x.tzNote ? x.tzNote + '؛ ' : '') + 'سن روند در صدک ' + fa(x.pt.agePct * 100, 0) + ' تاریخی (فرسودگی زمانی)؛ امتیاز × ۰٫۸۵'; }
      if (x.elig && t.side === 'down' && t.state === 'confirmed' && t.K.nConf >= 30 && t.K.fake < 0.5) { x.score *= 1.15; x.tzNote = 'برگشت صعودی از محدودهٔ کف تأیید شده؛ نرخ برگشت کاذب تاریخی ' + pc(t.K.fake).replace('+', '') + '؛ امتیاز × ۱٫۱۵'; } });
    var opp = items.filter(function (x) { return x.elig; }).sort(function (a, b) { return b.score - a.score; });
    var top10 = opp.slice(0, 10);
    var bear = items.filter(function (x) { return x.S.state === 'bear'; }).sort(function (a, b) { return a.c.S - b.c.S; });
    var near = items.filter(function (x) { return x.S.isLong && (x.S.state === 'near' || x.S.state === 'priceok') && !x.elig; });
    // market overview: one row per market class, including markets without a valid opportunity (said explicitly)
    var mk = {}; items.forEach(function (x) { var m = mk[x.cls] = mk[x.cls] || { cls: x.cls, fa: x.mk, n: 0, up: 0, down: 0, flat: 0, opp: 0, best: null, vol: [], date: 0 }; m.n++; m[x.dir === 'up' ? 'up' : x.dir === 'down' ? 'down' : 'flat']++; if (x.elig) { m.opp++; if (!m.best || x.score > m.best.score) m.best = x; } if (isF(x.vol)) m.vol.push(x.vol); });
    var mx = Math.max.apply(null, opp.map(function (x) { return x.score; }).concat([0]));
    var over = Object.keys(mk).map(function (k) { var m = mk[k], v = m.vol.length ? m.vol.sort(function (a, b) { return a - b; })[Math.floor(m.vol.length / 2)] : NaN;
      return { cls: k, fa: m.fa, n: m.n, up: m.up, down: m.down, flat: m.flat, dir: m.up > m.down * 1.3 ? 'up' : m.down > m.up * 1.3 ? 'down' : 'flat', opp: m.opp, best: m.best, risk: riskFa(v), vol: v, att: m.best && mx > 0 ? m.best.score / mx : 0,
        note: m.opp ? fa(m.opp, 0) + ' فرصت معتبر؛ بهترین: ' + m.best.sym : 'در حال حاضر فرصت قابل توصیه‌ای شناسایی نشده است' }; }).sort(function (a, b) { return b.att - a.att || b.opp - a.opp; });
    var gold = null; try { gold = goldLink(X); } catch (e) { gold = { ok: false, why: e.message }; }
    return { items: items, tzCal: tzCal, gold: gold, opp: opp, top10: top10, bear: bear, near: near, over: over, ST8: ST8, ST9: ST9, ST6: ST6, EN6: EN6, minRR: minRR, strat: db && db.strat ? db.strat : null, held: items.filter(function (x) { return x.pos; }) };
  }
  /* signal registry: one entry per opportunity, replayed bar by bar after creation; every status and level change is logged with its reason */
  var DKEY = 'hub.tradedesk.v1';
  function deskTrack(D, X, E) {
    var Ust = Hub.util && Hub.util.store; if (!Ust) return null;
    var R = Ust.get(DKEY, null); if (!R || R.version !== 1) R = { version: 1, sig: [], log: [] };
    var now = new Date().toISOString(), close = function (s, px, dd) { s.pEnd = px; s.dirOK = isF(s.p0) && px !== s.p0 ? px > s.p0 : null;   /* unchanged price (e.g. cancelled in the session it was issued) is not judged right or wrong */ s.closedAt = dd; s.ret = isF(s.p0) && s.p0 > 0 ? px / s.p0 - 1 : null; s.daysToEnd = Math.round(Date.now() / 864e5 - d2days(s.d0)); var e = s.hist[s.hist.length - 1]; s.reason = e ? e.why : ''; }, log = function (s, from, to, why, date) { var e = { id: s.id, sym: s.sym, at: now, date: date || '', from: from, to: to, why: why }; s.hist.push(e); R.log.push(e); };
    var byKey = {}; D.items.forEach(function (x) { byKey[x.key] = x; });
    R.sig.forEach(function (s) { if (!ACTIVE[s.st] && s.dirOK === false && isF(s.pEnd) && s.pEnd === s.p0) s.dirOK = null; });   // older entries closed at the issue price
    R.sig.forEach(function (s) {
      if (!ACTIVE[s.st]) return; var z = X.zmap[s.key]; if (!z) return; var Xs = z.R.X, L = s.lv, i0 = Xs.d.indexOf(s.d0); if (i0 < 0) i0 = Xs.d.findIndex(function (d) { return d > s.d0; }) - 1; if (i0 < -1) return;
      var t = Math.max(0, i0 + 1), enteredBefore = s.st === 'confirmed' || s.st === 't1' || s.st === 't2';
      for (; t < Xs.n; t++) { var dd = shamsi(Xs.d[t]), h = Xs.h[t], l = Xs.l[t], cc = Xs.c[t];
        if (!ACTIVE[s.st]) break;
        if (s.st === 'missed') {
          if (cc < L.stop) { log(s, s.st, 'invalid', 'پیش از بازآزمایی، بسته‌شدن ' + fa(cc) + ' زیر سطح ابطال', dd); s.st = 'invalid'; close(s, cc, dd); break; }
          if (l <= L.hi && cc >= L.lo) { log(s, s.st, 'confirmed', 'بازآزمایی: قیمت به محدودهٔ ورود ' + fa(L.lo) + '–' + fa(L.hi) + ' برگشت و بالای آن بسته شد', dd); s.st = 'confirmed'; s.dIn = Xs.d[t]; }
          continue;
        }
        if (s.st === 'pending' || s.st === 'near' || s.st === 'priceok') {
          if (cc < L.stop) { log(s, s.st, 'invalid', 'بسته‌شدن ' + fa(cc) + ' زیر سطح ابطال ' + fa(L.stop) + ' پیش از ورود', dd); s.st = 'invalid'; close(s, cc, dd); break; }
          if (L.type !== 'pullback' && cc >= L.confirm && isF(L.atr) && cc > L.hi + 0.25 * L.atr) { log(s, s.st, 'missed', 'بسته‌شدن ' + fa(cc) + ' بالای سطح تأیید، اما ' + pct(cc / L.hi - 1, 1) + ' بالاتر از محدودهٔ ورود؛ ورود در این قیمت منطقی نبود', dd); s.st = 'missed'; s.wasMissed = true; continue; }
          if (cc >= L.confirm || (L.type === 'pullback' && l <= L.hi && cc >= L.lo)) { log(s, s.st, 'confirmed', L.type === 'pullback' ? 'قیمت در محدودهٔ ورود ' + fa(L.lo) + '–' + fa(L.hi) + ' معامله شد' : 'بسته‌شدن ' + fa(cc) + ' بالای سطح تأیید ' + fa(L.confirm), dd); s.st = 'confirmed'; s.dIn = Xs.d[t]; continue; }
        } else {
          if (l <= L.stop) { log(s, s.st, 'stopped', 'کف ' + fa(l) + ' به حد ضرر ' + fa(L.stop) + ' رسید', dd); s.st = 'stopped'; close(s, Math.min(Xs.o[t], L.stop), dd); break; }
          if (h >= L.tp[2]) { log(s, s.st, 't3', 'سقف ' + fa(h) + ' به هدف سوم ' + fa(L.tp[2]) + ' رسید', dd); s.st = 't3'; s.maxT = 3; close(s, L.tp[2], dd); break; }
          if (s.st !== 't2' && h >= L.tp[1]) { log(s, s.st, 't2', 'سقف ' + fa(h) + ' به هدف دوم ' + fa(L.tp[1]) + ' رسید', dd); s.st = 't2'; s.maxT = 2; }
          else if (s.st === 'confirmed' && h >= L.tp[0]) { log(s, s.st, 't1', 'سقف ' + fa(h) + ' به هدف اول ' + fa(L.tp[0]) + ' رسید', dd); s.st = 't1'; s.maxT = 1; if (L.stop < L.entry) { s.lvlog.push({ at: now, f: 'حد ضرر', o: L.stop, n: L.entry, why: 'پس از هدف اول، حد ضرر به نقطهٔ ورود منتقل شد (قاعدهٔ خروج)' }); L.stop = L.entry; } }
        }
      }
      var days = (d2days(Xs.d[Xs.n - 1]) - d2days(s.d0)) || 0, cal = s.hz * 7 / 5 + 2;
      if (ACTIVE[s.st] && days > cal) { log(s, s.st, 'expired', (s.st === 'confirmed' || s.st === 't1' || s.st === 't2' ? 'افق ' + fa(s.hz, 0) + ' جلسه‌ای تمام شد؛ خروج زمانی' : 'تا پایان افق ' + fa(s.hz, 0) + ' جلسه تأیید نشد'), shamsi(Xs.d[Xs.n - 1])); s.st = 'expired'; close(s, Xs.c[Xs.n - 1], shamsi(Xs.d[Xs.n - 1])); }
      // not yet entered: refresh the plan to today's structure and record every change with its reason
      var x = byKey[s.key];
      if (x && !enteredBefore && (s.st === 'pending' || s.st === 'near' || s.st === 'priceok')) {
        if (!x.elig) { log(s, s.st, 'invalid', 'شرایط فرصت دیگر برقرار نیست: ' + (x.notWhy.join('، ') || 'تغییر دید موتور'), x.date); s.st = 'invalid'; close(s, x.last, x.date); return; }
        var nl = { confirm: x.S.bull.confirm, lo: x.S.bull.lo, hi: x.S.bull.hi, entry: x.S.bull.entry, stop: x.S.bull.stop, tp: x.S.bull.tp.slice(), type: x.S.bull.type, atr: x.S.atr };
        [['confirm', 'سطح تأیید'], ['stop', 'حد ضرر'], ['entry', 'نقطهٔ ورود']].forEach(function (p) { if (isF(L[p[0]]) && Math.abs(nl[p[0]] / L[p[0]] - 1) > 0.005) s.lvlog.push({ at: now, f: p[1], o: L[p[0]], n: nl[p[0]], why: 'بازمحاسبه با داده تا ' + x.date + ' (ساختار قیمت و ATR جدید؛ ورود هنوز رخ نداده بود)' }); });
        [0, 1, 2].forEach(function (k) { if (Math.abs(nl.tp[k] / L.tp[k] - 1) > 0.005) s.lvlog.push({ at: now, f: 'هدف ' + fa(k + 1, 0), o: L.tp[k], n: nl.tp[k], why: 'بازمحاسبه با داده تا ' + x.date }); });
        s.lv = nl; var ns = x.S.state === 'near' ? 'near' : x.S.state === 'priceok' ? 'priceok' : 'pending'; if (ns !== s.st) { log(s, s.st, ns, ns === 'near' ? 'قیمت ' + fa(x.last) + ' در فاصلهٔ نیم ATR از سطح تأیید' : ns === 'priceok' ? 'قیمت بالای سطح تأیید؛ تأیید شواهد (درجهٔ A/B) هنوز نیست' : 'قیمت از سطح تأیید فاصله گرفت', x.date); s.st = ns; }
      }
      s.upd = now;
    });
    // new entries for opportunities without an active registry entry
    D.opp.forEach(function (x) { if (R.sig.some(function (s) { return s.key === x.key && ACTIVE[s.st]; })) return; var Xs = X.zmap[x.key].R.X;
      var s = { id: x.key + '@' + Xs.d[Xs.n - 1], key: x.key, sym: x.sym, cls: x.cls, d0: Xs.d[Xs.n - 1], d0fa: x.date, created: now, upd: now, hz: x.hz.days, grade: x.grade, st: x.S.state === 'confirmed' ? 'confirmed' : x.S.state === 'near' ? 'near' : x.S.state === 'priceok' ? 'priceok' : 'pending',
        lv: { confirm: x.S.bull.confirm, lo: x.S.bull.lo, hi: x.S.bull.hi, entry: x.S.bull.entry, stop: x.S.bull.stop, tp: x.S.bull.tp.slice(), type: x.S.bull.type, atr: x.S.atr }, hist: [], lvlog: [],
        p0: x.last, dir: 'up', path0: x.path.st, act0: x.act ? x.act.fa : '', h: x.hk, strat: x.gate && x.gate.k ? x.gate.k : 'none', valId: x.gate ? x.gate.valId : null, sid: x.gate ? x.gate.sigId : null, gate0: x.gate ? x.gate.code : null, eng: ENG_VER, mk: x.mk };
      s.lv0 = JSON.parse(JSON.stringify(s.lv));   // the original call is kept as issued; it is never rewritten
      if (s.st === 'confirmed') s.dIn = s.d0; R.sig.push(s); log(s, '—', s.st, 'فرصت جدید: ' + x.mk + '، اطمینان ' + fa(x.conf, 0) + '٪، درجه ' + x.grade + '، بازده به ریسک ' + fa(x.rr, 1), x.date); });
    if (R.sig.length > 1500) { R.arch = (R.arch || 0) + (R.sig.length - 1500); R.sig = R.sig.filter(function (s) { return ACTIVE[s.st]; }).concat(R.sig.filter(function (s) { return !ACTIVE[s.st]; }).slice(-(1500 - R.sig.filter(function (s) { return ACTIVE[s.st]; }).length))); }   // browser storage cap; the count of archived calls is kept
    if (R.log.length > 1500) R.log.splice(0, R.log.length - 1500);
    try { Ust.set(DKEY, R); } catch (e) { /* storage full: tracking continues in memory */ }
    var map = {}; R.sig.forEach(function (s) { if (ACTIVE[s.st]) map[s.key] = s; });
    // accountability: every issued call, never deleted or rewritten, scored against what happened
    var cl = R.sig.filter(function (s) { return !ACTIVE[s.st]; }), grp = function (key) { var o = {}; R.sig.forEach(function (s) { var k = s[key] || '—'; var g = o[k] = o[k] || { n: 0, closed: 0, dirOK: 0, tgt: 0, stop: 0, noEntry: 0, missed: 0 }; g.n++; if (!ACTIVE[s.st]) { g.closed++; if (s.dirOK) g.dirOK++; if (s.maxT) g.tgt++; if (s.st === 'stopped') g.stop++; if (!s.dIn) g.noEntry++; } if (s.wasMissed) g.missed++; }); return o; };
    var errs = {}; cl.forEach(function (s) { var k = s.st === 'stopped' ? 'حد ضرر پس از ورود' : s.st === 'invalid' && !s.dIn ? 'ابطال پیش از ورود' : s.st === 'expired' && !s.dIn ? 'تأیید نشد تا پایان افق' : s.st === 'expired' ? 'خروج زمانی بدون هدف' : null; if (k) errs[k] = (errs[k] || 0) + 1; });
    var acc = { issued: R.sig.length, closed: cl.length, dirOK: cl.filter(function (s) { return s.dirOK; }).length, dirKnown: cl.filter(function (s) { return s.dirOK != null; }).length, tgt: cl.filter(function (s) { return s.maxT; }).length, t2: R.sig.filter(function (s) { return s.maxT >= 2; }).length, stop: cl.filter(function (s) { return s.st === 'stopped'; }).length,
      noEntry: cl.filter(function (s) { return !s.dIn; }).length, missed: R.sig.filter(function (s) { return s.wasMissed; }).length, byMk: grp('mk'), byStrat: grp('strat'), errs: errs };
    D.items.forEach(function (x) { x.track = map[x.key] || null; });
    return { sig: R.sig, log: R.log, acc: acc, active: R.sig.filter(function (s) { return ACTIVE[s.st]; }), closed: R.sig.filter(function (s) { return !ACTIVE[s.st]; }).slice(-30).reverse() };
  }
  /* risk & allocation over the opportunity list (same account settings as the signal cards) */
  function deskRisk(D, X, E) {
    var ac = E.acct || {}, eq = Number(ac.equity), rp = Number(ac.riskPct) || 0.01, maxPos = Number(ac.maxPosPct) || 0.15, heat = Number(ac.maxHeat) || 0.06;
    var rows = D.opp.map(function (x) { var c = x.c, stopD = x.risk, pos = isF(stopD) && stopD > 0 ? Math.min(rp / stopD, maxPos) : NaN, z = X.zmap[x.key], val20 = z && z.R.X.val ? mean(z.R.X.val.slice(-20)) : NaN;
      var hold = isF(x.vol) ? x.vol * Math.sqrt((x.hz ? x.hz.days : 40) / 252) : NaN;
      return { x: x, riskPct: rp, posPct: pos, capital: isF(eq) && isF(pos) ? eq * pos : NaN, maxLoss: isF(eq) ? eq * rp : NaN, liq: x.cls === 'stock' || x.cls === 'fund' ? (isF(val20) ? val20 / 1e9 : NaN) : NaN, liqOK: c.liqOK !== false, hold: hold }; });
    var conc = {}; rows.forEach(function (r) { conc[r.x.mk] = (conc[r.x.mk] || 0) + (isF(r.posPct) ? r.posPct : 0); });
    var top = D.opp.slice(0, 6), corr = top.map(function (a) { return top.map(function (b) { if (a === b) return 1; try { return corrOf(X.zmap[a.key], X.zmap[b.key], 60); } catch (e) { return NaN; } }); });
    var tot = rows.reduce(function (s, r) { return s + (isF(r.posPct) ? rp : 0); }, 0);
    return { rows: rows, conc: conc, corr: corr, corrNames: top.map(function (x) { return x.sym; }), heat: tot, heatMax: heat, overHeat: tot > heat, eq: eq };
  }

  function decide(X, E, U) {
    var db = E.val && E.val.db && !E.val.db.sample ? E.val.db : null, cards = X.cards.filter(function (c) { return c.cls !== 'option' && !c.sample && X.zmap[c.key]; }), all = cards.map(function (c) { return forecastAsset(c, X.zmap[c.key], false, db); });
    var by = {}; all.forEach(function (f) { var k = f.cls === 'fund' ? 'stock' : f.cls; (by[k] = by[k] || { n: 0, up: 0, down: 0, flat: 0 }); by[k].n++; by[k][f.dir]++; });
    all.forEach(function (f) { var g = GW[f.grade] || 0.25; f.score = f.dir === 'up' && isF(f.expRet) && f.expRet > 0 ? g * f.conf / 100 * f.expRet / Math.max(0.01, Math.abs(isF(f.down20) ? f.down20 : 0.05)) : (!db && f.dir === 'up' ? 1e-6 * f.conf : NaN); f.noEvidence = !db; });
    var DK = deskBuild(X, E, all, db), ranked = DK.opp.map(function (x) { return x.f; });
    try { DK.track = deskTrack(DK, X, E); } catch (e) { DK.track = null; DK.trackErr = e.message; }
    // again, now with the registry entry (issue price) attached
    DK.items.forEach(function (x) { try { x.v6 = sigView(x, E, X.zmap[x.key]); okOnlyIfElig(x); } catch (e) { /* keep the earlier view */ } });
    // the registry's issue price can turn a call into «entry missed» or expired: such calls leave the opportunity list here too, so every view agrees
    var drop = DK.opp.filter(function (x) { var v = x.v6; return v && (v.st === 'exp' || v.st === 'nodata' || v.st === 'rej' || v.en === 'missed'); });
    if (drop.length) { drop.forEach(function (x) { x.elig = false; x.notWhy.push(x.v6.stFa + ': ' + x.v6.why.split('؛')[0]); });
      DK.opp = DK.opp.filter(function (x) { return x.elig; }); DK.top10 = DK.opp.slice(0, 10); ranked = DK.opp.map(function (x) { return x.f; }); }
    try { DK.risk = deskRisk(DK, X, E); } catch (e) { DK.risk = null; }
    var top = DK.opp.map(function (x) { var f2 = forecastAsset(x.c, X.zmap[x.key], true, db); f2.score = x.score; f2.desk = x; x.prob = f2.prob || []; return f2; });
    top.forEach(function (f, i) { f.rank = i + 1; f.vs = []; });
    top.sort(function (a, b) { return (b.confirmed - a.confirmed) || 0; });
    var days = top[0] && isF(top[0].expDays) ? top[0].expDays * 7 / 5 : 28, cr = isF(E.cashRate) ? E.cashRate : NaN, cashRet = isF(cr) ? cr * days / 365 : NaN;
    var urgent = []; (X.mon || []).forEach(function (m) { if (m.lvl !== 'crit' && !/^خروج|^فروش/.test(m.act || '')) return; urgent.push({ asset: m.p.asset, action: /^فروش یک‌سوم/.test(m.act) ? 'فروش بخشی (هدف ۱)' : /کاهش/.test(m.act) ? 'خروج یا کاهش' : 'خروج', why: m.act }); });
    // cross-market gold strategy XG1: confirmed buys join the same ranking
    (X.xg && X.xg.inst || []).filter(function (o) { return o.signal === 'buy'; }).forEach(function (o) { var oo = o.ev && o.ev.oos || {}, rf = o.now.last > o.now.stop ? (o.now.last - o.now.stop) / o.now.last : NaN;
      top.unshift({ key: 'xg:' + o.key, sym: o.name, name: o.name, cls: 'gold', last: o.now.last, dir: 'up', long: 'unknown', longBasis: '—', conf: 100, grade: o.grade, confirmed: true, label: 'سیگنال تأییدشده بین‌بازاری XG1 (درجه ' + o.grade + ')', r20: null, prob: [], expRet: isF(oo.avgR) && isF(rf) ? oo.avgR * rf : NaN, expN: oo.n || 0, riskFrac: rf, down20: NaN, drivers: ['حباب ' + pct(o.now.prem, 1) + ' زیر میانگین خودش (' + pct(o.now.premMean, 1) + ')'], against: [],
        confirm: 'حباب به میانگین برگردد (هدف ' + fa(o.now.target, 0) + ')', invalid: 'بسته‌شدن زیر ' + fa(o.now.stop, 0), toSignal: 'سیگنال تأییدشده است.', scen: [{ k: 'اصلی', act: 'خرید؛ هدف ' + fa(o.now.target, 0) + '، حد ضرر ' + fa(o.now.stop, 0) }, { k: 'جایگزین', act: 'بسته‌شدن زیر ' + fa(o.now.stop, 0) + ' = خروج' }], vs: [] }); });
    top.forEach(function (f, i) { f.rank = i + 1; });
    var best;
    if (urgent.length) best = { kind: 'urgent', text: 'اول: ' + urgent[0].action + ' ' + urgent[0].asset, why: urgent[0].why };
    else if (top.length && top[0].confirmed) best = { kind: 'buy', f: top[0], text: 'خرید ' + top[0].sym + ' (' + CLSFA[top[0].cls] + ')', why: 'سیگنال تأییدشده با درجهٔ ' + top[0].grade + '؛ بالاترین جذابیت میان ' + fa(ranked.length, 0) + ' گزینهٔ دارای دید صعودی و شواهد مثبت.' };
    else if (top.length && (!isF(cashRet) || !isF(top[0].expRet) || top[0].expRet > cashRet)) best = { kind: 'conditional', f: top[0], text: 'خرید مشروط ' + top[0].sym + ' (' + CLSFA[top[0].cls] + ')', why: 'جذاب‌ترین گزینه میان ' + fa(all.length, 0) + ' دارایی بررسی‌شده؛ ولی هنوز سیگنال تأییدشده نیست. فعال‌شدن: ' + top[0].confirm + '. ' + top[0].toSignal };
    else best = { kind: 'cash', text: 'نگه‌داری نقد', why: !top.length ? 'هیچ دارایی با دید صعودی و امید ریاضی مثبت در بک‌تست پیدا نشد (از ' + fa(all.length, 0) + ' دارایی).' : 'بازده مورد انتظار بهترین گزینه (' + top[0].sym + ': ' + pct(top[0].expRet, 2) + ' در هر معامله) کمتر از نقد با نرخ ' + pct(cr, 1) + ' در همان مدت (' + pct(cashRet, 2) + ') است.' };
    best.cashRet = cashRet; best.cashRate = cr; best.reinvest = top.length ? 'سرمایه‌گذاری مجدد وقتی جذاب می‌شود که ' + top[0].sym + ': ' + top[0].confirm + ' و درجهٔ اعتبار به B برسد.' : 'وقتی دست‌کم یک دارایی دید صعودی و امید ریاضی مثبت پیدا کند.';
    // market-level views
    var pf = function (name, rows) { if (!rows || rows.length < 300) return null; try { var F = indexForecast(rows, { h: [5, 20] }); return F.H.filter(function (q) { return q.ok; }).map(function (q) { return { h: q.h, p: q.p, skill: q.skill }; }); } catch (e) { return null; } };
    var mk = [];
    var ix = X.ixf && X.ixf.H ? X.ixf.H.filter(function (q) { return q.ok; }) : [], st = by.stock;
    mk.push({ name: 'سهام ایران', dir: st ? (st.up > st.down * 1.3 ? 'up' : st.down > st.up * 1.3 ? 'down' : 'flat') : 'none', note: st ? 'دید موتور: ' + fa(st.up, 0) + ' صعودی، ' + fa(st.down, 0) + ' نزولی، ' + fa(st.flat, 0) + ' خنثی از ' + fa(st.n, 0) + ' نماد' + (ix.length ? '؛ شاخص کل تا ۲۰ روز: ' + pct(ix[ix.length > 1 ? 1 : 0].p, 0) + ' احتمال بالاتر' + (ix[ix.length > 1 ? 1 : 0].skill ? '' : ' (نرخ پایه)') : '') : 'داده ندارد' });
    var one = function (name, keys) { var fs = all.filter(function (f) { return keys.indexOf(f.key.replace(/^[a-z]+:/, '')) > -1 || keys.indexOf(f.sym) > -1; }); if (!fs.length) return mk.push({ name: name, dir: 'none', note: 'داده ندارد' });
      var u = fs.filter(function (f) { return f.dir === 'up'; }).length, d = fs.filter(function (f) { return f.dir === 'down'; }).length; mk.push({ name: name, dir: u > d ? 'up' : d > u ? 'down' : 'flat', note: fs.map(function (f) { return f.sym + ' ' + DIRFA[f.dir]; }).join('، ') }); };
    one('ارز', ['price_dollar_rl', 'crypto-tether-irr', 'price_eur', 'price_aed']); one('طلا و سکه', ['geram18', 'sekee', 'ons', 'geram24', 'mesghal']);
    var GM = Hub.globalMkt ? Hub.globalMkt.rowsAll() : [], pickS = function (ids) { for (var i = 0; i < ids.length; i++) { var o = GM.filter(function (g) { return g.id === ids[i]; })[0]; if (o && o.rows.length >= 30) return o; } return null; };
    [['رمزارز (بیت‌کوین)', ['g:btc', 'lv:crypto-bitcoin']], ['نفت (برنت)', ['g:brent', 'lv:oil_brent']], ['نرخ بهرهٔ آمریکا (بازده ۱۰ ساله)', ['g:ust10']], ['فلزات صنعتی (مس)', ['g:copper']]].forEach(function (q) {
      var o = pickS(q[1]); if (!o) return mk.push({ name: q[0], dir: 'none', note: 'داده دریافت نشده؛ «به‌روزرسانی همهٔ بخش‌ها» را بزنید' + (/g:brent/.test(q[1][0]) ? ' (برای نفت کلید Alpha Vantage یا TGJU لازم است)' : /g:copper/.test(q[1][0]) ? ' (منبع مس: CNBC)' : '') });
      var v = seriesView(o); mk.push({ name: q[0], dir: v.dir, note: v.why + ' · ' + v.src + ' · داده تا ' + shamsi(v.date) + (v.prob.length ? ' · احتمال بالاتر بودن ۲۰ روز: ' + pct(v.prob[v.prob.length - 1].p, 0) + (v.prob[v.prob.length - 1].skill ? '' : ' (نرخ پایه)') : ''), view: v }); });
    if (!db) best.why += ' (اعتبارسنجی اجرا نشده: رتبه‌بندی فقط بر پایهٔ قدرت پیش‌بینی است، بدون شواهد بک‌تست.)'; else if (X.valState === 'stale') best.why += ' (شواهد بک‌تست مربوط به تنظیمات قبلی است؛ دوباره اعتبارسنجی کنید.)';
    best.urgent = urgent;
    return { best: best, top: top, ranked: ranked.length, screened: all.length, by: by, markets: mk, all: all, desk: DK };
  }
  var DIRFA = { up: 'صعودی', down: 'نزولی', upw: 'ضعیف صعودی', downw: 'ضعیف نزولی', flat: 'خنثی', none: 'بدون داده', unknown: 'نامشخص' }, CLSFA = { stock: 'سهام', fund: 'صندوق', gold: 'طلا', fx: 'ارز', option: 'اختیار', crypto: 'رمزارز', commodity: 'کالا و انرژی', intl: 'شاخص‌های جهانی' };

  /* ---------------- multi-market layer: registry of what is covered, and the central ranking of markets ---------------- */
  var MARKETS = [
    { id: 'stock', fa: 'سهام و صندوق‌های بورس و فرابورس ایران', cls: ['stock', 'fund'], data: 'TSETMC: تاریخچهٔ روزانه، جریان پول حقیقی/حقوقی، دامنهٔ نوسان', bt: 'بک‌تست معاملاتی (موتور بازار)' },
    { id: 'gold', fa: 'طلا و سکه (داخلی) و اونس جهانی', cls: ['gold'], data: 'TGJU: سری‌های روزانه', bt: 'بک‌تست معاملاتی؛ نرخ بهرهٔ واقعی، DXY و انتظارات تورمی در موتور نیست' },
    { id: 'fx', fa: 'ارز بازار آزاد ایران و تتر', cls: ['fx'], data: 'TGJU: سری‌های روزانه', bt: 'بک‌تست معاملاتی؛ اختلاف نرخ بهره و سیاست بانک مرکزی در موتور نیست' },
    { id: 'option', fa: 'اختیار معامله (بورس ایران)', cls: ['option'], data: 'عکس لحظه‌ای تابلوی TSETMC؛ تاریخچهٔ قراردادها ذخیره نمی‌شود', bt: 'ممکن نیست (بدون تاریخچه) ← همیشه تأییدنشده' },
    { id: 'intl', fa: 'سهام و ETF بین‌المللی، شاخص‌های جهانی', cls: [], data: 'FMP / Alpha Vantage برای مدل‌های ارزش‌گذاری وصل است؛ به موتور سیگنال وصل نیست', bt: 'انجام نشده' },
    { id: 'forex', fa: 'فارکس، جفت‌ارزهای جهانی و DXY', cls: [], data: 'در موتور نیست', bt: 'انجام نشده' },
    { id: 'crypto', fa: 'رمزارزها', cls: [], data: 'بیت‌کوین فقط به‌عنوان یک سری در «تحلیل اقتصاد ایران» (کلید TGJU آن تأییدنشده)؛ Funding Rate، Open Interest، تسویه و آن‌چین در موتور نیست', bt: 'انجام نشده' },
    { id: 'commodity', fa: 'نفت، گاز، فلزات و کالاهای کشاورزی', cls: [], data: 'نفت برنت فقط به‌عنوان یک سری در «تحلیل اقتصاد ایران» (کلید TGJU تأییدنشده)؛ موجودی انبار، هزینهٔ تولید و آب‌وهوا نیست', bt: 'انجام نشده' },
    { id: 'debt', fa: 'اوراق بدهی و نرخ بهره', cls: [], data: 'ابزار قیمت‌گذاری و ytm هست؛ تاریخچهٔ قیمت اوراق و منحنی بازده در موتور سیگنال نیست', bt: 'انجام نشده' },
    { id: 'futures', fa: 'قراردادهای آتی', cls: [], data: 'در موتور نیست', bt: 'انجام نشده' }];
  // central engine: which market has the better confirmed opportunity now (only markets the engine covers)
  function rankMarkets(cards, db, list, E, xg) {
    var th = Object.assign({}, VTH, E.val && E.val.th), M = {};
    var get = function (c) { return M[c] = M[c] || { cls: c, assets: 0, A: 0, B: 0, gated: 0, best: null }; };
    list.forEach(function (z) { get(z.a.cls).assets++; });
    cards.forEach(function (c) { var m = get(c.cls); if (c.cls === 'option') m.assets++;
      if (c.candidate) m.gated++;
      if ((c.type === 'long' || c.type === 'short') && c.val && (c.val.grade === 'A' || c.val.grade === 'B')) { m[c.val.grade]++; var sc = (c.val.grade === 'A' ? 1000 : 0) + c.conf; if (!m.best || sc > m.best.sc) m.best = { c: c, sc: sc }; } });
    var rows = Object.keys(M).map(function (k) { var m = M[k], p = db && db.pools && db.pools['c:' + k]; m.score = 2 * m.A + m.B; m.pool = p && p.n ? { n: p.n, oosN: p.oos && p.oos.n, oosAvgR: p.oos && p.oos.avgR } : null; return m; })
      .sort(function (a, b) { return b.score - a.score || ((b.pool && b.pool.oosAvgR) || -9) - ((a.pool && a.pool.oosAvgR) || -9); });
    var xgr = null; if (xg && xg.inst) { xgr = { cls: 'xgold', assets: xg.inst.length, A: 0, B: 0, gated: 0, best: null, pool: null, score: 0, x: true };
      xg.inst.forEach(function (o) { if (o.signal === 'buy') { xgr[o.grade]++; if (!xgr.best || o.grade < xgr.best.g) xgr.best = { g: o.grade, o: o }; } else if (o.signal === 'unconfirmed') xgr.gated++; });
      xgr.score = 2 * xgr.A + xgr.B; rows.push(xgr); rows.sort(function (a, b) { return b.score - a.score; }); }
    var xtop = xg && xg.inst ? xg.inst.filter(function (o) { return o.signal === 'buy'; }) : [];
    var top = cards.filter(function (c) { return (c.type === 'long' || c.type === 'short') && c.val && (c.val.grade === 'A' || c.val.grade === 'B'); }).sort(function (a, b) { return a.val.grade.localeCompare(b.val.grade) || b.conf - a.conf || b.rr2 - a.rr2; }).slice(0, 8);
    return { rows: rows, top: top, xtop: xtop, none: !top.length && !xtop.length, th: th };
  }

  /* ---------------- continuous learning: journal → outcomes → patterns → bounded, reviewable changes ----------------
   * Every actionable signal on real data is logged with its plan and the model votes behind it. Later runs replay the
   * bars after the signal (same fill / stop / target / time-exit rules as the back-test) and grade it in R.
   * From closed trades (live journal counts double, out-of-sample back-test trades once) the engine proposes small changes:
   * per-regime model weight multipliers, the confidence floor, regime blocks, a risk throttle. Guards against curve fitting:
   * minimum sample, shrinkage n/(n+30), ±10% per step, bounds 0.5–1.5, every change logged with its evidence and reversible. */
  var LMIN = 20, LN0 = 30, LSTEP = 0.10;
  function journalAdd(J, cards, info) {
    var have = {}, added = 0; J.forEach(function (j) { have[j.k + '|' + j.d + '|' + j.type] = 1; });
    cards.forEach(function (c) {
      if (c.sample || c.cls === 'option' || (c.type !== 'long' && c.type !== 'close') || !c.date) return;
      var key = c.key + '|' + c.date + '|' + c.type; if (have[key]) return; have[key] = 1;
      var vv = {}; (c.votes || []).forEach(function (x) { if (x.v) vv[x.m] = Math.round(x.v * 100) / 100; });
      J.push({ k: c.key, sym: c.sym, cls: c.cls, sector: c.sector, d: c.date, type: c.type, strength: c.strength, status: c.status, conf: Math.round(c.conf), S: Math.round(c.S * 100) / 100, agree: Math.round((c.agree || 0) * 100) / 100, fam: c.fam, rg: c.regime, mk: info && info.market || '',
        lo: c.lo, hi: c.hi, stop: c.stop, tp1: c.tp1, tp2: c.tp2, tp3: c.tp3, close: c.close, atr: c.atr, hz: c.horizon.days, v: vv, st: 'pending', at: Date.now() });
      added++;
    });
    if (J.length > 800) J.splice(0, J.length - 800);          // browser storage is small; the oldest graded signals drop off
    return added;
  }
  function gint(sh) { var J = Hub.jalali, m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(sh || ''); if (!J || !m) return 0; var g = J.d2g(J.j2d(+m[1], +m[2], +m[3])); return g.gy * 10000 + g.gm * 100 + g.gd; }
  function journalEval(J, zmap, E) {
    var cost = Number(E.acct.costPct) || 0, changed = 0;
    J.forEach(function (j) {
      if (j.st === 'closed' || j.st === 'unfilled' || j.st === 'graded') return;
      var z = zmap[j.k]; if (!z) return; var X = z.R.X, I = z.R.I, g = gint(j.d), t0 = X.d.indexOf(g); if (t0 < 0) return;
      var f = X.c[t0] / j.close, n = X.n;                                   // prices may have been re-adjusted since the signal
      if (!isF(f) || f <= 0) f = 1;
      if (j.type === 'close') {                                             // bearish call: was avoiding it right over the next 10 sessions?
        if (n - 1 - t0 < 10) return; var ret = X.c[t0 + 10] / X.c[t0] - 1; j.st = 'graded'; j.ret = ret; j.ok = ret < 0; j.r = -ret / Math.max(j.atr / j.close, 0.005); j.exit = 'avoid'; j.diag = [ret < 0 ? 'قیمت ۱۰ جلسه بعد پایین‌تر بود: پرهیز درست' : 'قیمت ۱۰ جلسه بعد بالاتر بود: پرهیز نادرست']; changed++; return; }
      var lo = j.lo * f, hi = j.hi * f, stop = j.stop * f, tp1 = j.tp1 * f, tp2 = j.tp2 * f, tp3 = j.tp3 * f, e = NaN, ti = -1;
      for (var t = t0 + 1; t < n && t <= t0 + 5; t++) {                      // entry: the zone must trade within 5 sessions
        if (X.h[t] === X.l[t] && X.c[t] > X.c[t - 1]) continue;              // locked limit-up
        if (X.o[t] <= stop) { j.st = 'unfilled'; j.exit = 'gap-below-stop'; j.diag = ['پیش از ورود، قیمت زیر حد ضرر باز شد: سیگنال باطل']; changed++; return; }
        if (X.o[t] >= lo && X.o[t] <= hi) { e = X.o[t]; ti = t; break; }
        if (X.o[t] > hi && X.l[t] <= hi) { e = hi; ti = t; break; }
        if (X.o[t] < lo && X.h[t] >= lo) { e = lo; ti = t; break; }
      }
      if (ti < 0) { if (n - 1 - t0 >= 5) { j.st = 'unfilled'; j.exit = 'no-fill'; j.diag = ['قیمت در ۵ جلسه به محدودهٔ ورود نیامد (سیگنال از دست رفت، نه زیان)']; changed++; } return; }
      var R = e - stop; if (!(R > 0)) { j.st = 'unfilled'; j.exit = 'bad-plan'; changed++; return; }
      var r = 0, left = 1, t1 = false, t2 = false, st = stop, mfe = 0, mae = 0, days = 0, exit = null, tx = ti;
      var shut = function (px, frac, why) { r += frac * ((px - e) / R); left -= frac; if (left <= 1e-9) exit = why; };
      for (t = ti; t < n && !exit; t++) { days++; tx = t;
        var o = X.o[t], h = X.h[t], l = X.l[t], c = X.c[t]; mfe = Math.max(mfe, (h - e) / R); mae = Math.min(mae, (l - e) / R);
        if (t > ti || l <= st) { if (l <= st) { shut(Math.min(t > ti ? o : e, st), left, t2 ? 'trail' : t1 ? 'breakeven' : o < st && t > ti ? 'gap-stop' : 'stop'); continue; } }
        if (!t1 && h >= tp1) { t1 = true; shut(tp1, 1 / 3, 'tp1'); st = Math.max(st, e); }
        if (!exit && t1 && !t2 && h >= tp2) { t2 = true; shut(tp2, 1 / 3, 'tp2'); }
        if (!exit && t2 && h >= tp3) shut(tp3, left, 'tp3');
        if (!exit && t2) st = Math.max(st, hiN(X.c, t, 22) - 3 * I.atr[t]);
        if (!exit && days >= (j.hz || 40) && r + left * ((c - e) / R) < 0.5) shut(c, left, 'time');
      }
      j.e = e / f; j.mfe = mfe; j.mae = mae; j.days = days; j.t1 = t1; j.t2 = t2;
      if (!exit) { j.st = 'open'; j.r = r + left * ((X.c[n - 1] - e) / R); return; }
      j.st = 'closed'; j.r = r - cost * e / R; j.exit = exit; j.rgx = z.R.RG[tx]; j.xd = shamsi(X.d[tx]); j.diag = diagnose(j); changed++;
    });
    return changed;
  }
  // why it worked or failed — rule-based labels from the trade's own record
  function diagnose(j) {
    var d = [], win = j.r > 0;
    if (win) { d.push(j.exit === 'tp3' ? 'هر سه هدف زده شد' : j.t2 ? 'هدف ۲ زده شد و باقی با حد ضرر متحرک بسته شد' : j.t1 ? 'هدف ۱ زده شد؛ باقی در سربه‌سر یا خروج زمانی بسته شد' : 'خروج زمانی با سود کم'); if (j.agree >= 0.8) d.push('هم‌سویی بالای مدل‌ها در ورود'); if (j.rg === 'up') d.push('ورود هم‌جهت با روند صعودی'); }
    else {
      if (j.exit === 'gap-stop') d.push('شکاف قیمتی / صف فروش: خروج پایین‌تر از حد ضرر');
      if ((j.exit === 'stop' || j.exit === 'gap-stop') && j.days <= 3) d.push('حد ضرر در ≤ ۳ جلسه: زمان‌بندی ورود ضعیف یا حد ضرر تنگ');
      if (j.mfe >= 1 && !j.t1) d.push('تا ۱R سود رفت و برگشت: هدف ۱ دور بود');
      if (j.t1) d.push('پس از هدف ۱ برگشت: بخش باقی‌مانده در سربه‌سر بسته شد');
      if (j.rgx && j.rgx !== j.rg && (j.rgx === 'down' || j.rgx === 'crisis' || j.rgx === 'hv')) d.push('تغییر رژیم بازار پس از ورود (' + (REG[j.rg] || j.rg) + ' ← ' + (REG[j.rgx] || j.rgx) + ')');
      if (j.agree < 0.65) d.push('هم‌سویی پایین مدل‌ها در ورود (' + pct(j.agree, 0) + ')');
      if (j.mk === 'down' || j.mk === 'crisis') d.push('ورود خلاف جهت شاخص کل');
      if (j.rg === 'range') d.push('خرید در بازار رنج');
      if (j.exit === 'time') d.push('بی‌رمقی: خروج زمانی بدون حرکت');
      if (!d.length) d.push('زیان عادی در چارچوب برنامه (بدون الگوی مشخص)');
    }
    return d;
  }
  function grp(list, keyFn) { var o = {}; list.forEach(function (x) { var k = keyFn(x); if (k == null) return; (o[k] = o[k] || []).push(x); }); return Object.keys(o).map(function (k) { var s = stats(o[k]); s.k = k; return s; }).sort(function (a, b) { return b.n - a.n; }); }
  function learnStats(J, bt, days) {
    var cut = days ? Date.now() - days * 864e5 : 0, JJ = J.filter(function (j) { return !cut || j.at >= cut; });
    var closed = JJ.filter(function (j) { return j.st === 'closed'; }).map(function (j) { return Object.assign({ d: gint(j.xd || j.d) }, j); });
    var sim = bt && bt.trades ? bt.trades.filter(function (x) { return x.d > bt.split && x.v; }).map(function (x) { return { r: x.r, d: x.d, days: x.days, conf: x.conf, rg: x.rg, v: x.v, agree: x.agree, exit: x.exit, sim: true }; }) : [];
    var ev = closed.map(function (x) { return { t: x, w: 2 }; }).concat(sim.map(function (x) { return { t: x, w: 1 }; }));
    // per model, per regime group: did siding with the model pay?  score = weighted mean of sign(vote) × R (R clipped to −2…+3)
    var M = {}; ev.forEach(function (o) { var t = o.t, gname = RGRP[t.rg] || 'other', r = clamp(t.r, -2, 3); Object.keys(t.v || {}).forEach(function (m) { var v = t.v[m]; if (Math.abs(v) < 0.3) return; var k = m + '|' + gname, a = M[k] = M[k] || { m: m, g: gname, n: 0, w: 0, s: 0, live: 0 }; a.n++; a.w += o.w; a.s += o.w * sgn(v) * r; if (!t.sim) a.live++; }); });
    var models = Object.keys(M).map(function (k) { var a = M[k]; a.edge = a.w ? a.s / a.w : 0; a.shrunk = a.edge * a.n / (a.n + LN0); return a; }).sort(function (p, q) { return q.n - p.n; });
    var reasons = {}; closed.forEach(function (j) { (j.diag || []).forEach(function (d) { var k = d.replace(/\(.*?\)/g, '').trim(); var a = reasons[k] = reasons[k] || { k: k, n: 0, r: 0, win: j.r > 0 }; a.n++; a.r += j.r; }); });
    var tags = {}; JJ.forEach(function (j) { if (j.tag) { var a = tags[j.tag] = tags[j.tag] || { k: j.tag, n: 0, gap: 0, g: 0 }; a.n++; if (isF(j.ar) && isF(j.r)) { a.gap += j.ar - j.r; a.g++; } } });
    var bear = JJ.filter(function (j) { return j.st === 'graded'; });
    return { all: JJ.length, pending: JJ.filter(function (j) { return j.st === 'pending' || j.st === 'open'; }).length, unfilled: JJ.filter(function (j) { return j.st === 'unfilled'; }).length,
      live: stats(closed), sim: stats(sim), mfe: mean(closed.map(function (j) { return j.mfe; })), mae: mean(closed.map(function (j) { return j.mae; })),
      byRegime: grp(closed, function (j) { return j.rg; }), byStrength: grp(closed, function (j) { return j.strength; }), byClass: grp(closed, function (j) { return j.cls; }), byExit: grp(closed, function (j) { return j.exit; }),
      byConf: grp(closed.concat(sim), function (j) { return j.conf >= 75 ? '۷۵+' : j.conf >= 65 ? '۶۵–۷۵' : '۵۵–۶۵'; }), simRegime: grp(sim, function (j) { return j.rg; }), allRegime: grp(closed.concat(sim), function (j) { return j.rg; }),
      models: models, reasons: Object.keys(reasons).map(function (k) { return reasons[k]; }).sort(function (a, b) { return b.n - a.n; }), tags: Object.keys(tags).map(function (k) { return tags[k]; }),
      bear: { n: bear.length, ok: bear.filter(function (j) { return j.ok; }).length }, closed: closed, nEv: ev.length, last20: stats(closed.slice(-20)) };
  }
  function learnPropose(L, E) {
    var P = [], lw = (E.learn && E.learn.wr) || {}, GN = { trend: 'روندی', range: 'رنج', vol: 'پرنوسان', other: 'نامشخص' };
    // only the difference from the regime's average matters: raising every weight together changes nothing
    var gm = {}; L.models.forEach(function (a) { if (a.n < LMIN || BASEW[a.m] == null) return; var o = gm[a.g] = gm[a.g] || { s: 0, k: 0 }; o.s += a.shrunk; o.k++; });
    L.models.forEach(function (a) { if (a.n < LMIN || BASEW[a.m] == null) return; var rel = a.shrunk - gm[a.g].s / gm[a.g].k, cur = (lw[a.g] && lw[a.g][a.m]) || 1, step = clamp(0.5 * rel, -LSTEP, LSTEP), to = Math.round(clamp(cur * (1 + step), 0.5, 1.5) * 100) / 100;
      if (Math.abs(to - cur) < 0.02) return;
      P.push({ id: 'w|' + a.g + '|' + a.m, kind: 'weight', g: a.g, m: a.m, from: cur, to: to, n: a.n, why: 'در ' + fa(a.n, 0) + ' معامله در رژیم ' + GN[a.g] + ' (' + fa(a.live, 0) + ' واقعی)، هم‌رأیی با این مدل به‌طور میانگین ' + fa(a.edge, 2) + 'R ' + (a.edge >= 0 ? 'سود' : 'زیان') + ' داشت (پس از تعدیل نمونه: ' + fa(a.shrunk, 2) + 'R؛ نسبت به میانگین مدل‌ها در همین رژیم: ' + fa(rel, 2) + 'R).' }); });
    L.allRegime.forEach(function (g) { var blocked = E.learn && E.learn.block && E.learn.block[g.k];
      if (!blocked && g.n >= LMIN && g.avgR < -0.15 && g.pf < 0.8) P.push({ id: 'b|' + g.k, kind: 'block', rg: g.k, to: true, n: g.n, why: 'خرید در رژیم «' + (REG[g.k] || g.k) + '»: ' + fa(g.n, 0) + ' معامله، میانگین ' + fa(g.avgR, 2) + 'R، ضریب سود ' + fa(g.pf, 2) + '. پیشنهاد: توقف خرید در این رژیم.' });
      if (blocked && g.n >= LMIN && g.avgR > 0.1) P.push({ id: 'b|' + g.k, kind: 'block', rg: g.k, to: false, n: g.n, why: 'رژیم «' + (REG[g.k] || g.k) + '» دوباره امید ریاضی مثبت دارد (' + fa(g.avgR, 2) + 'R در ' + fa(g.n, 0) + ' معامله). پیشنهاد: برداشتن توقف.' }); });
    var lowB = L.byConf.filter(function (b) { return b.k === '۵۵–۶۵'; })[0], midB = L.byConf.filter(function (b) { return b.k === '۶۵–۷۵'; })[0];
    if (lowB && lowB.n >= LMIN && lowB.avgR < 0 && E.minConf < 65 && (!midB || midB.avgR > lowB.avgR)) P.push({ id: 'c', kind: 'minConf', from: E.minConf, to: Math.min(65, E.minConf + 5), n: lowB.n, why: 'سیگنال‌های با اطمینان ۵۵ تا ۶۵: ' + fa(lowB.n, 0) + ' معامله با میانگین ' + fa(lowB.avgR, 2) + 'R. پیشنهاد: افزایش حداقل اطمینان.' });
    if (lowB && lowB.n >= 2 * LMIN && lowB.avgR > 0.25 && E.minConf > 50) P.push({ id: 'c', kind: 'minConf', from: E.minConf, to: E.minConf - 5, n: lowB.n, why: 'پایین‌ترین بازهٔ اطمینان هم سودده بوده (' + fa(lowB.avgR, 2) + 'R در ' + fa(lowB.n, 0) + ' معامله). پیشنهاد: کاهش حداقل اطمینان برای فرصت بیشتر.' });
    var rm = E.learn && isF(E.learn.riskMult) ? E.learn.riskMult : 1, l20 = L.last20;
    if (l20.n >= 10 && (l20.totR <= -5 || l20.mdd <= -6) && rm > 0.5) P.push({ id: 'r', kind: 'risk', from: rm, to: 0.5, n: l20.n, why: 'در ' + fa(l20.n, 0) + ' معاملهٔ واقعی اخیر: جمع ' + fa(l20.totR, 1) + 'R و حداکثر افت ' + fa(l20.mdd, 1) + 'R. پیشنهاد: نصف‌کردن ریسک هر معامله تا بازگشت عملکرد.' });
    if (l20.n >= 10 && l20.totR >= 3 && l20.mdd > -4 && rm < 1) P.push({ id: 'r', kind: 'risk', from: rm, to: 1, n: l20.n, why: 'عملکرد ' + fa(l20.n, 0) + ' معاملهٔ اخیر بازگشته (جمع ' + fa(l20.totR, 1) + 'R). پیشنهاد: بازگرداندن ریسک عادی.' });
    return P;
  }
  function learnApply(E, props, note) {
    E.learn = E.learn || {}; E.learn.wr = E.learn.wr || {}; E.learn.block = E.learn.block || {}; E.learn.log = E.learn.log || [];
    var before = JSON.stringify({ wr: E.learn.wr, block: E.learn.block, riskMult: E.learn.riskMult, minConf: E.minConf }), ch = [];
    props.forEach(function (p) {
      if (p.kind === 'weight') { (E.learn.wr[p.g] = E.learn.wr[p.g] || {})[p.m] = p.to; ch.push('وزن ' + p.m + ' در رژیم ' + p.g + ': ' + p.from + ' ← ' + p.to); }
      else if (p.kind === 'block') { if (p.to) E.learn.block[p.rg] = true; else delete E.learn.block[p.rg]; ch.push((p.to ? 'توقف خرید در رژیم ' : 'برداشتن توقف رژیم ') + p.rg); }
      else if (p.kind === 'minConf') { E.minConf = p.to; ch.push('حداقل اطمینان: ' + p.from + ' ← ' + p.to); }
      else if (p.kind === 'risk') { E.learn.riskMult = p.to; ch.push('ضریب ریسک: ' + p.from + ' ← ' + p.to); }
    });
    if (ch.length) { E.learn.log.push({ at: Date.now(), ch: ch, before: before, note: note || '' }); if (E.learn.log.length > 60) E.learn.log.shift(); }
    return ch;
  }
  function learnRevert(E) { var L = E.learn && E.learn.log; if (!L || !L.length) return false; var x = L.pop(), b = JSON.parse(x.before); E.learn.wr = b.wr || {}; E.learn.block = b.block || {}; E.learn.riskMult = b.riskMult; if (isF(b.minConf)) E.minConf = b.minConf; return true; }

  /* ---------------- run ---------------- */
  function merge(d, e) { Object.keys(e || {}).forEach(function (k) { if (d[k] && typeof d[k] === 'object' && !Array.isArray(d[k]) && e[k] && typeof e[k] === 'object' && !Array.isArray(e[k])) d[k] = merge(d[k], e[k]); else d[k] = e[k]; }); return d; }

  /* ===================== CENTRAL SIGNAL LAYER (single source of truth) =====================
     One record per asset, built from the decision desk (horizon gate + validation grade + today's price + opportunity screen).
     Every view — dashboard, signals tab, portfolio construction, signal-only, full systematic, the stock tool — reads it.
     The signal is one; the action depends on whether the user holds the asset (directive 15 §4, note). */
  var ACT8 = { buy: 'خرید', scale: 'خرید پله‌ای', hold: 'نگهداری', reduce: 'کاهش موقعیت', sell: 'فروش', close: 'بستن موقعیت', none: 'عدم اقدام', wait: 'انتظار برای تأیید' };
  function actOf(x, pos) {
    var v = x.v6 || {}, st = v.st, c = x.c, bear = x.dir === 'down' || c.type === 'close' || c.type === 'short', p = x.path && x.path.st;
    if (pos) {   // the user holds it: the decision is about the position
      if (p === 'invalid' || v.en === 'stop') return ['close', 'حد ضرر یا شرط ابطال فعال شده است: موقعیت را کامل ببندید.'];
      if (bear && c.strength === 'قوی') return ['sell', 'سیگنال فروش قوی و معتبر روی دارایی‌ای که دارید: خروج کامل.'];
      if (bear) return ['reduce', 'دید نزولی با قدرت متوسط: بخشی از موقعیت را کم کنید و حد ضرر را نزدیک کنید.'];
      if (p === 'target') return ['reduce', 'هدف قیمتی محقق شده: بخشی را بفروشید و حد ضرر را به نقطهٔ ورود ببرید.'];
      if (x.tz && x.tz.side === 'up' && x.tz.state === 'confirmed') return ['reduce', 'برگشت نزولی در محدودهٔ سقف احتمالی (' + fa(x.tz.zone[0]) + '–' + fa(x.tz.zone[1]) + ') تأیید شد: بخشی را بفروشید (ذخیرهٔ سود) و حد ضرر باقی را ' + fa(x.tz.stop) + ' بگذارید.'];
      if (st === 'ok' && v.en === 'in') return ['scale', 'سیگنال خرید معتبر و قیمت در محدودهٔ ورود: افزایش تدریجی موقعیت مجاز است.'];
      if (x.tz && x.tz.side === 'up' && x.tz.state === 'inZone') return ['hold', 'قیمت داخل محدودهٔ سقف احتمالی (' + fa(x.tz.zone[0]) + '–' + fa(x.tz.zone[1]) + '): نگهداری و بررسی ذخیرهٔ سود؛ فروش فقط با بسته‌شدن زیر ' + fa(x.tz.conf) + ' (تأیید برگشت نزولی).'];
      return ['hold', 'شرط خروج فعال نیست: موقعیت را با حد ضرر ' + fa(x.S && x.S.bull ? x.S.bull.stop : c.stop) + ' نگه دارید.'];
    }
    if (bear) return ['none', 'سیگنال فروش/نزولی است و این دارایی را ندارید: خرید نکنید.' + (x.tz && x.tz.side === 'down' && x.tz.zone ? ' انتظار برای تکمیل اصلاح: کف احتمالی ' + fa(x.tz.zone[0]) + '–' + fa(x.tz.zone[1]) + '؛ شرط خرید: بسته‌شدن بالای ' + fa(x.tz.conf) + ' پس از رسیدن به این محدوده.' : '')];
    if (st === 'ok') return v.en === 'in' && c.strength !== 'قوی' ? ['scale', 'معتبر، قیمت در محدودهٔ ورود، قدرت متوسط: ورود پله‌ای (نیمی اکنون، نیمی پس از تأیید).'] : ['buy', 'معتبر و قیمت در محدودهٔ ورود: ورود با سفارش محدود.'];
    if (st === 'cond') return ['wait', v.why || 'یک یا چند شرط هنوز برقرار نیست.'];
    if (st === 'review') return ['wait', v.en === 'above' ? 'قیمت بالاتر از محدودهٔ ورود است: منتظر اصلاح قیمت بمانید.' : (v.why || 'نیازمند ارزیابی مجدد.')];
    return ['none', v.why || 'شرایط کافی برای معامله نیست.'];
  }
  /* ---- directive 15: readiness tier, traceable reason for «no buy», full trading levels per asset ----
     tiers (buy side): ok = confirmed · wait = attractive but a condition is missing · floor = near / inside the probable bottom zone, reversal not confirmed · none.
     The tier never upgrades a signal: «ok» is exactly the central «confirmed» verdict; the other tiers only make the potential visible. */
  var TIERFA = { ok: 'فرصت خرید تأییدشده', wait: 'فرصت خرید در انتظار تأیید', floor: 'در محدودهٔ احتمالی کف (برگشت تأیید نشده)', none: 'فاقد فرصت خرید معتبر', pos: 'موقعیت باز (شما دارید)' };
  var RCFA = { data: 'داده ناقص یا قدیمی', trend: 'روند نزولی و عدم تأیید برگشت', momentum: 'روند بی‌جهت / مومنتوم ضعیف', valNone: 'اعتبارسنجی (بک‌تست) اجرا نشده یا قدیمی است',
    model: 'نبود استراتژی آزموده یا عملکرد ضعیف مدل در شرایط مشابه', noEntry: 'نبود نقطهٔ ورود (شرط ورود استراتژی برقرار نشده)', above: 'قیمت بالاتر از محدودهٔ ورود (ورود ازدست‌رفته)',
    rr: 'نسبت بازده به ریسک نامناسب', liq: 'نقدشوندگی پایین', risk: 'ریسک بالای بازار (رژیم بحرانی)', exec: 'محدودیت اجرا (صف یا قفل دامنه)', conf: 'اطمینان مدل کمتر از حداقل',
    expired: 'سیگنال قبلی منقضی یا باطل شده', grade: 'درجهٔ اعتبارسنجی سیگنال کمتر از B', tf: 'عدم هم‌جهتی افق‌های زمانی' };
  // the five root causes of the directive, for the «why no buy» diagnosis
  var CAUSE = { data: 'data', valNone: 'tech', model: 'filter', grade: 'filter', conf: 'filter', rr: 'filter', noEntry: 'market', above: 'market', trend: 'market', momentum: 'market', tf: 'market', liq: 'market', risk: 'market', exec: 'market', expired: 'market' };
  var CAUSEFA = { market: 'شرایط واقعی بازار (روند، نقطهٔ ورود، نقدشوندگی)', filter: 'سخت‌گیری فیلترها و دروازهٔ اعتبار مدل', data: 'نقص داده', coverage: 'محدودیت پوشش دارایی‌ها', tech: 'خطای ارتباط ماژول‌ها / اعتبارسنجی اجرانشده' };
  function rcOf(x, r) {
    var v = x.v6 || {}, g = x.gate || {}, c = x.c || {}, why = function (t) { return String(t || '').replace(/[.؛\s]+$/, ''); };
    if (r.st === 'ok') return null;
    if (r.st === 'nodata' || c.sample || (isF(c.age) && c.age > 96)) return { k: 'data', t: why(v.why) };
    if (g.view === 'down') return { k: 'trend', t: 'افق ' + (g.fa || '') + ' نزولی است' + (x.tz && x.tz.side === 'down' && x.tz.zone ? '؛ برگشت تأیید نشده (تأیید: بسته‌شدن بالای ' + fa(x.tz.conf) + ')' : '') };
    if (g.view === 'flat' || g.view === 'none') { var hv = x.hzs || {}, ups = ['s', 'm', 'l'].filter(function (h) { return hv[h] && hv[h].view === 'up'; }).map(function (h) { return hv[h].fa; });
      return ups.length ? { k: 'tf', t: 'افق ' + (g.fa || '') + ' بی‌جهت است ولی ' + ups.join(' و ') + ' صعودی' } : { k: 'momentum', t: 'افق ' + (g.fa || '') + ' جهت روشنی ندارد' }; }
    var f = (g.chk || []).filter(function (q) { return !q.ok; })[0];
    if (f) { var m = { data: 'data', strat: 'model', recent: 'model', cond: 'noEntry', dup: 'expired', rr: 'rr' }[f.c];
      if (f.c === 'bt' || (f.c === 'strat' && /اجرا نشده/.test(f.t))) m = /اجرا نشده|قدیمی|تغییر کرده|نمونه/.test(f.t) ? 'valNone' : 'model';
      if (f.c === 'exec') m = /نقدشوندگی/.test(f.t) ? 'liq' : /بحرانی/.test(f.t) ? 'risk' : 'exec';
      return { k: m || 'model', t: why(f.t) }; }
    if (r.st === 'exp') return { k: 'expired', t: why(v.why) };
    if (v.en === 'missed' || v.en === 'above') return { k: 'above', t: why(v.why) };
    if (c.candidate && r.st === 'cond') return { k: 'grade', t: why(v.why) };
    var nw = (x.notWhy || []).join('، ');
    if (/اطمینان/.test(nw)) return { k: 'conf', t: nw }; if (/بازده به ریسک/.test(nw)) return { k: 'rr', t: nw }; if (/قدیمی|نمونه/.test(nw)) return { k: 'data', t: nw };
    return { k: 'noEntry', t: why(v.why) || nw || 'شرط ورود برقرار نیست' };
  }
  function tierOf(x, r) {
    if (x.pos) return 'pos';
    if (r.st === 'ok' && (r.act === 'buy' || r.act === 'scale')) return 'ok';
    if (r.st === 'nodata') return 'none';
    var t = x.tz, v = x.v6 || {}, ps = x.path && x.path.st, hv = x.hzs || {};
    if (t && t.side === 'down' && t.zone && (t.state === 'inZone' || t.state === 'confirmed' || (t.state === 'approach' && isF(t.atr) && t.px - t.zone[1] <= t.atr))) return 'floor';
    if (r.st === 'exp') return 'none';   // the setup's validity ended (confirmation too old, stop or target reached): a new setup is needed first
    var bull = x.dir === 'up' || (x.c && (x.c.type === 'long' || (x.c.candidate && x.c.candidate.type === 'long'))) || /^(active|retest|near|nc)$/.test(ps || '') || ['s', 'm', 'l'].some(function (h) { return hv[h] && hv[h].view === 'up' && hv[h].code !== 'nodata'; });
    return bull && x.dir !== 'down' ? 'wait' : 'none';
  }
  // the stage of a bottom / top: approaching the zone → waiting for confirmation → confirmed (directive 15 · 2-3)
  function stageOf(t) { if (!t || !t.zone) return null; return { k: t.state === 'confirmed' ? 'conf' : t.state === 'inZone' ? 'await' : t.state === 'broke' ? 'broke' : 'approach',
    fa: t.state === 'confirmed' ? '۳ · تأیید و اقدام' : t.state === 'inZone' ? '۲ · انتظار برای تأیید' : t.state === 'broke' ? 'محدوده شکسته شد (سناریو باطل)' : '۱ · نزدیک شدن به محدوده' }; }
  function levelsOf(x) {
    var S = x.S || {}, b = S.bull || {}, d = S.bear || {}, t = x.tz, pt = x.pt, v = x.v6 || {}, lv = v.lv || null;
    var o = { buy: lv && lv.entry ? [Math.min(lv.entry[0], lv.entry[1]), Math.max(lv.entry[0], lv.entry[1])] : isF(b.lo) ? [b.lo, b.hi] : null, stop: lv ? lv.stop : b.stop, tp: lv && lv.tp ? lv.tp : b.tp || [],
      upConf: b.confirm, upTxt: b.confirmTxt, dnConf: d.confirm, dnTxt: d.confirmTxt, inv: d.invalid, dnTp: d.tp || [], floor: null, ceil: null, sup: [], res: [], tzT: [], win: null, stage: stageOf(t), tzConf: null, tzInv: null, tzStop: null, after: [] };
    if (t) { o.sup = t.sup || []; o.res = t.res || []; if (t.zone) { if (t.side === 'down') o.floor = t.zone; else o.ceil = t.zone; o.tzT = (t.T || []).map(function (q) { return q.p; }); o.tzConf = t.conf; o.tzInv = t.inv; o.tzStop = t.stop; o.after = t.after || []; o.pZone = t.pZone; o.pFake = t.pFake; o.nTz = t.n; } }
    if (pt && pt.tg && pt.tg[0] && pt.tg[0].w) o.win = { from: pt.tg[0].w.from, to: pt.tg[0].w.to, T1: pt.tg[0].p };
    // a buy zone far above today's price is not a buy zone: it is a breakout plan that only exists once price gets there.
    // Beyond max(2 ATR, 5%) the zone, its stop and its targets are withheld and only the confirmation level is shown with its distance.
    var px = x.last, atr = S.atr, gap = isF(px) && px > 0 ? Math.max(isF(atr) ? 2 * atr : 0, 0.05 * px) : NaN;
    if (o.buy && isF(gap) && o.buy[0] - px > gap) { o.far = { lo: o.buy[0], hi: o.buy[1], dist: o.buy[0] / px - 1, stop: o.stop, tp: (o.tp || []).slice(0, 3) };
      o.farTxt = 'طرح خرید فعلاً وجود ندارد: شرط آن بسته‌شدن بالای ' + fa(o.upConf || o.buy[0]) + ' است که ' + pct(o.buy[0] / px - 1, 1) + ' بالاتر از قیمت فعلی ' + fa(px) + ' است. محدودهٔ ورود، حد ضرر و هدف فقط پس از نزدیک شدن قیمت به این سطح ساخته می‌شوند.';
      o.buy = null; o.stop = null; o.tp = []; }
    // the same guard for a sell plan far below the price, and bear targets that equal today's price
    if (isF(px)) o.dnTp = (o.dnTp || []).filter(function (q) { return isF(q) && q < px * 0.995; });
    return o;
  }
  /* ---------------- execution model (directive 23 · 1) ----------------
     The signal is computed on the reference price (last close / quote, with its time). The order is a limit order at the top of
     the entry zone (pullback) or a buy-stop at the trigger (breakout). Between signal and order the price moves: the fill is
     judged on the asset's own history — the share of past cases in which the next 3 sessions traded through the order price,
     measured in ATR from the close — and the worst fill adds slippage (liquidity tier for TSE, dealer spread for TGJU, venue
     spread for crypto) and is capped by the daily price limit. R:R to target 2 is recomputed at the worst fill. */
  var EXK = 3;
  // highest price at which a long plan still pays the minimum R:R to target 2 after slippage, capped by cap (directive 23 · 1)
  function zoneTop(z, E, stop, tp2, cap) { var mr = Number(E && E.acct && E.acct.minRR) || 1.5, sl = slipOf(z, z && z.a); if (!isF(stop) || !isF(tp2)) return cap; return Math.min(cap, (tp2 + mr * stop) / (1 + mr) / (1 + sl)); }
  function slipOf(z, a) { if (!a) return 0.005; if (a.cls === 'stock' || a.cls === 'fund') { var X = z && z.R && z.R.X, v = X && X.val ? mean(X.val.slice(-20)) : NaN;
      return !isF(v) || v <= 0 ? 0.01 : v >= 1e12 ? 0.001 : v >= 2e11 ? 0.0025 : v >= 5e10 ? 0.005 : 0.01; }
    return a.cls === 'crypto' ? 0.001 : a.cls === 'gold' || a.cls === 'fx' ? 0.005 : 0.003; }
  function fillProb(X, I, t, d, up) { var n = 0, k = 0; for (var i = Math.max(20, t - 500); i < t - EXK; i++) { var a = I.atr[i]; if (!(a > 0)) continue; n++;
      var lvl = up ? X.c[i] + d * a : X.c[i] - d * a; for (var j = 1; j <= EXK; j++) { if (up ? X.h[i + j] >= lvl : X.l[i + j] <= lvl) { k++; break; } } } return n >= 60 ? k / n : NaN; }
  function execOf(R0, x, rec) {
    var z = R0 && R0.zmap && R0.zmap[x.key]; if (!z || !rec || !(rec.px > 0) || x.cls === 'option') return null;
    var L = rec.L || {}, X = z.R.X, I = z.R.I, t = X.n - 1, atr = I.atr[t], E = R0.E || {}, minRR = Number(E.acct && E.acct.minRR) || 1.5, px = rec.px;
    var o = { ref: px, refAt: rec.pxAt || null, refDate: x.date || null, calcAt: Date.now(), slip: slipOf(z, x.c ? z.a : z.a), ok: false, whyNot: '' };
    if (!L.buy || !isF(rec.stop) || !(atr > 0)) { o.whyNot = 'طرح خرید با محدودهٔ ورود و حد ضرر وجود ندارد.'; o.na = true; return o; }
    var lo = Math.min(L.buy[0], L.buy[1]), hi = Math.max(L.buy[0], L.buy[1]), tp2 = (rec.tp || [])[1] || (rec.tp || [])[0], bu = x.S && x.S.bull, brk = bu && bu.type !== 'pullback' && isF(bu.confirm) && px < bu.confirm;
    var LO = limitOf(z.a, E.acct), band = LO.lim ? px * (1 + LO.lim) : Infinity;
    if (brk) { o.type = 'stop'; o.order = bu.confirm; o.typeFa = 'سفارش خرید شرطی (بالای ' + fa(bu.confirm) + ')'; o.worst = Math.min(Math.max(bu.confirm + 0.25 * atr, bu.confirm * (1 + o.slip)), hi, band); o.fillP = fillProb(X, I, t, (bu.confirm - px) / atr, true); }
    else { o.type = 'limit'; o.order = hi; o.typeFa = 'سفارش محدود (Limit) با سقف ' + fa(o.order); o.worst = Math.min(o.order, band); o.fillP = fillProb(X, I, t, (px - o.order) / atr, false); }
    o.atTop = px >= hi - 0.1 * atr && px <= hi + 0.25 * atr; o.passed = px > hi + 0.25 * atr; o.under = px > hi; o.head = (hi - px) / px;
    o.rrWorst = isF(tp2) && o.worst > rec.stop ? (tp2 - o.worst) / (o.worst - rec.stop) : NaN;
    var q = X.lock && X.lock[t]; o.queue = q > 0 ? 'buy' : q < 0 ? 'sell' : null;
    var why = [];
    if (!(o.worst > rec.stop)) why.push('قیمت سفارش ' + fa(o.worst) + ' بالاتر از حد ضرر ' + fa(rec.stop) + ' نیست؛ طرح قابل اجرا نیست.');
    if (o.passed && !(o.fillP >= 0.35)) why.push('قیمت مرجع ' + fa(px) + ' از سقف محدودهٔ ورود ' + fa(hi) + ' عبور کرده است؛ محدوده باید دوباره محاسبه شود.');
    if (isF(o.rrWorst) && o.rrWorst < minRR) why.push('با بدترین قیمت اجرای محتمل ' + fa(o.worst) + ' (لغزش ' + pct(o.slip, 2) + (o.type === 'stop' ? ' و جهش ۰٫۲۵ ATR' : '') + ')، بازده به ریسک تا هدف ۲ به ' + fa(o.rrWorst, 1) + ' می‌رسد که کمتر از حداقل ' + fa(minRR, 1) + ' است.');
    if (isF(o.fillP) && o.fillP < 0.35) why.push('احتمال اجرای سفارش در ' + fa(EXK, 0) + ' جلسهٔ بعد بر پایهٔ تاریخچهٔ همین دارایی ' + pct(o.fillP, 0) + ' است (کمتر از ۳۵٪).');
    if (o.queue === 'buy') why.push('صف خرید در جلسهٔ آخر: سفارش در صف اجرا نمی‌شود.');
    if (o.queue === 'sell') why.push('صف فروش در جلسهٔ آخر.');
    if (o.worst >= band && LO.lim) why.push('قیمت اجرا به سقف دامنهٔ نوسان روزانه (' + pct(LO.lim, 0) + ') می‌رسد.');
    o.ok = !why.length; o.whyNot = why.join(' ');
    /* directive 26 · 2 — every field named, with its unit and basis; nothing shown that the data do not support
       ref      the reference price (last close / live price) and its time
       order    limit: the highest price the buy order accepts (it can fill at or below it, never above); stop: the trigger price
       book     best bid / ask from the TSETMC order book at the time of the session request (stocks and funds only; not live)
       slip     limit: none by construction; stop: the model's estimate from 20-day traded value (not a live measurement)
       cost     the user's round-trip cost setting
       vol      executable size: 10% of the 20-day median traded volume (stocks / funds) and the quantity at the best ask
       normal / adverse fill scenario and the probability of no fill within EXK sessions from the asset's own history */
    var a0 = z.a || {}, bl = a0.bl && a0.bl[0], tse = a0.cls === 'stock' || a0.cls === 'fund', cost = Number(E.acct && E.acct.costPct) || 0;
    var vm = tse && X.v ? (function () { var v = X.v.slice(-20).filter(function (q) { return q > 0; }).sort(function (p, q) { return p - q; }); return v.length ? v[Math.floor(v.length / 2)] : NaN; })() : NaN;
    o.f = { unit: a0.unit || rec.unit || 'ریال', ref: { v: px, at: rec.pxAt || null, kind: rec.pxKind || '', date: x.date || null },
      order: { v: o.order, fa: o.type === 'stop' ? 'قیمت فعال‌سازی سفارش شرطی (خرید وقتی قیمت به این سطح برسد)' : 'قیمت سفارش محدود: بالاترین قیمتی که خرید می‌پذیرد (اجرا در همین قیمت یا پایین‌تر)' },
      dist: o.order / px - 1,
      book: tse && bl && bl[0] > 0 && bl[2] > 0 ? { bid: bl[0], bidQ: bl[1], ask: bl[2], askQ: bl[3], spread: bl[2] / bl[0] - 1, at: a0.blAt || null, t: a0.blT || '' } : null,
      bookWhy: tse && bl && bl[0] > 0 && bl[2] > 0 ? '' : tse ? 'دفتر سفارش این نماد در آخرین دریافت دیده‌بان نبود' : 'برای این بازار (' + (a0.cls === 'crypto' ? 'رمزارز جهانی' : 'بازار آزاد TGJU') + ') دفتر سفارش دریافت نمی‌شود؛ بهترین قیمت خرید و فروش نمایش داده نمی‌شود',
      slip: o.type === 'stop' ? { v: o.slip, fa: 'برآورد مدل از نقدشوندگی ۲۰ جلسه (نه اندازه‌گیری لحظه‌ای) + جهش ۰٫۲۵ ATR در شکست' } : { v: 0, fa: 'سفارش محدود بالاتر از قیمت سفارش اجرا نمی‌شود؛ لغزش منفی ندارد' },
      cost: { v: cost, fa: 'هزینهٔ رفت‌وبرگشت از تنظیمات حساب' },
      vol: tse && isF(vm) ? { v: Math.floor(0.1 * vm), fa: '۱۰٪ میانهٔ حجم روزانهٔ ۲۰ جلسه', ask: bl && bl[3] > 0 ? bl[3] : null } : null,
      normal: o.type === 'stop' ? 'اجرا نزدیک ' + fa(Math.min(o.order * (1 + o.slip), band)) + ' پس از عبور قیمت از ' + fa(o.order) : 'اجرا در ' + fa(o.order) + ' یا پایین‌تر اگر قیمت در ' + fa(EXK, 0) + ' جلسه به این سطح برگردد',
      adverse: o.type === 'stop' ? 'اجرا در ' + fa(o.worst) + ' (لغزش و جهش قیمت)' : 'اجرا نشدن سفارش (قیمت به محدوده برنگردد)؛ در بدترین حالتِ اجرا، همان ' + fa(o.order),
      noFill: isF(o.fillP) ? 1 - o.fillP : NaN };
    o.txt = o.typeFa + '؛ قیمت مرجع ' + fa(px) + (x.date ? ' (' + x.date + ')' : '') + '؛ بدترین اجرای محتمل ' + fa(o.worst) + '؛ احتمال اجرا در ' + fa(EXK, 0) + ' جلسه ' + (isF(o.fillP) ? pct(o.fillP, 0) : 'نامعلوم (تاریخچهٔ کم)') + '؛ R:R در بدترین اجرا ' + (isF(o.rrWorst) ? fa(o.rrWorst, 1) : '—');
    return o;
  }
  /* ---------------- alternative entries and fallback levels (directive 23 · 3-4) ----------------
     When the tested confirmation (close above the 20-session high) is far from the price, three alternatives are evaluated on the
     same R:R rule: (1) structural confirmation — a close above the most recent lower swing high (change of structure, k=3 pivots,
     last 60 sessions); (2) floor reversal — the turning-point floor zone with its own confirmation level; (3) staged — half at the
     structural level, half at the tested level. They are NOT tested strategies: they are scenarios, shown with their distance,
     stop, targets and R:R, and they never make a central «confirmed buy». Supports / resistances missing from the 250-session
     window are taken from the whole history, and only if none exist from ATR multiples (labelled as an estimate). */
  function altOf(R0, x, rec) {
    var z = R0 && R0.zmap && R0.zmap[x.key]; if (!z || !rec || !(rec.px > 0) || x.cls === 'option' || rec.dataBad) return null;
    var X = z.R.X, I = z.R.I, t = X.n - 1, atr = I.atr[t], px = rec.px, E = R0.E || {}, mr = Number(E.acct && E.acct.minRR) || 1.5, L = rec.L || {}; if (!(atr > 0) || X.n < 30) return null;
    var P = tzPivots(X, 3), Hs = P.filter(function (q) { return q.k === 'H'; }), Ls = P.filter(function (q) { return q.k === 'L'; });
    var merge = function (arr, desc) { arr.sort(function (u, v) { return desc ? v - u : u - v; }); var out = []; arr.forEach(function (v) { if (!out.length || Math.abs(v - out[out.length - 1]) >= 0.5 * atr) out.push(v); }); return out; };
    var resAll = merge(Hs.filter(function (q) { return q.p > px * 1.003; }).map(function (q) { return q.p; }), false), supAll = merge(Ls.filter(function (q) { return q.p < px * 0.997; }).map(function (q) { return q.p; }), true);
    var o = { list: [], best: null, atr: atr };
    // fallback supports / resistances (directive 23 · 4)
    if (!(L.sup && L.sup.length)) { if (supAll.length) { o.sup = supAll.slice(0, 3); o.supSrc = 'کف‌های چرخش در کل تاریخچه'; } else { o.sup = [px - atr, px - 2 * atr, px - 3 * atr]; o.supSrc = 'برآورد نوسانی (۱، ۲ و ۳ برابر ATR) — قیمت در کف تاریخی است و حمایت ساختاری ندارد'; } }
    if (!(L.res && L.res.length)) { if (resAll.length) { o.res = resAll.slice(0, 3); o.resSrc = 'سقف‌های چرخش در کل تاریخچه'; } else { o.res = [px + atr, px + 2 * atr, px + 3 * atr]; o.resSrc = 'برآورد نوسانی (۱، ۲ و ۳ برابر ATR) — قیمت در سقف تاریخی است و مقاومت ساختاری ندارد'; } }
    var RES = (L.res && L.res.length ? L.res.map(function (q) { return isF(q) ? q : q && q.p; }) : o.res || []).filter(isF);
    var tgt = function (en, R) { var c2 = RES.concat(resAll).filter(function (v) { return v >= en + R; }).sort(function (a, b) { return a - b; }), t1 = c2[0], src = 'مقاومت ساختاری';
      if (!isF(t1)) { t1 = en + 2 * R; src = 'برآورد ۲R (مقاومت ساختاری بالاتر نیست)'; } var t2 = c2.filter(function (v) { return v >= t1 + 0.5 * R; })[0]; if (!isF(t2)) t2 = Math.max(t1 + R, en + 3 * R); return { tp: [t1, t2], src: src }; };
    var mk = function (k, fa0, en, st, srcTxt) { if (!isF(en) || !isF(st) || en <= st) return; var R = en - st, T = tgt(en, R), rr = (T.tp[1] - en) / R;
      o.list.push({ k: k, fa: fa0, entry: en, stop: st, tp: T.tp, tpSrc: T.src, rr: rr, ok: rr >= mr, dist: en / px - 1, amt: en - px, src: srcTxt }); };
    // (1) structural: the latest lower swing high above the price in the last 60 sessions
    var hs = Hs.filter(function (q) { return q.i >= t - 60 && q.i <= t - 3 && q.p > px * 1.003; }).sort(function (a, b) { return b.i - a.i; })[0];
    var lo10 = Math.min.apply(null, X.l.slice(Math.max(0, t - 9), t + 1));
    if (hs) { o.struct = hs.p; mk('struct', 'تأیید ساختاری: بسته‌شدن بالای آخرین سقف پایین‌تر', hs.p + 0.1 * atr, Math.min(lo10, hs.p - atr) - 0.25 * atr, 'سقف چرخش ' + shamsi(X.d[hs.i]) + ' (' + fa(t - hs.i, 0) + ' جلسه پیش)'); }
    // (2) floor reversal
    if (L.floor && isF(L.tzConf)) mk('floor', 'برگشت از کف احتمالی: بسته‌شدن بالای سطح تأیید کف', L.tzConf, isF(L.tzStop) ? L.tzStop : L.floor[0] - 0.25 * atr, 'محدودهٔ کف ' + fa(L.floor[0]) + '–' + fa(L.floor[1]));
    // (3) tested confirmation (the far plan) and (4) staged
    var tc = L.far ? L.far.lo : isF(L.upConf) ? L.upConf : NaN, tst = L.far ? L.far.stop : rec.stop;
    if (isF(tc) && isF(tst)) mk('tested', 'تأیید آزموده‌شده: شکست سقف ۲۰ جلسه', tc, tst, 'قاعدهٔ بک‌تست‌شدهٔ موتور');
    var s1 = o.list.filter(function (q) { return q.k === 'struct'; })[0], s3 = o.list.filter(function (q) { return q.k === 'tested'; })[0];
    if (s1 && s3 && s3.entry > s1.entry) mk('staged', 'ورود پله‌ای: نیمی در تأیید ساختاری، نیمی در تأیید آزموده‌شده', (s1.entry + s3.entry) / 2, s1.stop, 'میانگین دو پله');
    o.list.sort(function (a, b) { return (b.ok - a.ok) || (a.dist - b.dist); }); o.best = o.list.filter(function (q) { return q.ok; })[0] || null;
    o.upD = isF(L.upConf) ? { pct: L.upConf / px - 1, amt: L.upConf - px } : null; o.dnD = isF(L.dnConf) ? { pct: L.dnConf / px - 1, amt: L.dnConf - px } : null;
    return o;
  }
  /* one trend definition for the whole system (directive 23 · 7): the same three rules (trendView) on any daily series.
     Series in the engine use their analysed history; any other series (indices, TGJU series of the analysis pages, ratios) is run
     through the same rules here, so a market, a horizon and a date always get one trend label everywhere. */
  var TRC = {};
  function trendRows(rows, key) {
    if (!rows || rows.length < 30) return null; var L0 = rows[rows.length - 1], ck = 'TRR|' + (key || '') + '|' + rows.length + '|' + L0.date + '|' + L0.close; if (TRC[ck]) return TRC[ck];
    var X = prep(rows.map(function (r) { return { date: r.date, open: r.open || r.close, high: r.high || r.close, low: r.low || r.close, close: r.close, vol: r.vol || 0, val: r.val || 0 }; })), I = indicators(X), t = X.n - 1;
    var o = { date: X.d[t], n: X.n, s: trendEv(X, I, t, 's'), m: trendEv(X, I, t, 'm'), l: trendEv(X, I, t, 'l') }; TRC[ck] = o; return o; }
  function trendOfZ(z) { if (!z || !z.R) return null; var X = z.R.X, I = z.R.I, t = X.n - 1; return { date: X.d[t], n: X.n, s: trendEv(X, I, t, 's'), m: trendEv(X, I, t, 'm'), l: trendEv(X, I, t, 'l') }; }
  /* what drove a move (directive 26 · 1 note, 5-3, 5-4): tether = world USDT × implied dollar rate (vs the free-market dollar);
     18k gold = ounce × dollar × (1 + bubble); a fund = NAV × (1 + premium). Crypto: the same profile on 1-hour, 4-hour and weekly bars. */
  function moveContext(by, R0) {
    var M = Hub.moves, rows = function (k) { var z = R0.zmap[k]; return z && z.a && !z.a.sample ? z.a.rows : null; }, usd = rows('g:price_dollar_rl'), ons = rows('g:ons');
    var G = Hub.globalMkt, wU = G && G.rowsAll ? (G.rowsAll().filter(function (o) { return o.id === 'g:usdt'; })[0] || {}).rows : null;
    var R = Hub.tseRegistry && Hub.tseRegistry.get ? Hub.tseRegistry.get() : null, codeOf = {}; if (R && R.ins) Object.keys(R.ins).forEach(function (cd) { codeOf['s:' + R.ins[cd].sym] = cd; });
    var navAt = function (nh, d) { var v = NaN; (nh || []).forEach(function (q) { if (q[0] <= d) v = q[1]; }); return v; };
    Object.keys(by).forEach(function (k) { var r = by[k], m = r.mvx; if (!m || !m.h || !m.h.length) return;
      var b = m.h.filter(function (o) { return o.h === m.best; })[0] || m.h[m.h.length - 1], d1 = m.d, d0 = b.d0; if (!d0) return;
      if (k === 'g:crypto-tether-irr' && usd) r.dcx = { k: 'usdt', h: b.h, d0: d0, d1: d1, o: M.decompUSDT(rows(k), usd, wU, d1, d0) };
      else if (k === 'g:geram18' && usd && ons) r.dcx = { k: 'gold', h: b.h, d0: d0, d1: d1, o: M.decompGold(rows(k), ons, usd, d1, d0) };
      else if (r.cls === 'fund' && R && R.navH && codeOf[k]) { var nh = R.navH[codeOf[k]], z = R0.zmap[k], X = z && z.R.X; if (X) { var p1 = X.c[X.n - 1], i0 = X.d.lastIndexOf(d0), p0 = i0 >= 0 ? X.c[i0] : NaN, n1 = navAt(nh, d1), n0 = navAt(nh, d0);
        r.dcx = { k: 'fund', h: b.h, d0: d0, d1: d1, o: M.decompFund(p1, p0, n1, n0), navN: (nh || []).length, navNow: n1 }; } }
      if (r.cls === 'crypto' && G && G.tfOf) { var id = String(k).replace(/^x:/, ''), tf = G.tfOf(id); if (tf) { var arr = function (a) { return a && a.length >= 40 ? { d: a.map(function (q) { return q.ts; }), c: a.map(function (q) { return q.close; }), h: a.map(function (q) { return q.high; }), l: a.map(function (q) { return q.low; }), v: a.map(function (q) { return q.vol; }), n: a.length } : null; };
        var h1 = arr(tf.h1), h4 = arr(tf.h4); r.mvTf = { at: tf.at, src: tf.src, h1: h1 ? M.profile(h1, { hs: [1, 4, 24], sigWin: 240, rankWin: 480 }) : null, h4: h4 ? M.profile(h4, { hs: [1, 3, 6], sigWin: 240, rankWin: 480 }) : null }; } }
      if (r.cls === 'crypto') { var zz = R0.zmap[k], XX = zz && zz.R.X; if (XX && XX.n >= 200) { var W = { d: [], c: [], h: [], l: [], v: [], n: 0 }; for (var i = XX.n - 1; i >= 6; i -= 7) { W.d.unshift(XX.d[i]); W.c.unshift(XX.c[i]); var hh = -Infinity, ll = Infinity; for (var j = i - 6; j <= i; j++) { hh = Math.max(hh, XX.h[j]); ll = Math.min(ll, XX.l[j]); } W.h.unshift(hh); W.l.unshift(ll); W.v.unshift(0); } W.n = W.c.length; r.mvTf = r.mvTf || {}; r.mvTf.w = W.n >= 40 ? M.profile(W, { hs: [1, 2, 4], sigWin: 150, rankWin: 300 }) : null; } }
    });
  }
  function centralBuild(R0, DC) {
    var by = {}, items = DC && DC.desk ? DC.desk.items : [], rank = {}; (DC && DC.desk ? DC.desk.opp : []).forEach(function (x, i) { rank[x.key] = i + 1; });
    if (Hub.universe) { Hub.universe.purge(); items = items.filter(function (x) { return Hub.universe.ok(x.key); }); }
    items.forEach(function (x) {
      var v = x.v6 || {}, c = x.c;
      // the card's validation grade is part of the same verdict: a C/D grade (blocked card) cannot be «confirmed»
      if (v.st === 'ok' && c.candidate) { v.st = 'cond'; v.stFa = ST6.cond; v.why = 'دروازهٔ افق گذشت ولی درجهٔ اعتبارسنجی سیگنال ' + (c.val ? c.val.grade : '—') + ' است (حداقل B لازم است).'; }
      var a = actOf(x, x.pos), bt = v.bt, q = v.px || {};
      by[x.key] = { key: x.key, sym: x.sym, cls: x.cls, mk: x.mk, sid: x.track && x.track.id || null, st: v.st || 'nodata', stFa: v.stFa || ST6.nodata, en: v.en, enFa: v.enFa, why: v.why || '', act: a[0], actFa: ACT8[a[0]], actWhy: a[1],
        held: !!x.pos, rank: rank[x.key] || null, score: isF(x.score) ? x.score : null, conf: x.conf, grade: x.grade, dir: x.dir, hz: x.hz && x.hz.fa, px: isF(q.v) ? q.v : x.last, pxKind: q.kind || '', pxAt: q.fetched || null, unit: q.unit || x.unit,
        lo: v.lv && v.lv.entry ? Math.min(v.lv.entry[0], v.lv.entry[1]) : NaN, hi: v.lv && v.lv.entry ? Math.max(v.lv.entry[0], v.lv.entry[1]) : NaN, stop: v.lv ? v.lv.stop : NaN, tp: v.lv && v.lv.tp ? v.lv.tp : [], rr: isF(v.rrNow) ? v.rrNow : v.rr, trend: x.f && x.f.dir,
        bt: bt ? { k: bt.k, n: bt.n, hit: bt.hit, pf: bt.pf, mdd: bt.mdd, oos: bt.oos ? { n: bt.oos.n, avgR: bt.oos.avgR, pf: bt.oos.pf } : null } : null, issued: v.issue && isF(v.issue.p) ? { d: v.issue.d, p: v.issue.p, chg: v.issue.chg } : null,
        pt: x.pt && x.pt.tg[0] && x.pt.tg[0].w ? { phase: x.pt.phase, T1: x.pt.tg[0].p, from: x.pt.tg[0].w.from, to: x.pt.tg[0].w.to } : null,
        tz: x.tz && x.tz.zone ? { side: x.tz.side, lo: x.tz.zone[0], hi: x.tz.zone[1], conf: x.tz.conf, inv: x.tz.inv, st: x.tz.state, stFa: x.tz.stFa } : null };
      var rec = by[x.key], rc = rcOf(x, rec), hv = x.hzs || {};
      rec.tier = tierOf(x, rec); rec.tierFa = TIERFA[rec.tier]; rec.rc = rc ? rc.k : null; rec.rcFa = rc ? RCFA[rc.k] : ''; rec.rcWhy = rc ? rc.t : ''; rec.name = x.name; rec.date = x.date; rec.age = x.age;
      rec.L = levelsOf(x);
      // geometry guard (directive 23 · 3, 6): a long plan must read stop < entry zone < target 1 ≤ target 2; a plan that does not
      // (e.g. levels issued on an earlier bar and kept by the ledger after the price structure moved) is withheld, never shown
      (function (L) { if (!L.buy || !isF(L.stop)) return; var lo = Math.min(L.buy[0], L.buy[1]), hi = Math.max(L.buy[0], L.buy[1]), tp = (L.tp || []).filter(isF);
        if (L.stop < lo && (!tp.length || tp[0] > hi) && (tp.length < 2 || tp[1] >= tp[0])) return;
        L.badGeo = { buy: L.buy, stop: L.stop, tp: tp }; L.buy = null; L.stop = null; L.tp = []; rec.lo = rec.hi = rec.stop = rec.rr = NaN; rec.tp = [];
        rec.why = 'سطوح ثبت‌شدهٔ قبلی با ساختار فعلی قیمت ناسازگارند (حد ضرر ' + fa(L.badGeo.stop) + ' بالای کف محدودهٔ ورود ' + fa(lo) + ')؛ کنار گذاشته شدند و طرح تازه پس از شکل‌گیری ساختار جدید ساخته می‌شود. ' + (rec.why || ''); })(rec.L);
      if (rec.L.far) { rec.lo = rec.hi = rec.stop = rec.rr = NaN; rec.tp = []; rec.farTxt = rec.L.farTxt; if (/محدودهٔ ورود/.test(rec.why)) { var wq = rec.why.split('؛'); rec.why = rec.L.farTxt + (wq.length > 1 ? ' ' + wq.slice(1).join('؛').trim() : ''); } }
      // data sanity: a price that is not positive, or plan levels more than 5x away from it, mean the series is corrupt — no signal is shown on it
      var Lq = rec.L, odd = function (v) { return isF(v) && (v > rec.px * 5 || v < rec.px / 5); };
      if (!(rec.px > 1) || odd(Lq.buy && Lq.buy[0]) || odd(Lq.upConf) || odd(rec.stop) || odd(Lq.dnConf)) { rec.st = 'nodata'; rec.stFa = ST6.nodata; rec.why = 'دادهٔ قیمت ناسازگار است (قیمت ' + fa(rec.px) + ' با سطوح محاسبه‌شده از تاریخچه هم‌خوان نیست)؛ تا اصلاح داده هیچ سطح یا سیگنالی نمایش داده نمی‌شود.';
        rec.lo = rec.hi = rec.stop = rec.rr = NaN; rec.tp = []; rec.rank = null; rec.act = 'none'; rec.actFa = ACT8.none; rec.dataBad = true; rec.tier = 'none'; rec.tierFa = TIERFA.none;
        rec.L = { buy: null, stop: null, tp: [], upConf: null, dnConf: null, inv: null, dnTp: [], floor: null, ceil: null, sup: [], res: [], tzT: [], after: [] }; } rec.hzv = {}; ['s', 'm', 'l'].forEach(function (h) { if (hv[h]) rec.hzv[h] = { view: hv[h].view, code: hv[h].code, fa: hv[h].fa, status: hv[h].status }; });
      var zT = R0 && R0.zmap && R0.zmap[x.key]; rec.trx = zT ? trendOfZ(zT) : null;
      rec.alt = altOf(R0, x, rec); if (rec.alt) { if (rec.alt.sup) { rec.L.sup = rec.alt.sup; rec.L.supSrc = rec.alt.supSrc; } if (rec.alt.res) { rec.L.res = rec.alt.res; rec.L.resSrc = rec.alt.resSrc; } rec.L.upD = rec.alt.upD; rec.L.dnD = rec.alt.dnD; rec.L.struct = rec.alt.struct;
        if (rec.L.far && rec.alt.best) { var bq = rec.alt.best; rec.L.farTxt += ' سناریوی جایگزین (آزموده‌نشده، سیگنال قطعی نیست): ' + bq.fa + ' در ' + fa(bq.entry) + ' (' + pct(bq.dist, 1) + ')، حد ضرر ' + fa(bq.stop) + '، اهداف ' + fa(bq.tp[0]) + ' / ' + fa(bq.tp[1]) + '، R:R ' + fa(bq.rr, 1) + '.'; rec.farTxt = rec.L.farTxt; } }
      rec.mv = MODEL_VER; rec.xo = execOf(R0, x, rec);
      // directive 23 · 1: a buy is «confirmed» only if the order can really be executed at the plan's risk; otherwise it waits
      if (rec.xo && !rec.xo.ok && rec.tier === 'ok') { rec.tier = 'wait'; rec.tierFa = TIERFA.wait; rec.st = 'cond'; rec.stFa = ST6.cond; rec.act = 'wait'; rec.actFa = ACT8.wait;
        rec.why = 'اجرای سفارش: ' + rec.xo.whyNot + ' تا رفع این مورد سفارش خرید صادر نمی‌شود.' + (rec.why ? ' (حکم پیشین: ' + rec.why + ')' : ''); }
      rec.days = x.hz && isF(x.hz.days) ? x.hz.days : null; rec.liqOK = x.c ? x.c.liqOK !== false : true;
      // directive 22: strength, validity date and data state are part of the one central signal (pages read them, never recompute them)
      rec.strength = isF(rec.conf) ? (rec.conf >= 70 ? 'قوی' : rec.conf >= 55 ? 'متوسط' : 'ضعیف') : null; rec.deskRank = rec.rank; rec.hzc = 'M';
      var tk = x.track; rec.validUntil = tk && tk.d0 && isF(tk.hz) ? (function () { var dd = new Date((d2days(tk.d0) + Math.ceil(tk.hz * 7 / 5 + 2)) * 864e5); return dd.getUTCFullYear() * 10000 + (dd.getUTCMonth() + 1) * 100 + dd.getUTCDate(); })() : null;
      rec.dataState = c.sample ? 'sample' : rec.st === 'nodata' ? 'nodata' : isF(c.age) && c.age > 96 ? 'stale' : 'fresh';
      rec.near = x.tz && x.tz.zone ? (x.tz.side === 'down' ? 'floor' : 'ceil') : null; rec.tzState = x.tz ? x.tz.state : null; rec.ev = x.tz && x.tz.ev ? x.tz.ev.slice(0, 4) : [];
      rec.sell = x.tz && x.tz.side === 'up' && x.tz.zone && (x.tz.state === 'inZone' || x.tz.state === 'confirmed') ? x.tz.state : x.dir === 'down' || (x.path && x.path.st === 'bear') ? 'bear' : null;
      // inputs of the opportunity layer (directive 18): sector, queue, liquidity, volatility, last session
      var z = R0 && R0.zmap ? R0.zmap[x.key] : null, Xz = z && z.R && z.R.X, Iz = z && z.R && z.R.I, nz = Xz ? Xz.n : 0;
      rec.sector = c.sector || (z && z.a.sector) || ''; rec.cs = z && z.a.cs || ''; rec.csName = z && z.a.csName || ''; rec.ftype = z && z.a.ftype || ''; rec.ftSrc = z && z.a.ftSrc || ''; rec.mkt = z && z.a.market || ''; rec.queue = c.queue || null;
      rec.val20 = Xz && (x.cls === 'stock' || x.cls === 'fund') ? Xz.val.slice(-20).reduce(function (s, v) { return s + (v || 0); }, 0) / Math.max(1, Math.min(20, nz)) : NaN;
      rec.atrAbs = Iz && Iz.atr ? Iz.atr[nz - 1] : NaN; rec.atrPct = isF(rec.atrAbs) && Xz && Xz.c[nz - 1] > 0 ? rec.atrAbs / Xz.c[nz - 1] : NaN; rec.lastD = Xz ? Xz.d[nz - 1] : NaN;
      // directive 26: important price moves on the record, separate from the trading verdict (Hub.moves; 24/7 crypto counts calendar days)
      rec.n = nz; if (Hub.moves && Xz && !c.sample) { try { rec.mvx = Hub.moves.profile(Xz, { hs: x.cls === 'crypto' ? [1, 3, 7] : [1, 3, 5] }); } catch (e) { rec.mvx = null; } }
    });
    if (Hub.moves && R0 && R0.zmap) { try { moveContext(by, R0); } catch (e) { /* the decompositions are optional */ } }
    if (Hub.alerts && Hub.alerts.grade && R0 && R0.zmap) { try { Hub.alerts.grade(function (k) { var z = R0.zmap[k]; return z && z.a && !z.a.sample ? z.a.rows : null; }); } catch (e) { /* grading is best-effort */ } }
    // options (directive 22 · 2): the option model's proposals are recorded here too, so no page shows an option verdict of its own.
    // Their status is the option model's (liquidity-gated, not back-tested — stated on every record); they carry a rank within options only.
    var oc = ((R0 && R0.cards) || []).filter(function (c) { return c.cls === 'option'; }).sort(function (a, b) { return (b.type === 'long') - (a.type === 'long') || b.conf - a.conf; });
    oc.forEach(function (c, i) { var buy = c.type === 'long', exe = buy && /^قابل اجرا/.test(c.status || '');
      by[c.key] = { key: c.key, sym: c.sym, cls: 'option', name: c.name, sid: null, st: exe ? 'ok' : 'cond', stFa: exe ? 'تأییدشده (مدل اختیار معامله؛ بک‌تست نشده)' : 'مشروط (مدل اختیار معامله)', act: buy ? (exe ? 'buy' : 'wait') : 'none', actFa: buy ? (exe ? ACT8.buy : ACT8.wait) : 'فروش (نوشتن) فقط با پوشش — اگر سهم پایه را دارید',
        why: (c.status || '') + (c.o && c.o.why ? ' — ' + c.o.why : ''), held: false, rank: null, rankCls: i + 1, conf: c.conf, strength: c.strength || null, dir: buy ? 'up' : 'down', hz: c.horizon && c.horizon.fa, px: c.close != null ? c.close : c.o && c.o.price, unit: 'ریال',
        tier: exe ? 'ok' : 'none', tierFa: exe ? TIERFA.ok : TIERFA.none, rc: exe ? null : 'model', rcFa: exe ? '' : 'مدل اختیار: شرط اجرا برقرار نیست', rcWhy: c.status || '', date: c.date || '', hzc: 'S', rr: c.rr2, validUntil: null, dataState: c.sample ? 'sample' : 'fresh', model: 'options', noBT: true,
        L: { buy: isF(c.lo) ? [c.lo, c.hi] : null, stop: c.stop, tp: [c.tp1, c.tp2, c.tp3].filter(isF), upConf: null, dnConf: null, inv: null, floor: null, ceil: null, sup: [], res: [], tzT: [], after: [] }, hzv: {}, sell: buy ? null : 'write', lastD: NaN, val20: NaN, atrPct: NaN }; });
    var alloc = null; if (Hub.oppRank) { try { alloc = Hub.oppRank.enrich(by, R0); } catch (e) { alloc = { err: e.message }; } }
    // ONE rank everywhere (directive 22 · 9): the explainable cross-market priority rank. The decision desk's own order stays as deskRank (diagnostic only).
    Object.keys(by).forEach(function (k) { var r = by[k]; if (r.cls === 'option') return; r.rank = r.pri && isF(r.pri.rank) ? r.pri.rank : null; });
    // time-cycle engine (directive 21): an independent verdict carried on the record; it changes no tier or level of the signal
    if (Hub.cycles) { try { Hub.cycles.central(by, R0); } catch (e) { /* the cycle view is optional */ } }
    return { at: Date.now(), by: by, ACT8: ACT8, funnel: funnelOf(by, R0), alloc: alloc };
  }
  /* «why no buy» — every asset examined is counted once: tier, first blocking reason, and the five root causes (directive 15 · 3, test 4) */
  function funnelOf(by, R0) {
    var F = { n: 0, tier: {}, rc: {}, cause: {}, byCls: {}, at: Date.now() }, all = (R0 && R0.cards) || [];
    Object.keys(by).forEach(function (k) { var r = by[k], c = F.byCls[r.cls] = F.byCls[r.cls] || { n: 0, ok: 0, wait: 0, floor: 0, none: 0, pos: 0, rc: {} }; F.n++; c.n++; c[r.tier] = (c[r.tier] || 0) + 1; F.tier[r.tier] = (F.tier[r.tier] || 0) + 1;
      if (r.rc && r.tier !== 'ok') { F.rc[r.rc] = (F.rc[r.rc] || 0) + 1; c.rc[r.rc] = (c.rc[r.rc] || 0) + 1; var cz = CAUSE[r.rc] || 'market'; F.cause[cz] = (F.cause[cz] || 0) + 1; } });
    // coverage: assets in the engine's universe that never reached the signal step (no history, sample, options)
    var seen = {}; Object.keys(by).forEach(function (k) { seen[k] = 1; });
    F.universe = R0 && R0.nUni || all.length; F.outside = all.filter(function (c) { return !seen[c.key] && c.cls !== 'option'; }).map(function (c) { return { sym: c.sym, cls: c.cls, why: c.sample ? 'دادهٔ نمونه' : 'سناریوی معاملاتی ساخته نشد (دادهٔ ناکافی)' }; }).concat((R0 && R0.skipped) || []).filter(function (o) { return o.cls !== 'option'; });
    if (F.outside.length) F.cause.coverage = F.outside.length;
    F.valState = R0 ? R0.valState : null;
    var nb = F.n - (F.tier.ok || 0), top = Object.keys(F.cause).sort(function (a, b) { return F.cause[b] - F.cause[a]; })[0];
    F.main = top ? { k: top, fa: CAUSEFA[top], n: F.cause[top], share: nb ? F.cause[top] / nb : 0 } : null;
    return F;
  }
  // cards follow the central verdict: a buy card whose central status is not «confirmed» is not executable anywhere
  function centralApply(cards, C) {
    cards.forEach(function (c) {
      var r = C.by[c.key]; if (!r || c.cls === 'option') return; c.central = r; c.typeFa0 = c.typeFa; c.typeFa = r.actFa + ' — ' + r.stFa;   // one label everywhere
      // directive 22 · 4: one set of levels everywhere — the card shows the central entry zone, stop and targets (its own plan is kept as c.lv0);
      // a confirmed card's size is rescaled to the central risk distance (same risk budget, same caps as a ratio)
      var Lr = r.L || {}; if (Lr.buy && isF(Lr.buy[0]) && isF(Lr.stop)) { var lo = Math.min(Lr.buy[0], Lr.buy[1]), hi = Math.max(Lr.buy[0], Lr.buy[1]);
        c.lv0 = { lo: c.lo, hi: c.hi, entry: c.entry, stop: c.stop, tp1: c.tp1, tp2: c.tp2, tp3: c.tp3, rr2: c.rr2, posPct: c.posPct };
        var e0 = c.entry, d0 = isF(c.entry) && isF(c.stop) ? c.entry - c.stop : NaN; c.lo = lo; c.hi = hi; c.entry = isF(c.entry) ? Math.min(hi, Math.max(lo, c.entry)) : (lo + hi) / 2; c.stop = Lr.stop;
        var T = (Lr.tp || []).filter(isF); if (T.length) { c.tp1 = T[0]; if (T[1] != null) c.tp2 = T[1]; if (T[2] != null) c.tp3 = T[2]; }
        var d1 = c.entry - c.stop; if (d1 > 0) { c.rr1 = (c.tp1 - c.entry) / d1; c.rr2 = (c.tp2 - c.entry) / d1; if (isF(c.posPct) && c.posPct > 0 && d0 > 0) { c.posPct = c.posPct * (d0 / d1) * (c.entry / e0); var eqA = Number(c.eq) || NaN; if (isF(c.units) && isF(eqA)) c.units = Math.floor(eqA * c.posPct / c.entry); } } }
      else if (Lr.far || r.dataBad) { c.lv0 = { lo: c.lo, hi: c.hi, entry: c.entry, stop: c.stop, tp1: c.tp1, tp2: c.tp2, tp3: c.tp3, rr2: c.rr2, posPct: c.posPct };
        c.lo = c.hi = c.entry = c.stop = c.tp1 = c.tp2 = c.tp3 = c.rr1 = c.rr2 = NaN; c.posPct = 0; c.units = NaN; if (c.why) c.why.unshift(r.dataBad ? r.why : Lr.farTxt); }
      if ((c.type === 'long' || c.type === 'short') && r.st !== 'ok') {
        c.candidate = c.candidate || { type: c.type, typeFa: c.typeFa, strength: c.strength, conf: c.conf, status: c.status };
        c.type = 'hold'; c.status = 'وضعیت مرکزی: ' + r.stFa; c.why.unshift('موتور مرکزی: ' + r.stFa + ' — ' + r.why);
        c.posPct = 0; c.riskPct = 0; c.units = NaN;
      }
    });
  }
  /* consistency monitor: every view is checked against the central record; a mismatch that would change a decision blocks that output */
  function consistency(R0, C, DC) {
    var M = [], add = function (sev, what, sym, detail) { M.push({ sev: sev, what: what, sym: sym, detail: detail }); };
    R0.cards.forEach(function (c) { var r = C.by[c.key]; if (!r) return;
      if ((c.type === 'long' || c.type === 'short') && r.st !== 'ok') add('crit', 'سیگنال خرید/فروش اجرایی بدون تأیید مرکزی', c.sym, c.typeFa + ' / مرکزی: ' + r.stFa);
      if (isF(c.last) && isF(r.px) && Math.abs(c.last / r.px - 1) > 0.02 && !/لحظه|امروز/.test(r.pxKind || '')) add('warn', 'قیمت متفاوت در دو بخش', c.sym, fa(c.last) + ' در برابر ' + fa(r.px)); });
    (DC && DC.desk ? DC.desk.top10 : []).forEach(function (x) { var r = C.by[x.key]; if (r && /^(rej|exp|nodata)$/.test(r.st)) add('crit', 'سیگنال ردشده/منقضی در فهرست فرصت‌های برتر', x.sym, r.stFa); if (r && r.en === 'missed') add('crit', 'ورود ازدست‌رفته در فهرست فرصت‌ها', x.sym, r.why); });
    // directive 15 · 4-3: a confirmed central buy must appear as an opportunity everywhere (no silent drop by a display limit or a second filter)
    var inOpp = {}; (DC && DC.desk ? DC.desk.opp : []).forEach(function (x) { inOpp[x.key] = 1; });
    Object.keys(C.by).forEach(function (k) { var r = C.by[k]; if (r.tier === 'ok' && r.cls !== 'option' && !inOpp[k]) add('crit', 'خرید تأییدشدهٔ مرکزی در فهرست فرصت‌ها نیست', r.sym, r.stFa + ' / ' + r.actFa); });
    (R0.pf && R0.pf.pick || []).forEach(function (c) { var r = C.by[c.key]; if (!r || r.st !== 'ok') add('crit', 'دارایی در سبد بدون سیگنال معتبر مرکزی', c.sym, r ? r.stFa : 'بدون رکورد مرکزی'); });
    if (R0.valState === 'stale') add('warn', 'اعتبارسنجی مربوط به تنظیمات قبلی است', '—', 'دوباره اعتبارسنجی کنید');
    if (R0.valState === 'none') add('warn', 'اعتبارسنجی اجرا نشده', '—', 'هیچ سیگنالی تأییدشده نیست');
    // data-time gaps between markets
    var last = {}; Object.keys(R0.zmap || {}).forEach(function (k) { var z = R0.zmap[k]; if (!z || z.a.sample || z.a.global) return; var m = z.a.cls === 'fund' ? 'stock' : z.a.cls, d = z.R.X.d[z.R.X.n - 1]; if (!last[m] || d > last[m]) last[m] = d; });
    var ks = Object.keys(last); if (ks.length > 1) { var mx = Math.max.apply(null, ks.map(function (k) { return d2days(last[k]); })); ks.forEach(function (k) { var g = mx - d2days(last[k]); if (g > 4) add('warn', 'اختلاف زمانی داده‌ها میان بازارها', MKFA[k] || k, 'آخرین داده ' + fa(g, 0) + ' روز عقب‌تر از تازه‌ترین بازار'); }); }
    return { list: M, crit: M.filter(function (m) { return m.sev === 'crit'; }).length, warn: M.filter(function (m) { return m.sev === 'warn'; }).length, at: Date.now() };
  }
  // the central record is kept so other tools (e.g. the stock signal tool) and the next update can read it; status changes are versioned
  function slimMv(m) { if (!m || !m.h) return m && m.na ? { na: m.na, n: m.n } : null;
    return { d: m.d, lv: m.lv, dir: m.dir, best: m.best, sig: m.sig, brk: m.brk, brkNew: m.brkNew, brkLv: m.brkLv, volR: m.volR, h: m.h.map(function (o) { return { h: o.h, r: o.r, z: o.z, rk: o.rk, lv: o.lv, d0: o.d0 }; }) }; }
  var CKEY = 'hub.central.v1';
  function centralSave(C, U0) {
    try { var St = Hub.util && Hub.util.store; if (!St) return null; var old = St.get(CKEY, null) || { by: {}, hist: [] }, ch = [];
      Object.keys(C.by).forEach(function (k) { var r = C.by[k], o = old.by && old.by[k]; if (!o) { if (r.st === 'ok' || r.st === 'cond') ch.push({ sym: r.sym, from: '—', to: r.stFa, px: r.px }); return; }
        if (o.st !== r.st || o.act !== r.act || (o.tier && r.tier && o.tier !== r.tier)) ch.push({ sym: r.sym, from: o.stFa + ' / ' + o.actFa, to: r.stFa + ' / ' + r.actFa, px: r.px, why: r.why }); });
      // directive 23 · 6-7: a newer run whose data failed quality control does not replace the last valid decision; the valid one is
      // kept (with its own date and version) and marked as held, until data that passes control produces a new decision
      Object.keys(C.by).forEach(function (k) { var r = C.by[k], o = old.by && old.by[k]; if (!o || !(r.dataBad || r.dataState === 'sample') || o.dataBad || o.st === 'nodata' || o.dataState === 'sample') return;
        ['st', 'stFa', 'act', 'actFa', 'tier', 'tierFa', 'rank', 'px', 'date', 'conf'].forEach(function (f) { if (o[f] !== undefined) r[f] = o[f]; });
        if (o.lv) { r.L = Object.assign({}, r.L || {}, { buy: o.lv.buy, stop: o.lv.stop, tp: o.lv.tp || [], upConf: o.lv.up, dnConf: o.lv.dn }); r.lo = o.lv.buy ? o.lv.buy[0] : NaN; r.hi = o.lv.buy ? o.lv.buy[1] : NaN; r.stop = o.lv.stop; r.tp = o.lv.tp || []; }
        r.heldPrev = true; r.dataBad = false; r.why = 'دادهٔ تازه از کنترل کیفیت عبور نکرد (' + String(r.why || '').slice(0, 80) + ')؛ آخرین حکم معتبر (داده ' + (o.date || '—') + (o.ver ? '، نسخهٔ ' + o.ver : '') + ') حفظ شد. ' + String(o.why || ''); });
      var slim = {}; Object.keys(C.by).forEach(function (k) { var r = C.by[k], o = old.by && old.by[k]; var L = r.L || {}; slim[k] = { sym: r.sym, cls: r.cls, st: r.st, stFa: r.stFa, act: r.act, actFa: r.actFa, rank: r.rank, px: r.px, sid: r.sid, why: r.why.slice(0, 200), held: r.held, tier: r.tier, rc: r.rc, tzState: r.tzState, near: r.near, sell: r.sell, date: r.date,
          lv: { buy: L.buy, stop: L.stop, tp: (L.tp || []).slice(0, 3), up: L.upConf, dn: L.dnConf, floor: L.floor, ceil: L.ceil, tzConf: L.tzConf, rr: r.rr }, pri: r.pri ? Math.round(r.pri.s) : null, ex: r.exec || null, s4: r.st4 || null, grp: r.grp || null, cy: r.cyc ? { l: r.cyc.lvl, w: r.cyc.win, s: r.cyc.st } : null,
          tierFa: r.tierFa || null, rankCls: r.rankCls || null, conf: isF(r.conf) ? r.conf : null, mvx: slimMv(r.mvx), sl: Hub.moves && o && o.px > 0 && r.px > 0 && o.date ? Hub.moves.sinceLast(o.px, old.at, r.px, C.at, r.mvx && r.mvx.sig, Math.max(1, Math.round((C.at - (old.at || C.at)) / 864e5))) : null, dcx: r.dcx || null, n: r.n || null, strength: r.strength || null, hz: r.hz || null, hzc: r.hzc || 'M', validUntil: r.validUntil || null, dataState: r.dataState || null, model: r.model || null, mv: MODEL_VER, hzk: r.hz || null, tr: r.trx ? { s: r.trx.s.v, m: r.trx.m.v, l: r.trx.l.v, sb: r.trx.s.sub, mb: r.trx.m.sub, lb: r.trx.l.sub, d: r.trx.date } : null, xo: r.xo && !r.xo.na ? { ty: r.xo.type, ord: r.xo.order, w: r.xo.worst, fp: isF(r.xo.fillP) ? Math.round(r.xo.fillP * 100) / 100 : null, rw: isF(r.xo.rrWorst) ? Math.round(r.xo.rrWorst * 10) / 10 : null, ok: r.xo.ok, ref: r.xo.ref, rd: r.xo.refDate, at: r.xo.calcAt } : null }; slim[k].lv.inv = L.inv; });
      // directive 22: AID, signal ID and version on every record, and a ledger entry for every change — the live records get the same stamps
      Object.keys(slim).forEach(function (k) { if (C.by[k]) C.by[k].sl = slim[k].sl; });   // change since the last update, also on the live record (alerts read it)
      var stp = Hub.central ? Hub.central.stamp(slim, C.at, U0 && U0.upd ? U0.upd : (Hub.util.store.get('hub.updrun.v1', null) || {}).id) : null;
      Object.keys(slim).forEach(function (k) { var a = slim[k], r = C.by[k]; r.aid = a.aid; r.sigId = a.sigId; r.ver = a.ver; r.created = a.created; r.updAt = a.updAt; });
      var upd = U0 && U0.upd ? { id: U0.upd } : Hub.util.store.get('hub.updrun.v1', null), hist = (old.hist || []).concat(ch.length ? [{ at: C.at, upd: upd && upd.id || null, ch: ch.slice(0, 80) }] : []).slice(-30);
      var o = { outside: ((C.funnel && C.funnel.outside) || []).slice(0, 400).map(function (q) { return { sym: q.sym, cls: q.cls, why: q.why }; }), at: C.at, run: (old.run || 0) + 1, upd: upd && upd.id || null, by: slim, hist: hist, stamp: stp, prevAt: old.at || null, changes: ch.length ? ch : (old.changes || []), chAt: ch.length ? C.at : (old.chAt || null) };
      if (!(U0 && U0.noSave)) St.set(CKEY, o); return o; } catch (e) { return null; }
  }
  function run(E0, U0, opts) {
    var E = merge(defaults(), JSON.parse(JSON.stringify(E0 || {}))), U = U0 || universe(E), list = [];
    var full = !!(opts && (opts.backtest || opts.prep));
    var skipped = FIXSKIP.slice(); (U.assets || []).forEach(function (a) { if (!a.rows || a.rows.length < 30) { skipped.push({ sym: a.sym, cls: a.cls, why: 'تاریخچه ' + ((a.rows || []).length) + ' جلسه (حداقل ۳۰)' }); return; } try { list.push({ a: a, R: analyse(a, false) }); } catch (e) { skipped.push({ sym: a.sym, cls: a.cls, why: 'خطای تحلیل: ' + e.message }); } });
    crossModels(list, U, E, full); var ml = mlRank(list), pr = pairs(list);
    var zmap = {}; list.forEach(function (z) { zmap[z.a.key] = z; });
    var cards = list.map(function (z) { return card(z, E); }).filter(Boolean).concat(E.classes.option !== false ? optionCards(U.opt, E) : []);
    var zmap0 = {}; list.forEach(function (z) { zmap0[z.a.key] = z; });
    if (E.classes.global !== false && Hub.globalMkt) { try { var GMr = Hub.globalMkt.rowsAll(), gdef = [['g:btc', 'lv:crypto-bitcoin', 'crypto', 'بیت‌کوین'], ['g:eth', null, 'crypto', 'اتریوم'], ['g:brent', 'lv:oil_brent', 'commodity', 'نفت برنت'], ['g:wti', null, 'commodity', 'نفت WTI'], ['g:ng', null, 'commodity', 'گاز طبیعی'], ['g:silver', null, 'commodity', 'نقره'], ['g:copper', null, 'commodity', 'مس']].filter(function (q) { return !Hub.universe || Hub.universe.ok('x:' + q[0].slice(2), q[2]); });
      gdef.forEach(function (q) { var o = GMr.filter(function (g) { return g.id === q[0]; })[0] || (q[1] && GMr.filter(function (g) { return g.id === q[1]; })[0]); if (!o) return;
        var rr = o.rows.filter(function (r) { return isF(r.close) && r.close > 0; }); if (rr.length < 120) return;
        var gaps = rr.slice(-60).map(function (r, i, A) { return i ? d2days(r.date) - d2days(A[i - 1].date) : 1; }).sort(function (a, b) { return a - b; }); if (gaps[Math.floor(gaps.length / 2)] > 4) return;   // daily series only
        var lastD = rr[rr.length - 1].date, age = (Date.now() / 864e5 - d2days(lastD)) * 24;
        var a = { key: 'x:' + q[0].slice(2), sym: q[3], name: o.name, cls: q[2], sector: q[2] === 'crypto' ? 'رمزارز' : q[2] === 'intl' ? 'شاخص‌های جهانی' : 'کالا و انرژی', rows: rr.map(function (r) { return { date: r.date, open: r.open || r.close, high: r.high || r.close, low: r.low || r.close, close: r.close, vol: 0, val: 0, yclose: 0 }; }), sample: false, asOf: lastD, age: age, unit: o.unit, global: true, src: o.src, pm: { src: o.src, at: o.at || null } };
        try { var z = { a: a, R: analyse(a, false) }, cg = card(z, E); if (!cg) return; cg.global = true; cg.src = o.src; cg.notes.unshift('بازار جهانی (' + o.src + ')؛ سری پایانی روزانه؛ دسترسی و محدودیت‌های قانونی و عملیاتی کاربر ایرانی جداگانه بررسی شود'); zmap0[a.key] = z; cards.push(cg); } catch (e) { /* skip */ } }); } catch (e) { /* global data optional */ } }
    var real = list.filter(function (z) { return !z.a.sample; }), blist = real.length ? real : list;
    if (opts && (opts.backtest || opts.prep || opts.bt)) Object.keys(zmap0).forEach(function (k) { var z = zmap0[k]; if (z.a.global) blist = blist.concat([z]); });
    // snapshot the full-history cross-model votes: a screen refresh during the async back-test rebuilds them for the last bars only
    if (opts && opts.prep) return { E: E, blist: blist.map(function (z) { return Object.assign({}, z, { Vs: Object.assign({}, z.R.V) }); }), sample: list.every(function (z) { return z.a.sample; }) };   // sample series never enter the evidence when real series exist
    var btF = opts && opts.bt ? opts.bt : opts && opts.backtest ? backtest(blist, E) : null, db = btF ? makeDB(btF, blist, E) : (E.val && E.val.db) || null;
    if (btF && db) db.ver = ((E0 && E0.val && E0.val.db && E0.val.db.ver) || 0) + 1;
    var todayD = 0; blist.forEach(function (z) { todayD = Math.max(todayD, z.R.X.d[z.R.X.n - 1]); });   // real series only: sample dates must not age the evidence
    var gated = gateCards(cards, db, E, todayD);
    Object.keys(zmap0).forEach(function (k) { zmap[k] = zmap0[k]; });
    cards.forEach(function (c) { if (c.global && c.val && c.val.grade === 'D' && !c.val.ev) c.val.reasons.push('بازار جهانی: تاریخچهٔ کوتاه (حداکثر یک سال از CoinGecko) نمونهٔ کافی برای اعتبارسنجی نمی‌دهد.'); });
    var rank = { long: 0, short: 1, close: 2, hold: 3 }; cards.sort(function (a, b) { return rank[a.type] - rank[b.type] || b.conf - a.conf; });
    var byKey = {}; cards.forEach(function (c) { byKey[c.key] = c; });
    var mon = monitor(E, zmap, byKey), rk0 = risk(E, zmap, mon, { pick: [] }, U);
    if (/^اضطراری|^کاهش/.test(rk0.state)) cards.forEach(function (c) { if (c.type === 'long') { c.status = 'مسدود — ' + rk0.state.split(':')[0]; c.cond.push('قاعدهٔ افت سرمایه: ' + rk0.state); } });
    // central verdict first (decision desk on the same cards), then every downstream output from it
    var ixF0 = null; try { ixF0 = U.idx && U.idx.length ? indexForecast(U.idx) : null; } catch (e) { ixF0 = null; }
    var xg0 = null; try { xg0 = xgStrategy(E); } catch (e) { xg0 = { inst: [], note: 'خطا: ' + e.message }; }
    Object.keys(zmap0).forEach(function (k) { zmap[k] = zmap0[k]; });
    var Xc = { E: E, zmap: zmap, cards: cards, mon: mon, ixf: ixF0, xg: xg0, valDb: db, valState: db ? (db.sample ? 'sample' : db.sig !== valSig(E) ? 'stale' : 'ok') : 'none', skipped: skipped, nUni: (U.assets || []).length }, DC0 = null;
    try { DC0 = decide(Xc, E, U); } catch (e) { DC0 = { best: { kind: 'error', text: 'خطا در تحلیل', why: e.message }, top: [], markets: [], screened: 0, ranked: 0, all: [] }; }
    var CEN = centralBuild(Xc, DC0); centralApply(cards, CEN);
    var pf = portfolio(cards, zmap, E, mon), rk = risk(E, zmap, mon, pf, U), plan2 = actionPlan(E, cards, pf, mon, rk, CEN);
    // market regime from the total index
    var mk = null; if (U.idx && U.idx.length > 80) { var ix = { key: 'idx', rows: U.idx.map(function (r) { return { date: r.date, open: r.close, high: r.high || r.close, low: r.low || r.close, close: r.close, vol: 0, val: 0 }; }) }, Ri = analyse(ix); mk = { rg: Ri.RG[Ri.X.n - 1], close: Ri.X.c[Ri.X.n - 1] }; }
    var ixF = ixF0;
    var idxv = []; try { if (U.idxAll) { idxv.push(indexView(U.idxAll.total, 'شاخص کل بورس', E, U.idxSample)); idxv.push(indexView(U.idxAll.ew, 'شاخص کل (هم‌وزن)', E, U.idxSample)); } } catch (e) { idxv = [{ name: 'شاخص‌ها', ok: false, why: 'خطا: ' + e.message }]; }
    var bt = btF, xgS = xg0;
    var counts = { long: cards.filter(function (c) { return c.type === 'long'; }).length, strong: cards.filter(function (c) { return c.type === 'long' && c.strength === 'قوی'; }).length, close: cards.filter(function (c) { return c.type === 'close'; }).length, hold: cards.filter(function (c) { return c.type === 'hold'; }).length, gated: gated };
    var sample = (U.assets || []).some(function (a) { return a.sample; });
    var R0 = { E: E, zmap: zmap, cards: cards, optSkip: optionSkipped(U.opt && U.opt.R ? U.opt : null), pf: pf, mon: mon, risk: rk, plan: plan2, mode: MODES[E.mode] || MODES.full, ml: ml, pairs: pr, market: mk, bt: bt, valDb: db, ixf: ixF, idxv: idxv, xg: xgS, markets: rankMarkets(cards, db, list, E, xgS), valState: db ? (db.sample ? 'sample' : db.sig !== valSig(E) ? 'stale' : 'ok') : 'none', list: list, counts: counts, sample: sample, n: list.length };
    R0.decide = function () { return DC0; }; R0.central = CEN; R0.pulse = pulse(R0, U);
    R0.consistency = consistency(R0, CEN, DC0); if (!sample) { R0.centralSaved = centralSave(CEN, opts); try { R0.ptReg = DC0 && DC0.desk ? ptRegister(DC0.desk, Xc) : null; } catch (e) { R0.ptReg = null; } }
    R0.prio = priorities(R0, E); R0.widget = function () { return widget(R0, E, U); };
    return R0;
  }

  /* ---------------- six test scenarios (synthetic series, known answers) ---------------- */
  function scenSeries(kind) {
    var r = (function (s) { return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })(kind.length * 97 + 13), g = function () { var u = r() || 1e-9, v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    var n = 260, p = 10000, rows = [], d = new Date(Date.UTC(2025, 9, 1)), lim = 0.03;
    for (var i = 0; i < n; i++) {
      do { d = new Date(d.getTime() + 864e5); } while (d.getUTCDay() === 4 || d.getUTCDay() === 5);
      var mu = 0, s = 0.014, o = p, c;
      if (kind === 'up') { mu = 0.003; s = 0.009; if (i > n - 26 && i < n - 20) mu = -0.006; }
      else if (kind === 'down') { mu = -0.003; s = 0.013; }
      else if (kind === 'range') { mu = 0; s = 0.01; p = 10000 * (1 + 0.03 * Math.sin(2 * Math.PI * i / 16)) * (1 + 0.004 * g()); o = rows.length ? rows[rows.length - 1].close : p; }
      else if (kind === 'hv') { mu = 0.0005; s = i > n - 40 ? 0.055 : 0.014; }
      else if (kind === 'news') { mu = 0.002; s = 0.012; if (i === n - 1) mu = -0.08; }
      else if (kind === 'queue') { mu = 0.003; s = 0.009; }
      c = kind === 'range' ? p : o * Math.exp(mu + s * g());
      if (kind === 'queue' && i >= n - 3) { c = o * (1 + lim); }
      if (kind === 'news' && i === n - 1) c = o * 0.92;
      var hi = Math.max(o, c) * (1 + Math.abs(g()) * 0.004), lo = Math.min(o, c) * (1 - Math.abs(g()) * 0.004);
      if (kind === 'queue' && i >= n - 3) { hi = c; lo = c; }
      var vol = 2e6 * (1 + r()), dt = d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
      rows.push({ date: dt, open: kind === 'queue' && i >= n - 3 ? c : o, high: hi, low: lo, close: c, yclose: o, vol: vol, val: vol * c });
      p = c;
    }
    var ct = rows.slice(-90).map(function (b) { var bias = kind === 'up' || kind === 'queue' ? 0.08 : kind === 'down' ? -0.08 : 0, bi = b.val * (0.5 + bias + 0.05 * g()), si = b.val * (0.5 - bias + 0.05 * g()); return { date: b.date, buyI: bi, sellI: si, buyN: b.val - bi, sellN: b.val - si, buyIc: 500, sellIc: 500 }; });
    return { rows: rows, ct: ct };
  }
  var SCEN = [
    { id: 'up', fa: 'روند صعودی پایدار با اصلاح کوتاه', expect: 'خرید با ورود، حد ضرر زیر ورود، اهداف بالای ورود و R:R ≥ ۱٫۵', check: function (c) { return c.type === 'long' && c.stop < c.lo && c.tp1 > c.hi && c.tp2 > c.tp1 && c.rr2 >= 1.5 && c.posPct > 0; } },
    { id: 'down', fa: 'روند نزولی', expect: 'بدون خرید؛ «بستن/فروش در صورت داشتن» یا نگه‌داری', check: function (c) { return c.type === 'close' || c.type === 'hold'; } },
    { id: 'range', fa: 'بازار رنج (نوسان دوره‌ای)', expect: 'رژیم رنج؛ اگر خرید، افق کوتاه‌مدت؛ هیچ سیگنال روندی بلندمدت', check: function (c) { return c.regime === 'range' && (c.type !== 'long' || c.horizon.k === 's'); } },
    { id: 'hv', fa: 'جهش نوسان (پرنوسان)', expect: 'رژیم پرنوسان یا بحرانی؛ حجم کاهش‌یافته یا بدون خرید', check: function (c) { return (c.regime === 'hv' || c.regime === 'crisis') && (c.type !== 'long' || c.riskPct <= 0.005 + 1e-9); } },
    { id: 'news', fa: 'خبر منفی مهم با شکاف قیمتی −۸٪', expect: 'بدون خرید تا تأیید قیمت', check: function (c) { return c.type !== 'long'; }, news: [{ asset: 'آزمون', dir: -0.8, impact: 'high', note: 'خبر منفی فرضی (کاهش نرخ فروش)' }] },
    { id: 'queue', fa: 'صف خرید سه‌روزه در سقف دامنه', expect: 'سیگنال مشروط: ورود فقط پس از باز شدن صف', check: function (c) { return c.queue === 'buy' && (c.type !== 'long' || /مشروط/.test(c.status)) && c.cond.some(function (x) { return /صف/.test(x); }); } }];
  function runScenario(sc, E0) {
    var s = scenSeries(sc.id), E = merge(defaults(), JSON.parse(JSON.stringify(E0 || {}))); E.acct.equity = E.acct.equity || 10e9; E.classes = { stock: true, gold: false, fx: false, option: false }; E.news = sc.news || []; E.positions = [];
    var a = { key: 's:test-' + sc.id, sym: 'آزمون', name: 'سهم آزمون (' + sc.fa + ')', cls: 'stock', sector: 'آزمون', rows: s.rows, ct: s.ct, sample: false, age: 1, unit: 'ریال' };
    var R = run(E, { assets: [a], usd: [], idx: [], opt: null }), c = R.cards[0];
    return { sc: sc, card: c, pass: !!c && sc.check(c) };
  }

  Hub.tradeEngine = { trendEv: trendEv, trendRows: trendRows, prep: prep, indexView: indexView, poolKey: poolKey, TIERFA: TIERFA, RCFA: RCFA, CAUSEFA: CAUSEFA, POOLFA: POOLFA, ptAnalysis: ptAnalysis, ptCalib: ptCalib, goldLink: goldLink, toWeekly: toWeekly, PTKEY: PTKEY, FAV: FAV, ADV: ADV, PTW: PTW, turnZones: turnZones, tzCalib: tzCalib, tzCases: tzCases, tzPivots: tzPivots, tzText: tzText, TZH: TZH, actOf: actOf, ACT8: ACT8, centralBuild: centralBuild, consistency: consistency, trendView: trendView, validateAsync: validateAsync, ENG_VER: ENG_VER, HIST: HIST, HZ: HZN, GST: GST, STRATS: STRATS, ST9: ST9, ACT9: ACT9, STRFA: STRFA, ST8: ST8, MKFA: MKFA, scenariosOf: scenariosOf,  limitOf: limitOf, LIMD: LIMD, journalAdd: journalAdd, journalEval: journalEval, learnStats: learnStats, learnPropose: learnPropose, learnApply: learnApply, learnRevert: learnRevert, LMIN: LMIN, optionCards: optionCards, optionSkipped: optionSkipped, MODES: MODES, defaults: defaults, run: run, universe: universe, backtest: function (E, U) { return run(E, U, { backtest: true }).bt; }, validate: validate, indexForecast: indexForecast, DIRFA: DIRFA, priorities: priorities, widgetData: widget, MARKETS: MARKETS, xgStrategy: xgStrategy, XGD: XGD, shamsi: shamsi, gradeCard: gradeCard, valSig: valSig, VTH: VTH, VLIM: VLIM, GRD: GRD, RULEFA: RULEFA, ENG_VER: ENG_VER, SCEN: SCEN, runScenario: runScenario, scenSeries: scenSeries, REG: REG, BASEW: BASEW, FAMOF: FAMOF, TYPE: TYPE, fa: fa, pct: pct, merge: merge, clearCache: function () { CACHE = {}; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = Hub.tradeEngine;
})(typeof window !== 'undefined' ? window : globalThis);
