@echo off
title ChromaStudy - Stop

echo =============================
echo   ChromaStudy - Stop Services
echo =============================

set KILLED=0

for /f "tokens=5" %%a in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":3001 "') do (
    echo [INFO] Stopping backend PID=%%a
    taskkill /PID %%a /F >nul 2>nul
    set KILLED=1
)

for /f "tokens=5" %%a in ('netstat -ano ^| findstr "LISTENING" ^| findstr ":5173 "') do (
    echo [INFO] Stopping frontend PID=%%a
    taskkill /PID %%a /F >nul 2>nul
    set KILLED=1
)

if "%KILLED%"=="0" (
    echo [INFO] No running services found
) else (
    echo [INFO] All services stopped
)
