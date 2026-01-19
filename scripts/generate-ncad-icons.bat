@echo off
REM Generate @NCAD icon set from atNCAD_Logo.png
REM Requires Python 3 and Pillow (PIL)

echo.
echo ======================================
echo   @NCAD Icon Generator
echo ======================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3 from https://www.python.org/
    pause
    exit /b 1
)

REM Check if Pillow is installed
python -c "import PIL" >nul 2>&1
if %errorlevel% neq 0 (
    echo Pillow (PIL) not found. Installing...
    echo.
    pip install Pillow
    if %errorlevel% neq 0 (
        echo ERROR: Failed to install Pillow
        pause
        exit /b 1
    )
)

REM Run the icon generation script
echo Running icon generation script...
echo.
python scripts\generate-ncad-icons.py

if %errorlevel% equ 0 (
    echo.
    echo ======================================
    echo   Icons generated successfully!
    echo ======================================
    echo.
    echo Next steps:
    echo   1. Run: npm run switch:ncad
    echo   2. Reload extension in Chrome
    echo.
) else (
    echo.
    echo ERROR: Icon generation failed
    echo.
)

pause
