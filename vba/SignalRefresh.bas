Attribute VB_Name = "SignalRefresh"
' =====================================================================
'  به‌روزرسانی یک‌کلیکی داده — بدون نیاز به پایتون
'
'  این ماژول خودش مستقیم از اینترنت داده می‌گیرد (MSXML) و در سلول‌ها
'  می‌نویسد. چون پایتون در کار نیست، فایل باز هم می‌ماند و قفل نمی‌شود.
'
'  نقطه ورود:  RefreshAll   ← دکمه را به این وصل کنید
'
'  منابع:  tgju.org (۵ میرور) برای دلار، طلا، سکه
'          api.nobitex.ir (۲ میزبان) برای تتر
' =====================================================================
Option Explicit

Private Const UA As String = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " & _
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

Private Const N_TGJU As Long = 5
Private Const N_NOBITEX As Long = 2

' ---------------------------------------------------------------- HTTP
Private Function HttpGet(ByVal url As String, ByVal referer As String) As String
    Dim h As Object
    On Error GoTo Fail
    Set h = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    h.setTimeouts 8000, 8000, 15000, 25000
    h.Open "GET", url, False
    h.setRequestHeader "User-Agent", UA
    h.setRequestHeader "Accept", "application/json, text/plain, */*"
    If Len(referer) > 0 Then h.setRequestHeader "Referer", referer
    h.send
    If h.Status = 200 Then HttpGet = h.responseText Else HttpGet = ""
    Exit Function
Fail:
    HttpGet = ""
End Function

' اولین میروری که پاسخ بدهد
Private Function FetchTgju() As String
    Dim i As Long, s As String
    For i = 1 To N_TGJU
        s = HttpGet("https://call" & i & ".tgju.org/ajax.json", "https://www.tgju.org/")
        If InStr(1, s, """current""", vbTextCompare) > 0 Then
            FetchTgju = s
            Exit Function
        End If
    Next i
    FetchTgju = ""
End Function

Private Function FetchNobitex() As String
    Dim hosts(1 To 2) As String, i As Long, s As String
    hosts(1) = "https://api.nobitex.ir"
    hosts(2) = "https://apiv2.nobitex.ir"
    For i = 1 To N_NOBITEX
        s = HttpGet(hosts(i) & "/market/stats?srcCurrency=usdt&dstCurrency=rls", "")
        If InStr(1, s, """stats""", vbTextCompare) > 0 Then
            FetchNobitex = s
            Exit Function
        End If
    Next i
    FetchNobitex = ""
End Function

' ---------------------------------------------------- استخراج از JSON
' بدون کتابخانه بیرونی: لنگر را پیدا می‌کند، بعد کلید را بعد از آن.
' هم مقدار داخل گیومه را می‌گیرد هم عدد بدون گیومه.
Private Function JVal(ByVal json As String, ByVal anchor As String, _
                      ByVal key As String) As Double
    Dim p As Long, q As Long, e As Long, raw As String
    JVal = -1
    p = InStr(1, json, """" & anchor & """", vbTextCompare)
    If p = 0 Then Exit Function
    q = InStr(p, json, """" & key & """", vbTextCompare)
    If q = 0 Then Exit Function
    ' فاصله زیاد یعنی کلید به شیء دیگری تعلق دارد
    If q - p > 4000 Then Exit Function
    q = InStr(q, json, ":")
    If q = 0 Then Exit Function
    q = q + 1
    Do While q <= Len(json) And Mid$(json, q, 1) = " "
        q = q + 1
    Loop
    If Mid$(json, q, 1) = """" Then
        q = q + 1
        e = InStr(q, json, """")
    Else
        e = q
        Do While e <= Len(json) And InStr("0123456789.-", Mid$(json, e, 1)) > 0
            e = e + 1
        Loop
    End If
    If e <= q Then Exit Function
    raw = Mid$(json, q, e - q)
    JVal = CleanNum(raw)
End Function

' حذف کاما، جداکننده فارسی و تبدیل ارقام فارسی/عربی
Private Function CleanNum(ByVal s As String) As Double
    Dim i As Long, ch As String, out As String, code As Long
    For i = 1 To Len(s)
        ch = Mid$(s, i, 1)
        code = AscW(ch)
        If code >= &H6F0 And code <= &H6F9 Then          ' ۰-۹ فارسی
            out = out & CStr(code - &H6F0)
        ElseIf code >= &H660 And code <= &H669 Then      ' ٠-٩ عربی
            out = out & CStr(code - &H660)
        ElseIf InStr("0123456789.-", ch) > 0 Then
            out = out & ch
        End If
    Next i
    If Len(out) = 0 Or out = "-" Or out = "." Then
        CleanNum = -1
    Else
        On Error Resume Next
        CleanNum = CDbl(out)
        If Err.Number <> 0 Then CleanNum = -1
        On Error GoTo 0
    End If
End Function


' برش شیء { ... } که یک رشته مشخص داخلش است.
' لازم است چون بعضی پاسخ‌ها **آرایه**اند: بدون این، همیشه اولین عضو خوانده
' می‌شد نه عضوی که می‌خواهیم. (مثلاً شاخص کل در میان ده‌ها شاخص دیگر.)
Private Function ObjAround(ByVal json As String, ByVal needle As String) As String
    Dim p As Long, i As Long, depth As Long, s As Long, e As Long
    ObjAround = ""
    p = InStr(1, json, needle, vbTextCompare)
    If p = 0 Then Exit Function

    ' به عقب تا آکولاد بازِ متناظر
    depth = 0
    For i = p To 1 Step -1
        If Mid$(json, i, 1) = "}" Then depth = depth + 1
        If Mid$(json, i, 1) = "{" Then
            If depth = 0 Then
                s = i
                Exit For
            End If
            depth = depth - 1
        End If
    Next i
    If s = 0 Then Exit Function

    ' به جلو تا آکولاد بسته متناظر
    depth = 0
    For i = s To Len(json)
        If Mid$(json, i, 1) = "{" Then depth = depth + 1
        If Mid$(json, i, 1) = "}" Then
            depth = depth - 1
            If depth = 0 Then
                e = i
                Exit For
            End If
        End If
    Next i
    If e <= s Then Exit Function
    ObjAround = Mid$(json, s, e - s + 1)
End Function

' مقدار یک کلید در شیء‌ای که needle داخلش است
Private Function JValIn(ByVal json As String, ByVal needle As String, _
                        ByVal key As String) As Double
    Dim obj As String
    JValIn = -1
    obj = ObjAround(json, needle)
    If Len(obj) = 0 Then Exit Function
    ' کلید خودش لنگر است: JVal اول "key" را پیدا می‌کند و بعد از همان‌جا
    ' دنبال ":" می‌گردد — یعنی دقیقاً همان مقدار.
    JValIn = JVal(obj, key, key)
End Function

' ------------------------------------------------- نوشتن در نام تعریف‌شده
' اگر نام در این فایل نباشد، بی‌صدا رد می‌شود — پس یک ماژول در هر پنج فایل کار می‌کند.
Private Function PutName(ByVal nm As String, ByVal v As Double) As Boolean
    Dim r As Range
    PutName = False
    If v <= 0 Then Exit Function
    On Error Resume Next
    Set r = ThisWorkbook.Names(nm).RefersToRange
    On Error GoTo 0
    If r Is Nothing Then Exit Function
    r.Value = v
    PutName = True
End Function

' -------------------------------------------------------- تاریخ شمسی
Private Function IsGLeap(ByVal y As Long) As Boolean
    IsGLeap = (y Mod 4 = 0 And y Mod 100 <> 0) Or (y Mod 400 = 0)
End Function

Public Function JalaliStr(ByVal d As Date) As String
    Dim gy As Long, gm As Long, gd As Long
    Dim gy2 As Long, gm2 As Long, gd2 As Long
    Dim gDay As Long, jDay As Long, jNp As Long
    Dim jy As Long, i As Long, md As Long
    Dim dm As Variant
    dm = Array(0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334)
    gy = Year(d): gm = Month(d): gd = Day(d)
    gy2 = gy - 1600: gm2 = gm - 1: gd2 = gd - 1
    gDay = 365 * gy2 + Int((gy2 + 3) / 4) - Int((gy2 + 99) / 100) + Int((gy2 + 399) / 400)
    gDay = gDay + dm(gm2) + gd2
    If gm > 2 And IsGLeap(gy) Then gDay = gDay + 1
    jDay = gDay - 79
    jNp = Int(jDay / 12053)
    jDay = jDay Mod 12053
    jy = 979 + 33 * jNp + 4 * Int(jDay / 1461)
    jDay = jDay Mod 1461
    If jDay >= 366 Then
        jy = jy + Int((jDay - 1) / 365)
        jDay = (jDay - 1) Mod 365
    End If
    For i = 0 To 10
        If i < 6 Then md = 31 Else md = 30
        If jDay < md Then Exit For
        jDay = jDay - md
    Next i
    JalaliStr = Format$(jy, "0000") & "/" & Format$(i + 1, "00") & "/" & _
                Format$(jDay + 1, "00")
End Function

' ------------------------------------------- افزودن ردیف امروز به تاریخچه
' اگر تاریخ امروز از قبل باشد، همان ردیف به‌روز می‌شود — ردیف تکراری ساخته نمی‌شود.
Private Sub AppendHistory(ByVal sheetName As String, ByVal px As Double)
    Dim ws As Worksheet, r As Long, last As Long, tgt As Long
    If px <= 0 Then Exit Sub
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(sheetName)
    On Error GoTo 0
    If ws Is Nothing Then Exit Sub

    last = 4
    For r = 5 To 6000
        If IsDate(ws.Cells(r, 1).Value) Then last = r
    Next r
    If last < 5 Then Exit Sub

    If IsDate(ws.Cells(last, 1).Value) And _
       Int(CDate(ws.Cells(last, 1).Value)) = Int(Date) Then
        tgt = last
    Else
        tgt = last + 1
    End If
    ws.Cells(tgt, 1).Value = Date
    ws.Cells(tgt, 1).NumberFormat = "yyyy-mm-dd"
    ws.Cells(tgt, 2).Value = JalaliStr(Date)
    ws.Cells(tgt, 3).Value = px
    If ws.Cells(tgt, 4).Value = "" Then ws.Cells(tgt, 4).Value = px
    If ws.Cells(tgt, 5).Value = "" Then ws.Cells(tgt, 5).Value = px
End Sub


' =====================================================================
'  سهام بورس و فرابورس — از cdn.tsetmc.com
' =====================================================================
Private Const CDN As String = "https://cdn.tsetmc.com/api"

' ستون‌های Data_Input که این ماکرو پر می‌کند (A=1)
'   9 آخرین قیمت      pDrCotVal
'  10 قیمت پایانی     pClosing
'  11 قیمت دیروز      priceYesterday
'  14 اولین قیمت      priceFirst
'  15 بیشترین         priceMax
'  16 کمترین          priceMin
'  17 حجم             qTotTran5J
'  18 ارزش            qTotCap
'  19 تعداد معاملات   zTotTran
'  22..29 حقیقی/حقوقی از ClientType
Private Sub RefreshOneSymbol(ByVal ws As Worksheet, ByVal r As Long, _
                             ByRef nOk As Long, ByRef nFail As Long)
    Dim ins As String, js As String, ct As String
    Dim v As Double

    ins = Trim$(CStr(ws.Cells(r, 3).Value))       ' InsCode
    If Len(ins) < 5 Then Exit Sub

    js = HttpGet(CDN & "/ClosingPrice/GetClosingPriceInfo/" & ins, "https://main.tsetmc.com/")
    If InStr(1, js, "closingPriceInfo", vbTextCompare) = 0 Then
        nFail = nFail + 1
        Exit Sub
    End If

    v = JVal(js, "closingPriceInfo", "pDrCotVal"): If v > 0 Then ws.Cells(r, 9).Value = v
    v = JVal(js, "closingPriceInfo", "pClosing"): If v > 0 Then ws.Cells(r, 10).Value = v
    v = JVal(js, "closingPriceInfo", "priceYesterday"): If v > 0 Then ws.Cells(r, 11).Value = v
    v = JVal(js, "closingPriceInfo", "priceFirst"): If v > 0 Then ws.Cells(r, 14).Value = v
    v = JVal(js, "closingPriceInfo", "priceMax"): If v > 0 Then ws.Cells(r, 15).Value = v
    v = JVal(js, "closingPriceInfo", "priceMin"): If v > 0 Then ws.Cells(r, 16).Value = v
    v = JVal(js, "closingPriceInfo", "qTotTran5J"): If v >= 0 Then ws.Cells(r, 17).Value = v
    v = JVal(js, "closingPriceInfo", "qTotCap"): If v >= 0 Then ws.Cells(r, 18).Value = v
    v = JVal(js, "closingPriceInfo", "zTotTran"): If v >= 0 Then ws.Cells(r, 19).Value = v

    ' --- حقیقی و حقوقی: بدون این، «پول هوشمند» بی‌معناست ---
    ct = HttpGet(CDN & "/ClientType/GetClientType/" & ins & "/1/0", "https://main.tsetmc.com/")
    If InStr(1, ct, "clientType", vbTextCompare) > 0 Then
        v = JVal(ct, "clientType", "buy_I_Volume"): If v >= 0 Then ws.Cells(r, 22).Value = v
        v = JVal(ct, "clientType", "sell_I_Volume"): If v >= 0 Then ws.Cells(r, 23).Value = v
        v = JVal(ct, "clientType", "buy_CountI"): If v >= 0 Then ws.Cells(r, 24).Value = v
        v = JVal(ct, "clientType", "sell_CountI"): If v >= 0 Then ws.Cells(r, 25).Value = v
        v = JVal(ct, "clientType", "buy_N_Volume"): If v >= 0 Then ws.Cells(r, 26).Value = v
        v = JVal(ct, "clientType", "sell_N_Volume"): If v >= 0 Then ws.Cells(r, 27).Value = v
        v = JVal(ct, "clientType", "buy_CountN"): If v >= 0 Then ws.Cells(r, 28).Value = v
        v = JVal(ct, "clientType", "sell_CountN"): If v >= 0 Then ws.Cells(r, 29).Value = v
    End If

    nOk = nOk + 1
End Sub

' برمی‌گرداند: True اگر این فایل شیت سهام دارد
Private Function RefreshStocks(ByRef nOk As Long, ByRef nFail As Long) As Boolean
    Dim ws As Worksheet, r As Long, sym As String
    RefreshStocks = False
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets("Data_Input")
    On Error GoTo 0
    If ws Is Nothing Then Exit Function
    RefreshStocks = True

    For r = 5 To 70
        sym = Trim$(CStr(ws.Cells(r, 1).Value))
        If Len(sym) > 0 Then
            Application.StatusBar = "سهام: " & sym & " ..."
            RefreshOneSymbol ws, r, nOk, nFail
        End If
    Next r

    ' --- شاخص کل و هم‌وزن ---
    RefreshIndex
End Function

Private Sub RefreshIndex()
    Dim ws As Worksheet, js As String, v As Double
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets("Market_Index")
    On Error GoTo 0
    If ws Is Nothing Then Exit Sub

    ' آخرین ردیف دارای تاریخ را پیدا کن و امروز را بنویس/به‌روز کن
    Dim r As Long, last As Long, tgt As Long
    last = 4
    For r = 5 To 3000
        If IsDate(ws.Cells(r, 1).Value) Then last = r
    Next r
    If last < 5 Then Exit Sub
    If Int(CDate(ws.Cells(last, 1).Value)) = Int(Date) Then tgt = last Else tgt = last + 1

    ' ⚠️ پاسخ یک **آرایه** از ده‌ها شاخص است. باید شیءِ حاوی insCode شاخص کل
    ' را جدا کرد، وگرنه عدد اولین شاخص فهرست نوشته می‌شود — که شاخص کل نیست.
    js = HttpGet(CDN & "/Index/GetIndexB1LastAll/SelectedIndexes/1", "https://main.tsetmc.com/")
    v = JValIn(js, "32097828799138957", "indexLastValue")     ' شاخص کل
    If v > 0 Then
        ws.Cells(tgt, 1).Value = Date
        ws.Cells(tgt, 1).NumberFormat = "yyyy-mm-dd"
        ws.Cells(tgt, 2).Value = JalaliStr(Date)
        ws.Cells(tgt, 3).Value = v
        Dim ve As Double
        ve = JValIn(js, "67130298613737946", "indexLastValue")  ' هم‌وزن
        If ve > 0 Then ws.Cells(tgt, 4).Value = ve
    End If
End Sub

' ===================================================== نقطه ورود اصلی
Public Sub RefreshAll()
    Dim tg As String, nb As String
    Dim n As Long, msg As String
    Dim usd As Double, nima As Double, eur As Double, aed As Double
    Dim ons As Double, silver As Double, gram As Double
    Dim coin As Double, half As Double, quarter As Double, usdt As Double

    Dim nS As Long, nSFail As Long, hasStocks As Boolean

    Application.ScreenUpdating = False

    ' اگر این فایل، فایل سهام است، مسیر بورس را برو
    hasStocks = RefreshStocks(nS, nSFail)
    If hasStocks Then
        Application.Calculate
        Application.StatusBar = False
        Application.ScreenUpdating = True
        msg = nS & " نماد به‌روز شد."
        If nSFail > 0 Then msg = msg & vbCrLf & nSFail & " نماد پاسخ نداد."
        If nS = 0 Then
            msg = "هیچ نمادی به‌روز نشد." & vbCrLf & vbCrLf & _
                  "یعنی یا اینترنت وصل نیست، یا دسترسی به cdn.tsetmc.com بسته است." & vbCrLf & _
                  "هیچ عددی تغییر نکرد."
            MsgBox msg, vbExclamation, "به‌روزرسانی ناموفق"
        Else
            MsgBox msg & vbCrLf & vbCrLf & "زمان: " & Format$(Now, "yyyy-mm-dd hh:nn"), _
                   vbInformation, "به‌روزرسانی انجام شد"
        End If
        Exit Sub
    End If

    Application.StatusBar = "در حال دریافت از tgju ..."
    tg = FetchTgju()
    Application.StatusBar = "در حال دریافت از نوبیتکس ..."
    nb = FetchNobitex()

    If Len(tg) = 0 And Len(nb) = 0 Then
        Application.StatusBar = False
        Application.ScreenUpdating = True
        MsgBox "هیچ منبعی پاسخ نداد." & vbCrLf & vbCrLf & _
               "یعنی یا اینترنت وصل نیست، یا دسترسی به tgju و نوبیتکس بسته است." & vbCrLf & _
               "هیچ عددی تغییر نکرد.", vbExclamation, "به‌روزرسانی ناموفق"
        Exit Sub
    End If

    If Len(tg) > 0 Then
        usd = JVal(tg, "price_dollar_rl", "p")
        nima = JVal(tg, "nima_sell_usd", "p")
        eur = JVal(tg, "price_eur", "p")
        aed = JVal(tg, "price_aed", "p")
        ons = JVal(tg, "ons", "p")
        silver = JVal(tg, "silver_999", "p")
        gram = JVal(tg, "geram18", "p")
        coin = JVal(tg, "sekee", "p")
        half = JVal(tg, "nim", "p")
        quarter = JVal(tg, "rob", "p")
    End If
    If Len(nb) > 0 Then usdt = JVal(nb, "usdt-rls", "latest")

    ' --- آزمون سلامت: عدد بی‌معنا اصلاً نوشته نمی‌شود ---
    If usd > 0 And (usd < 100000 Or usd > 50000000) Then usd = -1
    If usdt > 0 And (usdt < 100000 Or usdt > 50000000) Then usdt = -1
    If ons > 0 And (ons < 500 Or ons > 20000) Then ons = -1
    If coin > 0 And (coin < 10000000 Or coin > 100000000000#) Then coin = -1

    ' --- نوشتن. هر نامی که در این فایل نباشد، رد می‌شود ---
    n = 0
    If PutName("GOLD_OZ", ons) Then n = n + 1
    If PutName("FX_GOLD_OZ", ons) Then n = n + 1
    If PutName("SILVER_OZ", silver) Then n = n + 1
    If PutName("USD_FREE", usd) Then n = n + 1
    If PutName("FX_FREE", usd) Then n = n + 1
    If PutName("USD_NIMA", nima) Then n = n + 1
    If PutName("FX_NIMA", nima) Then n = n + 1
    If PutName("FX_USDT", usdt) Then n = n + 1
    If PutName("FX_EUR", eur) Then n = n + 1
    If PutName("FX_AED", aed) Then n = n + 1
    If PutName("COIN_FULL", coin) Then n = n + 1
    If PutName("FX_COIN", coin) Then n = n + 1
    If PutName("COIN_HALF", half) Then n = n + 1
    If PutName("COIN_QTR", quarter) Then n = n + 1
    If PutName("GRAM_18K", gram) Then n = n + 1

    ' --- افزودن ردیف امروز به تاریخچه همین فایل ---
    AppendHistory "Gold_History", coin
    AppendHistory "Hist_Gram18", gram
    AppendHistory "Hist_Ons", ons
    AppendHistory "FX_History", usd
    AppendHistory "Hist_USDT", usdt
    AppendHistory "Hist_Nima", nima

    Application.Calculate
    Application.StatusBar = False
    Application.ScreenUpdating = True

    msg = n & " مقدار به‌روز شد." & vbCrLf & vbCrLf
    If usd > 0 Then msg = msg & "دلار آزاد: " & Format$(usd, "#,##0") & vbCrLf
    If usdt > 0 Then msg = msg & "تتر: " & Format$(usdt, "#,##0") & vbCrLf
    If ons > 0 Then msg = msg & "اونس طلا: " & Format$(ons, "#,##0.0") & vbCrLf
    If coin > 0 Then msg = msg & "سکه تمام: " & Format$(coin, "#,##0") & vbCrLf
    msg = msg & vbCrLf & "زمان: " & Format$(Now, "yyyy-mm-dd hh:nn")
    If Len(tg) = 0 Then msg = msg & vbCrLf & vbCrLf & "⚠ tgju پاسخ نداد."
    If Len(nb) = 0 Then msg = msg & vbCrLf & "⚠ نوبیتکس پاسخ نداد."

    MsgBox msg, vbInformation, "به‌روزرسانی انجام شد"
End Sub

' تاریخچه کامل و تحلیل زمانی — این یکی به پایتون نیاز دارد
Public Sub RefreshFullWithPython()
    MsgBox "برای تاریخچه کامل و تحلیل زمانی:" & vbCrLf & vbCrLf & _
           "۱) این فایل را ببندید" & vbCrLf & _
           "۲) روی Refresh.bat دوبار کلیک کنید" & vbCrLf & _
           "۳) دوباره باز کنید" & vbCrLf & vbCrLf & _
           "دلیل: تحلیل طیفی و ساخت تاریخچه در پایتون است، و پایتون " & _
           "نمی‌تواند فایلی را که در اکسل باز است بنویسد.", _
           vbInformation, "به‌روزرسانی کامل"
End Sub
