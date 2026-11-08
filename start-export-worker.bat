@echo off
setlocal enabledelayedexpansion
title OpenClip - Dedicated Export Worker

echo ============================================================
echo      Menjalankan Dedicated Export Worker ^(Khusus Ekspor^)
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

echo Memulai Export Worker Loop... ^(Tekan Ctrl+C untuk berhenti^)
if "!HAS_UV!"=="1" (
    call uv run python main.py --mode export
) else (
    call .venv\Scripts\python.exe main.py --mode export
)

pause
