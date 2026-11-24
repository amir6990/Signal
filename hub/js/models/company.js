/* =====================================================================
 * COMPANY MODEL — custom statements per company
 * Each company keeps its own income-statement and balance-sheet lines (any
 * names, Persian or English). Every line is mapped to an accounting ROLE
 * and given a forecast METHOD; subtotals, the integrated projection, free
 * cash flow and the DCF are built from the roles, so the model adapts to
 * whatever line items the statements contain.
 *
 *  IS roles : revenue · cogs · opex · otherOp · da · interestExp · nonOp · tax · skip
 *  BS roles : cash (balancing item) · nwcA · ppe (roll-forward) · opA · nonOpA ·
 *             nwcL · debt · debtLike · opL · equity · retained · minority · skip
 *  D&A      : "embedded" (Iranian / IFRS by-function: inside cost of sales and
 *             opex, D&A line is a memo from the notes) or "separate".
 *  Balance  : cash = total liabilities & equity − all other assets, so the
 *             projected balance sheet balances by construction; the derived
 *             cash-flow statement is checked against the change in cash.
 *  Scenarios: Base = line drivers; Upside / Downside overlay revenue growth,
 *             COGS % and opex % of revenue, capex % and receivable/inventory days.
 * Engine, Excel export and UI in one file. Node-loadable.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {}, F = Hub.fin, num = F.num, N = 5;

  var ROLES = {
    revenue: { st: 'IS', label: 'Revenue', methods: ['growth', 'manual'] },
    cogs: { st: 'IS', label: 'Cost of sales', methods: ['pctRev', 'growth', 'manual'], cost: true },
    opex: { st: 'IS', label: 'Operating expense (selling, G&A, R&D)', methods: ['pctRev', 'growth', 'manual'], cost: true },
    otherOp: { st: 'IS', label: 'Other operating income / (expense), net', methods: ['pctRev', 'flat', 'zero', 'manual'] },
    da: { st: 'IS', label: 'Depreciation & amortisation', methods: ['pctPPE', 'pctRev', 'manual'], cost: true },
    interestExp: { st: 'IS', label: 'Finance costs', methods: ['onDebt', 'manual'], cost: true },
    nonOp: { st: 'IS', label: 'Other non-operating income / (expense), net', methods: ['zero', 'flat', 'onCash', 'manual'] },
    tax: { st: 'IS', label: 'Income tax', methods: ['taxRate'], cost: true },
    cash: { st: 'BS', kind: 'A', label: 'Cash (balancing item)', methods: ['plug'] },
    nwcA: { st: 'BS', kind: 'A', label: 'Operating current asset (receivables, inventory, prepayments)', methods: ['daysRev', 'daysCogs', 'pctRev', 'flat', 'manual'] },
    ppe: { st: 'BS', kind: 'A', label: 'Fixed assets (+ capex − D&A)', methods: ['roll', 'flat'] },
    opA: { st: 'BS', kind: 'A', label: 'Other operating non-current asset', methods: ['flat', 'growth', 'manual'] },
    nonOpA: { st: 'BS', kind: 'A', label: 'Non-operating asset (investments) — added in bridge', methods: ['flat', 'growth', 'manual'] },
    nwcL: { st: 'BS', kind: 'L', label: 'Operating current liability (payables, advances, tax payable)', methods: ['daysCogs', 'daysRev', 'pctRev', 'pctCogs', 'flat', 'manual'] },
    debt: { st: 'BS', kind: 'L', label: 'Borrowings — deducted in bridge', methods: ['schedule', 'flat'] },
    debtLike: { st: 'BS', kind: 'L', label: 'Debt-like item (dividends payable, end-of-service) — deducted', methods: ['flat', 'growth', 'manual'] },
    opL: { st: 'BS', kind: 'L', label: 'Other operating non-current liability', methods: ['flat', 'growth', 'manual'] },
    equity: { st: 'BS', kind: 'E', label: 'Share capital and reserves', methods: ['flat'] },
    retained: { st: 'BS', kind: 'E', label: 'Retained earnings (+ NI − dividends)', methods: ['roll'] },
    minority: { st: 'BS', kind: 'E', label: 'Non-controlling interest — deducted in bridge', methods: ['flat'] },
    skip: { st: '*', label: 'Ignore (subtotal or memo)', methods: ['none'] }
  };
  var METHODS = {
    growth: { label: 'Growth % p.a.', unit: '%', pct: true }, pctRev: { label: '% of revenue', unit: '%', pct: true }, pctCogs: { label: '% of cost of sales', unit: '%', pct: true },
    pctPPE: { label: '% of opening fixed assets', unit: '%', pct: true }, daysRev: { label: 'Days of revenue', unit: 'days' }, daysCogs: { label: 'Days of cost of sales', unit: 'days' },
    onDebt: { label: 'Rate on opening borrowings (nominal)', unit: '%', pct: true }, onCash: { label: 'Rate on opening cash (nominal)', unit: '%', pct: true },
    taxRate: { label: 'Rate on positive PBT', unit: '%', pct: true }, manual: { label: 'Amount per year', unit: 'amt' },
    flat: { label: 'Held flat', unit: '' }, zero: { label: 'Zero', unit: '' }, roll: { label: 'Roll-forward', unit: '' }, plug: { label: 'Balancing item', unit: '' },
    schedule: { label: 'Financing schedule', unit: '' }, none: { label: '—', unit: '' }
  };
  var HAS_DRIVER = { growth: 1, pctRev: 1, pctCogs: 1, pctPPE: 1, daysRev: 1, daysCogs: 1, onDebt: 1, onCash: 1, taxRate: 1, manual: 1 };
  var OVR = [['growthD', 'Revenue growth Δ', 'pct'], ['cogsD', 'Cost of sales % revenue Δ', 'pct'], ['opexD', 'Opex % revenue Δ', 'pct'], ['capexD', 'Capex % revenue Δ', 'pct'], ['daysD', 'Receivable & inventory days Δ', 'days']];

  /* ---------- role suggestion from line names (Persian and English) ---------- */
  function norm(s) { return String(s || '').replace(/‌/g, ' ').replace(/ي/g, 'ی').replace(/ك/g, 'ک').toLowerCase().trim(); }
  var RULES = {
    IS: [
      [/نسبت|حاشیه|ratio|margin|درصد|%|انباشته|قابل تخصیص|تخصیص|سود سهام مصوب|اندوخته|سود هر سهم|eps|per share|تعداد سهام/, 'skip'],
      [/جمع|total|subtotal|سود ناخالص|gross profit|سود.*عملیاتی|operating profit|سود.*قبل از|profit before|سود.*خالص|net (profit|income)|ebitda|سود \(زیان\)|سود\(زیان\)/, 'skip'],
      [/استهلاک|depreciation|amorti/, 'da'],
      [/بهای تمام شده|cost of (sales|goods|revenue)|\bcogs\b/, 'cogs'],
      [/مالیات|income tax|\btax\b/, 'tax'],
      [/هزینه(\s|‌)?(ها)?ی? مالی(?!ات)|finance cost|interest expense|سود تسهیلات|هزینه.*(تسهیلات|اوراق)/, 'interestExp'],
      [/هزینه.*(فروش|توزیع|اداری|عمومی|تحقیق|کارکنان|حقوق)|selling|distribution|administrative|general|r&d|research/, 'opex'],
      [/غیر ?عملیاتی|non.operating|other income|سایر درآمد(?!.*عملیاتی)/, 'nonOp'],
      [/سایر.*عملیاتی|other operating/, 'otherOp'],
      [/درآمد|فروش|revenue|sales|turnover/, 'revenue']
    ],
    BS: [
      [/جمع|total|subtotal|نسبت|ratio|کنترل/, 'skip'],
      [/موجودی نقد|^نقد|cash|بانک/, 'cash'],
      [/دریافتنی.*بلند ?مدت|long.term receivable/, 'opA'],
      [/دریافتنی|receivable|موجودی (مواد|کالا)|inventor|پیش ?پرداخت|prepay|سفارشات/, 'nwcA'],
      [/سرمایه ?گذاری|investment|نگهداری شده برای فروش|held for sale/, 'nonOpA'],
      [/سود سهام پرداختنی|dividends? payable|پایان خدمت|end.of.service|employee benefit|پرداختنی سود|سود.*پرداختنی/, 'debtLike'],
      [/تسهیلات|borrowing|loan|وام|اوراق|bond|notes payable|صکوک|sukuk/, 'debt'],
      [/دارایی.*ثابت|property|plant|equipment|pp&e/, 'ppe'],
      [/نامشهود|intangible|goodwill|سرقفلی|سایر دارایی/, 'opA'],
      [/پرداختنی|payable|پیش ?دریافت|advance|ذخایر|ذخیره|provision|accru/, 'nwcL'],
      [/انباشته|retained/, 'retained'],
      [/فاقد حق کنترل|non.controlling|minority/, 'minority'],
      [/^سرمایه|share capital|افزایش سرمایه|اندوخته|reserve|صرف سهام|premium|سهام خزانه|treasury|تجدید ارزیابی|revaluation|مازاد/, 'equity']
    ]
  };
  function suggestRole(name, st) {
    var n = norm(name), list = RULES[st];
    for (var i = 0; i < list.length; i++) if (list[i][0].test(n)) return list[i][1];
    return st === 'IS' ? 'opex' : 'opA';
  }
  function defMethod(role) { return { revenue: 'growth', cogs: 'pctRev', opex: 'pctRev', otherOp: 'pctRev', da: 'pctPPE', interestExp: 'onDebt', nonOp: 'zero', tax: 'taxRate',
    cash: 'plug', nwcA: 'daysRev', ppe: 'roll', opA: 'flat', nonOpA: 'flat', nwcL: 'daysCogs', debt: 'schedule', debtLike: 'flat', opL: 'flat', equity: 'flat', retained: 'roll', minority: 'flat', skip: 'none' }[role] || 'flat'; }
  var uid = 0; function newId() { uid++; return 'L' + Date.now().toString(36) + uid; }
  function line(name, role, hist, st) { return { id: newId(), name: name, role: role, m: defMethod(role), d: [0, 0, 0, 0, 0], hist: hist.slice(), st: st }; }
  function rep(v) { return [v, v, v, v, v]; }

  /* ---------- historical aggregates ---------- */
  function sumRole(lines, role, i) { return lines.reduce(function (s, l) { return s + (l.role === role ? num(l.hist[i]) : 0); }, 0); }
  function histAgg(S) {
    var n = S.meta.histYears.length, H = { n: n };
    ['revenue', 'cogs', 'opex', 'otherOp', 'da', 'interestExp', 'nonOp', 'tax'].forEach(function (r) { H[r] = []; for (var i = 0; i < n; i++) H[r].push(sumRole(S.is, r, i)); });
    ['cash', 'nwcA', 'ppe', 'opA', 'nonOpA', 'nwcL', 'debt', 'debtLike', 'opL', 'equity', 'retained', 'minority'].forEach(function (r) { H[r] = []; for (var i = 0; i < n; i++) H[r].push(sumRole(S.bs, r, i)); });
    var emb = S.settings.daMode !== 'separate';
    H.gp = H.revenue.map(function (v, i) { return v - H.cogs[i]; });
    H.ebit = H.gp.map(function (v, i) { return v - H.opex[i] + H.otherOp[i] - (emb ? 0 : H.da[i]); });
    H.ebitda = H.ebit.map(function (v, i) { return v + H.da[i]; });
    H.ebt = H.ebit.map(function (v, i) { return v - H.interestExp[i] + H.nonOp[i]; });
    H.ni = H.ebt.map(function (v, i) { return v - H.tax[i]; });
    H.ta = H.cash.map(function (v, i) { return v + H.nwcA[i] + H.ppe[i] + H.opA[i] + H.nonOpA[i]; });
    H.tl = H.nwcL.map(function (v, i) { return v + H.debt[i] + H.debtLike[i] + H.opL[i]; });
    H.te = H.equity.map(function (v, i) { return v + H.retained[i] + H.minority[i]; });
    H.check = H.ta.map(function (v, i) { return v - H.tl[i] - H.te[i]; });
    H.nwc = H.nwcA.map(function (v, i) { return v - H.nwcL[i]; });
    H.capex = []; for (var i = 0; i < n; i++) { var c = num(S.cfs.capex[i]); H.capex.push(c || (i ? H.ppe[i] - H.ppe[i - 1] + H.da[i] : NaN)); }
    H.dividends = S.cfs.dividends.map(num);
    H.ebitdaMargin = H.ebitda.map(function (v, i) { return H.revenue[i] ? v / H.revenue[i] : NaN; });
    H.revGrowth = H.revenue.map(function (v, i) { return i && H.revenue[i - 1] ? v / H.revenue[i - 1] - 1 : NaN; });
    return H;
  }
  // historical ratio of a line under its method, for the driver reference columns
  function histRatio(S, H, l, i) {
    var v = num(l.hist[i]), m = l.m;
    if (m === 'growth') return i && num(l.hist[i - 1]) ? v / num(l.hist[i - 1]) - 1 : NaN;
    if (m === 'pctRev') return H.revenue[i] ? v / H.revenue[i] : NaN;
    if (m === 'pctCogs') return H.cogs[i] ? v / H.cogs[i] : NaN;
    if (m === 'daysRev') return H.revenue[i] ? v / H.revenue[i] * 365 : NaN;
    if (m === 'daysCogs') return H.cogs[i] ? v / H.cogs[i] * 365 : NaN;
    if (m === 'pctPPE') return i && H.ppe[i - 1] ? v / H.ppe[i - 1] : NaN;
    if (m === 'onDebt') return i ? v / ((H.debt[i] + H.debt[i - 1]) / 2 || NaN) : NaN;
    if (m === 'onCash') return i ? v / ((H.cash[i] + H.cash[i - 1]) / 2 || NaN) : NaN;
    if (m === 'taxRate') return H.ebt[i] > 0 ? v / H.ebt[i] : NaN;
    if (m === 'manual') return v;
    return NaN;
  }
  // seed base drivers from the last historical year (growth: average of available years, deflated when basis is real)
  function seed(S) {
    var H = histAgg(S), n = H.n, last = n - 1, infl = num(S.wacc.inflation), real = S.settings.basis === 'real';
    S.is.concat(S.bs).forEach(function (l) {
      if (!HAS_DRIVER[l.m]) { l.d = [0, 0, 0, 0, 0]; return; }
      var v;
      if (l.m === 'growth') {
        var gs = []; for (var i = 1; i < n; i++) { var g = histRatio(S, H, l, i); if (isFinite(g)) gs.push(g); }
        v = gs.length ? gs.reduce(function (a, b) { return a + b; }, 0) / gs.length : 0;
        if (real) v = (1 + v) / (1 + infl) - 1;
        if (l.role !== 'revenue' && !isFinite(v)) v = 0;
      } else if (l.m === 'manual') v = num(l.hist[last]);
      else { v = histRatio(S, H, l, last); if (!isFinite(v)) v = histRatio(S, H, l, last - 1); if (!isFinite(v)) v = 0; }
      if (l.m === 'taxRate') v = Math.max(0, Math.min(0.5, v));
      l.d = rep(Math.round(v * 1e6) / 1e6);
    });
    var cx = H.capex[last], r = H.revenue[last];
    S.capex.d = rep(r && isFinite(cx) ? Math.round(cx / r * 1e6) / 1e6 : 0);
    return S;
  }

  /* ---------- projection ---------- */
  function ov(S, key, t) { var k = S.settings.scenario; return k === 'base' ? 0 : num(S.overlay[k][key][t]); }
  function fisher(r, S) { return S.settings.basis === 'real' ? (1 + r) / (1 + num(S.wacc.inflation)) - 1 : r; }
  function project(S, H) {
    var nH = H.n, last = nH - 1, P = { is: {}, bs: {}, t: {} };
    var prev = {}; S.is.concat(S.bs).forEach(function (l) { prev[l.id] = num(l.hist[last]); });
    var prevT = { cash: H.cash[last], debt: H.debt[last], ppe: H.ppe[last], nwc: H.nwc[last], opA: H.opA[last], opL: H.opL[last], nonOpA: H.nonOpA[last], debtLike: H.debtLike[last], equity: H.equity[last], minority: H.minority[last] };
    S.is.concat(S.bs).forEach(function (l) { (l.st === 'IS' ? P.is : P.bs)[l.id] = []; });
    var T = ['revenue', 'cogs', 'gp', 'opex', 'otherOp', 'ebit', 'da', 'ebitda', 'interestExp', 'nonOp', 'ebt', 'tax', 'ni', 'capex', 'dividends', 'cash', 'nwcA', 'ppe', 'opA', 'nonOpA', 'ta', 'nwcL', 'debt', 'debtLike', 'opL', 'tl',
      'equity', 'retained', 'minority', 'te', 'tle', 'check', 'nwc', 'dNwc', 'cfo', 'cfi', 'cff', 'netCash', 'cashCheck', 'nopat', 'ufcf', 'per', 'df', 'pv', 'taxRate', 'ebitdaMargin'];
    T.forEach(function (k) { P.t[k] = []; });
    var emb = S.settings.daMode !== 'separate', mid = !!S.settings.midYear;
    var kd = fisher(0, S), first = function (role, arr) { return arr.filter(function (l) { return l.role === role; })[0]; };
    var cashL = first('cash', S.bs), ppeL = first('ppe', S.bs), debtL = first('debt', S.bs), eqL = first('equity', S.bs), retL = first('retained', S.bs), taxL = first('tax', S.is);
    var sumPct = function (role, t) { return S.is.reduce(function (s, l) { return s + (l.role === role && l.m === 'pctRev' ? num(l.d[t]) : 0); }, 0); };
    for (var t = 0; t < N; t++) {
      var cur = {}, set = function (l, v) { cur[l.id] = v; (l.st === 'IS' ? P.is : P.bs)[l.id].push(v); };
      var val = function (role) { return S.is.concat(S.bs).reduce(function (s, l) { return s + (l.role === role ? (cur[l.id] || 0) : 0); }, 0); };
      // revenue
      S.is.filter(function (l) { return l.role === 'revenue'; }).forEach(function (l) { set(l, l.m === 'manual' ? num(l.d[t]) : prev[l.id] * (1 + num(l.d[t]) + ov(S, 'growthD', t))); });
      var rev = val('revenue');
      // cost of sales, opex
      ['cogs', 'opex'].forEach(function (role) {
        var sp = sumPct(role, t), od = ov(S, role === 'cogs' ? 'cogsD' : 'opexD', t);
        S.is.filter(function (l) { return l.role === role; }).forEach(function (l) {
          var v = l.m === 'pctRev' ? rev * num(l.d[t]) * (sp ? 1 + od / sp : 1) : l.m === 'growth' ? prev[l.id] * (1 + num(l.d[t])) : num(l.d[t]);
          set(l, v);
        });
      });
      var cogs = val('cogs');
      S.is.filter(function (l) { return l.role === 'otherOp'; }).forEach(function (l) { set(l, l.m === 'pctRev' ? rev * num(l.d[t]) : l.m === 'flat' ? prev[l.id] : l.m === 'zero' ? 0 : num(l.d[t])); });
      S.is.filter(function (l) { return l.role === 'da'; }).forEach(function (l) { set(l, l.m === 'pctPPE' ? prevT.ppe * num(l.d[t]) : l.m === 'pctRev' ? rev * num(l.d[t]) : num(l.d[t])); });
      var da = val('da'), gp = rev - cogs, opex = val('opex'), oth = val('otherOp');
      var ebit = gp - opex + oth - (emb ? 0 : da);
      S.is.filter(function (l) { return l.role === 'interestExp'; }).forEach(function (l, j) { set(l, l.m === 'onDebt' ? (j === 0 ? prevT.debt : 0) * fisher(num(l.d[t]), S) : num(l.d[t])); });
      S.is.filter(function (l) { return l.role === 'nonOp'; }).forEach(function (l) { set(l, l.m === 'onCash' ? prevT.cash * fisher(num(l.d[t]), S) : l.m === 'flat' ? prev[l.id] : l.m === 'zero' ? 0 : num(l.d[t])); });
      var ie = val('interestExp'), nop = val('nonOp'), ebt = ebit - ie + nop;
      var taxRate = taxL ? num(taxL.d[t]) : 0;
      S.is.filter(function (l) { return l.role === 'tax'; }).forEach(function (l) { set(l, l === taxL ? Math.max(0, ebt) * taxRate : 0); });
      var tax = val('tax'), ni = ebt - tax;
      S.is.filter(function (l) { return l.role === 'skip'; }).forEach(function (l) { set(l, NaN); });
      var capex = S.capex.m === 'manual' ? num(S.capex.d[t]) : rev * (num(S.capex.d[t]) + ov(S, 'capexD', t));
      var div = Math.max(0, ni) * num(S.fin.payout);
      // balance sheet (non-cash)
      S.bs.forEach(function (l) {
        if (l.role === 'cash' || l.role === 'skip') return;
        var p = prev[l.id], d = num(l.d[t]), v, dd = ov(S, 'daysD', t);
        switch (l.m) {
          case 'daysRev': v = rev * (d + (l.role === 'nwcA' ? dd : 0)) / 365; break;
          case 'daysCogs': v = cogs * (d + (l.role === 'nwcA' ? dd : 0)) / 365; break;
          case 'pctRev': v = rev * d; break;
          case 'pctCogs': v = cogs * d; break;
          case 'growth': v = p * (1 + d); break;
          case 'manual': v = d; break;
          case 'roll': v = l === ppeL ? p + capex - da : l === retL ? p + ni - div : p; break;
          case 'schedule': v = l === debtL ? p + num(S.fin.debtChange[t]) : p; break;
          default: v = p;
        }
        if (l === eqL) v += num(S.fin.equityRaise[t]);
        set(l, v);
      });
      ['nwcA', 'ppe', 'opA', 'nonOpA', 'nwcL', 'debt', 'debtLike', 'opL', 'equity', 'retained', 'minority'].forEach(function (r) { cur['_' + r] = val(r); });
      var tl = cur._nwcL + cur._debt + cur._debtLike + cur._opL, te = cur._equity + cur._retained + cur._minority;
      var otherCash = S.bs.filter(function (l) { return l.role === 'cash' && l !== cashL; });
      otherCash.forEach(function (l) { set(l, prev[l.id]); });
      var nonCashA = cur._nwcA + cur._ppe + cur._opA + cur._nonOpA + otherCash.reduce(function (s, l) { return s + cur[l.id]; }, 0);
      if (cashL) set(cashL, tl + te - nonCashA);
      S.bs.filter(function (l) { return l.role === 'skip'; }).forEach(function (l) { set(l, NaN); });
      var cash = val('cash'), ta = cash + nonCashA - otherCash.reduce(function (s, l) { return s + cur[l.id]; }, 0);
      var nwc = cur._nwcA - cur._nwcL, dNwc = nwc - prevT.nwc;
      var cfo = ni + da - dNwc - (cur._opA - prevT.opA) + (cur._opL - prevT.opL);
      var cfi = -capex - (cur._nonOpA - prevT.nonOpA) - (cur._ppe - prevT.ppe - capex + da);
      var cff = (cur._debt - prevT.debt) + (cur._debtLike - prevT.debtLike) + (cur._equity - prevT.equity) + (cur._minority - prevT.minority) - div;
      var nopat = ebit * (1 - taxRate), ufcf = nopat + da - capex - dNwc - (cur._opA - prevT.opA) + (cur._opL - prevT.opL);
      var per = mid ? t + 0.5 : t + 1;
      var row = { revenue: rev, cogs: cogs, gp: gp, opex: opex, otherOp: oth, ebit: ebit, da: da, ebitda: ebit + da, interestExp: ie, nonOp: nop, ebt: ebt, tax: tax, ni: ni, capex: capex, dividends: div,
        cash: cash, nwcA: cur._nwcA, ppe: cur._ppe, opA: cur._opA, nonOpA: cur._nonOpA, ta: ta, nwcL: cur._nwcL, debt: cur._debt, debtLike: cur._debtLike, opL: cur._opL, tl: tl,
        equity: cur._equity, retained: cur._retained, minority: cur._minority, te: te, tle: tl + te, check: ta - tl - te, nwc: nwc, dNwc: dNwc, cfo: cfo, cfi: cfi, cff: cff, netCash: cfo + cfi + cff,
        cashCheck: cfo + cfi + cff - (cash - prevT.cash), nopat: nopat, ufcf: ufcf, per: per, df: 0, pv: 0, taxRate: taxRate, ebitdaMargin: rev ? (ebit + da) / rev : NaN };
      T.forEach(function (k) { P.t[k].push(row[k]); });
      S.is.concat(S.bs).forEach(function (l) { prev[l.id] = cur[l.id] != null ? cur[l.id] : prev[l.id]; });
      prevT = { cash: cash, debt: cur._debt, ppe: cur._ppe, nwc: nwc, opA: cur._opA, opL: cur._opL, nonOpA: cur._nonOpA, debtLike: cur._debtLike, equity: cur._equity, minority: cur._minority };
    }
    return P;
  }

  /* ---------- valuation ---------- */
  function wacc(S) {
    var w = S.wacc, t = num(w.taxRate), wd = num(w.debtWeight), we = 1 - wd, de = we > 0 ? wd / we : 0;
    var bl = w.betaMode === 'relever' ? num(w.betaUnlevered) * (1 + (1 - t) * de) : num(w.betaLevered);
    // computed (CAPM / WACC) or the user's own number (nominal; converted with Fisher on a real basis)
    var keCalc = num(w.rf) + bl * num(w.erp) + num(w.crp) + num(w.sizePremium), ke = w.keMode === 'manual' ? num(w.keManual) : keCalc;
    var nomCalc = we * ke + wd * num(w.kdPreTax) * (1 - t), nom = w.waccMode === 'manual' ? num(w.waccManual) : nomCalc;
    var real = (1 + nom) / (1 + num(w.inflation)) - 1, isReal = S.settings.basis === 'real', dfl = function (x) { return isReal ? (1 + x) / (1 + num(w.inflation)) - 1 : x; };
    var M = methodOf(S), waccUsed = isReal ? real : nom, keU = dfl(ke);
    return { de: de, betaL: bl, ke: ke, keCalc: keCalc, nomCalc: nomCalc, keManual: w.keMode === 'manual', waccManual: w.waccMode === 'manual', nominal: nom, real: real, keUsed: keU, rfUsed: dfl(num(w.rf)), wacc: waccUsed, used: M.cf === 'fcfe' ? keU : waccUsed };
  }
  /* ---------- methodology choices: best-practice defaults, house alternatives selectable ---------- */
  var METHOD_DEF = { cf: 'fcff', tvRate: 'same', gBuild: 'direct', exitFcff: 'evEbitda', exitFcfe: 'pe' };
  // exit multiples: key in S.tv[scenario], metric in the final forecast year
  var EXITS = { evEbitda: { tv: 'mult', label: 'EV / EBITDA', eq: false }, evEbit: { tv: 'evEbit', label: 'EV / EBIT', eq: false }, evSales: { tv: 'evSales', label: 'EV / Sales', eq: false },
    pe: { tv: 'pe', label: 'P / E', eq: true }, ps: { tv: 'ps', label: 'P / S', eq: true }, pb: { tv: 'pb', label: 'P / B', eq: true } };
  var EXIT_DEF = { mult: [8, 9, 6.5], evEbit: [10, 11.5, 8], evSales: [1.5, 1.8, 1.1], pe: [6, 7, 5], ps: [1, 1.2, 0.8], pb: [1.5, 1.8, 1.1] };
  function exitMetric(P, type, t) {
    t = t == null ? N - 1 : t;
    return type === 'evEbit' ? P.t.ebit[t] : type === 'evSales' || type === 'ps' ? P.t.revenue[t] : type === 'pe' ? P.t.ni[t] : type === 'pb' ? P.t.equity[t] + P.t.retained[t] : P.t.ebitda[t];
  }
  function netDebtAt(P, t) { return P.t.debt[t] + P.t.debtLike[t] - P.t.cash[t] - P.t.nonOpA[t] + P.t.minority[t]; }
  function multOf(S, k, type) { return num(S.tv[k][EXITS[type].tv]); }
  function methodOf(S) { S.method = Object.assign({}, METHOD_DEF, S.method || {}); return S.method; }
  // terminal growth actually used: input as entered, or a real growth converted to the model basis
  function growthUsed(S, gIn) {
    var M = methodOf(S), inf = num(S.wacc.inflation);
    if (M.gBuild === 'direct' || S.settings.basis === 'real') return gIn;
    return M.gBuild === 'additive' ? gIn + inf : (1 + gIn) * (1 + inf) - 1;
  }
  function bridgeOf(S, H) {
    var l = H.n - 1, b = S.bridge;
    var adj = -H.debt[l] - H.debtLike[l] + H.cash[l] + H.nonOpA[l] - H.minority[l] + num(b.otherAssets) - num(b.otherClaims);
    return { debt: H.debt[l], debtLike: H.debtLike[l], cash: H.cash[l], nonOpA: H.nonOpA[l], minority: H.minority[l], otherAssets: num(b.otherAssets), otherClaims: num(b.otherClaims), adjust: adj };
  }
  // FCFE = net income + D&A − capex − increase in NWC and other operating items + net borrowing (debt and debt-like)
  function fcfeSeries(P, H) {
    var out = [], last = H.n - 1;
    for (var t = 0; t < N; t++) {
      var pd = t ? P.t.debt[t - 1] : H.debt[last], pl = t ? P.t.debtLike[t - 1] : H.debtLike[last], pA = t ? P.t.opA[t - 1] : H.opA[last], pL = t ? P.t.opL[t - 1] : H.opL[last];
      out.push(P.t.ni[t] + P.t.da[t] - P.t.capex[t] - P.t.dNwc[t] - (P.t.opA[t] - pA) + (P.t.opL[t] - pL) + (P.t.debt[t] - pd) + (P.t.debtLike[t] - pl));
    }
    return out;
  }
  function value(S, P, H, W, g, mult) { return methodOf(S).cf === 'fcfe' ? valueFCFE(S, P, H, W, g, mult) : valueFCFF(S, P, H, W, g, mult); }
  function tvRateOf(S, W) { var M = methodOf(S), w = wacc(S); return M.tvRate === 'rf' ? w.rfUsed : W; }
  function valueFCFE(S, P, H, ke, g, mult) {
    var mid = !!S.settings.midYear, u = F.UNIT[S.meta.unit] || 1, sh = num(S.bridge.sharesMn) * 1e6, M = methodOf(S), fe = fcfeSeries(P, H), rT = tvRateOf(S, ke);
    var sum = 0; for (var t = 0; t < N; t++) sum += fe[t] / Math.pow(1 + ke, mid ? t + 0.5 : t + 1);
    var fN = fe[N - 1], niN = P.t.ni[N - 1], xt = M.exitFcfe;
    var tvG = rT > g ? fN * (1 + g) / (rT - g) : NaN, tvX = xt === 'evEbitda' ? P.t.ebitda[N - 1] * mult - netDebtAt(P, N - 1) : exitMetric(P, xt) * mult;
    var pvG = tvG / Math.pow(1 + ke, mid ? N - 0.5 : N), pvX = tvX / Math.pow(1 + ke, N);
    var b = bridgeOf(S, H), adj = b.cash + b.nonOpA + num(S.bridge.otherAssets) - num(S.bridge.otherClaims) - b.minority, gw = num(S.settings.gordonWeight);
    var eqG = sum + pvG + adj, eqX = sum + pvX + adj, nd = b.debt + b.debtLike - b.cash - b.nonOpA - num(S.bridge.otherAssets) + num(S.bridge.otherClaims) + b.minority, f = function (eq) { return sh > 0 ? eq * u / sh : NaN; };
    return { cf: 'fcfe', exit: xt, wacc: ke, tvRate: rT, g: g, mult: mult, sumPV: sum, fcfN: fN, ebitdaN: P.t.ebitda[N - 1], tvG: tvG, tvX: tvX, pvTvG: pvG, pvTvX: pvX, bridge: b, fcfe: fe,
      evG: eqG + nd, evX: eqX + nd, eqG: eqG, eqX: eqX, psG: f(eqG), psX: f(eqX), evBlend: gw * eqG + (1 - gw) * eqX + nd, eqBlend: gw * eqG + (1 - gw) * eqX, psBlend: f(gw * eqG + (1 - gw) * eqX),
      tvShareG: pvG / (sum + pvG), impliedMult: niN ? tvG / niN : NaN, impliedG: (tvX * rT - fN) / (tvX + fN) };
  }
  function valueFCFF(S, P, H, W, g, mult) {
    var mid = !!S.settings.midYear, u = F.UNIT[S.meta.unit] || 1, sh = num(S.bridge.sharesMn) * 1e6, rT = tvRateOf(S, W);
    var sum = 0; for (var t = 0; t < N; t++) sum += P.t.ufcf[t] / Math.pow(1 + W, mid ? t + 0.5 : t + 1);
    var fcfN = P.t.ufcf[N - 1], ebN = P.t.ebitda[N - 1], xt = methodOf(S).exitFcff;
    var tvG = rT > g ? fcfN * (1 + g) / (rT - g) : NaN, tvX = exitMetric(P, xt) * mult;
    var pvG = tvG / Math.pow(1 + W, mid ? N - 0.5 : N), pvX = tvX / Math.pow(1 + W, N);
    var b = bridgeOf(S, H), evG = sum + pvG, evX = sum + pvX, gw = num(S.settings.gordonWeight);
    var ps = function (eq) { return sh > 0 ? eq * u / sh : NaN; };
    return { cf: 'fcff', exit: xt, tvRate: rT, wacc: W, g: g, mult: mult, sumPV: sum, fcfN: fcfN, ebitdaN: ebN, tvG: tvG, tvX: tvX, pvTvG: pvG, pvTvX: pvX, evG: evG, evX: evX, bridge: b,
      eqG: evG + b.adjust, eqX: evX + b.adjust, psG: ps(evG + b.adjust), psX: ps(evX + b.adjust),
      evBlend: gw * evG + (1 - gw) * evX, eqBlend: gw * (evG + b.adjust) + (1 - gw) * (evX + b.adjust), psBlend: ps(gw * (evG + b.adjust) + (1 - gw) * (evX + b.adjust)),
      tvShareG: pvG / evG, impliedMult: tvG / ebN, impliedG: (tvX * rT - fcfN) / (tvX + fcfN) };
  }
  /* ---------- cash need (وجه نقد مازاد / کسری) ----------
   * Cash available before any new funding = opening cash + operating + investing + scheduled financing
   * (= projected closing cash). Minimum cash: fixed amount, % of non-cash current assets, or % of revenue.
   * Funding balance needed B_t = max(0, minimum_t − (cash_t − cumulative after-tax cost of earlier funding));
   * cost_t = B_(t−1) × facility rate × (1 − tax). Peak B is the funding requirement; ΔB is the draw / (repayment). */
  function needDefaults(S) { S.need = Object.assign({ minMode: 'amount', minPct: 0.1, rate: 0.30, buffer: 0 }, S.need || {}); return S.need; }
  function cashNeed(S, H, P) {
    var n = needDefaults(S), last = H.n - 1, rate = fisher(num(n.rate), S), o = { open: [], cfo: [], cfi: [], cff: [], avail: [], minReq: [], surplus: [], cost: [], cumCost: [], bal: [], draw: [], after: [], excess: [] };
    var Bp = 0, Cp = 0;
    for (var t = 0; t < N; t++) {
      var open = t === 0 ? H.cash[last] : P.t.cash[t - 1], cash = P.t.cash[t];
      var mr = n.minMode === 'pctCA' ? num(n.minPct) * P.t.nwcA[t] : n.minMode === 'pctRev' ? num(n.minPct) * P.t.revenue[t] : num(S.fin.minCash);
      var cost = Bp * rate * (1 - P.t.taxRate[t]), C = Cp + cost, B = Math.max(0, mr - (cash - C));
      o.open.push(open); o.cfo.push(P.t.cfo[t]); o.cfi.push(P.t.cfi[t]); o.cff.push(P.t.cff[t]); o.avail.push(cash); o.minReq.push(mr); o.surplus.push(cash - mr);
      o.cost.push(cost); o.cumCost.push(C); o.bal.push(B); o.draw.push(B - Bp); o.after.push(cash - C + B); o.excess.push(cash - C + B - mr);
      Bp = B; Cp = C;
    }
    var peak = Math.max.apply(null, o.bal), yi = o.bal.indexOf(peak);
    o.peak = peak; o.peakIdx = peak > 0 ? yi : -1; o.peakYear = peak > 0 ? S.meta.projYears[yi] : '—';
    o.firstIdx = o.bal.findIndex(function (x) { return x > 0; }); o.rate = rate;
    o.withBuffer = peak * (1 + num(n.buffer));
    return o;
  }

  function runScen(S, k) {
    var s2 = k === S.settings.scenario ? S : Object.assign({}, S, { settings: Object.assign({}, S.settings, { scenario: k }) });
    var H = histAgg(s2), P = project(s2, H), W = wacc(s2), tv = s2.tv[k];
    var M = methodOf(s2), g = growthUsed(s2, num(tv.g));
    var VF = valueFCFF(s2, P, H, W.wacc, g, multOf(s2, k, M.exitFcff)), VE = valueFCFE(s2, P, H, W.keUsed, g, multOf(s2, k, M.exitFcfe));
    var V = M.cf === 'fcfe' ? VE : VF;
    for (var t = 0; t < N; t++) { P.t.df[t] = 1 / Math.pow(1 + W.wacc, P.t.per[t]); P.t.pv[t] = P.t.ufcf[t] * P.t.df[t]; }
    return { H: H, P: P, W: W, V: V, VF: VF, VE: VE, need: cashNeed(s2, H, P) };
  }
  // value of equity -> implied g, WACC, exit multiple (holding everything else)
  function implied(S, R, targetEq) {
    var V = R.V, k = S.settings.scenario;
    return {
      g: F.solve(function (g) { return value(S, R.P, R.H, V.wacc, g, V.mult).eqG - targetEq; }, -0.5, Math.min(V.wacc, V.tvRate) - 1e-4),
      wacc: F.solve(function (w) { return value(S, R.P, R.H, w, V.g, V.mult).eqG - targetEq; }, Math.max(-0.5, V.g + 1e-4), V.g + 1.5),
      mult: F.solve(function (m) { return value(S, R.P, R.H, V.wacc, V.g, m).eqX - targetEq; }, -50, 500)
    };
  }
  // restate the inputs on the other basis so the comparison is like for like (Fisher on growth, inflation index on amounts)
  function toBasis(S, target) {
    var s2 = JSON.parse(JSON.stringify(S)); if (S.settings.basis === target) return s2;
    var pi = num(S.wacc.inflation), up = target === 'nominal';
    var gr = function (x) { return up ? (1 + num(x)) * (1 + pi) - 1 : (1 + num(x)) / (1 + pi) - 1; }, amt = function (x, t) { return num(x) * Math.pow(1 + pi, up ? t + 1 : -(t + 1)); };
    s2.settings.basis = target;
    s2.is.concat(s2.bs).forEach(function (l) { if (l.m === 'growth') l.d = l.d.map(gr); else if (l.m === 'manual') l.d = l.d.map(amt); });
    if (s2.capex.m === 'manual') s2.capex.d = s2.capex.d.map(amt);
    s2.fin.debtChange = s2.fin.debtChange.map(amt); s2.fin.equityRaise = s2.fin.equityRaise.map(amt);
    if (s2.method && s2.method.gBuild !== 'direct' && target === 'nominal') { /* growthUsed converts the real input */ }
    else ['base', 'upside', 'downside'].forEach(function (k) { s2.tv[k].g = gr(s2.tv[k].g); });
    ['base', 'upside', 'downside'].forEach(function (k) { if (s2.overlay[k]) s2.overlay[k].growthD = s2.overlay[k].growthD.map(function (x) { return up ? num(x) * (1 + pi) : num(x) / (1 + pi); }); });
    return s2;
  }
  // every combination of the methodological choices, so the effect of each choice is visible
  function compareMethods(S) {
    var out = [], M0 = JSON.parse(JSON.stringify(methodOf(S))), b0 = S.settings.basis;
    [['nominal', 'Nominal'], ['real', 'Real']].forEach(function (b) {
      [['fcff', 'FCFF · WACC'], ['fcfe', 'FCFE · cost of equity']].forEach(function (c) {
        [['same', 'TV at the same rate'], ['rf', 'TV at risk-free (house)']].forEach(function (r) {
          var s2 = toBasis(S, b[0]); s2.method = Object.assign({}, M0, { cf: c[0], tvRate: r[0] });
          try { var q = runScen(s2, S.settings.scenario); out.push({ basis: b[0], cf: c[0], tvRate: r[0], label: b[1] + ' · ' + c[1] + ' · ' + r[1], ps: q.V.psBlend, psG: q.V.psG, psX: q.V.psX, rate: q.V.wacc, tvShare: q.V.tvShareG,
            current: b[0] === b0 && c[0] === M0.cf && r[0] === M0.tvRate, best: r[0] === 'same' }); } catch (e) { /* skip */ }
        });
      });
    });
    S.method = M0; S.settings.basis = b0;
    return out;
  }
  function run(S) {
    needDefaults(S); methodOf(S);
    ['base', 'upside', 'downside'].forEach(function (k, i) { Object.keys(EXIT_DEF).forEach(function (f) { if (S.tv[k][f] == null) S.tv[k][f] = EXIT_DEF[f][i]; }); });
    var k = S.settings.scenario, R = runScen(S, k);
    R.scen = {}; ['base', 'upside', 'downside'].forEach(function (s) { R.scen[s] = s === k ? R : runScen(S, s); });
    function grids(fn, V) {
      var ws = F.grid5(V.wacc, num(S.sens.waccStep)), gs = F.grid5(V.g, num(S.sens.gStep)), ms = F.grid5(V.mult, num(S.sens.multStep) * (V.mult < 4 ? 0.25 : 1));
      return { ws: ws, gs: gs, ms: ms, exitLabel: EXITS[V.exit].label + (V.cf === 'fcfe' && V.exit === 'evEbitda' ? ' − net debt' : ''),
        gordon: ws.map(function (w) { return gs.map(function (g) { return fn(S, R.P, R.H, w, g, V.mult).psG; }); }),
        exit: ws.map(function (w) { return ms.map(function (m) { return fn(S, R.P, R.H, w, V.g, m).psX; }); }) };
    }
    R.sensF = grids(valueFCFF, R.VF); R.sensE = grids(valueFCFE, R.VE);
    R.sens = methodOf(S).cf === 'fcfe' ? R.sensE : R.sensF;
    R.compare = compareMethods(S);
    var u = F.UNIT[S.meta.unit] || 1;
    R.reverse = num(S.bridge.price) > 0 && num(S.bridge.sharesMn) > 0 ? implied(S, R, num(S.bridge.price) * num(S.bridge.sharesMn) * 1e6 / u) : null;
    var c = [], H = R.H, P = R.P;
    var rtol = function (i) { return Math.min(5, Math.max(0.5, Math.abs(H.ta[i]) * 1e-6)); };
    H.check.forEach(function (x, i) { if (Math.abs(x) > 0.5 && Math.abs(x) <= rtol(i)) c.push({ level: 'info', msg: S.meta.histYears[i] + ': balance sheet differs by ' + x.toFixed(1) + ' (rounding in the source statements).' }); });
    H.check.forEach(function (x, i) { if (Math.abs(x) > rtol(i)) c.push({ level: 'critical', msg: S.meta.histYears[i] + ': balance sheet does not balance (difference ' + x.toFixed(1) + '). Check line roles and totals marked "Ignore".' }); });
    ['revenue', 'tax'].forEach(function (r) { if (!S.is.some(function (l) { return l.role === r; })) c.push({ level: 'critical', msg: 'No income-statement line mapped to "' + ROLES[r].label + '".' }); });
    ['cash', 'ppe', 'retained'].forEach(function (r) { if (!S.bs.some(function (l) { return l.role === r; })) c.push({ level: 'critical', msg: 'No balance-sheet line mapped to "' + ROLES[r].label + '".' }); });
    if (!S.is.some(function (l) { return l.role === 'da'; })) c.push({ level: 'warning', msg: 'No depreciation line. Add it from the notes (memo line) or EBITDA and FCF are understated.' });
    var mx = Math.max.apply(null, P.t.cashCheck.map(Math.abs)); if (mx > rtol(H.ta.length - 1)) c.push({ level: 'critical', msg: 'Derived cash flow does not reconcile to the change in cash (difference ' + mx.toFixed(1) + ').' });
    if (R.need.peak > 0.5) c.push({ level: 'warning', msg: 'Cash need: funding of ' + Math.round(R.need.peak).toLocaleString('en-US') + ' required by ' + R.need.peakYear + ' (first shortfall ' + S.meta.projYears[R.need.firstIdx] + '). See the Cash need tab.' });
    if (!(R.V.wacc > R.V.g)) c.push({ level: 'critical', msg: 'Discount rate must exceed terminal growth.' });
    if (R.V.tvShareG > 0.75) c.push({ level: 'warning', msg: 'Terminal value is ' + (R.V.tvShareG * 100).toFixed(0) + '% of EV (Gordon).' });
    if (Math.abs(R.V.impliedG - R.V.g) > 0.015 && isFinite(R.V.impliedG)) c.push({ level: 'warning', msg: 'Exit multiple implies ' + (R.V.impliedG * 100).toFixed(1) + '% perpetual growth vs ' + (R.V.g * 100).toFixed(1) + '% assumed.' });
    R.checks = c;
    return R;
  }

  /* ---------- sample: Iranian-style by-function statements (illustrative) ---------- */
  function sample() {
    var S = { version: 1, tool: 'company',
      meta: { company: 'Sample Manufacturing Co. (illustrative)', currency: 'IRR', unit: 'billion', histYears: ['FY1402', 'FY1403', 'FY1404'], projYears: ['FY1405E', 'FY1406E', 'FY1407E', 'FY1408E', 'FY1409E'], standard: 'Iranian accounting standards (by function)', notes: 'Illustrative figures only.' },
      settings: { scenario: 'base', basis: 'real', midYear: true, gordonWeight: 0.5, daMode: 'embedded' },
      is: [
        line('درآمدهای عملیاتی — فروش داخلی', 'revenue', [33000, 45500, 60000], 'IS'), line('درآمدهای عملیاتی — صادرات', 'revenue', [9000, 13000, 19000], 'IS'),
        line('بهای تمام شده درآمدهای عملیاتی', 'cogs', [29400, 40365, 53720], 'IS'), line('سود ناخالص', 'skip', [12600, 18135, 25280], 'IS'),
        line('هزینه‌های فروش، اداری و عمومی', 'opex', [4620, 6318, 8374], 'IS'), line('سایر درآمدها و هزینه‌های عملیاتی', 'otherOp', [-200, 150, 120], 'IS'),
        line('هزینه‌های مالی', 'interestExp', [1150, 1420, 1700], 'IS'), line('سایر درآمدها و هزینه‌های غیرعملیاتی', 'nonOp', [210, 300, 420], 'IS'),
        line('مالیات بر درآمد', 'tax', [1210, 2712, 3937], 'IS'), line('استهلاک (یادداشت، داخل بهای تمام شده و هزینه‌ها)', 'da', [1680, 2100, 2600], 'IS')
      ],
      bs: [
        line('موجودی نقد', 'cash', [3900, 5200, 6500], 'BS'), line('سرمایه‌گذاری‌های کوتاه‌مدت', 'nonOpA', [800, 900, 1000], 'BS'),
        line('دریافتنی‌های تجاری و سایر دریافتنی‌ها', 'nwcA', [7000, 9800, 13000], 'BS'), line('موجودی مواد و کالا', 'nwcA', [6400, 8900, 11800], 'BS'),
        line('پیش‌پرداخت‌ها', 'nwcA', [1300, 1800, 2400], 'BS'), line('دارایی‌های ثابت مشهود', 'ppe', [18500, 21000, 24000], 'BS'),
        line('دارایی‌های نامشهود', 'opA', [600, 650, 700], 'BS'), line('سرمایه‌گذاری‌های بلندمدت', 'nonOpA', [1400, 1600, 1800], 'BS'),
        line('جمع دارایی‌ها', 'skip', [0, 0, 0], 'BS'),
        line('پرداختنی‌های تجاری و سایر پرداختنی‌ها', 'nwcL', [4900, 6700, 8800], 'BS'), line('مالیات پرداختنی', 'nwcL', [900, 1300, 1700], 'BS'),
        line('پیش‌دریافت‌ها', 'nwcL', [800, 1100, 1400], 'BS'), line('سود سهام پرداختنی', 'debtLike', [600, 900, 1200], 'BS'),
        line('تسهیلات مالی کوتاه‌مدت', 'debt', [3600, 4000, 4200], 'BS'), line('تسهیلات مالی بلندمدت', 'debt', [6200, 6500, 6800], 'BS'),
        line('ذخیره مزایای پایان خدمت کارکنان', 'debtLike', [700, 850, 1000], 'BS'),
        line('سرمایه', 'equity', [10000, 10000, 10000], 'BS'), line('اندوخته قانونی', 'equity', [1000, 1000, 1000], 'BS'), line('سود انباشته', 'retained', [0, 0, 0], 'BS'),
        line('منافع فاقد حق کنترل', 'minority', [500, 550, 600], 'BS')
      ],
      cfs: { capex: [4100, 4600, 5600], dividends: [1500, 1800, 2800] },
      capex: { m: 'pctRev', d: rep(0.06) },
      fin: { debtChange: rep(0), equityRaise: rep(0), payout: 0.3, minCash: 2000 },
      need: { minMode: 'pctCA', minPct: 0.1, rate: 0.30, buffer: 0.1 },
      overlay: { upside: { growthD: rep(0.02), cogsD: rep(-0.01), opexD: rep(-0.005), capexD: rep(0), daysD: rep(-5) }, downside: { growthD: rep(-0.03), cogsD: rep(0.02), opexD: rep(0.005), capexD: rep(0.005), daysD: rep(10) } },
      wacc: { rf: 0.28, erp: 0.08, crp: 0, sizePremium: 0.02, betaMode: 'relever', betaLevered: 1, betaUnlevered: 0.9, kdPreTax: 0.30, taxRate: 0.25, debtWeight: 0.25, inflation: 0.25 },
      tv: { base: { g: 0.02, mult: 8 }, upside: { g: 0.025, mult: 9 }, downside: { g: 0.01, mult: 6.5 } },
      bridge: { otherAssets: 0, otherClaims: 0, sharesMn: 10000, price: 14000 },
      sens: { waccStep: 0.01, gStep: 0.005, multStep: 1 }, sources: {} };
    // retained earnings as the balancing figure of the illustrative balance sheet
    var H = histAgg(S), ret = S.bs.filter(function (l) { return l.role === 'retained'; })[0];
    ret.hist = H.check.map(function (x) { return Math.round(x); });
    return seed(S);
  }
  function blank() {
    var s = sample(); s.meta.company = 'New company'; s.meta.notes = '';
    s.is = [line('Revenue', 'revenue', [0, 0, 0], 'IS'), line('Cost of sales', 'cogs', [0, 0, 0], 'IS'), line('Operating expenses', 'opex', [0, 0, 0], 'IS'), line('Depreciation & amortisation (memo)', 'da', [0, 0, 0], 'IS'),
      line('Finance costs', 'interestExp', [0, 0, 0], 'IS'), line('Income tax', 'tax', [0, 0, 0], 'IS')];
    s.bs = [line('Cash', 'cash', [0, 0, 0], 'BS'), line('Trade receivables', 'nwcA', [0, 0, 0], 'BS'), line('Inventory', 'nwcA', [0, 0, 0], 'BS'), line('Fixed assets', 'ppe', [0, 0, 0], 'BS'),
      line('Trade payables', 'nwcL', [0, 0, 0], 'BS'), line('Borrowings', 'debt', [0, 0, 0], 'BS'), line('Share capital', 'equity', [0, 0, 0], 'BS'), line('Retained earnings', 'retained', [0, 0, 0], 'BS')];
    s.cfs = { capex: [0, 0, 0], dividends: [0, 0, 0] }; s.bridge.sharesMn = 0; s.bridge.price = 0;
    return s;
  }
  // parse a pasted block: "label <tab> y1 <tab> y2 <tab> y3" -> lines
  function parseBlock(text, st, nYears) {
    var U = Hub.util, out = [];
    String(text).replace(/\r/g, '').split('\n').forEach(function (row) {
      if (!row.trim()) return;
      var cells = row.split('\t');
      if (cells.length < 2) cells = row.split(/\s{2,}/);
      var nums = [], label = [];
      cells.forEach(function (c) { var v = U.parseNum(c); if (c.trim() !== '' && isFinite(v) && /[\d۰-۹٠-٩]/.test(c)) nums.push(v); else if (c.trim()) label.push(c.trim()); });
      if (!label.length || !nums.length) return;
      var hist = nums.slice(-nYears); while (hist.length < nYears) hist.unshift(0);
      var role = suggestRole(label.join(' '), st);
      if (ROLES[role].cost) hist = hist.map(Math.abs);
      out.push(line(label.join(' '), role, hist, st));
    });
    return out;
  }

  /* ---------- Excel ---------- */
  function build(ExcelJS, S, R) {
    var X = Hub.xl, L = X.L, b = X.book(ExcelJS), cur = S.meta.currency, ut = cur + ' ' + S.meta.unit + 's', nH = S.meta.histYears.length;
    var sum = b.sheet('Summary', [2, 46, 16, 16, 16]), A = b.sheet('Assumptions', [2, 46, 10, 13, 13, 13, 13, 13, 3, 40]), D = b.sheet('Drivers', [2, 44, 12, 22, 8, 12, 12, 12, 12, 12, 3, 12, 12, 12]);
    var Fs = b.sheet('Financials', [2, 46, 10].concat(new Array(nH + N).fill(13))), C = b.sheet('Calculations', [2, 44, 10, 14, 14, 14, 14, 14, 3, 40]), CN = b.sheet('Cash need', [2, 50, 10, 14, 14, 14, 14, 14, 3, 44]), Sn = b.sheet('Sensitivity', [2, 18, 13, 13, 13, 13, 13]);
    /* Assumptions */
    A.title('Assumptions', S.meta.company + ' · ' + ut + ' · blue = input'); var a = {}, r = 4;
    function sc(key, label, unit, v, fmt, note) { A.put(1, r, label); A.put(2, r, unit, 'unit'); A.put(3, r, v, 'in', fmt); if (note) A.put(9, r, note, 'sub'); a[key] = A.ref(3, r); r++; }
    function row5(key, label, unit, arr, fmt) { A.put(1, r, label); A.put(2, r, unit, 'unit'); for (var t = 0; t < N; t++) A.put(3 + t, r, num(arr[t]), 'in', fmt); a[key] = r; r++; }
    A.sec(r++, 'General', 9);
    sc('unit', 'Monetary unit', '', S.meta.unit); sc('scen', 'Scenario (1 Base, 2 Upside, 3 Downside)', '#', ['base', 'upside', 'downside'].indexOf(S.settings.scenario) + 1, 'int', 'Switches the whole workbook');
    sc('real', 'Basis (1 Real, 0 Nominal)', '#', S.settings.basis === 'real' ? 1 : 0, 'int'); sc('mid', 'Mid-year discounting (1/0)', '#', S.settings.midYear ? 1 : 0, 'int');
    sc('emb', 'D&A embedded in cost of sales / opex (1) or separate line (0)', '#', S.settings.daMode === 'separate' ? 0 : 1, 'int'); sc('gw', 'Weight on Gordon method', '%', num(S.settings.gordonWeight), 'pct');
    r++; A.sec(r++, 'Cost of capital', 9); var w = S.wacc;
    sc('rf', 'Risk-free rate (nominal)', '%', num(w.rf), 'pct2'); sc('erp', 'Equity risk premium', '%', num(w.erp), 'pct2'); sc('crp', 'Country risk premium', '%', num(w.crp), 'pct2'); sc('size', 'Size / specific premium', '%', num(w.sizePremium), 'pct2');
    sc('bmode', 'Beta method (1 relever, 0 levered)', '#', w.betaMode === 'relever' ? 1 : 0, 'int'); sc('bl', 'Levered beta', 'x', num(w.betaLevered), 'dec'); sc('bu', 'Unlevered beta', 'x', num(w.betaUnlevered), 'dec');
    sc('kd', 'Pre-tax cost of debt (nominal)', '%', num(w.kdPreTax), 'pct2'); sc('tx', 'Tax rate for WACC', '%', num(w.taxRate), 'pct'); sc('wd', 'Target D / (D + E)', '%', num(w.debtWeight), 'pct'); sc('inf', 'Expected inflation', '%', num(w.inflation), 'pct2');
    sc('kem', 'Cost of equity: 1 my number, 0 computed (CAPM)', '#', w.keMode === 'manual' ? 1 : 0, 'int'); sc('keo', 'My cost of equity (nominal)', '%', num(w.keManual), 'pct2');
    sc('wm', 'WACC: 1 my number, 0 computed', '#', w.waccMode === 'manual' ? 1 : 0, 'int'); sc('wo', 'My WACC (nominal)', '%', num(w.waccManual), 'pct2');
    r++; A.sec(r++, 'Financing and capex', 9, S.meta.projYears);
    row5('dd', 'Net debt issued / (repaid) — first borrowing line', ut, S.fin.debtChange, 'money'); row5('er', 'New equity raised — first capital line', ut, S.fin.equityRaise, 'money');
    sc('pay', 'Dividend payout (% of positive NI)', '%', num(S.fin.payout), 'pct'); sc('minc', 'Minimum cash (fixed amount)', ut, num(S.fin.minCash), 'money');
    needDefaults(S);
    sc('nmode', 'Minimum cash method (1 amount, 2 % non-cash current assets, 3 % revenue)', '#', { amount: 1, pctCA: 2, pctRev: 3 }[S.need.minMode] || 1, 'int', 'Cash need sheet');
    sc('npct', 'Minimum cash % (methods 2 and 3)', '%', num(S.need.minPct), 'pct'); sc('nrate', 'Rate on funding facility (nominal, pre-tax)', '%', num(S.need.rate), 'pct2'); sc('nbuf', 'Buffer on peak funding need', '%', num(S.need.buffer), 'pct');
    sc('cxm', 'Capex method (1 % of revenue, 0 amount)', '#', S.capex.m === 'manual' ? 0 : 1, 'int'); row5('cx', 'Capex driver (% revenue or amount)', S.capex.m === 'manual' ? ut : '%', S.capex.d, S.capex.m === 'manual' ? 'money' : 'pct');
    r++; A.sec(r++, 'Scenario overlays (applied to Base drivers)', 9, S.meta.projYears);
    var ovRow = {};
    OVR.forEach(function (o) { ['upside', 'downside'].forEach(function (k) { row5('o_' + o[0] + k, o[1] + ' · ' + k, o[2] === 'days' ? 'days' : 'pp', S.overlay[k][o[0]], o[2] === 'days' ? 'dec' : 'pct2'); }); });
    OVR.forEach(function (o) {
      A.put(1, r, o[1] + ' · active');
      for (var t = 0; t < N; t++) A.put(3 + t, r, { f: '=CHOOSE(' + a.scen + ',0,' + L(3 + t) + a['o_' + o[0] + 'upside'] + ',' + L(3 + t) + a['o_' + o[0] + 'downside'] + ')' }, 'calc', o[2] === 'days' ? 'dec' : 'pct2');
      ovRow[o[0]] = r; r++;
    });
    r++; A.sec(r++, 'Terminal value', 9, ['Base', 'Upside', 'Downside']);
    A.put(1, r, 'Perpetual growth'); ['base', 'upside', 'downside'].forEach(function (k, j) { A.put(3 + j, r, num(S.tv[k].g), 'in', 'pct2'); }); var gr = r; r++;
    A.put(1, r, 'Exit EV / EBITDA'); ['base', 'upside', 'downside'].forEach(function (k, j) { A.put(3 + j, r, num(S.tv[k].mult), 'in', 'x'); }); var mr = r; r++;
    var xr = { mult: mr };
    [['evEbit', 'Exit EV / EBIT'], ['evSales', 'Exit EV / Sales'], ['pe', 'Exit P / E'], ['ps', 'Exit P / S'], ['pb', 'Exit P / B']].forEach(function (x) {
      A.put(1, r, x[1]); ['base', 'upside', 'downside'].forEach(function (k, j) { A.put(3 + j, r, num(S.tv[k][x[0]]), 'in', 'x'); }); xr[x[0]] = r; r++; });
    var M = methodOf(S);
    sc('cf', 'Cash flow (1 FCFF at WACC — best practice, 0 FCFE at cost of equity)', '#', M.cf === 'fcfe' ? 0 : 1, 'int', 'Method choice');
    sc('tvr', 'Terminal-value rate (1 same rate — best practice, 0 risk-free — house)', '#', M.tvRate === 'rf' ? 0 : 1, 'int');
    sc('gb', 'Growth input (0 as entered, 1 real → Fisher, 2 real + inflation — house)', '#', M.gBuild === 'fisher' ? 1 : M.gBuild === 'additive' ? 2 : 0, 'int');
    sc('xff', 'FCFF exit multiple (1 EV/EBITDA, 2 EV/EBIT, 3 EV/Sales)', '#', { evEbitda: 1, evEbit: 2, evSales: 3 }[M.exitFcff] || 1, 'int');
    sc('xfe', 'FCFE exit multiple (1 P/E, 2 P/S, 3 P/B, 4 EV/EBITDA less net debt)', '#', { pe: 1, ps: 2, pb: 3, evEbitda: 4 }[M.exitFcfe] || 1, 'int');
    A.put(1, r, 'Growth as entered (active)'); A.put(3, r, { f: '=CHOOSE(' + a.scen + ',D' + gr + ',E' + gr + ',F' + gr + ')' }, 'calc', 'pct2'); a.gIn = A.ref(3, r); r++;
    A.put(1, r, 'Active growth (used)'); A.put(3, r, { f: '=IF(OR(' + a.gb + '=0,' + a.real + '=1),' + a.gIn + ',IF(' + a.gb + '=1,(1+' + a.gIn + ')*(1+' + a.inf + ')-1,' + a.gIn + '+' + a.inf + '))' }, 'calc', 'pct2'); a.g = A.ref(3, r); r++;
    var act = {};
    Object.keys(xr).forEach(function (k) { A.put(1, r, 'Active · ' + (EXITS[k === 'mult' ? 'evEbitda' : k].label)); A.put(3, r, { f: '=CHOOSE(' + a.scen + ',D' + xr[k] + ',E' + xr[k] + ',F' + xr[k] + ')' }, 'calc', 'x'); act[k] = A.ref(3, r); r++; });
    A.put(1, r, 'Active FCFF exit multiple', 'total'); A.put(3, r, { f: '=CHOOSE(' + a.xff + ',' + act.mult + ',' + act.evEbit + ',' + act.evSales + ')' }, 'total', 'x'); a.mult = A.ref(3, r); r++;
    A.put(1, r, 'Active FCFE exit multiple', 'total'); A.put(3, r, { f: '=CHOOSE(' + a.xfe + ',' + act.pe + ',' + act.ps + ',' + act.pb + ',' + act.mult + ')' }, 'total', 'x'); a.multE = A.ref(3, r); r++;
    r++; A.sec(r++, 'Bridge and per share', 9);
    sc('oa', 'Other non-operating assets (not on BS lines)', ut, num(S.bridge.otherAssets), 'money'); sc('oc', 'Other debt-like claims (not on BS lines)', ut, num(S.bridge.otherClaims), 'money');
    sc('sh', 'Diluted shares', 'mn', num(S.bridge.sharesMn), 'money2'); sc('px', 'Current share price', cur, num(S.bridge.price), 'money2');
    sc('ws', 'Sensitivity WACC step', '%', num(S.sens.waccStep), 'pct2'); sc('gs', 'Sensitivity growth step', '%', num(S.sens.gStep), 'pct2'); sc('ms', 'Sensitivity multiple step', 'x', num(S.sens.multStep), 'dec');
    function av(key, t) { return "'Assumptions'!" + L(3 + t) + '$' + a[key]; }
    function ovr(key, t) { return "'Assumptions'!" + L(3 + t) + '$' + ovRow[key]; }

    /* Drivers: one row per line with a driver */
    D.title('Line drivers (Base)', 'Each line’s forecast method and Base driver; Upside / Downside overlays sit on Assumptions');
    D.sec(4, 'Line', 13, ['Role', 'Method', 'Unit'].concat(S.meta.projYears).concat(['']).concat(S.meta.histYears.map(function (y) { return y + ' A'; })), 2);
    var drow = {}, dr = 5, H = R.H;
    S.is.concat(S.bs).forEach(function (l) {
      D.put(1, dr, l.name); D.put(2, dr, l.role); D.put(3, dr, METHODS[l.m] ? METHODS[l.m].label : l.m); var mu = METHODS[l.m] ? METHODS[l.m].unit : ''; D.put(4, dr, mu === 'amt' ? ut : mu, 'unit');
      if (HAS_DRIVER[l.m]) { for (var t = 0; t < N; t++) D.put(5 + t, dr, num(l.d[t]), 'in', METHODS[l.m].pct ? 'pct2' : mu === 'days' ? 'dec' : 'money'); }
      for (var i = 0; i < nH; i++) { var hr = histRatio(S, H, l, i); D.put(11 + i, dr, isFinite(hr) && HAS_DRIVER[l.m] ? hr : null, null, METHODS[l.m] && METHODS[l.m].pct ? 'pct2' : mu === 'days' ? 'dec' : 'money'); }
      drow[l.id] = dr; dr++;
    });
    dr++;
    var sumRow = {};
    ['cogs', 'opex'].forEach(function (role) {
      D.put(1, dr, 'Σ ' + role + ' drivers on % of revenue');
      for (var t = 0; t < N; t++) D.put(5 + t, dr, { f: '=SUMPRODUCT(($C$5:$C$' + (dr - 2) + '="' + role + '")*($D$5:$D$' + (dr - 2) + '="' + METHODS.pctRev.label + '")*' + L(5 + t) + '$5:' + L(5 + t) + '$' + (dr - 2) + ')' }, 'calc', 'pct2');
      sumRow[role] = dr; dr++;
    });
    function dv(l, t) { return "'Drivers'!" + L(5 + t) + '$' + drow[l.id]; }

    /* Financials: assign rows first */
    var H0 = 3, P0 = 3 + nH, lastH = H0 + nH - 1, lastP = P0 + N - 1;
    Fs.title('Financial statements', ut + ' · ' + S.meta.standard + ' · historical inputs and projection');
    Fs.put(1, 4, 'Line item', 'hdr'); Fs.put(2, 4, 'Role', 'hdr');
    S.meta.histYears.forEach(function (y, i) { Fs.put(H0 + i, 4, y + ' A', 'hdr'); }); S.meta.projYears.forEach(function (y, i) { Fs.put(P0 + i, 4, y, 'hdr'); });
    var fr = {}, rr = 5, plan = [];
    function slot(key, label, kind) { fr[key] = rr; plan.push({ key: key, label: label, kind: kind, row: rr }); rr++; }
    slot('_h_is', 'Income statement', 'sec');
    S.is.forEach(function (l) { slot(l.id, l.name, 'line'); });
    rr++; slot('_h_sub', 'Key subtotals', 'sec');
    [['revenue', 'Revenue'], ['cogs', 'Cost of sales'], ['gp', 'Gross profit'], ['opex', 'Operating expenses'], ['otherOp', 'Other operating, net'], ['ebit', 'Operating profit (EBIT)'], ['da', 'Depreciation & amortisation'],
      ['ebitda', 'EBITDA'], ['ie', 'Finance costs'], ['nonOp', 'Other non-operating, net'], ['ebt', 'Profit before tax'], ['tax', 'Income tax'], ['ni', 'Net income'], ['ebitdaM', 'EBITDA margin']].forEach(function (x) { slot('_' + x[0], x[1], 'sub'); });
    rr++; slot('_h_bs', 'Balance sheet', 'sec');
    var kindOf = function (l) { return ROLES[l.role].kind || 'X'; };
    ['A', 'L', 'E'].forEach(function (k) {
      S.bs.filter(function (l) { return kindOf(l) === k; }).forEach(function (l) { slot(l.id, l.name, 'line'); });
      slot('_t' + k, { A: 'Total assets', L: 'Total liabilities', E: 'Total equity' }[k], 'sub');
    });
    slot('_tle', 'Total liabilities and equity', 'sub'); slot('_chk', 'Check: assets − liabilities − equity', 'sub');
    var skips = S.bs.filter(function (l) { return l.role === 'skip'; }); skips.forEach(function (l) { slot(l.id, l.name + ' (ignored)', 'line'); });
    rr++; slot('_h_memo', 'Memo and cash flow', 'sec');
    [['nwc', 'Operating net working capital'], ['capex', 'Capital expenditure'], ['div', 'Dividends'], ['cfo', 'Cash from operations'], ['cfi', 'Cash from investing'], ['cff', 'Cash from financing'], ['net', 'Net change in cash'], ['ccheck', 'Check: cash flow − change in cash']].forEach(function (x) { slot('_' + x[0], x[1], 'sub'); });

    // role totals used by formulas: allocate rows now, write them after the lines
    var helpers = [['cashT', 'cash'], ['debtT', 'debt'], ['ppeT', 'ppe'], ['opAT', 'opA'], ['opLT', 'opL'], ['nonOpAT', 'nonOpA'], ['dlT', 'debtLike'], ['eqT', 'equity'], ['miT', 'minority']];
    rr++; var helpHead = rr; rr++;
    helpers.forEach(function (x) { fr['_' + x[0]] = rr; rr++; });
    function rowsOf(pred, arr) { return arr.filter(pred).map(function (l) { return fr[l.id]; }); }
    function sumExpr(rows, c) { return rows.length ? rows.map(function (x) { return L(c) + x; }).join('+') : '0'; }
    var R_ = function (role, arr) { return rowsOf(function (l) { return l.role === role; }, arr || S.is.concat(S.bs)); };
    var firstOf = function (role, arr) { return arr.filter(function (l) { return l.role === role; })[0]; };
    var cashL = firstOf('cash', S.bs), ppeL = firstOf('ppe', S.bs), debtL = firstOf('debt', S.bs), eqL = firstOf('equity', S.bs), retL = firstOf('retained', S.bs), taxL = firstOf('tax', S.is);
    var ieFirst = firstOf('interestExp', S.is);
    var fis = function (x) { return 'IF(' + a.real + '=1,(1+' + x + ')/(1+' + a.inf + ')-1,' + x + ')'; };
    function sub(key, c) { return L(c) + fr['_' + key]; }
    function prevSub(key, c) { return L(c - 1) + fr['_' + key]; }

    // write plan
    plan.forEach(function (p) {
      if (p.kind === 'sec') { Fs.put(1, p.row, p.label, 'sec'); Fs.band(p.row, 1, lastP, 'sec'); return; }
      Fs.put(1, p.row, p.label, p.kind === 'sub' ? 'total' : null);
    });
    S.is.concat(S.bs).forEach(function (l) {
      var row = fr[l.id]; Fs.put(2, row, l.role, 'unit');
      for (var i = 0; i < nH; i++) Fs.put(H0 + i, row, num(l.hist[i]), 'in', 'money');
      for (var t = 0; t < N; t++) {
        var c = P0 + t, P = L(c - 1) + row, d = dv(l, t), f;
        switch (l.role) {
          case 'revenue': f = l.m === 'manual' ? '=' + d : '=' + P + '*(1+' + d + '+' + ovr('growthD', t) + ')'; break;
          case 'cogs': case 'opex':
            var sr = "'Drivers'!" + L(5 + t) + '$' + sumRow[l.role], ok = ovr(l.role === 'cogs' ? 'cogsD' : 'opexD', t);
            f = l.m === 'pctRev' ? '=' + sub('revenue', c) + '*' + d + '*IF(' + sr + '=0,1,1+' + ok + '/' + sr + ')' : l.m === 'growth' ? '=' + P + '*(1+' + d + ')' : '=' + d; break;
          case 'otherOp': f = l.m === 'pctRev' ? '=' + sub('revenue', c) + '*' + d : l.m === 'flat' ? '=' + P : l.m === 'zero' ? '=0' : '=' + d; break;
          case 'da': f = l.m === 'pctPPE' ? '=' + prevSub('ppeT', c) + '*' + d : l.m === 'pctRev' ? '=' + sub('revenue', c) + '*' + d : '=' + d; break;
          case 'interestExp': f = l.m === 'onDebt' ? (l === ieFirst ? '=' + prevSub('debtT', c) + '*' + fis(d) : '=0') : '=' + d; break;
          case 'nonOp': f = l.m === 'onCash' ? '=' + prevSub('cashT', c) + '*' + fis(d) : l.m === 'flat' ? '=' + P : l.m === 'zero' ? '=0' : '=' + d; break;
          case 'tax': f = l === taxL ? '=MAX(0,' + sub('ebt', c) + ')*' + d : '=0'; break;
          case 'skip': f = null; break;
          case 'cash': f = l === cashL ? '=' + sub('tL', c) + '+' + sub('tE', c) + '-(' + sumExpr(rowsOf(function (x) { return kindOf(x) === 'A' && x !== cashL; }, S.bs), c) + ')' : '=' + P; break;
          default:
            switch (l.m) {
              case 'daysRev': f = '=' + sub('revenue', c) + '*(' + d + (l.role === 'nwcA' ? '+' + ovr('daysD', t) : '') + ')/365'; break;
              case 'daysCogs': f = '=' + sub('cogs', c) + '*(' + d + (l.role === 'nwcA' ? '+' + ovr('daysD', t) : '') + ')/365'; break;
              case 'pctRev': f = '=' + sub('revenue', c) + '*' + d; break;
              case 'pctCogs': f = '=' + sub('cogs', c) + '*' + d; break;
              case 'growth': f = '=' + P + '*(1+' + d + ')'; break;
              case 'manual': f = '=' + d; break;
              case 'roll': f = l === ppeL ? '=' + P + '+' + sub('capex', c) + '-' + sub('da', c) : l === retL ? '=' + P + '+' + sub('ni', c) + '-' + sub('div', c) : '=' + P; break;
              case 'schedule': f = l === debtL ? '=' + P + '+' + av('dd', t) : '=' + P; break;
              default: f = '=' + P;
            }
            if (l === eqL) f += '+' + av('er', t);
        }
        if (f) Fs.put(c, row, { f: f }, 'calc', 'money');
      }
    });
    // subtotals (historical and projected share formulas)
    var all = S.is.concat(S.bs);
    function subF(c) {
      var o = {};
      o.revenue = '=' + sumExpr(R_('revenue', S.is), c); o.cogs = '=' + sumExpr(R_('cogs', S.is), c); o.gp = '=' + sub('revenue', c) + '-' + sub('cogs', c);
      o.opex = '=' + sumExpr(R_('opex', S.is), c); o.otherOp = '=' + sumExpr(R_('otherOp', S.is), c); o.da = '=' + sumExpr(R_('da', S.is), c);
      o.ebit = '=' + sub('gp', c) + '-' + sub('opex', c) + '+' + sub('otherOp', c) + '-IF(' + a.emb + '=1,0,' + sub('da', c) + ')';
      o.ebitda = '=' + sub('ebit', c) + '+' + sub('da', c); o.ie = '=' + sumExpr(R_('interestExp', S.is), c); o.nonOp = '=' + sumExpr(R_('nonOp', S.is), c);
      o.ebt = '=' + sub('ebit', c) + '-' + sub('ie', c) + '+' + sub('nonOp', c); o.tax = '=' + sumExpr(R_('tax', S.is), c); o.ni = '=' + sub('ebt', c) + '-' + sub('tax', c);
      o.ebitdaM = '=IF(' + sub('revenue', c) + '=0,0,' + sub('ebitda', c) + '/' + sub('revenue', c) + ')';
      ['A', 'L', 'E'].forEach(function (k) { o['t' + k] = '=' + sumExpr(rowsOf(function (x) { return kindOf(x) === k; }, S.bs), c); });
      o.tle = '=' + sub('tL', c) + '+' + sub('tE', c); o.chk = '=ROUND(' + sub('tA', c) + '-' + sub('tle', c) + ',4)';
      o.nwc = '=' + sumExpr(R_('nwcA', S.bs), c) + '-(' + sumExpr(R_('nwcL', S.bs), c) + ')';
      return o;
    }
    // hidden helper rows: role totals used by formulas (cashT, debtT, ppeT)
    Fs.put(1, helpHead, 'Role totals used by formulas', 'sec'); Fs.band(helpHead, 1, lastP, 'sec');
    helpers.forEach(function (x) { var hr = fr['_' + x[0]]; Fs.put(1, hr, x[1] + ' (total)'); for (var c = H0; c <= lastP; c++) Fs.put(c, hr, { f: '=' + sumExpr(R_(x[1], S.bs), c) }, 'calc', 'money'); });
    for (var c = H0; c <= lastP; c++) {
      var o = subF(c), proj = c >= P0;
      Object.keys(o).forEach(function (k) { if (fr['_' + k]) Fs.put(c, fr['_' + k], { f: o[k] }, k === 'ni' || k === 'ebitda' || k === 'tle' ? 'total' : 'calc', k === 'ebitdaM' ? 'pct' : k === 'chk' ? 'money2' : 'money'); });
      if (proj) {
        var t = c - P0;
        Fs.put(c, fr._capex, { f: '=IF(' + a.cxm + '=1,' + sub('revenue', c) + '*(' + av('cx', t) + '+' + ovr('capexD', t) + '),' + av('cx', t) + ')' }, 'calc', 'money');
        Fs.put(c, fr._div, { f: '=MAX(0,' + sub('ni', c) + ')*' + a.pay }, 'calc', 'money');
        Fs.put(c, fr._cfo, { f: '=' + sub('ni', c) + '+' + sub('da', c) + '-(' + sub('nwc', c) + '-' + prevSub('nwc', c) + ')-(' + sub('opAT', c) + '-' + prevSub('opAT', c) + ')+(' + sub('opLT', c) + '-' + prevSub('opLT', c) + ')' }, 'calc', 'money');
        Fs.put(c, fr._cfi, { f: '=-' + sub('capex', c) + '-(' + sub('nonOpAT', c) + '-' + prevSub('nonOpAT', c) + ')-(' + sub('ppeT', c) + '-' + prevSub('ppeT', c) + '-' + sub('capex', c) + '+' + sub('da', c) + ')' }, 'calc', 'money');
        Fs.put(c, fr._cff, { f: '=(' + sub('debtT', c) + '-' + prevSub('debtT', c) + ')+(' + sub('dlT', c) + '-' + prevSub('dlT', c) + ')+(' + sub('eqT', c) + '-' + prevSub('eqT', c) + ')+(' + sub('miT', c) + '-' + prevSub('miT', c) + ')-' + sub('div', c) }, 'calc', 'money');
        Fs.put(c, fr._net, { f: '=' + sub('cfo', c) + '+' + sub('cfi', c) + '+' + sub('cff', c) }, 'total', 'money');
        Fs.put(c, fr._ccheck, { f: '=ROUND(' + sub('net', c) + '-(' + sub('cashT', c) + '-' + prevSub('cashT', c) + '),4)' }, 'calc', 'money2');
      } else {
        var i = c - H0; Fs.put(c, fr._capex, num(S.cfs.capex[i]) || null, 'in', 'money'); Fs.put(c, fr._div, num(S.cfs.dividends[i]) || null, 'in', 'money');
      }
    }
    /* Calculations */
    C.title('Calculations', 'Discount rate, unlevered free cash flow, terminal value, equity bridge');
    var cc = {}; function cr(row, key, label, f, fmt, kind, note) { C.put(1, row, label, kind); C.put(3, row, { f: f }, kind || 'calc', fmt); if (note) C.put(9, row, note, 'sub'); cc[key] = '$D$' + row; }
    C.sec(4, 'Discount rate', 9);
    cr(5, 'de', 'Debt / equity', '=IF(1-' + a.wd + '=0,0,' + a.wd + '/(1-' + a.wd + '))', 'pct'); cr(6, 'bl', 'Levered beta', '=IF(' + a.bmode + '=1,' + a.bu + '*(1+(1-' + a.tx + ')*D5),' + a.bl + ')', 'dec3');
    cr(7, 'ke', 'Cost of equity (computed or my number)', '=IF(' + a.kem + '=1,' + a.keo + ',' + a.rf + '+D6*' + a.erp + '+' + a.crp + '+' + a.size + ')', 'pct2'); cr(8, 'wn', 'WACC nominal (computed or my number)', '=IF(' + a.wm + '=1,' + a.wo + ',(1-' + a.wd + ')*D7+' + a.wd + '*' + a.kd + '*(1-' + a.tx + '))', 'pct2');
    cr(9, 'wr', 'WACC real', '=(1+D8)/(1+' + a.inf + ')-1', 'pct2'); cr(10, 'w', 'Discount rate used', '=IF(' + a.real + '=1,D9,D8)', 'pct2', 'total');
    C.sec(12, 'Unlevered free cash flow', 9, S.meta.projYears);
    var fc = {}, rw = 13;
    function fRow(key, label, fn, fmt, kind) { C.put(1, rw, label, kind); for (var t = 0; t < N; t++) C.put(3 + t, rw, { f: fn(t, L(P0 + t), L(P0 + t - 1)) }, kind || 'calc', fmt || 'money'); fc[key] = rw; rw++; }
    var FS = "'Financials'!";
    fRow('ebit', 'EBIT', function (t, c) { return '=' + FS + c + fr._ebit; });
    fRow('tr', 'Tax rate', function (t) { return taxL ? '=' + dv(taxL, t) : '=0'; }, 'pct');
    fRow('nopat', 'NOPAT', function (t) { return '=' + L(3 + t) + fc.ebit + '*(1-' + L(3 + t) + fc.tr + ')'; }, 'money', 'total');
    fRow('da', 'Plus: D&A', function (t, c) { return '=' + FS + c + fr._da; });
    fRow('cx', 'Less: capex', function (t, c) { return '=-' + FS + c + fr._capex; });
    fRow('dn', 'Less: increase in NWC and other operating items', function (t, c, p) { return '=-(' + FS + c + fr._nwc + '-' + FS + p + fr._nwc + ')-(' + FS + c + fr._opAT + '-' + FS + p + fr._opAT + ')+(' + FS + c + fr._opLT + '-' + FS + p + fr._opLT + ')'; });
    fRow('ufcf', 'Unlevered free cash flow', function (t) { return '=' + ['nopat', 'da', 'cx', 'dn'].map(function (k) { return L(3 + t) + fc[k]; }).join('+'); }, 'money', 'total');
    fRow('per', 'Discount period', function (t) { return '=' + (t + 1) + '-0.5*' + a.mid; }, 'dec');
    fRow('df', 'Discount factor', function (t) { return '=1/(1+$D$10)^' + L(3 + t) + fc.per; }, 'dec3');
    fRow('pv', 'PV of UFCF', function (t) { return '=' + L(3 + t) + fc.ufcf + '*' + L(3 + t) + fc.df; }, 'money', 'total');
    var t0 = rw + 1; C.sec(t0, 'Terminal value and enterprise value', 9); C.put(3, t0, 'Gordon', 'hdr'); C.put(4, t0, 'Exit multiple', 'hdr'); C.put(5, t0, 'Blended', 'hdr');
    var tv = {}; rw = t0 + 1;
    function tvRow(key, label, fg, fx, fb, fmt, kind) { C.put(1, rw, label, kind); if (fg) C.put(3, rw, { f: fg }, kind || 'calc', fmt || 'money'); if (fx) C.put(4, rw, { f: fx }, kind || 'calc', fmt || 'money'); if (fb) C.put(5, rw, { f: fb }, kind || 'calc', fmt || 'money'); tv[key] = rw; rw++; }
    tvRow('as', 'Assumption: g / multiple', '=' + a.g, '=' + a.mult); C.ws.getCell('D' + tv.as).numFmt = X.FMT.pct2; C.ws.getCell('E' + tv.as).numFmt = X.FMT.x;
    var fsL = function (k) { return FS + '$' + L(lastP) + '$' + fr['_' + k]; };
    var ndN = '(' + fsL('debtT') + '+' + fsL('dlT') + '-' + fsL('cashT') + '-' + fsL('nonOpAT') + '+' + fsL('miT') + ')', beN = '(' + fsL('tE') + '-' + fsL('miT') + ')';
    tvRow('m', 'Final-year UFCF / exit metric (EBITDA, EBIT or revenue)', '=$H$' + fc.ufcf, '=CHOOSE(' + a.xff + ',' + fsL('ebitda') + ',' + fsL('ebit') + ',' + fsL('revenue') + ')');
    var rfU = 'IF(' + a.real + '=1,(1+' + a.rf + ')/(1+' + a.inf + ')-1,' + a.rf + ')';
    tvRow('rt', 'Terminal-value discount rate (Gordon denominator)', '=IF(' + a.tvr + '=1,$D$10,' + rfU + ')', null, null, 'pct2');
    tvRow('tv', 'Terminal value', '=IF(D' + tv.rt + '>D' + tv.as + ',D' + tv.m + '*(1+D' + tv.as + ')/(D' + tv.rt + '-D' + tv.as + '),NA())', '=E' + tv.m + '*E' + tv.as);
    tvRow('pe', 'Discount period', '=' + N + '-0.5*' + a.mid, '=' + N, null, 'dec');
    tvRow('pvtv', 'PV of terminal value', '=D' + tv.tv + '/(1+$D$10)^D' + tv.pe, '=E' + tv.tv + '/(1+$D$10)^E' + tv.pe);
    tvRow('spv', 'Sum of PV of UFCF', '=SUM($D$' + fc.pv + ':$H$' + fc.pv + ')', '=SUM($D$' + fc.pv + ':$H$' + fc.pv + ')');
    tvRow('ev', 'Enterprise value', '=D' + tv.spv + '+D' + tv.pvtv, '=E' + tv.spv + '+E' + tv.pvtv, '=' + a.gw + '*D' + rw + '+(1-' + a.gw + ')*E' + rw, 'money', 'total');
    var lh = function (k) { return FS + '$' + L(lastH) + '$' + fr['_' + k]; };
    tvRow('debt', 'Less: borrowings', '=-' + lh('debtT'), '=-' + lh('debtT'), '=-' + lh('debtT'));
    tvRow('dl', 'Less: debt-like items', '=-' + lh('dlT'), '=-' + lh('dlT'), '=-' + lh('dlT'));
    tvRow('cash', 'Plus: cash', '=' + lh('cashT'), '=' + lh('cashT'), '=' + lh('cashT'));
    tvRow('noa', 'Plus: non-operating assets', '=' + lh('nonOpAT') + '+' + a.oa, '=' + lh('nonOpAT') + '+' + a.oa, '=' + lh('nonOpAT') + '+' + a.oa);
    tvRow('mi', 'Less: non-controlling interest', '=-' + lh('miT'), '=-' + lh('miT'), '=-' + lh('miT'));
    tvRow('oc', 'Less: other claims', '=-' + a.oc, '=-' + a.oc, '=-' + a.oc);
    tvRow('eq', 'Equity value', '=SUM(D' + tv.ev + ':D' + tv.oc + ')', '=SUM(E' + tv.ev + ':E' + tv.oc + ')', '=SUM(F' + tv.ev + ':F' + tv.oc + ')', 'money', 'total');
    var uX = F.unitXl(a.unit);
    tvRow('ps', 'Value per share (' + cur + ')', '=IF(' + a.sh + '>0,D' + tv.eq + '*' + uX + '/(' + a.sh + '*1E6),NA())', '=IF(' + a.sh + '>0,E' + tv.eq + '*' + uX + '/(' + a.sh + '*1E6),NA())', '=IF(' + a.sh + '>0,F' + tv.eq + '*' + uX + '/(' + a.sh + '*1E6),NA())', 'money', 'total');
    tvRow('up', 'Upside / (downside) to price', '=IF(' + a.px + '>0,D' + tv.ps + '/' + a.px + '-1,NA())', '=IF(' + a.px + '>0,E' + tv.ps + '/' + a.px + '-1,NA())', '=IF(' + a.px + '>0,F' + tv.ps + '/' + a.px + '-1,NA())', 'pct');
    tvRow('tvs', 'Terminal value share of EV', '=D' + tv.pvtv + '/D' + tv.ev, '=E' + tv.pvtv + '/E' + tv.ev, null, 'pct');
    /* FCFE block (cost of equity) and the selected method */
    var e0 = rw + 2; C.sec(e0, 'Free cash flow to equity (FCFE) at the cost of equity', 9, S.meta.projYears); var fe = {}; rw = e0 + 1;
    cr(rw, 'keu', 'Cost of equity used', '=IF(' + a.real + '=1,(1+D7)/(1+' + a.inf + ')-1,D7)', 'pct2'); var keu = '$D$' + rw; rw++;
    function eRow(key, label, fn, fmt, kind) { C.put(1, rw, label, kind); for (var t = 0; t < N; t++) C.put(3 + t, rw, { f: fn(t, L(P0 + t), L(P0 + t - 1), L(3 + t)) }, kind || 'calc', fmt || 'money'); fe[key] = rw; rw++; }
    eRow('ni', 'Net income', function (t, c) { return '=' + FS + c + fr._ni; });
    eRow('da', 'Plus: D&A', function (t, c) { return '=' + FS + c + fr._da; });
    eRow('cx', 'Less: capex', function (t, c) { return '=-' + FS + c + fr._capex; });
    eRow('dn', 'Less: increase in NWC and other operating items', function (t, c, p2, me) { return '=' + me + fc.dn; });
    eRow('nb', 'Plus: net borrowing (debt and debt-like)', function (t, c, p2) { return '=(' + FS + c + fr._debtT + '+' + FS + c + fr._dlT + ')-(' + FS + p2 + fr._debtT + '+' + FS + p2 + fr._dlT + ')'; });
    eRow('fcfe', 'Free cash flow to equity', function (t, c, p2, me) { return '=SUM(' + me + fe.ni + ':' + me + fe.nb + ')'; }, 'money', 'total');
    eRow('pv', 'PV of FCFE', function (t, c, p2, me) { return '=' + me + fe.fcfe + '/(1+' + keu + ')^' + me + fc.per; });
    rw++; C.put(3, rw, 'Gordon', 'hdr'); C.put(4, rw, 'Exit P/E or P/S', 'hdr'); C.put(5, rw, 'Blended', 'hdr'); rw++;
    var eq = {}; function qRow(key, label, fg, fx, fb, fmt, kind) { C.put(1, rw, label, kind); if (fg) C.put(3, rw, { f: fg }, kind || 'calc', fmt || 'money'); if (fx) C.put(4, rw, { f: fx }, kind || 'calc', fmt || 'money'); if (fb) C.put(5, rw, { f: fb }, kind || 'calc', fmt || 'money'); eq[key] = rw; rw++; }
    qRow('rt', 'Terminal-value discount rate', '=IF(' + a.tvr + '=1,' + keu + ',' + rfU + ')', null, null, 'pct2');
    qRow('tv', 'Terminal value', '=IF(D' + (rw - 1) + '>' + a.g + ',$H$' + fe.fcfe + '*(1+' + a.g + ')/(D' + (rw - 1) + '-' + a.g + '),NA())',
      '=CHOOSE(' + a.xfe + ',' + fsL('ni') + ',' + fsL('revenue') + ',' + beN + ',' + fsL('ebitda') + ')*' + a.multE + '-IF(' + a.xfe + '=4,' + ndN + ',0)');
    qRow('pvtv', 'PV of terminal value', '=D' + eq.tv + '/(1+' + keu + ')^(' + N + '-0.5*' + a.mid + ')', '=E' + eq.tv + '/(1+' + keu + ')^' + N);
    qRow('spv', 'Sum of PV of FCFE', '=SUM($D$' + fe.pv + ':$H$' + fe.pv + ')', '=SUM($D$' + fe.pv + ':$H$' + fe.pv + ')');
    qRow('adj', 'Plus: cash, non-operating assets and other items, less NCI', '=' + lh('cashT') + '+' + lh('nonOpAT') + '+' + a.oa + '-' + a.oc + '-' + lh('miT'), '=' + lh('cashT') + '+' + lh('nonOpAT') + '+' + a.oa + '-' + a.oc + '-' + lh('miT'));
    qRow('eq', 'Equity value (FCFE)', '=D' + eq.spv + '+D' + eq.pvtv + '+D' + eq.adj, '=E' + eq.spv + '+E' + eq.pvtv + '+E' + eq.adj, '=' + a.gw + '*D' + rw + '+(1-' + a.gw + ')*E' + rw, 'money', 'total');
    rw++; var s0 = rw; C.sec(s0, 'Selected method (switch on Assumptions)', 9); C.put(3, s0, 'Gordon', 'hdr'); C.put(4, s0, 'Exit', 'hdr'); C.put(5, s0, 'Blended', 'hdr'); rw++;
    var sl = {}; function sRow(key, label, fn, fmt, kind) { C.put(1, rw, label, kind); ['D', 'E', 'F'].forEach(function (cl, j) { C.put(3 + j, rw, { f: fn(cl) }, kind || 'calc', fmt || 'money'); }); sl[key] = rw; rw++; }
    var ndf = '(' + lh('debtT') + '+' + lh('dlT') + '-' + lh('cashT') + '-' + lh('nonOpAT') + '-' + a.oa + '+' + a.oc + '+' + lh('miT') + ')';
    sRow('eq', 'Equity value', function (cl) { return '=IF(' + a.cf + '=1,' + cl + tv.eq + ',' + cl + eq.eq + ')'; }, 'money', 'total');
    sRow('ev', 'Enterprise value', function (cl) { return '=IF(' + a.cf + '=1,' + cl + tv.ev + ',' + cl + sl.eq + '+' + ndf + ')'; });
    sRow('ps', 'Value per share (' + cur + ')', function (cl) { return '=IF(' + a.sh + '>0,' + cl + sl.eq + '*' + uX + '/(' + a.sh + '*1E6),NA())'; }, 'money', 'total');
    sRow('up', 'Upside / (downside) to price', function (cl) { return '=IF(' + a.px + '>0,' + cl + sl.ps + '/' + a.px + '-1,NA())'; }, 'pct');
    sRow('rate', 'Discount rate of the selected method', function (cl) { return cl === 'D' ? '=IF(' + a.cf + '=1,$D$10,' + keu + ')' : '=0'; }, 'pct2');
    /* Cash need (وجه نقد مازاد / کسری) */
    CN.title('Cash need', 'Cash available before new funding vs minimum cash · funding balance required · ' + ut);
    CN.sec(4, 'Cash surplus / (deficit)', 9, S.meta.projYears);
    var cn = {}, cnr = 5;
    function nRow(key, label, fn, fmt, kind, note) { CN.put(1, cnr, label, kind); for (var t = 0; t < N; t++) CN.put(3 + t, cnr, { f: fn(t, L(P0 + t), L(P0 + t - 1), L(3 + t), L(2 + t)) }, kind || 'calc', fmt || 'money'); if (note) CN.put(9, cnr, note, 'sub'); cn[key] = cnr; cnr++; }
    var fsum = function (rows, c) { return rows.length ? rows.map(function (x) { return FS + c + x; }).join('+') : '0'; };
    nRow('open', 'Opening cash', function (t, c, p) { return '=' + FS + p + fr._cashT; });
    nRow('cfo', 'Cash from operations', function (t, c) { return '=' + FS + c + fr._cfo; });
    nRow('cfi', 'Cash from investing', function (t, c) { return '=' + FS + c + fr._cfi; });
    nRow('cff', 'Cash from financing (scheduled debt, equity, dividends)', function (t, c) { return '=' + FS + c + fr._cff; });
    nRow('avail', 'Cash available before new funding', function (t, c, p, me) { return '=SUM(' + me + cn.open + ':' + me + cn.cff + ')'; }, 'money', 'total');
    nRow('chk', 'Check: available − projected cash', function (t, c, p, me) { return '=ROUND(' + me + cn.avail + '-' + FS + c + fr._cashT + ',4)'; }, 'money2');
    nRow('min', 'Minimum cash required', function (t, c) { return '=CHOOSE(' + a.nmode + ',' + a.minc + ',' + a.npct + '*(' + fsum(R_('nwcA', S.bs), c) + '),' + a.npct + '*' + FS + c + fr._revenue + ')'; }, 'money', null, '1 amount · 2 % of non-cash current assets · 3 % of revenue');
    nRow('sur', 'Surplus / (deficit) before new funding', function (t, c, p, me) { return '=' + me + cn.avail + '-' + me + cn.min; }, 'money', 'total');
    nRow('rate', 'Facility rate used', function () { return '=IF(' + a.real + '=1,(1+' + a.nrate + ')/(1+' + a.inf + ')-1,' + a.nrate + ')'; }, 'pct2');
    nRow('cost', 'After-tax cost of earlier funding', function (t, c, p, me, pv) { return t === 0 ? '=0' : '=' + pv + (cnr + 2) + '*' + me + cn.rate + "*(1-'Calculations'!" + me + fc.tr + ')'; });
    nRow('cum', 'Cumulative cost of funding', function (t, c, p, me, pv) { return '=' + (t === 0 ? '' : pv + cnr + '+') + me + cn.cost; });
    nRow('bal', 'Funding balance required (cash need)', function (t, c, p, me) { return '=MAX(0,' + me + cn.min + '-(' + me + cn.avail + '-' + me + cn.cum + '))'; }, 'money', 'total');
    nRow('draw', 'New funding drawn / (repaid)', function (t, c, p, me, pv) { return '=' + me + cn.bal + (t === 0 ? '' : '-' + pv + cn.bal); });
    nRow('after', 'Cash after funding', function (t, c, p, me) { return '=' + me + cn.avail + '-' + me + cn.cum + '+' + me + cn.bal; });
    nRow('exc', 'Excess cash over minimum', function (t, c, p, me) { return '=' + me + cn.after + '-' + me + cn.min; });
    cnr++; CN.sec(cnr++, 'Funding requirement', 9);
    CN.put(1, cnr, 'Peak funding need', 'total'); CN.put(3, cnr, { f: '=MAX(D' + cn.bal + ':H' + cn.bal + ')' }, 'total', 'money'); cn.peak = cnr; cnr++;
    CN.put(1, cnr, 'Peak funding need incl. buffer', 'total'); CN.put(3, cnr, { f: '=D' + cn.peak + '*(1+' + a.nbuf + ')' }, 'total', 'money'); cn.peakB = cnr; cnr++;
    CN.put(1, cnr, 'Sum of checks (should be 0)'); CN.put(3, cnr, { f: '=SUM(D' + cn.chk + ':H' + cn.chk + ')' }, 'calc', 'money2');
    /* Sensitivity (live) */
    Sn.title('Sensitivity', 'Value per share (' + cur + ') · live formulas re-pricing the same UFCF');
    var adj = "SUM('Calculations'!$D$" + tv.debt + ":$D$" + tv.oc + ')', psf = uX + '/(' + a.sh + '*1E6)';
    var ufR = "'Calculations'!$D$" + fc.ufcf + ':$H$' + fc.ufcf, peR = "'Calculations'!$D$" + fc.per + ':$H$' + fc.per;
    var spv = function (w) { return 'SUMPRODUCT(' + ufR + ',1/(1+' + w + ')^' + peR + ')'; };
    function grid(top, label, rate, base, step, fmt, cell) {
      Sn.sec(top, label, 6);
      for (var j = 0; j < 5; j++) Sn.put(2 + j, top + 1, { f: '=' + base + '+(' + (j - 2) + ')*' + step }, 'sec', fmt);
      for (var i = 0; i < 5; i++) { Sn.put(1, top + 2 + i, { f: '=' + rate + '+(' + (i - 2) + ')*' + a.ws }, 'sec', 'pct2'); for (j = 0; j < 5; j++) Sn.put(2 + j, top + 2 + i, { f: cell('$B' + (top + 2 + i), L(2 + j) + '$' + (top + 1)) }, 'calc', 'money'); }
      Sn.heat(L(2) + (top + 2) + ':' + L(6) + (top + 6)); return top + 8;
    }
    var tvd = function (w) { return 'IF(' + a.tvr + '=1,' + w + ',' + rfU + ')'; }, CC = "'Calculations'!";
    var mstepF = a.ms + '*IF(' + a.mult + '<4,0.25,1)', mstepE = a.ms + '*IF(' + a.multE + '<4,0.25,1)';
    var nx = grid(4, 'FCFF · WACC ↓ × perpetual growth →', CC + '$D$10', a.g, a.gs, 'pct2', function (w, g) { return '=IF(' + tvd(w) + '>' + g + ',(' + spv(w) + '+' + CC + '$D$' + tv.m + '*(1+' + g + ')/(' + tvd(w) + '-' + g + ')/(1+' + w + ')^' + CC + '$D$' + tv.pe + '+' + adj + ')*' + psf + ',NA())'; });
    nx = grid(nx, 'FCFF · WACC ↓ × exit multiple (' + EXITS[methodOf(S).exitFcff].label + ') →', CC + '$D$10', a.mult, mstepF, 'x', function (w, m) { return '=(' + spv(w) + '+' + CC + '$E$' + tv.m + '*' + m + '/(1+' + w + ')^' + CC + '$E$' + tv.pe + '+' + adj + ')*' + psf; });
    var feR = CC + '$D$' + fe.fcfe + ':$H$' + fe.fcfe, adjE = CC + '$D$' + eq.adj, spvE = function (k) { return 'SUMPRODUCT(' + feR + ',1/(1+' + k + ')^' + peR + ')'; };
    var exE = function (m) { return '(CHOOSE(' + a.xfe + ',' + fsL('ni') + ',' + fsL('revenue') + ',' + beN + ',' + fsL('ebitda') + ')*' + m + '-IF(' + a.xfe + '=4,' + ndN + ',0))'; };
    nx = grid(nx, 'FCFE · cost of equity ↓ × perpetual growth →', CC + keu, a.g, a.gs, 'pct2', function (k, g) { return '=IF(' + tvd(k) + '>' + g + ',(' + spvE(k) + '+' + CC + '$H$' + fe.fcfe + '*(1+' + g + ')/(' + tvd(k) + '-' + g + ')/(1+' + k + ')^(' + N + '-0.5*' + a.mid + ')+' + adjE + ')*' + psf + ',NA())'; });
    grid(nx, 'FCFE · cost of equity ↓ × exit multiple (' + EXITS[methodOf(S).exitFcfe].label + (methodOf(S).exitFcfe === 'evEbitda' ? ' − net debt' : '') + ') →', CC + keu, a.multE, mstepE, 'x', function (k, m) { return '=(' + spvE(k) + '+' + exE(m) + '/(1+' + k + ')^' + N + '+' + adjE + ')*' + psf; });
    /* Summary */
    sum.title(S.meta.company + ' · Company model', ut + ' · ' + S.meta.standard + ' · ' + new Date().toISOString().slice(0, 10));
    sum.sec(4, 'Valuation (active scenario)', 4, ['Gordon', 'Exit multiple', 'Blended'], 2);
    [['Enterprise value', 'ev', 'money'], ['Equity value', 'eq', 'money'], ['Value per share (' + cur + ')', 'ps', 'money'], ['Upside / (downside) to price', 'up', 'pct']].forEach(function (x, i) {
      sum.put(1, 5 + i, x[0], i === 2 ? 'total' : null); ['D', 'E', 'F'].forEach(function (cl, j) { sum.put(2 + j, 5 + i, { f: "='Calculations'!" + cl + sl[x[1]] }, i === 2 ? 'total' : 'calc', x[2]); });
    });
    sum.put(1, 10, 'Discount rate used (selected method)'); sum.put(2, 10, { f: "='Calculations'!D" + sl.rate }, 'calc', 'pct2');
    sum.put(1, 11, 'Balance-sheet check (sum over projection)'); sum.put(2, 11, { f: '=SUM(' + FS + L(P0) + fr._chk + ':' + L(lastP) + fr._chk + ')' }, 'calc', 'money2');
    sum.put(1, 12, 'Cash-flow check (sum over projection)'); sum.put(2, 12, { f: '=SUM(' + FS + L(P0) + fr._ccheck + ':' + L(lastP) + fr._ccheck + ')' }, 'calc', 'money2');
    sum.put(1, 13, 'Peak funding need (Cash need sheet, incl. buffer)', 'total'); sum.put(2, 13, { f: "='Cash need'!D" + cn.peakB }, 'total', 'money');
    sum.sec(14, 'Scenario snapshot (values at export)', 4, ['Base', 'Upside', 'Downside'], 2);
    [['Per share · blended', 'psBlend'], ['Equity value · blended', 'eqBlend'], ['EV · blended', 'evBlend']].forEach(function (x, i) { sum.put(1, 15 + i, x[0]); ['base', 'upside', 'downside'].forEach(function (k, j) { sum.put(2 + j, 15 + i, R.scen[k].V[x[1]], null, 'money'); }); });
    sum.put(1, 18, 'Peak funding need (before buffer)'); ['base', 'upside', 'downside'].forEach(function (k, j) { sum.put(2 + j, 18, R.scen[k].need.peak, null, 'money'); });
    X.notes(b, ['Every line keeps the company’s own name; its role decides where it lands in subtotals, free cash flow and the bridge.',
      'Cash is the balancing item: total liabilities and equity less all other assets. The derived cash flow statement is checked against the change in cash.',
      'D&A embedded (by-function statements): EBIT = gross profit − opex + other operating; EBITDA = EBIT + D&A from the notes.',
      'Interest on opening balances. Real basis: drivers in constant prices; nominal rates converted with Fisher.',
      'Upside / Downside overlays shift Base drivers: COGS and opex deltas are spread across lines on % of revenue in proportion to their drivers.',
      'Cash need: cash available before new funding (opening cash + operating + investing + scheduled financing) against minimum cash; the funding balance carries the after-tax cost of earlier funding.',
      'Equity bridge: borrowings, debt-like items (e.g. dividends payable, end-of-service benefits) and non-controlling interest deducted; cash and non-operating assets added.', 'Author notes: ' + (S.meta.notes || '—')], S.sources);
    return { wb: b.wb, rows: { fr: fr, fc: fc, tv: tv, cn: cn, eq: eq, sl: sl } };
  }

  /* ---------- build a company model from the user's own Excel file ----------
   * Every line keeps its own name; roles are suggested from the name (review them); D&A comes
   * from the income statement or, if absent there, from the cash-flow reconciliation (memo line);
   * capex and dividends paid from the cash-flow statement; drivers are seeded from history. */
  function fromImport(S, blocks, info) {
    var SI = Hub.stmtImport, years = blocks[0].years.slice(), n = years.length;
    var mk = function (st) {
      var out = [];
      blocks.filter(function (b) { return b.type === st; }).forEach(function (b) {
        b.rows.forEach(function (r) { var role = suggestRole(r.label, st), hist = r.vals.slice(); if (ROLES[role] && ROLES[role].cost) hist = hist.map(Math.abs); out.push(line(r.label, role, hist, st)); });
      });
      return out;
    };
    S.is = mk('IS'); S.bs = mk('BS');
    var cf = SI.pickCF(blocks), z = function () { return years.map(function () { return 0; }); };
    if (!S.is.some(function (l) { return l.role === 'da'; }) && cf.da) S.is.push(line('استهلاک (از صورت جریان‌های نقدی)', 'da', cf.da, 'IS'));
    S.cfs = { capex: cf.capex || z(), dividends: cf.dividends || z() };
    S.meta.histYears = years;
    var last = parseInt(years[n - 1], 10);
    if (isFinite(last)) S.meta.projYears = [1, 2, 3, 4, 5].map(function (k) { return String(last + k); });
    if (info.unit) S.meta.unit = info.unit;
    if (info.currency) S.meta.currency = info.currency;
    S.meta.notes = 'Built from ' + (info.file || 'Excel file');
    S.bridge.price = 0;
    if (info.sharesMn) { S.bridge.sharesMn = info.sharesMn; S.sources = S.sources || {}; S.sources['bridge.sharesMn'] = 'Share capital ÷ 1,000 IRR nominal'; }
    seed(S);
    return { is: S.is.length, bs: S.bs.length, cf: !!(cf.capex || cf.dividends), da: !!cf.da };
  }

  Hub.tools = Hub.tools || {};
  Hub.tools.company = { fromImport: fromImport, suggestRole: suggestRole, ROLES: ROLES, histAgg: histAgg, EXITS: EXITS, exitMetric: exitMetric, valueFCFF: valueFCFF, valueFCFE: valueFCFE, toBasis: toBasis, compareMethods: compareMethods, methodOf: methodOf, growthUsed: growthUsed, fcfeSeries: fcfeSeries, cashNeed: cashNeed, needDefaults: needDefaults, ROLES: ROLES, METHODS: METHODS, sample: sample, blank: blank, run: run, build: build, seed: seed, parseBlock: parseBlock, suggestRole: suggestRole, histAgg: histAgg, implied: implied, value: value, line: line, defMethod: defMethod };
  if (typeof module !== 'undefined' && module.exports) module.exports = Hub.tools.company;
  if (!root.document || !Hub.toolkit) return;

  /* ======================= UI ======================= */
  var U = Hub.util, h = U.h, G = Hub.grid, TK = Hub.toolkit;
  function ul(S) { return S.meta.currency + ' ' + F.unitShort(S.meta.unit); }
  function roleOpts(st) { return Object.keys(ROLES).filter(function (k) { return ROLES[k].st === st || ROLES[k].st === '*'; }).map(function (k) { return [k, ROLES[k].label]; }); }
  function methodOpts(row) { return (ROLES[row.role] || ROLES.skip).methods.map(function (m) { return [m, METHODS[m].label]; }); }
  function stmtTab(st) {
    return function (ctx) {
      var S = ctx.S, key = st === 'IS' ? 'is' : 'bs', n = S.meta.histYears.length;
      var cols = [{ key: 'name', label: 'Line item (as in the statements)', kind: 'text' }, { key: 'role', label: 'Role', kind: 'select', options: function () { return roleOpts(st); }, onSet: function (row) { row.m = defMethod(row.role); }, repaint: true },
        { key: 'm', label: 'Forecast method', kind: 'select', options: methodOpts }];
      S.meta.histYears.forEach(function (y, i) { cols.push({ key: 'h' + i, label: y, arr: 'hist', idx: i }); });
      var lst = ctx.list({ id: 'cm-' + key, path: key, cols: cols, newRow: function () { return line('', st === 'IS' ? 'opex' : 'opA', new Array(n).fill(0), st); },
        rowActions: [{ label: '↑', title: 'Move up', run: function (row, i, done) { var a = S[key]; if (i > 0) { a.splice(i - 1, 0, a.splice(i, 1)[0]); done(); } } }] });
      var agg = G.table({ id: 'cm-agg-' + key, corner: ul(S), cols: S.meta.histYears.map(function (y) { return { label: y, cls: 'hist' }; }), rows: (st === 'IS'
        ? [['Revenue', 'revenue'], ['Gross profit', 'gp'], ['Operating profit (EBIT)', 'ebit'], ['EBITDA', 'ebitda'], ['Profit before tax', 'ebt'], ['Net income', 'ni', 'total'], ['EBITDA margin', 'ebitdaMargin', 'ratio', 'pct']]
        : [['Total assets', 'ta', 'total'], ['Total liabilities', 'tl'], ['Total equity', 'te'], ['Check: assets − liabilities − equity', 'check', 'check', 'dec'], ['Operating net working capital', 'nwc'], ['Capex (input or ΔPP&E + D&A)', 'capex']])
        .map(function (x) { return { label: x[0], cls: x[2] || 'sub', cell: function (c) { return ctx.calc(function () { return ctx.R.H[x[1]][c]; }, x[3] || 'num', x[1] === 'check' ? function (v) { return Math.abs(v) > 0.5; } : null); } }; }) });
      var ta = h('textarea', { id: 'cm-paste-' + key, class: 'f-area', rows: 5, placeholder: st === 'IS' ? 'درآمدهای عملیاتی\t42,000\t58,500\t79,000\nبهای تمام شده درآمدهای عملیاتی\t(29,400)\t(40,365)\t(53,720)' : 'موجودی نقد\t3,900\t5,200\t6,500\nدریافتنی‌های تجاری\t7,000\t9,800\t13,000' });
      var mode = h('select', { class: 'f-sel', id: 'cm-pm-' + key, 'aria-label': 'Paste mode' }, [h('option', { value: 'append', text: 'Append to lines' }), h('option', { value: 'replace', text: 'Replace all lines' })]);
      var go = h('button', { class: 'btn', type: 'button', text: 'Import pasted rows', onclick: function () {
        var rows = parseBlock(ta.value, st, n);
        if (!rows.length) { U.toast('No rows found. Each row needs a label and ' + n + ' numbers.', 'warn'); return; }
        S[key] = mode.value === 'replace' ? rows : S[key].concat(rows); seed(S); ta.value = ''; ctx.rerender();
        U.toast(rows.length + ' rows imported; roles suggested from the names and drivers seeded from history. Review the Role column.', 'good');
      } });
      return ctx.group([
        ctx.panel('Paste from your statements', [h('p', { class: 'muted', text: 'Copy rows from Excel or Codal (label, then ' + n + ' years, oldest first) and paste here. Persian or English names, Persian digits and (negatives) are read. Subtotal rows are detected and set to "Ignore". Costs are stored as positive numbers.' }), ta, h('div', { class: 'row-ctl' }, [mode, go])]),
        ctx.panel((st === 'IS' ? 'Income statement' : 'Balance sheet') + ' lines (' + ul(S) + ')', [lst]),
        ctx.panel('Check against your statements', [agg])]);
    };
  }

  /* ---------- methodology choices with reasons ---------- */
  var LNG = function (en, fa) { return Hub.i18n && Hub.i18n.lang() === 'fa' ? fa : en; };
  var CHOICES = [
    { key: 'basis', q: ['Model basis', 'مبنای مدل'], opts: [['real', ['Real (constant prices)', 'حقیقی (قیمت ثابت)']], ['nominal', ['Nominal', 'اسمی']]], best: 'both',
      why: ['Best practice in high inflation is to build both and reconcile: nominal for financing, tax and the cash need (taxes and interest are levied on nominal amounts); real for long-run growth and the terminal value, which are more stable in constant prices. The table below shows both on restated inputs. A gap between them comes from tax on nominal profits, working capital and interest — it is information, not an error.',
        'رویهٔ استاندارد در تورم بالا ساختن هر دو و تطبیق آن‌هاست: اسمی برای تأمین مالی، مالیات و نیاز نقدینگی (مالیات و بهره روی اعداد اسمی محاسبه می‌شوند) و حقیقی برای رشد بلندمدت و ارزش پایانی که با قیمت ثابت پایدارترند. جدول پایین هر دو را روی ورودی‌های بازنویسی‌شده نشان می‌دهد. اختلاف این دو از مالیات بر سود اسمی، سرمایه در گردش و بهره می‌آید — اطلاعات است، نه خطا.'],
      src: 'Koller, Goedhart, Wessels — Valuation (McKinsey & Company), 7th ed., 2020: valuation in high-inflation environments; Damodaran — Investment Valuation, 3rd ed., 2012: consistency of cash flows and discount rates.' },
    { key: 'cf', q: ['Cash flow and discount rate', 'جریان نقد و نرخ تنزیل'], opts: [['fcff', ['FCFF at WACC (enterprise DCF)', 'FCFF با WACC (DCF بنگاه)']], ['fcfe', ['FCFE at the cost of equity (house, FFDG)', 'FCFE با بازده مورد انتظار سهام (روش داخلی، FFDG)']]], best: 'fcff',
      why: ['Enterprise DCF (FCFF at WACC) is the standard for operating companies because value does not depend on the financing plan in each year. FCFE at the cost of equity is the standard for banks, insurers, leasing and investment / holding companies, where debt is part of operations — so for a financial group FCFE is the right choice, not just a house habit. With FCFE the cost of equity must reflect the leverage in each year.',
        'DCF بنگاه (FCFF با WACC) برای شرکت‌های عملیاتی استاندارد است، چون ارزش به برنامهٔ تأمین مالی هر سال وابسته نمی‌شود. FCFE با بازده مورد انتظار سهام برای بانک، بیمه، لیزینگ و شرکت‌های سرمایه‌گذاری و هلدینگ استاندارد است که بدهی جزء عملیات آن‌هاست — پس برای یک گروه مالی FCFE انتخاب درست است، نه فقط عادت داخلی. در FCFE نرخ هزینهٔ سهام باید اهرم هر سال را منعکس کند.'],
      src: 'Damodaran — Investment Valuation, 3rd ed., 2012 (FCFE and financial-service firms); Koller et al. — Valuation, 7th ed. (enterprise DCF; equity DCF for financial institutions).' },
    { key: 'tvRate', q: ['Rate in the terminal value', 'نرخ تنزیل دورهٔ نهایی'], opts: [['same', ['Same cost of capital as the forecast', 'همان نرخ دورهٔ پیش‌بینی']], ['rf', ['Risk-free rate (house, FFDG)', 'نرخ بدون ریسک (روش داخلی، FFDG)']]], best: 'same',
      why: ['The terminal cash flows are as risky as the forecast ones, so they are discounted at a cost of capital, not the risk-free rate. Best practice allows a lower stable-stage cost of capital (a beta moving toward 1 and a lower size premium), never the risk-free rate: with risk-free in the Gordon denominator the spread to growth collapses and the terminal value dominates the valuation — see the TV share in the table.',
        'جریان‌های نقد دورهٔ نهایی همان‌قدر ریسک دارند که جریان‌های دورهٔ پیش‌بینی، پس با هزینهٔ سرمایه تنزیل می‌شوند نه نرخ بدون ریسک. رویهٔ استاندارد اجازه می‌دهد هزینهٔ سرمایهٔ دورهٔ پایدار کمتر باشد (بتای نزدیک به ۱ و صرف اندازهٔ کمتر)، ولی نه نرخ بدون ریسک: با نرخ بدون ریسک در مخرج گوردون فاصله تا نرخ رشد از بین می‌رود و ارزش پایانی بر کل ارزش غالب می‌شود — سهم ارزش پایانی در جدول را ببینید.'],
      src: 'Damodaran — Investment Valuation, 3rd ed., 2012 (stable-growth discount rates); Koller et al. — Valuation, 7th ed. (continuing value).' },
    { key: 'gBuild', q: ['Terminal growth input', 'ورودی نرخ رشد بلندمدت'], opts: [['direct', ['As entered (on the model basis)', 'همان عدد واردشده (بر مبنای مدل)']], ['fisher', ['Real growth → nominal with Fisher', 'رشد حقیقی ← اسمی با فیشر']], ['additive', ['Real growth + inflation (house, FFDG)', 'رشد حقیقی + تورم (روش داخلی، FFDG)']]], best: 'fisher', ok: ['direct'],
      why: ['Nominal growth = (1 + real growth) × (1 + inflation) − 1. Adding the two is an approximation whose error grows with inflation: at 2.85% real growth and 19.83% inflation the sum gives 22.68% instead of 23.25%. On a real-basis model both options use the real growth as entered.',
        'رشد اسمی = (۱ + رشد حقیقی) × (۱ + تورم) − ۱. جمع ساده تقریبی است که خطایش با تورم بزرگ می‌شود: با رشد حقیقی ۲٫۸۵٪ و تورم ۱۹٫۸۳٪، جمع ساده ۲۲٫۶۸٪ می‌دهد به‌جای ۲۳٫۲۵٪. در مدل با مبنای حقیقی هر دو گزینه همان رشد حقیقی واردشده را به کار می‌برند.'],
      src: 'Fisher equation; Damodaran — Investment Valuation, 3rd ed. (stable growth no higher than the nominal growth of the economy).' },
    { key: 'exitFcff', q: ['Exit multiple under FCFF', 'ضریب خروج در روش FCFF'], opts: [['evEbitda', ['EV / EBITDA', 'EV / EBITDA']], ['evEbit', ['EV / EBIT', 'EV / EBIT']], ['evSales', ['EV / Sales', 'EV / فروش']]], best: 'evEbitda',
      why: ['An enterprise cash flow needs an enterprise multiple. EV/EBITDA is the most used because it is neutral to capital structure and to depreciation policy; EV/EBIT is better when capital intensity differs across peers (it charges for asset replacement); EV/Sales ignores margins and suits loss-making or early-stage companies.',
        'جریان نقد بنگاه به ضریب بنگاه نیاز دارد. EV/EBITDA رایج‌ترین است چون به ساختار سرمایه و سیاست استهلاک حساس نیست؛ EV/EBIT وقتی شدت سرمایه‌بری همتایان متفاوت است بهتر است (هزینهٔ جایگزینی دارایی را لحاظ می‌کند)؛ EV/فروش حاشیهٔ سود را نادیده می‌گیرد و برای شرکت‌های زیان‌ده یا مراحل اولیه مناسب است.'],
      src: 'Koller et al. — Valuation, 7th ed. (enterprise multiples); Rosenbaum & Pearl — Investment Banking, 3rd ed., 2020 (exit multiple method).' },
    { key: 'exitFcfe', q: ['Exit multiple under FCFE', 'ضریب خروج در روش FCFE'], opts: [['pe', ['P / E on final-year net income', 'P/E روی سود خالص سال آخر']], ['ps', ['P / S on final-year revenue (house, FFDG)', 'P/S روی درآمد سال آخر (روش داخلی، FFDG)']],
      ['pb', ['P / B on final-year book equity', 'P/B روی حقوق مالکانهٔ سال آخر']], ['evEbitda', ['EV / EBITDA less final-year net debt', 'EV/EBITDA منهای بدهی خالص سال آخر']]], best: 'pe', ok: ['pb', 'evEbitda'],
      why: ['An equity cash flow needs an equity value at exit. P/E ties the exit to the profit the FCFE is built on. P/B is the standard for banks, insurers and investment companies, whose value tracks book equity and return on equity. EV/EBITDA less net debt at exit is acceptable and keeps comparability with FCFF. P/S ignores margins and should be kept for loss-making or early-stage companies.',
        'جریان نقد سهام‌داران به ارزش سهام در خروج نیاز دارد. P/E خروج را به همان سودی گره می‌زند که FCFE از آن ساخته شده. P/B برای بانک، بیمه و شرکت‌های سرمایه‌گذاری استاندارد است که ارزششان به حقوق مالکانه و بازده آن وابسته است. EV/EBITDA منهای بدهی خالص سال خروج قابل قبول است و مقایسه با FCFF را حفظ می‌کند. P/S حاشیهٔ سود را نادیده می‌گیرد و برای شرکت‌های زیان‌ده یا مراحل اولیه مناسب است.'],
      src: 'Koller et al. — Valuation, 7th ed. (multiples consistent with the cash flow); Damodaran — Investment Valuation, 3rd ed. (P/BV for financial-service firms).' }];
  Hub.methodChoices = CHOICES;   // shared with the DCF tool
  function methodTab(ctx) {
    var S = ctx.S, M = methodOf(S), wrap = h('div', { class: 'mth', 'data-notr': '1', dir: Hub.i18n && Hub.i18n.lang() === 'fa' ? 'rtl' : 'ltr' });
    CHOICES.forEach(function (c) {
      var cur = c.key === 'basis' ? S.settings.basis : M[c.key];
      var sel = h('select', { class: 'f-sel', 'aria-label': LNG(c.q[0], c.q[1]) }, c.opts.map(function (o) { return h('option', { value: o[0], text: LNG(o[1][0], o[1][1]) + (o[0] === c.best ? LNG('  ✓ best practice', '  ✓ استاندارد جهانی') : '') }); }));
      sel.value = cur;
      sel.addEventListener('change', function () {
        if (c.key === 'basis') { ctx.setState(toBasis(S, sel.value)); return; }
        M[c.key] = sel.value; ctx.rerender();
      });
      var badge = c.best === 'both' ? LNG('Best practice: build both and reconcile (table below)', 'استاندارد جهانی: هر دو را بسازید و تطبیق دهید (جدول پایین)')
        : cur === c.best ? LNG('Using the best-practice option', 'گزینهٔ استاندارد جهانی فعال است') : (c.ok || []).indexOf(cur) >= 0 ? LNG('Acceptable alternative to the best-practice option', 'جایگزین قابل قبول برای گزینهٔ استاندارد جهانی') : LNG('House option selected — differs from best practice', 'گزینهٔ داخلی انتخاب شده — با استاندارد جهانی متفاوت است');
      var off = c.best !== 'both' && cur !== c.best && (c.ok || []).indexOf(cur) < 0;
      wrap.appendChild(h('div', { class: 'mth-card' + (off ? ' off' : '') }, [h('div', { class: 'mth-q' }, [h('strong', { text: LNG(c.q[0], c.q[1]) }), sel]),
        h('p', { class: 'mth-badge', text: badge }), h('p', { class: 'mth-why', text: LNG(c.why[0], c.why[1]) }), h('p', { class: 'muted mth-src', text: LNG('Source: ', 'منبع: ') + c.src })]));
    });
    var cmp = h('div', { class: 'grid-wrap' });
    function paint() {
      U.clear(cmp); var tb = h('table', { class: 'grid list' }), bd = h('tbody');
      tb.appendChild(h('thead', null, [h('tr', null, ['Combination', 'Value per share · blended', 'Gordon', 'Exit', 'Discount rate', 'TV share of value', ''].map(function (x) { return h('th', { text: x }); }))]));
      ctx.R.compare.forEach(function (c) { bd.appendChild(h('tr', { class: c.current ? 'total' : '' }, [h('td', { class: 'txt', text: c.label }), h('td', { class: 'num', text: U.fmtNum(c.ps) }), h('td', { class: 'num', text: U.fmtNum(c.psG) }), h('td', { class: 'num', text: U.fmtNum(c.psX) }),
        h('td', { class: 'num', text: U.fmtPct(c.rate, 2) }), h('td', { class: 'num', text: U.fmtPct(c.tvShare, 0) }), h('td', { class: 'txt', text: c.current ? '◀ selected' : '' })])); });
      tb.appendChild(bd); cmp.appendChild(tb);
    }
    paint();
    var gi = G.form({ id: 'cm-mg', fields: [{ key: 'g', label: 'Terminal growth used (active scenario)', calc: function () { return U.fmtPct(ctx.R.V.g, 2) + ' (' + (S.settings.basis === 'real' ? 'real' : 'nominal') + ')'; } }, { key: 'r', label: 'Discount rate of the selected method', calc: function () { return U.fmtPct(ctx.R.V.wacc, 2) + ' · terminal-value rate ' + U.fmtPct(ctx.R.V.tvRate, 2); } }] });
    return { el: h('div', { class: 'stack' }, [ctx.panel('Methodology — you choose; best practice is marked', [wrap, gi]), ctx.panel('Every combination on the same inputs (active scenario)', [h('p', { class: 'muted', text: 'Inputs are restated for the other basis (growth with Fisher, amounts with the inflation index), so rows are comparable. Exit multiples: EV/EBITDA for FCFF, P/E or P/S for FCFE.' }), cmp])]),
      refresh: function () { paint(); gi.refresh(); } };
  }

  TK.define({
    id: 'company', title: 'Company Model (custom statements)', sections: ['valuation', 'finmgmt', 'ipo', 'ib', 'buyside', 'sellside'], priority: -1, version: 1, storeKey: 'hub.company.v1',
    summary: 'Your own statement lines per company, mapped to roles; drivers seeded from 3 years of history; integrated projection, DCF, scenarios, Excel with formulas.',
    sample: sample, blank: blank, run: run, scenarios: true,
    companyFull: function (S, rec) {
      var r = fromImport(S, rec.blocks, rec), H = histAgg(S), chk = H.check[H.check.length - 1], fa = Hub.i18n && Hub.i18n.lang() === 'fa', okc = Math.abs(chk) <= 2;
      return fa ? (r.is + ' سطر صورت سود و زیان و ' + r.bs + ' سطر صورت وضعیت مالی با همان نام‌های فایل ساخته شد' + (r.cf ? '؛ مخارج سرمایه‌ای و سود سهام از صورت جریان‌های نقدی' : '') + '. ستون نقش و کنترل تراز را بررسی کنید' + (okc ? ' (تراز برقرار است).' : ' (اختلاف ' + U.fmtNum(chk) + ').'))
        : (r.is + ' income-statement and ' + r.bs + ' balance-sheet lines rebuilt under their own names' + (r.cf ? '; capex and dividends from the cash-flow statement' : '') + '. Review the Role column and the balance check' + (okc ? ' (balances).' : ' (difference ' + U.fmtNum(chk) + ').'));
    },
    headControls: function (ctx, seg) { return [seg('Basis', [['real', 'Real'], ['nominal', 'Nominal']], ctx.S.settings.basis, function (v) { if (v !== ctx.S.settings.basis) { ctx.setState(toBasis(ctx.S, v)); U.toast(v === 'real' ? 'Restated in real terms: growth deflated with Fisher, amounts deflated by the inflation index' : 'Restated in nominal terms: growth inflated with Fisher, amounts indexed to inflation', 'info'); } })]; },
    eyebrow: function (S) { return 'Valuation · Company model · ' + ul(S) + ' · ' + (S.settings.basis === 'real' ? 'real terms' : 'nominal terms'); }, heading: function (S) { return S.meta.company; },
    filename: function (S) { return S.meta.company + '_Model'; },
    xlsx: function (S, R) { return build(root.ExcelJS, S, R).wb; },
    kpis: function (ctx) { var V = function () { return ctx.R.V; }; return [
      ['Value per share', function () { return U.fmtNum(V().psBlend); }, function () { return 'Gordon ' + U.fmtNum(V().psG) + ' / Exit ' + U.fmtNum(V().psX); }],
      ['Equity value', function () { return U.fmtNum(V().eqBlend); }, function () { return ul(ctx.S) + ' · blended'; }],
      ['vs price', function () { var p = ctx.S.bridge.price; return p > 0 ? U.fmtPct(V().psBlend / p - 1) : '–'; }, function () { return 'price ' + U.fmtNum(ctx.S.bridge.price); }],
      ['Discount rate', function () { return U.fmtPct(ctx.R.W.used, 2); }, function () { return ctx.S.settings.basis === 'real' ? 'real · nominal ' + U.fmtPct(ctx.R.W.nominal, 1) : 'nominal'; }],
      ['Cash need (peak)', function () { return U.fmtNum(ctx.R.need.peak); }, function () { return ctx.R.need.peak > 0 ? 'by ' + ctx.R.need.peakYear + ' · incl. buffer ' + U.fmtNum(ctx.R.need.withBuffer) : 'no funding needed'; }]
    ]; },
    tabs: [
      { group: 'Inputs', items: [['setup', 'Setup', function (ctx) {
        var S = ctx.S;
        var f = G.form({ id: 'cm-s', onChange: ctx.rerender, fields: [
          { key: 'co', label: 'Company', text: true, get: function () { return S.meta.company; }, set: function (v) { S.meta.company = v; } },
          { key: 'cu', label: 'Currency', text: true, get: function () { return S.meta.currency; }, set: function (v) { S.meta.currency = v.toUpperCase(); } },
          { key: 'un', label: 'Unit of the statements', options: F.UNITS, get: function () { return S.meta.unit; }, set: function (v) { S.meta.unit = v; } },
          { key: 'sd', label: 'Accounting basis', text: true, get: function () { return S.meta.standard; }, set: function (v) { S.meta.standard = v; } },
          { key: 'da', label: 'Depreciation in the income statement', options: [['embedded', 'Inside cost of sales and opex (memo line from notes)'], ['separate', 'Separate line']], get: function () { return S.settings.daMode; }, set: function (v) { S.settings.daMode = v; } },
          { key: 'mid', label: 'Mid-year discounting', options: [['1', 'On'], ['0', 'Off']], get: function () { return S.settings.midYear ? '1' : '0'; }, set: function (v) { S.settings.midYear = v === '1'; } },
          ctx.field('gw', 'Weight on Gordon method', 'settings.gordonWeight', 'pct', { unit: '%' }),
          { key: 'nt', label: 'Notes', text: true, get: function () { return S.meta.notes; }, set: function (v) { S.meta.notes = v; } }
        ] });
        var yrs = h('div', { class: 'years' });
        S.meta.histYears.forEach(function (y, i) { var x = h('input', { class: 'f-text yr', id: 'cm-hy' + i, value: y, 'aria-label': 'Historical year ' + (i + 1) }); x.addEventListener('change', function () { S.meta.histYears[i] = x.value; ctx.rerender(); }); yrs.appendChild(x); });
        S.meta.projYears.forEach(function (y, i) { var x = h('input', { class: 'f-text yr', id: 'cm-py' + i, value: y, 'aria-label': 'Forecast year ' + (i + 1) }); x.addEventListener('change', function () { S.meta.projYears[i] = x.value; ctx.rerender(); }); yrs.appendChild(x); });
        var st = h('p', { class: 'muted fetch-status', 'aria-live': 'polite' });
        var tk = h('input', { class: 'f-text', id: 'cm-tk', placeholder: 'TSETMC symbol, e.g. فولاد', autocomplete: 'off' });
        var fb = h('button', { class: 'btn', type: 'button', text: 'Price & shares from TSETMC', onclick: function () {
          if (!tk.value.trim()) return; st.textContent = 'Fetching…';
          Hub.data.tse.quote(tk.value).then(function (q) { S.bridge.price = q.price; S.bridge.sharesMn = q.shares / 1e6; S.sources['bridge.price'] = S.sources['bridge.sharesMn'] = 'TSETMC ' + U.stamp(); ctx.rerender(); U.toast(q.symbol + ': price ' + U.fmtNum(q.price) + ', shares ' + U.fmtNum(q.shares / 1e6) + ' mn', 'good'); }).catch(function (e) { st.textContent = e.message; });
        } });
        var imp = h('p', { class: 'muted', text: 'Use the Company data bar at the top of the model: import your Excel file or paste the rows once; the statements are rebuilt here line by line and every other model can use the same data.' });
        return ctx.group([ctx.panel('Build from your Excel file (up to 3 years of statements)', [imp]), ctx.two(ctx.panel('Company', [f]), ctx.panel('How to build a company model', [h('ol', { class: 'scope' }, [
          h('li', { text: 'Set the years and the unit used in the statements.' }), h('li', { text: 'Income statement and Balance sheet tabs: paste the rows as they appear. Each line keeps its own name.' }),
          h('li', { text: 'Check the Role column (where each line belongs) and the balance check. Mark subtotals as "Ignore".' }),
          h('li', { text: 'Drivers tab: review the drivers seeded from history and set your own assumptions per line and per scenario.' }),
          h('li', { text: 'Or send the three years of statements to Claude: it returns a model file you open here with "Open".' })])])),
          ctx.panel('Period labels', [yrs]), ctx.panel('Market data', [h('div', { class: 'row-ctl' }, [tk, fb]), st])]);
      }], ['method', 'Method', methodTab], ['is', 'Income statement', stmtTab('IS')], ['bs', 'Balance sheet', stmtTab('BS')], ['drivers', 'Drivers', function (ctx) {
        var S = ctx.S, H = function () { return ctx.R.H; }, nH = S.meta.histYears.length;
        var cols = S.meta.histYears.map(function (y) { return { label: y, cls: 'hist' }; }).concat(S.meta.projYears.map(function (y) { return { label: y, cls: 'proj' }; }));
        function rowsFor(lines, title) {
          var rows = [{ type: 'head', label: title }];
          lines.filter(function (l) { return HAS_DRIVER[l.m]; }).forEach(function (l) {
            var M = METHODS[l.m], fmt = M.pct ? 'pct' : M.unit === 'days' ? 'days' : 'num';
            rows.push({ label: l.name + ' · ' + M.label, unit: M.unit === 'amt' ? ul(S) : M.unit, cell: function (c) {
              if (c < nH) return ctx.calc(function () { var v = histRatio(S, H(), l, c); return isFinite(v) ? v : null; }, fmt === 'num' ? 'num' : fmt);
              return { input: true, fmt: M.pct ? 'pct' : 'num', get: function () { return l.d[c - nH]; }, set: function (v) { l.d[c - nH] = v; } };
            } });
          });
          return rows;
        }
        var t = G.table({ id: 'cm-d', corner: 'Base drivers', cols: cols, onChange: ctx.recompute, rows: rowsFor(S.is, 'Income statement').concat(rowsFor(S.bs, 'Balance sheet')).concat([
          { type: 'head', label: 'Capex' },
          { label: 'Capex · ' + (S.capex.m === 'manual' ? 'amount' : '% of revenue'), unit: S.capex.m === 'manual' ? ul(S) : '%', cell: function (c) { return c < nH ? ctx.calc(function () { var v = H().capex[c]; return S.capex.m === 'manual' ? v : v / H().revenue[c]; }, S.capex.m === 'manual' ? 'num' : 'pct') : ctx.inArr('capex.d', c - nH, S.capex.m === 'manual' ? 'num' : 'pct'); } }
        ]) });
        var ovs = G.table({ id: 'cm-o', corner: 'Overlay on Base', cols: S.meta.projYears.map(function (y) { return { label: y, cls: 'proj' }; }), onChange: ctx.recompute, rows: [].concat.apply([], ['upside', 'downside'].map(function (k) {
          return [{ type: 'head', label: k === 'upside' ? 'Upside' : 'Downside' }].concat(OVR.map(function (o) { return { label: o[1], unit: o[2] === 'days' ? 'days' : 'pp', cell: function (c) { return ctx.inArr('overlay.' + k + '.' + o[0], c, o[2] === 'days' ? 'dec' : 'pct'); } }; }));
        })) });
        var fin = G.table({ id: 'cm-f', corner: 'Financing', cols: S.meta.projYears.map(function (y) { return { label: y, cls: 'proj' }; }), onChange: ctx.recompute, rows: [
          { label: 'Net debt issued / (repaid)', unit: ul(S), cell: function (c) { return ctx.inArr('fin.debtChange', c); } },
          { label: 'New equity raised', unit: ul(S), cell: function (c) { return ctx.inArr('fin.equityRaise', c); } }] });
        var ff = G.form({ id: 'cm-ff', onChange: ctx.rerender, fields: [
          { key: 'cm', label: 'Capex method', options: [['pctRev', '% of revenue'], ['manual', 'Amount per year']], get: function () { return S.capex.m; }, set: function (v) { S.capex.m = v; } },
          ctx.field('po', 'Dividend payout', 'fin.payout', 'pct', { unit: '% NI' }), ctx.field('mc', 'Minimum cash', 'fin.minCash', 'num', { unit: ul(S) })] });
        var reseed = h('button', { class: 'btn ghost', type: 'button', text: 'Re-seed all drivers from history', onclick: function () { seed(S); ctx.rerender(); U.toast('Drivers reset to historical ratios' + (S.settings.basis === 'real' ? ' (growth deflated by expected inflation)' : ''), 'info'); } });
        return ctx.group([ctx.panel('Line drivers · Base (grey = historical ratio under the same method)', [h('p', { class: 'muted', text: 'Change the method of a line on the statement tabs. Growth rates are ' + (S.settings.basis === 'real' ? 'real (history is deflated by expected inflation when seeded)' : 'nominal') + '.' }), t, h('div', { class: 'row-ctl' }, [reseed])]),
          ctx.panel('Scenario overlays', [ovs]), ctx.two(ctx.panel('Financing', [fin]), ctx.panel('Capex and payout', [ff]))]);
      }], ['wacc', 'WACC & bridge', function (ctx) {
        var S = ctx.S;
        var f = G.form({ id: 'cm-w', onChange: ctx.recompute, fields: [
          ctx.field('rf', 'Risk-free rate (nominal)', 'wacc.rf', 'pct2', { unit: '%' }), ctx.field('erp', 'Equity risk premium', 'wacc.erp', 'pct2', { unit: '%' }), ctx.field('crp', 'Country risk premium', 'wacc.crp', 'pct2', { unit: '%' }),
          ctx.field('sz', 'Size / specific premium', 'wacc.sizePremium', 'pct2', { unit: '%' }),
          { key: 'bm', label: 'Beta method', options: [['relever', 'Relever unlevered beta'], ['levered', 'Levered beta']], get: function () { return S.wacc.betaMode; }, set: function (v) { S.wacc.betaMode = v; } },
          ctx.field('bl', 'Levered beta', 'wacc.betaLevered', 'dec'), ctx.field('bu', 'Unlevered beta', 'wacc.betaUnlevered', 'dec'), ctx.field('kd', 'Pre-tax cost of debt (nominal)', 'wacc.kdPreTax', 'pct2', { unit: '%' }),
          ctx.field('tx', 'Tax rate for WACC', 'wacc.taxRate', 'pct', { unit: '%' }), ctx.field('wd', 'Target D / (D + E)', 'wacc.debtWeight', 'pct', { unit: '%' }), ctx.field('in', 'Expected inflation', 'wacc.inflation', 'pct2', { unit: '%' }),
          { key: 'out', label: 'Discount rate used', strong: true, calc: function () { return U.fmtPct(ctx.R.W.used, 2) + ' (nominal ' + U.fmtPct(ctx.R.W.nominal, 2) + ', real ' + U.fmtPct(ctx.R.W.real, 2) + ')'; } }] });
        var tv = G.table({ id: 'cm-tv', corner: 'Terminal value', cols: ctx.scenCols(), onChange: ctx.recompute, rows: [
          { label: 'Perpetual growth', unit: '%', cell: function (c) { return ctx.inVal('tv.' + ctx.scenKey(c) + '.g', 'pct2'); } },
          { label: 'Exit EV / EBITDA', unit: 'x', cell: function (c) { return ctx.inVal('tv.' + ctx.scenKey(c) + '.mult', 'dec'); } },
          { label: 'Exit EV / EBIT', unit: 'x', cell: function (c) { return ctx.inVal('tv.' + ctx.scenKey(c) + '.evEbit', 'dec'); } },
          { label: 'Exit EV / Sales', unit: 'x', cell: function (c) { return ctx.inVal('tv.' + ctx.scenKey(c) + '.evSales', 'dec'); } },
          { label: 'Exit P / E', unit: 'x', cell: function (c) { return ctx.inVal('tv.' + ctx.scenKey(c) + '.pe', 'dec'); } },
          { label: 'Exit P / S', unit: 'x', cell: function (c) { return ctx.inVal('tv.' + ctx.scenKey(c) + '.ps', 'dec'); } },
          { label: 'Exit P / B', unit: 'x', cell: function (c) { return ctx.inVal('tv.' + ctx.scenKey(c) + '.pb', 'dec'); } }] });
        var B = function () { return ctx.R.V.bridge; };
        var br = G.form({ id: 'cm-b', onChange: ctx.recompute, fields: [
          { type: 'head', label: 'From the balance-sheet roles (last historical year)' },
          { key: 'd', label: 'Borrowings', calc: function () { return U.fmtNum(B().debt); } }, { key: 'dl', label: 'Debt-like items', calc: function () { return U.fmtNum(B().debtLike); } },
          { key: 'c', label: 'Cash', calc: function () { return U.fmtNum(B().cash); } }, { key: 'na', label: 'Non-operating assets', calc: function () { return U.fmtNum(B().nonOpA); } },
          { key: 'mi', label: 'Non-controlling interest', calc: function () { return U.fmtNum(B().minority); } },
          { type: 'head', label: 'Adjustments and per share' },
          ctx.field('oa', 'Other non-operating assets (not on the balance sheet)', 'bridge.otherAssets', 'num', { unit: ul(S) }), ctx.field('oc', 'Other debt-like claims', 'bridge.otherClaims', 'num', { unit: ul(S) }),
          ctx.field('sh', 'Diluted shares', 'bridge.sharesMn', 'dec', { unit: 'mn' }), ctx.field('px', 'Current share price', 'bridge.price', 'dec', { unit: S.meta.currency })] });
        var W = function () { return ctx.R.W; };
        var ov = G.form({ id: 'cm-ov', onChange: ctx.rerender, fields: [
          { key: 'kem', label: 'Cost of equity', options: [['calc', 'Computed (CAPM)'], ['manual', 'My number']], get: function () { return S.wacc.keMode || 'calc'; }, set: function (v) { S.wacc.keMode = v; if (v === 'manual' && !num(S.wacc.keManual)) S.wacc.keManual = Math.round(W().keCalc * 1e4) / 1e4; } },
          ctx.field('keo', 'My cost of equity (nominal)', 'wacc.keManual', 'pct2', { unit: '%' }),
          { key: 'kec', label: 'Computed cost of equity (nominal)', calc: function () { return U.fmtPct(W().keCalc, 2); } },
          { key: 'wm', label: 'WACC', options: [['calc', 'Computed'], ['manual', 'My number']], get: function () { return S.wacc.waccMode || 'calc'; }, set: function (v) { S.wacc.waccMode = v; if (v === 'manual' && !num(S.wacc.waccManual)) S.wacc.waccManual = Math.round(W().nomCalc * 1e4) / 1e4; } },
          ctx.field('wo', 'My WACC (nominal)', 'wacc.waccManual', 'pct2', { unit: '%' }),
          { key: 'wc', label: 'Computed WACC (nominal)', calc: function () { return U.fmtPct(W().nomCalc, 2); } }] });
        var mac = Hub.macro ? Hub.macro.panel(S, Hub.macro.waccBinds('wacc'), ctx.rerender) : h('p', { class: 'muted', text: 'Macro module not loaded.' });
        return ctx.group([ctx.panel('Market inputs: live or your own number', [mac]), ctx.two(ctx.panel('Discount rate', [f]), ctx.panel('Computed or your own rate', [ov, h('p', { class: 'f-help', text: 'Your numbers are nominal; on a real basis they are converted with Fisher like every other rate. With "My number" the CAPM / WACC build is kept for reference and in Excel, but not used.' })])),
          ctx.panel('Equity bridge', [br]), ctx.panel('Terminal value by scenario', [tv])]);
      }]] },
      { group: 'Calculations', items: [['proj', 'Projection', function (ctx) {
        var S = ctx.S, nH = S.meta.histYears.length, cols = S.meta.histYears.map(function (y) { return { label: y, cls: 'hist' }; }).concat(S.meta.projYears.map(function (y) { return { label: y, cls: 'proj' }; }));
        function lineRow(l) { return { label: l.name, cls: l.role === 'skip' ? 'ratio' : '', unit: l.role === 'skip' ? 'ignored' : '', cell: function (c) { return ctx.calc(function () { if (c < nH) return num(l.hist[c]); var a = (l.st === 'IS' ? ctx.R.P.is : ctx.R.P.bs)[l.id]; return a ? a[c - nH] : null; }); } }; }
        function tot(label, hk, pk, fmt, cls) { return { label: label, cls: cls || 'sub', cell: function (c) { return ctx.calc(function () { return c < nH ? (hk ? ctx.R.H[hk][c] : null) : ctx.R.P.t[pk][c - nH]; }, fmt || 'num', pk === 'check' || pk === 'cashCheck' ? function (v) { return Math.abs(v) > 0.5; } : null); } }; }
        var kind = function (l) { return ROLES[l.role].kind; };
        var t = G.table({ id: 'cm-p', corner: ul(S) + ' · ' + S.settings.scenario, cols: cols, rows: [{ type: 'head', label: 'Income statement (your lines)' }].concat(S.is.map(lineRow)).concat([
          { type: 'head', label: 'Subtotals' }, tot('Revenue', 'revenue', 'revenue', 'num', 'total'), tot('Gross profit', 'gp', 'gp'), tot('Operating profit (EBIT)', 'ebit', 'ebit'), tot('D&A', 'da', 'da'), tot('EBITDA', 'ebitda', 'ebitda', 'num', 'total'),
          tot('Profit before tax', 'ebt', 'ebt'), tot('Net income', 'ni', 'ni', 'num', 'total'), tot('EBITDA margin', 'ebitdaMargin', 'ebitdaMargin', 'pct', 'ratio'),
          { type: 'head', label: 'Balance sheet (your lines)' }]).concat(S.bs.filter(function (l) { return kind(l) === 'A'; }).map(lineRow)).concat([tot('Total assets', 'ta', 'ta', 'num', 'total')])
          .concat(S.bs.filter(function (l) { return kind(l) === 'L'; }).map(lineRow)).concat([tot('Total liabilities', 'tl', 'tl')]).concat(S.bs.filter(function (l) { return kind(l) === 'E'; }).map(lineRow))
          .concat([tot('Total equity', 'te', 'te'), tot('Check: assets − liabilities − equity', 'check', 'check', 'dec', 'check'),
            { type: 'head', label: 'Cash flow (derived)' }, tot('Capex', 'capex', 'capex'), tot('Dividends', 'dividends', 'dividends'), tot('Cash from operations', null, 'cfo'), tot('Cash from investing', null, 'cfi'), tot('Cash from financing', null, 'cff'),
            tot('Net change in cash', null, 'netCash', 'num', 'total'), tot('Check: cash flow − change in cash', null, 'cashCheck', 'dec', 'check')]) });
        return ctx.group([ctx.panel('Integrated projection', [t])]);
      }], ['need', 'Cash need', function (ctx) {
        var S = ctx.S, cols = S.meta.projYears.map(function (y) { return { label: y, cls: 'proj' }; }), Nd = function () { return ctx.R.need; };
        function r(label, k, cls, fmt) { return { label: label, cls: cls || '', cell: function (c) { return ctx.calc(function () { return Nd()[k][c]; }, fmt || 'num', k === 'surplus' || k === 'excess' ? function (v) { return v < -0.5; } : null); } }; }
        var t = G.table({ id: 'cm-n', corner: ul(S) + ' · ' + S.settings.scenario, cols: cols, rows: [
          { type: 'head', label: 'Cash available before new funding' }, r('Opening cash', 'open'), r('Cash from operations', 'cfo'), r('Cash from investing', 'cfi'), r('Cash from financing (scheduled debt, equity, dividends)', 'cff'),
          r('Cash available before new funding', 'avail', 'total'), r('Minimum cash required', 'minReq'), r('Surplus / (deficit) before new funding', 'surplus', 'sub'),
          { type: 'head', label: 'Funding to hold the minimum' }, r('After-tax cost of earlier funding', 'cost'), r('Cumulative cost of funding', 'cumCost'),
          r('Funding balance required (cash need)', 'bal', 'total'), r('New funding drawn / (repaid)', 'draw'), r('Cash after funding', 'after'), r('Excess cash over minimum', 'excess', 'ratio')] });
        var f = G.form({ id: 'cm-nf', onChange: ctx.recompute, fields: [
          { key: 'mm', label: 'Minimum cash method', options: [['amount', 'Fixed amount'], ['pctCA', '% of non-cash current assets'], ['pctRev', '% of revenue']], get: function () { return S.need.minMode; }, set: function (v) { S.need.minMode = v; } },
          ctx.field('mc', 'Minimum cash (fixed amount)', 'fin.minCash', 'num', { unit: ul(S) }), ctx.field('mp', 'Minimum cash % (methods 2 and 3)', 'need.minPct', 'pct', { unit: '%' }),
          ctx.field('rt', 'Rate on funding facility (nominal, pre-tax)', 'need.rate', 'pct2', { unit: '%' }), ctx.field('bf', 'Buffer on peak funding need', 'need.buffer', 'pct', { unit: '%' }),
          { type: 'head', label: 'Result' },
          { key: 'pk', label: 'Peak funding need', strong: true, calc: function () { return U.fmtNum(Nd().peak) + (Nd().peak > 0 ? ' by ' + Nd().peakYear : ''); } },
          { key: 'pb', label: 'Peak funding need incl. buffer', calc: function () { return U.fmtNum(Nd().withBuffer); } },
          { key: 'fy', label: 'First year of shortfall', calc: function () { return Nd().firstIdx >= 0 ? S.meta.projYears[Nd().firstIdx] : '—'; } }] });
        var sc = G.table({ id: 'cm-ns', corner: 'Scenario', cols: ctx.scenCols(), rows: [
          { label: 'Peak funding need', cls: 'total', cell: function (c) { return ctx.calc(function () { return ctx.R.scen[ctx.scenKey(c)].need.peak; }); } },
          { label: 'Year of peak', cell: function (c) { return ctx.calc(function () { return ctx.R.scen[ctx.scenKey(c)].need.peakYear; }, 'text'); } },
          { label: 'Lowest cash before new funding', cell: function (c) { return ctx.calc(function () { return Math.min.apply(null, ctx.R.scen[ctx.scenKey(c)].need.avail); }); } }] });
        var note = h('p', { class: 'muted', text: 'Cash available before new funding = opening cash + operating + investing + scheduled financing (the Financing table on Drivers). The funding balance keeps cash at the minimum and carries the after-tax cost of earlier funding (interest on the opening balance; Fisher-converted in real terms). Use the peak as the size of the bond, loan or capital increase: Fundraising and Bond Issue vs No-issue read it from here.' });
        return { el: h('div', { class: 'stack' }, [ctx.two(ctx.panel('Method', [f]), ctx.panel('By scenario', [sc])), ctx.panel('Cash surplus / (deficit)', [note, t])]),
          refresh: function () { t.refresh(); f.refresh && f.refresh(); sc.refresh(); } };
      }], ['fcf', 'FCF & value', function (ctx) {
        var S = ctx.S, cols = S.meta.projYears.map(function (y) { return { label: y, cls: 'proj' }; });
        function r(label, k, fmt, cls, neg) { return { label: label, cls: cls || '', cell: function (c) { return ctx.calc(function () { var v = ctx.R.P.t[k][c]; return neg ? -v : v; }, fmt); } }; }
        var t = G.table({ id: 'cm-fc', corner: ul(S), cols: cols, rows: [r('EBIT', 'ebit'), r('Tax rate', 'taxRate', 'pct', 'ratio'), r('NOPAT', 'nopat', 'num', 'sub'), r('Plus: D&A', 'da'), r('Less: capex', 'capex', 'num', '', true),
          r('Less: increase in NWC', 'dNwc', 'num', '', true), r('Unlevered free cash flow', 'ufcf', 'num', 'total'), r('Discount factor', 'df', 'dec3'), r('PV of UFCF', 'pv', 'num', 'sub')] });
        var tE = G.table({ id: 'cm-fe', corner: ul(S), cols: cols, rows: [r('Net income', 'ni'), r('Plus: D&A', 'da'), r('Less: capex', 'capex', 'num', '', true),
          { label: 'Less: increase in NWC and other operating items', cell: function (c) { return ctx.calc(function () { var V = ctx.R.VE, t = ctx.R.P.t; return V.fcfe[c] - t.ni[c] - t.da[c] + t.capex[c] - netB(c); }); } },
          { label: 'Plus: net borrowing (debt and debt-like)', cell: function (c) { return ctx.calc(function () { return netB(c); }); } },
          { label: 'Free cash flow to equity', cls: 'total', cell: function (c) { return ctx.calc(function () { return ctx.R.VE.fcfe[c]; }); } }] });
        function netB(c) { var t = ctx.R.P.t, H = ctx.R.H, l = H.n - 1; return t.debt[c] + t.debtLike[c] - (c ? t.debt[c - 1] + t.debtLike[c - 1] : H.debt[l] + H.debtLike[l]); }
        var both = G.table({ id: 'cm-both', corner: ul(S), cols: [{ label: 'FCFF · Gordon' }, { label: 'FCFF · exit' }, { label: 'FCFF · blended' }, { label: 'FCFE · Gordon' }, { label: 'FCFE · exit' }, { label: 'FCFE · blended' }], rows: [
          ['Equity value', 'eqG', 'eqX', 'eqBlend', 'total'], ['Value per share (' + S.meta.currency + ')', 'psG', 'psX', 'psBlend', 'total'], ['Enterprise value (FCFE: equity + net debt)', 'evG', 'evX', 'evBlend', '']
        ].map(function (x) { return { label: x[0], cls: x[4], cell: function (c) { return ctx.calc(function () { var V = c < 3 ? ctx.R.VF : ctx.R.VE; return V[x[1 + (c % 3)]]; }); } }; }).concat([
          { label: 'Discount rate', cell: function (c) { return c % 3 === 0 ? ctx.calc(function () { return (c < 3 ? ctx.R.VF : ctx.R.VE).wacc; }, 'pct') : null; } },
          { label: 'Exit multiple used', cell: function (c) { return c % 3 === 1 ? ctx.calc(function () { var V = c < 3 ? ctx.R.VF : ctx.R.VE; return EXITS[V.exit].label + (V.cf === 'fcfe' && V.exit === 'evEbitda' ? ' − net debt' : '') + ' · ' + U.fmtX(V.mult); }, 'text') : null; } },
          { label: 'Terminal value share', cell: function (c) { return c % 3 === 0 ? ctx.calc(function () { return (c < 3 ? ctx.R.VF : ctx.R.VE).tvShareG; }, 'pct') : null; } }]) });
        var V = function () { return ctx.R.V; };
        var v = G.table({ id: 'cm-v', corner: ul(S), cols: [{ label: 'Gordon' }, { label: 'Exit multiple' }, { label: 'Blended' }], rows: [
          ['Enterprise value', 'evG', 'evX', 'evBlend', 'sub'], ['Equity value', 'eqG', 'eqX', 'eqBlend', 'total'], ['Value per share (' + S.meta.currency + ')', 'psG', 'psX', 'psBlend', 'total']
        ].map(function (x) { return { label: x[0], cls: x[4], cell: function (c) { return ctx.calc(function () { return V()[x[1 + c]]; }); } }; }).concat([
          { label: 'Terminal value share of EV', cell: function (c) { return c === 0 ? ctx.calc(function () { return V().tvShareG; }, 'pct') : null; } },
          { label: 'Cross-check: implied multiple | implied g', cell: function (c) { return c === 0 ? ctx.calc(function () { return V().impliedMult; }, 'x') : c === 1 ? ctx.calc(function () { return V().impliedG; }, 'pct') : null; } }]) });
        var sc = G.table({ id: 'cm-sc', corner: 'Scenario', cols: ctx.scenCols(), rows: [
          { label: 'Value per share · blended', cls: 'total', cell: function (c) { return ctx.calc(function () { return ctx.R.scen[ctx.scenKey(c)].V.psBlend; }); } },
          { label: 'Equity value · blended', cell: function (c) { return ctx.calc(function () { return ctx.R.scen[ctx.scenKey(c)].V.eqBlend; }); } },
          { label: 'Final-year revenue', cell: function (c) { return ctx.calc(function () { return ctx.R.scen[ctx.scenKey(c)].P.t.revenue[4]; }); } },
          { label: 'Final-year EBITDA margin', cell: function (c) { return ctx.calc(function () { return ctx.R.scen[ctx.scenKey(c)].P.t.ebitdaMargin[4]; }, 'pct'); } }] });
        var rv = G.form({ id: 'cm-rv', fields: [{ key: 'r', label: 'What the current price implies', calc: function () { var r = ctx.R.reverse; if (!r) return 'enter price and shares'; var f = function (x, k) { return x == null ? 'n/a' : k ? U.fmtX(x) : U.fmtPct(x, 2); }; return 'g ' + f(r.g) + ' · WACC ' + f(r.wacc) + ' · exit ' + f(r.mult, 1); } }] });
        var chk = h('ul', { class: 'checks' }); function pc() { U.clear(chk); (ctx.R.checks.length ? ctx.R.checks : [{ level: 'good', msg: 'No issues.' }]).forEach(function (c) { chk.appendChild(h('li', { class: c.level, text: c.msg })); }); } pc();
        return { el: h('div', { class: 'stack' }, [ctx.panel('Both methods side by side (selected method drives the KPIs, Excel summary and Valuation Summary)', [both]), ctx.panel('Unlevered free cash flow (FCFF)', [t]), ctx.panel('Free cash flow to equity (FCFE)', [tE]), ctx.two(ctx.panel('Value · selected method', [v, rv]), ctx.panel('Model checks', [chk])), ctx.panel('Scenarios', [sc])]),
          refresh: function () { both.refresh(); t.refresh(); tE.refresh(); v.refresh(); rv.refresh(); sc.refresh(); pc(); } };
      }]] },
      { group: 'Outputs', items: [['sens', 'Sensitivity', function (ctx) {
        var a = h('div', { class: 'grid-wrap' }), b = h('div', { class: 'grid-wrap' }), c = h('div', { class: 'grid-wrap' }), d = h('div', { class: 'grid-wrap' });
        function paint() { var F = ctx.R.sensF, E = ctx.R.sensE, px = ctx.S.bridge.price, lo = function (v) { return px > 0 && v < px; };
          TK.heat(a, 'FCFF · value per share · WACC × perpetual growth', 'WACC', 'g', F.ws, F.gs, F.gordon, 'pct2', 'pct2', 'num', lo);
          TK.heat(b, 'FCFF · value per share · WACC × exit ' + F.exitLabel, 'WACC', 'multiple', F.ws, F.ms, F.exit, 'pct2', 'x', 'num', lo);
          TK.heat(c, 'FCFE · value per share · cost of equity × perpetual growth', 'ke', 'g', E.ws, E.gs, E.gordon, 'pct2', 'pct2', 'num', lo);
          TK.heat(d, 'FCFE · value per share · cost of equity × exit ' + E.exitLabel, 'ke', 'multiple', E.ws, E.ms, E.exit, 'pct2', 'x', 'num', lo); }
        paint();
        var f = G.form({ id: 'cm-st', onChange: ctx.recompute, fields: [ctx.field('w', 'WACC step', 'sens.waccStep', 'pct2', { unit: '%' }), ctx.field('g', 'Growth step', 'sens.gStep', 'pct2', { unit: '%' }), ctx.field('m', 'Multiple step', 'sens.multStep', 'dec', { unit: 'x' })] });
        return { el: h('div', { class: 'stack' }, [ctx.panel('Steps', [f, h('p', { class: 'muted', text: 'Red: below the current price. Multiple steps are a quarter of the step for multiples below 4x (EV/Sales, P/S, P/B).' })]),
          ctx.two(ctx.panel('FCFF at WACC', [a, b]), ctx.panel('FCFE at the cost of equity', [c, d]))]), refresh: paint };
      }]] }
    ]
  });
})(typeof window !== 'undefined' ? window : globalThis);
