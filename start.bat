@echo off
setlocal enabledelayedexpansion
title OpenClip - One-Click Launcher

echo ============================================================
echo             OPENCLIP - ONE-CLICK LAUNCHER
echo ============================================================
echo.

:: 1. Deteksi direktori proyek
set "BASE_DIR=%~dp0"
set "WEB_DIR=%BASE_DIR%web"
set "WORKER_DIR=%BASE_DIR%worker"
set "STORAGE_DIR=%BASE_DIR%storage"
set "TOOLS_DIR=%BASE_DIR%tools"

:: Tambahkan path umum tool Python, Node.js dan uv ke PATH sesi ini
set "PATH=%TOOLS_DIR%\node;%USERPROFILE%\.local\bin;%USERPROFILE%\.cargo\bin;%LOCALAPPDATA%\hermes\bin;%LOCALAPPDATA%\Programs\Python\Python312;%LOCALAPPDATA%\Programs\Python\Python311;%LOCALAPPDATA%\Programs\Python\Python310;C:\Program Files\nodejs;%LOCALAPPDATA%\Programs\nodejs;%PATH%"

set "INSTALL_ONLY=0"
if "%~1"=="--install-only" set "INSTALL_ONLY=1"
if "%~1"=="-i" set "INSTALL_ONLY=1"

:: 2. Auto-deteksi apakah dependensi sudah lengkap
set "NEED_INSTALL=0"
if not exist "%WEB_DIR%\node_modules" set "NEED_INSTALL=1"
if not exist "%WORKER_DIR%\.venv" set "NEED_INSTALL=1"
if not exist "%WORKER_DIR%\.env" set "NEED_INSTALL=1"
if not exist "%WEB_DIR%\.env.local" set "NEED_INSTALL=1"
if not exist "%STORAGE_DIR%\projects" set "NEED_INSTALL=1"

if "%INSTALL_ONLY%"=="1" set "NEED_INSTALL=1"

if "!NEED_INSTALL!"=="1" goto :DO_INSTALL

:: Verifikasi apakah better-sqlite3 sudah terinstall dan valid
where node >nul 2>nul
if %errorlevel% neq 0 goto :DO_INSTALL

node -e "try { require('better-sqlite3'); } catch(e) { process.exit(1); }" >nul 2>nul
if %errorlevel% neq 0 goto :DO_INSTALL

echo [OK] Seluruh dependensi OpenClip sudah lengkap dan terverifikasi.
goto :RUN_APP

:DO_INSTALL
echo ============================================================
echo       MEMERIKSA DAN MENYIAPKAN DEPENDENSI OPENCLIP
echo ============================================================
echo.

:: A. Periksa / Pasang Node.js & npm secara otomatis
echo [1/6] Memeriksa Node.js dan npm...
where node >nul 2>nul
if %errorlevel% equ 0 goto :NODE_OK

echo [INFO] Node.js belum terdeteksi di komputer ini.
where winget >nul 2>nul
if %errorlevel% equ 0 (
    echo Mencoba memasang Node.js LTS via winget...
    winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    set "PATH=C:\Program Files\nodejs;%LOCALAPPDATA%\Programs\nodejs;!PATH!"
)

where node >nul 2>nul
if %errorlevel% equ 0 goto :NODE_OK

:: Fallback: Unduh Node.js LTS portable mandiri (Zero-Admin / Tanpa install manual)
echo [INFO] Mengunduh Node.js LTS portable otomatis (bebas hak administrator)...
powershell -ExecutionPolicy ByPass -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $dest = '%TOOLS_DIR%\node'; if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Force -Path $dest | Out-Null }; $zip = Join-Path $env:TEMP 'node-lts.zip'; Write-Host 'Mengunduh Node.js LTS (~35 MB)...'; Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.18.0/node-v20.18.0-win-x64.zip' -OutFile $zip; Write-Host 'Mengekstrak paket Node.js...'; Expand-Archive -Path $zip -DestinationPath $env:TEMP -Force; $src = Join-Path $env:TEMP 'node-v20.18.0-win-x64'; Copy-Item -Path \"$src\*\" -Destination $dest -Recurse -Force; Remove-Item $zip -Force -ErrorAction SilentlyContinue; Remove-Item $src -Recurse -Force -ErrorAction SilentlyContinue; Write-Host '[OK] Node.js portable siap!'"
set "PATH=%TOOLS_DIR%\node;!PATH!"

where node >nul 2>nul
if %errorlevel% equ 0 goto :NODE_OK

:WAIT_NODE_MANUAL
echo.
echo ============================================================
echo [INFO] Tidak dapat mengunduh Node.js secara otomatis.
echo Membuka halaman unduh resmi di browser...
start https://nodejs.org/
echo.
echo 1. Silakan unduh dan pasang Node.js LTS dari browser yang terbuka.
echo 2. Setelah instalasi selesai, tekan Enter di jendela ini
echo    untuk langsung melanjutkan setup OpenClip secara otomatis...
echo ============================================================
set /p "DUMMY=Tekan [Enter] untuk melanjutkan: "
set "PATH=%TOOLS_DIR%\node;C:\Program Files\nodejs;%LOCALAPPDATA%\Programs\nodejs;!PATH!"
where node >nul 2>nul
if %errorlevel% equ 0 goto :NODE_OK
echo.
echo [PERINGATAN] Node.js masih belum terdeteksi. Silakan selesaikan instalasi terlebih dahulu.
goto :WAIT_NODE_MANUAL

:NODE_OK
for /f "tokens=*" %%v in ('node -v 2^>nul') do echo [OK] Node.js terpasang: %%v

where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] npm tidak terdeteksi! Pastikan instalasi Node.js menyertakan npm.
    set /p "DUMMY=Tekan [Enter] untuk menutup jendela: "
    exit /b 1
)

:: B. Periksa / Pasang uv (Fast Python Package & Environment Manager)
echo.
echo [2/6] Memeriksa uv package manager...
where uv >nul 2>nul
if %errorlevel% equ 0 goto :UV_OK

echo [INFO] uv belum terpasang. Menginstall uv secara otomatis...
powershell -ExecutionPolicy ByPass -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm https://astral.sh/uv/install.ps1 | iex"
set "PATH=%USERPROFILE%\.local\bin;%USERPROFILE%\.cargo\bin;!PATH!"

where uv >nul 2>nul
if %errorlevel% equ 0 goto :UV_OK

:: Fallback coba pasang uv via pip jika python sudah ada
where python >nul 2>nul
if %errorlevel% equ 0 (
    python -m pip install --upgrade uv >nul 2>nul
)

:UV_OK
set "HAS_UV=0"
where uv >nul 2>nul
if %errorlevel% equ 0 (
    set "HAS_UV=1"
    for /f "tokens=*" %%v in ('uv --version 2^>nul') do echo [OK] uv terdeteksi: %%v
)

:: C. Periksa / Pasang Python
echo.
echo [3/6] Memeriksa Python...
where python >nul 2>nul
if %errorlevel% equ 0 (
    for /f "tokens=*" %%v in ('python --version 2^>nul') do echo [OK] Python sistem terdeteksi: %%v
    goto :PYTHON_OK
)

if "!HAS_UV!"=="1" (
    echo [INFO] Python belum terpasang di sistem.
    echo Mengunduh dan memasang Python 3.12 mandiri secara otomatis via uv...
    call uv python install 3.12
    if !errorlevel! equ 0 (
        echo [OK] Python 3.12 berhasil dipasang via uv.
        goto :PYTHON_OK
    )
)

echo.
echo ============================================================
echo [ERROR] Python tidak terdeteksi!
echo Silakan unduh Python 3.10 - 3.12 dari: https://www.python.org/
echo Pastikan centang 'Add Python to PATH' saat instalasi.
echo ============================================================
set /p "DUMMY=Tekan [Enter] untuk menutup jendela: "
exit /b 1

:PYTHON_OK

:: D. Setup Direktori Storage dan File .env
echo.
echo [4/6] Menyiapkan folder storage dan konfigurasi environment...
if not exist "%STORAGE_DIR%" mkdir "%STORAGE_DIR%"
if not exist "%STORAGE_DIR%\projects" mkdir "%STORAGE_DIR%\projects"
if not exist "%STORAGE_DIR%\exports" mkdir "%STORAGE_DIR%\exports"
if not exist "%STORAGE_DIR%\models" mkdir "%STORAGE_DIR%\models"

if not exist "%WORKER_DIR%\.env" (
    if exist "%WORKER_DIR%\.env.example" (
        copy "%WORKER_DIR%\.env.example" "%WORKER_DIR%\.env" >nul
        echo [OK] Dibuat worker/.env dari template
    )
)
if not exist "%WEB_DIR%\.env.local" (
    if exist "%WEB_DIR%\.env.example" (
        copy "%WEB_DIR%\.env.example" "%WEB_DIR%\.env.local" >nul
        echo [OK] Dibuat web/.env.local dari template
    )
)

:: E. Install Dependensi Web Frontend (npm install)
echo.
echo [5/6] Menginstall dependensi Web Frontend (npm install)...
cd /d "%WEB_DIR%"
if not exist "%WEB_DIR%\node_modules" (
    call npm install --no-audit --no-fund
) else (
    node -e "try { require('better-sqlite3'); } catch(e) { process.exit(1); }" >nul 2>nul
    if !errorlevel! neq 0 (
        echo Memperbarui paket native better-sqlite3...
        call npm rebuild better-sqlite3
    )
)

:: F. Install Dependensi AI Worker (uv sync / pip)
echo.
echo [6/6] Menginstall dependensi AI Worker (Python)...
cd /d "%WORKER_DIR%"
if "!HAS_UV!"=="1" (
    call uv sync
) else (
    if not exist ".venv" python -m venv .venv
    call .venv\Scripts\pip install --upgrade pip
    if exist "requirements.txt" (
        call .venv\Scripts\pip install -r requirements.txt
    ) else (
        call .venv\Scripts\pip install -e .
    )
)

:: Unduh Font Subtitle jika belum ada
if "!HAS_UV!"=="1" (
    call uv run python scripts/download_fonts.py >nul 2>nul
) else (
    call .venv\Scripts\python scripts/download_fonts.py >nul 2>nul
)

:: Startup Diagnostic Check
echo.
echo Menjalankan verifikasi akhir sistem...
if "!HAS_UV!"=="1" (
    call uv run python main.py --check
) else (
    call .venv\Scripts\python main.py --check
)

echo.
echo ============================================================
echo   SETUP DEPENDENSI SELESAI DENGAN SUKSES! (100%%)
echo ============================================================
echo.

if "%INSTALL_ONLY%"=="1" (
    echo Mode install-only selesai.
    exit /b 0
)

:RUN_APP
cd /d "%BASE_DIR%"

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

echo [1/2] Menyalakan Web Server Next.js (Port 3000)...
start "OpenClip Web Server (Port 3000)" cmd /k "title OpenClip Web Server (Port 3000) && set ""PATH=%TOOLS_DIR%\node;!PATH!"" && cd /d ""%WEB_DIR%"" && npm run dev"

echo [2/2] Menyalakan OpenClip AI Worker (Dual Engine)...
start "OpenClip AI Worker (Dual Engine)" cmd /k "title OpenClip AI Worker (Dual Engine) && set ""PATH=%TOOLS_DIR%\node;!PATH!"" && cd /d ""%WORKER_DIR%"" && !WORKER_CMD!"

echo.
echo Menunggu server siap (3 detik) dan membuka browser...
timeout /t 3 /nobreak >nul
start http://localhost:3000

echo.
echo ============================================================
echo   OpenClip Sudah Berjalan Paralel di Jendela Terpisah!
echo   Aplikasi terbuka di: http://localhost:3000
echo.
echo   - Jendela 1: OpenClip Web Server (Next.js)
echo   - Jendela 2: OpenClip AI Worker Daemon (Transkrip, Crop dan Export)
echo.
echo   (Untuk mematikan sistem, cukup tutup kedua jendela CMD tersebut)
echo ============================================================
echo.
timeout /t 5 >nul
exit /b 0
