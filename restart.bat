@echo off
title ChromaStudy - Restart

set ROOT=%~dp0

echo =============================
echo   ChromaStudy - Restart Services
echo =============================

for /f "tokens=5" %%a in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":3001 "') do (
    echo [INFO] Stopping backend PID=%%a
    taskkill /PID %%a /F >nul 2>nul
)

for /f "tokens=5" %%a in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":5173 "') do (
    echo [INFO] Stopping frontend PID=%%a
    taskkill /PID %%a /F >nul 2>nul
)

echo [INFO] Waiting for ports to release...
ping -n 3 127.0.0.1 >nul

echo [INFO] Restarting services...
echo.

start "ChromaStudy Backend" cmd /k "cd /d "%ROOT%backend" && pnpm dev"
start "ChromaStudy Frontend" cmd /k "cd /d "%ROOT%frontend" && pnpm dev"

echo =============================
echo   Frontend: http://localhost:5173
echo   Backend:  http://localhost:3001
echo   Close windows to stop
echo =============================
echo.

pause
