@echo off
chcp 65001 >nul
cd /d "%~dp0"
title planlock console
echo [planlock console] %date% %time% > start-console.log
where node >nul 2>nul
if errorlevel 1 (
  echo NO_NODE >> start-console.log
  echo 没有找到 Node.js，请先安装 https://nodejs.org （LTS 版）
  pause
  exit /b 1
)
node -v >> start-console.log
if not exist node_modules (
  echo 正在安装依赖 npm install ...
  call npm install --no-audit --no-fund >> start-console.log 2>&1
)
echo 正在构建前端 npm run build ...
call npm run build >> start-console.log 2>&1
if errorlevel 1 (
  echo BUILD_FAILED >> start-console.log
  echo 构建失败，详见 start-console.log
  pause
  exit /b 1
)
echo SERVER_STARTING >> start-console.log
echo.
echo 控制台已启动：http://127.0.0.1:5174   （关掉这个窗口即停止）
call npm start >> start-console.log 2>&1
