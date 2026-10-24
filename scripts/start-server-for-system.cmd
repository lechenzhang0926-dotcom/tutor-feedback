@echo off
rem ============================================================
rem  Tutor feedback web server launcher
rem
rem  Callers (either one, or both - single-instance guard prevents
rem  double start):
rem    - Startup folder: tutor-autostart.vbs  (silent, after login)
rem    - Scheduled task: TutorFeedback        (SYSTEM, at boot)
rem
rem  Arguments:
rem    (none)  -> if port 3000 is already listening, exit immediately
rem    /force  -> kill whatever holds port 3000, then start
rem
rem  NOTE: keep this file ASCII-only. cmd.exe reads .cmd as ANSI;
rem  UTF-8 CJK comments get garbled and break parsing.
rem ============================================================

chcp 65001 >nul 2>&1
setlocal

set "APPDIR=C:\Users\33696\Projects\tutor-feedback"
set "NODE_EXE=D:\Vibe Coding\Node.js\node.exe"
set "PLAYWRIGHT_BROWSERS_PATH=C:\Users\33696\AppData\Local\ms-playwright"
set "LOGDIR=%APPDIR%\logs"
rem Launcher log and server output MUST be different files:
rem the running server holds an exclusive handle on its own stdout file.
set "LOG=%LOGDIR%\launcher.log"
set "SERVER_LOG=%LOGDIR%\server.log"
set "ARG1=%~1"

cd /d "%APPDIR%" 2>nul
if not exist "%LOGDIR%" mkdir "%LOGDIR%" 2>nul

rem Rotate launcher log when it exceeds 5MB
if exist "%LOG%" (
  for %%A in ("%LOG%") do if %%~zA GTR 5242880 (
    if exist "%LOG%.1" del /q "%LOG%.1" 2>nul
    move /y "%LOG%" "%LOG%.1" >nul 2>&1
  )
)

rem Rotate server log only when nothing is running (file not locked)
netstat -ano | findstr /R /C:":3000 .*LISTENING" >nul 2>&1
if errorlevel 1 (
  if exist "%SERVER_LOG%" (
    for %%A in ("%SERVER_LOG%") do if %%~zA GTR 10485760 (
      if exist "%SERVER_LOG%.1" del /q "%SERVER_LOG%.1" 2>nul
      move /y "%SERVER_LOG%" "%SERVER_LOG%.1" >nul 2>&1
    )
  )
)

call :log "===== launcher start (arg=%ARG1%) ====="

rem ---------- single instance guard ----------
netstat -ano | findstr /R /C:":3000 .*LISTENING" >nul 2>&1
if not errorlevel 1 (
  if /I not "%ARG1%"=="/force" (
    call :log "port 3000 already listening - skip (already running)"
    exit /b 0
  )
  call :log "port 3000 in use - force restart requested"
)

rem ---------- preflight ----------
if not exist "%NODE_EXE%" (
  call :log "FATAL: node.exe not found at %NODE_EXE%"
  exit /b 1
)
if not exist "%APPDIR%\node_modules\next\dist\bin\next" (
  call :log "FATAL: next not found in node_modules"
  exit /b 1
)
if not exist "%APPDIR%\.next\BUILD_ID" (
  call :log "FATAL: .next\BUILD_ID missing - run 'npm run build' first"
  exit /b 1
)
if not exist "%PLAYWRIGHT_BROWSERS_PATH%" (
  call :log "WARN: Playwright browsers dir missing"
)

rem ---------- kill stale process (force mode only) ----------
if /I "%ARG1%"=="/force" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction Stop | ForEach-Object { try { Stop-Process -Id $_.OwningProcess -Force -ErrorAction Stop; Write-Output ('killed ' + $_.OwningProcess) } catch {} } } catch { }" >> "%LOG%" 2>&1
  ping -n 3 127.0.0.1 >nul 2>&1
)

rem ---------- start ----------
call :log "starting next server"
"%NODE_EXE%" "%APPDIR%\node_modules\next\dist\bin\next" start >> "%SERVER_LOG%" 2>&1
set "CODE=%ERRORLEVEL%"
call :log "server exited with code %CODE%"
exit /b %CODE%

:log
>> "%LOG%" echo [%date% %time%] %~1
goto :eof
