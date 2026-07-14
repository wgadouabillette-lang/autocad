@echo off
REM Construit l'installateur Windows (NSIS) signé — à lancer sur Windows
setlocal
cd /d "%~dp0\.."

set FORMA_PROD_BUILD=1

echo [1/5] Installation Electron...
if not exist desktop\.npm-cache mkdir desktop\.npm-cache
if not exist desktop\.electron-cache mkdir desktop\.electron-cache
set npm_config_cache=%CD%\desktop\.npm-cache
set ELECTRON_CACHE=%CD%\desktop\.electron-cache
cd desktop
call npm install --cache "%CD%\.npm-cache"
cd ..

echo [2/5] Installation castlabs-evs...
if exist backend\.venv\Scripts\python.exe (
  backend\.venv\Scripts\python.exe -m pip install --upgrade pip castlabs-evs
) else (
  python -m pip install --upgrade pip castlabs-evs
)

echo [3/5] Generation de l'icone...
if exist backend\.venv\Scripts\python.exe (
  backend\.venv\Scripts\python.exe scripts\generate-app-icon.py
) else (
  python scripts\generate-app-icon.py
)

echo [4/5] Preparation des ressources...
set FORMA_PROD_BUILD=1
node scripts\prepare-desktop-resources.cjs

echo [5/5] Construction installateur Windows...
cd desktop
if defined AZURE_CODESIGN_ENDPOINT (
  echo Signature Azure Trusted Signing activee
) else if defined WIN_CSC_LINK (
  echo Signature Authenticode via WIN_CSC_LINK
) else (
  echo ATTENTION: aucune config de signature — installateur non signe.
  set CSC_IDENTITY_AUTO_DISCOVERY=false
)
call npx electron-builder --config electron-builder.config.cjs --win nsis
cd ..

echo.
echo Termine : desktop\release\Hall Setup *.exe
echo Copiez vers le site : scripts\prepare-landing-downloads.bat
endlocal
