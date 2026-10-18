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
 * Watcher and its batching timer for content the page adds after the first pass.
 * @type {MutationObserver|null}
 */
let textCustomization_observer = null;
let textCustomization_rescanTimer = null;

/** Subtrees the page has added since the last measuring pass. @type {Set<Element>} */
const textCustomization_pendingRoots = new Set();

/** How long to gather DOM additions before measuring them, in ms. */
const SPACING_RESCAN_DELAY = 300;

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

/**
 * Elements whose spacing belongs to the interface, not to the prose: a control's own
 * label, code whose alignment carries meaning, and the LMS chrome.
 * @type {string}
 */
const SPACING_EXCLUDE_PARTS = [
  'button',
  'input',
  'select',
  'textarea',
  '[role="button"]',
  '[role="navigation"]',
  'code',
  'pre',
  '.ic-app-header',
  '.ic-app-header *',
  '#header',
  '#header *',
];

/** @type {string} The same list as a selector, for `matches()`. */
const SPACING_EXCLUDE = SPACING_EXCLUDE_PARTS.join(', ');

/** @type {string} ...and as a chain of `:not()`, for the font rule's selector. */
const SPACING_EXCLUDE_NOT = SPACING_EXCLUDE_PARTS.map(part => `:not(${part})`).join('');

/**
 * The class each minimum is raised with. One class per property, so an element that is
 * already generous in one dimension and cramped in another gets only what it lacks.
 * @type {Readonly<Record<string, string>>}
 */
const SPACING_CLASS = Object.freeze({
  line: 'assist-spacing-line',
  letter: 'assist-spacing-letter',
  word: 'assist-spacing-word',
  paragraph: 'assist-spacing-paragraph',
});

/** Rounding slack, in px: a page at 24.4 px is not cramped and must not be rewritten. */
const SPACING_TOLERANCE = 0.5;

/** Elements currently carrying one of our spacing classes, so removal is exact. */
const textCustomization_boosted = new Set();

/**
 * A computed length in px, or null when the value carries no reading (`normal`, unset).
 * @param {string} [value] - Computed CSS length.
 * @returns {number|null} Pixels, or null.
 */
function textCustomization_px(value) {
  const px = parseFloat(value);
  return Number.isFinite(px) ? px : null;
}

/**
 * Which minimums this element falls short of.
 *
 * SC 1.4.12 is a floor, so the only question worth asking is whether the page is already
 * above it: forcing the value took Wikipedia's 26 px leading down to 24 px, which is the
 * success criterion being used to make a page harder to read. An unreadable value counts
 * as short — `line-height: normal` is about 1.2, and guessing high would leave the
 * cramped case unfixed.
 *
 * @param {CSSStyleDeclaration|Object} computed - Computed style, or the same properties.
 * @param {Object} settings - Multiples of the font size to reach.
 * @param {boolean} [isParagraph] - Whether the paragraph-spacing minimum applies too.
 * @returns {Array<string>} Class names to add; empty when the page is already generous.
 */
function textCustomization_spacingGaps(computed, settings, isParagraph = false) {
  const fontSize = textCustomization_px(computed.fontSize) || 16;
  const short = (value, multiple, unreadableIsShort) => {
    const px = textCustomization_px(value);
    if (px === null) {
      return unreadableIsShort;
    }
    return px < fontSize * multiple - SPACING_TOLERANCE;
  };

  const gaps = [];
  // `normal` line height is ~1.2 and always short; `normal` letter and word spacing are 0.
  if (short(computed.lineHeight, settings.lineSpacing, true)) {
    gaps.push(SPACING_CLASS.line);
  }
  if (short(computed.letterSpacing, settings.letterSpacing, true)) {
    gaps.push(SPACING_CLASS.letter);
  }
  if (short(computed.wordSpacing, settings.wordSpacing, true)) {
    gaps.push(SPACING_CLASS.word);
  }
  if (isParagraph && short(computed.marginBottom, settings.paragraphSpacing, true)) {
    gaps.push(SPACING_CLASS.paragraph);
  }
  return gaps;
}

/**
 * Whether this element renders text of its own, rather than only containing elements
 * that do. Spacing is inherited, so tagging the wrappers as well would measure and
 * rewrite thousands of elements for no visible change.
 *
 * @param {Element} element
 * @returns {boolean}
 */
function textCustomization_holdsText(element) {
  for (const node of element.childNodes) {
    if (node.nodeType === 3 && node.textContent.trim()) {
      return true;
    }
  }
  return false;
}

/**
 * Raise the spacing of every text-bearing element in a subtree that falls short.
 *
 * Measured in one pass before anything is written, so one element's boost cannot be read
 * back as another's starting point.
 *
 * @param {Element} [root] - Subtree to measure; the whole body by default.
 * @returns {void}
 */
function textCustomization_applySpacing(root = document.body) {
  const view = root?.ownerDocument?.defaultView;
  if (!root || !view || typeof view.getComputedStyle !== 'function') {
    return;
  }

  // `closest`, not `matches`: the span inside a button is part of the control too.
  const candidates = [root, ...root.querySelectorAll('*')].filter(
    element => !element.closest(SPACING_EXCLUDE) && textCustomization_holdsText(element)
  );

  const pending = candidates.map(element => ({
    element,
    gaps: textCustomization_spacingGaps(
      view.getComputedStyle(element),
      textCustomization_settings,
      element.tagName === 'P'
    ),
  }));

  pending.forEach(({ element, gaps }) => {
    if (!gaps.length) {
      return;
    }
    element.classList.add(...gaps);
    textCustomization_boosted.add(element);
  });
}

/**
 * Drop every class we added, and an emptied class attribute with it: a page element that
 * carried no class before must not be left with `class=""`.
 * @returns {void}
 */
function textCustomization_removeSpacing() {
  textCustomization_boosted.forEach(element => {
    element.classList.remove(...Object.values(SPACING_CLASS));
    if (element.getAttribute('class') === '') {
      element.removeAttribute('class');
    }
  });
  textCustomization_boosted.clear();
}

/**
 * Generates CSS rules for text customization based on current settings
 *
 * Only two kinds of rule: the chosen typeface, and one class per SC 1.4.12 minimum. The
 * minimums are classes rather than a `body *` override because whether a rule should
 * apply is a question about the page's own spacing, which only a measurement can answer.
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
  const chosenFont = textCustomization_settings.fontFamily;

  // Load fonts if needed
  if (chosenFont === 'lexend') {
    textCustomization_loadLexend();
  } else if (chosenFont === 'opendyslexic') {
    textCustomization_loadOpenDyslexic();
  }

  // 'system' means the page's own typeface. `font-family: inherit !important` is not that:
  // it flattens every element to its parent's font, which is how the serif headline of an
  // article came out in the body sans-serif.
  const font = textCustomization_fontMap[chosenFont];
  const fontRule =
    chosenFont === 'system' || !font || font === 'inherit'
      ? ''
      : `
    body *${SPACING_EXCLUDE_NOT} {
      font-family: ${font} !important;
    }
  `;

  return `
    /* Text Customization - WCAG 2.2 SC 1.4.12 minimums, raised never lowered */${fontRule}
    .${SPACING_CLASS.line} {
      line-height: ${textCustomization_settings.lineSpacing} !important;
    }

    .${SPACING_CLASS.letter} {
      letter-spacing: ${textCustomization_settings.letterSpacing}em !important;
    }

    .${SPACING_CLASS.word} {
      word-spacing: ${textCustomization_settings.wordSpacing}em !important;
    }

    .${SPACING_CLASS.paragraph} {
      margin-bottom: ${textCustomization_settings.paragraphSpacing}em !important;
    }
  `;
}

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

  // Drop the previous boosts before measuring, so a setting that moved down re-reads the
  // page's own spacing instead of the value we had raised it to.
  textCustomization_removeSpacing();
  textCustomization_applySpacing();
  textCustomization_watchForNewContent();

  console.log('[TextCustomization] Applied:', Object.keys(textCustomization_settings).join(', '));
}

/**
 * Raise the minimums on content the page adds after we have run — a Canvas module loading
 * its items, an article lazy-rendering a section. Batched, because a page that appends in
 * a loop would otherwise get a full measuring pass per node.
 * @returns {void}
 */
function textCustomization_watchForNewContent() {
  if (textCustomization_observer || typeof MutationObserver !== 'function' || !document.body) {
    return;
  }

  textCustomization_observer = new MutationObserver(records => {
    records.forEach(record => {
      record.addedNodes.forEach(node => {
        // New text under an element we already measured changes that element's answer,
        // so the element it landed in is the subtree to look at again.
        const root = node.nodeType === 1 ? node : record.target;
        if (root?.nodeType === 1) {
          textCustomization_pendingRoots.add(root);
        }
      });
    });

    if (!textCustomization_pendingRoots.size || textCustomization_rescanTimer) {
      return;
    }

    textCustomization_rescanTimer = setTimeout(() => {
      textCustomization_rescanTimer = null;
      const roots = Array.from(textCustomization_pendingRoots);
      textCustomization_pendingRoots.clear();
      if (!textCustomization_enabled) {
        return;
      }
      // Only what arrived: a full pass per mutation burst is a measurable cost on a page
      // that appends while the student reads.
      roots.filter(root => root.isConnected).forEach(root => textCustomization_applySpacing(root));
    }, SPACING_RESCAN_DELAY);
  });

  textCustomization_observer.observe(document.body, { childList: true, subtree: true });
}

/**
 * Removes text customization from the current page
 *
 * Takes back everything it put on the page: the rules, the boosts it measured, the
 * watcher, and the font faces it injected — a switched-off feature that leaves
 * `<style id="assist-lexend-font">` in the head has not been switched off.
 *
 * @returns {void}
 */
function textCustomization_remove() {
  if (textCustomization_observer) {
    textCustomization_observer.disconnect();
    textCustomization_observer = null;
  }
  if (textCustomization_rescanTimer) {
    clearTimeout(textCustomization_rescanTimer);
    textCustomization_rescanTimer = null;
  }
  textCustomization_pendingRoots.clear();

  textCustomization_removeSpacing();

  if (textCustomization_styleElement) {
    textCustomization_styleElement.remove();
    textCustomization_styleElement = null;
  }

  ['assist-lexend-font', 'assist-opendyslexic-font'].forEach(id => {
    document.getElementById(id)?.remove();
  });

  console.log('[TextCustomization] Removed');
}

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

  console.log(`[TextCustomization] Settings ${isInit ? 'loaded' : 'updated'}:`, newEnabled);
}

/**
 * The student's choice is a stored setting like any other: applied from assist_settings when a
 * page loads, and again whenever the popup changes it.
 */
initFeatureSettings(
  'textCustomization',
  DEFAULT_SETTINGS,
  settings => applySettings(settings, true),
  settings => applySettings(settings, false)
);

export {
  textCustomization_loadLexend,
  textCustomization_loadOpenDyslexic,
  textCustomization_generateCSS,
  textCustomization_apply,
  textCustomization_remove,
  textCustomization_spacingGaps,
  textCustomization_fontMap,
};
