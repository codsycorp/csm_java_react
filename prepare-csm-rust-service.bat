@echo off
setlocal EnableExtensions
rem Thu tu SACH truoc khi chay Rust service — tranh RocksDB lock voi Java
echo =====================================================
echo CHUAN BI CHAY CSM Rust (Admin)
echo =====================================================

set "CSM_HOME=%~dp0"
if "%CSM_HOME:~-1%"=="\" set "CSM_HOME=%CSM_HOME:~0,-1%"

echo [1/4] Dung Java backend (neu dang chay)...
sc stop CSM_Backend_Service >nul 2>&1

echo [2/4] Dung Rust service cu + kill process...
sc stop CSM_Rust_Service >nul 2>&1
taskkill /F /IM csm_server.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo [3/4] Kiem tra port...
netstat -ano | findstr ":9999" | findstr LISTENING && echo [WARN] Port 9999 dang bi chiem!
netstat -ano | findstr ":15301" | findstr LISTENING && echo [WARN] Port 15301 dang bi chiem!

echo [4/4] Kiem tra runtime DLL...
call "%CSM_HOME%\check-windows-runtime.bat"
if errorlevel 1 exit /b 1

echo.
echo [OK] San sang. Chay: install-csm-rust-service.bat
pause
