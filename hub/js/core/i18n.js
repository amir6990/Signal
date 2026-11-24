/* =====================================================================
 * I18N — English / فارسی
 * The interface is written in English; in Persian mode a translator walks
 * every rendered text node, placeholder, title and label and swaps in the
 * Persian from the dictionary (js/core/i18n-fa.js). Composite labels are
 * translated segment by segment ("Value per share · Gordon"). Anything
 * without a translation stays English. User data (inputs, pasted line names,
 * Claude's analysis) is never touched. Figures stay in Latin digits.
 * Persian mode sets dir="rtl" and the Vazirmatn font. Excel exports follow
 * the interface language for labels; sheet names and formulas stay English.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  var KEY = 'hub.lang';
  var lang = 'en';
  try { lang = JSON.parse(localStorage.getItem(KEY)) || 'en'; } catch (e) { lang = 'en'; }
  var D = function () { return Hub.FA || {}; };
  var SEP = /(\s+·\s+|\s+—\s+|\s+→\s+|:\s+|\s+\/\s+|\s+×\s+)/;

  function exact(s) { var d = D(); if (Object.prototype.hasOwnProperty.call(d, s)) return d[s]; var t = s.trim(); if (t !== s && Object.prototype.hasOwnProperty.call(d, t)) return s.replace(t, d[t]); return null; }
  function seg(s) {
    var e = exact(s); if (e != null) return e;
    var m = s.match(/^(.*?)\s*\(([^()]*)\)\s*$/);                       // "Label (detail)"
    if (m && m[1]) { var a = tr(m[1]), b = tr(m[2]); if (a !== m[1] || b !== m[2]) return a + ' (' + b + ')'; }
    if (/\d/.test(s)) { var ns = [], tp = s.replace(/-?\d[\d,]*(\.\d+)?/g, function (n) { ns.push(n); return '#'; }), te = exact(tp); if (te != null && ((te.match(/#/g) || []).length === ns.length || !/#/.test(te))) { var q = 0; return te.replace(/#/g, function () { return ns[q++]; }); } }
    m = s.match(/^(Less|Plus): (.*)$/); if (m) { var r = tr(m[2]); if (r !== m[2]) return (m[1] === 'Less' ? 'کسر: ' : 'به‌علاوه: ') + r; }
    return s;
  }
  var RX = [[/^(\d+) to review$/, '$1 مورد برای بازبینی'], [/^(\d+) critical$/, '$1 مورد بحرانی'], [/^(\d+) of (\d+) steps$/, '$1 از $2 گام'], [/^(\d+) tools$/, '$1 ابزار'],
    [/^(\d+) ready of (\d+)$/, '$1 آماده از $2'], [/^by (.+) · incl\. buffer (.+)$/, 'تا $1 · با ذخیره $2'], [/^Fetching (\d+) \/ (\d+) · (.+)$/, 'دریافت $1 از $2 · $3'], [/^Source: (.*)$/, function (m, a) { return 'منبع: ' + tr(a); }],
    [/^((?:[^:.]+: score has no evidence recorded\.\s*)+)$/, function (m) { return m.split(/(?<=recorded\.)\s*/).filter(Boolean).map(function (x) { return tr(x.replace(/: score has no evidence recorded\.$/, '')) + ': برای امتیاز شاهدی ثبت نشده است.'; }).join(' '); }],
    [/^equity value, (.+)$/, 'ارزش سهام، $1'],
    [/^Exit (EV \/ EBITDA|EV \/ EBIT|EV \/ Sales|P \/ E|P \/ S|P \/ B)  ◀ used$/, 'ضریب خروج $1  ◀ در حال استفاده'], [/^Exit (EV \/ EBITDA|EV \/ EBIT|EV \/ Sales|P \/ E|P \/ S|P \/ B)$/, 'ضریب خروج $1'],
    [/^(FCFF|FCFE) · value per share · exit (.+)$/, '$1 · ارزش هر سهم · خروج با $2'], [/^(FCFF|FCFE) · value per share · Gordon growth$/, '$1 · ارزش هر سهم · رشد گوردون'],
    [/^FCFF · enterprise value · Gordon growth \((.+)\)$/, 'FCFF · ارزش بنگاه · رشد گوردون ($1)'], [/^Exit multiple used · FCFF \| FCFE$/, 'ضریب خروج استفاده‌شده · FCFF | FCFE'], [/^Discount rate · FCFF \| FCFE$/, 'نرخ تنزیل · FCFF | FCFE'],
    // model checks (DCF tool and Company Model)
    [/^(Historical|Latest historical) balance sheet differs by (.+) \(rounding in the source statements\)\. Projected BS carries this difference\.$/, 'ترازنامهٔ تاریخی $2 واحد اختلاف دارد (گرد کردن در صورت‌های منبع). ترازنامهٔ پیش‌بینی همین اختلاف را حمل می‌کند.'],
    [/^Latest historical balance sheet does not balance \(difference (.+)\)\. Projected BS carries this difference\.$/, 'آخرین ترازنامهٔ تاریخی تراز نیست (اختلاف $1). ترازنامهٔ پیش‌بینی همین اختلاف را حمل می‌کند.'],
    [/^(.+): balance sheet differs by (.+) \(rounding in the source statements\)\.$/, '$1: ترازنامه $2 واحد اختلاف دارد (گرد کردن در صورت‌های منبع).'],
    [/^(.+): balance sheet does not balance \(difference (.+)\)\. Check line roles and totals marked "Ignore"\.$/, '$1: ترازنامه تراز نیست (اختلاف $2). نقش سطرها و جمع‌هایی را که «نادیده» علامت خورده‌اند بررسی کنید.'],
    [/^Projected balance sheet out of balance by (.+)\.$/, 'ترازنامهٔ پیش‌بینی $1 واحد عدم توازن دارد.'],
    [/^The terminal-value rate \((.+)\) must exceed terminal growth for the Gordon method\.$/, 'نرخ دورهٔ نهایی ($1) باید از نرخ رشد پایانی بیشتر باشد (روش گوردون).'],
    [/^Terminal value discounted at the risk-free rate \(house option\).*$/, 'ارزش پایانی با نرخ بدون ریسک تنزیل شده (روش داخلی): فاصلهٔ نرخ تا رشد کم می‌شود و ارزش پایانی بر ارزش غالب می‌شود. استاندارد جهانی هزینهٔ سرمایه است.'],
    [/^Terminal value is (\d+)% of EV \(Gordon\)\.( Valuation rests mostly on the terminal assumption\.)?$/, 'ارزش پایانی $1٪ ارزش بنگاه است (گوردون). ارزش‌گذاری عمدتاً به فرض دورهٔ نهایی متکی است.'],
    [/^Exit multiple implies (.+)% perpetual growth vs (.+)% assumed\.( The two terminal methods disagree\.)?$/, 'ضریب خروج رشد دائمی $1٪ را نشان می‌دهد در برابر $2٪ فرض‌شده؛ دو روش ارزش پایانی هم‌خوان نیستند.'],
    [/^Real perpetual growth above 3% exceeds typical long-run real GDP growth\.$/, 'رشد دائمی حقیقی بالای ۳٪ از رشد بلندمدت معمول تولید ناخالص داخلی حقیقی بیشتر است.'],
    [/^Risk-free rate is below expected inflation.*$/, 'نرخ بدون ریسک کمتر از تورم مورد انتظار است، پس نرخ بدون ریسک حقیقی منفی می‌شود. ورودی تورم را بررسی کنید یا از یک نرخ حقیقی جایگزین استفاده کنید.'],
    [/^Nominal perpetual growth \((.+)%\) is below expected inflation \((.+)%\).*$/, 'رشد دائمی اسمی ($1٪) کمتر از تورم مورد انتظار ($2٪) است، یعنی کسب‌وکار در قیمت ثابت کوچک می‌شود. در حالت اسمی، رشدها باید تورم را شامل شوند.'],
    [/^Projected cash turns negative by the final year\..*$/, 'وجه نقد پیش‌بینی تا سال آخر منفی می‌شود. در برنامهٔ تأمین مالی بدهی اضافه کنید یا نسبت تقسیم سود را کم کنید.'],
    [/^Terminal-year capex is below D&A\..*$/, 'مخارج سرمایه‌ای سال پایانی کمتر از استهلاک است؛ کسب‌وکار در حال رشد معمولاً دست‌کم به اندازهٔ استهلاک سرمایه‌گذاری مجدد می‌کند.'],
    [/^No income-statement line mapped to "(.+)"\.$/, 'هیچ سطری از صورت سود و زیان به «$1» نگاشت نشده است.'],
    [/^No balance-sheet line mapped to "(.+)"\.$/, 'هیچ سطری از صورت وضعیت مالی به «$1» نگاشت نشده است.'],
    [/^No depreciation line\..*$/, 'سطر استهلاک وجود ندارد. آن را از یادداشت‌ها اضافه کنید (سطر یادداشتی)، وگرنه EBITDA و جریان نقد آزاد کمتر از واقع نشان داده می‌شوند.'],
    [/^Derived cash flow does not reconcile to the change in cash \(difference (.+)\)\.$/, 'جریان نقد استخراج‌شده با تغییر وجه نقد تطبیق نمی‌کند (اختلاف $1).'],
    [/^Cash need: funding of (.+) required by (.+) \(first shortfall (.+)\)\. See the Cash need tab\.$/, 'نیاز نقدینگی: تأمین مالی $1 تا $2 لازم است (اولین کسری $3). زبانهٔ نیاز نقدینگی را ببینید.'],
    [/^Discount rate must exceed terminal growth\.$/, 'نرخ تنزیل باید از نرخ رشد پایانی بیشتر باشد.'], [/^No issues\.$/, 'موردی یافت نشد.']];
  function tr(s) {
    if (lang !== 'fa' || s == null) return s;
    s = String(s); if (!/[A-Za-z]/.test(s)) return s;
    var e = exact(s); if (e != null) return e;
    for (var i = 0; i < RX.length; i++) if (RX[i][0].test(s.trim())) return s.trim().replace(RX[i][0], RX[i][1]);
    var parts = s.split(SEP), res = s;
    if (parts.length === 1) res = seg(s);
    else { var changed = false, out = parts.map(function (p, i) { if (i % 2) return p; var x = seg(p); if (x !== p) changed = true; return x; }); if (changed) res = out.join(''); }
    if (/[A-Za-z]{3,}/.test(res.replace(/\b[A-Z][A-Za-z0-9/&]*\b/g, ''))) { var alt = lists(s); if (alt != null) return alt; }
    // numbers inside the text: translate the template ("Coupon #") and put the numbers back
    if (!noNum && /\d/.test(s) && (res === s || /[a-z]{4,}/.test(res))) {
      var nums = [], tpl = s.replace(/-?\d[\d,]*(\.\d+)?/g, function (n) { nums.push(n); return '#'; });
      noNum = true; var r2; try { r2 = tr(tpl); } finally { noNum = false; }
      if (r2 !== tpl && (r2.match(/#/g) || []).length === nums.length) { var k2 = 0; return r2.replace(/#/g, function () { return nums[k2++]; }); }
    }
    return res;
  }
  var noNum = false;
  // several known sentences in one string, or a comma-separated list of known phrases
  function lists(s) {
    var t = s.trim(), m;
    if ((m = t.split(/(?<=\.)\s+(?=[A-Z])/)).length > 1) { var a = m.map(function (x) { return tr(x); }); if (a.every(function (x, i) { return x !== m[i]; })) return a.join(' '); }
    var dot = /\.$/.test(t) ? '.' : '', body = dot ? t.slice(0, -1) : t;
    if ((m = body.split(/,\s+/)).length > 1) { var b = m.map(function (x) { return tr(x); }); if (b.every(function (x, i) { return x !== m[i]; })) return b.join('، ') + dot; }
    var k = t.indexOf(': ');
    if (k > 0) { var head = tr(t.slice(0, k)), tail = lists(t.slice(k + 2)); if (tail != null) return head + ': ' + tail; }
    return null;
  }

  var SKIP = { INPUT: 1, TEXTAREA: 1, SCRIPT: 1, STYLE: 1, OPTION: 0 };
  function walk(node) {
    if (lang !== 'fa' || !node) return;
    if (node.nodeType === 3) { var p = node.parentNode; if (!p || SKIP[p.nodeName] || (p.closest && p.closest('[data-notr]'))) return; var v = node.nodeValue; if (v && /[A-Za-z]/.test(v)) { var t = tr(v); if (t !== v) node.nodeValue = t; } return; }
    if (node.nodeType !== 1 || SKIP[node.nodeName] === 1 && node.nodeName !== 'INPUT' && node.nodeName !== 'TEXTAREA') { if (node.nodeType !== 1) return; }
    if (node.closest && node.closest('[data-notr]')) return;
    ['placeholder', 'title', 'aria-label'].forEach(function (a) { var v = node.getAttribute && node.getAttribute(a); if (v && /[A-Za-z]/.test(v)) { var t = tr(v); if (t !== v) node.setAttribute(a, t); } });
    if (SKIP[node.nodeName] === 1) return;
    for (var c = node.firstChild; c; c = c.nextSibling) walk(c);
  }
  var obs = null;
  function observe() {
    if (obs || !root.MutationObserver) return;
    obs = new MutationObserver(function (list) {
      if (lang !== 'fa') return;
      list.forEach(function (m) {
        if (m.type === 'characterData') walk(m.target);
        else if (m.type === 'attributes') walk(m.target);
        else m.addedNodes.forEach(function (n) { walk(n); });
      });
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'title', 'aria-label'] });
  }
  function applyDir() {
    var el = document.documentElement;
    el.setAttribute('lang', lang === 'fa' ? 'fa' : 'en');
    el.setAttribute('dir', lang === 'fa' ? 'rtl' : 'ltr');
    document.querySelectorAll('#lang-switch [data-lang]').forEach(function (x) { var on = x.getAttribute('data-lang') === lang; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); });
  }
  function set(l) {
    lang = l === 'fa' ? 'fa' : 'en';
    try { localStorage.setItem(KEY, JSON.stringify(lang)); } catch (e) { /* ignore */ }
    applyDir();
    if (Hub.rerenderAll) Hub.rerenderAll();          // rebuild in English, the observer translates
    if (lang === 'fa') walk(document.body);
  }
  function init() {
    applyDir(); observe();
    document.querySelectorAll('#lang-switch [data-lang]').forEach(function (x) { x.addEventListener('click', function () { if (x.getAttribute('data-lang') !== lang) set(x.getAttribute('data-lang')); }); });
    if (lang === 'fa') walk(document.body);
  }
  Hub.i18n = { lang: function () { return lang; }, set: set, t: tr, init: init, walk: walk };
})(typeof window !== 'undefined' ? window : globalThis);
