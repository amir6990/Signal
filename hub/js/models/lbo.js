/* =====================================================================
 * LBO — simple leveraged buyout (Rosenbaum & Pearl structure)
 * Sources & uses · senior (amortising + cash sweep) and subordinated (bullet) debt
 * 5-year operating projection · interest on opening balances (no circularity)
 * Exit at EV/EBITDA · IRR and MOIC · returns attribution
 * Scenarios hold growth, margin and exit multiple.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {}, F = Hub.fin, num = F.num, N = 5;
  function rep(v) { return [v, v, v, v, v]; }

  function sample() {
    return { version: 1, tool: 'lbo', meta: { company: 'Target Co. (illustrative)', currency: 'IRR', unit: 'billion' },
      settings: { scenario: 'base' },
      entry: { ltmRevenue: 79000, ltmEbitda: 16906, entryMultiple: 6.5, txnFeePct: 0.02, finFeePct: 0.02, minCash: 3000 },
      debt: { seniorX: 1.25, seniorRate: 0.24, seniorAmort: 0.10, sweep: 0.75, subX: 0.5, subRate: 0.28 },
      ops: { daPct: rep(0.033), capexPct: rep(0.045), nwcPct: rep(0.19), taxRate: rep(0.25), cashYield: 0.18 },
      scenarios: {
        base: { growth: [0.30, 0.28, 0.27, 0.26, 0.25], margin: [0.215, 0.218, 0.22, 0.222, 0.225], exitMultiple: 6.5 },
        upside: { growth: [0.34, 0.32, 0.30, 0.29, 0.28], margin: [0.22, 0.225, 0.23, 0.235, 0.24], exitMultiple: 7.0 },
        downside: { growth: [0.22, 0.20, 0.20, 0.20, 0.20], margin: [0.20, 0.198, 0.196, 0.195, 0.195], exitMultiple: 5.5 }
      },
      projYears: ['Y1', 'Y2', 'Y3', 'Y4', 'Y5'], sens: { multStep: 0.5, levStep: 0.5 }, sources: {} };
  }
  function blank() {
    var s = sample(); s.meta.company = 'Target';
    ['ltmRevenue', 'ltmEbitda', 'entryMultiple', 'minCash'].forEach(function (k) { s.entry[k] = 0; });
    Object.keys(s.scenarios).forEach(function (k) { s.scenarios[k] = { growth: rep(0), margin: rep(0), exitMultiple: 0 }; });
    return s;
  }

  // core engine; overrides used by sensitivity
  function model(S, o) {
    o = o || {};
    var e = S.entry, d = S.debt, op = S.ops, sc = S.scenarios[S.settings.scenario];
    var entryMult = o.entryMultiple != null ? o.entryMultiple : num(e.entryMultiple);
    var exitMult = o.exitMultiple != null ? o.exitMultiple : num(sc.exitMultiple);
    var lev = o.seniorX != null ? o.seniorX : num(d.seniorX);
    var ebitda0 = num(e.ltmEbitda), ev = ebitda0 * entryMult;
    var senior0 = lev * ebitda0, sub0 = num(d.subX) * ebitda0;
    var txnFee = ev * num(e.txnFeePct), finFee = (senior0 + sub0) * num(e.finFeePct), minCash = num(e.minCash);
    var uses = ev + txnFee + finFee + minCash;
    var equity0 = uses - senior0 - sub0;
    var P = { revenue: [], ebitda: [], da: [], ebit: [], intSenior: [], intSub: [], intInc: [], ebt: [], tax: [], ni: [], capex: [], nwc: [], dNwc: [], fcf: [], amort: [], sweep: [], senior: [], sub: [], cash: [], netDebt: [], lev: [], cov: [] };
    var rev = num(e.ltmRevenue), senior = senior0, sub = sub0, cash = minCash, nwcPrev = rev * num(op.nwcPct[0]);
    for (var t = 0; t < N; t++) {
      rev = rev * (1 + num(sc.growth[t]));
      var ebitda = rev * num(sc.margin[t]), da = rev * num(op.daPct[t]), ebit = ebitda - da;
      var iS = senior * num(d.seniorRate), iJ = sub * num(d.subRate), iC = cash * num(op.cashYield);
      var ebt = ebit - iS - iJ + iC, tax = Math.max(0, ebt) * num(op.taxRate[t]), ni = ebt - tax;
      var capex = rev * num(op.capexPct[t]), nwc = rev * num(op.nwcPct[t]), dN = nwc - nwcPrev;
      var fcf = ni + da - capex - dN;                                  // levered FCF before debt repayment
      var amort = Math.min(senior, senior0 * num(d.seniorAmort));
      var avail = Math.max(0, cash - minCash + fcf - amort);           // cash above the minimum after mandatory amortisation
      var sweep = Math.min(senior - amort, avail * num(d.sweep));
      senior = senior - amort - sweep;
      cash = cash + fcf - amort - sweep;
      var row = { revenue: rev, ebitda: ebitda, da: da, ebit: ebit, intSenior: iS, intSub: iJ, intInc: iC, ebt: ebt, tax: tax, ni: ni, capex: capex, nwc: nwc, dNwc: dN, fcf: fcf, amort: amort, sweep: sweep,
        senior: senior, sub: sub, cash: cash, netDebt: senior + sub - cash, lev: (senior + sub - cash) / ebitda, cov: ebitda / (iS + iJ) };
      Object.keys(P).forEach(function (k) { P[k].push(row[k]); });
      nwcPrev = nwc;
    }
    var exitEbitda = P.ebitda[N - 1], exitEv = exitEbitda * exitMult, exitNetDebt = P.netDebt[N - 1], exitEq = exitEv - exitNetDebt;
    var moic = equity0 > 0 ? exitEq / equity0 : NaN;
    var irr = equity0 > 0 && exitEq > 0 ? Math.pow(moic, 1 / N) - 1 : NaN;     // single entry, single exit, no interim dividends
    var netDebt0 = senior0 + sub0 - minCash;
    var attr = { ebitdaGrowth: (exitEbitda - ebitda0) * entryMult, multiple: (exitMult - entryMult) * exitEbitda, deleveraging: netDebt0 - exitNetDebt, fees: -(txnFee + finFee) };
    attr.total = exitEq - equity0;
    attr.other = attr.total - attr.ebitdaGrowth - attr.multiple - attr.deleveraging - attr.fees;
    return { P: P, su: { ev: ev, txnFee: txnFee, finFee: finFee, minCash: minCash, uses: uses, senior: senior0, sub: sub0, equity: equity0, equityPct: equity0 / uses },
      exit: { ebitda: exitEbitda, multiple: exitMult, ev: exitEv, netDebt: exitNetDebt, equity: exitEq }, moic: moic, irr: irr, attr: attr, entryMult: entryMult };
  }
  function run(S) {
    var R = model(S);
    var sc = S.scenarios[S.settings.scenario];
    var em = F.grid5(num(S.entry.entryMultiple), num(S.sens.multStep)), xm = F.grid5(num(sc.exitMultiple), num(S.sens.multStep)), lv = F.grid5(num(S.debt.seniorX), num(S.sens.levStep));
    R.sens = { entry: em, exit: xm, lev: lv,
      irrEntryExit: em.map(function (a) { return xm.map(function (b) { return model(S, { entryMultiple: a, exitMultiple: b }).irr; }); }),
      irrLevExit: lv.map(function (a) { return xm.map(function (b) { return model(S, { seniorX: a, exitMultiple: b }).irr; }); }) };
    R.scen = {}; ['base', 'upside', 'downside'].forEach(function (k) { var s2 = JSON.parse(JSON.stringify(S)); s2.settings.scenario = k; var m = model(s2); R.scen[k] = { irr: m.irr, moic: m.moic, exitEq: m.exit.equity }; });
    var c = [];
    if (R.su.equity <= 0) c.push({ level: 'critical', msg: 'Debt exceeds total uses: sponsor equity is zero or negative.' });
    if (R.su.equityPct < 0.3 && R.su.equity > 0) c.push({ level: 'warning', msg: 'Sponsor equity is ' + (R.su.equityPct * 100).toFixed(0) + '% of uses. Check against lender appetite in this market.' });
    var minCov = Math.min.apply(null, R.P.cov); if (minCov < 2) c.push({ level: 'warning', msg: 'EBITDA / interest falls to ' + minCov.toFixed(1) + 'x.' });
    if (Math.min.apply(null, R.P.cash) < num(S.entry.minCash) - 0.5) c.push({ level: 'critical', msg: 'Cash falls below the minimum: free cash flow does not cover mandatory amortisation.' });
    if (R.exit.multiple > R.entryMult) c.push({ level: 'warning', msg: 'Exit multiple above entry: part of the return relies on multiple expansion.' });
    R.checks = c;
    return R;
  }

  function build(ExcelJS, S, R) {
    var X = Hub.xl, L = X.L, b = X.book(ExcelJS), cur = S.meta.currency, ut = cur + ' ' + S.meta.unit + 's';
    var sum = b.sheet('Summary', [2, 40, 16, 16, 16]);
    var A = b.sheet('Assumptions', [2, 42, 10, 13, 13, 13, 13, 13, 3, 40]);
    var C = b.sheet('Calculations', [2, 40, 10, 14, 14, 14, 14, 14, 14]);
    var Sn = b.sheet('Sensitivity', [2, 20, 12, 12, 12, 12, 12]);
    A.title('Assumptions', S.meta.company + ' · ' + ut);
    var a = {}, r = 4;
    function sc(key, label, unit, v, fmt) { A.put(1, r, label); A.put(2, r, unit, 'unit'); A.put(3, r, v, 'in', fmt); a[key] = A.ref(3, r); r++; }
    function row5(key, label, unit, arr, fmt) { A.put(1, r, label); A.put(2, r, unit, 'unit'); for (var t = 0; t < N; t++) A.put(3 + t, r, num(arr[t]), 'in', fmt); a[key] = r; r++; }
    A.sec(r++, 'Entry', 9); sc('scen', 'Scenario (1 Base, 2 Upside, 3 Downside)', '#', ['base', 'upside', 'downside'].indexOf(S.settings.scenario) + 1, 'int');
    sc('rev0', 'LTM revenue', ut, num(S.entry.ltmRevenue), 'money'); sc('eb0', 'LTM EBITDA', ut, num(S.entry.ltmEbitda), 'money'); sc('em', 'Entry EV / EBITDA', 'x', num(S.entry.entryMultiple), 'x');
    sc('tf', 'Transaction fees (% EV)', '%', num(S.entry.txnFeePct), 'pct'); sc('ff', 'Financing fees (% debt)', '%', num(S.entry.finFeePct), 'pct'); sc('mc', 'Minimum cash', ut, num(S.entry.minCash), 'money');
    r++; A.sec(r++, 'Debt', 9);
    sc('sx', 'Senior debt (x LTM EBITDA)', 'x', num(S.debt.seniorX), 'x'); sc('sr', 'Senior interest rate', '%', num(S.debt.seniorRate), 'pct2'); sc('sa', 'Senior mandatory amortisation (% of original p.a.)', '%', num(S.debt.seniorAmort), 'pct');
    sc('sw', 'Cash sweep (% of excess cash to senior)', '%', num(S.debt.sweep), 'pct'); sc('jx', 'Subordinated debt (x LTM EBITDA), bullet', 'x', num(S.debt.subX), 'x'); sc('jr', 'Subordinated interest rate', '%', num(S.debt.subRate), 'pct2');
    r++; A.sec(r++, 'Operations', 9, S.projYears);
    row5('da', 'D&A % revenue', '%', S.ops.daPct, 'pct'); row5('cx', 'Capex % revenue', '%', S.ops.capexPct, 'pct'); row5('nwc', 'Net working capital % revenue', '%', S.ops.nwcPct, 'pct'); row5('tx', 'Tax rate', '%', S.ops.taxRate, 'pct');
    sc('cy', 'Yield on cash', '%', num(S.ops.cashYield), 'pct2');
    var blk = {};
    ['base', 'upside', 'downside'].forEach(function (k, i) {
      r++; A.sec(r++, ['Base', 'Upside', 'Downside'][i] + ' scenario', 9, S.projYears);
      blk[k] = {}; row5('g_' + k, 'Revenue growth', '%', S.scenarios[k].growth, 'pct'); blk[k].g = r - 1;
      row5('m_' + k, 'EBITDA margin', '%', S.scenarios[k].margin, 'pct'); blk[k].m = r - 1;
      sc('x_' + k, 'Exit EV / EBITDA', 'x', num(S.scenarios[k].exitMultiple), 'x'); blk[k].x = r - 1;
    });
    r++; A.sec(r++, 'Active scenario', 9, S.projYears);
    A.put(1, r, 'Revenue growth'); for (var t = 0; t < N; t++) A.put(3 + t, r, { f: '=CHOOSE(' + a.scen + ',' + ['base', 'upside', 'downside'].map(function (k) { return L(3 + t) + blk[k].g; }).join(',') + ')' }, 'calc', 'pct'); a.g = r; r++;
    A.put(1, r, 'EBITDA margin'); for (t = 0; t < N; t++) A.put(3 + t, r, { f: '=CHOOSE(' + a.scen + ',' + ['base', 'upside', 'downside'].map(function (k) { return L(3 + t) + blk[k].m; }).join(',') + ')' }, 'calc', 'pct'); a.m = r; r++;
    A.put(1, r, 'Exit EV / EBITDA'); A.put(3, r, { f: '=CHOOSE(' + a.scen + ',' + ['base', 'upside', 'downside'].map(function (k) { return 'D' + blk[k].x; }).join(',') + ')' }, 'calc', 'x'); a.xm = A.ref(3, r); r++;
    r++; A.sec(r++, 'Sensitivity steps', 9); sc('ms', 'Multiple step', 'x', num(S.sens.multStep), 'dec'); sc('ls', 'Senior leverage step', 'x', num(S.sens.levStep), 'dec');
    function av(row, t) { return "'Assumptions'!" + L(3 + t) + '$' + row; }

    /* Calculations: S&U then schedule (cols D..H = Y1..Y5, C = entry) */
    C.title('Calculations', 'Sources & uses, projection, debt schedule, returns');
    C.sec(4, 'Sources & uses', 8);
    var su = {}, rr = 5;
    function cr(key, label, f, fmt, kind) { C.put(1, rr, label, kind); C.put(3, rr, { f: f }, kind || 'calc', fmt || 'money'); su[key] = '$D$' + rr; rr++; }
    cr('ev', 'Purchase enterprise value', '=' + a.eb0 + '*' + a.em); cr('tf', 'Transaction fees', '=D5*' + a.tf);
    cr('sen', 'Senior debt', '=' + a.sx + '*' + a.eb0); cr('sub', 'Subordinated debt', '=' + a.jx + '*' + a.eb0);
    cr('ff', 'Financing fees', '=(D7+D8)*' + a.ff); cr('mc', 'Cash to balance sheet', '=' + a.mc);
    cr('uses', 'Total uses', '=D5+D6+D9+D10', 'money', 'total');
    cr('eq', 'Sponsor equity (plug)', '=D11-D7-D8', 'money', 'total');
    cr('eqp', 'Equity % of uses', '=D12/D11', 'pct');
    rr++;
    C.sec(rr, 'Projection', 8, ['Entry'].concat(S.projYears), 2); var hdr = rr; rr++;
    var row = {};
    function pr(key, label, f0, ft, fmt, kind) {
      row[key] = rr; C.put(1, rr, label, kind);
      if (f0 != null) C.put(2, rr, typeof f0 === 'string' ? { f: f0 } : f0, kind || 'calc', fmt || 'money');
      for (var t = 0; t < N; t++) C.put(3 + t, rr, { f: ft(L(3 + t), L(2 + t), t) }, kind || 'calc', fmt || 'money');
      rr++;
    }
    pr('rev', 'Revenue', '=' + a.rev0, function (c, p, t) { return '=' + p + row.rev + '*(1+' + av(a.g, t) + ')'; });
    pr('eb', 'EBITDA', '=' + a.eb0, function (c, p, t) { return '=' + c + row.rev + '*' + av(a.m, t); }, 'money', 'total');
    pr('da', 'D&A', null, function (c, p, t) { return '=' + c + row.rev + '*' + av(a.da, t); });
    pr('ebit', 'EBIT', null, function (c) { return '=' + c + row.eb + '-' + c + row.da; });
    // debt rows defined below; use placeholders then patch
    pr('is', 'Senior interest', null, function (c, p) { return '=' + p + '__SEN__*' + a.sr; });
    pr('ij', 'Subordinated interest', null, function (c, p) { return '=' + p + '__SUB__*' + a.jr; });
    pr('ic', 'Interest income', null, function (c, p) { return '=' + p + '__CASH__*' + a.cy; });
    pr('ebt', 'Profit before tax', null, function (c) { return '=' + c + row.ebit + '-' + c + row.is + '-' + c + row.ij + '+' + c + row.ic; });
    pr('tax', 'Tax', null, function (c, p, t) { return '=MAX(0,' + c + row.ebt + ')*' + av(a.tx, t); });
    pr('ni', 'Net income', null, function (c) { return '=' + c + row.ebt + '-' + c + row.tax; }, 'money', 'total');
    pr('cx', 'Capex', null, function (c, p, t) { return '=' + c + row.rev + '*' + av(a.cx, t); });
    pr('nwc', 'Net working capital', '=' + a.rev0 + '*' + av(a.nwc, 0), function (c, p, t) { return '=' + c + row.rev + '*' + av(a.nwc, t); });
    pr('fcf', 'Free cash flow before debt repayment', null, function (c, p) { return '=' + c + row.ni + '+' + c + row.da + '-' + c + row.cx + '-(' + c + row.nwc + '-' + p + row.nwc + ')'; }, 'money', 'total');
    pr('am', 'Mandatory amortisation', null, function (c, p) { return '=MIN(' + p + '__SEN__,$C$__SEN__*' + a.sa + ')'; });
    pr('sw', 'Cash sweep', null, function (c, p) { return '=MIN(' + p + '__SEN__-' + c + row.am + ',MAX(0,' + p + '__CASH__-' + a.mc + '+' + c + row.fcf + '-' + c + row.am + ')*' + a.sw + ')'; });
    pr('sen', 'Senior debt (closing)', '=' + su.sen, function (c, p) { return '=' + p + '__SEN__-' + c + row.am + '-' + c + row.sw; });
    pr('sub', 'Subordinated debt (closing)', '=' + su.sub, function (c, p) { return '=' + p + '__SUB__'; });
    pr('cash', 'Cash (closing)', '=' + su.mc, function (c, p) { return '=' + p + '__CASH__+' + c + row.fcf + '-' + c + row.am + '-' + c + row.sw; });
    pr('nd', 'Net debt', '=C' + (rr - 3) + '+C' + (rr - 2) + '-C' + (rr - 1), function (c) { return '=' + c + row.sen + '+' + c + row.sub + '-' + c + row.cash; }, 'money', 'total');
    pr('lev', 'Net debt / EBITDA', '=C' + row.nd + '/C' + row.eb, function (c) { return '=' + c + row.nd + '/' + c + row.eb; }, 'x');
    pr('cov', 'EBITDA / cash interest', null, function (c) { return '=' + c + row.eb + '/(' + c + row.is + '+' + c + row.ij + ')'; }, 'x');
    C.ws.eachRow(function (rw) { rw.eachCell(function (cell) { var v = cell.value; if (!v || !v.formula) return; var s = v.formula.replace(/__SEN__/g, row.sen).replace(/__SUB__/g, row.sub).replace(/__CASH__/g, row.cash); if (s !== v.formula) cell.value = { formula: s }; }); });
    rr++;
    C.sec(rr++, 'Returns', 8);
    var ret = {};
    function rt(key, label, f, fmt, kind) { C.put(1, rr, label, kind); C.put(3, rr, { f: f }, kind || 'calc', fmt || 'money'); ret[key] = '$D$' + rr; rr++; }
    rt('xe', 'Exit EBITDA', '=H' + row.eb); rt('xm', 'Exit multiple', '=' + a.xm, 'x'); rt('xev', 'Exit enterprise value', '=' + ret.xe + '*' + ret.xm);
    rt('xnd', 'Less: net debt at exit', '=H' + row.nd); rt('xeq', 'Exit equity value', '=' + ret.xev + '-' + ret.xnd, 'money', 'total');
    rt('moic', 'MOIC', '=' + ret.xeq + '/' + su.eq, 'x2', 'total');
    C.put(1, rr, 'Equity cash flows'); C.put(2, rr, { f: '=-' + su.eq }, 'calc', 'money'); for (t = 0; t < N; t++) C.put(3 + t, rr, { f: t === N - 1 ? '=' + ret.xeq : '=0' }, 'calc', 'money'); var cfRow = rr; rr++;
    rt('irr', 'IRR', '=IRR(C' + cfRow + ':H' + cfRow + ')', 'pct', 'total');
    rr++; C.sec(rr++, 'Returns attribution', 8);
    rt('a1', 'EBITDA growth (at entry multiple)', '=(' + ret.xe + '-' + a.eb0 + ')*' + a.em); rt('a2', 'Multiple expansion / (contraction)', '=(' + ret.xm + '-' + a.em + ')*' + ret.xe);
    rt('a3', 'Debt paydown and cash build', '=C' + row.nd + '-' + ret.xnd); rt('a4', 'Fees', '=-(' + su.tf + '+' + su.ff + ')');
    rt('a5', 'Total equity value created', '=' + ret.xeq + '-' + su.eq, 'money', 'total');
    /* Sensitivity: closed-form not possible (debt schedule depends on structure) -> values from the hub engine, clearly labelled */
    Sn.title('Sensitivity', 'IRR · values computed by the hub engine at export (the debt schedule makes a single-cell formula impossible; use Excel Data Tables for live grids)');
    function grid(top, title, rl, rows, cols, data, rf) {
      Sn.sec(top, title, 6); Sn.put(1, top + 1, rl, 'sec');
      cols.forEach(function (v, j) { Sn.put(2 + j, top + 1, v, 'sec', 'x'); });
      rows.forEach(function (v, i) { Sn.put(1, top + 2 + i, v, 'sec', rf); data[i].forEach(function (x, j) { Sn.put(2 + j, top + 2 + i, isFinite(x) ? x : 'n/a', null, 'pct'); }); });
      Sn.heat(L(2) + (top + 2) + ':' + L(6) + (top + 6));
    }
    grid(4, 'IRR · entry multiple (rows) × exit multiple (columns)', 'Entry ↓ Exit →', R.sens.entry, R.sens.exit, R.sens.irrEntryExit, 'x');
    grid(12, 'IRR · senior leverage (rows) × exit multiple (columns)', 'Senior x ↓ Exit →', R.sens.lev, R.sens.exit, R.sens.irrLevExit, 'x');
    sum.title(S.meta.company + ' · LBO', ut + ' · ' + new Date().toISOString().slice(0, 10));
    sum.sec(4, 'Returns (active scenario)', 4);
    [['IRR', ret.irr, 'pct'], ['MOIC', ret.moic, 'x2'], ['Sponsor equity', su.eq, 'money'], ['Exit equity value', ret.xeq, 'money'], ['Equity % of uses', su.eqp, 'pct']].forEach(function (x, i) {
      sum.put(1, 5 + i, x[0], i < 2 ? 'total' : null); sum.put(2, 5 + i, { f: "='Calculations'!" + x[1] }, i < 2 ? 'total' : 'calc', x[2]);
    });
    sum.sec(11, 'Scenario snapshot (values at export)', 4, ['Base', 'Upside', 'Downside'], 2);
    ['irr', 'moic'].forEach(function (k, i) { sum.put(1, 12 + i, k.toUpperCase()); ['base', 'upside', 'downside'].forEach(function (s, j) { sum.put(2 + j, 12 + i, R.scen[s][k], null, i ? 'x2' : 'pct'); }); });
    X.notes(b, ['IRR assumes one equity investment at close and one exit at the end of year 5, no interim dividends; equals (MOIC)^(1/5) − 1.',
      'Interest on opening balances; cash sweep applies to cash above the minimum after mandatory amortisation.', 'Subordinated debt is a bullet repaid from exit proceeds.',
      'Attribution: EBITDA growth valued at the entry multiple, multiple change applied to exit EBITDA, deleveraging = change in net debt; fees reduce value created.'], S.sources);
    return { wb: b.wb };
  }

  Hub.tools = Hub.tools || {}; Hub.tools.lbo = { sample: sample, blank: blank, run: run, build: build, model: model };
  if (typeof module !== 'undefined' && module.exports) module.exports = Hub.tools.lbo;
  if (!root.document || !Hub.toolkit) return;

  var U = Hub.util, h = U.h, G = Hub.grid, TK = Hub.toolkit;
  function ul(S) { return S.meta.currency + ' ' + F.unitShort(S.meta.unit); }
  TK.define({
    id: 'lbo', title: 'LBO Model', sections: ['pe', 'buyside'], priority: 1, version: 1, storeKey: 'hub.lbo.v1',
    summary: 'Sources & uses, senior and subordinated debt with cash sweep, 5-year projection, IRR / MOIC, attribution, sensitivity.',
    sample: sample, blank: blank, run: run, scenarios: true,
    // company statements → LTM entry figures and operating ratios; Base growth from history (nominal, as an LBO runs), margin held at the last year; Upside / Downside keep their spread
    fromCompany: function (S, M) {
      var r = function (v) { return isFinite(v) ? Math.round(v * 100) / 100 : 0; }, rp = function (v) { return isFinite(v) ? Math.round(v * 1e4) / 1e4 : 0; }; var fa = Hub.i18n && Hub.i18n.lang() === 'fa'; 
      S.entry.ltmRevenue = r(M.revenue); S.entry.ltmEbitda = r(M.ebitda);
      ['daPct', 'capexPct', 'nwcPct', 'taxRate'].forEach(function (k) { var v = k === 'taxRate' ? M.taxRate : M[k]; if (isFinite(v)) S.ops[k] = S.ops[k].map(function () { return rp(v); }); });
      var b = S.scenarios.base, og = b.growth.slice(), om = b.margin.slice();
      ['base', 'upside', 'downside'].forEach(function (k) { var sc = S.scenarios[k];
        sc.growth = sc.growth.map(function (g, i) { return rp(M.growth + (k === 'base' ? 0 : g - og[i])); });
        sc.margin = sc.margin.map(function (m, i) { return rp(M.ebitdaMargin + (k === 'base' ? 0 : m - om[i])); }); });
      S.sources = S.sources || {}; S.sources['entry.ltmRevenue'] = S.sources['entry.ltmEbitda'] = 'Company data ' + M.years[M.years.length - 1];
      return fa ? 'درآمد و EBITDA سال آخر، نسبت‌های عملیاتی و رشد پایه از صورت‌های مالی شرکت اعمال شد. ضریب ورود و ساختار بدهی را خودتان تعیین کنید.' : 'LTM revenue and EBITDA, operating ratios and Base growth applied from the company statements. Entry multiple and debt structure stay yours.';
    },
    eyebrow: function (S) { return 'Private equity · LBO · ' + ul(S); }, heading: function (S) { return S.meta.company; }, filename: function (S) { return S.meta.company + '_LBO'; },
    xlsx: function (S, R) { return build(root.ExcelJS, S, R).wb; },
    kpis: function (ctx) { return [
      ['IRR', function () { return U.fmtPct(ctx.R.irr); }, function () { return ctx.S.settings.scenario; }],
      ['MOIC', function () { return U.fmtX(ctx.R.moic, 2); }, function () { return '5-year hold'; }],
      ['Sponsor equity', function () { return U.fmtNum(ctx.R.su.equity); }, function () { return U.fmtPct(ctx.R.su.equityPct, 0) + ' of uses'; }],
      ['Exit equity', function () { return U.fmtNum(ctx.R.exit.equity); }, function () { return 'at ' + U.fmtX(ctx.R.exit.multiple) + ' EBITDA'; }],
      ['Leverage at entry', function () { return U.fmtX((ctx.R.su.senior + ctx.R.su.sub) / ctx.S.entry.ltmEbitda); }, function () { return 'exit ' + U.fmtX(ctx.R.P.lev[4]) + ' net'; }]
    ]; },
    tabs: [
      { group: 'Inputs', items: [['entry', 'Entry & debt', function (ctx) {
        var S = ctx.S;
        var f = G.form({ id: 'lbo-e', onChange: ctx.recompute, fields: [
          { key: 'co', label: 'Company', text: true, get: function () { return S.meta.company; }, set: function (v) { S.meta.company = v; } },
          { key: 'cu', label: 'Currency', text: true, get: function () { return S.meta.currency; }, set: function (v) { S.meta.currency = v.toUpperCase(); } },
          { key: 'un', label: 'Monetary unit', options: F.UNITS, get: function () { return S.meta.unit; }, set: function (v) { S.meta.unit = v; } },
          { type: 'head', label: 'Entry (' + ul(S) + ')' },
          ctx.field('r0', 'LTM revenue', 'entry.ltmRevenue'), ctx.field('e0', 'LTM EBITDA', 'entry.ltmEbitda'), ctx.field('em', 'Entry EV / EBITDA', 'entry.entryMultiple', 'dec', { unit: 'x' }),
          ctx.field('tf', 'Transaction fees', 'entry.txnFeePct', 'pct', { unit: '% EV' }), ctx.field('ff', 'Financing fees', 'entry.finFeePct', 'pct', { unit: '% debt' }), ctx.field('mc', 'Minimum cash', 'entry.minCash')
        ] });
        var d = G.form({ id: 'lbo-d', onChange: ctx.recompute, fields: [
          { type: 'head', label: 'Senior (amortising, swept)' },
          ctx.field('sx', 'Amount', 'debt.seniorX', 'dec', { unit: 'x EBITDA' }), ctx.field('sr', 'Interest rate', 'debt.seniorRate', 'pct2', { unit: '%' }),
          ctx.field('sa', 'Mandatory amortisation', 'debt.seniorAmort', 'pct', { unit: '% p.a.' }), ctx.field('sw', 'Cash sweep', 'debt.sweep', 'pct', { unit: '%' }),
          { type: 'head', label: 'Subordinated (bullet)' },
          ctx.field('jx', 'Amount', 'debt.subX', 'dec', { unit: 'x EBITDA' }), ctx.field('jr', 'Interest rate', 'debt.subRate', 'pct2', { unit: '%' }),
          ctx.field('cy', 'Yield on cash', 'ops.cashYield', 'pct2', { unit: '%' })
        ] });
        var su = G.table({ id: 'lbo-su', corner: ul(ctx.S), cols: [{ label: 'Amount' }, { label: '% total' }], rows: [
          { type: 'head', label: 'Uses' },
          ['Purchase enterprise value', 'ev'], ['Transaction fees', 'txnFee'], ['Financing fees', 'finFee'], ['Cash to balance sheet', 'minCash'], ['Total uses', 'uses', 'total'],
          { type: 'head', label: 'Sources' }, ['Senior debt', 'senior'], ['Subordinated debt', 'sub'], ['Sponsor equity', 'equity', 'total']
        ].map(function (x) { if (x.type) return x; return { label: x[0], cls: x[2] || '', cell: function (c) { return ctx.calc(function () { return c ? ctx.R.su[x[1]] / ctx.R.su.uses : ctx.R.su[x[1]]; }, c ? 'pct' : 'num'); } }; }) });
        return ctx.group([ctx.two(ctx.panel('Entry', [f]), ctx.panel('Debt', [d])), ctx.panel('Sources & uses', [su])]);
      }], ['ops', 'Operating drivers', function (ctx) {
        var S = ctx.S, k = S.settings.scenario, cols = S.projYears.map(function (y) { return { label: y, cls: 'proj' }; });
        var t = G.table({ id: 'lbo-o', corner: k + ' scenario', cols: cols, onChange: ctx.recompute, rows: [
          { label: 'Revenue growth', unit: '%', cell: function (c) { return ctx.inArr('scenarios.' + k + '.growth', c, 'pct'); } },
          { label: 'EBITDA margin', unit: '%', cell: function (c) { return ctx.inArr('scenarios.' + k + '.margin', c, 'pct'); } },
          { type: 'head', label: 'All scenarios' },
          { label: 'D&A % revenue', unit: '%', cell: function (c) { return ctx.inArr('ops.daPct', c, 'pct'); } },
          { label: 'Capex % revenue', unit: '%', cell: function (c) { return ctx.inArr('ops.capexPct', c, 'pct'); } },
          { label: 'Net working capital % revenue', unit: '%', cell: function (c) { return ctx.inArr('ops.nwcPct', c, 'pct'); } },
          { label: 'Tax rate', unit: '%', cell: function (c) { return ctx.inArr('ops.taxRate', c, 'pct'); } }
        ] });
        var x = G.table({ id: 'lbo-x', corner: 'Exit', cols: ctx.scenCols(), onChange: ctx.recompute, rows: [
          { label: 'Exit EV / EBITDA', unit: 'x', cell: function (c) { return ctx.inVal('scenarios.' + ctx.scenKey(c) + '.exitMultiple', 'dec'); } }] });
        return ctx.group([ctx.panel('Operating drivers · editing ' + k, [h('p', { class: 'muted', text: 'An LBO runs in nominal terms: debt, coupons and the exit are nominal contracts. Enter growth including inflation; a real-terms projection against nominal rates understates returns.' }), t]), ctx.panel('Exit multiple', [x])]);
      }]] },
      { group: 'Calculations', items: [['sched', 'Projection & debt', function (ctx) {
        var S = ctx.S, cols = S.projYears.map(function (y) { return { label: y, cls: 'proj' }; });
        function r(label, k, fmt, cls) { return { label: label, cls: cls || '', cell: function (c) { return ctx.calc(function () { return ctx.R.P[k][c]; }, fmt); } }; }
        var t = G.table({ id: 'lbo-p', corner: ul(S), cols: cols, rows: [
          r('Revenue', 'revenue', 'num', 'total'), r('EBITDA', 'ebitda', 'num', 'sub'), r('D&A', 'da'), r('EBIT', 'ebit'), r('Senior interest', 'intSenior'), r('Subordinated interest', 'intSub'), r('Interest income', 'intInc'),
          r('Tax', 'tax'), r('Net income', 'ni', 'num', 'sub'), r('Capex', 'capex'), r('Increase in NWC', 'dNwc'), r('Free cash flow before debt repayment', 'fcf', 'num', 'total'),
          { type: 'head', label: 'Debt schedule' }, r('Mandatory amortisation', 'amort'), r('Cash sweep', 'sweep'), r('Senior debt', 'senior'), r('Subordinated debt', 'sub'), r('Cash', 'cash'),
          r('Net debt', 'netDebt', 'num', 'total'), r('Net debt / EBITDA', 'lev', 'x', 'ratio'), r('EBITDA / cash interest', 'cov', 'x', 'ratio')
        ] });
        return ctx.group([ctx.panel('Projection and debt schedule', [t])]);
      }]] },
      { group: 'Outputs', items: [['ret', 'Returns', function (ctx) {
        var S = ctx.S, A = function () { return ctx.R.attr; };
        var t = G.table({ id: 'lbo-r', corner: ul(S), cols: [{ label: 'Value' }], rows: [
          ['Exit EBITDA', function () { return ctx.R.exit.ebitda; }], ['Exit multiple', function () { return ctx.R.exit.multiple; }, 'x'], ['Exit enterprise value', function () { return ctx.R.exit.ev; }],
          ['Less: net debt at exit', function () { return -ctx.R.exit.netDebt; }], ['Exit equity value', function () { return ctx.R.exit.equity; }, 'num', 'total'],
          ['Sponsor equity invested', function () { return ctx.R.su.equity; }], ['MOIC', function () { return ctx.R.moic; }, 'x', 'total'], ['IRR', function () { return ctx.R.irr; }, 'pct', 'total']
        ].map(function (x) { return { label: x[0], cls: x[3] || '', cell: function () { return ctx.calc(x[1], x[2] || 'num'); } }; }) });
        var at = G.table({ id: 'lbo-a', corner: 'Value creation', cols: [{ label: ul(S) }, { label: '% of total' }], rows: [
          ['EBITDA growth', 'ebitdaGrowth'], ['Multiple expansion / (contraction)', 'multiple'], ['Debt paydown and cash build', 'deleveraging'], ['Fees', 'fees'], ['Other (rounding, minimum cash)', 'other'], ['Total equity value created', 'total', 'total']
        ].map(function (x) { return { label: x[0], cls: x[2] || '', cell: function (c) { return ctx.calc(function () { return c ? A()[x[1]] / A().total : A()[x[1]]; }, c ? 'pct' : 'num'); } }; }) });
        var sc = G.table({ id: 'lbo-s', corner: 'Scenario', cols: ctx.scenCols(), rows: [
          { label: 'IRR', cell: function (c) { return ctx.calc(function () { return ctx.R.scen[ctx.scenKey(c)].irr; }, 'pct'); } },
          { label: 'MOIC', cell: function (c) { return ctx.calc(function () { return ctx.R.scen[ctx.scenKey(c)].moic; }, 'x'); } },
          { label: 'Exit equity', cell: function (c) { return ctx.calc(function () { return ctx.R.scen[ctx.scenKey(c)].exitEq; }); } }] });
        return ctx.group([ctx.two(ctx.panel('Returns', [t]), ctx.panel('Returns attribution', [at])), ctx.panel('All scenarios', [sc])]);
      }], ['sens', 'Sensitivity', function (ctx) {
        var a = h('div', { class: 'grid-wrap' }), b = h('div', { class: 'grid-wrap' });
        function paint() {
          var s = ctx.R.sens;
          TK.heat(a, 'IRR · entry multiple × exit multiple', 'Entry', 'Exit', s.entry, s.exit, s.irrEntryExit, 'x', 'x', 'pct');
          TK.heat(b, 'IRR · senior leverage × exit multiple', 'Senior x', 'Exit', s.lev, s.exit, s.irrLevExit, 'x', 'x', 'pct');
        }
        paint();
        var f = G.form({ id: 'lbo-st', onChange: ctx.recompute, fields: [ctx.field('ms', 'Multiple step', 'sens.multStep', 'dec', { unit: 'x' }), ctx.field('ls', 'Leverage step', 'sens.levStep', 'dec', { unit: 'x' })] });
        return { el: h('div', { class: 'stack' }, [ctx.panel('Steps', [f]), ctx.panel(null, [a]), ctx.panel(null, [b])]), refresh: paint };
      }]] }
    ]
  });
})(typeof window !== 'undefined' ? window : globalThis);
