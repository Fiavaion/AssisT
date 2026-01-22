# Extension Icons

## Current Status

- ✅ icon.svg created (base design)
- ⏳ PNG exports needed for Chrome

## Required Sizes

Chrome Extension requires PNG icons at:

- icon16.png (16×16)
- icon32.png (32×32)
- icon48.png (48×48)
- icon128.png (128×128)

## Quick Generate

Use an online SVG to PNG converter or ImageMagick:

```bash
# Using ImageMagick (if installed)
convert icon.svg -resize 16x16 icon16.png
convert icon.svg -resize 32x32 icon32.png
convert icon.svg -resize 48x48 icon48.png
convert icon.svg -resize 128x128 icon128.png
```

## Online Tools

- https://cloudconvert.com/svg-to-png
- https://www.icoconverter.com/

## Note

For now, manifest.json will work without icons (Chrome shows default icon).
Generate PNGs before production release.
