@echo off
rem ============================================================
rem  安装 / 修复开机自启
rem
rem  用法：右键本文件 ->「以管理员身份运行」
rem
rem  作用：注册计划任务 "TutorFeedback"
rem    - 以 SYSTEM 身份运行：开机即启动，不需要任何人登录
rem    - 运行在 session 0：桌面看不到任何命令行窗口（不弹窗）
rem    - 失败自动重启（每分钟，最多 999 次）
rem    - 无执行时长限制（网站需要长期常驻）
rem ============================================================

chcp 65001 >nul 2>&1

net session >nul 2>&1
if errorlevel 1 (
  echo 需要管理员权限，正在申请提权...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-autostart.ps1"

echo.
pause
