/* =====================================================================
 * GRID — spreadsheet-style table used by every model.
 *   - Input cells: blue (banker convention: hard-coded inputs)
 *   - Calc cells : neutral (formulas)
 *   - Fetched    : green row tag (linked / imported data)
 *   - Paste a block copied from Excel/Codal into any input cell: it fills
 *     right and down. Persian digits, (negatives), 1,234 and % are parsed.
 *   - Enter commits and moves down; Tab moves right (browser default).
 *
 * row spec:
 *   { type:'head', label }                         section header
 *   { label, unit, cls, tag, cell:function(c){...} }
 *       cell(c) returns one of
 *         { input: true, get:fn, set:fn(v), fmt }   editable
 *         { value: fn|number, fmt }                  calculated
 *         null                                       blank
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  var U = Hub.util, h = U.h;

  function table(spec) {
    var refreshers = [];
    var thead = h('thead', null, [h('tr', null, [h('th', { class: 'lbl', scope: 'col', text: spec.corner || '' }), h('th', { class: 'unit', scope: 'col', text: spec.unitHead || '' })]
      .concat(spec.cols.map(function (c) { return h('th', { class: 'num ' + (c.cls || ''), scope: 'col', text: c.label }); })))]);
    var tbody = h('tbody');
    var r = 0;

    spec.rows.forEach(function (row) {
      if (row.type === 'head') {
        tbody.appendChild(h('tr', { class: 'sec' }, [h('th', { colspan: spec.cols.length + 2, scope: 'colgroup', text: row.label })]));
        return;
      }
      var labelKids = [row.label];
      if (row.tag) labelKids.push(h('span', { class: 'src-tag', title: 'Fetched from ' + row.tag, text: row.tag.split(' ')[0] }));
      if (row.note) labelKids.push(h('span', { class: 'note-dot', title: row.note, text: 'i' }));
      var tr = h('tr', { class: row.cls || '' }, [h('th', { class: 'lbl', scope: 'row' }, labelKids), h('td', { class: 'unit', text: row.unit || '' })]);
      var rr = r++;
      spec.cols.forEach(function (col, ci) {
        var c = row.cell(ci, col);
        var td = h('td', { class: 'num ' + (col.cls || '') });
        if (!c) { tr.appendChild(td); return; }
        if (c.input) {
          td.classList.add('in-cell');
          var inp = h('input', { class: 'cell-in' + (row.tag ? ' fetched' : ''), type: 'text', inputmode: 'decimal', autocomplete: 'off', spellcheck: 'false',
            id: (spec.id || 'g') + '-' + rr + '-' + ci, 'aria-label': row.label + ' ' + col.label, dataset: { r: rr, c: ci } });
          inp.value = U.toInput(c.get(), c.fmt);
          inp._cell = c;
          inp.addEventListener('change', function () { commit(inp); });
          inp.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); commit(inp); move(inp, 1, 0); }
            else if (e.key === 'ArrowDown' && e.altKey) { move(inp, 1, 0); }
            else if (e.key === 'ArrowUp' && e.altKey) { move(inp, -1, 0); }
          });
          inp.addEventListener('focus', function () { inp.select(); });
          inp.addEventListener('paste', function (e) { onPaste(e, inp); });
          td.appendChild(inp);
        } else {
          var getter = typeof c.value === 'function' ? c.value : function () { return c.value; };
          var paint = function () {
            var v = getter();
            td.textContent = typeof v === 'string' ? v : U.fmt(v, c.fmt);
            td.classList.toggle('neg', typeof v === 'number' && v < 0);
            if (c.flag) td.classList.toggle('flag', !!c.flag(v));
          };
          paint(); refreshers.push(paint);
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

    var tbl = h('table', { class: 'grid ' + (spec.cls || '') }, [thead, tbody]);
    if (spec.caption) tbl.insertBefore(h('caption', { text: spec.caption }), thead);
    var wrap = h('div', { class: 'grid-wrap' }, [tbl]);

    function commit(inp) {
      var c = inp._cell, v = U.fromInput(inp.value, c.fmt);
      if (!isFinite(v)) { U.toast('Not a number: "' + inp.value + '"', 'warn'); inp.value = U.toInput(c.get(), c.fmt); return; }
      c.set(v);
      inp.value = U.toInput(c.get(), c.fmt);
      if (spec.onChange) spec.onChange();
    }
    function cellAt(r2, c2) { return tbl.querySelector('input[data-r="' + r2 + '"][data-c="' + c2 + '"]'); }
    function move(inp, dr, dc) {
      var n = cellAt(+inp.dataset.r + dr, +inp.dataset.c + dc);
      if (n) n.focus();
    }
    function onPaste(e, inp) {
      var txt = (e.clipboardData || root.clipboardData).getData('text');
      if (!/[\t\n]/.test(txt.trim())) return;          // single value: let the browser paste
      e.preventDefault();
      var lines = txt.replace(/\r/g, '').replace(/\n$/, '').split('\n').map(function (l) { return l.split('\t'); });
      var r0 = +inp.dataset.r, c0 = +inp.dataset.c, n = 0, bad = 0;
      lines.forEach(function (cells, i) {
        cells.forEach(function (raw, j) {
          var t = cellAt(r0 + i, c0 + j);
          if (!t) return;
          var v = U.fromInput(raw, t._cell.fmt);
          if (!isFinite(v)) { bad++; return; }
          t._cell.set(v); t.value = U.toInput(t._cell.get(), t._cell.fmt); n++;
        });
      });
      if (spec.onChange) spec.onChange();
      U.toast('Pasted ' + n + ' cell' + (n === 1 ? '' : 's') + (bad ? ' (' + bad + ' skipped, not numeric)' : ''), bad ? 'warn' : 'good');
    }

    return { el: wrap, refresh: function () { refreshers.forEach(function (f) { f(); }); } };
  }

  /* simple label/value form for scalar inputs */
  function form(spec) {
    var refreshers = [];
    var rows = spec.fields.map(function (f) {
      if (f.type === 'head') return h('div', { class: 'f-head', text: f.label });
      if (f.type === 'note') return h('p', { class: 'f-help', text: f.label });
      var id = (spec.id || 'f') + '-' + f.key;
      var ctl;
      if (f.options) {
        ctl = h('select', { id: id, class: 'f-sel' }, f.options.map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
        ctl.value = f.get();
        ctl.addEventListener('change', function () { f.set(ctl.value); if (spec.onChange) spec.onChange(); });
      } else if (f.calc) {
        ctl = h('output', { id: id, class: 'f-out' });
        var paint = function () { var v = f.calc(); ctl.textContent = typeof v === 'string' ? v : U.fmt(v, f.fmt); };
        paint(); refreshers.push(paint);
      } else if (f.text) {
        ctl = h('input', { id: id, class: 'f-text', type: 'text', value: f.get() || '' });
        ctl.addEventListener('change', function () { f.set(ctl.value); if (spec.onChange) spec.onChange(); });
      } else {
        ctl = h('input', { id: id, class: 'f-in' + (f.tag ? ' fetched' : ''), type: 'text', inputmode: 'decimal', autocomplete: 'off' });
        ctl.value = U.toInput(f.get(), f.fmt);
        ctl.addEventListener('focus', function () { ctl.select(); });
        if (f.optional) ctl.placeholder = f.placeholder || (Hub.i18n && Hub.i18n.lang() === 'fa' ? 'نامشخص' : 'unknown');
        ctl.addEventListener('change', function () {
          // optional fields: an empty box means "unknown" (null), never zero
          if (f.optional && !String(ctl.value).trim()) { f.set(null); if (spec.onChange) spec.onChange(); return; }
          var v = U.fromInput(ctl.value, f.fmt);
          if (!isFinite(v)) { U.toast('Not a number: "' + ctl.value + '"', 'warn'); ctl.value = U.toInput(f.get(), f.fmt); return; }
          f.set(v); ctl.value = U.toInput(f.get(), f.fmt); if (spec.onChange) spec.onChange();
        });
        ctl._sync = function () { ctl.value = U.toInput(f.get(), f.fmt); };
      }
      var lbl = h('label', { for: id, class: 'f-lbl' }, [f.label, f.tag ? h('span', { class: 'src-tag', title: 'Fetched: ' + f.tag, text: f.tag.split(' ')[0] }) : null]);
      return h('div', { class: 'f-row' + (f.calc ? ' is-calc' : '') + (f.strong ? ' strong' : '') }, [lbl, ctl, h('span', { class: 'f-unit', text: f.unit || '' }), f.help ? h('p', { class: 'f-help', text: f.help }) : null]);
    });
    return { el: h('div', { class: 'form ' + (spec.cls || '') }, rows), refresh: function () { refreshers.forEach(function (f) { f(); }); } };
  }

  Hub.grid = { table: table, form: form };
})(window);
