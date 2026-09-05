# -*- coding: utf-8 -*-
"""
sample_data.py — تولید داده نمونه (DEMO) قابل بازتولید.

⚠️ هشدار صریح: این داده‌ها واقعی نیستند. سری‌های قیمتی و حقیقی/حقوقی با یک
مدل تصادفی بازتولیدپذیر (seed=1404) ساخته شده‌اند تا ساختار فایل، فرمول‌ها و
رنگ‌بندی قابل آزمون باشد. برای استفاده واقعی باید با scripts/tse_updater.py
از endpointهای tsetmc جایگزین شوند.
InsCode و ISIN نمادها هم «تأییدنشده» علامت خورده‌اند چون در محیط ساخت این فایل
دسترسی شبکه به cdn.tsetmc.com وجود نداشت.
"""
import random
import datetime

SEED = 1404
N_DAYS = 260          # حدود یک سال معاملاتی — برای MA200 کافی است
DAILY_CAP = 0.049     # سقف نوسان روزانه در تولید داده نمونه

# (نماد, نام شرکت, insCode, ISIN, صنعت, بازار, قیمت پایه, drift روزانه, نوسان, رفتار پول حقیقی)
SYMBOLS = [
    ("فولاد", "فولاد مباركه اصفهان",        "46348559193224090", "IRO1FOLD0001", "فلزات اساسي",              "بورس",    5_800,  0.0022, 0.017,  0.85),
    ("فملي", "ملي صنايع مس ايران",          "35425587644337450", "IRO1MSMI0001", "فلزات اساسي",              "بورس",    7_400,  0.0015, 0.018,  0.55),
    ("شپنا", "پالايش نفت اصفهان",           "7745894403636165",  "IRO1PNES0001", "فرآورده‌هاي نفتي",          "بورس",    3_100,  0.0009, 0.021,  0.25),
    ("خودرو", "ايران خودرو",                "65883838195688438", "IRO1IKCO0001", "خودرو و ساخت قطعات",       "بورس",    2_450, -0.0026, 0.026, -0.85),
    ("وبملت", "بانك ملت",                   "778253364357513",   "IRO1BMLT0001", "بانكها و موسسات اعتباري",  "بورس",    4_900, -0.0012, 0.019, -0.45),
    ("شستا", "سرمايه گذاري تامين اجتماعي",  "2400322364771558",  "IRO1TAMN0001", "چند رشته‌اي صنعتي",         "بورس",    1_450,  0.0001, 0.020,  0.05),
    ("اخابر", "مخابرات ايران",              "22811176775480091", "IRO1MKBT0001", "مخابرات",                  "بورس",    2_050, -0.0004, 0.015, -0.10),
    ("كگل",  "معدني و صنعتي گل گهر",        "35700344742885862", "IRO1GOLG0001", "استخراج كانه‌هاي فلزي",     "بورس",   11_200,  0.0028, 0.016,  0.95),
]

INDICES = [
    ("شاخص كل",        "32097828799138957", 2_150_000.0, 0.0013, 0.011),
    ("شاخص كل هم وزن", "67130298613737946",   720_000.0, 0.0018, 0.013),
]


def trading_days(n, end=datetime.date(2026, 9, 3)):
    """n روز کاری (شنبه تا چهارشنبه؛ پنجشنبه و جمعه تعطیل بازار ایران)."""
    days, d = [], end
    while len(days) < n:
        if d.weekday() not in (3, 4):   # 3=Thu, 4=Fri
            days.append(d)
        d -= datetime.timedelta(days=1)
    return list(reversed(days))


def _walk(rng, base, drift, vol, n, regime_shift=None):
    """گشت تصادفی با سقف نوسان روزانه و امکان تغییر رژیم در میانه دوره."""
    out, p = [], float(base)
    for i in range(n):
        d = drift
        if regime_shift and i >= regime_shift[0]:
            d = regime_shift[1]
        step = max(-DAILY_CAP, min(DAILY_CAP, rng.gauss(d, vol)))
        p *= (1.0 + step)
        out.append(p)
    return out


def build_history():
    """خروجی: dict[symbol] -> list of dict روزانه (قیمت + حقیقی/حقوقی)."""
    rng = random.Random(SEED)
    days = trading_days(N_DAYS)
    hist = {}
    for (sym, name, ins, isin, sector, flow, base, drift, vol, flow_bias) in SYMBOLS:
        # تغییر رژیم در ۶۰ روز پایانی تا نمونه‌ها هر پنج حالت سیگنال را پوشش دهند
        shift = (N_DAYS - 60, drift * rng.choice([2.0, 1.4, -1.6, 0.4]))
        closes = _walk(rng, base, drift, vol, N_DAYS, shift)
        rows, prev_close = [], closes[0] / (1.0 + drift)
        base_vol = rng.uniform(8e6, 9e7)
        for i, d in enumerate(days):
            close = round(closes[i])
            rng_day = abs(rng.gauss(0, vol)) + 0.004
            high = round(max(close, prev_close) * (1 + rng_day * 0.6))
            low = round(min(close, prev_close) * (1 - rng_day * 0.6))
            first = round(low + (high - low) * rng.random())
            last = round(low + (high - low) * rng.random())
            ret = (close - prev_close) / prev_close if prev_close else 0.0
            # حجم: پایه + واکنش به بازده روز + شوک‌های پراکنده
            vmul = 1.0 + 6.0 * abs(ret) + max(0.0, rng.gauss(0, 0.35))
            if rng.random() < 0.05:
                vmul *= rng.uniform(1.8, 3.4)
            volume = int(base_vol * vmul)
            value = int(volume * close)
            trades = max(120, int(volume / rng.uniform(9_000, 45_000)))
            # حقیقی/حقوقی: سهم خرید حقیقی تابع بازده روز + سوگیری نماد
            tilt = 0.5 + 0.10 * flow_bias + 4.0 * ret + rng.gauss(0, 0.05)
            tilt = max(0.20, min(0.80, tilt))
            buy_i = int(volume * tilt)
            sell_i = int(volume * max(0.20, min(0.80, 1 - tilt + rng.gauss(0, 0.04))))
            buy_n = volume - buy_i
            sell_n = volume - sell_i
            # تعداد کدها: خرید حقیقی متمرکزتر وقتی پول هوشمند وارد می‌شود
            conc = 1.0 - 0.35 * flow_bias * (1 if ret > 0 else -1)
            buy_ci = max(20, int(trades * rng.uniform(0.30, 0.55) * conc))
            sell_ci = max(20, int(trades * rng.uniform(0.30, 0.55) / max(0.5, conc)))
            rows.append(dict(
                symbol=sym, insCode=ins, date=d, close=close, last=last,
                first=first, high=high, low=low, yesterday=round(prev_close),
                volume=volume, value=value, trades=trades,
                buy_i=buy_i, sell_i=sell_i, buy_n=buy_n, sell_n=sell_n,
                buy_ci=buy_ci, sell_ci=sell_ci,
            ))
            prev_close = close
        hist[sym] = rows
    return hist


def build_index_history():
    rng = random.Random(SEED + 7)
    days = trading_days(N_DAYS)
    out = {}
    for (name, ins, base, drift, vol) in INDICES:
        vals = _walk(rng, base, drift, vol, N_DAYS, (N_DAYS - 60, drift * 0.3))
        out[name] = [dict(date=d, value=round(v, 2), insCode=ins)
                     for d, v in zip(days, vals)]
    return out
