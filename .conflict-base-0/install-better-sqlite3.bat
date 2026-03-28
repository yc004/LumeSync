@echo off
echo ========================================================
echo 安装 better-sqlite3
echo ========================================================
echo.

echo [1/3] 清理旧版本...
call npm remove better-sqlite3 sql.js
if %errorlevel% neq 0 (
    echo [!] 清理失败，继续安装...
)

echo.
echo [2/3] 安装 better-sqlite3...
call npm install better-sqlite3@9.4.3 --build-from-source
if %errorlevel% neq 0 (
    echo [✗] better-sqlite3 安装失败
    pause
    exit /b 1
)

echo.
echo [3/3] 测试安装...
node -e "try { const Database = require('better-sqlite3'); const db = new Database(':memory:'); console.log('✓ better-sqlite3 安装成功！'); console.log('  版本:', db.pragma('library_version', { simple: true })); db.close(); } catch(e) { console.error('✗ 安装测试失败:', e.message); process.exit(1); }"

if %errorlevel% neq 0 (
    echo [✗] better-sqlite3 测试失败
    pause
    exit /b 1
)

echo.
echo ========================================================
echo better-sqlite3 安装成功！
echo ========================================================
pause
