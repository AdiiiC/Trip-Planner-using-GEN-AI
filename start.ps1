# TripMind – PowerShell startup script
# Run with:  .\start.ps1
# If blocked: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "=== TripMind - Windows (PowerShell) ===" -ForegroundColor Cyan

# ── Backend ───────────────────────────────────────────────────────────────────
Write-Host "`n[1/4] Installing backend dependencies..." -ForegroundColor Yellow
Set-Location "$Root\backend"
pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) { Write-Error "pip install failed"; exit 1 }

Write-Host "[2/4] Starting FastAPI backend on http://localhost:8000 ..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList `
    "-NoExit", "-Command", `
    "Set-Location '$Root\backend'; python -m uvicorn main:app --reload --port 8000" `
    -WindowStyle Normal

# ── Frontend ──────────────────────────────────────────────────────────────────
Write-Host "[3/4] Installing frontend dependencies..." -ForegroundColor Yellow
Set-Location "$Root\frontend"
npm install
if ($LASTEXITCODE -ne 0) { Write-Error "npm install failed"; exit 1 }

Write-Host "[4/4] Starting Next.js frontend on http://localhost:3000 ..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList `
    "-NoExit", "-Command", `
    "Set-Location '$Root\frontend'; npm run dev" `
    -WindowStyle Normal

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host "`n TripMind is starting in two new windows:" -ForegroundColor Green
Write-Host "   Frontend  ->  http://localhost:3000" -ForegroundColor White
Write-Host "   Backend   ->  http://localhost:8000" -ForegroundColor White
Write-Host "   API Docs  ->  http://localhost:8000/docs" -ForegroundColor White
Write-Host "`n Close those two windows to stop the servers.`n" -ForegroundColor Gray
