@echo off
setlocal EnableExtensions
set "CSM_HOME=%~dp0"
if "%CSM_HOME:~-1%"=="\" set "CSM_HOME=%CSM_HOME:~0,-1%"
set "SERVICE_NAME=CSM_Rust_Service"

if exist "%CSM_HOME%\nssm.exe" (
  "%CSM_HOME%\nssm.exe" status "%SERVICE_NAME%"
) else (
  sc query "%SERVICE_NAME%"
)
echo.
echo Logs: %CSM_HOME%\logs\stderr.log
exit /b 0
