@echo off
setlocal EnableExtensions EnableDelayedExpansion

rem  Vi du trien khai: D:\hldragon250725\csm_server.exe + config.env + csm_datas\
rem  CSM_HOME = thu muc chua file .bat nay (tu dong, khong can sua duong dan)

net session >nul 2>&1
if errorlevel 1 (
  echo [LOI] Hay mo CMD/PowerShell "Run as administrator".
  pause
  exit /b 1
)

set "CSM_HOME=%~dp0"
if "%CSM_HOME:~-1%"=="\" set "CSM_HOME=%CSM_HOME:~0,-1%"

set "SERVICE_NAME=CSM_Rust_Service"
set "SERVICE_DISPLAY=CSM Rust Backend"
set "SERVICE_DESC=CSM Server Rust — HTTP/Socket.IO, data csm_datas cung cap"
set "WRAPPER=%CSM_HOME%\start-csm-rust-service.bat"
set "EXE=%CSM_HOME%\csm_server.exe"
set "LOG_DIR=%CSM_HOME%\logs"
set "NSSM_EXE="

if exist "%CSM_HOME%\nssm.exe" set "NSSM_EXE=%CSM_HOME%\nssm.exe"
if not defined NSSM_EXE if exist "%CSM_HOME%\tools\nssm.exe" set "NSSM_EXE=%CSM_HOME%\tools\nssm.exe"

if not defined NSSM_EXE (
  echo [LOI] Khong tim thay nssm.exe trong %CSM_HOME%
  echo Tai: https://nssm.cc/download
  pause
  exit /b 1
)

if not exist "%EXE%" (
  echo [LOI] Khong tim thay csm_server.exe tai:
  echo   %EXE%
  echo.
  echo Build tren Mac: backend-rust\build-windows-release.sh
  echo Copy csm_server.exe + tat ca lib*.dll cung cap.
  pause
  exit /b 1
)

if not exist "%CSM_HOME%\libstdc++-6.dll" (
  echo [LOI] Thieu runtime MinGW ^(libstdc++-6.dll^).
  echo Chay check-windows-runtime.bat hoac build lai tren Mac.
  pause
  exit /b 1
)

if not exist "%WRAPPER%" (
  echo [LOI] Khong tim thay %WRAPPER%
  pause
  exit /b 1
)

if not exist "%CSM_HOME%\csm_datas" (
  echo [WARN] Chua co thu muc csm_datas — tao moi...
  mkdir "%CSM_HOME%\csm_datas" 2>nul
)

call "%CSM_HOME%\load-csm-rust-env.bat"

echo -----------------------------------------------------
echo CAI DAT DICH VU: %SERVICE_NAME%
echo Thu muc  : %CSM_HOME%
echo Binary   : %EXE%
echo Du lieu  : %APP_DATA_DIR%
echo HTTP     : %SERVER_PORT%   Socket.IO: %SOCKET_SERVER_PORT%
echo -----------------------------------------------------

sc query "%SERVICE_NAME%" >nul 2>&1
if not errorlevel 1 (
  echo Dich vu cu ton tai — tu dong go bo truoc khi cai lai...
  call "%~dp0uninstall-csm-rust-service.bat" /silent
)

echo Kiem tra chay thu truoc khi cai service...
call "%WRAPPER%" /test 2>nul
if errorlevel 1 (
  echo [WARN] Chua test duoc wrapper — tiep tuc cai dat.
)

mkdir "%LOG_DIR%" 2>nul
mkdir "%APP_DATA_DIR%\database" 2>nul
mkdir "%APP_DATA_DIR%\backups" 2>nul
mkdir "%APP_DATA_DIR%\lucene_index" 2>nul

rem Dung instance cu (tranh RocksDB lock / restart loop)
taskkill /F /IM csm_server.exe >nul 2>&1
timeout /t 2 /nobreak >nul

rem NSSM chay truc tiep exe (on dinh hon cmd /c bat)
"%NSSM_EXE%" install "%SERVICE_NAME%" "%EXE%"
if errorlevel 1 (
  echo [LOI] nssm install that bai.
  pause
  exit /b 1
)

"%NSSM_EXE%" set "%SERVICE_NAME%" DisplayName "%SERVICE_DISPLAY%"
"%NSSM_EXE%" set "%SERVICE_NAME%" Description "%SERVICE_DESC%"
"%NSSM_EXE%" set "%SERVICE_NAME%" AppDirectory "%CSM_HOME%"
"%NSSM_EXE%" set "%SERVICE_NAME%" Start SERVICE_AUTO_START
"%NSSM_EXE%" set "%SERVICE_NAME%" AppNoConsole 1
"%NSSM_EXE%" set "%SERVICE_NAME%" AppStdout "%LOG_DIR%\csm_rust_stdout.log"
"%NSSM_EXE%" set "%SERVICE_NAME%" AppStderr "%LOG_DIR%\csm_rust_stderr.log"
"%NSSM_EXE%" set "%SERVICE_NAME%" AppRotateFiles 1
"%NSSM_EXE%" set "%SERVICE_NAME%" AppRotateBytes 10485760
"%NSSM_EXE%" set "%SERVICE_NAME%" AppExit Default Restart
"%NSSM_EXE%" set "%SERVICE_NAME%" AppRestartDelay 30000
"%NSSM_EXE%" set "%SERVICE_NAME%" AppThrottle 120000
"%NSSM_EXE%" set "%SERVICE_NAME%" AppStopMethodSkip 0
"%NSSM_EXE%" set "%SERVICE_NAME%" AppStopMethodConsole 1500
"%NSSM_EXE%" set "%SERVICE_NAME%" AppStopMethodWindow 1500
"%NSSM_EXE%" set "%SERVICE_NAME%" AppStopMethodThreads 3000
rem NSSM env — SKIP DB init luc khoi dong (tranh crash RocksDB khi Java con chay)
"%NSSM_EXE%" set "%SERVICE_NAME%" AppEnvironmentExtra "CSM_HOME=%CSM_HOME%" "REDIS_ENABLED=0" "CSM_SKIP_STARTUP_DB_INIT=1"

echo Dang khoi dong dich vu...
"%NSSM_EXE%" start "%SERVICE_NAME%"
timeout /t 3 /nobreak >nul

sc query "%SERVICE_NAME%" | findstr /I "RUNNING" >nul
if errorlevel 1 (
  echo [WARN] Dich vu chua RUNNING — xem log:
  echo   %LOG_DIR%\csm_rust_stderr.log
  echo   %LOG_DIR%\csm_rust_stdout.log
  echo.
  echo Chay thu tay: start-csm-rust-service.bat
) else (
  echo [OK] Dich vu dang chay.
)

echo -----------------------------------------------------
echo [DONE] Service da cai dat.
echo Quan ly : services.msc
echo Log     : %LOG_DIR%\csm_rust_*.log
echo Go bo   : uninstall-csm-rust-service.bat
echo -----------------------------------------------------
pause
