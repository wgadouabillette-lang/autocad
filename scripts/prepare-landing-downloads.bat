@echo off
REM Copie l'installateur Windows vers landing/downloads/ avec un nom stable.
setlocal
cd /d "%~dp0\.."

set RELEASE_DIR=desktop\release
set OUT1=landing\downloads
set OUT2=landing\public\downloads
set WIN_NAME=Hall-windows.exe

if not exist "%RELEASE_DIR%" (
  echo Dossier %RELEASE_DIR% introuvable.
  echo Construisez d'abord : scripts\build-desktop-win.bat
  exit /b 1
)

for %%F in ("%RELEASE_DIR%\*.exe") do set WIN_SRC=%%F
if not defined WIN_SRC (
  echo Aucun .exe trouve dans %RELEASE_DIR%
  exit /b 1
)

mkdir "%OUT1%" 2>nul
mkdir "%OUT2%" 2>nul
copy /Y "%WIN_SRC%" "%OUT1%\%WIN_NAME%"
copy /Y "%WIN_SRC%" "%OUT2%\%WIN_NAME%"

echo Windows -^> %OUT1%\%WIN_NAME%
echo Windows -^> %OUT2%\%WIN_NAME%
echo.
echo Publiez ensuite : scripts\upload-desktop-downloads.sh ou deploy-landing
endlocal
