@echo off
echo ================================================================
echo AssisT Extension - Force Reload Script
echo ================================================================
echo.
echo This script will help you force Chrome to reload the extension.
echo.
echo STEP 1: Close ALL Chrome windows
echo ----------------------------------------------------------------
echo Press any key AFTER you have closed all Chrome windows...
pause >nul
echo.
echo STEP 2: Open Chrome and follow these steps:
echo ----------------------------------------------------------------
echo 1. Type in address bar: chrome://extensions
echo 2. Find "AssisT: Adaptive Augmentative Tool"
echo 3. Click the REMOVE button (trash icon)
echo 4. Click "Load unpacked" button (top left)
echo 5. Navigate to: %CD%
echo 6. Click "Select Folder"
echo.
echo Press any key AFTER you have completed these steps...
pause >nul
echo.
echo STEP 3: Verify the extension loaded correctly
echo ----------------------------------------------------------------
echo 1. Open a new tab
echo 2. Press F12 to open DevTools
echo 3. Go to Console tab
echo 4. Look for these logs:
echo    - [AssisT] Content script loaded
echo    - [AssisT] Raw storage result: {...}
echo    - [AssisT] Settings loaded, TTS enabled: false
echo.
echo If you see "Raw storage result" log, the new version is loaded!
echo If you DON'T see it, the old version is still cached.
echo.
echo ================================================================
echo Extension reload process complete!
echo ================================================================
pause
