@echo off
:: Chạy với quyền Administrator
set "SERVICE_NAME=CSM_Backend_Service"
set "PROJECT_DIR=D:\hldragon250725"
set "JAR_PREFIX=csm_server-"
set "NSSM_EXE=%PROJECT_DIR%\nssm.exe"

echo -----------------------------------------------------
echo DANG CAI DAT DICH VU: %SERVICE_NAME%
echo -----------------------------------------------------

:: Tìm file JAR mới nhất trong thư mục
for /f "delims=" %%i in ('dir /b /s "%PROJECT_DIR%\%JAR_PREFIX%*.jar" ^| findstr /v "original"') do (
    set "JAR_PATH=%%i"
    goto :found
)

:found
if not defined JAR_PATH (
    echo [LOI] Khong tim thay file %JAR_PREFIX%*.jar tai %PROJECT_DIR%
    pause
    exit /b
)

echo Tim thay JAR: %JAR_PATH%

:: Sử dụng NSSM để cài đặt dịch vụ
"%NSSM_EXE%" install "%SERVICE_NAME%" "java.exe"
"%NSSM_EXE%" set "%SERVICE_NAME%" AppDirectory "%PROJECT_DIR%"
"%NSSM_EXE%" set "%SERVICE_NAME%" AppParameters "-Xms512m -Xmx2g -Dfile.encoding=UTF-8 -jar \"%JAR_PATH%\" --spring.profiles.active=prod --server.port=15300"

:: Cấu hình Log (để anh dễ kiểm tra nếu có lỗi)
mkdir "%PROJECT_DIR%\logs" 2>nul
"%NSSM_EXE%" set "%SERVICE_NAME%" AppStdout "%PROJECT_DIR%\logs\windows_console.log"
"%NSSM_EXE%" set "%SERVICE_NAME%" AppStderr "%PROJECT_DIR%\logs\windows_error.log"

:: Cấu hình tự động khởi động lại nếu crash
"%NSSM_EXE%" set "%SERVICE_NAME%" AppExit Default Restart
"%NSSM_EXE%" set "%SERVICE_NAME%" AppThrottle 1500

:: Chạy dịch vụ ngay lập tức
"%NSSM_EXE%" start "%SERVICE_NAME%"

echo -----------------------------------------------------
echo [DONE] Dich vu %SERVICE_NAME% da duoc cai dat va khoi chay.
echo Anh co the quan ly trong 'services.msc'
echo -----------------------------------------------------
pause
