@echo off
title OpenClip - Dedicated Export Worker
echo ============================================================
echo      Menjalankan Dedicated Export Worker (Khusus Ekspor)
echo ============================================================
cd /d "%~dp0worker"
echo Memulai Export Worker Loop... (Tekan Ctrl+C untuk berhenti)
where uv >nul 2>nul && uv run python main.py --mode export || .venv\Scripts\python main.py --mode export
pause

