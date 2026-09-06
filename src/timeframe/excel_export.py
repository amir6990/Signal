# -*- coding: utf-8 -*-
"""
نوشتن خروجی موتور زمانی در فایل سیگنال.

دو کار انجام می‌شود:
  ۱. شیت Time_Cycles با نتایج محاسبه‌شده پایتون پر می‌شود (ستون‌های ورودی
     دستی دست‌نخورده می‌مانند).
  ۲. شیت Macro_Cycles ساخته/بازنویسی می‌شود: وضعیت چرخه‌های بلند، تقویم
     ساختاری ایران و یادداشت طلا.

توجه: openpyxl مقدار محاسبه‌شده فرمول‌ها را ذخیره نمی‌کند؛ پس از اجرا فایل را
در اکسل باز کنید تا محاسبه مجدد انجام شود.
"""
import datetime

from openpyxl import load_workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from . import analysis, series
from .config import TimeframeConfig
from .macro import context as macro_context
from .macro import iran as iran_mod
from .macro import long_waves as lw
from .macro.sources import SOURCES

FONT = "Arial"
HDR_BG = "1F3864"
SEC_BG = "2E5C8A"
CALC_FG = "008000"      # سبز = محاسبه‌شده توسط پایتون
WARN_BG = "FFF2CC"
K_BLUE = "0000FF"
THIN = Side(style="thin", color="BFBFBF")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)


def _hdr(ws, row, labels, widths=None):
    for i, t in enumerate(labels, start=1):
        c = ws.cell(row=row, column=i, value=t)
        c.font = Font(name=FONT, bold=True, size=9, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor=HDR_BG)
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = BORDER
    ws.row_dimensions[row].height = 30
    if widths:
        for i, w in enumerate(widths, start=1):
            ws.column_dimensions[get_column_letter(i)].width = w


def _section(ws, row, text, ncol=8):
    ws.cell(row=row, column=1, value=text)
    for c in range(1, ncol + 1):
        cell = ws.cell(row=row, column=c)
        cell.fill = PatternFill("solid", fgColor=SEC_BG)
        cell.font = Font(name=FONT, bold=True, size=10, color="FFFFFF")
        cell.alignment = Alignment(horizontal="right", vertical="center")
    ws.row_dimensions[row].height = 20


def _text(ws, row, text, ncol=8, size=9, color="404040", bold=False, fill=None):
    c = ws.cell(row=row, column=1, value=text)
    c.font = Font(name=FONT, size=size, italic=not bold, bold=bold, color=color)
    c.alignment = Alignment(horizontal="right", vertical="center", wrap_text=True)
    if fill:
        for i in range(1, ncol + 1):
            ws.cell(row=row, column=i).fill = PatternFill("solid", fgColor=fill)
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=ncol)


# ------------------------------------------------------------------ Time_Cycles
# ستون‌های محاسباتی که پایتون در Time_Cycles می‌نویسد (پس از ستون‌های موجود)
TC_PY_COLS = [
    ("دوره چرخه کشف‌شده (کندل)", 16),
    ("چرخه معنادار؟", 12),
    ("p تصحیح‌شده", 12),
    ("تعداد تکرار", 10),
    ("دوره مشاهده‌شده هرست", 16),
    ("فاز چرخه (٪)", 12),
    ("وضعیت فاز", 22),
    ("کیفیت چرخه", 24),
    ("کف بعدی (پروجکشن)", 16),
    ("سقف بعدی (پروجکشن)", 16),
    ("وضعیت FLD", 14),
    ("هدف FLD", 14),
    ("پنجره گن فعال", 12),
    ("پنجره فیبوناچی فعال", 14),
    ("امتیاز زمانی پایتون", 15),
    ("اتکاپذیری", 12),
    ("هشدارها", 60),
]
TC_FIRST_PY_COL = 30      # ستون AD — بعد از ستون‌های فرمولی موجود


def _write_time_cycles(wb, workbook_path, cfg, strict):
    if "Time_Cycles" not in wb.sheetnames:
        return 0
    ws = wb["Time_Cycles"]
    base = TC_FIRST_PY_COL
    for i, (lbl, w) in enumerate(TC_PY_COLS):
        c = ws.cell(row=3, column=base + i, value=lbl)
        c.font = Font(name=FONT, bold=True, size=9, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor=HDR_BG)
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = BORDER
        ws.cell(row=4, column=base + i, value="محاسبه پایتون").font = Font(
            name=FONT, size=8, italic=True, color=CALC_FG)
        ws.column_dimensions[get_column_letter(base + i)].width = w

    names = series.workbook_symbols(workbook_path)
    written = 0
    for i, name in enumerate(names):
        row = 5 + i
        ts = series.from_workbook(workbook_path, name)
        if len(ts) < 60:
            continue
        a = analysis.analyze(ts, cfg, strict_spectral=strict)
        d, st, f, sc = a.dominant, a.dominant_state, a.fld, a.score
        vals = [
            round(d.period, 1) if d else "—",
            "بله" if d else "خیر",
            round(d.p_adjusted, 5) if d else "—",
            d.segments if d else "—",
            round(st.observed_period, 1) if (st and st.observed_period) else "—",
            round((st.phase % 1.0) * 100, 1) if (st and st.phase is not None) else "—",
            st.phase_label if st else "—",
            st.quality if st else "—",
            st.next_trough_date if (st and st.next_trough_date) else "—",
            st.next_peak_date if (st and st.next_peak_date) else "—",
            ("بالای FLD" if f.above else "زیر FLD") if (f and f.above is not None) else "—",
            round(f.target, 0) if (f and f.target) else "—",
            len(a.gann_active),
            len(a.fib_active),
            round(sc.total, 2) if sc else 0.0,
            sc.reliability if sc else "—",
            " | ".join(sc.warnings) if (sc and sc.warnings) else "",
        ]
        for j, v in enumerate(vals):
            c = ws.cell(row=row, column=base + j, value=v)
            c.font = Font(name=FONT, size=8, color=CALC_FG)
            c.alignment = Alignment(horizontal="center", vertical="center",
                                    wrap_text=(j == len(vals) - 1))
            c.border = BORDER
            if isinstance(v, datetime.date):
                c.number_format = "yyyy-mm-dd"
        written += 1
    return written


# ------------------------------------------------------------------ Macro_Cycles
def _write_macro(wb, today):
    if "Macro_Cycles" in wb.sheetnames:
        del wb["Macro_Cycles"]
    ws = wb.create_sheet("Macro_Cycles")
    ws.sheet_view.rightToLeft = True
    ws.sheet_view.showGridLines = False

    ws["A1"] = "چرخه‌های بلند اقتصادی، ژئوپلیتیک و ساختاری"
    ws["A1"].font = Font(name=FONT, bold=True, size=15, color="FFFFFF")
    ws["A1"].fill = PatternFill("solid", fgColor=HDR_BG)
    ws["A1"].alignment = Alignment(horizontal="center", vertical="center")
    ws.merge_cells("A1:H1")
    ws.row_dimensions[1].height = 28

    r = 2
    _text(ws, r, "این شیت «زمینه» است، نه سیگنال. وزن پیش‌فرض لایه کلان در امتیاز "
                 "نهایی صفر است. دلیل: هیچ‌کدام از این چارچوب‌ها مدل آماری آزموده "
                 "نیستند و افق چندساله‌شان با تصمیم معاملاتی میان‌مدت هم‌مقیاس نیست.",
          size=9, bold=True, color="C00000", fill=WARN_BG)
    ws.row_dimensions[r].height = 32
    r += 2

    _section(ws, r, "۱) وضعیت جاری چرخه‌های بلند")
    r += 1
    _hdr(ws, r, ["چرخه", "طول متعارف", "فاز جاری", "بازه", "پیشرفت",
                 "اطمینان تاریخ", "جایگاه چارچوب", "منبع"],
         [30, 16, 34, 14, 10, 30, 34, 30])
    r += 1
    for row in lw.snapshot(today):
        vals = [row["title"], row["typical"], row["phase"], row["span"],
                ("%.0f%%" % (row["progress"] * 100)) if row["progress"] is not None else "پایان‌باز",
                row["dating"], row["status"], row["source"]]
        for j, v in enumerate(vals, start=1):
            c = ws.cell(row=r, column=j, value=v)
            c.font = Font(name=FONT, size=8,
                          color="C00000" if j == 7 and "روایی" in str(v) else "000000")
            c.alignment = Alignment(horizontal="right" if j in (1, 3, 6, 7, 8) else "center",
                                    vertical="center", wrap_text=True)
            c.border = BORDER
        ws.row_dimensions[r].height = 26
        r += 1
        _text(ws, r, "احتیاط: " + row["caveat"], size=8, color="7F6000")
        ws.row_dimensions[r].height = 24
        r += 1

    r += 1
    _section(ws, r, "۲) چارچوب‌های بدون تاریخ — نیازمند لنگر ورودی شما")
    r += 1
    _hdr(ws, r, ["چارچوب", "طول متعارف", "جایگاه", "توضیح"], [30, 22, 34, 90])
    r += 1
    for row in lw.undated_frameworks():
        for j, v in enumerate([row["title"], row["typical"], row["status"], row["caveat"]], start=1):
            c = ws.cell(row=r, column=j, value=v)
            c.font = Font(name=FONT, size=8)
            c.alignment = Alignment(horizontal="right", vertical="center", wrap_text=True)
            c.border = BORDER
        ws.row_dimensions[r].height = 30
        r += 1

    r += 1
    _section(ws, r, "۳) تقویم ساختاری بازار ایران — خارج از منابع کتاب‌شناختی")
    r += 1
    _text(ws, r, "⚠ هیچ‌یک از ۱۶ کتاب مرجع درباره بازار ایران چیزی نگفته است. "
                 "رویدادهای زیر از ساختار نهادی بازار استخراج شده‌اند: خودِ رویدادها "
                 "قطعی‌اند، اثرشان بر قیمت فرضیه است و بک‌تست نشده.",
          size=9, bold=True, color="C00000", fill=WARN_BG)
    ws.row_dimensions[r].height = 30
    r += 1
    _hdr(ws, r, ["پنجره", "وضعیت", "شروع", "پایان", "صنایع متأثر",
                 "فرضیه اثر", "قطعیت رویداد"], [30, 14, 13, 13, 34, 66, 30])
    r += 1
    for w in iran_mod.active_windows(today):
        span = w["span"] or (None, None)
        vals = [w["title"], "فعال" if w["active"] else "%s روز مانده" % w["days_to_next"],
                span[0], span[1], w["affected"], w["hypothesis"], w["confidence"]]
        for j, v in enumerate(vals, start=1):
            c = ws.cell(row=r, column=j, value=v)
            c.font = Font(name=FONT, size=8)
            c.alignment = Alignment(horizontal="right" if j in (1, 5, 6, 7) else "center",
                                    vertical="center", wrap_text=True)
            c.border = BORDER
            if isinstance(v, datetime.date):
                c.number_format = "yyyy-mm-dd"
            if j == 2 and w["active"]:
                c.fill = PatternFill("solid", fgColor="C6EFCE")
                c.font = Font(name=FONT, size=8, bold=True, color="006100")
        ws.row_dimensions[r].height = 34
        r += 1

    r += 1
    _section(ws, r, "۴) محرک‌های ساختاری بدون دوره ثابت")
    r += 1
    _hdr(ws, r, ["محرک", "دوره", "سازوکار", "وضعیت شواهد", "پایش کنید"],
         [24, 24, 70, 70, 40])
    r += 1
    for s in iran_mod.STRUCTURAL:
        for j, v in enumerate([s.title, s.typical, s.mechanism, s.evidence,
                               "، ".join(s.watch)], start=1):
            c = ws.cell(row=r, column=j, value=v)
            c.font = Font(name=FONT, size=8)
            c.alignment = Alignment(horizontal="right", vertical="center", wrap_text=True)
            c.border = BORDER
        ws.row_dimensions[r].height = 42
        r += 1

    r += 1
    _section(ws, r, "۵) مهلت‌های گزارشگری کدال")
    r += 1
    _hdr(ws, r, ["گزارش", "مهلت", "ماه انتشار"], [40, 40, 16])
    r += 1
    for title, deadline, month in iran_mod.CODAL_DEADLINES:
        for j, v in enumerate([title, deadline, month], start=1):
            c = ws.cell(row=r, column=j, value=v)
            c.font = Font(name=FONT, size=8)
            c.alignment = Alignment(horizontal="right", vertical="center")
            c.border = BORDER
        r += 1

    r += 1
    _section(ws, r, "۶) منابع و جایگاه علمی هر چارچوب")
    r += 1
    _hdr(ws, r, ["نویسنده", "اثر", "سال", "حوزه", "جایگاه", "یادداشت"],
         [30, 52, 8, 16, 34, 86])
    r += 1
    for s in sorted(SOURCES.values(), key=lambda x: (x.domain, x.year)):
        for j, v in enumerate([s.author, s.title, s.year, s.domain,
                               s.status.value, s.note], start=1):
            c = ws.cell(row=r, column=j, value=v)
            c.font = Font(name=FONT, size=8,
                          color="C00000" if j == 5 and ("روایی" in v or "خارج" in v) else "000000")
            c.alignment = Alignment(horizontal="right" if j in (1, 2, 5, 6) else "center",
                                    vertical="center", wrap_text=True)
            c.border = BORDER
        ws.row_dimensions[r].height = 30
        r += 1
    ws.freeze_panes = "A3"
    return ws


# ------------------------------------------------------------------ Forecast
def _write_forecast(wb, workbook_path, horizon=63, horizon_label="سه ماه"):
    """شیت Forecast: چشم‌انداز احتمالاتی هر نماد + دفتر پیش‌بینی قضاوتی."""
    from . import series as _series
    from .forecast import outlook as OL

    if "Forecast" in wb.sheetnames:
        del wb["Forecast"]
    ws = wb.create_sheet("Forecast")
    ws.sheet_view.rightToLeft = True
    ws.sheet_view.showGridLines = False

    ws["A1"] = "چشم‌انداز احتمالاتی — افق %s" % horizon_label
    ws["A1"].font = Font(name=FONT, bold=True, size=15, color="FFFFFF")
    ws["A1"].fill = PatternFill("solid", fgColor=HDR_BG)
    ws["A1"].alignment = Alignment(horizontal="center", vertical="center")
    ws.merge_cells("A1:N1")
    ws.row_dimensions[1].height = 28

    r = 2
    _text(ws, r, "این اعداد احتمال‌اند، نه پیش‌بینی. «۳۰٪» یعنی اگر صد بار در چنین "
                 "وضعیتی باشیم حدود سی بار رخ می‌دهد. هر رویداد با سه روش مستقل "
                 "برآورد شده؛ اختلاف زیاد بین روش‌ها یعنی نتیجه به فرض‌ها حساس است.",
          ncol=14, size=9, bold=True, color="C00000", fill=WARN_BG)
    ws.row_dimensions[r].height = 32
    r += 2

    _section(ws, r, "۱) برآورد احتمال به تفکیک نماد", 14)
    r += 1
    _hdr(ws, r, ["نماد", "کندل", "رژیم جاری", "احتمال رژیم پرتنش اکنون",
                 "ورود به رژیم پرتنش در افق", "بازده منفی — مدل",
                 "بازده منفی — نرخ پایه", "افت >۱۰٪ — مدل", "افت >۱۰٪ — نرخ پایه",
                 "بیشینه‌افت >۲۰٪ — مدل", "بیشینه‌افت >۲۰٪ — تجربی",
                 "بازده میانه شبیه‌سازی", "نمونه مستقل", "هشدار"],
         [11, 8, 12, 13, 14, 12, 13, 12, 13, 14, 14, 13, 11, 46])
    r += 1
    names = _series.workbook_symbols(workbook_path)
    for name in names:
        ts = _series.from_workbook(workbook_path, name)
        if len(ts) < 150:
            continue
        o = OL.build(ts, horizon, horizon_label)
        sim = o.sim or {}
        vals = [
            name, len(ts),
            ("پرتنش" if (o.p_stress_now or 0) > 0.5 else "آرام") if o.regime and o.regime.mu else "—",
            o.p_stress_now, o.p_enter_stress,
            sim.get("p_negative"), o.base.p_negative if o.base else None,
            sim.get("p_below_10"), o.base.p_below_10 if o.base else None,
            sim.get("p_dd_20"),
            (o.dd.p_exceed.get(0.20) if o.dd else None),
            sim.get("median_return"),
            round(o.base.n_effective, 0) if o.base else None,
            " | ".join(o.warnings),
        ]
        for j, v in enumerate(vals, start=1):
            c = ws.cell(row=r, column=j, value=v)
            c.font = Font(name=FONT, size=8, color=CALC_FG if j > 3 else "000000")
            c.alignment = Alignment(horizontal="center", vertical="center",
                                    wrap_text=(j == 14))
            c.border = BORDER
            if j in (4, 5, 6, 7, 8, 9, 10, 11, 12):
                c.number_format = "0%"
        ws.row_dimensions[r].height = 26
        r += 1

    r += 1
    _section(ws, r, "۲) دفتر پیش‌بینی قضاوتی — روش تتلاک", 14)
    r += 1
    _text(ws, r, "رویداد سیاسی از داده قیمت قابل استخراج نیست. تتلاک با ردیابی "
                 "۲۸ هزار پیش‌بینی نشان داد دقت کارشناسان سیاسی به‌سختی از حدس "
                 "تصادفی بهتر است. آنچه دقت را بالا می‌برد: نرخ پایه، احتمال عددی "
                 "صریح، به‌روزرسانی مکرر و سنجش کالیبراسیون. ستون‌های زیر را "
                 "خودتان پر کنید و با scripts زیر امتیاز بریرتان را بگیرید.",
          ncol=14, size=9, color="404040")
    ws.row_dimensions[r].height = 44
    r += 1
    _hdr(ws, r, ["شناسه", "سؤال", "معیار حل‌شدن (الزامی)", "دسته", "مهلت",
                 "نرخ پایه", "پیش‌بینی شما", "تاریخ برآورد", "دلیل",
                 "حل شد؟", "نتیجه (۰/۱)"],
         [18, 40, 66, 12, 13, 10, 12, 13, 34, 10, 12])
    r += 1
    from .forecast.judgment import TEMPLATES
    for t in TEMPLATES:
        vals = [t["qid"], t["text"], t["resolution_criteria"], t["category"],
                "", "", "", "", "", "خیر", ""]
        for j, v in enumerate(vals, start=1):
            c = ws.cell(row=r, column=j, value=v)
            c.font = Font(name=FONT, size=8,
                          color=K_BLUE if j in (5, 6, 7, 8, 9, 10, 11) else "000000")
            c.alignment = Alignment(horizontal="right" if j in (2, 3, 9) else "center",
                                    vertical="center", wrap_text=True)
            c.border = BORDER
            if j in (5, 6, 7, 8, 9, 10, 11):
                c.fill = PatternFill("solid", fgColor=WARN_BG)
        ws.row_dimensions[r].height = 46
        r += 1
    r += 1
    _text(ws, r, "قاعده سخت: سؤالی که معیار حل‌شدن روشن ندارد، پیش‌بینی نیست — یک "
                 "نظر است. «بازار بد می‌شود» قابل سنجش نیست؛ «شاخص کل تا تاریخ X "
                 "بیش از ۱۵٪ زیر سقف ۲۵۲ روزه‌اش بسته می‌شود» قابل سنجش است.",
          ncol=14, size=9, bold=True, color="C00000", fill=WARN_BG)
    ws.row_dimensions[r].height = 30
    ws.freeze_panes = "A3"
    return ws


def _write_time_link(data_path, cfg, strict):
    """نوشتن امتیاز زمانی هر نماد در شیت Time_Link فایل سیگنال سهام."""
    from . import series as _series
    wb = load_workbook(data_path)
    if "Time_Link" not in wb.sheetnames:
        wb.close()
        return 0
    ws = wb["Time_Link"]
    scores = {}
    for name in _series.workbook_symbols(data_path):
        ts = _series.from_workbook(data_path, name)
        if len(ts) < 60:
            continue
        a = analysis.analyze(ts, cfg, strict_spectral=strict)
        scores[name] = (round(a.score.total, 2) if a.score else 0.0,
                        a.score.reliability if a.score else "—",
                        "بله" if a.dominant else "خیر")
    today = datetime.date.today()
    n = 0
    r = 5
    while r <= ws.max_row:
        sym = ws.cell(row=r, column=1).value
        r += 1
    for i, name in enumerate(_series.workbook_symbols(data_path)):
        row = 5 + i
        if name not in scores:
            continue
        total, rel, sig = scores[name]
        ws.cell(row=row, column=2, value=total).number_format = "0.0"
        ws.cell(row=row, column=3, value=rel)
        ws.cell(row=row, column=4, value=sig)
        ws.cell(row=row, column=5, value=today).number_format = "yyyy-mm-dd"
        ws.cell(row=row, column=6, value="timeframe.analysis")
        n += 1
    wb.save(data_path)
    return n


def export(workbook_path: str, strict: bool = False,
           today: datetime.date = None, cfg: TimeframeConfig = None,
           data_path: str = None) -> int:
    """workbook_path: فایل مقصد (نوشتن نتایج). data_path: فایل منبع داده قیمت.

    اگر data_path داده نشود، همان فایل مقصد منبع داده هم فرض می‌شود — یعنی
    حالت فایل یکپارچه قدیمی.
    """
    cfg = cfg or TimeframeConfig()
    today = today or datetime.date.today()
    data_path = data_path or workbook_path
    wb = load_workbook(workbook_path)
    n = _write_time_cycles(wb, data_path, cfg, strict)
    _write_macro(wb, today)
    _write_forecast(wb, data_path)
    wb.save(workbook_path)
    linked = 0
    if data_path != workbook_path:
        linked = _write_time_link(data_path, cfg, strict)
    print("✓ Time_Cycles برای %d نماد به‌روز شد." % n)
    print("✓ شیت Macro_Cycles ساخته شد.")
    print("✓ شیت Forecast ساخته شد.")
    if linked:
        print("✓ امتیاز زمانی %d نماد در Time_Link فایل %s نوشته شد."
              % (linked, data_path))
    print("توجه: فایل را در اکسل باز کنید تا فرمول‌ها دوباره محاسبه شوند.")
    return 0
