# -*- coding: utf-8 -*-
"""
تست‌های موتور زمانی. اجرا:  python3 tests/test_timeframe.py

فلسفه این تست‌ها: مهم‌ترین چیزی که باید اثبات شود، «پیدا کردن چرخه» نیست —
«پیدا نکردنِ چرخه وقتی چرخه‌ای وجود ندارد» است. یک آشکارساز چرخه که روی نویز
هم چرخه می‌بیند، بدتر از نداشتن آشکارساز است.
"""
import datetime
import math
import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))

from timeframe import elliott, fib_time, filters, gann, hurst, scoring, series, spectral
from timeframe.config import SpectralConfig
from timeframe.jalali import to_gregorian_date, to_jalali_date
from timeframe.macro import gold, iran, long_waves

FAILS = []


def check(name, cond, detail=""):
    status = "✔" if cond else "✘"
    if not cond:
        FAILS.append(name)
    print("  %s %s%s" % (status, name, ("  — " + detail) if detail else ""))


def section(t):
    print("\n" + t)
    print("─" * 70)


# ------------------------------------------------------------------ 1
def test_spectral_recovery():
    section("۱) بازیابی چرخه معلوم")
    for period in (25, 40, 60, 120):
        ts = series.synthetic("s", 900, [(period, 10, 0.3)], noise=1.5, trend=0.04)
        c = spectral.dominant_cycle(ts.closes)
        ok = c is not None and abs(c.period - period) / period < 0.06
        check("چرخه %d بازیابی شد" % period, ok,
              "یافت: %s" % (round(c.period, 1) if c else "هیچ"))


def test_spectral_two_cycles():
    section("۲) دو چرخه همزمان")
    ts = series.synthetic("s", 1000, [(80, 12, 0.0), (25, 5, 1.2)], noise=1.5)
    found = [c.period for c in spectral.find_cycles(ts.closes, SpectralConfig(top_n=4))
             if c.significant]
    check("هر دو چرخه ۸۰ و ۲۵ یافت شدند",
          any(abs(p - 80) < 6 for p in found) and any(abs(p - 25) < 3 for p in found),
          "یافت: %s" % [round(p, 1) for p in found])


def test_noise_control():
    section("۳) کنترل منفی — نویز سفید نباید چرخه بدهد")
    bad = 0
    for seed in range(8):
        rng = random.Random(seed)
        bars = [series.Bar(datetime.date(2020, 1, 1) + datetime.timedelta(days=i),
                           100 + rng.gauss(0, 3)) for i in range(800)]
        if spectral.dominant_cycle(series.TimeSeries("n", bars).closes) is not None:
            bad += 1
    check("۸ سری نویز، صفر چرخه معنادار", bad == 0, "مثبت کاذب: %d" % bad)


def test_random_walk_control():
    section("۴) کنترل منفی — گشت تصادفی (خودهمبسته)")
    bad = 0
    for seed in range(8):
        rng = random.Random(500 + seed)
        p, bars = 100.0, []
        for i in range(800):
            p *= 1 + rng.gauss(0.0003, 0.02)
            bars.append(series.Bar(datetime.date(2020, 1, 1) + datetime.timedelta(days=i), p))
        if spectral.dominant_cycle(series.TimeSeries("rw", bars).closes) is not None:
            bad += 1
    check("۸ گشت تصادفی، صفر چرخه معنادار", bad == 0, "مثبت کاذب: %d" % bad)


def test_goertzel_matches_dft():
    section("۵) صحت Goertzel در برابر DFT مستقیم")
    rng = random.Random(1)
    y = [math.sin(2 * math.pi * i / 32) * 5 + rng.gauss(0, 0.5) for i in range(256)]
    amp, _ph, re, im = spectral.goertzel(y, 32)
    n = len(y)
    re2 = sum(v * math.cos(2 * math.pi * i / 32) for i, v in enumerate(y))
    im2 = -sum(v * math.sin(2 * math.pi * i / 32) for i, v in enumerate(y))
    amp2 = 2 * math.hypot(re2, im2) / n
    check("دامنه Goertzel با DFT مستقیم یکی است", abs(amp - amp2) < 1e-9,
          "%.10f در برابر %.10f" % (amp, amp2))


def test_filters():
    section("۶) فیلتر میان‌گذر و تشخیص کف")
    ts = series.synthetic("s", 600, [(40, 10, 0.0)], noise=0.5, trend=0.05)
    tr = filters.find_extrema(filters.bandpass(ts.closes, 40), 24, "trough")
    gaps = [tr[i + 1] - tr[i] for i in range(len(tr) - 1)]
    check("فاصله کف‌ها ≈ ۴۰", gaps and all(abs(g - 40) <= 2 for g in gaps),
          "فواصل: %s" % gaps[:6])
    check("حذف روند خطی", abs(sum(filters.linear_detrend([i * 2.0 for i in range(50)]))) < 1e-9)


def test_hurst():
    section("۷) هرست: دوره مشاهده‌شده، لبه، FLD")
    ts = series.synthetic("s", 900, [(60, 12, 0.0)], noise=1.5, trend=0.03)
    st = hurst.analyze_cycle(ts, 60)
    check("دوره مشاهده‌شده نزدیک ۶۰", abs(st.observed_period - 60) < 2,
          "%.2f" % st.observed_period)
    check("فاز در بازه ۰ تا ۱", 0 <= st.phase < 1, "%.3f" % st.phase)
    check("ناحیه کور گزارش شده و منطقی", 0 < st.edge_blind_bars < len(ts) / 2,
          "%d کندل" % st.edge_blind_bars)
    f = hurst.fld_signal(ts, 60)
    check("FLD محاسبه شد", f.above is not None)
    shift = 30
    check("FLD همان قیمت جابه‌جاشده است",
          abs(hurst.fld(ts.closes, 60)[-1] - ts.closes[-1 - shift]) < 1e-9)


def test_gann():
    section("۸) گن")
    anchor = datetime.date(2026, 5, 30)
    w = gann.time_counts(anchor, "کف")
    days = {(x.date - anchor).days for x in w if x.kind == "day_count"}
    check("شمارش‌های روزانه درست‌اند", {30, 45, 60, 90, 144, 180} <= days)
    ann = [x for x in w if x.kind == "anniversary" and "1 " in x.label]
    check("سالگرد یک‌ساله درست است", ann and ann[0].date == datetime.date(2027, 5, 30))
    sq = gann.squaring(1000, 2000, 1000)
    check("مربع‌شدن مقیاس ۱ را می‌یابد", abs(sq.natural_scale - 1.0) < 1e-9
          and sq.nearest_gann_scale == 1)
    act = gann.active_windows([(datetime.date(2026, 8, 6), "کف")], datetime.date(2026, 9, 5))
    check("پنجره ۳۰ روزه فعال تشخیص داده شد", any("30 روز" in a.label for a in act),
          "%d پنجره فعال" % len(act))


def test_fib():
    section("۹) فیبوناچی زمانی")
    sw = fib_time.Swing(datetime.date(2026, 1, 1), datetime.date(2026, 4, 11), "س")
    ws = fib_time.project(sw)
    d618 = [w for w in ws if "0.618" in w.label][0]
    check("پروجکشن ۰٫۶۱۸ درست است",
          d618.date == datetime.date(2026, 4, 11) + datetime.timedelta(days=round(100 * 0.618)),
          str(d618.date))


def test_elliott():
    section("۱۰) قواعد الیوت")
    P, D = elliott.Pivot, datetime.date
    good = [P("0", D(2025, 1, 10), 1000), P("1", D(2025, 3, 1), 1300),
            P("2", D(2025, 4, 1), 1115), P("3", D(2025, 8, 1), 1800),
            P("4", D(2025, 9, 15), 1540), P("5", D(2026, 1, 20), 2100)]
    check("ایمپالس معتبر پذیرفته شد", elliott.validate(good).valid)
    r2 = list(good); r2[2] = P("2", D(2025, 4, 1), 950)
    check("نقض قاعده ۱ گرفته شد", "قاعده ۱" in " ".join(elliott.validate(r2).violations))
    r3 = list(good); r3[3] = P("3", D(2025, 8, 1), 1380); r3[4] = P("4", D(2025, 9, 15), 1330)
    check("نقض قاعده ۲ گرفته شد", "قاعده ۲" in " ".join(elliott.validate(r3).violations))
    r4 = list(good); r4[4] = P("4", D(2025, 9, 15), 1250)
    check("نقض قاعده ۳ گرفته شد", "قاعده ۳" in " ".join(elliott.validate(r4).violations))
    abc = [P("0", D(2026, 1, 20), 2100), P("A", D(2026, 3, 1), 1700),
           P("B", D(2026, 4, 10), 1900), P("C", D(2026, 6, 15), 1480)]
    check("ABC معتبر پذیرفته شد", elliott.validate(abc).valid)


def test_jalali():
    section("۱۱) تقویم شمسی")
    check("۱ فروردین ۱۴۰۳", to_jalali_date(datetime.date(2024, 3, 20)) == (1403, 1, 1))
    d, bad = datetime.date(2015, 1, 1), 0
    for _ in range(4000):
        if to_gregorian_date(*to_jalali_date(d)) != d:
            bad += 1
        d += datetime.timedelta(days=1)
    check("رفت‌وبرگشت ۴۰۰۰ روزه بدون خطا", bad == 0, "خطا: %d" % bad)


def test_gold():
    section("۱۲) طلا")
    b = gold.breakdown(3400, 950_000, 900_000_000)
    manual = 8.133 * 0.9 * (3400 / 31.1034768) * 950_000
    check("ارزش ذاتی با حساب دستی یکی است", abs(b.intrinsic_rial - manual) < 1)
    check("حباب درست محاسبه شد", abs(b.bubble_pct - (900_000_000 / manual - 1)) < 1e-12)
    d = gold.decompose_return(2600, 3400, 600_000, 950_000, 500_000_000, 900_000_000)
    check("تفکیک بازده به کل بازمی‌گردد",
          abs(d["کنترل ترکیبی"] - d["بازده کل ریالی"]) < 1e-9)


def test_macro():
    section("۱۳) رجیستری کلان")
    snap = long_waves.snapshot(datetime.date(2026, 9, 5))
    check("چرخه‌های تاریخ‌دار فاز جاری دارند", len(snap) >= 4, "%d چرخه" % len(snap))
    howe = [s for s in snap if s["key"] == "howe"][0]
    check("هاو در چرخش چهارم است", "بحران" in howe["phase"], howe["phase"])
    perez = [s for s in snap if s["key"] == "perez"][0]
    check("پرز در فاز استقرار موج ۵ است", "موج ۵" in perez["phase"], perez["phase"])
    check("هر چرخه منبع دارد", all(s["source"] for s in snap))
    check("هر چرخه سطح اطمینان تاریخ دارد", all(s["dating"] for s in snap))
    check("چارچوب‌های بدون تاریخ جدا شده‌اند", len(long_waves.undated_frameworks()) >= 5)


def test_iran_calendar():
    section("۱۴) تقویم ایران")
    c = iran.calendar_context(datetime.date(2027, 1, 20))
    titles = {w["title"] for w in c["windows"] if w["active"]}
    check("ناترازی گاز در دی فعال است", "ناترازی گاز زمستان" in titles, str(titles))
    c2 = iran.calendar_context(datetime.date(2026, 8, 20))
    check("ناترازی گاز در مرداد فعال نیست",
          "ناترازی گاز زمستان" not in {w["title"] for w in c2["windows"] if w["active"]})
    check("فصل مالی درست است", iran.calendar_context(datetime.date(2026, 9, 5))["fiscal_quarter"] == 2)


def test_scoring():
    section("۱۵) امتیازدهی")
    ts = series.synthetic("s", 900, [(60, 12, 0.0)], noise=1.5)
    st = hurst.analyze_cycle(ts, 60)
    sc = scoring.compute(cycle=st, fld=hurst.fld_signal(ts, 60), cycle_validated=True)
    check("امتیاز در بازه مجاز است", -10 <= sc.total <= 10, "%.2f" % sc.total)
    empty = scoring.compute()
    check("نبود اجزا هشدار می‌دهد و صفر می‌شود",
          empty.total == 0 and len(empty.warnings) >= 1)
    unval = scoring.compute(cycle=st, fld=hurst.fld_signal(ts, 60), cycle_validated=False)
    check("چرخه تأییدنشده هشدار می‌دهد",
          any("آزمون معناداری" in w for w in unval.warnings))
    check("چرخه تأییدنشده اتکاپذیری را پایین می‌آورد",
          unval.reliability != "بالا", unval.reliability)


def main():
    for fn in (test_spectral_recovery, test_spectral_two_cycles, test_noise_control,
               test_random_walk_control, test_goertzel_matches_dft, test_filters,
               test_hurst, test_gann, test_fib, test_elliott, test_jalali,
               test_gold, test_macro, test_iran_calendar, test_scoring):
        fn()
    print("\n" + "═" * 70)
    if FAILS:
        print("✘ %d تست ناموفق: %s" % (len(FAILS), "، ".join(FAILS)))
        return 1
    print("✔ همه تست‌ها موفق.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
