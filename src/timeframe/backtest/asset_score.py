# -*- coding: utf-8 -*-
"""
بازتولید دقیق امتیازدهی شیت `Asset_Signals` در پایتون.

چرا «دقیق» مهم است: اگر این کد چیزی جز آنچه اکسل حساب می‌کند بسنجد، نتیجه
بک‌تست درباره مدلی است که وجود ندارد. پس هر تابع اینجا معادل مستقیم یک فرمول
است و تست، خروجی این کد را با مقادیر بازمحاسبه‌شده LibreOffice مقایسه می‌کند.

⚠️ **یک تفاوت عمدی و لازم.** در اکسل، `PERCENTRANK` و `MEDIAN` روی **کل
ستون** حساب می‌شوند. برای ردیف آخر — تنها ردیفی که سیگنال زنده از آن ساخته
می‌شود — این درست است، چون آینده‌ای وجود ندارد. ولی برای ردیف‌های تاریخی،
کل ستون شامل روزهای بعد از آن ردیف هم هست. بک‌تست کردنِ عینِ آن یعنی دادن
داده آینده به مدل و گرفتن نتیجه‌ای که در عمل تکرار نمی‌شود.

اینجا هر دو با **پنجره گسترش‌یابنده** حساب می‌شوند: صدک و میانه هر روز فقط
از روزهای تا همان روز. پس عدد این ماژول برای ردیف آخر با اکسل یکی است و
برای ردیف‌های تاریخی محافظه‌کارانه‌تر — که همان چیزی است که بک‌تست باید باشد.
"""
import bisect
import math
from dataclasses import dataclass, field
from typing import List, Optional, Sequence

TRADING_DAYS_Y = 245


@dataclass
class ScoreWeights:
    """وزن‌های بخش ۹ شیت Settings."""
    trend: float = 0.35
    momentum: float = 0.25
    volatility: float = 0.15
    valuation: float = 0.25

    def as_tuple(self):
        return (self.trend, self.momentum, self.volatility, self.valuation)


@dataclass
class ScoreParams:
    ma_short: int = 20
    ma_med: int = 50
    ma_long: int = 200
    vol_window: int = 20
    # حداقل تاریخچه لازم برای معنادار بودن صدک؛ کمتر از این، سنجه نادیده
    # گرفته می‌شود (صدک روی ۱۰ نقطه یک عدد است، نه یک اطلاع).
    min_percentile_history: int = 120


@dataclass
class ScoreRow:
    i: int
    price: float
    ma_s: Optional[float] = None
    ma_m: Optional[float] = None
    ma_l: Optional[float] = None
    ret5: Optional[float] = None
    ret20: Optional[float] = None
    ret60: Optional[float] = None
    vol: Optional[float] = None
    vol_med: Optional[float] = None
    val: Optional[float] = None
    val_pct: Optional[float] = None
    t: float = 0.0
    m: float = 0.0
    v: float = 0.0
    p: float = 0.0
    total: Optional[float] = None


def _sma(xs, i, w):
    if i + 1 < w:
        return None
    seg = xs[i + 1 - w:i + 1]
    return sum(seg) / w


def _percentrank(sorted_vals: Sequence[float], x: float) -> Optional[float]:
    """معادل PERCENTRANK اکسل: نسبت مقادیر کوچک‌تر به کل − ۱.

    اکسل خودش رتبه را بین ۰ و ۱ می‌دهد. اینجا هم همان: تعداد مقادیر اکیداً
    کوچک‌تر، تقسیم بر (تعداد کل − ۱).
    """
    n = len(sorted_vals)
    if n < 2:
        return None
    lo = bisect.bisect_left(sorted_vals, x)
    return min(1.0, max(0.0, lo / float(n - 1)))


def _median(sorted_vals: Sequence[float]) -> Optional[float]:
    n = len(sorted_vals)
    if n == 0:
        return None
    h = n // 2
    return sorted_vals[h] if n % 2 else (sorted_vals[h - 1] + sorted_vals[h]) / 2.0


# ---------------------------------------------------------------- زیرنمره‌ها
def trend_score(price, ma_s, ma_m, ma_l) -> float:
    """معادل ستون R: IF(P>MA_s,2.5,-2.5)+IF(P>MA_m,3.5,-3.5)+IF(P>MA_l,4,-4)."""
    if price is None:
        return 0.0
    s = 0.0
    # سلول خالی در اکسل با > مقایسه شود، FALSE می‌دهد → شاخه منفی. همان.
    s += 2.5 if (ma_s is not None and price > ma_s) else -2.5
    s += 3.5 if (ma_m is not None and price > ma_m) else -3.5
    s += 4.0 if (ma_l is not None and price > ma_l) else -4.0
    return max(-10.0, min(10.0, s))


def momentum_score(r5, r20, r60) -> float:
    """معادل ستون S."""
    def leg(r, hi, lo_, a, b):
        if r is None:
            return -a          # همان رفتار اکسل با سلول خالی در مقایسه
        if r > hi:
            return a
        if r > 0:
            return b
        if r < lo_:
            return -a
        return -b
    s = leg(r5, 0.02, -0.02, 2.0, 1.0)
    s += leg(r20, 0.05, -0.05, 4.0, 2.0)
    s += leg(r60, 0.10, -0.10, 4.0, 2.0)
    return max(-10.0, min(10.0, s))


def volatility_score(vol, vol_med) -> float:
    """معادل ستون T. نوسان بالا نسبت به میانه تاریخی، سیگنال را تضعیف می‌کند."""
    if vol is None or vol_med is None or vol_med == 0:
        return 0.0
    x = vol / vol_med
    if x > 2:
        return -6.0
    if x > 1.4:
        return -3.0
    if x < 0.7:
        return 3.0
    return 1.0


def valuation_score(pct) -> float:
    """معادل ستون U. گران بودن در توزیع تاریخی، امتیاز منفی می‌گیرد."""
    if pct is None:
        return 0.0
    if pct >= 0.90:
        return -8.0
    if pct >= 0.75:
        return -4.0
    if pct <= 0.10:
        return 8.0
    if pct <= 0.25:
        return 4.0
    return 0.0


def combine(t, m, v, p, w: ScoreWeights, has_valuation: bool) -> float:
    """معادل ستون V — با همان مخرج پویا.

    اگر سنجه ارزش‌گذاری نباشد، وزنش از مخرج هم حذف می‌شود؛ وگرنه نبودِ داده
    امتیاز را به سمت صفر رقیق می‌کند و روند قوی را ضعیف نشان می‌دهد.
    """
    num = t * w.trend + m * w.momentum + v * w.volatility
    den = w.trend + w.momentum + w.volatility
    if has_valuation:
        num += p * w.valuation
        den += w.valuation
    return num / den if den else 0.0


# ------------------------------------------------------------------- موتور
def compute(closes: Sequence[float],
            returns: Optional[Sequence[Optional[float]]] = None,
            valuation: Optional[Sequence[Optional[float]]] = None,
            params: Optional[ScoreParams] = None) -> List[ScoreRow]:
    """زیرنمره‌های هر روز، فقط از داده تا و شامل همان روز.

    valuation: سری سنجه ارزش‌گذاری (حباب/پریمیوم). None یعنی این دارایی
    سنجه ندارد — همان حالت اونس جهانی و دلار نیمایی در فایل‌ها.
    """
    p = params or ScoreParams()
    n = len(closes)
    if returns is None:
        returns = [None] + [
            (closes[i] / closes[i - 1] - 1.0) if closes[i - 1] else None
            for i in range(1, n)]

    rows: List[ScoreRow] = []
    vol_sorted: List[float] = []      # پنجره گسترش‌یابنده نوسان
    val_sorted: List[float] = []      # پنجره گسترش‌یابنده سنجه
    for i in range(n):
        r = ScoreRow(i=i, price=closes[i])
        r.ma_s = _sma(closes, i, p.ma_short)
        r.ma_m = _sma(closes, i, p.ma_med)
        r.ma_l = _sma(closes, i, p.ma_long)
        for k, attr in ((5, "ret5"), (20, "ret20"), (60, "ret60")):
            if i >= k and closes[i - k]:
                setattr(r, attr, closes[i] / closes[i - k] - 1.0)

        if i >= p.vol_window:
            seg = [x for x in returns[i + 1 - p.vol_window:i + 1] if x is not None]
            if len(seg) >= 2:
                mu = sum(seg) / len(seg)
                var = sum((x - mu) ** 2 for x in seg) / (len(seg) - 1)
                r.vol = math.sqrt(var) * math.sqrt(TRADING_DAYS_Y)

        # میانه نوسان: فقط از روزهای گذشته، پیش از افزودن امروز
        r.vol_med = _median(vol_sorted)
        if r.vol is not None:
            bisect.insort(vol_sorted, r.vol)

        if valuation is not None and i < len(valuation) and valuation[i] is not None:
            r.val = valuation[i]
            if len(val_sorted) >= p.min_percentile_history:
                r.val_pct = _percentrank(val_sorted, r.val)
            bisect.insort(val_sorted, r.val)

        r.t = trend_score(r.price, r.ma_s, r.ma_m, r.ma_l)
        r.m = momentum_score(r.ret5, r.ret20, r.ret60)
        r.v = volatility_score(r.vol, r.vol_med)
        r.p = valuation_score(r.val_pct)
        rows.append(r)
    return rows


def totals(rows: Sequence[ScoreRow], w: ScoreWeights) -> List[float]:
    """امتیاز کل هر روز برای یک بردار وزن. سری آماده دادن به بک‌تستر."""
    return [combine(r.t, r.m, r.v, r.p, w, r.val_pct is not None) for r in rows]
