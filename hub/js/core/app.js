/* =====================================================================
 * APP SHELL — sections, tool registry, hash router, home, data sources.
 *
 * Adding a tool:
 *   Hub.register({ id:'comps', title:'Comparable Companies', sections:['valuation','ib'],
 *                  status:'ready', summary:'...', mount:function(el){...}, unmount:function(){} })
 *   Then add its file to build/order.txt and run `node build-modules.js`: the tool gets its module page from its section
 *   (PLACE below), and every script it needs is resolved automatically.
 *
 * Pages (build-modules.js): index.html is the hub — the gateway that lists every module and tool and hosts no tool; each
 * section is its own page (desk.html, trading.html, iran.html, valuation.html, …) that loads only the scripts its tools need.
 * window.HUB_MODULE names the module of the page; window.HUB_MANIFEST (js/core/manifest.js) maps every tool to its page,
 * so an address of a tool that lives elsewhere (#dcf on trading.html, or an old #trade-center link) opens the right page.
 * All pages share the same origin, so they share the same store (IndexedDB + localStorage), settings and data.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  var U = Hub.util, h = U.h;
  var MOD = root.HUB_MODULE || null;           // null = the hub (gateway) page
  function MAN() { return root.HUB_MANIFEST || null; }
  function modOf(id) { var M = MAN(); return M && M.tools[id] ? M.tools[id].m : null; }
  // a tool is on this page when this is its module, or it is a shared tool also hosted here (e.g. the data update centre)
  function here(id) { var M = MAN(), t = M && M.tools[id]; return !t || t.m === MOD || (t.also || []).indexOf(MOD) >= 0; }
  function sharedHere() { var M = MAN(), mm = M && M.modules.filter(function (x) { return x.id === MOD; })[0]; return (mm && mm.shared) || []; }
  function fileOfMod(m) { var M = MAN(); if (!M) return null; var x = M.modules.filter(function (q) { return q.id === m; })[0]; return x ? x.file : null; }
  function urlOf(id) { var m = modOf(id), f = m && fileOfMod(m); return f ? f + '#' + id : null; }
  // leave the page only after pending writes reached the shared store (IndexedDB), so the next page reads them
  function go(url) { var st = U.store; var p = st && st.flush ? st.flush() : Promise.resolve(); var t = setTimeout(function () { location.href = url; }, 3000); p.then(function () { clearTimeout(t); location.href = url; }, function () { clearTimeout(t); location.href = url; }); }

  // one place per tool: the sidebar and the home page list every tool once
  var SECTIONS = [
    { id: 'desk', label: 'Trading Dashboard Center' },
    { id: 'trading', label: 'Trading' },
    { id: 'iran', label: 'Iran Economy: Financial Analysis' },
    { id: 'strategy', label: 'Business Strategy & Solutions' },
    { id: 'statements', label: 'Financial Statements & Audit' },
    { id: 'valuation', label: 'Valuation' },
    { id: 'financing', label: 'Financing & Financial Management' },
    { id: 'bonds', label: 'Bond Issuance' },
    { id: 'ipo', label: 'IPO' },
    { id: 'ib', label: 'Investment Banking & M&A' },
    { id: 'pe', label: 'Private Equity' }
  ];
  // primary home of each tool (a tool may declare several sections; it is listed only here)
  var PLACE = { 'strategy-engine': 'strategy', company: 'statements', auditor: 'statements', valsummary: 'valuation', dcf: 'valuation', comps: 'valuation', precedents: 'valuation', wacc: 'valuation', 'rm-valuation': 'valuation',
    financing: 'financing', fundraise: 'financing', 'rm-capital': 'financing', 'rm-finmgmt': 'financing', 'debt-capacity': 'bonds', 'bond-issue': 'bonds', bond: 'bonds', 'bond-suite': 'bonds',
    ipo: 'ipo', 'ipo-suite': 'ipo', 'rm-governance': 'ipo', 'ma-suite': 'ib', accretion: 'ib', 'acq-pricing': 'ib', 'target-screen': 'ib', 'buyer-universe': 'ib', 'bid-compare': 'ib',
    lbo: 'pe', 'pe-suite': 'pe', 'trading-engine': 'trading', astro: 'trading', 'trade-center': 'desk', 'long-view': 'iran', 'efi': 'iran' };
  var OLD = { audit: 'statements', finmgmt: 'financing', finance: 'financing', buyside: 'ib', sellside: 'ib', signals: 'trading' };
  // tools shown inside another page (the strategy engine or a suite): reachable, but not listed twice
  var STRAT_IN = { 'strategy-studio': 'studio', 'rm-strategy': 'rm', 'five-forces': 'ff', kernel: 'kn', 'blue-ocean': 'bo', 'playing-to-win': 'pw' };
  var TRADE_IN = ['market-data', 'sig-stocks', 'sig-gold', 'sig-fx', 'sig-options', 'position', 'rm-trading'];
  // exact duplicates folded into another page (same checklist content)
  var ALIAS = { 'dash': { id: 'trading-engine', tab: 'dash', key: 'hub.tradingEngine.v1' }, 'buyside-process': { id: 'ma-suite', tab: 's-ib-process', key: 'hub.ma-suite.v1' }, 'sellside-process': { id: 'ma-suite', tab: 's-ib-process', key: 'hub.ma-suite.v1' } };
  function parentOf(id) {
    if (ALIAS[id]) return ALIAS[id];
    if (STRAT_IN[id]) return { id: 'strategy-engine', tab: 't-' + STRAT_IN[id], key: 'hub.strategyEngine.v1' };
    if (TRADE_IN.indexOf(id) >= 0) return { id: 'trading-engine', tab: 't-' + id, key: 'hub.tradingEngine.v1' };
    if (id === 'sig-temporal') return { id: 'long-view', tab: 't-sig-temporal', key: 'hub.longview.v1' };
    var S = (Hub.toolkit && Hub.toolkit.SUITES) || {}, f = null;
    Object.keys(S).forEach(function (k) { if (S[k].members.indexOf(id) >= 0) f = { id: k, tab: 's-' + id, key: S[k].storeKey }; });
    return f;
  }
  function home(t) { if (PLACE[t.id]) return PLACE[t.id]; var s0 = (t.sections || [])[0]; return OLD[s0] || s0; }
  function listed(t) { return !parentOf(t.id); }
  var ORDER = Object.keys(PLACE);
  function rank(t) { var i = ORDER.indexOf(t.id); return i < 0 ? 1000 + (t.priority || 0) : i; }
  function inSection(sid) { return tools.filter(function (t) { return listed(t) && home(t) === sid; }).sort(function (a, b) { return rank(a) - rank(b); }); }


  var tools = [];
  var current = null;

  function register(t) { tools = tools.filter(function (x) { return x.id !== t.id; }); tools.push(t); }
  function byId(id) { return tools.find(function (t) { return t.id === id; }); }

  /* ---------- planned tools (scope written now, built in order) ------ */
  var P = function (id, title, sections, priority, scope) { register({ id: id, title: title, sections: sections, status: 'planned', priority: priority, scope: scope }); };
  // add planned tools here: P(id, title, sections, priority, [scope lines])

  /* ---------- navigation ------------------------------------------- */
  function renderNav() {
    var nav = U.clear(document.getElementById('nav'));
    if (root.HUB_ONLY) { var only = byId(root.HUB_ONLY); if (only) nav.appendChild(link(only.id, only.title, only.status, true)); nav.appendChild(link('data-sources', 'Data sources & keys', null)); markActive(); return; }
    var open = {}; try { open = JSON.parse(localStorage.getItem('hub.nav.open') || '{}') || {}; } catch (e) { open = {}; }
    var q = h('input', { class: 'f-text nav-search', type: 'search', placeholder: 'Find a tool', 'aria-label': 'Find a tool' }), M = MAN();
    if (M) nav.appendChild(h('a', { href: 'index.html', class: 'nav-link top hub-link' }, [h('span', { text: 'درگاه مرکزی (Hub)' })]));
    nav.appendChild(link('home', MOD ? 'Overview' : 'All modules', null, true));
    // module page: the shared tools it hosts (data update centre) come first, as top links
    if (MOD && MAN()) sharedHere().concat(modOf('data-center') === MOD ? ['data-center'] : []).forEach(function (id) { var t = byId(id); if (t) nav.appendChild(link(id, id === 'data-center' ? 'مرکز به‌روزرسانی داده‌ها' : t.title, null, true)); });
    // module page: only this module (its own tools); the hub and the single-file build keep the system-wide links
    if (!MOD) [['trade-center', 'مرکز داشبورد معاملاتی'], ['data-center', 'مرکز به‌روزرسانی داده‌ها']].forEach(function (x) { if (byId(x[0])) nav.appendChild(link(x[0], x[1], null, true)); else if (M && M.tools[x[0]]) nav.appendChild(xlink(x[0], x[1], true)); });
    nav.appendChild(q);
    var groups = [];
    var addGrp = function (sid, label, items) {
      var body = h('div', { class: 'nav-body' }, items);
      var head = h('button', { class: 'nav-sec', type: 'button', 'aria-expanded': 'false', dataset: { sec: sid } }, [h('span', { text: label }), h('span', { class: 'nav-count', text: String(items.length) })]);
      var grp = h('div', { class: 'nav-grp', dataset: { sec: sid } }, [head, body]);
      function set(v) { grp.classList.toggle('open', v); head.setAttribute('aria-expanded', String(v)); }
      head.addEventListener('click', function () { var v = !grp.classList.contains('open'); set(v); open[sid] = v; try { localStorage.setItem('hub.nav.open', JSON.stringify(open)); } catch (e) { /* ignore */ } });
      set(sid === MOD || !!open[sid]); groups.push({ grp: grp, set: set, sid: sid });
      nav.appendChild(grp); };
    // a module page lists its own module only: exactly the tools the manifest assigns to it (the same list as its home page)
    var own = MOD && M ? (M.modules.filter(function (x) { return x.id === MOD; })[0] || { tools: [] }).tools.map(byId).filter(Boolean) : null;
    if (own) { var ord = inSection(MOD).map(function (t) { return t.id; }), ix = function (t) { var i = ord.indexOf(t.id); return i < 0 ? 999 : i; }; own.sort(function (a, b) { return ix(a) - ix(b); }); }
    if (own) own = own.filter(function (t) { return t.id !== 'data-center'; });   // shown above as a top link
    if (own) addGrp(MOD, secLabel(MOD), own.map(function (t) { return link(t.id, t.title, t.status); }));
    if (!own) SECTIONS.forEach(function (s) {
      if (M && s.id !== MOD) {   // the hub: each module's tools are links to that module's page
        var mm = M.modules.filter(function (x) { return x.id === s.id; })[0]; if (!mm || !mm.tools.length) return;
        addGrp(s.id, s.label, mm.tools.map(function (id) { return xlink(id, M.tools[id].t); })); return; }
      var list = inSection(s.id).filter(function (t) { return !MOD || !M || modOf(t.id) === MOD; }); if (!list.length) return;
      addGrp(s.id, s.label, list.map(function (t) { return link(t.id, t.title, t.status); }));
    });
    q.addEventListener('input', function () {
      var v = q.value.trim().toLowerCase();
      groups.forEach(function (g) { var any = false; g.grp.querySelectorAll('.nav-link').forEach(function (a) { var hit = !v || a.textContent.toLowerCase().indexOf(v) >= 0; a.style.display = hit ? '' : 'none'; any = any || hit; }); g.grp.style.display = any ? '' : 'none'; if (v) g.set(any); });
    });
    if (!MOD) nav.appendChild(h('div', { class: 'nav-grp open' }, [h('div', { class: 'nav-sec static' }, [h('span', { text: 'System' })]), h('div', { class: 'nav-body' }, [link('data-sources', 'Data sources & keys', null)])]));
    markActive();
  }
  // a tool on another page of the system
  function xlink(id, title, top) { var u = urlOf(id); return h('a', { href: u || ('#' + id), class: 'nav-link xmod' + (top ? ' top' : ''), dataset: { id: id } }, [h('span', { text: title })]); }
  function link(id, title, status, top) {
    return h('a', { href: '#' + id, class: 'nav-link' + (top ? ' top' : '') + (status === 'planned' ? ' planned' : ''), dataset: { id: id } },
      [h('span', { text: title }), status === 'planned' ? h('span', { class: 'chip', text: 'planned' }) : null]);
  }
  function markActive() {
    var id = (location.hash || '#home').slice(1), t = byId(id), sid = t ? home(t) : null;
    document.querySelectorAll('.nav-link').forEach(function (a) { a.classList.toggle('active', a.dataset.id === id); a.setAttribute('aria-current', a.dataset.id === id ? 'page' : 'false'); });
    // keep the section of the open tool expanded
    if (sid) document.querySelectorAll('.nav-grp[data-sec="' + sid + '"]').forEach(function (g) { g.classList.add('open'); var b = g.querySelector('.nav-sec'); if (b) b.setAttribute('aria-expanded', 'true'); });
  }

  /* ---------- router ----------------------------------------------- */
  function route() {
    var id = (location.hash || '#home').slice(1) || 'home';
    // single-tool build: every address opens that tool (Data sources & keys stays reachable)
    if (root.HUB_ONLY && id !== root.HUB_ONLY && id !== 'data-sources') { if (location.hash !== '#' + root.HUB_ONLY) { location.replace('#' + root.HUB_ONLY); return; } id = root.HUB_ONLY; }
    // a tool hosted by another module page (or any tool, on the hub): open that page
    if (id !== 'home' && id !== 'data-sources' && MAN()) { var m = modOf(id); if (m && m !== MOD && !here(id)) { var u = urlOf(id); if (u) { go(u); return; } } }
    var par = !root.HUB_ONLY && parentOf(id);
    if (par && byId(par.id)) { try { localStorage.setItem(par.key + '.tab', JSON.stringify(par.tab)); } catch (e) { /* ignore */ } location.replace('#' + par.id); return; }
    var main = document.getElementById('view');
    if (current && current.unmount) { try { current.unmount(); } catch (e) { /* ignore */ } }
    current = null;
    U.clear(main);
    document.body.classList.remove('nav-open');
    if (id === 'home') renderHome(main);
    else if (id === 'data-sources') renderData(main);
    else {
      var t = byId(id);
      if (!t) renderHome(main);
      else if (t.status === 'ready') { current = t; t.mount(main); }
      else renderPlanned(main, t);
    }
    markActive();
    main.focus({ preventScroll: true });
    root.scrollTo(0, 0);
  }

  /* ---------- home ------------------------------------------------- */
  function renderHome(el) {
    var M = MAN();
    if (M && !MOD) return renderHub(el, M);
    if (M && MOD) return renderModuleHome(el, M);
    var ready = tools.filter(function (t) { return t.status === 'ready'; });
    var planned = tools.filter(function (t) { return t.status === 'planned'; }).sort(function (a, b) { return a.priority - b.priority; });
    el.appendChild(h('header', { class: 'page-head' }, [
      h('p', { class: 'eyebrow', text: 'Personal modelling workbench' }),
      h('h1', { text: 'Finance Models & Solutions Hub' }),
      h('p', { class: 'lede', text: 'Inputs in blue, formulas in white, fetched data tagged green. Every model separates inputs, calculations and outputs, runs Base / Upside / Downside, and exports to Excel with live formulas.' })
    ]));

    var grid = h('section', { class: 'sec-grid', 'aria-label': 'Sections' });
    SECTIONS.forEach(function (sec) {
      if (MOD && sec.id !== MOD) return;
      var list = inSection(sec.id); if (!list.length) return;
      grid.appendChild(h('div', { class: 'sec-card', id: 'sec-' + sec.id }, [h('h2', { text: sec.label }),
        h('ul', { class: 'sec-tools' }, list.map(function (t) { return h('li', null, [h('a', { href: '#' + t.id, text: t.title }), t.summary ? h('span', { class: 'muted', text: t.summary }) : null]); }))]));
    });
    el.appendChild(grid);
    marketCheck(el);
  }
  /* home of a module page: only this module's tools (the other modules are reached from the hub) */
  function renderModuleHome(el, M) {
    var mm = M.modules.filter(function (x) { return x.id === MOD; })[0], ids = mm ? (mm.shared || []).concat(mm.tools.indexOf('data-center') >= 0 ? ['data-center'] : [], mm.tools.filter(function (i) { return i !== 'data-center'; })) : [];
    el.appendChild(h('header', { class: 'page-head' }, [h('p', { class: 'eyebrow' }, [h('a', { href: 'index.html', text: 'درگاه مرکزی (Hub)' })]), h('h1', { text: secLabel(MOD) })]));
    var ord = inSection(MOD).map(function (t) { return t.id; }), ix = function (t) { var i = ord.indexOf(t.id); return i < 0 ? 999 : i; };
    var top = ids.filter(function (i) { return i === 'data-center' || (mm.shared || []).indexOf(i) >= 0; }).map(byId).filter(Boolean);
    var list = top.concat(ids.filter(function (i) { return top.every(function (t) { return t.id !== i; }); }).map(byId).filter(Boolean).sort(function (a, b) { return ix(a) - ix(b); }));
    el.appendChild(h('section', { class: 'sec-grid', 'aria-label': secLabel(MOD) }, [h('div', { class: 'sec-card', id: 'sec-' + MOD }, [h('h2', { text: secLabel(MOD) }),
      h('ul', { class: 'sec-tools' }, list.map(function (t) { return h('li', null, [h('a', { href: '#' + t.id, text: t.title }), t.summary ? h('span', { class: 'muted', text: t.summary }) : null]); }))])]));
  }
  /* the hub: a gateway to the module pages; it hosts no tool */
  function renderHub(el, M) {
    el.appendChild(h('header', { class: 'page-head' }, [h('p', { class: 'eyebrow', text: 'Personal modelling workbench' }), h('h1', { text: 'Finance Models & Solutions Hub' }),
      h('p', { class: 'lede', 'data-notr': '1', text: 'درگاه مرکزی: هر ماژول صفحهٔ مستقل خودش را دارد و فقط کدهای لازم خودش را بارگذاری می‌کند. همهٔ صفحه‌ها از یک انبارهٔ داده، یک تنظیمات و یک موتور مرکزی استفاده می‌کنند.' })]));
    var grid = h('section', { class: 'sec-grid', 'aria-label': 'Modules' });
    M.modules.forEach(function (x) { grid.appendChild(h('div', { class: 'sec-card', id: 'sec-' + x.id }, [h('h2', null, [h('a', { href: x.file, text: secLabel(x.id) })]), h('p', { class: 'muted small', 'data-notr': '1', text: x.file + ' · ' + x.tools.length + ' ابزار' }),
      h('ul', { class: 'sec-tools' }, x.tools.map(function (id) { var t = M.tools[id]; return h('li', null, [h('a', { href: x.file + '#' + id, text: t.t }), t.s ? h('span', { class: 'muted', text: t.s }) : null]); }))])); });
    el.appendChild(grid);
    marketCheck(el);
  }
  function marketCheck(el) {
    if (!Hub.data) return;
    var mk = h('section', { class: 'panel' }, [h('h2', { text: 'Market check' }), h('p', { class: 'muted', text: 'Persian symbols (e.g. فولاد) query TSETMC; Latin tickers use FMP / Alpha Vantage.' })]);
    var sym = h('input', { id: 'home-sym', class: 'f-text', type: 'text', placeholder: 'فولاد or MSFT', autocomplete: 'off' });
    var out = h('div', { class: 'quote-out', 'aria-live': 'polite' });
    var go = h('button', { class: 'btn', type: 'button', text: 'Quote', onclick: function () {
      var s = sym.value.trim(); if (!s) return;
      out.textContent = 'Fetching ' + s + '…';
      if (/[\u0600-\u06FF]/.test(s) || /^\d{8,}$/.test(s)) {
        Hub.data.tse.quote(s).then(function (q) {
          U.clear(out).appendChild(kv([['Symbol', q.symbol + ' · ' + q.name], ['Closing price', U.fmtNum(q.price) + ' IRR'], ['Last trade', U.fmtNum(q.last) + ' IRR'], ['Market cap', U.fmtNum(q.marketCap / 1e9) + ' bn IRR'],
            ['Estimated EPS / P/E', q.eps ? U.fmtNum(q.eps) + ' / ' + U.fmtX(q.pe) : '–'], ['Sector P/E', q.sectorPE ? U.fmtX(q.sectorPE) : '–'], ['Free float', q.freeFloat != null ? U.fmtPct(q.freeFloat) : '–'], ['Sector', q.sector], ['Source', 'TSETMC']]));
        }).catch(function (e) { out.textContent = e.message; });
        return;
      }
      s = s.toUpperCase();
      Hub.data.quote(s).then(function (q) {
        U.clear(out).appendChild(kv([['Name', q.name], ['Price', U.fmtNum(q.price, 2) + ' ' + (q.currency || '')], ['Market cap', U.fmtNum(q.marketCap / 1e6, 0) + ' mn'], ['Beta', U.fmtNum(q.beta, 2)], ['Source', q._provider]]));
      }).catch(function (e) { out.textContent = e.message; });
    } });
    var rf = h('button', { class: 'btn ghost', type: 'button', text: 'US 10Y', onclick: function () {
      out.textContent = 'Fetching US 10Y…';
      Hub.data.riskFree().then(function (r) { U.clear(out).appendChild(kv([['US Treasury 10Y', U.fmtPct(r.rate, 2)], ['As of', r.date], ['Source', r._provider]])); })
        .catch(function (e) { out.textContent = e.message; });
    } });
    sym.addEventListener('keydown', function (e) { if (e.key === 'Enter') go.click(); });
    mk.appendChild(h('div', { class: 'row-ctl' }, [sym, go, rf]));
    mk.appendChild(out);
    el.appendChild(mk);

  }
  function kv(pairs) { return h('dl', { class: 'kv' }, pairs.reduce(function (a, p) { a.push(h('dt', { text: p[0] })); a.push(h('dd', { text: p[1] == null ? '–' : String(p[1]) })); return a; }, [])); }
  function secLabel(id) { var s = SECTIONS.find(function (x) { return x.id === id; }); return s ? s.label : id; }

  function renderPlanned(el, t) {
    el.appendChild(h('header', { class: 'page-head' }, [
      h('p', { class: 'eyebrow', text: t.sections.map(secLabel).join(' · ') }),
      h('h1', { text: t.title }),
      h('p', { class: 'lede', text: 'Planned. Position ' + t.priority + ' in the build queue. Scope below is the spec it will be built to; it follows the same Inputs → Calculations → Outputs → Excel structure as the DCF.' })
    ]));
    el.appendChild(h('section', { class: 'panel' }, [h('h2', { text: 'Scope' }), h('ul', { class: 'scope' }, t.scope.map(function (s) { return h('li', { text: s }); }))]));
  }

  /* ---------- data sources page ------------------------------------ */
  function renderData(el) {
    var k = Hub.data.keys();
    el.appendChild(h('header', { class: 'page-head' }, [
      h('p', { class: 'eyebrow', text: 'System' }), h('h1', { text: 'Data sources & keys' }),
      h('p', { class: 'lede', text: 'Keys are stored only in this browser (localStorage) and never leave it except in requests to the provider itself.' })
    ]));
    var fmpIn = h('input', { id: 'key-fmp', class: 'f-text', type: 'password', value: k.fmp || '', autocomplete: 'off', placeholder: 'FMP API key' });
    var avIn = h('input', { id: 'key-av', class: 'f-text', type: 'password', value: k.av || '', autocomplete: 'off', placeholder: 'Alpha Vantage API key' });
    var pxNote = h('p', { class: 'f-help' }, [document.createTextNode('TSETMC and TGJU: the hub tries your proxy prefix (if set), then a direct call, then the local proxy on this computer (127.0.0.1:8787). Download and test the local proxy in '), h('a', { href: '#market-data', text: 'Trading → Market data centre' }), document.createTextNode('.')]);
    var tseIn = h('input', { id: 'key-tse', class: 'f-text', type: 'text', value: k.tseProxy || '', autocomplete: 'off', placeholder: 'Optional, e.g. https://my-proxy.workers.dev/?url=' });
    var prim = h('select', { id: 'key-primary', class: 'f-sel' }, [h('option', { value: 'fmp', text: 'FMP first, Alpha Vantage fallback' }), h('option', { value: 'av', text: 'Alpha Vantage first, FMP fallback' })]);
    prim.value = k.primary || 'fmp';
    var status = h('p', { class: 'muted', 'aria-live': 'polite' });
    function save() { Hub.data.setKeys({ fmp: fmpIn.value.trim(), av: avIn.value.trim(), primary: prim.value, tseProxy: tseIn.value.trim() }); U.toast('Keys saved in this browser', 'good'); }
    function test(which) {
      save(); status.textContent = 'Testing ' + which.toUpperCase() + '…';
      Hub.data.test(which).then(function (r) { status.textContent = which === 'tse' ? 'TSETMC OK. ' + r.symbol + ' (' + r.name + '): closing price ' + U.fmtNum(r.price) + ' IRR, shares ' + U.fmtNum(r.shares / 1e6) + ' mn' : which.toUpperCase() + ' OK. ' + r.label + ': ' + U.fmtPct(r.rate, 2) + ' (' + r.date + ')'; })
        .catch(function (e) { status.textContent = e.message; });
    }
    el.appendChild(h('section', { class: 'panel' }, [
      h('h2', { text: 'Providers' }),
      h('div', { class: 'prov' }, [
        h('div', null, [h('label', { for: 'key-fmp', class: 'f-lbl', text: 'Financial Modeling Prep (primary)' }), fmpIn,
          h('p', { class: 'f-help' }, ['Statements, profile, price, beta, US Treasury curve. Free key at ', h('a', { href: 'https://site.financialmodelingprep.com/developer/docs', target: '_blank', rel: 'noopener', text: 'financialmodelingprep.com' }), '. Free tier: limited daily calls and symbol coverage.']),
          h('button', { class: 'btn ghost', type: 'button', text: 'Test FMP', onclick: function () { test('fmp'); } })]),
        h('div', null, [h('label', { for: 'key-av', class: 'f-lbl', text: 'Alpha Vantage (fallback)' }), avIn,
          h('p', { class: 'f-help' }, ['Statements, quote, beta, Treasury yields. Free key at ', h('a', { href: 'https://www.alphavantage.co/support/#api-key', target: '_blank', rel: 'noopener', text: 'alphavantage.co' }), '. Free tier allows only a small number of calls per day.']),
          h('button', { class: 'btn ghost', type: 'button', text: 'Test Alpha Vantage', onclick: function () { test('av'); } })]),
        h('div', null, [h('label', { for: 'key-tse', class: 'f-lbl', text: 'TSETMC (Tehran Stock Exchange) — no key needed' }), tseIn,
          h('p', { class: 'f-help', text: 'Closing price, last trade, shares outstanding, estimated EPS, sector P/E, free float, daily price limits, and daily price history (unadjusted) from cdn.tsetmc.com. Leave the proxy empty to call TSETMC directly. If the test fails with a "refused" message, the browser blocked the cross-site call or TSETMC refused a non-Iranian connection: add a proxy prefix (README has a 10-line Cloudflare Worker). Use {url} in the prefix if your proxy expects the target in a specific place.' }),
          h('button', { class: 'btn ghost', type: 'button', text: 'Test TSETMC (فولاد)', onclick: function () { test('tse'); } }), pxNote])
      ]),
      h('div', { class: 'row-ctl' }, [prim, h('button', { class: 'btn', type: 'button', text: 'Save keys', onclick: save })]),
      status
    ]));
    // ---- Claude connection (standalone use) ----
    var A = Hub.ai ? Hub.ai.settings() : {};
    var aiProv = h('select', { id: 'ai-prov', class: 'f-sel' }, [h('option', { value: 'anthropic', text: 'Claude (Anthropic API)' }), h('option', { value: 'openai', text: 'OpenAI-compatible API (OpenRouter, a regional gateway, or a local model: Ollama / LM Studio)' })]); aiProv.value = A.provider || 'anthropic';
    var aiVis = h('select', { id: 'ai-vis', class: 'f-sel' }, [h('option', { value: 'yes', text: 'Yes: send PDF page images' }), h('option', { value: 'no', text: 'No: text only' })]); aiVis.value = A.vision === false ? 'no' : 'yes';
    var aiKey = h('input', { id: 'ai-key', class: 'f-text', type: 'password', value: A.apiKey || '', autocomplete: 'off', placeholder: 'sk-ant-…' });
    var aiBase = h('input', { id: 'ai-base', class: 'f-text', type: 'text', value: A.baseUrl || '', autocomplete: 'off', placeholder: 'https://api.anthropic.com' });
    var aiModel = h('input', { id: 'ai-model', class: 'f-text', type: 'text', value: A.model || '', autocomplete: 'off' });
    var aiModel2 = h('input', { id: 'ai-model2', class: 'f-text', type: 'text', value: A.complexModel || '', autocomplete: 'off' });
    var aiTok = h('input', { id: 'ai-tok', class: 'f-text', type: 'text', inputmode: 'numeric', value: String(A.maxTokens || 16000), autocomplete: 'off' });
    var aiMode = h('select', { id: 'ai-mode', class: 'f-sel' }, [h('option', { value: 'off', text: 'Off (default): every engine runs on its own; no AI service is called' }), h('option', { value: 'api', text: 'Always my API key' }), h('option', { value: 'bridge', text: 'Claude chat, copy and paste (no key)' }), h('option', { value: 'auto', text: 'Automatic: claude.ai artifact if available, else my API key' })]); aiMode.value = A.mode || 'auto';
    var aiSt = h('p', { class: 'muted', 'aria-live': 'polite' });
    function aiSave() { var op = aiProv.value === 'openai'; Hub.ai.save({ provider: aiProv.value, vision: aiVis.value !== 'no', apiKey: aiKey.value.trim(), baseUrl: aiBase.value.trim() || (op ? 'http://localhost:11434/v1' : 'https://api.anthropic.com'), model: aiModel.value.trim() || (op ? 'llama3.1' : 'claude-sonnet-5-5'), complexModel: aiModel2.value.trim() || aiModel.value.trim() || (op ? 'llama3.1' : 'claude-opus-5-5'), maxTokens: Number(aiTok.value) || 16000, mode: aiMode.value }); U.toast('Claude settings saved in this browser', 'good'); }
    function aiSay(t, bad) { aiSt.setAttribute('data-notr', '1'); aiSt.className = bad ? 'rep-gap' : 'muted'; aiSt.textContent = t; }
    function aiWhy(e) {
      var c = e && e.code, st = e && e.status, op = aiProv.value === 'openai', raw = ' [' + (e && e.message || e) + ']';
      if (c === 'no_key') return 'اتصالی وجود ندارد چون کلید API وارد نشده است. این صفحه خودش هوش مصنوعی ندارد و باید به یک سرویس وصل شود. سه راه: ۱) همین هاب را در برنامهٔ Claude (آرتیفکت) باز کنید؛ آن‌جا بدون کلید کار می‌کند. ۲) کلید یک سرویس را در خانهٔ «کلید API» بنویسید و «ذخیره» بزنید. ۳) با دکمه‌های بالا «مدل محلی» را انتخاب کنید (فقط روی همان کامپیوتری که مدل رویش اجراست).';
      if (c === 'mixed') return 'این صفحه با https باز شده و مرورگر اجازهٔ تماس با نشانی http (' + aiBase.value + ') را نمی‌دهد. مدل محلی فقط از فایل Finance-Models-Hub.html روی همان کامپیوتر، یا از نشانی https در دسترس است؛ از گوشی به مدلِ روی کامپیوتر با http نمی‌شود وصل شد.';
      if (c === 'network') return 'درخواست به ' + (aiBase.value || 'سرویس') + ' نرسید. علت‌های ممکن: اینترنت قطع است، این نشانی از شبکهٔ شما در دسترس نیست، یا سرور اجازهٔ تماس از مرورگر (CORS) نمی‌دهد' + (op ? '؛ برای Ollama باید با OLLAMA_ORIGINS=* اجرا شود' : '') + '. برنامه نمی‌تواند تشخیص دهد کدام‌یک است.' + raw;
      if (st === 401) return 'سرویس پاسخ داد ولی کلید را نپذیرفت (۴۰۱). کلید را دوباره و کامل کپی کنید.' + raw;
      if (st === 403) return 'سرویس پاسخ داد ولی اجازهٔ دسترسی نداد (۴۰۳): کلید مجوز این مدل را ندارد یا سرویس درخواست از این شبکه را نمی‌پذیرد.' + raw;
      if (st === 404) return 'سرویس پاسخ داد ولی مدل یا نشانی پیدا نشد (۴۰۴). نام مدل و «نشانی پایه» را بررسی کنید.' + raw;
      if (st === 429) return 'سرویس پاسخ داد ولی سقف مصرف یا اعتبار حساب پر شده است (۴۲۹).' + raw;
      if (st === 400 || st === 402) return 'سرویس درخواست را رد کرد (' + st + '): معمولاً نام مدل نادرست یا اعتبار حساب ناکافی است.' + raw;
      return 'اتصال ناموفق.' + raw;
    }
    function aiTest() {
      aiSave(); aiSay('در حال آزمون…');
      var pc = Hub.ai.precheck(); if (pc === 'mixed') return aiSay(aiWhy({ code: 'mixed' }), true);
      Hub.ai.test().then(function (j) { return Hub.ai.status().then(function (v) { aiSay(v === 'bridge' ? 'کلیدی لازم نیست: حالت «پل گفت‌وگوی Claude» فعال است. هر دکمهٔ هوش مصنوعی درخواست را آماده می‌کند؛ آن را در برنامهٔ Claude بچسبانید و پاسخ را برگردانید.' : 'وصل شد (' + (v === 'artifact' ? 'از راه آرتیفکت claude.ai' : v === 'api' ? 'با کلید Anthropic' : 'با ' + aiBase.value) + '). پاسخ مدل: ' + JSON.stringify(j)); }); })
        .catch(function (e) {
          aiSay(aiWhy(e), true);
          if (aiProv.value === 'openai' && e && (e.status === 404 || e.status === 400)) Hub.ai.models().then(function (m) { if (m.length) aiSay(aiWhy(e) + ' مدل‌هایی که این سرویس اعلام کرد: ' + m.slice(0, 12).join('، ') + (m.length > 12 ? ' و ' + (m.length - 12) + ' مورد دیگر' : ''), true); });
        });
    }
    function aiPreset(prov, base, key) { aiProv.value = prov; aiBase.value = base; aiModel.value = ''; aiModel2.value = ''; if (prov === 'anthropic') { aiModel.value = 'claude-sonnet-5-5'; aiModel2.value = 'claude-opus-5-5'; } aiSay(prov === 'anthropic' ? 'نشانی Anthropic گذاشته شد. کلید را بنویسید و «آزمون اتصال» بزنید.' : 'نشانی گذاشته شد. ' + (key ? 'کلید همان سرویس و ' : '') + 'نام مدل را دقیقاً همان‌طور که سرویس نوشته وارد کنید، سپس «آزمون اتصال» بزنید. اگر نام مدل نادرست باشد، آزمون فهرست مدل‌های سرویس را نشان می‌دهد.'); }
    var aiPre = h('div', { class: 'row-ctl', 'data-notr': '1' }, [h('span', { class: 'muted', text: 'تنظیم سریع:' }),
      h('button', { class: 'btn ghost', type: 'button', text: 'Claude (Anthropic)', onclick: function () { aiPreset('anthropic', 'https://api.anthropic.com', 1); } }),
      h('button', { class: 'btn ghost', type: 'button', text: 'OpenRouter', onclick: function () { aiPreset('openai', 'https://openrouter.ai/api/v1', 1); } }),
      h('button', { class: 'btn ghost', type: 'button', text: 'مدل محلی: Ollama', onclick: function () { aiPreset('openai', 'http://localhost:11434/v1', 0); } }),
      h('button', { class: 'btn ghost', type: 'button', text: 'مدل محلی: LM Studio', onclick: function () { aiPreset('openai', 'http://localhost:1234/v1', 0); } })]);
    if (Hub.ai) Hub.ai.status().then(function (v) { aiSt.textContent = v === 'artifact' ? 'Now using: claude.ai artifact.' : v === 'api' ? 'Now using: your Anthropic API key.' : v === 'openai' ? 'Now using: your OpenAI-compatible API.' : v === 'bridge' ? 'Now using: Claude chat bridge (copy the request into Claude, paste the answer back; no key).' : 'No AI connected: Strategy Studio, Strict Auditor and Financing Solutions use the local rule-based engine; PDFs are read on this device.'; });
    el.appendChild(h('section', { class: 'panel' }, [
      h('h2', { text: 'AI connection (optional)' }),
      h('p', { class: 'f-help', text: 'Everything works without AI: PDFs are read on this device (text layer + built-in OCR), and Strategy Studio, Strict Auditor and Financing Solutions run a local rule-based engine. An AI service only deepens those three analyses. Options: inside the claude.ai artifact nothing is needed; elsewhere use an Anthropic API key, or any OpenAI-compatible API — OpenRouter, a regional gateway reachable from your network, or a model on your own computer (Ollama: base URL http://localhost:11434/v1, start it with OLLAMA_ORIGINS=* so the page may call it). The key stays in this browser and is sent only to the base URL.' }),
      aiPre,
      h('div', { class: 'prov' }, [
        h('div', null, [h('label', { for: 'ai-prov', class: 'f-lbl', text: 'Provider' }), aiProv]), h('div', null, [h('label', { for: 'ai-key', class: 'f-lbl', text: 'API key (empty for a local model)' }), aiKey]),
        h('div', null, [h('label', { for: 'ai-base', class: 'f-lbl', text: 'Base URL' }), aiBase]),
        h('div', null, [h('label', { for: 'ai-model', class: 'f-lbl', text: 'Model for standard tasks' }), aiModel]),
        h('div', null, [h('label', { for: 'ai-model2', class: 'f-lbl', text: 'Model for complex tasks (auditor, PDF, solutions)' }), aiModel2]), h('div', null, [h('label', { for: 'ai-vis', class: 'f-lbl', text: 'Model reads images?' }), aiVis]),
        h('div', null, [h('label', { for: 'ai-tok', class: 'f-lbl', text: 'Max output tokens' }), aiTok]),
        h('div', null, [h('label', { for: 'ai-mode', class: 'f-lbl', text: 'Which connection' }), aiMode])]),
      h('div', { class: 'row-ctl' }, [h('button', { class: 'btn', type: 'button', text: 'Save', onclick: aiSave }), h('button', { class: 'btn ghost', type: 'button', text: 'Test connection', onclick: aiTest }),
        h('button', { class: 'btn ghost', type: 'button', text: 'Remove key', onclick: function () { aiKey.value = ''; aiSave(); aiSt.textContent = 'Key removed.'; } })]),
      aiSt]));
    el.appendChild(h('section', { class: 'panel' }, [h('h2', { text: 'Coverage and limits' }), h('ul', { class: 'scope' }, [
      h('li', { text: 'Global listed companies: statements, price, beta, shares via FMP or Alpha Vantage.' }),
      h('li', { text: 'Iranian listed companies: market data (price, shares, EPS estimate, sector P/E, limits, history) from TSETMC. Financial statements are not published by TSETMC: copy a block from your Codal Excel export and paste it into any input cell; it fills across and down and reads Persian digits.' }),
      h('li', { text: 'Macro and market inputs (rial risk-free from a treasury bill اخزا on TSETMC, Damodaran implied ERP and Iran country risk, IMF and World Bank CPI inflation, US 10Y): in each model, Market inputs panel, choose live or your own number. Dated snapshots are used when a source cannot be reached.' }),
      h('li', { text: 'Running inside a claude.ai artifact: outbound requests are blocked by the sandbox. Live data works in the standalone HTML file opened in any browser (or the hub folder, index.html), with an internet connection.' }),
      h('li', { text: 'Sites that refuse browser requests (CORS: TSETMC, Damodaran pages and others) need a proxy prefix in the TSETMC field above. A ready Cloudflare Worker is in proxy/cloudflare-worker.js of the hub folder (free plan; deploy, then enter https://<your-worker>.workers.dev/?url=).' })
    ])]));
    var logBox = h('div', { class: 'log' });
    function paintLog() {
      U.clear(logBox);
      var L = Hub.data.log();
      if (!L.length) { logBox.appendChild(h('p', { class: 'muted', text: 'No requests yet this session.' })); return; }
      L.forEach(function (x) { logBox.appendChild(h('div', { class: 'log-row ' + (x.ok ? 'ok' : 'bad') }, [h('span', { text: x.time }), h('span', { text: x.source }), h('code', { text: x.url }), h('span', { text: x.ok ? 'OK' : x.msg })])); });
    }
    paintLog();
    document.addEventListener('hub:datalog', paintLog);
    current = { unmount: function () { document.removeEventListener('hub:datalog', paintLog); } };
    el.appendChild(h('section', { class: 'panel' }, [h('h2', { text: 'Request log' }), logBox]));
  }

  /* ---------- theme ------------------------------------------------- */
  function initTheme() {
    var t = U.store.get('hub.theme', null);
    if (t) document.documentElement.setAttribute('data-theme', t);
    var b = document.getElementById('theme-btn');
    if (b) b.addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme') ||
        (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
      var nx = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', nx);
      U.store.set('hub.theme', nx);
      document.dispatchEvent(new CustomEvent('hub:theme'));
    });
  }

  function rerenderAll() { renderNav(); route(); }

  function start(hold) {
    if (Hub.i18n) Hub.i18n.init();
    initTheme();
    if (root.HUB_ONLY) { document.body.classList.add('single-tool'); var br = document.querySelector('.brand'); if (br) br.setAttribute('href', '#' + root.HUB_ONLY); }
    renderNav();
    if (MOD && MAN()) try { var tl = secLabel(MOD); document.title = (Hub.i18n && Hub.i18n.t ? Hub.i18n.t(tl) : tl) + ' · مرکز مدل‌ها'; } catch (e) { /* ignore */ }
    var mb = document.getElementById('menu-btn');
    if (mb) mb.addEventListener('click', function () { document.body.classList.toggle('nav-open'); });
    // crash-loop guard (phones): if the last two starts never reached a stable page, open on the home page in safe mode
    var BK = 'hub.bootFail', bf = 0; try { bf = Number(localStorage.getItem(BK)) || 0; localStorage.setItem(BK, String(bf + 1)); } catch (e) { /* storage blocked */ }
    if (bf >= 2) { root.HUB_SAFE = true; if (location.hash && location.hash !== '#home') location.replace('#home');
      var bn = document.createElement('div'); bn.className = 'safe-banner'; bn.setAttribute('role', 'alert');
      bn.style.cssText = 'position:sticky;top:0;z-index:50;background:#5a3a00;color:#fff;padding:10px 14px;font-size:14px;line-height:1.7';
      bn.textContent = 'حالت امن: برنامه در دو بار باز شدن قبلی کامل بالا نیامد (احتمالاً کمبود حافظهٔ گوشی). صفحهٔ اصلی باز شد (نه آخرین ابزار). ابزارها را یکی‌یکی باز کنید؛ اگر یک ابزار دوباره برنامه را بست، نام آن را گزارش کنید. ';
      var bb = document.createElement('button'); bb.className = 'btn btn-sm'; bb.type = 'button'; bb.textContent = 'بستن پیام'; bb.addEventListener('click', function () { bn.remove(); }); bn.appendChild(bb);
      document.body.insertBefore(bn, document.body.firstChild); }
    // a page that stayed up for 8 seconds counts as a good start
    setTimeout(function () { try { localStorage.setItem(BK, '0'); } catch (e) { /* ignore */ } }, 8000);
    // module pages: leaving a page normally (link to another module, reload, close) is not a crash — a crash never fires pagehide
    root.addEventListener('pagehide', function () { try { localStorage.setItem(BK, '0'); } catch (e) { /* ignore */ } });
    root.addEventListener('hashchange', route);
    // links to another page of the system wait for pending writes to reach the shared store
    document.addEventListener('click', function (e) { var a = e.target && e.target.closest && e.target.closest('a[href]'); if (!a || e.defaultPrevented || e.button || e.ctrlKey || e.metaKey || e.shiftKey || a.target === '_blank') return;
      var href = a.getAttribute('href'); if (!href || href.charAt(0) === '#' || /^[a-z]+:/i.test(href) || !/\.html(#|$)/.test(href)) return; e.preventDefault(); go(href); });
    if (!hold) return route();
    // the menu is drawn; the page itself waits for the data pull (one engine run, on the new data) — at most 45 s
    var v = document.getElementById('view'); if (v && !v.firstChild) { var m = document.createElement('p'); m.className = 'small muted'; m.id = 'boot-wait'; m.style.padding = '1rem'; m.textContent = (Hub.i18n && Hub.i18n.lang && Hub.i18n.lang() === 'en') ? 'Checking for new data from the computer…' : 'بررسی دادهٔ تازه از کامپیوتر …'; v.appendChild(m); }
    var done = false, fin = function () { if (done) return; done = true; var m2 = document.getElementById('boot-wait'); if (m2) m2.remove(); Hub.__appStarted = true; route(); };
    hold.then(fin, fin); setTimeout(fin, 45000);
  }

  Hub.register = register; Hub.toolById = byId;
  /* link to the data update centre (trading page); shared by every section — moved here from trading-engine.js so a page
     that only links to the centre does not load the trading engine */
  Hub.goDataCenter = function () { location.hash = '#data-center'; };
  Hub.dataCenterLink = function (why) { return h('div', { class: 'row-ctl' }, [h('button', { class: 'btn', type: 'button', text: 'به‌روزرسانی از «مرکز مدیریت داده‌ها»', onclick: function () { Hub.goDataCenter(); } }), h('span', { class: 'small muted', text: why || 'همهٔ داده‌ها فقط از یک مرکز به‌روز می‌شوند و همهٔ بخش‌ها از همان دادهٔ مشترک می‌خوانند.' })]); };
  Hub.app = { home: home, parentOf: parentOf, tools: function () { return tools.slice(); }, SECTIONS: SECTIONS, PLACE: PLACE, module: function () { return MOD; }, urlOf: urlOf, go: go };
  Hub.SECTIONS = SECTIONS;
  // back button: previous page in this session, or the overview when there is none
  (function () { var b = root.document && document.getElementById('back-btn'); if (!b) return; var depth = 0;
    root.addEventListener('hashchange', function () { depth++; b.disabled = false; });
    b.addEventListener('click', function () { if (depth > 0 && root.history.length > 1) { depth = Math.max(0, depth - 2); root.history.back(); } else if (location.hash && location.hash !== '#home') location.hash = '#home'; }); })();
  Hub.start = function () { var st = Hub.util.store, go = function () {
      // on the published site (phone): the market-data pages (desk, trading, Iran economy: they run the engine) are drawn after the data of
      // the computer are pulled — one engine run, on the new data; the other pages draw at once and the pull runs beside them
      var D = Hub.dataSync; if (!D || !D.bootFirst) { Hub.__appStarted = true; return start(); }
      if (!/^(desk|trading|iran)$/.test(MOD || '')) { Hub.__appStarted = true; start(); D.bootFirst(); return; }
      start(D.bootFirst()); };
    if (st && st.ready) st.ready().then(go, go); else go(); };
  Hub.rerenderAll = rerenderAll;
  Hub.secLabel = secLabel;
})(window);
