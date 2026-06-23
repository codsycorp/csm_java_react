@echo off
setlocal EnableExtensions
set "CSM_HOME=%~dp0"
if "%CSM_HOME:~-1%"=="\" set "CSM_HOME=%CSM_HOME:~0,-1%"
cd /d "%CSM_HOME%"

set "SERVICE_NAME=CSM_Rust_Service"
set "DISPLAY_NAME=CSM Rust Backend"
set "EXE=%CSM_HOME%\csm_server.exe"

echo === Install %SERVICE_NAME% ===

net session >nul 2>&1
if errorlevel 1 (
  echo [LOI] Can quyen Administrator
  exit /b 1
)

if not exist "%EXE%" (
  echo [LOI] Khong tim thay %EXE%
  exit /b 1
)
if not exist "%CSM_HOME%\nssm.exe" (
  echo [LOI] Dat nssm.exe vao %CSM_HOME%
  exit /b 1
)

call "%CSM_HOME%\check-windows-runtime.bat"
if errorlevel 1 exit /b 1

if not exist "%CSM_HOME%\config.env" (
  if exist "%CSM_HOME%\config.env.example" (
    copy /Y "%CSM_HOME%\config.env.example" "%CSM_HOME%\config.env" >nul
    echo [WARN] Tao config.env tu example — sua JWT_SECRET
  ) else (
    echo [LOI] Thieu config.env
    exit /b 1
  )
)

if not exist "%CSM_HOME%\logs" mkdir "%CSM_HOME%\logs"
if not exist "%CSM_HOME%\csm_datas" mkdir "%CSM_HOME%\csm_datas"

"%CSM_HOME%\nssm.exe" stop "%SERVICE_NAME%" >nul 2>&1
"%CSM_HOME%\nssm.exe" remove "%SERVICE_NAME%" confirm >nul 2>&1

"%CSM_HOME%\nssm.exe" install "%SERVICE_NAME%" "%EXE%"
"%CSM_HOME%\nssm.exe" set "%SERVICE_NAME%" DisplayName "%DISPLAY_NAME%"
"%CSM_HOME%\nssm.exe" set "%SERVICE_NAME%" AppDirectory "%CSM_HOME%"
"%CSM_HOME%\nssm.exe" set "%SERVICE_NAME%" AppStdout "%CSM_HOME%\logs\stdout.log"
"%CSM_HOME%\nssm.exe" set "%SERVICE_NAME%" AppStderr "%CSM_HOME%\logs\stderr.log"
"%CSM_HOME%\nssm.exe" set "%SERVICE_NAME%" AppRotateFiles 1
"%CSM_HOME%\nssm.exe" set "%SERVICE_NAME%" AppRotateBytes 10485760
"%CSM_HOME%\nssm.exe" set "%SERVICE_NAME%" Start SERVICE_AUTO_START
"%CSM_HOME%\nssm.exe" set "%SERVICE_NAME%" AppExit Default Restart
"%CSM_HOME%\nssm.exe" set "%SERVICE_NAME%" AppRestartDelay 5000
"%CSM_HOME%\nssm.exe" set "%SERVICE_NAME%" AppEnvironmentExtra "CSM_HOME=%CSM_HOME%" "RUST_LOG=info"

"%CSM_HOME%\nssm.exe" start "%SERVICE_NAME%"
timeout /t 3 /nobreak >nul
"%CSM_HOME%\nssm.exe" status "%SERVICE_NAME%"
echo.
echo [OK] Service %SERVICE_NAME% — logs: %CSM_HOME%\logs\
exit /b 0
