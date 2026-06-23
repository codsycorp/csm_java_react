@echo off
setlocal EnableExtensions
set "CSM_HOME=%~dp0"
if "%CSM_HOME:~-1%"=="\" set "CSM_HOME=%CSM_HOME:~0,-1%"
set "SERVICE_NAME=CSM_Rust_Service"

net session >nul 2>&1
if errorlevel 1 (
  echo [LOI] Can quyen Administrator
  exit /b 1
)

if exist "%CSM_HOME%\nssm.exe" (
  "%CSM_HOME%\nssm.exe" stop "%SERVICE_NAME%" >nul 2>&1
  "%CSM_HOME%\nssm.exe" remove "%SERVICE_NAME%" confirm >nul 2>&1
)
sc stop "%SERVICE_NAME%" >nul 2>&1
sc delete "%SERVICE_NAME%" >nul 2>&1
echo [OK] Removed %SERVICE_NAME%
exit /b 0
