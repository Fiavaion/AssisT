/**
 * Stargardt Module - Content Remapper
 *
 * Real-time DOM manipulation to reposition content around the scotoma.
 * Supports multiple remapping modes and integrates with gaze tracking.
 *
 * @module stargardt/content-remapper
 */

import * as scotomaProfile from './scotoma-profile.js';
import { showToast } from '../../core/ui/toast.js';

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let remapper_enabled = false;
let remapper_mode = 'peripheral-push'; // 'peripheral-push', 'text-donut', 'rsvp', 'magnify-remap'
let remapper_profile = null;
let remapper_settings = {};
let remapper_gazeTracker = null;
let remapper_animationFrameId = null;
let _remapper_styleElement = null; // Reserved for future CSS injection
let remapper_overlayElement = null;

// RSVP mode state
let rsvp_words = [];
let rsvp_currentIndex = 0;
let rsvp_intervalId = null;
let rsvp_wordsPerMinute = 300;

// Performance tracking
let lastFrameTime = 0;
const TARGET_FPS = 60;
const FRAME_BUDGET = 1000 / TARGET_FPS;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the content remapper
 *
 * @param {Object} profile - Scotoma profile
 * @param {Object} settings - Remapping settings
 * @param {Object} gazeTracker - Optional gaze tracker for advanced mode
 */
export function initialize(profile, settings, gazeTracker = null) {
  console.log('[ContentRemapper] Initializing...');

  remapper_profile = profile;
  remapper_settings = settings || {};
  remapper_mode = settings?.mode || 'peripheral-push';
  remapper_gazeTracker = gazeTracker;

  // Create style element for CSS-based remapping
  injectStyles();

  console.log('[ContentRemapper] Initialized with mode:', remapper_mode);
}

/**
 * Enable content remapping
 */
export function enable() {
  if (remapper_enabled) return;

  console.log('[ContentRemapper] Enabling...');
  remapper_enabled = true;
  showToast(`Content Remapping: ${remapper_mode} mode active`, 'info');

  // Start appropriate mode
  switch (remapper_mode) {
    case 'peripheral-push':
      enablePeripheralPush();
      break;
    case 'text-donut':
      enableTextDonut();
      break;
    case 'rsvp':
      enableRSVP();
      break;
    case 'magnify-remap':
      enableMagnifyRemap();
      break;
    default:
      enablePeripheralPush();
  }

  // Start animation loop for gaze-aware remapping
  if (remapper_gazeTracker) {
    startGazeAwareLoop();
  }

  console.log('[ContentRemapper] Enabled');
}

/**
 * Disable content remapping
 */
export function disable() {
  if (!remapper_enabled) return;

  console.log('[ContentRemapper] Disabling...');
  remapper_enabled = false;

  // Stop animation loop
  if (remapper_animationFrameId) {
    cancelAnimationFrame(remapper_animationFrameId);
    remapper_animationFrameId = null;
  }

  // Stop RSVP if running
  if (rsvp_intervalId) {
    clearInterval(rsvp_intervalId);
    rsvp_intervalId = null;
  }

  // Cleanup keyboard handlers
  cleanupRSVPKeyboard();

  // Cleanup peripheral push (including Reading Mode)
  cleanupPeripheralPush();

  // Remove overlay
  if (remapper_overlayElement) {
    remapper_overlayElement.remove();
    remapper_overlayElement = null;
  }

  // Reset all CSS transforms
  resetAllTransforms();

  console.log('[ContentRemapper] Disabled');
}

/**
 * Update settings
 */
export function updateSettings(settings) {
  const previousSide = remapper_settings.preferredSide;
  const previousMode = remapper_mode;

  remapper_settings = { ...remapper_settings, ...settings };

  if (settings.mode && settings.mode !== previousMode) {
    // Mode changed - restart with new mode
    if (remapper_enabled) {
      disable();
      remapper_mode = settings.mode;
      enable();
    } else {
      remapper_mode = settings.mode;
    }
  } else if (settings.preferredSide && settings.preferredSide !== previousSide && remapper_enabled) {
    // Preferred side changed while enabled - re-apply current mode
    console.log('[ContentRemapper] Preferred side changed to:', settings.preferredSide);
    if (remapper_mode === 'peripheral-push') {
      // Re-create the peripheral push panel with new side
      enablePeripheralPush();
    }
  }
}

// ============================================================================
// STYLE INJECTION
// ============================================================================

/**
 * Inject CSS styles for content remapping
 */
function injectStyles() {
  if (document.getElementById('stargardt-remapper-styles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'stargardt-remapper-styles';
  style.textContent = `
    /* Remapper base styles */
    .stargardt-remap-container {
      transition: transform 0.1s ease-out;
      will-change: transform;
    }

    .stargardt-remap-text {
      transition: transform 0.05s ease-out;
    }

    /* RSVP overlay */
    .stargardt-rsvp-overlay {
      position: fixed;
      z-index: 2147483640;
      background: rgba(0, 0, 0, 0.95);
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    }

    .stargardt-rsvp-drag-handle {
      width: 100%;
      height: 32px;
      cursor: move;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #666;
      font-size: 12px;
      border-bottom: 1px solid #333;
      margin-bottom: 16px;
      user-select: none;
    }

    .stargardt-rsvp-drag-handle::before {
      content: '⋮⋮ Drag to move | Space=Pause | ←→=Speed | Esc=Close ⋮⋮';
    }

    .stargardt-rsvp-word {
      font-size: 56px;
      font-weight: 600;
      color: #ffffff;
      text-align: center;
      height: 100px;
      padding: 0 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      max-width: 460px;
      word-break: break-word;
      overflow-wrap: break-word;
      box-sizing: border-box;
      flex-shrink: 0;
    }

    .stargardt-rsvp-info {
      color: #a0a0b0;
      font-size: 14px;
      margin: 12px 0;
    }

    .stargardt-rsvp-controls {
      display: flex;
      gap: 12px;
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid #333;
    }

    .stargardt-rsvp-btn {
      padding: 10px 20px;
      background: #6366f1;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      cursor: pointer;
      min-width: 80px;
    }

    .stargardt-rsvp-btn:hover {
      background: #5558e3;
    }

    .stargardt-rsvp-speed {
      color: #808090;
      font-size: 12px;
      margin-top: 12px;
    }

    /* Scotoma indicator overlay */
    .stargardt-scotoma-indicator {
      position: fixed;
      pointer-events: none;
      z-index: 2147483639;
      border: 4px solid rgba(255, 50, 50, 0.7);
      border-radius: 50%;
      background: rgba(255, 100, 100, 0.15);
      box-shadow: 0 0 20px rgba(255, 50, 50, 0.4);
    }

    /* Safe zone highlight */
    .stargardt-safe-zone {
      position: fixed;
      pointer-events: none;
      z-index: 2147483638;
      border: 2px solid rgba(100, 255, 100, 0.3);
      background: rgba(100, 255, 100, 0.05);
    }

    /* Magnification lens */
    .stargardt-magnify-lens {
      position: fixed;
      pointer-events: none;
      z-index: 2147483641;
      border: 3px solid #6366f1;
      border-radius: 50%;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    }

    /* Performance: GPU acceleration */
    .stargardt-gpu-accelerated {
      transform: translateZ(0);
      backface-visibility: hidden;
    }
  `;

  document.head.appendChild(style);
  remapper_styleElement = style;
}

// ============================================================================
// MODE: PERIPHERAL PUSH (Self-contained reading panel)
// ============================================================================

// Track our own overlay
let peripheralPush_overlay = null;

/**
 * Enable peripheral push mode
 * Creates a clean reading panel positioned in peripheral vision
 */
async function enablePeripheralPush() {
  console.log('[ContentRemapper] Enabling Peripheral Push mode');
  console.log('[ContentRemapper] Profile:', remapper_profile);
  console.log('[ContentRemapper] Settings:', remapper_settings);

  // Use default profile if none provided
  let profile = remapper_profile;
  if (!profile) {
    console.log('[ContentRemapper] No profile - using defaults');
    profile = {
      boundary: {
        centerX: 50,
        centerY: 50,
        radiusX: 10,
        radiusY: 10,
      },
    };
  }

  // Get preferred side for content positioning
  const preferredSide = remapper_settings.preferredSide || 'right';
  console.log('[ContentRemapper] Preferred side:', preferredSide);

  // Extract text content from the page
  const textContent = extractArticleContent();
  console.log('[ContentRemapper] Extracted content items:', textContent?.length || 0);

  if (!textContent || textContent.length === 0) {
    showToast('Could not extract readable content from this page', 'warning');
    return;
  }

  // Create our own peripheral reading overlay
  createPeripheralReadingPanel(textContent, preferredSide, profile);

  console.log('[ContentRemapper] Peripheral reading panel created');
}

/**
 * Extract article content from the page
 * Uses multiple strategies to find readable content
 */
function extractArticleContent() {
  console.log('[ContentRemapper] Extracting article content...');

  // Strategy 1: Try semantic article selectors
  const selectors = [
    'article',
    '[role="main"]',
    'main',
    '.article-content',
    '.post-content',
    '.entry-content',
    '.story-body',
    '#article-body',
    '.article__body',
    '.article-body',
    '.content-body',
    '.story-content',
    '.rte-article', // RTE specific
    '.article',
  ];

  let contentElement = null;

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el && el.textContent.trim().length > 100) {
      console.log('[ContentRemapper] Found content using selector:', selector);
      contentElement = el;
      break;
    }
  }

  // Strategy 2: Find container with most paragraphs
  if (!contentElement) {
    console.log('[ContentRemapper] Trying paragraph-based detection...');
    const allDivs = document.querySelectorAll('div, section, article');
    let bestContainer = null;
    let maxParagraphs = 0;

    allDivs.forEach(div => {
      const paragraphs = div.querySelectorAll('p');
      if (paragraphs.length > maxParagraphs) {
        maxParagraphs = paragraphs.length;
        bestContainer = div;
      }
    });

    if (bestContainer && maxParagraphs >= 2) {
      console.log('[ContentRemapper] Found container with', maxParagraphs, 'paragraphs');
      contentElement = bestContainer;
    }
  }

  // Strategy 3: Just get all paragraphs from body
  if (!contentElement) {
    console.log('[ContentRemapper] Using body as fallback');
    contentElement = document.body;
  }

  // Extract paragraphs and headings
  const elements = contentElement.querySelectorAll('p, h1, h2, h3, h4, h5, h6');
  const content = [];

  elements.forEach(el => {
    const text = el.textContent.trim();
    // Filter out very short text and navigation/UI text
    if (text.length > 20 && !isNavigationText(text)) {
      const tag = el.tagName.toLowerCase();
      content.push({ tag, text });
    }
  });

  console.log('[ContentRemapper] Extracted', content.length, 'content items');

  // If still nothing, try getting visible text directly
  if (content.length === 0) {
    console.log('[ContentRemapper] Last resort - extracting visible text');
    const bodyText = document.body.innerText || '';
    const sentences = bodyText.split(/[.!?]+/).filter(s => s.trim().length > 30);
    sentences.slice(0, 50).forEach(sentence => {
      content.push({ tag: 'p', text: sentence.trim() + '.' });
    });
  }

  return content;
}

/**
 * Check if text looks like navigation/UI text rather than article content
 */
function isNavigationText(text) {
  const lowerText = text.toLowerCase();
  const navPatterns = [
    'cookie', 'privacy', 'subscribe', 'sign in', 'log in', 'menu',
    'search', 'share', 'follow us', 'copyright', 'all rights reserved',
  ];
  return navPatterns.some(pattern => lowerText.includes(pattern)) && text.length < 100;
}

/**
 * Create the peripheral reading panel
 * @param {Array} content - Array of {tag, text} objects
 * @param {string} preferredSide - 'left' or 'right'
 * @param {Object} profile - Scotoma profile with boundary info
 */
function createPeripheralReadingPanel(content, preferredSide, profile) {
  console.log('[ContentRemapper] Creating peripheral reading panel...');
  console.log('[ContentRemapper] Profile boundary:', profile?.boundary);

  // Remove existing overlay if any
  if (peripheralPush_overlay) {
    peripheralPush_overlay.remove();
  }

  // Calculate scotoma position from profile
  const viewWidth = window.innerWidth;
  const viewHeight = window.innerHeight;
  const boundary = profile?.boundary || { centerX: 50, centerY: 50, radiusX: 10, radiusY: 10 };
  const scotomaCenterX = (boundary.centerX / 100) * viewWidth;
  const scotomaCenterY = (boundary.centerY / 100) * viewHeight;
  const scotomaRadiusX = (boundary.radiusX / 100) * viewWidth;
  const scotomaRadiusY = (boundary.radiusY / 100) * viewHeight;

  console.log('[ContentRemapper] Scotoma position:', { scotomaCenterX, scotomaCenterY, scotomaRadiusX, scotomaRadiusY });

  // Create full-screen overlay
  const overlay = document.createElement('div');
  overlay.id = 'stargardt-peripheral-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 2147483640;
    background: #f5f5f0;
    overflow: hidden;
  `;

  // Create scotoma visualization (the blocked center area)
  const scotomaZone = document.createElement('div');
  scotomaZone.id = 'stargardt-scotoma-zone';
  scotomaZone.style.cssText = `
    position: absolute;
    left: ${scotomaCenterX - scotomaRadiusX}px;
    top: ${scotomaCenterY - scotomaRadiusY}px;
    width: ${scotomaRadiusX * 2}px;
    height: ${scotomaRadiusY * 2}px;
    border-radius: 50%;
    background: rgba(180, 180, 180, 0.4);
    border: 3px dashed rgba(150, 150, 150, 0.6);
    pointer-events: none;
  `;

  // Calculate reading panel position based on preferred side
  let panelStyles = '';

  switch (preferredSide) {
    case 'left': {
      const panelWidth = Math.max(350, scotomaCenterX - scotomaRadiusX - 60);
      panelStyles = `
        left: 30px;
        top: 60px;
        width: ${panelWidth}px;
        height: calc(100% - 120px);
      `;
      break;
    }
    case 'above': {
      const panelHeight = Math.max(200, scotomaCenterY - scotomaRadiusY - 80);
      panelStyles = `
        left: 30px;
        top: 60px;
        width: calc(100% - 60px);
        height: ${panelHeight}px;
      `;
      break;
    }
    case 'below': {
      const panelTop = scotomaCenterY + scotomaRadiusY + 30;
      const panelHeight = Math.max(200, viewHeight - panelTop - 30);
      panelStyles = `
        left: 30px;
        top: ${panelTop}px;
        width: calc(100% - 60px);
        height: ${panelHeight}px;
      `;
      break;
    }
    case 'right':
    default: {
      const panelLeft = scotomaCenterX + scotomaRadiusX + 30;
      const panelWidth = Math.max(350, viewWidth - panelLeft - 30);
      panelStyles = `
        left: ${panelLeft}px;
        top: 60px;
        width: ${panelWidth}px;
        height: calc(100% - 120px);
      `;
      break;
    }
  }

  // Create reading panel
  const panel = document.createElement('div');
  panel.id = 'stargardt-reading-panel';
  panel.style.cssText = `
    position: absolute;
    ${panelStyles}
    overflow-y: auto;
    padding: 30px;
    box-sizing: border-box;
    background: #fffef8;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.1);
  `;

  // Add content to panel
  content.forEach(item => {
    const el = document.createElement(item.tag.startsWith('h') ? item.tag : 'p');
    el.textContent = item.text;

    if (item.tag.startsWith('h')) {
      el.style.cssText = `
        font-family: Georgia, serif;
        font-size: ${item.tag === 'h1' ? '28px' : item.tag === 'h2' ? '24px' : '20px'};
        font-weight: bold;
        margin: 0.8em 0 0.4em 0;
        color: #222;
        line-height: 1.3;
      `;
    } else {
      el.style.cssText = `
        font-family: Georgia, serif;
        font-size: 20px;
        line-height: 2.0;
        margin: 0 0 1.2em 0;
        color: #333;
        letter-spacing: 0.3px;
      `;
    }

    panel.appendChild(el);
  });

  // Create close button
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕ Close';
  closeBtn.style.cssText = `
    position: fixed;
    top: 15px;
    right: 20px;
    padding: 10px 20px;
    background: #666;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
    z-index: 10;
  `;
  closeBtn.onclick = () => disable();

  // Create info label
  const infoLabel = document.createElement('div');
  infoLabel.style.cssText = `
    position: fixed;
    top: 15px;
    left: 20px;
    padding: 8px 16px;
    background: rgba(0,0,0,0.7);
    color: white;
    border-radius: 6px;
    font-size: 13px;
    font-family: system-ui, sans-serif;
  `;
  infoLabel.textContent = `Peripheral Push Mode • Content on ${preferredSide} • Gray area = scotoma`;

  overlay.appendChild(scotomaZone);
  overlay.appendChild(panel);
  overlay.appendChild(closeBtn);
  overlay.appendChild(infoLabel);

  document.body.appendChild(overlay);
  peripheralPush_overlay = overlay;
  remapper_overlayElement = overlay;
}

/**
 * Cleanup peripheral push mode
 */
function cleanupPeripheralPush() {
  if (peripheralPush_overlay) {
    peripheralPush_overlay.remove();
    peripheralPush_overlay = null;
  }
}

// ============================================================================
// MODE: TEXT DONUT FLOW
// ============================================================================

/**
 * Enable text donut flow mode
 * Text flows in a ring around the scotoma
 */
function enableTextDonut() {
  console.log('[ContentRemapper] Enabling Text Donut mode');

  if (!remapper_profile) return;

  // Create donut container overlay
  const overlay = document.createElement('div');
  overlay.id = 'stargardt-donut-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 2147483640;
    pointer-events: none;
    background: rgba(0, 0, 0, 0.85);
  `;

  // Extract text content
  const textContent = extractPageText();

  // Create donut-shaped text container
  const donutContainer = createDonutContainer(textContent);
  overlay.appendChild(donutContainer);

  document.body.appendChild(overlay);
  remapper_overlayElement = overlay;
}

/**
 * Create donut-shaped text container
 */
function createDonutContainer(text) {
  const container = document.createElement('div');
  container.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 80%;
    height: 80%;
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    justify-content: center;
    padding: 40px;
    color: #ffffff;
    font-size: 18px;
    line-height: 2;
    pointer-events: auto;
    overflow-y: auto;
  `;

  // Calculate scotoma center hole
  const centerX = remapper_profile.boundary.centerX;
  const centerY = remapper_profile.boundary.centerY;
  const radiusX = remapper_profile.boundary.radiusX + 5; // Add margin
  const radiusY = remapper_profile.boundary.radiusY + 5;

  // Create CSS clip-path for donut shape
  container.style.clipPath = `polygon(
    0 0, 100% 0, 100% 100%, 0 100%, 0 0,
    ${centerX - radiusX}% ${centerY}%,
    ${centerX}% ${centerY - radiusY}%,
    ${centerX + radiusX}% ${centerY}%,
    ${centerX}% ${centerY + radiusY}%,
    ${centerX - radiusX}% ${centerY}%
  )`;

  container.textContent = text;

  // Add close button
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕ Close';
  closeBtn.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 10px 20px;
    background: #6366f1;
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    z-index: 10;
  `;
  closeBtn.onclick = () => disable();
  container.appendChild(closeBtn);

  return container;
}

// ============================================================================
// MODE: RSVP (Rapid Serial Visual Presentation)
// ============================================================================

/**
 * Enable RSVP mode
 * Shows one word at a time at the PRL location
 */
function enableRSVP() {
  console.log('[ContentRemapper] Enabling RSVP mode');

  // Extract text content
  const text = extractPageText();
  rsvp_words = text.split(/\s+/).filter(w => w.length > 0);
  rsvp_currentIndex = 0;

  if (rsvp_words.length === 0) {
    console.warn('[ContentRemapper] No text content found for RSVP');
    return;
  }

  // Calculate PRL position
  const prl = scotomaProfile.calculatePRLPosition(remapper_profile);
  const prlX = (prl.x / 100) * window.innerWidth;
  const prlY = (prl.y / 100) * window.innerHeight;

  // Create RSVP overlay
  const overlay = document.createElement('div');
  overlay.className = 'stargardt-rsvp-overlay';
  overlay.id = 'stargardt-rsvp-overlay';
  overlay.style.cssText += `
    top: ${Math.max(50, prlY - 150)}px;
    left: ${Math.max(50, prlX - 250)}px;
    width: 500px;
    height: 300px;
  `;

  overlay.innerHTML = `
    <div class="stargardt-rsvp-drag-handle" id="rsvp-drag-handle"></div>
    <div class="stargardt-rsvp-word" id="rsvp-word">${rsvp_words[0]}</div>
    <div class="stargardt-rsvp-info">
      Word <span id="rsvp-count">1</span> of ${rsvp_words.length}
    </div>
    <div class="stargardt-rsvp-controls">
      <button class="stargardt-rsvp-btn" id="rsvp-slower">Slower</button>
      <button class="stargardt-rsvp-btn" id="rsvp-play-pause">⏸ Pause</button>
      <button class="stargardt-rsvp-btn" id="rsvp-faster">Faster</button>
      <button class="stargardt-rsvp-btn" id="rsvp-close" style="background: #dc3545;">Close</button>
    </div>
    <div class="stargardt-rsvp-speed">
      Speed: <span id="rsvp-speed">${rsvp_wordsPerMinute}</span> WPM
    </div>
  `;

  document.body.appendChild(overlay);
  remapper_overlayElement = overlay;

  // Set initial font size for first word
  const wordElement = document.getElementById('rsvp-word');
  if (wordElement && rsvp_words[0]) {
    wordElement.style.fontSize = getWordFontSize(rsvp_words[0].length);
  }

  // Bind controls
  document.getElementById('rsvp-play-pause').onclick = toggleRSVP;
  document.getElementById('rsvp-slower').onclick = () => adjustRSVPSpeed(-50);
  document.getElementById('rsvp-faster').onclick = () => adjustRSVPSpeed(50);
  document.getElementById('rsvp-close').onclick = () => disable();

  // Setup drag functionality
  setupRSVPDrag(overlay);

  // Setup keyboard controls (spacebar for pause/play)
  setupRSVPKeyboard();

  // Start RSVP
  startRSVP();
}

/**
 * Setup drag functionality for RSVP overlay
 */
function setupRSVPDrag(overlay) {
  const handle = document.getElementById('rsvp-drag-handle');
  if (!handle) return;

  let isDragging = false;
  let startX, startY, initialLeft, initialTop;

  handle.addEventListener('mousedown', e => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    initialLeft = overlay.offsetLeft;
    initialTop = overlay.offsetTop;
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    overlay.style.left = `${initialLeft + dx}px`;
    overlay.style.top = `${initialTop + dy}px`;
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
  });
}

// Store keyboard handler reference for cleanup
let rsvpKeyboardHandler = null;

/**
 * Setup keyboard controls for RSVP
 */
function setupRSVPKeyboard() {
  rsvpKeyboardHandler = e => {
    // Only respond when RSVP overlay is active
    if (!document.getElementById('stargardt-rsvp-overlay')) return;

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        toggleRSVP();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        adjustRSVPSpeed(-25);
        break;
      case 'ArrowRight':
        e.preventDefault();
        adjustRSVPSpeed(25);
        break;
      case 'Escape':
        e.preventDefault();
        disable();
        break;
    }
  };

  document.addEventListener('keydown', rsvpKeyboardHandler);
}

/**
 * Cleanup keyboard handler
 */
function cleanupRSVPKeyboard() {
  if (rsvpKeyboardHandler) {
    document.removeEventListener('keydown', rsvpKeyboardHandler);
    rsvpKeyboardHandler = null;
  }
}

/**
 * Calculate font size based on word length
 */
function getWordFontSize(length) {
  if (length <= 6) return '56px';
  if (length <= 10) return '44px';
  if (length <= 14) return '36px';
  if (length <= 18) return '28px';
  return '24px';
}

/**
 * Start RSVP playback
 */
function startRSVP() {
  const interval = 60000 / rsvp_wordsPerMinute; // ms per word

  rsvp_intervalId = setInterval(() => {
    rsvp_currentIndex++;

    if (rsvp_currentIndex >= rsvp_words.length) {
      // Loop back to start
      rsvp_currentIndex = 0;
    }

    const wordElement = document.getElementById('rsvp-word');
    const countElement = document.getElementById('rsvp-count');

    if (wordElement) {
      const word = rsvp_words[rsvp_currentIndex];
      wordElement.textContent = word;
      // Adjust font size for long words
      wordElement.style.fontSize = getWordFontSize(word.length);
    }
    if (countElement) {
      countElement.textContent = rsvp_currentIndex + 1;
    }
  }, interval);
}

/**
 * Toggle RSVP playback
 */
function toggleRSVP() {
  const btn = document.getElementById('rsvp-play-pause');

  if (rsvp_intervalId) {
    clearInterval(rsvp_intervalId);
    rsvp_intervalId = null;
    if (btn) btn.textContent = '▶ Play';
  } else {
    startRSVP();
    if (btn) btn.textContent = '⏸ Pause';
  }
}

/**
 * Adjust RSVP speed
 */
function adjustRSVPSpeed(delta) {
  rsvp_wordsPerMinute = Math.max(50, Math.min(1000, rsvp_wordsPerMinute + delta));

  const speedElement = document.getElementById('rsvp-speed');
  if (speedElement) {
    speedElement.textContent = rsvp_wordsPerMinute;
  }

  // Restart with new speed if playing
  if (rsvp_intervalId) {
    clearInterval(rsvp_intervalId);
    startRSVP();
  }
}

// ============================================================================
// MODE: MAGNIFY + REMAP
// ============================================================================

/**
 * Enable magnify + remap mode
 * Magnified content placed in peripheral vision
 */
function enableMagnifyRemap() {
  console.log('[ContentRemapper] Enabling Magnify + Remap mode');

  if (!remapper_profile) return;

  // Calculate PRL position for the magnified view
  const prl = scotomaProfile.calculatePRLPosition(remapper_profile);
  const prlX = (prl.x / 100) * window.innerWidth;
  const prlY = (prl.y / 100) * window.innerHeight;

  // Create magnification lens
  const lens = document.createElement('div');
  lens.className = 'stargardt-magnify-lens';
  lens.id = 'stargardt-magnify-lens';
  lens.style.cssText += `
    left: ${prlX - 150}px;
    top: ${prlY - 150}px;
    width: 300px;
    height: 300px;
  `;

  // Clone and magnify content
  const clonedContent = document.createElement('div');
  clonedContent.style.cssText = `
    transform: scale(2);
    transform-origin: center;
    width: 150px;
    height: 150px;
    overflow: hidden;
  `;

  // Add content (will be updated in animation loop)
  lens.appendChild(clonedContent);
  document.body.appendChild(lens);
  remapper_overlayElement = lens;

  // Start magnification tracking
  startMagnificationLoop();
}

/**
 * Start magnification content update loop
 */
function startMagnificationLoop() {
  const lens = document.getElementById('stargardt-magnify-lens');
  if (!lens) return;

  const updateMagnification = () => {
    if (!remapper_enabled) return;

    // Get current gaze position or use center
    // These will be used when magnification content positioning is implemented
    let _gazeX = window.innerWidth / 2;
    let _gazeY = window.innerHeight / 2;

    if (remapper_gazeTracker) {
      const gaze = remapper_gazeTracker.getLastGaze();
      if (gaze) {
        _gazeX = gaze.x;
        _gazeY = gaze.y;
      }
    }

    // TODO: Update lens content based on gaze position (_gazeX, _gazeY)
    // (In production, would clone and position actual DOM elements)

    remapper_animationFrameId = requestAnimationFrame(updateMagnification);
  };

  updateMagnification();
}

// ============================================================================
// GAZE-AWARE LOOP
// ============================================================================

/**
 * Start gaze-aware content remapping loop
 */
function startGazeAwareLoop() {
  if (!remapper_gazeTracker) return;

  const updateFromGaze = timestamp => {
    if (!remapper_enabled) return;

    // Throttle to target FPS
    if (timestamp - lastFrameTime < FRAME_BUDGET) {
      remapper_animationFrameId = requestAnimationFrame(updateFromGaze);
      return;
    }

    lastFrameTime = timestamp;

    const gaze = remapper_gazeTracker.getLastGaze();
    if (gaze) {
      updateRemappingFromGaze(gaze);
    }

    remapper_animationFrameId = requestAnimationFrame(updateFromGaze);
  };

  remapper_animationFrameId = requestAnimationFrame(updateFromGaze);
}

/**
 * Update remapping based on current gaze position
 */
function updateRemappingFromGaze(gaze) {
  // Update scotoma position based on gaze
  // The scotoma moves with the eye, so content needs to shift accordingly

  if (remapper_mode === 'peripheral-push') {
    // Recalculate shifts based on gaze position
    const mainContent = findMainContent();

    mainContent.forEach(element => {
      if (!element.classList.contains('stargardt-remap-container')) return;

      // Calculate dynamic shift based on gaze
      const rect = element.getBoundingClientRect();
      const gazeRelativeX = gaze.x - rect.left;
      const gazeRelativeY = gaze.y - rect.top;

      // Only shift if gaze is near the element
      if (
        gazeRelativeX > -100 &&
        gazeRelativeX < rect.width + 100 &&
        gazeRelativeY > -100 &&
        gazeRelativeY < rect.height + 100
      ) {
        const intensity = (remapper_settings.intensity || 50) / 100;
        const shiftX = calculateGazeShift(gazeRelativeX, rect.width) * intensity;
        const shiftY = calculateGazeShift(gazeRelativeY, rect.height) * intensity;

        element.style.transform = `translate(${shiftX}px, ${shiftY}px)`;
      }
    });
  }

  // Update scotoma indicator position if shown
  updateScotomaIndicatorPosition(gaze.x, gaze.y);
}

/**
 * Calculate shift based on gaze position
 */
function calculateGazeShift(gazePosition, dimension) {
  const center = dimension / 2;
  const offset = gazePosition - center;
  const maxShift = 100; // Maximum shift in pixels

  // Shift content away from gaze (scotoma)
  return -Math.sign(offset) * Math.min(Math.abs(offset) * 0.3, maxShift);
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Find main content elements on the page
 */
function findMainContent() {
  // Try semantic elements first
  const semantic = document.querySelectorAll('main, article, [role="main"], .content, #content');
  if (semantic.length > 0) {
    return Array.from(semantic);
  }

  // Fall back to large text containers
  const containers = document.querySelectorAll('div, section');
  return Array.from(containers).filter(el => {
    const text = el.textContent || '';
    return text.length > 200 && el.children.length < 50;
  }).slice(0, 10); // Limit to prevent performance issues
}

/**
 * Extract all text content from the page
 */
function extractPageText() {
  const mainContent = findMainContent();

  if (mainContent.length > 0) {
    return mainContent.map(el => el.textContent).join(' ').trim();
  }

  return document.body.textContent || '';
}

/**
 * Reset all CSS transforms and cleanup
 */
function resetAllTransforms() {
  // Reset container elements (legacy support)
  const containers = document.querySelectorAll('.stargardt-remap-container');
  containers.forEach(el => {
    el.style.transform = '';
    el.classList.remove('stargardt-remap-container', 'stargardt-gpu-accelerated');
  });

  // Reset text elements (legacy support)
  const textElements = document.querySelectorAll('.stargardt-remap-text');
  textElements.forEach(el => {
    el.style.transform = '';
    el.style.position = '';
    el.style.zIndex = '';
    el.classList.remove('stargardt-remap-text', 'stargardt-gpu-accelerated');
  });

  // Remove scotoma indicator
  const indicator = document.getElementById('stargardt-scotoma-indicator');
  if (indicator) {
    indicator.remove();
  }
}

/**
 * Show scotoma indicator overlay
 * @private Reserved for future scotoma visualization feature
 */
function _showScotomaIndicator() {
  if (!remapper_profile) return;

  const indicator = document.createElement('div');
  indicator.id = 'stargardt-scotoma-indicator';
  indicator.className = 'stargardt-scotoma-indicator';

  const centerX = (remapper_profile.boundary.centerX / 100) * window.innerWidth;
  const centerY = (remapper_profile.boundary.centerY / 100) * window.innerHeight;
  const radiusX = (remapper_profile.boundary.radiusX / 100) * window.innerWidth;
  const radiusY = (remapper_profile.boundary.radiusY / 100) * window.innerHeight;

  indicator.style.cssText += `
    left: ${centerX - radiusX}px;
    top: ${centerY - radiusY}px;
    width: ${radiusX * 2}px;
    height: ${radiusY * 2}px;
  `;

  document.body.appendChild(indicator);
}

/**
 * Update scotoma indicator position based on gaze
 */
function updateScotomaIndicatorPosition(gazeX, gazeY) {
  const indicator = document.getElementById('stargardt-scotoma-indicator');
  if (!indicator || !remapper_profile) return;

  const radiusX = (remapper_profile.boundary.radiusX / 100) * window.innerWidth;
  const radiusY = (remapper_profile.boundary.radiusY / 100) * window.innerHeight;

  indicator.style.left = `${gazeX - radiusX}px`;
  indicator.style.top = `${gazeY - radiusY}px`;
}

// ============================================================================
// STATUS
// ============================================================================

/**
 * Get remapper status
 */
export function getStatus() {
  return {
    enabled: remapper_enabled,
    mode: remapper_mode,
    hasProfile: remapper_profile !== null,
    hasGazeTracker: remapper_gazeTracker !== null,
  };
}

/**
 * Check if remapper is enabled
 */
export function isEnabled() {
  return remapper_enabled;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  initialize,
  enable,
  disable,
  updateSettings,
  getStatus,
  isEnabled,
};
