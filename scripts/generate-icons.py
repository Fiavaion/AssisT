#!/usr/bin/env python3
"""
AssisT Icon Generator
Generates all required icon sizes from source image
"""

import os
import sys
from pathlib import Path

try:
    from PIL import Image
    print("[OK] PIL/Pillow is available")
except ImportError:
    print("[ERROR] PIL/Pillow not found. Installing...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow"])
    from PIL import Image
    print("[OK] PIL/Pillow installed successfully")

def generate_icons():
    """Generate all required icon sizes"""

    # Paths
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    source_image = project_root / "TestingImages" / "Gemini_Generated_Image_2noq1j2noq1j2noq.png"
    output_dir = project_root / "public" / "icons"

    print("\n" + "="*50)
    print("AssisT Icon Generator")
    print("="*50 + "\n")

    # Check source image exists
    print(f"[1/5] Checking source image...")
    if not source_image.exists():
        print(f"[ERROR] Source image not found!")
        print(f"  Expected: {source_image}")
        return False
    print(f"  [OK] Source image found: {source_image.name}")

    # Create output directory
    print(f"\n[2/5] Creating output directory...")
    output_dir.mkdir(parents=True, exist_ok=True)
    print(f"  [OK] Output directory ready: {output_dir}")

    # Load source image
    print(f"\n[3/5] Loading source image...")
    try:
        img = Image.open(source_image)
        print(f"  [OK] Image loaded: {img.size[0]}x{img.size[1]} pixels, {img.mode} mode")
    except Exception as e:
        print(f"[ERROR] Failed to load image: {e}")
        return False

    # Required sizes
    sizes = {
        'icon16.png': 16,
        'icon32.png': 32,
        'icon48.png': 48,
        'icon128.png': 128,
    }

    # Optional high-DPI sizes
    optional_sizes = {
        'icon96.png': 96,
        'icon192.png': 192,
    }

    # Generate required icons
    print(f"\n[4/5] Generating extension icons...")
    generated_files = []

    for filename, size in sizes.items():
        output_path = output_dir / filename
        try:
            # Resize with high-quality resampling
            resized = img.resize((size, size), Image.Resampling.LANCZOS)
            resized.save(output_path, 'PNG', quality=100)
            generated_files.append(filename)
            print(f"  [OK] {filename} ({size}x{size})")
        except Exception as e:
            print(f"  [ERROR] Failed to generate {filename}: {e}")
            return False

    # Generate optional high-DPI icons
    print(f"\n[5/5] Generating optional high-DPI icons...")

    for filename, size in optional_sizes.items():
        output_path = output_dir / filename
        try:
            resized = img.resize((size, size), Image.Resampling.LANCZOS)
            resized.save(output_path, 'PNG', quality=100)
            generated_files.append(filename)
            print(f"  [OK] {filename} ({size}x{size})")
        except Exception as e:
            print(f"  [ERROR] Failed to generate {filename}: {e}")

    # Summary
    print("\n" + "="*50)
    print("SUCCESS! All icons generated.")
    print("="*50 + "\n")

    print("Generated icons:")
    for filename in generated_files:
        size = sizes.get(filename, optional_sizes.get(filename, 0))
        purpose = {
            'icon16.png': 'Browser tab',
            'icon32.png': 'Toolbar icon',
            'icon48.png': 'Extensions page',
            'icon128.png': 'Chrome Web Store',
            'icon96.png': 'High-DPI (optional)',
            'icon192.png': 'High-DPI (optional)',
        }.get(filename, '')
        print(f"  - {filename} ({size}x{size}) - {purpose}")

    print(f"\nOutput location: {output_dir}")

    print("\nNext steps:")
    print("  1. Update manifest.json with icon paths")
    print("  2. Run: npm run build")
    print("  3. Reload extension in Chrome")

    return True

if __name__ == "__main__":
    success = generate_icons()
    sys.exit(0 if success else 1)
