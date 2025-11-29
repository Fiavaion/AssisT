#!/usr/bin/env node
/**
 * AssisT Documentation Builder
 * Compiles Typst files to PDF
 *
 * Usage:
 *   node scripts/build-docs.cjs           # Build all guides
 *   node scripts/build-docs.cjs --watch   # Watch mode
 *   node scripts/build-docs.cjs <name>    # Build specific guide
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Configuration
const TYPST_DIR = path.join(__dirname, '..', 'docs', 'typst');
const GUIDES_DIR = path.join(TYPST_DIR, 'guides');
const OUTPUT_DIR = path.join(TYPST_DIR, 'output');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, message) {
  console.log(`${colors.cyan}[${step}]${colors.reset} ${message}`);
}

function findTypstExecutable() {
  // Try 'typst' in PATH first
  try {
    execSync('typst --version', { stdio: 'pipe' });
    return 'typst';
  } catch {
    // Not in PATH, search common locations
  }

  // Windows-specific locations
  if (process.platform === 'win32') {
    const homeDir = os.homedir();
    const possiblePaths = [
      // WinGet installation
      path.join(homeDir, 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages'),
      // Scoop
      path.join(homeDir, 'scoop', 'apps', 'typst', 'current'),
      // Chocolatey
      'C:\\ProgramData\\chocolatey\\bin',
      // Manual install
      path.join(homeDir, '.cargo', 'bin'),
    ];

    // Search WinGet packages for Typst
    const wingetPath = path.join(homeDir, 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages');
    if (fs.existsSync(wingetPath)) {
      const packages = fs.readdirSync(wingetPath);
      const typstPackage = packages.find(p => p.toLowerCase().includes('typst'));
      if (typstPackage) {
        const packagePath = path.join(wingetPath, typstPackage);
        const files = fs.readdirSync(packagePath);
        for (const file of files) {
          const subPath = path.join(packagePath, file);
          const typstExe = path.join(subPath, 'typst.exe');
          if (fs.existsSync(typstExe)) {
            return typstExe;
          }
        }
      }
    }

    // Check other paths
    for (const basePath of possiblePaths) {
      const typstExe = path.join(basePath, 'typst.exe');
      if (fs.existsSync(typstExe)) {
        return typstExe;
      }
    }
  }

  // macOS/Linux
  if (process.platform === 'darwin' || process.platform === 'linux') {
    const homeDir = os.homedir();
    const possiblePaths = [
      path.join(homeDir, '.cargo', 'bin', 'typst'),
      '/usr/local/bin/typst',
      '/opt/homebrew/bin/typst',
    ];

    for (const typstPath of possiblePaths) {
      if (fs.existsSync(typstPath)) {
        return typstPath;
      }
    }
  }

  return null;
}

function ensureDirectories() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  if (!fs.existsSync(GUIDES_DIR)) {
    fs.mkdirSync(GUIDES_DIR, { recursive: true });
  }
}

function getGuideFiles(specificGuide = null) {
  if (!fs.existsSync(GUIDES_DIR)) {
    return [];
  }

  const files = fs.readdirSync(GUIDES_DIR).filter(f => f.endsWith('.typ'));

  if (specificGuide) {
    const match = files.find(
      f => f === specificGuide || f === `${specificGuide}.typ` || f.includes(specificGuide)
    );
    return match ? [match] : [];
  }

  return files;
}

function buildGuide(typstCmd, filename) {
  const inputPath = path.join(GUIDES_DIR, filename);
  const outputName = filename.replace('.typ', '.pdf');
  const outputPath = path.join(OUTPUT_DIR, outputName);

  logStep('BUILD', `${filename} → ${outputName}`);

  try {
    // Use --root to allow imports from parent directories
    execSync(`"${typstCmd}" compile --root "${TYPST_DIR}" "${inputPath}" "${outputPath}"`, {
      stdio: 'inherit',
      cwd: TYPST_DIR,
      shell: true,
    });
    log(`  ✓ Created ${outputPath}`, 'green');
    return true;
  } catch (error) {
    log(`  ✗ Failed to build ${filename}`, 'red');
    return false;
  }
}

function watchGuide(typstCmd, filename) {
  const inputPath = path.join(GUIDES_DIR, filename);
  const outputName = filename.replace('.typ', '.pdf');
  const outputPath = path.join(OUTPUT_DIR, outputName);

  logStep('WATCH', `Watching ${filename} for changes...`);
  log(`  Press Ctrl+C to stop`, 'yellow');

  const child = spawn(typstCmd, ['watch', '--root', TYPST_DIR, inputPath, outputPath], {
    stdio: 'inherit',
    cwd: TYPST_DIR,
    shell: true,
  });

  child.on('error', err => {
    log(`Error: ${err.message}`, 'red');
  });

  return child;
}

function main() {
  const args = process.argv.slice(2);
  const watchMode = args.includes('--watch') || args.includes('-w');
  const specificGuide = args.find(a => !a.startsWith('-'));

  log('\n📄 AssisT Documentation Builder\n', 'bright');

  // Find Typst executable
  const typstCmd = findTypstExecutable();

  if (!typstCmd) {
    log('Error: Typst is not installed or not found.', 'red');
    log('\nInstall Typst:', 'yellow');
    log('  Windows: winget install Typst.Typst', 'reset');
    log('  macOS:   brew install typst', 'reset');
    log('  Linux:   cargo install typst-cli', 'reset');
    log('  Or visit: https://typst.app/', 'reset');
    log('\nAfter installing, restart your terminal.', 'yellow');
    process.exit(1);
  }

  log(`Using Typst: ${typstCmd}\n`, 'reset');

  ensureDirectories();

  const guides = getGuideFiles(specificGuide);

  if (guides.length === 0) {
    if (specificGuide) {
      log(`No guide found matching "${specificGuide}"`, 'yellow');
    } else {
      log('No .typ files found in docs/typst/guides/', 'yellow');
      log('Create a guide to get started!', 'reset');
    }
    process.exit(0);
  }

  log(`Found ${guides.length} guide(s): ${guides.join(', ')}\n`, 'reset');

  if (watchMode) {
    // Watch mode - only watch first guide (or specified)
    const guideToWatch = guides[0];
    watchGuide(typstCmd, guideToWatch);
  } else {
    // Build all guides
    let success = 0;
    let failed = 0;

    for (const guide of guides) {
      if (buildGuide(typstCmd, guide)) {
        success++;
      } else {
        failed++;
      }
    }

    log('\n' + '─'.repeat(40), 'reset');
    log(`Built: ${success}  Failed: ${failed}`, success > 0 ? 'green' : 'red');

    if (failed > 0) {
      process.exit(1);
    }
  }
}

main();
