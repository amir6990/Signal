# -*- coding: utf-8 -*-
"""
نرخ‌های پایه و توزیع شرطی بازده آتی.

منبع فکری: Tetlock & Gardner (2015) — اولین کاری که پیش‌بین‌های خوب می‌کنند
شروع از نرخ پایه است، نه از روایت. Kahneman: غفلت از نرخ پایه رایج‌ترین خطای
قضاوت است.

⚠️ **مسئله همپوشانی پنجره‌ها** — مهم‌ترین نکته آماری این ماژول:
اگر از داده روزانه، بازده ۶۳ روز آینده را برای هر روز حساب کنید، دو مشاهده
متوالی ۶۲ روز مشترک دارند. این مشاهدات مستقل نیستند و تعداد واقعی اطلاعات
تقریباً n/h است، نه n. گزارش «۲۰۰۰ مشاهده تاریخی» وقتی افق ۶۳ روزه است،
در عمل حدود ۳۲ مشاهده مستقل است. این ماژول همیشه هر دو عدد را می‌دهد.
"""
import math
from dataclasses import dataclass, field
from typing import Callable, List, Optional, Sequence

from ..series import TimeSeries


@dataclass
class Distribution:
    label: str = ""
    horizon: int = 0
    n_raw: int = 0                 # تعداد مشاهده خام
    n_effective: float = 0.0       # تعداد مشاهده مستقل (تقریبی)
    mean: float = 0.0
    median: float = 0.0
    q05: float = 0.0
    q25: float = 0.0
    q75: float = 0.0
    q95: float = 0.0
    p_negative: float = 0.0
    p_below_10: float = 0.0
    p_below_20: float = 0.0
    p_above_20: float = 0.0
    warnings: List[str] = field(default_factory=list)

    @property
    def reliable(self) -> bool:
        return self.n_effective >= 20

    def table(self) -> str:
        L = ["   %s — افق %d کندل" % (self.label, self.horizon),
             "   مشاهده خام %d | مشاهده مستقل تقریبی %.0f%s"
             % (self.n_raw, self.n_effective,
                "  ⚠ برای استنتاج کم است" if not self.reliable else ""),
             "   میانگین %+.1f%% | میانه %+.1f%%" % (self.mean * 100, self.median * 100),
             "   صدک‌ها:  ۵٪ %+.1f%%   ۲۵٪ %+.1f%%   ۷۵٪ %+.1f%%   ۹۵٪ %+.1f%%"
             % (self.q05 * 100, self.q25 * 100, self.q75 * 100, self.q95 * 100),
             "   احتمال بازده منفی: %.0f%%" % (self.p_negative * 100),
             "   احتمال افت بیش از ۱۰٪: %.0f%%" % (self.p_below_10 * 100),
             "   احتمال افت بیش از ۲۰٪: %.0f%%" % (self.p_below_20 * 100),
             "   احتمال رشد بیش از ۲۰٪: %.0f%%" % (self.p_above_20 * 100)]
        for w in self.warnings:
            L.append("   ⚠ " + w)
        return "\n".join(L)


def _quantile(sorted_vals: Sequence[float], q: float) -> float:
    if not sorted_vals:
        return 0.0
    pos = q * (len(sorted_vals) - 1)
    lo = int(math.floor(pos))
    hi = min(lo + 1, len(sorted_vals) - 1)
    frac = pos - lo
    return sorted_vals[lo] * (1 - frac) + sorted_vals[hi] * frac


def _describe(vals: List[float], label: str, horizon: int) -> Distribution:
    d = Distribution(label=label, horizon=horizon, n_raw=len(vals))
    if not vals:
        d.warnings.append("هیچ مشاهده‌ای با این شرط یافت نشد.")
        return d
    d.n_effective = len(vals) / max(1, horizon)
    s = sorted(vals)
    d.mean = sum(vals) / len(vals)
    d.median = _quantile(s, 0.5)
    d.q05, d.q25, d.q75, d.q95 = (_quantile(s, q) for q in (0.05, 0.25, 0.75, 0.95))
    n = len(vals)
    d.p_negative = sum(1 for v in vals if v < 0) / n
    d.p_below_10 = sum(1 for v in vals if v <= -0.10) / n
    d.p_below_20 = sum(1 for v in vals if v <= -0.20) / n
    d.p_above_20 = sum(1 for v in vals if v >= 0.20) / n
    if d.n_effective < 20:
        d.warnings.append(
            "فقط حدود %.0f مشاهده مستقل. به‌دلیل همپوشانی پنجره‌های %d روزه، "
            "تعداد خام (%d) گمراه‌کننده است." % (d.n_effective, horizon, d.n_raw))
    if d.n_effective < 5:
        d.warnings.append("این توزیع عملاً بی‌معناست — گزارش می‌شود تا پنهان نماند.")
    return d


def forward_returns(ts: TimeSeries, horizon: int) -> List[Optional[float]]:
    """بازده h کندل آینده برای هر کندل. انتهای سری None است."""
    c = ts.closes
    n = len(c)
    return [(c[i + horizon] / c[i] - 1.0) if i + horizon < n else None
            for i in range(n)]


def unconditional(ts: TimeSeries, horizon: int) -> Distribution:
    fr = forward_returns(ts, horizon)
    return _describe([v for v in fr if v is not None], "نرخ پایه بدون شرط", horizon)


def conditional(ts: TimeSeries, horizon: int,
                condition: Callable[[TimeSeries, int], bool],
                label: str) -> Distribution:
    """توزیع بازده آتی به‌شرط برقراری یک وضعیت در زمان مشاهده.

    condition(ts, i) باید فقط از داده تا و شامل کندل i استفاده کند.
    """
    fr = forward_returns(ts, horizon)
    vals = [fr[i] for i in range(len(ts)) if fr[i] is not None and condition(ts, i)]
    return _describe(vals, label, horizon)


# ------------------------------------------------------------------ شرط‌های آماده
def below_ma(period: int):
    def f(ts: TimeSeries, i: int) -> bool:
        if i < period:
            return False
        ma = sum(ts.closes[i - period + 1:i + 1]) / period
        return ts.closes[i] < ma
    return f


def above_ma(period: int):
    inner = below_ma(period)
    def f(ts: TimeSeries, i: int) -> bool:
        return (i >= period) and not inner(ts, i)
    return f


def drawdown_exceeds(pct: float, lookback: int = 252):
    def f(ts: TimeSeries, i: int) -> bool:
        if i < 20:
            return False
        peak = max(ts.closes[max(0, i - lookback):i + 1])
        return (ts.closes[i] / peak - 1.0) <= -abs(pct)
    return f


def high_volatility(window: int = 20, quantile: float = 0.75):
    """نوسان اخیر در صدک بالای توزیع تاریخیِ **تا همان لحظه** (بدون نگاه به آینده)."""
    def f(ts: TimeSeries, i: int) -> bool:
        if i < window * 3:
            return False
        rets = [ts.closes[k] / ts.closes[k - 1] - 1.0 for k in range(1, i + 1)]
        if len(rets) < window * 2:
            return False
        def vol(seg):
            m = sum(seg) / len(seg)
            return math.sqrt(sum((x - m) ** 2 for x in seg) / max(1, len(seg) - 1))
        cur = vol(rets[-window:])
        hist = sorted(vol(rets[k:k + window]) for k in range(0, len(rets) - window, window))
        if not hist:
            return False
        return cur >= _quantile(hist, quantile)
    return f
