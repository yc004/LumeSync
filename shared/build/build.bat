@echo off
chcp 65001 >nul
echo [BUILD] SyncClassroom 打包脚本
echo =========================================

REM 切换到项目根目录
cd /d %~dp0..\..

REM 检查 Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] 未找到 Node.js，请先安装 Node.js 18+
    pause
    exit /b 1
)

REM 安装依赖
echo [INFO] 安装依赖...
call npm install
if errorlevel 1 (
    echo [ERROR] npm install 失败
    pause
    exit /b 1
)

REM 生成 .ico 图标
echo [INFO] 生成图标文件...
call python shared/build/convert-icons.py
if errorlevel 1 (
    echo [WARN] 图标生成失败，将使用默认图标继续
)

REM 打包 verify-password.exe
echo [INFO] 打包密码验证工具...
call npm run build:verify
if errorlevel 1 (
    echo [ERROR] verify-password.exe 打包失败
    pause
    exit /b 1
)

REM 打包教师端
echo [INFO] 打包教师端安装包...
call npm run build:teacher
if errorlevel 1 (
    echo [ERROR] 教师端打包失败
    pause
    exit /b 1
)

REM 打包学生端
echo [INFO] 打包学生端安装包...
call npm run build:student
if errorlevel 1 (
    echo [ERROR] 学生端打包失败
    pause
    exit /b 1
)

REM 打包编辑器端
echo [INFO] 打包编辑器端安装包...
call npm run build:editor
if errorlevel 1 (
    echo [ERROR] 编辑器端打包失败
    pause
    exit /b 1
)

echo.
echo =========================================
echo [OK] 打包完成！
echo [OK] 教师端安装包: dist\teacher\
echo [OK] 学生端安装包: dist\student\
echo [OK] 编辑器端安装包: dist\editor\
echo =========================================
pause
