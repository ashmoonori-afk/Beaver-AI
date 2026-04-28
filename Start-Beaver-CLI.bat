@echo off
REM Beaver AI legacy CLI launcher (Windows). Preserved for headless /
REM SSH / scripted workflows. Phase 4D.1 made the Tauri desktop shell
REM (Start-Beaver.bat) the default user-facing launcher.
REM
REM The PowerShell script owns UTF-8 input/output and logging.

setlocal
cd /d "%~dp0"
chcp 65001 >nul
powershell -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0Start-Beaver.ps1"
exit /b %ERRORLEVEL%
