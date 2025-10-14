/**
 * Text Customization Feature
 * WCAG 2.2 SC 1.4.12 Compliant - Customizable text spacing and fonts
 */

import { getSettings, onSettingsChange } from '../utils/storage-utils.js';
import { showToast } from '../utils/dom-utils.js';

// Text Customization State (Feature Isolated)
let textCustomization_enabled = false;
let textCustomization_styleElement = null;
let textCustomization_fontLinkElement = null;
const textCustomization_settings = {
  fontFamily: 'system',
  lineSpacing: 1.5,
  letterSpacing: 0.12,
  wordSpacing: 0.16,
  paragraphSpacing: 2.0,
};

// Font map for CSS generation
const textCustomization_fontMap = {
  system: 'inherit',
  lexend: '"Lexend", -apple-system, system-ui, sans-serif',
  opendyslexic: '"OpenDyslexic", Arial, sans-serif',
  'comic-sans': '"Comic Sans MS", "Comic Sans", cursive',
  arial: 'Arial, Helvetica, sans-serif',
};

/**
 * Load Lexend font from Google Fonts
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
 * Load OpenDyslexic font from CDN
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

/**
 * Generate CSS for text customization
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

/**
 * Apply text customization
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
 * Remove text customization
 */
function textCustomization_remove() {
  if (textCustomization_styleElement) {
    textCustomization_styleElement.remove();
    textCustomization_styleElement = null;
  }
  console.log('[TextCustomization] Removed');
}

/**
 * Handle settings changes
 */
function textCustomization_handleSettingsChange(newSettings) {
  if (!newSettings.textCustomization) return;

  const tcSettings = newSettings.textCustomization;
  const wasEnabled = textCustomization_enabled;
  textCustomization_enabled = tcSettings.enabled || false;
  textCustomization_settings.fontFamily = tcSettings.fontFamily || 'system';
  textCustomization_settings.lineSpacing = tcSettings.lineSpacing || 1.5;
  textCustomization_settings.letterSpacing = tcSettings.letterSpacing || 0.12;
  textCustomization_settings.wordSpacing = tcSettings.wordSpacing || 0.16;
  textCustomization_settings.paragraphSpacing = tcSettings.paragraphSpacing || 2.0;

  // Apply or remove based on enabled state
  if (textCustomization_enabled) {
    textCustomization_apply();
    if (!wasEnabled) {
      showToast('✨ Text Customization enabled');
    }
  } else {
    textCustomization_remove();
    if (wasEnabled) {
      showToast('Text Customization disabled');
    }
  }

  console.log('[TextCustomization] Settings updated:', textCustomization_enabled, textCustomization_settings);
}

/**
 * Initialize Text Customization feature
 */
export async function textCustomization_initialize() {
  console.log('[TextCustomization] Initializing...');

  // Load settings
  const allSettings = await getSettings();
  if (allSettings.textCustomization) {
    const tcSettings = allSettings.textCustomization;
    textCustomization_enabled = tcSettings.enabled || false;
    textCustomization_settings.fontFamily = tcSettings.fontFamily || 'system';
    textCustomization_settings.lineSpacing = tcSettings.lineSpacing || 1.5;
    textCustomization_settings.letterSpacing = tcSettings.letterSpacing || 0.12;
    textCustomization_settings.wordSpacing = tcSettings.wordSpacing || 0.16;
    textCustomization_settings.paragraphSpacing = tcSettings.paragraphSpacing || 2.0;

    if (textCustomization_enabled) {
      textCustomization_apply();
    }

    console.log('[TextCustomization] Settings loaded:', textCustomization_enabled, textCustomization_settings);
  }

  // Listen for settings changes
  onSettingsChange(textCustomization_handleSettingsChange);

  console.log('[TextCustomization] Initialized');
}

/**
 * Get Text Customization state for debugging
 */
export function textCustomization_getState() {
  return {
    enabled: textCustomization_enabled,
    settings: textCustomization_settings,
  };
}
