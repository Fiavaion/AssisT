/**
 * Reading Mode Feature
 *
 * Distraction-free article reader using Mozilla's Readability algorithm
 *
 * Features:
 * - Content extraction using @mozilla/readability
 * - Full-page overlay with clean typography
 * - TTS preservation in reading mode
 * - Dyslexia mode compatibility
 * - Background color options (cream default)
 * - Font customization
 * - Keyboard shortcuts (Ctrl+Shift+R to toggle, ESC to exit)
 *
 * Architecture:
 * - Self-contained module following Feature Isolation Pattern (DEC-202510-010)
 * - All functions prefixed with 'readingMode_' to avoid naming conflicts
 * - Integrates with existing TTS and dyslexia features
 *
 * @module features/readingMode
 */

import { registerShortcut } from '../../utils/keyboard-shortcuts.js';
import { sanitizeHTML } from '../../utils/sanitize.js';
import { attachQuietHandler } from '../../utils/event-handlers.js';

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let readingMode_isActive = false;
let readingMode_overlay = null;
let readingMode_originalContent = null;
const readingMode_settings = {
  enabled: true,
  backgroundColor: '#FBF8F3', // Cream
  fontFamily: 'Arial, Helvetica, sans-serif', // Standard font for better OCR accuracy
  fontSize: '18px',
  lineHeight: '1.6',
  maxWidth: '800px',
};

// ============================================================================
// CONTENT EXTRACTION
// ============================================================================

/**
 * Extracts article content using @mozilla/readability
 *
 * @returns {Object|null} Article object with title, content, byline, etc.
 */
async function readingMode_extractContent() {
  try {
    console.log('[ReadingMode] Extracting content with @mozilla/readability...');

    // Dynamic import of @mozilla/readability
    const { Readability } = await import('@mozilla/readability');

    // Clone document for readability (it mutates the DOM)
    const documentClone = document.cloneNode(true);

    // Create readability instance
    const reader = new Readability(documentClone);

    // Parse article
    const article = reader.parse();

    if (!article) {
      console.warn('[ReadingMode] Failed to extract content');
      return null;
    }

    console.log('[ReadingMode] Content extracted:', article.title);
    return article;
  } catch (error) {
    console.error('[ReadingMode] Content extraction failed:', error);
    return null;
  }
}

// ============================================================================
// OVERLAY UI
// ============================================================================

/**
 * Creates the reading mode overlay
 *
 * @param {Object} article - Readability article object
 * @returns {HTMLElement} Overlay element
 */
function readingMode_createOverlay(article) {
  // Create overlay container
  const overlay = document.createElement('div');
  overlay.id = 'assist-reading-mode-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: ${readingMode_settings.backgroundColor};
    z-index: 999996;
    overflow-y: auto;
    padding: 40px 20px;
  `;

  // Create content container
  const content = document.createElement('article');
  content.id = 'assist-reading-mode-content';
  content.style.cssText = `
    max-width: ${readingMode_settings.maxWidth};
    margin: 0 auto;
    font-family: ${readingMode_settings.fontFamily};
    font-size: ${readingMode_settings.fontSize};
    line-height: ${readingMode_settings.lineHeight};
    color: #333;
  `;

  // Add title
  if (article.title) {
    const title = document.createElement('h1');
    title.textContent = article.title;
    title.style.cssText = `
      font-size: 2.5em;
      margin: 0 0 0.5em 0;
      line-height: 1.2;
    `;
    content.appendChild(title);
  }

  // Add byline
  if (article.byline) {
    const byline = document.createElement('p');
    byline.textContent = article.byline;
    byline.style.cssText = `
      color: #666;
      font-style: italic;
      margin: 0 0 1.5em 0;
    `;
    content.appendChild(byline);
  }

  // Add article content
  const articleContent = document.createElement('div');
  articleContent.innerHTML = sanitizeHTML(article.content);
  articleContent.style.cssText = `
    line-height: inherit;
  `;
  content.appendChild(articleContent);

  // Add close button
  const closeButton = document.createElement('button');
  closeButton.id = 'assist-reading-mode-close';
  closeButton.setAttribute('aria-label', 'Exit Reading Mode');
  closeButton.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    background: white;
    border: 2px solid #333;
    border-radius: 24px;
    font-size: 16px;
    font-weight: 600;
    line-height: 1;
    color: #333;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    z-index: 999997;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: all 0.2s ease;
  `;
  closeButton.innerHTML = `
    <span style="font-size: 20px; line-height: 1;">✕</span>
    <span>Exit</span>
  `;
  closeButton.onmouseenter = function () {
    this.style.background = '#f44336';
    this.style.borderColor = '#f44336';
    this.style.color = 'white';
    this.style.transform = 'scale(1.05)';
  };
  closeButton.onmouseleave = function () {
    this.style.background = 'white';
    this.style.borderColor = '#333';
    this.style.color = '#333';
    this.style.transform = 'scale(1)';
  };

  // Use quiet handler (button has custom hover logic above)
  attachQuietHandler(closeButton, 'Reading Mode Exit', () => {
    readingMode_exit();
  });

  overlay.appendChild(content);
  overlay.appendChild(closeButton);

  return overlay;
}

/**
 * Enters reading mode
 */
async function readingMode_enter() {
  if (readingMode_isActive) {
    console.log('[ReadingMode] Already active');
    return;
  }

  console.log('[ReadingMode] Entering reading mode...');

  // Extract content
  const article = await readingMode_extractContent();

  if (!article) {
    alert('Could not extract article content from this page');
    return;
  }

  // Store original content (for restoration)
  readingMode_originalContent = {
    scrollY: window.scrollY,
    scrollX: window.scrollX,
  };

  // Create and show overlay
  readingMode_overlay = readingMode_createOverlay(article);
  document.body.appendChild(readingMode_overlay);

  readingMode_isActive = true;

  console.log('[ReadingMode] Reading mode active');

  // Show toast
  if (window.showToast) {
    window.showToast('Reading Mode activated. Press ESC to exit.');
  }
}

/**
 * Exits reading mode
 */
function readingMode_exit() {
  if (!readingMode_isActive) {
    return;
  }

  console.log('[ReadingMode] Exiting reading mode...');

  // Remove overlay
  if (readingMode_overlay) {
    readingMode_overlay.remove();
    readingMode_overlay = null;
  }

  // Restore scroll position
  if (readingMode_originalContent) {
    window.scrollTo(readingMode_originalContent.scrollX, readingMode_originalContent.scrollY);
    readingMode_originalContent = null;
  }

  readingMode_isActive = false;

  console.log('[ReadingMode] Reading mode exited');
}

/**
 * Toggles reading mode
 */
function readingMode_toggle() {
  if (readingMode_isActive) {
    readingMode_exit();
  } else {
    readingMode_enter();
  }
}

// ============================================================================
// KEYBOARD SHORTCUTS
// ============================================================================

/**
 * Handles Escape key for exiting reading mode
 * (Only used when reading mode is active)
 *
 * @param {KeyboardEvent} event - Keyboard event
 */
function readingMode_handleKeyboard(event) {
  // ESC - Exit reading mode
  if (event.key === 'Escape' && readingMode_isActive) {
    event.preventDefault();
    readingMode_exit();
  }
}

// ============================================================================
// INITIALIZATION & CLEANUP
// ============================================================================

/**
 * Initializes the reading mode feature
 */
function readingMode_init() {
  console.log('[ReadingMode] Initializing...');

  // Add keyboard listener for Escape key
  document.addEventListener('keydown', readingMode_handleKeyboard);

  // Register dynamic keyboard shortcut for toggle
  registerShortcut('reading_mode_toggle', () => {
    console.log('[ReadingMode] Toggle shortcut triggered');
    readingMode_toggle();
  });

  // Register dynamic keyboard shortcut for exit
  registerShortcut('reading_mode_exit', () => {
    if (readingMode_isActive) {
      console.log('[ReadingMode] Exit shortcut triggered');
      readingMode_exit();
    }
  });

  // Load settings from chrome.storage
  chrome.storage.local.get(['readingModeSettings'], result => {
    if (result.readingModeSettings) {
      Object.assign(readingMode_settings, result.readingModeSettings);
      console.log('[ReadingMode] Settings loaded:', readingMode_settings);
    }
  });

  // Listen for settings updates
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.readingModeSettings) {
      Object.assign(readingMode_settings, changes.readingModeSettings.newValue);
      console.log('[ReadingMode] Settings updated:', readingMode_settings);

      // Update overlay if active
      if (readingMode_isActive && readingMode_overlay) {
        readingMode_overlay.style.background = readingMode_settings.backgroundColor;
        const content = document.getElementById('assist-reading-mode-content');
        if (content) {
          content.style.fontFamily = readingMode_settings.fontFamily;
          content.style.fontSize = readingMode_settings.fontSize;
          content.style.lineHeight = readingMode_settings.lineHeight;
          content.style.maxWidth = readingMode_settings.maxWidth;
        }
      }
    }
  });

  // Register feature
  if (!window.assistFeatures) {
    window.assistFeatures = {};
  }

  window.assistFeatures.readingMode = {
    enter: readingMode_enter,
    exit: readingMode_exit,
    toggle: readingMode_toggle,
    isActive: () => readingMode_isActive,
    settings: readingMode_settings,
  };

  console.log('[ReadingMode] Feature initialized. Use Ctrl+Shift+R to toggle.');
}

/**
 * Cleanup function
 */
function readingMode_cleanup() {
  console.log('[ReadingMode] Cleaning up...');
  readingMode_exit();
  document.removeEventListener('keydown', readingMode_handleKeyboard);
}

// ============================================================================
// EXPORTS
// ============================================================================

// Auto-initialize when script loads
if (typeof window !== 'undefined') {
  readingMode_init();
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    readingMode_init,
    readingMode_cleanup,
    readingMode_enter,
    readingMode_exit,
    readingMode_toggle,
    readingMode_extractContent,
  };
}
