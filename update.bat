@echo off
title 更新 Tutor 工具
cd /d "%~dp0"

echo.
echo ============================
echo   更新 Tutor 课后反馈生成器
echo ============================
echo.

echo [1/3] 从 GitHub 拉取最新代码...
call git pull
if errorlevel 1 (
    echo [错误] 拉取失败，请检查网络或 Git 是否安装。
    pause
    exit /b 1
)

echo.
echo [2/3] 安装新依赖...
call npm install

echo.
echo [3/3] 更新完成！
echo.
echo 双击 start.bat 启动工具。
echo.
pause
