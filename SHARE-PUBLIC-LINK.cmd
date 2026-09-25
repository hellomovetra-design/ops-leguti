@echo off
setlocal
cd /d "%~dp0"

echo ===================================================
echo   MEMBUAT LINK PUBLIK INSTAN (CLOUDFLARE TUNNEL)
echo ===================================================
echo.
echo 1. Menjalankan dashboard di background...
start "" /b powershell.exe -NoProfile -WindowStyle Hidden -Command "npx next dev -H 127.0.0.1 -p 3000"

echo 2. Menghubungkan ke Cloudflare Tunnel publik...
echo Link publik HTTPS Anda akan muncul di bawah:
echo.

npx --yes cloudflared tunnel --url http://127.0.0.1:3000

pause
