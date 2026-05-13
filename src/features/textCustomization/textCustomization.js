/**
 * @fileoverview Text Customization Feature Module
 * @module features/textCustomization
 * @version 1.1.0
 *
 * Provides text customization capabilities for improved readability and accessibility.
 * Implements WCAG 2.2 SC 1.4.12 (Text Spacing) compliance with customizable typography.
 *
 * Features:
 * - Font family selection (system, Lexend, OpenDyslexic, Comic Sans, Arial)
 * - Line spacing adjustment
 * - Letter spacing adjustment
 * - Word spacing adjustment
 * - Paragraph spacing adjustment
 *
 * @see {@link https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html|WCAG 2.2 SC 1.4.12}
 */

import { showToast } from '../../core/ui/toast.js';
import { initFeatureSettings } from '../../content/utils/storage-utils.js';

// ============================================================
// MODULE STATE
// ============================================================

/**
 * Flag indicating if text customization is currently enabled
 * @type {boolean}
 */
let textCustomization_enabled = false;

/**
 * Reference to the injected style element containing text customization CSS
 * @type {HTMLStyleElement|null}
 */
let textCustomization_styleElement = null;

/**
 * Current text customization settings
 * @type {Object}
 * @property {string} fontFamily - Selected font family
 * @property {number} lineSpacing - Line height multiplier
 * @property {number} letterSpacing - Letter spacing in em units
 * @property {number} wordSpacing - Word spacing in em units
 * @property {number} paragraphSpacing - Paragraph margin-bottom in em units
 */
const textCustomization_settings = {
  fontFamily: 'system',
  lineSpacing: 1.5,
  letterSpacing: 0.12,
  wordSpacing: 0.16,
  paragraphSpacing: 2.0,
};

/**
 * Mapping of font family identifiers to CSS font-family values
 * @type {Object<string, string>}
 */
const textCustomization_fontMap = {
  system: 'inherit',
  lexend: '"Lexend", -apple-system, system-ui, sans-serif',
  opendyslexic: '"OpenDyslexic", Arial, sans-serif',
  'comic-sans': '"Comic Sans MS", "Comic Sans", cursive',
  arial: 'Arial, Helvetica, sans-serif',
};

// ============================================================
// FONT LOADING FUNCTIONS
// ============================================================

function textCustomization_loadLexend() {
  if (!document.getElementById('assist-lexend-font')) {
    const style = document.createElement('style');
    style.id = 'assist-lexend-font';
    const base = chrome.runtime.getURL('src/assets/fonts/');
    style.textContent = `
      @font-face { font-family: 'Lexend'; font-style: normal; font-weight: 300 600; font-display: swap; src: url('${base}lexend-normal-300-vietnamese.woff2') format('woff2'); unicode-range: U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB; }
      @font-face { font-family: 'Lexend'; font-style: normal; font-weight: 300 600; font-display: swap; src: url('${base}lexend-normal-300-latin-ext.woff2') format('woff2'); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
      @font-face { font-family: 'Lexend'; font-style: normal; font-weight: 300 600; font-display: swap; src: url('${base}lexend-normal-300-latin.woff2') format('woff2'); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
    `;
    document.head.appendChild(style);
  }
}

function textCustomization_loadOpenDyslexic() {
  if (!document.getElementById('assist-opendyslexic-font')) {
    const style = document.createElement('style');
    style.id = 'assist-opendyslexic-font';
    const base = chrome.runtime.getURL('src/assets/fonts/');
    style.textContent = `
      @font-face { font-family: 'OpenDyslexic'; font-weight: normal; font-style: normal; font-display: swap; src: url('${base}opendyslexic-normal-400.ttf') format('truetype'); }
      @font-face { font-family: 'OpenDyslexic'; font-weight: bold; font-style: normal; font-display: swap; src: url('${base}opendyslexic-normal-700.ttf') format('truetype'); }
    `;
    document.head.appendChild(style);
  }
}

// ============================================================
// CSS GENERATION
// ============================================================

/**
 * Generates CSS rules for text customization based on current settings
 *
 * Creates CSS with high specificity and !important declarations to override
 * Canvas LMS default styles. Excludes UI elements (buttons, inputs, navigation)
 * to preserve the interface integrity.
 *
 * Implements WCAG 2.2 SC 1.4.12 compliant text spacing:
 * - Line height (line spacing) at least 1.5 times the font size
 * - Spacing following paragraphs at least 2 times the font size
 * - Letter spacing (tracking) at least 0.12 times the font size
 * - Word spacing at least 0.16 times the font size
 *
 * @returns {string} CSS stylesheet text
 */
function textCustomization_generateCSS() {
  const font = textCustomization_fontMap[textCustomization_settings.fontFamily] || 'inherit';

  // Load fonts if needed
  if (textCustomization_settings.fontFamily === 'lexend') {
    textCustomization_loadLexend();
  } else if (textCustomization_settings.fontFamily === 'opendyslexic') {
    textCustomization_loadOpenDyslexic();
  }

  // Generate CSS with high specificity and !important to override Canvas styles
  // Exclude Canvas UI elements (buttons, inputs, navigation, headers)
  return `
    /* Text Customization - WCAG 2.2 SC 1.4.12 Compliant */
    body *:not(button):not(input):not(select):not(textarea):not([role="button"]):not([role="navigation"]):not(code):not(pre):not(.ic-app-header):not(.ic-app-header *):not(#header):not(#header *) {
      font-family: ${font} !important;
      line-height: ${textCustomization_settings.lineSpacing} !important;
      letter-spacing: ${textCustomization_settings.letterSpacing}em !important;
      word-spacing: ${textCustomization_settings.wordSpacing}em !important;
    }

    /* Paragraph spacing */
    p:not(.ic-app-header p):not(#header p),
    div.user_content p,
    article p,
    section p {
      margin-bottom: ${textCustomization_settings.paragraphSpacing}em !important;
    }
  `;
}

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Applies text customization to the current page
 *
 * Removes any existing text customization styles and injects new CSS
 * based on current settings. Does nothing if text customization is disabled.
 *
 * @returns {void}
 */
function textCustomization_apply() {
  if (!textCustomization_enabled) {
    textCustomization_remove();
    return;
  }

  // Remove existing style element
  if (textCustomization_styleElement) {
    textCustomization_styleElement.remove();
  }

  // Create new style element
  textCustomization_styleElement = document.createElement('style');
  textCustomization_styleElement.id = 'assist-text-customization';
  textCustomization_styleElement.textContent = textCustomization_generateCSS();
  document.head.appendChild(textCustomization_styleElement);

  console.log('[TextCustomization] Applied:', textCustomization_settings);
}

/**
 * Removes text customization from the current page
 *
 * Cleans up the injected style element and resets the page to default styles.
 *
 * @returns {void}
 */
function textCustomization_remove() {
  if (textCustomization_styleElement) {
    textCustomization_styleElement.remove();
    textCustomization_styleElement = null;
  }
  console.log('[TextCustomization] Removed');
}

// ============================================================
// CHROME STORAGE INTEGRATION
// ============================================================

/** @type {Object} Default settings for text customization */
const DEFAULT_SETTINGS = {
  enabled: false,
  fontFamily: 'system',
  lineSpacing: 1.5,
  letterSpacing: 0.12,
  wordSpacing: 0.16,
  paragraphSpacing: 2.0,
};

/**
 * Applies settings from storage to the module state
 * @param {Object} settings - Settings object from storage
 * @param {boolean} isInit - Whether this is initial load (true) or change (false)
 */
function applySettings(settings, isInit = false) {
  const wasEnabled = textCustomization_enabled;
  const newEnabled = settings.enabled || false;

  // Update all settings
  textCustomization_enabled = newEnabled;
  textCustomization_settings.fontFamily = settings.fontFamily || DEFAULT_SETTINGS.fontFamily;
  textCustomization_settings.lineSpacing = settings.lineSpacing || DEFAULT_SETTINGS.lineSpacing;
  textCustomization_settings.letterSpacing =
    settings.letterSpacing || DEFAULT_SETTINGS.letterSpacing;
  textCustomization_settings.wordSpacing = settings.wordSpacing || DEFAULT_SETTINGS.wordSpacing;
  textCustomization_settings.paragraphSpacing =
    settings.paragraphSpacing || DEFAULT_SETTINGS.paragraphSpacing;

  // Apply or remove based on enabled state
  if (newEnabled) {
    textCustomization_apply();
    if (!wasEnabled && !isInit) {
      showToast('Text Customization enabled');
    }
  } else {
    textCustomization_remove();
    if (wasEnabled && !isInit) {
      showToast('Text Customization disabled');
    }
  }

  console.log(
    `[TextCustomization] Settings ${isInit ? 'loaded' : 'updated'}:`,
    newEnabled,
    textCustomization_settings
  );
}

/**
 * Initialize text customization using centralized storage utility.
 * Checks chrome.storage.local for a "this window only" override first,
 * then falls back to the shared assist_settings path.
 */
// Normal path: load from shared assist_settings
initFeatureSettings(
  'textCustomization',
  DEFAULT_SETTINGS,
  settings => applySettings(settings, true),
  settings => applySettings(settings, false)
);

// Expose applySettings so content-simple.js can call it for local-only applies
// (when the popup's "Apply to all windows" toggle is OFF)
window.assistFeatures = window.assistFeatures || {};
window.assistFeatures.textCustomization = {
  applySettings: settings => applySettings({ ...DEFAULT_SETTINGS, ...settings }, false),
  remove: () => textCustomization_remove(),
};

// ============================================================
// EXPORTS
// ============================================================

export {
  textCustomization_loadLexend,
  textCustomization_loadOpenDyslexic,
  textCustomization_generateCSS,
  textCustomization_apply,
  textCustomization_remove,
  textCustomization_fontMap,
};
