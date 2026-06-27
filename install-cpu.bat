@echo off
REM ACE-Step UI - CPU-only 1-click installer for Windows
REM For AMD Ryzen with integrated graphics, no dedicated GPU.
setlocal

echo ==========================================
echo   ACE-Step UI - CPU Installer for Windows
echo ==========================================
echo.

echo [1/6] Checking prerequisites...

where git >nul 2>nul
if errorlevel 1 goto :no_git
where node >nul 2>nul
if errorlevel 1 goto :no_node
where uv >nul 2>nul
if errorlevel 1 goto :no_uv

where ffmpeg >nul 2>nul
if errorlevel 1 echo [!] FFmpeg not found - tracks may show duration 0:00. Install it later from ffmpeg.org and add to PATH.

echo [+] Prerequisites OK.
echo.

set "ENGINE_DIR=..\ACE-Step-1.5"

echo [2/6] Getting ACE-Step 1.5 engine...
if exist "%ENGINE_DIR%\.git" goto :engine_ready
git clone https://github.com/ace-step/ACE-Step-1.5 "%ENGINE_DIR%"
if errorlevel 1 goto :clone_failed
goto :engine_cloned
:engine_ready
echo [+] Engine already present at %ENGINE_DIR%
:engine_cloned
echo.

echo [3/6] Installing engine with CPU PyTorch. This can take a while...
pushd "%ENGINE_DIR%"
if not exist ".venv" uv venv --python 3.11
uv pip install -e .
if errorlevel 1 goto :engine_install_failed
uv pip install --upgrade --force-reinstall "torchao<0.16"
uv pip install --force-reinstall torch torchaudio --index-url https://download.pytorch.org/whl/cpu
if errorlevel 1 goto :torch_failed
popd
echo [+] Engine ready - CPU mode.
echo.

echo [4/6] Installing UI frontend dependencies...
call npm install
if errorlevel 1 goto :frontend_failed
echo.

echo [5/6] Installing backend server dependencies...
pushd server
call npm install
if errorlevel 1 goto :server_failed
call npm run db:migrate
popd
echo.

echo [6/6] Verifying CPU PyTorch...
pushd "%ENGINE_DIR%"
uv run python -c "import torch; print('Torch', torch.__version__, 'CUDA available:', torch.cuda.is_available())"
popd
echo.

echo ==========================================
echo   Install complete!
echo   Next step: run  start-all-cpu.bat
echo ==========================================
pause
exit /b 0

:no_git
echo [X] Git not found. Install from https://git-scm.com/ and re-run.
goto :fail
:no_node
echo [X] Node.js not found. Install from https://nodejs.org/ and re-run.
goto :fail
:no_uv
echo [X] uv not found. Install it with: pip install uv
goto :fail
:clone_failed
echo [X] Failed to clone the engine.
goto :fail
:engine_install_failed
popd
echo [X] Engine install failed.
goto :fail
:torch_failed
popd
echo [X] CPU PyTorch install failed.
goto :fail
:frontend_failed
echo [X] Frontend npm install failed.
goto :fail
:server_failed
popd
echo [X] Server npm install failed.
goto :fail

:fail
echo.
echo Installation stopped. Fix the issue above and run install-cpu.bat again.
pause
exit /b 1
