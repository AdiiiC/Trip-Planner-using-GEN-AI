@echo off
setlocal
set ROOT=%~dp0

echo === TripMind - Windows Startup ===
echo.

:: ── Backend ──────────────────────────────────────────────────────────────────
echo [1/4] Installing backend dependencies...
cd /d "%ROOT%backend"
pip install -r requirements.txt
if errorlevel 1 (
    echo ERROR: pip install failed. Make sure Python 3.10+ is installed and on PATH.
    pause & exit /b 1
)

echo [2/4] Starting FastAPI backend on http://localhost:8000 ...
start "TripMind Backend" cmd /k "cd /d "%ROOT%backend" && python -m uvicorn main:app --reload --port 8000"

:: ── Frontend ─────────────────────────────────────────────────────────────────
echo [3/4] Installing frontend dependencies...
cd /d "%ROOT%frontend"
call npm install
if errorlevel 1 (
    echo ERROR: npm install failed. Make sure Node.js 18+ is installed.
    pause & exit /b 1
)

echo [4/4] Starting Next.js frontend on http://localhost:3000 ...
start "TripMind Frontend" cmd /k "cd /d "%ROOT%frontend" && npm run dev"

:: ── Done ─────────────────────────────────────────────────────────────────────
echo.
echo  TripMind is starting in two new windows:
echo    Frontend  -^>  http://localhost:3000
echo    Backend   -^>  http://localhost:8000
echo    API Docs  -^>  http://localhost:8000/docs
echo.
echo  Close those two windows to stop the servers.
pause
