/* =====================================================================
 * STRATEGY STUDIO — company facts in, framework-by-framework strategy out,
 * then one conclusion across all frameworks.
 *   Inside the claude.ai artifact: Claude writes each analysis (sample capability).
 *   Offline (local file): "Copy prompt" gives the complete prompt for Claude;
 *   paste the JSON answer back with "Import answer".
 * Rules given to Claude: use only the facts entered, label every inference as
 * an assumption, invent no figures, list evidence gaps, challenge the stated
 * objectives. The output is a draft for your judgement, not a decision.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  var FIELDS = [
    ['company', 'Company and what it does', 2], ['industry', 'Industry and segment', 1], ['geography', 'Markets and geography', 1], ['businessModel', 'Business model and revenue streams', 3],
    ['products', 'Products / services and positioning', 3], ['customers', 'Customers and segments (concentration, switching costs)', 3], ['competitors', 'Competitors and market shares', 3],
    ['suppliers', 'Suppliers and key inputs', 2], ['financials', 'Financial snapshot (revenue, margins, growth, debt, cash)', 3], ['capabilities', 'Resources and capabilities (assets, licences, people, technology)', 3],
    ['macro', 'Regulation, macro and political context (inflation, FX, sanctions, pricing rules)', 3], ['recent', 'Recent developments', 2], ['objectives', 'Owners’ objectives and ambition', 2],
    ['constraints', 'Constraints (capital, time, governance, red lines)', 2], ['question', 'The strategic question to answer', 2], ['notes', 'Other notes, raw data, excerpts', 5]
  ];
  var FW = {
    fiveForces: { label: 'Five Forces (Porter)', schema: '{"forces":[{"force":"Threat of new entrants|Supplier power|Buyer power|Threat of substitutes|Rivalry","rating":1-5 (5 = strong force),"drivers":["..."],"evidence":["facts from the input"]}],"industryAttractiveness":"...","implications":["..."]}' },
    pestel: { label: 'PESTEL', schema: '{"factors":[{"dimension":"Political|Economic|Social|Technological|Environmental|Legal","points":["..."],"impact":"high|medium|low","direction":"opportunity|threat"}],"implications":["..."]}' },
    swot: { label: 'SWOT / TOWS', schema: '{"strengths":["..."],"weaknesses":["..."],"opportunities":["..."],"threats":["..."],"tows":{"SO":["use strengths to capture opportunities"],"ST":["..."],"WO":["..."],"WT":["..."]}}' },
    vrio: { label: 'VRIO (resources)', schema: '{"resources":[{"resource":"...","valuable":true,"rare":true,"inimitable":false,"organised":true,"competitiveImplication":"parity|temporary advantage|sustained advantage|disadvantage"}],"implications":["..."]}' },
    ansoff: { label: 'Ansoff growth options', schema: '{"options":[{"quadrant":"Market penetration|Market development|Product development|Diversification","option":"...","rationale":"...","risk":"...","fit":1-5}],"preferred":"..."}' },
    kernel: { label: 'Strategy kernel (Rumelt)', schema: '{"diagnosis":"the critical challenge","guidingPolicy":"...","coherentActions":["..."],"proximateObjective":"...","badStrategyFlags":["fluff, goals mistaken for strategy, etc. found in the stated objectives"]}' },
    blueOcean: { label: 'Blue Ocean (ERRC)', schema: '{"eliminate":["..."],"reduce":["..."],"raise":["..."],"create":["..."],"canvas":[{"factor":"...","industry":0-10,"proposed":0-10}],"tagline":"..."}' },
    valueChain: { label: 'Value chain (Porter)', schema: '{"primary":[{"activity":"Inbound logistics|Operations|Outbound logistics|Marketing & sales|Service","assessment":"...","costOrDifferentiationDriver":"..."}],"support":[{"activity":"Infrastructure|HR|Technology|Procurement","assessment":"..."}],"whereValueIsCreated":["..."],"whereValueLeaks":["..."]}' },
    sevenS: { label: 'McKinsey 7S', schema: '{"elements":[{"element":"Strategy|Structure|Systems|Shared values|Style|Staff|Skills","current":"...","required":"...","gap":"high|medium|low"}],"misalignments":["..."]}' },
    bmc: { label: 'Business Model Canvas', schema: '{"customerSegments":["..."],"valuePropositions":["..."],"channels":["..."],"customerRelationships":["..."],"revenueStreams":["..."],"keyResources":["..."],"keyActivities":["..."],"keyPartners":["..."],"costStructure":["..."],"weakestBlock":"...","redesignIdeas":["..."]}' },
    ptw: { label: 'Playing to Win', schema: '{"winningAspiration":"...","whereToPlay":"...","howToWin":"...","capabilities":["..."],"managementSystems":["..."],"whatMustBeTrue":["..."]}' }
  };
  var COMMON = '"keyFindings":["..."],"strategy":"the strategy this framework points to, 3-6 sentences","assumptions":["inferences you made that the input does not state"],"evidenceGaps":["facts needed to firm this up"],"confidence":"low|medium|high"';
  var CONCL = '{"executiveSummary":"...","analysis":[{"theme":"...","points":["..."]}],"whereFrameworksAgree":["..."],"whereFrameworksDisagree":["..."],"options":[{"name":"...","description":"...","pros":["..."],"cons":["..."],"fit":1-5}],"risks":[{"risk":"...","mitigation":"..."}],"recommendation":"...","scenarios":{"base":"...","upside":"...","downside":"..."},"whatMustBeTrue":["..."],"challengesToTheBrief":["where the stated objectives or assumptions look weak"],"nextActions":[{"action":"...","timing":"..."}],"improvementPlan":[{"initiative":"what to do so the company gets better","problemItSolves":"...","priority":1-5,"impact":"high|medium|low","effort":"high|medium|low","horizon":"0-3 months|3-12 months|1-3 years","kpi":"how success is measured","owner":"role"}],"quickWins":["..."],"stopDoing":["..."],"evidenceGaps":["..."]}';

  function sample() {
    return { version: 1, tool: 'strategy-studio', settings: { lang: 'auto' }, run: Object.keys(FW).reduce(function (o, k) { o[k] = true; return o; }, {}),
      profile: { company: 'Illustrative: mid-sized producer of industrial coatings, family-owned, listed on IFB in 1401.', industry: 'Industrial and protective coatings', geography: 'Iran (85% of sales), Iraq and Afghanistan exports (15%)',
        businessModel: 'B2B sales to contractors and OEMs; 30% through distributors.', products: 'Anti-corrosion coatings, floor coatings; mid-price, technical support included.', customers: 'Top 10 customers = 45% of sales; petrochemical and construction projects.',
        competitors: 'Two large domestic players with ~25% share each; imported premium brands constrained by FX allocation.', suppliers: 'Resins and pigments, 40% imported; FX-sensitive.',
        financials: 'Revenue grew ~35% nominal last year; gross margin fell from 31% to 27%; net debt / EBITDA 1.2x.', capabilities: 'Own lab, 40 technical sales staff, ISO certifications, export licences.',
        macro: 'High inflation, multiple FX rates, import restrictions on raw materials.', recent: 'New plant line commissioned, utilisation 55%.', objectives: 'Double revenue in 3 years and prepare for an IPO on TSE main board.',
        constraints: 'Limited FX access; owners do not want to dilute below 60%.', question: 'Where should the company grow, and what must change before an IPO?', notes: '' },
      results: {}, conclusion: null, sources: {} };
  }
  function blank() { var s = sample(); Object.keys(s.profile).forEach(function (k) { s.profile[k] = ''; }); return s; }
  function profileText(S) { return FIELDS.filter(function (f) { return String(S.profile[f[0]] || '').trim(); }).map(function (f) { return '## ' + f[1] + '\n' + S.profile[f[0]].trim(); }).join('\n\n'); }
  function rules(lang) {
    return ['You are a strategy adviser working for a senior investment banker. Use ONLY the facts in the company profile below.',
      'Mark anything you infer as an assumption and list it under "assumptions". Do not invent numbers, market shares, dates or names.',
      'List the facts that would change the answer under "evidenceGaps". Challenge the owners’ stated objectives where the facts do not support them.',
      'Write ' + (lang === 'fa' ? 'all text values in Persian (Farsi). Keep JSON keys in English.' : 'all text values in English.'),
      'Answer with ONE JSON object and nothing else: no markdown fences, no commentary.'].join('\n');
  }
  function fwPrompt(S, k, lang) {
    var f = FW[k], sch = f.schema.replace(/}$/, ',' + COMMON + '}');
    return rules(lang) + '\n\nFramework: ' + f.label + '\nJSON shape:\n' + sch + '\n\n# Company profile\n' + profileText(S);
  }
  function conclPrompt(S, lang) {
    var res = Object.keys(S.results).filter(function (k) { return S.run[k] && S.results[k] && S.results[k].json; }).map(function (k) { return '### ' + FW[k].label + '\n' + JSON.stringify(S.results[k].json); }).join('\n\n');
    return rules(lang) + '\n\nTask: write the conclusion across ALL framework analyses below. Reconcile them: say where they agree, where they conflict and which view the facts support. Give options, risks, a recommendation, three scenarios, next actions and a prioritised improvement plan (initiatives with impact, effort, horizon, KPI and owner; quick wins; what to stop doing). The final decision stays with the client.\nJSON shape:\n' + CONCL + '\n\n# Company profile\n' + profileText(S) + '\n\n# Framework analyses\n' + res;
  }
  function allPrompt(S, lang) {
    var shapes = Object.keys(FW).filter(function (k) { return S.run[k]; }).map(function (k) { return '"' + k + '": ' + FW[k].schema.replace(/}$/, ',' + COMMON + '}'); }).join(',\n');
    return rules(lang) + '\n\nTask: analyse the company with each framework, then write a conclusion across all of them (agreements, conflicts, options, risks, recommendation, scenarios, next actions, and a prioritised improvement plan with quick wins and what to stop doing).\nJSON shape:\n{"frameworks":{\n' + shapes + '\n},\n"conclusion": ' + CONCL + '}\n\n# Company profile\n' + profileText(S);
  }
  function run(S) {
    var done = Object.keys(FW).filter(function (k) { return S.run[k] && S.results[k] && S.results[k].json; }).length, sel = Object.keys(FW).filter(function (k) { return S.run[k]; }).length;
    var filled = FIELDS.filter(function (f) { return String(S.profile[f[0]] || '').trim(); }).length, c = [];
    if (filled < 6) c.push({ level: 'warning', msg: 'Only ' + filled + ' of ' + FIELDS.length + ' profile fields filled: expect many assumptions in the output.' });
    if (!String(S.profile.question || '').trim()) c.push({ level: 'warning', msg: 'No strategic question set: the conclusion will be generic.' });
    return { done: done, selected: sel, filled: filled, hasConclusion: !!(S.conclusion && S.conclusion.json), checks: c };
  }
  function flatten(obj, pre, out) {
    out = out || [];
    if (Array.isArray(obj)) obj.forEach(function (v, i) { if (v && typeof v === 'object') flatten(v, pre + ' ' + (i + 1), out); else out.push([pre, String(v)]); });
    else if (obj && typeof obj === 'object') Object.keys(obj).forEach(function (k) { flatten(obj[k], pre ? pre + ' › ' + k : k, out); });
    else out.push([pre, obj == null ? '' : String(obj)]);
    return out;
  }
  function build(ExcelJS, S) {
    var X = Hub.xl, b = X.book(ExcelJS);
    var p = b.sheet('Profile', [2, 46, 110]); p.title('Strategy Studio · company profile');
    FIELDS.forEach(function (f, i) { p.put(1, 4 + i, f[1], 'sec'); p.put(2, 4 + i, S.profile[f[0]] || '', 'wrap'); });
    if (S.conclusion && S.conclusion.json) { var c = b.sheet('Conclusion', [2, 46, 110]); c.title('Conclusion across frameworks'); flatten(S.conclusion.json, '').forEach(function (r, i) { c.put(1, 4 + i, r[0]); c.put(2, 4 + i, r[1], 'wrap'); }); }
    Object.keys(FW).forEach(function (k) { var r = S.results[k]; if (!r || !r.json) return; var s = b.sheet(FW[k].label.slice(0, 30), [2, 46, 110]); s.title(FW[k].label); flatten(r.json, '').forEach(function (x, i) { s.put(1, 4 + i, x[0]); s.put(2, 4 + i, x[1], 'wrap'); }); });
    return { wb: b.wb };
  }
  function parseJSON(text) {
    var t = String(text || '').trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
    var i = t.indexOf('{'), j = t.lastIndexOf('}'); if (i < 0 || j < i) throw new Error('No JSON object found');
    return JSON.parse(t.slice(i, j + 1));
  }
  Hub.tools = Hub.tools || {}; Hub.tools.studio = { FW: FW, FIELDS: FIELDS, sample: sample, run: run, build: build, fwPrompt: fwPrompt, conclPrompt: conclPrompt, allPrompt: allPrompt, parseJSON: parseJSON, flatten: flatten };
  if (typeof module !== 'undefined' && module.exports) module.exports = Hub.tools.studio;
  if (!root.document || !Hub.toolkit) return;

  /* ======================= UI ======================= */
  var U = Hub.util, h = U.h, G = Hub.grid, TK = Hub.toolkit;
  var samplerP = null;
  function sampler() { return Hub.ai ? Hub.ai.sampler() : Promise.resolve(null); }
  function lang(S) { return S.settings.lang === 'auto' ? (Hub.i18n && Hub.i18n.lang() === 'fa' ? 'fa' : 'en') : S.settings.lang; }
  var LABELS = { keyFindings: 'Key findings', strategy: 'Strategy this framework points to', assumptions: 'Assumptions made', evidenceGaps: 'Evidence gaps', confidence: 'Confidence', executiveSummary: 'Executive summary', analysis: 'Analysis',
    method: 'Method', theme: 'Theme', points: 'Points', name: 'Name', description: 'Description', pros: 'Pros', cons: 'Cons', mitigation: 'Mitigation', action: 'Action', timing: 'Timing', base: 'Base', upside: 'Upside', downside: 'Downside', quadrant: 'Quadrant', option: 'Option', force: 'Force', rating: 'Rating', drivers: 'Drivers', dimension: 'Dimension', direction: 'Direction', resource: 'Resource', valuable: 'Valuable', rare: 'Rare', inimitable: 'Hard to imitate', organised: 'Organised', competitiveImplication: 'Competitive implication', activity: 'Activity', assessment: 'Assessment', costOrDifferentiationDriver: 'Cost or differentiation driver', element: 'Element', current: 'Current', required: 'Required', gap: 'Gap', factor: 'Factor', industry: 'Industry', proposed: 'Proposed', SO: 'SO', ST: 'ST', WO: 'WO', WT: 'WT', fit: 'Fit', whereFrameworksAgree: 'Where frameworks agree', whereFrameworksDisagree: 'Where frameworks disagree', options: 'Options', risks: 'Risks', recommendation: 'Recommendation', scenarios: 'Scenarios', whatMustBeTrue: 'What must be true',
    challengesToTheBrief: 'Challenges to the brief', nextActions: 'Next actions', forces: 'Forces', factors: 'Factors', implications: 'Implications', industryAttractiveness: 'Industry attractiveness', strengths: 'Strengths', weaknesses: 'Weaknesses',
    opportunities: 'Opportunities', threats: 'Threats', tows: 'TOWS strategies', resources: 'Resources', preferred: 'Preferred option', diagnosis: 'Diagnosis', guidingPolicy: 'Guiding policy', coherentActions: 'Coherent actions',
    proximateObjective: 'Proximate objective', badStrategyFlags: 'Bad-strategy flags', eliminate: 'Eliminate', reduce: 'Reduce', raise: 'Raise', create: 'Create', canvas: 'Strategy canvas', tagline: 'Tagline', winningAspiration: 'Winning aspiration',
    whereToPlay: 'Where to play', howToWin: 'How to win', capabilities: 'Capabilities', managementSystems: 'Management systems',
    improvementPlan: 'Improvement plan (what to do)', quickWins: 'Quick wins', stopDoing: 'Stop doing', initiative: 'Initiative', problemItSolves: 'Problem it solves', priority: 'Priority', impact: 'Impact', effort: 'Effort', horizon: 'Horizon', kpi: 'KPI', owner: 'Owner',
    primary: 'Primary activities', support: 'Support activities', whereValueIsCreated: 'Where value is created', whereValueLeaks: 'Where value leaks', elements: 'Elements', misalignments: 'Misalignments',
    customerSegments: 'Customer segments', valuePropositions: 'Value propositions', channels: 'Channels', customerRelationships: 'Customer relationships', revenueStreams: 'Revenue streams', keyResources: 'Key resources', keyActivities: 'Key activities',
    keyPartners: 'Key partners', costStructure: 'Cost structure', weakestBlock: 'Weakest block', redesignIdeas: 'Redesign ideas',
    overallAssessment: 'Overall assessment', riskRating: 'Risk rating', keyRisks: 'Key risks', area: 'Area', risk: 'Risk', assertion: 'Assertion', why: 'Why', findings: 'Findings', observation: 'Observation', evidence: 'Evidence',
    severity: 'Severity', questionForManagement: 'Question for management', documentsToRequest: 'Documents to request', suggestedRemedy: 'Suggested remedy', adjustmentsToConsider: 'Adjustments to consider', item: 'Item', reason: 'Reason',
    estimatedEffect: 'Estimated effect', goingConcern: 'Going concern', disclosureGaps: 'Disclosure gaps', questionsForManagement: 'Questions for management', nextSteps: 'Next steps',
    diagnosis2: 'Diagnosis', fundingNeed: 'Funding need', recommendedStructure: 'Recommended structure', instruments: 'Instruments', instrument: 'Instrument', fit: 'Fit', amount: 'Amount', tenor: 'Tenor', indicativeCost: 'Indicative cost',
    conditions: 'Conditions', steps: 'Steps', timeline: 'Timeline', alternatives: 'Alternatives', notSuitable: 'Not suitable', preparationsNeeded: 'Preparations needed', roadmap: 'Roadmap', risksAndMitigants: 'Risks and mitigants', mitigation: 'Mitigation', rationale: 'Rationale', regulatoryBasis: 'Regulatory basis', verifyWith: 'Verify with' };
  function render(v, depth) {
    depth = depth || 0;
    if (Array.isArray(v)) {
      if (v.length && v.every(function (x) { return x && typeof x === 'object' && !Array.isArray(x); })) {
        var keys = Object.keys(v.reduce(function (o, x) { Object.keys(x).forEach(function (k) { o[k] = 1; }); return o; }, {}));
        return h('div', { class: 'grid-wrap' }, [h('table', { class: 'grid studio-t' }, [h('thead', null, [h('tr', null, keys.map(function (k) { return h('th', { class: 'lbl', text: LABELS[k] || k }); }))]),
          h('tbody', null, v.map(function (x) { return h('tr', null, keys.map(function (k) { var c = x[k]; return h('td', { class: 'txt' }, [typeof c === 'object' && c !== null ? render(c, depth + 1) : String(c === true ? '✓' : c === false ? '✗' : c == null ? '' : c)]); })); }))])]);
      }
      return h('ul', { class: 'studio-l' }, v.map(function (x) { return h('li', null, [typeof x === 'object' ? render(x, depth + 1) : String(x)]); }));
    }
    if (v && typeof v === 'object') return h('div', { class: 'studio-o' }, Object.keys(v).map(function (k) { return h('div', { class: 'studio-kv' }, [h('h3', { text: LABELS[k] || k }), render(v[k], depth + 1)]); }));
    return h('p', { class: 'studio-p', text: v == null ? '' : String(v) });
  }
  Hub.tools.studio.render = render; Hub.tools.studio.LABELS = LABELS;
  function md(S) {
    var out = ['# Strategy: ' + (S.profile.company || '').split('.')[0]];
    var addObj = function (o) { Hub.tools.studio.flatten(o, '').forEach(function (r) { out.push('- **' + r[0] + '**: ' + r[1]); }); };
    if (S.conclusion && S.conclusion.json) { out.push('\n## Conclusion'); addObj(S.conclusion.json); }
    Object.keys(FW).forEach(function (k) { if (S.results[k] && S.results[k].json) { out.push('\n## ' + FW[k].label); addObj(S.results[k].json); } });
    return out.join('\n');
  }
  // write framework output into the matching framework tools
  function push(S) {
    var r = S.results, n = 0, ff = r.fiveForces && r.fiveForces.json, kn = r.kernel && r.kernel.json, bo = r.blueOcean && r.blueOcean.json, pw = r.ptw && r.ptw.json;
    if (ff && Hub.tools.fiveForces) { var f = U.store.get('hub.ff.v1', null) || Hub.tools.fiveForces.sample(); var map = { 'Threat of new entrants': 'entrants', 'Supplier power': 'suppliers', 'Buyer power': 'buyers', 'Threat of substitutes': 'substitutes', 'Rivalry': 'rivalry' };
      (ff.forces || []).forEach(function (x) { var id = map[x.force] || Object.keys(map).filter(function (k) { return String(x.force).toLowerCase().indexOf(k.split(' ').pop().toLowerCase()) >= 0; }).map(function (k) { return map[k]; })[0]; if (id && f.forces[id]) { f.forces[id].scores.base = Number(x.rating) || f.forces[id].scores.base; f.forces[id].evidence = (x.evidence || []).join(' · '); } });
      f.meta.industry = S.profile.industry || f.meta.industry; f.implications = (ff.implications || []).join('\n'); U.store.set('hub.ff.v1', f); n++; }
    if (kn && Hub.tools.kernel) { var k2 = U.store.get('hub.kernel.v1', null) || Hub.tools.kernel.sample(); k2.diagnosis = kn.diagnosis || ''; k2.policy = kn.guidingPolicy || ''; k2.proximate = kn.proximateObjective || ''; k2.actions = (kn.coherentActions || []).map(function (a) { return { action: a, linked: true, owner: '', resources: '' }; }); k2.meta.title = (S.profile.company || '').split('.')[0]; U.store.set('hub.kernel.v1', k2); n++; }
    if (bo && Hub.tools.blueOcean) { var b2 = U.store.get('hub.blue.v1', null) || Hub.tools.blueOcean.sample(); ['eliminate', 'reduce', 'raise', 'create'].forEach(function (k) { b2.errc[k] = (bo[k] || []).join('\n'); }); b2.factors = (bo.canvas || []).map(function (c) { return { name: c.factor, industry: Number(c.industry) || 0, you: Number(c.proposed) || 0, rival: Number(c.industry) || 0 }; }); b2.tagline = bo.tagline || ''; U.store.set('hub.blue.v1', b2); n++; }
    if (pw && Hub.tools.ptw) { var p2 = U.store.get('hub.ptw.v1', null) || Hub.tools.ptw.sample(); p2.cascade = { aspiration: pw.winningAspiration || '', where: pw.whereToPlay || '', how: pw.howToWin || '', capabilities: [].concat(pw.capabilities || []).join('\n'), systems: [].concat(pw.managementSystems || []).join('\n') };
      p2.wmbt = (pw.whatMustBeTrue || []).map(function (w) { return { condition: w, test: '', status: 'untested' }; }); U.store.set('hub.ptw.v1', p2); n++; }
    return n;
  }

  TK.define({
    id: 'strategy-studio', title: 'Strategy Studio: company text → all frameworks → solutions', sections: ['strategy'], priority: -5, version: 1, storeKey: 'hub.studio.v1',
    summary: 'Write what you know about a company; get the strategy from each framework (Five Forces, PESTEL, SWOT/TOWS, VRIO, value chain, 7S, Business Model Canvas, Ansoff, Rumelt, Blue Ocean, Playing to Win), one conclusion across all of them and a prioritised improvement plan.',
    sample: sample, blank: blank, run: run, scenarios: false,
    headControls: function (ctx, seg) { return [seg('Output language', [['auto', 'Interface'], ['fa', 'فارسی'], ['en', 'English']], ctx.S.settings.lang, function (v) { ctx.S.settings.lang = v; ctx.rerender(); })]; },
    eyebrow: function () { return 'Business strategy · Strategy Studio'; }, heading: function (S) { return (S.profile.company || 'New company').split(/[.:،]/)[0].slice(0, 80); }, filename: function (S) { return 'Strategy_' + (S.profile.company || 'company').split(/[.:,،]/)[0].slice(0, 30); },
    xlsx: function (S) { return build(root.ExcelJS, S).wb; },
    fromCompany: function (S, M, side, rec) {
      var D = Hub.companyData.series(rec || Hub.companyData.get()); if (!D) return false;
      var f = function (x) { return U.fmtNum(x); }, p = function (x) { return isFinite(x) ? U.fmtPct(x) : '–'; }, l = D.n - 1;
      var g = D.revenue.map(function (v, i) { return i && D.revenue[i - 1] ? v / D.revenue[i - 1] - 1 : NaN; }).slice(1);
      var line = D.years.join(' / ') + ' (' + (D.currency || '') + ' ' + (D.unit || '') + '): revenue ' + D.revenue.map(f).join(' / ') + ' (growth ' + g.map(p).join(' / ') + '); gross margin ' + D.gp.map(function (x, i) { return p(x / D.revenue[i]); }).join(' / ') +
        '; EBITDA margin ' + D.ebitda.map(function (x, i) { return p(x / D.revenue[i]); }).join(' / ') + '; net income ' + D.ni.map(f).join(' / ') + '; borrowings ' + f(D.debt[l]) + ', cash ' + f(D.cash[l]) + ', equity ' + f(D.equity[l]) +
        (D.cfo ? '; operating cash flow ' + D.cfo.map(f).join(' / ') : '') + '; receivables ' + f(D.ar[l]) + ', inventory ' + f(D.inv[l]) + '.';
      var cur = S.profile.financials || '', tag = '[' + (M.file || 'statements') + '] ';
      S.profile.financials = (cur ? cur.split('\n').filter(function (x) { return x.indexOf(tag) !== 0; }).join('\n') + '\n' : '') + tag + line;
      return Hub.i18n && Hub.i18n.lang() === 'fa' ? 'خلاصهٔ مالی شرکت به پروفایل اضافه شد.' : 'Financial snapshot added to the profile.';
    },
    kpis: function (ctx) { return [['Profile', function () { return ctx.R.filled + ' / ' + FIELDS.length; }, function () { return 'fields filled'; }], ['Frameworks', function () { return ctx.R.done + ' / ' + ctx.R.selected; }, function () { return 'analysed'; }], ['Conclusion', function () { return ctx.R.hasConclusion ? 'Ready' : '–'; }, function () { return ctx.S.conclusion && ctx.S.conclusion.at ? ctx.S.conclusion.at : 'not generated'; }]]; },
    tabs: [
      { group: 'Inputs', items: [['profile', 'Company profile', function (ctx) {
        var S = ctx.S;
        var pull = h('button', { class: 'btn ghost', type: 'button', text: 'Add financial snapshot from Company Model', onclick: function () {
          var c = U.store.get('hub.company.v1', null); if (!c || !Hub.tools.company) { U.toast('No Company Model saved yet', 'warn'); return; }
          var r = Hub.tools.company.run(c), H = r.H, n = H.n - 1, u = c.meta.currency + ' ' + c.meta.unit + 's', f = function (x) { return U.fmtNum(x); };
          S.profile.financials = (S.profile.financials ? S.profile.financials + '\n' : '') + c.meta.company + ' (' + u + ', ' + c.meta.histYears.join(' / ') + '): revenue ' + H.revenue.map(f).join(' / ') + '; EBITDA margin ' + H.ebitdaMargin.map(function (x) { return U.fmtPct(x); }).join(' / ') +
            '; net income ' + H.ni.map(f).join(' / ') + '; borrowings ' + f(H.debt[n]) + '; cash ' + f(H.cash[n]) + '. Model value per share ' + f(r.V.psBlend) + ' vs price ' + f(c.bridge.price) + '.';
          ctx.rerender();
        } });
        return ctx.group([ctx.panel('What you know about the company', [h('p', { class: 'muted', text: 'Write in Persian or English; paste notes, excerpts or numbers. Empty fields are fine: the analysis lists what is missing.' }),
          h('div', { class: 'studio-fields' }, FIELDS.map(function (f) { return ctx.text('profile.' + f[0], f[1], { rows: f[2], live: true }); })), h('div', { class: 'row-ctl' }, [pull])])]);
      }], ['run', 'Run analysis', function (ctx) {
        var S = ctx.S, st = h('div', { class: 'studio-status', 'aria-live': 'polite' }), busy = false, ctl = null;
        var picks = h('ul', { class: 'cl compact' }, Object.keys(FW).map(function (k) { var id = 'ss-' + k, cb = h('input', { type: 'checkbox', id: id }); cb.checked = !!S.run[k]; cb.addEventListener('change', function () { S.run[k] = cb.checked; ctx.recompute(); });
          return h('li', null, [h('div', { class: 'cl-row' }, [cb, h('label', { for: id, class: 'cl-lbl', text: FW[k].label + (S.results[k] && S.results[k].at ? '  ·  ' + S.results[k].at : '') })])]); }));
        var goBtn = h('button', { class: 'btn primary', type: 'button', text: 'Analyse (AI if connected, else local)' }), stop = h('button', { class: 'btn ghost', type: 'button', text: 'Stop', hidden: true });
        var conBtn = h('button', { class: 'btn', type: 'button', text: 'Write conclusion only' });
        function say(m) { st.textContent = m; }
        function runLocal() {
          // no AI service: the rule-based engine fills the same JSON shapes
          var L = lang(S), at = new Date().toLocaleString() + ' · ' + (L === 'fa' ? 'تحلیل محلی' : 'local'), keys = Object.keys(FW).filter(function (k) { return S.run[k]; });
          keys.forEach(function (k) { S.results[k] = { json: Hub.localAI.strategy(S, k, L), at: at, local: true }; });
          S.conclusion = { json: Hub.localAI.conclusion(S, L), at: at, local: true };
          say(L === 'fa' ? 'تحلیل محلی (قاعده‌محور، بدون هوش مصنوعی) انجام شد. برای تحلیل عمیق‌تر، یک سرویس هوش مصنوعی را در «منابع داده و کلیدها» وصل کنید.' : 'Local rule-based analysis done (no AI). For a deeper analysis, connect an AI service on Data sources & keys.');
          return Promise.resolve();
        }
        var forceLocal = false, wasLocal = false;
        function runAll(onlyConclusion) {
          if (busy) return; busy = true; goBtn.disabled = conBtn.disabled = true; stop.hidden = false; ctl = new AbortController();
          sampler().then(function (sample) {
            if (!sample || sample.manual || forceLocal) { wasLocal = true; return runLocal(); } wasLocal = false;
            var L = lang(S), keys = onlyConclusion ? [] : Object.keys(FW).filter(function (k) { return S.run[k]; }), i = 0;
            function next() {
              if (i >= keys.length) { say('Writing the conclusion across frameworks…'); return sample.json(conclPrompt(S, L), { modelTier: 'complex', signal: ctl.signal }).then(function (j) { S.conclusion = { json: j, at: new Date().toLocaleString() }; }); }
              var k = keys[i++]; say('Analysing: ' + FW[k].label + ' (' + i + ' of ' + keys.length + ')…');
              return sample.json(fwPrompt(S, k, L), { modelTier: 'default', signal: ctl.signal }).then(function (j) { S.results[k] = { json: j, at: new Date().toLocaleString() }; ctx.recompute(); return next(); });
            }
            return next();
          }).then(function () { if (!wasLocal) say('Done. See Framework results and Conclusion.'); U.toast('Strategy analysis complete', 'good'); ctx.recompute(); })
            .catch(function (e) {
              var c = e && e.code;
              say(c === 'offline' ? 'Claude is not reachable from this copy of the hub (it works inside the claude.ai artifact, or here with your Anthropic API key on Data sources & keys). Use "Copy prompt" below, paste it into Claude, then paste the answer into "Import answer".'
                : c === 'not_granted' ? 'Permission to ask Claude was declined for this page view.' : c === 'aborted' ? 'Stopped.' : 'Claude request failed: ' + (e && (e.message || c)));
            }).then(function () { busy = false; goBtn.disabled = conBtn.disabled = false; stop.hidden = true; });
        }
        var locBtn = h('button', { class: 'btn', type: 'button', text: 'Local analysis (no AI)' });
        locBtn.addEventListener('click', function () { forceLocal = true; runAll(false); forceLocal = false; });
        goBtn.addEventListener('click', function () { runAll(false); }); conBtn.addEventListener('click', function () { runAll(true); }); stop.addEventListener('click', function () { if (ctl) ctl.abort(); });
        var copy = h('button', { class: 'btn', type: 'button', text: 'Copy prompt (all frameworks + conclusion)', onclick: function () {
          var p = Hub.tools.studio.allPrompt(S, lang(S));
          if (navigator.clipboard) navigator.clipboard.writeText(p).then(function () { U.toast('Prompt copied: paste it into Claude', 'good'); }, function () { pt.value = p; pt.select(); U.toast('Clipboard blocked: prompt shown below, copy it manually', 'warn'); });
          else { pt.value = p; pt.select(); }
        } });
        var pt = h('textarea', { class: 'f-area', rows: 3, id: 'ss-prompt', placeholder: 'Prompt appears here if the clipboard is blocked', 'aria-label': 'Prompt' });
        var ans = h('textarea', { class: 'f-area', rows: 6, id: 'ss-answer', placeholder: 'Paste Claude’s JSON answer here', 'aria-label': 'Claude answer' });
        var imp = h('button', { class: 'btn', type: 'button', text: 'Import answer', onclick: function () {
          try { var j = Hub.tools.studio.parseJSON(ans.value), at = new Date().toLocaleString(), n = 0;
            if (j.frameworks) Object.keys(j.frameworks).forEach(function (k) { if (FW[k]) { S.results[k] = { json: j.frameworks[k], at: at }; n++; } });
            if (j.conclusion) S.conclusion = { json: j.conclusion, at: at };
            ans.value = ''; ctx.recompute(); U.toast('Imported ' + n + ' framework(s)' + (j.conclusion ? ' and the conclusion' : ''), 'good');
          } catch (e) { U.toast('Could not read the answer: ' + e.message, 'crit'); }
        } });
        sampler().then(function (s) { if (!s) say(lang(S) === 'fa' ? 'هوش مصنوعی وصل نیست: «تحلیل» با موتور محلی (قاعده‌محور) اجرا می‌شود. برای تحلیل عمیق‌تر یک سرویس هوش مصنوعی (Claude، OpenAI-سازگار یا مدل محلی) را در «منابع داده و کلیدها» وصل کنید.' : 'No AI connected: Analyse runs the local rule-based engine. Connect an AI service (Claude, OpenAI-compatible or a local model) on Data sources & keys for a deeper analysis.'); });
        return ctx.group([ctx.panel('Frameworks to run', [picks, h('div', { class: 'row-ctl' }, [goBtn, locBtn, conBtn, stop]), st]),
          ctx.panel('Without the artifact: copy prompt → Claude → import answer', [h('div', { class: 'row-ctl' }, [copy]), pt, ans, h('div', { class: 'row-ctl' }, [imp])])]);
      }]] },
      { group: 'Outputs', items: [['results', 'Framework results', function (ctx) {
        var S = ctx.S, parts = Object.keys(FW).filter(function (k) { return S.results[k] && S.results[k].json; }).map(function (k) { return ctx.panel(FW[k].label, [h('p', { class: 'muted', text: 'Generated ' + S.results[k].at + ' · draft for your judgement' }), render(S.results[k].json)]); });
        var pushBtn = h('button', { class: 'btn', type: 'button', text: 'Send to Five Forces, Kernel, Blue Ocean, Playing to Win tools', onclick: function () { var n = push(S); U.toast(n + ' framework tool(s) updated', 'good'); } });
        return ctx.group([ctx.panel(null, [h('div', { class: 'row-ctl' }, [pushBtn])])].concat(parts.length ? parts : [ctx.panel(null, [h('p', { class: 'muted', text: 'No results yet. Run the analysis or import an answer.' })])]));
      }], ['conclusion', 'Conclusion', function (ctx) {
        var S = ctx.S, c = S.conclusion && S.conclusion.json;
        var copy = h('button', { class: 'btn ghost', type: 'button', text: 'Copy as Markdown', onclick: function () { if (navigator.clipboard) navigator.clipboard.writeText(md(S)).then(function () { U.toast('Copied', 'good'); }, function () { U.toast('Clipboard blocked; use Excel export', 'warn'); }); } });
        return ctx.group([ctx.panel('Conclusion across all frameworks', c ? [h('p', { class: 'muted', text: 'Generated ' + S.conclusion.at + ' · a draft to challenge, not a decision' }), render(c), h('div', { class: 'row-ctl' }, [copy])] : [h('p', { class: 'muted', text: 'Not written yet. Run the analysis or import an answer.' })])]);
      }]] }
    ]
  });
})(typeof window !== 'undefined' ? window : globalThis);
