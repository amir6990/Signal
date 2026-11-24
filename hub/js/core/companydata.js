/* =====================================================================
 * COMPANY DATA — one import of the company's historical statements,
 * usable by every model.
 * Import an Excel file (or paste a block) once, in any model; it is kept in
 * this browser. Each model's "Company data" bar shows what is loaded and
 * applies it to that model's own inputs (LTM revenue / EBITDA / net income,
 * net debt, shares, ratios, first forecast year …). Figures are converted to
 * the model's unit. The Company Model and the DCF tool rebuild their full
 * statements from the same lines.
 * First-forecast-year figures come from the Company Model engine run on the
 * imported lines in nominal terms with drivers seeded from history — a
 * mechanical starting point to replace with your own forecast.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  var KEY = 'hub.companyData.v1';
  var UNIT = { units: 1, thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12 };
  var NKEY = 'hub.companyNotes.v1', MEM = null;
  function get() { try { return JSON.parse(localStorage.getItem(KEY)) || MEM; } catch (e) { return MEM; } }
  function notes() { var St = Hub.util && Hub.util.store, r = St ? St.get(NKEY, null) : null, c = get(); return r && c && r.file === c.file ? r : null; }
  function save(blocks, info) {
    var rec = { file: info.file || 'pasted data', savedAt: new Date().toISOString().slice(0, 10), unit: info.unit || null, currency: info.currency || null, sharesMn: info.sharesMn || null,
      company: info.company || '', blocks: blocks.map(function (b) { return { type: b.type, title: b.title, sheet: b.sheet, years: b.years, rows: b.rows.map(function (r) { return { label: r.label, grp: r.grp, vals: r.vals }; }) }; }) };
    try { localStorage.setItem(KEY, JSON.stringify(rec)); } catch (e) { rec.saveErr = 'ذخیره در حافظهٔ مرورگر ممکن نشد (' + e.name + ')؛ داده فقط تا بستن صفحه در دسترس است.'; MEM = rec; if (Hub.util && Hub.util.toast) Hub.util.toast(rec.saveErr, 'warn'); }
    // supporting schedules (notes: facilities, related parties, projects …) and the extraction report: kept in the larger store, compacted
    try { var St = Hub.util && Hub.util.store; if (St) { var nb = (info.blocks || []).filter(function (b) { return b.cat && b.cat !== 'other' && !b.hidden; }), cap = 4000, used = 0;
      var notes = nb.map(function (b) { var rows = b.rows.slice(0, Math.max(0, Math.min(300, cap - used))); used += rows.length; return { cat: b.cat, sheet: b.sheet, title: b.title, head: b.head || '', years: b.allYears, n: b.rows.length, rows: rows.map(function (r) { return { label: r.label, all: r.all }; }) }; });
      St.set(NKEY, { file: rec.file, at: rec.savedAt, notes: notes, cut: nb.reduce(function (a, b) { return a + b.rows.length; }, 0) - used, report: info.report || null }); } } catch (e) { /* optional */ }
    document.dispatchEvent(new CustomEvent('hub:companydata'));
    return rec;
  }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) { /* blocked */ } document.dispatchEvent(new CustomEvent('hub:companydata')); }
  function conv(v, from, to) { var f = UNIT[from] || 1, t = UNIT[to] || 1; return isFinite(v) ? v * f / t : v; }

  // standard metrics from the imported lines (Company Model engine)
  function metrics(rec) {
    var CM = Hub.tools && Hub.tools.company; if (!CM || !rec) return null;
    var S = CM.sample(); S.settings.basis = 'nominal'; S.settings.scenario = 'base';
    var info = { unit: rec.unit, currency: rec.currency, file: rec.file, sharesMn: rec.sharesMn };
    CM.fromImport(S, rec.blocks, info);
    if (!rec.unit) S.meta.unit = 'million';
    var H = CM.histAgg(S), n = H.n, l = n - 1, R = null;
    try { R = CM.run(S); } catch (e) { R = null; }
    var g = []; for (var i = 1; i < n; i++) if (H.revenue[i - 1] > 0) g.push(H.revenue[i] / H.revenue[i - 1] - 1);
    var avg = g.length ? g.reduce(function (a, b) { return a + b; }, 0) / g.length : 0;
    var rev = H.revenue[l] || NaN, ebt = H.ebt[l];
    var m = {
      file: rec.file, savedAt: rec.savedAt, unit: S.meta.unit, currency: S.meta.currency, years: S.meta.histYears.slice(), sharesMn: rec.sharesMn || null,
      revenue: H.revenue[l], ebitda: H.ebitda[l], ebit: H.ebit[l], ni: H.ni[l], da: H.da[l], interestExp: H.interestExp[l], tax: H.tax[l],
      cash: H.cash[l], debt: H.debt[l], debtLike: H.debtLike[l], minority: H.minority[l], equity: H.equity[l] + H.retained[l], nonOpA: H.nonOpA[l],
      netDebt: H.debt[l] + H.debtLike[l] - H.cash[l], capex: H.capex[l], dividends: H.dividends[l], nwc: H.nwc[l],
      growth: avg, ebitdaMargin: rev ? H.ebitda[l] / rev : NaN, daPct: rev ? H.da[l] / rev : NaN, capexPct: rev && isFinite(H.capex[l]) ? H.capex[l] / rev : NaN,
      nwcPct: rev ? H.nwc[l] / rev : NaN, taxRate: ebt > 0 ? H.tax[l] / ebt : NaN, check: H.check[l],
      fy1: R && R.P && R.P.t ? { year: S.meta.projYears[0], revenue: R.P.t.revenue[0], ebitda: R.P.t.ebitda[0], ni: R.P.t.ni[0] } : null,
      H: H
    };
    return m;
  }
  // metrics in a model's unit
  function inUnit(m, unit) {
    if (!m) return null;
    var o = Object.assign({}, m), money = ['revenue', 'ebitda', 'ebit', 'ni', 'da', 'interestExp', 'tax', 'cash', 'debt', 'debtLike', 'minority', 'equity', 'nonOpA', 'netDebt', 'capex', 'dividends', 'nwc'];
    money.forEach(function (k) { o[k] = conv(m[k], m.unit, unit); });
    if (m.fy1) o.fy1 = { year: m.fy1.year, revenue: conv(m.fy1.revenue, m.unit, unit), ebitda: conv(m.fy1.ebitda, m.unit, unit), ni: conv(m.fy1.ni, m.unit, unit) };
    o.unit = unit; return o;
  }

  /* bar shown at the top of a model.
   *   opts.unit()          model unit
   *   opts.apply(M, side)  writes M into the model, returns a short summary
   *   opts.sides           optional [[key, label]] (e.g. acquirer / target)
   *   opts.full(rec)       for Company Model / DCF: rebuild the statements from rec.blocks */
  function bar(opts) {
    var U = Hub.util, h = U.h, fa = Hub.i18n && Hub.i18n.lang() === 'fa', T = function (en, f) { return fa ? f : en; };
    var box = h('section', { class: 'card cd-bar' }), open = false, useIt = function () {};
    function paint() {
      U.clear(box);
      var rec = get(), M = rec ? metrics(rec) : null;
      var line = rec && M ? (T('Loaded: ', 'بارگذاری‌شده: ') + rec.file + ' · ' + M.years.join(' · ') + ' · ' + (rec.currency || '') + ' ' + (rec.unit || '') + ' · ' + T('saved ', 'ذخیره ') + rec.savedAt) : T('No company statements loaded yet.', 'هنوز صورت مالی شرکتی بارگذاری نشده است.');
      var side = null;
      if (opts.sides) { side = h('select', { class: 'f-sel', 'aria-label': 'Apply to' }, opts.sides.map(function (s) { return h('option', { value: s[0], text: s[1] }); })); }
      var applyBtn = h('button', { class: 'btn primary', type: 'button', text: 'Use in this model', disabled: !M, onclick: function () { useIt(rec); } });
      useIt = function (r) {
        var m = r ? metrics(r) : null; if (!m) return;
        try { var msg = opts.apply(inUnit(m, opts.unit ? opts.unit() : m.unit), side ? side.value : null, r); if (msg !== false) U.toast(msg || T('Company data applied.', 'داده‌های شرکت اعمال شد.'), 'good'); }
        catch (e) { console.error(e); U.toast(e.message, 'crit'); }
      };
      var tog = h('button', { class: 'btn ghost', type: 'button', text: open ? 'Hide import' : 'Import Excel / PDF or paste', onclick: function () { open = !open; paint(); } });
      box.appendChild(h('div', { class: 'cd-row' }, [h('strong', { text: 'Company data' }), h('span', { class: 'muted', 'data-notr': '1', text: line })].concat(side ? [side] : []).concat([applyBtn, tog])));
      if (M) {
        var f = function (v) { return U.fmtNum(v); }, p = function (v) { return U.fmtPct(v, 1); };
        box.appendChild(h('p', { class: 'muted cd-sum', text: T('Last year ', 'آخرین سال ') + M.years[M.years.length - 1] + ': ' + T('revenue ', 'درآمد ') + f(M.revenue) + ' · EBITDA ' + f(M.ebitda) + ' · ' + T('net income ', 'سود خالص ') + f(M.ni) + ' · ' + T('net debt ', 'بدهی خالص ') + f(M.netDebt) + ' · ' + T('growth ', 'رشد ') + p(M.growth) + ' · EBITDA ' + p(M.ebitdaMargin) + (M.sharesMn ? ' · ' + T('shares ', 'سهام ') + f(M.sharesMn) + ' mn' : '') }));
      }
      // the one audit result every model shares (same file, same calculation ID)
      if (M && Hub.auditCore) { try { var AR = Hub.auditCore.result(); if (AR) box.appendChild(h('p', { class: 'small', 'data-notr': '1' }, [document.createTextNode('حسابرس سخت‌گیر (محلی): ' + AR.id + ' · بحرانی ' + AR.count.critical + ' · زیاد ' + AR.count.high + ' · متوسط ' + AR.count.medium + ' — همهٔ بخش‌ها از همین نتیجه استفاده می‌کنند. '), h('a', { href: '#auditor', text: 'مشاهدهٔ حسابرس' })])); } catch (e) { /* optional */ } }
      if (open && Hub.stmtImport) box.appendChild(Hub.stmtImport.widget({ onApply: function (blocks, info) {
        var r = save(blocks, info); open = false; paint(); if (r.saveErr) box.appendChild(h('p', { class: 'warn-t', text: r.saveErr }));
        if (opts.full) opts.full(r); else useIt(get());
      } }));
    }
    paint();
    document.addEventListener('hub:companydata', function () { if (box.isConnected) paint(); });
    return box;
  }

  /* per-year series for analysis (auditor, financing): Company Model aggregates plus lines found by name in the file.
   * Totals printed in the file are preferred where they exist (current assets / liabilities, total assets, CFO). */
  function series(rec) {
    var CM = Hub.tools && Hub.tools.company; if (!CM || !rec) return null;
    var S = CM.sample(); S.settings.basis = 'nominal';
    CM.fromImport(S, rec.blocks, { unit: rec.unit, currency: rec.currency, file: rec.file, sharesMn: rec.sharesMn });
    var H = CM.histAgg(S), n = H.n, z = function () { var a = []; for (var i = 0; i < n; i++) a.push(0); return a; };
    function rows(type) { var o = []; rec.blocks.forEach(function (b) { if (b.type === type) b.rows.forEach(function (r) { o.push(r); }); }); return o; }
    var IS = rows('IS'), BS = rows('BS'), CF = rows('CF');
    function nm(s) { return String(s || '').replace(/‌/g, ' ').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim(); }
    function find(list, re, not) { for (var i = 0; i < list.length; i++) { var l = nm(list[i].label); if (re.test(l) && !(not && not.test(l))) return list[i].vals.slice(); } return null; }
    function sumWhere(list, fn) { var o = z(); list.forEach(function (r) { if (fn(r)) r.vals.forEach(function (v, i) { o[i] += v; }); }); return o; }
    var kind = function (r) { var role = CM.suggestRole(r.label, 'BS'); return { role: role, kind: (CM.ROLES[role] || {}).kind }; };
    var isTotal = /جمع|total|subtotal/i;
    var cur = function (r) { var g = nm(r.grp); return /جاری|current/i.test(g) && !/غیر ?جاری|non.current/i.test(g); };
    var caF = find(BS, /^جمع دارایی ?های جاری|^total current assets/i), clF = find(BS, /^جمع بدهی ?های جاری|^total current liabilities/i);
    var ca = caF || sumWhere(BS, function (r) { var k = kind(r); return cur(r) && k.kind === 'A' && k.role !== 'skip' && !isTotal.test(r.label); });
    var cl = clF || sumWhere(BS, function (r) { var k = kind(r); return cur(r) && k.kind === 'L' && k.role !== 'skip' && !isTotal.test(r.label); });
    var o = {
      years: S.meta.histYears.slice(), n: n, unit: S.meta.unit, currency: S.meta.currency, H: H, lines: { IS: IS, BS: BS, CF: CF },
      revenue: H.revenue, cogs: H.cogs, gp: H.gp, opex: H.opex, otherOp: H.otherOp, nonOp: H.nonOp, da: H.da, ebit: H.ebit, ebitda: H.ebitda, ie: H.interestExp, ebt: H.ebt, tax: H.tax, ni: H.ni,
      cash: H.cash, debt: H.debt, debtLike: H.debtLike, ppe: H.ppe, nonOpA: H.nonOpA, equity: H.te, retained: H.retained, minority: H.minority, capex: H.capex, dividends: H.dividends,
      ta: H.ta, tl: H.tl, check: H.check, ca: ca, cl: cl, caFromFile: !!caF, clFromFile: !!clF,
      taFile: find(BS, /^جمع دارایی ?ها$|^total assets$/i), tleFile: find(BS, /^جمع (حقوق مالکانه و بدهی ?ها|بدهی ?ها و حقوق مالکانه)$|^total (equity and liabilities|liabilities and equity)$/i),
      ar: sumWhere(BS, function (r) { return /دریافتنی|receivable/i.test(nm(r.label)) && !/بلند ?مدت|long.term/i.test(nm(r.label)) && !isTotal.test(r.label); }),
      inv: sumWhere(BS, function (r) { return /موجودی (مواد|کالا)|inventor/i.test(nm(r.label)) && !isTotal.test(r.label); }),
      ap: sumWhere(BS, function (r) { return /پرداختنی ?های تجاری|پرداختنی.*تجاری|trade (and other )?payables/i.test(nm(r.label)) && !isTotal.test(r.label); }),
      capital: find(BS, /^سرمایه( ثبت شده| پرداخت شده)?$|^share capital$|^issued capital$/i),
      legalReserve: find(BS, /اندوخته قانونی|legal reserve/i),
      divPayable: find(BS, /سود سهام پرداختنی|dividends? payable/i),
      cfo: find(CF, /^جریان خالص ورود( \(خروج\))? نقد حاصل از فعالیت ?های عملیاتی|net cash (from|generated (by|from)|provided by) operating/i) || find(CF, /^نقد حاصل از عملیات|cash generated from operations/i),
      dCashCF: find(CF, /خالص (افزایش|کاهش|افزایش \(کاهش\)) (در )?(وجه|موجودی) نقد|net (increase|decrease|change).* in cash/i),
      fxOnCash: find(CF, /تغییرات نرخ ارز|exchange rate/i),
      related: IS.concat(BS).filter(function (r) { return /اشخاص وابسته|related part/i.test(nm(r.label)); }).map(function (r) { return { label: r.label, vals: r.vals }; }),
      bsLines: BS.filter(function (r) { return !isTotal.test(r.label) && CM.suggestRole(r.label, 'BS') !== 'skip'; }).map(function (r) { return { label: r.label, vals: r.vals }; })
    };
    return o;
  }

  Hub.companyData = { notes: notes, get: get, save: save, clear: clear, metrics: metrics, inUnit: inUnit, bar: bar, series: series };
})(typeof window !== 'undefined' ? window : globalThis);
