@echo off
rem ============================================================
rem  Long-running launcher for the Tutor web server (SYSTEM).
rem  SYSTEM has no own ms-playwright folder, so we point Playwright
rem  to the browsers installed under the user profile, and clear any
rem  stale server (including the legacy pm2 daemon and its child)
rem  still holding port 3000 before starting.
rem  Used by scheduled task "TutorFeedback" - keep this file.
rem ============================================================

cd /d "C:\Users\33696\Projects\tutor-feedback"

rem Point Playwright to the user-profile browsers.
set "PLAYWRIGHT_BROWSERS_PATH=C:\Users\33696\AppData\Local\ms-playwright"

rem Kill the legacy pm2 daemon and any pm2-managed node (runs as SYSTEM,
rem so it can remove leftovers). This prevents pm2 from holding port 3000.
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*pm2*lib*Daemon.js*' -or $_.CommandLine -like '*next*dist*bin*next start*' } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {} }"

rem Kill any remaining process holding port 3000.
powershell -NoProfile -Command "try { $id=(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction Stop).OwningProcess; if ($id) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 1 } } catch {}"

rem Start the server with the same node build that was serving OK.
"D:\Vibe Coding\Node.js\node.exe" "node_modules\next\dist\bin\next" start
