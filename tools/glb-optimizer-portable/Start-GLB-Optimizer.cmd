@echo off
set "TOOL_DIR=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -File "%TOOL_DIR%GLB-Optimizer-UI.ps1"
