@echo off
rem ============================================================
rem  立即重启网站（通过计划任务方式，隐藏窗口）
rem
rem  用法：右键本文件 ->「以管理员身份运行」
rem  作用：网站卡死/挂了时手动拉起；或安装自启后想马上让它接管
rem ============================================================

chcp 65001 >nul 2>&1

net session >nul 2>&1
if errorlevel 1 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

set "LAUNCHER=C:\Users\33696\Projects\tutor-feedback\scripts\start-server-for-system.cmd"
set "LOG=C:\Users\33696\Projects\tutor-feedback\logs\server.log"

echo 正在重启 Tutor 网站...
schtasks /end /tn "TutorFeedback" >nul 2>&1
timeout /t 2 /nobreak >nul
schtasks /run /tn "TutorFeedback" >nul 2>&1

echo 等待服务就绪...
timeout /t 10 /nobreak >nul

powershell -NoProfile -Command ^
  "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/' -TimeoutSec 10 -UseBasicParsing; Write-Output ('OK  HTTP ' + $r.StatusCode) }" ^
  "catch { Write-Output ('FAILED  ' + $_.Exception.Message); Write-Output ('Log: %LOG%') }"

echo.
pause
