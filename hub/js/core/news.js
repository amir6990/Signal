/* =====================================================================
 * NEWS READER — the hub's own feed reader. No AI and no outside service: it reads the RSS / Atom feeds
 * the user lists, over the same routes as the market data (straight from the page when the site allows it,
 * otherwise through the user's own proxy on their computer), and the phone can receive the result through
 * the PC → GitHub → phone sync.
 * What it does with the items is mechanical and stated as such: de-duplicate, sort, tag by keyword.
 * It does not read or interpret the article. Only headlines, links, times and the feed's own summary are kept.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {}, KEY = 'hub.news.v1';
  // verified = the address returned a valid feed from a PC in Iran on 2026-11-17 (server-side through the hub server; browsers need a proxy: the sites send no CORS header)
  var GN = function (q, fa) { return 'https://news.google.com/rss/search?q=' + encodeURIComponent(q) + (fa ? '&hl=fa&gl=IR&ceid=IR:fa' : '&hl=en-US&gl=US&ceid=US:en'); };
  // Persian queries: Bing News RSS (Google News returns almost nothing in Persian and rate-limits)
  var BN = function (q) { return 'https://www.bing.com/news/search?q=' + encodeURIComponent(q) + '&format=rss'; };
  var FEEDS = [
    { name: 'ایرنا · اقتصاد', url: 'https://www.irna.ir/rss/tp/20', active: true, verified: true },
    { name: 'مهر · اقتصاد', url: 'https://www.mehrnews.com/rss/tp/25', active: true, verified: true },
    { name: 'ایسنا · اقتصاد', url: 'https://www.isna.ir/rss/tp/34', active: true, verified: true },
    { name: 'سنا (پایگاه خبری بازار سرمایه)', url: 'https://www.sena.ir/rss', active: true, verified: true },
    { name: 'دنیای اقتصاد', url: 'https://www.donya-e-eqtesad.com/fa/rss/allnews', active: true, verified: true },
    { name: 'بورس نیوز', url: 'https://www.boursenews.ir/fa/rss/allnews', active: true, verified: true },
    { name: 'تجارت نیوز', url: 'https://www.tejaratnews.com/feed', active: true, verified: true },
    { name: 'خبرآنلاین · اقتصاد', url: 'https://www.khabaronline.ir/rss/tp/2', active: true, verified: true },
    { name: 'Bing News · بورس تهران', url: BN('بورس تهران شاخص کل'), active: true, verified: true },
    { name: 'Bing News · دلار، طلا و سکه', url: BN('قیمت دلار طلا سکه'), active: true, verified: true },
    { name: 'Bing News · بانک مرکزی و تورم', url: BN('بانک مرکزی تورم نقدینگی'), active: true, verified: true },
    { name: 'Google News · oil, Fed, gold', url: GN('oil price OR federal reserve OR gold price', false), active: true, verified: true },
    { name: 'Federal Reserve · press releases', url: 'https://www.federalreserve.gov/feeds/press_all.xml', active: true, verified: true },
    { name: 'ECB · press', url: 'https://www.ecb.europa.eu/rss/press.html', active: true, verified: true }];
  var CATS = { fx: ['ارز', /ارز|دلار|یورو|درهم|صراف|مرکز مبادله|\bdollar\b|exchange rate|currency/i], infl: ['تورم و نقدینگی', /تورم|نقدینگی|پایه پولی|شاخص قیمت|inflation|\bCPI\b|money supply/i],
    rates: ['نرخ بهره و سیاست پولی', /نرخ سود|نرخ بهره|بین ?بانکی|سیاست پولی|بانک مرکزی|interest rate|monetary policy|FOMC|federal funds|rate cut|rate hike|policy rate/i], fiscal: ['بودجه و مالیات', /بودجه|مالیات|کسری|اوراق خزانه|اخزا|خزانه ?داری|budget|fiscal|\btax/i],
    equity: ['بازار سهام', /بورس|شاخص کل|سهام|فرابورس|عرضه اولیه|stock market|equit/i], gold: ['طلا و سکه', /طلا|سکه|اونس|انس|\bgold\b/i], oil: ['نفت و انرژی', /نفت|اوپک|گاز|انرژی|\boil\b|OPEC|crude|energy/i],
    geo: ['تحریم و ژئوپلیتیک', /تحریم|مذاکر|برجام|جنگ|آتش ?بس|تنگه|sanction|tariff|\bwar\b|ceasefire|geopolit/i], trade: ['تجارت خارجی', /صادرات|واردات|گمرک|تعرفه|تراز تجاری|export|import|trade balance/i], bank: ['بانک و اعتبار', /بانک|تسهیلات|اعتبار|\bbank|credit|lending/i] };
  // generic transmission channels to check for each category — a checklist, not an analysis of any particular item
  var CHECK = { fx: 'درآمد ریالی صادرکنندگان، هزینهٔ واردات و مواد اولیه، انتظارات تورمی، قیمت طلا و سکه', infl: 'قدرت خرید، نرخ سود واقعی، ارزش‌گذاری دارایی‌های ریالی، تقاضای دارایی‌های پوشش تورم', rates: 'هزینهٔ تأمین مالی شرکت‌ها، نرخ تنزیل و ارزش‌گذاری سهام، جذابیت اوراق بدهی و سپرده',
    fiscal: 'انتشار اوراق دولت و نرخ بازار بدهی، بار مالیاتی صنایع، رشد پایهٔ پولی', equity: 'جریان ورود و خروج پول، مقررات معاملاتی، عرضه‌های جدید', gold: 'نرخ دلار داخلی، انس جهانی، حباب سکه', oil: 'درآمد ارزی، سود پتروشیمی و پالایشی، قیمت خوراک و انرژی صنایع',
    geo: 'نرخ ارز و دسترسی به درآمد ارزی، هزینهٔ حمل و بیمه، صادرات و واردات، ریسک‌پذیری بازار', trade: 'تراز ارزی، صنایع صادرات‌محور و واردات‌محور، تعرفه و قیمت تمام‌شده', bank: 'دسترسی شرکت‌ها به اعتبار، نرخ سود، سودآوری بانک‌ها' };
  var TOPIC = { equity: ['equity', 'rates', 'fx', 'fiscal', 'geo'], fx: ['fx', 'geo', 'trade', 'rates'], gold: ['gold', 'fx', 'rates', 'geo'], infl: ['infl', 'rates', 'fiscal', 'fx'], rates: ['rates', 'infl', 'bank', 'fiscal'], global: ['oil', 'gold', 'rates', 'geo'], custom: Object.keys(CATS) };
  function store() { return Hub.util.store.get(KEY, null) || { meta: { source: '', asOf: '', asOfTs: 0 }, items: [], status: {} }; }
  function strip(s) { return String(s || '').replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim(); }
  function tags(t) { return Object.keys(CATS).filter(function (k) { return CATS[k][1].test(t); }); }
  function parse(xml, feed) {
    var doc = new root.DOMParser().parseFromString(xml, 'text/xml'); if (doc.getElementsByTagName('parsererror').length) throw new Error('پاسخ این نشانی خوراک RSS معتبر نیست');
    var nodes = Array.prototype.slice.call(doc.getElementsByTagName('item')), atom = false; if (!nodes.length) { nodes = Array.prototype.slice.call(doc.getElementsByTagName('entry')); atom = true; }
    var txt = function (n, tag) { var e = n.getElementsByTagName(tag)[0]; return e ? e.textContent : ''; };
    return nodes.map(function (n) { var link = txt(n, 'link'); if (atom || !link) { var le = n.getElementsByTagName('link')[0]; if (le && le.getAttribute('href')) link = le.getAttribute('href'); }
      var title = strip(txt(n, 'title')), d = Date.parse(txt(n, 'pubDate') || txt(n, 'updated') || txt(n, 'published') || txt(n, 'dc:date') || ''), sum = strip(txt(n, 'description') || txt(n, 'summary')).slice(0, 280);
      return { t: title, l: strip(link), d: isFinite(d) ? d : 0, s: feed.name, x: sum, c: tags(title + ' ' + sum) }; }).filter(function (x) { return x.t && /^https?:\/\//.test(x.l); });
  }
  /* rss2json.com (public, CORS-enabled, no key): fetches the feed on its own server and returns JSON — the phone's route when the site sends no CORS header.
     Only the public feed address is sent. The JSON is turned back into minimal RSS so the same parser and rules apply. */
  function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function viaJson(url) {
    return Hub.data.web('https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(url), 'rss2json').then(function (j) {
      if (!j || j.status !== 'ok' || !Array.isArray(j.items)) throw new Error((j && j.message) || 'پاسخ نامعتبر');
      return '<?xml version="1.0"?><rss><channel>' + j.items.map(function (it) { var d = Date.parse(String(it.pubDate || '').replace(' ', 'T') + 'Z'); return '<item><title>' + esc(it.title) + '</title><link>' + esc(it.link) + '</link><pubDate>' + (isFinite(d) ? new Date(d).toUTCString() : '') + '</pubDate><description>' + esc(String(it.description || '').replace(/<[^>]+>/g, ' ').slice(0, 400)) + '</description></item>'; }).join('') + '</channel></rss>';
    });
  }
  function fetchAll(feeds, progress) {
    var S = store(), base = feeds ? feeds.concat(FEEDS.filter(function (d) { return !feeds.some(function (f) { return f.url === d.url || f.name === d.name; }); })) : FEEDS, list = base.filter(function (f) { return f.active !== false && /^https?:\/\//.test(f.url || ''); }), by = {}, st = {}, i = 0, okN = 0;
    (S.items || []).forEach(function (x) { by[x.l] = x; });
    var one = function () { if (i >= list.length) return Promise.resolve(); var f = list[i++]; progress && progress(i, list.length, f.name);
      var route = '';
      // phone (https, no server of ours): most feeds send no CORS header, so rss2json goes first; on the PC the hub server reads the feed itself
      var first = phone ? function () { return viaJson(f.url).then(function (x) { route = 'rss2json'; return x; }); } : function () { return Hub.data.text(f.url, f.name); };
      var second = phone ? function () { return Hub.data.text(f.url, f.name); } : function () { return viaJson(f.url).then(function (x) { route = 'rss2json'; return x; }); };
      return first().catch(function (e) { return second().catch(function (e2) { var x = new Error((e && (e.detail || e.message)) + ' | ' + (e2 && (e2.detail || e2.message))); x.detail = x.message; throw x; }); }).then(function (xml) { var it = parse(xml, f); it.forEach(function (x) { if (!by[x.l]) by[x.l] = x; }); st[f.name] = { ok: true, n: it.length, at: Date.now(), route: route || (Hub.data.route() || {}).name || '' }; okN++; },
        function (e) { st[f.name] = { ok: false, err: String(e && (e.detail || e.message) || e).slice(0, 220), at: Date.now() }; }).then(one); };
    if (Hub.data.resetRoutes) Hub.data.resetRoutes();
    var phone = false;
    return (Hub.data.serverProxy ? Hub.data.serverProxy() : Promise.resolve(null)).then(function (same) { phone = !!Hub.data.https && !same; }).then(function () { return Promise.all([one(), one(), one()]); }).then(function () {
      var cut = Date.now() - 45 * 864e5, items = Object.keys(by).map(function (k) { return by[k]; }).filter(function (x) { return !x.d || x.d > cut; }).sort(function (a, b) { return (b.d || 0) - (a.d || 0); }).slice(0, 800);
      if (okN) { S.items = items; S.meta = { source: 'RSS (' + okN + ' خوراک)', asOf: new Date().toISOString(), asOfTs: Date.now() }; } S.status = Object.assign({}, S.status || {}, st);
      Hub.util.store.set(KEY, S); if (okN && Hub.dataSync) Hub.dataSync.notify(); return { ok: okN, total: list.length, status: st, items: S.items.length }; });
  }
  function forTopic(topic, all) { var S = store(), cats = TOPIC[topic] || TOPIC.custom; return (S.items || []).filter(function (x) { return all || x.c.some(function (c) { return cats.indexOf(c) >= 0; }); }); }
  function intensity() { var S = store(), now = Date.now(), o = {}; Object.keys(CATS).forEach(function (k) { o[k] = { name: CATS[k][0], w1: 0, w2: 0 }; });
    (S.items || []).forEach(function (x) { if (!x.d) return; var age = (now - x.d) / 864e5; x.c.forEach(function (c) { if (age <= 7) o[c].w1++; else if (age <= 14) o[c].w2++; }); }); return o; }
  Hub.news = { KEY: KEY, FEEDS: FEEDS, CATS: CATS, CHECK: CHECK, TOPIC: TOPIC, store: store, parse: parse, fetchAll: fetchAll, forTopic: forTopic, intensity: intensity, tags: tags };
})(typeof window !== 'undefined' ? window : globalThis);
