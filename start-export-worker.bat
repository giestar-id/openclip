@echo off
title OpenClip - Dedicated Export Worker
echo ============================================================
echo      Menjalankan Dedicated Export Worker (Khusus Ekspor)
echo ============================================================
cd /d "%~dp0worker"

if not exist ".venv" (
    echo [PERINGATAN] Virtual environment (.venv) belum dibuat!
    echo Menjalankan setup dependensi terlebih dahulu...
    where uv >nul 2>nul && uv sync || (python -m venv .venv && call .venv\Scripts\pip install -e .)
)

echo Memulai Export Worker Loop... (Tekan Ctrl+C untuk berhenti)
where uv >nul 2>nul && uv run python main.py --mode export || .venv\Scripts\python main.py --mode export
pause
