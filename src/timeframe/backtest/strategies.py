# -*- coding: utf-8 -*-
"""
سیگنال‌های قابل بک‌تست — همه علّی (فقط از گذشته).

هر تابع signal_fn(ts, params) آرایه‌ای هم‌طول ts می‌دهد که عنصر i آن فقط از
داده تا و شامل کندل i ساخته شده است. این شرط، مرز بین بک‌تست و خودفریبی است.
"""
import math
from typing import List, Sequence

from ..hurst import fld
from ..series import TimeSeries


def _sma(vals: Sequence[float], n: int, i: int):
    if i + 1 < n:
        return None
    return sum(vals[i - n + 1:i + 1]) / n


def buy_and_hold(ts: TimeSeries, params: dict) -> List[float]:
    return [1.0] * len(ts)


def ma_trend(ts: TimeSeries, params: dict) -> List[float]:
    """معیار پایه: قیمت بالای میانگین بلند = خرید. ساده و سخت‌شکست."""
    slow = int(params.get("slow", 200))
    c = ts.closes
    out = []
    for i in range(len(ts)):
        m = _sma(c, slow, i)
        out.append(0.0 if m is None else (1.0 if c[i] > m else -1.0))
    return out


def ma_cross(ts: TimeSeries, params: dict) -> List[float]:
    fast, slow = int(params.get("fast", 20)), int(params.get("slow", 100))
    c = ts.closes
    out = []
    for i in range(len(ts)):
        f, s = _sma(c, fast, i), _sma(c, slow, i)
        out.append(0.0 if (f is None or s is None) else (1.0 if f > s else -1.0))
    return out


def fld_cross(ts: TimeSeries, params: dict) -> List[float]:
    """لایه زمانی هرست: قیمت بالای FLD = چرخه صعودی.

    FLD در کندل i برابر قیمت i−period/2 است، پس کاملاً علّی است.
    """
    period = int(params.get("period", 60))
    f = fld(ts.closes, period)
    c = ts.closes
    return [0.0 if f[i] is None else (1.0 if c[i] > f[i] else -1.0)
            for i in range(len(ts))]


def fld_and_trend(ts: TimeSeries, params: dict) -> List[float]:
    """ترکیب: هم چرخه و هم روند باید موافق باشند."""
    a = fld_cross(ts, params)
    b = ma_trend(ts, params)
    return [1.0 if (a[i] > 0 and b[i] > 0) else (-1.0 if (a[i] < 0 or b[i] < 0) else 0.0)
            for i in range(len(ts))]


STRATEGIES = {
    "buy_and_hold": (buy_and_hold, [{}]),
    "ma_trend": (ma_trend, [{"slow": s} for s in (50, 100, 150, 200)]),
    "ma_cross": (ma_cross, [{"fast": f, "slow": s}
                            for f in (10, 20, 50) for s in (50, 100, 200) if f < s]),
    "fld": (fld_cross, [{"period": p} for p in (20, 30, 40, 60, 90, 120)]),
    "fld_trend": (fld_and_trend, [{"period": p, "slow": s}
                                  for p in (30, 60, 90) for s in (100, 200)]),
}
