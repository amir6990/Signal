# -*- coding: utf-8 -*-
"""
Stocks_Signals.xlsx — سیگنال‌دهی سهام بورس و فرابورس.

شیت‌ها: Dashboard · Signals · Data_Input · Calculations · Daily_History ·
        Market_Index · Time_Link · Watchlist · Settings · API_Map · Documentation

این فایل سنگین‌ترین فایل مجموعه است چون تاریخچه روزانه را نگه می‌دارد —
که برای محاسبه میانگین متحرک ۲۰۰ روزه گریزی از آن نیست.
"""
from openpyxl import Workbook
from openpyxl.workbook.defined_name import DefinedName

import build_workbook as B
import sample_data as SD

SHEET_ORDER = ["Dashboard", "Signals", "Data_Input", "Calculations",
               "Daily_History", "Market_Index", "Time_Link", "Watchlist",
               "Settings", "API_Map", "Documentation"]


def build(out_path, hist=None, idx_hist=None):
    hist = hist or SD.build_history()
    idx_hist = idx_hist or SD.build_index_history()
    symbols = [s[0] for s in SD.SYMBOLS]

    B.DEFINED.clear()
    B.COLREF.clear()
    wb = Workbook()
    wb.remove(wb.active)

    B.build_settings(wb)
    _, wl_last = B.build_watchlist(wb)
    B.build_data_input(wb, hist)
    B.build_daily_history(wb, hist)
    B.build_market_index(wb, idx_hist)
    B.build_time_link(wb, symbols)
    _, calc_first, calc_last, cm = B.build_calculations(wb, symbols, "V")
    _, sig_first, sig_last = B.build_signals(wb, symbols, calc_first, cm)
    B.build_dashboard(wb, sig_first, sig_last, calc_first, calc_last, cm, wl_last)
    B.build_api_map(wb, sheets=("Data_Input", "Daily_History", "Market_Index"))
    B.build_documentation(wb, scope="stocks")

    for name, ref in B.DEFINED.items():
        wb.defined_names.add(DefinedName(name, attr_text=ref))
    order = {n: i for i, n in enumerate(SHEET_ORDER)}
    wb._sheets.sort(key=lambda s: order.get(s.title, 99))
    wb.active = 0
    wb.save(out_path)
    print("✓ %s — %d شیت" % (out_path, len(wb.sheetnames)))
    return out_path
