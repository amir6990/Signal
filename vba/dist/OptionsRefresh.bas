Attribute VB_Name = "OptionsRefresh"
' =====================================================================
'
'
'
' =====================================================================
Option Explicit

Private Const GW As String = "https://webgw.tse.ir/InstrumentProvider/api/v1"
Private Const MAXROWS As Long = 120

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
        MsgBox U("063406CC062A0020004F007000740069006F006E00730020062F06310020062706CC064600200641062706CC06440020064606CC0633062A002E"), vbExclamation
        Exit Sub
    End If

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
        MsgBox U("064706CC06860020064606450627062F0020067E062706CC0647200C062706CC0020067E06CC062F0627002006460634062F002E") & vbCrLf & _
               U("064606450627062F064706270020063106270020062F06310020063406CC062A00200055006E006400650072006C00790069006E0067002000280633062A06480646002006270648064400290020062806AF06300627063106CC062F002E"), vbExclamation
        Exit Sub
    End If

    Application.ScreenUpdating = False
    Application.StatusBar = U("062F063106CC06270641062A0020062F06CC062F0647200C06280627064600200627062E062A06CC0627063100200645063906270645064406470020002E002E002E")
    js = HttpO(GW & "/MarketWatch/MarketWatchOption/fa")

    If InStr(1, js, "instrumentName", vbTextCompare) = 0 Then
        Application.ScreenUpdating = True
        Application.StatusBar = False
        MsgBox U("062F06CC062F0647200C06280627064600200622067E063406460020067E06270633062E00200646062F0627062F002006CC06270020062E0627064406CC002006280648062F002E") & vbCrLf & vbCrLf & _
               U("062E06270631062C0020062706320020063306270639062A0020064506390627064506440627062A0020062706CC064600200637062806CC063906CC002006270633062A002E") & vbCrLf & _
               U("064706CC068600200639062F062F06CC0020062A063A06CC06CC06310020064606A90631062F002E"), vbExclamation, U("06280647200C063106480632063106330627064606CC00200622067E06340646")
        Exit Sub
    End If

    ws.Range(ws.Cells(5, 1), ws.Cells(4 + MAXROWS, 14)).ClearContents

    r = 5
    n = 0
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
                    ws.Cells(r, 3).Value = IIf(Left$(nm, 1) = U("0636"), "Call", "Put")
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

    msg = n & U("00200642063106270631062F0627062F00200631064806CC0020064606450627062F0647062706CC0020067E062706CC064700200634064506270020064606480634062A064700200634062F002E") & vbCrLf & _
          nSkip & U("00200642063106270631062F0627062F00200631064806CC0020064606450627062F0647062706CC0020062F06CC06AF063100200631062F00200634062F002E") & vbCrLf & vbCrLf & _
          U("06410631064506480644200C0647062706CC00200633062A064806460020004F002006280647002006280639062F0020062F0633062A00200646062E06480631062F0646062F002E") & vbCrLf & _
          U("0632064506270646003A0020") & Format$(Now, "yyyy-mm-dd hh:nn")
    If n = 0 Then
        msg = U("064706CC068600200642063106270631062F0627062F06CC00200631064806CC0020064606450627062F0647062706CC0020067E062706CC064700200634064506270020067E06CC062F0627002006460634062F002E") & vbCrLf & vbCrLf & _
              U("06CC062700200627064506310648063200200642063106270631062F0627062F06CC002006410639062706440020064606CC0633062A060C002006CC06270020064606450627062F0647062706CC0020063406CC062A00200055006E006400650072006C00790069006E00670020062806270020") & _
              U("06460627064500200642063106270631062F0627062F06470627002006470645200C062E0648062706460020064606CC0633062A0646062F002E")
    End If
    MsgBox msg, vbInformation, U("06280647200C063106480632063106330627064606CC00200622067E06340646")
End Sub
