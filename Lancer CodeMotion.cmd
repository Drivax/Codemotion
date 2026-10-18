@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Environnement Python absent. Suivez l'installation dans README.md.
  pause
  exit /b 1
)
".venv\Scripts\python.exe" "scripts\run.py" --open %*
if errorlevel 1 pause
endlocal
