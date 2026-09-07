Attribute VB_Name = "MacroStats"
' =====================================================================
'
'
' =====================================================================
Option Explicit

Private Const ALPHA_CCF As Double = 0.05

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

Private Function Solve(ByRef A() As Double, ByRef b() As Double, _
                       ByVal n As Long, ByRef x() As Double) As Boolean
    Dim M() As Double, i As Long, j As Long, c As Long, piv As Long
    Dim mx As Double, pv As Double, f As Double
    Solve = False
    ReDim M(0 To n - 1, 0 To n)
    For i = 0 To n - 1
        For j = 0 To n - 1
            M(i, j) = A(i, j)
        Next j
        M(i, n) = b(i)
    Next i
    For c = 0 To n - 1
        piv = c
        mx = Abs(M(c, c))
        For i = c + 1 To n - 1
            If Abs(M(i, c)) > mx Then
                mx = Abs(M(i, c))
                piv = i
            End If
        Next i
        If mx < 0.000000000001 Then Exit Function
        If piv <> c Then
            For j = 0 To n
                pv = M(c, j): M(c, j) = M(piv, j): M(piv, j) = pv
            Next j
        End If
        pv = M(c, c)
        For j = c To n
            M(c, j) = M(c, j) / pv
        Next j
        For i = 0 To n - 1
            If i <> c And M(i, c) <> 0 Then
                f = M(i, c)
                For j = c To n
                    M(i, j) = M(i, j) - f * M(c, j)
                Next j
            End If
        Next i
    Next c
    ReDim x(0 To n - 1)
    For i = 0 To n - 1
        x(i) = M(i, n)
    Next i
    Solve = True
End Function

Private Function Inverse(ByRef A() As Double, ByVal n As Long, _
                         ByRef inv() As Double) As Boolean
    Dim M() As Double, i As Long, j As Long, c As Long, piv As Long
    Dim mx As Double, pv As Double, f As Double
    Inverse = False
    ReDim M(0 To n - 1, 0 To 2 * n - 1)
    For i = 0 To n - 1
        For j = 0 To n - 1
            M(i, j) = A(i, j)
            M(i, n + j) = IIf(i = j, 1#, 0#)
        Next j
    Next i
    For c = 0 To n - 1
        piv = c
        mx = Abs(M(c, c))
        For i = c + 1 To n - 1
            If Abs(M(i, c)) > mx Then
                mx = Abs(M(i, c))
                piv = i
            End If
        Next i
        If mx < 0.000000000001 Then Exit Function
        If piv <> c Then
            For j = 0 To 2 * n - 1
                pv = M(c, j): M(c, j) = M(piv, j): M(piv, j) = pv
            Next j
        End If
        pv = M(c, c)
        For j = 0 To 2 * n - 1
            M(c, j) = M(c, j) / pv
        Next j
        For i = 0 To n - 1
            If i <> c And M(i, c) <> 0 Then
                f = M(i, c)
                For j = 0 To 2 * n - 1
                    M(i, j) = M(i, j) - f * M(c, j)
                Next j
            End If
        Next i
    Next c
    ReDim inv(0 To n - 1, 0 To n - 1)
    For i = 0 To n - 1
        For j = 0 To n - 1
            inv(i, j) = M(i, n + j)
        Next j
    Next i
    Inverse = True
End Function

Private Function OLS(ByRef rows() As Double, ByRef tgt() As Double, _
                     ByVal n As Long, ByVal k As Long, _
                     ByRef beta() As Double, ByRef se() As Double) As Boolean
    Dim A() As Double, b() As Double, i As Long, j As Long, t As Long
    Dim resid As Double, s2 As Double, inv() As Double
    OLS = False
    If n <= k Then Exit Function
    ReDim A(0 To k - 1, 0 To k - 1)
    ReDim b(0 To k - 1)
    For t = 0 To n - 1
        For i = 0 To k - 1
            b(i) = b(i) + rows(t, i) * tgt(t)
            For j = 0 To k - 1
                A(i, j) = A(i, j) + rows(t, i) * rows(t, j)
            Next j
        Next i
    Next t
    If Not Solve(A, b, k, beta) Then Exit Function
    s2 = 0
    For t = 0 To n - 1
        resid = tgt(t)
        For i = 0 To k - 1
            resid = resid - beta(i) * rows(t, i)
        Next i
        s2 = s2 + resid * resid
    Next t
    s2 = s2 / (n - k)
    ReDim A(0 To k - 1, 0 To k - 1)
    For t = 0 To n - 1
        For i = 0 To k - 1
            For j = 0 To k - 1
                A(i, j) = A(i, j) + rows(t, i) * rows(t, j)
            Next j
        Next i
    Next t
    If Not Inverse(A, k, inv) Then Exit Function
    ReDim se(0 To k - 1)
    For i = 0 To k - 1
        se(i) = Sqr(IIf(s2 * inv(i, i) > 0, s2 * inv(i, i), 0))
    Next i
    OLS = True
End Function

Public Function MacKinnonCrit(ByVal n As Long, ByVal kind As Long) As Double
    If kind = 1 Then
        MacKinnonCrit = -3.33613 - 6.1101 / n - 6.823 / (CDbl(n) * n)
    Else
        MacKinnonCrit = -2.86154 - 2.8903 / n - 4.234 / (CDbl(n) * n)
    End If
End Function

' ----------------------------------------------------------- ADF
Public Function ADFStat(ByRef y() As Double, ByVal n As Long, _
                        ByRef outN As Long) As Double
    Dim dy() As Double, i As Long, L As Long, maxL As Long
    Dim rows() As Double, tgt() As Double, m As Long, k As Long, t As Long, j As Long
    Dim beta() As Double, se() As Double
    ADFStat = 0
    outN = 0
    If n < 25 Then Exit Function
    ReDim dy(0 To n - 2)
    For i = 1 To n - 1
        dy(i - 1) = y(i) - y(i - 1)
    Next i
    maxL = Int(12 * (n / 100#) ^ 0.25)
    If maxL < 1 Then maxL = 1
    If maxL > n \ 5 Then maxL = n \ 5

    For L = maxL To 0 Step -1
        k = 2 + L
        m = (n - 1) - (L + 1)
        If m >= k + 10 Then
            ReDim rows(0 To m - 1, 0 To k - 1)
            ReDim tgt(0 To m - 1)
            i = 0
            For t = L + 1 To n - 2
                rows(i, 0) = 1#
                rows(i, 1) = y(t)
                For j = 1 To L
                    rows(i, 1 + j) = dy(t - j)
                Next j
                tgt(i) = dy(t)
                i = i + 1
            Next t
            If OLS(rows, tgt, m, k, beta, se) Then
                If se(1) > 0 Then
                    ADFStat = beta(1) / se(1)
                    outN = m
                    Exit Function
                End If
            End If
        End If
    Next L
End Function

Private Function FitAR(ByRef x() As Double, ByVal n As Long, ByVal p As Long, _
                       ByRef coef() As Double) As Boolean
    Dim A() As Double, b() As Double, t As Long, i As Long, j As Long
    FitAR = False
    If n <= p + 1 Or p < 1 Then Exit Function
    ReDim A(0 To p - 1, 0 To p - 1)
    ReDim b(0 To p - 1)
    For t = p To n - 1
        For i = 0 To p - 1
            b(i) = b(i) + x(t - 1 - i) * x(t)
            For j = 0 To p - 1
                A(i, j) = A(i, j) + x(t - 1 - i) * x(t - 1 - j)
            Next j
        Next i
    Next t
    FitAR = Solve(A, b, p, coef)
End Function

Private Function ARFilter(ByRef y() As Double, ByVal n As Long, _
                          ByRef coef() As Double, ByVal p As Long, _
                          ByRef res() As Double) As Long
    Dim t As Long, j As Long, pred As Double, m As Long
    If n <= p Then
        ARFilter = 0
        Exit Function
    End If
    ReDim res(0 To n - p - 1)
    m = 0
    For t = p To n - 1
        pred = 0
        For j = 0 To p - 1
            pred = pred + coef(j) * y(t - 1 - j)
        Next j
        res(m) = y(t) - pred
        m = m + 1
    Next t
    ARFilter = m
End Function

Private Function SelectAROrder(ByRef x() As Double, ByVal n As Long) As Long
    Dim p As Long, maxP As Long, bestP As Long, bestAIC As Double
    Dim coef() As Double, res() As Double, m As Long, i As Long
    Dim s2 As Double, aic As Double
    bestP = 1
    bestAIC = 1E+30
    maxP = 10
    If maxP > n \ 20 Then maxP = n \ 20
    If maxP < 1 Then maxP = 1
    For p = 1 To maxP
        If FitAR(x, n, p, coef) Then
            m = ARFilter(x, n, coef, p, res)
            If m >= 5 Then
                s2 = 0
                For i = 0 To m - 1
                    s2 = s2 + res(i) * res(i)
                Next i
                s2 = s2 / m
                If s2 > 0 Then
                    aic = m * Log(s2) + 2 * p
                    If aic < bestAIC Then
                        bestAIC = aic
                        bestP = p
                    End If
                End If
            End If
        End If
    Next p
    SelectAROrder = bestP
End Function

Public Function NormPPF(ByVal q As Double) As Double
    Dim a0 As Double, a1 As Double, a2 As Double, a3 As Double
    Dim a4 As Double, a5 As Double
    Dim b0 As Double, b1 As Double, b2 As Double, b3 As Double, b4 As Double
    Dim c0 As Double, c1 As Double, c2 As Double, c3 As Double
    Dim c4 As Double, c5 As Double
    Dim d0 As Double, d1 As Double, d2 As Double, d3 As Double
    Dim t As Double, r As Double
    NormPPF = 0
    If q <= 0 Or q >= 1 Then Exit Function
    a0 = -39.6968302866538: a1 = 220.946098424521: a2 = -275.928510446969
    a3 = 138.357751867269: a4 = -30.6647980661472: a5 = 2.50662827745924
    b0 = -54.4760987982241: b1 = 161.585836858041: b2 = -155.698979859887
    b3 = 66.8013118877197: b4 = -13.2806815528857
    c0 = -0.00778489400243029: c1 = -0.322396458041136: c2 = -2.40075827716184
    c3 = -2.54973253934373: c4 = 4.37466414146497: c5 = 2.93816398269878
    d0 = 0.00778469570904146: d1 = 0.32246712907004: d2 = 2.445134137143
    d3 = 3.75440866190742
    If q < 0.02425 Then
        t = Sqr(-2 * Log(q))
        NormPPF = (((((c0 * t + c1) * t + c2) * t + c3) * t + c4) * t + c5) / _
                  ((((d0 * t + d1) * t + d2) * t + d3) * t + 1)
    ElseIf q > 1 - 0.02425 Then
        t = Sqr(-2 * Log(1 - q))
        NormPPF = -(((((c0 * t + c1) * t + c2) * t + c3) * t + c4) * t + c5) / _
                   ((((d0 * t + d1) * t + d2) * t + d3) * t + 1)
    Else
        t = q - 0.5
        r = t * t
        NormPPF = (((((a0 * r + a1) * r + a2) * r + a3) * r + a4) * r + a5) * t / _
                  (((((b0 * r + b1) * r + b2) * r + b3) * r + b4) * r + 1)
    End If
End Function

Public Function CCF(ByRef x() As Double, ByRef y() As Double, ByVal n As Long, _
                    ByVal maxLag As Long, ByRef outLag As Long, _
                    ByRef outCorr As Double, ByRef outBand As Double, _
                    ByRef outNaive As Double, ByRef outAR As Long, _
                    ByRef outN As Long, ByRef outM As Long) As Boolean
    Dim p As Long, coef() As Double, ax() As Double, ay() As Double
    Dim na As Long, nb As Long, m As Long, i As Long, k As Long
    Dim mx As Double, my As Double, sx As Double, sy As Double
    Dim s As Double, cnt As Long, c As Double, best As Double
    Dim nLag As Long, alphaAdj As Double
    CCF = False
    If n < 60 Then Exit Function
    p = SelectAROrder(x, n)
    If Not FitAR(x, n, p, coef) Then Exit Function
    na = ARFilter(x, n, coef, p, ax)
    nb = ARFilter(y, n, coef, p, ay)
    m = na
    If nb < m Then m = nb
    If m < 30 Then Exit Function

    For i = 0 To m - 1
        mx = mx + ax(i)
        my = my + ay(i)
    Next i
    mx = mx / m: my = my / m
    For i = 0 To m - 1
        sx = sx + (ax(i) - mx) ^ 2
        sy = sy + (ay(i) - my) ^ 2
    Next i
    sx = Sqr(sx / m): sy = Sqr(sy / m)
    If sx <= 0 Or sy <= 0 Then Exit Function

    best = 0
    outLag = 0
    nLag = 0
    For k = -maxLag To maxLag
        s = 0: cnt = 0
        For i = 0 To m - 1
            If i + k >= 0 And i + k < m Then
                s = s + (ax(i) - mx) * (ay(i + k) - my)
                cnt = cnt + 1
            End If
        Next i
        If cnt > 0 Then
            nLag = nLag + 1
            c = s / (cnt * sx * sy)
            If Abs(c) > Abs(best) Then
                best = c
                outLag = k
            End If
        End If
    Next k
    If nLag = 0 Then Exit Function

    alphaAdj = 1# - (1# - ALPHA_CCF) ^ (1# / nLag)
    outCorr = best
    outBand = NormPPF(1# - alphaAdj / 2#) / Sqr(m)
    outNaive = 1.96 / Sqr(m)
    outAR = p
    outN = m
    outM = nLag
    CCF = True
End Function

Public Function EngleGranger(ByRef y() As Double, ByRef x() As Double, _
                             ByVal n As Long, ByRef outBeta As Double, _
                             ByRef outStat As Double, ByRef outCrit As Double, _
                             ByRef outHL As Double, ByRef outN As Long) As Boolean
    Dim ly() As Double, lx() As Double, m As Long, i As Long
    Dim rows() As Double, tgt() As Double, beta() As Double, se() As Double
    Dim resid() As Double, aN As Long
    Dim d() As Double, rr() As Double, bb() As Double, se2() As Double
    Dim lam As Double
    EngleGranger = False
    outHL = 0
    ReDim ly(0 To n - 1)
    ReDim lx(0 To n - 1)
    m = 0
    For i = 0 To n - 1
        If y(i) > 0 And x(i) > 0 Then
            ly(m) = Log(y(i))
            lx(m) = Log(x(i))
            m = m + 1
        End If
    Next i
    If m < 60 Then Exit Function

    ReDim rows(0 To m - 1, 0 To 1)
    ReDim tgt(0 To m - 1)
    For i = 0 To m - 1
        rows(i, 0) = 1#
        rows(i, 1) = lx(i)
        tgt(i) = ly(i)
    Next i
    If Not OLS(rows, tgt, m, 2, beta, se) Then Exit Function
    outBeta = beta(1)

    ReDim resid(0 To m - 1)
    For i = 0 To m - 1
        resid(i) = ly(i) - (beta(0) + beta(1) * lx(i))
    Next i
    outStat = ADFStat(resid, m, aN)
    If aN = 0 Then Exit Function
    outCrit = MacKinnonCrit(aN, 1)
    outN = aN

    ReDim d(0 To m - 2)
    ReDim rr(0 To m - 2, 0 To 1)
    For i = 1 To m - 1
        d(i - 1) = resid(i) - resid(i - 1)
        rr(i - 1, 0) = 1#
        rr(i - 1, 1) = resid(i - 1)
    Next i
    If OLS(rr, d, m - 1, 2, bb, se2) Then
        If bb(1) < 0 Then
            lam = 1# + bb(1)
            If lam > 0 And lam < 1 Then outHL = -Log(2#) / Log(lam)
        End If
    End If
    EngleGranger = True
End Function

Public Function EventCAR(ByRef rets() As Double, ByVal n As Long, _
                         ByVal i As Long, ByVal pre As Long, ByVal post As Long, _
                         ByVal mu As Double, ByRef ok As Boolean) As Double
    Dim t As Long, s As Double
    ok = False
    EventCAR = 0
    If i - pre < 0 Or i + post >= n Then Exit Function
    For t = i - pre To i + post
        s = s + rets(t) - mu
    Next t
    EventCAR = s
    ok = True
End Function

Public Function EventPermP(ByRef rets() As Double, ByVal n As Long, _
                           ByVal nEv As Long, ByVal obsMean As Double, _
                           ByVal pre As Long, ByVal post As Long, _
                           ByVal mu As Double, ByVal nPerm As Long) As Double
    Dim h As Long, j As Long, k As Long, idx As Long
    Dim s As Double, c As Double, cnt As Long
    Dim ok As Boolean, lo As Long, hi As Long
    EventPermP = 1#
    lo = pre
    hi = n - post - 1
    If hi <= lo Or nEv < 1 Then Exit Function
    Rnd -1
    Randomize 17
    h = 0
    For j = 1 To nPerm
        s = 0: cnt = 0
        For k = 1 To nEv
            idx = lo + Int(Rnd() * (hi - lo + 1))
            c = EventCAR(rets, n, idx, pre, post, mu, ok)
            If ok Then
                s = s + c
                cnt = cnt + 1
            End If
        Next k
        If cnt > 0 Then
            If Abs(s / cnt) >= Abs(obsMean) Then h = h + 1
        End If
    Next j
    EventPermP = (h + 1) / (nPerm + 1)
End Function

Private Function ReadCol(ByVal ws As Worksheet, ByVal col As Long, _
                         ByVal nRow As Long, ByRef out() As Double) As Long
    Dim i As Long, v As Variant, m As Long
    ReDim out(0 To nRow - 1)
    m = 0
    For i = 0 To nRow - 1
        v = ws.Cells(5 + i, col).Value
        If IsNumeric(v) Then
            If v > 0 Then
                out(m) = CDbl(v)
                m = m + 1
            End If
        End If
    Next i
    ReadCol = m
End Function

Private Function ReadPair(ByVal ws As Worksheet, ByVal c1 As Long, _
                          ByVal c2 As Long, ByVal nRow As Long, _
                          ByRef a() As Double, ByRef b() As Double) As Long
    Dim i As Long, v1 As Variant, v2 As Variant, m As Long
    ReDim a(0 To nRow - 1)
    ReDim b(0 To nRow - 1)
    m = 0
    For i = 0 To nRow - 1
        v1 = ws.Cells(5 + i, c1).Value
        v2 = ws.Cells(5 + i, c2).Value
        If IsNumeric(v1) And IsNumeric(v2) Then
            If v1 > 0 And v2 > 0 Then
                a(m) = CDbl(v1)
                b(m) = CDbl(v2)
                m = m + 1
            End If
        End If
    Next i
    ReadPair = m
End Function

Private Sub LogRet(ByRef p() As Double, ByVal n As Long, ByRef r() As Double)
    Dim i As Long
    If n < 2 Then Exit Sub
    ReDim r(0 To n - 2)
    For i = 1 To n - 1
        If p(i - 1) > 0 And p(i) > 0 Then
            r(i - 1) = Log(p(i) / p(i - 1))
        Else
            r(i - 1) = 0
        End If
    Next i
End Sub

Public Sub RefreshMacroStats()
    Dim ws As Worksheet, wl As Worksheet, wc As Worksheet, we As Worksheet
    Dim nRow As Long, i As Long, r As Long
    Dim a() As Double, b() As Double, ra() As Double, rb() As Double
    Dim m As Long, lag As Long, cr As Double, bnd As Double, nv As Double
    Dim arp As Long, nn As Long, nl As Long
    Dim bet As Double, st As Double, crt As Double, hl As Double, en As Long
    Dim s As String

    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets("Macro_Series")
    Set wl = ThisWorkbook.Worksheets("Lead_Lag")
    Set wc = ThisWorkbook.Worksheets("Cointegration")
    Set we = ThisWorkbook.Worksheets("Geo_Events")
    On Error GoTo 0
    If ws Is Nothing Then Exit Sub

    nRow = 0
    For i = 0 To 899
        If IsDate(ws.Cells(5 + i, 1).Value) Then nRow = i + 1
    Next i
    If nRow < 80 Then Exit Sub

    Dim p1(1 To 6) As Long, p2(1 To 6) As Long
    p1(1) = 5: p2(1) = 3
    p1(2) = 8: p2(2) = 3
    p1(3) = 7: p2(3) = 5
    p1(4) = 5: p2(4) = 9
    p1(5) = 3: p2(5) = 4
    p1(6) = 6: p2(6) = 5

    If Not wl Is Nothing Then
        For i = 1 To 6
            r = 4 + i
            Application.StatusBar = U("067E06CC063406310648002F067E06CC063106480020") & i & U("002006270632002006F60020002E002E002E")
            m = ReadPair(ws, p1(i), p2(i), nRow, a, b)
            wl.Range(wl.Cells(r, 3), wl.Cells(r, 10)).ClearContents
            If m > 80 Then
                LogRet a, m, ra
                LogRet b, m, rb
                If CCF(ra, rb, m - 1, 30, lag, cr, bnd, nv, arp, nn, nl) Then
                    wl.Cells(r, 3).Value = lag
                    wl.Cells(r, 4).Value = Round(cr, 4)
                    wl.Cells(r, 5).Value = Round(bnd, 4)
                    wl.Cells(r, 6).Value = Round(nv, 4)
                    wl.Cells(r, 7).Value = arp
                    wl.Cells(r, 8).Value = nn
                    wl.Cells(r, 9).Value = nl
                    If Abs(cr) > bnd Then
                        If lag > 0 Then
                            s = U("0633063106CC00200627064806440020062D062F0648062F0020") & lag & U("00200631064806320020062C06440648062A06310020062D063106A9062A0020064506CC200C06A90646062F")
                        ElseIf lag < 0 Then
                            s = U("06280631063906A90633002006410631063606CC0647003A00200633063106CC0020062F064806450020") & (-lag) & U("00200631064806320020062C06440648062A0631002006270633062A")
                        Else
                            s = U("06470645200C06320645062706460020062D063106A9062A0020064506CC200C06A906460646062F060C00200628062F064806460020062A0642062F0645")
                        End If
                    Else
                        s = U("062A0623062E06CC063100200645063906460627062F0627063106CC0020064606CC0633062A00200028062806CC063406CC0646064700200642064406470020062706320020062806270646062F00200631062F002006460634062F0029")
                    End If
                    wl.Cells(r, 10).Value = s
                Else
                    wl.Cells(r, 10).Value = U("0645062D062706330628064700200645064506A90646002006460634062F")
                End If
            Else
                wl.Cells(r, 10).Value = U("062F0627062F0647002006A90627064106CC0020064606CC0633062A")
            End If
        Next i
    End If

    Dim q1(1 To 4) As Long, q2(1 To 4) As Long
    q1(1) = 3: q2(1) = 5
    q1(2) = 3: q2(2) = 9
    q1(3) = 9: q2(3) = 5
    q1(4) = 7: q2(4) = 5

    If Not wc Is Nothing Then
        For i = 1 To 4
            r = 4 + i
            Application.StatusBar = U("06470645200C06270646062806270634062A06AF06CC0020") & i & U("002006270632002006F40020002E002E002E")
            m = ReadPair(ws, q1(i), q2(i), nRow, a, b)
            wc.Range(wc.Cells(r, 3), wc.Cells(r, 9)).ClearContents
            If m > 80 Then
                If EngleGranger(a, b, m, bet, st, crt, hl, en) Then
                    wc.Cells(r, 3).Value = Round(bet, 4)
                    wc.Cells(r, 4).Value = Round(st, 3)
                    wc.Cells(r, 5).Value = Round(crt, 3)
                    wc.Cells(r, 6).Value = IIf(st < crt, U("062806440647"), U("062E06CC0631"))
                    If hl > 0 Then wc.Cells(r, 7).Value = Round(hl, 1)
                    wc.Cells(r, 8).Value = en
                    If st < crt Then
                        If Abs(bet - 1#) < 0.15 Then
                            s = U("06310627062806370647002006CC06A9200C06280647200C06CC06A90020062806440646062F0645062F062A0020201400200633063106CC00200627064806440020062F06310020062806440646062F0645062F062A0020") & _
                                U("068606CC063206CC0020062C06320020062806270632062A062706280020062F0648064506CC0020064606CC0633062A002E")
                        ElseIf bet < 1 Then
                            s = U("06470645200C06270646062806270634062A064700200628062700200636063106CC06280020") & Format$(bet, "0.00") & _
                                U("0020201400200633063106CC0020062706480644002006A90645062A06310020062706320020062F0648064506CC0020062806270632062F06470020062F0627062F0647002E")
                        Else
                            s = U("06470645200C06270646062806270634062A064700200628062700200636063106CC06280020") & Format$(bet, "0.00") & _
                                U("002020140020062806270632062F06470020062806CC0634062A063100200627063200200633063106CC0020062F06480645002E")
                        End If
                    Else
                        s = U("063106270628063706470020062A06390627062F064406CC0020062806440646062F0645062F062A0020062A062306CC06CC062F002006460634062F002E")
                    End If
                    wc.Cells(r, 9).Value = s
                Else
                    wc.Cells(r, 9).Value = U("0645062D062706330628064700200645064506A90646002006460634062F")
                End If
            Else
                wc.Cells(r, 9).Value = U("062F0627062F0647002006A90627064106CC0020064606CC0633062A")
            End If
        Next i
    End If

    If Not we Is Nothing Then
        Dim ed() As Double, nEv As Long, k As Long
        ReDim ed(0 To 59)
        nEv = 0
        For i = 0 To 59
            If IsDate(we.Cells(5 + i, 1).Value) Then
                ed(nEv) = CDbl(CDate(we.Cells(5 + i, 1).Value))
                we.Cells(5 + i, 2).Value = TimeCycles.JalaliStr(CDate(we.Cells(5 + i, 1).Value))
                nEv = nEv + 1
            End If
        Next i
        If nEv > 0 Then
            Dim axis() As Double
            ReDim axis(0 To nRow - 1)
            For i = 0 To nRow - 1
                axis(i) = CDbl(CDate(ws.Cells(5 + i, 1).Value))
            Next i
            Dim srcCol(1 To 3) As Long, dstCol(1 To 3) As Long
            srcCol(1) = 3: dstCol(1) = 5
            srcCol(2) = 5: dstCol(2) = 6
            srcCol(3) = 9: dstCol(3) = 7
            For k = 1 To 3
                Application.StatusBar = U("06450637062706440639064700200631064806CC062F0627062F0020") & k & U("002006270632002006F30020002E002E002E")
                Dim px() As Double, rr() As Double, mu As Double
                Dim cnt As Long, sSum As Double, obs As Double, okf As Boolean
                m = 0
                ReDim px(0 To nRow - 1)
                For i = 0 To nRow - 1
                    If IsNumeric(ws.Cells(5 + i, srcCol(k)).Value) Then
                        px(i) = CDbl(ws.Cells(5 + i, srcCol(k)).Value)
                    Else
                        px(i) = 0
                    End If
                Next i
                Dim holes As Long
                holes = 0
                For i = 0 To nRow - 1
                    If px(i) <= 0 Then holes = holes + 1
                Next i
                If holes > nRow / 4 Then GoTo NextK
                For i = 1 To nRow - 1
                    If px(i) <= 0 Then px(i) = px(i - 1)
                Next i
                If px(0) <= 0 Then px(0) = px(1)
                LogRet px, nRow, rr
                mu = 0
                For i = 0 To nRow - 2
                    mu = mu + rr(i)
                Next i
                mu = mu / (nRow - 1)
                Dim rets() As Double
                ReDim rets(0 To nRow - 1)
                rets(0) = 0
                For i = 1 To nRow - 1
                    rets(i) = rr(i - 1)
                Next i
                sSum = 0: cnt = 0
                For i = 0 To nEv - 1
                    Dim idx As Long, j As Long
                    idx = -1
                    For j = 0 To nRow - 1
                        If axis(j) >= ed(i) Then
                            idx = j
                            Exit For
                        End If
                    Next j
                    If idx >= 0 Then
                        obs = EventCAR(rets, nRow, idx, 1, 3, mu, okf)
                        If okf Then
                            For j = 0 To 59
                                If IsDate(we.Cells(5 + j, 1).Value) Then
                                    If CDbl(CDate(we.Cells(5 + j, 1).Value)) = ed(i) Then
                                        we.Cells(5 + j, dstCol(k)).Value = Round(obs, 4)
                                        Exit For
                                    End If
                                End If
                            Next j
                            sSum = sSum + obs
                            cnt = cnt + 1
                        End If
                    End If
                Next i
NextK:
            Next k
        End If
    End If
    Application.StatusBar = False
End Sub
