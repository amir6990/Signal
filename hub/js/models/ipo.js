/* =====================================================================
 * IPO VALUATION — triangulate DCF, comps and precedents, then build the offer
 * Weighted fair value (low / mid / high = Downside / Base / Upside), IPO discount,
 * offer price, primary and secondary shares, free float, proceeds, dilution,
 * sector P/E cross-check. Method values can be pulled from the DCF, Comps and
 * Precedents tools saved in this browser. Weights are yours to set.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {}, F = Hub.fin, num = F.num;
  var COL = { downside: 'low', base: 'mid', upside: 'high' };
  function sample() {
    return { version: 1, tool: 'ipo', meta: { company: 'IPO Candidate (illustrative)', currency: 'IRR', unit: 'billion' }, settings: { scenario: 'base' },
      methods: [
        { name: 'DCF (blended terminal value)', low: 130000, mid: 186000, high: 234000, weight: 0.5, link: 'dcf' },
        { name: 'Trading comparables', low: 110000, mid: 120000, high: 155000, weight: 0.3, link: 'comps' },
        { name: 'Precedent transactions', low: 120000, mid: 147000, high: 170000, weight: 0.2, link: 'precedents' }
      ],
      offer: { preShares: 10000, primary: 15000, secondaryShares: 800, feesPct: 0.02, minFloat: 0.10, niNext: 10600, sectorPE: 12 },
      scenarios: { base: { discount: 0.15 }, upside: { discount: 0.10 }, downside: { discount: 0.20 } },
      sens: { discStep: 0.05, valStep: 0.10 }, sources: {} };
  }
  function blank() { var s = sample(); s.meta.company = 'Company'; s.methods.forEach(function (m) { m.low = m.mid = m.high = 0; }); Object.keys(s.offer).forEach(function (k) { s.offer[k] = 0; }); return s; }
  function fair(S, col) {
    var ms = S.methods.filter(function (m) { return num(m[col]) > 0 && num(m.weight) > 0; }), w = ms.reduce(function (a, m) { return a + num(m.weight); }, 0);
    return w > 0 ? ms.reduce(function (a, m) { return a + num(m[col]) * num(m.weight); }, 0) / w : NaN;
  }
  function offerCalc(S, fv, disc) {
    var u = F.UNIT[S.meta.unit] || 1, o = S.offer, pre = num(o.preShares);
    var fairPs = pre > 0 ? fv * u / (pre * 1e6) : NaN, price = fairPs * (1 - disc);
    var newSh = price > 0 ? num(o.primary) * u / price / 1e6 : 0, post = pre + newSh, floatSh = newSh + num(o.secondaryShares);
    return { fairValue: fv, fairPs: fairPs, discount: disc, price: price, preMoney: price * pre * 1e6 / u, postMoney: price * post * 1e6 / u, newShares: newSh, postShares: post,
      floatPct: post > 0 ? floatSh / post : NaN, dilution: post > 0 ? newSh / post : NaN, grossProceeds: floatSh * 1e6 * price / u, primaryNet: num(o.primary) * (1 - num(o.feesPct)),
      secondaryProceeds: num(o.secondaryShares) * 1e6 * price / u, peAtOffer: num(o.niNext) > 0 ? price * post * 1e6 / u / num(o.niNext) : NaN };
  }
  function run(S) {
    var k = S.settings.scenario, R = { fv: { low: fair(S, 'low'), mid: fair(S, 'mid'), high: fair(S, 'high') } };
    R.scen = {}; ['base', 'upside', 'downside'].forEach(function (s) { R.scen[s] = offerCalc(S, R.fv[COL[s]], num(S.scenarios[s].discount)); });
    R.cur = R.scen[k];
    R.sectorEq = num(S.offer.niNext) * num(S.offer.sectorPE);
    var ds = F.grid5(num(S.scenarios[k].discount), num(S.sens.discStep)), vs = F.grid5(0, num(S.sens.valStep));
    R.sens = { ds: ds, vs: vs, price: ds.map(function (d) { return vs.map(function (v) { return offerCalc(S, R.fv[COL[k]] * (1 + v), d).price; }); }),
      float: ds.map(function (d) { return vs.map(function (v) { return offerCalc(S, R.fv[COL[k]] * (1 + v), d).floatPct; }); }) };
    var c = [];
    if (R.cur.floatPct < num(S.offer.minFloat)) c.push({ level: 'critical', msg: 'Free float ' + (R.cur.floatPct * 100).toFixed(1) + '% is below the minimum you set (' + (num(S.offer.minFloat) * 100).toFixed(1) + '%).' });
    var wsum = S.methods.reduce(function (a, m) { return a + num(m.weight); }, 0);
    if (Math.abs(wsum - 1) > 1e-6) c.push({ level: 'warning', msg: 'Method weights sum to ' + (wsum * 100).toFixed(0) + '%; values are normalised.' });
    if (R.sectorEq > 0 && Math.abs(R.cur.fairValue / R.sectorEq - 1) > 0.25) c.push({ level: 'warning', msg: 'Weighted fair value differs from the sector P/E cross-check by ' + ((R.cur.fairValue / R.sectorEq - 1) * 100).toFixed(0) + '%.' });
    R.checks = c;
    return R;
  }
  function build(ExcelJS, S, R) {
    var X = Hub.xl, b = X.book(ExcelJS), cur = S.meta.currency, ut = cur + ' ' + S.meta.unit + 's';
    var sum = b.sheet('Summary', [2, 44, 16, 16, 16]), A = b.sheet('Assumptions', [2, 40, 10, 16, 16, 16, 12]), C = b.sheet('Calculations', [2, 44, 16, 16, 16]), Sn = b.sheet('Sensitivity', [2, 18, 13, 13, 13, 13, 13]);
    A.title('Assumptions', S.meta.company + ' · ' + ut); var a = {}, r = 4;
    function sc(key, label, unit, v, fmt) { A.put(1, r, label); A.put(2, r, unit, 'unit'); A.put(3, r, v, 'in', fmt); a[key] = A.ref(3, r); r++; }
    A.sec(r++, 'General', 6); sc('unit', 'Monetary unit', '', S.meta.unit); sc('scen', 'Scenario (1 Base, 2 Upside, 3 Downside)', '#', ['base', 'upside', 'downside'].indexOf(S.settings.scenario) + 1, 'int');
    r++; A.sec(r++, 'Valuation methods (equity value, ' + ut + ')', 6, ['Low', 'Mid', 'High', 'Weight']);
    var m0 = r;
    S.methods.forEach(function (m) { A.put(1, r, m.name, 'in'); A.put(3, r, num(m.low), 'in', 'money'); A.put(4, r, num(m.mid), 'in', 'money'); A.put(5, r, num(m.high), 'in', 'money'); A.put(6, r, num(m.weight), 'in', 'pct'); r++; });
    var m1 = r - 1;
    r++; A.sec(r++, 'Offering', 6);
    sc('pre', 'Pre-IPO shares', 'mn', num(S.offer.preShares), 'money2'); sc('prim', 'Primary raise (new money)', ut, num(S.offer.primary), 'money'); sc('sec', 'Secondary shares sold', 'mn', num(S.offer.secondaryShares), 'money2');
    sc('fee', 'Fees (% of primary)', '%', num(S.offer.feesPct), 'pct'); sc('mf', 'Minimum free float', '%', num(S.offer.minFloat), 'pct');
    sc('ni', 'Net income, first forecast year', ut, num(S.offer.niNext), 'money'); sc('spe', 'Sector P/E', 'x', num(S.offer.sectorPE), 'x');
    r++; A.sec(r++, 'IPO discount', 6, ['Base', 'Upside', 'Downside']);
    A.put(1, r, 'Discount to fair value'); ['base', 'upside', 'downside'].forEach(function (k, j) { A.put(3 + j, r, num(S.scenarios[k].discount), 'in', 'pct'); }); var dr = r; r++;
    var u = F.unitXl(a.unit);
    C.title('Calculations', 'Fair value, offer and float'); C.sec(4, 'Fair value', 4, ['Low', 'Mid', 'High']);
    ['D', 'E', 'F'].forEach(function (cl, j) {
      var vr = "'Assumptions'!$" + cl + '$' + m0 + ':$' + cl + '$' + m1, wr = "'Assumptions'!$G$" + m0 + ':$G$' + m1;
      C.put(3 + j, 5, { f: '=SUMPRODUCT(' + vr + ',' + wr + ',--(' + vr + '>0))/SUMPRODUCT(' + wr + ',--(' + vr + '>0))' }, 'total', 'money');
    });
    C.put(1, 5, 'Weighted equity value', 'total');
    C.sec(7, 'Offer (active scenario)', 4);
    var c = {}, rr = 8;
    function cr(key, label, f, fmt, kind) { C.put(1, rr, label, kind); C.put(2, rr, { f: f }, kind || 'calc', fmt || 'money'); c[key] = '$C$' + rr; rr++; }
    cr('fv', 'Fair equity value', '=CHOOSE(' + a.scen + ',E5,F5,D5)'); cr('disc', 'IPO discount', "=CHOOSE(" + a.scen + ",'Assumptions'!D" + dr + ",'Assumptions'!E" + dr + ",'Assumptions'!F" + dr + ')', 'pct');
    cr('fps', 'Fair value per share (' + cur + ')', '=' + c.fv + '*' + u + '/(' + a.pre + '*1E6)', 'money2'); cr('px', 'Offer price (' + cur + ')', '=' + c.fps + '*(1-' + c.disc + ')', 'money2', 'total');
    cr('pre', 'Pre-money market value', '=' + c.px + '*' + a.pre + '*1E6/' + u); cr('ns', 'New shares issued (mn)', '=' + a.prim + '*' + u + '/' + c.px + '/1E6', 'money2');
    cr('post', 'Post-IPO shares (mn)', '=' + a.pre + '+' + c.ns, 'money2'); cr('postv', 'Post-money market value', '=' + c.px + '*' + c.post + '*1E6/' + u);
    cr('ff', 'Free float', '=(' + c.ns + '+' + a.sec + ')/' + c.post, 'pct', 'total'); cr('dil', 'Dilution to existing holders', '=' + c.ns + '/' + c.post, 'pct');
    cr('gp', 'Gross proceeds (primary + secondary)', '=(' + c.ns + '+' + a.sec + ')*1E6*' + c.px + '/' + u); cr('pn', 'Primary proceeds net of fees', '=' + a.prim + '*(1-' + a.fee + ')');
    cr('pe', 'P/E at offer (post-money)', '=IF(' + a.ni + '>0,' + c.postv + '/' + a.ni + ',NA())', 'x'); cr('spe', 'Sector P/E cross-check: equity value', '=' + a.ni + '*' + a.spe);
    cr('fok', 'Free float meets minimum (1/0)', '=IF(' + c.ff + '>=' + a.mf + ',1,0)', 'int');
    Sn.title('Sensitivity', 'Offer price (' + cur + ') · IPO discount (rows) × change in fair value (columns) · values from the hub engine at export');
    Sn.sec(4, 'Discount ↓  value Δ →', 6);
    R.sens.vs.forEach(function (v, j) { Sn.put(2 + j, 5, v, 'sec', 'pct'); });
    R.sens.ds.forEach(function (d, i) { Sn.put(1, 6 + i, d, 'sec', 'pct'); R.sens.price[i].forEach(function (x, j) { Sn.put(2 + j, 6 + i, x, null, 'money'); }); });
    Sn.heat('C6:G10');
    sum.title(S.meta.company + ' · IPO valuation', ut);
    sum.sec(4, 'Active scenario', 3);
    [['Offer price (' + cur + ')', c.px, 'money2'], ['Fair value per share', c.fps, 'money2'], ['IPO discount', c.disc, 'pct'], ['Post-money market value', c.postv, 'money'], ['Free float', c.ff, 'pct'], ['Gross proceeds', c.gp, 'money'], ['P/E at offer', c.pe, 'x']]
      .forEach(function (x, i) { sum.put(1, 5 + i, x[0], i ? null : 'total'); sum.put(2, 5 + i, { f: "='Calculations'!" + x[1] }, i ? 'calc' : 'total', x[2]); });
    sum.sec(13, 'Price range (values at export)', 4, ['Downside', 'Base', 'Upside'], 2);
    sum.put(1, 14, 'Offer price'); ['downside', 'base', 'upside'].forEach(function (k, j) { sum.put(2 + j, 14, R.scen[k].price, null, 'money2'); });
    sum.put(1, 15, 'Free float'); ['downside', 'base', 'upside'].forEach(function (k, j) { sum.put(2 + j, 15, R.scen[k].floatPct, null, 'pct'); });
    X.notes(b, ['Fair value = weighted average of method values with a positive value and weight (weights renormalise).', 'Downside uses the low end of each method and the largest discount; Upside the high end and the smallest discount.',
      'New shares = primary raise ÷ offer price. Free float = (new + secondary shares) ÷ post-IPO shares.', 'Minimum free float, discount and fees are inputs: set them from the listing rules and underwriting terms that apply to the deal.'], S.sources);
    return { wb: b.wb };
  }
  Hub.tools = Hub.tools || {}; Hub.tools.ipo = { sample: sample, blank: blank, run: run, build: build };
  if (typeof module !== 'undefined' && module.exports) module.exports = Hub.tools.ipo;
  if (!root.document || !Hub.toolkit) return;

  var U = Hub.util, h = U.h, G = Hub.grid, TK = Hub.toolkit;
  function ul(S) { return S.meta.currency + ' ' + F.unitShort(S.meta.unit); }
  // pull low / mid / high equity values from another tool's saved state
  function pull(link) {
    if (link === 'dcf' && Hub.DCF) {
      var s = U.store.get('hub.dcf.v1', null) || Hub.DCF.sample(); var r = Hub.DCF.engine.run(s);
      return { low: r.scenarios.downside.V.eqBlend, mid: r.scenarios.base.V.eqBlend, high: r.scenarios.upside.V.eqBlend, unit: s.meta.unit, src: 'DCF tool' };
    }
    if (link === 'comps') { var c = U.store.get('hub.comps.v1', null) || Hub.tools.comps.sample(), rc = Hub.tools.comps.run(c); return { low: rc.blended.Ltm.q1.equity, mid: rc.blended.Ltm.median.equity, high: rc.blended.Ltm.q3.equity, unit: c.meta.unit, src: 'Comps tool (LTM)' }; }
    if (link === 'precedents') { var p = U.store.get('hub.prec.v1', null) || Hub.tools.precedents.sample(), rp = Hub.tools.precedents.run(p); return { low: rp.implied.q1.blend.equity, mid: rp.implied.median.blend.equity, high: rp.implied.q3.blend.equity, unit: p.meta.unit, src: 'Precedents tool' }; }
    return null;
  }
  TK.define({
    id: 'ipo', title: 'IPO Valuation', sections: ['ipo'], priority: 1, version: 1, storeKey: 'hub.ipo.v1',
    summary: 'DCF + comps + precedents triangulation, IPO discount, offer price range, primary / secondary, free float, proceeds.',
    sample: sample, blank: blank, run: run, scenarios: true,
    fromCompany: function (S, M) {
      var r = function (v) { return isFinite(v) ? Math.round(v * 100) / 100 : 0; }, rp = function (v) { return isFinite(v) ? Math.round(v * 1e4) / 1e4 : 0; }; var fa = Hub.i18n && Hub.i18n.lang() === 'fa'; if (M.fy1) S.offer.niNext = r(M.fy1.ni); if (M.sharesMn) S.offer.preShares = r(M.sharesMn);
      return fa ? 'سود خالص سال اول پیش‌بینی و تعداد سهام پیش از عرضه اعمال شد؛ دامنهٔ ارزش هر روش را با «دریافت» از ابزار مربوط بگیرید.' : 'First forecast-year net income and pre-IPO shares applied; pull each method’s value range from its tool.';
    },
    eyebrow: function (S) { return 'IPO · Valuation and offer structure · ' + ul(S); }, heading: function (S) { return S.meta.company; }, filename: function (S) { return S.meta.company + '_IPO'; },
    xlsx: function (S, R) { return build(root.ExcelJS, S, R).wb; },
    kpis: function (ctx) { var C = function () { return ctx.R.cur; }; return [
      ['Offer price', function () { return U.fmtNum(C().price); }, function () { return ctx.S.meta.currency + ' · fair ' + U.fmtNum(C().fairPs) + ' less ' + U.fmtPct(C().discount, 0); }],
      ['Price range', function () { return U.fmtNum(ctx.R.scen.downside.price) + ' – ' + U.fmtNum(ctx.R.scen.upside.price); }, function () { return 'downside to upside'; }],
      ['Post-money value', function () { return U.fmtNum(C().postMoney); }, function () { return ul(ctx.S); }],
      ['Free float', function () { return U.fmtPct(C().floatPct); }, function () { return 'minimum ' + U.fmtPct(ctx.S.offer.minFloat); }],
      ['Gross proceeds', function () { return U.fmtNum(C().grossProceeds); }, function () { return 'P/E at offer ' + U.fmtX(C().peAtOffer); }]
    ]; },
    tabs: [
      { group: 'Inputs', items: [['methods', 'Valuation methods', function (ctx) {
        var S = ctx.S, st = h('p', { class: 'muted', 'aria-live': 'polite' });
        var lst = ctx.list({ id: 'ipo-m', path: 'methods', newRow: function () { return { name: 'Other method', low: 0, mid: 0, high: 0, weight: 0, link: null }; }, cols: [
          { key: 'name', label: 'Method', kind: 'text' }, { key: 'low', label: 'Low (Downside)' }, { key: 'mid', label: 'Mid (Base)' }, { key: 'high', label: 'High (Upside)' }, { key: 'weight', label: 'Weight', fmt: 'pct' }],
          rowActions: [{ label: 'Pull', title: 'Pull values from the linked tool saved in this browser', run: function (row, i, done) {
            var p = pull(row.link); if (!p) { st.textContent = 'This row is not linked to a tool.'; return; }
            if (p.unit !== S.meta.unit) U.toast('Linked tool uses ' + p.unit + 's; this IPO model uses ' + S.meta.unit + 's. Align units.', 'warn');
            row.low = p.low; row.mid = p.mid; row.high = p.high; st.textContent = row.name + ': pulled from ' + p.src + '.'; done();
          } }] });
        var f = G.form({ id: 'ipo-g', onChange: ctx.rerender, fields: [
          { key: 'co', label: 'Company', text: true, get: function () { return S.meta.company; }, set: function (v) { S.meta.company = v; } },
          { key: 'cu', label: 'Currency', text: true, get: function () { return S.meta.currency; }, set: function (v) { S.meta.currency = v.toUpperCase(); } },
          { key: 'un', label: 'Monetary unit', options: F.UNITS, get: function () { return S.meta.unit; }, set: function (v) { S.meta.unit = v; } }] });
        return ctx.group([ctx.panel('Company', [f]), ctx.panel('Equity value by method (' + ul(S) + ')', [h('p', { class: 'muted', text: 'Weights are a negotiation call, not a formula. "Pull" reads the DCF, Comps or Precedents tool as last saved in this browser.' }), lst, st])]);
      }], ['offer', 'Offer structure', function (ctx) {
        var S = ctx.S, st = h('p', { class: 'muted', 'aria-live': 'polite' });
        var f = G.form({ id: 'ipo-o', onChange: ctx.recompute, fields: [
          ctx.field('ps', 'Pre-IPO shares', 'offer.preShares', 'dec', { unit: 'mn' }), ctx.field('pr', 'Primary raise (new money)', 'offer.primary', 'num', { unit: ul(S) }),
          ctx.field('ss', 'Secondary shares sold by existing holders', 'offer.secondaryShares', 'dec', { unit: 'mn' }), ctx.field('fe', 'Fees', 'offer.feesPct', 'pct', { unit: '% primary' }),
          ctx.field('mf', 'Minimum free float', 'offer.minFloat', 'pct', { unit: '%', help: 'Set from the listing rules that apply to the target board.' }),
          { type: 'head', label: 'Cross-check' }, ctx.field('ni', 'Net income, first forecast year', 'offer.niNext', 'num', { unit: ul(S) }),
          ctx.field('pe', 'Sector P/E', 'offer.sectorPE', 'dec', { unit: 'x', tag: S.sources['offer.sectorPE'] })] });
        var tk = h('input', { id: 'ipo-peer', class: 'f-text', type: 'text', placeholder: 'TSE peer symbol, e.g. فولاد', autocomplete: 'off' });
        var btn = h('button', { class: 'btn ghost', type: 'button', text: 'Sector P/E from TSETMC', onclick: function () {
          if (!tk.value.trim()) return; st.textContent = 'Fetching…';
          Hub.data.tse.quote(tk.value).then(function (q) { if (!q.sectorPE) throw new Error('TSETMC returned no sector P/E for ' + q.symbol); S.offer.sectorPE = q.sectorPE; S.sources['offer.sectorPE'] = 'TSETMC ' + q.symbol + ' ' + U.stamp(); ctx.rerender(); U.toast('Sector P/E ' + q.sectorPE.toFixed(2) + ' (' + q.sector + ')', 'good'); }).catch(function (e) { st.textContent = e.message; });
        } });
        var d = G.table({ id: 'ipo-d', corner: 'IPO discount', cols: ctx.scenCols(), onChange: ctx.recompute, rows: [{ label: 'Discount to fair value', unit: '%', cell: function (c) { return ctx.inVal('scenarios.' + ctx.scenKey(c) + '.discount', 'pct'); } }] });
        return ctx.group([ctx.two(ctx.panel('Offering', [f, h('div', { class: 'row-ctl' }, [tk, btn]), st]), ctx.panel('Discount by scenario', [d]))]);
      }]] },
      { group: 'Outputs', items: [['out', 'Offer & range', function (ctx) {
        var S = ctx.S;
        var t = G.table({ id: 'ipo-r', corner: ul(S), cols: ctx.scenCols(), rows: [
          ['Fair equity value', 'fairValue'], ['Fair value per share', 'fairPs', 'dec'], ['IPO discount', 'discount', 'pct'], ['Offer price', 'price', 'dec', 'total'], ['Pre-money value', 'preMoney'], ['New shares (mn)', 'newShares', 'dec'],
          ['Post-IPO shares (mn)', 'postShares', 'dec'], ['Post-money value', 'postMoney'], ['Free float', 'floatPct', 'pct', 'total'], ['Dilution to existing holders', 'dilution', 'pct'], ['Gross proceeds', 'grossProceeds'], ['Primary net of fees', 'primaryNet'],
          ['Secondary proceeds', 'secondaryProceeds'], ['P/E at offer', 'peAtOffer', 'x']
        ].map(function (x) { return { label: x[0], cls: x[3] || '', cell: function (c) { return ctx.calc(function () { return ctx.R.scen[ctx.scenKey(c)][x[1]]; }, x[2] || 'num'); } }; }) });
        var x = G.form({ id: 'ipo-x', fields: [{ key: 'se', label: 'Equity value at sector P/E', calc: function () { return U.fmtNum(ctx.R.sectorEq) + ' (' + U.fmtPct(ctx.R.cur.fairValue / ctx.R.sectorEq - 1) + ' vs weighted fair value)'; } }] });
        var cv = h('canvas', { 'aria-label': 'Football field' });
        function draw() {
          ctx.charts.forEach(function (c) { c.destroy(); }); ctx.charts.length = 0;
          var u = F.UNIT[S.meta.unit] || 1, ps = function (v) { return v * u / (num(S.offer.preShares) * 1e6); };
          var rows = S.methods.filter(function (m) { return num(m.mid) > 0; }).map(function (m) { return [m.name, [ps(num(m.low)), ps(num(m.high))]]; });
          rows.push(['Offer price range', [ctx.R.scen.downside.price, ctx.R.scen.upside.price]]);
          if (Hub.footfield) Hub.footfield(ctx, cv, rows, 0);
        }
        return { el: h('div', { class: 'stack' }, [ctx.panel('Offer by scenario', [t]), ctx.panel('Cross-check', [x.el]), ctx.panel('Value per pre-IPO share by method', [h('div', { class: 'chart tall' }, [cv])])]),
          refresh: function () { t.refresh(); x.refresh(); draw(); }, after: draw };
      }], ['sens', 'Sensitivity', function (ctx) {
        var a = h('div', { class: 'grid-wrap' }), b = h('div', { class: 'grid-wrap' });
        function paint() { var s = ctx.R.sens;
          TK.heat(a, 'Offer price · IPO discount × change in fair value', 'Discount', 'Value Δ', s.ds, s.vs, s.price, 'pct', 'pct', 'num');
          TK.heat(b, 'Free float · IPO discount × change in fair value', 'Discount', 'Value Δ', s.ds, s.vs, s.float, 'pct', 'pct', 'pct', function (v) { return v < ctx.S.offer.minFloat; }); }
        paint();
        return { el: h('div', { class: 'stack' }, [ctx.panel(null, [a]), ctx.panel(null, [b])]), refresh: paint };
      }]] }
    ]
  });
})(typeof window !== 'undefined' ? window : globalThis);
