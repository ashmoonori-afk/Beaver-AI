@echo off
REM Beaver AI launcher (Windows). Double-click to run.
REM Success closes automatically; failures stay open and are written to a log.

setlocal enabledelayedexpansion
cd /d "%~dp0"

set "LOG=%CD%\beaver-launcher-last.log"
> "%LOG%" echo Beaver AI launcher log
>> "%LOG%" echo Started: %DATE% %TIME%
>> "%LOG%" echo CWD: %CD%
>> "%LOG%" echo.

echo Beaver AI v0.1
echo Log: %LOG%
echo.

if not exist node_modules (
  echo node_modules missing. Running pnpm install...
  >> "%LOG%" echo $ pnpm install
  call pnpm install >> "%LOG%" 2>&1
  if errorlevel 1 goto fail
)

if not exist .beaver (
  echo Initializing .beaver/ ...
  >> "%LOG%" echo $ node --import=tsx packages\cli\src\bin.ts init
  node --import=tsx packages\cli\src\bin.ts init >> "%LOG%" 2>&1
  if errorlevel 1 goto fail
)

set /p GOAL="What should Beaver do? "
if "!GOAL!"=="" (
  echo No goal provided. Exiting.
  >> "%LOG%" echo No goal provided.
  pause
  exit /b 1
)

REM Strip any inner double quotes the user may have typed; cmd.exe would
REM otherwise split the argument at them and commander would reject it.
set GOAL=!GOAL:"=!
if not exist OUTPUT mkdir OUTPUT
set "RUN_GOAL=!GOAL! If you create standalone user-facing output files, place them under OUTPUT/ instead of the project root."

echo.
echo Running: beaver run --no-server --replace-active --auto-approve-final-review "!GOAL!"
echo Output folder: %CD%\OUTPUT
echo.
>> "%LOG%" echo $ node --import=tsx packages\cli\src\bin.ts run --no-server --replace-active --auto-approve-final-review "!RUN_GOAL!"
set "BEAVER_GOAL=!RUN_GOAL!"
set "BEAVER_LOG=%LOG%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "& { node --import=tsx packages\cli\src\bin.ts run --no-server --replace-active --auto-approve-final-review $env:BEAVER_GOAL 2>&1 | Tee-Object -FilePath $env:BEAVER_LOG -Append; exit $LASTEXITCODE }"
if errorlevel 1 goto fail

echo Done.
>> "%LOG%" echo Done.
echo Log saved: %LOG%
echo Closing in 10 seconds...
timeout /t 10 >nul
exit /b 0

:fail
echo.
echo Beaver failed. Full log is saved here:
echo %LOG%
echo.
type "%LOG%"
echo.
pause
exit /b 1
