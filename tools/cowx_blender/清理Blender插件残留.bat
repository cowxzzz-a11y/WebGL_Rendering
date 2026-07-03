@echo off
title Blender Addon Cleaner
echo ==================================================
echo         Blender Addon Clean Tool
echo ==================================================
echo.

set "BLENDER_DIR=%APPDATA%\Blender Foundation\Blender"

echo Checking Blender folder: "%BLENDER_DIR%"
if not exist "%BLENDER_DIR%" (
    echo [WARNING] Blender folder not found. Nothing to clean.
    echo.
    goto :end
)

echo.
echo Cleaning addon residue files...
echo.

:: Loop through possible Blender versions
for %%v in (2.80 2.81 2.82 2.83 2.90 2.91 2.92 2.93 3.0 3.1 3.2 3.3 3.4 3.5 3.6 4.0 4.1 4.2 4.3 5.0 5.1 5.2 5.3 5.4 5.5) do (
    if exist "%APPDATA%\Blender Foundation\Blender\%%v\scripts\addons" (
        call :clean_version "%%v"
    )
)

echo.
echo ==================================================
echo Clean process completed!
echo You can now reinstall cowx.zip in Blender.
echo ==================================================
echo.

:end
pause
goto :eof

:clean_version
set "v=%~1"
set "addons=%APPDATA%\Blender Foundation\Blender\%v%\scripts\addons"

if exist "%addons%\__init__.py" (
    echo [DELETE] "%addons%\__init__.py"
    del /f /q "%addons%\__init__.py"
)
if exist "%addons%\cowx" (
    echo [DELETE] "%addons%\cowx"
    rd /s /q "%addons%\cowx"
)
goto :eof
