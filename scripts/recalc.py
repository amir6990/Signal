# -*- coding: utf-8 -*-
"""
بازمحاسبه فرمول‌های یک فایل اکسل با LibreOffice.

    python scripts/recalc.py Stocks_Signals.xlsx

چرا لازم است: openpyxl فرمول‌ها را به‌صورت متن می‌نویسد و **مقدار محاسبه‌شده
را ذخیره نمی‌کند**. تا وقتی فایل یک بار محاسبه نشود، هر برنامه‌ای که مقدار
کش‌شده را بخواند (از جمله اسکریپت‌های پل همین پروژه) صفر و None می‌بیند.

باز کردن فایل در اکسل و ذخیره کردن هم همین کار را می‌کند. این اسکریپت
همان را بدون دخالت دستی انجام می‌دهد.
"""
import argparse
import os
import shutil
import subprocess
import sys
import tempfile

X_UNUSED = """
<!DOCTYPE script:module PUBLIC "-//OpenOffice.org//DTD OfficeDocument 1.0//EN" "module.dtd">
<script:module xmlns:script="http://openoffice.org/2000/script"
 script:name="Module1" script:language="StarBasic">
Sub RecalcAndSave
  ThisComponent.calculateAll()
  ThisComponent.store()
  ThisComponent.close(True)
End Sub
</script:module>"""


def have_soffice():
    return shutil.which("soffice") or shutil.which("libreoffice")


def recalc(path, timeout=300):
    """بارگذاری و ذخیره مجدد با LibreOffice تا مقادیر فرمول نوشته شوند.

    روش: تبدیل به همان فرمت xlsx در یک پوشه موقت و جایگزینی فایل اصلی.
    چرا ماکرو به‌کار نرفت: فراخوانی `macro:///...` سند را لزوماً به‌عنوان
    ThisComponent بارگذاری نمی‌کند و بی‌صدا هیچ‌کاری نمی‌کند — همین اتفاق در
    توسعه این پروژه افتاد و با بررسی مقادیر کش‌شده کشف شد. مسیر convert-to
    رفتار قطعی دارد و راستی‌آزمایی شده است.

    نکته: openpyxl فایل را بدون مقدار کش‌شده می‌نویسد، پس LibreOffice چاره‌ای
    جز محاسبه ندارد و هنگام ذخیره مقادیر را می‌نویسد.
    """
    exe = have_soffice()
    if not exe:
        print("! LibreOffice (soffice) نصب نیست.")
        print("  راه جایگزین: فایل را در اکسل باز کنید، Ctrl+Alt+F9 بزنید و ذخیره کنید.")
        return 1
    path = os.path.abspath(path)
    if not os.path.exists(path):
        print("! فایل یافت نشد: %s" % path)
        return 1
    name = os.path.basename(path)
    with tempfile.TemporaryDirectory(prefix="lo_") as tmp:
        profile = os.path.join(tmp, "profile")
        outdir = os.path.join(tmp, "out")
        os.makedirs(profile, exist_ok=True)
        os.makedirs(outdir, exist_ok=True)
        env = os.environ.copy()
        env["SAL_USE_VCLPLUGIN"] = "svp"
        cmd = [exe, "-env:UserInstallation=file://%s" % profile,
               "--headless", "--norestore",
               "--convert-to", "xlsx:Calc MS Excel 2007 XML",
               "--outdir", outdir, path]
        try:
            r = subprocess.run(cmd, env=env, timeout=timeout,
                               capture_output=True, check=False)
        except subprocess.TimeoutExpired:
            # مهم: subprocess.run با timeout فرایند را می‌کشد، ولی soffice
            # ممکن است فرزندی جا بگذارد. نسخه اول این اسکریپت از فراخوانی
            # ماکرو استفاده می‌کرد که بی‌نهایت منتظر می‌ماند و فایل را نیمه‌کاره
            # رها می‌کرد — مهلت صریح از تکرار آن جلوگیری می‌کند.
            print("! بازمحاسبه بیش از %d ثانیه طول کشید: %s" % (timeout, name))
            print("  فایل دست‌نخورده ماند. آن را در اکسل باز کنید و ذخیره کنید.")
            return 1
        produced = os.path.join(outdir, name)
        if not os.path.exists(produced):
            print("! LibreOffice خروجی نداد: %s" % name)
            err = (r.stderr or b"").decode("utf-8", "replace").strip()
            if err:
                print("  %s" % err[:300])
            return 1
        shutil.copyfile(produced, path)
    print("✓ بازمحاسبه شد: %s" % name)
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description="بازمحاسبه فرمول‌های اکسل")
    ap.add_argument("files", nargs="+")
    ap.add_argument("--timeout", type=int, default=300)
    args = ap.parse_args(argv)
    rc = 0
    for f in args.files:
        rc |= recalc(f, args.timeout)
    return rc


if __name__ == "__main__":
    sys.exit(main())
