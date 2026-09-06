# -*- coding: utf-8 -*-
"""
FX_Analysis.xlsx — تحلیل دلار و تتر.

شیت‌ها: FX_Dashboard · FX_Input · FX_History · Spreads · Settings · Documentation

منطق مرکزی: در ایران چند «نرخ دلار» همزمان وجود دارد و اختلافشان خودش
اطلاعات است. تتر عملاً یک دلار قابل‌معامله است، پس اختلاف تتر با دلار آزاد
هزینه/پریمیوم نقدشوندگی را نشان می‌دهد، نه نرخ متفاوت.
"""
import datetime
import random

from openpyxl import Workbook
from openpyxl.formatting.rule import CellIsRule, ColorScaleRule
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.workbook.defined_name import DefinedName

import build_workbook as B
import common as K
from common import (BORDER, F_DATE, F_NUM1, F_NUM2, F_PCT, F_PCT2, F_PRICE, FONT,
                    hdr, note, title_block, widths)
from . import asset_signals
from .assets_common import build_history_sheet, trend_block

SHEET_ORDER = ["FX_Dashboard", "Asset_Signals", "Spreads", "FX_Input",
               "FX_History", "Hist_USDT", "Hist_Nima",
               "Settings", "Documentation"]

FX_DOC = [
    ("H1", "راهنمای فایل تحلیل دلار و تتر"),
    ("W", "⚠️ داده‌های داخل فایل نمونه (DEMO) و ساختگی‌اند."),
    ("H2", "۱) چرا چند نرخ داریم و اختلافشان چه می‌گوید"),
    ("T", "دلار آزاد|نرخ بازار آزاد — مرجع قیمت‌گذاری دارایی‌ها"),
    ("T", "دلار نیمایی / مرجع|نرخ رسمی معاملات صادرات و واردات"),
    ("T", "تتر (USDT)|دلار دیجیتال قابل‌معامله — عملاً همان دلار آزاد با اصطکاک متفاوت"),
    ("P", "شکاف آزاد و نیمایی سنجه فشار ارزی و انتظارات تورمی است. باز شدن ناگهانی "
          "این شکاف معمولاً مقدم بر تعدیل نرخ رسمی بوده — ولی این یک مشاهده است، "
          "نه قاعده آزموده‌شده."),
    ("H2", "۲) پریمیوم تتر"),
    ("P", "تتر و دلار آزاد هر دو دلارند؛ اختلافشان نرخ متفاوت نیست، هزینه است: "
          "کارمزد صرافی، ریسک انتقال، و تقاضای لحظه‌ای نقدشوندگی. پریمیوم مثبت "
          "بزرگ یعنی تقاضای فوری برای خروج از ریال از مسیر دیجیتال."),
    ("T", "پریمیوم تتر|قیمت تتر (ریال) ÷ دلار آزاد − ۱"),
    ("P", "پریمیوم پایدارِ بالای چند درصد معمولاً یا محدودیت دسترسی به اسکناس را "
          "نشان می‌دهد یا فشار خروج سرمایه."),
    ("H2", "۳) نرخ ضمنی و سازگاری"),
    ("P", "شیت Spreads نرخ دلار ضمنی را از دو مسیر مستقل حساب می‌کند — از سکه و "
          "از تتر — و با نرخ اعلامی مقایسه می‌کند. واگرایی زیاد یعنی یکی از "
          "بازارها هنوز تعدیل نشده یا داده ورودی کهنه است."),
    ("H2", "۴) آنچه این فایل نمی‌کند"),
    ("L", "• نرخ ارز را پیش‌بینی نمی‌کند. جهش ارزی در ایران پله‌ای و وابسته به "
          "تصمیم سیاستی است؛ دوره‌ای‌کردن آن خطای روش‌شناختی است."),
    ("L", "• برای تحلیل چرخه‌ای روی سری نرخ، از موتور زمانی استفاده کنید: "
          "python -m timeframe symbol --csv usd.csv --name دلار"),
    ("L", "• هیچ‌کدام از آستانه‌های این فایل بک‌تست نشده‌اند."),
]


def _sample_history(n=500, base=950_000.0, drift=0.0011, vol=0.009, seed=31):
    rng = random.Random(seed)
    d = datetime.date(2026, 9, 3)
    days = []
    while len(days) < n:
        if d.weekday() not in (3, 4):
            days.append(d)
        d -= datetime.timedelta(days=1)
    days.reverse()
    p, out = base, []
    for dd in days:
        step = rng.gauss(drift, vol)
        if rng.random() < 0.015:            # جهش پله‌ای، نه پیوسته
            step += rng.choice([1, -1]) * rng.uniform(0.02, 0.05)
        p *= 1 + step
        hi, lo = p * (1 + abs(rng.gauss(0, 0.003))), p * (1 - abs(rng.gauss(0, 0.003)))
        out.append((dd, round(p), round(hi), round(lo), 0))
    return out


def _input_sheet(wb):
    ws = wb.create_sheet("FX_Input")
    ws.sheet_view.rightToLeft = True
    title_block(ws, "ورودی‌های لحظه‌ای ارز",
                "سلول‌های زرد را پر کنید. همه محاسبات فایل از همین اعداد می‌آیند.", 4)
    widths(ws, [40, 22, 48, 3])
    rows = [
        ("S", "نرخ‌های ریالی", None, None, None),
        ("P", "دلار آزاد (ریال)", 950_000.0, "FX_FREE", "نرخ بازار آزاد"),
        ("P", "دلار نیمایی / مرجع (ریال)", 720_000.0, "FX_NIMA", "نرخ رسمی معاملات"),
        ("P", "تتر USDT (ریال)", 968_000.0, "FX_USDT", "میانگین صرافی‌های داخلی"),
        ("P", "یورو آزاد (ریال)", 1_030_000.0, "FX_EUR", "اختیاری"),
        ("P", "درهم امارات (ریال)", 259_000.0, "FX_AED", "اختیاری — مسیر رایج انتقال"),
        ("B", None, None, None, None),
        ("S", "بازار جهانی", None, None, None),
        ("P", "USDT/USD جهانی", 1.0003, "USDT_GLOBAL", "معمولاً بسیار نزدیک ۱"),
        ("P", "شاخص دلار DXY", 98.5, "DXY", "برای زمینه — نه محاسبه ریالی"),
        ("P", "اونس طلا (دلار)", 3400.0, "FX_GOLD_OZ", "برای نرخ ضمنی از سکه"),
        ("B", None, None, None, None),
        ("S", "بازار داخلی طلا (برای نرخ ضمنی)", None, None, None),
        ("P", "سکه تمام بهار آزادی (ریال)", 900_000_000.0, "FX_COIN", "قیمت بازار"),
        ("P", "حباب فرضی سکه", 0.18, "FX_COIN_BUBBLE", "برای پاک‌کردن اثر حباب"),
        ("B", None, None, None, None),
        ("S", "مبنای مقایسه", None, None, None),
        ("P", "دلار آزاد در تاریخ مبنا (ریال)", 600_000.0, "FX_FREE_0", ""),
        ("P", "تتر در تاریخ مبنا (ریال)", 612_000.0, "FX_USDT_0", ""),
    ]
    r = 4
    for kind, label, val, name, desc in rows:
        if kind == "B":
            r += 1
            continue
        if kind == "S":
            ws.cell(row=r, column=1, value=label)
            for c in (1, 2, 3):
                cell = ws.cell(row=r, column=c)
                cell.fill = PatternFill("solid", fgColor=K.C_SECTION_BG)
                cell.font = Font(name=FONT, bold=True, size=10, color="FFFFFF")
                cell.alignment = Alignment(horizontal="right", vertical="center")
            ws.row_dimensions[r].height = 20
            r += 1
            continue
        ws.cell(row=r, column=1, value=label).font = Font(name=FONT, size=9)
        ws.cell(row=r, column=1).alignment = Alignment(horizontal="right", vertical="center")
        c = ws.cell(row=r, column=2, value=val)
        c.font = Font(name=FONT, size=10, bold=True, color=K.C_BLUE_INPUT)
        c.fill = PatternFill("solid", fgColor=K.C_INPUT_BG)
        c.alignment = Alignment(horizontal="center", vertical="center")
        c.border = BORDER
        c.number_format = (F_PCT if name == "FX_COIN_BUBBLE"
                           else F_NUM2 if (val and val < 1e4) else '#,##0')
        ws.cell(row=r, column=3, value=desc).font = Font(
            name=FONT, size=8, italic=True, color=K.C_NOTE)
        ws.cell(row=r, column=3).alignment = Alignment(horizontal="right", vertical="center")
        B.dn(name, "FX_Input", "$B$%d" % r)
        r += 1
    note(ws, "A%d" % (r + 1),
         "⚠️ اعداد بالا نمونه‌اند. نرخ واقعی روز را جایگزین کنید.",
         color="C00000", bold=True, size=9)
    ws.merge_cells(start_row=r + 1, start_column=1, end_row=r + 1, end_column=3)
    ws.freeze_panes = "A4"
    return ws


def _spreads_sheet(wb):
    ws = wb.create_sheet("Spreads")
    ws.sheet_view.rightToLeft = True
    cols = ["سنجه", "مقدار", "تفسیر"]
    title_block(ws, "شکاف‌ها، پریمیوم و نرخ ضمنی",
                "اختلاف نرخ‌ها خودش اطلاعات است — نه خطای اندازه‌گیری.", len(cols))
    widths(ws, [40, 22, 70])
    hdr(ws, 3, cols, ["-", "محاسبه", "-"])

    rows = [
        ("شکاف دلار آزاد و نیمایی", '=IFERROR(FX_FREE/FX_NIMA-1,"")', F_PCT,
         '=IF($B{r}="","",IF($B{r}>=0.5,"شکاف بسیار زیاد — فشار ارزی شدید",'
         'IF($B{r}>=0.25,"شکاف زیاد",IF($B{r}>=0.1,"شکاف متعارف","شکاف کم"))))'),
        ("پریمیوم تتر نسبت به دلار آزاد", '=IFERROR(FX_USDT/FX_FREE-1,"")', F_PCT,
         '=IF($B{r}="","",IF($B{r}>=0.04,"تقاضای فوری خروج از ریال",'
         'IF($B{r}>=0.015,"پریمیوم بالاتر از عادی",'
         'IF($B{r}<=-0.01,"تخفیف تتر — نادر","پریمیوم عادی"))))'),
        ("پریمیوم تتر تعدیل‌شده با USDT جهانی",
         '=IFERROR(FX_USDT/(FX_FREE*USDT_GLOBAL)-1,"")', F_PCT,
         '=IF($B{r}="","","انحراف تتر جهانی از ۱ هم لحاظ شده")'),
        ("نرخ دلار ضمنی از تتر", '=IFERROR(FX_USDT/USDT_GLOBAL,"")', '#,##0',
         '=IF($B{r}="","","اگر با دلار آزاد فاصله زیاد دارد، یکی از دو بازار عقب است")'),
        ("نرخ دلار ضمنی از سکه",
         '=IFERROR(FX_COIN/(1+FX_COIN_BUBBLE)/({d}*(FX_GOLD_OZ/{g})),"")'
         .format(d=8.133 * 0.9, g=31.1034768), '#,##0',
         '=IF($B{r}="","","با فرض حباب واردشده؛ به فرض حباب بسیار حساس است")'),
        ("واگرایی ضمنی سکه با دلار آزاد",
         '=IFERROR($B{prev}/FX_FREE-1,"")', F_PCT,
         '=IF($B{r}="","",IF(ABS($B{r})>=0.08,"واگرایی معنادار — یکی از بازارها تعدیل نشده",'
         '"سازگار"))'),
        ("نرخ برابری یورو به دلار (ضمنی)", '=IFERROR(FX_EUR/FX_FREE,"")', F_NUM2,
         '=IF($B{r}="","","با نرخ جهانی یورو مقایسه کنید")'),
        ("نرخ برابری درهم به دلار (ضمنی)", '=IFERROR(FX_AED/FX_FREE,"")', '0.0000',
         '=IF($B{r}="","","نرخ رسمی درهم حدود ۰٫۲۷۲۳ است")'),
        ("بازده دلار آزاد از مبنا", '=IFERROR(FX_FREE/FX_FREE_0-1,"")', F_PCT, ""),
        ("بازده تتر از مبنا", '=IFERROR(FX_USDT/FX_USDT_0-1,"")', F_PCT, ""),
        ("تغییر پریمیوم تتر از مبنا",
         '=IFERROR((FX_USDT/FX_FREE)/(FX_USDT_0/FX_FREE_0)-1,"")', F_PCT,
         '=IF($B{r}="","",IF($B{r}>0,"پریمیوم باز شده — فشار بیشتر",'
         '"پریمیوم بسته شده"))'),
    ]
    r = 5
    prev_implied = None
    for lbl, f, fmt, interp in rows:
        ws.cell(row=r, column=1, value=lbl).font = Font(name=FONT, size=9)
        ws.cell(row=r, column=1).alignment = Alignment(horizontal="right", vertical="center")
        if "{prev}" in f:
            f = f.format(prev=prev_implied)
        c = ws.cell(row=r, column=2, value=f)
        c.font = Font(name=FONT, size=10, bold=True, color=K.C_GREEN_LINK)
        c.number_format = fmt
        c.alignment = Alignment(horizontal="center", vertical="center")
        c.border = BORDER
        if interp:
            ic = ws.cell(row=r, column=3, value=interp.format(r=r))
            ic.font = Font(name=FONT, size=8, color="404040")
            ic.alignment = Alignment(horizontal="right", vertical="center", wrap_text=True)
            ic.border = BORDER
        if lbl == "نرخ دلار ضمنی از سکه":
            prev_implied = r
        r += 1
    B.dn("USDT_PREMIUM", "Spreads", "$B$6")
    B.dn("FX_GAP", "Spreads", "$B$5")
    ws.conditional_formatting.add("B5", ColorScaleRule(
        start_type="num", start_value=0, start_color=K.C_SBUY_BG,
        mid_type="num", mid_value=0.25, mid_color="FFFFFF",
        end_type="num", end_value=0.6, end_color=K.C_SSELL_BG))
    ws.conditional_formatting.add("B6", ColorScaleRule(
        start_type="num", start_value=-0.01, start_color=K.C_SBUY_BG,
        mid_type="num", mid_value=0.015, mid_color="FFFFFF",
        end_type="num", end_value=0.06, end_color=K.C_SSELL_BG))
    note(ws, "A%d" % (r + 1),
         "تتر و دلار آزاد هر دو دلارند. اختلافشان نرخ متفاوت نیست — هزینه است: "
         "کارمزد، ریسک انتقال و تقاضای لحظه‌ای نقدشوندگی.")
    ws.merge_cells(start_row=r + 1, start_column=1, end_row=r + 1, end_column=3)
    ws.freeze_panes = "A5"
    return ws


def _dashboard(wb, usd_last, usdt_last):
    ws = wb.create_sheet("FX_Dashboard", 0)
    ws.sheet_view.rightToLeft = True
    ws.sheet_view.showGridLines = False
    widths(ws, [34, 22, 4, 34, 22])
    title_block(ws, "داشبورد دلار و تتر",
                "⚠️ داده‌های نمونه‌اند. ورودی‌ها را در شیت FX_Input به‌روز کنید.", 5)
    ws["A2"].font = Font(name=FONT, size=9, bold=True, italic=True, color="C00000")

    def section(row, text, c2=5):
        ws.cell(row=row, column=1, value=text)
        for c in range(1, c2 + 1):
            cell = ws.cell(row=row, column=c)
            cell.fill = PatternFill("solid", fgColor=K.C_SECTION_BG)
            cell.font = Font(name=FONT, bold=True, size=11, color="FFFFFF")
            cell.alignment = Alignment(horizontal="right", vertical="center")
        ws.row_dimensions[row].height = 22

    def kpi(row, col, label, formula, fmt=None, big=False):
        ws.cell(row=row, column=col, value=label).font = Font(name=FONT, size=9)
        ws.cell(row=row, column=col).alignment = Alignment(
            horizontal="right", vertical="center")
        c = ws.cell(row=row, column=col + 1, value=formula)
        c.font = Font(name=FONT, size=12 if big else 10, bold=True, color=K.C_GREEN_LINK)
        c.alignment = Alignment(horizontal="center", vertical="center")
        c.border = BORDER
        if fmt:
            c.number_format = fmt
        return c

    section(4, "۱) نرخ‌ها و شکاف‌ها")
    kpi(5, 1, "دلار آزاد (ریال)", "=FX_FREE", '#,##0', big=True)
    kpi(6, 1, "دلار نیمایی (ریال)", "=FX_NIMA", '#,##0')
    kpi(7, 1, "تتر USDT (ریال)", "=FX_USDT", '#,##0')
    kpi(8, 1, "شکاف آزاد و نیمایی", "=FX_GAP", F_PCT)
    kpi(9, 1, "پریمیوم تتر", "=USDT_PREMIUM", F_PCT, big=True)
    ws.conditional_formatting.add("B9", ColorScaleRule(
        start_type="num", start_value=-0.01, start_color=K.C_SBUY_BG,
        mid_type="num", mid_value=0.015, mid_color="FFFFFF",
        end_type="num", end_value=0.06, end_color=K.C_SSELL_BG))

    kpi(5, 4, "نرخ ضمنی از تتر", "=Spreads!$B$8", '#,##0')
    kpi(6, 4, "نرخ ضمنی از سکه", "=Spreads!$B$9", '#,##0')
    kpi(7, 4, "واگرایی ضمنی سکه", "=Spreads!$B$10", F_PCT)
    kpi(8, 4, "بازده دلار از مبنا", "=Spreads!$B$13", F_PCT)
    kpi(9, 4, "تغییر پریمیوم از مبنا", "=Spreads!$B$15", F_PCT)

    section(11, "۲) روند دلار آزاد (از شیت FX_History)")
    lbl_row, score_row = trend_block(ws, "FX_History", usd_last, 12, "دلار")

    r = score_row + 3
    section(r, "۳) نکته‌ای که باید بدانید")
    r += 1
    for txt in [
        "جهش ارزی در ایران پله‌ای است، نه پیوسته — و به تصمیم سیاستی و شوک بیرونی "
        "وابسته است، نه به یک چرخه تکرارشونده.",
        "بنابراین این فایل نرخ را پیش‌بینی نمی‌کند. کاری که می‌کند این است: "
        "وضعیت جاری، شکاف‌ها و سازگاری بازارها را شفاف نشان می‌دهد.",
        "برای تحلیل چرخه‌ای روی سری نرخ:  python -m timeframe symbol --csv usd.csv --name دلار",
    ]:
        note(ws, "A%d" % r, txt, size=9, color="404040")
        ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=5)
        r += 1
    ws.freeze_panes = "A4"
    return ws


def build(out_path, **_kw):
    B.DEFINED.clear()
    B.COLREF.clear()
    wb = Workbook()
    wb.remove(wb.active)

    B.build_settings(wb, sections=("۱)", "۲)", "۵)", "۸)", "۹)"))
    _input_sheet(wb)
    _spreads_sheet(wb)
    usd_rows = _sample_history()
    _, usd_last = build_history_sheet(
        wb, "FX_History", "تاریخچه روزانه دلار آزاد",
        "ستون‌های A تا F ورودی؛ بقیه فرمول. ستون P (شکاف با نیمایی) را پایتون پر می‌کند.",
        usd_rows, valuation_label="شکاف با نیمایی")
    build_history_sheet(
        wb, "Hist_USDT", "تاریخچه روزانه تتر",
        "با  python scripts/fetch_gold_fx.py --history  پر می‌شود.",
        _sample_history(base=968_000.0, seed=53),
        valuation_label="پریمیوم نسبت به دلار آزاد")
    build_history_sheet(
        wb, "Hist_Nima", "تاریخچه روزانه دلار نیمایی",
        "با  python scripts/fetch_gold_fx.py --history  پر می‌شود.",
        _sample_history(base=718_000.0, drift=0.0009, vol=0.004, seed=57))
    asset_signals.build(
        wb,
        [("دلار آزاد", "FX_History"),
         ("تتر USDT", "Hist_USDT"),
         ("دلار نیمایی", "Hist_Nima")],
        "سیگنال دلار و تتر",
        "سنجه ارزش‌گذاری دلار آزاد، شکاف آن با نیمایی است؛ و برای تتر، پریمیوم "
        "نسبت به دلار آزاد. هر دو میانگین‌بازگرد‌اند: صدک بالا یعنی شکاف/پریمیوم "
        "تاریخی گشاد است و احتمال بسته‌شدنش بیشتر — نه اینکه حتماً بسته می‌شود.")
    _dashboard(wb, usd_last, usd_last)
    B.build_documentation(wb, scope="minimal", extra=FX_DOC)

    for name, ref in B.DEFINED.items():
        wb.defined_names.add(DefinedName(name, attr_text=ref))
    order = {n: i for i, n in enumerate(SHEET_ORDER)}
    wb._sheets.sort(key=lambda s: order.get(s.title, 99))
    wb.active = 0
    wb.save(out_path)
    print("✓ %s — %d شیت" % (out_path, len(wb.sheetnames)))
    return out_path
