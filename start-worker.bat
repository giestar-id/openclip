@echo off
setlocal enabledelayedexpansion
title OpenClip AI Worker (Dual Engine)

set "BASE_DIR=%~dp0"
set "TOOLS_DIR=%BASE_DIR%tools"
set "WORKER_DIR=%BASE_DIR%worker"

if exist "%TOOLS_DIR%\node" set "PATH=%TOOLS_DIR%\node;!PATH!"
set "PATH=%USERPROFILE%\.local\bin;%USERPROFILE%\.cargo\bin;%LOCALAPPDATA%\hermes\bin;%LOCALAPPDATA%\Programs\Python\Python312;%LOCALAPPDATA%\Programs\Python\Python311;%LOCALAPPDATA%\Programs\Python\Python310;!PATH!"

echo ============================================================
echo      Menjalankan OpenClip AI Worker (Dual Engine)
echo ============================================================
cd /d "%WORKER_DIR%"

set "HAS_UV=0"
where uv >nul 2>nul
if %errorlevel% equ 0 set "HAS_UV=1"

echo.
echo Memulai Dual Worker Loop (Project dan Export Berjalan Bersamaan)...
if "!HAS_UV!"=="1" (
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
    echo Silakan periksa pesan error di atas.
    echo ============================================================
    set /p "DUMMY=Tekan [Enter] untuk menutup jendela ini: "
)
