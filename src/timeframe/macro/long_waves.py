# -*- coding: utf-8 -*-
"""
رجیستری چرخه‌های بلند اقتصادی و ژئوپلیتیک.

هر فاز یک بازه تاریخی، یک منبع و یک سطح اطمینان دارد. هیچ فازی بدون منبع
ثبت نشده. جایی که ادبیات موضوع اختلاف دارد (مثل مرزهای امواج کندراتیف)،
بازه‌ها با «/» نشان داده شده و سطح اطمینان STANDARD است، نه SOURCED.
"""
import datetime
from dataclasses import dataclass, field
from typing import List, Optional

from .sources import SOURCES, Dating, Status


@dataclass
class Phase:
    name: str
    start: int                      # سال میلادی
    end: Optional[int]              # None = تا امروز/نامشخص
    note: str = ""

    def contains(self, year: int) -> bool:
        return self.start <= year and (self.end is None or year < self.end)

    @property
    def span(self) -> str:
        return "%d–%s" % (self.start, self.end if self.end else "…")


@dataclass
class LongWave:
    key: str
    title: str
    source_key: str
    typical_years: str              # طول متعارف چرخه
    dating: Dating
    phases: List[Phase] = field(default_factory=list)
    caveat: str = ""

    @property
    def source(self):
        return SOURCES[self.source_key]

    @property
    def status(self) -> Status:
        return self.source.status

    def current_phase(self, today: Optional[datetime.date] = None) -> Optional[Phase]:
        y = (today or datetime.date.today()).year
        for p in self.phases:
            if p.contains(y):
                return p
        return None

    def progress(self, today: Optional[datetime.date] = None) -> Optional[float]:
        """پیشرفت داخل فاز جاری (۰ تا ۱). اگر فاز پایان‌باز باشد، None."""
        p = self.current_phase(today)
        if not p or p.end is None:
            return None
        y = (today or datetime.date.today()).year
        span = p.end - p.start
        return (y - p.start) / span if span > 0 else None


# ===================================================================
# چرخه‌های اقتصادی
# ===================================================================
KONDRATIEFF = LongWave(
    "kondratieff", "امواج بلند کندراتیف", "grinin", "۴۵ تا ۶۰ سال", Dating.STANDARD,
    [
        Phase("موج ۱ — صعود (انقلاب صنعتی)", 1780, 1817),
        Phase("موج ۱ — نزول", 1817, 1848),
        Phase("موج ۲ — صعود (راه‌آهن و بخار)", 1848, 1873),
        Phase("موج ۲ — نزول", 1873, 1893),
        Phase("موج ۳ — صعود (برق و فولاد)", 1893, 1917),
        Phase("موج ۳ — نزول", 1917, 1945),
        Phase("موج ۴ — صعود (نفت، خودرو، تولید انبوه)", 1945, 1971),
        Phase("موج ۴ — نزول", 1971, 1990),
        Phase("موج ۵ — صعود (فناوری اطلاعات)", 1990, 2008),
        Phase("موج ۵ — نزول", 2008, 2030,
              "پایان این فاز در ادبیات موضوع تثبیت‌نشده است؛ ۲۰۳۰ یک تخمین متعارف است."),
        Phase("موج ۶ — صعود (پیشنهادی، تثبیت‌نشده)", 2030, None),
    ],
    caveat="مرزهای امواج بین نویسندگان تا یک دهه اختلاف دارد. وجود خودِ موج "
           "کندراتیف در اقتصاد جریان اصلی پذیرفته نیست — چون تعداد مشاهدات "
           "(حدود پنج موج) برای استنتاج آماری بسیار کم است.")

JUGLAR = LongWave(
    "juglar", "چرخه ژوگلار (سرمایه‌گذاری و اعتبار)", "juglar", "۷ تا ۱۱ سال",
    Dating.SOURCED, [],
    caveat="ژوگلار چرخه را کشف کرد ولی تاریخ‌گذاری جهانی معاصر برای آن در این "
           "پکیج ثبت نشده؛ برای استفاده، تاریخ رکودهای اقتصاد مرجع خودتان را "
           "به‌عنوان لنگر وارد کنید.")

KITCHIN = LongWave(
    "kitchin", "چرخه کیچین (موجودی انبار)", "schumpeter", "۳ تا ۵ سال",
    Dating.SOURCED, [],
    caveat="کوتاه‌ترین چرخه طرح سه‌گانه شومپیتر؛ سه کیچین در هر ژوگلار.")

SCHUMPETER = LongWave(
    "schumpeter", "طرح سه‌چرخه‌ای شومپیتر", "schumpeter",
    "کیچین ۴۰ ماه / ژوگلار ۹–۱۰ سال / کندراتیف ۵۵–۶۰ سال", Dating.SOURCED, [],
    caveat="شومپیتر سه چرخه را روی هم سوار می‌کند: سه کیچین در یک ژوگلار و شش "
           "ژوگلار در یک کندراتیف. این تناسب دقیق، همان بخشی است که بیشترین "
           "نقد را گرفته.")

PEREZ = LongWave(
    "perez", "امواج بزرگ فناورانه (پرز)", "perez", "۴۰ تا ۶۰ سال", Dating.SOURCED,
    [
        Phase("موج ۱ — انقلاب صنعتی (بریتانیا)", 1771, 1829),
        Phase("موج ۲ — عصر بخار و راه‌آهن (بریتانیا)", 1829, 1875),
        Phase("موج ۳ — فولاد، برق و مهندسی سنگین (آمریکا/آلمان)", 1875, 1908),
        Phase("موج ۴ — نفت، خودرو و تولید انبوه (آمریکا)", 1908, 1971),
        Phase("موج ۵ — اطلاعات و ارتباطات: نصب/جهش", 1971, 1987),
        Phase("موج ۵ — نصب/شیدایی مالی", 1987, 2000),
        Phase("موج ۵ — نقطه چرخش", 2000, 2010,
              "پرز خودش این نقطه چرخش را کشیده و ناتمام توصیف کرده: "
              "ترکیدن حباب دات‌کام و بحران ۲۰۰۸."),
        Phase("موج ۵ — استقرار/هم‌افزایی", 2010, None,
              "پرز استدلال می‌کند این فاز به‌طور کامل فعال نشده چون بازآرایی "
              "نهادی لازم انجام نشده است."),
    ],
    caveat="سال‌های آغاز پنج موج (۱۷۷۱، ۱۸۲۹، ۱۸۷۵، ۱۹۰۸، ۱۹۷۱) صریحاً در کتاب "
           "پرز آمده. تفکیک فازهای درونی موج پنجم تفسیری است.")

# ===================================================================
# ژئوپلیتیک
# ===================================================================
DALIO_BIG_CYCLE = LongWave(
    "dalio_big", "چرخه بزرگ قدرت (دالیو)", "dalio", "حدود ۲۵۰ سال", Dating.ESTIMATED,
    [
        Phase("چرخه هلند — فلورین به‌عنوان ارز ذخیره", 1625, 1780),
        Phase("چرخه بریتانیا — پوند به‌عنوان ارز ذخیره", 1780, 1945),
        Phase("چرخه آمریکا — دلار به‌عنوان ارز ذخیره", 1945, None,
              "دالیو موضع می‌گیرد که این چرخه در مرحله نزولی است. "
              "این یک ادعای اوست، نه واقعیت اندازه‌گیری‌شده."),
    ],
    caveat="دوره‌بندی پس‌نگر با سه مشاهده. سه نقطه داده برای استنتاج «چرخه» کافی نیست.")

DALIO_INTERNAL_ORDER = LongWave(
    "dalio_internal", "چرخه نظم داخلی (دالیو) — شش مرحله", "dalio",
    "متغیر", Dating.ESTIMATED, [],
    caveat="شش مرحله: ۱) نظم نو و رهبری جدید ۲) ساخت نظام تخصیص منابع و "
           "دیوان‌سالاری ۳) صلح و رونق ۴) زیاده‌روی مالی، حباب بدهی و شکاف ثروت "
           "۵) وضعیت بد مالی و تشدید تعارض ۶) جنگ داخلی/انقلاب. "
           "دالیو آمریکا را در اواخر مرحله ۵ می‌داند — این تشخیص اوست، نه سنجه‌ای عینی.")

DALIO_POWERS = [
    "آموزش", "نوآوری و فناوری", "رقابت‌پذیری", "قدرت نظامی",
    "سهم از تجارت جهانی", "تولید اقتصادی", "مرکز مالی", "جایگاه ارز ذخیره",
]

DALIO_DEBT = LongWave(
    "dalio_debt", "چرخه بدهی بلندمدت (دالیو)", "dalio", "۵۰ تا ۷۵ سال",
    Dating.ESTIMATED, [],
    caveat="چرخه بدهی کوتاه‌مدت ۶ تا ۸ سال (تقریباً معادل ژوگلار) و چرخه بلندمدت "
           "۵۰ تا ۷۵ سال. دالیو معمولاً عدد ۷۵ سال را به‌کار می‌برد.")

HOWE_SAECULUM = LongWave(
    "howe", "ساکولوم و چهار چرخش (هاو)", "howe", "۸۰ تا ۱۰۰ سال", Dating.SOURCED,
    [
        Phase("چرخش اول — اوج (High)", 1946, 1964),
        Phase("چرخش دوم — بیداری (Awakening)", 1964, 1984),
        Phase("چرخش سوم — واگشایی (Unraveling)", 1984, 2008),
        Phase("چرخش چهارم — بحران (Crisis)", 2008, 2033,
              "هاو اوج بحران را حوالی ۲۰۳۰ و پایان آن را اوایل دهه ۲۰۳۰ "
              "پیش‌بینی می‌کند. این پیش‌بینی است، نه مشاهده."),
        Phase("چرخش اول ساکولوم بعدی (پیش‌بینی)", 2033, None),
    ],
    caveat="دوره‌بندی نسلی هاو در تاریخ‌نگاری دانشگاهی جدی گرفته نمی‌شود: "
           "مرزها پس از وقوع تعیین شده‌اند و چارچوب تقریباً ابطال‌ناپذیر است. "
           "به‌عنوان یک زبان توصیفی مفید است، نه تقویم پیش‌بینی.")

GOLDSTEIN = LongWave(
    "goldstein", "موج بلند و جنگ قدرت‌های بزرگ (گلدستاین)", "goldstein",
    "حدود ۵۰ سال", Dating.STANDARD, [],
    caveat="گلدستاین توالی «صعود موج بلند ← اوج شدت جنگ ← اوج قیمت‌ها ← نزول» را "
           "با داده‌های کمی از ۱۴۹۵ بررسی می‌کند. برخلاف کندراتیف کلاسیک، او "
           "جهت علیت را از جنگ به اقتصاد می‌داند، نه برعکس.")

KENNEDY = LongWave(
    "kennedy", "کشیدگی امپراتوری (کندی)", "kennedy", "بدون دوره ثابت",
    Dating.SOURCED, [],
    caveat="کندی چرخه با دوره ثابت ارائه نمی‌دهد. تز او ساختاری است: وقتی تعهدات "
           "نظامی و ژئوپلیتیک از پایه اقتصادی جلو بزند، افول آغاز می‌شود. "
           "به‌جای تاریخ، باید نسبت هزینه نظامی به تولید و بدهی را پایش کرد.")

REGISTRY = {w.key: w for w in [
    KONDRATIEFF, JUGLAR, KITCHIN, SCHUMPETER, PEREZ,
    DALIO_BIG_CYCLE, DALIO_INTERNAL_ORDER, DALIO_DEBT,
    HOWE_SAECULUM, GOLDSTEIN, KENNEDY,
]}


def snapshot(today: Optional[datetime.date] = None):
    """وضعیت جاری همه چرخه‌های دارای فاز تاریخ‌دار."""
    today = today or datetime.date.today()
    out = []
    for w in REGISTRY.values():
        if not w.phases:
            continue
        p = w.current_phase(today)
        out.append({
            "key": w.key, "title": w.title, "typical": w.typical_years,
            "phase": p.name if p else "خارج از بازه ثبت‌شده",
            "span": p.span if p else "—",
            "progress": w.progress(today),
            "dating": w.dating.value, "status": w.status.value,
            "source": "%s — %s (%d)" % (w.source.author, w.source.title, w.source.year),
            "caveat": w.caveat,
            "phase_note": p.note if p else "",
        })
    return out


def undated_frameworks():
    """چارچوب‌هایی که فاز تاریخ‌دار ندارند و باید با ورودی کاربر لنگر بگیرند."""
    return [{"key": w.key, "title": w.title, "typical": w.typical_years,
             "status": w.status.value, "caveat": w.caveat}
            for w in REGISTRY.values() if not w.phases]
