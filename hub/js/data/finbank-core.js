/* =====================================================================
 * SOLUTION BANK — corporate financing and asset monetization in Iran.
 * One standard profile per solution (the 30 fields of the master brief),
 * in three engines: D = debt, E = equity & hybrid, A = asset monetization,
 * plus multi-step structures (COMBO). Adding a solution = adding a profile;
 * the decision engine (js/core/finengine.js) reads only these fields.
 *
 * Profile keys
 *   id, e (engine D/E/A), sub (sub-group), fa / en (names), st (status in Iran:
 *   exec = executable, cond = conditional, dev = developmental)
 *   d description · sv problem it solves · fit companies it suits · nd asset or
 *   source it needs · mn minimum conditions · str legal and financial structure ·
 *   src where the money comes from · rep how it is repaid / how investors earn ·
 *   par parties · lic permits · law legal basis [text, flag] · tm months [min,max] ·
 *   cost direct and indirect costs (text) · cl cost level 1 (cheap) … 5 (dear) ·
 *   pro / con · rk risks (financial, operational, legal, regulatory) · acc accounting
 *   and tax · own ownership and control effect · ow ownership kept 0…1 · lim limits ·
 *   stp steps · cmp complementary solutions · cmb structures it belongs to ·
 *   not when not to recommend · rev last review of this profile
 *   machine fields: pur purposes it fits · ast asset types it uses · k kind
 *   (debt / equity / sale / monet / enabler) · sz sizing rule · g gates
 *
 * Legal-basis flags — never read a flag as more than it says:
 *   v  text and version checked against the official source (cmr.seo.ir) in Nov 2026
 *   n  instrument named in law / regulator rules; article, date and latest
 *      amendment NOT verified here — check qavanin.ir, rdis.ir, seo.ir, cbi.ir,
 *      ifb.ir, tse.ir, ime.co.ir before acting
 *   p  market practice, not a published rule
 * No rate, ceiling, permit or party is invented: where a number matters and is
 * not verified it is an input of the user or marked "نیازمند استعلام".
 * ===================================================================== */
(function (root) {
  'use strict';
  var Hub = root.Hub = root.Hub || {};
  var B = Hub.finBank = Hub.finBank || { SOL: [], COMBO: [] };
  B.REVIEWED = '۱۴۰۵/۰۸';
  // shared texts used by several profiles
  B.T = {
    sukukPar: ['بانی (شرکت)', 'نهاد واسط (شرکت واسط مالی وابسته به شرکت مدیریت دارایی مرکزی)', 'امین', 'ضامن (بانک یا نهاد مالی) یا رتبه‌بندی اعتباری', 'متعهد پذیره‌نویسی', 'بازارگردان', 'مشاور عرضه', 'حسابرس', 'فرابورس / بورس (عرضه)'],
    sukukLic: ['مجوز انتشار از سازمان بورس و اوراق بهادار', 'پذیرش اوراق در فرابورس یا بورس تهران'],
    sukukStp: ['انتخاب مشاور عرضه و تهیهٔ گزارش توجیهی', 'تعیین دارایی یا موضوع اوراق و ارزیابی کارشناس رسمی (در صورت نیاز)', 'اخذ ضمانت‌نامه یا رتبهٔ اعتباری', 'قرارداد با نهاد واسط، امین، متعهد پذیره‌نویس و بازارگردان', 'ثبت و اخذ مجوز سازمان بورس', 'پذیرش در بازار و پذیره‌نویسی', 'پرداخت دوره‌ای اجاره‌بها / سود و تسویهٔ سررسید'],
    sukukCost: 'سود اوراق + کارمزد ارکان (بازارگردان، ضامن، متعهد پذیره‌نویس، مشاور، سایر)؛ هزینهٔ واقعی با روش ytm در زبانهٔ «هزینهٔ اوراق» محاسبه می‌شود.',
    sukukAcc: 'در دفاتر بانی بدهی مالی شناسایی می‌شود؛ سود و کارمزدها هزینهٔ مالی است. آثار مالیاتی انتقال دارایی به نهاد واسط طبق قانون توسعهٔ ابزارها و نهادهای مالی جدید — جزئیات نیازمند استعلام.',
    bankPar: ['شرکت', 'بانک یا مؤسسهٔ اعتباری', 'ضامن یا وثیقه‌گذار'],
    lawSEC: ['قانون بازار اوراق بهادار جمهوری اسلامی ایران (۱۳۸۴)', 'n'],
    lawDev: ['قانون توسعهٔ ابزارها و نهادهای مالی جدید در راستای تسهیل اجرای سیاست‌های کلی اصل ۴۴ قانون اساسی (۱۳۸۸)', 'v'],
    lawCC: ['لایحهٔ اصلاحی قسمتی از قانون تجارت (۱۳۴۷)', 'n'],
    lawBank: ['قانون عملیات بانکی بدون ربا (۱۳۶۲) و مقررات بانک مرکزی', 'n'],
    lawCivil: ['قانون مدنی (قراردادهای مشارکت، اجاره، بیع)', 'n']
  };
  B.PURPOSE = [['wc', 'سرمایه در گردش', 'Working capital'], ['fixed', 'سرمایه‌گذاری ثابت', 'Fixed investment'], ['expand', 'طرح توسعه', 'Expansion plan'], ['refi', 'بازپرداخت بدهی', 'Repay debt'],
    ['restructure', 'اصلاح ساختار مالی', 'Fix the capital structure'], ['project', 'تأمین مالی پروژه', 'Project finance'], ['monet', 'مولدسازی دارایی', 'Monetize assets'], ['release', 'آزادسازی منابع محبوس', 'Release trapped funds'],
    ['liquidity', 'افزایش نقدشوندگی دارایی‌ها', 'Make assets liquid'], ['costcut', 'کاهش هزینهٔ سرمایه', 'Lower the cost of capital'], ['subs', 'تأمین مالی شرکت‌های تابعه', 'Fund subsidiaries'], ['other', 'سایر موارد', 'Other'],
    ['unknown', 'هدف و مبلغ تأمین مالی مشخص نیست؛ پیشنهاد راهکار ارائه شود', 'Goal and amount not set: suggest solutions']];
  B.STATUS = { exec: ['قابل اجرا', 'Executable'], cond: ['مشروط', 'Conditional'], dev: ['توسعه‌ای', 'Developmental'] };
  B.ENGINE = { D: ['تأمین مالی بدهی', 'Debt financing'], E: ['تأمین مالی سرمایه‌ای و ترکیبی', 'Equity & hybrid financing'], A: ['مولدسازی دارایی‌ها', 'Asset monetization'] };
  B.add = function (list) { list.forEach(function (s) { s.rev = s.rev || B.REVIEWED; B.SOL.push(s); }); };
  B.addCombo = function (list) { list.forEach(function (c) { c.rev = c.rev || B.REVIEWED; B.COMBO.push(c); }); };
  B.get = function (id) { for (var i = 0; i < B.SOL.length; i++) if (B.SOL[i].id === id) return B.SOL[i]; return null; };
  if (typeof module !== 'undefined' && module.exports) module.exports = B;
})(typeof window !== 'undefined' ? window : globalThis);
