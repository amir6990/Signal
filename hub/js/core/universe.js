/* Official investment universe (directive 23 · 2).
   Only the classes listed in IN are fetched, analysed, ranked, alerted or used as model inputs. World equity indices
   (Hang Seng, S&P 500, Nikkei, ...) are out of scope: their series are not fetched, stored data is purged, and no module
   may read them for a signal or a rank. Changing scope is a one-line edit here (and a version bump). */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  var VER = 'u1-1405-09-01';
  var IN = {
    stock: 'سهام بورس و فرابورس تهران', fund: 'صندوق‌های بورسی', index: 'شاخص‌های بورس تهران (کل، هم‌وزن)',
    gold: 'طلا و سکه (TGJU)', fx: 'ارز (TGJU)', crypto: 'رمزارز (بیت‌کوین، اتریوم، تتر)',
    commodity: 'کالا و انرژی (نفت برنت و WTI، گاز، نقره، مس، اونس طلا)', option: 'اختیار معامله (بورس تهران)'
  };
  // macro inputs that feed context only (never ranked): US Treasury 10y, Fed funds
  var MACRO = { ust10: 1, fedfunds: 1, effr: 1 };
  var OUT_MK = { intl: 1 };
  var OUT_IDS = ['spx', 'ixic', 'ndx', 'dji', 'rut', 'dax', 'ftse', 'cac', 'n225', 'hsi', 'sse', 'eem', 'tasi', 'xu100'];
  var OUTK = {}; OUT_IDS.forEach(function (i) { OUTK[i] = 1; OUTK['x:' + i] = 1; OUTK['g:' + i] = 1; });
  function inCls(c) { return Object.prototype.hasOwnProperty.call(IN, c); }
  function outKey(k) { return !!OUTK[String(k || '')]; }
  function ok(key, cls) { return !outKey(key) && (cls == null || inCls(cls)); }
  // purge every stored trace of out-of-scope series (data level, not UI)
  function purge() {
    var U = Hub.util && Hub.util.store; if (!U) return 0; var n = 0;
    try { var G = U.get('hub.sigglobal.v1', null); if (G && G.data) { OUT_IDS.forEach(function (i) { ['data', 'snap', 'at', 'srcOf'].forEach(function (f) { if (G[f] && G[f][i] != null) { delete G[f][i]; n++; } }); }); if (n) U.set('hub.sigglobal.v1', G); } } catch (e) { /* ignore */ }
    try { var P = U.get('hub.cycprof.v1', null); if (P && P.P) { var m = 0; Object.keys(P.P).forEach(function (k) { if (outKey(k)) { delete P.P[k]; m++; } }); if (m) { U.set('hub.cycprof.v1', P); n += m; } } } catch (e) { /* ignore */ }
    try { var A = U.get('hub.assets.v1', null); if (A && A.A) { var a = 0; Object.keys(A.A).forEach(function (aid) { var r = A.A[aid]; if (r && (r.keys || []).some(outKey)) { (r.keys || []).forEach(function (k) { if (A.map) delete A.map[k]; }); delete A.A[aid]; a++; } }); if (a) { A.n = Object.keys(A.A).length; U.set('hub.assets.v1', A); n += a; } } } catch (e) { /* ignore */ }
    try { var C = U.get('hub.central.v1', null); if (C && C.by) { var c = 0; Object.keys(C.by).forEach(function (k) { if (outKey(k)) { delete C.by[k]; c++; } }); if (c) { U.set('hub.central.v1', C); n += c; } } } catch (e) { /* ignore */ }
    return n;
  }
  Hub.universe = { VER: VER, IN: IN, MACRO: MACRO, OUT_MK: OUT_MK, OUT_IDS: OUT_IDS, inCls: inCls, outKey: outKey, ok: ok, purge: purge };
})(typeof window !== 'undefined' ? window : globalThis);
