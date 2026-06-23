@echo off
setlocal EnableExtensions
set "CSM_HOME=%~dp0"
if "%CSM_HOME:~-1%"=="\" set "CSM_HOME=%CSM_HOME:~0,-1%"
cd /d "%CSM_HOME%"
if exist "%CSM_HOME%\config.env" (
  for /f "usebackq tokens=1* delims==" %%A in ("%CSM_HOME%\config.env") do (
    set "line=%%A"
    if not "!line:~0,1!"=="#" (
      if not "%%A"=="" set "%%A=%%B"
    )
  )
)
echo CSM_HOME=%CSM_HOME%
