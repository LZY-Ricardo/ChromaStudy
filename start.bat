@echo off
title ChromaStudy Dev Server

set ROOT=%~dp0

echo =============================
echo   ChromaStudy Dev Server
echo =============================

where pnpm >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] pnpm not found. Run: npm install -g pnpm
    pause
    exit /b 1
)

if not exist "%ROOT%backend\node_modules" (
    echo [INFO] Installing backend dependencies...
    cd /d "%ROOT%backend" && pnpm install
)
if not exist "%ROOT%frontend\node_modules" (
    echo [INFO] Installing frontend dependencies...
    cd /d "%ROOT%frontend" && pnpm install
)

echo [INFO] Checking database migrations...
cd /d "%ROOT%backend" && npx prisma migrate deploy 2>nul

echo [INFO] Starting backend (port 3001)...
start "ChromaStudy Backend" cmd /k "cd /d "%ROOT%backend" && pnpm dev"

echo [INFO] Starting frontend (port 5173)...
start "ChromaStudy Frontend" cmd /k "cd /d "%ROOT%frontend" && pnpm dev"

echo.
echo =============================
echo   Frontend: http://localhost:5173
echo   Backend:  http://localhost:3001
echo   Close windows to stop
echo =============================
echo.

pause
