/**
 * Asset Generation Script for AssisT Chrome Extension
 * Generates all required icons, promotional images, and templates
 * Style guide: Ident/FiavaionLogo.png and Ident/FullLogo_1200x1200.jpg
 */

import sharp from 'sharp';
import { mkdir } from 'fs/promises';
import { join } from 'path';

const NAVY_BLUE = '#2C4F6F';
const CYAN = '#6DD5E8';
const LIME_GREEN = '#A8D88E';
const CORAL = '#FF8C61';
const WHITE = '#FFFFFF';

// Paths
const LOGO_SOURCE = 'Ident/AssisTLogo_1024.jpg';
const OUTPUT_DIR = 'generated-assets';

// Font configuration (matching MultiMon style - bold, geometric, wide)
const FONT_CONFIG = {
  family: 'Arial',
  weight: 900,
  letterSpacing: 2
};

async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

/**
 * 1. Generate Extension Icons (16, 32, 48, 128px)
 */
async function generateIcons() {
  console.log('📦 Generating extension icons...');

  const sizes = [16, 32, 48, 128];
  const iconsDir = join(OUTPUT_DIR, 'icons');
  await ensureDir(iconsDir);

  for (const size of sizes) {
    await sharp(LOGO_SOURCE)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 44, g: 79, b: 111, alpha: 1 } // Navy blue
      })
      .png()
      .toFile(join(iconsDir, `icon${size}.png`));

    console.log(`  ✓ icon${size}.png`);
  }
}

/**
 * 2. Generate Small Promo Tile (440x280px)
 * Layout: Logo + Tagline (matching Fiavaion circular badge style)
 */
async function generateSmallPromoTile() {
  console.log('🎨 Generating Small Promo Tile (440x280px)...');

  const promoDir = join(OUTPUT_DIR, 'promo');
  await ensureDir(promoDir);

  const width = 440;
  const height = 280;
  const logoSize = 180; // Logo at ~65% height

  // Create navy background with logo
  const logo = await sharp(LOGO_SOURCE)
    .resize(logoSize, logoSize, { fit: 'contain' })
    .toBuffer();

  // SVG for text overlay (tagline below logo)
  const svg = `
    <svg width="${width}" height="${height}">
      <rect width="${width}" height="${height}" fill="${NAVY_BLUE}"/>

      <!-- Tagline text (matching MultiMon typography style) -->
      <text
        x="${width / 2}"
        y="${height - 35}"
        font-family="Arial, sans-serif"
        font-size="18"
        font-weight="700"
        fill="${WHITE}"
        text-anchor="middle"
        letter-spacing="1.5">
        ADAPTIVE ACCESSIBILITY
      </text>

      <text
        x="${width / 2}"
        y="${height - 12}"
        font-family="Arial, sans-serif"
        font-size="14"
        font-weight="400"
        fill="${CYAN}"
        text-anchor="middle"
        letter-spacing="1">
        Text-to-Speech • Reading Support • AI Tools
      </text>
    </svg>
  `;

  await sharp(Buffer.from(svg))
    .composite([{
      input: logo,
      top: 30,
      left: Math.floor((width - logoSize) / 2)
    }])
    .png()
    .toFile(join(promoDir, 'small-promo-tile-440x280.png'));

  console.log('  ✓ small-promo-tile-440x280.png');
}

/**
 * 3. Generate Marquee Promo Tile (1400x560px)
 * Layout: Logo on left, feature highlights on right (matching MultiMon layout)
 */
async function generateMarqueePromoTile() {
  console.log('🎨 Generating Marquee Promo Tile (1400x560px)...');

  const promoDir = join(OUTPUT_DIR, 'promo');
  await ensureDir(promoDir);

  const width = 1400;
  const height = 560;
  const logoSize = 380;

  const logo = await sharp(LOGO_SOURCE)
    .resize(logoSize, logoSize, { fit: 'contain' })
    .toBuffer();

  // SVG with feature highlights (similar to MultiMon's clean layout)
  const svg = `
    <svg width="${width}" height="${height}">
      <rect width="${width}" height="${height}" fill="${NAVY_BLUE}"/>

      <!-- Main title -->
      <text
        x="750"
        y="120"
        font-family="Arial, sans-serif"
        font-size="56"
        font-weight="900"
        fill="${WHITE}"
        text-anchor="start"
        letter-spacing="3">
        ASSIST
      </text>

      <!-- Subtitle -->
      <text
        x="750"
        y="165"
        font-family="Arial, sans-serif"
        font-size="24"
        font-weight="400"
        fill="${CYAN}"
        text-anchor="start"
        letter-spacing="2">
        Adaptive Accessibility Tool
      </text>

      <!-- Feature bullets with gradient accents -->
      <circle cx="765" cy="230" r="6" fill="${CYAN}"/>
      <text
        x="790"
        y="237"
        font-family="Arial, sans-serif"
        font-size="20"
        font-weight="600"
        fill="${WHITE}"
        letter-spacing="1">
        Text-to-Speech with Synchronized Highlighting
      </text>

      <circle cx="765" cy="280" r="6" fill="${LIME_GREEN}"/>
      <text
        x="790"
        y="287"
        font-family="Arial, sans-serif"
        font-size="20"
        font-weight="600"
        fill="${WHITE}"
        letter-spacing="1">
        Dyslexia-Friendly Reading Tools
      </text>

      <circle cx="765" cy="330" r="6" fill="${CYAN}"/>
      <text
        x="790"
        y="337"
        font-family="Arial, sans-serif"
        font-size="20"
        font-weight="600"
        fill="${WHITE}"
        letter-spacing="1">
        AI-Powered Study Assistance
      </text>

      <circle cx="765" cy="380" r="6" fill="${LIME_GREEN}"/>
      <text
        x="790"
        y="387"
        font-family="Arial, sans-serif"
        font-size="20"
        font-weight="600"
        fill="${WHITE}"
        letter-spacing="1">
        Privacy-First • FERPA Compliant
      </text>

      <!-- Bottom tagline -->
      <text
        x="750"
        y="480"
        font-family="Arial, sans-serif"
        font-size="18"
        font-weight="400"
        fill="${CORAL}"
        text-anchor="start"
        letter-spacing="1.5">
        Empowering Neurodivergent Learners
      </text>
    </svg>
  `;

  await sharp(Buffer.from(svg))
    .composite([{
      input: logo,
      top: Math.floor((height - logoSize) / 2),
      left: 140
    }])
    .png()
    .toFile(join(promoDir, 'marquee-promo-tile-1400x560.png'));

  console.log('  ✓ marquee-promo-tile-1400x560.png');
}

/**
 * 4. Generate Screenshot Templates (1280x800px)
 * White placeholder areas for UI captures
 */
async function generateScreenshotTemplates() {
  console.log('📸 Generating screenshot templates (1280x800px)...');

  const templatesDir = join(OUTPUT_DIR, 'screenshot-templates');
  await ensureDir(templatesDir);

  const width = 1280;
  const height = 800;
  const templates = [
    {
      name: 'template-1-popup-interface',
      title: 'Popup Interface',
      subtitle: 'Feature toggles and quick settings'
    },
    {
      name: 'template-2-tts-highlighting',
      title: 'Text-to-Speech in Action',
      subtitle: 'Synchronized word highlighting'
    },
    {
      name: 'template-3-sticky-notes',
      title: 'Sticky Notes &amp; Annotations',
      subtitle: 'Annotate any webpage'
    },
    {
      name: 'template-4-citation-manager',
      title: 'Citation Manager',
      subtitle: 'Auto-extract and format citations'
    },
    {
      name: 'template-5-settings',
      title: 'Customization Options',
      subtitle: 'Personalize your experience'
    }
  ];

  for (const template of templates) {
    const svg = `
      <svg width="${width}" height="${height}">
        <!-- Navy border frame (matching Fiavaion style) -->
        <rect width="${width}" height="${height}" fill="${NAVY_BLUE}"/>

        <!-- White content area (for UI screenshot) -->
        <rect x="20" y="80" width="${width - 40}" height="${height - 160}" fill="${WHITE}" rx="8"/>

        <!-- Header with title -->
        <text
          x="40"
          y="50"
          font-family="Arial, sans-serif"
          font-size="28"
          font-weight="700"
          fill="${WHITE}"
          letter-spacing="1.5">
          ${template.title}
        </text>

        <!-- Subtitle -->
        <text
          x="40"
          y="750"
          font-family="Arial, sans-serif"
          font-size="18"
          font-weight="400"
          fill="${CYAN}"
          letter-spacing="1">
          ${template.subtitle}
        </text>

        <!-- AssisT watermark (bottom right) -->
        <text
          x="${width - 120}"
          y="750"
          font-family="Arial, sans-serif"
          font-size="16"
          font-weight="600"
          fill="${LIME_GREEN}"
          letter-spacing="2">
          ASSIST
        </text>

        <!-- Placeholder instruction (will be covered by screenshot) -->
        <text
          x="${width / 2}"
          y="${height / 2}"
          font-family="Arial, sans-serif"
          font-size="24"
          font-weight="400"
          fill="#CCCCCC"
          text-anchor="middle"
          letter-spacing="1">
          [ Drop UI Screenshot Here ]
        </text>
      </svg>
    `;

    await sharp(Buffer.from(svg))
      .png()
      .toFile(join(templatesDir, `${template.name}.png`));

    console.log(`  ✓ ${template.name}.png`);
  }
}

/**
 * 5. Generate Documentation Images
 */
async function generateDocumentationImages() {
  console.log('📄 Generating documentation images...');

  const docsDir = join(OUTPUT_DIR, 'docs');
  await ensureDir(docsDir);

  const logoSize = 280;
  const logo = await sharp(LOGO_SOURCE)
    .resize(logoSize, logoSize, { fit: 'contain' })
    .toBuffer();

  // README Header (1200x300)
  const readmeWidth = 1200;
  const readmeHeight = 300;
  const readmeSvg = `
    <svg width="${readmeWidth}" height="${readmeHeight}">
      <defs>
        <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style="stop-color:${NAVY_BLUE};stop-opacity:1" />
          <stop offset="100%" style="stop-color:#1a2f45;stop-opacity:1" />
        </linearGradient>
      </defs>

      <rect width="${readmeWidth}" height="${readmeHeight}" fill="url(#bgGradient)"/>

      <!-- Title (matching MultiMon typography) -->
      <text
        x="680"
        y="120"
        font-family="Arial, sans-serif"
        font-size="64"
        font-weight="900"
        fill="${WHITE}"
        letter-spacing="4">
        ASSIST
      </text>

      <!-- Subtitle -->
      <text
        x="680"
        y="165"
        font-family="Arial, sans-serif"
        font-size="28"
        font-weight="400"
        fill="${CYAN}"
        letter-spacing="2">
        Adaptive Accessibility Tool
      </text>

      <!-- Tagline -->
      <text
        x="680"
        y="210"
        font-family="Arial, sans-serif"
        font-size="18"
        font-weight="400"
        fill="${LIME_GREEN}"
        letter-spacing="1.5">
        Empowering neurodivergent learners with AI-powered accessibility
      </text>
    </svg>
  `;

  await sharp(Buffer.from(readmeSvg))
    .composite([{
      input: logo,
      top: Math.floor((readmeHeight - logoSize) / 2),
      left: 60
    }])
    .png()
    .toFile(join(docsDir, 'readme-header-1200x300.png'));

  console.log('  ✓ readme-header-1200x300.png');

  // Social Media Preview (1200x630 - OpenGraph standard)
  const socialWidth = 1200;
  const socialHeight = 630;
  const socialLogoSize = 320;
  const socialLogo = await sharp(LOGO_SOURCE)
    .resize(socialLogoSize, socialLogoSize, { fit: 'contain' })
    .toBuffer();

  const socialSvg = `
    <svg width="${socialWidth}" height="${socialHeight}">
      <rect width="${socialWidth}" height="${socialHeight}" fill="${NAVY_BLUE}"/>

      <!-- Main title -->
      <text
        x="680"
        y="220"
        font-family="Arial, sans-serif"
        font-size="72"
        font-weight="900"
        fill="${WHITE}"
        letter-spacing="4">
        ASSIST
      </text>

      <!-- Subtitle -->
      <text
        x="680"
        y="290"
        font-family="Arial, sans-serif"
        font-size="32"
        font-weight="400"
        fill="${CYAN}"
        letter-spacing="2">
        Adaptive Accessibility Extension
      </text>

      <!-- Features -->
      <text
        x="680"
        y="380"
        font-family="Arial, sans-serif"
        font-size="22"
        font-weight="600"
        fill="${LIME_GREEN}"
        letter-spacing="1">
        🔊 Text-to-Speech  •  📖 Reading Tools  •  🤖 AI Assistant
      </text>

      <!-- Bottom tagline -->
      <text
        x="680"
        y="520"
        font-family="Arial, sans-serif"
        font-size="20"
        font-weight="400"
        fill="${CORAL}"
        letter-spacing="1.5">
        Free • Privacy-First • Open Source
      </text>
    </svg>
  `;

  await sharp(Buffer.from(socialSvg))
    .composite([{
      input: socialLogo,
      top: Math.floor((socialHeight - socialLogoSize) / 2),
      left: 80
    }])
    .png()
    .toFile(join(docsDir, 'social-preview-1200x630.png'));

  console.log('  ✓ social-preview-1200x630.png');
}

/**
 * Main execution
 */
async function main() {
  console.log('🚀 AssisT Asset Generation Script\n');
  console.log('Style Guide: Fiavaion & MultiMon branding\n');

  try {
    await ensureDir(OUTPUT_DIR);

    await generateIcons();
    await generateSmallPromoTile();
    await generateMarqueePromoTile();
    await generateScreenshotTemplates();
    await generateDocumentationImages();

    console.log('\n✅ All assets generated successfully!');
    console.log(`\n📁 Output directory: ${OUTPUT_DIR}/`);
    console.log('\nNext steps:');
    console.log('1. Review all generated assets');
    console.log('2. Drop UI screenshots into template white areas');
    console.log('3. Copy icons to public/icons/');
    console.log('4. Use promo tiles for Chrome Web Store submission');

  } catch (error) {
    console.error('❌ Error generating assets:', error);
    process.exit(1);
  }
}

main();
