@echo off
REM Beaver AI launcher (Windows). Double-click to run.
REM The PowerShell script owns UTF-8 input/output and logging.

setlocal
cd /d "%~dp0"
chcp 65001 >nul
powershell -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0Start-Beaver.ps1"
exit /b %ERRORLEVEL%
