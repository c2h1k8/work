@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

set PORT=52700
set FOUND=0

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT% " ^| findstr "LISTENING"') do (
    taskkill /f /pid %%a > nul 2>&1
    set FOUND=1
)

if !FOUND! == 1 (
    echo サーバーを停止しました。
) else (
    echo ポート %PORT% で起動中のサーバーが見つかりませんでした。
)

timeout /t 2 /nobreak > nul
