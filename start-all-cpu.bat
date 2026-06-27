@echo off
REM ACE-Step UI - CPU-only startup for Windows
REM For AMD Ryzen with integrated graphics / no dedicated GPU.
setlocal

echo ==================================
echo   ACE-Step Startup (CPU mode)
echo ==================================
echo.

REM --- Force CPU mode (no CUDA/ROCm acceleration) ---
REM Integrated Radeon (Vega) in Ryzen APUs is NOT supported by ROCm/PyTorch,
REM so generation runs on the CPU. The variables below hide the GPU and save memory.
set CUDA_VISIBLE_DEVICES=-1
set HIP_VISIBLE_DEVICES=-1
set ACESTEP_LM_BACKEND=pt
REM DiT-only: disables the heavy LLM (Thinking / AI Enhance) so it fits in ~16 GB RAM.
set ACESTEP_INIT_LLM=false
REM Run the VAE on CPU too (we have no usable GPU).
set ACESTEP_VAE_ON_CPU=1

if not exist "node_modules" (
    echo Error: UI dependencies not installed! Run install-cpu.bat first.
    pause
    exit /b 1
)
if not exist "server\node_modules" (
    echo Error: Server dependencies not installed! Run install-cpu.bat first.
    pause
    exit /b 1
)

REM --- Resolve ACE-Step engine path to an ABSOLUTE path ---
REM A relative path resolves differently for the API window (UI root) and the
REM backend window (the server\ folder), which breaks the Python fallback with
REM a spawn ...\env\Scripts\python.exe ENOENT error. Absolute path fixes that.
if not "%ACESTEP_PATH%"=="" goto :have_acestep
pushd "%~dp0.."
set "ACESTEP_BASE=%CD%"
popd
set "ACESTEP_PATH=%ACESTEP_BASE%\ACE-Step-1.5"
:have_acestep

if not exist "%ACESTEP_PATH%" (
    echo.
    echo Warning: ACE-Step engine not found at %ACESTEP_PATH%
    echo Run install-cpu.bat first, or set ACESTEP_PATH to the engine folder.
    echo Example: set ACESTEP_PATH=C:\ACE-Step-1.5
    pause
    exit /b 1
)

echo [+] Engine: %ACESTEP_PATH%

set API_COMMAND=
if exist "%ACESTEP_PATH%\python_embeded\python.exe" (
    echo [+] Detected Windows Portable Package
    set API_COMMAND=python_embeded\python acestep\api_server.py
) else (
    echo [+] Detected Standard Installation
    set API_COMMAND=uv run acestep-api --port 8001
)

echo.
echo   NOTE: CPU generation is slow. Loading the model in the API window can take
echo   several minutes. WAIT until that window says it is listening on port 8001
echo   BEFORE you press Create in the browser. The first track also takes a while.
echo.

REM Environment variables set above are inherited by child windows.
echo [1/3] Starting ACE-Step API server (CPU)...
start "ACE-Step API Server (CPU)" cmd /k "cd /d "%ACESTEP_PATH%" && %API_COMMAND%"

echo Waiting for API to initialize...
timeout /t 5 /nobreak >nul

echo [2/3] Starting backend server...
start "ACE-Step UI Backend" cmd /k "cd /d "%~dp0server" && npm run dev"

timeout /t 3 /nobreak >nul

echo [3/3] Starting frontend...
start "ACE-Step UI Frontend" cmd /k "cd /d "%~dp0" && npm run dev"

timeout /t 2 /nobreak >nul

echo.
echo ==================================
echo   All Services Running! (CPU mode)
echo ==================================
echo.
echo   ACE-Step API: http://localhost:8001
echo   Backend:      http://localhost:3001
echo   Frontend:     http://localhost:3000
echo.
echo   Close the terminal windows to stop the services.
echo.
timeout /t 3 /nobreak >nul
start http://localhost:3000
pause >nul
