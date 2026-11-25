/* Hub.learn — directive 27: closed-loop continuous learning for pre-move detection (2026-11-25).

   Every important move is checked: was it flagged BEFORE it started? If not, it is recorded with its cause, the cause becomes an
   action, the model / thresholds are re-fitted and only a version that is better OUT OF SAMPLE (walk-forward, with an embargo,
   against the current rules as baseline, without raising false alarms) is offered for release; a released version is watched
   live and rolled back when it does worse than its own test said.

   Point-in-time discipline (no look-ahead):
   - features at bar i use bars 0…i only (closes, highs, lows, volumes up to i; volatility from returns up to i);
   - the label at i uses bars after i — it is used only to fit and to score, never as an input;
   - walk-forward: the model of a test block is fitted on dates before the block minus an embargo of L+W sessions, so no label of
     the training set reaches into the test block; thresholds are chosen on the last part of the training dates, not on the test.

   Definitions (design choices of this tool, stated in the UI — not published standards):
   - σ_i: EWMA (λ 0.97) of daily log returns up to i, each return clipped at ±5σ, floor 0.2 %;
   - move start s with window W: max_{e∈(s,s+W]} ln(c_e/c_s) / (σ_s √(e−s)) ≥ Z  (Z 2.5 = «significant» of directive 26);
   - pre-move label at i: a move starts at some s ∈ [i, i+L−1]  (L 5 sessions: a warning up to 5 sessions before the start counts);
   - event: first start of a run of starts; events closer than W sessions are one event;
   - episode: a run of consecutive alerts (gap ≤ 2 bars) — counted once; true if an event starts within L sessions after its first bar;
   - detected before the move: first alert of an episode in [s−L+1, s]; during the move: first alert in (s, e].                     */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  var VER = 'L27-1';
  var CFG = { L: 5, W: 10, Z: 2.5, warm: 130, lam: 0.97, embargo: 15, folds: [0.55, 0.65, 0.75, 0.85, 1.0], beta: 0.5, ridge: 1.0, maxPos: 25, minEvents: 15 };
  var FEATS = ['mom5', 'momAcc', 'mom20', 'volSurge', 'squeeze', 'dHigh', 'clv5', 'trend50', 'volChg', 'pullback', 'rel5', 'range20'];
  var FEATFA = { mom5: 'مومنتوم ۵ جلسه', momAcc: 'شتاب مومنتوم', mom20: 'مومنتوم ۲۰ جلسه', volSurge: 'جهش حجم / ارزش معاملات', squeeze: 'فشردگی نوسان (تراکم)', dHigh: 'فاصله از سقف ۲۰ جلسه (شکست)',
    clv5: 'انباشت / توزیع (جای بسته‌شدن در دامنه)', trend50: 'شیب روند ۵۰ جلسه', volChg: 'تغییر نوسان (کوتاه / بلند)', pullback: 'عمق اصلاح از سقف ۶۰ جلسه', rel5: 'رفتار دارایی مرتبط (بین‌بازاری)', range20: 'خروج از محدودهٔ تراکم' };
  var isF = function (x) { return typeof x === 'number' && isFinite(x); };

  /* ---------- volatility, features, labels (all point in time) ---------- */
  function sigma(c) { var n = c.length, s = new Float64Array(n), v = NaN, r0 = [];
    for (var i = 1; i < n; i++) { var r = c[i] > 0 && c[i - 1] > 0 ? Math.log(c[i] / c[i - 1]) : 0;
      if (!isF(v)) { r0.push(Math.abs(r)); if (r0.length >= 20) { var q = r0.slice().sort(function (a, b) { return a - b; }); v = Math.pow(Math.max(0.002, 1.4826 * q[10]), 2); } s[i] = NaN; continue; }
      var sd = Math.sqrt(v), rc = Math.max(-5 * sd, Math.min(5 * sd, r)); v = CFG.lam * v + (1 - CFG.lam) * rc * rc; s[i] = Math.max(0.002, Math.sqrt(v)); }
    return s; }
  // optional reference series (cross-market): ref = { d: dates, c: closes } aligned by date
  function align(X, ref) { if (!ref || !ref.d) return null; var m = {}, out = new Float64Array(X.n); for (var j = 0; j < ref.d.length; j++) m[ref.d[j]] = ref.c[j]; var last = NaN; for (var i = 0; i < X.n; i++) { var v = m[X.d[i]]; if (v > 0) last = v; out[i] = last; } return out; }
  function prepare(X, ref) {
    var n = X.n || X.c.length, c = X.c, h = X.h || c, l = X.l || c, v = X.v || [], val = X.val || [], S = sigma(c), R = align(X, ref);
    // rolling helpers (computed once, O(n·k) with small k)
    var hi20 = new Float64Array(n), hi60 = new Float64Array(n), lo20 = new Float64Array(n), ma50 = new Float64Array(n), bw = new Float64Array(n), s5 = new Float64Array(n), s60 = new Float64Array(n), act = new Float64Array(n);
    var sum = 0; for (var i = 0; i < n; i++) { sum += c[i]; if (i >= 50) sum -= c[i - 50]; ma50[i] = i >= 49 ? sum / 50 : NaN;
      var a = -Infinity, b = Infinity; for (var k = Math.max(0, i - 20); k < i; k++) { if (h[k] > a) a = h[k]; if (l[k] < b) b = l[k]; } hi20[i] = a; lo20[i] = b;
      var a6 = -Infinity; for (k = Math.max(0, i - 60); k < i; k++) if (c[k] > a6) a6 = c[k]; hi60[i] = a6;
      if (i >= 20) { var m = 0, q = 0; for (k = i - 19; k <= i; k++) m += c[k]; m /= 20; for (k = i - 19; k <= i; k++) q += (c[k] - m) * (c[k] - m); bw[i] = m > 0 ? Math.sqrt(q / 20) / m : NaN; } else bw[i] = NaN;
      var x = 0, y = 0, cnt = 0; for (k = Math.max(1, i - 4); k <= i; k++) { var rr = Math.log(c[k] / c[k - 1]); x += rr * rr; cnt++; } s5[i] = cnt ? Math.sqrt(x / cnt) : NaN;
      cnt = 0; for (k = Math.max(1, i - 59); k <= i; k++) { var r2 = Math.log(c[k] / c[k - 1]); y += r2 * r2; cnt++; } s60[i] = cnt ? Math.sqrt(y / cnt) : NaN;
      var av = (val[i] > 0 ? val[i] : (v[i] > 0 ? v[i] * c[i] : 0)); act[i] = av; }
    return { n: n, noVol: !v.some(function (x) { return x > 0; }) && !val.some(function (x) { return x > 0; }), X: X, S: S, R: R, hi20: hi20, hi60: hi60, lo20: lo20, ma50: ma50, bw: bw, s5: s5, s60: s60, act: act }; }
  function median(a) { var b = a.filter(isF).sort(function (x, y) { return x - y; }); return b.length ? b[Math.floor(b.length / 2)] : NaN; }
  // features at bar i (uses bars ≤ i only); sign = +1 for up moves, −1 for down moves (the model of each direction sees mirrored momentum)
  function featAt(P, i, sign) {
    if (i < CFG.warm || i >= P.n) return null; var X = P.X, c = X.c, h = X.h || c, l = X.l || c, s = P.S[i]; if (!(s > 0) || !(c[i] > 0)) return null; sign = sign || 1;
    var m5 = Math.log(c[i] / c[i - 5]) / (s * Math.sqrt(5)), m5p = Math.log(c[i - 5] / c[i - 10]) / (s * Math.sqrt(5)), m20 = Math.log(c[i] / c[i - 20]) / (s * Math.sqrt(20));
    var a5 = 0, a20 = []; for (var k = i - 4; k <= i; k++) a5 += P.act[k]; a5 /= 5; for (k = i - 24; k <= i - 5; k++) a20.push(P.act[k]); var med = median(a20), vs = a5 > 0 && med > 0 ? Math.log(a5 / med) : 0;
    var bws = []; for (k = i - 119; k <= i; k++) if (isF(P.bw[k])) bws.push(P.bw[k]); var bwr = 0; if (bws.length > 30 && isF(P.bw[i])) { var lo = 0; bws.forEach(function (x) { if (x < P.bw[i]) lo++; }); bwr = lo / bws.length; }
    var dh = sign > 0 ? Math.log(c[i] / P.hi20[i]) / s : Math.log(P.lo20[i] / c[i]) / s;
    var cl = 0; for (k = i - 4; k <= i; k++) { var rg = h[k] - l[k]; cl += rg > 0 ? ((c[k] - l[k]) - (h[k] - c[k])) / rg : 0; } cl /= 5;
    var tr = isF(P.ma50[i]) && isF(P.ma50[i - 10]) && P.ma50[i - 10] > 0 ? Math.log(P.ma50[i] / P.ma50[i - 10]) / (s * Math.sqrt(10)) : 0;
    var vc = P.s5[i] > 0 && P.s60[i] > 0 ? Math.log(P.s5[i] / P.s60[i]) : 0;
    var pb = P.hi60[i] > 0 ? Math.log(c[i] / P.hi60[i]) / s : 0;
    var rel = 0; if (P.R && P.R[i] > 0 && P.R[i - 5] > 0) rel = Math.log(P.R[i] / P.R[i - 5]) / (s * Math.sqrt(5));
    var rng = P.hi20[i] > P.lo20[i] ? (c[i] - P.lo20[i]) / (P.hi20[i] - P.lo20[i]) : 0.5;
    var f = [sign * m5, sign * (m5 - m5p), sign * m20, vs, 1 - bwr, Math.max(-6, Math.min(6, dh)), sign * cl, sign * tr, vc, sign * Math.max(-10, pb), sign * rel, sign > 0 ? rng : 1 - rng];
    for (k = 0; k < f.length; k++) if (!isF(f[k])) f[k] = 0; f.noVol = P.noVol; return f; }
  // forward best move from s (label side only): z and end index
  function fwd(P, sign) { var c = P.X.c, n = P.n, W = CFG.W, z = new Float64Array(n), e = new Int32Array(n), r = new Float64Array(n);
    for (var s = 0; s < n; s++) { z[s] = NaN; e[s] = -1; var sg = P.S[s]; if (!(sg > 0) || s + 1 >= n) continue; var best = -Infinity;
      for (var j = s + 1; j <= Math.min(n - 1, s + W); j++) { var lr = sign * Math.log(c[j] / c[s]), zz = lr / (sg * Math.sqrt(j - s)); if (zz > best) { best = zz; e[s] = j; r[s] = lr; } } z[s] = best; }
    return { z: z, e: e, r: r }; }
  function events(P, F) { var out = [], n = P.n, lastE = -1; for (var s = CFG.warm; s < n - 1; s++) { if (!(F.z[s] >= CFG.Z)) continue; if (s <= lastE) continue; var e = F.e[s];
      // extend to the best end inside the run of qualifying starts
      out.push({ s: s, e: e, r: F.r[s], z: F.z[s] }); lastE = Math.max(e, s + CFG.W - 1); } return out; }

  /* ---------- logistic regression (IRLS with ridge), standardised ---------- */
  function fit(Xs, ys, wpos) { var d = Xs[0].length, N = Xs.length, mu = new Array(d).fill(0), sd = new Array(d).fill(0);
    Xs.forEach(function (x) { for (var j = 0; j < d; j++) mu[j] += x[j]; }); for (var j = 0; j < d; j++) mu[j] /= N;
    Xs.forEach(function (x) { for (var j = 0; j < d; j++) sd[j] += (x[j] - mu[j]) * (x[j] - mu[j]); }); for (j = 0; j < d; j++) sd[j] = Math.sqrt(sd[j] / N) || 1;
    var D = d + 1, w = new Array(D).fill(0), npos = ys.reduce(function (a, b) { return a + b; }, 0), wp = Math.min(CFG.maxPos, wpos || Math.max(1, (N - npos) / Math.max(1, npos)));
    for (var it = 0; it < 12; it++) { var H = []; for (var a = 0; a < D; a++) H.push(new Array(D).fill(0)); var g = new Array(D).fill(0);
      for (var k = 0; k < N; k++) { var z = new Array(D); z[0] = 1; for (j = 0; j < d; j++) z[j + 1] = (Xs[k][j] - mu[j]) / sd[j]; var t = 0; for (j = 0; j < D; j++) t += w[j] * z[j]; var p = 1 / (1 + Math.exp(-t)), cw = ys[k] ? wp : 1, q = cw * p * (1 - p), err = cw * (ys[k] - p);
        for (a = 0; a < D; a++) { g[a] += err * z[a]; var qa = q * z[a]; for (var b = a; b < D; b++) H[a][b] += qa * z[b]; } }
      for (a = 0; a < D; a++) { for (b = 0; b < a; b++) H[a][b] = H[b][a]; if (a > 0) { H[a][a] += CFG.ridge; g[a] -= CFG.ridge * w[a]; } }
      var step = solve(H, g); if (!step) break; var mx = 0; for (a = 0; a < D; a++) { w[a] += step[a]; mx = Math.max(mx, Math.abs(step[a])); } if (mx < 1e-6) break; }
    return { w: w, mu: mu, sd: sd, wp: wp, n: N, npos: npos }; }
  function solve(A, b) { var n = b.length, M = A.map(function (r, i) { return r.slice().concat([b[i]]); });
    for (var i = 0; i < n; i++) { var p = i; for (var r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r; if (Math.abs(M[p][i]) < 1e-12) return null; var t = M[i]; M[i] = M[p]; M[p] = t;
      for (r = 0; r < n; r++) { if (r === i) continue; var f = M[r][i] / M[i][i]; if (!f) continue; for (var k = i; k <= n; k++) M[r][k] -= f * M[i][k]; } }
    return M.map(function (r, i) { return r[n] / r[i]; }); }
  function prob(m, x) { if (!m || !x) return NaN; var t = m.w[0]; for (var j = 0; j < x.length; j++) t += m.w[j + 1] * (x[j] - m.mu[j]) / m.sd[j]; return 1 / (1 + Math.exp(-t)); }
  // the three largest contributions (standardised weight × standardised value), for «why»
  function why(m, x) { if (!m || !x) return []; return x.map(function (v, j) { return [FEATS[j], m.w[j + 1] * (v - m.mu[j]) / m.sd[j]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 3).filter(function (q) { return q[1] > 0; }).map(function (q) { return FEATFA[q[0]]; }); }

  /* ---------- baselines: the current rules, replayed on the same bars ---------- */
  // B-near: the current pre-warning (directive 26 preBreak) needs the engine's confirmation level, which is not replayable per bar;
  // its replayable stand-in: price within 1σ under the 20-session high while the 50-session trend rises.
  // B-break: classic breakout — close above the 20-session high with value traded ≥ 1.5× its median.
  var BASE = { near: function (f) { return f[5] >= -1 && f[5] <= 0 && f[7] > 0; }, brk: function (f) { return f[5] > 0 && (f[3] > Math.log(1.5) || f.noVol); } };   // series without volume (gold / FX quotes): the breakout alone
  var BASEFA = { near: 'قاعدهٔ فعلی (نزدیکی به سقف ۲۰ جلسه در روند صعودی)', brk: 'شکست سقف ۲۰ جلسه با حجم ۱٫۵ برابر' };

  /* ---------- sequences, scoring of alert rules on sequences ---------- */
  function seqOf(item, sign) { var P = item.P, F = fwd(P, sign), EV = events(P, F), n = P.n, f = new Array(n), y = new Uint8Array(n);
    var start = new Uint8Array(n); EV.forEach(function (e) { start[e.s] = 1; }); // qualifying first starts
    for (var i = CFG.warm; i < n; i++) { f[i] = featAt(P, i, sign); var yy = 0; for (var s = i; s < Math.min(n, i + CFG.L); s++) if (F.z[s] >= CFG.Z) { yy = 1; break; } y[i] = yy; }
    return { key: item.key, cls: item.cls, sign: sign, P: P, F: F, ev: EV, f: f, y: y, d: P.X.d, last: n - 1 - CFG.W }; }
  // score: list of sequences + an alert function a(seq, i) → bool, over the bar range [from, to] (dates); returns event / episode metrics
  function score(seqs, alertFn, from, to, opt) { opt = opt || {}; var M = { ev: 0, pre: 0, dur: 0, miss: 0, lead: 0, ep: 0, tp: 0, bars: 0, exe: 0, preHit: 0, pot: 0, real: 0, nReal: 0, byReg: {}, list: [] };
    seqs.forEach(function (q) { var d = q.d, n = q.P.n, A = new Uint8Array(n), last = Math.min(n - 1, q.last);
      for (var i = CFG.warm; i <= last; i++) { if (d[i] < from || d[i] > to || !q.f[i]) continue; M.bars++; A[i] = alertFn(q, i) ? 1 : 0; }
      // episodes
      for (i = CFG.warm; i <= last; i++) { if (!A[i] || (A[i - 1] || A[i - 2])) continue; M.ep++; var ok = false; for (var s = i; s <= Math.min(last + CFG.W, i + CFG.L - 1); s++) if (q.F.z[s] >= CFG.Z) { ok = true; break; } if (ok) M.tp++; }
      q.ev.forEach(function (e) { if (d[e.s] < from || d[e.s] > to || e.s > last) return; M.ev++; var reg = regime(q, e.s), R = M.byReg[reg] = M.byReg[reg] || { ev: 0, pre: 0 }; R.ev++;
        var t0 = -1; for (var t = Math.max(CFG.warm, e.s - CFG.L + 1); t <= e.s; t++) if (A[t]) { t0 = t; break; }
        var td = -1; if (t0 < 0) for (t = e.s + 1; t <= e.e; t++) if (A[t]) { td = t; break; }
        var row = { key: q.key, cls: q.cls, s: e.s, e: e.e, ds: d[e.s], de: d[e.e], r: e.r, z: e.z, t: t0 >= 0 ? t0 : td, when: t0 >= 0 ? 'pre' : td >= 0 ? 'during' : 'miss' };
        M.pot += e.r;
        if (t0 >= 0) { M.pre++; R.pre++; M.lead += e.s - t0; var ex = q.sign < 0 ? execDn(q, t0, e) : exec(q, t0, e); row.exe = ex; if (ex.ok) { M.exe++; M.real += ex.net; M.nReal++; } if (ex.hit) M.preHit++; }
        else if (td >= 0) M.dur++; else M.miss++;
        if (opt.keep) M.list.push(row); }); });
    M.pmdr = M.ev ? M.pre / M.ev : NaN; M.prec = M.ep ? M.tp / M.ep : NaN; M.far = M.bars ? 1000 * (M.ep - M.tp) / M.bars : NaN; M.leadAvg = M.pre ? M.lead / M.pre : NaN;
    var b = CFG.beta * CFG.beta; M.f1 = M.prec + M.pmdr > 0 ? 2 * M.prec * M.pmdr / (M.prec + M.pmdr) : 0; M.fb = M.prec + M.pmdr > 0 ? (1 + b) * M.prec * M.pmdr / (b * M.prec + M.pmdr) : 0;
    M.exeRate = M.pre ? M.exe / M.pre : NaN; M.hitRate = M.pre ? M.preHit / M.pre : NaN; M.potAvg = M.ev ? M.pot / M.ev : NaN; M.realAvg = M.nReal ? M.real / M.nReal : NaN; return M; }
  function regime(q, i) { var P = q.P, f = q.f[i]; var tr = f && f[7] > 0 ? 'up' : 'down'; var s = P.S[i], hist = []; for (var k = Math.max(CFG.warm, i - 250); k < i; k += 5) if (P.S[k] > 0) hist.push(P.S[k]); var m = median(hist); return tr + '-' + (s > m ? 'hv' : 'lv'); }
  var REGFA = { 'up-lv': 'روند صعودی · نوسان کم', 'up-hv': 'روند صعودی · نوسان زیاد', 'down-lv': 'روند نزولی · نوسان کم', 'down-hv': 'روند نزولی · نوسان زیاد' };
  // realisable: buy at the next bar's open (close if no open) after the alert; exit at the move's end or after W bars, stop at −2σ√5;
  // not executable when the entry bar is locked at its limit (Tehran price limit queue) or the asset trades too little
  var COST = { stock: 0.012, fund: 0.004, gold: 0.01, fx: 0.01, crypto: 0.004, commodity: 0.006, index: 0, option: 0.01 };
  function exec(q, t, e) { var X = q.P.X, n = q.P.n, j = t + 1; if (j >= n) return { ok: false, why: 'پایان داده' };
    var noVol = !(X.v && X.v.some(function (x) { return x > 0; })), lock = X.lock && X.lock[j] > 0, liq = noVol || q.P.act[j] > 0,   // gold / FX quotes carry no volume: liquidity is not tested there
       entry = X.o && X.o[j] > 0 ? X.o[j] : X.c[j];
    if (lock) return { ok: false, why: 'صف خرید (قفل در سقف دامنه)' }; if (!liq) return { ok: false, why: 'بدون معامله' };
    var s = q.P.S[t], stop = entry * Math.exp(-2 * s * Math.sqrt(5)), tgt = entry * Math.exp(CFG.Z * s * Math.sqrt(5)), out = NaN, hit = false;
    for (var k = j; k <= Math.min(n - 1, Math.max(e.e, j + CFG.W)); k++) { if ((X.l || X.c)[k] <= stop) { out = stop; break; } if ((X.h || X.c)[k] >= tgt) hit = true; out = X.c[k]; if (k >= e.e && k >= j + 1) break; }
    var c0 = COST[q.cls] != null ? COST[q.cls] : 0.01; return { ok: true, gross: Math.log(out / entry), net: Math.log(out / entry) - c0, hit: hit }; }
  // down side: a holder sells at the next open; the value is the fall avoided until the move's end, less the selling cost (half a round trip)
  function execDn(q, t, e) { var X = q.P.X, n = q.P.n, j = t + 1; if (j >= n) return { ok: false, why: 'پایان داده' }; if (X.lock && X.lock[j] < 0) return { ok: false, why: 'صف فروش (قفل در کف دامنه)' };
    var entry = X.o && X.o[j] > 0 ? X.o[j] : X.c[j], out = X.c[Math.min(n - 1, Math.max(e.e, j))], c0 = (COST[q.cls] != null ? COST[q.cls] : 0.01) / 2, s = q.P.S[t], hit = (X.l || X.c).slice(j, Math.min(n, e.e + 1)).some(function (x) { return x <= entry * Math.exp(-CFG.Z * s * Math.sqrt(5)); });
    return { ok: true, gross: -Math.log(out / entry), net: -Math.log(out / entry) - c0, hit: hit }; }

  /* ---------- walk-forward of one class and direction ---------- */
  function datesOf(seqs) { var s = {}; seqs.forEach(function (q) { for (var i = CFG.warm; i <= q.last; i++) if (q.f[i]) s[q.d[i]] = 1; }); return Object.keys(s).map(Number).sort(function (a, b) { return a - b; }); }
  function sampleSet(seqs, from, to, stride) { var X = [], Y = []; seqs.forEach(function (q) { for (var i = CFG.warm; i <= q.last; i += stride || 1) { var d = q.d[i]; if (d < from || d > to || !q.f[i]) continue; X.push(q.f[i]); Y.push(q.y[i]); } }); return { X: X, Y: Y }; }
  /* threshold on the validation dates (end of the training range): the best Fβ among the thresholds whose false-alarm rate does not exceed
     the best current rule's on the same dates — «do not buy recall with false alarms» (directive 27, last note); none → the most precise */
  // combined rules (directive 27 · 5-5: alternative and combined models) — which one is used is chosen on the validation dates only
  var COMBO = { m: function (p, t) { return p >= t; }, mNear: function (p, t, f) { return p >= t && f[5] >= -1; }, mBrk: function (p, t, f) { return p >= t && f[5] > 0; }, mOrBrk: function (p, t, f) { return p >= t || BASE.brk(f); } };
  var COMBOFA = { m: 'مدل', mNear: 'مدل + نزدیکی به سقف ۲۰ جلسه', mBrk: 'مدل + شکست سقف ۲۰ جلسه', mOrBrk: 'مدل یا شکست با حجم' };
  function alertOf(m, thr, combo) { var C = COMBO[combo || 'm']; return function (q, i) { return C(prob(m, q.f[i]), thr, q.f[i]); }; }
  function pickThr(m, seqs, from, to) { var BS = ['near', 'brk'].map(function (b) { return score(seqs, function (q, i) { return BASE[b](q.f[i]); }, from, to); }), cap = Math.min.apply(null, BS.map(function (S) { return S.ep ? S.far : Infinity; })), pcap = Math.max.apply(null, BS.map(function (S) { return S.ep >= 5 ? S.prec : 0; }));
    var all = []; Object.keys(COMBO).forEach(function (cb) { [0.3, 0.4, 0.5, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 0.93, 0.95, 0.97, 0.98, 0.99].forEach(function (thr) { var S = score(seqs, function (q, i) { return COMBO[cb](prob(m, q.f[i]), thr, q.f[i]); }, from, to); if (S.ev < 3 || !S.ep) return; all.push({ thr: thr, combo: cb, fb: S.fb, prec: S.prec, far: S.far }); }); });
    // both: no more false alarms than the best current rule, and at least its precision (on the validation dates)
    var ok = all.filter(function (x) { return !(x.far > cap) && !(x.prec < pcap); }), best = null; (ok.length ? ok : []).forEach(function (x) { if (!best || x.fb > best.fb) best = x; });
    if (!best) all.forEach(function (x) { if (!best || x.prec > best.prec) best = x; }); if (best) { best.cap = cap; best.pcap = pcap; } return best; }
  function walk(seqs, opt) { opt = opt || {}; var D = datesOf(seqs); if (D.length < 300) return { na: 'تاریخچهٔ مشترک کمتر از ۳۰۰ جلسه' };
    var q = function (x) { return D[Math.min(D.length - 1, Math.floor(x * (D.length - 1)))]; }, idx = function (d) { var lo = 0, hi = D.length - 1; while (lo < hi) { var m = (lo + hi) >> 1; if (D[m] < d) lo = m + 1; else hi = m; } return lo; };
    var folds = [], stride = opt.stride || 1, MOD = { fold: [] };
    for (var k = 0; k + 1 < CFG.folds.length; k++) { var a = q(CFG.folds[k]), b = q(CFG.folds[k + 1]), trEnd = D[Math.max(0, idx(a) - CFG.embargo - CFG.L - CFG.W)], vaFrom = q(CFG.folds[k] * 0.8);
      var trainA = sampleSet(seqs, D[0], D[Math.max(0, idx(vaFrom) - CFG.embargo)], stride); if (trainA.Y.reduce(function (x, y) { return x + y; }, 0) < 20) continue;
      var m0 = fit(trainA.X, trainA.Y), th = pickThr(m0, seqs, vaFrom, trEnd); if (!th) continue;
      var train = sampleSet(seqs, D[0], trEnd, stride), m = fit(train.X, train.Y);
      var T = score(seqs, alertOf(m, th.thr, th.combo), a, b, { keep: opt.keep }), B1 = score(seqs, function (s, i) { return BASE.near(s.f[i]); }, a, b), B2 = score(seqs, function (s, i) { return BASE.brk(s.f[i]); }, a, b);
      folds.push({ from: a, to: b, trainEnd: trEnd, thr: th.thr, combo: th.combo, model: T, near: B1, brk: B2, n: train.X.length, pos: m.npos }); MOD.fold.push({ to: trEnd, testFrom: a, testTo: b, m: m, thr: th.thr, combo: th.combo }); }
    if (!folds.length) return { na: 'رویداد کافی برای آموزش نبود' };
    var agg = function (k) { var A = { ev: 0, pre: 0, dur: 0, miss: 0, lead: 0, ep: 0, tp: 0, bars: 0, exe: 0, preHit: 0, pot: 0, real: 0, nReal: 0, byReg: {}, list: [] }; folds.forEach(function (f) { var S = f[k]; ['ev', 'pre', 'dur', 'miss', 'lead', 'ep', 'tp', 'bars', 'exe', 'preHit', 'pot', 'real', 'nReal'].forEach(function (x) { A[x] += S[x]; }); Object.keys(S.byReg).forEach(function (r) { var R = A.byReg[r] = A.byReg[r] || { ev: 0, pre: 0 }; R.ev += S.byReg[r].ev; R.pre += S.byReg[r].pre; }); A.list = A.list.concat(S.list || []); });
      A.pmdr = A.ev ? A.pre / A.ev : NaN; A.prec = A.ep ? A.tp / A.ep : NaN; A.far = A.bars ? 1000 * (A.ep - A.tp) / A.bars : NaN; A.leadAvg = A.pre ? A.lead / A.pre : NaN; var bb = CFG.beta * CFG.beta;
      A.f1 = A.prec + A.pmdr > 0 ? 2 * A.prec * A.pmdr / (A.prec + A.pmdr) : 0; A.fb = A.prec + A.pmdr > 0 ? (1 + bb) * A.prec * A.pmdr / (bb * A.prec + A.pmdr) : 0; A.exeRate = A.pre ? A.exe / A.pre : NaN; A.hitRate = A.pre ? A.preHit / A.pre : NaN; A.potAvg = A.ev ? A.pot / A.ev : NaN; A.realAvg = A.nReal ? A.real / A.nReal : NaN; return A; };
    var final = sampleSet(seqs, D[0], D[Math.max(0, D.length - 1 - CFG.L - CFG.W)], stride), mF = fit(final.X, final.Y), thF = pickThr(mF, seqs, q(0.85), D[D.length - 1]) || { thr: folds[folds.length - 1].thr, combo: folds[folds.length - 1].combo };
    return { folds: folds, model: agg('model'), near: agg('near'), brk: agg('brk'), wins: folds.filter(function (f) { return f.model.fb > Math.max(f.near.fb, f.brk.fb); }).length, final: { m: mF, thr: thF.thr, combo: thF.combo || 'm' }, mods: MOD.fold, D0: D[0], D1: D[D.length - 1] }; }

  /* ---------- acceptance (no learning from noise) ---------- */
  // a candidate is accepted for a class / direction when, out of sample: its Fβ (β 0.5, precision-weighted) beats the best baseline,
  // in at least ⌈2/3⌉ of the folds, with false alarms not above the best baseline's by more than 10 % and precision not lower than the
  // current rule's; and there are at least CFG.minEvents test events. Otherwise the current rules stay.
  function accept(W) { if (!W || W.na) return { ok: false, why: W && W.na || '—' }; var M = W.model, B = W.near.fb >= W.brk.fb ? W.near : W.brk, bn = W.near.fb >= W.brk.fb ? 'near' : 'brk';
    var need = Math.ceil(W.folds.length * 2 / 3), why = [];
    if (M.ev < CFG.minEvents) why.push('رویداد آزمون کمتر از ' + CFG.minEvents);
    if (!(M.fb > B.fb)) why.push('Fβ خارج از نمونه بهتر از قاعدهٔ پایه نیست');
    if (W.wins < need) why.push('فقط در ' + W.wins + ' از ' + W.folds.length + ' دوره بهتر بود');
    if (M.far > Math.min(W.near.far, W.brk.far) * 1.1 && M.far > B.far * 1.1) why.push('هشدار کاذب بیشتر از قاعدهٔ پایه');
    if (M.prec < W.near.prec) why.push('دقت کمتر از قاعدهٔ فعلی');
    return { ok: !why.length, why: why, base: bn }; }

  /* ---------- root causes of a missed move (point in time, at its start s) ---------- */
  var CAUSE = { data: 'تأخیر در دریافت یا به‌روزرسانی داده', hist: 'ناقص بودن تاریخچهٔ قیمت یا حجم', universe: 'حذف دارایی از فهرست تحلیل', trend: 'شناسایی نادرست روند', momentum: 'ضعف در تشخیص تغییر مومنتوم',
    sr: 'محاسبهٔ نامناسب حمایت و مقاومت', entry: 'خطا در تعیین محدودهٔ ورود', confDist: 'فاصلهٔ نامناسب سطح تأیید از قیمت', threshold: 'آستانهٔ بیش از حد سخت‌گیرانه', breakout: 'ضعف در تشخیص شکست یا تغییر رژیم',
    model: 'خطای مدل آماری', cycle: 'عدم شناسایی چرخهٔ زمانی معتبر', cross: 'ضعف در تحلیل بین‌بازاری', delay: 'تأخیر در اجرای تحلیل یا ارسال اعلان', contra: 'تناقض موتور مرکزی و نمایش',
    nontrade: 'طبقه‌بندی فرصت به‌عنوان وضعیت غیرمعاملاتی', liq: 'نقدشوندگی، دامنهٔ نوسان یا محدودیت اجرا', gap: 'جهش ناگهانی بدون نشانهٔ قبلی (خبر یا رویداد بیرونی)' };
  // primary cause first (the one that blocks everything downstream), then contributing causes. ctx: { led (ledger entry at s or null),
  // alerts: [{t, at}] for the asset, n0: bars before s, inCentral: bool, p: model probability at the bars before s, thr }
  function causes(q, e, ctx) { ctx = ctx || {}; var P = q.P, X = P.X, s = e.s, f = q.f[s] || [], out = [], add = function (k, w) { out.push({ k: k, fa: CAUSE[k], w: w }); };
    if ((ctx.n0 != null ? ctx.n0 : s) < 260) add('hist', ' — ' + (ctx.n0 != null ? ctx.n0 : s) + ' جلسه تاریخچه پیش از حرکت (حداقل ۲۶۰)');
    if (ctx.inCentral === false) add('universe', ' — در حکم مرکزی آن روز نبود');
    if (ctx.led && /nodata|sample/.test(ctx.led.st || '') ) add('data', ' — حکم آن روز «بدون دادهٔ معتبر» بود');
    if (ctx.led && ctx.led.tier === 'none' && /valNone|نامعتبر|اعتبار/.test(String(ctx.led.why || ''))) add('nontrade', ' — حکم: ' + String(ctx.led.why).slice(0, 60));
    if (ctx.led && ctx.led.lv && ctx.led.lv.up > 0) { var dist = Math.log(ctx.led.lv.up / X.c[s]) / (P.S[s] * Math.sqrt(5)); if (dist > 1.5) add('confDist', ' — سطح تأیید ' + Math.round(100 * (ctx.led.lv.up / X.c[s] - 1)) + '٪ بالاتر از قیمت'); }
    if (ctx.led && ctx.led.lv && ctx.led.lv.buy && X.c[s] > Math.max(ctx.led.lv.buy[0], ctx.led.lv.buy[1]) * 1.02) add('entry', ' — قیمت بالای محدودهٔ ورود');
    var fa1 = ctx.alerts && ctx.alerts.filter(function (a) { return a.t > s && a.t <= e.e; })[0]; if (fa1) add('delay', ' — اولین اعلان ' + (fa1.t - s) + ' جلسه پس از شروع');
    if (X.lock && X.lock[s + 1] > 0) add('liq', ' — روز بعد از شروع در صف خرید قفل بود');
    if (isF(ctx.p) && isF(ctx.thr) && ctx.p >= 0.75 * ctx.thr && ctx.p < ctx.thr) add('threshold', ' — امتیاز مدل ' + Math.round(100 * ctx.p) + '٪ در برابر آستانهٔ ' + Math.round(100 * ctx.thr) + '٪');
    if (f.length) { if (f[1] > 1) add('momentum', ' — شتاب مومنتوم ' + f[1].toFixed(1) + ' (مثبت) پیش از حرکت بود');
      if (f[7] < 0) add('trend', ' — شیب روند ۵۰ جلسه منفی بود (' + f[7].toFixed(1) + ')');
      if (f[5] > -0.5 && f[5] < 0.5) add('breakout', ' — قیمت در لبهٔ سقف ۲۰ جلسه بود');
      if (f[4] > 0.8) add('breakout', ' — نوسان فشرده بود (خروج از تراکم)');
      if (Math.abs(f[10]) > 1.5) add('cross', ' — دارایی مرتبط پیش‌تر حرکت کرده بود');
      if (f[11] < 0.2 && f[5] < -2) add('sr', ' — شروع از کف محدودهٔ ۲۰ جلسه (حمایت)'); }
    if (isF(ctx.p) && isF(ctx.thr) && ctx.p < 0.5 * ctx.thr && f.length && (f[1] > 1 || f[3] > Math.log(1.5))) add('model', ' — نشانه وجود داشت ولی مدل وزن کافی نداد');
    var day1 = Math.log(X.c[s + 1] / X.c[s]) / P.S[s]; if (!out.length || (day1 > 3 && !(f[1] > 1) && !(f[3] > 0.4))) add('gap', ' — جهش روز اول ' + day1.toFixed(1) + 'σ بدون نشانهٔ قبلی');
    // de-duplicate by key, keep order
    var seen = {}; out = out.filter(function (c) { if (seen[c.k]) return false; seen[c.k] = 1; return true; });
    return { primary: out[0], contrib: out.slice(1) }; }
  // corrective action per cause — the layer where the error happened; «auto» = done by the learning cycle itself
  var ACTION = { hist: ['data', 'auto', 'افزودن نماد به دریافت عمیق تاریخچه (۵۶۰ جلسه) در به‌روزرسانی بعدی'], universe: ['universe', 'auto', 'بازبینی فهرست تحلیل و کنترل پوشش؛ نماد در فهرست پایش قرار می‌گیرد'],
    data: ['data', 'user', 'کوتاه‌کردن فاصلهٔ به‌روزرسانی یا افزودن منبع جایگزین برای این بازار'], nontrade: ['logic', 'user', 'بازبینی قاعدهٔ طبقه‌بندی «غیرمعاملاتی» برای این گروه'],
    confDist: ['logic', 'auto', 'پیش‌آگاهی «تحت پایش» از مدل پیش از حرکت جدا از سطح تأیید صادر می‌شود؛ فاصلهٔ سطح تأیید در چرخهٔ بعد سنجیده می‌شود'], entry: ['logic', 'auto', 'ورود دوباره پس از پولبک (قاعدهٔ دستور ۲۶) و سنجش محدودهٔ ورود در اعتبارسنجی'],
    delay: ['alert', 'user', 'کوتاه‌کردن فاصلهٔ بررسی سبک قیمت در ساعات بازار'], liq: ['exec', 'none', 'محدودیت بازار (صف یا نقدشوندگی) — قابل پیشگیری با مدل نیست؛ در بازده قابل تحقق لحاظ می‌شود'],
    threshold: ['model', 'auto', 'بهینه‌سازی آستانه با آزمون رو به جلو در چرخهٔ بعد'], momentum: ['model', 'auto', 'وزن شتاب مومنتوم در بازآموزی'], trend: ['model', 'auto', 'وزن روند در بازآموزی (حرکت برخلاف روند)'],
    breakout: ['model', 'auto', 'وزن شکست / خروج از تراکم در بازآموزی'], cross: ['model', 'auto', 'وزن دارایی مرتبط (بین‌بازاری) در بازآموزی'], sr: ['model', 'auto', 'وزن موقعیت در محدودهٔ ۲۰ جلسه در بازآموزی'],
    model: ['model', 'auto', 'بازآموزی مدل با دادهٔ تازه؛ پذیرش فقط با بهبود خارج از نمونه'], cycle: ['model', 'user', 'چرخهٔ زمانی هنوز ویژگی مدل نیست (تاریخچهٔ نقطه‌به‌نقطهٔ چرخه موجود نیست)'], contra: ['integrity', 'auto', 'کنترل یکپارچگی'],
    gap: ['none', 'none', 'جهش بی‌نشانه (احتمالاً خبر) — با دادهٔ قیمت قابل پیش‌بینی نیست؛ ثبت و پایش تکرار'] };
  var LAYERFA = { data: 'داده', universe: 'فهرست تحلیل', logic: 'منطق تصمیم', alert: 'اعلان', exec: 'اجرا', model: 'مدل', integrity: 'یکپارچگی', none: '—' };

  Hub.learn = { VER: VER, CFG: CFG, COMBO: COMBO, COMBOFA: COMBOFA, alertOf: alertOf, FEATS: FEATS, FEATFA: FEATFA, BASEFA: BASEFA, REGFA: REGFA, CAUSE: CAUSE, ACTION: ACTION, LAYERFA: LAYERFA,
    sigma: sigma, prepare: prepare, featAt: featAt, fwd: fwd, events: events, fit: fit, prob: prob, why: why, seqOf: seqOf, score: score, walk: walk, accept: accept, causes: causes, exec: exec, regime: regime, BASE: BASE };
  if (typeof module !== 'undefined' && module.exports) module.exports = Hub.learn;
})(typeof window !== 'undefined' ? window : globalThis);
