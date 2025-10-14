/**
 * Screen Overlay Feature
 * Applies a colored overlay to reduce eye strain and improve readability
 */

import { getSettings, onSettingsChange } from '../utils/storage-utils.js';
import { showToast } from '../utils/dom-utils.js';

// Screen Overlay State (Feature Isolated)
let screenOverlay_enabled = false;
let screenOverlay_element = null;
const screenOverlay_settings = {
  color: '#FFF4E6', // Warm sepia
  opacity: 0.3,
};

/**
 * Create screen overlay element
 */
function screenOverlay_create() {
  if (screenOverlay_element) {
    return; // Already exists
  }

  screenOverlay_element = document.createElement('div');
  screenOverlay_element.id = 'assist-screen-overlay';
  screenOverlay_element.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background-color: ${screenOverlay_settings.color};
    opacity: ${screenOverlay_settings.opacity};
    pointer-events: none;
    z-index: 999999;
    transition: background-color 0.3s ease, opacity 0.3s ease;
  `;

  document.body.appendChild(screenOverlay_element);
  console.log('[ScreenOverlay] Overlay element created');
}

/**
 * Update overlay styling
 */
function screenOverlay_update() {
  if (screenOverlay_element) {
    screenOverlay_element.style.backgroundColor = screenOverlay_settings.color;
    screenOverlay_element.style.opacity = screenOverlay_settings.opacity;
    console.log('[ScreenOverlay] Updated:', screenOverlay_settings);
  }
}

/**
 * Remove screen overlay
 */
function screenOverlay_remove() {
  if (screenOverlay_element) {
    screenOverlay_element.remove();
    screenOverlay_element = null;
    console.log('[ScreenOverlay] Removed');
  }
}

/**
 * Enable screen overlay
 */
function screenOverlay_enable() {
  screenOverlay_enabled = true;
  screenOverlay_create();
  showToast('🎨 Screen Overlay enabled');
  console.log('[ScreenOverlay] Enabled');
}

/**
 * Disable screen overlay
 */
function screenOverlay_disable() {
  screenOverlay_enabled = false;
  screenOverlay_remove();
  showToast('Screen Overlay disabled');
  console.log('[ScreenOverlay] Disabled');
}

/**
 * Handle settings changes
 */
function screenOverlay_handleSettingsChange(newSettings) {
  if (!newSettings.screenOverlay) return;

  const soSettings = newSettings.screenOverlay;
  const wasEnabled = screenOverlay_enabled;
  const newEnabled = soSettings.enabled || false;

  // Update settings
  screenOverlay_settings.color = soSettings.color || '#FFF4E6';
  screenOverlay_settings.opacity = soSettings.opacity || 0.3;

  // Handle enable/disable
  if (newEnabled && !wasEnabled) {
    screenOverlay_enable();
  } else if (!newEnabled && wasEnabled) {
    screenOverlay_disable();
  } else if (newEnabled) {
    // Update style if already enabled
    screenOverlay_update();
  }

  console.log('[ScreenOverlay] Settings updated:', newEnabled, screenOverlay_settings);
}

/**
 * Initialize Screen Overlay feature
 */
export async function screenOverlay_initialize() {
  console.log('[ScreenOverlay] Initializing...');

  // Load settings
  const allSettings = await getSettings();
  if (allSettings.screenOverlay) {
    const soSettings = allSettings.screenOverlay;
    screenOverlay_enabled = soSettings.enabled || false;
    screenOverlay_settings.color = soSettings.color || '#FFF4E6';
    screenOverlay_settings.opacity = soSettings.opacity || 0.3;

    if (screenOverlay_enabled) {
      screenOverlay_enable();
    }

    console.log('[ScreenOverlay] Settings loaded:', screenOverlay_enabled, screenOverlay_settings);
  }

  // Listen for settings changes
  onSettingsChange(screenOverlay_handleSettingsChange);

  console.log('[ScreenOverlay] Initialized');
}

/**
 * Get Screen Overlay state for debugging
 */
export function screenOverlay_getState() {
  return {
    enabled: screenOverlay_enabled,
    settings: screenOverlay_settings,
  };
}
