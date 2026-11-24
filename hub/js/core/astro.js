/* =====================================================================
 * FINANCIAL ASTROLOGY & PLANETARY CYCLES ENGINE — research engine (directive 24).
 *
 * Kept apart from the market-cycle engine (js/core/cycles.js): that engine uses prices only, this one uses only astronomical
 * variables; a separate comparison layer measures whether the astronomical variables add anything.
 *
 * Ephemeris  astronomy-engine 2.1.19 (MIT, Don Cross; VSOP87 / NOVAS-grade, ±1 arc-minute). Geocentric apparent longitudes on the
 *            true ecliptic of date (tropical zodiac), heliocentric longitudes for the heliocentric variants. All times are UTC;
 *            mapping to a market session uses Tehran time (UTC+03:30) and the Tehran exchange close (12:30).
 *            Checked against published values: 2024-04-08 total solar eclipse 18:17 UTC; 2024-01-25 full moon 17:54 UTC;
 *            2025-03-14 total lunar eclipse 06:59 UTC; 2020-12-21 Jupiter–Saturn conjunction ≈18:30 UTC; Mercury station
 *            retrograde 2024-04-01 ≈22:14 UTC at 27°13′ Aries.
 *
 * Hypotheses are pre-registered (HYP, frozen with its hash before any result was seen): fixed event, fixed window, fixed outcome,
 * fixed validity rule. Each market is tested on its own data. Primary test: the out-of-sample segment (last 40 % of sessions),
 * circular-shift permutation (the event calendar is rotated against the market, preserving the clustering of both), Benjamini–
 * Hochberg FDR and Holm across every market × hypothesis of a family. Gann time counts use a random-lag null; the Square of Nine
 * a random-phase null. The incremental test (ridge linear probability model, walk-forward) asks whether astronomical features
 * lower the out-of-sample Brier score of a price-only model. Nothing here issues a trading signal.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {}, AE = root.Astronomy;
  var VER = 'a1-1405.09.03', KEY = 'hub.astro.v1', LED = 'hub.astro.ledger.v1', HIST = 'hub.astro.hist.v1';
  var U = function () { return Hub.util; };
  function isF(x) { return typeof x === 'number' && isFinite(x); }

  /* ---------------- bodies, signs, aspects ---------------- */
  var BODIES = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
  var BFA = { Sun: 'خورشید', Moon: 'ماه', Mercury: 'عطارد', Venus: 'زهره', Mars: 'مریخ', Jupiter: 'مشتری', Saturn: 'زحل', Uranus: 'اورانوس', Neptune: 'نپتون', Pluto: 'پلوتو' };
  var SIGNS = ['حمل', 'ثور', 'جوزا', 'سرطان', 'اسد', 'سنبله', 'میزان', 'عقرب', 'قوس', 'جدی', 'دلو', 'حوت'];
  var ASP = { 0: 'مقارنه', 60: 'تسدیس', 90: 'تربیع', 120: 'تثلیث', 180: 'مقابله' };
  var OUTER = ['Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
  var STATIONERS = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];
  var DAY = 86400000;

  /* ---------------- pre-registered hypotheses (frozen; do not edit without a new version and a new registration) ----------------
     out: 'piv' = a turning point of the asset's own ATR zigzag (minor: 2×ATR14, major: 5×ATR14) within ±w sessions of the event;
          'vol' = mean |log return| over sessions [0, +w] relative to the asset's mean |log return| (two-sided);
          'ret' = mean daily log return in the new-moon half of the lunar month minus the full-moon half (Dichev & Janes 2003 sign).
     rule: valid ⇔ out-of-sample FDR q < 0.05 (family), effect in the pre-registered direction with lift ≥ 1.15 (piv) / |lift−1| ≥ 0.10
          (vol), ≥ 15 out-of-sample events, and the in-sample effect has the same sign (stability). */
  var HYP = [
    { id: 'L1', fa: 'ماه نو → نقطهٔ عطف کوچک', ev: 'newMoon', w: 3, out: 'piv', sc: 'minor', school: 'چرخهٔ ماه' },
    { id: 'L2', fa: 'ماه کامل → نقطهٔ عطف کوچک', ev: 'fullMoon', w: 3, out: 'piv', sc: 'minor', school: 'چرخهٔ ماه' },
    { id: 'L3', fa: 'بازده نیمهٔ ماه نو بیشتر از نیمهٔ ماه کامل', ev: 'lunarHalf', w: 7, out: 'ret', sc: null, school: 'چرخهٔ ماه (دیچف و جینز ۲۰۰۳)' },
    { id: 'E1', fa: 'خورشیدگرفتگی و ماه‌گرفتگی → نقطهٔ عطف بزرگ', ev: 'eclipse', w: 10, out: 'piv', sc: 'major', school: 'گرفت‌ها' },
    { id: 'E2', fa: 'گرفت‌ها → تغییر نوسان ۱۰ جلسهٔ بعد', ev: 'eclipse', w: 10, out: 'vol', sc: null, school: 'گرفت‌ها' },
    { id: 'R1', fa: 'ایستگاه‌های عطارد (آغاز و پایان رجعت) → نقطهٔ عطف کوچک', ev: 'stMercury', w: 3, out: 'piv', sc: 'minor', school: 'حرکت رجعی' },
    { id: 'R2', fa: 'دورهٔ رجعت عطارد → تغییر نوسان', ev: 'retroMercury', w: 0, out: 'vol', sc: null, school: 'حرکت رجعی (مورگیا ۲۰۱۶)' },
    { id: 'R3', fa: 'ایستگاه‌های زهره و مریخ → نقطهٔ عطف بزرگ', ev: 'stVenusMars', w: 5, out: 'piv', sc: 'major', school: 'حرکت رجعی' },
    { id: 'A1', fa: 'زوایای اصلی مشتری–زحل (زمین‌مرکزی) → نقطهٔ عطف بزرگ', ev: 'aspJS', w: 10, out: 'piv', sc: 'major', school: 'چرخهٔ همنشینی' },
    { id: 'A2', fa: 'زوایای سخت سیارات بیرونی (زمین‌مرکزی) → نقطهٔ عطف بزرگ', ev: 'hardOuterGeo', w: 10, out: 'piv', sc: 'major', school: 'زوایای سیاره‌ای' },
    { id: 'A3', fa: 'زوایای سخت سیارات بیرونی (خورشیدمرکزی) → نقطهٔ عطف بزرگ', ev: 'hardOuterHelio', w: 10, out: 'piv', sc: 'major', school: 'زوایای سیاره‌ای (خورشیدمرکزی)' },
    { id: 'A4', fa: 'زوایای سخت مریخ با مشتری، زحل و اورانوس → نقطهٔ عطف کوچک', ev: 'hardMars', w: 3, out: 'piv', sc: 'minor', school: 'زوایای سیاره‌ای' },
    { id: 'S1', fa: 'اعتدال‌ها و انقلاب‌ها (ورود خورشید به برج‌های اصلی) → نقطهٔ عطف بزرگ', ev: 'cardinal', w: 5, out: 'piv', sc: 'major', school: 'چرخهٔ خورشیدی / گن' },
    { id: 'C1', fa: 'خوشهٔ رویدادها (دست‌کم دو رویداد ثبت‌شده در ±۲ جلسه) → نقطهٔ عطف کوچک', ev: 'cluster', w: 3, out: 'piv', sc: 'minor', school: 'ترکیب چند چرخه' },
    { id: 'G1', fa: 'گن: ۹۰، ۱۸۰، ۲۷۰ و ۳۶۰ روز تقویمی پس از نقطهٔ عطف بزرگ → نقطهٔ عطف بزرگ', ev: 'gannTime', w: 5, out: 'piv', sc: 'major', school: 'نظریهٔ گن (چرخهٔ زمانی)' },
    { id: 'G2', fa: 'گن: مربع ۹ — نقاط عطف بعدی روی شبکهٔ ۴۵ درجه از قیمت نقطهٔ عطف', ev: 'sq9', w: 0, out: 'sq9', sc: 'major', school: 'نظریهٔ گن (مربع ۹)' }
  ];
  var HYP_HASH = null;   // sha-256 of JSON.stringify(HYP), computed lazily (shown on the page, recorded in the registration document)
  var NOTEST = [
    ['زاویه‌های گن (۱×۱ و ...)', 'شیب زاویه به واحد قیمت بر زمان بستگی دارد و گن واحد ثابتی تعریف نکرده است؛ هر انتخاب واحد، نتیجه را می‌سازد. بدون واحد از پیش تعیین‌شده آزمون‌پذیر نیست.'],
    ['چرخ گن (Gann Wheel) و مربع‌سازی زمان و قیمت', 'به همان واحد دلخواه قیمت/زمان نیاز دارد؛ همان ایراد زاویه‌ها.'],
    ['ورود ماه به برج‌ها و درجات خاص', 'هر ۲٫۵ روز یک ورود؛ فرضیهٔ جهت‌دار مشخص و مستند در منابع معتبر یافت نشد؛ ثبت نشد تا آزمون‌ها بی‌دلیل زیاد نشوند.'],
    ['چرخهٔ لکه‌های خورشیدی', 'دادهٔ روزانهٔ لکه‌ها (SILSO) در این نسخه دریافت نمی‌شود؛ فقط چرخه‌های هندسی خورشید (اعتدال و انقلاب) آزموده شد.'],
    ['جنگل تصادفی و XGBoost', 'با چند هزار جلسه برای هر بازار و ده‌ها ویژگی، خطر بیش‌برازش زیاد است؛ مدل خطی ریج (احتمال خطی) با اعتبارسنجی پیش‌رونده ثبت شد. مدل‌های درختی می‌توانند در نسخهٔ بعد با ثبت جدید افزوده شوند.']
  ];

  /* ---------------- ephemeris ---------------- */
  function geoLon(b, d) { if (b === 'Sun') return AE.SunPosition(d).elon; if (b === 'Moon') return AE.EclipticGeoMoon(d).lon; return AE.Ecliptic(AE.GeoVector(b, d, true)).elon; }
  function helLon(b, d) { return AE.EclipticLongitude(b, d); }
  function wrap180(x) { x = ((x % 360) + 540) % 360 - 180; return x; }
  function now() { return new Date(); }
  // the sky at a moment: longitude, sign, degree, speed (deg/day), retrograde flag, heliocentric longitude
  function sky(d) { d = d || now(); return BODIES.map(function (b) { var l = geoLon(b, d), l2 = geoLon(b, new Date(d.getTime() + DAY / 2)), l1 = geoLon(b, new Date(d.getTime() - DAY / 2)), sp = wrap180(l2 - l1);
    return { b: b, fa: BFA[b], lon: l, sign: SIGNS[Math.floor(l / 30)], deg: l % 30, sp: sp, retro: b !== 'Sun' && b !== 'Moon' && sp < 0, hel: b === 'Sun' || b === 'Moon' ? null : helLon(b, d) }; }); }

  /* daily longitude table (00:00 UTC) — computed once per session of the page, cached in memory */
  var EPH = null;
  function ephem(fromMs, toMs) {
    if (EPH && EPH.from <= fromMs && EPH.to >= toMs) return EPH;
    var from = Math.floor(fromMs / DAY) * DAY, to = Math.ceil(toMs / DAY) * DAY, n = Math.round((to - from) / DAY) + 1, G = {}, H = {};
    BODIES.forEach(function (b) { G[b] = new Float64Array(n); if (b !== 'Sun' && b !== 'Moon') H[b] = new Float64Array(n); });
    for (var i = 0; i < n; i++) { var d = new Date(from + i * DAY); BODIES.forEach(function (b) { G[b][i] = geoLon(b, d); if (H[b]) H[b][i] = helLon(b, d); }); }
    EPH = { from: from, to: to, n: n, G: G, H: H }; return EPH;
  }
  // zero crossings of f(i) = wrap180(lonA − lonB − angle) between daily samples, refined by linear interpolation (≤ ~1 h for slow bodies)
  function crossings(A, B, ang, E) { var out = [], prev = null; for (var i = 0; i < E.n; i++) { var f = wrap180(A[i] - B[i] - ang); if (prev !== null && Math.abs(f - prev) < 90 && ((prev < 0 && f >= 0) || (prev > 0 && f <= 0))) { var fr = prev / (prev - f); out.push(E.from + (i - 1 + fr) * DAY); } prev = f; } return out; }
  function stations(b, E) { var L = E.G[b], out = [], ps = null; for (var i = 1; i < E.n - 1; i++) { var s = wrap180(L[i + 1] - L[i - 1]); if (ps !== null && ((ps > 0 && s <= 0) || (ps < 0 && s >= 0))) out.push({ t: E.from + (i - 1 + ps / (ps - s)) * DAY, kind: ps > 0 ? 'R' : 'D', lon: L[i] }); ps = s; } return out; }

  /* all events of the registry over a range (UTC ms), each { t, type, ev[] (registry tags), fa, bodies } */
  var EVC = {};
  function events(fromMs, toMs) {
    var ck = Math.floor(fromMs / DAY) + '|' + Math.floor(toMs / DAY); if (EVC[ck]) return EVC[ck];
    var E = ephem(fromMs - 5 * DAY, toMs + 5 * DAY), L = [], push = function (o) { if (o.t >= fromMs && o.t <= toMs) L.push(o); };
    // lunar phases (exact, astronomy-engine search)
    var q = AE.SearchMoonQuarter(new Date(fromMs)); while (q && q.time.date.getTime() <= toMs) { var qt = q.time.date.getTime();
      push({ t: qt, type: 'moon' + q.quarter, ev: q.quarter === 0 ? ['newMoon'] : q.quarter === 2 ? ['fullMoon'] : [], fa: ['ماه نو', 'تربیع اول ماه', 'ماه کامل', 'تربیع آخر ماه'][q.quarter], bodies: ['Moon', 'Sun'] }); q = AE.NextMoonQuarter(q); }
    // eclipses
    var le = AE.SearchLunarEclipse(new Date(fromMs)); while (le && le.peak.date.getTime() <= toMs) { push({ t: le.peak.date.getTime(), type: 'lunarEclipse', ev: ['eclipse'], fa: 'ماه‌گرفتگی ' + ({ penumbral: 'نیم‌سایه‌ای', partial: 'جزئی', total: 'کامل' }[le.kind] || le.kind), bodies: ['Moon'], kind: le.kind }); le = AE.NextLunarEclipse(le.peak); }
    var se = AE.SearchGlobalSolarEclipse(new Date(fromMs)); while (se && se.peak.date.getTime() <= toMs) { push({ t: se.peak.date.getTime(), type: 'solarEclipse', ev: ['eclipse'], fa: 'خورشیدگرفتگی ' + ({ partial: 'جزئی', annular: 'حلقوی', total: 'کامل', hybrid: 'هیبرید' }[se.kind] || se.kind), bodies: ['Sun'], kind: se.kind }); se = AE.NextGlobalSolarEclipse(se.peak); }
    // stations
    STATIONERS.forEach(function (b) { stations(b, E).forEach(function (s) { var tg = b === 'Mercury' ? ['stMercury'] : b === 'Venus' || b === 'Mars' ? ['stVenusMars'] : [];
      push({ t: s.t, type: 'station', ev: tg, fa: 'ایستگاه ' + (s.kind === 'R' ? 'رجعت' : 'مستقیم') + ' ' + BFA[b] + ' (' + SIGNS[Math.floor(s.lon / 30)] + ' ' + Math.floor(s.lon % 30) + '°)', bodies: [b], kind: s.kind }); }); });
    // aspects (geocentric and heliocentric)
    var asp = function (a, b, angs, helio, tagOf) { var A = helio ? E.H[a] : E.G[a], B = helio ? E.H[b] : E.G[b]; angs.forEach(function (g) { (g === 0 || g === 180 ? [g] : [g, -g]).forEach(function (gg) {
      crossings(A, B, gg, E).forEach(function (t) { push({ t: t, type: 'aspect', ev: tagOf(g), fa: ASP[g] + ' ' + BFA[a] + ' و ' + BFA[b] + (helio ? ' (خورشیدمرکزی)' : ''), bodies: [a, b], ang: g, helio: !!helio }); }); }); }); };
    for (var i = 0; i < OUTER.length; i++) for (var j = i + 1; j < OUTER.length; j++) { var a = OUTER[i], b = OUTER[j], js = a === 'Jupiter' && b === 'Saturn';
      asp(a, b, js ? [0, 60, 90, 120, 180] : [0, 90, 180], false, function (g) { var t = []; if (js) t.push('aspJS'); if (g === 0 || g === 90 || g === 180) t.push('hardOuterGeo'); return t; });
      asp(a, b, [0, 90, 180], true, function () { return ['hardOuterHelio']; }); }
    ['Jupiter', 'Saturn', 'Uranus'].forEach(function (b) { asp('Mars', b, [0, 90, 180], false, function () { return ['hardMars']; }); });
    // cardinal ingresses of the Sun (equinoxes and solstices)
    for (var y = new Date(fromMs).getUTCFullYear(); y <= new Date(toMs).getUTCFullYear(); y++) { var S = AE.Seasons(y);
      [[S.mar_equinox, 'اعتدال بهاری (ورود خورشید به حمل)'], [S.jun_solstice, 'انقلاب تابستانی (سرطان)'], [S.sep_equinox, 'اعتدال پاییزی (میزان)'], [S.dec_solstice, 'انقلاب زمستانی (جدی)']].forEach(function (s) { push({ t: s[0].date.getTime(), type: 'ingress', ev: ['cardinal'], fa: s[1], bodies: ['Sun'] }); }); }
    L.sort(function (x, y2) { return x.t - y2.t; }); EVC[ck] = L; return L;
  }
  // Mercury retrograde intervals [start, end] (ms)
  function retroIntervals(b, fromMs, toMs) { var E = ephem(fromMs - 120 * DAY, toMs + 120 * DAY), S = stations(b, E), out = []; for (var i = 0; i < S.length; i++) if (S[i].kind === 'R') { var e = S.slice(i + 1).filter(function (q) { return q.kind === 'D'; })[0]; out.push([S[i].t, e ? e.t : toMs]); } return out; }
  // Sun–Moon elongation (0 = new moon, 180 = full) at a moment
  function elong(t) { return AE.MoonPhase(new Date(t)); }

  /* ---------------- market series ---------------- */
  function dInt(t) { var d = new Date(t + 3.5 * 3600000); return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); }       // Tehran date
  function msOf(di) { var y = Math.floor(di / 10000), m = Math.floor(di / 100) % 100, d = di % 100; return Date.UTC(y, m - 1, d, 9, 0); }        // session close ≈ 09:00 UTC
  function prepS(rows, cls) {
    var r = rows.filter(function (q) { return q && isF(q.close) && q.close > 0 && q.date; }).sort(function (a, b) { return a.date - b.date; }), n = r.length;
    var S = { n: n, d: new Array(n), c: new Float64Array(n), h: new Float64Array(n), l: new Float64Array(n), v: new Float64Array(n), cls: cls, tse: cls === 'stock' || cls === 'fund' || cls === 'index' };
    for (var i = 0; i < n; i++) { var q = r[i]; S.d[i] = +q.date; S.c[i] = q.close; S.h[i] = isF(q.high) && q.high >= q.close ? q.high : q.close; S.l[i] = isF(q.low) && q.low > 0 && q.low <= q.close ? q.low : q.close; S.v[i] = isF(q.vol) ? q.vol : 0; }
    S.ret = new Float64Array(n); for (var k = 1; k < n; k++) S.ret[k] = Math.log(S.c[k] / S.c[k - 1]);
    S.atr = new Float64Array(n); var a = NaN; for (var t = 1; t < n; t++) { var tr = Math.max(S.h[t] - S.l[t], Math.abs(S.h[t] - S.c[t - 1]), Math.abs(S.l[t] - S.c[t - 1])); a = t < 15 ? (isF(a) ? a + (tr - a) / t : tr) : a + (tr - a) / 14; S.atr[t] = a; } S.atr[0] = S.atr[1] || 0;
    S.ms = S.d.map(msOf); return S;
  }
  // ATR zigzag: pivot at the extreme once price has reversed k×ATR from it; returns pivots with the index they became known (conf)
  function zigzag(S, k) { var P = [], dir = 0, ei = 0, ex = S.c[0];
    for (var i = 1; i < S.n; i++) { var th = k * (S.atr[i] || S.atr[1]);
      if (dir >= 0) { if (S.h[i] >= ex || dir === 0 && S.h[i] > ex) { ex = S.h[i]; ei = i; if (!dir) dir = 1; } if (dir === 1 && ex - S.l[i] >= th) { P.push({ i: ei, p: ex, t: 'H', conf: i }); dir = -1; ex = S.l[i]; ei = i; continue; } }
      if (dir <= 0) { if (S.l[i] <= ex || dir === 0 && S.l[i] < ex) { ex = S.l[i]; ei = i; if (!dir) dir = -1; } if (dir === -1 && S.h[i] - ex >= th) { P.push({ i: ei, p: ex, t: 'L', conf: i }); dir = 1; ex = S.h[i]; ei = i; } } }
    return P; }
  // event moments → session indices (first session whose close is at or after the event; Tehran exchange closes 12:30 local)
  function sessOf(S, t) { var lo = 0, hi = S.n - 1; if (t > S.ms[hi]) return -1; while (lo < hi) { var m = (lo + hi) >> 1; if (S.ms[m] < t) lo = m + 1; else hi = m; } return lo; }
  function uniq(a) { var o = [], s = {}; a.forEach(function (x) { if (x >= 0 && !s[x]) { s[x] = 1; o.push(x); } }); return o.sort(function (x, y) { return x - y; }); }

  /* ---------------- statistics ---------------- */
  function rng(seed) { var s = seed >>> 0 || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  function hashStr(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function binomP(x, n, p) { if (x <= 0) return 1; var lg = function (k) { var s = 0; for (var i = 2; i <= k; i++) s += Math.log(i); return s; }, tot = 0; for (var k = x; k <= n; k++) tot += Math.exp(lg(n) - lg(k) - lg(n - k) + k * Math.log(p) + (n - k) * Math.log(1 - p)); return Math.min(1, tot); }
  function powerOf(ne, p0, lift) { if (!(ne >= 1) || !(p0 > 0 && p0 < 1)) return null; var x = 0; while (x <= ne && binomP(x, ne, p0) >= 0.05) x++; if (x > ne) return 0; return binomP(x, ne, Math.min(0.999, p0 * (lift || 1.15))); }
  // statistic of one event set on segment [lo, hi): pivot hit rate, volatility ratio, lunar return gap
  function statPiv(idx, pv, w) { if (!idx.length) return NaN; var h = 0; idx.forEach(function (i) { if (pv.cum[Math.min(pv.n, i + w + 1)] - pv.cum[Math.max(0, i - w)] > 0) h++; }); return h / idx.length; }
  function statVol(idx, S, w, base) { if (!idx.length) return NaN; var s = 0, m = 0; idx.forEach(function (i) { for (var j = i; j <= Math.min(S.n - 1, i + w); j++) { s += Math.abs(S.ret[j]); m++; } }); return m ? s / m / base : NaN; }
  // circular-shift permutation on the segment: the event calendar is rotated by a random offset (≥ 2w+5 sessions) against the market
  function permTest(idx, lo, hi, f, nP, seed, side) {
    var obs = f(idx), len = hi - lo; if (!isF(obs) || len < 60 || idx.length < 3) return { obs: obs, p: NaN, null: NaN };
    var R = rng(seed), ge = 0, sum = 0, cnt = 0;
    for (var k = 0; k < nP; k++) { var off = 20 + Math.floor(R() * (len - 40)), sh = idx.map(function (i) { return lo + ((i - lo + off) % len); }).sort(function (a, b) { return a - b; }), v = f(sh); if (!isF(v)) continue; cnt++; sum += v;
      if (side === 'two' ? Math.abs(Math.log(v)) >= Math.abs(Math.log(obs)) - 1e-12 : v >= obs - 1e-12) ge++; }
    return { obs: obs, p: (ge + 1) / (cnt + 1), null: cnt ? sum / cnt : NaN, nP: cnt }; }
  function bh(list) { var L = list.slice().sort(function (a, b) { return a.p - b.p; }), N = L.length, mn = 1, mx = 0; for (var j = N - 1; j >= 0; j--) { mn = Math.min(mn, Math.min(1, L[j].p * N / (j + 1))); L[j].q = mn; } L.forEach(function (x, j) { mx = Math.max(mx, Math.min(1, (N - j) * x.p)); x.pH = mx; }); return N; }

  /* ---------------- per-market test ---------------- */
  function famOf(cls) { return cls === 'stock' || cls === 'fund' ? 'stock' : cls === 'index' ? 'index' : 'market'; }
  function testSeries(x, opt) {
    opt = opt || {}; var S = prepS(x.rows, x.cls); if (S.n < 750) return { key: x.key, sym: x.sym, cls: x.cls, ok: false, why: 'کمتر از ۷۵۰ جلسه تاریخچه (' + S.n + ')' };
    var nP = opt.nP || (famOf(x.cls) === 'stock' ? 300 : 1000), split = Math.floor(S.n * 0.6), EVS = events(S.ms[0] - 30 * DAY, S.ms[S.n - 1] + DAY), tail = 25;
    var piv = {}; ['minor', 'major'].forEach(function (sc) { var P = zigzag(S, sc === 'minor' ? 2 : 5), ind = new Uint8Array(S.n); P.forEach(function (q) { ind[q.i] = 1; }); var cum = new Float64Array(S.n + 1); for (var i = 0; i < S.n; i++) cum[i + 1] = cum[i] + ind[i]; piv[sc] = { P: P, cum: cum, n: S.n, rate: P.length / S.n }; });
    var baseVol = 0, nv = 0; for (var i2 = 1; i2 < S.n; i2++) { baseVol += Math.abs(S.ret[i2]); nv++; } baseVol /= nv;
    var tagIdx = function (tag) { return uniq(EVS.filter(function (e) { return e.ev.indexOf(tag) >= 0; }).map(function (e) { return sessOf(S, e.t); })); };
    var TAG = {}; ['newMoon', 'fullMoon', 'eclipse', 'stMercury', 'stVenusMars', 'aspJS', 'hardOuterGeo', 'hardOuterHelio', 'hardMars', 'cardinal'].forEach(function (t) { TAG[t] = tagIdx(t); });
    // C1 cluster: sessions where two or more registered events (any tag) fall within ±2 sessions; first session of each run
    (function () { var cnt = new Int16Array(S.n); Object.keys(TAG).forEach(function (t) { TAG[t].forEach(function (i) { for (var j = Math.max(0, i - 2); j <= Math.min(S.n - 1, i + 2); j++) cnt[j]++; }); }); var c = [], inRun = false; for (var k = 0; k < S.n; k++) { if (cnt[k] >= 2 && !inRun) { c.push(k); inRun = true; } else if (cnt[k] < 2) inRun = false; } TAG.cluster = c; })();
    // G1 Gann: anchors = major pivots; targets = anchor date + 90/180/270/360 calendar days, kept only if the anchor was confirmed before the target
    (function () { var g = []; piv.major.P.forEach(function (q) { [90, 180, 270, 360].forEach(function (dd) { var j = sessOf(S, S.ms[q.i] + dd * DAY); if (j > q.conf) g.push(j); }); }); TAG.gannTime = uniq(g); })();
    var res = HYP.map(function (H) {
      var seg = function (lo, hi, sd) {
        var ids, f, side = 'one';
        if (H.out === 'piv') { var pv = piv[H.sc]; ids = (TAG[H.ev] || []).filter(function (i) { return i >= lo && i < hi - (H.w + tail); });
          if (H.ev === 'gannTime') { // null: the same anchors with random lags in [60, 400] calendar days
            var obsG = statPiv(ids, pv, H.w), R = rng(sd), ge = 0, sum = 0, cn = 0; for (var k = 0; k < Math.min(nP, 500); k++) { var sh = []; piv.major.P.forEach(function (q) { for (var m = 0; m < 4; m++) { var j = sessOf(S, S.ms[q.i] + (60 + Math.floor(R() * 340)) * DAY); if (j > q.conf && j >= lo && j < hi - (H.w + tail)) sh.push(j); } }); sh = uniq(sh); var v = statPiv(sh, pv, H.w); if (!isF(v)) continue; cn++; sum += v; if (v >= obsG) ge++; }
            return { n: ids.length, obs: obsG, null: cn ? sum / cn : NaN, p: cn ? (ge + 1) / (cn + 1) : NaN, lift: cn && sum ? obsG / (sum / cn) : NaN, base: pv.rate }; }
          f = function (I) { return statPiv(I, pv, H.w); }; }
        else if (H.out === 'vol') { if (H.ev === 'retroMercury') { var RI = retroIntervals('Mercury', S.ms[0], S.ms[S.n - 1]), inR = []; RI.forEach(function (r) { for (var j = sessOf(S, r[0]); j >= 0 && j < S.n && S.ms[j] <= r[1]; j++) inR.push(j); }); ids = uniq(inR).filter(function (i) { return i >= lo && i < hi; }); }
          else ids = (TAG[H.ev] || []).filter(function (i) { return i >= lo && i < hi - H.w - 1; });
          f = function (I) { return statVol(I, S, H.w, baseVol); }; side = 'two'; }
        else if (H.out === 'ret') { var nm = [], fm = []; for (var j2 = Math.max(1, lo); j2 < hi; j2++) { var e = elong(S.ms[j2]); if (e >= 270 || e < 90) nm.push(j2); else fm.push(j2); }
          var gap = function (A, B) { var a = 0, b = 0; A.forEach(function (i) { a += S.ret[i]; }); B.forEach(function (i) { b += S.ret[i]; }); return A.length && B.length ? a / A.length - b / B.length : NaN; }, obs = gap(nm, fm);
          // null: the lunar labels rotated against the market (circular shift)
          var R2 = rng(sd), ge2 = 0, cn2 = 0, sum2 = 0, len = hi - lo, lab = new Uint8Array(S.n); nm.forEach(function (i) { lab[i] = 1; });
          for (var k2 = 0; k2 < nP; k2++) { var off = 20 + Math.floor(R2() * (len - 40)), A2 = [], B2 = []; for (var i3 = Math.max(1, lo); i3 < hi; i3++) { var src = lo + ((i3 - lo + off) % len); (lab[src] ? A2 : B2).push(i3); } var v2 = gap(A2, B2); if (!isF(v2)) continue; cn2++; sum2 += v2; if (v2 >= obs) ge2++; }
          // the strategy: hold the asset only in the new-moon half; net of costs (one round trip per lunar month)
          var cost = S.tse ? 0.012 : x.cls === 'crypto' ? 0.003 : 0.01, months = len / (S.tse ? 21 : 30) * 1.0, inS = 0; nm.forEach(function (i) { inS += S.ret[i]; }); var bh0 = 0; for (var i4 = Math.max(1, lo); i4 < hi; i4++) bh0 += S.ret[i4];
          return { n: nm.length + fm.length, obs: obs, null: cn2 ? sum2 / cn2 : NaN, p: cn2 ? (ge2 + 1) / (cn2 + 1) : NaN, lift: NaN, gross: Math.exp(inS) - 1, net: Math.exp(inS - months * cost) - 1, bh: Math.exp(bh0) - 1, months: months }; }
        else if (H.out === 'sq9') { // Square of Nine: anchors = major pivots; the next 3 major pivots; distance to the 45° grid (0.25 in √price units)
          var Pm = piv.major.P, pairs = [];   // prices scaled by the power of ten that puts the anchor in [100, 10000) — the same factor for the pair
          Pm.forEach(function (q, a) { if (q.i < lo || q.i >= hi) return; var f0 = Math.pow(10, Math.floor(Math.log10(q.p)) - 2); if (q.p / f0 >= 10000) f0 *= 10;
            Pm.slice(a + 1, a + 4).forEach(function (r) { if (r.i < hi) pairs.push([Math.sqrt(q.p / f0), Math.sqrt(r.p / f0)]); }); });
          var dist = function (u) { if (!pairs.length) return NaN; var s2 = 0; pairs.forEach(function (pr) { var d = (pr[1] - pr[0] + u) / 0.25; s2 += Math.abs(d - Math.round(d)); }); return s2 / pairs.length; };
          var obs3 = dist(0), R3 = rng(sd), le3 = 0, cn3 = 0, sm3 = 0; for (var k3 = 0; k3 < nP; k3++) { var v3 = dist(R3() * 0.25); if (!isF(v3)) continue; cn3++; sm3 += v3; if (v3 <= obs3) le3++; }
          return { n: pairs.length, obs: obs3, null: cn3 ? sm3 / cn3 : NaN, p: cn3 ? (le3 + 1) / (cn3 + 1) : NaN, lift: cn3 && obs3 > 0 ? (sm3 / cn3) / obs3 : NaN }; }
        var T = permTest(ids, lo, hi, f, nP, sd, side); T.n = ids.length; T.lift = isF(T.null) && T.null > 0 ? T.obs / T.null : NaN;
        if (H.out === 'piv') { T.base = piv[H.sc].rate; T.pow = powerOf(ids.length, Math.min(0.95, T.null), 1.15); }
        // regime split of the segment: high- vs low-volatility sessions (60-session realised volatility vs its expanding median)
        if (H.out === 'piv' && ids.length >= 10) { var rv = function (i) { var s = 0, m = 0; for (var j = Math.max(1, i - 60); j < i; j++) { s += S.ret[j] * S.ret[j]; m++; } return m ? Math.sqrt(s / m) : NaN; }, all = [], hiI = [], loI = []; ids.forEach(function (i) { all.push(rv(i)); }); var med = all.slice().sort(function (a, b) { return a - b; })[all.length >> 1];
          ids.forEach(function (i, k) { (all[k] >= med ? hiI : loI).push(i); }); T.reg = { hi: statPiv(hiI, piv[H.sc], H.w), lo: statPiv(loI, piv[H.sc], H.w), nHi: hiI.length, nLo: loI.length }; }
        return T; };
      var sd = hashStr(x.key + '|' + H.id + '|' + VER), IS = seg(1, split, sd), OOS = seg(split, S.n, sd + 7);
      return { id: H.id, IS: IS, OOS: OOS };
    });
    // incremental value: do astronomical features lower the out-of-sample Brier score of a price-only model? (ridge linear probability model, walk-forward)
    var inc = opt.noInc ? null : incTest(S, piv.minor, x.key);
    // next windows for the dashboard and the forecast ledger
    var last = S.ms[S.n - 1], fut = events(last, last + 90 * DAY);
    return { key: x.key, sym: x.sym, cls: x.cls, fam: famOf(x.cls), ok: true, n: S.n, from: S.d[0], to: S.d[S.n - 1], split: S.d[split], res: res, inc: inc, atr: S.atr[S.n - 1], px: S.c[S.n - 1],
      pivRate: { minor: piv.minor.rate, major: piv.major.rate }, lastPiv: piv.major.P.slice(-3).map(function (q) { return { d: S.d[q.i], p: q.p, t: q.t }; }), fut: fut.map(function (e) { return { t: e.t, ev: e.ev, fa: e.fa, type: e.type }; }), at: Date.now() };
  }

  /* incremental test: target = a minor turning point within the next 3 sessions; price features (known at t): sessions since the last
     confirmed pivot / median interval, ATR percentile (250), |5-session return| / ATR, sign of the 20-session return; astronomical
     features: sin and cos of the Sun–Moon elongation, Mercury retrograde, proximity to a station (Mercury–Mars), to a hard outer aspect,
     to an eclipse. Ridge (λ = 1) refitted every 120 sessions on everything before; out-of-sample = last 40 %. Null: the astronomical
     block rotated against the market (200 circular shifts). */
  function incTest(S, pv, key) {
    var n = S.n, P = pv.P, y = new Float64Array(n), conf = new Int32Array(n).fill(-1); P.forEach(function (q) { for (var j = Math.max(0, q.i - 3); j <= q.i; j++) y[j] = 1; });
    var lastConf = -1, pi = 0, base = [], ints = []; for (var t = 0; t < n; t++) { while (pi < P.length && P[pi].conf <= t) { if (lastConf >= 0) ints.push(P[pi].i - P[pi - 1 >= 0 ? pi - 1 : 0].i); lastConf = P[pi].i; pi++; }
      var med = ints.length ? ints.slice(-20).sort(function (a, b) { return a - b; })[Math.min(ints.length, 20) >> 1] : 20, a = S.atr[t] || 1, w0 = Math.max(0, t - 250), rk = 0; for (var j2 = w0; j2 < t; j2++) if (S.atr[j2] / S.c[j2] < a / S.c[t]) rk++;
      base.push([1, lastConf >= 0 ? Math.min(3, (t - lastConf) / (med || 20)) : 1, t > w0 ? rk / (t - w0) : 0.5, t >= 5 ? Math.min(5, Math.abs(S.c[t] - S.c[t - 5]) / a) : 0, t >= 20 ? (S.c[t] > S.c[t - 20] ? 1 : -1) : 0]); }
    var EV = events(S.ms[0] - 60 * DAY, S.ms[n - 1] + 60 * DAY), near = function (tags, tau) { var T = EV.filter(function (e) { return e.ev.some(function (g) { return tags.indexOf(g) >= 0; }); }).map(function (e) { return e.t; }), out = new Float64Array(n), k = 0;
      for (var t2 = 0; t2 < n; t2++) { while (k + 1 < T.length && T[k + 1] <= S.ms[t2]) k++; var d1 = T.length ? Math.abs(S.ms[t2] - T[k]) / DAY : 99, d2 = k + 1 < T.length ? Math.abs(T[k + 1] - S.ms[t2]) / DAY : 99; out[t2] = Math.exp(-Math.min(d1, d2) / tau); } return out; };
    var RI = retroIntervals('Mercury', S.ms[0], S.ms[n - 1]), rx = new Float64Array(n); RI.forEach(function (r) { for (var t3 = 0; t3 < n; t3++) if (S.ms[t3] >= r[0] && S.ms[t3] <= r[1]) rx[t3] = 1; });
    var st = near(['stMercury', 'stVenusMars'], 3), ho = near(['hardOuterGeo'], 5), ec = near(['eclipse'], 10), astro = []; for (var t4 = 0; t4 < n; t4++) { var e = elong(S.ms[t4]) * Math.PI / 180; astro.push([Math.sin(e), Math.cos(e), rx[t4], st[t4], ho[t4], ec[t4]]); }
    var start = Math.floor(n * 0.6), stop = n - 25; if (stop - start < 200) return null;
    var solve = function (A0, b0) { var p = b0.length, A = A0.map(function (r) { return Float64Array.from(r); }), b = Float64Array.from(b0); for (var d = 1; d < p; d++) A[d][d] += 1;
      for (var c = 0; c < p; c++) { var mx = c; for (var r2 = c + 1; r2 < p; r2++) if (Math.abs(A[r2][c]) > Math.abs(A[mx][c])) mx = r2; var tmp = A[c]; A[c] = A[mx]; A[mx] = tmp; var tb = b[c]; b[c] = b[mx]; b[mx] = tb; if (Math.abs(A[c][c]) < 1e-12) continue;
        for (var r3 = 0; r3 < p; r3++) if (r3 !== c) { var f = A[r3][c] / A[c][c]; for (var c2 = c; c2 < p; c2++) A[r3][c2] -= f * A[c][c2]; b[r3] -= f * b[c]; } } var w = new Float64Array(p); for (var i3 = 0; i3 < p; i3++) w[i3] = Math.abs(A[i3][i3]) < 1e-12 ? 0 : b[i3] / A[i3][i3]; return w; };
    // one pass: the normal equations are accumulated row by row and solved at each refit point (everything up to 4 sessions before the block)
    var brier = function (row) { var p = row(0).length, A = [], b = new Float64Array(p), s = 0, m = 0, w = null, nextFit = start - 4, blkEnd = start; for (var i = 0; i < p; i++) A.push(new Float64Array(p));
      for (var t5 = 0; t5 < stop; t5++) { if (t5 === nextFit) { w = solve(A, b); nextFit += 120; }
        var r = row(t5); if (t5 >= start && w) { var p2 = 0; for (var i4 = 0; i4 < p; i4++) p2 += w[i4] * r[i4]; p2 = Math.min(0.99, Math.max(0.01, p2)); s += (p2 - y[t5]) * (p2 - y[t5]); m++; }
        if (t5 < stop - 4) { for (var i2 = 0; i2 < p; i2++) { b[i2] += r[i2] * y[t5]; var Ai = A[i2]; for (var j3 = 0; j3 < p; j3++) Ai[j3] += r[i2] * r[j3]; } } } return s / m; };
    var join = function (sh) { return function (t7) { return base[t7].concat(astro[(t7 + sh) % n]); }; };
    var bB = brier(function (t) { return base[t]; }), bA = brier(join(0)), gain = bB - bA, R = rng(hashStr(key + '|inc')), ge = 0, cn = 0;
    for (var k2 = 0; k2 < 200; k2++) { var off = 60 + Math.floor(R() * (n - 120)), g2 = bB - brier(join(off)); cn++; if (g2 >= gain) ge++; }
    var yr = 0; for (var t8 = start; t8 < stop; t8++) yr += y[t8]; var pc = yr / (stop - start), bC = pc * (1 - pc);
    return { brierBase: bB, brierAstro: bA, brierClim: bC, gain: gain, p: (ge + 1) / (cn + 1), nOOS: stop - start }; }

  /* ---------------- validity across the family ---------------- */
  function judge(D) {
    var fams = {}; Object.keys(D.by).forEach(function (k) { var T = D.by[k]; if (!T.ok) return; T.res.forEach(function (r) { var o = r.OOS; if (!isF(o.p) || !(o.n >= 1)) return; (fams[T.fam] = fams[T.fam] || []).push({ T: T, r: r, p: o.p }); }); });
    D.fam = {}; Object.keys(fams).forEach(function (f) { D.fam[f] = bh(fams[f]); fams[f].forEach(function (x) { var H = HYP.filter(function (h) { return h.id === x.r.id; })[0], o = x.r.OOS, I = x.r.IS, ok;
      if (H.out === 'piv') ok = o.lift >= 1.15 && o.n >= 15 && I.lift > 1; else if (H.out === 'vol') ok = Math.abs(o.lift - 1) >= 0.10 && o.n >= 15 && (I.lift - 1) * (o.lift - 1) > 0; else if (H.out === 'ret') ok = o.obs > 0 && I.obs > 0 && o.net > o.bh; else ok = o.lift >= 1.15 && o.n >= 15 && I.lift > 1;
      x.r.q = x.q; x.r.pH = x.pH; x.r.valid = ok && x.q < 0.05; x.r.why = x.r.valid ? 'valid' : !ok ? (o.n < 15 ? 'thin' : 'effect') : 'fdr'; }); });
    Object.keys(D.by).forEach(function (k) { var T = D.by[k]; if (!T.ok) return; var inc = T.inc; if (inc) inc.valid = inc.gain > 0 && inc.p < 0.05 / Math.max(1, Object.keys(D.by).length); });
    return D; }

  /* ---------------- run (incremental, budgeted) ---------------- */
  function seriesAll() {
    var L = Hub.cycles && Hub.cycles.seriesList ? Hub.cycles.seriesList().filter(function (s) { return !Hub.universe || Hub.universe.ok(s.key); }) : [];
    var X = Hub.tradeUI && Hub.tradeUI.engineMemo ? Hub.tradeUI.engineMemo() : null; if (!X && Hub.tradeUI && Hub.tradeUI.engineNow) { try { X = Hub.tradeUI.engineNow(); } catch (e) { X = null; } } X = X && X.X ? X.X : X;
    if (X && X.zmap && X.central) Object.keys(X.central.by).forEach(function (k) { var r = X.central.by[k]; if (r.cls !== 'stock' && r.cls !== 'fund') return; var z = X.zmap[k]; if (!z || !z.R || !z.R.X || z.R.X.n < 750) return; var XX = z.R.X, rows = [];
      for (var i = 0; i < XX.n; i++) rows.push({ date: XX.d[i], close: XX.c[i], high: XX.h[i], low: XX.l[i], vol: XX.v ? XX.v[i] : 0 }); L.push({ key: k, sym: r.sym, cls: r.cls, rows: rows }); });
    return L; }
  function load() { try { return U().store.get(KEY, null); } catch (e) { return null; } }
  function save(D) { try { U().store.set(KEY, D); } catch (e) { /* quota: keep the in-memory result */ } }
  // markets and indices first (1000 permutations), then stocks (300); budget in ms per call; returns a promise
  function refresh(progress, o) {
    o = o || {}; var D = load(); if (!D || D.ver !== VER || o.force) D = { ver: VER, hyp: hypHash(), by: {}, at: 0 };
    var L = seriesAll().sort(function (a, b) { return (famOf(a.cls) === 'stock') - (famOf(b.cls) === 'stock'); }), todo = L.filter(function (x) { var T = D.by[x.key]; return o.force || !T || !T.ok && !T.why || T.to < (x.rows.length ? x.rows[x.rows.length - 1].date : 0) && Date.now() - T.at > 20 * DAY; });
    if (o.only) todo = L.filter(function (x) { return o.only.indexOf(x.key) >= 0; });
    var t0 = Date.now(), budget = o.budget || Infinity, done = 0;
    return new Promise(function (res) { (function step() { var t1 = Date.now();
      while (todo.length && Date.now() - t1 < 400) { var x = todo.shift(); try { D.by[x.key] = testSeries(x, { noInc: famOf(x.cls) === 'stock' && !o.incAll }); } catch (e) { D.by[x.key] = { key: x.key, sym: x.sym, cls: x.cls, ok: false, why: 'خطای محاسبه: ' + e.message }; } done++; }
      if (progress) progress(done, done + todo.length);
      if (todo.length && Date.now() - t0 < budget) return setTimeout(step, 0);
      judge(D); D.at = Date.now(); D.pending = todo.length; save(D); history(D); res(D); })(); }); }
  function hypHash() { return 'fnv1a-' + hashStr(JSON.stringify(HYP)).toString(16); }

  /* ---------------- history: what changed between runs (lost / gained validity) ---------------- */
  function history(D) { var Hs = U().store.get(HIST, null) || { runs: [] }, snap = {}; Object.keys(D.by).forEach(function (k) { var T = D.by[k]; if (!T.ok) return; T.res.forEach(function (r) { snap[k + '|' + r.id] = r.valid ? 1 : 0; }); });
    var prev = Hs.runs.length ? Hs.runs[Hs.runs.length - 1].snap : {}, lost = [], gained = []; Object.keys(snap).forEach(function (k) { if (prev[k] === 1 && !snap[k]) lost.push(k); if (snap[k] && prev[k] !== 1) gained.push(k); });
    Hs.runs.push({ at: D.at, ver: D.ver, hyp: D.hyp, nT: Object.keys(snap).length, nV: Object.keys(snap).filter(function (k) { return snap[k]; }).length, lost: lost, gained: gained, snap: snap }); Hs.runs = Hs.runs.slice(-24); try { U().store.set(HIST, Hs); } catch (e) { /* ignore */ } return Hs; }

  /* ---------------- next sensitive windows and the forecast ledger ---------------- */
  function windows(T, horizonDays) {
    if (!T || !T.ok) return []; var out = [], lim = Date.now() + (horizonDays || 60) * DAY;
    (T.fut || []).filter(function (e) { return e.t >= Date.now() - 3 * DAY && e.t <= lim; }).forEach(function (e) { HYP.forEach(function (H) { if (e.ev.indexOf(H.ev) < 0) return; var r = T.res.filter(function (x) { return x.id === H.id; })[0]; if (!r) return;
      var all = r.OOS && r.IS ? (r.IS.obs * r.IS.n + r.OOS.obs * r.OOS.n) / Math.max(1, r.IS.n + r.OOS.n) : NaN, wd = Math.round((H.w || 1) * (T.cls === 'crypto' ? 1 : 7 / 5));
      var band = isF(T.atr) ? T.atr * Math.sqrt(Math.max(1, H.w)) : NaN;
      out.push({ t: e.t, fa: e.fa, H: H, from: e.t - wd * DAY, to: e.t + wd * DAY, valid: !!r.valid, q: r.q, lift: r.OOS.lift, hist: all, base: r.OOS.null, kind: H.out === 'vol' ? 'vol' : H.out === 'piv' ? 'turn' : 'time',
        lo: isF(band) ? T.px - 2 * band : NaN, hi: isF(band) ? T.px + 2 * band : NaN }); }); });
    // Gann time counts from the asset's own last major pivots
    var G = HYP.filter(function (H) { return H.id === 'G1'; })[0], rG = T.res.filter(function (x) { return x.id === 'G1'; })[0];
    (T.lastPiv || []).forEach(function (q) { [90, 180, 270, 360].forEach(function (dd) { var t = msOf(q.d) + dd * DAY; if (t < Date.now() - 3 * DAY || t > lim || !rG) return; var wd = Math.round(G.w * (T.cls === 'crypto' ? 1 : 7 / 5)), band = isF(T.atr) ? T.atr * Math.sqrt(G.w) : NaN;
      out.push({ t: t, fa: 'گن: ' + dd + ' روز پس از ' + (q.t === 'H' ? 'سقف' : 'کف') + ' ' + q.d, H: G, from: t - wd * DAY, to: t + wd * DAY, valid: !!rG.valid, q: rG.q, lift: rG.OOS.lift, hist: (rG.IS.obs * rG.IS.n + rG.OOS.obs * rG.OOS.n) / Math.max(1, rG.IS.n + rG.OOS.n), base: rG.OOS.null, kind: 'turn', lo: T.px - 2 * band, hi: T.px + 2 * band }); }); });
    return out.sort(function (a, b) { return a.t - b.t; }); }
  // decision ladder (directive 24 · 9): astronomy never makes a trading signal
  function ladder(T, rec) { var W = windows(T, 21), soon = W.filter(function (w) { return w.from <= Date.now() + 10 * DAY; });
    var lv = 'none', why = [];
    if (soon.length) { lv = 'time'; why.push('رویداد ثبت‌شده در ۱۰ روز آینده: ' + soon.slice(0, 3).map(function (w) { return w.fa; }).join('، ')); }
    if (soon.some(function (w) { return w.valid && w.kind === 'vol'; })) { lv = 'vol'; why.push('فرضیهٔ نوسانِ معتبر برای همین دارایی'); }
    if (soon.some(function (w) { return w.valid && w.kind === 'turn'; })) { lv = 'turn'; why.push('فرضیهٔ نقطهٔ عطفِ معتبر برای همین دارایی'); }
    var tech = rec && ((rec.L && isF(rec.L.tzConf) && rec.L.floor && rec.px > rec.L.tzConf) || (rec.trx && rec.trx.s && (rec.trx.s.sub === 'bounce' || rec.trx.s.sub === 'pullback')));
    if (lv === 'turn' && tech) { lv = 'tech'; why.push('در همان پنجره نشانهٔ تکنیکال تغییر جهت دیده می‌شود'); }
    if (lv === 'tech' && rec && rec.tier === 'ok') { lv = 'signal'; why.push('موتور مرکزی، مستقل از نجوم، خرید تأییدشده دارد'); }
    return { lv: lv, why: why, W: W }; }
  var LADFA = { none: 'بدون رویداد نزدیک', time: 'هشدار زمانی نجومی (آزموده‌نشده یا نامعتبر)', vol: 'هشدار افزایش احتمال نوسان', turn: 'پنجرهٔ احتمالی تغییر روند', tech: 'تأیید تکنیکال در پنجره', signal: 'سیگنال معاملاتی تأییدشده (حکم مرکزی)' };

  function ledgerLoad() { return U().store.get(LED, null) || { v: 1, f: [] }; }
  function ledgerSync(D) { if (!D) return { added: 0, graded: 0 }; var L = ledgerLoad(), add = 0, gr = 0, ids = {}; L.f.forEach(function (f) { ids[f.id] = 1; });
    Object.keys(D.by).forEach(function (k) { var T = D.by[k]; if (!T.ok || T.fam === 'stock') return; windows(T, 30).forEach(function (w) { if (w.t < Date.now()) return; var id = k + '|' + w.H.id + '|' + new Date(w.t).toISOString().slice(0, 16); if (ids[id]) return;
      L.f.push({ id: id, key: k, sym: T.sym, at: Date.now(), H: w.H.id, ev: w.fa, evT: w.t, from: w.from, to: w.to, kind: w.kind, dir: w.H.out === 'ret' ? 'up' : null, lo: w.lo, hi: w.hi, pHist: w.hist, pBase: w.base, valid: w.valid,
        conf: w.kind === 'turn' ? 'بازگشت قیمت به اندازهٔ ' + (w.H.sc === 'major' ? '۵' : '۲') + ' برابر ATR از قیمت حدی درون پنجره' : w.kind === 'vol' ? 'میانگین تغییر روزانهٔ قدرمطلق در پنجره بیشتر یا کمتر از میانگین تاریخی' : 'شرط ثبت‌شدهٔ فرضیه',
        inv: 'گذشت پنجره بدون رخداد' }); ids[id] = 1; add++; }); });
    // grade forecasts whose window ended at least 25 days ago, against the market's own turning points known now
    var SL = seriesAll(), byK = {}; SL.forEach(function (s) { byK[s.key] = s; });
    L.f.forEach(function (f) { if (f.res || f.to > Date.now() - 25 * DAY) return; var s = byK[f.key]; if (!s) return; var S = prepS(s.rows, s.cls), H = HYP.filter(function (h) { return h.id === f.H; })[0]; if (!H) return;
      if (H.out === 'piv') { var P = zigzag(S, H.sc === 'major' ? 5 : 2), hit = P.filter(function (q) { return S.ms[q.i] >= f.from && S.ms[q.i] <= f.to; }), near = P.map(function (q) { return Math.abs(S.ms[q.i] - f.evT) / DAY; }).sort(function (a, b) { return a - b; })[0];
        f.res = { hit: hit.length > 0, errDays: isF(near) ? Math.round(near) : null, at: Date.now() }; }
      else { var i0 = sessOf(S, f.from), i1 = sessOf(S, f.to), m = 0, c = 0, b = 0, nb = 0; for (var i = Math.max(1, i0); i <= (i1 < 0 ? S.n - 1 : i1); i++) { m += Math.abs(S.ret[i]); c++; } for (var j = 1; j < S.n; j++) { b += Math.abs(S.ret[j]); nb++; } f.res = { ratio: c && b ? (m / c) / (b / nb) : null, at: Date.now() }; }
      var j2 = sessOf(S, f.to); if (j2 >= 0) f.res.px = S.c[j2]; if (isF(f.res.px) && isF(f.lo)) f.res.inBand = f.res.px >= f.lo && f.res.px <= f.hi; gr++; });
    L.f = L.f.slice(-5000); try { U().store.set(LED, L); } catch (e) { /* ignore */ } return { added: add, graded: gr, L: L }; }

  Hub.astro = { VER: VER, KEY: KEY, LED: LED, HIST: HIST, HYP: HYP, NOTEST: NOTEST, BODIES: BODIES, BFA: BFA, SIGNS: SIGNS, ASP: ASP, LADFA: LADFA, available: function () { return !!AE; },
    sky: sky, events: events, retroIntervals: retroIntervals, elong: elong, testSeries: testSeries, judge: judge, refresh: refresh, load: load, seriesAll: seriesAll, windows: windows, ladder: ladder,
    ledgerLoad: ledgerLoad, ledgerSync: ledgerSync, hypHash: hypHash, history: function () { return U().store.get(HIST, null) || { runs: [] }; }, prepS: prepS, zigzag: zigzag, famOf: famOf };
})(typeof window !== 'undefined' ? window : globalThis);
