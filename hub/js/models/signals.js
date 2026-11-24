/* =====================================================================
 * SIGNALS — port of the user's Signal_Stocks / Signal_Gold / Signal_FX /
 * Signal_Options / Temporal_Analysis workbooks (Excel + Power Query) to the hub.
 * Same scoring rules, weights and thresholds (the Settings sheets), same data
 * sources (TSETMC, TGJU), computed in the browser.
 *   Stocks : trend 45% · money flow (individual vs institutional) 40% · volume 15%
 *            + market regime × 0.20, relative percentile gates, Ichimoku cloud guard,
 *            Donchian condition for Strong buy, bear lock, heat gate, queue guard,
 *            EWMA volatility sizing and stops, nearest support / resistance.
 *   Gold   : trend 60% + bubble z-score 40% (intrinsic = ounce / 31.1035 × g × purity × USD)
 *   FX     : trend 70% + USDT–USD spread z-score 30%
 *   Options: Black–Scholes IV (Brenner–Subrahmanyam start, Newton), Greeks,
 *            IV / RV, direction of the underlying trend, percentile gates.
 *   Temporal: cycle scan (periodogram on detrended series), FLD, Gann square of 9,
 *            Fibonacci and Gann time windows from pivots.
 * Weights are structural, not optimised (as the workbooks say). Not investment advice.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {}, F = Hub.fin, num = F.num;
  var clamp = function (x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }, C2 = function (x) { return isFinite(x) ? clamp(x, -2, 2) : 0; };
  var mean = function (a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : NaN; };
  var last = function (a, k) { return a[a.length - (k || 1)]; };                 // k = 1 latest (RowNo in the workbooks)
  var win = function (a, k1, k2) { return a.slice(Math.max(0, a.length - k2), a.length - k1 + 1); };   // RowNo k1..k2
  var maxA = function (a) { return a.length ? Math.max.apply(null, a) : NaN; }, minA = function (a) { return a.length ? Math.min.apply(null, a) : NaN; };

  /* ---------- deterministic sample series (illustrative only) ---------- */
  function rng(seed) { var s = seed >>> 0 || 1; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function gauss(r) { var u = r() || 1e-9, v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function synth(seed, n, p0, drift, vol, opts) {
    var r = rng(seed), out = [], p = p0, ds = [], t = new Date(); t = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
    while (ds.length < n) { if (t.getUTCDay() !== 4 && t.getUTCDay() !== 5) ds.unshift(t.getUTCFullYear() * 10000 + (t.getUTCMonth() + 1) * 100 + t.getUTCDate()); t = new Date(t.getTime() - 864e5); }   // business days ending today
    for (var i = 0; i < n; i++) {
      var d = ds[i];
      var ret = drift + vol * gauss(r) + (opts && opts.cycle ? opts.cycle * Math.sin(2 * Math.PI * i / opts.period) / opts.period : 0);
      var o = p, c = Math.max(1, p * Math.exp(ret)), hi = Math.max(o, c) * (1 + Math.abs(gauss(r)) * vol / 3), lo = Math.min(o, c) * (1 - Math.abs(gauss(r)) * vol / 3);
      var vv = Math.round(3e7 * (1 + r() * 2));
      out.push({ date: d, open: o, high: hi, low: lo, close: c, yclose: p, vol: vv, val: vv * c });
      p = c;
    }
    return out;
  }

  /* ---------- shared calculations ---------- */
  // back-adjust prices for capital increases / dividends: when today's yesterday-price differs from the previous close
  function adjust(rows) {
    var n = rows.length, f = 1, out = new Array(n);
    for (var i = n - 1; i >= 0; i--) {
      var r = rows[i]; out[i] = { date: r.date, close: r.close * f, high: r.high * f, low: r.low * f, raw: r.close, yclose: r.yclose, vol: r.vol, val: r.val, rawHigh: r.high, rawLow: r.low };
      if (i > 0 && r.yclose > 0 && rows[i - 1].close > 0 && Math.abs(r.yclose / rows[i - 1].close - 1) > 0.002) f *= r.yclose / rows[i - 1].close;
    }
    return out;
  }
  function trendBlock(A, P, idx) {
    var c = A.map(function (r) { return r.close; }), n = c.length, cl = last(c);
    var ma = function (k) { return mean(win(c, 1, Math.min(k, n))); };
    var m20 = ma(num(P.MA_Short) || 20), m50 = ma(num(P.MA_Mid) || 50), m100 = ma(num(P.MA_Long) || 100), m200 = ma(num(P.MA_XLong) || 200), m20p = mean(win(c, 21, 40));
    var hiArr = P.useHL ? A.map(function (r) { return r.high; }) : c, loArr = P.useHL ? A.map(function (r) { return r.low; }) : c;
    var hi60 = maxA(win(hiArr, 1, 60)), lo60 = minA(win(loArr, 1, 60)), pos = hi60 > lo60 ? clamp((cl - lo60) / (hi60 - lo60), 0, 1) : NaN;
    var c20 = n >= 20 ? last(c, 20) : NaN, mom = c20 ? cl / c20 - 1 : NaN;
    var rs = idx && isFinite(idx.ret20) && c20 ? (cl / c20) / (1 + idx.ret20) - 1 : NaN;
    var s = { struct: cl ? ((cl > m20) + (cl > m50) + (cl > m100) + (m20 > m50) + (m50 > m100)) / 5 * 4 - 2 : 0,
      slope: m20p ? C2((m20 / m20p - 1) / num(P.SlopeScale) * 2) : 0, chan: isFinite(pos) ? pos * 4 - 2 : 0,
      rs: isFinite(rs) ? C2(rs / num(P.RSScale) * 2) : 0, mom: isFinite(mom) ? C2(mom / num(P.MomScale) * 2) : 0 };
    var w = P.trendW, score = C2(s.struct * w.struct + s.slope * w.slope + s.chan * w.chan + (w.rs ? s.rs * w.rs : 0) + s.mom * w.mom);
    return { close: cl, ma20: m20, ma50: m50, ma100: m100, ma200: m200, hi60: hi60, lo60: lo60, pos: pos, mom: mom, rs: rs, s: s, score: score };
  }
  function ewmaVol(c, lam) {
    if (c.length < 22) return NaN; var r = []; for (var i = 1; i < c.length; i++) r.push(Math.log(c[i] / c[i - 1]));
    var v = mean(r.slice(0, 20).map(function (x) { return x * x; }));
    for (i = 20; i < r.length; i++) v = lam * v + (1 - lam) * r[i] * r[i];
    return Math.sqrt(v) * Math.sqrt(250);
  }
  function varRatio(c, k) {
    if (c.length < k + 2) return NaN; var x = c.slice(-k - 1), r1 = [], r2 = [];
    for (var i = 1; i < x.length; i++) r1.push(Math.log(x[i] / x[i - 1])); for (i = 2; i < x.length; i++) r2.push(Math.log(x[i] / x[i - 2]));
    var v = function (a) { var m = mean(a); return mean(a.map(function (y) { return (y - m) * (y - m); })); };
    return v(r2) / (2 * v(r1));
  }
  function ichimoku(A) {
    var n = A.length; if (n < 78) return null;
    var H = A.map(function (r) { return r.high; }), L = A.map(function (r) { return r.low; });
    var mid = function (k1, k2) { return (maxA(win(H, k1, k2)) + minA(win(L, k1, k2))) / 2; };
    var tenkan = mid(1, 9), kijun = mid(1, 26), sA = (mid(27, 35) + mid(27, 52)) / 2, sB = mid(27, 78), cl = last(A).close;
    var pos = cl > Math.max(sA, sB) ? 1 : cl < Math.min(sA, sB) ? -1 : 0, thick = Math.abs(sA - sB) / cl, color = sA > sB ? 1 : -1;
    return { tenkan: tenkan, kijun: kijun, senkouA: sA, senkouB: sB, pos: pos, thick: thick, color: color, score: C2(pos * (1 + clamp(thick / 0.08, 0, 1)) + color * 0.4), chikou: n > 27 ? cl / A[n - 27].close - 1 : NaN };
  }
  function donchian(A) {
    if (A.length < 60) return null; var H = A.map(function (r) { return r.high; }), L = A.map(function (r) { return r.low; }), cl = last(A).close;
    var up20 = maxA(win(H, 2, 21)), dn20 = minA(win(L, 2, 21)), up55 = maxA(win(H, 2, 56));
    return { up20: up20, dn20: dn20, up55: up55, score: cl > up55 ? 2 : cl > up20 ? 1 : cl < dn20 ? -2 : 0 };
  }
  function rsi(c, k) { if (c.length < k + 1) return NaN; var g = 0, l = 0; for (var i = c.length - k; i < c.length; i++) { var d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d; } return l === 0 ? 100 : 100 - 100 / (1 + g / l); }
  function levels(cl, cands) {
    var ks = Object.keys(cands).filter(function (k) { return isFinite(cands[k]) && cands[k] > 0; });
    var below = ks.filter(function (k) { return cands[k] < cl; }).sort(function (a, b) { return cands[b] - cands[a]; }), above = ks.filter(function (k) { return cands[k] > cl; }).sort(function (a, b) { return cands[a] - cands[b]; });
    var sup = below[0], res = above[0];
    return { support: sup ? cands[sup] : NaN, supSrc: sup || '', resistance: res ? cands[res] : NaN, resSrc: res || '',
      toSup: sup ? cl / cands[sup] - 1 : NaN, toRes: res ? cands[res] / cl - 1 : NaN, inRange: sup && res ? clamp((cl - cands[sup]) / (cands[res] - cands[sup]), 0, 1) : NaN };
  }
  function strength(score10) { var a = Math.abs(score10); return a >= 8 ? 5 : a >= 6 ? 4 : a >= 4 ? 3 : a >= 2 ? 2 : 1; }
  function zscore(series, look) { var x = series.slice(-look), m = mean(x), v = Math.max(0, mean(x.map(function (y) { return y * y; })) - m * m); return v > 0 ? (last(series) - m) / Math.sqrt(v) : NaN; }
  function pctile(vals, v) { var ok = vals.filter(isFinite); return ok.length ? ok.filter(function (x) { return x < v; }).length / Math.max(1, ok.length) : NaN; }
  function simpleSignal(score10, P, rows) {
    if (rows < num(P.MinRowsForSignal)) return 'Insufficient data';
    var s = score10 / 5; return s >= num(P.Thr_StrongBuy) ? 'Strong buy' : s >= num(P.Thr_Buy) ? 'Buy' : s <= num(P.Thr_StrongSell) ? 'Strong sell' : s <= num(P.Thr_Sell) ? 'Sell' : 'Hold';
  }

  /* =================== STOCKS =================== */
  var STOCK_SET = [
    ['HistoryDays', 1250, 'Sessions of price history downloaded; never below the signal engine’s need (1250 = long horizon: 500 warm-up + 3 years of testing)'], ['MinAvgValueRial', 30000000000, 'Minimum 20-day average traded value (rials) for a signal'],
    ['MinRowsForSignal', 60, 'Minimum days of data for a signal'], ['W_Trend', 0.45, 'Weight of the trend block'], ['W_Money', 0.40, 'Weight of the money-flow block'], ['W_Volume', 0.15, 'Weight of the volume block'],
    ['W_SMAStruct', 0.30, 'Moving-average structure, inside trend'], ['W_SMASlope', 0.18, 'Slope of the short MA, inside trend'], ['W_Channel', 0.24, 'Position in the 60-day channel'], ['W_RS', 0.20, 'Relative strength to the total index'], ['W_Mom', 0.08, '20-day momentum'],
    ['W_Net5', 0.28, 'Net individual flow, 5 days'], ['W_Net20', 0.24, 'Net individual flow, 20 days'], ['W_BuyPower', 0.24, 'Individual buyer power'], ['W_Intensity', 0.12, 'Today’s flow intensity'], ['W_Persist', 0.12, 'Flow persistence (share of inflow days)'],
    ['RegimeWeight', 0.20, 'Effect of the market regime on the final score'], ['Thr_StrongBuy', 1.1, 'Strong buy threshold (−2…+2)'], ['Thr_Buy', 0.35, 'Buy threshold'], ['Thr_Sell', -0.35, 'Sell threshold'], ['Thr_StrongSell', -1.1, 'Strong sell threshold'],
    ['BearRegimeLevel', -1.5, 'Regime score below which the bear lock applies'], ['BearCap', 1.3, 'In a bear regime, buy only above this score'], ['TopPctl', 0.85, 'Strong buy only above this watchlist percentile'], ['BuyPctl', 0.60, 'Buy only above this percentile'],
    ['HeatExt', 0.12, 'Index deviation from its 50-day MA that counts as stretched'], ['HeatVeryExt', 0.20, 'Very stretched'], ['HeatRet60', 0.25, '60-day index return that counts as stretched'], ['HeatRet60Very', 0.45, 'Very stretched 60-day return'], ['HeatPctlGate', 0.90, 'In a very stretched market, buys only above this percentile'],
    ['SlopeScale', 0.05, '20-day slope that earns the full ±2'], ['RSScale', 0.08, 'Relative strength that earns the full score'], ['MomScale', 0.12, '20-day momentum that earns the full score'],
    ['StopATRmult', 2.5, 'Multiple of the average daily range in the stop'], ['QueueShare', 0.40, 'Share of locked days in 5 sessions that counts as a queue'],
    ['MA_Short', 20, 'Short MA'], ['MA_Mid', 50, 'Medium MA'], ['MA_Long', 100, 'Long MA'], ['MA_XLong', 200, 'Very long MA (display)'], ['VRFloor', 0.95, 'Variance-ratio floor (unweighted, reported)'], ['EwmaLambda', 0.94, 'EWMA volatility lambda (RiskMetrics)'],
    ['TargetVolAnnual', 0.35, 'Volatility at which a position gets the full MaxWeight'], ['MaxWeight', 0.15, 'Maximum weight per name'], ['MinWeight', 0.02, 'Minimum weight'], ['EventWeightMult', 1, 'Event-risk multiplier on weights (from Temporal Game_Theory)'], ['EventStopMult', 1, 'Event-risk multiplier on stop width']];
  // the user's 76-symbol watchlist (symbol | name | TSETMC insCode | sector); insCodes as supplied by the user, checked on first fetch
  var WATCH = [["فولاد", "فولاد مبارکه اصفهان", "46348559193224090", "فلزات اساسی"], ["فملی", "ملی صنایع مس ایران", "35425587644337450", "فلزات اساسی"], ["شپنا", "پالایش نفت اصفهان", "7745894403636165", "فرآورده نفتی"], ["شبندر", "پالایش نفت بندرعباس", "35366681030756042", "فرآورده نفتی"], ["شتران", "پالایش نفت تهران", "51617145873056483", "فرآورده نفتی"], ["شبریز", "پالایش نفت تبریز", "48753732042176709", "فرآورده نفتی"], ["وبملت", "بانک ملت", "778253364357513", "بانک"], ["وتجارت", "بانک تجارت", "63917421733088077", "بانک"], ["وبصادر", "بانک صادرات ایران", "28320293733348826", "بانک"], ["خودرو", "ایران خودرو", "65883838195688438", "خودرو"], ["خساپا", "سایپا", "44891482026867833", "خودرو"], ["خگستر", "گسترش سرمایه‌گذاری ایران خودرو", "48990026850202503", "خودرو"], ["فارس", "صنایع پتروشیمی خلیج فارس", "25244329144808274", "شیمیایی"], ["نوری", "پتروشیمی نوری", "19040514831923530", "شیمیایی"], ["شپدیس", "پتروشیمی پردیس", "20562694899904339", "شیمیایی"], ["پارس", "پتروشیمی پارس", "6110133418282108", "شیمیایی"], ["شفن", "پتروشیمی فن‌آوران", "65122215875355555", "شیمیایی"], ["تاپیکو", "سرمایه‌گذاری نفت و گاز تأمین", "22560050433388046", "شیمیایی"], ["کگل", "معدنی و صنعتی گل گهر", "35700344742885862", "کانه فلزی"], ["کچاد", "معدنی و صنعتی چادرملو", "18027801615184692", "کانه فلزی"], ["ومعادن", "توسعه معادن و فلزات", "58931793851445922", "کانه فلزی"], ["فخوز", "فولاد خوزستان", "28864540805361867", "فلزات اساسی"], ["ارفع", "آهن و فولاد ارفع", "59266699437480384", "فلزات اساسی"], ["هرمز", "فولاد هرمزگان جنوب", "70498485598181604", "فلزات اساسی"], ["فولاژ", "فولاد آلیاژی ایران", "40808043719554948", "فلزات اساسی"], ["حکشتی", "کشتیرانی جمهوری اسلامی ایران", "60610861509165508", "حمل و نقل"], ["حفاری", "حفاری شمال", "28809886765682162", "خدمات فنی"], ["رمپنا", "گروه مپنا", "67126881188552864", "پیمانکاری"], ["وغدیر", "سرمایه‌گذاری غدیر", "26014913469567886", "سرمایه‌گذاری"], ["وامید", "گروه مدیریت سرمایه‌گذاری امید", "52232388263291380", "سرمایه‌گذاری"], ["شستا", "سرمایه‌گذاری تأمین اجتماعی", "2400322364771558", "سرمایه‌گذاری"], ["وپاسار", "بانک پاسارگاد", "9536587154100457", "بانک"], ["اخابر", "مخابرات ایران", "22811176775480091", "مخابرات"], ["همراه", "ارتباطات سیار ایران", "68635710163497089", "مخابرات"], ["مبین", "پتروشیمی مبین", "27922860956133067", "شیمیایی"], ["جم", "پتروشیمی جم", "32357363984168442", "شیمیایی"], ["کاوه", "فولاد کاوه جنوب کیش", "60350996279289099", "فلزات اساسی"], ["زاگرس", "پتروشیمی زاگرس", "13235547361447092", "شیمیایی"], ["تپسی", "تپسی", "3839324986781871", "خدمات"], ["سیستم", "همکاران سیستم", "47749661205825616", "رایانه"], ["سمگا", "گروه سرمایه‌گذاری میراث فرهنگی", "46741025610365786", "سرمایه‌گذاری"], ["شیراز", "پتروشیمی شیراز", "38568786927478796", "شیمیایی"], ["کرماشا", "صنایع پتروشیمی کرمانشاه", "38437201078089290", "شیمیایی"], ["خراسان", "پتروشیمی خراسان", "43552974795606067", "شیمیایی"], ["سشرق", "سیمان شرق", "26997316501080743", "سیمان"], ["سفارس", "سیمان فارس و خوزستان", "15521712617204216", "سیمان"], ["سصفها", "سیمان اصفهان", "10568944722570445", "سیمان"], ["سهگمت", "سیمان هگمتان", "41284516796232939", "سیمان"], ["دعبید", "لابراتوار داروسازی دکتر عبیدی", "49054891736433700", "دارویی"], ["دکپسول", "تولید ژلاتین کپسول ایران", "52382684379473036", "دارویی"], ["برکت", "گروه دارویی برکت", "34557241988629814", "دارویی"], ["دجابر", "داروسازی جابر ابن حیان", "33406621820337161", "دارویی"], ["غبشهر", "صنعتی بهشهر", "42387718866026650", "غذایی"], ["بفجر", "فجر انرژی خلیج فارس", "46178280540110577", "شیمیایی"], ["آریا", "پلیمر آریا ساسول", "55127657985997520", "شیمیایی"], ["کویر", "تولیدی فولاد سپید فراب کویر", "43545527030854340", "فلزات اساسی"], ["ذوب", "ذوب آهن اصفهان", "71483646978964608", "فلزات اساسی"], ["وخارزم", "سرمایه‌گذاری خوارزمی", "7395271748414592", "سرمایه‌گذاری"], ["پارسان", "گسترش نفت و گاز پارسیان", "23441366113375722", "سرمایه‌گذاری"], ["طلا", "صندوق طلای لوتوس", "46700660505281786", "صندوق طلا"], ["عیار", "صندوق طلای مفید", "34144395039913458", "صندوق طلا"], ["گوهر", "صندوق طلای کیان", "12390706505809150", "صندوق طلا"], ["جواهر", "صندوق طلای زرافشان", "38544104313215500", "صندوق طلا"], ["سیلور", "صندوق س.بازده نقره نوا", "18156575395080321", "صندوق نقره"], ["سیمین", "صندوق س.نقره سیمین هوبر", "33761569293467411", "صندوق نقره"], ["سینرژی", "ص.س. مبتنی بر کالای فارابی", "15001802434062073", "صندوق کالایی"], ["اهرم", "صندوق اهرمی کاریزما", "17914401175772326", "صندوق اهرمی"], ["توان", "صندوق اهرمی مفید", "41927452991671109", "صندوق اهرمی"], ["شتاب", "صندوق اهرمی آسمان", "64216772923447100", "صندوق اهرمی"], ["موج", "صندوق اهرمی رضوی", "67141987086032267", "صندوق اهرمی"], ["پالایش", "صندوق پالایشی یکم", "67675656072510693", "صندوق بخشی"], ["دارا یکم", "صندوق واسطه‌گری مالی یکم", "62235397452612911", "صندوق بخشی"], ["سرو", "صندوق سهامی سرو سودمند", "64942549055019553", "صندوق سهامی"], ["آگاس", "صندوق سهامی آگاه", "33887145736684266", "صندوق سهامی"], ["الماس", "صندوق شاخصی الماس", "28788598290160782", "صندوق شاخصی"], ["تصمیم", "صندوق شاخصی تصمیم", "53419976284977130", "صندوق شاخصی"]];
  function mergeWatch(S, list) { var have = {}, added = 0; S.watch.forEach(function (w) { have[w.symbol] = w; }); (list || WATCH).forEach(function (r) { var w = have[r[0]]; if (w) { if (!w.insCode) w.insCode = r[2]; if (!w.sector) w.sector = r[3]; if (!w.name) w.name = r[1]; return; } S.watch.push({ symbol: r[0], name: r[1], insCode: r[2], sector: r[3], active: true }); added++; }); return added; }

  // the user's full TSE list (stocks-1405-08-20.csv, 771 symbols) merged once into the watchlist; existing rows and data are kept, market filled where missing
  function mergeUniverse(S, force) {
    var UV = Hub.tseUniverse; if (!UV || !S || !Array.isArray(S.watch)) return 0; if (S.uni === UV.asOf && !force) return 0;
    var have = {}, added = 0; S.watch.forEach(function (w) { have[w.symbol] = w; });
    UV.rows.forEach(function (r) { var w = have[r[0]]; if (w) { if (!w.market) w.market = r[2]; if (!w.name) w.name = r[1]; if (!w.sector) w.sector = r[3]; return; } S.watch.push({ symbol: r[0], name: r[1], insCode: '', sector: r[3], market: r[2], board: '', ftype: '', lim: null, active: true }); added++; });
    S.uni = UV.asOf; return added;
  }
  function setObj(list) { var o = {}; list.forEach(function (r) { o[r.key] = num(r.value); }); return o; }
  function setRows(defs) { return defs.map(function (d) { return { key: d[0], value: d[1], note: d[2] }; }); }

  function stocksSample() {
    var S = { version: 1, tool: 'sig-stocks', meta: { title: 'TSE watchlist', asOf: '', source: 'Illustrative synthetic data — press Fetch for TSETMC' }, settings: { scenario: 'base' },
      watch: WATCH.map(function (w) { return { symbol: w[0], name: w[1], insCode: w[2], sector: w[3], active: true }; }), set: setRows(STOCK_SET), data: {}, sources: {} };
    S.watch.forEach(function (w, i) {
      var px = synth(101 + i * 7, 265, 2000 + i * 900, 0.0006 * ((i % 5) - 1.5), 0.022 + (i % 4) * 0.004);
      var r = rng(900 + i), ct = px.slice(-90).map(function (b) { var tot = b.val, bi = tot * (0.5 + 0.25 * (r() - 0.45 + (i % 3 - 1) * 0.05)), si = tot * (0.5 + 0.25 * (r() - 0.5)); return { date: b.date, buyI: bi, sellI: si, buyN: tot - bi, sellN: tot - si, buyIc: 500 + Math.round(r() * 400), sellIc: 500 + Math.round(r() * 400) }; });
      S.data[w.symbol] = { px: px, ct: ct };
    });
    S.data._idx = { total: synth(7, 265, 2500000, 0.0008, 0.011), ew: synth(8, 265, 800000, 0.0005, 0.010) };
    S.data._usd = synth(9, 265, 900000, 0.0012, 0.012);
    return S;
  }
  function stocksRun(S) {
    mergeUniverse(S);
    var P = setObj(S.set); P.trendW = { struct: P.W_SMAStruct, slope: P.W_SMASlope, chan: P.W_Channel, rs: P.W_RS, mom: P.W_Mom };
    var D = S.data || {}, idx = D._idx || {}, usd = D._usd || [];
    function idxStats(rows) { if (!rows || rows.length < 61) return null; var c = rows.map(function (r) { return r.close; }), v = last(c);
      var m20 = mean(win(c, 1, 20)), m50 = mean(win(c, 1, 50)), m100 = mean(win(c, 1, 100)), m20p = mean(win(c, 21, 40));
      return { v: v, ret20: v / last(c, 20) - 1, struct: ((v > m20) + (v > m50) + (m20 > m50)) / 3 * 4 - 2, slope: C2((m20 / m20p - 1) / 0.04 * 2), dev50: v / m50 - 1, ret60: v / last(c, 60) - 1, m100: m100 }; }
    var T = idxStats(idx.total), E = idxStats(idx.ew);
    var usdRet60 = usd.length > 60 ? last(usd).close / last(usd, 60).close - 1 : NaN;
    var rows = S.watch.filter(function (w) { return w.active !== false && w.symbol; }).map(function (w) {
      var d = D[w.symbol] || {}, px = d.px || [], ct = d.ct || [], A = adjust(px), n = A.length, o = { symbol: w.symbol, name: w.name, sector: w.sector, rows: n };
      if (n < 2) { o.signal = 'No data'; return o; }
      var tb = trendBlock(A, P, T), c = A.map(function (r) { return r.close; });
      var rngPct = A.map(function (r) { return r.close ? (r.high - r.low) / r.close : 0; });
      o.price = last(px).close; o.chg = px.length > 1 ? last(px).close / last(px, 2).close - 1 : NaN; o.trend = tb.score; o.tb = tb;
      o.avgVal = mean(win(px.map(function (b) { return b.val; }), 1, 20)); o.atrPct = mean(win(rngPct, 1, 20)); o.low20 = minA(win(c, 1, 20));
      // volume and queue
      var vol = px.map(function (b) { return b.vol; }), vt = last(vol), va = mean(win(vol, 1, 20));
      var lock = px.map(function (b) { return b.high === b.low && b.yclose > 0 ? (b.close > b.yclose ? 1 : b.close < b.yclose ? -1 : 0) : 0; });
      var lk5 = win(lock, 1, 5).filter(function (x) { return x !== 0; }).length / Math.min(5, Math.max(1, n));
      o.queue = last(lock) === 1 ? 'Buy queue' : last(lock) === -1 ? 'Sell queue' : lk5 >= P.QueueShare ? 'Recent queue' : '';
      o.volume = o.queue ? 0 : (va > 0 && vt > 0 ? C2(Math.log(vt / va) / Math.LN2) : 0);
      // money flow (individual = حقیقی)
      var net = ct.map(function (r) { return r.buyI - r.sellI; }), tot = ct.map(function (r) { return r.buyI + r.buyN; });
      var bp = ct.map(function (r) { return r.buyIc && r.sellIc && r.sellI ? (r.buyI / r.buyIc) / (r.sellI / r.sellIc) : NaN; });
      var sum = function (a, k) { return win(a, 1, k).reduce(function (s, x) { return s + x; }, 0); };
      o.net5 = sum(net, 5); o.net20 = sum(net, 20); o.netToday = last(net); var tot5 = sum(tot, 5), tot20 = sum(tot, 20), bp5 = mean(win(bp, 1, 5).filter(isFinite));
      var absAvg = mean(win(net.map(Math.abs), 1, 20)), inflow = win(net, 1, 20).filter(function (x) { return x > 0; }).length;
      var m = ct.length ? { net5: tot5 ? C2(o.net5 / tot5 * 2) : 0, net20: tot20 ? C2(o.net20 / tot20 * 2) : 0, bp: bp5 > 0 ? C2(Math.log(bp5) / Math.LN2 * 2) : 0,
        int: absAvg > 0 ? C2(o.netToday / absAvg) : 0, per: C2(inflow / Math.min(ct.length, 20) * 4 - 2) } : null;
      o.ms = m; o.buyPower = bp5;
      o.money = m ? C2(m.net5 * P.W_Net5 + m.net20 * P.W_Net20 + m.bp * P.W_BuyPower + m.int * P.W_Intensity + m.per * P.W_Persist) : 0;
      o.base = C2(o.trend * P.W_Trend + o.money * P.W_Money + o.volume * P.W_Volume);
      o.ich = ichimoku(A); o.don = donchian(A); o.vr = varRatio(c, 60); o.vol = ewmaVol(c, P.EwmaLambda || 0.94); o.rsi = rsi(c, 14);
      o.er = n > 21 ? Math.abs(last(c) / last(c, 21) - 1) / win(rngPct, 1, 20).reduce(function (s, x) { return s + x; }, 0) : NaN;
      o.usd60 = n > 60 && isFinite(usdRet60) ? (last(c) / last(c, 60)) / (1 + usdRet60) - 1 : NaN;
      o.diverge = n > 5 && last(c) / last(c, 5) - 1 > 0 && o.net5 < 0;
      o.valid = n >= P.MinRowsForSignal && o.avgVal >= P.MinAvgValueRial;
      o.lv = levels(last(c), { 'High 60 (excl. today)': maxA(win(A.map(function (r) { return r.high; }), 2, 61)), 'Low 60 (excl. today)': minA(win(A.map(function (r) { return r.low; }), 2, 61)), 'Low 20': o.low20,
        'Donchian up 20': o.don && o.don.up20, 'Donchian low 20': o.don && o.don.dn20, 'Donchian up 55': o.don && o.don.up55, 'MA50': tb.ma50, 'MA200': n >= 200 ? tb.ma200 : NaN,
        'Kijun 26': o.ich && o.ich.kijun, 'Senkou A': o.ich && o.ich.senkouA, 'Senkou B': o.ich && o.ich.senkouB });
      return o;
    });
    var breadthOk = rows.filter(function (o) { return o.rows >= P.MinRowsForSignal && isFinite(o.trend); });
    var breadth = breadthOk.length ? breadthOk.filter(function (o) { return o.trend > 0; }).length / breadthOk.length * 4 - 2 : 0;
    var regime = T ? C2(0.4 * mean([T.struct, (E || T).struct]) + 0.35 * mean([T.slope, (E || T).slope]) + 0.25 * breadth) : 0;
    var heat = !T ? 'Unknown' : (T.dev50 >= P.HeatVeryExt || T.ret60 >= P.HeatRet60Very) ? 'Very stretched' : (T.dev50 >= P.HeatExt || T.ret60 >= P.HeatRet60) ? 'Stretched' : 'Normal';
    var bases = rows.filter(function (o) { return o.valid; }).map(function (o) { return o.base; });
    rows.forEach(function (o) {
      if (o.signal === 'No data') return;
      o.regime = regime; o.score = Math.round(C2(o.base + regime * P.RegimeWeight) * 5 * 10) / 10; o.pct = o.valid ? pctile(bases, o.base) : NaN;
      var s5 = o.score / 5, rsS = o.tb.s.rs, cloud = o.ich ? o.ich.pos : null, donS = o.don ? o.don.score : null;
      o.signal = o.rows < P.MinRowsForSignal ? 'Insufficient data' : o.avgVal < P.MinAvgValueRial ? 'Low liquidity'
        : o.queue && s5 >= P.Thr_Buy ? 'Hold (queue — data not reliable)' : cloud != null && cloud !== 1 && s5 >= P.Thr_Buy ? 'Hold (below or inside the Ichimoku cloud)'
        : regime <= P.BearRegimeLevel && s5 >= P.Thr_Buy && s5 < P.BearCap ? 'Hold (bear-regime lock)' : heat === 'Very stretched' && s5 >= P.Thr_Buy && o.pct < P.HeatPctlGate ? 'Hold (market too stretched)'
        : s5 >= P.Thr_StrongBuy && o.pct >= P.TopPctl && rsS > 0 && (!isFinite(o.usd60) || o.usd60 >= 0) && heat !== 'Very stretched' && (donS == null || donS >= 1) ? 'Strong buy'
        : s5 >= P.Thr_StrongBuy && o.pct >= P.TopPctl && heat === 'Very stretched' ? 'Buy'
        : s5 >= P.Thr_Buy && o.pct >= P.BuyPctl && !(heat === 'Stretched' && rsS <= 0) ? 'Buy' : s5 <= P.Thr_StrongSell ? 'Strong sell' : s5 <= P.Thr_Sell ? 'Sell' : 'Hold';
      o.strength = /Insufficient|liquidity/.test(o.signal) ? null : strength(o.score);
      o.stop = Math.min(o.low20, o.price * (1 - P.StopATRmult * P.EventStopMult * o.atrPct));
      var isBuy = /^(Strong buy|Buy)$/.test(o.signal);
      o.weight = isBuy && o.vol > 0 ? P.EventWeightMult * clamp(P.MaxWeight * P.TargetVolAnnual / o.vol, P.MinWeight, P.MaxWeight) : NaN;
      o.volStop = isBuy && o.vol > 0 ? o.price * (1 - clamp(P.StopATRmult * P.EventStopMult * o.vol / Math.sqrt(250) * 5, 0.04, 0.3)) : NaN;
      var why = [];
      if (o.tb.s.struct >= 1.2) why.push('MA structure up'); else if (o.tb.s.struct <= -1.2) why.push('MA structure down');
      if (o.ms && o.ms.net5 >= 0.8) why.push('individual inflow 5d'); else if (o.ms && o.ms.net5 <= -0.8) why.push('individual outflow 5d');
      if (o.ms && o.ms.bp >= 0.8) why.push('strong individual buyers'); else if (o.ms && o.ms.bp <= -0.8) why.push('strong sellers');
      if (rsS >= 0.8) why.push('stronger than the index'); else if (rsS <= -0.8) why.push('weaker than the index');
      if (o.ms && o.ms.per >= 0.8) why.push('persistent inflow'); if (o.diverge) why.push('⚠ divergence: price up, individual money out');
      o.why = why.join(', ');
    });
    rows.sort(function (a, b) { return (b.valid ? b.score : -99) - (a.valid ? a.score : -99); });
    var c = [];
    if (!T) c.push({ level: 'warning', msg: 'No index history: regime and relative strength are zero. Fetch data or check the proxy.' });
    if (P.EventWeightMult !== 1 || P.EventStopMult !== 1) c.push({ level: 'warning', msg: 'Event-risk multipliers are active (weights × ' + P.EventWeightMult + ', stops × ' + P.EventStopMult + ').' });
    if (S.meta.source && /synthetic/i.test(S.meta.source)) c.push({ level: 'info', msg: 'Showing illustrative synthetic data. Press Fetch to load TSETMC.' });
    return { rows: rows, regime: regime, heat: heat, T: T, E: E, breadth: breadth, usdRet60: usdRet60, P: P, checks: c,
      counts: ['Strong buy', 'Buy', 'Hold', 'Sell', 'Strong sell'].map(function (k) { return [k, rows.filter(function (o) { return o.signal === k; }).length]; }) };
  }
  // live fetch: watchlist from TSETMC, indices, USD from TGJU
  /* when the data was fetched: a timestamp (for age) and a local Shamsi label */
  function stampData(S, src) { var d = new Date(), J = Hub.jalali, p2 = function (x) { return (x < 10 ? '0' : '') + x; };
    S.meta.asOfTs = d.getTime(); S.meta.source = src;
    // stored as UTC milliseconds (asOfTs); the label is Tehran time whatever the device clock's zone (Iran: UTC+3:30, no daylight saving since 1401)
    var t = new Date(d.getTime() + 3.5 * 36e5); S.meta.asOf = (J ? J.jstr(J.g2d(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())) : t.toISOString().slice(0, 10)) + ' ' + p2(t.getUTCHours()) + ':' + p2(t.getUTCMinutes()); }
  function dataAge(S) { var m = S && S.meta || {}, t = m.asOfTs || (/^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(m.asOf || '') ? Date.parse(m.asOf.replace(' ', 'T') + 'Z') : NaN); return isFinite(t) ? (Date.now() - t) / 3600000 : NaN; }
  function isFa() { return Hub.i18n && Hub.i18n.lang() === 'fa'; }
  function ageText(hrs) { var F = isFa(); if (!isFinite(hrs)) return F ? 'هنوز داده‌ای دریافت نشده' : 'no live data yet'; if (hrs < 1) return Math.max(1, Math.round(hrs * 60)) + (F ? ' دقیقه پیش' : ' min ago'); if (hrs < 48) return Math.round(hrs) + (F ? ' ساعت پیش' : ' h ago'); return Math.round(hrs / 24) + (F ? ' روز پیش' : ' days ago'); }
  // a failed refresh must not wipe the last good data
  function hasContent(v) { return Array.isArray(v) ? v.length > 0 : v && typeof v === 'object' ? Object.keys(v).some(function (k) { return hasContent(v[k]); }) : false; }
  // many symbols failing for one reason → one short message
  function summErr(errs) { if (!errs || !errs.length) return ''; var u = []; errs.forEach(function (x) { var m = String(x).replace(/^[^:]{1,40}:\s*(?=[A-Z]{3,}|[^\s:]+:)/, ''); if (u.indexOf(m) < 0) u.push(m); }); return u.slice(0, 2).join(' · ') + (errs.length > 1 ? (isFa() ? ' (' + errs.length + ' مورد)' : ' (' + errs.length + ' items)') : ''); }
  function safeFetch(fn, S, progress) {
    // what is restored if the fetch fails: the previous series (a shallow copy of the map; fetchers build new arrays) and meta — no full JSON copy of a 100 MB store
    var keep = { data: Object.assign({}, S.data || {}), meta: Object.assign({}, S.meta || {}) };
    if (Hub.data.resetRoutes) Hub.data.resetRoutes();   // a new attempt by the user always really tries again
    return Promise.resolve().then(function () { return fn(S, progress); }).then(function (errs) {
      var got = S.data && Object.keys(S.data).some(function (k) { return k[0] !== '_' && hasContent(S.data[k]); });
      if (!got) { var o = keep; S.data = o.data; S.meta = o.meta; var e = new Error((errs && errs.length ? summErr(errs) : 'no data returned') + (isFa() ? ' — دادهٔ قبلی حفظ شد.' : ' — previous data kept.')); e.kept = true; throw e; }
      // history guard: an update only adds rows — stored history the fresh fetch did not return (shorter request, failed symbol, fallback source) stays
      var wasLive = keep.meta && keep.meta.source && !/synthetic|Illustrative/i.test(keep.meta.source);
      if (wasLive && Hub.histMerge) { try { var rep = []; S.data = Hub.histMerge.mergeStore(S.tool, keep.data, S.data, rep);
        S.meta.histLog = { at: Date.now(), kept: rep.filter(function (x) { return x.kind === 'kept'; }).length, missing: rep.filter(function (x) { return x.kind === 'missing'; }).length, unit: rep.filter(function (x) { return x.kind === 'unit'; }).map(function (x) { return x.path + ' (' + x.old + '→' + x.fresh + ', ' + (x.kept === 'old' ? 'تاریخچهٔ قبلی حفظ شد' : 'سری تازه') + ')'; }).slice(0, 10) }; } catch (e2) { /* never lose the fresh data because of the guard */ } }
      // information (ℹ …) is not a failure: it goes to meta.notes, and only real errors make an update «partly failed»
      var all = errs || [], info = all.filter(function (x) { return /^ℹ /.test(String(x)); }), real = all.filter(function (x) { return !/^ℹ /.test(String(x)); });
      S.meta.notes = info.map(function (x) { return String(x).slice(2); }); real.notes = S.meta.notes; return real;
    }, function (e) { var o = keep; S.data = o.data; S.meta = o.meta; throw e; });
  }
  function maxAgeH() { var m = (Hub.util && Hub.util.store.get('hub.marketdata.v1', null)) || {}; return Number(m.maxAgeH) > 0 ? Number(m.maxAgeH) : 24; }
  /* price history that never shrinks and does not depend on one big request:
     - stored history already deep enough and recent → fetch only the missing tail (gap + 10 sessions, at least 30) and merge by date;
     - otherwise try the target depth, then 700, 450, 260 sessions (the first that answers is kept) and merge with what is stored.
     A large request can time out on a slow line or be refused by the server; the shorter steps keep the update working. */
  function n0(v) { v = Number(v); return isFinite(v) ? v : 0; }
  function mergeRows(a, b) { var m = {}; (a || []).forEach(function (r) { m[r.date] = r; }); (b || []).forEach(function (r) { m[r.date] = r; }); return Object.keys(m).map(function (k) { return m[k]; }).sort(function (x, y) { return x.date - y.date; }); }
  // cap = deepest request the server answered recently (kept a week), so a refused 1250 is not re-tried on every update
  function deepDaily(code, old, tgt, cap) {
    var tse = Hub.data.tse, have = old && old.length ? old : null, enough = Math.min(tgt, cap && cap.n && Date.now() - cap.at < 7 * 864e5 ? cap.n : tgt);
    if (have && have.length >= enough * 0.9) { var l = have[have.length - 1].date, y = Math.floor(l / 10000), mo = Math.floor(l / 100) % 100, d = l % 100, gap = Math.ceil((Date.now() - Date.UTC(y, mo - 1, d)) / 864e5);
      return tse.daily(code, Math.max(30, Math.min(tgt, gap + 10))).then(function (r) { return mergeRows(have, r).slice(-Math.max(tgt, have.length + r.length)); }); }
    var steps = [tgt, 700, 450, 260].filter(function (n, i, a) { return n <= tgt && a.indexOf(n) === i; }), last = null;
    var go = function (i) { if (i >= steps.length) { if (have) return have; throw last || new Error('no data'); }
      return tse.daily(code, steps[i]).then(function (r) { if (!r.length) throw new Error('empty'); if (cap && (!cap.n || steps[i] > cap.n || Date.now() - cap.at >= 7 * 864e5)) { cap.n = steps[i]; cap.at = Date.now(); } return mergeRows(have, r).slice(-Math.max(tgt, have ? have.length : 0)); }, function (e) { last = e; return go(i + 1); }); };
    return go(0);
  }
  /* incremental stock feed (directive 19 · 3): per symbol the plan of Hub.ingest decides the request — none (the day's row comes from the
     one market-watch request), the new sessions, a gap, the rotating revision window, or the one-time initial history. */
  function tradingCal(data, sess) {
    var a = data && data._idx && data._idx.total || [], m = {}; a.forEach(function (r) { if (!r.live) m[r.date] = 1; });
    return Object.keys(m).map(Number).sort(function (x, y) { return x - y; });
  }
  function stocksFetch(S, progress, only) {
    var tse = Hub.data.tse, IG = Hub.ingest, RG = Hub.tseRegistry, P = setObj(S.set), cap = (S.meta && S.meta.depth) || {}, tgt = Math.max(Math.round(P.HistoryDays) || 0, Hub.tradeEngine && Hub.tradeEngine.HIST ? Hub.tradeEngine.HIST.max : 1250), errs = [];
    var smp = !S.meta || /synthetic|Illustrative/i.test(S.meta.source || ''), data = {}, list = [], stats = { none: 0, tail: 0, gap: 0, revise: 0, initial: 0, rows: 0, revised: 0, halted: 0 };
    if (!smp) Object.keys(S.data || {}).forEach(function (k) { data[k] = S.data[k]; });
    var sess = null, nLive = 0, LITE = !!(Hub.util.lite && Hub.util.lite()), CORE = {}; WATCH.forEach(function (x) { CORE[x[0]] = 1; });
    var LDEPTH = Hub.tradeEngine && Hub.tradeEngine.HIST ? Hub.tradeEngine.HIST.l.min : 560;
    if (IG) IG.begin('بورس و فرابورس');
    var stg = function (nm, fn) { return IG ? IG.stage(nm, fn) : Promise.resolve().then(fn); };
    /* individual / institutional flow: the full history only when the stored one has a gap; otherwise today's row from the session's list */
    var ctFor = function (c, old, px) {
      var lastPx = px && px.length ? px[px.length - (px[px.length - 1].live ? 2 : 1)] : null, lc = old && old.length ? old[old.length - 1].date : 0;
      if (old && old.length >= 30 && lastPx && lc >= lastPx.date) return Promise.resolve(old.slice());
      return tse.clientType(c).catch(function () { return old || []; });
    };
    // today's session from the market watch, a provisional row until the official daily row of that date is published
    var addLive = function (c, px, ct, w, rec) {
      var m = sess && sess.by[String(c)]; if (!m) return;
      if (m.nav > 0 && rec) { var nv = rec.nav = rec.nav || [], lv = nv[nv.length - 1]; if (!lv || lv.date < m.date) nv.push({ date: m.date, nav: m.nav }); else if (lv.date === m.date) lv.nav = m.nav; if (nv.length > 1500) rec.nav = nv.slice(-1500); }
      if (!(m.trades > 0) || !(m.close > 0) || !(m.high > 0) || !px) return;
      var l = px[px.length - 1];
      if (l && l.date > m.date) return; if (l && l.date === m.date && !l.live) return;
      var row = { date: m.date, close: m.close, last: m.last, open: m.open, high: m.high, low: m.low, yclose: m.yclose, vol: m.vol, val: m.val, trades: m.trades, live: 1, hEven: m.hEven };
      if (l && l.date === m.date) px[px.length - 1] = row; else px.push(row); nLive++;
      var q = sess.ct[String(c)]; if (q && ct) { var r = { date: m.date, buyI: n0(q.buy_I_Volume) * m.close, sellI: n0(q.sell_I_Volume) * m.close, buyN: n0(q.buy_N_Volume) * m.close, sellN: n0(q.sell_N_Volume) * m.close, buyIc: n0(q.buy_CountI), sellIc: n0(q.sell_CountI), approx: 1 };
        if (ct.length && ct[ct.length - 1].date === m.date) { if (ct[ct.length - 1].approx) ct[ct.length - 1] = r; } else if (!ct.length || ct[ct.length - 1].date < m.date) ct.push(r); }
    };
    var revBucket = ((S.meta && S.meta.revN) || 0) % 5, cal = [], nxt = 0, done = 0;
    var one = function () {
      if (nxt >= list.length) return Promise.resolve();
      var w = list[nxt++], code = w.insCode ? Promise.resolve(w.insCode) : tse.resolve(w.symbol).then(function (c) { w.insCode = c; return c; });
      return code.then(function (c) {
        var old = data[w.symbol], px0 = old && old.px || [], target = LITE && !CORE[w.symbol] ? Math.max(LDEPTH, px0.filter(function (r) { return !r.live; }).length) : tgt, m = sess && sess.by[String(c)];
        var pl = IG ? IG.plan(px0, cal, { store: 'tse', key: w.symbol, target: target, today: sess ? sess.date : 0, revise: IG.hash(w.symbol) % 5 === revBucket }) : { need: 'initial', count: target };
        if (sess && (!m || !(m.trades > 0))) pl.halt = true;   // not traded today (or not in the market watch at all): a halt, not a missing row
        stats[pl.need] = (stats[pl.need] || 0) + 1;
        var get = pl.need === 'none' ? Promise.resolve(null) : pl.need === 'initial' ? deepDaily(c, px0.length ? px0 : null, target, LITE && !CORE[w.symbol] ? null : cap).then(function (rows) { var off = rows.filter(function (r) { return !r.live; }); if (IG && off.length < target * 0.9) IG.mark('tse', w.symbol, { maxN: off.length }); return rows; })
          : tse.daily(c, pl.count);
        return get.then(function (fresh) { var px = px0;
          if (fresh) { if (pl.need === 'initial') { px = fresh; var off0 = fresh.filter(function (r) { return !r.live; }), fd = {}; off0.forEach(function (r) { fd[r.date] = 1; });
              // the initial history covers its whole range: a market day inside it without a row is a day this symbol did not trade
              if (off0.length) pl.gaps = cal.filter(function (d) { return d > off0[0].date && d < off0[off0.length - 1].date && !fd[d]; });
              if (IG) IG.apply('tse', w.symbol, px0, off0, pl); stats.rows += Math.max(0, fresh.length - px0.length); }
            else { var a = IG ? IG.apply('tse', w.symbol, px0, fresh, pl) : { rows: mergeRows(px0, fresh), added: fresh.length, revised: [] }; px = a.rows; stats.rows += a.added; stats.revised += a.revised.length; if (pl.halt && !a.added) stats.halted++; } }
          else if (IG) IG.mark('tse', w.symbol, { at: Date.now(), need: 'none', added: 0, revised: 0 });
          return ctFor(c, old && old.ct, px).then(function (ct) { return [px, ct, c]; }); }); })
        .then(function (r) { var old = data[w.symbol], px = old && r[0] === old.px ? r[0].slice() : r[0], ct = (r[1] || []).slice(-90), rec = { px: px, ct: ct }; if (old && old.nav) rec.nav = old.nav; addLive(r[2], px, ct, w, rec); data[w.symbol] = rec; })
        .catch(function (e) {
          // an instrument the registry added that has no daily history at TSETMC is not a failed update: it is set aside with the reason
          // (checked again in a week) instead of being reported as an error on every update
          if (w.src === 'registry' && /empty|no data/i.test(String(e.message)) && !(data[w.symbol] && data[w.symbol].px && data[w.symbol].px.length)) { w.active = false; w.inactiveWhy = 'TSETMC برای این نماد تاریخچهٔ معاملهٔ روزانه نداد (بدون معامله یا تازه درج‌شده)'; w.retryAt = Date.now() + 7 * 864e5; stats.noHist = (stats.noHist || 0) + 1; return; }
          errs.push(w.symbol + ': ' + e.message); if (IG) IG.mark('tse', w.symbol, { err: String(e.message).slice(0, 120), errAt: Date.now() }); })
        .then(function () { done++; progress && progress(done, list.length, w.symbol); return one(); });
    };
    var step = function () { var deep = list.some(function (w) { var d = data[w.symbol]; return !d || !d.px || d.px.length < 100; }), ps = []; for (var k = 0; k < Math.min(deep ? 3 : 6, list.length); k++) ps.push(one()); return Promise.all(ps); };
    /* indices: the headline and industry indices of both markets. Initial: the full history (the source has no partial request);
       afterwards today's value of every index comes from the two index lists; a full history is requested again only to finalise a
       provisional row of an earlier day that was not seen after the close, to fill a gap, or on the index's weekly revision turn. */
    var IDX = { total: '32097828799138957', ew: '67130298613737946' }, idxStats = { full: 0, append: 0, err: 0 };
    var indices = function (R) {
      var reg = R && R.idx && R.idx.length ? R.idx : [{ insCode: IDX.total, name: 'شاخص کل', headline: true, flow: 1 }, { insCode: IDX.ew, name: 'شاخص کل (هم وزن)', headline: true, flow: 1 }];
      var I = data._idx = data._idx || {}, ext = I.ext = I.ext || {}, meta = S.idxMeta = S.idxMeta || {}, doy = Math.floor(Date.now() / 864e5), closed = sess && !sess.open && sess.hEven >= 123000;
      var rowsOf = function (c) { return c === IDX.total ? I.total : c === IDX.ew ? I.ew : ext[c]; }, put = function (c, a) { if (c === IDX.total) I.total = a; else if (c === IDX.ew) I.ew = a; else ext[c] = a; };
      var k = 0, go = function () { if (k >= reg.length) return Promise.resolve(); var x = reg[k++], c = x.insCode, a = (rowsOf(c) || []).slice(), l = a[a.length - 1];
        meta[c] = { name: x.name, code: x.code || null, headline: !!x.headline, flow: x.flow, raw: x.raw || x.name };
        var cpI = IG ? IG.cp('idx', c) : {}, stale = l && l.live && sess && l.date < sess.date, longGap = l && sess && (Date.UTC(Math.floor(sess.date / 1e4), Math.floor(sess.date / 100) % 100 - 1, sess.date % 100) - Date.UTC(Math.floor(l.date / 1e4), Math.floor(l.date / 100) % 100 - 1, l.date % 100)) / 864e5 > 6;
        var full = !a.length || (a.length < 200 && !cpI.maxN) || stale || longGap || (IG && IG.hash(c) % 7 === doy % 7 && (!cpI.at || Date.now() - cpI.at > 6 * 864e5));
        var p = full ? tse.index(c).then(function (rows) { idxStats.full++; var o = IG ? IG.apply('idx', c, a, rows, null) : { rows: mergeRows(a, rows) }; if (IG && rows.length < 200) IG.mark('idx', c, { maxN: rows.length }); return o.rows; }) : Promise.resolve(a);
        return p.then(function (rows) { rows = rows.slice(-3000); var v = x.value > 0 ? x.value : (c === IDX.total && sess ? sess.idx.total : c === IDX.ew && sess ? sess.idx.ew : 0), d = x.date || (sess && sess.date);
          if (v > 0 && d) { var L = rows[rows.length - 1]; if (!L || L.date < d) { rows.push({ date: d, close: v, high: x.high || v, low: x.low || v, live: closed ? 0 : 1 }); idxStats.append++; } else if (L.date === d && L.live) { rows[rows.length - 1] = { date: d, close: v, high: x.high || v, low: x.low || v, live: closed ? 0 : 1 }; } }
          put(c, rows); if (IG && !full) IG.mark('idx', c, { last: rows.length ? rows[rows.length - 1].date : null, n: rows.length, at: cpI.at || Date.now(), seen: Date.now() }); })
          .catch(function (e) { idxStats.err++; errs.push('شاخص ' + x.name + ': ' + e.message); if (IG) IG.mark('idx', c, { err: String(e.message).slice(0, 120), errAt: Date.now() }); }).then(go); };
      return Promise.all([go(), go(), go()]);
    };
    var usdP = function () { var old = data._usd || [], len = old.length >= 200 ? 40 : 0;
      return Hub.data.tgju('price_dollar_rl', len).then(function (r) { if (r.length) data._usd = (Hub.histMerge && old.length ? Hub.histMerge.mergeSeries(old, r) : r).slice(-Math.max(Math.round(P.HistoryDays) || 0, Hub.tradeEngine && Hub.tradeEngine.HIST ? Hub.tradeEngine.HIST.max : 1250)); }, function () { /* keep the stored series */ }); };
    var regR = null;
    return stg('دیده‌بان بازار و فهرست شاخص‌ها', function () { return tse.session ? tse.session(true).then(function (x) { sess = x; return RG ? RG.refresh(sess).then(function (R) { regR = R; if (R && R.errs) R.errs.forEach(function (m) { errs.push(m); }); var a = RG.syncWatch(S, R); if (a) errs.push('ℹ ' + (isFa() ? a + ' نماد/صندوق تازه از دیده‌بان بازار به فهرست اضافه شد (تاریخچهٔ اولیه همین بار دریافت می‌شود).' : a + ' instruments added from the market watch.')); if (R && R.nDupOff) errs.push('ℹ ' + R.nDupOff + ' نماد فرعیِ ناشرانِ موجود (همان شرکت در بازار یا تابلوی دیگر، مثل «وکار3») کنار گذاشته شد؛ تحلیل از نماد اصلی.'); }, function (e) { errs.push('ثبت نمادها: ' + e.message); }) : null; }, function (e) { errs.push((isFa() ? 'جلسهٔ امروز (دیده‌بان بازار): ' : 'today\'s session (market watch): ') + e.message); }) : null; })
      .then(function () { list = S.watch.filter(function (w) { return w.active !== false && w.symbol && (!only || only.indexOf(w.symbol) >= 0); }); })
      .then(function () { return stg('شاخص‌ها (افزایشی)', function () { return indices(regR); }); })
      .then(function () { cal = tradingCal(data, sess); return stg('سهام و صندوق‌ها (افزایشی)', function () { return step(); }); })
      .then(function () { return stg('دلار (TGJU، افزایشی)', usdP); })
      .then(function () {
        S.data = data; /* nothing arrived (market watch and every history request failed): the data are not newer, so they keep their old time */ if ((errs.length >= list.length && list.length) || (errs.length && !sess && !stats.rows && !stats.revised)) { var e = new Error(summErr(errs) + (isFa() ? ' — دادهٔ قبلی حفظ شد.' : ' — previous data kept.')); e.kept = true; throw e; }
        stampData(S, 'TSETMC + TGJU'); if (cap.n) S.meta.depth = cap; S.meta.revN = ((S.meta.revN) || 0) + 1;
        S.meta.session = sess ? { date: sess.date, time: sess.time, state: sess.state, stateFa: sess.stateFa, open: sess.open, at: sess.at, n: sess.n, live: nLive } : S.meta.session || null;
        // order book snapshot of the session request, per symbol (directive 26 · 2): shown in the order ticket with its own time, never as live data
        if (sess && sess.by) { var BL = {}, bySym = {}; S.watch.forEach(function (w) { if (w.insCode) bySym[w.insCode] = w.symbol; }); Object.keys(sess.by).forEach(function (cd) { var q = sess.by[cd], sy = bySym[cd]; if (sy && q.bl && q.bl.length) BL[sy] = q.bl; }); S.bl = { at: sess.at, date: sess.date, time: sess.time, by: BL }; }
        S.meta.incr = { at: Date.now(), plan: stats, idx: idxStats, n: list.length };
        if (IG) IG.finish({ kind: 'tse', plan: stats, idx: idxStats, symbols: list.length, rowsAdded: stats.rows, revised: stats.revised });
        return errs; }, function (e) { if (IG) IG.finish({ kind: 'tse', err: e.message }); throw e; });
  }

  /* =================== GOLD =================== */
  var GOLD_SET = [['HistoryDays', 1250, 'Sessions of TGJU history; never below the signal engine’s need (1250)'], ['MinRowsForSignal', 60, 'Minimum days for a signal'], ['BubbleLookback', 120, 'Window for the bubble mean and deviation'], ['OunceGrams', 31.1035, 'Grams per troy ounce'],
    ['W_Trend', 0.6, 'Trend block weight'], ['W_Bubble', 0.4, 'Bubble block weight'], ['W_Struct', 0.35, 'MA structure inside trend'], ['W_Slope', 0.25, 'Short-MA slope'], ['W_Chan', 0.25, '60-day channel position'], ['W_Mom', 0.15, '20-day momentum'],
    ['SlopeScale', 0.06, 'Slope for the full score'], ['MomScale', 0.15, 'Momentum for the full score'], ['BubbleZScale', 1, 'Bubble standard deviations per score unit'], ['Thr_StrongBuy', 1.1, ''], ['Thr_Buy', 0.35, ''], ['Thr_Sell', -0.35, ''], ['Thr_StrongSell', -1.1, '']];
  var GOLD_INS = [['انس طلا', 'ons', 'Global', '', ''], ['دلار آزاد', 'price_dollar_rl', 'FX', '', ''], ['طلای ۱۸ عیار', 'geram18', 'Gold', 1, 0.75], ['طلای ۲۴ عیار', 'geram24', 'Gold', 1, 0.995], ['مثقال طلا', 'mesghal', 'Gold', 4.6083, 0.705],
    ['سکه امامی', 'sekee', 'Coin', 8.133, 0.9], ['سکه بهار آزادی', 'sekeb', 'Coin', 8.133, 0.9], ['نیم سکه', 'nim', 'Coin', 4.0665, 0.9], ['ربع سکه', 'rob', 'Coin', 2.03325, 0.9], ['سکه گرمی', 'gerami', 'Coin', 1.0166, 0.9],
    // directive 26 · 7: domestic silver (999, per gram, rial — TGJU «silver_999», checked 2026-11-24); no gold intrinsic value; reference for silver funds
    ['نقره ۹۹۹ (گرم)', 'silver_999', 'Silver', '', '']];
  function goldSample() {
    var S = { version: 1, tool: 'sig-gold', meta: { title: 'Gold, coins and ounce', asOf: '', source: 'Illustrative synthetic data — press Fetch for TGJU' }, settings: { scenario: 'base' },
      ins: GOLD_INS.map(function (x) { return { series: x[0], key: x[1], type: x[2], grams: x[3], purity: x[4], active: true }; }), set: setRows(GOLD_SET), data: {}, sources: {} };
    var ons = synth(31, 400, 2600, 0.0004, 0.009), usd = synth(32, 400, 900000, 0.0010, 0.010);
    S.data.ons = ons; S.data.price_dollar_rl = usd;
    S.ins.forEach(function (x, i) { if (!x.grams) return; var r = rng(40 + i), b = 0.05 + 0.05 * i / 10;
      S.data[x.key] = ons.map(function (o, k) { var intr = o.close / 31.1035 * x.grams * x.purity * usd[k].close, p = intr * (1 + b + 0.06 * Math.sin(k / 25 + i) + 0.01 * gauss(r)); return { date: o.date, open: p, high: p * 1.004, low: p * 0.996, close: p }; }); });
    return S;
  }
  function byDate(rows) { var m = {}; (rows || []).forEach(function (r) { m[r.date] = r.close; }); return m; }
  function ffill(rows, dates) { var m = byDate(rows), lastV = NaN, out = {}; var all = Object.keys(m).map(Number).concat(dates).sort(function (a, b) { return a - b; }); all.forEach(function (d) { if (m[d] != null) lastV = m[d]; out[d] = lastV; }); return out; }
  function goldRun(S) {
    var P = setObj(S.set); P.useHL = true; P.trendW = { struct: P.W_Struct, slope: P.W_Slope, chan: P.W_Chan, mom: P.W_Mom };
    var D = S.data || {};
    var rows = S.ins.filter(function (x) { return x.active !== false && x.key; }).map(function (x) {
      var px = D[x.key] || [], o = { series: x.series, key: x.key, type: x.type, rows: px.length };
      if (px.length < 2) { o.signal = 'No data'; return o; }
      var A = px.map(function (r) { return { date: r.date, close: r.close, high: r.high || r.close, low: r.low || r.close }; }), tb = trendBlock(A, P, null);
      o.price = last(px).close; o.chg = last(px).close / last(px, 2).close - 1; o.trend = tb.score; o.tb = tb;
      if (num(x.grams) > 0 && D.ons && D.price_dollar_rl) {
        var dates = px.map(function (r) { return r.date; }), on = ffill(D.ons, dates), us = ffill(D.price_dollar_rl, dates);
        var bub = px.map(function (r) { var intr = on[r.date] / num(P.OunceGrams) * num(x.grams) * num(x.purity) * us[r.date]; return intr > 0 ? r.close / intr - 1 : NaN; }).filter(isFinite);
        o.intrinsic = last(px).close / (1 + last(bub)); o.bubble = last(bub); o.z = zscore(bub, Math.round(P.BubbleLookback)); o.bubbleScore = isFinite(o.z) ? C2(-o.z / P.BubbleZScale) : NaN;
      }
      var tot = isFinite(o.bubbleScore) ? C2(o.trend * P.W_Trend + o.bubbleScore * P.W_Bubble) : o.trend;
      o.score = Math.round(tot * 5 * 10) / 10; o.signal = simpleSignal(o.score, P, o.rows); o.strength = o.signal === 'Insufficient data' ? null : strength(o.score);
      o.lv = levels(o.price, { 'High 60 (excl. today)': maxA(win(A.map(function (r) { return r.high; }), 2, 61)), 'Low 60 (excl. today)': minA(win(A.map(function (r) { return r.low; }), 2, 61)), 'High 20': maxA(win(A.map(function (r) { return r.high; }), 2, 21)), 'Low 20': minA(win(A.map(function (r) { return r.low; }), 2, 21)), MA20: tb.ma20, MA50: tb.ma50, MA100: tb.ma100, MA200: A.length >= 200 ? tb.ma200 : NaN });
      var why = []; if (tb.s.struct >= 1.2) why.push('MA structure up'); else if (tb.s.struct <= -1.2) why.push('MA structure down'); if (tb.s.slope >= 0.8) why.push('positive slope'); else if (tb.s.slope <= -0.8) why.push('negative slope');
      if (tb.s.chan >= 1) why.push('near the 60-day high'); else if (tb.s.chan <= -1) why.push('near the 60-day low'); if (o.z >= 1) why.push('bubble above its history'); else if (o.z <= -1) why.push('bubble below its history'); o.why = why.join(', ');
      return o;
    });
    rows.sort(function (a, b) { return (b.score || -99) - (a.score || -99); });
    return { rows: rows, P: P, checks: S.meta.source && /synthetic/i.test(S.meta.source) ? [{ level: 'info', msg: 'Showing illustrative synthetic data. Press Fetch to load TGJU.' }] : [] };
  }
  function keysOf(S, always) { return S.ins.filter(function (x) { return x.active !== false && x.key; }).map(function (x) { return x.key; }).concat(always).filter(function (k, i, a) { return a.indexOf(k) === i; }); }
  var DEEP = 3000;   // rows of TGJU history kept for the time-cycle engine
  function tgjuFetch(S, list, progress) {
    var P = setObj(S.set), data = {}, errs = [];
    if (S.meta && !/synthetic|Illustrative/i.test(S.meta.source || '')) Object.keys(S.data || {}).forEach(function (k) { data[k] = S.data[k]; });   // a key that fails keeps its stored history
    var step = function (i) { if (i >= list.length) return Promise.resolve(); var k = list[i]; progress && progress(i + 1, list.length, k);
      // incremental (directive 19 · 3): with a stored history only the newest 40 rows are requested (new days + revision window)
      var old0 = data[k], len = old0 && old0.length >= 200 ? 40 : 0, IG = Hub.ingest;
      // one-time deep history for the time-cycle engine (directive 21 fix): the 1250-row cap left too few turning points to test cycles.
      // TGJU's own depth decides; a source that returns less is remembered for a week and not asked again
      S.meta = S.meta || {}; var DG = S.meta.deep = S.meta.deep || {}, dg = DG[k], deep = len && old0.length < DEEP * 0.9 && !(dg && Date.now() - dg.at < 7 * 864e5 && old0.length >= dg.n * 0.98);
      if (deep) len = DEEP;
      return Hub.data.tgju(k, len).then(function (r) { var old = data[k]; if (IG && len) { var a = IG.apply('tgju', k, old || [], r, null); data[k] = a.rows; IG.note({ rowsAdded: a.added, revised: a.revised.length }); if (deep) DG[k] = { at: Date.now(), n: data[k].length, got: r.length }; } else { data[k] = old && old.length && Hub.histMerge ? Hub.histMerge.mergeSeries(old, r) : r; if (IG) IG.mark('tgju', k, { n: data[k].length, first: data[k][0] && data[k][0].date, last: data[k][data[k].length - 1] && data[k][data[k].length - 1].date, at: Date.now(), need: 'initial' }); } data[k] = data[k].slice(-Math.max(old ? old.length : 0, Math.round(P.HistoryDays) || 0, DEEP, Hub.tradeEngine && Hub.tradeEngine.HIST ? Hub.tradeEngine.HIST.max : 1250)); }).catch(function (e) { errs.push(k + ': ' + e.message); }).then(function () { return step(i + 1); }); };
    // today's price: the daily history ends at the last closed day, the current price is added as a provisional row (replaced once TGJU publishes the day)
    var nowP = Hub.data.tgjuNow ? Hub.data.tgjuNow().catch(function (e) { errs.push((isFa() ? 'قیمت لحظه‌ای TGJU: ' : 'TGJU current prices: ') + e.message); return null; }) : Promise.resolve(null);
    if (Hub.ingest) Hub.ingest.begin('TGJU: ' + list.length + ' سری');
    return step(0).then(function () { return nowP; }).then(function (now) {
      var nl = 0, tsMax = '';
      if (now) Object.keys(data).forEach(function (k) { var a = data[k], c = now[k], l = a && a[a.length - 1]; if (!c || !l || c.date < l.date) return; if (c.date === l.date && !l.live) return;
        var row = { date: c.date, open: l.date === c.date && l.open ? l.open : c.close, high: c.high, low: c.low, close: c.close, live: 1, ts: c.ts }; if (l.date === c.date) a[a.length - 1] = row; else a.push(row); nl++; if (c.ts > tsMax) tsMax = c.ts; });
      S.data = data; stampData(S, 'TGJU'); S.meta.now = now ? { at: Date.now(), live: nl, ts: tsMax } : S.meta.now || null; if (Hub.ingest) Hub.ingest.finish({ kind: 'tgju', series: list.length }); return errs; });
  }

  /* =================== FX =================== */
  var FX_SET = [['HistoryDays', 1250, 'Sessions of history; never below the signal engine’s need (1250)'], ['MinRowsForSignal', 60, ''], ['SpreadLookback', 120, 'Window for the spread mean and deviation'], ['USDT_Scale', 1, 'Set 10 or 0.1 if USDT and USD differ by a factor of ten (toman / rial)'],
    ['W_Trend', 0.7, 'Trend block weight'], ['W_Spread', 0.3, 'Spread block weight (USDT only)'], ['W_Struct', 0.35, ''], ['W_Slope', 0.25, ''], ['W_Chan', 0.25, ''], ['W_Mom', 0.15, ''], ['SlopeScale', 0.05, ''], ['MomScale', 0.12, ''], ['SpreadZScale', 1, ''],
    ['Thr_StrongBuy', 1.1, ''], ['Thr_Buy', 0.35, ''], ['Thr_Sell', -0.35, ''], ['Thr_StrongSell', -1.1, '']];
  var FX_INS = [['دلار آزاد', 'price_dollar_rl', 'FX', false], ['تتر (USDT)', 'crypto-tether-irr', 'Crypto', true], ['یورو', 'price_eur', 'FX', false], ['درهم امارات', 'price_aed', 'FX', false]];
  function fxSample() {
    var S = { version: 1, tool: 'sig-fx', meta: { title: 'USD, USDT and FX', asOf: '', source: 'Illustrative synthetic data — press Fetch for TGJU' }, settings: { scenario: 'base' },
      ins: FX_INS.map(function (x) { return { series: x[0], key: x[1], type: x[2], spread: x[3], active: true }; }), set: setRows(FX_SET), data: {}, sources: {} };
    var usd = synth(51, 400, 900000, 0.0010, 0.011), r = rng(52); S.data.price_dollar_rl = usd;
    S.data['crypto-tether-irr'] = usd.map(function (u, k) { var p = u.close * (1.02 + 0.015 * Math.sin(k / 18) + 0.004 * gauss(r)); return { date: u.date, open: p, high: p * 1.005, low: p * 0.995, close: p }; });
    S.data.price_eur = usd.map(function (u) { return { date: u.date, open: u.close * 1.08, high: u.high * 1.08, low: u.low * 1.08, close: u.close * 1.08 }; });
    S.data.price_aed = usd.map(function (u) { return { date: u.date, open: u.close / 3.6725, high: u.high / 3.6725, low: u.low / 3.6725, close: u.close / 3.6725 }; });
    return S;
  }
  function fxRun(S) {
    var P = setObj(S.set); P.useHL = true; P.trendW = { struct: P.W_Struct, slope: P.W_Slope, chan: P.W_Chan, mom: P.W_Mom };
    var D = S.data || {}, base = D.price_dollar_rl || [];
    var rows = S.ins.filter(function (x) { return x.active !== false && x.key; }).map(function (x) {
      var px = D[x.key] || [], o = { series: x.series, key: x.key, type: x.type, rows: px.length };
      if (px.length < 2) { o.signal = 'No data'; return o; }
      var A = px.map(function (r) { return { date: r.date, close: r.close, high: r.high || r.close, low: r.low || r.close }; }), tb = trendBlock(A, P, null);
      o.price = last(px).close; o.chg = last(px).close / last(px, 2).close - 1; o.trend = tb.score; o.tb = tb;
      if (x.spread && base.length) { var us = ffill(base, px.map(function (r) { return r.date; }));
        var sp = px.map(function (r) { return us[r.date] > 0 ? r.close * num(P.USDT_Scale) / us[r.date] - 1 : NaN; }).filter(isFinite);
        o.spread = last(sp); o.z = zscore(sp, Math.round(P.SpreadLookback)); o.spreadScore = isFinite(o.z) ? C2(-o.z / P.SpreadZScale) : NaN; }
      var tot = isFinite(o.spreadScore) ? C2(o.trend * P.W_Trend + o.spreadScore * P.W_Spread) : o.trend;
      o.score = Math.round(tot * 5 * 10) / 10; o.signal = simpleSignal(o.score, P, o.rows); o.strength = o.signal === 'Insufficient data' ? null : strength(o.score);
      var why = []; if (tb.s.struct >= 1.2) why.push('MA structure up'); else if (tb.s.struct <= -1.2) why.push('MA structure down'); if (tb.s.slope >= 0.8) why.push('positive slope'); else if (tb.s.slope <= -0.8) why.push('negative slope');
      if (o.z >= 1) why.push('spread wider than its history'); else if (o.z <= -1) why.push('spread narrower than its history'); o.why = why.join(', ');
      o.lv = levels(o.price, { 'High 60': maxA(win(A.map(function (r) { return r.high; }), 2, 61)), 'Low 60': minA(win(A.map(function (r) { return r.low; }), 2, 61)), MA20: tb.ma20, MA50: tb.ma50, MA100: tb.ma100 });
      return o;
    });
    var chk = []; var u = rows.filter(function (o) { return /tether|USDT/i.test(o.series) || /تتر/.test(o.series); })[0], d = rows.filter(function (o) { return /دلار/.test(o.series); })[0];
    if (u && d && u.price && d.price && (u.price / d.price > 5 || u.price / d.price < 0.2)) chk.push({ level: 'critical', msg: 'USDT and USD differ by about ten times: one is in tomans. Set USDT_Scale.' });
    if (S.meta.source && /synthetic/i.test(S.meta.source)) chk.push({ level: 'info', msg: 'Showing illustrative synthetic data. Press Fetch to load TGJU.' });
    return { rows: rows, P: P, checks: chk };
  }

  /* =================== OPTIONS =================== */
  var OPT_SET = [['RiskFree', 0.30, 'Annual risk-free rate — an assumption: update from اخزا yields near the expiry'], ['TradingDays', 252, 'Days per year for volatility'], ['RealizedVolWindow', 20, 'Realised-volatility window'],
    ['MinDaysToExpiry', 5, 'No signal below this many days'], ['MinRowsForSignal', 10, 'Minimum days of contract data'], ['MinAvgOptionVolume', 100, 'Minimum 20-day average contract volume (or today\'s volume when only the board snapshot exists)'], ['MinOpenInterest', 500, 'Or: minimum open interest (contracts)'], ['MaxSpreadPct', 0.10, 'Widest bid–ask spread (share of mid) still tradable'], ['MinTradesA', 10, 'Trades today for liquidity grade A'], ['MaxPctOfVolume', 0.20, 'Position ≤ this share of daily volume'], ['MaxPctOfOI', 0.10, 'Position ≤ this share of open interest'], ['ExitDaysBeforeExpiry', 3, 'Sell at least this many trading days before expiry'], ['MaxMoneyness', 0.25, 'Only strikes within this distance of the underlying get buy signals (deep ITM / far OTM IV is unreliable)'], ['W_Dir', 0.65, 'Weight of underlying direction'], ['W_Vol', 0.35, 'Weight of cheap / expensive implied volatility'],
    ['VolScale', 0.5, 'IV/RV deviation from 1 per score unit'], ['MomScale', 0.12, ''], ['MA_Short', 20, ''], ['MA_Mid', 50, ''], ['MA_Long', 100, ''], ['CheapIVRatio', 0.9, 'IV/RV below this = cheap volatility'], ['ExpensiveIVRatio', 1.3, 'IV/RV above this = expensive (premium-selling candidate)'],
    ['Thr_StrongBuy', 1.1, ''], ['Thr_Buy', 0.35, ''], ['TopPctl', 0.85, ''], ['BuyPctl', 0.6, ''], ['HeatExt', 0.12, 'Underlying deviation from its long MA = stretched'], ['HeatVeryExt', 0.20, 'Very stretched: no strong buy']];
  function ncdf(x) { var t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989422804014327 * Math.exp(-x * x / 2), p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429)))); return x > 0 ? 1 - p : p; }
  function bs(type, S0, K, T, r, sig) { var d1 = (Math.log(S0 / K) + (r + sig * sig / 2) * T) / (sig * Math.sqrt(T)), d2 = d1 - sig * Math.sqrt(T);
    var px = type === 'Call' ? S0 * ncdf(d1) - K * Math.exp(-r * T) * ncdf(d2) : K * Math.exp(-r * T) * ncdf(-d2) - S0 * ncdf(-d1), pdf = Math.exp(-d1 * d1 / 2) / Math.sqrt(2 * Math.PI);
    return { price: px, d1: d1, vega: S0 * pdf * Math.sqrt(T), delta: type === 'Call' ? ncdf(d1) : ncdf(d1) - 1, gamma: pdf / (S0 * sig * Math.sqrt(T)), vega1: S0 * pdf * Math.sqrt(T) / 100,
      theta: (-S0 * pdf * sig / (2 * Math.sqrt(T)) + (type === 'Call' ? -1 : 1) * r * K * Math.exp(-r * T) * ncdf((type === 'Call' ? 1 : -1) * d2)) / 365 }; }
  function impliedVol(type, S0, K, T, r, P) {
    var intr = type === 'Call' ? Math.max(0, S0 - K * Math.exp(-r * T)) : Math.max(0, K * Math.exp(-r * T) - S0), cap = type === 'Call' ? S0 : K * Math.exp(-r * T);
    if (!(P > intr) || P >= cap) return NaN;
    var s = clamp(Math.sqrt(Math.abs(Math.log(S0 / K) + r * T) * 2 / T), 0.05, 4);       // workbook's initial guess
    for (var i = 0; i < 8; i++) { var b = bs(type, S0, K, T, r, s); s = clamp(s - (b.price - P) / Math.max(b.vega, 0.0001 * S0 * Math.sqrt(T)), 0.02, 4); }
    if (s <= 0.021 || s >= 3.99) return NaN;
    for (i = 0; i < 40; i++) { b = bs(type, S0, K, T, r, s); if (Math.abs(b.price - P) < 1e-8 * Math.max(1, P)) break; s = clamp(s - (b.price - P) / Math.max(b.vega, 1e-9), 0.0001, 5); }   // polish
    return Math.abs(bs(type, S0, K, T, r, s).price - P) > Math.max(0.01 * P, 0.5) ? NaN : s;
  }
  // underlyings whose whole option chain is pulled from the TSETMC option board (insCode from the user's watchlist; blank = found by symbol)
  var OPT_UNDS = [['توان', '41927452991671109'], ['اطلس', ''], ['اخابر', '22811176775480091'], ['اهرم', '17914401175772326'], ['تاپیکو', '22560050433388046'], ['تاصیکو', ''], ['طعام', ''], ['فملی', '35425587644337450'], ['موج', '67141987086032267']];
  function undRows() { return OPT_UNDS.map(function (u) { return { symbol: u[0], insCode: u[1], active: true }; }); }
  function shamsi(e) { var J = Hub.jalali, s0 = String(e == null ? '' : e).trim(); if (!J || !s0) return s0; if (/^\d{8}$/.test(s0)) { var y = +s0.slice(0, 4); return y > 1900 ? J.jstr(J.g2d(y, +s0.slice(4, 6), +s0.slice(6, 8))) : s0.slice(0, 4) + '/' + s0.slice(4, 6) + '/' + s0.slice(6, 8); } var j = J.parse(s0); return isFinite(j) ? J.jstr(j) : s0; }
  function optSample() {
    var und = synth(61, 150, 1000, 0.0008, 0.025), r = rng(62), S = { version: 1, tool: 'sig-options', meta: { title: 'TSE options', asOf: '', source: 'Illustrative synthetic data — press Fetch for TSETMC' }, settings: { scenario: 'base' },
      contracts: [], chain: [], unds: undRows(), set: setRows(OPT_SET), data: { und: { 'شستا': und } }, sources: {} };
    var S0 = last(und).close, J = Hub.jalali, today = Math.floor(Date.now() / 864e5) + 2440588; var exp = function (d) { return J ? J.jstr(today + d) : ''; };
    [[0.9, 'Call', 45], [1.0, 'Call', 45], [1.1, 'Call', 75], [1.0, 'Put', 45], [0.9, 'Put', 75], [1.2, 'Call', 3]].forEach(function (x, i) {
      var K = Math.round(S0 * x[0] / 10) * 10, T = x[2] / 365, sig = 0.45 + 0.25 * r(), p = bs(x[1], S0, K, T, 0.30, sig).price, sym = (x[1] === 'Call' ? 'ضستا' : 'طستا') + (1001 + i);
      S.contracts.push({ symbol: sym, type: x[1], underlying: 'شستا', strike: K, expiry: exp(x[2]), size: 1000, active: true });
      S.data[sym] = synth(70 + i, 40, p, 0, 0.05).map(function (b, k, arr) { var f = p / arr[arr.length - 1].close; return { date: b.date, open: b.open * f, high: b.high * f, low: b.low * f, close: b.close * f, vol: 500 + Math.round(r() * 2000) }; });
    });
    return S;
  }
  function optRun(S) {
    var P = setObj(S.set), D = S.data || {}, J = Hub.jalali, today = Math.floor(Date.now() / 864e5);
    var offU = {}; (S.unds || []).forEach(function (u) { if (u.active === false) offU[u.symbol] = 1; });
    var all = (S.contracts || []).concat((S.chain || []).filter(function (c) { return !offU[c.underlying]; }));
    var rows = all.filter(function (c) { return c.active !== false && c.symbol; }).map(function (c) {
      var o = { symbol: c.symbol, type: c.type, underlying: c.underlying, strike: num(c.strike), expiry: shamsi(c.expiry), size: num(c.size) || 1000, auto: !!c.auto }, und = (D.und || {})[c.underlying] || [], op = D[c.symbol] || [], sn = (D.snap || {})[c.symbol];
      var ej = J.parse(o.expiry), ed = isFinite(ej) ? Math.floor(J.toDate(ej).getTime() / 864e5) : NaN; o.days = ed - today; var T = Math.max(o.days, 1) / 365, r = P.RiskFree;
      var mid = sn && sn.bid > 0 && sn.ask > 0 ? (sn.bid + sn.ask) / 2 : NaN;
      o.S = und.length ? last(und).close : sn && sn.ua > 0 ? sn.ua : NaN; o.price = isFinite(mid) ? mid : sn && sn.trades > 0 && sn.last > 0 ? sn.last : op.length ? last(op).close : sn ? (sn.close || sn.last) : NaN; o.priceSrc = isFinite(mid) ? 'mid' : sn && sn.trades > 0 ? 'last' : 'close'; o.rows = op.length; o.snap = !!sn;   // live quote first: a stale closing price misprices IV
      o.avgVol = op.length ? mean(win(op.map(function (b) { return b.vol || 0; }), 1, 20)) : sn ? sn.vol : NaN; o.oi = sn ? sn.oi : NaN; o.bid = sn ? sn.bid : NaN; o.ask = sn ? sn.ask : NaN;
      o.moneyness = o.strike ? o.S / o.strike - 1 : NaN;
      var lr = []; for (var i = Math.max(1, und.length - Math.round(P.RealizedVolWindow)); i < und.length; i++) lr.push(Math.log(und[i].close / und[i - 1].close));
      var m = mean(lr); o.rv = lr.length ? Math.sqrt(Math.max(0, mean(lr.map(function (x) { return x * x; })) - m * m)) * Math.sqrt(P.TradingDays) : NaN;
      o.iv = isFinite(o.S) && isFinite(o.price) && o.strike > 0 && o.days > 0 ? impliedVol(c.type, o.S, o.strike, T, r, o.price) : NaN;
      if (isFinite(o.iv)) { var g = bs(c.type, o.S, o.strike, T, r, o.iv); o.delta = g.delta; o.gamma = g.gamma; o.vega = g.vega1; o.theta = g.theta; }
      o.ivrv = isFinite(o.iv) && o.rv > 0 ? o.iv / o.rv : NaN;
      var uc = und.map(function (b) { return b.close; }), ma = function (k) { return mean(win(uc, 1, Math.min(k, uc.length))); }, m1 = ma(P.MA_Short), m2 = ma(P.MA_Mid), m3 = ma(P.MA_Long), c20 = uc.length >= 20 ? last(uc, 20) : NaN;
      var st = o.S ? ((o.S > m1) + (o.S > m2) + (o.S > m3) + (m1 > m2) + (m2 > m3)) / 5 * 4 - 2 : 0, mo = c20 ? C2((o.S / c20 - 1) / P.MomScale * 2) : 0;
      o.trend = C2(st * 0.7 + mo * 0.3); o.dir = C2(o.trend * (c.type === 'Call' ? 1 : -1)); o.volS = isFinite(o.ivrv) ? C2(-(o.ivrv - 1) / P.VolScale) : 0;
      o.score = Math.round(C2(o.dir * P.W_Dir + o.volS * P.W_Vol) * 5 * 10) / 10;
      o.heat = !(o.S > 0 && m3 > 0) ? 'Unknown' : o.S / m3 - 1 >= P.HeatVeryExt ? 'Very stretched' : o.S / m3 - 1 >= P.HeatExt ? 'Stretched' : 'Normal';
      // tradability: can you buy now AND sell later? two-sided quote, spread, volume, trades, open interest
      var pv = function (k, d) { return isFinite(P[k]) ? P[k] : d; }, mOI = pv('MinOpenInterest', 500), mSp = pv('MaxSpreadPct', 0.10), mV = P.MinAvgOptionVolume;
      o.bidQ = sn ? sn.bidQ : NaN; o.askQ = sn ? sn.askQ : NaN; o.trades = sn ? sn.trades : NaN;
      o.spread = o.bid > 0 && o.ask > 0 ? (o.ask - o.bid) / ((o.ask + o.bid) / 2) : NaN;
      o.canBuy = sn ? o.ask > 0 && o.askQ > 0 : o.avgVol >= mV; o.canSell = sn ? o.bid > 0 && o.bidQ > 0 : o.avgVol >= mV;
      var act0 = o.avgVol >= mV || o.oi >= mOI;
      o.liqGrade = !sn ? (o.avgVol >= 5 * mV ? 'A' : o.avgVol >= mV ? 'B' : 'C')
        : !(o.canBuy && o.canSell) || !(o.spread <= mSp) || !act0 ? 'C'
        : o.spread <= mSp / 2 && o.avgVol >= 5 * mV && o.trades >= pv('MinTradesA', 10) && o.oi >= 4 * mOI ? 'A' : 'B';
      var F = isFa();
      o.liqWhy = !sn ? (F ? 'فقط سابقه: میانگین حجم ۲۰ روزه ' : 'history only: 20-day avg volume ') + Math.round(o.avgVol || 0) : [!(o.ask > 0) ? (F ? 'فروشنده‌ای در تابلو نیست (الان قابل خرید نیست)' : 'no ask (cannot buy now)') : '', !(o.bid > 0) ? (F ? 'خریداری در تابلو نیست (بعداً قابل فروش نیست)' : 'no bid (cannot sell now)') : '',
        isFinite(o.spread) && o.spread > mSp ? (F ? 'فاصلهٔ خرید و فروش ' : 'spread ') + Math.round(o.spread * 100) + '%' : '', !act0 ? (F ? 'حجم و موقعیت باز کم' : 'thin volume and open interest') : ''].filter(Boolean).join(F ? '، ' : ', ');
      var capV = o.avgVol > 0 ? pv('MaxPctOfVolume', 0.2) * o.avgVol : Infinity, capO = o.oi > 0 ? pv('MaxPctOfOI', 0.1) * o.oi : Infinity;
      o.maxContracts = isFinite(Math.min(capV, capO)) ? Math.max(0, Math.floor(Math.min(capV, capO))) : NaN;
      o.exitBy = isFinite(ej) && J ? (function () { var d = ej, k = 0, H = J.holidays(ej - 30, ej + 5, true); while (k < pv('ExitDaysBeforeExpiry', 3) && d > ej - 30) { d--; if (!J.isOff(d, 2, H)) k++; } return J.jstr(d); })() : '';
      o.liquid = o.liqGrade !== 'C';
      o.valid = (o.rows >= P.MinRowsForSignal || o.snap) && o.liquid && isFinite(o.iv);
      o.lv = levels(o.S, { 'High 60': maxA(win(und.map(function (b) { return b.high; }), 1, 60)), 'Low 60': minA(win(und.map(function (b) { return b.low; }), 1, 60)), 'High 20': maxA(win(und.map(function (b) { return b.high; }), 1, 20)), 'Low 20': minA(win(und.map(function (b) { return b.low; }), 1, 20)), MA20: m1, MA50: m2, MA100: m3 });
      return o;
    });
    var sc = rows.filter(function (o) { return o.valid; }).map(function (o) { return o.score; });
    rows.forEach(function (o) {
      o.pct = o.valid ? pctile(sc, o.score) : NaN; var s5 = o.score / 5, call = o.type === 'Call', L = call ? 'Call' : 'Put';
      var mm = isFinite(P.MaxMoneyness) ? P.MaxMoneyness : 0.25, dist = call ? o.S / o.strike - 1 : o.strike / o.S - 1; o.deepITM = dist > mm; o.farOTM = dist < -mm;
      o.signal = o.deepITM ? 'Deep ITM' : o.farOTM ? 'Far OTM' : !(o.days >= Math.max(P.MinDaysToExpiry, (isFinite(P.ExitDaysBeforeExpiry) ? P.ExitDaysBeforeExpiry : 3) * 1.4 + 5)) ? 'Near expiry' : o.rows < P.MinRowsForSignal && !o.snap ? 'Insufficient data' : !o.liquid ? 'Low liquidity' : !isFinite(o.iv) ? 'IV not solved'
        : o.ivrv >= P.ExpensiveIVRatio && (call ? o.trend <= 0.35 : o.trend >= -0.35) ? 'Sell ' + L : o.ivrv >= P.ExpensiveIVRatio ? 'Neutral'
        : s5 >= P.Thr_StrongBuy && o.pct >= P.TopPctl && o.heat !== 'Very stretched' ? 'Strong buy ' + L : s5 >= P.Thr_Buy && o.pct >= P.BuyPctl ? 'Buy ' + L
        : o.ivrv >= P.ExpensiveIVRatio && (call ? o.trend <= 0.35 : o.trend >= -0.35) ? 'Sell ' + L : 'Neutral';
      var F2 = isFa(), why = []; if (o.trend >= 1) why.push(F2 ? 'روند صعودی دارایی پایه' : 'underlying uptrend'); else if (o.trend <= -1) why.push(F2 ? 'روند نزولی دارایی پایه' : 'underlying downtrend');
      if (o.ivrv <= P.CheapIVRatio) why.push(F2 ? 'نوسان ضمنی ارزان‌تر از نوسان واقعی (قیمت اختیار مناسب)' : 'implied vol cheaper than realised'); else if (o.ivrv >= P.ExpensiveIVRatio) why.push(F2 ? 'نوسان ضمنی گران‌تر از نوسان واقعی (اختیار گران است؛ خریدش توصیه نمی‌شود)' : 'implied vol dearer than realised — buying not advised');
      if (o.deepITM) why.push(F2 ? 'عمیقاً در سود: نوسان ضمنی قابل اتکا نیست؛ خود سهم پایه را بررسی کنید' : 'deep in the money: IV unreliable'); if (o.farOTM) why.push(F2 ? 'خیلی دور از قیمت: احتمال سود کم' : 'far out of the money');
      if (Math.abs(o.moneyness) <= 0.05) why.push(F2 ? 'نزدیک قیمت اعمال' : 'near the strike'); o.why = why.join(F2 ? '، ' : ', ');
      o.strikeVsLevels = !(o.strike && o.S) ? '' : call ? (isFinite(o.lv.resistance) && o.strike > o.lv.resistance ? 'Strike above resistance: profit needs a breakout' : o.strike > o.S ? 'Strike between price and resistance' : 'Strike below price (in the money)')
        : (isFinite(o.lv.support) && o.strike < o.lv.support ? 'Strike below support: profit needs a breakdown' : o.strike < o.S ? 'Strike between support and price' : 'Strike above price (in the money)');
    });
    rows.sort(function (a, b) { return (b.valid ? b.score : -99) - (a.valid ? a.score : -99); });
    var c = [{ level: 'info', msg: 'European Black–Scholes on American-style TSE options; dividends of the underlying ignored (IV of calls overstated near the AGM). RiskFree is an assumption.' }];
    if (S.meta.source && /synthetic/i.test(S.meta.source)) c.push({ level: 'info', msg: 'Showing illustrative synthetic data. Press Fetch to load TSETMC.' });
    return { rows: rows, P: P, checks: c };
  }
  // 1 underlyings → insCodes · 2 TSETMC option board → every strike and expiry of those underlyings (calls and puts, with today's price,
  // volume, open interest, best bid / ask) · 3 daily bars of each underlying · 4 daily bars only for the contracts you entered by hand
  function optFetch(S, progress) {
    var tse = Hub.data.tse, und = {}, snap = {}, data = { und: und, snap: snap }, errs = [], J = Hub.jalali;
    if (!Array.isArray(S.unds)) S.unds = undRows(); if (!Array.isArray(S.chain)) S.chain = [];
    if (S.meta && /synthetic|Illustrative/i.test(S.meta.source || '')) S.contracts = [];   // the illustrative شستا contracts are not real
    var ul = S.unds.filter(function (u) { return u.active !== false && u.symbol; }), codes = {}, manual = S.contracts.filter(function (c) { return c.active !== false && c.symbol; }), steps = ul.length + 2;
    var k = 0, tick = function (t) { progress && progress(++k, steps + manual.length, t); };
    return ul.reduce(function (p, u) { return p.then(function () { tick(u.symbol); return (u.insCode ? Promise.resolve(u.insCode) : tse.resolve(u.symbol).then(function (c) { u.insCode = c; return c; })).then(function (c) { codes[c] = u.symbol; }, function (e) { errs.push(u.symbol + ': ' + e.message); }); }); }, Promise.resolve())
      .then(function () { tick(isFa() ? 'تابلوی اختیار معامله' : 'option board'); return tse.optionWatch().then(function (rows) {
        var chain = [], seen = {};
        rows.forEach(function (r) { var us = codes[r.ua]; if (!us) return; var exp = shamsi(r.end);
          [['Call', r.call], ['Put', r.put]].forEach(function (x) { var c = x[1]; if (!c.symbol || seen[c.symbol]) return; seen[c.symbol] = 1;
            chain.push({ symbol: c.symbol, type: x[0], underlying: us, strike: r.strike, expiry: exp, size: r.size, active: true, auto: true, insCode: c.code });
            snap[c.symbol] = { close: c.close, last: c.last, vol: c.vol, val: c.val, trades: c.trades, oi: c.oi, bid: c.bid, ask: c.ask, bidQ: c.bidQ, askQ: c.askQ, ua: r.uaClose, days: r.days }; }); });
        var miss = ul.filter(function (u) { return u.insCode && !chain.some(function (c) { return c.underlying === u.symbol; }); }).map(function (u) { return u.symbol; });
        if (miss.length) errs.push((isFa() ? 'بدون قرارداد فعال در تابلو: ' : 'no listed contracts: ') + miss.join('، '));
        chain.sort(function (a, b) { return a.underlying < b.underlying ? -1 : a.underlying > b.underlying ? 1 : (J ? J.parse(a.expiry) - J.parse(b.expiry) : 0) || a.strike - b.strike || (a.type < b.type ? -1 : 1); });
        S.chain = chain; }, function (e) { errs.push('TSETMC option board: ' + e.message); }); })
      .then(function () {
        var us = {}; S.chain.concat(manual).forEach(function (c) { us[c.underlying] = 1; }); var uk = Object.keys(us); steps += uk.length - 1;
        return (tse.session ? tse.session().catch(function () { return null; }) : Promise.resolve(null)).then(function (L) {
        return uk.reduce(function (p, u) { return p.then(function () { tick(u); var code = Object.keys(codes).filter(function (c) { return codes[c] === u; })[0];
          return (code ? Promise.resolve(code) : tse.resolve(u)).then(function (c) { return tse.daily(c, 150).then(function (r) { var m = L && L.by[String(c)], l = r[r.length - 1];   // underlying's price today from the session snapshot
            if (m && m.trades > 0 && m.close > 0 && l && (m.date > l.date || (m.date === l.date && l.live))) { r = r.slice(); var row = { date: m.date, close: m.close, last: m.last, open: m.open, high: m.high, low: m.low, yclose: m.yclose, vol: m.vol, val: m.val, trades: m.trades, live: 1 }; if (l.date === m.date) r[r.length - 1] = row; else r.push(row); }
            return r; }); }).then(function (r) { und[u] = r; }).catch(function (e) { errs.push(u + ': ' + e.message); }); }); }, Promise.resolve()); }); })
      .then(function () { return manual.reduce(function (p, c) { return p.then(function () { tick(c.symbol); return tse.resolve(c.symbol).then(function (code) { return tse.daily(code, 60); }).then(function (r) { data[c.symbol] = r; }).catch(function (e) { errs.push(c.symbol + ': ' + e.message); }); }); }, Promise.resolve()); })
      .then(function () { S.data = data; stampData(S, 'TSETMC'); return errs; });
  }

  /* =================== TEMPORAL =================== */
  function tempSample() {
    var S = { version: 1, tool: 'sig-temporal', meta: { title: 'Temporal analysis', asOf: '', source: 'Illustrative synthetic data — press Fetch' }, settings: { scenario: 'base' },
      series: { source: 'tse-index', key: '32097828799138957', label: 'TSE total index', bars: 600, log: true }, scan: { minP: 20, maxP: 250, sep: 0.15 },
      sq9: { base: 0 }, pivots: [{ label: 'Major low', date: '', price: 0 }, { label: 'Major high', date: '', price: 0 }],
      gannDays: '30,45,60,90,120,144,180,360', fibs: '0.382,0.618,1,1.618,2.618', data: {}, sources: {} };
    S.data.series = synth(81, 700, 2000000, 0.0007, 0.010, { cycle: 2.2, period: 120 });
    var px = S.data.series, lo = px.slice(-300).reduce(function (a, b) { return b.close < a.close ? b : a; }), hi = px.slice(-300).reduce(function (a, b) { return b.close > a.close ? b : a; }), J = Hub.jalali;
    var toJ = function (d) { var s = String(d); return J.jstr(J.g2d(+s.slice(0, 4), +s.slice(4, 6), +s.slice(6, 8))); };
    var first = lo.date < hi.date ? lo : hi, second = lo.date < hi.date ? hi : lo;
    S.pivots = [{ label: first === lo ? 'Major low' : 'Major high', date: toJ(first.date), price: Math.round(first.close) }, { label: second === lo ? 'Major low' : 'Major high', date: toJ(second.date), price: Math.round(second.close) }];
    S.sq9.base = Math.round(px.slice(-120).reduce(function (a, b) { return b.close < a.close ? b : a; }).close);
    return S;
  }
  function tempRun(S) {
    if (S.autoPiv !== false && S.data && S.data.series && S.data.series.length && S.meta && !/synthetic/i.test(S.meta.source || '')) { var ld = S.data.series[S.data.series.length - 1].date; if (S.autoStamp !== ld) { tempAuto(S); S.autoStamp = ld; } }
    var J = Hub.jalali, px = (S.data && S.data.series) || [], n = Math.min(px.length, Math.round(num(S.series.bars)) || 600), x = px.slice(-n), N = x.length, out = { N: N, checks: [] };
    if (N < 60) { out.checks.push({ level: 'critical', msg: 'Not enough data for the cycle scan (need 60+ bars).' }); out.cycles = []; out.windows = []; out.sq9 = []; return out; }
    var y = x.map(function (b) { return S.series.log ? Math.log(b.close) : b.close; }), t = y.map(function (_, i) { return i; }), mt = (N - 1) / 2, my = mean(y);
    var slope = t.reduce(function (s, ti, i) { return s + (ti - mt) * (y[i] - my); }, 0) / t.reduce(function (s, ti) { return s + (ti - mt) * (ti - mt); }, 0), dt = y.map(function (v, i) { return v - (my + slope * (i - mt)); });
    var sd = Math.sqrt(mean(dt.map(function (v) { return v * v; })));
    var scan = []; for (var p = Math.max(4, Math.round(num(S.scan.minP))); p <= Math.min(Math.round(num(S.scan.maxP)), Math.floor(N / 2)); p++) {
      var a = 0, b = 0; for (var i = 0; i < N; i++) { a += dt[i] * Math.cos(2 * Math.PI * i / p); b += dt[i] * Math.sin(2 * Math.PI * i / p); } a *= 2 / N; b *= 2 / N;
      scan.push({ p: p, amp: Math.sqrt(a * a + b * b), a: a, b: b, rel: sd ? Math.sqrt(a * a + b * b) / sd : 0 });
    }
    var peaks = scan.filter(function (s, k) { return (k === 0 || s.amp >= scan[k - 1].amp) && (k === scan.length - 1 || s.amp >= scan[k + 1].amp); }).sort(function (u, v) { return v.amp - u.amp; });
    var top = []; peaks.forEach(function (s) { if (top.length < 3 && top.every(function (q) { return Math.abs(s.p / q.p - 1) >= num(S.scan.sep); })) top.push(s); });
    var lastDate = last(x).date, gd = function (d) { var s = String(d); return J.g2d(+s.slice(0, 4), +s.slice(4, 6), +s.slice(6, 8)); }, d0 = gd(lastDate);
    var tradingPerCal = (gd(lastDate) - gd(x[0].date)) / Math.max(1, N - 1);       // calendar days per bar
    out.cycles = top.map(function (s) {
      var ph = Math.atan2(s.b, s.a), cur = (2 * Math.PI * (N - 1) / s.p - ph) % (2 * Math.PI); if (cur < 0) cur += 2 * Math.PI;   // fitted cos phase; trough at π
      var toTrough = ((Math.PI - cur) / (2 * Math.PI) * s.p + s.p) % s.p, toPeak = ((2 * Math.PI - cur) / (2 * Math.PI) * s.p) % s.p, half = Math.round(s.p / 2);
      var fld = N > half ? x[N - 1 - half].close : NaN;
      return { period: s.p, calDays: Math.round(s.p * tradingPerCal), strength: s.rel, phase: cur / (2 * Math.PI), nextTrough: J.jstr(d0 + Math.round(toTrough * tradingPerCal)), nextPeak: J.jstr(d0 + Math.round(toPeak * tradingPerCal)),
        barsToTrough: Math.round(toTrough), fld: fld, aboveFld: last(x).close > fld };
    });
    out.scan = scan; out.close = last(x).close; out.asOf = J.jstr(d0);
    if (top.length > 1 && top[0].amp / top[1].amp < 1.15) out.checks.push({ level: 'warning', msg: 'The strongest cycles have similar amplitude: likely noise rather than a dominant cycle.' });
    // Gann square of nine
    var base = num(S.sq9.base) || last(x).close, rt = Math.sqrt(base); out.sq9 = [];
    for (var k = -4; k <= 4; k++) for (var ang = 45; ang <= 360; ang += 45) { if (k === 0 && ang === 360) continue; var lvl = Math.pow(rt + k * ang / 180, 2); if (lvl > 0) out.sq9.push({ turn: k, angle: ang, level: lvl, dist: lvl / out.close - 1 }); }
    out.sq9.sort(function (u, v) { return u.level - v.level; });
    // time windows: Gann day counts and Fibonacci ratios from pivots
    var piv = (S.pivots || []).map(function (q) { return { label: q.label, d: J.parse(q.date), price: num(q.price) }; }).filter(function (q) { return isFinite(q.d); });
    var W = [];
    String(S.gannDays).split(',').map(Number).filter(function (v) { return v > 0; }).forEach(function (g) { piv.forEach(function (q) { W.push({ date: q.d + g, kind: 'Gann ' + g + ' days', from: q.label }); }); });
    if (piv.length >= 2) { var A0 = piv[piv.length - 2], B0 = piv[piv.length - 1], Dd = B0.d - A0.d;
      String(S.fibs).split(',').map(Number).filter(function (v) { return v > 0; }).forEach(function (f) { W.push({ date: B0.d + Math.round(Dd * f), kind: 'Fibonacci ' + f + ' × ' + Dd + ' days', from: A0.label + ' → ' + B0.label }); }); }
    out.cycles.forEach(function (c) { W.push({ date: J.parse(c.nextTrough), kind: 'Cycle ' + c.period + ' bars · trough', from: 'cycle scan' }); });
    out.windows = W.filter(function (w) { return w.date >= d0 - 5; }).sort(function (u, v) { return u.date - v.date; }).slice(0, 30).map(function (w) { return { date: J.jstr(w.date), days: w.date - d0, kind: w.kind, from: w.from }; });
    // clusters: windows within 5 days of each other
    out.windows.forEach(function (w, i) { w.cluster = out.windows.filter(function (v) { return Math.abs(v.days - w.days) <= 5; }).length; });
    if (!piv.length) out.checks.push({ level: 'info', msg: 'Add pivot dates (major highs / lows) for Gann and Fibonacci time windows.' });
    out.checks.push({ level: 'info', msg: 'Cycle analysis is revisable: the dominant period moves as data is added. Treat windows as a checklist, not trading signals.' });
    if (S.meta.source && /synthetic/i.test(S.meta.source)) out.checks.push({ level: 'info', msg: 'Showing illustrative synthetic data. Press Fetch.' });
    return out;
  }
  // pivots and the square-of-nine base follow the fetched series (they used to stay on the sample's values after a fetch)
  function tempAuto(S) {
    var px = (S.data && S.data.series) || [], LV = Hub.longView, J = Hub.jalali; if (!LV || px.length < 30) return;
    var toJ = function (d) { var t = String(d); return J.jstr(J.g2d(+t.slice(0, 4), +t.slice(4, 6), +t.slice(6, 8))); }, P = LV.autoPivots(px, 300);
    S.pivots = P.map(function (q) { return { label: q.kind === 'low' ? 'Major low' : 'Major high', date: toJ(q.date), price: Math.round(q.price * 100) / 100 }; });
    var lo = P.filter(function (q) { return q.kind === 'low'; })[0]; if (lo) S.sq9.base = Math.round(lo.price * 100) / 100;
  }
  function tempFetch(S) {
    var s = S.series, code = null, p = s.source === 'tse-index' ? Hub.data.tse.index(s.key) : s.source === 'tse' ? Hub.data.tse.resolve(s.key).then(function (c) { code = c; return Hub.data.tse.daily(c, 1200); }) : Hub.data.tgju(s.key);
    // today's value from the shared session snapshot / TGJU current prices (provisional until the day is published)
    var lv = s.source === 'tgju' ? (Hub.data.tgjuNow ? Hub.data.tgjuNow().catch(function () { return null; }) : Promise.resolve(null)) : (Hub.data.tse.session ? Hub.data.tse.session().catch(function () { return null; }) : Promise.resolve(null));
    return Promise.all([p, lv]).then(function (q) { var r = q[0], L = q[1], l = r[r.length - 1], c = null;
      if (L && s.source === 'tgju' && L[s.key]) c = L[s.key]; else if (L && s.source === 'tse-index') { var v = s.key === '32097828799138957' ? L.idx.total : s.key === '67130298613737946' ? L.idx.ew : NaN; if (v > 0) c = { date: L.date, close: v, high: v, low: v }; } else if (L && s.source === 'tse' && code && L.by[String(code)] && L.by[String(code)].trades > 0) c = L.by[String(code)];
      if (c && l && (c.date > l.date || (c.date === l.date && l.live))) { var row = Object.assign({}, l.date === c.date ? l : {}, { date: c.date, open: l.date === c.date ? l.open : c.close, high: c.high, low: c.low, close: c.close, live: 1 }); r = r.slice(); if (l.date === c.date) r[r.length - 1] = row; else r.push(row); }
      return r; }).then(function (r) { S.data = { series: r }; stampData(S, s.source === 'tgju' ? 'TGJU' : 'TSETMC'); if (S.autoPiv !== false) tempAuto(S); return []; });
  }

  /* ---------- CSV paste (Series, Date, Open, High, Low, Close[, Volume, Value]) ---------- */
  function parseCSV(text) {
    var out = {}, U = Hub.util;
    String(text).replace(/\r/g, '').split('\n').forEach(function (line) {
      var c = line.split(/\t|,|;/).map(function (x) { return x.trim(); }); if (c.length < 3) return;
      var d = String(U.normaliseDigits ? U.normaliseDigits(c[1]) : c[1]).replace(/[\/.]/g, '-'), m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(d); if (!m) return;
      var y = +m[1], date; if (y < 1700) { var g = Hub.jalali.d2g(Hub.jalali.j2d(y, +m[2], +m[3])); date = g.gy * 10000 + g.gm * 100 + g.gd; } else date = y * 10000 + +m[2] * 100 + +m[3];
      var v = c.slice(2).map(function (x) { return U.parseNum(x); }); var close = v.length >= 4 ? v[3] : v[0]; if (!(close > 0)) return;
      (out[c[0]] = out[c[0]] || []).push({ date: date, open: v.length >= 4 ? v[0] : close, high: v.length >= 4 ? v[1] : close, low: v.length >= 4 ? v[2] : close, close: close, yclose: NaN, vol: v[4] || 0, val: v[5] || (v[4] || 0) * close });
    });
    Object.keys(out).forEach(function (k) { out[k].sort(function (a, b) { return a.date - b.date; }); out[k].forEach(function (r, i, a) { r.yclose = i ? a[i - 1].close : r.open; }); });
    return out;
  }

  /* ---------- Excel (values at export) ---------- */
  function sheetTable(b, name, title, heads, rows, fmts, widths) {
    var X = Hub.xl, sh = b.sheet(name, widths || [2].concat(heads.map(function () { return 14; })));
    sh.title(title, 'Values at export · ' + new Date().toISOString().slice(0, 16).replace('T', ' '));
    heads.forEach(function (hh, j) { sh.put(1 + j, 4, hh, 'hdr'); });
    rows.forEach(function (r, i) { r.forEach(function (v, j) { sh.put(1 + j, 5 + i, v == null || (typeof v === 'number' && !isFinite(v)) ? null : v, null, typeof v === 'number' ? (fmts[j] || 'dec') : null); }); });
    return sh;
  }
  function settingsSheet(b, S) { sheetTable(b, 'Settings', 'Model settings', ['Key', 'Value', 'Note'], S.set.map(function (r) { return [r.key, num(r.value), r.note]; }), [null, 'dec4'], [2, 22, 16, 80]); }

  var FEEDS = [];
  /* feed status, shared by the data centre (trading engine) and the pages that only show data ages (moved from trading-engine.js) */
  var FEEDIDS = ['sig-stocks', 'sig-gold', 'sig-fx', 'sig-options'];
  var FAT = { 'sig-stocks': 'سهام و صندوق‌ها (TSETMC)', 'sig-gold': 'طلا و سکه (TGJU)', 'sig-fx': 'ارز و تتر (TGJU)', 'sig-options': 'اختیار معامله (TSETMC)' };
  function feed(id) { return FEEDS.filter(function (f) { return f.id === id; })[0]; }
  function loadFeed(f) { var s = Hub.util.store.get(f.storeKey, null); return s && s.version === 1 ? s : f.sample(); }
  function feedState(f) { var S = loadFeed(f), live = S.meta && S.meta.source && !/synthetic|illustrative/i.test(S.meta.source), age = dataAge(S); return { S: S, live: live, age: age, k: !live ? 'none' : (!isFinite(age) || age > maxAgeH() ? 'stale' : 'fresh') }; }
  function agesText() {
    var sn = {}, ages = FEEDIDS.map(feed).concat(FEEDS).filter(function (f) { if (!f || sn[f.id]) return false; sn[f.id] = 1; return true; }).map(function (f) { var st = feedState(f); return (FAT[f.id] || ({ 'sig-temporal': 'تحلیل زمانی', 'long-view': 'اقتصاد ایران', 'sig-global': 'جهانی و رمزارز' })[f.id] || f.title).replace(/ \(.*\)/, '') + ': ' + (st.k === 'none' ? 'نمونه' : ageText(st.age)); }).join(' · ');
    return ages; }
  Hub.signals = { FEEDIDS: FEEDIDS, FAT: FAT, feed: feed, loadFeed: loadFeed, feedState: feedState, agesText: agesText, feeds: FEEDS, safeFetch: safeFetch, summErr: summErr, maxAgeH: maxAgeH, stampData: stampData, dataAge: dataAge, ageText: ageText, adjust: adjust, trendBlock: trendBlock, ewmaVol: ewmaVol, varRatio: varRatio, ichimoku: ichimoku, donchian: donchian, rsi: rsi, levels: levels, bs: bs, impliedVol: impliedVol, synth: synth, parseCSV: parseCSV,
    stocks: { sample: stocksSample, run: stocksRun, fetch: stocksFetch, WATCH: WATCH, mergeWatch: mergeWatch, mergeUniverse: mergeUniverse }, gold: { sample: goldSample, run: goldRun, fetch: function (S, pr) { return tgjuFetch(S, keysOf(S, ['ons', 'price_dollar_rl']), pr); } }, fx: { sample: fxSample, run: fxRun, fetch: function (S, pr) { return tgjuFetch(S, keysOf(S, ['price_dollar_rl']), pr); } }, options: { sample: optSample, run: optRun, fetch: optFetch, shamsi: shamsi, UNDS: OPT_UNDS }, temporal: { sample: tempSample, run: tempRun, fetch: tempFetch } };
  var act = function (a) { return a.filter(function (x) { return x.active !== false && (x.symbol || x.key); }).length; };
  FEEDS.push({ id: 'sig-stocks', title: 'Stock Signals (TSE)', storeKey: 'hub.sigstocks.v1', sample: stocksSample, fetch: stocksFetch, size: function (S) { var L = Object.keys(S.data || {}).filter(function (k) { return k[0] !== '_' && S.data[k] && S.data[k].px; }).map(function (k) { return S.data[k].px.length; }).sort(function (a, b) { return a - b; }); return act(S.watch) + (isFa() ? ' نماد' : ' symbols') + (L.length ? (isFa() ? ' · تاریخچهٔ میانه ' : ' · median history ') + L[Math.floor(L.length / 2)] + (isFa() ? ' جلسه' : ' sessions') : ''); }, src: 'TSETMC + TGJU' });
  FEEDS.push({ id: 'sig-options', title: 'Options Signals (TSE)', storeKey: 'hub.sigoptions.v1', sample: optSample, fetch: optFetch, size: function (S) { return (act(S.contracts) + act(S.chain || [])) + (isFa() ? ' قرارداد' : ' contracts'); }, src: 'TSETMC' });
  FEEDS.push({ id: 'sig-temporal', title: 'Temporal Analysis (cycles & time windows)', storeKey: 'hub.sigtemporal.v1', sample: tempSample, fetch: function (S) { return tempFetch(S); }, size: function () { return isFa() ? 'یک سری' : '1 series'; }, src: 'TSETMC / TGJU' });
  if (typeof module !== 'undefined' && module.exports) module.exports = Hub.signals;
  if (!root.document || !Hub.toolkit) return;

  /* ======================= UI ======================= */
  var U = Hub.util, h = U.h, G = Hub.grid, TK = Hub.toolkit;
  var SIGCLS = function (s) { return /^Strong buy/.test(s) ? 'sig-sb' : /^Buy/.test(s) ? 'sig-b' : /^Strong sell/.test(s) ? 'sig-ss' : /^Sell/.test(s) ? 'sig-s' : 'sig-h'; };
  function table(heads, rows, numFrom, rowCls) {
    var tb = h('table', { class: 'grid list sig-t' }, [h('thead', null, [h('tr', null, heads.map(function (x) { return h('th', { text: x }); }))])]), bd = h('tbody');
    rows.forEach(function (r, ri) { bd.appendChild(h('tr', { class: rowCls ? rowCls(ri) : '' }, r.map(function (x, i) {
      if (x && x.nodeType) return h('td', null, [x]);
      return h('td', { class: i >= numFrom ? 'num' : 'txt', text: x == null || (typeof x === 'number' && !isFinite(x)) ? '–' : String(x) }); }))); });
    tb.appendChild(bd); return h('div', { class: 'grid-wrap' }, [tb]);
  }
  var fN = function (x, d) { return isFinite(x) ? U.fmtNum(x, d || 0) : '–'; }, fP = function (x, d) { return isFinite(x) ? U.fmtPct(x, d == null ? 1 : d) : '–'; }, fS = function (x) { return isFinite(x) ? (x > 0 ? '+' : '') + x.toFixed(1) : '–'; };
  var chip = function (s) { return h('span', { class: 'sig-chip ' + SIGCLS(s), text: s }); };
  /* ---- directive 22: everything these pages show as a verdict, rank, price level or version is the central record (Hub.central).
     The tool's own score and label are model inputs of the engine, shown as such — never as a signal. ---- */
  var CN = function () { return Hub.central; };
  function cenView(key) { var C = CN(), r = C && C.rec(key); return r ? C.present(Object.assign({ key: key }, r)) : null; }
  var SELLA = { close: 1, sell: 1, reduce: 1 };
  function cenChip(p, key) { if (!p) return h('span', { class: 'sig-chip sig-h', 'data-notr': '1', text: 'خارج از موتور مرکزی', title: CN() ? CN().whyNot(key) : '' });
    return h('span', { class: 'sig-chip ' + (p.tier === 'ok' ? 'sig-b' : SELLA[p.act] ? 'sig-s' : 'sig-h'), 'data-notr': '1', text: p.actFa + ' — ' + p.stFa }); }
  // the rows of a tool page, in the one central order; also what the integrity monitor reads (same function → same content)
  function cenRows(items) { var C = CN(), G0 = C && C.get(), by = G0 && G0.by || {}; var L = items.map(function (it) { var r = by[it.key]; return { key: it.key, sym: it.sym, p: r ? C.present(Object.assign({ key: it.key }, r)) : null, m: it.m }; });   // the stored record is read once per list
    return L.sort(function (a, b) { if (!a.p || !b.p) return (a.p ? 0 : 1) - (b.p ? 0 : 1) || String(a.sym).localeCompare(String(b.sym), 'fa'); return C.cmp(a.p, b.p); }); }
  function cenFacts(x) { var p = x.p; return { key: x.key, sym: x.sym, act: p ? p.act : null, st: p ? p.st : null, tier: p ? p.tier : null, rank: p ? p.rank : null, rankCls: p ? p.rankCls : null, px: p ? p.px : null, buy: p ? p.buy : null, stop: p ? p.stop : null, tp1: p && p.tp.length ? p.tp[0] : null, ver: p ? p.ver : null }; }
  var nC = function (x) { return isFinite(x) && x != null ? U.fmtNum(x, Math.abs(x) < 100 ? 2 : 0) : '–'; };
  function cenCells(x) { var p = x.p; if (!p) return ['–', cenChip(null, x.key), '–', '–', '–', '–', '–'];
    return [p.rank ? String(p.rank) : p.rankCls ? 'اختیار #' + p.rankCls : '–', cenChip(p, x.key), nC(p.px) + (p.date ? ' · ' + p.date : ''), p.buy ? nC(p.buy[0]) + ' – ' + nC(p.buy[1]) : '–', nC(p.stop), p.tp.length ? p.tp.slice(0, 2).map(nC).join(' · ') : '–', p.ver ? 'v' + p.ver : '–']; }
  var CENH = ['رتبهٔ مرکزی', 'حکم مرکزی (یکسان در همهٔ بخش‌ها)', 'قیمت مبنا · تاریخ', 'محدودهٔ ورود', 'حد ضرر', 'هدف ۱ · ۲', 'نسخهٔ سیگنال'];
  // the model's own label next to the central verdict: input of the engine, with the reason when the central decision differs
  function modelLbl(o, p) { var lab = o.signal || '–', buyish = /buy/i.test(lab), sellish = /sell/i.test(lab);
    if (!p) return lab + ' (ورودی مدل)'; var differs = buyish && p.tier !== 'ok' || sellish && !SELLA[p.act] && p.act !== 'none';
    return lab + (differs ? ' — حکم مرکزی متفاوت است: ' + String(p.why || p.stFa).slice(0, 140) : ''); }
  function cenCount(keys, f) { return keys.filter(function (k) { var p = cenView(k); return p && f(p); }).length; }
  // order tickets of a market: the central confirmed buys of that market, with the central levels (sizing: «ساخت سبد» of the engine)
  function cenTicketTab(keysOf, title) { return function (ctx) {
    var L = cenRows(keysOf(ctx).map(function (k) { return { key: k.key, sym: k.sym }; })).filter(function (x) { return x.p && x.p.tier === 'ok'; });
    var rows = L.map(function (x) { var p = x.p; return [p.rank ? String(p.rank) : '–', x.sym, p.actFa, p.buy ? nC(p.buy[0]) + ' – ' + nC(p.buy[1]) : '–', nC(p.stop), p.tp.map(nC).join(' · ') || '–', p.rr != null ? U.fmtNum(p.rr, 1) : '–', p.validUntil ? String(p.validUntil) : '–', 'v' + (p.ver || '–')]; });
    return ctx.group([ctx.panel('دستور معامله — ' + title + ' (از حکم مرکزی)', [h('p', { class: 'f-help', 'data-notr': '1', text: 'فقط خریدهای تأییدشدهٔ موتور مرکزی، با همان محدودهٔ ورود، حد ضرر، اهداف و نسخه‌ای که داشبورد معاملاتی و همهٔ بخش‌های دیگر نشان می‌دهند. حجم هر معامله در «ساخت سبد» معامله‌گری هوشمند تعیین می‌شود.' }),
      rows.length ? table(['رتبه', 'نماد', 'اقدام', 'محدودهٔ ورود', 'حد ضرر', 'اهداف', 'R:R', 'اعتبار تا', 'نسخه'], rows, 3) : h('p', { class: 'muted', 'data-notr': '1', text: 'اکنون در این بازار خرید تأییدشدهٔ مرکزی نیست؛ خرید نکردن تصمیم درست است.' })])]); }; }
  Hub.signals.cen = { rows: cenRows, facts: cenFacts, view: cenView };
  // the integrity monitor reads these pages through the same row builder they render from (directive 22 · 11)
  if (Hub.integrity) {
    var wsCons = function (storeKey, runFn, keyOf, symOf) { return function () { var S = U.store.get(storeKey, null); if (!S || !S.meta || !S.meta.source || /synthetic|illustrative/i.test(S.meta.source)) return null;
      // the page lists the active entries of its list; the model itself is not re-run here (it does not decide anything shown)
      var L = (S.watch || S.ins || []).filter(function (w) { return w.active !== false && (w.symbol || w.key); }); return { rows: cenRows(L.map(function (o) { return { key: keyOf(o), sym: symOf(o) }; })).map(cenFacts) }; }; };
    Hub.integrity.register('ws-stocks', 'معامله‌گری هوشمند — کارگاه سهام (سیگنال‌ها و دستور معامله)', wsCons('hub.sigstocks.v1', null, function (o) { return 's:' + o.symbol; }, function (o) { return o.symbol; }));
    Hub.integrity.register('ws-gold', 'معامله‌گری هوشمند — طلا و سکه', wsCons('hub.sig-gold.v1', null, function (o) { return 'g:' + o.key; }, function (o) { return o.series; }));
    Hub.integrity.register('ws-fx', 'معامله‌گری هوشمند — ارز', wsCons('hub.sig-fx.v1', null, function (o) { return 'g:' + o.key; }, function (o) { return o.series; }));
  }
  function settingsTab(ctx) { return ctx.group([ctx.panel('Model settings (from the workbook’s Settings sheet)', [h('p', { class: 'muted', text: 'Weights are structural, not optimised: treat them as hypotheses. Changes apply immediately.' }),
    ctx.list({ id: ctx.S.tool + '-set', path: 'set', cols: [{ key: 'key', label: 'Key', kind: 'text' }, { key: 'value', label: 'Value', fmt: 'num4' }, { key: 'note', label: 'Note', kind: 'text' }] })])]); }
  Hub.signals.fetchBar = function (ctx, fn, label) { return fetchBar(ctx, fn, label); };
  function fetchBar(ctx, fn, label) {
    var st = h('p', { class: 'muted', 'aria-live': 'polite' });
    var btn = h('button', { class: 'btn', type: 'button', text: label || 'Fetch live data', onclick: function () {
      btn.disabled = true; st.textContent = 'Fetching…';
      safeFetch(fn, ctx.S, function (i, n, s) { st.textContent = 'Fetching ' + i + ' / ' + n + ' · ' + s; }).then(function (errs) { setTimeout(function () { if (Hub.dataSync) Hub.dataSync.notify(); }, 1500);
        btn.disabled = false; ctx.rerender(); U.toast('Data loaded' + (errs && errs.length ? ' · ' + errs.length + ' failed' : ''), errs && errs.length ? 'warn' : 'good');
        if (errs && errs.length) st.textContent = (isFa() ? 'ناموفق: ' : 'Failed: ') + summErr(errs);
      }).catch(function (e) { btn.disabled = false; st.textContent = e.message + ' — if the call is refused, set a proxy on Data sources & keys.'; });
    } });
    var age = dataAge(ctx.S), stale = !isFinite(age) || age > maxAgeH(), live = ctx.S.meta.source && !/synthetic|illustrative/i.test(ctx.S.meta.source);
    var F = isFa(), badge = h('span', { class: 'data-age ' + (!live ? 'none' : stale ? 'stale' : 'fresh'), 'data-notr': '1', text: !live ? (F ? 'دادهٔ نمونه (فرضی) — پیش از استفاده از سیگنال‌ها دادهٔ زنده بگیرید' : 'Illustrative data — fetch live data before using the signals') : (stale ? (F ? 'کهنه: ' : 'Out of date: ') : (F ? 'به‌روز: ' : 'Updated ')) + ageText(age) + ' · ' + ctx.S.meta.asOf + ' · ' + ctx.S.meta.source });
    var route = Hub.data && Hub.data.route && Hub.data.route();
    // one data center: this section shows the state of its data and links there instead of fetching on its own
    if (Hub.dataCenterLink) btn = Hub.dataCenterLink(isFa() ? 'دادهٔ این بخش در «مرکز مدیریت داده‌ها» (داشبورد معامله‌گری) به‌روز می‌شود؛ همهٔ بخش‌ها از همان دادهٔ مشترک می‌خوانند.' : 'This section is updated from the central data center (trading dashboard).');
    return h('div', null, [h('div', { class: 'row-ctl' }, [btn, badge]), st, route && route.at ? h('p', { class: 'muted small', 'data-notr': '1', text: (F ? 'آخرین مسیر موفق: ' : 'Last route that worked: ') + route.name + ' (' + (route.host || '') + ')' }) : null, h('p', { class: 'muted small', 'data-notr': '1' }, [document.createTextNode(F ? 'همهٔ خوراک‌های داده، عمرشان و به‌روزرسانی یک‌جا: ' : 'All feeds, their age and one-click update: '), h('a', { href: '#market-data', text: F ? 'مرکز دادهٔ بازار' : 'Market data centre' })])]);
  }
  function pasteBox(ctx, apply) {
    var ta = h('textarea', { class: 'f-area', rows: 4, placeholder: 'Series, Date, Open, High, Low, Close, Volume, Value\nفولاد, 1405/07/20, 5200, 5310, 5150, 5280, 120000000, 633600000000' });
    var go = h('button', { class: 'btn ghost', type: 'button', text: 'Import pasted history', onclick: function () { var d = parseCSV(ta.value), k = Object.keys(d); if (!k.length) { U.toast('No rows recognised', 'warn'); return; } apply(d); stampData(ctx.S, 'Pasted data'); ta.value = ''; ctx.rerender(); U.toast(k.length + ' series imported', 'good'); } });
    return ctx.panel('Paste history instead (Excel or CSV)', [h('p', { class: 'muted', text: 'One row per day: series name, date (Shamsi or Gregorian), open, high, low, close, and for stocks volume and value. Works offline; money flow needs the TSETMC fetch.' }), ta, h('div', { class: 'row-ctl' }, [go])]);
  }
  function checksPanel(ctx) { var ul = h('ul', { class: 'checks' }); (ctx.R.checks.length ? ctx.R.checks : [{ level: 'good', msg: 'No issues.' }]).forEach(function (c) { ul.appendChild(h('li', { class: c.level, text: c.msg })); }); return ctx.panel('Checks', [ul]); }

  /* ----- Stocks ----- */
  TK.define({
    id: 'sig-stocks', title: 'Stock Signals (TSE)', sections: ['signals', 'trading'], priority: 1, version: 1, storeKey: 'hub.sigstocks.v1',
    summary: 'Medium-term signals for a TSE watchlist: trend, individual vs institutional money flow, volume, market regime, Ichimoku and Donchian gates, EWMA sizing and stops, support and resistance.',
    sample: stocksSample, blank: function () { var s = stocksSample(); s.data = {}; s.meta.source = ''; return s; }, run: stocksRun,
    eyebrow: function () { return 'Signals · Stocks · TSETMC'; }, heading: function (S) { return S.meta.title; }, filename: function () { return 'Signals_Stocks'; },
    xlsx: function (S, R) { var b = Hub.xl.book(root.ExcelJS);
      sheetTable(b, 'Signals', 'Stock signals · regime ' + R.regime.toFixed(2) + ' · market ' + R.heat, ['Symbol', 'Name', 'Sector', 'Price', 'Change', 'Trend', 'Money', 'Volume', 'Base', 'Score (−10..+10)', 'Signal', 'Strength', 'Percentile', 'Stop', 'Vol stop', 'Weight', 'EWMA vol', 'Ichimoku', 'Donchian', 'VR60', 'Net indiv. 5d', 'Net indiv. 20d', 'Support', 'Resistance', 'Why'],
        R.rows.map(function (o) { return [o.symbol, o.name, o.sector, o.price, o.chg, o.trend, o.money, o.volume, o.base, o.score, o.signal, o.strength, o.pct, o.stop, o.volStop, o.weight, o.vol, o.ich ? o.ich.score : null, o.don ? o.don.score : null, o.vr, o.net5, o.net20, o.lv && o.lv.support, o.lv && o.lv.resistance, o.why]; }),
        [null, null, null, 'money', 'pct', 'dec', 'dec', 'dec', 'dec', 'dec', null, 'int', 'pct', 'money', 'money', 'pct', 'pct', 'dec', 'int', 'dec', 'money', 'money', 'money', 'money'], [2, 10, 22, 14, 12, 9, 8, 8, 8, 8, 10, 30, 8, 9, 12, 12, 8, 9, 9, 9, 8, 16, 16, 12, 12, 50]);
      settingsSheet(b, S);
      Hub.xl.notes(b, ['Port of Signal_Stocks.xlsm: trend 45%, money flow 40%, volume 15% on −2…+2, plus market regime × 0.20, ×5 to −10…+10.', 'Strong buy needs: score ≥ threshold, top percentile, positive relative strength, non-negative 60-day dollar return, market not very stretched, Donchian ≥ +1.',
        'Guards: liquidity, data sufficiency, queue, Ichimoku cloud (price must be above the cloud), bear-regime lock, heat gate.', 'Prices back-adjusted with TSETMC yesterday prices. Money flow uses individual (حقیقی) values; institutional is its mirror and is not scored separately.',
        'Weights are structural, not back-tested, except the cloud guard and Donchian condition (out-of-sample test reported in the workbook).', 'Not investment advice.'], {});
      return b.wb; },
    kpis: function (ctx) { var R = function () { return ctx.R; }; return [
      ['Market regime', function () { return R().regime.toFixed(2); }, function () { var r = R().regime; return r >= 1.1 ? 'strong up' : r >= 0.35 ? 'up' : r <= -1.1 ? 'strong down' : r <= -0.35 ? 'down' : 'neutral'; }],
      ['Market heat', function () { return R().heat; }, function () { return R().T ? 'vs MA50 ' + fP(R().T.dev50) + ' · 60d ' + fP(R().T.ret60) : 'no index data'; }],
      ['خرید تأییدشدهٔ مرکزی', function () { return String(cenCount(R().rows.map(function (o) { return 's:' + o.symbol; }), function (p) { return p.tier === 'ok'; })); }, function () { return 'از حکم موتور مرکزی (همان داشبورد)'; }],
      ['فروش / خروج مرکزی', function () { return String(cenCount(R().rows.map(function (o) { return 's:' + o.symbol; }), function (p) { return !!SELLA[p.act]; })); }, function () { return 'از حکم موتور مرکزی'; }],
      ['Names', function () { return String(R().rows.length); }, function () { return R().rows.filter(function (o) { return o.valid; }).length + ' with valid data'; }]]; },
    tabs: [
      { group: 'Inputs', items: [['watch', 'Watchlist & data', function (ctx) {
        var lst = ctx.list({ id: 'ss-w', path: 'watch', newRow: function () { return { symbol: '', name: '', insCode: '', sector: '', active: true }; }, cols: [{ key: 'symbol', label: 'Symbol', kind: 'text' }, { key: 'name', label: 'Name', kind: 'text' }, { key: 'insCode', label: 'InsCode (blank = find)', kind: 'text' }, { key: 'sector', label: 'Sector', kind: 'text' }, { key: 'market', label: 'Market', kind: 'select', options: function () { return [['', '—'], ['بورس', 'بورس'], ['فرابورس', 'فرابورس'], ['بازار پایه', 'بازار پایه']]; } }, { key: 'board', label: 'Base-market board', kind: 'select', options: function () { return [['', '—'], ['زرد', 'زرد ±۳٪'], ['نارنجی', 'نارنجی ±۲٪'], ['قرمز', 'قرمز ±۱٪']]; } }, { key: 'ftype', label: 'Fund type', kind: 'select', options: function () { return [['', '—'], ['etf', 'سهامی'], ['lev', 'اهرمی'], ['gold', 'طلا/کالایی'], ['fixed', 'درآمد ثابت']]; } }, { key: 'lim', label: 'Own price limit (blank = by market)', kind: 'num', fmt: 'pct', optional: true }, { key: 'active', label: 'Active', kind: 'bool' }] });
        return ctx.group([ctx.panel('Live data', [fetchBar(ctx, stocksFetch, 'Fetch TSETMC (prices, حقیقی/حقوقی, indices) + TGJU dollar'), h('p', { class: 'muted', text: 'Three requests per symbol; about a minute for 60 names. Runs from the hub on your computer (the artifact preview blocks outside calls). InsCodes from your workbook are prefilled.' })]),
          ctx.panel('Watchlist', [lst]), pasteBox(ctx, function (d) { Object.keys(d).forEach(function (k) { ctx.S.data[k] = { px: d[k], ct: (ctx.S.data[k] || {}).ct || [] }; }); })]);
      }], ['set', 'Settings', settingsTab]] },
      { group: 'Outputs', items: [['tick', 'Order tickets', cenTicketTab(function (ctx) { return ctx.R.rows.map(function (o) { return { key: 's:' + o.symbol, sym: o.symbol }; }); }, 'سهام و صندوق‌ها')], ['sig', 'Signals', function (ctx) {
        var wrap = h('div');
        // directive 22: the verdict, rank, levels and version are the central record's; the workbook score is a model input of the engine
        function paint() { U.clear(wrap); var R = ctx.R, L = cenRows(R.rows.map(function (o) { return { key: 's:' + o.symbol, sym: o.symbol, m: o }; }));
          wrap.appendChild(h('div', { class: 'callout', 'data-notr': '1', text: 'حکم، رتبه، محدودهٔ ورود، حد ضرر، اهداف و نسخهٔ هر سیگنال از مرجع مرکزی می‌آید و با داشبورد معاملاتی و همهٔ بخش‌ها یکسان است (ترتیب: رتبهٔ مرکزی). امتیاز و برچسب «مدل کارگاه سهام» فقط ورودی تحلیلی موتور مرکزی‌اند و سیگنال معاملاتی نیستند؛ اگر با حکم مرکزی فرق داشته باشند، علت کنار آن آمده است.' }));
          wrap.appendChild(table(['نماد'].concat(CENH, ['ورودی تحلیل: امتیاز مدل کارگاه', 'برچسب مدل کارگاه (سیگنال نیست)', 'Trend', 'Money', 'Vol.', 'Why (model)']),
            L.map(function (x) { var o = x.m, c = cenCells(x); return [x.sym].concat(c, [fS(o.score), modelLbl(o, x.p), fS(o.trend), fS(o.money), fS(o.volume), o.why || '']); }), 3)); }
        paint();
        return { el: h('div', { class: 'stack' }, [ctx.panel('سیگنال‌ها (از مرجع مرکزی، به ترتیب رتبهٔ مرکزی)', [wrap]), checksPanel(ctx)]), refresh: paint };
      }], ['detail', 'Model detail', function (ctx) {
        var wrap = h('div');
        function paint() { U.clear(wrap); var R = ctx.R;
          wrap.appendChild(table(['Symbol', 'MA struct', 'Slope', 'Channel', 'RS', 'Mom', 'Net5', 'Net20', 'Buyer power', 'Intensity', 'Persist', 'Queue', 'Ichimoku', 'Cloud', 'Donchian', 'VR60', 'Eff. ratio', 'EWMA vol', 'RSI14', '$ 60d'],
            R.rows.filter(function (o) { return o.tb; }).map(function (o) { var m = o.ms || {}; return [o.symbol, fS(o.tb.s.struct), fS(o.tb.s.slope), fS(o.tb.s.chan), fS(o.tb.s.rs), fS(o.tb.s.mom), fS(m.net5), fS(m.net20), fS(m.bp), fS(m.int), fS(m.per), o.queue || '–',
              o.ich ? fS(o.ich.score) : '–', o.ich ? (o.ich.pos === 1 ? 'above' : o.ich.pos === -1 ? 'below' : 'inside') : '–', o.don ? o.don.score : '–', fN(o.vr, 2), fN(o.er, 2), fP(o.vol), fN(o.rsi, 0), fP(o.usd60)]; }), 1)); }
        paint();
        var mk = G.form({ id: 'ss-m', fields: [
          { key: 'a', label: 'Total index · structure / slope', calc: function () { var T = ctx.R.T; return T ? fS(T.struct) + ' / ' + fS(T.slope) : '–'; } },
          { key: 'b', label: 'Equal-weight index · structure / slope', calc: function () { var E = ctx.R.E; return E ? fS(E.struct) + ' / ' + fS(E.slope) : '–'; } },
          { key: 'c', label: 'Watchlist breadth', calc: function () { return fS(ctx.R.breadth); } },
          { key: 'd', label: 'Dollar · 60-day return', calc: function () { return fP(ctx.R.usdRet60); } }] });
        return { el: h('div', { class: 'stack' }, [ctx.panel('Market regime', [mk]), ctx.panel('Sub-scores (−2…+2) and unweighted measures', [wrap])]), refresh: function () { paint(); mk.refresh(); } };
      }]] }]
  });

  /* ----- Gold and FX share a layout ----- */
  function simpleTool(cfg) {
    var feedFetch = function (S, pr) { if (cfg.ensureIns) cfg.ensureIns(S); return tgjuFetch(S, S.ins.filter(function (x) { return x.active !== false && x.key; }).map(function (x) { return x.key; }).concat(cfg.alwaysKeys || []).filter(function (k, i, a) { return a.indexOf(k) === i; }), pr); };
    FEEDS.push({ id: cfg.id, title: cfg.title, storeKey: 'hub.' + cfg.id + '.v1', sample: cfg.sample, fetch: feedFetch, size: function (S) { return act(S.ins) + (isFa() ? ' سری' : ' series'); }, src: 'TGJU' });
    TK.define({
      id: cfg.id, title: cfg.title, sections: ['signals', 'trading'], priority: cfg.priority, version: 1, storeKey: 'hub.' + cfg.id + '.v1', summary: cfg.summary,
      sample: cfg.sample, blank: function () { var s = cfg.sample(); s.data = {}; s.meta.source = ''; return s; }, run: cfg.run,
      eyebrow: function () { return cfg.eyebrow; }, heading: function (S) { return S.meta.title; }, filename: function () { return cfg.file; },
      xlsx: function (S, R) { var b = Hub.xl.book(root.ExcelJS);
        sheetTable(b, 'Signals', cfg.title, cfg.xHeads, R.rows.map(cfg.xRow), cfg.xFmt);
        settingsSheet(b, S); Hub.xl.notes(b, cfg.notes, {}); return b.wb; },
      kpis: function (ctx) { var R = function () { return ctx.R; }; return [
        ['برترین فرصت مرکزی', function () { var x = cenRows(R().rows.map(function (o) { return { key: 'g:' + o.key, sym: o.series }; }))[0]; return x && x.p ? x.sym : '–'; }, function () { var x = cenRows(R().rows.map(function (o) { return { key: 'g:' + o.key, sym: o.series }; }))[0]; return x && x.p ? x.p.actFa + ' — ' + x.p.stFa : ''; }],
        ['خرید تأییدشدهٔ مرکزی', function () { return String(cenCount(R().rows.map(function (o) { return 'g:' + o.key; }), function (p) { return p.tier === 'ok'; })); }, function () { return 'از ' + R().rows.length + ' سری'; }],
        ['فروش / خروج مرکزی', function () { return String(cenCount(R().rows.map(function (o) { return 'g:' + o.key; }), function (p) { return !!SELLA[p.act]; })); }, function () { return 'از حکم موتور مرکزی'; }],
        [cfg.kpiLabel, function () { return cfg.kpi(R()); }, function () { return cfg.kpiSub; }]]; },
      tabs: [
        { group: 'Inputs', items: [['ins', 'Instruments & data', function (ctx) {
          var lst = ctx.list({ id: cfg.id + '-i', path: 'ins', newRow: cfg.newRow, cols: cfg.cols });
          return ctx.group([ctx.panel('Live data', [fetchBar(ctx, function (S, pr) { return tgjuFetch(S, S.ins.filter(function (x) { return x.active !== false && x.key; }).map(function (x) { return x.key; }).concat(cfg.alwaysKeys || []).filter(function (k, i, a) { return a.indexOf(k) === i; }), pr); }, 'Fetch TGJU')]),
            ctx.panel('Instruments (TgjuKey = last part of the tgju.org page address)', [lst]), pasteBox(ctx, function (d) { Object.keys(d).forEach(function (k) { var x = ctx.S.ins.filter(function (i) { return i.series === k || i.key === k; })[0]; ctx.S.data[x ? x.key : k] = d[k]; }); })]);
        }], ['set', 'Settings', settingsTab]] },
        { group: 'Outputs', items: [['tick', 'Order tickets', cenTicketTab(function (ctx) { return ctx.R.rows.map(function (o) { return { key: 'g:' + o.key, sym: o.series }; }); }, cfg.title)], ['sig', 'Signals', function (ctx) {
          var wrap = h('div');
          // directive 22: central verdict / rank / levels first; the tool's own columns after it as model inputs (cfg.heads[0] = series, [1] = model label)
          function paint() { U.clear(wrap); var L = cenRows(ctx.R.rows.map(function (o) { return { key: 'g:' + o.key, sym: o.series, m: o }; }));
            wrap.appendChild(h('div', { class: 'callout', 'data-notr': '1', text: 'حکم، رتبه، سطوح و نسخه از مرجع مرکزی (یکسان با داشبورد معاملاتی). ستون‌های بعدی ورودی تحلیلی مدل همین ابزارند و سیگنال نیستند.' }));
            wrap.appendChild(table([cfg.heads[0]].concat(CENH, ['برچسب مدل (سیگنال نیست)', 'امتیاز مدل'], cfg.heads.slice(4)), L.map(function (x) { var o = x.m, r = cfg.row(o); return [r[0]].concat(cenCells(x), [modelLbl(o, x.p), r[2]], r.slice(4)); }), 3)); }
          paint();
          var legend = h('p', { class: 'f-help', 'data-notr': '1', text: isFa() ? 'راهنمای ستون‌ها: «روز تا سررسید» = تعداد روز تقویمی تا سررسید · «قیمت پایه (S)» = آخرین قیمت سهم یا صندوق پایه · «قیمت اعمال (K)» = قیمتی که در سررسید می‌توانید سهم را به آن بخرید (اختیار خرید) یا بفروشید (اختیار فروش) · «قیمت اختیار» = قیمت هر واحد قرارداد (میانگین بهترین تقاضا و عرضه؛ اگر نبود، آخرین معامله) · نقدشوندگی A/B = قابل خرید و فروش، C = نامناسب · IV = نوسان ضمنی از قیمت اختیار · RV = نوسان واقعی ۲۰ روزهٔ پایه. دستور خرید و فروش هر قرارداد پیشنهادی در زبانهٔ «دستور معامله» است.' : 'Columns: Days to expiry · S = underlying price · K = strike · Option price = mid of best bid/ask (else last trade) · Liquidity A/B tradable, C not · IV implied, RV realised 20-day. Order tickets are on the «Order tickets» tab.' });
        return { el: h('div', { class: 'stack' }, [ctx.panel('سیگنال‌ها (از مرجع مرکزی)', [legend, wrap]), checksPanel(ctx)]), refresh: paint };
        }]] }]
    });
  }
  simpleTool({ id: 'sig-gold', title: 'Gold & Coin Signals', priority: 2, file: 'Signals_Gold', eyebrow: 'Signals · Gold, coins and ounce · TGJU', sample: goldSample, run: goldRun, alwaysKeys: ['ons', 'price_dollar_rl'],
    // series added to the default list after a store was created are added to that store on its next update (the user's own rows are kept)
    ensureIns: function (S) { S.ins = S.ins || []; GOLD_INS.forEach(function (x) { if (!S.ins.some(function (i) { return i.key === x[1]; })) S.ins.push({ series: x[0], key: x[1], type: x[2], grams: x[3], purity: x[4], active: true }); }); },
    summary: 'Gold, coins and ounce: trend plus bubble z-score against intrinsic value (ounce / 31.1035 × grams × purity × free-market dollar).',
    newRow: function () { return { series: '', key: '', type: 'Coin', grams: 0, purity: 0.9, active: true }; },
    cols: [{ key: 'series', label: 'Series', kind: 'text' }, { key: 'key', label: 'TgjuKey', kind: 'text' }, { key: 'type', label: 'Type', kind: 'text' }, { key: 'grams', label: 'Weight (g)', fmt: 'num4' }, { key: 'purity', label: 'Purity', fmt: 'num4' }, { key: 'active', label: 'Active', kind: 'bool' }],
    heads: ['Series', 'Signal', 'Score', 'Str.', 'Price', 'Chg', 'Intrinsic', 'Bubble', 'z', 'Trend', 'Bubble score', 'Support · resistance', 'Why'],
    row: function (o) { return [o.series, chip(o.signal), fS(o.score), o.strength || '–', fN(o.price), fP(o.chg), fN(o.intrinsic), fP(o.bubble), fN(o.z, 2), fS(o.trend), fS(o.bubbleScore), o.lv ? fN(o.lv.support) + ' · ' + fN(o.lv.resistance) : '–', o.why || '']; },
    kpiLabel: 'Coin bubble', kpi: function (R) { var o = R.rows.filter(function (x) { return /امامی/.test(x.series); })[0]; return o ? fP(o.bubble) : '–'; }, kpiSub: 'Emami coin vs intrinsic',
    xHeads: ['Series', 'Type', 'Price', 'Change', 'Intrinsic', 'Bubble', 'Bubble z', 'Trend', 'Bubble score', 'Score', 'Signal', 'Strength', 'Support', 'Resistance', 'Why'],
    xRow: function (o) { return [o.series, o.type, o.price, o.chg, o.intrinsic, o.bubble, o.z, o.trend, o.bubbleScore, o.score, o.signal, o.strength, o.lv && o.lv.support, o.lv && o.lv.resistance, o.why]; },
    xFmt: [null, null, 'money', 'pct', 'money', 'pct', 'dec', 'dec', 'dec', 'dec', null, 'int', 'money', 'money'],
    notes: ['Port of Signal_Gold.xlsm. Intrinsic = ounce (USD) / 31.1035 × weight (g) × purity × free-market dollar; ounce and dollar carried forward over non-trading days.', 'Bubble score = −z of the bubble over BubbleLookback days. Final = 0.6 trend + 0.4 bubble, ×5.', 'Coin bubbles also reflect inflation expectations, political risk and supply limits the model does not see. Not investment advice.'] });
  simpleTool({ id: 'sig-fx', title: 'FX & USDT Signals', priority: 3, file: 'Signals_FX', eyebrow: 'Signals · Dollar, USDT and FX · TGJU', sample: fxSample, run: fxRun, alwaysKeys: ['price_dollar_rl'],
    summary: 'Free-market dollar, USDT, euro and dirham: trend plus the USDT–dollar spread z-score (capital-flight pressure).',
    newRow: function () { return { series: '', key: '', type: 'FX', spread: false, active: true }; },
    cols: [{ key: 'series', label: 'Series', kind: 'text' }, { key: 'key', label: 'TgjuKey', kind: 'text' }, { key: 'type', label: 'Type', kind: 'text' }, { key: 'spread', label: 'Spread vs USD', kind: 'bool' }, { key: 'active', label: 'Active', kind: 'bool' }],
    heads: ['Series', 'Signal', 'Score', 'Str.', 'Price', 'Chg', 'Spread vs USD', 'z', 'Trend', 'Spread score', 'Support · resistance', 'Why'],
    row: function (o) { return [o.series, chip(o.signal), fS(o.score), o.strength || '–', fN(o.price), fP(o.chg), fP(o.spread), fN(o.z, 2), fS(o.trend), fS(o.spreadScore), o.lv ? fN(o.lv.support) + ' · ' + fN(o.lv.resistance) : '–', o.why || '']; },
    kpiLabel: 'USDT spread', kpi: function (R) { var o = R.rows.filter(function (x) { return isFinite(x.spread); })[0]; return o ? fP(o.spread, 2) : '–'; }, kpiSub: 'USDT ÷ dollar − 1',
    xHeads: ['Series', 'Type', 'Price', 'Change', 'Spread', 'Spread z', 'Trend', 'Spread score', 'Score', 'Signal', 'Strength', 'Why'],
    xRow: function (o) { return [o.series, o.type, o.price, o.chg, o.spread, o.z, o.trend, o.spreadScore, o.score, o.signal, o.strength, o.why]; }, xFmt: [null, null, 'money', 'pct', 'pct2', 'dec', 'dec', 'dec', 'dec', null, 'int'],
    notes: ['Port of Signal_FX.xlsm. Spread = USDT × scale ÷ free-market dollar − 1, scored as −z over SpreadLookback days; only for series flagged "spread vs USD".', 'Final = 0.7 trend + 0.3 spread, ×5. A wide spread can mean reversion or the start of a pressure wave: the model takes no view on which.', 'TGJU is an aggregator, not a primary source. Not investment advice.'] });

  /* ----- Options: plain-language order tickets ----- */
  function ticketTab(ctx) {
    var S = ctx.S, R = ctx.R, TE = Hub.tradeEngine; S.tk = S.tk || { equity: null, riskPct: 0.01 };
    var f = G.form({ id: 'so-tk', onChange: ctx.rerender, fields: [ctx.field('eq', 'سرمایهٔ اختصاص‌یافته به اختیار معامله (ریال)', 'tk.equity', 'num', { optional: true }), ctx.field('rp', 'حداکثر زیان مجاز هر معامله (درصد این سرمایه)', 'tk.riskPct', 'pct')] });
    if (!TE || !TE.optionCards) return ctx.group([ctx.panel('دستور معامله', [h('p', { class: 'muted', text: 'موتور معامله‌گری در این نسخه بارگذاری نشده است.' })])]);
    var E = TE.defaults(); E.acct.equity = S.tk.equity; E.acct.riskPct = S.tk.riskPct || 0.01;
    var smp = !S.meta || /synthetic|Illustrative/i.test(S.meta.source || ''), O = { R: R, sample: smp, asOf: S.meta && S.meta.asOf, age: dataAge(S) };
    var cards = TE.optionCards(O, E), skip = TE.optionSkipped(O), rows = R.rows, n = function (fn) { return rows.filter(fn).length; };
    var g = function (c, k) { var r = (c.ticket || []).filter(function (x) { return x[0] === k; })[0]; return r ? r[1] : ''; };
    var glossary = h('details', null, [h('summary', { text: 'واژه‌ها را نمی‌شناسید؟ (راهنما)' }), h('ul', { class: 'studio-l' }, [
      'اختیار خرید (Call، نمادهای «ض…»): حق خرید سهم پایه به «قیمت اعمال» در سررسید. وقتی سهم پایه بالا برود، قیمتش بالا می‌رود.', 'اختیار فروش (Put، نمادهای «ط…»): حق فروش سهم پایه به قیمت اعمال در سررسید. وقتی سهم پایه پایین برود، قیمتش بالا می‌رود.',
      'قیمت اعمال (K): قیمتی که در سررسید با آن می‌خرید یا می‌فروشید.', 'قیمت پایه (S): قیمت فعلی سهم یا صندوقی که اختیار روی آن است.', 'قیمت اختیار: مبلغی که برای هر «یک سهم» از قرارداد می‌پردازید؛ مبلغ کل = قیمت × اندازهٔ قرارداد × تعداد قرارداد.',
      'سربه‌سر در سررسید: قیمتی از سهم پایه که اگر تا سررسید نگه دارید، نه سود و نه زیان دارید.', 'نقدشوندگی A/B: هم الان فروشنده هست و هم بعداً خریدار؛ C یعنی ممکن است نتوانید بفروشید.'].map(function (x) { return h('li', { text: x }); }))]);
    var funnel = h('p', { class: 'f-help', 'data-notr': '1', text: 'از ' + rows.length + ' قرارداد: ' + n(function (o) { return o.liqGrade === 'A' || o.liqGrade === 'B'; }) + ' قابل معامله (نقدشوندگی A/B)؛ ' + n(function (o) { return o.deepITM || o.farOTM; }) + ' خیلی دور یا خیلی عمیق در سود (کنار گذاشته شد)؛ ' + n(function (o) { return o.signal === 'Near expiry'; }) + ' نزدیک سررسید؛ ' + n(function (o) { return o.ivrv >= R.P.ExpensiveIVRatio; }) + ' با قیمت گران (نوسان ضمنی ≥ ' + R.P.ExpensiveIVRatio + ' برابر نوسان واقعی)؛ نتیجه: ' + cards.filter(function (c) { return c.type === 'long'; }).length + ' پیشنهاد خرید و ' + cards.filter(function (c) { return c.type !== 'long'; }).length + ' پیشنهاد فروش (نوشتن).' });
    var list = cards.map(function (c, i) {
      var buy = c.type === 'long', steps = buy ? [
        ['۱. چه بخرید', g(c, 'قرارداد')], ['۲. چند قرارداد', g(c, 'اقدام') + (g(c, 'مبلغ کل خرید') ? ' — مبلغ کل: ' + g(c, 'مبلغ کل خرید') : '')], ['۳. کِی بخرید', g(c, 'زمان خرید') + '. ' + g(c, 'شرط ورود') + '.'],
        ['۴. با چه قیمتی', g(c, 'قیمت سفارش')], ['۵. کِی با سود بفروشید', g(c, 'اهداف فروش') + '. ' + c.exit], ['۶. کِی با زیان بفروشید', 'اگر قیمت اختیار به ' + g(c, 'حد ضرر') + ' رسید، بفروشید.'],
        ['۷. آخرین مهلت فروش', g(c, 'آخرین مهلت فروش')], ['۸. اگر تا سررسید نگه داشتید (اعمال)', 'نقطهٔ سربه‌سر: ' + g(c, 'نقطهٔ سربه‌سر در سررسید') + '. ' + g(c, 'اعمال در سررسید')],
        ['۹. چرا این قرارداد', (c.o && c.o.why) || '—'], ['۱۰. نقدشوندگی', g(c, 'نقدشوندگی')]]
        : [['۱. چه کاری', g(c, 'اقدام')], ['۲. قرارداد', g(c, 'قرارداد')], ['۳. کِی و با چه قیمتی', g(c, 'زمان') + '؛ ' + g(c, 'قیمت سفارش')], ['۴. چرا', g(c, 'دلیل')], ['۵. بازخرید و خروج', g(c, 'بازخرید و خروج')], ['۶. ریسک اعمال', g(c, 'ریسک اعمال')], ['۷. نقدشوندگی', g(c, 'نقدشوندگی')]];
      var head = (i + 1) + ') ' + (buy ? 'خرید ' : 'فروش (نوشتن) ') + c.sym + ' — ' + c.name + (c.status ? ' · ' + c.status : '');
      return h('div', { class: 'sig-card t-' + (buy ? 'long' : 'close') }, [h('div', { class: 'sig-head' }, [h('strong', { 'data-notr': '1', text: head })]),
        h('div', { class: 'grid-wrap' }, [h('table', { class: 'grid aud se sig-t ticket' }, [h('tbody', null, steps.map(function (st) { return h('tr', null, [h('td', { 'data-notr': '1', text: st[0] }), h('td', { 'data-notr': '1', style: 'white-space:normal', text: st[1] })]); }))])])]);
    });
    var sk = skip.length ? h('details', null, [h('summary', { text: 'قراردادهای پرامتیاز که به‌خاطر نقدشوندگی کنار رفتند (' + skip.length + ')' }), h('ul', { class: 'studio-l' }, skip.map(function (x) { return h('li', { 'data-notr': '1', text: x.sym + ' (' + x.und + '، اعمال ' + U.fmtNum(x.strike, 0) + '، سررسید ' + x.expiry + '): ' + x.why }); }))]) : null;
    return ctx.group([ctx.panel('دستور معامله — چه قراردادی، کِی، با چه قیمتی، کِی بفروشید، کِی اعمال کنید', [
      smp ? h('p', { class: 'neg', text: 'این‌ها دادهٔ نمونه‌اند؛ ابتدا از زبانهٔ «قراردادها و داده» دریافت کنید.' }) : null,
      h('p', { class: 'f-help', text: 'فقط قراردادهایی که هم الان قابل خرید و هم بعداً قابل فروش‌اند، قیمتشان گران نیست و نه خیلی دور و نه خیلی عمیق در سودند. توصیهٔ سرمایه‌گذاری نیست؛ پیش از ثبت سفارش، قیمت لحظه‌ای تابلو را چک کنید.' }), f, glossary, funnel]),
      ctx.panel('پیشنهادها (' + cards.length + ')', list.length ? list.concat([sk]) : [h('p', { class: 'muted', text: 'امروز هیچ قراردادی همهٔ شرط‌ها را ندارد (خلاصهٔ بالا دلیل را نشان می‌دهد). در این حالت خرید نکردن تصمیم درست است.' }), sk])]);
  }

  /* options order tickets (directive 22): the tickets of the central engine run (same cards, same account settings), each headed by its
     central record; the earlier per-page computation with its own capital field is retired so the options page cannot disagree */
  function optCenTickets(ctx) {
    var X = null; try { X = Hub.tradeUI && Hub.tradeUI.engineNow ? Hub.tradeUI.engineNow().X : null; } catch (e) { X = null; }
    if (!X) return ticketTab(ctx);
    var cards = (X.cards || []).filter(function (c) { return c.cls === 'option' && c.ticket; }), L = cenRows(cards.map(function (c) { return { key: c.key, sym: c.sym, m: c }; }));
    var list = L.map(function (x, i) { var c = x.m, p = x.p; return h('div', { class: 'sig-card t-' + (p && p.tier === 'ok' ? 'long' : 'close') }, [h('div', { class: 'sig-head' }, [h('strong', { 'data-notr': '1', text: (i + 1) + ') ' + c.sym + ' — ' + c.name }), cenChip(p, x.key)]),
      h('div', { class: 'grid-wrap' }, [h('table', { class: 'grid aud se sig-t ticket' }, [h('tbody', null, c.ticket.map(function (st) { return h('tr', null, [h('td', { 'data-notr': '1', text: st[0] }), h('td', { 'data-notr': '1', style: 'white-space:normal', text: st[1] })]); }))])])]); });
    return ctx.group([ctx.panel('دستور معامله — اختیار معامله (از اجرای موتور مرکزی)', [h('p', { class: 'f-help', 'data-notr': '1', text: 'همان قراردادها، دستورها و حکمی که معامله‌گری هوشمند و داشبورد معاملاتی نشان می‌دهند. سرمایه و ریسک هر معامله از تنظیمات حساب موتور (اجرا، تنظیمات و داده) خوانده می‌شود. مدل اختیار معامله بک‌تست نشده است؛ این روی هر حکم نوشته شده.' })].concat(list.length ? list : [h('p', { class: 'muted', 'data-notr': '1', text: 'امروز هیچ قراردادی شرط‌های مدل اختیار را ندارد؛ خرید نکردن تصمیم درست است.' })]))]);
  }
  /* ----- Options ----- */
  TK.define({
    id: 'sig-options', title: 'Options Signals (TSE)', sections: ['signals', 'trading'], priority: 4, version: 1, storeKey: 'hub.sigoptions.v1',
    summary: 'TSE options: Black–Scholes implied volatility, Greeks, IV vs realised volatility and the underlying trend, with percentile gates and premium-selling flags.',
    sample: optSample, blank: function () { var s = optSample(); s.data = { und: {} }; s.contracts = []; s.meta.source = ''; return s; }, run: optRun,
    eyebrow: function () { return 'Signals · Options · TSETMC'; }, heading: function (S) { return S.meta.title; }, filename: function () { return 'Signals_Options'; },
    xlsx: function (S, R) { var b = Hub.xl.book(root.ExcelJS);
      sheetTable(b, 'Signals', 'Options signals', ['Contract', 'Type', 'Underlying', 'Strike', 'Expiry (Shamsi)', 'Days', 'Underlying price', 'Option price', 'Moneyness', 'RV', 'IV', 'IV/RV', 'Delta', 'Gamma', 'Vega (1 vol pt)', 'Theta (day)', 'Trend', 'Direction', 'Vol score', 'Score', 'Percentile', 'Signal', 'Strike vs levels', 'Why'],
        R.rows.map(function (o) { return [o.symbol, o.type, o.underlying, o.strike, o.expiry, o.days, o.S, o.price, o.moneyness, o.rv, o.iv, o.ivrv, o.delta, o.gamma, o.vega, o.theta, o.trend, o.dir, o.volS, o.score, o.pct, o.signal, o.strikeVsLevels, o.why]; }),
        [null, null, null, 'money', null, 'int', 'money', 'money', 'pct', 'pct', 'pct', 'dec', 'dec3', 'dec4', 'dec', 'dec', 'dec', 'dec', 'dec', 'dec', 'pct']);
      settingsSheet(b, S); Hub.xl.notes(b, ['Port of Signal_Options.xlsm. IV from European Black–Scholes: Brenner–Subrahmanyam starting value, Newton iterations; rejected outside 2%–399% or when the model price misses the market.', 'Score = 0.65 direction (underlying trend in the contract’s direction) + 0.35 volatility (−(IV/RV − 1) / 0.5), ×5.', 'Sell flags when IV/RV ≥ 1.3 and the underlying trend does not run against the short. American-style exercise and dividends are not modelled. Not investment advice.'], {});
      return b.wb; },
    kpis: function (ctx) { var R = function () { return ctx.R; }; return [
      ['Contracts', function () { return String(R().rows.length); }, function () { return R().rows.filter(function (o) { return o.valid; }).length + ' valid'; }],
      ['Buy', function () { return String(R().rows.filter(function (o) { return /^(Strong buy|Buy)/.test(o.signal); }).length); }, function () { return 'calls and puts'; }],
      ['Sell premium', function () { return String(R().rows.filter(function (o) { return /^Sell/.test(o.signal); }).length); }, function () { return 'IV/RV ≥ ' + R().P.ExpensiveIVRatio; }],
      ['Median IV/RV', function () { var v = R().rows.map(function (o) { return o.ivrv; }).filter(isFinite).sort(function (a, b) { return a - b; }); return v.length ? v[Math.floor(v.length / 2)].toFixed(2) : '–'; }, function () { return 'implied ÷ realised'; }]]; },
    tabs: [
      { group: 'Inputs', items: [['con', 'Contracts & data', function (ctx) {
        var lst = ctx.list({ id: 'so-c', path: 'contracts', newRow: function () { return { symbol: '', type: 'Call', underlying: '', strike: 0, expiry: '', size: 1000, active: true }; }, cols: [
          { key: 'symbol', label: 'Contract', kind: 'text' }, { key: 'type', label: 'Type', kind: 'select', options: function () { return [['Call', 'Call'], ['Put', 'Put']]; } }, { key: 'underlying', label: 'Underlying', kind: 'text' },
          { key: 'strike', label: 'Strike' }, { key: 'expiry', label: 'Expiry (Shamsi, e.g. 1405/09/25)', kind: 'text' }, { key: 'size', label: 'Contract size' }, { key: 'active', label: 'Active', kind: 'bool' }] });
        if (!Array.isArray(ctx.S.unds)) ctx.S.unds = undRows(); if (!Array.isArray(ctx.S.chain)) ctx.S.chain = [];
        var ul = ctx.list({ id: 'so-u', path: 'unds', newRow: function () { return { symbol: '', insCode: '', active: true }; }, cols: [{ key: 'symbol', label: 'Underlying symbol', kind: 'text' }, { key: 'insCode', label: 'InsCode (blank = find)', kind: 'text' }, { key: 'active', label: 'Active', kind: 'bool' }] });
        var ch = ctx.S.chain, fU = h('select', { class: 'f-in', 'aria-label': 'Underlying' }), fE = h('select', { class: 'f-in', 'aria-label': 'Expiry' }), box = h('div');
        var uniq = function (k) { var o = []; ch.forEach(function (c) { if (o.indexOf(c[k]) < 0) o.push(c[k]); }); return o; };
        [['', isFa() ? 'همهٔ نمادهای پایه' : 'All underlyings']].concat(uniq('underlying').map(function (x) { return [x, x]; })).forEach(function (o) { fU.appendChild(h('option', { value: o[0], text: o[1] })); });
        function fillE() { U.clear(fE); var ex = []; ch.forEach(function (c) { if ((!fU.value || c.underlying === fU.value) && ex.indexOf(c.expiry) < 0) ex.push(c.expiry); }); ex.sort(); [['', isFa() ? 'همهٔ سررسیدها' : 'All expiries']].concat(ex.map(function (x) { return [x, x]; })).forEach(function (o) { fE.appendChild(h('option', { value: o[0], text: o[1] })); }); }
        function paintChain() { U.clear(box); var sn = (ctx.S.data || {}).snap || {}, rows = ch.filter(function (c) { return (!fU.value || c.underlying === fU.value) && (!fE.value || c.expiry === fE.value); });
          if (!ch.length) { box.appendChild(h('p', { class: 'muted', text: isFa() ? 'هنوز زنجیره‌ای دریافت نشده است؛ «دریافت» را بزنید.' : 'No chain fetched yet — press Fetch.' })); return; }
          var cnt = {}; ch.forEach(function (c) { var k = c.underlying; cnt[k] = cnt[k] || { n: 0, e: [] }; cnt[k].n++; if (cnt[k].e.indexOf(c.expiry) < 0) cnt[k].e.push(c.expiry); });
          box.appendChild(table(['Underlying', 'Contracts', 'Expiries (Shamsi)'], Object.keys(cnt).map(function (k) { return [k, cnt[k].n, cnt[k].e.sort().join(' · ')]; })));
          box.appendChild(table(['Contract', 'Type', 'Underlying', 'Expiry (Shamsi)', 'Strike', 'Last', 'Bid', 'Ask', 'Volume', 'Open interest'], rows.slice(0, 400).map(function (c) { var x = sn[c.symbol] || {}; return [c.symbol, c.type, c.underlying, c.expiry, fN(c.strike), fN(x.close || x.last), fN(x.bid), fN(x.ask), fN(x.vol), fN(x.oi)]; })));
          if (rows.length > 400) box.appendChild(h('p', { class: 'muted small', text: rows.length + ' rows; filter to see the rest.' })); }
        fU.addEventListener('change', function () { fillE(); paintChain(); }); fE.addEventListener('change', paintChain); fillE(); paintChain();
        return ctx.group([ctx.panel('Live data', [fetchBar(ctx, optFetch, 'Fetch TSETMC (option board, underlyings, manual contracts)')]),
          ctx.panel('Underlyings — whole option chain from the TSETMC option board', [h('p', { class: 'f-help', text: isFa() ? 'برای هر نماد پایهٔ فعال، همهٔ قراردادهای اختیار خرید و فروش با همهٔ سررسیدها از تابلوی اختیار معاملهٔ TSETMC خوانده می‌شود (قیمت، بهترین پیشنهاد خرید و فروش، حجم و موقعیت‌های باز امروز). سررسیدها شمسی‌اند. اگر insCode خالی باشد، از روی نماد پیدا می‌شود.' : 'For each active underlying, every call and put of every expiry is read from the TSETMC option board (price, best bid/ask, volume, open interest). Expiries in Shamsi.' }), ul]),
          ctx.panel('Option chain', [h('div', { class: 'row-ctl' }, [fU, fE]), box]),
          ctx.panel('Manual contracts (optional; daily history is fetched for these)', [lst])]);
      }], ['set', 'Settings', settingsTab]] },
      { group: 'Outputs', items: [['tick', 'Order tickets', optCenTickets], ['sig', 'Signals', function (ctx) {
        var wrap = h('div');
        function paint() { U.clear(wrap); wrap.appendChild(table(['Contract', 'Signal', 'Score', 'Pctl', 'Underlying', 'Expiry (Shamsi)', 'Days to expiry', 'Underlying price (S)', 'Strike (K)', 'Option price', 'Liquidity', 'Spread', 'Open interest', 'IV', 'RV', 'IV/RV', 'Delta', 'Theta', 'Trend', 'Strike vs levels', 'Why'],
          ctx.R.rows.map(function (o) { var pc = cenView('o:' + o.symbol); return [o.symbol + ' · ' + o.type, pc ? cenChip(pc, 'o:' + o.symbol) : h('span', { class: 'sig-chip sig-h', 'data-notr': '1', text: 'بدون حکم مرکزی — مدل: ' + (o.signal || '–') + ' (ورودی تحلیل)' }), fS(o.score), fP(o.pct, 0), o.underlying, o.expiry, o.days, fN(o.S), fN(o.strike), fN(o.price), o.liqGrade + (o.liqWhy ? ' — ' + o.liqWhy : ''), fP(o.spread), fN(o.oi), fP(o.iv), fP(o.rv), fN(o.ivrv, 2), fN(o.delta, 2), fN(o.theta, 1), fS(o.trend), o.strikeVsLevels, o.why]; }), 2)); }
        paint();
        var calc = G.form({ id: 'so-bs', onChange: function () { calc.refresh(); }, fields: (function () { var Q = ctx.S.bsq = ctx.S.bsq || { type: 'Call', S: 1000, K: 1000, days: 45, r: 0.30, price: 80 }; return [
          { key: 't', label: 'Type', options: [['Call', 'Call'], ['Put', 'Put']], get: function () { return Q.type; }, set: function (v) { Q.type = v; } }, ctx.field('s', 'Underlying price', 'bsq.S', 'num'), ctx.field('k', 'Strike', 'bsq.K', 'num'),
          ctx.field('d', 'Days to expiry', 'bsq.days', 'num'), ctx.field('r', 'Risk-free', 'bsq.r', 'pct2', { unit: '%' }), ctx.field('p', 'Option price', 'bsq.price', 'num'),
          { key: 'iv', label: 'Implied volatility', strong: true, calc: function () { return fP(impliedVol(Q.type, num(Q.S), num(Q.K), Math.max(1, num(Q.days)) / 365, num(Q.r), num(Q.price)), 2); } },
          { key: 'g', label: 'Delta · gamma · vega · theta', calc: function () { var iv = impliedVol(Q.type, num(Q.S), num(Q.K), Math.max(1, num(Q.days)) / 365, num(Q.r), num(Q.price)); if (!isFinite(iv)) return '–'; var g = bs(Q.type, num(Q.S), num(Q.K), Math.max(1, num(Q.days)) / 365, num(Q.r), iv); return g.delta.toFixed(3) + ' · ' + g.gamma.toFixed(5) + ' · ' + g.vega1.toFixed(2) + ' · ' + g.theta.toFixed(2); } }]; })() });
        var legend = h('p', { class: 'f-help', 'data-notr': '1', text: isFa() ? 'راهنمای ستون‌ها: «روز تا سررسید» = تعداد روز تقویمی تا سررسید · «قیمت پایه (S)» = آخرین قیمت سهم یا صندوق پایه · «قیمت اعمال (K)» = قیمتی که در سررسید می‌توانید سهم را به آن بخرید (اختیار خرید) یا بفروشید (اختیار فروش) · «قیمت اختیار» = قیمت هر واحد قرارداد (میانگین بهترین تقاضا و عرضه؛ اگر نبود، آخرین معامله) · نقدشوندگی A/B = قابل خرید و فروش، C = نامناسب · IV = نوسان ضمنی از قیمت اختیار · RV = نوسان واقعی ۲۰ روزهٔ پایه. دستور خرید و فروش هر قرارداد پیشنهادی در زبانهٔ «دستور معامله» است.' : 'Columns: Days to expiry · S = underlying price · K = strike · Option price = mid of best bid/ask (else last trade) · Liquidity A/B tradable, C not · IV implied, RV realised 20-day. Order tickets are on the «Order tickets» tab.' });
        return { el: h('div', { class: 'stack' }, [ctx.panel('Signals (ranked)', [legend, wrap]), ctx.two(ctx.panel('Quick Black–Scholes', [calc]), checksPanel(ctx))]), refresh: function () { paint(); calc.refresh(); } };
      }]] }]
  });

  /* ----- Temporal ----- */
  TK.define({
    id: 'sig-temporal', title: 'Temporal Analysis (cycles & time windows)', sections: ['signals', 'trading'], priority: 5, version: 1, storeKey: 'hub.sigtemporal.v1',
    summary: 'Where are we in the cycle: periodogram cycle scan, FLD, Gann square of nine, Gann and Fibonacci time windows from your pivots, clustered into key dates.',
    sample: tempSample, blank: function () { var s = tempSample(); s.data = {}; s.meta.source = ''; return s; }, run: tempRun,
    eyebrow: function (S) { return 'Signals · Temporal · ' + S.series.label; }, heading: function (S) { return S.meta.title; }, filename: function () { return 'Temporal_Analysis'; },
    xlsx: function (S, R) { var b = Hub.xl.book(root.ExcelJS);
      sheetTable(b, 'Cycles', 'Dominant cycles · ' + S.series.label, ['Period (bars)', 'Calendar days', 'Relative amplitude', 'Phase (0–1)', 'Bars to trough', 'Next trough', 'Next peak', 'FLD', 'Above FLD'], R.cycles.map(function (c) { return [c.period, c.calDays, c.strength, c.phase, c.barsToTrough, c.nextTrough, c.nextPeak, c.fld, c.aboveFld ? 'yes' : 'no']; }), ['int', 'int', 'dec', 'dec', 'int', null, null, 'money']);
      sheetTable(b, 'Time windows', 'Key dates ahead', ['Date', 'Days from now', 'Window', 'From', 'Cluster'], R.windows.map(function (w) { return [w.date, w.days, w.kind, w.from, w.cluster]; }), [null, 'int', null, null, 'int'], [2, 14, 12, 34, 30, 10]);
      sheetTable(b, 'Square of nine', 'Gann square of nine around the base ' + S.sq9.base, ['Turn', 'Angle', 'Level', 'Distance from price'], R.sq9.map(function (q) { return [q.turn, q.angle, q.level, q.dist]; }), ['int', 'int', 'money', 'pct']);
      sheetTable(b, 'Periodogram', 'Amplitude by period', ['Period', 'Amplitude', 'Relative'], (R.scan || []).map(function (s) { return [s.p, s.amp, s.rel]; }), ['int', 'dec4', 'dec']);
      Hub.xl.notes(b, ['Port of the mechanical parts of Temporal_Analysis.xlsm: periodogram on the detrended series (log option added), top three periods separated by CycleSeparation, FLD (price shifted half a cycle), Gann square of nine, Gann and Fibonacci time windows.', 'Elliott counts, Kondratieff / Juglar positions and geopolitical cycles are judgement inputs in the workbook and are not automated here.', 'Cycles are revisable and periodograms always find something: treat the dates as a checklist, not signals.'], {});
      return b.wb; },
    kpis: function (ctx) { var R = function () { return ctx.R; }; return [
      ['Dominant cycle', function () { var c = R().cycles[0]; return c ? c.period + ' bars' : '–'; }, function () { var c = R().cycles[0]; return c ? '≈ ' + c.calDays + ' days · amplitude ' + fN(c.strength, 2) : ''; }],
      ['Next trough', function () { var c = R().cycles[0]; return c ? c.nextTrough : '–'; }, function () { var c = R().cycles[0]; return c ? c.barsToTrough + ' bars' : ''; }],
      ['vs FLD', function () { var c = R().cycles[0]; return c ? (c.aboveFld ? 'Above FLD' : 'Below FLD') : '–'; }, function () { return 'price vs half-cycle shift'; }],
      ['Next window', function () { var w = R().windows.filter(function (x) { return x.days >= 0; })[0]; return w ? w.date : '–'; }, function () { var w = R().windows.filter(function (x) { return x.days >= 0; })[0]; return w ? w.kind : ''; }]]; },
    tabs: [
      { group: 'Inputs', items: [['series', 'Series & pivots', function (ctx) {
        var S = ctx.S;
        var f = G.form({ id: 'st-s', onChange: ctx.recompute, fields: [
          { key: 'src', label: 'Source', options: [['tse-index', 'TSETMC index (code)'], ['tse', 'TSETMC symbol'], ['tgju', 'TGJU key']], get: function () { return S.series.source; }, set: function (v) { S.series.source = v; } },
          { key: 'k', label: 'Code / symbol / key', text: true, unit: '32097828799138957 total · 67130298613737946 equal-weight', get: function () { return S.series.key; }, set: function (v) { S.series.key = v.trim(); } },
          { key: 'l', label: 'Label', text: true, get: function () { return S.series.label; }, set: function (v) { S.series.label = v; } },
          ctx.field('n', 'Bars used', 'series.bars', 'int'), { key: 'lg', label: 'Detrend', options: [['1', 'Log-linear (better for inflationary series)'], ['0', 'Linear']], get: function () { return S.series.log ? '1' : '0'; }, set: function (v) { S.series.log = v === '1'; } },
          ctx.field('mi', 'Shortest period scanned', 'scan.minP', 'int'), ctx.field('ma', 'Longest period scanned', 'scan.maxP', 'int'), ctx.field('sp', 'Cycle separation', 'scan.sep', 'pct', { unit: '%' }),
          ctx.field('b9', 'Square-of-nine base price', 'sq9.base', 'num'),
          { key: 'gd', label: 'Gann day counts', text: true, get: function () { return S.gannDays; }, set: function (v) { S.gannDays = v; } }, { key: 'fb', label: 'Fibonacci time ratios', text: true, get: function () { return S.fibs; }, set: function (v) { S.fibs = v; } }] });
        var pv = ctx.list({ id: 'st-p', path: 'pivots', newRow: function () { return { label: '', date: '', price: 0 }; }, cols: [{ key: 'label', label: 'Pivot', kind: 'text' }, { key: 'date', label: 'Date (Shamsi or Gregorian)', kind: 'text' }, { key: 'price', label: 'Price' }] });
        return ctx.group([ctx.panel('Live data', [fetchBar(ctx, function (S2) { return tempFetch(S2); }, 'Fetch series')]), ctx.two(ctx.panel('Series and scan', [f]), ctx.panel('Pivots (oldest first)', [pv])),
          pasteBox(ctx, function (d) { var k = Object.keys(d)[0]; ctx.S.data = { series: d[k] }; ctx.S.series.label = k; })]);
      }]] },
      { group: 'Outputs', items: [['cyc', 'Cycles & windows', function (ctx) {
        var a = h('div'), b2 = h('div'), c = h('div');
        function paint() { var R = ctx.R; U.clear(a); U.clear(b2); U.clear(c);
          a.appendChild(table(['Period (bars)', '≈ days', 'Amplitude', 'Phase', 'Bars to trough', 'Next trough', 'Next peak', 'FLD', 'Price vs FLD'], R.cycles.map(function (q) { return [q.period, q.calDays, fN(q.strength, 2), fN(q.phase, 2), q.barsToTrough, q.nextTrough, q.nextPeak, fN(q.fld), q.aboveFld ? 'Above FLD' : 'Below FLD']; }), 1));
          b2.appendChild(table(['Date', 'Days', 'Window', 'From', 'Cluster'], R.windows.map(function (w) { return [w.date, w.days, w.kind, w.from, w.cluster > 1 ? '◆ ' + w.cluster : '']; }), 1, function (i) { return R.windows[i].cluster > 1 ? 'total' : ''; }));
          c.appendChild(table(['Turn', 'Angle', 'Level', 'From price'], R.sq9.map(function (q) { return [q.turn, q.angle, fN(q.level), fP(q.dist)]; }), 2)); }
        paint();
        return { el: h('div', { class: 'stack' }, [ctx.panel('Dominant cycles', [a]), ctx.two(ctx.panel('Key dates ahead (◆ = several windows within 5 days)', [b2]), ctx.panel('Gann square of nine around the base', [c])), checksPanel(ctx)]), refresh: paint };
      }]] }]
  });
})(typeof window !== 'undefined' ? window : globalThis);
