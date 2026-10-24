' ============================================================
' Tutor website silent launcher
'
' Placed in the Startup folder; runs automatically after login.
' The second argument of Run() is 0 (hidden window),
' so no black console window appears.
'
' Real startup logic lives in start-server-for-system.cmd
'
' NOTE: keep this file ASCII-only. Windows Script Host reads .vbs
' as ANSI; UTF-8 CJK comments can be misparsed on some systems.
' ============================================================

Dim sh, launcher
Set sh = CreateObject("WScript.Shell")

launcher = "C:\Users\33696\Projects\tutor-feedback\scripts\start-server-for-system.cmd"

' Give the system a few seconds after login before starting
WScript.Sleep 5000

' 0 = hidden window, False = do not wait for exit (runs in background)
sh.Run """" & launcher & """", 0, False
