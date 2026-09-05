# -*- coding: utf-8 -*-
"""ترکیب اجزای زمانی به یک امتیاز واحد در بازه −۱۰ تا +۱۰."""
import datetime
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from .config import TimeframeConfig
from .elliott import bias_from_label
from .hurst import CycleState, FLDSignal


@dataclass
class Component:
    key: str
    title: str
    score: float                # −۱۰ تا +۱۰
    weight: float
    reason: str
    reliable: bool = True


@dataclass
class TimeScore:
    total: float = 0.0
    components: List[Component] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    label: str = "خنثی"

    @property
    def reliability(self) -> str:
        w_ok = sum(c.weight for c in self.components if c.reliable)
        w_all = sum(c.weight for c in self.components) or 1.0
        r = w_ok / w_all
        return ("بالا" if r >= 0.75 else "متوسط" if r >= 0.4 else "پایین")

    def explain(self) -> str:
        rows = ["امتیاز زمانی: %+.2f (%s) — اتکاپذیری: %s"
                % (self.total, self.label, self.reliability)]
        for c in self.components:
            rows.append("  %-22s %+6.2f × وزن %.2f  %s%s"
                        % (c.title, c.score, c.weight, c.reason,
                           "" if c.reliable else "  [کم‌اتکا]"))
        for w in self.warnings:
            rows.append("  ⚠ " + w)
        return "\n".join(rows)


def _phase_score(state: CycleState) -> float:
    """فاز چرخه به امتیاز: نزدیک کف مثبت، نزدیک سقف منفی.

    منطق هرست: بهترین نقطه خرید، درست پس از کف چرخه است — نه در کف، چون کف
    را فقط پس از وقوع می‌توان تأیید کرد.
    """
    if state.phase is None:
        return 0.0
    p = state.phase % 1.0
    if p <= 0.10:
        return 6.0          # تازه از کف عبور کرده
    if p <= 0.30:
        return 4.0          # صعود اولیه
    if p <= 0.45:
        return 1.0          # نزدیک شدن به سقف
    if p <= 0.60:
        return -4.0         # ناحیه سقف
    if p <= 0.85:
        return -3.0         # نزول چرخه
    return 2.0              # نزدیک کف بعدی — آماده‌باش خرید


def compute(cycle: Optional[CycleState] = None,
            fld: Optional[FLDSignal] = None,
            gann_active: int = 0,
            fib_active: int = 0,
            elliott_label: str = "",
            elliott_confidence: Optional[int] = None,
            cfg: Optional[TimeframeConfig] = None,
            direction_hint: float = 0.0,
            cycle_validated: bool = False) -> TimeScore:
    """امتیاز زمانی از اجزای موجود. اجزای غایب وزنشان حذف می‌شود، صفر نمی‌گیرند.

    direction_hint: جهت روند قیمتی (−۱ تا +۱) — پنجره‌های گن و فیبوناچی جهت
    ندارند؛ آن‌ها فقط زمان چرخش را نشان می‌دهند، پس جهتشان از روند گرفته می‌شود.

    cycle_validated: آیا دوره‌ای که FLD و فاز بر آن بنا شده‌اند از آزمون
    معناداری طیفی گذشته است؟ اگر نه، کل ساختمان روی یک دوره فرضی ایستاده و
    باید کم‌اتکا علامت بخورد — حتی اگر اجزا عدد تمیزی بدهند.
    """
    cfg = cfg or TimeframeConfig()
    w = cfg.weights
    ts = TimeScore()

    if cycle is not None and cycle.phase is not None:
        s = _phase_score(cycle)
        rel = cycle.reliable
        ts.components.append(Component(
            "cycle_phase", "فاز چرخه غالب", s, w.cycle_phase,
            "فاز %.0f%% از دوره %.0f کندلی — %s"
            % ((cycle.phase % 1.0) * 100, cycle.period_bars, cycle.phase_label),
            reliable=rel))
        if cycle.edge_warning:
            ts.warnings.append(cycle.edge_warning)
        if cycle.quality.startswith("نامنظم"):
            ts.warnings.append("چرخه نامنظم است (%s) — پروجکشن فاز کم‌اعتبار است."
                               % cycle.quality)

    if fld is not None and fld.above is not None:
        s = 5.0 if fld.above else -5.0
        if fld.crossed_recently == "up" and (fld.bars_since_cross or 99) <= 5:
            s = 7.0
        elif fld.crossed_recently == "down" and (fld.bars_since_cross or 99) <= 5:
            s = -7.0
        ts.components.append(Component(
            "fld", "وضعیت نسبت به FLD", s, w.fld,
            "%s FLD%s" % ("بالای" if fld.above else "زیر",
                          "، عبور %s در %d کندل قبل" % (
                              "صعودی" if fld.crossed_recently == "up" else "نزولی",
                              fld.bars_since_cross)
                          if fld.crossed_recently else ""),
            reliable=cycle_validated))

    if gann_active > 0:
        s = 2.5 * (1 if direction_hint >= 0 else -1) * min(2, gann_active) / 2.0
        ts.components.append(Component(
            "gann", "پنجره زمانی گن", s * 2, w.gann_window,
            "%d پنجره فعال — جهت از روند قیمت گرفته شده" % gann_active,
            reliable=False))

    if fib_active > 0:
        s = 2.0 * (1 if direction_hint >= 0 else -1)
        ts.components.append(Component(
            "fib", "پروجکشن زمانی فیبوناچی", s * 2, w.fib_window,
            "%d پروجکشن فعال" % fib_active, reliable=False))

    if elliott_label:
        s = bias_from_label(elliott_label, elliott_confidence) * 2.5
        ts.components.append(Component(
            "elliott", "برچسب موج الیوت", max(-10, min(10, s)), w.elliott,
            "موج %s (اطمینان %s)" % (elliott_label, elliott_confidence or "تعیین‌نشده"),
            reliable=False))

    tw = sum(c.weight for c in ts.components)
    if tw > 0:
        ts.total = sum(c.score * c.weight for c in ts.components) / tw
    ts.total = max(-10.0, min(10.0, ts.total))
    ts.label = ("زمان مساعد خرید" if ts.total >= 5 else
                "زمان نسبتاً مساعد" if ts.total >= 2 else
                "زمان نامساعد" if ts.total <= -5 else
                "زمان نسبتاً نامساعد" if ts.total <= -2 else "خنثی")
    if not cycle_validated:
        ts.warnings.append(
            "هیچ چرخه‌ای از آزمون معناداری عبور نکرده است. دوره‌ای که FLD و فاز "
            "روی آن ساخته شده‌اند از مدل اسمی هرست آمده، نه از داده این نماد. "
            "امتیاز زیر را به‌عنوان یک فرضیه بخوانید، نه یافته.")
    if not ts.components:
        ts.warnings.append("هیچ جزء زمانی قابل محاسبه نبود — امتیاز صفر است، "
                           "نه اینکه شرایط خنثی باشد.")
    return ts
