/* =====================================================================
 * XL — shared Excel writer for every tool (ExcelJS).
 * Banking convention: blue on pale yellow = input · black = formula ·
 * green = pure link to another sheet. Node-loadable (no DOM).
 *
 *   var b = Hub.xl.book(ExcelJS, 'Company · Tool');
 *   var s = b.sheet('Assumptions', [2, 40, 10, 14, 14]);   // column widths
 *   s.title('Assumptions', 'subtitle');
 *   s.sec(4, 'Header', 6, ['Base', 'Upside']);           // dark band + optional column heads from col D
 *   s.put(3, 5, 0.25, 'in', 'pct');                       // col index 0 = A
 *   s.put(3, 6, { f: '=D5*2' }, 'calc', 'money');
 *   s.ref(3, 5)  -> "'Assumptions'!$D$5"
 * ===================================================================== */
(function (root) {
  'use strict';
  var C = { navy: 'FF1F2A36', grey: 'FFE9EDF1', inFill: 'FFFFF2CC', blue: 'FF0000FF', green: 'FF00804A', black: 'FF000000', white: 'FFFFFFFF', muted: 'FF5B6870' };
  var FMT = { money: '#,##0;(#,##0);"–"', money2: '#,##0.00;(#,##0.00);"–"', pct: '0.0%;(0.0%);"–"', pct2: '0.00%;(0.00%);"–"', days: '0', x: '0.0"x"', x2: '0.00"x"', dec: '0.00', dec3: '0.000', dec4: '0.0000', int: '0', date: 'yyyy-mm-dd', text: '@' };

  function L(n) { var s = ''; n++; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
  function A(c, r) { return L(c) + r; }

  function style(cell, kind, fmt, v) {
    var font = { name: 'Arial', size: 10, color: { argb: C.black } };
    if (kind === 'in') { font.color = { argb: C.blue }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.inFill } }; }
    if (kind === 'calc' && v && v.f && /^=?'[^']+'!\$?[A-Z]+\$?\d+$/.test(v.f)) font.color = { argb: C.green };
    if (kind === 'hdr') { font = { name: 'Arial', size: 10, bold: true, color: { argb: C.white } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } }; }
    if (kind === 'sec') { font.bold = true; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.grey } }; }
    if (kind === 'title') font = { name: 'Arial', size: 14, bold: true, color: { argb: C.navy } };
    if (kind === 'sub') font = { name: 'Arial', size: 9, italic: true, color: { argb: C.muted } };
    if (kind === 'total') { font.bold = true; cell.border = { top: { style: 'thin' } }; }
    if (kind === 'unit') font = { name: 'Arial', size: 9, color: { argb: C.muted } };
    if (kind === 'wrap') cell.alignment = { wrapText: true, vertical: 'top' };
    cell.font = font;
    if (fmt) cell.numFmt = FMT[fmt] || fmt;
    if (kind !== 'wrap' && (typeof v === 'number' || (v && v.f))) cell.alignment = { horizontal: 'right' };
  }

  function book(ExcelJS, label) {
    var wb = new ExcelJS.Workbook();
    wb.creator = 'Finance Models & Solutions Hub'; wb.created = new Date();
    wb.calcProperties.fullCalcOnLoad = true;
    function sheet(name, widths, opts) {
      name = String(name).replace(/[*?:\\/\[\]]/g, '-').slice(0, 31);
      var ws = wb.addWorksheet(name, { views: [Object.assign({ showGridLines: false }, opts || {})] });
      if (widths) ws.columns = widths.map(function (w) { return { width: w }; });
      var api = {
        ws: ws, name: name,
        put: function (c, r, v, kind, fmt) {
          var cell = ws.getCell(A(c, r));
          if (v && typeof v === 'object' && v.f) cell.value = { formula: v.f.replace(/^=/, '') };
          else if (v && typeof v === 'object' && v.date) cell.value = v.date;
          else cell.value = v === undefined || (typeof v === 'number' && !isFinite(v)) ? null : v;
          style(cell, kind, fmt, v);
          return cell;
        },
        band: function (r, c0, c1, kind) { for (var c = c0; c <= c1; c++) style(ws.getCell(A(c, r)), kind); },
        title: function (t, sub) { api.put(1, 1, t, 'title'); if (sub) api.put(1, 2, sub, 'sub'); },
        sec: function (r, label, c1, heads, c0h) {
          api.put(1, r, label, 'hdr'); api.band(r, 1, c1 || 6, 'hdr');
          (heads || []).forEach(function (hd, i) { var cl = api.put((c0h || 3) + i, r, hd, 'hdr'); cl.alignment = { horizontal: 'right' }; });
        },
        ref: function (c, r, rel) { return "'" + name + "'!" + (rel ? A(c, r) : '$' + L(c) + '$' + r); },
        rng: function (c0, r0, c1, r1) { return "'" + name + "'!$" + L(c0) + '$' + r0 + ':$' + L(c1) + '$' + r1; },
        heat: function (ref) { ws.addConditionalFormatting({ ref: ref, rules: [{ type: 'colorScale', cfvo: [{ type: 'min' }, { type: 'percentile', value: 50 }, { type: 'max' }], color: [{ argb: 'FFF8CBAD' }, { argb: 'FFFFFFFF' }, { argb: 'FFC6E0B4' }] }] }); }
      };
      return api;
    }
    return { wb: wb, sheet: sheet, label: label };
  }

  /* generic key/value notes sheet */
  function notes(b, lines, sources) {
    var s = b.sheet('Notes', [2, 120]);
    s.title('Method notes and sources');
    var r = 4;
    lines.forEach(function (n) { s.put(1, r++, '• ' + n, 'wrap'); });
    r++;
    s.put(1, r++, 'Data sources', 'sec');
    var ks = Object.keys(sources || {});
    if (!ks.length) s.put(1, r++, 'All inputs entered manually.');
    ks.forEach(function (k) { s.put(1, r++, k + ': ' + sources[k]); });
    r++;
    s.put(1, r, 'Legend: blue on yellow = input · black = formula · green = link to another sheet', 'sub');
    return s;
  }

  function save(wb, filename) {
    var H = root.Hub;
    return wb.xlsx.writeBuffer().then(function (buf) {
      return H.util.saveFile(filename, new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    }).catch(function (e) { H.util.toast('Excel export failed: ' + e.message, 'crit'); });
  }

  root.Hub = root.Hub || {};
  root.Hub.xl = { book: book, notes: notes, save: save, L: L, A: A, FMT: FMT };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Hub.xl;
})(typeof window !== 'undefined' ? window : globalThis);
