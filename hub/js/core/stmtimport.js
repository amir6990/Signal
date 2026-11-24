/* =====================================================================
 * STATEMENT IMPORT — read the user's own Excel file (up to 3 historical
 * years) and return every line exactly as named in the file.
 *   parseGrid(rows, sheetName) -> blocks [{ type, title, years, rows:[{label, vals}] , ... }]
 *   readFile(File) -> Promise<{ blocks, unit, currency }>   (browser, ExcelJS)
 * Handles: Persian or English labels, Persian/Arabic digits, (negatives),
 * formulas (cached results), RTL sheets, a note-number column, all three
 * statements on one sheet (split on their titles) or one per sheet,
 * year headers such as "1403", "سال 1403", "1403/12/29", "FY2024", dates.
 * The newest 3 years are kept, oldest first. Nothing is aggregated here:
 * the model receiving the lines keeps each one under its own name.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};

  function digits(s) { return String(s).replace(/[۰-۹]/g, function (d) { return d.charCodeAt(0) - 1776; }).replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 1632; }); }
  function norm(s) { return digits(String(s == null ? '' : s)).replace(/‌/g, ' ').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim(); }
  function cellVal(v) {
    if (v == null) return null;
    if (v instanceof Date) return v;
    if (typeof v === 'object') {
      if ('result' in v) return cellVal(v.result);
      if (v.richText) return v.richText.map(function (t) { return t.text; }).join('');
      if ('text' in v) return v.text;
      if (v.error) return null;
      return null;
    }
    return v;
  }
  // number from a cell: 1,234 · (1,234) · ۱٬۲۳۴ · −1234 · "-" → 0
  function toNum(v) {
    v = cellVal(v);
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    if (v == null || v instanceof Date) return NaN;
    var s = norm(v).replace(/[٬,\s]/g, '').replace(/٫/g, '.').replace(/[−–]/g, '-');
    if (s === '-' || s === '—') return 0;
    var neg = /^\(.*\)$/.test(s); if (neg) s = s.slice(1, -1);
    if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
    var n = parseFloat(s); return neg ? -n : n;
  }
  function isText(v) { v = cellVal(v); return typeof v === 'string' && /[A-Za-z؀-ۿ]/.test(v) && !isFinite(toNum(v)); }
  // a year in a header cell
  function yearOf(v) {
    v = cellVal(v);
    if (v instanceof Date) return v.getFullYear();
    if (typeof v === 'number') return (v >= 1350 && v <= 1430) || (v >= 1990 && v <= 2045) ? v : null;
    if (typeof v !== 'string') return null;
    var m = norm(v).match(/(^|[^\d])(13[5-9]\d|14[0-3]\d|199\d|20[0-4]\d)(?!\d)/);
    return m ? +m[2] : null;
  }

  var TITLES = [
    ['skip', /حقوق مالکانه \(|صورت (تغییرات (در )?)?حقوق مالکانه|changes in equity|statement of equity/i],
    ['IS', /صورت سود و زیان|سود و زیان|income statement|profit (and|&) loss|statement of (comprehensive )?income|\bp ?& ?l\b/i],
    ['BS', /صورت وضعیت مالی|وضعیت مالی|ترازنامه|balance sheet|financial position/i],
    ['CF', /جریان(‌| )?های نقدی|جریان وجو?ه نقد|نقد عملیاتی|cash ?flows?/i]
  ];
  var KEYS = {
    IS: /درآمد|فروش|بهای تمام|سود ناخالص|هزینه|revenue|sales|cost of|gross profit|expense|net income|سود خالص/i,
    BS: /دارایی|بدهی|حقوق مالکانه|موجودی|دریافتنی|پرداختنی|سرمایه|assets|liabilities|equity|receivable|payable|inventor/i,
    CF: /نقد حاصل|پرداخت|دریافت(‌| )?های نقدی|جریان|خرید دارایی|cash (generated|from|used)|purchase of|proceeds|paid/i
  };
  function titleType(s) { s = norm(s); for (var i = 0; i < TITLES.length; i++) if (TITLES[i][1].test(s)) return TITLES[i][0]; return null; }
  function guessType(name, labels) {
    var t = titleType(name); if (t) return t;
    var sc = { IS: 0, BS: 0, CF: 0 };
    labels.forEach(function (l) { Object.keys(KEYS).forEach(function (k) { if (KEYS[k].test(l)) sc[k]++; }); });
    var best = Object.keys(sc).sort(function (a, b) { return sc[b] - sc[a]; })[0];
    return sc[best] ? best : 'skip';
  }

  function parseGrid(rows, sheetName) {
    rows = rows.map(function (r) { return (r || []).map(cellVal); });
    var W = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
    // 1) header row: ≥ 2 distinct years in distinct columns (first 40 rows)
    var hdr = -1, ycols = [];
    for (var i = 0; i < Math.min(rows.length, 40) && hdr < 0; i++) {
      var found = [];
      rows[i].forEach(function (v, c) { var y = yearOf(v); if (y) found.push({ col: c, year: y, partial: /ماه|month|half|\b[HhQq][1-4]\b|\b[369]M\b|میان ?دوره|interim/i.test(norm(cellVal(v))) }); });
      var uniq = {}; found.forEach(function (f) { uniq[f.year] = 1; });
      if (Object.keys(uniq).length >= 2) { hdr = i; ycols = found; }
    }
    // numeric density per column below the header
    var start = hdr + 1, dens = [];
    for (var c = 0; c < W; c++) {
      var n = 0, small = 0;
      for (var r = start; r < rows.length; r++) { var x = toNum(rows[r][c]); if (isFinite(x) && rows[r][c] !== '' && rows[r][c] != null) { n++; if (Math.abs(x) < 100 && x === Math.round(x)) small++; } }
      dens.push({ n: n, note: n > 0 && small / n > 0.8 });
    }
    var ordered, guessed = false;
    if (ycols.length) {
      // one column per year: for duplicates (e.g. restated) keep the one with more numbers
      var by = {};
      ycols.forEach(function (f) { var key = f.year + (f.partial ? 'p' : ''); if (!by[key] || dens[f.col].n > dens[by[key].col].n) by[key] = f; });
      ordered = Object.keys(by).map(function (y) { return by[y]; }).filter(function (f) { return dens[f.col].n > 0; }).sort(function (a, b) { return a.year - b.year || (a.partial ? 1 : 0) - (b.partial ? 1 : 0); });
    } else {
      var maxN = Math.max.apply(null, dens.map(function (d) { return d.n; }).concat([0]));
      var cols = []; dens.forEach(function (d, c) { if (d.n >= Math.max(2, maxN * 0.5) && !d.note) cols.push(c); });
      // no year header: Codal / Persian layout puts the latest year first; English layouts oldest first
      var fa = rows.some(function (r) { return r.some(function (v) { return typeof v === 'string' && /[؀-ۿ]/.test(v); }); });
      if (fa) cols.reverse();
      guessed = true;
      ordered = cols.map(function (c, k) { return { col: c, year: null, k: k }; });
    }
    // keep every year column; the model uses a window of up to 3 (default: the latest 3)
    var yset = {}; ordered.forEach(function (f) { yset[f.col] = 1; });
    // label column: most text cells outside the year columns
    var best = -1, bestN = -1;
    for (var c2 = 0; c2 < W; c2++) { if (yset[c2]) continue; var tn = 0; for (var r2 = start; r2 < rows.length; r2++) if (isText(rows[r2][c2])) tn++; if (tn > bestN) { bestN = tn; best = c2; } }
    // 2) rows, split into blocks on statement titles
    var blocks = [], cur = null, unit = null, currency = null;
    var sheetType = titleType(sheetName);
    function open(type, title) { cur = { sheet: sheetName, title: title || sheetName, type: type || sheetType, titled: !!(type || sheetType), rows: [] }; blocks.push(cur); }
    var hdrYears = ordered.map(function (f) { return f.year; }), grp = '';
    for (var r3 = 0; r3 < rows.length; r3++) {
      var row = rows[r3], txt = row.filter(isText).map(norm).join(' ');
      if (/میلیون ریال|million rials?|ملیون ریال/i.test(txt)) { unit = 'million'; currency = 'IRR'; }
      else if (/میلیارد ریال|billion rials?/i.test(txt)) { unit = 'billion'; currency = 'IRR'; }
      else if (/هزار ریال|thousand rials?/i.test(txt) && !unit) { unit = 'thousand'; currency = 'IRR'; }
      if (r3 <= hdr) { var tt0 = titleType(txt); if (tt0 && !cur) open(tt0, txt); continue; }
      var vals = ordered.map(function (f) { return toNum(row[f.col]); });
      var any = vals.some(function (v) { return isFinite(v); });
      var label = best >= 0 && isText(row[best]) ? norm(row[best]) : row.map(function (v, c) { return yset[c] ? null : v; }).filter(isText).map(norm)[0];
      if (!any) { var tt = titleType(txt); if (tt && (!cur || cur.type !== tt || cur.rows.length)) open(tt, txt); else if (txt) grp = txt; continue; }
      if (!label) continue;
      // a repeated header row ("عنوان | 1402 | 1403") or a sub-title carrying the years
      if (ordered.length && vals.every(function (v, k) { return !isFinite(v) || v === hdrYears[k] || yearOf(v) === v; }) && vals.some(function (v) { return yearOf(v) === v; })) {
        var tt2 = titleType(txt); if (tt2) open(tt2, txt); continue;
      }
      if (/^(یادداشت|note|notes)$/i.test(label)) continue;
      if (!cur) open(null, sheetName);
      cur.rows.push({ label: label, grp: grp, all: vals.map(function (v) { return isFinite(v) ? v : 0; }) });
    }
    blocks = blocks.filter(function (b) { return b.rows.length; });
    blocks.forEach(function (b) {
      if (!b.type) b.type = guessType(sheetName + ' ' + b.title, b.rows.map(function (x) { return x.label; }));
      b.allYears = ordered.map(function (f, k) { return f.year != null ? String(f.year) + (f.partial ? ' (part-year)' : '') : 'Y' + (k + 1); });
      b.guessedOrder = guessed;
      // default window: the latest full-year columns (interim / 6-month columns are not mixed with annual ones)
      // files that also carry forecasts: an interim column (e.g. 6 months of 1404) marks the current year, so actuals end the
      // year before it; columns where most numbers have decimals are model outputs (forecasts), not reported figures
      var pYear = null; ordered.forEach(function (f) { if (f.partial && f.year != null && pYear == null) pYear = f.year; });
      var calc = ordered.map(function (f, k) { var n = 0, d = 0; b.rows.forEach(function (r) { var v = r.all[k]; if (isFinite(v) && Math.abs(v) >= 10) { n++; if (Math.abs(v - Math.round(v)) > 1e-6) d++; } }); return n >= 4 && d / n > 0.3; });
      var endFull = -1; ordered.forEach(function (f, k) { if (!f.partial && !(pYear != null && f.year >= pYear) && !calc[k]) endFull = k; });
      if (endFull < 0) ordered.forEach(function (f, k) { if (!f.partial) endFull = k; });
      setWindow(b, endFull >= 0 ? endFull : b.allYears.length - 1);
    });
    return { blocks: blocks, unit: unit, currency: currency };
  }

  // use up to 3 years ending at column index `end` (oldest first)
  function setWindow(b, end) {
    end = Math.max(0, Math.min(end, b.allYears.length - 1)); var st = Math.max(0, end - 2);
    b.end = end; b.years = b.allYears.slice(st, end + 1);
    b.rows.forEach(function (r) { r.vals = r.all.slice(st, end + 1); });
    return b;
  }
  // reverse the year order of a block (when the file had no year header and the guess was wrong)
  function flip(b) { b.rows.forEach(function (r) { r.all.reverse(); }); b.allYears.reverse(); return setWindow(b, b.end); }

  /* categories of supporting information (notes and schedules) found next to the statements; they are kept with the
     company file and listed in the extraction report, so the financing analysis can show what the file holds */
  var CATS = [
    ['facilities', 'تسهیلات و بدهی‌های مالی', /تسهیلات|وام|اوراق (بدهی|مشارکت|صکوک)|بدهی(‌| )?های مالی|borrowings?|loans?|facilit|bonds?/i],
    ['related', 'اشخاص وابسته', /اشخاص (وابسته|مرتبط)|related part/i],
    ['projects', 'طرح‌های توسعه و سرمایه‌گذاری', /طرح(‌| )?های? (توسعه|در جریان)|دارایی(‌| )?های در جریان تکمیل|پیش(‌| )?پرداخت(‌| )?های سرمایه(‌| )?ای|capital (work|projects)|construction in progress/i],
    ['commit', 'تعهدات و بدهی‌های احتمالی', /تعهدات|بدهی(‌| )?های احتمالی|ضمانت|commitments?|contingen|guarantee/i],
    ['receivables', 'مطالبات', /دریافتنی|مطالبات|receivable/i],
    ['equity', 'تغییرات حقوق مالکانه', /تغییرات (در )?حقوق مالکانه|changes in equity/i],
    ['interim', 'اطلاعات میان‌دوره‌ای', /میان(‌| )?دوره|۶ ?ماهه|شش ?ماهه|interim|half.year/i],
    ['ppe', 'دارایی‌های ثابت', /دارایی(‌| )?های ثابت|property,? plant|ppe/i]
  ];
  function catOf(b, head) { var t = norm(b.sheet + ' ' + (head || '') + ' ' + (b.title || '') + ' ' + b.rows.slice(0, 4).map(function (r) { return r.label; }).join(' ')); for (var i = 0; i < CATS.length; i++) if (CATS[i][2].test(t)) return CATS[i][0]; return null; }

  // balance checks on what was read: total assets = equity + liabilities; revenue − cost = gross profit
  function reconcile(blocks) {
    var out = [], rows = function (type) { var o = []; blocks.forEach(function (b) { if (b.type === type && !b.hidden) b.rows.forEach(function (r) { o.push({ r: r, years: b.allYears }); }); }); return o; };
    var find = function (list, re) { for (var i = 0; i < list.length; i++) if (re.test(list[i].r.label)) return list[i]; return null; };
    var BS = rows('BS'), IS = rows('IS'), tol = function (a, b) { return Math.abs(a - b) <= Math.max(2, Math.abs(a) * 0.001); };
    var ta = find(BS, /^جمع دارایی ?ها$|^total assets$/i), tle = find(BS, /^جمع (حقوق مالکانه و بدهی ?ها|بدهی ?ها و حقوق مالکانه)$|^total (equity and liabilities|liabilities and equity)$/i);
    if (ta && tle && ta.r.all.length === tle.r.all.length) ta.r.all.forEach(function (v, k) { out.push({ c: 'ترازنامه ' + (ta.years[k] || ''), ok: tol(v, tle.r.all[k]), t: 'جمع دارایی‌ها ' + v + ' / جمع حقوق مالکانه و بدهی‌ها ' + tle.r.all[k] }); });
    else out.push({ c: 'ترازنامه', ok: null, t: 'سطر «جمع دارایی‌ها» یا «جمع حقوق مالکانه و بدهی‌ها» با همین نام پیدا نشد؛ کنترل تراز انجام نشد' });
    var rv = find(IS, /^درآمدهای? عملیاتی$|^فروش( خالص)?$|^revenue$|^sales$/i), cg = find(IS, /^بهای تمام شده/i), gp = find(IS, /^سود( \(زیان\))? ناخالص$|^gross profit$/i);
    if (rv && cg && gp) rv.r.all.forEach(function (v, k) { var c = cg.r.all[k], g = gp.r.all[k]; if (!v && !g) return; out.push({ c: 'سود ناخالص ' + (rv.years[k] || ''), ok: tol(v - Math.abs(c), g), t: 'درآمد ' + v + ' − بهای تمام‌شده ' + Math.abs(c) + ' = ' + (v - Math.abs(c)) + '؛ در فایل ' + g }); });
    return out;
  }

  /* reads the file with the values-only reader (memory ≈ one sheet at a time); a file read before (same SHA-256) comes from the cache.
     prog(i, n, sheetName) reports progress. The result carries a full extraction report. */
  var CKEY = 'hub.xlcache.v1';
  function readFile(file, prog) {
    return file.arrayBuffer().then(function (buf) {
      var L = Hub.xlsxLite, St = Hub.util && Hub.util.store;
      if (!L) return readFileExcelJS(file, buf);
      return L.sha256(buf).then(function (hash) {
        var C = St && hash ? St.get(CKEY, {}) || {} : {}, hit = hash && C[hash];
        if (hit) { var r0 = JSON.parse(JSON.stringify(hit.r)); r0.file = file.name; r0.report.cached = true; r0.report.file = file.name; return r0; }
        var t0 = Date.now(), out = { blocks: [], unit: null, currency: null, file: file.name },
          rep = { file: file.name, size: buf.byteLength, hash: hash, sheets: [], at: new Date().toISOString(), reader: 'xlsx-lite (values only)' };
        return L.read(buf, { onSheet: function (sh, i, n) {
          if (prog) prog(i + 1, n, sh.name);
          var p = parseGrid(sh.grid, sh.name), hid = sh.state !== 'visible', st = sh.stats;
          var head = sh.grid.slice(0, 5).map(function (r) { return (r || []).filter(function (v) { return typeof v === 'string'; }).join(' '); }).join(' ');
          p.blocks.forEach(function (b) { b.hidden = hid; if (hid) b.pref = false; b.cat = catOf(b, head); if (!b.cat && b.type === 'skip') b.cat = 'other'; b.head = head.slice(0, 120); });
          out.blocks = out.blocks.concat(p.blocks); out.unit = out.unit || p.unit; out.currency = out.currency || p.currency;
          var why = p.blocks.length ? '' : !st.cells ? 'برگه خالی است' : !st.nums ? 'عدد ندارد (فقط متن)' : 'ستون سال (مثل ۱۴۰۳ یا 2024) یا سطرهای «عنوان + ارقام» پیدا نشد';
          rep.sheets.push({ name: sh.name, state: sh.state, rows: st.rows, cols: st.cols, cells: st.cells, nums: st.nums, texts: st.texts, dates: st.dates,
            errors: st.errors.length, errorAt: st.errors.slice(0, 12), noCache: st.noCache.length, noCacheAt: st.noCache.slice(0, 12),
            blocks: p.blocks.length, lines: p.blocks.reduce(function (a, b) { return a + b.rows.length; }, 0), types: p.blocks.map(function (b) { return b.type; }),
            years: p.blocks.length ? p.blocks[0].allYears : [], cats: p.blocks.map(function (b) { return b.cat; }).filter(Boolean), why: why });
        } }).then(function () {
          rep.ms = Date.now() - t0; rep.nSheets = rep.sheets.length; rep.nBlocks = out.blocks.length; rep.unit = out.unit; rep.currency = out.currency;
          rep.rows = rep.sheets.reduce(function (a, s) { return a + s.rows; }, 0); rep.cells = rep.sheets.reduce(function (a, s) { return a + s.cells; }, 0);
          rep.errors = rep.sheets.reduce(function (a, s) { return a + s.errors; }, 0); rep.noCache = rep.sheets.reduce(function (a, s) { return a + s.noCache; }, 0);
          rep.unused = rep.sheets.filter(function (s) { return !s.blocks; }).map(function (s) { return { name: s.name, why: s.why, state: s.state }; });
          var types = {}; out.blocks.forEach(function (b) { if (!b.hidden) types[b.type] = (types[b.type] || 0) + 1; }); rep.types = types;
          var cats = {}; out.blocks.forEach(function (b) { if (b.cat) cats[b.cat] = (cats[b.cat] || 0) + 1; }); rep.cats = cats;
          rep.periods = {}; out.blocks.forEach(function (b) { b.allYears.forEach(function (y) { rep.periods[y] = 1; }); }); rep.periods = Object.keys(rep.periods);
          rep.recon = reconcile(out.blocks);
          var noCacheUsed = rep.sheets.some(function (s) { return s.noCache && s.blocks; });
          rep.status = !out.blocks.length ? 'fail' : (!types.IS || !types.BS || noCacheUsed || rep.recon.some(function (x) { return x.ok === false; })) ? 'partial' : 'ok';
          rep.statusFa = { ok: 'موفق', partial: 'ناقص — موارد زیر را بررسی کنید', fail: 'ناموفق' }[rep.status];
          out.report = rep;
          if (St && hash) { try { C[hash] = { at: Date.now(), r: out }; var ks = Object.keys(C).sort(function (a, b) { return C[b].at - C[a].at; }); ks.slice(4).forEach(function (k) { delete C[k]; }); St.set(CKEY, C); } catch (e) { /* cache is optional */ } }
          return out;
        });
      }).catch(function (e) {
        // the values-only reader failed (unusual zip): the full reader is tried only for small files, it needs ≈ 90× the file size in memory
        if (buf.byteLength < 3e6 && root.ExcelJS) return readFileExcelJS(file, buf).then(function (r) { r.report = { file: file.name, size: buf.byteLength, reader: 'ExcelJS (پشتیبان)', note: 'خواننده سبک خطا داد: ' + e.message, sheets: [], status: 'partial', statusFa: 'ناقص — گزارش کامل کنترل برای این روش در دسترس نیست', recon: reconcile(r.blocks) }; return r; });
        throw new Error('خواندن فایل ممکن نشد: ' + e.message + (buf.byteLength >= 3e6 ? ' (برای جلوگیری از کمبود حافظه، روش جایگزین سنگین روی فایل‌های بالای ۳ مگابایت اجرا نمی‌شود)' : ''));
      });
    });
  }
  function readFileExcelJS(file, buf) {
    if (!root.ExcelJS) return Promise.reject(new Error('Excel library did not load.'));
    var wb = new root.ExcelJS.Workbook();
    return wb.xlsx.load(buf).then(function () {
      var out = { blocks: [], unit: null, currency: null, file: file.name };
      wb.eachSheet(function (ws) {
        if (ws.state && ws.state !== 'visible') return;
        var grid = [];
        ws.eachRow({ includeEmpty: true }, function (row, rn) { var a = []; row.eachCell({ includeEmpty: true }, function (cell, cn) { a[cn - 1] = cell.value; }); grid[rn - 1] = a; });
        for (var i = 0; i < grid.length; i++) if (!grid[i]) grid[i] = [];
        var p = parseGrid(grid, ws.name);
        out.blocks = out.blocks.concat(p.blocks); out.unit = out.unit || p.unit; out.currency = out.currency || p.currency;
      });
      return out;
    });
  }

  // cash-flow rows the models use: capex, dividends paid, D&A (memo when the income statement has none)
  var CF_PICK = {
    capex: /خرید دارایی(‌| )?های ثابت|تحصیل دارایی|پرداخت(‌| )?های نقدی برای خرید دارایی|purchase of (property|plant|ppe|fixed|intangible)|capital expenditure|capex/i,
    dividends: /سود سهام پرداختی|پرداخت سود سهام|dividends? paid/i,
    da: /استهلاک|depreciation|amorti/i
  };
  function pickCF(blocks) {
    var o = { capex: null, dividends: null, da: null };
    blocks.filter(function (b) { return b.type === 'CF'; }).forEach(function (b) {
      b.rows.forEach(function (r) {
        Object.keys(CF_PICK).forEach(function (k) {
          if (!CF_PICK[k].test(r.label) || /جمع|total|خالص|net/i.test(r.label) && k !== 'da') return;
          if (!o[k]) o[k] = r.vals.map(function () { return 0; });
          r.vals.forEach(function (v, i) { o[k][i] += Math.abs(v); });
        });
      });
    });
    return o;
  }

  var CATFA = {}; CATS.forEach(function (c) { CATFA[c[0]] = c[1]; }); CATFA.other = 'سایر جداول';
  // extraction control report (Persian): file, sheets, rows, errors, formulas without stored values, periods, reconciliation
  function reportDom(rep) {
    var U = Hub.util, h = U.h, f = function (v) { return U.fmtNum ? U.fmtNum(v) : String(v); };
    if (!rep) return h('p', { class: 'muted', text: 'گزارش کنترل استخراج برای این فایل موجود نیست (فایل پیش از این نسخه وارد شده است؛ برای گزارش، دوباره وارد کنید).' });
    var tbl = function (head, rows) { var t = h('table', { class: 'grid' }); t.appendChild(h('thead', null, [h('tr', null, head.map(function (x) { return h('th', { text: x }); }))])); var b = h('tbody'); rows.forEach(function (r) { b.appendChild(h('tr', null, r.map(function (x) { return h('td', { text: x == null ? '—' : String(x) }); }))); }); t.appendChild(b); return h('div', { class: 'grid-wrap' }, [t]); };
    var ty = rep.types || {}, cats = rep.cats || {};
    var sum = [['وضعیت پردازش', rep.statusFa || rep.status], ['فایل', rep.file + ' · ' + f(Math.round((rep.size || 0) / 1024)) + ' KB' + (rep.cached ? ' · از حافظهٔ پنهان (همان فایل قبلاً خوانده شده)' : '')], ['روش خواندن', rep.reader + (rep.ms != null ? ' · ' + f(rep.ms) + ' ms' : '') + (rep.note ? ' · ' + rep.note : '')],
      ['برگه‌ها (شناسایی / دارای داده‌ی استخراج‌شده)', f(rep.nSheets || 0) + ' / ' + f((rep.sheets || []).filter(function (s) { return s.blocks; }).length)], ['سطرها و سلول‌های دارای مقدار', f(rep.rows || 0) + ' سطر · ' + f(rep.cells || 0) + ' سلول'],
      ['صورت‌های اصلی پیدا‌شده', 'سود و زیان ' + (ty.IS || 0) + ' · وضعیت مالی ' + (ty.BS || 0) + ' · جریان نقد ' + (ty.CF || 0)],
      ['جداول تکمیلی (یادداشت‌ها)', Object.keys(cats).map(function (k) { return (CATFA[k] || k) + ' ' + cats[k]; }).join(' · ') || 'پیدا نشد'],
      ['دوره‌های مالی', (rep.periods || []).join(' · ') || '—'], ['واحد', (rep.unit || 'تشخیص داده نشد') + ' ' + (rep.currency || '')],
      ['سلول‌های خطادار', f(rep.errors || 0)], ['فرمول‌های بدون مقدار ذخیره‌شده', f(rep.noCache || 0) + (rep.noCache ? ' — فایل بدون محاسبه ذخیره شده؛ این سلول‌ها صفر حساب نمی‌شوند و باید فایل را در Excel باز، محاسبه و دوباره ذخیره کنید' : '')]];
    var out = [h('h4', { text: 'گزارش کنترل استخراج' }), tbl(['کنترل', 'نتیجه'], sum)];
    if (rep.recon && rep.recon.length) out.push(h('h4', { text: 'تطبیق جمع‌ها' }), tbl(['کنترل', 'نتیجه', 'جزئیات'], rep.recon.map(function (x) { return [x.c, x.ok === true ? '✓ منطبق' : x.ok === false ? '✗ نامنطبق' : 'انجام نشد', x.t]; })));
    if (rep.sheets && rep.sheets.length) out.push(h('details', null, [h('summary', { text: 'جزئیات برگه‌به‌برگه (' + rep.sheets.length + ')' }), tbl(['برگه', 'وضعیت', 'سطر', 'ستون', 'عدد / متن', 'بلوک / سطر استخراج', 'نوع', 'خطا', 'فرمول بدون مقدار', 'علت استخراج‌نشدن'],
      rep.sheets.map(function (s) { return [s.name, s.state === 'visible' ? 'نمایان' : 'پنهان', s.rows, s.cols, s.nums + ' / ' + s.texts, s.blocks + ' / ' + s.lines, s.types.concat(s.cats.map(function (c) { return CATFA[c] || c; })).join('، '), s.errors ? s.errors + ' (' + s.errorAt.join('، ') + ')' : 0, s.noCache ? s.noCache + ' (' + s.noCacheAt.join('، ') + ')' : 0, s.why || '']; }))]));
    return h('div', { class: 'stack' }, out);
  }

  /* ---------- shared UI: choose a file, review the blocks, apply ----------
   * opts.onApply(blocks, info) receives the included blocks (type set, oldest year first). */
  function widget(opts) {
    var U = Hub.util, h = U.h, T = function (en, fa) { return Hub.i18n && Hub.i18n.lang() === 'fa' ? fa : en; };
    var info = null;
    var file = h('input', { type: 'file', accept: '.xlsx,.xlsm,.pdf', class: 'f-file', 'aria-label': 'Excel file with up to 3 years of statements' });
    var status = h('p', { class: 'muted fetch-status', 'aria-live': 'polite' });
    var list = h('div', { class: 'imp-list' });
    var repBox = h('div', { class: 'imp-rep' });
    var apply = h('button', { class: 'btn', type: 'button', text: 'Build the model from these lines', disabled: true });
    function paint() {
      list.innerHTML = '';
      if (!info || !info.blocks.length) return;
      var tb = h('table', { class: 'grid imp' });
      tb.appendChild(h('thead', null, [h('tr', null, ['Use', 'Sheet / block', 'Statement', 'Years (oldest → newest)', 'Lines', 'First lines'].map(function (x) { return h('th', { text: x }); }))]));
      var body = h('tbody');
      info.blocks.forEach(function (b, i) {
        var use = h('input', { type: 'checkbox', 'aria-label': 'Use block ' + (i + 1) }); use.checked = b.use; use.addEventListener('change', function () { b.use = use.checked; });
        var sel = h('select', { class: 'f-sel', 'aria-label': 'Statement type' }, [['IS', 'Income statement'], ['BS', 'Balance sheet'], ['CF', 'Cash flow statement'], ['skip', 'Ignore']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
        sel.value = b.type; sel.addEventListener('change', function () { b.type = sel.value; b.use = sel.value !== 'skip'; use.checked = b.use; });
        var yrs = h('td', { 'data-notr': '1', text: b.years.join(' · ') });
        if (b.allYears.length > 3) {
          var ye = h('select', { class: 'f-sel', 'aria-label': 'Last historical year' }, b.allYears.map(function (y, k) { return k < 0 ? null : h('option', { value: String(k), text: y }); }));
          ye.value = String(b.end);
          ye.addEventListener('change', function () { var k = +ye.value; info.blocks.forEach(function (x) { if (x.allYears.length === b.allYears.length) setWindow(x, k); }); paint(); });
          yrs = h('td', null, [h('span', { 'data-notr': '1', text: b.years.join(' · ') }), h('br'), h('label', { class: 'muted', text: 'Last actual year ' }), ye]);
        }
        var cells = [h('td', null, [use]), h('td', { 'data-notr': '1', text: b.sheet + (b.title && b.title !== b.sheet ? ' — ' + b.title.slice(0, 40) : '') }), h('td', null, [sel]), yrs, h('td', { text: String(b.rows.length) }),
          h('td', { 'data-notr': '1', class: 'muted', text: b.rows.slice(0, 3).map(function (r) { return r.label; }).join(' · ') })];
        if (b.guessedOrder) cells[3].appendChild(h('button', { class: 'btn ghost sm', type: 'button', text: 'Reverse years', title: 'No year header was found; the order was guessed', onclick: function () { flip(b); paint(); } }));
        body.appendChild(h('tr', null, cells));
      });
      tb.appendChild(body); list.appendChild(h('div', { class: 'grid-wrap' }, [tb]));
    }
    // pasted block (Excel / Codal copy, tab-separated); several pastes add up (e.g. income statement, then balance sheet)
    var ta = h('textarea', { class: 'f-area', rows: 4, placeholder: 'سال\t1401\t1402\t1403\nدرآمدهای عملیاتی\t42,000\t58,500\t79,000\n…', 'aria-label': 'Paste rows from Excel' });
    var pasteBtn = h('button', { class: 'btn ghost', type: 'button', text: 'Read pasted rows' });
    var unitSel = h('select', { class: 'f-sel', 'aria-label': 'Unit of the figures' }, [['', 'Unit: as detected'], ['million|IRR', 'Million rials'], ['thousand|IRR', 'Thousand rials'], ['billion|IRR', 'Billion rials'], ['million|IRT', 'Million tomans'], ['thousand', 'Thousand'], ['million', 'Million'], ['billion', 'Billion'], ['trillion', 'Trillion']].map(function (o) { return h('option', { value: o[0], text: o[1] }); }));
    var curIn = h('input', { class: 'f-text sm', placeholder: 'IRR', 'aria-label': 'Currency', value: '' });
    pasteBtn.addEventListener('click', function () {
      var txt = ta.value; if (!txt.trim()) return;
      var grid = txt.replace(/\r/g, '').split('\n').map(function (l) { return l.split('\t'); });
      var p = parseGrid(grid, 'Pasted ' + ((info && info.blocks.length || 0) + 1));
      if (!p.blocks.length) { status.textContent = T('No rows with a label and yearly figures were found in the pasted text.', 'در متن چسبانده‌شده سطری با عنوان و ارقام سالانه پیدا نشد.'); status.classList.add('err'); return; }
      p.blocks.forEach(function (b) { b.use = b.type !== 'skip'; });
      info = info || { blocks: [], unit: null, currency: null, file: 'pasted data' };
      info.blocks = info.blocks.concat(p.blocks); info.unit = info.unit || p.unit; info.currency = info.currency || p.currency;
      ta.value = ''; paint(); apply.disabled = false; status.classList.remove('err');
      status.textContent = T(p.blocks.length + ' block(s) read from the paste. Set the statement type of each block; paste the next statement if needed.', p.blocks.length + ' بلوک از متن چسبانده‌شده خوانده شد. نوع صورت مالی هر بلوک را تعیین کنید؛ در صورت نیاز صورت بعدی را بچسبانید.');
    });
    file.addEventListener('change', function () {
      var f = file.files && file.files[0]; if (!f) return;
      status.textContent = T('Reading ', 'در حال خواندن ') + f.name + '…'; status.classList.remove('err'); apply.disabled = true;
      var isPdf = /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
      (isPdf ? (Hub.pdfread ? Hub.pdfread.readStatements(f, function (m) { status.textContent = m; }) : Promise.reject(new Error('PDF reader not loaded.'))) : readFile(f, function (i, n, nm) { status.textContent = T('Reading sheet ', 'در حال خواندن برگهٔ ') + i + T(' of ', ' از ') + n + ' (' + nm + ')…'; })).then(function (r) {
        var anyTitled = r.blocks.some(function (b) { return b.titled && b.type !== 'skip'; });
        r.blocks.forEach(function (b) { b.use = b.type !== 'skip' && (!anyTitled || b.titled) && b.pref !== false; });
        info = r; paint(); apply.disabled = !r.blocks.length; repBox.innerHTML = ''; if (r.report) repBox.appendChild(reportDom(r.report));
        status.textContent = r.blocks.length ? T(r.blocks.length + ' blocks found in ' + f.name + (r.unit ? ' · unit: ' + r.unit + ' ' + (r.currency || '') : '') + '. Tick the statements to use, check the type and the year order, then build.',
          r.blocks.length + ' بلوک در ' + f.name + ' پیدا شد' + (r.unit ? ' · واحد: ' + r.unit + ' ' + (r.currency || '') : '') + '. صورت‌های موردنظر را تیک بزنید، نوع و ترتیب سال‌ها را بررسی کنید و مدل را بسازید.')
          : T('No statement lines found. Each line needs a label and up to 3 yearly figures.', 'سطری پیدا نشد. هر سطر به یک عنوان و حداکثر ۳ رقم سالانه نیاز دارد.');
        if (r.local && r.blocks.length) {
          var u = r.unsure || [];
          status.textContent += ' ' + (r.local === 'ocr'
            ? T('Read on this device with offline OCR: compare the totals with the PDF before relying on them.', 'روی همین دستگاه با OCR آفلاین خوانده شد؛ پیش از اتکا، جمع‌ها را با PDF تطبیق دهید.')
            : T('Read on this device from the PDF text layer.', 'روی همین دستگاه از لایهٔ متنی PDF خوانده شد.'))
            + (u.length ? ' ' + T(u.length + ' figures were unclear — check: ', u.length + ' رقم مبهم بود — بررسی کنید: ') + u.slice(0, 8).join(' · ') + (u.length > 8 ? ' …' : '') : '');
        }
      }).catch(function (e) { status.textContent = e.message; status.classList.add('err'); });
    });
    apply.addEventListener('click', function () {
      if (!info) return;
      var use = info.blocks.filter(function (b) { return b.use && b.type !== 'skip'; });
      if (!use.some(function (b) { return b.type === 'IS'; }) || !use.some(function (b) { return b.type === 'BS'; })) { U.toast(T('Include at least one income statement and one balance sheet block.', 'دست‌کم یک بلوک صورت سود و زیان و یک بلوک صورت وضعیت مالی را انتخاب کنید.'), 'warn'); return; }
      var ny = use[0].years.length;
      if (use.some(function (b) { return b.years.length !== ny; })) { U.toast(T('The selected blocks have different numbers of years.', 'تعداد سال‌های بلوک‌های انتخاب‌شده یکسان نیست.'), 'warn'); return; }
      if (unitSel.value) { var uc = unitSel.value.split('|'); info.unit = uc[0]; if (uc[1] && !curIn.value.trim()) info.currency = uc[1]; }
      if (curIn.value.trim()) info.currency = curIn.value.trim().toUpperCase();
      info.sharesMn = sharesFromCapital(use, info.unit, info.currency);
      opts.onApply(use, info);
    });
    return h('div', { class: 'stack imp-w' }, [
      h('p', { class: 'muted', text: opts.help || 'Choose your Excel file (.xlsx) or PDF with up to 3 years of statements: one sheet per statement or all on one sheet. Every line is read with its own name; Persian digits, (negatives) and formulas are handled. If the file also has forecast years, pick the last actual year. Excel files never leave your browser. A PDF is read by Claude when Claude is connected (inside the claude.ai artifact or with your API key); otherwise it is read on this device — from the text layer, or with offline OCR for scanned PDFs (slower; check the figures).' }),
      h('div', { class: 'row-ctl' }, [file, unitSel, curIn, apply]),
      h('details', { class: 'imp-paste' }, [h('summary', { text: 'Or paste rows copied from Excel / Codal' }), ta, h('div', { class: 'row-ctl' }, [pasteBtn])]),
      status, list, repBox]);
  }

  // Iranian companies: shares = paid-in capital ÷ 1,000 rials nominal per share (only when the unit and currency are known)
  var UNITV = { thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12 };
  function sharesFromCapital(blocks, unit, currency) {
    if (currency !== 'IRR' || !UNITV[unit]) return null;
    var r = null;
    blocks.filter(function (b) { return b.type === 'BS'; }).forEach(function (b) { b.rows.forEach(function (x) { if (!r && /^سرمایه( ثبت شده| پرداخت شده)?$/.test(x.label)) r = x; }); });
    if (!r) return null;
    var cap = r.vals[r.vals.length - 1];
    return cap > 0 ? cap * UNITV[unit] / 1000 / 1e6 : null;
  }

  Hub.stmtImport = { reportDom: reportDom, CATFA: CATFA, reconcile: reconcile, CATS: CATS, widget: widget, sharesFromCapital: sharesFromCapital, setWindow: setWindow, parseGrid: parseGrid, readFile: readFile, toNum: toNum, yearOf: yearOf, flip: flip, pickCF: pickCF, guessType: guessType };
  if (typeof module !== 'undefined' && module.exports) module.exports = Hub.stmtImport;
})(typeof window !== 'undefined' ? window : globalThis);
