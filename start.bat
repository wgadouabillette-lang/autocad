@echo off
REM ============================================================
REM  Hall - Demarrage (Windows)
REM  Ouvre 2 fenetres : backend (port 8000) + frontend (5173)
REM ============================================================
setlocal

start "Hall Backend" cmd /k "cd backend && call .venv\Scripts\activate.bat && uvicorn app.main:app --reload --port 8000"

timeout /t 3 /nobreak >nul

start "Hall Frontend" cmd /k "cd frontend && npm run dev"

timeout /t 4 /nobreak >nul
start "" http://localhost:5173

echo.
echo Hall demarre :
echo   - API      : http://127.0.0.1:8000/docs
echo   - Interface: http://localhost:5173
echo.
