@echo off
setlocal enabledelayedexpansion
title OpenClip - Launcher

echo ============================================================
echo             OPENCLIP - ONE-CLICK LAUNCHER
echo ============================================================
echo.

:: 1. Deteksi direktori proyek
set "BASE_DIR=%~dp0"
set "WEB_DIR=%BASE_DIR%web"
set "WORKER_DIR=%BASE_DIR%worker"

:: 2. Auto-check jika belum install
if not exist "%WEB_DIR%\node_modules" (
    echo [INFO] Dependensi belum terpasang. Menjalankan auto installer terlebih dahulu...
    if exist "%BASE_DIR%install.bat" (
        call "%BASE_DIR%install.bat"
    )
)

echo [1/2] Menyalakan Web Server Next.js (Port 3000)...
start "OpenClip Web Server (Port 3000)" cmd /k "title OpenClip Web Server (Port 3000) && cd /d ""%WEB_DIR%"" && npm run dev"

echo [2/2] Menyalakan OpenClip AI Worker (Project dan Export)...
start "OpenClip AI Worker (Dual Engine)" cmd /k "title OpenClip AI Worker (Dual Engine) && cd /d ""%WORKER_DIR%"" && (where uv >nul 2>nul && uv run python main.py --mode all || .venv\Scripts\python main.py --mode all)"

echo.
echo Menunggu server siap (3 detik) dan membuka browser...
timeout /t 3 /nobreak >nul
start http://localhost:3000

echo.
echo ============================================================
echo   Kedua Server Sudah Berjalan Paralel di Jendela Terpisah!
echo   Aplikasi otomatis terbuka di: http://localhost:3000
echo.
echo   - Jendela 1: OpenClip Web Server (Next.js)
echo   - Jendela 2: OpenClip AI Worker Daemon (Transkrip, Crop dan Export)
echo.
echo   (Untuk mematikan sistem, cukup tutup kedua jendela CMD tersebut)
echo ============================================================
echo.
timeout /t 5 >nul
exit
