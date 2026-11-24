/* =====================================================================
 * PDF READER — financial statements in PDF (Codal reports, audited sets).
 *   Inside the claude.ai artifact: the statement pages are rendered to
 *   images and Claude reads them (sample capability with images) and
 *   returns the lines as structured data — this works for Persian PDFs whose
 *   text layer is scrambled. Without images, the text layer is sent instead.
 *   Offline copy: only the text layer is available; Persian PDFs often lose
 *   their character order there, so use the Excel export or the artifact.
 * pdf.js 3.11.174 (Mozilla, Apache-2.0) is vendored for the offline copy and
 * loaded from cdnjs in the artifact.
 * The last PDF read is kept in memory (not stored) so the auditor can send
 * pages of the notes to Claude for a deeper review.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  var last = null;

  function lib() {
    var L = root.pdfjsLib; if (!L) return Promise.reject(new Error('PDF library did not load.'));
    if (!L.GlobalWorkerOptions.workerSrc) {
      var inl = document.getElementById('pdfjs-worker');
      if (inl) L.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([inl.textContent], { type: 'text/javascript' }));
      else if (root.location && root.location.protocol === 'file:' && !root.PDFJS_WORKER_SRC && Hub.util && Hub.util.asset)   // page opened from disk: shared copy in vendor/
        return Hub.util.asset('pdfjs-worker', 'pdf.worker.min.js').then(function (t) { if (!L.GlobalWorkerOptions.workerSrc) L.GlobalWorkerOptions.workerSrc = t ? URL.createObjectURL(new Blob([t], { type: 'text/javascript' })) : 'vendor/pdf.worker.min.js'; return L; });
      else L.GlobalWorkerOptions.workerSrc = root.PDFJS_WORKER_SRC || 'vendor/pdf.worker.min.js';
    }
    // hosted page: load the worker code into the page itself (pdf.js then runs it on the main thread),
    // which avoids cross-origin worker restrictions; a few statement pages render fine this way
    if (root.PDFJS_WORKER_SRC && !root.pdfjsWorker && !document.getElementById('pdfjs-worker')) {
      return new Promise(function (res) {
        var s = document.createElement('script'); s.src = root.PDFJS_WORKER_SRC;
        s.onload = s.onerror = function () { res(L); }; document.head.appendChild(s);
      });
    }
    return Promise.resolve(L);
  }
  function open(file) {
    return lib().then(function (L) { return file.arrayBuffer().then(function (buf) { return L.getDocument({ data: new Uint8Array(buf) }).promise; }); });
  }
  function norm(s) { return String(s).normalize('NFKC').replace(/[‌‏‎]/g, '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' '); }
  // text of one page, lines rebuilt from the item positions
  function pageText(doc, i) {
    return doc.getPage(i).then(function (p) { return p.getTextContent(); }).then(function (tc) {
      // cluster items into lines with a tolerance (labels and numbers often sit on slightly different baselines)
      var its = tc.items.filter(function (it) { return String(it.str).trim(); }).map(function (it) {
        return { x: it.transform[4], y: it.transform[5], h: Math.abs(it.transform[3]) || Math.abs(it.height) || 8, s: String(it.str).normalize('NFKC').replace(/[\u200c\u200f\u200e]/g, '').replace(/\u064a/g, '\u06cc').replace(/\u0643/g, '\u06a9') };
      }).sort(function (a, b) { return b.y - a.y; });
      var lines = [];
      its.forEach(function (it) {
        var L = lines.length ? lines[lines.length - 1] : null;
        if (L && Math.abs(L.y - it.y) <= Math.max(2, 0.45 * Math.min(L.h, it.h))) { L.items.push(it); }
        else lines.push({ y: it.y, h: it.h, items: [it] });
      });
      return lines.map(function (L) { return L.items.sort(function (a, b) { return a.x - b.x; }).map(function (o) { return o.s; }).join('  '); }).join('\n');
    });
  }
  function pageImage(doc, i, width) {
    return doc.getPage(i).then(function (p) {
      var v0 = p.getViewport({ scale: 1 }), sc = Math.min(2.2, (width || 1500) / v0.width), v = p.getViewport({ scale: sc });
      var c = document.createElement('canvas'); c.width = Math.round(v.width); c.height = Math.round(v.height);
      var ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      return p.render({ canvasContext: ctx, viewport: v }).promise.then(function () { return new Promise(function (res) { c.toBlob(function (b) { res(b); }, 'image/jpeg', 0.85); }); });
    });
  }
  var KEYS = /صورت سود و زیان|سود و زیان|وضعیت مالی|ترازنامه|جریان(‌| )?های نقدی|جریان وجوه نقد|income statement|profit or loss|financial position|balance sheet|cash flows?/i;
  function rev(s) { return s.split('').reverse().join(''); }
  // pages that look like the primary statements (text layer, also checked reversed for RTL PDFs)
  function statementPages(doc) {
    var n = doc.numPages, jobs = [];
    for (var i = 1; i <= Math.min(n, 40); i++) jobs.push(pageText(doc, i).then(function (t) { return t; }, function () { return ''; }));
    return Promise.all(jobs).then(function (texts) {
      var hits = []; texts.forEach(function (t, k) { var s = norm(t); if (KEYS.test(s) || KEYS.test(rev(s))) hits.push(k + 1); });
      return { hits: hits, texts: texts };
    });
  }
  function sampler() { return Hub.ai ? Hub.ai.sampler() : Promise.resolve(null); }
  function T(en, fa) { return Hub.i18n && Hub.i18n.lang && Hub.i18n.lang() === 'fa' ? fa : en; }

  var PROMPT = ['You are reading audited financial statements (Persian or English).',
    'Extract the PRIMARY statements only: income statement (صورت سود و زیان), statement of financial position (صورت وضعیت مالی / ترازنامه) and cash flow statement (صورت جریان‌های نقدی).',
    'Copy every line label exactly as printed, including subtotal and total lines. Keep the order. For each line give its section header if any (e.g. دارایی‌های جاری, بدهی‌های غیرجاری).',
    'Use the year columns printed in the statements (full financial years only; skip restated duplicates and interim columns). Give years oldest → newest, at most the 3 most recent.',
    'Numbers: as printed, in the printed unit; amounts in parentheses are negative; blank or dash is null. Do not compute or adjust anything.',
    'Answer with ONE JSON object, no commentary:',
    '{"company":"...","unit":"thousand|million|billion|null","currency":"IRR|USD|...","years":["1402","1403"],"statements":[{"type":"IS|BS|CF","title":"as printed","rows":[{"label":"...","section":"...","values":[number|null, ...]}]}]}'].join('\n');

  function toBlocks(j, name) {
    var blocks = [];
    (j.statements || []).forEach(function (st) {
      var years = (st.years || j.years || []).map(String);
      var t = /^(IS|BS|CF)$/.test(st.type) ? st.type : 'skip';
      var rows = (st.rows || []).filter(function (r) { return r && r.label && (r.values || []).some(function (v) { return v != null && v !== ''; }); })
        .map(function (r) { var vals = years.map(function (y, k) { var v = (r.values || [])[k]; v = typeof v === 'string' ? Hub.stmtImport.toNum(v) : v; return isFinite(v) && v != null ? Number(v) : 0; }); return { label: norm(r.label).trim(), grp: r.section || '', all: vals, vals: vals }; });
      if (rows.length) blocks.push({ sheet: name, title: st.title || t, type: t, titled: true, rows: rows, allYears: years, years: years.slice(), end: years.length - 1, guessedOrder: !!st.guessed, pref: st.pref });
    });
    var u = String(j.unit || '').toLowerCase();
    return { blocks: blocks, unit: /^(thousand|million|billion|trillion)$/.test(u) ? u : null, currency: j.currency || null, file: name, company: j.company || '' };
  }

  /* statements from a PDF: Claude reads page images (or the text layer); offline falls back to the text layer */
  // offline first: statements are read on this device unless the user turned on cloud reading (Strict Auditor → files tab)
  function offlineFirst() { try { return localStorage.getItem('hub.cloudPdf') !== '1'; } catch (e) { return true; } }
  function readStatements(file, say) {
    say = say || function () {};
    return open(file).then(function (doc) {
      last = { file: file, doc: doc, name: file.name, numPages: doc.numPages };
      say(T('PDF: ' + doc.numPages + ' pages. Finding the statement pages…', 'PDF: ' + doc.numPages + ' صفحه. یافتن صفحات صورت‌های مالی…'));
      return statementPages(doc).then(function (sp) {
        last.statementPages = sp.hits;
        return sampler().then(function (sample) {
          if (!sample || sample.manual || offlineFirst()) return local(doc, file.name, say);   // local reading is the default; the cloud is an opt-in extra
          return sample.limits().catch(function () { return {}; }).then(function (lim) {
            var maxImg = lim && lim.images ? lim.images.maxCount || 5 : 0;
            var pages = sp.hits.length ? sp.hits : []; for (var i = 1; pages.length < Math.min(6, doc.numPages) && i <= doc.numPages; i++) if (pages.indexOf(i) < 0) pages.push(i);
            pages = pages.sort(function (a, b) { return a - b; });
            if (maxImg > 0) {
              pages = pages.slice(0, maxImg);
              say(T('Rendering pages ' + pages.join(', ') + ' and asking Claude to read them…', 'ارسال تصویر صفحات ' + pages.join('، ') + ' برای Claude…'));
              return Promise.all(pages.map(function (p) { return pageImage(doc, p); })).then(function (imgs) {
                return sample.json(PROMPT + '\nThe images are pages ' + pages.join(', ') + ' of the PDF.', { images: imgs, modelTier: 'complex' });
              }).then(function (j) { return toBlocks(j, file.name); }, function (e) { return localAfter(e, doc, file.name, say); });
            }
            say(T('Sending the text layer of pages ' + pages.join(', ') + ' to Claude…', 'ارسال لایهٔ متنی صفحات ' + pages.join('، ') + ' برای Claude…'));
            var txt = pages.map(function (p) { return '--- page ' + p + ' ---\n' + (sp.texts[p - 1] || ''); }).join('\n');
            return sample.json(PROMPT + '\n\nText layer (Persian text may be in reversed order):\n' + txt.slice(0, 60000), { modelTier: 'complex' }).then(function (j) { return toBlocks(j, file.name); }, function (e) { return localAfter(e, doc, file.name, say); });
          });
        });
      });
    });
  }
  // no Claude: read the statements on this device (text layer or offline OCR)
  function local(doc, name, say) {
    if (!Hub.pdflocal) return Promise.reject(new Error('The offline PDF reader is not loaded.'));
    return Hub.pdflocal.read(doc, name, say).then(function (j) {
      var r = toBlocks(j, name); r.textOnly = true; r.local = j.source;
      var uns = []; (j.statements || []).forEach(function (st) { (st.unsure || []).forEach(function (u) { uns.push(u); }); });
      r.unsure = uns;
      return r;
    });
  }
  // Claude was reachable but refused or failed: fall back to the local reader and say why
  function localAfter(e, doc, name, say) {
    var fa = Hub.i18n && Hub.i18n.lang && Hub.i18n.lang() === 'fa';
    say((fa ? 'Claude نتوانست PDF را بخواند (' : 'Claude could not read the PDF (') + (e && e.message || e) + (fa ? '). خواندن روی همین دستگاه…' : '). Reading it on this device instead…'));
    return local(doc, name, say);
  }
  // a few pages as images for a deeper review (auditor); null when not available
  function pagesAsImages(list) {
    if (!last) return Promise.resolve(null);
    return Promise.all(list.filter(function (p) { return p >= 1 && p <= last.numPages; }).map(function (p) { return pageImage(last.doc, p, 1300); }));
  }
  function textOf(list) {
    if (!last) return Promise.resolve('');
    return Promise.all(list.filter(function (p) { return p >= 1 && p <= last.numPages; }).map(function (p) { return pageText(last.doc, p).then(function (t) { return '--- page ' + p + ' ---\n' + t; }); })).then(function (a) { return a.join('\n'); });
  }
  Hub.pdfread = { offlineFirst: offlineFirst, readStatements: readStatements, last: function () { return last; }, pagesAsImages: pagesAsImages, textOf: textOf, sampler: sampler };
})(typeof window !== 'undefined' ? window : globalThis);
