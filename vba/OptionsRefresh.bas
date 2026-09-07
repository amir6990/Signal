Attribute VB_Name = "OptionsRefresh"
' =====================================================================
'  دیده‌بان اختیار معامله — با یک کلیک
'
'  منبع: webgw.tse.ir/InstrumentProvider/api/v1/MarketWatch/MarketWatchOption/fa
'        پاسخ: {"Items":[{"instrumentName":"ضفلا۷۰۰۱", ...}, ...]}
'
'  ⚠️ نسخه پایتون این کار را با **حذف ردیف‌ها** انجام می‌دهد و در نتیجه
'  فرمول‌های ستون O به بعد را از بین می‌برد (خودش هم هشدار می‌دهد که باید
'  دوباره کپی شوند). اینجا عمداً طور دیگری عمل می‌شود: فقط ستون‌های خام
'  A تا N نوشته می‌شوند و فرمول‌ها دست‌نخورده می‌مانند.
'
'  نقطه ورود:  RefreshOptions
' =====================================================================
Option Explicit

Private Const GW As String = "https://webgw.tse.ir/InstrumentProvider/api/v1"
Private Const MAXROWS As Long = 120

Private Function HttpO(ByVal url As String) As String
    Dim h As Object
    On Error GoTo Fail
    Set h = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    h.setTimeouts 8000, 8000, 20000, 45000
    h.Open "GET", url, False
    h.setRequestHeader "User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " & _
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    h.setRequestHeader "Accept", "application/json, text/plain, */*"
    h.setRequestHeader "Referer", "https://main.tsetmc.com/"
    h.send
    If h.Status = 200 Then HttpO = h.responseText Else HttpO = ""
    Exit Function
Fail:
    HttpO = ""
End Function

' مقدار یک کلید از شیء، با چند نام جایگزین (نام‌های تأییدنشده)
Private Function ValOf(ByVal js As String, ByVal k1 As String, _
                       ByVal k2 As String) As String
    Dim q As Long, e As Long
    ValOf = ""
    q = InStr(1, js, """" & k1 & """", vbTextCompare)
    If q = 0 And Len(k2) > 0 Then
        q = InStr(1, js, """" & k2 & """", vbTextCompare)
    End If
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
        Do While e <= Len(js) And InStr("0123456789.-eE+", Mid$(js, e, 1)) > 0
            e = e + 1
        Loop
    End If
    If e > q Then ValOf = Mid$(js, q, e - q)
End Function

Private Function NumOf(ByVal s As String) As Double
    Dim i As Long, ch As String, o As String, c As Long
    For i = 1 To Len(s)
        ch = Mid$(s, i, 1)
        c = AscW(ch)
        If c >= &H6F0 And c <= &H6F9 Then
            o = o & CStr(c - &H6F0)
        ElseIf InStr("0123456789.-", ch) > 0 Then
            o = o & ch
        End If
    Next i
    If Len(o) = 0 Or o = "-" Or o = "." Then
        NumOf = -1
    Else
        On Error Resume Next
        NumOf = CDbl(o)
        If Err.Number <> 0 Then NumOf = -1
    End If
End Function

Public Sub RefreshOptions()
    Dim ws As Worksheet, wb2 As Worksheet
    Dim js As String, i As Long, s0 As Long, dep As Long
    Dim obj As String, nm As String, base As String
    Dim r As Long, n As Long, nSkip As Long
    Dim bases(1 To 40) As String, nb As Long, k As Long
    Dim v As Double, msg As String

    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets("Options")
    On Error GoTo 0
    If ws Is Nothing Then
        MsgBox "شیت Options در این فایل نیست.", vbExclamation
        Exit Sub
    End If

    ' نمادهای پایه: از شیت Underlying همین فایل، یا Watchlist اگر بود
    On Error Resume Next
    Set wb2 = ThisWorkbook.Worksheets("Underlying")
    If wb2 Is Nothing Then Set wb2 = ThisWorkbook.Worksheets("Watchlist")
    On Error GoTo 0
    nb = 0
    If Not wb2 Is Nothing Then
        For i = 5 To 60
            nm = Trim$(CStr(wb2.Cells(i, 1).Value))
            If Len(nm) > 0 And nb < 40 Then
                nb = nb + 1
                bases(nb) = nm
            End If
        Next i
    End If
    If nb = 0 Then
        MsgBox "هیچ نماد پایه‌ای پیدا نشد." & vbCrLf & _
               "نمادها را در شیت Underlying (ستون اول) بگذارید.", vbExclamation
        Exit Sub
    End If

    Application.ScreenUpdating = False
    Application.StatusBar = "دریافت دیده‌بان اختیار معامله ..."
    js = HttpO(GW & "/MarketWatch/MarketWatchOption/fa")

    If InStr(1, js, "instrumentName", vbTextCompare) = 0 Then
        Application.ScreenUpdating = True
        Application.StatusBar = False
        MsgBox "دیده‌بان آپشن پاسخ نداد یا خالی بود." & vbCrLf & vbCrLf & _
               "خارج از ساعت معاملات این طبیعی است." & vbCrLf & _
               "هیچ عددی تغییر نکرد.", vbExclamation, "به‌روزرسانی آپشن"
        Exit Sub
    End If

    ' فقط ستون‌های خام پاک می‌شوند — فرمول‌های O به بعد دست نمی‌خورند
    ws.Range(ws.Cells(5, 1), ws.Cells(4 + MAXROWS, 14)).ClearContents

    r = 5
    n = 0
    ' ⚠️ باید از **بعدِ** براکت آرایه شروع کرد. اگر از ابتدای رشته دنبال
    ' اولین { بگردیم، آن، شیء بیرونی {"Items":[...]} است و کل پاسخ را
    ' یکجا می‌بلعد — یعنی فقط یک «قرارداد» پیدا می‌شود.
    i = InStr(1, js, "[")
    If i = 0 Then i = 1
    Do While i <= Len(js) And n < MAXROWS
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
            nm = ValOf(obj, "instrumentName", "")
            If Len(nm) > 0 Then
                base = ""
                For k = 1 To nb
                    If InStr(1, nm, bases(k)) > 0 Then
                        base = bases(k)
                        Exit For
                    End If
                Next k
                If Len(base) > 0 Then
                    ws.Cells(r, 1).Value = nm
                    ws.Cells(r, 2).Value = ValOf(obj, "instrumentId", "")
                    ' نماد اختیار خرید در بورس ایران با «ض» شروع می‌شود
                    ws.Cells(r, 3).Value = IIf(Left$(nm, 1) = "ض", "Call", "Put")
                    ws.Cells(r, 4).Value = base
                    v = NumOf(ValOf(obj, "qeymateEmal", "")): If v > 0 Then ws.Cells(r, 5).Value = v
                    ws.Cells(r, 6).Value = ValOf(obj, "tarixSarresid", "")
                    v = NumOf(ValOf(obj, "baghimandetasarresid", "baqimandeTaSarresId"))
                    If v >= 0 Then ws.Cells(r, 7).Value = v
                    v = NumOf(ValOf(obj, "lastPrice", "")): If v >= 0 Then ws.Cells(r, 8).Value = v
                    v = NumOf(ValOf(obj, "closingPrice", "")): If v >= 0 Then ws.Cells(r, 9).Value = v
                    v = NumOf(ValOf(obj, "tradeVolume", "")): If v >= 0 Then ws.Cells(r, 10).Value = v
                    v = NumOf(ValOf(obj, "tradeValue", "")): If v >= 0 Then ws.Cells(r, 11).Value = v
                    v = NumOf(ValOf(obj, "tradeCount", "")): If v >= 0 Then ws.Cells(r, 12).Value = v
                    v = NumOf(ValOf(obj, "openInterest", "mojoodiMoghiatBaz"))
                    If v >= 0 Then ws.Cells(r, 13).Value = v
                    v = NumOf(ValOf(obj, "andazeyeQarardad", "buyAndazeyeQarardad"))
                    If v <= 0 Then v = 1000
                    ws.Cells(r, 14).Value = v
                    r = r + 1
                    n = n + 1
                Else
                    nSkip = nSkip + 1
                End If
            End If
        End If
        i = i + 1
    Loop

    Application.Calculate
    Application.StatusBar = False
    Application.ScreenUpdating = True

    msg = n & " قرارداد روی نمادهای پایه شما نوشته شد." & vbCrLf & _
          nSkip & " قرارداد روی نمادهای دیگر رد شد." & vbCrLf & vbCrLf & _
          "فرمول‌های ستون O به بعد دست نخوردند." & vbCrLf & _
          "زمان: " & Format$(Now, "yyyy-mm-dd hh:nn")
    If n = 0 Then
        msg = "هیچ قراردادی روی نمادهای پایه شما پیدا نشد." & vbCrLf & vbCrLf & _
              "یا امروز قراردادی فعال نیست، یا نمادهای شیت Underlying با " & _
              "نام قراردادها هم‌خوان نیستند."
    End If
    MsgBox msg, vbInformation, "به‌روزرسانی آپشن"
End Sub
