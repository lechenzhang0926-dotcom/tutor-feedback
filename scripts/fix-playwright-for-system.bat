@echo off
REM ============================================================
REM  Fix Playwright browser path for the SYSTEM-run web server.
REM  Double-click this file. If not admin, it requests elevation
REM  (click Yes on the UAC prompt), then updates the task.
REM ============================================================

NET SESSION >nul 2>&1
if %errorLevel% neq 0 (
    echo.
    echo [INFO] Administrator rights required. Requesting elevation...
    echo        Please click "Yes" on the User Account Control prompt.
    echo.
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

echo.
echo [OK] Admin granted. Updating the task to use the Playwright-aware launcher...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0fix-playwright-for-system.ps1"
echo.
echo [DONE] Check result: C:\Users\33696\fix-playwright-result.txt
echo        You can close this window now.
echo.
pause
