#!/bin/bash

# ============================================
# AssisT Extension Build Script
# ============================================
# Purpose: Copy source files to Output/ directory for Chrome extension loading
#
# CRITICAL: This script ensures Chrome loads the LATEST code
# - Source of truth: src/ directory
# - Chrome loads from: Output/ directory
# - NEVER edit files in Output/ directly
#
# Usage: bash build.sh
# Or add to package.json: "scripts": { "build": "bash build.sh" }
# ============================================

echo "🔨 Building AssisT Extension..."
echo ""

# Step 1: Verify source directory exists
if [ ! -d "src" ]; then
  echo "❌ ERROR: src/ directory not found!"
  echo "   Are you running this from the AssitT root directory?"
  exit 1
fi

# Step 2: Verify manifest.json exists
if [ ! -f "manifest.json" ]; then
  echo "❌ ERROR: manifest.json not found!"
  echo "   This script must be run from the AssitT root directory."
  exit 1
fi

# Step 3: Remove old build (clean slate)
echo "🧹 Cleaning old build..."
if [ -d "Output" ]; then
  rm -rf Output/
  echo "   ✓ Removed old Output/ directory"
fi

# Step 4: Create Output directory
echo ""
echo "📁 Creating Output/ directory..."
mkdir -p Output
echo "   ✓ Output/ directory created"

# Step 5: Copy source files
echo ""
echo "📋 Copying source files..."

# Copy src/
cp -r src/ Output/src/
echo "   ✓ Copied src/ → Output/src/"

# Copy icons/ (if exists)
if [ -d "icons" ]; then
  cp -r icons/ Output/icons/
  echo "   ✓ Copied icons/ → Output/icons/"
else
  echo "   ⚠ icons/ not found (skipping)"
fi

# Copy manifest.json
cp manifest.json Output/manifest.json
echo "   ✓ Copied manifest.json → Output/manifest.json"

# Copy any other root-level files that Chrome needs
# Add more files here as needed (e.g., _locales, assets, etc.)

# Step 6: Verify build
echo ""
echo "🔍 Verifying build..."

BUILD_SUCCESS=true

# Check critical files exist in Output/
if [ ! -f "Output/manifest.json" ]; then
  echo "   ❌ Output/manifest.json missing!"
  BUILD_SUCCESS=false
fi

if [ ! -f "Output/src/content/content-simple.js" ]; then
  echo "   ❌ Output/src/content/content-simple.js missing!"
  BUILD_SUCCESS=false
fi

if [ ! -f "Output/src/popup/popup.js" ]; then
  echo "   ❌ Output/src/popup/popup.js missing!"
  BUILD_SUCCESS=false
fi

if [ ! -f "Output/src/background/service-worker.js" ]; then
  echo "   ❌ Output/src/background/service-worker.js missing!"
  BUILD_SUCCESS=false
fi

# Step 7: Report results
echo ""
if [ "$BUILD_SUCCESS" = true ]; then
  echo "✅ Build complete!"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "📦 Extension ready for Chrome:"
  echo "   Load from: $(pwd)/Output"
  echo ""
  echo "⚠️  IMPORTANT:"
  echo "   - Chrome loads from: Output/"
  echo "   - ONLY edit files in: src/"
  echo "   - After editing, run: bash build.sh"
  echo "   - Then reload extension in Chrome"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "📍 Next steps:"
  echo "   1. Go to chrome://extensions"
  echo "   2. Click 'Reload' on AssisT extension"
  echo "   3. Hard refresh page (Ctrl+Shift+R)"
  echo ""
else
  echo "❌ Build failed! Some files are missing."
  echo "   Please check the errors above."
  exit 1
fi
