@echo off
setlocal
cd /d "%~dp0"

echo.
echo  JNE OPS LEGUTI
echo  Menjalankan dashboard lokal...
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js tidak ditemukan. Silakan instal Node.js terlebih dahulu.
  echo https://nodejs.org/
  pause
  exit /b 1
)

if not exist "node_modules\next\dist\bin\next" (
  echo Dependensi belum tersedia. Menjalankan instalasi...
  call npm.cmd install
  if errorlevel 1 (
    echo Instalasi gagal. Periksa koneksi internet, lalu coba kembali.
    pause
    exit /b 1
  )
)

echo Dashboard akan tersedia di http://127.0.0.1:3000
echo Jangan tutup jendela ini selama dashboard digunakan.
echo.

start "" /b powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 4; Start-Process 'http://127.0.0.1:3000'"
call npm.cmd run dev

pause
endlocal
