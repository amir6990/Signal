/* =====================================================================
 * STRATEGY DIAGNOSTICS
 *  Five Forces (Porter, "The Five Competitive Forces That Shape Strategy", HBR 2008)
 *  Strategy kernel (Rumelt, Good Strategy / Bad Strategy, 2011)
 *  Blue Ocean: ERRC grid and strategy canvas (Kim & Mauborgne, Blue Ocean Strategy, 2005)
 *  Playing to Win cascade (Lafley & Martin, Playing to Win, 2013)
 * Scores are your judgement; the tools structure it, keep the evidence next to
 * each score, and export it.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {}, F = Hub.fin, num = F.num;

  /* ---------------- Five Forces ---------------- */
  var FORCES = [
    { id: 'entrants', label: 'Threat of new entrants', drivers: ['Supply-side economies of scale', 'Demand-side benefits of scale (network effects)', 'Customer switching costs', 'Capital requirements', 'Incumbency advantages independent of size', 'Unequal access to distribution channels', 'Restrictive government policy (licences, permits)', 'Expected retaliation by incumbents'] },
    { id: 'suppliers', label: 'Bargaining power of suppliers', drivers: ['Supplier group more concentrated than the industry', 'Suppliers do not depend heavily on this industry', 'High switching costs for industry participants', 'Differentiated supplier products', 'No substitute for what suppliers provide', 'Credible threat of forward integration'] },
    { id: 'buyers', label: 'Bargaining power of buyers', drivers: ['Few buyers or large volumes per buyer', 'Standardised, undifferentiated products', 'Low buyer switching costs', 'Credible threat of backward integration', 'Product is a large share of buyer cost (price sensitivity)', 'Buyer earns low profits or is cash-constrained', 'Product quality matters little to buyer'] },
    { id: 'substitutes', label: 'Threat of substitutes', drivers: ['Attractive price-performance trade-off of substitutes', 'Low buyer cost of switching to substitutes'] },
    { id: 'rivalry', label: 'Rivalry among existing competitors', drivers: ['Numerous or roughly equal competitors', 'Slow industry growth', 'High exit barriers', 'Rivals highly committed beyond economics', 'Nearly identical products, low switching costs', 'High fixed and low marginal costs', 'Capacity added in large increments', 'Perishable product'] },
    { id: 'state', label: 'Context: government and regulation (not a Porter force)', drivers: ['Price controls or mandated pricing', 'Allocation of inputs or FX by the state', 'State-owned competitors', 'Sanctions or trade restrictions'] }
  ];
  function ffSample() {
    var f = {};
    var base = { entrants: [2, 2, 3], suppliers: [3, 3, 4], buyers: [3, 2, 4], substitutes: [2, 2, 3], rivalry: [4, 3, 4], state: [4, 3, 5] };
    FORCES.forEach(function (x) { f[x.id] = { weight: x.id === 'state' ? 0 : 0.2, scores: { base: base[x.id][0], upside: base[x.id][1], downside: base[x.id][2] }, drivers: {}, evidence: '' }; });
    f.rivalry.evidence = 'Illustrative: 6 listed producers, capacity additions in 1404–1405, product largely undifferentiated.';
    return { version: 1, tool: 'five-forces', meta: { industry: 'Industry (illustrative)', scope: '' }, settings: { scenario: 'base' }, forces: f, implications: '', sources: {} };
  }
  function ffRun(S) {
    var out = {}, k = S.settings.scenario;
    ['base', 'upside', 'downside'].forEach(function (s) {
      var w = 0, p = 0; FORCES.forEach(function (x) { var f = S.forces[x.id]; w += num(f.weight); p += num(f.weight) * num(f.scores[s]); });
      out[s] = { pressure: w ? p / w : NaN, attractiveness: w ? 6 - p / w : NaN };
    });
    var c = [], wsum = FORCES.reduce(function (a, x) { return a + num(S.forces[x.id].weight); }, 0);
    if (Math.abs(wsum - 1) > 1e-6) c.push({ level: 'warning', msg: 'Weights sum to ' + (wsum * 100).toFixed(0) + '%; the index normalises them.' });
    FORCES.forEach(function (x) { var f = S.forces[x.id]; if (num(f.weight) > 0 && !String(f.evidence || '').trim()) c.push({ level: 'warning', msg: x.label + ': score has no evidence recorded.' }); });
    return { scen: out, cur: out[k], checks: c };
  }
  function ffBuild(ExcelJS, S) {
    var X = Hub.xl, b = X.book(ExcelJS), s = b.sheet('Assessment', [2, 50, 10, 10, 10, 10, 60]);
    s.title('Five Forces · ' + S.meta.industry, '1 = weak force (attractive) … 5 = strong force (unattractive)');
    s.sec(4, 'Force', 6, ['Weight', 'Base', 'Upside', 'Downside', 'Evidence'], 2);
    FORCES.forEach(function (x, i) { var f = S.forces[x.id], r = 5 + i; s.put(1, r, x.label); s.put(2, r, num(f.weight), 'in', 'pct'); ['base', 'upside', 'downside'].forEach(function (k, j) { s.put(3 + j, r, num(f.scores[k]), 'in', 'int'); }); s.put(6, r, f.evidence || '', 'wrap'); });
    var r1 = 4 + FORCES.length;
    s.put(1, r1 + 1, 'Weighted pressure (1–5)', 'total'); ['D', 'E', 'F'].forEach(function (cl, j) { s.put(3 + j, r1 + 1, { f: '=SUMPRODUCT($C$5:$C$' + r1 + ',' + cl + '5:' + cl + r1 + ')/SUM($C$5:$C$' + r1 + ')' }, 'total', 'dec'); });
    s.put(1, r1 + 2, 'Attractiveness (6 − pressure)', 'total'); ['D', 'E', 'F'].forEach(function (cl, j) { s.put(3 + j, r1 + 2, { f: '=6-' + cl + (r1 + 1) }, 'total', 'dec'); });
    var d = b.sheet('Drivers', [2, 50, 60, 10]); d.title('Drivers ticked as present'); var r = 4;
    FORCES.forEach(function (x) { d.put(1, r++, x.label, 'sec'); x.drivers.forEach(function (dr, j) { d.put(1, r, dr); d.put(3, r, S.forces[x.id].drivers[j] ? 'Present' : '—'); r++; }); });
    var n = b.sheet('Implications', [2, 120]); n.title('Implications'); n.put(1, 4, S.implications || '—', 'wrap');
    return { wb: b.wb };
  }

  /* ---------------- Rumelt kernel ---------------- */
  var BAD = [['fluff', 'Fluff: restates the obvious in grand language'], ['challenge', 'Fails to face the challenge: the obstacle is not defined'], ['goals', 'Mistakes goals for strategy: ambition without a way'], ['objectives', 'Bad strategic objectives: a long list, or blue-sky aims that do not address the challenge']];
  function kSample() {
    return { version: 1, tool: 'kernel', meta: { title: 'Strategy (illustrative)' }, settings: {},
      diagnosis: 'Illustrative: margins are squeezed because input prices float with the FX rate while output prices are capped; working capital absorbs most operating cash.',
      policy: 'Illustrative: compete on cost-to-serve in two regional markets, and shift the mix toward uncapped export products.',
      proximate: 'Illustrative: cut cash conversion cycle by 30 days within 12 months.',
      actions: [{ action: 'Renegotiate supplier terms to match customer terms', linked: true, owner: 'CFO', resources: 'Treasury team' }, { action: 'Close two loss-making SKUs', linked: true, owner: 'COO', resources: '' }, { action: 'Launch brand campaign', linked: false, owner: '', resources: '' }],
      bad: {}, sources: {} };
  }
  function kRun(S) {
    var n = S.actions.length, linked = S.actions.filter(function (a) { return a.linked; }).length, flags = BAD.filter(function (b) { return S.bad[b[0]]; }).length, c = [];
    if (!String(S.diagnosis).trim()) c.push({ level: 'critical', msg: 'No diagnosis: without a defined challenge there is no strategy.' });
    if (n && linked / n < 1) c.push({ level: 'warning', msg: (n - linked) + ' action(s) not linked to the guiding policy. Cut them or explain them.' });
    if (flags) c.push({ level: 'warning', msg: flags + ' bad-strategy hallmark(s) ticked.' });
    return { coherence: n ? linked / n : NaN, flags: flags, checks: c };
  }
  function kBuild(ExcelJS, S, R) {
    var X = Hub.xl, b = X.book(ExcelJS), s = b.sheet('Kernel', [2, 30, 90]);
    s.title('Strategy kernel · ' + S.meta.title, 'Rumelt: diagnosis, guiding policy, coherent actions');
    [['Diagnosis', S.diagnosis], ['Guiding policy', S.policy], ['Proximate objective', S.proximate]].forEach(function (x, i) { s.put(1, 4 + i, x[0], 'sec'); s.put(2, 4 + i, x[1] || '', 'wrap'); });
    var a = b.sheet('Actions', [2, 60, 10, 20, 30]); a.title('Coherent actions'); a.sec(3, 'Action', 4, ['Linked', 'Owner', 'Resources'], 2);
    S.actions.forEach(function (x, i) { a.put(1, 4 + i, x.action); a.put(2, 4 + i, x.linked ? 1 : 0, 'in', 'int'); a.put(3, 4 + i, x.owner || ''); a.put(4, 4 + i, x.resources || ''); });
    var r = 5 + S.actions.length; a.put(1, r, 'Coherence (share of actions linked to policy)', 'total'); a.put(2, r, { f: '=IFERROR(AVERAGE(C4:C' + (r - 2) + '),0)' }, 'total', 'pct');
    var f = b.sheet('Red flags', [2, 80, 12]); f.title('Bad-strategy hallmarks');
    BAD.forEach(function (x, i) { f.put(1, 4 + i, x[1]); f.put(2, 4 + i, S.bad[x[0]] ? 'Present' : '—'); });
    return { wb: b.wb };
  }

  /* ---------------- Blue Ocean ---------------- */
  function bSample() {
    return { version: 1, tool: 'blue-ocean', meta: { title: 'Offering (illustrative)' }, settings: {},
      errc: { eliminate: 'Illustrative: dealer layer for large accounts', reduce: 'Product range breadth', raise: 'Delivery reliability, payment-term flexibility', create: 'Online order tracking and statement portal' },
      factors: [{ name: 'Price', industry: 6, you: 5, rival: 6 }, { name: 'Product range', industry: 8, you: 5, rival: 7 }, { name: 'Delivery reliability', industry: 4, you: 9, rival: 5 },
        { name: 'Payment terms', industry: 3, you: 8, rival: 4 }, { name: 'Brand advertising', industry: 7, you: 3, rival: 6 }, { name: 'Digital ordering', industry: 1, you: 8, rival: 2 }],
      tagline: 'Illustrative: "On time, every time, on terms that fit your cash cycle."', checks3: {}, sources: {} };
  }
  function bRun(S) {
    var diff = S.factors.map(function (f) { return num(f.you) - num(f.industry); });
    var div = diff.reduce(function (a, d) { return a + Math.abs(d); }, 0) / Math.max(1, diff.length), c = [];
    if (div < 1.5) c.push({ level: 'warning', msg: 'Your curve sits close to the industry curve (average gap ' + div.toFixed(1) + '): little divergence.' });
    ['eliminate', 'reduce', 'raise', 'create'].forEach(function (k) { if (!String(S.errc[k] || '').trim()) c.push({ level: 'warning', msg: 'ERRC "' + k + '" is empty.' }); });
    return { diff: diff, divergence: div, checks: c };
  }
  function bBuild(ExcelJS, S) {
    var X = Hub.xl, b = X.book(ExcelJS), e = b.sheet('ERRC', [2, 20, 100]); e.title('Four actions · ' + S.meta.title);
    ['eliminate', 'reduce', 'raise', 'create'].forEach(function (k, i) { e.put(1, 4 + i, k[0].toUpperCase() + k.slice(1), 'sec'); e.put(2, 4 + i, S.errc[k] || '', 'wrap'); });
    e.put(1, 9, 'Tagline', 'sec'); e.put(2, 9, S.tagline || '', 'wrap');
    var c = b.sheet('Strategy canvas', [2, 30, 12, 12, 12, 12]); c.title('Strategy canvas (0–10)'); c.sec(3, 'Factor', 5, ['Industry', 'You', 'Main rival', 'You − industry'], 2);
    S.factors.forEach(function (f, i) { var r = 4 + i; c.put(1, r, f.name); c.put(2, r, num(f.industry), 'in', 'int'); c.put(3, r, num(f.you), 'in', 'int'); c.put(4, r, num(f.rival), 'in', 'int'); c.put(5, r, { f: '=D' + r + '-C' + r }, 'calc', 'int'); });
    return { wb: b.wb };
  }

  /* ---------------- Playing to Win ---------------- */
  var PTW = [['aspiration', 'What is our winning aspiration?'], ['where', 'Where will we play?'], ['how', 'How will we win?'], ['capabilities', 'What capabilities must be in place?'], ['systems', 'What management systems are required?']];
  function pSample() {
    return { version: 1, tool: 'playing-to-win', meta: { title: 'Business unit (illustrative)' }, settings: {},
      cascade: { aspiration: 'Illustrative: be the lowest delivered-cost supplier to industrial buyers in the north-west.', where: 'Industrial buyers within 400 km; two product families; direct sales above a volume threshold.', how: 'Cost leadership through logistics density and working-capital terms competitors cannot match.', capabilities: 'Route planning, credit underwriting of customers, procurement hedging.', systems: 'Weekly cost-to-serve dashboard, customer credit committee, procurement KPIs.' },
      wmbt: [{ condition: 'Buyers value delivery reliability over price by at least 3%', test: 'Win-loss interviews with 20 buyers', status: 'untested' }, { condition: 'We can hold a cost-to-serve advantage of 8% for 3 years', test: 'Benchmark vs two rivals’ disclosed logistics costs', status: 'untested' }],
      consistency: {}, sources: {} };
  }
  var CONS = [['c1', 'Where-to-play and how-to-win reinforce each other'], ['c2', 'Capabilities named are the ones how-to-win actually requires'], ['c3', 'Management systems measure the capabilities, not generic KPIs'], ['c4', 'The aspiration is specific enough to say no to something'], ['c5', 'Choices are explicit about where we will not play']];
  function pRun(S) {
    var empty = PTW.filter(function (q) { return !String(S.cascade[q[0]] || '').trim(); }).length, ok = CONS.filter(function (c) { return S.consistency[c[0]]; }).length, tested = S.wmbt.filter(function (w) { return w.status === 'confirmed'; }).length, c = [];
    if (empty) c.push({ level: 'warning', msg: empty + ' cascade box(es) empty.' });
    if (ok < CONS.length) c.push({ level: 'warning', msg: (CONS.length - ok) + ' consistency check(s) not yet confirmed.' });
    if (S.wmbt.some(function (w) { return w.status === 'failed'; })) c.push({ level: 'critical', msg: 'A "what must be true" condition failed its test: revisit the choice.' });
    return { consistency: ok / CONS.length, tested: tested, checks: c };
  }
  function pBuild(ExcelJS, S) {
    var X = Hub.xl, b = X.book(ExcelJS), s = b.sheet('Cascade', [2, 42, 100]); s.title('Playing to Win · ' + S.meta.title);
    PTW.forEach(function (q, i) { s.put(1, 4 + i, q[1], 'sec'); s.put(2, 4 + i, S.cascade[q[0]] || '', 'wrap'); });
    var w = b.sheet('What must be true', [2, 60, 50, 14]); w.title('What must be true'); w.sec(3, 'Condition', 4, ['Test', 'Status'], 2);
    S.wmbt.forEach(function (x, i) { w.put(1, 4 + i, x.condition, 'wrap'); w.put(2, 4 + i, x.test, 'wrap'); w.put(3, 4 + i, x.status); });
    var c = b.sheet('Consistency', [2, 80, 12]); c.title('Consistency checks'); CONS.forEach(function (x, i) { c.put(1, 4 + i, x[1]); c.put(2, 4 + i, S.consistency[x[0]] ? 'Confirmed' : '—'); });
    return { wb: b.wb };
  }

  Hub.tools = Hub.tools || {};
  Hub.tools.fiveForces = { sample: ffSample, run: ffRun, build: ffBuild }; Hub.tools.kernel = { sample: kSample, run: kRun, build: kBuild };
  Hub.tools.blueOcean = { sample: bSample, run: bRun, build: bBuild }; Hub.tools.ptw = { sample: pSample, run: pRun, build: pBuild };
  if (typeof module !== 'undefined' && module.exports) module.exports = Hub.tools;
  if (!root.document || !Hub.toolkit) return;

  var U = Hub.util, h = U.h, G = Hub.grid, TK = Hub.toolkit;
  function titleForm(ctx, path, label) { return G.form({ id: ctx.S.tool + '-ti', onChange: ctx.rerender, fields: [{ key: 't', label: label, text: true, get: function () { return U.getPath(ctx.S, path); }, set: function (v) { U.setPath(ctx.S, path, v); } }] }); }
  function copyMd(md) { return h('button', { class: 'btn ghost', type: 'button', text: 'Copy as Markdown', onclick: function () {
    var txt = md(); if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { U.toast('Copied', 'good'); }, function () { U.toast('Clipboard blocked; use the Excel export', 'warn'); });
  } }); }

  TK.define({
    id: 'five-forces', title: 'Five Forces', sections: ['strategy'], priority: 1, version: 1, storeKey: 'hub.ff.v1',
    summary: 'Weighted force scores with Porter’s drivers, evidence per score, current vs upside vs downside industry states.',
    sample: ffSample, run: ffRun, scenarios: true,
    eyebrow: function () { return 'Business strategy · Industry structure'; }, heading: function (S) { return S.meta.industry; }, filename: function (S) { return S.meta.industry + '_FiveForces'; },
    xlsx: function (S, R) { return ffBuild(root.ExcelJS, S, R).wb; },
    kpis: function (ctx) { return [
      ['Attractiveness', function () { return U.fmt(ctx.R.cur.attractiveness, 'dec'); }, function () { return '1 low … 5 high · ' + ctx.S.settings.scenario; }],
      ['Weighted pressure', function () { return U.fmt(ctx.R.cur.pressure, 'dec'); }, function () { return '1 weak … 5 strong forces'; }],
      ['Range across states', function () { return U.fmt(ctx.R.scen.downside.attractiveness, 'dec') + ' – ' + U.fmt(ctx.R.scen.upside.attractiveness, 'dec'); }, function () { return 'downside to upside'; }]
    ]; },
    tabs: [{ group: 'Assessment', items: [['forces', 'Forces', function (ctx) {
      var S = ctx.S;
      var t = G.table({ id: 'ff-t', corner: '1 weak … 5 strong', cols: [{ label: 'Weight' }].concat(ctx.scenCols()), onChange: ctx.recompute, rows: FORCES.map(function (x) {
        return { label: x.label, cell: function (c) { return c === 0 ? ctx.inVal('forces.' + x.id + '.weight', 'pct') : ctx.inVal('forces.' + x.id + '.scores.' + ctx.scenKey(c - 1), 'dec'); } };
      }).concat([{ label: 'Weighted pressure', cls: 'total', cell: function (c) { return c ? ctx.calc(function () { return ctx.R.scen[ctx.scenKey(c - 1)].pressure; }, 'dec') : null; } },
        { label: 'Attractiveness (6 − pressure)', cls: 'total', cell: function (c) { return c ? ctx.calc(function () { return ctx.R.scen[ctx.scenKey(c - 1)].attractiveness; }, 'dec') : null; } }]) });
      var cv = h('canvas', { 'aria-label': 'Force radar' });
      function draw() {
        ctx.charts.forEach(function (c) { c.destroy(); }); ctx.charts.length = 0;
        var fs = FORCES.filter(function (x) { return num(S.forces[x.id].weight) > 0; });
        ctx.chart(cv, { type: 'radar', data: { labels: fs.map(function (x) { return x.label.replace('Bargaining power of ', '').replace('Threat of ', ''); }), datasets: ['base', 'upside', 'downside'].map(function (k, i) {
          var col = [ctx.css('--accent'), ctx.css('--good'), ctx.css('--crit')][i]; return { label: k, data: fs.map(function (x) { return num(S.forces[x.id].scores[k]); }), borderColor: col, backgroundColor: 'transparent', pointBackgroundColor: col }; }) },
          options: { maintainAspectRatio: false, animation: false, scales: { r: { min: 0, max: 5, ticks: { stepSize: 1, backdropColor: 'transparent' }, grid: { color: ctx.css('--line') }, angleLines: { color: ctx.css('--line') } } }, plugins: { legend: { position: 'bottom' } } } });
      }
      var details = FORCES.map(function (x) {
        var f = S.forces[x.id];
        var drv = h('ul', { class: 'cl compact' }, x.drivers.map(function (d, j) {
          var id = 'ff-' + x.id + '-' + j, cb = h('input', { type: 'checkbox', id: id }); cb.checked = !!f.drivers[j];
          cb.addEventListener('change', function () { f.drivers[j] = cb.checked; ctx.recompute(); });
          return h('li', null, [h('div', { class: 'cl-row' }, [cb, h('label', { for: id, class: 'cl-lbl', text: d })])]);
        }));
        return ctx.panel(x.label, [h('p', { class: 'muted', text: 'Tick the drivers present; record the evidence behind the score.' }), drv, ctx.text('forces.' + x.id + '.evidence', 'Evidence', { rows: 2, live: true })]);
      });
      return { el: h('div', { class: 'stack' }, [ctx.panel('Industry', [titleForm(ctx, 'meta.industry', 'Industry / segment').el]), ctx.two(ctx.panel('Scores', [t]), ctx.panel('Profile', [h('div', { class: 'chart tall' }, [cv])]))].concat(details).concat([ctx.panel('Implications for strategy', [ctx.text('implications', 'So what?', { rows: 4 })])])),
        refresh: function () { t.refresh(); draw(); }, after: draw };
    }]] }]
  });

  TK.define({
    id: 'kernel', title: 'Strategy Kernel (Rumelt)', sections: ['strategy'], priority: 2, version: 1, storeKey: 'hub.kernel.v1',
    summary: 'Diagnosis, guiding policy, coherent actions, proximate objective, bad-strategy red flags.',
    sample: kSample, run: kRun, scenarios: false,
    eyebrow: function () { return 'Business strategy · Good Strategy / Bad Strategy'; }, heading: function (S) { return S.meta.title; }, filename: function (S) { return S.meta.title + '_Kernel'; },
    xlsx: function (S, R) { return kBuild(root.ExcelJS, S, R).wb; },
    kpis: function (ctx) { return [['Coherence', function () { return U.fmtPct(ctx.R.coherence, 0); }, function () { return 'actions linked to the policy'; }], ['Red flags', function () { return String(ctx.R.flags); }, function () { return 'of ' + BAD.length + ' hallmarks'; }]]; },
    tabs: [{ group: 'Kernel', items: [['k', 'Kernel', function (ctx) {
      var S = ctx.S;
      var acts = ctx.list({ id: 'kn-a', path: 'actions', newRow: function () { return { action: '', linked: true, owner: '', resources: '' }; }, cols: [
        { key: 'action', label: 'Action', kind: 'text' }, { key: 'linked', label: 'Serves policy', kind: 'bool' }, { key: 'owner', label: 'Owner', kind: 'text' }, { key: 'resources', label: 'Resources committed', kind: 'text' }] });
      var bad = h('ul', { class: 'cl' }, BAD.map(function (b) {
        var id = 'kn-b-' + b[0], cb = h('input', { type: 'checkbox', id: id }); cb.checked = !!S.bad[b[0]];
        cb.addEventListener('change', function () { S.bad[b[0]] = cb.checked; ctx.recompute(); });
        return h('li', null, [h('div', { class: 'cl-row' }, [cb, h('label', { for: id, class: 'cl-lbl', text: b[1] })])]);
      }));
      var md = function () { return '# ' + S.meta.title + '\n\n## Diagnosis\n' + S.diagnosis + '\n\n## Guiding policy\n' + S.policy + '\n\n## Proximate objective\n' + S.proximate + '\n\n## Coherent actions\n' + S.actions.map(function (a) { return '- ' + a.action + (a.owner ? ' (' + a.owner + ')' : '') + (a.linked ? '' : ' [not linked]'); }).join('\n'); };
      return ctx.group([ctx.panel('Strategy', [titleForm(ctx, 'meta.title', 'Title'), copyMd(md)]),
        ctx.panel('1 · Diagnosis', [ctx.text('diagnosis', 'What is going on? Name the critical challenge.', { rows: 4, live: true })]),
        ctx.panel('2 · Guiding policy', [ctx.text('policy', 'The overall approach chosen to cope with the obstacles in the diagnosis.', { rows: 3, live: true })]),
        ctx.panel('Proximate objective', [ctx.text('proximate', 'A target close enough to be feasible and clear enough to act on.', { rows: 2 })]),
        ctx.panel('3 · Coherent actions', [acts]), ctx.panel('Bad-strategy red flags', [bad])]);
    }]] }]
  });

  TK.define({
    id: 'blue-ocean', title: 'Blue Ocean (ERRC & canvas)', sections: ['strategy'], priority: 3, version: 1, storeKey: 'hub.blue.v1',
    summary: 'Eliminate / Reduce / Raise / Create grid and strategy canvas against the industry and a main rival.',
    sample: bSample, run: bRun, scenarios: false,
    eyebrow: function () { return 'Business strategy · Value innovation'; }, heading: function (S) { return S.meta.title; }, filename: function (S) { return S.meta.title + '_BlueOcean'; },
    xlsx: function (S, R) { return bBuild(root.ExcelJS, S, R).wb; },
    kpis: function (ctx) { return [['Divergence', function () { return U.fmt(ctx.R.divergence, 'dec'); }, function () { return 'average |you − industry| on 0–10'; }]]; },
    tabs: [{ group: 'Canvas', items: [['c', 'ERRC & canvas', function (ctx) {
      var S = ctx.S;
      var grid = h('div', { class: 'errc' }, [['eliminate', 'Eliminate', 'Which factors the industry takes for granted should be eliminated?'], ['reduce', 'Reduce', 'Which factors should be reduced well below the industry standard?'], ['raise', 'Raise', 'Which factors should be raised well above the industry standard?'], ['create', 'Create', 'Which factors should be created that the industry has never offered?']]
        .map(function (x) { return h('div', { class: 'errc-cell' }, [ctx.text('errc.' + x[0], x[1], { rows: 4, help: x[2], live: true })]); }));
      var lst = ctx.list({ id: 'bo-f', path: 'factors', newRow: function () { return { name: '', industry: 5, you: 5, rival: 5 }; }, cols: [
        { key: 'name', label: 'Competing factor', kind: 'text' }, { key: 'industry', label: 'Industry (0–10)', fmt: 'dec' }, { key: 'you', label: 'You', fmt: 'dec' }, { key: 'rival', label: 'Main rival', fmt: 'dec' }],
        onChange: function () { ctx.recompute(); draw(); } });
      var cv = h('canvas', { 'aria-label': 'Strategy canvas' });
      function draw() {
        ctx.charts.forEach(function (c) { c.destroy(); }); ctx.charts.length = 0;
        ctx.chart(cv, { type: 'line', data: { labels: S.factors.map(function (f) { return f.name; }), datasets: [['industry', 'Industry', '--muted'], ['you', 'You', '--accent'], ['rival', 'Main rival', '--accent-2']].map(function (d) {
          return { label: d[1], data: S.factors.map(function (f) { return num(f[d[0]]); }), borderColor: ctx.css(d[2]), backgroundColor: ctx.css(d[2]), tension: 0.2, borderWidth: d[0] === 'you' ? 3 : 1.5 }; }) },
          options: { maintainAspectRatio: false, animation: false, scales: { y: { min: 0, max: 10, grid: { color: ctx.css('--line') } }, x: { grid: { display: false } } }, plugins: { legend: { position: 'bottom' } } } });
      }
      var tl = h('ul', { class: 'cl' }, [['focus', 'Focus: the curve does not try to excel on every factor'], ['divergence', 'Divergence: the curve departs from the industry and the rival'], ['tagline', 'Compelling tagline: one honest line a buyer would repeat']].map(function (x) {
        var id = 'bo-' + x[0], cb = h('input', { type: 'checkbox', id: id }); cb.checked = !!S.checks3[x[0]];
        cb.addEventListener('change', function () { S.checks3[x[0]] = cb.checked; ctx.recompute(); });
        return h('li', null, [h('div', { class: 'cl-row' }, [cb, h('label', { for: id, class: 'cl-lbl', text: x[1] })])]);
      }));
      return { el: h('div', { class: 'stack' }, [ctx.panel('Offering', [titleForm(ctx, 'meta.title', 'Offering').el]), ctx.panel('Four actions', [grid]), ctx.panel('Strategy canvas', [lst, h('div', { class: 'chart tall' }, [cv])]),
        ctx.panel('Test of a good strategy curve', [tl, ctx.text('tagline', 'Tagline', { rows: 2 })])]), refresh: function () { lst.refresh(); draw(); }, after: draw };
    }]] }]
  });

  TK.define({
    id: 'playing-to-win', title: 'Playing to Win', sections: ['strategy'], priority: 4, version: 1, storeKey: 'hub.ptw.v1',
    summary: 'Five-choice cascade, consistency checks, and "what must be true" conditions with tests.',
    sample: pSample, run: pRun, scenarios: false,
    eyebrow: function () { return 'Business strategy · Strategic choice cascade'; }, heading: function (S) { return S.meta.title; }, filename: function (S) { return S.meta.title + '_PlayingToWin'; },
    xlsx: function (S, R) { return pBuild(root.ExcelJS, S, R).wb; },
    kpis: function (ctx) { return [['Consistency', function () { return U.fmtPct(ctx.R.consistency, 0); }, function () { return 'checks confirmed'; }], ['Conditions confirmed', function () { return ctx.R.tested + ' / ' + ctx.S.wmbt.length; }, function () { return 'what must be true'; }]]; },
    tabs: [{ group: 'Cascade', items: [['c', 'Cascade', function (ctx) {
      var S = ctx.S;
      var casc = h('ol', { class: 'cascade' }, PTW.map(function (q) { return h('li', null, [ctx.text('cascade.' + q[0], q[1], { rows: 3, live: true })]); }));
      var cons = h('ul', { class: 'cl' }, CONS.map(function (x) {
        var id = 'pw-' + x[0], cb = h('input', { type: 'checkbox', id: id }); cb.checked = !!S.consistency[x[0]];
        cb.addEventListener('change', function () { S.consistency[x[0]] = cb.checked; ctx.recompute(); });
        return h('li', null, [h('div', { class: 'cl-row' }, [cb, h('label', { for: id, class: 'cl-lbl', text: x[1] })])]);
      }));
      var w = ctx.list({ id: 'pw-w', path: 'wmbt', newRow: function () { return { condition: '', test: '', status: 'untested' }; }, cols: [{ key: 'condition', label: 'What must be true', kind: 'text' }, { key: 'test', label: 'How we will test it', kind: 'text' }, { key: 'status', label: 'Status (untested / confirmed / failed)', kind: 'text' }] });
      return ctx.group([ctx.panel('Unit', [titleForm(ctx, 'meta.title', 'Business / unit').el]), ctx.panel('Choice cascade', [casc]), ctx.panel('Consistency checks', [cons]), ctx.panel('What must be true', [w])]);
    }]] }]
  });
})(typeof window !== 'undefined' ? window : globalThis);
