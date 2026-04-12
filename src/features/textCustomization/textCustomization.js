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
 * Reference to the font link element for loading external fonts
 * @type {HTMLLinkElement|null}
 */
let textCustomization_fontLinkElement = null;

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

/**
 * Loads the Lexend font from Google Fonts CDN
 *
 * Injects a link element to load Lexend font with multiple weights.
 * Uses display=swap for optimal loading performance.
 *
 * @returns {void}
 */
function textCustomization_loadLexend() {
  if (!textCustomization_fontLinkElement) {
    textCustomization_fontLinkElement = document.createElement('link');
    textCustomization_fontLinkElement.rel = 'stylesheet';
    textCustomization_fontLinkElement.href =
      'https://fonts.googleapis.com/css2?family=Lexend:wght@300;400;500;600&display=swap';
    document.head.appendChild(textCustomization_fontLinkElement);
    console.log('[TextCustomization] Lexend font loaded from Google Fonts');
  }
}

/**
 * Loads the OpenDyslexic font from CDN
 *
 * Injects a style element with @font-face declarations for OpenDyslexic.
 * Loads both regular and bold weights from jsDelivr CDN.
 *
 * @returns {void}
 */
function textCustomization_loadOpenDyslexic() {
  if (!document.getElementById('assist-opendyslexic-font')) {
    const style = document.createElement('style');
    style.id = 'assist-opendyslexic-font';
    style.textContent = `
      @font-face {
        font-family: 'OpenDyslexic';
        src: url('https://cdn.jsdelivr.net/npm/open-dyslexic@1.0.3/ttf/OpenDyslexic-Regular.ttf') format('truetype');
        font-weight: normal;
        font-style: normal;
      }
      @font-face {
        font-family: 'OpenDyslexic';
        src: url('https://cdn.jsdelivr.net/npm/open-dyslexic@1.0.3/ttf/OpenDyslexic-Bold.ttf') format('truetype');
        font-weight: bold;
        font-style: normal;
      }
    `;
    document.head.appendChild(style);
    console.log('[TextCustomization] OpenDyslexic font loaded from CDN');
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
chrome.storage.local.get('textCustomization_local', result => {
  if (result.textCustomization_local) {
    // "This window only" override is set — use it directly
    applySettings({ ...DEFAULT_SETTINGS, ...result.textCustomization_local }, true);
    console.log('[TextCustomization] Loaded local-only override settings');
  } else {
    // Normal path: load from shared assist_settings
    initFeatureSettings(
      'textCustomization',
      DEFAULT_SETTINGS,
      settings => applySettings(settings, true),
      settings => applySettings(settings, false)
    );
  }
});

// Always listen for local override changes (written when toggle is OFF)
chrome.storage.onChanged.addListener(changes => {
  if (changes.textCustomization_local) {
    if (changes.textCustomization_local.newValue) {
      applySettings({ ...DEFAULT_SETTINGS, ...changes.textCustomization_local.newValue }, false);
    }
  }
});

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
