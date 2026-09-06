# -*- coding: utf-8 -*-
"""پارامترهای پیش‌فرض موتور زمانی."""
from dataclasses import dataclass, field
from typing import List


@dataclass
class SpectralConfig:
    """پارامترهای کشف چرخه با تحلیل طیفی."""
    min_period: int = 8           # کوتاه‌ترین دوره قابل بررسی (کندل)
    max_period_ratio: float = 0.34  # بلندترین دوره = این نسبت × طول سری
    max_period_cap: int = 400
    detrend: str = "linear"       # linear | none | diff
    top_n: int = 5                # چند چرخه برتر گزارش شود
    min_segments: int = 3         # حداقل تعداد تکرار چرخه برای آزمون معناداری
    alpha: float = 0.05           # آستانه معناداری فاز
    peak_min_separation: float = 0.15  # حداقل فاصله نسبی بین قله‌های طیف
    # ۳٫۰ نه ۲٫۰ — با کالیبراسیون روی نویز سفید انتخاب شد نه با حدس:
    # روی ۶۰ سری نویز خالص، ۲٫۰ در ۳٪ موارد «چرخه معنادار» می‌دید و
    # ۳٫۰ در صفر درصد. و روی سری‌های دارای چرخه واقعی — حتی با نویز
    # زیاد و دامنه کم — هر دو ۱۰۰٪ کشف کردند. پس این سخت‌گیری رایگان
    # است: مثبت کاذب را حذف می‌کند بدون آنکه چیزی از دست برود.
    min_amp_ratio: float = 3.0    # حداقل نسبت دامنه قله به دامنه میانه طیف


@dataclass
class HurstConfig:
    """مدل چرخه‌های اسمی هرست (Profit Magic, فصل ۲)."""
    # دوره‌ها به روز تقویمی؛ تبدیل به کندل با ضریب روزهای معاملاتی انجام می‌شود
    nominal_days: List[float] = field(default_factory=lambda: [
        18 * 365.25, 9 * 365.25, 54 * 30.44, 18 * 30.44,
        40 * 7, 20 * 7, 10 * 7, 5 * 7,
    ])
    nominal_names: List[str] = field(default_factory=lambda: [
        "۱۸ ساله", "۹ ساله", "۵۴ ماهه", "۱۸ ماهه",
        "۴۰ هفته‌ای", "۲۰ هفته‌ای", "۱۰ هفته‌ای", "۵ هفته‌ای",
    ])
    trading_days_per_year: int = 245   # بورس تهران: شنبه تا چهارشنبه منهای تعطیلات
    band_ratio: float = 1.41421356     # پهنای باند فیلتر میان‌گذر (± یک اکتاو نصف)
    trough_separation: float = 0.60    # حداقل فاصله دو کف به‌نسبت دوره چرخه


@dataclass
class GannConfig:
    """شمارش‌های زمانی گن."""
    day_counts: List[int] = field(default_factory=lambda: [
        30, 45, 60, 90, 120, 144, 180, 225, 270, 315, 360,
    ])
    year_counts: List[int] = field(default_factory=lambda: [1, 2, 3, 5, 7, 10, 20, 30, 60, 90])
    tolerance_days: int = 3
    horizon_days: int = 180            # پنجره نگاه به آینده


@dataclass
class FibTimeConfig:
    ratios: List[float] = field(default_factory=lambda: [
        0.382, 0.500, 0.618, 0.786, 1.000, 1.272, 1.618, 2.000, 2.618, 4.236,
    ])
    tolerance_days: int = 3
    horizon_days: int = 180


@dataclass
class ScoreWeights:
    """وزن اجزای نمره زمانی. جمع لازم نیست ۱ باشد؛ بر مجموع تقسیم می‌شود."""
    cycle_phase: float = 0.40     # فاز چرخه غالب
    fld: float = 0.25             # وضعیت نسبت به FLD
    gann_window: float = 0.15     # نزدیکی به پنجره زمانی گن
    fib_window: float = 0.10      # نزدیکی به پروجکشن فیبوناچی
    elliott: float = 0.10         # برچسب موج (ورودی دستی)


@dataclass
class TimeframeConfig:
    spectral: SpectralConfig = field(default_factory=SpectralConfig)
    hurst: HurstConfig = field(default_factory=HurstConfig)
    gann: GannConfig = field(default_factory=GannConfig)
    fib: FibTimeConfig = field(default_factory=FibTimeConfig)
    weights: ScoreWeights = field(default_factory=ScoreWeights)
    # وزن لایه کلان در نمره زمانی. پیش‌فرض صفر — دلیل در docs/TIME_LAYER.md
    macro_weight: float = 0.0
