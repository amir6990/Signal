# -*- coding: utf-8 -*-
"""
شمارش‌های زمانی گن.

منابع:
  • W.D. Gann — How to Make Profits Trading in Commodities (شمارش‌های زمانی،
    تاریخ‌های سالگرد، چرخه‌های ۳۰/۶۰/۹۰ ساله)
  • W.D. Gann — The Tunnel Thru the Air (چرخه‌های طبیعی و تاریخ‌های فصلی)
  • James A. Hyerczyk — Pattern, Price & Time (تدوین عملیاتی نظریه گن)

هشدار صریح: «مربع کردن قیمت و زمان» به مقیاس انتخابی وابسته است. با تغییر
مقیاس، هر تاریخی را می‌توان «مربع» نشان داد. این ابزار برای علامت‌گذاری
پنجره‌های زمانیِ از پیش تعریف‌شده مفید است، نه برای اثبات چیزی پس از وقوع.
"""
import datetime
from dataclasses import dataclass
from typing import List, Optional, Sequence

from .config import GannConfig


@dataclass
class TimeWindow:
    date: datetime.date
    label: str
    kind: str                 # day_count | anniversary | seasonal | square
    anchor_label: str = ""
    days_from_today: Optional[int] = None

    @property
    def is_active(self) -> bool:
        return self.days_from_today is not None and abs(self.days_from_today) <= 3


# تاریخ‌های فصلی: اعتدال‌ها و انقلاب‌ها به‌علاوه تقسیمات ۴۵ درجه‌ای دایره سال.
# اعتدال بهاری برای بازار ایران دو برابر اهمیت دارد: هم نقطه فصلی گن است و هم
# آغاز سال مالی و تعطیلات نوروز.
SEASONAL = [
    (3, 21, "اعتدال بهاری / نوروز / آغاز سال مالی ایران"),
    (5, 6, "۴۵ درجه پس از اعتدال بهاری"),
    (6, 21, "انقلاب تابستانی"),
    (8, 8, "۴۵ درجه پس از انقلاب تابستانی"),
    (9, 22, "اعتدال پاییزی"),
    (11, 8, "۴۵ درجه پس از اعتدال پاییزی"),
    (12, 21, "انقلاب زمستانی"),
    (2, 4, "۴۵ درجه پس از انقلاب زمستانی"),
]


def seasonal_dates(year: int) -> List[TimeWindow]:
    out = []
    for m, d, lbl in SEASONAL:
        try:
            out.append(TimeWindow(datetime.date(year, m, d), lbl, "seasonal"))
        except ValueError:
            continue
    return out


def _add_years(d: datetime.date, k: int) -> datetime.date:
    try:
        return d.replace(year=d.year + k)
    except ValueError:                       # ۲۹ اسفند سال کبیسه
        return d.replace(year=d.year + k, day=28)


def time_counts(anchor: datetime.date, anchor_label: str = "",
                cfg: Optional[GannConfig] = None) -> List[TimeWindow]:
    """همه پنجره‌های زمانی گن از یک نقطه لنگر (سقف یا کف مهم)."""
    cfg = cfg or GannConfig()
    out = []
    for k in cfg.day_counts:
        out.append(TimeWindow(anchor + datetime.timedelta(days=k),
                              "%d روز از %s" % (k, anchor_label or "لنگر"),
                              "day_count", anchor_label))
    for y in cfg.year_counts:
        out.append(TimeWindow(_add_years(anchor, y),
                              "سالگرد %d ساله %s" % (y, anchor_label or "لنگر"),
                              "anniversary", anchor_label))
    return out


def upcoming(anchors, today: datetime.date, cfg: Optional[GannConfig] = None,
             include_seasonal: bool = True) -> List[TimeWindow]:
    """پنجره‌های پیش‌رو در افق تعریف‌شده، مرتب بر اساس نزدیکی.

    anchors: دنباله‌ای از (تاریخ، برچسب).
    """
    cfg = cfg or GannConfig()
    wins: List[TimeWindow] = []
    for d, lbl in anchors:
        wins.extend(time_counts(d, lbl, cfg))
    if include_seasonal:
        for yr in (today.year, today.year + 1):
            wins.extend(seasonal_dates(yr))
    out = []
    for w in wins:
        delta = (w.date - today).days
        if -cfg.tolerance_days <= delta <= cfg.horizon_days:
            w.days_from_today = delta
            out.append(w)
    out.sort(key=lambda w: abs(w.days_from_today))
    return out


def active_windows(anchors, today: datetime.date,
                   cfg: Optional[GannConfig] = None) -> List[TimeWindow]:
    """فقط پنجره‌هایی که همین حالا فعالند (داخل تلورانس)."""
    cfg = cfg or GannConfig()
    return [w for w in upcoming(anchors, today, cfg)
            if abs(w.days_from_today) <= cfg.tolerance_days]


@dataclass
class SquareState:
    natural_scale: Optional[float] = None     # واحد قیمت به ازای هر کندل
    nearest_gann_scale: Optional[float] = None
    ratio_to_nearest: Optional[float] = None
    note: str = ""


GANN_SCALES = [1 / 64, 1 / 32, 1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8, 16, 32, 64,
               128, 256, 512, 1024]


def squaring(anchor_price: float, current_price: float, bars_elapsed: int) -> SquareState:
    """«مربع کردن قیمت و زمان»: مقیاس ضمنی حرکت جاری.

    مقیاس طبیعی = دامنه قیمت ÷ تعداد کندل. اگر این عدد به یکی از مقیاس‌های
    متعارف گن نزدیک باشد، حرکت روی زاویه‌ای «مربع» است. چون مقیاس‌ها لگاریتمی
    و متراکم‌اند، نزدیکی تصادفی زیاد اتفاق می‌افتد — این را به‌عنوان شاهد ضعیف
    بخوانید، نه قوی.
    """
    st = SquareState()
    if bars_elapsed <= 0:
        st.note = "تعداد کندل صفر است"
        return st
    st.natural_scale = abs(current_price - anchor_price) / bars_elapsed
    if st.natural_scale == 0:
        st.note = "دامنه قیمت صفر است"
        return st
    best = min(GANN_SCALES, key=lambda s: abs(s - st.natural_scale) / s)
    st.nearest_gann_scale = best
    st.ratio_to_nearest = st.natural_scale / best
    st.note = ("نزدیک مقیاس %.4g (نسبت %.2f)" % (best, st.ratio_to_nearest)
               if 0.9 <= st.ratio_to_nearest <= 1.1 else
               "روی هیچ مقیاس متعارفی مربع نیست (نسبت %.2f)" % st.ratio_to_nearest)
    return st
