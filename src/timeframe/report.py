# -*- coding: utf-8 -*-
"""گزارش متنی خوانا از تحلیل زمانی."""
import datetime
from typing import Optional

from .analysis import SymbolTimeAnalysis
from .macro import context as macro_context
from .macro.sources import bibliography

LINE = "─" * 74


def symbol_report(a: SymbolTimeAnalysis) -> str:
    L = [LINE, "تحلیل زمانی — %s   (تا %s، %d کندل)" % (a.symbol, a.as_of, a.n_bars), LINE]

    L.append("\n[۱] کشف چرخه (تحلیل طیفی)")
    if a.cycles_found:
        for c in a.cycles_found:
            L.append("   دوره %-7.1f کندل | دامنه %-10.3g | نسبت به زمینه %-5.1f | "
                     "p تصحیح‌شده %-9.3g | %d تکرار | %s"
                     % (c.period, c.amplitude, c.amp_ratio, c.p_adjusted, c.segments,
                        "معنادار ✔" if c.significant else "معنادار نیست"))
        L.append("   (p با تصحیح Šidák بابت %d فرکانس مستقل آزمون‌شده)"
                 % (a.cycles_found[0].n_tests if a.cycles_found else 0))
    else:
        L.append("   چیزی یافت نشد.")

    L.append("\n[۲] فازبندی چرخه‌ها (هرست)")
    for s in a.nominal_states:
        mark = " ←غالب" if (a.dominant_state and
                            abs(s.period_bars - a.dominant_state.period_bars) < 1e-6) else ""
        L.append("   %-16s دوره %-6.0f | فاز %-22s | %s%s"
                 % (s.name, s.period_bars, s.phase_label, s.quality, mark))
        if s.edge_warning:
            L.append("      ⚠ " + s.edge_warning)

    L.append("\n[۳] FLD و VTL")
    if a.fld and a.fld.above is not None:
        L.append("   قیمت %s FLD چرخه %.0f کندلی%s"
                 % ("بالای" if a.fld.above else "زیر", a.fld.period_bars,
                    " | عبور %s، %d کندل قبل، هدف %.0f"
                    % ("صعودی" if a.fld.crossed_recently == "up" else "نزولی",
                       a.fld.bars_since_cross, a.fld.target or 0)
                    if a.fld.crossed_recently else ""))
    else:
        L.append("   محاسبه نشد.")
    if a.vtl_above is not None:
        L.append("   قیمت %s خط روند معتبر (VTL) چرخه بزرگ‌تر"
                 % ("بالای" if a.vtl_above else "زیر"))

    L.append("\n[۴] پنجره‌های زمانی پیش‌رو")
    if a.gann_active:
        L.append("   ● گن — فعال همین حالا:")
        for w in a.gann_active:
            L.append("      %s (%+d روز) %s" % (w.date, w.days_from_today, w.label))
    upcoming_g = [w for w in a.gann_windows if w not in a.gann_active][:5]
    if upcoming_g:
        L.append("   ● گن — پیش‌رو:")
        for w in upcoming_g:
            L.append("      %s (%+d روز) %s" % (w.date, w.days_from_today, w.label))
    if a.fib_active:
        L.append("   ● فیبوناچی — فعال:")
        for w in a.fib_active:
            L.append("      %s (%+d روز) %s" % (w.date, w.days_from_today, w.label))
    upcoming_f = [w for w in a.fib_windows if w not in a.fib_active][:3]
    if upcoming_f:
        L.append("   ● فیبوناچی — پیش‌رو:")
        for w in upcoming_f:
            L.append("      %s (%+d روز) %s" % (w.date, w.days_from_today, w.label))

    L.append("\n[۵] امتیاز زمانی")
    if a.score:
        L.append("   " + a.score.explain().replace("\n", "\n   "))
    for n in a.notes:
        L.append("\n   ⓘ " + n)
    return "\n".join(L)


def macro_report(asset_class: str = "iran_equity",
                 today: Optional[datetime.date] = None) -> str:
    c = macro_context.build(asset_class, today)
    L = [LINE, "زمینه کلان — %s   (%s)" % (c["asset_class"], c["date"]), LINE]
    L.append("\n" + c["why_not_signal"] + "\n")
    for w in c["long_waves"]:
        pr = ("%.0f%%" % (w["progress"] * 100)) if w["progress"] is not None else "پایان‌باز"
        L.append("● %s  (%s)" % (w["title"], w["typical"]))
        L.append("   فاز جاری: %s  [%s]  پیشرفت: %s" % (w["phase"], w["span"], pr))
        L.append("   منبع: %s | اطمینان تاریخ: %s" % (w["source"], w["dating"]))
        L.append("   جایگاه چارچوب: %s" % w["status"])
        if w["phase_note"]:
            L.append("   یادداشت: %s" % w["phase_note"])
        L.append("   احتیاط: %s" % w["caveat"])
        L.append("")
    if "iran_calendar" in c:
        cal = c["iran_calendar"]
        L.append(LINE)
        L.append("تقویم ساختاری بازار ایران — %s (%s) | فصل مالی %d"
                 % (cal["jalali"], cal["month_name"], cal["fiscal_quarter"]))
        L.append("⚠ این بخش از منابع کتاب‌شناختی بالا نمی‌آید؛ از ساختار نهادی بازار")
        L.append("  استخراج شده. رویدادها قطعی‌اند، اثرشان بر قیمت فرضیه است.")
        L.append("")
        for w in cal["windows"]:
            st = "فعال" if w["active"] else ("%s روز مانده" % w["days_to_next"])
            L.append("   [%-11s] %s" % (st, w["title"]))
            L.append("        متأثر: %s" % w["affected"])
            L.append("        فرضیه: %s" % w["hypothesis"])
        L.append("\n   محرک‌های ساختاری (بدون دوره ثابت):")
        for s in cal["structural"]:
            L.append("      • %s — %s" % (s["title"], s["typical"]))
            L.append("        %s" % s["evidence"])
    if "gold_notes" in c:
        L.append(LINE)
        L.append("طلا — یادداشت چرخه‌ای")
        for k, v in c["gold_notes"].items():
            L.append("   ● %s\n     %s" % (k, v))
    return "\n".join(L)


def sources_report() -> str:
    return LINE + "\nمنابع لایه زمانی\n" + LINE + "\n" + bibliography()
