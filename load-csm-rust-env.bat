@echo off
rem KHONG dung setlocal — bien moi truong phai truyen sang csm_server.exe

if not defined CSM_HOME (
  set "CSM_HOME=%~dp0"
  if "%CSM_HOME:~-1%"=="\" set "CSM_HOME=%CSM_HOME:~0,-1%"
)

if not defined SERVER_PORT set "SERVER_PORT=9999"
if not defined SOCKET_SERVER_PORT set "SOCKET_SERVER_PORT=15301"
if not defined APP_DATA_DIR set "APP_DATA_DIR=%CSM_HOME%\csm_datas"
if not defined ROCKSDB_ROOT_DIR set "ROCKSDB_ROOT_DIR=%APP_DATA_DIR%\database"
if not defined ROCKSDB_BACKUP_DIR set "ROCKSDB_BACKUP_DIR=%APP_DATA_DIR%\backups"
if not defined LUCENE_INDEX_ROOT_DIR set "LUCENE_INDEX_ROOT_DIR=%APP_DATA_DIR%\lucene_index"
if not defined SERVER_HOST set "SERVER_HOST=0.0.0.0"
if not defined REDIS_ENABLED set "REDIS_ENABLED=0"
if not defined CSM_SKIP_STARTUP_DB_INIT set "CSM_SKIP_STARTUP_DB_INIT=1"
if not defined REDIS_HOST set "REDIS_HOST=127.0.0.1"
if not defined REDIS_PORT set "REDIS_PORT=6379"
if not defined JWT_SECRET set "JWT_SECRET=change-me-to-a-strong-secretge"

if exist "%CSM_HOME%\config.env" (
  for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%CSM_HOME%\config.env") do (
    if not "%%A"=="" if not "%%A"==" " set "%%A=%%B"
  )
)

if /I "%CSM_LOCAL_PROFILE%"=="8gb" (
  if exist "%CSM_HOME%\config.local-8gb.env" call :load_overlay "%CSM_HOME%\config.local-8gb.env"
)
if /I "%CSM_LOCAL_PROFILE%"=="strong" (
  if exist "%CSM_HOME%\config.local-strong.env" call :load_overlay "%CSM_HOME%\config.local-strong.env"
)

call :abs_path APP_DATA_DIR
call :abs_path ROCKSDB_ROOT_DIR
call :abs_path ROCKSDB_BACKUP_DIR
call :abs_path LUCENE_INDEX_ROOT_DIR

exit /b 0

:load_overlay
for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%~1") do (
  if not "%%A"=="" set "%%A=%%B"
)
exit /b 0

:abs_path
call set "_v=%%%~1%%"
if not defined _v exit /b 0
if "%_v:~0,2%"=="./" set "_v=%CSM_HOME%\%_v:~2%"
if "%_v:~0,2%"==".\" set "_v=%CSM_HOME%\%_v:~2%"
set "%~1=%_v%"
set "_v="
exit /b 0
