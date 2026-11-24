/* =====================================================================
 * XLSX LITE — values-only Excel reader for financial statements.
 *
 * Why: ExcelJS builds a full object model (every cell with its style,
 * border, font) of the whole workbook before anything can be read.
 * Measured on Safari's engine (JavaScriptCore): a 1.9 MB statement file
 * took +182 MB and an 8.4 MB file +715 MB, which is what closed the page
 * on phones ("Out of Memory").
 *
 * This reader opens the .xlsx zip directly, decompresses one part at a time
 * (DecompressionStream in the browser, zlib in Node), reads only cell values
 * (shared strings, numbers, cached formula results, dates via the number
 * format) and handles one sheet at a time, so the memory held is about one
 * sheet's XML text plus the values.
 *
 *   read(arrayBuffer, opts) -> Promise<{ sheets:[{ name, state, grid, stats }], date1904 }>
 *   sha256(arrayBuffer)     -> Promise<hex>   (file identity for the cache)
 *
 * stats per sheet: rows, cols, cells, nums, texts, errors[addr], noCache[addr]
 * (formula cells with no stored result: the file was saved without
 * calculation, so the value is NOT taken as zero; it is reported).
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};

  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 16777216; }
  var dec = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;
  function utf8(bytes) { if (dec) return dec.decode(bytes); return Buffer.from(bytes).toString('utf8'); }

  // central directory of the zip: name -> { method, comp, size, data offset }
  function directory(b) {
    var e = -1; for (var i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 5 && b[i + 3] === 6) { e = i; break; }
    if (e < 0) throw new Error('The file is not a valid .xlsx (zip directory not found).');
    var n = u16(b, e + 10), off = u32(b, e + 16), out = {};
    if (off === 0xffffffff || n === 0xffff) throw new Error('ZIP64 workbooks (over 4 GB or 65k parts) are not supported.');
    for (var k = 0; k < n; k++) {
      if (u32(b, off) !== 0x02014b50) throw new Error('Corrupt zip directory.');
      var method = u16(b, off + 10), comp = u32(b, off + 20), size = u32(b, off + 24), nl = u16(b, off + 28), xl = u16(b, off + 30), cl = u16(b, off + 32), lo = u32(b, off + 42);
      var name = utf8(b.subarray(off + 46, off + 46 + nl)), data = lo + 30 + u16(b, lo + 26) + u16(b, lo + 28);
      out[name] = { method: method, comp: comp, size: size, at: data }; off += 46 + nl + xl + cl;
    }
    return out;
  }
  function inflate(bytes) {
    if (typeof DecompressionStream !== 'undefined') {
      var ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Response(ds).arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
    }
    if (typeof require === 'function') { var z = require('zlib'); return Promise.resolve(new Uint8Array(z.inflateRawSync(Buffer.from(bytes)))); }
    return Promise.reject(new Error('This browser cannot decompress .xlsx files (DecompressionStream missing). Update the browser, or paste the rows.'));
  }
  function part(b, dir, name) {
    var e = dir[name]; if (!e) return Promise.resolve(null);
    var raw = b.subarray(e.at, e.at + e.comp);
    if (e.method === 0) return Promise.resolve(utf8(raw));
    if (e.method !== 8) return Promise.reject(new Error('Unsupported compression in ' + name + '.'));
    return inflate(raw).then(utf8);
  }

  var ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  function unesc(s) { return s.indexOf('&') < 0 ? s : s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, function (m, g) { return g[0] === '#' ? String.fromCharCode(g[1] === 'x' || g[1] === 'X' ? parseInt(g.slice(2), 16) : +g.slice(1)) : ENT[g.toLowerCase()]; }); }
  function attrs(s) { var o = {}, re = /([\w:]+)="([^"]*)"/g, m; while ((m = re.exec(s))) o[m[1]] = unesc(m[2]); return o; }
  // text of an <si> or <is>: all <t> runs, phonetic runs (<rPh>) excluded
  function runs(x) { x = x.replace(/<rPh\b[\s\S]*?<\/rPh>/g, ''); var o = '', re = /<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g, m; while ((m = re.exec(x))) o += m[1] ? unesc(m[1]) : ''; return o; }
  function colIdx(ref) { var c = 0; for (var i = 0; i < ref.length; i++) { var ch = ref.charCodeAt(i); if (ch < 65 || ch > 90) break; c = c * 26 + ch - 64; } return c; }
  function rowOf(ref) { var m = /\d+$/.exec(ref); return m ? +m[0] : 0; }

  // built-in date formats and custom ones whose code has d / m / y outside quotes and brackets
  var DATE_IDS = { 14: 1, 15: 1, 16: 1, 17: 1, 18: 1, 19: 1, 20: 1, 21: 1, 22: 1, 27: 1, 30: 1, 36: 1, 45: 1, 46: 1, 47: 1, 50: 1, 57: 1 };
  function dateStyles(xml) {
    if (!xml) return [];
    var custom = {}, re = /<numFmt\b([^>]*)\/?>/g, m; while ((m = re.exec(xml))) { var a = attrs(m[1]), code = String(a.formatCode || '').replace(/"[^"]*"|\\.|\[[^\]]*\]/g, ''); custom[a.numFmtId] = (/[dy]/i.test(code) || (/m/i.test(code) && !/[0#?]/.test(code))) && !/^general$/i.test(code); }
    var xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml), out = [];
    if (xfs) { var r2 = /<xf\b([^>]*?)(\/>|>)/g; while ((m = r2.exec(xfs[1]))) { var id = +(attrs(m[1]).numFmtId || 0); out.push(!!(DATE_IDS[id] || custom[id])); } }
    return out;
  }
  function serialDate(v, d1904) { var ms = (v - (d1904 ? -1462 : 25569)) * 864e5; var d = new Date(ms); return isFinite(d.getTime()) ? new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) : null; }

  // one sheet's XML -> rows of values (sparse) + statistics
  function sheetGrid(xml, shared, dstyle, d1904) {
    var grid = [], st = { rows: 0, cols: 0, cells: 0, nums: 0, texts: 0, errors: [], noCache: [], dates: 0 };
    var sd = xml.indexOf('<sheetData'), ed = xml.lastIndexOf('</sheetData>'); if (sd < 0) return { grid: grid, stats: st };
    var body = ed > sd ? xml.slice(sd, ed) : xml.slice(sd);
    var rre = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g, cre = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, rm, cm, lastR = 0;
    while ((rm = rre.exec(body))) {
      var ra = attrs(rm[1]), rn = +ra.r || lastR + 1; lastR = rn; if (!rm[2]) continue;
      var a = null, lastC = 0; cre.lastIndex = 0;
      while ((cm = cre.exec(rm[2]))) {
        var ca = attrs(cm[1]), ref = ca.r || '', ci = ref ? colIdx(ref) : lastC + 1; lastC = ci;
        var inner = cm[2] || '', t = ca.t || 'n', vm = /<v>([\s\S]*?)<\/v>/.exec(inner); if (vm && vm[1] === '' && t !== 'str') vm = null; var hasF = /<f\b/.test(inner), val = null;
        if (t === 's') { if (vm) { val = shared[+vm[1]]; if (val == null) val = null; } }
        else if (t === 'inlineStr') { var is = /<is>([\s\S]*?)<\/is>/.exec(inner); val = is ? runs(is[1]) : null; }
        else if (t === 'str') val = vm ? unesc(vm[1]) : null;
        else if (t === 'b') val = vm ? vm[1] === '1' : null;
        else if (t === 'e') { st.errors.push((ref || ('R' + rn + 'C' + ci)) + (vm ? ' ' + vm[1] : '')); val = null; }
        else if (vm) { var num = +vm[1]; if (isFinite(num)) { val = num; if (ca.s && dstyle[+ca.s]) { var dd = serialDate(num, d1904); if (dd) { val = dd; st.dates++; } } } }
        if (hasF && !vm && t !== 'inlineStr') st.noCache.push(ref || ('R' + rn + 'C' + ci));
        if (val === null || val === '') continue;
        if (!a) { a = []; grid[rn - 1] = a; st.rows++; }
        a[ci - 1] = val; st.cells++; if (typeof val === 'number') st.nums++; else if (typeof val === 'string') st.texts++;
        if (ci > st.cols) st.cols = ci;
      }
    }
    for (var i = 0; i < grid.length; i++) if (!grid[i]) grid[i] = [];
    return { grid: grid, stats: st };
  }

  function relTarget(t) { t = String(t || ''); if (t[0] === '/') return t.slice(1); return 'xl/' + t.replace(/^\.\//, ''); }

  /* read the workbook; opts.onSheet(sheet, i, n) is called after each sheet (the caller can parse it and drop the grid),
     opts.yieldMs lets the browser breathe between sheets */
  function read(ab, opts) {
    opts = opts || {}; var b = ab instanceof Uint8Array ? ab : new Uint8Array(ab), dir;
    try { dir = directory(b); } catch (e) { return Promise.reject(e); }
    var wbx, rels, shared = [], dstyle = [], d1904 = false;
    return part(b, dir, 'xl/workbook.xml').then(function (x) {
      if (!x) throw new Error('No workbook part in the file (is it an .xlsx?).'); wbx = x; d1904 = /date1904="(1|true)"/.test(x);
      return part(b, dir, 'xl/_rels/workbook.xml.rels');
    }).then(function (x) { rels = x || ''; return part(b, dir, 'xl/sharedStrings.xml'); })
      .then(function (x) { if (x) { var re = /<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g, m; while ((m = re.exec(x))) shared.push(m[1] ? runs(m[1]) : ''); } return part(b, dir, 'xl/styles.xml'); })
      .then(function (x) {
        dstyle = dateStyles(x);
        var rid = {}, re = /<Relationship\b([^>]*)\/?>/g, m; while ((m = re.exec(rels))) { var a = attrs(m[1]); rid[a.Id] = relTarget(a.Target); }
        var sheets = [], r2 = /<sheet\b([^>]*)\/?>/g; while ((m = r2.exec(wbx))) { var s = attrs(m[1]); sheets.push({ name: s.name, state: s.state || 'visible', path: rid[s['r:id']] || ('xl/worksheets/sheet' + (sheets.length + 1) + '.xml') }); }
        var out = { sheets: [], date1904: d1904, nParts: Object.keys(dir).length }, i = 0;
        function next() {
          if (i >= sheets.length) return Promise.resolve(out);
          var S = sheets[i++];
          return part(b, dir, S.path).then(function (xml) {
            var g = xml ? sheetGrid(xml, shared, dstyle, d1904) : { grid: [], stats: { rows: 0, cols: 0, cells: 0, nums: 0, texts: 0, errors: [], noCache: [], dates: 0, missing: true } };
            xml = null; var sh = { name: S.name, state: S.state, grid: g.grid, stats: g.stats };
            if (opts.onSheet) { opts.onSheet(sh, i - 1, sheets.length); sh.grid = null; }
            out.sheets.push(sh);
            return new Promise(function (res) { setTimeout(res, opts.yieldMs || 0); }).then(next);
          });
        }
        return next();
      });
  }

  function sha256(ab) {
    var c = root.crypto && root.crypto.subtle;
    if (c) return c.digest('SHA-256', ab).then(function (h) { return Array.prototype.map.call(new Uint8Array(h), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); });
    if (typeof require === 'function') return Promise.resolve(require('crypto').createHash('sha256').update(Buffer.from(ab)).digest('hex'));
    return Promise.resolve(null);
  }

  Hub.xlsxLite = { read: read, sha256: sha256, _sheetGrid: sheetGrid, _dateStyles: dateStyles };
  if (typeof module !== 'undefined' && module.exports) module.exports = Hub.xlsxLite;
})(typeof window !== 'undefined' ? window : globalThis);
