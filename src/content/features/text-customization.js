/**
 * Text Customization Feature
 * WCAG 2.2 SC 1.4.12 Compliant - Customizable text spacing and fonts
 */

import { getSettings, onSettingsChange } from '../utils/storage-utils.js';
import { showToast } from '../utils/dom-utils.js';

// Text Customization State (Feature Isolated)
let textCustomization_enabled = false;
let textCustomization_styleElement = null;
const textCustomization_settings = {
  fontFamily: 'system',
  lineSpacing: 1.5,
  letterSpacing: 0.12,
  wordSpacing: 0.16,
  paragraphSpacing: 2.0,
};

// Font map for CSS generation - Extended accessibility font library
const textCustomization_fontMap = {
  system: 'inherit',
  lexend: '"Lexend", -apple-system, system-ui, sans-serif',
  'atkinson-hyperlegible': '"Atkinson Hyperlegible", Arial, sans-serif',
  opendyslexic: '"OpenDyslexic", Arial, sans-serif',
  andika: '"Andika", Arial, sans-serif',
  'comic-neue': '"Comic Neue", "Comic Sans MS", cursive',
  'comic-sans': '"Comic Sans MS", "Comic Sans", cursive',
  arial: 'Arial, Helvetica, sans-serif',
  verdana: 'Verdana, Geneva, sans-serif',
};

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

function textCustomization_loadAtkinsonHyperlegible() {
  if (!document.getElementById('assist-atkinson-font')) {
    const style = document.createElement('style');
    style.id = 'assist-atkinson-font';
    const base = chrome.runtime.getURL('src/assets/fonts/');
    style.textContent = `
      @font-face { font-family: 'Atkinson Hyperlegible'; font-style: italic; font-weight: 400; font-display: swap; src: url('${base}atkinson-italic-400-latin-ext.woff2') format('woff2'); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
      @font-face { font-family: 'Atkinson Hyperlegible'; font-style: italic; font-weight: 400; font-display: swap; src: url('${base}atkinson-italic-400-latin.woff2') format('woff2'); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
      @font-face { font-family: 'Atkinson Hyperlegible'; font-style: italic; font-weight: 700; font-display: swap; src: url('${base}atkinson-italic-700-latin-ext.woff2') format('woff2'); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
      @font-face { font-family: 'Atkinson Hyperlegible'; font-style: italic; font-weight: 700; font-display: swap; src: url('${base}atkinson-italic-700-latin.woff2') format('woff2'); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
      @font-face { font-family: 'Atkinson Hyperlegible'; font-style: normal; font-weight: 400; font-display: swap; src: url('${base}atkinson-normal-400-latin-ext.woff2') format('woff2'); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
      @font-face { font-family: 'Atkinson Hyperlegible'; font-style: normal; font-weight: 400; font-display: swap; src: url('${base}atkinson-normal-400-latin.woff2') format('woff2'); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
      @font-face { font-family: 'Atkinson Hyperlegible'; font-style: normal; font-weight: 700; font-display: swap; src: url('${base}atkinson-normal-700-latin-ext.woff2') format('woff2'); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
      @font-face { font-family: 'Atkinson Hyperlegible'; font-style: normal; font-weight: 700; font-display: swap; src: url('${base}atkinson-normal-700-latin.woff2') format('woff2'); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
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

function textCustomization_loadAndika() {
  if (!document.getElementById('assist-andika-font')) {
    const style = document.createElement('style');
    style.id = 'assist-andika-font';
    const base = chrome.runtime.getURL('src/assets/fonts/');
    style.textContent = `
      @font-face { font-family: 'Andika'; font-style: normal; font-weight: 400; font-display: swap; src: url('${base}andika-normal-400-latin.woff2') format('woff2'); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
      @font-face { font-family: 'Andika'; font-style: normal; font-weight: 400; font-display: swap; src: url('${base}andika-normal-400-latin-ext.woff2') format('woff2'); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
      @font-face { font-family: 'Andika'; font-style: normal; font-weight: 400; font-display: swap; src: url('${base}andika-normal-400-vietnamese.woff2') format('woff2'); unicode-range: U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB; }
      @font-face { font-family: 'Andika'; font-style: normal; font-weight: 700; font-display: swap; src: url('${base}andika-normal-700-latin.woff2') format('woff2'); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
      @font-face { font-family: 'Andika'; font-style: normal; font-weight: 700; font-display: swap; src: url('${base}andika-normal-700-latin-ext.woff2') format('woff2'); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
      @font-face { font-family: 'Andika'; font-style: italic; font-weight: 400; font-display: swap; src: url('${base}andika-italic-400-latin.woff2') format('woff2'); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
      @font-face { font-family: 'Andika'; font-style: italic; font-weight: 400; font-display: swap; src: url('${base}andika-italic-400-latin-ext.woff2') format('woff2'); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
      @font-face { font-family: 'Andika'; font-style: italic; font-weight: 700; font-display: swap; src: url('${base}andika-italic-700-latin.woff2') format('woff2'); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
      @font-face { font-family: 'Andika'; font-style: italic; font-weight: 700; font-display: swap; src: url('${base}andika-italic-700-latin-ext.woff2') format('woff2'); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
    `;
    document.head.appendChild(style);
  }
}

function textCustomization_loadComicNeue() {
  if (!document.getElementById('assist-comic-neue-font')) {
    const style = document.createElement('style');
    style.id = 'assist-comic-neue-font';
    const base = chrome.runtime.getURL('src/assets/fonts/');
    style.textContent = `
      @font-face { font-family: 'Comic Neue'; font-style: normal; font-weight: 300; font-display: swap; src: url('${base}comicneue-normal-300-latin.woff2') format('woff2'); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
      @font-face { font-family: 'Comic Neue'; font-style: normal; font-weight: 400; font-display: swap; src: url('${base}comicneue-normal-400-latin.woff2') format('woff2'); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
      @font-face { font-family: 'Comic Neue'; font-style: normal; font-weight: 700; font-display: swap; src: url('${base}comicneue-normal-700-latin.woff2') format('woff2'); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
      @font-face { font-family: 'Comic Neue'; font-style: italic; font-weight: 300; font-display: swap; src: url('${base}comicneue-italic-300-latin.woff2') format('woff2'); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
      @font-face { font-family: 'Comic Neue'; font-style: italic; font-weight: 400; font-display: swap; src: url('${base}comicneue-italic-400-latin.woff2') format('woff2'); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
      @font-face { font-family: 'Comic Neue'; font-style: italic; font-weight: 700; font-display: swap; src: url('${base}comicneue-italic-700-latin.woff2') format('woff2'); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
    `;
    document.head.appendChild(style);
  }
}

/**
 * Generate CSS for text customization
 */
function textCustomization_generateCSS() {
  const font = textCustomization_fontMap[textCustomization_settings.fontFamily] || 'inherit';

  // Load fonts if needed based on selection
  switch (textCustomization_settings.fontFamily) {
    case 'lexend':
      textCustomization_loadLexend();
      break;
    case 'atkinson-hyperlegible':
      textCustomization_loadAtkinsonHyperlegible();
      break;
    case 'opendyslexic':
      textCustomization_loadOpenDyslexic();
      break;
    case 'andika':
      textCustomization_loadAndika();
      break;
    case 'comic-neue':
      textCustomization_loadComicNeue();
      break;
    // System fonts (arial, verdana, comic-sans) don't need loading
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
  if (!newSettings.textCustomization) {
    return;
  }

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

  console.log(
    '[TextCustomization] Settings updated:',
    textCustomization_enabled,
    textCustomization_settings
  );
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

    console.log(
      '[TextCustomization] Settings loaded:',
      textCustomization_enabled,
      textCustomization_settings
    );
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
