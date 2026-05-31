/**
 * Focus Mode Feature Module
 *
 * Provides a darkened overlay with a clear window to help students focus on specific text.
 * The window follows the user's mouse position, creating a magnifying glass effect that
 * helps reduce visual distractions for students with ADHD, dyslexia, and other
 * neurodivergent conditions.
 *
 * @module focusMode
 * @version 1.1.0
 * @requires ../../core/ui/toast.js
 *
 * Features:
 * - Box-shadow overlay darkens everything except the focus window
 * - Smooth mouse tracking with 0.05s transition
 * - Configurable window size and overlay opacity
 * - Mutual exclusivity with Reading Guide feature
 * - Persistent settings via Chrome storage
 *
 * @example
 * // Enable focus mode when user clicks the focus mode button
 * focusMode_enable();
 *
 * // Update settings programmatically
 * chrome.storage.local.set({
 *   assist_settings: {
 *     focusMode: {
 *       enabled: true,
 *       boxWidth: 500,
 *       boxHeight: 150,
 *       overlayOpacity: 0.8
 *     }
 *   }
 * });
 */

import { showToast } from '../../core/ui/toast.js';
import { readingGuide_disable, readingGuide_getEnabled } from '../readingGuide/readingGuide.js';
import { initFeatureSettings } from '../../content/utils/storage-utils.js';

/**
 * Whether focus mode is currently enabled
 * @type {boolean}
 * @private
 */
let focusMode_enabled = false;

/**
 * Reference to the focus mode window element (the clear box with box-shadow)
 * @type {HTMLElement|null}
 * @private
 */
let focusMode_windowElement = null;

/**
 * Focus Mode configuration settings
 * @type {Object}
 * @property {number} boxWidth - Width of the focus window in pixels (default: 400)
 * @property {number} boxHeight - Height of the focus window in pixels (default: 100)
 * @property {number} overlayOpacity - Opacity of the darkened overlay (0.0 to 1.0, default: 0.7)
 * @private
 */
const focusMode_settings = {
  boxWidth: 400,
  boxHeight: 100,
  overlayOpacity: 0.7,
};

/**
 * Creates the focus mode window element with box-shadow overlay.
 *
 * Creates a fixed-position div that uses a large box-shadow to darken everything
 * on the page except the area covered by the element itself. The element is
 * positioned with pointer-events: none so it doesn't interfere with user interactions.
 *
 * The border-radius is calculated as 20% of the smaller dimension (width or height)
 * to create smooth, rounded corners.
 *
 * @function focusMode_createWindow
 * @returns {void}
 *
 * @example
 * focusMode_createWindow();
 * // Creates the window element and appends it to document.body
 */
function focusMode_createWindow() {
  // Guard: prevent creating multiple window elements
  if (focusMode_windowElement) {
    return;
  }

  // Create the focus window element
  focusMode_windowElement = document.createElement('div');
  focusMode_windowElement.id = 'assist-focus-mode-window';

  // Calculate border-radius as 20% of the smaller dimension
  const radiusPercent = 0.2;
  const radius =
    Math.min(focusMode_settings.boxWidth, focusMode_settings.boxHeight) * radiusPercent;

  // Set all styles using cssText for performance
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

  // Append to body to activate
  document.body.appendChild(focusMode_windowElement);
  console.log('[FocusMode] Window element created with box-shadow overlay');
}

/**
 * Updates the position of the focus mode window based on mouse coordinates.
 *
 * Centers the window on the current mouse position, adjusting for the window's
 * width and height. Called on every mousemove event when focus mode is enabled.
 *
 * @function focusMode_updatePosition
 * @param {number} mouseX - The X coordinate (in pixels) of the mouse position
 * @param {number} mouseY - The Y coordinate (in pixels) of the mouse position
 * @returns {void}
 *
 * @example
 * // Called from mousemove event handler
 * focusMode_updatePosition(event.clientX, event.clientY);
 */
function focusMode_updatePosition(mouseX, mouseY) {
  // Guard: only update if element exists and feature is enabled
  if (!focusMode_windowElement || !focusMode_enabled) {
    return;
  }

  // Calculate center offset (position so window is centered on mouse)
  const halfWidth = focusMode_settings.boxWidth / 2;
  const halfHeight = focusMode_settings.boxHeight / 2;

  // Calculate top-left corner to center window on mouse
  const left = mouseX - halfWidth;
  const top = mouseY - halfHeight;

  // Update element position
  focusMode_windowElement.style.left = left + 'px';
  focusMode_windowElement.style.top = top + 'px';
}

/**
 * Updates the visual styling of the focus mode window.
 *
 * Applies current settings (boxWidth, boxHeight, overlayOpacity) to the window element.
 * Called when settings are changed while focus mode is active.
 *
 * @function focusMode_updateStyle
 * @returns {void}
 *
 * @example
 * // Update window size and opacity
 * focusMode_settings.boxWidth = 600;
 * focusMode_settings.overlayOpacity = 0.8;
 * focusMode_updateStyle();
 */
function focusMode_updateStyle() {
  // Guard: only update if element exists
  if (!focusMode_windowElement) {
    return;
  }

  // Calculate border-radius as 20% of the smaller dimension
  const radiusPercent = 0.2;
  const radius =
    Math.min(focusMode_settings.boxWidth, focusMode_settings.boxHeight) * radiusPercent;

  // Update all style properties
  focusMode_windowElement.style.width = focusMode_settings.boxWidth + 'px';
  focusMode_windowElement.style.height = focusMode_settings.boxHeight + 'px';
  focusMode_windowElement.style.borderRadius = radius + 'px';
  focusMode_windowElement.style.boxShadow = `0 0 0 9999px rgba(0, 0, 0, ${focusMode_settings.overlayOpacity})`;
}

/**
 * Enables the focus mode feature.
 *
 * - Creates the window element if it doesn't exist
 * - Displays the window
 * - Attaches the mousemove listener for position tracking
 * - Handles mutual exclusivity with Reading Guide (disables it if active)
 * - Shows a toast notification to the user
 *
 * @function focusMode_enable
 * @returns {void}
 *
 * @example
 * focusMode_enable();
 * // Focus mode is now active and tracks mouse position
 */
function focusMode_enable() {
  // Check mutual exclusivity with Reading Guide
  if (readingGuide_getEnabled()) {
    readingGuide_disable();
    showToast('📏 Reading Guide disabled (Focus Mode active)');
  }

  // Enable the feature
  focusMode_enabled = true;
  focusMode_createWindow();

  // Display the window
  if (focusMode_windowElement) {
    focusMode_windowElement.style.display = 'block';
  }

  // Add mousemove listener for tracking
  document.addEventListener('mousemove', focusMode_handleMouseMove);

  console.log('[FocusMode] Enabled');
  showToast('🎯 Focus Mode enabled');
}

/**
 * Disables the focus mode feature.
 *
 * - Hides the window
 * - Removes the mousemove event listener
 * - Shows a toast notification to the user
 *
 * @function focusMode_disable
 * @returns {void}
 *
 * @example
 * focusMode_disable();
 * // Focus mode is now inactive
 */
function focusMode_disable() {
  // Disable the feature
  focusMode_enabled = false;

  // Hide the window
  if (focusMode_windowElement) {
    focusMode_windowElement.style.display = 'none';
  }

  // Remove mousemove listener
  document.removeEventListener('mousemove', focusMode_handleMouseMove);

  console.log('[FocusMode] Disabled');
  showToast('Focus Mode disabled');
}

/**
 * Handles mousemove events to update the focus window position.
 *
 * Bound to the document's mousemove event when focus mode is enabled.
 * Updates the window position to follow the mouse in real-time.
 *
 * @function focusMode_handleMouseMove
 * @param {MouseEvent} event - The mousemove event object
 * @returns {void}
 *
 * @private
 */
function focusMode_handleMouseMove(event) {
  if (focusMode_enabled) {
    focusMode_updatePosition(event.clientX, event.clientY);
  }
}

/** @type {Object} Default settings for focus mode */
const DEFAULT_SETTINGS = {
  enabled: false,
  boxWidth: 400,
  boxHeight: 100,
  overlayOpacity: 0.7,
};

/**
 * Applies settings from storage to the module state
 * @param {Object} settings - Settings object from storage
 * @param {boolean} isInit - Whether this is initial load (true) or change (false)
 */
function applySettings(settings, isInit = false) {
  const wasEnabled = focusMode_enabled;
  const newEnabled = settings.enabled || false;

  // Update settings
  focusMode_settings.boxWidth = settings.boxWidth || DEFAULT_SETTINGS.boxWidth;
  focusMode_settings.boxHeight = settings.boxHeight || DEFAULT_SETTINGS.boxHeight;
  focusMode_settings.overlayOpacity = settings.overlayOpacity || DEFAULT_SETTINGS.overlayOpacity;

  // Handle enable/disable
  if (newEnabled && !wasEnabled) {
    focusMode_enable();
  } else if (!newEnabled && wasEnabled) {
    focusMode_disable();
  } else if (newEnabled && !isInit) {
    // Update style if already enabled (but not on init, as enable() handles it)
    focusMode_updateStyle();
  }

  console.log(
    `[FocusMode] Settings ${isInit ? 'loaded' : 'updated'}:`,
    newEnabled,
    focusMode_settings
  );
}

/**
 * Initialize focus mode using centralized storage utility.
 * Uses initFeatureSettings for consistent storage access pattern.
 */
initFeatureSettings(
  'focusMode',
  DEFAULT_SETTINGS,
  settings => applySettings(settings, true),
  settings => applySettings(settings, false)
);

/**
 * Returns whether Focus Mode is currently enabled
 * @returns {boolean} True if enabled, false otherwise
 */
function focusMode_getEnabled() {
  return focusMode_enabled;
}

/**
 * Public API for the Focus Mode feature module
 */
export {
  focusMode_enable,
  focusMode_disable,
  focusMode_createWindow,
  focusMode_updatePosition,
  focusMode_updateStyle,
  focusMode_handleMouseMove,
  focusMode_getEnabled,
};
