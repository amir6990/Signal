/* =====================================================================
 * DCF STATE SCHEMA + SAMPLE
 * `sample()` = ILLUSTRATIVE company so every screen shows a working model.
 *              None of these numbers are market data. Replace them.
 * `blank()`  = same structure, all placeholders empty (zeros).
 * Units: monetary lines in meta.unit of meta.currency; percentages as
 * decimals (0.25 = 25%); days as days; shares in millions.
 * ===================================================================== */
(function (root) {
  'use strict';
  var N = 5;
  function rep(v, n) { var a = []; for (var i = 0; i < (n || N); i++) a.push(v); return a; }

  function scen(o) {
    return {
      revGrowth: o.g, grossMargin: o.gm, sgaPct: rep(0.086), otherOpexPct: rep(0.02), daPct: rep(0.033),
      capexPct: [0.06, 0.055, 0.05, 0.045, 0.04], dso: rep(60), dio: rep(80), dpo: rep(60),
      otherCAPct: rep(0.03), otherCLPct: rep(0.039), taxRate: rep(0.25),
      tvGrowth: o.tvg, exitMultiple: o.mult
    };
  }

  function sample() {
    return {
      version: 1,
      meta: { company: 'Sample Industrial Co. (illustrative)', ticker: '', currency: 'IRR', unit: 'billion',
              valuationDate: '1404-12-29', analyst: '', notes: 'Illustrative figures only. Replace every blue input with company data.' },
      settings: { scenario: 'base', basis: 'real', midYear: true, gordonWeight: 0.5 },
      hist: {
        years: ['FY1402', 'FY1403', 'FY1404'],
        is: {
          revenue: [42000, 58500, 79000], cogs: [29400, 40365, 53720], sga: [3780, 5148, 6794],
          otherOpex: [840, 1170, 1580], da: [1680, 2100, 2600], interestExp: [1150, 1420, 1700],
          interestInc: [210, 300, 420], otherNonOp: [0, 0, 0], tax: [1340, 2149, 3257]
        },
        bs: {
          cash: [3900, 5200, 6500], ar: [7000, 9800, 13000], inventory: [6400, 8900, 11800], otherCA: [1300, 1800, 2400],
          ppe: [18500, 21000, 24000], otherNCA: [2800, 3000, 3200],
          ap: [4900, 6700, 8800], otherCL: [1700, 2400, 3100], std: [3600, 4000, 4200], ltd: [6200, 6500, 6800],
          otherNCL: [1300, 1400, 1500], minority: [500, 550, 600], equity: [21700, 28150, 35900]
        },
        cfs: { cfo: [4600, 5248, 8469], capex: [4100, 4600, 5600], dividends: [1500, 1800, 2800] }
      },
      projYears: ['FY1405E', 'FY1406E', 'FY1407E', 'FY1408E', 'FY1409E'],
      scenarios: {
        base: scen({ g: [0.06, 0.05, 0.045, 0.04, 0.035], gm: [0.32, 0.32, 0.325, 0.325, 0.33], tvg: 0.02, mult: 9.0 }),
        upside: scen({ g: [0.08, 0.07, 0.065, 0.06, 0.055], gm: [0.335, 0.335, 0.34, 0.34, 0.345], tvg: 0.025, mult: 10.0 }),
        downside: scen({ g: [0.03, 0.02, 0.015, 0.01, 0.005], gm: [0.30, 0.30, 0.305, 0.305, 0.31], tvg: 0.01, mult: 7.5 })
      },
      financing: { debtChange: rep(0), payout: 0.30, cashYield: 0.22 },
      wacc: {
        rf: 0.28, erp: 0.08, crp: 0.0, sizePremium: 0.02,
        betaMode: 'relever', betaLevered: 1.0, betaUnlevered: 0.90,
        kdPreTax: 0.30, taxRate: 0.25, debtWeight: 0.25, inflation: 0.25
      },
      bridge: { preferred: 0, investments: 1200, nonOpAssets: 0, otherClaims: 0, sharesMn: 10000, price: 14000 },
      sens: { waccStep: 0.01, gStep: 0.005, multStep: 1.0 },
      sources: {}
    };
  }

  function blank() {
    var s = sample();
    function zero(o) { Object.keys(o).forEach(function (k) {
      if (Array.isArray(o[k])) o[k] = o[k].map(function () { return 0; });
      else if (o[k] && typeof o[k] === 'object') zero(o[k]);
      else if (typeof o[k] === 'number') o[k] = 0;
    }); }
    zero(s.hist.is); zero(s.hist.bs); zero(s.hist.cfs); zero(s.scenarios); zero(s.financing); zero(s.bridge);
    ['rf', 'erp', 'crp', 'sizePremium', 'kdPreTax', 'taxRate', 'debtWeight', 'inflation'].forEach(function (k) { s.wacc[k] = 0; });
    s.wacc.betaLevered = 1; s.wacc.betaUnlevered = 1;
    s.meta.company = 'New company'; s.meta.notes = '';
    return s;
  }

  root.Hub = root.Hub || {}; root.Hub.DCF = root.Hub.DCF || {};
  root.Hub.DCF.sample = sample; root.Hub.DCF.blank = blank;
  if (typeof module !== 'undefined' && module.exports) module.exports = { sample: sample, blank: blank };
})(typeof window !== 'undefined' ? window : globalThis);
