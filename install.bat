rem () { :; }; SCRIPT_DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd)"; exec bash "$SCRIPT_DIR/install.sh" "$@"; exit 0
@echo off
setlocal
title OpenClip - Setup Dependensi

echo Menjalankan setup dependensi OpenClip via unified launcher...
call "%~dp0start.bat" --install-only
echo.
set /p "DUMMY=Tekan [Enter] untuk menutup jendela: "
exit /b %errorlevel%
