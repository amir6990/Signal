# -*- coding: utf-8 -*-
"""
سازنده فایل‌های اکسل — هر حوزه یک فایل مستقل.

چرا تفکیک: فایل یکپارچه با تاریخچه روزانه چند هزار ردیفی سنگین می‌شود و هر
بار که فقط می‌خواهید آپشن یا طلا را ببینید، کل آن بار می‌شود.

قانون معماری این پکیج: **هیچ فرمول ارجاع بین‌فایلی وجود ندارد.**
فرمول `='[1]Sheet'!A1` وقتی فایل مبدأ باز نباشد فقط مقدار کش‌شده را نشان
می‌دهد و با بازنویسی توسط openpyxl کاملاً از بین می‌رود. به‌جای آن، هر فایل
یک «شیت پل» دارد که اسکریپت پایتون پر می‌کند:

    Stocks_Signals.xlsx   ← Time_Link   ← python -m timeframe export
    Options_Signals.xlsx  ← Underlying  ← python scripts/link_workbooks.py
"""
from .registry import BUILDERS, build, build_all   # noqa: F401
