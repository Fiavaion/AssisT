/**
 * Reading Progress Bar Feature Module
 *
 * Displays a visual progress indicator that tracks the user's position in long documents.
 * This helps neurodivergent students maintain awareness of their reading progress and
 * provides a sense of accomplishment as they work through content.
 *
 * @module readingProgress
 * @version 1.0.0
 * @requires ../../core/ui/toast.js
 * @requires ../../content/utils/storage-utils.js
 *
 * Features:
 * - Fixed position progress bar (top or bottom of viewport)
 * - Automatic scroll tracking with percentage calculation
 * - Optional percentage display
 * - Smooth animations (respecting prefers-reduced-motion)
 * - Configurable colors, height, and position
 * - Auto-hide on 100% completion (optional)
 * - Throttled scroll events for optimal performance
 *
 * @example
 * // Enable reading progress bar
 * progress_enable();
 *
 * // Change position
 * progress_setPosition('bottom');
 *
 * // Update settings programmatically
 * chrome.storage.local.set({
 *   assist_settings: {
 *     readingProgress: {
 *       enabled: true,
 *       position: 'top',
 *       color: '#4CAF50',
 *       showPercentage: true
 *     }
 *   }
 * });
 */

import { initFeatureSettings } from '../../content/utils/storage-utils.js';
import { Z } from '../../utils/z-index.js';
import { showToast } from '../../core/ui/toast.js';

// ============================================================
// MODULE STATE
// ============================================================

/**
 * Whether the reading progress bar is currently enabled
 * @type {boolean}
 * @private
 */
let progress_enabled = false;

/**
 * Reference to the injected style element
 * @type {HTMLStyleElement|null}
 * @private
 */
let progress_styleElement = null;

/**
 * Reference to the progress bar container element
 * @type {HTMLElement|null}
 * @private
 */
let progress_barElement = null;

/**
 * Reference to the percentage text element
 * @type {HTMLElement|null}
 * @private
 */
let progress_percentElement = null;

/**
 * Timestamp of last scroll event (for throttling)
 * @type {number}
 * @private
 */
let progress_lastScrollTime = 0;

/**
 * Throttle delay in milliseconds
 * @type {number}
 * @private
 */
const SCROLL_THROTTLE_MS = 16; // ~60fps

/**
 * Reading Progress Bar configuration settings
 * @type {Object}
 * @property {boolean} enabled - Whether the feature is active
 * @property {string} position - Bar position: 'top' or 'bottom'
 * @property {number} height - Bar height in pixels
 * @property {string} color - Progress bar color (CSS color)
 * @property {string} backgroundColor - Background bar color (CSS color)
 * @property {boolean} showPercentage - Display percentage text
 * @property {boolean} smoothScroll - Enable smooth animations
 * @property {boolean} hideOnComplete - Hide when scroll reaches 100%
 * @private
 */
const progress_settings = {
  enabled: false,
  position: 'top',
  height: 4,
  color: '#4CAF50',
  backgroundColor: 'rgba(0,0,0,0.1)',
  showPercentage: false,
  smoothScroll: true,
  hideOnComplete: false,
};

// ============================================================
// CORE FUNCTIONS
// ============================================================

/**
 * Calculates the current scroll percentage of the document.
 *
 * Returns a value between 0 and 100 representing how far the user has
 * scrolled through the document. Accounts for viewport height to ensure
 * 100% is reached when the bottom of the page is visible.
 *
 * @function progress_calculateScrollPercentage
 * @returns {number} Scroll percentage (0-100)
 *
 * @example
 * const percent = progress_calculateScrollPercentage();
 * console.log(`User has scrolled ${percent}% of the page`);
 */
function progress_calculateScrollPercentage() {
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  const scrollHeight = document.documentElement.scrollHeight;
  const clientHeight = document.documentElement.clientHeight;

  // If page doesn't scroll, return 100%
  if (scrollHeight <= clientHeight) {
    return 100;
  }

  // Calculate percentage (0-100)
  const scrollableHeight = scrollHeight - clientHeight;
  const percentage = (scrollTop / scrollableHeight) * 100;

  // Clamp between 0 and 100
  return Math.min(Math.max(percentage, 0), 100);
}

/**
 * Updates the progress bar width and percentage display based on current scroll position.
 *
 * Calculates scroll percentage and updates the visual elements accordingly.
 * Handles the hideOnComplete setting by hiding the bar at 100%.
 *
 * @function progress_updateProgress
 * @returns {void}
 *
 * @example
 * progress_updateProgress();
 * // Progress bar now reflects current scroll position
 */
function progress_updateProgress() {
  if (!progress_barElement || !progress_enabled) {
    return;
  }

  const percentage = progress_calculateScrollPercentage();

  // Update bar width
  const fillElement = progress_barElement.querySelector('#assist-reading-progress-fill');
  if (fillElement) {
    fillElement.style.width = percentage + '%';
  }

  // Update percentage text if enabled
  if (progress_settings.showPercentage && progress_percentElement) {
    progress_percentElement.textContent = Math.round(percentage) + '%';
  }

  // Handle hideOnComplete
  if (progress_settings.hideOnComplete && percentage >= 100) {
    progress_barElement.style.opacity = '0';
  } else {
    progress_barElement.style.opacity = '1';
  }
}

/**
 * Creates and injects the CSS styles for the progress bar.
 *
 * Generates a style element with all necessary CSS rules, including:
 * - Fixed positioning based on settings.position
 * - Smooth transitions (respecting prefers-reduced-motion)
 * - Responsive design
 * - Percentage badge positioning
 *
 * @function progress_injectStyles
 * @returns {void}
 *
 * @private
 */
function progress_injectStyles() {
  // Remove existing styles if present
  if (progress_styleElement) {
    progress_styleElement.remove();
  }

  progress_styleElement = document.createElement('style');
  progress_styleElement.id = 'assist-reading-progress-styles';

  // Determine position CSS
  const positionCSS =
    progress_settings.position === 'bottom' ? 'bottom: 0; top: auto;' : 'top: 0; bottom: auto;';

  // Determine transition CSS (respect reduced motion)
  const transitionCSS = progress_settings.smoothScroll
    ? `
      transition: width 0.2s ease-out, opacity 0.3s ease;
    `
    : '';

  // Respect prefers-reduced-motion media query
  const reducedMotionCSS = `
    @media (prefers-reduced-motion: reduce) {
      #assist-reading-progress-fill {
        transition: none !important;
      }
      #assist-reading-progress-percent {
        transition: none !important;
      }
    }
  `;

  // Percentage badge position
  const percentPosition =
    progress_settings.position === 'bottom'
      ? 'bottom: calc(100% + 8px); top: auto;'
      : 'top: calc(100% + 8px); bottom: auto;';

  progress_styleElement.textContent = `
    #assist-reading-progress-container {
      position: fixed;
      left: 0;
      ${positionCSS}
      width: 100%;
      height: ${progress_settings.height}px;
      background-color: ${progress_settings.backgroundColor};
      z-index: ${Z.OVERLAY};
      pointer-events: none;
      transition: opacity 0.3s ease;
    }

    #assist-reading-progress-fill {
      position: absolute;
      left: 0;
      top: 0;
      height: 100%;
      background-color: ${progress_settings.color};
      width: 0%;
      ${transitionCSS}
    }

    #assist-reading-progress-percent {
      position: fixed;
      right: 20px;
      ${percentPosition}
      background-color: ${progress_settings.color};
      color: white;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      font-family: -apple-system, system-ui, sans-serif;
      z-index: 1000000;
      pointer-events: none;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      display: ${progress_settings.showPercentage ? 'block' : 'none'};
      transition: opacity 0.3s ease;
    }

    ${reducedMotionCSS}
  `;

  document.head.appendChild(progress_styleElement);
  console.log('[ReadingProgress] Styles injected');
}

/**
 * Creates the progress bar HTML elements and appends them to the DOM.
 *
 * Creates a container element with:
 * - Background bar (full width)
 * - Foreground fill bar (width based on scroll percentage)
 * - Optional percentage badge
 *
 * @function progress_createBar
 * @returns {void}
 *
 * @private
 */
function progress_createBar() {
  if (progress_barElement) {
    return; // Already exists
  }

  // Create container
  progress_barElement = document.createElement('div');
  progress_barElement.id = 'assist-reading-progress-container';

  // Create fill bar
  const fillElement = document.createElement('div');
  fillElement.id = 'assist-reading-progress-fill';
  progress_barElement.appendChild(fillElement);

  // Create percentage display
  progress_percentElement = document.createElement('span');
  progress_percentElement.id = 'assist-reading-progress-percent';
  progress_percentElement.textContent = '0%';

  // Append to body
  document.body.appendChild(progress_barElement);
  document.body.appendChild(progress_percentElement);

  console.log('[ReadingProgress] Bar elements created');
}

/**
 * Enables the reading progress bar feature.
 *
 * - Injects CSS styles
 * - Creates progress bar elements
 * - Attaches scroll and resize listeners
 * - Updates initial progress
 * - Shows toast notification
 *
 * @function progress_enable
 * @returns {void}
 *
 * @example
 * progress_enable();
 * // Reading progress bar is now visible and tracking scroll
 */
function progress_enable() {
  progress_enabled = true;

  // Inject styles
  progress_injectStyles();

  // Create bar elements
  progress_createBar();

  // Attach event listeners
  window.addEventListener('scroll', progress_handleScroll, { passive: true });
  window.addEventListener('resize', progress_handleResize, { passive: true });

  // Initial progress update
  progress_updateProgress();

  console.log('[ReadingProgress] Enabled');
  showToast('Reading Progress Bar enabled');
}

/**
 * Disables the reading progress bar feature.
 *
 * - Removes progress bar elements from DOM
 * - Removes injected styles
 * - Detaches scroll and resize listeners
 * - Shows toast notification
 *
 * @function progress_disable
 * @returns {void}
 *
 * @example
 * progress_disable();
 * // Reading progress bar is now hidden and inactive
 */
function progress_disable() {
  progress_enabled = false;

  // Remove elements
  if (progress_barElement) {
    progress_barElement.remove();
    progress_barElement = null;
  }

  if (progress_percentElement) {
    progress_percentElement.remove();
    progress_percentElement = null;
  }

  // Remove styles
  if (progress_styleElement) {
    progress_styleElement.remove();
    progress_styleElement = null;
  }

  // Remove event listeners
  window.removeEventListener('scroll', progress_handleScroll);
  window.removeEventListener('resize', progress_handleResize);

  console.log('[ReadingProgress] Disabled');
  showToast('Reading Progress Bar disabled');
}

/**
 * Updates the progress bar position (top or bottom).
 *
 * Re-injects styles with the new position setting.
 *
 * @function progress_setPosition
 * @param {string} position - New position: 'top' or 'bottom'
 * @returns {void}
 *
 * @example
 * progress_setPosition('bottom');
 * // Progress bar now appears at bottom of viewport
 */
function progress_setPosition(position) {
  if (position !== 'top' && position !== 'bottom') {
    console.warn('[ReadingProgress] Invalid position:', position);
    return;
  }

  progress_settings.position = position;

  if (progress_enabled) {
    progress_injectStyles();
  }

  console.log('[ReadingProgress] Position updated to:', position);
}

/**
 * Updates the progress bar color.
 *
 * Re-injects styles with the new color setting.
 *
 * @function progress_setColor
 * @param {string} color - New color (CSS color value)
 * @returns {void}
 *
 * @example
 * progress_setColor('#FF5722');
 * // Progress bar now displays in orange
 */
function progress_setColor(color) {
  progress_settings.color = color;

  if (progress_enabled) {
    progress_injectStyles();
  }

  console.log('[ReadingProgress] Color updated to:', color);
}

/**
 * Updates the progress bar style settings.
 *
 * Applies multiple style changes at once and re-injects CSS.
 *
 * @function progress_updateStyle
 * @returns {void}
 *
 * @private
 */
function progress_updateStyle() {
  if (progress_enabled) {
    progress_injectStyles();
    progress_updateProgress();
  }
}

// ============================================================
// EVENT HANDLERS
// ============================================================

/**
 * Handles scroll events with throttling for performance.
 *
 * Throttles scroll event processing to ~60fps (16ms) to avoid
 * excessive DOM updates and maintain smooth performance.
 *
 * @function progress_handleScroll
 * @returns {void}
 *
 * @private
 */
function progress_handleScroll() {
  if (!progress_enabled) {
    return;
  }

  const now = Date.now();

  // Throttle to avoid excessive updates
  if (now - progress_lastScrollTime < SCROLL_THROTTLE_MS) {
    return;
  }

  progress_lastScrollTime = now;
  progress_updateProgress();
}

/**
 * Handles window resize events.
 *
 * Recalculates scroll percentage when viewport size changes,
 * as this affects the total scrollable height.
 *
 * @function progress_handleResize
 * @returns {void}
 *
 * @private
 */
function progress_handleResize() {
  if (progress_enabled) {
    progress_updateProgress();
  }
}

// ============================================================
// INITIALIZATION & STORAGE LISTENERS
// ============================================================

/**
 * Default settings for reading progress bar
 * @type {Object}
 * @constant
 */
const DEFAULT_SETTINGS = {
  enabled: false,
  position: 'top',
  height: 4,
  color: '#4CAF50',
  backgroundColor: 'rgba(0,0,0,0.1)',
  showPercentage: false,
  smoothScroll: true,
  hideOnComplete: false,
};

/**
 * Applies settings from storage to the module state.
 *
 * Handles enable/disable toggling and setting updates.
 * Called on initial load and whenever settings change.
 *
 * @function applySettings
 * @param {Object} settings - Settings object from storage
 * @param {boolean} isInit - Whether this is initial load (true) or change (false)
 * @returns {void}
 *
 * @private
 */
function applySettings(settings, isInit = false) {
  const wasEnabled = progress_enabled;
  const newEnabled = settings.enabled || false;

  // Update settings
  progress_settings.position = settings.position || DEFAULT_SETTINGS.position;
  progress_settings.height = settings.height || DEFAULT_SETTINGS.height;
  progress_settings.color = settings.color || DEFAULT_SETTINGS.color;
  progress_settings.backgroundColor = settings.backgroundColor || DEFAULT_SETTINGS.backgroundColor;
  progress_settings.showPercentage =
    settings.showPercentage !== undefined
      ? settings.showPercentage
      : DEFAULT_SETTINGS.showPercentage;
  progress_settings.smoothScroll =
    settings.smoothScroll !== undefined ? settings.smoothScroll : DEFAULT_SETTINGS.smoothScroll;
  progress_settings.hideOnComplete =
    settings.hideOnComplete !== undefined
      ? settings.hideOnComplete
      : DEFAULT_SETTINGS.hideOnComplete;

  // Handle enable/disable
  if (newEnabled && !wasEnabled) {
    progress_enable();
  } else if (!newEnabled && wasEnabled) {
    progress_disable();
  } else if (newEnabled && !isInit) {
    // Update style if already enabled (but not on init, as enable() handles it)
    progress_updateStyle();
  }

  console.log(
    `[ReadingProgress] Settings ${isInit ? 'loaded' : 'updated'}:`,
    newEnabled,
    progress_settings
  );
}

/**
 * Initialize reading progress bar using centralized storage utility.
 * Uses initFeatureSettings for consistent storage access pattern.
 */
initFeatureSettings(
  'readingProgress',
  DEFAULT_SETTINGS,
  settings => applySettings(settings, true),
  settings => applySettings(settings, false)
);

// ============================================================
// EXPORTS
// ============================================================

/**
 * Returns the current settings object
 * @function progress_getSettings
 * @returns {Object} Current settings
 */
function progress_getSettings() {
  return { ...progress_settings };
}

/**
 * Public API for the Reading Progress Bar feature module
 */
export {
  progress_enable,
  progress_disable,
  progress_setPosition,
  progress_setColor,
  progress_getSettings,
};
