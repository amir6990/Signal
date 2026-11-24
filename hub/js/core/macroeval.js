/* =====================================================================
 * MACRO ENGINE — forecast evaluation for economic variables (not tradable).
 * A macro variable is judged by out-of-sample forecast error against simple benchmarks, never by
 * trading back-test metrics. Walk-forward (expanding window, origin t sees data to t only),
 * h-step forecasts, models: naive (last value), drift, AR(1) on changes, seasonal naive.
 * A model "beats the benchmark" only when relative MAE < 0.95 AND a Diebold–Mariano test on absolute
 * errors (HAC variance for overlapping horizons) has t >= 2 AND there are >= 30 forecasts.
 * Otherwise the stated verdict is "no evidence of improvement over the naive forecast".
 * Forecast intervals are the 10%/90% quantiles of the model's own past out-of-sample errors.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  var isF = function (x) { return typeof x === 'number' && isFinite(x); };
  var mean = function (a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : NaN; };
  var sd = function (a) { var m = mean(a), s = 0; for (var i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m); return a.length > 1 ? Math.sqrt(s / (a.length - 1)) : NaN; };
  function quant(a, q) { var b = a.slice().sort(function (x, y) { return x - y; }); if (!b.length) return NaN; var p = (b.length - 1) * q, i = Math.floor(p); return b[i] + (b[Math.min(i + 1, b.length - 1)] - b[i]) * (p - i); }

  // "date value" per line (or just values); Persian digits, thousands separators and a decimal slash/comma are read
  function parse(text) {
    var P = { '۰': 0, '۱': 1, '۲': 2, '۳': 3, '۴': 4, '۵': 5, '۶': 6, '۷': 7, '۸': 8, '۹': 9, '٠': 0, '١': 1, '٢': 2, '٣': 3, '٤': 4, '٥': 5, '٦': 6, '٧': 7, '٨': 8, '٩': 9 };
    var out = [], bad = [];
    String(text || '').split(/\r?\n/).forEach(function (ln, i) {
      ln = ln.replace(/[۰-۹٠-٩]/g, function (c) { return P[c]; }).replace(/٬/g, ',').replace(/٫/g, '.').trim(); if (!ln) return;
      var m = /^(.*?)[\s,;\t]+(-?\d[\d,]*\.?\d*)\s*$/.exec(ln) || /^(-?\d[\d,]*\.?\d*)$/.exec(ln), v;
      if (!m) { bad.push(i + 1); return; }
      var tk = m[2] != null ? m[2] : m[1]; v = Number(/^-?\d+,\d{1,2}$/.test(tk) ? tk.replace(',', '.') : tk.replace(/,/g, '')); if (!isF(v)) { bad.push(i + 1); return; }
      out.push({ label: m[2] != null ? m[1].trim() : String(out.length + 1), v: v });
    });
    return { rows: out, bad: bad };
  }
  function ar1d(train) {   // Δy_{t+1} = c + φ Δy_t, OLS on the training changes
    var d = []; for (var i = 1; i < train.length; i++) d.push(train[i] - train[i - 1]);
    if (d.length < 8) return null; var x = d.slice(0, -1), y = d.slice(1), mx = mean(x), my = mean(y), sxx = 0, sxy = 0;
    for (var k = 0; k < x.length; k++) { sxx += (x[k] - mx) * (x[k] - mx); sxy += (x[k] - mx) * (y[k] - my); }
    var phi = sxx > 0 ? sxy / sxx : 0; phi = Math.max(-0.95, Math.min(0.95, phi)); return { phi: phi, c: my - phi * mx, last: d[d.length - 1] };
  }
  var MODELS = {
    naive: { fa: 'ساده (آخرین مقدار)', f: function (tr, h) { return tr[tr.length - 1]; } },
    drift: { fa: 'روند خطی (میانگین تغییر)', f: function (tr, h) { return tr[tr.length - 1] + h * (tr[tr.length - 1] - tr[0]) / (tr.length - 1); } },
    ar1d: { fa: 'خودرگرسیون روی تغییرها', f: function (tr, h) { var m = ar1d(tr); if (!m) return NaN; var y = tr[tr.length - 1], d = m.last; for (var i = 0; i < h; i++) { d = m.c + m.phi * d; y += d; } return y; } },
    snaive: { fa: 'فصلی ساده (همان دورهٔ سال قبل)', f: function (tr, h, per) { if (!(per > 1)) return NaN; var k = Math.ceil(h / per), i = tr.length - 1 + h - k * per; return i >= 0 && i < tr.length ? tr[i] : NaN; } }
  };
  function dm(dl, h) {   // Diebold–Mariano on loss differences with Newey–West variance (lag h−1)
    var n = dl.length; if (n < 10) return NaN; var m = mean(dl), g0 = 0; dl.forEach(function (x) { g0 += (x - m) * (x - m); }); g0 /= n; var v = g0;
    for (var k = 1; k < h && k < n; k++) { var g = 0; for (var i = k; i < n; i++) g += (dl[i] - m) * (dl[i - k] - m); v += 2 * (1 - k / h) * g / n; }
    return v > 0 ? m / Math.sqrt(v / n) : NaN;
  }
  function evaluate(vals, o) {
    o = o || {}; var h = Math.max(1, o.h || 1), per = o.period || 0, n = vals.length, minTrain = o.minTrain || Math.max(20, per * 3), res = { n: n, h: h, per: per, models: {}, ok: false, note: '' };
    if (n < minTrain + h + 10) { res.note = 'سری کوتاه است: برای ارزیابی خارج از نمونه دست‌کم ' + (minTrain + h + 10) + ' مشاهده لازم است (دارید ' + n + ').'; return res; }
    var ids = Object.keys(MODELS).filter(function (m) { return m !== 'snaive' || per > 1; }), E = {}, A = {};
    ids.forEach(function (m) { E[m] = []; A[m] = []; });
    var last = []; for (var t = minTrain - 1; t + h < n; t++) { var tr = vals.slice(0, t + 1), y = vals[t + h]; last.push(t);
      ids.forEach(function (m) { var f = MODELS[m].f(tr, h, per); if (isF(f)) { E[m].push({ t: t, e: y - f, up: Math.sign(f - vals[t]), act: Math.sign(y - vals[t]) }); } }); }
    var nv = E.naive; res.nF = nv.length; var sc = 0, sk = 0; for (var i = 1; i < minTrain; i++) { sc += Math.abs(vals[i] - vals[i - 1]); sk++; } sc = sk ? sc / sk : NaN;
    ids.forEach(function (m) {
      var es = E[m], mae = mean(es.map(function (x) { return Math.abs(x.e); })), rmse = Math.sqrt(mean(es.map(function (x) { return x.e * x.e; }))), dirs = es.filter(function (x) { return x.act !== 0; });
      var o2 = { fa: MODELS[m].fa, n: es.length, mae: mae, rmse: rmse, mase: isF(sc) && sc > 0 ? mae / sc : NaN, bias: mean(es.map(function (x) { return x.e; })), dir: dirs.length ? dirs.filter(function (x) { return x.up === x.act; }).length / dirs.length : NaN, q10: quant(es.map(function (x) { return x.e; }), 0.1), q90: quant(es.map(function (x) { return x.e; }), 0.9) };
      if (m !== 'naive' && es.length === nv.length) { var nvm = mean(nv.map(function (x) { return Math.abs(x.e); })); o2.rel = nvm > 0 ? mae / nvm : NaN; o2.dm = dm(nv.map(function (x, k) { return Math.abs(x.e) - Math.abs(es[k].e); }), h); o2.beats = es.length >= 30 && o2.rel < 0.95 && o2.dm >= 2; o2.worse = o2.rel > 1.05 && o2.dm <= -2; }
      res.models[m] = o2; });
    var win = ids.filter(function (m) { return res.models[m].beats; }).sort(function (a, b) { return res.models[a].rel - res.models[b].rel; })[0];
    res.best = win || 'naive'; res.verdict = win ? 'پیش‌بینی «' + MODELS[win].fa + '» روی داده‌های خارج از نمونه از پیش‌بینی ساده دقیق‌تر بود (خطای نسبی ' + res.models[win].rel.toFixed(2) + '، آمارهٔ DM ' + res.models[win].dm.toFixed(2) + ').' : 'شواهدی نیست که هیچ‌یک از مدل‌ها از «آخرین مقدار» دقیق‌تر باشند؛ پیش‌بینی ساده مبنا می‌ماند.';
    var bm = res.models[res.best], tr2 = vals; res.fc = { model: res.best, point: MODELS[res.best].f(tr2, h, per) }; res.fc.lo = res.fc.point + bm.q10; res.fc.hi = res.fc.point + bm.q90; res.ok = true;
    return res;
  }
  Hub.macroEval = { parse: parse, evaluate: evaluate, MODELS: MODELS, dm: dm };
  if (typeof module !== 'undefined' && module.exports) module.exports = Hub.macroEval;
})(typeof window !== 'undefined' ? window : globalThis);
