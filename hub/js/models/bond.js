/* =====================================================================
 * BOND PRICING & YIELD   +   BOND ISSUANCE SIZING
 * Pricing follows the Excel PRICE / YIELD convention (street convention,
 * compounding at the coupon frequency, fractional first period):
 *   dirty = Σ CF_k / (1 + y/f)^(k − 1 + DSC/E), DSC = days settlement→next coupon (E − A on 30/360),  accrued = C/f × A/E,  clean = dirty − accrued
 * Coupon dates step back from maturity; end-of-month maturities keep month-ends.
 * Day counts: 30/360 US (Excel basis 0), ACT/ACT (1), ACT/365 (3).
 * Zero-coupon (e.g. treasury bills / اخزا): coupon 0, frequency 1, ACT/365 or ACT/ACT.
 * Islamic notes with fixed periodic profit (murabaha / ijara sukuk) price the same way.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {}, F = Hub.fin, num = F.num;
  var BASIS = { '30/360': 0, 'ACT/ACT': 1, 'ACT/365': 3 };

  /* ---------- dates ---------- */
  function D(s) { var p = String(s).split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])); }
  function iso(d) { return d.toISOString().slice(0, 10); }
  function dim(y, m) { return new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); }
  function isEom(d) { return d.getUTCDate() === dim(d.getUTCFullYear(), d.getUTCMonth()); }
  function addMonths(d, k, eom) {
    var y = d.getUTCFullYear(), m = d.getUTCMonth() + k; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    var day = eom ? dim(y, m) : Math.min(d.getUTCDate(), dim(y, m));
    return new Date(Date.UTC(y, m, day));
  }
  function actual(a, b) { return Math.round((b - a) / 86400000); }
  function days360(a, b) {           // US (NASD) method, as Excel DAYS360(...,FALSE)
    var d1 = a.getUTCDate(), d2 = b.getUTCDate();
    if (d1 === 31) d1 = 30;
    if (d2 === 31 && d1 >= 30) d2 = 30;
    return (b.getUTCFullYear() - a.getUTCFullYear()) * 360 + (b.getUTCMonth() - a.getUTCMonth()) * 30 + (d2 - d1);
  }
  function schedule(settle, mat, f) {
    var step = 12 / f, eom = isEom(mat), dates = [], k = 0, d = mat;
    while (d > settle) { dates.unshift(d); k++; d = addMonths(mat, -step * k, eom); }
    return { prev: d, next: dates[0], dates: dates };       // prev = last coupon date on or before settlement
  }
  function couponFrac(settle, sch, f, dc) {
    var E, A;
    if (dc === '30/360') { E = 360 / f; A = days360(sch.prev, settle); }
    else if (dc === 'ACT/365') { E = 365 / f; A = actual(sch.prev, settle); }
    else { E = actual(sch.prev, sch.next); A = actual(sch.prev, settle); }
    // Excel PRICE: DSC = E − A for 30/360, actual days to next coupon otherwise
    var DSC = dc === '30/360' ? E - A : actual(settle, sch.next);
    return { A: A, E: E, DSC: DSC, w: DSC / E };
  }

  /* ---------- pricing core ---------- */
  function priceAt(b, y, opt) {
    opt = opt || {};
    var f = num(b.freq) || 1, settle = D(b.settle), mat = D(opt.maturity || b.maturity), red = opt.redemption != null ? opt.redemption : num(b.redemption);
    var sch = schedule(settle, mat, f), cf = couponFrac(settle, sch, f, b.dayCount), cpn = 100 * num(b.coupon) / f;
    var n = sch.dates.length, rows = [], dirty = 0, mac = 0, cvx = 0;
    for (var k = 1; k <= n; k++) {
      var t = k - 1 + cf.w, amt = cpn + (k === n ? red : 0), df = 1 / Math.pow(1 + y / f, t), pv = amt * df;
      rows.push({ k: k, date: iso(sch.dates[k - 1]), t: t, years: t / f, cf: amt, df: df, pv: pv });
      dirty += pv; mac += t * pv; cvx += pv * t * (t + 1);
    }
    var ai = cpn * cf.A / cf.E;
    var macY = mac / dirty / f, modD = macY / (1 + y / f), conv = cvx / dirty / Math.pow(1 + y / f, 2) / (f * f);
    return { dirty: dirty, clean: dirty - ai, accrued: ai, rows: rows, n: n, prev: iso(sch.prev), next: n ? iso(sch.next) : null, A: cf.A, E: cf.E, w: cf.w,
      macaulay: macY, modified: modD, convexity: conv, dv01: modD * dirty * 1e-4 };
  }
  function yieldFrom(b, clean, opt) {
    return F.solve(function (y) { return priceAt(b, y, opt).clean - clean; }, -0.9, 10, 1e-12);
  }

  function sample() {
    return { version: 1, tool: 'bond', meta: { name: 'Illustrative 4-year coupon note', currency: 'IRR' }, settings: { scenario: 'base', mode: 'yield' },
      bond: { face: 1000000, coupon: 0.23, freq: 4, settle: '2026-11-07', maturity: '2030-09-30', dayCount: 'ACT/365', redemption: 100, yield: 0.30, clean: 85, callable: false, callDate: '2028-09-30', callPrice: 101, benchmark: 0.28 },
      scenarios: { base: { shiftBp: 0 }, upside: { shiftBp: -150 }, downside: { shiftBp: 200 } }, sens: { stepBp: 50 }, sources: {} };
  }
  function blank() { var s = sample(); s.meta.name = 'New bond'; s.bond.coupon = 0; s.bond.yield = 0; return s; }

  function run(S) {
    var b = S.bond, out = {}, checks = [];
    if (!(D(b.maturity) > D(b.settle))) return { checks: [{ level: 'critical', msg: 'Maturity must be after settlement.' }], bad: true };
    var y0 = S.settings.mode === 'price' ? yieldFrom(b, num(b.clean)) : num(b.yield);
    if (y0 == null) return { checks: [{ level: 'critical', msg: 'No yield reproduces that price.' }], bad: true };
    var sh = num(S.scenarios[S.settings.scenario].shiftBp) / 1e4, y = y0 + sh;
    var P = priceAt(b, y);
    out = { y0: y0, y: y, P: P, faceMult: num(b.face) / 100 };
    out.currentYield = num(b.coupon) * 100 / P.clean;
    out.spreadBp = (y - num(b.benchmark)) * 1e4;
    out.ear = Math.pow(1 + y / (num(b.freq) || 1), num(b.freq) || 1) - 1;
    if (b.callable && D(b.callDate) > D(b.settle) && D(b.callDate) < D(b.maturity)) {
      out.ytc = yieldFrom(b, P.clean, { maturity: b.callDate, redemption: num(b.callPrice) });
      out.ytw = Math.min(y, out.ytc);
    }
    var st = num(S.sens.stepBp) / 1e4, ys = [-4, -3, -2, -1, 0, 1, 2, 3, 4].map(function (k) { return y + k * st; });
    out.sens = ys.map(function (yy) {
      var p = priceAt(b, yy), dy = yy - y;
      return { y: yy, clean: p.clean, dirty: p.dirty, chg: p.dirty / P.dirty - 1, approx: -P.modified * dy + 0.5 * P.convexity * dy * dy };
    });
    out.scen = {}; ['base', 'upside', 'downside'].forEach(function (k) { var yy = y0 + num(S.scenarios[k].shiftBp) / 1e4, p = priceAt(b, yy); out.scen[k] = { y: yy, clean: p.clean, dirty: p.dirty, value: p.dirty * out.faceMult }; });
    if (P.n === 1) checks.push({ level: 'warning', msg: 'One coupon left: Excel PRICE uses simple-interest discounting in the final period; this tool compounds, so expect a small difference.' });
    if (num(b.freq) && 12 % num(b.freq) !== 0) checks.push({ level: 'critical', msg: 'Frequency must be 1, 2, 3, 4, 6 or 12.' });
    out.checks = checks;
    return out;
  }

  function build(ExcelJS, S, R) {
    var X = Hub.xl, L = X.L, b = X.book(ExcelJS), B = S.bond;
    var sum = b.sheet('Summary', [2, 42, 18, 16, 16]), A = b.sheet('Assumptions', [2, 42, 10, 16, 16, 16]), C = b.sheet('Calculations', [2, 44, 10, 12, 12, 14, 14, 14]), Sn = b.sheet('Sensitivity', [2, 16, 14, 14, 14, 16]);
    A.title('Assumptions', S.meta.name); var a = {}, r = 4;
    function sc(key, label, unit, v, fmt) { A.put(1, r, label); A.put(2, r, unit, 'unit'); A.put(3, r, v, 'in', fmt); a[key] = A.ref(3, r); r++; }
    A.sec(r++, 'Bond terms', 5);
    sc('face', 'Face amount held', S.meta.currency, num(B.face), 'money'); sc('cpn', 'Coupon / profit rate (annual)', '%', num(B.coupon), 'pct2'); sc('f', 'Payments per year', '#', num(B.freq), 'int');
    sc('set', 'Settlement date', 'date', { date: D(B.settle) }, 'date'); sc('mat', 'Maturity date', 'date', { date: D(B.maturity) }, 'date');
    sc('basis', 'Day count (Excel basis: 0 = 30/360, 1 = ACT/ACT, 3 = ACT/365)', '#', BASIS[B.dayCount], 'int'); sc('red', 'Redemption (per 100)', '', num(B.redemption), 'dec');
    r++; A.sec(r++, 'Pricing', 5);
    sc('mode', 'Mode (1 = price from yield, 0 = yield from clean price)', '#', S.settings.mode === 'price' ? 0 : 1, 'int');
    sc('yin', 'Yield to maturity input (annual, compounding at frequency)', '%', num(B.yield), 'pct2'); sc('pin', 'Clean price input (per 100)', '', num(B.clean), 'dec4');
    sc('bench', 'Benchmark yield', '%', num(B.benchmark), 'pct2');
    r++; A.sec(r++, 'Scenarios (yield shift, bp)', 5, ['Base', 'Upside', 'Downside']);
    A.put(1, r, 'Shift'); ['base', 'upside', 'downside'].forEach(function (k, j) { A.put(3 + j, r, num(S.scenarios[k].shiftBp), 'in', 'int'); }); var rs = r; r++;
    sc('scen', 'Active scenario (1 Base, 2 Upside, 3 Downside)', '#', ['base', 'upside', 'downside'].indexOf(S.settings.scenario) + 1, 'int');
    A.put(1, r, 'Active shift (bp)'); A.put(3, r, { f: '=CHOOSE(' + a.scen + ',D' + rs + ',E' + rs + ',F' + rs + ')' }, 'calc', 'int'); a.shift = A.ref(3, r); r++;
    sc('step', 'Sensitivity step (bp)', 'bp', num(S.sens.stepBp), 'int');
    // Calculations
    C.title('Calculations', 'Coupon schedule, price, risk measures');
    var c = {}, rr = 4;
    function cr(key, label, f, fmt, kind) { C.put(1, rr, label, kind); C.put(5, rr, { f: f }, kind || 'calc', fmt); c[key] = '$F$' + rr; rr++; }
    C.sec(rr++, 'Coupon period', 7);
    cr('E', 'Days in coupon period (E)', '=COUPDAYS(' + a.set + ',' + a.mat + ',' + a.f + ',' + a.basis + ')', 'dec');
    cr('Ad', 'Days from last coupon to settlement (A)', '=COUPDAYBS(' + a.set + ',' + a.mat + ',' + a.f + ',' + a.basis + ')', 'dec');
    cr('w', 'Fraction of period to next coupon (DSC / E)', '=IF(' + a.basis + '=0,(' + c.E + '-' + c.Ad + '),COUPDAYSNC(' + a.set + ',' + a.mat + ',' + a.f + ',' + a.basis + '))/' + c.E, 'dec4');
    cr('N', 'Coupons remaining', '=COUPNUM(' + a.set + ',' + a.mat + ',' + a.f + ',' + a.basis + ')', 'int');
    cr('cp', 'Coupon per period (per 100)', '=100*' + a.cpn + '/' + a.f, 'dec4');
    cr('y0', 'Yield before scenario shift', '=IF(' + a.mode + '=1,' + a.yin + ',YIELD(' + a.set + ',' + a.mat + ',' + a.cpn + ',' + a.pin + ',' + a.red + ',' + a.f + ',' + a.basis + '))', 'pct2');
    cr('y', 'Yield used (after shift)', '=' + c.y0 + '+' + a.shift + '/10000', 'pct2', 'total');
    rr++;
    C.sec(rr, 'Cash flows', 7, ['Coupon #', 'Periods (t)', 'Cash flow', 'Discount factor', 'Present value'], 2); rr++;
    var r0 = rr, n = R.P ? R.P.n : 1;
    for (var k = 1; k <= n; k++, rr++) {
      C.put(1, rr, { f: '=EDATE(' + a.mat + ',-12/' + a.f + '*(' + c.N + '-' + k + '))' }, 'calc', 'date');
      C.put(2, rr, k, null, 'int');
      C.put(3, rr, { f: '=' + (k - 1) + '+' + c.w }, 'calc', 'dec4');
      C.put(4, rr, { f: '=' + c.cp + '+IF(' + k + '=' + c.N + ',' + a.red + ',0)' }, 'calc', 'dec4');
      C.put(5, rr, { f: '=1/(1+' + c.y + '/' + a.f + ')^D' + rr }, 'calc', 'dec4');
      C.put(6, rr, { f: '=E' + rr + '*F' + rr }, 'calc', 'dec4');
      C.put(7, rr, { f: '=D' + rr + '*G' + rr }, 'calc', 'dec4');
    }
    var r1 = rr - 1; rr++;
    C.sec(rr++, 'Price and risk (per 100 face)', 7);
    cr('dirty', 'Dirty price', '=SUM(G' + r0 + ':G' + r1 + ')', 'dec4', 'total'); cr('ai', 'Accrued interest', '=' + c.cp + '*' + c.Ad + '/' + c.E, 'dec4');
    cr('clean', 'Clean price', '=' + c.dirty + '-' + c.ai, 'dec4', 'total');
    cr('mac', 'Macaulay duration (years)', '=SUM(H' + r0 + ':H' + r1 + ')/' + c.dirty + '/' + a.f, 'dec4');
    cr('mod', 'Modified duration', '=' + c.mac + '/(1+' + c.y + '/' + a.f + ')', 'dec4');
    cr('cvx', 'Convexity', '=SUMPRODUCT(G' + r0 + ':G' + r1 + ',D' + r0 + ':D' + r1 + ',D' + r0 + ':D' + r1 + '+1)/' + c.dirty + '/(1+' + c.y + '/' + a.f + ')^2/' + a.f + '^2', 'dec4');
    cr('dv01', 'DV01 (price change for 1bp, per 100)', '=' + c.mod + '*' + c.dirty + '*0.0001', 'dec4');
    cr('cy', 'Current yield', '=' + a.cpn + '*100/' + c.clean, 'pct2');
    cr('sp', 'Spread over benchmark (bp)', '=(' + c.y + '-' + a.bench + ')*10000', 'dec');
    cr('val', 'Market value of holding (dirty)', '=' + c.dirty + '*' + a.face + '/100', 'money', 'total');
    rr++; C.sec(rr++, 'Cross-check with Excel built-ins (should equal the lines above)', 7);
    cr('xp', 'PRICE()', '=PRICE(' + a.set + ',' + a.mat + ',' + a.cpn + ',' + c.y + ',' + a.red + ',' + a.f + ',' + a.basis + ')', 'dec4');
    cr('xd', 'MDURATION()', '=MDURATION(' + a.set + ',' + a.mat + ',' + a.cpn + ',' + c.y + ',' + a.f + ',' + a.basis + ')', 'dec4');
    C.put(7, r0 - 1, 't × PV', 'hdr');
    // Sensitivity (values from the engine; each row is a full re-pricing)
    Sn.title('Sensitivity', 'Price per 100 at yields around the active case · values from the hub engine at export');
    Sn.sec(4, 'Yield', 5, ['Clean', 'Dirty', '% change', 'Duration + convexity est.']);
    (R.sens || []).forEach(function (s, i) { Sn.put(1, 5 + i, s.y, i === 4 ? 'total' : null, 'pct2'); Sn.put(2, 5 + i, s.clean, null, 'dec4'); Sn.put(3, 5 + i, s.dirty, null, 'dec4'); Sn.put(4, 5 + i, s.chg, null, 'pct2'); Sn.put(5, 5 + i, s.approx, null, 'pct2'); });
    sum.title(S.meta.name + ' · Bond pricing', 'Settlement ' + B.settle + ' · maturity ' + B.maturity + ' · ' + B.dayCount + ' · ' + B.freq + '× per year');
    sum.sec(4, 'Active case', 3);
    [['Yield to maturity', c.y, 'pct2'], ['Clean price', c.clean, 'dec4'], ['Dirty price', c.dirty, 'dec4'], ['Accrued interest', c.ai, 'dec4'], ['Modified duration', c.mod, 'dec4'], ['Convexity', c.cvx, 'dec4'], ['DV01 per 100', c.dv01, 'dec4'], ['Spread to benchmark (bp)', c.sp, 'dec'], ['Market value of holding', c.val, 'money'], ['Excel PRICE() check', c.xp, 'dec4']]
      .forEach(function (x, i) { sum.put(1, 5 + i, x[0]); sum.put(2, 5 + i, { f: "='Calculations'!" + x[1] }, 'calc', x[2]); });
    X.notes(b, ['Street convention as Excel PRICE / YIELD: compounding at the coupon frequency, fractional first period (E − A) / E.', 'Yield is annual, compounded at the coupon frequency. Effective annual yield = (1 + y/f)^f − 1.', 'Duration measures per 100 face; DV01 = modified duration × dirty price × 0.0001.', 'For zero-coupon treasury bills with annual compounding use frequency 1 and ACT/365.'], S.sources);
    return { wb: b.wb };
  }

  /* ======================= ISSUANCE SIZING ======================= */
  function iSample() {
    return { version: 1, tool: 'issuance', meta: { issuer: 'Issuer Co. (illustrative)', currency: 'IRR', unit: 'billion' }, settings: { scenario: 'base' },
      base: { ebitda: 16906, interestExisting: 2600, grossDebt: 11000, cash: 6500, coupon: 0.25, tenor: 4, issueSize: 15000, issueFeesPct: 0.01 },
      cov: { maxLev: 2.5, minCov: 3.0 }, scenarios: { base: { ebitdaChg: 0 }, upside: { ebitdaChg: 0.10 }, downside: { ebitdaChg: -0.20 } }, sens: { ebitdaStep: 0.1, couponStep: 0.02 }, sources: {} };
  }
  function iCalc(S, o) {
    o = o || {}; var b = S.base, c = S.cov;
    var eb = num(b.ebitda) * (1 + (o.chg != null ? o.chg : num(S.scenarios[S.settings.scenario].ebitdaChg))), cpn = o.coupon != null ? o.coupon : num(b.coupon);
    var netDebt = num(b.grossDebt) - num(b.cash);
    var capLev = num(c.maxLev) * eb - netDebt;                            // proceeds assumed spent (conservative)
    var capCov = cpn > 0 ? (eb / num(c.minCov) - num(b.interestExisting)) / cpn : Infinity;
    var cap = Math.max(0, Math.min(capLev, capCov));
    var size = num(b.issueSize), pfLev = (netDebt + size) / eb, pfCov = eb / (num(b.interestExisting) + size * cpn);
    return { ebitda: eb, netDebt: netDebt, capLev: capLev, capCov: capCov, capacity: cap, binding: capLev <= capCov ? 'leverage' : 'coverage', size: size, pfLev: pfLev, pfCov: pfCov,
      headLev: num(c.maxLev) - pfLev, headCov: pfCov - num(c.minCov), annualCoupon: size * cpn, netProceeds: size * (1 - num(b.issueFeesPct)), ebitdaBreak: Math.max((netDebt + size) / num(c.maxLev), num(c.minCov) * (num(b.interestExisting) + size * cpn)) };
  }
  function iRun(S) {
    var R = iCalc(S), ch = F.grid5(0, num(S.sens.ebitdaStep)), cp = F.grid5(num(S.base.coupon), num(S.sens.couponStep));
    R.sens = { chg: ch, cpn: cp, grid: ch.map(function (x) { return cp.map(function (y) { return iCalc(S, { chg: x, coupon: y }).capacity; }); }) };
    R.scen = {}; ['base', 'upside', 'downside'].forEach(function (k) { var s2 = JSON.parse(JSON.stringify(S)); s2.settings.scenario = k; R.scen[k] = iCalc(s2); });
    R.checks = [];
    if (R.size > R.capacity) R.checks.push({ level: 'critical', msg: 'Proposed issue exceeds covenant capacity (binding: ' + R.binding + ').' });
    if (R.scen.downside.size > R.scen.downside.capacity) R.checks.push({ level: 'warning', msg: 'Under the downside EBITDA case the proposed issue breaches a covenant.' });
    return R;
  }
  function iBuild(ExcelJS, S, R) {
    var X = Hub.xl, b = X.book(ExcelJS), ut = S.meta.currency + ' ' + S.meta.unit + 's';
    var sum = b.sheet('Summary', [2, 46, 16]), A = b.sheet('Assumptions', [2, 46, 10, 16, 16, 16]), C = b.sheet('Calculations', [2, 50, 10, 16]);
    A.title('Assumptions', S.meta.issuer + ' · ' + ut); var a = {}, r = 4;
    function sc(key, label, unit, v, fmt) { A.put(1, r, label); A.put(2, r, unit, 'unit'); A.put(3, r, v, 'in', fmt); a[key] = A.ref(3, r); r++; }
    A.sec(r++, 'Issuer', 5); sc('eb', 'EBITDA (LTM or run-rate)', ut, num(S.base.ebitda), 'money'); sc('ie', 'Existing annual interest', ut, num(S.base.interestExisting), 'money');
    sc('gd', 'Existing gross debt', ut, num(S.base.grossDebt), 'money'); sc('ca', 'Cash', ut, num(S.base.cash), 'money');
    r++; A.sec(r++, 'Proposed issue', 5); sc('sz', 'Issue size', ut, num(S.base.issueSize), 'money'); sc('cp', 'Coupon / profit rate', '%', num(S.base.coupon), 'pct2'); sc('fe', 'Issuance fees', '%', num(S.base.issueFeesPct), 'pct');
    r++; A.sec(r++, 'Covenants', 5); sc('ml', 'Maximum net debt / EBITDA', 'x', num(S.cov.maxLev), 'x'); sc('mc', 'Minimum EBITDA / interest', 'x', num(S.cov.minCov), 'x');
    r++; A.sec(r++, 'EBITDA scenarios', 5, ['Base', 'Upside', 'Downside']);
    A.put(1, r, 'EBITDA change'); ['base', 'upside', 'downside'].forEach(function (k, j) { A.put(3 + j, r, num(S.scenarios[k].ebitdaChg), 'in', 'pct'); }); var rs = r; r++;
    sc('scen', 'Active scenario (1 Base, 2 Upside, 3 Downside)', '#', ['base', 'upside', 'downside'].indexOf(S.settings.scenario) + 1, 'int');
    C.title('Calculations', 'Debt capacity and covenant headroom'); var c = {}, rr = 4;
    function cr(key, label, f, fmt, kind) { C.put(1, rr, label, kind); C.put(3, rr, { f: f }, kind || 'calc', fmt || 'money'); c[key] = '$D$' + rr; rr++; }
    cr('eb', 'EBITDA in scenario', '=' + a.eb + '*(1+CHOOSE(' + a.scen + ',D' + rs + ',E' + rs + ',F' + rs + '))'); cr('nd', 'Existing net debt', '=' + a.gd + '-' + a.ca);
    cr('cl', 'Capacity under leverage covenant', '=' + a.ml + '*' + c.eb + '-' + c.nd); cr('cc', 'Capacity under coverage covenant', '=(' + c.eb + '/' + a.mc + '-' + a.ie + ')/' + a.cp);
    cr('cap', 'Maximum new issue', '=MAX(0,MIN(' + c.cl + ',' + c.cc + '))', 'money', 'total');
    cr('pl', 'Pro forma net debt / EBITDA', '=(' + c.nd + '+' + a.sz + ')/' + c.eb, 'x2'); cr('pc', 'Pro forma EBITDA / interest', '=' + c.eb + '/(' + a.ie + '+' + a.sz + '*' + a.cp + ')', 'x2');
    cr('hl', 'Leverage headroom (turns)', '=' + a.ml + '-' + c.pl, 'x2'); cr('hc', 'Coverage headroom (turns)', '=' + c.pc + '-' + a.mc, 'x2');
    cr('np', 'Net proceeds', '=' + a.sz + '*(1-' + a.fe + ')'); cr('ac', 'Annual coupon cost', '=' + a.sz + '*' + a.cp);
    cr('be', 'EBITDA at which a covenant binds', '=MAX((' + c.nd + '+' + a.sz + ')/' + a.ml + ',' + a.mc + '*(' + a.ie + '+' + a.sz + '*' + a.cp + '))', 'money', 'total');
    sum.title(S.meta.issuer + ' · Bond issuance sizing', ut);
    [['Maximum new issue', c.cap, 'money'], ['Proposed issue', null, 'money'], ['Pro forma net debt / EBITDA', c.pl, 'x2'], ['Pro forma EBITDA / interest', c.pc, 'x2'], ['EBITDA at which a covenant binds', c.be, 'money']].forEach(function (x, i) {
      sum.put(1, 4 + i, x[0]); sum.put(2, 4 + i, { f: x[1] ? "='Calculations'!" + x[1] : '=' + a.sz }, 'calc', x[2]);
    });
    X.notes(b, ['Leverage capacity assumes proceeds are spent (net debt rises by the full issue).', 'Coverage uses cash interest; zero-coupon or PIK structures need their accretion added.', 'Covenant definitions differ by deal and market; align EBITDA and debt definitions with the indenture or offering document.'], S.sources);
    return { wb: b.wb };
  }

  Hub.tools = Hub.tools || {};
  Hub.tools.bond = { sample: sample, blank: blank, run: run, build: build, priceAt: priceAt, yieldFrom: yieldFrom, schedule: schedule };
  Hub.tools.issuance = { sample: iSample, run: iRun, build: iBuild };
  if (typeof module !== 'undefined' && module.exports) module.exports = Hub.tools;
  if (!root.document || !Hub.toolkit) return;

  var U = Hub.util, h = U.h, G = Hub.grid, TK = Hub.toolkit;
  function dateField(ctx, key, label, path) {
    return { key: key, label: label, text: true, help: 'YYYY-MM-DD (Gregorian)', get: function () { return U.getPath(ctx.S, path); }, set: function (v) { if (/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) U.setPath(ctx.S, path, v.trim()); else U.toast('Use YYYY-MM-DD', 'warn'); } };
  }
  TK.define({
    id: 'bond', title: 'Bond Pricing & Yield', sections: ['finance', 'bonds'], priority: 1, version: 1, storeKey: 'hub.bond.v1',
    summary: 'Price from yield or yield from price, accrued, durations, convexity, DV01, YTC, spread; Excel cross-check with PRICE().',
    sample: sample, blank: blank, run: run, scenarios: true,
    headControls: function (ctx, seg) { return [seg('Solve', [['yield', 'Price from yield'], ['price', 'Yield from price']], ctx.S.settings.mode, function (v) { ctx.S.settings.mode = v; ctx.rerender(); })]; },
    eyebrow: function (S) { return 'Finance · Fixed income · ' + S.bond.dayCount + ' · ' + S.bond.freq + '× per year'; }, heading: function (S) { return S.meta.name; }, filename: function (S) { return S.meta.name + '_Bond'; },
    xlsx: function (S, R) { return build(root.ExcelJS, S, R).wb; },
    kpis: function (ctx) { var R = function () { return ctx.R; }; return [
      ['Yield to maturity', function () { return U.fmtPct(R().y, 3); }, function () { return 'effective ' + U.fmtPct(R().ear, 2); }],
      ['Clean price', function () { return U.fmt(R().P.clean, 'dec3'); }, function () { return 'dirty ' + U.fmt(R().P.dirty, 'dec3') + ' per 100'; }],
      ['Modified duration', function () { return U.fmt(R().P.modified, 'dec3'); }, function () { return 'Macaulay ' + U.fmt(R().P.macaulay, 'dec3') + ' yrs'; }],
      ['DV01 · holding', function () { return U.fmtNum(R().P.dv01 * R().faceMult); }, function () { return ctx.S.meta.currency + ' per 1bp'; }],
      ['Spread', function () { return U.fmtNum(R().spreadBp) + ' bp'; }, function () { return 'over benchmark ' + U.fmtPct(ctx.S.bond.benchmark, 2); }]
    ]; },
    tabs: [
      { group: 'Inputs', items: [['terms', 'Terms', function (ctx) {
        var S = ctx.S, mode = S.settings.mode;
        var f = G.form({ id: 'bd-t', onChange: ctx.recompute, fields: [
          { key: 'nm', label: 'Instrument', text: true, get: function () { return S.meta.name; }, set: function (v) { S.meta.name = v; } },
          { key: 'cu', label: 'Currency', text: true, get: function () { return S.meta.currency; }, set: function (v) { S.meta.currency = v.toUpperCase(); } },
          ctx.field('fa', 'Face amount held', 'bond.face', 'num', { unit: S.meta.currency }), ctx.field('cp', 'Coupon / profit rate (annual)', 'bond.coupon', 'pct2', { unit: '%' }),
          { key: 'fq', label: 'Payments per year', options: [['1', 'Annual (1)'], ['2', 'Semi-annual (2)'], ['4', 'Quarterly (4)'], ['12', 'Monthly (12)']], get: function () { return String(S.bond.freq); }, set: function (v) { S.bond.freq = +v; } },
          { key: 'dc', label: 'Day count', options: [['ACT/365', 'ACT/365 (Excel basis 3)'], ['ACT/ACT', 'ACT/ACT (basis 1)'], ['30/360', '30/360 US (basis 0)']], get: function () { return S.bond.dayCount; }, set: function (v) { S.bond.dayCount = v; } },
          dateField(ctx, 'st', 'Settlement date', 'bond.settle'), dateField(ctx, 'mt', 'Maturity date', 'bond.maturity'),
          ctx.field('rd', 'Redemption', 'bond.redemption', 'dec', { unit: 'per 100' })
        ] });
        var p = G.form({ id: 'bd-p', onChange: ctx.recompute, fields: [
          mode === 'price' ? ctx.field('cl', 'Clean price', 'bond.clean', 'dec', { unit: 'per 100' }) : ctx.field('yi', 'Yield to maturity', 'bond.yield', 'pct2', { unit: '%' }),
          ctx.field('bm', 'Benchmark yield', 'bond.benchmark', 'pct2', { unit: '%', help: 'Government yield of similar maturity in the same currency.' }),
          { key: 'ca', label: 'Callable', options: [['0', 'No'], ['1', 'Yes']], get: function () { return S.bond.callable ? '1' : '0'; }, set: function (v) { S.bond.callable = v === '1'; } },
          dateField(ctx, 'cd', 'Call date', 'bond.callDate'), ctx.field('cpx', 'Call price', 'bond.callPrice', 'dec', { unit: 'per 100' })
        ] });
        var sc = G.table({ id: 'bd-s', corner: 'Yield shift', cols: ctx.scenCols(), onChange: ctx.recompute, rows: [{ label: 'Shift vs solved yield', unit: 'bp', cell: function (c) { return ctx.inVal('scenarios.' + ctx.scenKey(c) + '.shiftBp', 'dec'); } }] });
        var st = h('p', { class: 'muted fetch-status', 'aria-live': 'polite' });
        var fetch = h('button', { class: 'btn ghost', type: 'button', text: 'US 10Y → benchmark', onclick: function () {
          st.textContent = 'Fetching…'; Hub.data.riskFree().then(function (r) { S.bond.benchmark = r.rate; S.sources['bond.benchmark'] = r._provider + ' ' + r.date; ctx.rerender(); U.toast('Benchmark set to ' + U.fmtPct(r.rate, 2) + ' (USD; only consistent with a USD bond)', 'info'); }).catch(function (e) { st.textContent = e.message; });
        } });
        return ctx.group([ctx.two(ctx.panel('Terms', [f]), ctx.panel(mode === 'price' ? 'Market price' : 'Market yield', [p, h('div', { class: 'row-ctl' }, [fetch]), st])), ctx.panel('Scenarios', [sc])]);
      }]] },
      { group: 'Calculations', items: [['cf', 'Cash flows', function (ctx) {
        var box = h('div', { class: 'grid-wrap' });
        function paint() {
          U.clear(box); var P = ctx.R.P; if (!P) return;
          var t = h('table', { class: 'grid' }, [h('thead', null, [h('tr', null, ['#', 'Date', 'Periods (t)', 'Years', 'Cash flow', 'Discount factor', 'PV'].map(function (x, i) { return h('th', { class: i < 2 ? 'lbl' : 'num', text: x }); }))])]);
          var tb = h('tbody');
          P.rows.forEach(function (r) { tb.appendChild(h('tr', null, [h('td', { text: String(r.k) }), h('td', { text: r.date }), h('td', { class: 'num', text: U.fmt(r.t, 'dec3') }), h('td', { class: 'num', text: U.fmt(r.years, 'dec3') }), h('td', { class: 'num', text: U.fmt(r.cf, 'dec3') }), h('td', { class: 'num', text: U.fmt(r.df, 'dec3') }), h('td', { class: 'num', text: U.fmt(r.pv, 'dec3') })])); });
          t.appendChild(tb); box.appendChild(t);
        }
        paint();
        var kv = G.form({ id: 'bd-k', fields: [
          { key: 'pv', label: 'Last coupon date', calc: function () { return ctx.R.P.prev; } }, { key: 'nx', label: 'Next coupon date', calc: function () { return ctx.R.P.next; } },
          { key: 'a', label: 'Accrued days (A) / period days (E)', calc: function () { return ctx.R.P.A + ' / ' + U.fmt(ctx.R.P.E, 'dec'); } },
          { key: 'ai', label: 'Accrued interest per 100', calc: function () { return U.fmt(ctx.R.P.accrued, 'dec3'); } },
          { key: 'cv', label: 'Convexity', calc: function () { return U.fmt(ctx.R.P.convexity, 'dec3'); } },
          { key: 'cy', label: 'Current yield', calc: function () { return U.fmtPct(ctx.R.currentYield, 2); } },
          { key: 'yc', label: 'Yield to call / to worst', calc: function () { return ctx.R.ytc != null ? U.fmtPct(ctx.R.ytc, 3) + ' / ' + U.fmtPct(ctx.R.ytw, 3) : 'not callable'; } },
          { key: 'mv', label: 'Market value of holding (dirty)', strong: true, calc: function () { return U.fmtNum(ctx.R.P.dirty * ctx.R.faceMult) + ' ' + ctx.S.meta.currency; } }
        ] });
        return { el: h('div', { class: 'stack' }, [ctx.panel('Price build-up', [kv.el]), ctx.panel('Remaining cash flows (per 100 face)', [box])]), refresh: function () { kv.refresh(); paint(); } };
      }]] },
      { group: 'Outputs', items: [['sens', 'Sensitivity', function (ctx) {
        var box = h('div', { class: 'grid-wrap' }), cv = h('canvas', { 'aria-label': 'Price yield curve' });
        function paint() {
          U.clear(box);
          var t = h('table', { class: 'grid' }, [h('thead', null, [h('tr', null, ['Yield', 'Clean', 'Dirty', '% change', 'Duration + convexity est.'].map(function (x, i) { return h('th', { class: i ? 'num' : 'lbl', text: x }); }))])]);
          var tb = h('tbody'); ctx.R.sens.forEach(function (s, i) { tb.appendChild(h('tr', { class: i === 4 ? 'total' : '' }, [h('td', { text: U.fmtPct(s.y, 2) }), h('td', { class: 'num', text: U.fmt(s.clean, 'dec3') }), h('td', { class: 'num', text: U.fmt(s.dirty, 'dec3') }), h('td', { class: 'num', text: U.fmtPct(s.chg, 2) }), h('td', { class: 'num', text: U.fmtPct(s.approx, 2) })])); });
          t.appendChild(tb); box.appendChild(t);
          ctx.charts.forEach(function (c) { c.destroy(); }); ctx.charts.length = 0;
          ctx.chart(cv, { type: 'line', data: { labels: ctx.R.sens.map(function (s) { return U.fmtPct(s.y, 2); }), datasets: [{ label: 'Clean price', data: ctx.R.sens.map(function (s) { return s.clean; }), borderColor: ctx.css('--accent'), backgroundColor: ctx.css('--accent'), tension: 0.3 }] },
            options: { maintainAspectRatio: false, animation: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { grid: { color: ctx.css('--line') } } } } });
        }
        var sc = G.table({ id: 'bd-sc', corner: 'Scenario', cols: ctx.scenCols(), rows: [
          { label: 'Yield', cell: function (c) { return ctx.calc(function () { return ctx.R.scen[ctx.scenKey(c)].y; }, 'pct2'); } },
          { label: 'Clean price', cell: function (c) { return ctx.calc(function () { return ctx.R.scen[ctx.scenKey(c)].clean; }, 'dec3'); } },
          { label: 'Value of holding (dirty)', cell: function (c) { return ctx.calc(function () { return ctx.R.scen[ctx.scenKey(c)].value; }); } }] });
        var f = G.form({ id: 'bd-st', onChange: ctx.recompute, fields: [ctx.field('sp', 'Yield step', 'sens.stepBp', 'dec', { unit: 'bp' })] });
        var g = { el: h('div', { class: 'stack' }, [ctx.panel('Scenarios', [sc]), ctx.panel('Price across yields', [f, box]), ctx.panel('Price–yield curve', [h('div', { class: 'chart' }, [cv])])]), refresh: function () { sc.refresh(); paint(); }, after: paint };
        return g;
      }]] }
    ]
  });

  function ul(S) { return S.meta.currency + ' ' + F.unitShort(S.meta.unit); }
  TK.define({
    id: 'issuance', title: 'Bond Issuance Sizing', sections: ['bonds'], priority: 2, version: 1, storeKey: 'hub.issuance.v1',
    summary: 'Debt capacity under leverage and coverage covenants, pro forma headroom, EBITDA stress.',
    sample: iSample, run: iRun, scenarios: true,
    fromCompany: function (S, M) {
      var r = function (v) { return isFinite(v) ? Math.round(v * 100) / 100 : 0; }, rp = function (v) { return isFinite(v) ? Math.round(v * 1e4) / 1e4 : 0; }; var fa = Hub.i18n && Hub.i18n.lang() === 'fa'; var b = S.base; b.ebitda = r(M.ebitda); b.interestExisting = r(M.interestExp); b.grossDebt = r(M.debt); b.cash = r(M.cash);
      return fa ? 'EBITDA، هزینهٔ مالی فعلی، بدهی ناخالص و وجه نقد آخرین سال اعمال شد.' : 'Last-year EBITDA, existing finance cost, gross debt and cash applied.';
    },
    eyebrow: function (S) { return 'Bond issuance · Capacity and covenants · ' + ul(S); }, heading: function (S) { return S.meta.issuer; }, filename: function (S) { return S.meta.issuer + '_IssuanceSizing'; },
    xlsx: function (S, R) { return iBuild(root.ExcelJS, S, R).wb; },
    kpis: function (ctx) { return [
      ['Maximum new issue', function () { return U.fmtNum(ctx.R.capacity); }, function () { return 'binding: ' + ctx.R.binding; }],
      ['Pro forma leverage', function () { return U.fmtX(ctx.R.pfLev, 2); }, function () { return 'covenant ' + U.fmtX(ctx.S.cov.maxLev, 2); }],
      ['Pro forma coverage', function () { return U.fmtX(ctx.R.pfCov, 2); }, function () { return 'covenant ' + U.fmtX(ctx.S.cov.minCov, 2); }],
      ['EBITDA at breach', function () { return U.fmtNum(ctx.R.ebitdaBreak); }, function () { return U.fmtPct(ctx.R.ebitdaBreak / ctx.S.base.ebitda - 1) + ' vs base'; }]
    ]; },
    tabs: [
      { group: 'Inputs', items: [['in', 'Inputs', function (ctx) {
        var S = ctx.S;
        var f = G.form({ id: 'is-1', onChange: ctx.recompute, fields: [
          { key: 'is', label: 'Issuer', text: true, get: function () { return S.meta.issuer; }, set: function (v) { S.meta.issuer = v; } },
          { key: 'un', label: 'Monetary unit', options: F.UNITS, get: function () { return S.meta.unit; }, set: function (v) { S.meta.unit = v; } },
          ctx.field('eb', 'EBITDA', 'base.ebitda', 'num', { unit: ul(S) }), ctx.field('ie', 'Existing annual interest', 'base.interestExisting', 'num', { unit: ul(S) }),
          ctx.field('gd', 'Existing gross debt', 'base.grossDebt', 'num', { unit: ul(S) }), ctx.field('ca', 'Cash', 'base.cash', 'num', { unit: ul(S) }),
          { type: 'head', label: 'Proposed issue' }, ctx.field('sz', 'Issue size', 'base.issueSize', 'num', { unit: ul(S) }), ctx.field('cp', 'Coupon / profit rate', 'base.coupon', 'pct2', { unit: '%' }),
          ctx.field('tn', 'Tenor', 'base.tenor', 'dec', { unit: 'years' }), ctx.field('fe', 'Issuance fees', 'base.issueFeesPct', 'pct', { unit: '%' }),
          { type: 'head', label: 'Covenants' }, ctx.field('ml', 'Maximum net debt / EBITDA', 'cov.maxLev', 'dec', { unit: 'x' }), ctx.field('mc', 'Minimum EBITDA / interest', 'cov.minCov', 'dec', { unit: 'x' })
        ] });
        var sc = G.table({ id: 'is-s', corner: 'EBITDA stress', cols: ctx.scenCols(), onChange: ctx.recompute, rows: [{ label: 'EBITDA change vs base', unit: '%', cell: function (c) { return ctx.inVal('scenarios.' + ctx.scenKey(c) + '.ebitdaChg', 'pct'); } }] });
        return ctx.group([ctx.panel('Issuer and issue', [f]), ctx.panel('Scenarios', [sc])]);
      }]] },
      { group: 'Outputs', items: [['out', 'Capacity & headroom', function (ctx) {
        var S = ctx.S;
        var t = G.table({ id: 'is-o', corner: ul(S), cols: ctx.scenCols(), rows: [
          ['EBITDA', 'ebitda'], ['Capacity · leverage covenant', 'capLev'], ['Capacity · coverage covenant', 'capCov'], ['Maximum new issue', 'capacity', 'num', 'total'],
          ['Pro forma net debt / EBITDA', 'pfLev', 'x'], ['Pro forma EBITDA / interest', 'pfCov', 'x'], ['Leverage headroom (turns)', 'headLev', 'x'], ['Coverage headroom (turns)', 'headCov', 'x'], ['Annual coupon cost', 'annualCoupon'], ['Net proceeds', 'netProceeds']
        ].map(function (x) { return { label: x[0], cls: x[3] || '', cell: function (c) { return ctx.calc(function () { return ctx.R.scen[ctx.scenKey(c)][x[1]]; }, x[2] || 'num', function (v) { return (x[1] === 'headLev' || x[1] === 'headCov') && v < 0; }); } }; }) });
        var box = h('div', { class: 'grid-wrap' });
        function paint() { var s = ctx.R.sens; TK.heat(box, 'Maximum new issue · EBITDA change × coupon', 'EBITDA Δ', 'Coupon', s.chg, s.cpn, s.grid, 'pct', 'pct', 'num', function (v) { return v < ctx.S.base.issueSize; }); }
        paint();
        return { el: h('div', { class: 'stack' }, [ctx.panel('Capacity by scenario', [t]), ctx.panel(null, [box])]), refresh: function () { t.refresh(); paint(); } };
      }]] }
    ]
  });
})(typeof window !== 'undefined' ? window : globalThis);
