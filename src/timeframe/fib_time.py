# -*- coding: utf-8 -*-
"""
پروجکشن زمانی فیبوناچی.

منبع: Robert Prechter — Beautiful Pictures from the Gallery of Phinance
(نسبت‌های فیبوناچی در ساختار زمانی بازار)، به‌علاوه کاربرد متعارف در تحلیل موج.

نکته: نسبت‌های زمانی فیبوناچی به‌اندازه نسبت‌های قیمتی مستندسازی نشده‌اند و در
میان تحلیلگران هم اجماع کمتری دارند. اینجا به‌عنوان «پنجره توجه» استفاده می‌شوند،
نه پیش‌بینی.
"""
import datetime
from dataclasses import dataclass
from typing import List, Optional

from .config import FibTimeConfig
from .gann import TimeWindow


@dataclass
class Swing:
    start: datetime.date
    end: datetime.date
    label: str = ""

    @property
    def length_days(self) -> int:
        return (self.end - self.start).days


def project(swing: Swing, cfg: Optional[FibTimeConfig] = None,
            today: Optional[datetime.date] = None) -> List[TimeWindow]:
    """تاریخ‌های پروجکشن نسبت‌های فیبوناچی از انتهای سوئینگ."""
    cfg = cfg or FibTimeConfig()
    out = []
    n = swing.length_days
    if n <= 0:
        return out
    for r in cfg.ratios:
        d = swing.end + datetime.timedelta(days=int(round(n * r)))
        w = TimeWindow(d, "%.3f × طول سوئینگ %s (%d روز)" % (r, swing.label, n),
                       "fib_time", swing.label)
        if today:
            w.days_from_today = (d - today).days
        out.append(w)
    return out


def upcoming(swings: List[Swing], today: datetime.date,
             cfg: Optional[FibTimeConfig] = None) -> List[TimeWindow]:
    cfg = cfg or FibTimeConfig()
    out = []
    for sw in swings:
        for w in project(sw, cfg, today):
            if -cfg.tolerance_days <= w.days_from_today <= cfg.horizon_days:
                out.append(w)
    out.sort(key=lambda w: abs(w.days_from_today))
    return out
