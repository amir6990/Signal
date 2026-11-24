/* AI TEXT HELPERS — shared by the tools that send a prompt to Claude and read back a JSON answer
 * (Strategy Studio, Strict Auditor, Financing): flatten an answer into rows, parse JSON out of a reply, render it as
 * tables / lists, copy a prompt to the clipboard. Moved here from studio.js and auditor.js so that a page can use them
 * without loading those tools; Hub.tools.studio.* and Hub.copyPrompt remain as aliases. */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  var U = Hub.util, h = U && U.h;
  function flatten(obj, pre, out) {
    out = out || [];
    if (Array.isArray(obj)) obj.forEach(function (v, i) { if (v && typeof v === 'object') flatten(v, pre + ' ' + (i + 1), out); else out.push([pre, String(v)]); });
    else if (obj && typeof obj === 'object') Object.keys(obj).forEach(function (k) { flatten(obj[k], pre ? pre + ' › ' + k : k, out); });
    else out.push([pre, obj == null ? '' : String(obj)]);
    return out;
  }
  function parseJSON(text) {
    var t = String(text || '').trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
    var i = t.indexOf('{'), j = t.lastIndexOf('}'); if (i < 0 || j < i) throw new Error('No JSON object found');
    return JSON.parse(t.slice(i, j + 1));
  }
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
  function copyText(t, ta) {
    var fb = function () { ta.value = t; ta.select(); U.toast('Clipboard blocked: the prompt is in the box below, copy it from there', 'warn'); };
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { U.toast('Prompt copied: paste it into Claude', 'good'); }, fb); else fb();
  }
  Hub.aiText = { flatten: flatten, parseJSON: parseJSON, render: render, LABELS: LABELS, copy: copyText };
  Hub.copyPrompt = copyText;
})(typeof window !== 'undefined' ? window : globalThis);
