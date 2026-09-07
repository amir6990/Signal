' =====================================================================
'  نصب دکمه «به‌روزرسانی» در هر پنج فایل اکسل — یک بار، دوبار کلیک
'
'  چه می‌کند:
'    ۱. ماژول vba\SignalRefresh.bas را داخل هر فایل می‌گذارد
'    ۲. یک دکمه سبز روی اولین شیت می‌سازد و به ماکرو وصل می‌کند
'    ۳. فایل را با پسوند .xlsm ذخیره می‌کند (اکسل فقط این را با ماکرو باز می‌کند)
'
'  پیش‌نیاز — یک تیک، فقط یک بار:
'    Excel > File > Options > Trust Center > Trust Center Settings
'    > Macro Settings > "Trust access to the VBA project object model" ✔
'
'  اگر آن تیک نباشد، این اسکریپت خودش می‌گوید و کاری نمی‌کند.
' =====================================================================
Option Explicit

Dim fso, shell, here, basPath, xl, i, files, made, failed, report
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
here = fso.GetParentFolderName(WScript.ScriptFullName)
basPath = fso.BuildPath(here, "vba\SignalRefresh.bas")
Dim basTime
basTime = fso.BuildPath(here, "vba\TimeCycles.bas")
Dim basMacro
basMacro = fso.BuildPath(here, "vba\MacroTime.bas")
Dim basStats
basStats = fso.BuildPath(here, "vba\MacroStats.bas")
Dim basOpt
basOpt = fso.BuildPath(here, "vba\OptionsRefresh.bas")

If Not fso.FileExists(basPath) Then
    MsgBox "فایل ماژول پیدا نشد:" & vbCrLf & basPath & vbCrLf & vbCrLf & _
           "پوشه vba باید کنار همین اسکریپت باشد.", 16, "نصب ناموفق"
    WScript.Quit 1
End If

files = Array("Stocks_Signals", "Options_Signals", "Time_Analysis", _
              "Gold_Analysis", "FX_Analysis")

On Error Resume Next
Set xl = CreateObject("Excel.Application")
If Err.Number <> 0 Then
    MsgBox "اکسل پیدا نشد. آیا Microsoft Excel نصب است؟", 16, "نصب ناموفق"
    WScript.Quit 1
End If
On Error GoTo 0

xl.Visible = False
xl.DisplayAlerts = False

made = 0 : failed = 0 : report = ""

For i = 0 To UBound(files)
    Dim src, dst, wb, ws, vbc, shp, ok
    src = fso.BuildPath(here, files(i) & ".xlsx")
    dst = fso.BuildPath(here, files(i) & ".xlsm")
    ok = False

    If Not fso.FileExists(src) Then
        If fso.FileExists(dst) Then
            src = dst          ' قبلاً نصب شده — دوباره نصب کن
        Else
            report = report & "✘ " & files(i) & " — فایل نیست" & vbCrLf
            failed = failed + 1
        End If
    End If

    If fso.FileExists(src) Then
        On Error Resume Next
        Set wb = xl.Workbooks.Open(src)
        If Err.Number <> 0 Then
            report = report & "✘ " & files(i) & " — باز نشد (شاید در اکسل باز است)" & vbCrLf
            failed = failed + 1
            Err.Clear
        Else
            ' --- آزمون دسترسی به پروژه VBA ---
            Dim nComp
            nComp = -1
            nComp = wb.VBProject.VBComponents.Count
            If Err.Number <> 0 Then
                Err.Clear
                wb.Close False
                xl.Quit
                MsgBox "دسترسی به پروژه VBA بسته است." & vbCrLf & vbCrLf & _
                       "در اکسل این تیک را بزنید و دوباره اجرا کنید:" & vbCrLf & vbCrLf & _
                       "File > Options > Trust Center > Trust Center Settings" & vbCrLf & _
                       "> Macro Settings >" & vbCrLf & _
                       """Trust access to the VBA project object model""", _
                       48, "یک تیک مانده"
                WScript.Quit 1
            End If

            ' --- ماژول‌های قبلی را بردار تا نصب دوباره تمیز باشد ---
            Dim again
            For again = 0 To 4
                For Each vbc In wb.VBProject.VBComponents
                    If vbc.Name = "SignalRefresh" Or vbc.Name = "TimeCycles" _
                       Or vbc.Name = "MacroTime" _
                       Or vbc.Name = "MacroStats" _
                       Or vbc.Name = "OptionsRefresh" Then
                        wb.VBProject.VBComponents.Remove vbc
                        Exit For
                    End If
                Next
            Next
            Err.Clear

            wb.VBProject.VBComponents.Import basPath
            If fso.FileExists(basTime) Then wb.VBProject.VBComponents.Import basTime
            If fso.FileExists(basStats) Then wb.VBProject.VBComponents.Import basStats
            If fso.FileExists(basOpt) Then wb.VBProject.VBComponents.Import basOpt
            If fso.FileExists(basMacro) Then wb.VBProject.VBComponents.Import basMacro

            If Err.Number <> 0 Then
                report = report & "✘ " & files(i) & " — ماژول وارد نشد" & vbCrLf
                failed = failed + 1
                Err.Clear
            Else
                ' --- دکمه روی اولین شیت ---
                Set ws = wb.Worksheets(1)
                ' دکمه قبلی را پاک کن
                For Each shp In ws.Shapes
                    If shp.Name = "btnRefresh" Then shp.Delete
                Next
                Err.Clear

                Set shp = ws.Shapes.AddShape(5, 12, 12, 150, 34)   ' 5 = مستطیل گردگوشه
                shp.Name = "btnRefresh"
                shp.Fill.ForeColor.RGB = RGB(16, 124, 65)
                shp.Line.Visible = False
                shp.TextFrame2.TextRange.Text = "به‌روزرسانی داده"
                shp.TextFrame2.TextRange.Font.Size = 12
                shp.TextFrame2.TextRange.Font.Bold = True
                shp.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = RGB(255, 255, 255)
                ' فایل آپشن، مسیر خودش را دارد
                Dim hasOpt, wsO
                hasOpt = False
                For Each wsO In wb.Worksheets
                    If wsO.Name = "Options" Then hasOpt = True
                Next
                If hasOpt Then
                    shp.OnAction = "OptionsRefresh.RefreshOptions"
                Else
                    shp.OnAction = "SignalRefresh.RefreshAll"
                End If

                ' --- دکمه دوم: تحلیل چرخه زمانی، فقط جایی که شیت را دارد ---
                Dim hasTC, wsAny
                hasTC = False
                For Each wsAny In wb.Worksheets
                    If wsAny.Name = "Time_Cycles" Then hasTC = True
                Next
                If hasTC Then
                    Dim wsTC, shp2
                    Set wsTC = wb.Worksheets("Time_Cycles")
                    For Each shp2 In wsTC.Shapes
                        If shp2.Name = "btnCycles" Then shp2.Delete
                    Next
                    Err.Clear
                    Set shp2 = wsTC.Shapes.AddShape(5, 12, 12, 190, 34)
                    shp2.Name = "btnCycles"
                    shp2.Fill.ForeColor.RGB = RGB(31, 78, 121)
                    shp2.Line.Visible = False
                    shp2.TextFrame2.TextRange.Text = "تحلیل چرخه زمانی"
                    shp2.TextFrame2.TextRange.Font.Size = 12
                    shp2.TextFrame2.TextRange.Font.Bold = True
                    shp2.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = RGB(255, 255, 255)
                    shp2.OnAction = "TimeCycles.RefreshTimeCycles"
                End If

                ' --- دکمه کلان روی Macro_Series ---
                Dim hasMS, wsAny2
                hasMS = False
                For Each wsAny2 In wb.Worksheets
                    If wsAny2.Name = "Macro_Series" Then hasMS = True
                Next
                If hasMS Then
                    Dim wsMS, shp3
                    Set wsMS = wb.Worksheets("Macro_Series")
                    For Each shp3 In wsMS.Shapes
                        If shp3.Name = "btnMacro" Then shp3.Delete
                    Next
                    Err.Clear
                    Set shp3 = wsMS.Shapes.AddShape(5, 12, 12, 210, 34)
                    shp3.Name = "btnMacro"
                    shp3.Fill.ForeColor.RGB = RGB(120, 60, 140)
                    shp3.Line.Visible = False
                    shp3.TextFrame2.TextRange.Text = "به‌روزرسانی کلان"
                    shp3.TextFrame2.TextRange.Font.Size = 12
                    shp3.TextFrame2.TextRange.Font.Bold = True
                    shp3.TextFrame2.TextRange.Font.Fill.ForeColor.RGB = RGB(255, 255, 255)
                    shp3.OnAction = "MacroTime.RefreshMacro"
                End If

                ' 52 = xlOpenXMLWorkbookMacroEnabled
                wb.SaveAs dst, 52
                If Err.Number <> 0 Then
                    report = report & "✘ " & files(i) & " — ذخیره نشد" & vbCrLf
                    failed = failed + 1
                    Err.Clear
                Else
                    report = report & "✔ " & files(i) & ".xlsm" & vbCrLf
                    made = made + 1
                    ok = True
                End If
            End If
            wb.Close False
            Err.Clear
        End If
        On Error GoTo 0
    End If
Next

xl.DisplayAlerts = True
xl.Quit
Set xl = Nothing

If made > 0 Then
    MsgBox made & " فایل آماده شد." & vbCrLf & vbCrLf & report & vbCrLf & _
           "از این به بعد فایل‌های .xlsm را باز کنید (نه .xlsx)." & vbCrLf & _
           "روی دکمه سبز بالای شیت اول کلیک کنید." & vbCrLf & vbCrLf & _
           "بار اول اکسل می‌پرسد ماکرو فعال شود — Enable Content را بزنید.", _
           64, "نصب انجام شد"
Else
    MsgBox "هیچ فایلی آماده نشد." & vbCrLf & vbCrLf & report, 48, "نصب ناموفق"
End If
