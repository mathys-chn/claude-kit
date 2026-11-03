@echo off
rem claude-kit · installation en double-clic (Windows)
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js n'est pas installe. Telecharge-le sur https://nodejs.org ^(version LTS^), puis relance ce fichier.
  echo.
  pause
  exit /b 1
)
node install.js %*
echo.
pause
