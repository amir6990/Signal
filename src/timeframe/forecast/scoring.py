# -*- coding: utf-8 -*-
"""
سنجش پیش‌بینی احتمالاتی.

منابع:
  • Brier (1950) — Verification of Forecasts Expressed in Terms of Probability
  • Murphy (1973) — A New Vector Partition of the Probability Score

امتیاز بریر = میانگین مربع خطای احتمال. کمتر بهتر. صفر یعنی کامل، ۰٫۲۵ یعنی
همیشه ۵۰٪ گفتن، ۱ یعنی همیشه با اطمینان کامل اشتباه گفتن.

تجزیه مرفی: BS = کالیبراسیون − تفکیک‌پذیری + عدم‌قطعیت

⚠️ این اتحاد فقط وقتی **دقیق** است که پیش‌بینی‌ها مقادیر گسسته بگیرند (مثلاً
فقط ۰٪، ۱۰٪، …، ۱۰۰٪). با احتمال‌های پیوسته که در سطل‌بندی جمع می‌شوند، یک
باقی‌مانده درون‌سطلی می‌ماند. این ماژول هر دو را گزارش می‌کند: امتیاز بریر خام
و امتیاز بریر نمایندهٔ سطل‌بندی‌شده که اتحاد روی آن برقرار است.
  • کالیبراسیون: وقتی می‌گویید ۷۰٪، آیا واقعاً ۷۰٪ مواقع رخ می‌دهد؟ (کمتر بهتر)
  • تفکیک‌پذیری: آیا پیش‌بینی‌هایتان از نرخ پایه فاصله می‌گیرند؟ (بیشتر بهتر)
  • عدم‌قطعیت: سختی ذاتی خودِ سؤال‌ها — دست شما نیست.

یک پیش‌بین می‌تواند کاملاً کالیبره ولی کاملاً بی‌فایده باشد: کسی که برای هر
سؤالی نرخ پایه را می‌گوید، کالیبراسیون عالی و تفکیک‌پذیری صفر دارد.
"""
from dataclasses import dataclass, field
from typing import List, Sequence, Tuple


@dataclass
class BrierResult:
    n: int = 0
    brier: float = 0.0
    brier_binned: float = 0.0      # بریر با جایگزینی هر پیش‌بینی با میانگین سطلش
    within_bin: float = 0.0        # باقی‌مانده ناشی از پیوستگی پیش‌بینی‌ها
    base_rate: float = 0.0
    brier_of_base_rate: float = 0.0
    skill_score: float = 0.0        # بهبود نسبت به گفتن همیشگی نرخ پایه
    reliability: float = 0.0
    resolution: float = 0.0
    uncertainty: float = 0.0
    bins: List[Tuple[float, float, int]] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    def table(self) -> str:
        L = ["   تعداد سؤال حل‌شده: %d" % self.n,
             "   امتیاز بریر: %.4f  (صفر کامل، ۰٫۲۵ معادل گفتن همیشگی ۵۰٪)" % self.brier,
             "   نرخ پایه واقعی: %.1f%% | بریر اگر همیشه نرخ پایه می‌گفتید: %.4f"
             % (self.base_rate * 100, self.brier_of_base_rate),
             "   امتیاز مهارت: %+.3f  %s" % (
                 self.skill_score,
                 "(بهتر از نرخ پایه)" if self.skill_score > 0 else "(بدتر از نرخ پایه)"),
             "   تجزیه مرفی: کالیبراسیون %.4f − تفکیک‌پذیری %.4f + عدم‌قطعیت %.4f"
             % (self.reliability, self.resolution, self.uncertainty),
             "      (اتحاد روی بریر سطل‌بندی‌شده %.4f برقرار است؛ اختلاف با بریر خام "
             "%.4f از پیوستگی پیش‌بینی‌ها می‌آید، نه از خطای محاسبه.)"
             % (self.brier_binned, abs(self.brier - self.brier_binned))]
        if self.bins:
            L.append("   جدول کالیبراسیون:")
            L.append("      %-14s %-14s %s" % ("گفتید", "رخ داد", "تعداد"))
            for f, o, n in self.bins:
                L.append("      %-14s %-14s %d" % ("%.0f%%" % (f * 100),
                                                   "%.0f%%" % (o * 100), n))
        for w in self.warnings:
            L.append("   ⚠ " + w)
        return "\n".join(L)


def brier(forecasts: Sequence[float], outcomes: Sequence[int],
          n_bins: int = 5) -> BrierResult:
    """forecasts: احتمال‌های ۰ تا ۱. outcomes: ۰ یا ۱."""
    r = BrierResult()
    pairs = [(f, o) for f, o in zip(forecasts, outcomes)
             if f is not None and o is not None]
    n = len(pairs)
    r.n = n
    if n == 0:
        r.warnings.append("هیچ سؤال حل‌شده‌ای وجود ندارد.")
        return r
    r.brier = sum((f - o) ** 2 for f, o in pairs) / n
    r.base_rate = sum(o for _f, o in pairs) / n
    r.brier_of_base_rate = sum((r.base_rate - o) ** 2 for _f, o in pairs) / n
    r.skill_score = (1.0 - r.brier / r.brier_of_base_rate) if r.brier_of_base_rate > 0 else 0.0
    r.uncertainty = r.base_rate * (1.0 - r.base_rate)

    buckets = {}
    for f, o in pairs:
        k = min(n_bins - 1, int(f * n_bins))
        buckets.setdefault(k, []).append((f, o))
    rel = res = 0.0
    binned_sq = 0.0
    within = 0.0
    for k in sorted(buckets):
        grp = buckets[k]
        nk = len(grp)
        fk = sum(f for f, _o in grp) / nk
        ok = sum(o for _f, o in grp) / nk
        rel += nk * (fk - ok) ** 2
        res += nk * (ok - r.base_rate) ** 2
        binned_sq += sum((fk - o) ** 2 for _f, o in grp)
        within += sum((f - fk) ** 2 for f, _o in grp)
        r.bins.append((fk, ok, nk))
    r.reliability = rel / n
    r.resolution = res / n
    r.brier_binned = binned_sq / n
    r.within_bin = within / n
    if n < 20:
        r.warnings.append("زیر ۲۰ سؤال حل‌شده، کالیبراسیون قابل قضاوت نیست. "
                          "تتلاک برای ارزیابی معنادار ده‌ها سؤال لازم می‌داند.")
    if r.resolution < 0.01 and n >= 20:
        r.warnings.append("تفکیک‌پذیری تقریباً صفر است: پیش‌بینی‌هایتان از نرخ "
                          "پایه فاصله نمی‌گیرند و اطلاعاتی اضافه نمی‌کنند.")
    return r
