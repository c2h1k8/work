@echo off
chcp 65001 > nul
cd /d "%~dp0"

set PORT=52700

:: ── すでにポートが使用中なら再起動しない ──
netstat -ano | findstr ":%PORT% " | findstr "LISTENING" > nul 2>&1
if %ERRORLEVEL% == 0 (
    start "" "http://localhost:%PORT%"
    exit /b 0
)

:: ── Python (python) を試みる ──
python --version > nul 2>&1
if %ERRORLEVEL% == 0 (
    powershell -ExecutionPolicy Bypass -WindowStyle Hidden -Command ^
        "Start-Process python -ArgumentList '-m','http.server','%PORT%' -WorkingDirectory '%CD%' -WindowStyle Hidden"
    timeout /t 1 /nobreak > nul
    start "" "http://localhost:%PORT%"
    exit /b 0
)

:: ── Python (python3) を試みる ──
python3 --version > nul 2>&1
if %ERRORLEVEL% == 0 (
    powershell -ExecutionPolicy Bypass -WindowStyle Hidden -Command ^
        "Start-Process python3 -ArgumentList '-m','http.server','%PORT%' -WorkingDirectory '%CD%' -WindowStyle Hidden"
    timeout /t 1 /nobreak > nul
    start "" "http://localhost:%PORT%"
    exit /b 0
)

:: ── Node.js を試みる ──
node --version > nul 2>&1
if %ERRORLEVEL% == 0 (
    powershell -ExecutionPolicy Bypass -WindowStyle Hidden -Command ^
        "Start-Process cmd -ArgumentList '/c npx --yes serve -p %PORT% .' -WorkingDirectory '%CD%' -WindowStyle Hidden"
    timeout /t 2 /nobreak > nul
    start "" "http://localhost:%PORT%"
    exit /b 0
)

:: ── どちらも見つからない ──
echo [ERROR] Python または Node.js が見つかりませんでした。
echo.
echo 以下のいずれかをインストールしてください:
echo   Python  : https://www.python.org/downloads/
echo   Node.js : https://nodejs.org/
echo.
pause
exit /b 1
