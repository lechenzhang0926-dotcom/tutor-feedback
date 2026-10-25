@echo off
rem ============================================================
rem  Install / repair boot autostart
rem
rem  Usage: right-click this file -> "Run as administrator"
rem
rem  Registers scheduled task "TutorFeedback":
rem    - Runs as SYSTEM: starts at boot, nobody needs to log in
rem    - Runs in session 0: no console window on the desktop
rem    - Auto restart on failure (every minute, up to 999 times)
rem    - No execution time limit (the site must stay resident)
rem
rem  NOTE: ASCII only. cmd.exe reads .cmd/.bat as ANSI; UTF-8 CJK
rem  comments get garbled and break batch parsing.
rem ============================================================

chcp 65001 >nul 2>&1

net session >nul 2>&1
if errorlevel 1 (
  echo Elevation required, requesting administrator rights...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-autostart.ps1"

echo.
echo Press any key to close this window.
pause >nul
