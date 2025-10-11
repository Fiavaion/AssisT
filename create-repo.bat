@echo off
REM AssisT GitHub Repository Creation (Batch Script)
REM Double-click this file or run: create-repo.bat

echo ========================================
echo AssisT GitHub Repository Setup
echo ========================================
echo.

cd /d "%~dp0"

set GH_PATH=C:\Program Files\GitHub CLI\gh.exe

if not exist "%GH_PATH%" (
    echo ERROR: GitHub CLI not found
    echo Please install: winget install --id GitHub.cli
    pause
    exit /b 1
)

echo Step 1: Authenticate with GitHub
echo ========================================
echo.

"%GH_PATH%" auth status >nul 2>&1
if errorlevel 1 (
    echo You need to authenticate with GitHub
    echo.
    echo Follow the prompts to login...
    echo.
    "%GH_PATH%" auth login
    if errorlevel 1 (
        echo.
        echo ERROR: Authentication failed
        pause
        exit /b 1
    )
) else (
    echo Already authenticated
)

echo.
echo Step 2: Create Private Repository
echo ========================================
echo.

set REPO_NAME=AssisT-EdTech
echo Repository: %REPO_NAME%
echo Visibility: Private
echo.

set /p CONFIRM="Create this repository? (Y/N): "

if /i "%CONFIRM%" neq "Y" (
    echo Repository creation cancelled
    pause
    exit /b 0
)

echo.
echo Creating private repository...
echo.

"%GH_PATH%" repo create %REPO_NAME% --private --source=. --description="Neuro-Adaptive EdTech Extension for Canvas VLE - TTS/STT accessibility for neurodivergent students" --push

if errorlevel 1 (
    echo.
    echo ERROR: Failed to create repository
    pause
    exit /b 1
)

echo.
echo ========================================
echo SUCCESS! Repository Created
echo ========================================
echo.

"%GH_PATH%" repo view --json url --jq .url > REPO_LINK.txt

echo Repository link saved to REPO_LINK.txt
echo.
echo Next steps:
echo   1. Run: npm install
echo   2. Create extension icons
echo   3. Begin Phase 1.2 development
echo.

type REPO_LINK.txt
echo.

pause
