/**
 * Focus Mode Feature
 * Creates a clear window with darkened overlay to help focus on specific text
 */

import { getSettings, onSettingsChange } from '../utils/storage-utils.js';
import { showToast } from '../utils/dom-utils.js';

// Focus Mode State (Feature Isolated)
let focusMode_enabled = false;
let focusMode_windowElement = null;
const focusMode_settings = {
  boxWidth: 400,
  boxHeight: 100,
  overlayOpacity: 0.7,
};

// Reference to readingGuide for mutual exclusivity
let readingGuide_disable = null;
let readingGuide_enabled = false;

/**
 * Create Focus Mode window element with box-shadow overlay
 */
function focusMode_createWindow() {
  if (focusMode_windowElement) {
    return; // Already exists
  }

  // Create a single div that will cast a huge box-shadow to darken everything else
  focusMode_windowElement = document.createElement('div');
  focusMode_windowElement.id = 'assist-focus-mode-window';

  // Calculate border-radius as 20% of the smaller dimension
  const radiusPercent = 0.2;
  const radius =
    Math.min(focusMode_settings.boxWidth, focusMode_settings.boxHeight) * radiusPercent;

  focusMode_windowElement.style.cssText = `
    position: fixed;
    width: ${focusMode_settings.boxWidth}px;
    height: ${focusMode_settings.boxHeight}px;
    border-radius: ${radius}px;
    pointer-events: none;
    z-index: 9998;
    display: none;
    background-color: transparent;
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, ${focusMode_settings.overlayOpacity});
    transition: all 0.05s ease-out;
  `;

  document.body.appendChild(focusMode_windowElement);
  console.log('[FocusMode] Window element created with box-shadow overlay');
}

/**
 * Update window position based on mouse coordinates
 */
function focusMode_updatePosition(mouseX, mouseY) {
  if (!focusMode_windowElement || !focusMode_enabled) {
    return;
  }

  const halfWidth = focusMode_settings.boxWidth / 2;
  const halfHeight = focusMode_settings.boxHeight / 2;

  // Center window on mouse position
  const left = mouseX - halfWidth;
  const top = mouseY - halfHeight;

  focusMode_windowElement.style.left = left + 'px';
  focusMode_windowElement.style.top = top + 'px';
}

/**
 * Update window styling (size, opacity, border-radius)
 */
function focusMode_updateStyle() {
  if (!focusMode_windowElement) {
    return;
  }

  // Calculate border-radius as 20% of the smaller dimension
  const radiusPercent = 0.2;
  const radius =
    Math.min(focusMode_settings.boxWidth, focusMode_settings.boxHeight) * radiusPercent;

  focusMode_windowElement.style.width = focusMode_settings.boxWidth + 'px';
  focusMode_windowElement.style.height = focusMode_settings.boxHeight + 'px';
  focusMode_windowElement.style.borderRadius = radius + 'px';
  focusMode_windowElement.style.boxShadow = `0 0 0 9999px rgba(0, 0, 0, ${focusMode_settings.overlayOpacity})`;
}

/**
 * Enable Focus Mode
 */
function focusMode_enable() {
  // Check mutual exclusivity with Reading Guide
  if (readingGuide_enabled && readingGuide_disable) {
    readingGuide_disable();
    showToast('📏 Reading Guide disabled (Focus Mode active)');
  }

  focusMode_enabled = true;
  focusMode_createWindow();

  if (focusMode_windowElement) {
    focusMode_windowElement.style.display = 'block';
  }

  // Add mousemove listener
  document.addEventListener('mousemove', focusMode_handleMouseMove);

  console.log('[FocusMode] Enabled');
  showToast('🎯 Focus Mode enabled');
}

/**
 * Disable Focus Mode
 */
function focusMode_disable() {
  focusMode_enabled = false;

  if (focusMode_windowElement) {
    focusMode_windowElement.style.display = 'none';
  }

  // Remove mousemove listener
  document.removeEventListener('mousemove', focusMode_handleMouseMove);

  console.log('[FocusMode] Disabled');
  showToast('Focus Mode disabled');
}

/**
 * Mouse move handler
 */
function focusMode_handleMouseMove(event) {
  if (focusMode_enabled) {
    focusMode_updatePosition(event.clientX, event.clientY);
  }
}

/**
 * Handle settings changes
 */
function focusMode_handleSettingsChange(newSettings) {
  if (!newSettings.focusMode) {
    return;
  }

  const fmSettings = newSettings.focusMode;
  const wasEnabled = focusMode_enabled;
  const newEnabled = fmSettings.enabled || false;

  // Update settings
  focusMode_settings.boxWidth = fmSettings.boxWidth || 400;
  focusMode_settings.boxHeight = fmSettings.boxHeight || 100;
  focusMode_settings.overlayOpacity = fmSettings.overlayOpacity || 0.7;

  // Handle enable/disable
  if (newEnabled && !wasEnabled) {
    focusMode_enable();
  } else if (!newEnabled && wasEnabled) {
    focusMode_disable();
  } else if (newEnabled) {
    // Update style if already enabled
    focusMode_updateStyle();
  }

  console.log('[FocusMode] Settings updated:', newEnabled, focusMode_settings);
}

/**
 * Initialize Focus Mode feature
 */
export async function focusMode_initialize() {
  console.log('[FocusMode] Initializing...');

  // Load settings
  const allSettings = await getSettings();
  if (allSettings.focusMode) {
    const fmSettings = allSettings.focusMode;
    focusMode_enabled = fmSettings.enabled || false;
    focusMode_settings.boxWidth = fmSettings.boxWidth || 400;
    focusMode_settings.boxHeight = fmSettings.boxHeight || 100;
    focusMode_settings.overlayOpacity = fmSettings.overlayOpacity || 0.7;

    if (focusMode_enabled) {
      focusMode_enable();
    }

    console.log('[FocusMode] Settings loaded:', focusMode_enabled, focusMode_settings);
  }

  // Listen for settings changes
  onSettingsChange(focusMode_handleSettingsChange);

  console.log('[FocusMode] Initialized');
}

/**
 * Set reading guide references for mutual exclusivity
 * Called by index.js after both features initialize
 */
export function focusMode_setReadingGuideRef(isEnabled, disableFunc) {
  readingGuide_enabled = isEnabled;
  readingGuide_disable = disableFunc;
}

/**
 * Get Focus Mode state for debugging
 */
export function focusMode_getState() {
  return {
    enabled: focusMode_enabled,
    settings: focusMode_settings,
  };
}

/**
 * Export disable function for mutual exclusivity
 */
export { focusMode_disable };
