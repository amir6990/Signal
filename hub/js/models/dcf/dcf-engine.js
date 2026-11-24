/* =====================================================================
 * DCF ENGINE  —  pure calculation layer (no DOM).
 * Unlevered free-cash-flow DCF, Rosenbaum & Pearl / McKinsey conventions.
 *
 *   Inputs  : a plain `state` object (see dcf-sample.js for the schema)
 *   Output  : `run(state)` returns every intermediate line, so the UI,
 *             the Excel export and the tests all read the same numbers.
 *
 * Conventions (all documented in the UI "Method notes" panel):
 *   - Valuation date = last historical fiscal year-end (no stub period).
 *   - Discount period t (or t-0.5 with mid-year convention).
 *   - Gordon TV discounted at N-0.5 under mid-year, exit-multiple TV at N
 *     (Rosenbaum & Pearl). Without mid-year both use N.
 *   - Basis "real": operating drivers are in constant prices of the last
 *     historical year; WACC, cost of debt and cash yield (entered as
 *     nominal market rates) are converted with Fisher: (1+n)/(1+pi)-1.
 *   - Interest uses OPENING balances (no circularity).
 *   - Cash is the balance-sheet plug; debt follows the financing schedule.
 * Works in browser (window.Hub.DCF.engine) and Node (module.exports).
 * ===================================================================== */
(function (root) {
  'use strict';

  var N = 5;                       // explicit forecast years
  var SCEN = ['base', 'upside', 'downside'];

  function num(v) { var x = Number(v); return isFinite(x) ? x : 0; }
  function arr(a, n) { var o = []; for (var i = 0; i < n; i++) o.push(num(a && a[i])); return o; }
  function fisherReal(nominal, infl) { return (1 + nominal) / (1 + infl) - 1; }
  function last(a) { return a[a.length - 1]; }

  /* ---------- Method choices (user-selectable; defaults = best practice) ----
   * cf       : 'fcff' (free cash flow to the firm at WACC → EV → equity)  — default, R&P / McKinsey
   *            'fcfe' (free cash flow to equity at cost of equity → equity directly) — Damodaran; preferred
   *            for banks/financials or when leverage is set by policy rather than a target ratio.
   * exitFcff : terminal multiple on enterprise value — EV/EBITDA (default) · EV/EBIT · EV/Sales
   * exitFcfe : terminal multiple on equity value — P/E (default) · P/S · P/B · EV/EBITDA − net debt  */
  var METHOD_DEF = { cf: 'fcff', tvRate: 'same', gBuild: 'direct', exitFcff: 'evEbitda', exitFcfe: 'pe' };
  /* tvRate : 'same' (TV discounted in the Gordon denominator at the forecast rate — best practice) | 'rf' (risk-free, house)
   * gBuild : 'direct' (g as entered, on the model basis) | 'fisher' (real g → nominal: (1+g)(1+π)−1 — best practice
   *          on a nominal model) | 'additive' (g + π, house). On a real-basis model all three use g as entered. */
  var EXITS = {
    evEbitda: { field: 'exitMultiple', label: 'EV / EBITDA', eq: false, def: [8, 9, 6.5] },
    evEbit: { field: 'exitEvEbit', label: 'EV / EBIT', eq: false, def: [10, 11.5, 8] },
    evSales: { field: 'exitEvSales', label: 'EV / Sales', eq: false, def: [1.5, 1.8, 1.1] },
    pe: { field: 'exitPe', label: 'P / E', eq: true, def: [10, 12, 8] },
    ps: { field: 'exitPs', label: 'P / S', eq: true, def: [1.2, 1.5, 0.9] },
    pb: { field: 'exitPb', label: 'P / B', eq: true, def: [1.5, 1.8, 1.1] }
  };
  var FCFF_EXITS = ['evEbitda', 'evEbit', 'evSales'], FCFE_EXITS = ['pe', 'ps', 'pb', 'evEbitda'];
  function methodOf(state) {
    state.method = Object.assign({}, METHOD_DEF, state.method || {});
    if (FCFF_EXITS.indexOf(state.method.exitFcff) < 0) state.method.exitFcff = 'evEbitda';
    if (FCFE_EXITS.indexOf(state.method.exitFcfe) < 0) state.method.exitFcfe = 'pe';
    if (['same', 'rf'].indexOf(state.method.tvRate) < 0) state.method.tvRate = 'same';
    if (['direct', 'fisher', 'additive'].indexOf(state.method.gBuild) < 0) state.method.gBuild = 'direct';
    return state.method;
  }
  // fill missing exit multiples (older saved models only carry EV/EBITDA)
  function ensureMultiples(state) {
    SCEN.forEach(function (k, i) {
      var sc = state.scenarios[k]; if (!sc) return;
      Object.keys(EXITS).forEach(function (x) {
        var e = EXITS[x]; if (sc[e.field] == null || sc[e.field] === '') sc[e.field] = e.def[i];
      });
    });
  }
  function growthUsed(state, gIn) {
    var M = methodOf(state), inf = num(state.wacc.inflation);
    if (M.gBuild === 'direct' || state.settings.basis === 'real') return gIn;
    return M.gBuild === 'additive' ? gIn + inf : (1 + gIn) * (1 + inf) - 1;
  }
  // rate in the Gordon denominator: the forecast discount rate (default) or the risk-free rate (house option)
  function tvRateOf(state, W) { return methodOf(state).tvRate === 'rf' ? wacc(state.wacc, state.settings.basis).rfUsed : W; }
  function exitMetric(P, type) {
    var t = P.revenue.length - 1;
    return type === 'evEbit' ? P.ebit[t] : (type === 'evSales' || type === 'ps') ? P.revenue[t] : type === 'pe' ? P.netIncome[t] : type === 'pb' ? P.equity[t] : P.ebitda[t];
  }
  function netDebtAt(P, t) { return P.debt[t] - P.cash[t] + P.minority[t]; }
  function multipleOf(state, scenKey, type) { return num(state.scenarios[scenKey][EXITS[type].field]); }

  var UNIT_MULT = { 'thousand': 1e3, 'million': 1e6, 'billion': 1e9, 'trillion': 1e12, 'units': 1 };

  /* ---------- WACC build ------------------------------------------- */
  function wacc(w, basis) {
    var t = num(w.taxRate), wd = num(w.debtWeight), we = 1 - wd;
    var de = we > 0 ? wd / we : 0;
    var betaL = w.betaMode === 'relever'
      ? num(w.betaUnlevered) * (1 + (1 - t) * de)
      : num(w.betaLevered);
    var keCalc = num(w.rf) + betaL * num(w.erp) + num(w.crp) + num(w.sizePremium);
    var ke = w.keMode === 'manual' ? num(w.keManual) : keCalc;            // computed (CAPM) or the user's own number (nominal)
    var kdAfter = num(w.kdPreTax) * (1 - t);
    var nomCalc = we * ke + wd * kdAfter, nominal = w.waccMode === 'manual' ? num(w.waccManual) : nomCalc;
    var infl = num(w.inflation);
    var real = fisherReal(nominal, infl);
    return {
      debtToEquity: de, betaL: betaL, ke: ke, keCalc: keCalc, nomCalc: nomCalc, keManual: w.keMode === 'manual', waccManual: w.waccMode === 'manual', kdAfterTax: kdAfter,
      equityWeight: we, debtWeight: wd,
      nominal: nominal, real: real, inflation: infl,
      used: basis === 'real' ? real : nominal,
      keUsed: basis === 'real' ? fisherReal(ke, infl) : ke,
      rfUsed: basis === 'real' ? fisherReal(num(w.rf), infl) : num(w.rf)
    };
  }

  /* ---------- Historical derived lines ------------------------------ */
  function historicals(h) {
    var n = h.years.length, is = h.is, bs = h.bs;
    var o = { years: h.years.slice(), revenue: arr(is.revenue, n) };
    o.cogs = arr(is.cogs, n); o.sga = arr(is.sga, n); o.otherOpex = arr(is.otherOpex, n);
    o.da = arr(is.da, n); o.interestExp = arr(is.interestExp, n); o.interestInc = arr(is.interestInc, n);
    o.otherNonOp = arr(is.otherNonOp, n); o.tax = arr(is.tax, n);
    o.grossProfit = o.revenue.map(function (r, i) { return r - o.cogs[i]; });
    o.ebitda = o.grossProfit.map(function (g, i) { return g - o.sga[i] - o.otherOpex[i]; });
    o.ebit = o.ebitda.map(function (e, i) { return e - o.da[i]; });
    o.ebt = o.ebit.map(function (e, i) { return e - o.interestExp[i] + o.interestInc[i] + o.otherNonOp[i]; });
    o.netIncome = o.ebt.map(function (e, i) { return e - o.tax[i]; });
    ['cash', 'ar', 'inventory', 'otherCA', 'ppe', 'otherNCA', 'ap', 'otherCL', 'std', 'ltd', 'otherNCL', 'minority', 'equity']
      .forEach(function (k) { o[k] = arr(bs[k], n); });
    o.totalAssets = o.cash.map(function (c, i) { return c + o.ar[i] + o.inventory[i] + o.otherCA[i] + o.ppe[i] + o.otherNCA[i]; });
    o.debt = o.std.map(function (s, i) { return s + o.ltd[i]; });
    o.totalLiab = o.ap.map(function (a, i) { return a + o.otherCL[i] + o.debt[i] + o.otherNCL[i]; });
    o.balanceCheck = o.totalAssets.map(function (ta, i) { return ta - o.totalLiab[i] - o.minority[i] - o.equity[i]; });
    o.nwc = o.ar.map(function (a, i) { return a + o.inventory[i] + o.otherCA[i] - o.ap[i] - o.otherCL[i]; });
    o.cfo = arr(h.cfs.cfo, n); o.capex = arr(h.cfs.capex, n); o.dividends = arr(h.cfs.dividends, n);
    // ratios used to sanity-check projection drivers
    o.revGrowth = o.revenue.map(function (r, i) { return i === 0 || !o.revenue[i - 1] ? null : r / o.revenue[i - 1] - 1; });
    o.grossMargin = o.revenue.map(function (r, i) { return r ? o.grossProfit[i] / r : null; });
    o.ebitdaMargin = o.revenue.map(function (r, i) { return r ? o.ebitda[i] / r : null; });
    o.dso = o.revenue.map(function (r, i) { return r ? o.ar[i] / r * 365 : null; });
    o.dio = o.cogs.map(function (c, i) { return c ? o.inventory[i] / c * 365 : null; });
    o.dpo = o.cogs.map(function (c, i) { return c ? o.ap[i] / c * 365 : null; });
    o.effTax = o.ebt.map(function (e, i) { return e ? o.tax[i] / e : null; });
    return o;
  }

  /* ---------- Integrated projection (IS / BS / CFS) ----------------- */
  function project(state, scenKey, H, W) {
    var a = state.scenarios[scenKey], f = state.financing;
    var basis = state.settings.basis, infl = num(state.wacc.inflation);
    var kd = basis === 'real' ? fisherReal(num(state.wacc.kdPreTax), infl) : num(state.wacc.kdPreTax);
    var rc = basis === 'real' ? fisherReal(num(f.cashYield), infl) : num(f.cashYield);
    var g = arr(a.revGrowth, N), gm = arr(a.grossMargin, N), sga = arr(a.sgaPct, N), oth = arr(a.otherOpexPct, N),
        da = arr(a.daPct, N), cx = arr(a.capexPct, N), dso = arr(a.dso, N), dio = arr(a.dio, N), dpo = arr(a.dpo, N),
        oca = arr(a.otherCAPct, N), ocl = arr(a.otherCLPct, N), tx = arr(a.taxRate, N),
        dDebt = arr(f.debtChange, N), payout = num(f.payout);

    var P = { years: state.projYears.slice(0, N) };
    var keys = ['revenue', 'cogs', 'grossProfit', 'sga', 'otherOpex', 'ebitda', 'da', 'ebit', 'interestExp', 'interestInc',
      'ebt', 'tax', 'netIncome', 'ar', 'inventory', 'otherCA', 'ppe', 'otherNCA', 'ap', 'otherCL', 'debt', 'otherNCL',
      'minority', 'equity', 'cash', 'totalAssets', 'totalLE', 'balanceCheck', 'nwc', 'dNwc', 'capex', 'dividends',
      'cfo', 'cfi', 'cff', 'netCashFlow', 'nopat', 'ufcf', 'period', 'df', 'pvUfcf', 'ebitdaMargin', 'dDebt', 'fcfe'];
    keys.forEach(function (k) { P[k] = []; });

    var prev = {
      revenue: last(H.revenue), ppe: last(H.ppe), otherNCA: last(H.otherNCA), otherNCL: last(H.otherNCL),
      minority: last(H.minority), equity: last(H.equity), cash: last(H.cash), debt: last(H.debt), nwc: last(H.nwc)
    };
    var mid = !!state.settings.midYear;

    for (var t = 0; t < N; t++) {
      var rev = prev.revenue * (1 + g[t]);
      var cogs = rev * (1 - gm[t]);
      var gp = rev - cogs;
      var sg = rev * sga[t], ot = rev * oth[t];
      var ebitda = gp - sg - ot;
      var d = rev * da[t];
      var ebit = ebitda - d;
      var iE = prev.debt * kd, iI = prev.cash * rc;
      var ebt = ebit - iE + iI;
      var tax = Math.max(0, ebt) * tx[t];
      var ni = ebt - tax;

      var ar = rev * dso[t] / 365, inv = cogs * dio[t] / 365, ap = cogs * dpo[t] / 365;
      var oc = rev * oca[t], ol = rev * ocl[t];
      var nwc = ar + inv + oc - ap - ol, dN = nwc - prev.nwc;
      var capex = rev * cx[t];
      var ppe = prev.ppe + capex - d;
      var debt = prev.debt + dDebt[t];
      var div = Math.max(0, ni) * payout;
      var equity = prev.equity + ni - div;
      var cfo = ni + d - dN, cfi = -capex, cff = dDebt[t] - div;
      var cash = prev.cash + cfo + cfi + cff;
      var ta = cash + ar + inv + oc + ppe + prev.otherNCA;
      var tle = ap + ol + debt + prev.otherNCL + prev.minority + equity;

      var nopat = ebit * (1 - tx[t]);
      var ufcf = nopat + d - capex - dN;
      var per = mid ? t + 0.5 : t + 1;
      var df = 1 / Math.pow(1 + W, per);

      var row = {
        revenue: rev, cogs: cogs, grossProfit: gp, sga: sg, otherOpex: ot, ebitda: ebitda, da: d, ebit: ebit,
        interestExp: iE, interestInc: iI, ebt: ebt, tax: tax, netIncome: ni, ar: ar, inventory: inv, otherCA: oc,
        ppe: ppe, otherNCA: prev.otherNCA, ap: ap, otherCL: ol, debt: debt, otherNCL: prev.otherNCL,
        minority: prev.minority, equity: equity, cash: cash, totalAssets: ta, totalLE: tle, balanceCheck: ta - tle,
        nwc: nwc, dNwc: dN, capex: capex, dividends: div, cfo: cfo, cfi: cfi, cff: cff, netCashFlow: cfo + cfi + cff,
        nopat: nopat, ufcf: ufcf, period: per, df: df, pvUfcf: ufcf * df, ebitdaMargin: rev ? ebitda / rev : 0,
        dDebt: dDebt[t], fcfe: ni + d - capex - dN + dDebt[t]     // FCFE = NI + D&A − capex − ΔNWC + net borrowing
      };
      keys.forEach(function (k) { P[k].push(row[k]); });
      prev = { revenue: rev, ppe: ppe, otherNCA: prev.otherNCA, otherNCL: prev.otherNCL, minority: prev.minority,
               equity: equity, cash: cash, debt: debt, nwc: nwc };
    }
    P.kdUsed = kd; P.cashYieldUsed = rc;
    // balance offset carried from history (if the input BS did not balance)
    P.histImbalance = last(H.balanceCheck);
    return P;
  }

  /* ---------- Valuation from a projection --------------------------- */
  // Separated so sensitivity tables can re-price without re-projecting:
  // unlevered FCF does not depend on WACC, g or the exit multiple.
  function valueFCFF(state, P, H, W, g, mult) {
    var mid = !!state.settings.midYear, xt = methodOf(state).exitFcff;
    var fcfN = last(P.ufcf), ebitdaN = last(P.ebitda), metN = exitMetric(P, xt);
    var sumPV = 0;
    for (var t = 0; t < N; t++) sumPV += P.ufcf[t] / Math.pow(1 + W, mid ? t + 0.5 : t + 1);
    var perG = mid ? N - 0.5 : N, perX = N;

    var rT = tvRateOf(state, W);
    var tvG = rT > g ? fcfN * (1 + g) / (rT - g) : NaN;
    var tvX = metN * mult;
    var pvTvG = tvG / Math.pow(1 + W, perG), pvTvX = tvX / Math.pow(1 + W, perX);
    var evG = sumPV + pvTvG, evX = sumPV + pvTvX;

    var b = bridge(state, H);
    var eqG = evG + b.adjust, eqX = evX + b.adjust;
    var ps = perShareFactor(state);
    var wG = num(state.settings.gordonWeight);
    return {
      cf: 'fcff', exit: xt, exitLabel: EXITS[xt].label, rateLabel: 'WACC',
      sumPV: sumPV, fcfN: fcfN, ebitdaN: ebitdaN, metricN: metN, wacc: W, tvRate: rT, g: g, mult: mult,
      perG: perG, perX: perX,
      tvG: tvG, tvX: tvX, pvTvG: pvTvG, pvTvX: pvTvX, evG: evG, evX: evX,
      tvShareG: pvTvG / evG, tvShareX: pvTvX / evX,
      impliedMultFromG: tvG / metN,
      impliedGFromX: (tvX * rT - fcfN) / (tvX + fcfN),
      bridge: b, eqG: eqG, eqX: eqX,
      psG: eqG * ps, psX: eqX * ps,
      psBlend: wG * eqG * ps + (1 - wG) * eqX * ps,
      evBlend: wG * evG + (1 - wG) * evX,
      eqBlend: wG * eqG + (1 - wG) * eqX
    };
  }
  /* FCFE: discounted at the cost of equity. Opening cash is added (its yield is in net income, the
   * convention used by Damodaran's FCFE model); opening debt is NOT deducted — debt service is
   * already inside FCFE. Exit on an equity multiple gives equity value at N directly; EV/EBITDA
   * exit subtracts projected net debt (debt − cash + minority) at N. */
  function valueFCFE(state, P, H, ke, g, mult) {
    var mid = !!state.settings.midYear, xt = methodOf(state).exitFcfe;
    var fN = last(P.fcfe), metN = exitMetric(P, xt), ndN = netDebtAt(P, N - 1);
    var sumPV = 0;
    for (var t = 0; t < N; t++) sumPV += P.fcfe[t] / Math.pow(1 + ke, mid ? t + 0.5 : t + 1);
    var perG = mid ? N - 0.5 : N, perX = N;
    var rT = tvRateOf(state, ke);
    var tvG = rT > g ? fN * (1 + g) / (rT - g) : NaN;
    var tvX = metN * mult - (xt === 'evEbitda' ? ndN : 0);
    var pvTvG = tvG / Math.pow(1 + ke, perG), pvTvX = tvX / Math.pow(1 + ke, perX);
    var b = bridge(state, H), adjE = b.adjust + b.debt;          // cash − minority − pref + investments + NOA − other claims
    var eqG = sumPV + pvTvG + adjE, eqX = sumPV + pvTvX + adjE;
    var ps = perShareFactor(state), wG = num(state.settings.gordonWeight);
    var evG = eqG - b.adjust, evX = eqX - b.adjust;
    return {
      cf: 'fcfe', exit: xt, exitLabel: EXITS[xt].label + (xt === 'evEbitda' ? ' − net debt' : ''), rateLabel: 'Cost of equity',
      sumPV: sumPV, fcfN: fN, ebitdaN: last(P.ebitda), metricN: metN, netDebtN: ndN, wacc: ke, tvRate: rT, g: g, mult: mult,
      perG: perG, perX: perX, adjE: adjE,
      tvG: tvG, tvX: tvX, pvTvG: pvTvG, pvTvX: pvTvX, evG: evG, evX: evX,
      tvShareG: pvTvG / (sumPV + pvTvG), tvShareX: pvTvX / (sumPV + pvTvX),
      impliedMultFromG: xt === 'evEbitda' ? (tvG + ndN) / metN : tvG / metN,
      impliedGFromX: (tvX * rT - fN) / (tvX + fN),
      bridge: b, eqG: eqG, eqX: eqX,
      psG: eqG * ps, psX: eqX * ps,
      psBlend: (wG * eqG + (1 - wG) * eqX) * ps,
      evBlend: wG * evG + (1 - wG) * evX,
      eqBlend: wG * eqG + (1 - wG) * eqX
    };
  }
  // dispatch on the selected method (rate passed must match: WACC for FCFF, cost of equity for FCFE)
  function value(state, P, H, W, g, mult) { return methodOf(state).cf === 'fcfe' ? valueFCFE(state, P, H, W, g, mult) : valueFCFF(state, P, H, W, g, mult); }

  function bridge(state, H) {
    var b = state.bridge;
    var debt = last(H.debt), cash = last(H.cash), minority = last(H.minority);
    var adjust = -debt + cash - minority - num(b.preferred) + num(b.investments) + num(b.nonOpAssets) - num(b.otherClaims);
    return { debt: debt, cash: cash, netDebt: debt - cash, minority: minority, preferred: num(b.preferred),
             investments: num(b.investments), nonOpAssets: num(b.nonOpAssets), otherClaims: num(b.otherClaims), adjust: adjust };
  }

  // equity value (model units) -> value per share (currency per share)
  function perShareFactor(state) {
    var shares = num(state.bridge.sharesMn) * 1e6;
    var mult = UNIT_MULT[state.meta.unit] || 1;
    return shares > 0 ? mult / shares : 0;
  }

  /* ---------- Sensitivity ------------------------------------------- */
  function multStep(state, base) { return num(state.sens.multStep) * (base < 4 ? 0.25 : 1); }   // fine steps for low multiples (EV/Sales, P/S, P/B)
  function sensitivity(state, P, H, base, fn) {
    fn = fn || value;
    var s = state.sens, k = [-2, -1, 0, 1, 2], st = multStep(state, base.mult);
    var ws = k.map(function (i) { return base.wacc + i * num(s.waccStep); });
    var gs = k.map(function (i) { return base.g + i * num(s.gStep); });
    var ms = k.map(function (i) { return base.mult + i * st; });
    return {
      cf: base.cf, exitLabel: base.exitLabel, rateLabel: base.rateLabel,
      waccs: ws, gs: gs, mults: ms,
      gordon: ws.map(function (w) { return gs.map(function (g) { return fn(state, P, H, w, g, base.mult).psG; }); }),
      exit: ws.map(function (w) { return ms.map(function (m) { return fn(state, P, H, w, base.g, m).psX; }); }),
      evGordon: ws.map(function (w) { return gs.map(function (g) { return fn(state, P, H, w, g, base.mult).evG; }); })
    };
  }

  /* ---------- Reverse DCF: what the market price implies ------------- */
  function solve(fn, lo, hi) {             // bisection on a monotone fn, root in [lo,hi]
    var flo = fn(lo), fhi = fn(hi);
    if (!isFinite(flo) || !isFinite(fhi) || flo * fhi > 0) return null;
    for (var i = 0; i < 200; i++) {
      var mid = (lo + hi) / 2, fm = fn(mid);
      if (Math.abs(fm) < 1e-9 || hi - lo < 1e-10) return mid;
      if (fm * flo < 0) { hi = mid; } else { lo = mid; flo = fm; }
    }
    return (lo + hi) / 2;
  }
  function reverse(state, P, H, base) {
    var price = num(state.bridge.price);
    if (!(price > 0)) return null;
    var gImplied = solve(function (g) { return value(state, P, H, base.wacc, g, base.mult).psG - price; },
      -0.50, base.wacc - 1e-4);
    var wImplied = solve(function (w) { return value(state, P, H, w, base.g, base.mult).psG - price; },
      base.g + 1e-4, base.g + 1.0);
    var multImplied = solve(function (m) { return value(state, P, H, base.wacc, base.g, m).psX - price; }, -50, 500);
    return { price: price, gImplied: gImplied, waccImplied: wImplied, multImplied: multImplied };
  }

  /* ---------- Checks / warnings -------------------------------------- */
  function checks(state, H, P, V, W) {
    var out = [];
    // statements are rounded to the unit: differences up to 1 ppm of total assets (min 0.5, max 5 units) are rounding
    var tol = Math.min(5, Math.max(0.5, Math.abs(last(H.totalAssets)) * 1e-6));
    if (Math.abs(last(H.balanceCheck)) > 0.5 && Math.abs(last(H.balanceCheck)) <= tol)
      out.push({ level: 'info', msg: 'Historical balance sheet differs by ' + last(H.balanceCheck).toFixed(1) + ' (rounding in the source statements). Projected BS carries this difference.' });
    else if (Math.abs(last(H.balanceCheck)) > tol)
      out.push({ level: 'critical', msg: 'Latest historical balance sheet does not balance (difference ' + last(H.balanceCheck).toFixed(1) + '). Projected BS carries this difference.' });
    var maxBs = Math.max.apply(null, P.balanceCheck.map(function (x) { return Math.abs(x - P.histImbalance); }));
    if (maxBs > tol) out.push({ level: 'critical', msg: 'Projected balance sheet out of balance by ' + maxBs.toFixed(2) + '.' });
    var rT = V.tvRate != null ? V.tvRate : W;
    if (!(rT > V.g)) out.push({ level: 'critical', msg: 'The terminal-value rate (' + (rT === W ? (V.rateLabel || 'WACC') : 'risk-free') + ') must exceed terminal growth for the Gordon method.' });
    if (rT !== W) out.push({ level: 'warning', msg: 'Terminal value discounted at the risk-free rate (house option): the spread to growth narrows and TV dominates value. Best practice uses the cost of capital.' });
    if (V.tvShareG > 0.75) out.push({ level: 'warning', msg: 'Terminal value is ' + (V.tvShareG * 100).toFixed(0) + '% of EV (Gordon). Valuation rests mostly on the terminal assumption.' });
    if (state.settings.basis === 'real' && V.g > 0.03) out.push({ level: 'warning', msg: 'Real perpetual growth above 3% exceeds typical long-run real GDP growth.' });
    if (state.settings.basis === 'real' && fisherReal(num(state.wacc.rf), num(state.wacc.inflation)) < 0)
      out.push({ level: 'warning', msg: 'Risk-free rate is below expected inflation, so the implied real risk-free rate is negative. Check the inflation input or use a real rate proxy.' });
    if (state.settings.basis === 'nominal' && V.g < num(state.wacc.inflation) - 0.005)
      out.push({ level: 'warning', msg: 'Nominal perpetual growth (' + (V.g * 100).toFixed(1) + '%) is below expected inflation (' + (num(state.wacc.inflation) * 100).toFixed(1) + '%), i.e. a shrinking business in real terms. Switching basis does not convert the drivers: in Nominal mode, growth and terminal g must include inflation.' });
    var gap = Math.abs(V.impliedGFromX - V.g);
    if (isFinite(V.impliedGFromX) && gap > 0.015) out.push({ level: 'warning', msg: 'Exit multiple implies ' + (V.impliedGFromX * 100).toFixed(1) + '% perpetual growth vs ' + (V.g * 100).toFixed(1) + '% assumed. The two terminal methods disagree.' });
    if (last(P.cash) < 0) out.push({ level: 'warning', msg: 'Projected cash turns negative by the final year. Add debt in the financing schedule or lower the payout.' });
    var lastCx = last(arr(state.scenarios[state.settings.scenario].capexPct, N)), lastDa = last(arr(state.scenarios[state.settings.scenario].daPct, N));
    if (lastCx < lastDa) out.push({ level: 'warning', msg: 'Terminal-year capex is below D&A. A growing business normally reinvests at least its depreciation.' });
    return out;
  }

  /* ---------- Orchestrator ----------------------------------------- */
  function runScenario(state, scenKey) {
    var M = methodOf(state); ensureMultiples(state);
    var H = historicals(state.hist);
    var Wb = wacc(state.wacc, state.settings.basis);
    var a = state.scenarios[scenKey];
    var P = project(state, scenKey, H, Wb.used);
    var g = growthUsed(state, num(a.tvGrowth));
    var VF = valueFCFF(state, P, H, Wb.used, g, multipleOf(state, scenKey, M.exitFcff));
    var VE = valueFCFE(state, P, H, Wb.keUsed, g, multipleOf(state, scenKey, M.exitFcfe));
    return { H: H, W: Wb, P: P, VF: VF, VE: VE, V: M.cf === 'fcfe' ? VE : VF };
  }

  // FCFF vs FCFE reconciliation: differences come from (i) WACC with a target D/E vs the projected
  // financing plan inside FCFE, (ii) cash yield and (iii) different terminal multiples.
  function compare(r) {
    var f = r.VF, e = r.VE, d = function (x, y) { return y ? x / y - 1 : NaN; };
    return { psG: [f.psG, e.psG, d(e.psG, f.psG)], psX: [f.psX, e.psX, d(e.psX, f.psX)], psBlend: [f.psBlend, e.psBlend, d(e.psBlend, f.psBlend)],
      eqBlend: [f.eqBlend, e.eqBlend, d(e.eqBlend, f.eqBlend)], rate: [f.wacc, e.wacc], tvShareG: [f.tvShareG, e.tvShareG], exit: [f.exitLabel, e.exitLabel], mult: [f.mult, e.mult] };
  }

  function run(state) {
    var key = state.settings.scenario;
    var r = runScenario(state, key);
    r.scenario = key; r.method = state.method;
    r.sensF = sensitivity(state, r.P, r.H, r.VF, valueFCFF);
    r.sensE = sensitivity(state, r.P, r.H, r.VE, valueFCFE);
    r.sens = r.method.cf === 'fcfe' ? r.sensE : r.sensF;
    r.reverse = reverse(state, r.P, r.H, r.V);
    r.checks = checks(state, r.H, r.P, r.V, r.V.wacc);
    r.compare = compare(r);
    r.scenarios = {};
    SCEN.forEach(function (k) { r.scenarios[k] = k === key ? { P: r.P, V: r.V, VF: r.VF, VE: r.VE } : runScenario(state, k); });
    return r;
  }

  /* ---------- Build the DCF inputs from the user's own Excel file ----------
   * blocks: from Hub.stmtImport (IS / BS / CF, oldest year first, ≤ 3 years). roleOf(label, 'IS'|'BS')
   * gives the same role the Company Model uses. Lines are summed into the DCF's fixed rows; nothing
   * is dropped silently — `map` lists where every line went. D&A: a separate income-statement line is
   * used as is; if D&A only appears in the cash-flow reconciliation (statements by function, the
   * Iranian norm) it is taken out of cost of sales and SG&A pro rata so EBITDA is not understated.
   * Base drivers are seeded from the last actual year (growth: average, deflated on a real basis);
   * Upside / Downside keep their previous spread to Base. */
  function fromImport(state, blocks, info, roleOf, pickCF) {
    var years = blocks[0].years.slice(), n = years.length, pad = 3 - n;
    var Z = function () { return [0, 0, 0]; }, is = {}, bs = {}, cfs = { cfo: Z(), capex: Z(), dividends: Z() }, map = [];
    ['revenue', 'cogs', 'sga', 'otherOpex', 'da', 'interestExp', 'interestInc', 'otherNonOp', 'tax'].forEach(function (k) { is[k] = Z(); });
    ['cash', 'ar', 'inventory', 'otherCA', 'ppe', 'otherNCA', 'ap', 'otherCL', 'std', 'ltd', 'otherNCL', 'minority', 'equity'].forEach(function (k) { bs[k] = Z(); });
    var inv = 0, claims = 0;
    function add(o, k, vals, sign) { vals.forEach(function (v, i) { o[k][i + pad] += (sign || 1) * v; }); }
    blocks.forEach(function (b) {
      if (b.type !== 'IS' && b.type !== 'BS') return;
      b.rows.forEach(function (r) {
        var role = roleOf(r.label, b.type), v = r.vals, ab = v.map(Math.abs), L = r.label, G = r.grp || '', k = null;
        if (b.type === 'IS') {
          k = { revenue: 'revenue', cogs: 'cogs', opex: 'sga', da: 'da', interestExp: 'interestExp', tax: 'tax' }[role];
          if (k) add(is, k, ab);
          else if (role === 'otherOp') { k = 'otherOpex'; add(is, k, v, -1); }               // income shown positive → negative expense
          else if (role === 'nonOp') { k = /سود سپرده|interest income|سود بانکی/i.test(L) ? 'interestInc' : 'otherNonOp'; add(is, k, v); }
        } else {
          if (role === 'cash') k = 'cash';
          else if (role === 'nwcA') k = /دریافتنی|receivable/i.test(L) ? 'ar' : /موجودی|inventor/i.test(L) ? 'inventory' : 'otherCA';
          else if (role === 'ppe') k = 'ppe';
          else if (role === 'opA') k = 'otherNCA';
          else if (role === 'nonOpA') { k = 'otherNCA'; inv += v[n - 1]; }
          else if (role === 'nwcL') k = /تجاری|trade/i.test(L) || (/پرداختنی|payable/i.test(L) && !/مالیات|tax|سود سهام|dividend/i.test(L)) ? 'ap' : 'otherCL';
          else if (role === 'debt') k = /غیر ?جاری|non.current|بلند ?مدت|long/i.test(G + ' ' + L) ? 'ltd' : /جاری|current|کوتاه|short/i.test(G + ' ' + L) ? 'std' : 'ltd';
          else if (role === 'debtLike') { k = 'otherNCL'; claims += v[n - 1]; }   // non-operating claim: held flat, deducted in the bridge, kept out of NWC
          else if (role === 'opL') k = 'otherNCL';
          else if (role === 'equity' || role === 'retained') k = 'equity';
          else if (role === 'minority') k = 'minority';
          if (k) add(bs, k, v);
        }
        map.push({ st: b.type, label: L, role: role, to: k || 'ignored' });
      });
    });
    var cf = pickCF(blocks), daEmbedded = false;
    if (!is.da.some(function (x) { return x; }) && cf.da) {
      daEmbedded = true;
      add(is, 'da', cf.da);
      for (var i = 0; i < 3; i++) { var c0 = is.cogs[i], s0 = is.sga[i], base = c0 + s0, d = is.da[i]; if (base > 0) { is.cogs[i] = c0 - d * c0 / base; is.sga[i] = s0 - d * s0 / base; } }
    }
    if (cf.capex) add(cfs, 'capex', cf.capex);
    if (cf.dividends) add(cfs, 'dividends', cf.dividends);
    blocks.filter(function (b) { return b.type === 'CF'; }).forEach(function (b) { var r = b.rows.filter(function (x) { return /نقد حاصل از عملیات|cash generated from operations|net cash (from|generated by) operating/i.test(x.label); })[0]; if (r && !cfs.cfo.some(function (x) { return x; })) add(cfs, 'cfo', r.vals); });
    var yrs = years.slice(); while (yrs.length < 3) yrs.unshift('–');
    state.hist = { years: yrs, is: is, bs: bs, cfs: cfs };
    var lastY = parseInt(years[n - 1], 10);
    if (isFinite(lastY)) state.projYears = [1, 2, 3, 4, 5].map(function (k) { return String(lastY + k) + 'E'; });
    if (info.unit) state.meta.unit = info.unit;
    if (info.currency) state.meta.currency = info.currency;
    state.bridge.investments = inv; state.bridge.otherClaims = claims;
    var sh = info.sharesMn != null ? info.sharesMn : null;
    state.bridge.sharesMn = sh || 0; state.bridge.price = 0;
    seedDrivers(state);
    return { map: map, daEmbedded: daEmbedded, years: years, check: last(historicals(state.hist).balanceCheck) };
  }
  function seedDrivers(state) {
    var H = historicals(state.hist), t = H.revenue.length - 1, real = state.settings.basis === 'real', inf = num(state.wacc.inflation);
    var ok = function (v, d) { return v != null && isFinite(v) ? v : d; }, r4 = function (v) { return Math.round(v * 1e4) / 1e4; };
    var gs = H.revGrowth.filter(function (g) { return g != null && isFinite(g); });
    var g = gs.length ? gs.reduce(function (a, b) { return a + b; }, 0) / gs.length : 0;
    if (real) g = (1 + g) / (1 + inf) - 1;
    var R = H.revenue[t] || NaN;
    var seed = {
      revGrowth: r4(g), grossMargin: r4(ok(H.grossMargin[t], 0)), sgaPct: r4(ok(H.sga[t] / R, 0)), otherOpexPct: r4(ok(H.otherOpex[t] / R, 0)),
      daPct: r4(ok(H.da[t] / R, 0)), capexPct: r4(ok(H.capex[t] / R, 0)), dso: Math.round(ok(H.dso[t], 0)), dio: Math.round(ok(H.dio[t], 0)), dpo: Math.round(ok(H.dpo[t], 0)),
      otherCAPct: r4(ok(H.otherCA[t] / R, 0)), otherCLPct: r4(ok(H.otherCL[t] / R, 0)), taxRate: r4(Math.max(0, Math.min(0.5, ok(H.effTax[t], 0.25))))
    };
    var base = state.scenarios.base;
    Object.keys(seed).forEach(function (k) {
      var old = arr(base[k], N);
      SCEN.forEach(function (sk) {
        var sc = state.scenarios[sk], cur = arr(sc[k], N);
        sc[k] = old.map(function (o, i) { var v = seed[k] + (sk === 'base' ? 0 : cur[i] - o); return k === 'dso' || k === 'dio' || k === 'dpo' ? Math.max(0, Math.round(v)) : r4(v); });
      });
    });
    return state;
  }

  var api = { N: N, SCENARIOS: SCEN, UNIT_MULT: UNIT_MULT, run: run, runScenario: runScenario, wacc: wacc,
              historicals: historicals, project: project, value: value, fromImport: fromImport, seedDrivers: seedDrivers, valueFCFF: valueFCFF, valueFCFE: valueFCFE, growthUsed: growthUsed, tvRateOf: tvRateOf,
              EXITS: EXITS, FCFF_EXITS: FCFF_EXITS, FCFE_EXITS: FCFE_EXITS, METHOD_DEF: METHOD_DEF, methodOf: methodOf, exitMetric: exitMetric, multStep: multStep, fisherReal: fisherReal, perShareFactor: perShareFactor };
  root.Hub = root.Hub || {}; root.Hub.DCF = root.Hub.DCF || {}; root.Hub.DCF.engine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
