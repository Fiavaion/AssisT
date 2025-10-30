/**
 * Reading Guide Feature Module
 *
 * Provides a reading guide line that tracks the user's mouse position,
 * helping neurodivergent students maintain focus and track their reading position.
 *
 * @module readingGuide
 * @requires ../core/ui/toast.js
 */

import { showToast } from '../../core/ui/toast.js';

// ============================================================
// MODULE STATE
// ============================================================

/** @type {boolean} - Whether the reading guide is currently enabled */
let readingGuide_enabled = false;

/** @type {HTMLElement|null} - Reference to the reading guide line DOM element */
let readingGuide_lineElement = null;

/**
 * Reading Guide configuration settings
 * @type {Object}
 * @property {string} lineColor - CSS color of the reading guide line (hex format)
 * @property {number} lineThickness - Height of the line in pixels
 * @property {number} lineOpacity - Opacity of the line (0.0 to 1.0)
 */
const readingGuide_settings = {
  lineColor: '#000000',
  lineThickness: 3,
  lineOpacity: 0.7,
};

// ============================================================
// CORE FUNCTIONS
// ============================================================

/**
 * Creates the reading guide line element and appends it to the DOM.
 *
 * The line is created as a fixed position element with pointer-events: none
 * to ensure it doesn't interfere with user interactions. Includes a smooth
 * CSS transition for position updates.
 *
 * @function readingGuide_createLine
 * @returns {void}
 */
function readingGuide_createLine() {
  if (readingGuide_lineElement) {
    return; // Already exists
  }

  readingGuide_lineElement = document.createElement('div');
  readingGuide_lineElement.id = 'assist-reading-guide-line';
  readingGuide_lineElement.style.cssText = `
    position: fixed;
    left: 0;
    top: 0;
    width: 100vw;
    height: ${readingGuide_settings.lineThickness}px;
    background-color: ${readingGuide_settings.lineColor};
    opacity: ${readingGuide_settings.lineOpacity};
    pointer-events: none;
    z-index: 9999;
    transition: top 0.05s ease-out;
    display: none;
  `;
  document.body.appendChild(readingGuide_lineElement);
  console.log('[ReadingGuide] Line element created');
}

/**
 * Updates the vertical position of the reading guide line based on mouse Y coordinate.
 *
 * Called on every mousemove event to track the user's reading position.
 * Only updates if the reading guide is enabled.
 *
 * @function readingGuide_updatePosition
 * @param {number} mouseY - The Y coordinate (in pixels) of the mouse position
 * @returns {void}
 */
function readingGuide_updatePosition(mouseY) {
  if (readingGuide_lineElement && readingGuide_enabled) {
    readingGuide_lineElement.style.top = mouseY + 'px';
  }
}

/**
 * Updates the visual styling of the reading guide line.
 *
 * Applies the current settings (lineThickness, lineColor, lineOpacity)
 * to the line element. Called when settings are updated.
 *
 * @function readingGuide_updateStyle
 * @returns {void}
 */
function readingGuide_updateStyle() {
  if (readingGuide_lineElement) {
    readingGuide_lineElement.style.height = readingGuide_settings.lineThickness + 'px';
    readingGuide_lineElement.style.backgroundColor = readingGuide_settings.lineColor;
    readingGuide_lineElement.style.opacity = readingGuide_settings.lineOpacity;
  }
}

/**
 * Enables the reading guide feature.
 *
 * - Creates the line element if it doesn't exist
 * - Displays the line and attaches the mousemove listener
 * - Handles mutual exclusivity with Focus Mode (disables Focus Mode if active)
 * - Shows a toast notification to the user
 *
 * @function readingGuide_enable
 * @returns {void}
 */
function readingGuide_enable() {
  // Check mutual exclusivity with Focus Mode
  // Note: focusMode_disable() is imported/available from the main content script
  if (typeof focusMode_disable !== 'undefined' && typeof focusMode_enabled !== 'undefined' && focusMode_enabled) {
    focusMode_disable();
    showToast('🎯 Focus Mode disabled (Reading Guide active)');
  }

  readingGuide_enabled = true;
  readingGuide_createLine();
  if (readingGuide_lineElement) {
    readingGuide_lineElement.style.display = 'block';
  }

  // Add mousemove listener
  document.addEventListener('mousemove', readingGuide_handleMouseMove);

  console.log('[ReadingGuide] Enabled');
  showToast('📏 Reading Guide enabled');
}

/**
 * Disables the reading guide feature.
 *
 * - Hides the reading guide line
 * - Removes the mousemove event listener
 * - Shows a toast notification to the user
 *
 * @function readingGuide_disable
 * @returns {void}
 */
function readingGuide_disable() {
  readingGuide_enabled = false;
  if (readingGuide_lineElement) {
    readingGuide_lineElement.style.display = 'none';
  }

  // Remove mousemove listener
  document.removeEventListener('mousemove', readingGuide_handleMouseMove);

  console.log('[ReadingGuide] Disabled');
  showToast('Reading Guide disabled');
}

// ============================================================
// EVENT HANDLERS
// ============================================================

/**
 * Handles mousemove events to update the reading guide line position.
 *
 * Bound to the document's mousemove event when the reading guide is enabled.
 *
 * @function readingGuide_handleMouseMove
 * @param {MouseEvent} event - The mousemove event object
 * @returns {void}
 */
function readingGuide_handleMouseMove(event) {
  if (readingGuide_enabled) {
    readingGuide_updatePosition(event.clientY);
  }
}

// ============================================================
// INITIALIZATION & STORAGE LISTENERS
// ============================================================

/**
 * Initializes reading guide settings from Chrome storage.
 *
 * Loads settings on script initialization and automatically enables
 * the reading guide if it was previously enabled.
 */
chrome.storage.local.get('assist_settings', result => {
  if (result.assist_settings && result.assist_settings.readingGuide) {
    const rgSettings = result.assist_settings.readingGuide;
    readingGuide_enabled = rgSettings.enabled || false;
    readingGuide_settings.lineColor = rgSettings.lineColor || '#000000';
    readingGuide_settings.lineThickness = rgSettings.lineThickness || 3;
    readingGuide_settings.lineOpacity = rgSettings.lineOpacity || 0.7;

    if (readingGuide_enabled) {
      readingGuide_enable();
    }

    console.log('[ReadingGuide] Settings loaded:', readingGuide_enabled, readingGuide_settings);
  }
});

/**
 * Listens for changes to Chrome storage and updates reading guide settings.
 *
 * Updates are applied in real-time:
 * - Enables/disables the reading guide based on settings
 * - Updates line style properties (color, thickness, opacity)
 * - Handles enable/disable transitions
 */
chrome.storage.onChanged.addListener(changes => {
  if (changes.assist_settings && changes.assist_settings.newValue?.readingGuide) {
    const rgSettings = changes.assist_settings.newValue.readingGuide;

    const wasEnabled = readingGuide_enabled;
    const newEnabled = rgSettings.enabled || false;

    // Update settings
    readingGuide_settings.lineColor = rgSettings.lineColor || '#000000';
    readingGuide_settings.lineThickness = rgSettings.lineThickness || 3;
    readingGuide_settings.lineOpacity = rgSettings.lineOpacity || 0.7;

    // Handle enable/disable
    if (newEnabled && !wasEnabled) {
      readingGuide_enable();
    } else if (!newEnabled && wasEnabled) {
      readingGuide_disable();
    } else if (newEnabled) {
      // Update style if already enabled
      readingGuide_updateStyle();
    }

    console.log('[ReadingGuide] Settings updated:', newEnabled, readingGuide_settings);
  }
});

// ============================================================
// EXPORTS
// ============================================================

/**
 * Public API for the Reading Guide feature module
 */
export {
  readingGuide_enable,
  readingGuide_disable,
  readingGuide_createLine,
  readingGuide_updatePosition,
  readingGuide_updateStyle,
  readingGuide_handleMouseMove,
};
