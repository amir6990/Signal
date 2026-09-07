Attribute VB_Name = "SignalRefresh"
' =====================================================================
'
'
'
' =====================================================================
Option Explicit

Private Const UA As String = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " & _
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

Private Const CDN As String = "https://cdn.tsetmc.com/api"
Private Const N_TGJU As Long = 5
Private Const N_NOBITEX As Long = 2

' ---------------------------------------------------------------- HTTP
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

Private Function JVal(ByVal json As String, ByVal anchor As String, _
                      ByVal key As String) As Double
    Dim p As Long, q As Long, e As Long, raw As String
    JVal = -1
    p = InStr(1, json, """" & anchor & """", vbTextCompare)
    If p = 0 Then Exit Function
    q = InStr(p, json, """" & key & """", vbTextCompare)
    If q = 0 Then Exit Function
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

Private Function CleanNum(ByVal s As String) As Double
    Dim i As Long, ch As String, out As String, code As Long
    For i = 1 To Len(s)
        ch = Mid$(s, i, 1)
        code = AscW(ch)
        If code >= &H6F0 And code <= &H6F9 Then
            out = out & CStr(code - &H6F0)
        ElseIf code >= &H660 And code <= &H669 Then
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


Private Function ObjAround(ByVal json As String, ByVal needle As String) As String
    Dim p As Long, i As Long, depth As Long, s As Long, e As Long
    ObjAround = ""
    p = InStr(1, json, needle, vbTextCompare)
    If p = 0 Then Exit Function

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

Private Function JValIn(ByVal json As String, ByVal needle As String, _
                        ByVal key As String) As Double
    Dim obj As String
    JValIn = -1
    obj = ObjAround(json, needle)
    If Len(obj) = 0 Then Exit Function
    JValIn = JVal(obj, key, key)
End Function

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
' =====================================================================

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
            Application.StatusBar = U("0633064706270645003A0020") & sym & " ..."
            RefreshOneSymbol ws, r, nOk, nFail
        End If
    Next r

    RefreshIndex
End Function

Private Sub RefreshIndex()
    Dim ws As Worksheet, js As String, v As Double
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets("Market_Index")
    On Error GoTo 0
    If ws Is Nothing Then Exit Sub

    Dim r As Long, last As Long, tgt As Long
    last = 4
    For r = 5 To 3000
        If IsDate(ws.Cells(r, 1).Value) Then last = r
    Next r
    If last < 5 Then Exit Sub
    If Int(CDate(ws.Cells(last, 1).Value)) = Int(Date) Then tgt = last Else tgt = last + 1

    js = HttpGet(CDN & "/Index/GetIndexB1LastAll/SelectedIndexes/1", "https://main.tsetmc.com/")
    v = JValIn(js, "32097828799138957", "indexLastValue")
    If v > 0 Then
        ws.Cells(tgt, 1).Value = Date
        ws.Cells(tgt, 1).NumberFormat = "yyyy-mm-dd"
        ws.Cells(tgt, 2).Value = JalaliStr(Date)
        ws.Cells(tgt, 3).Value = v
        Dim ve As Double
        ve = JValIn(js, "67130298613737946", "indexLastValue")
        If ve > 0 Then ws.Cells(tgt, 4).Value = ve
    End If
End Sub

Public Sub RefreshAll()
    Dim tg As String, nb As String
    Dim n As Long, msg As String
    Dim usd As Double, nima As Double, eur As Double, aed As Double
    Dim ons As Double, silver As Double, gram As Double
    Dim coin As Double, half As Double, quarter As Double, usdt As Double

    Dim nS As Long, nSFail As Long, hasStocks As Boolean

    Application.ScreenUpdating = False

    hasStocks = RefreshStocks(nS, nSFail)
    If hasStocks Then
        Application.Calculate
        Application.StatusBar = False
        Application.ScreenUpdating = True
        msg = nS & U("0020064606450627062F002006280647200C06310648063200200634062F002E")
        If nSFail > 0 Then msg = msg & vbCrLf & nSFail & U("0020064606450627062F0020067E06270633062E00200646062F0627062F002E")
        If nS = 0 Then
            msg = U("064706CC06860020064606450627062F06CC002006280647200C063106480632002006460634062F002E") & vbCrLf & vbCrLf & _
                  U("06CC0639064606CC002006CC06270020062706CC0646062A06310646062A00200648063506440020064606CC0633062A060C002006CC06270020062F0633062A0631063306CC002006280647002000630064006E002E0074007300650074006D0063002E0063006F006D002006280633062A0647002006270633062A002E") & vbCrLf & _
                  U("064706CC068600200639062F062F06CC0020062A063A06CC06CC06310020064606A90631062F002E")
            MsgBox msg, vbExclamation, U("06280647200C063106480632063106330627064606CC0020064606270645064806410642")
        Else
            MsgBox msg & vbCrLf & vbCrLf & U("0632064506270646003A0020") & Format$(Now, "yyyy-mm-dd hh:nn"), _
                   vbInformation, U("06280647200C063106480632063106330627064606CC002006270646062C0627064500200634062F")
        End If
        Exit Sub
    End If

    Application.StatusBar = U("062F06310020062D062706440020062F063106CC06270641062A002006270632002000740067006A00750020002E002E002E")
    tg = FetchTgju()
    Application.StatusBar = U("062F06310020062D062706440020062F063106CC06270641062A002006270632002006460648062806CC062A06A906330020002E002E002E")
    nb = FetchNobitex()

    If Len(tg) = 0 And Len(nb) = 0 Then
        Application.StatusBar = False
        Application.ScreenUpdating = True
        MsgBox U("064706CC06860020064506460628063906CC0020067E06270633062E00200646062F0627062F002E") & vbCrLf & vbCrLf & _
               U("06CC0639064606CC002006CC06270020062706CC0646062A06310646062A00200648063506440020064606CC0633062A060C002006CC06270020062F0633062A0631063306CC002006280647002000740067006A007500200648002006460648062806CC062A06A90633002006280633062A0647002006270633062A002E") & vbCrLf & _
               U("064706CC068600200639062F062F06CC0020062A063A06CC06CC06310020064606A90631062F002E"), vbExclamation, U("06280647200C063106480632063106330627064606CC0020064606270645064806410642")
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

    If usd > 0 And (usd < 100000 Or usd > 50000000) Then usd = -1
    If usdt > 0 And (usdt < 100000 Or usdt > 50000000) Then usdt = -1
    If ons > 0 And (ons < 500 Or ons > 20000) Then ons = -1
    If coin > 0 And (coin < 10000000 Or coin > 100000000000#) Then coin = -1

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

    AppendHistory "Gold_History", coin
    AppendHistory "Hist_Gram18", gram
    AppendHistory "Hist_Ons", ons
    AppendHistory "FX_History", usd
    AppendHistory "Hist_USDT", usdt
    AppendHistory "Hist_Nima", nima

    Application.Calculate
    Application.StatusBar = False
    Application.ScreenUpdating = True

    msg = n & U("002006450642062F06270631002006280647200C06310648063200200634062F002E") & vbCrLf & vbCrLf
    If usd > 0 Then msg = msg & U("062F0644062706310020062206320627062F003A0020") & Format$(usd, "#,##0") & vbCrLf
    If usdt > 0 Then msg = msg & U("062A062A0631003A0020") & Format$(usdt, "#,##0") & vbCrLf
    If ons > 0 Then msg = msg & U("06270648064606330020063706440627003A0020") & Format$(ons, "#,##0.0") & vbCrLf
    If coin > 0 Then msg = msg & U("063306A906470020062A064506270645003A0020") & Format$(coin, "#,##0") & vbCrLf
    msg = msg & vbCrLf & U("0632064506270646003A0020") & Format$(Now, "yyyy-mm-dd hh:nn")
    If Len(tg) = 0 Then msg = msg & vbCrLf & vbCrLf & U("26A0002000740067006A00750020067E06270633062E00200646062F0627062F002E")
    If Len(nb) = 0 Then msg = msg & vbCrLf & U("26A0002006460648062806CC062A06A906330020067E06270633062E00200646062F0627062F002E")

    MsgBox msg, vbInformation, U("06280647200C063106480632063106330627064606CC002006270646062C0627064500200634062F")
End Sub

Public Sub RefreshFullWithPython()
    MsgBox U("06280631062706CC0020062A0627063106CC062E06860647002006A9062706450644002006480020062A062D064406CC06440020063206450627064606CC003A") & vbCrLf & vbCrLf & _
           U("06F100290020062706CC064600200641062706CC06440020063106270020062806280646062F06CC062F") & vbCrLf & _
           U("06F2002900200631064806CC00200052006500660072006500730068002E0062006100740020062F0648062806270631002006A9064406CC06A9002006A9064606CC062F") & vbCrLf & _
           U("06F300290020062F064806280627063106470020062806270632002006A9064606CC062F") & vbCrLf & vbCrLf & _
           U("062F064406CC0644003A0020062A062D064406CC06440020063706CC064106CC00200648002006330627062E062A0020062A0627063106CC062E068606470020062F06310020067E062706CC062A06480646002006270633062A060C002006480020067E062706CC062A064806460020") & _
           U("0646064506CC200C062A064806270646062F00200641062706CC064406CC002006310627002006A906470020062F06310020062706A9063306440020062806270632002006270633062A002006280646064806CC0633062F002E"), _
           vbInformation, U("06280647200C063106480632063106330627064606CC002006A9062706450644")
End Sub
