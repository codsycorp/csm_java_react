@echo off
setlocal EnableExtensions EnableDelayedExpansion

rem ============================================================
rem  Go bo Windows Service CSM_Rust_Service
rem  Can quyen Administrator
rem  /silent — khong pause (goi tu install script)
rem ============================================================

set "SILENT=0"
if /I "%~1"=="/silent" set "SILENT=1"

net session >nul 2>&1
if errorlevel 1 (
  echo [LOI] Hay mo CMD/PowerShell "Run as administrator".
  if "%SILENT%"=="0" pause
  exit /b 1
)

set "CSM_HOME=%~dp0"
if "%CSM_HOME:~-1%"=="\" set "CSM_HOME=%CSM_HOME:~0,-1%"
set "SERVICE_NAME=CSM_Rust_Service"
set "NSSM_EXE="

if exist "%CSM_HOME%\nssm.exe" set "NSSM_EXE=%CSM_HOME%\nssm.exe"
if not defined NSSM_EXE if exist "%CSM_HOME%\tools\nssm.exe" set "NSSM_EXE=%CSM_HOME%\tools\nssm.exe"

sc query "%SERVICE_NAME%" >nul 2>&1
if errorlevel 1 (
  echo [INFO] Khong tim thay dich vu %SERVICE_NAME%.
  if "%SILENT%"=="0" pause
  exit /b 0
)

echo Dang dung %SERVICE_NAME%...
if defined NSSM_EXE (
  "%NSSM_EXE%" stop "%SERVICE_NAME%" confirm >nul 2>&1
) else (
  sc stop "%SERVICE_NAME%" >nul 2>&1
)

timeout /t 3 /nobreak >nul

taskkill /F /IM csm_server.exe >nul 2>&1
timeout /t 1 /nobreak >nul

if defined NSSM_EXE (
  echo Dang go bo bang NSSM...
  "%NSSM_EXE%" remove "%SERVICE_NAME%" confirm
) else (
  echo [WARN] Khong co nssm.exe — dung sc delete...
)

sc query "%SERVICE_NAME%" >nul 2>&1
if not errorlevel 1 (
  echo Dich vu van con — thu sc delete...
  sc stop "%SERVICE_NAME%" >nul 2>&1
  timeout /t 2 /nobreak >nul
  sc delete "%SERVICE_NAME%"
)

sc query "%SERVICE_NAME%" >nul 2>&1
if errorlevel 1 (
  echo [DONE] Da go bo %SERVICE_NAME%.
) else (
  echo [LOI] Khong the go bo %SERVICE_NAME%. Kiem tra services.msc hoac khoi dong lai may.
  if "%SILENT%"=="0" pause
  exit /b 1
)

if "%SILENT%"=="0" pause
exit /b 0
