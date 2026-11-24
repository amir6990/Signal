/* =====================================================================
 * FINANCING & ASSET MONETIZATION ENGINE — the decision layer over the
 * solution bank (js/data/finbank-*.js).
 *   run(E, D) → diagnosis, gates, sizing, economics, scores, combinations,
 *   hidden opportunities and the recommendation, from the four-part input
 *   E = { co, assets[], fin, cons, P (assumptions), W (weights), mode } and,
 *   when loaded, the company statements D (Hub.companyData.series).
 * Rules that keep it honest (master brief §8, §14):
 *   · a solution whose regulatory gates are not all met is never a definitive
 *     recommendation; unknown answers never score as positive;
 *   · hard constraints the user marked "yes" exclude the solution; unknown
 *     constraints make it conditional;
 *   · debt is not recommended without a repayment analysis; with no repayment
 *     capacity, debt routes are conditional and equity / asset routes rank up;
 *   · potential amounts apply explicit haircuts (assumptions, all editable):
 *     the appraisal value of an asset is never the amount raised;
 *   · enablers (subsidiary, holding, SPV) raise no cash on their own;
 *   · one asset is not counted twice in a combined structure.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  function num(v) { return v === null || v === undefined || v === '' ? NaN : Number(v); }
  function has(v) { return isFinite(num(v)); }
  function nz(v) { var x = num(v); return isFinite(x) ? x : 0; }
  function fmt(v) { return Hub.util && Hub.util.fmtNum ? Hub.util.fmtNum(v) : String(Math.round(v)); }
  function pct(v, d) { return isFinite(v) ? (v * 100).toFixed(d == null ? 1 : d) + '٪' : '–'; }
  var TRI = { yes: true, no: false };
  function tri(v) { return v in TRI ? TRI[v] : null; }
  var UNIT_PER_BN = { thousand: 1e6, million: 1e3, billion: 1 };

  /* ---------- defaults ---------- */
  function defaults() {
    return { mode: 'auto',
      co: { name: '', industry: '', listing: 'unk', form: 'unk', ownership: '', parentSubs: 'unk', purpose: 'unknown', need: null, needBy: null, use: '', canEquity: 'unk', debtAppetite: 'unk', investorOk: 'unk', assetSaleOk: 'unk', controlPriority: 'unk',
        fxRevenue: 'unk', ime: 'unk', service: 'unk', smallCo: 'unk', projectCost: null, valuation: null, shares: null, unit: 'million' },
      assets: [],
      fin: { rev: null, cogs: null, ebitda: null, ebit: null, fc: null, pbt: null, ni: null, ni1: null, cfo1: null, cfo2: null, ta: null, tl: null, eq: null, cap: null, retained: null, cash: null, debt: null, debtST: null, ca: null, cl: null, ar: null, inv: null, ap: null,
        sukukOut: null, obligations: null, rating: 'unk', guarantor: 'unk', opinion: 'unk', defaulted: 'unk', priorIssues: 'unk' },
      cons: { noSale: 'unk', noOwn: 'unk', control: 'unk', noDebt: 'unk', noPledge: 'unk', noTransfer: 'unk', shLimits: 'unk', tax: 'unk', timeLimit: null, reg: 'unk', canSub: 'unk', canFund: 'unk', partnerOk: 'unk' },
      P: { debtRate: 0.30, sukukRate: 0.30, eqCost: null, hurdle: null, tax: 0.25, tenor: 4, maxLev: 3.5, minCov: 2, laCap: 0.9, ltvRE: 0.5, ltvShares: 0.5, ijaraCover: 0.8, reitDiscount: 0.15, reitOffer: 0.49, slbDiscount: 0.1, saleDiscount: 0.2,
        factorShare: 0.8, invShare: 0.7, salafShare: 0.25, manfaaShare: 0.3, blockShare: 0.2, subOffer: 0.25, finSaleShare: 0.3, ipoFloat: 0.15, projDebt: 0.6, projEq: 0.4, contractShare: 0.5, crowdCap: null,
        costSukuk: 0.035, costEquity: 0.02, costFund: 0.03, costBank: 0.01, costSale: 0.02 },
      W: { reg: 30, fit: 25, cost: 15, speed: 15, own: 15 }, cases: [] };
  }
  // assumptions shown to the user (all editable): never presented as market rates
  var PLAB = { debtRate: 'نرخ بدهی جدید (نرخ پیشنهادی بانک یا نرخ اوراق شما)', sukukRate: 'هزینهٔ تمام‌شدهٔ اوراق (اگر زبانهٔ هزینهٔ اوراق محاسبه نشده باشد)', eqCost: 'هزینهٔ سرمایهٔ سهام (بازده مورد انتظار سهامدار)', hurdle: 'نرخ تنزیل برای NPV',
    tax: 'نرخ مالیات', tenor: 'مدت تأمین مالی بدهی (سال)', maxLev: 'حداکثر بدهی خالص / EBITDA', minCov: 'حداقل پوشش بهره (EBITDA ÷ هزینهٔ مالی)', laCap: 'سقف بدهی‌ها / دارایی‌ها', ltvRE: 'ضریب وثیقهٔ ملک', ltvShares: 'ضریب وثیقهٔ سهام',
    ijaraCover: 'نسبت مبلغ اوراق اجاره به ارزش کارشناسی دارایی', reitDiscount: 'تخفیف ارزش‌گذاری در صندوق املاک', reitOffer: 'سهم واحدهای عرضه‌شدهٔ صندوق', slbDiscount: 'تخفیف فروش در فروش و اجارهٔ مجدد', saleDiscount: 'تخفیف فروش دارایی مازاد',
    factorShare: 'نسبت قابل تنزیل مطالبات', invShare: 'نسبت قابل تأمین موجودی', salafShare: 'سهم قابل پیش‌فروش از فروش سالانه', manfaaShare: 'سهم قابل پیش‌فروش منافع از فروش سالانه', blockShare: 'سهم قابل فروش بلوک سهام بورسی',
    subOffer: 'سهم عرضهٔ شرکت تابعه', finSaleShare: 'سهم قابل فروش سرمایه‌گذاری‌های غیرراهبردی', ipoFloat: 'سهم عرضهٔ اولیه از ارزش سهام', projDebt: 'سهم بدهی در پروژه', projEq: 'سهم سهام / شریک در پروژه', contractShare: 'نسبت قابل تأمین ارزش قراردادها',
    crowdCap: 'سقف تأمین مالی جمعی هر طرح (استعلام از فرابورس)', costSukuk: 'هزینهٔ یک‌بارهٔ انتشار اوراق (٪ مبلغ)', costEquity: 'هزینهٔ افزایش سرمایه / عرضه (٪)', costFund: 'هزینهٔ تأسیس صندوق (٪)', costBank: 'هزینهٔ یک‌بارهٔ تسهیلات (٪)', costSale: 'هزینهٔ فروش دارایی (٪)' };

  /* ---------- financial inputs: manual first, statements as fallback ---------- */
  function finFrom(E, D) {
    var f = {}, src = {}, l = D ? D.n - 1 : -1, pick = function (k, dv) { var m = num(E.fin[k]); if (isFinite(m)) { f[k] = m; src[k] = 'manual'; } else if (dv !== null && dv !== undefined && dv !== false && isFinite(dv)) { f[k] = dv; src[k] = 'statements'; } else { f[k] = NaN; src[k] = 'unknown'; } };
    var v = function (a, i) { return a && isFinite(a[i]) ? a[i] : NaN; };
    pick('rev', D && v(D.revenue, l)); pick('cogs', D && Math.abs(v(D.cogs, l))); pick('ebitda', D && v(D.ebitda, l)); pick('ebit', D && v(D.ebit, l)); pick('fc', D && Math.abs(v(D.ie, l))); pick('pbt', D && v(D.ebt, l));
    pick('ni', D && v(D.ni, l)); pick('ni1', D && l > 0 ? v(D.ni, l - 1) : NaN); pick('cfo1', D && D.cfo ? v(D.cfo, l) : NaN); pick('cfo2', D && D.cfo && l > 0 ? v(D.cfo, l - 1) : NaN);
    pick('ta', D && (v(D.taFile, l) || v(D.ta, l))); pick('eq', D && v(D.equity, l)); pick('tl', D && isFinite(f.ta) && isFinite(f.eq) ? f.ta - f.eq : NaN); pick('cap', D && D.capital ? v(D.capital, l) : NaN); pick('retained', D && v(D.retained, l));
    pick('cash', D && v(D.cash, l)); pick('debt', D && (v(D.debt, l) + nz(D.debtLike && D.debtLike[l]))); pick('ca', D && v(D.ca, l)); pick('cl', D && v(D.cl, l)); pick('ar', D && v(D.ar, l)); pick('inv', D && v(D.inv, l)); pick('ap', D && v(D.ap, l));
    var B = D && Hub.sukukRules && Hub.sukukRules.borrowings ? (function () { try { return Hub.sukukRules.borrowings(D); } catch (e) { return null; } })() : null;
    pick('debtST', B ? B.current : NaN); pick('sukukOut', NaN); pick('obligations', NaN);
    if (!isFinite(f.eq) && isFinite(f.ta) && isFinite(f.tl)) { f.eq = f.ta - f.tl; src.eq = 'derived'; }
    if (!isFinite(f.ebitda) && isFinite(f.ebit)) { f.ebitda = f.ebit; src.ebitda = 'derived (EBIT)'; }
    ['fc', 'debt', 'debtST', 'ta', 'tl', 'cap', 'sukukOut', 'cogs'].forEach(function (k) { if (isFinite(f[k])) f[k] = Math.abs(f[k]); });
    ['rating', 'guarantor', 'opinion', 'defaulted', 'priorIssues'].forEach(function (k) { f[k] = E.fin[k]; });
    return { f: f, src: src };
  }

  /* ---------- assets ---------- */
  var ATYPE = { realestate: 'املاک و مستغلات', machinery: 'ماشین‌آلات و تجهیزات', financial: 'دارایی مالی و سرمایه‌گذاری', receivable: 'مطالبات', inventory: 'موجودی کالا', contract: 'قرارداد فروش / جریان نقد قراردادی' };
  function assetView(E) {
    var A = (E.assets || []).map(function (a) { var x = Object.assign({}, a); x.mv = num(a.mv); x.bv = num(a.bv); x.inc = num(a.inc); x.util = num(a.util); x.idle = num(a.idle); x.stake = num(a.stake); return x; });
    var sum = function (fn, key) { return A.filter(fn).reduce(function (s, a) { return s + (isFinite(a[key || 'mv']) ? a[key || 'mv'] : 0); }, 0); };
    var isRE = function (a) { return a.type === 'realestate'; }, isLand = function (a) { return isRE(a) && (a.use === 'land' || (isFinite(a.idle) && a.idle >= 0.5 && a.develop !== 'no')); };
    var free = function (a) { return a.title !== 'issue' && a.transfer !== 'no'; }, pled = function (a) { return a.title !== 'issue' && a.pledge !== 'no'; };
    var V = {
      list: A, re: sum(isRE), reIncome: sum(function (a) { return isRE(a) && a.inc > 0; }), reIncomeFree: sum(function (a) { return isRE(a) && a.inc > 0 && free(a); }), reIdle: sum(function (a) { return isRE(a) && ((isFinite(a.inc) && a.inc <= 0) || (isFinite(a.idle) && a.idle >= 0.3)); }),   // a property whose income was not entered is not assumed idle
      reUnknown: sum(function (a) { return isRE(a) && !isFinite(a.inc) && !(isFinite(a.idle) && a.idle >= 0.3); }),
      land: sum(isLand), mach: sum(function (a) { return a.type === 'machinery'; }), fixedFree: sum(function (a) { return (isRE(a) || a.type === 'machinery') && free(a); }), fixedFreeUnk: A.some(function (a) { return (isRE(a) || a.type === 'machinery') && (a.title === 'unk' || a.transfer === 'unk' || !a.transfer); }),
      pledgeRE: sum(function (a) { return isRE(a) && pled(a); }), fin: sum(function (a) { return a.type === 'financial'; }), finListed: sum(function (a) { return a.type === 'financial' && a.listed === 'yes'; }),
      finNonStrat: sum(function (a) { return a.type === 'financial' && a.strategic !== 'high'; }), subs: A.filter(function (a) { return a.type === 'financial' && (a.stake >= 50 || a.sub === 'yes'); }),
      subsProfit: sum(function (a) { return a.type === 'financial' && (a.stake >= 50 || a.sub === 'yes') && a.profitable === 'yes'; }), ar: sum(function (a) { return a.type === 'receivable'; }), arLong: sum(function (a) { return a.type === 'receivable' && a.longterm === 'yes'; }),
      inv: sum(function (a) { return a.type === 'inventory'; }), invStd: sum(function (a) { return a.type === 'inventory' && a.ime === 'yes'; }), contract: sum(function (a) { return a.type === 'contract'; }),
      surplus: sum(function (a) { return (isRE(a) || a.type === 'machinery') && (a.strategic === 'low' || (isFinite(a.idle) && a.idle >= 0.5)) && free(a); }),
      idleCount: A.filter(function (a) { return (isFinite(a.idle) && a.idle >= 0.3) || (isFinite(a.util) && a.util <= 0.6); }).length,
      lowUtil: A.filter(function (a) { return a.type === 'machinery' && isFinite(a.util) && a.util <= 0.7; }).length,
      mvTotal: sum(function () { return true; }), bvTotal: sum(function () { return true; }, 'bv'), incTotal: sum(function () { return true; }, 'inc')
    };
    V.revalGap = A.filter(function (a) { return (isRE(a) || a.type === 'machinery') && isFinite(a.mv) && isFinite(a.bv); }).reduce(function (s, a) { return s + a.mv - a.bv; }, 0);
    return V;
  }

  /* ---------- diagnosis ---------- */
  function diagnose(E, F, V) {
    var f = F.f, P = E.P, r = [], add = function (key, fa, v, kind, formula, status, note) { r.push({ key: key, fa: fa, v: v, kind: kind, formula: formula, status: isFinite(v) || kind === 'text' ? status : 'unk', note: note || '' }); };
    var nd = f.debt - (isFinite(f.cash) ? f.cash : 0), de = f.debt / f.eq, ndE = nd / f.ebitda, cov = f.ebitda / f.fc, icov = f.ebit / f.fc, la = f.tl / f.ta, cr = f.ca / f.cl, eqR = f.eq / f.ta, nwc = f.ca - f.cl, cfoSum = f.cfo1 + f.cfo2;
    add('de', 'بدهی بهره‌دار / حقوق مالکانه', de, 'x', 'بدهی بهره‌دار ÷ حقوق مالکانه', de > 1.5 ? 'warn' : 'ok');
    add('nde', 'بدهی خالص / EBITDA', ndE, 'x', '(بدهی بهره‌دار − نقد) ÷ EBITDA', !(f.ebitda > 0) ? 'bad' : ndE > P.maxLev ? 'bad' : ndE > P.maxLev * 0.7 ? 'warn' : 'ok', 'حد شما ' + P.maxLev + 'x');
    add('cov', 'پوشش هزینهٔ مالی (EBITDA ÷ هزینهٔ مالی)', f.fc > 0 ? cov : (f.fc === 0 ? Infinity : NaN), 'x', 'EBITDA ÷ هزینهٔ مالی', cov < P.minCov ? 'bad' : cov < P.minCov * 1.5 ? 'warn' : 'ok', 'حد شما ' + P.minCov + 'x');
    add('icov', 'پوشش بهره با سود عملیاتی', f.fc > 0 ? icov : NaN, 'x', 'سود عملیاتی ÷ هزینهٔ مالی', icov < 1.5 ? 'bad' : icov < 3 ? 'warn' : 'ok');
    add('cfo', 'جریان نقد عملیاتی سال آخر', f.cfo1, 'num', 'صورت جریان‌های نقدی', f.cfo1 < 0 ? 'bad' : 'ok');
    add('cfo2', 'جمع جریان نقد عملیاتی دو سال اخیر', cfoSum, 'num', 'سال آخر + سال قبل (شرط بانی سازمان بورس: مثبت)', cfoSum > 0 ? 'ok' : 'bad');
    add('nwc', 'سرمایه در گردش خالص', nwc, 'num', 'دارایی‌های جاری − بدهی‌های جاری', nwc < 0 ? 'warn' : 'ok');
    add('cr', 'نسبت جاری', cr, 'x', 'دارایی‌های جاری ÷ بدهی‌های جاری', cr < 1 ? 'bad' : cr < 1.3 ? 'warn' : 'ok');
    add('eqr', 'نسبت مالکانه', eqR, 'pct', 'حقوق مالکانه ÷ جمع دارایی‌ها', eqR < 0.2 ? 'warn' : 'ok');
    add('la', 'بدهی‌ها / دارایی‌ها', la, 'pct', 'جمع بدهی‌ها ÷ جمع دارایی‌ها (سقف ' + pct(P.laCap, 0) + ')', la > P.laCap ? 'bad' : la > 0.8 ? 'warn' : 'ok');
    add('pledge', 'ارزش دارایی‌های قابل توثیق (ملک آزاد + سهام بورسی)', V.pledgeRE + V.finListed, 'num', 'جمع ارزش روز دارایی‌هایی که توثیق آن‌ها «خیر» نیست', 'ok', V.list.length ? '' : 'دارایی ثبت نشده');
    add('debtST', 'بدهی‌های سررسیدشونده تا یک سال', f.debtST, 'num', 'تسهیلات جاری', f.debtST > nz(f.cfo1) ? 'warn' : 'ok');
    add('obl', 'تعهدات مالی دیگر (ضمانت‌ها، تعهدات سرمایه‌ای)', f.obligations, 'num', 'ورودی شما', 'ok');
    // art. 141: accumulated losses ≥ half of capital (exact when retained is given; otherwise equity < half capital as a proxy)
    var art = isFinite(f.retained) && isFinite(f.cap) ? (f.retained < 0 && -f.retained >= 0.5 * f.cap) : (isFinite(f.eq) && isFinite(f.cap) ? f.eq < 0.5 * f.cap : null);
    // new-debt capacity at your limits: leverage, interest cover, and repayment of principal from operating profit over the tenor
    var rate = P.debtRate, k = 1 - P.tax, T = Math.max(1, P.tenor);
    var capLev = f.ebitda > 0 && isFinite(nd) ? P.maxLev * f.ebitda - nd : NaN, capCov = f.ebitda > 0 && isFinite(f.fc) && rate > 0 ? (f.ebitda / P.minCov - f.fc) / rate : NaN;
    var capRep = isFinite(f.ebit) && isFinite(f.fc) && rate > 0 ? ((f.ebit - f.fc) * k) / (rate * k + 1 / T) : NaN;
    var parts = [capLev, capCov, capRep].filter(isFinite), debtCap = parts.length ? Math.max(0, Math.min.apply(null, parts)) : NaN;
    if (!(f.ebitda > 0) && isFinite(f.ebitda)) debtCap = 0;
    var payCap = isFinite(f.ebit) && isFinite(f.fc) ? Math.max(0, f.ebit / P.minCov - f.fc) : NaN;
    add('pay', 'ظرفیت پرداخت سود / اجارهٔ جدید (سالانه)', payCap, 'num', 'سود عملیاتی ÷ ' + P.minCov + ' − هزینهٔ مالی فعلی', payCap > 0 ? 'ok' : 'bad');
    add('dcap', 'ظرفیت تأمین مالی بدهی جدید', debtCap, 'num', 'کمترِ سقف اهرم، سقف پوشش بهره و بازپرداخت از محل سود عملیاتی (نرخ ' + pct(rate) + '، ' + T + ' سال)', debtCap > 0 ? 'ok' : 'bad');
    var capCeil = isFinite(f.cap) ? Math.max(0, f.cap - nz(f.sukukOut)) : NaN;
    add('capceil', 'سقف سرمایه برای اوراق (رویهٔ اجرایی سازمان)', capCeil, 'num', 'سرمایهٔ ثبتی − اوراق در جریان', 'ok');
    add('rating', 'رتبهٔ اعتباری', NaN, 'text', '', 'ok', { none: 'ندارد', BBB: 'BBB یا پایین‌تر', A: 'محدودهٔ A', AA: 'AA یا بالاتر', unk: 'نامشخص' }[f.rating] || 'نامشخص');
    add('default', 'سابقهٔ نکول', NaN, 'text', '', f.defaulted === 'yes' ? 'bad' : 'ok', { yes: 'دارد', no: 'ندارد' }[f.defaulted] || 'نامشخص');
    add('prior', 'سابقهٔ انتشار اوراق', NaN, 'text', '', 'ok', { yes: 'دارد', no: 'ندارد' }[f.priorIssues] || 'نامشخص');
    // problems
    var pr = [], P1 = function (k, fa, ev) { pr.push({ k: k, fa: fa, ev: ev }); };
    if ((isFinite(ndE) && ndE > P.maxLev) || (f.fc > 0 && cov < P.minCov) || la > 0.8 || (isFinite(f.ebitda) && f.ebitda <= 0)) P1('lev', 'اهرم بالا و ظرفیت محدود بازپرداخت', 'بدهی خالص/EBITDA ' + (isFinite(ndE) ? ndE.toFixed(2) + 'x' : '–') + '، پوشش ' + (isFinite(cov) ? cov.toFixed(2) + 'x' : '–') + '، بدهی/دارایی ' + pct(la));
    if (cr < 1 || f.cfo1 < 0 || nwc < 0) P1('liq', 'فشار نقدینگی کوتاه‌مدت', 'نسبت جاری ' + (isFinite(cr) ? cr.toFixed(2) : '–') + '، جریان نقد عملیاتی ' + (isFinite(f.cfo1) ? fmt(f.cfo1) : '–'));
    if (isFinite(cfoSum) && cfoSum <= 0) P1('cfoNeg', 'جمع جریان نقد عملیاتی دو سال مثبت نیست (مانع انتشار اوراق بدون ضمانت بانکی)', fmt(cfoSum));
    if (art) P1('art141', 'زیان انباشته ≥ نصف سرمایه (مادهٔ ۱۴۱ اصلاحیهٔ قانون تجارت)', isFinite(f.retained) ? 'زیان انباشته ' + fmt(-f.retained) + ' در برابر سرمایه ' + fmt(f.cap) : 'برآورد از حقوق مالکانه کمتر از نصف سرمایه');
    if (V.reIdle > 0 && V.re > 0) P1('idleRE', 'املاک کم‌بازده یا راکد', 'ارزش ' + fmt(V.reIdle) + ' از ' + fmt(V.re) + ' املاک بدون درآمد یا با بهره‌برداری پایین');
    if (V.mvTotal > 0 && isFinite(f.ta) && V.surplus > 0.1 * f.ta) P1('trapped', 'منابع محبوس در دارایی‌های مازاد', 'دارایی مازاد ' + fmt(V.surplus) + ' (' + pct(V.surplus / f.ta) + ' از دارایی‌ها)');
    if (V.arLong > 0 || (f.ar > 0 && f.rev > 0 && f.ar / f.rev > 0.33 && !(f.ta > 0 && f.ar < 0.05 * f.ta))) P1('longAR', 'مطالبات طولانی یا سنگین', 'مطالبات / فروش ' + (f.rev > 0 && isFinite(f.ar) ? pct(f.ar / f.rev) : '–') + (V.arLong > 0 ? '؛ مطالبات بلندمدت ' + fmt(V.arLong) : ''));
    if (V.subs.length >= 2 || E.co.parentSubs === 'yes') P1('holding', 'ساختار گروهی با شرکت‌های تابعه', V.subs.length + ' شرکت تابعهٔ ثبت‌شده');
    if (f.guarantor === 'no' && (f.rating === 'none' || f.rating === 'unk')) P1('noCredit', 'مسیر اعتباری اوراق (ضامن یا رتبه) فراهم نیست', 'ضامن: خیر؛ رتبه: ' + (f.rating === 'none' ? 'ندارد' : 'نامشخص'));
    var missing = ['ta', 'tl', 'ebit', 'fc', 'cfo1', 'cfo2', 'cap'].filter(function (k) { return !isFinite(f[k]); });
    return { ratios: r, problems: pr, nd: nd, cov: cov, la: la, cfoSum: cfoSum, art141: art, debtCap: debtCap, capLev: capLev, capCov: capCov, capRep: capRep, capCeil: capCeil, payCap: payCap, missing: missing };
  }

  /* ---------- gates ---------- */
  var REG = { audit: 1, jsc: 1, credit: 1, nart141: 1, cfo2: 1, la: 1, profit2: 1 }, HARD = { audit: 1, jsc: 1, nart141: 1, cfo2: 1, la: 1, profit2: 1 };
  var SUKUK = { D01: 1, D02: 1, D03: 1, D04: 1, D06: 1, D07: 1, D09: 1, A04: 1 };
  var GNAME = { audit: 'صورت‌های حسابرسی‌شده با اظهارنظر مقبول یا مشروط', jsc: 'شرکت سهامی', credit: 'ضامن یا رتبهٔ اعتباری', nart141: 'عدم شمول مادهٔ ۱۴۱', cfo2: 'جمع جریان نقد عملیاتی دو سال مثبت', la: 'بدهی‌ها / دارایی‌ها زیر سقف',
    profit2: 'سودآوری دو سال اخیر', debtcap: 'ظرفیت بازپرداخت بدهی جدید', notListed: 'شرکت هنوز پذیرفته نشده', listedHold: 'سهام بورسی در پرتفوی', service: 'ظرفیت خدمت قابل پیش‌فروش', ime: 'کالای پذیرفته‌شده در بورس کالا', fx: 'درآمد ارزی',
    smallCo: 'کسب‌وکار کوچک غیربورسی', project: 'طرح / پروژهٔ مشخص', ar: 'مطالبات', contract: 'قرارداد فروش بلندمدت', asset: 'دارایی ثابت واجد شرایط (آزاد و قابل انتقال)', re: 'املاک', reIncome: 'املاک درآمدزای قابل انتقال', land: 'زمین راکد یا قابل توسعه',
    pledgeable: 'دارایی قابل توثیق', idle: 'دارایی بلااستفاده', surplus: 'دارایی مازاد غیرراهبردی', lowUtil: 'ظرفیت بلااستفادهٔ تجهیزات', inv: 'موجودی کالا', fin: 'سرمایه‌گذاری مالی', subs: 'شرکت‌های تابعه',
    'c:noDebt': 'محدودیت افزایش بدهی', 'c:noEquity': 'امکان افزایش سرمایه', 'c:noOwn': 'محدودیت انتقال مالکیت', 'c:control': 'ضرورت حفظ کنترل', 'c:noSale': 'محدودیت فروش دارایی', 'c:noPartner': 'امکان ورود شریک یا سرمایه‌گذار', 'c:noSub': 'امکان تأسیس شرکت تابعه',
    'c:noFund': 'امکان ایجاد صندوق', equityOk: 'توان و تمایل سهامداران به آورده', partner: 'سرمایه‌گذار یا شریک مایل', 'c:noPledge': 'محدودیت توثیق', 'c:noTransfer': 'محدودیت انتقال دارایی' };
  function gate(code, E, F, V, G) {
    var f = F.f, co = E.co, c = E.cons, T3 = function (t) { return t === true ? 'pass' : t === false ? 'na' : 'unk'; };
    var neg = function (v) { return v === 'yes' ? 'conflict' : v === 'no' ? 'pass' : 'unk'; }, pos = function (v) { return v === 'yes' ? 'pass' : v === 'no' ? 'conflict' : 'unk'; };
    switch (code) {
      case 'audit': return f.opinion === 'unqualified' || f.opinion === 'qualified' ? 'pass' : f.opinion === 'adverse' || f.opinion === 'none' ? 'fail' : 'unk';
      case 'jsc': return co.form === 'pjs' || co.form === 'prjs' ? 'pass' : co.form === 'other' ? 'fail' : 'unk';
      case 'credit': return f.guarantor === 'yes' || /^(BBB|A|AA)$/.test(f.rating) ? 'pass' : f.guarantor === 'no' && f.rating === 'none' ? 'fail' : 'unk';
      case 'nart141': return G.art141 === true ? 'fail' : G.art141 === false ? 'pass' : 'unk';
      case 'cfo2': return isFinite(G.cfoSum) ? (G.cfoSum > 0 ? 'pass' : (f.guarantor === 'yes' ? 'pass' : 'fail')) : 'unk';
      case 'la': return isFinite(G.la) ? (G.la <= E.P.laCap ? 'pass' : (f.guarantor === 'yes' ? 'pass' : 'fail')) : 'unk';
      case 'profit2': return isFinite(f.ni) && isFinite(f.ni1) ? (f.ni > 0 && f.ni1 > 0 ? 'pass' : 'fail') : 'unk';
      case 'debtcap': return isFinite(G.debtCap) ? (G.debtCap > 0 ? 'pass' : 'fail') : 'unk';
      case 'notListed': return co.listing === 'none' ? 'pass' : co.listing === 'unk' ? 'unk' : 'na';
      case 'listedHold': return V.finListed > 0 ? 'pass' : V.fin > 0 ? 'unk' : 'na';
      case 'service': return T3(tri(co.service)); case 'ime': return co.ime === 'yes' || V.invStd > 0 ? 'pass' : T3(tri(co.ime));
      case 'fx': return T3(tri(co.fxRevenue)); case 'smallCo': return T3(tri(co.smallCo));
      case 'project': return nz(co.projectCost) > 0 || co.purpose === 'project' ? 'pass' : 'na';
      case 'ar': return V.ar > 0 || f.ar > 0 ? 'pass' : 'na';
      case 'contract': return V.contract > 0 ? 'pass' : 'na';
      case 'asset': return V.fixedFree > 0 ? 'pass' : V.fixedFreeUnk ? 'unk' : (V.re + V.mach > 0 ? 'fail' : 'na');
      case 're': return V.re > 0 ? 'pass' : 'na';
      case 'reIncome': return V.reIncomeFree > 0 ? 'pass' : V.reIncome > 0 ? 'unk' : 'na';
      case 'land': return V.land > 0 ? 'pass' : 'na';
      case 'pledgeable': return V.pledgeRE + V.finListed > 0 ? 'pass' : V.re + V.fin > 0 ? 'unk' : 'na';
      case 'idle': return V.idleCount > 0 ? 'pass' : 'na';
      case 'surplus': return V.surplus > 0 ? 'pass' : 'na';
      case 'lowUtil': return V.lowUtil > 0 ? 'pass' : 'na';
      case 'inv': return V.inv > 0 || f.inv > 0 ? 'pass' : 'na';
      case 'fin': return V.fin > 0 ? 'pass' : 'na';
      case 'subs': return V.subs.length > 0 || co.parentSubs === 'yes' ? 'pass' : co.parentSubs === 'no' ? 'na' : 'unk';
      case 'c:noDebt': return co.debtAppetite === 'none' ? 'conflict' : neg(c.noDebt);
      case 'c:noEquity': case 'equityOk': return co.canEquity === 'no' ? 'conflict' : co.canEquity === 'yes' ? 'pass' : 'unk';
      case 'partner': return co.investorOk === 'no' || c.partnerOk === 'no' ? 'conflict' : co.investorOk === 'yes' || c.partnerOk === 'yes' ? 'pass' : 'unk';
      case 'c:noOwn': return neg(c.noOwn); case 'c:control': return c.control === 'yes' || co.controlPriority === 'high' ? 'conflict' : c.control === 'no' ? 'pass' : 'unk';
      case 'c:noSale': return co.assetSaleOk === 'no' ? 'conflict' : neg(c.noSale);
      case 'c:noPartner': return co.investorOk === 'no' ? 'conflict' : pos(c.partnerOk);
      case 'c:noSub': return pos(c.canSub); case 'c:noFund': return pos(c.canFund);
      case 'c:noPledge': return neg(c.noPledge); case 'c:noTransfer': return neg(c.noTransfer);
    }
    return 'unk';
  }

  /* ---------- sizing: potential amount with formula and assumptions ---------- */
  function size(s, E, F, V, G) {
    var f = F.f, P = E.P, co = E.co, need = num(co.need), dc = G.debtCap, cc = G.capCeil, mn = function () { var a = [].slice.call(arguments).filter(isFinite); return a.length ? Math.min.apply(null, a) : NaN; };
    var o = function (amt, fx, as, val) { return { amt: amt, formula: fx, as: as || [], val: val }; }, sm = SUKUK[s.id] ? '؛ سقف سرمایه ' + (isFinite(cc) ? fmt(cc) : 'نامشخص') : '';
    switch (s.sz) {
      case 'murabaha': return o(mn(dc, SUKUK[s.id] ? cc : NaN, isFinite(need) ? need : NaN), 'کمترِ ظرفیت بدهی (' + fmt(dc) + ')' + sm + (isFinite(need) ? '، نیاز ' + fmt(need) : ''), ['مبلغ مرابحه به خرید مشخص (پیش‌فاکتور) محدود است']);
      case 'smallmur': var scap = 2000 * (UNIT_PER_BN[co.unit] || 1e3); return o(mn(dc, scap, isFinite(need) ? need : NaN), 'کمترِ ظرفیت بدهی و ۲٬۰۰۰ میلیارد ریال (' + fmt(scap) + ' به واحد شما)', ['سررسید حداکثر ۱۸ ماه']);
      case 'ijara': var base = V.fixedFree * P.ijaraCover; return o(mn(dc, cc, V.fixedFree > 0 ? base : NaN), 'کمترِ ظرفیت بدهی، سقف سرمایه و ' + pct(P.ijaraCover, 0) + ' × ارزش دارایی آزاد و قابل انتقال (' + fmt(V.fixedFree) + ')', ['ضریب پوشش ' + pct(P.ijaraCover, 0) + ' (فرض قابل تغییر)']);
      case 'manfaa': return o(mn(dc, f.rev * P.manfaaShare), 'کمترِ ظرفیت بدهی و ' + pct(P.manfaaShare, 0) + ' × فروش', [PLAB.manfaaShare]);
      case 'salaf': return o(f.rev * P.salafShare, pct(P.salafShare, 0) + ' × فروش سالانه', [PLAB.salafShare]);
      case 'project': return o(nz(co.projectCost) * P.projDebt || NaN, pct(P.projDebt, 0) + ' × هزینهٔ پروژه (' + fmt(nz(co.projectCost)) + ')', [PLAB.projDebt]);
      case 'projectfund': return o(nz(co.projectCost) * P.projEq || NaN, pct(P.projEq, 0) + ' × هزینهٔ پروژه', [PLAB.projEq]);
      case 'jv': return o(nz(co.projectCost) * P.projEq || NaN, 'آوردهٔ نقدی شریک ≈ ' + pct(P.projEq, 0) + ' × هزینهٔ پروژه (به شرکت پروژه وارد می‌شود، نه شرکت)', ['زمین/دارایی شرکت آورده است'], V.land || V.re);
      case 'ar': case 'factoring': var arv = V.ar > 0 ? V.ar : f.ar; return o(arv * P.factorShare, pct(P.factorShare, 0) + ' × مطالبات (' + fmt(arv) + ')', [PLAB.factorShare]);
      case 'facility': return o(mn(dc, isFinite(need) ? need : NaN), 'ظرفیت بدهی' + (isFinite(need) ? ' (محدود به نیاز)' : ''), []);
      case 'purchases': return o(mn(dc, isFinite(need) ? need : f.cogs * 0.25), 'کمترِ ظرفیت بدهی و نیاز (یا ۲۵٪ بهای تمام‌شده)', ['ربع بهای تمام‌شده به‌عنوان خرید سه‌ماهه — فرض']);
      case 'payables': return o(mn(isFinite(need) ? need : NaN, f.ap, dc), 'کمترِ نیاز، پرداختنی‌های تجاری و ظرفیت بدهی', []);
      case 'contract': return o(V.contract * P.contractShare, pct(P.contractShare, 0) + ' × ارزش قراردادها', [PLAB.contractShare]);
      case 'equity':
        // unconfirmed capacity of shareholders / investors is not counted as money
        var okEq = s.id === 'E01' ? co.canEquity === 'yes' : (co.investorOk === 'yes' || E.cons.partnerOk === 'yes');
        if (!okEq) return o(NaN, s.id === 'E01' ? 'توان و تمایل سهامداران به آورده تأیید نشده (فیلد «امکان افزایش سرمایه») — مبلغ محاسبه نمی‌شود' : 'امکان ورود سرمایه‌گذار تأیید نشده — مبلغ محاسبه نمی‌شود', []);
        var gap = isFinite(G.nd) && f.ebitda > 0 ? Math.max(0, G.nd - P.maxLev * f.ebitda) : NaN; return o(isFinite(need) ? need : gap > 0 ? gap : NaN, isFinite(need) ? 'نیاز اعلام‌شده' : 'آورده لازم برای رساندن بدهی خالص/EBITDA به ' + P.maxLev + 'x', ['تحقق به توان و تمایل سهامداران بستگی دارد']);
      case 'ipo': return o(num(co.valuation) * P.ipoFloat, pct(P.ipoFloat, 0) + ' × ارزش سهام (ورودی شما' + (has(co.valuation) ? '' : ' — وارد نشده؛ نیازمند ارزش‌گذاری') + ')', [PLAB.ipoFloat]);
      case 'block': return o(V.finListed * P.blockShare, pct(P.blockShare, 0) + ' × ارزش سهام بورسی (' + fmt(V.finListed) + ')', [PLAB.blockShare]);
      case 'subipo': return o(V.subsProfit * P.subOffer || NaN, pct(P.subOffer, 0) + ' × ارزش تابعه‌های سودده (' + fmt(V.subsProfit) + ')', [PLAB.subOffer]);
      case 'reit': return o(V.reIncomeFree * (1 - P.reitDiscount) * P.reitOffer, 'ارزش املاک درآمدزای قابل انتقال (' + fmt(V.reIncomeFree) + ') × (۱ − ' + pct(P.reitDiscount, 0) + ') × ' + pct(P.reitOffer, 0) + ' واحد عرضه‌شده', [PLAB.reitDiscount, PLAB.reitOffer], V.reIncomeFree);
      case 'land': return o(0, 'وجه نقد به شرکت نمی‌رسد؛ زمین به صندوق آورده می‌شود (ارزش به کار گرفته‌شده ' + fmt(V.land) + ')', [], V.land);
      case 'jvland': return o(0, 'بدون ورود نقد؛ ارزش زمین (' + fmt(V.land) + ') به پروژه تبدیل می‌شود', [], V.land);
      case 'slb': return o(V.fixedFree * (1 - P.slbDiscount), 'ارزش دارایی آزاد (' + fmt(V.fixedFree) + ') × (۱ − ' + pct(P.slbDiscount, 0) + ')', [PLAB.slbDiscount]);
      case 'pledge': return o(mn(dc, V.pledgeRE * P.ltvRE + V.finListed * P.ltvShares), 'کمترِ ظرفیت بدهی و (ملک آزاد × ' + pct(P.ltvRE, 0) + ' + سهام بورسی × ' + pct(P.ltvShares, 0) + ')', [PLAB.ltvRE, PLAB.ltvShares]);
      case 'lease': return o(NaN, 'به نرخ و تقاضای اجاره بستگی دارد — اجارهٔ بازار را استعلام کنید', []);
      case 'surplus': return o(V.surplus * (1 - P.saleDiscount), 'ارزش دارایی مازاد (' + fmt(V.surplus) + ') × (۱ − ' + pct(P.saleDiscount, 0) + ')', [PLAB.saleDiscount]);
      case 'capacity': return o(NaN, 'درآمد عملیاتی از ظرفیت خالی — به قرارداد بستگی دارد', []);
      case 'inv': var iv = V.invStd > 0 ? V.invStd : V.inv > 0 ? V.inv : f.inv; return o(iv * P.invShare, pct(P.invShare, 0) + ' × موجودی (' + fmt(iv) + ')', [PLAB.invShare]);
      case 'finsale': return o(V.finNonStrat * P.finSaleShare, pct(P.finSaleShare, 0) + ' × سرمایه‌گذاری‌های غیرراهبردی (' + fmt(V.finNonStrat) + ')', [PLAB.finSaleShare]);
      case 'crowd': return o(has(P.crowdCap) ? mn(isFinite(need) ? need : NaN, P.crowdCap) : NaN, has(P.crowdCap) ? 'کمترِ نیاز و سقف تأمین مالی جمعی' : 'سقف جاری تأمین مالی جمعی را از فرابورس استعلام و وارد کنید', []);
      case 'none': return o(0, 'ساختار توانمندساز یا توسعه‌ای — به‌تنهایی وجه نقد ایجاد نمی‌کند', []);
    }
    return o(NaN, '—', []);
  }

  /* ---------- economics of the proposed amount ---------- */
  function irr(flows) { var f = function (r) { return flows.reduce(function (s, cf, t) { return s + cf / Math.pow(1 + r, t); }, 0); }, lo = -0.9, hi = 5; if (f(lo) * f(hi) > 0) return NaN; for (var i = 0; i < 100; i++) { var m = (lo + hi) / 2; if (f(lo) * f(m) <= 0) hi = m; else lo = m; } return (lo + hi) / 2; }
  function economics(s, z, E, F, V, G, K) {
    var f = F.f, P = E.P, need = num(E.co.need), X = isFinite(z.amt) && z.amt > 0 ? (isFinite(need) && need > 0 ? Math.min(z.amt, need) : z.amt) : NaN;
    if (!isFinite(X)) return null;
    var kind = s.k, sukuk = !!SUKUK[s.id], fund = s.sz === 'reit' || s.sz === 'projectfund';
    var up = sukuk ? P.costSukuk : kind === 'equity' ? (fund ? P.costFund : P.costEquity) : fund ? P.costFund : kind === 'sale' ? P.costSale : P.costBank;
    var rate = kind === 'debt' ? (sukuk ? (K && isFinite(K.all) ? K.all : P.sukukRate) : Math.pow(1 + P.debtRate / 12, 12) - 1) : kind === 'equity' ? num(P.eqCost) : NaN;
    var rateNote = kind === 'debt' ? (sukuk ? (K && isFinite(K.all) ? 'هزینهٔ واقعی بانی به روش ytm (زبانهٔ هزینهٔ اوراق)' : 'فرض «' + PLAB.sukukRate + '»') : 'نرخ مؤثر تسهیلات با ترکیب ماهانهٔ نرخ ورودی شما') : kind === 'equity' ? (has(P.eqCost) ? PLAB.eqCost : 'هزینهٔ سرمایهٔ سهام وارد نشده') : 'فروش / مولدسازی: هزینهٔ تأمین مالی صریح ندارد';
    var T = Math.max(1, P.tenor), net = X * (1 - up), annual = kind === 'debt' && isFinite(rate) ? X * rate : NaN;
    var o = { X: X, gross: X, up: up, net: net, rate: rate, rateNote: rateNote, annual: annual, rows: [] };
    if (kind === 'debt') {
      o.ndE = f.ebitda > 0 ? (G.nd + X) / f.ebitda : NaN; o.icov = isFinite(f.fc) ? f.ebit / (f.fc + nz(annual)) : NaN; o.la = isFinite(f.ta) ? (f.tl + X) / (f.ta + X) : NaN;
      o.epsDelta = has(E.co.shares) && isFinite(annual) ? -annual * (1 - P.tax) / num(E.co.shares) : NaN;
      var fl = [net]; for (var t = 1; t <= T; t++) fl.push(-nz(annual) - (t === T ? X : 0)); o.irr = irr(fl);
      o.npv = has(P.hurdle) ? fl.reduce(function (s2, cf, i) { return s2 + cf / Math.pow(1 + num(P.hurdle), i); }, 0) : NaN;
    } else if (kind === 'equity') {
      o.dilution = has(E.co.valuation) ? X / (num(E.co.valuation) + X) : NaN; o.eqAfter = f.eq + net; o.ndE = f.ebitda > 0 ? (G.nd - net) / f.ebitda : NaN; o.npvNote = 'NPV برای سهام معنادار نیست؛ هزینه = بازده مورد انتظار سهامدار و رقیق‌شدن';
    } else if (kind === 'sale') {
      o.ndE = f.ebitda > 0 ? (G.nd - net) / f.ebitda : NaN; o.npvNote = 'هزینهٔ فرصت = بازده آتی دارایی فروخته‌شده';
      var yld = V.mvTotal > 0 && V.incTotal > 0 ? V.incTotal / V.mvTotal : NaN; o.oppCost = isFinite(yld) ? X * yld : NaN; o.yield = yld;
    }
    if (isFinite(z.val) && z.val > 0) o.ltv = X / z.val;
    if (s.ast.indexOf('realestate') >= 0 && V.re > 0) { o.assetMV = V.re; o.assetBV = V.list.filter(function (a) { return a.type === 'realestate'; }).reduce(function (s3, a) { return s3 + nz(a.bv); }, 0); o.rentYield = V.incTotal > 0 && V.re > 0 ? V.list.filter(function (a) { return a.type === 'realestate'; }).reduce(function (s4, a) { return s4 + nz(a.inc); }, 0) / V.re : NaN; }
    return o;
  }

  /* ---------- scoring ---------- */
  var PROB = { lev: ['E01', 'E02', 'E05', 'E10', 'A09', 'A14', 'E04', 'A01', 'E11'], liq: ['D11', 'D19', 'D07', 'A11', 'D17', 'D15', 'A04', 'D18', 'D02'], cfoNeg: ['E01', 'E05', 'A09', 'A14', 'A01'], art141: ['E10', 'E01', 'E05'],
    idleRE: ['A01', 'A02', 'A03', 'A07', 'A08', 'A04', 'A09'], trapped: ['A09', 'A14', 'A01', 'A05', 'E04'], longAR: ['D07', 'D19', 'D18', 'A12'], holding: ['E11', 'E12', 'A14', 'E04', 'A06'], noCredit: ['A06', 'D19', 'D11', 'A05', 'E01'] };
  function speedScore(m) { return m <= 2 ? 100 : m <= 4 ? 85 : m <= 6 ? 70 : m <= 9 ? 55 : m <= 12 ? 40 : m <= 18 ? 25 : 10; }
  function score(s, gates, z, E, G, mode) {
    var co = E.co, W = E.W, why = { reg: [], fit: [], cost: [], speed: [], own: [] }, need = num(co.need);
    // 1 executability and regulation
    var reg = s.st === 'exec' ? 100 : s.st === 'cond' ? 70 : 15; why.reg.push('وضعیت در ایران: ' + { exec: 'قابل اجرا', cond: 'مشروط', dev: 'توسعه‌ای' }[s.st] + ' (' + reg + ')');
    gates.forEach(function (g) { if (g.r === 'unk') { reg -= 15; why.reg.push('نامشخص: ' + g.n + ' (−۱۵)'); } else if (g.r === 'fail') { if (HARD[g.c]) { reg = 0; why.reg.push('مانع: ' + g.n + ' (صفر)'); } else { reg -= 35; why.reg.push('برقرار نیست: ' + g.n + ' (−۳۵)'); } } });
    reg = Math.max(0, Math.min(100, reg));
    // 2 fit with the need
    var fit = 0, probs = G.problems.map(function (p) { return p.k; });
    if (co.purpose !== 'unknown' && s.pur.indexOf(co.purpose) >= 0) { fit += 45; why.fit.push('با هدف تأمین مالی سازگار است (+۴۵)'); }
    else if (probs.some(function (p) { return (PROB[p] || []).indexOf(s.id) >= 0; })) { fit += 45; why.fit.push('به مسئلهٔ تشخیص‌داده‌شده پاسخ می‌دهد (+۴۵)'); }
    else if (co.purpose === 'unknown' && s.pur.indexOf('unknown') >= 0) { fit += 30; why.fit.push('مناسب حالت «هدف نامشخص» (+۳۰)'); }
    if (isFinite(z.amt) && z.amt > 0) { if (isFinite(need) && need > 0) { var cv = Math.min(1, z.amt / need); fit += Math.round(cv * 40); why.fit.push('پوشش ' + pct(cv, 0) + ' نیاز (+' + Math.round(cv * 40) + ')'); } else { var scale = E.__ta > 0 ? 0.1 * E.__ta : NaN, pts = isFinite(scale) ? Math.round(Math.min(1, z.amt / scale) * 25) : 15; fit += pts; why.fit.push('نیاز اعلام نشده؛ اهمیت مبلغ نسبت به ۱۰٪ دارایی‌ها (+' + pts + ')'); } }
    else if (s.k !== 'enabler') why.fit.push('مبلغ بالقوه نامشخص — نیازمند بررسی (۰)');
    var usesAsset = s.ast.length && gates.some(function (g) { return g.r === 'pass' && /^(asset|re|reIncome|land|pledgeable|idle|surplus|lowUtil|inv|fin|subs|ar|contract|listedHold)$/.test(g.c); });
    if (usesAsset) { fit += 15; why.fit.push('از دارایی‌های ثبت‌شدهٔ شرکت استفاده می‌کند (+۱۵)'); }
    if (mode === 'asset' && s.e === 'A') { fit += 10; why.fit.push('حالت مولدسازی دارایی (+۱۰)'); }
    if (mode === 'asset' && !(E.assets || []).some(function (a) { return s.ast.indexOf(a.type) >= 0 || (s.ast.indexOf('land') >= 0 && a.type === 'realestate'); })) { fit -= 15; why.fit.push('در حالت مولدسازی، از دارایی‌های ثبت‌شده استفاده نمی‌کند (−۱۵)'); }
    if (s.k !== 'enabler' && !(z.amt > 0)) {
      if (isFinite(need) && need > 0) { fit -= 20; why.fit.push('برای نیاز اعلام‌شده منبع نقد ایجاد نمی‌کند یا مبلغ آن نامشخص است (−۲۰)'); }
      if (!isFinite(z.amt)) { fit = Math.min(fit, 40); why.fit.push('مبلغ نامشخص: امتیاز تناسب حداکثر ۴۰'); }
    }
    if (probs.indexOf('lev') >= 0 && s.k === 'debt') { fit -= 30; why.fit.push('شرکت پراهرم است؛ بدهی جدید ریسک را بالا می‌برد (−۳۰)'); }
    fit = Math.max(0, Math.min(100, fit));
    // 3 cost
    var cost = 100 - (s.cl - 1) * 20; why.cost.push('سطح هزینه ' + s.cl + ' از ۵ (' + cost + ')');
    // 4 speed
    var sp = speedScore(s.tm[1]); why.speed.push('زمان اجرا ' + s.tm[0] + ' تا ' + s.tm[1] + ' ماه (' + sp + ')');
    var dl = [num(co.needBy), num(E.cons.timeLimit)].filter(isFinite); if (dl.length && s.tm[0] > Math.min.apply(null, dl)) { sp = Math.min(sp, 10); why.speed.push('حداقل زمان اجرا از مهلت شما (' + Math.min.apply(null, dl) + ' ماه) بیشتر است (۱۰)'); }
    // 5 ownership and flexibility
    var own = Math.round(s.ow * 100); why.own.push('حفظ مالکیت و کنترل ' + pct(s.ow, 0) + ' (' + own + ')');
    if ((co.controlPriority === 'high' || E.cons.control === 'yes') && s.ow < 0.8) { own = Math.round(own * 0.6); why.own.push('اولویت بالای حفظ کنترل (×۰٫۶)'); }
    var tw = W.reg + W.fit + W.cost + W.speed + W.own || 1, total = (reg * W.reg + fit * W.fit + cost * W.cost + sp * W.speed + own * W.own) / tw;
    return { reg: reg, fit: fit, cost: cost, speed: sp, own: own, total: Math.round(total * 10) / 10, why: why };
  }

  /* ---------- one solution end to end ---------- */
  function assess(s, E, F, V, G, K, mode) {
    // sukuk add the SEO originator tests; every debt route needs a repayment analysis (brief §14.5-6)
    var codes = s.g.slice(); if (SUKUK[s.id]) ['cfo2', 'la'].forEach(function (c) { if (codes.indexOf(c) < 0) codes.push(c); }); if (s.k === 'debt' && codes.indexOf('debtcap') < 0) codes.push('debtcap');
    var gates = codes.map(function (c) { return { c: c, n: GNAME[c] || c, r: gate(c, E, F, V, G) }; });
    var na = gates.filter(function (g) { return g.r === 'na'; }), conflict = gates.filter(function (g) { return g.r === 'conflict'; }), fail = gates.filter(function (g) { return g.r === 'fail'; }), unk = gates.filter(function (g) { return g.r === 'unk'; });
    var z = size(s, E, F, V, G), sc = score(s, gates, z, E, G, mode);
    var regOK = gates.every(function (g) { return !REG[g.c] || g.r === 'pass'; });
    var label = na.length ? 'na' : conflict.length ? 'excluded' : s.st === 'dev' ? 'dev' : fail.some(function (g) { return HARD[g.c]; }) ? 'blocked' : fail.length || unk.length || s.st === 'cond' ? 'cond' : 'exec';
    // definitive only when every regulatory and asset gate is met; unknown preferences (c:…) leave it definitive but flagged
    var definitive = (label === 'exec' || label === 'cond') && regOK && !fail.length && !unk.some(function (g) { return g.c.indexOf('c:') !== 0; }) && s.st !== 'dev' && !(SUKUK[s.id] && !(G.debtCap > 0));
    return { s: s, id: s.id, gates: gates, na: na, conflict: conflict, fail: fail, unk: unk, z: z, sc: sc, label: label, definitive: definitive, eco: label === 'na' ? null : economics(s, z, E, F, V, G, K) };
  }

  /* ---------- combinations ---------- */
  var GK = { project: 'pdebt', projectfund: 'peq', jv: 'peq', ijara: 'fixed', slb: 'fixed', reit: 'fixed', surplus: 'fixed', ar: 'ar', factoring: 'ar', facility: 'cdebt', murabaha: 'cdebt', smallmur: 'cdebt', purchases: 'cdebt', payables: 'pay', block: 'fin', finsale: 'fin', subipo: 'fin', equity: 'equity' };
  function combos(R, E, G) {
    var by = {}; R.forEach(function (r) { by[r.id] = r; });
    return Hub.finBank.COMBO.map(function (c) {
      var req = c.req.map(function (i) { return by[i]; }), ok = req.every(function (r) { return r && r.label !== 'na' && r.label !== 'excluded'; });
      var probs = (G && G.problems || []).map(function (p) { return p.k; }), purposeFit = E.co.purpose === 'unknown' ? c.pur.indexOf('unknown') >= 0 : c.pur.indexOf(E.co.purpose) >= 0;
      var triggered = purposeFit || (c.prob || []).some(function (p) { return probs.indexOf(p) >= 0; }) || (E.co.purpose === 'unknown' && !(c.prob || []).length);
      if (ok && !triggered) return { c: c, active: false, missing: ['نه هدف اعلام‌شده و نه مسئلهٔ تشخیص‌داده‌شده با این ساختار مرتبط است'] };
      if (!ok) return { c: c, active: false, missing: req.filter(function (r) { return !r || r.label === 'na' || r.label === 'excluded'; }).map(function (r) { return r ? r.s.fa : '?'; }) };
      var comps = req.concat(c.opt.map(function (i) { return by[i]; }).filter(function (r) { return r && r.label !== 'na' && r.label !== 'excluded'; }));
      var tot = comps.reduce(function (s, r) { return s + r.sc.total; }, 0) / comps.length, synergy = 5;
      // one asset backs one financing: within a primary asset type take the largest amount, across types add
      // one asset or one need is financed once: within a group take the largest amount, across groups add; corporate debt in total ≤ debt capacity
      var grp = {}, dsum = 0; comps.forEach(function (r) { var k = GK[r.s.sz] || r.s.ast[0] || r.id, a = r.z.amt; if (isFinite(a) && a > 0) grp[k] = Math.max(grp[k] || 0, a); });
      var cash = Object.keys(grp).reduce(function (s, k) { return s + grp[k]; }, 0);
      comps.forEach(function (r) { if (r.s.k === 'debt' && r.s.sz !== 'project' && r.z.amt > 0) dsum += r.z.amt; });
      if (isFinite(G.debtCap) && dsum > G.debtCap) cash -= dsum - G.debtCap;
      // definitive when every required step is; optional steps that are conditional are flagged inside the structure
      var anyCond = req.some(function (r) { return !r.definitive; }), optCond = comps.filter(function (r) { return req.indexOf(r) < 0 && !r.definitive; }), worst = comps.some(function (r) { return r.label === 'blocked'; }) ? 'blocked' : comps.some(function (r) { return r.label === 'dev'; }) ? 'dev' : anyCond ? 'cond' : 'exec';
      return { c: c, active: true, comps: comps, score: Math.round(Math.min(100, tot + synergy + (purposeFit ? 5 : (E.co.purpose !== 'unknown' ? -10 : 0))) * 10) / 10, cash: cash, label: worst, definitive: !anyCond, optCond: optCond, conditionalTag: anyCond ? 'ساختار پیشنهادی مشروط به تأیید' : optCond.length ? 'مراحل اختیاری مشروط: ' + optCond.map(function (r) { return r.s.fa; }).join('، ') : '' };
    });
  }

  /* ---------- hidden opportunities ---------- */
  function opportunities(E, F, V, G) {
    var f = F.f, o = [], P = E.P, add = function (t, ev, sol, val) { o.push({ t: t, ev: ev, sol: sol, val: val }); };
    V.list.forEach(function (a) {
      var nm = a.name || ATYPE[a.type];
      if (a.type === 'realestate') {
        var y = a.inc > 0 && a.mv > 0 ? a.inc / a.mv : NaN;
        if (!isFinite(a.inc)) { /* income not entered: nothing can be said about this property's yield */ }
        else if (!(a.inc > 0)) add('ملک بدون درآمد: ' + nm, 'ارزش ' + fmt(a.mv) + '، درآمد اجارهٔ واردشده صفر است', ['A07', 'A08', 'A02', 'A09'], a.mv);
        else if (isFinite(y) && y < 0.05) add('ملک کم‌بازده: ' + nm, 'بازده اجاره ' + pct(y) + ' از ارزش روز', ['A01', 'A08', 'A04'], a.mv);
        if (a.use === 'land' && a.develop !== 'no') add('زمین قابل توسعه: ' + nm, 'کاربری زمین' + (a.develop === 'yes' ? '، امکان توسعه تأیید شده' : '، امکان توسعه نیازمند استعلام'), ['A07', 'A02', 'E07'], a.mv);
        if (isFinite(a.mv) && isFinite(a.bv) && a.mv > 2 * a.bv) add('مازاد تجدید ارزیابی: ' + nm, 'ارزش روز ' + fmt(a.mv) + ' در برابر دفتری ' + fmt(a.bv), ['E10', 'D03'], a.mv - a.bv);
        if (a.inc > 0 && a.transfer !== 'no' && a.title !== 'issue') add('ملک درآمدزای مناسب صندوق املاک: ' + nm, 'درآمد سالانه ' + fmt(a.inc), ['A01', 'A03'], a.mv);
      }
      if (a.type === 'machinery' && isFinite(a.util) && a.util <= 0.7) add('ظرفیت بلااستفادهٔ تجهیزات: ' + nm, 'بهره‌برداری ' + pct(a.util, 0), ['A10', 'A05'], a.mv);
      if (a.type === 'financial') {
        if ((a.stake >= 50 || a.sub === 'yes') && a.profitable === 'yes' && a.listed !== 'yes') add('شرکت تابعهٔ سودده قابل عرضه: ' + nm, 'سهم ' + (isFinite(a.stake) ? a.stake + '٪' : 'کنترلی') + '، غیربورسی', ['E11', 'E12'], a.mv);
        if (a.listed === 'yes') add('سهام بورسی قابل توثیق یا فروش بلوک: ' + nm, 'ارزش ' + fmt(a.mv), ['A06', 'E04'], a.mv);
        if (a.strategic === 'low') add('سرمایه‌گذاری غیرراهبردی: ' + nm, 'قابل واگذاری', ['A14', 'E04'], a.mv);
      }
      if (a.type === 'receivable' && a.longterm === 'yes') add('مطالبات بلندمدت قابل تأمین مالی: ' + nm, 'ارزش ' + fmt(a.mv) + (a.counter === 'gov' ? '، طرف دولتی' : ''), ['D07', 'D19', 'A12'], a.mv);
      if (a.type === 'inventory' && a.ime === 'yes') add('کالای مناسب سلف موازی / گواهی سپرده: ' + nm, 'کالای پذیرفته‌شده در بورس کالا', ['D05', 'A11'], a.mv);
      if (a.type === 'contract') add('قرارداد بلندمدت قابل تأمین مالی: ' + nm, 'ارزش ' + fmt(a.mv), ['D21', 'D20'], a.mv);
    });
    if (V.subs.length >= 2) add('ساختار هلدینگ تخصصی', V.subs.length + ' شرکت تابعه', ['E12', 'E11'], V.fin);
    if (V.re > 0 && V.mvTotal > 0 && V.reIdle > 0 && V.reIncome > 0) add('تفکیک دارایی‌های عملیاتی و غیرعملیاتی', 'املاک درآمدزا ' + fmt(V.reIncome) + '، راکد/کم‌بازده ' + fmt(V.reIdle), ['A03', 'A01', 'A07'], V.re);
    if (G.debtCap > 0 && isFinite(G.capCeil) && G.capCeil > 0 && f.guarantor === 'yes') add('ظرفیت استفاده‌نشدهٔ انتشار اوراق', 'ظرفیت بدهی ' + fmt(G.debtCap) + '، سقف سرمایه ' + fmt(G.capCeil), ['D01', 'D03'], Math.min(G.debtCap, G.capCeil));
    if (E.co.ime === 'yes' && !V.invStd) add('محصول مناسب سلف موازی استاندارد', 'کالای پذیرفته‌شده در بورس کالا اعلام شده', ['D05'], NaN);
    if (has(P.hurdle) && V.reIdle > 0) add('هزینهٔ فرصت دارایی‌های راکد', 'ارزش راکد ' + fmt(V.reIdle) + ' × ' + pct(num(P.hurdle)) + ' = ' + fmt(V.reIdle * num(P.hurdle)) + ' در سال', ['A01', 'A07', 'A08'], V.reIdle);
    return o;
  }

  /* ---------- recommendation and roadmap ---------- */
  function owner(step) { return /مجمع/.test(step) ? 'هیئت‌مدیره و مجمع' : /مجوز|ثبت|پذیرش/.test(step) ? 'مشاور عرضه / مشاور حقوقی' : /ارزیاب|ارزش‌گذاری/.test(step) ? 'کارشناس رسمی / مشاور مالی' : /قرارداد|مذاکره/.test(step) ? 'مدیر مالی و مشاور حقوقی' : /ضمانت|رتبه/.test(step) ? 'مدیر مالی و ضامن / مؤسسهٔ رتبه‌بندی' : 'مدیر مالی'; }
  function roadmap(item) {
    var steps = [], t = 0;
    if (item.c) item.c.ph.forEach(function (p) { var sols = p[1].map(function (i) { return Hub.finBank.get(i); }).filter(Boolean), dur = sols.length ? Math.max.apply(null, sols.map(function (s) { return s.tm[1]; })) : 2; steps.push({ step: p[0], from: t, to: t + dur, owner: owner(p[0]), docs: [].concat.apply([], sols.map(function (s) { return s.mn; })).slice(0, 4), inst: [].concat.apply([], sols.map(function (s) { return s.par; })).filter(function (v, i, a) { return a.indexOf(v) === i; }).slice(0, 5), lic: [].concat.apply([], sols.map(function (s) { return s.lic; })) }); t += dur; });
    else { var s = item.s, per = s.tm[1] / Math.max(1, s.stp.length); s.stp.forEach(function (st, i) { steps.push({ step: st, from: Math.round(i * per * 10) / 10, to: Math.round((i + 1) * per * 10) / 10, owner: owner(st), docs: i === 0 ? s.mn : [], inst: s.par, lic: /مجوز|ثبت|پذیرش/.test(st) ? s.lic : [] }); }); }
    return steps;
  }
  function recommend(R, C, G, E) {
    // too little information: no recommendation rather than one built on unknowns
    if (!(E.assets || []).length && G.missing.length >= 4) return { main: null, alt: null, comp: null, condOnly: true, insufficient: true, roadmap: [] };
    var singles = R.filter(function (r) { return r.label !== 'na' && r.label !== 'excluded' && r.s.k !== 'enabler'; }).sort(function (a, b) { return b.sc.total - a.sc.total; });
    var defs = singles.filter(function (r) { return r.definitive; }), act = C.filter(function (c) { return c.active; }).sort(function (a, b) { return b.score - a.score; });
    var cand = defs.map(function (r) { return { type: 's', r: r, score: r.sc.total, def: true }; }).concat(act.filter(function (c) { return c.definitive; }).map(function (c) { return { type: 'c', c: c, score: c.score, def: true }; }))
      .sort(function (a, b) { return b.score - a.score; });
    var condOnly = !cand.length;
    if (condOnly) cand = singles.filter(function (r) { return r.label === 'cond'; }).map(function (r) { return { type: 's', r: r, score: r.sc.total, def: false }; }).concat(act.filter(function (c) { return c.label !== 'dev'; }).map(function (c) { return { type: 'c', c: c, score: c.score, def: false }; })).sort(function (a, b) { return b.score - a.score; });
    // with a stated need, only routes that raise cash can lead; in asset / full mode a structure leads when it is close to the best single route
    var need = num(E.co.need), cashOf = function (x) { return x.type === 's' ? x.r.z.amt : x.c.cash; };
    if (need > 0) { var withCash = cand.filter(function (x) { return cashOf(x) > 0; }); if (withCash.length) cand = withCash; var big = cand.filter(function (x) { return cashOf(x) >= 0.25 * need; }); if (big.length) cand = big.concat(cand.filter(function (x) { return big.indexOf(x) < 0; })); }
    var mode0 = E.mode !== 'auto' ? E.mode : E.co.purpose !== 'unknown' ? 'goal' : (E.assets || []).length ? 'asset' : 'full';
    if (mode0 !== 'goal' && cand.length) { var bc = cand.filter(function (x) { return x.type === 'c'; })[0]; if (bc && bc.score >= cand[0].score - 5) cand = [bc].concat(cand.filter(function (x) { return x !== bc; })); }
    var main = cand[0] || null, kindOf = function (x) { return x.type === 's' ? x.r.s.k : 'combo'; }, idsOf = function (x) { return x.type === 's' ? [x.r.id] : x.c.comps.map(function (r) { return r.id; }); };
    var alt = main ? cand.filter(function (x) { return x !== main && kindOf(x) !== kindOf(main); })[0] || cand[1] || null : null;
    var comp = null;
    if (main) { var used = idsOf(main), wants = main.type === 's' ? main.r.s.cmp : []; var altIds = alt ? idsOf(alt) : [], useAsset = function (r) { return mode0 !== 'asset' || (E.assets || []).some(function (a) { return r.s.ast.indexOf(a.type) >= 0; }); }; comp = singles.filter(function (r) { return used.indexOf(r.id) < 0 && altIds.indexOf(r.id) < 0 && useAsset(r) && (wants.indexOf(r.id) >= 0 || r.s.k !== kindOf(main)) && r.label !== 'blocked' && r.label !== 'dev'; }).sort(function (a, b) { return (wants.indexOf(b.id) >= 0) - (wants.indexOf(a.id) >= 0) || b.sc.total - a.sc.total; })[0] || null; }
    return { main: main, alt: alt, comp: comp ? { type: 's', r: comp, score: comp.sc.total, def: comp.definitive } : null, condOnly: condOnly, roadmap: main ? roadmap(main.type === 's' ? main.r : main.c) : [] };
  }

  /* ---------- run ---------- */
  function run(E0, D, K) {
    var E = merge(defaults(), E0 || {}), F = finFrom(E, D), V = assetView(E), G = diagnose(E, F, V);
    var mode = E.mode !== 'auto' ? E.mode : E.co.purpose !== 'unknown' ? 'goal' : V.list.length ? 'asset' : 'full';
    Object.defineProperty(E, '__ta', { value: F.f.ta, enumerable: false, configurable: true });
    var R = Hub.finBank.SOL.map(function (s) { return assess(s, E, F, V, G, K, mode); });
    var C = combos(R, E, G), O = opportunities(E, F, V, G), REC = recommend(R, C, G, E);
    var mainProblem = G.problems.length ? G.problems[0].fa : E.co.purpose !== 'unknown' ? 'تأمین مالی برای ' + (Hub.finBank.PURPOSE.filter(function (p) { return p[0] === E.co.purpose; })[0] || ['', ''])[1] : 'هدف تأمین مالی مشخص نیست';
    return { E: E, F: F, V: V, G: G, R: R, C: C, O: O, REC: REC, mode: mode, mainProblem: mainProblem,
      count: { all: R.length, applicable: R.filter(function (r) { return r.label !== 'na'; }).length, definitive: R.filter(function (r) { return r.definitive; }).length, excluded: R.filter(function (r) { return r.label === 'excluded'; }).length, combos: C.filter(function (c) { return c.active; }).length } };
  }
  function merge(a, b) { Object.keys(b).forEach(function (k) { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') merge(a[k], b[k]); else if (b[k] !== undefined) a[k] = b[k]; }); return a; }

  Hub.finEngine = { defaults: defaults, run: run, PLAB: PLAB, GNAME: GNAME, ATYPE: ATYPE, SUKUK: SUKUK, merge: merge, irr: irr };
  if (typeof module !== 'undefined' && module.exports) module.exports = Hub.finEngine;
})(typeof window !== 'undefined' ? window : globalThis);
