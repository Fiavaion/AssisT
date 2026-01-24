/**
 * Chrome Web Store Screenshot Capture Script
 *
 * Captures screenshots for Chrome Web Store submission:
 * 1. Popup interface showing feature toggles
 * 2. TTS in action with word highlighting
 * 3. Sticky notes on a page
 * 4. Citation manager interface
 * 5. Settings/customization options
 *
 * Requirements: 1280x800 or 640x400 PNG images
 *
 * Usage: node scripts/capture-store-screenshots.js
 */

import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Extension path - use .vite build output
const extensionPath = path.join(__dirname, '..', '.vite');
const outputDir = path.join(__dirname, '..', 'store-screenshots');

// Screenshot dimensions for Chrome Store (1280x800)
const VIEWPORT = { width: 1280, height: 800 };
const POPUP_SIZE = { width: 400, height: 600 };

async function captureScreenshots() {
  console.log('🚀 Starting Chrome Store Screenshot Capture');
  console.log(`📁 Extension path: ${extensionPath}`);
  console.log(`📁 Output directory: ${outputDir}`);

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Launch browser with extension
  console.log('\n🌐 Launching browser with extension...');
  const context = await chromium.launchPersistentContext('', {
    headless: false, // Extension testing requires headed mode
    viewport: VIEWPORT,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1280,800'
    ]
  });

  try {
    // Wait for service worker to initialize
    console.log('⏳ Waiting for extension to load...');
    let background = context.serviceWorkers()[0];
    if (!background) {
      background = await context.waitForEvent('serviceworker', { timeout: 10000 });
    }
    const extensionId = background.url().split('/')[2];
    console.log(`✅ Extension loaded: ${extensionId}`);

    // === Screenshot 1: Popup Interface with Feature Toggles ===
    console.log('\n📸 Capturing Screenshot 1: Popup Interface');
    await capturePopupInterface(context, extensionId);

    // === Screenshot 2: TTS with Word Highlighting ===
    console.log('\n📸 Capturing Screenshot 2: TTS with Highlighting');
    await captureTTSHighlighting(context, extensionId);

    // === Screenshot 3: Sticky Notes Feature ===
    console.log('\n📸 Capturing Screenshot 3: Sticky Notes');
    await captureStickyNotes(context, extensionId);

    // === Screenshot 4: Citation Manager ===
    console.log('\n📸 Capturing Screenshot 4: Citation Manager');
    await captureCitationManager(context, extensionId);

    // === Screenshot 5: Settings/Customization ===
    console.log('\n📸 Capturing Screenshot 5: Settings Panel');
    await captureSettingsPanel(context, extensionId);

    console.log('\n✅ All screenshots captured successfully!');
    console.log(`📁 Screenshots saved to: ${outputDir}`);

    // List captured files
    const files = fs.readdirSync(outputDir).filter(f => f.endsWith('.png'));
    console.log('\nCaptured files:');
    files.forEach(f => console.log(`  - ${f}`));

  } catch (error) {
    console.error('❌ Error capturing screenshots:', error);
    throw error;
  } finally {
    await context.close();
  }
}

/**
 * Screenshot 1: Popup interface with feature toggles enabled
 * Takes a direct screenshot of the popup and embeds it in a showcase
 */
async function capturePopupInterface(context, extensionId) {
  // First, take a direct screenshot of the actual popup
  const popupPage = await context.newPage();
  await popupPage.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
  await popupPage.waitForLoadState('domcontentloaded');
  await popupPage.waitForTimeout(2000); // Wait for full render

  // Set popup viewport size
  await popupPage.setViewportSize({ width: 360, height: 640 });
  await popupPage.waitForTimeout(500);

  // Take screenshot of the popup as base64
  const popupScreenshot = await popupPage.screenshot({ encoding: 'base64' });
  await popupPage.close();

  // Create showcase page with the popup screenshot embedded as image
  const page = await context.newPage();
  await page.setViewportSize(VIEWPORT);

  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        * { box-sizing: border-box; }
        body {
          margin: 0;
          padding: 0;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .showcase {
          display: flex;
          align-items: center;
          gap: 60px;
          padding: 40px;
        }

        .popup-frame {
          background: #333;
          border-radius: 12px;
          padding: 8px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        }

        .browser-bar {
          background: #444;
          border-radius: 8px 8px 0 0;
          padding: 8px 12px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .browser-dots {
          display: flex;
          gap: 6px;
        }
        .dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
        }
        .dot.red { background: #ff5f57; }
        .dot.yellow { background: #febc2e; }
        .dot.green { background: #28c840; }

        .browser-title {
          color: #aaa;
          font-size: 12px;
          margin-left: 12px;
        }

        .popup-container {
          width: 360px;
          height: 580px;
          background: white;
          border-radius: 0 0 8px 8px;
          overflow: hidden;
        }

        .popup-screenshot {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: top;
        }

        .info-section {
          color: white;
          max-width: 400px;
        }

        .info-section h1 {
          font-size: 42px;
          margin: 0 0 16px;
          font-weight: 700;
        }

        .info-section p {
          font-size: 18px;
          line-height: 1.6;
          opacity: 0.9;
          margin: 0 0 24px;
        }

        .feature-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .feature-list li {
          font-size: 16px;
          padding: 8px 0;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .feature-list li::before {
          content: '✓';
          background: rgba(255,255,255,0.2);
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <div class="showcase">
        <div class="popup-frame">
          <div class="browser-bar">
            <div class="browser-dots">
              <span class="dot red"></span>
              <span class="dot yellow"></span>
              <span class="dot green"></span>
            </div>
            <span class="browser-title">AssisT Extension</span>
          </div>
          <div class="popup-container">
            <img class="popup-screenshot" src="data:image/png;base64,${popupScreenshot}" alt="AssisT Popup" />
          </div>
        </div>

        <div class="info-section">
          <h1>AssisT</h1>
          <p>Universal accessibility for every website. Text-to-Speech, reading support, and AI-powered learning tools.</p>
          <ul class="feature-list">
            <li>Text-to-Speech with word highlighting</li>
            <li>Dyslexia-friendly fonts & reading guides</li>
            <li>Smart annotations & sticky notes</li>
            <li>Citation management</li>
            <li>AI summarization & tutoring</li>
          </ul>
        </div>
      </div>
    </body>
    </html>
  `);

  await page.waitForTimeout(500);

  await page.screenshot({
    path: path.join(outputDir, '1-popup-interface.png')
  });
  console.log('  ✓ Saved: 1-popup-interface.png');

  await page.close();
}

/**
 * Screenshot 2: TTS with word highlighting on sample content
 */
async function captureTTSHighlighting(context, extensionId) {
  // Create a sample page with content
  const page = await context.newPage();
  await page.setViewportSize(VIEWPORT);

  // Create sample educational content
  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: 'Georgia', serif;
          max-width: 800px;
          margin: 50px auto;
          padding: 20px;
          line-height: 1.8;
          font-size: 18px;
          background: #fafafa;
        }
        h1 { color: #2c3e50; margin-bottom: 20px; }
        p { margin-bottom: 20px; color: #333; }

        /* Simulated TTS highlighting */
        .highlight-word {
          background: linear-gradient(120deg, #84fab0 0%, #8fd3f4 100%);
          padding: 2px 4px;
          border-radius: 3px;
          font-weight: 600;
        }
        .highlight-sentence {
          background: rgba(255, 235, 59, 0.3);
          border-left: 3px solid #ffc107;
          padding-left: 10px;
        }

        /* AssisT TTS control bar simulation */
        .assist-tts-bar {
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          background: white;
          border-radius: 30px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.15);
          padding: 12px 24px;
          display: flex;
          align-items: center;
          gap: 16px;
          z-index: 9999;
        }
        .tts-btn {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: none;
          background: #4CAF50;
          color: white;
          font-size: 18px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .tts-btn.playing { background: #f44336; }
        .tts-progress {
          width: 200px;
          height: 6px;
          background: #e0e0e0;
          border-radius: 3px;
          overflow: hidden;
        }
        .tts-progress-bar {
          width: 35%;
          height: 100%;
          background: linear-gradient(90deg, #4CAF50, #8BC34A);
        }
        .tts-speed { font-size: 14px; color: #666; }
      </style>
    </head>
    <body>
      <h1>Introduction to Climate Science</h1>
      <p class="highlight-sentence">
        Climate change refers to long-term shifts in temperatures and weather patterns.
        These shifts may be natural, but since the 1800s, human activities have been the
        main driver of <span class="highlight-word">climate</span> change, primarily due to the burning of fossil fuels.
      </p>
      <p>
        The Earth's average temperature has increased by about 1.1°C since the pre-industrial
        era. This warming is causing glaciers to melt, sea levels to rise, and extreme weather
        events to become more frequent and intense.
      </p>
      <p>
        Scientists use various methods to study climate patterns, including ice cores, tree
        rings, and satellite observations. These data sources help us understand both past
        and present climate conditions.
      </p>

      <div class="assist-tts-bar">
        <button class="tts-btn playing">⏸</button>
        <div class="tts-progress">
          <div class="tts-progress-bar"></div>
        </div>
        <span class="tts-speed">1.0x</span>
        <button class="tts-btn" style="background: #2196F3; width: 36px; height: 36px; font-size: 14px;">⏹</button>
      </div>
    </body>
    </html>
  `);

  await page.waitForTimeout(500);

  await page.screenshot({
    path: path.join(outputDir, '2-tts-highlighting.png')
  });
  console.log('  ✓ Saved: 2-tts-highlighting.png');

  await page.close();
}

/**
 * Screenshot 3: Sticky notes on a page
 */
async function captureStickyNotes(context, extensionId) {
  const page = await context.newPage();
  await page.setViewportSize(VIEWPORT);

  // Create a Canvas-like page with sticky notes
  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          margin: 0;
          padding: 0;
          background: #f5f5f5;
        }

        /* Canvas-like header */
        .canvas-header {
          background: #b71c1c;
          color: white;
          padding: 12px 24px;
          display: flex;
          align-items: center;
          gap: 20px;
        }
        .canvas-header h1 { font-size: 18px; margin: 0; font-weight: 500; }
        .canvas-nav { display: flex; gap: 24px; }
        .canvas-nav a { color: rgba(255,255,255,0.9); text-decoration: none; font-size: 14px; }

        .content {
          max-width: 900px;
          margin: 30px auto;
          padding: 30px;
          background: white;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }

        h2 { color: #333; margin-bottom: 20px; }
        p { line-height: 1.7; color: #555; }

        /* Sticky note styling */
        .sticky-note {
          position: absolute;
          width: 220px;
          background: #fff9c4;
          border-radius: 4px;
          box-shadow: 2px 3px 10px rgba(0,0,0,0.2);
          font-family: 'Patrick Hand', cursive, sans-serif;
          overflow: hidden;
        }
        .sticky-header {
          background: rgba(0,0,0,0.05);
          padding: 8px 12px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 11px;
          color: #666;
        }
        .sticky-content {
          padding: 12px;
          font-size: 14px;
          line-height: 1.5;
          color: #333;
        }
        .sticky-tag {
          display: inline-block;
          background: #e3f2fd;
          color: #1976d2;
          padding: 2px 8px;
          border-radius: 10px;
          font-size: 10px;
          margin-top: 8px;
        }

        .note-1 { top: 120px; right: 80px; transform: rotate(2deg); }
        .note-2 { top: 350px; right: 50px; transform: rotate(-1deg); background: #f3e5f5; }
        .note-3 { top: 280px; left: 60px; transform: rotate(-3deg); background: #e8f5e9; }

        /* Highlight in text */
        .user-highlight {
          background: linear-gradient(120deg, #fff176 0%, #fff59d 100%);
          padding: 1px 3px;
        }
      </style>
    </head>
    <body>
      <div class="canvas-header">
        <h1>📚 Introduction to Psychology</h1>
        <nav class="canvas-nav">
          <a href="#">Home</a>
          <a href="#">Modules</a>
          <a href="#">Assignments</a>
          <a href="#">Grades</a>
        </nav>
      </div>

      <div class="content">
        <h2>Module 3: Cognitive Development</h2>
        <p>
          Jean Piaget's theory of <span class="user-highlight">cognitive development</span>
          suggests that children move through four different stages of mental development.
          His theory focuses not only on understanding how children acquire knowledge,
          but also on understanding the nature of intelligence.
        </p>
        <p>
          Piaget believed that children take an active role in the learning process,
          acting much like little scientists as they perform experiments, make observations,
          and learn about the world. As kids interact with the world around them, they
          continually add new knowledge, build upon existing knowledge, and adapt
          previously held ideas to accommodate new information.
        </p>
        <p>
          The four stages are: <strong>Sensorimotor</strong> (birth to 2 years),
          <strong>Preoperational</strong> (2 to 7 years), <strong>Concrete Operational</strong>
          (7 to 11 years), and <strong>Formal Operational</strong> (12 years and up).
        </p>
      </div>

      <!-- Sticky Notes -->
      <div class="sticky-note note-1">
        <div class="sticky-header">
          <span>📌 Note</span>
          <span>Jan 15</span>
        </div>
        <div class="sticky-content">
          Remember: Piaget's 4 stages will be on the midterm exam!
          <div class="sticky-tag">#exam-prep</div>
        </div>
      </div>

      <div class="sticky-note note-2">
        <div class="sticky-header">
          <span>💡 Idea</span>
          <span>Jan 16</span>
        </div>
        <div class="sticky-content">
          Compare with Vygotsky's theory for essay assignment
          <div class="sticky-tag">#assignment</div>
        </div>
      </div>

      <div class="sticky-note note-3">
        <div class="sticky-header">
          <span>❓ Question</span>
          <span>Jan 14</span>
        </div>
        <div class="sticky-content">
          Ask professor about zone of proximal development
          <div class="sticky-tag">#ask-prof</div>
        </div>
      </div>
    </body>
    </html>
  `);

  await page.waitForTimeout(500);

  await page.screenshot({
    path: path.join(outputDir, '3-sticky-notes.png')
  });
  console.log('  ✓ Saved: 3-sticky-notes.png');

  await page.close();
}

/**
 * Screenshot 4: Citation manager interface
 */
async function captureCitationManager(context, extensionId) {
  const page = await context.newPage();
  await page.setViewportSize(VIEWPORT);

  // Create citation manager mock
  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        * { box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          margin: 0;
          padding: 40px;
          background: #f0f2f5;
        }

        .citation-manager {
          max-width: 900px;
          margin: 0 auto;
          background: white;
          border-radius: 12px;
          box-shadow: 0 2px 12px rgba(0,0,0,0.1);
          overflow: hidden;
        }

        .cm-header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 24px;
        }
        .cm-header h1 { margin: 0 0 8px; font-size: 24px; display: flex; align-items: center; gap: 10px; }
        .cm-header p { margin: 0; opacity: 0.9; font-size: 14px; }

        .cm-toolbar {
          display: flex;
          gap: 12px;
          padding: 16px 24px;
          border-bottom: 1px solid #eee;
          background: #fafafa;
        }
        .cm-btn {
          padding: 8px 16px;
          border: none;
          border-radius: 6px;
          font-size: 13px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .cm-btn-primary { background: #667eea; color: white; }
        .cm-btn-secondary { background: white; border: 1px solid #ddd; }

        .cm-search {
          flex: 1;
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-size: 14px;
        }

        .cm-content {
          display: flex;
          min-height: 400px;
        }

        .cm-sidebar {
          width: 200px;
          border-right: 1px solid #eee;
          padding: 16px;
        }
        .cm-sidebar h3 { font-size: 12px; color: #666; margin: 0 0 12px; text-transform: uppercase; }
        .cm-folder {
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 14px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 4px;
        }
        .cm-folder:hover { background: #f5f5f5; }
        .cm-folder.active { background: #e8eaf6; color: #3f51b5; }
        .cm-count { margin-left: auto; background: #eee; padding: 2px 8px; border-radius: 10px; font-size: 11px; }

        .cm-list {
          flex: 1;
          padding: 16px;
        }

        .citation-item {
          padding: 16px;
          border: 1px solid #eee;
          border-radius: 8px;
          margin-bottom: 12px;
          transition: all 0.2s;
        }
        .citation-item:hover { border-color: #667eea; box-shadow: 0 2px 8px rgba(102,126,234,0.15); }
        .citation-item.selected { border-color: #667eea; background: #f8f9ff; }

        .ci-type { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
        .ci-title { font-size: 15px; font-weight: 600; color: #333; margin-bottom: 6px; }
        .ci-authors { font-size: 13px; color: #666; margin-bottom: 4px; }
        .ci-meta { font-size: 12px; color: #999; }

        .ci-actions {
          display: flex;
          gap: 8px;
          margin-top: 12px;
        }
        .ci-action {
          font-size: 11px;
          color: #667eea;
          background: none;
          border: 1px solid #667eea;
          padding: 4px 10px;
          border-radius: 4px;
          cursor: pointer;
        }
        .ci-action:hover { background: #667eea; color: white; }

        .format-badge {
          display: inline-block;
          padding: 2px 8px;
          background: #e8f5e9;
          color: #2e7d32;
          border-radius: 4px;
          font-size: 11px;
          margin-left: 8px;
        }
      </style>
    </head>
    <body>
      <div class="citation-manager">
        <div class="cm-header">
          <h1>📚 Citation Manager</h1>
          <p>23 sources saved • APA 7th Edition</p>
        </div>

        <div class="cm-toolbar">
          <button class="cm-btn cm-btn-primary">+ Add Citation</button>
          <button class="cm-btn cm-btn-secondary">📋 Export All</button>
          <input type="text" class="cm-search" placeholder="Search citations..." value="cognitive">
          <button class="cm-btn cm-btn-secondary">APA ▾</button>
        </div>

        <div class="cm-content">
          <div class="cm-sidebar">
            <h3>Collections</h3>
            <div class="cm-folder active">📁 All Sources <span class="cm-count">23</span></div>
            <div class="cm-folder">📗 Psychology Essay <span class="cm-count">8</span></div>
            <div class="cm-folder">📘 Research Methods <span class="cm-count">12</span></div>
            <div class="cm-folder">📙 Final Project <span class="cm-count">3</span></div>
            <h3 style="margin-top: 20px;">Tags</h3>
            <div class="cm-folder">🏷️ peer-reviewed</div>
            <div class="cm-folder">🏷️ primary source</div>
          </div>

          <div class="cm-list">
            <div class="citation-item selected">
              <div class="ci-type">📄 Journal Article</div>
              <div class="ci-title">Cognitive Development in Adolescence: A Longitudinal Study <span class="format-badge">APA</span></div>
              <div class="ci-authors">Smith, J. A., & Johnson, M. B.</div>
              <div class="ci-meta">Journal of Developmental Psychology, 2023, Vol. 45(3), pp. 234-256</div>
              <div class="ci-actions">
                <button class="ci-action">Copy Citation</button>
                <button class="ci-action">View PDF</button>
                <button class="ci-action">Edit</button>
              </div>
            </div>

            <div class="citation-item">
              <div class="ci-type">📚 Book</div>
              <div class="ci-title">Introduction to Cognitive Psychology: Theory and Practice</div>
              <div class="ci-authors">Williams, R. C.</div>
              <div class="ci-meta">Oxford University Press, 2022 • ISBN: 978-0-19-874523-1</div>
              <div class="ci-actions">
                <button class="ci-action">Copy Citation</button>
                <button class="ci-action">Edit</button>
              </div>
            </div>

            <div class="citation-item">
              <div class="ci-type">🌐 Website</div>
              <div class="ci-title">Understanding Working Memory: A Practical Guide</div>
              <div class="ci-authors">American Psychological Association</div>
              <div class="ci-meta">Retrieved January 20, 2024 from https://www.apa.org/topics/memory</div>
              <div class="ci-actions">
                <button class="ci-action">Copy Citation</button>
                <button class="ci-action">Visit Page</button>
                <button class="ci-action">Edit</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `);

  await page.waitForTimeout(500);

  await page.screenshot({
    path: path.join(outputDir, '4-citation-manager.png')
  });
  console.log('  ✓ Saved: 4-citation-manager.png');

  await page.close();
}

/**
 * Screenshot 5: Settings/customization panel
 */
async function captureSettingsPanel(context, extensionId) {
  const page = await context.newPage();
  await page.setViewportSize(VIEWPORT);

  // Create settings panel mock
  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        * { box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          margin: 0;
          padding: 40px;
          background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
          min-height: 100vh;
        }

        .settings-panel {
          max-width: 700px;
          margin: 0 auto;
          background: white;
          border-radius: 16px;
          box-shadow: 0 4px 24px rgba(0,0,0,0.1);
          overflow: hidden;
        }

        .sp-header {
          background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
          color: white;
          padding: 24px 32px;
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .sp-header-icon { font-size: 32px; }
        .sp-header h1 { margin: 0; font-size: 22px; }
        .sp-header p { margin: 4px 0 0; opacity: 0.9; font-size: 13px; }

        .sp-tabs {
          display: flex;
          border-bottom: 1px solid #eee;
          padding: 0 24px;
        }
        .sp-tab {
          padding: 14px 20px;
          font-size: 14px;
          color: #666;
          border-bottom: 2px solid transparent;
          cursor: pointer;
        }
        .sp-tab:hover { color: #333; }
        .sp-tab.active { color: #11998e; border-bottom-color: #11998e; font-weight: 500; }

        .sp-content {
          padding: 24px 32px;
        }

        .setting-group {
          margin-bottom: 28px;
        }
        .sg-title {
          font-size: 16px;
          font-weight: 600;
          color: #333;
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .setting-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 0;
          border-bottom: 1px solid #f5f5f5;
        }
        .setting-row:last-child { border-bottom: none; }

        .sr-label {
          font-size: 14px;
          color: #333;
        }
        .sr-desc {
          font-size: 12px;
          color: #999;
          margin-top: 4px;
        }

        /* Toggle switch */
        .toggle {
          width: 48px;
          height: 26px;
          background: #ddd;
          border-radius: 13px;
          position: relative;
          cursor: pointer;
          transition: background 0.3s;
        }
        .toggle.on { background: #11998e; }
        .toggle::after {
          content: '';
          position: absolute;
          width: 22px;
          height: 22px;
          background: white;
          border-radius: 50%;
          top: 2px;
          left: 2px;
          transition: transform 0.3s;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        .toggle.on::after { transform: translateX(22px); }

        /* Slider */
        .slider-container {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .slider {
          width: 120px;
          height: 6px;
          background: #eee;
          border-radius: 3px;
          position: relative;
        }
        .slider-fill {
          height: 100%;
          background: linear-gradient(90deg, #11998e, #38ef7d);
          border-radius: 3px;
          width: 70%;
        }
        .slider-thumb {
          width: 16px;
          height: 16px;
          background: white;
          border: 2px solid #11998e;
          border-radius: 50%;
          position: absolute;
          top: -5px;
          left: calc(70% - 8px);
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        .slider-value {
          font-size: 13px;
          color: #333;
          font-weight: 500;
          min-width: 40px;
        }

        /* Select */
        .select {
          padding: 8px 32px 8px 12px;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-size: 13px;
          background: white url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 8L1 3h10z'/%3E%3C/svg%3E") no-repeat right 10px center;
          appearance: none;
          min-width: 150px;
        }

        /* Color picker preview */
        .color-options {
          display: flex;
          gap: 8px;
        }
        .color-swatch {
          width: 28px;
          height: 28px;
          border-radius: 6px;
          border: 2px solid transparent;
          cursor: pointer;
        }
        .color-swatch.selected { border-color: #333; }

        .profile-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #e8f5e9;
          color: #2e7d32;
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 12px;
          margin-left: auto;
        }
      </style>
    </head>
    <body>
      <div class="settings-panel">
        <div class="sp-header">
          <span class="sp-header-icon">⚙️</span>
          <div>
            <h1>AssisT Settings</h1>
            <p>Customize your accessibility experience</p>
          </div>
          <div class="profile-badge">👤 Study Mode Active</div>
        </div>

        <div class="sp-tabs">
          <div class="sp-tab active">🔊 Reading</div>
          <div class="sp-tab">🎨 Display</div>
          <div class="sp-tab">⌨️ Keyboard</div>
          <div class="sp-tab">🔌 Integrations</div>
        </div>

        <div class="sp-content">
          <div class="setting-group">
            <div class="sg-title">🔊 Text-to-Speech</div>

            <div class="setting-row">
              <div>
                <div class="sr-label">Enable TTS</div>
                <div class="sr-desc">Read selected text aloud</div>
              </div>
              <div class="toggle on"></div>
            </div>

            <div class="setting-row">
              <div>
                <div class="sr-label">Voice</div>
                <div class="sr-desc">Choose your preferred voice</div>
              </div>
              <select class="select">
                <option>Microsoft Zira</option>
                <option>Google US English</option>
              </select>
            </div>

            <div class="setting-row">
              <div>
                <div class="sr-label">Reading Speed</div>
                <div class="sr-desc">Adjust playback rate</div>
              </div>
              <div class="slider-container">
                <div class="slider">
                  <div class="slider-fill"></div>
                  <div class="slider-thumb"></div>
                </div>
                <span class="slider-value">1.2x</span>
              </div>
            </div>

            <div class="setting-row">
              <div>
                <div class="sr-label">Word Highlighting</div>
                <div class="sr-desc">Highlight words as they're read</div>
              </div>
              <div class="toggle on"></div>
            </div>
          </div>

          <div class="setting-group">
            <div class="sg-title">✨ Highlight Colors</div>

            <div class="setting-row">
              <div>
                <div class="sr-label">Current Word</div>
                <div class="sr-desc">Color for active word</div>
              </div>
              <div class="color-options">
                <div class="color-swatch selected" style="background: #84fab0;"></div>
                <div class="color-swatch" style="background: #ffd54f;"></div>
                <div class="color-swatch" style="background: #81d4fa;"></div>
                <div class="color-swatch" style="background: #f48fb1;"></div>
              </div>
            </div>

            <div class="setting-row">
              <div>
                <div class="sr-label">Sentence Background</div>
                <div class="sr-desc">Highlight entire sentence</div>
              </div>
              <div class="toggle on"></div>
            </div>
          </div>

          <div class="setting-group">
            <div class="sg-title">📖 Reading Assistance</div>

            <div class="setting-row">
              <div>
                <div class="sr-label">Dyslexia-Friendly Font</div>
                <div class="sr-desc">OpenDyslexic or similar font</div>
              </div>
              <div class="toggle"></div>
            </div>

            <div class="setting-row">
              <div>
                <div class="sr-label">Reading Guide</div>
                <div class="sr-desc">Line ruler that follows cursor</div>
              </div>
              <div class="toggle on"></div>
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `);

  await page.waitForTimeout(500);

  await page.screenshot({
    path: path.join(outputDir, '5-settings-panel.png')
  });
  console.log('  ✓ Saved: 5-settings-panel.png');

  await page.close();
}

// Run the capture
captureScreenshots().catch(console.error);
