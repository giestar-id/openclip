@echo off
title OpenClip - Dual Worker Daemon
echo ============================================================
echo      Menjalankan OpenClip Dual Worker (Paralel)
echo ============================================================
cd /d "%~dp0worker"
echo Memeriksa diagnostic worker...
where uv >nul 2>nul && uv run python main.py --check || .venv\Scripts\python main.py --check
echo.
echo Memulai Dual Worker Loop (Project & Export Berjalan Bersamaan)...
where uv >nul 2>nul && uv run python main.py --mode all || .venv\Scripts\python main.py --mode all
pause

