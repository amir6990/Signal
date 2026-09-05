# -*- coding: utf-8 -*-
"""
طلا: تجزیه قیمت داخلی و زمینه چرخه‌ای.

دو بخش کاملاً متفاوت که نباید با هم اشتباه شوند:

۱) تجزیه قیمت (محاسبه قطعی): قیمت سکه در ایران = ارزش ذاتی طلای آن + حباب.
   ارزش ذاتی از اونس جهانی و نرخ ارز به‌دست می‌آید و هیچ فرضی ندارد. این
   بخش دقیق و قابل راستی‌آزمایی است.

۲) زمینه چرخه‌ای (فرضیه): ادعاهایی مثل «چرخه ۸ ساله طلا» پشتوانه تجربی
   محکمی ندارند. به‌جای تکرار آن‌ها، همان موتور طیفی این پکیج را روی سری
   قیمت طلا اجرا کنید تا ببینید در داده واقعی چه چیزی معنادار است. تنها
   پیوند چرخه‌ای که در منابع این پکیج مستند است، رابطه قیمت کالاها با موج
   کندراتیف است (گرینین و کوروتایف): اوج قیمت کالاها نزدیک اوج موج بلند.
"""
from dataclasses import dataclass
from typing import Optional

OUNCE_GRAMS = 31.1034768

# مشخصات مسکوکات رایج: (وزن گرم، عیار)
COIN_SPECS = {
    "سکه تمام بهار آزادی": (8.133, 0.900),
    "نیم سکه": (4.0665, 0.900),
    "ربع سکه": (2.03325, 0.900),
    "سکه گرمی": (1.0166, 0.900),
}
PURITY_18K = 0.750


@dataclass
class GoldBreakdown:
    instrument: str
    pure_grams: float
    intrinsic_rial: float
    market_rial: Optional[float]
    bubble_rial: Optional[float]
    bubble_pct: Optional[float]
    note: str = ""


def pure_grams(instrument: str) -> float:
    w, p = COIN_SPECS[instrument]
    return w * p


def intrinsic_value(gold_usd_per_oz: float, usd_irr: float,
                    instrument: str = "سکه تمام بهار آزادی") -> float:
    """ارزش ذاتی ریالی بر مبنای محتوای طلای خالص. بدون فرض، فقط حساب."""
    return pure_grams(instrument) * (gold_usd_per_oz / OUNCE_GRAMS) * usd_irr


def gram_18k_rial(gold_usd_per_oz: float, usd_irr: float) -> float:
    """ارزش خام هر گرم طلای ۱۸ عیار (بدون اجرت، مالیات و سود فروشنده)."""
    return (gold_usd_per_oz / OUNCE_GRAMS) * PURITY_18K * usd_irr


def breakdown(gold_usd_per_oz: float, usd_irr: float,
              market_rial: Optional[float] = None,
              instrument: str = "سکه تمام بهار آزادی") -> GoldBreakdown:
    """تجزیه قیمت بازار به ارزش ذاتی و حباب."""
    intrinsic = intrinsic_value(gold_usd_per_oz, usd_irr, instrument)
    b = GoldBreakdown(instrument, pure_grams(instrument), intrinsic, market_rial,
                      None, None)
    if market_rial:
        b.bubble_rial = market_rial - intrinsic
        b.bubble_pct = b.bubble_rial / intrinsic if intrinsic else None
        b.note = ("حباب %.1f%%" % (b.bubble_pct * 100) if b.bubble_pct is not None
                  else "")
    else:
        b.note = "قیمت بازار وارد نشده — فقط ارزش ذاتی محاسبه شد."
    return b


def decompose_return(gold_usd_0: float, gold_usd_1: float,
                     fx_0: float, fx_1: float,
                     market_0: float, market_1: float):
    """بازده ریالی سکه را به سه محرک تفکیک می‌کند: طلای جهانی، ارز، تغییر حباب.

    این تفکیک برای بازار ایران مهم است: بازده ریالی طلا اغلب نه از طلا بلکه
    از تضعیف ریال می‌آید، و گاهی صرفاً از باد کردن حباب.
    """
    r_gold = gold_usd_1 / gold_usd_0 - 1 if gold_usd_0 else 0.0
    r_fx = fx_1 / fx_0 - 1 if fx_0 else 0.0
    intr_0 = gold_usd_0 * fx_0
    intr_1 = gold_usd_1 * fx_1
    prem_0 = market_0 / intr_0 if intr_0 else 1.0
    prem_1 = market_1 / intr_1 if intr_1 else 1.0
    r_prem = prem_1 / prem_0 - 1 if prem_0 else 0.0
    total = market_1 / market_0 - 1 if market_0 else 0.0
    return {
        "بازده کل ریالی": total,
        "سهم طلای جهانی": r_gold,
        "سهم نرخ ارز": r_fx,
        "سهم تغییر حباب": r_prem,
        "کنترل ترکیبی": (1 + r_gold) * (1 + r_fx) * (1 + r_prem) - 1,
    }


CYCLE_CONTEXT = {
    "چرخه مستند در منابع این پکیج": (
        "رابطه قیمت کالاها با موج کندراتیف (گرینین و کوروتایف): اوج قیمت "
        "کالاهای پایه نزدیک اوج موج بلند و کف آن در فاز نزولی. طلا در این "
        "چارچوب یک کالای پایه است، ولی رفتار آن به‌عنوان دارایی پولی هم هست "
        "و همین، تفسیر تک‌عاملی را نامعتبر می‌کند."),
    "چرخه‌های ادعایی بدون پشتوانه": (
        "«چرخه ۸ ساله طلا» و مشابه آن در منابع این پکیج مستند نیست و در این "
        "پیاده‌سازی عمداً کدگذاری نشده. اگر چنین چرخه‌ای وجود دارد، باید در "
        "خروجی موتور طیفی روی سری واقعی قیمت ظاهر شود."),
    "محرک‌های واقعی (خارج از چارچوب چرخه‌ای)": (
        "نرخ بهره حقیقی آمریکا، شاخص دلار، خرید بانک‌های مرکزی، و برای قیمت "
        "ریالی: نرخ ارز و حباب. این‌ها چرخه نیستند ولی توضیح‌دهنده‌تر از چرخه‌اند."),
}
