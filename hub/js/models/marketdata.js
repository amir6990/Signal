/* =====================================================================
 * MARKET DATA CENTRE (Trading) — one place to see and refresh every live
 * feed the trading tools use, and to make sure the data can be reached.
 *   1 Feeds: source, scope, last update (local Shamsi time), age, status,
 *     update one feed or all; a failed refresh keeps the last good data.
 *   2 Access: tests for the local proxy, TSETMC and TGJU; which route
 *     worked; the local proxy to download (Python or PowerShell).
 *   3 Settings: when data counts as out of date; refresh on opening.
 * Data stays in each tool's own storage — the tools read what is fetched here.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub; if (!root.document || !Hub.toolkit || !Hub.signals) return;
  Hub.mdSyncTab = function (ctx) { return syncTab(ctx); };
  var U = Hub.util, h = U.h, G = Hub.grid, TK = Hub.toolkit, SG = Hub.signals;
  function F() { return Hub.i18n && Hub.i18n.lang() === 'fa'; }
  function T(en, fa) { return F() ? fa : en; }
  var FAT = { 'sig-stocks': 'سیگنال سهام (بورس تهران)', 'sig-gold': 'سیگنال طلا و سکه', 'sig-fx': 'سیگنال ارز و تتر', 'sig-options': 'سیگنال اختیار معامله', 'sig-temporal': 'تحلیل زمانی (چرخه‌ها)' };
  function load(feed) { var s = U.store.get(feed.storeKey, null); return s && s.version === 1 ? s : feed.sample(); }
  function save(feed, S) { U.store.set(feed.storeKey, S); if (Hub.dataSync) Hub.dataSync.notify(); }
  function status(S) {
    var live = S.meta && S.meta.source && !/synthetic|illustrative/i.test(S.meta.source), age = SG.dataAge(S), max = SG.maxAgeH();
    if (!live) return { k: 'none', t: T('Sample data', 'دادهٔ نمونه') };
    if (!isFinite(age) || age > max) return { k: 'stale', t: T('Out of date', 'کهنه') };
    return { k: 'fresh', t: T('Up to date', 'به‌روز') };
  }
  function isArtifact() { return /claude\.ai|claudeusercontent|anthropic/.test(location.host); }
  function download(name) {
    var txt = (Hub.PROXY_FILES || {})[name]; if (!txt) { U.toast('File not in this build', 'warn'); return; }
    if (/\.(bat|ps1)$/.test(name)) txt = txt.replace(/\r?\n/g, '\r\n');          // Windows line endings
    U.saveFile(name, new Blob([txt], { type: 'text/plain' }));
  }

  function feedsTab(ctx) {
    var S = ctx.S, wrap = h('div'), log = h('div', { 'aria-live': 'polite' }), busy = false;
    function run(list) {
      if (busy) return Promise.resolve(); busy = true; U.clear(log); paint();
      var step = function (i) {
        if (i >= list.length) { busy = false; S.lastAll = Date.now(); ctx.recompute(); paint(); return Promise.resolve(); }
        var f = list[i], St = load(f), line = h('p', { class: 'small', 'data-notr': '1', text: (F() ? FAT[f.id] : f.title) + ' … ' }); log.appendChild(line);
        return SG.safeFetch(f.fetch, St, function (a, b, k) { line.textContent = (F() ? FAT[f.id] : f.title) + ' … ' + a + ' / ' + b + ' · ' + k; })
          .then(function (errs) { save(f, St); line.className = 'small ' + (errs.length ? 'warn-t' : 'good-t'); line.textContent = (F() ? FAT[f.id] : f.title) + ': ' + T('updated', 'به‌روز شد') + (errs.length ? ' · ' + T('partly failed: ', 'بخشی ناموفق: ') + SG.summErr(errs) : errs.notes && errs.notes.length ? ' · ' + errs.notes.join(' · ') : ''); })
          .catch(function (e) { line.className = 'small crit-t'; line.textContent = (F() ? FAT[f.id] : f.title) + ': ' + T('failed — ', 'ناموفق — ') + e.message; })
          .then(function () { paint(); return step(i + 1); });
      };
      return step(0);
    }
    function paint() {
      U.clear(wrap);
      var rows = SG.feeds.map(function (f) {
        var St = load(f), st = status(St), age = SG.dataAge(St);
        var up = h('button', { class: 'btn ghost', type: 'button', text: T('Update', 'به‌روزرسانی'), disabled: busy, onclick: function () { run([f]); } });
        return h('tr', null, [h('td', null, [h('a', { href: '#' + f.id, text: F() ? FAT[f.id] : f.title })]), h('td', { text: f.src }), h('td', { text: f.size(St) }),
          h('td', { class: 'num', 'data-notr': '1', text: st.k === 'none' ? '—' : St.meta.asOf || '—' }), h('td', { 'data-notr': '1', text: st.k === 'none' ? '—' : SG.ageText(age) }),
          h('td', null, [h('span', { class: 'data-age ' + st.k, text: st.t })]), h('td', null, [up])]);
      });
      rows.push(h('tr', null, [h('td', null, [h('a', { href: '#position', text: T('Position Sizing & Risk', 'اندازهٔ موقعیت و ریسک') })]), h('td', { text: 'TSETMC / FMP' }), h('td', { text: T('one symbol', 'یک نماد') }), h('td', { text: '—' }), h('td', { text: '—' }),
        h('td', null, [h('span', { class: 'data-age fresh', text: T('On demand', 'هنگام استفاده') })]), h('td', { class: 'small muted', text: T('fetched inside the tool', 'داخل خود ابزار') })]));
      var head = ['Tool', 'Source', 'Scope', 'Last update', 'Age', 'Status', ''].map(function (x) { return h('th', { class: 'lbl', text: x }); });
      wrap.appendChild(h('div', { class: 'grid-wrap' }, [h('table', { class: 'grid aud se' }, [h('thead', null, [h('tr', null, head)]), h('tbody', null, rows)])]));
      var stale = SG.feeds.filter(function (f) { return status(load(f)).k !== 'fresh'; });
      wrap.appendChild(h('div', { class: 'row-ctl' }, [
        Hub.dataCenterLink ? Hub.dataCenterLink() : h('button', { class: 'btn primary', type: 'button', text: T('Update every section', 'به‌روزرسانی همهٔ بخش‌ها'), disabled: busy, onclick: function () { run(SG.feeds.slice()); } }),
        h('span', { class: 'muted small', text: T('Out of date = older than ', 'کهنه = قدیمی‌تر از ') + SG.maxAgeH() + T(' h (Settings tab).', ' ساعت (زبانهٔ تنظیمات).') })]));
    }
    paint();
    var warn = isArtifact() ? h('p', { class: 'neg', text: T('This online copy runs in a sandbox that blocks outside requests. Open the downloaded HTML file on your computer for live data.', 'این نسخهٔ آنلاین در محیطی اجرا می‌شود که درخواست بیرونی را مسدود می‌کند. برای دادهٔ زنده، فایل HTML دانلودشده را روی کامپیوتر خودتان باز کنید.') }) : null;
    var tab = ctx.group([ctx.panel(T('Live data feeds of the trading tools', 'خوراک‌های دادهٔ زندهٔ ابزارهای معامله‌گری'), [warn,
      h('p', { class: 'f-help', text: T('Each tool keeps its own data; updating here is the same as pressing Fetch inside the tool. A failed update never replaces the last good data.', 'هر ابزار دادهٔ خودش را نگه می‌دارد؛ به‌روزرسانی اینجا همان دکمهٔ «دریافت» داخل ابزار است. به‌روزرسانی ناموفق هرگز جای آخرین دادهٔ سالم را نمی‌گیرد.') }), wrap, log])]);
    tab.after = function () {
      if (S.auto && !isArtifact()) { var stale = SG.feeds.filter(function (f) { return status(load(f)).k !== 'fresh'; }); if (stale.length && !busy) run(stale); }
    };
    return tab;
  }

  function accessTab(ctx) {
    var out = h('div', { 'aria-live': 'polite' });
    function row(name, p) { var td = h('td', { text: T('testing…', 'در حال آزمون…') }), tr = h('tr', null, [h('td', { text: name }), td]); out.querySelector('tbody').appendChild(tr);
      return p.then(function (msg) { td.className = 'good-t'; td.textContent = '✓ ' + msg; }, function (e) { td.className = 'crit-t'; td.textContent = '✗ ' + (e && e.message || e); }); }
    function testAll() {
      U.clear(out); out.appendChild(h('div', { class: 'grid-wrap' }, [h('table', { class: 'grid aud se' }, [h('tbody')])]));
      row(T('Local proxy (127.0.0.1:8787)', 'پروکسی محلی (127.0.0.1:8787)'), Hub.data.localPing().then(function (j) { return T('running', 'در حال اجرا') + ' · ' + j.proxy + ' ' + (j.version || ''); }, function () { throw new Error(T('not running — start it (steps below)', 'اجرا نشده — طبق گام‌های پایین راه‌اندازی کنید')); }))
        .then(function () { return row('TSETMC', Hub.data.tse.quote('فولاد').then(function (q) { var r = Hub.data.route(); return q.symbol + ' ' + U.fmtNum(q.price) + ' IRR · ' + T('route: ', 'مسیر: ') + r.name; })); })
        .then(function () { return row('TGJU', Hub.data.testTgju().then(function (x) { var r = Hub.data.route(); return T('dollar (free market) ', 'دلار بازار آزاد ') + U.fmtNum(x.close) + ' · ' + x.date + ' · ' + T('route: ', 'مسیر: ') + r.name; })); })
        .then(function () { var k = Hub.data.keys(); return row(T('Global data (FMP / Alpha Vantage)', 'دادهٔ جهانی (FMP / Alpha Vantage)'), k.fmp || k.av ? Promise.resolve(T('key saved — test it on Data sources & keys', 'کلید ثبت شده — در صفحهٔ «منابع داده و کلیدها» بیازمایید')) : Promise.reject(new Error(T('no key (only needed for non-Iranian symbols)', 'کلیدی ثبت نشده (فقط برای نمادهای غیرایرانی لازم است)')))); });
    }
    var b = function (n, label) { return h('button', { class: 'btn ghost', type: 'button', text: label, onclick: function () { download(n); } }); };
    var steps = h('ol', { class: 'steps' }, [
      h('li', null, [h('strong', { text: T('Download the local proxy (once). ', 'پروکسی محلی را دانلود کنید (یک بار). ') }), document.createTextNode(T('Both files of one option into the same folder.', 'هر دو فایل یک گزینه را در یک پوشه بگذارید.')),
        h('div', { class: 'row-ctl' }, [b('hub-proxy.py', 'hub-proxy.py'), b('run-hub-proxy.bat', 'run-hub-proxy.bat'), h('span', { class: 'muted small', text: T('needs Python 3', 'نیاز به Python 3') })]),
        h('div', { class: 'row-ctl' }, [b('hub-proxy.ps1', 'hub-proxy.ps1'), b('run-hub-proxy-powershell.bat', 'run-hub-proxy-powershell.bat'), h('span', { class: 'muted small', text: T('no install needed (Windows PowerShell)', 'بدون نصب (PowerShell ویندوز)') })])]),
      h('li', null, [h('strong', { text: T('Run it: ', 'اجرا کنید: ') }), document.createTextNode(T('double-click the .bat file and keep the window open while you work.', 'روی فایل .bat دوبار کلیک کنید و پنجره را تا پایان کار باز نگه دارید.'))]),
      h('li', null, [h('strong', { text: T('Test: ', 'آزمون: ') }), document.createTextNode(T('press “Test all connections”. The hub finds the proxy by itself — nothing to configure.', '«آزمون همهٔ اتصال‌ها» را بزنید. هاب پروکسی را خودش پیدا می‌کند و تنظیمی لازم نیست.'))])]);
    return ctx.group([ctx.panel(T('Connections', 'وضعیت اتصال‌ها'), [h('div', { class: 'row-ctl' }, [h('button', { class: 'btn primary', type: 'button', text: T('Test all connections', 'آزمون همهٔ اتصال‌ها'), onclick: testAll })]), out]),
      ctx.panel(T('Make the data reachable', 'راه‌اندازی دسترسی به داده'), [
        h('p', { class: 'f-help', text: T('Browsers block a page from reading TSETMC and TGJU directly (CORS), and TSETMC often refuses requests from outside Iran. The hub therefore tries, in order: your proxy prefix (if set) → direct → the local proxy on this computer, and remembers the route that worked.', 'مرورگر اجازه نمی‌دهد صفحه مستقیم از TSETMC و TGJU بخواند (CORS) و TSETMC معمولاً درخواست‌های خارج از ایران را رد می‌کند. بنابراین هاب به ترتیب امتحان می‌کند: پیشوند پروکسی شما (اگر تنظیم شده) ← مستقیم ← پروکسی محلی روی همین کامپیوتر، و مسیر موفق را به خاطر می‌سپارد.') }), steps,
        h('p', { class: 'small muted', text: T('Safety: the proxy listens only on this computer (127.0.0.1), forwards only GET requests, and only to TSETMC, TGJU, Codal and the other data hosts the hub uses. A Cloudflare Worker (Data sources & keys) also works where TSETMC accepts its servers’ addresses.', 'امنیت: پروکسی فقط روی همین کامپیوتر (127.0.0.1) گوش می‌دهد، فقط درخواست GET را و فقط به TSETMC، TGJU، کدال و سایر منابع دادهٔ هاب می‌فرستد. Cloudflare Worker (صفحهٔ منابع داده) هم کار می‌کند، اگر TSETMC آدرس سرورهای آن را بپذیرد.') })])]);
  }


  /* ---------- connection test: the hub's own calls, straight from this page, timed one by one ---------- */
  function diagPanel(ctx) {
    var st = h('div', { class: 'studio-status', 'aria-live': 'polite' }), box = h('div'), rep = '';
    var btn = h('button', { class: 'btn', type: 'button', text: 'تست اتصال به بورس و TGJU', 'data-notr': '1', onclick: function () {
      U.clear(box); st.className = 'studio-status'; st.textContent = 'در حال آزمون…'; btn.disabled = true; var tb = h('tbody');
      box.appendChild(h('div', { class: 'grid-wrap' }, [h('table', { class: 'grid aud se' }, [h('thead', null, [h('tr', null, ['آدرس', 'نتیجه', 'زمان'].map(function (x) { return h('th', { 'data-notr': '1', text: x }); }))]), tb])]));
      Hub.data.diagnose(function (r, i, n) { st.textContent = 'در حال آزمون… ' + (i + 1) + ' از ' + n;
        tb.appendChild(h('tr', null, [h('td', { 'data-notr': '1', text: r.name }), h('td', { 'data-notr': '1', class: r.ok ? 'good-t' : 'bad-t', style: 'white-space:normal', text: r.ok ? 'رسید (' + Math.round(r.bytes / 1024) + ' KB)' : (r.err || 'HTTP ' + r.status) }), h('td', { 'data-notr': '1', text: (r.ms / 1000).toFixed(1) + ' ث' })])); })
        .then(function (rows) { btn.disabled = false; var tse = rows.filter(function (r) { return /TSETMC/.test(r.name); }), okT = tse.filter(function (r) { return r.ok; }).length, tg = rows[rows.length - 1].ok;
          st.className = 'studio-status ' + (okT === tse.length ? 'good-t' : 'warn-t');
          st.textContent = okT === tse.length ? 'اتصال مستقیم به بورس برقرار است؛ «به‌روزرسانی همه» روی همین دستگاه کار می‌کند.'
            : okT ? 'بخشی از آدرس‌های بورس جواب داد (' + okT + ' از ' + tse.length + '). به‌روزرسانی کار می‌کند اما بخش‌های ناموفق با دادهٔ قبلی می‌مانند.'
            : tse.every(function (r) { return /timeout/.test(r.err || ''); }) ? 'بورس جواب نداد (بی‌پاسخ). معمولاً یعنی اینترنت این دستگاه از خارج ایران دیده می‌شود: فیلترشکن را خاموش کنید و دوباره آزمون کنید.' + (tg ? ' (TGJU رسید، پس اینترنت وصل است.)' : '')
            : 'مرورگر درخواست بورس را رد کرد (شبکه یا CORS). متن این جدول را برای بررسی بفرستید؛ تا آن موقع از «دریافت از کامپیوتر» استفاده کنید.';
          rep = 'Hub connection test · ' + new Date().toISOString() + ' · ' + location.origin + ' · store=' + U.store.backend() + '\n' + rows.map(function (r) { return (r.ok ? 'OK   ' : 'FAIL ') + r.name + ' · ' + (r.ok ? r.bytes + ' B' : (r.err || 'HTTP ' + r.status)) + ' · ' + r.ms + ' ms'; }).join('\n') + '\n' + navigator.userAgent;
          box.appendChild(h('div', { class: 'row-ctl' }, [h('button', { class: 'btn sm', type: 'button', text: 'کپی گزارش آزمون', 'data-notr': '1', onclick: function () { try { navigator.clipboard.writeText(rep).then(function () { U.toast('کپی شد', 'good'); }); } catch (e) { U.toast('کپی نشد', 'warn'); } } })]));
        });
    } });
    var keysBig = ['hub.sigstocks.v1', 'hub.sigoptions.v1', 'hub.longview.v1', 'hub.sigtemporal.v1'], kb = keysBig.reduce(function (a, k) { return a + U.store.size(k); }, 0);
    return ctx.panel('آزمون اتصال', [h('p', { class: 'f-help', 'data-notr': '1', text: 'همان آدرس‌هایی که «به‌روزرسانی» صدا می‌زند، مستقیم از همین دستگاه و یکی‌یکی آزموده می‌شود تا معلوم شود کدام می‌رسد و کدام نه.' }),
      h('div', { class: 'row-ctl' }, [btn]), st, box,
      h('p', { class: 'small muted', 'data-notr': '1', text: 'محل نگهداری داده روی این دستگاه: ' + (U.store.backend() === 'IndexedDB' ? 'پایگاه دادهٔ مرورگر (IndexedDB، بدون محدودیت ۵ مگابایت)' : 'localStorage (محدود؛ ممکن است دادهٔ کامل جا نشود)') + ' · حجم دادهٔ بازار: ' + (kb / 1048576).toFixed(1) + ' میلیون نویسه' })]);
  }

  /* ---------- phone sync: PC publishes to GitHub, the phone pulls ---------- */
  function syncTab(ctx) {
    var DS = Hub.dataSync, c = DS.cfg(), phone = DS.served(), st = h('div', { class: 'studio-status', 'aria-live': 'polite' }), wrap = h('div');
    var ago = function (t) { if (!t) return '—'; var m = (Date.now() - new Date(t).getTime()) / 6e4; return m < 60 ? Math.round(m) + ' دقیقه پیش' : m < 2880 ? Math.round(m / 60) + ' ساعت پیش' : Math.round(m / 1440) + ' روز پیش'; };
    function pullBtn() { return h('button', { class: 'btn primary', type: 'button', text: 'دریافت آخرین داده از کامپیوتر / سرور', onclick: function () { st.textContent = 'در حال دریافت…'; DS.pull(true).then(function (r) { st.textContent = (r.updated.length ? r.updated.length + ' مجموعه داده به‌روز شد.' : 'دادهٔ تازه‌تری نبود.') + (r.errors.length ? ' خطا: ' + r.errors.join('؛ ') : ''); if (r.updated.length && Hub.rerenderAll) setTimeout(Hub.rerenderAll, 300); paint(); }); } }); }
    function paint() {
      U.clear(wrap); var L = DS.last(), P = DS.lastPub(), sn = (L && L.snaps) || {};
      wrap.appendChild(h('div', { class: 'grid-wrap' }, [h('table', { class: 'grid aud se' }, [h('tbody', null, [
        ['دادهٔ بورس (TSETMC: سهام، اختیار، شاخص)', sn.tse ? 'منتشرشده ' + ago(sn.tse.publishedAt) + ' از ' + (sn.tse.by === 'pc' ? 'کامپیوتر شما' : sn.tse.by) : 'هنوز دریافت نشده'],
        ['طلا و ارز (TGJU)', sn.tgju ? 'منتشرشده ' + ago(sn.tgju.publishedAt) + ' از ' + (sn.tgju.by === 'github-action' ? 'به‌روزرسانی خودکار GitHub (هر ساعت)' : 'کامپیوتر شما') : 'هنوز دریافت نشده'],
        ['آخرین انتشار از همین دستگاه', P ? ago(P.at) + ' · ' + P.files.join('، ') : '—']].map(function (r) { return h('tr', null, [h('td', { 'data-notr': '1', text: r[0] }), h('td', { 'data-notr': '1', style: 'white-space:normal', text: r[1] })]); }))])]));
    }
    var why = h('p', { class: 'f-help', 'data-notr': '1', text: phone
      ? 'روش اصلی: «به‌روزرسانی همه» روی همین گوشی، مستقیم از سایت بورس (با اینترنت داخل ایران و فیلترشکن خاموش). روش پشتیبان، برای وقتی که گوشی به بورس نمی‌رسد (خارج از ایران یا فیلترشکن روشن): دریافت آخرین داده‌ای که کامپیوتر شما منتشر کرده است.'
      : 'گوشی در ایران خودش مستقیم از سایت بورس به‌روز می‌شود. این بخش پشتیبان است: سایت بورس فقط از داخل ایران جواب می‌دهد (آزمون ۲۰ آبان ۱۴۰۵ از سرورهای خارج: بی‌پاسخ)، پس اگر گوشی با فیلترشکن یا خارج از ایران است، کامپیوتر داده را منتشر می‌کند و گوشی آن را می‌گیرد.' });
    var parts = [why];
    if (phone) {
      var ap = h('input', { type: 'checkbox', 'aria-label': 'دریافت خودکار' }); ap.checked = c.autoPull !== false; ap.addEventListener('change', function () { DS.setCfg({ autoPull: ap.checked }); });
      parts.push(h('div', { class: 'row-ctl' }, [pullBtn(), h('label', { class: 'chk-l' }, [ap, document.createTextNode(' هر بار که برنامه باز می‌شود خودکار دریافت شود')])]), st, wrap);

    } else {
      var f = function (k, label, type, help) { var i = h('input', { class: 'f-in', type: type || 'text', value: c[k] || '', 'aria-label': label, autocomplete: 'off', style: 'min-width:280px' }); i.addEventListener('change', function () { var o = {}; o[k] = i.value.trim(); DS.setCfg(o); }); return h('label', { class: 'f-row', style: 'display:grid;gap:4px' }, [h('span', { text: label }), i, help ? h('span', { class: 'small muted', text: help }) : null]); };
      var au = h('input', { type: 'checkbox', 'aria-label': 'انتشار خودکار' }); au.checked = !!c.auto; au.addEventListener('change', function () { DS.setCfg({ auto: au.checked }); });
      parts.push(h('ol', { class: 'studio-l' }, ['یک بار: در GitHub یک توکن «Fine-grained» بسازید (Settings ← Developer settings ← Personal access tokens ← Fine-grained tokens): فقط مخزن ' + c.repo + '، دسترسی Contents: Read and write. توکن را این‌جا وارد کنید؛ فقط در همین مرورگر کامپیوتر ذخیره می‌شود و فقط به api.github.com فرستاده می‌شود.',
        'هر بار: پروکسی محلی را اجرا و داده‌ها را به‌روز کنید (معامله‌گری ← اجرا و داده ← به‌روزرسانی همه).', '«انتشار برای گوشی» را بزنید (یا گزینهٔ خودکار را روشن کنید). حدود ۱ تا ۲ دقیقه بعد، گوشی با باز کردن برنامه داده را می‌گیرد.'].map(function (x) { return h('li', { text: x }); })));
      parts.push(f('token', 'توکن GitHub', 'password', 'برای امنیت: توکن فقط به همین یک مخزن و فقط Contents دسترسی داشته باشد.'), f('repo', 'مخزن', 'text'), f('branch', 'شاخه', 'text'), f('dir', 'پوشه داده در مخزن', 'text', 'باید پوشهٔ data کنار برنامهٔ گوشی باشد (hub/data).'));
      parts.push(h('div', { class: 'row-ctl' }, [h('button', { class: 'btn primary', type: 'button', text: 'انتشار برای گوشی', onclick: function () { st.textContent = 'در حال انتشار…'; DS.publish().then(function (i) { st.className = 'studio-status good-t'; st.textContent = 'منتشر شد: ' + i.files.join('، ') + '. حدود ۱ تا ۲ دقیقه تا رسیدن به گوشی.'; paint(); }, function (e) { st.className = 'studio-status crit-t'; st.textContent = 'ناموفق: ' + e.message; }); } }),
        h('label', { class: 'chk-l' }, [au, document.createTextNode(' بعد از هر به‌روزرسانی موفق، خودکار منتشر شود')])]), st, wrap);
    }
    paint();
    return ctx.group(phone ? [diagPanel(ctx), ctx.panel('پشتیبان: دریافت از کامپیوتر', parts)] : [ctx.panel('همگام‌سازی با گوشی (پشتیبان)', parts)]);
  }
  function settingsTab(ctx) {
    var f = G.form({ id: 'md-set', onChange: ctx.recompute, fields: [ctx.field('mx', T('Data counts as out of date after (hours)', 'داده پس از چند ساعت کهنه حساب شود'), 'maxAgeH', 'dec'),
      { key: 'au', label: T('Update out-of-date feeds when this page opens', 'به‌روزرسانی خودکار داده‌های کهنه هنگام باز شدن این صفحه'), options: [['no', T('No', 'خیر')], ['yes', T('Yes', 'بله')]], get: function () { return ctx.S.auto ? 'yes' : 'no'; }, set: function (v) { ctx.S.auto = v === 'yes'; } }] });
    return ctx.group([ctx.panel(T('Settings', 'تنظیمات'), [f.el || f, h('p', { class: 'f-help', text: T('Tip: during trading days 24 h is a sensible limit; signals computed on older data show an “Out of date” badge in each tool.', 'پیشنهاد: در روزهای معاملاتی ۲۴ ساعت حد معقولی است؛ سیگنال‌هایی که روی دادهٔ قدیمی‌تر محاسبه شده‌اند در هر ابزار برچسب «کهنه» می‌گیرند.') })])]);
  }

  TK.define({ id: 'market-data', title: 'Market data centre', sections: ['trading'], priority: -10, version: 1, storeKey: 'hub.marketdata.v1', noFile: true,
    summary: 'Every live feed of the trading tools in one table: source, last update, age, status; update one or all; connection tests and the local proxy that makes TSETMC and TGJU reachable.',
    sample: function () { return { version: 1, tool: 'market-data', settings: {}, sources: {}, maxAgeH: 24, auto: false }; },
    run: function (S) { var st = SG.feeds.map(function (f) { return status(load(f)).k; }); return { fresh: st.filter(function (x) { return x === 'fresh'; }).length, all: st.length, checks: st.some(function (x) { return x !== 'fresh'; }) ? [{ level: 'warning', msg: T('Some feeds are out of date or still sample data.', 'برخی داده‌ها کهنه یا هنوز نمونه‌اند.') }] : [] }; },
    eyebrow: function () { return 'Trading · data'; }, heading: function () { return T('Market data centre', 'مرکز دادهٔ بازار'); },
    kpis: function (ctx) { return [['Up-to-date feeds', function () { return ctx.R.fresh + ' / ' + ctx.R.all; }, function () { return '≤ ' + SG.maxAgeH() + ' h'; }],
      ['Last route', function () { var r = Hub.data.route(); return r && r.at ? r.name : '—'; }, function () { var r = Hub.data.route(); return r && r.host ? r.host : T('no request yet', 'هنوز درخواستی نیست'); }]]; },
    tabs: [{ group: 'Data', items: [['feeds', 'Feeds and update', feedsTab], ['access', 'Access and connection', accessTab], ['sync', 'Phone sync', syncTab], ['set', 'Settings', settingsTab]] }] });
})(window);
