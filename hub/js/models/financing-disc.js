/* =====================================================================
 * FINANCING OPPORTUNITY DISCOVERY — UI tab, report and Excel sheets for
 * js/core/findisc.js. First tab of the financing tool: a raw problem in, a
 * structured first-meeting answer out, before any statements exist.
 * Report order follows the directive's nine-part output (problem → priorities
 * → conventional → creative / hybrid → comparison → execution structure →
 * requirements → information still needed → action plan), answer first.
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  if (!root.document) return;
  var U = Hub.util, h = U.h, G = Hub.grid, D = function () { return Hub.finDisc; };
  var TRI = [['unk', 'نامشخص'], ['yes', 'بله'], ['no', 'خیر']];
  var STC = { ok: 'fit-rec', warn: 'fit-cond', bad: 'fit-no', unk: 'fit-ok', na: 'fit-ok', inq: 'fit-cond', must: 'fit-ok', camc: 'fit-ok', no: 'fit-no' };
  var STFA = { ok: 'مناسب', warn: 'محدودیت', bad: 'مانع', unk: 'نامشخص', na: '—' };
  var S5C = { exec: 'fit-rec', fix: 'fit-cond', reg: 'fit-cond', risk: 'fit-no', reject: 'fit-no' };

  function state(S) { var d = D().defaults(); S.disc = D().seed ? Object.assign(d, S.disc || {}) : d; ['obj', 'cap', 'ev', 'seg', 'sc'].forEach(function (k) { S.disc[k] = Object.assign({}, d[k], S.disc[k] || {}); }); return S.disc; }
  function fa(v) { return D().fa(v); }
  function chip(cls, t) { return h('span', { class: 'sev ' + (cls || 'fit-ok'), 'data-notr': '1', text: t }); }

  /* ---------- report blocks: the eight-part standard output (comprehensive directive §12), answer first ---------- */
  function blocks(r) {
    var F = D(), M = r.M, B = [], H = F.H, P = F.P, gaps = [];
    var nm = function (it) { return it ? it.fa : '—'; }, amt = function (it) { return isFinite(it.amtH) ? H(it.amtH) : 'نامشخص'; }, tm = function (it) { var t = it.tmEff || it.tm; return fa(t[0]) + '–' + fa(t[1]) + ' ماه'; };
    var has = function (v) { return v !== null && v !== '' && v !== undefined && isFinite(+v); };
    B.push({ t: 'h1', x: 'گزارش تأمین مالی — ' + r.arch.fa });
    // ---------- answer first ----------
    var p0 = r.paths[0], p1 = r.paths[1], c0 = r.cons[0];
    if (!p0) B.push({ t: 'lead', x: 'با اطلاعات فعلی هیچ مسیری از غربال عبور نکرد. محدودیت‌ها (حفظ مالکیت، بدون بدهی بانکی، بدون افزایش سرمایه، مهلت) را بازبینی کنید یا ارزش و نوع دارایی را وارد کنید.' });
    else B.push({ t: 'lead', x: 'پیشنهاد: مسیر اصلی «' + nm(p0.it) + '» (' + F.S4[p0.it.s4] + '، برآورد ' + amt(p0.it) + '، ' + tm(p0.it) + ')' + (p1 ? '؛ اگر پیش‌شرطش محقق نشد «' + nm(p1.it) + '» فعال می‌شود' : '') + '. ' +
      (c0 ? 'مهم‌ترین محدودیت: «' + c0.t + '» — ' + c0.text.split('پیشنهاد: ')[1] : p0.it.s4 === 1 ? 'مسیر اصلی با اطلاعات فعلی قابل شروع است.' : 'پیش‌شرط اول: ' + (p0.pre[0] || 'شاهد بازار') + '.') + (r.info.decisive ? ' پرسش تعیین‌کننده: ' + r.info.decisive[0] : '') });
    B.push({ t: 'small', x: 'مبالغ به همت (هزار میلیارد تومان). برآوردها از ارزش اعلام‌شده و فرض‌های قابل تغییر موتور است؛ ظرفیت بازار، تخفیف فروش یکجا و شاهد معاملات ورودی شماست. هیچ احتمال موفقیت، مجوز یا تأیید مقرراتی ادعا نشده است.' });
    // ---------- 1 · diagnosis ----------
    B.push({ t: 'h2', x: 'بخش اول: تشخیص مسئله' });
    B.push({ t: 'p', x: 'مسئلهٔ مطرح‌شده: ' + r.arch.fa + (M.note ? ' — «' + M.note + '»' : '') + '.' });
    B.push({ t: 'ul', x: ['دسته‌های مسئلهٔ مالی: ' + (r.cls.cats.map(function (c) { return c.fa + ' (' + c.why + ')'; }).join('؛ ') || 'تشخیص داده نشد'), 'هدف اقتصادی: ' + (r.cls.goals.join('؛ ') || 'اعلام نشده'),
      'مبلغ و زمان: ' + (has(M.need) ? H(+M.need) : 'مبلغ نامشخص') + '، ' + (has(M.by) ? fa(M.by) + ' ماه' : 'مهلت نامشخص') + (has(M.val) ? '؛ ' + (r.arch.k === 'project' ? 'هزینهٔ پروژه ' : 'ارزش اعلام‌شدهٔ دارایی ') + H(+M.val) : ''),
      'وضعیت مالی اعلام‌شده: جریان نقد عملیاتی دو سال ' + ({ pos: 'مثبت', neg: 'منفی' }[M.cfo] || 'نامشخص') + '؛ نسبت بدهی ' + ({ ok: 'زیر ۹۰٪', high: 'بالای ۹۰٪' }[M.la] || 'نامشخص') + '؛ اظهارنظر حسابرس ' + ({ unqualified: 'مقبول', qualified: 'مشروط', adverse: 'مردود', none: 'عدم اظهارنظر' }[M.opinion] || 'نامشخص') + '؛ ضامن بانکی ' + ({ yes: 'در دسترس', no: 'در دسترس نیست' }[M.bankGuar] || 'نامشخص'),
      'منبع اطلاعات: ' + (M.src || 'اظهار شفاهی (ثبت نشده)') + (M.asof ? '؛ تاریخ / دورهٔ مالی: ' + M.asof : '') + (r.derived && r.derived.length ? '؛ از صورت‌های مالی واردشده در ابزار: ' + r.derived.join('، ') : '')] });
    B.push({ t: 'p', x: 'فرضیه‌های هدف اقتصادی (موارد علامت‌خورده رتبه‌بندی را شکل می‌دهند): ' + r.objectives.filter(function (o) { return o.on; }).map(function (o) { return o.fa; }).join('، ') });
    // ---------- 2 · main proposals ----------
    B.push({ t: 'h2', x: 'بخش دوم: پیشنهادهای اصلی' });
    if (r.pr.length) B.push({ t: 'table', head: ['رتبه', 'راهکار', 'وضعیت (چهارگانه)', 'منابع قابل جذب', 'هزینه (۱–۵)', 'زمان', 'مزیت', 'محدودیت', 'امتیاز (موتور ± تعدیل)'],
      rows: r.pr.map(function (it, i) { var s = it.kind === 's' ? it.s : null; return [fa(i + 1), it.fa, F.S4[it.s4], amt(it), fa(s ? s.cl : Math.max.apply(null, it.comps.map(function (x) { return x.s.cl; }))), tm(it), s ? (s.pro || []).slice(0, 2).join('؛ ') : (it.c.why || '').slice(0, 120), s ? (s.con || []).slice(0, 2).join('؛ ') : (it.c.cond || []).slice(0, 2).join('؛ '), fa(Math.round(it.disc)) + ' (' + fa(Math.round(it.base)) + ')']; }) });
    else B.push({ t: 'p', x: 'هیچ راهکاری امتیاز کافی (≥ ۳۵) و سازگاری با محدودیت‌ها نداشت؛ گزینهٔ غیرضروری اضافه نشد.' });
    if (r.pr.length) B.push({ t: 'small', x: 'دلیل تعدیل امتیاز: ' + r.pr.map(function (it) { return it.fa.split(' (')[0] + ': ' + (it.why.join('؛ ') || '—'); }).join(' | ') });
    // ---------- 3 · innovative ----------
    B.push({ t: 'h2', x: 'بخش سوم: راهکارهای نوآورانه' });
    var cr = r.creative.filter(function (it) { return it.s5 !== 'reject'; }).slice(0, 6);
    if (cr.length) B.push({ t: 'table', head: ['ساختار', 'منطق اقتصادی', 'اجزا', 'وضعیت (چهارگانه)', 'سطح بلوغ', 'برآورد نقد'], rows: cr.map(function (it) { return [it.fa, it.kind === 'c' ? (it.c.why || '') : it.s.sv, it.kind === 'c' ? it.comps.map(function (x) { return x.s.fa; }).join(' + ') : '—', F.S4[it.s4], F.LEVEL[it.s5], amt(it)]; }) });
    B.push({ t: 'h3', x: 'نمونه‌های طراحی برای املاک (§۵.۲) و وضعیت هرکدام در این پرونده' });
    var by = {}; r.list.forEach(function (it) { by[it.id] = it; }); var st = function (ids) { var x = ids.map(function (i) { return by[i]; }).filter(Boolean)[0]; return x ? F.S4[x.s4] + ' — ' + x.fa : 'در غربال باقی نماند'; };
    B.push({ t: 'table', head: ['ساختار', 'اجزا', 'وضعیت'], rows: [['شرکت مالک املاک', 'تأسیس، انتقال بخشی از املاک، صورت مالی مستقل، درآمد اجاره، بررسی انتشار؛ شرکت مادر در نقش‌های مجاز', st(['C01', 'A03'])],
      ['تفکیک مالکیت و بهره‌برداری', 'شرکت جدید مالک؛ شرکت اصلی مستأجر با اجارهٔ واقعی و مستند به نرخ بازار؛ تأمین مالی بر پایهٔ دارایی و اجاره', st(['A04', 'A05', 'C05'])], ['انتقال بخشی از املاک و جذب شریک', 'شرکت پروژه یا مستقل؛ شریک مالی یا توسعه‌دهنده؛ ترکیب با بازار سرمایه', st(['C03', 'E07', 'A07', 'C04'])],
      ['فروش مرحله‌ای و تأمین مالی مکمل', 'دسته‌بندی بر اساس نقدشوندگی؛ فروش بخشی؛ بقیه وثیقه یا پشتوانه', st(['A09', 'A06', 'C02'])]] });
    B.push({ t: 'h3', x: 'تفکیک سبد دارایی' });
    B.push({ t: 'table', head: ['گروه دارایی', 'سهم از کل', 'ارزش', 'مسیر پیشنهادی'], rows: r.seg.rows.map(function (g) { return [g.fa, isFinite(g.share) ? P(g.share) : 'وارد نشده', isFinite(g.val) ? H(g.val) : '—', g.route]; }) });
    if (!r.seg.entered) gaps.push('سهم املاک عملیاتی، درآمدزا و راکد وارد نشده؛ تفکیک سبد فقط به‌صورت الگو آمده است.');
    var Q10 = [['جدا کردن دارایی از شرکت اصلی؟', ['A03', 'C01', 'A04', 'A05']], ['شرکت مستقل برای مالکیت یا بهره‌برداری؟', ['A03', 'C01', 'E07']], ['آوردهٔ غیرنقدی دارایی به شرکت جدید؟', ['A03', 'E07', 'C04', 'A07']], ['تفکیک جریان نقد دارایی از بقیهٔ فعالیت‌ها؟', ['A08', 'D03', 'D04', 'A12', 'A01']],
      ['تعریف بانی، ناشر، فروشنده، بهره‌بردار و ضامن در اشخاص متفاوت؟', ['C01', 'A04', 'D03']], ['ترکیب دو یا چند ابزار؟', ['C03', 'C04', 'C05', 'C10', 'C02']], ['واگذاری منافع یا حق بهره‌برداری به‌جای فروش کامل؟', ['A08', 'D04', 'A10']], ['جذب سرمایه‌گذار در سطح دارایی یا پروژه، نه کل شرکت؟', ['E07', 'A07', 'A01', 'E08', 'C03']],
      ['ساختار مرحله‌ای برای کاهش ریسک و افزایش ظرفیت؟', ['C02', 'A09', 'C05']], ['اصلاح یک پیش‌نیاز تا راهکار ناممکن ممکن شود؟', []]];
    var live = {}; r.list.forEach(function (it) { if (it.s5 !== 'reject') live[it.id] = it.fa; });
    B.push({ t: 'h3', x: 'ده پرسش طراحی خلاقانه (§۵.۱)' });
    B.push({ t: 'ul', x: Q10.map(function (q, i) { if (i === 9) return q[0] + ' ← ' + (r.cons.length ? r.cons.map(function (c) { return c.t; }).join('؛ ') + ' (جدول محدودیت‌ها در بخش چهارم)' : 'محدودیت فعالی ثبت نشده'); var a = q[1].filter(function (x) { return live[x]; }).map(function (x) { return live[x]; }); return q[0] + ' ← ' + (a.length ? a.join('، ') : 'با محدودیت‌های فعلی گزینه‌ای نماند'); }) });
    // ---------- 4 · regulatory ----------
    B.push({ t: 'h2', x: 'بخش چهارم: بررسی مقرراتی و حل محدودیت‌ها' });
    if (r.cons.length) r.cons.forEach(function (c) { B.push({ t: 'h3', x: 'محدودیت: ' + c.t }); B.push({ t: 'table', head: ['محدودیت', 'منشأ الزام', 'اثر بر ساختار', 'راهکار رفع یا جایگزین', 'وضعیت', 'شرط / نیاز', 'زمان'], rows: c.paths.map(function (p, i) { return [i ? '' : c.t, i ? '' : c.origin, i ? '' : c.effect, p.t, F.PST[p.st], p.need, p.time]; }) }); B.push({ t: 'p', x: c.text }); });
    else B.push({ t: 'p', x: 'با اطلاعات واردشده محدودیت مقرراتی شناخته‌شده‌ای فعال نشد. این یعنی احراز نشده، نه رفع شده: جریان نقد، نسبت بدهی، اظهارنظر حسابرس و ضامن را وارد کنید.' });
    if (r.reg) { B.push({ t: 'h3', x: 'نقشهٔ انطباق مقرراتی — ' + r.cmIt.fa }); B.push({ t: 'table', head: ['الزام', 'مستند', 'شرکت مادر', 'شرکت مالک املاک (SPV)', 'نهاد واسط', 'توضیح'], rows: r.reg.rows.map(function (x) { return [x.req, x.cite, F.RS[x.p], F.RS[x.s], F.RS[x.n], x.note]; }) }); }
    [[r.roles, p0 && p0.it], [r.cmRoles, r.cmIt]].forEach(function (pair) { var R0 = pair[0]; if (!R0 || !R0.cm) return; B.push({ t: 'h3', x: 'نقش بانی، ناشر، فروشندهٔ دارایی و نهاد واسط — ' + pair[1].fa }); B.push({ t: 'table', head: ['پرسش', 'پاسخ'], rows: R0.rows }); B.push({ t: 'small', x: 'منبع: ' + R0.cite }); });
    if (r.concl.inq.length) { B.push({ t: 'h3', x: 'موارد نیازمند استعلام رسمی' }); B.push({ t: 'table', head: ['موضوع', 'مستند / مرجع', 'چرا لازم است'], rows: r.concl.inq.map(function (x) { return [x.q, x.ref, x.why]; }) }); }
    // ---------- 5 · economic and execution feasibility ----------
    B.push({ t: 'h2', x: 'بخش پنجم: امکان‌سنجی اقتصادی و اجرایی' });
    r.pr.slice(0, 3).forEach(function (it) { B.push({ t: 'h3', x: it.fa + ' — ' + F.FCLASS[it.fclass] }); B.push({ t: 'table', head: ['بُعد', 'وضعیت', 'شرح'], rows: it.D.map(function (d) { return [d.n, STFA[d.st], d.t]; }) }); if (it.exp) B.push({ t: 'small', x: 'بانک تجربه: ' + fa(it.exp.n) + ' پرونده، ' + fa(it.exp.oks) + ' موفق، ' + fa(it.exp.fails) + ' ناموفق' + (it.exp.notes.length ? '؛ درس‌ها: ' + it.exp.notes.join('؛ ') : '') }); });
    var sp = r.spv || r.spvAny; B.push({ t: 'h3', x: 'امکان تهیه و حسابرسی صورت‌های مالی شرکت جدید (چهار پرسش جدا)' }); B.push({ t: 'table', head: ['پرسش', 'وضعیت', 'شرح'], rows: sp.q.map(function (q) { return [q.q, F.RS[q.st] || q.st, q.t]; }) });
    var sc = r.scens.filter(function (x) { return x.s; });
    if (sc.length) { B.push({ t: 'h3', x: 'سه سناریو برای هر راهکار' }); B.push({ t: 'table', head: ['راهکار', 'مبنای سناریو', 'بدبینانه', 'مبنا', 'خوش‌بینانه'], rows: sc.map(function (x) { var rw = x.s.rows; return [x.it.fa, x.s.priceBased ? 'کسر از ارزش مبنا' : 'تغییر برآورد ±', H(rw[0].amt), H(rw[1].amt), H(rw[2].amt)]; }) });
      if (r.scen && r.scen.grid) { B.push({ t: 'h4', x: 'حساسیت مسیر اصلی: سهم فروخته‌شده × کسر از ارزش' }); B.push({ t: 'table', head: ['کسر'].concat(r.scen.shares.map(function (s) { return 'سهم ' + P(s); })), rows: r.scen.grid.map(function (g) { return [P(g.hc)].concat(g.v.map(H)); }) }); } }
    // ---------- 6 · comparison and choice ----------
    B.push({ t: 'h2', x: 'بخش ششم: مقایسه و انتخاب' });
    if (r.pr.length) B.push({ t: 'table', head: ['معیار (۱ ضعیف … ۵ قوی)'].concat(r.pr.map(function (it) { return it.fa.split(' (')[0].slice(0, 28); })).concat(['قاعده']), rows: F.CRIT.map(function (c, j) { return [c].concat(r.pr.map(function (it) { return fa(F.crit(it, M)[j]); })).concat([F.CRITRULE[j]]); }) });
    var tiers = ['direct', 'structured', 'hybrid'].filter(function (t) { return r.tiers[t]; });
    if (tiers.length) B.push({ t: 'table', head: ['سطح', 'بهترین گزینه', 'برآورد', 'زمان', 'حفظ مالکیت', 'وضعیت'], rows: tiers.map(function (t) { var it = r.tiers[t]; return [F.TIERFA[t], it.fa, amt(it), tm(it), P(it.ow), F.S4[it.s4]]; }) });
    r.paths.forEach(function (p) { B.push({ t: 'h3', x: p.role + ': ' + p.it.fa + ' — ' + F.S4[p.it.s4] }); B.push({ t: 'ul', x: ['دلیل انتخاب: ' + (p.it.why.join('؛ ') || 'امتیاز موتور') + ' · امتیاز ' + fa(Math.round(p.it.disc))].concat(p.pre.map(function (x) { return 'پیش‌شرط: ' + x; })).concat(p.sw.map(function (x) { return 'فعال شدن مسیر بعدی: ' + x; })) }); });
    var rs = r.list.filter(function (it) { return it.s4 === 3; }).slice(0, 5);
    if (rs.length) { B.push({ t: 'h3', x: 'در شکل فعلی ممکن نیستند، اما با تغییر ساختار به همان هدف می‌رسند' }); B.push({ t: 'ul', x: rs.map(function (it) { return it.fa + ' — ' + it.s5why; }) }); }
    // ---------- 7 · roadmap ----------
    B.push({ t: 'h2', x: 'بخش هفتم: نقشهٔ راه' });
    if (r.road.length) B.push({ t: 'table', head: ['اقدام', 'دسته', 'مسئول', 'از ماه', 'تا ماه', 'وابسته به', 'خروجی / مدرک', 'شرط عبور به مرحلهٔ بعد'], rows: r.road.map(function (s) { return [s.step, s.cat, s.owner, fa(s.from), fa(s.to), s.dep, s.out || '—', s.gate]; }) });
    B.push({ t: 'small', x: 'زمان‌ها از بازهٔ پروفایل هر راهکار و تجربهٔ ثبت‌شده می‌آیند؛ برآورد تقریبی‌اند، نه تعهد.' });
    // ---------- 8 · more information ----------
    B.push({ t: 'h2', x: 'بخش هشتم: اطلاعات تکمیلی' });
    if (r.info.decisive) B.push({ t: 'lead', x: 'پرسش تعیین‌کننده: ' + r.info.decisive[0] + ' — ' + r.info.decisive[1] });
    [['سطح اول — اطلاعات اولیه', r.info.s1], ['سطح دوم — اطلاعات تحلیلی', r.info.s2], ['سطح سوم — اطلاعات تخصصی', r.info.s3]].forEach(function (s) { B.push({ t: 'h3', x: s[0] }); B.push({ t: 'table', head: ['اطلاعات', 'وضعیت', 'کدام ابهام را رفع می‌کند'], rows: s[1] }); });
    // ---------- conclusion (§11.4) ----------
    B.push({ t: 'h2', x: 'جمع‌بندی' });
    var C = r.concl; B.push({ t: 'table', head: ['پرسش', 'پاسخ'], rows: [['از نظر مقرراتی امکان‌پذیر (با اطلاعات فعلی)', C.regOk.join('؛ ') || 'هیچ ابزار بازار سرمایه‌ای بدون رفع محدودیت'], ['از نظر اقتصادی توجیه‌پذیر (≥ نصف نیاز)', C.econ.join('؛ ') || 'نامشخص'], ['از نظر اجرایی قابل انجام اکنون', C.exe.join('؛ ') || 'هیچ‌کدام پیش از تکمیل اطلاعات مرحلهٔ دوم'],
      ['محدودیت‌ها', C.limits.join('؛ ') || '—'], ['راه‌های رفع پیداشده', C.fixes.join('؛ ') || '—'], ['مسیر پیشنهادی', C.rec.join(' | ') || '—'], ['نیازمند استعلام رسمی', fa(C.inq.length) + ' مورد (بخش چهارم)']] });
    // ---------- gaps ----------
    if (!has(M.val)) gaps.push('ارزش دارایی وارد نشده؛ هیچ مبلغی برآورد نمی‌شود.');
    Object.keys(F.CH).forEach(function (k) { if (r.pr.some(function (it) { return it.ch === k && it.amtH > 0; }) && !(+M.cap[k] > 0)) gaps.push('ظرفیت جذب «' + F.CH[k] + '» و شاهد معاملات مشابه وارد نشده.'); });
    if (M.title === 'unk') gaps.push('وضعیت سند و قابلیت انتقال دارایی نامشخص است.');
    gaps.push('سابقهٔ صندوق‌های املاک ایران، تخفیف‌های تحقق‌یافته در فروش‌های بزرگ و ظرفیت سرمایه‌گذاران در ابزار داده ندارد.');
    B.push({ t: 'h2', x: 'آنچه با اطلاعات فعلی قابل تکمیل نیست' }); B.push({ t: 'ul', x: gaps.filter(function (v, i, a) { return a.indexOf(v) === i; }) });
    // ---------- separate section: circumvention, influence and legal alternatives ----------
    if (Hub.finCirc) { var CI = Hub.finCirc.analyze(r);
      B.push({ t: 'h2', x: 'بخش مستقل: روش‌های غیرقانونی یا دورزنندهٔ مقررات و جایگزین‌های قانونی' });
      B.push({ t: 'warn', x: 'این بخش برای شناخت، تشخیص نشانه‌های هشدار، ارزیابی ریسک و یافتن جایگزین قانونی است؛ هیچ‌کدام از این روش‌ها پیشنهاد اجرایی نیست، در رتبه‌بندی وارد نمی‌شود و شیوهٔ اجرای آن‌ها شرح داده نمی‌شود.' });
      B.push({ t: 'table', head: ['روش (ماهیت)', 'رکن درگیر', 'محدودیتی که دور زده می‌شود', 'چرا به آن روی می‌آورند', 'نشانه‌های هشدار', 'جایگزین قانونی'], rows: CI.rel.map(function (c) { return [c.fa + ' — ' + c.nature, c.role, c.target, c.why, c.flags.join('؛ '), c.alt + (c.best ? ' ← در این پرونده: «' + c.best.fa + '»' : '')]; }) });
      CI.rel.forEach(function (c) { B.push({ t: 'h3', x: c.fa });
        if (c.legit) B.push({ t: 'p', x: 'مرز رابطهٔ حرفه‌ای و نفوذ: ' + c.legit });
        B.push({ t: 'p', x: 'ریسک: ' + c.risk });
        B.push({ t: 'table', head: ['معیار', 'روش دورزننده', 'جایگزین قانونی' + (c.best ? ': ' + c.best.fa : '')], rows: c.cmp }); });
      if (CI.other.length) B.push({ t: 'small', x: 'روش‌های دیگری که با محدودیت‌های این پرونده مرتبط نشدند: ' + CI.other.map(function (c) { return c.fa + ' (' + c.role + ')'; }).join('؛ ') + '.' });
      B.push({ t: 'small', x: 'پیامد کلی کشف: ' + Hub.finCirc.PEN + ' دربارهٔ رایج بودن این روش‌ها در ایران آماری در دست نیست.' }); }
    B.push({ t: 'small', x: 'غربالگری و طراحی اولیه است، نه نظر حقوقی یا مالیاتی. استنادهای [IJ]، [MU]، [CR]، [DV] و [PR] همان متون کدگذاری‌شده در ابزار ظرفیت اوراق‌اند؛ بقیه «نیازمند استعلام». هیچ راه رفعی بر انتقال صوری، معاملهٔ غیرواقعی یا پنهان کردن اشخاص وابسته تکیه ندارد. تصمیم نهایی با شماست.' });
    return B;
  }

  /* §10.2 — what the full form / loaded statements already know flows in when the discovery answer is "unknown" */
  function derive(ctx, M) {
    var v = {}, list = [], X0 = ctx && ctx.R && ctx.R.X; if (!X0) return { v: v, list: list };
    var G0 = X0.G, E0 = X0.E, src = X0.F && X0.F.src || {};
    // one source: the Strict Auditor's result on the imported file comes first, so the sign of operating cash flow and the debt ratio match the auditor's
    var AR = Hub.auditCore && Hub.auditCore.result();
    if (AR && M.cfo === 'unk' && isFinite(AR.key.cfo)) { var cs = AR.key.cfo + (isFinite(AR.key.cfoPrev) ? AR.key.cfoPrev : 0); v.cfo = cs > 0 ? 'pos' : 'neg'; list.push('جریان نقد عملیاتی ' + (isFinite(AR.key.cfoPrev) ? 'دو سال ' : 'سال آخر ') + (v.cfo === 'pos' ? 'مثبت' : 'منفی') + ' (حسابرس سخت‌گیر ' + AR.id + ')'); }
    if (AR && M.la === 'unk' && isFinite(AR.key.debtRatio)) { v.la = AR.key.debtRatio <= 0.9 ? 'ok' : 'high'; list.push('نسبت بدهی ' + fa(Math.round(AR.key.debtRatio * 100)) + '٪ (حسابرس سخت‌گیر ' + AR.id + ')'); }
    if (M.cfo === 'unk' && v.cfo == null && isFinite(G0.cfoSum) && src.cfo1 !== 'unknown') { v.cfo = G0.cfoSum > 0 ? 'pos' : 'neg'; list.push('جریان نقد عملیاتی دو سال ' + (v.cfo === 'pos' ? 'مثبت' : 'منفی') + ' (' + (src.cfo1 === 'statements' ? 'صورت مالی' : 'فرم') + ')'); }
    if (M.la === 'unk' && v.la == null && isFinite(G0.la) && src.ta !== 'unknown') { v.la = G0.la <= 0.9 ? 'ok' : 'high'; list.push('نسبت بدهی ' + fa(Math.round(G0.la * 100)) + '٪'); }
    if (M.opinion === 'unk' && E0.fin.opinion && E0.fin.opinion !== 'unk') { v.opinion = E0.fin.opinion; list.push('اظهارنظر حسابرس از فرم'); }
    if (M.form === 'unk' && /^(pjs|prjs|other)$/.test(E0.co.form)) { v.form = E0.co.form; list.push('شخصیت حقوقی از فرم'); }
    if (M.listed === 'unk' && /^(none|ifb|tse)$/.test(E0.co.listing)) { v.listed = E0.co.listing; list.push('وضعیت بورسی از فرم'); }
    return { v: v, list: list };
  }
  var TRACK = [['arch', 'مسئله'], ['val', 'ارزش دارایی'], ['need', 'نیاز'], ['by', 'مهلت'], ['keep', 'مالکیت'], ['noBank', 'بدهی بانکی'], ['eqOk', 'افزایش سرمایه'], ['inc', 'درآمد اجاره'], ['title', 'سند'], ['cfo', 'جریان نقد عملیاتی'], ['interim', 'میان‌دوره‌ای'], ['la', 'نسبت بدهی'], ['bankGuar', 'ضامن بانکی'], ['secColl', 'توثیق اوراق بهادار'], ['groupCo', 'شرکت واجد شرایط گروه'], ['opinion', 'اظهارنظر حسابرس'], ['listed', 'بورسی'], ['form', 'شخصیت حقوقی']];
  var CODEFA = { unk: 'نامشخص', yes: 'بله', no: 'خیر', pos: 'مثبت', neg: 'منفی', ok: 'زیر ۹۰٪', high: 'بالای ۹۰٪', keep: 'حفظ کامل', partial: 'واگذاری بخشی', any: 'فروش ممکن', clean: 'سالم', issue: 'معارض', unqualified: 'مقبول', qualified: 'مشروط', adverse: 'مردود', none: 'ندارد / غیربورسی', ifb: 'فرابورس', tse: 'بورس تهران', pjs: 'سهامی عام', prjs: 'سهامی خاص', other: 'سایر' };
  function cf(v) { return v == null || v === '' ? '—' : CODEFA[v] || (isFinite(+v) ? fa(v) : D().ARCH.filter(function (a) { return a.k === v; }).map(function (a) { return a.fa; })[0] || String(v)); }
  function diffCase(prev, M, r, F) {
    var inp = TRACK.filter(function (k) { return String(prev.M[k[0]]) !== String(M[k[0]]); }).map(function (k) { return k[1] + ': ' + cf(prev.M[k[0]]) + ' ← ' + cf(M[k[0]]); });
    var names = {}; r.list.forEach(function (it) { names[it.id] = it.fa; });
    var st = Object.keys(r.snap).filter(function (id) { return prev.snap[id] && prev.snap[id] !== r.snap[id]; }).map(function (id) { return (names[id] || id) + ': «' + F.S4[prev.snap[id]] + '» ← «' + F.S4[r.snap[id]] + '»'; });
    return { inp: inp, st: st, mainWas: prev.main, mainNow: r.main ? r.main.fa : '—' };
  }

  /* ---------- tab ---------- */
  function tab(ctx) {
    var S = ctx.S, M = state(S), F = D(), dv = derive(ctx, M); S._dv = dv; var r = F.run(Object.assign({}, M, dv.v), S.finLearn || []); r.derived = dv.list;
    var opt = function (k, label, options, help) { return { key: k, label: label, options: options, help: help, get: function () { return String(M[k]); }, set: function (v) { M[k] = v; } }; };
    var numF = function (k, label, unit, help, obj) { var o = obj || M; return { key: k, label: label, unit: unit, optional: true, fmt: unit === '٪' ? 'pct' : 'num', help: help, get: function () { return o[k] === null || o[k] === '' ? null : o[k]; }, set: function (v) { o[k] = v; } }; };
    var f1 = G.form({ id: 'fd-q', onChange: ctx.rerender, fields: [
      opt('arch', 'مسئلهٔ مطرح‌شده', F.ARCH.map(function (a) { return [a.k, a.fa]; })),
      { key: 'note', label: 'شرح آزاد (اختیاری)', text: true, get: function () { return M.note; }, set: function (v) { M.note = v; } },
      opt('at', 'نوع دارایی اصلی', [['realestate', 'املاک و مستغلات'], ['machinery', 'ماشین‌آلات و تجهیزات'], ['receivable', 'مطالبات'], ['financial', 'سهام و سرمایه‌گذاری'], ['inventory', 'موجودی کالا'], ['contract', 'قرارداد فروش بلندمدت']]),
      numF('val', r.arch.k === 'project' ? 'هزینهٔ پروژه' : 'ارزش تقریبی دارایی', 'همت'), numF('need', 'نقدینگی موردنیاز', 'همت', 'خالی = نامشخص'), numF('by', 'مهلت (تا چند ماه دیگر)', 'ماه'),
      opt('keep', 'مالکیت دارایی', [['unk', 'نامشخص'], ['keep', 'باید کامل حفظ شود'], ['partial', 'واگذاری بخشی ممکن است'], ['any', 'فروش هم ممکن است']]),
      opt('noBank', 'بدهی بانکی ممنوع است؟', TRI), opt('eqOk', 'افزایش سرمایه ممکن است؟', TRI)] });
    var f2 = G.form({ id: 'fd-a', onChange: ctx.rerender, fields: [
      opt('use', 'کاربری (ملک)', [['unk', 'نامشخص'], ['commercial', 'تجاری'], ['office', 'اداری'], ['industrial', 'صنعتی'], ['residential', 'مسکونی'], ['land', 'زمین'], ['mixed', 'ترکیبی']]),
      opt('inc', 'درآمد اجاره دارد؟', [['unk', 'نامشخص'], ['yes', 'بله'], ['partial', 'بخشی از آن'], ['no', 'خیر (راکد)']]), numF('incVal', 'درآمد سالانهٔ دارایی', 'همت'),
      opt('op', 'شرکت خودش از دارایی استفاده می‌کند؟', [['unk', 'نامشخص'], ['operational', 'بله (عملیاتی)'], ['mixed', 'بخشی'], ['nonop', 'خیر (مازاد)']]),
      opt('title', 'سند و مالکیت', [['unk', 'نامشخص'], ['clean', 'سند رسمی سالم و قابل انتقال'], ['issue', 'معارض / نیازمند اصلاح']]),
      opt('listed', 'شرکت در بازار سرمایه', [['unk', 'نامشخص'], ['none', 'غیربورسی'], ['ifb', 'فرابورس'], ['tse', 'بورس تهران']]),
      opt('form', 'شخصیت حقوقی', [['unk', 'نامشخص'], ['pjs', 'سهامی عام'], ['prjs', 'سهامی خاص'], ['other', 'سایر']]),
      opt('opinion', 'اظهارنظر حسابرس سال آخر', [['unk', 'نامشخص'], ['unqualified', 'مقبول'], ['qualified', 'مشروط'], ['adverse', 'مردود'], ['none', 'عدم اظهارنظر']]),
      opt('spv', 'ساختار شرکت مستقل مالک املاک (SPV)', [['auto', 'هر جا ساختار نیاز داشت'], ['yes', 'بررسی شود'], ['no', 'بررسی نشود']])] });
    var f4 = G.form({ id: 'fd-f', onChange: ctx.rerender, fields: [
      opt('cfo', 'جمع جریان نقد عملیاتی دو سال مالی اخیر', [['unk', 'نامشخص'], ['pos', 'مثبت'], ['neg', 'منفی']], dv.v.cfo ? 'از صورت‌های مالی واردشده: ' + (dv.v.cfo === 'pos' ? 'مثبت' : 'منفی') : null),
      opt('interim', 'صورت میان‌دوره‌ای حسابرسی‌شدهٔ سال جاری جمع را مثبت می‌کند؟', TRI), opt('la', 'نسبت بدهی‌ها به دارایی‌ها', [['unk', 'نامشخص'], ['ok', 'زیر ۹۰٪'], ['high', 'بالای ۹۰٪']]),
      opt('bankGuar', 'ضمانت بانک (با امکان تأیید بانک مرکزی) در دسترس است؟', TRI), opt('secColl', 'سبد اوراق بهادار پذیرفته‌شده برای توثیق دارید؟', TRI), opt('groupCo', 'شرکت موجود و واجد شرایط (دو سال حسابرسی‌شده) در گروه دارید؟', TRI),
      { key: 'src', label: 'منبع اطلاعات', text: true, get: function () { return M.src; }, set: function (v) { M.src = v; } }, { key: 'asof', label: 'تاریخ یا دورهٔ مالی اطلاعات', text: true, get: function () { return M.asof; }, set: function (v) { M.asof = v; } }] });
    // objectives
    var objBox = h('div', { class: 'row-ctl', style: 'flex-wrap:wrap;gap:.4rem 1rem' }, r.objectives.map(function (o) { var cb = h('input', { type: 'checkbox', 'aria-label': o.fa }); cb.checked = o.on; cb.addEventListener('change', function () { M.obj[o.k] = cb.checked; ctx.rerender(); }); return h('label', { class: 'small', 'data-notr': '1' }, [cb, ' ' + o.fa]); }));
    // market capacity, evidence, scenarios, segmentation
    var capRows = Object.keys(F.CH).filter(function (k) { return k !== 'other'; }).map(function (k) {
      var inp = h('input', { class: 'f-in', type: 'text', inputmode: 'decimal', placeholder: 'نامشخص', 'aria-label': 'ظرفیت ' + F.CH[k], value: M.cap[k] == null ? '' : String(M.cap[k]) });
      inp.addEventListener('change', function () { var v = String(inp.value).trim(); M.cap[k] = v === '' ? null : Number(U.fromInput ? U.fromInput(v, 'num') : v); ctx.rerender(); });
      var ev = h('input', { class: 'f-text', type: 'text', placeholder: 'شاهد: معاملهٔ مشابه، منبع، تاریخ', 'aria-label': 'شاهد ' + F.CH[k], value: M.ev[k] || '' });
      ev.addEventListener('change', function () { M.ev[k] = ev.value; ctx.rerender(); });
      return h('tr', null, [h('td', { 'data-notr': '1', text: F.CH[k] }), h('td', null, [inp]), h('td', null, [ev])]); });
    var capT = h('div', { class: 'grid-wrap' }, [h('table', { class: 'grid aud se' }, [h('thead', null, [h('tr', null, ['کانال', 'بزرگ‌ترین مبلغ قابل جذب در یک معامله (همت)', 'شاهد بازار'].map(function (x) { return h('th', { class: 'lbl', 'data-notr': '1', text: x }); }))]), h('tbody', null, capRows)])]);
    var f3 = G.form({ id: 'fd-s', onChange: ctx.rerender, fields: [numF('bulk', 'تخفیف اضافهٔ فروش یکجا', '٪', 'نسبت به فرض تخفیف موتور؛ خالی = اعمال نشود'), numF('dn', 'سناریوی بدبینانه: کسر اضافه', '٪', null, M.sc), numF('up', 'سناریوی خوش‌بینانه: کسر کمتر', '٪', null, M.sc),
      { type: 'head', label: 'تفکیک سبد املاک (سهم از کل)' }, numF('op', 'املاک عملیاتی', '٪', null, M.seg), numF('inc', 'املاک درآمدزا', '٪', null, M.seg), numF('idle', 'راکد، زمین یا مازاد', '٪', null, M.seg)] });
    var fold = function (t, kids, open) { var d = h('details', { class: 'fold' }, [h('summary', { 'data-notr': '1', text: t })].concat(kids)); if (open) d.open = true; return d; };
    var preset = h('button', { class: 'btn', type: 'button', 'data-notr': '1', text: 'بارگذاری آزمون الزامی دستورالعمل', title: '۳ همت املاک، نیاز ۱ همت، جریان نقد دوساله منفی، بدون شرکت مالک املاک', onclick: function () { S.disc = Object.assign(D().defaults(), { arch: 're', val: 3, need: 1, cfo: 'neg', note: 'آزمون الزامی: ۳ همت املاک، نیاز ۱ همت، جریان نقد عملیاتی دو سال شرایط ابزار را احراز نمی‌کند، شرکت مالک املاک تأسیس نشده' }); ctx.rerender(); } });
    var apply = h('button', { class: 'btn', type: 'button', 'data-notr': '1', text: 'انتقال این اطلاعات به فرم کامل موتور', onclick: function () {
      var E = Hub.finUI.ensure(S), Sd = r.E, fin = Object.assign({}, Sd.fin); ['cfo1', 'cfo2', 'ta', 'tl'].forEach(function (k) { delete fin[k]; }); Hub.finEngine.merge(E.co, Sd.co); Hub.finEngine.merge(E.fin, fin); Hub.finEngine.merge(E.cons, Sd.cons);
      if (Sd.assets.length && !E.assets.some(function (a) { return a.name === 'دارایی اعلام‌شده'; })) E.assets.push(Sd.assets[0]);
      U.toast('در فرم «تشخیص و ارزیابی شرکت» ثبت شد (واحد: میلیارد ریال).', 'good'); ctx.rerender(); } });
    var top = r.pr.slice(0, 3).map(function (it, i) { return h('div', { class: 'prio-card' }, [h('div', { 'data-notr': '1', style: 'font-weight:600', text: fa(i + 1) + '. ' + it.fa }), h('div', { class: 'row-ctl', style: 'gap:.3rem;flex-wrap:wrap' }, [chip(S5C[it.s5], F.S5[it.s5]), chip(it.fclass === 'high' ? 'fit-rec' : it.fclass === 'low' ? 'fit-no' : 'fit-cond', F.FCLASS[it.fclass]), chip('fit-ok', F.TIERFA[it.tier].split(' (')[0])]),
      h('div', { class: 'small', 'data-notr': '1', text: 'برآورد ' + (isFinite(it.amtH) ? F.H(it.amtH) : 'نامشخص') + ' · ' + fa((it.tmEff || it.tm)[0]) + '–' + fa((it.tmEff || it.tm)[1]) + ' ماه · حفظ مالکیت ' + F.P(it.ow) })]); });
    return ctx.group([
      ctx.panel('مسئلهٔ خام را بگویید؛ همین الان راهکار بگیرید', [h('p', { class: 'f-help', 'data-notr': '1', text: 'لازم نیست همهٔ اطلاعات را داشته باشید. با مسئله و ارزش تقریبی، راهکارها طراحی و غربال می‌شوند؛ هر چیز نامشخص به پرسش مرحلهٔ بعد تبدیل می‌شود، نه توقف تحلیل.' }), f1.el,
        fold('ویژگی‌های دارایی و شرکت (هرچه می‌دانید)', [f2.el]), fold('وضعیت مالی، ضامن و شرکت‌های گروه — برای حل محدودیت‌ها', [f4.el], M.cfo !== 'unk' || !!dv.list.length), fold('اهداف اقتصادی — فرضیه‌ها را تیک بزنید', [objBox]),
        fold('ظرفیت بازار، شاهد معاملات، سناریوها و تفکیک سبد (ورودی شما)', [h('p', { class: 'f-help', 'data-notr': '1', text: 'ابزار ظرفیت جذب بازار را حدس نمی‌زند. اگر معاملهٔ مشابه یا تجربهٔ انتشار می‌شناسید، بزرگ‌ترین مبلغ قابل جذب در یک نوبت را با منبعش وارد کنید؛ اجرای مرحله‌ای و زمان از آن محاسبه می‌شود.' }), capT, f3.el]),
        h('div', { class: 'row-ctl' }, [preset, apply])]),
      ctx.panel('سه اولویت اول', top.length ? [h('div', { class: 'pulse-grid' }, top)] : [h('p', { class: 'small', 'data-notr': '1', text: 'گزینه‌ای از غربال عبور نکرد.' })]),
      ctx.panel('گزارش کامل (ساختار هشت‌بخشی)', [Hub.report.buttons(function () { return blocks(r); }, 'financing-report'), Hub.report.dom(blocks(r))]),
      filePanel(ctx), casePanel(ctx, S, M, r, F), learnPanel(ctx, S, r, F)]);
  }

  /* what was extracted from the company's Excel file and where it is used: main statements feed the diagnosis and every
     engine (through the company series); supporting schedules are listed for review (not yet used in calculations) */
  function filePanel(ctx) {
    var CD = Hub.companyData, SI = Hub.stmtImport, rec = CD && CD.get(), N = CD && CD.notes ? CD.notes() : null, kids = [];
    if (!rec) return ctx.panel('دادهٔ استخراج‌شده از فایل شرکت', [h('p', { class: 'small', 'data-notr': '1', text: 'هنوز فایلی وارد نشده است. صورت‌های مالی را از نوار «Company data» بالای همین ابزار وارد کنید (Excel یا PDF)؛ پس از ورود، گزارش کنترل استخراج و جداول تکمیلی اینجا نشان داده می‌شود.' })]);
    var used = rec.blocks.map(function (b) { return ({ IS: 'سود و زیان', BS: 'وضعیت مالی', CF: 'جریان نقد' })[b.type] + ' (' + b.rows.length + ' سطر، ' + b.years.join('، ') + ')'; }).join(' · ');
    kids.push(h('p', { class: 'small', 'data-notr': '1', text: 'فایل: ' + rec.file + ' · ' + (rec.unit || '') + ' ' + (rec.currency || '') + '. صورت‌های به‌کاررفته در محاسبات (تشخیص، ظرفیت بدهی، جریان نقد، شرایط احراز اوراق و موتور راهکار): ' + used + '.' }));
    if (rec.saveErr) kids.push(h('p', { class: 'warn-t', 'data-notr': '1', text: rec.saveErr }));
    kids.push(SI && SI.reportDom ? SI.reportDom(N && N.report) : h('p', { text: '—' }));
    // the same company in the financing forms and in the auditor: shared figures must agree, or the difference is named
    var AR = Hub.auditCore && Hub.auditCore.result(), X0 = ctx.R && ctx.R.X, E0 = X0 && X0.E, G0 = X0 && X0.G;
    if (AR) { var AC = Hub.auditCore, nn = function (v) { return v === '' || v == null ? NaN : Number(v); }, cl = [AC.compare('جریان نقد عملیاتی سال آخر (علامت)', E0 && E0.fin ? nn(E0.fin.cfo1) : NaN, AR.key.cfo, 'sign'), AC.compare('سود خالص سال آخر (علامت)', E0 && E0.fin ? nn(E0.fin.ni) : NaN, AR.key.ni, 'sign'), AC.compare('نسبت بدهی (جمع بدهی ÷ جمع دارایی)', G0 ? G0.la : NaN, AR.key.debtRatio, 'ratio')];
      kids.push(h('h4', { 'data-notr': '1', text: 'یکپارچگی با حسابرس سخت‌گیر (' + AR.id + ')' }), h('div', { class: 'grid-wrap' }, [h('table', { class: 'grid' }, [h('thead', null, [h('tr', null, ['رقم مشترک', 'فرم تأمین مالی', 'حسابرس سخت‌گیر (فایل)', 'نتیجه'].map(function (x) { return h('th', { text: x }); }))]),
        h('tbody', null, cl.map(function (q) { var f = function (v) { return isFinite(v) ? (/نسبت/.test(q.label) ? fa(Math.round(v * 1000) / 10) + '٪' : fa(Math.round(v))) : 'خالی'; }; return h('tr', null, [q.label, f(q.theirs), f(q.ours), q.ok === null ? 'قابل مقایسه نیست (یک طرف خالی)' : q.ok ? '✓ سازگار' : '✗ ' + q.why].map(function (x) { return h('td', { 'data-notr': '1', text: x }); })); }))])]),
        h('p', { class: 'small muted', 'data-notr': '1', text: 'کشف فرصت و موتور راهکار علامت جریان نقد و نسبت بدهی را مستقیماً از نتیجهٔ حسابرس سخت‌گیر می‌گیرند. واحد فرم تأمین مالی (میلیارد ریال) با واحد فایل ممکن است فرق کند؛ برای همین مبلغ‌ها با علامت و نسبت‌ها با مقدار مقایسه می‌شوند.' })); }
    if (N && N.notes && N.notes.length) {
      var byCat = {}; N.notes.forEach(function (b) { (byCat[b.cat] = byCat[b.cat] || []).push(b); });
      kids.push(h('h4', { 'data-notr': '1', text: 'جداول تکمیلی استخراج‌شده (یادداشت‌ها)' }), h('p', { class: 'small muted', 'data-notr': '1', text: 'این جداول برای بررسی شما نمایش داده و در Excel خروجی گرفته می‌شوند؛ در محاسبات خودکار موتور تأمین مالی هنوز استفاده نمی‌شوند (ارقام تسهیلات و بدهی در محاسبه از صورت وضعیت مالی می‌آیند).' + (N.cut > 0 ? ' برای حجم حافظه، ' + fa(N.cut) + ' سطر از جداول بزرگ ذخیره نشد (در گزارش برگه‌ها شمارش شده‌اند).' : '') }));
      Object.keys(byCat).forEach(function (c) { kids.push(h('details', null, [h('summary', { 'data-notr': '1', text: (SI.CATFA[c] || c) + ' — ' + byCat[c].length + ' جدول' }),
        h('div', null, byCat[c].slice(0, 12).map(function (b) { var t = h('table', { class: 'grid' }); t.appendChild(h('thead', null, [h('tr', null, ['شرح'].concat(b.years).map(function (x) { return h('th', { 'data-notr': '1', text: x }); }))]));
          var tb = h('tbody'); b.rows.slice(0, 40).forEach(function (r) { tb.appendChild(h('tr', null, [h('td', { 'data-notr': '1', text: r.label })].concat(r.all.map(function (v) { return h('td', { text: Hub.util.fmtNum ? Hub.util.fmtNum(v) : String(v) }); })))); });
          t.appendChild(tb); return h('div', null, [h('p', { class: 'small', 'data-notr': '1', text: b.sheet + (b.head ? ' — ' + b.head.slice(0, 80) : '') + ' (' + b.n + ' سطر' + (b.n > 40 ? '؛ ۴۰ سطر اول' : '') + ')' }), h('div', { class: 'grid-wrap' }, [t])]); }))])); });
    }
    return ctx.panel('دادهٔ استخراج‌شده از فایل شرکت', kids);
  }

  function casePanel(ctx, S, M, r, F) {
    S.discCases = S.discCases || []; var cs = S.discCases, last = cs[cs.length - 1], kids = [];
    var nm = h('input', { class: 'f-text', type: 'text', placeholder: 'نام پرونده (مثلاً نام شرکت)', 'aria-label': 'نام پرونده', value: last ? last.name : '' });
    kids.push(h('div', { class: 'row-ctl' }, [nm, h('button', { class: 'btn primary', type: 'button', 'data-notr': '1', text: 'ثبت این تحلیل در پرونده', onclick: function () { if (!nm.value.trim()) { U.toast('نام پرونده را بنویسید.', 'warn'); return; }
      cs.push({ name: nm.value.trim(), date: new Date().toISOString().slice(0, 10), M: JSON.parse(JSON.stringify(M)), snap: r.snap, main: r.main ? r.main.fa : '—' }); U.toast('ثبت شد.', 'good'); ctx.rerender(); } })]));
    if (last) { var d = diffCase(last, M, r, F); kids.push(h('h4', { 'data-notr': '1', text: 'تغییر نسبت به آخرین ثبت («' + last.name + '»، ' + fa(last.date) + ')' }));
      kids.push(h('ul', { class: 'studio-l' }, (d.inp.length || d.st.length ? ['ورودی‌ها: ' + (d.inp.join('؛ ') || 'بدون تغییر'), 'وضعیت راهکارها: ' + (d.st.join('؛ ') || 'بدون تغییر'), 'مسیر اصلی: ' + d.mainWas + (d.mainWas !== d.mainNow ? ' ← ' + d.mainNow : ' (بدون تغییر)')] : ['تحلیل فعلی با آخرین ثبت یکی است.']).map(function (x) { return h('li', { 'data-notr': '1', text: x }); }))); }
    if (cs.length) kids.push(h('div', { class: 'grid-wrap' }, [h('table', { class: 'grid aud se' }, [h('thead', null, [h('tr', null, ['پرونده', 'تاریخ', 'مسیر اصلی', ''].map(function (x) { return h('th', { class: 'lbl', 'data-notr': '1', text: x }); }))]),
      h('tbody', null, cs.slice().reverse().map(function (c) { return h('tr', null, [h('td', { 'data-notr': '1', text: c.name }), h('td', { 'data-notr': '1', text: fa(c.date) }), h('td', { 'data-notr': '1', text: c.main }), h('td', null, [h('button', { class: 'btn', type: 'button', 'data-notr': '1', text: 'بارگذاری', onclick: function () { S.disc = JSON.parse(JSON.stringify(c.M)); ctx.rerender(); } })])]); }))])]));
    return ctx.panel('پروندهٔ مرکزی و ثبت تغییرات', [h('p', { class: 'f-help', 'data-notr': '1', text: 'هر بار اطلاعات تازه رسید (مثلاً صورت مالی جدید)، تحلیل را ثبت کنید. ابزار نشان می‌دهد کدام ورودی عوض شد و کدام راهکار وضعیتش تغییر کرد؛ راهکارهای کنارگذاشته با داده‌های جدید دوباره ارزیابی می‌شوند.' })].concat(kids));
  }
  function learnPanel(ctx, S, r, F) {
    S.finLearn = S.finLearn || []; var L0 = S.finLearn, opts = r.list.slice(0, 25).map(function (it) { return [it.id, it.fa]; });
    var X = { id: opts.length ? opts[0][0] : '', result: 'success', months: null, amt: null, cost: '', obstacle: '', lesson: '' };
    var f = G.form({ id: 'fd-l', fields: [{ key: 'id', label: 'راهکار اجراشده', options: opts, get: function () { return X.id; }, set: function (v) { X.id = v; } }, { key: 'result', label: 'نتیجه', options: [['success', 'موفق'], ['partial', 'نیمه‌موفق'], ['fail', 'ناموفق']], get: function () { return X.result; }, set: function (v) { X.result = v; } },
      { key: 'months', label: 'زمان واقعی', unit: 'ماه', optional: true, get: function () { return X.months; }, set: function (v) { X.months = v; } }, { key: 'amt', label: 'منابع جذب‌شده', unit: 'همت', optional: true, get: function () { return X.amt; }, set: function (v) { X.amt = v; } },
      { key: 'cost', label: 'هزینهٔ واقعی (نرخ یا کارمزد)', text: true, get: function () { return X.cost; }, set: function (v) { X.cost = v; } }, { key: 'obstacle', label: 'مانع پیش‌بینی‌نشده', text: true, get: function () { return X.obstacle; }, set: function (v) { X.obstacle = v; } }, { key: 'lesson', label: 'علت موفقیت یا شکست / درس', text: true, get: function () { return X.lesson; }, set: function (v) { X.lesson = v; } }] });
    var add = h('button', { class: 'btn primary', type: 'button', 'data-notr': '1', text: 'ثبت نتیجهٔ واقعی', onclick: function () { var it = r.list.filter(function (x) { return x.id === X.id; })[0]; L0.push(Object.assign({ date: new Date().toISOString().slice(0, 10), fa: it ? it.fa : X.id, planned: it ? it.tm.slice() : null, plannedAmt: it && isFinite(it.amtH) ? it.amtH : null }, X)); U.toast('در بانک تجربه ثبت شد؛ در ارزیابی‌های بعدی اثر دارد.', 'good'); ctx.rerender(); } });
    var rows = L0.slice().reverse().map(function (x) { var dvm = x.planned && x.months != null ? x.months - x.planned[1] : null, dva = x.plannedAmt && x.amt != null ? x.amt / x.plannedAmt - 1 : null;
      return h('tr', null, [x.fa, { success: 'موفق', partial: 'نیمه‌موفق', fail: 'ناموفق' }[x.result], x.planned ? fa(x.planned[0]) + '–' + fa(x.planned[1]) : '—', x.months != null ? fa(x.months) : '—', dvm != null ? (dvm > 0 ? '+' : '') + fa(dvm) + ' ماه' : '—', x.amt != null ? F.H(x.amt) : '—', dva != null ? F.P(dva) : '—', x.obstacle || '—', x.lesson || '—'].map(function (t) { return h('td', { 'data-notr': '1', style: 'white-space:normal', text: t }); })); });
    return ctx.panel('بانک تجربهٔ تأمین مالی', [h('p', { class: 'f-help', 'data-notr': '1', text: 'نتیجهٔ واقعی هر پرونده را ثبت کنید. راهکاری که بیشتر ناموفق بوده امتیاز منفی می‌گیرد و زمان واقعی ثبت‌شده، اگر بیشتر از پروفایل باشد، جای آن را در برآورد زمان می‌گیرد.' }), f.el, h('div', { class: 'row-ctl' }, [add]),
      L0.length ? h('div', { class: 'grid-wrap' }, [h('table', { class: 'grid aud se' }, [h('thead', null, [h('tr', null, ['راهکار', 'نتیجه', 'زمان برآوردی', 'زمان واقعی', 'انحراف زمان', 'منابع جذب‌شده', 'انحراف مبلغ', 'مانع پیش‌بینی‌نشده', 'درس'].map(function (x) { return h('th', { class: 'lbl', 'data-notr': '1', text: x }); }))]), h('tbody', null, rows)])]) : h('p', { class: 'small muted', 'data-notr': '1', text: 'هنوز نتیجه‌ای ثبت نشده است.' })]);
  }

  /* ---------- Excel ---------- */
  function excel(b, S) {
    var F = D(), M = state(S), r = F.run(Object.assign({}, M, S._dv ? S._dv.v : {}), S.finLearn || []), opt = { rightToLeft: true }, L = Hub.xl.L, c = function (col, row) { return L(col) + row; }, a = function (col, row) { return '$' + L(col) + '$' + row; };
    var put = function (sh, row, vals, kind) { vals.forEach(function (v, i) { sh.put(1 + i, row, v, kind || (typeof v === 'number' ? 'calc' : 'wrap')); }); };
    var s1 = b.sheet('کشف فرصت', [2, 44, 16, 14, 14, 12, 12, 12, 26, 60], opt); s1.title('کشف فرصت‌های تأمین مالی — ' + r.arch.fa, 'مبالغ به همت · امتیاز = پایه + تعدیل (فرمول)');
    put(s1, 4, ['ورودی', 'مقدار'], 'hdr'); var Mx = r.M, inRows = TRACK.map(function (k) { return [k[1], Mx[k[0]]]; }).concat([['منبع اطلاعات', M.src || ''], ['تاریخ / دوره', M.asof || '']]);
    inRows.forEach(function (x, i) { s1.put(1, 5 + i, x[0], 'wrap'); s1.put(2, 5 + i, x[1] == null || x[1] === '' ? 'نامشخص' : x[1], 'in'); });
    var y = 7 + inRows.length; put(s1, y, ['راهکار', 'سطح', 'وضعیت', 'امکان‌پذیری', 'امتیاز موتور', 'تعدیل', 'امتیاز (فرمول)', 'برآورد (همت)', 'دلیل تعدیل'], 'hdr');
    r.list.filter(function (it) { return it.s5 !== 'reject'; }).slice(0, 30).forEach(function (it, i) { var row = y + 1 + i; put(s1, row, [it.fa, F.TIERFA[it.tier].split(' (')[0], F.S4[it.s4], F.FCLASS[it.fclass]]); s1.put(5, row, it.base, 'in', 'dec'); s1.put(6, row, it.adj, 'in', 'dec');
      s1.put(7, row, { f: '=MAX(0,MIN(100,' + c(5, row) + '+' + c(6, row) + '))' }, 'calc', 'dec'); s1.put(8, row, isFinite(it.amtH) ? it.amtH : null, 'calc', 'dec'); s1.put(9, row, it.why.join('؛ '), 'wrap'); });
    var s2 = b.sheet('امکان‌پذیری بازار', [2, 36, 14, 14, 14, 14, 14, 50], opt); s2.title('امکان‌پذیری بازار و اجرای مرحله‌ای', 'ظرفیت کانال، کسرها و سهم‌ها ورودی شما (سلول‌های آبی)');
    put(s2, 4, ['راهکار', 'برآورد (همت)', 'ظرفیت یک‌نوبتی (همت)', 'تعداد مراحل (فرمول)', 'حداقل ماه', 'حداکثر ماه پروفایل', 'حداکثر ماه با مراحل (فرمول)', 'ابعاد'], 'hdr');
    r.pr.forEach(function (it, i) { var row = 5 + i; s2.put(1, row, it.fa, 'wrap'); s2.put(2, row, isFinite(it.amtH) ? it.amtH : null, 'in', 'dec'); s2.put(3, row, +M.cap[it.ch] > 0 ? +M.cap[it.ch] : null, 'in', 'dec');
      s2.put(4, row, { f: '=IF(AND(ISNUMBER(' + c(2, row) + '),ISNUMBER(' + c(3, row) + '),' + c(3, row) + '>0),ROUNDUP(' + c(2, row) + '/' + c(3, row) + ',0),1)' }, 'calc', 'int'); s2.put(5, row, it.tm[0], 'in', 'int'); s2.put(6, row, it.tm[1], 'in', 'int');
      s2.put(7, row, { f: '=' + c(6, row) + '+(' + c(4, row) + '-1)*MAX(1,' + c(5, row) + ')' }, 'calc', 'int'); s2.put(8, row, it.D.map(function (d) { return d.n + ': ' + STFA[d.st]; }).join(' · '), 'wrap'); });
    if (r.scen) { var y2 = 7 + r.pr.length, pb = r.scen.priceBased;
      s2.put(1, y2, pb ? 'ارزش مبنای مسیر اصلی (همت)' : 'برآورد پایهٔ مسیر اصلی (همت)', 'sub'); s2.put(2, y2, pb ? r.scen.val : r.main.amtH, 'in', 'dec');
      s2.put(1, y2 + 1, pb ? 'کسر پایه' : '—', 'sub'); s2.put(2, y2 + 1, pb ? r.main.haircut : 0, 'in', 'pct2');
      s2.put(1, y2 + 2, pb ? 'کسر اضافهٔ بدبینانه' : 'کاهش بدبینانه', 'sub'); s2.put(2, y2 + 2, +M.sc.dn || 0, 'in', 'pct2'); s2.put(1, y2 + 3, pb ? 'کسر کمتر خوش‌بینانه' : 'افزایش خوش‌بینانه', 'sub'); s2.put(2, y2 + 3, +M.sc.up || 0, 'in', 'pct2');
      var V0 = a(2, y2), H0 = a(2, y2 + 1), DN = a(2, y2 + 2), UP = a(2, y2 + 3);
      put(s2, y2 + 5, ['سناریو: ' + r.main.fa, 'برآورد (فرمول)'], 'hdr');
      (pb ? [['بدبینانه', '=' + V0 + '*(1-(' + H0 + '+' + DN + '))'], ['پایه', '=' + V0 + '*(1-' + H0 + ')'], ['خوش‌بینانه', '=' + V0 + '*(1-MAX(0,' + H0 + '-' + UP + '))']]
        : [['بدبینانه', '=' + V0 + '*(1-' + DN + ')'], ['پایه', '=' + V0], ['خوش‌بینانه', '=' + V0 + '*(1+' + UP + ')']]).forEach(function (x, i) { s2.put(1, y2 + 6 + i, x[0], 'wrap'); s2.put(2, y2 + 6 + i, { f: x[1] }, 'calc', 'dec'); });
      if (r.scen.grid) { var g0 = y2 + 10; s2.put(1, g0, 'حساسیت: کسر (سطر) × سهم فروخته‌شده (ستون)', 'hdr'); r.scen.shares.forEach(function (sh, j) { s2.put(2 + j, g0, sh, 'in', 'pct2'); });
        r.scen.grid.forEach(function (g, i) { var row = g0 + 1 + i; s2.put(1, row, g.hc, 'in', 'pct2'); r.scen.shares.forEach(function (sh, j) { s2.put(2 + j, row, { f: '=' + V0 + '*' + L(2 + j) + '$' + g0 + '*(1-$' + L(1) + row + ')' }, 'calc', 'dec'); }); }); } }
    var s3 = b.sheet('انطباق مقرراتی', [2, 46, 34, 16, 18, 16, 50], opt); s3.title('نقش اشخاص، نقشهٔ انطباق مقرراتی و پرسش‌های SPV', r.cmIt ? 'ساختار: ' + r.cmIt.fa : 'مسیر بازار سرمایه در اولویت‌ها نیست');
    var y3 = 4; [r.roles, r.cmRoles].forEach(function (R0) { if (!R0 || !R0.cm) return; put(s3, y3, ['پرسش', 'پاسخ'], 'hdr'); R0.rows.forEach(function (x, i) { put(s3, y3 + 1 + i, x); }); y3 += R0.rows.length + 3; });
    if (r.reg) { put(s3, y3, ['الزام', 'مستند', 'شرکت مادر', 'SPV', 'نهاد واسط', 'توضیح'], 'hdr'); r.reg.rows.forEach(function (x, i) { put(s3, y3 + 1 + i, [x.req, x.cite, F.RS[x.p], F.RS[x.s], F.RS[x.n], x.note]); }); y3 += r.reg.rows.length + 3; }
    var sp = r.spv || r.spvAny; put(s3, y3, ['پرسش SPV', 'وضعیت', 'شرح'], 'hdr'); sp.q.forEach(function (q, i) { put(s3, y3 + 1 + i, [q.q, F.RS[q.st] || q.st, q.t]); });
    var s4 = b.sheet('اطلاعات و نقشه راه', [2, 50, 16, 50, 14, 14, 30], opt); s4.title('اطلاعات مرحله‌ای، مسیرها و برنامهٔ اقدام', r.info.decisive ? 'پرسش تعیین‌کننده: ' + r.info.decisive[0] : '');
    var y4 = 4; [['مرحلهٔ اول', r.info.s1], ['مرحلهٔ دوم', r.info.s2], ['مرحلهٔ سوم', r.info.s3]].forEach(function (st) { put(s4, y4, [st[0], 'وضعیت', 'کدام ابهام'], 'hdr'); st[1].forEach(function (x, i) { put(s4, y4 + 1 + i, x); }); y4 += st[1].length + 2; });
    r.paths.forEach(function (p) { put(s4, y4, [p.role + ': ' + p.it.fa, F.S5[p.it.s5]], 'hdr'); p.pre.concat(p.sw).forEach(function (x, i) { put(s4, y4 + 1 + i, [x]); }); y4 += p.pre.length + p.sw.length + 2; });
    put(s4, y4, ['اقدام', 'دسته', 'مسئول', 'از ماه', 'تا ماه', 'وابسته به', 'خروجی', 'شرط عبور'], 'hdr'); r.road.forEach(function (s, i) { put(s4, y4 + 1 + i, [s.step, s.cat, s.owner, s.from, s.to, s.dep, s.out || '', s.gate]); });
    var s5 = b.sheet('محدودیت‌ها و راه رفع', [2, 30, 30, 30, 46, 14, 40, 18], opt); s5.title('حل محدودیت‌ها و استعلام‌ها', 'هر محدودیت با منشأ، اثر و همهٔ مسیرهای بررسی‌شده');
    var y5 = 4; r.cons.forEach(function (c) { put(s5, y5, ['محدودیت', 'منشأ الزام', 'اثر بر ساختار', 'راهکار رفع یا جایگزین', 'وضعیت', 'شرط / نیاز', 'زمان'], 'hdr'); c.paths.forEach(function (p, i) { put(s5, y5 + 1 + i, [i ? '' : c.t, i ? '' : c.origin, i ? '' : c.effect, p.t, F.PST[p.st], p.need, p.time]); }); s5.put(1, y5 + c.paths.length + 1, c.text, 'wrap'); y5 += c.paths.length + 4; });
    put(s5, y5, ['استعلام', 'مرجع', 'چرا'], 'hdr'); r.concl.inq.forEach(function (x, i) { put(s5, y5 + 1 + i, [x.q, x.ref, x.why]); });
    if (Hub.finCirc) { var CI = Hub.finCirc.analyze(r), s7 = b.sheet('دورزدن و جایگزین قانونی', [2, 40, 22, 30, 36, 44, 36, 50, 44], opt); s7.title('روش‌های غیرقانونی یا دورزنندهٔ مقررات و جایگزین‌های قانونی', 'برای شناخت و جایگزینی — نه پیشنهاد اجرایی');
      put(s7, 4, ['روش و ماهیت', 'رکن درگیر', 'محدودیت هدف', 'انگیزه', 'نشانه‌های هشدار', 'مرز رابطهٔ مشروع و نفوذ', 'ریسک', 'جایگزین قانونی'], 'hdr');
      CI.rel.concat(CI.other).forEach(function (c, i) { put(s7, 5 + i, [c.fa + ' — ' + c.nature, c.role, c.target, c.why, c.flags.join('؛ '), c.legit || '—', c.risk, c.alt + (c.best ? ' ← ' + c.best.fa : '')]); }); }
    var L0 = S.finLearn || []; if (L0.length) { var s6 = b.sheet('بانک تجربه', [2, 36, 12, 12, 12, 14, 14, 14, 40, 40], opt); s6.title('بانک تجربهٔ تأمین مالی', 'انحراف‌ها با فرمول');
      put(s6, 4, ['راهکار', 'نتیجه', 'حداکثر ماه برآوردی', 'ماه واقعی', 'انحراف زمان (فرمول)', 'برآورد مبلغ', 'مبلغ واقعی', 'انحراف مبلغ (فرمول)', 'مانع پیش‌بینی‌نشده', 'درس'], 'hdr');
      L0.forEach(function (x, i) { var row = 5 + i; put(s6, row, [x.fa, { success: 'موفق', partial: 'نیمه‌موفق', fail: 'ناموفق' }[x.result] || x.result]); s6.put(3, row, x.planned ? x.planned[1] : null, 'in', 'int'); s6.put(4, row, x.months, 'in', 'int'); s6.put(5, row, { f: '=IF(AND(ISNUMBER(' + c(3, row) + '),ISNUMBER(' + c(4, row) + ')),' + c(4, row) + '-' + c(3, row) + ',"")' }, 'calc', 'int');
        s6.put(6, row, x.plannedAmt, 'in', 'dec'); s6.put(7, row, x.amt, 'in', 'dec'); s6.put(8, row, { f: '=IF(AND(ISNUMBER(' + c(6, row) + '),ISNUMBER(' + c(7, row) + '),' + c(6, row) + '<>0),' + c(7, row) + '/' + c(6, row) + '-1,"")' }, 'calc', 'pct2'); s6.put(9, row, x.obstacle || '', 'wrap'); s6.put(10, row, x.lesson || '', 'wrap'); }); }
  }

  Hub.finDiscUI = { tab: tab, blocks: blocks, excel: excel, state: state };
})(typeof window !== 'undefined' ? window : globalThis);
