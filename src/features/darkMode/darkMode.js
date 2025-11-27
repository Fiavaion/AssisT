/**
 * Dark Mode Feature Module
 *
 * Provides a true dark mode with multiple presets for users who prefer
 * dark interfaces or have light sensitivity. Unlike the screen overlay,
 * this feature inverts colors while preserving images and videos.
 *
 * Presets:
 * - AMOLED Black: True black background for OLED screens
 * - Dark Gray: Softer dark gray for reduced contrast
 * - Navy Blue: Dark blue tones for a calming effect
 * - Sepia Dark: Warm dark tones for reduced eye strain
 *
 * WCAG Compliance: Maintains sufficient contrast ratios
 *
 * @module darkMode
 * @version 1.0.0
 */

import { showToast } from '../../core/ui/toast.js';
import { initFeatureSettings } from '../../content/utils/storage-utils.js';

// ============================================================
// STATE MANAGEMENT
// ============================================================

/** @type {boolean} Tracks whether dark mode is currently enabled */
let darkMode_enabled = false;

/** @type {HTMLStyleElement|null} Reference to the injected style element */
let darkMode_styleElement = null;

/** @type {string} Current preset name */
let darkMode_currentPreset = 'dark-gray';

// ============================================================
// PRESETS
// ============================================================

/**
 * Dark mode preset configurations
 * Each preset defines CSS custom properties for theming
 */
const DARK_MODE_PRESETS = {
  'amoled-black': {
    name: 'AMOLED Black',
    description: 'True black for OLED screens',
    bgPrimary: '#000000',
    bgSecondary: '#121212',
    textPrimary: '#FFFFFF',
    textSecondary: '#B0B0B0',
    accent: '#BB86FC',
    border: '#333333',
  },
  'dark-gray': {
    name: 'Dark Gray',
    description: 'Softer dark for reduced contrast',
    bgPrimary: '#1E1E1E',
    bgSecondary: '#2D2D2D',
    textPrimary: '#E0E0E0',
    textSecondary: '#A0A0A0',
    accent: '#64B5F6',
    border: '#404040',
  },
  'navy-blue': {
    name: 'Navy Blue',
    description: 'Calming dark blue tones',
    bgPrimary: '#0D1B2A',
    bgSecondary: '#1B263B',
    textPrimary: '#E0E1DD',
    textSecondary: '#778DA9',
    accent: '#00B4D8',
    border: '#415A77',
  },
  'sepia-dark': {
    name: 'Sepia Dark',
    description: 'Warm tones for eye comfort',
    bgPrimary: '#1A1510',
    bgSecondary: '#2A2015',
    textPrimary: '#E8DCC8',
    textSecondary: '#B8A88C',
    accent: '#D4A574',
    border: '#4A3A25',
  },
};

// ============================================================
// CORE FUNCTIONS
// ============================================================

/**
 * Gets the CSS variables for a given preset
 *
 * @function darkMode_getPresetCSS
 * @param {string} presetKey - The preset key
 * @returns {string} CSS custom properties
 */
function darkMode_getPresetCSS(presetKey) {
  const preset = DARK_MODE_PRESETS[presetKey] || DARK_MODE_PRESETS['dark-gray'];

  return `
    :root {
      --assist-dark-bg-primary: ${preset.bgPrimary};
      --assist-dark-bg-secondary: ${preset.bgSecondary};
      --assist-dark-text-primary: ${preset.textPrimary};
      --assist-dark-text-secondary: ${preset.textSecondary};
      --assist-dark-accent: ${preset.accent};
      --assist-dark-border: ${preset.border};
    }
  `;
}

/**
 * Generates the dark mode CSS.
 *
 * Uses CSS filter inversion with hue rotation to create dark mode,
 * while preserving images, videos, and other media.
 *
 * @function darkMode_generateCSS
 * @param {string} presetKey - The preset to use
 * @returns {string} Complete dark mode CSS
 */
function darkMode_generateCSS(presetKey) {
  const preset = DARK_MODE_PRESETS[presetKey] || DARK_MODE_PRESETS['dark-gray'];

  return `
    /* Dark Mode - AssisT Extension */
    ${darkMode_getPresetCSS(presetKey)}

    /* Apply dark background to html and body */
    html,
    body {
      background-color: ${preset.bgPrimary} !important;
      color: ${preset.textPrimary} !important;
    }

    /* Generic element darkening */
    *:not(img):not(video):not(iframe):not(canvas):not(svg):not([class*="assist-"]) {
      background-color: inherit;
      border-color: ${preset.border} !important;
    }

    /* Text elements */
    p, span, div, li, td, th, label, a,
    h1, h2, h3, h4, h5, h6 {
      color: ${preset.textPrimary} !important;
    }

    /* Secondary text */
    .text-muted, .text-secondary, small, .caption,
    figcaption, cite, time {
      color: ${preset.textSecondary} !important;
    }

    /* Links */
    a:not([class*="btn"]) {
      color: ${preset.accent} !important;
    }

    /* Inputs and form elements */
    input, textarea, select, button {
      background-color: ${preset.bgSecondary} !important;
      color: ${preset.textPrimary} !important;
      border-color: ${preset.border} !important;
    }

    /* Tables */
    table, tr, td, th {
      background-color: ${preset.bgSecondary} !important;
      border-color: ${preset.border} !important;
    }

    /* Cards, panels, modals */
    .card, .panel, .modal, .modal-content,
    .dropdown-menu, .popover, .tooltip {
      background-color: ${preset.bgSecondary} !important;
      border-color: ${preset.border} !important;
    }

    /* Navigation */
    nav, header, footer, aside,
    .navbar, .sidebar, .menu {
      background-color: ${preset.bgSecondary} !important;
    }

    /* Code blocks */
    pre, code {
      background-color: ${preset.bgPrimary} !important;
      color: ${preset.textSecondary} !important;
    }

    /* Preserve media elements - don't invert */
    img, video, iframe, canvas, svg,
    [style*="background-image"],
    picture, figure img {
      /* Keep original colors */
    }

    /* Canvas LMS specific */
    .ic-app-header,
    .ic-app-header__main-navigation,
    #left-side,
    .navigation-tray {
      background-color: ${preset.bgSecondary} !important;
    }

    .user_content,
    .assignment-description,
    .quiz-instructions {
      background-color: ${preset.bgPrimary} !important;
      color: ${preset.textPrimary} !important;
    }

    /* Scrollbar styling */
    ::-webkit-scrollbar {
      background-color: ${preset.bgPrimary};
    }

    ::-webkit-scrollbar-thumb {
      background-color: ${preset.border};
      border-radius: 4px;
    }

    ::-webkit-scrollbar-thumb:hover {
      background-color: ${preset.textSecondary};
    }
  `;
}

/**
 * Applies dark mode CSS to the page.
 *
 * @function darkMode_apply
 * @param {string} presetKey - The preset to use
 * @returns {void}
 */
function darkMode_apply(presetKey = darkMode_currentPreset) {
  // Remove existing style if present
  if (darkMode_styleElement) {
    darkMode_styleElement.remove();
  }

  darkMode_currentPreset = presetKey;

  darkMode_styleElement = document.createElement('style');
  darkMode_styleElement.id = 'assist-dark-mode';
  darkMode_styleElement.textContent = darkMode_generateCSS(presetKey);
  document.head.appendChild(darkMode_styleElement);

  // Add class to html for potential CSS targeting
  document.documentElement.classList.add('assist-dark-mode-active');
  document.documentElement.setAttribute('data-assist-dark-preset', presetKey);

  console.log('[DarkMode] Applied preset:', presetKey);
}

/**
 * Removes dark mode CSS from the page.
 *
 * @function darkMode_remove
 * @returns {void}
 */
function darkMode_remove() {
  if (darkMode_styleElement) {
    darkMode_styleElement.remove();
    darkMode_styleElement = null;
  }

  document.documentElement.classList.remove('assist-dark-mode-active');
  document.documentElement.removeAttribute('data-assist-dark-preset');

  console.log('[DarkMode] Removed');
}

// ============================================================
// CONTROL FUNCTIONS
// ============================================================

/**
 * Enables dark mode with the specified preset.
 *
 * @function darkMode_enable
 * @param {string} presetKey - The preset to use
 * @returns {void}
 */
function darkMode_enable(presetKey = darkMode_currentPreset) {
  darkMode_enabled = true;
  darkMode_apply(presetKey);

  const preset = DARK_MODE_PRESETS[presetKey] || DARK_MODE_PRESETS['dark-gray'];
  showToast(`🌙 Dark Mode enabled - ${preset.name}`);
  console.log('[DarkMode] Enabled with preset:', presetKey);
}

/**
 * Disables dark mode.
 *
 * @function darkMode_disable
 * @returns {void}
 */
function darkMode_disable() {
  darkMode_enabled = false;
  darkMode_remove();
  showToast('Dark Mode disabled');
  console.log('[DarkMode] Disabled');
}

/**
 * Changes the dark mode preset.
 *
 * @function darkMode_setPreset
 * @param {string} presetKey - The new preset to use
 * @returns {void}
 */
function darkMode_setPreset(presetKey) {
  if (!DARK_MODE_PRESETS[presetKey]) {
    console.warn('[DarkMode] Unknown preset:', presetKey);
    return;
  }

  darkMode_currentPreset = presetKey;

  if (darkMode_enabled) {
    darkMode_apply(presetKey);
    const preset = DARK_MODE_PRESETS[presetKey];
    showToast(`🌙 Switched to ${preset.name}`);
  }

  console.log('[DarkMode] Preset changed to:', presetKey);
}

/**
 * Gets available presets.
 *
 * @function darkMode_getPresets
 * @returns {Object} Available presets
 */
function darkMode_getPresets() {
  return DARK_MODE_PRESETS;
}

// ============================================================
// STORAGE & PERSISTENCE
// ============================================================

/** @type {Object} Default settings for dark mode */
const DEFAULT_SETTINGS = {
  enabled: false,
  preset: 'dark-gray',
  respectSystemPreference: true,
};

/**
 * Checks if the user has system-level dark mode preference.
 *
 * @function darkMode_systemPreference
 * @returns {boolean} True if user prefers dark mode at OS level
 */
function darkMode_systemPreference() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Applies settings from storage to the module state
 * @param {Object} settings - Settings object from storage
 * @param {boolean} isInit - Whether this is initial load (true) or change (false)
 */
function applySettings(settings, isInit = false) {
  const wasEnabled = darkMode_enabled;

  // Update preset
  if (settings.preset && DARK_MODE_PRESETS[settings.preset]) {
    darkMode_currentPreset = settings.preset;
  }

  // Determine if dark mode should be enabled
  // CRITICAL: Only enable if user has explicitly enabled the feature.
  // respectSystemPreference controls whether to follow system dark/light AFTER
  // the user has enabled dark mode, not whether to auto-enable based on system.
  let shouldEnable = settings.enabled || false;

  // If enabled AND respectSystemPreference is true, follow system preference
  // This means: user enabled dark mode, but wants it to follow system light/dark
  if (settings.enabled && settings.respectSystemPreference) {
    shouldEnable = darkMode_systemPreference();
  }

  // Handle enable/disable
  if (shouldEnable && !wasEnabled) {
    darkMode_enable(darkMode_currentPreset);
  } else if (!shouldEnable && wasEnabled) {
    darkMode_disable();
  } else if (shouldEnable && wasEnabled) {
    // Update preset if already enabled
    darkMode_apply(darkMode_currentPreset);
  }

  console.log(
    `[DarkMode] Settings ${isInit ? 'loaded' : 'updated'}:`,
    shouldEnable,
    'preset:',
    darkMode_currentPreset
  );
}

/**
 * Initialize dark mode using centralized storage utility.
 * Uses initFeatureSettings for consistent storage access pattern.
 */
initFeatureSettings(
  'darkMode',
  DEFAULT_SETTINGS,
  settings => applySettings(settings, true),
  settings => applySettings(settings, false)
);

// ============================================================
// SYSTEM PREFERENCE LISTENER
// ============================================================

// Listen for changes to system color scheme preference
const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
darkModeMediaQuery.addEventListener('change', () => {
  // Re-apply settings when system preference changes
  chrome.storage.local.get('assist_settings', result => {
    const settings = result.assist_settings?.darkMode || DEFAULT_SETTINGS;
    if (settings.respectSystemPreference) {
      applySettings(settings, false);
    }
  });
});

// ============================================================
// EXPORTS
// ============================================================

export { darkMode_enable };
export { darkMode_disable };
export { darkMode_setPreset };
export { darkMode_getPresets };
export { darkMode_systemPreference };
export { DARK_MODE_PRESETS };
