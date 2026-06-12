@echo off
setlocal EnableExtensions

set "CSM_HOME=%~dp0"
if "%CSM_HOME:~-1%"=="\" set "CSM_HOME=%CSM_HOME:~0,-1%"

set "EXE=%CSM_HOME%\csm_server.exe"
set "MISSING=0"

echo =====================================================
echo KIEM TRA RUNTIME MinGW
echo Thu muc: %CSM_HOME%
echo =====================================================

if not exist "%EXE%" (
  echo [LOI] Khong tim thay csm_server.exe
  pause
  exit /b 1
)

rem Goi day du tu build-windows-release.sh (bundle-mingw-runtime.sh)
for %%D in (
  libstdc++-6.dll
  libgcc_s_seh-1.dll
  libwinpthread-1.dll
  libatomic-1.dll
  libssp-0.dll
  libgfortran-5.dll
  libquadmath-0.dll
  libobjc-4.dll
) do (
  if exist "%CSM_HOME%\%%D" (
    echo [OK]  %%D
  ) else (
    echo [THIEU] %%D
    set "MISSING=1"
  )
)

echo.
if "%MISSING%"=="1" (
  echo [LOI] Thieu DLL — tren Mac chay lai:
  echo   cd backend-rust ^&^& ./build-windows-release.sh
  echo Copy csm_server.exe + tat ca lib*.dll sang thu muc nay.
  pause
  exit /b 1
)

echo [OK] Du runtime MinGW. Chay thu: start-csm-rust-service.bat
pause
exit /b 0
