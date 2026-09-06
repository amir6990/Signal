Attribute VB_Name = "TimeCycles"
' =====================================================================
'  تحلیل ابعاد زمانی — داخل اکسل، بدون پایتون
'
'  همان الگوریتمی که در src/timeframe/spectral.py است، خط به خط:
'    ۱. حذف روند خطی  (بدون آن، روند در طیف یک چرخه بلندِ جعلی می‌سازد)
'    ۲. طیف دامنه با Goertzel روی شبکه لگاریتمی دوره
'    ۳. آزمون پایداری فاز رایلی روی قطعات متوالی
'    ۴. تصحیح Šidák بابت تعداد فرکانس‌های **مستقل** (نه تعداد نقاط شبکه)
'    ۵. آزمون نسبت دامنه قله به میانه طیف
'
'  گام ۴ اختیاری نیست. بدون آن، انتخاب بلندترین قله از میان صدها کاندید و
'  آزمودنش در سطح ۵٪، روی نویز خالص هم «چرخه معنادار» تولید می‌کند.
'
'  نقطه ورود:  RefreshTimeCycles
' =====================================================================
Option Explicit

Private Const MIN_PERIOD As Double = 8#
Private Const MAX_PERIOD_RATIO As Double = 0.34
Private Const MAX_PERIOD_CAP As Double = 400#
Private Const ALPHA As Double = 0.05
Private Const MIN_SEGMENTS As Long = 3
Private Const PEAK_SEP As Double = 0.15
Private Const MIN_AMP_RATIO As Double = 3#
Private Const PI As Double = 3.14159265358979

' ------------------------------------------------------- حذف روند خطی
Private Sub Detrend(ByRef y() As Double)
    Dim n As Long, i As Long
    Dim sx As Double, sxx As Double, sy As Double, sxy As Double
    Dim den As Double, slope As Double, intercept As Double
    n = UBound(y) - LBound(y) + 1
    If n < 3 Then Exit Sub
    sx = n * (n - 1) / 2#
    sxx = (n - 1) * CDbl(n) * (2 * CDbl(n) - 1) / 6#
    For i = 0 To n - 1
        sy = sy + y(i)
        sxy = sxy + i * y(i)
    Next i
    den = n * sxx - sx * sx
    If den = 0 Then Exit Sub
    slope = (n * sxy - sx * sy) / den
    intercept = (sy - slope * sx) / n
    For i = 0 To n - 1
        y(i) = y(i) - (slope * i + intercept)
    Next i
End Sub

' ------------------------------------------------------------ Goertzel
' دامنه مؤلفه با دوره داده‌شده. re و im برای آزمون فاز برمی‌گردند.
Private Function Goertzel(ByRef y() As Double, ByVal lo As Long, ByVal hi As Long, _
                          ByVal period As Double, ByRef re As Double, _
                          ByRef im As Double) As Double
    Dim n As Long, i As Long, w As Double, cw As Double, sw As Double
    Dim coeff As Double, s0 As Double, s1 As Double, s2 As Double
    Goertzel = 0: re = 0: im = 0
    n = hi - lo + 1
    If n < 2 Or period < 2 Then Exit Function
    w = 2# * PI / period
    cw = Cos(w): sw = Sin(w)
    coeff = 2# * cw
    s1 = 0: s2 = 0
    For i = lo To hi
        s0 = y(i) + coeff * s1 - s2
        s2 = s1
        s1 = s0
    Next i
    re = s1 - s2 * cw
    im = s2 * sw
    Goertzel = 2# * Sqr(re * re + im * im) / n
End Function

' ------------------------------------------------- آزمون رایلی روی فاز
' اگر چرخه واقعی باشد فازش در تکرارها ثابت می‌ماند و بردارهای واحد
' هم‌جهت جمع می‌شوند. اگر آرتیفکت نویز باشد، برآیند کوچک می‌ماند.
Private Function RayleighP(ByRef rx() As Double, ByRef ry() As Double, _
                           ByVal k As Long) As Double
    Dim i As Long, m As Double, sx As Double, sy As Double
    Dim cnt As Long, rbar As Double, z As Double, p As Double
    RayleighP = 1#
    If k < 2 Then Exit Function
    For i = 0 To k - 1
        m = Sqr(rx(i) * rx(i) + ry(i) * ry(i))
        If m > 0 Then
            sx = sx + rx(i) / m
            sy = sy + ry(i) / m
            cnt = cnt + 1
        End If
    Next i
    If cnt < 2 Then Exit Function
    rbar = Sqr(sx * sx + sy * sy) / cnt
    z = cnt * rbar * rbar
    p = Exp(-z) * (1 + (2 * z - z * z) / (4 * cnt) _
        - (24 * z - 132 * z ^ 2 + 76 * z ^ 3 - 9 * z ^ 4) / (288 * CDbl(cnt) * cnt))
    If p > 1 Then p = 1
    If p < 0 Then p = 0
    RayleighP = p
End Function

Private Function PhaseStability(ByRef y() As Double, ByVal n As Long, _
                                ByVal period As Double, ByRef k As Long) As Double
    Dim segLen As Long, j As Long, lo As Long, hi As Long
    Dim re As Double, im As Double
    Dim rx() As Double, ry() As Double
    PhaseStability = 1#
    segLen = CLng(period)
    If segLen < 2 Then
        k = 0
        Exit Function
    End If
    k = n \ segLen
    If k < MIN_SEGMENTS Then Exit Function
    ReDim rx(0 To k - 1)
    ReDim ry(0 To k - 1)
    For j = 0 To k - 1
        hi = n - 1 - j * segLen
        lo = hi - segLen + 1
        If lo < 0 Then lo = 0
        Goertzel y, lo, hi, period, re, im
        rx(j) = re
        ry(j) = im
    Next j
    PhaseStability = RayleighP(rx, ry, k)
End Function

' تعداد بین‌های فوریه در بازه — مبنای تصحیح چندگانگی.
' شبکه ما ریزتر است ولی آزمون‌های مجاور همبسته‌اند؛ تعداد آزمون واقعاً
' مستقل همین است، نه تعداد نقاط شبکه.
Private Function IndepFreqs(ByVal n As Long, ByVal pMin As Double, _
                            ByVal pMax As Double) As Long
    Dim v As Long
    If pMin <= 0 Or pMax <= pMin Then
        IndepFreqs = 1
        Exit Function
    End If
    v = CLng(n / (2# * pMin) - n / (2# * pMax))
    If v < 1 Then v = 1
    IndepFreqs = v
End Function

' ============================================ چرخه غالبِ از آزمون گذشته
' خروجی: طول چرخه (روز معاملاتی) یا ۰ اگر هیچ چرخه‌ای معنادار نبود.
' برگرداندن ۰ یک نتیجه است، نه خرابی: «چرخه‌ای پیدا نشد» اطلاعات است.
Public Function DominantCycle(ByRef closes() As Double, ByVal n As Long, _
                              ByRef outAmpRatio As Double) As Double
    Dim y() As Double, i As Long, j As Long
    Dim maxP As Double, p As Double, stp As Double
    Dim nGrid As Long, per() As Double, amp() As Double
    Dim re As Double, im As Double
    Dim medAmp As Double, tmp() As Double
    Dim nTests As Long, alphaAdj As Double
    Dim pv As Double, k As Long
    Dim bestP As Double, bestAmp As Double
    Dim tooClose As Boolean

    DominantCycle = 0
    outAmpRatio = 0
    If n < 40 Then Exit Function

    ReDim y(0 To n - 1)
    For i = 0 To n - 1
        y(i) = closes(i)
    Next i
    Detrend y

    maxP = n * MAX_PERIOD_RATIO
    If maxP > MAX_PERIOD_CAP Then maxP = MAX_PERIOD_CAP
    If maxP <= MIN_PERIOD Then Exit Function

    ' --- شبکه لگاریتمی: دقت یکنواخت در همه مقیاس‌ها ---
    nGrid = 0
    p = MIN_PERIOD
    Do While p <= maxP
        nGrid = nGrid + 1
        stp = p * 0.01
        If stp < 0.5 Then stp = 0.5
        p = p + stp
    Loop
    If nGrid < 3 Then Exit Function

    ReDim per(0 To nGrid - 1)
    ReDim amp(0 To nGrid - 1)
    j = 0
    p = MIN_PERIOD
    Do While p <= maxP And j <= nGrid - 1
        per(j) = p
        amp(j) = Goertzel(y, 0, n - 1, p, re, im)
        j = j + 1
        stp = p * 0.01
        If stp < 0.5 Then stp = 0.5
        p = p + stp
    Loop
    nGrid = j

    ' --- میانه دامنه = زمینه طیف ---
    ReDim tmp(0 To nGrid - 1)
    For i = 0 To nGrid - 1
        tmp(i) = amp(i)
    Next i
    SortAsc tmp, nGrid
    medAmp = tmp(nGrid \ 2)
    If medAmp <= 0 Then medAmp = 0.000000000001

    nTests = IndepFreqs(n, MIN_PERIOD, maxP)
    alphaAdj = 1# - (1# - ALPHA) ^ (1# / nTests)

    ' --- قله‌ها به ترتیب دامنه، با حداقل فاصله نسبی ---
    Dim ordIdx() As Long
    ReDim ordIdx(0 To nGrid - 1)
    Dim nPeak As Long
    nPeak = 0
    For i = 1 To nGrid - 2
        If amp(i) >= amp(i - 1) And amp(i) >= amp(i + 1) Then
            ordIdx(nPeak) = i
            nPeak = nPeak + 1
        End If
    Next i
    If nPeak = 0 Then Exit Function
    SortIdxDesc ordIdx, amp, nPeak

    Dim chosenP(0 To 19) As Double
    Dim nChosen As Long
    nChosen = 0
    For i = 0 To nPeak - 1
        p = per(ordIdx(i))
        tooClose = False
        For j = 0 To nChosen - 1
            If Abs(p - chosenP(j)) / chosenP(j) < PEAK_SEP Then tooClose = True
        Next j
        If Not tooClose Then
            chosenP(nChosen) = p
            nChosen = nChosen + 1
            If nChosen >= 15 Then Exit For
        End If
    Next i

    ' --- دو گذرگاه معناداری ---
    Dim a As Double
    For i = 0 To nChosen - 1
        p = chosenP(i)
        a = Goertzel(y, 0, n - 1, p, re, im)
        If a / medAmp >= MIN_AMP_RATIO Then
            pv = PhaseStability(y, n, p, k)
            If pv <= alphaAdj Then
                If a > bestAmp Then
                    bestAmp = a
                    bestP = p
                End If
            End If
        End If
    Next i

    If bestP > 0 Then
        DominantCycle = bestP
        outAmpRatio = bestAmp / medAmp
    End If
End Function

Private Sub SortAsc(ByRef a() As Double, ByVal n As Long)
    Dim i As Long, j As Long, t As Double
    For i = 1 To n - 1
        t = a(i)
        j = i - 1
        Do While j >= 0
            If a(j) <= t Then Exit Do
            a(j + 1) = a(j)
            j = j - 1
        Loop
        a(j + 1) = t
    Next i
End Sub

Private Sub SortIdxDesc(ByRef idx() As Long, ByRef key() As Double, ByVal n As Long)
    Dim i As Long, j As Long, t As Long
    For i = 1 To n - 1
        t = idx(i)
        j = i - 1
        Do While j >= 0
            If key(idx(j)) >= key(t) Then Exit Do
            idx(j + 1) = idx(j)
            j = j - 1
        Loop
        idx(j + 1) = t
    Next i
End Sub

' ------------------------------------- آخرین کف و سقف نوسانی (fractal)
Public Sub LastPivots(ByRef closes() As Double, ByRef dates() As Double, _
                      ByVal n As Long, ByVal halfWin As Long, _
                      ByRef lowDate As Double, ByRef highDate As Double)
    Dim i As Long, j As Long
    Dim isLow As Boolean, isHigh As Boolean
    lowDate = 0: highDate = 0
    If halfWin < 2 Then halfWin = 2
    For i = n - 1 - halfWin To halfWin Step -1
        If lowDate > 0 And highDate > 0 Then Exit For
        isLow = True: isHigh = True
        For j = i - halfWin To i + halfWin
            If j <> i Then
                If closes(j) < closes(i) Then isLow = False
                If closes(j) > closes(i) Then isHigh = False
            End If
        Next j
        If isLow And lowDate = 0 Then lowDate = dates(i)
        If isHigh And highDate = 0 Then highDate = dates(i)
    Next i
End Sub

' ================================================ دریافت تاریخچه روزانه
' cdn.tsetmc.com/api/ClosingPrice/GetClosingPriceDailyList/{insCode}/0
' پاسخ: {"closingPriceDaily":[{...,"dEven":20260906,"pClosing":8338},...]}
' خروجی: تعداد ردیف؛ آرایه‌ها به ترتیب صعودی تاریخ پر می‌شوند.
Public Function FetchDaily(ByVal insCode As String, ByRef dts() As Double, _
                           ByRef cls() As Double) As Long
    Dim js As String, pos As Long, depth As Long, i As Long
    Dim s0 As Long, obj As String
    Dim n As Long, cap As Long
    Dim dE As Double, pc As Double

    FetchDaily = 0
    js = HttpGetTC("https://cdn.tsetmc.com/api/ClosingPrice/" & _
                   "GetClosingPriceDailyList/" & insCode & "/0")
    If InStr(1, js, "closingPriceDaily", vbTextCompare) = 0 Then Exit Function

    cap = 4000
    ReDim dts(0 To cap - 1)
    ReDim cls(0 To cap - 1)
    n = 0

    ' پیمایش اعضای آرایه: هر { ... } در عمق ۱
    pos = InStr(1, js, "[")
    If pos = 0 Then Exit Function
    i = pos
    Do While i <= Len(js) And n < cap
        If Mid$(js, i, 1) = "{" Then
            s0 = i
            depth = 0
            Do While i <= Len(js)
                If Mid$(js, i, 1) = "{" Then depth = depth + 1
                If Mid$(js, i, 1) = "}" Then
                    depth = depth - 1
                    If depth = 0 Then Exit Do
                End If
                i = i + 1
            Loop
            obj = Mid$(js, s0, i - s0 + 1)
            dE = JValTC(obj, "dEven")
            pc = JValTC(obj, "pClosing")
            If dE > 19000000 And pc > 0 Then
                dts(n) = DateSerial(Int(dE / 10000), _
                                    Int((dE - Int(dE / 10000) * 10000) / 100), _
                                    dE - Int(dE / 100) * 100)
                cls(n) = pc
                n = n + 1
            End If
        End If
        i = i + 1
    Loop
    If n = 0 Then Exit Function

    ' مرتب‌سازی صعودی بر اساس تاریخ — ترتیب پاسخ تضمین‌شده نیست
    Dim j As Long, td As Double, tc As Double
    For i = 1 To n - 1
        td = dts(i): tc = cls(i)
        j = i - 1
        Do While j >= 0
            If dts(j) <= td Then Exit Do
            dts(j + 1) = dts(j): cls(j + 1) = cls(j)
            j = j - 1
        Loop
        dts(j + 1) = td: cls(j + 1) = tc
    Next i
    FetchDaily = n
End Function

Private Function HttpGetTC(ByVal url As String) As String
    Dim h As Object
    On Error GoTo Fail
    Set h = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    h.setTimeouts 8000, 8000, 20000, 40000
    h.Open "GET", url, False
    h.setRequestHeader "User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " & _
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    h.setRequestHeader "Referer", "https://main.tsetmc.com/"
    h.send
    If h.Status = 200 Then HttpGetTC = h.responseText Else HttpGetTC = ""
    Exit Function
Fail:
    HttpGetTC = ""
End Function

' استخراج عدد یک کلید از یک شیء کوچک
Private Function JValTC(ByVal js As String, ByVal key As String) As Double
    Dim q As Long, e As Long, raw As String
    JValTC = -1
    q = InStr(1, js, """" & key & """", vbTextCompare)
    If q = 0 Then Exit Function
    q = InStr(q, js, ":")
    If q = 0 Then Exit Function
    q = q + 1
    Do While q <= Len(js) And Mid$(js, q, 1) = " "
        q = q + 1
    Loop
    If Mid$(js, q, 1) = """" Then
        q = q + 1
        e = InStr(q, js, """")
    Else
        e = q
        Do While e <= Len(js) And InStr("0123456789.-", Mid$(js, e, 1)) > 0
            e = e + 1
        Loop
    End If
    If e <= q Then Exit Function
    raw = Mid$(js, q, e - q)
    On Error Resume Next
    JValTC = CDbl(raw)
    If Err.Number <> 0 Then JValTC = -1
End Function

' ===================================================== نقطه ورود دکمه
Public Sub RefreshTimeCycles()
    Dim wsT As Worksheet, wsW As Worksheet
    Dim r As Long, row As Long, nSym As Long, nFound As Long, nNone As Long
    Dim sym As String, ins As String
    Dim dts() As Double, cls() As Double, n As Long
    Dim per As Double, ratio As Double
    Dim lowD As Double, highD As Double, msg As String

    On Error Resume Next
    Set wsT = ThisWorkbook.Worksheets("Time_Cycles")
    Set wsW = ThisWorkbook.Worksheets("Watchlist")
    On Error GoTo 0
    If wsT Is Nothing Then
        MsgBox "شیت Time_Cycles در این فایل نیست.", vbExclamation
        Exit Sub
    End If

    Application.ScreenUpdating = False
    row = 5

    For r = 5 To 70
        sym = "" : ins = ""
        If Not wsW Is Nothing Then
            sym = Trim$(CStr(wsW.Cells(r, 1).Value))
            ins = Trim$(CStr(wsW.Cells(r, 3).Value))
        Else
            ' فایل زمانی مستقل: نماد و InsCode را از خود شیت بخوان
            sym = Trim$(CStr(wsT.Cells(r, 1).Value))
            ins = Trim$(CStr(wsT.Cells(r, 26).Value))   ' ستون Z
        End If
        If Len(sym) = 0 Or Len(ins) < 5 Then GoTo NextSym

        nSym = nSym + 1
        Application.StatusBar = "تحلیل چرخه: " & sym & " ..."
        n = FetchDaily(ins, dts, cls)
        If n < 60 Then
            nNone = nNone + 1
            GoTo NextSym
        End If

        per = DominantCycle(cls, n, ratio)
        wsT.Cells(row, 1).Value = sym
        wsT.Cells(row, 5).Value = dts(n - 1)
        wsT.Cells(row, 5).NumberFormat = "yyyy-mm-dd"

        If per > 0 Then
            wsT.Cells(row, 4).Value = CLng(per)
            LastPivots cls, dts, n, CLng(per / 4), lowD, highD
            If lowD > 0 Then
                wsT.Cells(row, 2).Value = lowD
                wsT.Cells(row, 2).NumberFormat = "yyyy-mm-dd"
            End If
            If highD > 0 Then
                wsT.Cells(row, 3).Value = highD
                wsT.Cells(row, 3).NumberFormat = "yyyy-mm-dd"
            End If
            nFound = nFound + 1
        Else
            ' چرخه معناداری نبود — ستون‌ها پاک می‌شوند تا عدد کهنه نماند
            wsT.Cells(row, 2).ClearContents
            wsT.Cells(row, 3).ClearContents
            wsT.Cells(row, 4).ClearContents
            nNone = nNone + 1
        End If
        row = row + 1
NextSym:
    Next r

    Application.Calculate
    Application.StatusBar = False
    Application.ScreenUpdating = True

    msg = nSym & " نماد بررسی شد." & vbCrLf & vbCrLf & _
          "چرخه معنادار پیدا شد: " & nFound & vbCrLf & _
          "چرخه معناداری نبود: " & nNone & vbCrLf & vbCrLf & _
          "«پیدا نشد» خرابی نیست — یعنی آزمون معناداری رد شده." & vbCrLf & _
          "آشکارسازی که همیشه چرخه می‌بیند، بی‌فایده است."
    If nSym = 0 Then
        msg = "هیچ نمادی با InsCode پیدا نشد." & vbCrLf & _
              "نماد و کد را در شیت Watchlist (یا ستون Z همین شیت) بگذارید."
    End If
    MsgBox msg, vbInformation, "تحلیل زمانی"
End Sub
