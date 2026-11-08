@echo off
setlocal
title OpenClip - Setup Dependensi

echo Menjalankan setup dependensi OpenClip via unified launcher...
call "%~dp0start.bat" --install-only
exit /b %errorlevel%
