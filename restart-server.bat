@echo off
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul
node server.js
pause
