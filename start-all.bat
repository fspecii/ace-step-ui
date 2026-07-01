@echo off
REM ACE-Step UI Complete Startup Script for Windows
REM Starts ACE-Step API + Backend + Frontend
setlocal

echo ==================================
echo   ACE-Step Complete Startup
echo ==================================
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo Error: UI dependencies not installed!
    echo Please run setup.bat first.
    pause
    exit /b 1
)

if not exist "server\node_modules" (
    echo Error: Server dependencies not installed!
    echo Please run setup.bat first.
    pause
    exit /b 1
)

REM Get ACE-Step path from environment or use default
if "%ACESTEP_PATH%"=="" (
    set ACESTEP_PATH=..\ACE-Step-1.5
)

REM Check if ACE-Step exists
if not exist "%ACESTEP_PATH%" (
    echo.
    echo Warning: ACE-Step not found at %ACESTEP_PATH%
    echo.
    echo Please set ACESTEP_PATH or place ACE-Step-1.5 next to ace-step-ui
    echo Example: set ACESTEP_PATH=C:\ACE-Step-1.5
    echo.
    pause
    exit /b 1
)

REM Detect ACE-Step installation type
set API_COMMAND=
if exist "%ACESTEP_PATH%\python_embeded\python.exe" (
    echo [+] Detected Windows Portable Package
    set API_COMMAND=python_embeded\python -m acestep --port 8001 --enable-api --backend pt --server-name 127.0.0.1
) else (
    echo [+] Detected Standard Installation
    set API_COMMAND=uv run acestep --port 8001 --enable-api --backend pt --server-name 127.0.0.1
)

REM Get local IP for LAN access
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    for /f "tokens=1" %%b in ("%%a") do (
        set LOCAL_IP=%%b
    )
)

echo.
echo ==================================
echo   Starting All Services...
echo ==================================
echo.

REM Start ACE-Step Gradio server in new window
echo [1/3] Starting ACE-Step Gradio server...
start "ACE-Step Server" cmd /k "cd /d "%ACESTEP_PATH%" && %API_COMMAND%"

REM Wait for API to start
echo Waiting for API to initialize...
timeout /t 5 /nobreak >nul

REM Start backend in new window
echo [2/3] Starting backend server...
start "ACE-Step UI Backend" cmd /k "cd /d "%~dp0server" && npm run dev"

REM Wait for backend to start
echo Waiting for backend to start...
timeout /t 3 /nobreak >nul

REM Start frontend in new window
echo [3/3] Starting frontend...
start "ACE-Step UI Frontend" cmd /k "cd /d "%~dp0" && npm run dev"

REM Wait a moment
timeout /t 2 /nobreak >nul

echo.
echo ==================================
echo   All Services Running!
echo ==================================
echo.
echo   ACE-Step:     http://localhost:8001
echo   Backend:      http://localhost:3001
echo   Frontend:     http://localhost:3000
echo.
if defined LOCAL_IP (
    echo   LAN Access:   http://%LOCAL_IP%:3000
    echo.
)
echo   Close the terminal windows to stop all services.
echo.
echo ==================================
echo.
echo Opening browser...
timeout /t 3 /nobreak >nul
start http://localhost:3000

echo.
echo Press any key to close this window (services will keep running)
pause >nul
