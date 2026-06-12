@echo off
setlocal EnableExtensions

set "CSM_HOME=%~dp0"
if "%CSM_HOME:~-1%"=="\" set "CSM_HOME=%CSM_HOME:~0,-1%"
set "SERVICE_NAME=CSM_Rust_Service"

echo =====================================================
echo TRANG THAI: %SERVICE_NAME%
echo =====================================================

sc query "%SERVICE_NAME%" 2>nul
if errorlevel 1 (
  echo [INFO] Dich vu chua duoc cai dat.
) else (
  echo.
)

call "%CSM_HOME%\start-csm-rust-service.bat" /test
echo.

if exist "%CSM_HOME%\logs\csm_rust_stderr.log" (
  echo --- stderr log (10 dong cuoi) ---
  powershell -NoProfile -Command "Get-Content -Path '%CSM_HOME%\logs\csm_rust_stderr.log' -Tail 10 -ErrorAction SilentlyContinue"
  echo.
)

if exist "%CSM_HOME%\logs\csm_rust_stdout.log" (
  echo --- stdout log (10 dong cuoi) ---
  powershell -NoProfile -Command "Get-Content -Path '%CSM_HOME%\logs\csm_rust_stdout.log' -Tail 10 -ErrorAction SilentlyContinue"
)

pause
