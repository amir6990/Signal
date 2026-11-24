/* =====================================================================
 * CAPITAL STRUCTURE & WACC
 * Peer betas unlevered (Hamada: βU = βL / (1 + (1 − t) D/E)), median βU
 * relevered across debt/(debt+equity) from 0% to 70%. Cost of debt rises
 * with leverage: Kd = rf + base spread + slope × D/V. Nominal and real (Fisher)
 * shown side by side. Scenarios shift rf and ERP. "Send to DCF" writes the
 * result into the DCF tool's WACC inputs.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {}, F = Hub.fin, num = F.num;
  var DV = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7];
  function sample() {
    return { version: 1, tool: 'wacc', meta: { company: 'Company (illustrative)', currency: 'IRR' }, settings: { scenario: 'base' },
      mkt: { rf: 0.28, erp: 0.08, crp: 0, size: 0.02, tax: 0.25, inflation: 0.25, targetDV: 0.25, spread0: 0.02, spreadSlope: 0.06 },
      peers: [{ name: 'Peer A (illustrative)', beta: 0.95, de: 0.30, tax: 0.25 }, { name: 'Peer B (illustrative)', beta: 1.15, de: 0.55, tax: 0.25 }, { name: 'Peer C (illustrative)', beta: 0.80, de: 0.15, tax: 0.25 },
        { name: 'Peer D (illustrative)', beta: 1.05, de: 0.40, tax: 0.25 }, { name: 'Peer E (illustrative)', beta: 0.90, de: 0.20, tax: 0.25 }],
      scenarios: { base: { rfShift: 0, erpShift: 0 }, upside: { rfShift: -0.03, erpShift: -0.01 }, downside: { rfShift: 0.04, erpShift: 0.01 } }, sens: { rfStep: 0.01, erpStep: 0.01 }, sources: {} };
  }
  function blank() { var s = sample(); s.peers = [{ name: '', beta: 1, de: 0, tax: 0 }]; return s; }
  function at(S, dv, o) {
    o = o || {}; var m = S.mkt, sc = S.scenarios[S.settings.scenario];
    var rf = (o.rf != null ? o.rf : num(m.rf)) + (o.rf != null ? 0 : num(sc.rfShift)), erp = (o.erp != null ? o.erp : num(m.erp)) + (o.erp != null ? 0 : num(sc.erpShift));
    var bu = o.bu, t = num(m.tax), de = dv < 1 ? dv / (1 - dv) : Infinity;
    var bl = bu * (1 + (1 - t) * de), ke = rf + bl * erp + num(m.crp) + num(m.size), kd = rf + num(m.spread0) + num(m.spreadSlope) * dv;
    var w = (1 - dv) * ke + dv * kd * (1 - t);
    return { dv: dv, de: de, betaL: bl, ke: ke, kd: kd, kdAT: kd * (1 - t), wacc: w, real: (1 + w) / (1 + num(m.inflation)) - 1 };
  }
  function run(S) {
    var peers = S.peers.map(function (p) { var bu = num(p.beta) / (1 + (1 - num(p.tax)) * num(p.de)); return { bu: bu }; });
    var st = F.stats(peers.map(function (p) { return p.bu; })), bu = st.median;
    var curve = DV.map(function (d) { return at(S, d, { bu: bu }); });
    var best = curve.reduce(function (a, b) { return b.wacc < a.wacc ? b : a; });
    var tgt = at(S, num(S.mkt.targetDV), { bu: bu });
    var rfs = F.grid5(num(S.mkt.rf) + num(S.scenarios[S.settings.scenario].rfShift), num(S.sens.rfStep)), es = F.grid5(num(S.mkt.erp) + num(S.scenarios[S.settings.scenario].erpShift), num(S.sens.erpStep));
    var grid = rfs.map(function (r) { return es.map(function (e) { return at(S, num(S.mkt.targetDV), { bu: bu, rf: r, erp: e }).wacc; }); });
    var c = [];
    if (st.n < 3) c.push({ level: 'warning', msg: 'Fewer than 3 peer betas; the median is fragile.' });
    if ((1 + num(S.mkt.rf)) / (1 + num(S.mkt.inflation)) - 1 < 0) c.push({ level: 'warning', msg: 'Risk-free rate below expected inflation: real risk-free rate is negative.' });
    if (num(S.mkt.crp) > 0) c.push({ level: 'warning', msg: 'Country risk premium added. If rf is a local-currency government yield, country risk is already priced in it.' });
    return { peers: peers, stats: st, bu: bu, curve: curve, best: best, tgt: tgt, sens: { rfs: rfs, es: es, grid: grid },
      scen: ['base', 'upside', 'downside'].reduce(function (o, k) { var s2 = JSON.parse(JSON.stringify(S)); s2.settings.scenario = k; o[k] = at(s2, num(S.mkt.targetDV), { bu: bu }); return o; }, {}), checks: c };
  }
  function build(ExcelJS, S, R) {
    var X = Hub.xl, L = X.L, b = X.book(ExcelJS);
    var sum = b.sheet('Summary', [2, 40, 16]), A = b.sheet('Assumptions', [2, 40, 10, 14, 14, 14]), P = b.sheet('Peers', [2, 30, 12, 12, 12, 14]), C = b.sheet('Calculations', [2, 34, 12, 12, 12, 12, 12, 12, 12, 12]), Sn = b.sheet('Sensitivity', [2, 18, 12, 12, 12, 12, 12]);
    A.title('Assumptions', S.meta.company + ' · ' + S.meta.currency); var a = {}, r = 4;
    function sc(key, label, unit, v, fmt) { A.put(1, r, label); A.put(2, r, unit, 'unit'); A.put(3, r, v, 'in', fmt); a[key] = A.ref(3, r); r++; }
    A.sec(r++, 'Market inputs', 5);
    var m = S.mkt; sc('rf', 'Risk-free rate (nominal)', '%', num(m.rf), 'pct2'); sc('erp', 'Equity risk premium', '%', num(m.erp), 'pct2'); sc('crp', 'Country risk premium', '%', num(m.crp), 'pct2');
    sc('size', 'Size / specific premium', '%', num(m.size), 'pct2'); sc('tax', 'Marginal tax rate', '%', num(m.tax), 'pct'); sc('inf', 'Expected inflation', '%', num(m.inflation), 'pct2');
    sc('tdv', 'Target debt / (debt + equity)', '%', num(m.targetDV), 'pct'); sc('s0', 'Debt spread at zero leverage', '%', num(m.spread0), 'pct2'); sc('s1', 'Spread increase per 100% D/V', '%', num(m.spreadSlope), 'pct2');
    r++; A.sec(r++, 'Scenarios', 5, ['Base', 'Upside', 'Downside']);
    A.put(1, r, 'rf shift'); ['base', 'upside', 'downside'].forEach(function (k, j) { A.put(3 + j, r, num(S.scenarios[k].rfShift), 'in', 'pct2'); }); var r1 = r; r++;
    A.put(1, r, 'ERP shift'); ['base', 'upside', 'downside'].forEach(function (k, j) { A.put(3 + j, r, num(S.scenarios[k].erpShift), 'in', 'pct2'); }); var r2 = r; r++;
    sc('scen', 'Active scenario (1 Base, 2 Upside, 3 Downside)', '#', ['base', 'upside', 'downside'].indexOf(S.settings.scenario) + 1, 'int');
    A.put(1, r, 'rf used'); A.put(3, r, { f: '=' + a.rf + '+CHOOSE(' + a.scen + ',D' + r1 + ',E' + r1 + ',F' + r1 + ')' }, 'calc', 'pct2'); a.rfu = A.ref(3, r); r++;
    A.put(1, r, 'ERP used'); A.put(3, r, { f: '=' + a.erp + '+CHOOSE(' + a.scen + ',D' + r2 + ',E' + r2 + ',F' + r2 + ')' }, 'calc', 'pct2'); a.erpu = A.ref(3, r); r++;
    sc('rs', 'Sensitivity rf step', '%', num(S.sens.rfStep), 'pct2'); sc('es', 'Sensitivity ERP step', '%', num(S.sens.erpStep), 'pct2');
    P.title('Peer betas', 'Levered betas, D/E and tax in blue; unlevered beta = βL / (1 + (1 − t) × D/E)');
    P.sec(4, 'Peer', 5, ['Levered β', 'D / E', 'Tax', 'Unlevered β'], 2);
    S.peers.forEach(function (p, i) { var rr = 5 + i; P.put(1, rr, p.name, 'in'); P.put(2, rr, num(p.beta), 'in', 'dec3'); P.put(3, rr, num(p.de), 'in', 'pct'); P.put(4, rr, num(p.tax), 'in', 'pct'); P.put(5, rr, { f: '=C' + rr + '/(1+(1-E' + rr + ')*D' + rr + ')' }, 'calc', 'dec3'); });
    var pN = 4 + S.peers.length;
    P.put(1, pN + 1, 'Median unlevered β', 'total'); P.put(5, pN + 1, { f: '=MEDIAN(F5:F' + pN + ')' }, 'total', 'dec3');
    var bu = "'Peers'!$F$" + (pN + 1);
    C.title('Calculations', 'WACC across capital structures'); C.sec(4, 'D / (D + E)', 9, DV.map(function (d) { return (d * 100) + '%'; }), 2);
    var rows = ['D/V', 'D/E', 'Levered β', 'Cost of equity', 'Pre-tax cost of debt', 'After-tax cost of debt', 'WACC nominal', 'WACC real'];
    rows.forEach(function (lb, i) { C.put(1, 5 + i, lb, i >= 6 ? 'total' : null); });
    DV.forEach(function (d, j) {
      var cl = L(2 + j);
      C.put(2 + j, 5, d, 'in', 'pct'); C.put(2 + j, 6, { f: '=' + cl + '5/(1-' + cl + '5)' }, 'calc', 'pct');
      C.put(2 + j, 7, { f: '=' + bu + '*(1+(1-' + a.tax + ')*' + cl + '6)' }, 'calc', 'dec3');
      C.put(2 + j, 8, { f: '=' + a.rfu + '+' + cl + '7*' + a.erpu + '+' + a.crp + '+' + a.size }, 'calc', 'pct2');
      C.put(2 + j, 9, { f: '=' + a.rfu + '+' + a.s0 + '+' + a.s1 + '*' + cl + '5' }, 'calc', 'pct2');
      C.put(2 + j, 10, { f: '=' + cl + '9*(1-' + a.tax + ')' }, 'calc', 'pct2');
      C.put(2 + j, 11, { f: '=(1-' + cl + '5)*' + cl + '8+' + cl + '5*' + cl + '10' }, 'total', 'pct2');
      C.put(2 + j, 12, { f: '=(1+' + cl + '11)/(1+' + a.inf + ')-1' }, 'total', 'pct2');
    });
    C.sec(14, 'At target structure', 9);
    var tg = { bl: '=' + bu + '*(1+(1-' + a.tax + ')*' + a.tdv + '/(1-' + a.tdv + '))' };
    C.put(1, 15, 'Levered β'); C.put(2, 15, { f: tg.bl }, 'calc', 'dec3');
    C.put(1, 16, 'Cost of equity'); C.put(2, 16, { f: '=' + a.rfu + '+C15*' + a.erpu + '+' + a.crp + '+' + a.size }, 'calc', 'pct2');
    C.put(1, 17, 'After-tax cost of debt'); C.put(2, 17, { f: '=(' + a.rfu + '+' + a.s0 + '+' + a.s1 + '*' + a.tdv + ')*(1-' + a.tax + ')' }, 'calc', 'pct2');
    C.put(1, 18, 'WACC nominal', 'total'); C.put(2, 18, { f: '=(1-' + a.tdv + ')*C16+' + a.tdv + '*C17' }, 'total', 'pct2');
    C.put(1, 19, 'WACC real', 'total'); C.put(2, 19, { f: '=(1+C18)/(1+' + a.inf + ')-1' }, 'total', 'pct2');
    C.put(1, 20, 'Minimum WACC on the grid'); C.put(2, 20, { f: '=MIN(C11:J11)' }, 'calc', 'pct2');
    C.put(1, 21, 'D/V at minimum'); C.put(2, 21, { f: '=INDEX(C5:J5,MATCH(C20,C11:J11,0))' }, 'calc', 'pct');
    Sn.title('Sensitivity', 'WACC (nominal) at target structure · rf (rows) × ERP (columns) · live formulas');
    Sn.sec(4, 'rf ↓  ERP →', 6);
    for (var j = 0; j < 5; j++) Sn.put(2 + j, 5, { f: '=' + a.erpu + '+(' + (j - 2) + ')*' + a.es }, 'sec', 'pct2');
    for (var i = 0; i < 5; i++) {
      Sn.put(1, 6 + i, { f: '=' + a.rfu + '+(' + (i - 2) + ')*' + a.rs }, 'sec', 'pct2');
      for (j = 0; j < 5; j++) {
        var rfc = '$B' + (6 + i), ec = L(2 + j) + '$5';
        Sn.put(2 + j, 6 + i, { f: '=(1-' + a.tdv + ')*(' + rfc + "+'Calculations'!$C$15*" + ec + '+' + a.crp + '+' + a.size + ')+' + a.tdv + '*(' + rfc + '+' + a.s0 + '+' + a.s1 + '*' + a.tdv + ')*(1-' + a.tax + ')' }, 'calc', 'pct2');
      }
    }
    Sn.heat('C6:G10');
    sum.title(S.meta.company + ' · Cost of capital', S.meta.currency);
    [['Median unlevered β', "'Peers'!F" + (pN + 1), 'dec3'], ['WACC nominal at target', "'Calculations'!C18", 'pct2'], ['WACC real at target', "'Calculations'!C19", 'pct2'], ['Cost of equity at target', "'Calculations'!C16", 'pct2'], ['Minimum WACC on grid', "'Calculations'!C20", 'pct2'], ['D/V at minimum', "'Calculations'!C21", 'pct']]
      .forEach(function (x, i) { sum.put(1, 4 + i, x[0]); sum.put(2, 4 + i, { f: '=' + x[1] }, 'calc', x[2]); });
    X.notes(b, ['Hamada unlevering assumes debt beta of zero and constant D/E.', 'Cost of debt rises linearly with leverage; replace with a rating-based spread grid when ratings are available.', 'The WACC minimum ignores distress costs beyond the spread schedule; treat it as an upper bound on sensible leverage, not a target.', 'Real WACC = (1 + nominal) / (1 + expected inflation) − 1.'], S.sources);
    return { wb: b.wb };
  }
  Hub.tools = Hub.tools || {}; Hub.tools.wacc = { sample: sample, blank: blank, run: run, build: build };
  if (typeof module !== 'undefined' && module.exports) module.exports = Hub.tools.wacc;
  if (!root.document || !Hub.toolkit) return;

  var U = Hub.util, h = U.h, G = Hub.grid, TK = Hub.toolkit;
  TK.define({
    id: 'wacc', title: 'Capital Structure & WACC', sections: ['finmgmt', 'valuation'], priority: 3, version: 1, storeKey: 'hub.wacc.v1',
    summary: 'Peer beta unlevering, WACC curve across leverage, nominal and real, rf × ERP sensitivity, send to DCF.',
    sample: sample, blank: blank, run: run, scenarios: true,
    eyebrow: function (S) { return 'Financial management · Cost of capital · ' + S.meta.currency; }, heading: function (S) { return S.meta.company; }, filename: function (S) { return S.meta.company + '_WACC'; },
    xlsx: function (S, R) { return build(root.ExcelJS, S, R).wb; },
    kpis: function (ctx) { return [
      ['WACC at target', function () { return U.fmtPct(ctx.R.tgt.wacc, 2); }, function () { return 'real ' + U.fmtPct(ctx.R.tgt.real, 2) + ' · D/V ' + U.fmtPct(ctx.S.mkt.targetDV, 0); }],
      ['Cost of equity', function () { return U.fmtPct(ctx.R.tgt.ke, 2); }, function () { return 'β levered ' + U.fmtNum(ctx.R.tgt.betaL, 2); }],
      ['Median βU', function () { return U.fmtNum(ctx.R.bu, 3); }, function () { return 'n = ' + ctx.R.stats.n; }],
      ['Minimum WACC', function () { return U.fmtPct(ctx.R.best.wacc, 2); }, function () { return 'at D/V ' + U.fmtPct(ctx.R.best.dv, 0); }]
    ]; },
    tabs: [
      { group: 'Inputs', items: [['in', 'Inputs', function (ctx) {
        var S = ctx.S, st = h('p', { class: 'muted fetch-status', 'aria-live': 'polite' });
        var f = G.form({ id: 'wc-m', onChange: ctx.recompute, fields: [
          { key: 'co', label: 'Company', text: true, get: function () { return S.meta.company; }, set: function (v) { S.meta.company = v; } },
          { key: 'cu', label: 'Currency', text: true, get: function () { return S.meta.currency; }, set: function (v) { S.meta.currency = v.toUpperCase(); } },
          ctx.field('rf', 'Risk-free rate (nominal)', 'mkt.rf', 'pct2', { unit: '%', tag: S.sources['mkt.rf'], help: 'Government yield in the model currency.' }), ctx.field('erp', 'Equity risk premium', 'mkt.erp', 'pct2', { unit: '%' }),
          ctx.field('crp', 'Country risk premium', 'mkt.crp', 'pct2', { unit: '%' }), ctx.field('sz', 'Size / specific premium', 'mkt.size', 'pct2', { unit: '%' }),
          ctx.field('tx', 'Marginal tax rate', 'mkt.tax', 'pct', { unit: '%' }), ctx.field('in', 'Expected inflation', 'mkt.inflation', 'pct2', { unit: '%' }),
          { type: 'head', label: 'Debt' }, ctx.field('tdv', 'Target debt / (debt + equity)', 'mkt.targetDV', 'pct', { unit: '%' }),
          ctx.field('s0', 'Spread at zero leverage', 'mkt.spread0', 'pct2', { unit: '%' }), ctx.field('s1', 'Spread increase per 100% D/V', 'mkt.spreadSlope', 'pct2', { unit: '%' })
        ] });
        var lst = ctx.list({ id: 'wc-p', path: 'peers', newRow: function () { return { name: '', beta: 1, de: 0, tax: num(S.mkt.tax) }; }, cols: [
          { key: 'name', label: 'Peer', kind: 'text' }, { key: 'beta', label: 'Levered β', fmt: 'dec' }, { key: 'de', label: 'D / E', fmt: 'pct' }, { key: 'tax', label: 'Tax', fmt: 'pct' },
          { key: '_bu', label: 'Unlevered β', kind: 'calc', fmt: 'dec3', calc: function (r, i) { return ctx.R.peers[i] ? ctx.R.peers[i].bu : null; } }] });
        var sc = G.table({ id: 'wc-s', corner: 'Rate shifts', cols: ctx.scenCols(), onChange: ctx.recompute, rows: [
          { label: 'rf shift', unit: '%', cell: function (c) { return ctx.inVal('scenarios.' + ctx.scenKey(c) + '.rfShift', 'pct2'); } },
          { label: 'ERP shift', unit: '%', cell: function (c) { return ctx.inVal('scenarios.' + ctx.scenKey(c) + '.erpShift', 'pct2'); } }] });
        var send = h('button', { class: 'btn', type: 'button', text: 'Send to DCF', onclick: function () {
          var d = U.store.get('hub.dcf.v1', null) || (Hub.DCF && Hub.DCF.sample()); if (!d) return;
          var sc2 = S.scenarios[S.settings.scenario];
          Object.assign(d.wacc, { rf: num(S.mkt.rf) + num(sc2.rfShift), erp: num(S.mkt.erp) + num(sc2.erpShift), crp: num(S.mkt.crp), sizePremium: num(S.mkt.size), betaMode: 'relever', betaUnlevered: ctx.R.bu,
            kdPreTax: ctx.R.tgt.kd, taxRate: num(S.mkt.tax), debtWeight: num(S.mkt.targetDV), inflation: num(S.mkt.inflation) });
          d.sources = d.sources || {}; d.sources['wacc.rf'] = 'WACC tool ' + U.stamp();
          U.store.set('hub.dcf.v1', d); st.textContent = 'DCF WACC inputs updated (' + S.settings.scenario + ' case): nominal WACC ' + U.fmtPct(ctx.R.tgt.wacc, 2) + '. Open the DCF to see the effect.';
        } });
        var mac = Hub.macro ? Hub.macro.panel(S, Hub.macro.waccBinds('mkt'), ctx.rerender) : null;
        return ctx.group([mac ? ctx.panel('Market inputs: live or your own number', [mac]) : null, ctx.two(ctx.panel('Market and debt', [f, h('div', { class: 'row-ctl' }, [send]), st]), ctx.panel('Scenarios', [sc])), ctx.panel('Peer betas', [lst])]);
      }]] },
      { group: 'Outputs', items: [['curve', 'WACC curve', function (ctx) {
        var cols = DV.map(function (d) { return { label: U.fmtPct(d, 0) }; });
        var t = G.table({ id: 'wc-c', corner: 'D / (D + E)', cols: cols, rows: [
          ['D / E', 'de', 'pct'], ['Levered β', 'betaL', 'dec'], ['Cost of equity', 'ke', 'pct2'], ['Pre-tax cost of debt', 'kd', 'pct2'], ['After-tax cost of debt', 'kdAT', 'pct2'], ['WACC nominal', 'wacc', 'pct2', 'total'], ['WACC real', 'real', 'pct2', 'total']
        ].map(function (x) { return { label: x[0], cls: x[3] || '', cell: function (c) { return ctx.calc(function () { return ctx.R.curve[c][x[1]]; }, x[2], function (v) { return x[1] === 'wacc' && ctx.R.curve[c] === ctx.R.best; }); } }; }) });
        var cv = h('canvas', { 'aria-label': 'WACC curve' });
        function draw() {
          ctx.charts.forEach(function (c) { c.destroy(); }); ctx.charts.length = 0;
          ctx.chart(cv, { type: 'line', data: { labels: DV.map(function (d) { return U.fmtPct(d, 0); }), datasets: [
            { label: 'WACC', data: ctx.R.curve.map(function (x) { return x.wacc * 100; }), borderColor: ctx.css('--accent'), backgroundColor: ctx.css('--accent'), tension: 0.3 },
            { label: 'Cost of equity', data: ctx.R.curve.map(function (x) { return x.ke * 100; }), borderColor: ctx.css('--accent-2'), backgroundColor: ctx.css('--accent-2'), tension: 0.3 },
            { label: 'After-tax cost of debt', data: ctx.R.curve.map(function (x) { return x.kdAT * 100; }), borderColor: ctx.css('--input'), backgroundColor: ctx.css('--input'), tension: 0.3 }] },
            options: { maintainAspectRatio: false, animation: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10 } } }, scales: { y: { grid: { color: ctx.css('--line') }, ticks: { callback: function (v) { return v + '%'; } } }, x: { grid: { display: false } } } } });
        }
        var box = h('div', { class: 'grid-wrap' });
        function paint() { var s = ctx.R.sens; TK.heat(box, 'WACC at target structure · rf × ERP', 'rf', 'ERP', s.rfs, s.es, s.grid, 'pct2', 'pct2', 'pct2'); }
        paint();
        var sc = G.table({ id: 'wc-sc', corner: 'At target structure', cols: ctx.scenCols(), rows: [
          { label: 'WACC nominal', cell: function (c) { return ctx.calc(function () { return ctx.R.scen[ctx.scenKey(c)].wacc; }, 'pct2'); } },
          { label: 'WACC real', cell: function (c) { return ctx.calc(function () { return ctx.R.scen[ctx.scenKey(c)].real; }, 'pct2'); } },
          { label: 'Cost of equity', cell: function (c) { return ctx.calc(function () { return ctx.R.scen[ctx.scenKey(c)].ke; }, 'pct2'); } }] });
        return { el: h('div', { class: 'stack' }, [ctx.panel('WACC across capital structures (red = minimum)', [t]), ctx.panel('Curve', [h('div', { class: 'chart' }, [cv])]), ctx.panel('Scenarios', [sc]), ctx.panel(null, [box])]),
          refresh: function () { t.refresh(); sc.refresh(); paint(); draw(); }, after: draw };
      }]] }
    ]
  });
})(typeof window !== 'undefined' ? window : globalThis);
