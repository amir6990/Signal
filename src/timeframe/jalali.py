# -*- coding: utf-8 -*-
"""تبدیل دوسویه تاریخ میلادی و شمسی (الگوریتم استاندارد، بدون کتابخانه)."""
import datetime

_G_DM = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
JMONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
           "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"]


def _is_gleap(y):
    return (y % 4 == 0 and y % 100 != 0) or (y % 400 == 0)


def gregorian_to_jalali(gy, gm, gd):
    gy2, gm2, gd2 = gy - 1600, gm - 1, gd - 1
    g_day_no = 365 * gy2 + (gy2 + 3) // 4 - (gy2 + 99) // 100 + (gy2 + 399) // 400
    g_day_no += _G_DM[gm2] + gd2
    if gm > 2 and _is_gleap(gy):
        g_day_no += 1
    j_day_no = g_day_no - 79
    j_np = j_day_no // 12053
    j_day_no %= 12053
    jy = 979 + 33 * j_np + 4 * (j_day_no // 1461)
    j_day_no %= 1461
    if j_day_no >= 366:
        jy += (j_day_no - 1) // 365
        j_day_no = (j_day_no - 1) % 365
    for i in range(11):
        md = 31 if i < 6 else 30
        if j_day_no < md:
            break
        j_day_no -= md
    else:
        i = 11
    return jy, i + 1, j_day_no + 1


def jalali_to_gregorian(jy, jm, jd):
    jy2 = jy - 979
    jm2, jd2 = jm - 1, jd - 1
    j_day_no = 365 * jy2 + (jy2 // 33) * 8 + ((jy2 % 33) + 3) // 4
    j_day_no += sum(31 if i < 6 else 30 for i in range(jm2)) + jd2
    g_day_no = j_day_no + 79
    gy = 1600 + 400 * (g_day_no // 146097)
    g_day_no %= 146097
    leap = True
    if g_day_no >= 36525:
        g_day_no -= 1
        gy += 100 * (g_day_no // 36524)
        g_day_no %= 36524
        if g_day_no >= 365:
            g_day_no += 1
        else:
            leap = False
    gy += 4 * (g_day_no // 1461)
    g_day_no %= 1461
    if g_day_no >= 366:
        leap = False
        g_day_no -= 1
        gy += g_day_no // 365
        g_day_no %= 365
    months = [31, 29 if leap else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    gm = 0
    while gm < 12 and g_day_no >= months[gm]:
        g_day_no -= months[gm]
        gm += 1
    return gy, gm + 1, g_day_no + 1


def to_jalali_date(d: datetime.date):
    return gregorian_to_jalali(d.year, d.month, d.day)


def to_gregorian_date(jy, jm, jd) -> datetime.date:
    return datetime.date(*jalali_to_gregorian(jy, jm, jd))


def jalali_str(d: datetime.date) -> str:
    return "%04d/%02d/%02d" % to_jalali_date(d)


def jalali_month_name(d: datetime.date) -> str:
    return JMONTHS[to_jalali_date(d)[1] - 1]
