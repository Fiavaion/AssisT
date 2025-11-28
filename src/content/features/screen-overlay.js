/**
 * Screen Overlay Feature
 * Applies color tinting to reduce eye strain and improve readability
 * Uses CSS filters on the HTML element for better text legibility
 */

import { getSettings, onSettingsChange } from '../utils/storage-utils.js';
import { showToast } from '../utils/dom-utils.js';

// Screen Overlay State (Feature Isolated)
let screenOverlay_enabled = false;
let screenOverlay_styleElement = null;
const screenOverlay_settings = {
  color: '#FFF4E6', // Warm sepia
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

/**
 * Get CSS filter string based on color and intensity
 */
function screenOverlay_getFilter() {
  const baseFilter = COLOR_FILTERS[screenOverlay_settings.color] || COLOR_FILTERS['#FFF4E6'];
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
 * Apply CSS filter to the page
 */
function screenOverlay_apply() {
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
    #assist-screen-overlay-style,
    .assist-toast,
    .assist-popup,
    [id^="assist-"] {
      filter: none !important;
    }
  `;

  document.head.appendChild(screenOverlay_styleElement);
  console.log('[ScreenOverlay] Applied CSS filter:', filter);
}

/**
 * Remove screen overlay
 */
function screenOverlay_remove() {
  if (screenOverlay_styleElement) {
    screenOverlay_styleElement.remove();
    screenOverlay_styleElement = null;
    console.log('[ScreenOverlay] Removed');
  }
}

/**
 * Enable screen overlay
 */
function screenOverlay_enable() {
  screenOverlay_enabled = true;
  screenOverlay_apply();
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
  if (!newSettings.screenOverlay) {
    return;
  }

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
    screenOverlay_apply();
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
