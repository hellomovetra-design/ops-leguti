@echo off
cd /d "%~dp0"
echo Menjalankan dashboard dengan npm run dev...
echo Buka: http://127.0.0.1:3000/login
echo.
call npm.cmd run dev
pause
