@echo off
REM Construit l'installateur Windows (NSIS) — à lancer sur Windows
setlocal
cd /d "%~dp0\.."

echo [1/4] Installation Electron...
if not exist desktop\.npm-cache mkdir desktop\.npm-cache
if not exist desktop\.electron-cache mkdir desktop\.electron-cache
set npm_config_cache=%CD%\desktop\.npm-cache
set ELECTRON_CACHE=%CD%\desktop\.electron-cache
cd desktop
call npm install --cache "%CD%\.npm-cache"
cd ..

echo [2/4] Generation de l'icone...
if exist backend\.venv\Scripts\python.exe (
  backend\.venv\Scripts\python.exe scripts\generate-app-icon.py
) else (
  python scripts\generate-app-icon.py
)

echo [3/4] Preparation des ressources...
node scripts\prepare-desktop-resources.cjs

echo [4/4] Construction installateur Windows...
set CSC_IDENTITY_AUTO_DISCOVERY=false
cd desktop
call npx electron-builder --win nsis
cd ..

echo.
echo Termine : desktop\release\Lyte Setup *.exe
endlocal
