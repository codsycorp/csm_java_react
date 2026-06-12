@echo off
pushd "%~dp0..\..\.."
call "%CD%\uninstall-csm-rust-service.bat"
popd
