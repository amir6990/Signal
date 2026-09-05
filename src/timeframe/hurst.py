# -*- coding: utf-8 -*-
"""
مدل چرخه‌های اسمی هرست، فیلتر میان‌گذر، FLD و VTL.

منابع:
  • J.M. Hurst — The Profit Magic of Stock Transaction Timing (مدل اسمی، اصول
    هشت‌گانه: همگانی، هارمونیک، همزمانی، تناسب، تغییرپذیری، اسمی‌بودن، جمع‌پذیری)
  • Christopher Grafton — Mastering Hurst Cycle Analysis (پیاده‌سازی عملی FLD،
    VTL و تحلیل فازبندی)

اصل تناسب هرست: دامنه چرخه با دوره آن متناسب است — چرخه بلندتر، نوسان بزرگ‌تر.
اصل هارمونیک: دوره چرخه‌های مجاور معمولاً نسبت ۲:۱ دارند (یک استثنای ۳:۱ بین
۵۴ ماهه و ۱۸ ماهه).
"""
import datetime
import math
from dataclasses import dataclass, field
from typing import List, Optional, Sequence

from .config import HurstConfig
from .filters import bandpass, find_extrema
from .series import TimeSeries


@dataclass
class CycleState:
    """وضعیت جاری یک چرخه مشخص روی یک سری."""
    name: str
    period_bars: float
    trough_indices: List[int] = field(default_factory=list)
    trough_dates: List[datetime.date] = field(default_factory=list)
    bars_since_trough: Optional[int] = None
    phase: Optional[float] = None                 # ۰=کف، ۰٫۵=سقف، ۱=کف بعدی
    observed_period: Optional[float] = None       # میانگین فاصله کف‌های واقعی
    next_trough_date: Optional[datetime.date] = None
    next_peak_date: Optional[datetime.date] = None
    quality: str = "نامشخص"
    edge_blind_bars: int = 0          # کندل‌های انتهایی که فیلتر برایشان خروجی ندارد
    edge_warning: str = ""            # هشدار وقتی کف جاری احتمالاً داخل ناحیه کور است

    @property
    def reliable(self) -> bool:
        """آیا فاز قابل اتکاست؟

        ناحیه کور به‌تنهایی فاز را بی‌اعتبار نمی‌کند: وقتی چرخه منظم باشد،
        برون‌یابی پیمانه‌ای همان فازی را می‌دهد که کف کشف‌نشده می‌داد. آنچه فاز
        را بی‌اعتبار می‌کند، بی‌نظمی خودِ چرخه یا کمی تعداد کف‌هاست.
        """
        return (self.quality.startswith(("منظم", "نسبتاً"))
                and len(self.trough_indices) >= 3)

    @property
    def phase_label(self) -> str:
        if self.phase is None:
            return "نامشخص"
        p = self.phase % 1.0
        if p <= 0.15:
            return "تازه از کف عبور کرده"
        if p <= 0.35:
            return "صعود چرخه"
        if p <= 0.60:
            return "نزدیک سقف چرخه"
        if p <= 0.85:
            return "نزول چرخه"
        return "نزدیک کف بعدی"


def nominal_cycles(cfg: Optional[HurstConfig] = None, bars_per_calendar_day: float = 0.68):
    """مدل اسمی هرست، تبدیل‌شده از روز تقویمی به کندل معاملاتی.

    نسبت پیش‌فرض ۰٫۶۸ ≈ ۵ روز کاری از ۷ روز، منهای تعطیلات رسمی ایران.
    """
    cfg = cfg or HurstConfig()
    out = []
    for name, days in zip(cfg.nominal_names, cfg.nominal_days):
        out.append((name, days, days * bars_per_calendar_day))
    return out


def analyze_cycle(ts: TimeSeries, period_bars: float, name: str = "",
                  cfg: Optional[HurstConfig] = None) -> CycleState:
    """فازبندی یک چرخه: کف‌های گذشته، فاز جاری و پروجکشن کف/سقف بعدی."""
    cfg = cfg or HurstConfig()
    st = CycleState(name=name or "%.0f کندل" % period_bars, period_bars=period_bars)
    n = len(ts)
    if n < period_bars * 2.5:
        st.quality = "داده ناکافی (کمتر از ۲٫۵ برابر دوره)"
        return st

    bp = bandpass(ts.closes, period_bars, cfg.band_ratio)
    sep = max(2, int(round(period_bars * cfg.trough_separation)))
    tr = find_extrema(bp, sep, "trough")
    if len(tr) < 2:
        st.quality = "کف قابل شناسایی نیست"
        return st

    st.trough_indices = tr
    st.trough_dates = [ts.bars[i].date for i in tr]
    gaps = [tr[i + 1] - tr[i] for i in range(len(tr) - 1)]
    st.observed_period = sum(gaps) / len(gaps)

    last = tr[-1]
    st.bars_since_trough = (n - 1) - last
    per = st.observed_period or period_bars

    # ---- مسئله لبه ----
    # میانگین متحرک مرکزی برای نیمِ آخرِ پنجره خود تعریف نشده است، پس فیلتر
    # میان‌گذر روی آخرین کندل‌ها خروجی ندارد و کفی که همین اواخر ساخته شده
    # هنوز قابل کشف نیست. این محدودیت ذاتی روش است، نه نقص پیاده‌سازی؛
    # پنهان‌کردنش باعث می‌شود کاربر فاز را قطعی‌تر از آنچه هست بخواند.
    blind = 0
    for v in reversed(bp):        # فقط دنباله انتهایی، نه Noneهای ابتدای سری
        if v is not None:
            break
        blind += 1
    st.edge_blind_bars = blind

    # فاز بر مبنای موقعیت داخل چرخه جاری (نه شمارش خام از کف قدیمی)
    into_cycle = st.bars_since_trough % per
    st.phase = into_cycle / per
    if st.bars_since_trough > per:
        st.edge_warning = (
            "کف جاری کشف نشده: %d کندل از آخرین کف تأییدشده گذشته که بیش از یک "
            "دوره کامل (%.0f) است. احتمالاً یک کف داخل ناحیه کور %d کندلی رخ داده. "
            "فاز زیر یک تخمین است، نه مشاهده."
            % (st.bars_since_trough, per, st.edge_blind_bars))

    # پروجکشن با دوره مشاهده‌شده، نه دوره اسمی
    bpc = ts.bars_per_calendar_day() or 0.68
    to_days = lambda b: datetime.timedelta(days=int(round(b / bpc)))
    st.next_trough_date = ts.last_date + to_days(per - into_cycle)
    half = per / 2.0
    ahead_peak = (half - into_cycle) if into_cycle < half else (per + half - into_cycle)
    st.next_peak_date = ts.last_date + to_days(ahead_peak)

    # کیفیت: پراکندگی فاصله کف‌ها نسبت به میانگین
    if len(gaps) >= 3:
        m = st.observed_period
        sd = math.sqrt(sum((g - m) ** 2 for g in gaps) / (len(gaps) - 1))
        cv = sd / m if m else 1.0
        st.quality = ("منظم (CV=%.2f)" % cv if cv < 0.20 else
                      "نسبتاً منظم (CV=%.2f)" % cv if cv < 0.35 else
                      "نامنظم (CV=%.2f) — به پروجکشن اتکا نکنید" % cv)
    else:
        st.quality = "فقط %d کف — برای قضاوت کم است" % len(tr)
    return st


# ------------------------------------------------------------------ FLD
def fld(closes: Sequence[float], period_bars: float) -> List[Optional[float]]:
    """Future Line of Demarcation: قیمت جابه‌جاشده به جلو به‌اندازه نصف دوره.

    عبور قیمت از بالای FLD یعنی کف چرخه پشت سر گذاشته شده است.
    """
    shift = max(1, int(round(period_bars / 2.0)))
    return [None if i < shift else closes[i - shift] for i in range(len(closes))]


@dataclass
class FLDSignal:
    period_bars: float
    above: Optional[bool] = None
    crossed_recently: Optional[str] = None      # "up" | "down" | None
    bars_since_cross: Optional[int] = None
    cross_price: Optional[float] = None
    target: Optional[float] = None
    note: str = ""


def fld_signal(ts: TimeSeries, period_bars: float, lookback: int = 40) -> FLDSignal:
    """وضعیت قیمت نسبت به FLD و هدف قیمتی به روایت گرافتون.

    هدف = قیمت لحظه عبور + (قیمت لحظه عبور − کف چرخه قبلی). این یک پروجکشن
    هندسی است، نه پیش‌بینی احتمالاتی؛ در بازار رِنج مکرراً از کار می‌افتد.
    """
    sig = FLDSignal(period_bars=period_bars)
    closes = ts.closes
    f = fld(closes, period_bars)
    n = len(closes)
    if n < 3 or f[-1] is None:
        sig.note = "داده ناکافی برای FLD"
        return sig
    sig.above = closes[-1] > f[-1]

    for k in range(1, min(lookback, n - 1)):
        i = n - k
        if f[i] is None or f[i - 1] is None:
            continue
        prev_above = closes[i - 1] > f[i - 1]
        now_above = closes[i] > f[i]
        if now_above != prev_above:
            sig.crossed_recently = "up" if now_above else "down"
            sig.bars_since_cross = n - 1 - i
            sig.cross_price = closes[i]
            lo = min(ts.lows[max(0, i - int(period_bars)):i + 1] or [closes[i]])
            hi = max(ts.highs[max(0, i - int(period_bars)):i + 1] or [closes[i]])
            sig.target = (2 * closes[i] - lo) if now_above else (2 * closes[i] - hi)
            break
    return sig


# ------------------------------------------------------------------ VTL
@dataclass
class VTLState:
    valid: bool = False
    value_now: Optional[float] = None
    price_above: Optional[bool] = None
    note: str = ""


def vtl(ts: TimeSeries, larger_cycle: CycleState) -> VTLState:
    """Valid Trend Line: خطی از دو کف آخرِ چرخه بزرگ‌تر، امتداد‌یافته تا امروز.

    شکست این خط یعنی چرخه بزرگ‌تر برگشته — سیگنالی قوی‌تر از شکست FLD چرخه کوچک.
    """
    st = VTLState()
    tr = larger_cycle.trough_indices
    if len(tr) < 2:
        st.note = "چرخه بزرگ‌تر کمتر از دو کف دارد"
        return st
    i1, i2 = tr[-2], tr[-1]
    p1, p2 = ts.lows[i1], ts.lows[i2]
    if i2 == i1:
        st.note = "دو کف منطبق‌اند"
        return st
    slope = (p2 - p1) / (i2 - i1)
    st.value_now = p2 + slope * ((len(ts) - 1) - i2)
    st.price_above = ts.last_close > st.value_now
    st.valid = True
    return st


def phasing(ts: TimeSeries, cfg: Optional[HurstConfig] = None,
            extra_periods: Optional[Sequence[float]] = None) -> List[CycleState]:
    """تحلیل فازبندی: وضعیت همه چرخه‌های اسمی که سری برایشان داده کافی دارد."""
    cfg = cfg or HurstConfig()
    bpc = ts.bars_per_calendar_day()
    states = []
    for name, _days, bars in nominal_cycles(cfg, bpc):
        if len(ts) >= bars * 2.5 and bars >= 6:
            states.append(analyze_cycle(ts, bars, name, cfg))
    for p in (extra_periods or []):
        states.append(analyze_cycle(ts, p, "کشف‌شده %.0f کندل" % p, cfg))
    return states
