@echo off
REM ============================================================
REM  Cleanup pm2 remnants and start the proper TutorFeedback server.
REM  Double-click. If not admin, it requests elevation (click Yes on UAC).
REM ============================================================

NET SESSION >nul 2>&1
if errorlevel 1 (
    echo.
    echo [INFO] Administrator rights required. Requesting elevation...
    echo        Click "Yes" on the User Account Control prompt.
    echo.
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

echo.
echo [OK] Admin granted. Killing pm2 and starting the proper server...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0cleanup-pm2-and-start.ps1"
echo.
echo [DONE] Check result: C:\Users\33696\cleanup-result.txt
echo        You can close this window now.
echo.
pause
