@echo off
REM Beaver AI launcher (Windows / Phase 4D.1).
REM
REM Replaces the terminal CLI prompt with the Tauri desktop shell. On
REM first run this builds the desktop binary (~5 min, one-off); on
REM subsequent runs the .exe boots in <200 ms.
REM
REM Pre-built installer / MSI lives at:
REM   packages\desktop\src-tauri\target\release\bundle\
REM Distribute that to end users so they don't need pnpm + Rust.
REM
REM Legacy CLI launcher (terminal prompt) is preserved at
REM Start-Beaver-CLI.bat for headless / SSH workflows.

setlocal
cd /d "%~dp0"
chcp 65001 >nul

set BEAVER_EXE=%~dp0packages\desktop\src-tauri\target\release\beaver-desktop.exe

if not exist "%BEAVER_EXE%" (
    echo Building Beaver desktop app for first run...
    echo This is a one-time build ^(~5 min^).
    call pnpm --filter @beaver-ai/desktop tauri build
    if errorlevel 1 (
        echo.
        echo Desktop build failed. Falling back to the legacy CLI launcher.
        call "%~dp0Start-Beaver-CLI.bat"
        exit /b %ERRORLEVEL%
    )
)

start "" "%BEAVER_EXE%"
exit /b 0
