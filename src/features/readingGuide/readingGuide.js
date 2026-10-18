/**
 * Reading Guide Feature Module
 *
 * Provides a reading guide line that tracks the user's mouse position,
 * helping neurodivergent students maintain focus and track their reading position.
 *
 * @module readingGuide
 * @version 1.1.0
 * @requires ../core/ui/toast.js
 */

import { showToast } from '../../core/ui/toast.js';
import { focusMode_disable, focusMode_getEnabled } from '../focusMode/focusMode.js';
import { initFeatureSettings } from '../../content/utils/storage-utils.js';
import { assistOverlayIsOpen } from '../../utils/assist-overlay-state.js';
import { Z } from '../../utils/z-index.js';

/** @type {boolean} - Whether the reading guide is currently enabled */
let readingGuide_enabled = false;

/** @type {HTMLElement|null} - Reference to the reading guide line DOM element */
let readingGuide_lineElement = null;

/** @type {number} - Last vertical position of the line, in viewport pixels */
let readingGuide_currentY = 0;

/**
 * How far one keyboard nudge moves the guide. 24px is roughly a line of body text, so Alt+Arrow
 * steps line by line; Shift makes it a paragraph-sized jump for crossing the page quickly.
 */
const READING_GUIDE_NUDGE = 24;
const READING_GUIDE_NUDGE_LARGE = 96;

/**
 * True for anything that owns its own arrow keys and its own Escape: a text field, a select, or
 * contenteditable prose. The guide never steals a keystroke from one of those - inside a field the
 * caret is what moves the guide, which is the behaviour a student tracking a line actually wants.
 *
 * @param {EventTarget|null} target
 * @returns {boolean}
 */
function readingGuide_isEditable(target) {
  if (!target || typeof target.closest !== 'function') {
    return false;
  }
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

/**
 * Reading Guide configuration settings
 * @type {Object}
 * @property {string} lineColor - CSS color of the reading guide line (hex format)
 * @property {number} lineThickness - Height of the line in pixels
 * @property {number} lineOpacity - Opacity of the line (0.0 to 1.0)
 */
const readingGuide_settings = {
  lineColor: '#000000',
  lineThickness: 3,
  lineOpacity: 0.7,
};

/**
 * Creates the reading guide line element and appends it to the DOM.
 *
 * The line is created as a fixed position element with pointer-events: none
 * to ensure it doesn't interfere with user interactions. Includes a smooth
 * CSS transition for position updates.
 *
 * @function readingGuide_createLine
 * @returns {void}
 */
function readingGuide_createLine() {
  if (readingGuide_lineElement) {
    return; // Already exists
  }

  readingGuide_lineElement = document.createElement('div');
  readingGuide_lineElement.id = 'assist-reading-guide-line';
  // The line is a tracking aid drawn over the page, not content. A screen reader has nothing to
  // say about it, and announcing an empty div every time it moves would be noise.
  readingGuide_lineElement.setAttribute('aria-hidden', 'true');
  readingGuide_lineElement.style.cssText = `
    position: fixed;
    left: 0;
    top: 0;
    width: 100vw;
    height: ${readingGuide_settings.lineThickness}px;
    background-color: ${readingGuide_settings.lineColor};
    opacity: ${readingGuide_settings.lineOpacity};
    pointer-events: none;
    z-index: ${Z.FLOATING};
    transition: ${readingGuide_prefersReducedMotion() ? 'none' : 'top 0.05s ease-out'};
    display: none;
  `;
  document.body.appendChild(readingGuide_lineElement);
  console.log('[ReadingGuide] Line element created');
}

/**
 * Updates the vertical position of the reading guide line based on mouse Y coordinate.
 *
 * Called on every mousemove event to track the user's reading position.
 * Only updates if the reading guide is enabled.
 *
 * @function readingGuide_updatePosition
 * @param {number} mouseY - The Y coordinate (in pixels) of the mouse position
 * @returns {void}
 */
function readingGuide_updatePosition(mouseY) {
  if (readingGuide_lineElement && readingGuide_enabled) {
    const limit = Math.max(0, window.innerHeight - readingGuide_settings.lineThickness);
    readingGuide_currentY = Math.max(0, Math.min(mouseY, limit));
    readingGuide_lineElement.style.top = readingGuide_currentY + 'px';
  }
}

/**
 * Whether the student has asked the system for reduced motion.
 * @returns {boolean}
 */
function readingGuide_prefersReducedMotion() {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  } catch {
    return false;
  }
}

/**
 * Puts the guide on a given element - the one the student has just tabbed to, normally.
 *
 * Centred on the element's box, because that is the line the student is about to read. An element
 * with no box (display:none, or jsdom before layout) is ignored rather than sending the guide to 0.
 *
 * @param {Element|null} element
 * @returns {void}
 */
function readingGuide_followElement(element) {
  if (!element || typeof element.getBoundingClientRect !== 'function') {
    return;
  }
  const rect = element.getBoundingClientRect();
  if (!rect.height && !rect.width) {
    return;
  }
  readingGuide_updatePosition(rect.top + rect.height / 2);
}

/**
 * Puts the guide on the caret.
 *
 * This is the case the feature exists for: a student typing or reading in a text field wants the
 * line on the row they are working in. `input` and `textarea` expose no caret rectangle, so their
 * own box is the best available answer; contenteditable prose gives a real range rectangle.
 *
 * @returns {void}
 */
function readingGuide_followCaret() {
  const active = document.activeElement;
  if (active && /^(INPUT|TEXTAREA)$/.test(active.tagName)) {
    readingGuide_followElement(active);
    return;
  }

  const selection = window.getSelection?.();
  if (!selection || selection.rangeCount === 0) {
    return;
  }
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  if (rect.height || rect.width) {
    readingGuide_updatePosition(rect.top + rect.height / 2);
    return;
  }
  // A collapsed caret in some browsers reports an empty rectangle; fall back to its element.
  const node = selection.focusNode;
  readingGuide_followElement(node?.nodeType === 1 ? node : node?.parentElement);
}

/**
 * Updates the visual styling of the reading guide line.
 *
 * Applies the current settings (lineThickness, lineColor, lineOpacity)
 * to the line element. Called when settings are updated.
 *
 * @function readingGuide_updateStyle
 * @returns {void}
 */
function readingGuide_updateStyle() {
  if (readingGuide_lineElement) {
    readingGuide_lineElement.style.height = readingGuide_settings.lineThickness + 'px';
    readingGuide_lineElement.style.backgroundColor = readingGuide_settings.lineColor;
    readingGuide_lineElement.style.opacity = readingGuide_settings.lineOpacity;
  }
}

/**
 * Enables the reading guide feature.
 *
 * - Creates the line element if it doesn't exist
 * - Displays the line and attaches the mousemove listener
 * - Handles mutual exclusivity with Focus Mode (disables Focus Mode if active)
 * - Shows a toast notification to the user
 *
 * @function readingGuide_enable
 * @returns {void}
 */
function readingGuide_enable() {
  // Check mutual exclusivity with Focus Mode
  if (focusMode_getEnabled()) {
    focusMode_disable();
    showToast('🎯 Focus Mode disabled (Reading Guide active)');
  }

  readingGuide_enabled = true;
  readingGuide_createLine();
  if (readingGuide_lineElement) {
    readingGuide_lineElement.style.display = 'block';
  }

  // Start in the middle of the viewport. A student who never moves a pointer would otherwise be
  // left with the line pinned to the top edge of the page, which is no guide at all.
  readingGuide_updatePosition(window.innerHeight / 2);

  // Pointer, keyboard focus and caret all drive the same position - whichever moved last wins, so
  // the two input methods take turns instead of fighting.
  document.addEventListener('mousemove', readingGuide_handleMouseMove);
  document.addEventListener('focusin', readingGuide_handleFocusIn);
  document.addEventListener('selectionchange', readingGuide_handleSelectionChange);
  document.addEventListener('keydown', readingGuide_handleKeyDown);

  console.log('[ReadingGuide] Enabled');
  showToast(
    '📏 Reading guide on. It follows your cursor; Alt with the up or down arrow moves it, Escape turns it off.'
  );
}

/**
 * Disables the reading guide feature.
 *
 * - Hides the reading guide line
 * - Removes the mousemove event listener
 * - Shows a toast notification to the user
 *
 * @function readingGuide_disable
 * @returns {void}
 */
function readingGuide_disable() {
  readingGuide_enabled = false;
  // Take the line off the page rather than hiding it. A switched-off feature that leaves its own
  // div in the student's document has not put the page back, and overnight release testing found
  // exactly that after "switch everything off": a hidden #assist-reading-guide-line still in body.
  // enable() builds a fresh one, so nothing is lost by dropping this one.
  if (readingGuide_lineElement) {
    readingGuide_lineElement.remove();
    readingGuide_lineElement = null;
  }

  document.removeEventListener('mousemove', readingGuide_handleMouseMove);
  document.removeEventListener('focusin', readingGuide_handleFocusIn);
  document.removeEventListener('selectionchange', readingGuide_handleSelectionChange);
  document.removeEventListener('keydown', readingGuide_handleKeyDown);

  console.log('[ReadingGuide] Disabled');
  showToast('Reading Guide disabled');
}

/**
 * Handles mousemove events to update the reading guide line position.
 *
 * Bound to the document's mousemove event when the reading guide is enabled.
 *
 * @function readingGuide_handleMouseMove
 * @param {MouseEvent} event - The mousemove event object
 * @returns {void}
 */
function readingGuide_handleMouseMove(event) {
  if (readingGuide_enabled) {
    readingGuide_updatePosition(event.clientY);
  }
}

/**
 * Keyboard focus moved, so move the guide with it.
 *
 * @param {FocusEvent} event
 * @returns {void}
 */
function readingGuide_handleFocusIn(event) {
  if (readingGuide_enabled) {
    readingGuide_followElement(event.target);
  }
}

/**
 * The caret moved, so move the guide to the line being edited or read.
 * @returns {void}
 */
function readingGuide_handleSelectionChange() {
  if (readingGuide_enabled) {
    readingGuide_followCaret();
  }
}

/**
 * Keyboard control of the guide: Alt with an arrow key nudges it, Escape puts it away.
 *
 * Alt is required because a bare arrow key is how the page scrolls; taking that over for the
 * length of a reading session would break the very page the student is trying to read. Escape and
 * the arrows are both left alone inside a text field, where the field owns them and the caret is
 * already moving the guide, and Escape is left alone while an AssisT dialog or menu is open above
 * the guide - see utils/assist-overlay-state.js for that rule.
 *
 * @param {KeyboardEvent} event
 * @returns {void}
 */
function readingGuide_handleKeyDown(event) {
  if (!readingGuide_enabled || readingGuide_isEditable(event.target)) {
    return;
  }

  // The guide is the bottom of the Escape stack: while an AssisT dialog or menu is open above it,
  // that Escape belongs to the dialog, and closing a panel must not also put the guide away.
  if (
    event.key === 'Escape' &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !assistOverlayIsOpen()
  ) {
    readingGuide_disable();
    return;
  }

  if (!event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }

  const step = event.shiftKey ? READING_GUIDE_NUDGE_LARGE : READING_GUIDE_NUDGE;
  if (event.key === 'ArrowDown') {
    readingGuide_updatePosition(readingGuide_currentY + step);
  } else if (event.key === 'ArrowUp') {
    readingGuide_updatePosition(readingGuide_currentY - step);
  } else {
    return;
  }
  event.preventDefault();
}

/** @type {Object} Default settings for reading guide */
const DEFAULT_SETTINGS = {
  enabled: false,
  lineColor: '#000000',
  lineThickness: 3,
  lineOpacity: 0.7,
};

/**
 * Applies settings from storage to the module state
 * @param {Object} settings - Settings object from storage
 * @param {boolean} isInit - Whether this is initial load (true) or change (false)
 */
function applySettings(settings, isInit = false) {
  const wasEnabled = readingGuide_enabled;
  const newEnabled = settings.enabled || false;

  // Update settings
  readingGuide_settings.lineColor = settings.lineColor || DEFAULT_SETTINGS.lineColor;
  readingGuide_settings.lineThickness = settings.lineThickness || DEFAULT_SETTINGS.lineThickness;
  readingGuide_settings.lineOpacity = settings.lineOpacity || DEFAULT_SETTINGS.lineOpacity;

  // Handle enable/disable
  if (newEnabled && !wasEnabled) {
    readingGuide_enable();
  } else if (!newEnabled && wasEnabled) {
    readingGuide_disable();
  } else if (newEnabled && !isInit) {
    // Update style if already enabled (but not on init, as enable() handles it)
    readingGuide_updateStyle();
  }

  console.log(
    `[ReadingGuide] Settings ${isInit ? 'loaded' : 'updated'}:`,
    newEnabled,
    readingGuide_settings
  );
}

/**
 * Initialize reading guide using centralized storage utility.
 * Uses initFeatureSettings for consistent storage access pattern.
 */
initFeatureSettings(
  'readingGuide',
  DEFAULT_SETTINGS,
  settings => applySettings(settings, true),
  settings => applySettings(settings, false)
);

/**
 * Returns whether Reading Guide is currently enabled
 * @returns {boolean} True if enabled, false otherwise
 */
function readingGuide_getEnabled() {
  return readingGuide_enabled;
}

/**
 * Public API for the Reading Guide feature module
 */
export {
  readingGuide_enable,
  readingGuide_disable,
  readingGuide_createLine,
  readingGuide_updatePosition,
  readingGuide_updateStyle,
  readingGuide_handleMouseMove,
  readingGuide_getEnabled,
};
