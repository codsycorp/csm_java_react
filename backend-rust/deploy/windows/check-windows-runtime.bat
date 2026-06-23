@echo off
setlocal EnableExtensions
set "CSM_HOME=%~dp0"
if "%CSM_HOME:~-1%"=="\" set "CSM_HOME=%CSM_HOME:~0,-1%"

echo === CSM Rust Windows runtime check ===
echo CSM_HOME=%CSM_HOME%
echo.

set ERR=0

if not exist "%CSM_HOME%\csm_server.exe" (
  echo [LOI] Thieu csm_server.exe
  set ERR=1
)

if not exist "%CSM_HOME%\config.env" (
  echo [WARN] Thieu config.env — copy tu config.env.example
)

echo --- lib*.dll ---
set DLL_COUNT=0
for %%F in ("%CSM_HOME%\lib*.dll") do (
  echo   OK %%~nxF
  set /a DLL_COUNT+=1
)
if %DLL_COUNT%==0 (
  echo [LOI] Khong co lib*.dll — chay lai docker-build hoac bundle-mingw-runtime
  set ERR=1
)

if not exist "%CSM_HOME%\nssm.exe" (
  echo [WARN] Thieu nssm.exe — tai https://nssm.cc/download
)

if %ERR% neq 0 (
  echo.
  echo [FAIL] Runtime chua du
  exit /b 1
)
echo.
echo [OK] Runtime DLL co ban — co the cai service
exit /b 0
