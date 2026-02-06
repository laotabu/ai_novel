@echo off
echo 启动上下文管理客户端...
echo.

echo 1. 检查Python环境...
python --version
if errorlevel 1 (
    echo 错误: Python未安装或不在PATH中
    pause
    exit /b 1
)

echo.
echo 2. 检查Node.js环境...
node --version
if errorlevel 1 (
    echo 错误: Node.js未安装或不在PATH中
    pause
    exit /b 1
)

echo.
echo 3. 安装依赖（如果需要）...
if not exist "node_modules" (
    echo 正在安装依赖...
    npm install
) else (
    echo 依赖已安装
)

echo.
echo 4. 启动应用程序...
echo 请等待Electron窗口打开...
npm start

pause
