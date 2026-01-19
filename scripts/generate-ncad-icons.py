#!/usr/bin/env python3
"""
Generate @NCAD icon set from atNCAD_Logo.png
Creates 16x16, 32x32, 48x48, and 128x128 versions
"""

from PIL import Image
import os

# Configuration
SIZES = [16, 32, 48, 128]
INPUT_FILE = 'atNCAD_Logo.png'
OUTPUT_DIR = 'public/icons/ncad'

def main():
    print('[Icon Generator] Starting @NCAD icon generation...')

    # Check if input file exists
    if not os.path.exists(INPUT_FILE):
        print(f'[ERROR] {INPUT_FILE} not found in project root')
        return 1

    # Create output directory if it doesn't exist
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print(f'[Icon Generator] Output directory: {OUTPUT_DIR}')

    # Load source image
    try:
        source_img = Image.open(INPUT_FILE)
        print(f'[Icon Generator] Loaded source image: {source_img.size[0]}x{source_img.size[1]}')
    except Exception as e:
        print(f'[ERROR] Error loading image: {e}')
        return 1

    # Convert to RGBA if not already
    if source_img.mode != 'RGBA':
        source_img = source_img.convert('RGBA')
        print('[Icon Generator] Converted to RGBA mode')

    # Generate each size
    for size in SIZES:
        output_file = os.path.join(OUTPUT_DIR, f'icon{size}.png')

        # Resize with high-quality resampling
        resized_img = source_img.resize((size, size), Image.Resampling.LANCZOS)

        # Save with optimization
        resized_img.save(output_file, 'PNG', optimize=True)

        print(f'[SUCCESS] Generated: {output_file} ({size}x{size})')

    print(f'\n[Icon Generator] Successfully generated {len(SIZES)} icon sizes!')
    print('Next steps:')
    print('  1. Run: npm run switch:ncad')
    print('  2. Reload extension in Chrome')
    return 0

if __name__ == '__main__':
    exit(main())
