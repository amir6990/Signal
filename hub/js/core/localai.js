/* =====================================================================
 * LOCAL ANALYSIS — the "ask Claude" features without any AI service.
 * Rule-based engines that return the SAME JSON shapes the AI would, so the
 * Strategy Studio, Strict Auditor and Financing Solutions screens render
 * and export them unchanged:
 *   strategy(S, key, lang)   one framework from the company profile text
 *   conclusion(S, lang)      conclusion across the framework results
 *   audit(S, R, lang, notes) strict review from the automated findings,
 *                            ratios and (when present) the PDF text
 *   financing(S, R, lang)    funding structure from the screening results
 * How it reads text: sentences are split from each profile field and matched
 * against Persian and English cue lists (e.g. «وارداتی», «تحریم», «سهم»,
 * percentages). Every output says it is a rule-based draft and lists what it
 * assumed; it does not invent figures. Quality is below an AI analysis:
 * it organises and stress-tests what you wrote rather than adding knowledge.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};

  /* ---------- text helpers ---------- */
  function T(lang) { return function (en, fa) { return lang === 'fa' ? fa : en; }; }
  function latin(s) { return String(s || '').replace(/[۰-۹]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'.indexOf(d); }).replace(/[٠-٩]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); }); }
  function norm(s) { return latin(String(s || '')).replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/‌/g, ' ').replace(/\s+/g, ' ').trim(); }
  function sentences(s) { return norm(s).split(/(?<=[.!?؟])\s+|[;؛\n]+/).map(function (x) { return x.replace(/^[-•*\d.)\s]+/, '').trim(); }).filter(function (x) { return x.length > 2; }); }
  function items(s) { var out = []; sentences(s).forEach(function (x) { var p = x.split(/[,،]\s*/); if (p.length > 1 && p.every(function (y) { return y.length < 60; })) out = out.concat(p); else out.push(x); }); return out.map(function (x) { return x.replace(/\.$/, '').trim(); }).filter(Boolean); }
  function cut(s, n) { s = String(s); n = n || 140; return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function uniq(a) { var seen = {}; return a.filter(function (x) { var k = String(x).toLowerCase(); if (seen[k]) return false; seen[k] = 1; return true; }); }
  function any(text, re) { return re.test(norm(text)); }
  function grab(list, re) { return list.filter(function (x) { return re.test(x); }); }
  function pcts(s) { var o = [], re = /(\d+(?:\.\d+)?)\s*(%|٪|درصد|percent)/gi, m; s = latin(s); while ((m = re.exec(s))) o.push(Number(m[1]) / 100); return o; }

  /* ---------- cue lists (Persian + English) ---------- */
  var CUE = {
    neg: /(کاهش|افت|زیان|کمبود|محدودیت|محدود|ممنوع|تحریم|ریسک|بدهی|کسری|عقب|ضعیف|پایین|کم\b|فشار|نوسان|تورم|گران|وابسته|وابستگی|تمرکز|مشکل|نارضایتی|تاخیر|تأخیر|declin|fell|drop|loss|shortage|limit|restrict|ban|sanction|risk|debt|deficit|weak|low\b|pressure|volatil|inflation|depend|concentrat|problem|delay|squeez)/i,
    pos: /(رشد|افزایش|توسعه|صادرات|فرصت|تقاضا|قوی|برتر|انحصار|مجوز|برند|فناوری|ثبت|گواهی|ایزو|آزمایشگاه|ظرفیت|grow|increase|expan|export|opportun|demand|strong|lead|exclusive|licen|brand|technolog|patent|certif|iso\b|\blab\b|capacity|new line|commission)/i,
    import: /(وارداتی|واردات|ارز|نرخ ارز|دلار|تحریم|import|fx\b|foreign currency|dollar|sanction)/i,
    licence: /(مجوز|پروانه|انحصار|سرمایه[ ‌]?بر|ثبت|استاندارد|licen|permit|exclusive|capital[- ]intensive|regulated|patent|certif)/i,
    fragmented: /(پراکنده|متعدد|کوچک|زیاد|ورود آسان|fragment|many small|numerous|easy entry|low barrier)/i,
    concentrated: /(\btop\s*\d+|بزرگ‌?ترین مشتری|مشتریان عمده|ده مشتری|تمرکز|concentrat|largest customer|key accounts?)/i,
    gov: /(دولت|دولتی|پتروشیمی|نفت|پروژه|government|state|petrochem|oil|contractor|project)/i,
    substitute: /(جایگزین|substitut|alternative|replace)/i,
    rivalry: /(رقیب|رقبا|رقابت|سهم بازار|جنگ قیمت|مازاد ظرفیت|compet|rival|market share|price war|overcapacity|player)/i,
    lowUtil: /(utili[sz]ation\s*\d+|بهره[ ‌]?برداری\s*\d+|ظرفیت خالی|idle|under[- ]?utili)/i,
    export: /(صادرات|صادراتی|عراق|افغانستان|کشورهای همسایه|export|iraq|afghan|neighbo)/i,
    pricing: /(قیمت[ ‌]?گذاری|سقف قیمت|کنترل قیمت|price (control|cap|rule)|pricing rule)/i,
    tech: /(فناوری|دیجیتال|اتوماسیون|نرم[ ‌]?افزار|هوش مصنوعی|technolog|digital|automat|software|\bai\b)/i,
    env: /(محیط[ ‌]?زیست|آلودگی|انرژی|آب|برق|گاز|کربن|environment|pollut|energy|water|electric|gas\b|carbon|climate)/i,
    social: /(جمعیت|مصرف[ ‌]?کننده|نیروی کار|مهاجرت|سلیقه|demograph|consumer|labou?r|talent|migration|taste)/i,
    political: /(تحریم|دولت|سیاست|انتخابات|جنگ|ژئوپلیتیک|sanction|government|politic|election|war|geopolit)/i,
    economic: /(تورم|ارز|نرخ بهره|رکود|نقدینگی|بودجه|inflation|fx\b|exchange rate|interest rate|recession|liquidity|budget|currency)/i,
    legal: /(قانون|مقررات|مجوز|قیمت[ ‌]?گذاری|مالیات|استاندارد|law|regulat|licen|pricing|tax|standard|compliance)/i,
    ipo: /(عرضه[ ‌]?اولیه|بورس|فرابورس|ipo|listing|list on)/i,
    double: /(دو برابر|سه برابر|double|triple|\d+x\b|برابر کردن)/i,
    fluff: /(بهترین|برتر|پیشرو|جهانی|world[- ]class|best|leading|number one|excellence|تعالی)/i,
    governance: /(خانوادگی|سهام[ ‌]?دار عمده|کنترل|رقیق|حاکمیت|family|owner|control|dilut|governance)/i,
    digitalSales: /(آنلاین|فروشگاه اینترنتی|online|e-?commerce|digital channel)/i,
    distributor: /(توزیع[ ‌]?کننده|نمایندگی|عامل فروش|distribut|dealer|agent)/i,
    service: /(پشتیبانی فنی|خدمات پس از فروش|technical support|after[- ]sales|service)/i
  };

  function profile(S) { var p = S.profile || {}, o = {}; Object.keys(p).forEach(function (k) { o[k] = norm(p[k]); }); o.all = Object.keys(o).map(function (k) { return o[k]; }).join(' . '); return o; }
  function filled(S) { return Hub.tools.studio.FIELDS.filter(function (f) { return String((S.profile || {})[f[0]] || '').trim(); }); }
  function gaps(S, t, need) {
    var miss = Hub.tools.studio.FIELDS.filter(function (f) { return need.indexOf(f[0]) >= 0 && !String((S.profile || {})[f[0]] || '').trim(); });
    return miss.map(function (f) { return t('Not given: ' + f[1], 'وارد نشده: ' + (Hub.i18n && Hub.i18n.t ? Hub.i18n.t(f[1]) : f[1])); });
  }
  function conf(S, need) { var n = need.filter(function (k) { return String((S.profile || {})[k] || '').trim(); }).length / need.length; return n >= 0.8 ? 'medium' : 'low'; }
  var BASE_ASSUMP = function (t) { return [t('Rule-based draft: built from cue words in your profile, not from outside knowledge or an AI model.', 'پیش‌نویس قاعده‌محور: از واژه‌های نشانه در متن پروفایل ساخته شده، نه از دانش بیرونی یا مدل هوش مصنوعی.')]; };

  /* ---------- building blocks shared by several frameworks ---------- */
  function swotLists(S, t) {
    var P = profile(S);
    var str = uniq(items(P.capabilities).concat(grab(items(P.products + ' . ' + P.businessModel), CUE.pos)).concat(grab(items(P.financials), /(رشد|grew|growth|increase|افزایش)/i)));
    var weak = uniq(grab(items(P.financials + ' . ' + P.customers + ' . ' + P.suppliers + ' . ' + P.constraints + ' . ' + P.recent), CUE.neg));
    var opp = uniq(grab(items(P.macro + ' . ' + P.recent + ' . ' + P.geography + ' . ' + P.objectives + ' . ' + P.industry), CUE.pos).concat(grab(items(P.geography), CUE.export)));
    var thr = uniq(grab(items(P.macro + ' . ' + P.competitors + ' . ' + P.suppliers), CUE.neg).concat(grab(items(P.competitors), CUE.rivalry)));
    var lowUtil = grab(items(P.recent + ' . ' + P.notes + ' . ' + P.capabilities), CUE.lowUtil);
    if (lowUtil.length) weak = uniq(weak.concat(lowUtil));
    opp = opp.filter(function (x) { return weak.indexOf(x) < 0; });
    return { S: str.slice(0, 7), W: weak.slice(0, 7), O: opp.slice(0, 7), T: thr.filter(function (x) { return weak.indexOf(x) < 0; }).slice(0, 7) };
  }
  function forces(S, t) {
    var P = profile(S), out = [];
    function f(name, nameFa, rating, drivers, ev) { out.push({ force: name, rating: Math.max(1, Math.min(5, rating)), drivers: drivers, evidence: ev.slice(0, 3) }); }
    // entrants
    var e = 3, ed = [], ev = grab(items(P.all), CUE.licence);
    if (ev.length) { e -= 1; ed.push(t('Licences, standards or capital intensity raise entry barriers', 'مجوز، استاندارد یا سرمایه‌بر بودن مانع ورود را بالا می‌برد')); }
    var ev2 = grab(items(P.competitors + ' . ' + P.industry), CUE.fragmented); if (ev2.length) { e += 1; ed.push(t('Fragmented market with small players', 'بازار پراکنده با بازیگران کوچک')); }
    if (any(P.competitors, CUE.import) && any(P.competitors + P.macro, /(محدود|limit|constrain|restrict)/i)) { e -= 1; ed.push(t('Imports constrained (FX or restrictions) shelter domestic producers', 'محدودیت واردات (ارز یا ممنوعیت) از تولیدکنندهٔ داخلی محافظت می‌کند')); }
    f('Threat of new entrants', 'تهدید ورود تازه‌واردها', e, ed.length ? ed : [t('No cue found: neutral rating', 'نشانه‌ای پیدا نشد: امتیاز خنثی')], ev.concat(ev2));
    // suppliers
    var s = 3, sd = [], sev = grab(items(P.suppliers + ' . ' + P.macro), CUE.import);
    var share = pcts(P.suppliers)[0];
    if (sev.length) { s += 1; sd.push(t('Key inputs imported / FX-dependent', 'نهاده‌های کلیدی وارداتی / وابسته به ارز')); }
    if (share >= 0.4) { s += 1; sd.push(t('A large share of inputs (' + Math.round(share * 100) + '%) from a constrained source', 'سهم بزرگی از نهاده‌ها (' + Math.round(share * 100) + '٪) از منبعی محدود')); }
    if (any(P.suppliers, /(متعدد|چند تأمین|many|several|multiple)/i)) { s -= 1; sd.push(t('Several suppliers available', 'تأمین‌کنندگان متعدد')); }
    f('Supplier power', 'قدرت تأمین‌کنندگان', s, sd.length ? sd : [t('No cue found: neutral rating', 'نشانه‌ای پیدا نشد: امتیاز خنثی')], sev);
    // buyers
    var b = 3, bd = [], bev = grab(items(P.customers), /./);
    var cc = pcts(P.customers).filter(function (x) { return x > 0.2; })[0];
    if (cc >= 0.4) { b += 1; bd.push(t('High customer concentration (' + Math.round(cc * 100) + '%)', 'تمرکز بالای مشتریان (' + Math.round(cc * 100) + '٪)')); }
    else if (any(P.customers, CUE.concentrated)) { b += 1; bd.push(t('Customer concentration mentioned', 'تمرکز مشتریان ذکر شده')); }
    if (any(P.customers, CUE.gov)) { b += 1; bd.push(t('Large project / state buyers negotiate hard', 'خریداران پروژه‌ای / دولتی چانه‌زنی قوی دارند')); }
    if (any(P.customers + P.products, /(هزینهٔ تغییر|switching cost|قرارداد بلندمدت|long[- ]term contract|technical support|پشتیبانی فنی)/i)) { b -= 1; bd.push(t('Switching costs or support ties reduce buyer power', 'هزینهٔ تغییر یا وابستگی به پشتیبانی، قدرت خریدار را کم می‌کند')); }
    f('Buyer power', 'قدرت خریداران', b, bd.length ? bd : [t('No cue found: neutral rating', 'نشانه‌ای پیدا نشد: امتیاز خنثی')], bev);
    // substitutes
    var su = 2, sud = [], suev = grab(items(P.all), CUE.substitute);
    if (suev.length) { su += 2; sud.push(t('Substitutes named in the profile', 'جایگزین‌ها در پروفایل ذکر شده')); }
    if (any(P.competitors, /(premium|وارداتی|imported)/i)) { su += 1; sud.push(t('Imported products as substitutes when FX allows', 'محصولات وارداتی در صورت آزاد شدن ارز جایگزین می‌شوند')); }
    f('Threat of substitutes', 'تهدید محصولات جایگزین', su, sud.length ? sud : [t('No substitutes mentioned: treated as moderate-low (verify)', 'جایگزینی ذکر نشده: متوسط رو به پایین فرض شد (بررسی شود)')], suev);
    // rivalry
    var r = 3, rd = [], rev = grab(items(P.competitors + ' . ' + P.recent), CUE.rivalry.source ? CUE.rivalry : /./);
    var shares = pcts(P.competitors);
    if (shares.length && shares.some(function (x) { return x >= 0.2; })) { r += 1; rd.push(t('Large rivals with sizeable shares', 'رقبای بزرگ با سهم بازار قابل توجه')); }
    if (any(P.recent + P.capabilities + P.notes, CUE.lowUtil)) { r += 1; rd.push(t('Spare capacity pushes price competition', 'ظرفیت خالی رقابت قیمتی را تشدید می‌کند')); }
    if (any(P.competitors, /(شدید|price war|جنگ قیمت|intense)/i)) { r += 1; rd.push(t('Intense competition stated', 'رقابت شدید ذکر شده')); }
    f('Rivalry', 'رقابت میان رقبا', r, rd.length ? rd : [t('No cue found: neutral rating', 'نشانه‌ای پیدا نشد: امتیاز خنثی')], rev);
    out.forEach(function (x) { var fa = { 'Threat of new entrants': 'تهدید ورود تازه‌واردها', 'Supplier power': 'قدرت تأمین‌کنندگان', 'Buyer power': 'قدرت خریداران', 'Threat of substitutes': 'تهدید محصولات جایگزین', 'Rivalry': 'رقابت میان رقبا' }[x.force]; x.label = t(x.force, fa); });
    return out;
  }

  /* ---------- frameworks ---------- */
  var FWK = {
    fiveForces: function (S, t) {
      var F = forces(S, t), avg = F.reduce(function (a, x) { return a + x.rating; }, 0) / F.length, top = F.slice().sort(function (a, b) { return b.rating - a.rating; })[0];
      var attr = avg >= 3.6 ? t('Unattractive: strong forces squeeze margins (average ' + avg.toFixed(1) + ' / 5).', 'جذابیت کم: نیروهای قوی حاشیه را فشرده می‌کنند (میانگین ' + avg.toFixed(1) + ' از ۵).') : avg >= 2.8 ? t('Moderately attractive (average ' + avg.toFixed(1) + ' / 5).', 'جذابیت متوسط (میانگین ' + avg.toFixed(1) + ' از ۵).') : t('Attractive: weak forces (average ' + avg.toFixed(1) + ' / 5).', 'جذاب: نیروها ضعیف‌اند (میانگین ' + avg.toFixed(1) + ' از ۵).');
      var imp = F.filter(function (x) { return x.rating >= 4; }).map(function (x) { return t('Neutralise ' + x.force.toLowerCase() + ': ' + x.drivers[0], 'خنثی کردن ' + x.label + ': ' + x.drivers[0]); });
      return { forces: F.map(function (x) { return { force: x.force, rating: x.rating, drivers: x.drivers, evidence: x.evidence }; }), industryAttractiveness: attr, implications: imp.length ? imp : [t('No force is dominant; compete on execution and cost.', 'هیچ نیرویی غالب نیست؛ رقابت بر سر اجرا و هزینه است.')],
        keyFindings: F.map(function (x) { return x.label + ': ' + x.rating + '/5 — ' + x.drivers[0]; }),
        strategy: t('The strongest pressure is ' + top.force.toLowerCase() + ' (' + top.rating + '/5). Strategy should first reduce exposure to it (' + top.drivers[0] + '), then defend the barriers that keep entrants out.', 'بیشترین فشار از ' + top.label + ' است (' + top.rating + ' از ۵). راهبرد باید ابتدا وابستگی به آن را کم کند (' + top.drivers[0] + ') و سپس موانعی را که مانع ورود رقبا است حفظ کند.'),
        assumptions: BASE_ASSUMP(t).concat([t('Ratings start at 3 (neutral) and move ±1 per cue found.', 'امتیازها از ۳ (خنثی) شروع و با هر نشانه ±۱ تغییر می‌کنند.')]), evidenceGaps: gaps(S, t, ['competitors', 'customers', 'suppliers', 'industry']).concat([t('Market shares, price trends and import data', 'سهم بازار، روند قیمت و آمار واردات')]), confidence: conf(S, ['competitors', 'customers', 'suppliers', 'industry']) };
    },
    pestel: function (S, t) {
      var P = profile(S), src = items(P.macro + ' . ' + P.recent + ' . ' + P.constraints + ' . ' + P.suppliers + ' . ' + P.notes);
      var dims = [['Political', 'سیاسی', CUE.political], ['Economic', 'اقتصادی', CUE.economic], ['Social', 'اجتماعی', CUE.social], ['Technological', 'فناوری', CUE.tech], ['Environmental', 'محیط‌زیستی', CUE.env], ['Legal', 'حقوقی', CUE.legal]];
      var factors = dims.map(function (d) { var pts = grab(src, d[2]); var neg = pts.filter(function (x) { return CUE.neg.test(x); }).length; return { dimension: d[0], points: pts.length ? pts.slice(0, 4) : [t('Nothing in the profile', 'در پروفایل چیزی نیامده')], impact: pts.length >= 2 ? 'high' : pts.length ? 'medium' : 'low', direction: pts.length && neg >= pts.length / 2 ? 'threat' : pts.length ? 'opportunity' : 'threat' }; });
      var hi = factors.filter(function (x) { return x.impact === 'high'; });
      return { factors: factors, implications: hi.map(function (x) { return t(x.dimension + ' factors are material: plan for them explicitly.', 'عوامل ' + dims.filter(function (d) { return d[0] === x.dimension; })[0][1] + ' مهم‌اند: برایشان برنامهٔ مشخص لازم است.'); }),
        keyFindings: factors.filter(function (x) { return x.points.length && x.impact !== 'low'; }).map(function (x) { return x.dimension + ': ' + cut(x.points[0], 100); }),
        strategy: hi.length ? t('The macro picture is dominated by ' + hi.map(function (x) { return x.dimension.toLowerCase(); }).join(' and ') + ' factors. Build buffers (pricing pass-through, FX and supply hedges, compliance) before committing to growth.', 'تصویر کلان تحت تأثیر عوامل ' + hi.map(function (x) { return dims.filter(function (d) { return d[0] === x.dimension; })[0][1]; }).join(' و ') + ' است. پیش از تعهد به رشد، سپر بسازید (انتقال قیمت، پوشش ارز و تأمین، رعایت مقررات).') : t('Few macro factors were described; the analysis is thin.', 'عوامل کلان کمی توصیف شده؛ تحلیل کم‌عمق است.'),
        assumptions: BASE_ASSUMP(t), evidenceGaps: gaps(S, t, ['macro', 'recent']).concat([t('Quantified exposure: FX share of costs, regulated price share of sales', 'میزان کمّی اثر: سهم ارزی بهای تمام‌شده، سهم فروش با قیمت‌گذاری دستوری')]), confidence: conf(S, ['macro', 'recent']) };
    },
    swot: function (S, t) {
      var W = swotLists(S, t), pick = function (a, i) { return a[i % Math.max(1, a.length)]; };
      var tows = { SO: [], ST: [], WO: [], WT: [] };
      if (W.S.length && W.O.length) for (var i = 0; i < Math.min(3, W.O.length); i++) tows.SO.push(t('Use “' + cut(pick(W.S, i), 60) + '” to capture “' + cut(W.O[i], 60) + '”', 'از «' + cut(pick(W.S, i), 60) + '» برای استفاده از «' + cut(W.O[i], 60) + '» بهره بگیرید'));
      if (W.S.length && W.T.length) for (i = 0; i < Math.min(3, W.T.length); i++) tows.ST.push(t('Use “' + cut(pick(W.S, i), 60) + '” to blunt “' + cut(W.T[i], 60) + '”', 'با «' + cut(pick(W.S, i), 60) + '» اثر «' + cut(W.T[i], 60) + '» را کم کنید'));
      if (W.W.length && W.O.length) for (i = 0; i < Math.min(3, W.W.length); i++) tows.WO.push(t('Fix “' + cut(W.W[i], 60) + '” so you can pursue “' + cut(pick(W.O, i), 60) + '”', '«' + cut(W.W[i], 60) + '» را رفع کنید تا بتوانید «' + cut(pick(W.O, i), 60) + '» را دنبال کنید'));
      if (W.W.length && W.T.length) for (i = 0; i < Math.min(3, W.W.length); i++) tows.WT.push(t('Reduce exposure where “' + cut(W.W[i], 60) + '” meets “' + cut(pick(W.T, i), 60) + '”', 'جایی که «' + cut(W.W[i], 60) + '» با «' + cut(pick(W.T, i), 60) + '» هم‌زمان است، ریسک را کم کنید'));
      var none = t('Nothing identified from the profile', 'از پروفایل چیزی شناسایی نشد');
      return { strengths: W.S.length ? W.S : [none], weaknesses: W.W.length ? W.W : [none], opportunities: W.O.length ? W.O : [none], threats: W.T.length ? W.T : [none], tows: tows,
        keyFindings: [t(W.S.length + ' strengths, ' + W.W.length + ' weaknesses, ' + W.O.length + ' opportunities, ' + W.T.length + ' threats identified.', W.S.length + ' قوت، ' + W.W.length + ' ضعف، ' + W.O.length + ' فرصت و ' + W.T.length + ' تهدید شناسایی شد.')].concat(W.W.slice(0, 2).map(function (x) { return t('Weakness: ', 'ضعف: ') + cut(x, 110); })),
        strategy: W.W.length > W.S.length ? t('Weaknesses outnumber strengths: a WO / WT agenda (fix, then grow) fits better than an aggressive SO push.', 'ضعف‌ها از قوت‌ها بیشترند: برنامهٔ WO / WT (اول اصلاح، بعد رشد) از راهبرد تهاجمی SO مناسب‌تر است.') : t('Strengths support an SO agenda: use them on the clearest opportunity, while ST moves protect against the main threats.', 'قوت‌ها برنامهٔ SO را پشتیبانی می‌کنند: آن‌ها را روی روشن‌ترین فرصت به کار بگیرید و با اقدامات ST از تهدیدهای اصلی محافظت کنید.'),
        assumptions: BASE_ASSUMP(t).concat([t('Statements with negative cue words were classed as weaknesses / threats, positive ones as strengths / opportunities.', 'جمله‌های دارای واژه‌های منفی ضعف/تهدید و جمله‌های مثبت قوت/فرصت طبقه‌بندی شدند.')]), evidenceGaps: gaps(S, t, ['capabilities', 'financials', 'macro', 'competitors']), confidence: conf(S, ['capabilities', 'financials', 'macro', 'competitors']) };
    },
    vrio: function (S, t) {
      var P = profile(S), res = items(P.capabilities).slice(0, 8);
      if (!res.length) res = grab(items(P.all), CUE.licence).slice(0, 4);
      var R = res.map(function (r) {
        var rare = CUE.licence.test(r) || /(own|اختصاصی|خود|unique|منحصر|انحصار|lab|آزمایشگاه|export|صادرات)/i.test(r), inim = /(licen|مجوز|patent|ثبت|brand|برند|relationship|رابطه|location|موقعیت|know|دانش|team|تیم)/i.test(r), org = !CUE.governance.test(P.constraints || '') || true;
        var imp = rare && inim && org ? 'sustained advantage' : rare ? 'temporary advantage' : 'parity';
        return { resource: cut(r, 90), valuable: true, rare: rare, inimitable: inim, organised: org, competitiveImplication: imp };
      });
      var sus = R.filter(function (x) { return x.competitiveImplication === 'sustained advantage'; });
      return { resources: R.length ? R : [{ resource: t('No resources described', 'منبعی توصیف نشده'), valuable: false, rare: false, inimitable: false, organised: false, competitiveImplication: 'parity' }],
        implications: sus.length ? sus.map(function (x) { return t('Protect and build on: ', 'حفظ و تقویت شود: ') + x.resource; }) : [t('No resource looks hard to copy: advantage must come from execution or cost.', 'هیچ منبعی سخت‌تقلید به نظر نمی‌رسد: مزیت باید از اجرا یا هزینه بیاید.')],
        keyFindings: R.map(function (x) { return x.resource + ' → ' + x.competitiveImplication; }).slice(0, 5),
        strategy: sus.length ? t('Anchor the strategy on ' + sus.length + ' resource(s) that are rare and hard to copy; invest to keep them so.', 'راهبرد را بر ' + sus.length + ' منبع کمیاب و سخت‌تقلید بنا کنید و برای حفظ آن‌ها سرمایه‌گذاری کنید.') : t('Without a protected resource, focus on cost and service consistency and build one (licence, brand, technology).', 'بدون منبع محافظت‌شده، روی هزینه و ثبات خدمت تمرکز کنید و یک منبع مزیت (مجوز، برند، فناوری) بسازید.'),
        assumptions: BASE_ASSUMP(t).concat([t('Every listed resource is assumed valuable; rarity and inimitability come from cue words; organisation is assumed in place.', 'هر منبع ذکرشده باارزش فرض شد؛ کمیابی و سخت‌تقلیدی از واژه‌های نشانه؛ سازمان‌یافتگی موجود فرض شد.')]), evidenceGaps: gaps(S, t, ['capabilities']).concat([t('How rivals match each resource', 'رقبا هر منبع را چگونه دارند')]), confidence: conf(S, ['capabilities', 'competitors']) };
    },
    ansoff: function (S, t) {
      var P = profile(S), o = [];
      var util = any(P.recent + P.capabilities + P.notes, CUE.lowUtil), exp = any(P.geography + P.capabilities, CUE.export), conc = any(P.customers, CUE.concentrated) || pcts(P.customers).some(function (x) { return x >= 0.4; });
      o.push({ quadrant: 'Market penetration', option: t('Win share in current segments and fill spare capacity', 'افزایش سهم در بخش‌های فعلی و پر کردن ظرفیت خالی'), rationale: util ? t('Spare capacity is the cheapest growth', 'ظرفیت خالی ارزان‌ترین منبع رشد است') : t('Lowest risk; builds on current customers', 'کم‌ریسک‌ترین؛ بر مشتریان فعلی بنا می‌شود'), risk: t('Price competition with incumbents', 'رقابت قیمتی با بازیگران فعلی'), fit: util ? 5 : 4 });
      o.push({ quadrant: 'Market development', option: exp ? t('Scale exports in markets already served', 'گسترش صادرات در بازارهای فعلی') : t('New regions or customer segments for current products', 'منطقه یا بخش مشتری جدید برای محصولات فعلی'), rationale: conc ? t('Reduces customer concentration', 'تمرکز مشتریان را کم می‌کند') : t('Extends reach of proven products', 'دامنهٔ محصولات اثبات‌شده را گسترش می‌دهد'), risk: t('Payment, FX and logistics risk', 'ریسک وصول، ارز و لجستیک'), fit: exp ? 4 : 3 });
      o.push({ quadrant: 'Product development', option: t('Adjacent products for existing customers', 'محصولات مجاور برای مشتریان فعلی'), rationale: any(P.capabilities, /(lab|آزمایشگاه|R&D|تحقیق|technical|فنی)/i) ? t('R&D / technical capability exists', 'توان تحقیق و توسعه / فنی وجود دارد') : t('Uses existing relationships', 'از روابط موجود استفاده می‌کند'), risk: t('Development cost and time', 'هزینه و زمان توسعه'), fit: 3 });
      o.push({ quadrant: 'Diversification', option: t('New products in new markets', 'محصول جدید در بازار جدید'), rationale: t('Only if the core is saturated', 'فقط اگر بازار اصلی اشباع شده باشد'), risk: t('Highest execution risk', 'بالاترین ریسک اجرا'), fit: any(P.constraints, /(capital|سرمایه|محدود|limit)/i) ? 1 : 2 });
      var best = o.slice().sort(function (a, b) { return b.fit - a.fit; })[0];
      return { options: o, preferred: best.option, keyFindings: o.map(function (x) { return x.quadrant + ': ' + x.fit + '/5'; }),
        strategy: t('Lead with ' + best.quadrant.toLowerCase() + ' (' + best.option + '); sequence riskier quadrants once it is delivering.', 'با ' + { 'Market penetration': 'نفوذ در بازار', 'Market development': 'توسعهٔ بازار', 'Product development': 'توسعهٔ محصول', 'Diversification': 'تنوع‌بخشی' }[best.quadrant] + ' شروع کنید (' + best.option + ')؛ پس از نتیجه، سراغ گزینه‌های پرریسک‌تر بروید.'),
        assumptions: BASE_ASSUMP(t).concat([t('Fit scores reward spare capacity, existing exports and R&D cues; capital constraints penalise diversification.', 'امتیاز تناسب به ظرفیت خالی، صادرات موجود و توان تحقیق و توسعه وزن می‌دهد؛ محدودیت سرمایه تنوع‌بخشی را کم‌امتیاز می‌کند.')]), evidenceGaps: gaps(S, t, ['products', 'customers', 'geography', 'constraints']).concat([t('Market size and growth by segment', 'اندازه و رشد بازار هر بخش')]), confidence: conf(S, ['products', 'customers', 'geography']) };
    },
    kernel: function (S, t) {
      var P = profile(S), W = swotLists(S, t), F = forces(S, t), top = F.slice().sort(function (a, b) { return b.rating - a.rating; })[0];
      var diag = (W.W[0] ? t('The company’s core challenge: ', 'چالش اصلی شرکت: ') + cut(W.W[0], 120) : t('Core challenge not clear from the profile', 'چالش اصلی از پروفایل روشن نیست')) + t(', in an industry where ' + top.force.toLowerCase() + ' is the strongest force.', '، در صنعتی که ' + top.label + ' قوی‌ترین نیرو است.');
      var policy = W.W.length > W.S.length ? t('Fix the main weakness before scaling: protect margins and cash, then grow where spare capacity and existing customers allow.', 'پیش از بزرگ‌شدن، ضعف اصلی را رفع کنید: حاشیه و نقدینگی را حفظ کنید، سپس در جایی رشد کنید که ظرفیت خالی و مشتریان فعلی اجازه می‌دهند.') : t('Concentrate strengths on the clearest opportunity and shield the business from the strongest force.', 'قوت‌ها را روی روشن‌ترین فرصت متمرکز کنید و کسب‌وکار را از قوی‌ترین نیرو محافظت کنید.');
      var actions = uniq([].concat(W.W.slice(0, 2).map(function (x) { return t('Address: ', 'رفع: ') + cut(x, 90); }), [t('Reduce exposure to ' + top.force.toLowerCase() + ': ' + top.drivers[0], 'کاهش وابستگی به ' + top.label + ': ' + top.drivers[0])], W.O.slice(0, 1).map(function (x) { return t('Pursue: ', 'پیگیری: ') + cut(x, 90); })));
      var flags = [];
      if (any(P.objectives, CUE.double)) flags.push(t('Objective is a number (e.g. “double revenue”), not a strategy: it says what, not how.', 'هدف یک عدد است (مثلاً «دو برابر کردن فروش»)، نه راهبرد: «چه» را می‌گوید، نه «چگونه».'));
      if (any(P.objectives, CUE.fluff)) flags.push(t('Fluff words in the objectives (“best”, “leading”): replace with a choice.', 'واژه‌های کلی در اهداف («بهترین»، «پیشرو»): با یک انتخاب مشخص جایگزین کنید.'));
      if (any(P.objectives, CUE.double) && any(P.constraints, /(محدود|limit|constrain|کمبود)/i)) flags.push(t('Ambition conflicts with stated constraints: the gap needs a funding and capacity plan.', 'جاه‌طلبی با محدودیت‌های اعلام‌شده در تعارض است: برای این فاصله برنامهٔ تأمین مالی و ظرفیت لازم است.'));
      return { diagnosis: diag, guidingPolicy: policy, coherentActions: actions, proximateObjective: any(P.recent + P.capabilities, CUE.lowUtil) ? t('Raise utilisation of the new capacity within 12 months at current margins.', 'افزایش بهره‌برداری از ظرفیت جدید ظرف ۱۲ ماه با حفظ حاشیهٔ فعلی.') : t('One measurable 12-month target tied to the main weakness.', 'یک هدف قابل اندازه‌گیری ۱۲ماهه مرتبط با ضعف اصلی.'), badStrategyFlags: flags,
        keyFindings: [diag, policy], strategy: policy + ' ' + actions.join('; ') + '.', assumptions: BASE_ASSUMP(t), evidenceGaps: gaps(S, t, ['question', 'objectives', 'constraints']), confidence: conf(S, ['question', 'objectives', 'constraints', 'financials']) };
    },
    blueOcean: function (S, t) {
      var P = profile(S), fac = [];
      function addF(en, fa, ind, pro, re) { if (re === true || re.test(P.all)) fac.push({ factor: t(en, fa), industry: ind, proposed: pro }); }
      addF('Price', 'قیمت', 6, 5, true); addF('Technical support', 'پشتیبانی فنی', 4, 8, CUE.service); addF('Product range', 'تنوع محصول', 7, 5, /(range|تنوع|سبد)/i);
      addF('Delivery speed', 'سرعت تحویل', 5, 7, true); addF('Quality / certification', 'کیفیت / گواهی', 6, 7, /(iso|کیفیت|quality|certif|گواهی|استاندارد)/i); addF('Distribution reach', 'گستردگی توزیع', 6, 5, CUE.distributor);
      addF('Brand advertising', 'تبلیغات برند', 6, 3, true); addF('Payment terms', 'شرایط پرداخت', 5, 5, true);
      var errc = { eliminate: [t('Low-volume variants that tie up working capital', 'گونه‌های کم‌فروش که سرمایه در گردش را قفل می‌کنند')], reduce: [t('Mass advertising; rely on technical selling', 'تبلیغات انبوه؛ تکیه بر فروش فنی')].concat(any(P.all, CUE.distributor) ? [t('Margin given to distributors where direct service is possible', 'حاشیهٔ پرداختی به توزیع‌کنندگان در جایی که فروش مستقیم ممکن است')] : []),
        raise: [t('Delivery reliability and speed', 'قابلیت اطمینان و سرعت تحویل')].concat(any(P.all, CUE.service) ? [t('Technical support (already a strength)', 'پشتیبانی فنی (که قوت فعلی است)')] : []),
        create: [t('A bundled offer (product + application + guarantee) priced on outcome', 'پیشنهاد بسته‌ای (محصول + اجرا + ضمانت) با قیمت‌گذاری بر اساس نتیجه')].concat(any(P.all, CUE.digitalSales) ? [] : [t('A digital ordering / tracking channel for repeat customers', 'کانال سفارش و پیگیری دیجیتال برای مشتریان تکراری')]) };
      return Object.assign(errc, { canvas: fac, tagline: t('Reliable performance with expert support, without the premium price.', 'عملکرد مطمئن با پشتیبانی تخصصی، بدون قیمت پرمیوم.'),
        keyFindings: [t('Canvas factors are generic for a B2B industrial business, adapted to cues in the profile.', 'عوامل بوم برای کسب‌وکار صنعتی B2B عمومی‌اند و با نشانه‌های پروفایل تطبیق داده شده‌اند.')],
        strategy: t('Move away from competing on price and range; compete on reliability and expert service bundled into one offer.', 'از رقابت بر سر قیمت و تنوع فاصله بگیرید؛ بر قابلیت اطمینان و خدمت تخصصی در قالب یک پیشنهاد واحد رقابت کنید.'),
        assumptions: BASE_ASSUMP(t).concat([t('Industry and proposed scores (0-10) are illustrative placeholders: replace with customer interviews.', 'امتیازهای صنعت و پیشنهادی (۰ تا ۱۰) صرفاً نمونه‌اند: با مصاحبهٔ مشتری جایگزین کنید.')]), evidenceGaps: [t('What customers value and pay for, by factor', 'آنچه مشتری ارزش می‌داند و برایش پول می‌دهد، به تفکیک عامل')].concat(gaps(S, t, ['products', 'customers', 'competitors'])), confidence: 'low' });
    },
    valueChain: function (S, t) {
      var P = profile(S), A = function (re) { return grab(items(P.all), re)[0] || ''; };
      var primary = [
        { activity: 'Inbound logistics', assessment: A(CUE.import) || t('Not described', 'توصیف نشده'), costOrDifferentiationDriver: A(CUE.import) ? t('FX and import access drive cost', 'ارز و دسترسی به واردات بهای تمام‌شده را تعیین می‌کند') : '' },
        { activity: 'Operations', assessment: A(CUE.lowUtil) || A(/(plant|کارخانه|production|تولید|line|خط)/i) || t('Not described', 'توصیف نشده'), costOrDifferentiationDriver: A(CUE.lowUtil) ? t('Utilisation drives unit cost', 'نرخ بهره‌برداری بهای واحد را تعیین می‌کند') : '' },
        { activity: 'Outbound logistics', assessment: A(/(delivery|تحویل|حمل|logistic|export|صادرات)/i) || t('Not described', 'توصیف نشده'), costOrDifferentiationDriver: '' },
        { activity: 'Marketing & sales', assessment: A(CUE.distributor) || A(/(sales|فروش|B2B)/i) || t('Not described', 'توصیف نشده'), costOrDifferentiationDriver: A(CUE.distributor) ? t('Channel mix sets margin', 'ترکیب کانال حاشیه را تعیین می‌کند') : '' },
        { activity: 'Service', assessment: A(CUE.service) || t('Not described', 'توصیف نشده'), costOrDifferentiationDriver: A(CUE.service) ? t('Differentiation through support', 'تمایز از طریق پشتیبانی') : '' }];
      var support = [{ activity: 'Infrastructure', assessment: A(CUE.governance) || t('Not described', 'توصیف نشده') }, { activity: 'HR', assessment: A(/(staff|کارکنان|نیرو|people|team|تیم)/i) || t('Not described', 'توصیف نشده') }, { activity: 'Technology', assessment: A(/(lab|آزمایشگاه|R&D|تحقیق|technolog|فناوری)/i) || t('Not described', 'توصیف نشده') }, { activity: 'Procurement', assessment: A(/(supplier|تأمین|خرید|resin|raw|مواد)/i) || t('Not described', 'توصیف نشده') }];
      var created = primary.concat(support).filter(function (x) { return x.assessment && CUE.pos.test(x.assessment); }).map(function (x) { return x.activity + ': ' + cut(x.assessment, 90); });
      var leaks = primary.concat(support).filter(function (x) { return x.assessment && CUE.neg.test(x.assessment) || CUE.lowUtil.test(x.assessment); }).map(function (x) { return x.activity + ': ' + cut(x.assessment, 90); });
      return { primary: primary, support: support, whereValueIsCreated: created.length ? created : [t('Not clear from the profile', 'از پروفایل روشن نیست')], whereValueLeaks: leaks.length ? leaks : [t('Not clear from the profile', 'از پروفایل روشن نیست')],
        keyFindings: leaks.slice(0, 3).concat(created.slice(0, 2)), strategy: leaks.length ? t('Close the leaks first (' + leaks.map(function (x) { return x.split(':')[0]; }).join(', ') + '); they cost margin every month.', 'ابتدا نشت‌ها را ببندید (' + leaks.map(function (x) { return x.split(':')[0]; }).join('، ') + ')؛ هر ماه از حاشیه کم می‌کنند.') : t('Describe operations and costs to locate value leaks.', 'برای یافتن نشت ارزش، عملیات و هزینه‌ها را توصیف کنید.'),
        assumptions: BASE_ASSUMP(t), evidenceGaps: [t('Cost breakdown by activity', 'ساختار هزینه به تفکیک فعالیت')].concat(gaps(S, t, ['suppliers', 'capabilities', 'businessModel'])), confidence: conf(S, ['suppliers', 'capabilities', 'businessModel', 'products']) };
    },
    sevenS: function (S, t) {
      var P = profile(S), E = [['Strategy', P.question || P.objectives], ['Structure', grab(items(P.all), /(structure|ساختار|family|خانوادگی|holding|هلدینگ|subsidiar|زیرمجموعه)/i)[0]], ['Systems', grab(items(P.all), /(system|سیستم|ERP|reporting|گزارش|budget|بودجه|ISO)/i)[0]],
        ['Shared values', grab(items(P.all), /(value|ارزش|culture|فرهنگ|mission|ماموریت)/i)[0]], ['Style', grab(items(P.all), CUE.governance)[0]], ['Staff', grab(items(P.all), /(staff|کارکنان|نیرو|people|employees|تیم)/i)[0]], ['Skills', grab(items(P.capabilities), /./)[0]]];
      var req = any(P.objectives, CUE.ipo) ? t('IPO-ready: independent board, audited monthly reporting, budgeting, investor relations', 'آمادهٔ عرضه: هیئت‌مدیرهٔ مستقل، گزارشگری ماهانهٔ حسابرسی‌پذیر، بودجه‌ریزی، روابط سرمایه‌گذاران') : t('Aligned with the growth objective', 'هم‌راستا با هدف رشد');
      var els = E.map(function (e) { var cur = e[1] ? cut(e[1], 110) : t('Not described', 'توصیف نشده'); return { element: e[0], current: cur, required: e[0] === 'Systems' || e[0] === 'Structure' || e[0] === 'Style' ? req : t('Supports the chosen strategy', 'پشتیبان راهبرد منتخب'), gap: !e[1] ? 'high' : (e[0] === 'Style' && any(P.objectives, CUE.ipo) && CUE.governance.test(e[1])) ? 'high' : 'medium' }; });
      var mis = els.filter(function (x) { return x.gap === 'high'; }).map(function (x) { return x.element + ': ' + x.current; });
      return { elements: els, misalignments: mis, keyFindings: mis.slice(0, 4), strategy: t('Close the high-gap elements before executing the strategy; they are where plans fail.', 'پیش از اجرای راهبرد، عناصر با شکاف زیاد را اصلاح کنید؛ برنامه‌ها همان‌جا شکست می‌خورند.'),
        assumptions: BASE_ASSUMP(t).concat([t('An element not described is treated as a high gap.', 'عنصر توصیف‌نشده شکاف زیاد فرض شد.')]), evidenceGaps: [t('Organisation chart, reporting and incentive systems', 'نمودار سازمانی، سیستم گزارشگری و انگیزشی')], confidence: 'low' };
    },
    bmc: function (S, t) {
      var P = profile(S), L = function (s) { var a = items(s); return a.length ? a.slice(0, 5) : [t('Not described', 'توصیف نشده')]; };
      var o = { customerSegments: L(P.customers), valuePropositions: L(P.products), channels: L(grab(items(P.businessModel + ' . ' + P.all), /(channel|کانال|distribut|توزیع|direct|مستقیم|online|آنلاین|B2B|sales|فروش)/i).join(' . ')), customerRelationships: L(grab(items(P.all), CUE.service.source ? CUE.service : /./).concat(grab(items(P.customers), /(contract|قرارداد|long|بلند)/i)).join(' . ')),
        revenueStreams: L(P.businessModel), keyResources: L(P.capabilities), keyActivities: L(grab(items(P.all), /(produc|تولید|R&D|تحقیق|sales|فروش|service|خدمات)/i).join(' . ')), keyPartners: L(P.suppliers), costStructure: L(grab(items(P.suppliers + ' . ' + P.financials), /(cost|هزینه|بهای|margin|حاشیه|import|واردات|FX|ارز)/i).join(' . ')) };
      var weakest = Object.keys(o).filter(function (k) { return o[k][0] === t('Not described', 'توصیف نشده') || o[k].some(function (x) { return CUE.neg.test(x); }); })[0] || 'costStructure';
      return Object.assign(o, { weakestBlock: weakest, redesignIdeas: [t('Strengthen “' + weakest + '”: it is the least described or most exposed block.', 'بلوک «' + weakest + '» را تقویت کنید: کم‌توصیف‌ترین یا آسیب‌پذیرترین بلوک است.')].concat(any(P.customers, CUE.concentrated) ? [t('Diversify customer segments to cut concentration.', 'تنوع‌بخشی به بخش‌های مشتری برای کاهش تمرکز.')] : []),
        keyFindings: [t('Weakest block: ', 'ضعیف‌ترین بلوک: ') + weakest], strategy: t('Keep the model, fix the weakest block first.', 'مدل را نگه دارید و ابتدا ضعیف‌ترین بلوک را اصلاح کنید.'), assumptions: BASE_ASSUMP(t), evidenceGaps: gaps(S, t, ['businessModel', 'customers', 'products', 'suppliers']), confidence: conf(S, ['businessModel', 'customers', 'products', 'suppliers']) });
    },
    ptw: function (S, t) {
      var P = profile(S), W = swotLists(S, t);
      return { winningAspiration: P.objectives || t('Not stated', 'بیان نشده'), whereToPlay: [P.industry, P.geography, items(P.customers)[0]].filter(Boolean).map(function (x) { return cut(x, 80); }).join(' · ') || t('Not stated', 'بیان نشده'),
        howToWin: W.S.length ? t('By ', 'با ') + W.S.slice(0, 2).map(function (x) { return cut(x, 70); }).join(t(' and ', ' و ')) : t('Not clear: no distinctive strength described', 'روشن نیست: قوت متمایزی توصیف نشده'), capabilities: W.S.slice(0, 4), managementSystems: [t('Monthly KPI review of margin, utilisation and cash conversion', 'بازبینی ماهانهٔ شاخص‌های حاشیه، بهره‌برداری و تبدیل نقد'), t('Pricing committee that passes cost changes through', 'کمیتهٔ قیمت‌گذاری برای انتقال تغییر هزینه به قیمت')],
        whatMustBeTrue: uniq([t('Customers in the chosen segments value the “how to win” enough to pay for it', 'مشتریان بخش‌های منتخب برای «چگونه برنده شدن» حاضر به پرداخت باشند')].concat(W.T.slice(0, 2).map(function (x) { return t('Threat stays manageable: ', 'تهدید قابل مدیریت بماند: ') + cut(x, 80); })).concat(any(P.objectives, CUE.double) ? [t('Funding and capacity exist for the growth target', 'منابع مالی و ظرفیت برای هدف رشد وجود داشته باشد')] : [])),
        keyFindings: [t('Where: ', 'کجا: ') + cut([P.industry, P.geography].filter(Boolean).join(' · '), 90)], strategy: t('Choose narrowly where to play and make the “how to win” measurable.', 'محدودهٔ بازی را دقیق انتخاب کنید و «چگونه برنده شدن» را قابل اندازه‌گیری کنید.'), assumptions: BASE_ASSUMP(t), evidenceGaps: gaps(S, t, ['objectives', 'customers', 'capabilities']), confidence: conf(S, ['objectives', 'customers', 'capabilities', 'industry']) };
    }
  };

  // Persian values for the fixed vocabulary (keys stay English; Five Forces names stay English for the Five Forces tool)
  var VFA = { low: 'کم', medium: 'متوسط', high: 'زیاد', 'very high': 'خیلی زیاد', critical: 'بحرانی', opportunity: 'فرصت', threat: 'تهدید', parity: 'برابری', 'temporary advantage': 'مزیت موقت', 'sustained advantage': 'مزیت پایدار', disadvantage: 'عدم مزیت',
    'Market penetration': 'نفوذ در بازار', 'Market development': 'توسعهٔ بازار', 'Product development': 'توسعهٔ محصول', 'Diversification': 'تنوع‌بخشی', existence: 'وجود', completeness: 'کامل بودن', valuation: 'ارزش‌گذاری', 'cut-off': 'انقطاع', presentation: 'ارائه و افشا', rights: 'حقوق و تعهدات',
    'Political': 'سیاسی', 'Economic': 'اقتصادی', 'Social': 'اجتماعی', 'Technological': 'فناوری', 'Environmental': 'محیط‌زیستی', 'Legal': 'حقوقی', 'Inbound logistics': 'تدارکات ورودی', 'Operations': 'عملیات', 'Outbound logistics': 'تدارکات خروجی', 'Marketing & sales': 'بازاریابی و فروش', 'Service': 'خدمات',
    'Infrastructure': 'زیرساخت', 'HR': 'منابع انسانی', 'Technology': 'فناوری', 'Procurement': 'تدارکات', 'Strategy': 'راهبرد', 'Structure': 'ساختار', 'Systems': 'سیستم‌ها', 'Shared values': 'ارزش‌های مشترک', 'Style': 'سبک', 'Staff': 'کارکنان', 'Skills': 'مهارت‌ها',
    '0-3 months': '۰ تا ۳ ماه', '3-12 months': '۳ تا ۱۲ ماه', customerSegments: 'بخش‌های مشتری', valuePropositions: 'ارزش پیشنهادی', channels: 'کانال‌ها', customerRelationships: 'رابطه با مشتری', revenueStreams: 'جریان‌های درآمد', keyResources: 'منابع کلیدی', keyActivities: 'فعالیت‌های کلیدی', keyPartners: 'شرکای کلیدی', costStructure: 'ساختار هزینه' };
  var VKEYS = { impact: 1, direction: 1, competitiveImplication: 1, quadrant: 1, name: 1, severity: 1, assertion: 1, riskRating: 1, confidence: 1, effort: 1, horizon: 1, gap: 1, dimension: 1, activity: 1, element: 1, weakestBlock: 1 };
  function faVals(o, lang) {
    if (lang !== 'fa' || !o || typeof o !== 'object') return o;
    if (Array.isArray(o)) { o.forEach(function (x) { faVals(x, lang); }); return o; }
    Object.keys(o).forEach(function (k) { var v = o[k]; if (typeof v === 'string' && VKEYS[k] && VFA[v]) o[k] = VFA[v]; else if (v && typeof v === 'object') faVals(v, lang); });
    return o;
  }
  function strategy(S, key, lang) { var t = T(lang); return FWK[key] ? faVals(FWK[key](S, t), lang) : null; }

  function conclusion(S, lang) {
    var t = T(lang), P = profile(S), r = function (k) { return FWK[k](S, t); };
    var sw = r('swot'), kn = r('kernel'), an = r('ansoff'), ff = r('fiveForces'), vc = r('valueChain');
    var weakN = (sw.weaknesses || []).length, ops = (an.options || []).slice().sort(function (a, b) { return b.fit - a.fit; });
    var agree = [], disagree = [];
    if (ff.industryAttractiveness && /Unattractive|جذابیت کم/.test(ff.industryAttractiveness) && any(P.objectives, CUE.double)) disagree.push(t('Five Forces says the industry is tough, yet the objective is fast growth: growth must come from share or new markets, not the market itself.', 'پنج نیرو می‌گوید صنعت سخت است، اما هدف رشد سریع است: رشد باید از سهم بازار یا بازار جدید بیاید، نه خود بازار.'));
    agree.push(t('SWOT, kernel and value chain all point to fixing the main weakness before scaling.', 'SWOT، هستهٔ راهبرد و زنجیرهٔ ارزش همه به اصلاح ضعف اصلی پیش از رشد اشاره دارند.'));
    if (ops[0]) agree.push(t('Ansoff and the kernel converge on ' + ops[0].quadrant.toLowerCase() + ' as the first growth move.', 'انسوف و هستهٔ راهبرد بر ' + ops[0].option + ' به‌عنوان اولین حرکت رشد هم‌نظرند.'));
    var challenges = (kn.badStrategyFlags || []).slice();
    if (any(P.objectives, CUE.ipo) && any(P.constraints, /(dilut|رقیق|60%|۶۰)/i)) challenges.push(t('IPO with a dilution floor limits the free float and the amount raised: check the listing free-float rule.', 'عرضهٔ اولیه با کف رقیق‌شدن، سهام شناور و مبلغ جذب‌شده را محدود می‌کند: قاعدهٔ حداقل سهام شناور را بررسی کنید.'));
    var leaks = (vc.whereValueLeaks || []).filter(function (x) { return !/Not clear|روشن نیست/.test(x); });
    var plan = (sw.weaknesses || []).slice(0, 4).map(function (w, i) { return { initiative: t('Fix: ', 'اصلاح: ') + cut(w, 80), problemItSolves: cut(w, 80), priority: 5 - i, impact: i < 2 ? 'high' : 'medium', effort: CUE.import.test(w) ? 'high' : 'medium', horizon: i < 2 ? '0-3 months' : '3-12 months', kpi: CUE.lowUtil.test(w) ? t('Utilisation %', 'درصد بهره‌برداری') : /(margin|حاشیه)/i.test(w) ? t('Gross margin %', 'حاشیهٔ ناخالص') : t('Agreed metric', 'شاخص توافقی'), owner: t('CEO / CFO', 'مدیرعامل / مدیر مالی') }; });
    leaks.slice(0, 2).forEach(function (l) { plan.push({ initiative: t('Close value leak — ', 'بستن نشت ارزش — ') + cut(l, 70), problemItSolves: cut(l, 80), priority: 3, impact: 'medium', effort: 'medium', horizon: '3-12 months', kpi: t('Cost per unit', 'بهای واحد'), owner: t('COO', 'مدیر عملیات') }); });
    return faVals({
      executiveSummary: t('Rule-based synthesis of the frameworks. ', 'جمع‌بندی قاعده‌محور چارچوب‌ها. ') + (kn.diagnosis || '') + ' ' + (kn.guidingPolicy || ''),
      analysis: [{ theme: t('Industry', 'صنعت'), points: [ff.industryAttractiveness].concat((ff.implications || []).slice(0, 2)) }, { theme: t('Company', 'شرکت'), points: (sw.strengths || []).slice(0, 2).concat((sw.weaknesses || []).slice(0, 2)) }, { theme: t('Growth', 'رشد'), points: ops.slice(0, 2).map(function (o) { return o.quadrant + ' (' + o.fit + '/5): ' + o.option; }) }],
      whereFrameworksAgree: agree, whereFrameworksDisagree: disagree.length ? disagree : [t('No direct conflict detected by the rules.', 'تعارض مستقیمی با قواعد شناسایی نشد.')],
      options: ops.slice(0, 3).map(function (o) { return { name: o.quadrant, description: o.option, pros: [o.rationale], cons: [o.risk], fit: o.fit }; }),
      risks: (sw.threats || []).slice(0, 4).map(function (x) { return { risk: cut(x, 100), mitigation: CUE.import.test(x) ? t('Hedge supply: local sources, inventory buffer, price pass-through clauses', 'پوشش تأمین: منبع داخلی، ذخیرهٔ احتیاطی، بند انتقال قیمت') : CUE.rivalry.test(x) ? t('Differentiate on service and lock in key accounts', 'تمایز در خدمت و قرارداد بلندمدت با مشتریان کلیدی') : t('Monitor monthly with a trigger and a pre-agreed response', 'پایش ماهانه با آستانهٔ هشدار و واکنش از پیش توافق‌شده') }; }),
      recommendation: weakN > (sw.strengths || []).length ? t('Fix first, then grow: deliver the top two fixes in the plan before committing capital to expansion. ', 'اول اصلاح، بعد رشد: پیش از تخصیص سرمایه به توسعه، دو اصلاح اول برنامه را اجرا کنید. ') + (ops[0] ? t('Then lead with ', 'سپس با ') + ops[0].option + '.' : '') : (ops[0] ? t('Grow through ', 'رشد از مسیر ') + ops[0].option + t(', protecting the main strengths.', '، با حفظ قوت‌های اصلی.') : ''),
      scenarios: { base: t('Fixes delivered on time; growth from the preferred option.', 'اصلاحات به‌موقع اجرا و رشد از گزینهٔ منتخب.'), upside: t('Spare capacity filled faster; export or new segment adds volume.', 'ظرفیت خالی سریع‌تر پر می‌شود؛ صادرات یا بخش جدید حجم را افزایش می‌دهد.'), downside: t('Macro shock (FX, supply) squeezes margins; growth is postponed and cash protected.', 'شوک کلان (ارز، تأمین) حاشیه را فشرده می‌کند؛ رشد به تعویق و نقدینگی حفظ می‌شود.') },
      whatMustBeTrue: (r('ptw').whatMustBeTrue || []).slice(0, 4), challengesToTheBrief: challenges.length ? challenges : [t('None flagged by the rules; still test the objective against funding and capacity.', 'قاعده‌ها موردی را علامت نزدند؛ هدف را با منابع مالی و ظرفیت بسنجید.')],
      nextActions: [{ action: t('Validate the weaknesses and threats with data (cost breakdown, customer list, FX exposure)', 'اعتبارسنجی ضعف‌ها و تهدیدها با داده (ساختار هزینه، فهرست مشتریان، ریسک ارزی)'), timing: t('2 weeks', '۲ هفته') }, { action: t('Agree the top two fixes and owners', 'توافق بر دو اصلاح اول و مسئولان'), timing: t('1 month', '۱ ماه') }, { action: t('Build the funding plan for the preferred growth option', 'تهیهٔ برنامهٔ تأمین مالی برای گزینهٔ رشد منتخب'), timing: t('2 months', '۲ ماه') }],
      improvementPlan: plan, quickWins: plan.filter(function (p) { return p.effort !== 'high'; }).slice(0, 3).map(function (p) { return p.initiative; }),
      stopDoing: [t('Growth commitments not backed by a funding and capacity plan', 'تعهد به رشدی که برنامهٔ تأمین مالی و ظرفیت ندارد')].concat(leaks.length ? [t('Accepting the value leaks above as normal', 'پذیرفتن نشت‌های ارزش بالا به‌عنوان وضع عادی')] : []),
      keyFindings: agree, assumptions: BASE_ASSUMP(t), evidenceGaps: gaps(S, t, ['question', 'objectives', 'financials']), confidence: conf(S, ['question', 'objectives', 'financials', 'competitors'])
    }, lang);
  }

  /* ---------- strict auditor ---------- */
  var DOCS = {
    'Arithmetic': ['Trial balance and lead schedules', 'تراز آزمایشی و جداول راهنما'], 'Receivables': ['Aged receivables, confirmations, post year-end receipts', 'گزارش سنی مطالبات، تأییدیه‌ها، وصولی‌های بعد از سال'], 'Revenue / receivables': ['Sales cut-off file, contracts, delivery notes', 'پروندهٔ انقطاع فروش، قراردادها، حواله‌های تحویل'],
    'Inventory': ['Count sheets, NRV test, slow-moving list', 'صورت‌جلسات انبارگردانی، آزمون خالص ارزش فروش، فهرست اقلام راکد'], 'Related parties': ['Related-party ledger and board approvals (Commercial Code art. 129)', 'دفتر معین اشخاص وابسته و مصوبات هیئت‌مدیره (مادهٔ ۱۲۹ قانون تجارت)'],
    'Tax': ['Tax assessments (برگ تشخیص / قطعی), tax computation', 'برگ‌های تشخیص و قطعی مالیات، محاسبهٔ ذخیرهٔ مالیات'], 'Leverage': ['Loan agreements, covenants, repayment schedule', 'قراردادهای تسهیلات، تعهدات قراردادی، جدول بازپرداخت'], 'Finance cost': ['Loan agreements and interest computation', 'قراردادهای تسهیلات و محاسبهٔ سود'],
    'Going concern': ['Cash-flow forecast 12 months, financing commitments', 'پیش‌بینی جریان نقد ۱۲ ماهه، تعهدات تأمین مالی'], 'Going concern / legal': ['Shareholder resolution under Commercial Code art. 141', 'مصوبهٔ مجمع طبق مادهٔ ۱۴۱ قانون تجارت'], 'Cash': ['Bank confirmations and reconciliations', 'تأییدیه‌های بانکی و صورت مغایرت'],
    'Fixed assets': ['Fixed-asset register, depreciation policy', 'دفتر دارایی‌های ثابت، رویهٔ استهلاک'], 'Dividends': ['AGM minutes, dividend payment records', 'صورت‌جلسهٔ مجمع، سوابق پرداخت سود'], 'Earnings quality': ['Breakdown of other income and non-recurring items', 'ریز سایر درآمدها و اقلام غیرتکراری'], 'Margins': ['Gross margin by product, price and cost bridges', 'حاشیهٔ ناخالص به تفکیک محصول، تحلیل قیمت و بهای تمام‌شده'],
    'Legal': ['Legal confirmations, litigation list', 'تأییدیهٔ وکلا، فهرست دعاوی'], 'Unusual movement': ['Account analysis and supporting documents', 'تحلیل حساب و مستندات پشتیبان'], 'Completeness': ['Full statements with notes', 'صورت‌های کامل با یادداشت‌ها']
  };
  var ASSERT = { 'Receivables': 'valuation', 'Revenue / receivables': 'cut-off', 'Inventory': 'valuation', 'Related parties': 'presentation', 'Tax': 'completeness', 'Leverage': 'completeness', 'Going concern': 'valuation', 'Going concern / legal': 'presentation', 'Cash': 'existence', 'Arithmetic': 'presentation', 'Fixed assets': 'valuation', 'Earnings quality': 'presentation', 'Unusual movement': 'existence' };
  var NOTE_KEYS = [['Related parties', 'اشخاص وابسته', /اشخاص وابسته|related part/i], ['Commitments and contingent liabilities', 'تعهدات و بدهی‌های احتمالی', /بدهی(‌| )?های احتمالی|تعهدات سرمایه|contingent|commitment/i], ['Events after the reporting date', 'رویدادهای بعد از تاریخ گزارشگری', /رویدادهای (بعد|پس) از|events after/i],
    ['Tax position and open years', 'وضعیت مالیاتی و سال‌های رسیدگی‌نشده', /مالیات|tax/i], ['Earnings per share', 'سود هر سهم', /سود (پایه )?هر سهم|earnings per share/i], ['Capital management and financial risk', 'مدیریت سرمایه و ریسک‌های مالی', /مدیریت سرمایه|ریسک(‌| )?های مالی|financial risk|capital management/i], ['Going concern basis', 'مبنای تداوم فعالیت', /تداوم فعالیت|going concern/i]];
  function audit(S, R, lang, notesText) {
    var t = T(lang), F = R.findings || [], c = R.count || {}, q = R.ratios || {}, D = R.D, l = D ? D.n - 1 : 0;
    var rating = c.critical ? 'very high' : (c.high || 0) >= 2 ? 'high' : (c.high || c.medium >= 3) ? 'medium' : 'low';
    var tx = function (o) { return o && typeof o === 'object' ? (lang === 'fa' ? o.fa : o.en) : (o || ''); };
    var areas = {}; F.forEach(function (f) { var a = f.area.en; (areas[a] = areas[a] || []).push(f); });
    var keyRisks = Object.keys(areas).sort(function (a, b) { var s = { critical: 4, high: 3, medium: 2, low: 1, info: 0 }; return s[areas[b][0].sev] - s[areas[a][0].sev]; }).slice(0, 6).map(function (a) { var f = areas[a][0]; return { area: tx(f.area), risk: tx(f.title), assertion: ASSERT[a] || 'presentation', why: tx(f.evidence) || t('From the automated tests', 'از آزمون‌های خودکار') }; });
    var findings = F.filter(function (f) { return f.sev !== 'info'; }).map(function (f) { var d = DOCS[f.area.en]; return { area: tx(f.area), observation: tx(f.title), evidence: tx(f.evidence), severity: f.sev, questionForManagement: tx(f.q), documentsToRequest: d ? [t(d[0], d[1])] : [], suggestedRemedy: tx(f.act) }; });
    var adj = F.filter(function (f) { return (f.sev === 'critical' || f.sev === 'high') && /Receivables|Inventory|Tax|Going concern|Earnings quality|Revenue/.test(f.area.en); }).map(function (f) { return { item: tx(f.title), reason: tx(f.evidence), estimatedEffect: t('To quantify from the documents requested', 'پس از دریافت مستندات کمّی شود') }; });
    var gc = [], neg = D && D.equity[l] <= 0, loss = D && D.ni[l] < 0, cfoNeg = D && D.cfo && D.cfo[l] < 0;
    if (neg) gc.push(t('negative equity', 'حقوق مالکانهٔ منفی')); if (loss) gc.push(t('net loss', 'زیان خالص')); if (cfoNeg) gc.push(t('negative operating cash flow', 'جریان نقد عملیاتی منفی'));
    if (isFinite(q.currentRatio) && q.currentRatio < 1) gc.push(t('current ratio ' + q.currentRatio.toFixed(2), 'نسبت جاری ' + q.currentRatio.toFixed(2)));
    if (isFinite(q.z) && q.z < 1.1) gc.push(t('Altman Z″ ' + q.z.toFixed(2) + ' (distress zone)', 'Z″ آلتمن ' + q.z.toFixed(2) + ' (ناحیهٔ درماندگی)'));
    var goingConcern = gc.length ? t('Indicators present: ' + gc.join(', ') + '. Obtain a 12-month cash-flow forecast and financing commitments; consider an emphasis or modified opinion.', 'نشانه‌ها: ' + gc.join('، ') + '. پیش‌بینی جریان نقد ۱۲ ماهه و تعهدات تأمین مالی دریافت شود؛ بند تأکید یا اظهارنظر تعدیل‌شده بررسی شود.') : t('No going-concern indicator in the figures' + (isFinite(q.z) ? ' (Altman Z″ ' + q.z.toFixed(2) + ')' : '') + '.', 'در ارقام نشانهٔ تردید در تداوم فعالیت دیده نشد' + (isFinite(q.z) ? ' (Z″ آلتمن ' + q.z.toFixed(2) + ')' : '') + '.');
    var disc = [];
    if (notesText && notesText.replace(/\s/g, '').length > 500) NOTE_KEYS.forEach(function (k) { if (!k[2].test(notesText)) disc.push(t(k[0] + ': not found in the PDF text (verify)', k[1] + ': در متن PDF پیدا نشد (بررسی شود)')); });
    else disc.push(t('Notes not available as text: check the required disclosures manually (related parties, contingencies, subsequent events, tax, EPS, risk management).', 'یادداشت‌ها به‌صورت متن در دسترس نیست: افشاهای الزامی را دستی بررسی کنید (اشخاص وابسته، بدهی‌های احتمالی، رویدادهای بعد، مالیات، سود هر سهم، مدیریت ریسک).'));
    var overall = t('Rule-based review of ' + (D ? D.lines.IS.length + D.lines.BS.length + D.lines.CF.length : 0) + ' lines: ' + (c.critical || 0) + ' critical, ' + (c.high || 0) + ' high, ' + (c.medium || 0) + ' medium findings. Overall risk: ' + rating + '.', 'بررسی قاعده‌محور ' + (D ? D.lines.IS.length + D.lines.BS.length + D.lines.CF.length : 0) + ' سطر: ' + (c.critical || 0) + ' یافتهٔ بحرانی، ' + (c.high || 0) + ' زیاد و ' + (c.medium || 0) + ' متوسط. ریسک کلی: ' + ({ low: 'کم', medium: 'متوسط', high: 'زیاد', 'very high': 'خیلی زیاد' }[rating]) + '.');
    return faVals({ overallAssessment: overall, riskRating: rating, keyRisks: keyRisks, findings: findings, adjustmentsToConsider: adj, goingConcern: goingConcern, disclosureGaps: disc,
      questionsForManagement: uniq(findings.map(function (f) { return f.questionForManagement; }).filter(Boolean)).slice(0, 12),
      nextSteps: [t('Send the document request list to management', 'ارسال فهرست مستندات مورد نیاز به مدیریت'), t('Clear critical and high findings before relying on the figures', 'رفع یافته‌های بحرانی و زیاد پیش از اتکا به ارقام'), t('Re-run the review after adjustments', 'اجرای دوبارهٔ بررسی پس از تعدیلات')] }, lang);
  }

  /* ---------- financing solutions ---------- */
  function financing(S, R, lang) {
    var t = T(lang), q = S.q || {}, need = Number(q.need) || 0, PUR = { wc: t('working capital', 'سرمایه در گردش'), capex: t('machinery and equipment', 'ماشین‌آلات و تجهیزات'), project: t('a new project', 'طرح جدید'), refi: t('refinancing', 'بازتأمین بدهی'), acq: t('an acquisition', 'تملک'), repair: t('balance-sheet repair', 'اصلاح ترازنامه') }, U = Hub.util, f = function (x) { return U.fmtNum(x); }, p = function (x) { return isFinite(x) ? U.fmtPct(x, 1) : '–'; };
    var tx = function (o) { return o && typeof o === 'object' ? (lang === 'fa' ? o.fa : o.en) : (o || ''); };
    var list = (R.list || []).slice(), usable = list.filter(function (o) { return o.level !== 'no' && o.capacity > 0; });
    var order = { rec: 0, ok: 1, cond: 2 }; usable.sort(function (a, b) { return (order[a.level] - order[b.level]) || (a.costRate || 9) - (b.costRate || 9); });
    var left = need > 0 ? need : (usable[0] ? usable[0].capacity : 0), struct = [];
    usable.forEach(function (o) { if (left <= 0 || struct.length >= 3) return; var amt = Math.min(o.capacity, left); if (amt <= 0) return; left -= amt;
      struct.push({ instrument: tx(o.name), amount: f(amt), tenor: q.tenor + t(' years', ' سال'), rationale: o.why.slice(0, 3).map(tx).join(' '), conditions: o.level === 'cond' ? o.why.slice(3).map(tx).concat((R.gates || []).map(tx)).slice(0, 5) : [], indicativeCost: isFinite(o.costRate) ? p(o.costRate) : tx(o.cost) || '–' }); });
    var used = {}; struct.forEach(function (s) { used[s.instrument] = 1; });
    var cov = R.cov, D = R.D, l = D ? D.n - 1 : 0;
    var diag = t('EBITDA ' + f(R.ebitda) + ', net debt ' + f(R.nd) + (isFinite(cov) ? ', EBITDA / finance cost ' + cov.toFixed(1) + 'x' : '') + '. Room for new debt at your limits: ' + f(R.debtCap) + ' (leverage cap ' + f(R.capLev) + ', coverage cap ' + f(R.capCov) + '). ' + (R.gates && R.gates.length ? R.gates.length + ' gate(s) before a sukuk issue.' : 'No sukuk gate open.') + (R.negEq ? ' Negative equity.' : '') + (R.art141 ? ' Commercial Code art. 141 applies.' : ''),
      'EBITDA ' + f(R.ebitda) + '، بدهی خالص ' + f(R.nd) + (isFinite(cov) ? '، EBITDA / هزینهٔ مالی ' + cov.toFixed(1) + ' برابر' : '') + '. ظرفیت بدهی جدید با سقف‌های شما: ' + f(R.debtCap) + ' (سقف اهرم ' + f(R.capLev) + '، سقف پوشش ' + f(R.capCov) + '). ' + (R.gates && R.gates.length ? R.gates.length + ' شرط پیش از انتشار اوراق باید رفع شود.' : 'مانعی برای انتشار اوراق باز نیست.') + (R.negEq ? ' حقوق مالکانه منفی است.' : '') + (R.art141 ? ' مادهٔ ۱۴۱ قانون تجارت مشمول است.' : ''));
    var risks = [{ risk: t('Rate risk at refinancing', 'ریسک نرخ هنگام بازتأمین'), mitigation: t('Match tenor to the asset; avoid bullet maturities clustering', 'تطبیق سررسید با دارایی؛ پرهیز از تجمع سررسیدهای یکجا') }];
    if (isFinite(cov) && cov < 3) risks.push({ risk: t('Thin interest cover (' + cov.toFixed(1) + 'x)', 'پوشش هزینهٔ مالی کم (' + cov.toFixed(1) + ' برابر)'), mitigation: t('Smaller first issue, amortising principal, cash reserve', 'انتشار اول کوچک‌تر، بازپرداخت اقساطی، ذخیرهٔ نقدی') });
    if (R.K && isFinite(R.K.all) && R.K.all > R.K.loanEff) risks.push({ risk: t('Sukuk all-in cost above bank loan', 'هزینهٔ تمام‌شدهٔ اوراق بالاتر از تسهیلات بانکی'), mitigation: t('Negotiate fees; justify by tenor and size', 'مذاکره روی کارمزدها؛ توجیه با سررسید و حجم') });
    if (left > 0) risks.push({ risk: t('Unfunded gap of ' + f(left), 'کسری تأمین‌نشده ' + f(left)), mitigation: t('Equity (capital increase) or phase the project', 'افزایش سرمایه یا مرحله‌بندی طرح') });
    var procs = (Hub.sukukRules && Hub.sukukRules.PROCESS || []).slice(0, 8).map(function (s) { return { step: tx(s.step), timeline: tx(s.time) }; });
    return { diagnosis: diag, fundingNeed: (need > 0 ? '' : t('Amount needed not entered: the structure shows the capacity of the best route. ', 'مبلغ نیاز وارد نشده: ساختار، ظرفیت بهترین مسیر را نشان می‌دهد. ')) + t((need > 0 ? f(need) + ' ' : '') + 'for ' + (PUR[q.purpose] || q.purpose || '') + ', tenor ' + q.tenor + ' years', (need > 0 ? f(need) + ' ' : '') + 'برای ' + (PUR[q.purpose] || q.purpose || '') + '، مدت ' + q.tenor + ' سال'),
      recommendedStructure: struct.length ? struct : [{ instrument: t('None fits at your limits', 'با سقف‌های شما هیچ ابزاری مناسب نیست'), amount: '0', tenor: '', rationale: t('Fix leverage or relax limits deliberately; consider equity', 'اهرم را اصلاح کنید یا سقف‌ها را آگاهانه تغییر دهید؛ افزایش سرمایه را بررسی کنید'), conditions: [], indicativeCost: '–' }],
      alternatives: usable.filter(function (o) { return !used[tx(o.name)]; }).slice(0, 4).map(function (o) { return { instrument: tx(o.name), rationale: o.why.slice(0, 2).map(tx).join(' ') }; }),
      notSuitable: list.filter(function (o) { return o.level === 'no'; }).map(function (o) { return { instrument: tx(o.name), reason: o.why.slice(0, 2).map(tx).join(' ') }; }),
      preparationsNeeded: uniq((R.gates || []).map(tx).concat(list.filter(function (o) { return used[tx(o.name)] && o.docs; }).map(function (o) { return tx(o.docs); }))),
      roadmap: procs, risksAndMitigants: risks,
      regulatoryBasis: list.filter(function (o) { return used[tx(o.name)]; }).map(function (o) { return { instrument: tx(o.name), document: tx(o.basis), verifyWith: t('SEO (seo.ir) / IFB / CBI current text', 'متن جاری سازمان بورس (seo.ir) / فرابورس / بانک مرکزی') }; }),
      nextSteps: [t('Confirm the amounts with the adviser and guarantor', 'تأیید مبالغ با مشاور عرضه و ضامن'), t('Start the preparations list', 'شروع اقدامات آماده‌سازی'), t('Re-run after updating the statements', 'اجرای دوباره پس از به‌روزرسانی صورت‌ها')] };
  }

  Hub.localAI = { strategy: strategy, conclusion: conclusion, audit: audit, financing: financing, FRAMEWORKS: Object.keys(FWK) };
})(typeof window !== 'undefined' ? window : globalThis);
