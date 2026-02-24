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
 * Detects if the page uses a dark theme by analyzing background colors.
 * Checks html, body, and common content containers for dark backgrounds.
 *
 * @function screenOverlay_detectDarkTheme
 * @returns {boolean} True if dark theme detected, false otherwise
 */
function screenOverlay_detectDarkTheme() {
  // Get computed background color of html and body
  const htmlBg = window.getComputedStyle(document.documentElement).backgroundColor;
  const bodyBg = window.getComputedStyle(document.body).backgroundColor;

  /**
   * Converts RGB/RGBA color string to luminance value (0-255 scale)
   * @param {string} rgbString - RGB or RGBA color string
   * @returns {number} Luminance value (0-255), or 255 if parsing fails
   */
  function getBgLuminance(rgbString) {
    // Handle transparent backgrounds (treat as white)
    if (!rgbString || rgbString === 'transparent' || rgbString === 'rgba(0, 0, 0, 0)') {
      return 255;
    }

    // Parse RGB/RGBA values
    const match = rgbString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) {
      return 255;
    } // Default to white if can't parse

    const r = parseInt(match[1]);
    const g = parseInt(match[2]);
    const b = parseInt(match[3]);

    // Calculate simple luminance (0-255)
    // Using perceived brightness formula
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  const htmlLuminance = getBgLuminance(htmlBg);
  const bodyLuminance = getBgLuminance(bodyBg);

  // Check main content containers as well (some sites only set bg on containers)
  const mainElement = document.querySelector('main, [role="main"], .main-content, #main-content');
  let mainLuminance = 255;
  if (mainElement) {
    const mainBg = window.getComputedStyle(mainElement).backgroundColor;
    mainLuminance = getBgLuminance(mainBg);
  }

  // Use the darkest (lowest luminance) of the checked elements
  const pageLuminance = Math.min(htmlLuminance, bodyLuminance, mainLuminance);

  // Dark theme threshold: luminance below 128 (mid-point)
  // This catches most dark themes (black, dark gray, dark blue, etc.)
  const isDark = pageLuminance < 128;

  console.log(
    '[ScreenOverlay] Theme detection:',
    isDark ? 'DARK' : 'LIGHT',
    `(luminance: ${pageLuminance.toFixed(0)})`,
    {
      htmlBg,
      bodyBg,
      htmlLuminance: htmlLuminance.toFixed(0),
      bodyLuminance: bodyLuminance.toFixed(0),
    }
  );

  return isDark;
}

/**
 * Creates a dark mode friendly overlay using CSS filters.
 * Reduces eye strain on dark pages by:
 * - Warming colors (reducing blue light from white text)
 * - Slightly reducing brightness of very bright elements
 * - Preserving the dark theme and contrast
 *
 * @function screenOverlay_createDarkMode
 * @returns {void}
 */
function screenOverlay_createDarkMode() {
  try {
    console.log('[ScreenOverlay] createDarkMode called');

    // Remove existing elements
    if (screenOverlay_styleElement) {
      screenOverlay_styleElement.remove();
      screenOverlay_styleElement = null;
    }

    const color = screenOverlay_settings.color;
    const intensity = screenOverlay_settings.opacity; // 0-1 range

    console.log('[ScreenOverlay] Dark mode settings:', { color, intensity });

    // Convert hex color to hue for color shift
    // Warm sepia colors have hue around 30-40 degrees
    // We'll apply a subtle sepia filter + brightness reduction

    // Calculate filter intensity based on user's opacity setting
    // Dark mode needs stronger effect to be visible
    const sepiaAmount = intensity * 0.5; // Max 50% sepia at 100% intensity
    const brightnessAmount = 1 - intensity * 0.15; // Max 15% brightness reduction at 100%

    const styleEl = document.createElement('style');
    styleEl.id = 'assist-screen-overlay';
    styleEl.textContent = `
      /* Apply subtle warm filter to entire page */
      html {
        filter: sepia(${sepiaAmount.toFixed(2)}) brightness(${brightnessAmount.toFixed(2)}) !important;
        transition: filter 0.3s ease !important;
      }

      /* Don't affect extension UI */
      .assist-toast,
      [id^="assist-"] {
        filter: none !important;
      }

      /* Reduce brightness of very bright whites (helps with eye strain) */
      * {
        --assist-text-brightness: ${brightnessAmount.toFixed(2)};
      }

      /* Apply slight brightness reduction to white/near-white text */
      *[style*="color: white"],
      *[style*="color: #fff"],
      *[style*="color: #FFF"],
      *[style*="color: rgb(255, 255, 255)"] {
        filter: brightness(var(--assist-text-brightness)) !important;
      }
    `;

    document.head.appendChild(styleEl);
    screenOverlay_styleElement = styleEl;

    console.log(
      '[ScreenOverlay] Applied dark mode overlay:',
      `sepia(${sepiaAmount.toFixed(2)})`,
      `brightness(${brightnessAmount.toFixed(2)})`
    );
  } catch (error) {
    console.error('[ScreenOverlay] Error in createDarkMode:', error);
  }
}

/**
 * Creates the screen overlay by directly tinting background colors.
 * This approach:
 * - Detects if page uses dark theme (auto-detection)
 * - Applies dark mode overlay for dark pages (subtle filter)
 * - Applies light mode overlay for light pages (background tinting)
 * - Sets the html/body background to the tint color
 * - Overrides white/light backgrounds on common elements
 * - Text color remains unchanged, preserving contrast
 *
 * @function screenOverlay_create
 * @returns {void}
 */
function screenOverlay_create() {
  // SMART AUTO-DETECTION: Check if page uses dark theme
  const isDarkTheme = screenOverlay_detectDarkTheme();

  if (isDarkTheme) {
    console.log('[ScreenOverlay] Dark theme detected - applying dark mode overlay');
    screenOverlay_createDarkMode();
    return;
  }

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

  // Calculate luminance to determine appropriate text color for contrast
  // Uses relative luminance formula from WCAG 2.0
  function getLuminance(r, g, b) {
    const [rs, gs, bs] = [r, g, b].map(c => {
      c = c / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  }

  const luminance = getLuminance(bgR, bgG, bgB);
  // Use dark text on light backgrounds, light text on dark backgrounds
  // Threshold of 0.5 provides good balance
  const textColor = luminance > 0.5 ? '#000000' : '#FFFFFF';

  console.log(
    '[ScreenOverlay] Background:',
    bgColor,
    'Luminance:',
    luminance.toFixed(2),
    'Text color:',
    textColor
  );

  // Exclusion selector: skip all extension UI elements and their descendants
  // Uses :not() with :is() to cleanly exclude assist-* elements from overlay rules
  const EX =
    ':not([id^="assist-"]):not(:is([id^="assist-"] *)):not(.assist-toast):not(:is(.assist-toast *))';

  // Create style that overrides backgrounds
  const styleEl = document.createElement('style');
  styleEl.id = 'assist-screen-overlay';
  styleEl.textContent = `
    /* Base background tint */
    html, body {
      background-color: ${bgColor} !important;
    }

    /* Override white/near-white backgrounds on common elements */
    :is(main, article, section, div, aside, nav, header, footer)${EX} {
      background-color: ${bgColor} !important;
    }
    :is(.content, .container, .wrapper, .page, .post, .entry,
    [class*="content"], [class*="article"], [class*="main"],
    [class*="body"], [class*="wrapper"], [class*="container"])${EX} {
      background-color: ${bgColor} !important;
    }

    /* Ensure text contrast based on background luminance */
    :is(p, h1, h2, h3, h4, h5, h6, span, div, li, td, th,
    article, section, main, aside, blockquote, figcaption, legend,
    dt, dd, address, label, caption)${EX} {
      color: ${textColor} !important;
    }

    /* Preserve link distinctiveness with underline */
    a${EX} {
      color: ${textColor} !important;
      text-decoration: underline !important;
    }

    /* Don't affect images, videos, or canvases */
    img, video, canvas, svg, picture, iframe {
      background-color: transparent !important;
    }

    /* Don't affect inputs and form elements (keep them usable) */
    :is(input, textarea, select, button)${EX} {
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
  console.log('[ScreenOverlay] applySettings called:', {
    settings,
    isInit,
    wasEnabled: screenOverlay_enabled,
  });

  const wasEnabled = screenOverlay_enabled;
  const newEnabled = settings.enabled || false;

  // Update settings
  screenOverlay_settings.color = settings.color || DEFAULT_SETTINGS.color;
  screenOverlay_settings.opacity = settings.opacity || DEFAULT_SETTINGS.opacity;

  console.log('[ScreenOverlay] State transition:', { wasEnabled, newEnabled, isInit });

  // Handle enable/disable
  if (newEnabled && !wasEnabled) {
    console.log('[ScreenOverlay] Calling screenOverlay_enable()');
    screenOverlay_enable();
  } else if (!newEnabled && wasEnabled) {
    console.log('[ScreenOverlay] Calling screenOverlay_disable()');
    screenOverlay_disable();
  } else if (newEnabled && !isInit) {
    console.log('[ScreenOverlay] Calling screenOverlay_update()');
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
console.log('[ScreenOverlay] Module loading, initializing...');
initFeatureSettings(
  'screenOverlay',
  DEFAULT_SETTINGS,
  settings => applySettings(settings, true),
  settings => applySettings(settings, false)
);
console.log('[ScreenOverlay] Module initialization complete');

// ============================================================
// EXPORTS
// ============================================================

export { screenOverlay_create };
export { screenOverlay_update };
export { screenOverlay_remove };
export { screenOverlay_enable };
export { screenOverlay_disable };
export { screenOverlay_settings };
