/* =====================================================================
 * DCF — USER INTERFACE
 * Inputs (Setup · Historicals · Drivers · WACC & bridge)
 *   → Calculations (Projections · FCF & terminal value)
 *   → Outputs (Valuation · Sensitivity)  → Excel export
 * State autosaves to this browser; Save/Open model writes a .json file.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub, U = Hub.util, h = U.h, G = Hub.grid, E = Hub.DCF.engine;
  var STORE = 'hub.dcf.v1';
  var N = E.N;

  var S = null, R = null, view = null, tabBody = null, tab = null, kpi = null, charts = [], saveTimer = null, activeTab = 'setup';

  var TABS = [
    { group: 'Inputs', items: [['setup', 'Setup & data'], ['method', 'Methodology'], ['hist', 'Historicals'], ['drivers', 'Drivers'], ['wacc', 'WACC & bridge']] },
    { group: 'Calculations', items: [['proj', 'Projections'], ['fcf', 'FCFF, FCFE & terminal value']] },
    { group: 'Outputs', items: [['val', 'Valuation'], ['sens', 'Sensitivity']] }
  ];
  var SCEN_LABEL = { base: 'Base', upside: 'Upside', downside: 'Downside' };
  var UNITS = [['thousand', 'Thousands'], ['million', 'Millions'], ['billion', 'Billions'], ['trillion', 'Trillions']];

  function load() {
    var s = U.store.get(STORE, null);
    S = s && s.version === 1 ? s : Hub.DCF.sample();
    S.sources = S.sources || {};
  }
  function persist() { clearTimeout(saveTimer); saveTimer = setTimeout(function () { U.store.set(STORE, S); }, 400); }
  function unitLabel() { return (S.meta.currency || '') + ' ' + (S.meta.unit === 'thousand' ? 'k' : S.meta.unit === 'million' ? 'mn' : S.meta.unit === 'billion' ? 'bn' : S.meta.unit === 'trillion' ? 'tn' : ''); }
  function scen() { return S.scenarios[S.settings.scenario]; }
  function tagOf(path) { return S.sources[path]; }

  /* ---------- recompute + refresh ----------------------------------- */
  function recompute() {
    R = E.run(S);
    if (kpi) kpi.refresh();
    if (tab && tab.refresh) tab.refresh();
    persist();
  }
  function rerender() { R = E.run(S); renderHeader(); renderTab(activeTab); if (kpi) kpi.refresh(); persist(); }

  /* ---------- cell factories ---------------------------------------- */
  function inArr(path, i, fmt) {
    return { input: true, fmt: fmt || 'num',
      get: function () { return U.getPath(S, path)[i]; },
      set: function (v) { U.getPath(S, path)[i] = v; delete S.sources[path]; } };
  }
  function inVal(path, fmt) {
    return { input: true, fmt: fmt || 'num', get: function () { return U.getPath(S, path); }, set: function (v) { U.setPath(S, path, v); delete S.sources[path]; } };
  }
  function calc(fn, fmt, flag) { return { value: fn, fmt: fmt || 'num', flag: flag }; }
  function histCols() { return S.hist.years.map(function (y) { return { label: y, cls: 'hist' }; }); }
  function projCols() { return S.projYears.map(function (y) { return { label: y, cls: 'proj' }; }); }
  function allCols() { return histCols().concat(projCols()); }
  var nH = function () { return S.hist.years.length; };

  /* company statements → DCF rows (shared Company data bar) */
  function applyRec(rec) { var blocks = rec.blocks, info = rec; (function () {
      var r = E.fromImport(S, blocks, info, Hub.tools.company.suggestRole, Hub.stmtImport.pickCF);
      S.meta.notes = 'Built from ' + (info.file || 'Excel file'); Object.keys(S.sources || {}).forEach(function (k) { if (k.indexOf('wacc.') !== 0) delete S.sources[k]; });
      if (info.sharesMn) S.sources['bridge.sharesMn'] = 'Share capital ÷ 1,000 IRR nominal';
      rerender();
      var ign = r.map.filter(function (m) { return m.to === 'ignored' && m.role !== 'skip'; }).length;
      var fa = Hub.i18n && Hub.i18n.lang() === 'fa', okc = Math.abs(r.check) <= 2;
      U.toast(fa ? (r.map.length + ' سطر برای سال‌های ' + r.years.join(' · ') + ' وارد شد' + (r.daEmbedded ? '؛ استهلاک از صورت جریان‌های نقدی گرفته و از بهای تمام‌شده و هزینه‌های اداری و فروش کسر شد' : '') +
          '. محرک‌های سناریوی پایه از آخرین سال واقعی مقداردهی شد. تراز: ' + (okc ? 'برقرار' : U.fmtNum(r.check)) + (ign ? '؛ ' + ign + ' سطر نگاشت نشد' : '') + '. قیمت سهم را در زبانهٔ WACC و پل ارزش وارد کنید.')
        : ('Imported ' + r.map.length + ' lines for ' + r.years.join(' · ') + (r.daEmbedded ? '; D&A taken from the cash-flow statement and removed from cost of sales and SG&A' : '') +
          '. Base drivers seeded from the last actual year. Balance check ' + (okc ? 'OK' : U.fmtNum(r.check)) + (ign ? '; ' + ign + ' lines not mapped' : '') + '. Enter the share price on WACC & bridge.'), okc ? 'good' : 'warn');
    })(); }

  /* ---------- page --------------------------------------------------- */
  function mount(el) {
    load();
    R = E.run(S);
    view = h('div', { class: 'dcf' });
    el.appendChild(view);
    headEl = null; renderHeader();
    if (Hub.companyData && Hub.tools && Hub.tools.company) view.appendChild(Hub.companyData.bar({ unit: function () { return S.meta.unit; }, apply: function (M, side, rec) { applyRec(rec); return false; }, full: function (rec) { applyRec(rec); } }));
    view.appendChild(buildKpi().el);
    var bar = h('nav', { class: 'tabs', 'aria-label': 'DCF sections' });
    TABS.forEach(function (g) {
      var grp = h('div', { class: 'tab-grp' }, [h('span', { class: 'tab-grp-lbl', text: g.group })]);
      g.items.forEach(function (it) {
        grp.appendChild(h('button', { type: 'button', class: 'tab', role: 'tab', dataset: { tab: it[0] }, text: it[1], onclick: function () { renderTab(it[0]); } }));
      });
      bar.appendChild(grp);
    });
    view.appendChild(bar);
    tabBody = h('div', { class: 'tab-body', role: 'tabpanel' });
    view.appendChild(tabBody);
    renderTab(U.store.get('hub.dcf.tab', 'setup'));
    document.addEventListener('hub:theme', onTheme);
  }
  function unmount() { destroyCharts(); document.removeEventListener('hub:theme', onTheme); U.store.set(STORE, S); }
  function onTheme() { if (activeTab === 'val') renderTab('val'); }

  var headEl = null;
  function renderHeader() {
    var fresh = h('header', { class: 'page-head model-head' }, [
      h('div', { class: 'mh-title' }, [
        h('p', { class: 'eyebrow', text: 'Valuation · DCF (FCFF + FCFE) · ' + unitLabel() + ' · ' + (S.settings.basis === 'real' ? 'Real terms' : 'Nominal terms') }),
        h('h1', { text: S.meta.company || 'Untitled company' }),
        S.meta.ticker ? h('p', { class: 'muted', text: S.meta.ticker }) : null
      ]),
      h('div', { class: 'mh-ctl' }, [
        seg('Scenario', ['base', 'upside', 'downside'].map(function (k) { return [k, SCEN_LABEL[k]]; }), S.settings.scenario, function (v) { S.settings.scenario = v; rerender(); }),
        seg('Basis', [['real', 'Real'], ['nominal', 'Nominal']], S.settings.basis, function (v) { S.settings.basis = v; rerender(); }),
        h('div', { class: 'btn-row' }, [
          h('button', { class: 'btn primary', type: 'button', text: 'Export Excel', onclick: function () { Hub.DCF.exportXlsx(S, R); } }),
          h('button', { class: 'btn ghost', type: 'button', text: 'CSV', title: 'Projections and valuation as CSV', onclick: exportCsv }),
          h('button', { class: 'btn ghost', type: 'button', text: 'Save model', title: 'Save inputs as a .json file', onclick: saveJson }),
          openBtn(),
          h('button', { class: 'btn ghost', type: 'button', text: 'Load sample', onclick: function () { confirmInline(this, 'Replace all inputs with the illustrative sample?', function () { S = Hub.DCF.sample(); rerender(); U.toast('Sample loaded (illustrative figures)', 'info'); }); } }),
          h('button', { class: 'btn ghost', type: 'button', text: 'Clear inputs', onclick: function () { confirmInline(this, 'Clear every input to an empty placeholder?', function () { S = Hub.DCF.blank(); rerender(); U.toast('All inputs cleared', 'info'); }); } })
        ])
      ])
    ]);
    if (headEl && headEl.parentNode) headEl.parentNode.replaceChild(fresh, headEl); else view.appendChild(fresh);
    headEl = fresh;
  }
  function seg(label, opts, val, on) {
    var g = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label }, [h('span', { class: 'seg-lbl', text: label })]);
    opts.forEach(function (o) {
      g.appendChild(h('button', { type: 'button', role: 'radio', 'aria-checked': String(o[0] === val), class: 'seg-btn' + (o[0] === val ? ' on' : ''), text: o[1], onclick: function () { if (o[0] !== val) on(o[0]); } }));
    });
    return g;
  }
  // confirm() is unavailable in artifacts; confirm inline instead
  function confirmInline(btn, msg, yes) {
    var bar = h('div', { class: 'confirm', role: 'alertdialog' }, [h('span', { text: msg }),
      h('button', { class: 'btn danger', type: 'button', text: 'Confirm', onclick: function () { bar.remove(); yes(); } }),
      h('button', { class: 'btn ghost', type: 'button', text: 'Cancel', onclick: function () { bar.remove(); } })]);
    var old = view.querySelector('.confirm'); if (old) old.remove();
    btn.closest('.model-head').appendChild(bar);
  }

  /* ---------- KPI strip ---------------------------------------------- */
  function buildKpi() {
    var cells = [
      ['Enterprise value', function () { return U.fmtNum(R.V.evBlend); }, function () { return unitLabel() + ' · blended'; }],
      ['Equity value', function () { return U.fmtNum(R.V.eqBlend); }, function () { return unitLabel(); }],
      ['Value per share', function () { return U.fmtNum(R.V.psBlend); }, function () { return (R.V.cf === 'fcfe' ? 'FCFE · FCFF ' + U.fmtNum(R.VF.psBlend) : 'FCFF · FCFE ' + U.fmtNum(R.VE.psBlend)); }],
      ['vs market price', function () { var p = S.bridge.price; return p > 0 ? U.fmtPct(R.V.psBlend / p - 1) : '–'; }, function () { return S.bridge.price > 0 ? 'price ' + U.fmtNum(S.bridge.price) : 'enter price on WACC & bridge'; }],
      ['Discount rate', function () { return U.fmtPct(R.V.wacc, 2); }, function () { return (R.V.cf === 'fcfe' ? 'cost of equity' : 'WACC') + ' · ' + (S.settings.basis === 'real' ? 'real' : 'nominal'); }],
      ['TV share of EV', function () { return U.fmtPct(R.V.tvShareG, 0); }, function () { return 'Gordon · exit ' + U.fmtPct(R.V.tvShareX, 0); }]
    ];
    var wrap = h('section', { class: 'kpis', 'aria-label': 'Key outputs' });
    var paints = cells.map(function (c) {
      var v = h('span', { class: 'kpi-v' }), s = h('span', { class: 'kpi-s' });
      wrap.appendChild(h('div', { class: 'kpi' }, [h('span', { class: 'kpi-l', text: c[0] }), v, s]));
      return function () { v.textContent = c[1](); s.textContent = c[2](); };
    });
    var chk = h('button', { type: 'button', class: 'kpi chk', onclick: function () { renderTab('val'); var t = document.getElementById('checks'); if (t) t.scrollIntoView({ behavior: 'smooth' }); } });
    wrap.appendChild(chk);
    function paintChk() {
      var c = R.checks.filter(function (x) { return x.level === 'critical'; }).length, w = R.checks.length - c;
      chk.className = 'kpi chk ' + (c ? 'crit' : w ? 'warn' : 'good');
      U.clear(chk).appendChild(h('span', { class: 'kpi-l', text: 'Model checks' }));
      chk.appendChild(h('span', { class: 'kpi-v', text: c ? c + ' critical' : w ? w + ' to review' : 'All clear' }));
      chk.appendChild(h('span', { class: 'kpi-s', text: 'balance, TV, consistency' }));
    }
    kpi = { el: wrap, refresh: function () { paints.forEach(function (p) { p(); }); paintChk(); } };
    kpi.refresh();
    return kpi;
  }

  /* ---------- tabs ---------------------------------------------------- */
  function renderTab(id) {
    destroyCharts();
    activeTab = id; U.store.set('hub.dcf.tab', id);
    view.querySelectorAll('.tab').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === id); b.setAttribute('aria-selected', String(b.dataset.tab === id)); });
    U.clear(tabBody);
    tabRefs = [];
    var builders = { method: tabMethod, setup: tabSetup, hist: tabHist, drivers: tabDrivers, wacc: tabWacc, proj: tabProj, fcf: tabFcf, val: tabVal, sens: tabSens };
    tab = (builders[id] || tabSetup)();
    var own = tab.refresh, refs = tabRefs.slice();
    tab.refresh = function () { refs.forEach(function (f) { f(); }); if (own) own(); };
    tabBody.appendChild(tab.el);
    if (tab.after) tab.after();
  }
  // panels accept DOM nodes or grid/form objects ({el, refresh}); refreshers are collected per tab
  var tabRefs = [];
  function panel(title, kids, cls) {
    var nodes = kids.map(function (k) { if (k && k.el && !k.nodeType) { if (k.refresh) tabRefs.push(k.refresh); return k.el; } return k; });
    return h('section', { class: 'panel ' + (cls || '') }, [title ? h('h2', { text: title }) : null].concat(nodes));
  }
  function group(parts) {
    return { el: h('div', { class: 'stack' }, parts.filter(function (p) { return p.el || p.nodeType; }).map(function (p) { return p.el || p; })),
      refresh: function () { parts.forEach(function (p) { if (p.refresh) p.refresh(); }); } };
  }

  /* ---- Setup & data ---- */
  function tabSetup() {
    var meta = G.form({ id: 'meta', onChange: function () { renderHeader(); recompute(); }, fields: [
      { key: 'company', label: 'Company', text: true, get: function () { return S.meta.company; }, set: function (v) { S.meta.company = v; } },
      { key: 'ticker', label: 'Ticker (for live data)', text: true, get: function () { return S.meta.ticker; }, set: function (v) { S.meta.ticker = v.trim().toUpperCase(); } },
      { key: 'currency', label: 'Model currency', text: true, get: function () { return S.meta.currency; }, set: function (v) { S.meta.currency = v.trim().toUpperCase(); } },
      { key: 'unit', label: 'Monetary unit', options: UNITS, get: function () { return S.meta.unit; }, set: function (v) { S.meta.unit = v; } },
      { key: 'vdate', label: 'Valuation date', text: true, help: 'Taken as the last historical fiscal year-end. No stub period is modelled.', get: function () { return S.meta.valuationDate; }, set: function (v) { S.meta.valuationDate = v; } },
      { key: 'analyst', label: 'Prepared by', text: true, get: function () { return S.meta.analyst; }, set: function (v) { S.meta.analyst = v; } },
      { key: 'notes', label: 'Notes', text: true, get: function () { return S.meta.notes; }, set: function (v) { S.meta.notes = v; } }
    ] });

    var yrs = h('div', { class: 'years' });
    S.hist.years.forEach(function (y, i) { yrs.appendChild(yearInput('hy' + i, y, function (v) { S.hist.years[i] = v; })); });
    S.projYears.forEach(function (y, i) { yrs.appendChild(yearInput('py' + i, y, function (v) { S.projYears[i] = v; })); });

    var status = h('p', { class: 'muted fetch-status', 'aria-live': 'polite' });
    var tk = h('input', { id: 'fetch-ticker', class: 'f-text', type: 'text', value: S.meta.ticker || '', placeholder: 'Symbol: فولاد or AAPL', autocomplete: 'off' });
    function getTk() { var t = tk.value.trim().toUpperCase(); if (!t) { status.textContent = 'Enter a ticker first.'; return null; } S.meta.ticker = t; return t; }
    function busy(msg) { status.textContent = msg; status.classList.remove('err'); }
    function fail(e) { status.textContent = e.message; status.classList.add('err'); }
    var live = panel('Live data', [
      h('p', { class: 'muted', text: 'Pulls through the provider order set on Data sources & keys. Fetched rows get a green source tag; editing a row removes its tag.' }),
      h('div', { class: 'row-ctl' }, [tk,
        h('button', { class: 'btn', type: 'button', text: 'Fetch 3Y statements', onclick: function () { var t = getTk(); if (!t) return; busy('Fetching statements for ' + t + '…'); fetchStatements(t).then(function (m) { U.toast(m, 'good'); }).catch(fail); } }),
        h('button', { class: 'btn', type: 'button', text: 'Fetch price & shares (TSETMC or global)', onclick: function () { var t = getTk(); if (!t) return; busy('Fetching market data for ' + t + '…'); fetchMarket(t).then(function (m) { U.toast(m, 'good'); }).catch(fail); } }),
        h('button', { class: 'btn ghost', type: 'button', text: 'US 10Y → risk-free', onclick: function () { busy('Fetching US 10Y…'); fetchRf().then(function (m) { U.toast(m, 'good'); }).catch(fail); } })
      ]),
      status,
      h('p', { class: 'f-help', text: 'Persian symbols fetch price and shares from TSETMC. Statements: paste the figures you have into the Historicals tab (click the first cell of a row, paste a block from Excel). Persian digits, thousands separators and (negatives) are read correctly.' })
    ]);

    var legend = panel('Conventions', [h('ul', { class: 'legend' }, [
      h('li', null, [h('span', { class: 'sw in' }), 'Blue: input (hard-coded) — edit these']),
      h('li', null, [h('span', { class: 'sw calc' }), 'White: calculated — never typed']),
      h('li', null, [h('span', { class: 'sw link' }), 'Green tag: fetched from a live source']),
      h('li', null, [h('span', { class: 'sw neg' }), 'Negatives in (parentheses)'])
    ]), h('p', { class: 'f-help', text: 'Percent inputs are typed as percent (6 = 6%). Days are days on 365. Shares in millions. Money in ' + unitLabel() + '.' })]);

    var imp = h('p', { class: 'muted', text: 'Use the Company data bar at the top of the model: import your Excel file or paste the rows once; this DCF and every other model can use the same data.' });
    var lines = h('p', { class: 'f-help', text: 'The DCF tool sums your lines into its standard rows. To keep every line under its own name, with its own driver, use the Company Model — it imports the same file.' });
    return group([panel('Build from your Excel file (up to 3 years of statements)', [imp, lines]), panel('Company', [meta.el]), panel('Period labels', [h('p', { class: 'muted', text: '3 historical years, then 5 forecast years.' }), yrs]), live, legend]);
  }
  function yearInput(id, v, set) {
    var i = h('input', { id: 'yr-' + id, class: 'f-text yr', type: 'text', value: v, 'aria-label': 'Period label' });
    i.addEventListener('change', function () { set(i.value.trim() || v); persist(); });
    return i;
  }

  /* ---- Historicals ---- */
  function tabHist() {
    var Hh = function () { return R.H; };
    var n = nH();
    function inRow(label, path, opts) {
      opts = opts || {};
      return { label: label, unit: opts.unit || '', note: opts.note, tag: tagOf(path), cls: opts.cls, cell: function (c) { return c < n ? inArr(path, c, opts.fmt) : null; } };
    }
    function calcRow(label, key, opts) {
      opts = opts || {};
      return { label: label, unit: opts.unit || '', cls: opts.cls || 'sub', cell: function (c) { return calc(function () { return Hh()[key][c]; }, opts.fmt, opts.flag); } };
    }
    var t = G.table({ id: 'hist', corner: unitLabel(), cols: histCols(), onChange: recompute, rows: [
      { type: 'head', label: 'Income statement' },
      inRow('Revenue', 'hist.is.revenue'), inRow('Cost of goods sold', 'hist.is.cogs', { note: 'Positive number = cost' }),
      calcRow('Gross profit', 'grossProfit'),
      inRow('SG&A', 'hist.is.sga'), inRow('Other operating expense', 'hist.is.otherOpex', { note: 'R&D and other operating lines, excluding D&A' }),
      calcRow('EBITDA', 'ebitda', { cls: 'total' }),
      inRow('Depreciation & amortisation', 'hist.is.da'),
      calcRow('EBIT', 'ebit'),
      inRow('Interest expense', 'hist.is.interestExp'), inRow('Interest income', 'hist.is.interestInc'), inRow('Other non-operating, net', 'hist.is.otherNonOp', { note: 'Income positive, expense negative' }),
      calcRow('Profit before tax', 'ebt'), inRow('Income tax', 'hist.is.tax'), calcRow('Net income', 'netIncome', { cls: 'total' }),
      { type: 'head', label: 'Balance sheet' },
      inRow('Cash & short-term investments', 'hist.bs.cash'), inRow('Accounts receivable', 'hist.bs.ar'), inRow('Inventory', 'hist.bs.inventory'),
      inRow('Other current assets', 'hist.bs.otherCA'), inRow('PP&E, net', 'hist.bs.ppe'), inRow('Other non-current assets', 'hist.bs.otherNCA'),
      calcRow('Total assets', 'totalAssets', { cls: 'total' }),
      inRow('Accounts payable', 'hist.bs.ap'), inRow('Other current liabilities', 'hist.bs.otherCL', { note: 'Operating: accruals, advances from customers, tax payable' }),
      inRow('Short-term debt', 'hist.bs.std'), inRow('Long-term debt', 'hist.bs.ltd'), inRow('Other non-current liabilities', 'hist.bs.otherNCL'),
      calcRow('Total liabilities', 'totalLiab'),
      inRow('Minority interest', 'hist.bs.minority'), inRow('Shareholders’ equity', 'hist.bs.equity'),
      calcRow('Check: assets − liabilities − equity', 'balanceCheck', { cls: 'check', fmt: 'dec', flag: function (v) { return Math.abs(v) > 0.5; } }),
      { type: 'head', label: 'Cash flow statement' },
      inRow('Cash from operations', 'hist.cfs.cfo'), inRow('Capital expenditure', 'hist.cfs.capex', { note: 'Positive number = spend' }), inRow('Dividends paid', 'hist.cfs.dividends', { note: 'Positive number = paid' }),
      { type: 'head', label: 'Ratios (calculated, reference for drivers)' },
      calcRow('Revenue growth', 'revGrowth', { fmt: 'pct', cls: 'ratio' }), calcRow('Gross margin', 'grossMargin', { fmt: 'pct', cls: 'ratio' }),
      calcRow('EBITDA margin', 'ebitdaMargin', { fmt: 'pct', cls: 'ratio' }), calcRow('DSO (days)', 'dso', { fmt: 'days', cls: 'ratio' }),
      calcRow('DIO (days)', 'dio', { fmt: 'days', cls: 'ratio' }), calcRow('DPO (days)', 'dpo', { fmt: 'days', cls: 'ratio' }),
      calcRow('Effective tax rate', 'effTax', { fmt: 'pct', cls: 'ratio' }), calcRow('Operating net working capital', 'nwc', { cls: 'ratio' })
    ] });
    return group([panel('Historical financial statements', [h('p', { class: 'muted', text: 'Click a cell and paste a block from Excel or Codal to fill across and down.' }), t])]);
  }

  /* ---- Drivers ---- */
  function tabDrivers() {
    var k = S.settings.scenario, n = nH(), base = 'scenarios.' + k + '.';
    function ref(fn) { return function (c) { return c < n ? calc(function () { return fn(R.H, c); }, 'pct') : null; }; }
    function drv(label, key, fmt, refFn, note) {
      var path = base + key;
      return { label: label, unit: fmt === 'days' ? 'days' : '%', note: note, cell: function (c) {
        if (c < n) return refFn ? { value: function () { return refFn(R.H, c); }, fmt: fmt === 'days' ? 'days' : 'pct' } : null;
        return inArr(path, c - n, fmt);
      } };
    }
    var ratio = function (num) { return function (H, c) { return H.revenue[c] ? H[num][c] / H.revenue[c] : null; }; };
    var t = G.table({ id: 'drv', corner: SCEN_LABEL[k] + ' scenario', cols: allCols(), onChange: recompute, rows: [
      { type: 'head', label: 'Operating drivers · ' + (S.settings.basis === 'real' ? 'real terms (constant prices)' : 'nominal terms') },
      drv('Revenue growth', 'revGrowth', 'pct', function (H, c) { return H.revGrowth[c]; }),
      drv('Gross margin', 'grossMargin', 'pct', function (H, c) { return H.grossMargin[c]; }),
      drv('SG&A % revenue', 'sgaPct', 'pct', ratio('sga')),
      drv('Other opex % revenue', 'otherOpexPct', 'pct', ratio('otherOpex')),
      drv('D&A % revenue', 'daPct', 'pct', ratio('da')),
      drv('Capex % revenue', 'capexPct', 'pct', ratio('capex')),
      { type: 'head', label: 'Working capital' },
      drv('Receivable days (on revenue)', 'dso', 'days', function (H, c) { return H.dso[c]; }),
      drv('Inventory days (on COGS)', 'dio', 'days', function (H, c) { return H.dio[c]; }),
      drv('Payable days (on COGS)', 'dpo', 'days', function (H, c) { return H.dpo[c]; }),
      drv('Other current assets % revenue', 'otherCAPct', 'pct', ratio('otherCA')),
      drv('Other current liabilities % revenue', 'otherCLPct', 'pct', ratio('otherCL')),
      { type: 'head', label: 'Tax' },
      drv('Tax rate on EBIT and PBT', 'taxRate', 'pct', function (H, c) { return H.effTax[c]; }, 'Applied to EBIT for NOPAT and to positive PBT in the income statement')
    ] });

    var fin = G.table({ id: 'fin', corner: 'Financing', cols: projCols(), onChange: recompute, rows: [
      { label: 'Net debt issued / (repaid)', unit: unitLabel(), cell: function (c) { return inArr('financing.debtChange', c, 'num'); } }
    ] });
    var finForm = G.form({ id: 'finf', onChange: recompute, fields: [
      { key: 'payout', label: 'Dividend payout', unit: '% NI', fmt: 'pct', get: function () { return S.financing.payout; }, set: function (v) { S.financing.payout = v; } },
      { key: 'cy', label: 'Yield on cash (nominal)', unit: '%', fmt: 'pct', help: 'Converted to real with Fisher when basis is Real.', get: function () { return S.financing.cashYield; }, set: function (v) { S.financing.cashYield = v; } }
    ] });

    var tvCols = ['base', 'upside', 'downside'].map(function (x) { return { label: SCEN_LABEL[x], cls: x === k ? 'cur' : '' }; });
    var tv = G.table({ id: 'tv', corner: 'Terminal value', cols: tvCols, onChange: recompute, rows: [
      { label: 'Perpetual growth (' + (S.settings.basis === 'real' ? 'real' : 'nominal') + ')', unit: '%', cell: function (c) { return inVal('scenarios.' + ['base', 'upside', 'downside'][c] + '.tvGrowth', 'pct'); } },
      { type: 'head', label: 'Exit multiples · FCFF (enterprise value)' }
    ].concat(Object.keys(E.EXITS).map(function (x) {
      var xd = E.EXITS[x], M = E.methodOf(S), on = (x === M.exitFcff) || (x === M.exitFcfe);
      var row = { label: 'Exit ' + xd.label + (on ? '  ◀ used' : ''), unit: 'x', cell: function (c) { return inVal('scenarios.' + ['base', 'upside', 'downside'][c] + '.' + xd.field, 'dec'); } };
      return x === 'pe' ? [{ type: 'head', label: 'Exit multiples · FCFE (equity value)' }, row] : [row];
    }).reduce(function (a, b) { return a.concat(b); }, [])) });

    var copy = h('div', { class: 'row-ctl' }, [h('span', { class: 'muted', text: 'Copy ' + SCEN_LABEL[k] + ' drivers to:' })].concat(
      ['base', 'upside', 'downside'].filter(function (x) { return x !== k; }).map(function (x) {
        return h('button', { class: 'btn ghost', type: 'button', text: SCEN_LABEL[x], onclick: function () {
          var src = S.scenarios[k], dst = S.scenarios[x];
          Object.keys(src).forEach(function (f) { if (Array.isArray(src[f])) dst[f] = src[f].slice(); });
          recompute(); U.toast(SCEN_LABEL[k] + ' drivers copied to ' + SCEN_LABEL[x] + ' (terminal values unchanged)', 'good');
        } });
      })));

    return group([
      panel('Projection drivers · editing ' + SCEN_LABEL[k], [h('p', { class: 'muted', text: 'Grey columns are historical actuals for reference. Switch scenario at the top to edit Upside or Downside.' }), t, copy]),
      panel('Terminal value assumptions', [tv]),
      panel('Financing schedule', [fin, finForm])
    ]);
  }

  /* ---- WACC & bridge ---- */
  function tabWacc() {
    var w = S.wacc, real = S.settings.basis === 'real';
    var f = G.form({ id: 'wacc', onChange: recompute, fields: [
      { type: 'head', label: 'Cost of equity (CAPM)' },
      { key: 'rf', label: 'Risk-free rate (nominal)', unit: '%', fmt: 'pct2', tag: tagOf('wacc.rf'), help: 'Use a government yield in the model currency. A rial model needs a rial rate (e.g. treasury bills, اخزا); a USD 10Y fits a USD model only.', get: function () { return w.rf; }, set: function (v) { w.rf = v; delete S.sources['wacc.rf']; } },
      { key: 'erp', label: 'Equity risk premium', unit: '%', fmt: 'pct2', get: function () { return w.erp; }, set: function (v) { w.erp = v; delete S.sources['wacc.erp']; } },
      { key: 'crp', label: 'Country risk premium', unit: '%', fmt: 'pct2', help: 'Leave at 0 when the risk-free rate is already a local-currency government yield; it already prices sovereign risk.', get: function () { return w.crp; }, set: function (v) { w.crp = v; delete S.sources['wacc.crp']; } },
      { key: 'size', label: 'Size / specific premium', unit: '%', fmt: 'pct2', get: function () { return w.sizePremium; }, set: function (v) { w.sizePremium = v; } },
      { key: 'bm', label: 'Beta method', options: [['relever', 'Relever unlevered beta'], ['levered', 'Use levered beta directly']], get: function () { return w.betaMode; }, set: function (v) { w.betaMode = v; } },
      { key: 'bl', label: 'Levered beta', fmt: 'dec', tag: tagOf('wacc.betaLevered'), get: function () { return w.betaLevered; }, set: function (v) { w.betaLevered = v; delete S.sources['wacc.betaLevered']; } },
      { key: 'bu', label: 'Unlevered beta (peer median)', fmt: 'dec', get: function () { return w.betaUnlevered; }, set: function (v) { w.betaUnlevered = v; } },
      { type: 'head', label: 'Cost of debt and structure' },
      { key: 'kd', label: 'Pre-tax cost of debt (nominal)', unit: '%', fmt: 'pct2', get: function () { return w.kdPreTax; }, set: function (v) { w.kdPreTax = v; } },
      { key: 'tax', label: 'Marginal tax rate', unit: '%', fmt: 'pct2', get: function () { return w.taxRate; }, set: function (v) { w.taxRate = v; } },
      { key: 'wd', label: 'Target debt / (debt + equity)', unit: '%', fmt: 'pct2', get: function () { return w.debtWeight; }, set: function (v) { w.debtWeight = v; } },
      { key: 'inf', label: 'Expected inflation (long-run)', unit: '%', fmt: 'pct2', help: real ? 'Used to convert nominal rates to real: (1+nominal)/(1+inflation) − 1.' : 'Not used in nominal mode.', get: function () { return w.inflation; }, set: function (v) { w.inflation = v; delete S.sources['wacc.inflation']; } }
    ] });
    var out = G.form({ id: 'wacco', fields: [
      { key: 'de', label: 'Debt / equity', calc: function () { return U.fmtPct(R.W.debtToEquity, 1); } },
      { key: 'bL', label: 'Levered beta used', calc: function () { return U.fmtNum(R.W.betaL, 3); } },
      { key: 'ke', label: 'Cost of equity (nominal)', calc: function () { return U.fmtPct(R.W.ke, 2) + (R.W.keManual ? ' (my number)' : ''); } },
      { key: 'kd', label: 'After-tax cost of debt (nominal)', calc: function () { return U.fmtPct(R.W.kdAfterTax, 2); } },
      { key: 'wn', label: 'WACC nominal', calc: function () { return U.fmtPct(R.W.nominal, 2) + (R.W.waccManual ? ' (my number)' : ''); } },
      { key: 'wr', label: 'WACC real', calc: function () { return U.fmtPct(R.W.real, 2); } },
      { key: 'rfr', label: 'Implied real risk-free', calc: function () { return U.fmtPct(E.fisherReal(S.wacc.rf, S.wacc.inflation), 2); } },
      { key: 'wu', label: 'Discount rate used', strong: true, calc: function () { return U.fmtPct(R.W.used, 2) + (real ? ' (real)' : ' (nominal)'); } }
    ] });
    var b = S.bridge;
    var br = G.form({ id: 'bridge', onChange: recompute, fields: [
      { type: 'head', label: 'From latest balance sheet (' + S.hist.years[nH() - 1] + ')' },
      { key: 'debt', label: 'Total debt', calc: function () { return U.fmtNum(R.V.bridge.debt); } },
      { key: 'cash', label: 'Cash & short-term investments', calc: function () { return U.fmtNum(R.V.bridge.cash); } },
      { key: 'mi', label: 'Minority interest (book)', calc: function () { return U.fmtNum(R.V.bridge.minority); } },
      { type: 'head', label: 'Other claims and assets (' + unitLabel() + ')' },
      { key: 'pref', label: 'Preferred equity', get: function () { return b.preferred; }, set: function (v) { b.preferred = v; } },
      { key: 'inv', label: 'Investments in associates', help: 'Equity-accounted stakes; their income is excluded from EBITDA.', get: function () { return b.investments; }, set: function (v) { b.investments = v; } },
      { key: 'noa', label: 'Other non-operating assets', get: function () { return b.nonOpAssets; }, set: function (v) { b.nonOpAssets = v; } },
      { key: 'oc', label: 'Other debt-like claims', help: 'Pension deficits, leases if not in debt, provisions, dividends payable.', get: function () { return b.otherClaims; }, set: function (v) { b.otherClaims = v; } },
      { type: 'head', label: 'Per share' },
      { key: 'sh', label: 'Diluted shares outstanding', unit: 'mn', fmt: 'dec', tag: tagOf('bridge.sharesMn'), get: function () { return b.sharesMn; }, set: function (v) { b.sharesMn = v; delete S.sources['bridge.sharesMn']; } },
      { key: 'px', label: 'Current share price', unit: S.meta.currency, fmt: 'dec', tag: tagOf('bridge.price'), get: function () { return b.price; }, set: function (v) { b.price = v; delete S.sources['bridge.price']; } }
    ] });
    var st = G.form({ id: 'settings', onChange: recompute, fields: [
      { key: 'mid', label: 'Mid-year discounting', options: [['1', 'On (cash flows mid-period)'], ['0', 'Off (year-end)']], get: function () { return S.settings.midYear ? '1' : '0'; }, set: function (v) { S.settings.midYear = v === '1'; } },
      { key: 'gw', label: 'Weight on Gordon method', unit: '%', fmt: 'pct', help: 'Exit-multiple method gets the remainder. Blended value feeds the headline outputs.', get: function () { return S.settings.gordonWeight; }, set: function (v) { S.settings.gordonWeight = Math.max(0, Math.min(1, v)); } }
    ] });
    var ov = G.form({ id: 'wacc-ov', onChange: rerender, fields: [
      { key: 'kem', label: 'Cost of equity', options: [['calc', 'Computed (CAPM)'], ['manual', 'My number']], get: function () { return w.keMode || 'calc'; }, set: function (v) { w.keMode = v; if (v === 'manual' && !(+w.keManual)) w.keManual = Math.round(R.W.keCalc * 1e4) / 1e4; } },
      { key: 'keo', label: 'My cost of equity (nominal)', unit: '%', fmt: 'pct2', get: function () { return w.keManual; }, set: function (v) { w.keManual = v; } },
      { key: 'kec', label: 'Computed cost of equity (nominal)', calc: function () { return U.fmtPct(R.W.keCalc, 2); } },
      { key: 'wm', label: 'WACC', options: [['calc', 'Computed'], ['manual', 'My number']], get: function () { return w.waccMode || 'calc'; }, set: function (v) { w.waccMode = v; if (v === 'manual' && !(+w.waccManual)) w.waccManual = Math.round(R.W.nomCalc * 1e4) / 1e4; } },
      { key: 'wo', label: 'My WACC (nominal)', unit: '%', fmt: 'pct2', get: function () { return w.waccManual; }, set: function (v) { w.waccManual = v; } },
      { key: 'wc', label: 'Computed WACC (nominal)', calc: function () { return U.fmtPct(R.W.nomCalc, 2); } }
    ] });
    var mac = Hub.macro ? Hub.macro.panel(S, Hub.macro.waccBinds('wacc'), rerender) : h('p', { class: 'muted', text: 'Macro module not loaded.' });
    return group([panel('Market inputs: live or your own number', [mac]), h('div', { class: 'two' }, [panel('WACC inputs', [f.el]), panel('WACC build', [out.el, h('p', { class: 'f-help', text: 'Ke = rf + β × ERP + CRP + size. βL = βU × (1 + (1 − t) × D/E). WACC = E/V × Ke + D/V × Kd × (1 − t).' })])]),
      h('div', { class: 'two' }, [panel('Computed or your own rate', [ov.el, h('p', { class: 'f-help', text: 'Your numbers are nominal; on a real basis they are converted with Fisher like every other rate. With "My number" the CAPM / WACC build is kept for reference and in Excel, but not used.' })]), panel('Equity bridge', [br.el])]),
      panel('Method settings', [st.el]), { refresh: out.refresh }, { refresh: br.refresh }, { refresh: ov.refresh }]);
  }

  /* ---- Projections ---- */
  function tabProj() {
    var n = nH();
    function row(label, hk, pk, opts) {
      opts = opts || {};
      return { label: label, cls: opts.cls || '', unit: opts.unit || '', cell: function (c) {
        var sg = opts.neg ? -1 : 1;
        if (c < n) return hk ? calc(function () { var v = R.H[hk]; return v && v[c] != null ? sg * v[c] : null; }, opts.fmt, opts.flag) : null;
        return calc(function () { return sg * R.P[pk][c - n]; }, opts.fmt, opts.flag);
      } };
    }
    var t = G.table({ id: 'proj', corner: unitLabel() + ' · ' + SCEN_LABEL[S.settings.scenario], cols: allCols(), rows: [
      { type: 'head', label: 'Income statement' },
      row('Revenue', 'revenue', 'revenue', { cls: 'total' }), row('Cost of goods sold', 'cogs', 'cogs'), row('Gross profit', 'grossProfit', 'grossProfit', { cls: 'sub' }),
      row('SG&A', 'sga', 'sga'), row('Other operating expense', 'otherOpex', 'otherOpex'), row('EBITDA', 'ebitda', 'ebitda', { cls: 'total' }),
      row('EBITDA margin', 'ebitdaMargin', 'ebitdaMargin', { fmt: 'pct', cls: 'ratio' }),
      row('D&A', 'da', 'da'), row('EBIT', 'ebit', 'ebit', { cls: 'sub' }), row('Interest expense', 'interestExp', 'interestExp'), row('Interest income', 'interestInc', 'interestInc'),
      row('Profit before tax', 'ebt', 'ebt', { cls: 'sub' }), row('Income tax', 'tax', 'tax'), row('Net income', 'netIncome', 'netIncome', { cls: 'total' }),
      { type: 'head', label: 'Balance sheet' },
      row('Cash (plug)', 'cash', 'cash'), row('Accounts receivable', 'ar', 'ar'), row('Inventory', 'inventory', 'inventory'), row('Other current assets', 'otherCA', 'otherCA'),
      row('PP&E, net', 'ppe', 'ppe'), row('Other non-current assets', 'otherNCA', 'otherNCA'), row('Total assets', 'totalAssets', 'totalAssets', { cls: 'total' }),
      row('Accounts payable', 'ap', 'ap'), row('Other current liabilities', 'otherCL', 'otherCL'), row('Total debt', 'debt', 'debt'),
      row('Other non-current liabilities', 'otherNCL', 'otherNCL'), row('Minority interest', 'minority', 'minority'), row('Shareholders’ equity', 'equity', 'equity'),
      row('Check: assets − liabilities − equity', 'balanceCheck', 'balanceCheck', { cls: 'check', fmt: 'dec', flag: function (v) { return Math.abs(v - R.P.histImbalance) > 0.5; } }),
      { type: 'head', label: 'Cash flow statement' },
      row('Net income', 'netIncome', 'netIncome'), row('Plus: D&A', 'da', 'da'), row('Less: increase in NWC', null, 'dNwc', { neg: true }),
      row('Cash from operations', 'cfo', 'cfo', { cls: 'sub' }), row('Capital expenditure', 'capex', 'capex', { neg: true }), row('Cash from investing', null, 'cfi', { cls: 'sub' }),
      row('Dividends paid', 'dividends', 'dividends', { neg: true }), row('Cash from financing (debt − dividends)', null, 'cff', { cls: 'sub' }),
      row('Net change in cash', null, 'netCashFlow', { cls: 'total' })
    ] });
    return group([panel('Integrated projection', [h('p', { class: 'muted', text: 'Interest on opening balances, so no circular reference. Cash is the balancing item. Historical cash-flow columns show only the lines entered on Historicals.' }), t])]);
  }

  /* ---- FCF & terminal value ---- */
  function tabFcf() {
    function pr(label, k, opts) { opts = opts || {}; return { label: label, cls: opts.cls || '', unit: opts.unit || '', cell: function (c) { return calc(function () { var v = R.P[k][c]; return opts.neg ? -v : v; }, opts.fmt); } }; }
    var t = G.table({ id: 'fcf', corner: unitLabel(), cols: projCols(), rows: [
      pr('EBIT', 'ebit'), { label: 'Tax on EBIT', unit: '', cell: function (c) { return calc(function () { return -(R.P.ebit[c] - R.P.nopat[c]); }); } },
      pr('NOPAT', 'nopat', { cls: 'sub' }), pr('Plus: D&A', 'da'), pr('Less: capex', 'capex', { neg: true }), pr('Less: increase in NWC', 'dNwc', { neg: true }),
      pr('Unlevered free cash flow', 'ufcf', { cls: 'total' }),
      pr('Discount period', 'period', { fmt: 'dec', unit: 'yrs' }), pr('Discount factor', 'df', { fmt: 'dec3' }), pr('PV of UFCF', 'pvUfcf', { cls: 'sub' })
    ] });
    var tE = G.table({ id: 'fcfe', corner: unitLabel(), cols: projCols(), rows: [
      pr('Net income', 'netIncome'), pr('Plus: D&A', 'da'), pr('Less: capex', 'capex', { neg: true }), pr('Less: increase in NWC', 'dNwc', { neg: true }),
      pr('Plus: net borrowing / (repayment)', 'dDebt'),
      pr('Free cash flow to equity', 'fcfe', { cls: 'total' }),
      { label: 'Discount factor at cost of equity', unit: '', cell: function (c) { return calc(function () { return 1 / Math.pow(1 + R.VE.wacc, R.P.period[c]); }, 'dec3'); } },
      { label: 'PV of FCFE', unit: '', cls: 'sub', cell: function (c) { return calc(function () { return R.P.fcfe[c] / Math.pow(1 + R.VE.wacc, R.P.period[c]); }); } }
    ] });
    function tvTable(id, Vf, sumLbl, valLbl) {
      var V = function () { return R[Vf]; };
      return G.table({ id: id, corner: unitLabel(), cols: [{ label: 'Gordon growth' }, { label: 'Exit multiple' }], rows: [
        { label: 'Terminal-year metric', unit: '', cell: function (c) { return calc(function () { return c ? V().metricN : V().fcfN; }); } },
        { label: 'Assumption', unit: '', cell: function (c) { return calc(function () { return c ? U.fmtX(V().mult) + ' ' + V().exitLabel : U.fmtPct(V().g) + ' growth'; }); } },
        { label: 'Rate in the Gordon denominator', unit: '', cell: function (c) { return calc(function () { return c ? null : V().tvRate; }, 'pct'); } },
        { label: 'Less: net debt at year N', unit: '', cell: function (c) { return calc(function () { return c && V().netDebtN != null && V().exit === 'evEbitda' ? -V().netDebtN : null; }); } },
        { label: 'Terminal value (undiscounted)', unit: '', cls: 'sub', cell: function (c) { return calc(function () { return c ? V().tvX : V().tvG; }); } },
        { label: 'Discount period', unit: 'yrs', cell: function (c) { return calc(function () { return c ? V().perX : V().perG; }, 'dec'); } },
        { label: 'PV of terminal value', unit: '', cell: function (c) { return calc(function () { return c ? V().pvTvX : V().pvTvG; }); } },
        { label: sumLbl, unit: '', cell: function () { return calc(function () { return V().sumPV; }); } },
        { label: valLbl, unit: '', cls: 'total', cell: function (c) { return calc(function () { return Vf === 'VE' ? (c ? V().eqX : V().eqG) : (c ? V().evX : V().evG); }); } },
        { label: 'TV share of value', unit: '', cell: function (c) { return calc(function () { return c ? V().tvShareX : V().tvShareG; }, 'pct'); } },
        { type: 'head', label: 'Cross-check between methods' },
        { label: 'Implied exit multiple', unit: '', cell: function (c) { return calc(function () { return c ? V().mult : V().impliedMultFromG; }, 'x'); } },
        { label: 'Implied perpetual growth', unit: '', cell: function (c) { return calc(function () { return c ? V().impliedGFromX : V().g; }, 'pct', function (v) { return Math.abs(V().impliedGFromX - V().g) > 0.015; }); } }
      ] });
    }
    var tvF = tvTable('tvt', 'VF', 'Sum of PV of UFCF', 'Enterprise value'), tvE = tvTable('tvte', 'VE', 'Sum of PV of FCFE', 'Equity value incl. cash and non-operating items');
    return group([panel('Unlevered free cash flow · discounted at WACC · ' + SCEN_LABEL[S.settings.scenario], [t]),
      panel('Terminal value · FCFF', [tvF, h('p', { class: 'f-help', text: 'Gordon: UFCF(N) × (1 + g) / (WACC − g). Exit: final-year metric × enterprise multiple (EV/EBITDA, EV/EBIT or EV/Sales — choose on Methodology). With mid-year discounting the Gordon value is discounted at N − 0.5 and the exit value at N.' })]),
      panel('Free cash flow to equity (FCFE) · discounted at cost of equity', [tE]),
      panel('Terminal value · FCFE', [tvE, h('p', { class: 'f-help', text: 'Gordon: FCFE(N) × (1 + g) / (Ke − g). Exit: P/E × net income, P/S × revenue, P/B × book equity, or EV/EBITDA × EBITDA − net debt, all at year N. Equity value adds opening cash and non-operating items; debt is not deducted because debt service is inside FCFE.' })])]);
  }

  /* ---- Methodology: user picks, best practice marked with the reason ---- */
  function tabMethod() {
    var M = E.methodOf(S), CH = (Hub.methodChoices || []).filter(function (c) { return c.key !== 'basis'; });
    var fa = Hub.i18n && Hub.i18n.lang() === 'fa', LNG = function (en, f) { return fa ? f : en; };
    var wrap = h('div', { class: 'mth', 'data-notr': '1', dir: fa ? 'rtl' : 'ltr' });
    CH.forEach(function (c) {
      var cur = M[c.key];
      var sel = h('select', { class: 'f-sel', 'aria-label': LNG(c.q[0], c.q[1]) }, c.opts.map(function (o) { return h('option', { value: o[0], text: LNG(o[1][0], o[1][1]).replace(/ \((house, FFDG|روش داخلی، FFDG)\)/, '') + (o[0] === c.best ? LNG('  ✓ best practice', '  ✓ استاندارد جهانی') : '') }); }));
      sel.value = cur;
      sel.addEventListener('change', function () { M[c.key] = sel.value; recompute(); renderTab('method'); });
      var ok = (c.ok || []).indexOf(cur) >= 0, off = cur !== c.best && !ok;
      var badge = cur === c.best ? LNG('Using the best-practice option', 'گزینهٔ استاندارد جهانی فعال است') : ok ? LNG('Acceptable alternative to the best-practice option', 'جایگزین قابل قبول برای گزینهٔ استاندارد جهانی') : LNG('Differs from best practice — keep only with a stated reason', 'با استاندارد جهانی متفاوت است — فقط با دلیل مشخص نگه دارید');
      wrap.appendChild(h('div', { class: 'mth-card' + (off ? ' off' : '') }, [h('div', { class: 'mth-q' }, [h('strong', { text: LNG(c.q[0], c.q[1]) }), sel]),
        h('p', { class: 'mth-badge', text: badge }), h('p', { class: 'mth-why', text: LNG(c.why[0], c.why[1]) }), h('p', { class: 'muted mth-src', text: LNG('Source: ', 'منبع: ') + c.src })]));
    });
    if (!CH.length) wrap.appendChild(h('p', { class: 'muted', text: 'Method descriptions load with the Company Model module.' }));
    var cmp = G.table({ id: 'mcmp', corner: S.meta.currency + ' per share', cols: [{ label: 'FCFF at WACC' }, { label: 'FCFE at Ke' }, { label: 'FCFE ÷ FCFF − 1' }], rows: [
      { label: 'Gordon growth', cell: function (c) { return calc(function () { return R.compare.psG[c]; }, c === 2 ? 'pct' : 'num'); } },
      { label: 'Exit multiple', cell: function (c) { return calc(function () { return R.compare.psX[c]; }, c === 2 ? 'pct' : 'num'); } },
      { label: 'Blended', cls: 'total', cell: function (c) { return calc(function () { return R.compare.psBlend[c]; }, c === 2 ? 'pct' : 'num'); } },
      { label: 'Discount rate', cell: function (c) { return calc(function () { return c < 2 ? R.compare.rate[c] : null; }, 'pct'); } },
      { label: 'Exit multiple used', cell: function (c) { return calc(function () { return c < 2 ? U.fmtX(R.compare.mult[c]) + ' ' + R.compare.exit[c] : ''; }); } },
      { label: 'Terminal growth used', cell: function (c) { return calc(function () { return c < 2 ? R.V.g : null; }, 'pct'); } },
      { label: 'TV share (Gordon)', cell: function (c) { return calc(function () { return c < 2 ? R.compare.tvShareG[c] : null; }, 'pct'); } }
    ] });
    var lev = h('p', { class: 'f-help' });
    function paintLev() {
      var eq = R.VF.eqBlend, d = R.VF.bridge.debt, imp = eq > 0 ? d / (d + eq) : NaN;
      lev.textContent = 'Consistency check: target D/(D+E) in WACC ' + U.fmtPct(S.wacc.debtWeight, 0) + ' vs implied by this valuation ' + (isFinite(imp) ? U.fmtPct(imp, 0) : '–') + ' (book debt ÷ (debt + FCFF equity value)). FCFE follows the debt in the financing plan; when the two leverage figures differ, FCFF and FCFE will not agree.';
    }
    paintLev();
    return { el: h('div', { class: 'stack' }, [
      panel('Methodology — you choose; best practice is marked with the reason', [wrap, h('p', { class: 'f-help', text: 'Both methods are always calculated and exported. The choice sets the headline (KPIs, Valuation, Excel Summary) and which exit multiple each method uses. Every multiple has its own inputs per scenario on Drivers.' })]),
      panel('Both methods on the same inputs · ' + SCEN_LABEL[S.settings.scenario], [cmp, lev])
    ]), refresh: function () { paintLev(); } };
  }

  /* ---- Valuation ---- */
  function tabVal() {
    var V = function () { return R.VF; }, B = function () { return R.VF.bridge; };
    function three(fn, fmt) { return function (c) { return calc(function () { return fn(c); }, fmt); }; }
    var w = function () { return S.settings.gordonWeight; };
    function pick(g, x) { return function (c) { return c === 0 ? g() : c === 1 ? x() : w() * g() + (1 - w()) * x(); }; }
    var br = G.table({ id: 'bridge-t', corner: unitLabel(), cols: [{ label: 'Gordon' }, { label: 'Exit multiple' }, { label: 'Blended' }], rows: [
      { label: 'Enterprise value', cls: 'sub', cell: three(pick(function () { return V().evG; }, function () { return V().evX; })) },
      { label: 'Less: total debt', cell: three(function () { return -B().debt; }) },
      { label: 'Plus: cash', cell: three(function () { return B().cash; }) },
      { label: 'Less: minority interest', cell: three(function () { return -B().minority; }) },
      { label: 'Less: preferred equity', cell: three(function () { return -B().preferred; }) },
      { label: 'Plus: investments in associates', cell: three(function () { return B().investments; }) },
      { label: 'Plus: other non-operating assets', cell: three(function () { return B().nonOpAssets; }) },
      { label: 'Less: other debt-like claims', cell: three(function () { return -B().otherClaims; }) },
      { label: 'Equity value', cls: 'total', cell: three(pick(function () { return V().eqG; }, function () { return V().eqX; })) },
      { label: 'Diluted shares (mn)', cell: three(function () { return S.bridge.sharesMn; }, 'dec') },
      { label: 'Value per share (' + S.meta.currency + ')', cls: 'total', cell: three(pick(function () { return V().psG; }, function () { return V().psX; })) },
      { label: 'Upside / (downside) to price', cell: three(function (c) { var p = S.bridge.price; if (!(p > 0)) return null; return pick(function () { return V().psG; }, function () { return V().psX; })(c) / p - 1; }, 'pct') }
    ] });

    var both = G.table({ id: 'both-t', corner: S.meta.currency + ' per share', cols: [{ label: 'Gordon' }, { label: 'Exit multiple' }, { label: 'Blended' }], rows: [
      { label: 'FCFF at WACC', cell: three(pick(function () { return R.VF.psG; }, function () { return R.VF.psX; })) },
      { label: 'FCFE at cost of equity', cell: three(pick(function () { return R.VE.psG; }, function () { return R.VE.psX; })) },
      { label: 'FCFE ÷ FCFF − 1', cls: 'sub', cell: three(function (c) { var f = pick(function () { return R.VF.psG; }, function () { return R.VF.psX; })(c), e = pick(function () { return R.VE.psG; }, function () { return R.VE.psX; })(c); return f ? e / f - 1 : null; }, 'pct') },
      { label: 'Headline (selected on Methodology)', cls: 'total', cell: three(pick(function () { return R.V.psG; }, function () { return R.V.psX; })) },
      { label: 'Discount rate · FCFF | FCFE', cell: function (c) { return calc(function () { return c === 0 ? R.VF.wacc : c === 1 ? R.VE.wacc : null; }, 'pct'); } },
      { label: 'Exit multiple used · FCFF | FCFE', cell: function (c) { return calc(function () { return c === 0 ? U.fmtX(R.VF.mult) + ' ' + R.VF.exitLabel : c === 1 ? U.fmtX(R.VE.mult) + ' ' + R.VE.exitLabel : ''; }); } }
    ] });
    var bothNote = h('p', { class: 'f-help', text: 'A large FCFF / FCFE gap usually means the target D/(D+E) in WACC does not match the debt in the financing plan (FCFE uses the plan, WACC uses the target), or the two exit multiples are not consistent. Align them before relying on either.' });

    var sc = ['base', 'upside', 'downside'];
    var sum = G.table({ id: 'scen', corner: 'All scenarios', cols: sc.map(function (k) { return { label: SCEN_LABEL[k], cls: k === S.settings.scenario ? 'cur' : '' }; }), rows: [
      { label: 'EV, blended (' + unitLabel() + ')', cell: function (c) { return calc(function () { return R.scenarios[sc[c]].V.evBlend; }); } },
      { label: 'Equity value, blended', cell: function (c) { return calc(function () { return R.scenarios[sc[c]].V.eqBlend; }); } },
      { label: 'Per share · Gordon', cell: function (c) { return calc(function () { return R.scenarios[sc[c]].V.psG; }); } },
      { label: 'Per share · Exit multiple', cell: function (c) { return calc(function () { return R.scenarios[sc[c]].V.psX; }); } },
      { label: 'Per share · Blended (headline)', cls: 'total', cell: function (c) { return calc(function () { return R.scenarios[sc[c]].V.psBlend; }); } },
      { label: 'Per share · FCFF blended', cell: function (c) { return calc(function () { return R.scenarios[sc[c]].VF.psBlend; }); } },
      { label: 'Per share · FCFE blended', cell: function (c) { return calc(function () { return R.scenarios[sc[c]].VE.psBlend; }); } },
      { label: 'Final-year revenue', cell: function (c) { return calc(function () { var p = R.scenarios[sc[c]].P.revenue; return p[p.length - 1]; }); } },
      { label: 'Final-year EBITDA margin', cell: function (c) { return calc(function () { var p = R.scenarios[sc[c]].P.ebitdaMargin; return p[p.length - 1]; }, 'pct'); } }
    ] });

    var revBox = h('div', { class: 'rev' });
    function paintRev() {
      U.clear(revBox);
      var r = R.reverse;
      if (!r) { revBox.appendChild(h('p', { class: 'muted', text: 'Enter the current share price on WACC & bridge to see what the market price implies.' })); return; }
      var f = function (v, k) { return v == null ? 'outside solvable range' : k === 'x' ? U.fmtX(v) : U.fmtPct(v, 2); };
      revBox.appendChild(h('p', { text: 'At ' + U.fmtNum(r.price) + ' ' + S.meta.currency + ' per share, holding every other input at the ' + SCEN_LABEL[S.settings.scenario] + ' case, the market price requires one of:' }));
      revBox.appendChild(h('dl', { class: 'kv wide' }, [
        h('dt', { text: 'Perpetual growth (Gordon)' }), h('dd', { text: f(r.gImplied) + '  vs ' + U.fmtPct(R.V.g, 2) + ' assumed' }),
        h('dt', { text: 'Discount rate (Gordon)' }), h('dd', { text: f(r.waccImplied) + '  vs ' + U.fmtPct(R.V.wacc, 2) + ' used (' + R.V.rateLabel + ')' }),
        h('dt', { text: 'Exit ' + R.V.exitLabel }), h('dd', { text: f(r.multImplied, 'x') + '  vs ' + U.fmtX(R.V.mult) + ' assumed' })
      ]));
    }
    paintRev();

    var chk = h('ul', { class: 'checks', id: 'checks' });
    function paintChk() {
      U.clear(chk);
      if (!R.checks.length) chk.appendChild(h('li', { class: 'good', text: 'No issues: balance sheet balances, terminal methods agree within 1.5 pp, WACC above growth.' }));
      R.checks.forEach(function (c) { chk.appendChild(h('li', { class: c.level, text: c.msg })); });
    }
    paintChk();

    var ff = h('canvas', { id: 'chart-ff', 'aria-label': 'Football field of value per share' });
    var op = h('canvas', { id: 'chart-op', 'aria-label': 'Revenue and EBITDA margin' });
    var fc = h('canvas', { id: 'chart-fcf', 'aria-label': 'Unlevered free cash flow' });

    var g = group([
      panel('FCFF and FCFE side by side · ' + SCEN_LABEL[S.settings.scenario], [both.el, bothNote]),
      panel('Equity bridge (FCFF) · ' + SCEN_LABEL[S.settings.scenario], [br.el]),
      panel('Scenario summary', [sum.el]),
      panel('Football field · value per share (' + S.meta.currency + ')', [h('div', { class: 'chart tall' }, [ff])]),
      h('div', { class: 'two' }, [panel('What the market price implies', [revBox]), panel('Model checks', [chk])]),
      h('div', { class: 'two' }, [panel('Revenue and EBITDA margin', [h('div', { class: 'chart' }, [op])]), panel('Unlevered free cash flow and PV', [h('div', { class: 'chart' }, [fc])])]),
      { refresh: br.refresh }, { refresh: sum.refresh }, { refresh: both.refresh }
    ]);
    var r0 = g.refresh;
    g.refresh = function () { r0(); paintRev(); paintChk(); drawCharts(); };
    g.after = drawCharts;
    return g;
  }

  /* ---- Sensitivity ---- */
  function tabSens() {
    var steps = G.form({ id: 'sstep', onChange: recompute, fields: [
      { key: 'ws', label: 'WACC step', unit: '%', fmt: 'pct2', get: function () { return S.sens.waccStep; }, set: function (v) { S.sens.waccStep = v; } },
      { key: 'gs', label: 'Growth step', unit: '%', fmt: 'pct2', get: function () { return S.sens.gStep; }, set: function (v) { S.sens.gStep = v; } },
      { key: 'ms', label: 'Multiple step', unit: 'x', fmt: 'dec', get: function () { return S.sens.multStep; }, set: function (v) { S.sens.multStep = v; } }
    ] });
    var a = h('div', { class: 'grid-wrap' }), b = h('div', { class: 'grid-wrap' }), c = h('div', { class: 'grid-wrap' }), d = h('div', { class: 'grid-wrap' }), e = h('div', { class: 'grid-wrap' });
    function heat(target, title, rowsV, colsV, data, colFmt, base, cur, rowLbl) {
      U.clear(target);
      var all = [].concat.apply([], data).filter(isFinite), lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
      var t = h('table', { class: 'grid heat' });
      t.appendChild(h('caption', { text: title }));
      t.appendChild(h('thead', null, [h('tr', null, [h('th', { class: 'lbl', text: (rowLbl || 'WACC') + ' ↓  ·  ' + colFmt[1] + ' →' })].concat(colsV.map(function (v, j) { return h('th', { class: 'num' + (j === 2 ? ' cur' : ''), text: colFmt[0](v) }); })))]));
      var tb = h('tbody');
      rowsV.forEach(function (w, i) {
        var tr = h('tr', null, [h('th', { class: 'lbl num' + (i === 2 ? ' cur' : ''), scope: 'row', text: U.fmtPct(w, 2) })]);
        data[i].forEach(function (v, j) {
          var pos = hi > lo ? (v - lo) / (hi - lo) : 0.5;
          var td = h('td', { class: 'num hc' + (i === 2 && j === 2 ? ' base' : ''), text: isFinite(v) ? U.fmtNum(v) : 'n/a' });
          td.style.setProperty('--h', pos.toFixed(3));
          if (cur > 0 && isFinite(v)) td.classList.toggle('below', v < cur);
          tr.appendChild(td);
        });
        tb.appendChild(tr);
      });
      t.appendChild(tb);
      target.appendChild(t);
    }
    function paint() {
      var f = R.sensF, q = R.sensE, px = S.bridge.price, pc = function (v) { return U.fmtPct(v, 2); }, xx = function (v) { return U.fmtX(v); };
      heat(a, 'FCFF · value per share · Gordon growth', f.waccs, f.gs, f.gordon, [pc, 'g'], R.VF.psG, px, 'WACC');
      heat(b, 'FCFF · value per share · exit ' + f.exitLabel, f.waccs, f.mults, f.exit, [xx, f.exitLabel], R.VF.psX, px, 'WACC');
      heat(c, 'FCFE · value per share · Gordon growth', q.waccs, q.gs, q.gordon, [pc, 'g'], R.VE.psG, px, 'Ke');
      heat(d, 'FCFE · value per share · exit ' + q.exitLabel, q.waccs, q.mults, q.exit, [xx, q.exitLabel], R.VE.psX, px, 'Ke');
      heat(e, 'FCFF · enterprise value · Gordon growth (' + unitLabel() + ')', f.waccs, f.gs, f.evGordon, [pc, 'g'], R.VF.evG, 0, 'WACC');
    }
    paint();
    return { el: h('div', { class: 'stack' }, [
      panel('Steps', [steps.el, h('p', { class: 'f-help', text: 'Centre cell = current case. Shading runs low to high within each table; values below the market price are marked with a dotted underline. FCFF and FCFE do not depend on the discount rate, growth or the multiple, so these grids re-price the same cash flows.' })]),
      panel(null, [a]), panel(null, [c]), panel(null, [b]), panel(null, [d]), panel(null, [e])
    ]), refresh: paint };
  }

  /* ---------- charts ------------------------------------------------ */
  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  function destroyCharts() { charts.forEach(function (c) { try { c.destroy(); } catch (e) { /* ignore */ } }); charts = []; }
  function drawCharts() {
    if (!root.Chart || activeTab !== 'val') return;
    destroyCharts();
    var fg = css('--muted'), grid = css('--line'), acc = css('--accent'), acc2 = css('--accent-2'), inp = css('--input'), crit = css('--crit');
    Chart.defaults.color = fg; Chart.defaults.font.family = css('--font-body') || 'sans-serif'; Chart.defaults.borderColor = grid;
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

    // football field: per-method range across scenarios + sensitivity range
    var sc = R.scenarios, ps = function (k, m) { return sc[k].V[m]; };
    var rng = function (m) { var v = ['base', 'upside', 'downside'].map(function (k) { return ps(k, m); }); return [Math.min.apply(null, v), Math.max.apply(null, v)]; };
    var flat = function (a) { return [].concat.apply([], a).filter(isFinite); };
    var sg = flat(R.sens.gordon), sx = flat(R.sens.exit);
    var rngM = function (Vk) { var v = ['base', 'upside', 'downside'].map(function (k) { return sc[k][Vk].psBlend; }); return [Math.min.apply(null, v), Math.max.apply(null, v)]; };
    var rows = [
      ['FCFF · blended (scenarios)', rngM('VF')], ['FCFE · blended (scenarios)', rngM('VE')],
      ['DCF · Gordon (scenarios)', rng('psG')], ['DCF · Exit multiple (scenarios)', rng('psX')], ['DCF · Blended (scenarios)', rng('psBlend')],
      ['Sensitivity · WACC × g', [Math.min.apply(null, sg), Math.max.apply(null, sg)]], ['Sensitivity · WACC × multiple', [Math.min.apply(null, sx), Math.max.apply(null, sx)]]
    ];
    var ffEl = document.getElementById('chart-ff');
    if (ffEl) {
      var px = S.bridge.price;
      var priceLine = { id: 'priceLine', afterDatasetsDraw: function (ch) {
        if (!(px > 0)) return;
        var x = ch.scales.x.getPixelForValue(px), a = ch.chartArea;
        if (x < a.left || x > a.right) return;
        var c = ch.ctx; c.save(); c.strokeStyle = crit; c.setLineDash([4, 4]); c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(x, a.top); c.lineTo(x, a.bottom); c.stroke();
        c.fillStyle = crit; c.font = '600 11px ' + Chart.defaults.font.family; c.textAlign = 'center'; c.fillText('Price ' + U.fmtNum(px), x, a.top - 4); c.restore();
      } };
      charts.push(new Chart(ffEl, { type: 'bar', plugins: [priceLine],
        data: { labels: rows.map(function (r) { return r[0]; }), datasets: [{ data: rows.map(function (r) { return r[1]; }), backgroundColor: [acc2, acc2, acc, acc, acc, inp, inp], borderRadius: 3, barPercentage: 0.6 }] },
        options: { indexAxis: 'y', maintainAspectRatio: false, animation: reduce ? false : { duration: 300 }, layout: { padding: { top: 16 } },
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return U.fmtNum(c.raw[0]) + ' – ' + U.fmtNum(c.raw[1]); } } } },
          scales: { x: { grid: { color: grid }, ticks: { callback: function (v) { return U.fmtNum(v); } } }, y: { grid: { display: false } } } } }));
    }
    var opEl = document.getElementById('chart-op');
    if (opEl) {
      var labs = S.hist.years.concat(S.projYears);
      charts.push(new Chart(opEl, { data: { labels: labs, datasets: [
        { type: 'bar', label: 'Revenue', data: R.H.revenue.concat(R.P.revenue), backgroundColor: labs.map(function (_, i) { return i < nH() ? grid : acc; }), yAxisID: 'y', borderRadius: 2, order: 2 },
        { type: 'line', label: 'EBITDA margin', data: R.H.ebitdaMargin.concat(R.P.ebitdaMargin).map(function (v) { return v * 100; }), borderColor: acc2, backgroundColor: acc2, yAxisID: 'y1', tension: 0.25, pointRadius: 3, order: 1 }
      ] }, options: { maintainAspectRatio: false, animation: reduce ? false : { duration: 300 }, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } }, tooltip: { callbacks: { label: function (c) { return c.dataset.label + ': ' + (c.dataset.yAxisID === 'y1' ? c.raw.toFixed(1) + '%' : U.fmtNum(c.raw)); } } } },
        scales: { y: { grid: { color: grid }, ticks: { callback: function (v) { return U.fmtNum(v); } } }, y1: { position: 'right', grid: { display: false }, ticks: { callback: function (v) { return v + '%'; } } }, x: { grid: { display: false } } } } }));
    }
    var fcEl = document.getElementById('chart-fcf');
    if (fcEl) {
      charts.push(new Chart(fcEl, { type: 'bar', data: { labels: S.projYears, datasets: [
        { label: 'UFCF', data: R.P.ufcf, backgroundColor: acc, borderRadius: 2 },
        { label: 'PV of UFCF', data: R.P.pvUfcf, backgroundColor: inp, borderRadius: 2 }
      ] }, options: { maintainAspectRatio: false, animation: reduce ? false : { duration: 300 },
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } }, tooltip: { callbacks: { label: function (c) { return c.dataset.label + ': ' + U.fmtNum(c.raw); } } } },
        scales: { y: { grid: { color: grid }, ticks: { callback: function (v) { return U.fmtNum(v); } } }, x: { grid: { display: false } } } } }));
    }
  }

  /* ---------- live data ---------------------------------------------- */
  function fetchStatements(t) {
    return Hub.data.financials(t, 3).then(function (d) {
      var tag = d._provider + ' ' + U.stamp();
      if (d.currency && d.currency !== S.meta.currency) {
        S.meta.currency = d.currency; S.meta.unit = 'million';
      }
      var div = E.UNIT_MULT[S.meta.unit] || 1;
      var n = d.lines.length;
      S.hist.years = d.years.slice();
      var map = { is: ['revenue', 'cogs', 'sga', 'otherOpex', 'da', 'interestExp', 'interestInc', 'otherNonOp', 'tax'],
        bs: ['cash', 'ar', 'inventory', 'otherCA', 'ppe', 'otherNCA', 'ap', 'otherCL', 'std', 'ltd', 'otherNCL', 'minority', 'equity'],
        cfs: ['cfo', 'capex', 'dividends'] };
      Object.keys(map).forEach(function (sec) { map[sec].forEach(function (k) {
        S.hist[sec][k] = d.lines.map(function (l) { return (l[k] || 0) / div; });
        S.sources['hist.' + sec + '.' + k] = tag;
      }); });
      var lastY = parseInt(String(d.years[n - 1]).replace(/\D/g, ''), 10);
      if (isFinite(lastY)) S.projYears = [1, 2, 3, 4, 5].map(function (i) { return 'FY' + (lastY + i) + 'E'; });
      S.meta.valuationDate = d.raw[n - 1] && d.raw[n - 1].year ? d.raw[n - 1].year + ' year-end' : S.meta.valuationDate;
      if (!S.meta.company || /illustrative|New company/i.test(S.meta.company)) S.meta.company = t;
      rerender();
      return 'Loaded ' + n + ' years for ' + t + ' from ' + d._provider + ' in ' + S.meta.currency + ' ' + S.meta.unit + 's. Check the balance sheet and the "other" plug lines on Historicals before relying on them.';
    });
  }
  function fetchMarket(t) {
    // Persian symbol or TSETMC instrument code -> TSETMC; otherwise FMP / Alpha Vantage
    if (/[\u0600-\u06FF]/.test(t) || /^\d{8,}$/.test(t)) {
      return Hub.data.tse.quote(t).then(function (q) {
        var tag = 'TSETMC ' + U.stamp();
        S.bridge.price = q.price; S.sources['bridge.price'] = tag;
        S.bridge.sharesMn = q.shares / 1e6; S.sources['bridge.sharesMn'] = tag;
        if (/illustrative|New company/i.test(S.meta.company || '') || !S.meta.company) S.meta.company = q.symbol + ' · ' + q.name;
        if (S.meta.currency !== 'IRR') { S.meta.currency = 'IRR'; }
        rerender();
        return q.symbol + ' (' + q.name + '): closing price ' + U.fmtNum(q.price) + ' IRR, shares ' + U.fmtNum(q.shares / 1e6) + ' mn' + (q.eps ? ', TSETMC estimated EPS ' + U.fmtNum(q.eps) : '') + (q.sectorPE ? ', sector P/E ' + q.sectorPE.toFixed(1) : '') + '. TSETMC has no beta: use the WACC tool and Send to DCF.';
      });
    }
    return Hub.data.quote(t).then(function (q) {
      var tag = q._provider + ' ' + U.stamp();
      S.bridge.price = q.price; S.sources['bridge.price'] = tag;
      if (q.shares) { S.bridge.sharesMn = q.shares / 1e6; S.sources['bridge.sharesMn'] = tag; }
      if (q.beta) { S.wacc.betaLevered = q.beta; S.wacc.betaMode = 'levered'; S.sources['wacc.betaLevered'] = tag; }
      if (q.name && (!S.meta.company || /illustrative|New company|^[A-Z.]+$/.test(S.meta.company))) S.meta.company = q.name;
      rerender();
      return q.name + ': price ' + U.fmtNum(q.price, 2) + ' ' + (q.currency || '') + ', beta ' + U.fmtNum(q.beta, 2) + ' (regression beta, levered; beta method switched to "levered"), shares ' + U.fmtNum(q.shares / 1e6, 1) + ' mn (basic, from market cap ÷ price — adjust for dilution).';
    });
  }
  function fetchRf() {
    return Hub.data.riskFree().then(function (r) {
      S.wacc.rf = r.rate; S.sources['wacc.rf'] = r._provider + ' ' + r.date;
      rerender();
      return r.label + ' ' + U.fmtPct(r.rate, 2) + ' as of ' + r.date + '. This is a USD rate: consistent only with a USD-denominated model.';
    });
  }

  /* ---------- save / open / csv -------------------------------------- */
  function saveJson() {
    U.saveFile(U.slug(S.meta.company) + '_DCF_' + U.stamp() + '.json', new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }));
  }
  function openBtn() {
    var inp = h('input', { type: 'file', accept: '.json,application/json', class: 'vh', id: 'dcf-open', 'aria-label': 'Open model file' });
    inp.addEventListener('change', function () {
      var f = inp.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        try { var s = JSON.parse(rd.result); if (!s.hist || !s.scenarios) throw new Error('not a DCF model file'); S = s; S.sources = S.sources || {}; rerender(); U.toast('Opened ' + f.name, 'good'); }
        catch (e) { U.toast('Could not open: ' + e.message, 'crit'); }
      };
      rd.readAsText(f);
    });
    return h('label', { class: 'btn ghost', for: 'dcf-open' }, ['Open model', inp]);
  }
  function exportCsv() {
    var rows = [['DCF export', S.meta.company, unitLabel(), SCEN_LABEL[S.settings.scenario], S.settings.basis], []];
    rows.push(['Line'].concat(S.projYears));
    [['Revenue', 'revenue'], ['EBITDA', 'ebitda'], ['EBIT', 'ebit'], ['NOPAT', 'nopat'], ['D&A', 'da'], ['Capex', 'capex'], ['Increase in NWC', 'dNwc'], ['UFCF', 'ufcf'], ['Discount factor', 'df'], ['PV of UFCF', 'pvUfcf'], ['Net income', 'netIncome'], ['Cash', 'cash'], ['Debt', 'debt']]
      .forEach(function (r) { rows.push([r[0]].concat(R.P[r[1]].map(function (v) { return +v.toFixed(4); }))); });
    rows.push([]);
    rows.push(['Output', 'Gordon', 'Exit multiple', 'Blended']);
    rows.push(['Enterprise value', R.V.evG, R.V.evX, R.V.evBlend]);
    rows.push(['Equity value', R.V.eqG, R.V.eqX, R.V.eqBlend]);
    rows.push(['Value per share', R.V.psG, R.V.psX, R.V.psBlend]);
    rows.push(['WACC used', R.W.used]);
    U.saveFile(U.slug(S.meta.company) + '_DCF_' + U.stamp() + '.csv', new Blob(['﻿' + U.csvFromRows(rows)], { type: 'text/csv' }));
  }

  Hub.register({ id: 'dcf', title: 'DCF Valuation', sections: ['valuation', 'ipo'], status: 'ready', priority: 0,
    summary: 'Integrated 3-statement projection, WACC build, Gordon and exit-multiple terminal value, scenarios, sensitivity, reverse DCF, Excel with formulas.',
    mount: mount, unmount: unmount });
})(window);
