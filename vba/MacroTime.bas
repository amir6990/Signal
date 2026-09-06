Attribute VB_Name = "MacroTime"
' =====================================================================
'  به‌روزرسانی و تحلیل زمانیِ متغیرهای کلان — با یک کلیک
'
'  موضوع: شاخص کل، شاخص هم‌وزن، دلار آزاد، دلار نیمایی، تتر، اونس طلا،
'  سکه تمام. نه چرخه یک سهم.
'
'  منابع (همه تأییدشده از کد عمومی کارکرده):
'    شاخص‌ها   cdn.tsetmc.com/api/Index/GetIndexB2History/{insCode}
'              → {"indexB2":[{"dEven":yyyymmdd,"xNivInuClMresIbs":مقدار}]}
'    دلار/طلا  api.tgju.org/v1/market/indicator/summary-table-data/{نماد}
'              → {"data":[[باز,کمترین,بیشترین,بسته,...,شمسی,میلادی]]}
'    تتر       apiv2.nobitex.ir/market/udf/history  (آرایه‌های موازی)
'
'  نقطه ورود:  RefreshMacro
' =====================================================================
Option Explicit

Private Const IDX_TOTAL As String = "32097828799138957"   ' شاخص کل
Private Const IDX_EQW As String = "67130298613737946"     ' شاخص هم‌وزن
Private Const MAXN As Long = 3000

' ستون‌های Macro_Series: A تاریخ، B شمسی، C..I هفت سری
Private Const COL_FIRST As Long = 3

Private Function HttpG(ByVal url As String, ByVal ref As String) As String
    Dim h As Object
    On Error GoTo Fail
    Set h = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    h.setTimeouts 8000, 8000, 20000, 45000
    h.Open "GET", url, False
    h.setRequestHeader "User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " & _
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    h.setRequestHeader "Accept", "application/json, text/plain, */*"
    If Len(ref) > 0 Then h.setRequestHeader "Referer", ref
    h.send
    If h.Status = 200 Then HttpG = h.responseText Else HttpG = ""
    Exit Function
Fail:
    HttpG = ""
End Function

Private Function Num(ByVal s As String) As Double
    Dim i As Long, ch As String, o As String, c As Long
    For i = 1 To Len(s)
        ch = Mid$(s, i, 1)
        c = AscW(ch)
        If c >= &H6F0 And c <= &H6F9 Then
            o = o & CStr(c - &H6F0)
        ElseIf c >= &H660 And c <= &H669 Then
            o = o & CStr(c - &H660)
        ElseIf InStr("0123456789.-", ch) > 0 Then
            o = o & ch
        End If
    Next i
    If Len(o) = 0 Or o = "-" Or o = "." Then
        Num = -1
    Else
        On Error Resume Next
        Num = CDbl(o)
        If Err.Number <> 0 Then Num = -1
    End If
End Function

Private Function KeyNum(ByVal js As String, ByVal key As String) As Double
    Dim q As Long, e As Long
    KeyNum = -1
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
    If e > q Then KeyNum = Num(Mid$(js, q, e - q))
End Function

Private Function Ymd(ByVal v As Double) As Double
    Dim y As Long, m As Long, d As Long
    Ymd = 0
    If v < 19000000 Or v > 21000000 Then Exit Function
    y = Int(v / 10000)
    m = Int((v - y * 10000) / 100)
    d = v - Int(v / 100) * 100
    If m < 1 Or m > 12 Or d < 1 Or d > 31 Then Exit Function
    Ymd = DateSerial(y, m, d)
End Function

' --------------------------------------- شاخص از tsetmc (آرایه اشیاء)
Private Function FetchIndex(ByVal ins As String, ByRef dt() As Double, _
                            ByRef vl() As Double) As Long
    Dim js As String, i As Long, s0 As Long, dep As Long, n As Long
    Dim obj As String, dE As Double, cv As Double, dd As Double
    FetchIndex = 0
    js = HttpG("https://cdn.tsetmc.com/api/Index/GetIndexB2History/" & ins, _
               "https://main.tsetmc.com/")
    If InStr(1, js, "indexB2", vbTextCompare) = 0 Then Exit Function
    ReDim dt(0 To MAXN - 1)
    ReDim vl(0 To MAXN - 1)
    i = InStr(1, js, "[")
    If i = 0 Then Exit Function
    Do While i <= Len(js) And n < MAXN
        If Mid$(js, i, 1) = "{" Then
            s0 = i
            dep = 0
            Do While i <= Len(js)
                If Mid$(js, i, 1) = "{" Then dep = dep + 1
                If Mid$(js, i, 1) = "}" Then
                    dep = dep - 1
                    If dep = 0 Then Exit Do
                End If
                i = i + 1
            Loop
            obj = Mid$(js, s0, i - s0 + 1)
            dE = KeyNum(obj, "dEven")
            cv = KeyNum(obj, "xNivInuClMresIbs")
            dd = Ymd(dE)
            If dd > 0 And cv > 0 Then
                dt(n) = dd
                vl(n) = cv
                n = n + 1
            End If
        End If
        i = i + 1
    Loop
    SortPairs dt, vl, n
    FetchIndex = n
End Function

' ------------------------------ tgju: {"data":[[..,بسته,..,میلادی]]}
' ستون ۳ (صفرمبنا) بسته و ستون ۷ تاریخ میلادی است.
Private Function FetchTgjuHist(ByVal sym As String, ByRef dt() As Double, _
                               ByRef vl() As Double) As Long
    Dim js As String, i As Long, n As Long, s0 As Long, dep As Long
    Dim row As String, parts() As String, k As Long
    Dim cv As Double, dd As Double, raw As String
    FetchTgjuHist = 0
    js = HttpG("https://api.tgju.org/v1/market/indicator/summary-table-data/" & sym, _
               "https://www.tgju.org/")
    If InStr(1, js, """data""", vbTextCompare) = 0 Then
        js = HttpG("https://api.accessban.com/v1/market/indicator/" & _
                   "summary-table-data/" & sym, "https://www.tgju.org/")
        If InStr(1, js, """data""", vbTextCompare) = 0 Then Exit Function
    End If
    ReDim dt(0 To MAXN - 1)
    ReDim vl(0 To MAXN - 1)
    i = InStr(1, js, """data""")
    i = InStr(i, js, "[")
    If i = 0 Then Exit Function
    i = i + 1
    Do While i <= Len(js) And n < MAXN
        If Mid$(js, i, 1) = "[" Then
            s0 = i
            dep = 0
            Do While i <= Len(js)
                If Mid$(js, i, 1) = "[" Then dep = dep + 1
                If Mid$(js, i, 1) = "]" Then
                    dep = dep - 1
                    If dep = 0 Then Exit Do
                End If
                i = i + 1
            Loop
            row = Mid$(js, s0 + 1, i - s0 - 1)
            parts = SplitTop(row)
            If UBound(parts) >= 7 Then
                cv = Num(StripTags(parts(3)))
                raw = Trim$(StripTags(parts(7)))
                dd = ParseYmdText(raw)
                If cv > 0 And dd > 0 Then
                    dt(n) = dd
                    vl(n) = cv
                    n = n + 1
                End If
            End If
        ElseIf Mid$(js, i, 1) = "]" Then
            Exit Do
        End If
        i = i + 1
    Loop
    SortPairs dt, vl, n
    FetchTgjuHist = n
End Function

' جداکردن عناصر یک ردیف JSON با احترام به گیومه
Private Function SplitTop(ByVal s As String) As String()
    Dim out(0 To 15) As String, i As Long, n As Long
    Dim inq As Boolean, ch As String, buf As String
    For i = 1 To Len(s)
        ch = Mid$(s, i, 1)
        If ch = """" Then
            inq = Not inq
        ElseIf ch = "," And Not inq Then
            If n <= 15 Then out(n) = buf
            n = n + 1
            buf = ""
        Else
            buf = buf & ch
        End If
    Next i
    If n <= 15 Then out(n) = buf
    SplitTop = out
End Function

Private Function StripTags(ByVal s As String) As String
    Dim i As Long, ch As String, o As String, inTag As Boolean
    For i = 1 To Len(s)
        ch = Mid$(s, i, 1)
        If ch = "<" Then
            inTag = True
        ElseIf ch = ">" Then
            inTag = False
        ElseIf Not inTag Then
            o = o & ch
        End If
    Next i
    StripTags = o
End Function

' "2026/09/06" یا "2026-09-06"
Private Function ParseYmdText(ByVal s As String) As Double
    Dim p() As String, t As String
    ParseYmdText = 0
    t = Replace(Replace(Trim$(s), "-", "/"), " ", "")
    p = Split(t, "/")
    If UBound(p) <> 2 Then Exit Function
    On Error Resume Next
    ParseYmdText = DateSerial(CLng(p(0)), CLng(p(1)), CLng(p(2)))
    If Err.Number <> 0 Then ParseYmdText = 0
End Function

' ------------------------------ نوبیتکس UDF: آرایه‌های موازی t و c
Private Function FetchUsdt(ByRef dt() As Double, ByRef vl() As Double) As Long
    Dim js As String, tArr As String, cArr As String
    Dim tp() As String, cp() As String, i As Long, n As Long
    Dim toTs As Double, frTs As Double
    FetchUsdt = 0
    toTs = (Now - DateSerial(1970, 1, 1)) * 86400#
    frTs = toTs - 1200# * 86400#
    js = HttpG("https://apiv2.nobitex.ir/market/udf/history?symbol=USDTIRT" & _
               "&resolution=D&from=" & CLng(frTs) & "&to=" & CLng(toTs), "")
    If InStr(1, js, """s""", vbTextCompare) = 0 Then Exit Function
    tArr = ArrayOf(js, "t")
    cArr = ArrayOf(js, "c")
    If Len(tArr) = 0 Or Len(cArr) = 0 Then Exit Function
    tp = Split(tArr, ",")
    cp = Split(cArr, ",")
    ReDim dt(0 To MAXN - 1)
    ReDim vl(0 To MAXN - 1)
    Dim ts As Double, cv As Double
    For i = 0 To UBound(tp)
        If i > UBound(cp) Or n >= MAXN Then Exit For
        ts = Num(tp(i))
        cv = Num(cp(i))
        If ts > 0 And cv > 0 Then
            ' ⚠️ نماد IRT در این endpoint **تومان** است، نه ریال. ×۱۰.
            dt(n) = DateSerial(1970, 1, 1) + Int(ts / 86400#)
            vl(n) = cv * 10#
            n = n + 1
        End If
    Next i
    SortPairs dt, vl, n
    FetchUsdt = n
End Function

Private Function ArrayOf(ByVal js As String, ByVal key As String) As String
    Dim q As Long, e As Long
    ArrayOf = ""
    q = InStr(1, js, """" & key & """")
    If q = 0 Then Exit Function
    q = InStr(q, js, "[")
    If q = 0 Then Exit Function
    e = InStr(q, js, "]")
    If e <= q Then Exit Function
    ArrayOf = Mid$(js, q + 1, e - q - 1)
End Function

Private Sub SortPairs(ByRef d() As Double, ByRef v() As Double, ByVal n As Long)
    Dim i As Long, j As Long, td As Double, tv As Double
    For i = 1 To n - 1
        td = d(i): tv = v(i)
        j = i - 1
        Do While j >= 0
            If d(j) <= td Then Exit Do
            d(j + 1) = d(j): v(j + 1) = v(j)
            j = j - 1
        Loop
        d(j + 1) = td: v(j + 1) = tv
    Next i
End Sub

' ===================================================== نقطه ورود دکمه
Public Sub RefreshMacro()
    Dim ws As Worksheet, wc As Worksheet
    Dim allD() As Double, nAll As Long
    Dim d1() As Double, v1() As Double
    Dim series(1 To 7) As String, k As Long, n As Long
    Dim got(1 To 7) As Long
    Dim msg As String, r As Long, i As Long

    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets("Macro_Series")
    Set wc = ThisWorkbook.Worksheets("Macro_Cycles")
    On Error GoTo 0
    If ws Is Nothing Then
        MsgBox "شیت Macro_Series در این فایل نیست.", vbExclamation
        Exit Sub
    End If

    Application.ScreenUpdating = False
    ws.Range("A5:I" & (4 + 900)).ClearContents

    ' یک محور تاریخ مشترک از شاخص کل ساخته می‌شود و بقیه روی آن نشانده
    ' می‌شوند. بدون محور مشترک، «تأخیر ۳ روزه» می‌تواند فقط اثر تعطیلی
    ' نامتقارن دو بازار باشد، نه رابطه اقتصادی.
    Application.StatusBar = "شاخص کل ..."
    nAll = FetchIndex(IDX_TOTAL, d1, v1)
    If nAll = 0 Then
        Application.ScreenUpdating = True
        Application.StatusBar = False
        MsgBox "شاخص کل دریافت نشد. اینترنت یا دسترسی به cdn.tsetmc.com را " & _
               "بررسی کنید. هیچ عددی تغییر نکرد.", vbExclamation
        Exit Sub
    End If
    If nAll > 900 Then
        ' فقط ۹۰۰ ردیف آخر — ظرفیت شیت
        For i = 0 To 899
            d1(i) = d1(nAll - 900 + i)
            v1(i) = v1(nAll - 900 + i)
        Next i
        nAll = 900
    End If
    ReDim allD(0 To nAll - 1)
    For i = 0 To nAll - 1
        allD(i) = d1(i)
        ws.Cells(5 + i, 1).Value = d1(i)
        ws.Cells(5 + i, 1).NumberFormat = "yyyy-mm-dd"
        ws.Cells(5 + i, 2).Value = TimeCycles.JalaliStr(CDate(d1(i)))
        ws.Cells(5 + i, COL_FIRST).Value = v1(i)
    Next i
    got(1) = nAll

    ' بقیه سری‌ها روی همان محور
    For k = 2 To 7
        Application.StatusBar = "سری " & k & " از ۷ ..."
        n = 0
        Select Case k
            Case 2: n = FetchIndex(IDX_EQW, d1, v1)
            Case 3: n = FetchTgjuHist("price_dollar_rl", d1, v1)
            Case 4: n = FetchTgjuHist("nima_sell_usd", d1, v1)
            Case 5: n = FetchUsdt(d1, v1)
            Case 6: n = FetchTgjuHist("ons", d1, v1)
            Case 7: n = FetchTgjuHist("sekee", d1, v1)
        End Select
        got(k) = n
        If n > 0 Then PlaceOnAxis allD, nAll, d1, v1, n, ws, COL_FIRST + k - 1
    Next k

    ' --- چرخه هر سری کلان ---
    If Not wc Is Nothing Then
        Dim col() As Double, m As Long, per As Double, ratio As Double
        Dim lowD As Double, highD As Double, ax() As Double
        For k = 1 To 7
            Application.StatusBar = "چرخه سری " & k & " ..."
            ReDim col(0 To nAll - 1)
            ReDim ax(0 To nAll - 1)
            m = 0
            For i = 0 To nAll - 1
                If IsNumeric(ws.Cells(5 + i, COL_FIRST + k - 1).Value) Then
                    If ws.Cells(5 + i, COL_FIRST + k - 1).Value > 0 Then
                        col(m) = ws.Cells(5 + i, COL_FIRST + k - 1).Value
                        ax(m) = allD(i)
                        m = m + 1
                    End If
                End If
            Next i
            r = 4 + k
            If m >= 60 Then
                per = TimeCycles.DominantCycle(col, m, ratio)
                If per > 0 Then
                    wc.Cells(r, 2).Value = CLng(per)
                    wc.Cells(r, 3).Value = ratio
                    wc.Cells(r, 4).Value = Int(m / CLng(per))
                    TimeCycles.LastPivots col, ax, m, CLng(per / 4), lowD, highD
                    If lowD > 0 Then wc.Cells(r, 5).Value = lowD
                    If highD > 0 Then wc.Cells(r, 6).Value = highD
                    wc.Cells(r, 10).Value = "چرخه معنادار"
                Else
                    wc.Cells(r, 2).ClearContents
                    wc.Cells(r, 3).ClearContents
                    wc.Cells(r, 4).ClearContents
                    wc.Cells(r, 5).ClearContents
                    wc.Cells(r, 6).ClearContents
                    wc.Cells(r, 10).Value = "چرخه معناداری پیدا نشد"
                End If
            Else
                wc.Cells(r, 10).Value = "داده کافی نیست (" & m & " روز)"
            End If
        Next k
    End If

    Application.Calculate
    Application.StatusBar = False
    Application.ScreenUpdating = True

    msg = "محور تاریخ: " & nAll & " روز" & vbCrLf & vbCrLf
    Dim nm As Variant
    nm = Array("شاخص کل", "شاخص هم‌وزن", "دلار آزاد", "دلار نیمایی", _
               "تتر", "اونس طلا", "سکه تمام")
    For k = 1 To 7
        msg = msg & nm(k - 1) & ": " & IIf(got(k) > 0, got(k) & " روز", "دریافت نشد") & vbCrLf
    Next k
    msg = msg & vbCrLf & "شیت Real_Index خودش حساب شد." & vbCrLf & _
          "برای پانل هم‌انباشتگی و پیشرو/پیرو:" & vbCrLf & _
          "python -m timeframe macro-panel"
    MsgBox msg, vbInformation, "به‌روزرسانی کلان"
End Sub

' نشاندن یک سری روی محور تاریخ مشترک (آخرین مقدار در آن روز یا قبل‌تر)
Private Sub PlaceOnAxis(ByRef axis() As Double, ByVal nA As Long, _
                        ByRef d() As Double, ByRef v() As Double, ByVal n As Long, _
                        ByVal ws As Worksheet, ByVal col As Long)
    Dim i As Long, j As Long
    j = 0
    For i = 0 To nA - 1
        Do While j + 1 < n And d(j + 1) <= axis(i)
            j = j + 1
        Loop
        If d(j) <= axis(i) Then ws.Cells(5 + i, col).Value = v(j)
    Next i
End Sub
