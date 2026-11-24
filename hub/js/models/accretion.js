/* =====================================================================
 * ACCRETION / DILUTION — next-twelve-month EPS impact of an acquisition
 * Consideration: stock / cash on hand / new debt (shares of purchase price).
 * Pro forma NI = acquirer NI + target NI + after-tax synergies − after-tax PPA
 *                amortisation − after-tax interest on new debt − after-tax lost
 *                interest on cash used. Fees are funded with the same mix.
 * Scenarios hold premium and synergies. Breakeven synergies solved in closed form.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {}, F = Hub.fin, num = F.num;
  function sample() {
    return { version: 1, tool: 'accretion', meta: { deal: 'Acquirer / Target (illustrative)', currency: 'IRR', unit: 'billion' }, settings: { scenario: 'base' },
      acq: { price: 14000, sharesMn: 10000, netIncome: 10600, taxRate: 0.25 },
      tgt: { price: 9800, sharesMn: 3000, netIncome: 2400 },
      deal: { pctStock: 0.5, pctCash: 0.2, pctDebt: 0.3, debtRate: 0.26, cashYield: 0.18, feesPct: 0.015, ppaAmort: 300 },
      scenarios: { base: { premium: 0.30, synergies: 900 }, upside: { premium: 0.25, synergies: 1400 }, downside: { premium: 0.40, synergies: 400 } },
      sens: { premStep: 0.05, stockStep: 0.25 }, sources: {} };
  }
  function blank() { var s = sample(); s.meta.deal = 'New deal'; ['price', 'sharesMn', 'netIncome'].forEach(function (k) { s.acq[k] = 0; s.tgt[k] = 0; }); return s; }
  function calc(S, o) {
    o = o || {};
    var u = F.UNIT[S.meta.unit] || 1, a = S.acq, t = S.tgt, d = S.deal, sc = S.scenarios[S.settings.scenario], tax = num(a.taxRate);
    var prem = o.premium != null ? o.premium : num(sc.premium), syn = o.synergies != null ? o.synergies : num(sc.synergies);
    var pS = o.pctStock != null ? o.pctStock : num(d.pctStock), pD = num(d.pctDebt), pC = o.pctStock != null ? Math.max(0, 1 - pS - pD) : num(d.pctCash);
    var offer = num(t.price) * (1 + prem);
    var purchase = offer * num(t.sharesMn) * 1e6 / u;                         // equity purchase price, model units
    var fees = purchase * num(d.feesPct), total = purchase + fees;
    var stockAmt = total * pS, cashAmt = total * pC, debtAmt = total * pD;
    var newShares = num(a.price) > 0 ? stockAmt * u / num(a.price) / 1e6 : 0;   // millions
    var lostInt = cashAmt * num(d.cashYield) * (1 - tax), newInt = debtAmt * num(d.debtRate) * (1 - tax);
    var synAT = syn * (1 - tax), ppaAT = num(d.ppaAmort) * (1 - tax);
    var pfNi = num(a.netIncome) + num(t.netIncome) + synAT - ppaAT - lostInt - newInt;
    var pfShares = num(a.sharesMn) + newShares;
    var eps0 = num(a.sharesMn) > 0 ? num(a.netIncome) * u / (num(a.sharesMn) * 1e6) : NaN;
    var eps1 = pfShares > 0 ? pfNi * u / (pfShares * 1e6) : NaN;
    // synergies (pre-tax) that make pro forma EPS equal standalone EPS
    var needNi = eps0 * pfShares * 1e6 / u;
    var beSyn = (needNi - (num(a.netIncome) + num(t.netIncome) - ppaAT - lostInt - newInt)) / (1 - tax);
    return { prem: prem, syn: syn, offer: offer, purchase: purchase, fees: fees, total: total, stockAmt: stockAmt, cashAmt: cashAmt, debtAmt: debtAmt, newShares: newShares,
      lostInt: lostInt, newInt: newInt, synAT: synAT, ppaAT: ppaAT, pfNi: pfNi, pfShares: pfShares, eps0: eps0, eps1: eps1, accretion: eps1 / eps0 - 1, beSyn: beSyn,
      ownership: newShares / pfShares, pE: num(t.netIncome) > 0 ? purchase / num(t.netIncome) : NaN, acqPE: num(a.netIncome) > 0 ? num(a.price) * num(a.sharesMn) * 1e6 / u / num(a.netIncome) : NaN, pC: pC, pS: pS, pD: pD };
  }
  function run(S) {
    var R = calc(S), sc = S.scenarios[S.settings.scenario];
    var ps = F.grid5(num(sc.premium), num(S.sens.premStep)), ss = [0, 0.25, 0.5, 0.75, 1].map(function (x) { return x * Math.max(0, 1 - num(S.deal.pctDebt)); });
    R.sens = { prems: ps, stocks: ss, grid: ps.map(function (p) { return ss.map(function (s) { return calc(S, { premium: p, pctStock: s }).accretion; }); }) };
    R.scen = {}; ['base', 'upside', 'downside'].forEach(function (k) { var s2 = JSON.parse(JSON.stringify(S)); s2.settings.scenario = k; R.scen[k] = calc(s2); });
    var c = [], mix = num(S.deal.pctStock) + num(S.deal.pctCash) + num(S.deal.pctDebt);
    if (Math.abs(mix - 1) > 1e-6) c.push({ level: 'critical', msg: 'Consideration mix sums to ' + (mix * 100).toFixed(1) + '%, not 100%.' });
    if (R.pE > R.acqPE && R.pS > 0) c.push({ level: 'warning', msg: 'Purchase P/E (' + R.pE.toFixed(1) + 'x) above acquirer P/E (' + R.acqPE.toFixed(1) + 'x): the stock portion is dilutive before synergies.' });
    R.checks = c;
    return R;
  }
  function build(ExcelJS, S, R) {
    var X = Hub.xl, L = X.L, b = X.book(ExcelJS), cur = S.meta.currency, ut = cur + ' ' + S.meta.unit + 's';
    var sum = b.sheet('Summary', [2, 44, 16, 16, 16]), A = b.sheet('Assumptions', [2, 44, 10, 16, 16, 16]), C = b.sheet('Calculations', [2, 46, 10, 16]), Sn = b.sheet('Sensitivity', [2, 22, 12, 12, 12, 12, 12]);
    A.title('Assumptions', S.meta.deal + ' · ' + ut); var a = {}, r = 4;
    function sc(key, label, unit, v, fmt) { A.put(1, r, label); A.put(2, r, unit, 'unit'); A.put(3, r, v, 'in', fmt); a[key] = A.ref(3, r); r++; }
    A.sec(r++, 'General', 5); sc('unit', 'Monetary unit', '', S.meta.unit); sc('scen', 'Scenario (1 Base, 2 Upside, 3 Downside)', '#', ['base', 'upside', 'downside'].indexOf(S.settings.scenario) + 1, 'int');
    r++; A.sec(r++, 'Acquirer', 5); sc('ap', 'Share price', cur, num(S.acq.price), 'money2'); sc('as', 'Diluted shares', 'mn', num(S.acq.sharesMn), 'money2'); sc('an', 'Net income NTM', ut, num(S.acq.netIncome), 'money'); sc('tx', 'Tax rate', '%', num(S.acq.taxRate), 'pct');
    r++; A.sec(r++, 'Target', 5); sc('tp', 'Unaffected share price', cur, num(S.tgt.price), 'money2'); sc('ts', 'Diluted shares', 'mn', num(S.tgt.sharesMn), 'money2'); sc('tn', 'Net income NTM', ut, num(S.tgt.netIncome), 'money');
    r++; A.sec(r++, 'Deal structure', 5); sc('ps', 'Stock % of consideration', '%', num(S.deal.pctStock), 'pct'); sc('pc', 'Cash on hand %', '%', num(S.deal.pctCash), 'pct'); sc('pd', 'New debt %', '%', num(S.deal.pctDebt), 'pct');
    sc('dr', 'Interest rate on new debt', '%', num(S.deal.debtRate), 'pct2'); sc('cy', 'Yield forgone on cash', '%', num(S.deal.cashYield), 'pct2'); sc('fe', 'Fees (% purchase price)', '%', num(S.deal.feesPct), 'pct'); sc('pa', 'PPA amortisation (pre-tax, annual)', ut, num(S.deal.ppaAmort), 'money');
    r++; A.sec(r++, 'Scenarios', 5, ['Base', 'Upside', 'Downside']);
    A.put(1, r, 'Offer premium'); ['base', 'upside', 'downside'].forEach(function (k, j) { A.put(3 + j, r, num(S.scenarios[k].premium), 'in', 'pct'); }); var rp = r; r++;
    A.put(1, r, 'Run-rate synergies (pre-tax)'); ['base', 'upside', 'downside'].forEach(function (k, j) { A.put(3 + j, r, num(S.scenarios[k].synergies), 'in', 'money'); }); var rs = r; r++;
    A.put(1, r, 'Active premium'); A.put(3, r, { f: '=CHOOSE(' + a.scen + ',D' + rp + ',E' + rp + ',F' + rp + ')' }, 'calc', 'pct'); a.prem = A.ref(3, r); r++;
    A.put(1, r, 'Active synergies'); A.put(3, r, { f: '=CHOOSE(' + a.scen + ',D' + rs + ',E' + rs + ',F' + rs + ')' }, 'calc', 'money'); a.syn = A.ref(3, r); r++;
    r++; A.sec(r++, 'Sensitivity', 5); sc('pst', 'Premium step', '%', num(S.sens.premStep), 'pct');
    var u = F.unitXl(a.unit);
    C.title('Calculations', 'Purchase price, funding, pro forma EPS'); var c = {}, rr = 4;
    function cr(key, label, f, fmt, kind) { C.put(1, rr, label, kind); C.put(3, rr, { f: f }, kind || 'calc', fmt || 'money'); c[key] = '$D$' + rr; rr++; }
    C.sec(rr++, 'Purchase price', 4);
    cr('offer', 'Offer price per share (' + cur + ')', '=' + a.tp + '*(1+' + a.prem + ')', 'money2'); cr('pp', 'Equity purchase price', '=' + c.offer + '*' + a.ts + '*1E6/' + u);
    cr('fees', 'Fees', '=' + c.pp + '*' + a.fe); cr('tot', 'Total funding need', '=' + c.pp + '+' + c.fees, 'money', 'total');
    cr('pe', 'Purchase P/E', '=IF(' + a.tn + '>0,' + c.pp + '/' + a.tn + ',NA())', 'x'); cr('ape', 'Acquirer P/E', '=' + a.ap + '*' + a.as + '*1E6/' + u + '/' + a.an, 'x');
    C.sec(rr++, 'Funding', 4);
    cr('stock', 'Stock issued (value)', '=' + c.tot + '*' + a.ps); cr('cash', 'Cash used', '=' + c.tot + '*' + a.pc); cr('debt', 'New debt', '=' + c.tot + '*' + a.pd);
    cr('ns', 'New shares issued (mn)', '=IF(' + a.ap + '>0,' + c.stock + '*' + u + '/' + a.ap + '/1E6,0)', 'money2');
    C.sec(rr++, 'Pro forma net income', 4);
    cr('ani', 'Acquirer net income', '=' + a.an); cr('tni', 'Target net income', '=' + a.tn); cr('syn', 'Synergies after tax', '=' + a.syn + '*(1-' + a.tx + ')');
    cr('ppa', 'Less: PPA amortisation after tax', '=-' + a.pa + '*(1-' + a.tx + ')'); cr('li', 'Less: interest forgone on cash, after tax', '=-' + c.cash + '*' + a.cy + '*(1-' + a.tx + ')');
    cr('ni', 'Less: interest on new debt, after tax', '=-' + c.debt + '*' + a.dr + '*(1-' + a.tx + ')');
    cr('pfni', 'Pro forma net income', '=SUM(' + c.ani + ':' + c.ni + ')', 'money', 'total');
    C.sec(rr++, 'EPS', 4);
    cr('eps0', 'Standalone EPS (' + cur + ')', '=' + a.an + '*' + u + '/(' + a.as + '*1E6)', 'money2'); cr('pfs', 'Pro forma shares (mn)', '=' + a.as + '+' + c.ns, 'money2');
    cr('eps1', 'Pro forma EPS (' + cur + ')', '=' + c.pfni + '*' + u + '/(' + c.pfs + '*1E6)', 'money2', 'total'); cr('acc', 'Accretion / (dilution)', '=' + c.eps1 + '/' + c.eps0 + '-1', 'pct', 'total');
    cr('own', 'Target holders’ ownership of combined', '=' + c.ns + '/' + c.pfs, 'pct');
    cr('be', 'Breakeven synergies (pre-tax)', '=(' + c.eps0 + '*' + c.pfs + '*1E6/' + u + '-(' + c.ani + '+' + c.tni + '+' + c.ppa + '+' + c.li + '+' + c.ni + '))/(1-' + a.tx + ')');
    Sn.title('Sensitivity', 'Accretion / (dilution) · values from the hub engine at export · premium (rows) × stock share of consideration (columns); cash fills the rest');
    Sn.sec(4, 'Premium ↓  stock % →', 6);
    R.sens.stocks.forEach(function (v, j) { Sn.put(2 + j, 5, v, 'sec', 'pct'); });
    R.sens.prems.forEach(function (v, i) { Sn.put(1, 6 + i, v, 'sec', 'pct'); R.sens.grid[i].forEach(function (x, j) { Sn.put(2 + j, 6 + i, x, null, 'pct'); }); });
    Sn.heat('C6:G10');
    sum.title(S.meta.deal + ' · Accretion / dilution', ut);
    sum.sec(4, 'Active scenario', 4);
    [['Pro forma EPS', c.eps1, 'money2'], ['Standalone EPS', c.eps0, 'money2'], ['Accretion / (dilution)', c.acc, 'pct'], ['Breakeven synergies', c.be, 'money'], ['Ownership to target holders', c.own, 'pct']]
      .forEach(function (x, i) { sum.put(1, 5 + i, x[0], i === 2 ? 'total' : null); sum.put(2, 5 + i, { f: "='Calculations'!" + x[1] }, i === 2 ? 'total' : 'calc', x[2]); });
    sum.sec(11, 'Scenario snapshot (values at export)', 4, ['Base', 'Upside', 'Downside'], 2);
    sum.put(1, 12, 'Accretion / (dilution)'); ['base', 'upside', 'downside'].forEach(function (k, j) { sum.put(2 + j, 12, R.scen[k].accretion, null, 'pct'); });
    X.notes(b, ['First full year (NTM) after close; ignores one-off integration costs and timing of synergy ramp.', 'Fees funded with the same mix as the purchase price.', 'New shares issued at the acquirer’s current price (no discount).', 'Breakeven synergies: pre-tax run-rate synergies that make pro forma EPS equal standalone EPS.'], S.sources);
    return { wb: b.wb };
  }
  Hub.tools = Hub.tools || {}; Hub.tools.accretion = { sample: sample, blank: blank, run: run, build: build };
  if (typeof module !== 'undefined' && module.exports) module.exports = Hub.tools.accretion;
  if (!root.document || !Hub.toolkit) return;

  var U = Hub.util, h = U.h, G = Hub.grid, TK = Hub.toolkit;
  function ul(S) { return S.meta.currency + ' ' + F.unitShort(S.meta.unit); }
  TK.define({
    id: 'accretion', title: 'Accretion / Dilution', sections: ['ib', 'buyside'], priority: 2, version: 1, storeKey: 'hub.accretion.v1',
    summary: 'Consideration mix, pro forma EPS, breakeven synergies, premium × stock-mix sensitivity.',
    sample: sample, blank: blank, run: run, scenarios: true,
    companySides: [['tgt', 'Apply to: Target'], ['acq', 'Apply to: Acquirer']],
    fromCompany: function (S, M, side) {
      var r = function (v) { return isFinite(v) ? Math.round(v * 100) / 100 : 0; }, rp = function (v) { return isFinite(v) ? Math.round(v * 1e4) / 1e4 : 0; }; var fa = Hub.i18n && Hub.i18n.lang() === 'fa'; var o = side === 'acq' ? S.acq : S.tgt;
      o.netIncome = r(M.fy1 ? M.fy1.ni : M.ni); if (M.sharesMn) o.sharesMn = r(M.sharesMn); if (side === 'acq' && isFinite(M.taxRate)) S.acq.taxRate = rp(M.taxRate);
      return fa ? 'سود خالص سال آینده (پیش‌بینی مکانیکی مدل شرکت) و تعداد سهام برای ' + (side === 'acq' ? 'خریدار' : 'هدف') + ' اعمال شد.' : 'Next-year net income (mechanical Company Model forecast) and shares applied to the ' + (side === 'acq' ? 'acquirer' : 'target') + '.';
    },
    eyebrow: function (S) { return 'Investment banking · Merger EPS · ' + ul(S); }, heading: function (S) { return S.meta.deal; }, filename: function (S) { return S.meta.deal + '_AccretionDilution'; },
    xlsx: function (S, R) { return build(root.ExcelJS, S, R).wb; },
    kpis: function (ctx) { return [
      ['Accretion / (dilution)', function () { return U.fmtPct(ctx.R.accretion); }, function () { return 'pro forma EPS ' + U.fmtNum(ctx.R.eps1) + ' vs ' + U.fmtNum(ctx.R.eps0); }],
      ['Breakeven synergies', function () { return U.fmtNum(ctx.R.beSyn); }, function () { return 'pre-tax, vs ' + U.fmtNum(ctx.R.syn) + ' assumed'; }],
      ['Offer price', function () { return U.fmtNum(ctx.R.offer); }, function () { return U.fmtPct(ctx.R.prem, 0) + ' premium'; }],
      ['Purchase P/E', function () { return U.fmtX(ctx.R.pE); }, function () { return 'acquirer ' + U.fmtX(ctx.R.acqPE); }],
      ['Target holders own', function () { return U.fmtPct(ctx.R.ownership); }, function () { return U.fmtNum(ctx.R.newShares) + ' mn new shares'; }]
    ]; },
    tabs: [
      { group: 'Inputs', items: [['in', 'Deal inputs', function (ctx) {
        var S = ctx.S;
        var f = G.form({ id: 'ad-1', onChange: ctx.recompute, fields: [
          { key: 'dl', label: 'Deal name', text: true, get: function () { return S.meta.deal; }, set: function (v) { S.meta.deal = v; } },
          { key: 'cu', label: 'Currency', text: true, get: function () { return S.meta.currency; }, set: function (v) { S.meta.currency = v.toUpperCase(); } },
          { key: 'un', label: 'Monetary unit', options: F.UNITS, get: function () { return S.meta.unit; }, set: function (v) { S.meta.unit = v; } },
          { type: 'head', label: 'Acquirer' }, ctx.field('ap', 'Share price', 'acq.price', 'dec', { unit: S.meta.currency }), ctx.field('as', 'Diluted shares', 'acq.sharesMn', 'dec', { unit: 'mn' }),
          ctx.field('an', 'Net income NTM', 'acq.netIncome', 'num', { unit: ul(S) }), ctx.field('tx', 'Tax rate', 'acq.taxRate', 'pct', { unit: '%' }),
          { type: 'head', label: 'Target' }, ctx.field('tp', 'Unaffected share price', 'tgt.price', 'dec', { unit: S.meta.currency }), ctx.field('ts', 'Diluted shares', 'tgt.sharesMn', 'dec', { unit: 'mn' }),
          ctx.field('tn', 'Net income NTM', 'tgt.netIncome', 'num', { unit: ul(S) })
        ] });
        var d = G.form({ id: 'ad-2', onChange: ctx.recompute, fields: [
          { type: 'head', label: 'Consideration (must sum to 100%)' }, ctx.field('ps', 'Stock', 'deal.pctStock', 'pct', { unit: '%' }), ctx.field('pc', 'Cash on hand', 'deal.pctCash', 'pct', { unit: '%' }), ctx.field('pd', 'New debt', 'deal.pctDebt', 'pct', { unit: '%' }),
          { type: 'head', label: 'Financing cost and PPA' }, ctx.field('dr', 'Interest on new debt', 'deal.debtRate', 'pct2', { unit: '%' }), ctx.field('cy', 'Yield forgone on cash', 'deal.cashYield', 'pct2', { unit: '%' }),
          ctx.field('fe', 'Fees', 'deal.feesPct', 'pct', { unit: '% price' }), ctx.field('pa', 'PPA amortisation (pre-tax, annual)', 'deal.ppaAmort', 'num', { unit: ul(S) })
        ] });
        var sc = G.table({ id: 'ad-s', corner: 'Scenario inputs', cols: ctx.scenCols(), onChange: ctx.recompute, rows: [
          { label: 'Offer premium', unit: '%', cell: function (c) { return ctx.inVal('scenarios.' + ctx.scenKey(c) + '.premium', 'pct'); } },
          { label: 'Run-rate synergies (pre-tax)', unit: ul(S), cell: function (c) { return ctx.inVal('scenarios.' + ctx.scenKey(c) + '.synergies'); } }] });
        return ctx.group([ctx.two(ctx.panel('Companies', [f]), ctx.panel('Structure', [d])), ctx.panel('Scenarios', [sc])]);
      }]] },
      { group: 'Calculations', items: [['calc', 'Pro forma EPS', function (ctx) {
        var S = ctx.S, R = function () { return ctx.R; };
        var t = G.table({ id: 'ad-c', corner: ul(S), cols: [{ label: 'Value' }], rows: [
          { type: 'head', label: 'Purchase price' }, ['Offer price per share', 'offer', 'dec'], ['Equity purchase price', 'purchase'], ['Fees', 'fees'], ['Total funding need', 'total', 'num', 'total'],
          { type: 'head', label: 'Funding' }, ['Stock issued (value)', 'stockAmt'], ['Cash used', 'cashAmt'], ['New debt', 'debtAmt'], ['New shares (mn)', 'newShares', 'dec'],
          { type: 'head', label: 'Pro forma net income' }, ['Synergies after tax', 'synAT'], ['PPA amortisation after tax', 'ppaAT'], ['Interest forgone on cash, after tax', 'lostInt'], ['Interest on new debt, after tax', 'newInt'],
          ['Pro forma net income', 'pfNi', 'num', 'total'], ['Pro forma shares (mn)', 'pfShares', 'dec'], ['Standalone EPS', 'eps0', 'dec'], ['Pro forma EPS', 'eps1', 'dec', 'total'], ['Accretion / (dilution)', 'accretion', 'pct', 'total']
        ].map(function (x) { if (x.type) return x; return { label: x[0], cls: x[3] || '', cell: function () { return ctx.calc(function () { return R()[x[1]]; }, x[2] || 'num'); } }; }) });
        return ctx.group([ctx.panel('Build-up', [t])]);
      }]] },
      { group: 'Outputs', items: [['sens', 'Sensitivity & scenarios', function (ctx) {
        var box = h('div', { class: 'grid-wrap' });
        function paint() { var s = ctx.R.sens; TK.heat(box, 'Accretion / (dilution) · premium × stock share (cash fills the rest)', 'Premium', 'Stock %', s.prems, s.stocks, s.grid, 'pct', 'pct', 'pct', function (v) { return v < 0; }); }
        paint();
        var sc = G.table({ id: 'ad-sc', corner: 'Scenario', cols: ctx.scenCols(), rows: [
          { label: 'Accretion / (dilution)', cell: function (c) { return ctx.calc(function () { return ctx.R.scen[ctx.scenKey(c)].accretion; }, 'pct'); } },
          { label: 'Pro forma EPS', cell: function (c) { return ctx.calc(function () { return ctx.R.scen[ctx.scenKey(c)].eps1; }, 'dec'); } },
          { label: 'Breakeven synergies', cell: function (c) { return ctx.calc(function () { return ctx.R.scen[ctx.scenKey(c)].beSyn; }); } }] });
        return { el: h('div', { class: 'stack' }, [ctx.panel('All scenarios', [sc]), ctx.panel(null, [box])]), refresh: paint };
      }]] }
    ]
  });
})(typeof window !== 'undefined' ? window : globalThis);
