/**
 * Reading Guide Feature
 * Horizontal line that follows the mouse to help track reading position
 */

import { getSettings, onSettingsChange } from '../utils/storage-utils.js';
import { showToast } from '../utils/dom-utils.js';

// Reading Guide State (Feature Isolated)
let readingGuide_enabled = false;
let readingGuide_lineElement = null;
const readingGuide_settings = {
  lineColor: '#000000',
  lineThickness: 3,
  lineOpacity: 0.7,
};

// Reference to focusMode for mutual exclusivity
let focusMode_disable = null;
let focusMode_enabled = false;

/**
 * Create Reading Guide line element
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
 * Update line position based on mouse Y coordinate
 */
function readingGuide_updatePosition(mouseY) {
  if (readingGuide_lineElement && readingGuide_enabled) {
    readingGuide_lineElement.style.top = mouseY + 'px';
  }
}

/**
 * Update line styling
 */
function readingGuide_updateStyle() {
  if (readingGuide_lineElement) {
    readingGuide_lineElement.style.height = readingGuide_settings.lineThickness + 'px';
    readingGuide_lineElement.style.backgroundColor = readingGuide_settings.lineColor;
    readingGuide_lineElement.style.opacity = readingGuide_settings.lineOpacity;
  }
}

/**
 * Enable Reading Guide
 */
function readingGuide_enable() {
  // Check mutual exclusivity with Focus Mode
  if (focusMode_enabled && focusMode_disable) {
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
 * Disable Reading Guide
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

/**
 * Mouse move handler
 */
function readingGuide_handleMouseMove(event) {
  if (readingGuide_enabled) {
    readingGuide_updatePosition(event.clientY);
  }
}

/**
 * Handle settings changes
 */
function readingGuide_handleSettingsChange(newSettings) {
  if (!newSettings.readingGuide) return;

  const rgSettings = newSettings.readingGuide;
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

/**
 * Initialize Reading Guide feature
 */
export async function readingGuide_initialize() {
  console.log('[ReadingGuide] Initializing...');

  // Load settings
  const allSettings = await getSettings();
  if (allSettings.readingGuide) {
    const rgSettings = allSettings.readingGuide;
    readingGuide_enabled = rgSettings.enabled || false;
    readingGuide_settings.lineColor = rgSettings.lineColor || '#000000';
    readingGuide_settings.lineThickness = rgSettings.lineThickness || 3;
    readingGuide_settings.lineOpacity = rgSettings.lineOpacity || 0.7;

    if (readingGuide_enabled) {
      readingGuide_enable();
    }

    console.log('[ReadingGuide] Settings loaded:', readingGuide_enabled, readingGuide_settings);
  }

  // Listen for settings changes
  onSettingsChange(readingGuide_handleSettingsChange);

  console.log('[ReadingGuide] Initialized');
}

/**
 * Set focus mode references for mutual exclusivity
 * Called by index.js after both features initialize
 */
export function readingGuide_setFocusModeRef(isEnabled, disableFunc) {
  focusMode_enabled = isEnabled;
  focusMode_disable = disableFunc;
}

/**
 * Get Reading Guide state for debugging
 */
export function readingGuide_getState() {
  return {
    enabled: readingGuide_enabled,
    settings: readingGuide_settings,
  };
}

/**
 * Export disable function for mutual exclusivity
 */
export { readingGuide_disable };
