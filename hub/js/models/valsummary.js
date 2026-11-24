/* =====================================================================
 * VALUATION SUMMARY — every method on one page
 * Pulls low / mid / high equity values from the Company Model, DCF, Comps
 * (LTM and NTM), Precedents, LBO (what a sponsor could pay at target IRRs)
 * and the market (TSETMC price and 52-week range), plus manual methods
 * (NAV, sum-of-the-parts, offers received). Weights are yours.
 * Output: football field, weighted range, implied multiples, and a
 * "what you would have to believe" test of the client's expected value.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {}, F = Hub.fin, num = F.num;
  var COL = { downside: 'low', base: 'mid', upside: 'high' };
  function m(name, link, low, mid, high, w) { return { name: name, link: link, low: low, mid: mid, high: high, weight: w, include: true }; }
  function sample() {
    return { version: 1, tool: 'valsummary', meta: { company: 'Sample Manufacturing Co. (illustrative)', currency: 'IRR', unit: 'billion', asOf: '' }, settings: { scenario: 'base' },
      basis: { sharesMn: 10000, price: 14000, netDebt: 4500, ebitda: 20006, netIncome: 13094 },
      methods: [m('Company model DCF · FCFF', 'companyF', 160000, 214000, 260000, 0.25), m('Company model DCF · FCFE', 'companyE', 120000, 143000, 170000, 0.15), m('Trading comparables (LTM)', 'comps', 110000, 120000, 155000, 0.25), m('Precedent transactions', 'precedents', 120000, 147000, 170000, 0.2),
        m('LBO: sponsor value at 30% / 25% / 20% IRR', 'lbo', 90000, 105000, 125000, 0.15), m('Market: 52-week range and price', 'market', 100000, 140000, 175000, 0), m('Net asset value', null, 0, 0, 0, 0)],
      client: { equity: 250000, label: 'Owner’s expectation' }, sources: {} };
  }
  function blank() { var s = sample(); s.meta.company = 'Company'; s.methods.forEach(function (x) { x.low = x.mid = x.high = 0; }); s.client.equity = 0; return s; }
  function weighted(S, col) {
    var ms = S.methods.filter(function (x) { return x.include !== false && num(x.weight) > 0 && num(x[col]) > 0; }), w = ms.reduce(function (a, x) { return a + num(x.weight); }, 0);
    return w > 0 ? ms.reduce(function (a, x) { return a + num(x.weight) * num(x[col]); }, 0) / w : NaN;
  }
  function run(S) {
    var u = F.UNIT[S.meta.unit] || 1, sh = num(S.basis.sharesMn) * 1e6, ps = function (eq) { return sh > 0 ? eq * u / sh : NaN; }, b = S.basis;
    var W = { low: weighted(S, 'low'), mid: weighted(S, 'mid'), high: weighted(S, 'high') };
    var mult = function (eq) { return { evEbitda: num(b.ebitda) > 0 ? (eq + num(b.netDebt)) / num(b.ebitda) : NaN, pe: num(b.netIncome) > 0 ? eq / num(b.netIncome) : NaN, ps: ps(eq) }; };
    var rows = S.methods.map(function (x) { return { low: ps(num(x.low)), mid: ps(num(x.mid)), high: ps(num(x.high)), used: x.include !== false && num(x.weight) > 0 && num(x.mid) > 0 }; });
    var cv = num(S.client.equity), client = null;
    if (cv > 0) {
      client = { equity: cv, ps: ps(cv), vsMid: cv / W.mid - 1, vsHigh: cv / W.high - 1, implied: mult(cv),
        within: S.methods.filter(function (x) { return x.include !== false && num(x.mid) > 0 && cv >= num(x.low) && cv <= num(x.high); }).map(function (x) { return x.name; }),
        above: S.methods.filter(function (x) { return x.include !== false && num(x.high) > 0 && cv > num(x.high); }).map(function (x) { return x.name; }) };
    }
    var k = COL[S.settings.scenario], checks = [];
    var ws = S.methods.reduce(function (a, x) { return a + (x.include !== false ? num(x.weight) : 0); }, 0);
    if (Math.abs(ws - 1) > 1e-6) checks.push({ level: 'warning', msg: 'Weights of included methods sum to ' + (ws * 100).toFixed(0) + '%; the weighted value renormalises them.' });
    if (client && client.vsHigh > 0) checks.push({ level: 'warning', msg: S.client.label + ' is ' + (client.vsHigh * 100).toFixed(0) + '% above the top of the weighted range. See "What you would have to believe".' });
    S.methods.forEach(function (x) { if (x.include !== false && num(x.mid) > 0 && !(num(x.low) <= num(x.mid) && num(x.mid) <= num(x.high))) checks.push({ level: 'warning', msg: x.name + ': low / mid / high are not in order.' }); });
    return { W: W, Wps: { low: ps(W.low), mid: ps(W.mid), high: ps(W.high) }, implied: { low: mult(W.low), mid: mult(W.mid), high: mult(W.high) }, rows: rows, client: client, sel: W[k], selPs: ps(W[k]), checks: checks };
  }
  function build(ExcelJS, S, R, extra) {
    var X = Hub.xl, L = X.L, b = X.book(ExcelJS), cur = S.meta.currency, ut = cur + ' ' + S.meta.unit + 's';
    var sum = b.sheet('Summary', [2, 46, 16, 16, 16]), A = b.sheet('Assumptions', [2, 46, 10, 16, 16, 16, 10, 10]), C = b.sheet('Calculations', [2, 46, 16, 16, 16]);
    A.title('Assumptions', S.meta.company + ' · ' + ut); var a = {}, r = 4;
    function sc(key, label, unit, v, fmt) { A.put(1, r, label); A.put(2, r, unit, 'unit'); A.put(3, r, v, 'in', fmt); a[key] = A.ref(3, r); r++; }
    A.sec(r++, 'Basis', 7); sc('unit', 'Monetary unit', '', S.meta.unit); sc('sh', 'Diluted shares', 'mn', num(S.basis.sharesMn), 'money2'); sc('px', 'Current share price', cur, num(S.basis.price), 'money2');
    sc('nd', 'Net debt and other claims (EV − equity)', ut, num(S.basis.netDebt), 'money'); sc('eb', 'EBITDA (latest year)', ut, num(S.basis.ebitda), 'money'); sc('ni', 'Net income (latest year)', ut, num(S.basis.netIncome), 'money');
    sc('cv', S.client.label + ' (equity value)', ut, num(S.client.equity), 'money');
    r++; A.sec(r++, 'Methods (equity value, ' + ut + ')', 7, ['Low', 'Mid', 'High', 'Weight', 'Include'], 3);
    var m0 = r;
    S.methods.forEach(function (x) { A.put(1, r, x.name, 'in'); A.put(3, r, num(x.low), 'in', 'money'); A.put(4, r, num(x.mid), 'in', 'money'); A.put(5, r, num(x.high), 'in', 'money'); A.put(6, r, num(x.weight), 'in', 'pct'); A.put(7, r, x.include === false ? 0 : 1, 'in', 'int'); r++; });
    var m1 = r - 1, u = F.unitXl(a.unit), psf = '*' + u + '/(' + a.sh + '*1E6)';
    C.title('Calculations', 'Per-share values, weighted range, client test');
    C.sec(4, 'Value per share (' + cur + ')', 4, ['Low', 'Mid', 'High']);
    S.methods.forEach(function (x, i) { var rr = 5 + i, ar = m0 + i; C.put(1, rr, { f: "='Assumptions'!B" + ar }, 'calc'); ['D', 'E', 'F'].forEach(function (cl, j) { C.put(2 + j + 1, rr, { f: "=IF('Assumptions'!H" + ar + "=1,'Assumptions'!" + cl + ar + psf + ',NA())' }, 'calc', 'money'); }); });
    var rr = 6 + S.methods.length;
    C.sec(rr++, 'Weighted value', 4, ['Low', 'Mid', 'High']);
    var wr = "'Assumptions'!$G$" + m0 + ':$G$' + m1, ir = "'Assumptions'!$H$" + m0 + ':$H$' + m1, rowW = rr;
    C.put(1, rr, 'Weighted equity value', 'total');
    ['D', 'E', 'F'].forEach(function (cl, j) { var vr = "'Assumptions'!$" + cl + '$' + m0 + ':$' + cl + '$' + m1; C.put(3 + j, rr, { f: '=SUMPRODUCT(' + vr + ',' + wr + ',' + ir + ',--(' + vr + '>0))/SUMPRODUCT(' + wr + ',' + ir + ',--(' + vr + '>0))' }, 'total', 'money'); });
    rr++;
    C.put(1, rr, 'Weighted value per share', 'total'); ['D', 'E', 'F'].forEach(function (cl, j) { C.put(3 + j, rr, { f: '=' + cl + rowW + psf }, 'total', 'money'); }); var rowPs = rr; rr++;
    C.put(1, rr, 'Implied EV / EBITDA'); ['D', 'E', 'F'].forEach(function (cl, j) { C.put(3 + j, rr, { f: '=IF(' + a.eb + '>0,(' + cl + rowW + '+' + a.nd + ')/' + a.eb + ',NA())' }, 'calc', 'x'); }); rr++;
    C.put(1, rr, 'Implied P / E'); ['D', 'E', 'F'].forEach(function (cl, j) { C.put(3 + j, rr, { f: '=IF(' + a.ni + '>0,' + cl + rowW + '/' + a.ni + ',NA())' }, 'calc', 'x'); }); rr++;
    C.put(1, rr, 'vs current price'); ['D', 'E', 'F'].forEach(function (cl, j) { C.put(3 + j, rr, { f: '=IF(' + a.px + '>0,' + cl + rowPs + '/' + a.px + '-1,NA())' }, 'calc', 'pct'); }); rr++;
    rr++; C.sec(rr++, S.client.label, 4);
    var cl = {};
    function cr(key, label, f, fmt) { C.put(1, rr, label); C.put(3, rr, { f: f }, 'calc', fmt); cl[key] = '$D$' + rr; rr++; }
    cr('ps', 'Per share', '=' + a.cv + psf, 'money'); cr('vm', 'vs weighted mid', '=' + a.cv + '/E' + rowW + '-1', 'pct'); cr('vh', 'vs weighted high', '=' + a.cv + '/F' + rowW + '-1', 'pct');
    cr('ev', 'Implied EV / EBITDA', '=IF(' + a.eb + '>0,(' + a.cv + '+' + a.nd + ')/' + a.eb + ',NA())', 'x'); cr('pe', 'Implied P / E', '=IF(' + a.ni + '>0,' + a.cv + '/' + a.ni + ',NA())', 'x');
    cr('n', 'Methods whose range contains it', "=SUMPRODUCT(" + ir + ",--('Assumptions'!$D$" + m0 + ':$D$' + m1 + '<=' + a.cv + "),--('Assumptions'!$F$" + m0 + ':$F$' + m1 + '>=' + a.cv + "),--('Assumptions'!$E$" + m0 + ':$E$' + m1 + '>0))', 'int');
    if (extra && extra.believe) {
      rr++; C.sec(rr++, 'What you would have to believe (company model, values at export)', 4);
      extra.believe.forEach(function (x) { C.put(1, rr, x[0]); C.put(3, rr, x[1] == null ? 'not reachable' : x[1], null, x[2]); rr++; });
    }
    sum.title(S.meta.company + ' · Valuation summary', ut + ' · ' + new Date().toISOString().slice(0, 10));
    sum.sec(4, 'Weighted value', 4, ['Low', 'Mid', 'High'], 2);
    sum.put(1, 5, 'Equity value', 'total'); ['D', 'E', 'F'].forEach(function (c2, j) { sum.put(2 + j, 5, { f: "='Calculations'!" + c2 + rowW }, 'total', 'money'); });
    sum.put(1, 6, 'Per share (' + cur + ')', 'total'); ['D', 'E', 'F'].forEach(function (c2, j) { sum.put(2 + j, 6, { f: "='Calculations'!" + c2 + rowPs }, 'total', 'money'); });
    sum.put(1, 8, S.client.label + ' per share'); sum.put(2, 8, { f: "='Calculations'!" + cl.ps }, 'calc', 'money');
    sum.put(1, 9, 'vs weighted high'); sum.put(2, 9, { f: "='Calculations'!" + cl.vh }, 'calc', 'pct');
    X.notes(b, ['Each method gives an equity value range; the weighted value uses included methods with a positive value and weight (weights renormalise).',
      'LBO row: enterprise value at which a sponsor earns 30% / 25% / 20% IRR on the LBO tool’s assumptions, less net debt and other claims.',
      'Market row: 52-week low, current price and 52-week high × diluted shares (TSETMC).', 'Weights are a judgement; record the reasoning in the deal file.'], S.sources);
    return { wb: b.wb };
  }
  Hub.tools = Hub.tools || {}; Hub.tools.valsummary = { sample: sample, blank: blank, run: run, build: build };
  if (typeof module !== 'undefined' && module.exports) module.exports = Hub.tools.valsummary;
  if (!root.document || !Hub.toolkit) return;

  var U = Hub.util, h = U.h, G = Hub.grid, TK = Hub.toolkit;
  function ul(S) { return S.meta.currency + ' ' + F.unitShort(S.meta.unit); }
  function companyState() { return U.store.get('hub.company.v1', null) || Hub.tools.company.sample(); }
  function pull(S, x) {
    var u = F.UNIT[S.meta.unit] || 1;
    function conv(v, fromUnit) { return v * (F.UNIT[fromUnit] || 1) / u; }
    if (x.link === 'company' || x.link === 'companyF' || x.link === 'companyE') { var c = companyState(), r = Hub.tools.company.run(c), vk = x.link === 'companyF' ? 'VF' : x.link === 'companyE' ? 'VE' : 'V';
      return Promise.resolve({ low: conv(r.scen.downside[vk].eqBlend, c.meta.unit), mid: conv(r.scen.base[vk].eqBlend, c.meta.unit), high: conv(r.scen.upside[vk].eqBlend, c.meta.unit), src: 'Company Model' + (vk === 'VF' ? ' · FCFF' : vk === 'VE' ? ' · FCFE' : ' · selected method') }); }
    if (x.link === 'dcf' || x.link === 'dcfF' || x.link === 'dcfE') { var d = U.store.get('hub.dcf.v1', null) || Hub.DCF.sample(), rd = Hub.DCF.engine.run(d), vk = x.link === 'dcfF' ? 'VF' : x.link === 'dcfE' ? 'VE' : 'V';
      return Promise.resolve({ low: conv(rd.scenarios.downside[vk].eqBlend, d.meta.unit), mid: conv(rd.scenarios.base[vk].eqBlend, d.meta.unit), high: conv(rd.scenarios.upside[vk].eqBlend, d.meta.unit), src: 'DCF tool' + (vk === 'V' ? ' · ' + rd.V.cf.toUpperCase() : ' · ' + (vk === 'VF' ? 'FCFF' : 'FCFE')) }); }
    if (x.link === 'comps' || x.link === 'compsNtm') { var p = U.store.get('hub.comps.v1', null) || Hub.tools.comps.sample(), rc = Hub.tools.comps.run(p), per = x.link === 'comps' ? 'Ltm' : 'Ntm';
      return Promise.resolve({ low: conv(rc.blended[per].q1.equity, p.meta.unit), mid: conv(rc.blended[per].median.equity, p.meta.unit), high: conv(rc.blended[per].q3.equity, p.meta.unit), src: 'Comps tool (' + per.toUpperCase() + ')' }); }
    if (x.link === 'precedents') { var q = U.store.get('hub.prec.v1', null) || Hub.tools.precedents.sample(), rp = Hub.tools.precedents.run(q);
      return Promise.resolve({ low: conv(rp.implied.q1.blend.equity, q.meta.unit), mid: conv(rp.implied.median.blend.equity, q.meta.unit), high: conv(rp.implied.q3.blend.equity, q.meta.unit), src: 'Precedents tool' }); }
    if (x.link === 'lbo') {
      var l = U.store.get('hub.lbo.v1', null) || Hub.tools.lbo.sample(), base = JSON.parse(JSON.stringify(l)); base.settings.scenario = 'base';
      var evAt = function (irr) { var em = F.solve(function (e) { var s2 = JSON.parse(JSON.stringify(base)); s2.entry.entryMultiple = e; return Hub.tools.lbo.model(s2).irr - irr; }, 0.5, 40); return em == null ? NaN : em * num(l.entry.ltmEbitda); };
      var nd = num(S.basis.netDebt);
      return Promise.resolve({ low: conv(evAt(0.30), l.meta.unit) - nd, mid: conv(evAt(0.25), l.meta.unit) - nd, high: conv(evAt(0.20), l.meta.unit) - nd, src: 'LBO tool (base case; EV at 30/25/20% IRR less net debt)' });
    }
    if (x.link === 'market') {
      var sym = x.symbol || (S.meta.company.split(' · ')[0]);
      return Hub.data.tse.quote(sym).then(function (qq) { var sh = qq.shares; return { low: (qq.yearLow || qq.price) * sh / u, mid: qq.price * sh / u, high: (qq.yearHigh || qq.price) * sh / u, src: 'TSETMC ' + qq.symbol + ' ' + U.stamp() }; });
    }
    return Promise.reject(new Error('This row has no linked tool; enter values directly.'));
  }
  TK.define({
    id: 'valsummary', title: 'Valuation Summary (all methods)', sections: ['valuation', 'ib', 'ipo', 'buyside', 'sellside'], priority: -2, version: 1, storeKey: 'hub.valsummary.v1',
    summary: 'Company model, DCF, comps, precedents, LBO and market on one football field; weighted range; what the client’s number requires.',
    sample: sample, blank: blank, run: run, scenarios: true,
    eyebrow: function (S) { return 'Valuation · Summary across methods · ' + ul(S); }, heading: function (S) { return S.meta.company; }, filename: function (S) { return S.meta.company + '_ValuationSummary'; },
    xlsx: function (S, R) { return build(root.ExcelJS, S, R, { believe: believeRows(S, R) }).wb; },
    kpis: function (ctx) { var R = function () { return ctx.R; }; return [
      ['Weighted value / share', function () { return U.fmtNum(R().selPs); }, function () { return { downside: 'low end', base: 'mid', upside: 'high end' }[ctx.S.settings.scenario]; }],
      ['Range / share', function () { return U.fmtNum(R().Wps.low) + ' – ' + U.fmtNum(R().Wps.high); }, function () { return 'weighted low to high'; }],
      ['Equity value (mid)', function () { return U.fmtNum(R().W.mid); }, function () { return ul(ctx.S); }],
      ['Implied EV/EBITDA (mid)', function () { return U.fmtX(R().implied.mid.evEbitda); }, function () { return 'P/E ' + U.fmtX(R().implied.mid.pe); }],
      [ctx.S.client.label, function () { return R().client ? U.fmtPct(R().client.vsMid) : '–'; }, function () { return 'vs weighted mid'; }]
    ]; },
    tabs: [
      { group: 'Inputs', items: [['methods', 'Methods', function (ctx) {
        var S = ctx.S, st = h('p', { class: 'muted fetch-status', 'aria-live': 'polite' });
        var lst = ctx.list({ id: 'vs-m', path: 'methods', newRow: function () { return m('Other method', null, 0, 0, 0, 0); }, cols: [
          { key: 'include', label: 'Use', kind: 'bool' }, { key: 'name', label: 'Method', kind: 'text' },
          { key: 'link', label: 'Source', kind: 'select', options: function () { return [['', 'Manual'], ['company', 'Company Model · selected method'], ['companyF', 'Company Model · FCFF'], ['companyE', 'Company Model · FCFE'], ['dcf', 'DCF tool · selected method'], ['dcfF', 'DCF tool · FCFF'], ['dcfE', 'DCF tool · FCFE'], ['comps', 'Comps LTM'], ['compsNtm', 'Comps NTM'], ['precedents', 'Precedents'], ['lbo', 'LBO'], ['market', 'Market (TSETMC)']]; } },
          { key: 'low', label: 'Low' }, { key: 'mid', label: 'Mid' }, { key: 'high', label: 'High' }, { key: 'weight', label: 'Weight', fmt: 'pct' }, { key: 'symbol', label: 'TSE symbol (market row)', kind: 'text' },
          { key: '_ps', label: 'Mid / share', kind: 'calc', calc: function (r, i) { return ctx.R.rows[i] ? ctx.R.rows[i].mid : null; } }],
          rowActions: [{ label: 'Pull', title: 'Pull values from the source tool', run: function (row, i, done) {
            st.textContent = 'Pulling ' + row.name + '…'; st.classList.remove('err');
            pull(S, row).then(function (p) { row.low = p.low; row.mid = p.mid; row.high = p.high; S.sources['methods.' + row.name] = p.src; st.textContent = row.name + ': from ' + p.src + '.'; done(); })
              .catch(function (e) { st.textContent = e.message; st.classList.add('err'); });
          } }],
          extra: function (repaint) { return [h('button', { class: 'btn', type: 'button', text: 'Pull all linked', onclick: function () {
            var rows = S.methods.filter(function (x) { return x.link && x.link !== 'market'; }), errs = [];
            rows.reduce(function (p0, x) { return p0.then(function () { return pull(S, x).then(function (p) { x.low = p.low; x.mid = p.mid; x.high = p.high; S.sources['methods.' + x.name] = p.src; }).catch(function (e) { errs.push(x.name + ': ' + e.message); }); }); }, Promise.resolve())
              .then(function () { repaint(); ctx.recompute(); st.textContent = rows.length - errs.length + ' methods pulled' + (errs.length ? '; ' + errs.join(' | ') : '') + '. Market rows use TSETMC: press Pull on that row.'; });
          } })]; } });
        var basis = G.form({ id: 'vs-b', onChange: ctx.recompute, fields: [
          { key: 'co', label: 'Company', text: true, get: function () { return S.meta.company; }, set: function (v) { S.meta.company = v; ctx.rerender(); } },
          { key: 'un', label: 'Monetary unit', options: F.UNITS, get: function () { return S.meta.unit; }, set: function (v) { S.meta.unit = v; } },
          ctx.field('sh', 'Diluted shares', 'basis.sharesMn', 'dec', { unit: 'mn' }), ctx.field('px', 'Current share price', 'basis.price', 'dec', { unit: S.meta.currency }),
          ctx.field('nd', 'Net debt and other claims', 'basis.netDebt', 'num', { unit: ul(S), help: 'EV − equity. Used for implied EV/EBITDA and to turn the LBO’s EV into equity.' }),
          ctx.field('eb', 'EBITDA (latest year)', 'basis.ebitda', 'num', { unit: ul(S) }), ctx.field('ni', 'Net income (latest year)', 'basis.netIncome', 'num', { unit: ul(S) }),
          { type: 'head', label: 'Client test' },
          { key: 'cl', label: 'Label', text: true, get: function () { return S.client.label; }, set: function (v) { S.client.label = v; } },
          ctx.field('cv', 'Expected equity value', 'client.equity', 'num', { unit: ul(S) })] });
        var fromCo = h('button', { class: 'btn ghost', type: 'button', text: 'Basis from Company Model', onclick: function () {
          var c = companyState(), r = Hub.tools.company.run(c), b = r.V.bridge, n = r.H.n - 1, k = (F.UNIT[c.meta.unit] || 1) / (F.UNIT[S.meta.unit] || 1);
          S.basis.sharesMn = num(c.bridge.sharesMn); S.basis.price = num(c.bridge.price); S.basis.netDebt = -b.adjust * k; S.basis.ebitda = r.H.ebitda[n] * k; S.basis.netIncome = r.H.ni[n] * k;
          S.meta.company = c.meta.company; S.meta.currency = c.meta.currency; ctx.rerender(); U.toast('Basis set from Company Model (' + c.meta.histYears[n] + ')', 'good');
        } });
        return ctx.group([ctx.panel('Methods (equity value, ' + ul(S) + ')', [h('p', { class: 'muted', text: 'Low / Mid / High = Downside / Base / Upside of each method. Set the source, then Pull. Manual rows (NAV, sum-of-the-parts, offers received) take values directly.' }), lst, st]),
          ctx.panel('Basis and client test', [basis, h('div', { class: 'row-ctl' }, [fromCo])])]);
      }]] },
      { group: 'Outputs', items: [['ff', 'Football field', function (ctx) {
        var S = ctx.S, cv = h('canvas', { 'aria-label': 'Football field' });
        var t = G.table({ id: 'vs-t', corner: 'Per share (' + S.meta.currency + ')', cols: [{ label: 'Low' }, { label: 'Mid' }, { label: 'High' }, { label: 'Weight' }], rows: S.methods.map(function (x, i) {
          return { label: x.name, cls: x.include === false ? 'ratio' : '', cell: function (c) { return c === 3 ? ctx.calc(function () { return num(S.methods[i].weight); }, 'pct') : ctx.calc(function () { return ctx.R.rows[i][['low', 'mid', 'high'][c]]; }); } };
        }).concat([{ label: 'Weighted', cls: 'total', cell: function (c) { return c === 3 ? null : ctx.calc(function () { return ctx.R.Wps[['low', 'mid', 'high'][c]]; }); } },
          { label: 'Implied EV / EBITDA', cls: 'ratio', cell: function (c) { return c === 3 ? null : ctx.calc(function () { return ctx.R.implied[['low', 'mid', 'high'][c]].evEbitda; }, 'x'); } },
          { label: 'Implied P / E', cls: 'ratio', cell: function (c) { return c === 3 ? null : ctx.calc(function () { return ctx.R.implied[['low', 'mid', 'high'][c]].pe; }, 'x'); } }]) });
        function draw() {
          ctx.charts.forEach(function (c) { c.destroy(); }); ctx.charts.length = 0;
          var rows = S.methods.map(function (x, i) { return x.include !== false && num(x.mid) > 0 ? [x.name, [ctx.R.rows[i].low, ctx.R.rows[i].high]] : null; }).filter(Boolean);
          rows.push(['Weighted range', [ctx.R.Wps.low, ctx.R.Wps.high]]);
          if (ctx.R.client) rows.push([S.client.label, [ctx.R.client.ps * 0.995, ctx.R.client.ps * 1.005]]);
          Hub.footfield(ctx, cv, rows, num(S.basis.price));
        }
        return { el: h('div', { class: 'stack' }, [ctx.panel('Football field · value per share', [h('div', { class: 'chart tall' }, [cv])]), ctx.panel('By method', [t])]), refresh: function () { t.refresh(); draw(); }, after: draw };
      }], ['believe', 'What you would have to believe', function (ctx) {
        var S = ctx.S, box = h('div', { class: 'rev' });
        function paint() {
          U.clear(box); var c = ctx.R.client;
          if (!c) { box.appendChild(h('p', { class: 'muted', text: 'Enter the expected equity value on Methods.' })); return; }
          box.appendChild(h('p', { text: S.client.label + ': ' + U.fmtNum(c.equity) + ' ' + ul(S) + ' = ' + U.fmtNum(c.ps) + ' ' + S.meta.currency + ' per share, ' + U.fmtPct(c.vsMid) + ' vs the weighted mid and ' + U.fmtPct(c.vsHigh) + ' vs the weighted high.' }));
          var rows = believeRows(S, ctx.R);
          box.appendChild(h('dl', { class: 'kv wide' }, rows.reduce(function (a, x) { a.push(h('dt', { text: x[0] })); a.push(h('dd', { text: x[1] == null ? 'not reachable within sensible bounds' : U.fmt(x[1], x[2]) + (x[3] ? '  ·  ' + x[3] : '') })); return a; }, [])));
          box.appendChild(h('p', { class: 'muted', text: 'Inside the range of: ' + (c.within.length ? c.within.join(', ') : 'no method') + '. Above the high end of: ' + (c.above.length ? c.above.join(', ') : 'none') + '.' }));
        }
        paint();
        return { el: ctx.panel('What the client’s number requires', [box]), refresh: paint };
      }]] }
    ]
  });
  // each line: [label, value, fmt, comparison]
  function believeRows(S, R) {
    var c = R.client; if (!c) return [];
    var out = [['Implied EV / EBITDA', c.implied.evEbitda, 'x', 'weighted mid ' + U.fmtX(R.implied.mid.evEbitda)], ['Implied P / E', c.implied.pe, 'x', 'weighted mid ' + U.fmtX(R.implied.mid.pe)]];
    try {
      var cs = companyState(), cr = Hub.tools.company.run(cs), k = (F.UNIT[S.meta.unit] || 1) / (F.UNIT[cs.meta.unit] || 1), im = Hub.tools.company.implied(cs, cr, c.equity * k);
      out.push(['Perpetual growth needed (company model, Gordon)', im.g, 'pct2', 'assumed ' + U.fmtPct(cr.V.g, 2)]);
      out.push(['Discount rate needed (company model, Gordon)', im.wacc, 'pct2', 'used ' + U.fmtPct(cr.V.wacc, 2)]);
      out.push(['Exit multiple needed (company model)', im.mult, 'x', 'assumed ' + U.fmtX(cr.V.mult)]);
    } catch (e) { /* company model not available */ }
    try {
      var p = U.store.get('hub.comps.v1', null) || Hub.tools.comps.sample(), rc = Hub.tools.comps.run(p);
      var mult = c.implied.evEbitda, peers = rc.calcs.map(function (x) { return x.evEbitdaLtm; }).filter(function (x) { return x != null && isFinite(x); });
      if (peers.length && isFinite(mult)) out.push(['Peers trading below that EV/EBITDA (LTM)', peers.filter(function (x) { return x < mult; }).length / peers.length, 'pct', peers.length + ' peers']);
    } catch (e) { /* comps not available */ }
    return out;
  }
})(typeof window !== 'undefined' ? window : globalThis);
