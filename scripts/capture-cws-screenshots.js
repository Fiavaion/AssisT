/**
 * CWS Screenshot Capture Script
 * Generates promotional screenshots for Chrome Web Store listing
 *
 * Required dimensions:
 * - Screenshots: 1280x800 or 640x400 (at least 1 required)
 * - Small promo tile: 440x280
 * - Marquee promo tile: 1400x560
 */

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_DIR = path.join(__dirname, '..', 'store-screenshots');
const EXTENSION_PATH = path.join(__dirname, '..', '.vite');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function captureScreenshots() {
  console.log('='.repeat(60));
  console.log('AssisT CWS Screenshot Capture');
  console.log('='.repeat(60));
  console.log(`Extension path: ${EXTENSION_PATH}`);
  console.log(`Output directory: ${OUTPUT_DIR}`);
  console.log('');

  // Launch browser with extension
  const browser = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-first-run',
      '--disable-default-apps',
    ],
    viewport: { width: 1280, height: 800 }
  });

  // Wait for extension to load
  await new Promise(r => setTimeout(r, 2000));

  // Get extension ID
  const backgrounds = browser.serviceWorkers();
  let extensionId = null;

  for (const worker of backgrounds) {
    const url = worker.url();
    if (url.includes('chrome-extension://')) {
      extensionId = url.split('/')[2];
      break;
    }
  }

  if (!extensionId) {
    // Try to find extension ID from background pages
    const pages = browser.pages();
    for (const page of pages) {
      const url = page.url();
      if (url.includes('chrome-extension://')) {
        extensionId = url.split('/')[2];
        break;
      }
    }
  }

  console.log(`Extension ID: ${extensionId || 'Not found - will use popup directly'}`);

  try {
    // ============================================
    // SCREENSHOT 1: Popup Overview
    // ============================================
    console.log('\n[1/5] Capturing popup overview...');

    const popupPage = await browser.newPage();

    if (extensionId) {
      await popupPage.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
    } else {
      // Fallback: open popup HTML directly from file
      await popupPage.goto(`file:///${EXTENSION_PATH}/src/popup/popup.html`.replace(/\\/g, '/'));
    }

    await popupPage.waitForLoadState('networkidle');
    await new Promise(r => setTimeout(r, 1000));

    // Set viewport for screenshot dimensions
    await popupPage.setViewportSize({ width: 1280, height: 800 });

    await popupPage.screenshot({
      path: path.join(OUTPUT_DIR, 'screenshot_01_popup_overview.png'),
      fullPage: false
    });
    console.log('  ✓ Popup overview captured');

    // ============================================
    // SCREENSHOT 2: Discovery Quiz
    // ============================================
    console.log('\n[2/5] Capturing discovery quiz...');

    const discoveryPage = await browser.newPage();
    if (extensionId) {
      await discoveryPage.goto(`chrome-extension://${extensionId}/src/pages/discovery/discovery.html`);
    } else {
      await discoveryPage.goto(`file:///${EXTENSION_PATH}/src/pages/discovery/discovery.html`.replace(/\\/g, '/'));
    }
    await discoveryPage.waitForLoadState('networkidle');
    await new Promise(r => setTimeout(r, 1000));

    await discoveryPage.setViewportSize({ width: 1280, height: 800 });
    await discoveryPage.screenshot({
      path: path.join(OUTPUT_DIR, 'screenshot_02_discovery_quiz.png'),
      fullPage: false
    });
    console.log('  ✓ Discovery quiz captured');

    // ============================================
    // SCREENSHOT 3: Demo Page with Features
    // ============================================
    console.log('\n[3/5] Capturing demo page...');

    const demoPage = await browser.newPage();
    if (extensionId) {
      await demoPage.goto(`chrome-extension://${extensionId}/src/pages/demo/demo.html`);
    } else {
      await demoPage.goto(`file:///${EXTENSION_PATH}/src/pages/demo/demo.html`.replace(/\\/g, '/'));
    }
    await demoPage.waitForLoadState('networkidle');
    await new Promise(r => setTimeout(r, 1000));

    await demoPage.setViewportSize({ width: 1280, height: 800 });
    await demoPage.screenshot({
      path: path.join(OUTPUT_DIR, 'screenshot_03_demo_page.png'),
      fullPage: false
    });
    console.log('  ✓ Demo page captured');

    // ============================================
    // SCREENSHOT 4: Help Page
    // ============================================
    console.log('\n[4/5] Capturing help page...');

    const helpPage = await browser.newPage();
    if (extensionId) {
      await helpPage.goto(`chrome-extension://${extensionId}/src/pages/help/help.html`);
    } else {
      await helpPage.goto(`file:///${EXTENSION_PATH}/src/pages/help/help.html`.replace(/\\/g, '/'));
    }
    await helpPage.waitForLoadState('networkidle');
    await new Promise(r => setTimeout(r, 1000));

    await helpPage.setViewportSize({ width: 1280, height: 800 });
    await helpPage.screenshot({
      path: path.join(OUTPUT_DIR, 'screenshot_04_help_page.png'),
      fullPage: false
    });
    console.log('  ✓ Help page captured');

    // ============================================
    // SCREENSHOT 5: Extension on a real webpage
    // ============================================
    console.log('\n[5/5] Capturing extension on Wikipedia (accessibility demo)...');

    const wikiPage = await browser.newPage();
    await wikiPage.goto('https://en.wikipedia.org/wiki/Accessibility');
    await wikiPage.waitForLoadState('networkidle');
    await new Promise(r => setTimeout(r, 2000));

    await wikiPage.setViewportSize({ width: 1280, height: 800 });
    await wikiPage.screenshot({
      path: path.join(OUTPUT_DIR, 'screenshot_05_in_action.png'),
      fullPage: false
    });
    console.log('  ✓ In-action screenshot captured');

    // ============================================
    // Generate different sizes for promo tiles
    // ============================================
    console.log('\n[Promo Tiles] Generating promotional tile sizes...');

    // Small promo tile (440x280) - use popup
    await popupPage.setViewportSize({ width: 440, height: 280 });
    await popupPage.screenshot({
      path: path.join(OUTPUT_DIR, 'promo_small_440x280.png'),
      fullPage: false
    });
    console.log('  ✓ Small promo tile (440x280) captured');

    // Marquee promo tile (1400x560) - use demo page
    await demoPage.setViewportSize({ width: 1400, height: 560 });
    await demoPage.screenshot({
      path: path.join(OUTPUT_DIR, 'promo_marquee_1400x560.png'),
      fullPage: false
    });
    console.log('  ✓ Marquee promo tile (1400x560) captured');

    console.log('\n' + '='.repeat(60));
    console.log('Screenshots captured successfully!');
    console.log(`Output: ${OUTPUT_DIR}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('Error capturing screenshots:', error);
  } finally {
    await browser.close();
  }
}

// Run the capture
captureScreenshots().catch(console.error);
