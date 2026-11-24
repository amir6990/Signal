/* =====================================================================
 * SUITES — overlapping tools merged into one page each (process checklist +
 * roadmap from your guide, or two models of the same question). The member
 * tools keep their own data and Excel; their old addresses open the suite.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub; if (!root.document || !Hub.toolkit) return;
  var S = Hub.toolkit.suite, CK = 'Phase checklist with owners and due dates (tick progress).', RM = 'Step-by-step roadmap with documents, signatures, outputs and checks.';
  S({ id: 'debt-capacity', title: 'Debt & Sukuk Issuance Capacity', sections: ['bonds'], priority: -3, eyebrow: 'Bond issuance · how much can be issued',
    summary: 'SEO originator tests and maximum issue per instrument, plus a covenant-based debt capacity with EBITDA stress, in one place.',
    members: [['sukuk-capacity', 'SEO rules and maximum issue', 'Iran capital-market rules: originator tests, credit routes, capacity per instrument.'], ['issuance', 'Covenant-based debt capacity', 'Generic leverage and coverage covenants, pro forma headroom and EBITDA stress.']] });
  S({ id: 'bond-suite', title: 'Bond Issuance: process and roadmaps', sections: ['bonds'], priority: 3, eyebrow: 'Bond issuance · process',
    summary: 'Process checklist, principle approval, issuance permit and offering, the process card and the contracts — one page.',
    members: [['bond-process', 'Process checklist', CK], ['rm-bond-principle', 'Stage 1: principle approval', RM], ['rm-bond-permit', 'Stage 2: permit and offering', RM], ['rm-bond-card', 'Process card after approval', RM], ['rm-bond-contracts', 'Contracts and forms', RM]] });
  S({ id: 'ipo-suite', title: 'IPO: process and roadmap', sections: ['ipo'], priority: 2, eyebrow: 'IPO · process',
    summary: 'Admission and offering roadmap from your guide, plus the phase checklist.', members: [['rm-ipo', 'Roadmap (your guide)', RM], ['ipo-process', 'Process checklist', CK]] });
  S({ id: 'ma-suite', title: 'M&A deal process: checklist and roadmaps', sections: ['ib'], priority: 0, eyebrow: 'Investment banking · deal process',
    summary: 'One deal checklist (sell-side, buy-side and private fundraising tracks) with the sell-side and buy-side roadmaps.',
    members: [['ib-process', 'Deal checklist (all tracks)', CK + ' Choose the track inside: sell-side, buy-side or fundraising.'], ['rm-sellside', 'Sell-side roadmap', RM], ['rm-buyside', 'Buy-side roadmap', RM]] });
  S({ id: 'pe-suite', title: 'Private equity: process and roadmap', sections: ['pe'], priority: 2, eyebrow: 'Private equity · process',
    summary: 'From origination to exit: roadmap and the deal phase checklist.', members: [['rm-pe', 'Roadmap', RM], ['pe-process', 'Process checklist', CK]] });
})(window);
