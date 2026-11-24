/* =====================================================================
 * TOOLKIT — shared page frame for every model, so each tool only writes
 * its engine, its screens and its Excel layout.
 *
 * Hub.toolkit.define({
 *   id, title, sections, priority, summary, storeKey,
 *   sample(), blank(),            // state factories (blank = empty placeholders)
 *   run(S) -> R                   // pure calculation; R.checks = [{level,msg}] optional
 *   eyebrow(S), heading(S),
 *   scenarios: true,              // shows Base/Upside/Downside switch bound to S.settings.scenario
 *   kpis(ctx) -> [[label, valueFn, subFn], ...],
 *   tabs: [{ group:'Inputs', items:[[id,label,builder(ctx)]] }, ...],
 *   xlsx(S,R) -> ExcelJS workbook, csv(S,R) -> rows (optional), filename(S)
 * })
 * ctx gives: S, R, recompute(), rerender(), panel(), group(), inArr(), inVal(), calc(), list(), text(), checklist()
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub, U = Hub.util, h = U.h;
  var SCEN = [['base', 'Base'], ['upside', 'Upside'], ['downside', 'Downside']];

  function define(cfg) {
    var S = null, R = null, view = null, headEl = null, kpiObj = null, tabBody = null, tab = null, active = null, tabRefs = [], charts = [], timer = null;

    function persist() { clearTimeout(timer); timer = setTimeout(function () { U.store.set(cfg.storeKey, S); }, 350); }
    function load() {
      var s = U.store.get(cfg.storeKey, null);
      S = s && s.version === cfg.version ? s : cfg.sample();
      S.sources = S.sources || {};
    }
    function safeRun() { try { R = cfg.run(S); } catch (e) { console.error(e); U.toast('Calculation error: ' + e.message, 'crit'); R = R || { checks: [] }; } }
    function recompute() { safeRun(); if (kpiObj) kpiObj.refresh(); if (tab && tab.refresh) tab.refresh(); persist(); }
    function rerender() { safeRun(); renderHead(); renderTab(active); if (kpiObj) kpiObj.refresh(); persist(); }

    var ctx = {
      get S() { return S; }, get R() { return R; },
      recompute: recompute, rerender: rerender,
      setState: function (s) { S = s; S.sources = S.sources || {}; rerender(); },
      panel: function (title, kids, cls) {
        var nodes = (kids || []).map(function (k) { if (k && k.el && !k.nodeType) { if (k.refresh) tabRefs.push(k.refresh); return k.el; } return k; });
        return h('section', { class: 'panel ' + (cls || '') }, [title ? h('h2', { text: title }) : null].concat(nodes));
      },
      group: function (parts) {
        return { el: h('div', { class: 'stack' }, parts.filter(function (p) { return p && (p.el || p.nodeType); }).map(function (p) { return p.el || p; })),
          refresh: function () { parts.forEach(function (p) { if (p && p.refresh) p.refresh(); }); } };
      },
      two: function (a, b) { return h('div', { class: 'two' }, [a, b]); },
      inArr: function (path, i, fmt) {
        return { input: true, fmt: fmt || 'num', get: function () { return U.getPath(S, path)[i]; }, set: function (v) { U.getPath(S, path)[i] = v; delete S.sources[path]; } };
      },
      inVal: function (path, fmt) {
        return { input: true, fmt: fmt || 'num', get: function () { return U.getPath(S, path); }, set: function (v) { U.setPath(S, path, v); delete S.sources[path]; } };
      },
      calc: function (fn, fmt, flag) { return { value: fn, fmt: fmt || 'num', flag: flag }; },
      field: function (key, label, path, fmt, extra) {
        return Object.assign({ key: key, label: label, fmt: fmt || 'num', tag: S.sources[path],
          get: function () { return U.getPath(S, path); }, set: function (v) { U.setPath(S, path, v); delete S.sources[path]; } }, extra || {});
      },
      scenCols: function () { return SCEN.map(function (s) { return { label: s[1], cls: s[0] === S.settings.scenario ? 'cur' : '' }; }); },
      scenKey: function (c) { return SCEN[c][0]; },
      charts: charts,
      chart: function (canvas, conf) { if (!root.Chart) return null; var c = new root.Chart(canvas, conf); charts.push(c); return c; },
      css: function (v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); },
      list: list, text: textField, checklist: checklist
    };

    function mount(el) {
      load(); safeRun();
      view = h('div', { class: 'tool' });
      el.appendChild(view);
      headEl = null; // a second visit builds a new view: the old header belongs to the old one
      renderHead();
      // company statements imported once (any model), applied to this model's inputs
      if ((cfg.fromCompany || cfg.companyFull) && Hub.companyData) view.appendChild(Hub.companyData.bar({
        unit: function () { return S.meta && S.meta.unit; }, sides: cfg.companySides,
        apply: function (M, side, rec) { var msg = cfg.fromCompany ? cfg.fromCompany(S, M, side, rec) : cfg.companyFull(S, rec); rerender(); return msg; },
        full: cfg.companyFull ? function (rec) { var msg = cfg.companyFull(S, rec); rerender(); U.toast(msg, 'good'); } : null }));
      if (cfg.kpis) view.appendChild(buildKpi());
      var bar = h('nav', { class: 'tabs', 'aria-label': cfg.title + ' sections' });
      cfg.tabs.forEach(function (g) {
        var grp = h('div', { class: 'tab-grp' }, [h('span', { class: 'tab-grp-lbl', text: g.group })]);
        g.items.forEach(function (it) { grp.appendChild(h('button', { type: 'button', class: 'tab', role: 'tab', dataset: { tab: it[0] }, text: it[1], onclick: function () { renderTab(it[0]); } })); });
        bar.appendChild(grp);
      });
      if (cfg.tabs.length) view.appendChild(bar);
      tabBody = h('div', { class: 'tab-body', role: 'tabpanel' });
      view.appendChild(tabBody);
      var first = cfg.tabs[0].items[0][0];
      var saved = U.store.get(cfg.storeKey + '.tab', first);
      renderTab(findTab(saved) ? saved : first);
      document.addEventListener('hub:theme', onTheme);
    }
    function unmount() { disposeTab(); destroyCharts(); document.removeEventListener('hub:theme', onTheme); clearTimeout(timer); if (S) U.store.set(cfg.storeKey, S); }
    // a tab may hold an embedded tool: let it save and release before the tab is replaced
    function disposeTab() { if (tab && tab.dispose) { try { tab.dispose(); } catch (e) { console.error(e); } } }
    function onTheme() { renderTab(active); }
    function findTab(id) { var f = null; cfg.tabs.forEach(function (g) { g.items.forEach(function (it) { if (it[0] === id) f = it; }); }); return f; }
    function destroyCharts() { charts.forEach(function (c) { try { c.destroy(); } catch (e) { /* ignore */ } }); charts.length = 0; }

    function renderHead() {
      var btns = [];
      if (cfg.xlsx) btns.push(h('button', { class: 'btn primary', type: 'button', text: 'Export Excel', onclick: function () {
        if (!root.ExcelJS) { U.toast('Excel library did not load.', 'crit'); return; }
        try { Hub.xl.save(cfg.xlsx(S, R), U.slug(cfg.filename ? cfg.filename(S) : cfg.title) + '_' + U.stamp() + '.xlsx'); } catch (e) { console.error(e); U.toast('Excel export failed: ' + e.message, 'crit'); }
      } }));
      if (cfg.csv) btns.push(h('button', { class: 'btn ghost', type: 'button', text: 'CSV', onclick: function () {
        U.saveFile(U.slug(cfg.filename ? cfg.filename(S) : cfg.title) + '_' + U.stamp() + '.csv', new Blob(['﻿' + U.csvFromRows(cfg.csv(S, R))], { type: 'text/csv' }));
      } }));
      if (!cfg.suite && !cfg.noFile) btns.push(h('button', { class: 'btn ghost', type: 'button', text: 'Save', title: 'Save inputs as .json', onclick: function () {
        U.saveFile(U.slug(cfg.filename ? cfg.filename(S) : cfg.title) + '_' + U.stamp() + '.json', new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }));
      } }));
      if (!cfg.suite && !cfg.noFile) btns.push(openBtn());
      if (!cfg.suite && !cfg.noFile) btns.push(h('button', { class: 'btn ghost', type: 'button', text: 'Load sample', onclick: function () { confirmInline(this, 'Replace all inputs with the illustrative sample?', function () { ctx.setState(cfg.sample()); U.toast('Sample loaded (illustrative)', 'info'); }); } }));
      if (cfg.blank) btns.push(h('button', { class: 'btn ghost', type: 'button', text: 'Clear inputs', onclick: function () { confirmInline(this, 'Clear every input to an empty placeholder?', function () { ctx.setState(cfg.blank()); U.toast('Inputs cleared', 'info'); }); } }));
      var ctl = [];
      if (cfg.scenarios) ctl.push(seg('Scenario', SCEN, S.settings.scenario, function (v) { S.settings.scenario = v; rerender(); }));
      if (cfg.headControls) ctl = ctl.concat(cfg.headControls(ctx, seg));
      ctl.push(h('div', { class: 'btn-row' }, btns));
      var fresh = h('header', { class: 'page-head model-head' }, [
        h('div', { class: 'mh-title' }, [h('p', { class: 'eyebrow', text: cfg.eyebrow(S) }), h('h1', { text: cfg.heading(S) })]),
        h('div', { class: 'mh-ctl' }, ctl)
      ]);
      if (headEl && headEl.parentNode) headEl.parentNode.replaceChild(fresh, headEl); else view.appendChild(fresh);
      headEl = fresh;
    }
    function openBtn() {
      var id = cfg.id + '-open';
      var inp = h('input', { type: 'file', accept: '.json,application/json', class: 'vh', id: id, 'aria-label': 'Open saved inputs' });
      inp.addEventListener('change', function () {
        var f = inp.files[0]; if (!f) return;
        var rd = new FileReader();
        rd.onload = function () { try { var s = JSON.parse(rd.result); if (s.tool && s.tool !== cfg.id) throw new Error('file belongs to another tool (' + s.tool + ')'); ctx.setState(s); U.toast('Opened ' + f.name, 'good'); } catch (e) { U.toast('Could not open: ' + e.message, 'crit'); } };
        rd.readAsText(f);
      });
      return h('label', { class: 'btn ghost', for: id }, ['Open', inp]);
    }
    function confirmInline(btn, msg, yes) {
      var bar = h('div', { class: 'confirm', role: 'alertdialog' }, [h('span', { text: msg }),
        h('button', { class: 'btn danger', type: 'button', text: 'Confirm', onclick: function () { bar.remove(); yes(); } }),
        h('button', { class: 'btn ghost', type: 'button', text: 'Cancel', onclick: function () { bar.remove(); } })]);
      var old = view.querySelector('.confirm'); if (old) old.remove();
      btn.closest('.model-head').appendChild(bar);
    }

    function buildKpi() {
      var cells = cfg.kpis(ctx);
      var wrap = h('section', { class: 'kpis', 'aria-label': 'Key outputs' });
      wrap.style.setProperty('--kc', String(cells.length + 1));
      var paints = cells.map(function (c) {
        var v = h('span', { class: 'kpi-v' }), s = h('span', { class: 'kpi-s' });
        wrap.appendChild(h('div', { class: 'kpi' }, [h('span', { class: 'kpi-l', text: c[0] }), v, s]));
        return function () { try { v.textContent = c[1](); s.textContent = c[2] ? c[2]() : ''; v.classList.toggle('kpi-txt', /[\u0621-\u064A\u067E\u0686\u0698\u06A9\u06AF\u06CC]/.test(v.textContent)); } catch (e) { v.textContent = '–'; } };
      });
      var chk = h('div', { class: 'kpi chk' });
      wrap.appendChild(chk);
      function paintChk() {
        var list = (R && R.checks) || [];
        var c = list.filter(function (x) { return x.level === 'critical'; }).length, w = list.length - c;
        chk.className = 'kpi chk ' + (c ? 'crit' : w ? 'warn' : 'good');
        chk.title = list.map(function (x) { return x.msg; }).join('\n');
        U.clear(chk);
        chk.appendChild(h('span', { class: 'kpi-l', text: 'Checks' }));
        chk.appendChild(h('span', { class: 'kpi-v', text: c ? c + ' critical' : w ? w + ' to review' : 'All clear' }));
        chk.appendChild(h('span', { class: 'kpi-s', text: list.length ? list[0].msg : 'no issues flagged' }));
      }
      kpiObj = { el: wrap, refresh: function () { paints.forEach(function (p) { p(); }); paintChk(); } };
      kpiObj.refresh();
      return wrap;
    }

    function renderTab(id) {
      disposeTab(); destroyCharts();
      active = id; U.store.set(cfg.storeKey + '.tab', id);
      view.querySelectorAll('.tab').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === id); b.setAttribute('aria-selected', String(b.dataset.tab === id)); });
      U.clear(tabBody); tabRefs = [];
      var it = findTab(id);
      tab = it[2](ctx);
      var own = tab.refresh, refs = tabRefs.slice(), disp = tab.dispose;
      tab.refresh = function () { refs.forEach(function (f) { f(); }); if (own) own(); };
      tab.dispose = disp;
      tabBody.appendChild(tab.el);
      if (tab.after) tab.after();
    }

    /* list editor: rows of objects (peers, deals, positions) */
    function list(spec) {
      // spec: { path, cols:[{key,label,fmt,kind:'num'|'text'|'bool'|'calc', calc:fn(row,i), width}], newRow:fn, onChange, caption }
      var wrap = h('div', { class: 'grid-wrap' });
      var refreshers = [];
      function rows() { return U.getPath(S, spec.path); }
      function paint() {
        U.clear(wrap); refreshers = [];
        var t = h('table', { class: 'grid list' });
        if (spec.caption) t.appendChild(h('caption', { text: spec.caption }));
        t.appendChild(h('thead', null, [h('tr', null, spec.cols.map(function (c) { return h('th', { class: c.kind === 'text' ? 'lbl' : 'num', scope: 'col', text: c.label }); }).concat([h('th', { class: 'num', text: '' })]))]));
        var tb = h('tbody');
        rows().forEach(function (row, i) {
          var tr = h('tr', { class: row.include === false ? 'off' : '' });
          spec.cols.forEach(function (c, j) {
            var td = h('td', { class: c.kind === 'text' ? 'txt' : 'num' });
            if (c.kind === 'calc') {
              var p = function () { var v = c.calc(row, i); td.textContent = typeof v === 'string' ? v : U.fmt(v, c.fmt); if (c.flag) td.classList.toggle('flag', !!c.flag(row, i)); };
              p(); refreshers.push(p);
            } else if (c.kind === 'select') {
              var sel = h('select', { class: 'cell-sel', id: spec.id + '-' + i + '-' + j, 'aria-label': c.label + ' row ' + (i + 1) },
                c.options(row).map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
              sel.value = row[c.key];
              sel.addEventListener('change', function () { row[c.key] = sel.value; if (c.onSet) c.onSet(row); if (c.repaint) paint(); changed(); });
              td.appendChild(sel);
            } else if (c.kind === 'bool') {
              var cb = h('input', { type: 'checkbox', id: spec.id + '-' + i + '-' + j, 'aria-label': c.label + ' row ' + (i + 1) });
              cb.checked = row[c.key] !== false;
              cb.addEventListener('change', function () { row[c.key] = cb.checked; tr.classList.toggle('off', !cb.checked); changed(); });
              td.appendChild(cb);
            } else {
              var inp = h('input', { class: c.kind === 'text' ? 'cell-txt' : 'cell-in' + (row._src && row._src[c.key] ? ' fetched' : ''), type: 'text', id: spec.id + '-' + i + '-' + j,
                inputmode: c.kind === 'text' ? 'text' : 'decimal', 'aria-label': c.label + ' row ' + (i + 1), dataset: { r: i, c: j }, placeholder: c.optional ? (Hub.i18n && Hub.i18n.lang() === 'fa' ? 'نامشخص' : 'unknown') : '' });
              inp.value = c.kind === 'text' ? (row[c.key] || '') : U.toInput(c.arr ? row[c.arr][c.idx] : row[c.key], c.fmt || 'num');
              inp.addEventListener('focus', function () { inp.select(); });
              inp.addEventListener('change', function () {
                if (c.kind === 'text') row[c.key] = inp.value;
                else if (c.arr) { var va = U.fromInput(inp.value, c.fmt); if (!isFinite(va)) { U.toast('Not a number: "' + inp.value + '"', 'warn'); inp.value = U.toInput(row[c.arr][c.idx], c.fmt || 'num'); return; } row[c.arr][c.idx] = va; }
                else if (c.optional && !String(inp.value).trim()) row[c.key] = null;
                else { var v = U.fromInput(inp.value, c.fmt); if (!isFinite(v)) { U.toast('Not a number: "' + inp.value + '"', 'warn'); inp.value = U.toInput(row[c.key], c.fmt || 'num'); return; } row[c.key] = v; if (row._src) delete row._src[c.key]; inp.classList.remove('fetched'); }
                changed();
              });
              inp.addEventListener('paste', function (e) { pasteBlock(e, i, j); });
              td.appendChild(inp);
            }
            tr.appendChild(td);
          });
          var acts = h('td', { class: 'num acts' });
          (spec.rowActions || []).forEach(function (a) { acts.appendChild(h('button', { class: 'mini', type: 'button', text: a.label, title: a.title || a.label, onclick: function () { a.run(row, i, function () { paint(); changed(); }); } })); });
          acts.appendChild(h('button', { class: 'mini', type: 'button', title: 'Remove row', 'aria-label': 'Remove row ' + (i + 1), text: '×', onclick: function () { rows().splice(i, 1); paint(); changed(); } }));
          tr.appendChild(acts);
          tb.appendChild(tr);
        });
        t.appendChild(tb);
        wrap.appendChild(t);
        wrap.appendChild(h('div', { class: 'row-ctl list-ctl' }, [h('button', { class: 'btn ghost', type: 'button', text: '+ Add row', onclick: function () { rows().push(spec.newRow()); paint(); changed(); } })].concat(spec.extra ? spec.extra(paint) : [])));
      }
      function changed() { if (spec.onChange) spec.onChange(); else recompute(); }
      function pasteBlock(e, r0, c0) {
        var txt = (e.clipboardData || root.clipboardData).getData('text');
        if (!/[\t\n]/.test(txt.trim())) return;
        e.preventDefault();
        var lines = txt.replace(/\r/g, '').replace(/\n$/, '').split('\n').map(function (l) { return l.split('\t'); });
        lines.forEach(function (cells, i) {
          if (!rows()[r0 + i]) rows().push(spec.newRow());
          var row = rows()[r0 + i];
          cells.forEach(function (raw, j) {
            var c = spec.cols[c0 + j]; if (!c || c.kind === 'calc' || c.kind === 'bool') return;
            if (c.kind === 'text') row[c.key] = raw.trim();
            else if (c.kind === 'select') return;
            else { var v = U.fromInput(raw, c.fmt); if (isFinite(v)) { if (c.arr) row[c.arr][c.idx] = v; else row[c.key] = v; } }
          });
        });
        paint(); changed();
        U.toast('Pasted ' + lines.length + ' row' + (lines.length === 1 ? '' : 's'), 'good');
      }
      paint();
      return { el: wrap, refresh: function () { refreshers.forEach(function (f) { f(); }); }, repaint: paint };
    }

    function textField(path, label, opts) {
      opts = opts || {};
      var id = cfg.id + '-' + path.replace(/\W/g, '-');
      var ta = h('textarea', { id: id, class: 'f-area', rows: opts.rows || 3, placeholder: opts.placeholder || '' });
      ta.value = U.getPath(S, path) || '';
      ta.addEventListener('input', function () { U.setPath(S, path, ta.value); persist(); if (opts.live) recompute(); });
      return h('div', { class: 'f-block' }, [h('label', { for: id, class: 'f-lbl strong-lbl', text: label }), opts.help ? h('p', { class: 'f-help', text: opts.help }) : null, ta]);
    }

    function checklist(path, items, opts) {
      // items: [{id, label, help}] ; state at path: { [id]: {done, owner, due, note} }
      opts = opts || {};
      var st = U.getPath(S, path); if (!st) { U.setPath(S, path, {}); st = U.getPath(S, path); }
      var ul = h('ul', { class: 'cl' });
      items.forEach(function (it) {
        var rec = st[it.id] || (st[it.id] = { done: false, owner: '', due: '', note: '' });
        var cid = cfg.id + '-' + path.replace(/\W/g, '-') + '-' + it.id;
        var cb = h('input', { type: 'checkbox', id: cid }); cb.checked = !!rec.done;
        var li = h('li', { class: rec.done ? 'done' : '' });
        cb.addEventListener('change', function () { rec.done = cb.checked; li.classList.toggle('done', cb.checked); recompute(); });
        var row = [cb, h('label', { for: cid, class: 'cl-lbl' }, [it.label, it.help ? h('span', { class: 'cl-help', text: it.help }) : null])];
        if (opts.detail !== false) {
          var own = h('input', { class: 'cl-in', type: 'text', placeholder: 'Owner', value: rec.owner || '', 'aria-label': 'Owner for ' + it.label });
          var due = h('input', { class: 'cl-in', type: 'text', placeholder: 'Due', value: rec.due || '', 'aria-label': 'Due date for ' + it.label });
          own.addEventListener('change', function () { rec.owner = own.value; persist(); });
          due.addEventListener('change', function () { rec.due = due.value; persist(); });
          row.push(h('span', { class: 'cl-meta' }, [own, due]));
        }
        li.appendChild(h('div', { class: 'cl-row' }, row));
        ul.appendChild(li);
      });
      return ul;
    }

    function seg(label, opts, val, on) {
      var g = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label }, [h('span', { class: 'seg-lbl', text: label })]);
      opts.forEach(function (o) { g.appendChild(h('button', { type: 'button', role: 'radio', 'aria-checked': String(o[0] === val), class: 'seg-btn' + (o[0] === val ? ' on' : ''), text: o[1], onclick: function () { if (o[0] !== val) on(o[0]); } })); });
      return g;
    }

    Hub.register({ id: cfg.id, title: cfg.title, sections: cfg.sections, status: 'ready', priority: cfg.priority, summary: cfg.summary, mount: mount, unmount: unmount });
    return ctx;
  }

  /* heat-map table used by sensitivity screens */
  function heat(target, title, rowLbl, colLbl, rowsV, colsV, data, rowFmt, colFmt, valFmt, mark) {
    U.clear(target);
    var all = [].concat.apply([], data).filter(isFinite), lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
    var t = h('table', { class: 'grid heat' });
    t.appendChild(h('caption', { text: title }));
    t.appendChild(h('thead', null, [h('tr', null, [h('th', { class: 'lbl', text: rowLbl + ' ↓  ·  ' + colLbl + ' →' })].concat(colsV.map(function (v, j) { return h('th', { class: 'num' + (j === 2 ? ' cur' : ''), text: U.fmt(v, colFmt) }); })))]));
    var tb = h('tbody');
    rowsV.forEach(function (w, i) {
      var tr = h('tr', null, [h('th', { class: 'lbl num' + (i === 2 ? ' cur' : ''), scope: 'row', text: U.fmt(w, rowFmt) })]);
      data[i].forEach(function (v, j) {
        var pos = hi > lo ? (v - lo) / (hi - lo) : 0.5;
        var td = h('td', { class: 'num hc' + (i === 2 && j === 2 ? ' base' : ''), text: isFinite(v) ? U.fmt(v, valFmt) : 'n/a' });
        td.style.setProperty('--h', pos.toFixed(3));
        if (mark && isFinite(v)) td.classList.toggle('below', mark(v));
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    target.appendChild(t);
  }
  var stats = Hub.fin.stats;

  /* ---------- one tool inside another (suites, the strategy engine) ----------
   * embedTab(toolId, note) → tab builder: mounts the registered tool after the tab is shown and
   * unmounts it (saving its state) when the tab is left. Data is the tool's own storage, so the
   * embedded and the stand-alone tool are always the same. */
  function embedTab(toolId, note) {
    return function () {
      var t = Hub.toolById && Hub.toolById(toolId), host = h('div', { class: 'embed-host' }), on = false;
      var el = h('div', { class: 'stack' }, [note ? h('p', { class: 'f-help', text: note }) : null, t && t.mount ? host : h('p', { class: 'muted', text: 'This tool is not loaded in this build.' })]);
      return { el: el, after: function () { if (t && t.mount && !on) { t.mount(host); on = true; } }, dispose: function () { if (on) { try { t.unmount(); } catch (e) { console.error(e); } on = false; } } };
    };
  }
  /* suite: several overlapping tools shown once, as tabs of one page.
   * cfg: { id, title, sections, priority, summary, eyebrow, members: [[toolId, tabLabel, note?]] } */
  var SUITES = {};
  function suite(cfg) {
    var members = cfg.members.filter(function (m) { var t = Hub.toolById && Hub.toolById(m[0]); return t && t.status === 'ready'; });
    if (!members.length) return null;
    SUITES[cfg.id] = { storeKey: 'hub.' + cfg.id + '.v1', members: members.map(function (m) { return m[0]; }) };
    var blank = function () { return { version: 1, tool: cfg.id, settings: {}, sources: {} }; };
    return define({ id: cfg.id, title: cfg.title, sections: cfg.sections, priority: cfg.priority || 0, version: 1, storeKey: 'hub.' + cfg.id + '.v1', summary: cfg.summary,
      sample: blank, run: function () { return { checks: [] }; }, suite: true,
      eyebrow: function () { return cfg.eyebrow || 'Combined view'; }, heading: function () { return cfg.title; },
      tabs: [{ group: cfg.group || 'Parts', items: members.map(function (m) { return ['s-' + m[0], m[1], embedTab(m[0], m[2])]; }) }] });
  }
  Hub.toolkit = { define: define, heat: heat, stats: stats, SCEN: SCEN, embedTab: embedTab, suite: suite, SUITES: SUITES };
})(window);
