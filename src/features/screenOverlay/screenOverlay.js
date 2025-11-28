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

// ============================================================
// CORE FUNCTIONS
// ============================================================

/**
 * Creates the screen overlay by directly tinting background colors.
 * This approach:
 * - Sets the html/body background to the tint color
 * - Overrides white/light backgrounds on common elements
 * - Text color remains unchanged, preserving contrast
 *
 * @function screenOverlay_create
 * @returns {void}
 */
function screenOverlay_create() {
  // Remove existing elements
  if (screenOverlay_styleElement) {
    screenOverlay_styleElement.remove();
    screenOverlay_styleElement = null;
  }

  const existingOverlay = document.getElementById('assist-screen-overlay');
  if (existingOverlay) {
    existingOverlay.remove();
  }

  const existingSvg = document.getElementById('assist-screen-overlay-svg');
  if (existingSvg) {
    existingSvg.remove();
  }

  const color = screenOverlay_settings.color;
  const intensity = screenOverlay_settings.opacity; // 0-1 range

  // Convert hex to RGB
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);

  // Blend the tint color with white based on intensity
  // At intensity 0 = white (255,255,255), at intensity 1 = full tint color
  // Using 1.0 multiplier so 90% intensity gives ~90% of the tint effect
  const blendWithWhite = (colorVal, int) => Math.round(255 - (255 - colorVal) * int);

  const bgR = blendWithWhite(r, intensity);
  const bgG = blendWithWhite(g, intensity);
  const bgB = blendWithWhite(b, intensity);
  const bgColor = `rgb(${bgR}, ${bgG}, ${bgB})`;

  // Create style that overrides backgrounds
  const styleEl = document.createElement('style');
  styleEl.id = 'assist-screen-overlay';
  styleEl.textContent = `
    /* Base background tint */
    html, body {
      background-color: ${bgColor} !important;
    }

    /* Override white/near-white backgrounds on common elements */
    /* This uses a broad selector to catch most content containers */
    main, article, section, div, aside, nav, header, footer,
    .content, .container, .wrapper, .page, .post, .entry,
    [class*="content"], [class*="article"], [class*="main"],
    [class*="body"], [class*="wrapper"], [class*="container"] {
      background-color: ${bgColor} !important;
    }

    /* Specifically target elements with white or near-white backgrounds */
    *[style*="background-color: white"],
    *[style*="background-color: #fff"],
    *[style*="background-color: #FFF"],
    *[style*="background-color: rgb(255"],
    *[style*="background: white"],
    *[style*="background: #fff"],
    *[style*="background: #FFF"] {
      background-color: ${bgColor} !important;
    }

    /* Don't affect images, videos, or canvases */
    img, video, canvas, svg, picture, iframe {
      background-color: transparent !important;
    }

    /* Don't affect inputs and form elements (keep them white for usability) */
    input, textarea, select, button {
      background-color: revert !important;
    }

    /* Don't affect extension UI */
    .assist-toast,
    [id^="assist-"] {
      background-color: revert !important;
    }
  `;

  document.head.appendChild(styleEl);
  screenOverlay_styleElement = styleEl;

  console.log('[ScreenOverlay] Applied background tint:', bgColor, 'intensity:', intensity);
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
  }

  // Also remove SVG filter element
  const svg = document.getElementById('assist-screen-overlay-svg');
  if (svg) {
    svg.remove();
  }

  // Remove any overlay div (from previous implementations)
  const overlay = document.getElementById('assist-screen-overlay');
  if (overlay) {
    overlay.remove();
  }

  console.log('[ScreenOverlay] Removed');
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
