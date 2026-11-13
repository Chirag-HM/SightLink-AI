# SightLink AI — PowerShell Multi-Service Launcher
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "      Starting SightLink AI & BMTC Blind System         " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

# 1. Start FastAPI Backend
Write-Host "`n[1/2] Launching FastAPI Backend on http://127.0.0.1:8000..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; Write-Host '--- SightLink FastAPI Backend (Port 8000) ---' -ForegroundColor Green; py -m uvicorn ESP32_CAM_Test.volunteer_assistance.backend.main:app --host 0.0.0.0 --port 8000 --reload"

Start-Sleep -Seconds 2

# 2. Start Vite Frontend
Write-Host "[2/2] Launching React Frontend on http://localhost:5173..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\frontend\frontend'; Write-Host '--- SightLink Vite Frontend (Port 5173) ---' -ForegroundColor Cyan; npm run dev"

Write-Host "`nAll services have been launched in separate windows!" -ForegroundColor Green
Write-Host "  - Frontend Web App:  http://localhost:5173" -ForegroundColor White
Write-Host "  - Backend API:       http://127.0.0.1:8000" -ForegroundColor White
Write-Host "  - Interactive Docs:  http://127.0.0.1:8000/docs" -ForegroundColor White
Write-Host "  - Smart Stick IP:    http://10.206.152.89/status" -ForegroundColor White

