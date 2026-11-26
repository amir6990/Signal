/* =====================================================================
 * TIME-CYCLE ENGINE — directive 21 + addendum «Independent Asset-Specific Time-Cycle Analysis» (2026-11-19).  Hub.cycles
 *
 * ARCHITECTURE RULE: every asset (each index, gold, each coin, each currency, BTC, ETH, oil, the ounce, each share, each fund …) has its
 * own cycle engine — its own input series, its own turning-point scales, its own cycle lengths, its own choice of method, its own
 * walk-forward record and its own forecast log. Nothing computed for one asset enters another asset's profile: no pooling, no shared
 * cycle length, no inherited validity. The engines share only code. Links between markets live in a separate layer (syncLayer) that
 * reads the finished profiles and never writes back into them.
 *
 * ASSET-SPECIFIC CYCLE PROFILE (profile(x)), from the asset's own cleaned history:
 *   scales     causal ZigZag at k × ATR14 for k ∈ {1.5, 2, 3, 4, 6, 8, 12}; per scale: turning points, H→H, L→L, H→L, L→H intervals
 *              (median, quartiles, coefficient of variation = stability) and the drift of the cycle length (late half ÷ early half)
 *   horizons   a scale belongs to the short / medium / long horizon by ITS OWN median full-cycle length on this asset (≤ 40, 40–120,
 *              > 120 sessions) — so one asset's «medium» may be 3 × ATR and another's 8 × ATR; the bands only name the horizon, the
 *              lengths are found in the data
 *   methods    per horizon, every candidate: pivot intervals, Fibonacci time, their agreement (each on every scale of the horizon),
 *              spectral (FFT, window sized to the asset's history, period band of the horizon) and wavelet (Morlet-weighted local fit)
 *   selection  nested walk-forward: forecasts every 5 sessions over the last 60%; at the start of each 60-session block the method
 *              with the best skill on the forecasts already resolved by then (trailing 750 sessions) is chosen, and only that
 *              method's forecasts in the coming block are scored — the record of the CHOICE is out of sample, so picking the best
 *              of many methods does not flatter the result. The method in use today is chosen the same way.
 *   test       one test per asset × horizon (the out-of-sample record of the choice): cluster-corrected binomial against the same window
 *              width placed at every offset; Holm and Benjamini–Hochberg within the asset's universe (markets / shares / funds);
 *              valid = skill > 0, lift ≥ 1.15, ≥ 15 independent clusters and corrected p < 0.05 (criterion chosen by the user)
 *   multiple   an asset may hold a valid cycle on several horizons at once, and its spectrum may show several peaks (descriptive)
 *   revision   the choice is rolling (recent 750 sessions), and the profile is recomputed when ≥ 5 new sessions arrive or weekly
 * Scores are ranking aids, not probabilities.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  var KEY = 'hub.cycprof.v1', LOG = 'hub.cyclog.v1', PLOG = 'hub.ptplog.v1', CRIT = 'hub.cycles.crit', VER = 'p2', PVER = 1;   // PVER: the price–time progress layer (2026-11-26), added to existing profiles without recomputing them
  var HZ = [{ id: 's', fa: 'کوتاه‌مدت', lo: 0, hi: 40, pmin: 8, pmax: 40 }, { id: 'm', fa: 'میان‌مدت', lo: 40, hi: 120, pmin: 40, pmax: 120 }, { id: 'l', fa: 'بلندمدت', lo: 120, hi: 1e9, pmin: 120, pmax: 400 }];
  var KG = [1.5, 2, 3, 4, 6, 8, 12], STRIDE = 5, BLOCK = 60, TRAIL = 750, MINRES = 8;
  var MFA = { int: 'فاصلهٔ نقاط عطف', fib: 'فیبوناچی زمانی', agree: 'هم‌پوشانی فاصلهٔ نقاط عطف و فیبوناچی', spec: 'تحلیل طیفی (فوریه، پریودوگرام)', wav: 'موجک (برازش محلی مورله)', acf: 'خودهمبستگی (دورهٔ ACF با لنگر نقطهٔ عطف)', hil: 'تبدیل هیلبرت (فاز لحظه‌ای سیگنال باندگذر)' };
  function U() { return Hub.util; }
  function isF(x) { return typeof x === 'number' && isFinite(x); }
  function q(a, p) { if (!a.length) return NaN; var s = a.slice().sort(function (x, y) { return x - y; }), i = (s.length - 1) * p, lo = Math.floor(i); return s[lo] + (s[Math.min(s.length - 1, lo + 1)] - s[lo]) * (i - lo); }

  /* ---------- series ---------- */
  /* data cleaning (directive 21 fix): sessions on which the price did not trade must not count as sessions — a frozen market (index
     unchanged for weeks during a closure), a halted share (zero volume) or a stale quote (same close, high = low) would stretch every
     interval and shrink the ATR, so turning points and cycle lengths are measured on traded sessions only.
       · rows marked noTrade, and shares with zero volume
       · a stale quote: close equal to the previous kept close with high = low (only on series that do carry a high / low)
       · runs of identical closes: from the third identical session on (two equal closes can be genuine) */
  function clean(R) { var n = R.length, hl = 0; R.forEach(function (r) { if (r.high > 0 && r.low > 0 && r.high > r.low) hl++; }); var hasHL = hl > n * 0.5, out = [], run = 0, dropped = 0;
    R.forEach(function (r) { var p = out[out.length - 1];
      if (r.noTrade || isF(r.vol) && r.vol === 0 && isF(r.val) && r.val === 0) { dropped++; return; }
      if (p && r.close === p.close) { run++; if (hasHL && !(r.high > r.low) || run >= 2) { dropped++; return; } } else run = 0;
      out.push(r); }); out.dropped = dropped; return out; }
  function ser(rows) { var R = clean((rows || []).filter(function (r) { return r && r.close > 0; })), S = { d: [], c: [], h: [], l: [], dropped: R.dropped };
    R.forEach(function (r) { S.d.push(r.date); S.c.push(r.close); S.h.push(r.high > 0 ? Math.max(r.high, r.close) : r.close); S.l.push(r.low > 0 ? Math.min(r.low, r.close) : r.close); }); S.n = S.c.length; S.atr = atr(S); return S; }
  function fromX(X) { var rows = []; for (var i = 0; i < X.n; i++) rows.push({ date: X.d[i], close: X.c[i], high: X.h[i], low: X.l[i], vol: X.v ? X.v[i] : undefined }); return ser(rows); }
  function atr(S) { var a = new Array(S.n), v = NaN; for (var i = 0; i < S.n; i++) { var tr = i ? Math.max(S.h[i] - S.l[i], Math.abs(S.h[i] - S.c[i - 1]), Math.abs(S.l[i] - S.c[i - 1])) : S.h[i] - S.l[i]; if (!(tr > 0)) tr = Math.abs(i ? S.c[i] - S.c[i - 1] : 0) || S.c[i] * 0.005; v = i < 14 ? (isF(v) ? (v * i + tr) / (i + 1) : tr) : (v * 13 + tr) / 14; a[i] = v; } return a; }

  /* ---------- causal ZigZag: turn {i: extreme, t: session it became known, type 'H'|'L', p} ---------- */
  function zigzag(S, k) {
    var P = [], dir = 0, ei = 0, ep = S.c[0];
    for (var i = 1; i < S.n; i++) { var c = S.c[i], th = k * S.atr[i];
      if (dir >= 0) { if (c > ep || dir === 0 && c >= ep) { ep = c; ei = i; if (!dir && c - S.c[0] > th) dir = 1; } if (dir === 1 && ep - c >= th) { P.push({ i: ei, t: i, type: 'H', p: ep }); dir = -1; ep = c; ei = i; continue; } }
      if (dir <= 0) { if (c < ep) { ep = c; ei = i; if (!dir && S.c[0] - c > th) dir = -1; } if (dir === -1 && c - ep >= th) { P.push({ i: ei, t: i, type: 'L', p: ep }); dir = 1; ep = c; ei = i; } }
    }
    P.cur = { dir: dir, ei: ei, ep: ep }; return P;
  }
  function known(P, t) { var o = []; for (var j = 0; j < P.length && P[j].t <= t; j++) o.push(P[j]); return o; }

  /* ---------- methods: forecast of the next turn after session t → { type, a, b } (session indices, a > t) ---------- */
  function mInt(P, t) {
    if (P.length < 8) return null; var last = P[P.length - 1], D = [];
    for (var j = 0; j < P.length - 1; j++) if (P[j].type === last.type && P[j + 1].type !== last.type) D.push(P[j + 1].i - P[j].i);
    if (D.length < 4) return null; var a = last.i + Math.round(q(D, 0.25)), b = last.i + Math.round(q(D, 0.75)), c90 = last.i + Math.round(q(D, 0.9));
    var over = false; if (b <= t) { if (c90 <= t) return null; a = t + 1; b = c90; over = true; } else a = Math.max(a, t + 1);
    return { type: last.type === 'H' ? 'L' : 'H', a: a, b: b, n: D.length, med: q(D, 0.5), cv: sd(D) / mean(D), over: over };
  }
  function mFib(P, t) {
    if (P.length < 2) return null; var last = P[P.length - 1], prev = P[P.length - 2], D = last.i - prev.i; if (D < 3) return null;
    var R = [0.618, 1, 1.618, 2.618], tol = Math.max(2, Math.round(0.1 * D));
    for (var j = 0; j < R.length; j++) { var c = last.i + Math.round(R[j] * D); if (c + tol > t) return { type: last.type === 'H' ? 'L' : 'H', a: Math.max(t + 1, c - tol), b: c + tol, r: R[j], D: D }; }
    return null;
  }
  // radix-2 FFT (in place), real input
  function fft(re, im) { var n = re.length, i, j = 0, k, m;
    for (i = 1; i < n; i++) { var bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { var tr = re[i]; re[i] = re[j]; re[j] = tr; tr = im[i]; im[i] = im[j]; im[j] = tr; } }
    for (m = 2; m <= n; m <<= 1) { var ang = -2 * Math.PI / m, wr = Math.cos(ang), wi = Math.sin(ang);
      for (i = 0; i < n; i += m) { var cr = 1, ci = 0; for (k = 0; k < m / 2; k++) { var ar = re[i + k + m / 2] * cr - im[i + k + m / 2] * ci, ai = re[i + k + m / 2] * ci + im[i + k + m / 2] * cr;
        re[i + k + m / 2] = re[i + k] - ar; im[i + k + m / 2] = im[i + k] - ai; re[i + k] += ar; im[i + k] += ai; var t2 = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t2; } } } }
  function detr(x) { var n = x.length, sx = 0, sy = 0, sxy = 0, sxx = 0; for (var i = 0; i < n; i++) { sx += i; sy += x[i]; sxy += i * x[i]; sxx += i * i; } var b = (n * sxy - sx * sy) / (n * sxx - sx * sx), a = (sy - b * sx) / n; return x.map(function (v, i) { return v - a - b * i; }); }
  // red-noise significance of the dominant cycle: AR(1) surrogates with the same lag-1 correlation and variance; the largest power share over
  // the whole period range is compared, so testing many periods at once is accounted for
  function specP(y, share, pmin, pmax) { var n = y.length, m = mean(y), v = 0, c1 = 0; for (var i = 0; i < n; i++) { v += (y[i] - m) * (y[i] - m); if (i) c1 += (y[i] - m) * (y[i - 1] - m); } var r = v > 0 ? c1 / v : 0, sdv = Math.sqrt(v / n * (1 - r * r)), seed = 12345, ge = 0;
    var rnd = function () { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }, gauss = function () { var u = Math.max(1e-12, rnd()), w2 = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * w2); };
    for (var s = 0; s < 99; s++) { var x = [], prev = 0; for (var j = 0; j < n + 50; j++) { prev = r * prev + sdv * gauss(); if (j >= 50) x.push(prev); } if (spectrum(detr(x), pmin, pmax).share >= share) ge++; }
    return (ge + 1) / 100; }
  function mean(a) { return a.reduce(function (s, v) { return s + v; }, 0) / (a.length || 1); }
  function sd(a) { var m = mean(a); return Math.sqrt(a.reduce(function (s, v) { return s + (v - m) * (v - m); }, 0) / Math.max(1, a.length - 1)); }
  // agree: a forecast only when the interval and the Fibonacci windows point to the same turn (same type, overlapping; not overdue) —
  // tested as a method of its own, so «two methods agree» carries its own measured hit rate instead of an assumed one
  function mAgree(Pk, t) { var a = mInt(Pk, t), b = mFib(Pk, t); if (!a || !b || a.over || a.type !== b.type || a.a > b.b || b.a > a.b) return null; return { type: a.type, a: Math.max(a.a, b.a), b: Math.min(a.b, b.b) }; }
  function binomP(x, n, p) { if (n <= 0) return 1; if (p <= 0) return x > 0 ? 0 : 1; if (p >= 1) return 1; var lp = Math.log(p), lq = Math.log(1 - p), lc = 0, s = 0;
    var lf = function (k) { var r = 0; for (var i = 2; i <= k; i++) r += Math.log(i); return r; }, LN = lf(n);
    for (var k = x; k <= n; k++) s += Math.exp(LN - lf(k) - lf(n - k) + k * lp + (n - k) * lq); return Math.min(1, s); }
  /* ---------- spectral: dominant period inside the horizon's band, window sized to the asset's own history ---------- */
  function spectrum(y, pmin, pmax) { var n = y.length, re = y.map(function (v, i) { return v * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1))); }), im = y.map(function () { return 0; }); fft(re, im);
    var best = -1, bk = 0, tot = 0, pw = []; for (var k = 1; k < n / 2; k++) { var p = re[k] * re[k] + im[k] * im[k], per = n / k; pw.push([per, p]); tot += p; if (per >= pmin && per <= pmax && p > best) { best = p; bk = k; } } return { k: bk, share: tot > 0 ? best / tot : 0, pw: pw, tot: tot }; }
  function winOf(n) { var w = 128; while (w * 2 <= Math.min(1024, Math.floor(n * 0.4))) w *= 2; return w; }
  function mSpec(S, t, o) {
    var W = o.W; if (t + 1 < W) return null; var y = detr(S.c.slice(t + 1 - W, t + 1).map(Math.log)), sp = spectrum(y, o.pmin, Math.min(o.pmax, W / 2)); if (!sp.k) return null;
    // phase from the plain DFT coefficient at that frequency (no taper), so the projected crest / trough is not shifted
    var k = sp.k, cr = 0, ci = 0; for (var i = 0; i < W; i++) { cr += y[i] * Math.cos(2 * Math.PI * k * i / W); ci -= y[i] * Math.sin(2 * Math.PI * k * i / W); }
    var ph = Math.atan2(ci, cr), per = W / k, w = 2 * Math.PI / per, half = Math.max(2, Math.round(per / 8));
    var nx = function (target) { var v = (target - ph) / w; while (v <= W - 1) v += per; return v; }, iT = nx(Math.PI), iC = nx(0), first = iT < iC ? ['L', iT] : ['H', iC], off = Math.round(first[1] - (W - 1));
    var f = { type: first[0], a: t + Math.max(1, off - half), b: t + off + half, per: per, share: sp.share }; if (o.sig) f.p = specP(y, sp.share, o.pmin, Math.min(o.pmax, W / 2)); return f;
  }
  /* wavelet: for each period P of the band (10 log-spaced), a Morlet-type local fit of the detrended log price on the sessions up to t —
     one-sided Gaussian envelope (σ = 0.75 P, no future data) on a cosine / sine pair; the period whose fit explains the most variance
     gives the phase now and the next crest / trough. Local in time: the dominant period may change from one part of the history to another. */
  var WK = {};   // envelope / cosine / sine tables per period (pure functions of the period; shared code, not shared data)
  function wkOf(P, L) { var key = P.toFixed(4) + ':' + L, T = WK[key]; if (T) return T; var w = 2 * Math.PI / P, sg = 0.75 * P; T = { w: new Float64Array(L), c: new Float64Array(L), s: new Float64Array(L) };
    for (var j = 0; j < L; j++) { T.w[j] = Math.exp(-0.5 * (j / sg) * (j / sg)); T.c[j] = Math.cos(w * j); T.s[j] = Math.sin(w * j); } WK[key] = T; return T; }
  function mWav(S, t, o) {
    var best = null, pmax = Math.min(o.pmax, Math.floor((t + 1) / 2.5)); if (pmax < o.pmin * 1.1) return null;
    var lc = S.lc || (S.lc = S.c.map(Math.log));
    for (var g = 0; g < 10; g++) { var P = o.pmin * Math.pow(pmax / o.pmin, g / 9), L = Math.min(t + 1, Math.round(2.5 * P)), T = wkOf(P, L), Wt = T.w, Cs = T.c, Sn = T.s;
      var sw = 0, sj = 0, sy = 0, sjj = 0, sjy = 0, j, wj, yj;
      for (j = 0; j < L; j++) { wj = Wt[j]; yj = lc[t - j]; sw += wj; sj += wj * j; sy += wj * yj; sjj += wj * j * j; sjy += wj * j * yj; }
      var den = sw * sjj - sj * sj; if (!(den > 0)) continue; var b1 = (sw * sjy - sj * sy) / den, b0 = (sy - b1 * sj) / sw;
      var cc = 0, ss = 0, cs = 0, cy = 0, sy2 = 0, tot = 0;
      for (j = 0; j < L; j++) { wj = Wt[j]; yj = lc[t - j] - b0 - b1 * j; var c = Cs[j], sn = Sn[j]; cc += wj * c * c; ss += wj * sn * sn; cs += wj * c * sn; cy += wj * c * yj; sy2 += wj * sn * yj; tot += wj * yj * yj; }
      var d2 = cc * ss - cs * cs; if (!(d2 > 0) || !(tot > 0)) continue; var a = (ss * cy - cs * sy2) / d2, b = (cc * sy2 - cs * cy) / d2, expl = (a * cy + b * sy2) / tot;
      if (!best || expl > best.expl) best = { P: P, a: a, b: b, expl: expl, w: 2 * Math.PI / P }; }
    if (!best) return null;
    // r(lag j) = a cos(ωj) + b sin(ωj); h sessions ahead is lag −h: r = R cos(ωh + φ), φ = atan2(b, a). Crest: ωh + φ ≡ 0, trough: ≡ π
    var ph = Math.atan2(best.b, best.a), nx = function (target) { var h = (target - ph) / best.w; while (h < 1) h += best.P; return h; }, hT = nx(Math.PI), hC = nx(0), first = hT < hC ? ['L', hT] : ['H', hC], half = Math.max(2, Math.round(best.P / 8)), off = Math.round(first[1]);
    return { type: first[0], a: t + Math.max(1, off - half), b: t + off + half, per: best.P, share: best.expl };
  }


  /* directive 23 · 5 — two more candidates, both causal (data up to t only) and scored in the same nested walk-forward:
     ACF       the first autocorrelation peak of the detrended log price inside the horizon's band (Wiener–Khinchin, via FFT) gives the
               period; the timing is anchored on the asset's last confirmed turning point of the scale (next opposite turn half a period
               after it, next same-type turn one period after it)
     Hilbert   the detrended log price is band-passed to the horizon's band (FFT mask), the analytic signal gives the instantaneous phase
               at t and the instantaneous frequency (mean phase advance of the last quarter period); the next crest (phase 0) or trough (π)
               is projected from them. End effects of the band-pass are a known weakness; the out-of-sample record decides. */
  function ifft(re, im) { for (var i = 0; i < re.length; i++) im[i] = -im[i]; fft(re, im); var n = re.length; for (var j = 0; j < n; j++) { re[j] /= n; im[j] = -im[j] / n; } }
  // per-session caches shared by the horizons of one asset (the ACF and the forward FFT do not depend on the horizon)
  function acfAt(S, t, W) { var C = S._acf || (S._acf = {}); if (t in C) return C[t]; if (t + 1 < W) return (C[t] = null); var y = detr(S.c.slice(t + 1 - W, t + 1).map(Math.log)), N = 2 * W, re = new Float64Array(N), im = new Float64Array(N);
    for (var i = 0; i < W; i++) re[i] = y[i]; fft(re, im); for (var k = 0; k < N; k++) { re[k] = re[k] * re[k] + im[k] * im[k]; im[k] = 0; } ifft(re, im); return (C[t] = re); }
  function fyAt(S, t, W) { var C = S._fy || (S._fy = {}); if (t in C) return C[t]; if (t + 1 < W) return (C[t] = null); var y = detr(S.c.slice(t + 1 - W, t + 1).map(Math.log)), re = Float64Array.from(y), im = new Float64Array(W); fft(re, im); return (C[t] = { re: re, im: im }); }
  function acfPeriod(S, t, o) { var W = o.W, re = acfAt(S, t, W); if (!re) return null;
    var r0 = re[0]; if (!(r0 > 0)) return null; var lo = Math.max(2, Math.floor(o.pmin)), hi = Math.min(Math.floor(o.pmax), Math.floor(W / 2));
    for (var L = lo + 1; L < hi; L++) { var a = re[L] / r0; if (a > 0.1 && a >= re[L - 1] / r0 && a >= re[L + 1] / r0) return { per: L, r: a }; } return null; }
  function mAcf(Pk, t, per) { if (!per || !Pk.length) return null; var last = Pk[Pk.length - 1], P = per.per, half = Math.max(2, Math.round(P / 8));
    var cand = [{ type: last.type === 'H' ? 'L' : 'H', at: last.i + P / 2 }, { type: last.type, at: last.i + P }]; cand.forEach(function (c) { while (c.at <= t) c.at += P; }); cand.sort(function (a, b) { return a.at - b.at; });
    var c = cand[0], m = Math.round(c.at); return { type: c.type, a: Math.max(t + 1, m - half), b: m + half, per: P, share: per.r }; }
  function mHil(S, t, o) { var W = o.W, F0 = fyAt(S, t, W); if (!F0) return null; var re = Float64Array.from(F0.re), im = Float64Array.from(F0.im);
    var kLo = Math.max(1, Math.floor(W / o.pmax)), kHi = Math.min(W / 2 - 1, Math.ceil(W / o.pmin)), e = 0, tot = 0;
    for (var k = 0; k < W; k++) { var pw = re[k] * re[k] + im[k] * im[k]; if (k > 0 && k < W / 2) tot += pw; if (k >= kLo && k <= kHi) { re[k] *= 2; im[k] *= 2; e += pw; } else { re[k] = 0; im[k] = 0; } }
    ifft(re, im); var ph = function (i) { return Math.atan2(im[i], re[i]); }, q4 = Math.max(3, Math.round(o.pmin / 4)), dsum = 0, nn = 0;
    for (var i = W - q4; i < W; i++) { var d = ph(i) - ph(i - 1); while (d < 0) d += 2 * Math.PI; while (d >= 2 * Math.PI) d -= 2 * Math.PI; dsum += d; nn++; }
    var w = dsum / nn; if (!(w > 2 * Math.PI / (o.pmax * 1.5)) || !(w < 2 * Math.PI / (o.pmin / 1.5))) return null; var P = 2 * Math.PI / w, f0 = ph(W - 1);
    var to = function (target) { var d = target - f0; while (d <= 0) d += 2 * Math.PI; return d / w; }, hT = to(Math.PI), hC = to(2 * Math.PI), first = hT < hC ? ['L', hT] : ['H', hC], half = Math.max(2, Math.round(P / 8)), off = Math.round(first[1]);
    return { type: first[0], a: t + Math.max(1, off - half), b: t + off + half, per: P, share: tot > 0 ? e / tot : 0 }; }

  /* behavioural regimes (directive 23 · 5-7): a two-state Gaussian hidden Markov model on daily log returns (Baum–Welch, 30 iterations)
     and change points of volatility (binary segmentation of squared returns, BIC penalty). Descriptive: they name the regime the asset is
     in and where its behaviour changed; they are not cycle forecasts. */
  function hmm2(r) { var n = r.length; if (n < 250) return null; var m = mean(r), v = sd(r) * sd(r) || 1e-8, mu = [m, m], va = [v * 0.5, v * 2], A = [[0.97, 0.03], [0.05, 0.95]], pi = [0.5, 0.5], al, be, c;
    var pdf = function (x, k) { return Math.exp(-0.5 * (x - mu[k]) * (x - mu[k]) / va[k]) / Math.sqrt(2 * Math.PI * va[k]) + 1e-300; };
    for (var it = 0; it < 30; it++) { al = []; c = [];
      for (var t = 0; t < n; t++) { var a = [0, 0]; for (var k = 0; k < 2; k++) a[k] = (t ? al[t - 1][0] * A[0][k] + al[t - 1][1] * A[1][k] : pi[k]) * pdf(r[t], k); var s = a[0] + a[1] || 1e-300; c.push(s); al.push([a[0] / s, a[1] / s]); }
      be = new Array(n); be[n - 1] = [1, 1]; for (var t2 = n - 2; t2 >= 0; t2--) { var b = [0, 0]; for (var i = 0; i < 2; i++) for (var j = 0; j < 2; j++) b[i] += A[i][j] * pdf(r[t2 + 1], j) * be[t2 + 1][j]; var s2 = c[t2 + 1]; be[t2] = [b[0] / s2, b[1] / s2]; }
      var g = al.map(function (x, t3) { var u = x[0] * be[t3][0], w2 = x[1] * be[t3][1], s3 = u + w2 || 1; return [u / s3, w2 / s3]; }), xi = [[0, 0], [0, 0]];
      for (var t4 = 0; t4 < n - 1; t4++) { var den = 0, tmp = [[0, 0], [0, 0]]; for (var i2 = 0; i2 < 2; i2++) for (var j2 = 0; j2 < 2; j2++) { tmp[i2][j2] = al[t4][i2] * A[i2][j2] * pdf(r[t4 + 1], j2) * be[t4 + 1][j2]; den += tmp[i2][j2]; } for (i2 = 0; i2 < 2; i2++) for (j2 = 0; j2 < 2; j2++) xi[i2][j2] += tmp[i2][j2] / (den || 1); }
      for (var k2 = 0; k2 < 2; k2++) { var sg = 0, sx = 0, sxx = 0; g.forEach(function (q2, t5) { sg += q2[k2]; sx += q2[k2] * r[t5]; }); mu[k2] = sx / (sg || 1); g.forEach(function (q2, t5) { sxx += q2[k2] * (r[t5] - mu[k2]) * (r[t5] - mu[k2]); }); va[k2] = Math.max(1e-10, sxx / (sg || 1));
        var rs = xi[k2][0] + xi[k2][1] || 1; A[k2] = [xi[k2][0] / rs, xi[k2][1] / rs]; } pi = g[0]; }
    var hiV = va[1] > va[0] ? 1 : 0, now = al[n - 1][hiV];
    return { pHi: now, state: now >= 0.5 ? 'hi' : 'lo', vol: [Math.sqrt(va[1 - hiV] * 250), Math.sqrt(va[hiV] * 250)], mu: [mu[1 - hiV] * 250, mu[hiV] * 250], dur: [1 / Math.max(1e-6, 1 - A[1 - hiV][1 - hiV]), 1 / Math.max(1e-6, 1 - A[hiV][hiV])] }; }
  function changePts(r, minSeg) { var x = r.map(function (v) { return v * v; }), out = [], n = x.length, cs = [0]; for (var i = 0; i < n; i++) cs.push(cs[i] + x[i]);
    var seg = function (a, b, d) { if (b - a < 2 * minSeg || d > 6) return; var tot = cs[b] - cs[a], L = b - a, best = 0, bi = -1;
      var ll = function (s, e) { var m2 = (cs[e] - cs[s]) / (e - s); return m2 > 0 ? -(e - s) / 2 * Math.log(m2) : 0; }, base = ll(a, b);
      for (var j = a + minSeg; j <= b - minSeg; j++) { var g2 = ll(a, j) + ll(j, b) - base; if (g2 > best) { best = g2; bi = j; } } if (bi < 0 || best < 1.5 * Math.log(L)) return; out.push(bi); seg(a, bi, d + 1); seg(bi, b, d + 1); };
    seg(0, n, 0); return out.sort(function (a, b) { return a - b; }); }
  /* statistical power of the out-of-sample test: with ne independent clusters at base rate p0, the hits needed for p < 0.05 and the chance
     of reaching them if the true lift were 1.15 (the effect the validity rule asks for). Low power = «no valid cycle» is not evidence of no cycle. */
  function power(ne, p0) { if (!(ne >= 1) || !(p0 > 0 && p0 < 1)) return null; var x = 0; while (x <= ne && binomP(x, ne, p0) >= 0.05) x++; if (x > ne) return { need: null, liftNeed: null, pw: 0 };
    var p1 = Math.min(0.999, p0 * 1.15); return { need: x, liftNeed: x / ne / p0, pw: binomP(x, ne, p1) }; }
  /* ---------- the asset's own turning-point intervals ---------- */
  function dist(D) { return D.length >= 3 ? { med: q(D, 0.5), q1: q(D, 0.25), q3: q(D, 0.75), cv: sd(D) / (mean(D) || 1), n: D.length } : null; }
  function intervals(P) { var HH = [], LL = [], HL = [], LH = [], full = [];
    for (var j = 1; j < P.length; j++) { var g = P[j].i - P[j - 1].i; if (P[j - 1].type === 'H') HL.push(g); else LH.push(g); if (j >= 2 && P[j].type === P[j - 2].type) { var f = P[j].i - P[j - 2].i; full.push(f); if (P[j].type === 'H') HH.push(f); else LL.push(f); } }
    var h2 = Math.floor(full.length / 2), drift = full.length >= 8 ? q(full.slice(h2), 0.5) / (q(full.slice(0, h2), 0.5) || 1) : null;
    return { HH: dist(HH), LL: dist(LL), HL: dist(HL), LH: dist(LH), full: dist(full), drift: drift }; }

  /* ---------- walk-forward record of one candidate (method × scale) on one asset ---------- */
  // P: full-sample ZigZag of the scale, used only to score; gen(t): the forecast with data up to t
  function evalCfg(S, P, gen, start) {
    var n = S.n, F = [], seen = {}; for (var t = start; t < n - 15; t += STRIDE) { var f = gen(t); if (!f || f.b >= n - 1) continue; f = Object.assign({}, f); var id = f.type + f.a + ':' + f.b; if (seen[id]) continue; seen[id] = 1; f.t = t; F.push(f); }
    var pv = { L: [], H: [] }, cnt = { L: new Int32Array(n + 1), H: new Int32Array(n + 1) }; P.forEach(function (p) { pv[p.type].push(p); });
    ['L', 'H'].forEach(function (ty) { var c = cnt[ty], mk = new Uint8Array(n); pv[ty].forEach(function (p) { mk[p.i] = 1; }); for (var i = 0; i < n; i++) c[i + 1] = c[i] + mk[i]; });
    var maxOff = 0; F.forEach(function (f) { maxOff = Math.max(maxOff, f.b - f.t); });
    F.forEach(function (f) { var c = cnt[f.type], has = function (a, b) { return c[Math.min(n, b + 1)] - c[Math.max(0, Math.min(n, a))] > 0; };
      f.hit = has(f.a, f.b); if (f.hit) { var p = pv[f.type].filter(function (x) { return x.i >= f.a && x.i <= f.b; })[0]; f.ti = p.i; f.res = Math.max(f.b, p.t); } else f.res = f.b + 20;
      var wd = f.b - f.a, ok = 0, tot = 0; for (var o = 1; o + wd <= maxOff && f.t + o + wd < n; o++) { tot++; if (has(f.t + o, f.t + o + wd)) ok++; } f.p0 = tot ? ok / tot : 0; });
    return F;
  }
  function stats(F, S) {
    if (F.length < 8) return { n: F.length };
    var hit = 0, p0 = 0, err = [], dOk = 0, dN = 0; F.forEach(function (f) { if (f.hit) { hit++; err.push(Math.abs(f.ti - (f.a + f.b) / 2)); } p0 += f.p0; var e2 = Math.min(S.n - 1, f.b + 10); if (e2 > f.a) { dN++; if ((S.c[e2] > S.c[f.a]) === (f.type === 'L')) dOk++; } });
    var G = F.slice().sort(function (a, b) { return a.t - b.t; }), ne = 0, cb = -1, ct = ''; G.forEach(function (f) { if (f.type !== ct || f.a > cb) { ne++; ct = f.type; cb = f.b; } else cb = Math.max(cb, f.b); });
    var prec = hit / F.length; p0 /= F.length;
    return { n: F.length, ne: ne, hit: hit, prec: prec, p0: p0, skill: prec - p0, lift: p0 > 0 ? prec / p0 : null, p: binomP(Math.round(prec * ne), ne, p0), err: err.length ? q(err, 0.5) : null, dir: dN ? dOk / dN : null };
  }
  // the method in use at session tau: best skill on the forecasts resolved by then (trailing window); none when no candidate has an edge
  function choose(cf, tau) { var best = null;
    cf.forEach(function (c) { var R = c.F.filter(function (f) { return f.res <= tau && f.t >= tau - TRAIL; }); if (R.length < MINRES) return; var sc = 0; R.forEach(function (f) { sc += (f.hit ? 1 : 0) - f.p0; }); sc /= R.length; if (sc > 0 && (!best || sc > best.sc)) best = { c: c, sc: sc, nR: R.length }; });
    return best; }

  /* ---------- the asset-specific cycle profile ---------- */
  function profile(x) {
    var S = x.S || ser(x.rows), n = S.n, base = { key: x.key, sym: x.sym, cls: x.cls, v: VER, at: Date.now(), raw: x.raw || n, n: n, last: S.d[n - 1], from: S.d[0], to: S.d[n - 1], dropped: S.dropped || 0 };
    if (n < 400) return Object.assign(base, { ok: false, why: 'تاریخچهٔ معامله‌شده کمتر از ۴۰۰ جلسه' });
    var start = Math.max(150, Math.floor(n * 0.4)), W = winOf(n), hl = 0; for (var i = 0; i < n; i++) if (S.h[i] > S.l[i]) hl++;
    var scales = KG.map(function (k) { var P = zigzag(S, k); if (P.length < 10) return null; var iv = intervals(P); return iv.full ? { k: k, P: P, nPiv: P.length, iv: iv, C: iv.full.med } : null; }).filter(Boolean);
    var hz = HZ.map(function (H) {
      var sc = scales.filter(function (s) { return s.C > H.lo && s.C <= H.hi; }), cf = [];
      sc.forEach(function (s) { ['int', 'fib', 'agree'].forEach(function (m) { cf.push({ id: m + '@' + s.k, m: m, k: s.k, P: s.P, gen: function (t) { var Pk = known(s.P, t); return m === 'int' ? mInt(Pk, t) : m === 'fib' ? mFib(Pk, t) : mAgree(Pk, t); } }); }); });
      var pmax = Math.min(H.pmax, W / 2);
      if (sc.length && pmax > H.pmin * 1.2) { var cS = {}, cW = {}, oS = { W: W, pmin: H.pmin, pmax: pmax }, oW = { pmin: H.pmin, pmax: H.pmax };
        var gS = function (t) { return t in cS ? cS[t] : (cS[t] = mSpec(S, t, oS)); }, gW = function (t) { return t in cW ? cW[t] : (cW[t] = mWav(S, t, oW)); };
        var cA = {}, cH = {}, gA = function (t) { return t in cA ? cA[t] : (cA[t] = acfPeriod(S, t, oS)); }, gH = function (t) { return t in cH ? cH[t] : (cH[t] = mHil(S, t, oS)); };
        sc.forEach(function (s) { cf.push({ id: 'spec@' + s.k, m: 'spec', k: s.k, P: s.P, gen: gS }); cf.push({ id: 'wav@' + s.k, m: 'wav', k: s.k, P: s.P, gen: gW });
          cf.push({ id: 'acf@' + s.k, m: 'acf', k: s.k, P: s.P, gen: function (t) { return mAcf(known(s.P, t), t, gA(t)); } }); cf.push({ id: 'hil@' + s.k, m: 'hil', k: s.k, P: s.P, gen: gH }); }); }
      cf.forEach(function (c) { c.F = evalCfg(S, c.P, c.gen, start); c.st = stats(c.F, S); });
      // nested walk-forward: the choice made at each block is scored only on the block after it
      var oos = [], hist = [], prev = null; for (var tau = start + 120; tau < n - 15; tau += BLOCK) { var b = choose(cf, tau), id = b ? b.c.id : null; if (id !== prev) hist.push({ d: S.d[tau], id: id }); prev = id; if (b) b.c.F.forEach(function (f) { if (f.t >= tau && f.t < tau + BLOCK) oos.push(f); }); }
      var cur = choose(cf, n - 1);
      // policy B (directive 23 · 5-7): the same choice, but the trailing window starts at the latest volatility change point known at tau
      // (causal: change points found on data up to tau only), so a method that worked in an earlier regime does not carry over
      var oosB = [], lr = []; for (var u = 1; u < n; u++) lr.push(Math.log(S.c[u] / S.c[u - 1]));
      for (var tau2 = start + 120; tau2 < n - 15; tau2 += BLOCK) { var cps = changePts(lr.slice(0, tau2), 60), cp = cps.length ? cps[cps.length - 1] + 1 : 0, from = Math.max(cp, tau2 - TRAIL);
        var bB = null; cf.forEach(function (c) { var R = c.F.filter(function (f) { return f.res <= tau2 && f.t >= from; }); if (R.length < MINRES) return; var sc2 = 0; R.forEach(function (f) { sc2 += (f.hit ? 1 : 0) - f.p0; }); sc2 /= R.length; if (sc2 > 0 && (!bB || sc2 > bB.sc)) bB = { c: c, sc: sc2 }; });
        if (bB) bB.c.F.forEach(function (f) { if (f.t >= tau2 && f.t < tau2 + BLOCK) oosB.push(f); }); }
      var stA = stats(oos, S), stB = stats(oosB, S), cpsN = changePts(lr, 60), fromN = Math.max(cpsN.length ? cpsN[cpsN.length - 1] + 1 : 0, n - 1 - TRAIL), curB = null;
      cf.forEach(function (c) { var R = c.F.filter(function (f) { return f.res <= n - 1 && f.t >= fromN; }); if (R.length < MINRES) return; var sc2 = 0; R.forEach(function (f) { sc2 += (f.hit ? 1 : 0) - f.p0; }); sc2 /= R.length; if (sc2 > 0 && (!curB || sc2 > curB.sc)) curB = { c: c, sc: sc2, nR: R.length }; });
      // directive 29: the price–time progress layer on this horizon's scale — its own walk-forward record against a same-width benchmark
      // (decides whether its windows are shown as validated) and its own calibration of temporary / main turn / continuation
      var kP = cur ? cur.c.k : sc.length ? sc.slice().sort(function (a2, b2) { return b2.nPiv - a2.nPiv; })[0].k : null, ptp = kP ? ptpProfile(S, kP, start, (sc.filter(function (x2) { return x2.k === kP; })[0] || {}).P) : null;
      return { id: H.id, fa: H.fa, pmin: H.pmin, pmax: H.pmax, oosB: stB, ptp: ptp, curB: curB ? { id: curB.c.id, m: curB.c.m, k: curB.c.k, sc: curB.sc, nR: curB.nR } : null, pow: stA.ne ? power(stA.ne, stA.p0) : null,
        scales: sc.map(function (s) { return { k: s.k, nPiv: s.nPiv, C: s.C, iv: s.iv }; }),
        cfg: cf.map(function (c) { var t2 = c.st; return { id: c.id, m: c.m, k: c.k, n: t2.n, ne: t2.ne, prec: t2.prec, p0: t2.p0, skill: t2.skill, p: t2.p }; }),
        oos: stA, nCfg: cf.length, hist: hist.slice(-12), cur: cur ? { id: cur.c.id, m: cur.c.m, k: cur.c.k, sc: cur.sc, nR: cur.nR } : null };
    });
    // several cycles at once (descriptive): the strongest peaks of the asset's own spectrum on its last W sessions
    var y = detr(S.c.slice(n - W).map(Math.log)), sp = spectrum(y, 8, W / 2), pk = [];
    for (var j = 1; j < sp.pw.length - 1; j++) { var a = sp.pw[j]; if (a[0] >= 8 && a[0] <= W / 2 && a[1] > sp.pw[j - 1][1] && a[1] > sp.pw[j + 1][1]) pk.push({ per: a[0], share: a[1] / sp.tot }); }
    pk.sort(function (a, b) { return b.share - a.share; }); pk = pk.slice(0, 3); pk.forEach(function (p) { p.p = specP(y, p.share, 8, W / 2); });
    var lr2 = []; for (var u2 = Math.max(1, n - 1500); u2 < n; u2++) lr2.push(Math.log(S.c[u2] / S.c[u2 - 1])); var off2 = Math.max(1, n - 1500);
    var hm = null, cpL = []; try { hm = hmm2(lr2); cpL = changePts(lr2, 60).map(function (i) { return S.d[off2 + i]; }); } catch (e) { hm = null; }
    return Object.assign(base, { ok: true, W: W, hl: hl > n * 0.5, start: S.d[start], hz: hz, peaks: pk, reg: hm, cps: cpL.slice(-5) });
  }

  // the progress layer's own walk-forward record and calibration on one scale (stored in the profile; PVER marks its version)
  function ptpProfile(S, kP, start, P) { try { P = P || zigzag(S, kP); var BT = ptpBacktest(S, P, start), sm = ptpSummary(BT), ki = KG.indexOf(kP), Psm = KG[ki - 1] ? zigzag(S, KG[ki - 1]) : null, cl = ptpCalib(S, P, Psm, start);
      return { v: PVER, k: kP, sum: { n: sm.n, hitM: sm.hitM, hitBw: sm.hitBw, disc: sm.disc, pCond: sm.pCond, pBench: sm.pBench, wM: sm.wM, eM: sm.eM, prM: sm.prM, prB: sm.prB, pErr: sm.pErr, delay: sm.delay },
        sel: sm.disc >= 8 && sm.pCond < 0.1 ? 'valid' : sm.disc >= 8 && sm.pBench < 0.1 ? 'worse' : 'none', cal: cl }; } catch (e) { return { v: PVER, k: kP, err: e.message, sel: 'none' }; } }
  function ptpScale(H) { return H.cur ? H.cur.k : H.scales && H.scales.length ? H.scales.slice().sort(function (a, b) { return b.nPiv - a.nPiv; })[0].k : null; }
  function needsPtp(p) { return !!(p && p.ok && p.hz && p.hz.some(function (h) { return ptpScale(h) && (!h.ptp || h.ptp.v !== PVER); })); }
  // adds the layer to a stored profile (no recomputation of the profile itself)
  function addPtp(p, x) { var S = x.S || ser(x.rows), start = Math.max(150, Math.floor(S.n * 0.4)); p.hz.forEach(function (h) { var k = ptpScale(h); if (k && (!h.ptp || h.ptp.v !== PVER)) h.ptp = ptpProfile(S, k, start); }); p.ptpAt = Date.now(); return p; }
  /* ---------- multiple testing, within each universe (markets / shares / funds) ---------- */
  function famOf(cls) { return cls === 'stock' ? 'stock' : cls === 'fund' ? 'fund' : 'market'; }
  function crit() { var c = U() && U().store.get(CRIT, null); return c === 'fdr' ? 'fdr' : 'holm'; }
  function correct(D) {
    // every asset × horizon carries two out-of-sample records (policy A: trailing 750 sessions; policy B: since the last change point);
    // both enter the family, so testing two policies is paid for in the correction
    var fam = {}; Object.keys(D.P).forEach(function (k) { var p = D.P[k]; if (!p.ok) return; p.hz.forEach(function (h) { h.test = null; h.testB = null;
      [['A', h.oos], ['B', h.oosB]].forEach(function (q2) { var o = q2[1]; if (!o || !(o.n >= 8) || !isF(o.p)) return; var f = famOf(p.cls); (fam[f] = fam[f] || []).push({ p: p, h: h, pol: q2[0], o: o }); }); }); });
    var cr = crit(); D.fam = {};
    Object.keys(fam).forEach(function (f) { var L = fam[f].sort(function (a, b) { return a.o.p - b.o.p; }), N = L.length, mx = 0, mn = 1; D.fam[f] = N;
      L.forEach(function (x, j) { mx = Math.max(mx, Math.min(1, (N - j) * x.o.p)); x.pH = mx; });
      for (var j = N - 1; j >= 0; j--) { mn = Math.min(mn, Math.min(1, L[j].o.p * N / (j + 1))); L[j].pB = mn; }
      L.forEach(function (x) { var o = x.o, eff = o.skill > 0 && o.lift >= 1.15 && o.ne >= 15, vH = eff && x.pH < 0.05, vF = eff && x.pB < 0.05, d = o.prec - o.p0, z = 3.5;
        var T = { pol: x.pol, p: o.p, pH: x.pH, pB: x.pB, vH: vH, vF: vF, valid: cr === 'fdr' ? vF : vH, fam: f, N: N,
          why: vH ? 'valid' : vF ? 'fdr' : !(o.skill > 0) || !(o.lift >= 1.05) ? 'noskill' : o.lift < 1.15 ? 'small' : o.ne < 15 ? 'thin' : 'power', neNeed: d > 0 ? Math.ceil(z * z * o.p0 * (1 - o.p0) / (d * d)) : null };
        if (x.pol === 'A') x.h.test = T; else x.h.testB = T; }); });
    // the horizon is valid if either policy passes after correction; the record says which one
    Object.keys(D.P).forEach(function (k) { var p = D.P[k]; if (!p.ok) return; p.hz.forEach(function (h) { var A = h.test, B = h.testB; if (!A && B) { h.test = Object.assign({}, B); return; } if (A && B && !A.valid && B.valid) { h.test = Object.assign({}, B, { viaB: true }); } }); });
    return D;
  }
  function load() { var D = U() && U().store.get(KEY, null); return D && D.v === VER ? D : null; }
  function save(D) { try { U().store.set(KEY, D); } catch (e) { /* ignore */ } }
  function setCrit(c) { U().store.set(CRIT, c === 'fdr' ? 'fdr' : 'holm'); var D = load(); if (D) { correct(D); save(D); } }

  /* ---------- the assets: markets from their own stores; every share and fund (except fixed income) from its own adjusted history ---------- */
  function stockRows(px) { var TE = Hub.tradeEngine, R = px.filter(function (r) { return !r.live && r.close > 0; }); if (!TE || !TE.prep) return R; var X = TE.prep(R), o = []; for (var i = 0; i < X.n; i++) o.push({ date: X.d[i], close: X.c[i], high: X.h[i], low: X.l[i], vol: X.v[i], val: X.val[i] }); return o; }
  function assets() {
    var A = seriesList().map(function (x) { var r = x.rows.filter(function (q2) { return !q2.live; }); return { key: x.key, sym: x.sym, cls: x.cls, rows: r, raw: r.length, last: r.length ? r[r.length - 1].date : 0, pri: 0 }; });
    var ST = U().store.get('hub.sigstocks.v1', null);
    if (ST && ST.watch) ST.watch.forEach(function (w) { var d = ST.data[w.symbol], px = d && d.px; if (w.active === false || !px || px.length < 400 || w.ftype === 'fixed') return; var off = px.filter(function (r) { return !r.live; });
      var fund = !!w.ftype || /صندوق/.test(w.sector || ''); A.push({ key: 's:' + w.symbol, sym: w.symbol, cls: fund ? 'fund' : 'stock', px: off, raw: off.length, last: off.length ? off[off.length - 1].date : 0, pri: 1 + 1 / (1 + off.slice(-60).reduce(function (s, r) { return s + (r.val || 0); }, 0)) }); });
    return A;
  }
  /* refresh(progress, opt): (re)computes the stale profiles — markets first, then shares and funds by liquidity — in small slices so the
     page stays responsive; opt.budget (ms) caps one call, the rest is picked up by the next call. Stale = new asset, ≥ 5 new sessions,
     a week old, or a new engine version. Corrections and the cross-market layer are recomputed at the end. */
  function refresh(progress, opt) {
    opt = opt || {}; var D = load() || { v: VER, P: {} }, A = assets(), now = Date.now();
    var todo = A.filter(function (a) { var p = D.P[a.key]; return opt.force || !p || p.v !== VER || (p.last !== a.last && (a.raw - p.raw >= 5 || now - p.at > 7 * 864e5)) || now - p.at > 14 * 864e5 || needsPtp(p); }).sort(function (a, b) { return a.pri - b.pri; });
    var i = 0, t0 = Date.now(), budget = opt.budget || Infinity;
    return new Promise(function (res) {
      var step = function () { var t1 = Date.now(); while (i < todo.length && Date.now() - t1 < 40) { var a = todo[i++]; try { var x = a.px ? { key: a.key, sym: a.sym, cls: a.cls, rows: stockRows(a.px), raw: a.raw } : a, p0 = D.P[a.key];
          var fresh = p0 && p0.v === VER && !opt.force && !(p0.last !== a.last && (a.raw - p0.raw >= 5 || now - p0.at > 7 * 864e5)) && now - p0.at <= 14 * 864e5; D.P[a.key] = fresh ? addPtp(p0, x) : profile(x); } catch (e) { D.P[a.key] = { key: a.key, sym: a.sym, cls: a.cls, v: VER, at: Date.now(), raw: a.raw, last: a.last, ok: false, why: 'خطای محاسبه: ' + e.message }; } }
        if (progress) progress(i, todo.length, A.length);
        if (i < todo.length && Date.now() - t0 < budget) return setTimeout(step, 0);
        correct(D); try { D.sync = syncLayer(D); } catch (e) { D.sync = { err: e.message }; } D.at = Date.now(); D.pending = todo.length - i; D.total = A.length; save(D); res(D); };
      step(); });
  }
  function cache() { return load(); }

  /* ---------- CROSS-MARKET LAYER (separate; reads finished profiles, never writes into them) ----------
     For every pair of markets: how often a turning point of one fell within ±5 calendar days of a turning point of the other, each market
     on ITS OWN medium-horizon scale, against 199 circular shifts of the second market's turning points (same count and spacing, timing
     destroyed). Benjamini–Hochberg over the pairs. A current overlap of valid windows is reported with the historical evidence of its pair. */
  function dayN(d) { var y = Math.floor(d / 10000), m = Math.floor(d / 100) % 100, dd = d % 100; return Math.floor(Date.UTC(y, m - 1, dd) / 864e5); }
  function syncLayer(D) {
    var SL = seriesList(), M = [];
    SL.forEach(function (x) { var p = D.P[x.key]; if (!p || !p.ok) return; var h = p.hz.filter(function (h2) { return h2.id === 'm'; })[0], k = h && h.cur ? h.cur.k : h && h.scales.length ? h.scales.slice().sort(function (a, b) { return b.nPiv - a.nPiv; })[0].k : null; if (!k) return;
      var S = ser(x.rows.filter(function (r) { return !r.live; })), P = zigzag(S, k); if (P.length < 10) return; M.push({ key: x.key, sym: x.sym, k: k, S: S, idx: P.map(function (pp) { return pp.i; }), days: P.map(function (pp) { return dayN(S.d[pp.i]); }) }); });
    var rate = function (A, Bd, lo, hi) { var a = A.filter(function (d) { return d >= lo && d <= hi; }); if (a.length < 8) return null; var hit = 0, j = 0, B = Bd.slice().sort(function (x, y) { return x - y; });
      a.forEach(function (d) { while (j < B.length && B[j] < d - 5) j++; if (j < B.length && B[j] <= d + 5) hit++; }); return hit / a.length; };
    var out = [], seed = 7, rnd = function () { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (var i = 0; i < M.length; i++) for (var j = i + 1; j < M.length; j++) { var A = M[i], B = M[j], lo = Math.max(A.days[0], B.days[0]), hi = Math.min(A.days[A.days.length - 1], B.days[B.days.length - 1]), obs = rate(A.days, B.days, lo, hi); if (obs == null) continue;
      var nB = B.S.n, ge = 0, sum = 0; for (var s = 0; s < 199; s++) { var sh = 20 + Math.floor(rnd() * (nB - 40)), Bd = B.idx.map(function (ix) { return dayN(B.S.d[(ix + sh) % nB]); }), r = rate(A.days, Bd, lo, hi) || 0; sum += r; if (r >= obs) ge++; }
      out.push({ a: A.key, b: B.key, symA: A.sym, symB: B.sym, obs: obs, exp: sum / 199, p: (ge + 1) / 200 }); }
    out.sort(function (a, b) { return a.p - b.p; }); var N = out.length, mn = 1; for (var t = N - 1; t >= 0; t--) { mn = Math.min(mn, out[t].p * N / (t + 1)); out[t].q = Math.min(1, mn); }
    return { at: Date.now(), pairs: out, n: M.length };
  }
  function pairQ(D, a, b) { var L = D && D.sync && D.sync.pairs || []; for (var i = 0; i < L.length; i++) if (L[i].a === a && L[i].b === b || L[i].a === b && L[i].b === a) return L[i]; return null; }

  /* ---------- the current view of one asset, from its own profile only ---------- */
  var STFA = { up: 'چرخهٔ صعودی', down: 'چرخهٔ نزولی', approach: 'نزدیک‌شدن به نقطهٔ عطف', inWin: 'داخل پنجرهٔ زمانی حساس', endCorr: 'احتمال پایان اصلاح', startCorr: 'احتمال شروع اصلاح', pressure: 'احتمال تداوم فشار فروش', invalid: 'چرخهٔ نامعتبر یا بدون الگوی قابل اتکا', none: 'بدون روش دارای برتری در این افق' };
  var LVFA = { early: 'هشدار اولیه', serious: 'هشدار جدی', confirmed: 'هشدار تأییدشده', invalid: 'ابطال هشدار', none: '—' };
  // the progress layer of one horizon in a view: on the scale the profile tested; dates from the asset's own calendar
  function ptpOf(S, H, t, cal, P) { var M = H.ptp && H.ptp.v === PVER ? H.ptp : null; if (!M) { var k0 = ptpScale(H); if (!k0) return null; M = { k: k0, sel: 'pending', cal: null, sum: null }; } try { var Pz = P && H.cur && H.cur.k === M.k ? P : zigzag(S, M.k), o = ptpView(S, Pz, M.k, t, M.cal); if (!o) return null;
      o.k = M.k; o.sel = M.sel; o.rec = M.sum; o.selFa = M.sel === 'pending' ? 'آزمون رو به جلوی این دارایی هنوز اجرا نشده (در پس‌زمینه انجام می‌شود)' : M.sel === 'valid' ? 'پنجره‌ها در آزمون رو به جلوی همین دارایی از معیار هم‌عرض بهتر بوده‌اند' : M.sel === 'worse' ? 'پنجره‌ها در آزمون رو به جلوی همین دارایی از معیار هم‌عرض بدتر بوده‌اند — فقط توصیفی' : 'آزمون رو به جلو برتری معناداری نشان نداد — فقط توصیفی';
      var dd = function (a) { return a ? [cal(a[0]), cal(a[1])] : null; }; o.dates = o.win ? { main: dd(o.win.main), early: dd(o.win.early), late: dd(o.win.late), med: cal(o.win.med), bench: dd(o.bw) } : null; o.d0 = S.d[o.i0]; o.dExt = S.d[o.ie]; return o; } catch (e) { return null; } }
  function view(x, opt) {
    opt = opt || {}; var D = opt.D || load(), p = D && D.P[x.key]; if (!p) return { key: x.key, sym: x.sym, cls: x.cls, ok: false, why: 'پروفایل چرخهٔ این دارایی هنوز محاسبه نشده است' };
    if (!p.ok) return { key: x.key, sym: x.sym, cls: x.cls, ok: false, why: p.why, prof: p };
    var S = x.S || (x.px ? ser(stockRows(x.px)) : ser(x.rows.filter(function (r) { return !r.live; }))), n = S.n, t = n - 1;
    var cal = function (i) { if (i <= t) return S.d[i]; var MC = Hub.mktCal; if (MC && MC.nextSessions) { var L = MC.nextSessions(x.cls === 'index' || x.cls === 'stock' || x.cls === 'fund' ? 'stock' : x.cls, S.d[t], i - t, S.d.slice(-60)); return L[L.length - 1]; }
      // no market calendar loaded: calendar days per session from the asset's own last 60 sessions (an estimate of the date, not of the session count)
      var g = function (d) { return Date.UTC(Math.floor(d / 1e4), Math.floor(d / 100) % 100 - 1, d % 100); }, k0 = Math.max(0, t - 60), per = (g(S.d[t]) - g(S.d[k0])) / Math.max(1, t - k0), z = new Date(g(S.d[t]) + Math.round((i - t) * per / 864e5) * 864e5);
      return z.getUTCFullYear() * 1e4 + (z.getUTCMonth() + 1) * 100 + z.getUTCDate(); };
    var hz = p.hz.map(function (H) {
      var CU = H.test && H.test.viaB && H.curB ? H.curB : H.cur; H = Object.assign({}, H, { cur: CU, oos: H.test && H.test.viaB && H.oosB ? H.oosB : H.oos });
      var o = { k: H.cur ? H.cur.k : null, hz: H.id, hzFa: H.fa, H: H, test: H.test, F: [], base: null, agree: [], st: 'none', lvl: 'none' };
      var sc0 = H.scales.filter(function (s) { return s.k === o.k; })[0]; o.cyc = sc0 && sc0.iv.full ? { med: sc0.iv.full.med, q1: sc0.iv.full.q1, q3: sc0.iv.full.q3, cv: sc0.iv.full.cv } : null;
      if (!H.cur) { o.ptp = ptpOf(S, H, t, cal, null); o.stFa = STFA.none; o.lvFa = LVFA.none; return o; }
      var k = H.cur.k, P = zigzag(S, k), Pk = known(P, t), last = Pk[Pk.length - 1], m = H.cur.m;
      o.ptp = ptpOf(S, H, t, cal, P);
      var f = m === 'int' ? mInt(Pk, t) : m === 'fib' ? mFib(Pk, t) : m === 'agree' ? mAgree(Pk, t) : m === 'spec' ? mSpec(S, t, { W: p.W, pmin: H.pmin, pmax: Math.min(H.pmax, p.W / 2), sig: !opt.fast }) : m === 'acf' ? mAcf(Pk, t, acfPeriod(S, t, { W: p.W, pmin: H.pmin, pmax: Math.min(H.pmax, p.W / 2) })) : m === 'hil' ? mHil(S, t, { W: p.W, pmin: H.pmin, pmax: Math.min(H.pmax, p.W / 2) }) : mWav(S, t, { pmin: H.pmin, pmax: H.pmax });
      o.last = last ? { type: last.type, d: S.d[last.i], p: last.p, since: t - last.i } : null; o.leg = P.cur.dir === 1 ? 'up' : P.cur.dir === -1 ? 'down' : 'flat';
      if (!f) { o.stFa = 'روش منتخب امروز پنجره‌ای نمی‌دهد'; o.lvFa = LVFA.none; return o; }
      f.m = m; f.k = k; f.valid = !!(H.test && H.test.valid); f.v = H.oos; f.from = cal(f.a); f.to = cal(f.b); o.F = [f]; o.base = f; o.agree = [f];
      var swings = []; for (var j = 1; j < Pk.length; j++) if (Pk[j].type === f.type) swings.push(Math.abs(Pk[j].p / Pk[j - 1].p - 1));
      var lastOf = function (ty) { for (var j2 = Pk.length - 1; j2 >= 0; j2--) if (Pk[j2].type === ty) return Pk[j2].p; return S.c[t]; };
      var lp = f.type === 'L' ? (P.cur.dir === 1 ? P.cur.ep : lastOf('H')) : (P.cur.dir === -1 ? P.cur.ep : lastOf('L')); o.pr = null; o.prX = 0;
      if (swings.length >= 4) { var a1 = q(swings, 0.25), a2 = q(swings, 0.75); o.pr = f.type === 'L' ? [lp * (1 - a2), lp * (1 - a1)] : [lp * (1 + a1), lp * (1 + a2)];
        if (f.type === 'H' && P.cur.dir === 1 && P.cur.ep > o.pr[1] || f.type === 'L' && P.cur.dir === -1 && P.cur.ep < o.pr[0]) { o.prX = 1; o.pr = null; } }
      o.conf = f.type === 'L' && P.cur.dir === -1 ? P.cur.ep + k * S.atr[t] : f.type === 'H' && P.cur.dir === 1 ? P.cur.ep - k * S.atr[t] : null;
      var inside = f.a <= t + 1 && f.b >= t + 1, near = f.a - t <= 5, leg = o.leg;
      o.st = !f.valid ? 'invalid' : inside ? (f.type === 'L' && leg === 'down' ? 'endCorr' : f.type === 'H' && leg === 'up' ? 'startCorr' : 'inWin') : near ? 'approach' : leg === 'down' && f.type === 'L' && f.a - t > 10 ? 'pressure' : leg === 'up' ? 'up' : 'down';
      o.lvl = f.valid && !f.over && (inside || near) ? 'early' : 'none';
      if (o.lvl !== 'none' && isF(o.conf) && (f.type === 'L' ? S.c[t] >= o.conf && leg === 'down' : S.c[t] <= o.conf && leg === 'up')) o.lvl = 'confirmed';
      o.win = { a: f.from, b: f.to, type: f.type, typeFa: f.type === 'L' ? 'کف' : 'سقف' }; return o; });
    // several valid cycles of THIS asset pointing to the same turn (same type, overlapping windows, near) → serious
    var VH = hz.filter(function (h) { return h.base && h.base.valid; });
    VH.forEach(function (h) { var mates = VH.filter(function (g) { return g !== h && g.base.type === h.base.type && g.base.a <= h.base.b && g.base.b >= h.base.a; }); h.agree = [h.base].concat(mates.map(function (g) { return g.base; }));
      if (h.lvl === 'early' && (mates.length || h.base.m === 'agree')) h.lvl = 'serious'; });
    hz.forEach(function (h) { h.stFa = h.stFa || STFA[h.st]; h.lvFa = LVFA[h.lvl];
      if (h.base) { var v0 = h.base.v || {}, cv = h.cyc ? h.cyc.cv : null, parts = { skill: isF(v0.skill) ? Math.max(0, Math.min(1, v0.skill / 0.25)) : 0, agree: Math.min(1, h.agree.length / 3), near: Math.max(0, 1 - Math.max(0, h.base.a - t) / 20), stab: isF(cv) ? Math.max(0, 1 - cv) : 0.5, width: Math.max(0, 1 - (h.base.b - h.base.a) / 40) };
        h.sc = { s: 30 * parts.skill + 25 * parts.agree + 20 * parts.near + 15 * parts.stab + 10 * parts.width, parts: parts }; } });
    var RANK = { confirmed: 4, serious: 3, early: 2, none: 0 }, head = hz.slice().sort(function (a, b) { return (RANK[b.lvl] - RANK[a.lvl]) || ((b.base && b.base.valid ? 1 : 0) - (a.base && a.base.valid ? 1 : 0)) || (a.hz === 'm' ? -1 : b.hz === 'm' ? 1 : 0); })[0];
    return { key: x.key, sym: x.sym, cls: x.cls, ok: true, px: S.c[t], d: S.d[t], hz: hz, head: head, prof: p, S: opt.keepS ? S : undefined };
  }

  function seriesList(R) {
    var g = function (k) { return U().store.get(k, null); }, ST = g('hub.sigstocks.v1'), GD = g('hub.sig-gold.v1'), FX = g('hub.sig-fx.v1'), GL = g('hub.sigglobal.v1'), L = [];
    var I = ST && ST.data && ST.data._idx || {}, M = ST && ST.idxMeta || {};
    if (I.total) L.push({ key: 'ix:total', sym: 'شاخص کل بورس', cls: 'index', rows: I.total }); if (I.ew) L.push({ key: 'ix:ew', sym: 'شاخص کل هم‌وزن', cls: 'index', rows: I.ew });
    Object.keys(I.ext || {}).forEach(function (c) { var m = M[c] || {}; if (/32097828799138957|67130298613737946/.test(c)) return; L.push({ key: 'ix:' + c, sym: m.name || c, cls: 'index', rows: I.ext[c], ind: !m.headline }); });
    [['g:geram18', GD, 'geram18', 'طلای ۱۸ عیار', 'gold'], ['g:mesghal', GD, 'mesghal', 'مثقال طلا', 'gold'], ['g:sekee', GD, 'sekee', 'سکهٔ امامی', 'gold'], ['g:nim', GD, 'nim', 'نیم‌سکه', 'gold'], ['g:rob', GD, 'rob', 'ربع‌سکه', 'gold'], ['g:ons', GD, 'ons', 'انس جهانی طلا', 'gold'],
      ['g:price_dollar_rl', FX, 'price_dollar_rl', 'دلار آزاد', 'fx'], ['g:price_eur', FX, 'price_eur', 'یورو', 'fx'], ['g:price_aed', FX, 'price_aed', 'درهم', 'fx']].forEach(function (x) { var r = x[1] && x[1].data && x[1].data[x[2]]; if (r && r.length) L.push({ key: x[0], sym: x[3], cls: x[4], rows: r }); });
    (Hub.globalMkt ? Hub.globalMkt.SER : []).forEach(function (s) { var r = GL && GL.data && GL.data[s.id]; if (r && r.length > 300 && /crypto|intl|energy|metals/.test(s.mk)) L.push({ key: 'x:' + s.id, sym: s.name, cls: s.mk === 'crypto' ? 'crypto' : s.mk === 'intl' ? 'intl' : 'commodity', rows: r }); });
    return L;
  }

  /* ---------- forecast record: issued once, never edited; graded after the window ---------- */
  // one record per market × method × horizon × forecast type while it is open; a later re-issue of the same open forecast is not a new one
  function track(views) {
    var L = U().store.get(LOG, null) || { v: 1, f: [] }, add = 0;
    views.forEach(function (v) { if (!v || !v.ok) return; if (!v.head || v.head.lvl === 'none') return;
      v.hz.forEach(function (h) { (h.F || []).forEach(function (f) { if (!f.valid || f.over || !f.from || !f.to) return;
      var wid = v.key + '|' + h.hz + '|' + f.m + '|' + h.k + '|' + f.type; if (L.f.some(function (o) { return o.wid === wid && !o.res; })) return;
      L.f.push({ id: wid + '|' + v.d, wid: wid, at: Date.now(), key: v.key, sym: v.sym, cls: v.cls, m: f.m, k: h.k, hz: h.hz, type: f.type, d0: v.d, px0: v.px, from: f.from, to: f.to, pr: h.base === f ? h.pr : null }); add++; }); }); });
    if (add) { L.f = L.f.slice(-3000); try { U().store.set(LOG, L); } catch (e) { /* ignore */ } }
    return add;
  }
  // grade open forecasts once 10 sessions have passed after the window, against the turns known now (confirmed ones only)
  function grade(seriesByKey) {
    var L = U().store.get(LOG, null); if (!L || !L.f.length) return { n: 0, open: 0, by: [], list: [] }; var ch = 0;
    var idxOf = function (S, d) { for (var i = 0; i < S.n; i++) if (S.d[i] >= d) return i; return S.n; };
    L.f.forEach(function (f) { if (f.res) return; var x = seriesByKey[f.key]; if (!x) return; var S = x.S || ser(x.rows), iTo = idxOf(S, f.to), iFr = idxOf(S, f.from); if (S.n - 1 < iTo + 10) return;
      var T = zigzag(S, f.k).filter(function (p) { return p.type === f.type && S.d[p.i] > f.d0 && p.t < S.n; }), inW = T.filter(function (p) { return p.i >= iFr && p.i <= iTo; })[0], first = T[0];
      var r = inW ? 'hit' : first && first.i < iFr ? 'early' : first && first.i <= iTo + 10 ? 'late' : 'miss', turn = inW || first || null;
      var e10 = Math.min(S.n - 1, iTo + 10), dirOk = iFr < S.n ? (S.c[e10] > S.c[iFr]) === (f.type === 'L') : null;
      f.res = { r: r, at: Date.now(), turn: turn ? S.d[turn.i] : null, err: turn ? turn.i - Math.round((iFr + iTo) / 2) : null, dirOk: dirOk }; ch++; });
    if (ch) try { U().store.set(LOG, L); } catch (e) { /* ignore */ }
    var R = L.f.filter(function (f) { return f.res; }), by = {}; R.forEach(function (f) { var k = f.m + '|' + f.k, b = by[k] = by[k] || { m: f.m, k: f.k, n: 0, hit: 0, early: 0, late: 0, miss: 0, dir: 0, dn: 0 }; b.n++; b[f.res.r]++; if (f.res.dirOk != null) { b.dn++; if (f.res.dirOk) b.dir++; } });
    var ba = {}; R.forEach(function (f) { var b = ba[f.key] = ba[f.key] || { n: 0, hit: 0, err: [] }; b.n++; if (f.res.r === 'hit') b.hit++; if (f.res.err != null) b.err.push(Math.abs(f.res.err)); });
    return { byAsset: ba, n: R.length, open: L.f.length - R.length, by: Object.keys(by).map(function (k) { return by[k]; }), list: L.f.slice(-200).reverse() };
  }


  /* views of every market and of the central records (shares / funds from the engine's adjusted series, the same series as their profile) */
  function all(R) {
    var D = load(), SL = seriesList(), L = SL.map(function (x) { return view(x, { D: D, keepS: true }); });
    var by = R && R.C ? R.C.by : null, zmap = R && R.X ? R.X.zmap || {} : {}, extra = [];
    if (by) Object.keys(by).forEach(function (k) { var r = by[k]; if (r.cls !== 'stock' && r.cls !== 'fund') return; var z = zmap[k]; if (!z || !z.R || !z.R.X || z.R.X.n < 300) return; extra.push(view({ key: k, sym: r.sym, cls: r.cls, S: fromX(z.R.X) }, { D: D, fast: true })); });
    // cross-market layer: current overlaps of valid windows (each from its own engine), with the historical evidence of each pair
    var sync = []; L.filter(function (v) { return v.ok; }).forEach(function (v) { v.hz.forEach(function (h) { if (h.base && h.base.valid && h.win) sync.push({ key: v.key, sym: v.sym, hz: h.hzFa, type: h.win.typeFa, a: h.win.a, b: h.win.b }); }); });
    var groups = []; sync.sort(function (a, b) { return a.a - b.a; }).forEach(function (s) { var g = groups.filter(function (G) { return G.a <= s.b && G.b >= s.a; })[0]; if (g) { g.items.push(s); g.a = Math.max(g.a, s.a); g.b = Math.min(g.b, s.b); } else groups.push({ a: s.a, b: s.b, items: [s] }); });
    groups.forEach(function (g) { g.ev = []; for (var i = 0; i < g.items.length; i++) for (var j = i + 1; j < g.items.length; j++) { if (g.items[i].key === g.items[j].key) continue; var pq = pairQ(D, g.items[i].key, g.items[j].key); if (pq) g.ev.push(pq); } });
    return { markets: L, stocks: extra, sync: groups.filter(function (g) { return g.items.length >= 2; }), D: D };
  }
  /* compact verdict on the central record (tradeengine.centralBuild), from each asset's own stored profile (nothing is computed here) */
  function central(by, R0) {
    var D = load(); if (!D) return 0; var zmap = (R0 && R0.zmap) || {}, SL = null, nOk = 0, PL = ptpLog();
    Object.keys(by).forEach(function (k) { var r = by[k], x = null;
      if (r.cls === 'stock' || r.cls === 'fund') { var z = zmap[k]; if (z && z.R && z.R.X && z.R.X.n >= 300) x = { key: k, sym: r.sym, cls: r.cls, S: fromX(z.R.X) }; }
      else { SL = SL || seriesList(); var alt = k.replace(/^g:/, 'x:'); x = SL.filter(function (s) { return s.key === k || s.key === alt; })[0] || null; }
      if (!x) return; var v = view(x, { D: D, fast: true, keepS: true }); if (!v.ok) return; var h = v.head; try { ptpGrade(PL, v.S, v.key); ptpTrack(PL, v); } catch (e) { /* the record never blocks the verdict */ } v.S = undefined;
      r.cyc = { lvl: h.lvl, lvFa: h.lvFa, st: h.st, stFa: h.stFa, hz: h.hzFa, win: h.win || null, pr: h.pr || null, prX: h.prX || 0, conf: isF(h.conf) ? h.conf : null, sc: h.sc ? Math.round(h.sc.s) : null, m: h.base ? h.base.m : null,
        valid: v.hz.filter(function (g) { return g.base && g.base.valid; }).map(function (g) { return g.hz + ':' + g.base.m; }),
        pt: ptCompact(v) }; nOk++; });
    if (PL.dirty) { PL.f = PL.f.slice(-4000); delete PL.dirty; try { U().store.set(PLOG, PL); } catch (e) { /* ignore */ } }
    return nOk;
  }
  // the compact progress record that travels in the central record (and to the phone): one row per horizon with a progress reading
  var R4 = function (x) { return isF(x) ? Math.round(x * 1e4) / 1e4 : null; };
  function ptCompact(v) { var L = []; v.hz.forEach(function (h) { var o = h.ptp; if (!o) return; L.push({ hz: h.hz, k: o.k, dir: o.dir, st: o.state, fl: o.flags, sy: o.sync, tp: R4(o.tProg), pp: R4(o.pProg), tq: R4(o.tPct), pq: R4(o.pPct), el: o.el, n: o.nLeg,
      td: o.tDebt != null ? o.tDebt : null, pd: R4(o.pDebt), tg: o.target, d0: o.d0, p0: o.p0, ext: o.ext, dx: o.dExt, cf: o.confirm, w: o.dates, pr: o.pr, prW: o.prW, dvP: R4(o.devP), dvT: R4(o.devT), by: o.beyond ? 1 : 0, ss: o.scaleSensitive ? 1 : 0,
      tr: o.trend ? { t: R4(o.trend.tau), p: R4(o.trend.p) } : null, sel: o.sel, rec: o.rec ? { h: R4(o.rec.hitM), b: R4(o.rec.hitBw), n: o.rec.n, l: o.rec.disc } : null, tu: o.turn && o.turn.calibrated ? { M: R4(o.turn.major), m: R4(o.turn.minor), c: R4(o.turn.cont), n: o.turn.n } : null }); });
    return L.length ? L : null; }
  // compact form for the stored / published central record (the phone): positional arrays, prices to 5 significant digits, no benchmark
  var PTK = ['hz', 'k', 'dir', 'st', 'fl', 'sy', 'tp', 'pp', 'tq', 'pq', 'el', 'n', 'td', 'pd', 'tg', 'd0', 'p0', 'ext', 'dx', 'cf', 'wm', 'we', 'wl', 'pr', 'pm', 'pe', 'pl', 'sel', 'tu', 'ss', 'tr', 'rc', 'by'];
  var FLC = { normal: 'n', extended: 'x', contracting: 'c', lengthening: 'g', accelerating: 'a', decelerating: 'd', completing: 'p', invalidated: 'i' }, FLD = {}; Object.keys(FLC).forEach(function (k) { FLD[FLC[k]] = k; });
  var S5 = function (x) { return isF(x) ? +x.toPrecision(5) : null; }, A5 = function (a) { return a ? a.map(S5) : null; }, R2 = function (x) { return isF(x) ? Math.round(x * 100) / 100 : null; };
  function ptPack(L) { if (!L || !L.length) return null; return L.map(function (o) { var w = o.w || {};
    return [o.hz, o.k, o.dir, FLC[o.st] || o.st, (o.fl || []).map(function (f) { return FLC[f] || f; }).join(''), o.sy[0], R2(o.tp), R2(o.pp), R2(o.tq), R2(o.pq), o.el, o.n, o.td, R2(o.pd), S5(o.tg), o.d0, S5(o.p0), S5(o.ext), o.dx, S5(o.cf), w.main || null, w.early || null, w.late || null,
      A5(o.pr), A5(o.prW && o.prW.main), A5(o.prW && o.prW.early), A5(o.prW && o.prW.late), o.sel ? o.sel[0] : null, o.tu ? [R2(o.tu.M), R2(o.tu.m), R2(o.tu.c), o.tu.n] : null, o.ss, o.tr ? [R2(o.tr.t), R2(o.tr.p)] : null, o.rec ? [R2(o.rec.h), R2(o.rec.b), o.rec.n] : null, o.by]; }); }
  function ptUnpack(P) { if (!P || !P.length) return null; if (!Array.isArray(P[0])) return P; var SYD = { a: 'ahead', b: 'behind', s: 'sync' }, SLD = { v: 'valid', w: 'worse', n: 'none', p: 'pending' };
    return P.map(function (a) { var o = {}; PTK.forEach(function (k, i) { o[k] = a[i]; }); o.st = FLD[o.st] || o.st; o.fl = String(o.fl || '').split('').map(function (c) { return FLD[c] || c; }); o.sy = SYD[o.sy] || o.sy; o.sel = SLD[o.sel] || o.sel;
      o.w = { main: o.wm, early: o.we, late: o.wl }; o.prW = { main: o.pm, early: o.pe, late: o.pl }; o.tu = o.tu ? { M: o.tu[0], m: o.tu[1], c: o.tu[2], n: o.tu[3] } : null; o.tr = o.tr ? { t: o.tr[0], p: o.tr[1] } : null; o.rec = o.rc ? { h: o.rc[0], b: o.rc[1], n: o.rc[2] } : null; return o; }); }
  /* ---------- preregistered progress forecasts (directive 29 · 7): written when first issued for a leg, never edited, graded when the
     leg's end is confirmed by this asset's own ZigZag; the same-width benchmark window is stored with each forecast ---------- */
  function ptpLog() { var L = U() && U().store.get(PLOG, null); return L && L.v === 1 ? L : { v: 1, f: [] }; }
  function ptpTrack(L, v) { (v.hz || []).forEach(function (h) { var o = h.ptp; if (!o || !o.dates || o.state === 'invalidated') return; var id = v.key + '|' + h.hz + '|' + o.k + '|' + o.d0;
      if (L.f.some(function (r) { return r.id === id; })) return;
      L.f.push({ id: id, at: Date.now(), key: v.key, sym: v.sym, cls: v.cls, hz: h.hz, k: o.k, d0: o.d0, p0: o.p0, dir: o.dir, d: v.d, px: v.px, el: o.el, st: o.state, sy: o.sync, tq: o.tPct, pq: o.pPct, sel: o.sel,
        w: o.dates, pr: o.pr, prW: o.prW ? o.prW.main : null, tg: o.target, tu: o.turn && o.turn.calibrated ? { M: o.turn.major, m: o.turn.minor, c: o.turn.cont } : null }); L.dirty = 1; }); }
  function ptpGrade(L, S, key) { if (!S) return; var open = L.f.filter(function (r) { return r.key === key && !r.res; }); if (!open.length) return; var n = S.n, idx = function (d) { for (var i = 0; i < n; i++) if (S.d[i] >= d) return i; return n; };
    open.forEach(function (r) { var P = zigzag(S, r.k), toT = r.dir > 0 ? 'H' : 'L', e = P.filter(function (p) { return p.type === toT && S.d[p.i] > r.d0 && p.t < n; })[0];
      if (!e) { var lt = r.w && r.w.late && r.w.late[1]; if (lt && idx(lt) + 30 < n) { r.res = { r: 'none', at: Date.now(), note: 'تا ۳۰ جلسه پس از پنجرهٔ دیر هم پایان این موج تأیید نشد' }; L.dirty = 1; } return; }
      var de = S.d[e.i], inW = function (w) { return !!(w && de >= w[0] && de <= w[1]); }, iMed = r.w && r.w.med ? idx(r.w.med) : null, inP = function (pr) { return !!(pr && e.p >= pr[0] && e.p <= pr[1]); };
      r.res = { r: inW(r.w.main) ? 'main' : inW(r.w.early) ? 'early' : inW(r.w.late) ? 'late' : 'out', at: Date.now(), end: de, endPx: e.p, bench: inW(r.w.bench), tErr: iMed != null ? e.i - iMed : null, pIn: inP(r.pr), pInW: inP(r.prW),
        pErr: r.tg ? Math.abs(Math.log(e.p / r.tg)) : null, delay: e.t - e.i, falseDone: r.st === 'completing' && !inW(r.w.main) && !inW(r.w.early), tu: r.tu ? (e.i - idx(r.d) <= 10 ? 'major' : 'other') : null }; L.dirty = 1; }); }
  function ptpStats() { var L = ptpLog(), G = L.f.filter(function (r) { return r.res && r.res.r !== 'none'; }), N = L.f.filter(function (r) { return r.res && r.res.r === 'none'; }).length;
    var agg = function (A) { if (!A.length) return { n: 0 }; var m = function (f) { return A.filter(f).length / A.length; }, md = function (f) { return q(A.map(f).filter(isF), 0.5); };
      return { n: A.length, main: m(function (r) { return r.res.r === 'main'; }), alt: m(function (r) { return r.res.r === 'early' || r.res.r === 'late'; }), bench: m(function (r) { return r.res.bench; }), tErr: md(function (r) { return r.res.tErr != null ? Math.abs(r.res.tErr) : null; }),
        pIn: m(function (r) { return r.res.pIn; }), pErr: md(function (r) { return r.res.pErr; }), delay: md(function (r) { return r.res.delay; }), falseDone: A.filter(function (r) { return r.st === 'completing'; }).length ? A.filter(function (r) { return r.res.falseDone; }).length / A.filter(function (r) { return r.st === 'completing'; }).length : null }; };
    var by = {}; G.forEach(function (r) { (by[r.hz] = by[r.hz] || []).push(r); });
    return { all: agg(G), byHz: Object.keys(by).map(function (k) { return Object.assign({ hz: k }, agg(by[k])); }), open: L.f.filter(function (r) { return !r.res; }).length, noEnd: N, total: L.f.length, list: L.f.slice(-200).reverse() }; }
  /* depth and quality of each market's own data (the «why not valid» panel) */
  function dataQuality() { var D = load(); return seriesList().map(function (x) { var p = D && D.P[x.key]; if (!p) return { key: x.key, sym: x.sym, cls: x.cls, n: x.rows.length, note: 'محاسبه نشده' };
      var sc = {}; (p.hz || []).forEach(function (h) { sc[h.id] = h.scales.reduce(function (s, a) { return Math.max(s, a.nPiv); }, 0); });
      var note = !p.ok ? p.why : p.n < 1000 ? 'تاریخچهٔ کوتاه (' + p.n + ' جلسه)' : !(sc.l >= 12) ? 'نقاط عطف بلندمدت کم' : p.dropped > p.n * 0.05 ? 'جلسه‌های بی‌معاملهٔ زیاد' : 'کافی';
      return { key: x.key, sym: x.sym, cls: x.cls, n: p.n, from: p.from, to: p.to, dropped: p.dropped || 0, piv: sc, hl: !!p.hl, note: note }; }); }
  /* =====================================================================
   * PRICE–TIME PROGRESS OF THE CURRENT CYCLE (directive 29, 2026-11-26) — an upgrade of this engine, on ITS pivots, not a second model.
   *
   * The current leg runs from the last confirmed turn of the asset's chosen scale (k) toward the opposite turn. From the asset's OWN
   * finished legs of the same direction, known at time t (causal):
   *   time      elapsed sessions; time progress = elapsed ÷ median leg length; time percentile = share of past legs that were shorter
   *   price     amplitude so far (log move from the leg start to the leg extreme); price progress = ÷ median amplitude; price percentile
   *   sync      price percentile − time percentile > +0.25 → price ahead of schedule; < −0.25 → behind; else in step
   *   windows   SURVIVAL-CONDITIONED: only the past legs that lasted at least as long as this one so far → main window (their 25–75 %),
   *             early alternative (10–25 %), late alternative (75–90 %); a price range per window from the amplitudes of the past legs
   *             whose length fell in that window (never below the extreme already reached)
   *   debts     time debt = median of the conditioned remaining length (sessions); price debt = log distance from the price to the median
   *             conditioned completion price, in the leg's direction (> 0: still to go; < 0: price already beyond it)
   *   deviation price: (move − expected move on a straight path) ÷ dispersion of amplitudes; time: (elapsed − median) ÷ dispersion of lengths
   *   states    invalidated (price back beyond the leg start: the leg's structure failed) · extended (elapsed ≥ 90th percentile of this
   *             asset's leg lengths, ≥ 8 legs) · lengthening / contracting (Kendall trend of the last ≤ 16 full-cycle lengths, p < 0.10) ·
   *             accelerating (leg speed ≥ 80th percentile) · decelerating (no new extreme for ≥ 30 % of the leg, ≥ 3 sessions) ·
   *             completing (inside the main window AND the amplitude at least at its 25th percentile) · normal (none of these)
   *   robustness the time percentile is recomputed on the neighbouring scales; when they disagree about «extended», the state is flagged
   *             as sensitive to the choice of turning points (not a change in the market)
   *   turns     temporary vs main turn vs continuation in the next 10 sessions: frequencies of this asset's own history in the same
   *             (sync × time-zone) cell, estimated walk-forward; shown as probabilities ONLY when they beat the base rate out of
   *             sample (Brier skill > 0), the cell has ≥ 30 cases and the history ≥ 200 — otherwise «not calibrated»
   * Nothing here is a trade signal; the central verdict reads it as context (Hub.central.life).
   * ===================================================================== */
  var PTST = { normal: 'عادی', extended: 'طولانی‌تر از معمول', contracting: 'کوتاه‌شونده', lengthening: 'بلندشونده', accelerating: 'شتاب‌گیرنده', decelerating: 'کندشونده', completing: 'در محدودهٔ تکمیل', invalidated: 'باطل' };
  var PTEN = { normal: 'Normal', extended: 'Extended', contracting: 'Contracting', lengthening: 'Lengthening', accelerating: 'Accelerating', decelerating: 'Decelerating', completing: 'Completing', invalidated: 'Invalidated' };
  var SYFA = { ahead: 'قیمت جلوتر از زمان', behind: 'قیمت عقب‌تر از زمان', sync: 'قیمت و زمان هم‌گام' };
  function ecdf(A, x) { if (!A.length) return null; var c = 0; for (var i = 0; i < A.length; i++) if (A[i] <= x) c++; return c / A.length; }
  function erf(x) { var s = x < 0 ? -1 : 1; x = Math.abs(x); var t = 1 / (1 + 0.3275911 * x), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return s * y; }
  function kendall(L) { var n = L.length; if (n < 8) return null; var S = 0; for (var i = 0; i < n; i++) for (var j = i + 1; j < n; j++) S += Math.sign(L[j] - L[i]);
    var v = n * (n - 1) * (2 * n + 5) / 18, z = (S - Math.sign(S)) / Math.sqrt(v), p = 2 * (1 - 0.5 * (1 + erf(Math.abs(z) / Math.SQRT2))); return { tau: S / (n * (n - 1) / 2), p: p, n: n }; }
  // finished legs that END in a turn of type toType: lengths (sessions), log amplitudes, speeds
  function legStats(Pk, toType) { var D = [], A = [], V = []; for (var j = 1; j < Pk.length; j++) if (Pk[j].type === toType) { var d = Pk[j].i - Pk[j - 1].i, a = Math.abs(Math.log(Pk[j].p / Pk[j - 1].p)); if (d > 0 && isF(a)) { D.push(d); A.push(a); V.push(a / d); } } return { D: D, A: A, V: V }; }
  function fullLens(Pk) { var F = []; for (var j = 2; j < Pk.length; j++) if (Pk[j].type === Pk[j - 2].type) F.push(Pk[j].i - Pk[j - 2].i); return F; }
  function ampBand(LS, lo, hi, ach) { var A = []; for (var j = 0; j < LS.D.length; j++) if (LS.D[j] >= lo && LS.D[j] <= hi) A.push(Math.max(ach, LS.A[j])); return A.length >= 3 ? [q(A, 0.25), q(A, 0.75)] : null; }
  function hdi(A, mass) { var s = A.slice().sort(function (x, y) { return x - y; }), m = Math.max(1, Math.ceil(mass * s.length)) - 1, best = [s[0], s[s.length - 1]];
    for (var i = 0; i + m < s.length; i++) if (s[i + m] - s[i] < best[1] - best[0]) best = [s[i], s[i + m]]; return best; }
  function zoneOf(tPct) { return tPct < 0.25 ? 'pre' : tPct <= 0.75 ? 'main' : 'late'; }
  /* the progress of the leg in progress at session t (core; no calibration). P: the scale's ZigZag; Pk: turns known at t */
  function ptpCore(S, P, t, Pk) {
    Pk = Pk || known(P, t); if (Pk.length < 10) return null; var last = Pk[Pk.length - 1], toType = last.type === 'L' ? 'H' : 'L', dir = toType === 'H' ? 1 : -1, LS = legStats(Pk, toType);
    if (LS.D.length < 6) return null;
    var i0 = last.i, p0 = last.p, el = t - i0, ext = p0, ie = i0; for (var i = i0; i <= t; i++) { var c = S.c[i]; if (dir > 0 ? c > ext : c < ext) { ext = c; ie = i; } }
    var px = S.c[t], ach = Math.abs(Math.log(ext / p0)), now = dir * Math.log(px / p0), Dm = q(LS.D, 0.5), Am = q(LS.A, 0.5);
    var tPct = ecdf(LS.D, el), pPct = ecdf(LS.A, ach), Dc = LS.D.filter(function (d) { return d >= el; }), Ac = LS.A.filter(function (a) { return a >= ach; });
    var o = { dir: dir, toType: toType, i0: i0, p0: p0, el: el, ext: ext, ie: ie, px: px, ach: ach, now: now, nLeg: LS.D.length, Dm: Dm, Am: Am, tPct: tPct, pPct: pPct, tProg: el / Dm, pProg: Am > 0 ? ach / Am : null,
      sync: pPct - tPct > 0.25 ? 'ahead' : pPct - tPct < -0.25 ? 'behind' : 'sync', zone: zoneOf(tPct), nC: Dc.length };
    if (Dc.length >= 4) { var qq = function (p) { return i0 + Math.round(q(Dc, p)); }, hd = hdi(Dc.map(function (d) { return Math.max(d, el + 1); }), 0.5);
      // main window = the NARROWEST span holding half of the conditioned lengths (the remaining-time distribution is right-skewed: a 25–75 %
      // span skips the legs that end soon and lost to a same-width benchmark in the walk-forward test); the alternatives sit on either side
      var ea = Math.max(t + 1, qq(0.1)), eb = i0 + hd[0] - 1, la = i0 + hd[1] + 1, lb = qq(0.9);
      o.win = { main: [i0 + hd[0], i0 + hd[1]], early: eb >= ea ? [ea, eb] : null, late: lb >= la ? [la, lb] : null, med: Math.max(t + 1, qq(0.5)) };   // no alternative when it would be empty
      var band = function (a, b) { var r = ampBand(LS, a - i0, b - i0, ach); return r ? r.map(function (x2) { return p0 * Math.exp(dir * x2); }).sort(function (x, y) { return x - y; }) : null; };
      o.prW = { main: band(o.win.main[0], o.win.main[1]), early: o.win.early ? band(o.win.early[0], o.win.early[1]) : null, late: o.win.late ? band(o.win.late[0], o.win.late[1]) : null };
      o.tDebt = Math.max(0, Math.round(q(Dc, 0.5) - el));
      var wB = o.win.main[1] - o.win.main[0], bc = Math.max(t + 1, i0 + Math.round(Dm) - Math.round(wB / 2)); o.bw = [bc, bc + wB]; }   // the same-width benchmark, recorded with every forecast
    else o.beyond = true;   // longer than (almost) every past leg of this asset: no survival-conditioned window
    var Atar = Ac.length >= 4 ? q(Ac, 0.5) : Math.max(ach, Am); o.target = p0 * Math.exp(dir * Atar); o.pDebt = dir * Math.log(o.target / px);
    o.pr = Ac.length >= 4 ? [q(Ac, 0.25), q(Ac, 0.75)].map(function (a) { return p0 * Math.exp(dir * a); }).sort(function (x, y) { return x - y; }) : null;
    var sA = sd(LS.A) || Am || 1, sD = sd(LS.D) || Dm || 1; o.devP = (now - Am * Math.min(1, el / Dm)) / sA; o.devT = (el - Dm) / sD;
    o.vPct = el >= 1 ? ecdf(LS.V, ach / el) : null; o.since = t - ie;
    var kt = kendall(fullLens(Pk).slice(-16)); o.trend = kt;
    var F = [], inval = dir > 0 ? px < p0 : px > p0;
    if (inval) F.push('invalidated');
    else { if (o.win && el >= q(LS.D, 0.25) && el <= q(LS.D, 0.9) && pPct >= 0.25) F.push('completing');
      if (tPct >= 0.9 && LS.D.length >= 8) F.push('extended');
      if (kt && kt.p < 0.1 && kt.tau > 0) F.push('lengthening'); if (kt && kt.p < 0.1 && kt.tau < 0) F.push('contracting');
      if (o.vPct != null && o.vPct >= 0.8 && el >= 3) F.push('accelerating'); if (el >= 5 && o.since >= Math.max(3, 0.3 * el)) F.push('decelerating'); }
    o.flags = F; o.state = F[0] || 'normal'; return o; }
  /* walk-forward calibration of «temporary turn / main turn / continuation within 10 sessions» per (sync × time zone) cell, this asset only */
  var PH = 10;
  function ptpCalib(S, P, Psmall, start) {
    var n = S.n, cnt = {}, tot = { major: 0, minor: 0, cont: 0, n: 0 }, pend = [], bM = 0, bB = 0, nE = 0, smallIdx = (Psmall || []).map(function (p) { return p; });
    var nextOf = function (i) { for (var j = 0; j < P.length; j++) if (P[j].i > i) return P[j]; return null; };
    var flush = function (s) { while (pend.length && pend[0].s + PH < s) { var x = pend.shift(), c = cnt[x.cell] = cnt[x.cell] || { major: 0, minor: 0, cont: 0, n: 0 }; c[x.y]++; c.n++; tot[x.y]++; tot.n++; } };
    var prob = function (c, y) { return (c[y] + 1) / (c.n + 3); };
    for (var s = start; s < n - PH; s += 3) { flush(s); var Pk = known(P, s); if (Pk.length < 10) continue; var o = ptpCore(S, P, s, Pk); if (!o || o.state === 'invalidated') continue;
      var cell = o.sync + '|' + o.zone, nx = nextOf(o.i0), y;
      if (nx && nx.type === o.toType && nx.i > s && nx.i <= s + PH) y = 'major';
      else { var mi = false; for (var j = 0; j < smallIdx.length; j++) { var pp = smallIdx[j]; if (pp.i > s && pp.i <= s + PH && pp.type === o.toType) { mi = true; break; } if (pp.i > s + PH) break; } y = mi ? 'minor' : 'cont'; }
      if (tot.n >= 60 && cnt[cell] && cnt[cell].n >= 10) { ['major', 'minor', 'cont'].forEach(function (k) { var pm = prob(cnt[cell], k), pb = (tot[k] + 1) / (tot.n + 3), yy = y === k ? 1 : 0; bM += (pm - yy) * (pm - yy); bB += (pb - yy) * (pb - yy); }); nE++; }
      pend.push({ s: s, cell: cell, y: y }); }
    flush(1e12);
    var out = { n: tot.n, nEval: nE, skill: nE >= 50 && bB > 0 ? 1 - bM / bB : null, base: tot.n ? { major: tot.major / tot.n, minor: tot.minor / tot.n, cont: tot.cont / tot.n } : null, cells: {} };
    Object.keys(cnt).forEach(function (k) { var c = cnt[k]; out.cells[k] = { n: c.n, major: prob(c, 'major'), minor: prob(c, 'minor'), cont: prob(c, 'cont') }; });
    out.ok = out.skill != null && out.skill > 0 && tot.n >= 200; return out; }
  // the neighbouring scales (robustness to the choice of turning points)
  function ptpRobust(S, k, t) { var i = KG.indexOf(k), nb = [KG[i - 1], KG[i + 1]].filter(isF), r = [];
    nb.forEach(function (k2) { var P2 = zigzag(S, k2), o2 = ptpCore(S, P2, t); if (o2) r.push({ k: k2, ext: o2.tPct >= 0.9, tPct: o2.tPct, dir: o2.dir }); }); return r; }
  // the full view of one horizon: core + robustness + calibrated turn probabilities (from the stored profile)
  function ptpView(S, P, k, t, cal, cal2) {
    var o = ptpCore(S, P, t); if (!o) return null; var rb = ptpRobust(S, k, t), me = o.tPct >= 0.9;
    o.robust = rb; o.scaleSensitive = rb.some(function (x) { return x.ext !== me || x.dir !== o.dir; });
    var cell = o.sync + '|' + o.zone, c = cal && cal.cells ? cal.cells[cell] : null;
    o.turn = cal && cal.ok && c && c.n >= 30 ? { major: c.major, minor: c.minor, cont: c.cont, n: c.n, skill: cal.skill, calibrated: true } : { calibrated: false, n: c ? c.n : 0, skill: cal ? cal.skill : null, why: !cal ? 'کالیبراسیون این دارایی هنوز محاسبه نشده' : !cal.ok ? 'در آزمون رو به جلو بهتر از نرخ پایه نبود' : 'نمونهٔ این حالت کمتر از ۳۰ مورد است' };
    o.confirm = o.dir < 0 ? o.ext + k * S.atr[t] : o.ext - k * S.atr[t];   // a close beyond this confirms the turn at the leg extreme
    o.stateFa = PTST[o.state]; o.stateEn = PTEN[o.state]; o.syncFa = SYFA[o.sync]; return o; }
  /* historical walk-forward test of the progress model on one asset/scale (directive 29 · 7, 9): at the moment each leg start becomes known
     and every 5 sessions inside the leg, the windows from past legs only, against the leg's actual end. Benchmark: the unconditioned window
     (25–75 % of all past leg lengths, from the leg start). */
  function ptpBacktest(S, P, start) {
    var R = [], n = S.n;
    for (var j = 1; j < P.length; j++) { var st = P[j - 1], en = P[j]; if (en.t >= n) continue;
      for (var s = Math.max(st.t, start); s < en.i; s += 5) { var Pk = known(P, s); if (!Pk.length || Pk[Pk.length - 1].i !== st.i) continue; var o = ptpCore(S, P, s, Pk); if (!o || !o.win) continue;
        var LS = legStats(Pk, o.toType), bm = [st.i + Math.round(q(LS.D, 0.25)), st.i + Math.round(q(LS.D, 0.75))], bmMed = st.i + Math.round(q(LS.D, 0.5)), med = o.win.med;
        var inR = function (r) { return r && en.p >= r[0] && en.p <= r[1]; }, Abm = [q(LS.A, 0.25), q(LS.A, 0.75)].map(function (a) { return st.p * Math.exp(o.dir * a); }).sort(function (x, y) { return x - y; });
        var wM0 = o.win.main[1] - o.win.main[0], bc = Math.max(s + 1, bmMed - Math.round(wM0 / 2));   // width-matched benchmark: same width, centred on the unconditioned median
        R.push({ s: s, el: o.el, sync: o.sync, zone: o.zone, state: o.state, hitM: en.i >= o.win.main[0] && en.i <= o.win.main[1], hitB: en.i >= Math.max(s + 1, bm[0]) && en.i <= Math.max(s + 1, bm[1]),
          hitBw: en.i >= bc && en.i <= bc + wM0, endIn: en.i - s, tProg: o.tProg, leg: st.i,
          wM: o.win.main[1] - o.win.main[0] + 1, wB: Math.max(s + 1, bm[1]) - Math.max(s + 1, bm[0]) + 1, eM: Math.abs(en.i - med), eB: Math.abs(en.i - Math.max(s + 1, bmMed)),
          inAlt: !!(o.win.early && en.i >= o.win.early[0] && en.i <= o.win.early[1]) || !!(o.win.late && en.i >= o.win.late[0] && en.i <= o.win.late[1]), late: en.i > o.win.main[1], early: en.i < o.win.main[0],
          prM: inR(o.prW.main) || inR(o.pr), prB: inR(Abm), pErr: o.target ? Math.abs(Math.log(en.p / o.target)) : null, delay: en.t - en.i, ach: o.ach, Am: o.Am, el0: o.el, Dm: o.Dm, pPct: o.pPct, tPct: o.tPct, flags: o.flags.slice() }); } }
    return R; }
  function ptpSummary(R) { if (!R.length) return { n: 0 }; var m = function (f) { return R.reduce(function (s, r) { return s + (f(r) ? 1 : 0); }, 0) / R.length; }, md = function (f) { return q(R.map(f).filter(isF), 0.5); };
    // the test counts each leg once (its samples are not independent): the leg's share of samples where the window beat the benchmark
    var legs = {}; R.forEach(function (r) { var g = legs[r.leg] = legs[r.leg] || { w: 0, l: 0 }; if (r.hitM && !r.hitBw) g.w++; else if (!r.hitM && r.hitBw) g.l++; });
    var both = Object.keys(legs).map(function (k) { return legs[k]; }).filter(function (g) { return g.w !== g.l; }), wins = both.filter(function (g) { return g.w > g.l; }).length;
    return { n: R.length, hitM: m(function (r) { return r.hitM; }), hitB: m(function (r) { return r.hitB; }), hitBw: m(function (r) { return r.hitBw; }), disc: both.length, pCond: binomP(wins, both.length, 0.5), pBench: binomP(both.length - wins, both.length, 0.5), wM: md(function (r) { return r.wM; }), wB: md(function (r) { return r.wB; }), eM: md(function (r) { return r.eM; }), eB: md(function (r) { return r.eB; }),
      prM: m(function (r) { return r.prM; }), prB: m(function (r) { return r.prB; }), pErr: md(function (r) { return r.pErr; }), delay: md(function (r) { return r.delay; }) }; }
  Hub.cycles = { VER: VER, KEY: KEY, LOG: LOG, HZ: HZ, KG: KG, MFA: MFA, STFA: STFA, LVFA: LVFA, profile: profile, refresh: refresh, load: load, cache: cache, correct: correct, crit: crit, setCrit: setCrit,
    view: view, all: all, central: central, track: track, grade: grade, dataQuality: dataQuality, syncLayer: syncLayer, assets: assets, stockRows: stockRows,
    clean: clean, ser: ser, fromX: fromX, zigzag: zigzag, known: known, ptpCore: ptpCore, ptpView: ptpView, ptpCalib: ptpCalib, ptpBacktest: ptpBacktest, ptpSummary: ptpSummary, ptpStats: ptpStats, addPtp: addPtp, needsPtp: needsPtp, PVER: PVER, ptCompact: ptCompact, ptPack: ptPack, ptUnpack: ptUnpack, ptpLog: ptpLog, PLOG: PLOG, kendall: kendall, PTST: PTST, PTEN: PTEN, SYFA: SYFA, intervals: intervals, seriesList: seriesList, evalCfg: evalCfg, stats: stats, mSpec: mSpec, mWav: mWav, mInt: mInt, mFib: mFib, binomP: binomP };
})(typeof window !== 'undefined' ? window : globalThis);
