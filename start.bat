@echo off
title 萤火课堂 Launcher
cls

echo ==========================================
echo   萤火课堂 Launcher
echo ==========================================
echo.

:: Check admin privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [INFO] Run as Administrator for best experience
    echo.
    pause
    cls
    echo ==========================================
    echo   萤火课堂 Launcher
    echo ==========================================
    echo.
)

:: Check Node.js
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Node.js not found
    echo.
    echo [INFO] Downloading Node.js installer...
    echo.

    curl -L -o "%TEMP%\nodejs-installer.msi" "https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi"

    if exist "%TEMP%\nodejs-installer.msi" (
        echo [INFO] Installing Node.js...
        start /wait msiexec /i "%TEMP%\nodejs-installer.msi" /qn /norestart

        call refreshenv.cmd 2>nul || set "PATH=%PATH%;C:\Program Files\nodejs"

        where node >nul 2>&1
        if %errorLevel% neq 0 (
            echo [ERROR] Installation failed
            echo [INFO] Download from: https://nodejs.org/
            pause
            exit /b 1
        )

        echo [OK] Node.js installed successfully
        del "%TEMP%\nodejs-installer.msi" 2>nul
    ) else (
        echo [ERROR] Download failed
        echo [INFO] Download from: https://nodejs.org/
        start https://nodejs.org/
        pause
        exit /b 1
    )

    echo.
) else (
    for /f "tokens=*" %%a in ('node --version') do set NODE_VERSION=%%a
    echo [OK] Node.js installed: %NODE_VERSION%
)

echo.

:: Check npm
where npm >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] npm not found
    pause
    exit /b 1
)

:: Change to script directory
cd /d "%~dp0"

:: Check package.json
if not exist "package.json" (
    echo [ERROR] package.json not found
    pause
    exit /b 1
)

:: Check node_modules
if not exist "node_modules" (
    echo [INFO] Installing dependencies...
    echo [INFO] This may take a few minutes...
    echo.
    call npm install

    if %errorLevel% neq 0 (
        echo [ERROR] Installation failed
        pause
        exit /b 1
    )

    echo [OK] Dependencies installed
    echo.
)

:: Download resources
if exist "download-resources.js" (
    echo [INFO] Checking external resources...
    node download-resources.js
    echo.
)

:: Create directories
if not exist "public\courses" mkdir "public\courses"
if not exist "public\lib" mkdir "public\lib"
if not exist "public\weights" mkdir "public\weights"

:: Get local IP
for /f "tokens=2 delims=[]" %%a in ('ping -4 -n 1 %COMPUTERNAME% ^| findstr "["') do set LOCAL_IP=%%a
if not defined LOCAL_IP (
    for /f "tokens=14" %%a in ('ipconfig ^| findstr "IPv4"') do set LOCAL_IP=%%a
)

cls
echo ==========================================
echo   萤火课堂 Launcher
echo ==========================================
echo.
echo [OK] Environment check complete
echo.
echo Server Info:
echo   Teacher: http://localhost:3000
echo   Student: http://%LOCAL_IP%:3000
echo.
echo Tips:
echo   - Teacher opens http://localhost:3000
echo   - Student opens http://%LOCAL_IP%:3000
echo   - Press Ctrl+C to stop server
echo.
echo ==========================================
echo.

:: Start server
node server.js

:: Server stopped
echo.
echo [INFO] Server stopped
pause
