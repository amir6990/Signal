# -*- coding: utf-8 -*-
"""احتمال افت سرمایه در افق آینده — بر مبنای توزیع تجربی، نه فرض نرمال."""
import math
from dataclasses import dataclass, field
from typing import Callable, List, Optional

from ..series import TimeSeries
from .base_rates import _describe, _quantile


@dataclass
class DrawdownForecast:
    horizon: int = 0
    n_raw: int = 0
    n_effective: float = 0.0
    median_dd: float = 0.0
    q75_dd: float = 0.0
    q95_dd: float = 0.0
    worst: float = 0.0
    p_exceed: dict = field(default_factory=dict)
    warnings: List[str] = field(default_factory=list)

    def table(self) -> str:
        L = ["   بیشینه افت در %d کندل آینده — توزیع تجربی" % self.horizon,
             "   مشاهده خام %d | مستقل تقریبی %.0f" % (self.n_raw, self.n_effective),
             "   میانه %.1f%% | صدک ۷۵ %.1f%% | صدک ۹۵ %.1f%% | بدترین %.1f%%"
             % (self.median_dd * 100, self.q75_dd * 100, self.q95_dd * 100, self.worst * 100)]
        for th in sorted(self.p_exceed):
            L.append("   احتمال افت بیش از %.0f%%: %.0f%%"
                     % (th * 100, self.p_exceed[th] * 100))
        for w in self.warnings:
            L.append("   ⚠ " + w)
        return "\n".join(L)


def forward_max_drawdown(ts: TimeSeries, horizon: int,
                         condition: Optional[Callable] = None,
                         thresholds=(0.10, 0.20, 0.30)) -> DrawdownForecast:
    """برای هر کندل، بدترین افت داخل پنجره h کندل بعدی."""
    c = ts.closes
    n = len(c)
    vals = []
    for i in range(n - horizon):
        if condition and not condition(ts, i):
            continue
        peak = c[i]
        worst = 0.0
        for k in range(i + 1, i + horizon + 1):
            peak = max(peak, c[k])
            worst = min(worst, c[k] / peak - 1.0)
        vals.append(worst)
    f = DrawdownForecast(horizon=horizon, n_raw=len(vals))
    if not vals:
        f.warnings.append("مشاهده‌ای با این شرط یافت نشد.")
        return f
    f.n_effective = len(vals) / max(1, horizon)
    s = sorted(vals)
    f.median_dd = _quantile(s, 0.5)
    f.q75_dd = _quantile(s, 0.25)      # بدتر = چندک پایین‌تر
    f.q95_dd = _quantile(s, 0.05)
    f.worst = s[0]
    for th in thresholds:
        f.p_exceed[th] = sum(1 for v in vals if v <= -th) / len(vals)
    if f.n_effective < 20:
        f.warnings.append("حدود %.0f مشاهده مستقل — برای استنتاج کم است." % f.n_effective)
    return f
