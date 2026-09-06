# -*- coding: utf-8 -*-
"""
build_workbook.py — سازنده فایل «سیستم سیگنال‌دهی بازار سرمایه ایران».

اجرا:  python3 src/build_workbook.py [مسیر_خروجی.xlsx]

این اسکریپت کل فایل اکسل را از صفر می‌سازد؛ یعنی ساختار فایل نسخه‌بندی‌شده و
قابل بازتولید است. برای تغییر ساختار، این فایل را ویرایش و دوباره اجرا کنید.
"""
import sys
import os
import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter, column_index_from_string
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.worksheet.table import Table, TableStyleInfo
from openpyxl.formatting.rule import CellIsRule, FormulaRule, ColorScaleRule, DataBarRule
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.comments import Comment

import common as K
from common import (FONT, hdr, title_block, widths, style_data, note, jalali_str,
                    F_INT, F_PRICE, F_PCT, F_PCT2, F_NUM1, F_NUM2, F_X, F_DATE,
                    F_MRIAL, F_BRIAL, BORDER)
import sample_data as SD

BUILD_DATE = datetime.date(2026, 9, 5)
DEMO_BANNER = ("⚠️ داده‌های این فایل نمونه (DEMO) و ساختگی‌اند — واقعی نیستند. "
               "برای استفاده واقعی با scripts/tse_updater.py از tsetmc جایگزین کنید.")

DEFINED = {}          # name -> "Sheet!$C$5"


def dn(name, sheet, cell):
    DEFINED[name] = "%s!%s" % (sheet, cell)
    return name


# =====================================================================
# 1) Settings
# =====================================================================
SETTINGS_ROWS = [
    ("S", "۱) پارامترهای میانگین متحرک و نوسان", None, None, None),
    ("P", "دوره میانگین متحرک کوتاه", 20, "MA_SHORT", "روزهای معاملاتی"),
    ("P", "دوره میانگین متحرک میان‌مدت", 50, "MA_MED", "ستون فقرات تشخیص روند میان‌مدت"),
    ("P", "دوره میانگین متحرک بلند ۱", 100, "MA_LONG1", ""),
    ("P", "دوره میانگین متحرک بلند ۲", 200, "MA_LONG2", "مرز روند بلندمدت"),
    ("P", "دوره ATR", 14, "ATR_PER", "برای حد ضرر و نرمال‌سازی نوسان"),
    ("P", "ضریب حد ضرر بر مبنای ATR", 2.0, "ATR_STOP_MULT", "حد ضرر = قیمت − ضریب × ATR"),
    ("B", None, None, None, None),
    ("S", "۲) آستانه‌های حجم معاملات (نسبت به میانگین ۲۰ روزه)", None, None, None),
    ("P", "حجم مشکوک — بسیار بالا", 2.0, "VOL_HIGH", "≥ ۲ برابر میانگین ۲۰ روزه"),
    ("P", "حجم بالاتر از عادی", 1.3, "VOL_MOD", ""),
    ("P", "حجم خشک (بی‌رمقی)", 0.6, "VOL_DRY", "سیگنال را تضعیف می‌کند"),
    ("B", None, None, None, None),
    ("S", "۳) آستانه‌های پول هوشمند (حقیقی)", None, None, None),
    ("P", "نسبت قدرت خریدار — قوی", 1.50, "SM_STRONG", "سرانه خرید حقیقی ÷ سرانه فروش حقیقی"),
    ("P", "نسبت قدرت خریدار — متوسط", 1.15, "SM_MOD", ""),
    ("P", "نسبت قدرت فروشنده — متوسط", 0.85, "SM_WEAK", ""),
    ("P", "نسبت قدرت فروشنده — قوی", 0.65, "SM_BAD", ""),
    ("P", "خالص ورود پول حقیقی قوی (٪ ارزش معاملات)", 0.20, "NF_STRONG", "نرمال‌شده، نه ریال خام"),
    ("P", "خالص ورود پول حقیقی متوسط (٪ ارزش معاملات)", 0.05, "NF_MOD", ""),
    ("B", None, None, None, None),
    ("S", "۴) وزن معیارها — جمع باید دقیقاً ۱۰۰٪ شود", None, None, None),
    ("P", "وزن روند قیمتی سهم", 0.35, "W_TREND", ""),
    ("P", "وزن جریان پول هوشمند", 0.30, "W_SMART", ""),
    ("P", "وزن وضعیت میانگین‌های متحرک", 0.15, "W_MA", ""),
    ("P", "وزن حجم معاملات", 0.10, "W_VOL", ""),
    ("P", "وزن روند کل بازار (شاخص)", 0.10, "W_MARKET", ""),
    ("P", "وزن لایه زمانی (Hurst/Gann/Fib/Elliott)", 0.00, "W_TIME", "پیش‌فرض صفر — ساختار آماده، غیرفعال"),
    ("F", "جمع وزن‌ها", None, "W_SUM", "باید ۱۰۰٪ باشد"),
    ("B", None, None, None, None),
    ("S", "۵) آستانه سیگنال (امتیاز کل از −۱۰ تا +۱۰)", None, None, None),
    ("P", "حد «خرید قوی» (≥)", 5.0, "TH_SBUY", ""),
    ("P", "حد «خرید» (≥)", 2.0, "TH_BUY", ""),
    ("P", "حد «فروش» (≤)", -2.0, "TH_SELL", ""),
    ("P", "حد «فروش قوی» (≤)", -5.0, "TH_SSELL", ""),
    ("B", None, None, None, None),
    ("S", "۶) پارامترهای بخش آپشن", None, None, None),
    ("P", "نرخ بدون ریسک سالانه", 0.30, "OPT_RF", "برای قیمت‌گذاری بلک-شولز"),
    ("P", "نوسان فرضی سالانه دارایی پایه", 0.55, "OPT_VOL", "مبنای مقایسه گران/ارزان بودن قرارداد"),
    ("P", "حداقل روز تا سررسید", 7, "OPT_MIN_DTE", "کمتر از این، سیگنال معتبر نیست"),
    ("P", "حداقل حجم معاملات روزانه قرارداد", 100, "OPT_MIN_VOL", "فیلتر نقدشوندگی"),
    ("P", "بازه ATM (± نسبت به قیمت اعمال)", 0.03, "OPT_ATM_BAND", ""),
    ("P", "تعداد روز معاملاتی در سال", 245, "TRADING_DAYS_Y", ""),
    ("B", None, None, None, None),
    ("S", "۷) لایه زمانی — چرخه‌های اسمی (فعلاً غیرفعال)", None, None, None),
    ("P", "چرخه اسمی ۱ (روز معاملاتی)", 20, "CYC_1", "مدل چرخه‌های اسمی هرست"),
    ("P", "چرخه اسمی ۲", 40, "CYC_2", ""),
    ("P", "چرخه اسمی ۳ (چرخه اصلی)", 80, "CYC_3", ""),
    ("P", "چرخه اسمی ۴", 160, "CYC_4", ""),
    ("P", "پنجره تحمل زمانی (± روز)", 3, "TIME_TOL", "برای تطبیق تاریخ‌های Gann/Fibonacci"),
    ("B", None, None, None, None),
    ("S", "۹) وزن سیگنال دارایی‌های تک‌سری (طلا، سکه، دلار، تتر)", None, None, None),
    ("P", "وزن روند", 0.35, "AW_TREND", "قیمت نسبت به سه میانگین متحرک"),
    ("P", "وزن مومنتوم", 0.25, "AW_MOM", "بازده ۵ و ۲۰ و ۶۰ روزه"),
    ("P", "وزن نوسان", 0.15, "AW_VOL", "نوسان جاری نسبت به میانه تاریخی"),
    ("P", "وزن ارزش‌گذاری", 0.25, "AW_VAL", "صدک تاریخی حباب یا پریمیوم"),
    ("F", "جمع وزن‌های دارایی", None, "AW_SUM", "بر همین تقسیم می‌شود"),
    ("B", None, None, None, None),
    ("S", "۸) سایر", None, None, None),
    ("P", "پنجره ساختار روند کوتاه (سقف/کف)", 20, "STRUCT_S", "برای تشخیص Higher High / Lower Low"),
    ("P", "پنجره ساختار روند بلند (سقف/کف)", 60, "STRUCT_L", "روند میان‌مدت"),
    ("P", "دامنه نوسان روزانه بازار", 0.07, "PRICE_BAND", "⚠️ مقدار جاری را تأیید کنید"),
    ("P", "حداقل ارزش معاملات روزانه معتبر (میلیارد ریال)", 50, "MIN_LIQ_B", "زیر این حد، سیگنال «کم‌اعتبار» علامت می‌خورد"),
]


# قالب عددی هر پارامتر — صریح، نه حدس‌زده (نسبت‌ها با "x" و درصدها با "%")
_PCT_NAMES = {"W_TREND", "W_SMART", "W_MA", "W_VOL", "W_MARKET", "W_TIME",
              "NF_STRONG", "NF_MOD", "OPT_RF", "OPT_VOL", "OPT_ATM_BAND", "PRICE_BAND"}
_RATIO_NAMES = {"VOL_HIGH", "VOL_MOD", "VOL_DRY", "SM_STRONG", "SM_MOD", "SM_WEAK",
                "SM_BAD", "ATR_STOP_MULT"}


def _settings_fmt(name, val):
    if name in _PCT_NAMES:
        return F_PCT
    if name in _RATIO_NAMES:
        return F_X
    if isinstance(val, float):
        return F_NUM2
    return F_INT


def build_settings(wb, sections=None):
    """sections: پیشوند بخش‌های موردنیاز، مثل ("۱)", "۲)"). None = همه.

    هر فایل فقط پارامترهای خودش را می‌گیرد؛ پارامتری که هیچ فرمولی در آن فایل
    نمی‌خواندش، فقط سردرگمی می‌سازد.
    """
    ws = wb.create_sheet("Settings")
    ws.sheet_view.rightToLeft = True
    title_block(ws, "تنظیمات و پارامترهای سیستم",
                "هر عدد آبی‌رنگ قابل تغییر است؛ همه فرمول‌های فایل از همین سلول‌ها می‌خوانند.", 5)
    widths(ws, [3, 46, 14, 46, 3])
    r = 4
    wsum_row = None
    awsum_row = None
    keep = True
    for kind, label, val, name, desc in SETTINGS_ROWS:
        if kind == "S" and sections is not None:
            keep = any(str(label).startswith(pfx) for pfx in sections)
        if kind == "B":
            if keep:
                r += 1
            continue
        if not keep:
            continue
        if kind == "S":
            ws.cell(row=r, column=2, value=label)
            for c in (2, 3, 4):
                cell = ws.cell(row=r, column=c)
                cell.fill = PatternFill("solid", fgColor=K.C_SECTION_BG)
                cell.font = Font(name=FONT, bold=True, size=10, color="FFFFFF")
                cell.alignment = Alignment(horizontal="right", vertical="center")
            ws.row_dimensions[r].height = 20
            r += 1
            continue
        ws.cell(row=r, column=2, value=label).font = Font(name=FONT, size=9)
        ws.cell(row=r, column=2).alignment = Alignment(horizontal="right", vertical="center")
        c = ws.cell(row=r, column=3)
        if kind == "F":
            c.value = None      # پر می‌شود بعد از حلقه
            if name == "AW_SUM":
                awsum_row = r
            else:
                wsum_row = r
        else:
            c.value = val
            c.font = Font(name=FONT, size=10, bold=True, color=K.C_BLUE_INPUT)
            c.fill = PatternFill("solid", fgColor=K.C_INPUT_BG)
        c.alignment = Alignment(horizontal="center", vertical="center")
        c.border = BORDER
        c.number_format = _settings_fmt(name, val)
        ws.cell(row=r, column=4, value=desc).font = Font(name=FONT, size=8, italic=True, color=K.C_NOTE)
        ws.cell(row=r, column=4).alignment = Alignment(horizontal="right", vertical="center")
        if name:
            dn(name, "Settings", "$C$%d" % r)
        r += 1

    # جمع وزن‌های دارایی
    if awsum_row is not None and "AW_TREND" in DEFINED:
        a_first = int(DEFINED["AW_TREND"].split("$")[-1])
        a_last = int(DEFINED["AW_VAL"].split("$")[-1])
        c = ws.cell(row=awsum_row, column=3, value="=SUM(C%d:C%d)" % (a_first, a_last))
        c.number_format = F_PCT
        c.font = Font(name=FONT, size=10, bold=True)
        c.border = BORDER
        dn("AW_SUM", "Settings", "$C$%d" % awsum_row)
        ws.cell(row=awsum_row, column=4,
                value='=IF(ROUND(C%d,6)=1,"✔ وزن‌ها معتبر است",'
                      '"✘ خطا: جمع باید ۱۰۰٪ باشد")' % awsum_row).font = Font(
            name=FONT, size=9, bold=True)

    # جمع وزن‌ها + کنترل خطا (فقط اگر بخش وزن‌ها در این فایل هست)
    if wsum_row is None or "W_TREND" not in DEFINED:
        note(ws, "B%d" % (r + 1),
             "راهنمای رنگ: سلول زرد با متن آبی = ورودی قابل تغییر شما · "
             "متن مشکی = فرمول · متن سبز = ارجاع به شیت دیگر.")
        ws.merge_cells(start_row=r + 1, start_column=2, end_row=r + 1, end_column=4)
        ws.freeze_panes = "A4"
        return ws
    w_first = int(DEFINED["W_TREND"].split("$")[-1])
    w_last = int(DEFINED["W_TIME"].split("$")[-1])
    ws.cell(row=wsum_row, column=3, value="=SUM(C%d:C%d)" % (w_first, w_last))
    ws.cell(row=wsum_row, column=3).number_format = F_PCT
    ws.cell(row=wsum_row, column=3).font = Font(name=FONT, size=10, bold=True)
    ws.cell(row=wsum_row, column=3).border = BORDER
    dn("W_SUM", "Settings", "$C$%d" % wsum_row)
    ws.cell(row=wsum_row, column=4,
            value='=IF(ROUND(C%d,6)=1,"✔ وزن‌ها معتبر است","✘ خطا: جمع وزن‌ها باید ۱۰۰٪ باشد")' % wsum_row)
    ws.cell(row=wsum_row, column=4).font = Font(name=FONT, size=9, bold=True)
    ws.conditional_formatting.add("D%d" % wsum_row, FormulaRule(
        formula=['ISNUMBER(SEARCH("خطا",D%d))' % wsum_row],
        fill=PatternFill("solid", fgColor=K.C_SSELL_BG), font=Font(color="FFFFFF", bold=True)))

    note(ws, "B%d" % (r + 1), "راهنمای رنگ: سلول زرد با متن آبی = ورودی قابل تغییر شما · متن مشکی = فرمول · متن سبز = ارجاع به شیت دیگر.")
    ws.merge_cells(start_row=r + 1, start_column=2, end_row=r + 1, end_column=4)
    ws.freeze_panes = "A4"
    return ws


# =====================================================================
# 2) Watchlist
# =====================================================================
WL_COLS = [
    ("نماد", "lVal18AFC", 12, None),
    ("نام شرکت", "lVal30", 30, None),
    ("کد نماد (InsCode)", "insCode", 20, "@"),
    ("شناسه ISIN", "cIsin", 16, "@"),
    ("بازار", "flowTitle", 10, None),
    ("صنعت", "lSecVal", 24, None),
    ("کد تأیید شده؟", "-", 14, None),
    ("فعال در سیگنال‌گیری", "-", 16, None),
    ("یادداشت", "-", 34, None),
]


def build_watchlist(wb):
    ws = wb.create_sheet("Watchlist")
    ws.sheet_view.rightToLeft = True
    title_block(ws, "لیست نمادهای تحت نظر (Watchlist)",
                "منبع نهایی نمادها؛ شیت‌های Calculations و Signals از همین ترتیب پیروی می‌کنند.",
                len(WL_COLS))
    widths(ws, [c[2] for c in WL_COLS])
    hdr(ws, 3, [c[0] for c in WL_COLS], [c[1] for c in WL_COLS])
    r = 5
    for (sym, name, ins, isin, sector, flow, *_rest) in SD.SYMBOLS:
        ws.cell(row=r, column=1, value=sym)
        ws.cell(row=r, column=2, value=name)
        ws.cell(row=r, column=3, value=ins).number_format = "@"
        ws.cell(row=r, column=4, value=isin).number_format = "@"
        ws.cell(row=r, column=5, value=flow)
        ws.cell(row=r, column=6, value=sector)
        ws.cell(row=r, column=7, value="خیر")
        ws.cell(row=r, column=8, value="بله")
        ws.cell(row=r, column=9,
                value="InsCode/ISIN از حافظه درج شده و تأیید نشده — با GetInstrumentSearch اعتبارسنجی شود.")
        r += 1
    last = r - 1
    style_data(ws, 5, last, 1, len(WL_COLS), size=9)
    for rr in range(5, last + 1):
        ws.cell(row=rr, column=2).alignment = Alignment(horizontal="right", vertical="center")
        ws.cell(row=rr, column=6).alignment = Alignment(horizontal="right", vertical="center")
        ws.cell(row=rr, column=9).alignment = Alignment(horizontal="right", vertical="center")
        ws.cell(row=rr, column=9).font = Font(name=FONT, size=8, italic=True, color=K.C_NOTE)
        for cc in (1, 3, 4, 7, 8):
            ws.cell(row=rr, column=cc).fill = PatternFill("solid", fgColor=K.C_INPUT_BG)
            ws.cell(row=rr, column=cc).font = Font(name=FONT, size=9, color=K.C_BLUE_INPUT)

    dv = DataValidation(type="list", formula1='"بله,خیر"', allow_blank=True)
    ws.add_data_validation(dv)
    dv.add("G5:G%d" % (4 + N_SYM_ROWS))
    dv2 = DataValidation(type="list", formula1='"بله,خیر"', allow_blank=True)
    ws.add_data_validation(dv2)
    dv2.add("H5:H%d" % (4 + N_SYM_ROWS))

    ws.conditional_formatting.add("G5:G%d" % last, CellIsRule(
        operator="equal", formula=['"خیر"'],
        fill=PatternFill("solid", fgColor="FFE699"), font=Font(color="7F6000")))

    spare_last = 4 + N_SYM_ROWS
    for rr in range(last + 1, spare_last + 1):        # ردیف‌های ذخیره برای نمادهای جدید
        for cc in (1, 2, 3, 4, 5, 6, 7, 8):
            cell = ws.cell(row=rr, column=cc)
            cell.border = BORDER
            if cc in (1, 3, 4, 7, 8):
                cell.fill = PatternFill("solid", fgColor=K.C_INPUT_BG)
                cell.font = Font(name=FONT, size=9, color=K.C_BLUE_INPUT)
            if cc in (3, 4):
                cell.number_format = "@"
    note(ws, "A%d" % (spare_last + 2),
         "⚠️ کدهای InsCode و ISIN بالا تأییدنشده‌اند. اسکریپت tse_updater.py آن‌ها را با "
         "endpoint جستجوی نماد بررسی و در صورت مغایرت اصلاح می‌کند و ستون «کد تأیید شده؟» را «بله» می‌کند.")
    ws.merge_cells(start_row=spare_last + 2, start_column=1,
                   end_row=spare_last + 2, end_column=len(WL_COLS))
    note(ws, "A%d" % (spare_last + 3),
         "ردیف‌های زردرنگ خالی، ظرفیت آماده‌اند: نماد جدید را همین‌جا اضافه کنید — همه شیت‌های "
         "Calculations، Signals و Time_Cycles تا ردیف %d از قبل فرمول دارند و نیازی به کشیدن دستی نیست."
         % spare_last, size=9, color="404040")
    ws.merge_cells(start_row=spare_last + 3, start_column=1,
                   end_row=spare_last + 3, end_column=len(WL_COLS))
    ws.freeze_panes = "A5"
    dn("WL_SYM", "Watchlist", "$A$5:$A$%d" % (4 + N_SYM_ROWS))
    return ws, last


# =====================================================================
# 3) Data_Input  (فقط داده خام API — هیچ محاسبه‌ای اینجا نیست)
# =====================================================================
DI_COLS = [
    ("نماد", "lVal18AFC", 12, None),
    ("نام شرکت", "lVal30", 26, None),
    ("کد نماد", "insCode", 19, "@"),
    ("ISIN", "cIsin", 15, "@"),
    ("بازار", "flowTitle", 10, None),
    ("صنعت", "lSecVal", 22, None),
    ("وضعیت نماد", "cEtavalTitle", 12, None),
    ("زمان به‌روزرسانی", "hEven", 14, None),
    ("آخرین قیمت", "pDrCotVal", 12, F_PRICE),
    ("قیمت پایانی", "pClosing", 12, F_PRICE),
    ("قیمت دیروز", "priceYesterday", 12, F_PRICE),
    ("تغییر قیمت", "priceChange", 11, F_PRICE),
    ("درصد تغییر", "priceChangePercent", 11, F_PCT2),
    ("اولین قیمت", "firstPrice", 11, F_PRICE),
    ("بیشترین قیمت روز", "highValue", 13, F_PRICE),
    ("کمترین قیمت روز", "lowValue", 13, F_PRICE),
    ("حجم معاملات", "qTotTran5J", 15, F_INT),
    ("ارزش معاملات (ریال)", "qTotCap", 18, F_INT),
    ("تعداد معاملات", "zTotTran", 12, F_INT),
    ("ارزش بازار (ریال)", "marketvalue", 18, F_INT),
    ("تعداد سهام", "sharecount", 16, F_INT),
    ("حجم خرید حقیقی", "buy_I_Volume", 15, F_INT),
    ("حجم فروش حقیقی", "sell_I_Volume", 15, F_INT),
    ("تعداد خریدار حقیقی", "buy_CountI", 14, F_INT),
    ("تعداد فروشنده حقیقی", "sell_CountI", 14, F_INT),
    ("حجم خرید حقوقی", "buy_N_Volume", 15, F_INT),
    ("حجم فروش حقوقی", "sell_N_Volume", 15, F_INT),
    ("تعداد خریدار حقوقی", "buy_CountN", 13, F_INT),
    ("تعداد فروشنده حقوقی", "sell_CountN", 13, F_INT),
    ("بهترین قیمت خرید", "pMeDem_1", 13, F_PRICE),
    ("حجم بهترین خرید", "qTitMeDem_1", 14, F_INT),
    ("تعداد سفارش خرید", "zOrdMeDem_1", 13, F_INT),
    ("بهترین قیمت فروش", "pMeOf_1", 13, F_PRICE),
    ("حجم بهترین فروش", "qTitMeOf_1", 14, F_INT),
    ("تعداد سفارش فروش", "zOrdMeOf_1", 13, F_INT),
    ("EPS", "eps", 11, F_INT),
    ("یادداشت دستی", "-", 22, None),
]


def build_data_input(wb, hist):
    ws = wb.create_sheet("Data_Input")
    ws.sheet_view.rightToLeft = True
    title_block(ws, "ورود داده لحظه‌ای (Data_Input)",
                "قانون معماری: این شیت فقط داده خام API را نگه می‌دارد. هیچ فرمول تحلیلی اینجا نوشته نمی‌شود. "
                "ردیف خاکستری = نام دقیق فیلد JSON که اسکریپت پایتون روی آن می‌نویسد.",
                len(DI_COLS))
    widths(ws, [c[2] for c in DI_COLS])
    hdr(ws, 3, [c[0] for c in DI_COLS], [c[1] for c in DI_COLS])
    ws["A2"].font = Font(name=FONT, size=9, italic=True, bold=True, color="C00000")

    import random
    rng = random.Random(SD.SEED + 3)
    r = 5
    for (sym, name, ins, isin, sector, flow, *_rest) in SD.SYMBOLS:
        row = hist[sym][-1]
        spread = max(1, int(row["close"] * 0.002))
        vals = [sym, name, ins, isin, flow, sector, "مجاز", "12:30:00",
                row["last"], row["close"], row["yesterday"],
                row["close"] - row["yesterday"],
                (row["close"] - row["yesterday"]) / row["yesterday"],
                row["first"], row["high"], row["low"],
                row["volume"], row["value"], row["trades"],
                int(row["close"] * rng.uniform(2.5e10, 9e10) / 1000) * 1000,
                int(rng.uniform(2.5e10, 9e10)),
                row["buy_i"], row["sell_i"], row["buy_ci"], row["sell_ci"],
                row["buy_n"], row["sell_n"],
                max(1, int(row["buy_ci"] * 0.01)), max(1, int(row["sell_ci"] * 0.01)),
                row["close"] - spread, int(row["volume"] * rng.uniform(0.01, 0.06)),
                int(row["trades"] * rng.uniform(0.05, 0.2)),
                row["close"] + spread, int(row["volume"] * rng.uniform(0.01, 0.06)),
                int(row["trades"] * rng.uniform(0.05, 0.2)),
                int(row["close"] * rng.uniform(0.08, 0.35)), ""]
        for i, v in enumerate(vals):
            c = ws.cell(row=r, column=i + 1, value=v)
            if DI_COLS[i][3]:
                c.number_format = DI_COLS[i][3]
        r += 1
    last = r - 1
    style_data(ws, 5, last, 1, len(DI_COLS), size=9)
    for rr in range(5, last + 1):
        for cc in (2, 6):
            ws.cell(row=rr, column=cc).alignment = Alignment(horizontal="right", vertical="center")
        for i, col in enumerate(DI_COLS):
            if col[3]:
                ws.cell(row=rr, column=i + 1).number_format = col[3]
        ws.cell(row=rr, column=1).font = Font(name=FONT, size=9, bold=True)
    ws.conditional_formatting.add("M5:M%d" % last, ColorScaleRule(
        start_type="num", start_value=-0.05, start_color=K.C_SSELL_BG,
        mid_type="num", mid_value=0, mid_color="FFFFFF",
        end_type="num", end_value=0.05, end_color=K.C_SBUY_BG))
    ws.auto_filter.ref = "A4:%s%d" % (get_column_letter(len(DI_COLS)), last)
    ws.freeze_panes = "C5"
    return ws, last


# =====================================================================
# 4) Daily_History  (یک ردیف = یک نماد-روز: قیمت + حقیقی/حقوقی با هم)
# =====================================================================
DH_RAW = [
    ("نماد", "lVal18AFC", 11, None),
    ("کد نماد", "insCode", 18, "@"),
    ("تاریخ میلادی", "-", 12, F_DATE),
    ("تاریخ (DEven)", "dEven", 12, "0"),
    ("تاریخ شمسی", "-", 12, None),
    ("اولین قیمت", "priceFirst", 11, F_PRICE),
    ("بیشترین قیمت", "priceMax", 11, F_PRICE),
    ("کمترین قیمت", "priceMin", 11, F_PRICE),
    ("قیمت پایانی", "pClosing", 11, F_PRICE),
    ("آخرین قیمت", "pDrCotVal", 11, F_PRICE),
    ("قیمت دیروز", "priceYesterday", 11, F_PRICE),
    ("حجم معاملات", "qTotTran5J", 14, F_INT),
    ("ارزش معاملات", "qTotCap", 16, F_INT),
    ("تعداد معاملات", "zTotTran", 11, F_INT),
    ("حجم خرید حقیقی", "buy_I_Volume", 14, F_INT),
    ("حجم فروش حقیقی", "sell_I_Volume", 14, F_INT),
    ("تعداد خریدار حقیقی", "buy_CountI", 13, F_INT),
    ("تعداد فروشنده حقیقی", "sell_CountI", 13, F_INT),
    ("حجم خرید حقوقی", "buy_N_Volume", 14, F_INT),
    ("حجم فروش حقوقی", "sell_N_Volume", 14, F_INT),
]

# (برچسب، توضیح، عرض، قالب، قالب فرمول با {r})
# (برچسب، توضیح، عرض، قالب، الگوی فرمول، عمق نگاه به عقب)
# {lo}/{k}: بازه INDEX عمداً فقط به‌اندازه‌ای که فرمول لازم دارد باز می‌شود؛ ارجاع به کل
# ستون، گراف وابستگی را چند ده میلیون سلولی می‌کند و محاسبه مجدد را از کار می‌اندازد.
DH_CALC = [
    ("شمارنده ردیف نماد", "n", 10, "0", '=IF($A{r}=$A{p},$U{p}+1,1)', 0),
    ("MA کوتاه", "MA_SHORT", 12, F_PRICE, '=IF($U{r}>=MA_SHORT,AVERAGE(INDEX($I${lo}:$I{r},{k}-MA_SHORT):$I{r}),"")', 400),
    ("MA میان‌مدت", "MA_MED", 12, F_PRICE, '=IF($U{r}>=MA_MED,AVERAGE(INDEX($I${lo}:$I{r},{k}-MA_MED):$I{r}),"")', 400),
    ("MA بلند ۱", "MA_LONG1", 12, F_PRICE, '=IF($U{r}>=MA_LONG1,AVERAGE(INDEX($I${lo}:$I{r},{k}-MA_LONG1):$I{r}),"")', 400),
    ("MA بلند ۲", "MA_LONG2", 12, F_PRICE, '=IF($U{r}>=MA_LONG2,AVERAGE(INDEX($I${lo}:$I{r},{k}-MA_LONG2):$I{r}),"")', 400),
    ("میانگین حجم", "MA_SHORT", 14, F_INT, '=IF($U{r}>=MA_SHORT,AVERAGE(INDEX($L${lo}:$L{r},{k}-MA_SHORT):$L{r}),"")', 120),
    ("دامنه واقعی (TR)", "True Range", 12, F_PRICE, '=IF($U{r}=1,$G{r}-$H{r},MAX($G{r}-$H{r},ABS($G{r}-$I{p}),ABS($H{r}-$I{p})))', 0),
    ("ATR", "ATR_PER", 12, F_PRICE, '=IF($U{r}>=ATR_PER,AVERAGE(INDEX($AA${lo}:$AA{r},{k}-ATR_PER):$AA{r}),"")', 120),
    ("خالص حجم حقیقی", "buy_I − sell_I", 14, F_INT, '=$O{r}-$P{r}', 0),
    ("خالص ارزش حقیقی (ریال)", "net × pClosing", 17, F_INT, '=$AC{r}*$I{r}', 0),
    ("سرانه خرید حقیقی (م.ریال)", "value/buy_CountI", 15, F_NUM1, '=IF($Q{r}>0,$O{r}*$I{r}/$Q{r}/1000000,"")', 0),
    ("سرانه فروش حقیقی (م.ریال)", "value/sell_CountI", 15, F_NUM1, '=IF($R{r}>0,$P{r}*$I{r}/$R{r}/1000000,"")', 0),
    ("قدرت خریدار", "AE/AF", 12, F_X, '=IF(AND(ISNUMBER($AE{r}),ISNUMBER($AF{r}),$AF{r}>0),$AE{r}/$AF{r},"")', 0),
    ("خالص ورود پول ۵ روزه", "sum 5d", 17, F_INT, '=IF($U{r}>=5,SUM(INDEX($AD${lo}:$AD{r},{k}-5):$AD{r}),"")', 30),
    ("سقف پنجره کوتاه", "STRUCT_S", 13, F_PRICE, '=IF($U{r}>=STRUCT_S,MAX(INDEX($G${lo}:$G{r},{k}-STRUCT_S):$G{r}),"")', 150),
    ("کف پنجره کوتاه", "STRUCT_S", 13, F_PRICE, '=IF($U{r}>=STRUCT_S,MIN(INDEX($H${lo}:$H{r},{k}-STRUCT_S):$H{r}),"")', 150),
    ("سقف پنجره بلند", "STRUCT_L", 13, F_PRICE, '=IF($U{r}>=STRUCT_L,MAX(INDEX($G${lo}:$G{r},{k}-STRUCT_L):$G{r}),"")', 250),
    ("کف پنجره بلند", "STRUCT_L", 13, F_PRICE, '=IF($U{r}>=STRUCT_L,MIN(INDEX($H${lo}:$H{r},{k}-STRUCT_L):$H{r}),"")', 250),
    ("آخرین ردیف نماد؟", "flag", 11, "0", '=IF($A{r}<>$A{n},1,0)', 0),
    ("کلید آخرین ردیف", "lookup key", 13, None, '=IF($AM{r}=1,$A{r},"")', 0),
]

DH_FIRST_ROW = 5


def dh_formula(tmpl, back, r):
    """{lo} = ابتدای بازه نگاه به عقب، {k} = r − lo + 2 تا اندیس INDEX نسبی درست شود."""
    lo = max(DH_FIRST_ROW, r - back)
    return tmpl.format(r=r, p=r - 1, n=r + 1, lo=lo, k=r - lo + 2)


def build_daily_history(wb, hist):
    ws = wb.create_sheet("Daily_History")
    ws.sheet_view.rightToLeft = True
    ncol = len(DH_RAW) + len(DH_CALC)
    title_block(ws, "تاریخچه روزانه نمادها (Daily_History)",
                "ستون‌های A تا T داده خام API است؛ ستون‌های U به بعد فرمول. "
                "قیمت و حقیقی/حقوقی عمداً در یک شیت‌اند تا میانگین‌های متحرکشان هم‌تراز باشد.",
                ncol)
    widths(ws, [c[2] for c in DH_RAW] + [c[2] for c in DH_CALC])
    hdr(ws, 3, [c[0] for c in DH_RAW] + [c[0] for c in DH_CALC],
        [c[1] for c in DH_RAW] + [c[1] for c in DH_CALC])

    r = 5
    for (sym, *_x) in SD.SYMBOLS:
        for row in hist[sym]:
            d = row["date"]
            vals = [row["symbol"], row["insCode"], d,
                    int("%04d%02d%02d" % (d.year, d.month, d.day)), jalali_str(d),
                    row["first"], row["high"], row["low"], row["close"], row["last"],
                    row["yesterday"], row["volume"], row["value"], row["trades"],
                    row["buy_i"], row["sell_i"], row["buy_ci"], row["sell_ci"],
                    row["buy_n"], row["sell_n"]]
            for i, v in enumerate(vals):
                c = ws.cell(row=r, column=i + 1, value=v)
                if DH_RAW[i][3]:
                    c.number_format = DH_RAW[i][3]
            for j, (_lbl, _d, _w, fmt, tmpl, back) in enumerate(DH_CALC):
                c = ws.cell(row=r, column=len(DH_RAW) + 1 + j,
                            value=dh_formula(tmpl, back, r))
                if fmt:
                    c.number_format = fmt
            r += 1
    last = r - 1
    style_data(ws, 5, last, 1, ncol, size=8)
    for rr in range(5, last + 1):
        for i, col in enumerate(DH_RAW):
            if col[3]:
                ws.cell(row=rr, column=i + 1).number_format = col[3]
        for j, col in enumerate(DH_CALC):
            if col[3]:
                ws.cell(row=rr, column=len(DH_RAW) + 1 + j).number_format = col[3]
        ws.cell(row=rr, column=1).font = Font(name=FONT, size=8, bold=True)
    ws.auto_filter.ref = "A4:%s%d" % (get_column_letter(ncol), last)
    ws.freeze_panes = "F5"
    dn("DH_LASTKEY", "Daily_History", "$AN$5:$AN$%d" % (last + 2000))
    return ws, last


COLREF = {}   # نگاشت کلید ستون‌ها بین شیت‌ها (پر می‌شود حین ساخت)

# ردیف‌های ذخیره: فایل از ابتدا برای این تعداد نماد/قرارداد فرمول دارد تا افزودن
# نماد جدید نیازی به کشیدن دستی فرمول نداشته باشد.
N_SYM_ROWS = 60
N_OPT_ROWS = 120


def guard(formula, r, key="$A"):
    """فرمول را به‌گونه‌ای می‌پیچد که ردیف‌های خالی ذخیره، خالی بمانند."""
    return '=IF(%s%d="","",%s)' % (key, r, formula.lstrip("="))


# =====================================================================
# 5) Market_Index  (شاخص کل و هم‌وزن + امتیاز رژیم بازار)
# =====================================================================
MI_COLS = [
    ("تاریخ میلادی", "-", 12, F_DATE),
    ("تاریخ (DEven)", "dEven", 12, "0"),
    ("تاریخ شمسی", "-", 12, None),
    ("شاخص کل", "xDrNivJIdx004", 14, '#,##0'),
    ("تغییر روزانه کل", "-", 12, F_PCT2),
    ("MA کوتاه کل", "-", 13, '#,##0'),
    ("MA میان‌مدت کل", "-", 13, '#,##0'),
    ("MA بلند کل", "-", 13, '#,##0'),
    ("شاخص هم‌وزن", "xDrNivJIdx004", 14, '#,##0'),
    ("تغییر روزانه هم‌وزن", "-", 12, F_PCT2),
    ("MA کوتاه هم‌وزن", "-", 13, '#,##0'),
    ("MA میان‌مدت هم‌وزن", "-", 13, '#,##0'),
    ("MA بلند هم‌وزن", "-", 13, '#,##0'),
    ("شمارنده", "n", 9, "0"),
]

MI_REGIME = [
    ("آخرین ردیف داده", '=COUNT($A$5:$A$100000)+4', "0", False),
    ("تاریخ آخرین داده", '=IFERROR(INDEX($C$1:$C$5000,$Q$5),"")', None, False),
    ("شاخص کل", '=IFERROR(INDEX($D$1:$D$5000,$Q$5),"")', '#,##0', False),
    ("تغییر روز شاخص کل", '=IFERROR(INDEX($E$1:$E$5000,$Q$5),"")', F_PCT2, False),
    ("شاخص کل نسبت به MA میان‌مدت", '=IFERROR(IF(INDEX($D$1:$D$5000,$Q$5)>INDEX($G$1:$G$5000,$Q$5),"بالای MA","زیر MA"),"")', None, False),
    ("شاخص کل نسبت به MA بلند", '=IFERROR(IF(INDEX($D$1:$D$5000,$Q$5)>INDEX($H$1:$H$5000,$Q$5),"بالای MA","زیر MA"),"")', None, False),
    ("شاخص هم‌وزن", '=IFERROR(INDEX($I$1:$I$5000,$Q$5),"")', '#,##0', False),
    ("تغییر روز هم‌وزن", '=IFERROR(INDEX($J$1:$J$5000,$Q$5),"")', F_PCT2, False),
    ("هم‌وزن نسبت به MA میان‌مدت", '=IFERROR(IF(INDEX($I$1:$I$5000,$Q$5)>INDEX($L$1:$L$5000,$Q$5),"بالای MA","زیر MA"),"")', None, False),
    ("هم‌وزن نسبت به MA بلند", '=IFERROR(IF(INDEX($I$1:$I$5000,$Q$5)>INDEX($M$1:$M$5000,$Q$5),"بالای MA","زیر MA"),"")', None, False),
    ("بازده ۵ روزه هم‌وزن", '=IFERROR(INDEX($I$1:$I$5000,$Q$5)/INDEX($I$1:$I$5000,$Q$5-5)-1,"")', F_PCT2, False),
    ("بازده ۲۰ روزه هم‌وزن", '=IFERROR(INDEX($I$1:$I$5000,$Q$5)/INDEX($I$1:$I$5000,$Q$5-20)-1,"")', F_PCT2, False),
    ("— اجزای امتیاز رژیم —", None, None, True),
    ("شاخص کل > MA میان‌مدت (±۱٫۵)", '=IFERROR(IF(INDEX($D$1:$D$5000,$Q$5)>INDEX($G$1:$G$5000,$Q$5),1.5,-1.5),0)', F_NUM1, False),
    ("شاخص کل > MA بلند (±۱٫۵)", '=IFERROR(IF(INDEX($D$1:$D$5000,$Q$5)>INDEX($H$1:$H$5000,$Q$5),1.5,-1.5),0)', F_NUM1, False),
    ("هم‌وزن > MA میان‌مدت (±۲)", '=IFERROR(IF(INDEX($I$1:$I$5000,$Q$5)>INDEX($L$1:$L$5000,$Q$5),2,-2),0)', F_NUM1, False),
    ("هم‌وزن > MA بلند (±۲)", '=IFERROR(IF(INDEX($I$1:$I$5000,$Q$5)>INDEX($M$1:$M$5000,$Q$5),2,-2),0)', F_NUM1, False),
    ("مومنتوم ۵ روزه هم‌وزن (±۱٫۵)", '=IFERROR(IF($Q$15>0,1.5,-1.5),0)', F_NUM1, False),
    ("مومنتوم ۲۰ روزه هم‌وزن (±۱٫۵)", '=IFERROR(IF($Q$16>0,1.5,-1.5),0)', F_NUM1, False),
]


def build_market_index(wb, idx_hist):
    ws = wb.create_sheet("Market_Index")
    ws.sheet_view.rightToLeft = True
    title_block(ws, "شاخص کل و هم‌وزن — رژیم بازار",
                "امتیاز رژیم بازار (سلول Q24) گیت کل سیستم است و در همه سیگنال‌ها با وزن W_MARKET وارد می‌شود.",
                len(MI_COLS))
    widths(ws, [c[2] for c in MI_COLS])
    hdr(ws, 3, [c[0] for c in MI_COLS], [c[1] for c in MI_COLS])

    tot = idx_hist["شاخص كل"]
    eqw = idx_hist["شاخص كل هم وزن"]
    r = 5
    for i in range(len(tot)):
        d = tot[i]["date"]
        ws.cell(row=r, column=1, value=d).number_format = F_DATE
        ws.cell(row=r, column=2, value=int("%04d%02d%02d" % (d.year, d.month, d.day)))
        ws.cell(row=r, column=3, value=jalali_str(d))
        ws.cell(row=r, column=4, value=tot[i]["value"]).number_format = '#,##0'
        ws.cell(row=r, column=9, value=eqw[i]["value"]).number_format = '#,##0'
        ws.cell(row=r, column=14, value='=IF($A{r}=$A{p},$N{p}+1,1)'.format(r=r, p=r - 1)).number_format = "0"
        for col, src in ((5, "D"), (10, "I")):
            ws.cell(row=r, column=col,
                    value='=IF($N{r}>1,${s}{r}/${s}{p}-1,"")'.format(r=r, p=r - 1, s=src)
                    ).number_format = F_PCT2
        for col, src, per in ((6, "D", "MA_SHORT"), (7, "D", "MA_MED"), (8, "D", "MA_LONG2"),
                              (11, "I", "MA_SHORT"), (12, "I", "MA_MED"), (13, "I", "MA_LONG2")):
            lo = max(5, r - 400)
            ws.cell(row=r, column=col,
                    value='=IF($N{r}>={p},AVERAGE(INDEX(${s}${lo}:${s}{r},{k}-{p}):${s}{r}),"")'.format(
                        r=r, s=src, p=per, lo=lo, k=r - lo + 2)).number_format = '#,##0'
        r += 1
    last = r - 1
    style_data(ws, 5, last, 1, len(MI_COLS), size=8)
    for rr in range(5, last + 1):
        for i, col in enumerate(MI_COLS):
            if col[3]:
                ws.cell(row=rr, column=i + 1).number_format = col[3]

    # ---- بلوک امتیاز رژیم بازار (ستون‌های P و Q) ----
    ws.column_dimensions["P"].width = 34
    ws.column_dimensions["Q"].width = 18
    rr = 5
    for label, formula, fmt, is_sec in MI_REGIME:
        c1 = ws.cell(row=rr, column=16, value=label)
        c1.alignment = Alignment(horizontal="right", vertical="center")
        if is_sec:
            c1.font = Font(name=FONT, bold=True, size=9, color="FFFFFF")
            c1.fill = PatternFill("solid", fgColor=K.C_SECTION_BG)
            ws.cell(row=rr, column=17).fill = PatternFill("solid", fgColor=K.C_SECTION_BG)
        else:
            c1.font = Font(name=FONT, size=9)
            c2 = ws.cell(row=rr, column=17, value=formula)
            c2.font = Font(name=FONT, size=10, bold=True)
            c2.alignment = Alignment(horizontal="center", vertical="center")
            c2.border = BORDER
            if fmt:
                c2.number_format = fmt
        rr += 1
    score_row = rr
    ws.cell(row=score_row, column=16, value="امتیاز رژیم بازار (−۱۰ تا +۱۰)")
    ws.cell(row=score_row, column=16).font = Font(name=FONT, bold=True, size=11, color="FFFFFF")
    ws.cell(row=score_row, column=16).fill = PatternFill("solid", fgColor=K.C_HEADER_BG)
    ws.cell(row=score_row, column=16).alignment = Alignment(horizontal="right", vertical="center")
    sc = ws.cell(row=score_row, column=17, value="=MAX(-10,MIN(10,SUM($Q$18:$Q$23)))")
    sc.font = Font(name=FONT, bold=True, size=12)
    sc.number_format = F_NUM1
    sc.alignment = Alignment(horizontal="center", vertical="center")
    sc.border = BORDER
    lbl_row = score_row + 1
    ws.cell(row=lbl_row, column=16, value="وضعیت بازار")
    ws.cell(row=lbl_row, column=16).font = Font(name=FONT, bold=True, size=10)
    ws.cell(row=lbl_row, column=16).alignment = Alignment(horizontal="right", vertical="center")
    lb = ws.cell(row=lbl_row, column=17,
                 value='=IF($Q${s}>=5,"صعودی قوی",IF($Q${s}>=2,"صعودی",IF($Q${s}<=-5,"نزولی قوی",'
                       'IF($Q${s}<=-2,"نزولی","خنثی / بی‌روند"))))'.format(s=score_row))
    lb.font = Font(name=FONT, bold=True, size=11)
    lb.alignment = Alignment(horizontal="center", vertical="center")
    lb.border = BORDER
    for rng, op, f, fill, fg in (
            ("Q%d" % score_row, "greaterThanOrEqual", ["5"], K.C_SBUY_BG, K.C_SBUY_FG),
            ("Q%d" % score_row, "lessThanOrEqual", ["-5"], K.C_SSELL_BG, K.C_SSELL_FG)):
        ws.conditional_formatting.add(rng, CellIsRule(
            operator=op, formula=f, fill=PatternFill("solid", fgColor=fill),
            font=Font(color=fg, bold=True)))

    dn("MARKET_SCORE", "Market_Index", "$Q$%d" % score_row)
    dn("MARKET_LABEL", "Market_Index", "$Q$%d" % lbl_row)
    dn("MI_LASTROW", "Market_Index", "$Q$5")
    ws.freeze_panes = "D5"
    return ws, last


# =====================================================================
# 6) Calculations
# =====================================================================
# (کلید، برچسب، توضیح، عرض، قالب، الگوی فرمول)
CALC_COLS = [
    ("sym",       "نماد", "از Watchlist", 11, None, None),
    ("di_row",    "ردیف در Data_Input", "MATCH", 9, "0", '=IFERROR(MATCH($A{r},Data_Input!$A$1:$A$5000,0),"")'),
    ("dh_row",    "ردیف در Daily_History", "MATCH", 9, "0", '=IFERROR(MATCH($A{r},Daily_History!$AN$1:$AN$5000,0),"")'),
    ("price",     "آخرین قیمت", "pDrCotVal", 12, F_PRICE, '=IFERROR(INDEX(Data_Input!$I$1:$I$5000,${di_row}{r}),"")'),
    ("close",     "قیمت پایانی", "pClosing", 12, F_PRICE, '=IFERROR(INDEX(Data_Input!$J$1:$J$5000,${di_row}{r}),"")'),
    ("chgpct",    "درصد تغییر", "priceChangePercent", 10, F_PCT2, '=IFERROR(INDEX(Data_Input!$M$1:$M$5000,${di_row}{r}),"")'),
    ("value_b",   "ارزش معاملات (م.ریال)", "qTotCap/1e9", 13, F_NUM1, '=IFERROR(INDEX(Data_Input!$R$1:$R$5000,${di_row}{r})/1000000000,"")'),
    ("ma_s",      "MA کوتاه", "Daily_History!V", 12, F_PRICE, '=IFERROR(INDEX(Daily_History!$V$1:$V$5000,${dh_row}{r}),"")'),
    ("ma_m",      "MA میان‌مدت", "Daily_History!W", 12, F_PRICE, '=IFERROR(INDEX(Daily_History!$W$1:$W$5000,${dh_row}{r}),"")'),
    ("ma_l1",     "MA بلند ۱", "Daily_History!X", 12, F_PRICE, '=IFERROR(INDEX(Daily_History!$X$1:$X$5000,${dh_row}{r}),"")'),
    ("ma_l2",     "MA بلند ۲", "Daily_History!Y", 12, F_PRICE, '=IFERROR(INDEX(Daily_History!$Y$1:$Y$5000,${dh_row}{r}),"")'),
    ("dist50",    "فاصله از MA میان‌مدت", "price/MA−1", 12, F_PCT, '=IFERROR(${price}{r}/${ma_m}{r}-1,"")'),
    ("dist200",   "فاصله از MA بلند", "price/MA−1", 12, F_PCT, '=IFERROR(${price}{r}/${ma_l2}{r}-1,"")'),
    ("n_above",   "تعداد MA زیر قیمت", "۰ تا ۴", 10, "0",
     '=IF({price}{r}>{ma_s}{r},1,0)+IF({price}{r}>{ma_m}{r},1,0)+IF({price}{r}>{ma_l1}{r},1,0)+IF({price}{r}>{ma_l2}{r},1,0)'),
    ("ma_align",  "آرایش میانگین‌ها", "ساختار MA", 20, None,
     '=IF(AND(ISNUMBER({ma_s}{r}),ISNUMBER({ma_l2}{r})),'
     'IF(AND({ma_s}{r}>{ma_m}{r},{ma_m}{r}>{ma_l1}{r},{ma_l1}{r}>{ma_l2}{r}),"آرایش صعودی کامل",'
     'IF(AND({ma_s}{r}<{ma_m}{r},{ma_m}{r}<{ma_l1}{r},{ma_l1}{r}<{ma_l2}{r}),"آرایش نزولی کامل",'
     'IF({ma_m}{r}>{ma_l2}{r},"تقاطع طلایی","تقاطع مرگ"))),"داده ناکافی")'),
    ("slope20",   "شیب MA کوتاه", "۲۰ روز", 11, F_PCT, '=IFERROR({ma_s}{r}/INDEX(Daily_History!$V$1:$V$5000,${dh_row}{r}-MA_SHORT)-1,"")'),
    ("hh_s",      "سقف کوتاه‌مدت", "Daily_History!AI", 12, F_PRICE, '=IFERROR(INDEX(Daily_History!$AI$1:$AI$5000,${dh_row}{r}),"")'),
    ("ll_s",      "کف کوتاه‌مدت", "Daily_History!AJ", 12, F_PRICE, '=IFERROR(INDEX(Daily_History!$AJ$1:$AJ$5000,${dh_row}{r}),"")'),
    ("hh_l",      "سقف میان‌مدت", "Daily_History!AK", 12, F_PRICE, '=IFERROR(INDEX(Daily_History!$AK$1:$AK$5000,${dh_row}{r}),"")'),
    ("ll_l",      "کف میان‌مدت", "Daily_History!AL", 12, F_PRICE, '=IFERROR(INDEX(Daily_History!$AL$1:$AL$5000,${dh_row}{r}),"")'),
    ("structure", "ساختار روند", "HH / LL", 22, None,
     '=IF(AND(ISNUMBER({hh_l}{r}),ISNUMBER({price}{r})),'
     'IF({price}{r}>={hh_l}{r}*0.995,"سقف‌شکنی میان‌مدت (HH)",'
     'IF({price}{r}>={hh_s}{r}*0.995,"سقف‌شکنی کوتاه‌مدت",'
     'IF({price}{r}<={ll_l}{r}*1.005,"کف‌شکنی میان‌مدت (LL)",'
     'IF({price}{r}<={ll_s}{r}*1.005,"کف‌شکنی کوتاه‌مدت","درون محدوده")))),"داده ناکافی")'),
    ("atr",       "ATR", "Daily_History!AB", 11, F_PRICE, '=IFERROR(INDEX(Daily_History!$AB$1:$AB$5000,${dh_row}{r}),"")'),
    ("atrpct",    "ATR ٪", "نوسان نسبی", 10, F_PCT, '=IFERROR({atr}{r}/{price}{r},"")'),
    ("stop",      "حد ضرر پیشنهادی", "price − k×ATR", 13, F_PRICE, '=IFERROR({price}{r}-ATR_STOP_MULT*{atr}{r},"")'),
    ("volma",     "میانگین حجم", "Daily_History!Z", 14, F_INT, '=IFERROR(INDEX(Daily_History!$Z$1:$Z$5000,${dh_row}{r}),"")'),
    ("vol",       "حجم امروز", "qTotTran5J", 14, F_INT, '=IFERROR(INDEX(Data_Input!$Q$1:$Q$5000,${di_row}{r}),"")'),
    ("volratio",  "نسبت حجم", "حجم ÷ میانگین", 10, F_X, '=IFERROR({vol}{r}/{volma}{r},"")'),
    ("net_vol",   "خالص حجم حقیقی", "buy_I − sell_I", 14, F_INT,
     '=IFERROR(INDEX(Data_Input!$V$1:$V$5000,${di_row}{r})-INDEX(Data_Input!$W$1:$W$5000,${di_row}{r}),"")'),
    ("net_val_b", "خالص ورود پول (م.ریال)", "امروز", 14, F_NUM1, '=IFERROR({net_vol}{r}*{close}{r}/1000000000,"")'),
    ("net_ratio", "خالص ورود ÷ ارزش معاملات", "نرمال‌شده", 13, F_PCT, '=IFERROR({net_vol}{r}*{close}{r}/INDEX(Data_Input!$R$1:$R$5000,${di_row}{r}),"")'),
    ("pc_buy",    "سرانه خرید حقیقی (م.ریال)", "buy value/buy_CountI", 14, F_NUM1,
     '=IFERROR(INDEX(Data_Input!$V$1:$V$5000,${di_row}{r})*{close}{r}/INDEX(Data_Input!$X$1:$X$5000,${di_row}{r})/1000000,"")'),
    ("pc_sell",   "سرانه فروش حقیقی (م.ریال)", "sell value/sell_CountI", 14, F_NUM1,
     '=IFERROR(INDEX(Data_Input!$W$1:$W$5000,${di_row}{r})*{close}{r}/INDEX(Data_Input!$Y$1:$Y$5000,${di_row}{r})/1000000,"")'),
    ("power",     "قدرت خریدار حقیقی", "سرانه خرید ÷ سرانه فروش", 12, F_X, '=IFERROR({pc_buy}{r}/{pc_sell}{r},"")'),
    ("net5_b",    "خالص ورود پول ۵ روزه (م.ریال)", "Daily_History!AH", 15, F_NUM1,
     '=IFERROR(INDEX(Daily_History!$AH$1:$AH$5000,${dh_row}{r})/1000000000,"")'),
    ("net5_ratio", "نسبت خالص ۵ روزه", "÷ ۵×ارزش معاملات", 12, F_PCT, '=IFERROR({net5_b}{r}/(5*{value_b}{r}),"")'),
    ("t_score",   "امتیاز روند (T)", "−۱۰ تا +۱۰", 11, F_NUM1,
     '=IFERROR(MAX(-10,MIN(10,'
     'IF({price}{r}>{ma_m}{r}*1.02,3,IF({price}{r}>{ma_m}{r},1.5,IF({price}{r}<{ma_m}{r}*0.98,-3,-1.5)))'
     '+IF({ma_m}{r}>{ma_l2}{r}*1.02,3,IF({ma_m}{r}>{ma_l2}{r},1.5,IF({ma_m}{r}<{ma_l2}{r}*0.98,-3,-1.5)))'
     '+IF({price}{r}>={hh_s}{r}*0.995,2,IF({price}{r}<={ll_s}{r}*1.005,-2,0))'
     '+IF({slope20}{r}>0.03,2,IF({slope20}{r}>0,1,IF({slope20}{r}<-0.03,-2,-1)))'
     ')),0)'),
    ("s_score",   "امتیاز پول هوشمند (S)", "−۱۰ تا +۱۰", 11, F_NUM1,
     '=IFERROR(MAX(-10,MIN(10,'
     'IF({power}{r}>=SM_STRONG,4,IF({power}{r}>=SM_MOD,2,IF({power}{r}<=SM_BAD,-4,IF({power}{r}<=SM_WEAK,-2,0))))'
     '+IF({net_ratio}{r}>=NF_STRONG,3,IF({net_ratio}{r}>=NF_MOD,1.5,IF({net_ratio}{r}<=-NF_STRONG,-3,IF({net_ratio}{r}<=-NF_MOD,-1.5,0))))'
     '+IF({net5_ratio}{r}>=NF_MOD,3,IF({net5_ratio}{r}>0,1.5,IF({net5_ratio}{r}<=-NF_MOD,-3,-1.5)))'
     ')),0)'),
    ("m_score",   "امتیاز میانگین‌ها (M)", "−۱۰ تا +۱۰", 11, F_NUM1, '=IFERROR({n_above}{r}*5-10,0)'),
    ("v_score",   "امتیاز حجم (V)", "−۱۰ تا +۱۰", 11, F_NUM1,
     '=IFERROR(IF({chgpct}{r}>0,IF({volratio}{r}>=VOL_HIGH,9,IF({volratio}{r}>=VOL_MOD,5,IF({volratio}{r}<=VOL_DRY,-2,2))),'
     'IF({chgpct}{r}<0,IF({volratio}{r}>=VOL_HIGH,-9,IF({volratio}{r}>=VOL_MOD,-5,IF({volratio}{r}<=VOL_DRY,2,-2))),0)),0)'),
    ("k_score",   "امتیاز بازار (K)", "Market_Index", 11, F_NUM1, '=MARKET_SCORE'),
    ("z_score",   "امتیاز زمان (Z)", "Time_Link", 11, F_NUM1,
     '=IFERROR(INDEX(Time_Link!$B$1:$B$5000,MATCH($A{r},Time_Link!$A$1:$A$5000,0)),0)'),
    ("total",     "امتیاز کل", "میانگین وزنی", 12, F_NUM1,
     '=IFERROR(({t_score}{r}*W_TREND+{s_score}{r}*W_SMART+{m_score}{r}*W_MA+{v_score}{r}*W_VOL'
     '+{k_score}{r}*W_MARKET+{z_score}{r}*W_TIME)/W_SUM,0)'),
    ("strength",  "قدرت سیگنال", "۱ تا ۵", 10, "0",
     '=IF(ABS({total}{r})>=8,5,IF(ABS({total}{r})>=5,4,IF(ABS({total}{r})>=3,3,IF(ABS({total}{r})>=1.5,2,1))))'),
    ("liq",       "اعتبار نقدشوندگی", "MIN_LIQ_B", 14, None,
     '=IF({value_b}{r}="","بدون داده",IF({value_b}{r}<MIN_LIQ_B,"کم‌اعتبار","معتبر"))'),
    ("rank_key",  "کلید رتبه", "tie-break", 10, F_NUM2, '=IFERROR({total}{r}+ROW()/1000000,-99)'),
    ("rank_buy",  "رتبه خرید", "نزولی", 9, "0", '=RANK({rank_key}{r},${rank_key}$5:${rank_key}${last},0)'),
    ("rank_sell", "رتبه فروش", "صعودی", 9, "0", '=RANK({rank_key}{r},${rank_key}$5:${rank_key}${last},1)'),
]


def _colmap(cols):
    return {key: get_column_letter(i + 1) for i, (key, *_r) in enumerate(cols)}


def build_calculations(wb, symbols, tc_score_col):
    ws = wb.create_sheet("Calculations")
    ws.sheet_view.rightToLeft = True
    cm = _colmap(CALC_COLS)
    COLREF["calc"] = cm
    n = N_SYM_ROWS
    first, lastrow = 5, 4 + n
    title_block(ws, "محاسبات (Calculations)",
                "همه ستون‌ها فرمول‌اند. شش زیرنمره (T/S/M/V/K/Z) با وزن‌های شیت Settings ترکیب می‌شوند و امتیاز کل را می‌سازند.",
                len(CALC_COLS))
    widths(ws, [c[3] for c in CALC_COLS])
    hdr(ws, 3, [c[1] for c in CALC_COLS], [c[2] for c in CALC_COLS])

    for i in range(n):
        r = first + i
        ws.cell(row=r, column=1,
                value='=IF(COUNTA(Watchlist!$A${w})=0,"",Watchlist!$A${w})'.format(w=5 + i))
        for j, (key, _lbl, _d, _w, fmt, tmpl) in enumerate(CALC_COLS[1:], start=2):
            f = guard(tmpl.format(r=r, last=lastrow, TCS=tc_score_col, **cm), r)
            c = ws.cell(row=r, column=j, value=f)
            if fmt:
                c.number_format = fmt
    style_data(ws, first, lastrow, 1, len(CALC_COLS), size=9)
    for r in range(first, lastrow + 1):
        for j, (_k, _l, _d, _w, fmt, _t) in enumerate(CALC_COLS):
            if fmt:
                ws.cell(row=r, column=j + 1).number_format = fmt
        ws.cell(row=r, column=1).font = Font(name=FONT, size=9, bold=True)
        for key in ("ma_s", "ma_m", "ma_l1", "ma_l2", "hh_s", "ll_s", "hh_l", "ll_l",
                    "atr", "volma", "net5_b", "price", "close", "chgpct", "value_b",
                    "vol", "k_score", "z_score"):
            ws.cell(row=r, column=column_index_from_string(cm[key])).font = Font(name=FONT, size=9, color=K.C_GREEN_LINK)

    for key in ("t_score", "s_score", "m_score", "v_score", "k_score", "z_score", "total"):
        rng = "{c}{a}:{c}{b}".format(c=cm[key], a=first, b=lastrow)
        ws.conditional_formatting.add(rng, ColorScaleRule(
            start_type="num", start_value=-10, start_color=K.C_SSELL_BG,
            mid_type="num", mid_value=0, mid_color="FFFFFF",
            end_type="num", end_value=10, end_color=K.C_SBUY_BG))
    ws.conditional_formatting.add("{c}{a}:{c}{b}".format(c=cm["volratio"], a=first, b=lastrow),
                                  DataBarRule(start_type="num", start_value=0,
                                              end_type="num", end_value=4, color="638EC6"))
    ws.freeze_panes = "B5"
    dn("CALC_TOTAL", "Calculations", "${c}$5:${c}${b}".format(c=cm["total"], b=lastrow))
    return ws, first, lastrow, cm


# =====================================================================
# 7) Time_Cycles  (لایه زمانی — ساختار کامل، وزن پیش‌فرض صفر)
# =====================================================================
GANN_DAYS = [30, 45, 60, 90, 120, 144, 180, 270, 360]

TC_COLS = [
    ("sym",      "نماد", "از Watchlist", 11, None, None),
    ("low_date", "تاریخ کف چرخه اخیر", "ورودی دستی", 14, F_DATE, None),
    ("high_date", "تاریخ سقف چرخه اخیر", "ورودی دستی", 14, F_DATE, None),
    ("cyc_len",  "طول چرخه غالب (روز معاملاتی)", "ورودی / CYC_3", 13, "0", None),
    ("last_date", "تاریخ آخرین داده", "Daily_History", 13, F_DATE,
     '=IFERROR(INDEX(Daily_History!$C$1:$C$5000,MATCH($A{r},Daily_History!$AN$1:$AN$5000,0)),"")'),
    ("cal_days", "روز تقویمی از کف", "last − low", 11, "0", '=IFERROR({last_date}{r}-{low_date}{r},"")'),
    ("tr_days",  "روز معاملاتی از کف", "×۵÷۷", 11, "0", '=IFERROR(ROUND({cal_days}{r}*5/7,0),"")'),
    ("phase",    "فاز چرخه", "سپری‌شده ÷ طول", 10, F_PCT, '=IFERROR({tr_days}{r}/{cyc_len}{r},"")'),
    ("next_low", "کف بعدی (پیش‌بینی)", "low + طول چرخه", 14, F_DATE, '=IFERROR({low_date}{r}+ROUND({cyc_len}{r}*7/5,0),"")'),
    ("days_to_low", "روز تا کف بعدی", "تقویمی", 11, "0", '=IFERROR({next_low}{r}-{last_date}{r},"")'),
    ("gann",     "نزدیک‌ترین عدد گن", "۳۰/۴۵/۶۰/۹۰/۱۲۰/۱۴۴/۱۸۰/۲۷۰/۳۶۰", 12, "0",
     '=IFERROR(IF({tr_days}{r}-INDEX($AB$5:$AB$13,MATCH({tr_days}{r},$AB$5:$AB$13,1))'
     '<=INDEX($AB$5:$AB$13,MIN(MATCH({tr_days}{r},$AB$5:$AB$13,1)+1,9))-{tr_days}{r},'
     'INDEX($AB$5:$AB$13,MATCH({tr_days}{r},$AB$5:$AB$13,1)),'
     'INDEX($AB$5:$AB$13,MIN(MATCH({tr_days}{r},$AB$5:$AB$13,1)+1,9))),30)'),
    ("gann_gap", "فاصله تا عدد گن", "روز", 11, "0", '=IFERROR(ABS({tr_days}{r}-{gann}{r}),"")'),
    ("swing",    "طول سوئینگ قبلی (روز)", "ورودی دستی", 13, "0", None),
    ("fib_len",  "پروجکشن زمانی فیبوناچی ۱٫۶۱۸", "swing × ۱٫۶۱۸", 14, "0", '=IFERROR(ROUND({swing}{r}*1.618,0),"")'),
    ("fib_date", "تاریخ پروجکشن فیبوناچی", "از سقف اخیر", 14, F_DATE, '=IFERROR({high_date}{r}+ROUND({fib_len}{r}*7/5,0),"")'),
    ("wave",     "برچسب موج الیوت", "ورودی دستی", 12, None, None),
    ("degree",   "درجه موج", "ورودی دستی", 12, None, None),
    ("conf",     "اطمینان (۱ تا ۵)", "ورودی دستی", 11, "0", None),
    ("sc_phase", "امتیاز فاز چرخه", "هرست", 11, F_NUM1,
     '=IF(OR({cyc_len}{r}="",{phase}{r}=""),0,IF(OR({phase}{r}<=0.15,{phase}{r}>=0.9),4,'
     'IF(AND({phase}{r}>=0.35,{phase}{r}<=0.6),-3,IF({phase}{r}<0.35,2,-1))))'),
    ("sc_gann",  "امتیاز پنجره گن", "±۲", 11, F_NUM1,
     '=IF(OR({gann_gap}{r}="",{gann_gap}{r}>TIME_TOL),0,IF({sc_phase}{r}>0,2,-2))'),
    ("sc_ew",    "امتیاز الیوت", "×اطمینان", 11, F_NUM1,
     '=IF({wave}{r}="",0,(IF({wave}{r}="3",4,IF({wave}{r}="1",2,IF({wave}{r}="2",1,IF({wave}{r}="4",1,'
     'IF({wave}{r}="5",-1,IF({wave}{r}="A",-3,IF({wave}{r}="B",-2,IF({wave}{r}="C",-4,0)))))))))'
     '*IF({conf}{r}="",0.6,{conf}{r}/5))'),
    ("z_total",  "امتیاز زمان (Z)", "−۱۰ تا +۱۰", 12, F_NUM1,
     '=MAX(-10,MIN(10,{sc_phase}{r}+{sc_gann}{r}+{sc_ew}{r}))'),
    ("status",   "وضعیت لایه", "W_TIME", 16, None, '=IF(W_TIME=0,"غیرفعال (وزن صفر)","فعال")'),
]


# نگاشت نماد → InsCode، از همان جدولی که Watchlist از آن ساخته می‌شود.
# اگر روزی نمادی اضافه شود، همان‌جا اضافه می‌شود و اینجا خودکار می‌آید.
def _inscodes():
    try:
        from sample_data import SYMBOLS
    except ImportError:
        return {}
    return {row[0]: row[2] for row in SYMBOLS}


def build_time_cycles(wb, symbols, hist, standalone=False):
    """standalone=True: فایل مستقل بدون Watchlist و Daily_History.

    در این حالت ستون نماد و تاریخ آخرین داده ورودی‌اند (اسکریپت پایتون یا
    خود کاربر پرشان می‌کند)، نه فرمولِ ارجاع به شیت‌هایی که در این فایل نیستند.
    """
    ws = wb.create_sheet("Time_Cycles")
    ws.sheet_view.rightToLeft = True
    cm = _colmap(TC_COLS)
    COLREF["time"] = cm
    first = 5
    lastrow = 4 + N_SYM_ROWS
    title_block(ws, "لایه زمانی — چرخه‌های هرست، گن، فیبوناچی زمانی و الیوت",
                "این لایه امروز با وزن صفر ساخته شده است: ساختار و فرمول‌ها زنده‌اند ولی روی سیگنال اثر ندارند. "
                "برای فعال‌سازی، W_TIME را در Settings بزرگ‌تر از صفر کنید.", len(TC_COLS))
    widths(ws, [c[3] for c in TC_COLS])
    hdr(ws, 3, [c[1] for c in TC_COLS], [c[2] for c in TC_COLS])

    # جدول کمکی اعداد گن
    ws.cell(row=3, column=28, value="اعداد کلیدی گن").font = Font(name=FONT, bold=True, size=8)
    for i, g in enumerate(GANN_DAYS):
        ws.cell(row=5 + i, column=28, value=g).font = Font(name=FONT, size=8)
    ws.column_dimensions["AB"].width = 12

    # ستون Z — کد نماد برای دکمه «تحلیل چرخه زمانی».
    # ماکرو تاریخچه را با همین کد از tsetmc می‌گیرد. در فایل مستقل که
    # Watchlist ندارد، این تنها جایی است که کد نماد از آن خوانده می‌شود.
    ws.cell(row=3, column=26, value="کد نماد (InsCode)").font = Font(
        name=FONT, bold=True, size=8)
    ws.cell(row=4, column=26, value="برای دکمه ماکرو").font = Font(
        name=FONT, size=7, color="808080")
    ws.column_dimensions["Z"].width = 20

    for i in range(N_SYM_ROWS):
        r = first + i
        if standalone:
            if i < len(symbols):
                ws.cell(row=r, column=1, value=symbols[i])
                ins = _inscodes().get(symbols[i])
                if ins:
                    ws.cell(row=r, column=26, value=ins).font = Font(
                        name=FONT, size=8, color=K.C_BLUE_INPUT)
            c0 = ws.cell(row=r, column=1)
            c0.fill = PatternFill("solid", fgColor=K.C_INPUT_BG)
            c0.font = Font(name=FONT, size=9, bold=True, color=K.C_BLUE_INPUT)
            cz = ws.cell(row=r, column=26)
            cz.fill = PatternFill("solid", fgColor=K.C_INPUT_BG)
        else:
            ws.cell(row=r, column=1,
                    value='=IF(COUNTA(Watchlist!$A${w})=0,"",Watchlist!$A${w})'.format(w=5 + i))
        for j, (key, _lbl, _d, _w2, fmt, tmpl) in enumerate(TC_COLS, start=1):
            if tmpl is None:
                continue
            if standalone and key == "last_date":
                # در فایل مستقل، Daily_History وجود ندارد؛ این ستون را
                # اسکریپت پایتون یا خود کاربر پر می‌کند.
                c = ws.cell(row=r, column=j)
                c.fill = PatternFill("solid", fgColor=K.C_INPUT_BG)
                c.font = Font(name=FONT, size=9, color=K.C_GREEN_LINK)
                c.number_format = fmt
                continue
            c = ws.cell(row=r, column=j, value=guard(tmpl.format(r=r, **cm), r))
            if fmt:
                c.number_format = fmt
    for i, sym in enumerate(symbols):
        r = first + i
        rows = hist[sym]
        closes = [x["close"] for x in rows]
        w = closes[-120:]
        lo_i = len(closes) - 120 + w.index(min(w))
        hi_i = len(closes) - 120 + w.index(max(w))
        ws.cell(row=r, column=2, value=rows[lo_i]["date"]).number_format = F_DATE
        ws.cell(row=r, column=3, value=rows[hi_i]["date"]).number_format = F_DATE
        ws.cell(row=r, column=4, value=80)
        ws.cell(row=r, column=13, value=34)
    style_data(ws, first, lastrow, 1, len(TC_COLS), size=9)
    for r in range(first, lastrow + 1):
        for j, (_k, _l, _d, _w2, fmt, _t) in enumerate(TC_COLS):
            if fmt:
                ws.cell(row=r, column=j + 1).number_format = fmt
        for key in ("low_date", "high_date", "cyc_len", "swing", "wave", "degree", "conf"):
            c = ws.cell(row=r, column=column_index_from_string(cm[key]))
            c.fill = PatternFill("solid", fgColor=K.C_INPUT_BG)
            c.font = Font(name=FONT, size=9, color=K.C_BLUE_INPUT)

    dvw = DataValidation(type="list", formula1='"1,2,3,4,5,A,B,C"', allow_blank=True)
    ws.add_data_validation(dvw)
    dvw.add("{c}{a}:{c}{b}".format(c=cm["wave"], a=first, b=lastrow))
    dvd = DataValidation(type="list",
                         formula1='"ریزموج,فرعی,میانی,اولیه,چرخه‌ای,ابرچرخه"', allow_blank=True)
    ws.add_data_validation(dvd)
    dvd.add("{c}{a}:{c}{b}".format(c=cm["degree"], a=first, b=lastrow))
    dvc = DataValidation(type="whole", operator="between", formula1=1, formula2=5, allow_blank=True)
    ws.add_data_validation(dvc)
    dvc.add("{c}{a}:{c}{b}".format(c=cm["conf"], a=first, b=lastrow))

    ws.conditional_formatting.add("{c}{a}:{c}{b}".format(c=cm["z_total"], a=first, b=lastrow),
                                  ColorScaleRule(start_type="num", start_value=-10, start_color=K.C_SSELL_BG,
                                                 mid_type="num", mid_value=0, mid_color="FFFFFF",
                                                 end_type="num", end_value=10, end_color=K.C_SBUY_BG))
    r2 = lastrow + 2
    for txt in [
        "منابع مرجع این لایه (برای توسعه آینده):",
        "• J.M. Hurst — The Profit Magic of Stock Transaction Timing  ·  مدل چرخه‌های اسمی و FLD",
        "• Christopher Grafton — Mastering Hurst Cycle Analysis  ·  اعتبارسنجی چرخه‌ها",
        "• James A. Hyerczyk — Pattern, Price & Time  ·  شمارش‌های زمانی گن",
        "• Lars von Thienen — Decoding the Hidden Market Rhythm  ·  استخراج چرخه غالب با تحلیل طیفی",
        "• Frost & Prechter — Elliott Wave Principle  ·  برچسب‌گذاری موج",
        "گام بعدی پیشنهادی: طول چرخه غالب (ستون D) به‌جای ورود دستی، با تحلیل طیفی در پایتون محاسبه و اینجا نوشته شود.",
    ]:
        note(ws, "A%d" % r2, txt, size=8 if txt.startswith("•") else 9,
             bold=not txt.startswith("•"), color="404040")
        ws.merge_cells(start_row=r2, start_column=1, end_row=r2, end_column=10)
        r2 += 1
    ws.freeze_panes = "B5"
    return ws, cm["z_total"]


# =====================================================================
# 7b) Time_Link — شیت پل امتیاز زمانی
# =====================================================================
def build_time_link(wb, symbols):
    """پل بین فایل سیگنال سهام و فایل تحلیل زمانی.

    چرا شیت پل و نه ارجاع بین‌فایلی: فرمول ارجاع به فایل دیگر (`='[1]X'!A1`)
    وقتی فایل مبدأ باز نباشد فقط مقدار کش‌شده را نشان می‌دهد و با بازنویسی
    توسط openpyxl کاملاً از بین می‌رود. این شیت را اسکریپت پایتون پر می‌کند:
        python -m timeframe export --workbook Stocks_Signals.xlsx
    """
    ws = wb.create_sheet("Time_Link")
    ws.sheet_view.rightToLeft = True
    cols = [("نماد", 12), ("امتیاز زمانی (−۱۰ تا +۱۰)", 22),
            ("اتکاپذیری", 14), ("چرخه معنادار؟", 14),
            ("تاریخ به‌روزرسانی", 16), ("منبع", 30)]
    title_block(ws, "پل امتیاز زمانی (Time_Link)",
                "این شیت را اسکریپت تحلیل زمانی پر می‌کند. تا وقتی خالی است، "
                "امتیاز زمانی صفر می‌ماند و چون وزنش هم صفر است، بر سیگنال اثری ندارد.",
                len(cols))
    widths(ws, [c[1] for c in cols])
    hdr(ws, 3, [c[0] for c in cols],
        ["از Watchlist", "محاسبه پایتون", "محاسبه پایتون", "محاسبه پایتون", "-", "-"])
    for i in range(N_SYM_ROWS):
        r = 5 + i
        ws.cell(row=r, column=1,
                value='=IF(COUNTA(Watchlist!$A${w})=0,"",Watchlist!$A${w})'.format(w=5 + i))
        ws.cell(row=r, column=2, value=0).number_format = F_NUM1
    style_data(ws, 5, 4 + N_SYM_ROWS, 1, len(cols), size=9)
    for r in range(5, 5 + N_SYM_ROWS):
        ws.cell(row=r, column=1).font = Font(name=FONT, size=9, bold=True)
        ws.cell(row=r, column=2).number_format = F_NUM1
        for cc in range(2, 5):
            ws.cell(row=r, column=cc).fill = PatternFill("solid", fgColor=K.C_INPUT_BG)
            ws.cell(row=r, column=cc).font = Font(name=FONT, size=9, color=K.C_GREEN_LINK)
    note(ws, "A%d" % (6 + N_SYM_ROWS),
         "برای پرکردن خودکار:  python -m timeframe export --workbook <همین فایل>  "
         "— اسکریپت امتیاز زمانی هر نماد را از تحلیل چرخه محاسبه و اینجا می‌نویسد.")
    ws.merge_cells(start_row=6 + N_SYM_ROWS, start_column=1,
                   end_row=6 + N_SYM_ROWS, end_column=len(cols))
    ws.freeze_panes = "A5"
    return ws


# =====================================================================
# 8) Signals
# =====================================================================
def build_signals(wb, symbols, calc_first, cm):
    ws = wb.create_sheet("Signals")
    ws.sheet_view.rightToLeft = True
    n = N_SYM_ROWS
    hrow, first = 3, 4
    lastrow = first + n - 1
    cols = [
        ("نماد", 11, None), ("نام شرکت", 26, None), ("صنعت", 22, None), ("بازار", 9, None),
        ("آخرین قیمت", 12, F_PRICE), ("درصد تغییر", 11, F_PCT2),
        ("روند کل بازار", 14, None), ("روند سهم", 13, None), ("ساختار روند", 20, None),
        ("جریان پول هوشمند", 20, None), ("قدرت خریدار", 11, F_X),
        ("وضعیت میانگین‌ها", 18, None), ("نسبت حجم", 10, F_X),
        ("امتیاز روند", 10, F_NUM1), ("امتیاز پول هوشمند", 11, F_NUM1),
        ("امتیاز میانگین‌ها", 11, F_NUM1), ("امتیاز حجم", 10, F_NUM1),
        ("امتیاز بازار", 10, F_NUM1), ("امتیاز زمان", 10, F_NUM1),
        ("امتیاز کل", 11, F_NUM1), ("سیگنال نهایی", 15, None), ("قدرت سیگنال", 10, "0"),
        ("دلیل سیگنال", 70, None), ("حد ضرر پیشنهادی", 13, F_PRICE),
        ("ریسک تا حد ضرر", 12, F_PCT), ("اعتبار", 13, None),
    ]
    title_block(ws, "جدول سیگنال نهایی (Signals)",
                "قابل فیلتر و مرتب‌سازی. امتیاز کل بین −۱۰ تا +۱۰ است و آستانه‌های برچسب در Settings تعریف شده‌اند.",
                len(cols))
    widths(ws, [c[1] for c in cols])
    for i, (lbl, _w, _f) in enumerate(cols):
        c = ws.cell(row=hrow, column=i + 1, value=lbl)
        c.font = Font(name=FONT, bold=True, color="FFFFFF", size=10)
        c.fill = PatternFill("solid", fgColor=K.C_HEADER_BG)
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = BORDER
    ws.row_dimensions[hrow].height = 32

    for i in range(n):
        r = first + i
        cr = calc_first + i          # ردیف متناظر در Calculations
        C = lambda key: "Calculations!$%s$%d" % (cm[key], cr)
        f = {
            1: '=IF({s}="","",{s})'.format(s=C("sym")),
            2: '=IFERROR(INDEX(Watchlist!$B$1:$B$5000,MATCH($A{r},Watchlist!$A$1:$A$5000,0)),"")'.format(r=r),
            3: '=IFERROR(INDEX(Watchlist!$F$1:$F$5000,MATCH($A{r},Watchlist!$A$1:$A$5000,0)),"")'.format(r=r),
            4: '=IFERROR(INDEX(Watchlist!$E$1:$E$5000,MATCH($A{r},Watchlist!$A$1:$A$5000,0)),"")'.format(r=r),
            5: '=IFERROR(%s,"")' % C("price"),
            6: '=IFERROR(%s,"")' % C("chgpct"),
            7: '=MARKET_LABEL',
            8: '=IF($N{r}>=6,"صعودی قوی",IF($N{r}>=2,"صعودی",IF($N{r}<=-6,"نزولی قوی",'
               'IF($N{r}<=-2,"نزولی","خنثی"))))'.format(r=r),
            9: '=IFERROR(%s,"")' % C("structure"),
            10: '=IF($O{r}>=6,"ورود قوی پول حقیقی",IF($O{r}>=2,"ورود پول حقیقی",'
                'IF($O{r}<=-6,"خروج قوی پول حقیقی",IF($O{r}<=-2,"خروج پول حقیقی","متعادل"))))'.format(r=r),
            11: '=IFERROR(%s,"")' % C("power"),
            12: '=IFERROR(%s,"")' % C("ma_align"),
            13: '=IFERROR(%s,"")' % C("volratio"),
            14: '=IFERROR(%s,0)' % C("t_score"),
            15: '=IFERROR(%s,0)' % C("s_score"),
            16: '=IFERROR(%s,0)' % C("m_score"),
            17: '=IFERROR(%s,0)' % C("v_score"),
            18: '=IFERROR(%s,0)' % C("k_score"),
            19: '=IFERROR(%s,0)' % C("z_score"),
            20: '=IFERROR(%s,0)' % C("total"),
            21: '=IF($T{r}>=TH_SBUY,"خرید قوی",IF($T{r}>=TH_BUY,"خرید",'
                'IF($T{r}<=TH_SSELL,"فروش قوی",IF($T{r}<=TH_SELL,"فروش","نگهداری"))))'.format(r=r),
            22: '=IFERROR(%s,1)' % C("strength"),
            23: ('="روند: "&$H{r}&" | ساختار: "&$I{r}&" | پول هوشمند: "&$J{r}'
                 '&" | قدرت خریدار: "&IFERROR(TEXT($K{r},"0.00"),"—")&"x"'
                 '&" | میانگین‌ها: "&IFERROR(TEXT({na},"0"),"—")&"/4 ("&$L{r}&")"'
                 '&" | حجم: "&IFERROR(TEXT($M{r},"0.00"),"—")&"x"'
                 '&" | بازار: "&$G{r}').format(r=r, na=C("n_above")),
            24: '=IFERROR(%s,"")' % C("stop"),
            25: '=IFERROR(($E{r}-$X{r})/$E{r},"")'.format(r=r),
            26: '=IFERROR(%s,"")' % C("liq"),
        }
        for ci, formula in f.items():
            c = ws.cell(row=r, column=ci, value=formula if ci == 1 else guard(formula, r))
            if cols[ci - 1][2]:
                c.number_format = cols[ci - 1][2]
    style_data(ws, first, lastrow, 1, len(cols), size=9)
    for r in range(first, lastrow + 1):
        for i, (_l, _w, fmt) in enumerate(cols):
            if fmt:
                ws.cell(row=r, column=i + 1).number_format = fmt
        ws.cell(row=r, column=1).font = Font(name=FONT, size=10, bold=True)
        ws.cell(row=r, column=2).alignment = Alignment(horizontal="right", vertical="center")
        ws.cell(row=r, column=3).alignment = Alignment(horizontal="right", vertical="center")
        ws.cell(row=r, column=23).alignment = Alignment(horizontal="right", vertical="center")
        ws.cell(row=r, column=23).font = Font(name=FONT, size=8, color="404040")

    tbl = Table(displayName="tblSignals",
                ref="A%d:%s%d" % (hrow, get_column_letter(len(cols)), lastrow))
    tbl.tableStyleInfo = TableStyleInfo(name="TableStyleMedium2", showRowStripes=True)
    ws.add_table(tbl)

    sig_rng = "U%d:U%d" % (first, lastrow)
    for label, bg, fg in (("خرید قوی", K.C_SBUY_BG, K.C_SBUY_FG), ("خرید", K.C_BUY_BG, K.C_BUY_FG),
                          ("نگهداری", K.C_HOLD_BG, K.C_HOLD_FG), ("فروش قوی", K.C_SSELL_BG, K.C_SSELL_FG),
                          ("فروش", K.C_SELL_BG, K.C_SELL_FG)):
        ws.conditional_formatting.add(sig_rng, CellIsRule(
            operator="equal", formula=['"%s"' % label],
            fill=PatternFill("solid", fgColor=bg), font=Font(color=fg, bold=True)))
    for col in ("N", "O", "P", "Q", "R", "S", "T"):
        ws.conditional_formatting.add("%s%d:%s%d" % (col, first, col, lastrow), ColorScaleRule(
            start_type="num", start_value=-10, start_color=K.C_SSELL_BG,
            mid_type="num", mid_value=0, mid_color="FFFFFF",
            end_type="num", end_value=10, end_color=K.C_SBUY_BG))
    ws.conditional_formatting.add("V%d:V%d" % (first, lastrow),
                                  DataBarRule(start_type="num", start_value=0,
                                              end_type="num", end_value=5, color="FFB628"))
    ws.conditional_formatting.add("Z%d:Z%d" % (first, lastrow), CellIsRule(
        operator="equal", formula=['"کم‌اعتبار"'],
        fill=PatternFill("solid", fgColor="FFE699"), font=Font(color="7F6000", bold=True)))
    ws.freeze_panes = "B4"
    return ws, first, lastrow


# =====================================================================
# 9) Options
# =====================================================================
OPT_SAMPLE = [
    # (نماد قرارداد, ISIN, نوع, پایه, اعمال, سررسید, DTE, آخرین, پایانی, حجم, ارزش, تعداد, OI, اندازه)
    ("ضفلا8001", "IRO9FOLD2261", "Call", "فولاد",  8000, datetime.date(2026, 10, 20), 45,  980,  950, 3_240, 3_078_000_000, 412, 18_500, 1000),
    ("ضفلا9001", "IRO9FOLD2271", "Call", "فولاد",  9000, datetime.date(2026, 10, 20), 45,  430,  418, 1_870, 781_660_000, 265, 11_200, 1000),
    ("طفلا8001", "IRO9FOLD2281", "Put",  "فولاد",  8000, datetime.date(2026, 10, 20), 45,  505,  520,   640, 332_800_000,  98,  4_300, 1000),
    ("ضگل11001", "IRO9GOLG3011", "Call", "كگل",   11000, datetime.date(2026, 9, 30),  25,  790,  775, 2_110, 1_635_250_000, 301, 9_800, 1000),
    ("ضگل12001", "IRO9GOLG3021", "Call", "كگل",   12000, datetime.date(2026, 9, 30),  25,  240,  232,   180, 41_760_000,   34,  2_100, 1000),
    ("طگل11001", "IRO9GOLG3031", "Put",  "كگل",   11000, datetime.date(2026, 9, 30),  25,  700,  690,    60, 41_400_000,   12,  1_450, 1000),
    ("ضخود2501", "IRO9IKCO4011", "Call", "خودرو",  2500, datetime.date(2026, 9, 22),  17, 1560, 1545,   940, 1_452_300_000, 155, 6_700, 1000),
    ("طخود4001", "IRO9IKCO4021", "Put",  "خودرو",  4000, datetime.date(2026, 9, 22),  17,  380,  395, 1_320, 521_400_000, 201,  7_900, 1000),
]

OPT_COLS = [
    ("نماد قرارداد", "instrumentName", 13, None),
    ("ISIN", "instrumentId", 15, "@"),
    ("نوع", "-", 8, None),
    ("نماد پایه", "-", 11, None),
    ("قیمت اعمال", "qeymateEmal", 12, F_PRICE),
    ("تاریخ سررسید", "tarixSarresid", 13, F_DATE),
    ("روز تا سررسید", "baghimandetasarresid", 11, "0"),
    ("آخرین قیمت", "lastPrice", 11, F_PRICE),
    ("قیمت پایانی", "closingPrice", 11, F_PRICE),
    ("حجم معاملات", "tradeVolume", 12, F_INT),
    ("ارزش معاملات", "tradeValue", 15, F_INT),
    ("تعداد معاملات", "tradeCount", 11, F_INT),
    ("موقعیت‌های باز ⚠️", "openInterest", 12, F_INT),
    ("اندازه قرارداد", "andazeyeQarardad", 11, F_INT),
    ("قیمت دارایی پایه", "Underlying", 13, F_PRICE),
    ("مانی‌نس (S÷K)", "-", 11, F_NUM2),
    ("وضعیت", "ITM/ATM/OTM", 10, None),
    ("ارزش ذاتی", "-", 11, F_PRICE),
    ("ارزش زمانی", "-", 11, F_PRICE),
    ("زمان تا سررسید (سال)", "-", 11, F_NUM2),
    ("نوسان ضمنی تقریبی", "Brenner-Subrahmanyam", 12, F_PCT),
    ("d1", "Black-Scholes", 9, F_NUM2),
    ("d2", "Black-Scholes", 9, F_NUM2),
    ("دلتا", "N(d1)", 9, F_NUM2),
    ("قیمت نظری", "Black-Scholes", 11, F_PRICE),
    ("بازار ÷ نظری", "گران/ارزان", 11, F_NUM2),
    ("اهرم مؤثر", "S×|Δ|÷P", 10, F_NUM1),
    ("امتیاز سهم پایه", "Underlying", 11, F_NUM1),
    ("نقدشوندگی معتبر؟", "OPT_MIN_*", 11, None),
    ("امتیاز آپشن", "−۱۰ تا +۱۰", 11, F_NUM1),
    ("سیگنال آپشن", "-", 20, None),
    ("دلیل", "-", 62, None),
]


def build_options(wb):
    ws = wb.create_sheet("Options")
    ws.sheet_view.rightToLeft = True
    hrow, first = 3, 4
    lastrow = first + len(OPT_SAMPLE) - 1
    title_block(ws, "بخش اختیار معامله (Options)",
                "سیگنال آپشن = وضعیت سهم پایه + گران/ارزان بودن قرارداد + مانی‌نس + نقدشوندگی. "
                "نوسان ضمنی با تقریب Brenner–Subrahmanyam محاسبه می‌شود و فقط نزدیک ATM معتبر است.",
                len(OPT_COLS))
    widths(ws, [c[2] for c in OPT_COLS])
    hdr(ws, hrow, [c[0] for c in OPT_COLS], [c[1] for c in OPT_COLS])
    first = hrow + 2
    lastrow = first + N_OPT_ROWS - 1

    for i in range(N_OPT_ROWS):
        r = first + i
        if i < len(OPT_SAMPLE):
            for j, v in enumerate(OPT_SAMPLE[i]):
                c = ws.cell(row=r, column=j + 1, value=v)
                if OPT_COLS[j][3]:
                    c.number_format = OPT_COLS[j][3]
        F = {
            15: '=IFERROR(INDEX(Underlying!$B$1:$B$5000,MATCH($D{r},Underlying!$A$1:$A$5000,0)),"")',
            16: '=IFERROR($O{r}/$E{r},"")',
            17: '=IF($P{r}="","",IF($C{r}="Call",IF($P{r}>1+OPT_ATM_BAND,"ITM",IF($P{r}<1-OPT_ATM_BAND,"OTM","ATM")),'
                'IF($P{r}<1-OPT_ATM_BAND,"ITM",IF($P{r}>1+OPT_ATM_BAND,"OTM","ATM"))))',
            18: '=IFERROR(IF($C{r}="Call",MAX(0,$O{r}-$E{r}),MAX(0,$E{r}-$O{r})),"")',
            19: '=IFERROR(MAX(0,$I{r}-$R{r}),"")',
            20: '=IFERROR($G{r}/365,"")',
            21: '=IF(OR($P{r}="",ABS($P{r}-1)>3*OPT_ATM_BAND),"",'
                'IFERROR($I{r}/$O{r}*SQRT(2*PI()/$T{r}),""))',
            22: '=IFERROR((LN($O{r}/$E{r})+(OPT_RF+OPT_VOL^2/2)*$T{r})/(OPT_VOL*SQRT($T{r})),"")',
            23: '=IFERROR($V{r}-OPT_VOL*SQRT($T{r}),"")',
            24: '=IFERROR(IF($C{r}="Call",NORMSDIST($V{r}),NORMSDIST($V{r})-1),"")',
            25: '=IFERROR(IF($C{r}="Call",$O{r}*NORMSDIST($V{r})-$E{r}*EXP(-OPT_RF*$T{r})*NORMSDIST($W{r}),'
                '$E{r}*EXP(-OPT_RF*$T{r})*NORMSDIST(-$W{r})-$O{r}*NORMSDIST(-$V{r})),"")',
            26: '=IFERROR($I{r}/$Y{r},"")',
            27: '=IFERROR($O{r}*ABS($X{r})/$I{r},"")',
            28: '=IFERROR(INDEX(Underlying!$D$1:$D$5000,MATCH($D{r},Underlying!$A$1:$A$5000,0)),0)',
            29: '=IF(AND($J{r}>=OPT_MIN_VOL,$G{r}>=OPT_MIN_DTE),"بله","خیر")',
            30: '=IF($AC{r}="خیر",0,IFERROR(MAX(-10,MIN(10,'
                'IF($C{r}="Call",$AB{r},-$AB{r})*0.6'
                '+IF($Z{r}<0.85,2,IF($Z{r}>1.25,-2,0))'
                '+IF($Q{r}="ATM",1,IF($Q{r}="ITM",0.5,-1))'
                '+IF($G{r}>=30,0.5,-0.5))),0))',
            31: '=IF($AC{r}="خیر","بدون سیگنال (نقدشوندگی/سررسید)",'
                'IF($AD{r}>=TH_SBUY,"خرید قوی "&$C{r},IF($AD{r}>=TH_BUY,"خرید "&$C{r},'
                'IF($AD{r}<=TH_SSELL,"اجتناب / بستن موقعیت",IF($AD{r}<=TH_SELL,"ضعیف","بی‌طرف")))))',
            32: '="سهم پایه: "&IFERROR(TEXT($AB{r},"0.0"),"—")&" | وضعیت: "&$Q{r}'
                '&" | نوسان ضمنی: "&IFERROR(TEXT($U{r},"0%"),"—")'
                '&" | بازار÷نظری: "&IFERROR(TEXT($Z{r},"0.00"),"—")'
                '&" | اهرم: "&IFERROR(TEXT($AA{r},"0.0"),"—")&"x"'
                '&" | "&$G{r}&" روز تا سررسید"',
        }
        for ci, tmpl in F.items():
            c = ws.cell(row=r, column=ci, value=guard(tmpl.format(r=r), r))
            if OPT_COLS[ci - 1][3]:
                c.number_format = OPT_COLS[ci - 1][3]
    style_data(ws, first, lastrow, 1, len(OPT_COLS), size=9)
    for r in range(first, lastrow + 1):
        for i, col in enumerate(OPT_COLS):
            if col[3]:
                ws.cell(row=r, column=i + 1).number_format = col[3]
        ws.cell(row=r, column=1).font = Font(name=FONT, size=9, bold=True)
        ws.cell(row=r, column=32).alignment = Alignment(horizontal="right", vertical="center")
        ws.cell(row=r, column=32).font = Font(name=FONT, size=8, color="404040")

    ws.conditional_formatting.add("AE%d:AE%d" % (first, lastrow), FormulaRule(
        formula=['ISNUMBER(SEARCH("خرید قوی",$AE%d))' % first],
        fill=PatternFill("solid", fgColor=K.C_SBUY_BG), font=Font(color=K.C_SBUY_FG, bold=True)))
    ws.conditional_formatting.add("AE%d:AE%d" % (first, lastrow), FormulaRule(
        formula=['AND(ISNUMBER(SEARCH("خرید",$AE%d)),NOT(ISNUMBER(SEARCH("قوی",$AE%d))))' % (first, first)],
        fill=PatternFill("solid", fgColor=K.C_BUY_BG), font=Font(color=K.C_BUY_FG, bold=True)))
    ws.conditional_formatting.add("AE%d:AE%d" % (first, lastrow), FormulaRule(
        formula=['ISNUMBER(SEARCH("اجتناب",$AE%d))' % first],
        fill=PatternFill("solid", fgColor=K.C_SSELL_BG), font=Font(color=K.C_SSELL_FG, bold=True)))
    ws.conditional_formatting.add("AD%d:AD%d" % (first, lastrow), ColorScaleRule(
        start_type="num", start_value=-10, start_color=K.C_SSELL_BG,
        mid_type="num", mid_value=0, mid_color="FFFFFF",
        end_type="num", end_value=10, end_color=K.C_SBUY_BG))
    ws.conditional_formatting.add("AC%d:AC%d" % (first, lastrow), CellIsRule(
        operator="equal", formula=['"خیر"'],
        fill=PatternFill("solid", fgColor="FFE699"), font=Font(color="7F6000", bold=True)))
    ws.auto_filter.ref = "A%d:%s%d" % (hrow + 1, get_column_letter(len(OPT_COLS)), lastrow)
    ws.freeze_panes = "E%d" % first

    r2 = lastrow + 2
    for txt in [
        "⚠️ نکات صحت داده در این شیت:",
        "• فیلد openInterest (موقعیت‌های باز) در مستندات ریپو ثبت نشده است؛ نام دقیق آن باید با یک پاسخ واقعی MarketWatchOption تأیید شود.",
        "• نوسان ضمنی با تقریب Brenner–Subrahmanyam محاسبه شده: IV ≈ (C/S)×√(2π/T). این تقریب فقط نزدیک ATM دقت قابل قبول دارد؛ برای OTM عمیق خطا زیاد است.",
        "• قیمت نظری بلک-شولز با نوسان فرضی OPT_VOL از شیت Settings محاسبه می‌شود، نه با نوسان ضمنی بازار — یعنی «گران/ارزان» نسبت به فرض شماست، نه حقیقت مطلق.",
        "• بلک-شولز برای اختیار اروپایی است. اگر قرارداد آمریکایی باشد، قیمت نظری اختیار فروش کم‌برآورد می‌شود.",
    ]:
        note(ws, "A%d" % r2, txt, size=8, bold=txt.startswith("⚠️"),
             color="C00000" if txt.startswith("⚠️") else "404040")
        ws.merge_cells(start_row=r2, start_column=1, end_row=r2, end_column=14)
        r2 += 1
    return ws, first, lastrow


# =====================================================================
# 9b) Underlying — شیت پل دارایی پایه برای فایل آپشن
# =====================================================================
UNDERLYING_ROWS = 40


def build_underlying(wb, symbols=None):
    """پل بین فایل آپشن و فایل سیگنال سهام.

    فایل آپشن باید بداند قیمت و امتیاز سهم پایه چند است. به‌جای ارجاع
    بین‌فایلی شکننده، این جدول را اسکریپت پر می‌کند:
        python scripts/link_workbooks.py
    """
    ws = wb.create_sheet("Underlying")
    ws.sheet_view.rightToLeft = True
    cols = [("نماد پایه", 12), ("آخرین قیمت", 14), ("قیمت پایانی", 14),
            ("امتیاز کل سهم", 14), ("سیگنال سهم", 16), ("قدرت سیگنال", 12),
            ("تاریخ به‌روزرسانی", 16)]
    title_block(ws, "دارایی پایه (Underlying)",
                "این جدول را اسکریپت link_workbooks.py از فایل Stocks_Signals.xlsx "
                "پر می‌کند. تا وقتی خالی است، محاسبات آپشن مقدار نمی‌گیرند.",
                len(cols))
    widths(ws, [c[1] for c in cols])
    hdr(ws, 3, [c[0] for c in cols],
        ["lVal18AFC", "pDrCotVal", "pClosing", "امتیاز کل", "برچسب", "۱ تا ۵", "-"])
    seeds = sorted({row[3] for row in OPT_SAMPLE})
    for i in range(UNDERLYING_ROWS):
        r = 5 + i
        if i < len(seeds):
            ws.cell(row=r, column=1, value=seeds[i])
        for cc in range(1, len(cols) + 1):
            cell = ws.cell(row=r, column=cc)
            cell.border = BORDER
            cell.font = Font(name=FONT, size=9,
                             color=K.C_BLUE_INPUT if cc <= 6 else K.C_NOTE)
            cell.alignment = Alignment(horizontal="center", vertical="center")
            if cc <= 6:
                cell.fill = PatternFill("solid", fgColor=K.C_INPUT_BG)
        ws.cell(row=r, column=2).number_format = F_PRICE
        ws.cell(row=r, column=3).number_format = F_PRICE
        ws.cell(row=r, column=4).number_format = F_NUM1
    note(ws, "A%d" % (6 + UNDERLYING_ROWS),
         "برای پرکردن خودکار:  python scripts/link_workbooks.py "
         "--stocks Stocks_Signals.xlsx --options Options_Signals.xlsx")
    ws.merge_cells(start_row=6 + UNDERLYING_ROWS, start_column=1,
                   end_row=6 + UNDERLYING_ROWS, end_column=len(cols))
    ws.freeze_panes = "A5"
    return ws


# =====================================================================
# 10) Dashboard
# =====================================================================
def build_dashboard(wb, sig_first, sig_last, calc_first, calc_last, cm, wl_last):
    ws = wb.create_sheet("Dashboard", 0)
    ws.sheet_view.rightToLeft = True
    ws.sheet_view.showGridLines = False
    title_block(ws, "داشبورد سیگنال بازار سرمایه ایران",
                DEMO_BANNER, 8)
    ws["A2"].font = Font(name=FONT, size=9, bold=True, italic=True, color="C00000")
    widths(ws, [26, 20, 4, 26, 20, 4, 30, 30])

    def section(row, text, c1=1, c2=8):
        ws.cell(row=row, column=c1, value=text)
        for c in range(c1, c2 + 1):
            cell = ws.cell(row=row, column=c)
            cell.fill = PatternFill("solid", fgColor=K.C_SECTION_BG)
            cell.font = Font(name=FONT, bold=True, size=11, color="FFFFFF")
            cell.alignment = Alignment(horizontal="right", vertical="center")
        ws.row_dimensions[row].height = 22

    def kpi(row, col, label, formula, fmt=None, big=False):
        lc = ws.cell(row=row, column=col, value=label)
        lc.font = Font(name=FONT, size=9)
        lc.alignment = Alignment(horizontal="right", vertical="center")
        vc = ws.cell(row=row, column=col + 1, value=formula)
        vc.font = Font(name=FONT, size=12 if big else 10, bold=True, color=K.C_GREEN_LINK)
        vc.alignment = Alignment(horizontal="center", vertical="center")
        vc.border = BORDER
        if fmt:
            vc.number_format = fmt
        return vc

    S = "Signals!$U$%d:$U$%d" % (sig_first, sig_last)
    T = "Signals!$T$%d:$T$%d" % (sig_first, sig_last)
    CV = "Calculations!${c}${a}:${c}${b}".format(c=cm["value_b"], a=calc_first, b=calc_last)
    CN = "Calculations!${c}${a}:${c}${b}".format(c=cm["net_val_b"], a=calc_first, b=calc_last)
    C5 = "Calculations!${c}${a}:${c}${b}".format(c=cm["net5_b"], a=calc_first, b=calc_last)

    section(4, "۱) وضعیت کلی بازار")
    kpi(5, 1, "تاریخ آخرین داده", '=IFERROR(INDEX(Market_Index!$C$1:$C$5000,MI_LASTROW),"—")')
    kpi(6, 1, "شاخص کل", '=IFERROR(INDEX(Market_Index!$D$1:$D$5000,MI_LASTROW),"—")', '#,##0')
    kpi(7, 1, "تغییر روزانه شاخص کل", '=IFERROR(INDEX(Market_Index!$E$1:$E$5000,MI_LASTROW),"—")', F_PCT2)
    kpi(8, 1, "شاخص کل هم‌وزن", '=IFERROR(INDEX(Market_Index!$I$1:$I$5000,MI_LASTROW),"—")', '#,##0')
    kpi(9, 1, "تغییر روزانه هم‌وزن", '=IFERROR(INDEX(Market_Index!$J$1:$J$5000,MI_LASTROW),"—")', F_PCT2)
    v = kpi(10, 1, "امتیاز رژیم بازار (−۱۰ تا +۱۰)", '=MARKET_SCORE', F_NUM1, big=True)
    kpi(11, 1, "وضعیت بازار", '=MARKET_LABEL', None, big=True)

    kpi(5, 4, "تعداد نمادهای تحت نظر", '=COUNTA(Watchlist!$A$5:$A$%d)' % wl_last, "0")
    kpi(6, 4, "ارزش معاملات نمادهای تحت نظر (م.ریال)", '=IFERROR(SUM(%s),0)' % CV, F_NUM1)
    kpi(7, 4, "خالص ورود پول حقیقی امروز (م.ریال)", '=IFERROR(SUM(%s),0)' % CN, F_NUM1)
    kpi(8, 4, "خالص ورود پول حقیقی ۵ روزه (م.ریال)", '=IFERROR(SUM(%s),0)' % C5, F_NUM1)
    kpi(9, 4, "میانگین امتیاز کل نمادها", '=IFERROR(AVERAGE(%s),0)' % T, F_NUM1)
    kpi(10, 4, "نسبت سیگنال خرید به فروش",
        '=IFERROR((COUNTIF({s},"خرید قوی")+COUNTIF({s},"خرید"))/'
        '(COUNTIF({s},"فروش قوی")+COUNTIF({s},"فروش")),"—")'.format(s=S), F_NUM2)
    kpi(11, 4, "جمع وزن‌های سیستم", '=W_SUM', F_PCT)

    for cell, op, f, bg, fg in (("B10", "greaterThanOrEqual", ["5"], K.C_SBUY_BG, K.C_SBUY_FG),
                                ("B10", "lessThanOrEqual", ["-5"], K.C_SSELL_BG, K.C_SSELL_FG),
                                ("E7", "lessThan", ["0"], K.C_SELL_BG, K.C_SELL_FG),
                                ("E7", "greaterThan", ["0"], K.C_BUY_BG, K.C_BUY_FG),
                                ("E11", "notEqual", ["1"], K.C_SSELL_BG, K.C_SSELL_FG)):
        ws.conditional_formatting.add(cell, CellIsRule(
            operator=op, formula=f, fill=PatternFill("solid", fgColor=bg),
            font=Font(color=fg, bold=True)))

    section(13, "۲) خلاصه سیگنال‌ها")
    labels = [("خرید قوی", K.C_SBUY_BG, K.C_SBUY_FG), ("خرید", K.C_BUY_BG, K.C_BUY_FG),
              ("نگهداری", K.C_HOLD_BG, K.C_HOLD_FG), ("فروش", K.C_SELL_BG, K.C_SELL_FG),
              ("فروش قوی", K.C_SSELL_BG, K.C_SSELL_FG)]
    for i, (lbl, bg, fg) in enumerate(labels):
        c = ws.cell(row=14, column=1 + i, value=lbl)
        c.fill = PatternFill("solid", fgColor=bg)
        c.font = Font(name=FONT, bold=True, size=10, color=fg)
        c.alignment = Alignment(horizontal="center", vertical="center")
        c.border = BORDER
        v = ws.cell(row=15, column=1 + i, value='=COUNTIF(%s,"%s")' % (S, lbl))
        v.font = Font(name=FONT, bold=True, size=16)
        v.alignment = Alignment(horizontal="center", vertical="center")
        v.border = BORDER
        v.number_format = "0"
    ws.row_dimensions[15].height = 26
    ws.cell(row=16, column=1, value="سیگنال‌های «کم‌اعتبار» (نقدشوندگی پایین):")
    ws.cell(row=16, column=1).font = Font(name=FONT, size=9, italic=True)
    ws.cell(row=16, column=1).alignment = Alignment(horizontal="right", vertical="center")
    ws.cell(row=16, column=2,
            value='=COUNTIF(Signals!$Z$%d:$Z$%d,"کم‌اعتبار")' % (sig_first, sig_last)).font = \
        Font(name=FONT, size=10, bold=True, color="7F6000")
    ws.cell(row=16, column=2).alignment = Alignment(horizontal="center", vertical="center")

    top_hdrs = ["رتبه", "نماد", "نام شرکت", "آخرین قیمت", "امتیاز کل", "سیگنال", "قدرت", "جریان پول هوشمند"]
    top_w = [7, 12, 26, 13, 11, 14, 8, 22]

    def top_block(start_row, title, rank_col, qualify, n=10):
        section(start_row, title)
        for i, h in enumerate(top_hdrs):
            c = ws.cell(row=start_row + 1, column=1 + i, value=h)
            c.font = Font(name=FONT, bold=True, size=9, color="FFFFFF")
            c.fill = PatternFill("solid", fgColor=K.C_HEADER_BG)
            c.alignment = Alignment(horizontal="center", vertical="center")
            c.border = BORDER
        rng = "Calculations!${c}${a}:${c}${b}".format(c=rank_col, a=calc_first, b=calc_last)
        symrng = "Calculations!$A${a}:$A${b}".format(a=calc_first, b=calc_last)
        for k in range(1, n + 1):
            r = start_row + 1 + k
            ws.cell(row=r, column=1, value=k).font = Font(name=FONT, size=9, bold=True)
            ws.cell(row=r, column=1).alignment = Alignment(horizontal="center", vertical="center")
            totrng = "Calculations!${c}${a}:${c}${b}".format(
                c=cm["total"], a=calc_first, b=calc_last)
            sym = ('=IFERROR(IF(INDEX({tr},MATCH({k},{rr},0)){q},'
                   'INDEX({sr},MATCH({k},{rr},0)),""),"")').format(
                sr=symrng, rr=rng, tr=totrng, k=k, q=qualify)
            ws.cell(row=r, column=2, value=sym)
            for ci, scol, fmt in ((3, "B", None), (4, "E", F_PRICE), (5, "T", F_NUM1),
                                  (6, "U", None), (7, "V", "0"), (8, "J", None)):
                f = ('=IF($B{r}="","",IFERROR(INDEX(Signals!${c}${a}:${c}${b},'
                     'MATCH($B{r},Signals!$A${a}:$A${b},0)),""))').format(
                    r=r, c=scol, a=sig_first, b=sig_last)
                cc = ws.cell(row=r, column=ci, value=f)
                if fmt:
                    cc.number_format = fmt
            style_data(ws, r, r, 1, 8, size=9)
            ws.cell(row=r, column=3).alignment = Alignment(horizontal="right", vertical="center")
            ws.cell(row=r, column=8).alignment = Alignment(horizontal="right", vertical="center")
            ws.cell(row=r, column=2).font = Font(name=FONT, size=10, bold=True)
        rr = "F{a}:F{b}".format(a=start_row + 2, b=start_row + 1 + n)
        for lbl, bg, fg in labels:
            ws.conditional_formatting.add(rr, CellIsRule(
                operator="equal", formula=['"%s"' % lbl],
                fill=PatternFill("solid", fgColor=bg), font=Font(color=fg, bold=True)))
        ws.conditional_formatting.add("E{a}:E{b}".format(a=start_row + 2, b=start_row + 1 + n),
                                      ColorScaleRule(start_type="num", start_value=-10, start_color=K.C_SSELL_BG,
                                                     mid_type="num", mid_value=0, mid_color="FFFFFF",
                                                     end_type="num", end_value=10, end_color=K.C_SBUY_BG))
        return start_row + 1 + n

    end1 = top_block(18, "۳) ده نماد برتر برای خرید (فقط امتیاز ≥ حد خرید)",
                     cm["rank_buy"], ">=TH_BUY")
    end2 = top_block(end1 + 2, "۴) ده نماد برتر برای فروش (فقط امتیاز ≤ حد فروش)",
                     cm["rank_sell"], "<=TH_SELL")

    for i, w in enumerate(top_w):
        ws.column_dimensions[get_column_letter(i + 1)].width = max(
            ws.column_dimensions[get_column_letter(i + 1)].width or 0, w)

    r2 = end2 + 2
    for txt in [
        "خواندن این داشبورد از راست به چپ و از بالا به پایین: اول «امتیاز رژیم بازار» را ببینید.",
        "اگر رژیم بازار نزولی قوی است، سیگنال‌های خرید تک‌سهم را با احتیاط بیشتری بخوانید — سیستم این را با وزن W_MARKET لحاظ کرده ولی جایگزین قضاوت شما نیست.",
        "ردیف‌هایی که در ستون «اعتبار» شیت Signals «کم‌اعتبار» خورده‌اند، ارزش معاملات‌شان از حد MIN_LIQ_B کمتر است و سیگنالشان قابل اجرا نیست.",
    ]:
        note(ws, "A%d" % r2, txt, size=9, color="404040")
        ws.merge_cells(start_row=r2, start_column=1, end_row=r2, end_column=8)
        r2 += 1
    ws.freeze_panes = "A5"
    return ws


# =====================================================================
# 11) API_Map  (قرارداد بین اکسل و اسکریپت پایتون)
# =====================================================================
CDN = "https://cdn.tsetmc.com/api"
GW = "https://webgw.tse.ir/InstrumentProvider/api/v1"

FIELD_SRC = {
    "lVal18AFC": (CDN + "/Instrument/GetInstrumentSearch/{Query}", "نام کوتاه نماد", "نمونه ساختاری ریپو"),
    "lVal30": (CDN + "/Instrument/GetInstrumentSearch/{Query}", "نام کامل شرکت/شاخص", "نمونه ساختاری ریپو"),
    "insCode": (CDN + "/Instrument/GetInstrumentSearch/{Query}", "کلید اصلی همه endpointهای cdn", "تست واقعی"),
    "cIsin": (CDN + "/Instrument/GetInstrumentIdentity/{InsCode}", "کلید اصلی endpointهای webgw", "نمونه ساختاری ریپو"),
    "flowTitle": (CDN + "/Instrument/GetInstrumentSearch/{Query}", "بورس / فرابورس", "نمونه ساختاری ریپو"),
    "lSecVal": (CDN + "/Instrument/GetInstrumentIdentity/{InsCode}", "sector.lSecVal — نام صنعت", "تست واقعی"),
    "cEtavalTitle": (CDN + "/ClosingPrice/GetClosingPriceInfo/{InsCode}", "instrumentState.cEtavalTitle — مجاز/متوقف", "تست واقعی"),
    "hEven": (CDN + "/ClosingPrice/GetClosingPriceInfo/{InsCode}", "زمان آخرین به‌روزرسانی", "تست واقعی"),
    "pDrCotVal": (CDN + "/ClosingPrice/GetClosingPriceInfo/{InsCode}", "آخرین قیمت معامله", "نمونه ساختاری ریپو"),
    "pClosing": (CDN + "/ClosingPrice/GetClosingPriceInfo/{InsCode}", "قیمت پایانی", "نمونه ساختاری ریپو"),
    "priceChange": (CDN + "/ClosingPrice/GetClosingPriceInfo/{InsCode}", "تغییر مطلق قیمت", "نمونه ساختاری ریپو"),
    "priceChangePercent": (CDN + "/ClosingPrice/GetClosingPriceInfo/{InsCode}", "درصد تغییر", "نمونه ساختاری ریپو"),
    "zTotTran": (CDN + "/ClosingPrice/GetClosingPriceInfo/{InsCode}", "تعداد معاملات", "نمونه ساختاری ریپو"),
    "qTotTran5J": (CDN + "/ClosingPrice/GetClosingPriceInfo/{InsCode}", "حجم معاملات", "نمونه ساختاری ریپو"),
    "qTotCap": (CDN + "/ClosingPrice/GetClosingPriceInfo/{InsCode}", "ارزش معاملات", "نمونه ساختاری ریپو"),
    "priceYesterday": (GW + "/History/Archive/fa?InstrumentId={ISIN}", "قیمت روز قبل", "تست واقعی"),
    "firstPrice": (GW + "/Instrument/LiveInstrumentByIdQuery/fa?InstrumentId={ISIN}", "اولین قیمت روز", "تست واقعی"),
    "highValue": (GW + "/Instrument/LiveInstrumentByIdQuery/fa?InstrumentId={ISIN}", "⚠️ بیشترین قیمت روز — تفکیک highValue از maxValue باید با پاسخ واقعی تأیید شود", "نیازمند تأیید"),
    "lowValue": (GW + "/Instrument/LiveInstrumentByIdQuery/fa?InstrumentId={ISIN}", "⚠️ کمترین قیمت روز — همان ابهام بالا", "نیازمند تأیید"),
    "marketvalue": (GW + "/Instrument/LiveInstrumentByIdQuery/fa?InstrumentId={ISIN}", "ارزش بازار", "تست واقعی"),
    "sharecount": (GW + "/Instrument/LiveInstrumentByIdQuery/fa?InstrumentId={ISIN}", "تعداد سهام", "تست واقعی"),
    "buy_I_Volume": (CDN + "/ClientType/GetClientType/{InsCode}/1/0", "⚠️ حجم خرید حقیقی — نام فیلد در مستند ریپو ثبت نشده", "نیازمند تأیید"),
    "sell_I_Volume": (CDN + "/ClientType/GetClientType/{InsCode}/1/0", "⚠️ حجم فروش حقیقی — نیازمند تأیید", "نیازمند تأیید"),
    "buy_CountI": (CDN + "/ClientType/GetClientType/{InsCode}/1/0", "⚠️ تعداد کدهای خریدار حقیقی — نیازمند تأیید", "نیازمند تأیید"),
    "sell_CountI": (CDN + "/ClientType/GetClientType/{InsCode}/1/0", "⚠️ تعداد کدهای فروشنده حقیقی — نیازمند تأیید", "نیازمند تأیید"),
    "buy_N_Volume": (CDN + "/ClientType/GetClientType/{InsCode}/1/0", "⚠️ حجم خرید حقوقی — نیازمند تأیید", "نیازمند تأیید"),
    "sell_N_Volume": (CDN + "/ClientType/GetClientType/{InsCode}/1/0", "⚠️ حجم فروش حقوقی — نیازمند تأیید", "نیازمند تأیید"),
    "buy_CountN": (CDN + "/ClientType/GetClientType/{InsCode}/1/0", "⚠️ تعداد کدهای خریدار حقوقی — نیازمند تأیید", "نیازمند تأیید"),
    "sell_CountN": (CDN + "/ClientType/GetClientType/{InsCode}/1/0", "⚠️ تعداد کدهای فروشنده حقوقی — نیازمند تأیید", "نیازمند تأیید"),
    "pMeDem_1": (CDN + "/BestLimits/{InsCode}", "bestLimits[0].pMeDem — بهترین قیمت خرید", "نمونه ساختاری ریپو"),
    "qTitMeDem_1": (CDN + "/BestLimits/{InsCode}", "⚠️ حجم بهترین خرید — در نمونه ریپو نبود", "نیازمند تأیید"),
    "zOrdMeDem_1": (CDN + "/BestLimits/{InsCode}", "bestLimits[0].zOrdMeDem — تعداد سفارش خرید", "نمونه ساختاری ریپو"),
    "pMeOf_1": (CDN + "/BestLimits/{InsCode}", "bestLimits[0].pMeOf — بهترین قیمت فروش", "نمونه ساختاری ریپو"),
    "qTitMeOf_1": (CDN + "/BestLimits/{InsCode}", "⚠️ حجم بهترین فروش — در نمونه ریپو نبود", "نیازمند تأیید"),
    "zOrdMeOf_1": (CDN + "/BestLimits/{InsCode}", "bestLimits[0].zOrdMeOf — تعداد سفارش فروش", "نمونه ساختاری ریپو"),
    "eps": (CDN + "/Instrument/GetInstrumentInfo/{InsCode}", "سود هر سهم", "تست واقعی"),
    "dEven": (CDN + "/ClosingPrice/GetClosingPriceDailyList/{InsCode}/{Top}", "تاریخ به فرم YYYYMMDD", "تست واقعی"),
    "priceFirst": (CDN + "/ClosingPrice/GetClosingPriceDailyList/{InsCode}/{Top}", "اولین قیمت روز تاریخی", "تست واقعی"),
    "priceMax": (CDN + "/ClosingPrice/GetClosingPriceDailyList/{InsCode}/{Top}", "بیشترین قیمت روز تاریخی", "تست واقعی"),
    "priceMin": (CDN + "/ClosingPrice/GetClosingPriceDailyList/{InsCode}/{Top}", "کمترین قیمت روز تاریخی", "تست واقعی"),
    "xDrNivJIdx004": (CDN + "/Index/GetIndexB1LastAll/SelectedIndexes/1", "مقدار شاخص — کل: 32097828799138957 · هم‌وزن: 67130298613737946", "تست واقعی"),
    "instrumentName": (GW + "/MarketWatch/MarketWatchOption/fa", "نماد قرارداد اختیار", "تست واقعی"),
    "instrumentId": (GW + "/MarketWatch/MarketWatchOption/fa", "ISIN قرارداد", "تست واقعی"),
    "qeymateEmal": (GW + "/MarketWatch/MarketWatchOption/fa", "قیمت اعمال", "تست واقعی"),
    "tarixSarresid": (GW + "/MarketWatch/MarketWatchOption/fa", "تاریخ سررسید", "تست واقعی"),
    "baghimandetasarresid": (GW + "/MarketWatch/MarketWatchOption/fa", "روز مانده تا سررسید", "تست واقعی"),
    "lastPrice": (GW + "/MarketWatch/MarketWatchOption/fa", "آخرین قیمت قرارداد", "تست واقعی"),
    "closingPrice": (GW + "/MarketWatch/MarketWatchOption/fa", "قیمت پایانی قرارداد", "تست واقعی"),
    "tradeVolume": (GW + "/MarketWatch/MarketWatchOption/fa", "حجم معاملات قرارداد", "تست واقعی"),
    "tradeValue": (GW + "/MarketWatch/MarketWatchOption/fa", "ارزش معاملات قرارداد", "تست واقعی"),
    "tradeCount": (GW + "/MarketWatch/MarketWatchOption/fa", "تعداد معاملات قرارداد", "تست واقعی"),
    "openInterest": (GW + "/MarketWatch/MarketWatchOption/fa", "⚠️ موقعیت‌های باز — نام فیلد در مستند ریپو نیامده", "نیازمند تأیید"),
    "andazeyeQarardad": (GW + "/MarketWatch/MarketWatchTradeOption/fa", "اندازه قرارداد (buyAndazeyeQarardad)", "تست واقعی"),
}


def build_api_map(wb, sheets=None):
    ws = wb.create_sheet("API_Map")
    ws.sheet_view.rightToLeft = True
    cols = ["شیت", "ستون", "برچسب فارسی", "فیلد JSON", "Endpoint", "توضیح فیلد", "وضعیت تأیید"]
    ws_w = [15, 8, 26, 22, 62, 52, 16]
    title_block(ws, "نگاشت ستون‌ها به APIهای بازار (API_Map)",
                "این شیت قرارداد رسمی بین فایل اکسل و اسکریپت پایتون است: اسکریپت ستون مقصد هر فیلد را از همین‌جا می‌خواند. "
                "منبع: ریپازیتوری BabakEslami/tse-market-data", len(cols))
    widths(ws, ws_w)
    for i, h in enumerate(cols):
        c = ws.cell(row=3, column=i + 1, value=h)
        c.font = Font(name=FONT, bold=True, color="FFFFFF", size=10)
        c.fill = PatternFill("solid", fgColor=K.C_HEADER_BG)
        c.alignment = Alignment(horizontal="center", vertical="center")
        c.border = BORDER
    r = 4
    all_specs = (("Data_Input", DI_COLS), ("Daily_History", DH_RAW),
                 ("Market_Index", MI_COLS), ("Options", OPT_COLS))
    for sheet_name, spec in all_specs:
        if sheets is not None and sheet_name not in sheets:
            continue
        for i, col in enumerate(spec):
            label, api = col[0], col[1]
            if api in ("-", None):
                continue
            src = FIELD_SRC.get(api, ("—", "—", "نامشخص"))
            for j, v in enumerate([sheet_name, get_column_letter(i + 1), label, api,
                                   src[0], src[1], src[2]]):
                c = ws.cell(row=r, column=j + 1, value=v)
                c.font = Font(name=FONT, size=8,
                              color="C00000" if src[2] == "نیازمند تأیید" else "000000")
                c.alignment = Alignment(horizontal="right" if j in (2, 4, 5) else "center",
                                        vertical="center", wrap_text=(j in (4, 5)))
                c.border = BORDER
            r += 1
    last = r - 1
    tbl = Table(displayName="tblApiMap", ref="A3:%s%d" % (get_column_letter(len(cols)), last))
    tbl.tableStyleInfo = TableStyleInfo(name="TableStyleLight9", showRowStripes=True)
    ws.add_table(tbl)
    ws.conditional_formatting.add("A4:G%d" % last, FormulaRule(
        formula=['$G4="نیازمند تأیید"'], fill=PatternFill("solid", fgColor="FFF2CC")))
    r2 = last + 2
    for txt in [
        "دو الزام عملیاتی هنگام فراخوانی این APIها:",
        "۱) هدر User-Agent مرورگری الزامی است؛ بدون آن پاسخ‌ها بلوکه می‌شوند.",
        "۲) فراخوانی مستقیم از مرورگر به‌دلیل CORS/۴۰۳ کار نمی‌کند — باید از یک بک‌اند (همان اسکریپت پایتون) فراخوانی شود.",
        "۳) ردیف‌های زردرنگ «نیازمند تأیید»اند: نام فیلدشان از نمونه ساختاری یا استنباط آمده، نه از یک پاسخ واقعی API. قبل از اتکای عملیاتی، با یک درخواست واقعی تأیید کنید.",
    ]:
        note(ws, "A%d" % r2, txt, size=9, bold=txt.startswith("دو"), color="404040")
        ws.merge_cells(start_row=r2, start_column=1, end_row=r2, end_column=7)
        r2 += 1
    ws.freeze_panes = "A4"
    return ws


# =====================================================================
# 12) Documentation
# =====================================================================
DOC = [
 ("H1", "راهنمای سیستم سیگنال‌دهی بازار سرمایه ایران"),
 ("P",  "نسخه ۱٫۰ · ساخته‌شده در ۱۴۰۵/۰۶/۱۴ · بدون VBA · همه محاسبات با فرمول اکسل"),
 ("W",  "⚠️ داده‌های داخل فایل نمونه (DEMO) و ساختگی‌اند. هیچ عددی در این فایل داده واقعی بازار نیست. "
        "InsCode و ISIN نمادها هم تأییدنشده‌اند. پیش از هر تصمیم معاملاتی، داده‌ها را با scripts/tse_updater.py جایگزین کنید."),

 ("H2", "۱) فلسفه طراحی"),
 ("P",  "این فایل برای معامله‌گر میان‌مدت ساخته شده، نه روزانه. سه پرسش را پشت سر هم می‌پرسد:"),
 ("L",  "۱. بازار کجاست؟ (رژیم بازار از شاخص کل و هم‌وزن) — اگر بازار نزولی است، سیگنال خرید تک‌سهم کم‌ارزش‌تر است."),
 ("L",  "۲. سهم در چه روندی است؟ (میانگین‌های متحرک + ساختار سقف/کف + شیب)"),
 ("L",  "۳. پول هوشمند چه می‌کند؟ (سرانه خرید و فروش حقیقی، خالص جریان نرمال‌شده)"),
 ("P",  "تحلیل بنیادی عمداً وارد نشده است. این یک انتخاب است، نه فراموشی."),

 ("H2", "۲) یک هشدار روش‌شناختی که باید بخوانید"),
 ("P",  "«ورود پول حقیقی» به‌تنهایی سیگنال ضعیفی است. عدد خالص ریالی در نماد بزرگ همیشه بزرگ است بدون آنکه معنا داشته باشد. "
        "به همین دلیل این سیستم دو معیار نرمال‌شده را جایگزین کرده است:"),
 ("L",  "• سرانه خرید حقیقی ÷ سرانه فروش حقیقی — یعنی «هر خریدار حقیقی چقدر بزرگ‌تر از هر فروشنده حقیقی است»."),
 ("L",  "• خالص ورود پول ÷ ارزش کل معاملات همان روز — یعنی جریان به‌عنوان درصدی از نقدشوندگی، نه ریال خام."),
 ("P",  "همچنین توجه کنید: تفکیک حقیقی/حقوقی در بازار ایران با کدهای مدیریت دارایی و صندوق‌ها آلوده می‌شود. "
        "این معیار سرنخ است، نه حقیقت."),

 ("H2", "۳) ساختار شیت‌ها و مسیر داده"),
 ("C",  "Data_Input (لحظه‌ای)  ┐"),
 ("C",  "                      ├─→  Calculations  ─→  Signals  ─→  Dashboard"),
 ("C",  "Daily_History (تاریخی)┘         ↑                ↑"),
 ("C",  "Market_Index ───────────────────┘                │"),
 ("C",  "Time_Cycles  ───────────────────┘                │"),
 ("C",  "Settings (وزن‌ها و آستانه‌ها) ──→ همه شیت‌ها        │"),
 ("C",  "Options ─────────────────────────────────────────┘ (از Calculations سهم پایه را می‌خواند)"),
 ("P",  "قانون معماری: Data_Input و Daily_History فقط داده خام API را نگه می‌دارند؛ هیچ فرمول تحلیلی در آن‌ها نوشته نمی‌شود "
        "(به‌جز ستون‌های محاسباتی نشان‌دار Daily_History از ستون U به بعد). این تفکیک باعث می‌شود اسکریپت پایتون بتواند "
        "بدون ریسک خراب‌کردن فرمول‌ها روی داده بنویسد."),

 ("H2", "۴) سیستم امتیازدهی"),
 ("P",  "شش زیرنمره مستقل ساخته می‌شود که هرکدام بین −۱۰ تا +۱۰ است، سپس با وزن‌های شیت Settings ترکیب می‌شوند:"),
 ("T",  "T — امتیاز روند|قیمت نسبت به MA میان‌مدت (±۳) + آرایش MA میان/بلند (±۳) + شکست سقف یا کف کوتاه‌مدت (±۲) + شیب MA کوتاه (±۲)"),
 ("T",  "S — امتیاز پول هوشمند|قدرت خریدار (±۴) + خالص ورود امروز نسبت به ارزش معاملات (±۳) + خالص ورود ۵ روزه (±۳)"),
 ("T",  "M — امتیاز میانگین‌ها|(تعداد MAهایی که قیمت بالای آن‌هاست × ۵) − ۱۰ ← از −۱۰ (زیر همه) تا +۱۰ (بالای همه)"),
 ("T",  "V — امتیاز حجم|جهت تغییر قیمت × شدت حجم نسبت به میانگین ۲۰ روزه (±۹). حجم بالا در روز مثبت تأیید است، در روز منفی هشدار."),
 ("T",  "K — امتیاز بازار|رژیم بازار از شاخص کل (±۳) و هم‌وزن (±۴) و مومنتوم هم‌وزن (±۳). یکسان برای همه نمادها."),
 ("T",  "Z — امتیاز زمان|چرخه هرست + پنجره گن + موج الیوت. پیش‌فرض وزن صفر."),
 ("P",  "امتیاز کل = (T×W_TREND + S×W_SMART + M×W_MA + V×W_VOL + K×W_MARKET + Z×W_TIME) ÷ جمع وزن‌ها"),
 ("P",  "تقسیم بر جمع وزن‌ها عمدی است: اگر وزنی را صفر کنید یا وزن جدیدی اضافه کنید، مقیاس −۱۰ تا +۱۰ حفظ می‌شود."),
 ("T",  "برچسب سیگنال|امتیاز ≥ TH_SBUY → خرید قوی · ≥ TH_BUY → خرید · ≤ TH_SSELL → فروش قوی · ≤ TH_SELL → فروش · بقیه → نگهداری"),
 ("T",  "قدرت سیگنال ۱ تا ۵|بر اساس قدرمطلق امتیاز کل: ≥۸ → ۵ · ≥۵ → ۴ · ≥۳ → ۳ · ≥۱٫۵ → ۲ · بقیه → ۱"),

 ("H2", "۵) چطور وزن‌ها را تغییر دهم؟"),
 ("P",  "فقط سلول‌های زرد شیت Settings را تغییر دهید. سلول «جمع وزن‌ها» باید ۱۰۰٪ بماند؛ اگر نماند، پیام قرمز نشان داده می‌شود "
        "ولی محاسبه همچنان درست است چون بر جمع واقعی تقسیم می‌شود."),
 ("P",  "چند تنظیم پیشنهادی برای شروع:"),
 ("L",  "• بازار پرنوسان و بی‌روند: W_MARKET را بالا ببرید (مثلاً ۲۰٪) و W_VOL را پایین."),
 ("L",  "• تمرکز روی پول هوشمند: W_SMART را تا ۴۵٪ ببرید ولی TH_BUY را هم بالاتر بگذارید تا سیگنال کاذب کمتر شود."),
 ("L",  "• فعال‌سازی لایه زمانی: W_TIME را روی ۱۰٪ بگذارید و به همان اندازه از W_TREND کم کنید."),

 ("H2", "۶) لایه زمانی — وضعیت فعلی و مسیر توسعه"),
 ("P",  "شیت Time_Cycles امروز کامل ساخته شده ولی وزنش صفر است؛ یعنی محاسبه می‌شود، نمایش داده می‌شود، اما روی سیگنال اثر ندارد. "
        "این عمدی است: یک لایه زمانی که ورودی‌هایش دستی و تأییدنشده است نباید سیگنال معاملاتی را جابه‌جا کند."),
 ("P",  "برای فعال‌سازی واقعی، به‌ترتیب این سه کار لازم است:"),
 ("L",  "۱. طول چرخه غالب (ستون D) به‌جای عدد ثابت ۸۰، با تحلیل طیفی روی سری قیمت در پایتون استخراج شود (روش von Thienen)."),
 ("L",  "۲. تاریخ کف و سقف چرخه به‌صورت خودکار با الگوریتم تشخیص نقاط چرخش پر شود، نه چشمی."),
 ("L",  "۳. برچسب موج الیوت دستی بماند — این تنها بخشی است که خودکارسازی‌اش بیشتر خطا می‌آورد تا فایده."),

 ("H2", "۷) اتصال به APIها"),
 ("P",  "شیت API_Map نگاشت کامل هر ستون به فیلد JSON و endpoint را دارد. اسکریپت پایتون همان را می‌خواند و ستون مقصد را پیدا می‌کند."),
 ("T",  "جستجوی نماد|GET https://cdn.tsetmc.com/api/Instrument/GetInstrumentSearch/{Query}"),
 ("T",  "قیمت لحظه‌ای|GET https://cdn.tsetmc.com/api/ClosingPrice/GetClosingPriceInfo/{InsCode}"),
 ("T",  "تاریخچه روزانه|GET https://cdn.tsetmc.com/api/ClosingPrice/GetClosingPriceDailyList/{InsCode}/{Top}"),
 ("T",  "حقیقی/حقوقی|GET https://cdn.tsetmc.com/api/ClientType/GetClientType/{InsCode}/1/0"),
 ("T",  "حقیقی/حقوقی تاریخی|GET https://cdn.tsetmc.com/api/ClientType/GetClientTypeHistory/{InsCode}/{DEven}"),
 ("T",  "سفارش‌ها|GET https://cdn.tsetmc.com/api/BestLimits/{InsCode}"),
 ("T",  "شاخص‌ها|GET https://cdn.tsetmc.com/api/Index/GetIndexB1LastAll/SelectedIndexes/1"),
 ("T",  "دیده‌بان کامل|GET https://webgw.tse.ir/InstrumentProvider/api/v1/MarketWatch/MarketWatchCash/fa"),
 ("T",  "لایو یک نماد|GET https://webgw.tse.ir/InstrumentProvider/api/v1/Instrument/LiveInstrumentByIdQuery/fa?InstrumentId={ISIN}"),
 ("T",  "دیده‌بان آپشن|GET https://webgw.tse.ir/InstrumentProvider/api/v1/MarketWatch/MarketWatchOption/fa"),
 ("P",  "دو نکته که اگر رعایت نشوند اسکریپت کار نمی‌کند: هدر User-Agent مرورگری الزامی است، و فراخوانی مستقیم از مرورگر "
        "به‌خاطر CORS شکست می‌خورد — باید از یک فرآیند سمت سرور/دسکتاپ انجام شود."),
 ("P",  "اجرای به‌روزرسانی:   python scripts/tse_updater.py --workbook Iran_Stock_Signals.xlsx --history 300"),

 ("H2", "۸) محدودیت‌هایی که باید بدانید"),
 ("L",  "• سیستم trend-following است. در بازار رِنج، سیگنال‌های کاذب می‌دهد و این ذاتی روش است، نه ایراد فایل."),
 ("L",  "• هیچ بک‌تستی روی این وزن‌ها انجام نشده. وزن‌های پیش‌فرض بر پایه استدلال ساختاری‌اند، نه بهینه‌سازی تاریخی."),
 ("L",  "• نمادهای متوقف: ستون cEtavalTitle را چک کنید. برای نماد متوقف، خالی‌بودن داده تاریخی طبیعی است."),
 ("L",  "• صف خرید/فروش: endpoint مربوطه یک delta feed است نه اسنپ‌شات؛ بازسازی دقیق عمق بازار نیاز به نگهداری وضعیت دارد."),
 ("L",  "• تعدیل قیمت (افزایش سرمایه/سود نقدی) در تاریخچه لحاظ نشده — میانگین‌های متحرک پس از تعدیل چند روز نامعتبرند."),
 ("L",  "• بلک-شولز در شیت آپشن برای اختیار اروپایی است و قیمت نظری اختیار فروش آمریکایی را کم‌برآورد می‌کند."),

 ("H2", "۹) گام بعدی پیشنهادی"),
 ("L",  "۱. اجرای اسکریپت به‌روزرسانی و تأیید نام فیلدهای علامت‌خورده «نیازمند تأیید» در شیت API_Map."),
 ("L",  "۲. افزودن ۳۰ تا ۵۰ نماد به Watchlist — سیستم با ۸ نماد نمونه ساخته شده ولی برای غربال‌گری واقعی به عمق نیاز دارد."),
 ("L",  "۳. بک‌تست وزن‌ها روی دو سال داده تاریخی، پیش از اتکای جدی به آستانه‌های TH_*."),
 ("L",  "۴. فعال‌سازی تدریجی لایه زمانی با وزن کوچک (۵٪ تا ۱۰٪) و مقایسه نتیجه با حالت خاموش."),
]


DOC_SCOPE = {
    "stocks": None,          # همه بخش‌ها
    "options": ("۱)", "۲)", "۴)", "۵)", "۷)", "۸)"),
    "time": ("۱)", "۶)", "۸)", "۹)"),
    "minimal": ("۱)", "۸)"),
}


def build_documentation(wb, scope="stocks", extra=None):
    """scope: کدام بخش‌های راهنما در این فایل بیاید."""
    ws = wb.create_sheet("Documentation")
    ws.sheet_view.rightToLeft = True
    ws.sheet_view.showGridLines = False
    widths(ws, [40, 78, 3, 3, 3, 3, 3, 3])
    keep_pfx = DOC_SCOPE.get(scope, None)
    r = 1
    keep = True
    doc_rows = list(DOC) + list(extra or [])
    for kind, text in doc_rows:
        if kind == "H2" and keep_pfx is not None:
            keep = any(str(text).startswith(p) for p in keep_pfx)
        if kind not in ("H1", "W") and not keep:
            continue
        if kind == "T":
            left, right = text.split("|", 1)
            c1 = ws.cell(row=r, column=1, value=left)
            c1.font = Font(name=FONT, size=9, bold=True)
            c1.alignment = Alignment(horizontal="right", vertical="center", wrap_text=True)
            c1.fill = PatternFill("solid", fgColor="F2F2F2")
            c1.border = BORDER
            c2 = ws.cell(row=r, column=2, value=right)
            c2.font = Font(name=FONT, size=9)
            c2.alignment = Alignment(horizontal="right", vertical="center", wrap_text=True)
            c2.border = BORDER
            ws.row_dimensions[r].height = 30
            r += 1
            continue
        c = ws.cell(row=r, column=1, value=text)
        ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=2)
        if kind == "H1":
            c.font = Font(name=FONT, size=16, bold=True, color="FFFFFF")
            c.fill = PatternFill("solid", fgColor=K.C_HEADER_BG)
            c.alignment = Alignment(horizontal="center", vertical="center")
            ws.row_dimensions[r].height = 30
        elif kind == "H2":
            c.font = Font(name=FONT, size=12, bold=True, color="FFFFFF")
            c.fill = PatternFill("solid", fgColor=K.C_SECTION_BG)
            c.alignment = Alignment(horizontal="right", vertical="center")
            ws.row_dimensions[r].height = 24
            r += 1
            continue
        elif kind == "W":
            c.font = Font(name=FONT, size=10, bold=True, color="FFFFFF")
            c.fill = PatternFill("solid", fgColor=K.C_SSELL_BG)
            c.alignment = Alignment(horizontal="right", vertical="center", wrap_text=True)
            ws.row_dimensions[r].height = 34
        elif kind == "C":
            c.font = Font(name="Consolas", size=9)
            c.alignment = Alignment(horizontal="left", vertical="center")
        else:
            c.font = Font(name=FONT, size=10 if kind == "P" else 9)
            c.alignment = Alignment(horizontal="right", vertical="center", wrap_text=True)
            ws.row_dimensions[r].height = 30 if kind == "P" else 18
        r += 1
    return ws


# =====================================================================
# main
# =====================================================================
SHEET_ORDER = ["Dashboard", "Signals", "Options", "Data_Input", "Calculations",
               "Daily_History", "Market_Index", "Time_Cycles", "Watchlist",
               "Settings", "API_Map", "Documentation"]


def main(out_path):
    hist = SD.build_history()
    idx_hist = SD.build_index_history()
    symbols = [s[0] for s in SD.SYMBOLS]

    wb = Workbook()
    wb.remove(wb.active)

    build_settings(wb)
    _, wl_last = build_watchlist(wb)
    build_data_input(wb, hist)
    build_daily_history(wb, hist)
    build_market_index(wb, idx_hist)
    _, tc_score_col = build_time_cycles(wb, symbols, hist)
    _, calc_first, calc_last, cm = build_calculations(wb, symbols, tc_score_col)
    _, sig_first, sig_last = build_signals(wb, symbols, calc_first, cm)
    build_options(wb)
    build_dashboard(wb, sig_first, sig_last, calc_first, calc_last, cm, wl_last)
    build_api_map(wb)
    build_documentation(wb)

    for name, ref in DEFINED.items():
        wb.defined_names.add(DefinedName(name, attr_text=ref))

    order = {n: i for i, n in enumerate(SHEET_ORDER)}
    wb._sheets.sort(key=lambda s: order.get(s.title, 99))
    wb.active = 0
    wb.save(out_path)
    print("ساخته شد: %s  (%d شیت)" % (out_path, len(wb.sheetnames)))
    print("شیت‌ها:", " | ".join(wb.sheetnames))


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "Iran_Stock_Signals.xlsx"
    main(out)
