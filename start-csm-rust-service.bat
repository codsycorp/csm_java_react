@echo off
setlocal EnableExtensions

if /I "%~1"=="/test" (
  set "CSM_TEST=1"
  shift
)

if not defined CSM_HOME (
  set "CSM_HOME=%~dp0"
  if "%CSM_HOME:~-1%"=="\" set "CSM_HOME=%CSM_HOME:~0,-1%"
)

call "%CSM_HOME%\load-csm-rust-env.bat"
if errorlevel 1 exit /b 1

set "CSM_RUST_EXE=%CSM_HOME%\csm_server.exe"
if not exist "%CSM_RUST_EXE%" (
  echo [LOI] Khong tim thay %CSM_RUST_EXE%
  echo Dat csm_server.exe cung cap voi csm_datas\ va config.env
  exit /b 1
)

if defined CSM_TEST (
  echo [TEST OK] CSM_HOME=%CSM_HOME%
  echo [TEST OK] APP_DATA_DIR=%APP_DATA_DIR%
  echo [TEST OK] SERVER_PORT=%SERVER_PORT%
  exit /b 0
)

cd /d "%CSM_HOME%"
if not exist "%CSM_HOME%\logs" mkdir "%CSM_HOME%\logs"
echo [%DATE% %TIME%] Starting csm_server.exe >> "%CSM_HOME%\logs\csm_rust_service.log"
"%CSM_RUST_EXE%"
set "EXIT_CODE=%ERRORLEVEL%"
echo [%DATE% %TIME%] Exit code %EXIT_CODE% >> "%CSM_HOME%\logs\csm_rust_service.log"
exit /b %EXIT_CODE%
