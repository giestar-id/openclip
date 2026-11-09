rem () { :; }; SCRIPT_DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd)"; exec bash "$SCRIPT_DIR/start.command" "$@"; exit 0
@echo off
setlocal enabledelayedexpansion

:: 1. Deteksi direktori proyek (Aman terhadap spasi & path khusus)
set "BASE_DIR=%~dp0"
set "WEB_DIR=%BASE_DIR%web"
set "WORKER_DIR=%BASE_DIR%worker"
set "STORAGE_DIR=%BASE_DIR%storage"
set "TOOLS_DIR=%BASE_DIR%tools"

:: Tambahkan path umum tool Python, Node.js dan uv ke PATH sesi ini
set "PATH=%TOOLS_DIR%\node;%USERPROFILE%\.local\bin;%USERPROFILE%\.cargo\bin;%LOCALAPPDATA%\hermes\bin;%LOCALAPPDATA%\Programs\Python\Python312;%LOCALAPPDATA%\Programs\Python\Python311;%LOCALAPPDATA%\Programs\Python\Python310;C:\Program Files\nodejs;%LOCALAPPDATA%\Programs\nodejs;%PATH%"

:: -------------------------------------------------------------
:: ROUTING SUB-COMMAND STANDALONE (MENGGANTIKAN SEMUA FILE BAT TERPISAH)
:: -------------------------------------------------------------
if /i "%~1"=="web" goto :SUB_WEB
if /i "%~1"=="--web" goto :SUB_WEB
if /i "%~1"=="worker" goto :SUB_WORKER
if /i "%~1"=="--worker" goto :SUB_WORKER
if /i "%~1"=="export" goto :SUB_EXPORT
if /i "%~1"=="--export" goto :SUB_EXPORT
if /i "%~1"=="install" goto :SUB_INSTALL
if /i "%~1"=="--install" goto :SUB_INSTALL
if /i "%~1"=="--install-only" goto :SUB_INSTALL
if /i "%~1"=="-i" goto :SUB_INSTALL
if /i "%~1"=="check" goto :SUB_CHECK
if /i "%~1"=="--check" goto :SUB_CHECK
if /i "%~1"=="help" goto :SUB_HELP
if /i "%~1"=="--help" goto :SUB_HELP
if /i "%~1"=="-h" goto :SUB_HELP

title OpenClip - One-Click Launcher

echo ============================================================
echo             OPENCLIP - ONE-CLICK LAUNCHER
echo ============================================================
echo.

:: 2. Auto-deteksi apakah dependensi sudah lengkap
set "NEED_INSTALL=0"
if not exist "%WEB_DIR%\node_modules" set "NEED_INSTALL=1"
if not exist "%WORKER_DIR%\.venv" set "NEED_INSTALL=1"
if not exist "%WORKER_DIR%\.env" set "NEED_INSTALL=1"
if not exist "%WEB_DIR%\.env.local" set "NEED_INSTALL=1"
if not exist "%STORAGE_DIR%\projects" set "NEED_INSTALL=1"

if "!NEED_INSTALL!"=="1" goto :DO_INSTALL

:: Verifikasi apakah better-sqlite3 sudah terinstall dan valid
where node >nul 2>nul
if %errorlevel% neq 0 goto :DO_INSTALL

node -e "try { require('better-sqlite3'); } catch(e) { process.exit(1); }" >nul 2>nul
if %errorlevel% neq 0 goto :DO_INSTALL

echo [OK] Seluruh dependensi OpenClip sudah lengkap dan terverifikasi.
goto :RUN_APP

:SUB_INSTALL
set "INSTALL_ONLY=1"
goto :DO_INSTALL

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

:: Skenario A-1: Coba pasang otomatis via curl.exe + tar.exe (Cepat & Tanpa Hak Admin)
where curl.exe >nul 2>nul
if %errorlevel% equ 0 (
    echo Mengunduh Node.js LTS portable (~35 MB) via curl...
    if not exist "%TOOLS_DIR%\node" mkdir "%TOOLS_DIR%\node"
    curl.exe -fL --progress-bar -o "%TEMP%\node-lts.zip" "https://nodejs.org/dist/v20.18.0/node-v20.18.0-win-x64.zip" 2>nul
    if exist "%TEMP%\node-lts.zip" (
        where tar.exe >nul 2>nul
        if !errorlevel! equ 0 (
            tar.exe -xf "%TEMP%\node-lts.zip" -C "%TEMP%" 2>nul
        ) else (
            powershell -ExecutionPolicy ByPass -NoProfile -Command "Expand-Archive -Path '%TEMP%\node-lts.zip' -DestinationPath '%TEMP%' -Force" 2>nul
        )
        if exist "%TEMP%\node-v20.18.0-win-x64" (
            xcopy /E /I /Y /Q "%TEMP%\node-v20.18.0-win-x64\*" "%TOOLS_DIR%\node\" >nul 2>nul
            del /F /Q "%TEMP%\node-lts.zip" >nul 2>nul
            rmdir /S /Q "%TEMP%\node-v20.18.0-win-x64" >nul 2>nul
        )
    )
    set "PATH=%TOOLS_DIR%\node;!PATH!"
)

where node >nul 2>nul
if %errorlevel% equ 0 goto :NODE_OK

:: Skenario A-2: Coba pasang otomatis via winget jika tersedia
where winget >nul 2>nul
if %errorlevel% equ 0 (
    echo Mencoba memasang Node.js LTS via winget...
    winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    set "PATH=C:\Program Files\nodejs;%LOCALAPPDATA%\Programs\nodejs;!PATH!"
)

where node >nul 2>nul
if %errorlevel% equ 0 goto :NODE_OK

:: Skenario A-3: Coba unduh via PowerShell
echo [INFO] Mengunduh Node.js via PowerShell...
powershell -ExecutionPolicy ByPass -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $dest = '%TOOLS_DIR%\node'; if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Force -Path $dest | Out-Null }; $zip = Join-Path $env:TEMP 'node-lts.zip'; Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.18.0/node-v20.18.0-win-x64.zip' -OutFile $zip -UseBasicParsing; Expand-Archive -Path $zip -DestinationPath $env:TEMP -Force; $src = Join-Path $env:TEMP 'node-v20.18.0-win-x64'; Copy-Item -Path \"$src\*\" -Destination $dest -Recurse -Force; Remove-Item $zip -Force -ErrorAction SilentlyContinue; Remove-Item $src -Recurse -Force -ErrorAction SilentlyContinue;"
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
echo 2. Setelah instalasi selesai, tekan [Enter] di jendela ini
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
where curl.exe >nul 2>nul
if %errorlevel% equ 0 (
    curl.exe -LsSf https://astral.sh/uv/install.ps1 2>nul | powershell -ExecutionPolicy ByPass -NoProfile -Command - 2>nul
) else (
    powershell -ExecutionPolicy ByPass -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; irm https://astral.sh/uv/install.ps1 | iex" 2>nul
)
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

:: D. Setup Direktori Storage dan File .env (Defensif / Anti-Crash)
echo.
echo [4/6] Menyiapkan folder storage dan konfigurasi environment...
if not exist "%STORAGE_DIR%" mkdir "%STORAGE_DIR%"
if not exist "%STORAGE_DIR%\projects" mkdir "%STORAGE_DIR%\projects"
if not exist "%STORAGE_DIR%\exports" mkdir "%STORAGE_DIR%\exports"
if not exist "%STORAGE_DIR%\models" mkdir "%STORAGE_DIR%\models"
if not exist "%STORAGE_DIR%\models\face" mkdir "%STORAGE_DIR%\models\face"
if not exist "%BASE_DIR%database" mkdir "%BASE_DIR%database"
if not exist "%WEB_DIR%\public\fonts" mkdir "%WEB_DIR%\public\fonts"

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
    if !errorlevel! neq 0 (
        echo [PERINGATAN] npm install pertama gagal. Mencoba kembali dengan parameter bersih...
        call npm install --no-audit --no-fund --legacy-peer-deps
    )
) else (
    node -e "try { require('better-sqlite3'); } catch(e) { process.exit(1); }" >nul 2>nul
    if !errorlevel! neq 0 (
        echo Memperbarui paket native better-sqlite3...
        call npm rebuild better-sqlite3 >nul 2>nul
        node -e "try { require('better-sqlite3'); } catch(e) { process.exit(1); }" >nul 2>nul
        if !errorlevel! neq 0 (
            echo Mengunduh precompiled binary better-sqlite3 langsung...
            call npm install better-sqlite3@12.11.1 --save-exact --no-audit
        )
    )
)

:: F. Install Dependensi AI Worker (uv sync / pip)
echo.
echo [6/6] Menginstall dependensi AI Worker (Python)...
cd /d "%WORKER_DIR%"
if "!HAS_UV!"=="1" (
    call uv sync
    if !errorlevel! neq 0 (
        echo [PERINGATAN] uv sync mengalami kendala. Mencoba ulang...
        call uv sync --offline 2>nul || call uv sync
    )
) else (
    if not exist ".venv" python -m venv .venv
    call .venv\Scripts\pip install --upgrade pip
    call .venv\Scripts\pip install .
)

:: Unduh Font Subtitle jika belum ada (Non-Fatal jika offline)
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
    echo Mode install-only selesai. Tekan Enter untuk keluar.
    set /p "DUMMY=Tekan [Enter] untuk menutup: "
    exit /b 0
)

:RUN_APP
cd /d "%BASE_DIR%"

:: Periksa apakah port 3000 sedang dipakai aplikasi lain
set "APP_PORT=3000"
netstat -ano 2>nul | findstr ":3000 " | findstr "LISTENING" >nul 2>nul
if %errorlevel% equ 0 (
    echo [INFO] Port 3000 sedang digunakan oleh aplikasi lain di komputer ini.
    echo Next.js otomatis akan berjalan di port 3001.
    set "APP_PORT=3001"
)

echo [1/2] Menyalakan Web Server Next.js (Port !APP_PORT!)...
start "OpenClip Web Server (Port !APP_PORT!)" cmd /k ""%~f0" web !APP_PORT!"

echo [2/2] Menyalakan OpenClip AI Worker (Dual Engine)...
start "OpenClip AI Worker (Dual Engine)" cmd /k ""%~f0" worker"

echo.
echo Menunggu server siap dan membuka browser...
ping -n 4 127.0.0.1 >nul
start http://localhost:!APP_PORT!

echo.
echo ============================================================
echo   OpenClip Berjalan di: http://localhost:!APP_PORT!
echo.
echo   - Jendela 1: OpenClip Web Server (Next.js)
echo   - Jendela 2: OpenClip AI Worker Daemon (Transkrip, Crop dan Export)
echo.
echo   (Untuk mematikan sistem, cukup tutup kedua jendela CMD tersebut)
echo ============================================================
echo.
ping -n 5 127.0.0.1 >nul
exit /b 0

:: -------------------------------------------------------------
:: SUB-COMMAND: STANDALONE WEB SERVER
:: -------------------------------------------------------------
:SUB_WEB
set "PORT=%~2"
if "%PORT%"=="" set "PORT=3000"
title OpenClip Web Server (Port %PORT%)

echo ============================================================
echo      OpenClip Web Server (Next.js Turbopack - Port %PORT%)
echo ============================================================
echo.

cd /d "%WEB_DIR%"
call npm run dev -- -p %PORT%

if %errorlevel% neq 0 (
    echo.
    echo ============================================================
    echo [ERROR] Web Server terhenti atau mengalami kendala!
    echo ============================================================
    set /p "DUMMY=Tekan [Enter] untuk menutup jendela ini: "
)
exit /b %errorlevel%

:: -------------------------------------------------------------
:: SUB-COMMAND: STANDALONE DUAL AI WORKER
:: -------------------------------------------------------------
:SUB_WORKER
title OpenClip AI Worker (Dual Engine)

echo ============================================================
echo      Menjalankan OpenClip AI Worker (Dual Engine)
echo ============================================================
echo.

cd /d "%WORKER_DIR%"
where uv >nul 2>nul
if %errorlevel% equ 0 (
    call uv run python main.py --mode all
) else (
    if exist ".venv\Scripts\python.exe" (
        call .venv\Scripts\python.exe main.py --mode all
    ) else (
        call python main.py --mode all
    )
)

if %errorlevel% neq 0 (
    echo.
    echo ============================================================
    echo [ERROR] Worker Daemon terhenti atau mengalami kendala!
    echo ============================================================
    set /p "DUMMY=Tekan [Enter] untuk menutup jendela ini: "
)
exit /b %errorlevel%

:: -------------------------------------------------------------
:: SUB-COMMAND: STANDALONE DEDICATED EXPORT WORKER
:: -------------------------------------------------------------
:SUB_EXPORT
title OpenClip - Dedicated Export Worker

echo ============================================================
echo      Menjalankan Dedicated Export Worker (Khusus Ekspor)
echo ============================================================
echo.

cd /d "%WORKER_DIR%"
where uv >nul 2>nul
if %errorlevel% equ 0 (
    call uv run python main.py --mode export
) else (
    if exist ".venv\Scripts\python.exe" (
        call .venv\Scripts\python.exe main.py --mode export
    ) else (
        call python main.py --mode export
    )
)

if %errorlevel% neq 0 (
    echo.
    echo ============================================================
    echo [ERROR] Export Worker terhenti atau mengalami kendala!
    echo ============================================================
    set /p "DUMMY=Tekan [Enter] untuk menutup jendela ini: "
)
exit /b %errorlevel%

:: -------------------------------------------------------------
:: SUB-COMMAND: STANDALONE DIAGNOSTIC CHECK
:: -------------------------------------------------------------
:SUB_CHECK
title OpenClip - Startup Diagnostic Check

cd /d "%WORKER_DIR%"
where uv >nul 2>nul
if %errorlevel% equ 0 (
    call uv run python main.py --check
) else (
    if exist ".venv\Scripts\python.exe" (
        call .venv\Scripts\python.exe main.py --check
    ) else (
        call python main.py --check
    )
)
exit /b %errorlevel%

:: -------------------------------------------------------------
:: SUB-COMMAND: BANTUAN PENGGUNAAN
:: -------------------------------------------------------------
:SUB_HELP
echo ============================================================
echo             PANDUAN PERINTAH OPENCLIP LAUNCHER
echo ============================================================
echo   start.bat           : Menjalankan sistem lengkap 1-klik (Web + Worker + Browser)
echo   start.bat install   : Menyiapkan dan menginstall seluruh dependensi saja
echo   start.bat web [port]: Menjalankan Web Server saja (default port 3000)
echo   start.bat worker    : Menjalankan AI Worker ganda (transkrip + ekspor)
echo   start.bat export    : Menjalankan Dedicated Export Worker khusus ekspor
echo   start.bat check     : Menjalankan pemeriksaan diagnostik sistem
echo ============================================================
exit /b 0
