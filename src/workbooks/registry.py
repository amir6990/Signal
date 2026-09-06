# -*- coding: utf-8 -*-
"""فهرست فایل‌های قابل ساخت و اجرای آن‌ها."""
import os

BUILDERS = {}


def register(key, filename, title, fn):
    BUILDERS[key] = {"file": filename, "title": title, "fn": fn}


def build(key, out_dir=".", **kw):
    spec = BUILDERS[key]
    path = os.path.join(out_dir, spec["file"])
    spec["fn"](path, **kw)
    return path


def build_all(out_dir=".", **kw):
    return [build(k, out_dir, **kw) for k in BUILDERS]


def _late_register():
    from . import stocks, options, time_analysis, gold, fx
    register("stocks", "Stocks_Signals.xlsx",
             "سیگنال‌دهی سهام بورس و فرابورس", stocks.build)
    register("options", "Options_Signals.xlsx",
             "سیگنال‌دهی اختیار معامله", options.build)
    register("time", "Time_Analysis.xlsx",
             "تحلیل ابعاد زمانی و چرخه‌ها", time_analysis.build)
    register("gold", "Gold_Analysis.xlsx",
             "تحلیل طلا و سکه", gold.build)
    register("fx", "FX_Analysis.xlsx",
             "تحلیل دلار و تتر", fx.build)


_late_register()
