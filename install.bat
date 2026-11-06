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
    echo.
    echo ============================================================
    echo [ERROR] Node.js belum terpasang di komputer ini!
    echo ------------------------------------------------------------
    echo Solusi:
    echo   1. Unduh dan pasang Node.js ^(v18 ke atas^) dari: https://nodejs.org/
    echo   2. Setelah instalasi Node.js selesai, jalankan kembali install.bat.
    echo ============================================================
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v 2^>nul') do set "NODE_VER=%%v"
echo [OK] Node.js terdeteksi: !NODE_VER!

where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo ============================================================
    echo [ERROR] npm tidak terdeteksi!
    echo ------------------------------------------------------------
    echo Solusi: Pastikan instalasi Node.js Anda menyertakan npm.
    echo ============================================================
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('npm -v 2^>nul') do set "NPM_VER=%%v"
echo [OK] npm terdeteksi: v!NPM_VER!

:: 3. Cek Prasyarat: Python / uv
set "HAS_UV=0"
where uv >nul 2>nul
if %errorlevel% equ 0 (
    set "HAS_UV=1"
    for /f "tokens=*" %%v in ('uv --version 2^>nul') do set "UV_VER=%%v"
    echo [OK] Package manager modern Python terdeteksi: !UV_VER!
) else (
    where python >nul 2>nul
    if %errorlevel% neq 0 (
        echo.
        echo ============================================================
        echo [ERROR] Python maupun uv belum terpasang di komputer ini!
        echo ------------------------------------------------------------
        echo Solusi ^(pilih salah satu^):
        echo   1. Pasang uv ^(Sangat direkomendasikan, instalasi kilat^):
        echo      Buka PowerShell lalu jalankan:
        echo      powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
        echo   2. Atau pasang Python 3.10 - 3.12 dari: https://www.python.org/downloads/
        echo      ^(Centang 'Add Python to PATH' saat install^)
        echo ============================================================
        pause
        exit /b 1
    )
    for /f "tokens=*" %%v in ('python --version 2^>nul') do set "PY_VER=%%v"
    echo [INFO] Python terdeteksi: !PY_VER!
    echo [INFO] uv belum terpasang, mencoba memasang uv via pip agar instalasi cepat...
    python -m pip install --upgrade uv >nul 2>nul
    where uv >nul 2>nul
    if %errorlevel% equ 0 (
        set "HAS_UV=1"
        echo [OK] uv berhasil dipasang via pip.
    ) else (
        echo [INFO] Melanjutkan menggunakan Python virtual environment bawaan.
    )
)

:: 4. Cek Prasyarat: FFmpeg (Sistem vs Internal)
where ffmpeg >nul 2>nul
if %errorlevel% equ 0 (
    echo [OK] FFmpeg sistem terdeteksi di PATH.
) else (
    echo [INFO] FFmpeg sistem tidak ada di PATH.
    echo        OpenClip akan menggunakan binary FFmpeg internal bawaan ^(imageio-ffmpeg^) otomatis.
)

:: 5. Setup direktori storage & file .env dari template
echo.
echo [1/5] Memeriksa file konfigurasi dan folder storage...
if not exist "%STORAGE_DIR%" mkdir "%STORAGE_DIR%"
if not exist "%STORAGE_DIR%\projects" mkdir "%STORAGE_DIR%\projects"
if not exist "%STORAGE_DIR%\exports" mkdir "%STORAGE_DIR%\exports"
if not exist "%STORAGE_DIR%\models" mkdir "%STORAGE_DIR%\models"

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
) else (
    echo [OK] File .env.local web sudah ada.
)

:: 6. Install dependensi Web Frontend (Next.js) & Verifikasi better-sqlite3
echo.
echo [2/5] Menginstall dependensi Web Frontend (npm install)...
cd /d "%WEB_DIR%"
call npm install --no-audit --no-fund
if %errorlevel% neq 0 (
    echo.
    echo ============================================================
    echo [ERROR] Gagal menjalankan npm install pada folder web!
    echo ------------------------------------------------------------
    echo Kemungkinan penyebab:
    echo   1. Koneksi internet terputus saat mengunduh paket.
    echo   2. File cache npm korup.
    echo Solusi:
    echo   - Periksa koneksi internet Anda.
    echo   - Coba hapus folder '%WEB_DIR%\node_modules' jika ada, lalu jalankan kembali install.bat.
    echo ============================================================
    pause
    exit /b 1
)

:: Verifikasi native binary better-sqlite3
node -e "try { require('better-sqlite3'); } catch(e) { process.exit(1); }" >nul 2>nul
if %errorlevel% equ 0 (
    echo [OK] Modul native better-sqlite3 berhasil diverifikasi.
) else (
    echo [PERINGATAN] Modul better-sqlite3 belum siap untuk versi Node.js ini.
    echo Mencoba kompilasi ulang prebuild...
    call npm rebuild better-sqlite3
)

:: 7. Install dependensi AI Worker (Python)
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
    echo Menginstall paket worker...
    call .venv\Scripts\pip install --upgrade pip
    if exist "requirements.txt" (
        call .venv\Scripts\pip install -r requirements.txt
    ) else (
        call .venv\Scripts\pip install -e .
    )
)

if %errorlevel% neq 0 (
    echo.
    echo ============================================================
    echo [ERROR] Gagal menginstall dependensi worker Python!
    echo ------------------------------------------------------------
    echo Kemungkinan penyebab:
    echo   1. Koneksi internet terputus.
    echo   2. Versi Python tidak kompatibel ^(disarankan Python 3.10 - 3.12^).
    echo Solusi:
    echo   - Pastikan koneksi internet stabil.
    echo   - Pasang uv untuk isolasi lingkungan instan:
    echo     powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
    echo ============================================================
    pause
    exit /b 1
)

:: 8. Unduh font bawaan untuk subtitle
echo.
echo [4/5] Mengunduh dan memvalidasi font bawaan subtitle...
cd /d "%WORKER_DIR%"
if "%HAS_UV%"=="1" (
    call uv run python scripts/download_fonts.py
) else (
    call .venv\Scripts\python scripts/download_fonts.py
)
if %errorlevel% neq 0 (
    echo.
    echo [PERINGATAN] Sebagian font subtitle tidak dapat diunduh ^(koneksi internet lambat/offline^).
    echo   Aplikasi tetap dapat berjalan normal menggunakan font standar sistem.
    echo   Anda dapat mengunduh font nanti dengan: cd worker ^& uv run python scripts/download_fonts.py
    echo.
)

:: 9. Diagnostic & Inisialisasi Database
echo.
echo [5/5] Menjalankan startup diagnostic dan inisialisasi database SQLite...
cd /d "%WORKER_DIR%"
if "%HAS_UV%"=="1" (
    call uv run python main.py --check
) else (
    call .venv\Scripts\python main.py --check
)

if %errorlevel% neq 0 (
    echo.
    echo ============================================================
    echo [PERINGATAN] Diagnostik sistem mendeteksi kendala pada worker!
    echo ------------------------------------------------------------
    echo Silakan periksa detail baris [FAIL] di atas.
    echo Anda tetap dapat mencoba menjalankan aplikasi: start.bat
    echo ============================================================
    pause
    exit /b 1
)

echo.
echo ============================================================
echo   INSTALASI DAN SETUP SELESAI DENGAN SUKSES! (100%%)
echo ============================================================
echo Sekarang Anda bisa langsung menjalankan OpenClip:
echo   - Cukup klik ganda: start.bat
echo   - Web Server dan AI Worker akan langsung berjalan otomatis,
echo     dan browser Anda akan terbuka di http://localhost:3000
echo ============================================================
echo.
pause
