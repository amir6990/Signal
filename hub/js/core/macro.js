/* =====================================================================
 * MACRO & MARKET INPUTS — live where a primary source exists, your own
 * number always allowed.
 *
 * Each model input (risk-free rate, ERP, country risk premium, inflation)
 * gets a selector: "My number" or one live source. A live source writes
 * its value into the input with a green source tag (source + date); typing
 * in the field switches it back to your number. Every fetch is cached in
 * this browser; when a source cannot be reached (offline, CORS, artifact
 * sandbox) the last cached value is used, then a dated snapshot.
 *
 * Sources (primary only):
 *   Damodaran Online (NYU Stern): implied ERP (home page, monthly) and the
 *     country risk table (ctryprem.html: CRP and total ERP for Iran).
 *   IMF World Economic Outlook DataMapper API (PCPIPCH): CPI inflation,
 *     current-year projection.  World Bank WDI API (FP.CPI.TOTL.ZG): latest
 *     actual annual-average CPI inflation.
 *   TSETMC: price of a treasury bill (اخزا, zero coupon, 1,000,000 rial face)
 *     → yield to maturity = (face / price)^(365 / days) − 1.
 *   FMP / Alpha Vantage: US 10-year Treasury (for USD models).
 * Snapshots (used only when nothing live or cached is available):
 *   Damodaran implied ERP 4.41% on 1 Nov 2026 (trailing 12m, adjusted payout);
 *   Iran CRP 9.71% and total ERP 13.94% (country risk update of 5 Jan 2026);
 *   Iran CPI inflation 42.17% (World Bank WDI, 2025 annual average, retrieved 7 Nov 2026).
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  var KEY = 'hub.macro.v1';
  var DAM = 'https://pages.stern.nyu.edu/~adamodar/New_Home_Page/';
  function U() { return Hub.util; }
  function cache() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function save(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) { /* ignore */ } }
  function today() { return new Date().toISOString().slice(0, 10); }
  function pct(s) { var v = parseFloat(String(s).replace(/[^\d.\-]/g, '')); return isFinite(v) ? v / 100 : NaN; }

  function htmlRows(html) {
    return html.split(/<\/tr>/i).map(function (r) {
      return r.split(/<\/t[dh]>/i).map(function (c) { return c.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(); }).filter(function (c, i, a) { return i < a.length - 1 || c; });
    });
  }
  var ctryCache = null;
  function damCountry() {
    if (ctryCache) return ctryCache;
    ctryCache = Hub.data.webText(DAM + 'datafile/ctryprem.html', 'Damodaran').then(function (html) {
      var rows = htmlRows(html), hdr = rows.filter(function (r) { return r.some(function (c) { return /Country Risk Premium/i.test(c); }); })[0] || [];
      var iCrp = hdr.findIndex(function (c) { return /Country Risk Premium/i.test(c); }), iErp = hdr.findIndex(function (c) { return /^Equity Risk Premium/i.test(c); });
      var row = rows.filter(function (r) { return /^Iran\b/.test(r[0] || ''); })[0];
      var upd = (html.match(/Last updated:\s*([A-Za-z]+ \d{1,2}, \d{4})/) || [])[1] || '';
      if (!row || iCrp < 0) throw new Error('Damodaran: Iran row not found in the country risk table');
      return { crp: pct(row[iCrp]), erp: pct(row[iErp >= 0 ? iErp : iCrp + 1]), asOf: upd };
    }).catch(function (e) { ctryCache = null; throw e; });
    return ctryCache;
  }

  /* item: { label, unit, sources: { key: { label, fetch(args) -> Promise<{value, asOf}> } }, snapshot } */
  var ITEMS = {
    rfIR: { label: 'Rial risk-free rate (treasury bill اخزا YTM)', args: ['symbol', 'maturity'], sources: {
      tse: { label: 'TSETMC · اخزا price → yield to maturity', fetch: function (a) {
        var jd = Hub.jalali.parse(a && a.maturity), now = Hub.jalali.g2d(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate());
        if (!a || !a.symbol || !isFinite(jd)) return Promise.reject(new Error('Enter the اخزا symbol and its maturity date (e.g. 1407/03/25).'));
        var days = jd - now; if (days <= 0) return Promise.reject(new Error('The maturity date has passed.'));
        return Hub.data.tse.quote(a.symbol).then(function (q) {
          var px = q.price || q.last; if (!(px > 0)) throw new Error('TSETMC: no price for ' + a.symbol);
          return { value: Math.pow(1e6 / px, 365 / days) - 1, asOf: today() + ' · ' + q.symbol + ' @ ' + px + ' · ' + days + ' days' };
        });
      } } } },
    rfUS: { label: 'US 10-year Treasury yield (USD models only)', sources: {
      fmp: { label: 'FMP / Alpha Vantage · US 10Y', fetch: function () { return Hub.data.riskFree().then(function (r) { return { value: r.rate != null ? r.rate : r.value, asOf: r.date || today() }; }); } } } },
    erpMature: { label: 'Mature-market equity risk premium', sources: {
      dam: { label: 'Damodaran · implied ERP (monthly)', fetch: function () {
        return Hub.data.webText(DAM + 'home.htm', 'Damodaran').then(function (html) {
          var t = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '), m = t.match(/Implied ERP on ([A-Za-z]+ \d{1,2}, \d{4})\s*=\s*([\d.]+)%/i);
          if (!m) throw new Error('Damodaran: implied ERP not found on the home page');
          return { value: parseFloat(m[2]) / 100, asOf: m[1] };
        });
      } } },
      snapshot: { value: 0.0441, asOf: 'November 1, 2026', src: 'Damodaran Online · implied ERP (trailing 12m, adjusted payout)' } },
    erpIR: { label: 'Total equity risk premium for Iran (mature ERP + CRP)', sources: {
      dam: { label: 'Damodaran · country risk table', fetch: function () { return damCountry().then(function (r) { return { value: r.erp, asOf: r.asOf }; }); } } },
      snapshot: { value: 0.1394, asOf: 'January 5, 2026', src: 'Damodaran Online · ctryprem (Iran)' } },
    crpIR: { label: 'Country risk premium for Iran', sources: {
      dam: { label: 'Damodaran · country risk table', fetch: function () { return damCountry().then(function (r) { return { value: r.crp, asOf: r.asOf }; }); } } },
      snapshot: { value: 0.0971, asOf: 'January 5, 2026', src: 'Damodaran Online · ctryprem (Iran)' } },
    inflIR: { label: 'Iran CPI inflation', sources: {
      imf: { label: 'IMF WEO · current-year projection', fetch: function () {
        return Hub.data.web('https://www.imf.org/external/datamapper/api/v1/PCPIPCH/IRN', 'IMF').then(function (j) {
          var v = j && j.values && j.values.PCPIPCH && j.values.PCPIPCH.IRN; if (!v) throw new Error('IMF: no data');
          var y = new Date().getFullYear(); while (y > 1990 && v[y] == null) y--;
          return { value: v[y] / 100, asOf: 'WEO ' + y + ' (projection)' };
        });
      } },
      wb: { label: 'World Bank WDI · latest actual (annual average)', fetch: function () {
        return Hub.data.web('https://api.worldbank.org/v2/country/IRN/indicator/FP.CPI.TOTL.ZG?format=json&per_page=15', 'World Bank').then(function (j) {
          var row = (j && j[1] || []).filter(function (x) { return x.value != null; })[0]; if (!row) throw new Error('World Bank: no data');
          return { value: row.value / 100, asOf: row.date + ' annual average' };
        });
      } } },
      snapshot: { value: 0.4217, asOf: '2025 annual average', src: 'World Bank WDI FP.CPI.TOTL.ZG (retrieved 7 Nov 2026)' } }
  };

  function srcLabel(item, sk) { var it = ITEMS[item]; return (it.sources[sk] && it.sources[sk].label) || sk; }
  // best available value: cached live → snapshot
  function current(item, sk) {
    var c = cache()[item + ':' + sk]; if (c) return { value: c.value, asOf: c.asOf, src: srcLabel(item, sk), fetchedAt: c.fetchedAt, live: true };
    var s = ITEMS[item].snapshot; return s ? { value: s.value, asOf: s.asOf, src: s.src + ' (snapshot)', snapshot: true } : null;
  }
  function refresh(item, sk, args) {
    return ITEMS[item].sources[sk].fetch(args).then(function (r) {
      if (!isFinite(r.value)) throw new Error('Source returned no value');
      var c = cache(); c[item + ':' + sk] = { value: r.value, asOf: r.asOf, fetchedAt: today() }; save(c); return current(item, sk);
    });
  }

  /* Panel bound to a model state.
   *   binds: [{ path: 'wacc.rf', label, items: ['rfIR', 'rfUS'], fmt: 'pct2', note }]
   *   S.macroSel[path] = 'manual' | 'item:source';  S.macroArgs[item] = { ... } */
  function panel(S, binds, onChange) {
    var u = U(), h = u.h, fa = Hub.i18n && Hub.i18n.lang() === 'fa', T = function (en, f) { return fa ? f : en; };
    S.macroSel = S.macroSel || {}; S.macroArgs = S.macroArgs || {}; S.sources = S.sources || {};
    var status = h('p', { class: 'muted fetch-status', 'aria-live': 'polite' });
    function apply(b, sel) {
      S.macroSel[b.path] = sel;
      if (sel === 'manual') { delete S.sources[b.path]; return; }
      var p = sel.split(':'), cur = current(p[0], p[1]);
      if (!cur) { status.textContent = T('No value yet for ', 'هنوز مقداری نیست برای ') + srcLabel(p[0], p[1]) + T(' — press Update.', ' — «به‌روزرسانی» را بزنید.'); return; }
      u.setPath(S, b.path, Math.round(cur.value * 1e6) / 1e6);
      S.sources[b.path] = cur.src + ' · ' + cur.asOf;
    }
    function update(only) {
      var jobs = [];
      binds.forEach(function (b) { var sel = S.macroSel[b.path]; if (!sel || sel === 'manual' || (only && only !== b.path)) return; var p = sel.split(':');
        jobs.push(refresh(p[0], p[1], S.macroArgs[p[0]]).then(function () { apply(b, sel); return null; }, function (e) { return e.message; })); });
      if (!jobs.length) { status.textContent = T('Choose a live source for at least one input.', 'دست‌کم برای یک ورودی منبع زنده انتخاب کنید.'); return; }
      status.textContent = T('Updating…', 'در حال به‌روزرسانی…');
      Promise.all(jobs).then(function (errs) {
        errs = errs.filter(Boolean);
        status.textContent = errs.length ? T('Some sources could not be reached; cached or snapshot values kept: ', 'برخی منابع در دسترس نبودند؛ مقدار ذخیره‌شده یا عکس‌فوری حفظ شد: ') + errs.join(' | ') : T('Live inputs updated.', 'ورودی‌های زنده به‌روز شد.');
        status.classList.toggle('err', !!errs.length); onChange();
      });
    }
    var tb = h('table', { class: 'grid macro' });
    tb.appendChild(h('thead', null, [h('tr', null, ['Input', 'Use', 'Value used · source', ''].map(function (x) { return h('th', { text: x }); }))]));
    var body = h('tbody');
    binds.forEach(function (b) {
      var sel = h('select', { class: 'f-sel', 'aria-label': b.label });
      sel.appendChild(h('option', { value: 'manual', text: 'My number' }));
      b.items.forEach(function (it) { Object.keys(ITEMS[it].sources).forEach(function (sk) { sel.appendChild(h('option', { value: it + ':' + sk, text: 'Live · ' + ITEMS[it].label + ' — ' + srcLabel(it, sk) })); }); });
      // a value typed in the model field (source tag removed) means "my number"
      var cs = S.macroSel[b.path] || 'manual'; if (cs !== 'manual' && !S.sources[b.path]) cs = 'manual';
      sel.value = cs; S.macroSel[b.path] = cs;
      sel.addEventListener('change', function () { apply(b, sel.value); onChange(); });
      var cur = cs !== 'manual' ? current(cs.split(':')[0], cs.split(':')[1]) : null;
      var extra = [];
      if (cs.indexOf('rfIR:') === 0) {
        var a = S.macroArgs.rfIR = S.macroArgs.rfIR || { symbol: '', maturity: '' };
        var s1 = h('input', { class: 'f-text sm', value: a.symbol, placeholder: 'اخزا symbol', 'aria-label': 'Treasury bill symbol' }), s2 = h('input', { class: 'f-text sm', value: a.maturity, placeholder: '1407/03/25', 'aria-label': 'Maturity date (Shamsi)' });
        s1.addEventListener('change', function () { a.symbol = s1.value.trim(); }); s2.addEventListener('change', function () { a.maturity = s2.value.trim(); });
        extra = [h('div', { class: 'row-ctl' }, [s1, s2])];
      }
      var v = u.getPath(S, b.path);
      body.appendChild(h('tr', null, [h('td', { class: 'lbl' }, [h('strong', { text: b.label })].concat(b.note ? [h('div', { class: 'muted', text: b.note })] : [])),
        h('td', null, [sel].concat(extra)),
        h('td', null, [h('div', { class: 'num', text: u.fmtPct(v, 2) }), h('div', { class: 'muted small', 'data-notr': '1', text: cs === 'manual' ? T('Your input', 'ورودی شما') : cur ? cur.src + ' · ' + cur.asOf : '—' })]),
        h('td', null, cs === 'manual' ? [] : [h('button', { class: 'btn ghost sm', type: 'button', text: 'Update', onclick: function () { update(b.path); } })])]));
    });
    tb.appendChild(body);
    return h('div', { class: 'stack' }, [h('div', { class: 'row-ctl' }, [h('button', { class: 'btn', type: 'button', text: 'Update all live inputs', onclick: function () { update(); } })]), status,
      h('div', { class: 'grid-wrap' }, [tb]),
      h('p', { class: 'f-help', text: 'Pick "My number" to type your own value in the form, or a live source: its value is written into the model with a green source tag. Inside the claude.ai artifact outside requests are blocked, so the dated snapshot is used; the local copy fetches live (set a proxy prefix on Data sources & keys if a site refuses browser requests).' })]);
  }

  // the standard cost-of-capital inputs of a model, at `pre` ('wacc' → wacc.rf, wacc.erp, …)
  function waccBinds(pre, names) {
    names = Object.assign({ rf: 'rf', erp: 'erp', crp: 'crp', inflation: 'inflation' }, names || {});
    return [
      { path: pre + '.' + names.rf, label: 'Risk-free rate (nominal)', items: ['rfIR', 'rfUS'], note: 'Rial model: a rial government yield (اخزا). USD model: US 10Y.' },
      { path: pre + '.' + names.erp, label: 'Equity risk premium', items: ['erpMature', 'erpIR'], note: 'Mature-market ERP with a separate CRP, or Damodaran’s total ERP for Iran with CRP set to 0.' },
      { path: pre + '.' + names.crp, label: 'Country risk premium', items: ['crpIR'], note: 'Set 0 when rf is already a rial government yield or the ERP already includes country risk.' },
      { path: pre + '.' + names.inflation, label: 'Expected inflation', items: ['inflIR'], note: 'Live figures are current inflation; long-run expected inflation is your judgement.' }];
  }
  Hub.macro = { ITEMS: ITEMS, current: current, refresh: refresh, panel: panel, waccBinds: waccBinds };
})(typeof window !== 'undefined' ? window : globalThis);
