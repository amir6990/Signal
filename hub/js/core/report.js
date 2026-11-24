/* =====================================================================
 * REPORT — one block format for every written report in the hub, in pyramid order
 * (answer, key reasons, evidence, what is missing). Blocks:
 *   {t:'h1'|'h2'|'h3'|'h4'|'p'|'lead'|'meta'|'small'|'warn'|'gap', x:text} · {t:'ul'|'ol', x:[text]} · {t:'table', head:[...], rows:[[...]]}
 * 'gap' = a part that cannot be completed for lack of information (says exactly what is missing).
 * Outputs: on-screen DOM, a stand-alone HTML / Word document, plain text, print.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  function esc(x) { return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function html(B) { return B.map(function (b) { var li = function (a) { return a.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join(''); };
    return b.t === 'h1' ? '<h1>' + esc(b.x) + '</h1>' : /^h[234]$/.test(b.t) ? '<' + b.t + '>' + esc(b.x) + '</' + b.t + '>' : b.t === 'ul' ? '<ul>' + li(b.x) + '</ul>' : b.t === 'ol' ? '<ol>' + li(b.x) + '</ol>' : b.t === 'links' ? '<ul>' + b.x.map(function (q) { return '<li>' + esc(q.text) + ' — <a href="' + esc(q.url) + '">' + esc(q.url) + '</a></li>'; }).join('') + '</ul>' : b.t === 'table' ? '<table><thead><tr>' + b.head.map(function (x) { return '<th>' + esc(x) + '</th>'; }).join('') + '</tr></thead><tbody>' + b.rows.map(function (r) { return '<tr>' + r.map(function (x) { return '<td>' + esc(x) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>' : '<p class="' + b.t + '">' + esc(b.x) + '</p>'; }).join('\n'); }
  function doc(B) { return '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>' + esc(B[0] && B[0].x) + '</title><style>body{font-family:Vazirmatn,Tahoma,Arial,sans-serif;direction:rtl;text-align:right;line-height:1.9;max-width:900px;margin:24px auto;padding:0 16px;color:#111}h1{font-size:22px;border-bottom:2px solid #b8860b;padding-bottom:8px}h2{font-size:17px;margin-top:26px;color:#7a5a00}h3{font-size:15px;margin-top:18px}h4{font-size:14px;margin:14px 0 4px}table{border-collapse:collapse;width:100%;margin:8px 0;font-size:12.5px}th,td{border:1px solid #bbb;padding:5px 7px;vertical-align:top;text-align:right}th{background:#f1ead8}p.lead{font-size:15px;font-weight:600;background:#faf5e6;padding:10px 12px;border-right:4px solid #b8860b}p.meta,p.small{color:#555;font-size:12.5px}p.warn{color:#a40000;font-weight:600}p.gap{color:#7a3b00;background:#fff4e5;padding:8px 10px;border-right:4px solid #d98a00}li{margin-bottom:5px}@page{size:A4;margin:14mm}@media print{body{margin:0;max-width:none;font-size:11.5px}table{font-size:10px}tr{page-break-inside:avoid}h2,h3,h4{page-break-after:avoid}}</style></head><body>' + html(B) + '</body></html>'; }
  function text(B) { return B.map(function (b) { return b.t === 'h1' ? b.x + '\n' + '='.repeat(30) : /^h[234]$/.test(b.t) ? '\n' + b.x : b.t === 'ul' || b.t === 'ol' ? b.x.map(function (x, i) { return (b.t === 'ol' ? (i + 1) + '. ' : '• ') + x; }).join('\n') : b.t === 'links' ? b.x.map(function (q) { return '• ' + q.text + ' — ' + q.url; }).join('\n') : b.t === 'table' ? [b.head.join(' | ')].concat(b.rows.map(function (r) { return r.join(' | '); })).join('\n') : b.x; }).join('\n'); }
  function dom(B) { var U = Hub.util, h = U.h, body = h('div', { class: 'report-body lv-report', 'data-notr': '1' });
    B.forEach(function (b) { var li = function (a) { return a.map(function (x) { return h('li', { text: x }); }); };
      body.appendChild(b.t === 'h1' ? h('h2', { class: 'rep-title', text: b.x }) : b.t === 'h2' ? h('h3', { text: b.x }) : b.t === 'h3' ? h('h4', { text: b.x }) : b.t === 'h4' ? h('h5', { text: b.x }) : b.t === 'ul' ? h('ul', { class: 'studio-l' }, li(b.x)) : b.t === 'ol' ? h('ol', { class: 'studio-l' }, li(b.x)) : b.t === 'links' ? h('ul', { class: 'studio-l' }, b.x.map(function (q) { return h('li', null, [document.createTextNode(q.text + ' — '), h('a', { href: q.url, target: '_blank', rel: 'noopener noreferrer', dir: 'ltr', text: q.url })]); }))
        : b.t === 'table' ? h('div', { class: 'grid-wrap' }, [h('table', { class: 'grid aud se' }, [h('thead', null, [h('tr', null, b.head.map(function (t) { return h('th', { class: 'lbl', text: t }); }))]), h('tbody', null, b.rows.map(function (r) { return h('tr', null, r.map(function (c) { return h('td', { class: 'small', style: 'white-space:normal', text: c == null ? '' : String(c) }); })); }))])])
        : h('p', { class: b.t === 'lead' ? 'rep-lead' : b.t === 'warn' ? 'neg' : b.t === 'gap' ? 'rep-gap' : b.t === 'meta' || b.t === 'small' ? 'small muted' : '', text: b.x })); });
    return body; }

  /* ---------- writing-style check (rules the user set for published Persian text) ----------
   * Deterministic pattern checks only. Terminology cannot be verified by a program: the dedicated review stays with a person. */
  var STYLE = {
    // wording the user has rejected, with the replacement only where the user named one
    terms: [['حضانت', 'ریسک دسترسی'], ['تحریم در سطح بخش', 'تحریم کل صنعت'], ['شمول تحریم', 'با فعل و عبارت عادی بازنویسی شود'], ['دالان', 'معادل رایج در بازار (شما معادل مشخصی نگفته‌اید)'], ['جعبه‌ابزار', ''], ['سر و کار دارد', ''], ['جواب داد', ''], ['به هم می‌زند', '']],
    cliche: ['شایان ذکر است', 'در دنیای پرشتاب امروز', 'نقش بسزایی ایفا می‌کند', 'نقش بسزایی ایفا'],
    absolute: ['قطعاً', 'بدون تردید', 'حتماً'],
    rel: ['اخیراً', 'به‌تازگی', 'این هفته', 'هفتهٔ گذشته', 'هفته گذشته', 'ماه گذشته', 'ماهِ گذشته', 'سال گذشته', 'سال جاری', 'ماه جاری', 'هفتهٔ آینده', 'هفته آینده', 'امروز', 'دیروز', 'فردا', 'در حال حاضر', 'هم‌اکنون']
  };
  function plain(B) { var o = []; B.forEach(function (b) { if (b.t === 'table') { b.head.forEach(function (c) { o.push(String(c)); }); b.rows.forEach(function (r) { r.forEach(function (c) { o.push(String(c)); }); }); } else if (Array.isArray(b.x)) b.x.forEach(function (x) { o.push(String(x)); }); else o.push(String(b.x == null ? '' : b.x)); }); return o; }
  function lint(B, opt) {
    opt = opt || {}; var art = opt.mode === 'article', F = [], lines = plain(B), words = lines.join(' ').split(/\s+/).filter(Boolean).length, heads = B.filter(function (b) { return /^h[234]$/.test(b.t); }).length;
    function add(rule, sev, snip, fix) { F.push({ rule: rule, sev: sev, snip: String(snip).replace(/\s+/g, ' ').slice(0, 110), fix: fix || '' }); }
    lines.forEach(function (ln) {
      var m, re = /[—–][^—–\n]{2,140}?[—–]/g; while ((m = re.exec(ln))) add('جملهٔ معترضه بین دو خط تیره', 'warn', m[0], 'به جملهٔ عادی، ویرگول یا جملهٔ جدا بازنویسی شود');
      re = /(?:دارد|دارند|دارم|داریم)\s+(?:(?!و\s|که\s|را\s)[^\s.،؛:!؟]+\s+){0,3}[^\s.،؛:!؟]*می‌[^\s.،؛:!؟]+/g; while ((m = re.exec(ln))) add('ساخت «دارد … می‌کند»', 'warn', m[0], 'فعل ساده یا مصدر رسمی');
      STYLE.terms.forEach(function (t) { if (ln.indexOf(t[0]) >= 0) add('واژهٔ ردشده در سبک شما', 'warn', t[0], t[1]); });
      STYLE.cliche.forEach(function (t) { if (ln.indexOf(t) >= 0) add('کلیشهٔ نگارشی', 'warn', t, 'حذف یا بازنویسی'); });
      STYLE.absolute.forEach(function (t) { if (ln.indexOf(t) >= 0) add('قید قطعی', art ? 'warn' : 'info', t, 'زبان محتاطانه'); });
      STYLE.rel.forEach(function (t) { if (ln.indexOf(t) >= 0) add('ارجاع زمانی نسبی', art ? 'warn' : 'info', t, 'تاریخ یا دورهٔ ثابت'); });
    });
    if (art && words > 1000) add('طول', 'warn', fa0(words) + ' کلمه', 'سقف مقاله ۱٬۰۰۰ کلمه است؛ ایده را حذف کنید، جمله را کوتاه نکنید');
    if (art && heads > 0) add('میان‌تیتر', 'info', fa0(heads) + ' میان‌تیتر', 'فقط اگر واقعاً به فهم کمک می‌کند');
    var seen = {}; F = F.filter(function (f) { var k = f.rule + '|' + f.snip; if (seen[k]) return false; seen[k] = 1; return true; });
    return { words: words, heads: heads, findings: F };
  }
  function fa0(n) { return String(n).replace(/\d/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[d]; }); }
  // digits in exports only (the screen keeps the page's own digits)
  function digits(str, mode) { return mode === 'en' ? String(str).replace(/[۰-۹]/g, function (c) { return '۰۱۲۳۴۵۶۷۸۹'.indexOf(c); }).replace(/٫/g, '.').replace(/٬/g, ',') : str; }
  function digitMode() { var st = Hub.util && Hub.util.store; try { return (st.get('hub.report.v1', {}) || {}).digits || 'fa'; } catch (e) { return 'fa'; } }
  function lintPanel(getB, opt) {
    var U = Hub.util, h = U.h, r = lint(getB(), opt), by = { warn: [], info: [] }; r.findings.forEach(function (f) { by[f.sev === 'warn' ? 'warn' : 'info'].push(f); });
    var row = function (f) { return h('li', { 'data-notr': '1', text: f.rule + ': «' + f.snip + '»' + (f.fix ? ' ← ' + f.fix : '') }); };
    var dm = h('select', { class: 'f-sel', 'aria-label': 'ارقام در خروجی', 'data-notr': '1', onchange: function () { var o = U.store.get('hub.report.v1', {}) || {}; o.digits = dm.value; U.store.set('hub.report.v1', o); U.toast('ارقام خروجی (چاپ، Word، HTML، کپی): ' + (dm.value === 'en' ? 'لاتین 123' : 'فارسی ۱۲۳'), 'good'); } }, [h('option', { value: 'fa', text: 'ارقام خروجی: فارسی ۱۲۳' }), h('option', { value: 'en', text: 'ارقام خروجی: لاتین 123' })]); dm.value = digitMode();
    return h('details', { class: 'lv-card', 'data-notr': '1' }, [h('summary', { text: 'بررسی سبک نگارش: ' + (by.warn.length ? by.warn.length + ' مورد برای اصلاح' : 'موردی برای اصلاح پیدا نشد') + (by.info.length ? '، ' + by.info.length + ' یادآوری' : '') + ' (' + fa0(r.words) + ' کلمه)' }),
      by.warn.length ? h('ul', { class: 'studio-l' }, by.warn.map(row)) : h('p', { class: 'small muted', text: 'الگوهای ممنوع پیدا نشد.' }),
      by.info.length ? h('details', null, [h('summary', { class: 'small muted', text: 'یادآوری‌ها (برای متن منتشرشونده مهم است؛ در گزارش داخلی با تاریخ ثابت همراه شود)' }), h('ul', { class: 'studio-l' }, by.info.map(row))]) : null,
      h('p', { class: 'small muted', text: 'این بررسی فقط الگوهای مشخص را می‌گیرد. بازبینی اصطلاحات با یک پرسش انجام می‌شود که خودتان باید پاسخ دهید: «آیا فعال حرفه‌ای بازار سرمایهٔ ایران این اصطلاح را طبیعی، رایج و آشنا می‌داند؟» اگر نه یا نامطمئن، معادل رایج را جایگزین کنید. برنامه نمی‌تواند رایج‌بودن اصطلاح را تأیید کند.' }),
      h('div', { class: 'row-ctl' }, [dm])].filter(Boolean)); }

  /* ---------- article-format report ----------
   * The same data pack as the pyramid report, written as one continuous Persian analytical article under the user's article rules.
   * Prose needs a model: it goes through Hub.ai (API key, claude.ai artifact, or the copy-paste Claude chat bridge). */
  var ARTICLE_RULES = 'Write ONE independent, continuous Persian analytical article of AT MOST 1000 words (count the body only). ' +
    'Structure as a guide, not as visible sections: introduction that sets up the problem, an explicit arguable thesis, analytical mechanisms (incentives and causal relationships, not a description of events), evidence from the pack, a counterargument or limitation, and a genuine conclusion. ' +
    'Write it as flowing prose with NO subheadings unless one truly helps comprehension (never more than 4). The title is one formal, grammatically complete Persian sentence, not a contrastive headline. ' +
    'Persian style (mandatory): formal written Persian of the register of Iranian specialist economic newspapers; use only terms established in Iranian capital-market, financial and economic usage and never a literal translation when an established term exists; complete flowing sentences, no telegraphic fragments, no colloquial or figurative business idioms, no compressed abstract nominal phrases; never use «دارد … می‌کند»; never set a phrase off between two dashes (use a normal clause, a comma or a new sentence); no AI clichés; no absolute words such as «قطعاً»، «بدون تردید»، «حتماً»; use «ریسک دسترسی» (never «حضانت») where that idea appears; gloss a technical term once inside the sentence so a non-specialist follows. ' +
    'Numbers as numerals in Persian digits (۰-۹). Iran is the subject; no foreign comparison unless the pack contains it. ' +
    'Time: no relative dating («اخیراً»، «هفتهٔ گذشته»، «سال جاری»، «این هفته»); anchor every figure to the date or period written next to it in the pack. A moving market level (index, price, rate) must never be the central pillar of the argument; if the pack has only such figures, state the point structurally as a recurring pattern and mention a figure only as an illustration with its date. ' +
    'ZERO-HALLUCINATION: use ONLY facts, numbers, dates and sources that are in the pack; never add an event, cause, source or number; where the pack says something cannot be completed, do not fill it, and say in the article that the claim cannot be made. Keep correlation separate from causation; keep fact, analysis and opinion visibly separate; no definitive forecasts. ' +
    'Output format: first the article (title on the first line, then paragraphs), then a line containing exactly ===, then «یادداشت برای ویراستار» (data date and the sources named in the pack, any gap, and which claims need human verification). The note is outside the article body. Plain text, no markdown.';
  function numCheck(pack, t) {
    var nm = function (x) { return String(x).replace(/[۰-۹]/g, function (c) { return '۰۱۲۳۴۵۶۷۸۹'.indexOf(c); }).replace(/[٬,]/g, ''); }, pk = nm(pack);
    return (nm(t).match(/\d+(?:[.٫]\d+)?/g) || []).filter(function (q) { return q.length >= 3 && pk.indexOf(q.replace('٫', '.')) < 0 && pk.indexOf(q) < 0; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
  }
  function articleBlocks(raw) {
    var parts = String(raw || '').split(/\n\s*={3,}\s*\n/), body = (parts[0] || '').trim(), note = parts.slice(1).join('\n').trim(), ln = body.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
    var toFa = function (x) { return x.replace(/\d/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[d]; }); };
    var B = [{ t: 'h1', x: toFa(ln[0] || 'مقاله') }]; ln.slice(1).forEach(function (x) { B.push({ t: 'p', x: toFa(x) }); });
    var nb = note ? [{ t: 'h3', x: 'یادداشت برای ویراستار (خارج از متن مقاله)' }].concat(note.split('\n').filter(function (x) { return x.trim(); }).map(function (x) { return { t: 'small', x: toFa(x.trim()) }; })) : [];
    return { article: B, note: nb, all: B.concat(nb) };
  }
  function articlePanel(getB, opt) {
    opt = opt || {}; var U = Hub.util, h = U.h, KEY = 'hub.article.v1', name = opt.name || 'Article', st = h('p', { class: 'studio-status', 'data-notr': '1', 'aria-live': 'polite' }), out = h('div', { 'data-notr': '1' }), cur = null;
    function load() { try { var o = U.store.get(KEY, {}) || {}; return o[name] || null; } catch (e) { return null; } }
    function save(v) { try { var o = U.store.get(KEY, {}) || {}; o[name] = v; U.store.set(KEY, o); } catch (e) { /* storage unavailable */ } }
    function show(rec) {
      U.clear(out); if (!rec) return; cur = articleBlocks(rec.raw); var lr = lint(cur.article, { mode: 'article' }), w = lr.findings.filter(function (f) { return f.sev === 'warn'; }), bad = numCheck(rec.pack || '', cur.article.map(function (b) { return b.x; }).join(' '));
      var wc = cur.article.slice(1).map(function (b) { return b.x; }).join(' ').split(/\s+/).filter(Boolean).length;
      out.appendChild(h('p', { class: wc > 1000 ? 'neg' : 'small muted', 'data-notr': '1', text: 'طول متن مقاله: ' + fa0(wc) + ' کلمه (سقف ۱٬۰۰۰)' + (wc > 1000 ? '؛ از سقف گذشته است. در درخواست بعدی بنویسید «ایده‌های کم‌اهمیت را حذف کن، جمله را کوتاه نکن».' : '') + ' · تولیدشده در ' + new Date(rec.at).toLocaleString('fa-IR') }));
      if (bad.length) out.appendChild(h('p', { class: 'neg', 'data-notr': '1', text: 'هشدار: این اعداد در مقاله هست ولی در بستهٔ داده نیست و نباید به آن‌ها استناد شود: ' + bad.map(fa0).join('، ') }));
      if (w.length) out.appendChild(h('details', { 'data-notr': '1' }, [h('summary', { class: 'neg', text: 'سبک نگارش: ' + fa0(w.length) + ' مورد برای اصلاح' }), h('ul', { class: 'studio-l' }, w.map(function (f) { return h('li', { text: f.rule + ': «' + f.snip + '»' + (f.fix ? ' ← ' + f.fix : '') }); }))]));
      else out.appendChild(h('p', { class: 'small muted', 'data-notr': '1', text: 'الگوهای ممنوع سبک در متن پیدا نشد. بازبینی اصطلاحات و راستی‌آزمایی ادعاها با خودتان است.' }));
      out.appendChild(buttons(function () { return cur.all; }, name)); out.appendChild(dom(cur.all));
    }
    var go = h('button', { class: 'btn primary', type: 'button', 'data-notr': '1', text: 'نوشتن گزارش در قالب مقاله', onclick: function () {
      var sp = Hub.ai ? Hub.ai.sampler() : Promise.resolve(null); st.className = 'studio-status'; st.textContent = 'در حال آماده‌سازی…'; go.disabled = true;
      sp.then(function (s) { if (!s) { st.className = 'studio-status warn-t'; st.textContent = 'هوش مصنوعی وصل نیست. در «منابع داده و کلیدها» حالت «گفت‌وگوی Claude با کپی و چسباندن» را انتخاب کنید.'; return; }
        var pack = text(getB()), prompt = ARTICLE_RULES + (opt.focus ? '\n\nFocus: ' + opt.focus : '') + '\n\nDATA PACK:\n' + pack;
        return (typeof s === 'function' ? s(prompt, { modelTier: 'complex' }).then(function (r) { return r && r.text; }) : s.json(prompt + '\n\nReturn JSON {"text": "..."} where text holds the whole output.', { modelTier: 'complex' }).then(function (j) { return j && j.text; })).then(function (t) {
          if (!String(t || '').trim()) throw new Error('پاسخ خالی بود.'); var rec = { raw: String(t), pack: pack, at: Date.now() }; save(rec); st.textContent = 'مقاله نوشته شد.'; show(rec); }); })
        .catch(function (e) { st.className = 'studio-status warn-t'; st.textContent = e && e.code === 'aborted' ? 'لغو شد.' : 'ناموفق: ' + (e && e.message || e); }).then(function () { go.disabled = false; }); } });
    var rec0 = load(); if (rec0) show(rec0);
    return h('div', { class: 'stack', 'data-notr': '1' }, [h('p', { class: 'f-help', text: 'همین بستهٔ داده به‌صورت یک مقالهٔ پیوستهٔ فارسی (حداکثر ۱٬۰۰۰ کلمه، بدون بخش‌بندی ساختگی) نوشته می‌شود. فقط از اعداد و منبع‌های گزارش بالا استفاده می‌شود. این متن راستی‌آزمایی نشده است: پیش از انتشار، ادعاها را با منبع اصلی تطبیق دهید. گزارش هرمی بالا همچنان نسخهٔ اصلی و قابل استناد است.' }), h('div', { class: 'row-ctl' }, [go]), st, out]);
  }
  function buttons(getB, name) { var U = Hub.util, h = U.h;
    return h('div', { class: 'row-ctl' }, [
      h('button', { class: 'btn primary', type: 'button', text: 'چاپ / ذخیره به PDF', 'data-notr': '1', onclick: function () { try { var fr = document.createElement('iframe'); fr.setAttribute('aria-hidden', 'true'); fr.style.cssText = 'position:fixed;width:0;height:0;border:0;left:-9999px'; fr.srcdoc = digits(doc(getB()), digitMode());
        fr.onload = function () { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { U.toast('چاپ در این محیط در دسترس نیست؛ «دانلود HTML» را بگیرید و از مرورگر چاپ کنید.', 'warn'); } setTimeout(function () { if (fr.parentNode) fr.parentNode.removeChild(fr); }, 60000); }; document.body.appendChild(fr); } catch (e) { U.toast('چاپ در این محیط در دسترس نیست.', 'warn'); } } }),
      h('button', { class: 'btn', type: 'button', text: 'دانلود Word', 'data-notr': '1', onclick: function () { U.saveFile(name + '.doc', new Blob(['﻿' + digits(doc(getB()), digitMode())], { type: 'application/msword' })); } }),
      h('button', { class: 'btn', type: 'button', text: 'دانلود HTML', 'data-notr': '1', onclick: function () { U.saveFile(name + '.html', new Blob([digits(doc(getB()), digitMode())], { type: 'text/html;charset=utf-8' })); } }),
      h('button', { class: 'btn', type: 'button', text: 'کپی متن', 'data-notr': '1', onclick: function () { var t = digits(text(getB()), digitMode()); if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { U.toast('کپی شد.', 'good'); }, function () { U.toast('کپی نشد.', 'warn'); }); } })]); }
  Hub.report = { html: html, doc: doc, text: text, dom: dom, buttons: buttons, lint: lint, lintPanel: lintPanel, articlePanel: articlePanel, ARTICLE_RULES: ARTICLE_RULES, digits: digits, STYLE: STYLE };
})(typeof window !== 'undefined' ? window : globalThis);
