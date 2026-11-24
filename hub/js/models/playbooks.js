/* =====================================================================
 * DEAL PROCESS PLAYBOOKS — IB, PE, IPO, bond issuance
 * Phase-by-phase checklists with owner, due date and progress. Steps are
 * generic market practice; jurisdiction-specific approvals are named as roles
 * (e.g. "securities regulator") so they hold for Iran (SEO, TSE / IFB) and
 * elsewhere. Add, edit or remove steps to fit a mandate; progress exports to Excel.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};

  var BOOKS = {
    'ib-process': { title: 'IB Deal Process', sections: ['ib'], tracks: {
      sellside: { label: 'Sell-side M&A', phases: [
        ['Preparation', ['Engagement letter signed: scope, fees, exclusivity, tail', 'Kick-off: objectives, timetable, red lines with the owners', 'Financial due diligence and quality of earnings on the company’s side', 'Business plan and model reviewed and stress-tested', 'Valuation range: DCF, comps, precedents (see Valuation tools)', 'Buyer universe: strategics and financial sponsors, with rationale per buyer', 'Teaser (anonymous) and NDA drafted', 'Confidential information memorandum drafted and fact-checked']],
        ['Marketing (first round)', ['Teaser sent; NDAs negotiated and signed', 'CIM and process letter sent', 'Management Q&A handled through a single channel', 'Indicative (non-binding) offers received', 'Offers compared on price, structure, conditions, certainty', 'Shortlist agreed with the client']],
        ['Second round', ['Data room opened and indexed; access log monitored', 'Management presentations and site visits', 'Draft sale and purchase agreement circulated', 'Buyer due diligence questions answered', 'Binding offers with mark-up of the SPA received', 'Preferred bidder selected']],
        ['Negotiation to close', ['SPA negotiated: price mechanism (locked box / completion accounts), warranties, indemnities', 'Regulatory and competition approvals identified and filed', 'Third-party consents (lenders, key contracts)', 'Signing', 'Conditions precedent satisfied', 'Closing, funds flow and post-closing adjustments']]] },
      buyside: { label: 'Buy-side M&A', phases: [
        ['Strategy and screening', ['Acquisition criteria agreed (size, sector, geography, returns)', 'Long list screened; short list with fit rationale', 'Approach strategy per target']],
        ['Evaluation', ['NDA signed; initial information received', 'Valuation and synergies (see DCF, Accretion / Dilution)', 'Indicative offer letter submitted']],
        ['Due diligence and offer', ['Financial, tax, legal, commercial, technical due diligence', 'Integration plan and day-one priorities', 'Financing committed', 'Binding offer and SPA mark-up', 'Board / investment committee approval']],
        ['Close and integrate', ['Signing and approvals', 'Closing', '100-day integration plan launched']]] },
      fundraising: { label: 'Private fundraising', phases: [
        ['Preparation', ['Capital need, use of proceeds and instrument (equity, mezzanine, debt) decided', 'Pre-money valuation range and dilution view', 'Investor deck and model', 'Target investor list with ticket sizes']],
        ['Outreach', ['NDAs and first meetings', 'Data room for interested investors', 'Term sheets received and compared']],
        ['Closing', ['Term sheet signed', 'Investor due diligence', 'Shareholders’ agreement and subscription documents', 'Approvals and registration of the capital increase', 'Funds received']]] } } },
    'pe-process': { title: 'PE Deal Process', sections: ['pe'], tracks: {
      deal: { label: 'Investment process', phases: [
        ['Origination and screening', ['Deal sourced; fit with fund strategy checked', 'Initial screen memo: thesis, risks, indicative returns', 'NDA and initial information']],
        ['First investment committee', ['LBO and returns (see LBO Model)', 'Key diligence questions defined', 'Approval to submit an indicative offer']],
        ['Due diligence', ['Commercial', 'Financial / quality of earnings', 'Tax and legal', 'Management assessment', 'ESG and operational', 'Debt financing terms negotiated']],
        ['Final investment committee and close', ['Final IC memo: thesis, value creation plan, downside case, exit routes', 'Binding offer and SPA', 'Management incentive plan', 'Signing and closing']]] },
      ownership: { label: 'Ownership and exit', phases: [
        ['First 100 days', ['Board and governance set up', 'Reporting pack and KPIs', 'Value creation plan with owners', 'Quick wins delivered']],
        ['Hold period', ['Quarterly valuation of the holding', 'Covenant and liquidity monitoring', 'Add-on acquisition pipeline']],
        ['Exit', ['Exit route chosen: trade sale, secondary, IPO', 'Vendor due diligence', 'Exit process run (see IB Deal Process)']]] } } },
    'ipo-process': { title: 'IPO Process', sections: ['ipo'], tracks: {
      ipo: { label: 'Initial public offering', phases: [
        ['Readiness', ['Board decision and IPO objectives (primary, secondary, both)', 'Audited financial statements for the required periods', 'Corporate governance: board composition, audit committee, internal controls', 'Clean-up: related-party transactions, legal structure, title to assets', 'Advisers appointed: listing adviser, underwriter, lawyers, auditors']],
        ['Regulatory', ['Admission application to the exchange (e.g. TSE or IFB)', 'Registration of the shares with the securities regulator (e.g. SEO)', 'Prospectus / offering document prepared and reviewed', 'Disclosure obligations calendar set up']],
        ['Valuation and marketing', ['Valuation and price range (see IPO Valuation)', 'Analyst and investor presentations', 'Pricing method agreed: book-building or fixed price', 'Market maker and underwriting commitment agreed']],
        ['Offering and listing', ['Subscription period and allocation', 'Final price set', 'First trading day', 'Market-making and stabilisation per agreement']],
        ['Post-listing', ['Periodic reporting and disclosures', 'Investor relations programme', 'Lock-up compliance']]] } } },
    'bond-process': { title: 'Bond Issuance Process', sections: ['bonds'], tracks: {
      bond: { label: 'Bond / sukuk issuance', phases: [
        ['Structuring', ['Funding need, tenor and currency set', 'Instrument chosen (conventional bond or sukuk: murabaha, ijara, musharaka, etc.)', 'Debt capacity and covenants (see Bond Issuance Sizing)', 'Coupon / profit rate benchmarked (see Bond Pricing)']],
        ['Parties', ['Issuer / special purpose vehicle set up where the structure requires one', 'Guarantor or collateral arranged', 'Credit rating obtained where required', 'Trustee (امین) appointed', 'Underwriter (متعهد پذیره‌نویس) and market maker (بازارگردان) appointed', 'Paying agent and sales agent appointed']],
        ['Approval and documentation', ['Board and shareholder approvals', 'Regulator approval and offering document', 'Shariah opinion for sukuk', 'Legal documentation: terms, guarantees, agency agreements']],
        ['Placement and life of the instrument', ['Book-building or fixed-price placement', 'Settlement and listing', 'Coupon / profit payments calendar', 'Covenant compliance reporting', 'Redemption at maturity or call']]] } } }
  };

  // dedicated advisory checklists reuse the IB tracks
  BOOKS['sellside-process'] = { title: 'Sell-side Process', sections: ['sellside'], tracks: { sellside: BOOKS['ib-process'].tracks.sellside } };
  BOOKS['buyside-process'] = { title: 'Buy-side Process', sections: ['buyside'], tracks: { buyside: BOOKS['ib-process'].tracks.buyside } };

  function sampleFor(id) {
    var b = BOOKS[id], tracks = {};
    Object.keys(b.tracks).forEach(function (k) {
      tracks[k] = { phases: b.tracks[k].phases.map(function (p, i) { return { title: p[0], items: p[1].map(function (lab, j) { return { id: k + '-' + i + '-' + j, label: lab, done: false, owner: '', due: '', note: '' }; }) }; }) };
    });
    return { version: 1, tool: id, meta: { deal: 'Mandate name', client: '' }, settings: { track: Object.keys(b.tracks)[0] }, tracks: tracks, notes: '', sources: {} };
  }
  function run(S) {
    var out = {};
    Object.keys(S.tracks).forEach(function (k) {
      var ph = S.tracks[k].phases.map(function (p) { var n = p.items.length, d = p.items.filter(function (x) { return x.done; }).length; return { title: p.title, n: n, done: d, pct: n ? d / n : 0 }; });
      var n = ph.reduce(function (a, p) { return a + p.n; }, 0), d = ph.reduce(function (a, p) { return a + p.done; }, 0);
      out[k] = { phases: ph, n: n, done: d, pct: n ? d / n : 0, current: (ph.find(function (p) { return p.pct < 1; }) || { title: 'Complete' }).title };
    });
    return { tracks: out, checks: [] };
  }
  function build(id, ExcelJS, S, R) {
    var X = Hub.xl, b = X.book(ExcelJS), B = BOOKS[id];
    Object.keys(S.tracks).forEach(function (k) {
      var s = b.sheet(B.tracks[k].label.slice(0, 30), [2, 70, 10, 18, 14, 40]); s.title(B.tracks[k].label + ' · ' + S.meta.deal, S.meta.client);
      var r = 4;
      S.tracks[k].phases.forEach(function (p) {
        s.sec(r, p.title, 5, ['Done', 'Owner', 'Due', 'Note'], 2); var r0 = r + 1; r++;
        p.items.forEach(function (x) { s.put(1, r, x.label); s.put(2, r, x.done ? 1 : 0, 'in', 'int'); s.put(3, r, x.owner || '', 'in'); s.put(4, r, x.due || '', 'in'); s.put(5, r, x.note || '', 'in'); r++; });
        s.put(1, r, 'Phase progress', 'total'); s.put(2, r, { f: '=IFERROR(AVERAGE(C' + r0 + ':C' + (r - 1) + '),0)' }, 'total', 'pct'); r += 2;
      });
    });
    return { wb: b.wb };
  }

  Hub.tools = Hub.tools || {}; Hub.tools.playbooks = { BOOKS: BOOKS, sample: sampleFor, run: run, build: build };
  if (typeof module !== 'undefined' && module.exports) module.exports = Hub.tools.playbooks;
  if (!root.document || !Hub.toolkit) return;

  var U = Hub.util, h = U.h, G = Hub.grid, TK = Hub.toolkit;
  Object.keys(BOOKS).forEach(function (id, n) {
    var B = BOOKS[id];
    TK.define({
      id: id, title: B.title, sections: B.sections, priority: 10 + n, version: 1, storeKey: 'hub.pb.' + id + '.v1',
      summary: 'Phase checklist with owners, due dates and progress: ' + Object.keys(B.tracks).map(function (k) { return B.tracks[k].label; }).join(', ') + '.',
      sample: function () { return sampleFor(id); }, run: run, scenarios: false,
      headControls: function (ctx, seg) { var ks = Object.keys(B.tracks); return ks.length > 1 ? [seg('Track', ks.map(function (k) { return [k, B.tracks[k].label]; }), ctx.S.settings.track, function (v) { ctx.S.settings.track = v; ctx.rerender(); })] : []; },
      eyebrow: function (S) { return B.title + ' · ' + B.tracks[S.settings.track].label; }, heading: function (S) { return S.meta.deal; }, filename: function (S) { return S.meta.deal + '_' + id; },
      xlsx: function (S, R) { return build(id, root.ExcelJS, S, R).wb; },
      kpis: function (ctx) { var T = function () { return ctx.R.tracks[ctx.S.settings.track]; }; return [
        ['Progress', function () { return U.fmtPct(T().pct, 0); }, function () { return T().done + ' of ' + T().n + ' steps'; }],
        ['Current phase', function () { return T().current; }, function () { return B.tracks[ctx.S.settings.track].label; }]]; },
      tabs: [{ group: 'Checklist', items: [['list', 'Steps', function (ctx) {
        var S = ctx.S, k = S.settings.track, tr = S.tracks[k];
        var meta = G.form({ id: id + '-m', onChange: ctx.rerender, fields: [
          { key: 'd', label: 'Mandate / deal', text: true, get: function () { return S.meta.deal; }, set: function (v) { S.meta.deal = v; } },
          { key: 'c', label: 'Client', text: true, get: function () { return S.meta.client; }, set: function (v) { S.meta.client = v; } }] });
        var phases = tr.phases.map(function (p, i) {
          var bar = h('div', { class: 'pbar' }, [h('span')]);
          var paint = function () { var x = ctx.R.tracks[k].phases[i]; bar.firstChild.style.width = (x.pct * 100).toFixed(0) + '%'; bar.title = x.done + ' / ' + x.n; };
          paint();
          var items = p.items.map(function (x) { return { id: x.id, label: x.label }; });
          var st = {}; p.items.forEach(function (x) { st[x.id] = x; });
          var tmpPath = 'tracks.' + k + '.phases.' + i + '._state';
          U.setPath(S, tmpPath, st);
          var cl = ctx.checklist(tmpPath, items);
          var nin = h('input', { class: 'f-text', type: 'text', placeholder: 'Add a step to this phase', id: id + '-add-' + i, 'aria-label': 'New step for ' + p.title });
          var add = h('div', { class: 'row-ctl' }, [nin, h('button', { class: 'btn ghost', type: 'button', text: 'Add step', onclick: function () {
            var lab = nin.value.trim(); if (!lab) return; p.items.push({ id: k + '-' + i + '-x' + Date.now(), label: lab, done: false, owner: '', due: '', note: '' }); ctx.rerender();
          } })]);
          var sec = ctx.panel((i + 1) + ' · ' + p.title, [bar, cl, add]);
          return { el: sec, refresh: paint };
        });
        // keep the _state map out of saved files
        return { el: h('div', { class: 'stack' }, [ctx.panel('Mandate', [meta.el])].concat(phases.map(function (x) { return x.el; })).concat([ctx.panel('Notes', [ctx.text('notes', 'Deal notes', { rows: 4 })])])),
          refresh: function () { phases.forEach(function (x) { x.refresh(); }); } };
      }]] }]
    });
  });
})(typeof window !== 'undefined' ? window : globalThis);
