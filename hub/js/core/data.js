/* =====================================================================
 * LIVE DATA LAYER
 * Providers (free tiers, API key required, called directly from the browser):
 *   FMP           https://financialmodelingprep.com/stable/...   (primary)
 *   Alpha Vantage https://www.alphavantage.co/query?function=... (fallback)
 * Keys live only in this browser's localStorage and are redacted from logs.
 *
 * Every fetch returns a normalised object so models never see raw provider
 * field names. Add a provider by implementing the same four functions.
 *
 * Limits (stated, not hidden):
 *   - Iranian listed companies (TSE / IFB) are not covered by these
 *     providers. Use paste-from-Excel (Codal exports) for those.
 *   - Inside a claude.ai artifact the page sandbox blocks all outbound
 *     requests. Live data works when index.html is opened locally.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  var U = Hub.util;

  var KEY_STORE = 'hub.keys.v1';
  var log = [];
  function keys() { return U.store.get(KEY_STORE, { fmp: '', av: '', primary: 'fmp', tseProxy: '' }); }
  function setKeys(k) { U.store.set(KEY_STORE, k); }

  // requests and bytes downloaded (JSON over the provider routes): the update log reads it per stage (directive 19 · 9)
  var NET = { req: 0, bytes: 0, by: {} };
  function record(entry) {
    entry.time = new Date().toLocaleTimeString();
    log.unshift(entry); if (log.length > 60) log.pop();
    if (root.document) document.dispatchEvent(new CustomEvent('hub:datalog'));
  }

  // a request that never answers (VPN on, weak line) must not freeze an update: give up after `ms`
  function tfetch(url, ms) {
    if (typeof AbortController === 'undefined') return fetch(url, { cache: 'no-store' });
    var ac = new AbortController(), t = setTimeout(function () { ac.abort(); }, ms || 15000);
    return fetch(url, { cache: 'no-store', signal: ac.signal }).then(function (r) { clearTimeout(t); return r; }, function (e) { clearTimeout(t); if (e && e.name === 'AbortError') throw new Error('timeout'); throw e; });
  }
  function getJSON(url, source, override) {
    if (override) url = override;
    var shown = decodeURIComponent(url).replace(/apikey=[^&]+/i, 'apikey=•••');
    return tfetch(url, /OptionMarketWatch|GetMarketWatch|GetClientTypeAll|DailyList\/\d+\/[0-9]{4}/.test(url) ? 40000 : 15000).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).then(function (t) {
      NET.req++; NET.bytes += t.length; var hs = host(url); NET.by[hs] = NET.by[hs] || { req: 0, bytes: 0 }; NET.by[hs].req++; NET.by[hs].bytes += t.length;
      var j = JSON.parse(t);
      // provider-level errors arrive as 200 with a message body
      var msg = j && (j['Error Message'] || j['Information'] || j['Note'] || j.error || (j.message && !Array.isArray(j) ? j.message : null));
      if (msg) throw new Error(String(msg).slice(0, 160));
      record({ source: source, url: shown, ok: true });
      return j;
    }).catch(function (e) {
      var m = e && e.message || String(e);
      if (e instanceof TypeError) m = 'blocked before reaching the server (CORS, offline, or artifact sandbox)';
      record({ source: source, url: shown, ok: false, msg: m });
      throw new Error(source + ': ' + m);
    });
  }

  function n(v) { var x = Number(v); return isFinite(x) ? x : 0; }
  function pick(o, ks) { for (var i = 0; i < ks.length; i++) if (o && o[ks[i]] != null && o[ks[i]] !== 'None') return n(o[ks[i]]); return 0; }
  function need(k, name) { if (!k) throw new Error('No ' + name + ' API key. Add one on the Data sources page.'); return k; }

  /* ---------------- FMP ---------------- */
  var FMP = 'https://financialmodelingprep.com/stable/';
  function fmp(path, params) {
    var k = need(keys().fmp, 'FMP');
    var qs = Object.keys(params || {}).map(function (p) { return p + '=' + encodeURIComponent(params[p]); }).join('&');
    return getJSON(FMP + path + '?' + qs + (qs ? '&' : '') + 'apikey=' + encodeURIComponent(k), 'FMP');
  }
  var fmpProvider = {
    name: 'FMP',
    quote: function (sym) {
      return fmp('profile', { symbol: sym }).then(function (a) {
        var p = Array.isArray(a) ? a[0] : a;
        if (!p) throw new Error('FMP: symbol not found');
        var price = n(p.price), mcap = n(p.marketCap);
        return { symbol: sym, name: p.companyName, currency: p.currency, price: price, beta: n(p.beta),
                 marketCap: mcap, shares: price ? mcap / price : 0, exchange: p.exchange, sector: p.sector, industry: p.industry };
      });
    },
    financials: function (sym, years) {
      var q = { symbol: sym, period: 'annual', limit: years };
      return Promise.all([fmp('income-statement', q), fmp('balance-sheet-statement', q), fmp('cash-flow-statement', q)])
        .then(function (r) {
          var is = r[0] || [], bs = r[1] || [], cf = r[2] || [];
          if (!is.length) throw new Error('FMP: no statements returned for ' + sym);
          // providers return newest first; models want oldest first
          is = is.slice(0, years).reverse(); bs = bs.slice(0, years).reverse(); cf = cf.slice(0, years).reverse();
          return normalise('FMP', is.map(function (x, i) {
            var b = bs[i] || {}, c = cf[i] || {};
            return {
              year: 'FY' + (x.fiscalYear || String(x.date).slice(0, 4)), currency: x.reportedCurrency,
              revenue: n(x.revenue), cogs: n(x.costOfRevenue), sga: n(x.sellingGeneralAndAdministrativeExpenses),
              da: pick(c, ['depreciationAndAmortization']) || n(x.depreciationAndAmortization),
              operatingIncome: n(x.operatingIncome), interestExp: n(x.interestExpense), interestInc: n(x.interestIncome),
              ebt: n(x.incomeBeforeTax), tax: n(x.incomeTaxExpense),
              cash: pick(b, ['cashAndShortTermInvestments', 'cashAndCashEquivalents']), ar: n(b.netReceivables), inventory: n(b.inventory),
              totalCA: n(b.totalCurrentAssets), ppe: n(b.propertyPlantEquipmentNet), totalAssets: n(b.totalAssets),
              ap: n(b.accountPayables), std: n(b.shortTermDebt), ltd: n(b.longTermDebt), totalCL: n(b.totalCurrentLiabilities),
              totalLiab: n(b.totalLiabilities), minority: n(b.minorityInterest),
              cfo: n(c.operatingCashFlow), capex: Math.abs(n(c.capitalExpenditure)),
              dividends: Math.abs(pick(c, ['commonDividendsPaid', 'netDividendsPaid', 'dividendsPaid']))
            };
          }));
        });
    },
    riskFree: function () {
      return fmp('treasury-rates', {}).then(function (a) {
        var r = Array.isArray(a) ? a[0] : null;
        if (!r) throw new Error('FMP: no treasury data');
        return { tenor: '10Y', rate: n(r.year10) / 100, date: r.date, curve: r, label: 'US Treasury 10Y (FMP)' };
      });
    }
  };

  /* ---------------- Alpha Vantage ---------------- */
  var AV = 'https://www.alphavantage.co/query?';
  function av(fn, params) {
    var k = need(keys().av, 'Alpha Vantage');
    var qs = Object.keys(params || {}).map(function (p) { return p + '=' + encodeURIComponent(params[p]); }).join('&');
    return getJSON(AV + 'function=' + fn + (qs ? '&' + qs : '') + '&apikey=' + encodeURIComponent(k), 'Alpha Vantage');
  }
  var avProvider = {
    name: 'Alpha Vantage',
    quote: function (sym) {
      return Promise.all([av('GLOBAL_QUOTE', { symbol: sym }), av('OVERVIEW', { symbol: sym })]).then(function (r) {
        var q = r[0]['Global Quote'] || {}, o = r[1] || {};
        if (!q['05. price']) throw new Error('Alpha Vantage: symbol not found');
        return { symbol: sym, name: o.Name, currency: o.Currency, price: n(q['05. price']), beta: n(o.Beta),
                 marketCap: n(o.MarketCapitalization), shares: n(o.SharesOutstanding), exchange: o.Exchange, sector: o.Sector, industry: o.Industry };
      });
    },
    financials: function (sym, years) {
      // sequential: the free tier rejects bursts
      var out = {};
      return av('INCOME_STATEMENT', { symbol: sym }).then(function (a) { out.is = a.annualReports || []; return av('BALANCE_SHEET', { symbol: sym }); })
        .then(function (b) { out.bs = b.annualReports || []; return av('CASH_FLOW', { symbol: sym }); })
        .then(function (c) {
          out.cf = c.annualReports || [];
          if (!out.is.length) throw new Error('Alpha Vantage: no statements for ' + sym);
          var is = out.is.slice(0, years).reverse(), bs = out.bs.slice(0, years).reverse(), cf = out.cf.slice(0, years).reverse();
          return normalise('Alpha Vantage', is.map(function (x, i) {
            var b = bs[i] || {}, f = cf[i] || {};
            return {
              year: 'FY' + String(x.fiscalDateEnding).slice(0, 4), currency: x.reportedCurrency,
              revenue: pick(x, ['totalRevenue']), cogs: pick(x, ['costOfRevenue', 'costofGoodsAndServicesSold']),
              sga: pick(x, ['sellingGeneralAndAdministrative']), da: pick(f, ['depreciationDepletionAndAmortization']) || pick(x, ['depreciationAndAmortization']),
              operatingIncome: pick(x, ['operatingIncome']), interestExp: pick(x, ['interestExpense']), interestInc: pick(x, ['interestIncome']),
              ebt: pick(x, ['incomeBeforeTax']), tax: pick(x, ['incomeTaxExpense']),
              cash: pick(b, ['cashAndShortTermInvestments', 'cashAndCashEquivalentsAtCarryingValue']), ar: pick(b, ['currentNetReceivables']),
              inventory: pick(b, ['inventory']), totalCA: pick(b, ['totalCurrentAssets']), ppe: pick(b, ['propertyPlantEquipment']),
              totalAssets: pick(b, ['totalAssets']), ap: pick(b, ['currentAccountsPayable']), std: pick(b, ['shortTermDebt', 'currentDebt']),
              ltd: pick(b, ['longTermDebtNoncurrent', 'longTermDebt']), totalCL: pick(b, ['totalCurrentLiabilities']),
              totalLiab: pick(b, ['totalLiabilities']), minority: 0,
              cfo: pick(f, ['operatingCashflow']), capex: Math.abs(pick(f, ['capitalExpenditures'])),
              dividends: Math.abs(pick(f, ['dividendPayoutCommonStock', 'dividendPayout']))
            };
          }));
        });
    },
    riskFree: function () {
      return av('TREASURY_YIELD', { interval: 'daily', maturity: '10year' }).then(function (j) {
        var d = (j.data || []).find(function (x) { return x.value && x.value !== '.'; });
        if (!d) throw new Error('Alpha Vantage: no treasury data');
        return { tenor: '10Y', rate: n(d.value) / 100, date: d.date, label: 'US Treasury 10Y (Alpha Vantage)' };
      });
    }
  };

  /* ---------- normalisation into model line items ------------------
   * Plugs are chosen so the model ties to the reported subtotals:
   *   otherOpex  = gross profit - SG&A - D&A - reported operating income
   *                (captures R&D and any other operating line)
   *   otherNonOp = reported EBT - (EBIT - interest exp + interest inc)
   *   otherCA / otherNCA / otherCL / otherNCL = residuals to reported totals
   *   equity     = total assets - total liabilities - minority (so BS balances) */
  function normalise(src, rows) {
    return {
      source: src,
      currency: rows[rows.length - 1].currency,
      years: rows.map(function (r) { return r.year; }),
      raw: rows,
      lines: rows.map(function (r) {
        var gp = r.revenue - r.cogs;
        return {
          revenue: r.revenue, cogs: r.cogs, sga: r.sga, da: r.da,
          otherOpex: gp - r.sga - r.da - r.operatingIncome,
          interestExp: r.interestExp, interestInc: r.interestInc,
          otherNonOp: r.ebt - (r.operatingIncome - r.interestExp + r.interestInc), tax: r.tax,
          cash: r.cash, ar: r.ar, inventory: r.inventory, otherCA: r.totalCA - r.cash - r.ar - r.inventory,
          ppe: r.ppe, otherNCA: r.totalAssets - r.totalCA - r.ppe,
          ap: r.ap, std: r.std, otherCL: r.totalCL - r.ap - r.std, ltd: r.ltd,
          otherNCL: r.totalLiab - r.totalCL - r.ltd, minority: r.minority,
          equity: r.totalAssets - r.totalLiab - r.minority,
          cfo: r.cfo, capex: r.capex, dividends: r.dividends
        };
      })
    };
  }


  /* ---------------- TSETMC (Tehran Stock Exchange) ----------------
   * Public JSON API at cdn.tsetmc.com/api/ (same endpoints the official site uses;
   * documented by the open-source `tsetmc` Python library, v4.1.1).
   * Prices are in rials. Daily history is NOT adjusted for capital increases or
   * dividends, so ATR / volatility around those dates is distorted.
   * TSETMC may refuse requests from outside Iran or from a browser page (CORS).
   * If the direct call is refused, set a proxy prefix on Data sources & keys. */
  var TSE = 'https://cdn.tsetmc.com/api/';
  function faNorm(s) { return String(s == null ? '' : s).replace(/ي/g, 'ی').replace(/ك/g, 'ک'); }
  /* route: your proxy prefix (if set) → direct → the local proxy on this computer (hub-proxy, 127.0.0.1:8787).
   * The first route that answers is remembered for the session and tried first next time. */
  var LOCAL = 'http://127.0.0.1:8787/?url=', good = {}, lastRoute = { name: '—', at: null };
  function host(u) { var m = /^https?:\/\/([^\/]+)/.exec(u); return m ? m[1] : u; }
  // same-origin proxy: when the hub is served by hub-server (phone / any host), it answers at ./proxy?url= — no CORS, nothing to configure
  var SAME = null, sameP = null;
  function detectSame() {
    if (sameP) return sameP;
    var loc = root.location || {}; if (!/^https?:$/.test(loc.protocol || '') || /claude|anthropic/.test(loc.host || '')) return (sameP = Promise.resolve(false));
    return (sameP = fetch('proxy/health', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j && j.ok) SAME = 'proxy?url='; return !!SAME; }).catch(function () { return false; }));
  }
  var HTTPS = !!(root.location && root.location.protocol === 'https:'), dead = {};
  /* the hub server on this PC (run-hub.bat → 127.0.0.1:8790/proxy). When the hub is opened as a file (Finance-Models-Hub.html)
   * there is no same-origin proxy, so the page asks the PC server directly — it answers with CORS headers. */
  var PCSRV = 'http://127.0.0.1:8790/proxy?url=', PC = null, pcP = null, pcAt = 0;
  function detectPC() {
    if (SAME || HTTPS) return Promise.resolve(false);
    if (pcP && (PC || Date.now() - pcAt < 60000)) return pcP;
    pcAt = Date.now();
    return (pcP = tfetch('http://127.0.0.1:8790/proxy/health', 2500).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { PC = j && j.ok ? PCSRV : null; return !!PC; }).catch(function () { PC = null; return false; }));
  }
  /* public CORS relays — last resort on the phone (https page, no server of ours). Only for public, key-free URLs of the hosts below:
     no API key, token or account data ever goes through them. They are third-party free services: availability is not guaranteed. */
  var RELAY_HOSTS = /^(query[12]\.finance\.yahoo\.com|fred\.stlouisfed\.org|markets\.newyorkfed\.org)$/;
  var RELAYS = [['public relay (allorigins)', 'https://api.allorigins.win/raw?url='], ['public relay (codetabs)', 'https://api.codetabs.com/v1/proxy/?quest=']];
  function relayOK(hst, url) { return HTTPS && !SAME && RELAY_HOSTS.test(hst) && !/[?&](api_?key|apikey|token|key|access_token)=/i.test(url || ''); }
  function routes(hst, url) { var px = (keys().tseProxy || '').trim(), r = [], g = good[hst]; if (px) r.push(['your proxy', px]); if (SAME) r.push(['server proxy', SAME]); r.push(['direct', '']); if (PC && px.indexOf('127.0.0.1:8790') < 0) r.push(['PC hub server', PC]); if (relayOK(hst, url)) RELAYS.forEach(function (x) { r.push(x); }); if (px.indexOf('127.0.0.1:8787') < 0 && !HTTPS) r.push(['local proxy', LOCAL]); if (g) r.sort(function (a, b) { return (b[0] === g) - (a[0] === g); }); return r; }
  function wrap(px, url) { return !px ? url : px.indexOf('{url}') >= 0 ? px.replace('{url}', encodeURIComponent(url)) : px + encodeURIComponent(url); }
  function routed(url, source, get) {
    var hst = host(url), list = routes(hst, url), errs = [];
    function next(i) {
      if (i >= list.length) {
        var faL = Hub.i18n && Hub.i18n.lang() === 'fa', tried = list.map(function (x) { return x[0]; }).join(faL ? '، ' : ', ');
        var e = new Error(source + ': ' + (HTTPS ? (/(\.ir|tgju\.org|tsetmc\.com)$/.test(hst) ? (faL ? 'به سرور نرسید (' + (errs[errs.length - 1] || '') + '). این سرور فقط از اینترنت داخل ایران جواب می‌دهد: فیلترشکن را خاموش کنید و دوباره بزنید؛ اگر نشد «تست اتصال» را بزنید.' : 'could not reach the server (' + (errs[errs.length - 1] || '') + '). It answers only from inside Iran: switch the VPN off and retry, or run the connection test.') : (faL ? 'از گوشی به این سرور نرسید (' + (errs[errs.length - 1] || '') + '); منبع بعدی امتحان می‌شود.' : 'not reachable from this page (' + (errs[errs.length - 1] || '') + ').'))
          : (faL ? 'به سرور نرسید (امتحان‌شده: ' + tried + ').' + (PC || SAME ? '' : ' سرور هاب روی این کامپیوتر روشن نیست: run-hub.bat را اجرا کنید (یا هاب را از http://127.0.0.1:8790 باز کنید).') : 'could not reach the server (tried: ' + tried + ').' + (PC || SAME ? '' : ' The hub server on this PC is not running: start run-hub.bat (or open the hub at http://127.0.0.1:8790).'))));
        e.routes = errs; e.detail = errs.join(' | '); if (!good[hst] && !errs.some(function (x) { return /timeout|HTTP 5\d\d|empty/.test(x); })) dead[hst] = { at: Date.now(), msg: e.message, detail: e.detail }; throw e; }
      return get(wrap(list[i][1], url)).then(function (r) { good[hst] = list[i][0]; lastRoute = { name: list[i][0], host: hst, at: Date.now() }; return r; })
        .catch(function (e) { errs.push(list[i][0] + ': ' + String(e && e.message || e).replace(/^[A-Za-z]+: /, '').slice(0, 90)); return next(i + 1); });
    }
    var dd = dead[hst]; if (dd && Date.now() - dd.at < 45000) { var de = new Error(dd.msg); de.detail = dd.detail; de.fast = true; return Promise.reject(de); }   // the host just failed on every route: do not wait 76 more timeouts
    return detectSame().then(detectPC).then(function () { list = routes(hst, url); return next(0); });
  }
  function resetRoutes() { dead = {}; if (!PC) pcP = null; }
  // connection test: each address is called straight from this page, one by one, and timed
  function diagnose(onRow) {
    var T = [['TSETMC · اطلاعات نماد (فولاد)', TSE + 'Instrument/GetInstrumentInfo/46348559193224090'], ['TSETMC · قیمت روزانه', TSE + 'ClosingPrice/GetClosingPriceDailyList/46348559193224090/5'], ['TSETMC · حقیقی/حقوقی', TSE + 'ClientType/GetClientTypeHistory/46348559193224090'],
      ['TSETMC · شاخص کل', TSE + 'Index/GetIndexB2History/32097828799138957'], ['TSETMC · تابلوی اختیار معامله', TSE + 'Instrument/GetInstrumentOptionMarketWatch/0'], ['TGJU · دلار', 'https://api.tgju.org/v1/market/indicator/summary-table-data/price_dollar_rl'],
      ['TGJU · قیمت لحظه‌ای', 'https://call.tgju.org/ajax.json'], ['خزانه‌داری آمریکا · بازده اوراق', 'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/2026/all?type=daily_treasury_yield_curve&field_tdr_date_value=2026&page&_format=csv'], ['CNBC · S&P 500', 'https://ts-api.cnbc.com/harmony/app/charts/1M.json?symbol=.SPX'], ['فدرال رزرو نیویورک · EFFR', 'https://markets.newyorkfed.org/api/rates/unsecured/effr/last/5.json'],
      ['نوبیتکس (apiv2)', 'https://apiv2.nobitex.ir/market/stats?srcCurrency=usdt&dstCurrency=rls'], ['والکس', 'https://api.wallex.ir/v1/markets'], ['Bitget · Funding', 'https://api.bitget.com/api/v2/mix/market/current-fund-rate?symbol=BTCUSDT&productType=usdt-futures'],
      ['rss2json (خبرها)', 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent('https://www.irna.ir/rss/tp/20')], ['رله allorigins', 'https://api.allorigins.win/raw?url=' + encodeURIComponent('https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10&cosd=2026-10-01')], ['رله codetabs', 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent('https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10&cosd=2026-10-01')]];
    var out = [], go = function (i) {
      if (i >= T.length) return Promise.resolve(out);
      var t0 = Date.now(), row = { name: T[i][0], url: T[i][1] };
      return tfetch(T[i][1], 20000).then(function (r) { row.status = r.status; return r.text(); }).then(function (t) { row.ok = row.status >= 200 && row.status < 300 && t.length > 2; row.bytes = t.length; }, function (e) { row.ok = false; row.err = e && e.message === 'timeout' ? 'timeout (۲۰ ثانیه بی‌پاسخ)' : e instanceof TypeError ? 'رد شد: شبکه یا CORS (' + (e.message || '') + ')' : String(e && e.message || e); })
        .then(function () { row.ms = Date.now() - t0; out.push(row); onRow && onRow(row, i, T.length); return go(i + 1); });
    };
    resetRoutes(); return go(0);
  }
  function viaProxy(url, source) { return routed(url, source, function (full) { return getJSON(full, source); }); }
  /* the same data from several mirrors / providers: the first that answers wins; the error lists every attempt.
     items are URLs (JSON) or {url, text:true, parse:fn} — parse may throw to reject an answer and move on. */
  function webAny(list, source, opt) {
    // opt.ms: give each source at most this long (the request may still finish in the background, it is just not waited for)
    // opt.skip: a shared {host: reason} map for one run — a host that timed out or was unreachable is not tried again for the next series
    opt = opt || {}; var errs = [], skip = opt.skip || null;
    function go(i) {
      if (i >= list.length) { var e = new Error(source + ': ' + errs.join(' ؛ ')); e.detail = errs.join(' | '); return Promise.reject(e); }
      var it = typeof list[i] === 'string' ? { url: list[i] } : list[i], nm = it.name || host(it.url || ''), hk = it.url ? host(it.url) : nm;
      if (skip && skip[hk]) { errs.push(nm + ': رد شد (در همین اجرا جواب نداده بود)'); return go(i + 1); }
      var p = it.fn ? it.fn() : it.text ? viaProxyText(it.url, it.name || source) : viaProxy(it.url, it.name || source), tm;
      if (opt.ms) p = Promise.race([p, new Promise(function (_, rej) { tm = setTimeout(function () { var x = new Error('timeout ' + Math.round(opt.ms / 1000) + 's'); x.netFail = true; rej(x); }, opt.ms); })]);
      return p.then(function (r) { clearTimeout(tm); var v = it.parse ? it.parse(r) : r; if (v && typeof v === 'object') try { Object.defineProperty(v, '_src', { value: nm, enumerable: false }); } catch (x) {} return v; })
        .catch(function (e) { clearTimeout(tm); var m = String(e && e.message || e);
          if (skip && (e && e.netFail || /timeout|نرسید|blocked|Failed to fetch|CORS|offline/i.test(m))) skip[hk] = m.slice(0, 80);
          errs.push(nm + ': ' + m.replace(/^[^:]{0,40}: /, '').slice(0, 120)); return go(i + 1); });
    }
    return go(0);
  }
  function tse(path) { return viaProxy(TSE + path, 'TSETMC'); }
  // raw text through the same proxy prefix (HTML pages, CSV)
  function viaProxyText(url, source) {
    return routed(url, source, function (full) {
      return tfetch(full, 20000).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
        .then(function (t) { NET.req++; NET.bytes += t.length; var hs = host(url); NET.by[hs] = NET.by[hs] || { req: 0, bytes: 0 }; NET.by[hs].req++; NET.by[hs].bytes += t.length; record({ source: source, url: url, ok: true }); return t; })
        .catch(function (e) { var m = e instanceof TypeError ? 'blocked (CORS / offline)' : e.message; record({ source: source, url: url, ok: false, msg: m }); throw new Error(m); });
    });
  }
  // is the local proxy running?
  function localPing() { return fetch('http://127.0.0.1:8787/health', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }); }
  var tseProvider = {
    name: 'TSETMC',
    search: function (q) {
      q = U.normaliseDigits(q).trim();
      return tse('Instrument/GetInstrumentSearch/' + encodeURIComponent(q)).then(function (j) {
        var list = (j && j.instrumentSearch) || [];
        if (!list.length && /[یک]/.test(q)) // retry with Arabic yeh/kaf used inside TSETMC
          return tse('Instrument/GetInstrumentSearch/' + encodeURIComponent(q.replace(/ی/g, 'ي').replace(/ک/g, 'ك'))).then(function (k) { return (k && k.instrumentSearch) || []; });
        return list;
      }).then(function (list) {
        return list.map(function (x) { return { insCode: String(x.insCode), symbol: faNorm(x.lVal18AFC), name: faNorm(x.lVal30), shares: n(x.zTitad), lastDate: x.lastDate, flow: x.flow, market: faNorm(x.flowTitle || '') }; });
      });
    },
    resolve: function (q) {
      if (/^\d{8,}$/.test(String(q).trim())) return Promise.resolve(String(q).trim());
      var want = faNorm(U.normaliseDigits(q).trim());
      return tseProvider.search(q).then(function (list) {
        if (!list.length) throw new Error('TSETMC: no instrument matches "' + q + '"');
        var exact = list.filter(function (x) { return x.symbol === want; });
        var pool = exact.length ? exact : list;
        pool.sort(function (a, b) { return (b.lastDate || 0) - (a.lastDate || 0); });   // most recently traded line
        return pool[0].insCode;
      });
    },
    quote: function (q) {
      return tseProvider.resolve(q).then(function (code) {
        return Promise.all([tse('Instrument/GetInstrumentInfo/' + code), tse('ClosingPrice/GetClosingPriceInfo/' + code)]).then(function (r) {
          var i = (r[0] && r[0].instrumentInfo) || {}, p = (r[1] && r[1].closingPriceInfo) || {}, eps = i.eps || {}, th = i.staticThreshold || {};
          var price = n(p.pClosing), shares = n(i.zTitad), e = n(eps.estimatedEPS);
          return { source: 'TSETMC', insCode: code, symbol: faNorm(i.lVal18AFC), name: faNorm(i.lVal30), currency: 'IRR',
            price: price, last: n(p.pDrCotVal), yesterday: n(p.priceYesterday), shares: shares, marketCap: price * shares,
            eps: e || null, pe: e ? price / e : null, sectorPE: n(eps.sectorPE) || null, psr: n(eps.psr) || null,
            freeFloat: i.kAjCapValCpsIdx ? n(i.kAjCapValCpsIdx) / 100 : null, sector: faNorm(i.sector && i.sector.lSecVal),
            limitHigh: n(th.psGelStaMax) || null, limitLow: n(th.psGelStaMin) || null, yearHigh: n(i.maxYear) || null, yearLow: n(i.minYear) || null,
            volume: n(p.zTotTran) ? n(p.qTotTran5J) : 0, date: p.dEven };
        });
      });
    },
    history: function (q, count) {
      return tseProvider.resolve(q).then(function (code) {
        return tse('ClosingPrice/GetClosingPriceDailyList/' + code + '/' + (count || 120)).then(function (j) {
          var rows = ((j && j.closingPriceDaily) || []).map(function (d) {
            return { date: String(d.dEven), open: n(d.priceFirst), high: n(d.priceMax), low: n(d.priceMin), close: n(d.pClosing), volume: n(d.qTotTran5J) };
          }).filter(function (d) { return d.close > 0 && d.high > 0; });
          rows.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
          return { source: 'TSETMC', insCode: code, rows: rows, adjusted: false, periodsPerYear: 240 };
        });
      });
    },
    // full daily bars for the signal engine (oldest first): yesterday price lets the engine back-adjust for capital events
    daily: function (code, count) {
      return tse('ClosingPrice/GetClosingPriceDailyList/' + code + '/' + (count || 265)).then(function (j) {
        var rows = ((j && j.closingPriceDaily) || []).map(function (d) {
          return { date: n(d.dEven), close: n(d.pClosing), last: n(d.pDrCotVal), open: n(d.priceFirst), high: n(d.priceMax), low: n(d.priceMin), yclose: n(d.priceYesterday),
            vol: n(d.qTotTran5J), val: n(d.qTotCap), trades: n(d.zTotTran) };
        }).filter(function (d) { return d.close > 0 && d.high > 0; });
        rows.sort(function (a, b) { return a.date - b.date; });
        return rows;
      });
    },
    // individual / institutional (حقیقی / حقوقی) daily history, oldest first
    clientType: function (code) {
      return tse('ClientType/GetClientTypeHistory/' + code).then(function (j) {
        var rows = ((j && j.clientType) || []).map(function (r) {
          return { date: n(r.recDate || r.dEven), buyI: n(r.buy_I_Value), sellI: n(r.sell_I_Value), buyN: n(r.buy_N_Value), sellN: n(r.sell_N_Value), buyIc: n(r.buy_CountI), sellIc: n(r.sell_CountI) };
        }).filter(function (r) { return r.date > 0; });
        rows.sort(function (a, b) { return a.date - b.date; });
        return rows;
      });
    },
    // option market watch (all listed TSE / IFB options, one row per strike with its call and put):
    // fields as used by the open-source oxtapus client (insCode_C/_P, uaInsCode, strikePrice, endDate, contractSize, oP = open interest, pMeDem / pMeOf = best bid / ask)
    optionWatch: function () {
      var get = function (f) { return tse('Instrument/GetInstrumentOptionMarketWatch/' + f).then(function (j) { return (j && j.instrumentOptMarketWatch) || []; }); };
      var side = function (r, k) { return { code: String(r['insCode_' + k] || ''), symbol: faNorm(r['lVal18AFC_' + k]), name: faNorm(r['lVal30_' + k]), close: n(r['pClosing_' + k]), last: n(r['pDrCotVal_' + k]), yclose: n(r['priceYesterday_' + k]),
        vol: n(r['qTotTran5J_' + k]), val: n(r['qTotCap_' + k]), trades: n(r['zTotTran_' + k]), oi: n(r['oP_' + k]), bid: n(r['pMeDem_' + k]), bidQ: n(r['qTitMeDem_' + k]), ask: n(r['pMeOf_' + k]), askQ: n(r['qTitMeOf_' + k]) }; };
      var day = function (v) { var d = String(v == null ? '' : v).replace(/\D/g, '').slice(0, 8); return d.length === 8 ? +d : 0; };
      return get(0).then(function (a) { return a.length ? a : Promise.all([get(1).catch(function () { return []; }), get(2).catch(function () { return []; })]).then(function (r) { return r[0].concat(r[1]); }); })
        .then(function (rows) { return rows.map(function (r) { return { ua: String(r.uaInsCode || ''), uaName: faNorm(r.lval30_UA), uaClose: n(r.pClosing_UA), strike: n(r.strikePrice), size: n(r.contractSize) || 1000,
          begin: day(r.beginDate), end: day(r.endDate), days: n(r.remainedDay), call: side(r, 'C'), put: side(r, 'P') }; }).filter(function (r) { return r.strike > 0 && r.end > 0; }); });
    },
    // index history: 32097828799138957 total index, 67130298613737946 equal-weight index
    /* today's session for the whole market in three requests (instead of one history request per symbol):
       market overview (session date, time, open / closed, both indices), market watch (every instrument's first / high / low /
       last trade / close / volume / value / trades) and the individual / institutional volumes of the session.
       Checked against TSETMC on 2026-11-15 from a PC in Iran: overview.marketActivityDEven = 20261115, marketStateTitle «بسته»;
       market watch 3,737 instruments (pcl = close, pdv = last trade, pf, pmx, pmn, py, qtj = volume, qtc = value, ztt = trades, hEven = time).
       The individual / institutional list gives volumes only; the session's values are volume × close (marked approx). */
    session: function (force) {
      if (!force && SESS && Date.now() - SESS.t < 90000) return SESS.p;   // the stock feed, the Iran-economy series and the temporal tool share one snapshot per update
      var pr = tseProvider._session(); SESS = { t: Date.now(), p: pr }; pr.catch(function () { SESS = null; }); return pr;
    },
    _session: function () {
      var mw = 'ClosingPrice/GetMarketWatch?market=0&paperTypes[0]=1&paperTypes[1]=2&paperTypes[2]=3&paperTypes[3]=4&paperTypes[4]=5&paperTypes[5]=6&paperTypes[6]=7&paperTypes[7]=8&paperTypes[8]=9&showTraded=false&withBestLimits=true&hEven=0&RefID=0';   // best limits (order book, 5 levels) — directive 26 · 2: bid / ask in the order ticket
      return Promise.all([tse('MarketData/GetMarketOverview/1'), tse(mw), tse('ClientType/GetClientTypeAll').catch(function () { return null; })]).then(function (r) {
        var o = (r[0] && r[0].marketOverview) || {}, d = n(o.marketActivityDEven), by = {}, ct = {};
        if (!(d > 20000000)) throw new Error('TSETMC: session date missing in the market overview');
        ((r[1] && r[1].marketwatch) || []).forEach(function (m) { if (!m || !m.insCode) return;
          by[String(m.insCode)] = { date: d, close: n(m.pcl), last: n(m.pdv), open: n(m.pf), high: n(m.pmx), low: n(m.pmn), yclose: n(m.py), vol: n(m.qtj), val: n(m.qtc), trades: n(m.ztt), hEven: n(m.hEven),
            // instrument identity carried by the same feed: symbol, name, official industry code (csv), paper type (yVal), flow, board, fund NAV (pRedTran), shares
            sym: faNorm(m.lva), name: faNorm(m.lvc), cs: String(m.csv == null ? '' : m.csv).trim(), yVal: n(m.yVal), flow: n(m.flow), board: String(m.cGrValCot || '').trim(), nav: n(m.pRedTran), shares: n(m.ztd), upper: n(m.pMax), lower: n(m.pMin),
            // order book at the time of the request (blDs: pmd / qmd / zmd = bid price / volume / orders, pmo / qmo / zmo = ask; field names checked on the live feed 2026-11-24): top 3 levels
            bl: Array.isArray(m.blDs) ? m.blDs.slice(0, 3).map(function (q) { return [n(q.pmd), n(q.qmd), n(q.pmo), n(q.qmo)]; }) : null }; });
        ((r[2] && r[2].clientTypeAllDto) || []).forEach(function (c) { if (c && c.insCode) ct[String(c.insCode)] = c; });
        var hh = n(o.marketActivityHEven), tm = hh ? ('0' + Math.floor(hh / 10000)).slice(-2) + ':' + ('0' + Math.floor(hh / 100) % 100).slice(-2) : '';
        return { date: d, hEven: hh, time: tm, state: String(o.marketState || ''), stateFa: o.marketStateTitle || '', open: o.marketState === 'F' || /باز/.test(o.marketStateTitle || ''),
          idx: { total: n(o.indexLastValue), ew: n(o.indexEqualWeightedLastValue) }, by: by, ct: ct, n: Object.keys(by).length, at: Date.now() };
      });
    },
    /* every index of a market with today's value (flow 1 = Tehran exchange, 2 = Farabourse): the headline indices and the industry
       indices (names carry the two-digit industry code: «01-زراعت», «فلزات اساسی27»). Endpoint and fields as used by the open-source
       clients tsetmc 4.1.1 (5j9/tsetmc) and iran-bourse-mcp: insCode, lVal30, xDrNivJIdx004 (value), xPhNivJIdx004 / xPbNivJIdx004, hEven, dEven. */
    indexList: function (flow) {
      return tse('Index/GetIndexB1LastAll/All/' + (flow || 1)).then(function (j) {
        return ((j && j.indexB1) || []).map(function (r) { var nm = faNorm(r.lVal30 || '').trim(), code = null, title = nm, m;
          if (!/^شاخص/.test(nm)) { if ((m = /^(\d{1,3})\s*[-–]?\s*(.+)$/.exec(nm))) { code = m[1]; title = m[2]; } else if ((m = /^(.+?)\s*[-–]?\s*(\d{2,3})$/.exec(nm))) { title = m[1]; code = m[2]; } }
          return { insCode: String(r.insCode || ''), name: title.trim(), raw: nm, code: code ? ('0' + code).slice(-2) : null, headline: /^شاخص/.test(nm), flow: flow || 1,
            value: n(r.xDrNivJIdx004), high: n(r.xPhNivJIdx004), low: n(r.xPbNivJIdx004), date: n(r.dEven), hEven: n(r.hEven) }; }).filter(function (r) { return r.insCode && r.value > 0; });
      });
    },
    // the fund registry of one type (4 fixed income, 5 commodity, 6 equity, 7 mixed, 21 sector, 22 leveraged, 23 index …): NAV, size, manager,
    // initiation date; no trading symbol (iran-bourse-mcp funds.py) — exchange-traded units are matched by name
    funds: function (type) { return tse('Fund/GetFunds/' + type).then(function (j) { return (j && j.funds) || []; }); },
    instrumentInfo: function (code) { return tse('Instrument/GetInstrumentInfo/' + code).then(function (j) { return (j && j.instrumentInfo) || {}; }); },
    index: function (code) {
      return tse('Index/GetIndexB2History/' + code).then(function (j) {
        var rows = ((j && j.indexB2) || []).map(function (r) { return { date: n(r.dEven), close: n(r.xNivInuClMresIbs), high: n(r.xNivInuPhMresIbs), low: n(r.xNivInuPbMresIbs) }; }).filter(function (r) { return r.close > 0; });
        rows.sort(function (a, b) { return a.date - b.date; });
        return rows;
      });
    }
  };
  var SESS = null, NOWP = null;
  /* TGJU (api.tgju.org) daily history: rows of html cells; dates Gregorian; prices: open, low, high, close */
  // len: incremental request (the newest `len` rows). TGJU's table endpoint takes the DataTables paging parameters; if a server ignores
  // them the full table comes back and is merged the same way (nothing is lost, only the saving)
  function tgju(key, len) {
    var q = len ? '?lang=fa&order_dir=desc&start=0&length=' + Math.max(5, Math.round(len)) : '';
    return viaProxy('https://api.tgju.org/v1/market/indicator/summary-table-data/' + encodeURIComponent(key) + q, 'TGJU').then(function (j) {
      var strip = function (v) { return String(v == null ? '' : v).replace(/<[^>]*>/g, '').trim(); };
      var rows = ((j && j.data) || []).map(function (row) {
        var cells = row.map(strip), date = null, nums = [];
        cells.forEach(function (c) { var m = /^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/.exec(c); if (m && +m[1] >= 1900 && !date) date = +m[1] * 10000 + +m[2] * 100 + +m[3]; else { var x = parseFloat(c.replace(/[^0-9.]/g, '')); if (isFinite(x) && x > 0) nums.push(x); } });
        return date && nums.length ? { date: date, open: nums[0], low: nums[1] || nums[0], high: nums[2] || nums[0], close: nums.length > 3 ? nums[3] : nums[0] } : null;
      }).filter(Boolean);
      rows.sort(function (a, b) { return a.date - b.date; });
      return rows;
    });
  }

  /* TGJU current prices for every series in one request (call.tgju.org/ajax.json, the file TGJU's own pages poll):
     current[key] = { p: price, h: high, l: low, d / dp: change, ts: 'YYYY-MM-DD HH:MM:SS' Tehran time }. Checked 2026-11-15 from a PC in Iran
     (geram18, price_dollar_rl, sekee, mesghal, crypto-tether-irr stamped 13:33 that day; ons stamped on its last world session). */
  function tgjuNow() {
    if (NOWP && Date.now() - NOWP.t < 90000) return NOWP.p;
    var pr = tgjuNow0(); NOWP = { t: Date.now(), p: pr }; pr.catch(function () { NOWP = null; }); return pr;
  }
  function tgjuNow0() {
    return webAny(['https://call.tgju.org/ajax.json', 'https://call1.tgju.org/ajax.json', 'https://call2.tgju.org/ajax.json', 'https://call3.tgju.org/ajax.json'], 'TGJU').then(function (j) {
      var cur = (j && j.current) || {}, out = {};
      Object.keys(cur).forEach(function (k) { var c = cur[k] || {}, num = function (v) { var x = parseFloat(String(v == null ? '' : v).replace(/[^0-9.]/g, '')); return isFinite(x) ? x : NaN; };
        var m = /^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?/.exec(c.ts || ''); if (!m) return; var p = num(c.p); if (!(p > 0)) return;
        out[k] = { date: +m[1] * 10000 + +m[2] * 100 + +m[3], time: m[4] ? m[4] + ':' + m[5] : '', ts: c.ts, close: p, high: num(c.h) > 0 ? num(c.h) : p, low: num(c.l) > 0 ? num(c.l) : p }; });
      return out;
    });
  }

  /* daily history for global symbols (ATR / volatility) */
  function historyGlobal(sym) {
    var k = keys();
    var tryFmp = function () {
      return fmp('historical-price-eod/full', { symbol: sym }).then(function (j) {
        var a = Array.isArray(j) ? j : (j && j.historical) || [];
        if (!a.length) throw new Error('FMP: no price history');
        var rows = a.slice(0, 260).map(function (d) { return { date: d.date, open: n(d.open), high: n(d.high), low: n(d.low), close: n(d.close), volume: n(d.volume) }; });
        rows.sort(function (x, y) { return x.date < y.date ? -1 : 1; });
        return { source: 'FMP', rows: rows, adjusted: false, periodsPerYear: 252 };
      });
    };
    var tryAv = function () {
      return av('TIME_SERIES_DAILY', { symbol: sym, outputsize: 'compact' }).then(function (j) {
        var ts = j['Time Series (Daily)'] || {};
        var rows = Object.keys(ts).map(function (d) { var x = ts[d]; return { date: d, open: n(x['1. open']), high: n(x['2. high']), low: n(x['3. low']), close: n(x['4. close']), volume: n(x['5. volume']) }; });
        if (!rows.length) throw new Error('Alpha Vantage: no price history');
        rows.sort(function (x, y) { return x.date < y.date ? -1 : 1; });
        return { source: 'Alpha Vantage', rows: rows, adjusted: false, periodsPerYear: 252 };
      });
    };
    if (k.primary === 'av' && k.av) return tryAv().catch(function (e) { if (k.fmp) return tryFmp(); throw e; });
    if (k.fmp) return tryFmp().catch(function (e) { if (k.av) return tryAv(); throw e; });
    if (k.av) return tryAv();
    return Promise.reject(new Error('No API key configured for global price history.'));
  }

  var providers = { fmp: fmpProvider, av: avProvider };
  function order() { var k = keys(); var p = k.primary === 'av' ? ['av', 'fmp'] : ['fmp', 'av']; return p.filter(function (x) { return x === 'fmp' ? k.fmp : k.av; }); }

  // try providers in order; first success wins
  function call(method, args) {
    var list = order();
    if (!list.length) return Promise.reject(new Error('No API key configured. Add an FMP or Alpha Vantage key on the Data sources page.'));
    var errors = [];
    function next(i) {
      if (i >= list.length) return Promise.reject(new Error(errors.join(' | ')));
      var p = providers[list[i]];
      return p[method].apply(p, args).then(function (r) { r._provider = p.name; return r; })
        .catch(function (e) { errors.push(e.message); return next(i + 1); });
    }
    return next(0);
  }

  Hub.data = {
    keys: keys, setKeys: setKeys, log: function () { return log; },
    quote: function (sym) { return call('quote', [sym]); },
    financials: function (sym, years) { return call('financials', [sym, years || 3]); },
    riskFree: function () { return call('riskFree', []); },
    test: function (which) { return which === 'tse' ? tseProvider.quote('فولاد') : providers[which].riskFree(); },
    text: function (url, source) { return routed(url, source || host(url), function (u) { return tfetch(u, 20000).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); }); }); },   // any text page (RSS) over the same routes as the market data
    net: function () { return { req: NET.req, bytes: NET.bytes, by: JSON.parse(JSON.stringify(NET.by)) }; },
    tse: tseProvider, tgju: tgju, tgjuNow: tgjuNow, web: viaProxy, webAny: webAny, webText: viaProxyText, route: function () { return lastRoute; }, diagnose: diagnose, resetRoutes: resetRoutes, localPing: localPing, LOCAL: LOCAL, https: HTTPS, serverProxy: function () { return detectSame().then(function () { return SAME; }); },
    testTgju: function () { return tgju('price_dollar_rl').then(function (r) { if (!r.length) throw new Error('TGJU: empty series'); return r[r.length - 1]; }); },
    history: function (sym, market) { return market === 'tse' ? tseProvider.history(sym, 260) : historyGlobal(sym); }
  };
})(window);
