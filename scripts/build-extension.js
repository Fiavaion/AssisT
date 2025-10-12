/**
 * Build Script for AssisT Extension
 * Copies all necessary extension files to Output folder for Chrome loading
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root is one level up from scripts/
const PROJECT_ROOT = path.join(__dirname, '..');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'Output');

// Files and directories to copy
const FILES_TO_COPY = [
  'manifest.json',
  'src',
  'public'
];

// Files to exclude
const EXCLUDE_PATTERNS = [
  '.test.js',
  '.spec.js',
  'node_modules',
  '.git',
  'tests'
];

function shouldExclude(filePath) {
  return EXCLUDE_PATTERNS.some(pattern => filePath.includes(pattern));
}

function copyDirectory(src, dest) {
  // Create destination directory if it doesn't exist
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  // Read source directory
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (shouldExclude(srcPath)) {
      continue;
    }

    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
      console.log(`✓ Copied: ${path.relative(__dirname, srcPath)}`);
    }
  }
}

function cleanOutputDirectory() {
  if (fs.existsSync(OUTPUT_DIR)) {
    console.log('🗑️  Cleaning Output directory...');
    fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log('✨ Output directory ready\n');
}

function buildExtension() {
  console.log('🚀 Building AssisT Extension...\n');

  // Clean output directory
  cleanOutputDirectory();

  // Copy files
  console.log('📦 Copying extension files...\n');

  for (const item of FILES_TO_COPY) {
    const srcPath = path.join(PROJECT_ROOT, item);

    if (!fs.existsSync(srcPath)) {
      console.warn(`⚠️  Warning: ${item} not found, skipping`);
      continue;
    }

    const destPath = path.join(OUTPUT_DIR, item);

    if (fs.statSync(srcPath).isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
      console.log(`✓ Copied: ${item}`);
    }
  }

  console.log('\n✅ Build complete!');
  console.log(`\n📂 Extension ready at: ${OUTPUT_DIR}`);
  console.log('\n🔧 To load in Chrome:');
  console.log('   1. Go to chrome://extensions/');
  console.log('   2. Enable "Developer mode"');
  console.log('   3. Click "Load unpacked"');
  console.log('   4. Select the "Output" folder');
}

// Run build
try {
  buildExtension();
} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}
