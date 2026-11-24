/* =====================================================================
 * ROADMAPS — a detailed, step-by-step roadmap in every section.
 *   Sourced (verbatim from the user's own guides): IPO admission and offering
 *   (49 steps, 8 phases, 50 forms, 18 risks), bond issuance process card,
 *   three bond-issuance review roadmaps (principle approval, issuance permit
 *   and offering in 28 steps, contracts and forms), corporate-governance Q&A.
 *   Authored (js/data/roadmaps-authored.js): sell-side, buy-side, capital
 *   increase, PE, valuation, strategy, financial management, trading.
 * Every step can be ticked and annotated; progress is kept in this browser
 * and exported to Excel with the step table.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  if (!root.document || !Hub.toolkit) return;
  var U = Hub.util, h = U.h, TK = Hub.toolkit, SRC = Hub.ROADMAP_SRC || {}, AUTH = Hub.ROADMAP_AUTH || [];
  var FIELDS = [['who', 'Prepared by → to'], ['to', 'Flow'], ['pre', 'Prerequisite'], ['docs', 'Documents'], ['sign', 'Signatures and seals'], ['copies', 'Copies'], ['guarantee', 'Guarantees and cheques'],
    ['out', 'Output'], ['time', 'Typical time'], ['law', 'Legal basis'], ['check', 'What to check'], ['risk', 'Risk'], ['note', 'Note']];

  // normalise every source into { phases:[{name, steps:[{key,t,fields...}]}], extras:[{title, rows|blocks}] }
  function fromAuthored(R) { return { intro: R.intro, controls: R.controls, phases: R.phases.map(function (p, i) { return { name: p.name, steps: p.steps.map(function (s, j) { return Object.assign({ key: i + '.' + j }, s); }) }; }) }; }
  function fromIPO(G) {
    return { intro: 'نقشهٔ راه پذیرش و عرضهٔ اولیه: ۴۹ گام در ۸ فاز، ۵۰ فرم و ۱۸ ریسک؛ برگرفته عیناً از راهنمای IPO شما.',
      phases: G.phases.map(function (p) { return { name: p.nm, steps: G.steps.filter(function (s) { return s.ph === p.n; }).map(function (s) {
        return { key: 'g' + s.g, t: s.g + ' · ' + s.t, docs: s.forms, who: s.who, to: s.flow, pre: s.pre, out: s.out, time: s.time, law: s.law, risk: s.risk, note: s.note }; }) }; }),
      extras: [{ title: 'Forms', head: ['#', 'فرم', 'شرح', 'صفحه'], rows: G.forms.map(function (f) { return [f.n, f.t, f.d, f.p]; }) },
        { title: 'Risks', head: ['ریسک', 'مرحله', 'اثر', 'شدت', 'راه‌حل', 'مبنا'], rows: G.risks.map(function (r) { return [r.t, r.stage, r.eff, r.sev, r.fix, r.law]; }) }] };
  }
  function fromCard(P) {
    return { intro: 'کارت فرایند انتشار اوراق پس از موافقت اصولی: ' + P.spine.join(' ← '),
      phases: P.stages.map(function (st, i) { return { name: st.n + ' · ' + st.name + ' (' + st.c + ')', steps: st.steps.map(function (s, j) { return { key: i + '.' + j, t: s.t + (s.opt ? ' (' + s.opt + ')' : ''), out: s.o, check: s.p }; }) }; }),
      controls: P.traps.map(function (t) { return t.t + ': ' + t.d; }),
      extras: [{ title: 'Package', head: ['تعداد', 'نوع', 'شرح'], rows: P.hooks.map(function (x) { return [x.n, x.k, x.d]; }) }] };
  }
  function fromDoc(blocks, intro) {
    // H1 = chapter, H2 = step (tickable), H3 + paragraphs + tables = body
    var phases = [], cur = null, st = null, pre = [];
    blocks.forEach(function (b, i) {
      if (b.h === 1) { cur = { name: b.t, steps: [], body: [] }; phases.push(cur); st = null; return; }
      if (!cur) { pre.push(b); return; }
      if (b.h === 2) { st = { key: phases.length + '.' + cur.steps.length, t: b.t, body: [] }; cur.steps.push(st); return; }
      (st ? st.body : cur.body).push(b);
    });
    return { intro: intro, phases: phases.filter(function (p) { return p.steps.length || p.body.length; }), pre: pre };
  }
  function blocksEl(blocks) {
    var out = h('div', { class: 'rm-body' }), ul = null;
    blocks.forEach(function (b) {
      if (b.tb) { ul = null; var t = h('table', { class: 'grid list rm-t' }), hd = h('thead', null, [h('tr', null, b.tb[0].map(function (c) { return h('th', { text: c }); }))]), bd = h('tbody');
        b.tb.slice(1).forEach(function (r) { bd.appendChild(h('tr', null, r.map(function (c) { return h('td', { text: c }); }))); }); t.appendChild(hd); t.appendChild(bd); out.appendChild(h('div', { class: 'grid-wrap' }, [t])); return; }
      if (b.h === 3) { ul = null; out.appendChild(h('h4', { class: 'rm-h3', text: b.t })); return; }
      if (b.li) { if (!ul) { ul = h('ul', { class: 'rm-ul' }); out.appendChild(ul); } ul.appendChild(h('li', { text: b.p })); return; }
      ul = null; out.appendChild(h('p', { text: b.p }));
    });
    return out;
  }
  function tableOf(head, rows) {
    var t = h('table', { class: 'grid list rm-t' }), bd = h('tbody');
    t.appendChild(h('thead', null, [h('tr', null, head.map(function (c) { return h('th', { text: c }); }))]));
    rows.forEach(function (r) { bd.appendChild(h('tr', null, r.map(function (c) { return h('td', { text: c == null ? '' : String(c) }); }))); });
    t.appendChild(bd); return h('div', { class: 'grid-wrap' }, [t]);
  }

  function defineRoadmap(id, title, sections, build, eyebrow) {
    var M = null; function model() { return M || (M = build()); }
    function count(S) { var all = 0, done = 0; model().phases.forEach(function (p) { p.steps.forEach(function (s) { all++; if (S.done[s.key]) done++; }); }); return { all: all, done: done }; }
    TK.define({
      id: id, title: title, sections: sections, priority: -2, version: 1, storeKey: 'hub.' + id + '.v1',
      summary: 'Step-by-step roadmap with documents, signatures, guarantees, outputs and checks; tick steps and keep notes.',
      sample: function () { return { version: 1, tool: id, meta: { title: title }, settings: { scenario: 'base' }, done: {}, notes: {}, sources: {} }; },
      blank: function () { return { version: 1, tool: id, meta: { title: title }, settings: { scenario: 'base' }, done: {}, notes: {}, sources: {} }; },
      run: function (S) { S.done = S.done || {}; S.notes = S.notes || {}; return { c: count(S), checks: [] }; },
      eyebrow: function () { return 'Roadmap · ' + eyebrow; }, heading: function () { return title; }, filename: function () { return id; },
      xlsx: function (S) { var X = Hub.xl, b = X.book(root.ExcelJS), sh = b.sheet('Roadmap', [2, 8, 40, 46, 30, 30, 30, 26, 30, 30, 10, 30]);
        sh.title(title, 'Status at export · ' + new Date().toISOString().slice(0, 10)); var heads = ['#', 'Phase', 'Step'].concat(FIELDS.map(function (f) { return f[1]; })).concat(['Done', 'My notes']);
        heads.forEach(function (x, j) { sh.put(1 + j, 4, x, 'hdr'); }); var r = 5;
        model().phases.forEach(function (p) { p.steps.forEach(function (s) { var row = [s.key, p.name, s.t].concat(FIELDS.map(function (f) { return s[f[0]] || ''; })).concat([S.done[s.key] ? 'Yes' : '', S.notes[s.key] || '']);
          if (s.body) row[3 + 1] = (row[4] ? row[4] + ' ' : '') + s.body.map(function (x) { return x.p || x.t || (x.tb ? '[table]' : ''); }).join(' / ').slice(0, 30000);
          row.forEach(function (v, j) { sh.put(1 + j, r, v, j === row.length - 2 ? 'in' : 'wrap'); }); r++; }); });
        X.notes(b, ['Roadmap content: ' + (/^rm-/.test(id) ? 'authored for the hub; regulatory clauses marked «بررسی شود» need checking against the current text.' : 'extracted verbatim from your own guide.')], {}); return b.wb; },
      kpis: function (ctx) { return [
        ['Progress', function () { var c = ctx.R.c; return c.all ? Math.round(c.done / c.all * 100) + '%' : '–'; }, function () { var c = ctx.R.c; return c.done + ' of ' + c.all + ' steps'; }],
        ['Phases', function () { return String(model().phases.length); }, function () { return 'tick steps as you go'; }]]; },
      tabs: [{ group: 'Roadmap', items: [['map', 'Roadmap', function (ctx) {
        var m = model(), S = ctx.S, q = h('input', { class: 'f-text', type: 'search', placeholder: 'Search steps', 'aria-label': 'Search steps' }), box = h('div', { class: 'rm', dir: 'rtl', 'data-notr': '1' });
        function paint() {
          U.clear(box); var term = q.value.trim();
          if (m.intro) box.appendChild(h('p', { class: 'lede rm-intro', text: m.intro }));
          if (m.pre && m.pre.length && !term) box.appendChild(blocksEl(m.pre.slice(0, 6)));
          m.phases.forEach(function (p, pi) {
            var steps = p.steps.filter(function (s) { return !term || JSON.stringify(s).indexOf(term) >= 0; });
            if (term && !steps.length && JSON.stringify(p.body || []).indexOf(term) < 0) return;
            var done = p.steps.filter(function (s) { return S.done[s.key]; }).length;
            var sec = h('details', { class: 'rm-phase', open: term || pi === 0 ? 'open' : null }, [h('summary', null, [h('span', { class: 'rm-pn', text: String(pi + 1) }), h('span', { text: p.name }), h('span', { class: 'chip' + (done === p.steps.length && p.steps.length ? ' ready' : ''), text: done + '/' + p.steps.length })])]);
            if (p.body && p.body.length) sec.appendChild(blocksEl(p.body));
            steps.forEach(function (s) {
              var cb = h('input', { type: 'checkbox', 'aria-label': 'Done' }); cb.checked = !!S.done[s.key];
              var card = h('div', { class: 'rm-step' + (cb.checked ? ' done' : '') });
              cb.addEventListener('change', function () { if (cb.checked) S.done[s.key] = true; else delete S.done[s.key]; card.classList.toggle('done', cb.checked); ctx.recompute(); });
              card.appendChild(h('div', { class: 'rm-head' }, [cb, h('strong', { text: s.t })]));
              var dl = h('dl', { class: 'rm-dl' });
              FIELDS.forEach(function (f) { if (s[f[0]]) { dl.appendChild(h('dt', { text: Hub.i18n ? Hub.i18n.t(f[1]) : f[1] })); dl.appendChild(h('dd', { text: s[f[0]] })); } });
              if (dl.childNodes.length) card.appendChild(dl);
              if (s.body && s.body.length) card.appendChild(blocksEl(s.body));
              var nt = h('textarea', { class: 'f-area rm-note', rows: 1, placeholder: 'یادداشت من (تاریخ، شماره نامه، مسئول…)', value: S.notes[s.key] || '' });
              nt.value = S.notes[s.key] || ''; nt.addEventListener('change', function () { if (nt.value.trim()) S.notes[s.key] = nt.value; else delete S.notes[s.key]; ctx.recompute(); });
              card.appendChild(nt); sec.appendChild(card);
            });
            box.appendChild(sec);
          });
        }
        q.addEventListener('input', paint); paint();
        var tools = h('div', { class: 'row-ctl' }, [q, h('button', { class: 'btn ghost', type: 'button', text: 'Expand all', onclick: function () { box.querySelectorAll('details').forEach(function (d) { d.open = true; }); } }),
          h('button', { class: 'btn ghost', type: 'button', text: 'Collapse all', onclick: function () { box.querySelectorAll('details').forEach(function (d) { d.open = false; }); } })]);
        return ctx.group([ctx.panel(null, [tools, box])]);
      }]].concat(((model().controls && model().controls.length) ? [['ctl', 'Golden controls', function (ctx) {
        return ctx.group([ctx.panel('Golden controls', [h('ol', { class: 'rm-ctl', dir: 'rtl', 'data-notr': '1' }, model().controls.map(function (c) { return h('li', { text: c }); }))])]);
      }]] : [])).concat((model().extras || []).map(function (x, i) { return ['x' + i, x.title, function (ctx) { var d = h('div', { dir: 'rtl', 'data-notr': '1' }, [tableOf(x.head, x.rows)]); return ctx.group([ctx.panel(x.title, [d])]); }]; })) }]
    });
  }

  // sourced roadmaps
  if (SRC.ipo) defineRoadmap('rm-ipo', 'IPO Roadmap · admission and initial public offering', ['ipo'], function () { return fromIPO(SRC.ipo); }, 'IPO (your guide)');
  if (SRC.bondCard) defineRoadmap('rm-bond-card', 'Bond Roadmap · process card after principle approval', ['bonds'], function () { return fromCard(SRC.bondCard); }, 'Bond issuance (your process card)');
  if (SRC.bondPrinciple) defineRoadmap('rm-bond-principle', 'Bond Roadmap · stage 1: principle approval', ['bonds'], function () { return fromDoc(SRC.bondPrinciple, 'مرحلهٔ موافقت اصولی — صکوک مرابحهٔ خرید مواد اولیه با ضامن ثالث: پنج گام اصلی و یازده پیوست.'); }, 'Bond issuance (your review roadmap)');
  if (SRC.bondPermit) defineRoadmap('rm-bond-permit', 'Bond Roadmap · stage 2: issuance permit and offering (28 steps)', ['bonds'], function () { return fromDoc(SRC.bondPermit, 'مرحلهٔ مجوز انتشار و عرضه: بیست و هشت گام، از درخواست موافقت اصولی تا تحویل اسناد به سپرده‌گذاری مرکزی.'); }, 'Bond issuance (your review roadmap)');
  if (SRC.bondContracts) defineRoadmap('rm-bond-contracts', 'Bond Roadmap · contracts and forms (12 documents)', ['bonds'], function () { return fromDoc(SRC.bondContracts, 'قراردادها و فرم‌های انتشار اوراق: پنج قرارداد، سه فرم سازمانی، دو نامهٔ حسابرسی، دو نسخهٔ سندیکایی.'); }, 'Bond issuance (your review roadmap)');
  if (SRC.gov) defineRoadmap('rm-governance', 'Governance, insider information and KYC · Q&A', ['ipo', 'ib'], function () {
    var Q = SRC.gov; return { intro: 'پرسش و پاسخ حاکمیت شرکتی، دارندگان اطلاعات نهانی و فرم‌های شناسایی مشتری؛ برگرفته عیناً از راهنمای شما.',
      phases: Q.chapters.map(function (ch, i) { return { name: ch, steps: Q.qs.filter(function (x) { return x.ch === ch; }).map(function (x) {
        var body = []; if (x.plain) body.push({ p: x.plain }); if (x.body) body.push({ p: x.body }); (x.tabs || []).forEach(function (t) { if (t && t.length) body.push({ tb: t.map(function (r) { return r.slice().reverse(); }) }); });
        return { key: x.id, t: x.id + ' · ' + x.q, out: x.short, law: x.src, body: body }; }) }; }) }; }, 'Governance (your Q&A)');
  // authored roadmaps
  AUTH.forEach(function (R) { defineRoadmap(R.id, R.title, R.sections, function () { return fromAuthored(R); }, 'Process'); });
})(typeof window !== 'undefined' ? window : globalThis);
