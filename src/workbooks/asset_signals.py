# -*- coding: utf-8 -*-
"""
شیت سیگنال دارایی‌های تک‌سری (طلا، سکه، دلار، تتر).

منطق امتیازدهی همان انضباط سیگنال سهام است، با یک تفاوت مهم: برای این
دارایی‌ها یک بُعد اضافه وجود دارد که در سهام معادل ندارد — **ارزش‌گذاری
نسبی**. حباب سکه ۱۸٪ به‌تنهایی هیچ معنایی ندارد؛ آنچه معنا دارد این است که
۱۸٪ در توزیع دو سال گذشته حباب کجا می‌ایستد. صدک تاریخی همین را می‌گوید.

چهار زیرنمره، هرکدام −۱۰ تا +۱۰:
  T  روند      — قیمت نسبت به سه میانگین متحرک و آرایش آن‌ها
  M  مومنتوم   — بازده ۵ و ۲۰ و ۶۰ روزه
  V  نوسان     — نوسان جاری نسبت به میانه تاریخی (نوسان بالا = تضعیف سیگنال)
  P  ارزش‌گذاری — صدک حباب/پریمیوم؛ گران بودن، امتیاز منفی می‌گیرد
"""
from openpyxl.formatting.rule import CellIsRule, ColorScaleRule
from openpyxl.styles import Alignment, Font, PatternFill

import build_workbook as B
import common as K
from common import (BORDER, F_NUM1, F_PCT, F_PRICE, F_X, FONT, hdr, note,
                    title_block, widths)

# ⚠️ وقتی شیت تاریخچه هنوز خالی است، شمارنده «ردیف آخر» روی ۴ می‌ماند —
# و ۴ دقیقاً ردیف سرستون است. بدون محافظ زیر، INDEX متنِ سرستون را برمی‌گرداند
# و در ستون قیمت به جای خالی، یک رشته فارسی می‌نشیند. محافظ، اشاره‌گر را
# می‌سنجد نه محتوا را: هر ردیفی کمتر از ۵ یعنی «هنوز داده‌ای نیست».
def _idx(col, off=0):
    ptr = "$C{r}" if not off else "$C{r}-%d" % off
    body = 'INDEX(INDIRECT($B{r}&"!$%s:$%s"),%s)' % (col, col, ptr)
    return body, '=IF($C{r}<%d,"",IFERROR(%%s,""))' % (5 + off)


def _lookup(col, off=0):
    body, wrap = _idx(col, off)
    return wrap % body


# (کلید، برچسب، عرض، قالب، الگوی فرمول)
COLS = [
    ("asset",    "دارایی", 22, None, None),
    ("sheet",    "شیت تاریخچه", 16, None, None),
    ("lastrow",  "ردیف آخر", 10, "0", '=COUNT(INDIRECT($B{r}&"!$A$5:$A$5000"))+4'),
    ("price",    "قیمت", 16, F_PRICE, _lookup("C")),
    ("ma_s",     "MA کوتاه", 15, F_PRICE, _lookup("I")),
    ("ma_m",     "MA میان‌مدت", 15, F_PRICE, _lookup("J")),
    ("ma_l",     "MA بلند", 15, F_PRICE, _lookup("K")),
    ("n_above",  "MA زیر قیمت", 11, "0",
     '=IF(NOT(ISNUMBER($D{r})),"",'
     'IF($D{r}>$E{r},1,0)+IF($D{r}>$F{r},1,0)+IF($D{r}>$G{r},1,0))'),
    ("dist_m",   "فاصله از MA میان", 13, F_PCT, '=IFERROR($D{r}/$F{r}-1,"")'),
    ("ret5",     "بازده ۵ روزه", 12, F_PCT,
     '=IF(OR($C{r}<10,NOT(ISNUMBER($D{r}))),"",IFERROR($D{r}/'
     'INDEX(INDIRECT($B{r}&"!$C:$C"),$C{r}-5)-1,""))'),
    ("ret20",    "بازده ۲۰ روزه", 12, F_PCT,
     '=IF(OR($C{r}<25,NOT(ISNUMBER($D{r}))),"",IFERROR($D{r}/'
     'INDEX(INDIRECT($B{r}&"!$C:$C"),$C{r}-20)-1,""))'),
    ("ret60",    "بازده ۶۰ روزه", 12, F_PCT,
     '=IF(OR($C{r}<65,NOT(ISNUMBER($D{r}))),"",IFERROR($D{r}/'
     'INDEX(INDIRECT($B{r}&"!$C:$C"),$C{r}-60)-1,""))'),
    ("vol",      "نوسان سالانه", 12, F_PCT, _lookup("L")),
    ("vol_med",  "میانه نوسان", 12, F_PCT,
     '=IFERROR(MEDIAN(INDIRECT($B{r}&"!$L$5:$L$5000")),"")'),
    ("dd",       "افت از سقف ۶۰ روزه", 13, F_PCT,
     _lookup("O")),
    # ⚠️ INDEX روی یک سلول خالی، عددِ صفر برمی‌گرداند نه خالی. بدون ISBLANK،
    # «سنجه ارزش‌گذاری پر نشده» با «سنجه دقیقاً صفر» یکی می‌شد و امتیاز
    # ارزش‌گذاری را بی‌دلیل +۸ می‌کرد.
    ("val",      "سنجه ارزش‌گذاری", 15, F_PCT,
     '=IF($C{r}<5,"",IFERROR(IF(ISBLANK(%(p)s),"",%(p)s),""))'
     % {"p": 'INDEX(INDIRECT($B{r}&"!$P:$P"),$C{r})'}),
    ("val_pct",  "صدک ارزش‌گذاری", 14, F_PCT,
     '=IF($C{r}<5,"",IFERROR(IF(ISBLANK(%(q)s),"",%(q)s),""))'
     % {"q": 'INDEX(INDIRECT($B{r}&"!$Q:$Q"),$C{r})'}),
    ("t_score",  "امتیاز روند (T)", 12, F_NUM1,
     '=IF(NOT(ISNUMBER($D{r})),0,IFERROR(MAX(-10,MIN(10,'
     'IF($D{r}>$E{r},2.5,-2.5)+IF($D{r}>$F{r},3.5,-3.5)+IF($D{r}>$G{r},4,-4)'
     ')),0))'),
    ("m_score",  "امتیاز مومنتوم (M)", 12, F_NUM1,
     '=IF(NOT(ISNUMBER($D{r})),0,IFERROR(MAX(-10,MIN(10,'
     'IF($J{r}>0.02,2,IF($J{r}>0,1,IF($J{r}<-0.02,-2,-1)))'
     '+IF($K{r}>0.05,4,IF($K{r}>0,2,IF($K{r}<-0.05,-4,-2)))'
     '+IF($L{r}>0.10,4,IF($L{r}>0,2,IF($L{r}<-0.10,-4,-2)))'
     ')),0))'),
    ("v_score",  "امتیاز نوسان (V)", 12, F_NUM1,
     '=IF(OR(NOT(ISNUMBER($M{r})),NOT(ISNUMBER($N{r})),$N{r}=0),0,'
     'IFERROR(MAX(-10,MIN(10,IF($M{r}/$N{r}>2,-6,IF($M{r}/$N{r}>1.4,-3,'
     'IF($M{r}/$N{r}<0.7,3,1))))),0))'),
    ("p_score",  "امتیاز ارزش‌گذاری (P)", 13, F_NUM1,
     '=IF(NOT(ISNUMBER($Q{r})),0,IFERROR(MAX(-10,MIN(10,'
     'IF($Q{r}>=0.90,-8,IF($Q{r}>=0.75,-4,IF($Q{r}<=0.10,8,IF($Q{r}<=0.25,4,0))))'
     ')),0))'),
    ("total",    "امتیاز کل", 12, F_NUM1,
     # مخرج پویاست: اگر سنجه ارزش‌گذاری موجود نباشد، وزن آن از مخرج هم حذف
     # می‌شود. در غیر این صورت نبودِ داده، امتیاز را ۲۵٪ به سمت صفر رقیق می‌کرد
     # و یک سیگنال قوی را بی‌دلیل ضعیف نشان می‌داد.
     '=IF(NOT(ISNUMBER($D{r})),"",IFERROR('
     '($R{r}*AW_TREND+$S{r}*AW_MOM+$T{r}*AW_VOL'
     '+IF(ISNUMBER($Q{r}),$U{r}*AW_VAL,0))'
     '/(AW_TREND+AW_MOM+AW_VOL+IF(ISNUMBER($Q{r}),AW_VAL,0)),0))'),
    ("signal",   "سیگنال", 15, None,
     '=IF(NOT(ISNUMBER($V{r})),"",IF($V{r}>=TH_SBUY,"خرید قوی",IF($V{r}>=TH_BUY,"خرید",'
     'IF($V{r}<=TH_SSELL,"فروش قوی",IF($V{r}<=TH_SELL,"فروش","نگهداری")))))'),
    ("strength", "قدرت", 9, "0",
     '=IF(NOT(ISNUMBER($V{r})),"",IF(ABS($V{r})>=8,5,IF(ABS($V{r})>=5,4,'
     'IF(ABS($V{r})>=3,3,IF(ABS($V{r})>=1.5,2,1)))))'),
    ("reason",   "دلیل", 74, None,
     '=IF(NOT(ISNUMBER($D{r})),"","روند: "&IF($R{r}>=5,"صعودی قوی",IF($R{r}>=2,"صعودی",'
     'IF($R{r}<=-5,"نزولی قوی",IF($R{r}<=-2,"نزولی","خنثی"))))'
     '&" | MA: "&$H{r}&"/3"'
     '&" | مومنتوم ۲۰ روزه: "&IFERROR(TEXT($K{r},"0.0%"),"—")'
     '&" | نوسان: "&IFERROR(TEXT($M{r},"0%"),"—")&" (میانه "&IFERROR(TEXT($N{r},"0%"),"—")&")"'
     '&" | ارزش‌گذاری: صدک "&IFERROR(TEXT($Q{r},"0%"),"—"))'),
]


def build(wb, assets, title, valuation_note):
    """assets: list[(نام دارایی، نام شیت تاریخچه)]."""
    ws = wb.create_sheet("Asset_Signals")
    ws.sheet_view.rightToLeft = True
    n = len(assets)
    hrow, first = 3, 5
    lastrow = first + n - 1

    title_block(ws, title,
                "همان انضباط سیگنال سهام، به‌علاوه یک بُعد که در سهام معادل ندارد: "
                "ارزش‌گذاری نسبی. حباب ۱۸٪ به‌تنهایی معنا ندارد — صدک آن در توزیع "
                "تاریخی معنا دارد.", len(COLS))
    widths(ws, [c[2] for c in COLS])
    hdr(ws, hrow, [c[1] for c in COLS],
        ["ورودی", "ورودی", "COUNT", "تاریخچه!C", "تاریخچه!I", "تاریخچه!J",
         "تاریخچه!K", "شمارش", "—", "—", "—", "—", "تاریخچه!L", "MEDIAN",
         "تاریخچه!O", "تاریخچه!P", "تاریخچه!Q", "±۱۰", "±۱۰", "±۱۰", "±۱۰",
         "میانگین وزنی", "آستانه Settings", "۱ تا ۵", "—"])

    for i, (asset, sheet) in enumerate(assets):
        r = first + i
        ws.cell(row=r, column=1, value=asset)
        ws.cell(row=r, column=2, value=sheet)
        for c in (1, 2):
            cell = ws.cell(row=r, column=c)
            cell.fill = PatternFill("solid", fgColor=K.C_INPUT_BG)
            cell.font = Font(name=FONT, size=9, bold=(c == 1), color=K.C_BLUE_INPUT)
            cell.alignment = Alignment(horizontal="center", vertical="center")
            cell.border = BORDER
        for j, (_k, _lbl, _w, fmt, tmpl) in enumerate(COLS[2:], start=3):
            cell = ws.cell(row=r, column=j, value=tmpl.format(r=r))
            cell.font = Font(name=FONT, size=8,
                             color=K.C_GREEN_LINK if j <= 17 else "000000")
            cell.alignment = Alignment(
                horizontal="right" if j == len(COLS) else "center", vertical="center",
                wrap_text=(j == len(COLS)))
            cell.border = BORDER
            if fmt:
                cell.number_format = fmt
        ws.row_dimensions[r].height = 26

    for col in ("R", "S", "T", "U", "V"):
        ws.conditional_formatting.add("%s%d:%s%d" % (col, first, col, lastrow),
                                      ColorScaleRule(
            start_type="num", start_value=-10, start_color=K.C_SSELL_BG,
            mid_type="num", mid_value=0, mid_color="FFFFFF",
            end_type="num", end_value=10, end_color=K.C_SBUY_BG))
    for lbl, bg, fg in (("خرید قوی", K.C_SBUY_BG, K.C_SBUY_FG),
                        ("خرید", K.C_BUY_BG, K.C_BUY_FG),
                        ("نگهداری", K.C_HOLD_BG, K.C_HOLD_FG),
                        ("فروش", K.C_SELL_BG, K.C_SELL_FG),
                        ("فروش قوی", K.C_SSELL_BG, K.C_SSELL_FG)):
        ws.conditional_formatting.add("W%d:W%d" % (first, lastrow), CellIsRule(
            operator="equal", formula=['"%s"' % lbl],
            fill=PatternFill("solid", fgColor=bg), font=Font(color=fg, bold=True)))
    ws.conditional_formatting.add("Q%d:Q%d" % (first, lastrow), ColorScaleRule(
        start_type="num", start_value=0, start_color=K.C_SBUY_BG,
        mid_type="num", mid_value=0.5, mid_color="FFFFFF",
        end_type="num", end_value=1, end_color=K.C_SSELL_BG))

    r2 = lastrow + 2
    for txt in [
        valuation_note,
        "ستون «سنجه ارزش‌گذاری» را اسکریپت پایتون پر می‌کند، چون ساختن آن نیازمند "
        "هم‌تراز کردن چند سری زمانی با تاریخ‌های ناهمسان است — کاری که در اکسل "
        "شکننده می‌شود ولی در پایتون بدیهی است. صدک آن اما در اکسل حساب می‌شود "
        "تا با تغییر داده زنده به‌روز بماند.",
        "⚠️ هیچ‌کدام از آستانه‌ها و وزن‌ها بک‌تست نشده‌اند. برای آزمودنشان روی سری "
        "واقعی:  python -m timeframe backtest --csv <سری>.csv --name <دارایی>",
    ]:
        note(ws, "A%d" % r2, txt, size=9, color="404040")
        ws.merge_cells(start_row=r2, start_column=1, end_row=r2, end_column=len(COLS))
        ws.row_dimensions[r2].height = 30
        r2 += 1
    ws.freeze_panes = "C5"
    return ws
