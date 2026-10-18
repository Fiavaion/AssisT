/**
 * Reading Mode Feature
 *
 * Distraction-free article reader using Mozilla's Readability algorithm
 *
 * Features:
 * - Content extraction using @mozilla/readability
 * - Full-page overlay with clean typography
 * - TTS preservation in reading mode
 * - Dyslexia mode compatibility
 * - Background color options (cream default)
 * - Font customization
 * - Keyboard shortcuts (Ctrl+Shift+R to toggle, ESC to exit)
 *
 * Architecture:
 * - Self-contained module following Feature Isolation Pattern (DEC-202510-010)
 * - All functions prefixed with 'readingMode_' to avoid naming conflicts
 * - Integrates with existing TTS and dyslexia features
 *
 * @module features/readingMode
 */

import { registerShortcut } from '../../utils/keyboard-shortcuts.js';
import { sanitizeHTML } from '../../utils/sanitize.js';
import { attachAccessibleHandler } from '../../utils/event-handlers.js';
import { Z } from '../../utils/z-index.js';
import { initFeatureSettings } from '../../content/utils/storage-utils.js';

let readingMode_isActive = false;
let readingMode_overlay = null;
let readingMode_originalContent = null;
/** @type {HTMLElement|null} Whatever had focus when reading mode opened; it gets it back on exit. */
let readingMode_opener = null;
/** @type {number|null} Pending initial-focus timer, cancelled if the overlay closes first. */
let readingMode_focusTimer = null;
/** @type {Promise<void>} The open or toggle in progress; the next one waits for it. */
let readingMode_queue = Promise.resolve();
/** @type {string|null} The root element's inline overflow before the page was locked, or null. */
let readingMode_pageOverflow = null;
/** @type {Array<{element: HTMLElement, ariaHidden: string|null, inert: boolean}>} Page content hidden while the overlay is up. */
let readingMode_hiddenSiblings = [];
/** @type {(() => void)|null} Stops listening for setting changes. */
let readingMode_unsubscribe = null;
const readingMode_settings = {
  enabled: true,
  backgroundColor: '#FBF8F3', // Cream
  fontFamily: 'Arial, Helvetica, sans-serif', // Standard font for better OCR accuracy
  fontSize: '18px',
  lineHeight: '1.6',
  maxWidth: '800px',
};

/**
 * Extracts article content using @mozilla/readability
 *
 * @returns {Object|null} Article object with title, content, byline, etc.
 */
async function readingMode_extractContent() {
  try {
    console.log('[ReadingMode] Extracting content with @mozilla/readability...');

    // Dynamic import of @mozilla/readability
    const { Readability } = await import('@mozilla/readability');

    // Clone document for readability (it mutates the DOM)
    const documentClone = document.cloneNode(true);

    // Create readability instance
    const reader = new Readability(documentClone);

    // Parse article
    const article = reader.parse();

    if (!article) {
      console.warn('[ReadingMode] Failed to extract content');
      return null;
    }

    console.log('[ReadingMode] Content extracted,', article.textContent?.length ?? 0, 'characters');
    return article;
  } catch (error) {
    console.error('[ReadingMode] Content extraction failed:', error);
    return null;
  }
}

/** Marks the scroll box a wide table, code block or formula is put inside. */
const READING_MODE_SCROLL_CLASS = 'assist-reading-mode-scroll';

/**
 * Things an article routinely brings out of a page wider than the column it is read in: a table of
 * results, a code sample, a MathJax or KaTeX formula. Each one keeps its own size and scrolls inside
 * its own box, because squeezing a table or wrapping code makes it unreadable.
 */
const READING_MODE_SCROLLABLE = 'table, pre, math, .katex-display, .MathJax_Display, mjx-container';

/**
 * The reflow rules for everything the article brought with it (WCAG 2.2 SC 1.4.10).
 *
 * The overlay's own column has a max width, but nothing constrained a single wide DESCENDANT, and a
 * browser wave on real sites found the usual suspect: a link wrapping an image at its natural size.
 * One of those puts a horizontal scrollbar across the whole reading view, and at 320px wide a
 * student is then dragging the page sideways to read a sentence.
 *
 * Nothing here hides content. Media is scaled down to the column, long unbroken strings - a URL, a
 * chemical name, a hash - are allowed to break, and the things that must not be squeezed get a
 * scroll box of their own, keyboard-reachable so a student who cannot drag can still scroll it.
 */
const READING_MODE_REFLOW_CSS = `
  #assist-reading-mode-content {
    box-sizing: border-box;
    /* A long unbroken string is what is left after the media is tamed; let it break rather than
       push the column wider than the window. */
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  #assist-reading-mode-content * {
    box-sizing: border-box;
  }
  #assist-reading-mode-content img,
  #assist-reading-mode-content svg,
  #assist-reading-mode-content video,
  #assist-reading-mode-content canvas,
  #assist-reading-mode-content iframe,
  #assist-reading-mode-content embed,
  #assist-reading-mode-content object,
  #assist-reading-mode-content figure,
  #assist-reading-mode-content blockquote,
  #assist-reading-mode-content .${READING_MODE_SCROLL_CLASS} {
    max-width: 100%;
  }
  #assist-reading-mode-content img,
  #assist-reading-mode-content svg,
  #assist-reading-mode-content video,
  #assist-reading-mode-content canvas {
    height: auto;
  }
  #assist-reading-mode-content figure,
  #assist-reading-mode-content blockquote {
    margin-left: 0;
    margin-right: 0;
  }
  #assist-reading-mode-content .${READING_MODE_SCROLL_CLASS} {
    overflow-x: auto;
    /* A scroll box the keyboard can reach and a screen reader can find, per the scrollable-region
       pattern; without the tab stop this is a region only a mouse can read. */
    -webkit-overflow-scrolling: touch;
  }
  #assist-reading-mode-content pre {
    /* Wrap where it can, and let the box scroll for the lines that cannot wrap. */
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
`;

/**
 * Puts each thing that must keep its own width inside a scroll box of its own.
 *
 * Done in the DOM rather than in CSS on purpose: `display: block` on a `<table>` would make the
 * reflow work and take the table's semantics away from a screen reader with it.
 *
 * @param {HTMLElement} container - The rendered article body.
 * @returns {void}
 */
function readingMode_wrapWideBlocks(container) {
  for (const element of Array.from(container.querySelectorAll(READING_MODE_SCROLLABLE))) {
    if (element.parentElement?.classList.contains(READING_MODE_SCROLL_CLASS)) {
      continue;
    }
    const scroller = document.createElement('div');
    scroller.className = READING_MODE_SCROLL_CLASS;
    scroller.setAttribute('role', 'region');
    scroller.setAttribute('tabindex', '0');
    scroller.setAttribute(
      'aria-label',
      element.tagName === 'TABLE' ? 'Table, scrollable' : 'Scrollable content'
    );
    element.parentElement.insertBefore(scroller, element);
    scroller.appendChild(element);
  }
}

/**
 * Creates the reading mode overlay
 *
 * @param {Object} article - Readability article object
 * @returns {HTMLElement} Overlay element
 */
function readingMode_createOverlay(article) {
  // Create overlay container
  const overlay = document.createElement('div');
  overlay.id = 'assist-reading-mode-overlay';
  // The overlay covers the whole page and is named and focusable, so focus can be moved to the top
  // of the article (WCAG 2.2 SC 2.4.3).
  //
  // Deliberately NOT `aria-modal="true"`. AssisT's own page tools stay reachable behind the overlay
  // - a student reading an article still needs to start and stop the voice - and `aria-modal` is a
  // promise to assistive technology that nothing outside the dialog exists, which would put the TTS
  // bar out of reach of exactly the students who read through it. The page's own content is taken
  // out of the accessibility tree and made inert instead, so nothing else is reachable either way.
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('tabindex', '-1');
  if (article.title) {
    overlay.setAttribute('aria-labelledby', 'assist-reading-mode-title');
  } else {
    overlay.setAttribute('aria-label', 'Reading Mode');
  }
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    background: ${readingMode_settings.backgroundColor};
    z-index: ${Z.OVERLAY};
    overflow-y: auto;
    padding: 40px 20px;
  `;

  // Create content container
  const content = document.createElement('article');
  content.id = 'assist-reading-mode-content';
  content.style.cssText = `
    max-width: ${readingMode_settings.maxWidth};
    width: 100%;
    margin: 0 auto;
    font-family: ${readingMode_settings.fontFamily};
    font-size: ${readingMode_settings.fontSize};
    line-height: ${readingMode_settings.lineHeight};
    color: #333;
  `;

  // Add title
  if (article.title) {
    const title = document.createElement('h1');
    title.id = 'assist-reading-mode-title';
    title.textContent = article.title;
    title.style.cssText = `
      font-size: 2.5em;
      margin: 0 0 0.5em 0;
      line-height: 1.2;
    `;
    content.appendChild(title);
  }

  // Add byline
  if (article.byline) {
    const byline = document.createElement('p');
    byline.textContent = article.byline;
    byline.style.cssText = `
      color: #666;
      font-style: italic;
      margin: 0 0 1.5em 0;
    `;
    content.appendChild(byline);
  }

  // Add article content
  const articleContent = document.createElement('div');
  articleContent.innerHTML = sanitizeHTML(article.content);
  articleContent.style.cssText = `
    line-height: inherit;
  `;
  readingMode_wrapWideBlocks(articleContent);
  content.appendChild(articleContent);

  // Add close button
  const closeButton = document.createElement('button');
  closeButton.id = 'assist-reading-mode-close';
  closeButton.setAttribute('aria-label', 'Exit Reading Mode');
  closeButton.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 20px;
    background: white;
    border: 2px solid #333;
    border-radius: 24px;
    font-size: 16px;
    font-weight: 600;
    line-height: 1;
    color: #333;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    z-index: 2; /* above the article content within the reading-mode overlay's stacking context */
    display: flex;
    align-items: center;
    gap: 8px;
    transition: all 0.2s ease;
  `;
  closeButton.innerHTML = `
    <span style="font-size: 20px; line-height: 1;">✕</span>
    <span>Exit</span>
  `;
  closeButton.onmouseenter = function () {
    this.style.background = '#f44336';
    this.style.borderColor = '#f44336';
    this.style.color = 'white';
    this.style.transform = 'scale(1.05)';
  };
  closeButton.onmouseleave = function () {
    this.style.background = 'white';
    this.style.borderColor = '#333';
    this.style.color = '#333';
    this.style.transform = 'scale(1)';
  };

  // Use quiet handler (button has custom hover logic above)
  attachAccessibleHandler(
    closeButton,
    'Reading Mode Exit',
    () => {
      readingMode_exit();
    },
    { enableVisualFeedback: false }
  );

  // The reflow rules travel with the overlay, so exiting reading mode takes them off the page.
  const reflowStyles = document.createElement('style');
  reflowStyles.id = 'assist-reading-mode-reflow';
  reflowStyles.textContent = READING_MODE_REFLOW_CSS;
  overlay.appendChild(reflowStyles);

  overlay.appendChild(content);
  overlay.appendChild(closeButton);

  return overlay;
}

/**
 * Tells the student something through the page's toast, a role="status" region.
 *
 * A failure the student caused by pressing a button is always shown, `force` and all: "minimize
 * clutter" suppresses ordinary toasts, and it was silently swallowing the only answer a student got
 * when reading mode could not read the page, leaving the button looking broken.
 *
 * @param {string} message - One plain sentence.
 * @param {{failure?: boolean}} [options] - `failure: true` for an answer the student is owed.
 * @returns {void}
 */
function readingMode_announce(message, options = {}) {
  if (typeof window.showToast !== 'function') {
    return;
  }
  if (options.failure) {
    window.showToast(message, 4000, { force: true });
    return;
  }
  window.showToast(message);
}

/**
 * Takes the page underneath the overlay out of the accessibility tree and out of reach of the
 * keyboard, so a screen-reader student is not still inside the clutter they asked to leave.
 *
 * @param {HTMLElement} overlay - The overlay to keep available.
 * @returns {void}
 */
function readingMode_hidePageBehind(overlay) {
  // The overlay spans the layout viewport, which stops at the page's scrollbar; locking the page
  // removes that scrollbar instead of leaving a live one beside the article. The page's own value
  // is saved only when no lock holds it already, so a second lock can never save "hidden" as it.
  if (readingMode_pageOverflow === null) {
    readingMode_pageOverflow = document.documentElement.style.overflow;
  }
  document.documentElement.style.overflow = 'hidden';
  readingMode_hiddenSiblings = [];
  for (const element of Array.from(document.body.children)) {
    // AssisT's own in-page tools stay reachable: a student reading through the overlay still needs
    // the TTS bar and the dictation button. They are part of the Tab cycle below, and the overlay
    // claims no `aria-modal`, so this is true for a screen-reader student as well as a sighted one.
    if (element === overlay || (element.id && element.id.startsWith('assist-'))) {
      continue;
    }
    readingMode_hiddenSiblings.push({
      element,
      ariaHidden: element.getAttribute('aria-hidden'),
      inert: element.hasAttribute('inert'),
    });
    element.setAttribute('aria-hidden', 'true');
    element.setAttribute('inert', '');
  }
}

/**
 * What Tab may reach while reading mode is open: the overlay, plus AssisT's own in-page tools.
 *
 * The page's own content is inert, so it is not in here. The reading aids are, because a student in
 * reading mode still needs to start and stop the voice; a plain focus trap on the overlay alone
 * wrapped Tab back to the first control and put the TTS bar out of reach.
 *
 * @returns {HTMLElement[]}
 */
function readingMode_focusRoots() {
  if (!readingMode_overlay) {
    return [];
  }
  const tools = Array.from(document.body.children).filter(
    element => element !== readingMode_overlay && element.id && element.id.startsWith('assist-')
  );
  return [readingMode_overlay, ...tools];
}

/** Focusable controls a student can Tab to, in the order Tab would visit them. */
const READING_MODE_FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * The Tab stops of the reading-mode cycle, in DOM order.
 *
 * @returns {HTMLElement[]}
 */
function readingMode_focusStops() {
  return readingMode_focusRoots()
    .flatMap(root => Array.from(root.querySelectorAll(READING_MODE_FOCUSABLE)))
    .filter(
      element =>
        element.getAttribute('aria-hidden') !== 'true' && !element.closest('[hidden], [inert]')
    );
}

/**
 * Keeps Tab inside the reading-mode cycle: the article's controls and AssisT's page tools, wrapping
 * at each end rather than walking onto the page the student asked to leave (WCAG 2.2 SC 2.4.3).
 *
 * @param {KeyboardEvent} event
 * @returns {void}
 */
function readingMode_handleTab(event) {
  if (event.key !== 'Tab' || !readingMode_isActive || !readingMode_overlay) {
    return;
  }

  const stops = readingMode_focusStops();
  if (stops.length === 0) {
    event.preventDefault();
    readingMode_overlay.focus();
    return;
  }

  const first = stops[0];
  const last = stops[stops.length - 1];
  const active = document.activeElement;

  // Focus outside the cycle - a re-render dropped the focused control and focus fell to <body> -
  // is pulled back in rather than left to walk onto the inert page.
  if (!readingMode_focusRoots().some(root => root.contains(active))) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
    return;
  }

  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

/**
 * Gives the page underneath back exactly as it was found.
 *
 * @returns {void}
 */
function readingMode_restorePageBehind() {
  for (const { element, ariaHidden, inert } of readingMode_hiddenSiblings) {
    if (ariaHidden === null) {
      element.removeAttribute('aria-hidden');
    } else {
      element.setAttribute('aria-hidden', ariaHidden);
    }
    if (!inert) {
      element.removeAttribute('inert');
    }
  }
  readingMode_hiddenSiblings = [];
  if (readingMode_pageOverflow !== null) {
    document.documentElement.style.overflow = readingMode_pageOverflow;
    readingMode_pageOverflow = null;
  }
}

/**
 * Enters reading mode
 */
async function readingMode_enter() {
  if (readingMode_isActive) {
    console.log('[ReadingMode] Already active');
    return;
  }

  console.log('[ReadingMode] Entering reading mode...');

  // Extract content
  const article = await readingMode_extractContent();

  // Something else may have opened reading mode while the article was being read.
  if (readingMode_isActive) {
    return;
  }

  if (!article) {
    readingMode_announce('Could not read an article from this page.', { failure: true });
    return;
  }

  // Store original content (for restoration)
  readingMode_originalContent = {
    scrollY: window.scrollY,
    scrollX: window.scrollX,
  };

  // Create and show overlay
  readingMode_overlay = readingMode_createOverlay(article);
  document.body.appendChild(readingMode_overlay);
  readingMode_hidePageBehind(readingMode_overlay);

  // Focus starts at the top of the article, and Tab cycles the overlay together with AssisT's own
  // page tools. Escape is handled by the document listener registered in readingMode_init.
  readingMode_opener = document.activeElement;
  document.addEventListener('keydown', readingMode_handleTab);
  readingMode_focusTimer = setTimeout(() => {
    readingMode_focusTimer = null;
    readingMode_overlay?.focus();
  }, 0);

  readingMode_isActive = true;

  console.log('[ReadingMode] Reading mode active');

  readingMode_announce('Reading Mode activated. Press ESC to exit.');
}

/**
 * Exits reading mode
 */
function readingMode_exit() {
  if (!readingMode_isActive) {
    return;
  }

  console.log('[ReadingMode] Exiting reading mode...');

  readingMode_restorePageBehind();

  // Remove overlay
  if (readingMode_overlay) {
    readingMode_overlay.remove();
    readingMode_overlay = null;
  }

  // Done after the overlay is gone, so focus lands on the opener and not inside a detached node.
  document.removeEventListener('keydown', readingMode_handleTab);
  if (readingMode_focusTimer !== null) {
    clearTimeout(readingMode_focusTimer);
    readingMode_focusTimer = null;
  }
  if (readingMode_opener && typeof readingMode_opener.focus === 'function') {
    try {
      readingMode_opener.focus();
    } catch {
      /* the opener may be gone; the student keeps whatever focus they have */
    }
  }
  readingMode_opener = null;

  // Restore scroll position
  if (readingMode_originalContent) {
    window.scrollTo(readingMode_originalContent.scrollX, readingMode_originalContent.scrollY);
    readingMode_originalContent = null;
  }

  readingMode_isActive = false;

  console.log('[ReadingMode] Reading mode exited');
}

/**
 * Runs a step after the open or toggle already in progress.
 *
 * Entering waits on extraction, so every opener is queued: a toggle arriving mid-entry closes the
 * overlay once it exists rather than starting a second, and the promise settles on the real state.
 *
 * @param {() => (void|Promise<void>)} step
 * @returns {Promise<void>}
 */
function readingMode_enqueue(step) {
  readingMode_queue = readingMode_queue
    .then(step)
    .catch(error => console.error('[ReadingMode] Open or toggle failed:', error));
  return readingMode_queue;
}

/**
 * Opens reading mode, or leaves it open. This is the `enter` other features call (OCR opens it
 * before capturing the page).
 *
 * @returns {Promise<void>}
 */
function readingMode_open() {
  return readingMode_enqueue(() => (readingMode_isActive ? undefined : readingMode_enter()));
}

/**
 * Toggles reading mode
 */
function readingMode_toggle() {
  return readingMode_enqueue(() =>
    readingMode_isActive ? readingMode_exit() : readingMode_enter()
  );
}

/**
 * Handles Escape key for exiting reading mode
 * (Only used when reading mode is active)
 *
 * @param {KeyboardEvent} event - Keyboard event
 */
function readingMode_handleKeyboard(event) {
  // ESC - Exit reading mode
  if (event.key === 'Escape' && readingMode_isActive) {
    event.preventDefault();
    readingMode_exit();
  }
}

/**
 * Re-applies the student's appearance settings to an overlay that is already open.
 *
 * @returns {void}
 */
function readingMode_restyle() {
  if (!readingMode_isActive || !readingMode_overlay) {
    return;
  }

  readingMode_overlay.style.background = readingMode_settings.backgroundColor;
  const content = document.getElementById('assist-reading-mode-content');
  if (content) {
    content.style.fontFamily = readingMode_settings.fontFamily;
    content.style.fontSize = readingMode_settings.fontSize;
    content.style.lineHeight = readingMode_settings.lineHeight;
    content.style.maxWidth = readingMode_settings.maxWidth;
  }
}

/**
 * Initializes the reading mode feature
 */
function readingMode_init() {
  console.log('[ReadingMode] Initializing...');

  // Add keyboard listener for Escape key
  document.addEventListener('keydown', readingMode_handleKeyboard);

  // Register dynamic keyboard shortcut for toggle
  registerShortcut('reading_mode_toggle', () => {
    console.log('[ReadingMode] Toggle shortcut triggered');
    readingMode_toggle();
  });

  // Register dynamic keyboard shortcut for exit
  registerShortcut('reading_mode_exit', () => {
    if (readingMode_isActive) {
      console.log('[ReadingMode] Exit shortcut triggered');
      readingMode_exit();
    }
  });

  // Settings live under `assist_settings.readingMode`, the key the popup and the tool registry
  // write. Values absent from storage keep the module defaults above.
  readingMode_unsubscribe = initFeatureSettings(
    'readingMode',
    readingMode_settings,
    settings => {
      Object.assign(readingMode_settings, settings);
      console.log('[ReadingMode] Settings loaded:', Object.keys(readingMode_settings).join(', '));
    },
    settings => {
      Object.assign(readingMode_settings, settings);
      console.log('[ReadingMode] Settings updated:', Object.keys(readingMode_settings).join(', '));
      readingMode_restyle();
    }
  );

  // Register feature
  if (!window.assistFeatures) {
    window.assistFeatures = {};
  }

  window.assistFeatures.readingMode = {
    enter: readingMode_open,
    exit: readingMode_exit,
    toggle: readingMode_toggle,
    isActive: () => readingMode_isActive,
    settings: readingMode_settings,
    cleanup: readingMode_cleanup,
  };

  console.log('[ReadingMode] Feature initialized. Use Ctrl+Shift+R to toggle.');
}

/**
 * Cleanup function
 */
function readingMode_cleanup() {
  console.log('[ReadingMode] Cleaning up...');
  readingMode_exit();
  document.removeEventListener('keydown', readingMode_handleKeyboard);
  if (readingMode_unsubscribe) {
    readingMode_unsubscribe();
    readingMode_unsubscribe = null;
  }
}

// Auto-initialize when script loads
if (typeof window !== 'undefined') {
  readingMode_init();
}
