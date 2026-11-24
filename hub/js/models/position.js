/* =====================================================================
 * POSITION SIZING & TRADE RISK
 * Fixed-fractional sizing: shares = risk budget ÷ risk per share (stop distance
 * + round-trip costs), rounded down to the lot, capped by maximum position size.
 * Stop from price or from ATR × multiple (ATR / volatility fetched from TSETMC
 * or FMP daily history). Scenarios: Downside = stop hit (plus gap), Base =
 * target 1, Upside = target 2. Expectancy, Kelly fraction, portfolio heat.
 * TSE detail: daily price limit -> how many limit days a stop can take to fill.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {}, F = Hub.fin, num = F.num;
  function sample() {
    return { version: 1, tool: 'position', meta: { currency: 'IRR' }, settings: { scenario: 'base' },
      acct: { equity: 50000000000, riskPct: 0.01, maxPosPct: 0.20, maxHeatPct: 0.06 },
      trade: { symbol: 'Sample (illustrative)', market: 'tse', side: 'long', entry: 5000, stop: 4600, target1: 5800, target2: 6600, useAtr: false, atr: 180, atrMult: 2.0,
        feePct: 0.012, slipPct: 0.002, lot: 1, gapPct: 0.03, limitPct: 0.03 },
      stats: { winRate: 0.45, avgWinR: 2.0, avgLossR: 1.0 },
      open: [{ symbol: 'Open position A (illustrative)', risk: 400000000 }, { symbol: 'Open position B (illustrative)', risk: 350000000 }],
      vol: null, sens: { riskStep: 0.0025, stopStep: 0.02 }, sources: {} };
  }
  function blank() { var s = sample(); s.trade.symbol = ''; ['entry', 'stop', 'target1', 'target2', 'atr'].forEach(function (k) { s.trade[k] = 0; }); s.open = []; return s; }
  function size(S, o) {
    o = o || {};
    var a = S.acct, t = S.trade, dir = t.side === 'short' ? -1 : 1, entry = num(t.entry);
    var stop = t.useAtr ? entry - dir * num(t.atr) * num(t.atrMult) : num(t.stop);
    if (o.stopPct != null) stop = entry * (1 - dir * o.stopPct);
    var dist = Math.abs(entry - stop), cost = entry * (num(t.feePct) + num(t.slipPct));
    var rps = dist + cost, riskPct = o.riskPct != null ? o.riskPct : num(a.riskPct), budget = num(a.equity) * riskPct, lot = Math.max(1, num(t.lot));
    var byRisk = rps > 0 ? Math.floor(budget / rps / lot) * lot : 0, byCap = entry > 0 ? Math.floor(num(a.equity) * num(a.maxPosPct) / entry / lot) * lot : 0;
    var shares = Math.min(byRisk, byCap);
    return { dir: dir, entry: entry, stop: stop, dist: dist, cost: cost, rps: rps, budget: budget, byRisk: byRisk, byCap: byCap, shares: shares, capped: byCap < byRisk,
      notional: shares * entry, posPct: num(a.equity) > 0 ? shares * entry / num(a.equity) : NaN, risk: shares * rps, riskPctActual: num(a.equity) > 0 ? shares * rps / num(a.equity) : NaN };
  }
  function run(S) {
    var t = S.trade, z = size(S), st = S.stats;
    function pnl(exit) { return z.shares * (z.dir * (exit - z.entry) - z.cost); }
    var gapStop = z.stop - z.dir * z.entry * num(t.gapPct);
    var scen = { downside: { exit: gapStop, label: 'Stop hit with ' + (num(t.gapPct) * 100).toFixed(1) + '% gap' }, base: { exit: num(t.target1), label: 'Target 1' }, upside: { exit: num(t.target2), label: 'Target 2' } };
    Object.keys(scen).forEach(function (k) { var s = scen[k]; s.pnl = pnl(s.exit); s.pctEquity = s.pnl / num(S.acct.equity); s.r = z.risk > 0 ? s.pnl / z.risk : NaN; });
    var p = num(st.winRate), w = num(st.avgWinR), l = num(st.avgLossR), bR = l > 0 ? w / l : NaN;
    var expR = p * w - (1 - p) * l, kelly = bR > 0 ? p - (1 - p) / bR : NaN;
    var openRisk = (S.open || []).reduce(function (s, x) { return s + num(x.risk); }, 0), heat = (openRisk + z.risk) / num(S.acct.equity);
    var limitDays = num(t.limitPct) > 0 ? Math.ceil(z.dist / (z.entry * num(t.limitPct))) : null;
    var rs = F.grid5(num(S.acct.riskPct), num(S.sens.riskStep)), ss = F.grid5(z.entry > 0 ? z.dist / z.entry : 0.08, num(S.sens.stopStep));
    var grid = rs.map(function (r) { return ss.map(function (sp) { return sp > 0 && r > 0 ? size(S, { riskPct: r, stopPct: sp }).shares : NaN; }); });
    var checks = [];
    if (z.capped) checks.push({ level: 'warning', msg: 'Size capped by maximum position (' + (num(S.acct.maxPosPct) * 100).toFixed(0) + '% of equity), not by risk.' });
    if (heat > num(S.acct.maxHeatPct)) checks.push({ level: 'critical', msg: 'Portfolio heat ' + (heat * 100).toFixed(1) + '% exceeds the ' + (num(S.acct.maxHeatPct) * 100).toFixed(1) + '% limit.' });
    if (expR <= 0) checks.push({ level: 'critical', msg: 'Negative expectancy: the system loses money on these statistics.' });
    if (isFinite(kelly) && num(S.acct.riskPct) > kelly / 2 && kelly > 0) checks.push({ level: 'warning', msg: 'Risk per trade above half-Kelly (' + (kelly / 2 * 100).toFixed(2) + '%).' });
    if (z.dir * (num(t.target1) - z.entry) <= 0) checks.push({ level: 'warning', msg: 'Target 1 is on the wrong side of entry.' });
    if (limitDays && limitDays > 1) checks.push({ level: 'warning', msg: 'Stop is ' + limitDays + ' daily-limit moves away: in a one-sided queue the exit can take that many sessions and slip beyond the stop.' });
    return { z: z, scen: scen, expR: expR, kelly: kelly, halfKelly: kelly / 2, rr1: z.dist > 0 ? z.dir * (num(t.target1) - z.entry) / z.dist : NaN, rr2: z.dist > 0 ? z.dir * (num(t.target2) - z.entry) / z.dist : NaN,
      openRisk: openRisk, heat: heat, limitDays: limitDays, sens: { rs: rs, ss: ss, grid: grid }, checks: checks };
  }
  function build(ExcelJS, S, R) {
    var X = Hub.xl, b = X.book(ExcelJS), cur = S.meta.currency, t = S.trade;
    var sum = b.sheet('Summary', [2, 44, 18, 16, 16]), A = b.sheet('Assumptions', [2, 44, 10, 18, 18, 18]), C = b.sheet('Calculations', [2, 46, 10, 18, 18, 18]), Sn = b.sheet('Sensitivity', [2, 16, 13, 13, 13, 13, 13]);
    A.title('Assumptions', t.symbol + ' · ' + cur); var a = {}, r = 4;
    function sc(key, label, unit, v, fmt) { A.put(1, r, label); A.put(2, r, unit, 'unit'); A.put(3, r, v, 'in', fmt); a[key] = A.ref(3, r); r++; }
    A.sec(r++, 'Account', 5); sc('eq', 'Account equity', cur, num(S.acct.equity), 'money'); sc('rp', 'Risk per trade', '%', num(S.acct.riskPct), 'pct2'); sc('mp', 'Maximum position', '% equity', num(S.acct.maxPosPct), 'pct'); sc('mh', 'Maximum portfolio heat', '%', num(S.acct.maxHeatPct), 'pct');
    r++; A.sec(r++, 'Trade', 5); sc('side', 'Direction (1 long, −1 short)', '#', t.side === 'short' ? -1 : 1, 'int'); sc('en', 'Entry', cur, num(t.entry), 'money2');
    sc('ua', 'Stop from ATR (1) or price (0)', '#', t.useAtr ? 1 : 0, 'int'); sc('sp', 'Stop price', cur, num(t.stop), 'money2'); sc('atr', 'ATR', cur, num(t.atr), 'money2'); sc('am', 'ATR multiple', 'x', num(t.atrMult), 'dec');
    sc('t1', 'Target 1', cur, num(t.target1), 'money2'); sc('t2', 'Target 2', cur, num(t.target2), 'money2');
    sc('fee', 'Round-trip fees', '% notional', num(t.feePct), 'pct2'); sc('sl', 'Slippage', '% notional', num(t.slipPct), 'pct2'); sc('lot', 'Lot size', 'shares', num(t.lot), 'int');
    sc('gap', 'Gap beyond stop (downside)', '%', num(t.gapPct), 'pct'); sc('lim', 'Daily price limit', '%', num(t.limitPct), 'pct');
    r++; A.sec(r++, 'System statistics', 5); sc('wr', 'Win rate', '%', num(S.stats.winRate), 'pct'); sc('aw', 'Average win (R)', 'R', num(S.stats.avgWinR), 'dec'); sc('al', 'Average loss (R)', 'R', num(S.stats.avgLossR), 'dec');
    r++; A.sec(r++, 'Open positions (risk at stop)', 5); var o0 = r;
    (S.open.length ? S.open : [{ symbol: '—', risk: 0 }]).forEach(function (x) { A.put(1, r, x.symbol, 'in'); A.put(3, r, num(x.risk), 'in', 'money'); r++; }); var o1 = r - 1;
    C.title('Calculations', 'Size, risk, scenarios'); var c = {}, rr = 4;
    function cr(key, label, f, fmt, kind) { C.put(1, rr, label, kind); C.put(3, rr, { f: f }, kind || 'calc', fmt || 'money'); c[key] = '$D$' + rr; rr++; }
    C.sec(rr++, 'Position size', 5);
    cr('stop', 'Stop used', '=IF(' + a.ua + '=1,' + a.en + '-' + a.side + '*' + a.atr + '*' + a.am + ',' + a.sp + ')', 'money2');
    cr('dist', 'Stop distance', '=ABS(' + a.en + '-' + c.stop + ')', 'money2'); cr('cost', 'Costs per share', '=' + a.en + '*(' + a.fee + '+' + a.sl + ')', 'money2');
    cr('rps', 'Risk per share', '=' + c.dist + '+' + c.cost, 'money2'); cr('bud', 'Risk budget', '=' + a.eq + '*' + a.rp);
    cr('br', 'Shares by risk', '=IF(' + c.rps + '>0,INT(' + c.bud + '/' + c.rps + '/' + a.lot + ')*' + a.lot + ',0)', 'money'); cr('bc', 'Shares by position cap', '=IF(' + a.en + '>0,INT(' + a.eq + '*' + a.mp + '/' + a.en + '/' + a.lot + ')*' + a.lot + ',0)', 'money');
    cr('sh', 'Shares to buy / sell', '=MIN(' + c.br + ',' + c.bc + ')', 'money', 'total'); cr('nt', 'Notional', '=' + c.sh + '*' + a.en); cr('pp', 'Position % of equity', '=' + c.nt + '/' + a.eq, 'pct');
    cr('rk', 'Risk at stop', '=' + c.sh + '*' + c.rps, 'money', 'total'); cr('rkp', 'Risk % of equity', '=' + c.rk + '/' + a.eq, 'pct2');
    C.sec(rr++, 'Scenarios (P&L incl. costs)', 5, ['Downside: stop + gap', 'Base: target 1', 'Upside: target 2']);
    C.put(1, rr, 'Exit price'); C.put(3, rr, { f: '=' + c.stop + '-' + a.side + '*' + a.en + '*' + a.gap }, 'calc', 'money2'); C.put(4, rr, { f: '=' + a.t1 }, 'calc', 'money2'); C.put(5, rr, { f: '=' + a.t2 }, 'calc', 'money2'); var ex = rr; rr++;
    C.put(1, rr, 'P&L', 'total'); ['D', 'E', 'F'].forEach(function (cl, j) { C.put(3 + j, rr, { f: '=' + c.sh + '*(' + a.side + '*(' + cl + ex + '-' + a.en + ')-' + c.cost + ')' }, 'total', 'money'); }); var pl = rr; rr++;
    C.put(1, rr, 'P&L % of equity'); ['D', 'E', 'F'].forEach(function (cl, j) { C.put(3 + j, rr, { f: '=' + cl + pl + '/' + a.eq }, 'calc', 'pct2'); }); rr++;
    C.put(1, rr, 'R multiple'); ['D', 'E', 'F'].forEach(function (cl, j) { C.put(3 + j, rr, { f: '=' + cl + pl + '/' + c.rk }, 'calc', 'dec'); }); rr++;
    C.sec(rr++, 'System and portfolio', 5);
    cr('exp', 'Expectancy (R per trade)', '=' + a.wr + '*' + a.aw + '-(1-' + a.wr + ')*' + a.al, 'dec'); cr('kel', 'Kelly fraction', '=' + a.wr + '-(1-' + a.wr + ')/(' + a.aw + '/' + a.al + ')', 'pct2');
    cr('hk', 'Half-Kelly', '=' + c.kel + '/2', 'pct2'); cr('heat', 'Portfolio heat incl. this trade', "=(SUM('Assumptions'!$D$" + o0 + ":$D$" + o1 + ')+' + c.rk + ')/' + a.eq, 'pct2', 'total');
    cr('ld', 'Daily-limit moves to reach stop', '=IF(' + a.lim + '>0,ROUNDUP(' + c.dist + '/(' + a.en + '*' + a.lim + '),0),NA())', 'int');
    Sn.title('Sensitivity', 'Shares · risk per trade (rows) × stop distance as % of entry (columns) · values from the hub engine at export');
    Sn.sec(4, 'Risk % ↓  stop % →', 6);
    R.sens.ss.forEach(function (v, j) { Sn.put(2 + j, 5, v, 'sec', 'pct'); });
    R.sens.rs.forEach(function (v, i) { Sn.put(1, 6 + i, v, 'sec', 'pct2'); R.sens.grid[i].forEach(function (x, j) { Sn.put(2 + j, 6 + i, isFinite(x) ? x : 'n/a', null, 'money'); }); });
    sum.title(t.symbol + ' · Position sizing', cur);
    [['Shares', c.sh, 'money'], ['Notional', c.nt, 'money'], ['Risk at stop', c.rk, 'money'], ['Risk % of equity', c.rkp, 'pct2'], ['Portfolio heat', c.heat, 'pct2'], ['Expectancy (R)', c.exp, 'dec'], ['Half-Kelly', c.hk, 'pct2']]
      .forEach(function (x, i) { sum.put(1, 4 + i, x[0], i ? null : 'total'); sum.put(2, 4 + i, { f: "='Calculations'!" + x[1] }, i ? 'calc' : 'total', x[2]); });
    X.notes(b, ['Risk per share includes round-trip fees and slippage, so the loss at the stop matches the risk budget.', 'Downside assumes the stop fills with a gap; on markets with daily limits a stop can take several sessions to fill.', 'Kelly fraction = p − (1 − p) / (avg win / avg loss). Full Kelly is aggressive; half-Kelly or less is common practice.', 'ATR (14, Wilder) and volatility come from unadjusted daily prices; capital increases and dividends distort them around those dates.'], S.sources);
    return { wb: b.wb };
  }
  Hub.tools = Hub.tools || {}; Hub.tools.position = { sample: sample, blank: blank, run: run, build: build };
  if (typeof module !== 'undefined' && module.exports) module.exports = Hub.tools.position;
  if (!root.document || !Hub.toolkit) return;

  var U = Hub.util, h = U.h, G = Hub.grid, TK = Hub.toolkit;
  TK.define({
    id: 'position', title: 'Position Sizing & Risk', sections: ['trading'], priority: 1, version: 1, storeKey: 'hub.position.v1',
    summary: 'Risk-based size with costs and lots, ATR stops from TSETMC / FMP history, scenario P&L, expectancy, Kelly, portfolio heat.',
    sample: sample, blank: blank, run: run, scenarios: true,
    eyebrow: function (S) { return 'Trading · Position sizing · ' + S.meta.currency; }, heading: function (S) { return S.trade.symbol || 'New trade'; }, filename: function (S) { return (S.trade.symbol || 'Trade') + '_Sizing'; },
    xlsx: function (S, R) { return build(root.ExcelJS, S, R).wb; },
    kpis: function (ctx) { var Z = function () { return ctx.R.z; }; return [
      ['Shares', function () { return U.fmtNum(Z().shares); }, function () { return Z().capped ? 'capped by max position' : 'set by risk budget'; }],
      ['Notional', function () { return U.fmtNum(Z().notional); }, function () { return U.fmtPct(Z().posPct) + ' of equity'; }],
      ['Risk at stop', function () { return U.fmtNum(Z().risk); }, function () { return U.fmtPct(Z().riskPctActual, 2) + ' of equity'; }],
      ['Reward : risk', function () { return U.fmtX(ctx.R.rr1, 2) + ' / ' + U.fmtX(ctx.R.rr2, 2); }, function () { return 'target 1 / target 2'; }],
      ['Portfolio heat', function () { return U.fmtPct(ctx.R.heat, 2); }, function () { return 'limit ' + U.fmtPct(ctx.S.acct.maxHeatPct, 1); }]
    ]; },
    tabs: [
      { group: 'Inputs', items: [['trade', 'Trade', function (ctx) {
        var S = ctx.S, t = S.trade, st = h('p', { class: 'muted fetch-status', 'aria-live': 'polite' });
        var f = G.form({ id: 'ps-t', onChange: ctx.recompute, fields: [
          { key: 'sy', label: 'Symbol', text: true, get: function () { return t.symbol; }, set: function (v) { t.symbol = v; } },
          { key: 'mk', label: 'Market', options: [['tse', 'Tehran (TSETMC)'], ['global', 'Global (FMP / Alpha Vantage)']], get: function () { return t.market; }, set: function (v) { t.market = v; } },
          { key: 'sd', label: 'Direction', options: [['long', 'Long'], ['short', 'Short']], get: function () { return t.side; }, set: function (v) { t.side = v; } },
          ctx.field('en', 'Entry', 'trade.entry', 'dec', { unit: S.meta.currency }),
          { key: 'ua', label: 'Stop method', options: [['0', 'Fixed stop price'], ['1', 'ATR × multiple']], get: function () { return t.useAtr ? '1' : '0'; }, set: function (v) { t.useAtr = v === '1'; } },
          ctx.field('sp', 'Stop price', 'trade.stop', 'dec', { unit: S.meta.currency }), ctx.field('atr', 'ATR (14)', 'trade.atr', 'dec', { unit: S.meta.currency }), ctx.field('am', 'ATR multiple', 'trade.atrMult', 'dec', { unit: 'x' }),
          ctx.field('t1', 'Target 1', 'trade.target1', 'dec', { unit: S.meta.currency }), ctx.field('t2', 'Target 2', 'trade.target2', 'dec', { unit: S.meta.currency }),
          { type: 'head', label: 'Costs and market structure' },
          ctx.field('fe', 'Round-trip fees', 'trade.feePct', 'pct2', { unit: '%', help: 'Broker, exchange and tax on both legs, as % of notional. Use your broker’s current schedule.' }),
          ctx.field('sl', 'Slippage', 'trade.slipPct', 'pct2', { unit: '%' }), ctx.field('lot', 'Lot size', 'trade.lot', 'num', { unit: 'shares' }),
          ctx.field('gp', 'Gap beyond stop (downside case)', 'trade.gapPct', 'pct', { unit: '%' }), ctx.field('lm', 'Daily price limit', 'trade.limitPct', 'pct', { unit: '%', tag: S.sources['trade.limitPct'] })
        ] });
        var fetch = h('button', { class: 'btn', type: 'button', text: 'Fetch price, ATR and limits', onclick: function () {
          var sym = t.symbol.replace(/\s*\(illustrative\)/, '').trim(); if (!sym) { st.textContent = 'Enter a symbol.'; return; }
          st.textContent = 'Fetching ' + sym + '…'; st.classList.remove('err');
          var jobs = [Hub.data.history(sym, t.market)];
          if (t.market === 'tse') jobs.push(Hub.data.tse.quote(sym));
          Promise.all(jobs).then(function (r) {
            var hist = r[0], ps = F.priceStats(hist.rows, 14, hist.periodsPerYear);
            if (!ps) throw new Error('Not enough history for ATR');
            S.vol = { atr: ps.atr, annualVol: ps.annualVol, from: ps.from, to: ps.to, source: hist.source };
            t.atr = ps.atr; S.sources['trade.atr'] = hist.source + ' ' + ps.to;
            var msg = hist.source + ': last close ' + U.fmtNum(ps.last, 2) + ', ATR(14) ' + U.fmtNum(ps.atr, 2) + ', annualised volatility ' + U.fmtPct(ps.annualVol) + ' (' + ps.n + ' sessions, unadjusted prices).';
            if (r[1]) { var q = r[1]; if (q.limitHigh && q.yesterday) { t.limitPct = Math.round((q.limitHigh / q.yesterday - 1) * 1000) / 1000; S.sources['trade.limitPct'] = 'TSETMC ' + U.stamp(); msg += ' Daily limit ±' + U.fmtPct(t.limitPct, 1) + '.'; } }
            if (!t.entry) t.entry = ps.last;
            ctx.rerender(); U.toast(msg, 'good');
          }).catch(function (e) { st.textContent = e.message; st.classList.add('err'); });
        } });
        var acct = G.form({ id: 'ps-a', onChange: ctx.recompute, fields: [
          { key: 'cu', label: 'Currency', text: true, get: function () { return S.meta.currency; }, set: function (v) { S.meta.currency = v.toUpperCase(); } },
          ctx.field('eq', 'Account equity', 'acct.equity', 'num', { unit: S.meta.currency }), ctx.field('rp', 'Risk per trade', 'acct.riskPct', 'pct2', { unit: '%' }),
          ctx.field('mp', 'Maximum position', 'acct.maxPosPct', 'pct', { unit: '% equity' }), ctx.field('mh', 'Maximum portfolio heat', 'acct.maxHeatPct', 'pct', { unit: '%' }),
          { type: 'head', label: 'System statistics (from your trade log)' },
          ctx.field('wr', 'Win rate', 'stats.winRate', 'pct', { unit: '%' }), ctx.field('aw', 'Average win', 'stats.avgWinR', 'dec', { unit: 'R' }), ctx.field('al', 'Average loss', 'stats.avgLossR', 'dec', { unit: 'R' })
        ] });
        var open = ctx.list({ id: 'ps-o', path: 'open', newRow: function () { return { symbol: '', risk: 0 }; }, cols: [{ key: 'symbol', label: 'Open position', kind: 'text' }, { key: 'risk', label: 'Risk at stop (' + S.meta.currency + ')' }] });
        return ctx.group([ctx.two(ctx.panel('Trade', [f, h('div', { class: 'row-ctl' }, [fetch]), st]), ctx.panel('Account and system', [acct])), ctx.panel('Open positions (portfolio heat)', [open])]);
      }]] },
      { group: 'Outputs', items: [['out', 'Size & scenarios', function (ctx) {
        var S = ctx.S, cur = S.meta.currency, Z = function () { return ctx.R.z; };
        var t = G.table({ id: 'ps-z', corner: cur, cols: [{ label: 'Value' }], rows: [
          ['Stop used', function () { return Z().stop; }, 'dec'], ['Stop distance', function () { return Z().dist; }, 'dec'], ['Costs per share', function () { return Z().cost; }, 'dec'], ['Risk per share', function () { return Z().rps; }, 'dec'],
          ['Risk budget', function () { return Z().budget; }], ['Shares by risk', function () { return Z().byRisk; }], ['Shares by position cap', function () { return Z().byCap; }], ['Shares', function () { return Z().shares; }, 'num', 'total'],
          ['Daily-limit moves to reach stop', function () { return ctx.R.limitDays; }, 'days'], ['Expectancy (R per trade)', function () { return ctx.R.expR; }, 'dec'], ['Kelly fraction', function () { return ctx.R.kelly; }, 'pct2'], ['Half-Kelly', function () { return ctx.R.halfKelly; }, 'pct2']
        ].map(function (x) { return { label: x[0], cls: x[3] || '', cell: function () { return ctx.calc(x[1], x[2] || 'num'); } }; }) });
        var sc = G.table({ id: 'ps-s', corner: cur, cols: ctx.scenCols(), rows: [
          { label: 'Case', cell: function (c) { return ctx.calc(function () { return ctx.R.scen[ctx.scenKey(c)].label; }); } },
          { label: 'Exit price', cell: function (c) { return ctx.calc(function () { return ctx.R.scen[ctx.scenKey(c)].exit; }, 'dec'); } },
          { label: 'P&L incl. costs', cls: 'total', cell: function (c) { return ctx.calc(function () { return ctx.R.scen[ctx.scenKey(c)].pnl; }); } },
          { label: 'P&L % of equity', cell: function (c) { return ctx.calc(function () { return ctx.R.scen[ctx.scenKey(c)].pctEquity; }, 'pct2'); } },
          { label: 'R multiple', cell: function (c) { return ctx.calc(function () { return ctx.R.scen[ctx.scenKey(c)].r; }, 'dec'); } }] });
        var vol = G.form({ id: 'ps-v', fields: [{ key: 'v', label: 'Fetched volatility', calc: function () { var v = ctx.S.vol; return v ? 'ATR ' + U.fmtNum(v.atr, 2) + ' · annualised ' + U.fmtPct(v.annualVol) + ' · ' + v.from + ' to ' + v.to + ' · ' + v.source : 'not fetched'; } }] });
        var box = h('div', { class: 'grid-wrap' });
        function paint() { var s = ctx.R.sens; TK.heat(box, 'Shares · risk per trade × stop distance (% of entry)', 'Risk %', 'Stop %', s.rs, s.ss, s.grid, 'pct2', 'pct', 'num'); }
        paint();
        return { el: h('div', { class: 'stack' }, [ctx.two(ctx.panel('Sizing', [t]), ctx.panel('Scenarios', [sc, vol])), ctx.panel(null, [box])]), refresh: function () { t.refresh(); sc.refresh(); vol.refresh(); paint(); } };
      }]] }
    ]
  });
})(typeof window !== 'undefined' ? window : globalThis);
