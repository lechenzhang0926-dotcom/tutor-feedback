@echo off
title Tutor 课后反馈生成器 (生产模式)
cd /d "%~dp0"

:: 生产模式需要已构建的 .next；没有就先构建
if not exist ".next\BUILD_ID" (
    echo [需要构建] 未检测到 .next 构建产物，先执行 npm run build ...
    call npm run build
    if errorlevel 1 (
        echo [错误] 构建失败，请检查依赖与代码。
        pause
        exit /b 1
    )
)

echo.
echo ============================
echo   Tutor 课后反馈生成器 (生产)
echo ============================
echo.
echo 启动中... 浏览器打开 http://localhost:3000
echo 关闭此窗口即可停止服务。
echo.

set PORT=3000
set NODE_ENV=production
call npm run start
pause
