@echo off
setlocal enabledelayedexpansion
title OpenClip - Dedicated Export Worker

set "BASE_DIR=%~dp0"
set "TOOLS_DIR=%BASE_DIR%tools"
set "WORKER_DIR=%BASE_DIR%worker"

if exist "%TOOLS_DIR%\node" set "PATH=%TOOLS_DIR%\node;!PATH!"
set "PATH=%USERPROFILE%\.local\bin;%USERPROFILE%\.cargo\bin;%LOCALAPPDATA%\hermes\bin;%LOCALAPPDATA%\Programs\Python\Python312;%LOCALAPPDATA%\Programs\Python\Python311;%LOCALAPPDATA%\Programs\Python\Python310;!PATH!"

echo ============================================================
echo      Menjalankan Dedicated Export Worker (Khusus Ekspor)
echo ============================================================
cd /d "%WORKER_DIR%"

set "HAS_UV=0"
where uv >nul 2>nul
if %errorlevel% equ 0 set "HAS_UV=1"

echo.
echo Memulai Dedicated Export Worker Loop...
if "!HAS_UV!"=="1" (
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
    echo Silakan periksa pesan error di atas.
    echo ============================================================
    set /p "DUMMY=Tekan [Enter] untuk menutup jendela ini: "
)
