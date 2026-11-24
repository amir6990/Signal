/* =====================================================================
 * DCF — EXCEL EXPORT (ExcelJS, formulas preserved)
 * Sheets: Summary · Assumptions · Financials · Calculations · Sensitivity · Notes
 * Formatting follows banking convention:
 *   blue font on pale yellow = input · black = formula · green = link to another sheet
 * The workbook recalculates on open; change any blue cell and everything
 * flows, including the scenario switch (Assumptions!D8) and the sensitivity grids.
 * buildWorkbook() is pure (Node-testable); exportXlsx() saves it.
 * ===================================================================== */
(function (root) {
  'use strict';

  var C = { navy: 'FF1F2A36', grey: 'FFE9EDF1', inFill: 'FFFFF2CC', blue: 'FF0000FF', green: 'FF00804A', black: 'FF000000', white: 'FFFFFFFF', red: 'FFC00000', muted: 'FF5B6870' };
  var FMT = { money: '#,##0;(#,##0);"–"', money2: '#,##0.00;(#,##0.00);"–"', pct: '0.0%;(0.0%);"–"', pct2: '0.00%;(0.00%);"–"', days: '0', x: '0.0"x"', dec: '0.00', dec3: '0.000', int: '0' };
  var SC = ['base', 'upside', 'downside'], SCL = ['Base', 'Upside', 'Downside'];

  function L(n) { var s = ''; n++; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; } // 0 -> A
  function A(c, r) { return L(c) + r; }
  function ref(sheet, c, r, abs) { var a = abs ? '$' + L(c) + '$' + r : A(c, r); return "'" + sheet + "'!" + a; }

  function buildWorkbook(ExcelJS, S, R) {
    var N = 5, nH = S.hist.years.length;
    var wb = new ExcelJS.Workbook();
    wb.creator = 'Finance Models & Solutions Hub'; wb.created = new Date();
    wb.calcProperties.fullCalcOnLoad = true;

    var wsSum = wb.addWorksheet('Summary', { properties: { tabColor: { argb: 'FF2E7D6B' } }, views: [{ showGridLines: false }] });
    var wsA = wb.addWorksheet('Assumptions', { properties: { tabColor: { argb: 'FF2F5DA8' } }, views: [{ showGridLines: false, state: 'frozen', ySplit: 3 }] });
    var wsF = wb.addWorksheet('Financials', { views: [{ showGridLines: false, state: 'frozen', xSplit: 3, ySplit: 4 }] });
    var wsC = wb.addWorksheet('Calculations', { views: [{ showGridLines: false, state: 'frozen', ySplit: 3 }] });
    var wsS = wb.addWorksheet('Sensitivity', { views: [{ showGridLines: false }] });
    var wsN = wb.addWorksheet('Notes', { views: [{ showGridLines: false }] });

    /* ---------- cell writer ---------- */
    function put(ws, c, r, v, kind, fmt) {
      var cell = ws.getCell(A(c, r));
      if (v && typeof v === 'object' && v.f) cell.value = { formula: v.f.replace(/^=/, '') };
      else cell.value = v;
      style(cell, kind, fmt, v);
      return cell;
    }
    function style(cell, kind, fmt, v) {
      var font = { name: 'Arial', size: 10, color: { argb: C.black } };
      if (kind === 'in') { font.color = { argb: C.blue }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.inFill } }; }
      if (kind === 'calc' && v && v.f && /^=?'[^']+'!\$?[A-Z]+\$?\d+$/.test(v.f)) font.color = { argb: C.green };   // pure link
      if (kind === 'link') font.color = { argb: C.green };
      if (kind === 'hdr') { font = { name: 'Arial', size: 10, bold: true, color: { argb: C.white } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } }; }
      if (kind === 'sec') { font.bold = true; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.grey } }; }
      if (kind === 'title') font = { name: 'Arial', size: 14, bold: true, color: { argb: C.navy } };
      if (kind === 'sub') font = { name: 'Arial', size: 9, italic: true, color: { argb: C.muted } };
      if (kind === 'total') { font.bold = true; cell.border = { top: { style: 'thin' } }; }
      if (kind === 'lbl') font.color = { argb: C.black };
      if (kind === 'unit') font = { name: 'Arial', size: 9, color: { argb: C.muted } };
      cell.font = font;
      if (fmt) cell.numFmt = FMT[fmt] || fmt;
      if (typeof v === 'number' || (v && v.f)) cell.alignment = { horizontal: 'right' };
    }
    function band(ws, r, c0, c1, kind) { for (var c = c0; c <= c1; c++) style(ws.getCell(A(c, r)), kind); }
    function title(ws, t, sub) { put(ws, 1, 1, t, 'title'); put(ws, 1, 2, sub, 'sub'); }

    var unitTxt = S.meta.currency + ' ' + S.meta.unit + 's';
    /* =================================================================
     * ASSUMPTIONS  (col B label, C unit, D..H values / years)
     * ================================================================= */
    wsA.columns = [{ width: 2 }, { width: 44 }, { width: 10 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 3 }, { width: 50 }];
    title(wsA, 'Assumptions', S.meta.company + ' · ' + unitTxt + ' · blue cells are inputs');
    var a = {}, r = 4;
    function sec(ws, row, label, c1, years) {
      put(ws, 1, row, label, 'hdr'); band(ws, row, 1, c1, 'hdr');
      if (years) years.forEach(function (y, i) { put(ws, 3 + i, row, y, 'hdr').alignment = { horizontal: 'right' }; });
    }
    function scalar(key, label, unit, val, fmt, note) {
      put(wsA, 1, r, label, 'lbl'); put(wsA, 2, r, unit || '', 'unit'); put(wsA, 3, r, val, 'in', fmt);
      if (note) put(wsA, 9, r, note, 'sub');
      a[key] = ref('Assumptions', 3, r, true); r++;
    }
    sec(wsA, r++, 'General', 9);
    scalar('company', 'Company', '', S.meta.company);
    scalar('currency', 'Currency', '', S.meta.currency);
    scalar('unit', 'Monetary unit', '', S.meta.unit, null, 'thousand / million / billion / trillion');
    scalar('scen', 'Active scenario (1 Base, 2 Upside, 3 Downside)', '#', SC.indexOf(S.settings.scenario) + 1, FMT.int, 'Change to switch the whole workbook');
    put(wsA, 4, r - 1, { f: '=CHOOSE(' + a.scen + ',"Base","Upside","Downside")' }, 'calc');
    scalar('real', 'Basis (1 Real, 0 Nominal)', '#', S.settings.basis === 'real' ? 1 : 0, FMT.int, 'Real: rates converted with Fisher using expected inflation');
    scalar('mid', 'Mid-year discounting (1 on, 0 off)', '#', S.settings.midYear ? 1 : 0, FMT.int);
    scalar('gw', 'Weight on Gordon method', '%', S.settings.gordonWeight, 'pct', 'Exit-multiple method gets the remainder');
    var M = S.method || { cf: 'fcff', exitFcff: 'evEbitda', exitFcfe: 'pe' };
    var XF = ['evEbitda', 'evEbit', 'evSales'], XE = ['pe', 'ps', 'pb', 'evEbitda'];
    var XL = { evEbitda: 'EV / EBITDA', evEbit: 'EV / EBIT', evSales: 'EV / Sales', pe: 'P / E', ps: 'P / S', pb: 'P / B' };
    var XFLD = { evEbitda: 'exitMultiple', evEbit: 'exitEvEbit', evSales: 'exitEvSales', pe: 'exitPe', ps: 'exitPs', pb: 'exitPb' };
    scalar('cf', 'Headline method (1 FCFF at WACC, 2 FCFE at cost of equity)', '#', M.cf === 'fcfe' ? 2 : 1, FMT.int, 'Both are always calculated; this picks the headline (Summary)');
    put(wsA, 4, r - 1, { f: '=CHOOSE(' + a.cf + ',"FCFF","FCFE")' }, 'calc');
    scalar('tvr', 'Terminal-value rate (1 same as forecast, 2 risk-free)', '#', M.tvRate === 'rf' ? 2 : 1, FMT.int, 'Best practice: 1. Option 2 is the house method');
    scalar('gb', 'Terminal growth input (1 as entered, 2 real→nominal Fisher, 3 real + inflation)', '#', M.gBuild === 'fisher' ? 2 : M.gBuild === 'additive' ? 3 : 1, FMT.int, 'Applies on a nominal model only; real model uses g as entered');
    scalar('xff', 'FCFF exit multiple (1 EV/EBITDA, 2 EV/EBIT, 3 EV/Sales)', '#', XF.indexOf(M.exitFcff) + 1, FMT.int);
    put(wsA, 4, r - 1, { f: '=CHOOSE(' + a.xff + ',"EV / EBITDA","EV / EBIT","EV / Sales")' }, 'calc');
    scalar('xfe', 'FCFE exit multiple (1 P/E, 2 P/S, 3 P/B, 4 EV/EBITDA − net debt)', '#', XE.indexOf(M.exitFcfe) + 1, FMT.int);
    put(wsA, 4, r - 1, { f: '=CHOOSE(' + a.xfe + ',"P / E","P / S","P / B","EV / EBITDA − net debt")' }, 'calc');
    r++;
    sec(wsA, r++, 'Cost of capital', 9);
    var w = S.wacc;
    scalar('rf', 'Risk-free rate (nominal, model currency)', '%', w.rf, 'pct2');
    scalar('erp', 'Equity risk premium', '%', w.erp, 'pct2');
    scalar('crp', 'Country risk premium', '%', w.crp, 'pct2', '0 if rf is already a local-currency government yield');
    scalar('size', 'Size / specific premium', '%', w.sizePremium, 'pct2');
    scalar('bmode', 'Beta method (1 relever unlevered, 0 use levered)', '#', w.betaMode === 'relever' ? 1 : 0, FMT.int);
    scalar('bl', 'Levered beta', 'x', w.betaLevered, 'dec');
    scalar('bu', 'Unlevered beta', 'x', w.betaUnlevered, 'dec');
    scalar('kd', 'Pre-tax cost of debt (nominal)', '%', w.kdPreTax, 'pct2');
    scalar('tax', 'Marginal tax rate', '%', w.taxRate, 'pct2');
    scalar('wd', 'Target debt / (debt + equity)', '%', w.debtWeight, 'pct2');
    scalar('infl', 'Expected long-run inflation', '%', w.inflation, 'pct2');
    scalar('kem', 'Cost of equity: 1 my number, 0 computed (CAPM)', '#', w.keMode === 'manual' ? 1 : 0, FMT.int);
    scalar('keo', 'My cost of equity (nominal)', '%', Number(w.keManual) || 0, 'pct2');
    scalar('wm', 'WACC: 1 my number, 0 computed', '#', w.waccMode === 'manual' ? 1 : 0, FMT.int);
    scalar('wo', 'My WACC (nominal)', '%', Number(w.waccManual) || 0, 'pct2');
    r++;
    sec(wsA, r++, 'Financing', 9, S.projYears);
    put(wsA, 1, r, 'Net debt issued / (repaid)', 'lbl'); put(wsA, 2, r, unitTxt, 'unit');
    for (var t = 0; t < N; t++) put(wsA, 3 + t, r, S.financing.debtChange[t], 'in', 'money');
    a.dDebtRow = r; r++;
    scalar('payout', 'Dividend payout (% of positive net income)', '%', S.financing.payout, 'pct');
    scalar('cy', 'Yield on cash (nominal)', '%', S.financing.cashYield, 'pct2');
    r++;
    sec(wsA, r++, 'Equity bridge and per share', 9);
    var b = S.bridge;
    scalar('pref', 'Preferred equity', unitTxt, b.preferred, 'money');
    scalar('invest', 'Investments in associates', unitTxt, b.investments, 'money');
    scalar('noa', 'Other non-operating assets', unitTxt, b.nonOpAssets, 'money');
    scalar('oclaims', 'Other debt-like claims', unitTxt, b.otherClaims, 'money');
    scalar('shares', 'Diluted shares outstanding', 'mn', b.sharesMn, FMT.money2);
    scalar('price', 'Current share price', S.meta.currency, b.price, FMT.money2);
    r++;
    sec(wsA, r++, 'Sensitivity steps', 9);
    scalar('ws', 'WACC step', '%', S.sens.waccStep, 'pct2');
    scalar('gs', 'Perpetual growth step', '%', S.sens.gStep, 'pct2');
    scalar('ms', 'Exit multiple step', 'x', S.sens.multStep, 'dec');
    r++;

    var DRV = [
      ['revGrowth', 'Revenue growth', '%', 'pct'], ['grossMargin', 'Gross margin', '%', 'pct'], ['sgaPct', 'SG&A % revenue', '%', 'pct'],
      ['otherOpexPct', 'Other opex % revenue', '%', 'pct'], ['daPct', 'D&A % revenue', '%', 'pct'], ['capexPct', 'Capex % revenue', '%', 'pct'],
      ['dso', 'Receivable days (on revenue)', 'days', 'days'], ['dio', 'Inventory days (on COGS)', 'days', 'days'], ['dpo', 'Payable days (on COGS)', 'days', 'days'],
      ['otherCAPct', 'Other current assets % revenue', '%', 'pct'], ['otherCLPct', 'Other current liabilities % revenue', '%', 'pct'], ['taxRate', 'Tax rate', '%', 'pct']
    ];
    var blocks = {};
    SC.forEach(function (k, si) {
      sec(wsA, r++, SCL[si] + ' scenario drivers', 9, S.projYears);
      blocks[k] = { rows: {} };
      DRV.forEach(function (d) {
        put(wsA, 1, r, d[1], 'lbl'); put(wsA, 2, r, d[2], 'unit');
        for (var t = 0; t < N; t++) put(wsA, 3 + t, r, S.scenarios[k][d[0]][t], 'in', d[3]);
        blocks[k].rows[d[0]] = r; r++;
      });
      put(wsA, 1, r, 'Perpetual growth', 'lbl'); put(wsA, 2, r, '%', 'unit'); put(wsA, 3, r, S.scenarios[k].tvGrowth, 'in', 'pct2'); blocks[k].tvg = r; r++;
      blocks[k].x = {};
      Object.keys(XL).forEach(function (x) { put(wsA, 1, r, 'Exit ' + XL[x], 'lbl'); put(wsA, 2, r, 'x', 'unit'); put(wsA, 3, r, Number(S.scenarios[k][XFLD[x]]) || 0, 'in', 'x'); blocks[k].x[x] = r; r++; });
      blocks[k].mult = blocks[k].x.evEbitda;
      r++;
    });
    // active block (formulas)
    sec(wsA, r++, 'Active scenario (selected by ' + a.scen.replace("'Assumptions'!", '') + ')', 9, S.projYears);
    var act = {};
    DRV.forEach(function (d) {
      put(wsA, 1, r, d[1], 'lbl'); put(wsA, 2, r, d[2], 'unit');
      for (var t = 0; t < N; t++) {
        put(wsA, 3 + t, r, { f: '=CHOOSE(' + a.scen + ',' + SC.map(function (k) { return A(3 + t, blocks[k].rows[d[0]]); }).join(',') + ')' }, 'calc', d[3]);
      }
      act[d[0]] = r; r++;
    });
    put(wsA, 1, r, 'Perpetual growth', 'lbl'); put(wsA, 3, r, { f: '=CHOOSE(' + a.scen + ',' + SC.map(function (k) { return 'D' + blocks[k].tvg; }).join(',') + ')' }, 'calc', 'pct2'); a.tvgIn = ref('Assumptions', 3, r, true); r++;
    put(wsA, 1, r, 'Perpetual growth used (after growth-input method)', 'total'); put(wsA, 3, r, { f: '=IF(OR(' + a.gb + '=1,' + a.real + '=1),' + a.tvgIn + ',IF(' + a.gb + '=3,' + a.tvgIn + '+' + a.infl + ',(1+' + a.tvgIn + ')*(1+' + a.infl + ')-1))' }, 'total', 'pct2'); a.tvg = ref('Assumptions', 3, r, true); r++;
    a.x = {};
    Object.keys(XL).forEach(function (x) { put(wsA, 1, r, 'Exit ' + XL[x], 'lbl'); put(wsA, 3, r, { f: '=CHOOSE(' + a.scen + ',' + SC.map(function (k) { return 'D' + blocks[k].x[x]; }).join(',') + ')' }, 'calc', 'x'); a.x[x] = ref('Assumptions', 3, r, true); r++; });
    put(wsA, 1, r, 'FCFF exit multiple used', 'total'); put(wsA, 3, r, { f: '=CHOOSE(' + a.xff + ',' + XF.map(function (x) { return a.x[x]; }).join(',') + ')' }, 'total', 'x'); a.mult = ref('Assumptions', 3, r, true); r++;
    put(wsA, 1, r, 'FCFE exit multiple used', 'total'); put(wsA, 3, r, { f: '=CHOOSE(' + a.xfe + ',' + XE.map(function (x) { return a.x[x]; }).join(',') + ')' }, 'total', 'x'); a.multE = ref('Assumptions', 3, r, true); r++;
    function drv(key, t) { return "'Assumptions'!" + L(3 + t) + '$' + act[key]; }

    /* =================================================================
     * FINANCIALS (B label, C unit, D..F hist, G..K proj)
     * ================================================================= */
    var H0 = 3, P0 = 3 + nH;                       // first hist col, first proj col (0-based)
    wsF.columns = [{ width: 2 }, { width: 40 }, { width: 8 }].concat(new Array(nH + N).fill(0).map(function () { return { width: 13 }; }));
    title(wsF, 'Financial statements', unitTxt + ' · historical inputs (blue) and integrated projection (formulas)');
    put(wsF, 1, 4, 'Line item', 'hdr'); put(wsF, 2, 4, 'Unit', 'hdr');
    S.hist.years.forEach(function (y, i) { put(wsF, H0 + i, 4, y + ' A', 'hdr'); });
    S.projYears.forEach(function (y, i) { put(wsF, P0 + i, 4, y, 'hdr'); });
    put(wsF, H0, 3, 'Historical', 'sub'); put(wsF, P0, 3, 'Projected · ', 'sub');
    wsF.getCell(A(P0 + 1, 3)).value = { formula: "'Assumptions'!E" + (Number(a.scen.match(/\d+$/)[0])) }; style(wsF.getCell(A(P0 + 1, 3)), 'sub');
    var f = {}; r = 5;
    var hist = S.hist;
    function line(key, label, opts) {
      opts = opts || {};
      f[key] = r;                                            // known before formulas that self-reference prior columns
      put(wsF, 1, r, label, opts.total ? 'total' : 'lbl'); put(wsF, 2, r, opts.unit || '', 'unit');
      for (var i = 0; i < nH; i++) {
        var c = H0 + i;
        if (opts.hIn) put(wsF, c, r, opts.hIn[i] || 0, 'in', opts.fmt || 'money');
        else if (opts.hF) put(wsF, c, r, { f: opts.hF(c) }, opts.total ? 'total' : 'calc', opts.fmt || 'money');
      }
      for (var t2 = 0; t2 < N; t2++) {
        var cc = P0 + t2;
        if (opts.pF) put(wsF, cc, r, { f: opts.pF(cc, t2) }, opts.total ? 'total' : 'calc', opts.fmt || 'money');
      }
      if (opts.total) band(wsF, r, 1, 1, 'total');
      f[key] = r; r++;
    }
    function F(key, c) { return A(c, f[key]); }               // same-sheet ref
    function prev(key, c) { return A(c - 1, f[key]); }
    var calcRef = {};                                          // filled once Calculations rows are known (fixed below)
    // fixed Calculations addresses (see layout below)
    calcRef.kdUsed = "'Calculations'!$D$13"; calcRef.cyUsed = "'Calculations'!$D$14";

    function secF(label) { put(wsF, 1, r, label, 'sec'); band(wsF, r, 1, P0 + N - 1, 'sec'); r++; }
    secF('Income statement');
    line('rev', 'Revenue', { hIn: hist.is.revenue, pF: function (c, t) { return '=' + prev('rev', c) + '*(1+' + drv('revGrowth', t) + ')'; }, total: true });
    line('cogs', 'Cost of goods sold', { hIn: hist.is.cogs, pF: function (c, t) { return '=' + F('rev', c) + '*(1-' + drv('grossMargin', t) + ')'; } });
    line('gp', 'Gross profit', { hF: function (c) { return '=' + F('rev', c) + '-' + F('cogs', c); }, pF: function (c) { return '=' + F('rev', c) + '-' + F('cogs', c); } });
    line('sga', 'SG&A', { hIn: hist.is.sga, pF: function (c, t) { return '=' + F('rev', c) + '*' + drv('sgaPct', t); } });
    line('oth', 'Other operating expense', { hIn: hist.is.otherOpex, pF: function (c, t) { return '=' + F('rev', c) + '*' + drv('otherOpexPct', t); } });
    line('ebitda', 'EBITDA', { total: true, hF: function (c) { return '=' + F('gp', c) + '-' + F('sga', c) + '-' + F('oth', c); }, pF: function (c) { return '=' + F('gp', c) + '-' + F('sga', c) + '-' + F('oth', c); } });
    line('da', 'Depreciation & amortisation', { hIn: hist.is.da, pF: function (c, t) { return '=' + F('rev', c) + '*' + drv('daPct', t); } });
    line('ebit', 'EBIT', { hF: function (c) { return '=' + F('ebitda', c) + '-' + F('da', c); }, pF: function (c) { return '=' + F('ebitda', c) + '-' + F('da', c); } });
    // interest refers to opening balances; rows for debt and cash are defined later, so use placeholders and patch
    line('ie', 'Interest expense', { hIn: hist.is.interestExp, pF: function (c) { return '=__DEBTPREV' + c + '__*' + calcRef.kdUsed; } });
    line('ii', 'Interest income', { hIn: hist.is.interestInc, pF: function (c) { return '=__CASHPREV' + c + '__*' + calcRef.cyUsed; } });
    line('onp', 'Other non-operating, net', { hIn: hist.is.otherNonOp, pF: function () { return '=0'; } });
    line('ebt', 'Profit before tax', { hF: function (c) { return '=' + F('ebit', c) + '-' + F('ie', c) + '+' + F('ii', c) + '+' + F('onp', c); }, pF: function (c) { return '=' + F('ebit', c) + '-' + F('ie', c) + '+' + F('ii', c) + '+' + F('onp', c); } });
    line('tax', 'Income tax', { hIn: hist.is.tax, pF: function (c, t) { return '=MAX(0,' + F('ebt', c) + ')*' + drv('taxRate', t); } });
    line('ni', 'Net income', { total: true, hF: function (c) { return '=' + F('ebt', c) + '-' + F('tax', c); }, pF: function (c) { return '=' + F('ebt', c) + '-' + F('tax', c); } });
    line('ebitdaM', 'EBITDA margin', { fmt: 'pct', unit: '%', hF: function (c) { return '=IF(' + F('rev', c) + '=0,0,' + F('ebitda', c) + '/' + F('rev', c) + ')'; }, pF: function (c) { return '=IF(' + F('rev', c) + '=0,0,' + F('ebitda', c) + '/' + F('rev', c) + ')'; } });
    r++;
    secF('Balance sheet');
    line('cash', 'Cash & short-term investments (plug)', { hIn: hist.bs.cash, pF: function (c) { return '=' + prev('cash', c) + '+__NETCF' + c + '__'; } });
    line('ar', 'Accounts receivable', { hIn: hist.bs.ar, pF: function (c, t) { return '=' + F('rev', c) + '*' + drv('dso', t) + '/365'; } });
    line('inv', 'Inventory', { hIn: hist.bs.inventory, pF: function (c, t) { return '=' + F('cogs', c) + '*' + drv('dio', t) + '/365'; } });
    line('oca', 'Other current assets', { hIn: hist.bs.otherCA, pF: function (c, t) { return '=' + F('rev', c) + '*' + drv('otherCAPct', t); } });
    line('ppe', 'PP&E, net', { hIn: hist.bs.ppe, pF: function (c) { return '=' + prev('ppe', c) + '+__CAPEX' + c + '__-' + F('da', c); } });
    line('onca', 'Other non-current assets', { hIn: hist.bs.otherNCA, pF: function (c) { return '=' + prev('onca', c); } });
    line('ta', 'Total assets', { total: true, hF: function (c) { return '=SUM(' + F('cash', c) + ':' + F('onca', c) + ')'; }, pF: function (c) { return '=SUM(' + F('cash', c) + ':' + F('onca', c) + ')'; } });
    line('ap', 'Accounts payable', { hIn: hist.bs.ap, pF: function (c, t) { return '=' + F('cogs', c) + '*' + drv('dpo', t) + '/365'; } });
    line('ocl', 'Other current liabilities', { hIn: hist.bs.otherCL, pF: function (c, t) { return '=' + F('rev', c) + '*' + drv('otherCLPct', t); } });
    line('std', 'Short-term debt', { hIn: hist.bs.std });
    line('ltd', 'Long-term debt', { hIn: hist.bs.ltd });
    line('debt', 'Total debt', { hF: function (c) { return '=' + F('std', c) + '+' + F('ltd', c); }, pF: function (c, t) { return '=' + prev('debt', c) + "+'Assumptions'!" + L(3 + t) + '$' + a.dDebtRow; } });
    line('oncl', 'Other non-current liabilities', { hIn: hist.bs.otherNCL, pF: function (c) { return '=' + prev('oncl', c); } });
    line('mi', 'Minority interest', { hIn: hist.bs.minority, pF: function (c) { return '=' + prev('mi', c); } });
    line('eq', 'Shareholders’ equity', { hIn: hist.bs.equity, pF: function (c) { return '=' + prev('eq', c) + '+' + F('ni', c) + '-__DIV' + c + '__'; } });
    line('tle', 'Total liabilities and equity', { total: true, hF: function (c) { return '=' + F('ap', c) + '+' + F('ocl', c) + '+' + F('debt', c) + '+' + F('oncl', c) + '+' + F('mi', c) + '+' + F('eq', c); }, pF: function (c) { return '=' + F('ap', c) + '+' + F('ocl', c) + '+' + F('debt', c) + '+' + F('oncl', c) + '+' + F('mi', c) + '+' + F('eq', c); } });
    line('chk', 'Check: assets − liabilities − equity (should be 0)', { fmt: 'money2', hF: function (c) { return '=ROUND(' + F('ta', c) + '-' + F('tle', c) + ',4)'; }, pF: function (c) { return '=ROUND(' + F('ta', c) + '-' + F('tle', c) + ',4)'; } });
    line('nwc', 'Operating net working capital', { hF: function (c) { return '=' + F('ar', c) + '+' + F('inv', c) + '+' + F('oca', c) + '-' + F('ap', c) + '-' + F('ocl', c); }, pF: function (c) { return '=' + F('ar', c) + '+' + F('inv', c) + '+' + F('oca', c) + '-' + F('ap', c) + '-' + F('ocl', c); } });
    r++;
    secF('Cash flow statement');
    line('cfNi', 'Net income', { pF: function (c) { return '=' + F('ni', c); } });
    line('cfDa', 'Plus: D&A', { pF: function (c) { return '=' + F('da', c); } });
    line('dnwc', 'Less: increase in net working capital', { pF: function (c) { return '=-(' + F('nwc', c) + '-' + prev('nwc', c) + ')'; } });
    line('cfo', 'Cash from operations', { total: true, hIn: hist.cfs.cfo, pF: function (c) { return '=' + F('cfNi', c) + '+' + F('cfDa', c) + '+' + F('dnwc', c); } });
    line('capex', 'Capital expenditure (spend, positive)', { hIn: hist.cfs.capex, pF: function (c, t) { return '=' + F('rev', c) + '*' + drv('capexPct', t); } });
    line('cfi', 'Cash from investing', { total: true, pF: function (c) { return '=-' + F('capex', c); } });
    line('div', 'Dividends paid (positive)', { hIn: hist.cfs.dividends, pF: function (c, t) { return "=MAX(0," + F('ni', c) + ")*" + a.payout; } });
    line('cff', 'Cash from financing (net debt − dividends)', { total: true, pF: function (c, t) { return "='Assumptions'!" + L(3 + t) + '$' + a.dDebtRow + '-' + F('div', c); } });
    line('netcf', 'Net change in cash', { total: true, pF: function (c) { return '=' + F('cfo', c) + '+' + F('cfi', c) + '+' + F('cff', c); } });

    // patch forward references
    wsF.eachRow(function (row) { row.eachCell(function (cell) {
      var v = cell.value; if (!v || !v.formula) return;
      var s = v.formula.replace(/__DEBTPREV(\d+)__/g, function (_, c) { return A(+c - 1, f.debt); })
        .replace(/__CASHPREV(\d+)__/g, function (_, c) { return A(+c - 1, f.cash); })
        .replace(/__NETCF(\d+)__/g, function (_, c) { return A(+c, f.netcf); })
        .replace(/__CAPEX(\d+)__/g, function (_, c) { return A(+c, f.capex); })
        .replace(/__DIV(\d+)__/g, function (_, c) { return A(+c, f.div); });
      if (s !== v.formula) cell.value = { formula: s };
    }); });
    function fin(key, c) { return "'Financials'!" + A(c, f[key]); }
    function finAbs(key, c) { return "'Financials'!$" + L(c) + '$' + f[key]; }
    var lastH = H0 + nH - 1, lastP = P0 + N - 1;

    /* =================================================================
     * CALCULATIONS  (B label, C unit, D..H five years / scalar in D)
     * Fixed rows 5-14 hold the discount-rate build (referenced from Financials).
     * ================================================================= */
    wsC.columns = [{ width: 2 }, { width: 44 }, { width: 8 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 3 }, { width: 46 }];
    title(wsC, 'Calculations', 'Discount rate, unlevered free cash flow, terminal value, equity bridge');
    var c = {};
    function cRow(row, key, label, unit, formula, fmt, note, kind) {
      put(wsC, 1, row, label, kind === 'total' ? 'total' : 'lbl'); put(wsC, 2, row, unit || '', 'unit');
      put(wsC, 3, row, { f: formula }, kind === 'total' ? 'total' : 'calc', fmt);
      if (kind === 'total') band(wsC, row, 1, 1, 'total');
      if (note) put(wsC, 9, row, note, 'sub');
      c[key] = "'Calculations'!$D$" + row;
    }
    sec(wsC, 4, 'Discount rate', 9);
    cRow(5, 'de', 'Debt / equity', '%', '=IF(1-' + a.wd + '=0,0,' + a.wd + '/(1-' + a.wd + '))', 'pct');
    cRow(6, 'betaL', 'Levered beta used', 'x', '=IF(' + a.bmode + '=1,' + a.bu + '*(1+(1-' + a.tax + ')*D5),' + a.bl + ')', 'dec3', 'Hamada: βU × (1 + (1 − t) × D/E)');
    cRow(7, 'ke', 'Cost of equity (nominal)', '%', '=IF(' + a.kem + '=1,' + a.keo + ',' + a.rf + '+D6*' + a.erp + '+' + a.crp + '+' + a.size + ')', 'pct2', 'rf + β × ERP + CRP + size, or my number');
    cRow(8, 'kdat', 'After-tax cost of debt (nominal)', '%', '=' + a.kd + '*(1-' + a.tax + ')', 'pct2');
    cRow(9, 'wn', 'WACC nominal', '%', '=IF(' + a.wm + '=1,' + a.wo + ',(1-' + a.wd + ')*D7+' + a.wd + '*D8)', 'pct2', 'Computed, or my number');
    cRow(10, 'wr', 'WACC real', '%', '=(1+D9)/(1+' + a.infl + ')-1', 'pct2', 'Fisher: (1 + nominal) / (1 + inflation) − 1');
    cRow(11, 'w', 'Discount rate used', '%', '=IF(' + a.real + '=1,D10,D9)', 'pct2', null, 'total');
    cRow(12, 'kef', 'Cost of equity used', '%', '=IF(' + a.real + '=1,(1+D7)/(1+' + a.infl + ')-1,D7)', 'pct2');
    cRow(13, 'kdu', 'Pre-tax cost of debt used (interest)', '%', '=IF(' + a.real + '=1,(1+' + a.kd + ')/(1+' + a.infl + ')-1,' + a.kd + ')', 'pct2');
    cRow(15, 'rfu', 'Risk-free rate used (terminal-value option 2)', '%', '=IF(' + a.real + '=1,(1+' + a.rf + ')/(1+' + a.infl + ')-1,' + a.rf + ')', 'pct2');
    cRow(14, 'cyu', 'Cash yield used (interest income)', '%', '=IF(' + a.real + '=1,(1+' + a.cy + ')/(1+' + a.infl + ')-1,' + a.cy + ')', 'pct2');

    sec(wsC, 16, 'Unlevered free cash flow', 9, S.projYears);
    var fr = 17, fc = {};
    function fRow(key, label, unit, fn, fmt, kind) {
      put(wsC, 1, fr, label, kind === 'total' ? 'total' : 'lbl'); put(wsC, 2, fr, unit || '', 'unit');
      for (var t = 0; t < N; t++) put(wsC, 3 + t, fr, { f: fn(t, P0 + t) }, kind === 'total' ? 'total' : 'calc', fmt || 'money');
      if (kind === 'total') band(wsC, fr, 1, 1, 'total');
      fc[key] = fr; fr++;
    }
    fRow('ebit', 'EBIT', unitTxt, function (t, pc) { return '=' + fin('ebit', pc); });
    fRow('tr', 'Tax rate', '%', function (t) { return '=' + drv('taxRate', t); }, 'pct');
    fRow('tx', 'Less: tax on EBIT', unitTxt, function (t) { return '=-' + A(3 + t, fc.ebit) + '*' + A(3 + t, fc.tr); });
    fRow('nopat', 'NOPAT', unitTxt, function (t) { return '=' + A(3 + t, fc.ebit) + '+' + A(3 + t, fc.tx); }, 'money', 'total');
    fRow('da', 'Plus: D&A', unitTxt, function (t, pc) { return '=' + fin('da', pc); });
    fRow('cx', 'Less: capex', unitTxt, function (t, pc) { return '=-' + fin('capex', pc); });
    fRow('dn', 'Less: increase in NWC', unitTxt, function (t, pc) { return '=' + fin('dnwc', pc); });
    fRow('ufcf', 'Unlevered free cash flow', unitTxt, function (t) { return '=' + A(3 + t, fc.nopat) + '+' + A(3 + t, fc.da) + '+' + A(3 + t, fc.cx) + '+' + A(3 + t, fc.dn); }, 'money', 'total');
    fRow('per', 'Discount period', 'years', function (t) { return '=' + (t + 1) + '-0.5*' + a.mid; }, 'dec');
    fRow('df', 'Discount factor', '', function (t) { return '=1/(1+$D$11)^' + A(3 + t, fc.per); }, 'dec3');
    fRow('pv', 'PV of UFCF', unitTxt, function (t) { return '=' + A(3 + t, fc.ufcf) + '*' + A(3 + t, fc.df); }, 'money', 'total');
    var ufcfRng = "'Calculations'!$D$" + fc.ufcf + ':$H$' + fc.ufcf, perRng = "'Calculations'!$D$" + fc.per + ':$H$' + fc.per;

    var tr0 = fr + 1;
    sec(wsC, tr0, 'Terminal value and enterprise value', 9);
    put(wsC, 3, tr0, 'Gordon', 'hdr'); put(wsC, 4, tr0, 'Exit multiple', 'hdr'); put(wsC, 5, tr0, 'Blended', 'hdr');
    var tv = {}, rr = tr0 + 1;
    function tvRow(key, label, unit, fg, fx, fb, fmt, kind, note) {
      put(wsC, 1, rr, label, kind === 'total' ? 'total' : 'lbl'); put(wsC, 2, rr, unit || '', 'unit');
      if (fg) put(wsC, 3, rr, { f: fg }, kind === 'total' ? 'total' : 'calc', fmt || 'money');
      if (fx) put(wsC, 4, rr, { f: fx }, kind === 'total' ? 'total' : 'calc', fmt || 'money');
      if (fb) put(wsC, 5, rr, { f: fb }, kind === 'total' ? 'total' : 'calc', fmt || 'money');
      if (kind === 'total') band(wsC, rr, 1, 1, 'total');
      if (note) put(wsC, 9, rr, note, 'sub');
      tv[key] = rr; rr++;
    }
    var gw = a.gw;
    tvRow('assump', 'Assumption: perpetual growth / FCFF exit multiple', '', '=' + a.tvg, '=' + a.mult, null, null, null, null);
    wsC.getCell(A(3, tv.assump)).numFmt = FMT.pct2; wsC.getCell(A(4, tv.assump)).numFmt = FMT.x;
    tvRow('metric', 'Final-year UFCF / exit metric (EBITDA, EBIT or revenue)', unitTxt, '=$H$' + fc.ufcf, '=CHOOSE(' + a.xff + ',' + finAbs('ebitda', lastP) + ',' + finAbs('ebit', lastP) + ',' + finAbs('rev', lastP) + ')');
    tvRow('tv', 'Terminal value (undiscounted)', unitTxt, '=IF(IF(' + a.tvr + '=2,$D$15,$D$11)>D' + tv.assump + ',D' + tv.metric + '*(1+D' + tv.assump + ')/(IF(' + a.tvr + '=2,$D$15,$D$11)-D' + tv.assump + '),NA())', '=E' + tv.metric + '*E' + tv.assump, null, null, null, 'Gordon requires WACC > g');
    tvRow('per', 'Discount period', 'years', '=' + N + '-0.5*' + a.mid, '=' + N, null, 'dec', null, 'Gordon at N − 0.5 with mid-year; exit multiple at N (year-end)');
    tvRow('pvtv', 'PV of terminal value', unitTxt, '=D' + tv.tv + '/(1+$D$11)^D' + tv.per, '=E' + tv.tv + '/(1+$D$11)^E' + tv.per);
    tvRow('sumpv', 'Sum of PV of UFCF', unitTxt, '=SUM($D$' + fc.pv + ':$H$' + fc.pv + ')', '=SUM($D$' + fc.pv + ':$H$' + fc.pv + ')');
    tvRow('ev', 'Enterprise value', unitTxt, '=D' + tv.sumpv + '+D' + tv.pvtv, '=E' + tv.sumpv + '+E' + tv.pvtv, '=' + gw + '*D' + rr + '+(1-' + gw + ')*E' + rr, 'money', 'total');
    tvRow('tvshare', 'Terminal value as % of EV', '%', '=D' + tv.pvtv + '/D' + tv.ev, '=E' + tv.pvtv + '/E' + tv.ev, null, 'pct');
    tvRow('impl', 'Cross-check: implied exit multiple | implied g', '', '=D' + tv.tv + '/E' + tv.metric, '=(E' + tv.tv + '*IF(' + a.tvr + '=2,$D$15,$D$11)-D' + tv.metric + ')/(E' + tv.tv + '+D' + tv.metric + ')', null, null, null, 'Gordon TV ÷ final exit metric | growth implied by the exit multiple');
    wsC.getCell(A(3, tv.impl)).numFmt = FMT.x; wsC.getCell(A(4, tv.impl)).numFmt = FMT.pct2;
    rr++;
    sec(wsC, rr, 'Equity bridge', 9); put(wsC, 3, rr, 'Gordon', 'hdr'); put(wsC, 4, rr, 'Exit multiple', 'hdr'); put(wsC, 5, rr, 'Blended', 'hdr'); rr++;
    var br = {};
    function bRow(key, label, fAll, fmt, kind) {
      put(wsC, 1, rr, label, kind === 'total' ? 'total' : 'lbl'); put(wsC, 2, rr, unitTxt, 'unit');
      [0, 1, 2].forEach(function (j) { put(wsC, 3 + j, rr, { f: fAll(j) }, kind === 'total' ? 'total' : 'calc', fmt || 'money'); });
      if (kind === 'total') band(wsC, rr, 1, 1, 'total');
      br[key] = rr; rr++;
    }
    var col3 = ['D', 'E', 'F'];
    bRow('ev', 'Enterprise value', function (j) { return '=' + col3[j] + tv.ev; });
    bRow('debt', 'Less: total debt', function () { return '=-' + finAbs('debt', lastH); });
    bRow('cash', 'Plus: cash', function () { return '=' + finAbs('cash', lastH); });
    bRow('mi', 'Less: minority interest', function () { return '=-' + finAbs('mi', lastH); });
    bRow('pref', 'Less: preferred equity', function () { return '=-' + a.pref; });
    bRow('inv', 'Plus: investments in associates', function () { return '=' + a.invest; });
    bRow('noa', 'Plus: other non-operating assets', function () { return '=' + a.noa; });
    bRow('oc', 'Less: other debt-like claims', function () { return '=-' + a.oclaims; });
    bRow('eq', 'Equity value', function (j) { return '=SUM(' + col3[j] + br.ev + ':' + col3[j] + (rr - 1) + ')'; }, 'money', 'total');
    put(wsC, 1, rr, 'Per-share factor (unit ÷ shares)', 'lbl');
    put(wsC, 3, rr, { f: '=IF(' + a.shares + '=0,0,IF(' + a.unit + '="thousand",1E3,IF(' + a.unit + '="million",1E6,IF(' + a.unit + '="billion",1E9,IF(' + a.unit + '="trillion",1E12,1))))/(' + a.shares + '*1E6))' }, 'calc', '0.000000');
    c.psf = "'Calculations'!$D$" + rr; br.psf = rr; rr++;
    bRow('ps', 'Value per share (' + S.meta.currency + ')', function (j) { return '=' + col3[j] + br.eq + '*$D$' + br.psf; }, FMT.money, 'total');
    wsC.getCell(A(2, br.ps)).value = S.meta.currency;
    bRow('up', 'Upside / (downside) to current price', function (j) { return '=IF(' + a.price + '>0,' + col3[j] + br.ps + '/' + a.price + '-1,NA())'; }, 'pct');
    wsC.getCell(A(2, br.up)).value = '%';
    var adj = "('Calculations'!$D$" + br.debt + "+'Calculations'!$D$" + br.cash + "+'Calculations'!$D$" + br.mi + "+'Calculations'!$D$" + br.pref + "+'Calculations'!$D$" + br.inv + "+'Calculations'!$D$" + br.noa + "+'Calculations'!$D$" + br.oc + ')';

    /* ---------- FCFE: free cash flow to equity at the cost of equity ---------- */
    rr++;
    sec(wsC, rr, 'Free cash flow to equity (FCFE) · discounted at cost of equity', 9, S.projYears); rr++;
    var fe = {};
    function eRow(key, label, fn, fmt, kind) {
      put(wsC, 1, rr, label, kind === 'total' ? 'total' : 'lbl'); put(wsC, 2, rr, fmt === 'dec3' || fmt === 'dec' ? '' : unitTxt, 'unit');
      for (var t = 0; t < N; t++) put(wsC, 3 + t, rr, { f: fn(t, P0 + t) }, kind === 'total' ? 'total' : 'calc', fmt || 'money');
      if (kind === 'total') band(wsC, rr, 1, 1, 'total');
      fe[key] = rr; rr++;
    }
    eRow('ni', 'Net income', function (t, pc) { return '=' + fin('ni', pc); });
    eRow('da', 'Plus: D&A', function (t, pc) { return '=' + fin('da', pc); });
    eRow('cx', 'Less: capex', function (t, pc) { return '=-' + fin('capex', pc); });
    eRow('dn', 'Less: increase in NWC', function (t, pc) { return '=' + fin('dnwc', pc); });
    eRow('dd', 'Plus: net borrowing / (repayment)', function (t) { return "='Assumptions'!" + L(3 + t) + '$' + a.dDebtRow; });
    eRow('fcfe', 'Free cash flow to equity', function (t) { var c3 = L(3 + t); return '=SUM(' + c3 + fe.ni + ':' + c3 + fe.dd + ')'; }, 'money', 'total');
    eRow('df', 'Discount factor at cost of equity', function (t) { return '=1/(1+$D$12)^' + A(3 + t, fc.per); }, 'dec3');
    eRow('pv', 'PV of FCFE', function (t) { return '=' + A(3 + t, fe.fcfe) + '*' + A(3 + t, fe.df); }, 'money', 'total');
    var fcfeRng = "'Calculations'!$D$" + fe.fcfe + ':$H$' + fe.fcfe;
    rr++;
    sec(wsC, rr, 'FCFE terminal value and equity value', 9); put(wsC, 3, rr, 'Gordon', 'hdr'); put(wsC, 4, rr, 'Exit multiple', 'hdr'); put(wsC, 5, rr, 'Blended', 'hdr'); rr++;
    var te = {};
    function teRow(key, label, unit, fg, fx, fb, fmt, kind, note) {
      put(wsC, 1, rr, label, kind === 'total' ? 'total' : 'lbl'); put(wsC, 2, rr, unit || '', 'unit');
      if (fg) put(wsC, 3, rr, { f: fg }, kind === 'total' ? 'total' : 'calc', fmt || 'money');
      if (fx) put(wsC, 4, rr, { f: fx }, kind === 'total' ? 'total' : 'calc', fmt || 'money');
      if (fb) put(wsC, 5, rr, { f: fb }, kind === 'total' ? 'total' : 'calc', fmt || 'money');
      if (kind === 'total') band(wsC, rr, 1, 1, 'total');
      if (note) put(wsC, 9, rr, note, 'sub');
      te[key] = rr; rr++;
    }
    teRow('assump', 'Assumption: perpetual growth / FCFE exit multiple', '', '=' + a.tvg, '=' + a.multE);
    wsC.getCell(A(3, te.assump)).numFmt = FMT.pct2; wsC.getCell(A(4, te.assump)).numFmt = FMT.x;
    teRow('metric', 'Final-year FCFE / exit metric (NI, revenue, book equity or EBITDA)', unitTxt, '=$H$' + fe.fcfe,
      '=CHOOSE(' + a.xfe + ',' + finAbs('ni', lastP) + ',' + finAbs('rev', lastP) + ',' + finAbs('eq', lastP) + ',' + finAbs('ebitda', lastP) + ')');
    teRow('nd', 'Net debt at year N (deducted only for EV/EBITDA exit)', unitTxt, null, '=IF(' + a.xfe + '=4,' + finAbs('debt', lastP) + '-' + finAbs('cash', lastP) + '+' + finAbs('mi', lastP) + ',0)');
    teRow('tv', 'Terminal equity value (undiscounted)', unitTxt, '=IF(IF(' + a.tvr + '=2,$D$15,$D$12)>D' + te.assump + ',D' + te.metric + '*(1+D' + te.assump + ')/(IF(' + a.tvr + '=2,$D$15,$D$12)-D' + te.assump + '),NA())', '=E' + te.metric + '*E' + te.assump + '-E' + te.nd, null, null, null, 'Gordon requires cost of equity > g');
    teRow('pvtv', 'PV of terminal value', unitTxt, '=D' + te.tv + '/(1+$D$12)^D' + tv.per, '=E' + te.tv + '/(1+$D$12)^E' + tv.per);
    teRow('sumpv', 'Sum of PV of FCFE', unitTxt, '=SUM($D$' + fe.pv + ':$H$' + fe.pv + ')', '=SUM($D$' + fe.pv + ':$H$' + fe.pv + ')');
    teRow('adj', 'Plus: cash − minority − preferred + investments + NOA − other claims', unitTxt, "=-'Calculations'!$D$" + br.debt + '+' + adj, "=-'Calculations'!$D$" + br.debt + '+' + adj, null, null, null, 'Debt is not deducted: debt service is inside FCFE');
    teRow('eq', 'Equity value (FCFE)', unitTxt, '=D' + te.sumpv + '+D' + te.pvtv + '+D' + te.adj, '=E' + te.sumpv + '+E' + te.pvtv + '+E' + te.adj, '=' + gw + '*D' + rr + '+(1-' + gw + ')*E' + rr, 'money', 'total');
    teRow('ps', 'Value per share (' + S.meta.currency + ')', S.meta.currency, '=D' + te.eq + '*' + c.psf, '=E' + te.eq + '*' + c.psf, '=F' + te.eq + '*' + c.psf, 'money', 'total');
    teRow('ev', 'Implied enterprise value (equity + net claims)', unitTxt, '=D' + te.eq + '-' + adj, '=E' + te.eq + '-' + adj, '=F' + te.eq + '-' + adj);
    teRow('tvshare', 'Terminal value as % of equity value (pre-adjustments)', '%', '=D' + te.pvtv + '/(D' + te.sumpv + '+D' + te.pvtv + ')', '=E' + te.pvtv + '/(E' + te.sumpv + '+E' + te.pvtv + ')', null, 'pct');

    /* ---------- Selected (headline) method ---------- */
    rr++;
    sec(wsC, rr, 'Headline method (Assumptions: 1 FCFF, 2 FCFE)', 9); put(wsC, 3, rr, 'Gordon', 'hdr'); put(wsC, 4, rr, 'Exit multiple', 'hdr'); put(wsC, 5, rr, 'Blended', 'hdr'); rr++;
    var sl = {};
    function slRow(key, label, rf, re, fmt, kind) {
      put(wsC, 1, rr, label, kind === 'total' ? 'total' : 'lbl'); put(wsC, 2, rr, fmt === 'pct' ? '%' : unitTxt, 'unit');
      ['D', 'E', 'F'].forEach(function (cl, j) { put(wsC, 3 + j, rr, { f: '=IF(' + a.cf + '=2,' + cl + re + ',' + cl + rf + ')' }, kind === 'total' ? 'total' : 'calc', fmt || 'money'); });
      sl[key] = rr; rr++;
    }
    slRow('ev', 'Enterprise value', tv.ev, te.ev);
    slRow('eq', 'Equity value', br.eq, te.eq);
    slRow('ps', 'Value per share (' + S.meta.currency + ')', br.ps, te.ps, 'money', 'total');
    put(wsC, 1, rr, 'Upside / (downside) to current price', 'lbl'); put(wsC, 2, rr, '%', 'unit');
    ['D', 'E', 'F'].forEach(function (cl, j) { put(wsC, 3 + j, rr, { f: '=IF(' + a.price + '>0,' + cl + sl.ps + '/' + a.price + '-1,NA())' }, 'calc', 'pct'); }); sl.up = rr; rr++;
    put(wsC, 1, rr, 'FCFE ÷ FCFF − 1 (per share)', 'lbl'); put(wsC, 2, rr, '%', 'unit');
    ['D', 'E', 'F'].forEach(function (cl, j) { put(wsC, 3 + j, rr, { f: '=IF(' + cl + br.ps + '=0,NA(),' + cl + te.ps + '/' + cl + br.ps + '-1)' }, 'calc', 'pct'); }); sl.gap = rr; rr++;

    /* =================================================================
     * SENSITIVITY — every cell is a live formula re-pricing the same UFCF
     * ================================================================= */
    wsS.columns = [{ width: 2 }, { width: 18 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 3 }];
    title(wsS, 'Sensitivity', 'Value per share (' + S.meta.currency + ') unless stated · centre = active case · live formulas');
    var W = "'Calculations'!$D$11", KE = "'Calculations'!$D$12";
    var sumpvR = function (rng, wc) { return 'SUMPRODUCT(' + rng + ',1/(1+' + wc + ')^' + perRng + ')'; };
    var fcfN = "'Calculations'!$H$" + fc.ufcf, ebN = "'Calculations'!$E$" + tv.metric, perG = "'Calculations'!$D$" + tv.per, perX = "'Calculations'!$E$" + tv.per;
    var feN = "'Calculations'!$H$" + fe.fcfe, meN = "'Calculations'!$E$" + te.metric, ndN = "'Calculations'!$E$" + te.nd, adjE = "'Calculations'!$D$" + te.adj;
    var stepF = 'IF(' + a.mult + '<4,0.25,1)*' + a.ms, stepE = 'IF(' + a.multE + '<4,0.25,1)*' + a.ms;
    function grid(top, label, rowLabel, rowBase, colLabel, colBase, colStep, colFmt, cellF) {
      sec(wsS, top, label, 6);
      put(wsS, 1, top + 1, rowLabel + ' ↓  ' + colLabel + ' →', 'sec');
      for (var j = 0; j < 5; j++) put(wsS, 2 + j, top + 1, { f: '=' + colBase + '+(' + (j - 2) + ')*' + colStep }, 'sec', colFmt);
      for (var i = 0; i < 5; i++) {
        var rw = top + 2 + i;
        put(wsS, 1, rw, { f: '=' + rowBase + '+(' + (i - 2) + ')*' + a.ws }, 'sec', 'pct2');
        for (var j2 = 0; j2 < 5; j2++) {
          var cell = put(wsS, 2 + j2, rw, { f: cellF('$B' + rw, L(2 + j2) + '$' + (top + 1)) }, 'calc', 'money');
          if (i === 2 && j2 === 2) { cell.font = { name: 'Arial', size: 10, bold: true }; cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }; }
        }
      }
      wsS.addConditionalFormatting({ ref: A(2, top + 2) + ':' + A(6, top + 6), rules: [{ type: 'colorScale', cfvo: [{ type: 'min' }, { type: 'percentile', value: 50 }, { type: 'max' }], color: [{ argb: 'FFF8CBAD' }, { argb: 'FFFFFFFF' }, { argb: 'FFC6E0B4' }] }] });
      return top + 8;
    }
    var gridRow = {};
    gridRow.fG = 4;
    var nr = grid(4, 'FCFF · value per share · Gordon growth (WACC × g)', 'WACC', W, 'g', a.tvg, a.gs, 'pct2', function (wc, gc) {
      var rt = 'IF(' + a.tvr + "=2,'Calculations'!$D$15," + wc + ')';
      return '=IF(' + rt + '>' + gc + ',(' + sumpvR(ufcfRng, wc) + '+' + fcfN + '*(1+' + gc + ')/(' + rt + '-' + gc + ')/(1+' + wc + ')^' + perG + '+' + adj + ')*' + c.psf + ',NA())';
    });
    gridRow.fX = nr;
    nr = grid(nr, 'FCFF · value per share · exit multiple (WACC × ' + XL[M.exitFcff] + ' — switch on Assumptions)', 'WACC', W, 'multiple', a.mult, stepF, 'x', function (wc, mc) {
      return '=(' + sumpvR(ufcfRng, wc) + '+' + ebN + '*' + mc + '/(1+' + wc + ')^' + perX + '+' + adj + ')*' + c.psf;
    });
    gridRow.eG = nr;
    nr = grid(nr, 'FCFE · value per share · Gordon growth (cost of equity × g)', 'Ke', KE, 'g', a.tvg, a.gs, 'pct2', function (kc, gc) {
      var rt = 'IF(' + a.tvr + "=2,'Calculations'!$D$15," + kc + ')';
      return '=IF(' + rt + '>' + gc + ',(' + sumpvR(fcfeRng, kc) + '+' + feN + '*(1+' + gc + ')/(' + rt + '-' + gc + ')/(1+' + kc + ')^' + perG + '+' + adjE + ')*' + c.psf + ',NA())';
    });
    gridRow.eX = nr;
    nr = grid(nr, 'FCFE · value per share · exit multiple (cost of equity × ' + XL[M.exitFcfe] + (M.exitFcfe === 'evEbitda' ? ' − net debt' : '') + ')', 'Ke', KE, 'multiple', a.multE, stepE, 'x', function (kc, mc) {
      return '=(' + sumpvR(fcfeRng, kc) + '+(' + meN + '*' + mc + '-' + ndN + ')/(1+' + kc + ')^' + perX + '+' + adjE + ')*' + c.psf;
    });
    gridRow.evG = nr;
    nr = grid(nr, 'FCFF · enterprise value · Gordon growth (' + unitTxt + ')', 'WACC', W, 'g', a.tvg, a.gs, 'pct2', function (wc, gc) {
      var rt = 'IF(' + a.tvr + "=2,'Calculations'!$D$15," + wc + ')';
      return '=IF(' + rt + '>' + gc + ',' + sumpvR(ufcfRng, wc) + '+' + fcfN + '*(1+' + gc + ')/(' + rt + '-' + gc + ')/(1+' + wc + ')^' + perG + ',NA())';
    });

    /* =================================================================
     * SUMMARY
     * ================================================================= */
    wsSum.columns = [{ width: 2 }, { width: 42 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 3 }, { width: 40 }];
    title(wsSum, S.meta.company + ' · DCF valuation', 'Prepared ' + new Date().toISOString().slice(0, 10) + (S.meta.analyst ? ' by ' + S.meta.analyst : '') + ' · ' + unitTxt + ' · Finance Models & Solutions Hub');
    sec(wsSum, 4, 'Valuation (active scenario)', 6);
    put(wsSum, 2, 4, 'Gordon', 'hdr'); put(wsSum, 3, 4, 'Exit multiple', 'hdr'); put(wsSum, 4, 4, 'Blended', 'hdr');
    var sr = 5;
    function sRow(label, rowC, fmt, kind) {
      put(wsSum, 1, sr, label, kind === 'total' ? 'total' : 'lbl');
      ['D', 'E', 'F'].forEach(function (cl, j) { put(wsSum, 2 + j, sr, { f: "='Calculations'!" + cl + rowC }, kind === 'total' ? 'total' : 'calc', fmt || 'money'); });
      sr++;
    }
    put(wsSum, 1, sr, 'Active scenario', 'lbl'); put(wsSum, 2, sr, { f: "='Assumptions'!E" + a.scen.match(/\d+$/)[0] }, 'calc'); sr++;
    put(wsSum, 1, sr, 'Basis', 'lbl'); put(wsSum, 2, sr, { f: '=IF(' + a.real + '=1,"Real","Nominal")' }, 'calc'); sr++;
    put(wsSum, 1, sr, 'Headline method', 'lbl'); put(wsSum, 2, sr, { f: '=IF(' + a.cf + '=2,"FCFE at cost of equity","FCFF at WACC")' }, 'calc'); sr++;
    put(wsSum, 1, sr, 'Discount rate used (WACC | cost of equity)', 'lbl'); put(wsSum, 2, sr, { f: '=' + W }, 'calc', 'pct2'); put(wsSum, 3, sr, { f: '=' + KE }, 'calc', 'pct2'); sr++;
    sRow('Enterprise value (' + unitTxt + ')', sl.ev, 'money');
    sRow('Equity value (' + unitTxt + ')', sl.eq, 'money');
    sRow('Value per share (' + S.meta.currency + ')', sl.ps, 'money', 'total');
    sRow('Upside / (downside) to price', sl.up, 'pct');
    sRow('Per share · FCFF', br.ps, 'money');
    sRow('Per share · FCFE', te.ps, 'money');
    sRow('FCFE ÷ FCFF − 1', sl.gap, 'pct');
    put(wsSum, 1, sr, 'Current share price', 'lbl'); put(wsSum, 2, sr, { f: '=' + a.price }, 'calc', 'money'); sr++;
    put(wsSum, 1, sr, 'FCFF terminal value share of EV (Gordon | Exit)', 'lbl'); put(wsSum, 2, sr, { f: "='Calculations'!D" + tv.tvshare }, 'calc', 'pct'); put(wsSum, 3, sr, { f: "='Calculations'!E" + tv.tvshare }, 'calc', 'pct'); sr++;
    put(wsSum, 1, sr, 'FCFE terminal value share (Gordon | Exit)', 'lbl'); put(wsSum, 2, sr, { f: "='Calculations'!D" + te.tvshare }, 'calc', 'pct'); put(wsSum, 3, sr, { f: "='Calculations'!E" + te.tvshare }, 'calc', 'pct'); sr++;
    put(wsSum, 1, sr, 'Balance-sheet check (sum of projected differences)', 'lbl'); put(wsSum, 2, sr, { f: "=SUM('Financials'!" + A(P0, f.chk) + ':' + A(lastP, f.chk) + ")-" + N + "*'Financials'!" + A(lastH, f.chk) }, 'calc', 'money2'); sr++;

    sr++;
    sec(wsSum, sr, 'Scenario snapshot · headline method (values at export; switch Assumptions!D8 for live figures)', 6);
    put(wsSum, 2, sr, 'Base', 'hdr'); put(wsSum, 3, sr, 'Upside', 'hdr'); put(wsSum, 4, sr, 'Downside', 'hdr'); sr++;
    [['Enterprise value, blended', 'evBlend', 'money'], ['Equity value, blended', 'eqBlend', 'money'], ['Per share · Gordon', 'psG', 'money'], ['Per share · Exit multiple', 'psX', 'money'], ['Per share · Blended', 'psBlend', 'money'], ['Per share · FCFF blended', 'F:psBlend', 'money'], ['Per share · FCFE blended', 'E:psBlend', 'money']].forEach(function (x) {
      put(wsSum, 1, sr, x[0], 'lbl');
      SC.forEach(function (k, j) { var sc = R.scenarios[k], v = x[1].indexOf(':') > 0 ? sc[x[1][0] === 'F' ? 'VF' : 'VE'][x[1].slice(2)] : sc.V[x[1]]; put(wsSum, 2 + j, sr, isFinite(v) ? v : null, 'lbl', x[2]); });
      sr++;
    });
    sr++;
    sec(wsSum, sr++, 'Model checks at export', 6);
    if (!R.checks.length) put(wsSum, 1, sr++, 'No issues flagged.', 'lbl');
    R.checks.forEach(function (k) { put(wsSum, 1, sr++, (k.level === 'critical' ? 'CRITICAL: ' : 'Review: ') + k.msg, 'lbl'); });
    if (R.reverse) {
      sr++; sec(wsSum, sr++, 'What the current price implies (holding other inputs)', 6);
      [['Perpetual growth', R.reverse.gImplied, 'pct2'], ['Discount rate', R.reverse.waccImplied, 'pct2'], ['Exit ' + (R.V.exitLabel || 'EV/EBITDA'), R.reverse.multImplied, 'x']].forEach(function (x) {
        put(wsSum, 1, sr, x[0], 'lbl'); put(wsSum, 2, sr, x[1] == null ? 'not solvable' : x[1], 'lbl', x[2]); sr++;
      });
    }
    sr++;
    put(wsSum, 1, sr++, 'Legend: blue on yellow = input · black = formula · green = link to another sheet', 'sub');

    /* =================================================================
     * NOTES
     * ================================================================= */
    wsN.columns = [{ width: 2 }, { width: 120 }];
    title(wsN, 'Method notes and sources', '');
    var notes = [
      'Unlevered free cash flow = EBIT × (1 − t) + D&A − capex − increase in operating NWC, discounted at WACC (enterprise value).',
      'FCFE = net income + D&A − capex − increase in NWC + net borrowing, discounted at the cost of equity (equity value directly). Opening cash is added; debt is not deducted because debt service is inside FCFE.',
      'FCFF and FCFE are both calculated; Assumptions picks the headline. A large gap usually means the target D/(D+E) in WACC is inconsistent with the projected financing plan.',
      'Exit multiples: FCFF uses EV/EBITDA, EV/EBIT or EV/Sales on final-year metrics; FCFE uses P/E, P/S, P/B (book equity at N) or EV/EBITDA − projected net debt at N.',
      'Valuation date = last historical fiscal year-end. No stub period. Discount period t, or t − 0.5 with mid-year convention.',
      'Terminal value: Gordon = UFCF(N) × (1 + g) / (WACC − g), discounted at N − 0.5 with mid-year; exit multiple = EBITDA(N) × multiple, discounted at N (Rosenbaum & Pearl).',
      'Real basis: drivers are in constant prices of the last historical year. WACC, cost of debt and cash yield are entered nominal and converted with Fisher: (1 + n) / (1 + π) − 1.',
      'Real-terms caution: under high inflation, tax depreciation shields and working-capital investment are understated by a real model. Cross-check with a nominal run.',
      'Interest is charged on opening balances, so there is no circular reference. Cash is the balance-sheet plug; debt follows the financing schedule.',
      'Equity value = EV − total debt + cash − minority interest (book) − preferred + investments in associates + other non-operating assets − other debt-like claims.',
      'Minority interest is held flat and net income is fully attributed to parent equity (simplification).',
      'Sensitivity cells are closed-form: UFCF does not depend on WACC, g or the multiple, so each cell re-prices the same cash flows.',
      'Author notes: ' + (S.meta.notes || '—')
    ];
    var nrow = 4;
    notes.forEach(function (n) { put(wsN, 1, nrow++, '• ' + n, 'lbl'); wsN.getCell(A(1, nrow - 1)).alignment = { wrapText: true, vertical: 'top' }; });
    nrow++;
    put(wsN, 1, nrow++, 'Data sources', 'sec');
    var src = S.sources || {}, ks = Object.keys(src);
    if (!ks.length) put(wsN, 1, nrow++, 'All inputs entered manually.', 'lbl');
    ks.forEach(function (k) { put(wsN, 1, nrow++, k + ': ' + src[k], 'lbl'); });

    return { wb: wb, map: { a: a, f: f, fc: fc, tv: tv, br: br, fe: fe, te: te, sl: sl, gridRow: gridRow, P0: P0, H0: H0 } };
  }

  function exportXlsx(S, R) {
    if (!root.ExcelJS) { root.Hub.util.toast('Excel library did not load. Check vendor/exceljs.min.js.', 'crit'); return; }
    var out = buildWorkbook(root.ExcelJS, S, R);
    return out.wb.xlsx.writeBuffer().then(function (buf) {
      var name = root.Hub.util.slug(S.meta.company) + '_DCF_' + root.Hub.util.stamp() + '.xlsx';
      return root.Hub.util.saveFile(name, new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    }).catch(function (e) { root.Hub.util.toast('Excel export failed: ' + e.message, 'crit'); });
  }

  root.Hub = root.Hub || {}; root.Hub.DCF = root.Hub.DCF || {};
  root.Hub.DCF.buildWorkbook = buildWorkbook; root.Hub.DCF.exportXlsx = exportXlsx;
  if (typeof module !== 'undefined' && module.exports) module.exports = { buildWorkbook: buildWorkbook };
})(typeof window !== 'undefined' ? window : globalThis);
