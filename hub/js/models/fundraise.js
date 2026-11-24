/* =====================================================================
 * FUNDRAISING — funding need, pre-money / post-money, cap table, rights issue
 *  Funding need, computed two ways and compared:
 *    (1) uses of funds  : Σ uses × (1 + buffer) ÷ (1 − fees)
 *    (2) company model  : peak cash shortfall below minimum cash in the Company
 *                         Model (with no new equity) × (1 + buffer) ÷ (1 − fees)
 *  Priced round: price = pre-money ÷ pre-money fully diluted shares (new option
 *    pool inside or outside the pre-money), convertibles at the lower of cap
 *    price and round price × (1 − discount), post-money = price × post shares.
 *  Rights issue (capital increase from cash contributions, e.g. TSE / IFB
 *    practice): TERP = (P + k × issue price) ÷ (1 + k), value of one right,
 *    dilution for a holder who does not subscribe.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {}, F = Hub.fin, num = F.num;
  function sample() {
    return { version: 1, tool: 'fundraise', meta: { company: 'Sample Manufacturing Co. (illustrative)', currency: 'IRR', unit: 'billion' }, settings: { scenario: 'base', needMethod: 'uses' },
      uses: [{ item: 'Capacity expansion (capex)', amount: 9000 }, { item: 'Working capital for new capacity', amount: 3500 }, { item: 'Repay short-term borrowings', amount: 2000 }, { item: 'Transaction costs not netted below', amount: 0 }],
      need: { bufferPct: 0.10, feesPct: 0.02, manual: 15000, minCash: 2000 },
      pre: { base: 150000, upside: 175000, downside: 125000 },
      cap: [{ holder: 'Founders / current shareholders', shares: 9200 }, { holder: 'Existing investor', shares: 800 }],
      pool: { existing: 0, targetPost: 0.03, inPre: true },
      conv: [{ name: 'Convertible loan (illustrative)', amount: 2000, discount: 0.20, cap: 120000 }],
      rights: { sharesMn: 10000, price: 14000, increasePct: 0.5, issuePrice: 1000, takeUp: 1 },
      sens: { preStep: 0.10, raiseStep: 0.20 }, sources: {} };
  }
  function blank() { var s = sample(); s.meta.company = 'Company'; s.uses = [{ item: '', amount: 0 }]; s.cap = [{ holder: '', shares: 0 }]; s.conv = []; return s; }

  function needUses(S) { var g = S.uses.reduce(function (a, x) { return a + num(x.amount); }, 0); return { uses: g, raise: g * (1 + num(S.need.bufferPct)) / (1 - num(S.need.feesPct)) }; }
  function needModel(S) {
    if (!Hub.tools.company) return null;
    var c = (root.Hub.util && root.Hub.util.store.get('hub.company.v1', null)) || Hub.tools.company.sample();
    c = JSON.parse(JSON.stringify(c)); c.fin.equityRaise = [0, 0, 0, 0, 0];
    var r = Hub.tools.company.run(c), cash = r.P.t.cash, k = (F.UNIT[c.meta.unit] || 1) / (F.UNIT[S.meta.unit] || 1);
    var nd = r.need, peak = nd.peak;   // Company Model cash need: funding balance that keeps cash at its minimum
    return { company: c.meta.company, cash: cash.map(function (x) { return x * k; }), shortfall: peak * k, year: nd.peakYear, raise: peak * k * (1 + num(S.need.bufferPct)) / (1 - num(S.need.feesPct)) };
  }
  function round(S, pre, raise) {
    var S0 = S.cap.reduce(function (a, x) { return a + num(x.shares); }, 0) + num(S.pool.existing), u = F.UNIT[S.meta.unit] || 1;
    var X = 0, p, Cv, N, post, it;
    for (it = 0; it < 200; it++) {
      p = S.pool.inPre ? pre * u / ((S0 + X) * 1e6) : pre * u / (S0 * 1e6);
      Cv = S.conv.reduce(function (a, c) { var cp = p * (1 - num(c.discount)); if (num(c.cap) > 0) cp = Math.min(cp, num(c.cap) * u / (S0 * 1e6)); return a + (cp > 0 ? num(c.amount) * u / cp / 1e6 : 0); }, 0);
      N = p > 0 ? raise * u / p / 1e6 : 0;
      post = S0 + X + N + Cv;
      var want = S.pool.inPre ? Math.max(0, num(S.pool.targetPost) * post - num(S.pool.existing)) : X;
      if (Math.abs(want - X) < 1e-10) break; X = want;
    }
    if (!S.pool.inPre) { // pool created after the round dilutes everyone, investors included
      var post0 = S0 + N + Cv; X = Math.max(0, (num(S.pool.targetPost) * post0 - num(S.pool.existing)) / (1 - num(S.pool.targetPost))); post = post0 + X;
    }
    var postMoney = p * post * 1e6 / u;
    var existing = S.cap.map(function (x) { return { holder: x.holder, before: num(x.shares), pctBefore: S0 ? num(x.shares) / S0 : NaN, pctAfter: post ? num(x.shares) / post : NaN }; });
    return { S0: S0, price: p, newPool: X, convShares: Cv, investorShares: N, post: post, preMoney: pre, raise: raise, postMoney: postMoney, headlinePost: pre + raise,
      investorPct: N / post, convPct: Cv / post, poolPct: (num(S.pool.existing) + X) / post, effectivePre: S.pool.inPre ? pre - X * p * 1e6 / u : pre, existing: existing,
      founderDilution: 1 - (S0 - num(S.pool.existing)) / post / ((S0 - num(S.pool.existing)) / S0 || 1), iterations: it };
  }
  function rights(S) {
    var r = S.rights, k = num(r.increasePct), P = num(r.price), Pi = num(r.issuePrice), N0 = num(r.sharesMn), u = F.UNIT[S.meta.unit] || 1;
    var terp = (P + k * Pi) / (1 + k);
    return { newShares: N0 * k, cash: N0 * k * Pi * num(r.takeUp) * 1e6 / u, terp: terp, rightValue: terp - Pi, priceAdj: terp / P - 1, dilutionNoSub: k / (1 + k), mcapAfter: terp * N0 * (1 + k) * 1e6 / u };
  }
  function chosenRaise(S, nu, nm) { var m = S.settings.needMethod; return m === 'model' && nm ? nm.raise : m === 'manual' ? num(S.need.manual) : nu.raise; }
  function run(S) {
    var nu = needUses(S), nm = null; try { nm = needModel(S); } catch (e) { nm = null; }
    var raise = chosenRaise(S, nu, nm), k = S.settings.scenario;
    var R = { need: { uses: nu, model: nm, raise: raise }, rd: round(S, num(S.pre[k]), raise), rights: rights(S) };
    R.scen = {}; ['base', 'upside', 'downside'].forEach(function (s) { R.scen[s] = round(S, num(S.pre[s]), raise); });
    var ps = F.grid5(num(S.pre[k]), num(S.pre[k]) * num(S.sens.preStep)), rs = F.grid5(raise, raise * num(S.sens.raiseStep));
    R.sens = { pres: ps, raises: rs, own: ps.map(function (p) { return rs.map(function (x) { return round(S, p, x).investorPct; }); }), price: ps.map(function (p) { return rs.map(function (x) { return round(S, p, x).price; }); }) };
    var c = [];
    if (nm && Math.abs(nm.raise - nu.raise) / Math.max(1, nu.raise) > 0.2) c.push({ level: 'warning', msg: 'Funding need differs by ' + U2(nm.raise / nu.raise - 1) + ' between the uses of funds and the Company Model cash shortfall. Reconcile before setting the raise.' });
    if (R.rd.investorPct > 0.49) c.push({ level: 'warning', msg: 'New investors would hold ' + U2(R.rd.investorPct) + ': close to control.' });
    if (R.rights.rightValue < 0) c.push({ level: 'warning', msg: 'Issue price above the market price: the rights have no value and take-up will be low.' });
    R.checks = c;
    return R;
  }
  function U2(x) { return (x * 100).toFixed(1) + '%'; }

  function build(ExcelJS, S, R) {
    var X = Hub.xl, L = X.L, b = X.book(ExcelJS), cur = S.meta.currency, ut = cur + ' ' + S.meta.unit + 's';
    var sum = b.sheet('Summary', [2, 46, 16, 16, 16]), A = b.sheet('Assumptions', [2, 44, 10, 16, 14, 14, 14]), C = b.sheet('Calculations', [2, 48, 10, 16, 14, 14]), Sn = b.sheet('Sensitivity', [2, 18, 13, 13, 13, 13, 13]);
    A.title('Assumptions', S.meta.company + ' · ' + ut); var a = {}, r = 4;
    function sc(key, label, unit, v, fmt) { A.put(1, r, label); A.put(2, r, unit, 'unit'); A.put(3, r, v, 'in', fmt); a[key] = A.ref(3, r); r++; }
    A.sec(r++, 'General', 6); sc('unit', 'Monetary unit', '', S.meta.unit); sc('scen', 'Scenario (1 Base, 2 Upside, 3 Downside)', '#', ['base', 'upside', 'downside'].indexOf(S.settings.scenario) + 1, 'int');
    sc('nm', 'Raise from (1 uses, 2 company model, 3 manual)', '#', { uses: 1, model: 2, manual: 3 }[S.settings.needMethod], 'int');
    r++; A.sec(r++, 'Uses of funds (' + ut + ')', 6); var u0 = r;
    S.uses.forEach(function (x) { A.put(1, r, x.item, 'in'); A.put(3, r, num(x.amount), 'in', 'money'); r++; }); var u1 = r - 1;
    sc('buf', 'Contingency buffer', '%', num(S.need.bufferPct), 'pct'); sc('fee', 'Fees and costs (% of gross raise)', '%', num(S.need.feesPct), 'pct');
    sc('mod', 'Company Model peak shortfall (value from the hub)', ut, R.need.model ? R.need.model.shortfall : 0, 'money'); sc('man', 'Manual raise', ut, num(S.need.manual), 'money');
    r++; A.sec(r++, 'Pre-money valuation', 6, ['Base', 'Upside', 'Downside']); A.put(1, r, 'Pre-money equity value'); ['base', 'upside', 'downside'].forEach(function (k, j) { A.put(3 + j, r, num(S.pre[k]), 'in', 'money'); }); var pr = r; r++;
    r++; A.sec(r++, 'Current capitalisation (shares, mn)', 6); var c0 = r;
    S.cap.forEach(function (x) { A.put(1, r, x.holder, 'in'); A.put(3, r, num(x.shares), 'in', 'money2'); r++; }); var c1 = r - 1;
    sc('pe', 'Existing option pool (mn)', 'mn', num(S.pool.existing), 'money2'); sc('pt', 'Option pool target (% of post-money shares)', '%', num(S.pool.targetPost), 'pct'); sc('pin', 'Pool inside pre-money (1) or after the round (0)', '#', S.pool.inPre ? 1 : 0, 'int');
    r++; A.sec(r++, 'Convertibles', 6, ['Amount', 'Discount', 'Cap (pre-money)']); var v0 = r;
    (S.conv.length ? S.conv : [{ name: '—', amount: 0, discount: 0, cap: 0 }]).forEach(function (x) { A.put(1, r, x.name, 'in'); A.put(3, r, num(x.amount), 'in', 'money'); A.put(4, r, num(x.discount), 'in', 'pct'); A.put(5, r, num(x.cap), 'in', 'money'); r++; }); var v1 = r - 1;
    r++; A.sec(r++, 'Rights issue (capital increase from cash contributions)', 6);
    sc('rn', 'Shares before the increase (mn)', 'mn', num(S.rights.sharesMn), 'money2'); sc('rp', 'Market price before (cum-rights)', cur, num(S.rights.price), 'money2');
    sc('rk', 'Capital increase', '%', num(S.rights.increasePct), 'pct'); sc('ri', 'Issue price per new share', cur, num(S.rights.issuePrice), 'money2'); sc('rt', 'Take-up', '%', num(S.rights.takeUp), 'pct');
    var uX = F.unitXl(a.unit);
    C.title('Calculations', 'Funding need, priced round, cap table, rights issue'); var c = {}, rr = 4;
    function cr(key, label, f, fmt, kind) { C.put(1, rr, label, kind); C.put(3, rr, typeof f === 'string' ? { f: f } : f, kind || 'calc', fmt || 'money'); c[key] = '$D$' + rr; rr++; }
    C.sec(rr++, 'Funding need', 5);
    cr('uses', 'Total uses of funds', "=SUM('Assumptions'!$D$" + u0 + ":$D$" + u1 + ')'); cr('nu', 'Gross raise · uses method', '=' + c.uses + '*(1+' + a.buf + ')/(1-' + a.fee + ')');
    cr('nmod', 'Gross raise · company model method', '=' + a.mod + '*(1+' + a.buf + ')/(1-' + a.fee + ')'); cr('diff', 'Difference (model vs uses)', '=IF(' + c.nu + '=0,NA(),' + c.nmod + '/' + c.nu + '-1)', 'pct');
    cr('raise', 'Raise used', '=CHOOSE(' + a.nm + ',' + c.nu + ',' + c.nmod + ',' + a.man + ')', 'money', 'total'); cr('net', 'Net proceeds after fees', '=' + c.raise + '*(1-' + a.fee + ')');
    C.sec(rr++, 'Priced round (active scenario)', 5);
    cr('pre', 'Pre-money equity value', "=CHOOSE(" + a.scen + ",'Assumptions'!D" + pr + ",'Assumptions'!E" + pr + ",'Assumptions'!F" + pr + ')');
    cr('s0', 'Existing fully diluted shares (mn)', "=SUM('Assumptions'!$D$" + c0 + ":$D$" + c1 + ')+' + a.pe, 'money2');
    cr('x', 'New option pool shares (mn) · solved by the hub', R.rd.newPool, 'money2');
    cr('px', 'Price per share (' + cur + ')', '=' + c.pre + '*' + uX + '/((' + c.s0 + '+IF(' + a.pin + '=1,' + c.x + ',0))*1E6)', 'money2', 'total');
    cr('n', 'New investor shares (mn)', '=' + c.raise + '*' + uX + '/' + c.px + '/1E6', 'money2');
    var convF = []; for (var i = v0; i <= v1; i++) convF.push("IFERROR('Assumptions'!$D$" + i + '*' + uX + '/MIN(' + c.px + "*(1-'Assumptions'!$E$" + i + "),IF('Assumptions'!$F$" + i + ">0,'Assumptions'!$F$" + i + '*' + uX + '/(' + c.s0 + '*1E6),1E+300))/1E6,0)');
    cr('cv', 'Convertible conversion shares (mn)', '=' + convF.join('+'), 'money2');
    cr('post', 'Post-money fully diluted shares (mn)', '=' + c.s0 + '+' + c.x + '+' + c.n + '+' + c.cv, 'money2', 'total');
    cr('pm', 'Post-money equity value', '=' + c.px + '*' + c.post + '*1E6/' + uX, 'money', 'total'); cr('hp', 'Headline post-money (pre-money + raise)', '=' + c.pre + '+' + c.raise);
    cr('ip', 'New investors’ ownership', '=' + c.n + '/' + c.post, 'pct', 'total'); cr('cp', 'Convertible holders’ ownership', '=' + c.cv + '/' + c.post, 'pct');
    cr('pp', 'Option pool (existing + new)', '=(' + a.pe + '+' + c.x + ')/' + c.post, 'pct'); cr('pchk', 'Check: pool − target (should be 0)', '=ROUND(' + c.pp + '-' + a.pt + ',6)', 'pct');
    cr('ep', 'Effective pre-money (after pool shuffle)', '=' + c.pre + '-IF(' + a.pin + '=1,' + c.x + '*' + c.px + '*1E6/' + uX + ',0)');
    C.sec(rr++, 'Cap table after the round', 5, ['Shares (mn)', 'Before', 'After'], 2);
    for (i = c0; i <= c1; i++) { var hr = rr; C.put(1, rr, { f: "='Assumptions'!B" + i }, 'calc'); C.put(2, rr, { f: "='Assumptions'!D" + i }, 'calc', 'money2'); C.put(3, rr, { f: '=C' + hr + '/' + c.s0 }, 'calc', 'pct'); C.put(4, rr, { f: '=C' + hr + '/' + c.post }, 'calc', 'pct'); rr++; }
    [['Option pool', '=' + a.pe + '+' + c.x, '=' + a.pe + '/' + c.s0], ['Convertible holders', '=' + c.cv, '=0'], ['New investors', '=' + c.n, '=0']].forEach(function (x) { C.put(1, rr, x[0]); C.put(2, rr, { f: x[1] }, 'calc', 'money2'); C.put(3, rr, { f: x[2] }, 'calc', 'pct'); C.put(4, rr, { f: '=C' + rr + '/' + c.post }, 'calc', 'pct'); rr++; });
    C.sec(rr++, 'Rights issue', 5);
    cr('rns', 'New shares (mn)', '=' + a.rn + '*' + a.rk, 'money2'); cr('rc', 'Cash raised', '=' + c.rns + '*1E6*' + a.ri + '*' + a.rt + '/' + uX);
    cr('terp', 'Theoretical ex-rights price (' + cur + ')', '=(' + a.rp + '+' + a.rk + '*' + a.ri + ')/(1+' + a.rk + ')', 'money2', 'total');
    cr('rv', 'Value of one right (per new share)', '=' + c.terp + '-' + a.ri, 'money2'); cr('radj', 'Price adjustment', '=' + c.terp + '/' + a.rp + '-1', 'pct'); cr('rd', 'Dilution if a holder does not subscribe', '=' + a.rk + '/(1+' + a.rk + ')', 'pct');
    Sn.title('Sensitivity', 'New investors’ ownership · pre-money (rows) × raise (columns) · values from the hub engine at export');
    Sn.sec(4, 'Pre-money ↓  raise →', 6);
    R.sens.raises.forEach(function (v, j) { Sn.put(2 + j, 5, v, 'sec', 'money'); });
    R.sens.pres.forEach(function (v, i2) { Sn.put(1, 6 + i2, v, 'sec', 'money'); R.sens.own[i2].forEach(function (x, j) { Sn.put(2 + j, 6 + i2, x, null, 'pct'); }); });
    Sn.heat('C6:G10');
    sum.title(S.meta.company + ' · Fundraising', ut);
    sum.sec(4, 'Round (active scenario)', 3);
    [['Raise', c.raise, 'money'], ['Pre-money', c.pre, 'money'], ['Post-money', c.pm, 'money'], ['Price per share (' + cur + ')', c.px, 'money2'], ['New investors’ ownership', c.ip, 'pct'], ['Funding need · uses', c.nu, 'money'], ['Funding need · company model', c.nmod, 'money'], ['Rights issue TERP', c.terp, 'money2']]
      .forEach(function (x, i3) { sum.put(1, 5 + i3, x[0], i3 < 3 ? 'total' : null); sum.put(2, 5 + i3, { f: "='Calculations'!" + x[1] }, i3 < 3 ? 'total' : 'calc', x[2]); });
    X.notes(b, ['Price per share = pre-money ÷ pre-money fully diluted shares (new pool included when it sits inside the pre-money).', 'New pool shares are solved by the hub so the pool equals its target share of post-money shares; the check line shows any gap (use Goal Seek if you change inputs that move it).',
      'Convertibles convert at the lower of the cap price (cap ÷ existing fully diluted shares) and the round price less the discount.', 'TERP = (cum-rights price + increase × issue price) ÷ (1 + increase). Value of one right = TERP − issue price.', 'Company Model method: peak shortfall below minimum cash with no new equity, taken from the Company Model as last saved.'], S.sources);
    return { wb: b.wb };
  }
  Hub.tools = Hub.tools || {}; Hub.tools.fundraise = { sample: sample, blank: blank, run: run, build: build, round: round, rights: rights };
  if (typeof module !== 'undefined' && module.exports) module.exports = Hub.tools.fundraise;
  if (!root.document || !Hub.toolkit) return;

  var U = Hub.util, h = U.h, G = Hub.grid, TK = Hub.toolkit;
  function ul(S) { return S.meta.currency + ' ' + F.unitShort(S.meta.unit); }
  TK.define({
    id: 'fundraise', title: 'Fundraising: pre / post-money', sections: ['finmgmt', 'ib', 'pe', 'ipo'], priority: 0, version: 1, storeKey: 'hub.fundraise.v1',
    summary: 'Funding need two ways (uses of funds vs Company Model cash shortfall), pre / post-money, price per share, option pool, convertibles, cap table, rights issue TERP.',
    sample: sample, blank: blank, run: run, scenarios: true,
    eyebrow: function (S) { return 'Financial management · Fundraising · ' + ul(S); }, heading: function (S) { return S.meta.company; }, filename: function (S) { return S.meta.company + '_Fundraising'; },
    xlsx: function (S, R) { return build(root.ExcelJS, S, R).wb; },
    kpis: function (ctx) { var D = function () { return ctx.R.rd; }; return [
      ['Raise', function () { return U.fmtNum(ctx.R.need.raise); }, function () { return { uses: 'uses of funds', model: 'company model shortfall', manual: 'manual' }[ctx.S.settings.needMethod]; }],
      ['Pre-money', function () { return U.fmtNum(D().preMoney); }, function () { return 'effective ' + U.fmtNum(D().effectivePre) + ' after pool'; }],
      ['Post-money', function () { return U.fmtNum(D().postMoney); }, function () { return ul(ctx.S); }],
      ['Price per share', function () { return U.fmtNum(D().price); }, function () { return ctx.S.meta.currency; }],
      ['Investors own', function () { return U.fmtPct(D().investorPct); }, function () { return 'pool ' + U.fmtPct(D().poolPct) + ' · notes ' + U.fmtPct(D().convPct); }]
    ]; },
    tabs: [
      { group: 'Inputs', items: [['need', 'Funding need', function (ctx) {
        var S = ctx.S;
        var uses = ctx.list({ id: 'fr-u', path: 'uses', newRow: function () { return { item: '', amount: 0 }; }, cols: [{ key: 'item', label: 'Use of funds', kind: 'text' }, { key: 'amount', label: 'Amount (' + ul(S) + ')' }] });
        var f = G.form({ id: 'fr-n', onChange: ctx.recompute, fields: [
          { key: 'co', label: 'Company', text: true, get: function () { return S.meta.company; }, set: function (v) { S.meta.company = v; } },
          { key: 'un', label: 'Monetary unit', options: F.UNITS, get: function () { return S.meta.unit; }, set: function (v) { S.meta.unit = v; } },
          ctx.field('bf', 'Contingency buffer', 'need.bufferPct', 'pct', { unit: '%' }), ctx.field('fe', 'Fees and costs', 'need.feesPct', 'pct', { unit: '% raise' }),
          ctx.field('mn', 'Manual raise', 'need.manual', 'num', { unit: ul(S) }),
          { key: 'nm', label: 'Raise to use', options: [['uses', 'Uses of funds'], ['model', 'Company Model shortfall'], ['manual', 'Manual']], get: function () { return S.settings.needMethod; }, set: function (v) { S.settings.needMethod = v; } }] });
        var cmp = G.form({ id: 'fr-c', fields: [
          { key: 'a', label: 'Gross raise · uses of funds', calc: function () { return U.fmtNum(ctx.R.need.uses.raise) + ' (uses ' + U.fmtNum(ctx.R.need.uses.uses) + ')'; } },
          { key: 'b', label: 'Gross raise · Company Model shortfall', calc: function () { var m = ctx.R.need.model; return m ? U.fmtNum(m.raise) + ' (peak shortfall ' + U.fmtNum(m.shortfall) + ' in ' + m.year + ', ' + m.company + ')' : 'Company Model not available'; } },
          { key: 'c', label: 'Raise used', strong: true, calc: function () { return U.fmtNum(ctx.R.need.raise); } }] });
        var send = h('button', { class: 'btn ghost', type: 'button', text: 'Add raise to Company Model (year 1)', onclick: function () {
          var c = U.store.get('hub.company.v1', null) || Hub.tools.company.sample(), k = (F.UNIT[S.meta.unit] || 1) / (F.UNIT[c.meta.unit] || 1);
          c.fin.equityRaise[0] = ctx.R.need.raise * (1 - num(S.need.feesPct)) * k; U.store.set('hub.company.v1', c);
          U.toast('Company Model: net proceeds ' + U.fmtNum(c.fin.equityRaise[0]) + ' added as new equity in ' + c.meta.projYears[0], 'good');
        } });
        return ctx.group([ctx.two(ctx.panel('Uses of funds', [uses]), ctx.panel('Settings', [f])), ctx.panel('Funding need: both methods', [cmp, h('div', { class: 'row-ctl' }, [send])])]);
      }], ['round', 'Round terms', function (ctx) {
        var S = ctx.S;
        var pre = G.table({ id: 'fr-p', corner: 'Pre-money', cols: ctx.scenCols(), onChange: ctx.recompute, rows: [{ label: 'Pre-money equity value', unit: ul(S), cell: function (c) { return ctx.inVal('pre.' + ctx.scenKey(c)); } }] });
        var pullBtn = h('button', { class: 'btn ghost', type: 'button', text: 'Pre-money from Valuation Summary', onclick: function () {
          if (!Hub.tools.valsummary) return; var v = U.store.get('hub.valsummary.v1', null) || Hub.tools.valsummary.sample(), r = Hub.tools.valsummary.run(v), k = (F.UNIT[v.meta.unit] || 1) / (F.UNIT[S.meta.unit] || 1);
          S.pre = { downside: r.W.low * k, base: r.W.mid * k, upside: r.W.high * k }; ctx.rerender(); U.toast('Pre-money set to the weighted low / mid / high', 'good');
        } });
        var cap = ctx.list({ id: 'fr-cap', path: 'cap', newRow: function () { return { holder: '', shares: 0 }; }, cols: [{ key: 'holder', label: 'Holder', kind: 'text' }, { key: 'shares', label: 'Shares (mn)', fmt: 'dec' }] });
        var pool = G.form({ id: 'fr-pool', onChange: ctx.recompute, fields: [
          ctx.field('pe', 'Existing option pool', 'pool.existing', 'dec', { unit: 'mn' }), ctx.field('pt', 'Pool target', 'pool.targetPost', 'pct', { unit: '% post' }),
          { key: 'pin', label: 'New pool sits', options: [['1', 'Inside the pre-money (dilutes existing holders only)'], ['0', 'After the round (dilutes everyone)']], get: function () { return S.pool.inPre ? '1' : '0'; }, set: function (v) { S.pool.inPre = v === '1'; } }] });
        var conv = ctx.list({ id: 'fr-cv', path: 'conv', newRow: function () { return { name: '', amount: 0, discount: 0.2, cap: 0 }; }, cols: [{ key: 'name', label: 'Instrument', kind: 'text' }, { key: 'amount', label: 'Amount' }, { key: 'discount', label: 'Discount', fmt: 'pct' }, { key: 'cap', label: 'Valuation cap (0 = none)' }] });
        return ctx.group([ctx.panel('Pre-money by scenario', [pre, h('div', { class: 'row-ctl' }, [pullBtn])]), ctx.two(ctx.panel('Current shareholders', [cap]), ctx.panel('Option pool', [pool])), ctx.panel('Convertible notes / SAFEs', [conv])]);
      }], ['rights', 'Rights issue', function (ctx) {
        var S = ctx.S, R = function () { return ctx.R.rights; };
        var f = G.form({ id: 'fr-r', onChange: ctx.recompute, fields: [
          ctx.field('n', 'Shares before the increase', 'rights.sharesMn', 'dec', { unit: 'mn' }), ctx.field('p', 'Market price before (cum-rights)', 'rights.price', 'dec', { unit: S.meta.currency }),
          ctx.field('k', 'Capital increase', 'rights.increasePct', 'pct', { unit: '%' }), ctx.field('i', 'Issue price per new share', 'rights.issuePrice', 'dec', { unit: S.meta.currency, help: 'For a capital increase from cash contributions this is usually the nominal value of the share.' }),
          ctx.field('t', 'Take-up', 'rights.takeUp', 'pct', { unit: '%' }),
          { type: 'head', label: 'Results' },
          { key: 'ns', label: 'New shares', calc: function () { return U.fmtNum(R().newShares) + ' mn'; } }, { key: 'cr', label: 'Cash raised', calc: function () { return U.fmtNum(R().cash) + ' ' + ul(S); } },
          { key: 'te', label: 'Theoretical ex-rights price', strong: true, calc: function () { return U.fmtNum(R().terp) + ' ' + S.meta.currency + ' (' + U.fmtPct(R().priceAdj) + ')'; } },
          { key: 'rv', label: 'Value of one right (حق تقدم)', calc: function () { return U.fmtNum(R().rightValue) + ' ' + S.meta.currency; } },
          { key: 'dl', label: 'Dilution if a holder does not subscribe', calc: function () { return U.fmtPct(R().dilutionNoSub); } }] });
        return ctx.group([ctx.panel('Capital increase from cash contributions', [f])]);
      }]] },
      { group: 'Outputs', items: [['out', 'Cap table & scenarios', function (ctx) {
        var S = ctx.S, D = function () { return ctx.R.rd; };
        var t = G.table({ id: 'fr-o', corner: ul(S), cols: ctx.scenCols(), rows: [
          ['Pre-money', 'preMoney'], ['Raise', 'raise'], ['Price per share', 'price', 'dec', 'total'], ['New investor shares (mn)', 'investorShares', 'dec'], ['New pool shares (mn)', 'newPool', 'dec'], ['Conversion shares (mn)', 'convShares', 'dec'],
          ['Post-money shares (mn)', 'post', 'dec'], ['Post-money value', 'postMoney', 'num', 'total'], ['Headline post-money (pre + raise)', 'headlinePost'], ['Effective pre-money', 'effectivePre'], ['New investors’ ownership', 'investorPct', 'pct', 'total'], ['Option pool', 'poolPct', 'pct'], ['Convertible holders', 'convPct', 'pct']
        ].map(function (x) { return { label: x[0], cls: x[3] || '', cell: function (c) { return ctx.calc(function () { return ctx.R.scen[ctx.scenKey(c)][x[1]]; }, x[2] || 'num'); } }; }) });
        var box = h('div', { class: 'grid-wrap' }); function capt() {
          U.clear(box); var d = D(), tb = h('tbody');
          var tab = h('table', { class: 'grid' }, [h('thead', null, [h('tr', null, ['Holder', 'Shares (mn)', 'Before', 'After'].map(function (x, i) { return h('th', { class: i ? 'num' : 'lbl', text: x }); }))]), tb]);
          d.existing.forEach(function (x) { tb.appendChild(h('tr', null, [h('td', { text: x.holder }), h('td', { class: 'num', text: U.fmt(x.before, 'dec') }), h('td', { class: 'num', text: U.fmtPct(x.pctBefore) }), h('td', { class: 'num', text: U.fmtPct(x.pctAfter) })])); });
          [['Option pool', num(S.pool.existing) + d.newPool, num(S.pool.existing) / d.S0], ['Convertible holders', d.convShares, 0], ['New investors', d.investorShares, 0]].forEach(function (x) { tb.appendChild(h('tr', null, [h('td', { text: x[0] }), h('td', { class: 'num', text: U.fmt(x[1], 'dec') }), h('td', { class: 'num', text: U.fmtPct(x[2]) }), h('td', { class: 'num', text: U.fmtPct(x[1] / d.post) })])); });
          tb.appendChild(h('tr', { class: 'total' }, [h('td', { text: 'Total' }), h('td', { class: 'num', text: U.fmt(d.post, 'dec') }), h('td', { class: 'num', text: '100.0%' }), h('td', { class: 'num', text: '100.0%' })]));
          box.appendChild(tab);
        } capt();
        var s1 = h('div', { class: 'grid-wrap' }), s2 = h('div', { class: 'grid-wrap' });
        function sens() { var s = ctx.R.sens; TK.heat(s1, 'New investors’ ownership · pre-money × raise', 'Pre-money', 'Raise', s.pres, s.raises, s.own, 'num', 'num', 'pct'); TK.heat(s2, 'Price per share · pre-money × raise', 'Pre-money', 'Raise', s.pres, s.raises, s.price, 'num', 'num', 'num'); }
        sens();
        return { el: h('div', { class: 'stack' }, [ctx.panel('Round by scenario', [t]), ctx.panel('Cap table · active scenario', [box]), ctx.panel(null, [s1]), ctx.panel(null, [s2])]), refresh: function () { t.refresh(); capt(); sens(); } };
      }]] }
    ]
  });
})(typeof window !== 'undefined' ? window : globalThis);
