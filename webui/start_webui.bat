@echo off
REM ============================================================
REM  ACE-Step Web UI launcher (Windows)
REM  Double-click this file, or run it from PowerShell/CMD.
REM ============================================================
cd /d "%~dp0"

REM ---- Settings (edit if needed) ----
if "%ACE_BASE_URL%"=="" set ACE_BASE_URL=http://localhost:8001
REM Uncomment and set your API key (or type it in the web UI instead):
REM set ACE_API_KEY=your-api-key
if "%PORT%"=="" set PORT=5000

echo.
echo Installing dependencies (flask, requests)...
python -m pip install -r requirements.txt
if errorlevel 1 (
  echo.
  echo [!] pip failed. Make sure Python 3 is installed and on PATH.
  pause
  exit /b 1
)

echo.
echo ============================================================
echo  Web UI:  http://localhost:%PORT%
echo  Backend: %ACE_BASE_URL%
echo ============================================================
echo.
python app.py
pause
