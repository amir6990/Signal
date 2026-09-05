# -*- coding: utf-8 -*-
"""فیلترها و تشخیص نقاط چرخش — پایتون خالص."""
import math
from typing import List, Optional, Sequence, Tuple

NA = None


def linear_detrend(y: Sequence[float]) -> List[float]:
    """حذف روند خطی با کمترین مربعات. برای تحلیل طیفی الزامی است:
    روند باقی‌مانده در طیف به‌صورت یک چرخه بسیار بلند جعلی ظاهر می‌شود."""
    n = len(y)
    if n < 3:
        return list(y)
    sx = n * (n - 1) / 2.0
    sxx = (n - 1) * n * (2 * n - 1) / 6.0
    sy = sum(y)
    sxy = sum(i * v for i, v in enumerate(y))
    den = n * sxx - sx * sx
    if den == 0:
        return list(y)
    slope = (n * sxy - sx * sy) / den
    intercept = (sy - slope * sx) / n
    return [v - (intercept + slope * i) for i, v in enumerate(y)]


def centered_ma(y: Sequence[float], length: int) -> List[Optional[float]]:
    """میانگین متحرک مرکزی. دوره‌های کوتاه‌تر از length را حذف می‌کند.
    خروجی در دو انتها None است — عمداً، چون میانگین مرکزی آنجا تعریف نشده."""
    n = len(y)
    if length < 2 or length > n:
        return [None] * n
    half = length // 2
    out: List[Optional[float]] = [None] * n
    run = sum(y[:length])
    for i in range(half, n - (length - half - 1)):
        start = i - half
        if start > 0:
            run += y[start + length - 1] - y[start - 1]
        out[i] = run / length
    return out


def bandpass(y: Sequence[float], period: float, band_ratio: float = 1.41421356
             ) -> List[Optional[float]]:
    """فیلتر میان‌گذر به روش تفاضل دو میانگین مرکزی (روش هرست).

    CMA(a) دوره‌های بلندتر از a را عبور می‌دهد؛ تفاضل دو CMA باندی بین a و b
    می‌سازد. مرکز باند روی period و پهنای آن یک اکتاو (√۲ در هر طرف) است.
    """
    a = max(2, int(round(period / band_ratio)))
    b = max(a + 1, int(round(period * band_ratio)))
    ma_a, ma_b = centered_ma(y, a), centered_ma(y, b)
    return [None if (ma_a[i] is None or ma_b[i] is None) else ma_a[i] - ma_b[i]
            for i in range(len(y))]


def find_extrema(y: Sequence[Optional[float]], min_separation: int,
                 kind: str = "trough") -> List[int]:
    """کف‌ها (یا سقف‌ها) با حداقل فاصله معین. مقادیر None نادیده گرفته می‌شوند."""
    idx = [i for i, v in enumerate(y) if v is not None]
    if len(idx) < 3:
        return []
    sign = 1.0 if kind == "trough" else -1.0
    cands: List[Tuple[int, float]] = []
    for k in range(1, len(idx) - 1):
        i0, i1, i2 = idx[k - 1], idx[k], idx[k + 1]
        v0, v1, v2 = sign * y[i0], sign * y[i1], sign * y[i2]
        if v1 <= v0 and v1 <= v2:
            cands.append((i1, v1))
    cands.sort(key=lambda t: t[1])          # عمیق‌ترین اول
    chosen: List[int] = []
    for i, _v in cands:
        if all(abs(i - j) >= min_separation for j in chosen):
            chosen.append(i)
    return sorted(chosen)


def zscore_last(y: Sequence[float], lookback: int) -> Optional[float]:
    seg = [v for v in y[-lookback:] if v is not None]
    if len(seg) < 5:
        return None
    m = sum(seg) / len(seg)
    var = sum((v - m) ** 2 for v in seg) / (len(seg) - 1)
    sd = math.sqrt(var)
    return (seg[-1] - m) / sd if sd > 0 else 0.0


def linreg_slope(y: Sequence[float]) -> float:
    n = len(y)
    if n < 2:
        return 0.0
    sx = n * (n - 1) / 2.0
    sxx = (n - 1) * n * (2 * n - 1) / 6.0
    sy = sum(y)
    sxy = sum(i * v for i, v in enumerate(y))
    den = n * sxx - sx * sx
    return (n * sxy - sx * sy) / den if den else 0.0
