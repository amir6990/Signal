/* =====================================================================
 * STRATEGY ENGINE — rule-based, transparent, works offline.
 *   1 intake      company text → extracted facts (with the sentence that shows it)
 *   2 diagnose    signals → problem archetypes → main problem, mode, data gaps
 *   3 select      2–5 frameworks chosen for THIS problem (and why others were not)
 *   4 analyse     each selected framework runs on the structured inputs
 *   5 solutions   36 strategic moves: gates (feasibility), economic vs executional
 *                 scores, weighted total, definitive / conditional / blocked / excluded
 *   6 architect   12 strategy architectures: guiding policy + pillars + enablers
 *   7 opportunities, roadmap, risk & sensitivity (weight profiles, unknown gates)
 * Rules: unknown never scores positive; a conflict with a hard constraint excludes;
 * no number is invented — economic effect only from your own inputs.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  var B = function () { return Hub.stratBank; };
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function num(v) { return v === null || v === undefined || v === '' ? NaN : Number(v); }
  function known(v) { return !(v === null || v === undefined || v === '' || v === 'unk' || (typeof v === 'number' && !isFinite(v))); }
  function gp(o, p) { return p.split('.').reduce(function (a, k) { return a == null ? undefined : a[k]; }, o); }
  function sp(o, p, v) { var ks = p.split('.'), last = ks.pop(), t = ks.reduce(function (a, k) { return a[k]; }, o); t[last] = v; }
  function pc(x) { return isFinite(x) ? fa(Math.round(x * 100)) + '٪' : 'نامشخص'; }
  function fa(n) { return String(n).replace(/\d/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[d]; }); }

  function defaults() {
    return { mode: 'auto', text: '',
      co: { name: '', industry: '', sector: 'unk', stage: 'unk', owner: 'unk', listed: 'unk', goal: 'unk', target: '', horizon: null, question: '' },
      mkt: { growth: 'unk', conc: 'unk', position: 'unk', share: null, rivalry: null, buyers: null, suppliers: null, entry: null, subs: null, priceCtl: 'unk', sanctions: 'unk', fxInputs: 'unk', inflPass: 'unk', disrupt: 'unk', cyclical: 'unk', stateRival: 'unk', exportOpen: 'unk', unmet: 'unk', regChange: 'unk' },
      cap: { rev: null, ebitda: null, revGrowth: null, gmTrend: 'unk', ebitdaM: null, peerM: null, util: null, custConc: null, exportSh: null, digital: null, innov: 'unk', mgmt: 'unk', exec: 'unk', cash: 'unk', align: 'unk', gov: 'unk', brand: 'unk', costPos: 'unk', diff: 'unk', recurring: 'unk', subs: 'unk' },
      res: [], units: [],
      cons: { control: 'unk', risk: 'unk', partner: 'unk', divest: 'unk', intl: 'unk', digitalAppetite: 'unk', capital: null, time: null, redLines: '' },
      W: { feas: 25, fit: 20, impact: 20, risk: 15, time: 10, moat: 10 },
      over: { pin: [], ex: [], fwPin: [], fwEx: [] }, up: {}, cases: [] };
  }
  function merge(d, e) { Object.keys(e || {}).forEach(function (k) { if (d[k] && typeof d[k] === 'object' && !Array.isArray(d[k]) && e[k] && typeof e[k] === 'object' && !Array.isArray(e[k])) d[k] = merge(d[k], e[k]); else d[k] = e[k]; }); return d; }

  /* ---------------- 1 · intake: text → facts ---------------- */
  function latin(s) { return String(s || '').replace(/[۰-۹]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'.indexOf(d); }).replace(/[٠-٩]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); }); }
  function norm(s) { return latin(s).replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[‌‏]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function sentences(s) { return norm(s).split(/(?<=[.!?؟])\s+|[;؛\n]+/).map(function (x) { return x.trim(); }).filter(function (x) { return x.length > 3; }); }
  var PCT = /(\d+(?:\.\d+)?)\s*(?:٪|%|درصد|percent)/i;
  // [field, value | function(match, sentence), regex, label]
  var RULES = [
    ['mkt.sanctions', 'yes', /تحریم|sanction/i, 'اثر تحریم'],
    ['mkt.priceCtl', 'yes', /قیمت ?گذاری دستوری|نرخ مصوب|قیمت مصوب|سازمان حمایت|ستاد تنظیم بازار|price control|regulated price/i, 'قیمت‌گذاری دستوری'],
    ['mkt.fxInputs', 'yes', /(مواد اولیه|نهاده|قطعات|ماده اولیه|رزین|پیگمنت|raw material|input)[^.]{0,50}(وارداتی|واردات|ارزی|import)|وابسته به (ارز|واردات)|ارز (نیمایی|تخصیصی|ترجیحی)|تخصیص ارز|FX allocation/i, 'نهادهٔ ارزبر'],
    ['mkt.exportOpen', 'yes', /صادرات|صادراتی|export/i, 'دسترسی به بازار صادراتی'],
    ['mkt.disrupt', 'yes', /(فین ?تک|استارتاپ|پلتفرم|آنلاین|دیجیتال|اپلیکیشن|fintech|platform|online|digital)[^.]{0,60}(سهم|مشتریان|تهدید|رقیب|رقبا|از دست|جذب|کاهش|threat|share|customers)|(سهم|مشتریان)[^.]{0,40}(به|را به) (رقبای )?(آنلاین|دیجیتال|پلتفرم|فین ?تک)/i, 'تهدید اختلال دیجیتال'],
    ['mkt.cyclical', 'yes', /چرخه ?ای|نوسان قیمت جهانی|قیمت جهانی|cyclical|commodity price/i, 'چرخه‌ای بودن قیمت/تقاضا'],
    ['mkt.stateRival', 'yes', /رقیب (دولتی|خصولتی)|رقبای (دولتی|خصولتی)|state-owned (competitor|rival)/i, 'رقیب دولتی/خصولتی'],
    ['mkt.regChange', 'yes', /حذف ارز (ترجیحی|نیمایی)|تغییر مقررات|مصوبه جدید|لایحه|new regulation|regulatory change/i, 'تغییر مقررات در راه'],
    ['mkt.unmet', 'yes', /نیاز (برآورده ?نشده|پاسخ ?داده ?نشده)|شکایت مشتریان|مشتریان ناراضی|غیرمشتری|unmet need|underserved|non-customers/i, 'نیاز برآورده‌نشده'],
    ['mkt.growth', 'high', /بازار[^.]{0,30}(پررشد|رشد (سریع|بالا|شتابان)|به سرعت (در حال )?رشد)|fast[- ]growing|high[- ]growth market/i, 'رشد بازار: بالا'],
    ['mkt.growth', 'low', /(رکود|اشباع|کاهش تقاضا|بازار (راکد|کوچک)|saturated|stagnant)/i, 'رشد بازار: پایین/رکود'],
    ['mkt.position', 'leader', /(بزرگ ?ترین|رهبر بازار|سهم اول|market leader|largest)/i, 'جایگاه: رهبر'],
    ['mkt.position', 'follower', /(بازیگر کوچک|سهم (کم|اندک)|small player)/i, 'جایگاه: پیرو'],
    ['mkt.share', function (m, s) { var x = s.match(/سهم بازار[^.]{0,25}?(\d+(?:\.\d+)?)\s*(?:٪|%|درصد)|(\d+(?:\.\d+)?)\s*(?:٪|%|درصد)\s*(?:از )?سهم بازار|market share[^.]{0,20}?(\d+(?:\.\d+)?)\s*%/i); return x ? Number(x[1] || x[2] || x[3]) / 100 : undefined; }, /سهم بازار|market share/i, 'سهم بازار'],
    ['cap.util', function (m, s) { var x = s.match(/(ظرفیت|بهره ?برداری|utili[sz]ation)[^.]{0,35}?(\d+(?:\.\d+)?)\s*(?:٪|%|درصد)/i); return x ? Number(x[2]) / 100 : undefined; }, /ظرفیت|بهره ?برداری|utili[sz]ation/i, 'بهره‌برداری از ظرفیت'],
    ['cap.custConc', function (m, s) { var x = s.match(/(\d+)\s*مشتری[^.]{0,40}?(\d+(?:\.\d+)?)\s*(?:٪|%|درصد)|top \d+ customers[^.]{0,30}?(\d+(?:\.\d+)?)\s*%/i); return x ? Number(x[2] || x[3]) / 100 : undefined; }, /مشتری|customers/i, 'تمرکز مشتریان'],
    ['cap.exportSh', function (m, s) { var x = s.match(/صادرات[^.]{0,30}?(\d+(?:\.\d+)?)\s*(?:٪|%|درصد)|(\d+(?:\.\d+)?)\s*(?:٪|%|درصد)[^.]{0,20}صادرات|export[^.]{0,20}?(\d+(?:\.\d+)?)\s*%/i); return x ? Number(x[1] || x[2] || x[3]) / 100 : undefined; }, /صادرات|export/i, 'سهم صادرات'],
    ['cap.gmTrend', 'down', /(حاشیه ?(ی )?سود|حاشیهٔ سود|margin)[^.]{0,50}(کاهش|افت|فشرده|کم شد|fell|declin|squeez)/i, 'روند حاشیه: نزولی'],
    ['cap.gmTrend', 'up', /(حاشیه ?(ی )?سود|حاشیهٔ سود|margin)[^.]{0,40}(افزایش|بهبود|rose|improv)/i, 'روند حاشیه: صعودی'],
    ['cap.cash', 'tight', /(کمبود نقدینگی|نقدینگی (ضعیف|تنگ)|مشکل نقدینگی|بدهی (سنگین|بالا)|liquidity (squeeze|problem)|heavy debt)/i, 'نقدینگی: تنگ'],
    ['co.stage', 'turnaround', /(زیان ?ده|زیان انباشته|زیان خالص|loss-making|accumulated loss)/i, 'مرحله: بحران/بازسازی'],
    ['co.stage', 'startup', /(استارتاپ|نوپا|تازه ?تأسیس|startup)/i, 'مرحله: نوپا'],
    ['cap.mgmt', 'weak', /(ضعف (مدیریت|حاکمیت)|حاکمیت شرکتی ضعیف|وابستگی به (مدیرعامل|بنیان ?گذار|یک نفر)|key[- ]person|weak governance)/i, 'توان مدیریت: ضعیف'],
    ['cap.align', 'no', /(ناهماهنگی|عدم هماهنگی|جزیره ?ای|silo|سازمان (کند|بوروکراتیک))/i, 'هم‌راستایی سازمان: ضعیف'],
    ['cap.digital', 2, /(سنتی|کاغذی|بدون سیستم|ERP ندارد|legacy system|paper-based)/i, 'بلوغ دیجیتال: پایین'],
    ['cap.diff', 'none', /(کالای (استاندارد|عمومی)|محصول (مشابه|یکسان) رقبا|کامودیتی|commodit)/i, 'تمایز محصول: ندارد'],
    ['cap.recurring', 'yes', /(اشتراک|قرارداد (بلندمدت|خدمات|نگهداری)|درآمد تکرارشونده|subscription|recurring revenue)/i, 'درآمد تکرارشونده دارد'],
    ['cap.subs', 'yes', /(هلدینگ|شرکت ?های (تابعه|زیرمجموعه)|زیرمجموعه|holding|subsidiar)/i, 'پرتفوی/شرکت تابعه'],
    ['co.owner', 'family', /خانوادگی|family[- ](owned|business)/i, 'مالکیت خانوادگی'],
    ['co.owner', 'semi', /خصولتی|شبه ?دولتی|صندوق بازنشستگی|بنیاد|semi-state/i, 'مالکیت خصولتی'],
    ['co.owner', 'state', /شرکت دولتی|state-owned company/i, 'مالکیت دولتی'],
    ['co.listed', 'ifb', /فرابورس|IFB/i, 'پذیرفته در فرابورس'],
    ['co.listed', 'tse', /بورس تهران|TSE main/i, 'پذیرفته در بورس تهران'],
    ['co.goal', 'ipo', /(عرضه ?(ی )?اولیه|ورود به بورس|پذیرش در (بورس|فرابورس)|IPO)/i, 'هدف: عرضهٔ اولیه'],
    ['co.goal', 'holding', /(بازآرایی|ساماندهی|بهینه ?سازی) (پرتفوی|سبد)|portfolio (review|restructur)/i, 'هدف: بازآرایی پرتفوی'],
    ['co.goal', 'digital', /(تحول دیجیتال|digital transformation)/i, 'هدف: تحول دیجیتال'],
    ['co.goal', 'growth', /(هدف|می ?خواه|قصد|برنامه|objective|aim|plan|target)[^.]{0,40}(دو برابر|رشد|افزایش فروش|double|grow)/i, 'هدف: رشد'],
    ['co.goal', 'profit', /(هدف|می ?خواه|قصد|برنامه|objective|aim)[^.]{0,40}(سودآوری|حاشیه|profitab|margin)/i, 'هدف: سودآوری'],
    ['co.goal', 'export', /(هدف|می ?خواه|قصد|برنامه|objective|aim)[^.]{0,40}(صادرات|بازار خارجی|export)/i, 'هدف: صادرات']
  ];
  var SECTOR = [['commodity', /فولاد|پتروشیمی|سیمان|مس|آلومینیوم|steel|petrochem|cement/i], ['consumer', /غذایی|لبنی|نوشیدنی|بهداشتی|آرایشی|FMCG|food|dairy/i], ['tech', /نرم ?افزار|پلتفرم|فناوری اطلاعات|اپلیکیشن|SaaS|software/i], ['finance', /بانک|بیمه|لیزینگ|کارگزاری|bank|insurance/i], ['retail', /خرده ?فروشی|فروشگاه|زنجیره ?ای|retail/i], ['health', /دارو|دارویی|تجهیزات پزشکی|pharma/i], ['construction', /ساختمان|انبوه ?سازی|پیمانکاری|construction/i], ['manufacturing', /تولیدی|کارخانه|صنعتی|قطعه ?سازی|manufactur/i], ['holding', /هلدینگ|holding/i]];
  function extract(text) {
    var out = [], seen = {};
    if (!String(text || '').trim()) return out;
    sentences(text).forEach(function (s) {
      RULES.forEach(function (r) {
        if (!r[2].test(s)) return;
        var v = typeof r[1] === 'function' ? r[1](null, s) : r[1]; if (v === undefined || (typeof v === 'number' && !isFinite(v))) return;
        if (seen[r[0]]) return; seen[r[0]] = 1;
        out.push({ k: r[0], v: v, ev: s.length > 180 ? s.slice(0, 179) + '…' : s, lab: r[3] });
      });
    });
    var t = norm(text); SECTOR.some(function (x) { if (x[1].test(t)) { out.push({ k: 'co.sector', v: x[0], ev: (t.match(x[1]) || [''])[0], lab: 'نوع صنعت' }); return true; } return false; });
    return out;
  }
  function effective(E) {
    var Ef = clone(E), prov = {}, X = extract(E.text), used = [];
    X.forEach(function (x) { var cur = gp(Ef, x.k); if (!known(cur)) { sp(Ef, x.k, x.v); prov[x.k] = 'text'; used.push(x); } else x.ignored = true; });
    return { Ef: Ef, prov: prov, X: X, used: used };
  }

  /* ---------------- 2 · diagnose ---------------- */
  var SIG = {
    margin: 'فشار بر حاشیهٔ سود', priceCtl: 'قیمت‌گذاری دستوری', fxIn: 'وابستگی نهاده‌ها به ارز', lowPass: 'ناتوانی در انتقال تورم به قیمت', slowMkt: 'بازار کم‌رشد یا راکد', declMkt: 'بازار در حال کوچک‌شدن', hiGrowth: 'بازار پررشد',
    weakPos: 'جایگاه رقابتی ضعیف', leader: 'رهبری بازار', commod: 'کالایی‌شدن محصول', strongForces: 'صنعت با نیروهای رقابتی قوی', buyerPow: 'قدرت بالای خریداران', supplierPow: 'قدرت بالای تأمین‌کنندگان', disrupt: 'تهدید اختلال فناورانه',
    idle: 'ظرفیت بلااستفاده', custConc: 'تمرکز بالای مشتریان', exportPot: 'ظرفیت صادراتی بهره‌برداری‌نشده', digitalGap: 'شکاف دیجیتال', weakOrg: 'ضعف سازمان، مدیریت یا اجرا', cashTight: 'محدودیت نقدینگی', uniqueRes: 'منبع متمایز و سخت‌تقلید',
    unexploited: 'منبع ارزشمند بهره‌برداری‌نشده', noDir: 'نبود هدف یا پرسش راهبردی روشن', growthAmb: 'جاه‌طلبی رشد', turnNeed: 'زیان یا بحران عملکرد', ipoGoal: 'هدف عرضهٔ اولیه', portfolio: 'پرتفوی چندکسب‌وکاری', sanction: 'اثر تحریم',
    unmet: 'نیاز برآورده‌نشدهٔ مشتری', noRecurring: 'نبود درآمد تکرارشونده', stateRival: 'رقیب دولتی/خصولتی', regChange: 'تغییر مقررات در راه', innovGap: 'ضعف نوآوری', cyclic: 'چرخه‌ای بودن قیمت/تقاضا', highCost: 'موقعیت هزینهٔ نامطلوب', weakBrand: 'برند ضعیف'
  };
  var WARCH = { core: { margin: 3, priceCtl: 2, fxIn: 1, lowPass: 2, strongForces: 2, buyerPow: 1, supplierPow: 1, highCost: 2 }, growth: { slowMkt: 3, growthAmb: 2, idle: 1, exportPot: 2, leader: 1, declMkt: 1 }, turn: { turnNeed: 5, cashTight: 2, margin: 1 },
    disrupt: { disrupt: 5, digitalGap: 2, declMkt: 1, innovGap: 1 }, pos: { commod: 3, weakPos: 2, unmet: 2, weakBrand: 1, strongForces: 1 }, dir: { noDir: 4 }, exec: { weakOrg: 3 }, port: { portfolio: 4 },
    unc: { sanction: 2, fxIn: 1, regChange: 2, cyclic: 2, priceCtl: 1 }, scale: { hiGrowth: 3, uniqueRes: 1 }, ipo: { ipoGoal: 5 } };
  var GOALS = [['unk', 'نامشخص'], ['none', 'هدف مشخصی ندارد'], ['growth', 'رشد درآمد و مقیاس'], ['profit', 'بهبود سودآوری'], ['cost', 'کاهش هزینه'], ['turnaround', 'خروج از بحران / بازسازی'], ['export', 'صادرات و بازار خارجی'], ['diversify', 'تنوع‌بخشی'], ['digital', 'تحول دیجیتال'], ['bizmodel', 'نوآوری در مدل کسب‌وکار'], ['defend', 'دفاع از سهم و جایگاه'], ['ipo', 'آمادگی عرضهٔ اولیه'], ['holding', 'بازآرایی پرتفوی / هلدینگ'], ['resilience', 'تاب‌آوری در برابر تحریم و نوسان']];
  var GOALMAP = { growth: [['growth', 4]], profit: [['core', 4]], cost: [['core', 4]], turnaround: [['turn', 4]], export: [['growth', 4]], diversify: [['growth', 3]], digital: [['disrupt', 3]], bizmodel: [['disrupt', 2], ['pos', 2]], defend: [['pos', 3], ['core', 1]], ipo: [['ipo', 2]], holding: [['port', 3]], resilience: [['unc', 4]] };
  function signals(Ef) {
    var m = Ef.mkt, c = Ef.cap, co = Ef.co, cs = Ef.cons, S = {};
    function add(id, sev, ev) { if (!S[id]) S[id] = { id: id, fa: SIG[id], sev: sev, ev: [] }; S[id].sev = Math.max(S[id].sev, sev); S[id].ev.push(ev); }
    var gm = num(c.ebitdaM), pm = num(c.peerM);
    if (c.gmTrend === 'down') add('margin', 2, 'روند حاشیهٔ سود نزولی است');
    if (isFinite(gm) && isFinite(pm) && gm < pm - 0.03) add('margin', 2, 'حاشیهٔ EBITDA ' + pc(gm) + ' کمتر از صنعت ' + pc(pm));
    if (isFinite(gm) && gm < 0) { if (co.stage === 'startup') add('cashTight', 2, 'زیان دورهٔ رشد (کسب‌وکار نوپا) — مصرف نقد'); else add('turnNeed', 3, 'حاشیهٔ EBITDA منفی است'); }
    if (m.priceCtl === 'yes') add('priceCtl', 2, 'محصول مشمول قیمت‌گذاری دستوری است');
    if (m.fxInputs === 'yes') add('fxIn', 2, 'نهاده‌های اصلی ارزبر یا وارداتی‌اند');
    if (m.inflPass === 'none' || m.inflPass === 'partial') add('lowPass', m.inflPass === 'none' ? 3 : 2, 'امکان انتقال تورم به قیمت: ' + (m.inflPass === 'none' ? 'ندارد' : 'جزئی'));
    if (m.priceCtl === 'yes' && m.fxInputs === 'yes' && m.inflPass !== 'full') add('margin', 2, 'ترکیب قیمت دستوری و نهادهٔ ارزبر');
    if (m.growth === 'low') add('slowMkt', 2, 'رشد بازار پایین است');
    if (m.growth === 'decline') { add('slowMkt', 3, 'بازار در حال کوچک‌شدن است'); add('declMkt', 3, 'بازار در حال کوچک‌شدن است'); }
    if (m.growth === 'high') add('hiGrowth', 2, 'بازار پررشد است');
    if (m.position === 'follower') add('weakPos', 2, 'جایگاه پیرو در بازار');
    if (m.position === 'leader') add('leader', 2, 'رهبر بازار');
    if (c.diff === 'none') add('commod', 2, 'محصول تمایز قابل‌درکی ندارد');
    if (num(m.rivalry) >= 4 && c.diff !== 'high') add('commod', 2, 'رقابت شدید (' + fa(m.rivalry) + ' از ۵) بدون تمایز بالا');
    var F = forces(Ef), kn = F.filter(function (f) { return isFinite(f.v); });
    if (kn.length >= 3) { var avg = kn.reduce(function (a, f) { return a + f.v; }, 0) / kn.length; if (avg >= 3.5) add('strongForces', 2, 'میانگین شدت نیروهای رقابتی ' + fa(avg.toFixed(1)) + ' از ۵'); }
    if (num(m.buyers) >= 4 || num(c.custConc) >= 0.4) add('buyerPow', 2, isFinite(num(c.custConc)) && num(c.custConc) >= 0.4 ? 'سهم مشتریان بزرگ از فروش ' + pc(num(c.custConc)) : 'قدرت چانه‌زنی خریداران بالاست');
    if (num(c.custConc) >= 0.4) add('custConc', num(c.custConc) >= 0.6 ? 3 : 2, 'تمرکز مشتریان ' + pc(num(c.custConc)));
    if (num(m.suppliers) >= 4) add('supplierPow', 2, 'قدرت چانه‌زنی تأمین‌کنندگان بالاست');
    if (m.disrupt === 'yes') add('disrupt', 3, 'تهدید اختلال فناورانه گزارش شده است');
    if (num(c.util) < 0.7) add('idle', num(c.util) < 0.55 ? 3 : 2, 'بهره‌برداری از ظرفیت ' + pc(num(c.util)));
    if (m.exportOpen === 'yes' && !(num(c.exportSh) >= 0.25) && Ef.cons.intl !== 'no') add('exportPot', 2, 'بازار صادراتی در دسترس' + (isFinite(num(c.exportSh)) ? ' و سهم صادرات ' + pc(num(c.exportSh)) : ''));
    if (num(c.digital) <= 2) add('digitalGap', 2, 'بلوغ دیجیتال ' + fa(c.digital) + ' از ۵');
    if (c.mgmt === 'weak') add('weakOrg', 3, 'توان مدیریت ضعیف');
    if (c.align === 'no') add('weakOrg', 2, 'سازمان با راهبرد هم‌راستا نیست');
    if (c.exec === 'poor') add('weakOrg', 2, 'سابقهٔ اجرای ضعیف');
    if (c.cash === 'tight') add('cashTight', 2, 'نقدینگی تنگ');
    if (co.stage === 'turnaround' || co.stage === 'decline') add('turnNeed', 3, 'مرحلهٔ ' + (co.stage === 'turnaround' ? 'بحران / زیان' : 'افول'));
    if (co.goal === 'turnaround') add('turnNeed', 2, 'هدف اعلام‌شده: بازسازی');
    var R = vrioRes(Ef);
    if (R.some(function (r) { return r.cls === 'sus'; })) add('uniqueRes', 2, 'منبع پایدار: ' + R.filter(function (r) { return r.cls === 'sus'; }).map(function (r) { return r.name; }).join('، '));
    var un = R.filter(function (r) { return r.cls === 'pot' || ((r.use === 'idle' || r.use === 'under') && r.v === 'yes'); });
    if (un.length) add('unexploited', 2, 'بهره‌برداری‌نشده: ' + un.map(function (r) { return r.name; }).join('، '));
    if ((co.goal === 'unk' || co.goal === 'none') && !String(co.question || '').trim()) add('noDir', co.goal === 'none' ? 3 : 2, 'هدف و پرسش راهبردی تعریف نشده است');
    if (['growth', 'export', 'diversify', 'ipo'].indexOf(co.goal) >= 0) add('growthAmb', 2, 'هدف اعلام‌شده: ' + goalFa(co.goal));
    if (co.goal === 'ipo') add('ipoGoal', 3, 'هدف اعلام‌شده: عرضهٔ اولیه');
    if (Ef.cap.subs === 'yes' || (Ef.units || []).length >= 2 || co.sector === 'holding') add('portfolio', 2, 'شرکت دارای پرتفوی کسب‌وکارها/تابعه‌ها است');
    if (m.sanctions === 'yes') add('sanction', 3, 'تحریم بر تأمین، فروش یا انتقال وجه اثر دارد');
    if (m.unmet === 'yes') add('unmet', 2, 'نیاز برآورده‌نشدهٔ مشتری شناسایی شده');
    if (c.recurring === 'no') add('noRecurring', 1, 'درآمد تکرارشونده ندارد');
    if (m.stateRival === 'yes') add('stateRival', 2, 'رقیب دولتی یا خصولتی فعال است');
    if (m.regChange === 'yes') add('regChange', 2, 'تغییر مقررات در راه است');
    if (c.innov === 'none') add('innovGap', 2, 'توان نوآوری ندارد');
    if (m.cyclical === 'yes') add('cyclic', 2, 'قیمت یا تقاضا چرخه‌ای است');
    if (c.costPos === 'high') add('highCost', 2, 'هزینهٔ تمام‌شده بالاتر از رقبا');
    if (c.brand === 'weak') add('weakBrand', 1, 'برند ضعیف');
    return S;
  }
  function goalFa(g) { return (GOALS.filter(function (x) { return x[0] === g; })[0] || ['', 'نامشخص'])[1]; }
  function archScores(Ef, S) {
    var A = {}; Object.keys(B().ARCH).forEach(function (a) { A[a] = 0; });
    Object.keys(WARCH).forEach(function (a) { Object.keys(WARCH[a]).forEach(function (s) { if (S[s]) A[a] += WARCH[a][s] * (S[s].sev >= 3 ? 1.25 : 1); }); });
    var g = Ef.co.goal; (GOALMAP[g] || []).forEach(function (x) { var t = x[0]; if (t === 'growth' && S.hiGrowth) t = 'scale'; A[t] += x[1]; });
    return A;
  }

  /* ---------------- helpers shared by analysers ---------------- */
  var FORCES = [['entry', 'تهدید ورود رقبای جدید'], ['suppliers', 'قدرت تأمین‌کنندگان'], ['buyers', 'قدرت خریداران'], ['subs', 'تهدید جایگزین‌ها'], ['rivalry', 'شدت رقابت میان رقبا']];
  function forces(Ef) {
    var m = Ef.mkt, c = Ef.cap;
    return FORCES.map(function (f) {
      var v = num(m[f[0]]), basis = 'ورودی شما';
      if (!isFinite(v) && f[0] === 'buyers' && isFinite(num(c.custConc))) { v = num(c.custConc) >= 0.6 ? 5 : num(c.custConc) >= 0.4 ? 4 : num(c.custConc) >= 0.25 ? 3 : 2; basis = 'مشتق از تمرکز مشتریان (' + pc(num(c.custConc)) + ') — قاعدهٔ هاب'; }
      if (!isFinite(v) && f[0] === 'suppliers' && m.fxInputs === 'yes') { v = 4; basis = 'مشتق از وابستگی نهاده‌ها به ارز/واردات — قاعدهٔ هاب'; }
      if (!isFinite(v)) basis = 'نیازمند بررسی';
      return { id: f[0], fa: f[1], v: v, basis: basis };
    });
  }
  function vrioRes(Ef) {
    return (Ef.res || []).filter(function (r) { return String(r.name || '').trim(); }).map(function (r) {
      var cls, lab;
      if (r.v === 'no') { cls = 'dis'; lab = 'نقص رقابتی (ارزشمند نیست)'; }
      else if (r.v !== 'yes') { cls = 'unk'; lab = 'نامشخص — ارزشمندی بررسی نشده'; }
      else if (r.r === 'no') { cls = 'par'; lab = 'برابری رقابتی'; }
      else if (r.r !== 'yes') { cls = 'unk'; lab = 'نامشخص — کمیابی بررسی نشده'; }
      else if (r.i === 'no') { cls = 'tmp'; lab = 'مزیت موقت'; }
      else if (r.i !== 'yes') { cls = 'unk'; lab = 'نامشخص — تقلیدپذیری بررسی نشده'; }
      else if (r.o === 'yes') { cls = 'sus'; lab = 'مزیت رقابتی پایدار'; }
      else { cls = 'pot'; lab = 'مزیت بالقوهٔ بهره‌برداری‌نشده (سازمان آماده نیست)'; }
      return { name: r.name, type: r.type, v: r.v, use: r.use, cls: cls, lab: lab };
    });
  }
  function coverage(Ef, keys) {
    var k = 0, miss = [];
    keys.forEach(function (key) { var v = key === 'res' ? (Ef.res || []).filter(function (r) { return r.name; }).length : key === 'units' ? (Ef.units || []).filter(function (r) { return r.name; }).length : gp(Ef, key); if (key === 'res' || key === 'units' ? v > 0 : known(v)) k++; else miss.push(B().KEYS[key] || key); });
    return { share: keys.length ? k / keys.length : 1, miss: miss };
  }
  function L(ids, R) { return ids.map(function (id) { var r = R && R.byId[id]; return r ? r.s.fa + (r.label === 'excluded' ? ' (حذف به‌دلیل محدودیت)' : '') : (B().sol(id) || {}).fa; }).filter(Boolean); }

  /* ---------------- 4 · framework analysers ---------------- */
  var ANA = {
    five: function (Ef, X) {
      var F = forces(Ef), kn = F.filter(function (f) { return isFinite(f.v); }), avg = kn.length ? kn.reduce(function (a, f) { return a + f.v; }, 0) / kn.length : NaN, top = kn.slice().sort(function (a, b) { return b.v - a.v; })[0];
      var m = Ef.mkt, st = [m.priceCtl === 'yes' ? 'قیمت‌گذاری دستوری' : null, m.stateRival === 'yes' ? 'رقیب دولتی/خصولتی' : null, m.sanctions === 'yes' ? 'تحریم' : null, m.fxInputs === 'yes' ? 'تخصیص/نرخ ارز' : null].filter(Boolean);
      var rows = F.map(function (f) { return [f.fa, isFinite(f.v) ? fa(f.v) + ' از ۵' : 'نامشخص', f.basis]; }).concat([['دولت و مقررات (نیروی ششم عملی در ایران)', st.length ? 'فعال' : 'نامشخص', st.join('، ') || 'نیازمند بررسی']]);
      var map = { buyers: ['S05', 'S34', 'S15'], suppliers: ['S03', 'S04'], rivalry: ['S09', 'S10', 'S02'], entry: ['S36', 'S34'], subs: ['S11', 'S09'] };
      var impl = kn.filter(function (f) { return f.v >= 4; }).map(function (f) { return 'کاهش اثر «' + f.fa + '»: ' + L(map[f.id], X.R).join('، '); });
      return { v: kn.length < 3 ? 'دادهٔ کافی برای داوری جذابیت صنعت نیست (' + fa(kn.length) + ' نیرو از ۵ معلوم).' : 'جذابیت صنعت: ' + (avg >= 3.5 ? 'پایین' : avg >= 2.5 ? 'متوسط' : 'بالا') + ' (میانگین ' + fa(avg.toFixed(1)) + ' از ۵)؛ نیروی غالب: ' + top.fa + '.', rows: rows, head: ['نیرو', 'شدت', 'مبنا'], impl: impl.length ? impl : ['هیچ نیرویی با شدت ۴ یا ۵ ثبت نشده است.'] };
    },
    pestle: function (Ef) {
      var m = Ef.mkt, c = Ef.cap, row = function (d, items) { var k = items.filter(function (x) { return x[1] !== null; }); var thr = k.filter(function (x) { return x[1] === 't'; }).length, op = k.filter(function (x) { return x[1] === 'o'; }).length; return [d, k.length ? (thr > op ? 'تهدید' : op > thr ? 'فرصت' : 'دوسویه') : 'نیازمند بررسی', k.map(function (x) { return x[0]; }).join('؛ ') || '—']; };
      var t = function (cond, txt, dir) { return cond === undefined ? [txt, null] : cond ? [txt, dir] : [txt, null]; };
      var rows = [row('سیاسی', [t(m.sanctions === 'yes', 'تحریم', 't'), t(m.stateRival === 'yes', 'حضور رقیب دولتی', 't')]),
        row('اقتصادی', [t(m.fxInputs === 'yes', 'نوسان و تخصیص ارز نهاده‌ها', 't'), t(m.inflPass === 'none' || m.inflPass === 'partial', 'تورم بالا با انتقال ناقص به قیمت', 't'), t(m.inflPass === 'full', 'امکان انتقال تورم به قیمت', 'o'), t(m.cyclical === 'yes', 'چرخهٔ قیمت/تقاضا', 't'), t(m.growth === 'high', 'رشد بازار', 'o'), t(m.growth === 'low' || m.growth === 'decline', 'رکود بازار', 't')]),
        row('اجتماعی', [t(m.unmet === 'yes', 'نیاز برآورده‌نشده / تغییر رفتار مشتری', 'o')]),
        row('فناوری', [t(m.disrupt === 'yes', 'اختلال فناورانه', 't'), t(num(c.digital) >= 4, 'بلوغ دیجیتال بالا', 'o')]),
        row('حقوقی و مقرراتی', [t(m.priceCtl === 'yes', 'قیمت‌گذاری دستوری', 't'), t(m.regChange === 'yes', 'تغییر مقررات در راه', 't')]),
        ['زیست‌محیطی', 'نیازمند بررسی', 'الزامات محیط‌زیست، انرژی و آب در فرم ثبت نمی‌شود؛ جداگانه بررسی شود']];
      var hi = rows.filter(function (r) { return r[1] === 'تهدید'; }).map(function (r) { return r[0]; });
      return { v: hi.length ? 'ابعاد غالب تهدید: ' + hi.join('، ') + '. پیش از تعهد به رشد، سپر ریسک بسازید.' : 'تهدید کلان غالبی با داده‌های فعلی دیده نمی‌شود.', rows: rows, head: ['بُعد', 'جهت', 'عوامل'], impl: hi.length ? ['ورود محورهای پرعدم‌قطعیت به برنامه‌ریزی سناریو', 'برنامهٔ تاب‌آوری: ' + L(['S28', 'S04', 'S29'], null).join('، ')] : [] };
    },
    swot: function (Ef, X) {
      var c = Ef.cap, m = Ef.mkt, S = X.S, Rv = vrioRes(Ef);
      var s = [m.position === 'leader' && 'رهبری بازار', c.brand === 'strong' && 'برند قوی', c.costPos === 'low' && 'هزینهٔ تمام‌شدهٔ پایین‌تر از رقبا', c.diff === 'high' && 'محصول متمایز', c.mgmt === 'strong' && 'مدیریت قوی', c.cash === 'strong' && 'نقدینگی قوی', c.recurring === 'yes' && 'درآمد تکرارشونده', num(c.exportSh) >= 0.2 && 'سابقهٔ صادرات'].filter(Boolean).concat(Rv.filter(function (r) { return r.cls === 'sus' || r.cls === 'tmp'; }).map(function (r) { return 'منبع: ' + r.name; }));
      var w = ['margin', 'weakPos', 'highCost', 'commod', 'weakOrg', 'cashTight', 'digitalGap', 'custConc', 'weakBrand', 'innovGap'].filter(function (k) { return S[k]; }).map(function (k) { return SIG[k]; });
      var o = ['hiGrowth', 'exportPot', 'unmet', 'idle', 'unexploited'].filter(function (k) { return S[k]; }).map(function (k) { return SIG[k]; });
      var t = ['disrupt', 'sanction', 'priceCtl', 'fxIn', 'strongForces', 'declMkt', 'stateRival', 'cyclic', 'regChange'].filter(function (k) { return S[k]; }).map(function (k) { return SIG[k]; });
      var sd = s.length - w.length, od = o.length - t.length, ori = sd >= 0 && od >= 0 ? 'تهاجمی (SO)' : sd >= 0 ? 'رقابتی / تنوعی (ST)' : od >= 0 ? 'بازسازی و محافظه‌کارانه (WO)' : 'تدافعی (WT)';
      var R = X.R, pick = function (ids) { return L(ids.filter(function (id) { var r = R.byId[id]; return r && r.label !== 'na' && r.label !== 'excluded'; }), R).join('، ') || '—'; };
      return { v: 'جهت‌گیری غالب: ' + ori + ' — ' + fa(s.length) + ' قوت، ' + fa(w.length) + ' ضعف، ' + fa(o.length) + ' فرصت، ' + fa(t.length) + ' تهدید.', head: ['خانه', 'موارد / راهبردها'],
        rows: [['قوت‌ها', s.join('؛ ') || 'ثبت نشده'], ['ضعف‌ها', w.join('؛ ') || 'ثبت نشده'], ['فرصت‌ها', o.join('؛ ') || 'ثبت نشده'], ['تهدیدها', t.join('؛ ') || 'ثبت نشده'],
          ['SO — قوت برای فرصت', pick(['S06', 'S07', 'S36', 'S08'])], ['ST — قوت در برابر تهدید', pick(['S09', 'S03', 'S28'])], ['WO — رفع ضعف با فرصت', pick(['S02', 'S26', 'S17', 'S31'])], ['WT — دفاع', pick(['S22', 'S32', 'S20', 'S23'])]], impl: [] };
    },
    vrio: function (Ef) {
      var R = vrioRes(Ef);
      if (!R.length) return { v: 'منبعی ثبت نشده است؛ بدون فهرست منابع، مزیت پایدار قابل داوری نیست.', rows: [], head: ['منبع', 'نتیجه'], impl: [] };
      var sus = R.filter(function (r) { return r.cls === 'sus'; }), pot = R.filter(function (r) { return r.cls === 'pot'; });
      return { v: fa(sus.length) + ' منبع مزیت پایدار و ' + fa(pot.length) + ' منبع بهره‌برداری‌نشده.', head: ['منبع', 'نوع', 'نتیجهٔ VRIO', 'وضع استفاده'], rows: R.map(function (r) { return [r.name, r.type || '—', r.lab, { used: 'در استفاده', under: 'کم‌استفاده', idle: 'بلااستفاده' }[r.use] || 'نامشخص']; }),
        impl: sus.map(function (r) { return 'حفظ و تقویت: ' + r.name; }).concat(pot.map(function (r) { return 'سازمان‌دهی برای بهره‌برداری: ' + r.name; })) };
    },
    ansoff: function (Ef, X) {
      var S = X.S, m = Ef.mkt, c = Ef.cap, cs = Ef.cons;
      var q = [['نفوذ در بازار', 2 + (S.hiGrowth ? 2 : 0) + (S.idle ? 1 : 0) - (S.slowMkt ? 1 : 0) - (m.position === 'leader' ? 1 : 0), 'S06'],
        ['توسعهٔ بازار (صادرات/جغرافیا)', cs.intl === 'no' ? 0 : (m.exportOpen === 'yes' ? 3 : m.exportOpen === 'no' ? 0 : 1) + (S.idle ? 1 : 0) + (S.slowMkt ? 1 : 0), 'S07'],
        ['توسعهٔ محصول', 1 + (S.unmet ? 2 : 0) + (c.innov === 'strong' ? 1 : 0) + (c.brand === 'strong' ? 1 : 0), 'S08'],
        ['تنوع‌بخشی', 1 + (c.subs === 'yes' ? 1 : 0) + (cs.risk === 'high' ? 1 : 0) + (c.cash === 'strong' ? 1 : 0) - (cs.risk === 'low' ? 2 : 0) - (S.turnNeed ? 2 : 0), 'S18']].map(function (x) { x[1] = Math.max(0, Math.min(5, x[1])); return x; });
      var best = q.slice().sort(function (a, b) { return b[1] - a[1]; })[0];
      return { v: 'مسیر مقدم رشد: ' + best[0] + ' (تناسب ' + fa(best[1]) + ' از ۵). مسیرهای پرریسک‌تر پس از نتیجه‌گرفتن.', head: ['خانه', 'تناسب (۰–۵)', 'راهکار متناظر'], rows: q.map(function (x) { return [x[0], fa(x[1]), L([x[2]], X.R)[0]]; }), impl: cs.intl === 'no' ? ['توسعهٔ بازار خارجی به‌دلیل محدودیت شما کنار گذاشته شد.'] : [] };
    },
    kernel: function (Ef, X) {
      var A = X.archMain, top = X.sigList.slice(0, 3).map(function (s) { return s.fa + ' (' + s.ev[0] + ')'; });
      var flags = [];
      if (Ef.co.goal === 'unk' || Ef.co.goal === 'none') flags.push('هدفی تعریف نشده؛ بدون هدف نزدیک، راهبرد به فهرست آرزو تبدیل می‌شود.');
      if (/\d/.test(latin(Ef.co.target || '')) && !String(Ef.co.question || '').trim()) flags.push('هدف عددی است اما «چگونه» تعریف نشده — هدف با راهبرد اشتباه گرفته شده.');
      if (!String(Ef.co.question || '').trim()) flags.push('پرسش راهبردی ثبت نشده است.');
      var acts = A ? A.picks.map(function (p) { return p.r.s.fa; }) : [];
      return { v: 'چالش اصلی: ' + B().ARCH[X.main][0] + '.', head: ['جزء', 'محتوا'],
        rows: [['تشخیص', B().ARCH[X.main][0] + (top.length ? ' — شواهد: ' + top.join('؛ ') : '')], ['سیاست راهنما', A ? A.a.policy : '—'], ['اقدامات منسجم', acts.join('؛ ') || '—'], ['هدف نزدیک', A && A.picks[0] ? 'بهبود «' + A.picks[0].r.s.kpi[0] + '» در افق ' + fa(A.picks[0].r.s.tm[1]) + ' ماه (هدف عددی را شما تعیین کنید)' : '—'], ['نشانه‌های راهبرد بد', flags.join(' ') || 'نشانه‌ای دیده نشد']], impl: flags };
    },
    blue: function (Ef, X) {
      var S = X.S, c = Ef.cap;
      var e = [S.margin && 'محصولات/مشتریان زیان‌ده که ارزش متمایزی نمی‌سازند'].filter(Boolean), r = [S.highCost && 'تنوع کم‌ارزش محصول و لایه‌های هزینه‌زا', c.diff === 'high' && S.buyerPow && 'ویژگی‌هایی که مشتری بابت آن پول نمی‌دهد'].filter(Boolean),
        ra = [(S.buyerPow || S.sanction || S.fxIn) && 'اطمینان و پیوستگی تأمین', S.commod && 'خدمت فنی و پشتیبانی', S.custConc && 'تنوع کانال دسترسی'].filter(Boolean),
        cr = [S.unmet && 'پاسخ به نیاز برآورده‌نشدهٔ شناسایی‌شده', S.noRecurring && 'بستهٔ خدمت/اشتراک', S.digitalGap && 'سفارش و پیگیری دیجیتال', S.cashTight && false].filter(Boolean);
      var conf = Ef.mkt.unmet === 'yes' ? 'متوسط' : 'پایین — شناخت غیرمشتریان لازم است';
      return { v: 'پیشنهاد اولیهٔ ERRC (اطمینان: ' + conf + '). عوامل بوم باید با مصاحبهٔ مشتری تأیید شود.', head: ['اقدام', 'عوامل پیشنهادی'], rows: [['حذف', e.join('؛ ') || 'نیازمند بررسی'], ['کاهش', r.join('؛ ') || 'نیازمند بررسی'], ['افزایش', ra.join('؛ ') || 'نیازمند بررسی'], ['خلق', cr.join('؛ ') || 'نیازمند بررسی']], impl: ['بوم کامل در ابزار «Blue Ocean» هاب'] };
    },
    ptw: function (Ef, X) {
      var c = Ef.cap, m = Ef.mkt, Rv = vrioRes(Ef), A = X.archMain;
      var how = c.costPos === 'low' && c.diff !== 'high' ? 'رهبری هزینه' : c.diff === 'high' ? 'تمایز' : m.position === 'niche' ? 'تمرکز بر بخش' : 'انتخاب نشده — شرکت باید میان هزینه و تمایز انتخاب کند';
      var where = [m.position !== 'unk' ? 'جایگاه فعلی: ' + ({ leader: 'رهبر', challenger: 'چالشگر', follower: 'پیرو', niche: 'تمرکز بر بخش' }[m.position]) : null, Ef.mkt.exportOpen === 'yes' && Ef.cons.intl !== 'no' ? 'داخلی + صادرات منطقه‌ای' : 'بازار داخلی', Ef.co.industry || null].filter(Boolean).join(' · ');
      var wmbt = A ? [].concat.apply([], A.picks.map(function (p) { return p.r.gates.filter(function (g) { return g.r === 'unk'; }).map(function (g) { return g.n + ' (برای ' + p.r.s.fa + ')'; }); })).concat(A.picks.map(function (p) { return p.r.s.pre[0]; })) : [];
      return { v: 'شیوهٔ بردن: ' + how + '.', head: ['انتخاب', 'محتوا'], rows: [['آرمان بردن', Ef.co.target || goalFa(Ef.co.goal)], ['حوزهٔ بازی', where], ['شیوهٔ بردن', how], ['قابلیت‌های لازم', Rv.filter(function (r) { return r.cls === 'sus' || r.cls === 'pot'; }).map(function (r) { return r.name; }).join('، ') || 'منبع متمایزی ثبت نشده'], ['نظام‌های مدیریتی', (c.align === 'yes' ? 'هم‌راستا' : 'نیاز به نظام اجرای راهبرد (BSC/OKR)') + (num(c.digital) <= 2 ? '؛ دادهٔ مدیریتی ضعیف' : '')], ['چه باید درست باشد', wmbt.slice(0, 6).join('؛ ') || '—']], impl: [] };
    },
    bmc: function (Ef, X) {
      var c = Ef.cap, S = X.S, st = function (bad, good, unk) { return unk ? 'نامشخص' : bad ? 'ضعیف' : good ? 'قوی' : 'متوسط'; };
      var rows = [['بخش‌های مشتری', st(S.custConc, num(c.custConc) < 0.25, !isFinite(num(c.custConc))), S.custConc ? 'وابستگی به چند مشتری' : ''],
        ['پیشنهاد ارزش', st(c.diff === 'none', c.diff === 'high', c.diff === 'unk'), ''], ['کانال‌ها', st(num(c.digital) <= 2, num(c.digital) >= 4, !isFinite(num(c.digital))), ''],
        ['رابطه با مشتری و جریان درآمد', st(c.recurring === 'no', c.recurring === 'yes', c.recurring === 'unk'), c.recurring === 'no' ? 'درآمد یک‌باره' : ''],
        ['منابع کلیدی', st(false, S.uniqueRes, !(Ef.res || []).length), ''], ['فعالیت‌های کلیدی', st(S.idle, num(c.util) >= 0.85, !isFinite(num(c.util))), S.idle ? 'ظرفیت بلااستفاده' : ''],
        ['شرکای کلیدی', Ef.cons.partner === 'no' ? 'محدود (به انتخاب شما)' : 'نامشخص', ''], ['ساختار هزینه', st(c.costPos === 'high', c.costPos === 'low', c.costPos === 'unk'), S.fxIn ? 'هزینهٔ ارزبر' : '']];
      var weak = rows.filter(function (r) { return r[1] === 'ضعیف'; });
      return { v: weak.length ? 'ضعیف‌ترین بلوک‌ها: ' + weak.map(function (r) { return r[0]; }).join('، ') + '.' : 'بلوک ضعیف مشخصی با داده‌های فعلی دیده نشد.', head: ['بلوک', 'وضعیت', 'شاهد'], rows: rows, impl: weak.length ? ['بازطراحی: ' + L(['S11', 'S05', 'S12'], X.R).join('، ')] : [] };
    },
    vpc: function (Ef, X) {
      var S = X.S;
      var pains = [S.buyerPow && 'فشار قیمت و شرایط پرداخت', (S.sanction || S.fxIn) && 'ریسک وقفهٔ تأمین', S.commod && 'نبود تفاوت میان عرضه‌کنندگان'].filter(Boolean);
      return { v: Ef.mkt.unmet === 'yes' ? 'شکاف تطابق وجود دارد؛ نیاز برآورده‌نشده نقطهٔ شروع بازطراحی پیشنهاد است.' : 'بدون مصاحبهٔ مشتری تطابق قابل داوری نیست (نیازمند بررسی).', head: ['جزء', 'محتوا'],
        rows: [['دردهای محتمل مشتری (فرضیه)', pains.join('؛ ') || 'نیازمند بررسی'], ['تسکین‌دهنده‌های پیشنهادی', L(['S34', 'S09', 'S04'], X.R).join('؛ ')], ['آزمون', '۱۵ تا ۲۰ مصاحبه با مشتریان فعلی و از دست‌رفته (پیشنهاد روش، نه داده)']], impl: [] };
    },
    jtbd: function (Ef) {
      return { v: Ef.mkt.unmet === 'yes' ? 'نیاز برآورده‌نشده گزارش شده؛ برای تعریف دقیق «کار» و پیامدهای کم‌خدمت پژوهش کیفی لازم است.' : 'شاهدی از کار مشتری ثبت نشده؛ این چارچوب در این مرحله برنامهٔ پژوهش می‌دهد نه نتیجه.', head: ['گام', 'شرح'],
        rows: [['۱. تعریف کار اصلی', 'مشتری محصول را برای انجام چه کاری «استخدام» می‌کند؟ (در B2B ایران اغلب: کاهش ریسک تأمین، تأمین مالی خرید، تحویل به‌موقع)'], ['۲. مصاحبه', 'مصاحبه با خریداران اخیر و منصرف‌شده'], ['۳. پیامدهای مطلوب', 'فهرست پیامدها با فعل + معیار'], ['۴. اولویت', 'اهمیت بالا × رضایت پایین = فرصت'], ['۵. تبدیل به ایده', 'پیوند با توسعهٔ محصول و نوآوری ارزش']], impl: [] };
    },
    h3: function (Ef, X) {
      var top = X.R.list.filter(function (r) { return r.label !== 'na' && r.label !== 'excluded'; }).sort(function (a, b) { return b.sc.total - a.sc.total; }).slice(0, 9);
      var by = { 1: [], 2: [], 3: [] }; top.forEach(function (r) { by[r.s.H].push(r.s.fa); });
      var warn = !by[2].length && !by[3].length ? 'همهٔ ابتکارهای برتر در افق ۱‌اند؛ موتور رشد آینده تعریف نشده.' : !by[1].length ? 'هستهٔ فعلی ابتکاری ندارد؛ نقدینگی لازم برای افق‌های بعدی در خطر است.' : 'توازن افق‌ها قابل قبول است.';
      return { v: warn, head: ['افق', 'ابتکارها'], rows: [['افق ۱ — دفاع و گسترش هسته', by[1].join('؛ ') || '—'], ['افق ۲ — کسب‌وکارهای نوظهور', by[2].join('؛ ') || '—'], ['افق ۳ — گزینه‌های آینده', by[3].join('؛ ') || '—']], impl: [] };
    },
    sevens: function (Ef) {
      var c = Ef.cap, g = function (bad, ok) { return bad ? 'زیاد' : ok ? 'کم' : 'نیازمند بررسی'; };
      var rows = [['راهبرد', Ef.co.goal !== 'unk' && Ef.co.goal !== 'none' ? 'هدف: ' + goalFa(Ef.co.goal) : 'نامشخص', g(Ef.co.goal === 'none' || Ef.co.goal === 'unk', Ef.co.goal !== 'unk' && Ef.co.goal !== 'none')],
        ['ساختار', c.align === 'no' ? 'ناهم‌راستا' : c.align === 'yes' ? 'هم‌راستا' : 'نامشخص', g(c.align === 'no', c.align === 'yes')], ['نظام‌ها', isFinite(num(c.digital)) ? 'بلوغ دیجیتال ' + fa(c.digital) + ' از ۵' : 'نامشخص', g(num(c.digital) <= 2, num(c.digital) >= 4)],
        ['ارزش‌های مشترک', 'نامشخص', 'نیازمند بررسی'], ['سبک رهبری', { strong: 'قوی', adequate: 'کافی', weak: 'ضعیف' }[c.mgmt] || 'نامشخص', g(c.mgmt === 'weak', c.mgmt === 'strong')], ['کارکنان', c.exec === 'poor' ? 'سابقهٔ اجرای ضعیف' : 'نامشخص', g(c.exec === 'poor', c.exec === 'good')], ['مهارت‌ها', c.innov === 'none' ? 'نوآوری ضعیف' : c.innov === 'strong' ? 'نوآوری قوی' : 'نامشخص', g(c.innov === 'none', c.innov === 'strong')]];
      var hi = rows.filter(function (r) { return r[2] === 'زیاد'; });
      return { v: hi.length ? 'ناسازگاری‌های اصلی: ' + hi.map(function (r) { return r[0]; }).join('، ') + '.' : 'ناسازگاری بارزی با داده‌های فعلی دیده نشد.', head: ['عنصر', 'وضع فعلی', 'شکاف'], rows: rows, impl: [] };
    },
    value: function (Ef, X) {
      var S = X.S, c = Ef.cap, a = function (leak, ok) { return leak ? 'نشت ارزش' : ok ? 'خلق ارزش' : 'نیازمند بررسی'; };
      var rows = [['لجستیک ورودی و تأمین', a(S.fxIn || S.supplierPow || S.sanction, false), S.fxIn ? 'هزینه و ریسک ارزی نهاده‌ها' : ''], ['عملیات', a(S.idle || S.highCost, c.costPos === 'low'), S.idle ? 'ظرفیت خالی' : S.highCost ? 'هزینهٔ بالا' : ''],
        ['لجستیک خروجی', 'نیازمند بررسی', ''], ['بازاریابی و فروش', a(S.custConc || S.buyerPow, c.brand === 'strong'), S.custConc ? 'وابستگی به چند مشتری' : ''], ['خدمات پس از فروش', a(c.recurring === 'no', c.recurring === 'yes'), ''],
        ['تدارکات', a(S.supplierPow, false), ''], ['فناوری', a(S.digitalGap, num(c.digital) >= 4), ''], ['منابع انسانی', a(c.mgmt === 'weak', c.mgmt === 'strong'), ''], ['زیرساخت سازمانی', a(c.align === 'no', c.align === 'yes'), '']];
      var leaks = rows.filter(function (r) { return r[1] === 'نشت ارزش'; });
      return { v: leaks.length ? 'نقاط نشت ارزش: ' + leaks.map(function (r) { return r[0]; }).join('، ') + '.' : 'نشت بارزی با داده‌های فعلی دیده نشد.', head: ['فعالیت', 'ارزیابی', 'شاهد'], rows: rows, impl: leaks.length ? ['اقدام: ' + L(['S02', 'S04', 'S14', 'S23'], X.R).join('، ')] : [] };
    },
    bsc: function (Ef, X) {
      var A = X.archMain, picks = A ? A.picks.concat(A.en ? [A.en] : []) : [], fin = { margin: 'بهبود حاشیهٔ EBITDA (واقعی)', rev: 'رشد واقعی درآمد', capital: 'بازده سرمایه و آزادسازی نقد', risk: 'کاهش نوسان سود', enabler: '—' };
      var rows = [['مالی', picks.map(function (p) { return fin[p.r.s.lever]; }).filter(function (x, i, a) { return x !== '—' && a.indexOf(x) === i; }).join('؛ ') || '—', 'EBITDA واقعی؛ جریان نقد عملیاتی'],
        ['مشتری', picks.filter(function (p) { return ['core', 'growth', 'model'].indexOf(p.r.s.pil) >= 0; }).map(function (p) { return p.r.s.fa; }).join('؛ ') || '—', picks.filter(function (p) { return ['core', 'growth', 'model'].indexOf(p.r.s.pil) >= 0; }).map(function (p) { return p.r.s.kpi[0]; }).join('؛ ') || '—'],
        ['فرایند داخلی', picks.filter(function (p) { return ['res', 'port'].indexOf(p.r.s.pil) >= 0; }).map(function (p) { return p.r.s.fa; }).join('؛ ') || '—', picks.filter(function (p) { return ['res', 'port'].indexOf(p.r.s.pil) >= 0; }).map(function (p) { return p.r.s.kpi[0]; }).join('؛ ') || '—'],
        ['یادگیری و رشد', picks.filter(function (p) { return p.r.s.pil === 'org'; }).map(function (p) { return p.r.s.fa; }).join('؛ ') || 'ساخت قابلیت', picks.filter(function (p) { return p.r.s.pil === 'org'; }).map(function (p) { return p.r.s.kpi[0]; }).join('؛ ') || 'پوشش جانشین نقش‌های کلیدی']];
      return { v: 'نقشهٔ راهبرد از راهکارهای معماری منتخب ساخته شد؛ اهداف عددی را شما تعیین کنید.', head: ['منظر', 'هدف راهبردی', 'شاخص'], rows: rows, impl: ['OKR فصلی برای هر رکن با مالک مشخص'] };
    },
    flywheel: function (Ef, X) {
      var c = Ef.cap, m = Ef.mkt, step = function (t, ok) { return [t, ok === true ? 'برقرار' : ok === false ? 'نقطهٔ شکست' : 'نیازمند بررسی']; };
      var rows = [step('مقیاس و حجم بیشتر', m.position === 'leader' ? true : m.position === 'follower' ? false : undefined), step('هزینهٔ واحد کمتر', c.costPos === 'low' ? true : c.costPos === 'high' ? false : undefined), step('قیمت رقابتی / خدمت بهتر', c.diff === 'high' || c.costPos === 'low' ? true : c.diff === 'none' ? false : undefined), step('مشتری و تکرار خرید بیشتر', c.recurring === 'yes' ? true : c.recurring === 'no' ? false : undefined), step('بازگشت به مقیاس بیشتر', m.growth === 'high' ? true : m.growth === 'decline' ? false : undefined)];
      var br = rows.filter(function (r) { return r[1] === 'نقطهٔ شکست'; });
      return { v: br.length ? 'حلقه در «' + br.map(function (r) { return r[0]; }).join('، ') + '» می‌شکند؛ سرمایه‌گذاری بر همین جزء متمرکز شود.' : 'نقطهٔ شکست قطعی دیده نشد؛ اجزای نامشخص را بیازمایید.', head: ['جزء حلقه', 'وضعیت'], rows: rows, impl: [] };
    },
    platform: function (Ef) {
      var m = Ef.mkt, c = Ef.cap, cs = Ef.cons, chk = function (t, ok) { return [t, ok === true ? 'برقرار' : ok === false ? 'برقرار نیست' : 'نیازمند بررسی']; };
      var dataRes = (Ef.res || []).some(function (r) { return r.type === 'data' || r.type === 'network'; });
      var rows = [chk('بازار پراکنده در دو سوی تعامل', m.conc === 'fragmented' ? true : m.conc === 'concentrated' ? false : undefined), chk('توان یا تمایل دیجیتال', num(c.digital) >= 3 || cs.digitalAppetite === 'yes' ? true : cs.digitalAppetite === 'no' ? false : undefined), chk('نیاز برآورده‌نشده در اتصال طرف‌ها', m.unmet === 'yes' ? true : m.unmet === 'no' ? false : undefined), chk('داده یا شبکهٔ قابل‌اتکا', dataRes ? true : undefined), chk('سرمایه برای دورهٔ زیان اولیه', c.cash === 'strong' || num(cs.capital) > 0 ? true : c.cash === 'tight' ? false : undefined)];
      var ok = rows.filter(function (r) { return r[1] === 'برقرار'; }).length, no = rows.filter(function (r) { return r[1] === 'برقرار نیست'; }).length;
      return { v: no ? 'شرایط پلتفرم برقرار نیست (' + fa(no) + ' شرط منفی)؛ مشارکت در اکوسیستم دیگران محتمل‌تر است.' : ok >= 4 ? 'شرایط اولیهٔ پلتفرم فراهم است؛ آزمون اثر شبکه‌ای پیش از سرمایه‌گذاری.' : 'شواهد کافی برای داوری نیست.', head: ['شرط', 'وضعیت'], rows: rows, impl: [] };
    },
    scenario: function (Ef, X) {
      var S = X.S, a1 = S.sanction || S.fxIn ? 'شدت تحریم و دسترسی ارزی' : S.cyclic ? 'قیمت جهانی محصول' : 'شرایط اقتصاد کلان', a2 = S.priceCtl || S.regChange ? 'سیاست قیمت‌گذاری و مقررات' : 'تقاضای داخلی';
      var rob = X.R.list.filter(function (r) { return r.s.lever === 'risk' && r.label !== 'na' && r.label !== 'excluded'; }).sort(function (a, b) { return b.sc.total - a.sc.total; }).slice(0, 3).map(function (r) { return r.s.fa; });
      var war = [Ef.mkt.stateRival === 'yes' && 'رقیب دولتی ممکن است با قیمت پایین‌تر یا دسترسی ترجیحی پاسخ دهد', Ef.mkt.position === 'leader' && 'رقبای کوچک‌تر احتمالاً با تخفیف یا تقلید پاسخ می‌دهند', Ef.mkt.position === 'follower' && 'رهبر بازار ممکن است با جنگ قیمت از سهم دفاع کند'].filter(Boolean);
      return { v: 'دو محور عدم‌قطعیت: «' + a1 + '» و «' + a2 + '». راهبرد مقاوم باید در هر چهار سناریو زیان‌بار نباشد.', head: ['سناریو', 'شرح'],
        rows: [['۱. ' + a1 + ' مساعد / ' + a2 + ' مساعد', 'سرعت‌دادن به رشد'], ['۲. ' + a1 + ' مساعد / ' + a2 + ' نامساعد', 'تمرکز بر صادرات و هزینه'], ['۳. ' + a1 + ' نامساعد / ' + a2 + ' مساعد', 'بومی‌سازی تأمین و موجودی راهبردی'], ['۴. هر دو نامساعد', 'حفظ نقدینگی، تمرکز بر بخش‌های سودده'],
          ['اقدامات مقاوم (در همهٔ سناریوها)', rob.join('؛ ') || '—'], ['نشانه‌های هشدار', 'فاصلهٔ نرخ ارز بازار و رسمی؛ اخبار تحریم و انتقال وجه؛ مصوبات قیمت‌گذاری؛ موجودی نهاده‌های بحرانی'], ['بازی جنگ — واکنش رقبا', war.join('؛ ') || 'نیازمند بررسی رقبا']], impl: [] };
    },
    transient: function (Ef) {
      var m = Ef.mkt, c = Ef.cap, st = m.growth === 'decline' ? 'خروج منظم' : c.gmTrend === 'down' && c.diff !== 'high' ? 'فرسایش — زمان بازپیکربندی' : m.growth === 'high' && c.diff === 'high' ? 'رشد' : m.position === 'leader' ? 'بهره‌برداری' : 'نامشخص';
      return { v: 'مرحلهٔ مزیت فعلی: ' + st + '.', head: ['جزء', 'محتوا'], rows: [['مرحله', st], ['مزیت‌های مقرراتی (ارز ترجیحی، مجوز، سهمیه)', Ef.mkt.priceCtl === 'yes' || Ef.mkt.fxInputs === 'yes' ? 'وجود دارد — برای پایان آن برنامه لازم است' : 'نامشخص'], ['اقدام', st === 'فرسایش — زمان بازپیکربندی' || st === 'خروج منظم' ? 'تخصیص مجدد منابع به مزیت بعدی؛ سبد آزمایش‌های کوچک' : 'بهره‌برداری هم‌زمان با ساخت مزیت بعدی']], impl: [] };
    },
    ambidex: function (Ef, X) {
      var ok = Ef.mkt.disrupt === 'yes' && !X.S.turnNeed;
      return { v: ok ? 'جداسازی ساختاری کسب‌وکار جدید توصیه می‌شود: هسته نقدینگی می‌سازد، واحد جدید با معیارهای خود رشد می‌کند.' : X.S.turnNeed ? 'در بحران فعلی، ایجاد واحد اکتشافی منابع هسته را می‌بلعد؛ پس از تثبیت.' : 'نیاز به دوسوتوانی با داده‌های فعلی اثبات نشده است.', head: ['جزء طراحی', 'پیشنهاد'],
        rows: [['ساختار', 'واحد یا شرکت مستقل با مدیر جدا'], ['رابط با هسته', 'دسترسی مشترک به مشتری، برند و دانش؛ جدایی در فرایند و فرهنگ'], ['منابع', 'بودجهٔ محافظت‌شده و مرحله‌ای'], ['معیار موفقیت', 'یادگیری و رشد مشتری، نه سود کوتاه‌مدت'], ['حاکمیت', 'گزارش مستقیم به مدیرعامل']], impl: [] };
    },
    diamond: function (Ef, X) {
      var cs = Ef.cons, c = Ef.cap, A = X.archMain;
      return { v: 'پنج عنصر راهبرد از ورودی‌ها و معماری منتخب استخراج شد؛ سازگاری را بیازمایید.', head: ['عنصر', 'محتوا'],
        rows: [['عرصه‌ها', (Ef.co.industry || 'صنعت فعلی') + (Ef.mkt.exportOpen === 'yes' && cs.intl !== 'no' ? ' · داخلی + صادرات' : ' · داخلی')], ['ابزار ورود', [cs.partner === 'yes' && 'مشارکت/اتحاد', c.cash === 'strong' && 'تملک', 'رشد درونی'].filter(Boolean).join('، ') + (cs.partner === 'no' ? ' (شریک پذیرفتنی نیست)' : '')],
          ['تمایزدهنده‌ها', c.diff === 'high' ? 'محصول متمایز' : c.costPos === 'low' ? 'هزینهٔ پایین' : 'تعیین نشده'], ['مرحله‌بندی', A ? A.picks.map(function (p, i) { return fa(i + 1) + '. ' + p.r.s.fa; }).join(' ← ') : '—'], ['منطق اقتصادی', A && A.picks[0] ? A.picks[0].r.s.ec : '—']], impl: [] };
    },
    wardley: function (Ef) {
      return { v: 'نقشهٔ واردلی نیازمند زنجیرهٔ اجزای فنی است که در فرم ثبت نمی‌شود؛ در این مرحله فقط راهنما ارائه می‌شود.', head: ['گام', 'راهنما'],
        rows: [['اجزای متمایز', 'ساخت درون‌سازمانی و حفاظت'], ['اجزای کالایی', 'خرید یا برون‌سپاری' + (Ef.mkt.sanctions === 'yes' ? ' — با توجه به تحریم، جایگزین داخلی یا متن‌باز' : '')], ['داده‌های لازم', 'نیاز کاربر، زنجیرهٔ اجزا، مرحلهٔ تکامل هر جزء']], impl: [] };
    },
    disruption: function (Ef, X) {
      var S = X.S, low = S.commod && S.buyerPow, nm = Ef.mkt.unmet === 'yes';
      return { v: Ef.mkt.disrupt !== 'yes' ? 'تهدید اختلال گزارش نشده است.' : 'نوع تهدید محتمل: ' + (low ? 'اختلال از پایین بازار (مشتریان حساس به قیمت)' : nm ? 'اختلال بازار جدید (غیرمشتریان)' : 'نیازمند بررسی') + '.', head: ['جزء', 'ارزیابی'],
        rows: [['مشتریان در معرض', low ? 'بخش حساس به قیمت' : nm ? 'غیرمشتریان و نیازهای برآورده‌نشده' : 'نیازمند بررسی'], ['مسیر بهبود رقیب', 'نیازمند پایش (کیفیت، قیمت، سهم)'], ['پاسخ', Ef.mkt.disrupt === 'yes' ? L(['S27', 'S12', 'S11'], X.R).join('، ') : '—']], impl: [] };
    },
    generic: function (Ef) {
      var c = Ef.cap, cp = c.costPos, d = c.diff, pos = cp === 'low' && d === 'high' ? 'هم هزینه هم تمایز (نادر — شاهد لازم است)' : cp === 'low' ? 'رهبری هزینه' : d === 'high' ? 'تمایز' : Ef.mkt.position === 'niche' ? 'تمرکز' : (cp === 'avg' || cp === 'high') && (d === 'some' || d === 'none') ? 'گیر افتاده در میانه' : 'نامشخص';
      return { v: 'جایگاه رقابتی: ' + pos + '.', head: ['معیار', 'وضعیت'], rows: [['موقعیت هزینه', { low: 'پایین‌تر از رقبا', avg: 'هم‌سطح', high: 'بالاتر از رقبا' }[cp] || 'نامشخص'], ['تمایز', { high: 'بالا', some: 'محدود', none: 'ندارد' }[d] || 'نامشخص'], ['دامنهٔ بازار', Ef.mkt.position === 'niche' ? 'محدود' : 'گسترده/نامشخص'], ['جهت پیشنهادی', pos === 'گیر افتاده در میانه' ? 'انتخاب صریح: کاهش هزینه تا سطح رهبر، یا تمایز در خدمت/اطمینان تأمین' : pos === 'نامشخص' ? 'دادهٔ هزینه و تمایز را تکمیل کنید' : 'حذف فعالیت‌های ناسازگار با ' + pos]], impl: [] };
    },
    portfolio: function (Ef) {
      var U = (Ef.units || []).filter(function (u) { return String(u.name || '').trim(); });
      if (!U.length) return { v: 'واحد کسب‌وکاری ثبت نشده؛ برای طبقه‌بندی پرتفوی، واحدها را در بخش سوم وارد کنید.', head: ['واحد', 'طبقه'], rows: [], impl: [] };
      var cls = function (u) { if (u.growth === 'unk' || u.pos === 'unk' || !u.growth || !u.pos) return ['نامشخص', 'تکمیل داده']; return u.growth === 'high' ? (u.pos === 'strong' ? ['ستاره', 'سرمایه‌گذاری'] : ['علامت سؤال', 'سرمایه‌گذاری انتخابی یا خروج']) : (u.pos === 'strong' ? ['گاو شیرده', 'برداشت نقد و نگهداری'] : ['سگ', 'بازسازی یا واگذاری']); };
      var rows = U.map(function (u) { var c = cls(u); return [u.name, c[0], c[1], u.fit === 'no' ? 'ناهمسو با هستهٔ گروه' : u.fit === 'yes' ? 'همسو' : 'نامشخص']; });
      var dogs = rows.filter(function (r) { return r[1] === 'سگ' || (r[1] === 'علامت سؤال' && r[3] === 'ناهمسو با هستهٔ گروه'); });
      return { v: fa(U.length) + ' واحد؛ ' + fa(dogs.length) + ' نامزد بازسازی یا واگذاری.', head: ['واحد', 'طبقه (BCG)', 'اقدام', 'تناسب راهبردی'], rows: rows, impl: dogs.map(function (r) { return 'بررسی واگذاری/بازسازی: ' + r[0]; }) };
    }
  };

  /* ---------------- 5 · solutions ---------------- */
  function gate(k, Ef, s) {
    var c = Ef.cap, m = Ef.mkt, cs = Ef.cons, r = 'unk', note = '';
    switch (k) {
      case 'capital': if (num(cs.capital) > 0 || c.cash === 'strong') r = 'pass'; else if (c.cash === 'tight') r = 'fail'; else if (c.cash === 'adequate') r = s.capx >= 3 ? 'unk' : 'pass'; break;
      case 'control': r = cs.control === 'yes' ? 'unk' : cs.control === 'no' ? 'pass' : 'unk'; if (cs.control === 'yes') note = 'ساختار معامله نباید کنترل را منتقل کند'; break;
      case 'partner': r = cs.partner === 'no' ? 'conflict' : cs.partner === 'yes' ? 'pass' : 'unk'; break;
      case 'divest': r = cs.divest === 'no' ? 'conflict' : cs.divest === 'yes' ? 'pass' : 'unk'; break;
      case 'intl': r = cs.intl === 'no' ? 'conflict' : cs.intl === 'yes' ? 'pass' : 'unk'; break;
      case 'export': r = m.exportOpen === 'yes' ? 'pass' : m.exportOpen === 'no' ? 'fail' : 'unk'; break;
      case 'digital': r = cs.digitalAppetite === 'no' ? 'conflict' : num(c.digital) >= 3 ? 'pass' : 'unk'; if (r === 'unk' && num(c.digital) <= 2) note = 'بلوغ دیجیتال ' + fa(c.digital) + ' از ۵ — قابلیت باید ساخته یا با شریک تأمین شود'; break;
      case 'mgmt': r = c.mgmt === 'weak' ? 'fail' : (c.mgmt === 'strong' || c.mgmt === 'adequate') ? 'pass' : 'unk'; break;
      case 'price': r = m.priceCtl === 'yes' ? 'unk' : m.priceCtl === 'no' ? (m.inflPass === 'none' ? 'unk' : 'pass') : 'unk'; if (m.priceCtl === 'yes') note = 'نیازمند تأیید نهاد قیمت‌گذار'; break;
      case 'subs': r = (c.subs === 'yes' || (Ef.units || []).filter(function (u) { return u.name; }).length >= 2) ? 'pass' : c.subs === 'no' ? 'fail' : 'unk'; break;
      case 'idle': r = num(c.util) < 0.8 ? 'pass' : num(c.util) >= 0.85 ? 'fail' : 'unk'; break;
      case 'cust': r = m.unmet === 'yes' ? 'pass' : m.unmet === 'no' ? 'fail' : 'unk'; if (r === 'unk') note = 'شاهد نیاز مشتری با مصاحبه/پژوهش احراز شود'; break;
      case 'gov': r = c.gov === 'ready' ? 'pass' : 'unk'; if (c.gov === 'weak') note = 'اصلاح حاکمیت و بندهای حسابرسی پیش‌شرط است'; break;
      case 'risk': r = cs.risk === 'low' ? 'fail' : (cs.risk === 'high' || cs.risk === 'med') ? 'pass' : 'unk'; break;
    }
    return { k: k, n: B().GATE[k], r: r, note: note };
  }
  function assess(Ef, X) {
    var S = X.S, main = X.main, second = X.second, W = Ef.W, over = Ef.over || {}, list = [], byId = {}, goalArch = (GOALMAP[Ef.co.goal] || []).map(function (x) { return x[0]; });
    B().SOL.forEach(function (s) {
      var trig = s.trig.filter(function (t) { return S[t]; }), rm = s.sv[main] || 0, r2 = s.sv[second] || 0, ga = goalArch.some(function (a) { return s.sv[a]; });
      var fitRaw = rm * 10 + r2 * 4 + trig.length * 6 + (ga ? 8 : 0), pinned = (over.pin || []).indexOf(s.id) >= 0;
      if (pinned) fitRaw += 15;
      var gates = s.gates.map(function (k) { return gate(k, Ef, s); });
      if (num(Ef.cons.time) > 0 && s.tm[0] > num(Ef.cons.time)) gates.push({ k: 'time', n: 'زمان اجرا در افق زمانی شما می‌گنجد', r: 'fail', note: 'حداقل ' + fa(s.tm[0]) + ' ماه' });
      var userEx = (over.ex || []).indexOf(s.id) >= 0;
      var label = userEx ? 'excluded' : gates.some(function (g) { return g.r === 'conflict'; }) ? 'excluded' : (fitRaw === 0 ? 'na' : gates.some(function (g) { return g.r === 'fail'; }) ? 'blocked' : gates.some(function (g) { return g.r === 'unk'; }) ? 'cond' : 'exec');
      var why = { fit: [], impact: [], feas: [], risk: [], time: [], moat: [] };
      var fit = Math.min(100, Math.round(fitRaw / 0.7));
      why.fit.push('ارتباط با مسئلهٔ اصلی ' + fa(rm) + ' از ۳' + (r2 ? '، با مسئلهٔ دوم ' + fa(r2) + ' از ۳' : '') + (trig.length ? '؛ نشانه‌های فعال: ' + trig.map(function (t) { return SIG[t]; }).join('، ') : '') + (ga ? '؛ هم‌جهت با هدف اعلام‌شده' : '') + (pinned ? '؛ سنجاق‌شده به انتخاب شما (+۱۵)' : ''));
      var needLever = { core: 'margin', turn: 'margin', growth: 'rev', scale: 'rev', unc: 'risk', port: 'capital', exec: 'enabler', ipo: 'capital', disrupt: 'rev', pos: 'margin', dir: 'rev' }[main];
      var impact = { 1: 40, 2: 65, 3: 90 }[s.imp] + (s.lever === needLever ? 10 : 0) - (s.lever === 'enabler' && main !== 'exec' ? 15 : 0); impact = Math.max(0, Math.min(100, impact));
      why.impact.push('اثر پایهٔ ' + ['', 'کم', 'متوسط', 'زیاد'][s.imp] + ' (اهرم: ' + { margin: 'حاشیه', rev: 'درآمد', capital: 'سرمایه', risk: 'ریسک', enabler: 'توانمندساز' }[s.lever] + ')' + (s.lever === needLever ? '؛ هم‌جهت با نیاز مسئلهٔ اصلی (+۱۰)' : ''));
      var nu = gates.filter(function (g) { return g.r === 'unk'; }).length, feas = 100 - nu * 15 - (s.capx >= 3 && Ef.cap.cash === 'adequate' ? 10 : 0);
      if (gates.some(function (g) { return g.r === 'fail'; })) feas = 15; if (label === 'excluded') feas = 0; feas = Math.max(0, feas);
      why.feas.push(gates.length ? gates.map(function (g) { return g.n + ': ' + { pass: 'برقرار', fail: 'برقرار نیست', unk: 'نیازمند بررسی', conflict: 'تعارض با محدودیت قطعی' }[g.r] + (g.note ? ' (' + g.note + ')' : ''); }).join('؛ ') : 'شرط اجرایی خاصی ندارد');
      var risk = { 1: 85, 2: 60, 3: 35 }[s.rk] + (Ef.cons.risk === 'high' && s.rk === 3 ? 10 : 0) - (Ef.cons.risk === 'low' && s.rk >= 2 ? 15 : 0); risk = Math.max(0, Math.min(100, risk));
      why.risk.push('ریسک ذاتی ' + ['', 'کم', 'متوسط', 'زیاد'][s.rk] + (Ef.cons.risk !== 'unk' ? '؛ ریسک‌پذیری شرکت: ' + { low: 'کم', med: 'متوسط', high: 'زیاد' }[Ef.cons.risk] : ''));
      var mid = (s.tm[0] + s.tm[1]) / 2, time = mid <= 6 ? 90 : mid <= 12 ? 70 : mid <= 24 ? 50 : 30; if (num(Ef.cons.time) > 0 && s.tm[0] > num(Ef.cons.time)) time = 10;
      why.time.push(fa(s.tm[0]) + ' تا ' + fa(s.tm[1]) + ' ماه');
      var moat = { 1: 40, 2: 70, 3: 95 }[s.moat]; why.moat.push('پایداری مزیت ' + ['', 'کم', 'متوسط', 'زیاد'][s.moat]);
      var sc = { fit: fit, impact: impact, feas: feas, risk: risk, time: time, moat: moat }, tw = 0, tot = 0; Object.keys(W).forEach(function (k) { tw += num(W[k]) || 0; tot += (num(W[k]) || 0) * sc[k]; });
      sc.total = tw ? Math.round(tot / tw * 10) / 10 : 0; sc.econ = Math.round(fit * 0.4 + impact * 0.4 + moat * 0.2); sc.execS = Math.round(feas * 0.5 + risk * 0.3 + time * 0.2);
      sc.why = why; var quad = sc.econ >= 60 && sc.execS >= 60 ? 'ارزشمند و قابل اجرا' : sc.econ >= 60 ? 'ارزشمند ولی دشوار — پیش‌نیاز لازم' : sc.execS >= 60 ? 'آسان ولی کم‌اثر' : 'کم‌اثر و دشوار';
      var q = quant(Ef, s);
      var o = { id: s.id, s: s, gates: gates, label: label, definitive: label === 'exec' && fit >= 50, sc: sc, quad: quad, trig: trig, pinned: pinned, q: q };
      list.push(o); byId[s.id] = o;
    });
    return { list: list, byId: byId };
  }
  function quant(Ef, s) {
    var u = (Ef.up || {})[s.id]; if (!u) return null; var rev = num(Ef.cap.rev), m = num(Ef.cap.ebitdaM), ru = num(u.rev), mu = num(u.margin);
    if (!isFinite(rev) || (!isFinite(ru) && !isFinite(mu))) return { note: 'برای محاسبه، فروش پایه و دست‌کم یکی از فرض‌ها لازم است.' };
    var d1 = isFinite(ru) && isFinite(m) ? rev * ru * m : 0, d2 = isFinite(mu) ? rev * (1 + (isFinite(ru) ? ru : 0)) * mu : 0;
    return { dEbitda: d1 + d2, f: 'فروش × رشد فرضی × حاشیهٔ EBITDA فعلی + فروش جدید × بهبود حاشیهٔ فرضی', note: isFinite(ru) && !isFinite(m) ? 'حاشیهٔ EBITDA فعلی وارد نشده؛ اثر رشد درآمد محاسبه نشد.' : '' };
  }

  /* ---------------- 6 · architectures ---------------- */
  // inside a pillar the move must solve the problem: total + 0.2 × (fit − 50)
  function pr(r) { return r.sc.total + 0.2 * (r.sc.fit - 50); }
  function architect(Ef, X, R) {
    var A = X.A, mx = Math.max.apply(null, Object.keys(A).map(function (k) { return A[k]; })) || 1;
    return B().ARCHT.map(function (a) {
      var rel = Math.max.apply(null, a.arch.map(function (k) { return A[k] || 0; })), relN = rel / mx;
      var used = {}, picks = [], empty = [];
      a.pil.forEach(function (p) {
        var cand = p[1].map(function (id) { return R.byId[id]; }).filter(function (r) { return r && !used[r.id] && r.label !== 'excluded'; }).sort(function (x, y) { var ox = x.label === 'blocked' ? 1 : 0, oy = y.label === 'blocked' ? 1 : 0; return ox - oy || pr(y) - pr(x); });
        var ok = cand.filter(function (r) { return r.label !== 'blocked'; }), pick = ok[0], next = null;
        // staging: a valuable but hard move waits behind an executable one in the same pillar
        if (pick && pick.sc.execS < 65 && pick.sc.econ >= 60) { var alt = ok.filter(function (r) { return r !== pick && r.sc.execS >= 65 && r.sc.econ >= 60; })[0]; if (alt) { next = pick; pick = alt; } }
        if (pick) { used[pick.id] = 1; if (next) used[next.id] = 1; picks.push({ pillar: p[0], r: pick, next: next }); } else empty.push({ pillar: p[0], why: cand.length ? 'همهٔ گزینه‌ها مسدودند: ' + cand.map(function (r) { return r.s.fa; }).join('، ') : 'همهٔ گزینه‌ها به‌دلیل محدودیت‌های شما حذف شدند' });
      });
      var en = a.en.map(function (id) { return R.byId[id]; }).filter(function (r) { return r && !used[r.id] && r.label !== 'excluded' && r.label !== 'blocked'; }).sort(function (x, y) { return y.sc.total - x.sc.total; })[0];
      var avg = picks.length ? picks.reduce(function (s, p) { return s + p.r.sc.total; }, 0) / picks.length : 0;
      var fwCov = a.fw.map(function (id) { return coverage(Ef, B().fw(id).in).share; }), cov = fwCov.reduce(function (s, x) { return s + x; }, 0) / fwCov.length;
      var score = Math.round((avg * 0.5 + relN * 100 * 0.35 + cov * 100 * 0.15) * 10) / 10;
      var active = picks.length >= 2 && rel > 0;
      var definitive = active && picks.every(function (p) { return p.r.definitive; }), anyCond = picks.some(function (p) { return p.r.label === 'cond'; });
      return { a: a, rel: rel, relN: relN, picks: picks, empty: empty, en: en ? { pillar: 'توانمندساز', r: en } : null, score: score, active: active, definitive: definitive, label: !active ? 'na' : definitive ? 'exec' : anyCond ? 'cond' : 'exec', cov: cov };
    });
  }

  /* ---------------- 3 · framework selection ---------------- */
  function selectFw(Ef, X, archMain) {
    var main = X.main, second = X.second, over = Ef.over || {}, recipe = archMain ? archMain.a.fw : [];
    var rows = B().FW.map(function (f) {
      var r1 = f.rel[main] || 0, r2 = f.rel[second] || 0, cv = coverage(Ef, f.in), inRecipe = recipe.indexOf(f.id) >= 0;
      var full = X.mode === 'full' && (f.fam === 'env' || f.fam === 'int') ? 6 : 0;
      var score = Math.round(((r1 * 10 + r2 * 4 + full + (inRecipe ? 8 : 0)) * (0.6 + 0.4 * cv.share)) * 10) / 10;
      return { f: f, r1: r1, r2: r2, cov: cv, inRecipe: inRecipe, score: score, sel: false, why: '' };
    });
    var pinned = rows.filter(function (r) { return (over.fwPin || []).indexOf(r.f.id) >= 0; });
    var pool = rows.filter(function (r) { return (over.fwEx || []).indexOf(r.f.id) < 0 && (r.r1 > 0 || r.r2 > 0 || r.inRecipe || (X.mode === 'full' && r.score > 0)); }).sort(function (a, b) { return b.score - a.score; });
    var sel = pinned.slice();
    function take(r) { if (sel.indexOf(r) < 0 && sel.length < 5) sel.push(r); }
    // synthesis frameworks work from the engine's own outputs; the rest need at least a quarter of their inputs
    var SYN = ['kernel', 'bsc', 'h3', 'diamond', 'portfolio'], enough = function (r) { return SYN.indexOf(r.f.id) >= 0 && r.f.id !== 'portfolio' || r.cov.share >= 0.25; };
    pool = pool.filter(function (r) { return enough(r) || (over.fwPin || []).indexOf(r.f.id) >= 0; });
    pool.filter(function (r) { return r.inRecipe && (r.r1 > 0 || X.mode === 'full'); }).forEach(take);
    ['diag', 'choose', 'exec'].forEach(function (role) { if (!sel.some(function (r) { return r.f.role === role; })) { var c = pool.filter(function (r) { return r.f.role === role && r.r1 + r.r2 > 0; })[0]; if (c) take(c); } });
    pool.forEach(function (r) { if (sel.length < 3) take(r); });
    sel.forEach(function (r) { r.sel = true; r.why = (r.inRecipe ? 'جزء معماری «' + archMain.a.fa + '»؛ ' : '') + 'ارتباط با مسئلهٔ اصلی ' + fa(r.r1) + ' از ۳' + (r.r2 ? '، با مسئلهٔ دوم ' + fa(r.r2) + ' از ۳' : '') + '؛ نقش: ' + B().ROLE[r.f.role] + '؛ پوشش داده ' + pc(r.cov.share) + ((over.fwPin || []).indexOf(r.f.id) >= 0 ? '؛ سنجاق‌شده به انتخاب شما' : ''); });
    rows.filter(function (r) { return !r.sel; }).forEach(function (r) {
      r.why = (over.fwEx || []).indexOf(r.f.id) >= 0 ? 'به انتخاب شما کنار گذاشته شد' : r.r1 === 0 && r.r2 === 0 ? 'به مسئلهٔ اصلی این شرکت پاسخ نمی‌دهد — شهرت چارچوب دلیل اجرا نیست' : r.cov.share < 0.25 ? 'مرتبط است اما دادهٔ لازم کافی نیست (' + r.cov.miss.slice(0, 3).join('، ') + ') — پس از تکمیل داده اجرا می‌شود' : 'چارچوب مرتبط‌تری در همین نقش انتخاب شد';
    });
    return { rows: rows, sel: sel.sort(function (a, b) { return ['diag', 'choose', 'exec'].indexOf(a.f.role) - ['diag', 'choose', 'exec'].indexOf(b.f.role); }) };
  }

  /* ---------------- 7 · opportunities, roadmap, sensitivity ---------------- */
  function opportunities(Ef, X, R) {
    var S = X.S, O = [], add = function (t, ev, ids, kind) { O.push({ t: t, ev: ev, sol: ids.filter(function (id) { var r = R.byId[id]; return r && r.label !== 'excluded'; }), kind: kind }); };
    if (S.unmet || (S.commod && S.strongForces)) add('فضای اقیانوس آبی / نوآوری ارزش', S.unmet ? S.unmet.ev[0] : 'کالایی‌شدن در صنعت با رقابت شدید', ['S10', 'S09', 'S11'], 'blue');
    if (S.idle) add('ظرفیت بلااستفاده', S.idle.ev[0], ['S14', 'S06', 'S07'], 'idle');
    vrioRes(Ef).filter(function (r) { return r.cls === 'pot'; }).forEach(function (r) { add('قابلیت پنهان: ' + r.name, 'ارزشمند، کمیاب و سخت‌تقلید اما سازمان برای بهره‌برداری آماده نیست', ['S24', 'S17', 'S08'], 'hidden'); });
    (Ef.res || []).filter(function (r) { return r.name && (r.use === 'idle' || r.use === 'under'); }).forEach(function (r) { var map = { brand: ['S08', 'S17'], licence: ['S17', 'S14'], asset: ['S33', 'S14'], data: ['S12', 'S13'], network: ['S13', 'S17'], tech: ['S08', 'S17'], people: ['S31'], relation: ['S05', 'S07'] }; add('منبع ' + (r.use === 'idle' ? 'بلااستفاده' : 'کم‌استفاده') + ': ' + r.name, 'نوع: ' + (r.type || 'نامشخص') + (r.type === 'asset' ? ' — برای مولدسازی، موتور تأمین مالی هاب' : ''), map[r.type] || ['S08'], 'resource'); });
    if (S.exportPot) add('بازار صادراتی بهره‌برداری‌نشده', S.exportPot.ev[0], ['S07', 'S17'], 'export');
    if (S.noRecurring && !S.turnNeed) add('مدل کسب‌وکار جدید: درآمد تکرارشونده', 'درآمد فعلی یک‌باره است', ['S11', 'S34'], 'model');
    var pf = ANA.platform(Ef).rows.filter(function (r) { return r[1] === 'برقرار'; }).length; if (pf >= 3) add('مدل پلتفرمی / اکوسیستم', fa(pf) + ' شرط از ۵ برقرار است', ['S13', 'S17'], 'model');
    if (S.disrupt) add('تهدید نوظهور: اختلال', S.disrupt.ev[0], ['S27', 'S12', 'S26'], 'threat');
    if (S.regChange) add('تهدید/فرصت نوظهور: تغییر مقررات', S.regChange.ev[0], ['S29', 'S28'], 'threat');
    if (S.sanction) add('تهدید جاری: تحریم', S.sanction.ev[0], ['S28', 'S04', 'S03'], 'threat');
    if (S.portfolio) add('ارزش‌آفرینی در پرتفوی', S.portfolio.ev[0], ['S20', 'S21'], 'portfolio');
    return O;
  }
  function roadmap(Ef, X, Am, gaps) {
    if (!Am) return [];
    var rows = [{ ph: 'فاز ۰ — تصمیم و حاکمیت', step: 'تصویب معماری راهبرد در هیئت‌مدیره و تعیین مالک هر رکن', from: 0, to: 1, own: 'هیئت‌مدیره + مدیرعامل', pre: [], kpi: 'مصوبهٔ هیئت‌مدیره' }];
    if (gaps.length) rows.push({ ph: 'فاز ۰ — تصمیم و حاکمیت', step: 'تکمیل اطلاعات «نیازمند بررسی»: ' + gaps.slice(0, 6).join('، '), from: 0, to: 2, own: 'مدیر برنامه‌ریزی راهبردی', pre: [], kpi: 'بسته‌شدن شکاف‌های داده' });
    var all = Am.picks.concat(Am.en ? [Am.en] : []);
    all.forEach(function (p) {
      var s = p.r.s, start = s.H === 1 && s.tm[0] <= 3 ? 1 : s.H === 1 ? 2 : s.H === 2 ? 4 : 9, ph = start <= 1 ? 'فاز ۱ — اقدامات سریع و پیش‌نیازها' : start <= 4 ? 'فاز ۲ — حرکت‌های اصلی' : 'فاز ۳ — موتورهای آینده';
      if (p.r.label === 'cond') rows.push({ ph: 'فاز ۰ — تصمیم و حاکمیت', step: 'احراز شرایط «' + s.fa + '»: ' + p.r.gates.filter(function (g) { return g.r === 'unk'; }).map(function (g) { return g.n; }).join('، '), from: 0, to: 2, own: s.own, pre: [], kpi: 'نتیجهٔ احراز' });
      rows.push({ ph: ph, step: s.fa + ' (' + p.pillar + ')', from: start, to: start + s.tm[1], own: s.own, pre: s.pre, kpi: s.kpi.join('، '), stp: s.stp });
    });
    rows.push({ ph: 'پایش', step: 'بازبینی فصلی راهبرد و نشانه‌های هشدار؛ تصمیم ادامه/اصلاح', from: 3, to: 36, own: 'کمیتهٔ راهبرد', pre: [], kpi: 'شاخص‌های BSC' });
    return rows.sort(function (a, b) { return a.from - b.from; });
  }
  var PROFILES = [['base', 'وزن‌های شما', null], ['cons', 'محافظه‌کارانه (ریسک و اجراپذیری)', { feas: 35, fit: 15, impact: 15, risk: 25, time: 5, moat: 5 }], ['growth', 'رشدمحور (اثر و پایداری)', { feas: 15, fit: 20, impact: 35, risk: 5, time: 10, moat: 15 }], ['speed', 'سرعت‌محور', { feas: 25, fit: 20, impact: 15, risk: 10, time: 25, moat: 5 }]];

  /* ---------------- run ---------------- */
  function run(E0) {
    var E = merge(defaults(), clone(E0 || {})), eff = effective(E), Ef = eff.Ef;
    var S = signals(Ef), A = archScores(Ef, S);
    var ranked = Object.keys(A).sort(function (a, b) { return A[b] - A[a]; });
    var keyFields = ['co.goal', 'co.stage', 'co.sector', 'mkt.growth', 'mkt.position', 'mkt.priceCtl', 'mkt.fxInputs', 'mkt.sanctions', 'mkt.disrupt', 'mkt.exportOpen', 'mkt.unmet', 'cap.gmTrend', 'cap.util', 'cap.custConc', 'cap.digital', 'cap.mgmt', 'cap.cash', 'cap.costPos', 'cap.diff', 'cap.recurring', 'cap.subs', 'mkt.rivalry', 'mkt.buyers', 'cap.ebitdaM'];
    var nk = keyFields.filter(function (k) { return known(gp(Ef, k)); }).length + ((Ef.res || []).filter(function (r) { return r.name; }).length ? 1 : 0);
    var mode = E.mode !== 'auto' ? E.mode : (known(Ef.co.goal) && Ef.co.goal !== 'none') ? 'goal' : nk >= 10 ? 'diag' : 'full';
    var insufficient = nk < 4;
    if (A[ranked[0]] === 0 || mode === 'full' && !(A[ranked[0]] >= 5)) { A.dir = Math.max(A.dir, (A[ranked[0]] || 0) + 1); ranked = Object.keys(A).sort(function (a, b) { return A[b] - A[a]; }); }
    var main = ranked[0], second = A[ranked[1]] > 0 ? ranked[1] : null;
    var sigList = Object.keys(S).map(function (k) { return S[k]; }).sort(function (a, b) { return b.sev - a.sev || (WARCH[main][b.id] || 0) - (WARCH[main][a.id] || 0); });
    var X = { S: S, A: A, main: main, second: second, mode: mode, sigList: sigList };
    var R = assess(Ef, X); X.R = R;
    var AR = architect(Ef, X, R), act = AR.filter(function (a) { return a.active; }).sort(function (a, b) { return b.score - a.score; });
    var Am = insufficient ? null : (act.filter(function (a) { return a.a.arch.indexOf(main) >= 0; })[0] || act[0] || null); X.archMain = Am;
    var FS = selectFw(Ef, X, Am);
    var analyses = FS.sel.map(function (r) { var out; try { out = ANA[r.f.id](Ef, X); } catch (e) { out = { v: 'خطا در تحلیل: ' + e.message, rows: [], impl: [] }; } out.gaps = r.cov.miss; return { f: r.f, why: r.why, cov: r.cov.share, out: out }; });
    var O = opportunities(Ef, X, R);
    // data gaps that matter: inputs of selected frameworks + unknown gates of picks
    var gaps = []; FS.sel.forEach(function (r) { r.cov.miss.forEach(function (m) { if (gaps.indexOf(m) < 0) gaps.push(m); }); });
    // recommendation
    var picks = Am ? Am.picks.slice().sort(function (a, b) { return b.r.sc.total - a.r.sc.total; }) : [], lead = Am && Am.picks[0] && picks[0] && Am.picks[0].r.sc.total >= picks[0].r.sc.total - 15 ? Am.picks[0] : picks[0];
    var inArch = {}; if (Am) Am.picks.concat(Am.en ? [Am.en] : []).forEach(function (p) { inArch[p.r.id] = 1; });
    var alt = R.list.filter(function (r) { return !inArch[r.id] && r.label !== 'na' && r.label !== 'excluded' && r.label !== 'blocked' && r.s.lever !== 'enabler'; }).sort(function (a, b) { return b.sc.total - a.sc.total; })[0] || null;
    var altArch = act.filter(function (a) { return a !== Am; })[0] || null;
    var REC = insufficient ? { insufficient: true } : { arch: Am, main: lead || null, alt: alt, altArch: altArch, comp: Am && Am.en ? Am.en.r : null, roadmap: roadmap(Ef, X, Am, gaps) };
    // sensitivity: weight profiles and unknown gates
    var sens = PROFILES.map(function (p) {
      var Ew = clone(Ef); if (p[2]) Ew.W = p[2]; var Rw = assess(Ew, X), Aw = architect(Ew, Object.assign({}, X, { R: Rw }), Rw).filter(function (a) { return a.active; }).sort(function (a, b) { return b.score - a.score; });
      var Amw = Aw.filter(function (a) { return a.a.arch.indexOf(main) >= 0; })[0] || Aw[0];
      var top = Rw.list.filter(function (r) { return r.label !== 'na' && r.label !== 'excluded'; }).sort(function (a, b) { return b.sc.total - a.sc.total; }).slice(0, 3).map(function (r) { return r.s.fa; });
      return { id: p[0], fa: p[1], arch: Amw ? Amw.a.fa : '—', mainPick: Amw && Amw.picks.length ? Amw.picks[0].r.s.fa : '—', top: top };
    });
    var flips = Am ? [].concat.apply([], Am.picks.map(function (p) { return p.r.gates.filter(function (g) { return g.r === 'unk'; }).map(function (g) { var alt2 = (Am.a.pil.filter(function (x) { return x[0] === p.pillar; })[0] || [0, []])[1].filter(function (id) { return id !== p.r.id; }).map(function (id) { return R.byId[id]; }).filter(function (r) { return r && r.label !== 'excluded' && r.label !== 'blocked'; }).sort(function (a, b) { return b.sc.total - a.sc.total; })[0]; return { gate: g.n, sol: p.r.s.fa, then: alt2 ? alt2.s.fa : 'رکن «' + p.pillar + '» بدون گزینه می‌ماند' }; }); })) : [];
    var cnt = { all: R.list.length, rel: R.list.filter(function (r) { return r.label !== 'na'; }).length, def: R.list.filter(function (r) { return r.definitive; }).length, ex: R.list.filter(function (r) { return r.label === 'excluded'; }).length, arch: act.length };
    return { E: E, Ef: Ef, prov: eff.prov, X: eff.X, used: eff.used, S: S, sigList: sigList, A: A, ranked: ranked, main: main, second: second, mode: mode, insufficient: insufficient, nk: nk, R: R, AR: AR, act: act, Am: Am, FS: FS, analyses: analyses, O: O, gaps: gaps, REC: REC, sens: sens, flips: flips, count: cnt };
  }
  Hub.stratEngine = { defaults: defaults, merge: merge, run: run, extract: extract, GOALS: GOALS, SIG: SIG, ANA: ANA, PROFILES: PROFILES, goalFa: goalFa, vrioRes: vrioRes, forces: forces };
  if (typeof module !== 'undefined' && module.exports) module.exports = Hub.stratEngine;
})(typeof window !== 'undefined' ? window : globalThis);
