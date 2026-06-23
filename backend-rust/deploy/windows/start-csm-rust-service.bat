@echo off
setlocal EnableExtensions
set "CSM_HOME=%~dp0"
if "%CSM_HOME:~-1%"=="\" set "CSM_HOME=%CSM_HOME:~0,-1%"
cd /d "%CSM_HOME%"
if not exist "%CSM_HOME%\config.env" (
  echo [LOI] Thieu config.env
  exit /b 1
)
echo === Foreground run (Ctrl+C de dung) ===
"%CSM_HOME%\csm_server.exe"
exit /b %ERRORLEVEL%
