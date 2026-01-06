/**
 * Apply Branding Script
 *
 * This script applies branding changes to HTML files at BUILD TIME.
 * It reads the current manifest.json to determine which brand variant is active,
 * then updates HTML files with the correct branding.
 *
 * SAFETY: This script uses simple string replacement, NOT runtime DOM manipulation.
 * If this script fails, the build will fail - preventing broken extensions.
 *
 * Usage: node scripts/apply-branding.js
 * Called automatically by: npm run switch:assist or npm run switch:ncad
 */

const fs = require('fs');
const path = require('path');

// Configuration
const ROOT_DIR = path.join(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT_DIR, 'manifest.json');
const BRANDING_CONFIG_PATH = path.join(ROOT_DIR, 'branding.config.json');

// Files to update with branding
const FILES_TO_BRAND = [
  'src/popup/popup.html',
  'src/pages/discovery/discovery.html',
  'src/pages/demo/demo.html'
];

/**
 * Main function
 */
function applyBranding() {
  console.log('[Branding] Starting branding application...');

  // 1. Read manifest to determine active variant
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error('[Branding] ERROR: manifest.json not found');
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const isNCAD = manifest.name.includes('@NCAD');
  const variant = isNCAD ? 'ncad' : 'assist';

  console.log(`[Branding] Active variant: ${variant} (manifest name: "${manifest.name}")`);

  // 2. Load branding config
  if (!fs.existsSync(BRANDING_CONFIG_PATH)) {
    console.error('[Branding] ERROR: branding.config.json not found');
    process.exit(1);
  }

  const brandingConfig = JSON.parse(fs.readFileSync(BRANDING_CONFIG_PATH, 'utf8'));
  const brand = brandingConfig[variant];
  const otherVariant = variant === 'ncad' ? 'assist' : 'ncad';
  const otherBrand = brandingConfig[otherVariant];

  if (!brand) {
    console.error(`[Branding] ERROR: No branding config found for variant "${variant}"`);
    process.exit(1);
  }

  console.log(`[Branding] Applying: name="${brand.name}", tagline="${brand.tagline}"`);

  // 3. Define replacement rules for each file
  // We replace BOTH directions - from assist->ncad OR ncad->assist
  const replacementRules = {
    'src/popup/popup.html': [
      // Title tag
      {
        patterns: [
          `<title>AssisT - Learning Support</title>`,
          `<title>@NCAD - Adaptive Accessibility</title>`
        ],
        replacement: `<title>${brand.name} - ${brand.tagline}</title>`
      },
      // H1 content (the text "AssisT" or "@NCAD" inside h1)
      // Note: The h1 structure has logo span + text, we only replace the text
      {
        patterns: [
          /(<span class="logo">🎯<\/span>\s*)AssisT(\s*<\/h1>)/,
          /(<span class="logo">🎯<\/span>\s*)@NCAD(\s*<\/h1>)/
        ],
        replacement: `$1${brand.name}$2`,
        isRegex: true
      }
    ],
    'src/pages/discovery/discovery.html': [
      // Title tag
      {
        patterns: [
          `<title>Discover Your Tools - AssisT</title>`,
          `<title>Discover Your Tools - @NCAD</title>`
        ],
        replacement: `<title>Discover Your Tools - ${brand.name}</title>`
      },
      // H1 welcome heading
      {
        patterns: [
          `<h1 id="welcome-heading">AssisT</h1>`,
          `<h1 id="welcome-heading">@NCAD</h1>`
        ],
        replacement: `<h1 id="welcome-heading">${brand.name}</h1>`
      }
    ],
    'src/pages/demo/demo.html': [
      // Title tag
      {
        patterns: [
          `<title>NCAD Demo - AssisT</title>`,
          `<title>NCAD Demo - @NCAD</title>`
        ],
        replacement: `<title>NCAD Demo - ${brand.name}</title>`
      },
      // Banner strong text
      {
        patterns: [
          `<strong>AssisT Demo Page</strong>`,
          `<strong>@NCAD Demo Page</strong>`
        ],
        replacement: `<strong>${brand.name} Demo Page</strong>`
      }
    ]
  };

  // 4. Apply replacements to each file
  let totalReplacements = 0;

  for (const relativeFilePath of FILES_TO_BRAND) {
    const filePath = path.join(ROOT_DIR, relativeFilePath);

    if (!fs.existsSync(filePath)) {
      console.warn(`[Branding] WARNING: File not found: ${relativeFilePath}`);
      continue;
    }

    let content = fs.readFileSync(filePath, 'utf8');
    let fileReplacements = 0;

    const rules = replacementRules[relativeFilePath] || [];

    for (const rule of rules) {
      for (const pattern of rule.patterns) {
        if (rule.isRegex) {
          // Regex replacement
          if (pattern.test(content)) {
            content = content.replace(pattern, rule.replacement);
            fileReplacements++;
          }
        } else {
          // String replacement
          if (content.includes(pattern)) {
            content = content.replace(pattern, rule.replacement);
            fileReplacements++;
          }
        }
      }
    }

    if (fileReplacements > 0) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`[Branding] Updated ${relativeFilePath} (${fileReplacements} replacements)`);
      totalReplacements += fileReplacements;
    } else {
      console.log(`[Branding] No changes needed for ${relativeFilePath}`);
    }
  }

  console.log(`[Branding] Complete! Applied ${totalReplacements} total replacements for "${brand.name}" variant.`);
}

// Run the script
try {
  applyBranding();
} catch (error) {
  console.error('[Branding] FATAL ERROR:', error.message);
  process.exit(1);
}
