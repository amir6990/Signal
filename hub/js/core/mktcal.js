/* =====================================================================
 * MARKET CALENDAR — one time basis per market, so no condition is vague.
 *
 * For every market: time zone, what "close" means (price type and bar),
 * which days are sessions, and the next N sessions as real dates.
 *   spec(cls)                         -> { fa, tz, basis, bar, hours, days, src, sure }
 *   nextSessions(cls, lastDate, n)    -> [yyyymmdd …] the n sessions after lastDate
 *   window(cls, lastDate, n, dates)   -> { n, start, end, startFa, endFa, list, basis, evalAt, expiry, note }
 *   levels(price, up, dn, atr)        -> where the price stands vs both confirmation levels, % distances, checks
 *
 * Session days:
 *  - Iranian exchange, funds, index: Saturday–Wednesday, official solar holidays and lunar holidays (lunar dates are
 *    approximate: ±1 day, flagged); trading hours are not used by the daily logic and are shown as "not verified".
 *  - Crypto (CoinGecko): every day; a daily point is the price at 00:00 UTC (CoinGecko API documentation:
 *    "daily (00:00 UTC)"; "the last completed UTC day (00:00) is available after 00:35 UTC the next day").
 *  - Other series (free-market gold / coin / dollar from TGJU, world ounce, energy): the session days are read from the
 *    series itself (weekdays that carry ≥ 30% of the last 150 points), because these sources publish on their own calendar.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  var J = function () { return Hub.jalali; };
  function g2jdn(g) { g = String(g); return J().g2d(+g.slice(0, 4), +g.slice(4, 6), +g.slice(6, 8)); }
  function jdn2g(d) { var x = J().d2g(d); return x.gy * 10000 + x.gm * 100 + x.gd; }
  function faDate(g) { try { return J().jstr(g2jdn(g)); } catch (e) { return String(g); } }
  var WD = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];

  var IR = { tz: 'Asia/Tehran (ساعت تهران)', days: [0, 1, 2, 3, 4], hol: true, hours: 'ساعت جلسه از منبع رسمی تأیید نشده؛ منطق روزانه به آن وابسته نیست', sure: true };
  var SPEC = {
    stock: Object.assign({ fa: 'بورس و فرابورس ایران', basis: 'قیمت پایانی روزانهٔ TSETMC', bar: 'جلسهٔ معاملاتی روزانه', src: 'TSETMC' }, IR),
    fund: Object.assign({ fa: 'صندوق‌های قابل معامله', basis: 'قیمت پایانی روزانهٔ TSETMC', bar: 'جلسهٔ معاملاتی روزانه', src: 'TSETMC' }, IR),
    index: Object.assign({ fa: 'شاخص‌های بورس تهران', basis: 'مقدار پایانی شاخص در روز معاملاتی', bar: 'روز معاملاتی', src: 'TSETMC' }, IR),
    crypto: { fa: 'رمزارزها', tz: 'UTC', days: [0, 1, 2, 3, 4, 5, 6], hol: false, basis: 'قیمت ساعت ۰۰:۰۰ UTC (نقطهٔ روزانهٔ CoinGecko)', bar: 'روز UTC (کندل روزانه از ۰۰:۰۰ تا ۰۰:۰۰ UTC)', hours: '۲۴ ساعته، ۷ روز هفته', src: 'CoinGecko', sure: true },
    gold: { fa: 'طلا و سکهٔ بازار آزاد', tz: 'Asia/Tehran (ساعت تهران)', days: null, hol: false, basis: 'آخرین قیمت روز ثبت‌شده در TGJU', bar: 'روز ثبت در TGJU', hours: 'ساعات بازار آزاد رسمی نیست؛ روزهای ثبت از خود داده خوانده می‌شود', src: 'TGJU', sure: false },
    fx: { fa: 'ارز بازار آزاد', tz: 'Asia/Tehran (ساعت تهران)', days: null, hol: false, basis: 'آخرین قیمت روز ثبت‌شده در TGJU', bar: 'روز ثبت در TGJU', hours: 'ساعات بازار آزاد رسمی نیست؛ روزهای ثبت از خود داده خوانده می‌شود', src: 'TGJU', sure: false },
    commodity: { fa: 'کالا و انرژی جهانی', tz: 'زمان انتشار منبع (Alpha Vantage / EIA)', days: null, hol: false, basis: 'قیمت روزانهٔ منتشرشده در منبع', bar: 'روز کاری منبع', hours: 'روزهای انتشار از خود داده خوانده می‌شود', src: 'Alpha Vantage', sure: false },
    tgju: { fa: 'سری TGJU', tz: 'Asia/Tehran (ساعت تهران)', days: null, hol: false, basis: 'آخرین قیمت روز ثبت‌شده در TGJU', bar: 'روز ثبت در TGJU', hours: 'روزهای ثبت از خود داده خوانده می‌شود', src: 'TGJU', sure: false },
    ounce: { fa: 'انس جهانی طلا', tz: 'زمان ثبت منبع', days: null, hol: false, basis: 'قیمت روزانهٔ ثبت‌شده در منبع', bar: 'روز ثبت منبع', hours: 'بازار جهانی تقریباً ۲۴ ساعته در روزهای کاری؛ روزهای ثبت از خود داده خوانده می‌شود', src: 'TGJU', sure: false }
  };
  function spec(cls) { return SPEC[cls] || SPEC[cls === 'option' ? 'stock' : 'commodity']; }

  // weekdays (0 = Saturday … 6 = Friday) that carry at least 30% of the series' recent points
  function daysOf(dates) {
    var c = [0, 0, 0, 0, 0, 0, 0], d = (dates || []).slice(-150), wk = Math.max(1, d.length / 7);
    d.forEach(function (g) { c[J().dow(g2jdn(g))]++; });
    var out = []; c.forEach(function (n, i) { if (n >= 0.3 * wk) out.push(i); }); return out.length ? out : [0, 1, 2, 3, 4];
  }
  function nextSessions(cls, last, n, dates) {
    var S = spec(cls), days = S.days || daysOf(dates), d = g2jdn(last), H = S.hol ? J().holidays(d, d + n * 3 + 30, true) : {}, out = [], lunar = false;
    for (var i = 0; i < 400 && out.length < n; i++) { d++; if (days.indexOf(J().dow(d)) < 0) continue; if (H[d]) { if (/lunar/.test(H[d])) lunar = true; continue; } out.push(jdn2g(d)); }
    out.lunar = lunar; return out;
  }
  /* the window in which a condition is checked: n sessions after the last data point, each judged on that session's close */
  function window(cls, last, n, dates) {
    var S = spec(cls), L = nextSessions(cls, last, n, dates), days = S.days || daysOf(dates);
    return { n: n, list: L, start: L[0], end: L[L.length - 1], startFa: faDate(L[0]), endFa: faDate(L[L.length - 1]), lastFa: faDate(last),
      basis: S.basis, bar: S.bar, tz: S.tz, days: days.map(function (k) { return WD[k]; }).join('، '),
      evalAt: cls === 'crypto' ? 'پس از بسته‌شدن هر روز UTC (داده از ساعت ۰۰:۳۵ UTC روز بعد در دسترس است)' : 'پس از ثبت قیمت پایانی هر جلسه در منبع',
      expiry: 'اگر تا پایان جلسهٔ ' + faDate(L[L.length - 1]) + ' شرط محقق نشد، سیگنال منقضی است و دوباره ارزیابی می‌شود',
      note: (S.hol && L.lunar ? 'تعطیلات قمری تقریبی (±۱ روز) کسر شده است. ' : '') + (S.hol ? 'تعطیلات رسمی شمسی کسر شده‌اند. ' : '') + (S.days ? '' : 'روزهای جلسه از خود سری داده خوانده شده (' + days.map(function (k) { return WD[k]; }).join('، ') + ').') };
  }

  /* where the price stands against both confirmation levels; checks that a level is not just the current price restated */
  function levels(px, up, dn, atr, ctx) {
    ctx = ctx || {}; var o = { px: px, up: up, dn: dn, dUp: up > 0 ? up / px - 1 : NaN, dDn: dn > 0 ? dn / px - 1 : NaN, checks: [] }, tol = Math.max(px * 0.001, (atr || 0) * 0.05);
    if (!(px > 0)) { o.state = 'nodata'; o.fa = 'قیمت معتبر ندارد'; return o; }
    if (up > 0 && dn > 0 && up < dn) o.checks.push('خطای منطقی: سطح تأیید صعودی پایین‌تر از سطح نزولی است؛ سطوح منتشر نمی‌شوند');
    o.state = px > up + tol ? 'above' : px < dn - tol ? 'below' : Math.abs(px - up) <= tol ? 'atUp' : Math.abs(px - dn) <= tol ? 'atDn' : 'between';
    o.fa = { above: 'بالای سطح تأیید صعودی' + (ctx.upAt ? ' — تأیید صعودی در ' + ctx.upAt + ' رخ داده است' : ''), below: 'زیر سطح تأیید نزولی' + (ctx.dnAt ? ' — تأیید نزولی در ' + ctx.dnAt + ' رخ داده است' : ''),
      atUp: 'روی سطح تأیید صعودی (فاصله کمتر از ۰٫۱٪ یا ۵٪ نوسان روزانه)؛ تأیید فقط با بسته‌شدن بالاتر از آن', atDn: 'روی سطح تأیید نزولی (فاصله کمتر از ۰٫۱٪ یا ۵٪ نوسان روزانه)؛ تأیید فقط با بسته‌شدن پایین‌تر از آن', between: 'بین دو سطح؛ هیچ‌کدام از دو سناریو تأیید نشده' }[o.state];
    if (o.state === 'atUp' || o.state === 'atDn') o.checks.push('قیمت فعلی با سطح تأیید ' + (o.state === 'atUp' ? 'صعودی' : 'نزولی') + ' تقریباً برابر است: سطح از ' + (ctx.src || 'بازهٔ پیشین') + ' و مستقل از قیمت امروز محاسبه شده و برابری فقط هم‌زمانی است، نه تأیید');
    return o;
  }

  Hub.mktCal = { SPEC: SPEC, spec: spec, nextSessions: nextSessions, window: window, levels: levels, daysOf: daysOf, faDate: faDate, WD: WD };
  if (typeof module !== 'undefined' && module.exports) module.exports = Hub.mktCal;
})(typeof window !== 'undefined' ? window : globalThis);
