@echo off
setlocal enabledelayedexpansion
title OpenClip - Dual Worker Daemon

echo ============================================================
echo      Menjalankan OpenClip Dual Worker ^(Paralel^)
echo ============================================================
if exist "%~dp0tools\node" set "PATH=%~dp0tools\node;!PATH!"
cd /d "%~dp0worker"

set "HAS_UV=0"
where uv >nul 2>nul
if %errorlevel% equ 0 set "HAS_UV=1"

if not exist ".venv" (
    echo [PERINGATAN] Virtual environment ^(.venv^) belum dibuat!
    echo Menjalankan setup dependensi terlebih dahulu...
    if "!HAS_UV!"=="1" (
        call uv sync
    ) else (
        python -m venv .venv
        call .venv\Scripts\pip install --upgrade pip
        if exist "requirements.txt" (
            call .venv\Scripts\pip install -r requirements.txt
        ) else (
            call .venv\Scripts\pip install -e .
        )
    )
)

echo Memeriksa diagnostic worker...
if "!HAS_UV!"=="1" (
    call uv run python main.py --check
) else (
    call .venv\Scripts\python.exe main.py --check
)

if %errorlevel% neq 0 (
    echo.
    echo ============================================================
    echo [PERINGATAN] Startup diagnostic mendeteksi masalah pada worker.
    echo Silakan periksa pesan kegagalan di atas.
    echo ============================================================
    pause
)

echo.
echo Memulai Dual Worker Loop ^(Project dan Export Berjalan Bersamaan^)...
if "!HAS_UV!"=="1" (
    call uv run python main.py --mode all
) else (
    call .venv\Scripts\python.exe main.py --mode all
)

pause
