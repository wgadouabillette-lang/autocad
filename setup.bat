@echo off
REM ============================================================
REM  Hall - Installation (Windows)
REM  Prerequis : Python 3.11+  et  Node.js 18+
REM ============================================================
setlocal

echo.
echo [1/3] Creation de l'environnement Python...
cd backend
where py >nul 2>nul && (py -m venv .venv) || (python -m venv .venv)
call .venv\Scripts\activate.bat

echo.
echo [2/3] Installation des dependances backend...
python -m pip install --upgrade pip
pip install -r requirements.txt
pip install -r requirements-cad.txt
cd ..

echo.
echo [3/3] Installation des dependances frontend...
cd frontend
call npm install
cd ..

echo.
echo ============================================================
echo  Installation terminee.
echo  Lancez   start.bat   pour demarrer Hall.
echo ============================================================
pause
