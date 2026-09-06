# -*- coding: utf-8 -*-
"""
Time_Analysis.xlsx — تحلیل ابعاد زمانی و چرخه‌ها.

شیت‌ها: Time_Cycles · Macro_Cycles · Forecast · Sources · Settings · Documentation

فایل سبک است: هیچ تاریخچه قیمتی در آن نیست. محاسبات سنگین (تحلیل طیفی،
فازبندی هرست، مدل رژیم، مونت‌کارلو) در پایتون انجام می‌شود و نتیجه اینجا
نوشته می‌شود:

    python -m timeframe export --workbook Time_Analysis.xlsx --data Stocks_Signals.xlsx
"""
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font
from openpyxl.workbook.defined_name import DefinedName

import build_workbook as B
import common as K
import sample_data as SD

from . import macro_time as MT
from common import FONT, hdr, note, title_block, widths

SHEET_ORDER = ["Real_Index", "Macro_Cycles", "Lead_Lag", "Cointegration",
               "Geo_Events", "Macro_Series", "Time_Cycles", "Forecast",
               "Sources", "Settings", "Documentation"]

TIME_DOC_EXTRA = [
    ("H2", "۹) اتصال این فایل به بقیه مجموعه"),
    ("P", "این فایل تاریخچه قیمت ندارد. موتور پایتون داده را از فایل سیگنال سهام "
          "می‌خواند، تحلیل می‌کند و نتیجه را اینجا می‌نویسد:"),
    ("C", "python -m timeframe export --workbook Time_Analysis.xlsx --data Stocks_Signals.xlsx"),
    ("P", "و امتیاز زمانی هر نماد در شیت Time_Link فایل سیگنال سهام نوشته می‌شود "
          "تا در امتیاز نهایی وارد شود (با وزن W_TIME که پیش‌فرضش صفر است)."),
    ("P", "چرا ارجاع بین‌فایلی اکسل به‌کار نرفت: فرمول ارجاع به فایل دیگر وقتی فایل "
          "مبدأ باز نباشد فقط مقدار کش‌شده را نشان می‌دهد، و با بازنویسی توسط "
          "openpyxl کاملاً از بین می‌رود. پل داده‌ای پایدارتر است."),
]


def _sources_sheet(wb):
    from timeframe.macro.sources import SOURCES
    ws = wb.create_sheet("Sources")
    ws.sheet_view.rightToLeft = True
    cols = ["نویسنده", "اثر", "سال", "حوزه", "جایگاه علمی", "یادداشت"]
    title_block(ws, "منابع لایه زمانی و روش‌شناسی",
                "هر چارچوب یک برچسب جایگاه دارد. تفکیک «دارای پشتوانه تجربی» از "
                "«چارچوب روایی» شرط خواندن درست خروجی است.", len(cols))
    widths(ws, [30, 54, 8, 16, 34, 88])
    hdr(ws, 3, cols, ["-", "-", "-", "-", "EMPIRICAL/DEBATED/HETERODOX/NARRATIVE", "-"])
    r = 5
    for s in sorted(SOURCES.values(), key=lambda x: (x.domain, x.year)):
        risky = ("روایی" in s.status.value) or ("خارج" in s.status.value)
        for j, v in enumerate([s.author, s.title, s.year, s.domain,
                               s.status.value, s.note], start=1):
            c = ws.cell(row=r, column=j, value=v)
            c.font = Font(name=FONT, size=8,
                          color="C00000" if (j == 5 and risky) else "000000")
            c.alignment = Alignment(horizontal="right" if j in (1, 2, 5, 6) else "center",
                                    vertical="center", wrap_text=True)
            c.border = K.BORDER
        ws.row_dimensions[r].height = 30
        r += 1
    note(ws, "A%d" % (r + 1),
         "فهرست کامل با  python -m timeframe sources  هم قابل دریافت است.")
    ws.merge_cells(start_row=r + 1, start_column=1, end_row=r + 1, end_column=len(cols))
    ws.freeze_panes = "A5"
    return ws


def _placeholder(wb, name, title, subtitle, cmd):
    ws = wb.create_sheet(name)
    ws.sheet_view.rightToLeft = True
    ws.sheet_view.showGridLines = False
    widths(ws, [110])
    title_block(ws, title, subtitle, 1)
    note(ws, "A4", "این شیت را اسکریپت پایتون می‌سازد. تا آن زمان خالی است.",
         size=10, bold=True, color="C00000")
    ws["A6"] = cmd
    ws["A6"].font = Font(name="Consolas", size=10)
    ws["A6"].alignment = Alignment(horizontal="left", vertical="center")
    return ws


def build(out_path, hist=None, **_kw):
    hist = hist or SD.build_history()
    symbols = [s[0] for s in SD.SYMBOLS]

    B.DEFINED.clear()
    B.COLREF.clear()
    wb = Workbook()
    wb.remove(wb.active)

    B.build_settings(wb, sections=("۱)", "۴)", "۷)", "۸)"))

    # --- لایه کلان: موضوع اصلی این فایل ---
    # پرسش این شیت‌ها درباره تک‌سهم نیست؛ درباره شاخص کل، دلار، طلا و
    # رابطه‌شان با هم و با رویدادهای ژئوپلیتیک است.
    MT.build_macro_series(wb)
    MT.build_real_index(wb)
    MT.build_macro_cycles(wb)
    MT.build_lead_lag(wb)
    MT.build_cointegration(wb)
    MT.build_geo_events(wb)

    # چرخه تک‌سهم هنوز هست ولی دیگر موضوع اصلی نیست
    B.build_time_cycles(wb, symbols, hist, standalone=True)
    _placeholder(wb, "Forecast", "چشم‌انداز احتمالاتی",
                 "مدل رژیم مارکوف، نرخ پایه تجربی، توزیع افت و دفتر پیش‌بینی",
                 "python -m timeframe export --workbook Time_Analysis.xlsx "
                 "--data Stocks_Signals.xlsx")
    _sources_sheet(wb)
    B.build_documentation(wb, scope="time", extra=TIME_DOC_EXTRA)

    for name, ref in B.DEFINED.items():
        wb.defined_names.add(DefinedName(name, attr_text=ref))
    order = {n: i for i, n in enumerate(SHEET_ORDER)}
    wb._sheets.sort(key=lambda s: order.get(s.title, 99))
    wb.active = 0
    wb.save(out_path)
    print("✓ %s — %d شیت" % (out_path, len(wb.sheetnames)))
    return out_path
