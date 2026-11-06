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

:: 2. Auto-check jika dependensi belum terpasang
set "NEED_INSTALL=0"
if not exist "%WEB_DIR%\node_modules" set "NEED_INSTALL=1"
if not exist "%WORKER_DIR%\.venv" set "NEED_INSTALL=1"

if "!NEED_INSTALL!"=="1" (
    echo [INFO] Dependensi Web atau AI Worker belum terpasang lengkap.
    echo Menjalankan auto installer ^(install.bat^) terlebih dahulu...
    echo.
    if exist "%BASE_DIR%install.bat" (
        call "%BASE_DIR%install.bat"
    )
    if not exist "%WEB_DIR%\node_modules" (
        echo [ERROR] Folder node_modules belum terbentuk setelah instalasi.
        pause
        exit /b 1
    )
    if not exist "%WORKER_DIR%\.venv" (
        echo [ERROR] Virtual environment worker ^(.venv^) belum terbentuk setelah instalasi.
        pause
        exit /b 1
    )
)

:: 3. Verifikasi ketersediaan Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js belum terpasang atau tidak ada di PATH.
    echo Silakan jalankan install.bat terlebih dahulu!
    pause
    exit /b 1
)

:: 4. Deteksi perintah eksekusi worker
set "WORKER_CMD="
where uv >nul 2>nul
if %errorlevel% equ 0 (
    set "WORKER_CMD=uv run python main.py --mode all"
) else (
    if exist "%WORKER_DIR%\.venv\Scripts\python.exe" (
        set "WORKER_CMD=.venv\Scripts\python.exe main.py --mode all"
    ) else (
        set "WORKER_CMD=python main.py --mode all"
    )
)

echo [1/2] Menyalakan Web Server Next.js ^(Port 3000^)...
start "OpenClip Web Server (Port 3000)" cmd /k "title OpenClip Web Server (Port 3000) && cd /d ""%WEB_DIR%"" && npm run dev"

echo [2/2] Menyalakan OpenClip AI Worker ^(Project dan Export^)...
start "OpenClip AI Worker (Dual Engine)" cmd /k "title OpenClip AI Worker (Dual Engine) && cd /d ""%WORKER_DIR%"" && !WORKER_CMD!"

echo.
echo Menunggu server siap ^(3 detik^) dan membuka browser...
timeout /t 3 /nobreak >nul
start http://localhost:3000

echo.
echo ============================================================
echo   Kedua Server Sudah Berjalan Paralel di Jendela Terpisah!
echo   Aplikasi otomatis terbuka di: http://localhost:3000
echo.
echo   - Jendela 1: OpenClip Web Server ^(Next.js^)
echo   - Jendela 2: OpenClip AI Worker Daemon ^(Transkrip, Crop dan Export^)
echo.
echo   Catatan: Jika port 3000 sedang dipakai aplikasi lain,
echo   Next.js akan otomatis beralih ke http://localhost:3001.
echo.
echo   ^(Untuk mematikan sistem, cukup tutup kedua jendela CMD tersebut^)
echo ============================================================
echo.
timeout /t 5 >nul
exit
