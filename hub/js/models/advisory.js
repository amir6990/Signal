/* =====================================================================
 * M&A ADVISORY — buy-side and sell-side tools
 *  Buy-side : Target screening (weighted criteria) · Acquisition pricing
 *             (standalone value + PV of net synergies → maximum price, walk-away premium)
 *  Sell-side: Buyer universe (weighted scoring, tiers) · Bid comparison
 *             (certainty-adjusted value of each offer vs the valuation range)
 * Scores are your judgement; the tools keep them consistent and exportable.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {}, F = Hub.fin, num = F.num;
  function rep(v) { return [v, v, v, v, v]; }

  /* ---------- weighted scoring (shared by screening and buyer universe) ---------- */
  function scoreRun(S) {
    var ws = S.criteria.map(function (c) { return num(c.weight); }), wsum = ws.reduce(function (a, b) { return a + b; }, 0);
    var rows = S.items.map(function (it) {
      var sc = S.criteria.reduce(function (a, c, j) { var v = num(it.s[j]); return a + num(c.weight) * (c.inverse ? 6 - v : v); }, 0) / (wsum || 1);
      return { score: sc, tier: sc >= num(S.tiers.t1) ? 'Tier 1' : sc >= num(S.tiers.t2) ? 'Tier 2' : 'Tier 3' };
    });
    var order = rows.map(function (r, i) { return i; }).sort(function (a, b) { return rows[b].score - rows[a].score; });
    order.forEach(function (i, k) { rows[i].rank = k + 1; });
    var c = []; if (Math.abs(wsum - 1) > 1e-6) c.push({ level: 'warning', msg: 'Criteria weights sum to ' + (wsum * 100).toFixed(0) + '%; scores are normalised.' });
    return { rows: rows, wsum: wsum, checks: c, top: order.slice(0, 3).map(function (i) { return S.items[i] ? S.items[i].name : ''; }) };
  }
  function scoreBuild(ExcelJS, S, R, title) {
    var X = Hub.xl, L = X.L, b = X.book(ExcelJS), n = S.criteria.length;
    var s = b.sheet('Scoring', [2, 34, 14].concat(new Array(n).fill(12)).concat([12, 10, 10]));
    s.title(title + ' · ' + S.meta.name, '1 = poor … 5 = strong; criteria marked (inverse) count 6 − score');
    s.sec(4, 'Criterion', 3 + n, ['Weight'], 2);
    S.criteria.forEach(function (c, j) { s.put(1 + j, 5, c.label + (c.inverse ? ' (inverse)' : ''), 'sub'); });
    s.put(1, 6, 'Weight'); S.criteria.forEach(function (c, j) { s.put(3 + j, 6, num(c.weight), 'in', 'pct'); s.put(3 + j, 7, c.inverse ? 1 : 0, 'in', 'int'); s.put(3 + j, 5, c.label, 'sub'); });
    s.put(1, 7, 'Inverse (1/0)');
    s.sec(9, 'Name', 4 + n, ['Type'].concat(S.criteria.map(function (c) { return c.label.slice(0, 14); })).concat(['Score', 'Rank', 'Tier']), 2);
    var r0 = 10;
    S.items.forEach(function (it, i) {
      var r = r0 + i; s.put(1, r, it.name, 'in'); s.put(2, r, it.type || '', 'in');
      S.criteria.forEach(function (c, j) { s.put(3 + j, r, num(it.s[j]), 'in', 'int'); });
      var terms = S.criteria.map(function (c, j) { var col = L(3 + j); return col + '$6*IF(' + col + '$7=1,6-' + col + r + ',' + col + r + ')'; }).join('+');
      s.put(3 + n, r, { f: '=(' + terms + ')/SUM($D$6:$' + L(2 + n) + '$6)' }, 'total', 'dec');
    });
    var r1 = r0 + S.items.length - 1, sc = L(3 + n);
    S.items.forEach(function (it, i) { var r = r0 + i; s.put(4 + n, r, { f: '=RANK(' + sc + r + ',$' + sc + '$' + r0 + ':$' + sc + '$' + r1 + ')' }, 'calc', 'int');
      s.put(5 + n, r, { f: '=IF(' + sc + r + '>=' + num(S.tiers.t1) + ',"Tier 1",IF(' + sc + r + '>=' + num(S.tiers.t2) + ',"Tier 2","Tier 3"))' }, 'calc'); });
    var nb = b.sheet('Notes', [2, 100]); nb.title('Notes'); S.items.forEach(function (it, i) { nb.put(1, 4 + i, it.name + ': ' + (it.note || '—'), 'wrap'); });
    return { wb: b.wb };
  }
  function screenSample() {
    return { version: 1, tool: 'target-screen', meta: { name: 'Acquisition search (illustrative)' }, settings: {}, tiers: { t1: 3.8, t2: 3.0 },
      criteria: [{ label: 'Strategic fit', weight: 0.25 }, { label: 'Size and affordability', weight: 0.15 }, { label: 'Financial quality', weight: 0.20 }, { label: 'Valuation attractiveness', weight: 0.15 },
        { label: 'Integration complexity', weight: 0.10, inverse: true }, { label: 'Owner willingness', weight: 0.10 }, { label: 'Regulatory / deal risk', weight: 0.05, inverse: true }],
      items: [{ name: 'Target A (illustrative)', type: 'Private', s: [5, 4, 4, 3, 2, 3, 2], note: '' }, { name: 'Target B (illustrative)', type: 'Listed (TSE)', s: [4, 3, 5, 2, 3, 2, 3], note: '' },
        { name: 'Target C (illustrative)', type: 'Private', s: [3, 5, 3, 4, 2, 5, 2], note: '' }, { name: 'Target D (illustrative)', type: 'Carve-out', s: [4, 2, 3, 4, 4, 4, 3], note: '' }], sources: {} };
  }
  function universeSample() {
    return { version: 1, tool: 'buyer-universe', meta: { name: 'Sale of Company X (illustrative)' }, settings: {}, tiers: { t1: 3.8, t2: 3.0 },
      criteria: [{ label: 'Strategic fit', weight: 0.25 }, { label: 'Ability to pay', weight: 0.25 }, { label: 'Synergy potential', weight: 0.15 }, { label: 'Appetite / track record', weight: 0.15 },
        { label: 'Speed and certainty', weight: 0.10 }, { label: 'Confidentiality risk', weight: 0.10, inverse: true }],
      items: [{ name: 'Strategic buyer 1 (illustrative)', type: 'Strategic', s: [5, 4, 5, 4, 3, 3], note: '' }, { name: 'Strategic buyer 2 (illustrative)', type: 'Strategic', s: [4, 3, 4, 3, 3, 4], note: '' },
        { name: 'Holding / investment co. (illustrative)', type: 'Financial', s: [3, 5, 2, 4, 4, 2], note: '' }, { name: 'PE fund (illustrative)', type: 'Financial', s: [2, 4, 1, 4, 4, 2], note: '' },
        { name: 'Foreign strategic (illustrative)', type: 'Strategic', s: [4, 4, 4, 2, 1, 2], note: '' }], sources: {} };
  }

  /* ---------- acquisition pricing ---------- */
  function apSample() {
    return { version: 1, tool: 'acq-pricing', meta: { deal: 'Acquirer → Target (illustrative)', currency: 'IRR', unit: 'billion' }, settings: { scenario: 'base' },
      target: { standalone: 150000, sharesMn: 10000, price: 14000 },
      syn: { cost: rep(3000), revEbitda: rep(1500), phase: [0.3, 0.6, 0.9, 1, 1], integration: [2500, 1500, 500, 0, 0], tax: 0.25, rate: 0.30, g: 0.02, payAway: 0.5 },
      scenarios: { base: { realise: 0.8 }, upside: { realise: 1.0 }, downside: { realise: 0.5 } }, sens: { realStep: 0.15, rateStep: 0.02 }, sources: {} };
  }
  function apCalc(S, o) {
    o = o || {}; var y = S.syn, real = o.realise != null ? o.realise : num(S.scenarios[S.settings.scenario].realise), rate = o.rate != null ? o.rate : num(y.rate);
    var rows = [], pv = 0;
    for (var t = 0; t < 5; t++) {
      var gross = (num(y.cost[t]) + num(y.revEbitda[t])) * num(y.phase[t]) * real, at = gross * (1 - num(y.tax)), ic = num(y.integration[t]) * (1 - num(y.tax)), net = at - ic, df = 1 / Math.pow(1 + rate, t + 1);
      rows.push({ gross: gross, at: at, ic: ic, net: net, df: df, pv: net * df }); pv += net * df;
    }
    var last = rows[4].at, tv = rate > num(y.g) ? last * (1 + num(y.g)) / (rate - num(y.g)) : NaN, pvTv = tv / Math.pow(1 + rate, 5);
    var pvSyn = pv + pvTv, maxEq = num(S.target.standalone) + pvSyn * num(y.payAway), full = num(S.target.standalone) + pvSyn;
    var u = F.UNIT[S.meta.unit] || 1, sh = num(S.target.sharesMn) * 1e6, ps = function (v) { return sh > 0 ? v * u / sh : NaN; };
    return { rows: rows, pvExplicit: pv, tv: tv, pvTv: pvTv, pvSyn: pvSyn, maxEq: maxEq, fullEq: full, maxPs: ps(maxEq), fullPs: ps(full), standalonePs: ps(num(S.target.standalone)),
      maxPremium: num(S.target.price) > 0 ? ps(maxEq) / num(S.target.price) - 1 : NaN, synShare: pvSyn / num(S.target.standalone) };
  }
  function apRun(S) {
    var R = apCalc(S), rs = F.grid5(num(S.scenarios[S.settings.scenario].realise), num(S.sens.realStep)).map(function (x) { return Math.max(0, x); }), ks = F.grid5(num(S.syn.rate), num(S.sens.rateStep));
    R.sens = { rs: rs, ks: ks, grid: rs.map(function (r) { return ks.map(function (k) { return apCalc(S, { realise: r, rate: k }).maxPremium; }); }) };
    R.scen = {}; ['base', 'upside', 'downside'].forEach(function (k) { var s2 = JSON.parse(JSON.stringify(S)); s2.settings.scenario = k; R.scen[k] = apCalc(s2); });
    R.checks = []; if (R.pvTv / R.pvSyn > 0.7) R.checks.push({ level: 'warning', msg: 'Over 70% of synergy value sits in the terminal value: you are paying for synergies beyond year 5.' });
    if (num(S.syn.payAway) > 0.6) R.checks.push({ level: 'warning', msg: 'Paying away more than 60% of synergies leaves little margin for execution risk.' });
    return R;
  }
  function apBuild(ExcelJS, S, R) {
    var X = Hub.xl, L = X.L, b = X.book(ExcelJS), ut = S.meta.currency + ' ' + S.meta.unit + 's';
    var sum = b.sheet('Summary', [2, 44, 16, 16, 16]), A = b.sheet('Assumptions', [2, 44, 10, 13, 13, 13, 13, 13]), C = b.sheet('Calculations', [2, 44, 10, 13, 13, 13, 13, 13]);
    A.title('Assumptions', S.meta.deal + ' · ' + ut); var a = {}, r = 4;
    function sc(key, label, unit, v, fmt) { A.put(1, r, label); A.put(2, r, unit, 'unit'); A.put(3, r, v, 'in', fmt); a[key] = A.ref(3, r); r++; }
    function row5(key, label, unit, arr, fmt) { A.put(1, r, label); A.put(2, r, unit, 'unit'); for (var t = 0; t < 5; t++) A.put(3 + t, r, num(arr[t]), 'in', fmt); a[key] = r; r++; }
    A.sec(r++, 'Target', 7); sc('unit', 'Monetary unit', '', S.meta.unit); sc('sa', 'Standalone equity value', ut, num(S.target.standalone), 'money'); sc('sh', 'Diluted shares', 'mn', num(S.target.sharesMn), 'money2'); sc('px', 'Unaffected share price', S.meta.currency, num(S.target.price), 'money2');
    r++; A.sec(r++, 'Synergies (pre-tax, run-rate)', 7, ['Y1', 'Y2', 'Y3', 'Y4', 'Y5']);
    row5('cs', 'Cost synergies', ut, S.syn.cost, 'money'); row5('rv', 'Revenue synergies (EBITDA impact)', ut, S.syn.revEbitda, 'money'); row5('ph', 'Phase-in', '%', S.syn.phase, 'pct'); row5('ic', 'One-off integration costs', ut, S.syn.integration, 'money');
    sc('tx', 'Tax rate', '%', num(S.syn.tax), 'pct'); sc('k', 'Discount rate for synergies', '%', num(S.syn.rate), 'pct2'); sc('g', 'Synergy growth after year 5', '%', num(S.syn.g), 'pct2'); sc('pa', 'Share of synergies paid to the seller', '%', num(S.syn.payAway), 'pct');
    r++; A.sec(r++, 'Realisation by scenario', 7, ['Base', 'Upside', 'Downside']); A.put(1, r, 'Synergies realised'); ['base', 'upside', 'downside'].forEach(function (k, j) { A.put(3 + j, r, num(S.scenarios[k].realise), 'in', 'pct'); }); var rr0 = r; r++;
    sc('scen', 'Scenario (1 Base, 2 Upside, 3 Downside)', '#', ['base', 'upside', 'downside'].indexOf(S.settings.scenario) + 1, 'int');
    A.put(1, r, 'Active realisation'); A.put(3, r, { f: '=CHOOSE(' + a.scen + ',D' + rr0 + ',E' + rr0 + ',F' + rr0 + ')' }, 'calc', 'pct'); a.re = A.ref(3, r); r++;
    C.title('Calculations', 'PV of net synergies and maximum price'); C.sec(4, 'Net synergies', 7, ['Y1', 'Y2', 'Y3', 'Y4', 'Y5']);
    var AS = "'Assumptions'!", rowF = function (row, lab, fn, fmt, kind) { C.put(1, row, lab, kind); for (var t = 0; t < 5; t++) C.put(3 + t, row, { f: fn(L(3 + t), t) }, kind || 'calc', fmt || 'money'); };
    rowF(5, 'Gross synergies realised', function (c) { return '=(' + AS + c + '$' + a.cs + '+' + AS + c + '$' + a.rv + ')*' + AS + c + '$' + a.ph + '*' + a.re; });
    rowF(6, 'After tax', function (c) { return '=' + c + '5*(1-' + a.tx + ')'; }); rowF(7, 'Less: integration costs after tax', function (c) { return '=' + AS + c + '$' + a.ic + '*(1-' + a.tx + ')'; });
    rowF(8, 'Net synergies', function (c) { return '=' + c + '6-' + c + '7'; }, 'money', 'total'); rowF(9, 'Discount factor', function (c, t) { return '=1/(1+' + a.k + ')^' + (t + 1); }, 'dec3'); rowF(10, 'PV', function (c) { return '=' + c + '8*' + c + '9'; });
    var cr = function (row, lab, f, fmt, kind) { C.put(1, row, lab, kind); C.put(3, row, { f: f }, kind || 'calc', fmt || 'money'); };
    cr(12, 'PV of explicit-period synergies', '=SUM(D10:H10)'); cr(13, 'Terminal value of synergies', '=IF(' + a.k + '>' + a.g + ',H6*(1+' + a.g + ')/(' + a.k + '-' + a.g + '),NA())'); cr(14, 'PV of terminal value', '=D13/(1+' + a.k + ')^5');
    cr(15, 'PV of net synergies', '=D12+D14', 'money', 'total'); cr(16, 'Maximum equity price (standalone + paid-away synergies)', '=' + a.sa + '+D15*' + a.pa, 'money', 'total');
    cr(17, 'Value to acquirer with all synergies', '=' + a.sa + '+D15'); var uX = F.unitXl(a.unit);
    cr(18, 'Maximum price per share (' + S.meta.currency + ')', '=IF(' + a.sh + '>0,D16*' + uX + '/(' + a.sh + '*1E6),NA())', 'money2', 'total'); cr(19, 'Walk-away premium over unaffected price', '=IF(' + a.px + '>0,D18/' + a.px + '-1,NA())', 'pct', 'total');
    sum.title(S.meta.deal + ' · Acquisition pricing', ut);
    [['PV of net synergies', 'D15', 'money'], ['Maximum equity price', 'D16', 'money'], ['Maximum price per share', 'D18', 'money2'], ['Walk-away premium', 'D19', 'pct']].forEach(function (x, i) { sum.put(1, 4 + i, x[0], i > 1 ? 'total' : null); sum.put(2, 4 + i, { f: "='Calculations'!" + x[1] }, i > 1 ? 'total' : 'calc', x[2]); });
    sum.sec(9, 'Scenario snapshot (values at export)', 4, ['Base', 'Upside', 'Downside'], 2); sum.put(1, 10, 'Walk-away premium'); ['base', 'upside', 'downside'].forEach(function (k, j) { sum.put(2 + j, 10, R.scen[k].maxPremium, null, 'pct'); });
    X.notes(b, ['Maximum price = standalone value + PV of net synergies × share paid to the seller. Paying 100% leaves the acquirer with no value created.', 'Synergies phased in and multiplied by the realisation rate of the scenario; integration costs are not scaled.', 'Discount synergies at a rate reflecting their risk, typically above the target WACC for revenue synergies.'], S.sources);
    return { wb: b.wb };
  }

  /* ---------- bid comparison ---------- */
  function bidSample() {
    return { version: 1, tool: 'bid-compare', meta: { deal: 'Sale of Company X (illustrative)', currency: 'IRR', unit: 'billion' }, settings: {}, range: { low: 129000, mid: 160750, high: 195500 }, rate: 0.30,
      bids: [{ bidder: 'Bidder 1 (illustrative)', upfront: 150000, deferred: 0, years: 0, prob: 1, certainty: 0.9, months: 4, note: 'All cash, financing committed' },
        { bidder: 'Bidder 2 (illustrative)', upfront: 140000, deferred: 40000, years: 2, prob: 0.6, certainty: 0.8, months: 6, note: 'Earn-out on EBITDA targets' },
        { bidder: 'Bidder 3 (illustrative)', upfront: 170000, deferred: 0, years: 0, prob: 1, certainty: 0.6, months: 9, note: 'Subject to regulatory approval and financing' }], sources: {} };
  }
  function bidRun(S) {
    var r = num(S.rate);
    var rows = S.bids.map(function (b) { var pvDef = num(b.deferred) * num(b.prob) / Math.pow(1 + r, num(b.years)), headline = num(b.upfront) + num(b.deferred), riskAdj = (num(b.upfront) + pvDef) * num(b.certainty) / Math.pow(1 + r, num(b.months) / 12);
      return { headline: headline, pvDeferred: pvDef, riskAdj: riskAdj, vsMid: num(S.range.mid) > 0 ? riskAdj / num(S.range.mid) - 1 : NaN }; });
    var order = rows.map(function (x, i) { return i; }).sort(function (a, b) { return rows[b].riskAdj - rows[a].riskAdj; }); order.forEach(function (i, k) { rows[i].rank = k + 1; });
    var hOrder = rows.map(function (x, i) { return i; }).sort(function (a, b) { return rows[b].headline - rows[a].headline; });
    var c = []; if (hOrder[0] !== order[0] && rows.length > 1) c.push({ level: 'warning', msg: 'The highest headline bid (' + S.bids[hOrder[0]].bidder + ') is not the best after deferral, probability and certainty (' + S.bids[order[0]].bidder + ').' });
    return { rows: rows, best: S.bids[order[0]] ? S.bids[order[0]].bidder : '', bestValue: rows[order[0]] ? rows[order[0]].riskAdj : NaN, checks: c };
  }
  function bidBuild(ExcelJS, S, R) {
    var X = Hub.xl, b = X.book(ExcelJS), s = b.sheet('Bids', [2, 30, 14, 14, 8, 10, 10, 10, 14, 14, 14, 8, 40]);
    s.title('Bid comparison · ' + S.meta.deal, S.meta.currency + ' ' + S.meta.unit + 's · certainty-adjusted value = (upfront + PV of deferred × probability) × certainty ÷ (1 + r)^(months/12)');
    s.put(1, 4, 'Discount rate'); s.put(2, 4, num(S.rate), 'in', 'pct'); s.put(1, 5, 'Valuation range mid'); s.put(2, 5, num(S.range.mid), 'in', 'money');
    s.sec(7, 'Bidder', 12, ['Upfront', 'Deferred', 'Years', 'Probability', 'Certainty', 'Months to close', 'Headline', 'PV deferred', 'Certainty-adjusted', 'Rank', 'Note'], 2);
    var r0 = 8, r1 = r0 + S.bids.length - 1;
    S.bids.forEach(function (x, i) { var r = r0 + i; s.put(1, r, x.bidder, 'in'); [['upfront', 'money'], ['deferred', 'money'], ['years', 'dec'], ['prob', 'pct'], ['certainty', 'pct'], ['months', 'int']].forEach(function (k, j) { s.put(2 + j, r, num(x[k[0]]), 'in', k[1]); });
      s.put(8, r, { f: '=C' + r + '+D' + r }, 'calc', 'money'); s.put(9, r, { f: '=D' + r + '*F' + r + '/(1+$C$4)^E' + r }, 'calc', 'money');
      s.put(10, r, { f: '=(C' + r + '+J' + r + ')*G' + r + '/(1+$C$4)^(H' + r + '/12)' }, 'total', 'money'); s.put(11, r, { f: '=RANK(K' + r + ',$K$' + r0 + ':$K$' + r1 + ')' }, 'calc', 'int'); s.put(12, r, x.note || '', 'wrap'); });
    return { wb: b.wb };
  }

  Hub.tools = Hub.tools || {};
  Hub.tools.screen = { sample: screenSample, run: scoreRun, build: function (E, S, R) { return scoreBuild(E, S, R, 'Target screening'); } };
  Hub.tools.universe = { sample: universeSample, run: scoreRun, build: function (E, S, R) { return scoreBuild(E, S, R, 'Buyer universe'); } };
  Hub.tools.acqPricing = { sample: apSample, run: apRun, build: apBuild }; Hub.tools.bids = { sample: bidSample, run: bidRun, build: bidBuild };
  if (typeof module !== 'undefined' && module.exports) module.exports = Hub.tools;
  if (!root.document || !Hub.toolkit) return;

  /* ======================= UI ======================= */
  var U = Hub.util, h = U.h, G = Hub.grid, TK = Hub.toolkit;
  function ul(S) { return S.meta.currency + ' ' + F.unitShort(S.meta.unit); }
  function scoringTool(id, title, section, sample, label, typeLabel) {
    TK.define({ id: id, title: title, sections: [section], priority: 1, version: 1, storeKey: 'hub.' + id + '.v1',
      summary: label, sample: sample, run: scoreRun, scenarios: false,
      eyebrow: function () { return (section === 'buyside' ? 'Buy-side advisory' : 'Sell-side advisory') + ' · ' + title; }, heading: function (S) { return S.meta.name; }, filename: function (S) { return S.meta.name + '_' + id; },
      xlsx: function (S, R) { return scoreBuild(root.ExcelJS, S, R, title).wb; },
      kpis: function (ctx) { return [['Top ranked', function () { return ctx.R.top[0] || '–'; }, function () { return ctx.R.top.slice(1).join(' · '); }], ['Tier 1', function () { return String(ctx.R.rows.filter(function (r) { return r.tier === 'Tier 1'; }).length); }, function () { return 'score ≥ ' + ctx.S.tiers.t1; }]]; },
      tabs: [{ group: 'Scoring', items: [['score', 'Scoring', function (ctx) {
        var S = ctx.S;
        var crit = ctx.list({ id: id + '-c', path: 'criteria', newRow: function () { return { label: 'New criterion', weight: 0 }; }, onChange: function () { S.items.forEach(function (it) { while (it.s.length < S.criteria.length) it.s.push(3); it.s.length = S.criteria.length; }); ctx.rerender(); },
          cols: [{ key: 'label', label: 'Criterion', kind: 'text' }, { key: 'weight', label: 'Weight', fmt: 'pct' }, { key: 'inverse', label: 'Inverse (high = bad)', kind: 'bool' }] });
        S.criteria.forEach(function (c) { if (c.inverse === undefined) c.inverse = false; });
        var cols = [{ key: 'name', label: 'Name', kind: 'text' }, { key: 'type', label: typeLabel, kind: 'text' }].concat(S.criteria.map(function (c, j) { return { key: 's' + j, label: c.label + ' (1–5)', arr: 's', idx: j, fmt: 'dec' }; }))
          .concat([{ key: '_s', label: 'Score', kind: 'calc', fmt: 'dec', calc: function (r, i) { return ctx.R.rows[i] ? ctx.R.rows[i].score : null; } }, { key: '_r', label: 'Rank', kind: 'calc', fmt: 'days', calc: function (r, i) { return ctx.R.rows[i] ? ctx.R.rows[i].rank : null; } },
            { key: '_t', label: 'Tier', kind: 'calc', calc: function (r, i) { return ctx.R.rows[i] ? ctx.R.rows[i].tier : ''; } }, { key: 'note', label: 'Rationale', kind: 'text' }]);
        var items = ctx.list({ id: id + '-i', path: 'items', newRow: function () { return { name: '', type: '', s: S.criteria.map(function () { return 3; }), note: '' }; }, cols: cols });
        var tf = G.form({ id: id + '-t', onChange: ctx.recompute, fields: [{ key: 'n', label: 'Mandate', text: true, get: function () { return S.meta.name; }, set: function (v) { S.meta.name = v; } }, ctx.field('t1', 'Tier 1 from score', 'tiers.t1', 'dec'), ctx.field('t2', 'Tier 2 from score', 'tiers.t2', 'dec')] });
        return ctx.group([ctx.two(ctx.panel('Criteria and weights', [crit]), ctx.panel('Mandate and tiers', [tf])), ctx.panel('Scores (1 = poor … 5 = strong)', [items])]);
      }]] }] });
  }
  scoringTool('target-screen', 'Target Screening', 'buyside', screenSample, 'Weighted criteria, scores, ranking and tiers for acquisition targets.', 'Type');
  scoringTool('buyer-universe', 'Buyer Universe', 'sellside', universeSample, 'Strategic and financial buyers scored on fit, ability to pay, synergies, appetite and certainty; ranked into tiers.', 'Strategic / financial');

  TK.define({ id: 'acq-pricing', title: 'Acquisition Pricing & Synergies', sections: ['buyside'], priority: 2, version: 1, storeKey: 'hub.acqpricing.v1',
    summary: 'Standalone value plus PV of net synergies: maximum price, walk-away premium, share of synergies paid away.',
    sample: apSample, run: apRun, scenarios: true,
    eyebrow: function (S) { return 'Buy-side advisory · Pricing · ' + ul(S); }, heading: function (S) { return S.meta.deal; }, filename: function (S) { return S.meta.deal + '_AcqPricing'; },
    xlsx: function (S, R) { return apBuild(root.ExcelJS, S, R).wb; },
    kpis: function (ctx) { return [['Maximum price / share', function () { return U.fmtNum(ctx.R.maxPs); }, function () { return 'standalone ' + U.fmtNum(ctx.R.standalonePs); }],
      ['Walk-away premium', function () { return U.fmtPct(ctx.R.maxPremium); }, function () { return 'over unaffected ' + U.fmtNum(ctx.S.target.price); }],
      ['PV of net synergies', function () { return U.fmtNum(ctx.R.pvSyn); }, function () { return U.fmtPct(ctx.R.synShare) + ' of standalone'; }]]; },
    tabs: [{ group: 'Inputs', items: [['in', 'Synergies', function (ctx) {
      var S = ctx.S, yrs = ['Y1', 'Y2', 'Y3', 'Y4', 'Y5'].map(function (y) { return { label: y, cls: 'proj' }; });
      var f = G.form({ id: 'ap-t', onChange: ctx.recompute, fields: [{ key: 'd', label: 'Deal', text: true, get: function () { return S.meta.deal; }, set: function (v) { S.meta.deal = v; } },
        { key: 'u', label: 'Monetary unit', options: F.UNITS, get: function () { return S.meta.unit; }, set: function (v) { S.meta.unit = v; } },
        ctx.field('sa', 'Standalone equity value of target', 'target.standalone', 'num', { unit: ul(S), help: 'From the Company Model or Valuation Summary, before synergies.' }), ctx.field('sh', 'Diluted shares', 'target.sharesMn', 'dec', { unit: 'mn' }), ctx.field('px', 'Unaffected share price', 'target.price', 'dec', { unit: S.meta.currency }),
        ctx.field('tx', 'Tax rate', 'syn.tax', 'pct', { unit: '%' }), ctx.field('k', 'Discount rate for synergies', 'syn.rate', 'pct2', { unit: '%' }), ctx.field('g', 'Growth after year 5', 'syn.g', 'pct2', { unit: '%' }), ctx.field('pa', 'Share of synergies paid to seller', 'syn.payAway', 'pct', { unit: '%' })] });
      var t = G.table({ id: 'ap-s', corner: ul(S), cols: yrs, onChange: ctx.recompute, rows: [
        { label: 'Cost synergies (run-rate)', cell: function (c) { return ctx.inArr('syn.cost', c); } }, { label: 'Revenue synergies (EBITDA)', cell: function (c) { return ctx.inArr('syn.revEbitda', c); } },
        { label: 'Phase-in', unit: '%', cell: function (c) { return ctx.inArr('syn.phase', c, 'pct'); } }, { label: 'Integration costs', cell: function (c) { return ctx.inArr('syn.integration', c); } }] });
      var sc = G.table({ id: 'ap-r', corner: 'Realisation', cols: ctx.scenCols(), onChange: ctx.recompute, rows: [{ label: 'Synergies realised', unit: '%', cell: function (c) { return ctx.inVal('scenarios.' + ctx.scenKey(c) + '.realise', 'pct'); } }] });
      var pull = h('button', { class: 'btn ghost', type: 'button', text: 'Standalone from Company Model', onclick: function () { var c = U.store.get('hub.company.v1', null) || Hub.tools.company.sample(), r = Hub.tools.company.run(c), k = (F.UNIT[c.meta.unit] || 1) / (F.UNIT[S.meta.unit] || 1);
        S.target.standalone = r.V.eqBlend * k; S.target.sharesMn = num(c.bridge.sharesMn); S.target.price = num(c.bridge.price); ctx.rerender(); U.toast('Standalone value from ' + c.meta.company, 'good'); } });
      return ctx.group([ctx.two(ctx.panel('Target', [f, h('div', { class: 'row-ctl' }, [pull])]), ctx.panel('Realisation by scenario', [sc])), ctx.panel('Synergies', [t])]);
    }]] }, { group: 'Outputs', items: [['out', 'Maximum price', function (ctx) {
      var S = ctx.S, yrs = ['Y1', 'Y2', 'Y3', 'Y4', 'Y5'].map(function (y) { return { label: y, cls: 'proj' }; });
      var t = G.table({ id: 'ap-o', corner: ul(S), cols: yrs, rows: [['Gross synergies realised', 'gross'], ['After tax', 'at'], ['Integration costs after tax', 'ic'], ['Net synergies', 'net', 'total'], ['PV', 'pv']].map(function (x) { return { label: x[0], cls: x[2] || '', cell: function (c) { return ctx.calc(function () { return ctx.R.rows[c][x[1]]; }); } }; }) });
      var v = G.table({ id: 'ap-v', corner: ul(S), cols: ctx.scenCols(), rows: [['PV of net synergies', 'pvSyn'], ['Maximum equity price', 'maxEq', 'num', 'total'], ['Maximum price per share', 'maxPs', 'num', 'total'], ['Walk-away premium', 'maxPremium', 'pct', 'total'], ['Value with all synergies', 'fullEq']]
        .map(function (x) { return { label: x[0], cls: x[3] || '', cell: function (c) { return ctx.calc(function () { return ctx.R.scen[ctx.scenKey(c)][x[1]]; }, x[2] || 'num'); } }; }) });
      var box = h('div', { class: 'grid-wrap' }); function p() { var s = ctx.R.sens; TK.heat(box, 'Walk-away premium · realisation × discount rate', 'Realised', 'Rate', s.rs, s.ks, s.grid, 'pct', 'pct2', 'pct'); } p();
      return { el: h('div', { class: 'stack' }, [ctx.panel('Net synergies', [t]), ctx.panel('Maximum price by scenario', [v]), ctx.panel(null, [box])]), refresh: function () { t.refresh(); v.refresh(); p(); } };
    }]] }] });

  TK.define({ id: 'bid-compare', title: 'Bid Comparison', sections: ['sellside'], priority: 2, version: 1, storeKey: 'hub.bids.v1',
    summary: 'Offers compared on certainty-adjusted value: deferred and earn-out payments, probability, closing certainty and timing, against the valuation range.',
    sample: bidSample, run: bidRun, scenarios: false,
    eyebrow: function (S) { return 'Sell-side advisory · Offers · ' + ul(S); }, heading: function (S) { return S.meta.deal; }, filename: function (S) { return S.meta.deal + '_Bids'; },
    xlsx: function (S, R) { return bidBuild(root.ExcelJS, S, R).wb; },
    kpis: function (ctx) { return [['Best certainty-adjusted', function () { return ctx.R.best || '–'; }, function () { return U.fmtNum(ctx.R.bestValue); }], ['vs valuation mid', function () { return U.fmtPct(ctx.R.bestValue / ctx.S.range.mid - 1); }, function () { return 'mid ' + U.fmtNum(ctx.S.range.mid); }]]; },
    tabs: [{ group: 'Offers', items: [['bids', 'Bids', function (ctx) {
      var S = ctx.S;
      var f = G.form({ id: 'bd-r', onChange: ctx.recompute, fields: [{ key: 'd', label: 'Deal', text: true, get: function () { return S.meta.deal; }, set: function (v) { S.meta.deal = v; } },
        ctx.field('lo', 'Valuation range · low', 'range.low'), ctx.field('mi', 'Valuation range · mid', 'range.mid'), ctx.field('hi', 'Valuation range · high', 'range.high'), ctx.field('r', 'Discount rate for deferred value and time', 'rate', 'pct2', { unit: '%' })] });
      var pull = h('button', { class: 'btn ghost', type: 'button', text: 'Range from Valuation Summary', onclick: function () { var v = U.store.get('hub.valsummary.v1', null) || Hub.tools.valsummary.sample(), r = Hub.tools.valsummary.run(v); S.range = { low: r.W.low, mid: r.W.mid, high: r.W.high }; ctx.rerender(); } });
      var l = ctx.list({ id: 'bd-l', path: 'bids', newRow: function () { return { bidder: '', upfront: 0, deferred: 0, years: 0, prob: 1, certainty: 1, months: 3, note: '' }; }, cols: [
        { key: 'bidder', label: 'Bidder', kind: 'text' }, { key: 'upfront', label: 'Upfront equity' }, { key: 'deferred', label: 'Deferred / earn-out' }, { key: 'years', label: 'Years to deferred', fmt: 'dec' }, { key: 'prob', label: 'Probability of deferred', fmt: 'pct' },
        { key: 'certainty', label: 'Closing certainty', fmt: 'pct' }, { key: 'months', label: 'Months to close', fmt: 'dec' },
        { key: '_h', label: 'Headline', kind: 'calc', calc: function (r, i) { return ctx.R.rows[i] ? ctx.R.rows[i].headline : null; } }, { key: '_a', label: 'Certainty-adjusted', kind: 'calc', calc: function (r, i) { return ctx.R.rows[i] ? ctx.R.rows[i].riskAdj : null; } },
        { key: '_v', label: 'vs mid', kind: 'calc', fmt: 'pct', calc: function (r, i) { return ctx.R.rows[i] ? ctx.R.rows[i].vsMid : null; } }, { key: '_k', label: 'Rank', kind: 'calc', fmt: 'days', calc: function (r, i) { return ctx.R.rows[i] ? ctx.R.rows[i].rank : null; } }, { key: 'note', label: 'Conditions', kind: 'text' }] });
      return ctx.group([ctx.two(ctx.panel('Valuation range and rate', [f, h('div', { class: 'row-ctl' }, [pull])]), ctx.panel('How offers are compared', [h('p', { class: 'muted', text: 'Certainty-adjusted value = (upfront + PV of deferred × probability) × closing certainty, discounted for time to close. Certainty is your judgement of financing, regulatory and due-diligence conditions.' })])), ctx.panel('Offers', [l])]);
    }]] }] });
})(typeof window !== 'undefined' ? window : globalThis);
