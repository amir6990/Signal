# -*- coding: utf-8 -*-
"""
معیارهای بی‌اثر — پاسخ به پرسش «آیا این نتیجه از شانس بهتر است؟»

منبع فکری: White (2000) A Reality Check for Data Snooping؛ و Welch & Goyal
(2008) که نشان داد اغلب پیش‌بین‌ها از میانگین ساده تاریخی هم بدترند.

روش پیاده‌شده: توزیع تهی با جایگشت. سیگنال واقعی با سیگنالی جایگزین می‌شود
که **همان تعداد و همان مدت معامله** دارد ولی زمان‌بندی‌اش تصادفی است. اگر
استراتژی واقعی داخل توده این توزیع بیفتد، آنچه دیده‌ایم زمان‌بندی نیست —
صرفاً حضور در بازار است.
"""
import random
from dataclasses import dataclass
from typing import List, Optional, Sequence

from ..series import TimeSeries
from .engine import Backtester, BacktestResult


@dataclass
class NullTest:
    metric: str
    actual: float
    null_mean: float
    null_std: float
    percentile: float
    p_value: float
    n_samples: int

    @property
    def verdict(self) -> str:
        if self.p_value <= 0.01:
            return "بهتر از شانس (p ≤ ۰٫۰۱)"
        if self.p_value <= 0.05:
            return "احتمالاً بهتر از شانس (p ≤ ۰٫۰۵)"
        if self.p_value <= 0.20:
            return "قابل تفکیک از شانس نیست"
        return "از شانس بهتر نیست"


def _position_blocks(positions: Sequence[float]):
    """طول دوره‌های حضور در بازار — برای بازتولید همان پروفایل در سیگنال تصادفی."""
    blocks, run = [], 0
    for p in positions:
        if p > 0:
            run += 1
        elif run:
            blocks.append(run)
            run = 0
    if run:
        blocks.append(run)
    return blocks


def random_timing_null(ts: TimeSeries, result: BacktestResult,
                       bt: Optional[Backtester] = None,
                       n_samples: int = 500, seed: int = 17,
                       metric: str = "total_return") -> Optional[NullTest]:
    """توزیع تهی: همان تعداد و مدت معامله، ولی با زمان‌بندی تصادفی."""
    bt = bt or Backtester()
    blocks = _position_blocks(result.positions)
    if not blocks:
        return None
    n = len(ts)
    rng = random.Random(seed)
    vals = []
    for _ in range(n_samples):
        sig = [0.0] * n
        for length in blocks:
            if length >= n:
                continue
            start = rng.randint(0, n - length - 1)
            for k in range(start, min(n, start + length)):
                sig[k] = 1.0
        r = bt.run(ts, sig, "تصادفی", threshold_in=0.5, threshold_out=0.5)
        if not r.equity:
            continue
        vals.append(r.equity[-1] / r.equity[0] - 1.0)
    if not vals:
        return None
    actual = result.equity[-1] / result.equity[0] - 1.0
    m = sum(vals) / len(vals)
    var = sum((v - m) ** 2 for v in vals) / max(1, len(vals) - 1)
    sd = var ** 0.5
    better = sum(1 for v in vals if v >= actual)
    return NullTest(metric, actual, m, sd,
                    100.0 * (1 - better / len(vals)),
                    (better + 1) / (len(vals) + 1), len(vals))
