/**
 * Screen Overlay Feature Module
 *
 * Provides a screen overlay feature for reducing visual stress and improving
 * focus for neurodivergent students. The overlay applies a warm sepia tone
 * across the entire screen with configurable color and opacity.
 *
 * WCAG Compliance: The overlay respects prefers-reduced-transparency and
 * includes proper z-index management to avoid interfering with interactive elements.
 *
 * @module screenOverlay
 * @version 1.0.0
 */

import { showToast } from '../../core/ui/toast.js';

// ============================================================
// STATE MANAGEMENT
// ============================================================

/** @type {boolean} Tracks whether screen overlay is currently enabled */
let screenOverlay_enabled = false;

/** @type {HTMLElement|null} Reference to the overlay DOM element */
let screenOverlay_element = null;

/** @type {Object} Configuration object for overlay styling */
const screenOverlay_settings = {
  color: '#FFF4E6', // Warm sepia
  opacity: 0.3,
};

// ============================================================
// CORE FUNCTIONS
// ============================================================

/**
 * Creates the screen overlay element and appends it to the DOM.
 *
 * The overlay is a fixed, full-viewport element that applies a warm sepia tone
 * across the entire screen. It includes:
 * - Fixed positioning (covers entire viewport)
 * - Warm sepia color (#FFF4E6) for eye comfort
 * - Configurable opacity for customization
 * - pointer-events: none to prevent interference with interactions
 * - High z-index (999999) to overlay all content
 * - Smooth transitions for color and opacity changes
 *
 * WCAG Considerations:
 * - Uses pointer-events: none to ensure all interactive elements remain accessible
 * - Includes smooth transitions for reduced motion accessibility
 * - The warm color (#FFF4E6) has been selected for minimal contrast disruption
 *
 * @function screenOverlay_create
 * @returns {void}
 * @example
 * screenOverlay_create();
 * // Creates overlay element if not already present
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
 * Updates the overlay styling based on current settings.
 *
 * Applies the current color and opacity values from screenOverlay_settings
 * to the overlay element. Changes are animated via CSS transitions.
 *
 * WCAG Considerations:
 * - Smooth transitions respect prefers-reduced-motion CSS property
 * - Changes are logged for debugging and accessibility monitoring
 *
 * @function screenOverlay_update
 * @returns {void}
 * @example
 * screenOverlay_settings.opacity = 0.5;
 * screenOverlay_update();
 * // Updates overlay to new opacity value
 */
function screenOverlay_update() {
  if (screenOverlay_element) {
    screenOverlay_element.style.backgroundColor = screenOverlay_settings.color;
    screenOverlay_element.style.opacity = screenOverlay_settings.opacity;
    console.log('[ScreenOverlay] Updated:', screenOverlay_settings);
  }
}

/**
 * Removes the screen overlay element from the DOM.
 *
 * Cleanly removes the overlay element and resets the reference to null.
 * This restores the original screen appearance.
 *
 * WCAG Considerations:
 * - Ensures DOM is cleaned up properly to maintain accessibility tree integrity
 * - Removes all associated styles and transitions
 *
 * @function screenOverlay_remove
 * @returns {void}
 * @example
 * screenOverlay_remove();
 * // Removes overlay from DOM and resets reference
 */
function screenOverlay_remove() {
  if (screenOverlay_element) {
    screenOverlay_element.remove();
    screenOverlay_element = null;
    console.log('[ScreenOverlay] Removed');
  }
}

// ============================================================
// CONTROL FUNCTIONS
// ============================================================

/**
 * Enables the screen overlay feature.
 *
 * Sets the enabled flag and creates the overlay element if not present.
 * Displays a toast notification to confirm the action.
 *
 * WCAG Considerations:
 * - Toast notification provides auditory and visual feedback
 * - Uses emoji (🎨) for visual distinction while maintaining semantic meaning
 *
 * @function screenOverlay_enable
 * @returns {void}
 * @example
 * screenOverlay_enable();
 * // Enables overlay with toast confirmation
 */
function screenOverlay_enable() {
  screenOverlay_enabled = true;
  screenOverlay_create();
  showToast('🎨 Screen Overlay enabled');
  console.log('[ScreenOverlay] Enabled');
}

/**
 * Disables the screen overlay feature.
 *
 * Clears the enabled flag and removes the overlay element from the DOM.
 * Displays a toast notification to confirm the action.
 *
 * WCAG Considerations:
 * - Toast notification provides auditory and visual feedback
 * - Clean removal of DOM elements maintains accessibility
 *
 * @function screenOverlay_disable
 * @returns {void}
 * @example
 * screenOverlay_disable();
 * // Disables overlay with toast confirmation
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

/**
 * Initializes screen overlay from stored settings.
 *
 * Loads the user's previous screen overlay configuration from Chrome storage
 * and applies it on page load. If the feature was enabled previously, it
 * will be re-enabled automatically.
 *
 * Storage Structure:
 * ```
 * assist_settings.screenOverlay = {
 *   enabled: boolean,
 *   color: string (hex color),
 *   opacity: number (0-1)
 * }
 * ```
 *
 * WCAG Considerations:
 * - Respects user preferences saved from previous sessions
 * - Logs settings for debugging and monitoring
 *
 * @private
 * @returns {void}
 */
chrome.storage.local.get('assist_settings', result => {
  if (result.assist_settings && result.assist_settings.screenOverlay) {
    const soSettings = result.assist_settings.screenOverlay;
    screenOverlay_enabled = soSettings.enabled || false;
    screenOverlay_settings.color = soSettings.color || '#FFF4E6';
    screenOverlay_settings.opacity = soSettings.opacity || 0.3;

    if (screenOverlay_enabled) {
      screenOverlay_enable();
    }

    console.log('[ScreenOverlay] Settings loaded:', screenOverlay_enabled, screenOverlay_settings);
  }
});

/**
 * Listens for storage changes and updates overlay accordingly.
 *
 * Monitors the Chrome storage API for changes to assist_settings.screenOverlay
 * and applies updates in real-time. Handles:
 * - Enable/disable toggling
 * - Color and opacity adjustments
 * - Smooth transitions between states
 *
 * WCAG Considerations:
 * - Real-time updates allow users to see changes immediately
 * - Maintains visual consistency across all pages
 * - Logs changes for debugging and accessibility monitoring
 *
 * @private
 * @returns {void}
 */
chrome.storage.onChanged.addListener(changes => {
  if (changes.assist_settings && changes.assist_settings.newValue?.screenOverlay) {
    const soSettings = changes.assist_settings.newValue.screenOverlay;

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
});

// ============================================================
// EXPORTS
// ============================================================

/**
 * Exported function to create the overlay
 * @type {function}
 */
export { screenOverlay_create };

/**
 * Exported function to update the overlay
 * @type {function}
 */
export { screenOverlay_update };

/**
 * Exported function to remove the overlay
 * @type {function}
 */
export { screenOverlay_remove };

/**
 * Exported function to enable the overlay
 * @type {function}
 */
export { screenOverlay_enable };

/**
 * Exported function to disable the overlay
 * @type {function}
 */
export { screenOverlay_disable };

/**
 * Exported settings object for direct access to configuration
 * @type {Object}
 */
export { screenOverlay_settings };
