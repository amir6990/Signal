/* =====================================================================
 * GLOBAL MARKETS FEED + DATA HEALTH (directive 13 §5–6)
 * Crypto: CoinGecko public API (BTC, ETH daily history; total market cap and BTC dominance), Nobitex public market stats
 *   (BTC and USDT in rials, BTC-USDT), OKX public funding rate and open interest (BTC-USDT perpetual), alternative.me fear & greed.
 * Energy, metals and rates: Alpha Vantage with the user's key (BRENT, WTI, NATURAL_GAS daily; COPPER, ALUMINUM monthly;
 *   TREASURY_YIELD 10-year and FEDERAL_FUNDS_RATE daily; GOLD_SILVER_SPOT for silver and a gold cross-check).
 * All calls go over the hub's routes (direct → your proxy → server proxy → local proxy). Every source may fail on its own;
 * a failure keeps the last good data. Alpha Vantage is called at most every 12 hours (free tier has a small daily quota).
 * Health check: freshness against the market's calendar, completeness, outliers, and cross-checks between independent sources.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub, U = Hub.util, SG = Hub.signals, KEY = 'hub.sigglobal.v1';
  var isF = function (x) { return typeof x === 'number' && isFinite(x); };
  var gint = function (d) { return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); };
  var SER = [
    { id: 'btc', name: 'بیت‌کوین (BTC)', mk: 'crypto', unit: 'دلار', src: 'CoinGecko', cg: 'bitcoin', ku: 'BTC-USDT', fresh: 2 },
    { id: 'eth', name: 'اتریوم (ETH)', mk: 'crypto', unit: 'دلار', src: 'CoinGecko', cg: 'ethereum', ku: 'ETH-USDT', fresh: 2 },
    { id: 'brent', name: 'نفت برنت', mk: 'energy', unit: 'دلار/بشکه', src: 'Alpha Vantage', av: ['BRENT', { interval: 'daily' }], avDays: 1, fresh: 6 },
    { id: 'wti', name: 'نفت WTI', mk: 'energy', unit: 'دلار/بشکه', src: 'Alpha Vantage', av: ['WTI', { interval: 'daily' }], avDays: 1, fresh: 6 },
    { id: 'ng', name: 'گاز طبیعی (هنری هاب)', mk: 'energy', unit: 'دلار/میلیون BTU', src: 'Alpha Vantage', av: ['NATURAL_GAS', { interval: 'daily' }], avDays: 1, fresh: 6 },
    { id: 'ust10', name: 'بازده اوراق ۱۰ سالهٔ آمریکا', mk: 'rates', unit: '٪', src: 'وزارت خزانه‌داری آمریکا', tr: '10 Yr', av: ['TREASURY_YIELD', { interval: 'daily', maturity: '10year' }], avDays: 3, fresh: 6 },
    { id: 'ffr', name: 'نرخ بهرهٔ فدرال', mk: 'rates', unit: '٪', src: 'فدرال رزرو نیویورک', nyfed: 1, av: ['FEDERAL_FUNDS_RATE', { interval: 'daily' }], avDays: 3, fresh: 6 },
    /* silver and copper as their own markets (2026-11-21): daily bars of the COMEX front-month futures from CNBC (the only daily source that
       answers from the user's network; Alpha Vantage gives copper monthly only). Futures, not spot: the roll between contracts shows as a
       small jump on the roll day. Copper is quoted in $/lb and kept in $/t (× 2,204.62); the monthly Alpha Vantage copper is no longer
       stored under this id because a daily and a monthly series cannot share one history. */
    { id: 'silver', name: 'نقره (اونس، آتی COMEX)', mk: 'metals', unit: 'دلار/اونس', src: 'CNBC', cn: '@SI.1', fresh: 5 },
    { id: 'copper', name: 'مس (آتی COMEX)', mk: 'metals', unit: 'دلار/تن', src: 'CNBC', cn: '@HG.1', cnMul: 2204.62262, fresh: 5 },
    { id: 'alu', name: 'آلومینیوم', mk: 'metals', unit: 'دلار/تن', src: 'Alpha Vantage', av: ['ALUMINUM', { interval: 'monthly' }], avDays: 7, fresh: 45 },
    /* world equity indices (Hang Seng, S&P 500, Nikkei, ...) were removed on 1405/09/01 (directive 23 · 2): out of the official
       universe (js/core/universe.js). They are neither fetched nor stored. */
  ];
  if (Hub.universe) SER = SER.filter(function (s) { return Hub.universe.ok('x:' + s.id) && !Hub.universe.OUT_MK[s.mk]; });
  var MKFA = { crypto: 'رمزارز', energy: 'انرژی', rates: 'نرخ بهره', metals: 'فلزات', intl: 'شاخص‌های جهانی' };
  function sample() { return { version: 1, tool: 'global-markets', meta: { title: 'Global markets', asOf: '', source: 'Illustrative synthetic data — press Fetch' }, data: {}, snap: {}, at: {} }; }
  function avRows(j) {   // {data:[{date:'2026-11-10', value:'74.1'}]}; '.' marks a missing day
    var a = j && (j.data || j.Data); if (!Array.isArray(a)) throw new Error('پاسخ Alpha Vantage قالب مورد انتظار را ندارد');
    return a.map(function (r) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(r.date || ''), v = Number(r.value); return m && isF(v) ? { date: +(m[1] + m[2] + m[3]), close: v } : null; }).filter(Boolean).sort(function (x, y) { return x.date - y.date; });
  }
  function cgRows(j) { var p = j && j.prices; if (!Array.isArray(p)) throw new Error('پاسخ CoinGecko قالب مورد انتظار را ندارد'); var by = {}, vol = {}; (j.total_volumes || []).forEach(function (v) { vol[gint(new Date(v[0]))] = v[1]; });
    p.forEach(function (x) { var d = gint(new Date(x[0])); by[d] = { date: d, close: x[1], vol: vol[d] || 0 }; }); return Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return a.date - b.date; }); }
  /* Yahoo Finance chart (no key): daily closes, dated in the exchange's own time zone. HG=F is quoted in $/lb → ×2204.62 for $/t. */
  function yhRows(j, mul) {
    var r = j && j.chart && j.chart.result && j.chart.result[0]; if (!r || !Array.isArray(r.timestamp)) throw new Error('پاسخ Yahoo قالب مورد انتظار را ندارد');
    var q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {}, off = Number(r.meta && r.meta.gmtoffset) || 0, by = {};
    r.timestamp.forEach(function (t, i) { var c = q.close && q.close[i]; if (!isF(c) || !(c > 0)) return; var d = gint(new Date((t + off) * 1000)); by[d] = { date: d, close: c * (mul || 1) }; });
    return Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return a.date - b.date; });
  }
  /* CNBC chart service: {barData:{priceBars:[{open,high,low,close,tradeTime:'YYYYMMDDhhmmss'}]}} */
  function cnRows(j) { var b = j && j.barData && j.barData.priceBars; if (!Array.isArray(b)) throw new Error('پاسخ CNBC قالب مورد انتظار را ندارد');
    var by = {}; b.forEach(function (x) { var d = +String(x.tradeTime || '').slice(0, 8), c = Number(x.close); if (!(d > 19000000) || !isF(c) || !(c > 0)) return; var h = Number(x.high), l = Number(x.low); by[d] = { date: d, open: Number(x.open) || c, high: isF(h) && h > 0 ? h : c, low: isF(l) && l > 0 ? l : c, close: c }; });
    return Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, c) { return a.date - c.date; }); }
  /* U.S. Treasury, Daily Treasury Par Yield Curve Rates (official, CSV with CORS): Date,"1 Mo",…,"10 Yr",… newest first, dates MM/DD/YYYY */
  function trRows(col) { return function (t) { var L = String(t || '').split(/\r?\n/).filter(Boolean); if (L.length < 2) throw new Error('پاسخ خزانه‌داری آمریکا خالی است');
    var hd = L[0].split(',').map(function (x) { return x.replace(/"/g, '').trim(); }), ix = hd.indexOf(col); if (ix < 0) throw new Error('ستون ' + col + ' در پاسخ خزانه‌داری نیست');
    var out = []; L.slice(1).forEach(function (l) { var c = l.split(','), m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(c[0] || ''), v = Number(c[ix]); if (m && isF(v)) out.push({ date: +(m[3] + m[1] + m[2]), close: v }); });
    return out.sort(function (a, b) { return a.date - b.date; }); }; }
  function trUrl(y) { return 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/' + y + '/all?type=daily_treasury_yield_curve&field_tdr_date_value=' + y + '&page&_format=csv'; }
  function fredRows(t) { // FRED CSV: observation_date,DFF
    var out = []; String(t || '').split(/\r?\n/).forEach(function (l) { var m = /^(\d{4})-(\d{2})-(\d{2}),([-0-9.]+)/.exec(l); if (m) out.push({ date: +(m[1] + m[2] + m[3]), close: Number(m[4]) }); });
    if (out.length < 5) throw new Error('پاسخ FRED قالب مورد انتظار را ندارد'); return out; }
  function nyfedRows(j) { var a = (j && j.refRates) || []; var out = a.map(function (r) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(r.effectiveDate || ''); return m && isF(r.percentRate) ? { date: +(m[1] + m[2] + m[3]), close: r.percentRate } : null; }).filter(Boolean).sort(function (x, y) { return x.date - y.date; });
    if (out.length < 5) throw new Error('پاسخ فدرال رزرو نیویورک قالب مورد انتظار را ندارد'); return out; }
  // each series: the free no-key source first (daily), Alpha Vantage (your key) as the fallback / cross-check
  /* incremental requests (directive 19 · 3): with a stored history (≥ 200 rows) only the period since the last row plus a revision
     window is asked for — Yahoo range, FRED start date (cosd), CoinGecko days. The first load asks for the full depth. */
  function sinceOf(old) { if (!old || old.length < 200) return null; var l = old[old.length - 1].date, t = Date.UTC(Math.floor(l / 1e4), Math.floor(l / 100) % 100 - 1, l % 100); return { days: Math.ceil((Date.now() - t) / 864e5) + 10, from: new Date(t - 10 * 864e5).toISOString().slice(0, 10) }; }
  function yRange(days) { return days <= 5 ? '5d' : days <= 30 ? '1mo' : days <= 90 ? '3mo' : days <= 180 ? '6mo' : days <= 365 ? '1y' : '5y'; }
  function seriesSources(s, D, k, old) {
    var L = [], inc = sinceOf(old);
    if (s.cg) L.push({ name: 'CoinGecko', url: 'https://api.coingecko.com/api/v3/coins/' + s.cg + '/market_chart?vs_currency=usd&days=' + (inc ? Math.min(365, inc.days) : 365) + '&interval=daily', parse: cgRows });
    // CNBC daily bars (world indices): the 1Y file holds about two years of daily bars (≈ 500; measured 2026-11-21 — the shorter ranges return the same file)
    if (s.cn) L.push({ name: 'CNBC (' + s.cn + ')', url: 'https://ts-api.cnbc.com/harmony/app/charts/1Y.json?symbol=' + encodeURIComponent(s.cn), parse: function (j) { var r = cnRows(j), m = s.cnMul || 1; return m === 1 ? r : r.map(function (x) { return { date: x.date, open: x.open * m, high: x.high * m, low: x.low * m, close: x.close * m }; }); } });
    // U.S. Treasury daily par yield curve (official): this year's file each run, the five years before it on the first load
    if (s.tr) { var y0 = new Date().getUTCFullYear(), ys = inc ? (inc.days > 300 || new Date().getUTCMonth() === 0 ? [y0 - 1, y0] : [y0]) : [y0 - 5, y0 - 4, y0 - 3, y0 - 2, y0 - 1, y0], prs = trRows(s.tr);
      L.push({ name: 'وزارت خزانه‌داری آمریکا', fn: function () { return Promise.all(ys.map(function (y) { return D.webText(trUrl(y), 'U.S. Treasury').then(prs, function (e) { if (y === y0) throw e; return []; }); })).then(function (A) { return [].concat.apply([], A); }); }, parse: function (r) { return r; } }); }
    // NY Fed effective federal funds rate (official API, CORS) — up to 500 recent days
    if (s.nyfed) L.push({ name: 'NY Fed (EFFR)', url: 'https://markets.newyorkfed.org/api/rates/unsecured/effr/last/' + (inc ? Math.min(500, inc.days + 5) : 500) + '.json', parse: nyfedRows });
    // Brent also from TGJU (oil_brent — the series the Iran-economy section already reads; TGJU answers from the phone)
    if (s.id === 'brent' && D.tgju) L.push({ name: 'TGJU (oil_brent)', fn: function () { return D.tgju('oil_brent'); }, parse: function (r) { return (r || []).map(function (x) { return { date: x.date, close: x.close }; }); } });
    if (s.av && k) L.push({ name: 'Alpha Vantage', url: 'https://www.alphavantage.co/query?function=' + s.av[0] + Object.keys(s.av[1]).map(function (p) { return '&' + p + '=' + s.av[1][p]; }).join('') + '&apikey=' + encodeURIComponent(k), parse: avRows });
    var minN = inc ? 1 : 5;
    return L.map(function (x) { var p = x.parse; x.parse = function (r) { var rows = p(r); if (rows.length < minN) throw new Error('فقط ' + rows.length + ' داده'); return rows; }; return x; });
  }
  // Iranian exchanges, rial quotes: Nobitex (apiv2 host; api.nobitex.ir no longer resolves from Iran), then Wallex, then Bitpin. Toman × 10 = rial.
  function irxSources() {
    var nb = function (j) { var st = j.stats || {}, g = function (p) { var o = st[p] || {}; return { last: Number(o.latest), bid: Number(o.bestBuy), ask: Number(o.bestSell), chg: Number(o.dayChange), vol: Number(o.volumeDst) }; };
      if (!st['btc-rls'] && !st['usdt-rls']) throw new Error('آمار جفت‌ها در پاسخ نیست'); return { btcRls: g('btc-rls'), usdtRls: g('usdt-rls'), btcUsdt: g('btc-usdt'), src: 'نوبیتکس' }; };
    var wx = function (j) { var sy = (j && j.result && j.result.symbols) || {}, g = function (k, m) { var o = sy[k] && (sy[k].stats || sy[k]) || {}; return { last: Number(o.lastPrice) * m, bid: Number(o.bidPrice) * m, ask: Number(o.askPrice) * m, chg: Number(o['24h_ch']), vol: Number(o['24h_quoteVolume']) * m }; };
      if (!sy.USDTTMN) throw new Error('تتر در پاسخ والکس نیست'); return { btcRls: g('BTCTMN', 10), usdtRls: g('USDTTMN', 10), btcUsdt: g('BTCUSDT', 1), src: 'والکس' }; };
    var bp = function (j) { var by = {}; (Array.isArray(j) ? j : []).forEach(function (x) { by[x.symbol] = x; }); var g = function (k, m) { var o = by[k] || {}; return { last: Number(o.price) * m, bid: NaN, ask: NaN, chg: Number(o.daily_change_price), vol: NaN }; };
      if (!by.USDT_IRT) throw new Error('تتر در پاسخ بیت‌پین نیست'); return { btcRls: g('BTC_IRT', 10), usdtRls: g('USDT_IRT', 10), btcUsdt: g('BTC_USDT', 1), src: 'بیت‌پین' }; };
    return [{ name: 'Nobitex', url: 'https://apiv2.nobitex.ir/market/stats?srcCurrency=btc,usdt&dstCurrency=rls,usdt', parse: nb }, { name: 'Nobitex', url: 'https://api.nobitex.ir/market/stats?srcCurrency=btc,usdt&dstCurrency=rls,usdt', parse: nb },
      { name: 'Wallex', url: 'https://api.wallex.ir/v1/markets', parse: wx }, { name: 'Bitpin', url: 'https://api.bitpin.ir/api/v1/mkt/tickers/', parse: bp }];
  }
  // BTC perpetual funding & open interest. OKX refuses Iranian IPs (HTTP 403), so Bitget / KuCoin / MEXC / Gate follow. One exchange's figure, not the market total.
  function fundSources() {
    var one = function (v) { if (!isF(v)) throw new Error('بدون نرخ'); return v; };
    return [{ name: 'OKX', url: 'https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP', parse: function (j) { var d = (j.data || [])[0]; if (!d) throw new Error('بدون داده'); return { rate: one(Number(d.fundingRate)), next: Number(d.nextFundingTime || d.fundingTime), src: 'OKX' }; } },
      { name: 'Bitget', url: 'https://api.bitget.com/api/v2/mix/market/current-fund-rate?symbol=BTCUSDT&productType=usdt-futures', parse: function (j) { var d = (j.data || [])[0]; if (!d) throw new Error('بدون داده'); return { rate: one(Number(d.fundingRate)), next: Number(d.nextUpdate), src: 'Bitget' }; } },
      { name: 'KuCoin', url: 'https://api-futures.kucoin.com/api/v1/funding-rate/XBTUSDTM/current', parse: function (j) { var d = j.data; if (!d) throw new Error('بدون داده'); return { rate: one(Number(d.value)), next: Number(d.fundingTime), src: 'KuCoin' }; } },
      { name: 'MEXC', url: 'https://contract.mexc.com/api/v1/contract/funding_rate/BTC_USDT', parse: function (j) { var d = j.data; if (!d) throw new Error('بدون داده'); return { rate: one(Number(d.fundingRate)), next: Number(d.nextSettleTime), src: 'MEXC' }; } }];
  }
  function oiSources() {
    var one = function (v) { if (!isF(v) || !(v > 0)) throw new Error('بدون OI'); return v; };
    return [{ name: 'OKX', url: 'https://www.okx.com/api/v5/public/open-interest?instType=SWAP&instId=BTC-USDT-SWAP', parse: function (j) { var d = (j.data || [])[0]; if (!d) throw new Error('بدون داده'); return { oi: Number(d.oi), oiCcy: one(Number(d.oiCcy)), src: 'OKX' }; } },
      { name: 'Bitget', url: 'https://api.bitget.com/api/v2/mix/market/open-interest?symbol=BTCUSDT&productType=usdt-futures', parse: function (j) { var d = j.data && (j.data.openInterestList || [])[0]; if (!d) throw new Error('بدون داده'); return { oi: Number(d.size), oiCcy: one(Number(d.size)), src: 'Bitget' }; } },
      { name: 'KuCoin', url: 'https://api-futures.kucoin.com/api/v1/contracts/XBTUSDTM', parse: function (j) { var d = j.data; if (!d) throw new Error('بدون داده'); return { oi: Number(d.openInterest), oiCcy: one(Number(d.openInterest) * Number(d.multiplier || 0.001)), src: 'KuCoin' }; } }];
  }
  /* crypto: CoinGecko's free API gives one year of daily closes — too short for the weekly price-time and turning-zone analysis
     (needs ≈ 700+ days). KuCoin's public daily candles (no key, up to 1,500 per call, UTC days, USDT) add the older years and the
     daily high/low; CoinGecko stays authoritative inside its own range (history guard). A KuCoin failure only leaves the year. */
  function kuRows(j) { var a = j && j.data; if (!Array.isArray(a)) throw new Error('پاسخ KuCoin قالب مورد انتظار را ندارد');
    return a.map(function (r) { var d = gint(new Date(Number(r[0]) * 1000)), o = +r[1], c = +r[2], h = +r[3], l = +r[4]; return isF(c) && c > 0 ? { date: d, open: o, high: h, low: l, close: c, vol: +r[6] || 0 } : null; }).filter(Boolean).sort(function (x, y) { return x.date - y.date; }); }
  function deepen(s, rows) {
    var D = Hub.data, end = Math.floor(Date.now() / 1000), url = 'https://api.kucoin.com/api/v1/market/candles?type=1day&symbol=' + s.ku + '&startAt=' + (end - 1499 * 86400) + '&endAt=' + end;
    return D.web(url, 'KuCoin').then(kuRows).then(function (ku) {
      if (ku.length < 30) return rows; var HM = Hub.histMerge, out = HM ? HM.mergeSeries(ku, rows, null, s.id) : rows, by = {};
      ku.forEach(function (r) { by[r.date] = r; });   // the daily high/low of KuCoin on CoinGecko's days too (path tests need the intraday extremes)
      out = out.map(function (r) { var k = by[r.date]; return k && !isF(r.high) && Math.abs(k.close / r.close - 1) < 0.03 ? Object.assign({}, r, { high: Math.max(k.high, r.close), low: Math.min(k.low, r.close) }) : r; });
      out._src = (rows._src || 'CoinGecko') + ' + KuCoin (تاریخچه)'; return out; }, function () { return rows; });
  }
  function fetchAll(S, progress) {
    var D = Hub.data, errs = [], k = D.keys().av, now = Date.now(); S.data = S.data || {}; S.snap = S.snap || {}; S.at = S.at || {}; S.srcOf = S.srcOf || {};
    // daily series refresh every run (free sources); Alpha Vantage only as a fallback, at most every 12 hours (free-tier cap)
    // Alpha Vantage (free tier ≈ 25 calls a day) is asked per series only when that series is due: daily data once a day, the
    // Treasury / NY Fed series every 3 days as a cross-check, monthly metals weekly. A series not due keeps its last data — that is not
    // a failure, so it is not reported as one.
    S.avAtS = S.avAtS || {}; var avDue = !S.avAt || now - S.avAt > 12 * 3600e3, avDueS = function (s) { return !!k && !!s.av && (!S.avAtS[s.id] || now - S.avAtS[s.id] > (s.avDays || 1) * 864e5 * 0.9); };
    var list = SER.filter(function (s) { return s.cg || s.cn || s.tr || s.nyfed || s.id === 'brent' || avDueS(s); }), i = 0, avUsed = false;
    S.avWait = SER.filter(function (s) { return s.av && !s.cg && !s.cn && !s.tr && !s.nyfed && s.id !== 'brent' && !avDueS(s) && k; }).map(function (s) { return { id: s.id, name: s.name, next: S.avAtS[s.id] + (s.avDays || 1) * 864e5 * 0.9 }; });
    if (Hub.ingest) Hub.ingest.begin('بازارهای جهانی: ' + list.length + ' سری');
    // one run shares a skip-list: a source host that timed out is not waited for again; on the phone each source gets 9 s at most
    var skip = {}, ms = D.https ? 9000 : 25000;
    var any = function (L, src) { return D.webAny ? D.webAny(L, src, { ms: ms, skip: skip }) : D.web(L[0].url, src).then(L[0].parse); };
    var one = function () { if (i >= list.length) return Promise.resolve(); var s = list[i++]; progress && progress(i, list.length, s.name);
      var L = seriesSources(s, D, avDueS(s) ? k : null, S.data[s.id]); if (!L.length) { errs.push(s.name + ': منبع بدون کلید ندارد و کلید Alpha Vantage وارد نشده'); return one(); }
      return any(L, s.name).then(function (rows) { return s.ku && (!S.data[s.id] || S.data[s.id].length < 700) ? deepen(s, rows) : rows; }).then(function (rows) {
        // upsert by date into the stored history (Hub.ingest: revisions logged, a re-run adds nothing)
        var old = S.data[s.id] || [], IG = Hub.ingest, src = rows._src;
        // a daily source replacing a monthly one (copper): the monthly rows are not mixed into the daily history
        if (s.cn && old.length > 5) { var gp = old.slice(-12).map(function (r, q, A) { return q ? (Date.UTC(Math.floor(r.date / 1e4), Math.floor(r.date / 100) % 100 - 1, r.date % 100) - Date.UTC(Math.floor(A[q - 1].date / 1e4), Math.floor(A[q - 1].date / 100) % 100 - 1, A[q - 1].date % 100)) / 864e5 : 1; }).sort(function (a, b) { return a - b; }); if (gp[Math.floor(gp.length / 2)] > 10) old = []; } if (IG) { var a = IG.apply('global', s.id, old, rows, null); rows = a.rows; IG.note({ rowsAdded: a.added, revised: a.revised.length }); } else if (Hub.histMerge && old.length) rows = Hub.histMerge.mergeSeries(old, rows);
        if (src) try { Object.defineProperty(rows, '_src', { value: src, enumerable: false }); } catch (e) { /* ignore */ }
        S.data[s.id] = rows.slice(-3000); S.at[s.id] = now; S.srcOf[s.id] = rows._src || L[0].name; if (/Alpha Vantage/.test(rows._src || '')) { avUsed = true; S.avAtS[s.id] = now; } }, function (e) { var m = String(e.message || e); errs.push(m.indexOf(s.name + ':') === 0 ? m : s.name + ': ' + m); }).then(one); };
    var snaps = [
      D.web('https://api.coingecko.com/api/v3/global', 'CoinGecko').then(function (j) { var d = j.data || {}; S.snap.cgGlobal = { mcap: d.total_market_cap && d.total_market_cap.usd, dom: d.market_cap_percentage && d.market_cap_percentage.btc, chg: d.market_cap_change_percentage_24h_usd, at: now }; }, function (e) { errs.push('CoinGecko (بازار کل): ' + e.message); }),
      any(irxSources(), 'رمزارز به ریال').then(function (o) { o.at = now; S.snap.nbx = o; }, function (e) { errs.push(e.message); }),
      any(fundSources(), 'Funding Rate').then(function (o) { o.at = now; S.snap.funding = o; }, function (e) { errs.push(e.message); }),
      any(oiSources(), 'Open Interest').then(function (o) { o.at = now; S.snap.oi = o; }, function (e) { errs.push(e.message); }),
      D.web('https://api.alternative.me/fng/?limit=1', 'alternative.me').then(function (j) { var d = (j.data || [])[0]; if (!d) throw new Error('بدون داده'); S.snap.fng = { v: Number(d.value), label: d.value_classification, at: now }; }, function (e) { errs.push('شاخص ترس و طمع: ' + e.message); }),
      k && avDue ? D.web('https://www.alphavantage.co/query?function=GOLD_SILVER_SPOT&symbol=SILVER&apikey=' + encodeURIComponent(k), 'Alpha Vantage').then(function (j) { S.snap.silver = { raw: j, at: now }; avUsed = true; }, function (e) { errs.push('نقره (Alpha Vantage): ' + e.message); }) : Promise.resolve()];
    return Promise.all(snaps.concat([one(), one(), one()])).then(function () {
      if (avUsed) S.avAt = now;
      var got = Object.keys(S.data).length + Object.keys(S.snap).length; if (!got) throw new Error(SG.summErr(errs));
      var used = {}; Object.keys(S.srcOf).forEach(function (id) { used[String(S.srcOf[id]).replace(/ \(.*\)$/, '')] = 1; }); ['nbx', 'funding', 'oi'].forEach(function (x) { if (S.snap[x] && S.snap[x].src) used[S.snap[x].src] = 1; });
      SG.stampData(S, Object.keys(used).join(' + ') || 'CoinGecko'); S.lastErrs = errs.slice(0, 20); if (Hub.ingest) Hub.ingest.finish({ kind: 'global', series: list.length }); return errs; }, function (e) { if (Hub.ingest) Hub.ingest.finish({ kind: 'global', err: e.message }); throw e; });
  }
  SG.feeds.push({ id: 'sig-global', title: 'Global markets (crypto, energy, rates)', storeKey: KEY, sample: sample, fetch: fetchAll, size: function (S) { return Object.keys(S.data || {}).length + ' سری'; } });

  /* ---------- one view over every series in the hub ---------- */
  function rowsAll() {
    var out = [], st = function (k, d) { var v = U.store.get(k, null); return v && v.version === 1 && v.meta && !/synthetic|illustrative/i.test(v.meta.source || '') ? v : d; };
    var G = st(KEY, null); if (G) SER.forEach(function (s) { var r = G.data && G.data[s.id]; if (r && r.length) out.push({ id: 'g:' + s.id, name: s.name, mk: s.mk, unit: s.unit, src: (G.srcOf && G.srcOf[s.id]) || s.src, rows: r, fresh: s.fresh }); });
    var ST = st('hub.sigstocks.v1', null), ix = ST && ST.data && ST.data._idx; if (ix && ix.total) out.push({ id: 'tse:total', name: 'شاخص کل بورس', mk: 'iran', unit: 'واحد', src: 'TSETMC', rows: ix.total, fresh: 5 });
    if (ix && ix.ew) out.push({ id: 'tse:ew', name: 'شاخص هم‌وزن', mk: 'iran', unit: 'واحد', src: 'TSETMC', rows: ix.ew, fresh: 5 });
    [['hub.sig-gold.v1', 'طلا و سکه'], ['hub.sig-fx.v1', 'ارز']].forEach(function (p) { var S = st(p[0], null); if (!S) return; (S.ins || []).forEach(function (x) { var r = S.data && S.data[x.key]; if (r && r.length && !out.some(function (o) { return o.id === 'tg:' + x.key; })) out.push({ id: 'tg:' + x.key, name: x.series, mk: 'iran', unit: x.key === 'ons' ? 'دلار' : 'ریال', src: 'TGJU', rows: r, fresh: x.key === 'ons' ? 5 : 4 }); }); });
    var LV = st('hub.longview.v1', null); if (LV && Hub.iranMarkets) (LV.assets || []).forEach(function (a) { if (!/oil|crypto-bitcoin/.test(a.key || '')) return; var r = Hub.iranMarkets.series(LV, a.name).d; if (r && r.length) out.push({ id: 'lv:' + a.key, name: a.name + ' (TGJU)', mk: /oil/.test(a.key) ? 'energy' : 'crypto', unit: 'دلار', src: 'TGJU', rows: r, fresh: /oil/.test(a.key) ? 6 : 2 }); });
    return out;
  }
  function d2(d) { var y = Math.floor(d / 10000), m = Math.floor(d / 100) % 100; return Date.UTC(y, m - 1, d % 100) / 864e5; }
  function lastOf(id) { var r = rowsAll().filter(function (o) { return o.id === id; })[0]; return r && r.rows.length ? r.rows[r.rows.length - 1] : null; }
  function health() {
    var now = Date.now() / 864e5, items = rowsAll().map(function (o) {
      var r = o.rows.filter(function (x) { return isF(x.close) && x.close > 0; }), L = r[r.length - 1], age = L ? Math.floor(now - d2(L.date)) : NaN, iss = [];
      if (!isF(age) || age > o.fresh) iss.push('قدیمی: ' + (isF(age) ? age + ' روز' : 'بدون تاریخ'));
      var tail = r.slice(-250), gaps = 0; for (var i = 1; i < tail.length; i++) if (d2(tail[i].date) - d2(tail[i - 1].date) > (o.fresh > 20 ? 62 : 7)) gaps++; if (gaps) iss.push(gaps + ' شکاف بیش از ' + (o.fresh > 20 ? 'دو ماه' : 'یک هفته'));
      var rets = []; for (i = Math.max(1, r.length - 61); i < r.length; i++) rets.push(Math.log(r[i].close / r[i - 1].close)); var m = rets.reduce(function (a, b) { return a + b; }, 0) / (rets.length || 1), sd = Math.sqrt(rets.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / Math.max(1, rets.length - 1));
      var outl = rets.filter(function (x) { return Math.abs(x - m) > Math.max(6 * sd, 0.25); }).length; if (outl) iss.push(outl + ' جهش غیرعادی در ۶۰ دادهٔ اخیر');
      return { id: o.id, name: o.name, src: o.src, mk: o.mk, n: r.length, last: L ? L.close : NaN, date: L ? L.date : null, age: age, ok: !iss.length, issues: iss };
    });
    var X = function (a, b, tol, label, why) { var A = lastOf(a), B = lastOf(b); if (!A || !B) return null; var diff = A.close / B.close - 1; return { label: label, a: A.close, b: B.close, diff: diff, ok: Math.abs(diff) <= tol, tol: tol, why: why, dates: [A.date, B.date] }; };
    var G = U.store.get(KEY, null), nb = G && G.snap && G.snap.nbx, cross = [
      X('tg:price_dollar_rl', 'tg:crypto-tether-irr', 0.04, 'دلار آزاد (TGJU) در برابر تتر (TGJU)', 'تتر معمولاً نزدیک دلار آزاد معامله می‌شود؛ اختلاف بیش از ۴٪ غیرعادی است'),
      X('tg:geram18', 'tg:geram24', NaN, '', ''), X('lv:oil_brent', 'g:brent', 0.03, 'نفت برنت: TGJU در برابر منبع جهانی (Alpha Vantage)', 'دو منبع مستقل؛ تفاوت تاریخ و نوع قیمت (لحظه‌ای/تسویه) هم اختلاف می‌سازد'),
      X('lv:crypto-bitcoin', 'g:btc', 0.03, 'بیت‌کوین: TGJU در برابر CoinGecko', 'دو منبع مستقل؛ زمان ثبت قیمت متفاوت است')].filter(function (c) { return c && c.label; });
    var g18 = lastOf('tg:geram18'), g24 = lastOf('tg:geram24'); if (g18 && g24) { var d0 = g18.close / (g24.close * 0.75) - 1; cross.push({ label: 'طلای ۱۸ عیار در برابر ۷۵٪ طلای ۲۴ عیار', a: g18.close, b: g24.close * 0.75, diff: d0, ok: Math.abs(d0) <= 0.015, tol: 0.015, why: 'عیار ۱۸ = ۷۵٪ عیار ۲۴؛ اختلاف بیش از ۱٫۵٪ یعنی یکی از دو سری مشکل دارد' }); }
    var usdt = lastOf('tg:crypto-tether-irr'); if (nb && nb.usdtRls && isF(nb.usdtRls.last) && usdt) { var d1 = usdt.close / nb.usdtRls.last - 1; cross.push({ label: 'تتر: TGJU در برابر نوبیتکس', a: usdt.close, b: nb.usdtRls.last, diff: d1, ok: Math.abs(d1) <= 0.03, tol: 0.03, why: 'دو منبع داخلی مستقل؛ نوبیتکس آخرین معامله است و TGJU قیمت پایانی/تأخیری' }); }
    var btc = lastOf('g:btc'); if (nb && nb.btcUsdt && isF(nb.btcUsdt.last) && btc) { var d3 = nb.btcUsdt.last / btc.close - 1; cross.push({ label: 'بیت‌کوین: نوبیتکس (BTC-USDT) در برابر CoinGecko', a: nb.btcUsdt.last, b: btc.close, diff: d3, ok: Math.abs(d3) <= 0.02, tol: 0.02, why: 'CoinGecko میانگین صرافی‌هاست؛ صرافی داخلی می‌تواند صرف یا کسر داشته باشد' }); }
    return { items: items, cross: cross, at: Date.now() };
  }
  var HIER = [['دلار، یورو، درهم بازار آزاد ایران', 'TGJU', 'تتر TGJU و نوبیتکس (کنترل اختلاف)'], ['طلا و سکه داخلی', 'TGJU', 'سازگاری ۱۸ و ۲۴ عیار؛ ارزش ذاتی از اونس × دلار'], ['اونس جهانی طلا', 'TGJU', 'Alpha Vantage (GOLD_SILVER_SPOT)'],
    ['بورس (شاخص، نمادها، اختیار)', 'TSETMC', '—'], ['بیت‌کوین و اتریوم (دلاری)', 'CoinGecko', 'TGJU و نوبیتکس BTC-USDT'], ['رمزارز به ریال', 'نوبیتکس', 'والکس، بیت‌پین (اگر نوبیتکس جواب ندهد)'], ['مشتقات بیت‌کوین (Funding، OI)', 'OKX (عمومی)', 'Bitget، KuCoin، MEXC (OKX به IP ایران جواب نمی‌دهد)'],
    ['نفت برنت', 'TGJU (هر بار)', 'Alpha Vantage با کلید شما (روزی یک بار)'], ['نفت WTI و گاز طبیعی (هنری هاب)', 'Alpha Vantage با کلید شما (روزی یک بار؛ دادهٔ EIA)', '—'], ['مس و آلومینیوم (ماهانه)', 'Alpha Vantage (هفته‌ای یک بار؛ دادهٔ ماهانه)', '—'], ['بازده اوراق ۱۰ سالهٔ آمریکا', 'وزارت خزانه‌داری آمریکا (رسمی، روزانه)', 'Alpha Vantage'], ['نرخ بهرهٔ فدرال', 'فدرال رزرو نیویورک (EFFR، رسمی)', 'Alpha Vantage'], ['شاخص‌های جهانی سهام (۱۴)', 'CNBC (سرویس نمودار، غیررسمی)', '— (Yahoo و FRED از شبکهٔ شما جواب نمی‌دهند)'], ['نرخ بدون ریسک ریالی', 'TSETMC (قیمت اخزا ← بازده)', '—']];
  // intermarket: 60- and 250-day correlations of daily returns on common dates (correlation is not causation)
  function corr(a, b, n) { var A = {}, out = []; a.forEach(function (r, i) { if (i) A[r.date] = Math.log(r.close / a[i - 1].close); }); b.forEach(function (r, i) { if (i && A[r.date] != null) out.push([A[r.date], Math.log(r.close / b[i - 1].close)]); }); out = out.slice(-n); if (out.length < Math.min(40, n * 0.6)) return NaN;
    var mx = 0, my = 0; out.forEach(function (p) { mx += p[0]; my += p[1]; }); mx /= out.length; my /= out.length; var sxy = 0, sx = 0, sy = 0; out.forEach(function (p) { sxy += (p[0] - mx) * (p[1] - my); sx += (p[0] - mx) * (p[0] - mx); sy += (p[1] - my) * (p[1] - my); }); return sx > 0 && sy > 0 ? sxy / Math.sqrt(sx * sy) : NaN; }
  function intermarket() {
    var A = {}; rowsAll().forEach(function (o) { A[o.id] = o.rows; });
    var P = [['tg:price_dollar_rl', 'tg:geram18', 'دلار و طلای ۱۸'], ['tg:price_dollar_rl', 'tse:total', 'دلار و شاخص کل'], ['tg:ons', 'tg:geram18', 'اونس و طلای ۱۸'], ['lv:oil_brent', 'tse:total', 'نفت برنت و شاخص کل'], ['g:brent', 'tse:total', 'نفت برنت (AV) و شاخص کل'], ['g:btc', 'tg:crypto-tether-irr', 'بیت‌کوین و تتر'], ['g:ust10', 'tg:ons', 'بازده اوراق آمریکا و اونس'], ['g:btc', 'g:eth', 'بیت‌کوین و اتریوم']];
    return P.filter(function (p) { return A[p[0]] && A[p[1]]; }).map(function (p) { var c60 = corr(A[p[0]], A[p[1]], 60), c250 = corr(A[p[0]], A[p[1]], 250); return { label: p[2], c60: c60, c250: c250, brk: isF(c60) && isF(c250) && Math.abs(c60 - c250) >= 0.4 }; });
  }
  Hub.globalMkt = { KEY: KEY, SER: SER, MKFA: MKFA, rowsAll: rowsAll, deepen: deepen, kuRows: kuRows, health: health, HIER: HIER, intermarket: intermarket, fetchAll: fetchAll, store: function () { return U.store.get(KEY, null); } };
})(typeof window !== 'undefined' ? window : globalThis);
