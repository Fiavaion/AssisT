@echo off
REM ============================================================
REM AssisT Icon Generation Script (Windows)
REM Generates all required icon sizes from source image
REM ============================================================

echo.
echo ========================================
echo AssisT Icon Generator
echo ========================================
echo.

REM Check if ImageMagick is installed
where magick >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: ImageMagick not found!
    echo.
    echo Please install ImageMagick from:
    echo https://imagemagick.org/script/download.php#windows
    echo.
    echo Or use the online tool method in ICON_GUIDE.md
    pause
    exit /b 1
)

echo [1/5] Checking source image...
if not exist "..\TestingImages\Gemini_Generated_Image_2noq1j2noq1j2noq.png" (
    echo ERROR: Source image not found!
    echo Expected: ..\TestingImages\Gemini_Generated_Image_2noq1j2noq1j2noq.png
    pause
    exit /b 1
)
echo     Source image found!

echo.
echo [2/5] Creating output directory...
if not exist "..\public\icons" mkdir "..\public\icons"
echo     Output directory ready: ..\public\icons

echo.
echo [3/5] Generating extension icons...

REM Generate required sizes with high quality
magick "..\TestingImages\Gemini_Generated_Image_2noq1j2noq1j2noq.png" -resize 16x16 -quality 100 "..\public\icons\icon16.png"
if %errorlevel% neq 0 goto :error
echo     [OK] icon16.png (16x16)

magick "..\TestingImages\Gemini_Generated_Image_2noq1j2noq1j2noq.png" -resize 32x32 -quality 100 "..\public\icons\icon32.png"
if %errorlevel% neq 0 goto :error
echo     [OK] icon32.png (32x32)

magick "..\TestingImages\Gemini_Generated_Image_2noq1j2noq1j2noq.png" -resize 48x48 -quality 100 "..\public\icons\icon48.png"
if %errorlevel% neq 0 goto :error
echo     [OK] icon48.png (48x48)

magick "..\TestingImages\Gemini_Generated_Image_2noq1j2noq1j2noq.png" -resize 128x128 -quality 100 "..\public\icons\icon128.png"
if %errorlevel% neq 0 goto :error
echo     [OK] icon128.png (128x128)

echo.
echo [4/5] Generating optional high-DPI icons...

magick "..\TestingImages\Gemini_Generated_Image_2noq1j2noq1j2noq.png" -resize 96x96 -quality 100 "..\public\icons\icon96.png"
if %errorlevel% neq 0 goto :error
echo     [OK] icon96.png (96x96)

magick "..\TestingImages\Gemini_Generated_Image_2noq1j2noq1j2noq.png" -resize 192x192 -quality 100 "..\public\icons\icon192.png"
if %errorlevel% neq 0 goto :error
echo     [OK] icon192.png (192x192)

echo.
echo [5/5] Verifying generated files...
dir "..\public\icons\icon*.png" /B
echo.

echo ========================================
echo SUCCESS! All icons generated.
echo ========================================
echo.
echo Generated icons:
echo   - icon16.png  (16x16)   - Browser tab
echo   - icon32.png  (32x32)   - Toolbar icon
echo   - icon48.png  (48x48)   - Extensions page
echo   - icon128.png (128x128) - Chrome Web Store
echo   - icon96.png  (96x96)   - High-DPI (optional)
echo   - icon192.png (192x192) - High-DPI (optional)
echo.
echo Next steps:
echo   1. Update manifest.json with icon paths
echo   2. Run: npm run build
echo   3. Reload extension in Chrome
echo.
pause
exit /b 0

:error
echo.
echo ERROR: Failed to generate icons!
echo Check ImageMagick installation and try again.
echo.
pause
exit /b 1
