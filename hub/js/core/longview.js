/* =====================================================================
 * LONG VIEW — the "channel + weekly divergence" school of market commentary, made computable.
 *   1 weekly bars from daily data (week = Saturday…Friday, Tehran convention)
 *   2 log-scale trend channel: least-squares line through log(weekly close); parallel bands at the residual
 *     quantiles that contain `cover` of the closes (default 95%) — a drawn channel, but reproducible
 *   3 weekly RSI(14) and divergence between the last two swing highs (or lows)
 *   4 a reading: where price sits in the channel, what a correction to the mid / lower line means in price,
 *     where the upper line will be in 26 and 52 weeks — and how strong the evidence is.
 * Honest limits: a channel is a description of the past, not a law; divergence is a warning, not a timing tool.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  var isF = function (x) { return typeof x === 'number' && isFinite(x); };
  function jdnOf(g) { var s = String(g), y = +s.slice(0, 4), m = +s.slice(4, 6), d = +s.slice(6, 8), a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3; return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045; }
  // back-adjust TSETMC daily rows for capital increases / dividends with "yesterday price"
  function adjust(rows) {
    var out = new Array(rows.length), f = 1;
    for (var i = rows.length - 1; i >= 0; i--) { var r = rows[i]; out[i] = { date: r.date, open: (r.open || r.close) * f, high: (r.high || r.close) * f, low: (r.low || r.close) * f, close: r.close * f };
      if (i > 0 && r.yclose > 0 && rows[i - 1].close > 0 && Math.abs(r.yclose / rows[i - 1].close - 1) > 0.002) f *= r.yclose / rows[i - 1].close; }
    return out;
  }
  function weekly(rows) {
    var W = [], cur = null;
    rows.forEach(function (r) { if (!(r.close > 0)) return; var wk = Math.floor((jdnOf(r.date) + 2) / 7);       // JDN+2 ≡ 0 on Saturday
      if (!cur || cur.wk !== wk) { cur = { wk: wk, date: r.date, open: r.open || r.close, high: r.high || r.close, low: r.low || r.close, close: r.close }; W.push(cur); }
      else { cur.high = Math.max(cur.high, r.high || r.close); cur.low = Math.min(cur.low, r.low || r.close); cur.close = r.close; cur.date = r.date; } });
    return W;
  }
  function rsi(c, k) { var o = new Array(c.length).fill(NaN), u = 0, d = 0; for (var i = 1; i < c.length; i++) { var x = c[i] - c[i - 1], up = Math.max(x, 0), dn = Math.max(-x, 0); if (i <= k) { u += up / k; d += dn / k; if (i === k) o[i] = d === 0 ? 100 : 100 - 100 / (1 + u / d); } else { u = (u * (k - 1) + up) / k; d = (d * (k - 1) + dn) / k; o[i] = d === 0 ? 100 : 100 - 100 / (1 + u / d); } } return o; }
  // bands: the upper line sits at the upper residual quantile and the lower line at the lower one (each measured on its own side).
  // An earlier version used one width for both sides (the larger extreme), which made the far side look much further than price ever went.
  function channel(W, from, to, cover) {
    var n = to - from + 1; if (n < 20) return null; var sx = 0, sy = 0, sxx = 0, sxy = 0, i, y;
    for (i = from; i <= to; i++) { y = Math.log(W[i].close); sx += i; sy += y; sxx += i * i; sxy += i * y; }
    var b = (n * sxy - sx * sy) / (n * sxx - sx * sx), a = (sy - b * sx) / n, res = [], ss = 0, st = 0, my = sy / n;
    for (i = from; i <= to; i++) { y = Math.log(W[i].close); var e = y - (a + b * i); res.push(e); ss += e * e; st += (y - my) * (y - my); }
    var srt = res.slice().sort(function (p, q) { return p - q; }), q = (1 - (cover || 0.95)) / 2, lo = Math.min(srt[Math.floor(q * (n - 1))], -1e-9), hi = Math.max(srt[Math.ceil((1 - q) * (n - 1))], 1e-9);
    return { a: a, b: b, hi: hi, lo: lo, half: Math.max(-lo, hi), sd: Math.sqrt(ss / (n - 2)), r2: st > 0 ? 1 - ss / st : 0, from: from, to: to, n: n,
      at: function (i2, k) { return Math.exp(a + b * i2 + (k > 0 ? k * hi : k < 0 ? -k * lo : 0)); }, res: function (i2, v) { var e2 = Math.log(v) - (a + b * i2); return e2 >= 0 ? e2 / hi : -e2 / lo; }, growth: Math.exp(b * 52) - 1 };
  }
  // swing pivots on weekly closes: highest / lowest within `w` weeks each side; the latest bar counts if it is the extreme of the last 2w+1
  function pivots(v, w, high) {
    var P = [], n = v.length, cmp = high ? function (a, b) { return a >= b; } : function (a, b) { return a <= b; };
    for (var i = w; i < n; i++) { var ok = true, r = Math.min(n - 1, i + w); for (var j = i - w; j <= r; j++) if (j !== i && !cmp(v[i], v[j])) { ok = false; break; } if (ok && (!P.length || i - P[P.length - 1] >= w)) P.push(i); }
    return P;
  }
  function divergence(W, R, t) {
    var c = W.slice(0, t + 1).map(function (x) { return x.close; }), out = { bear: null, bull: null };
    var H = pivots(c, 3, true).filter(function (i) { return isF(R[i]); }), L = pivots(c, 3, false).filter(function (i) { return isF(R[i]); });
    if (H.length >= 2) { var h2 = H[H.length - 1], h1 = H[H.length - 2]; if (t - h2 <= 6 && h2 - h1 <= 52 && c[h2] > c[h1] && R[h2] < R[h1] - 1 && R[h1] >= 60) out.bear = { i1: h1, i2: h2, p1: c[h1], p2: c[h2], r1: R[h1], r2: R[h2] }; }
    if (L.length >= 2) { var l2 = L[L.length - 1], l1 = L[L.length - 2]; if (t - l2 <= 6 && l2 - l1 <= 52 && c[l2] < c[l1] && R[l2] > R[l1] + 1 && R[l1] <= 40) out.bull = { i1: l1, i2: l2, p1: c[l1], p2: c[l2], r1: R[l1], r2: R[l2] }; }
    return out;
  }
  /* analyse(rows, opt): opt.bars 'w' (default: rows are grouped into weeks) or 'd' (rows used as they are);
   * opt.win = number of bars in the channel window (0 = all); opt.f = [near, far] bars ahead for the projected lines. */
  function analyse(rows, opt) {
    opt = opt || {}; var daily = opt.bars === 'd', W = daily ? rows.filter(function (r) { return r.close > 0; }) : weekly(rows), n = W.length, unit = daily ? 'روز' : 'هفته';
    if (n < 30) return { ok: false, n: n, why: 'کمتر از ۳۰ ' + unit + ' داده' };
    var wn = opt.win || opt.weeks || 0, win = wn && wn < n ? wn : n, from = n - win, t = n - 1, ch = channel(W, from, t, opt.cover || 0.95), f = opt.f || [26, 52];
    var span = jdnOf(W[t].date) - jdnOf(W[from].date), ppy = span > 0 ? (win - 1) / (span / 365.25) : (daily ? 240 : 52); ch.growth = Math.exp(ch.b * ppy) - 1;
    var c = W.map(function (x) { return x.close; }), R = rsi(c, 14), dv = divergence(W, R, t), last = c[t];
    var up = ch.at(t, 1), mid = ch.at(t, 0), lo = ch.at(t, -1), pos = (Math.log(last) - Math.log(lo)) / (Math.log(up) - Math.log(lo));
    var r52 = !daily && n > 52 ? last / c[t - 52] - 1 : NaN, r26 = !daily && n > 26 ? last / c[t - 26] - 1 : NaN;
    var zone = pos >= 0.9 ? 'top' : pos >= 0.65 ? 'upper' : pos > 0.35 ? 'mid' : pos > 0.1 ? 'lower' : 'bottom';
    var read = pos >= 0.9 && dv.bear ? 'correction' : pos >= 0.9 ? 'stretched' : pos <= 0.1 && dv.bull ? 'rebound' : pos <= 0.1 ? 'depressed' : dv.bear ? 'weakening' : dv.bull ? 'improving' : ch.b > 0 ? 'trend-up' : 'trend-down';
    // evidence: how well a straight log line describes the series, and how many separate times each band was approached
    var touchU = 0, touchL = 0; for (var i = from; i <= t; i++) { var e = ch.res(i, c[i]), ep = i === from ? 0 : ch.res(i - 1, c[i - 1]), up1 = Math.log(c[i]) >= ch.a + ch.b * i, upP = i === from ? up1 : Math.log(c[i - 1]) >= ch.a + ch.b * (i - 1);
      if (up1 && e >= 0.7 && (i === from || !upP || ep < 0.7)) touchU++; if (!up1 && e >= 0.7 && (i === from || upP || ep < 0.7)) touchL++; }
    var quality = ch.r2 >= 0.8 && touchU >= 2 && touchL >= 2 ? 'قوی' : ch.r2 >= 0.6 && touchU + touchL >= 3 ? 'متوسط' : 'ضعیف';
    return { ok: true, W: W, R: R, ch: ch, n: n, win: win, t: t, last: last, date: W[t].date, up: up, mid: mid, lo: lo, pos: pos, zone: zone, read: read, dv: dv, rsi: R[t], r52: r52, r26: r26, daily: daily, unit: unit, f: f, ppy: ppy,
      toMid: mid / last - 1, toLo: lo / last - 1, toUp: up / last - 1, upF1: ch.at(t + f[0], 1), upF2: ch.at(t + f[1], 1), midF1: ch.at(t + f[0], 0), midF2: ch.at(t + f[1], 0), loF1: ch.at(t + f[0], -1), loF2: ch.at(t + f[1], -1),
      up26: ch.at(t + 26, 1), up52: ch.at(t + 52, 1), mid26: ch.at(t + 26, 0), mid52: ch.at(t + 52, 0), lo26: ch.at(t + 26, -1), touchU: touchU, touchL: touchL, quality: quality, width: up / lo - 1 };
  }
  /* ---------- time analysis on daily bars (same method as the Temporal tool, usable for any series) ----------
   * cycles: least-squares fit of a cosine of every period minP…maxP to the detrended log price; the three strongest, well-separated periods.
   * Offsets are in calendar days from the last bar. phase 0 = fitted peak, 0.5 = fitted trough. */
  function cycles(rows, o) {
    o = o || {}; var x = rows.filter(function (r) { return r.close > 0; }).slice(-(o.bars || 600)), N = x.length; if (N < 120) return { ok: false, N: N };
    var y = x.map(function (r) { return Math.log(r.close); }), mt = (N - 1) / 2, my = 0, i; for (i = 0; i < N; i++) my += y[i] / N;
    var sxy = 0, sxx = 0; for (i = 0; i < N; i++) { sxy += (i - mt) * (y[i] - my); sxx += (i - mt) * (i - mt); } var sl = sxy / sxx, dt = y.map(function (v, k) { return v - (my + sl * (k - mt)); }), sd = 0; for (i = 0; i < N; i++) sd += dt[i] * dt[i] / N; sd = Math.sqrt(sd);
    var scan = [], maxP = Math.min(o.maxP || 250, Math.floor(N / 2));
    for (var p = Math.max(4, o.minP || 20); p <= maxP; p += (o.stepP || 1)) { var a = 0, b = 0; for (i = 0; i < N; i++) { a += dt[i] * Math.cos(2 * Math.PI * i / p); b += dt[i] * Math.sin(2 * Math.PI * i / p); } a *= 2 / N; b *= 2 / N; scan.push({ p: p, amp: Math.sqrt(a * a + b * b), a: a, b: b }); }
    var pk = scan.filter(function (s, k) { return (k === 0 || s.amp >= scan[k - 1].amp) && (k === scan.length - 1 || s.amp >= scan[k + 1].amp); }).sort(function (u, v) { return v.amp - u.amp; }), top = [];
    pk.forEach(function (s) { if (top.length < 3 && top.every(function (q) { return Math.abs(s.p / q.p - 1) >= (o.sep || 0.15); })) top.push(s); });
    var cpb = (jdnOf(x[N - 1].date) - jdnOf(x[0].date)) / Math.max(1, N - 1), last = x[N - 1].close;
    return { ok: true, N: N, cpb: cpb, date: x[N - 1].date, last: last, weak: top.length > 1 && top[0].amp / top[1].amp < 1.15, cycles: top.map(function (s) {
      var ph = Math.atan2(s.b, s.a), cur = (2 * Math.PI * (N - 1) / s.p - ph) % (2 * Math.PI); if (cur < 0) cur += 2 * Math.PI;
      var toT = ((Math.PI - cur) / (2 * Math.PI) * s.p + s.p) % s.p, toP = ((2 * Math.PI - cur) / (2 * Math.PI) * s.p) % s.p, half = Math.round(s.p / 2), fld = N > half ? x[N - 1 - half].close : NaN;
      return { period: s.p, calDays: Math.round(s.p * cpb), strength: sd ? s.amp / sd : 0, swing: Math.exp(2 * s.amp) - 1, phase: cur / (2 * Math.PI), barsToTrough: Math.round(toT), troughIn: Math.round(toT * cpb), peakIn: Math.round(toP * cpb), fld: fld, above: last > fld }; }) };
  }
  // the major low and high of the last `look` bars (by close), oldest first
  function autoPivots(rows, look) {
    var x = rows.filter(function (r) { return r.close > 0; }).slice(-(look || 300)); if (x.length < 30) return [];
    var lo = x[0], hi = x[0]; x.forEach(function (r) { if (r.close < lo.close) lo = r; if (r.close > hi.close) hi = r; });
    var P = [{ kind: 'low', date: lo.date, price: lo.close }, { kind: 'high', date: hi.date, price: hi.close }]; P.sort(function (u, v) { return u.date - v.date; }); return P;
  }
  // time windows as calendar-day offsets from the last bar: fixed day counts from each pivot, Fibonacci multiples of the last swing's duration, cycle troughs and peaks
  function timeWindows(rows, cy, piv, o) {
    o = o || {}; var x = rows.filter(function (r) { return r.close > 0; }); if (!x.length) return []; var d0 = jdnOf(x[x.length - 1].date), W = [];
    (o.gann || [30, 45, 60, 90, 120, 144, 180, 360]).forEach(function (g) { piv.forEach(function (q) { W.push({ days: jdnOf(q.date) + g - d0, type: 'gann', n: g, from: q.kind, pd: q.date, pp: q.price }); }); });
    if (piv.length >= 2) { var A = piv[piv.length - 2], B = piv[piv.length - 1], D = jdnOf(B.date) - jdnOf(A.date); (o.fibs || [0.382, 0.618, 1, 1.618, 2.618]).forEach(function (f) { W.push({ days: jdnOf(B.date) + Math.round(D * f) - d0, type: 'fib', n: f, span: D, from: A.kind + '>' + B.kind, pd: B.date, pp: B.price, pd0: A.date }); }); }
    if (cy && cy.ok) cy.cycles.forEach(function (c) { W.push({ days: c.troughIn, type: 'trough', n: c.calDays, bars: c.period, strength: c.strength }); W.push({ days: c.peakIn, type: 'peak', n: c.calDays, bars: c.period, strength: c.strength }); });
    return W.filter(function (w) { return w.days >= -3 && w.days <= (o.ahead || 120); }).sort(function (u, v) { return u.days - v.days; });
  }
  // class of a time window, for the track record: each day count and ratio on its own, cycles by length
  function winClass(w) { return w.type === 'gann' ? 'gann-' + w.n : w.type === 'fib' ? 'fib-' + w.n : w.type + (w.n <= 150 ? '-short' : '-long'); }
  // a turn = a close that is the highest (or lowest) of the 5 bars before and the 5 bars after it
  function turns(c) {
    var n = c.length, k = 5, hi = [], lo = [], i, j;
    for (i = k; i < n - k; i++) { var h = true, l = true; for (j = i - k; j <= i + k; j++) { if (j === i) continue; if (c[j] > c[i]) h = false; if (c[j] < c[i]) l = false; } if (h) hi.push(i); if (l) lo.push(i); }
    var near = function (P) { var m = new Array(n).fill(false); P.forEach(function (q) { for (var d = -2; d <= 2; d++) if (q + d >= 0 && q + d < n) m[q + d] = true; }); return m; };
    return { hi: near(hi), lo: near(lo), last: n - k - 1 };
  }
  function hitAt(T, w, i) { return w.type === 'trough' ? T.lo[i] : w.type === 'peak' ? T.hi[i] : T.lo[i] || T.hi[i]; }
  /* walk-forward check of the time windows on a series' own history: at every 10th past bar the windows are computed from data up to that bar only,
   * and each window due within 30 days is checked against what happened: did a turn (see turns) fall within ±2 bars of the date?
   * base = how often a random day is within ±2 bars of such a turn. Returns counts per class. */
  function evalWindows(rows, o) {
    o = o || {}; var x = rows.filter(function (r) { return r.close > 0; }), n = x.length, start = o.start || 300, out = { cls: {}, n: 0 }; if (n < start + 40) return out;
    var c = x.map(function (r) { return r.close; }), jd = x.map(function (r) { return jdnOf(r.date); }), T = turns(c), seen = {}, i, b = { any: 0, lo: 0, hi: 0 }, m = 0, mv = 0, mvN = 0;
    for (i = start; i <= T.last; i++) { m++; if (T.lo[i] || T.hi[i]) b.any++; if (T.lo[i]) b.lo++; if (T.hi[i]) b.hi++; if (i + 10 < n) { mv += Math.abs(c[i + 10] / c[i] - 1); mvN++; } }
    if (!m) return out; b.any /= m; b.lo /= m; b.hi /= m; mv = mvN ? mv / mvN : 0;
    for (var t = start; t < T.last; t += (o.step || 10)) {
      var sub = x.slice(Math.max(0, t - 599), t + 1), cy = cycles(sub, { bars: 400, stepP: 2 }), piv = autoPivots(sub, 300), W = timeWindows(sub, cy, piv, { ahead: 30 });
      W.forEach(function (w) { if (w.days < 1) return; if ((w.type === 'trough' || w.type === 'peak') && !(w.strength >= 0.4)) return; var tg = jd[t] + w.days, key = winClass(w) + '|' + (w.type === 'trough' || w.type === 'peak' ? Math.round(tg / 7) : tg); if (seen[key]) return;
        var k2 = t + 1; while (k2 < n && jd[k2] < tg) k2++; if (k2 > T.last || jd[k2] - tg > 4) return; seen[key] = 1;
        var cl = winClass(w), q = out.cls[cl] || (out.cls[cl] = { n: 0, hit: 0, exp: 0, vr: 0, mv: 0, mvB: 0 }), bb = w.type === 'trough' ? b.lo : w.type === 'peak' ? b.hi : b.any;
        q.n++; out.n++; if (hitAt(T, w, k2)) q.hit++; q.exp += bb; q.vr += bb * (1 - bb); if (k2 + 10 < n) { q.mv += Math.abs(c[k2 + 10] / c[k2] - 1); q.mvB += mv; } });
    }
    return out;
  }
  /* walk-forward check of the channel / divergence readings: at past bars (non-overlapping steps of `fwd`), the reading is computed from data
   * up to that bar only and the return over the next `fwd` bars is recorded. Per reading: count, mean forward return, share of positive returns.
   * `all` is the same for every tested bar (the unconditional comparison). */
  function evalReadings(rows, o) {
    o = o || {}; var daily = o.bars === 'd', W = daily ? rows.filter(function (r) { return r.close > 0; }) : weekly(rows), n = W.length, win = o.win || 60, fwd = o.fwd || 20, step = o.step || fwd, out = { cls: {}, all: { n: 0, sum: 0, sq: 0, pos: 0 } };
    var start = Math.max(win, 30); if (n < start + fwd + 5) return out;
    for (var t = start; t + fwd < n; t += step) {
      var A = analyse(W.slice(0, t + 1), { bars: 'd', win: win, cover: o.cover || 0.95, f: [1, fwd] }); if (!A.ok) continue;      // 'd' = use the bars as they are (already weekly when needed)
      var r = Math.log(W[t + fwd].close / W[t].close), add = function (q) { q.n++; q.sum += r; q.sq += r * r; if (r > 0) q.pos++; };
      add(out.all); add(out.cls[A.read] || (out.cls[A.read] = { n: 0, sum: 0, sq: 0, pos: 0, base: 0 })); out.cls[A.read].base += 0;
    }
    return out;
  }
  // square of nine: levels at ±k·45° around a base price (sqrt(base) ± k/4, squared); the ones nearest to the current price
  function sq9(base, price, each) {
    if (!(base > 0) || !(price > 0)) return []; var rt = Math.sqrt(base), L = [];
    for (var k = -40; k <= 400; k++) { if (!k) continue; var r = rt + k / 4; if (r <= 0) continue; var v = r * r; L.push({ steps: k, angle: Math.abs(k) * 45, level: v, dist: v / price - 1 }); }
    var up = L.filter(function (q) { return q.level > price; }).sort(function (u, v2) { return u.level - v2.level; }).slice(0, each || 3), dn = L.filter(function (q) { return q.level <= price; }).sort(function (u, v2) { return v2.level - u.level; }).slice(0, each || 3);
    return dn.reverse().concat(up);
  }
  // causal votes for the trading engine, from daily data only (about a year): channel position and weekly divergence
  function votesAt(X, t, cache) {
    var out = { channel: null, wdiv: null }; if (t < 150) return out;
    var rows = []; for (var i = Math.max(0, t - 259); i <= t; i++) rows.push({ date: X.d[i], open: X.o[i], high: X.h[i], low: X.l[i], close: X.c[i] });
    var W = weekly(rows), n = W.length; if (n < 30) return out;
    var ch = channel(W, 0, n - 1, 0.95), c = W.map(function (x) { return x.close; }), last = c[n - 1], up = ch.at(n - 1, 1), lo = ch.at(n - 1, -1), pos = (Math.log(last) - Math.log(lo)) / (Math.log(up) - Math.log(lo)), g = ch.growth;
    var v = pos >= 0.92 ? -0.6 : pos >= 0.8 ? -0.25 : pos <= 0.08 ? (g > 0 ? 0.6 : 0.2) : pos <= 0.2 ? (g > 0 ? 0.3 : 0) : g > 0 ? 0.15 : -0.15;
    out.channel = { v: v, why: 'جایگاه در کانال لگاریتمی یک‌ساله: ' + Math.round(pos * 100) + '٪ از کف تا سقف' + (pos >= 0.92 ? ' (نزدیک سقف)' : pos <= 0.08 ? ' (نزدیک کف)' : '') + '، شیب سالانهٔ کانال ' + Math.round(g * 100) + '٪', pos: pos, up: up, lo: lo, mid: ch.at(n - 1, 0) };
    var R = rsi(c, 14), dv = divergence(W, R, n - 1);
    out.wdiv = { v: dv.bear ? -0.8 : dv.bull ? 0.8 : 0, why: dv.bear ? 'واگرایی منفی هفتگی: قیمت سقف بالاتر، RSI سقف پایین‌تر (' + Math.round(dv.bear.r1) + ' ← ' + Math.round(dv.bear.r2) + ')' : dv.bull ? 'واگرایی مثبت هفتگی: قیمت کف پایین‌تر، RSI کف بالاتر (' + Math.round(dv.bull.r1) + ' ← ' + Math.round(dv.bull.r2) + ')' : 'واگرایی هفتگی دیده نمی‌شود (RSI هفتگی ' + (isF(R[n - 1]) ? Math.round(R[n - 1]) : '—') + ')' };
    return out;
  }
  Hub.longView = { evalReadings: evalReadings, winClass: winClass, turns: turns, hitAt: hitAt, evalWindows: evalWindows, cycles: cycles, autoPivots: autoPivots, timeWindows: timeWindows, sq9: sq9, weekly: weekly, channel: channel, rsi: rsi, divergence: divergence, analyse: analyse, adjust: adjust, votesAt: votesAt, jdnOf: jdnOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = Hub.longView;
})(typeof window !== 'undefined' ? window : globalThis);
