@echo off
setlocal EnableExtensions

set "CSM_HOME=%~dp0"
if "%CSM_HOME:~-1%"=="\" set "CSM_HOME=%CSM_HOME:~0,-1%"

echo =====================================================
echo CHAN DOAN CSM_Rust_Service
echo =====================================================

sc query CSM_Rust_Service 2>nul

echo.
echo --- Port 9999 (HTTP) ---
netstat -ano | findstr ":9999"

echo.
echo --- Port 15301 (Socket.IO) ---
netstat -ano | findstr ":15301"

echo.
echo --- Process csm_server.exe ---
tasklist | findstr /I csm_server.exe

echo.
echo --- stderr (15 dong cuoi) ---
if exist "%CSM_HOME%\logs\csm_rust_stderr.log" (
  powershell -NoProfile -Command "Get-Content -Path '%CSM_HOME%\logs\csm_rust_stderr.log' -Tail 15 -ErrorAction SilentlyContinue"
) else (
  echo [INFO] Chua co logs\csm_rust_stderr.log
)

echo.
echo --- service wrapper log (15 dong cuoi) ---
if exist "%CSM_HOME%\logs\csm_rust_service.log" (
  powershell -NoProfile -Command "Get-Content -Path '%CSM_HOME%\logs\csm_rust_service.log' -Tail 15 -ErrorAction SilentlyContinue"
)

echo.
echo Neu port bi chiem: doi SERVER_PORT / SOCKET_SERVER_PORT trong config.env
echo Neu RocksDB lock: taskkill /F /IM csm_server.exe roi cai lai service
pause
