# -*- coding: utf-8 -*-
"""
اعتبارسنجی برچسب‌گذاری موج الیوت.

منبع: A.J. Frost & Robert Prechter — Elliott Wave Principle: Key to Market Behavior

چرا اعتبارسنج و نه برچسب‌زن خودکار؟
برچسب‌گذاری الیوت ذاتاً چندگانه است: برای هر مسیر قیمت، چند شمارش سازگار وجود
دارد و انتخاب بین آن‌ها قضاوت است، نه محاسبه. هر الگوریتمی که یک شمارش «قطعی»
تولید کند، در واقع قضاوت را پنهان کرده. کاری که این ماژول می‌کند این است:
شمارش شما را می‌گیرد و می‌گوید کدام قاعده سخت نقض شده و کدام رهنمود برقرار است.
"""
import datetime
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

# درجات موج به ترتیب نزولی (Frost & Prechter، فصل ۱)
DEGREES = [
    "ابرچرخه بزرگ", "ابرچرخه", "چرخه", "اولیه", "میانی",
    "فرعی", "دقیقه‌ای", "ریز", "بسیار ریز",
]

IMPULSE_LABELS = ["0", "1", "2", "3", "4", "5"]
CORRECTIVE_LABELS = ["0", "A", "B", "C"]


@dataclass
class Pivot:
    label: str
    date: datetime.date
    price: float


@dataclass
class WaveCheck:
    valid: bool
    pattern: str                                    # "impulse" | "corrective"
    direction: str                                  # "up" | "down"
    violations: List[str] = field(default_factory=list)
    guidelines: List[str] = field(default_factory=list)
    ratios: Dict[str, float] = field(default_factory=dict)
    bias: float = 0.0                               # −۱۰ تا +۱۰
    note: str = ""


def _len(a: Pivot, b: Pivot) -> float:
    return abs(b.price - a.price)


def validate_impulse(pivots: List[Pivot]) -> WaveCheck:
    """سه قاعده سخت موج ایمپالس را می‌آزماید.

    ورودی باید شش نقطه برچسب‌خورده ۰ تا ۵ باشد (۰ = آغاز موج ۱).
    """
    chk = WaveCheck(valid=True, pattern="impulse", direction="up")
    by = {p.label: p for p in pivots}
    missing = [l for l in IMPULSE_LABELS if l not in by]
    if missing:
        return WaveCheck(False, "impulse", "up",
                         ["نقاط ناقص: " + "، ".join(missing)], note="شمارش ناتمام")
    p0, p1, p2, p3, p4, p5 = (by[l] for l in IMPULSE_LABELS)
    up = p1.price > p0.price
    chk.direction = "up" if up else "down"
    sgn = 1.0 if up else -1.0

    w1, w3, w5 = _len(p0, p1), _len(p2, p3), _len(p4, p5)
    chk.ratios = {
        "طول موج ۱": w1, "طول موج ۳": w3, "طول موج ۵": w5,
        "بازگشت موج ۲ از موج ۱": _len(p1, p2) / w1 if w1 else 0.0,
        "بازگشت موج ۴ از موج ۳": _len(p3, p4) / w3 if w3 else 0.0,
        "نسبت موج ۳ به موج ۱": w3 / w1 if w1 else 0.0,
        "نسبت موج ۵ به موج ۱": w5 / w1 if w1 else 0.0,
    }

    # قاعده ۱ — موج ۲ هرگز بیش از ۱۰۰٪ موج ۱ را بازنمی‌گردد
    if (up and p2.price <= p0.price) or ((not up) and p2.price >= p0.price):
        chk.violations.append("قاعده ۱ نقض شد: موج ۲ کل موج ۱ را بازگشته است.")
    # قاعده ۲ — موج ۳ هرگز کوتاه‌ترین موج محرک نیست
    if w3 < w1 and w3 < w5:
        chk.violations.append("قاعده ۲ نقض شد: موج ۳ کوتاه‌ترین موج محرک است.")
    # قاعده ۳ — موج ۴ وارد محدوده قیمتی موج ۱ نمی‌شود (جز در مثلث مورب)
    if (up and p4.price <= p1.price) or ((not up) and p4.price >= p1.price):
        chk.violations.append(
            "قاعده ۳ نقض شد: موج ۴ وارد محدوده موج ۱ شده است. "
            "(اگر الگو مثلث مورب باشد، این نقض مجاز است.)")

    # ترتیب زمانی
    dates = [p.date for p in (p0, p1, p2, p3, p4, p5)]
    if any(dates[i] >= dates[i + 1] for i in range(5)):
        chk.violations.append("ترتیب زمانی نقاط صعودی نیست.")

    # رهنمودها (نقض آن‌ها شمارش را باطل نمی‌کند)
    r31 = chk.ratios["نسبت موج ۳ به موج ۱"]
    if 1.5 <= r31 <= 1.8:
        chk.guidelines.append("موج ۳ نزدیک ۱٫۶۱۸ برابر موج ۱ است — نسبت متعارف.")
    if r31 > 2.4:
        chk.guidelines.append("موج ۳ کشیده (بیش از ۲٫۴ برابر موج ۱).")
    r4 = chk.ratios["بازگشت موج ۴ از موج ۳"]
    if 0.30 <= r4 <= 0.45:
        chk.guidelines.append("موج ۴ حدود ۰٫۳۸۲ موج ۳ را بازگشته — نسبت متعارف.")
    r2 = chk.ratios["بازگشت موج ۲ از موج ۱"]
    if abs(r2 - 0.618) < 0.08:
        chk.guidelines.append("موج ۲ حدود ۰٫۶۱۸ موج ۱ را بازگشته — نسبت متعارف.")
    if abs(r2 - 0.5) > 0.15 and abs(r4 - 0.5) < 0.15:
        chk.guidelines.append("اصل تناوب برقرار است (عمق موج ۲ و ۴ متفاوت).")
    r51 = chk.ratios["نسبت موج ۵ به موج ۱"]
    if abs(r51 - 1.0) < 0.15:
        chk.guidelines.append("موج ۵ تقریباً هم‌اندازه موج ۱ است — نسبت متعارف.")

    chk.valid = not chk.violations
    # سوگیری: پایان موج ۵ یعنی انتظار اصلاح، نه ادامه روند
    chk.bias = (-4.0 if chk.valid else 0.0) * sgn
    chk.note = ("شمارش با هر سه قاعده سخت سازگار است؛ پایان موج ۵ یعنی احتمال "
                "شروع اصلاح ABC." if chk.valid else "شمارش نامعتبر است.")
    return chk


def validate_corrective(pivots: List[Pivot]) -> WaveCheck:
    """اصلاح زیگزاگ/تخت ABC — قواعد سخت کمتری دارد، بیشتر رهنمود."""
    chk = WaveCheck(valid=True, pattern="corrective", direction="down")
    by = {p.label: p for p in pivots}
    missing = [l for l in CORRECTIVE_LABELS if l not in by]
    if missing:
        return WaveCheck(False, "corrective", "down",
                         ["نقاط ناقص: " + "، ".join(missing)], note="شمارش ناتمام")
    p0, pa, pb, pc = (by[l] for l in CORRECTIVE_LABELS)
    down = pa.price < p0.price
    chk.direction = "down" if down else "up"
    a, c = _len(p0, pa), _len(pb, pc)
    chk.ratios = {
        "طول موج A": a, "طول موج C": c,
        "بازگشت موج B از موج A": _len(pa, pb) / a if a else 0.0,
        "نسبت موج C به موج A": c / a if a else 0.0,
    }
    rb = chk.ratios["بازگشت موج B از موج A"]
    if rb > 1.0:
        chk.violations.append(
            "موج B بیش از ۱۰۰٪ موج A را بازگشته — زیگزاگ ساده رد می‌شود "
            "(می‌تواند تخت گسترده یا مثلث باشد).")
    if any(x.date >= y.date for x, y in ((p0, pa), (pa, pb), (pb, pc))):
        chk.violations.append("ترتیب زمانی نقاط صعودی نیست.")
    rc = chk.ratios["نسبت موج C به موج A"]
    if abs(rc - 1.0) < 0.15:
        chk.guidelines.append("موج C تقریباً هم‌اندازه موج A است — زیگزاگ متعارف.")
    if abs(rc - 1.618) < 0.2:
        chk.guidelines.append("موج C حدود ۱٫۶۱۸ برابر موج A است — نسبت متعارف.")
    if 0.382 <= rb <= 0.786:
        chk.guidelines.append("عمق موج B در محدوده متعارف زیگزاگ است.")
    chk.valid = not chk.violations
    chk.bias = 4.0 if (chk.valid and down) else (-4.0 if chk.valid else 0.0)
    chk.note = ("پایان موج C یعنی احتمال پایان اصلاح و شروع موج محرک بعدی."
                if chk.valid else "شمارش نامعتبر است.")
    return chk


def validate(pivots: List[Pivot]) -> WaveCheck:
    labels = {p.label.upper() for p in pivots}
    if labels & {"A", "B", "C"}:
        return validate_corrective([Pivot(p.label.upper(), p.date, p.price) for p in pivots])
    return validate_impulse(pivots)


def bias_from_label(label: str, confidence: Optional[int] = None) -> float:
    """سوگیری عددی از یک برچسب موج تنها (وقتی شمارش کامل در دست نیست).

    منطق: موج ۳ قوی‌ترین موج محرک است؛ موج ۵ آخرین و ضعیف‌ترین؛ موج C
    مخرب‌ترین موج اصلاحی.
    """
    table = {"1": 2.0, "2": 1.0, "3": 4.0, "4": 1.0, "5": -1.0,
             "A": -3.0, "B": -2.0, "C": -4.0}
    base = table.get(str(label).strip().upper(), 0.0)
    k = (confidence / 5.0) if confidence else 0.6
    return base * k
