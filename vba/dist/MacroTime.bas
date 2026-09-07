Attribute VB_Name = "MacroTime"
' =====================================================================
'
'
'
' =====================================================================
Option Explicit

Private Const IDX_TOTAL As String = "32097828799138957"
Private Const IDX_EQW As String = "67130298613737946"
Private Const MAXN As Long = 3000

Private Const COL_FIRST As Long = 3

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
        MsgBox U("063406CC062A0020004D006100630072006F005F0053006500720069006500730020062F06310020062706CC064600200641062706CC06440020064606CC0633062A002E"), vbExclamation
        Exit Sub
    End If

    Application.ScreenUpdating = False
    ws.Range("A5:I" & (4 + 900)).ClearContents

    Application.StatusBar = U("06340627062E0635002006A906440020002E002E002E")
    nAll = FetchIndex(IDX_TOTAL, d1, v1)
    If nAll = 0 Then
        Application.ScreenUpdating = True
        Application.StatusBar = False
        MsgBox U("06340627062E0635002006A906440020062F063106CC06270641062A002006460634062F002E0020062706CC0646062A06310646062A002006CC06270020062F0633062A0631063306CC002006280647002000630064006E002E0074007300650074006D0063002E0063006F006D0020063106270020") & _
               U("062806310631063306CC002006A9064606CC062F002E0020064706CC068600200639062F062F06CC0020062A063A06CC06CC06310020064606A90631062F002E"), vbExclamation
        Exit Sub
    End If
    If nAll > 900 Then
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

    For k = 2 To 7
        Application.StatusBar = U("0633063106CC0020") & k & U("002006270632002006F70020002E002E002E")
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

    If Not wc Is Nothing Then
        Dim col() As Double, m As Long, per As Double, ratio As Double
        Dim lowD As Double, highD As Double, ax() As Double
        For k = 1 To 7
            Application.StatusBar = U("06860631062E064700200633063106CC0020") & k & " ..."
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
                    wc.Cells(r, 10).Value = U("06860631062E064700200645063906460627062F06270631")
                Else
                    wc.Cells(r, 2).ClearContents
                    wc.Cells(r, 3).ClearContents
                    wc.Cells(r, 4).ClearContents
                    wc.Cells(r, 5).ClearContents
                    wc.Cells(r, 6).ClearContents
                    wc.Cells(r, 10).Value = U("06860631062E064700200645063906460627062F0627063106CC0020067E06CC062F0627002006460634062F")
                End If
            Else
                wc.Cells(r, 10).Value = U("062F0627062F0647002006A90627064106CC0020064606CC0633062A00200028") & m & U("00200631064806320029")
            End If
        Next k
    End If

    Application.StatusBar = U("067E0627064606440020062206450627063106CC0020002E002E002E")
    On Error Resume Next
    MacroStats.RefreshMacroStats
    On Error GoTo 0

    Application.Calculate
    Application.StatusBar = False
    Application.ScreenUpdating = True

    msg = U("0645062D064806310020062A0627063106CC062E003A0020") & nAll & U("0020063106480632") & vbCrLf & vbCrLf
    Dim nm As Variant
    nm = Array(U("06340627062E0635002006A90644"), U("06340627062E0635002006470645200C064806320646"), U("062F0644062706310020062206320627062F"), U("062F0644062706310020064606CC0645062706CC06CC"), _
               U("062A062A0631"), U("06270648064606330020063706440627"), U("063306A906470020062A064506270645"))
    For k = 1 To 7
        msg = msg & nm(k - 1) & ": " & IIf(got(k) > 0, got(k) & U("0020063106480632"), U("062F063106CC06270641062A002006460634062F")) & vbCrLf
    Next k
    msg = msg & vbCrLf & U("063406CC062A200C0647062706CC0020005200650061006C005F0049006E006400650078060C0020004D006100630072006F005F004300790063006C00650073060C0020004C006500610064005F004C00610067060C0020") & _
          U("0043006F0069006E0074006500670072006100740069006F006E00200648002000470065006F005F004500760065006E0074007300200647064506AF06CC002006280647200C06310648063200200634062F0646062F002E")
    MsgBox msg, vbInformation, U("06280647200C063106480632063106330627064606CC002006A9064406270646")
End Sub

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
