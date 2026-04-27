@echo off
REM Beaver AI launcher (Windows). Double-click to run.
REM Equivalent shell scripts: Start-Beaver.command (macOS), Start-Beaver.sh (Linux).

setlocal enabledelayedexpansion
cd /d "%~dp0"

echo Beaver AI v0.1
echo.

if not exist node_modules (
  echo node_modules missing. Running pnpm install...
  call pnpm install
  if errorlevel 1 (
    echo pnpm install failed. Make sure pnpm is installed: https://pnpm.io
    pause
    exit /b 1
  )
)

if not exist .beaver (
  echo Initializing .beaver/ ...
  node --import=tsx packages\cli\src\bin.ts init
)

set /p GOAL="What should Beaver do? "
if "!GOAL!"=="" (
  echo No goal provided. Exiting.
  pause
  exit /b 1
)

REM Strip any inner double quotes the user may have typed; cmd.exe would
REM otherwise split the argument at them and commander would reject it.
set GOAL=!GOAL:"=!

echo.
echo Running: beaver run --no-server "!GOAL!"
echo.
node --import=tsx packages\cli\src\bin.ts run --no-server "!GOAL!"

echo.
pause
