/* =====================================================================
 * JALALI CALENDAR, IRANIAN HOLIDAYS, BUSINESS-DAY ADJUSTMENT
 * Adapted from the user's own effective-rate calculator (ytm.html):
 * Borkowski Jalali conversion on Julian day numbers, fixed Shamsi holidays,
 * tabular-Islamic lunar holidays (approximate, ±1–2 days: confirm against the
 * official calendar and add corrections), Friday or Thursday+Friday weekends,
 * next / modified-following / previous business-day conventions.
 * Day numbers (JDN) are integers, so date differences are plain subtraction.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  var div = function (a, b) { return ~~(a / b); }, mod = function (a, b) { return a - ~~(a / b) * b; };
  var BR = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
  function jalCal(jy) {
    var bl = BR.length, gy = jy + 621, leapJ = -14, jp = BR[0], jm, jump = 0, leap, n, i;
    if (jy < jp || jy >= BR[bl - 1]) throw new Error('Jalali year out of range');
    for (i = 1; i < bl; i++) { jm = BR[i]; jump = jm - jp; if (jy < jm) break; leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4); jp = jm; }
    n = jy - jp; leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
    if (mod(jump, 33) === 4 && jump - n === 4) leapJ++;
    var leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150, march = 20 + leapJ - leapG;
    if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
    leap = mod(mod(n + 1, 33) - 1, 4); if (leap === -1) leap = 4;
    return { leap: leap, gy: gy, march: march };
  }
  function g2d(gy, gm, gd) { var d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408; return d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752; }
  function d2g(j) {
    var jj = 4 * j + 139361631; jj = jj + div(div(4 * j + 183187720, 146097) * 3, 4) * 4 - 3908;
    var i = div(mod(jj, 1461), 4) * 5 + 308, gd = div(mod(i, 153), 5) + 1, gm = mod(div(i, 153), 12) + 1;
    return { gy: div(jj, 1461) - 100100 + div(8 - gm, 6), gm: gm, gd: gd };
  }
  function j2d(jy, jm, jd) { var r = jalCal(jy); return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1; }
  function jLen(jy, jm) { if (jm <= 6) return 31; if (jm <= 11) return 30; return jalCal(jy).leap === 0 ? 30 : 29; }
  function d2j(jdn) {
    var g = d2g(jdn), jy = g.gy - 621, r = jalCal(jy), start = g2d(r.gy, 3, r.march), k = jdn - start;
    if (k < 0) { jy--; r = jalCal(jy); start = g2d(r.gy, 3, r.march); k = jdn - start; }
    if (k >= 366) { var nx = jalCal(jy + 1), ns = g2d(nx.gy, 3, nx.march); if (jdn >= ns) { jy++; k = jdn - ns; } }
    var jm, jd; if (k < 186) { jm = 1 + div(k, 31); jd = mod(k, 31) + 1; } else { var kk = k - 186; jm = 7 + div(kk, 30); jd = mod(kk, 30) + 1; }
    return { jy: jy, jm: jm, jd: jd };
  }
  function jAdd(jy, jm, jd, months) { var t = (jy * 12 + (jm - 1)) + months, ny = div(t, 12), nm = mod(t, 12) + 1; return [ny, nm, Math.min(jd, jLen(ny, nm))]; }
  var dow = function (jdn) { return ((jdn % 7) + 2) % 7; };            // 0 Saturday … 6 Friday
  function i2d(y, m, d) { return d + Math.ceil(29.5 * (m - 1)) + (y - 1) * 354 + div(3 + 11 * y, 30) + 1948439; }
  function d2i(jdn) { var y = div(30 * (jdn - 1948439) + 10646, 10631); return { y: y }; }
  var FIXED = [[1, 1, 'Nowruz'], [1, 2, 'Nowruz'], [1, 3, 'Nowruz'], [1, 4, 'Nowruz'], [1, 12, 'Islamic Republic Day'], [1, 13, 'Nature Day'], [3, 14, 'Imam Khomeini'], [3, 15, '15 Khordad'], [11, 22, 'Revolution Day'], [12, 29, 'Oil Nationalisation']];
  var LUNAR = [[1, 9], [1, 10], [2, 20], [2, 28], [2, 30], [3, 8], [3, 17], [6, 3], [7, 13], [7, 27], [8, 15], [9, 21], [10, 1], [10, 2], [10, 25], [12, 10], [12, 18]];
  function holidays(from, to, useLunar, extra) {
    var H = {}, a = d2j(from - 40), b = d2j(to + 40), y, k;
    for (y = a.jy; y <= b.jy; y++) FIXED.forEach(function (x) { try { H[j2d(y, x[0], x[1])] = x[2]; } catch (e) { /* range */ } });
    if (useLunar) { var h1 = d2i(from - 40).y, h2 = d2i(to + 40).y; for (y = h1; y <= h2; y++) LUNAR.forEach(function (x) { k = i2d(y, x[0], x[1]); if (!H[k]) H[k] = 'lunar holiday (approx.)'; }); }
    (extra || []).forEach(function (s) { var m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(String(s).trim()); if (m) { try { H[j2d(+m[1], +m[2], +m[3])] = 'manual'; } catch (e) { /* bad date */ } } });
    return H;
  }
  function isOff(jdn, wk, H) { var w = dow(jdn); if (w === 6) return 'Friday'; if (wk >= 2 && w === 5) return 'Thursday'; return (H && H[jdn]) || null; }
  function adjust(jdn, conv, wk, H) {
    if (!conv || conv === 'none') return { d: jdn, why: null };
    var why = isOff(jdn, wk, H); if (!why) return { d: jdn, why: null };
    var step = conv === 'prev' ? -1 : 1, k = jdn, i;
    for (i = 0; i < 30; i++) { k += step; if (!isOff(k, wk, H)) break; }
    if (conv === 'modfollow' && d2j(k).jm !== d2j(jdn).jm) { var p = jdn; for (i = 0; i < 30; i++) { p--; if (!isOff(p, wk, H)) break; } return { d: p, why: why, back: true }; }
    return { d: k, why: why };
  }
  var pad = function (x) { return String(x).padStart(2, '0'); };
  function jstr(jdn) { var a = d2j(jdn); return a.jy + '/' + pad(a.jm) + '/' + pad(a.jd); }
  function gstr(jdn) { var g = d2g(jdn); return g.gy + '-' + pad(g.gm) + '-' + pad(g.gd); }
  function toDate(jdn) { var g = d2g(jdn); return new Date(Date.UTC(g.gy, g.gm - 1, g.gd)); }
  // parse '1405/11/12' (Shamsi) or '2027-02-01' (Gregorian), Persian digits allowed -> JDN
  function parse(s) {
    s = String(s || '').replace(/[۰-۹]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'.indexOf(d); }).replace(/[٠-٩]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); }).trim();
    var m = /^(\d{4})[\/.](\d{1,2})[\/.](\d{1,2})$/.exec(s); if (m) return j2d(+m[1], +m[2], +m[3]);
    m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s); if (m) return g2d(+m[1], +m[2], +m[3]);
    return NaN;
  }
  Hub.jalali = { j2d: j2d, d2j: d2j, g2d: g2d, d2g: d2g, jLen: jLen, jAdd: jAdd, dow: dow, holidays: holidays, isOff: isOff, adjust: adjust, jstr: jstr, gstr: gstr, toDate: toDate, parse: parse };
  if (typeof module !== 'undefined' && module.exports) module.exports = Hub.jalali;
})(typeof window !== 'undefined' ? window : globalThis);
