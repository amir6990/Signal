/* =====================================================================
 * FINANCING OPPORTUNITY DISCOVERY — from a raw problem to operational
 * financing structures (directives: Solution-Driven Financing Advisory,
 * Market Feasibility & Alternative Structuring, Creative Structuring &
 * Capital-Market Compliance; Nov 2026).
 *
 * A layer over the solution engine (js/core/finengine.js) and its bank
 * (js/data/finbank-*). It never replaces the engine's gates; it adds:
 *   1 a seed form built from a few answers (archetype, asset, value, need,
 *     timing, ownership) so the engine runs before any statements exist;
 *   2 the economic objectives behind the problem (hypotheses the user ticks);
 *   3 ranking that adds objective fit, timing, ownership and market capacity
 *     to the engine score — every adjustment is listed;
 *   4 market feasibility on seven dimensions, staged execution when the deal
 *     is larger than what one channel absorbs, primary / alternative /
 *     fallback paths with the conditions that move you to the next one;
 *   5 for capital-market routes: who owns, who is originator, who issues, who
 *     receives the money, who pays and what holders can reach; a regulatory
 *     feasibility matrix per legal person (parent, asset company / SPV,
 *     special-purpose intermediary) and the four separate SPV audit questions;
 *   6 five outcome statuses, three maturity levels, three tiers (direct /
 *     structured / hybrid), staged information requests and a roadmap.
 * Honesty rules: no market capacity, discount, time or probability is
 * invented. Capacity per channel, extra bulk discount and scenario shifts are
 * the user's inputs; unknown stays "نامشخص" and becomes a question. Rule
 * citations reuse the texts already encoded in js/core/sukukrules.js
 * ([IJ] ijara instruction, [CR] rating instruction, [DV] new instruments
 * act, [PR] SEO practice); anything else is flagged "نیازمند استعلام".
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  var HB = 1e4;   // 1 همت = 10,000 میلیارد ریال (engine unit used here: billion rials)
  function num(v) { return v === null || v === undefined || v === '' ? NaN : Number(v); }
  function has(v) { return isFinite(num(v)); }
  function fa(n) { return String(n).replace(/\d/g, function (c) { return '۰۱۲۳۴۵۶۷۸۹'[c]; }); }
  function H(v) { if (!isFinite(v)) return 'نامشخص'; var r = Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10; return fa(r.toLocaleString('en-US')) + ' همت'; }
  function P(v) { return isFinite(v) ? fa(Math.round(v * 100)) + '٪' : 'نامشخص'; }
  function Mo(a, b) { return fa(a) + (b != null && b !== a ? '–' + fa(b) : '') + ' ماه'; }

  /* ---------- problem archetypes (directive A §1) ---------- */
  var ARCH = [
    { k: 're', fa: 'دارایی ملکی بزرگ دارم؛ می‌خواهم از آن نقدینگی بسازم', pur: 'monet', at: 'realestate', obj: ['cash', 'keepUse', 'keepOwn', 'collat', 'release', 'investor', 'hidden'] },
    { k: 'wc', fa: 'دارایی زیاد دارم اما سرمایه در گردش کم است', pur: 'wc', at: 'realestate', obj: ['cash', 'keepUse', 'collat', 'release'] },
    { k: 'expand', fa: 'ظرفیت خالی یا طرح توسعه دارم اما منابع تکمیلش را ندارم', pur: 'expand', at: 'machinery', obj: ['growth', 'investor', 'collat', 'hidden'] },
    { k: 'ar', fa: 'مطالبات زیاد دارم و وصول آن زمان‌بر است', pur: 'release', at: 'receivable', obj: ['release', 'cash'] },
    { k: 'nodebt', fa: 'منابع می‌خواهم اما نه افزایش سرمایه و نه بدهی بانکی', pur: 'unknown', at: 'realestate', obj: ['cash', 'keepOwn', 'investor', 'hidden'], seed: { eqOk: 'no', noBank: 'yes' } },
    { k: 'project', fa: 'پروژهٔ سودآور دارم اما تأمین مالی مستقلش ممکن نشده', pur: 'project', at: '', obj: ['growth', 'investor'] },
    { k: 'refi', fa: 'بدهی کوتاه‌مدت دارم و می‌خواهم سررسیدها را اصلاح کنم', pur: 'refi', at: '', obj: ['tenor', 'costCut', 'collat'] },
    { k: 'other', fa: 'مسئلهٔ دیگر (در شرح بنویسید)', pur: 'unknown', at: 'realestate', obj: [] }];

  /* ---------- economic objectives (directive A §2) and the routes that serve each ---------- */
  var OBJ = [
    ['cash', 'تبدیل دارایی غیرمولد به نقدینگی', ['A09', 'A05', 'A01', 'E04', 'A14', 'A04', 'D19', 'D07']],
    ['keepUse', 'نقد کردن دارایی بدون توقف فعالیت عملیاتی', ['A04', 'A05']],
    ['keepOwn', 'حفظ مالکیت دارایی و ایجاد جریان نقدی', ['A08', 'A06', 'D03', 'D04', 'A10']],
    ['collat', 'استفاده از دارایی به‌عنوان وثیقه', ['A06', 'D12', 'D11', 'A11']],
    ['release', 'آزادسازی منابع محبوس در دارایی‌ها', ['A04', 'A05', 'A06', 'D19', 'D07', 'A09', 'A14']],
    ['growth', 'تأمین مالی طرح توسعه با پشتوانهٔ دارایی', ['D03', 'A04', 'E07', 'D20', 'D06', 'E08', 'D12']],
    ['investor', 'ورود سرمایه‌گذار جدید به دارایی یا پروژه', ['E07', 'A07', 'E05', 'A01', 'E08', 'E06']],
    ['costCut', 'کاهش هزینهٔ سرمایه و بهبود ساختار ترازنامه', ['D03', 'D01', 'E10', 'E01']],
    ['hidden', 'شناسایی ارزش اقتصادی پنهان دارایی‌ها', ['E10', 'A07', 'A02', 'A08', 'A10']],
    ['tenor', 'اصلاح ساختار سررسید بدهی', ['D03', 'D01', 'D12', 'D14', 'A04']]];
  var OBJFA = {}; OBJ.forEach(function (o) { OBJFA[o[0]] = o[1]; });

  /* ---------- market channels: who has to say yes for the money to arrive ---------- */
  var CH = { buyers: 'خریداران مستقیم دارایی', sukuk: 'بازار اوراق بدهی (سرمایه‌گذاران اوراق)', bank: 'بانک‌ها و مؤسسات اعتباری', fund: 'سرمایه‌گذاران صندوق (بازار سرمایه)', partner: 'شریک، سرمایه‌گذار راهبردی یا توسعه‌دهنده', equity: 'سهامداران و بازار سهام', other: 'طرف قرارداد خاص' };
  var CHMAP = { A09: 'buyers', A05: 'buyers', E04: 'equity', A14: 'buyers', D01: 'sukuk', D02: 'sukuk', D03: 'sukuk', D04: 'sukuk', D06: 'sukuk', D07: 'sukuk', D09: 'sukuk', D10: 'sukuk', A04: 'sukuk', A12: 'sukuk', D08: 'sukuk',
    D11: 'bank', D12: 'bank', D13: 'bank', D14: 'bank', D15: 'bank', D16: 'bank', D19: 'bank', A06: 'bank', D20: 'bank', D21: 'bank', A11: 'bank', D17: 'bank', D18: 'bank',
    A01: 'fund', A02: 'fund', E08: 'fund', E09: 'fund', E05: 'partner', E06: 'partner', E07: 'partner', A07: 'partner', A10: 'partner', A08: 'partner', E01: 'equity', E02: 'equity', E03: 'equity', E11: 'equity' };
  var BANK = ['D11', 'D12', 'D13', 'D14', 'D15', 'D17', 'A06'];   // "no bank debt" removes these
  // tiers (directive C §7): direct = no new legal person or market instrument; structured = intermediary, fund, SPV or securities; hybrid = multi-step structures
  var STRUCTURED = { D01: 1, D02: 1, D03: 1, D04: 1, D06: 1, D07: 1, D08: 1, D09: 1, D10: 1, A01: 1, A02: 1, A03: 1, A04: 1, A12: 1, A13: 1, E03: 1, E07: 1, E08: 1, E11: 1, E12: 1, E09: 1, D05: 1 };
  var CAPMKT = { D01: 1, D02: 1, D03: 1, D04: 1, D05: 1, D06: 1, D07: 1, D08: 1, D09: 1, D10: 1, A04: 1, A12: 1, A01: 1, A02: 1, E03: 1, E08: 1, E09: 1, E11: 1, E04: 1 };
  var SUKUK = { D01: 1, D02: 1, D03: 1, D04: 1, D06: 1, D07: 1, D09: 1, A04: 1 };

  function defaults() {
    return { arch: 're', note: '', at: 'realestate', use: 'unk', val: null, need: null, by: null, keep: 'unk', noBank: 'unk', eqOk: 'unk', inc: 'unk', incVal: null, op: 'unk', title: 'unk',
      listed: 'unk', form: 'unk', opinion: 'unk', cfo: 'unk', interim: 'unk', bankGuar: 'unk', la: 'unk', secColl: 'unk', groupCo: 'unk', src: '', asof: '', obj: {}, cap: {}, ev: {}, seg: { op: null, inc: null, idle: null }, sc: { dn: 0.10, up: 0.05 }, bulk: null, spv: 'auto' };
  }
  function archOf(k) { for (var i = 0; i < ARCH.length; i++) if (ARCH[i].k === k) return ARCH[i]; return ARCH[ARCH.length - 1]; }
  function objOn(M, k) { var a = archOf(M.arch); return M.obj && k in M.obj ? !!M.obj[k] : a.obj.indexOf(k) >= 0; }

  /* ---------- 1 · seed form for the engine ---------- */
  function seed(M) {
    var A = archOf(M.arch), v = num(M.val), at = M.at || A.at;
    var keep = M.keep, E = { mode: 'auto', co: { unit: 'billion', purpose: A.pur, need: has(M.need) ? num(M.need) * HB : null, needBy: has(M.by) ? num(M.by) : null, listing: M.listed, form: M.form,
      canEquity: M.eqOk, assetSaleOk: keep === 'keep' ? 'no' : keep === 'any' ? 'yes' : 'unk', investorOk: keep === 'keep' ? 'unk' : 'unk', controlPriority: keep === 'keep' ? 'high' : 'unk' },
      fin: { opinion: M.opinion, guarantor: M.bankGuar === 'yes' ? 'yes' : M.bankGuar === 'no' ? 'no' : 'unk', cfo1: M.cfo === 'neg' ? -1 : M.cfo === 'pos' ? 1 : null, cfo2: M.cfo === 'neg' ? -1 : M.cfo === 'pos' ? 1 : null,
        ta: M.la === 'unk' ? null : 100, tl: M.la === 'high' ? 95 : M.la === 'ok' ? 50 : null }, cons: { noSale: keep === 'keep' ? 'yes' : keep === 'any' ? 'no' : 'unk', noOwn: keep === 'keep' ? 'yes' : keep === 'any' ? 'no' : 'unk', noDebt: 'unk' }, assets: [] };
    if (A.k === 'project') { E.co.projectCost = isFinite(v) ? v * HB : null; }
    else if (at && isFinite(v) && v > 0) {
      var incYes = M.inc === 'yes' || M.inc === 'partial';
      E.assets.push({ type: at, name: 'دارایی اعلام‌شده', mv: v * HB, bv: null,
        // income stated but amount unknown: a marker > 0 keeps income-based routes open; yields from it are never shown
        inc: M.inc === 'no' ? 0 : has(M.incVal) ? num(M.incVal) * HB : incYes ? 1e-9 : null,
        idle: M.inc === 'no' ? 1 : null, util: at === 'machinery' && A.k === 'expand' ? 0.6 : null, title: M.title === 'clean' ? 'clean' : M.title === 'issue' ? 'issue' : 'unk', transfer: 'unk', pledge: 'unk',
        use: M.use === 'unk' ? 'other' : M.use, strategic: M.op === 'operational' ? 'high' : M.op === 'nonop' ? 'low' : 'unk', develop: M.use === 'land' ? 'unk' : 'unk', longterm: at === 'receivable' ? 'yes' : 'unk' });
    }
    Object.defineProperty(E, '__markers', { value: ['cfo1', 'cfo2', 'ta', 'tl'], enumerable: false });
    return E;
  }

  /* ---------- helpers on engine output ---------- */
  function phys(M) { var at = M.at || archOf(M.arch).at; return at === 'realestate' || at === 'machinery'; }
  function idsOf(it) { return it.kind === 'c' ? it.ids : [it.id]; }
  function chOf(it) { if (it.kind === 's') return CHMAP[it.id] || 'other'; var lead = it.c.req.map(function (i) { return CHMAP[i]; }).filter(Boolean); return lead[lead.length - 1] || 'other'; }
  function tierOf(it) { return it.kind === 'c' ? 'hybrid' : STRUCTURED[it.id] ? 'structured' : 'direct'; }
  var TIERFA = { direct: 'مستقیم (بدون شخصیت حقوقی یا ابزار جدید)', structured: 'ساختاریافته (نهاد واسط، صندوق، شرکت مستقل یا اوراق)', hybrid: 'ترکیبی و نوآورانه (چندمرحله‌ای)' };

  /* ---------- 2 · candidates with transparent discovery score ---------- */
  var LEARN = [];
  function candidates(X, M) {
    var R = X.R, by = {}; R.forEach(function (r) { by[r.id] = r; });
    var noBank = M.noBank === 'yes', need = num(M.need), deadline = num(M.by), list = [];
    var objKeys = OBJ.map(function (o) { return o[0]; }).filter(function (k) { return objOn(M, k); });
    function common(it) {
      var why = [], adj = 0, ids = idsOf(it);
      var hits = objKeys.filter(function (k) { var o = OBJ.filter(function (x) { return x[0] === k; })[0]; return ids.some(function (i) { return o[2].indexOf(i) >= 0; }); });
      it.objHits = hits;
      if (hits.length) { var b = 6 * Math.min(3, hits.length); adj += b; why.push('به ' + fa(hits.length) + ' هدف اقتصادی پاسخ می‌دهد (+' + fa(b) + ')'); }
      else if (objKeys.length) { adj -= 6; why.push('به هیچ‌یک از اهداف علامت‌خورده پاسخ مستقیم نمی‌دهد (−۶)'); }
      if (isFinite(deadline)) { if (deadline < it.tm[0]) { adj -= 20; why.push('حداقل زمان اجرا (' + Mo(it.tm[0]) + ') از مهلت شما (' + Mo(deadline) + ') بیشتر است (−۲۰)'); it.late = true; } else if (deadline < it.tm[1]) { adj -= 6; why.push('حداکثر زمان اجرا از مهلت بیشتر است (−۶)'); } }
      if (M.keep === 'keep' && it.ow < 0.6) { adj -= 15; why.push('مالکیت را تا ' + P(it.ow) + ' حفظ می‌کند؛ شما حفظ کامل خواسته‌اید (−۱۵)'); it.ownClash = true; }
      else if (M.keep === 'partial' && it.ow < 0.4) { adj -= 8; why.push('حفظ مالکیت کمتر از ۴۰٪ (−۸)'); }
      if (ids.indexOf('A03') >= 0 && ids.some(function (i) { return SUKUK[i]; })) { it.spvBani = true; adj -= 8; why.push('بانی اوراق، شرکت تازه‌تأسیس است و دو دورهٔ مالی حسابرسی‌شده ندارد [IJ] ۲ و ۶ (−۸)'); }
      var cap = num((M.cap || {})[it.ch]);
      if (isFinite(it.amtH) && it.amtH > 0) { if (isFinite(cap) && cap > 0) { if (it.amtH > cap) { var n = Math.ceil(it.amtH / cap); adj -= Math.min(15, 5 * (n - 1)); why.push('مبلغ بیش از ظرفیت یک‌نوبتی کانال؛ ' + fa(n) + ' مرحله لازم (−' + fa(Math.min(15, 5 * (n - 1))) + ')'); } }
        else { adj -= 4; why.push('ظرفیت جذب «' + CH[it.ch] + '» وارد نشده (−۴)'); } }
      if (isFinite(need) && need > 0 && isFinite(it.amtH) && it.amtH > 0) { var cov = it.amtH / need; if (cov >= 1) { adj += 4; why.push('برآورد مبلغ کل نیاز را پوشش می‌دهد (+۴)'); } else if (cov < 0.25) { adj -= 6; why.push('برآورد مبلغ کمتر از ربع نیاز است (−۶)'); } }
      var rec = (LEARN || []).filter(function (x) { return ids.indexOf(x.id) >= 0; });
      if (rec.length) { var fails = rec.filter(function (x) { return x.result === 'fail'; }).length, oks = rec.filter(function (x) { return x.result === 'success'; }).length, mo = rec.map(function (x) { return num(x.months); }).filter(isFinite);
        it.exp = { n: rec.length, fails: fails, oks: oks, months: mo.length ? mo.reduce(function (a, b) { return a + b; }, 0) / mo.length : NaN, notes: rec.map(function (x) { return x.lesson; }).filter(Boolean) };
        if (fails > oks) { adj -= 5; why.push('در بانک تجربه ' + fa(fails) + ' اجرای ناموفق ثبت شده (−۵)'); } else if (oks > fails) { adj += 3; why.push('در بانک تجربه ' + fa(oks) + ' اجرای موفق ثبت شده (+۳)'); } }
      it.adj = adj; it.why = why; it.disc = Math.max(0, Math.min(100, Math.round((it.base + adj) * 10) / 10)); return it;
    }
    R.forEach(function (r) {
      if (r.label === 'na' || r.s.k === 'enabler') return;
      var it = { kind: 's', id: r.id, fa: r.s.fa, r: r, s: r.s, base: r.sc.total, tm: r.s.tm, ow: r.s.ow, st: r.s.st, label: r.label, definitive: r.definitive, z: r.z, amtH: isFinite(r.z.amt) ? r.z.amt / HB : NaN, val: r.z.val };
      it.ch = chOf(it); it.tier = tierOf(it);
      if (noBank && BANK.indexOf(r.id) >= 0) { it.bankOut = true; }
      list.push(common(it));
    });
    (X.C || []).forEach(function (c) {
      if (!c.active) return;
      var comps = c.comps, ids = comps.map(function (r) { return r.id; });
      var it = { kind: 'c', id: c.c.id, fa: c.c.fa, c: c.c, cc: c, comps: comps, ids: ids, base: c.score, tm: [Math.max.apply(null, comps.map(function (r) { return r.s.tm[0]; })), comps.reduce(function (s, r) { return s + r.s.tm[1]; }, 0)],
        ow: Math.min.apply(null, comps.map(function (r) { return r.s.ow; })), st: comps.some(function (r) { return r.s.st === 'dev'; }) ? 'dev' : comps.some(function (r) { return r.s.st === 'cond'; }) ? 'cond' : 'exec', label: c.label, definitive: c.definitive, amtH: c.cash > 0 ? c.cash / HB : NaN };
      it.ch = chOf(it); it.tier = 'hybrid';
      if (noBank && ids.some(function (i) { return BANK.indexOf(i) >= 0 && c.c.req.indexOf(i) >= 0; })) it.bankOut = true;
      list.push(common(it));
    });
    list.forEach(function (it) { feas(it, X, M); status5(it, M); });
    list.sort(function (a, b) { return b.disc - a.disc; });
    return list;
  }

  /* ---------- 3 · market feasibility on seven dimensions (directive B) ---------- */
  function feas(it, X, M) {
    var D = [], add = function (k, n, st, t) { D.push({ k: k, n: n, st: st, t: t }); };
    var cap = num((M.cap || {})[it.ch]), amt = it.amtH, need = num(M.need), val = num(M.val), by = num(M.by);
    var ev = (M.ev || {})[it.ch];
    // capacity
    if (!(amt > 0)) add('cap', 'ظرفیت بازار', amt === 0 ? 'na' : 'unk', amt === 0 ? 'وجه نقد مستقیم ایجاد نمی‌کند؛ ارزش دارایی به پروژه یا صندوق منتقل می‌شود.' : 'مبلغ قابل برآورد نیست (' + (it.z ? it.z.formula : 'اجزای ساختار') + ').');
    else if (isFinite(cap) && cap > 0) { it.tranches = Math.ceil(amt / cap); add('cap', 'ظرفیت بازار', it.tranches > 1 ? 'warn' : 'ok', it.tranches > 1 ? 'بزرگ‌ترین معاملهٔ قابل جذب در یک نوبت ' + H(cap) + ' (ورودی شما' + (ev ? '، شاهد: ' + ev : '، بدون شاهد ثبت‌شده') + ')؛ ' + H(amt) + ' در ' + fa(it.tranches) + ' مرحله.' : 'در یک نوبت در ظرفیت واردشدهٔ ' + H(cap) + ' جا می‌شود' + (ev ? ' (شاهد: ' + ev + ')' : ' (شاهد بازار ثبت نشده)') + '.'); }
    else add('cap', 'ظرفیت بازار', 'unk', 'ظرفیت جذب «' + CH[it.ch] + '» در یک معامله وارد نشده. بدون معاملات مشابه، اندازهٔ قابل جذب قابل برآورد نیست.');
    // scale
    if (amt > 0 && isFinite(need) && need > 0) add('scale', 'مقیاس معامله', amt >= need ? 'ok' : amt >= 0.5 * need ? 'warn' : 'bad', 'برآورد ' + H(amt) + ' در برابر نیاز ' + H(need) + ' (' + P(amt / need) + ' پوشش).');
    else if (amt > 0 && isFinite(val) && val > 0) add('scale', 'مقیاس معامله', 'unk', 'برآورد ' + H(amt) + ' معادل ' + P(amt / val) + ' ارزش اعلام‌شده؛ مبلغ نیاز وارد نشده.');
    else add('scale', 'مقیاس معامله', amt === 0 ? 'na' : 'unk', 'نامشخص.');
    // time
    var n = it.tranches || 1, t0 = it.tm[0], t1 = it.tm[1] + (n - 1) * Math.max(1, it.tm[0]); if (it.exp && isFinite(it.exp.months) && it.exp.months > t1) t1 = Math.round(it.exp.months); it.tmEff = [t0, t1];
    add('time', 'زمان اجرا', isFinite(by) ? (by < t0 ? 'bad' : by < t1 || (it.spvBani && by < 18) ? 'warn' : 'ok') : (it.spvBani ? 'warn' : 'unk'), 'بازهٔ پروفایل راهکار ' + Mo(it.tm[0], it.tm[1]) + (n > 1 ? '؛ با ' + fa(n) + ' مرحله تا حدود ' + Mo(t1) + ' (فرض: مرحلهٔ اول کل بازه، هر مرحلهٔ بعد حداقل زمان پروفایل)' : '') + (isFinite(by) ? '؛ مهلت شما ' + Mo(by) + '.' : '؛ مهلت وارد نشده.') + (it.exp && isFinite(it.exp.months) ? ' تجربهٔ ثبت‌شده: میانگین ' + Mo(Math.round(it.exp.months)) + ' در ' + fa(it.exp.n) + ' پرونده.' : '') + (it.spvBani ? ' اگر شرکت تازه‌تأسیس بانی باشد، احراز شرایط بانی حدود دو دورهٔ مالی (≈ ۱۸ ماه) به‌علاوهٔ حسابرسی طول می‌کشد مگر معافیت یا بانی شدن شرکت مادر — بازهٔ پروفایل این را لحاظ نکرده است.' : ''));
    // realizable price
    if (it.kind === 's' && it.z && isFinite(it.z.val) && it.z.val > 0 && amt > 0) { var hc = 1 - amt * HB / it.z.val, bulk = num(M.bulk); it.haircut = hc;
      add('price', 'قیمت تحقق‌یافتنی', 'warn', 'ارزش مبنا ' + H(it.z.val / HB) + ' → برآورد قابل دریافت ' + H(amt) + ' (کسر ' + P(hc) + ' طبق فرض‌های موتور)' + (it.s.k === 'sale' && n > 1 ? '؛ فروش یکجا معمولاً تخفیف بیشتری می‌طلبد' + (isFinite(bulk) ? ' — با تخفیف اضافهٔ واردشدهٔ شما ' + P(bulk) + ': ' + H(amt * (1 - bulk)) : ' — اندازه‌اش را وارد کنید') : '') + '. ارزش کارشناسی، دفتری، منصفانه و قیمت تحقق‌یافتنی یکی نیستند.'); }
    else if (it.kind === 's' && /sale|slb|reit|surplus|finsale|block/.test(it.s.sz)) add('price', 'قیمت تحقق‌یافتنی', 'unk', 'ارزش مبنا یا تخفیف قابل محاسبه نیست.');
    else add('price', 'قیمت تحقق‌یافتنی', 'na', it.s && it.s.k === 'debt' ? 'بدهی: مبلغ به ظرفیت بازپرداخت و ارزش وثیقه/دارایی بستگی دارد.' : 'موضوعیت ندارد یا در اجزای ساختار سنجیده می‌شود.');
    // cost
    var cl = it.kind === 's' ? it.s.cl : Math.max.apply(null, it.comps.map(function (r) { return r.s.cl; }));
    var rate = it.kind === 's' && it.r.eco && isFinite(it.r.eco.rate) ? it.r.eco.rate : NaN;
    add('cost', 'هزینهٔ اجرا', cl >= 4 ? 'warn' : 'ok', 'سطح هزینه ' + fa(cl) + ' از ۵' + (isFinite(rate) ? '؛ نرخ تمام‌شده با فرض‌های شما ' + P(rate) : '') + (it.kind === 's' ? '. ' + it.s.cost : '. جمع هزینهٔ اجزای ساختار.'));
    // audit and reporting feasibility
    var gl0 = it.kind === 's' ? [it.r] : it.comps, needsAudit = gl0.some(function (r) { return r.gates.some(function (g) { return g.c === 'audit'; }); });
    if (it.spvBani) add('audit', 'حسابرسی و گزارشگری', 'warn', 'شرکت تازه‌تأسیس: تهیهٔ صورت مالی از تأسیس ممکن است، اما سابقهٔ دوسالهٔ حسابرسی‌شده برای بانی وجود ندارد [IJ] ۲ و ۶.');
    else if (needsAudit) add('audit', 'حسابرسی و گزارشگری', M.opinion === 'unqualified' || M.opinion === 'qualified' ? 'ok' : M.opinion === 'adverse' || M.opinion === 'none' ? 'bad' : 'unk', 'به صورت‌های حسابرسی‌شده با اظهارنظر مقبول یا مشروط نیاز دارد؛ وضعیت شما: ' + ({ unqualified: 'مقبول', qualified: 'مشروط', adverse: 'مردود', none: 'عدم اظهارنظر' }[M.opinion] || 'نامشخص') + '.');
    else add('audit', 'حسابرسی و گزارشگری', 'na', 'این مسیر صورت حسابرسی‌شدهٔ بانی را شرط مقرراتی نمی‌کند؛ بانک، خریدار یا شریک خودش ارزیابی می‌کند.');
    // transfer of ownership or benefits
    var ids0 = idsOf(it), moves = ids0.some(function (i) { return /^(A01|A02|A03|A04|A05|A07|A09|A14|D03|E07|E04|E11)$/.test(i); }), pledges = ids0.some(function (i) { return i === 'A06'; });
    if ((moves || pledges) && phys(M)) add('transfer', 'انتقال مالکیت یا منافع', M.title === 'clean' ? 'ok' : M.title === 'issue' ? 'bad' : 'unk', (moves ? 'مالکیت یا منافع دارایی منتقل می‌شود' : 'دارایی توثیق می‌شود') + '؛ سند: ' + ({ clean: 'رسمی و سالم', issue: 'معارض / نیازمند اصلاح' }[M.title] || 'نامشخص') + '.' + (M.title === 'issue' ? ' جایگزین: واگذاری حق بهره‌برداری یا منافع (اجارهٔ بلندمدت، اوراق منفعت) یا اصلاح سند پیش از انتقال.' : ''));
    else add('transfer', 'انتقال مالکیت یا منافع', 'na', 'انتقال دارایی ندارد.');
    // tax and accounting
    var toSpv = ids0.some(function (i) { return i === 'A03' || i === 'E07' || i === 'A07'; }), toVaset = ids0.some(function (i) { return i === 'A04' || i === 'D03'; }), sale = ids0.some(function (i) { return /^(A01|A02|A05|A09|A14|E04|E11)$/.test(i); });
    if (toSpv || sale) add('tax', 'آثار مالیاتی و حسابداری', 'unk', (toSpv ? 'انتقال به شرکت جدید یا مشترک: مالیات نقل‌وانتقال و ثبت آوردهٔ غیرنقدی؛ معافیتی در متون کدگذاری‌شده نیست — استعلام. ' : '') + (sale ? 'فروش یا انتقال: سود یا زیان فروش شناسایی می‌شود؛ مالیات نقل‌وانتقال — استعلام. ' : '') + (toSpv ? 'معامله با شخص وابسته و تلفیق صورت‌ها لازم است.' : ''));
    else if (toVaset) add('tax', 'آثار مالیاتی و حسابداری', 'ok', 'انتقال به نهاد واسط: معافیت مواد ۱۱–۱۲ قانون توسعهٔ ابزارها [DV]؛ در دفاتر بانی بدهی مالی شناسایی می‌شود.');
    else add('tax', 'آثار مالیاتی و حسابداری', 'na', 'بدهی یا تأمین مالی بدون انتقال: هزینهٔ مالی در صورت سود و زیان.');
    // failure risk drivers
    var dr = [], du = [];
    if (it.st === 'dev') dr.push('ابزار در ایران توسعه‌ای است و سابقهٔ اجرای کافی ندارد');
    else if (it.st === 'cond') du.push('اجرای آن در ایران مشروط است');
    if (!(isFinite(cap) && cap > 0) && amt > 0) du.push('ظرفیت جذب کانال نامشخص');
    if (n > 2) dr.push('اجرای چندمرحله‌ای (' + fa(n) + ' مرحله)');
    if (phys(M) && (it.kind === 'c' || it.s.ast.length)) { if (M.title === 'issue') dr.push('سند یا مالکیت نیازمند اصلاح'); else if (M.title !== 'clean') du.push('وضعیت سند و قابلیت انتقال تأیید نشده'); }
    var gl = it.kind === 's' ? [it.r] : it.comps, gf = gl.reduce(function (s, r) { return s + r.fail.length; }, 0), gu = gl.reduce(function (s, r) { return s + r.unk.length; }, 0);
    if (gf) dr.push(fa(gf) + ' شرط مقرراتی یا مالی برقرار نیست');
    if (M.cfo === 'neg' && idsOf(it).indexOf('A06') >= 0) du.push('بازپرداخت وام وثیقه‌ای با جریان نقد عملیاتی منفی — بانک منبع بازپرداخت را می‌خواهد');
    if (M.cfo === 'neg' && idsOf(it).some(function (i) { var b = Hub.finBank.get(i); return b && b.k === 'debt' && /facility|purchases|payables|murabaha|smallmur/.test(b.sz); })) (it.cfoDebt = true, dr.push('جریان نقد عملیاتی منفی: بازپرداخت از محل عملیات برای بانک یا سرمایه‌گذار اثبات نمی‌شود'));
    if (gu) du.push(fa(gu) + ' شرط مقرراتی یا اطلاعاتی نامشخص');
    it.risk = dr.concat(du); it.riskHard = dr;
    add('risk', 'ریسک عدم موفقیت', dr.length >= 2 ? 'bad' : dr.length ? 'warn' : du.length ? 'unk' : 'ok', it.risk.length ? (dr.length ? 'مانع: ' + dr.join('؛ ') + (du.length ? '. ' : '') : '') + (du.length ? 'نامشخص: ' + du.join('؛ ') : '') + '.' : 'عامل شناخته‌شده‌ای برای شکست با اطلاعات فعلی دیده نشد.');
    // fit with the company's goal
    var fit = [], fst = 'ok';
    if (it.late) { fit.push('به مهلت نمی‌رسد'); fst = 'bad'; }
    if (it.ownClash) { fit.push('با حفظ کامل مالکیت سازگار نیست'); fst = 'bad'; }
    if (it.bankOut) { fit.push('بدهی بانکی است و شما آن را نمی‌خواهید'); fst = 'bad'; }
    if (it.objHits && it.objHits.length) fit.push('اهداف: ' + it.objHits.map(function (k) { return OBJFA[k]; }).join('، ')); else if (fst === 'ok') fst = 'warn';
    add('fit', 'تناسب با هدف شرکت', fst, fit.join('؛ ') || 'هدف تأییدشده‌ای ندارد.');
    it.D = D;
    var bad = D.filter(function (d) { return d.st === 'bad'; }).length, warn = D.filter(function (d) { return d.st === 'warn'; }).length, unk = D.filter(function (d) { return d.st === 'unk'; }).length;
    it.fclass = bad ? 'low' : unk >= 4 ? 'unk' : warn >= 3 ? 'med' : unk ? 'med' : 'high';
  }
  var FCLASS = { high: 'امکان‌پذیری بالا', med: 'امکان‌پذیری متوسط', low: 'امکان‌پذیری پایین', unk: 'نامشخص (اطلاعات بازار کم)' };

  /* ---------- 4 · five outcome statuses, three groups, three maturity levels (directives A §5, C §6) ---------- */
  var S5 = { exec: 'قابل اجرا', fix: 'قابل اجرا پس از اصلاح', restr: 'در شکل فعلی ممکن نیست؛ با تغییر ساختار ممکن است', reg: 'نیازمند نظر یا تأیید نهاد ناظر', risk: 'دارای ریسک اجرایی بالا', reject: 'غیرقابل توصیه در شرایط فعلی' };
  var GROUP = { exec: 'قابل اجرا در شرایط فعلی', restr: 'قابل دستیابی با تغییر ساختار، بانی، ضمانت یا ابزار', fix: 'قابل اجرا پس از تکمیل پیش‌نیازها', reg: 'قابل اجرا پس از تکمیل پیش‌نیازها', risk: 'جذابیت نظری با محدودیت اجرایی بالا', reject: 'کنار گذاشته در شرایط فعلی' };
  var LEVEL = { exec: 'راهکار قابل اجرا و اخذ مجوز', restr: 'ساختار قابل طراحی', fix: 'ساختار قابل طراحی', reg: 'ساختار قابل طراحی', risk: 'ایدهٔ خلاقانه', reject: 'ایدهٔ خلاقانه' };
  var REGLEAD = { A01: 1, A02: 1, E08: 1, D04: 1, D06: 1, D07: 1, D09: 1, D10: 1, E03: 1, E11: 1, A12: 1, D08: 1, E09: 1 };
  // a route is not 'executable' while a constraint it depends on (may we sell / transfer / pledge / take a partner?) or the title is still unknown
  function openCons(it, M) { var gl = it.kind === 's' ? [it.r] : it.comps; return gl.some(function (r) { return r.unk.some(function (g) { return g.c.indexOf('c:') === 0 || g.c === 'partner' || g.c === 'equityOk'; }); }) || (phys(M) && M.title !== 'clean' && (it.kind === 'c' || it.s.ast.length > 0)); }
  var HARDG = { cfo2: 1, la: 1, audit: 1, credit: 1, jsc: 1, nart141: 1 };
  function hardFail(it) { var gl = it.kind === 's' ? [it.r] : it.comps, o = []; gl.forEach(function (r) { r.fail.forEach(function (g) { if (HARDG[g.c] && o.indexOf(g.n) < 0) o.push(g.n); }); }); return o; }
  // the directive's four states
  var S4 = { 1: 'از ابتدا امکان‌پذیر', 2: 'با اصلاح یا تکمیل پیش‌نیاز امکان‌پذیر', 3: 'در شکل فعلی ممکن نیست؛ با تغییر ساختار، ابزار، بانی یا ارکان به همان هدف می‌رسد', 4: 'قابل توصیه نیست؛ گزینهٔ دیگری انتخاب شود' };
  function s4of(it) { return it.s5 === 'exec' ? 1 : it.s5 === 'restr' ? 3 : it.s5 === 'reject' || (it.s5 === 'risk' && it.st === 'dev') ? 4 : 2; }
  function status5(it, M) {
    var why;
    if (it.cfoDebt) { it.adj -= 15; it.disc = Math.max(0, it.disc - 15); it.why.push('بدهی با بازپرداخت از محل عملیات در حالی که جریان نقد عملیاتی منفی است (−۱۵)'); }
    if (it.label === 'excluded' || it.late || it.ownClash || it.bankOut) { it.s5 = 'reject'; why = it.label === 'excluded' ? 'با یکی از محدودیت‌های قطعی شما تعارض دارد' : it.late ? 'در مهلت شما قابل اجرا نیست' : it.ownClash ? 'با حفظ کامل مالکیت سازگار نیست' : 'شامل بدهی بانکی است'; }
    else if (it.spvBani || hardFail(it).length) { var hf = hardFail(it); it.s5 = 'restr'; why = it.spvBani ? 'بانی تازه‌تأسیس سابقهٔ لازم را ندارد' : 'برقرار نیست: ' + hf.join('، '); it.adj -= 10; it.disc = Math.max(0, it.disc - 10); it.why.push('در شکل فعلی شرط بانی احراز نمی‌شود؛ مسیر رفع در جدول محدودیت‌ها (−۱۰)'); }
    else if (it.st === 'dev' || (it.tranches || 1) >= 3 || (it.riskHard && it.riskHard.length >= 2)) { it.s5 = 'risk'; why = it.st === 'dev' ? 'ابزار توسعه‌ای' : (it.tranches || 1) >= 3 ? 'بیش از دو مرحله برای جذب' : 'عوامل شکست متعدد'; }
    else if (it.definitive && it.fclass !== 'low' && !openCons(it, M)) { it.s5 = 'exec'; why = 'شرایط مقرراتی موتور و محدودیت‌های شما احراز شده'; }
    else if (it.kind === 'c' ? it.comps.some(function (r) { return REGLEAD[r.id]; }) || it.c.id === 'C01' : REGLEAD[it.id]) { it.s5 = 'reg'; why = 'امکان‌پذیری به ضوابط یا تأیید سازمان بورس وابسته است'; }
    else { it.s5 = 'fix'; why = 'شرایط احرازنشده یا اطلاعات ناقص دارد'; }
    it.s5why = why; it.s4 = s4of(it);
  }

  /* ---------- 5 · priorities: 3–5, no padding, prefer different channels ---------- */
  function priorities(list) {
    var ok = list.filter(function (it) { return it.s5 !== 'reject' && it.disc >= 35; }), out = [], used = {};
    ok.forEach(function (it) { if (out.length < 5 && !used[it.ch]) { out.push(it); used[it.ch] = 1; } });
    ok.forEach(function (it) { if (out.length < 3 && out.indexOf(it) < 0) out.push(it); });
    return out.sort(function (a, b) { return b.disc - a.disc; });
  }

  /* ---------- 6 · paths with switch conditions (directive B §6) ---------- */
  function pathOf(it, M) {
    var pre = [], sw = [];
    var gates = it.kind === 's' ? it.r.gates : [].concat.apply([], it.comps.map(function (r) { return r.gates; }));
    gates.filter(function (g) { return g.r === 'unk' || g.r === 'fail'; }).forEach(function (g) { if (pre.indexOf(g.n) < 0) pre.push(g.n); });
    if (it.spvBani) pre.unshift('بانی واجد شرایط: شرکت تازه‌تأسیس دو دورهٔ مالی حسابرسی‌شده ندارد — شرکت مادر بانی شود یا از سازمان بورس استعلام شود');
    if (phys(M) && M.title !== 'clean' && (it.kind === 'c' || (it.s && it.s.ast.length))) pre.unshift('سند رسمی، نبود معارض و قابلیت انتقال یا توثیق دارایی');
    (it.D || []).filter(function (d) { return d.st === 'unk' && (d.k === 'cap' || d.k === 'price'); }).forEach(function (d) { pre.push('شاهد بازار برای ' + d.n); });
    pre.slice(0, 4).forEach(function (p) { sw.push('اگر «' + p + '» احراز نشد'); });
    if (it.amtH > 0) sw.push('اگر تا ماه ' + fa(it.tmEff ? it.tmEff[1] : it.tm[1]) + ' کمتر از ' + H(it.amtH * 0.5) + ' (نصف برآورد) جذب شد');
    if (it.haircut != null) sw.push('اگر قیمت پیشنهادی بیش از ' + P(Math.min(0.9, it.haircut + num(M.sc && M.sc.dn || 0.1))) + ' زیر ارزش مبنا بود (فرض سناریوی بدبینانهٔ شما)');
    return { pre: pre, sw: sw };
  }
  function paths(pr, list, M) {
    var main = pr[0] || null; if (!main) return [];
    var alt = pr.filter(function (x) { return x !== main && x.ch !== main.ch; })[0] || pr[1] || null;
    var fb = list.filter(function (x) { return x !== main && x !== alt && x.s5 !== 'reject' && x.ch !== main.ch && (!alt || x.ch !== alt.ch); })[0] || null;
    return [['مسیر اصلی', main], ['مسیر جایگزین', alt], ['مسیر پشتیبان', fb]].filter(function (p) { return p[1]; }).map(function (p) { var q = pathOf(p[1], M); return { role: p[0], it: p[1], pre: q.pre, sw: q.sw }; });
  }

  /* ---------- 7 · portfolio segmentation (directive B §2; hybrid design) ---------- */
  function segments(M) {
    var v = num(M.val), sg = M.seg || {}, parts = [['op', 'املاک عملیاتی (محل فعالیت)', ['A04', 'A05'], 'فروش و اجارهٔ مجدد یا اوراق اجاره: نقد بدون توقف فعالیت'], ['inc', 'املاک درآمدزا (اجاره‌داده‌شده)', ['A01', 'A06', 'A08'], 'صندوق املاک، توثیق یا تبدیل جریان اجاره به مبنای تأمین مالی'], ['idle', 'املاک راکد، زمین یا مازاد', ['A07', 'A02', 'A09'], 'مشارکت در ساخت، صندوق زمین و ساختمان یا فروش مرحله‌ای']];
    var any = parts.some(function (p) { return has(sg[p[0]]); }), sum = parts.reduce(function (s, p) { return s + (has(sg[p[0]]) ? num(sg[p[0]]) : 0); }, 0);
    return { entered: any, sum: sum, rows: parts.map(function (p) { var sh = num(sg[p[0]]); return { k: p[0], fa: p[1], ids: p[2], route: p[3], share: sh, val: isFinite(sh) && isFinite(v) ? v * sh : NaN }; }) };
  }

  /* ---------- 8 · roles and flow of funds for capital-market routes (directive C §4) ---------- */
  function roles(it, M) {
    if (!it) return null;
    var ids = idsOf(it), spv = M.spv === 'yes' || (M.spv === 'auto' && ids.indexOf('A03') >= 0);
    var suk = ids.filter(function (i) { return SUKUK[i]; })[0], cm = ids.filter(function (i) { return CAPMKT[i]; })[0];
    if (!cm) return { cm: false, note: 'این مسیر ابزار بازار سرمایه ندارد؛ نقش‌ها همان طرفین قرارداد مستقیم‌اند (' + (it.kind === 's' ? it.s.par.join('، ') : it.comps.map(function (r) { return r.s.par.join('، '); }).join(' | ')) + ').' };
    if (suk) {
      var bani = spv ? 'شرکت مستقل مالک املاک (SPV)، اگر شرایط بانی را احراز کند؛ در غیر این صورت شرکت مادر' : 'شرکت (مالک فعلی دارایی)';
      return { cm: true, kind: 'sukuk', spv: spv, cite: '[HB] مدل عملیاتی صکوک شرکت مدیریت دارایی مرکزی؛ [IJ] دستورالعمل اوراق اجاره — جزئیات هر انتشار در امیدنامه',
        rows: [['مالک فعلی دارایی', 'شرکت مادر'], ['دارایی به چه کسی منتقل می‌شود', spv ? 'مرحلهٔ ۱: از مادر به SPV (فروش یا آوردهٔ غیرنقدی)؛ مرحلهٔ ۲: از بانی به نهاد واسط' : 'از بانی به نهاد واسط (در اوراق اجاره، تا سررسید)'],
          ['بانی', bani], ['ناشر اوراق', 'نهاد واسط (شرکت واسط مالی وابسته به شرکت مدیریت دارایی مرکزی بازار سرمایه) به وکالت از دارندگان اوراق'],
          ['وجوه انتشار به چه کسی می‌رسد', spv ? 'به SPV (بهای دارایی)؛ انتقال آن به مادر معاملهٔ با اشخاص وابسته است (وام، سود سهام یا بهای انتقال) و باید مستند و افشا شود' : 'به بانی (بهای دارایی یا کالا)'],
          ['متعهد پرداخت اجاره‌بها / سود و اصل', 'بانی؛ در صورت نکول، ضامن یا وثایق'], ['دسترسی دارندگان اوراق هنگام نکول', 'ضامن، اوراق بهادار توثیق‌شده یا دارایی موضوع اوراق — هرکدام که در امیدنامه آمده باشد'],
          ['سازوکار حمایت از سرمایه‌گذار', 'امین، ضامن یا رتبهٔ اعتباری، بازارگردان، افشای دوره‌ای']] };
    }
    var s = Hub.finBank.get(cm);
    return { cm: true, kind: 'other', spv: spv, cite: 'پروفایل راهکار «' + s.fa + '» در بانک راهکارها؛ مستندات با برچسب «نیازمند استعلام»', rows: [['ساختار', s.str], ['منبع وجوه', s.src], ['بازده سرمایه‌گذار / بازپرداخت', s.rep], ['ارکان', s.par.join('، ')], ['مجوزها', s.lic.join('؛ ')]] };
  }

  /* ---------- 9 · regulatory feasibility matrix: parent · asset company (SPV) · intermediary (directive C §1, §3) ---------- */
  var RS = { ok: 'احراز', no: 'احراز نشده', unk: 'نامشخص', inq: 'نیازمند استعلام', na: 'نامرتبط', camc: 'با شرکت مدیریت دارایی مرکزی', must: 'الزامی' };
  function regMatrix(it, M) {
    var ids = it ? idsOf(it) : [], suk = ids.some(function (i) { return SUKUK[i]; }), spv = M.spv === 'yes' || (M.spv === 'auto' && ids.indexOf('A03') >= 0);
    if (!suk) return null;
    var op = M.opinion, opP = op === 'unqualified' || op === 'qualified' ? 'ok' : op === 'adverse' || op === 'none' ? 'no' : 'unk';
    var formP = M.form === 'pjs' || M.form === 'prjs' ? 'ok' : M.form === 'other' ? 'no' : 'unk';
    var titleP = M.title === 'clean' ? 'ok' : M.title === 'issue' ? 'no' : 'unk', S = spv ? null : 'na';
    var rows = [
      ['شکل حقوقی سهامی / تعاونی / صندوق و ثبت در ایران', '[IJ] ۲(الف)(۱-۲)', formP, S || 'must', 'camc', 'SPV باید از ابتدا سهامی ثبت شود.'],
      ['جمع جریان نقد عملیاتی دو سال مالی اخیر مثبت', '[IJ] ۲(الف)(۳) — با ضمانت بانکی دارای تأیید بانک مرکزی یا توثیق کامل اوراق بهادار معاف', 'unk', S || 'no', 'na', 'اولین دورهٔ مالی ≥ ۶ ماه یک سال محسوب می‌شود (مصوبهٔ تفسیری ۱۴۰۱/۱۲/۲۰)؛ SPV تازه‌تأسیس پیش از دو دوره احراز نمی‌کند مگر با معافیت.'],
      ['بدهی‌ها / دارایی‌ها ≤ ۹۰٪', '[IJ] ۲(الف)(۴) — همان معافیت‌ها', 'unk', S || 'unk', 'na', 'برای SPV با ساختار سرمایهٔ آن تعیین می‌شود.'],
      ['اظهارنظر حسابرس و بازرس دو سال اخیر: مردود یا عدم اظهارنظر نباشد', '[IJ] ۲(الف)(۵) — در متن کدگذاری‌شده معافیت ندارد', opP, S || 'inq', 'na', 'SPV دو سال سابقه ندارد؛ نحوهٔ اعمال برای شرکت تازه‌تأسیس باید از سازمان بورس استعلام شود.'],
      ['حسابرس معتمد سازمان؛ ارائهٔ صورت‌های حسابرسی‌شدهٔ دو سال', '[IJ] ۶ و ۲۰(۲)', 'unk', S || 'inq', 'na', 'از تأسیس SPV حسابرس معتمد انتخاب شود تا سابقه از روز اول ساخته شود.'],
      ['نبود تأخیر در پرداخت اصل و فرع اوراق در دو سال اخیر', '[CR] ۸', 'unk', S || 'ok', 'na', 'SPV سابقهٔ نکول ندارد.'],
      ['ضامن، رتبهٔ اعتباری یا توثیق اوراق بهادار', '[IJ] ۵؛ [CR] ۲ و ۵', 'unk', S || 'inq', 'na', 'ضامن نباید تحت کنترل بانی باشد [IJ] ۵؛ صلاحیت شرکت مادر به‌عنوان ضامن SPV در متن کدگذاری‌شده نیست — استعلام.'],
      ['تأییدیهٔ قابلیت انتقال دارایی (ثبت اسناد یا مرجع ذی‌صلاح)؛ اسناد مالکیت', 'مدارک انتشار [IJ]', titleP, S || 'unk', 'na', 'پس از انتقال به SPV، سند باید به نام SPV باشد.'],
      ['گزارش کارشناسان رسمی دربارهٔ ارزش و عمر اقتصادی دارایی', 'مدارک انتشار [IJ]', 'must', S || 'must', 'na', ''],
      ['مصوبهٔ رکن ذی‌صلاح بانی برای تأمین مالی', 'مدارک انتشار [IJ]', 'must', S || 'must', 'na', 'در مسیر SPV مصوبهٔ مادر برای انتقال دارایی هم لازم است.'],
      ['کل اوراق در جریان ≤ سرمایهٔ ثبتی', '[PR] رویهٔ اجرایی سازمان — مصوبهٔ منتشرشده ندارد', 'unk', S || 'unk', 'na', 'سرمایهٔ ثبتی SPV سقف عملی حجم انتشار است؛ با آوردهٔ غیرنقدی املاک تعیین می‌شود.'],
      ['عدم شمول مادهٔ ۱۴۱ اصلاحیهٔ قانون تجارت', 'لایحهٔ اصلاحی قانون تجارت', 'unk', S || 'ok', 'na', 'SPV تازه‌تأسیس زیان انباشته ندارد.'],
      ['گزارشگری و افشای ناشر (کدال)', 'قانون بازار اوراق بهادار — مادهٔ مربوط (به گفتهٔ شما مادهٔ ۴۵) با متن رسمی تطبیق نشده', M.listed === 'ifb' || M.listed === 'tse' ? 'ok' : 'unk', S || 'inq', 'camc', ''],
      ['معاملات با اشخاص وابسته و تلفیق صورت‌های مالی', 'استانداردهای حسابداری — تطبیق نشده', spv ? 'must' : 'na', S || 'must', 'na', 'انتقال مادر → SPV و جریان وجوه SPV → مادر معاملهٔ با اشخاص وابسته است.'],
      ['مالیات نقل‌وانتقال دارایی', '[DV] مواد ۱۱–۱۲: معافیت انتقال به نهاد واسط', 'inq', S || 'inq', 'ok', 'برای انتقال مادر → SPV معافیتی در متون کدگذاری‌شده نیست؛ هزینهٔ مالیاتی این مرحله باید استعلام شود.']];
    return { spv: spv, cols: ['شرکت مادر', 'شرکت مالک املاک (SPV)', 'نهاد واسط'], rows: rows.map(function (r) { return { req: r[0], cite: r[1], p: r[2], s: r[3], n: r[4], note: r[5] }; }) };
  }
  // the four questions that are not the same thing (directive C §3)
  function spvAudit(M) {
    var title = M.title === 'clean' ? 'ok' : M.title === 'issue' ? 'no' : 'unk';
    return [
      { q: 'تهیهٔ صورت‌های مالی از زمان تأسیس (ترازنامهٔ افتتاحیه پس از انتقال)', st: 'ok', t: 'از نظر فنی ممکن است؛ کیفیت آن به مستندات انتقال و ارزش‌گذاری بستگی دارد.' },
      { q: 'قابلیت حسابرسی و دریافت گزارش حسابرس', st: title === 'ok' ? 'unk' : title === 'no' ? 'no' : 'unk', t: title === 'no' ? 'سند معارض یا نیازمند اصلاح، رسیدگی حسابرس به مالکیت را مختل می‌کند.' : 'به سند به نام SPV، گزارش کارشناس رسمی، قراردادهای اجارهٔ قابل اثبات و مستندسازی معاملات با مادر بستگی دارد.' },
      { q: 'احراز شرایط بانی برای اوراق اجاره', st: 'no', t: 'جریان نقد عملیاتی دوساله و اظهارنظر دو سال اخیر [IJ] ۲(الف)(۳) و (۵): برای SPV تازه‌تأسیس احراز نمی‌شود. جریان نقد و نسبت بدهی با ضمانت بانکی دارای تأیید بانک مرکزی معاف‌شدنی است؛ اظهارنظر دوساله و حسابرس معتمد در متن کدگذاری‌شده معافیت ندارند. اگر قاعدهٔ «اولین دورهٔ ≥ ۶ ماه = یک سال» برای این آزمون‌ها هم پذیرفته شود، حداقل دو دورهٔ مالی (حدود ۱۸ ماه) به‌علاوهٔ زمان حسابرسی لازم است — نیازمند استعلام از سازمان بورس.' },
      { q: 'اخذ مجوز انتشار و عرضه', st: 'inq', t: 'وابسته به تصمیم سازمان بورس پس از احراز موارد بالا؛ تاکنون هیچ‌کدام برای SPV احراز نشده است.' }];
  }
  function spvAlternatives() {
    return ['شرکت مادر بانی شود و دارایی مستقیم به نهاد واسط منتقل شود (فروش و اجارهٔ مجدد با اوراق اجاره) — بدون انتظار برای سابقهٔ SPV؛ معافیت مالیاتی انتقال به نهاد واسط [DV].',
      'یک شرکت موجود و واجد شرایط گروه (دارای دو سال صورت حسابرسی‌شده با حسابرس معتمد) به‌جای SPV جدید.',
      'SPV اکنون تأسیس و دارایی منتقل شود اما تأمین مالی اولیه با توثیق یا تسهیلات انجام شود؛ انتشار اوراق پس از ساختن سابقهٔ مالی.',
      'ابزاری که سابقهٔ دوسالهٔ بانی نمی‌خواهد (صندوق املاک، مشارکت با سرمایه‌گذار در سطح SPV) — هرکدام با ضوابط خودش.'];
  }

  /* ---------- 10 · staged information (directive A §7) and the one decisive question ---------- */
  function infoStages(M, pr) {
    var st = function (ok) { return ok ? 'دریافت شده' : 'لازم'; };
    var s1 = [['نوع فعالیت شرکت و دارایی‌های اصلی', st(has(M.val) && (M.at || archOf(M.arch).at || archOf(M.arch).k === 'project')), 'فهرست ابزارهای مرتبط و اندازهٔ معامله'],
      ['مبلغ تقریبی منابع موردنیاز', st(has(M.need)), 'پوشش نیاز و مقیاس هر گزینه'], ['هدف تأمین مالی', st(Object.keys(M.obj || {}).length || archOf(M.arch).obj.length), 'کدام ساختار به مسئلهٔ واقعی پاسخ می‌دهد'],
      ['زمان موردنیاز', st(has(M.by)), 'ابزارهای کند کنار می‌روند'], ['تمایل به حفظ مالکیت', st(M.keep !== 'unk'), 'فروش و صندوق در برابر وثیقه و اوراق'], ['وضعیت کلی بدهی‌ها و نقدینگی (جریان نقد عملیاتی، نسبت بدهی)', st(M.cfo !== 'unk' && M.la !== 'unk'), 'احراز شرایط بانی و ظرفیت بدهی']];
    var s2 = [['صورت‌های مالی', 'لازم', 'ظرفیت بدهی و آزمون‌های [IJ] ۲'], ['جریان وجوه نقد (و میان‌دوره‌ای)', st(M.cfo !== 'unk') + (M.cfo === 'neg' ? ' — منفی؛ علت مقطعی یا ساختاری؟' : ''), 'مسیر رفع محدودیت جریان نقد'], ['وضعیت بدهی‌ها، سررسیدها و تضامین موجود', st(M.bankGuar !== 'unk'), 'ظرفیت بدهی و ضامن قابل ارائه'],
      ['قراردادهای اصلی', 'لازم', 'تأمین مالی مبتنی بر قرارداد و جریان نقد'], ['ارزش و وضعیت حقوقی دارایی‌ها', st(M.title !== 'unk'), 'انتقال، توثیق و حسابرسی‌پذیری'], ['ساختار سهامداری و شرکت‌های گروه', st(M.groupCo !== 'unk'), 'بانی یا ضامن جایگزین واجد شرایط'], ['درآمدهای عملیاتی و غیرعملیاتی دارایی', st(M.inc !== 'unk' && (M.inc === 'no' || has(M.incVal))), 'صندوق املاک و ساختار مبتنی بر اجاره']];
    var s3 = [['گزارش‌های حسابرسی دو سال و حسابرس معتمد', st(M.opinion !== 'unk'), '[IJ] ۲(الف)(۵)، ۶'], ['گزارش‌های کارشناسی رسمی', 'لازم', 'ارزش مبنا و قیمت تحقق‌یافتنی'], ['اسناد مالکیت و تأییدیهٔ قابلیت انتقال', st(M.title === 'clean'), 'مدارک انتشار'], ['اطلاعات مالیاتی', 'لازم', 'هزینهٔ انتقال به SPV یا خریدار'],
      ['قراردادهای تأمین و فروش', 'لازم', 'جریان نقد قابل اتکا'], ['مصوبات ارکان شرکت', 'لازم', 'مجمع/هیئت‌مدیره'], ['اطلاعات اعتباری، رتبه و تضامین', st(M.bankGuar !== 'unk' || M.secColl !== 'unk'), 'مسیرهای جایگزین ضامن'], ['مستندات نهادهای مالی و بازار سرمایه', 'لازم', 'تشکیل پرونده']];
    // decisive question: an unknown that separates the top two priorities
    var q = null, a = pr[0], b = pr[1];
    if (a && b) {
      if (M.keep === 'unk' && Math.abs(a.ow - b.ow) >= 0.3) q = ['آیا حفظ مالکیت دارایی الزامی است؟', '«' + a.fa + '» مالکیت را ' + P(a.ow) + ' و «' + b.fa + '» ' + P(b.ow) + ' حفظ می‌کند.'];
      else if (!has(M.by) && Math.abs(a.tm[1] - b.tm[1]) >= 4) q = ['نقدینگی تا چند ماه دیگر لازم است؟', 'زمان اجرای دو گزینهٔ اول ' + Mo(a.tm[0], a.tm[1]) + ' و ' + Mo(b.tm[0], b.tm[1]) + ' است.'];
      else if (M.inc === 'unk' && [a, b].some(function (x) { return idsOf(x).some(function (i) { return i === 'A01' || i === 'A08'; }); })) q = ['آیا دارایی اکنون درآمد اجاره دارد و چقدر؟', 'صندوق املاک و ساختارهای مبتنی بر اجاره فقط با درآمد مستند ممکن‌اند.'];
      else if (M.op === 'unk' && [a, b].some(function (x) { return idsOf(x).some(function (i) { return i === 'A04' || i === 'A05' || i === 'A09'; }); })) q = ['آیا شرکت خودش از این دارایی استفاده می‌کند؟', 'دارایی عملیاتی به فروش و اجارهٔ مجدد می‌رود، دارایی مازاد به فروش مرحله‌ای.'];
      else if (!has(M.need)) q = ['مبلغ نقدینگی موردنیاز چقدر است؟', 'بدون آن، پوشش نیاز و مقیاس هر گزینه سنجیده نمی‌شود.'];
    }
    return { s1: s1, s2: s2, s3: s3, decisive: q };
  }

  /* ---------- 11 · roadmap of the main path, with the decision gate to the alternative ---------- */
  function owner(step) { return /مجمع/.test(step) ? 'هیئت‌مدیره و مجمع' : /مجوز|ثبت|پذیرش/.test(step) ? 'مشاور عرضه / مشاور حقوقی' : /ارزیاب|ارزش‌گذاری|کارشناس/.test(step) ? 'کارشناس رسمی / مشاور مالی' : /قرارداد|مذاکره|خریدار|سرمایه‌گذار|شریک/.test(step) ? 'مدیر مالی و مشاور حقوقی' : /ضمانت|رتبه/.test(step) ? 'مدیر مالی و ضامن / مؤسسهٔ رتبه‌بندی' : 'مدیر مالی'; }
  var RCAT = [[/مجمع|مصوبه|هیئت/, 'موافقت‌ها و مصوبات'], [/مجوز|ثبت|پذیرش|پذیره|عرضه|انتشار/, 'مجوز، انتشار و عرضه'], [/ارزیاب|ارزش‌گذاری|کارشناس/, 'ارزش‌گذاری و کارشناسی'], [/حسابرس|صورت/, 'حسابداری و حسابرسی'], [/تأسیس|انتقال|سند|تفکیک|تجمیع/, 'اصلاحات حقوقی و ثبتی'], [/ارکان|مدیر|ضامن|متعهد|بازارگردان|رتبه/, 'انتخاب ارکان'], [/مذاکره|خریدار|سرمایه‌گذار|شریک|بازاریابی/, 'مذاکره با بانک و سرمایه‌گذار'], [/قرارداد|رهن|توثیق/, 'انعقاد قرارداد'], [/برداشت|وصول|پرداخت|فروش/, 'وصول منابع']];
  function rcat(step) { for (var i = 0; i < RCAT.length; i++) if (RCAT[i][0].test(step)) return RCAT[i][1]; return 'اقدامات اولیه'; }
  function roadmap(P3, M, regM) { var o = roadmap0(P3, M, regM); o.forEach(function (s, i) { s.cat = s.cat || rcat(s.step); s.dep = s.dep || (i === 0 ? '—' : 'مرحلهٔ ' + fa(i)); s.gate = s.gate || ('«' + s.step.split(' (')[0].slice(0, 40) + '» انجام و مستند شد'); }); return o; }
  function roadmap0(P3, M, regM) {
    var out = [], t = 0, main = P3[0], alt = P3[1];
    if (!main) return out;
    var inq = regM ? regM.rows.filter(function (r) { return r.p === 'inq' || r.s === 'inq'; }).map(function (r) { return r.req; }) : [];
    out.push({ step: 'تکمیل اطلاعات مرحلهٔ دوم (سند، ارزش کارشناسی، وثایق، درآمد، بدهی‌ها) و شاهد ظرفیت بازار', from: 0, to: 1, owner: 'مدیر مالی', out: 'پروندهٔ دارایی و فهرست معاملات مشابه', cat: 'اسناد و اطلاعات', gate: 'سند، ارزش کارشناسی و وضعیت وثایق دریافت شد' });
    if (inq.length) out.push({ step: 'استعلام از سازمان بورس، مشاور مالیاتی و ثبت: ' + inq.slice(0, 4).join('؛ '), from: 0, to: 2, owner: 'مشاور حقوقی / مشاور عرضه', out: 'پاسخ کتبی یا نظر مشورتی', cat: 'موافقت‌ها و مجوزها', dep: 'هم‌زمان با مرحلهٔ ۱', gate: 'پاسخ استعلام مسیر اصلی را رد نکرد' });
    t = 1;
    var steps = main.it.kind === 's' ? main.it.s.stp.map(function (s) { return [s, main.it.s.tm[1] / Math.max(1, main.it.s.stp.length)]; }) : main.it.c.ph.map(function (p) { var sols = p[1].map(function (i) { return Hub.finBank.get(i); }).filter(Boolean); return [p[0], sols.length ? Math.max.apply(null, sols.map(function (s) { return s.tm[1]; })) : 2]; });
    steps.forEach(function (s) { var d = Math.max(0.5, Math.round(s[1] * 10) / 10); out.push({ step: s[0], from: t, to: Math.round((t + d) * 10) / 10, owner: owner(s[0]), out: '' }); t = Math.round((t + d) * 10) / 10; });
    if (alt) out.push({ step: 'نقطهٔ تصمیم: ' + (main.sw[0] || 'بررسی پیشرفت') + ' ← انتقال به «' + alt.it.fa + '»', from: Math.min(t, 1 + Math.ceil(main.it.tm[0])), to: Math.min(t, 1 + Math.ceil(main.it.tm[0])), owner: 'هیئت‌مدیره', out: 'تصمیم ادامه یا تغییر مسیر', cat: 'نقطهٔ تصمیم', gate: 'هیچ شرط انتقالی فعال نشد' });
    return out;
  }

  /* ---------- 12 · eleven-criterion matrix (directive A §5): 1 weak … 5 strong, rule per cell ---------- */
  var CRIT = ['منابع قابل جذب', 'هزینهٔ مؤثر', 'زمان', 'امکان‌پذیری مقرراتی', 'امکان اجرا', 'حفظ مالکیت', 'ریسک', 'انعطاف‌پذیری (مرحله‌ای، قابل تغییر)', 'ظرفیت بازار', 'پیچیدگی (۵ = ساده)'];
  function crit(it, M) {
    var gates = it.kind === 's' ? it.r.gates : [].concat.apply([], it.comps.map(function (r) { return r.gates; }));
    var rg = gates.filter(function (g) { return HARDG[g.c] || g.c === 'profit2'; });
    var legal = it.s5 === 'restr' || rg.some(function (g) { return g.r === 'fail'; }) ? 1 : rg.some(function (g) { return g.r === 'unk'; }) ? 3 : 5;
    var ex = it.st === 'exec' ? 5 : it.st === 'cond' ? 3 : 1, need = num(M.need);
    var capS = !(it.amtH > 0) ? (it.amtH === 0 ? 1 : 2) : isFinite(need) && need > 0 ? (it.amtH >= need ? 5 : it.amtH >= 0.5 * need ? 4 : 3) : 3;
    var cl = it.kind === 's' ? it.s.cl : Math.max.apply(null, it.comps.map(function (r) { return r.s.cl; }));
    var t1 = (it.tmEff || it.tm)[1], tm = t1 <= 3 ? 5 : t1 <= 6 ? 4 : t1 <= 9 ? 3 : t1 <= 12 ? 2 : 1;
    var own = Math.max(1, Math.round(it.ow * 5));
    var hard = (it.riskHard || []).length, rk = hard >= 2 ? 1 : hard ? 2 : (it.risk || []).length ? 3 : 4;
    var flex = it.kind === 'c' ? 4 : /sale|slb|surplus|finsale|block|pledge|facility/.test(it.s.sz) ? 4 : CAPMKT[it.id] ? 3 : 2;
    var cap = num((M.cap || {})[it.ch]), mk = !(it.amtH > 0) ? 3 : isFinite(cap) && cap > 0 ? (it.amtH <= cap ? 4 : it.amtH <= 2 * cap ? 3 : 2) : 2;
    var par = it.kind === 's' ? it.s.par.length : it.comps.reduce(function (s, r) { return s + r.s.par.length; }, 0), cx = par <= 3 ? 5 : par <= 5 ? 4 : par <= 7 ? 3 : par <= 9 ? 2 : 1;
    return [capS, 6 - cl, tm, legal, ex, own, rk, flex, mk, cx];
  }
  var CRITRULE = ['برآورد به نیاز: ≥۱۰۰٪ = ۵، ≥۵۰٪ = ۴، کمتر = ۳، نامشخص = ۲، بدون نقد = ۱', '۶ − سطح هزینهٔ پروفایل', 'حداکثر ماه (با مراحل): ≤۳ = ۵ … >۱۲ = ۱', 'گیت‌های مقرراتی: رد یا نیازمند تغییر ساختار = ۱، نامشخص = ۳، احراز = ۵', 'وضعیت در ایران: قابل اجرا ۵، مشروط ۳، توسعه‌ای ۱', 'سهم مالکیت حفظ‌شده × ۵',
    'مانع: ≥۲ = ۱، یکی = ۲، فقط نامشخص = ۳، هیچ = ۴', 'ترکیبی، فروش، توثیق یا تسهیلات ۴؛ ابزار بازار سرمایه ۳؛ بقیه ۲', 'مبلغ به ظرفیت واردشده: جا می‌شود ۴، تا دو برابر ۳، نامشخص یا بیشتر ۲', 'تعداد ارکان: ≤۳ = ۵ … >۹ = ۱'];

  /* ---------- 13 · scenario and sensitivity on realizable proceeds (inputs: your shifts) ---------- */
  function scen(it, M) {
    if (!it || !(it.amtH > 0)) return null;
    var dn = num(M.sc && M.sc.dn), up = num(M.sc && M.sc.up), base = it.amtH, hc = it.haircut != null ? it.haircut : 0, val = it.haircut != null ? base / (1 - hc) : NaN;
    var rows = isFinite(val) ? [['بدبینانه', hc + (isFinite(dn) ? dn : 0)], ['پایه', hc], ['خوش‌بینانه', Math.max(0, hc - (isFinite(up) ? up : 0))]].map(function (r) { return { n: r[0], hc: r[1], amt: val * (1 - r[1]) }; })
      : [['بدبینانه', -(isFinite(dn) ? dn : 0)], ['پایه', 0], ['خوش‌بینانه', isFinite(up) ? up : 0]].map(function (r) { return { n: r[0], hc: NaN, amt: base * (1 + r[1]) }; });
    var shares = [0.25, 0.5, 0.75, 1], hcs = [-0.1, -0.05, 0, 0.05, 0.1, 0.2].map(function (d) { return Math.max(0, Math.min(0.95, hc + d)); });
    var grid = isFinite(val) ? hcs.map(function (h) { return { hc: h, v: shares.map(function (s) { return val * s * (1 - h); }) }; }) : null;
    return { rows: rows, val: val, shares: shares, grid: grid, priceBased: isFinite(val) };
  }


  /* ---------- 14 · constraint resolution (comprehensive directive §5.3, §6.2–6.4) ----------
     Each constraint: what it is, where it comes from (article), what it does to the structure, and every path
     examined with its status. Paths never rely on sham transfers, unreal contracts, hidden related parties or
     restated figures (§5.3, §15): a path that would only satisfy a rule on paper is listed as rejected. */
  var PST = { ok: 'قابل پیگیری اکنون', cond: 'مشروط', data: 'دادهٔ لازم وارد نشده', no: 'رد' };
  function tri3(v, yes, no) { return v === 'yes' ? yes : v === 'no' ? no : 'data'; }
  function constraints(M, list) {
    var out = [], live = function (re) { return list.filter(function (it) { return it.s5 !== 'reject' && it.s5 !== 'restr' && re.test(idsOf(it).join(',')); }).slice(0, 4).map(function (it) { return it.fa; }); };
    var noBaniTest = live(/A05|A06|A01|E07|A07|A08|A09|D19|D11|D12/), sukukLive = list.some(function (it) { return idsOf(it).some(function (i) { return SUKUK[i]; }); });
    function C(k, t, origin, effect, paths) { var o = { k: k, t: t, origin: origin, effect: effect, paths: paths }; o.text = narrative(o); out.push(o); }
    if (M.cfo === 'neg' && sukukLive) C('cfo', 'جمع جریان نقد عملیاتی دو سال مالی اخیر بانی مثبت نیست', '[IJ] ۲(الف)(۳) و [MU] ۲(الف)(۲) — شرط بانی، نه ناشر (ناشر نهاد واسط است)', 'شرکت فعلی در اوراق اجاره و مرابحه نمی‌تواند بانی شود مگر با معافیت یا احراز با صورت میان‌دوره‌ای.', [
      { t: 'افزودن جریان نقد عملیاتی میان‌دوره‌ای حسابرسی‌شدهٔ سال جاری به آزمون (یادداشت همان بند در متن کدگذاری‌شده)', st: tri3(M.interim, 'cond', 'no'), need: 'صورت میان‌دوره‌ای حسابرسی‌شده که جمع را مثبت کند؛ تأیید حسابرس؛ پذیرش سازمان', time: 'تا انتشار گزارش حسابرسی میان‌دوره' },
      { t: 'ضمانت پرداخت توسط بانک یا مؤسسهٔ اعتباری دارای مجوز با تأیید بانک مرکزی — شرط جریان نقد و نسبت بدهی را معاف می‌کند', st: tri3(M.bankGuar, 'cond', 'no'), need: 'سقف اعتباری بانک ضامن و تأیید بانک مرکزی؛ هزینهٔ کارمزد ضمانت', time: 'به کمیتهٔ اعتباری بانک بستگی دارد' },
      { t: 'توثیق کامل اوراق بهادار بدون تخفیف رتبه به‌جای ضامن (فقط اوراق اجاره) — همان معافیت', st: tri3(M.secColl, 'cond', 'no'), need: 'سبد اوراق بهادار پذیرفته‌شده به ارزش کافی طبق ضرایب [IJ] ۵', time: 'هم‌زمان با تشکیل پرونده' },
      { t: 'بانی دیگری از گروه که واقعاً شرایط را دارد و واقعاً مالک دارایی موضوع اوراق است', st: tri3(M.groupCo, 'cond', 'no'), need: 'دو سال صورت حسابرسی‌شده با حسابرس معتمد، جریان نقد مثبت، مالکیت واقعی دارایی؛ مصرف منابع شفاف و افشای معامله با شخص وابسته', time: 'انتقال دارایی به آن شرکت + زمان انتشار' },
      { t: 'تأسیس شرکت جدید و انتقال املاک به آن برای رفع این شرط', st: 'no', need: 'شرط مربوط به بانی است؛ شرکت تازه‌تأسیس جریان نقد دوساله ندارد. تأسیس SPV به‌تنهایی این شرط را رفع نمی‌کند (§۶.۳).', time: '—' },
      { t: 'تغییر ابزار به اوراق مرابحه', st: 'no', need: 'همان شرط در [MU] ۲(الف)(۲) آمده است.', time: '—' },
      { t: 'ابزارهایی که آزمون جریان نقد بانی را ندارند (بانک، خریدار یا شریک خودش ارزیابی می‌کند)', st: noBaniTest.length ? 'ok' : 'no', need: noBaniTest.length ? noBaniTest.join('، ') : 'با محدودیت‌های فعلی گزینه‌ای نماند', time: 'بازهٔ هر راهکار' },
      { slow: 1, t: 'اصلاح واقعی سرمایه در گردش و جریان نقد عملیاتی و انتشار پس از احراز', st: 'cond', need: 'تفکیک علت مقطعی از ساختاری در صورت جریان وجوه نقد', time: 'حداقل یک دورهٔ مالی' }]);
    if (sukukLive) C('newco', 'سابقهٔ مالی و حسابرسی شرکت جدید (اگر بانی شود)', '[IJ] ۲(الف)(۵)، ۶ و ۲۰(۲): اظهارنظر حسابرس دو سال اخیر و صورت‌های حسابرسی‌شدهٔ دو سال با حسابرس معتمد', 'SPV تازه‌تأسیس پیش از حدود دو دورهٔ مالی بانی واجد شرایط نیست؛ این بند در متن کدگذاری‌شده معافیت ندارد.', [
      { t: 'شرکت مادر بانی شود و دارایی مستقیم به نهاد واسط فروخته شود (فروش و اجارهٔ مجدد با اوراق اجاره)', st: M.cfo === 'neg' ? 'cond' : M.cfo === 'pos' ? 'ok' : 'data', need: M.cfo === 'neg' ? 'به رفع محدودیت جریان نقد بالا وابسته است' : 'شرایط بانی برای شرکت مادر', time: '۴–۸ ماه (پروفایل)' },
      { t: 'استفاده از شرکت موجود و واجد شرایط گروه', st: tri3(M.groupCo, 'cond', 'no'), need: 'نقش واقعی مالکیت و بهره‌برداری', time: 'انتقال + انتشار' },
      { slow: 1, t: 'تأسیس SPV اکنون با حسابرس معتمد از روز اول؛ تأمین مالی موقت با توثیق یا فروش مرحله‌ای؛ انتشار پس از ساختن سابقه', st: 'cond', need: 'اولین دورهٔ ≥ ۶ ماه یک سال محسوب می‌شود (مصوبهٔ تفسیری ۱۴۰۱/۱۲/۲۰) — اعمال آن بر آزمون اظهارنظر نیازمند استعلام', time: '≈ ۱۸ ماه + حسابرسی' },
      { t: 'استعلام از سازمان بورس دربارهٔ پذیرش ساختار SPV با ضمانت شرکت مادر', st: 'cond', need: 'صلاحیت شرکت مادر به‌عنوان ضامن در متن کدگذاری‌شده نیست؛ ضامن نباید تحت کنترل بانی باشد [IJ] ۵', time: 'به پاسخ سازمان بستگی دارد' }]);
    if (M.la === 'high' && sukukLive) C('la', 'نسبت بدهی‌ها به دارایی‌ها بالای ۹۰٪', '[IJ] ۲(الف)(۴)', 'شرکت فعلی بانی نمی‌شود مگر با معافیت.', [
      { t: 'ضمانت بانکی با تأیید بانک مرکزی (همان معافیت)', st: tri3(M.bankGuar, 'cond', 'no'), need: 'سقف ضامن', time: '—' }, { t: 'تسویهٔ واقعی بدهی از محل فروش دارایی مازاد یا افزایش سرمایه، سپس انتشار', st: 'cond', need: 'منبع واقعی تسویه', time: 'یک دورهٔ گزارشگری' }, { t: 'بانی جایگزین واجد شرایط', st: tri3(M.groupCo, 'cond', 'no'), need: 'مالکیت واقعی دارایی', time: '—' }]);
    if (M.bankGuar === 'no' && sukukLive) C('guar', 'ضامن بانکی در دسترس نیست', '[IJ] ۵؛ [CR] ۲ و ۵', 'انتشار بدون ضامن فقط با رتبهٔ اعتباری یا توثیق ممکن است.', [
      { t: 'رتبهٔ اعتباری حداقل BBB- و پذیرش در بورس یا فرابورس — با سقف نسبت بدهی جدول [CR] ۲', st: M.listed === 'ifb' || M.listed === 'tse' ? 'cond' : M.listed === 'none' ? 'no' : 'data', need: 'گزارش مؤسسهٔ رتبه‌بندی؛ حداقل سفارش خرید ۱۰۰ میلیارد ریال', time: 'زمان رتبه‌بندی' }, { t: 'توثیق اوراق بهادار با ضرایب [IJ] ۵', st: tri3(M.secColl, 'cond', 'no'), need: 'سبد اوراق بهادار', time: '—' }, { t: 'ضامن غیربانکی واجد شرایط که تحت کنترل بانی نباشد', st: 'data', need: 'فهرست ضامن‌های مجاز — استعلام', time: '—' }]);
    if (M.opinion === 'adverse' || M.opinion === 'none') C('op', 'اظهارنظر حسابرس مردود یا عدم اظهارنظر', '[IJ] ۲(الف)(۵) — معافیت ندارد', 'شرکت فعلی بانی هیچ اوراق اجاره یا مرابحه‌ای نمی‌شود.', [{ t: 'رفع واقعی بندهای گزارش حسابرس در دورهٔ بعد', st: 'cond', need: 'اصلاح واقعی، نه تغییر حسابرس برای نتیجهٔ بهتر', time: 'یک دورهٔ مالی' }, { t: 'بانی جایگزین واجد شرایط', st: tri3(M.groupCo, 'cond', 'no'), need: '—', time: '—' }, { t: 'مسیرهای غیر بازار سرمایه', st: noBaniTest.length ? 'ok' : 'no', need: noBaniTest.join('، ') || '—', time: '—' }]);
    if (phys(M) && M.title === 'issue') C('title', 'محدودیت انتقال دارایی (سند معارض یا نیازمند اصلاح)', 'اسناد مالکیت و مدارک انتشار (تأییدیهٔ قابلیت انتقال)', 'فروش، انتقال به SPV، صندوق و اوراق اجاره متوقف می‌شود.', [{ t: 'واگذاری حق بهره‌برداری یا منافع (اجارهٔ بلندمدت، اوراق منفعت)', st: 'cond', need: 'قابلیت قانونی واگذاری منافع', time: '۱–۹ ماه' }, { t: 'مشارکت قراردادی در بهره‌برداری', st: 'cond', need: 'قرارداد مشارکت مدنی', time: '—' }, { t: 'اصلاح سند پیش از ساختار', st: 'cond', need: 'مسیر ثبتی و حقوقی', time: 'نامشخص' }]);
    if (M.inc === 'no' && list.some(function (it) { return idsOf(it).some(function (i) { return i === 'A01' || i === 'D04' || i === 'A08'; }); })) C('cf', 'دارایی جریان نقدی مستقل ندارد', 'ماهیت ابزار و منبع بازپرداخت (صندوق املاک و اوراق مبتنی بر درآمد)', 'صندوق املاک و تأمین مالی مبتنی بر اجاره توجیه اقتصادی ندارند.', [{ t: 'ایجاد قراردادهای اجارهٔ واقعی با مستأجر ثالث به نرخ بازار', st: 'cond', need: 'تقاضای اجاره و قرارداد مستند', time: '۱–۴ ماه' }, { t: 'تفکیک مالکیت و بهره‌برداری: شرکت مالک، شرکت اصلی مستأجر با اجارهٔ واقعی و مستند به نرخ بازار', st: 'cond', need: 'افشای معامله با شخص وابسته؛ نرخ اجاره با گزارش کارشناس', time: 'با تأسیس شرکت مالک' }, { t: 'ابزار غیر وابسته به درآمد (توثیق، فروش مرحله‌ای، مشارکت در ساخت)', st: noBaniTest.length ? 'ok' : 'no', need: noBaniTest.join('، ') || '—', time: '—' }]);
    if (list.some(function (it) { return idsOf(it).some(function (i) { return i === 'A03' || i === 'E07'; }); })) C('tax', 'هزینهٔ مالیاتی انتقال دارایی به شرکت جدید', '[DV] مواد ۱۱–۱۲ فقط انتقال به نهاد واسط را معاف می‌کند (متن کدگذاری‌شده)', 'ساختار «مادر → SPV → نهاد واسط» ممکن است دو بار هزینهٔ انتقال داشته باشد.', [{ t: 'انتقال مستقیم مادر → نهاد واسط (فروش و اجارهٔ مجدد با اوراق اجاره)', st: M.cfo === 'neg' ? 'cond' : 'ok', need: M.cfo === 'neg' ? 'به محدودیت جریان نقد وابسته است' : 'شرایط بانی برای مادر', time: '—' }, { t: 'ساختار قراردادی بدون انتقال مالکیت (حق بهره‌برداری، مشارکت)', st: 'cond', need: '—', time: '—' }, { t: 'استعلام مالیاتی پیش از تصمیم', st: 'data', need: 'نظر مشاور مالیاتی', time: '—' }]);
    var big = list.filter(function (it) { return (it.tranches || 1) > 1 && it.s5 !== 'reject'; })[0];
    if (big) C('vol', 'حجم تأمین مالی بیش از ظرفیت یک‌نوبتی «' + CH[big.ch] + '»', 'ظرفیت بازار (ورودی شما)', fa(big.tranches) + ' مرحله برای «' + big.fa + '» لازم است.', [{ t: 'انتشار یا فروش مرحله‌ای', st: 'ok', need: 'برنامهٔ مراحل', time: 'تا ' + Mo(big.tmEff[1]) }, { t: 'تقسیم بین دو یا چند کانال (مثلاً توثیق + فروش مرحله‌ای)', st: 'ok', need: 'ترکیب منابع', time: '—' }, { t: 'تغییر نرخ یا تخفیف برای جذب', st: 'cond', need: 'هزینهٔ بیشتر', time: '—' }]);
    return out;
  }
  function narrative(c) {
    var ok = c.paths.filter(function (p) { return p.st === 'ok'; }), cond = c.paths.filter(function (p) { return p.st === 'cond'; }), data = c.paths.filter(function (p) { return p.st === 'data'; }), no = c.paths.filter(function (p) { return p.st === 'no'; });
    var live = c.paths.filter(function (p) { return p.st !== 'no' && !p.slow; }), first = live.filter(function (p) { return p.st !== 'ok'; })[0] || live[0] || cond[0], par = ok.filter(function (p) { return p !== first; })[0] || live.filter(function (p) { return p !== first; })[0];
    return 'محدودیت «' + c.t + '» (' + c.origin + '). ' + fa(c.paths.length) + ' مسیر بررسی شد: ' + fa(ok.length) + ' قابل پیگیری اکنون، ' + fa(cond.length) + ' مشروط، ' + fa(data.length) + ' منتظر داده و ' + fa(no.length) + ' رد شده' + (no.length ? ' (' + no.map(function (p) { return p.t.split(' (')[0].split(' —')[0]; }).join('؛ ') + ')' : '') + '. ' +
      (first ? 'پیشنهاد: ابتدا «' + first.t.split(' —')[0] + '» ' + (first.st === 'data' ? 'روشن شود (داده‌اش وارد نشده)' : 'بررسی شود') + (par ? ' و هم‌زمان امکان‌سنجی «' + par.t.split(' —')[0] + '» انجام شود.' : '.') : 'مسیر قابل پیگیری با داده‌های فعلی پیدا نشد.');
  }
  /* §11.4 — what is possible, justified, doable; limits; fixes; recommendation; inquiries */
  function conclude(r) {
    var L = r.list.filter(function (it) { return it.s5 !== 'reject' && (it.disc >= 50 || r.pr.indexOf(it) >= 0); }), need = num(r.M.need);
    var regOk = L.filter(function (it) { return it.s4 <= 2 && idsOf(it).some(function (i) { return CAPMKT[i]; }); }).slice(0, 4).map(function (it) { return it.fa; });
    var econ = L.filter(function (it) { return it.amtH > 0 && (!isFinite(need) || it.amtH >= 0.5 * need); }).slice(0, 4).map(function (it) { return it.fa + ' (' + H(it.amtH) + ')'; });
    var exe = L.filter(function (it) { return it.s4 === 1; }).map(function (it) { return it.fa; });
    var inq = [];
    if (r.reg) r.reg.rows.forEach(function (x) { if (x.p === 'inq' || x.s === 'inq') inq.push({ q: x.req, ref: x.cite, why: x.note || 'احراز در شرایط این پرونده' }); });
    r.cons.forEach(function (c) { c.paths.forEach(function (p) { if (/استعلام|سازمان|بانک مرکزی/.test(p.t + p.need) && p.st !== 'no') inq.push({ q: p.t.split(' —')[0], ref: c.origin, why: p.need }); }); });
    var seen = {}; inq = inq.filter(function (x) { if (seen[x.q]) return false; seen[x.q] = 1; return true; });
    return { regOk: regOk, econ: econ, exe: exe, limits: r.cons.map(function (c) { return c.t; }), fixes: [].concat.apply([], r.cons.map(function (c) { return c.paths.filter(function (p) { return p.st === 'ok' || p.st === 'cond'; }).map(function (p) { return p.t.split(' —')[0]; }); })).slice(0, 8),
      rec: r.paths.map(function (p) { return p.role + ': ' + p.it.fa + ' (' + S4[p.it.s4] + ')'; }), inq: inq };
  }
  /* §3.1 problem classes and §3.2 economic goals, derived from what was said — each with its basis */
  var CAT = { wc: 'تأمین سرمایه در گردش', input: 'تأمین مالی خرید مواد اولیه، خوراک و تجهیزات', expand: 'تأمین مالی طرح‌های توسعه', project: 'تأمین مالی پروژه‌های جدید', refi: 'بازپرداخت یا بازآرایی بدهی‌های موجود', cost: 'کاهش هزینهٔ تأمین مالی', idle: 'آزادسازی منابع و دارایی‌های غیرمولد', fixed2cash: 'تبدیل دارایی‌های ثابت به منابع نقد', income: 'ایجاد درآمد پایدار از دارایی‌ها', capstr: 'اصلاح ساختار سرمایه', partner: 'افزایش سرمایه و جذب شریک', futurecf: 'تأمین مالی از محل جریان نقدی آتی', backed: 'تأمین مالی مبتنی بر دارایی، مطالبات یا قراردادها', keepown: 'بهبود نقدینگی بدون از دست دادن مالکیت دارایی‌های کلیدی' };
  function classify(M) {
    var A = archOf(M.arch), o = [], add = function (k, why) { if (!o.some(function (x) { return x.k === k; })) o.push({ k: k, fa: CAT[k], why: why }); };
    var map = { re: [['fixed2cash', 'دارایی ملکی برای نقدینگی'], ['idle', 'آزادسازی ارزش دارایی'], ['backed', 'دارایی پشتوانهٔ تأمین مالی']], wc: [['wc', 'کمبود سرمایه در گردش'], ['backed', 'دارایی زیاد']], expand: [['expand', 'طرح توسعه'], ['backed', 'ظرفیت دارایی']], ar: [['backed', 'مطالبات'], ['wc', 'وصول کند مطالبات']], nodebt: [['partner', 'بدون بدهی بانکی و افزایش سرمایه: منابع از شریک یا دارایی'], ['fixed2cash', 'دارایی']], project: [['project', 'پروژهٔ جدید'], ['futurecf', 'جریان نقد پروژه']], refi: [['refi', 'بدهی کوتاه‌مدت'], ['capstr', 'سررسیدها']], other: [] };
    (map[A.k] || []).forEach(function (x) { add(x[0], x[1]); });
    if (M.keep === 'keep' || M.keep === 'partial') add('keepown', 'حفظ مالکیت اعلام شده');
    if (M.inc === 'yes' || M.inc === 'partial') add('futurecf', 'درآمد اجاره دارد'); if (M.inc === 'no' && phys(M)) add('income', 'دارایی راکد است');
    var goals = [];
    if (has(M.need)) goals.push('جذب ' + H(num(M.need)) + ' نقدینگی');
    if (has(M.by) && num(M.by) <= 3) goals.push('دریافت نقدینگی فوری (مهلت ' + Mo(num(M.by)) + ')');
    if (M.keep === 'keep') goals.push('حفظ مالکیت دارایی'); if (M.keep === 'keep') goals.push('حفظ کنترل مدیریتی');
    if (A.k === 'refi') goals.push('کاهش بدهی یا بازآرایی سررسید'); if (A.k === 'expand') goals.push('افزایش ظرفیت تولید');
    if (M.inc === 'yes') goals.push('ایجاد جریان نقدی پایدار'); if (objOn(M, 'costCut')) goals.push('کاهش هزینهٔ سرمایه'); if (objOn(M, 'investor')) goals.push('انتقال بخشی از ریسک به سرمایه‌گذار');
    return { cats: o, goals: goals };
  }

  /* ---------- run ---------- */
  function run(M0, learn) {
    LEARN = learn || [];
    var M = merge(defaults(), M0 || {}), A0 = archOf(M.arch); if (A0.seed) Object.keys(A0.seed).forEach(function (k) { if (M[k] === 'unk' || M[k] == null) M[k] = A0.seed[k]; });
    var E = seed(M), X = Hub.finEngine.run(E, null, null);
    var list = candidates(X, M), pr = priorities(list), P3 = paths(pr, list, M), main = P3[0] ? P3[0].it : null;
    var cmIt = pr.filter(function (it) { return idsOf(it).some(function (i) { return SUKUK[i]; }); })[0] || list.filter(function (it) { return it.s5 !== 'reject' && idsOf(it).some(function (i) { return SUKUK[i]; }); })[0] || null;
    var regM = regMatrix(cmIt, M), info = infoStages(M, pr);
    var best = {}; list.forEach(function (it) { if (it.s5 !== 'reject' && !best[it.tier]) best[it.tier] = it; });
    var conv = list.filter(function (it) { return it.kind === 's' && it.s5 !== 'reject' && !(it.s.sub === 'راهکارهای نوآورانه'); }).slice(0, 8);
    var creative = list.filter(function (it) { return (it.kind === 'c' || (it.s && it.s.sub === 'راهکارهای نوآورانه') || it.st === 'dev'); });
    var groups = {}; list.forEach(function (it) { var g = GROUP[it.s5]; (groups[g] = groups[g] || []).push(it); });
    var res = { M: M, E: E, X: X, list: list, pr: pr, paths: P3, main: main, roles: roles(main, M), cmIt: cmIt, cmRoles: cmIt && cmIt !== main ? roles(cmIt, M) : null, reg: regM, spv: regM && regM.spv ? { q: spvAudit(M), alt: spvAlternatives() } : null, spvAny: { q: spvAudit(M), alt: spvAlternatives() },
      info: info, road: roadmap(P3, M, regM), tiers: best, conv: conv, creative: creative, groups: groups, seg: segments(M), scen: scen(main, M), objectives: OBJ.map(function (o) { return { k: o[0], fa: o[1], on: objOn(M, o[0]) }; }), arch: archOf(M.arch) };
    res.cons = constraints(M, list); res.concl = conclude(res); res.cls = classify(M); res.scens = pr.map(function (it) { return { it: it, s: scen(it, M) }; });
    res.snap = {}; list.forEach(function (it) { res.snap[it.id] = it.s4; });
    return res;
  }
  function merge(a, b) { Object.keys(b).forEach(function (k) { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') merge(a[k], b[k]); else if (b[k] !== undefined) a[k] = b[k]; }); return a; }

  Hub.finDisc = { S4: S4, PST: PST, CAT: CAT, run: run, defaults: defaults, seed: seed, ARCH: ARCH, OBJ: OBJ, CH: CH, S5: S5, LEVEL: LEVEL, GROUP: GROUP, FCLASS: FCLASS, TIERFA: TIERFA, RS: RS, CRIT: CRIT, CRITRULE: CRITRULE, crit: crit, HB: HB, H: H, P: P, fa: fa };
  if (typeof module !== 'undefined' && module.exports) module.exports = Hub.finDisc;
})(typeof window !== 'undefined' ? window : globalThis);
