# -*- coding: utf-8 -*-
"""
Options_Signals.xlsx — سیگنال‌دهی اختیار معامله.

شیت‌ها: Options · Underlying · Settings · API_Map · Documentation

فایل سبک است چون تاریخچه روزانه ندارد: قرارداد اختیار عمر کوتاهی دارد و
تحلیلش به داده لحظه‌ای و مشخصات قرارداد وابسته است، نه به میانگین متحرک
۲۰۰ روزه.

قیمت و امتیاز سهم پایه از شیت Underlying خوانده می‌شود که اسکریپت
link_workbooks.py آن را از فایل سیگنال سهام پر می‌کند.
"""
from openpyxl import Workbook
from openpyxl.workbook.defined_name import DefinedName

import build_workbook as B

SHEET_ORDER = ["Options", "Underlying", "Settings", "API_Map", "Documentation"]


def build(out_path, **_kw):
    B.DEFINED.clear()
    B.COLREF.clear()
    wb = Workbook()
    wb.remove(wb.active)

    B.build_settings(wb, sections=("۶)", "۵)", "۸)"))
    B.build_underlying(wb)
    B.build_options(wb)
    B.build_api_map(wb, sheets=("Options",))
    B.build_documentation(wb, scope="options")

    for name, ref in B.DEFINED.items():
        wb.defined_names.add(DefinedName(name, attr_text=ref))
    order = {n: i for i, n in enumerate(SHEET_ORDER)}
    wb._sheets.sort(key=lambda s: order.get(s.title, 99))
    wb.active = 0
    wb.save(out_path)
    print("✓ %s — %d شیت" % (out_path, len(wb.sheetnames)))
    return out_path
