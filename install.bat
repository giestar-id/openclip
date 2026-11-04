@echo off
setlocal enabledelayedexpansion
title OpenClip - Auto Installer dan Setup

echo ============================================================
echo              OPENCLIP - AUTO INSTALLER
echo ============================================================
echo Script ini akan menyiapkan semua dependensi OpenClip
echo secara otomatis dalam satu langkah.
echo.

:: 1. Deteksi direktori proyek
set "BASE_DIR=%~dp0"
set "WEB_DIR=%BASE_DIR%web"
set "WORKER_DIR=%BASE_DIR%worker"
set "STORAGE_DIR=%BASE_DIR%storage"

:: 2. Cek Prasyarat: Node.js & npm
echo [0/5] Memeriksa prasyarat sistem...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js belum terpasang di komputer ini!
    echo Silakan unduh dan pasang Node.js ^(v18 ke atas^) dari: https://nodejs.org/
    echo Setelah instalasi Node.js selesai, jalankan kembali install.bat.
    pause
    exit /b 1
)

where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] npm tidak terdeteksi! Pastikan instalasi Node.js menyertakan npm.
    pause
    exit /b 1
)

:: 3. Cek Prasyarat: Python / uv
set "HAS_UV=0"
where uv >nul 2>nul
if %errorlevel% equ 0 (
    set "HAS_UV=1"
    echo [OK] Package manager modern Python ^(uv^) terdeteksi.
) else (
    where python >nul 2>nul
    if %errorlevel% neq 0 (
        echo [ERROR] Python maupun uv belum terpasang di komputer ini!
        echo Silakan pasang uv ^(sangat direkomendasikan^):
        echo   powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
        echo Atau pasang Python 3.10 - 3.12 dari: https://www.python.org/downloads/
        pause
        exit /b 1
    )
    echo [INFO] uv belum terpasang, mencoba memasang uv via pip agar instalasi cepat...
    python -m pip install --upgrade uv >nul 2>nul
    where uv >nul 2>nul
    if %errorlevel% equ 0 (
        set "HAS_UV=1"
        echo [OK] uv berhasil dipasang via pip.
    ) else (
        echo [INFO] Melanjutkan dengan Python bawaan.
    )
)

:: 4. Setup file .env dari template
echo.
echo [1/5] Memeriksa file konfigurasi .env...
if not exist "%WORKER_DIR%\.env" (
    if exist "%WORKER_DIR%\.env.example" (
        copy "%WORKER_DIR%\.env.example" "%WORKER_DIR%\.env" >nul
        echo [OK] Dibuat file %WORKER_DIR%\.env dari template .env.example
    )
) else (
    echo [OK] File .env worker sudah ada.
)

if not exist "%WEB_DIR%\.env.local" (
    if exist "%WEB_DIR%\.env.example" (
        copy "%WEB_DIR%\.env.example" "%WEB_DIR%\.env.local" >nul
        echo [OK] Dibuat file %WEB_DIR%\.env.local dari template .env.example
    )
)

:: 5. Install dependensi Web Frontend (Next.js)
echo.
echo [2/5] Menginstall dependensi Web Frontend (npm install)...
cd /d "%WEB_DIR%"
call npm install --no-audit --no-fund
if %errorlevel% neq 0 (
    echo [ERROR] Gagal menjalankan npm install pada folder web!
    pause
    exit /b 1
)

:: 6. Install dependensi AI Worker (Python)
echo.
echo [3/5] Menginstall dependensi AI Worker (Python)...
cd /d "%WORKER_DIR%"
if "%HAS_UV%"=="1" (
    echo Menjalankan uv sync...
    call uv sync
) else (
    if not exist ".venv" (
        echo Membuat virtual environment Python...
        python -m venv .venv
    )
    echo Menginstall paket via pip...
    call .venv\Scripts\pip install --upgrade pip
    call .venv\Scripts\pip install -e .
)

if %errorlevel% neq 0 (
    echo [ERROR] Gagal menginstall dependensi worker Python!
    pause
    exit /b 1
)

:: 7. Unduh font bawaan untuk subtitle
echo.
echo [4/5] Mengunduh & memvalidasi font bawaan subtitle...
cd /d "%WORKER_DIR%"
if "%HAS_UV%"=="1" (
    call uv run python scripts/download_fonts.py
) else (
    call .venv\Scripts\python scripts/download_fonts.py
)

:: 8. Diagnostic & Inisialisasi Database
echo.
echo [5/5] Menjalankan startup diagnostic dan inisialisasi database SQLite...
cd /d "%WORKER_DIR%"
if "%HAS_UV%"=="1" (
    call uv run python main.py --check
) else (
    call .venv\Scripts\python main.py --check
)

echo.
echo ============================================================
echo   INSTALASI & SETUP SELESAI DENGAN SUKSES! (100%%)
echo ============================================================
echo Sekarang Anda bisa langsung menjalankan OpenClip:
echo   - Cukup klik ganda: start.bat
echo   - Web Server dan AI Worker akan langsung berjalan otomatis,
echo     dan browser Anda akan terbuka di http://localhost:3000
echo ============================================================
echo.
pause
