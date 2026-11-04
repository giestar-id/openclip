@echo off
title OpenClip - Dual Worker Daemon
echo ============================================================
echo      Menjalankan OpenClip Dual Worker (Paralel)
echo ============================================================
cd /d "%~dp0worker"

if not exist ".venv" (
    echo [PERINGATAN] Virtual environment (.venv) belum dibuat!
    echo Menjalankan setup dependensi terlebih dahulu...
    where uv >nul 2>nul && uv sync || (python -m venv .venv && call .venv\Scripts\pip install -e .)
)

echo Memeriksa diagnostic worker...
where uv >nul 2>nul && uv run python main.py --check || .venv\Scripts\python main.py --check
if %errorlevel% neq 0 (
    echo.
    echo [PERINGATAN] Startup diagnostic mendeteksi masalah pada worker.
    echo Silakan periksa pesan kegagalan di atas.
    pause
)

echo.
echo Memulai Dual Worker Loop (Project dan Export Berjalan Bersamaan)...
where uv >nul 2>nul && uv run python main.py --mode all || .venv\Scripts\python main.py --mode all
pause
