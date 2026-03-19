@echo off
chcp 65001 >nul
title SyncClassroom 一键启动工具
cls

echo ==========================================
echo   🚀 SyncClassroom 互动课堂启动工具
echo ==========================================
echo.

:: 检查是否以管理员身份运行
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ⚠️  提示：建议右键选择"以管理员身份运行"以获得最佳体验
    echo.
    pause
    cls
    echo ==========================================
    echo   🚀 SyncClassroom 互动课堂启动工具
    echo ==========================================
    echo.
)

:: 检查 Node.js
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo ❌ 未检测到 Node.js 环境
    echo.
    echo 📦 正在自动下载并安装 Node.js...
    echo.
    
    :: 下载 Node.js 安装包
    curl -L -o "%TEMP%\nodejs-installer.msi" "https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi"
    
    if exist "%TEMP%\nodejs-installer.msi" (
        echo 📥 下载完成，正在安装...
        start /wait msiexec /i "%TEMP%\nodejs-installer.msi" /qn /norestart
        
        :: 刷新环境变量
        call refreshenv.cmd 2>nul || set "PATH=%PATH%;C:\Program Files\nodejs"
        
        :: 验证安装
        where node >nul 2>&1
        if %errorLevel% neq 0 (
            echo ❌ Node.js 安装失败，请手动安装
            echo 🌐 下载地址：https://nodejs.org/
            pause
            exit /b 1
        )
        
        echo ✅ Node.js 安装成功！
        del "%TEMP%\nodejs-installer.msi" 2>nul
    ) else (
        echo ❌ 下载失败，请手动安装 Node.js
        echo 🌐 下载地址：https://nodejs.org/
        start https://nodejs.org/
        pause
        exit /b 1
    )
    
    echo.
) else (
    for /f "tokens=*" %%a in ('node --version') do set NODE_VERSION=%%a
    echo ✅ Node.js 已安装 (%NODE_VERSION%)
)

echo.

:: 检查 npm
where npm >nul 2>&1
if %errorLevel% neq 0 (
    echo ❌ npm 未找到，请重新安装 Node.js
    pause
    exit /b 1
)

:: 进入脚本所在目录
cd /d "%~dp0"

:: 检查 package.json
if not exist "package.json" (
    echo ❌ 未找到 package.json，请确保此脚本位于项目根目录
    pause
    exit /b 1
)

:: 检查 node_modules
if not exist "node_modules" (
    echo 📦 首次运行，正在安装依赖...
    echo ⏳ 这可能需要几分钟时间，请耐心等待...
    echo.
    call npm install
    
    if %errorLevel% neq 0 (
        echo ❌ 依赖安装失败
        pause
        exit /b 1
    )
    
    echo ✅ 依赖安装完成！
    echo.
)

:: 下载外部资源（用于断网环境）
if exist "download-resources.js" (
    echo 📦 检查外部资源...
    node download-resources.js
    echo.
)

:: 检查并创建必要目录
if not exist "public\courses" mkdir "public\courses"
if not exist "public\lib" mkdir "public\lib"
if not exist "public\weights" mkdir "public\weights"

:: 获取本机 IP 地址
for /f "tokens=2 delims=[]" %%a in ('ping -4 -n 1 %COMPUTERNAME% ^| findstr "["') do set LOCAL_IP=%%a
if not defined LOCAL_IP (
    for /f "tokens=14" %%a in ('ipconfig ^| findstr "IPv4"') do set LOCAL_IP=%%a
)

cls
echo ==========================================
echo   🚀 SyncClassroom 互动课堂启动工具
echo ==========================================
echo.
echo ✅ 环境检查完成！
echo.
echo 📋 启动信息：
echo    • 教师端：http://localhost:3000
echo    • 学生端：http://%LOCAL_IP%:3000
echo.
echo 💡 提示：
echo    • 教师请在浏览器中打开 http://localhost:3000
echo    • 学生请在浏览器中打开 http://%LOCAL_IP%:3000
echo    • 按 Ctrl+C 可以停止服务
echo.
echo ==========================================
echo.

:: 启动服务器
node server.js

:: 如果服务器异常退出
echo.
echo ❌ 服务器已停止
pause
