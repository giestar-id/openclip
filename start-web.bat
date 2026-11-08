@echo off
setlocal enabledelayedexpansion
title OpenClip Web Server (Port 3000)

set "BASE_DIR=%~dp0"
set "TOOLS_DIR=%BASE_DIR%tools"
set "WEB_DIR=%BASE_DIR%web"

:: Pastikan path tools/node dan nodejs selalu ada di PATH
if exist "%TOOLS_DIR%\node" set "PATH=%TOOLS_DIR%\node;!PATH!"
set "PATH=%USERPROFILE%\.local\bin;%USERPROFILE%\.cargo\bin;C:\Program Files\nodejs;%LOCALAPPDATA%\Programs\nodejs;!PATH!"

echo ============================================================
echo           OpenClip Web Server (Next.js Turbopack)
echo ============================================================
echo.

cd /d "%WEB_DIR%"
call npm run dev

if %errorlevel% neq 0 (
    echo.
    echo ============================================================
    echo [ERROR] Web Server terhenti atau mengalami kendala!
    echo Silakan periksa pesan error di atas.
    echo ============================================================
    set /p "DUMMY=Tekan [Enter] untuk menutup jendela ini: "
)
