# -*- coding: utf-8 -*-
"""
tse_updater.py — پرکردن خودکار فایل سیگنال از APIهای بازار سرمایه ایران.

    python scripts/tse_updater.py --workbook Iran_Stock_Signals.xlsx --history 300

کاری که می‌کند:
  ۱. برای هر نماد Watchlist، InsCode و ISIN را با GetInstrumentSearch تأیید/اصلاح می‌کند.
  ۲. Data_Input را با قیمت لحظه‌ای + حقیقی/حقوقی + بهترین سفارش پر می‌کند.
  ۳. Daily_History را با تاریخچه روزانه + حقیقی/حقوقی تاریخی بازمی‌سازد و فرمول‌های
     ستون U به بعد را دوباره می‌نویسد.
  ۴. Market_Index را با شاخص کل و هم‌وزن به‌روز می‌کند.

اصول پیاده‌سازی:
  • هیچ فرمولی بازنویسی نمی‌شود مگر ستون‌های محاسباتی Daily_History که خودِ اسکریپت
    از روی الگوهای build_workbook.py دوباره می‌سازد.
  • نام فیلدهایی که در مستندات ریپو «نیازمند تأیید» علامت خورده‌اند با چند نام
    جایگزین امتحان می‌شوند و اگر پیدا نشدند، گزارش می‌شود — نه اینکه صفر جا زده شود.
  • openpyxl مقدار محاسبه‌شده فرمول‌ها را ذخیره نمی‌کند؛ بعد از اجرا فایل را در اکسل
    باز کنید تا محاسبه مجدد انجام شود.
"""
import argparse
import datetime
import json
import os
import sys
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "src"))

from openpyxl import load_workbook                      # noqa: E402
import build_workbook as BW                             # noqa: E402
from common import jalali_str                           # noqa: E402

CDN = "https://cdn.tsetmc.com/api"
GW = "https://webgw.tse.ir/InstrumentProvider/api/v1"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")

IDX_TOTAL = "32097828799138957"        # شاخص كل
IDX_EQW = "67130298613737946"          # شاخص كل هم وزن


# --------------------------------------------------------------- HTTP
def fetch(url, timeout=20, retries=4):
    """GET با هدر User-Agent الزامی و backoff نمایی."""
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": UA, "Accept": "application/json, text/plain, */*",
                "Referer": "https://www.tsetmc.com/"})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                if resp.status == 204:
                    return None
                return json.loads(resp.read().decode("utf-8", "replace"))
        except Exception as exc:                        # noqa: BLE001
            last = exc
            time.sleep(2 ** attempt)
    print("  ! خطا در %s → %s" % (url, last))
    return None


def pick(obj, *names, default=None):
    """اولین کلید موجود را برمی‌گرداند — برای فیلدهایی که نامشان تأیید نشده."""
    if not isinstance(obj, dict):
        return default
    lowered = {str(k).lower(): v for k, v in obj.items()}
    for n in names:
        if n in obj:
            return obj[n]
        if str(n).lower() in lowered:
            return lowered[str(n).lower()]
    return default


MISSING = set()


def need(obj, label, *names):
    v = pick(obj, *names)
    if v is None:
        MISSING.add("%s (%s)" % (label, "/".join(names)))
    return v


# --------------------------------------------------------- endpoints
def search_instrument(query):
    data = fetch("%s/Instrument/GetInstrumentSearch/%s"
                 % (CDN, urllib.parse.quote(query)))
    items = (data or {}).get("instrumentSearch") or []
    for it in items:
        if str(pick(it, "lVal18AFC", default="")).strip() == query.strip():
            return it
    return items[0] if items else None


def closing_price_info(ins):
    d = fetch("%s/ClosingPrice/GetClosingPriceInfo/%s" % (CDN, ins))
    return (d or {}).get("closingPriceInfo")


def instrument_identity(ins):
    d = fetch("%s/Instrument/GetInstrumentIdentity/%s" % (CDN, ins))
    return (d or {}).get("instrumentIdentity")


def client_type(ins):
    d = fetch("%s/ClientType/GetClientType/%s/1/0" % (CDN, ins))
    return (d or {}).get("clientType")


def client_type_history(ins, top=0):
    """تاریخچه حقیقی/حقوقی. برخی نسخه‌ها آرایه برمی‌گردانند و برخی تک‌آبجکت."""
    d = fetch("%s/ClientType/GetClientTypeHistory/%s/%s" % (CDN, ins, top))
    if not d:
        return []
    v = d.get("clientType")
    if isinstance(v, list):
        return v
    return [v] if v else []


def best_limits(ins):
    d = fetch("%s/BestLimits/%s" % (CDN, ins))
    rows = (d or {}).get("bestLimits") or []
    return rows[0] if rows else None


def daily_list(ins, top=0):
    d = fetch("%s/ClosingPrice/GetClosingPriceDailyList/%s/%d" % (CDN, ins, top))
    return (d or {}).get("closingPriceDaily") or []


def selected_indices(flow=1):
    d = fetch("%s/Index/GetIndexB1LastAll/SelectedIndexes/%d" % (CDN, flow))
    return (d or {}).get("indexB1") or []


def live_instrument(isin):
    return fetch("%s/Instrument/LiveInstrumentByIdQuery/fa?InstrumentId=%s" % (GW, isin))


def market_watch_option():
    d = fetch("%s/MarketWatch/MarketWatchOption/fa" % GW)
    if isinstance(d, dict):
        return d.get("Items") or d.get("items") or []
    return d or []


# ------------------------------------------------------------ helpers
def deven_to_date(deven):
    s = str(int(deven))
    return datetime.date(int(s[:4]), int(s[4:6]), int(s[6:8]))


def col_index(sheet_cols, api_key):
    for i, col in enumerate(sheet_cols):
        if col[1] == api_key:
            return i + 1
    raise KeyError(api_key)


# ------------------------------------------------------------ updates
def update_watchlist(ws, verify=True):
    """InsCode/ISIN را تأیید یا اصلاح می‌کند و برمی‌گرداند."""
    out = []
    r = 5
    while ws.cell(row=r, column=1).value:
        sym = str(ws.cell(row=r, column=1).value).strip()
        ins = ws.cell(row=r, column=3).value
        isin = ws.cell(row=r, column=4).value
        active = str(ws.cell(row=r, column=8).value or "بله").strip()
        if verify:
            found = search_instrument(sym)
            if found:
                new_ins = str(pick(found, "insCode", default="") or "")
                new_isin = str(pick(found, "cIsin", default="") or "")
                if new_ins:
                    if str(ins) != new_ins:
                        print("  · %s: InsCode اصلاح شد %s → %s" % (sym, ins, new_ins))
                    ins = new_ins
                    ws.cell(row=r, column=3, value=new_ins).number_format = "@"
                if new_isin:
                    isin = new_isin
                    ws.cell(row=r, column=4, value=new_isin).number_format = "@"
                ws.cell(row=r, column=2, value=pick(found, "lVal30", default=ws.cell(row=r, column=2).value))
                ws.cell(row=r, column=5, value=pick(found, "flowTitle", default=ws.cell(row=r, column=5).value))
                ws.cell(row=r, column=7, value="بله")
                ident = instrument_identity(ins)
                if ident:
                    sec = pick(ident, "sector", default={}) or {}
                    ws.cell(row=r, column=6, value=str(pick(sec, "lSecVal", default="")).strip()
                            or ws.cell(row=r, column=6).value)
            else:
                ws.cell(row=r, column=7, value="خیر")
                print("  ! %s در جستجو پیدا نشد" % sym)
        if active == "بله":
            out.append((sym, str(ins), str(isin), r))
        r += 1
    return out


def update_data_input(ws, targets):
    """پرکردن ردیف‌های Data_Input بر اساس ترتیب Watchlist."""
    ci = {c[1]: i + 1 for i, c in enumerate(BW.DI_COLS)}
    for n, (sym, ins, isin, _wr) in enumerate(targets):
        r = 5 + n
        cp = closing_price_info(ins) or {}
        ct = client_type(ins) or {}
        bl = best_limits(ins) or {}
        live = live_instrument(isin) or {}
        state = pick(cp, "instrumentState", default={}) or {}
        yesterday = pick(cp, "priceYesterday") or pick(live, "yesterdayPrice")
        closing = pick(cp, "pClosing")
        vals = {
            "lVal18AFC": sym,
            "insCode": ins,
            "cIsin": isin,
            "cEtavalTitle": str(pick(state, "cEtavalTitle", default="")).strip(),
            "hEven": pick(cp, "hEven"),
            "pDrCotVal": pick(cp, "pDrCotVal"),
            "pClosing": closing,
            "priceYesterday": yesterday,
            "priceChange": pick(cp, "priceChange"),
            "priceChangePercent": (pick(cp, "priceChangePercent") or 0) / 100.0
                                  if pick(cp, "priceChangePercent") is not None else None,
            "firstPrice": pick(live, "firstPrice"),
            "highValue": pick(live, "highValue", "maxValue"),
            "lowValue": pick(live, "lowValue", "minValue"),
            "qTotTran5J": pick(cp, "qTotTran5J"),
            "qTotCap": pick(cp, "qTotCap"),
            "zTotTran": pick(cp, "zTotTran"),
            "marketvalue": pick(live, "marketvalue", "marketValue"),
            "sharecount": pick(live, "sharecount", "shareCount"),
            "buy_I_Volume": need(ct, "حجم خرید حقیقی", "buy_I_Volume", "buyIVolume"),
            "sell_I_Volume": need(ct, "حجم فروش حقیقی", "sell_I_Volume", "sellIVolume"),
            "buy_CountI": need(ct, "تعداد خریدار حقیقی", "buy_CountI", "buyCountI"),
            "sell_CountI": need(ct, "تعداد فروشنده حقیقی", "sell_CountI", "sellCountI"),
            "buy_N_Volume": pick(ct, "buy_N_Volume", "buyNVolume"),
            "sell_N_Volume": pick(ct, "sell_N_Volume", "sellNVolume"),
            "buy_CountN": pick(ct, "buy_CountN", "buyCountN"),
            "sell_CountN": pick(ct, "sell_CountN", "sellCountN"),
            "pMeDem_1": pick(bl, "pMeDem"),
            "qTitMeDem_1": need(bl, "حجم بهترین خرید", "qTitMeDem"),
            "zOrdMeDem_1": pick(bl, "zOrdMeDem"),
            "pMeOf_1": pick(bl, "pMeOf"),
            "qTitMeOf_1": need(bl, "حجم بهترین فروش", "qTitMeOf"),
            "zOrdMeOf_1": pick(bl, "zOrdMeOf"),
        }
        for key, v in vals.items():
            if v is None:
                continue
            c = ws.cell(row=r, column=ci[key], value=v)
            if key in ("insCode", "cIsin"):
                c.number_format = "@"
        print("  ✓ Data_Input: %s" % sym)
    return len(targets)


def update_daily_history(ws, targets, top):
    """بازسازی کامل شیت تاریخچه + بازنویسی فرمول‌های ستون‌های محاسباتی."""
    nraw = len(BW.DH_RAW)
    # پاک‌کردن داده قبلی
    if ws.max_row >= 5:
        ws.delete_rows(5, ws.max_row - 4)
    r = 5
    for (sym, ins, isin, _wr) in targets:
        rows = daily_list(ins, top)
        rows = sorted(rows, key=lambda x: int(pick(x, "dEven", default=0)))
        flows = {}
        for f in client_type_history(ins, top):
            de = pick(f, "recDate", "dEven")
            if de:
                flows[int(de)] = f
        for row in rows:
            de = int(pick(row, "dEven", default=0))
            if not de:
                continue
            d = deven_to_date(de)
            f = flows.get(de, {})
            vals = [sym, ins, d, de, jalali_str(d),
                    pick(row, "priceFirst"), pick(row, "priceMax"), pick(row, "priceMin"),
                    pick(row, "pClosing"), pick(row, "pDrCotVal"), pick(row, "priceYesterday"),
                    pick(row, "qTotTran5J"), pick(row, "qTotCap"), pick(row, "zTotTran"),
                    pick(f, "buy_I_Volume", "buyIVolume"), pick(f, "sell_I_Volume", "sellIVolume"),
                    pick(f, "buy_CountI", "buyCountI"), pick(f, "sell_CountI", "sellCountI"),
                    pick(f, "buy_N_Volume", "buyNVolume"), pick(f, "sell_N_Volume", "sellNVolume")]
            for i, v in enumerate(vals):
                c = ws.cell(row=r, column=i + 1, value=v)
                if BW.DH_RAW[i][3]:
                    c.number_format = BW.DH_RAW[i][3]
            for j, (_l, _d, _w, fmt, tmpl, back) in enumerate(BW.DH_CALC):
                c = ws.cell(row=r, column=nraw + 1 + j,
                            value=BW.dh_formula(tmpl, back, r))
                if fmt:
                    c.number_format = fmt
            r += 1
        print("  ✓ Daily_History: %s (%d روز)" % (sym, len(rows)))
    ws.auto_filter.ref = "A4:%s%d" % (
        BW.get_column_letter(nraw + len(BW.DH_CALC)), max(r - 1, 5))
    return r - 5


def update_market_index(ws, top):
    """شاخص کل و هم‌وزن. تاریخچه شاخص در cdn به‌صورت مستقیم نیست؛ از GetIndexB1LastAll
    فقط مقدار روز جاری می‌آید — بنابراین ردیف امروز افزوده/به‌روز می‌شود و تاریخچه
    قبلی دست‌نخورده می‌ماند."""
    items = selected_indices(1)
    by_code = {str(pick(it, "insCode", default="")): it for it in items}
    tot, eqw = by_code.get(IDX_TOTAL), by_code.get(IDX_EQW)
    if not tot or not eqw:
        print("  ! شاخص‌ها دریافت نشدند")
        return 0
    today = datetime.date.today()
    r = 5
    while ws.cell(row=r, column=1).value:
        r += 1
    lastr = r - 1
    if lastr >= 5 and ws.cell(row=lastr, column=1).value == today:
        r = lastr
    ws.cell(row=r, column=1, value=today).number_format = BW.F_DATE
    ws.cell(row=r, column=2, value=int("%04d%02d%02d" % (today.year, today.month, today.day)))
    ws.cell(row=r, column=3, value=jalali_str(today))
    ws.cell(row=r, column=4, value=pick(tot, "xDrNivJIdx004"))
    ws.cell(row=r, column=9, value=pick(eqw, "xDrNivJIdx004"))
    ws.cell(row=r, column=14, value='=IF($A{r}=$A{p},$N{p}+1,1)'.format(r=r, p=r - 1))
    for col, src in ((5, "D"), (10, "I")):
        ws.cell(row=r, column=col,
                value='=IF($N{r}>1,${s}{r}/${s}{p}-1,"")'.format(r=r, p=r - 1, s=src))
    for col, src, per in ((6, "D", "MA_SHORT"), (7, "D", "MA_MED"), (8, "D", "MA_LONG2"),
                          (11, "I", "MA_SHORT"), (12, "I", "MA_MED"), (13, "I", "MA_LONG2")):
        lo = max(5, r - 400)
        ws.cell(row=r, column=col,
                value='=IF($N{r}>={p},AVERAGE(INDEX(${s}${lo}:${s}{r},{k}-{p}):${s}{r}),"")'.format(
                    r=r, s=src, p=per, lo=lo, k=r - lo + 2))
    print("  ✓ Market_Index: ردیف %d به‌روز شد" % r)
    return 1


def update_options(ws, targets):
    """پرکردن شیت آپشن از دیده‌بان اختیار معامله برای نمادهای پایه Watchlist."""
    items = market_watch_option()
    if not items:
        print("  ! دیده‌بان آپشن خالی برگشت (خارج از ساعت معاملات طبیعی است)")
        return 0
    bases = {t[0] for t in targets}
    rows = []
    for it in items:
        name = str(pick(it, "instrumentName", default=""))
        base = next((b for b in bases if b in name), None)
        if not base:
            continue
        rows.append((it, base, name))
    if not rows:
        print("  ! قراردادی روی نمادهای Watchlist یافت نشد")
        return 0
    first = 5
    if ws.max_row >= first:
        ws.delete_rows(first, ws.max_row - first + 1)
    for n, (it, base, name) in enumerate(rows):
        r = first + n
        is_call = name.startswith("ض")
        raw = [name, pick(it, "instrumentId"), "Call" if is_call else "Put", base,
               pick(it, "qeymateEmal"), pick(it, "tarixSarresid"),
               pick(it, "baghimandetasarresid", "baqimandeTaSarresId"),
               pick(it, "lastPrice"), pick(it, "closingPrice"), pick(it, "tradeVolume"),
               pick(it, "tradeValue"), pick(it, "tradeCount"),
               need(it, "موقعیت‌های باز", "openInterest", "mojoodiMoghiatBaz"),
               pick(it, "andazeyeQarardad", "buyAndazeyeQarardad", default=1000)]
        for i, v in enumerate(raw):
            if v is None:
                continue
            c = ws.cell(row=r, column=i + 1, value=v)
            if BW.OPT_COLS[i][3]:
                c.number_format = BW.OPT_COLS[i][3]
    print("  ✓ Options: %d قرارداد" % len(rows))
    print("  ⓘ فرمول‌های ستون O به بعد شیت Options برای ردیف‌های جدید باید یک‌بار از "
          "ردیف ۵ به پایین کپی شوند (اکسل خودش با کشیدن انجام می‌دهد).")
    return len(rows)


def main():
    ap = argparse.ArgumentParser(description="به‌روزرسانی فایل سیگنال از tsetmc")
    ap.add_argument("--workbook", default="Stocks_Signals.xlsx",
                    help="فایل سیگنال سهام. برای فایل آپشن از --options استفاده کنید.")
    ap.add_argument("--options", default=None,
                    help="فایل Options_Signals.xlsx — اگر داده شود، دیده‌بان آپشن "
                         "در آن نوشته می‌شود، نه در فایل سهام.")
    ap.add_argument("--history", type=int, default=300,
                    help="تعداد روز تاریخچه (۰ = کل تاریخچه). حداقل ۲۰۰ برای MA بلند لازم است.")
    ap.add_argument("--skip-history", action="store_true")
    ap.add_argument("--skip-options", action="store_true")
    ap.add_argument("--no-verify", action="store_true",
                    help="از تأیید InsCode با جستجو صرف‌نظر کن (سریع‌تر)")
    args = ap.parse_args()

    if args.history and args.history < 200:
        print("⚠️  history کمتر از ۲۰۰ است؛ MA بلند محاسبه نخواهد شد.")

    wb = load_workbook(args.workbook)          # بدون data_only تا فرمول‌ها حفظ شوند
    print("→ تأیید نمادها…")
    targets = update_watchlist(wb["Watchlist"], verify=not args.no_verify)
    print("→ %d نماد فعال" % len(targets))
    print("→ Data_Input…")
    update_data_input(wb["Data_Input"], targets)
    if not args.skip_history:
        print("→ Daily_History…")
        update_daily_history(wb["Daily_History"], targets, args.history)
    print("→ Market_Index…")
    update_market_index(wb["Market_Index"], args.history)
    wb.save(args.workbook)

    if not args.skip_options and args.options:
        if not os.path.exists(args.options):
            print("! فایل آپشن یافت نشد: %s" % args.options)
        else:
            print("→ Options (%s)…" % args.options)
            wbo = load_workbook(args.options)
            if "Options" in wbo.sheetnames:
                update_options(wbo["Options"], targets)
                wbo.save(args.options)
            else:
                print("! شیت Options در فایل مقصد نیست.")
    elif not args.skip_options:
        print("ⓘ برای به‌روزرسانی آپشن، مسیر فایل آپشن را با --options بدهید.")
    print("\n✓ ذخیره شد: %s" % args.workbook)
    print("گام بعد: python scripts/link_workbooks.py  و  "
          "python -m timeframe export --workbook Time_Analysis.xlsx --data %s"
          % args.workbook)
    if MISSING:
        print("\n⚠️  فیلدهایی که در پاسخ واقعی API پیدا نشدند (نام آن‌ها را در شیت "
              "API_Map اصلاح کنید و در تابع pick() نام درست را اضافه کنید):")
        for m in sorted(MISSING):
            print("   - %s" % m)
    print("\nتوجه: openpyxl مقدار محاسبه‌شده فرمول‌ها را ذخیره نمی‌کند. "
          "فایل را در اکسل باز کنید تا محاسبه مجدد انجام شود.")


if __name__ == "__main__":
    main()
