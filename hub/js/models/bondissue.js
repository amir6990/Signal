/* =====================================================================
 * BOND ISSUE vs NO-ISSUE  (انتشار / عدم انتشار)
 * House method (ytm calculator, V32 and VaPaya bond models):
 *   - Shamsi schedule: payment dates step whole Shamsi months from subscription,
 *     moved to business days (weekends, fixed and lunar holidays)
 *   - coupon equal (face × rate / f) or actual days / 365
 *   - fees of the parties as rows: % of face or amount, one-off or annual,
 *     timing, delay, and whether the fee enters the rate presented to SEO
 *   - three XIRRs: SEO rate, true issuer cost, coupons only; cap check and solver
 *   - Shamsi fiscal-year P&L, issue vs replacement loan, coverage ratios
 *   - issue size from the Company Model cash need
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {}, F = Hub.fin, num = F.num;

  var J = Hub.jalali, SCEN = ['base', 'upside', 'downside'];
  var BASIS = { o: 'One-off', y: 'Annual' }, TIM_O = { '0': 'Issue date', M: 'Maturity' }, TIM_Y = { s: 'Start of each year', m: 'Middle of each year', e: 'End of each year', all: 'Whole term, prepaid at issue' };

  function sample() {
    return { version: 2, tool: 'bond-issue',
      meta: { issuer: 'Issuer Co. (illustrative)', currency: 'IRR', unit: 'million', notes: 'Illustrative terms; replace with the issue’s term sheet and the agreed fee letters.' },
      settings: { scenario: 'base', feeTiming: 'paid', principal: 'bullet', couponConv: 'equal' },
      bond: { amount: 6000000, issueDate: '1405/11/12', years: 4, freq: 4, coupon: 0.23 },
      cal: { conv: 'next', weekend: 2, lunar: true, extra: '' },
      fees: [
        { name: 'Market maker (بازارگردان)', pct: 0.1167, unit: '%', basis: 'y', timing: 's', delay: 0, seo: true },
        { name: 'Guarantor (ضامن)', pct: 0.01, unit: '%', basis: 'y', timing: 's', delay: 0, seo: true },
        { name: 'Underwriter (متعهد پذیره‌نویسی)', pct: 0.02, unit: '%', basis: 'o', timing: '0', delay: 3, seo: true },
        { name: 'Offering adviser and other (مشاور عرضه و سایر)', pct: 0.015, unit: '%', basis: 'o', timing: '0', delay: 3, seo: true },
        { name: 'Side-letter excess (مازاد الحاقیه)', pct: 0.066, unit: '%', basis: 'o', timing: '0', delay: 3, seo: false }],
      cap: 0.445, // rate approved by SEO, as in the user's ytm calculator
      fy: { endMonth: 12 },
      alt: { loanRate: 0.30 },
      co: { capital: 20000000, equity: 35000000, netIncome: 9000000, ebitda: 16000000, financeCost: 2500000, taxRate: 0.25 },
      scen: { base: { ni: 0, loan: 0 }, upside: { ni: 0.15, loan: -0.02 }, downside: { ni: -0.25, loan: 0.04 } },
      sens: { couponStep: 0.01, feeStep: 0.25 }, sources: {} };
  }
  function blank() { var s = sample(); s.meta.issuer = 'New issue'; s.meta.notes = ''; s.co = { capital: 0, equity: 0, netIncome: 0, ebitda: 0, financeCost: 0, taxRate: 0.25 }; return s; }
  function migrate(S) {
    if (!S.cal) S.cal = { conv: 'next', weekend: 2, lunar: true, extra: '' };
    if (!Array.isArray(S.fees)) { var f = S.fees || {}; S.fees = [{ name: 'Market maker', pct: num(f.mm), unit: '%', basis: 'y', timing: 's', delay: 0, seo: true }, { name: 'Guarantor', pct: num(f.guarantee), unit: '%', basis: 'y', timing: 's', delay: 0, seo: true }, { name: 'Underwriter', pct: num(f.underwriting) + num(f.otherUpfront), unit: '%', basis: 'o', timing: '0', delay: 0, seo: true }]; }
    if (S.cap == null) S.cap = 0.35; if (!S.settings.couponConv) S.settings.couponConv = 'equal'; if (!S.fy || S.fy.endMonth > 12) S.fy = { endMonth: 12 };
    return S;
  }

  /* ---------- schedule (Jalali months, business-day adjusted) ---------- */
  function schedule(S, scale) {
    var b = S.bond, f = Math.max(1, Math.round(num(b.freq))), step = 12 / f, Y = Math.max(1, Math.round(num(b.years))), n = Y * f, A = num(b.amount), d0 = J.parse(b.issueDate);
    if (!isFinite(d0)) throw new Error('Issue date not recognised: use 1405/11/12 (Shamsi) or 2027-02-01.');
    var dj = J.d2j(d0), pd = b.payDay && b.payDay !== 'auto' ? Math.round(num(b.payDay)) : 0, at = function (off) { var x = J.jAdd(dj.jy, dj.jm, dj.jd, off); if (pd > 0) x[2] = Math.min(pd, J.jLen(x[0], x[1])); return J.j2d(x[0], x[1], x[2]); };
    var wk = Math.round(num(S.cal.weekend)) || 1, H = J.holidays(d0, at(Y * 12), !!S.cal.lunar, String(S.cal.extra || '').split(',').filter(Boolean));
    var shifts = [], fix = function (raw, label) { if (raw === d0) return d0; var a = J.adjust(raw, S.cal.conv, wk, H); if (a.d !== raw) shifts.push({ label: label, raw: raw, adj: a.d, why: a.why }); return a.d; };
    var per = [], prev = d0, bal = A, eq = S.settings.couponConv !== 'act365', amort = S.settings.principal === 'equal';
    for (var k = 1; k <= n; k++) {
      var d = fix(at(Math.round(step * k)), (k === n ? 'Coupon + principal ' : 'Coupon ') + k), dd = d - prev;
      var cpn = eq ? bal * num(b.coupon) / f : bal * num(b.coupon) * dd / 365, prin = amort ? A / n : (k === n ? A : 0);
      per.push({ k: k, start: prev, end: d, days: dd, open: bal, coupon: cpn, principal: prin, close: bal - prin });
      bal -= prin; prev = d;
    }
    var mat = per[per.length - 1].end, sc = scale == null ? 1 : scale, ev = [];
    S.fees.forEach(function (fe, i) {
      var amt = (fe.unit === 'A' ? num(fe.pct) : A * num(fe.pct)) * sc, dl = Math.round(num(fe.delay)) || 0;
      if (fe.basis !== 'y') { var raw = (fe.timing === 'M' ? at(Y * 12) : d0) + dl; ev.push({ fee: i, name: fe.name, date: fix(raw, fe.name), amount: amt, from: d0, to: mat, seo: !!fe.seo, mult: 1 }); }
      else if (fe.timing === 'all') ev.push({ fee: i, name: fe.name, date: fix(d0 + dl, fe.name), amount: amt * Y, from: d0, to: mat, seo: !!fe.seo, mult: Y });
      else for (var y = 0; y < Y; y++) { var off = fe.timing === 's' ? y * 12 : fe.timing === 'm' ? y * 12 + 6 : (y + 1) * 12; ev.push({ fee: i, name: fe.name + ' · year ' + (y + 1), date: fix(at(off) + dl, fe.name + ' ' + (y + 1)), amount: amt, from: at(y * 12), to: Math.min(at((y + 1) * 12), mat), seo: !!fe.seo, mult: 1 }); }
    });
    ev.sort(function (a, c) { return a.date - c.date; });
    return { per: per, fees: ev, d0: d0, mat: mat, last: Math.max(mat, ev.length ? ev[ev.length - 1].date : mat), f: f, Y: Y, A: A, shifts: shifts };
  }
  // issuer cash flows by date; which: 'all' | 'seo' | 'bare'
  function flows(sc, which) {
    var m = {}; function add(d, v) { m[d] = (m[d] || 0) + v; }
    add(sc.d0, sc.A);
    if (which !== 'bare') sc.fees.forEach(function (x) { if (which === 'all' || x.seo) add(x.date, -x.amount); });
    sc.per.forEach(function (p) { add(p.end, -(p.coupon + p.principal)); });
    return Object.keys(m).map(Number).sort(function (a, b) { return a - b; }).map(function (k) { return { date: k, cf: m[k] }; });
  }
  function xnpv(r, cf) { var t0 = cf[0].date; return cf.reduce(function (s, x) { return s + x.cf / Math.pow(1 + r, (x.date - t0) / 365); }, 0); }
  function xirr(cf) { return F.solve(function (r) { return xnpv(r, cf); }, -0.95, 20); }
  function bankEq(r) { return 12 * (Math.pow(1 + r, 1 / 12) - 1); }
  function rates(S, scale, cpn) { var s2 = S; if (cpn != null) { s2 = JSON.parse(JSON.stringify(S)); s2.bond.coupon = cpn; } var sc = schedule(s2, scale); return { all: xirr(flows(sc, 'all')), seo: xirr(flows(sc, 'seo')), bare: xirr(flows(sc, 'bare')) }; }

  /* ---------- fiscal years (Jalali year ends) ---------- */
  function fyEnds(S, sc) {
    var M = Math.max(1, Math.min(12, Math.round(num(S.fy.endMonth)) || 12)), end = function (jy) { return J.j2d(jy, M, J.jLen(jy, M)); };
    var jy = J.d2j(sc.d0).jy - 1; while (end(jy) < sc.d0) jy++;
    var out = [], start = end(jy - 1);
    while (start < sc.last) { var e = end(jy); out.push({ start: start, end: e, label: 'FY' + jy }); start = e; jy++; }
    return out;
  }
  function overlap(a0, a1, b0, b1) { return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)); }

  function runScen(S, k) {
    var sc = schedule(S), fys = fyEnds(S, sc), sv = S.scen[k] || { ni: 0, loan: 0 };
    var eff = xirr(flows(sc, 'all')), seo = xirr(flows(sc, 'seo')), bare = xirr(flows(sc, 'bare'));
    var loanRate = num(S.alt.loanRate) + num(sv.loan), tax = num(S.co.taxRate), paid = S.settings.feeTiming !== 'spread', eqC = S.settings.couponConv !== 'act365';
    var ni0 = num(S.co.netIncome) * (1 + num(sv.ni));
    var rows = fys.map(function (fy) {
      var inFy = function (d) { return d > fy.start && d <= fy.end; };
      var cpnAcc = sc.per.reduce(function (s, p) { return s + (p.days > 0 ? p.coupon * overlap(p.start, p.end, fy.start, fy.end) / p.days : 0); }, 0);
      var cpnCash = sc.per.reduce(function (s, p) { return s + (inFy(p.end) ? p.coupon : 0); }, 0);
      var prinCash = sc.per.reduce(function (s, p) { return s + (inFy(p.end) ? p.principal : 0); }, 0);
      var feeCash = sc.fees.reduce(function (s, x) { return s + (inFy(x.date) ? x.amount : 0); }, 0);
      var feeExp = paid ? feeCash : sc.fees.reduce(function (s, x) { var L = x.to - x.from; return s + (L > 0 ? x.amount * overlap(x.from, x.to, fy.start, fy.end) / L : (inFy(x.date) ? x.amount : 0)); }, 0);
      var bondCost = cpnAcc + feeExp, loanCost = sc.per.reduce(function (s, p) { return s + p.open * loanRate * overlap(p.start, p.end, fy.start, fy.end) / 365; }, 0);
      return { label: fy.label, start: fy.start, end: fy.end, cpnAcc: cpnAcc, cpnCash: cpnCash, prin: prinCash, feeCash: feeCash, feeExp: feeExp, bondCost: bondCost, bondCash: cpnCash + feeCash,
        loanCost: loanCost, saving: loanCost - bondCost, savingAT: (loanCost - bondCost) * (1 - tax), niIssue: ni0 - bondCost * (1 - tax), niNoIssue: ni0 - loanCost * (1 - tax) };
    });
    var tot = function (k2) { return rows.reduce(function (s, r) { return s + r[k2]; }, 0); };
    var first = sc.per.slice(0, sc.f).reduce(function (s, p) { return s + p.coupon; }, 0), A = sc.A, co = S.co;
    var ratios = { amtCapital: num(co.capital) ? A / num(co.capital) : NaN, amtEquity: num(co.equity) ? A / num(co.equity) : NaN,
      niCoupon: first ? ni0 / first : NaN, ebitdaCover: (num(co.financeCost) + first) ? num(co.ebitda) * (1 + num(sv.ni)) / (num(co.financeCost) + first) : NaN };
    var up = sc.fees.filter(function (x) { return x.date <= sc.d0 + 5 && x.from === sc.d0 && (S.fees[x.fee].basis !== 'y' || S.fees[x.fee].timing !== 'e'); }).reduce(function (s, x) { return s + x.amount; }, 0);
    return { sc: sc, eff: eff, seo: seo, bare: bare, bank: bankEq(eff), rows: rows, ni0: ni0,
      totals: { bondCost: tot('bondCost'), loanCost: tot('loanCost'), saving: tot('saving'), savingAT: tot('savingAT'), fees: sc.fees.reduce(function (s, x) { return s + x.amount; }, 0), coupons: sc.per.reduce(function (s, p) { return s + p.coupon; }, 0) },
      loanRate: loanRate, loanEff: Math.pow(1 + loanRate / 12, 12) - 1, firstYearCoupon: first, ratios: ratios, net: A - up };
  }
  // largest x with g(x) <= target (g increasing in x)
  function maxUnder(g, target, lo, hi) { if (!(g(lo) <= target)) return NaN; if (g(hi) <= target) return hi; for (var i = 0; i < 100; i++) { var m = (lo + hi) / 2; if (g(m) <= target) lo = m; else hi = m; } return lo; }
  function run(S) {
    migrate(S);
    var k = S.settings.scenario, R = runScen(S, k);
    R.scen = {}; SCEN.forEach(function (s) { R.scen[s] = s === k ? R : runScen(S, s); });
    var cap = num(S.cap);
    R.solve = { cap: cap, maxCoupon: maxUnder(function (c) { return rates(S, 1, c).seo; }, cap, 0, 2), feeScale: maxUnder(function (x) { return rates(S, x).seo; }, cap, 0, 5) };
    var cs = F.grid5(num(S.bond.coupon), num(S.sens.couponStep)), fs = F.grid5(1, num(S.sens.feeStep));
    R.sens = { cs: cs, fs: fs, eff: cs.map(function (c) { return fs.map(function (x) { return rates(S, x, c).all; }); }), seo: cs.map(function (c) { return fs.map(function (x) { return rates(S, x, c).seo; }); }) };
    var c = [];
    if (!isFinite(R.eff)) c.push({ level: 'critical', msg: 'Effective cost could not be solved: check amount, dates and fees.' });
    if (R.seo > cap) c.push({ level: 'critical', msg: 'Rate presented to SEO ' + pc(R.seo) + ' is ' + ((R.seo - cap) * 100).toFixed(2) + ' points above the cap ' + pc(cap) + '.' });
    if (R.eff > R.loanEff) c.push({ level: 'warning', msg: 'True issuer cost ' + pc(R.eff) + ' is above the replacement loan’s effective rate ' + pc(R.loanEff) + ': on cost alone the issue does not pay.' });
    if (R.ratios.niCoupon < 1.5) c.push({ level: 'warning', msg: 'Net income covers first-year coupons only ' + R.ratios.niCoupon.toFixed(2) + 'x.' });
    if (R.ratios.amtEquity > 1) c.push({ level: 'warning', msg: 'Issue exceeds shareholders’ equity (' + R.ratios.amtEquity.toFixed(2) + 'x). Check the issuance limits.' });
    if (S.cal.lunar) c.push({ level: 'info', msg: 'Lunar holidays use the tabular Islamic calendar and can differ by 1–2 days from the official calendar: confirm dates before the contract and add corrections.' });
    R.checks = c;
    return R;
  }
  function pc(x) { return (x * 100).toFixed(2) + '%'; }
  function needFromCompany(S) {
    if (!Hub.tools.company) return null;
    var c = (root.Hub.util && root.Hub.util.store.get('hub.company.v1', null)) || Hub.tools.company.sample();
    var r = Hub.tools.company.run(JSON.parse(JSON.stringify(c))), k = (F.UNIT[c.meta.unit] || 1) / (F.UNIT[S.meta.unit] || 1);
    return { company: c.meta.company, peak: r.need.peak * k, withBuffer: r.need.withBuffer * k, year: r.need.peakYear };
  }

  /* ---------- Excel ---------- */
  function build(ExcelJS, S, R) {
    var X = Hub.xl, L = X.L, b = X.book(ExcelJS), cur = S.meta.currency, ut = cur + ' ' + S.meta.unit + 's', sc = R.sc, TD = function (j) { return { date: J.toDate(j) }; };
    var sum = b.sheet('Summary', [2, 52, 16, 16, 16]), A = b.sheet('Assumptions', [2, 46, 12, 12, 10, 10, 10, 10, 3, 40]), C = b.sheet('Calculations', [2, 30, 13, 13, 13, 9, 16, 16, 16, 16, 9]),
      Fy = b.sheet('Fiscal years', [2, 46].concat(new Array(R.rows.length).fill(14))), Sn = b.sheet('Sensitivity', [2, 16, 12, 12, 12, 12, 12]);
    A.title('Assumptions', S.meta.issuer + ' · ' + ut + ' · blue = input'); var a = {}, r = 4;
    function scl(key, label, unit, v, fmt, note) { A.put(1, r, label); A.put(2, r, unit, 'unit'); A.put(3, r, v, 'in', fmt); if (note) A.put(9, r, note, 'sub'); a[key] = A.ref(3, r); r++; }
    A.sec(r++, 'Issue terms', 9);
    scl('amt', 'Face amount', ut, num(S.bond.amount), 'money'); scl('d0', 'Subscription date (' + J.jstr(sc.d0) + ')', 'date', TD(sc.d0), 'date');
    scl('yrs', 'Tenor', 'years', sc.Y, 'int'); scl('f', 'Coupon payments per year', '#', sc.f, 'int');
    scl('cpn', 'Coupon / profit rate (annual)', '%', num(S.bond.coupon), 'pct2');
    scl('cc', 'Coupon convention (1 equal: face × rate / f, 0 actual days / 365)', '#', S.settings.couponConv === 'act365' ? 0 : 1, 'int');
    scl('cap', 'SEO cap on the effective rate', '%', num(S.cap), 'pct2', 'Rate presented to SEO includes only fees flagged 1');
    r++; A.sec(r++, 'Fees of the issue parties (ارکان)', 9, ['Rate / amount', 'Unit', 'Basis', 'Timing', 'Delay', 'In SEO rate'], 2);
    var feeRow = {};
    S.fees.forEach(function (fe, i) {
      A.put(1, r, fe.name); A.put(3, r, num(fe.pct), 'in', fe.unit === 'A' ? 'money' : 'pct2'); A.put(4, r, fe.unit === 'A' ? ut : '% face', 'unit');
      A.put(5, r, BASIS[fe.basis === 'y' ? 'y' : 'o']); A.put(6, r, (fe.basis === 'y' ? TIM_Y : TIM_O)[fe.timing] || fe.timing); A.put(7, r, num(fe.delay), null, 'int'); A.put(8, r, fe.seo ? 1 : 0, 'in', 'int');
      feeRow[i] = r; r++;
    });
    A.put(1, r, 'Basis, timing and delay set the dates and are fixed at export; rates, amounts and the SEO flag stay live.', 'sub'); r++;
    r++; A.sec(r++, 'Issue costs in P&L, no-issue alternative and company', 9);
    scl('ft', 'Issue costs in P&L (1 when paid, 0 spread over the period covered)', '#', S.settings.feeTiming === 'spread' ? 0 : 1, 'int');
    scl('scen', 'Scenario (1 Base, 2 Upside, 3 Downside)', '#', SCEN.indexOf(S.settings.scenario) + 1, 'int');
    A.put(1, r, 'Replacement loan rate · Base / Upside / Downside'); SCEN.forEach(function (k, j) { A.put(3 + j, r, num(S.alt.loanRate) + num(S.scen[k].loan), 'in', 'pct2'); }); var lr = r; r++;
    A.put(1, r, 'Net income change · Base / Upside / Downside'); SCEN.forEach(function (k, j) { A.put(3 + j, r, num(S.scen[k].ni), 'in', 'pct'); }); var nr = r; r++;
    A.put(1, r, 'Active loan rate'); A.put(3, r, { f: '=CHOOSE(' + a.scen + ',D' + lr + ',E' + lr + ',F' + lr + ')' }, 'calc', 'pct2'); a.lr = A.ref(3, r); r++;
    A.put(1, r, 'Active net income change'); A.put(3, r, { f: '=CHOOSE(' + a.scen + ',D' + nr + ',E' + nr + ',F' + nr + ')' }, 'calc', 'pct'); a.nid = A.ref(3, r); r++;
    scl('cap2', 'Share capital', ut, num(S.co.capital), 'money'); scl('eq', 'Shareholders’ equity', ut, num(S.co.equity), 'money'); scl('ni', 'Net income before the new financing (annual)', ut, num(S.co.netIncome), 'money');
    scl('eb', 'EBITDA (annual)', ut, num(S.co.ebitda), 'money'); scl('fc', 'Existing finance cost (annual)', ut, num(S.co.financeCost), 'money'); scl('tx', 'Tax rate', '%', num(S.co.taxRate), 'pct');

    /* Calculations */
    C.title('Calculations', 'Coupon schedule (Shamsi months, business-day adjusted) · issue costs · dated cash flows · effective rates');
    var n = sc.per.length, h0 = 5;
    C.sec(4, 'Coupon schedule', 10, ['Start', 'Payment date', 'Days', 'Opening', 'Coupon', 'Principal', 'Closing'], 2);
    sc.per.forEach(function (p, i) {
      var rr = h0 + i;
      C.put(1, rr, (i + 1) + ' · ' + J.jstr(p.end)); C.put(2, rr, TD(p.start), null, 'date'); C.put(3, rr, TD(p.end), null, 'date');
      C.put(4, rr, { f: '=D' + rr + '-C' + rr }, 'calc', 'int');
      C.put(5, rr, i === 0 ? { f: '=' + a.amt } : { f: '=I' + (rr - 1) }, 'calc', 'money');
      C.put(6, rr, { f: '=IF(' + a.cc + '=1,F' + rr + '*' + a.cpn + '/' + a.f + ',F' + rr + '*' + a.cpn + '*E' + rr + '/365)' }, 'calc', 'money');
      C.put(7, rr, { f: S.settings.principal === 'equal' ? '=' + a.amt + '/' + n : (i === n - 1 ? '=' + a.amt : '=0') }, 'calc', 'money');
      C.put(8, rr, { f: '=F' + rr + '-H' + rr }, 'calc', 'money');
    });
    var pe = h0 + n - 1, cr = pe + 1;
    C.put(1, cr, 'Total', 'total'); C.put(6, cr, { f: '=SUM(G' + h0 + ':G' + pe + ')' }, 'total', 'money'); C.put(7, cr, { f: '=SUM(H' + h0 + ':H' + pe + ')' }, 'total', 'money');
    var fr0 = cr + 3; C.sec(fr0 - 1, 'Issue costs', 10, ['Paid on', 'Covers from', 'Covers to', 'In SEO', 'Amount'], 2);
    sc.fees.forEach(function (x, j) {
      var rr = fr0 + j, fe = S.fees[x.fee], ar = feeRow[x.fee];
      C.put(1, rr, x.name); C.put(2, rr, TD(x.date), null, 'date'); C.put(3, rr, TD(x.from), null, 'date'); C.put(4, rr, TD(x.to), null, 'date');
      C.put(5, rr, { f: "='Assumptions'!$I$" + ar }, 'calc', 'int');
      C.put(6, rr, { f: (fe.unit === 'A' ? "='Assumptions'!$D$" + ar : '=' + a.amt + "*'Assumptions'!$D$" + ar) + (x.mult > 1 ? '*' + a.yrs : '') }, 'calc', 'money');
    });
    var fe0 = fr0 + sc.fees.length - 1;
    var dates = flows(sc, 'all').map(function (x) { return x.date; });
    var cf0 = fe0 + 3; C.sec(cf0 - 1, 'Dated cash flows of the issuer (receipt +, payment −)', 10, ['Date', 'True cost', 'SEO rate', 'Coupons only'], 2);
    var FR = function (col) { return '$' + col + '$' + fr0 + ':$' + col + '$' + fe0; }, PR = function (col) { return '$' + col + '$' + h0 + ':$' + col + '$' + pe; };
    dates.forEach(function (d, j) {
      var rr = cf0 + j, base = (j === 0 ? a.amt : '0') + '-SUMIF(' + PR('D') + ',C' + rr + ',' + PR('G') + ')-SUMIF(' + PR('D') + ',C' + rr + ',' + PR('H') + ')';
      C.put(1, rr, J.jstr(d)); C.put(2, rr, TD(d), null, 'date');
      C.put(3, rr, { f: '=' + base + '-SUMIF(' + FR('C') + ',C' + rr + ',' + FR('G') + ')' }, 'calc', 'money');
      C.put(4, rr, { f: '=' + base + '-SUMIFS(' + FR('G') + ',' + FR('C') + ',C' + rr + ',' + FR('F') + ',1)' }, 'calc', 'money');
      C.put(5, rr, { f: '=' + base }, 'calc', 'money');
    });
    var ce = cf0 + dates.length - 1, kr = ce + 2;
    var xr = function (col) { return '=XIRR(' + col + cf0 + ':' + col + ce + ',C' + cf0 + ':C' + ce + ')'; };
    C.put(1, kr, 'True issuer cost (XIRR, all fees)', 'total'); C.put(3, kr, { f: xr('D') }, 'total', 'pct2'); a.eff = "'Calculations'!$D$" + kr;
    C.put(1, kr + 1, 'Rate presented to SEO (fees flagged 1)', 'total'); C.put(3, kr + 1, { f: xr('E') }, 'total', 'pct2');
    C.put(1, kr + 2, 'Coupons and principal only'); C.put(3, kr + 2, { f: xr('F') }, 'calc', 'pct2');
    C.put(1, kr + 3, 'Bank-equivalent of true cost (NOMINAL, 12)'); C.put(3, kr + 3, { f: '=NOMINAL(D' + kr + ',12)' }, 'calc', 'pct2');
    C.put(1, kr + 4, 'SEO rate vs cap (positive = above cap)'); C.put(3, kr + 4, { f: '=D' + (kr + 1) + '-' + a.cap }, 'calc', 'pct2');
    C.put(1, kr + 5, 'Replacement loan · effective annual rate'); C.put(3, kr + 5, { f: '=EFFECT(' + a.lr + ',12)' }, 'calc', 'pct2');
    C.put(1, kr + 6, 'Dates follow the Shamsi calendar with business-day adjustment and are fixed at export; amounts and rates stay live.', 'sub');

    /* Fiscal years */
    var nF = R.rows.length, c0 = 3, CS = "'Calculations'!";
    Fy.title('Fiscal years', 'Issue vs no issue · ' + ut + ' · Shamsi fiscal years');
    Fy.put(1, 4, 'Fiscal year', 'hdr'); R.rows.forEach(function (x, j) { Fy.put(c0 + j, 4, x.label, 'hdr'); });
    Fy.put(1, 5, 'Starts after'); Fy.put(1, 6, 'Ends'); R.rows.forEach(function (x, j) { Fy.put(c0 + j, 5, TD(x.start), null, 'date'); Fy.put(c0 + j, 6, TD(x.end), null, 'date'); });
    var rng = function (col) { return CS + PR(col); }, frg = function (col) { return CS + FR(col); };
    var fyr = {}, rw = 8; Fy.sec(7, 'Issue (انتشار)', nF + 1);
    function fRow(key, label, fn, fmt, kind) { Fy.put(1, rw, label, kind); for (var j = 0; j < nF; j++) Fy.put(c0 + j, rw, { f: fn(L(c0 + j)) }, kind || 'calc', fmt || 'money'); fyr[key] = rw; rw++; }
    var ovl = function (s, e, cl) { return '((' + e + '<' + cl + '$6)*' + e + '+(' + e + '>=' + cl + '$6)*' + cl + '$6-(' + s + '>' + cl + '$5)*' + s + '-(' + s + '<=' + cl + '$5)*' + cl + '$5)*((' + e + '>' + cl + '$5)*(' + s + '<' + cl + '$6))'; };
    fRow('cacc', 'Coupon expense (accrued by days)', function (cl) { return '=SUMPRODUCT(' + rng('G') + ',' + ovl(rng('C'), rng('D'), cl) + '/' + rng('E') + ')'; });
    fRow('ccash', 'Coupon paid', function (cl) { return '=SUMIFS(' + rng('G') + ',' + rng('D') + ',">"&' + cl + '$5,' + rng('D') + ',"<="&' + cl + '$6)'; });
    fRow('prin', 'Principal repaid', function (cl) { return '=SUMIFS(' + rng('H') + ',' + rng('D') + ',">"&' + cl + '$5,' + rng('D') + ',"<="&' + cl + '$6)'; });
    fRow('fcash', 'Issue costs paid', function (cl) { return '=SUMIFS(' + frg('G') + ',' + frg('C') + ',">"&' + cl + '$5,' + frg('C') + ',"<="&' + cl + '$6)'; });
    fRow('fexp', 'Issue costs expensed', function (cl) { return '=IF(' + a.ft + '=1,' + cl + fyr.fcash + ',SUMPRODUCT(' + frg('G') + ',' + ovl(frg('D'), frg('E'), cl) + '/(' + frg('E') + '-' + frg('D') + ')))'; });
    fRow('bcost', 'Finance cost in P&L · bond', function (cl) { return '=' + cl + fyr.cacc + '+' + cl + fyr.fexp; }, 'money', 'total');
    fRow('bcash', 'Cash paid · coupons and issue costs', function (cl) { return '=' + cl + fyr.ccash + '+' + cl + fyr.fcash; });
    rw++; Fy.sec(rw++, 'No issue (عدم انتشار) · replacement loan', nF + 1);
    fRow('lcost', 'Finance cost in P&L · loan', function (cl) { return '=SUMPRODUCT(' + rng('F') + ',' + a.lr + '/365*' + ovl(rng('C'), rng('D'), cl) + ')'; }, 'money', 'total');
    rw++; Fy.sec(rw++, 'Comparison', nF + 1);
    fRow('sav', 'Saving / (extra cost) from issuing, pre-tax', function (cl) { return '=' + cl + fyr.lcost + '-' + cl + fyr.bcost; }, 'money', 'total');
    fRow('savat', 'Saving / (extra cost), after tax', function (cl) { return '=' + cl + fyr.sav + '*(1-' + a.tx + ')'; });
    fRow('nii', 'Net income · issue', function (cl) { return '=' + a.ni + '*(1+' + a.nid + ')-' + cl + fyr.bcost + '*(1-' + a.tx + ')'; });
    fRow('nin', 'Net income · no issue', function (cl) { return '=' + a.ni + '*(1+' + a.nid + ')-' + cl + fyr.lcost + '*(1-' + a.tx + ')'; });
    var last = L(c0 + nF - 1);
    rw++; Fy.put(1, rw, 'Total saving / (extra cost), pre-tax', 'total'); Fy.put(c0, rw, { f: '=SUM(' + L(c0) + fyr.sav + ':' + last + fyr.sav + ')' }, 'total', 'money'); fyr.tot = rw; rw++;
    Fy.put(1, rw, 'Check: coupons paid − schedule total'); Fy.put(c0, rw, { f: '=ROUND(SUM(' + L(c0) + fyr.ccash + ':' + last + fyr.ccash + ')-' + CS + 'G' + cr + ',4)' }, 'calc', 'money2'); rw++;
    Fy.put(1, rw, 'Check: coupons accrued − coupons paid (whole life)'); Fy.put(c0, rw, { f: '=ROUND(SUM(' + L(c0) + fyr.cacc + ':' + last + fyr.cacc + ')-SUM(' + L(c0) + fyr.ccash + ':' + last + fyr.ccash + '),4)' }, 'calc', 'money2'); rw++;

    /* Sensitivity */
    Sn.title('Sensitivity', 'Values at export (XIRR needs the date list)');
    function grid(top, title, data) {
      Sn.sec(top, title, 6);
      R.sens.fs.forEach(function (v, j) { Sn.put(2 + j, top + 1, v, 'sec', 'x2'); });
      R.sens.cs.forEach(function (v, i2) { Sn.put(1, top + 2 + i2, v, 'sec', 'pct2'); data[i2].forEach(function (x, j) { Sn.put(2 + j, top + 2 + i2, x, null, 'pct2'); }); });
      Sn.heat('C' + (top + 2) + ':G' + (top + 6)); return top + 8;
    }
    grid(grid(4, 'True cost · coupon ↓ × fee scale (1 = current) →', R.sens.eff), 'SEO rate · coupon ↓ × fee scale →', R.sens.seo);

    /* Summary */
    sum.title(S.meta.issuer + ' · Bond issue vs no issue', ut + ' · subscription ' + J.jstr(sc.d0) + ' · ' + new Date().toISOString().slice(0, 10));
    sum.sec(4, 'Cost of the issue (active scenario)', 3);
    [['Face amount', '=' + a.amt, 'money'], ['Coupon / profit rate', '=' + a.cpn, 'pct2'], ['Rate presented to SEO', "='Calculations'!D" + (kr + 1), 'pct2'], ['True issuer cost (all fees)', '=' + a.eff, 'pct2'],
      ['Coupons only', "='Calculations'!D" + (kr + 2), 'pct2'], ['SEO rate vs cap', "='Calculations'!D" + (kr + 4), 'pct2'], ['Replacement loan · effective rate', "='Calculations'!D" + (kr + 5), 'pct2'],
      ['Total saving / (extra cost) vs loan, pre-tax', "='Fiscal years'!C" + fyr.tot, 'money']]
      .forEach(function (x, i3) { sum.put(1, 5 + i3, x[0], i3 === 3 ? 'total' : null); sum.put(2, 5 + i3, { f: x[1] }, i3 === 3 ? 'total' : 'calc', x[2]); });
    sum.sec(14, 'Coverage', 3);
    var fyc = "SUM('Calculations'!G" + h0 + ':G' + (h0 + sc.f - 1) + ')';
    [['Issue / share capital', '=' + a.amt + '/' + a.cap2, 'x2'], ['Issue / shareholders’ equity', '=' + a.amt + '/' + a.eq, 'x2'], ['Net income / first-year coupons', '=' + a.ni + '*(1+' + a.nid + ')/' + fyc, 'x2'],
      ['EBITDA / (existing finance cost + first-year coupons)', '=' + a.eb + '*(1+' + a.nid + ')/(' + a.fc + '+' + fyc + ')', 'x2']]
      .forEach(function (x, i3) { sum.put(1, 15 + i3, x[0]); sum.put(2, 15 + i3, { f: x[1] }, 'calc', x[2]); });
    sum.sec(20, 'Solver and scenarios (values at export)', 4, ['Base', 'Upside', 'Downside'], 2);
    sum.put(1, 21, 'Maximum coupon within the SEO cap'); sum.put(2, 21, R.solve.maxCoupon, null, 'pct2');
    sum.put(1, 22, 'Allowed scale of fees within the cap (1 = current)'); sum.put(2, 22, R.solve.feeScale, null, 'x2');
    [['Loan rate', 'loanRate', 'pct2'], ['Total saving vs loan, pre-tax', 'sav', 'money'], ['Net income / first-year coupons', 'cov', 'x2']].forEach(function (x, i3) {
      sum.put(1, 23 + i3, x[0]); SCEN.forEach(function (k, j) { var q = R.scen[k]; sum.put(2 + j, 23 + i3, x[1] === 'sav' ? q.totals.saving : x[1] === 'cov' ? q.ratios.niCoupon : q[x[1]], null, x[2]); });
    });
    X.notes(b, ['Payment dates step whole Shamsi months from the subscription date and move to a business day (Friday / Thursday weekends, fixed Shamsi holidays, optional lunar holidays). The subscription date itself is never moved.',
      'Coupon: equal (face × rate ÷ payments per year) or actual days ÷ 365 on the opening face.',
      'Fees of the parties: % of face or a fixed amount; one-off (issue date or maturity) or annual (start, middle or end of each year, or the whole term prepaid at issue), with a payment delay in days.',
      'Three rates from the same dated cash flows: true issuer cost (all fees), rate presented to SEO (fees flagged "in SEO rate" only) and coupons only. XIRR on actual/365.',
      'Fiscal years are Shamsi years ending on the last day of the chosen month. Coupon expense accrues by days; issue costs are expensed when paid (house practice) or spread over the period they cover.',
      'No-issue case: the same face and repayment profile financed by a bank facility at the loan rate, interest accrued by days.',
      'Lunar holidays are approximate (tabular Islamic calendar). Confirm against the official calendar before contract dates are fixed.',
      'Author notes: ' + (S.meta.notes || '—')], S.sources);
    return { wb: b.wb, rows: { fyr: fyr, kr: kr } };
  }

  Hub.tools = Hub.tools || {}; Hub.tools.bondIssue = { sample: sample, blank: blank, run: run, build: build, schedule: schedule, flows: flows, xirr: xirr, migrate: migrate };
  if (typeof module !== 'undefined' && module.exports) module.exports = Hub.tools.bondIssue;
  if (!root.document || !Hub.toolkit) return;

  /* ======================= UI ======================= */
  var U = Hub.util, h = U.h, G = Hub.grid, TK = Hub.toolkit;
  function ul(S) { return S.meta.currency + ' ' + F.unitShort(S.meta.unit); }
  TK.define({
    id: 'bond-issue', title: 'Bond Issue vs No-issue', sections: ['bonds', 'finmgmt'], priority: 1, version: 2, storeKey: 'hub.bondissue.v2',
    summary: 'Murabaha / sukuk issue on the Shamsi calendar with business-day adjustment: coupons, fees of the parties, SEO rate vs true cost (XIRR), cap solver, fiscal-year P&L, issue vs replacement loan, coverage; size from the Company Model cash need.',
    sample: sample, blank: blank, run: run, scenarios: true,
    eyebrow: function (S) { return 'Bond issuance · Issue vs no issue · ' + ul(S); }, heading: function (S) { return S.meta.issuer; }, filename: function (S) { return S.meta.issuer + '_Bond_Issue'; },
    xlsx: function (S, R) { return build(root.ExcelJS, S, R).wb; },
    kpis: function (ctx) { var R = function () { return ctx.R; }; return [
      ['SEO rate', function () { return U.fmtPct(R().seo, 2); }, function () { return R().seo > num(ctx.S.cap) ? 'above cap ' + U.fmtPct(ctx.S.cap, 2) : 'cap ' + U.fmtPct(ctx.S.cap, 2) + ' · headroom ' + U.fmtPct(num(ctx.S.cap) - R().seo, 2); }],
      ['True cost', function () { return U.fmtPct(R().eff, 2); }, function () { return 'all fees · bank-eq. ' + U.fmtPct(R().bank, 2); }],
      ['Max coupon', function () { return U.fmtPct(R().solve.maxCoupon, 2); }, function () { return 'within the SEO cap'; }],
      ['vs loan', function () { return U.fmtNum(R().totals.saving); }, function () { return 'pre-tax saving · loan ' + U.fmtPct(R().loanRate, 1); }],
      ['NI / coupons', function () { return U.fmtX(R().ratios.niCoupon); }, function () { return 'first year'; }]
    ]; },
    tabs: [
      { group: 'Inputs', items: [['terms', 'Terms', function (ctx) {
        var S = migrate(ctx.S);
        var f = G.form({ id: 'bi-t', onChange: ctx.recompute, fields: [
          { key: 'is', label: 'Issuer', text: true, get: function () { return S.meta.issuer; }, set: function (v) { S.meta.issuer = v; } },
          { key: 'un', label: 'Monetary unit', options: F.UNITS, get: function () { return S.meta.unit; }, set: function (v) { S.meta.unit = v; } },
          ctx.field('am', 'Face amount', 'bond.amount', 'num', { unit: ul(S) }),
          { key: 'd0', label: 'Subscription date', text: true, unit: '1405/11/12 or 2027-02-01', get: function () { return S.bond.issueDate; }, set: function (v) { if (isFinite(J.parse(v))) S.bond.issueDate = v.trim(); else U.toast('Date not recognised: 1405/11/12 (Shamsi) or 2027-02-01', 'warn'); } },
          { key: 'gd', label: 'Converted', calc: function () { var d = ctx.R.sc.d0; return J.jstr(d) + ' · ' + J.gstr(d); } },
          ctx.field('yr', 'Tenor', 'bond.years', 'int', { unit: 'years' }),
          { key: 'fq', label: 'Coupon payments per year', options: [['4', '4 · quarterly'], ['2', '2 · semi-annual'], ['12', '12 · monthly'], ['1', '1 · annual']], get: function () { return String(S.bond.freq); }, set: function (v) { S.bond.freq = +v; } },
          ctx.field('cp', 'Coupon / profit rate (annual)', 'bond.coupon', 'pct2', { unit: '%' }),
          { key: 'cc', label: 'Coupon convention', options: [['equal', 'Equal: face × rate ÷ payments per year'], ['act365', 'Actual days ÷ 365']], get: function () { return S.settings.couponConv; }, set: function (v) { S.settings.couponConv = v; } },
          { key: 'pr', label: 'Principal', options: [['bullet', 'Bullet at maturity'], ['equal', 'Equal instalments with each coupon']], get: function () { return S.settings.principal; }, set: function (v) { S.settings.principal = v; } },
          ctx.field('cap', 'SEO cap on the effective rate', 'cap', 'pct2', { unit: '%' })] });
        var cal = G.form({ id: 'bi-cal', onChange: ctx.recompute, fields: [
          { key: 'cv', label: 'Payment date adjustment', options: [['next', 'Next business day'], ['modfollow', 'Next business day, same month'], ['prev', 'Previous business day'], ['none', 'No adjustment']], get: function () { return S.cal.conv; }, set: function (v) { S.cal.conv = v; } },
          { key: 'wk', label: 'Weekend', options: [['2', 'Thursday and Friday'], ['1', 'Friday only']], get: function () { return String(S.cal.weekend); }, set: function (v) { S.cal.weekend = +v; } },
          { key: 'lu', label: 'Lunar holidays', options: [['1', 'Apply (approximate)'], ['0', 'Ignore']], get: function () { return S.cal.lunar ? '1' : '0'; }, set: function (v) { S.cal.lunar = v === '1'; } },
          { key: 'xh', label: 'Extra or corrected holidays (Shamsi, comma-separated)', text: true, get: function () { return S.cal.extra; }, set: function (v) { S.cal.extra = v; } },
          ctx.field('fm', 'Fiscal year ends (Shamsi month)', 'fy.endMonth', 'int', { unit: '1–12' })] });
        var fees = ctx.list({ id: 'bi-fees', path: 'fees', newRow: function () { return { name: 'New party', pct: 0, unit: '%', basis: 'o', timing: '0', delay: 0, seo: true }; }, cols: [
          { key: 'name', label: 'Party / fee', kind: 'text' }, { key: 'pct', label: 'Rate or amount', fmt: 'num4' },
          { key: 'unit', label: 'Unit', kind: 'select', options: function () { return [['%', '% of face (enter as decimal)'], ['A', 'Fixed amount']]; } },
          { key: 'basis', label: 'Basis', kind: 'select', options: function () { return [['o', BASIS.o], ['y', BASIS.y]]; }, onSet: function (row) { row.timing = row.basis === 'y' ? 's' : '0'; }, repaint: true },
          { key: 'timing', label: 'Timing', kind: 'select', options: function (row) { var o = row.basis === 'y' ? TIM_Y : TIM_O; return Object.keys(o).map(function (k) { return [k, o[k]]; }); } },
          { key: 'delay', label: 'Delay (days)' }, { key: 'seo', label: 'In SEO rate', kind: 'bool' }] });
        var co = G.form({ id: 'bi-c', onChange: ctx.recompute, fields: [
          { key: 'ft', label: 'Issue costs in P&L', options: [['paid', 'When paid (house practice)'], ['spread', 'Spread over the period covered']], get: function () { return S.settings.feeTiming; }, set: function (v) { S.settings.feeTiming = v; } },
          ctx.field('lr', 'Replacement loan rate (Base)', 'alt.loanRate', 'pct2', { unit: '%' }),
          ctx.field('cap2', 'Share capital', 'co.capital', 'num', { unit: ul(S) }), ctx.field('eq', 'Shareholders’ equity', 'co.equity', 'num', { unit: ul(S) }),
          ctx.field('ni', 'Net income before the new financing', 'co.netIncome', 'num', { unit: ul(S) }), ctx.field('eb', 'EBITDA', 'co.ebitda', 'num', { unit: ul(S) }),
          ctx.field('fc', 'Existing finance cost', 'co.financeCost', 'num', { unit: ul(S) }), ctx.field('tx', 'Tax rate', 'co.taxRate', 'pct', { unit: '%' })] });
        var sc = G.table({ id: 'bi-s', corner: 'Scenario', cols: ctx.scenCols(), onChange: ctx.recompute, rows: [
          { label: 'Loan rate shift vs Base', unit: 'pp', cell: function (c) { return ctx.inVal('scen.' + ctx.scenKey(c) + '.loan', 'pct2'); } },
          { label: 'Net income change vs Base', unit: '%', cell: function (c) { return ctx.inVal('scen.' + ctx.scenKey(c) + '.ni', 'pct'); } }] });
        var st = h('p', { class: 'muted', 'aria-live': 'polite' });
        var pull = h('button', { class: 'btn ghost', type: 'button', text: 'Size from Company Model cash need', onclick: function () {
          var m = needFromCompany(S); if (!m) { st.textContent = 'Company Model not available.'; return; }
          if (!(m.peak > 0)) { st.textContent = m.company + ': no funding need in the projection.'; return; }
          S.bond.amount = Math.round(m.withBuffer); S.sources['bond.amount'] = 'Company Model cash need · ' + m.company + ' · ' + U.stamp(); ctx.rerender();
          U.toast('Face amount set to the peak cash need incl. buffer: ' + U.fmtNum(m.withBuffer) + ' (peak ' + m.year + ')', 'good');
        } });
        return ctx.group([ctx.two(ctx.panel('Issue terms', [f, h('div', { class: 'row-ctl' }, [pull]), st]), ctx.panel('Calendar', [cal])),
          ctx.panel('Fees of the issue parties (ارکان)', [h('p', { class: 'muted', text: 'Rates as decimals of face (0.02 = 2%) or fixed amounts in ' + ul(S) + '. "In SEO rate" decides whether the fee enters the rate presented to the regulator; leave side-letter items unticked. Annual fees are charged on the face amount.' }), fees]),
          ctx.two(ctx.panel('Issue costs, no-issue alternative and company', [co]), ctx.panel('Scenarios', [sc]))]);
      }]] },
      { group: 'Calculations', items: [['sched', 'Schedule', function (ctx) {
        var t = h('div', { class: 'grid-wrap' }), fe = h('div', { class: 'grid-wrap' }), sh = h('div');
        function tbl(heads, rows, numFrom) {
          var tb = h('table', { class: 'grid list' }, [h('thead', null, [h('tr', null, heads.map(function (x) { return h('th', { text: x }); }))])]), bd = h('tbody');
          rows.forEach(function (r) { bd.appendChild(h('tr', { class: r.cls || '' }, r.v.map(function (x, i) { return h('td', { class: i >= numFrom ? 'num' : '', text: String(x) }); }))); });
          tb.appendChild(bd); return tb;
        }
        function paint() {
          var R = ctx.R; U.clear(t); U.clear(fe); U.clear(sh);
          t.appendChild(tbl(['#', 'Payment date', 'Gregorian', 'Days', 'Opening', 'Coupon', 'Principal', 'Closing'], R.sc.per.map(function (p) { return { v: [p.k, J.jstr(p.end), J.gstr(p.end), p.days, U.fmtNum(p.open), U.fmtNum(p.coupon), U.fmtNum(p.principal), U.fmtNum(p.close)] }; })
            .concat([{ cls: 'total', v: ['Total', '', '', '', '', U.fmtNum(R.totals.coupons), U.fmtNum(R.sc.A), ''] }]), 3));
          fe.appendChild(tbl(['Fee', 'Paid on', 'Gregorian', 'In SEO rate', 'Amount'], R.sc.fees.map(function (x) { return { v: [x.name, J.jstr(x.date), J.gstr(x.date), x.seo ? '✓' : '—', U.fmtNum(x.amount)] }; })
            .concat([{ cls: 'total', v: ['Total', '', '', '', U.fmtNum(R.totals.fees)] }]), 4));
          if (R.sc.shifts.length) sh.appendChild(tbl(['Moved', 'Scheduled', 'Paid', 'Reason'], R.sc.shifts.map(function (x) { return { v: [x.label, J.jstr(x.raw), J.jstr(x.adj), x.why] }; }), 9));
          else sh.appendChild(h('p', { class: 'muted', text: 'No payment date falls on a weekend or holiday.' }));
        }
        paint();
        return { el: h('div', { class: 'stack' }, [ctx.panel('Coupon schedule (' + ul(ctx.S) + ')', [t]), ctx.two(ctx.panel('Fees of the parties', [fe]), ctx.panel('Business-day adjustments', [sh]))]), refresh: paint };
      }], ['fy', 'Issue vs no issue', function (ctx) {
        var wrap = h('div', { class: 'grid-wrap' }), chk = h('ul', { class: 'checks' });
        function paint() {
          var R = ctx.R; U.clear(wrap); U.clear(chk);
          var rows = [['Coupon expense (accrued by days)', 'cpnAcc'], ['Issue costs expensed', 'feeExp'], ['Finance cost in P&L · bond', 'bondCost', 'total'], ['Coupon paid', 'cpnCash'], ['Issue costs paid', 'feeCash'], ['Principal repaid', 'prin'],
            ['Finance cost in P&L · loan', 'loanCost', 'total'], ['Saving / (extra cost) from issuing, pre-tax', 'saving', 'total'], ['Saving / (extra cost), after tax', 'savingAT'], ['Net income · issue', 'niIssue'], ['Net income · no issue', 'niNoIssue']];
          var tb = h('table', { class: 'grid' }, [h('thead', null, [h('tr', null, [h('th', { text: ul(ctx.S) })].concat(R.rows.map(function (r) { return h('th', { text: r.label }); })).concat([h('th', { text: 'Total' })]))])]), bd = h('tbody');
          rows.forEach(function (x) { var tot = R.rows.reduce(function (s, r) { return s + r[x[1]]; }, 0); bd.appendChild(h('tr', { class: x[2] || '' }, [h('th', { text: x[0] })].concat(R.rows.map(function (r) { return h('td', { class: 'num' + (r[x[1]] < 0 ? ' neg' : ''), text: U.fmtNum(r[x[1]]) }); })).concat([h('td', { class: 'num', text: /^ni/.test(x[1]) ? '' : U.fmtNum(tot) })]))); });
          tb.appendChild(bd); wrap.appendChild(tb);
          (R.checks.length ? R.checks : [{ level: 'good', msg: 'No issues.' }]).forEach(function (c) { chk.appendChild(h('li', { class: c.level, text: c.msg })); });
        }
        paint();
        var cov = G.form({ id: 'bi-cv', fields: [
          { key: 'r1', label: 'Rate presented to SEO', calc: function () { return U.fmtPct(ctx.R.seo, 2); } }, { key: 'r2', label: 'True issuer cost (all fees)', calc: function () { return U.fmtPct(ctx.R.eff, 2); } },
          { key: 'r3', label: 'Coupons only', calc: function () { return U.fmtPct(ctx.R.bare, 2); } }, { key: 'r4', label: 'Net cash on the first days', calc: function () { return U.fmtNum(ctx.R.net); } },
          { key: 's1', label: 'Maximum coupon within the SEO cap', calc: function () { return U.fmtPct(ctx.R.solve.maxCoupon, 2); } }, { key: 's2', label: 'Allowed scale of fees within the cap', calc: function () { var x = ctx.R.solve.feeScale; return isFinite(x) ? x.toFixed(3) + '× current' : 'cap not reachable even with zero fees'; } },
          { type: 'head', label: 'Coverage' },
          { key: 'a', label: 'Issue / share capital', calc: function () { return U.fmtX(ctx.R.ratios.amtCapital); } }, { key: 'b', label: 'Issue / shareholders’ equity', calc: function () { return U.fmtX(ctx.R.ratios.amtEquity); } },
          { key: 'c', label: 'Net income / first-year coupons', calc: function () { return U.fmtX(ctx.R.ratios.niCoupon); } }, { key: 'd', label: 'EBITDA / (existing finance cost + first-year coupons)', calc: function () { return U.fmtX(ctx.R.ratios.ebitdaCover); } },
          { key: 'e', label: 'Replacement loan · effective annual rate', calc: function () { return U.fmtPct(ctx.R.loanEff, 2); } }] });
        var sc = G.table({ id: 'bi-sc', corner: 'Scenario', cols: ctx.scenCols(), rows: [
          { label: 'Total saving vs loan, pre-tax', cls: 'total', cell: function (c) { return ctx.calc(function () { return ctx.R.scen[ctx.scenKey(c)].totals.saving; }); } },
          { label: 'Net income / first-year coupons', cell: function (c) { return ctx.calc(function () { return ctx.R.scen[ctx.scenKey(c)].ratios.niCoupon; }, 'x'); } }] });
        return { el: h('div', { class: 'stack' }, [ctx.panel('By fiscal year', [wrap]), ctx.two(ctx.panel('Rates, solver and coverage', [cov]), ctx.panel('Checks', [chk])), ctx.panel('Scenarios', [sc])]),
          refresh: function () { paint(); cov.refresh(); sc.refresh(); } };
      }]] },
      { group: 'Outputs', items: [['sens', 'Sensitivity', function (ctx) {
        var a = h('div', { class: 'grid-wrap' }), b2 = h('div', { class: 'grid-wrap' });
        function paint() { var s = ctx.R.sens, cap = num(ctx.S.cap);
          TK.heat(a, 'Rate presented to SEO · coupon × fee scale', 'coupon', 'fees ×', s.cs, s.fs, s.seo, 'pct2', 'x', 'pct2', function (v) { return v > cap; });
          TK.heat(b2, 'True issuer cost · coupon × fee scale', 'coupon', 'fees ×', s.cs, s.fs, s.eff, 'pct2', 'x', 'pct2', function (v) { return v > ctx.R.loanEff; }); }
        paint();
        var f = G.form({ id: 'bi-st', onChange: ctx.recompute, fields: [ctx.field('c', 'Coupon step', 'sens.couponStep', 'pct2', { unit: '%' }), ctx.field('f', 'Fee scale step', 'sens.feeStep', 'dec', { unit: '×' })] });
        return { el: h('div', { class: 'stack' }, [ctx.panel('Steps', [f, h('p', { class: 'muted', text: 'Red: SEO rate above the cap (first table) or true cost above the replacement loan’s effective rate (second table).' })]), ctx.panel(null, [a]), ctx.panel(null, [b2])]), refresh: paint };
      }]] }
    ]
  });
})(typeof window !== 'undefined' ? window : globalThis);
