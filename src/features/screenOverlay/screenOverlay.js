/**
 * Screen Overlay Feature Module
 *
 * Provides a screen overlay feature for reducing visual stress and improving
 * focus for neurodivergent students. Uses CSS filters to tint the screen
 * while preserving text legibility.
 *
 * WCAG Compliance: Uses CSS filters instead of overlays to maintain
 * text contrast and readability. Respects prefers-reduced-transparency.
 *
 * @module screenOverlay
 * @version 2.0.0
 */

import { showToast } from '../../core/ui/toast.js';
import { initFeatureSettings } from '../../content/utils/storage-utils.js';

// ============================================================
// STATE MANAGEMENT
// ============================================================

/** @type {boolean} Tracks whether screen overlay is currently enabled */
let screenOverlay_enabled = false;

/** @type {HTMLStyleElement|null} Reference to the injected style element */
let screenOverlay_styleElement = null;

/** @type {Object} Configuration object for overlay styling */
const screenOverlay_settings = {
  color: '#FFE4C4', // Warm sepia (default from popup)
  opacity: 0.3,
};

// Color presets with their corresponding CSS filter values
// These apply a color tint WITHOUT obscuring text - matching popup.html options
const COLOR_FILTERS = {
  // Warm tones (sepia-based)
  '#FFE4C4': 'sepia(0.35) saturate(1.1)', // Warm Sepia (recommended)
  '#FFF59D': 'sepia(0.15) saturate(1.3) brightness(1.02)', // Soft Yellow
  '#FFCCBC': 'sepia(0.4) saturate(1.15)', // Peach
  '#F0D9B5': 'sepia(0.25) saturate(1.0)', // Cream

  // Cool tones (hue-rotate based)
  '#B3E5FC': 'hue-rotate(190deg) saturate(0.4) brightness(1.02)', // Cool Blue
  '#C8E6C9': 'hue-rotate(100deg) saturate(0.35) brightness(1.02)', // Soft Green
  '#F8BBD0': 'hue-rotate(330deg) saturate(0.35) brightness(1.02)', // Light Pink
  '#E1BEE7': 'hue-rotate(280deg) saturate(0.3) brightness(1.02)', // Lavender

  // Legacy/fallback
  '#FFF4E6': 'sepia(0.3) saturate(1.1)', // Old default
};

// ============================================================
// CORE FUNCTIONS
// ============================================================

/**
 * Get CSS filter string based on color and intensity
 * @returns {string} CSS filter value
 */
function screenOverlay_getFilter() {
  const baseFilter = COLOR_FILTERS[screenOverlay_settings.color] || COLOR_FILTERS['#FFE4C4'];
  const intensity = screenOverlay_settings.opacity; // 0-1 range

  // Scale the filter effect based on intensity
  // At 0 intensity = no effect, at 1 = full effect
  if (intensity <= 0.1) {
    return 'none';
  }

  // Parse and scale the filter values
  // For sepia filters
  if (baseFilter.includes('sepia')) {
    const sepiaMatch = baseFilter.match(/sepia\(([0-9.]+)\)/);
    if (sepiaMatch) {
      const baseSepia = parseFloat(sepiaMatch[1]);
      const scaledSepia = baseSepia * intensity * 1.5; // Scale with intensity
      return baseFilter.replace(/sepia\([0-9.]+\)/, `sepia(${scaledSepia.toFixed(2)})`);
    }
  }

  // For hue-rotate filters, scale saturation based on intensity
  if (baseFilter.includes('hue-rotate')) {
    const satMatch = baseFilter.match(/saturate\(([0-9.]+)\)/);
    if (satMatch) {
      const baseSat = parseFloat(satMatch[1]);
      // Interpolate between 1 (no change) and baseSat based on intensity
      const scaledSat = 1 + (baseSat - 1) * intensity * 1.5;
      return baseFilter.replace(/saturate\([0-9.]+\)/, `saturate(${scaledSat.toFixed(2)})`);
    }
  }

  return baseFilter;
}

/**
 * Creates/updates the CSS filter style and applies it to the page.
 * Uses CSS filters on the HTML element instead of an overlay div.
 * This preserves text legibility while tinting the screen.
 *
 * @function screenOverlay_create
 * @returns {void}
 */
function screenOverlay_create() {
  // Remove existing style if present
  if (screenOverlay_styleElement) {
    screenOverlay_styleElement.remove();
  }

  const filter = screenOverlay_getFilter();

  screenOverlay_styleElement = document.createElement('style');
  screenOverlay_styleElement.id = 'assist-screen-overlay-style';
  screenOverlay_styleElement.textContent = `
    html {
      filter: ${filter} !important;
      transition: filter 0.3s ease !important;
    }

    /* Ensure extension UI elements are not affected */
    .assist-toast,
    .assist-popup,
    [id^="assist-pomodoro"],
    [id^="assist-sticky"],
    [id^="assist-annotation"] {
      filter: none !important;
    }
  `;

  document.head.appendChild(screenOverlay_styleElement);
  console.log('[ScreenOverlay] Applied CSS filter:', filter);
}

/**
 * Updates the overlay styling based on current settings.
 * @function screenOverlay_update
 * @returns {void}
 */
function screenOverlay_update() {
  if (screenOverlay_enabled) {
    screenOverlay_create();
    console.log('[ScreenOverlay] Updated:', screenOverlay_settings);
  }
}

/**
 * Removes the screen overlay style from the DOM.
 * @function screenOverlay_remove
 * @returns {void}
 */
function screenOverlay_remove() {
  if (screenOverlay_styleElement) {
    screenOverlay_styleElement.remove();
    screenOverlay_styleElement = null;
    console.log('[ScreenOverlay] Removed');
  }
}

// ============================================================
// CONTROL FUNCTIONS
// ============================================================

/**
 * Enables the screen overlay feature.
 * @function screenOverlay_enable
 * @returns {void}
 */
function screenOverlay_enable() {
  screenOverlay_enabled = true;
  screenOverlay_create();
  showToast('🎨 Screen Overlay enabled');
  console.log('[ScreenOverlay] Enabled');
}

/**
 * Disables the screen overlay feature.
 * @function screenOverlay_disable
 * @returns {void}
 */
function screenOverlay_disable() {
  screenOverlay_enabled = false;
  screenOverlay_remove();
  showToast('Screen Overlay disabled');
  console.log('[ScreenOverlay] Disabled');
}

// ============================================================
// STORAGE & PERSISTENCE
// ============================================================

/** @type {Object} Default settings for screen overlay */
const DEFAULT_SETTINGS = {
  enabled: false,
  color: '#FFE4C4',
  opacity: 0.3,
};

/**
 * Applies settings from storage to the module state
 * @param {Object} settings - Settings object from storage
 * @param {boolean} isInit - Whether this is initial load (true) or change (false)
 */
function applySettings(settings, isInit = false) {
  const wasEnabled = screenOverlay_enabled;
  const newEnabled = settings.enabled || false;

  // Update settings
  screenOverlay_settings.color = settings.color || DEFAULT_SETTINGS.color;
  screenOverlay_settings.opacity = settings.opacity || DEFAULT_SETTINGS.opacity;

  // Handle enable/disable
  if (newEnabled && !wasEnabled) {
    screenOverlay_enable();
  } else if (!newEnabled && wasEnabled) {
    screenOverlay_disable();
  } else if (newEnabled && !isInit) {
    // Update style if already enabled (but not on init, as enable() handles it)
    screenOverlay_update();
  }

  console.log(
    `[ScreenOverlay] Settings ${isInit ? 'loaded' : 'updated'}:`,
    newEnabled,
    screenOverlay_settings
  );
}

/**
 * Initialize screen overlay using centralized storage utility.
 * Uses initFeatureSettings for consistent storage access pattern.
 */
initFeatureSettings(
  'screenOverlay',
  DEFAULT_SETTINGS,
  settings => applySettings(settings, true),
  settings => applySettings(settings, false)
);

// ============================================================
// EXPORTS
// ============================================================

export { screenOverlay_create };
export { screenOverlay_update };
export { screenOverlay_remove };
export { screenOverlay_enable };
export { screenOverlay_disable };
export { screenOverlay_settings };
