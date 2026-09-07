# -*- coding: utf-8 -*-
"""
ساخت نسخه قابل ایمپورت ماژول‌های VBA.

مسئله: ویرایشگر VBA فایل .bas را با **کدپیج محلی ویندوز** می‌خواند، نه
UTF-8. پس هر متن فارسی در فایل — چه کامنت، چه رشته — موقع ایمپورت خراب
می‌شود. نتیجه‌اش را کاربر دید: کامنت‌ها ناخوانا و متن دکمه سبز به‌هم‌ریخته.

راه‌حل: فایل توزیعی **فقط ASCII** باشد.
  • رشته‌های فارسی → U("کد هگز") که در زمان اجرا با ChrW ساخته می‌شود.
    این یعنی متنی که در سلول یا پیام نوشته می‌شود دقیقاً درست است،
    مستقل از کدپیج سیستم.
  • کامنت‌های فارسی → از نسخه توزیعی حذف می‌شوند. متن کاملشان در
    vba/*.bas (منبع) می‌ماند و در گیت‌هاب خوانا است.

    خراب نگه‌داشتنشان بدتر بود: هم ناخوانا و هم گمراه‌کننده.

    python scripts/vba_pack.py            # ساخت vba/dist/
"""
import io
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "vba")
DST = os.path.join(SRC, "dist")

DECODER = '''
' --- ASCII-safe text -------------------------------------------------
' The VBA editor imports .bas using the local Windows code page, not
' UTF-8, so any non-ASCII source text is corrupted on import. Persian
' strings are therefore stored as hex and rebuilt at run time, which is
' code-page independent. Full Persian comments live in the repo source
' (vba/*.bas); this distributable copy is deliberately pure ASCII.
Private Function U(ByVal h As String) As String
    Dim i As Long, s As String
    For i = 1 To Len(h) - 3 Step 4
        s = s & ChrW$(CLng("&H" & Mid$(h, i, 4)))
    Next i
    U = s
End Function
'''


def split_code_comment(line):
    """مرز کد و کامنت را پیدا می‌کند، با احترام به رشته‌ها و "" داخلشان."""
    i, n, in_str = 0, len(line), False
    while i < n:
        ch = line[i]
        if ch == '"':
            if in_str and i + 1 < n and line[i + 1] == '"':
                i += 2
                continue
            in_str = not in_str
        elif ch == "'" and not in_str:
            return line[:i], line[i:]
        i += 1
    return line, ""


def literals(code):
    """بازه همه رشته‌های داخل کد. خروجی: list[(start, end, inner)]."""
    out, i, n = [], 0, len(code)
    while i < n:
        if code[i] == '"':
            j = i + 1
            buf = []
            while j < n:
                if code[j] == '"':
                    if j + 1 < n and code[j + 1] == '"':
                        buf.append('"')
                        j += 2
                        continue
                    break
                buf.append(code[j])
                j += 1
            out.append((i, j + 1, "".join(buf)))
            i = j + 1
        else:
            i += 1
    return out


def to_hex(s):
    return "".join("%04X" % ord(c) for c in s)


def convert(path):
    src = io.open(path, encoding="utf-8").read().split("\n")
    out, n_str, n_cmt, longest = [], 0, 0, 0
    for line in src:
        code, cmt = split_code_comment(line)
        # کامنت غیر-ASCII حذف می‌شود
        if cmt and any(ord(c) > 127 for c in cmt):
            n_cmt += 1
            cmt = ""
            if not code.strip():
                continue
            code = code.rstrip()
        # رشته‌های غیر-ASCII به U("hex")
        lits = literals(code)
        for a, b, inner in reversed(lits):
            if any(ord(c) > 127 for c in inner):
                code = code[:a] + 'U("%s")' % to_hex(inner) + code[b:]
                n_str += 1
        new = (code + cmt).rstrip()
        if any(ord(c) > 127 for c in new):
            # چیزی جا مانده — نباید رخ دهد
            raise SystemExit("متن غیر-ASCII باقی ماند در %s:\n%s" % (path, new))
        longest = max(longest, len(new))
        out.append(new)

    text = "\n".join(out)
    # تابع رمزگشا بعد از اعلان‌های سطح ماژول و پیش از اولین رویه
    m = re.search(r"^(Public |Private )?(Sub|Function) ", text, re.M)
    if m and n_str:
        text = text[:m.start()] + DECODER.strip() + "\n\n" + text[m.start():]
    return text, n_str, n_cmt, longest


def main():
    if not os.path.isdir(SRC):
        print("پوشه vba پیدا نشد")
        return 1
    os.makedirs(DST, exist_ok=True)
    print("%-22s %8s %8s %10s" % ("ماژول", "رشته", "کامنت", "بلندترین خط"))
    print("-" * 54)
    bad = 0
    for f in sorted(os.listdir(SRC)):
        if not f.endswith(".bas"):
            continue
        text, ns, nc, lg = convert(os.path.join(SRC, f))
        io.open(os.path.join(DST, f), "w", encoding="ascii", newline="\r\n").write(text)
        flag = ""
        if lg > 1000:
            flag = "  ⚠ نزدیک سقف ۱۰۲۳ کاراکتر VBA"
            bad += 1
        print("%-22s %8d %8d %10d%s" % (f, ns, nc, lg, flag))
    # --- نصب‌کننده: UTF-16LE با BOM ---
    # Windows Script Host هم فایل .vbs را با کدپیج محلی می‌خواند مگر آنکه
    # UTF-16LE با BOM باشد. بدون این، متن دکمه سبز به‌هم‌ریخته می‌شود —
    # دقیقاً همان چیزی که در اکسل دیده شد.
    src_vbs = os.path.join(HERE, "install_buttons_source.vbs")
    out_vbs = os.path.join(ROOT, "Install_Buttons.vbs")
    if os.path.exists(src_vbs):
        txt = io.open(src_vbs, encoding="utf-8").read().replace("\n", "\r\n")
        with open(out_vbs, "wb") as fh:
            fh.write(b"\xff\xfe")                 # BOM UTF-16LE
            fh.write(txt.encode("utf-16-le"))
        print("✓ نصب‌کننده UTF-16LE: %s" % os.path.basename(out_vbs))
    else:
        print("! منبع نصب‌کننده پیدا نشد: %s" % src_vbs)
        bad += 1

    print("\n✓ نسخه ASCII در %s" % DST)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
