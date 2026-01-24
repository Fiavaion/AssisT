/**
 * Stargardt Module - Content Remapper
 *
 * Real-time DOM manipulation to reposition content around the scotoma.
 * Supports multiple remapping modes and integrates with gaze tracking.
 *
 * @module stargardt/content-remapper
 */

import { sanitizeHTML } from '../../utils/sanitize.js';
import * as scotomaProfile from './scotoma-profile.js';
import { showToast } from '../../core/ui/toast.js';
import * as eyeTrackingController from './eye-tracking-controller.js';

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let remapper_enabled = false;
let remapper_mode = 'peripheral-push'; // 'peripheral-push', 'text-donut', 'rsvp', 'magnify-remap'
let remapper_profile = null;
let remapper_settings = {};
let remapper_gazeTracker = null;
let remapper_animationFrameId = null;
// eslint-disable-next-line no-unused-vars
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

// Eye tracking state for donut mode
let donut_eyeTrackingEnabled = false;
let donut_currentScotomaPosition = null;

// Font family mapping for accessibility fonts
const FONT_FAMILY_MAP = {
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  arial: 'Arial, Helvetica, sans-serif',
  verdana: 'Verdana, Geneva, sans-serif',
  georgia: 'Georgia, "Times New Roman", serif',
  trebuchet: '"Trebuchet MS", Helvetica, sans-serif',
  'comic-sans': '"Comic Sans MS", cursive, sans-serif',
  opendyslexic: 'OpenDyslexic, "Comic Sans MS", sans-serif',
  lexie: '"Lexie Readable", "Comic Sans MS", sans-serif',
  atkinson: '"Atkinson Hyperlegible", Arial, sans-serif',
};

/**
 * Get CSS font-family value from font key
 * @param {string} fontKey - Font setting key
 * @returns {string} CSS font-family value
 */
function getFontFamily(fontKey) {
  return FONT_FAMILY_MAP[fontKey] || FONT_FAMILY_MAP.system;
}

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
  if (remapper_enabled) {
    return;
  }

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
  if (!remapper_enabled) {
    return;
  }

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

  // Cleanup magnify drag listeners
  if (remapper_overlayElement && remapper_overlayElement._magnifyCleanup) {
    remapper_overlayElement._magnifyCleanup();
  }

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
  console.log('[ContentRemapper] updateSettings called with:', settings);
  console.log(
    '[ContentRemapper] Current state - enabled:',
    remapper_enabled,
    'mode:',
    remapper_mode
  );

  const previousSide = remapper_settings.preferredSide;
  const previousMode = remapper_mode;
  const previousFontSize = remapper_settings.fontSize;
  const previousReadingMode = remapper_settings.readingMode;
  const previousFontFamily = remapper_settings.fontFamily;
  // Track magnify lens settings
  const previousMagnifyScale = remapper_settings.magnifyScale;
  const previousMagnifySize = remapper_settings.magnifySize;
  const previousMagnifyOffset = remapper_settings.magnifyOffset;
  const previousMagnifyOffsetDir = remapper_settings.magnifyOffsetDir;
  const previousMagnifyLock = remapper_settings.magnifyLock;

  remapper_settings = { ...remapper_settings, ...settings };

  if (settings.mode && settings.mode !== previousMode) {
    console.log('[ContentRemapper] Mode changing from', previousMode, 'to', settings.mode);
    // Mode changed - restart with new mode
    if (remapper_enabled) {
      console.log('[ContentRemapper] Remapper is enabled, switching modes...');
      disable();
      remapper_mode = settings.mode;
      enable();
    } else {
      console.log('[ContentRemapper] Remapper not enabled, just updating mode');
      remapper_mode = settings.mode;
    }
  } else if (
    settings.preferredSide &&
    settings.preferredSide !== previousSide &&
    remapper_enabled
  ) {
    // Preferred side changed while enabled - re-apply current mode
    console.log('[ContentRemapper] Preferred side changed to:', settings.preferredSide);
    if (remapper_mode === 'peripheral-push') {
      // Re-create the peripheral push panel with new side
      enablePeripheralPush();
    }
  } else if (
    remapper_enabled &&
    settings.fontSize !== undefined &&
    settings.fontSize !== previousFontSize
  ) {
    // Font size changed - apply dynamically to active mode
    console.log('[ContentRemapper] Font size changed to:', settings.fontSize);
    applyFontSizeToActiveMode(settings.fontSize);
  } else if (
    remapper_enabled &&
    settings.readingMode !== undefined &&
    settings.readingMode !== previousReadingMode
  ) {
    // Reading mode changed - need to re-extract content
    console.log('[ContentRemapper] Reading mode changed to:', settings.readingMode);
    // Re-enable the current mode to re-extract content
    disable();
    enable();
  } else if (
    remapper_enabled &&
    settings.fontFamily !== undefined &&
    settings.fontFamily !== previousFontFamily
  ) {
    // Font family changed - apply dynamically to RSVP overlay
    console.log('[ContentRemapper] Font family changed to:', settings.fontFamily);
    applyFontFamilyToActiveMode(settings.fontFamily);
  } else if (remapper_enabled && remapper_mode === 'magnify-remap') {
    // Check if any magnify lens settings changed
    const magnifySettingsChanged =
      (settings.magnifyScale !== undefined && settings.magnifyScale !== previousMagnifyScale) ||
      (settings.magnifySize !== undefined && settings.magnifySize !== previousMagnifySize) ||
      (settings.magnifyOffset !== undefined && settings.magnifyOffset !== previousMagnifyOffset) ||
      (settings.magnifyOffsetDir !== undefined &&
        settings.magnifyOffsetDir !== previousMagnifyOffsetDir) ||
      (settings.magnifyLock !== undefined && settings.magnifyLock !== previousMagnifyLock);

    if (magnifySettingsChanged) {
      console.log('[ContentRemapper] Magnify lens settings changed, re-enabling...');
      disable();
      enable();
    }
  } else {
    console.log(
      '[ContentRemapper] No significant change detected, mode:',
      settings.mode,
      'previousMode:',
      previousMode
    );
  }
}

/**
 * Apply font size change to currently active mode without re-enabling
 * @param {number} fontSize - Font size percentage (100 = normal)
 */
function applyFontSizeToActiveMode(fontSize) {
  const scale = (fontSize || 100) / 100;

  switch (remapper_mode) {
    case 'rsvp': {
      // For RSVP, scale the entire overlay instead of just font
      const overlay = document.getElementById('stargardt-rsvp-overlay');
      if (overlay) {
        overlay.style.transform = `scale(${scale})`;
      }
      break;
    }
    case 'peripheral-push': {
      const panel = document.getElementById('stargardt-reading-panel');
      if (panel) {
        const elements = panel.querySelectorAll('p, h1, h2, h3, h4, h5, h6');
        elements.forEach(el => {
          const tag = el.tagName.toLowerCase();
          const baseFontSize =
            tag === 'h1' ? 28 : tag === 'h2' ? 24 : tag.startsWith('h') ? 20 : 20;
          el.style.fontSize = `${Math.round(baseFontSize * scale)}px`;
        });
      }
      break;
    }
    case 'text-donut': {
      const scrollContainer = document.getElementById('stargardt-donut-scroll');
      if (scrollContainer) {
        const baseFontSize = 18;
        scrollContainer.style.fontSize = `${Math.round(baseFontSize * scale)}px`;
      }
      break;
    }
    case 'magnify-remap': {
      // For magnify lens, need to re-enable to apply new settings
      console.log('[ContentRemapper] Magnify lens settings changed, re-enabling...');
      disable();
      enable();
      break;
    }
    default:
      console.log('[ContentRemapper] Font size update not applicable to mode:', remapper_mode);
  }
}

/**
 * Apply font family change to currently active mode without re-enabling
 * @param {string} fontKey - Font family setting key
 */
function applyFontFamilyToActiveMode(fontKey) {
  const fontFamily = getFontFamily(fontKey);

  switch (remapper_mode) {
    case 'rsvp': {
      const overlay = document.getElementById('stargardt-rsvp-overlay');
      if (overlay) {
        overlay.style.fontFamily = fontFamily;
      }
      break;
    }
    case 'peripheral-push': {
      const panel = document.getElementById('stargardt-reading-panel');
      if (panel) {
        panel.style.fontFamily = fontFamily;
      }
      break;
    }
    case 'text-donut': {
      const scrollContainer = document.getElementById('stargardt-donut-scroll');
      if (scrollContainer) {
        scrollContainer.style.fontFamily = fontFamily;
      }
      break;
    }
    case 'magnify-remap': {
      const panel = document.getElementById('stargardt-magnify-panel');
      if (panel) {
        panel.style.fontFamily = fontFamily;
      }
      break;
    }
    default:
      console.log('[ContentRemapper] Font family update not applicable to mode:', remapper_mode);
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
      transform-origin: center center;
      transition: transform 0.1s ease-out;
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
  _remapper_styleElement = style;
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

  // Check reading mode setting (defaults to true for clean content)
  const useReadingMode = remapper_settings.readingMode !== false;
  console.log('[ContentRemapper] Reading mode:', useReadingMode);

  // Extract text content from the page (reading mode uses article extraction with filtering)
  const textContent = useReadingMode ? extractArticleContent() : extractAllPageContent();
  console.log('[ContentRemapper] Extracted content items:', textContent?.length || 0);

  if (!textContent || textContent.length === 0) {
    showToast('Could not extract readable content from this page', 'warning');
    return;
  }

  // Get font size scale from settings
  const fontSizeScale = (remapper_settings.fontSize || 100) / 100;

  // Create our own peripheral reading overlay
  createPeripheralReadingPanel(textContent, preferredSide, profile, fontSizeScale);

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
 * Extract all page content without filtering (for when reading mode is off)
 * Returns {tag, text} array format like extractArticleContent
 * @returns {Array} Array of {tag, text} objects
 */
function extractAllPageContent() {
  console.log('[ContentRemapper] Extracting all page content (no filter)...');

  const content = [];

  // Get all text-bearing elements
  const elements = document.body.querySelectorAll(
    'p, h1, h2, h3, h4, h5, h6, li, td, th, span, div'
  );

  elements.forEach(el => {
    // Skip elements inside scripts, styles, etc.
    if (el.closest('script, style, noscript, template')) {
      return;
    }

    // Skip hidden elements
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return;
    }

    // Get direct text content (not from children to avoid duplication)
    let text = '';
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
      }
    }
    text = text.trim();

    // Only include if has meaningful text
    if (text.length > 10) {
      const tag = el.tagName.toLowerCase();
      const normalizedTag = tag.startsWith('h') ? tag : 'p';
      content.push({ tag: normalizedTag, text });
    }
  });

  console.log('[ContentRemapper] Extracted', content.length, 'content items (unfiltered)');
  return content;
}

/**
 * Check if text looks like navigation/UI text rather than article content
 */
function isNavigationText(text) {
  const lowerText = text.toLowerCase();
  const navPatterns = [
    'cookie',
    'privacy',
    'subscribe',
    'sign in',
    'log in',
    'menu',
    'search',
    'share',
    'follow us',
    'copyright',
    'all rights reserved',
  ];
  return navPatterns.some(pattern => lowerText.includes(pattern)) && text.length < 100;
}

/**
 * Extract readable article text from the page (for RSVP reading mode)
 * Uses the same content detection as Peripheral Push but returns plain text
 * Filters out navigation, menus, ads, and other non-essential elements
 * @returns {string} Clean readable text content
 */
function extractReadableText() {
  console.log('[ContentRemapper] Extracting readable text for RSVP...');

  // Strategy 1: Try semantic article selectors (same as extractArticleContent)
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
    '.rte-article',
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

  // Strategy 3: Fallback to body
  if (!contentElement) {
    console.log('[ContentRemapper] Using body as fallback');
    contentElement = document.body;
  }

  // Clone to avoid modifying the original DOM
  const clone = contentElement.cloneNode(true);

  // Remove unwanted elements from clone
  const unwantedSelectors = [
    'script',
    'style',
    'noscript',
    'template',
    'svg',
    'iframe',
    'nav',
    'header',
    'footer',
    'aside',
    '[role="navigation"]',
    '[role="banner"]',
    '[role="contentinfo"]',
    '.nav',
    '.menu',
    '.sidebar',
    '.ad',
    '.ads',
    '.advertisement',
    '.social-share',
    '.share-buttons',
    '.comments',
    '.related-posts',
    '.cookie-banner',
    '.newsletter',
    '.subscribe',
    '.popup',
    '[hidden]',
    '[style*="display: none"]',
    '[style*="display:none"]',
  ];

  unwantedSelectors.forEach(selector => {
    try {
      const elements = clone.querySelectorAll(selector);
      elements.forEach(el => el.remove());
    } catch {
      // Ignore selector errors
    }
  });

  // Extract text from paragraphs and headings only (cleaner content)
  const textElements = clone.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li');
  const textParts = [];

  textElements.forEach(el => {
    const text = el.textContent.trim();
    // Filter out short text and navigation patterns
    if (text.length > 15 && !isNavigationText(text)) {
      textParts.push(text);
    }
  });

  // If we got good content, return it
  if (textParts.length > 0) {
    const result = textParts.join(' ').replace(/\s+/g, ' ').trim();
    console.log(
      '[ContentRemapper] Extracted',
      textParts.length,
      'text blocks,',
      result.split(/\s+/).length,
      'words'
    );
    return result;
  }

  // Last resort: Get visible text directly but still filter
  console.log('[ContentRemapper] Last resort - extracting visible text');
  const bodyText = clone.textContent || '';
  const sentences = bodyText.split(/[.!?]+/).filter(s => {
    const trimmed = s.trim();
    return trimmed.length > 30 && !isNavigationText(trimmed);
  });

  const result = sentences
    .slice(0, 100)
    .map(s => s.trim())
    .join('. ');
  console.log('[ContentRemapper] Extracted', sentences.length, 'sentences');
  return result;
}

/**
 * Create the peripheral reading panel
 * @param {Array} content - Array of {tag, text} objects
 * @param {string} preferredSide - 'left' or 'right'
 * @param {Object} profile - Scotoma profile with boundary info
 * @param {number} fontSizeScale - Font size scale factor (default 1.0)
 */
function createPeripheralReadingPanel(content, preferredSide, profile, fontSizeScale = 1) {
  console.log('[ContentRemapper] Creating peripheral reading panel...');
  console.log('[ContentRemapper] Profile boundary:', profile?.boundary);
  console.log('[ContentRemapper] Font size scale:', fontSizeScale);

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

  console.log('[ContentRemapper] Scotoma position:', {
    scotomaCenterX,
    scotomaCenterY,
    scotomaRadiusX,
    scotomaRadiusY,
  });

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

  // Add content to panel (apply font size scale)
  content.forEach(item => {
    const el = document.createElement(item.tag.startsWith('h') ? item.tag : 'p');
    el.textContent = item.text;

    // Calculate scaled font sizes
    const baseFontSize =
      item.tag === 'h1' ? 28 : item.tag === 'h2' ? 24 : item.tag.startsWith('h') ? 20 : 20;
    const scaledFontSize = Math.round(baseFontSize * fontSizeScale);

    if (item.tag.startsWith('h')) {
      el.style.cssText = `
        font-family: Georgia, serif;
        font-size: ${scaledFontSize}px;
        font-weight: bold;
        margin: 0.8em 0 0.4em 0;
        color: #222;
        line-height: 1.3;
      `;
    } else {
      el.style.cssText = `
        font-family: Georgia, serif;
        font-size: ${scaledFontSize}px;
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

  try {
    // Use default profile if none provided
    let profile = remapper_profile;
    if (!profile) {
      console.log('[ContentRemapper] No profile - using defaults for donut mode');
      profile = {
        boundary: {
          centerX: 50,
          centerY: 50,
          radiusX: 10,
          radiusY: 10,
        },
      };
    }

    // Remove any existing donut overlay first
    const existingOverlay = document.getElementById('stargardt-donut-overlay');
    if (existingOverlay) {
      existingOverlay.remove();
    }

    // Create donut container overlay
    const overlay = document.createElement('div');
    overlay.id = 'stargardt-donut-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 2147483647;
      background: rgba(20, 20, 25, 0.95);
      overflow: hidden;
    `;

    // Check reading mode setting (defaults to true for clean content)
    const useReadingMode = remapper_settings.readingMode !== false;
    console.log('[ContentRemapper] Text Donut reading mode:', useReadingMode);

    // Extract text content based on reading mode
    const textContent = useReadingMode ? extractReadableText() : extractPageText();
    console.log('[ContentRemapper] Extracted text length:', textContent.length);

    if (!textContent || textContent.length < 50) {
      showToast('No readable content found on this page', 'warning');
      return;
    }

    // Get font size scale from settings
    const fontSizeScale = (remapper_settings.fontSize || 100) / 100;

    // Create donut-shaped text container
    const donutContainer = createDonutContainer(textContent, profile, fontSizeScale);
    overlay.appendChild(donutContainer);

    document.body.appendChild(overlay);
    remapper_overlayElement = overlay;

    showToast('Text Donut Flow activated - content arranged around scotoma', 'info');
    console.log('[ContentRemapper] Text Donut overlay created successfully');
  } catch (error) {
    console.error('[ContentRemapper] Error enabling Text Donut mode:', error);
    showToast('Error activating Text Donut mode: ' + error.message, 'error');
  }
}

/**
 * Two-Column Layout for Scotoma Exclusion
 *
 * Uses CSS columns to create a simple two-column layout with a gap in the center.
 * Text flows down the left column first, then continues in the right column.
 * This is a newspaper-style reading flow.
 *
 * @param {string} text - Text content to display
 * @param {Object} profile - Scotoma profile with boundary info
 * @param {number} fontSizeScale - Font size scale factor (default 1.0)
 */
function createDonutContainer(text, profile, fontSizeScale = 1) {
  const viewWidth = window.innerWidth;
  const viewHeight = window.innerHeight;

  // Scotoma configuration from profile
  const scotomaBuffer = 25;
  const radiusX = ((profile.boundary.radiusX || 10) / 100) * viewWidth + scotomaBuffer;
  const radiusY = ((profile.boundary.radiusY || 10) / 100) * viewHeight + scotomaBuffer;
  const scotomaRadius = Math.max(radiusX, radiusY);

  // Gap width for scotoma exclusion zone
  const gapWidth = scotomaRadius * 2;

  // Calculate scaled font size
  const baseFontSize = 18;
  const scaledFontSize = Math.round(baseFontSize * fontSizeScale);

  // Main wrapper
  const wrapper = document.createElement('div');
  wrapper.id = 'stargardt-donut-wrapper';
  wrapper.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: rgba(20, 20, 25, 0.98);
  `;

  // Scrollable container with CSS columns
  const scrollContainer = document.createElement('div');
  scrollContainer.id = 'stargardt-donut-scroll';
  scrollContainer.tabIndex = 0; // Make focusable for keyboard scrolling
  scrollContainer.style.cssText = `
    position: absolute;
    top: 50px;
    left: 30px;
    right: 30px;
    bottom: 30px;
    overflow-y: auto;
    padding: 20px;
    color: #f0f0f0;
    font-family: Georgia, 'Times New Roman', serif;
    font-size: ${scaledFontSize}px;
    line-height: 1.8;
    column-count: 2;
    column-gap: ${gapWidth}px;
    column-rule: none;
    text-align: justify;
    outline: none;
  `;

  // Add the text content
  scrollContainer.textContent = text;

  // Focus the container after it's added to DOM (for keyboard scrolling)
  setTimeout(() => scrollContainer.focus(), 100);

  // Visual scotoma indicator - vertical strip in the center gap
  const scotomaIndicator = document.createElement('div');
  scotomaIndicator.id = 'stargardt-scotoma-visual';
  scotomaIndicator.style.cssText = `
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: ${gapWidth - 30}px;
    height: 70%;
    border-radius: 8px;
    border: 2px dashed rgba(100, 100, 130, 0.3);
    background: rgba(40, 40, 50, 0.2);
    pointer-events: none;
    z-index: 5;
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  const scotomaLabel = document.createElement('div');
  scotomaLabel.style.cssText = `
    color: rgba(100, 100, 120, 0.5);
    font-size: 11px;
    text-align: center;
    font-family: system-ui, sans-serif;
  `;
  scotomaLabel.innerHTML = sanitizeHTML('Scotoma<br>Zone');
  scotomaIndicator.appendChild(scotomaLabel);

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕ Close';
  closeBtn.style.cssText = `
    position: fixed;
    top: 12px;
    right: 15px;
    padding: 10px 20px;
    background: #6366f1;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    z-index: 200;
    pointer-events: auto;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  `;
  closeBtn.onmousedown = e => {
    e.preventDefault();
    e.stopPropagation();
    disable();
  };

  // Info label
  const infoLabel = document.createElement('div');
  infoLabel.style.cssText = `
    position: fixed;
    top: 12px;
    left: 15px;
    padding: 8px 14px;
    background: rgba(0,0,0,0.6);
    color: #909090;
    border-radius: 5px;
    font-size: 12px;
    font-family: system-ui, sans-serif;
    z-index: 200;
  `;
  infoLabel.textContent = 'Two-Column Flow - Scotoma Exclusion';

  // Scroll hint
  const scrollHint = document.createElement('div');
  scrollHint.style.cssText = `
    position: fixed;
    bottom: 8px;
    left: 50%;
    transform: translateX(-50%);
    padding: 5px 10px;
    background: rgba(0,0,0,0.4);
    color: rgba(150, 150, 150, 0.7);
    border-radius: 4px;
    font-size: 10px;
    font-family: system-ui, sans-serif;
    z-index: 200;
  `;
  scrollHint.textContent = '↓ Scroll for more ↓';

  // Hide scroll hint after scrolling
  let hintHidden = false;
  scrollContainer.addEventListener('scroll', () => {
    if (!hintHidden && scrollContainer.scrollTop > 30) {
      scrollHint.style.opacity = '0';
      scrollHint.style.transition = 'opacity 0.3s';
      hintHidden = true;
    }
  });

  // Assemble
  wrapper.appendChild(scrollContainer);
  wrapper.appendChild(scotomaIndicator);
  wrapper.appendChild(closeBtn);
  wrapper.appendChild(infoLabel);
  wrapper.appendChild(scrollHint);

  // Store layout info for potential dynamic updates (eye tracking)
  wrapper.donutLayout = {
    gapWidth,
    scotomaRadius,
  };

  return wrapper;
}

// ============================================================================
// DONUT MODE: EYE TRACKING INTEGRATION
// ============================================================================

/**
 * Enable eye tracking for donut flow mode
 * The scotoma indicator will follow the user's gaze
 *
 * @returns {Promise<boolean>} True if eye tracking was enabled
 */
export async function enableDonutEyeTracking() {
  console.log('[ContentRemapper] Enabling eye tracking for donut mode...');

  // Initialize eye tracking controller
  await eyeTrackingController.initialize(
    {
      smoothing: true,
      showVideo: false,
      showPrediction: false,
    },
    handleDonutGazeUpdate
  );

  // Enable eye tracking
  const enabled = await eyeTrackingController.enable();

  if (enabled) {
    donut_eyeTrackingEnabled = true;
    showToast('Eye tracking enabled - scotoma will follow your gaze', 'success');

    // Offer calibration
    const doCalibrate = await showCalibrationPrompt();
    if (doCalibrate) {
      await eyeTrackingController.startCalibration();
    }

    return true;
  }

  return false;
}

/**
 * Disable eye tracking for donut mode
 */
export function disableDonutEyeTracking() {
  console.log('[ContentRemapper] Disabling eye tracking for donut mode');

  donut_eyeTrackingEnabled = false;
  eyeTrackingController.disable();

  // Reset scotoma to center position
  resetScotomaPosition();
}

/**
 * Handle gaze update from eye tracking controller
 *
 * @param {Object} gaze - Gaze position {x, y}
 */
function handleDonutGazeUpdate(gaze) {
  if (!donut_eyeTrackingEnabled || !gaze) {
    return;
  }

  donut_currentScotomaPosition = gaze;

  // Update the scotoma visual indicator position
  updateDonutScotomaVisual(gaze.x, gaze.y);
}

/**
 * Update the scotoma visual indicator position in donut mode
 *
 * @param {number} x - X position in pixels
 * @param {number} y - Y position in pixels
 */
function updateDonutScotomaVisual(x, y) {
  const scotomaVisual = document.getElementById('stargardt-scotoma-visual');
  if (!scotomaVisual) {
    return;
  }

  // Smooth transition for the scotoma indicator
  scotomaVisual.style.transition = 'left 0.1s ease-out, top 0.1s ease-out';
  scotomaVisual.style.left = `${x}px`;
  scotomaVisual.style.top = `${y}px`;
}

/**
 * Reset scotoma to center position
 */
function resetScotomaPosition() {
  const scotomaVisual = document.getElementById('stargardt-scotoma-visual');
  if (!scotomaVisual) {
    return;
  }

  scotomaVisual.style.transition = 'left 0.5s ease, top 0.5s ease';
  scotomaVisual.style.left = '50%';
  scotomaVisual.style.top = '50%';
}

/**
 * Show calibration prompt
 *
 * @returns {Promise<boolean>} True if user wants to calibrate
 */
function showCalibrationPrompt() {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.id = 'stargardt-calibration-prompt';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    overlay.innerHTML = sanitizeHTML(`
      <div style="
        background: #1a1a2e;
        border-radius: 16px;
        max-width: 450px;
        width: 90%;
        padding: 30px;
        color: #ffffff;
        text-align: center;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
      ">
        <div style="font-size: 48px; margin-bottom: 16px;">👁️</div>
        <h2 style="margin: 0 0 12px 0; font-size: 22px;">Calibrate Eye Tracking?</h2>
        <p style="color: #a0a0b0; margin-bottom: 24px; line-height: 1.5;">
          Calibration improves accuracy by learning where you look on screen.
          It takes about 30 seconds - click 9 dots while looking at them.
        </p>
        <div style="display: flex; gap: 12px; justify-content: center;">
          <button id="cal-skip" style="
            padding: 12px 24px;
            background: #3a3a5a;
            color: #ffffff;
            border: none;
            border-radius: 8px;
            font-size: 15px;
            cursor: pointer;
          ">Skip for Now</button>
          <button id="cal-start" style="
            padding: 12px 24px;
            background: #6366f1;
            color: #ffffff;
            border: none;
            border-radius: 8px;
            font-size: 15px;
            cursor: pointer;
          ">Calibrate</button>
        </div>
      </div>
    `);

    document.body.appendChild(overlay);

    overlay.querySelector('#cal-skip').onclick = () => {
      overlay.remove();
      resolve(false);
    };

    overlay.querySelector('#cal-start').onclick = () => {
      overlay.remove();
      resolve(true);
    };
  });
}

/**
 * Check if eye tracking is enabled for donut mode
 *
 * @returns {boolean} True if enabled
 */
export function isDonutEyeTrackingEnabled() {
  return donut_eyeTrackingEnabled;
}

/**
 * Get current scotoma position (from eye tracking or default)
 *
 * @returns {Object} Position {x, y}
 */
export function getCurrentScotomaPosition() {
  if (donut_currentScotomaPosition) {
    return donut_currentScotomaPosition;
  }
  return {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
  };
}

// ============================================================================
// MODE: RSVP (Rapid Serial Visual Presentation)
// ============================================================================

/**
 * Clean text for RSVP display by removing hidden characters that break words
 * @param {string} text - Raw text content
 * @returns {string} Cleaned text safe for word splitting
 */
function cleanTextForRSVP(text) {
  if (!text) {
    return '';
  }

  return (
    text
      // Remove soft hyphens (­ or \u00AD)
      .replace(/\u00AD/g, '')
      // Remove zero-width spaces and joiners
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      // Remove other invisible formatting characters
      .replace(/[\u2028\u2029]/g, ' ') // Line/paragraph separators to space
      // Remove word joiners
      .replace(/\u2060/g, '')
      // Remove non-breaking spaces and replace with regular spaces
      .replace(/\u00A0/g, ' ')
      // Remove HTML entities that might have slipped through
      .replace(/&shy;/gi, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&#8203;/g, '') // Zero-width space HTML entity
      // Normalize multiple spaces to single space
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Enable RSVP mode
 * Shows one word at a time at the PRL location
 */
function enableRSVP() {
  console.log('[ContentRemapper] Enabling RSVP mode');

  // Check reading mode setting (defaults to true for clean content)
  const useReadingMode = remapper_settings.readingMode !== false;
  let text = useReadingMode ? extractReadableText() : extractPageText();
  console.log('[ContentRemapper] RSVP reading mode:', useReadingMode);

  // Clean text of hidden characters that could break words
  text = cleanTextForRSVP(text);

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

  // Get font size scale from settings (default 100%)
  const fontSizeScale = (remapper_settings.fontSize || 100) / 100;
  // Get font family from settings (default system)
  const fontFamily = getFontFamily(remapper_settings.fontFamily || 'system');

  // Create RSVP overlay
  const overlay = document.createElement('div');
  overlay.className = 'stargardt-rsvp-overlay';
  overlay.id = 'stargardt-rsvp-overlay';
  overlay.style.cssText += `
    top: ${Math.max(50, prlY - 150)}px;
    left: ${Math.max(50, prlX - 250)}px;
    width: 500px;
    height: 300px;
    font-family: ${fontFamily};
  `;

  overlay.innerHTML = sanitizeHTML(`
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
  `);

  document.body.appendChild(overlay);
  remapper_overlayElement = overlay;

  // Apply initial scale transform to the entire overlay (instead of font-size)
  if (fontSizeScale !== 1) {
    overlay.style.transform = `scale(${fontSizeScale})`;
  }

  // Set initial font size for first word (based on word length only, no scale)
  const wordElement = document.getElementById('rsvp-word');
  if (wordElement && rsvp_words[0]) {
    wordElement.style.fontSize = getWordFontSize(rsvp_words[0].length, 1);
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
  if (!handle) {
    return;
  }

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
    if (!isDragging) {
      return;
    }
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
    if (!document.getElementById('stargardt-rsvp-overlay')) {
      return;
    }

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
 * @param {number} length - Word character length
 * @param {number} scale - Font size scale factor (default 1.0)
 * @returns {string} CSS font size value
 */
function getWordFontSize(length, scale = 1) {
  let basePx;
  if (length <= 6) {
    basePx = 56;
  } else if (length <= 10) {
    basePx = 44;
  } else if (length <= 14) {
    basePx = 36;
  } else if (length <= 18) {
    basePx = 28;
  } else {
    basePx = 24;
  }

  return `${Math.round(basePx * scale)}px`;
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
      // Adjust font size for long words (scale is applied via overlay transform)
      wordElement.style.fontSize = getWordFontSize(word.length, 1);
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
    if (btn) {
      btn.textContent = '▶ Play';
    }
  } else {
    startRSVP();
    if (btn) {
      btn.textContent = '⏸ Pause';
    }
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
// MODE: MAGNIFY LENS (Eye Tracking)
// ============================================================================

// Magnify lens state
let magnify_lens = null;
let magnify_content = null;
// let _magnify_bodyClone = null; // Reserved for future use
let magnify_mouseMoveHandler = null;
let magnify_scrollHandler = null;
let magnify_dragHandlers = null;
let magnify_lastGazeX = 0;
let magnify_lastGazeY = 0;
let magnify_lockedX = 0;
let magnify_lockedY = 0;
let magnify_isLocked = false;
let magnify_isDragging = false;

/**
 * Enable magnify lens mode
 * Creates a circular magnifying lens that follows gaze/mouse
 */
function enableMagnifyRemap() {
  console.log('[ContentRemapper] Enabling Magnify Lens mode');

  try {
    // Get settings with defaults
    const scale = remapper_settings.magnifyScale || 2;
    const size = remapper_settings.magnifySize || 275;
    const offset = remapper_settings.magnifyOffset || 150;
    const offsetDir = remapper_settings.magnifyOffsetDir || 'right';
    const lockPosition = remapper_settings.magnifyLock === true;

    console.log('[ContentRemapper] Magnify settings:', {
      scale,
      size,
      offset,
      offsetDir,
      lockPosition,
    });

    // Set lock state
    magnify_isLocked = lockPosition;

    // Create the lens container (circular window)
    const lens = document.createElement('div');
    lens.id = 'stargardt-magnify-lens';
    lens.style.cssText = `
      position: fixed;
      z-index: 2147483640;
      width: ${size}px;
      height: ${size}px;
      border-radius: 50%;
      overflow: hidden;
      pointer-events: ${lockPosition ? 'auto' : 'none'};
      box-shadow: 0 0 0 3px ${lockPosition ? '#22c55e' : '#6366f1'}, 0 8px 32px rgba(0,0,0,0.4);
      background: white;
      opacity: 0;
      transition: opacity 0.15s ease-out;
      cursor: ${lockPosition ? 'move' : 'default'};
    `;

    // Create falloff overlay (gradient edge)
    const falloff = document.createElement('div');
    falloff.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      pointer-events: none;
      background: radial-gradient(circle, transparent 60%, rgba(0,0,0,0.3) 90%, rgba(0,0,0,0.6) 100%);
      z-index: 10;
    `;

    // Create the magnified content container
    const content = document.createElement('div');
    content.id = 'stargardt-magnify-content';
    content.style.cssText = `
      position: absolute;
      width: ${window.innerWidth}px;
      height: ${document.documentElement.scrollHeight}px;
      transform-origin: 0 0;
      transform: scale(${scale});
      pointer-events: none;
    `;

    // Clone the body content for magnification (with error handling)
    let bodyClone;
    try {
      bodyClone = document.body.cloneNode(true);
      // Remove our lens from the clone to avoid recursion
      const lensInClone = bodyClone.querySelector('#stargardt-magnify-lens');
      if (lensInClone) {
        lensInClone.remove();
      }
      // Remove other stargardt overlays from clone
      bodyClone.querySelectorAll('[id^="stargardt-"]').forEach(el => el.remove());
      // Remove scripts to prevent execution
      bodyClone.querySelectorAll('script').forEach(el => el.remove());
    } catch (cloneErr) {
      console.error('[ContentRemapper] Error cloning body:', cloneErr);
      // Create a simple fallback
      bodyClone = document.createElement('div');
      bodyClone.textContent = 'Magnified view';
    }

    // Style the clone - position it to match the full document
    bodyClone.style.cssText = `
      margin: 0;
      padding: 0;
      position: absolute;
      top: 0;
      left: 0;
      width: ${window.innerWidth}px;
      min-height: ${document.documentElement.scrollHeight}px;
      transform-origin: 0 0;
      pointer-events: none;
      overflow: visible;
    `;

    content.appendChild(bodyClone);
    lens.appendChild(content);
    lens.appendChild(falloff);
    document.body.appendChild(lens);

    magnify_lens = lens;
    magnify_content = content;
    magnify_bodyClone = bodyClone;
    remapper_overlayElement = lens;

    // Initialize position at center
    magnify_lastGazeX = window.innerWidth / 2;
    magnify_lastGazeY = window.innerHeight / 2;

    // Set initial locked position (center of screen with offset applied)
    const halfSize = size / 2;
    if (lockPosition) {
      magnify_lockedX =
        window.innerWidth / 2 +
        (offsetDir === 'right' ? offset : offsetDir === 'left' ? -offset : 0) -
        halfSize;
      magnify_lockedY =
        window.innerHeight / 2 +
        (offsetDir === 'below' ? offset : offsetDir === 'above' ? -offset : 0) -
        halfSize;
      // Keep on screen
      magnify_lockedX = Math.max(0, Math.min(window.innerWidth - size, magnify_lockedX));
      magnify_lockedY = Math.max(0, Math.min(window.innerHeight - size, magnify_lockedY));
    }

    // Setup drag functionality if locked
    if (lockPosition) {
      setupMagnifyDrag(lens, size);
    }

    // Start tracking
    startMagnifyTracking(scale, size, offset, offsetDir);

    // Show lens after a moment
    setTimeout(() => {
      if (lens) {
        lens.style.opacity = '1';
      }
    }, 100);

    const modeText = lockPosition
      ? 'Locked lens - drag to reposition, content follows cursor'
      : 'Lens follows cursor';
    showToast(`Magnify Lens active - ${modeText}`, 'info');
    console.log('[ContentRemapper] Magnify Lens created');
  } catch (err) {
    console.error('[ContentRemapper] Error enabling Magnify Lens:', err);
    showToast('Error enabling Magnify Lens', 'error');
  }
}

/**
 * Setup drag functionality for the magnify lens when locked
 */
function setupMagnifyDrag(lens, size) {
  let dragStartX = 0;
  let dragStartY = 0;
  let dragInitialLensX = 0;
  let dragInitialLensY = 0;

  const onMouseDown = e => {
    // Only respond to left click
    if (e.button !== 0) {
      return;
    }

    magnify_isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragInitialLensX = magnify_lockedX;
    dragInitialLensY = magnify_lockedY;

    // Change cursor and add visual feedback
    lens.style.cursor = 'grabbing';
    lens.style.boxShadow = '0 0 0 4px #22c55e, 0 12px 40px rgba(0,0,0,0.5)';

    e.preventDefault();
    e.stopPropagation();
  };

  const onMouseMove = e => {
    if (!magnify_isDragging) {
      return;
    }

    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;

    // Calculate new position
    let newX = dragInitialLensX + dx;
    let newY = dragInitialLensY + dy;

    // Keep on screen
    newX = Math.max(0, Math.min(window.innerWidth - size, newX));
    newY = Math.max(0, Math.min(window.innerHeight - size, newY));

    // Update locked position
    magnify_lockedX = newX;
    magnify_lockedY = newY;

    // Apply position immediately
    lens.style.left = `${newX}px`;
    lens.style.top = `${newY}px`;

    e.preventDefault();
  };

  const onMouseUp = e => {
    if (!magnify_isDragging) {
      return;
    }

    magnify_isDragging = false;

    // Restore cursor and visual
    lens.style.cursor = 'move';
    lens.style.boxShadow = '0 0 0 3px #22c55e, 0 8px 32px rgba(0,0,0,0.4)';

    e.preventDefault();
  };

  // Attach handlers
  lens.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);

  // Store handlers for cleanup
  magnify_dragHandlers = {
    mousedown: onMouseDown,
    mousemove: onMouseMove,
    mouseup: onMouseUp,
  };
}

/**
 * Start tracking mouse/gaze for magnify lens
 */
function startMagnifyTracking(scale, size, offset, offsetDir) {
  const halfSize = size / 2;

  // Calculate offset position based on direction (for non-locked mode)
  const getOffsetPosition = (gazeX, gazeY) => {
    let lensX = gazeX;
    let lensY = gazeY;

    switch (offsetDir) {
      case 'left':
        lensX = gazeX - offset - halfSize;
        lensY = gazeY - halfSize;
        break;
      case 'above':
        lensX = gazeX - halfSize;
        lensY = gazeY - offset - halfSize;
        break;
      case 'below':
        lensX = gazeX - halfSize;
        lensY = gazeY + offset - halfSize;
        break;
      case 'auto': {
        // Position in peripheral vision (opposite of center)
        const centerX = window.innerWidth / 2;
        if (gazeX < centerX) {
          lensX = gazeX + offset - halfSize;
        } else {
          lensX = gazeX - offset - halfSize;
        }
        lensY = gazeY - halfSize;
        break;
      }
      case 'right':
      default:
        lensX = gazeX + offset - halfSize;
        lensY = gazeY - halfSize;
        break;
    }

    // Keep lens on screen
    lensX = Math.max(0, Math.min(window.innerWidth - size, lensX));
    lensY = Math.max(0, Math.min(window.innerHeight - size, lensY));

    return { lensX, lensY };
  };

  // Update lens position and content
  const updateLens = (gazeX, gazeY) => {
    if (!magnify_lens || !magnify_content) {
      return;
    }

    // Smooth the cursor tracking
    magnify_lastGazeX += (gazeX - magnify_lastGazeX) * 0.3;
    magnify_lastGazeY += (gazeY - magnify_lastGazeY) * 0.3;

    // Position the lens (skip if currently dragging - drag handler manages position)
    if (!magnify_isDragging) {
      if (magnify_isLocked) {
        magnify_lens.style.left = `${magnify_lockedX}px`;
        magnify_lens.style.top = `${magnify_lockedY}px`;
      } else {
        const { lensX, lensY } = getOffsetPosition(magnify_lastGazeX, magnify_lastGazeY);
        magnify_lens.style.left = `${lensX}px`;
        magnify_lens.style.top = `${lensY}px`;
      }
    }

    // Calculate document position from screen position
    // gazeX/gazeY are viewport coordinates, add scroll to get document coordinates
    const docX = magnify_lastGazeX;
    const docY = magnify_lastGazeY + window.scrollY;

    // Position the content so the cursor point appears centered in the lens
    // We scale the content, then translate to center the point of interest
    const contentX = -docX + halfSize / scale;
    const contentY = -docY + halfSize / scale;

    magnify_content.style.transform = `scale(${scale}) translate(${contentX}px, ${contentY}px)`;
  };

  // Mouse move handler (fallback for Lite mode)
  magnify_mouseMoveHandler = e => {
    // Check if we have eye tracking data
    if (remapper_gazeTracker) {
      const gaze = remapper_gazeTracker.getLastGaze();
      if (gaze && gaze.timestamp > Date.now() - 500) {
        // Use eye tracking if recent
        updateLens(gaze.x, gaze.y);
        return;
      }
    }
    // Fall back to mouse position
    updateLens(e.clientX, e.clientY);
  };

  // Scroll handler to update content position when page scrolls
  magnify_scrollHandler = () => {
    // Re-render with current gaze position but new scroll
    updateLens(magnify_lastGazeX, magnify_lastGazeY);
  };

  document.addEventListener('mousemove', magnify_mouseMoveHandler);
  window.addEventListener('scroll', magnify_scrollHandler, { passive: true });

  // Also start animation frame for smooth updates
  const animateLoop = () => {
    if (!remapper_enabled || remapper_mode !== 'magnify-remap') {
      return;
    }

    // Check for eye tracking updates
    if (remapper_gazeTracker) {
      const gaze = remapper_gazeTracker.getLastGaze();
      if (gaze) {
        updateLens(gaze.x, gaze.y);
      }
    }

    remapper_animationFrameId = requestAnimationFrame(animateLoop);
  };

  remapper_animationFrameId = requestAnimationFrame(animateLoop);

  // Store cleanup
  if (magnify_lens) {
    magnify_lens._magnifyCleanup = () => {
      if (magnify_mouseMoveHandler) {
        document.removeEventListener('mousemove', magnify_mouseMoveHandler);
        magnify_mouseMoveHandler = null;
      }
      if (magnify_scrollHandler) {
        window.removeEventListener('scroll', magnify_scrollHandler);
        magnify_scrollHandler = null;
      }
      if (magnify_dragHandlers) {
        if (magnify_lens) {
          magnify_lens.removeEventListener('mousedown', magnify_dragHandlers.mousedown);
        }
        document.removeEventListener('mousemove', magnify_dragHandlers.mousemove);
        document.removeEventListener('mouseup', magnify_dragHandlers.mouseup);
        magnify_dragHandlers = null;
      }
      magnify_lens = null;
      magnify_content = null;
      magnify_bodyClone = null;
      magnify_isDragging = false;
    };
  }
}

// ============================================================================
// GAZE-AWARE LOOP
// ============================================================================

/**
 * Start gaze-aware content remapping loop
 */
function startGazeAwareLoop() {
  if (!remapper_gazeTracker) {
    return;
  }

  const updateFromGaze = timestamp => {
    if (!remapper_enabled) {
      return;
    }

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
      if (!element.classList.contains('stargardt-remap-container')) {
        return;
      }

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
  return Array.from(containers)
    .filter(el => {
      const text = el.textContent || '';
      return text.length > 200 && el.children.length < 50;
    })
    .slice(0, 10); // Limit to prevent performance issues
}

/**
 * Extract clean text content from the page (filtering out styles/scripts)
 */
function extractPageText() {
  const mainContent = findMainContent();

  if (mainContent.length > 0) {
    return mainContent
      .map(el => getCleanText(el))
      .join(' ')
      .trim();
  }

  return getCleanText(document.body);
}

/**
 * Get clean text from an element, excluding style/script content
 * @param {Element} element - DOM element to extract text from
 * @returns {string} Clean text content
 */
function getCleanText(element) {
  // Clone the element so we don't modify the original
  const clone = element.cloneNode(true);

  // Remove all script, style, noscript, and template elements
  const excludeTags = ['script', 'style', 'noscript', 'template', 'svg', 'iframe'];
  excludeTags.forEach(tag => {
    const elements = clone.querySelectorAll(tag);
    elements.forEach(el => el.remove());
  });

  // Also remove hidden elements
  const hidden = clone.querySelectorAll(
    '[hidden], [style*="display: none"], [style*="display:none"]'
  );
  hidden.forEach(el => el.remove());

  // Get text and clean up whitespace
  const text = clone.textContent || '';
  return text.replace(/\s+/g, ' ').trim();
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
/*
function _showScotomaIndicator() {
  if (!remapper_profile) {return;}

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
*/

/**
 * Update scotoma indicator position based on gaze
 * Reserved for future scotoma visualization feature
 */
/*
function updateScotomaIndicatorPosition(gazeX, gazeY) {
  const indicator = document.getElementById('stargardt-scotoma-indicator');
  if (!indicator || !remapper_profile) {return;}

  const radiusX = (remapper_profile.boundary.radiusX / 100) * window.innerWidth;
  const radiusY = (remapper_profile.boundary.radiusY / 100) * window.innerHeight;

  indicator.style.left = `${gazeX - radiusX}px`;
  indicator.style.top = `${gazeY - radiusY}px`;
}
*/

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
    eyeTrackingEnabled: donut_eyeTrackingEnabled,
    currentScotomaPosition: donut_currentScotomaPosition,
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
  // Eye tracking integration for donut mode
  enableDonutEyeTracking,
  disableDonutEyeTracking,
  isDonutEyeTrackingEnabled,
  getCurrentScotomaPosition,
};
