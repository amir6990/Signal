/* =====================================================================
 * COMPARABLE COMPANIES  +  PRECEDENT TRANSACTIONS
 * Trading comps: EV/Revenue, EV/EBITDA, P/E on LTM and NTM (both, side by side).
 * Precedents: EV/Revenue, EV/EBITDA and control premium.
 * Scenario mapping: Downside = 1st quartile · Base = median · Upside = 3rd quartile.
 * Quartiles = Excel QUARTILE.INC, so hub and workbook agree exactly.
 * Outliers flagged outside [Q1 − 1.5·IQR, Q3 + 1.5·IQR]; excluded only if you untick them.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {}, F = Hub.fin;
  var num = F.num;
  var STAT_BY_SCEN = { downside: 'q1', base: 'median', upside: 'q3' };

  /* ======================= TRADING COMPS ======================= */
  var MULTS = [
    { key: 'evRevLtm', label: 'EV / Revenue', per: 'LTM', base: 'ev', den: 'revenue', tgt: 'revenue' },
    { key: 'evEbitdaLtm', label: 'EV / EBITDA', per: 'LTM', base: 'ev', den: 'ebitda', tgt: 'ebitda' },
    { key: 'peLtm', label: 'P / E', per: 'LTM', base: 'mcap', den: 'netIncome', tgt: 'netIncome' },
    { key: 'evRevNtm', label: 'EV / Revenue', per: 'NTM', base: 'ev', den: 'revenueNtm', tgt: 'revenueNtm' },
    { key: 'evEbitdaNtm', label: 'EV / EBITDA', per: 'NTM', base: 'ev', den: 'ebitdaNtm', tgt: 'ebitdaNtm' },
    { key: 'peNtm', label: 'P / E', per: 'NTM', base: 'mcap', den: 'netIncomeNtm', tgt: 'netIncomeNtm' }
  ];
  function peer(name, ticker, market, price, sh, nd, rev, ebitda, ni, revN, ebN, niN) {
    return { name: name, ticker: ticker, market: market, price: price, sharesMn: sh, netDebt: nd, revenue: rev, ebitda: ebitda, netIncome: ni,
      revenueNtm: revN, ebitdaNtm: ebN, netIncomeNtm: niN, include: true, _src: {} };
  }
  function compsSample() {
    return { version: 1, tool: 'comps',
      meta: { target: 'Target Co. (illustrative)', currency: 'IRR', unit: 'billion', asOf: '' },
      settings: { scenario: 'base' },
      target: { revenue: 79000, ebitda: 16906, netIncome: 9769, revenueNtm: 83740, ebitdaNtm: 17920, netIncomeNtm: 10600, netDebt: 4500, minority: 600, sharesMn: 10000, price: 14000 },
      peers: [
        peer('Peer A (illustrative)', '', 'tse', 9800, 8000, 3000, 61000, 12800, 7400, 66000, 14000, 8100),
        peer('Peer B (illustrative)', '', 'tse', 22500, 5000, 9000, 88000, 19300, 10900, 93000, 20500, 11700),
        peer('Peer C (illustrative)', '', 'tse', 6100, 15000, -2500, 54000, 10100, 6800, 59000, 11300, 7500),
        peer('Peer D (illustrative)', '', 'tse', 31000, 3000, 6200, 47000, 9700, 5600, 50000, 10400, 6100),
        peer('Peer E (illustrative)', '', 'tse', 4300, 25000, 12000, 120000, 21000, 9900, 126000, 22500, 10800),
        peer('Peer F (illustrative)', '', 'tse', 15800, 6000, 1500, 39000, 9100, 6200, 42500, 9800, 6700)
      ],
      weights: { evRev: 0.2, evEbitda: 0.5, pe: 0.3 },
      sens: { multStep: 0.5, metricStep: 0.05 }, sources: {} };
  }
  function compsBlank() {
    var s = compsSample(); s.meta.target = 'Target';
    Object.keys(s.target).forEach(function (k) { s.target[k] = 0; });
    s.peers = [peer('', '', 'tse', 0, 0, 0, 0, 0, 0, 0, 0, 0)];
    return s;
  }
  function peerCalc(S, p) {
    var u = F.UNIT[S.meta.unit] || 1;
    var mcap = num(p.price) * num(p.sharesMn) * 1e6 / u, ev = mcap + num(p.netDebt), o = { mcap: mcap, ev: ev };
    MULTS.forEach(function (m) { var d = num(p[m.den]); o[m.key] = p.include !== false && d > 0 ? (m.base === 'ev' ? ev : mcap) / d : null; });
    return o;
  }
  function compsRun(S) {
    var t = S.target, u = F.UNIT[S.meta.unit] || 1, shares = num(t.sharesMn) * 1e6;
    var calcs = S.peers.map(function (p) { return peerCalc(S, p); });
    var st = {}, out = {}, checks = [];
    MULTS.forEach(function (m) {
      st[m.key] = F.stats(calcs.map(function (c) { return c[m.key]; }));
      var s = st[m.key], iqr = s.q3 - s.q1;
      out[m.key] = calcs.map(function (c) { var v = c[m.key]; return v != null && (v < s.q1 - 1.5 * iqr || v > s.q3 + 1.5 * iqr); });
    });
    // implied values for target, per multiple and per statistic
    var imp = {};
    MULTS.forEach(function (m) {
      imp[m.key] = {};
      ['q1', 'median', 'q3', 'mean'].forEach(function (k) {
        var mult = st[m.key][k], metric = num(t[m.tgt]);
        var eq = m.base === 'ev' ? mult * metric - num(t.netDebt) - num(t.minority) : mult * metric;
        imp[m.key][k] = { mult: mult, ev: m.base === 'ev' ? mult * metric : eq + num(t.netDebt) + num(t.minority), equity: eq, ps: shares > 0 ? eq * u / shares : NaN, valid: isFinite(mult) && metric > 0 };
      });
    });
    var w = S.weights, wsum = num(w.evRev) + num(w.evEbitda) + num(w.pe);
    function blend(per, stat) {
      var a = imp['evRev' + per][stat], b = imp['evEbitda' + per][stat], c = imp['pe' + per][stat];
      var parts = [[a, num(w.evRev)], [b, num(w.evEbitda)], [c, num(w.pe)]].filter(function (x) { return x[0].valid && x[1] > 0; });
      var ws = parts.reduce(function (s, x) { return s + x[1]; }, 0);
      if (!ws) return { equity: NaN, ps: NaN };
      var eq = parts.reduce(function (s, x) { return s + x[0].equity * x[1]; }, 0) / ws;
      return { equity: eq, ps: shares > 0 ? eq * u / shares : NaN };
    }
    var blended = {};
    ['Ltm', 'Ntm'].forEach(function (per) { blended[per] = {}; ['q1', 'median', 'q3'].forEach(function (k) { blended[per][k] = blend(per, k); }); });
    var key = STAT_BY_SCEN[S.settings.scenario];
    // sensitivity: EV/EBITDA LTM multiple x target EBITDA change -> per share
    var base = st.evEbitdaLtm[key];
    var ms = F.grid5(base, num(S.sens.multStep)), ds = F.grid5(0, num(S.sens.metricStep));
    var sens = ds.map(function (d) { return ms.map(function (m) { return shares > 0 ? (m * num(t.ebitda) * (1 + d) - num(t.netDebt) - num(t.minority)) * u / shares : NaN; }); });
    // checks
    MULTS.forEach(function (m) { if (st[m.key].n > 0 && st[m.key].n < 4) checks.push({ level: 'warning', msg: m.label + ' ' + m.per + ': only ' + st[m.key].n + ' usable peers. Quartiles are unstable below 4.' }); });
    var nOut = 0; Object.keys(out).forEach(function (k) { nOut += out[k].filter(Boolean).length; });
    if (nOut) checks.push({ level: 'warning', msg: nOut + ' multiple(s) sit outside 1.5×IQR. Review, then untick the peer if it is not comparable.' });
    if (!(num(t.ebitda) > 0)) checks.push({ level: 'warning', msg: 'Target LTM EBITDA is not positive; EV/EBITDA cannot be applied.' });
    if (wsum <= 0) checks.push({ level: 'critical', msg: 'Method weights sum to zero.' });
    if (!S.peers.some(function (p) { return p.include !== false; })) checks.push({ level: 'critical', msg: 'No peers included.' });
    return { calcs: calcs, stats: st, outliers: out, implied: imp, blended: blended, stat: key, sens: { mults: ms, deltas: ds, grid: sens }, checks: checks,
      headline: blended.Ltm[key], headlineNtm: blended.Ntm[key] };
  }

  function compsBuild(ExcelJS, S, R) {
    var X = Hub.xl, L = X.L, b = X.book(ExcelJS);
    var sum = b.sheet('Summary', [2, 40, 16, 16, 16]);
    var A = b.sheet('Assumptions', [2, 40, 12, 16, 3, 50]);
    var P = b.sheet('Peers', [2, 28, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12]);
    var C = b.sheet('Calculations', [2, 30, 14, 14, 14, 14, 14, 14]);
    var Sn = b.sheet('Sensitivity', [2, 20, 14, 14, 14, 14, 14]);
    var cur = S.meta.currency, unitTxt = cur + ' ' + S.meta.unit + 's';
    /* Assumptions */
    A.title('Assumptions', S.meta.target + ' · ' + unitTxt + ' · blue = input');
    var a = {}, r = 4;
    A.sec(r++, 'General', 5);
    function sc(key, label, unit, v, fmt) { A.put(1, r, label); A.put(2, r, unit, 'unit'); A.put(3, r, v, 'in', fmt); a[key] = A.ref(3, r); r++; }
    sc('target', 'Target', '', S.meta.target); sc('unit', 'Monetary unit', '', S.meta.unit);
    sc('scen', 'Scenario (1 Base = median, 2 Upside = Q3, 3 Downside = Q1)', '#', ['base', 'upside', 'downside'].indexOf(S.settings.scenario) + 1, 'int');
    r++; A.sec(r++, 'Target financials', 5);
    var T = S.target;
    [['revenue', 'Revenue LTM', unitTxt], ['ebitda', 'EBITDA LTM', unitTxt], ['netIncome', 'Net income LTM', unitTxt], ['revenueNtm', 'Revenue NTM', unitTxt], ['ebitdaNtm', 'EBITDA NTM', unitTxt],
      ['netIncomeNtm', 'Net income NTM', unitTxt], ['netDebt', 'Net debt', unitTxt], ['minority', 'Minority interest', unitTxt], ['sharesMn', 'Diluted shares', 'mn'], ['price', 'Current share price', cur]]
      .forEach(function (x) { sc('t_' + x[0], x[1], x[2], num(T[x[0]]), x[0] === 'sharesMn' || x[0] === 'price' ? 'money2' : 'money'); });
    r++; A.sec(r++, 'Method weights (blended value)', 5);
    sc('wRev', 'EV / Revenue', '%', num(S.weights.evRev), 'pct'); sc('wEb', 'EV / EBITDA', '%', num(S.weights.evEbitda), 'pct'); sc('wPe', 'P / E', '%', num(S.weights.pe), 'pct');
    r++; A.sec(r++, 'Sensitivity steps', 5);
    sc('ms', 'EV/EBITDA step', 'x', num(S.sens.multStep), 'dec'); sc('ds', 'Target EBITDA change step', '%', num(S.sens.metricStep), 'pct');
    /* Peers */
    P.title('Peer set', 'Inputs in blue; market cap, EV and multiples are formulas. Blank multiple = excluded or non-positive denominator.');
    var hd = ['Include (1/0)', 'Price', 'Shares mn', 'Net debt', 'Revenue LTM', 'EBITDA LTM', 'NI LTM', 'Revenue NTM', 'EBITDA NTM', 'NI NTM', 'Market cap', 'EV', 'EV/Rev LTM', 'EV/EBITDA LTM', 'P/E LTM', 'EV/Rev NTM', 'EV/EBITDA NTM', 'P/E NTM'];
    P.sec(4, 'Company', 20, hd, 2);
    var r0 = 5, rN = r0 + S.peers.length - 1, unitExpr = F.unitXl(a.unit);
    S.peers.forEach(function (p, i) {
      var rr = r0 + i;
      P.put(1, rr, p.name || p.ticker || ('Peer ' + (i + 1)), 'in');
      P.put(2, rr, p.include === false ? 0 : 1, 'in', 'int');
      ['price', 'sharesMn', 'netDebt', 'revenue', 'ebitda', 'netIncome', 'revenueNtm', 'ebitdaNtm', 'netIncomeNtm'].forEach(function (k, j) { P.put(3 + j, rr, num(p[k]), 'in', j < 2 ? 'money2' : 'money'); });
      P.put(12, rr, { f: '=D' + rr + '*E' + rr + '*1E6/' + unitExpr }, 'calc', 'money');
      P.put(13, rr, { f: '=M' + rr + '+F' + rr }, 'calc', 'money');
      var defs = [['N', 'G'], ['N', 'H'], ['M', 'I'], ['N', 'J'], ['N', 'K'], ['M', 'L']];
      defs.forEach(function (d, j) { P.put(14 + j, rr, { f: '=IF(AND($C' + rr + '=1,' + d[1] + rr + '>0),' + d[0] + rr + '/' + d[1] + rr + ',"")' }, 'calc', 'x'); });
    });
    /* Calculations */
    C.title('Calculations', 'Peer statistics and implied value for the target');
    C.sec(4, 'Statistic', 7, ['EV/Rev LTM', 'EV/EBITDA LTM', 'P/E LTM', 'EV/Rev NTM', 'EV/EBITDA NTM', 'P/E NTM']);
    var statRows = { n: 5, min: 6, q1: 7, median: 8, mean: 9, q3: 10, max: 11 };
    var fns = { n: 'COUNT', min: 'MIN', q1: 'QUARTILE#1', median: 'MEDIAN', mean: 'AVERAGE', q3: 'QUARTILE#3', max: 'MAX' };
    var labels = { n: 'Count', min: 'Minimum', q1: '1st quartile (Downside)', median: 'Median (Base)', mean: 'Mean', q3: '3rd quartile (Upside)', max: 'Maximum' };
    Object.keys(statRows).forEach(function (k) {
      C.put(1, statRows[k], labels[k]);
      for (var j = 0; j < 6; j++) {
        var rng = P.rng(14 + j, r0, 14 + j, rN), fn = fns[k].split('#');
        var f = fn[1] ? fn[0] + '(' + rng + ',' + fn[1] + ')' : fn[0] + '(' + rng + ')';
        C.put(2 + j, statRows[k], { f: k === 'n' ? '=' + f : '=IFERROR(' + f + ',NA())' }, 'calc', k === 'n' ? 'int' : 'x');
      }
    });
    C.put(1, 12, 'Selected multiple (scenario)', 'total');
    for (var j = 0; j < 6; j++) C.put(2 + j, 12, { f: '=CHOOSE(' + a.scen + ',' + L(2 + j) + '8,' + L(2 + j) + '10,' + L(2 + j) + '7)' }, 'total', 'x');
    C.sec(14, 'Implied value (selected multiple)', 7, ['EV/Rev LTM', 'EV/EBITDA LTM', 'P/E LTM', 'EV/Rev NTM', 'EV/EBITDA NTM', 'P/E NTM']);
    var tgt = [a.t_revenue, a.t_ebitda, a.t_netIncome, a.t_revenueNtm, a.t_ebitdaNtm, a.t_netIncomeNtm], isEv = [1, 1, 0, 1, 1, 0];
    C.put(1, 15, 'Target metric'); C.put(1, 16, 'Implied EV'); C.put(1, 17, 'Implied equity value', 'total'); C.put(1, 18, 'Implied value per share (' + cur + ')', 'total'); C.put(1, 19, 'Usable (1/0)');
    for (j = 0; j < 6; j++) {
      var col = L(2 + j);
      C.put(2 + j, 15, { f: '=' + tgt[j] }, 'calc', 'money');
      C.put(2 + j, 16, { f: isEv[j] ? '=' + col + '12*' + col + '15' : '=' + col + '17+' + a.t_netDebt + '+' + a.t_minority }, 'calc', 'money');
      C.put(2 + j, 17, { f: isEv[j] ? '=' + col + '16-' + a.t_netDebt + '-' + a.t_minority : '=' + col + '12*' + col + '15' }, 'total', 'money');
      C.put(2 + j, 18, { f: '=IF(' + a.t_sharesMn + '>0,' + col + '17*' + unitExpr + '/(' + a.t_sharesMn + '*1E6),NA())' }, 'total', 'money');
      C.put(2 + j, 19, { f: '=IF(AND(ISNUMBER(' + col + '12),' + col + '15>0),1,0)' }, 'calc', 'int');
    }
    C.sec(21, 'Blended value per share', 7, ['LTM', 'NTM']);
    function bl(cols) {
      var w = [a.wRev, a.wEb, a.wPe];
      var numx = cols.map(function (c, k) { return 'IF(' + c + '19=1,' + w[k] + '*' + c + '18,0)'; }).join('+');
      var den = cols.map(function (c, k) { return 'IF(' + c + '19=1,' + w[k] + ',0)'; }).join('+');
      return '=IFERROR((' + numx + ')/(' + den + '),NA())';
    }
    C.put(1, 22, 'Weighted by method (usable methods only)', 'total');
    C.put(2, 22, { f: bl(['C', 'D', 'E']) }, 'total', 'money'); C.put(3, 22, { f: bl(['F', 'G', 'H']) }, 'total', 'money');
    C.put(1, 23, 'Upside / (downside) to current price');
    C.put(2, 23, { f: '=IF(' + a.t_price + '>0,C22/' + a.t_price + '-1,NA())' }, 'calc', 'pct'); C.put(3, 23, { f: '=IF(' + a.t_price + '>0,D22/' + a.t_price + '-1,NA())' }, 'calc', 'pct');
    /* Sensitivity */
    Sn.title('Sensitivity', 'Value per share (' + cur + ') · EV/EBITDA LTM multiple × change in target EBITDA');
    Sn.sec(4, 'EBITDA Δ ↓  multiple →', 6);
    for (var c2 = 0; c2 < 5; c2++) Sn.put(2 + c2, 5, { f: "='Calculations'!D12+(" + (c2 - 2) + ')*' + a.ms }, 'sec', 'x');
    for (var r2 = 0; r2 < 5; r2++) {
      Sn.put(1, 6 + r2, { f: '=(' + (r2 - 2) + ')*' + a.ds }, 'sec', 'pct');
      for (c2 = 0; c2 < 5; c2++) Sn.put(2 + c2, 6 + r2, { f: '=IF(' + a.t_sharesMn + '>0,(' + L(2 + c2) + '$5*' + a.t_ebitda + '*(1+$B' + (6 + r2) + ')-' + a.t_netDebt + '-' + a.t_minority + ')*' + unitExpr + '/(' + a.t_sharesMn + '*1E6),NA())' }, 'calc', 'money');
    }
    Sn.heat('C6:G10');
    /* Summary */
    sum.title(S.meta.target + ' · Trading comparables', 'Prepared ' + new Date().toISOString().slice(0, 10) + ' · ' + unitTxt);
    sum.sec(4, 'Implied value per share (' + cur + ')', 4, ['LTM', 'NTM'], 2);
    sum.put(1, 5, 'Scenario'); sum.put(2, 5, { f: '=CHOOSE(' + a.scen + ',"Base (median)","Upside (Q3)","Downside (Q1)")' }, 'calc');
    sum.put(1, 6, 'Blended value per share', 'total'); sum.put(2, 6, { f: "='Calculations'!C22" }, 'total', 'money'); sum.put(3, 6, { f: "='Calculations'!D22" }, 'total', 'money');
    sum.put(1, 7, 'Upside / (downside) to price'); sum.put(2, 7, { f: "='Calculations'!C23" }, 'calc', 'pct'); sum.put(3, 7, { f: "='Calculations'!D23" }, 'calc', 'pct');
    sum.put(1, 8, 'EV/EBITDA used'); sum.put(2, 8, { f: "='Calculations'!D12" }, 'calc', 'x'); sum.put(3, 8, { f: "='Calculations'!G12" }, 'calc', 'x');
    sum.sec(10, 'Checks at export', 4);
    var rr2 = 11; (R.checks.length ? R.checks : [{ msg: 'No issues flagged.' }]).forEach(function (k) { sum.put(1, rr2++, (k.level ? k.level.toUpperCase() + ': ' : '') + k.msg); });
    X.notes(b, ['Market cap = price × diluted shares; EV = market cap + net debt (and minority treated in the bridge). Multiples blank when the peer is excluded or the denominator is not positive.',
      'Scenario: Base = median, Upside = 3rd quartile, Downside = 1st quartile (QUARTILE.INC).',
      'LTM and NTM are computed side by side; NTM needs forecasts (broker or your own) and is only as good as they are.',
      'Peers must be in the model currency and unit. Convert foreign peers before entry; multiples are currency-neutral but EV inputs are not.'], S.sources);
    return { wb: b.wb };
  }

  /* ======================= PRECEDENTS ======================= */
  function deal(date, target, acq, ev, rev, ebitda, prem) { return { date: date, target: target, acquirer: acq, ev: ev, revenue: rev, ebitda: ebitda, premium: prem, include: true }; }
  function precSample() {
    return { version: 1, tool: 'precedents',
      meta: { target: 'Target Co. (illustrative)', currency: 'IRR', unit: 'billion' },
      settings: { scenario: 'base' },
      target: { revenue: 79000, ebitda: 16906, netDebt: 4500, minority: 600, sharesMn: 10000, price: 14000 },
      deals: [
        deal('1401', 'Deal 1 target (illustrative)', 'Buyer 1', 95000, 52000, 11200, 0.28), deal('1402', 'Deal 2 target (illustrative)', 'Buyer 2', 160000, 70000, 15500, 0.35),
        deal('1402', 'Deal 3 target (illustrative)', 'Buyer 3', 61000, 31000, 7400, 0.22), deal('1403', 'Deal 4 target (illustrative)', 'Buyer 4', 210000, 98000, 23500, 0.31),
        deal('1403', 'Deal 5 target (illustrative)', 'Buyer 5', 74000, 41000, 8100, 0.18)
      ],
      weights: { evRev: 0.3, evEbitda: 0.7 }, sources: {} };
  }
  function precBlank() { var s = precSample(); s.meta.target = 'Target'; Object.keys(s.target).forEach(function (k) { s.target[k] = 0; }); s.deals = [deal('', '', '', 0, 0, 0, 0)]; return s; }
  function precRun(S) {
    var t = S.target, u = F.UNIT[S.meta.unit] || 1, shares = num(t.sharesMn) * 1e6;
    var rows = S.deals.map(function (d) {
      var on = d.include !== false;
      return { evRev: on && num(d.revenue) > 0 ? num(d.ev) / num(d.revenue) : null, evEbitda: on && num(d.ebitda) > 0 ? num(d.ev) / num(d.ebitda) : null, premium: on && d.premium !== null && d.premium !== '' && isFinite(d.premium) && num(d.premium) !== 0 ? num(d.premium) : null };
    });
    var st = { evRev: F.stats(rows.map(function (x) { return x.evRev; })), evEbitda: F.stats(rows.map(function (x) { return x.evEbitda; })), premium: F.stats(rows.map(function (x) { return x.premium; })) };
    var key = STAT_BY_SCEN[S.settings.scenario], imp = {};
    ['q1', 'median', 'q3'].forEach(function (k) {
      var e1 = st.evRev[k] * num(t.revenue), e2 = st.evEbitda[k] * num(t.ebitda);
      var q1 = e1 - num(t.netDebt) - num(t.minority), q2 = e2 - num(t.netDebt) - num(t.minority);
      var ps = function (eq) { return shares > 0 ? eq * u / shares : NaN; };
      var w1 = num(S.weights.evRev) * (isFinite(q1) ? 1 : 0), w2 = num(S.weights.evEbitda) * (isFinite(q2) ? 1 : 0);
      var blend = w1 + w2 > 0 ? ((isFinite(q1) ? q1 * w1 : 0) + (isFinite(q2) ? q2 * w2 : 0)) / (w1 + w2) : NaN;
      imp[k] = { evRev: { ev: e1, equity: q1, ps: ps(q1) }, evEbitda: { ev: e2, equity: q2, ps: ps(q2) }, blend: { equity: blend, ps: ps(blend) },
        premium: { ps: num(t.price) * (1 + st.premium[k]) } };
    });
    var checks = [];
    if (st.evEbitda.n < 4) checks.push({ level: 'warning', msg: 'Only ' + st.evEbitda.n + ' usable EV/EBITDA deals. Widen the set or the date range.' });
    checks.push({ level: 'info', msg: 'Precedent multiples include a control premium; compare with trading comps rather than averaging blindly.' });
    checks = checks.filter(function (c) { return c.level !== 'info'; });
    return { rows: rows, stats: st, implied: imp, stat: key, headline: imp[key].blend, checks: checks };
  }
  function precBuild(ExcelJS, S, R) {
    var X = Hub.xl, b = X.book(ExcelJS), cur = S.meta.currency, unitTxt = cur + ' ' + S.meta.unit + 's';
    var sum = b.sheet('Summary', [2, 40, 16, 16, 16]);
    var A = b.sheet('Assumptions', [2, 40, 12, 16]);
    var D = b.sheet('Deals', [2, 12, 30, 24, 10, 14, 14, 14, 12, 12, 12, 12]);
    var C = b.sheet('Calculations', [2, 34, 14, 14, 14]);
    A.title('Assumptions', S.meta.target + ' · ' + unitTxt);
    var a = {}, r = 4;
    function sc(key, label, unit, v, fmt) { A.put(1, r, label); A.put(2, r, unit, 'unit'); A.put(3, r, v, 'in', fmt); a[key] = A.ref(3, r); r++; }
    A.sec(r++, 'General', 4);
    sc('unit', 'Monetary unit', '', S.meta.unit); sc('scen', 'Scenario (1 Base = median, 2 Upside = Q3, 3 Downside = Q1)', '#', ['base', 'upside', 'downside'].indexOf(S.settings.scenario) + 1, 'int');
    r++; A.sec(r++, 'Target', 4);
    [['revenue', 'Revenue LTM'], ['ebitda', 'EBITDA LTM'], ['netDebt', 'Net debt'], ['minority', 'Minority interest'], ['sharesMn', 'Diluted shares (mn)'], ['price', 'Unaffected share price (' + cur + ')']]
      .forEach(function (x) { sc('t_' + x[0], x[1], x[0] === 'sharesMn' ? 'mn' : x[0] === 'price' ? cur : unitTxt, num(S.target[x[0]]), x[0] === 'sharesMn' || x[0] === 'price' ? 'money2' : 'money'); });
    r++; A.sec(r++, 'Weights', 4); sc('w1', 'EV / Revenue', '%', num(S.weights.evRev), 'pct'); sc('w2', 'EV / EBITDA', '%', num(S.weights.evEbitda), 'pct');
    D.title('Precedent transactions', 'Inputs in blue; multiples are formulas');
    D.sec(4, 'Date', 11, ['Target', 'Acquirer', 'Include', 'EV', 'Revenue', 'EBITDA', 'Premium', 'EV/Revenue', 'EV/EBITDA', 'Premium used'], 2);
    var r0 = 5, rN = r0 + S.deals.length - 1;
    S.deals.forEach(function (d, i) {
      var rr = r0 + i;
      D.put(1, rr, String(d.date || ''), 'in'); D.put(2, rr, d.target || '', 'in'); D.put(3, rr, d.acquirer || '', 'in'); D.put(4, rr, d.include === false ? 0 : 1, 'in', 'int');
      D.put(5, rr, num(d.ev), 'in', 'money'); D.put(6, rr, num(d.revenue), 'in', 'money'); D.put(7, rr, num(d.ebitda), 'in', 'money'); D.put(8, rr, num(d.premium), 'in', 'pct');
      D.put(9, rr, { f: '=IF(AND(E' + rr + '=1,G' + rr + '>0),F' + rr + '/G' + rr + ',"")' }, 'calc', 'x');
      D.put(10, rr, { f: '=IF(AND(E' + rr + '=1,H' + rr + '>0),F' + rr + '/H' + rr + ',"")' }, 'calc', 'x');
      D.put(11, rr, { f: '=IF(AND(E' + rr + '=1,I' + rr + '<>0),I' + rr + ',"")' }, 'calc', 'pct');
    });
    C.title('Calculations', 'Statistics and implied value');
    C.sec(4, 'Statistic', 4, ['EV/Revenue', 'EV/EBITDA', 'Premium']);
    var rowsDef = [['Count', 'COUNT'], ['1st quartile (Downside)', 'QUARTILE#1'], ['Median (Base)', 'MEDIAN'], ['3rd quartile (Upside)', 'QUARTILE#3']];
    rowsDef.forEach(function (x, i) {
      C.put(1, 5 + i, x[0]);
      ['J', 'K', 'L'].forEach(function (cl, j) {
        var rng = "'Deals'!$" + cl + '$' + r0 + ':$' + cl + '$' + rN, fn = x[1].split('#');
        var f = fn[1] ? fn[0] + '(' + rng + ',' + fn[1] + ')' : fn[0] + '(' + rng + ')';
        C.put(2 + j, 5 + i, { f: i ? '=IFERROR(' + f + ',NA())' : '=' + f }, 'calc', i ? (j === 2 ? 'pct' : 'x') : 'int');
      });
    });
    C.put(1, 9, 'Selected (scenario)', 'total');
    ['C', 'D', 'E'].forEach(function (cl, j) { C.put(2 + j, 9, { f: '=CHOOSE(' + a.scen + ',' + cl + '7,' + cl + '8,' + cl + '6)' }, 'total', j === 2 ? 'pct' : 'x'); });
    C.sec(11, 'Implied value', 4, ['EV/Revenue', 'EV/EBITDA', 'Blended']);
    var u = F.unitXl(a.unit);
    C.put(1, 12, 'Implied EV'); C.put(2, 12, { f: '=C9*' + a.t_revenue }, 'calc', 'money'); C.put(3, 12, { f: '=D9*' + a.t_ebitda }, 'calc', 'money');
    C.put(1, 13, 'Implied equity value', 'total');
    C.put(2, 13, { f: '=C12-' + a.t_netDebt + '-' + a.t_minority }, 'total', 'money'); C.put(3, 13, { f: '=D12-' + a.t_netDebt + '-' + a.t_minority }, 'total', 'money');
    C.put(4, 13, { f: '=(' + a.w1 + '*C13+' + a.w2 + '*D13)/(' + a.w1 + '+' + a.w2 + ')' }, 'total', 'money');
    C.put(1, 14, 'Value per share (' + cur + ')', 'total');
    ['C', 'D', 'E'].forEach(function (cl, j) { C.put(2 + j, 14, { f: '=IF(' + a.t_sharesMn + '>0,' + cl + '13*' + u + '/(' + a.t_sharesMn + '*1E6),NA())' }, 'total', 'money'); });
    C.put(1, 15, 'Premium approach: unaffected price × (1 + premium)'); C.put(2, 15, { f: '=' + a.t_price + '*(1+E9)' }, 'calc', 'money');
    sum.title(S.meta.target + ' · Precedent transactions', unitTxt);
    sum.sec(4, 'Value per share (' + cur + ')', 4);
    sum.put(1, 5, 'Blended (EV multiples)', 'total'); sum.put(2, 5, { f: "='Calculations'!E14" }, 'total', 'money');
    sum.put(1, 6, 'Premium approach'); sum.put(2, 6, { f: "='Calculations'!C15" }, 'calc', 'money');
    X.notes(b, ['Precedent multiples embed control premia and deal-specific synergies; they are not directly comparable with trading multiples.', 'Scenario: Base = median, Upside = Q3, Downside = Q1.', 'Restate deal EV and metrics into the model unit. Multiples are ratios measured at the same date, so they survive inflation; absolute EV levels from older deals do not.'], S.sources);
    return { wb: b.wb };
  }

  Hub.tools = Hub.tools || {};
  Hub.tools.comps = { sample: compsSample, blank: compsBlank, run: compsRun, build: compsBuild, MULTS: MULTS };
  Hub.tools.precedents = { sample: precSample, blank: precBlank, run: precRun, build: precBuild };
  if (typeof module !== 'undefined' && module.exports) module.exports = Hub.tools;
  if (!root.document || !Hub.toolkit) return;

  /* ======================= UI ======================= */
  var U = Hub.util, h = U.h, G = Hub.grid, TK = Hub.toolkit;
  var SCL = { base: 'Base · median', upside: 'Upside · Q3', downside: 'Downside · Q1' };
  function unitLbl(S) { return S.meta.currency + ' ' + F.unitShort(S.meta.unit); }

  function metaForm(ctx, extra) {
    var S = ctx.S;
    return G.form({ id: S.tool + '-meta', onChange: function () { ctx.rerender(); }, fields: [
      { key: 'tg', label: 'Target', text: true, get: function () { return S.meta.target; }, set: function (v) { S.meta.target = v; } },
      { key: 'cur', label: 'Model currency', text: true, get: function () { return S.meta.currency; }, set: function (v) { S.meta.currency = v.trim().toUpperCase(); } },
      { key: 'un', label: 'Monetary unit', options: F.UNITS, get: function () { return S.meta.unit; }, set: function (v) { S.meta.unit = v; } }
    ].concat(extra || []) });
  }

  // fetch one peer's market data (TSETMC for Iranian symbols, FMP/AV otherwise)
  function fetchPeer(S, p) {
    var u = F.UNIT[S.meta.unit] || 1, tag = function (src) { return src + ' ' + U.stamp(); };
    p._src = p._src || {};
    if (p.market === 'tse') {
      return Hub.data.tse.quote(p.ticker || p.name).then(function (q) {
        p.price = q.price; p.sharesMn = q.shares / 1e6; p._src.price = p._src.sharesMn = tag('TSETMC');
        if (q.eps) { p.netIncomeNtm = q.eps * q.shares / u; p._src.netIncomeNtm = tag('TSETMC est. EPS'); }
        if (!p.name || /illustrative/.test(p.name)) p.name = q.symbol + ' · ' + q.name;
        return q.symbol + ': price ' + U.fmtNum(q.price) + ' IRR, ' + U.fmtNum(q.shares / 1e6) + ' mn shares' + (q.eps ? ', estimated EPS ' + U.fmtNum(q.eps) + ' (stored as NTM net income)' : '') + (q.sectorPE ? ', sector P/E ' + q.sectorPE.toFixed(1) : '');
      });
    }
    return Hub.data.quote(p.ticker).then(function (q) {
      p.price = q.price; p.sharesMn = q.shares / 1e6; p._src.price = p._src.sharesMn = tag(q._provider);
      if (!p.name) p.name = q.name;
      var warn = q.currency && q.currency !== S.meta.currency ? ' Quote currency ' + q.currency + ' ≠ model ' + S.meta.currency + ': convert before relying on EV.' : '';
      return Hub.data.financials(p.ticker, 1).then(function (d) {
        var l = d.lines[d.lines.length - 1];
        p.revenue = l.revenue / u; p.ebitda = (l.revenue - l.cogs - l.sga - l.otherOpex) / u; p.netIncome = (l.revenue - l.cogs - l.sga - l.otherOpex - l.da - l.interestExp + l.interestInc + l.otherNonOp - l.tax) / u;
        p.netDebt = (l.std + l.ltd - l.cash) / u;
        ['revenue', 'ebitda', 'netIncome', 'netDebt'].forEach(function (k) { p._src[k] = tag(d._provider + ' ' + d.years[d.years.length - 1]); });
        return p.ticker + ': price, shares and latest annual financials loaded (annual, not trailing-twelve-month).' + warn;
      });
    });
  }

  TK.define({
    id: 'comps', title: 'Comparable Companies', sections: ['valuation', 'ib', 'ipo', 'buyside', 'sellside'], priority: 1, version: 1, storeKey: 'hub.comps.v1',
    summary: 'Peer set with TSETMC / FMP market data, LTM and NTM multiples, quartiles, outlier flags, implied value, sensitivity.',
    sample: compsSample, blank: compsBlank, run: compsRun, scenarios: true,
    fromCompany: function (S, M) {
      var r = function (v) { return isFinite(v) ? Math.round(v * 100) / 100 : 0; }, rp = function (v) { return isFinite(v) ? Math.round(v * 1e4) / 1e4 : 0; }; var fa = Hub.i18n && Hub.i18n.lang() === 'fa'; var t = S.target;
      t.revenue = r(M.revenue); t.ebitda = r(M.ebitda); t.netIncome = r(M.ni); t.netDebt = r(M.netDebt); t.minority = r(M.minority);
      if (M.fy1) { t.revenueNtm = r(M.fy1.revenue); t.ebitdaNtm = r(M.fy1.ebitda); t.netIncomeNtm = r(M.fy1.ni); }
      if (M.sharesMn) t.sharesMn = r(M.sharesMn);
      return fa ? 'ارقام ۱۲ ماه گذشتهٔ هدف از آخرین سال واقعی و ارقام ۱۲ ماه آینده از سال اول پیش‌بینی مکانیکی (مدل شرکت) اعمال شد؛ پیش‌بینی خودتان را جایگزین کنید.' : 'Target LTM from the last actual year and NTM from the first year of the mechanical Company Model forecast; replace NTM with your own forecast.';
    },
    eyebrow: function (S) { return 'Valuation · Trading comparables · ' + unitLbl(S); }, heading: function (S) { return S.meta.target; },
    filename: function (S) { return S.meta.target + '_Comps'; },
    xlsx: function (S, R) { return compsBuild(root.ExcelJS, S, R).wb; },
    kpis: function (ctx) { return [
      ['Value / share · LTM', function () { return U.fmtNum(ctx.R.headline.ps); }, function () { return SCL[ctx.S.settings.scenario]; }],
      ['Value / share · NTM', function () { return U.fmtNum(ctx.R.headlineNtm.ps); }, function () { return 'blended by method weights'; }],
      ['vs price', function () { var p = ctx.S.target.price; return p > 0 ? U.fmtPct(ctx.R.headline.ps / p - 1) : '–'; }, function () { return 'LTM blend vs ' + U.fmtNum(ctx.S.target.price); }],
      ['EV / EBITDA LTM', function () { return U.fmtX(ctx.R.stats.evEbitdaLtm[ctx.R.stat]); }, function () { return 'n = ' + ctx.R.stats.evEbitdaLtm.n; }],
      ['P / E LTM', function () { return U.fmtX(ctx.R.stats.peLtm[ctx.R.stat]); }, function () { return 'n = ' + ctx.R.stats.peLtm.n; }]
    ]; },
    tabs: [
      { group: 'Inputs', items: [['target', 'Target', function (ctx) {
        var S = ctx.S, T = S.target;
        var f = G.form({ id: 'cmp-t', onChange: ctx.recompute, fields: [
          { type: 'head', label: 'Last twelve months (' + unitLbl(S) + ')' },
          ctx.field('rev', 'Revenue', 'target.revenue'), ctx.field('eb', 'EBITDA', 'target.ebitda'), ctx.field('ni', 'Net income', 'target.netIncome'),
          { type: 'head', label: 'Next twelve months (' + unitLbl(S) + ')' },
          ctx.field('revn', 'Revenue', 'target.revenueNtm'), ctx.field('ebn', 'EBITDA', 'target.ebitdaNtm'), ctx.field('nin', 'Net income', 'target.netIncomeNtm'),
          { type: 'head', label: 'Bridge and per share' },
          ctx.field('nd', 'Net debt', 'target.netDebt', 'num', { unit: unitLbl(S) }), ctx.field('mi', 'Minority interest', 'target.minority', 'num', { unit: unitLbl(S) }),
          ctx.field('sh', 'Diluted shares', 'target.sharesMn', 'dec', { unit: 'mn' }), ctx.field('px', 'Current share price', 'target.price', 'dec', { unit: S.meta.currency })
        ] });
        var w = G.form({ id: 'cmp-w', onChange: ctx.recompute, fields: [
          ctx.field('w1', 'Weight · EV / Revenue', 'weights.evRev', 'pct', { unit: '%' }), ctx.field('w2', 'Weight · EV / EBITDA', 'weights.evEbitda', 'pct', { unit: '%' }), ctx.field('w3', 'Weight · P / E', 'weights.pe', 'pct', { unit: '%', help: 'Weights are yours to set. Usable methods only; weights renormalise.' }),
          ctx.field('s1', 'Sensitivity · multiple step', 'sens.multStep', 'dec', { unit: 'x' }), ctx.field('s2', 'Sensitivity · EBITDA change step', 'sens.metricStep', 'pct', { unit: '%' })
        ] });
        return ctx.group([ctx.two(ctx.panel('Target', [metaForm(ctx), f]), ctx.panel('Method weights and steps', [w]))]);
      }], ['peers', 'Peer set', function (ctx) {
        var S = ctx.S, status = h('p', { class: 'muted fetch-status', 'aria-live': 'polite' });
        var lst = ctx.list({ id: 'cmp-peers', path: 'peers', newRow: function () { return { name: '', ticker: '', market: 'tse', price: 0, sharesMn: 0, netDebt: 0, revenue: 0, ebitda: 0, netIncome: 0, revenueNtm: 0, ebitdaNtm: 0, netIncomeNtm: 0, include: true, _src: {} }; },
          cols: [{ key: 'include', label: 'Use', kind: 'bool' }, { key: 'name', label: 'Company', kind: 'text' }, { key: 'ticker', label: 'Symbol', kind: 'text' },
            { key: 'price', label: 'Price', fmt: 'dec' }, { key: 'sharesMn', label: 'Shares mn', fmt: 'dec' }, { key: 'netDebt', label: 'Net debt' },
            { key: 'revenue', label: 'Rev LTM' }, { key: 'ebitda', label: 'EBITDA LTM' }, { key: 'netIncome', label: 'NI LTM' },
            { key: 'revenueNtm', label: 'Rev NTM' }, { key: 'ebitdaNtm', label: 'EBITDA NTM' }, { key: 'netIncomeNtm', label: 'NI NTM' }],
          rowActions: [{ label: 'TSE', title: 'Market: Tehran (TSETMC). Click to switch to global', run: function (row, i, done) { row.market = row.market === 'tse' ? 'global' : 'tse'; done(); } },
            { label: 'Fetch', title: 'Fetch market data for this row', run: function (row, i, done) {
              status.textContent = 'Fetching ' + (row.ticker || row.name) + '…'; status.classList.remove('err');
              fetchPeer(S, row).then(function (m) { status.textContent = m; done(); }).catch(function (e) { status.textContent = e.message; status.classList.add('err'); });
            } }],
          extra: function (repaint) { return [h('button', { class: 'btn', type: 'button', text: 'Fetch all market data', onclick: function () {
            var rows = S.peers.filter(function (p) { return p.ticker || p.market === 'tse'; }), done = 0, errs = [];
            status.textContent = 'Fetching ' + rows.length + ' peers…';
            rows.reduce(function (pr, p) { return pr.then(function () { return fetchPeer(S, p).then(function () { done++; }).catch(function (e) { errs.push((p.ticker || p.name) + ': ' + e.message); }); }); }, Promise.resolve())
              .then(function () { repaint(); ctx.recompute(); status.textContent = done + ' fetched' + (errs.length ? '; ' + errs.join(' | ') : ''); });
          } })]; } });
        // label of the market toggle reflects the row's market
        var fix = function () { lst.el.querySelectorAll('tbody tr').forEach(function (tr, i) { var b = tr.querySelector('.mini'); if (b && S.peers[i]) b.textContent = S.peers[i].market === 'tse' ? 'TSE' : 'Global'; }); };
        fix(); new MutationObserver(fix).observe(lst.el, { childList: true, subtree: false });
        return ctx.group([ctx.panel('Peer set · ' + unitLbl(S) + ' (price in ' + S.meta.currency + ' per share)', [
          h('p', { class: 'muted', text: 'Paste a block from Excel into any cell. TSE rows fetch price, shares and TSETMC estimated EPS (stored as NTM net income). Statements you provide go in the revenue / EBITDA / net income columns. Untick a peer to exclude it.' }),
          lst, status])]);
      }]] },
      { group: 'Calculations', items: [['mult', 'Multiples', function (ctx) {
        var S = ctx.S, R = function () { return ctx.R; };
        var cols = S.peers.map(function (p, i) { return { label: p.name || p.ticker || 'Peer ' + (i + 1) }; });
        var t = G.table({ id: 'cmp-m', corner: 'Peer', cols: cols, rows: [
          { label: 'Market cap', unit: unitLbl(S), cell: function (c) { return ctx.calc(function () { return R().calcs[c].mcap; }); } },
          { label: 'Enterprise value', unit: unitLbl(S), cls: 'sub', cell: function (c) { return ctx.calc(function () { return R().calcs[c].ev; }); } }
        ].concat(MULTS.map(function (m) {
          return { label: m.label + ' ' + m.per, unit: 'x', cell: function (c) { return ctx.calc(function () { return R().calcs[c][m.key]; }, 'x', function () { return R().outliers[m.key][c]; }); } };
        })) });
        var stt = G.table({ id: 'cmp-s', corner: 'Statistic', cols: MULTS.map(function (m) { return { label: m.label + ' ' + m.per }; }), rows:
          [['n', 'Count', 'days'], ['min', 'Minimum'], ['q1', '1st quartile · Downside'], ['median', 'Median · Base'], ['mean', 'Mean'], ['q3', '3rd quartile · Upside'], ['max', 'Maximum']].map(function (x) {
            return { label: x[1], cls: x[0] === ctx.R.stat ? 'total' : '', cell: function (c) { return ctx.calc(function () { return ctx.R.stats[MULTS[c].key][x[0]]; }, x[2] || 'x'); } };
          }) });
        return ctx.group([ctx.panel('Peer multiples (red = outside 1.5×IQR)', [t]), ctx.panel('Statistics', [stt])]);
      }]] },
      { group: 'Outputs', items: [['implied', 'Implied value', function (ctx) {
        var S = ctx.S;
        var t = G.table({ id: 'cmp-i', corner: 'Per share (' + S.meta.currency + ')', cols: [{ label: 'Q1 · Downside' }, { label: 'Median · Base' }, { label: 'Q3 · Upside' }], rows:
          MULTS.map(function (m) { return { label: m.label + ' ' + m.per, cell: function (c) { return ctx.calc(function () { var v = ctx.R.implied[m.key][['q1', 'median', 'q3'][c]]; return v.valid ? v.ps : null; }); } }; })
            .concat([{ label: 'Blended · LTM', cls: 'total', cell: function (c) { return ctx.calc(function () { return ctx.R.blended.Ltm[['q1', 'median', 'q3'][c]].ps; }); } },
              { label: 'Blended · NTM', cls: 'total', cell: function (c) { return ctx.calc(function () { return ctx.R.blended.Ntm[['q1', 'median', 'q3'][c]].ps; }); } }]) });
        var cv = h('canvas', { 'aria-label': 'Football field' });
        var g = ctx.group([ctx.panel('Implied value per share', [t]), ctx.panel('Football field (Q1 to Q3 per method)', [h('div', { class: 'chart tall' }, [cv])])]);
        function draw() {
          ctx.charts.forEach(function (c) { c.destroy(); }); ctx.charts.length = 0;
          var rows = MULTS.map(function (m) { var a = ctx.R.implied[m.key]; return [m.label + ' ' + m.per, a.q1.valid ? [a.q1.ps, a.q3.ps] : null]; }).filter(function (x) { return x[1]; });
          footfield(ctx, cv, rows, S.target.price);
        }
        g.after = draw; var r0 = g.refresh; g.refresh = function () { r0(); draw(); };
        return g;
      }], ['sens', 'Sensitivity', function (ctx) {
        var box = h('div', { class: 'grid-wrap' });
        function paint() { var s = ctx.R.sens; TK.heat(box, 'Value per share · EV/EBITDA LTM × change in target EBITDA', 'EBITDA Δ', 'multiple', s.deltas, s.mults, s.grid, 'pct', 'x', 'num', function (v) { return ctx.S.target.price > 0 && v < ctx.S.target.price; }); }
        paint();
        return { el: ctx.panel(null, [box]), refresh: paint };
      }]] }
    ]
  });

  TK.define({
    id: 'precedents', title: 'Precedent Transactions', sections: ['valuation', 'ib', 'ipo', 'buyside', 'sellside'], priority: 2, version: 1, storeKey: 'hub.prec.v1',
    summary: 'Deal table, EV/Revenue, EV/EBITDA and premium quartiles, implied value and premium cross-check.',
    sample: precSample, blank: precBlank, run: precRun, scenarios: true,
    fromCompany: function (S, M) {
      var r = function (v) { return isFinite(v) ? Math.round(v * 100) / 100 : 0; }, rp = function (v) { return isFinite(v) ? Math.round(v * 1e4) / 1e4 : 0; }; var fa = Hub.i18n && Hub.i18n.lang() === 'fa'; var t = S.target; t.revenue = r(M.revenue); t.ebitda = r(M.ebitda); t.netDebt = r(M.netDebt); t.minority = r(M.minority); if (M.sharesMn) t.sharesMn = r(M.sharesMn);
      return fa ? 'درآمد، EBITDA، بدهی خالص و منافع فاقد حق کنترل هدف اعمال شد.' : 'Target revenue, EBITDA, net debt and minority interest applied.';
    },
    eyebrow: function (S) { return 'Valuation · Precedent transactions · ' + unitLbl(S); }, heading: function (S) { return S.meta.target; },
    filename: function (S) { return S.meta.target + '_Precedents'; },
    xlsx: function (S, R) { return precBuild(root.ExcelJS, S, R).wb; },
    kpis: function (ctx) { return [
      ['Value / share', function () { return U.fmtNum(ctx.R.headline.ps); }, function () { return SCL[ctx.S.settings.scenario] + ' · blended'; }],
      ['EV / EBITDA', function () { return U.fmtX(ctx.R.stats.evEbitda[ctx.R.stat]); }, function () { return 'n = ' + ctx.R.stats.evEbitda.n; }],
      ['EV / Revenue', function () { return U.fmtX(ctx.R.stats.evRev[ctx.R.stat], 2); }, function () { return 'n = ' + ctx.R.stats.evRev.n; }],
      ['Premium', function () { return U.fmtPct(ctx.R.stats.premium[ctx.R.stat]); }, function () { return 'price via premium ' + U.fmtNum(ctx.R.implied[ctx.R.stat].premium.ps); }]
    ]; },
    tabs: [
      { group: 'Inputs', items: [['deals', 'Deals & target', function (ctx) {
        var S = ctx.S;
        var f = G.form({ id: 'prc-t', onChange: ctx.recompute, fields: [
          ctx.field('rev', 'Target revenue LTM', 'target.revenue', 'num', { unit: unitLbl(S) }), ctx.field('eb', 'Target EBITDA LTM', 'target.ebitda', 'num', { unit: unitLbl(S) }),
          ctx.field('nd', 'Net debt', 'target.netDebt', 'num', { unit: unitLbl(S) }), ctx.field('mi', 'Minority interest', 'target.minority', 'num', { unit: unitLbl(S) }),
          ctx.field('sh', 'Diluted shares', 'target.sharesMn', 'dec', { unit: 'mn' }), ctx.field('px', 'Unaffected share price', 'target.price', 'dec', { unit: S.meta.currency }),
          ctx.field('w1', 'Weight · EV / Revenue', 'weights.evRev', 'pct', { unit: '%' }), ctx.field('w2', 'Weight · EV / EBITDA', 'weights.evEbitda', 'pct', { unit: '%' })
        ] });
        var lst = ctx.list({ id: 'prc-d', path: 'deals', newRow: function () { return deal('', '', '', 0, 0, 0, 0); }, cols: [
          { key: 'include', label: 'Use', kind: 'bool' }, { key: 'date', label: 'Date', kind: 'text' }, { key: 'target', label: 'Target', kind: 'text' }, { key: 'acquirer', label: 'Acquirer', kind: 'text' },
          { key: 'ev', label: 'EV' }, { key: 'revenue', label: 'Revenue' }, { key: 'ebitda', label: 'EBITDA' }, { key: 'premium', label: 'Premium %', fmt: 'pct' },
          { key: '_r', label: 'EV/Rev', kind: 'calc', fmt: 'x', calc: function (r, i) { return ctx.R.rows[i] ? ctx.R.rows[i].evRev : null; } },
          { key: '_e', label: 'EV/EBITDA', kind: 'calc', fmt: 'x', calc: function (r, i) { return ctx.R.rows[i] ? ctx.R.rows[i].evEbitda : null; } }] });
        return ctx.group([ctx.two(ctx.panel('Target', [metaForm(ctx), f]), ctx.panel('Reading precedents', [h('ul', { class: 'scope' }, [
          h('li', { text: 'EV and metrics must be at the same date for each deal; restate to the model unit.' }),
          h('li', { text: 'Premium = offer price over unaffected price (typically 1 day or 30 days before announcement). Leave 0 if not public.' }),
          h('li', { text: 'Precedents include control and synergies. Use them for control transactions, not minority stakes.' })])])),
          ctx.panel('Transactions (' + unitLbl(S) + ')', [lst])]);
      }]] },
      { group: 'Outputs', items: [['val', 'Implied value', function (ctx) {
        var S = ctx.S, ks = ['q1', 'median', 'q3'];
        var t = G.table({ id: 'prc-i', corner: 'Per share (' + S.meta.currency + ')', cols: [{ label: 'Q1 · Downside' }, { label: 'Median · Base' }, { label: 'Q3 · Upside' }], rows: [
          { label: 'Multiple · EV / Revenue', unit: 'x', cell: function (c) { return ctx.calc(function () { return ctx.R.stats.evRev[ks[c]]; }, 'x'); } },
          { label: 'Multiple · EV / EBITDA', unit: 'x', cell: function (c) { return ctx.calc(function () { return ctx.R.stats.evEbitda[ks[c]]; }, 'x'); } },
          { label: 'Premium', unit: '%', cell: function (c) { return ctx.calc(function () { return ctx.R.stats.premium[ks[c]]; }, 'pct'); } },
          { label: 'Value per share · EV / Revenue', cell: function (c) { return ctx.calc(function () { return ctx.R.implied[ks[c]].evRev.ps; }); } },
          { label: 'Value per share · EV / EBITDA', cell: function (c) { return ctx.calc(function () { return ctx.R.implied[ks[c]].evEbitda.ps; }); } },
          { label: 'Value per share · blended', cls: 'total', cell: function (c) { return ctx.calc(function () { return ctx.R.implied[ks[c]].blend.ps; }); } },
          { label: 'Price via premium', cell: function (c) { return ctx.calc(function () { return ctx.R.implied[ks[c]].premium.ps; }); } }
        ] });
        return ctx.group([ctx.panel('Implied value', [t])]);
      }]] }
    ]
  });

  // shared floating-bar football field
  function footfield(ctx, canvas, rows, price) {
    var acc = ctx.css('--accent'), grid = ctx.css('--line'), crit = ctx.css('--crit'), fg = ctx.css('--muted');
    if (!root.Chart) return;
    root.Chart.defaults.color = fg; root.Chart.defaults.borderColor = grid; root.Chart.defaults.font.family = ctx.css('--font-body');
    var line = { id: 'px', afterDatasetsDraw: function (ch) {
      if (!(price > 0)) return; var x = ch.scales.x.getPixelForValue(price), a = ch.chartArea; if (x < a.left || x > a.right) return;
      var c = ch.ctx; c.save(); c.strokeStyle = crit; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(x, a.top); c.lineTo(x, a.bottom); c.stroke();
      c.fillStyle = crit; c.textAlign = 'center'; c.font = '600 11px ' + root.Chart.defaults.font.family; c.fillText('Price ' + U.fmtNum(price), x, a.top - 4); c.restore();
    } };
    ctx.chart(canvas, { type: 'bar', plugins: [line], data: { labels: rows.map(function (r) { return r[0]; }), datasets: [{ data: rows.map(function (r) { return r[1]; }), backgroundColor: acc, borderRadius: 3, barPercentage: 0.6 }] },
      options: { indexAxis: 'y', maintainAspectRatio: false, animation: false, layout: { padding: { top: 16 } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) { return U.fmtNum(c.raw[0]) + ' – ' + U.fmtNum(c.raw[1]); } } } },
        scales: { x: { grid: { color: grid }, ticks: { callback: function (v) { return U.fmtNum(v); } } }, y: { grid: { display: false } } } } });
  }
  Hub.footfield = footfield;
})(typeof window !== 'undefined' ? window : globalThis);
