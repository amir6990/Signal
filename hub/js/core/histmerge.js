/* =====================================================================
 * HISTORY GUARD — an update adds new rows; it never removes the history already stored.
 * Used by every data feed (Hub.signals.safeFetch), by the phone sync (pull) and by the history audit.
 *
 *   merge(old, fresh, opt) → merged value of the same shape. Shapes recognised anywhere in a store's data map:
 *     rows    [{date, close, …}]            stored rows before the fresh range + the fresh rows + stored official rows after it
 *     packed  [[yyyymmdd, o, h, l, c], …]   (Iran-economy series) merged by the first element
 *     objects { key: shape }                merged key by key; a key missing from the fresh fetch keeps its stored history
 *   A series is never shortened. If the fresh rows disagree with the stored ones on the overlapping dates (median gap > 5%,
 *   e.g. a fallback source in another unit), the two are not mixed: the longer history is kept and the case is reported.
 *   Cap: 3,000 rows per series (≈ 12 years of sessions) — far above the deepest need of the engine (1,250).
 *
 *   audit() → per data group: series, rows (min / median / max) against the engine's needs (short & medium 260, long 560, validation 1,250)
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  var CAP = 3000, NEED = { s: 260, m: 260, l: 560, full: 1250 };
  function isRows(a) { return Array.isArray(a) && a.length > 0 && a[0] && typeof a[0] === 'object' && !Array.isArray(a[0]) && a[0].date != null; }
  function isPacked(a) { return Array.isArray(a) && a.length > 0 && Array.isArray(a[0]) && typeof a[0][0] === 'number' && a[0][0] > 19000000; }
  function dk(r) { return Array.isArray(r) ? r[0] : +r.date || r.date; }
  function cl(r) { return Array.isArray(r) ? r[4] : r.close; }
  function median(a) { if (!a.length) return NaN; var s = a.slice().sort(function (x, y) { return x - y; }); return s[Math.floor(s.length / 2)]; }
  // do the two series measure the same thing in the same unit? (overlapping dates, official rows only)
  function sameUnit(o, n) { var m = {}; o.forEach(function (r) { if (!r.live) m[dk(r)] = cl(r); }); var g = [];
    n.forEach(function (r) { var v = m[dk(r)], c = cl(r); if (!r.live && v > 0 && c > 0) g.push(Math.abs(c / v - 1)); }); return g.length < 3 || median(g.slice(-60)) <= 0.05; }
  function mergeSeries(o, n, rep, path) {
    if (!o || !o.length) return n; if (!n || !n.length) return o;
    if (!sameUnit(o, n)) { if (rep) rep.push({ path: path, kind: 'unit', old: o.length, fresh: n.length, kept: n.length >= o.length ? 'fresh' : 'old' }); return n.length >= o.length ? n : o; }
    // the fresh series is authoritative inside its own date range (an official row replaces a provisional one; a weekly bar that grew
    // during the week replaces its earlier partial version); stored rows before that range are kept, and official rows after it too
    var f0 = dk(n[0]), fL = dk(n[n.length - 1]), pre = o.filter(function (r) { return dk(r) < f0; }), suf = o.filter(function (r) { return dk(r) > fL && !r.live; });
    var out = pre.concat(n, suf), added = n.filter(function (r) { var d = dk(r); return !o.some(function (q) { return dk(q) === d; }); }).length;
    if (out.length > CAP) out = out.slice(-CAP);
    if (rep && out.length > n.length) rep.push({ path: path, kind: 'kept', old: o.length, fresh: n.length, merged: out.length, added: added });
    return out;
  }
  function merge(o, n, opt, rep, path) {
    path = path || '';
    if (n === undefined || n === null) return o;
    if (o === undefined || o === null) return n;
    if ((isRows(o) || isPacked(o) || (Array.isArray(o) && !o.length)) && (isRows(n) || isPacked(n) || (Array.isArray(n) && !n.length))) return mergeSeries(o, n, rep, path);
    if (Array.isArray(o) || Array.isArray(n)) return n;   // other arrays (lists, settings): the fresh value
    if (typeof o === 'object' && typeof n === 'object') { var out = {}; Object.keys(n).forEach(function (k) { out[k] = merge(o[k], n[k], opt, rep, path ? path + '.' + k : k); });
      Object.keys(o).forEach(function (k) { if (!(k in out) && hasHist(o[k])) { out[k] = o[k]; if (rep) rep.push({ path: path ? path + '.' + k : k, kind: 'missing', old: depth(o[k]) }); } }); return out; }
    return n;
  }
  function hasHist(v) { if (isRows(v) || isPacked(v)) return true; if (v && typeof v === 'object' && !Array.isArray(v)) return Object.keys(v).some(function (k) { return hasHist(v[k]); }); return false; }
  function depth(v) { if (isRows(v) || isPacked(v)) return v.length; if (v && typeof v === 'object' && !Array.isArray(v)) { var m = 0; Object.keys(v).forEach(function (k) { m = Math.max(m, depth(v[k])); }); return m; } return 0; }
  // stores whose data are a snapshot, not a history (option contracts expire): never merged
  var SNAPSHOT = { 'hub.sigoptions.v1': 1, 'sig-options': 1 };
  function mergeStore(key, oldData, freshData, rep) { if (SNAPSHOT[key]) return freshData; return merge(oldData, freshData, null, rep, ''); }

  /* history audit: is there enough history for every horizon of the engine? */
  var GROUPS = [['hub.sigstocks.v1', 'سهام و صندوق‌ها', function (d) { var o = {}; Object.keys(d || {}).forEach(function (k) { if (k[0] !== '_' && d[k] && d[k].px) o[k] = d[k].px.length; }); return o; }],
    ['hub.sig-gold.v1', 'طلا و سکه', null], ['hub.sig-fx.v1', 'ارز و تتر', null], ['hub.sigglobal.v1', 'بازارهای جهانی و رمزارز', null],
    ['hub.longview.v1', 'سری‌های اقتصاد ایران (روزانه)', function (d) { var o = {}; Object.keys(d || {}).forEach(function (k) { var v = d[k]; if (v && v.d) o[k] = v.d.length; }); return o; }]];
  function audit() {
    var St = Hub.util && Hub.util.store; if (!St) return [];
    return GROUPS.map(function (g) { var S = St.get(g[0], null), live = S && S.meta && !/synthetic|illustrative/i.test(S.meta.source || ''), m = g[2] ? g[2](S && S.data) : {};
      if (!g[2] && S && S.data) Object.keys(S.data).forEach(function (k) { if (isRows(S.data[k])) m[k] = S.data[k].length; });
      var v = Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return a - b; }), short = Object.keys(m).filter(function (k) { return m[k] < NEED.m; }), noLong = Object.keys(m).filter(function (k) { return m[k] >= NEED.m && m[k] < NEED.l; });
      return { key: g[0], fa: g[1], live: !!live, n: v.length, min: v[0] || 0, med: v.length ? v[Math.floor(v.length / 2)] : 0, max: v[v.length - 1] || 0, short: short, noLong: noLong, full: v.filter(function (x) { return x >= NEED.full; }).length,
        log: S && S.meta && S.meta.histLog || null }; });
  }
  Hub.histMerge = { merge: merge, mergeStore: mergeStore, mergeSeries: mergeSeries, audit: audit, NEED: NEED, CAP: CAP, depth: depth };
})(typeof window !== 'undefined' ? window : globalThis);
