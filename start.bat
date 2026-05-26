@echo off
title Tutor 课后反馈生成器
cd /d "%~dp0"

echo.
echo ============================
echo   Tutor 课后反馈生成器
echo ============================
echo.

:: 检查 node_modules 是否存在
if not exist "node_modules\" (
    echo [首次运行] 安装依赖中...
    call npm install
    echo.
)

:: 检查 .env.local
if not exist ".env.local" (
    echo [警告] 未找到 .env.local，请先配置密钥！
    echo 把 .env.local.example 复制为 .env.local，填入你的 API Key。
    pause
    exit /b 1
)

:: 启动
echo 启动中... 浏览器打开 http://localhost:3000
echo 关闭此窗口即可停止服务。
echo.
call npm run dev
pause
