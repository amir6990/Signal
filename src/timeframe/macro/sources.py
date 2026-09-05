# -*- coding: utf-8 -*-
"""
منابع کتاب‌شناختی لایه زمانی و سطح اعتبار هر چارچوب.

چرا این فایل وجود دارد: هر ادعای این پکیج باید بتواند بگوید از کجا آمده. اگر
عددی منبع ندارد، باید «تخمین» یا «ورودی کاربر» علامت بخورد. بدون این تفکیک،
یک چارچوب روایی و یک نتیجه آماری در خروجی کنار هم می‌نشینند و کاربر نمی‌تواند
تشخیص دهد به کدام چقدر اتکا کند.
"""
from dataclasses import dataclass
from enum import Enum


class Dating(Enum):
    """اطمینان به تاریخ‌ها."""
    SOURCED = "صریح در منبع"
    STANDARD = "دیتینگ استاندارد ادبیات موضوع (بین نویسندگان متفاوت است)"
    ESTIMATED = "تخمین — در منبع صریح نیامده"
    USER = "ورودی کاربر"


class Status(Enum):
    """جایگاه علمی خود چارچوب — مستقل از دقت تاریخ‌ها."""
    EMPIRICAL = "دارای پشتوانه تجربی متعارف"
    DEBATED = "در ادبیات تخصصی مطرح ولی مورد مناقشه"
    HETERODOX = "خارج از جریان اصلی؛ اجماع علمی ندارد"
    NARRATIVE = "چارچوب روایی/دوره‌بندی تاریخی، نه مدل آماری آزموده"


@dataclass(frozen=True)
class Source:
    key: str
    author: str
    title: str
    year: int
    domain: str
    status: Status
    note: str = ""


SOURCES = {s.key: s for s in [
    # ---------------- چرخه‌های بازار ----------------
    Source("hurst", "J.M. Hurst", "The Profit Magic of Stock Transaction Timing", 1970,
           "چرخه بازار", Status.HETERODOX,
           "مدل چرخه‌های اسمی و اصول هشت‌گانه. مبنای ریاضی روشن دارد ولی "
           "اعتبارسنجی مستقل و منتشرشده‌ای که سودآوری آن را تأیید کند در دست نیست."),
    Source("grafton", "Christopher Grafton", "Mastering Hurst Cycle Analysis", 2011,
           "چرخه بازار", Status.HETERODOX,
           "تدوین عملیاتی روش هرست: FLD، VTL و فازبندی."),
    Source("thienen", "Lars von Thienen",
           "Decoding the Hidden Market Rhythm — Part 1: Dynamic Cycles", 2011,
           "چرخه بازار", Status.HETERODOX,
           "تحلیل طیفی و آزمون معناداری چرخه. روش آماری آن (آزمون بارتلز) "
           "معتبر است؛ آنچه مورد مناقشه است، پایداری چرخه‌های یافته‌شده در آینده است."),
    Source("gann_commodities", "W.D. Gann", "How to Make Profits Trading in Commodities",
           1941, "چرخه بازار", Status.HETERODOX,
           "شمارش‌های زمانی و سالگردها. هیچ توجیه علّی برای اعداد ارائه نمی‌شود."),
    Source("gann_tunnel", "W.D. Gann", "The Tunnel Thru the Air", 1927,
           "چرخه بازار", Status.HETERODOX,
           "رمان با لایه رمزی چرخه‌های زمانی. منبع اولیه ادعاهای چرخه طبیعی گن."),
    Source("hyerczyk", "James A. Hyerczyk", "Pattern, Price & Time: Using Gann Theory",
           1998, "چرخه بازار", Status.HETERODOX,
           "منظم‌ترین تدوین نظریه گن برای استفاده عملی."),
    Source("frost_prechter", "A.J. Frost & Robert Prechter",
           "Elliott Wave Principle: Key to Market Behavior", 1978,
           "چرخه بازار", Status.HETERODOX,
           "سه قاعده سخت قابل آزمون‌اند؛ اما برچسب‌گذاری چندگانه است و همین، "
           "ابطال‌پذیری چارچوب را تضعیف می‌کند."),
    Source("prechter_pictures", "Robert Prechter",
           "Beautiful Pictures from the Gallery of Phinance", 2003,
           "چرخه بازار", Status.HETERODOX,
           "نسبت‌های فیبوناچی در ساختار قیمت و زمان."),

    # ---------------- چرخه‌های اقتصادی ----------------
    Source("juglar", "Clément Juglar",
           "Des crises commerciales et de leur retour périodique", 1862,
           "چرخه اقتصادی", Status.EMPIRICAL,
           "نخستین مستندسازی چرخه تجاری ۷ تا ۱۱ ساله. وجود چرخه تجاری در اقتصاد "
           "جریان اصلی پذیرفته است؛ دوره ثابت آن نه."),
    Source("schumpeter", "Joseph Schumpeter", "Business Cycles", 1939,
           "چرخه اقتصادی", Status.DEBATED,
           "طرح سه‌چرخه‌ای کیچین/ژوگلار/کندراتیف و تخریب خلاق. مفهوم تخریب خلاق "
           "پذیرفته‌شده است؛ طرح سه‌چرخه‌ای منظم نه."),
    Source("perez", "Carlota Perez", "Technological Revolutions and Financial Capital",
           2002, "چرخه اقتصادی", Status.DEBATED,
           "پارادایم‌های فناورانه-اقتصادی. تاریخ‌های آغاز پنج موج صریحاً در کتاب آمده."),
    Source("grinin", "Leonid Grinin, Andrey Korotayev, Arno Tausch",
           "Economic Cycles, Crises, and the Global Periphery", 2016,
           "چرخه اقتصادی", Status.DEBATED,
           "دیتینگ استاندارد امواج کندراتیف و پیوند آن با بحران‌های پیرامون."),

    # ---------------- ژئوپلیتیک ----------------
    Source("dalio", "Ray Dalio",
           "Principles for Dealing with the Changing World Order", 2021,
           "ژئوپلیتیک", Status.NARRATIVE,
           "چرخه بزرگ امپراتوری‌ها و هشت سنجه قدرت. دوره‌بندی پس‌نگر است و "
           "پیش‌بینی‌های آن آزمون بیرونی نشده‌اند."),
    Source("kennedy", "Paul Kennedy", "The Rise and Fall of the Great Powers", 1987,
           "ژئوپلیتیک", Status.DEBATED,
           "تز «کشیدگی امپراتوری»: نسبت پایه اقتصادی به تعهدات نظامی. "
           "تاریخ‌نگاری جدی است ولی چرخه با دوره ثابت ارائه نمی‌دهد."),
    Source("goldstein", "Joshua S. Goldstein",
           "Long Cycles: Prosperity and War in the Modern Age", 1988,
           "ژئوپلیتیک", Status.DEBATED,
           "پیوند موج بلند با شدت جنگ قدرت‌های بزرگ؛ داده‌های کمی از ۱۴۹۵ به بعد."),
    Source("howe", "Neil Howe", "The Fourth Turning Is Here", 2023,
           "ژئوپلیتیک", Status.NARRATIVE,
           "ساکولوم ۸۰ تا ۱۰۰ ساله و چهار چرخش نسلی. نقدهای جدی روش‌شناختی "
           "به آن وارد شده؛ به‌عنوان چارچوب روایی بخوانید، نه تقویم."),
]}


def bibliography(domain: str = "") -> str:
    rows = [s for s in SOURCES.values() if not domain or s.domain == domain]
    rows.sort(key=lambda s: (s.domain, s.year))
    out = []
    for s in rows:
        out.append("• %s (%d) — %s\n    حوزه: %s | جایگاه: %s\n    %s"
                   % (s.author, s.year, s.title, s.domain, s.status.value, s.note))
    return "\n".join(out)
