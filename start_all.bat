@echo off
title SightLink AI Launcher
echo ========================================================
echo       Starting SightLink AI & BMTC Blind System
echo ========================================================
echo.

echo [1/2] Starting FastAPI Backend on http://127.0.0.1:8000 ...
start "SightLink Backend (Port 8000)" cmd /k "cd /d "%~dp0" && py -m uvicorn ESP32_CAM_Test.volunteer_assistance.backend.main:app --host 0.0.0.0 --port 8000 --reload"

timeout /t 2 >nul

echo [2/2] Starting React Frontend on http://localhost:5173 ...
start "SightLink Frontend (Port 5173)" cmd /k "cd /d "%~dp0frontend\frontend" && npm run dev"

echo.
echo ========================================================
echo  All services have been started in separate windows!
echo.
echo  - Frontend Web App:  http://localhost:5173
echo  - Backend API:       http://127.0.0.1:8000
echo  - Swagger API Docs:  http://127.0.0.1:8000/docs
echo  - Smart Stick IP:    http://10.206.152.89/status
echo ========================================================
echo.
pause

