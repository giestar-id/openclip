@echo off
setlocal
title OpenClip - Setup Dependensi

echo Menjalankan setup dependensi OpenClip via unified launcher...
call "%~dp0start.bat" --install-only
echo.
set /p "DUMMY=Tekan [Enter] untuk menutup jendela: "
exit /b %errorlevel%
