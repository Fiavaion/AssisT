# Icon System for @NCAD and AssisT Branding

This document explains how to generate and manage icons for the different branding variants.

## Overview

The extension supports multiple branding variants:
- **AssisT**: Default variant with 🎯 logo emoji
- **@NCAD**: NCAD-specific variant with 📖 logo emoji and custom icon set
- **LLM**: AssisT variant with additional LLM features

Each variant can have its own icon set defined in `manifest.config.json`.

## Icon Sizes Required

Chrome extensions require 4 icon sizes:
- **16x16**: Favicon (shown in tabs)
- **32x32**: Browser toolbar (shown in extension menu)
- **48x48**: Extension management page
- **128x128**: Chrome Web Store listing

## Directory Structure

```
public/icons/
├── icon16.png          # AssisT 16x16
├── icon32.png          # AssisT 32x32
├── icon48.png          # AssisT 48x48
├── icon128.png         # AssisT 128x128
└── ncad/
    ├── icon16.png      # @NCAD 16x16
    ├── icon32.png      # @NCAD 32x32
    ├── icon48.png      # @NCAD 48x48
    └── icon128.png     # @NCAD 128x128
```

## Generating @NCAD Icons

### Prerequisites

1. Python 3 installed
2. Pillow (PIL) library

### Method 1: Using Batch Script (Windows)

```bash
# Run from project root
scripts\generate-ncad-icons.bat
```

This script will:
- Check for Python and Pillow
- Automatically install Pillow if missing
- Generate all 4 icon sizes from `atNCAD_Logo.png`
- Save icons to `public/icons/ncad/`

### Method 2: Using Python Script Directly

```bash
# Install Pillow if not already installed
pip install Pillow

# Run the generation script
python scripts/generate-ncad-icons.py
```

### Method 3: Manual Resizing

If you prefer to use a different tool:

1. Open `atNCAD_Logo.png` in your preferred image editor
2. Resize to each required size (16, 32, 48, 128)
3. Save as PNG files in `public/icons/ncad/` with names:
   - `icon16.png`
   - `icon32.png`
   - `icon48.png`
   - `icon128.png`

## Switching Between Branding Variants

After generating the icons, switch to the @NCAD variant:

```bash
# Switch to @NCAD (uses NCAD icons)
npm run switch:ncad

# Switch back to AssisT (uses default icons)
npm run switch:assist

# Switch to LLM version (uses AssisT icons + LLM features)
npm run switch:llm
```

The switch scripts will:
1. Update `manifest.json` with variant-specific settings
2. Apply branding changes to HTML files
3. Build the extension
4. Tell you to reload the extension in Chrome

## How Icon Switching Works

### 1. Configuration (`manifest.config.json`)

Each variant defines its icon paths:

```json
{
  "variants": {
    "assist": {
      "icons": {
        "16": "public/icons/icon16.png",
        "32": "public/icons/icon32.png",
        ...
      }
    },
    "ncad": {
      "icons": {
        "16": "public/icons/ncad/icon16.png",
        "32": "public/icons/ncad/icon32.png",
        ...
      }
    }
  }
}
```

### 2. Manifest Generation (`scripts/generate-manifest.js`)

When you run `npm run switch:ncad`, the script:
1. Reads `manifest.config.json`
2. Merges the base config with the NCAD variant config
3. Uses NCAD-specific icon paths
4. Writes the final `manifest.json`

### 3. Build Process

Vite copies the appropriate icons to the `.vite/` directory during build.

## Adding New Branding Variants

To add a new branding variant with custom icons:

1. **Create icon directory**:
   ```
   public/icons/your-brand/
   ```

2. **Add icons** (16, 32, 48, 128)

3. **Update `manifest.config.json`**:
   ```json
   "your-brand": {
     "name": "Your Brand Name",
     "description": "...",
     "icons": {
       "16": "public/icons/your-brand/icon16.png",
       ...
     }
   }
   ```

4. **Update `branding.config.json`**:
   ```json
   "your-brand": {
     "name": "Your Brand",
     "logo": "🌟",
     "iconPath": "public/icons/your-brand/icon128.png"
   }
   ```

5. **Add npm script** in `package.json`:
   ```json
   "switch:your-brand": "node scripts/generate-manifest.js your-brand && npm run build"
   ```

## Troubleshooting

### Icons don't update after switching

1. Make sure you ran the full switch command: `npm run switch:ncad`
2. Reload the extension in Chrome (click the reload button in chrome://extensions/)
3. If still not working, try:
   ```bash
   # Clear build directory and rebuild
   rm -rf .vite
   npm run build
   ```

### Python/Pillow errors

```bash
# Reinstall Pillow
pip uninstall Pillow
pip install Pillow
```

### Icons look blurry

- Ensure source image (atNCAD_Logo.png) is high resolution (at least 512x512)
- Use PNG format with transparency
- The script uses LANCZOS resampling for best quality

## Icon Design Guidelines

For best results when creating custom icons:

1. **Size**: Start with at least 512x512px source image
2. **Format**: PNG with transparent background
3. **Style**: Simple, recognizable at small sizes
4. **Colors**: Consider visibility on both light and dark backgrounds
5. **Shape**: Square aspect ratio (1:1)
6. **Detail**: Avoid fine details that won't show at 16x16

## Files Modified by Icon System

- `manifest.json` - Extension manifest with icon paths
- `manifest.config.json` - Variant configurations
- `branding.config.json` - Branding metadata
- `scripts/generate-manifest.js` - Manifest generation logic
- `scripts/apply-branding.cjs` - Branding application (logo emoji)
- `scripts/generate-ncad-icons.py` - Icon generation script
