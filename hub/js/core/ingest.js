/* =====================================================================
 * INCREMENTAL DATA PIPELINE — directive 19 (2026-11-19).
 * The history of every series is loaded once and kept in the browser's IndexedDB (Hub.util.store); later updates request only:
 *   1 · new rows      the sessions after the last official row (plus a short revision window)
 *   2 · revisions     the last few rows again, on a rotation (1/5 of the symbols per update), so a corrected row at the source replaces ours
 *   3 · gaps          dates the market traded but this series has no row for; a date the source answers without a row is recorded
 *                     as «no trade» (halt) and never asked again
 * Every series keeps a checkpoint (hub.ingest.v1): source, first / last official date, rows, last run, rows added, rows revised,
 * open gaps, dates confirmed without trade, last error. Rows are merged by date (upsert): running an update twice adds nothing.
 * Every update run is timed per stage with the requests, bytes and rows it cost (hub.ingest.runs.v1), so the full first load and the
 * incremental updates can be compared on the same page. qc() checks a series before it reaches the engine.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  var KEY = 'hub.ingest.v1', RKEY = 'hub.ingest.runs.v1', REV = 5;
  function U() { return Hub.util; }
  function isF(x) { return typeof x === 'number' && isFinite(x); }
  function st() { var S = U() && U().store.get(KEY, null); if (!S || S.v !== 1) S = { v: 1, cp: {}, fix: [] }; return S; }
  var CACHE = null, dirty = false;
  function S0() { if (!CACHE) CACHE = st(); return CACHE; }
  function flush() { if (CACHE && dirty) { try { CACHE.fix = CACHE.fix.slice(-400); U().store.set(KEY, CACHE); } catch (e) { /* ignore */ } dirty = false; } }
  function cp(store, key) { var S = S0(), k = store + ':' + key; return S.cp[k] || (S.cp[k] = { noTrade: [] }); }
  function mark(store, key, o) { var c = cp(store, key); Object.keys(o).forEach(function (q) { c[q] = o[q]; }); dirty = true; return c; }
  function hash(s) { var h = 0; s = String(s); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

  /* what to request for one daily series.
     rows: stored rows (oldest first; live rows are provisional) · cal: the market's official trading dates (oldest first)
     opt: { target, today (session date of a live / today row), rev, revise (this symbol's turn), maxN (deepest history the source has),
            gapLook (sessions back in which gaps are looked for) } */
  function plan(rows, cal, opt) {
    opt = opt || {}; var off = (rows || []).filter(function (r) { return !r.live; }), c = cp(opt.store || 'x', opt.key || 'x'), nt = {}, P = { need: 'none', count: 0, why: [], gaps: [] };
    (c.noTrade || []).forEach(function (d) { nt[d] = 1; });
    var target = opt.target || 1250, rev = opt.rev || REV;
    if (off.length < target * 0.9 && !(c.maxN && off.length >= c.maxN * 0.98)) { P.need = 'initial'; P.count = target; P.why.push('تاریخچهٔ اولیه (' + off.length + ' از ' + target + ' ردیف)'); return P; }
    var have = {}; off.forEach(function (r) { have[r.date] = 1; });
    var last = off.length ? off[off.length - 1].date : 0, first = off.length ? off[0].date : 0, todayD = opt.today || 0;
    // 1 · sessions after the last official row (today's session is a live row from the market watch, not requested here)
    var after = (cal || []).filter(function (d) { return d > last && (!todayD || d < todayD) && !nt[d]; });
    P.after = after; if (after.length) { P.need = 'tail'; P.count = after.length + rev; P.why.push(after.length + ' جلسهٔ جدید پس از ' + last); }
    // 3 · gaps inside the stored range (within gapLook sessions; older ones are checked once by the initial load)
    var look = (cal || []).filter(function (d) { return d > first && d < last; }).slice(-(opt.gapLook || 250));
    look.forEach(function (d) { if (!have[d] && !nt[d]) P.gaps.push(d); });
    if (P.gaps.length) { var back = (cal || []).filter(function (d) { return d >= P.gaps[0]; }).length + 2; if (back > P.count) P.count = back; P.need = P.need === 'none' ? 'gap' : P.need; P.why.push(P.gaps.length + ' روز مفقود (از ' + P.gaps[0] + ')'); }
    // 2 · revision window on this symbol's turn
    if (opt.revise && P.count < rev) { P.count = rev; if (P.need === 'none') P.need = 'revise'; P.why.push('بازبینی ' + rev + ' ردیف اخیر'); }
    return P;
  }
  /* upsert of the fetched rows: same date → the source's row replaces ours (a change is logged as a revision); stored rows outside the
     fetched range stay; a gap date the source did not return becomes «no trade» */
  var FIELDS = ['close', 'high', 'low', 'open', 'vol'];
  function apply(store, key, old, fresh, P) {
    var m = {}, out, added = 0, rev = [], ot = {};
    (old || []).forEach(function (r) { m[r.date] = r; if (!r.live) ot[r.date] = r; });
    (fresh || []).forEach(function (r) { var o = ot[r.date]; if (!o) added++;
      if (o) FIELDS.forEach(function (f) { if (isF(o[f]) && isF(r[f]) && Math.abs(r[f] - o[f]) > 1e-9 * Math.max(1, Math.abs(o[f]))) rev.push({ date: r.date, f: f, o: o[f], n: r[f] }); });
      m[r.date] = r; });
    out = Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return a.date - b.date; });
    var got = {}, c = cp(store, key), f0 = fresh && fresh.length ? fresh[0].date : Infinity, fL = fresh && fresh.length ? fresh[fresh.length - 1].date : 0; (fresh || []).forEach(function (r) { got[r.date] = 1; });
    // a date counts as «no trade» only when the source answered with rows on both sides of it (a later row proves the day is published),
    // or when the symbol is not trading at all (no trade in today's market watch either: a halt)
    var nt = (c.noTrade || []).slice(); (P ? (P.gaps || []).concat(P.after || []) : []).forEach(function (d) { if (!got[d] && (d >= f0 && d < fL || P.halt && (P.after || []).indexOf(d) >= 0) && nt.indexOf(d) < 0) nt.push(d); });
    if (rev.length) { var S = S0(); rev.slice(0, 20).forEach(function (x) { S.fix.push({ at: Date.now(), s: store, k: key, d: x.date, f: x.f, o: x.o, n: x.n }); }); }
    var off = out.filter(function (r) { return !r.live; });
    mark(store, key, { first: off.length ? off[0].date : null, last: off.length ? off[off.length - 1].date : null, n: off.length, at: Date.now(), added: added, revised: rev.length, noTrade: nt.slice(-200), gaps: (P && P.gaps || []).filter(function (d) { return !got[d] && nt.indexOf(d) < 0; }), err: null, need: P ? P.need : null });
    return { rows: out, added: added, revised: rev };
  }

  /* quality checks before the engine (directive 19 · 7) */
  function qc(rows, opt) {
    opt = opt || {}; var I = [], add = function (k, fa, n, sev, smp) { if (n) I.push({ k: k, fa: fa, n: n, sev: sev, smp: smp || '' }); };
    if (!rows || !rows.length) return { issues: [{ k: 'empty', fa: 'سری خالی', n: 1, sev: 2 }], severe: true };
    var dup = 0, uns = 0, nul = 0, hl = 0, vz = 0, seen = {};
    for (var i = 0; i < rows.length; i++) { var r = rows[i]; if (seen[r.date]) dup++; seen[r.date] = 1; if (i && r.date < rows[i - 1].date) uns++; if (!(r.close > 0)) nul++;
      if (isF(r.high) && isF(r.low) && r.high > 0 && r.low > 0 && (r.high < r.low || r.close > r.high * 1.0001 || r.close < r.low * 0.9999)) hl++;
      if (opt.vol && i && r.vol === 0 && r.close !== rows[i - 1].close && !r.live) vz++; }
    add('dup', 'ردیف تکراری', dup, 2); add('order', 'ترتیب زمانی نادرست', uns, 2); add('null', 'قیمت خالی یا صفر', nul, 2); add('hl', 'ناسازگاری سقف/کف/پایانی', hl, 1); add('vol', 'تغییر قیمت بدون حجم', vz, 1);
    // abnormal moves: |log return| above 8 standard deviations and above the price limit of the market (or 25% where there is none)
    var R = []; for (i = Math.max(1, rows.length - 500); i < rows.length; i++) if (rows[i].close > 0 && rows[i - 1].close > 0) R.push(Math.log(rows[i].close / rows[i - 1].close));
    var mu = R.reduce(function (s, v) { return s + v; }, 0) / (R.length || 1), sd = Math.sqrt(R.reduce(function (s, v) { return s + (v - mu) * (v - mu); }, 0) / Math.max(1, R.length - 1)), lim = opt.limit || 0.25;
    var out = R.filter(function (v) { return Math.abs(v - mu) > Math.max(8 * sd, lim); }).length; add('jump', 'جهش غیرعادی قیمت', out, 1);
    if (opt.cal && opt.cal.length) { var have = {}, f = rows[0].date, L = rows[rows.length - 1].date, nt = {}; rows.forEach(function (x) { have[x.date] = 1; }); (opt.noTrade || []).forEach(function (d) { nt[d] = 1; });
      var miss = opt.cal.filter(function (d) { return d > f && d <= L && !have[d] && !nt[d]; }); add('gap', 'روز معاملاتی مفقود', miss.length, miss.length > 20 ? 2 : 1, miss.slice(-3).join('، ')); }
    if (isF(opt.maxAgeD)) { var last = rows[rows.length - 1].date, t = Date.UTC(Math.floor(last / 10000), Math.floor(last / 100) % 100 - 1, last % 100), age = (Date.now() - t) / 864e5; if (age > opt.maxAgeD) add('stale', 'دادهٔ قدیمی (' + Math.floor(age) + ' روز)', 1, age > opt.maxAgeD * 3 ? 2 : 1); }
    return { issues: I, severe: I.some(function (x) { return x.sev >= 2; }) };
  }

  /* run log: each update is timed per stage with the requests, bytes and rows it cost */
  var RUN = null;
  function begin(name) { var n = Hub.data && Hub.data.net ? Hub.data.net() : { req: 0, bytes: 0 }; RUN = { name: name, at: Date.now(), t0: Date.now(), n0: n, stages: [] }; return RUN; }
  function stage(name, fn) {
    var t = Date.now(), n = Hub.data && Hub.data.net ? Hub.data.net() : { req: 0, bytes: 0 }, R0 = RUN;
    return Promise.resolve().then(fn).then(function (v) { end1(); return v; }, function (e) { end1(e); throw e; });
    function end1(e) { if (!R0) return; var m = Hub.data && Hub.data.net ? Hub.data.net() : { req: 0, bytes: 0 }; R0.stages.push({ name: name, ms: Date.now() - t, req: m.req - n.req, bytes: m.bytes - n.bytes, err: e ? String(e.message || e).slice(0, 120) : null }); }
  }
  function note(o) { if (RUN) Object.keys(o).forEach(function (k) { RUN[k] = (RUN[k] || 0) + o[k]; }); }
  function finish(extra) {
    if (!RUN) return null; var n = Hub.data && Hub.data.net ? Hub.data.net() : { req: 0, bytes: 0 }, R = RUN; RUN = null;
    R.ms = Date.now() - R.t0; R.req = n.req - R.n0.req; R.bytes = n.bytes - R.n0.bytes; delete R.n0; delete R.t0; if (extra) Object.keys(extra).forEach(function (k) { R[k] = extra[k]; });
    var L = (U() && U().store.get(RKEY, null)) || []; L.push(R); try { U().store.set(RKEY, L.slice(-60)); } catch (e) { /* ignore */ } flush(); return R; }
  function runs() { return (U() && U().store.get(RKEY, null)) || []; }

  Hub.ingest = { plan: plan, apply: apply, qc: qc, cp: cp, mark: mark, flush: flush, hash: hash, begin: begin, stage: stage, note: note, finish: finish, runs: runs, fixes: function () { return S0().fix.slice(); }, all: function () { return S0().cp; }, REV: REV, KEY: KEY };
})(typeof window !== 'undefined' ? window : globalThis);
