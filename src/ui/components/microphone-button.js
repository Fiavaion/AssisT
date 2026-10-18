/**
 * Floating Microphone Button Component
 * Creates a floating microphone button that appears when text fields are focused
 *
 * Features:
 * - Appears on text field focus, inside the field's own bounds so it never covers the next control
 * - Honest state: "starting" until recognition really begins, only then "recording"
 * - A status bar and tooltip that a screen reader announces
 * - One Tab from the field reaches it, Shift+Tab goes back
 * - The hint names the student's own dictation key, and follows a remap without a page reload
 *
 * @module MicrophoneButton
 */

import { sanitizeHTML } from '../../utils/sanitize.js';
import { attachAccessibleHandler } from '../../utils/event-handlers.js';
import { DEFAULT_SHORTCUTS, loadShortcuts } from '../../utils/keyboard-shortcuts.js';
import { frameHolding } from '../../features/stt/editor-frames.js';
import { Z } from '../../utils/z-index.js';

/** How long to wait for recognition to start before telling the student it did not. */
const START_TIMEOUT_MS = 8000;

/** Button diameter, and the smaller one used on single-line fields. */
const FULL_SIZE = 56;
const COMPACT_SIZE = 36;

/** Distance kept from the field's own edges. */
const EDGE_GAP = 4;

/** Registry key for "start dictation" (see DEFAULT_SHORTCUTS). */
const DICTATION_FEATURE = 'stt_dictate';

/**
 * The keyboard route to dictation as the button's own text says it: the student's saved binding,
 * with the registry default standing in until storage answers. One value for every button in the
 * realm, read once and then kept current by the storage listener below, so remapping the key in
 * Settings changes what the button promises without a page reload — a hint that names a key the
 * student no longer has is worse than no hint at all.
 */
let dictationShortcut = DEFAULT_SHORTCUTS[DICTATION_FEATURE];

/** Buttons wanting to be repainted when the binding changes. */
const shortcutSubscribers = new Set();
/** The one storage listener that serves all of them, null while none are showing. */
let storageListener = null;
/** Storage is read once per realm; every later change arrives through the listener. */
let shortcutRead = false;

/**
 * Adopt a binding and repaint every button that is showing one. An empty string is a binding the
 * student cleared on purpose, and is kept as such — the hint then names no key.
 * @param {string} binding
 */
function applyDictationShortcut(binding) {
  if (typeof binding !== 'string' || binding === dictationShortcut) {
    return;
  }
  dictationShortcut = binding;
  shortcutSubscribers.forEach(repaint => repaint());
}

/**
 * The popup writes the whole settings object when a shortcut is remapped, so the new binding is
 * read straight out of the change rather than by going back to storage.
 * @param {Object} changes
 * @param {string} [area]
 */
function onShortcutStorageChange(changes, area) {
  if (area && area !== 'local') {
    return;
  }
  const change = changes && changes.assist_settings;
  if (!change) {
    return;
  }
  const saved = (change.newValue && change.newValue.keyboardShortcuts) || {};
  applyDictationShortcut(
    DICTATION_FEATURE in saved ? saved[DICTATION_FEATURE] : DEFAULT_SHORTCUTS[DICTATION_FEATURE]
  );
}

/**
 * Follow the student's binding for as long as this button exists: one storage read per realm and
 * one change listener shared by every button. Silent on failure — a realm without chrome.storage
 * (a plain page in a test) simply keeps the registry default and says the default.
 * @param {Function} repaint
 */
function watchDictationShortcut(repaint) {
  shortcutSubscribers.add(repaint);

  if (!storageListener) {
    try {
      storageListener = onShortcutStorageChange;
      chrome.storage.onChanged.addListener(storageListener);
    } catch {
      storageListener = null;
    }
  }

  if (shortcutRead) {
    return;
  }
  shortcutRead = true;
  try {
    Promise.resolve(loadShortcuts())
      .then(map => {
        if (map && DICTATION_FEATURE in map) {
          applyDictationShortcut(map[DICTATION_FEATURE]);
        }
      })
      .catch(() => {});
  } catch {
    /* no storage in this realm — the registry default stands */
  }
}

/**
 * Stop following the binding, and take the shared listener down with the last button so a
 * destroyed button leaves nothing behind.
 * @param {Function} repaint
 */
function unwatchDictationShortcut(repaint) {
  shortcutSubscribers.delete(repaint);
  if (shortcutSubscribers.size > 0 || !storageListener) {
    return;
  }
  try {
    chrome.storage.onChanged.removeListener(storageListener);
  } catch {
    /* the realm that could not add one cannot have one to remove */
  }
  storageListener = null;
}

/**
 * What the student is told the microphone did not start. Plain language, and the one action
 * that fixes it — never the browser's DOMException text.
 */
const START_TIMEOUT_MESSAGE =
  'The microphone did not start. If your browser is asking for permission, choose Allow in the ' +
  'address bar, then press the microphone button again.';

const MIC_ICON = `
  <svg class="mic-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <path d="M12 14C13.66 14 15 12.66 15 11V5C15 3.34 13.66 2 12 2C10.34 2 9 3.34 9 5V11C9 12.66 10.34 14 12 14Z" fill="white"/>
    <path d="M17 11C17 13.76 14.76 16 12 16C9.24 16 7 13.76 7 11H5C5 14.53 7.61 17.43 11 17.92V21H13V17.92C16.39 17.43 19 14.53 19 11H17Z" fill="white"/>
  </svg>
`;

const PAUSE_ICON = `
  <svg class="pause-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <rect x="6" y="4" width="4" height="16" rx="1" fill="white"/>
    <rect x="14" y="4" width="4" height="16" rx="1" fill="white"/>
  </svg>
`;

/**
 * Everything the four states say, in one place — the label a screen reader reads, the hover
 * title, the tooltip and the status bar. One table, so a wording fix cannot land in three of
 * the four places.
 */
const STATE_TEXT = {
  idle: {
    ariaLabel: 'Start voice typing',
    bar: null,
  },
  starting: {
    ariaLabel: 'Starting voice typing, waiting for the microphone',
    title: 'Waiting for the microphone. Click to cancel.',
    tooltip: 'Waiting for the microphone...',
    bar: '\u{1F3A4} Starting voice typing - waiting for the microphone...',
  },
  recording: {
    ariaLabel: 'Pause voice typing',
    title: 'Recording. Click to pause, right-click to stop.',
    tooltip: 'Click to pause voice typing',
    bar: '\u{1F534} Recording...',
  },
  paused: {
    ariaLabel: 'Resume voice typing',
    title: 'Paused. Click to carry on, right-click to stop.',
    tooltip: 'Click to carry on voice typing',
    bar: '⏸ Paused - click the microphone to carry on',
  },
};

/**
 * Everything a state says, with the idle wording finished off from the student's own binding. The
 * idle title and tooltip are the only text that names a key, so they are the only text built here;
 * a binding the student has cleared leaves the wording with no key in it at all.
 * @param {'idle'|'starting'|'recording'|'paused'} state
 * @returns {{ariaLabel: string, title: string, tooltip: string, bar: ?string}}
 */
function stateText(state) {
  const text = STATE_TEXT[state];
  if (state !== 'idle') {
    return text;
  }
  const key = dictationShortcut ? ` (${dictationShortcut})` : '';
  return {
    ...text,
    title: `Start voice typing${key}`,
    tooltip: `Click to start voice typing${key}`,
  };
}

/** Elements the browser puts in the tab order, used to find what follows the field. */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'button:not([disabled])',
  'iframe',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export class MicrophoneButton {
  constructor(options = {}) {
    this.onStart = options.onStart || (() => {});
    this.onStop = options.onStop || (() => {});
    this.onPause = options.onPause || (() => {});
    this.onResume = options.onResume || (() => {});
    this.onError = options.onError || (() => {});
    // Asked before anything starts (the dictation question, ADR 0006), so the time a student takes
    // to read it is not counted against the microphone's start timer.
    this.confirmStart = options.confirmStart || null;
    this._asking = false;

    this.button = null;
    this.targetField = null;
    this.tooltip = null;

    /** 'idle' | 'starting' | 'recording' | 'paused' — the single source of truth. */
    this.state = 'idle';

    this._startTimer = null;
    this._offscreen = false;
    this._interimWanted = false;
    this._scrollHandler = null;
    this._resizeHandler = null;
    this._fieldKeyHandler = null;
    this._keyField = null;

    /**
     * Repaint the idle wording when the student remaps the dictation key. Only idle names a key,
     * and only idle is repainted: rewriting the status bar mid-dictation would announce the state
     * the student is already in a second time.
     */
    this._repaintShortcut = () => {
      if (this.button && this.state === 'idle') {
        this._applyState();
      }
    };

    this.createButton();
    this.injectStyles();
    watchDictationShortcut(this._repaintShortcut);
  }

  /** True only once recognition has actually started. */
  get isRecording() {
    return this.state === 'recording';
  }

  /** True while the student has asked to dictate but the microphone has not started yet. */
  get isStarting() {
    return this.state === 'starting';
  }

  get isPaused() {
    return this.state === 'paused';
  }

  /**
   * Create the microphone button element
   */
  createButton() {
    this.button = document.createElement('button');
    this.button.className = 'assist-stt-mic-button';
    this.button.type = 'button';
    // Out of the tab order until it is actually shown — an invisible focus stop is a trap of
    // its own (SC 2.4.3).
    this.button.setAttribute('tabindex', '-1');
    this.button.innerHTML = sanitizeHTML(MIC_ICON);
    this._iconMarkup = MIC_ICON;
    this._applyState();

    // Activation. attachAccessibleHandler covers mouse and Enter/Space in one place, so there is
    // no second keydown toggle to cancel the first (the accordion bug). Shift stops outright.
    attachAccessibleHandler(
      this.button,
      'Microphone Button',
      event => {
        if (event && event.shiftKey && this.state !== 'idle') {
          this.stopRecording();
          return;
        }
        this.toggle();
      },
      { enableVisualFeedback: false }
    );

    // Right-click = stop
    this.button.addEventListener('contextmenu', e => {
      e.preventDefault();
      e.stopPropagation();
      if (this.state !== 'idle') {
        this.stopRecording();
      }
    });

    // Tab moves on to whatever follows the field, Shift+Tab goes back to the field. Without this
    // the button — appended at the end of the body — sits many tab stops away from the field it
    // belongs to.
    this.button.addEventListener('keydown', e => {
      if (e.key !== 'Tab') {
        return;
      }

      if (e.shiftKey) {
        if (this.targetField) {
          e.preventDefault();
          this.targetField.focus();
        }
        return;
      }

      const next = this._nextFocusableAfterField();
      if (next) {
        e.preventDefault();
        next.focus();
      }
      // No next control: let the browser move focus on as usual. Never trap.
    });

    this.button.addEventListener('mouseenter', () => {
      this.showTooltip();
    });

    this.button.addEventListener('mouseleave', () => {
      this.hideTooltip();
    });

    console.log('[MicButton] Button created');
  }

  /**
   * Inject CSS styles for the button
   */
  injectStyles() {
    // Check if styles already injected
    if (document.getElementById('assist-stt-mic-styles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'assist-stt-mic-styles';
    style.textContent = `
      /* Microphone Button Base Styles */
      .assist-stt-mic-button {
        position: fixed;
        width: ${FULL_SIZE}px;
        height: ${FULL_SIZE}px;
        border-radius: 50%;
        background: linear-gradient(135deg, #4f46c4 0%, #6b3fa0 100%);
        border: 3px solid white;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        cursor: pointer;
        z-index: ${Z.CONTROLS};
        transition: opacity 0.3s ease, transform 0.3s ease, background 0.3s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transform: scale(0.8);
        pointer-events: none;
        padding: 0;
      }

      /* Compact size for single-line fields, so the button fits inside the field's own bounds
         and never covers the next field or control. 36px still clears SC 2.5.8 (24x24). */
      .assist-stt-mic-button.compact {
        width: ${COMPACT_SIZE}px;
        height: ${COMPACT_SIZE}px;
        border-width: 2px;
      }

      .assist-stt-mic-button.compact .mic-icon,
      .assist-stt-mic-button.compact .pause-icon {
        width: 18px;
        height: 18px;
      }

      .assist-stt-mic-button.visible {
        opacity: 1;
        transform: scale(1);
        pointer-events: auto;
      }

      /* The field has scrolled out of view — the button goes with it rather than floating over
         unrelated content. */
      .assist-stt-mic-button.offscreen {
        opacity: 0;
        pointer-events: none;
      }

      .assist-stt-mic-button:hover {
        transform: scale(1.1);
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
      }

      .assist-stt-mic-button:active {
        transform: scale(0.95);
      }

      .assist-stt-mic-button:focus-visible,
      .assist-stt-mic-button:focus {
        outline: 3px solid #1a1a1a;
        outline-offset: 2px;
      }

      /* Waiting for the microphone — visibly not yet recording */
      .assist-stt-mic-button.starting {
        background: linear-gradient(135deg, #3730a3 0%, #1e1b7a 100%);
        animation: mic-starting 1.2s ease-in-out infinite;
      }

      @keyframes mic-starting {
        0%, 100% { box-shadow: 0 4px 12px rgba(55, 48, 163, 0.5); }
        50% { box-shadow: 0 4px 20px rgba(55, 48, 163, 0.9); }
      }

      /* Recording State */
      .assist-stt-mic-button.recording {
        background: linear-gradient(135deg, #c62828 0%, #8e0000 100%);
        animation: mic-pulse 1.5s infinite;
      }

      @keyframes mic-pulse {
        0%, 100% {
          transform: scale(1);
          box-shadow: 0 4px 12px rgba(198, 40, 40, 0.5);
        }
        50% {
          transform: scale(1.05);
          box-shadow: 0 4px 20px rgba(198, 40, 40, 0.8);
        }
      }

      /* Recording State Hover */
      .assist-stt-mic-button.recording:hover {
        animation: mic-pulse-hover 1.5s infinite;
      }

      @keyframes mic-pulse-hover {
        0%, 100% {
          transform: scale(1.1);
          box-shadow: 0 6px 16px rgba(198, 40, 40, 0.6);
        }
        50% {
          transform: scale(1.15);
          box-shadow: 0 6px 24px rgba(198, 40, 40, 0.9);
        }
      }

      /* Any student who has asked for less motion gets none of the above. */
      @media (prefers-reduced-motion: reduce) {
        .assist-stt-mic-button,
        .assist-stt-mic-button.starting,
        .assist-stt-mic-button.recording,
        .assist-stt-mic-button.recording:hover,
        .assist-stt-recording-bar.visible {
          animation: none;
          transition: none;
        }
      }

      /* Paused State */
      .assist-stt-mic-button.paused {
        background: linear-gradient(135deg, #b45309 0%, #7c3d06 100%);
        animation: none;
      }

      .assist-stt-mic-button.paused:hover {
        transform: scale(1.1);
        box-shadow: 0 6px 16px rgba(180, 83, 9, 0.6);
      }

      /* Icon Styles */
      .assist-stt-mic-button .mic-icon,
      .assist-stt-mic-button .pause-icon {
        width: 28px;
        height: 28px;
        transition: transform 0.2s ease;
      }

      /* Tooltip */
      .assist-stt-mic-tooltip {
        position: fixed;
        background: rgba(0, 0, 0, 0.92);
        color: white;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 500;
        white-space: nowrap;
        z-index: ${Z.CONTROLS};
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.2s ease;
      }

      .assist-stt-mic-tooltip.visible {
        opacity: 1;
      }

      /* Interim Results Display */
      .assist-stt-interim-display {
        position: fixed;
        background: rgba(255, 255, 255, 0.98);
        border: 2px solid #4f46c4;
        border-radius: 8px;
        padding: 12px 16px;
        font-size: 14px;
        color: #333;
        z-index: ${Z.CONTROLS};
        max-width: 400px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        opacity: 0;
        transform: translateY(10px);
        transition: all 0.3s ease;
        pointer-events: none;
      }

      .assist-stt-interim-display.visible {
        opacity: 1;
        transform: translateY(0);
      }

      .assist-stt-interim-display::before {
        content: '\\1F3A4 ';
        font-size: 16px;
      }

      /* Status bar (top). White text on these darker fills clears SC 1.4.3 at 4.5:1. */
      .assist-stt-recording-bar {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        min-height: 32px;
        background: linear-gradient(90deg, #c62828 0%, #7f0000 100%);
        z-index: ${Z.CONTROLS};
        opacity: 0;
        transition: opacity 0.3s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 13px;
        font-weight: 600;
        padding: 6px 12px;
        box-sizing: border-box;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      }

      .assist-stt-recording-bar.visible {
        opacity: 1;
      }

      .assist-stt-recording-bar.starting {
        background: linear-gradient(90deg, #3730a3 0%, #1e1b7a 100%);
      }

      .assist-stt-recording-bar.paused {
        background: linear-gradient(90deg, #8a5a00 0%, #5c3c00 100%);
      }

      /* Disabled State */
      .assist-stt-mic-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        background: linear-gradient(135deg, #767676 0%, #565656 100%);
      }

      .assist-stt-mic-button:disabled:hover {
        transform: scale(1);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      }
    `;

    document.head.appendChild(style);
    console.log('[MicButton] Styles injected');
  }

  /**
   * Show the microphone button for a specific text field
   * @param {HTMLElement} field - The target text field
   */
  show(field) {
    if (!field) {
      console.warn('[MicButton] No field provided');
      return;
    }

    this.targetField = field;

    // Position button relative to field
    this.positionButton(field);

    // Add button to DOM if not already there
    if (!this.button.parentElement) {
      document.body.appendChild(this.button);
    }

    this.button.setAttribute('tabindex', '0');

    // Attach scroll/resize listeners so button tracks the field
    this._attachScrollListeners();
    this._attachFieldKeyHandler(field);

    // Show with animation
    requestAnimationFrame(() => {
      if (this.button) {
        this.button.classList.add('visible');
      }
    });

    console.log('[MicButton] Shown for field:', field.tagName);
  }

  /**
   * Hide the microphone button
   */
  hide() {
    this.button.classList.remove('visible');
    // An invisible button must not keep a focus stop.
    this.button.setAttribute('tabindex', '-1');
    this.hideTooltip();
    this.hideInterimDisplay();

    this._detachScrollListeners();
    this._detachFieldKeyHandler();

    // Remove from DOM after animation, unless dictation is still going on
    setTimeout(() => {
      if (this.button && this.button.parentElement && this.state === 'idle') {
        this.button.parentElement.removeChild(this.button);
      }
    }, 300);

    this.targetField = null;
    console.log('[MicButton] Hidden');
  }

  /**
   * Position button inside the target field's own bounds.
   *
   * The button is position:fixed, so getBoundingClientRect()'s viewport coordinates are used as
   * they are — adding scrollX/scrollY would send it drifting off down the page.
   *
   * It sits inside the field's bottom-right corner rather than below the field, because below is
   * where the page keeps its next input or its Submit button.
   *
   * @param {HTMLElement} field - The target text field
   */
  positionButton(field) {
    // A field in an editor's iframe reports its rectangle in the iframe's own coordinates.
    const rect = (frameHolding(field) || field).getBoundingClientRect();

    // The field has scrolled out of view: take the button with it.
    if (this._isFieldOffScreen(rect)) {
      this._setOffScreen(true);
      return;
    }
    this._setOffScreen(false);

    // A single-line input is shorter than the full button, so use the compact one there.
    const compact = rect.height < FULL_SIZE + EDGE_GAP * 2;
    this.button.classList.toggle('compact', compact);
    const size = compact ? COMPACT_SIZE : FULL_SIZE;

    let left;
    if (rect.width >= size + EDGE_GAP * 2) {
      // Inside the field's right edge
      left = rect.right - size - EDGE_GAP;
    } else if (rect.right + EDGE_GAP + size <= window.innerWidth) {
      // Field too narrow to hold the button: flip to just outside its right edge
      left = rect.right + EDGE_GAP;
    } else {
      // No room on the right either: flip to just outside the left edge
      left = rect.left - size - EDGE_GAP;
    }

    // Bottom corner of a multi-line field; vertically centred on a single-line one
    let top = compact ? rect.top + (rect.height - size) / 2 : rect.bottom - size - EDGE_GAP;

    // Keep it on screen whatever the field is doing
    left = Math.max(EDGE_GAP, Math.min(left, window.innerWidth - size - EDGE_GAP));
    top = Math.max(EDGE_GAP, Math.min(top, window.innerHeight - size - EDGE_GAP));

    this.button.style.left = `${left}px`;
    this.button.style.top = `${top}px`;
  }

  /**
   * Whether the field's rectangle lies entirely outside the viewport.
   * @param {DOMRect} rect
   * @returns {boolean}
   */
  _isFieldOffScreen(rect) {
    return (
      rect.bottom <= 0 ||
      rect.top >= window.innerHeight ||
      rect.right <= 0 ||
      rect.left >= window.innerWidth
    );
  }

  /**
   * Hide/restore the button while its field is out of view, without tearing down the listeners
   * that will bring it back.
   * @param {boolean} off
   */
  _setOffScreen(off) {
    if (this._offscreen === off) {
      return;
    }
    this._offscreen = off;
    this.button.classList.toggle('offscreen', off);
    this.button.setAttribute('tabindex', off ? '-1' : '0');
    if (off) {
      this.hideTooltip();
    }
  }

  /**
   * Attach scroll and resize listeners to reposition button when page scrolls.
   * Uses capture-phase listener on document so ALL scroll events are caught,
   * regardless of which container they originate from (scroll does not bubble,
   * but the capture phase fires top-down to any target — this reliably catches
   * Canvas inner scroll containers, iframes, and any overflow:hidden hacks).
   */
  _attachScrollListeners() {
    this._detachScrollListeners();

    if (!this.targetField) {
      return;
    }

    this._scrollHandler = () => {
      if (this.targetField) {
        this.positionButton(this.targetField);
      }
    };

    this._resizeHandler = this._scrollHandler;

    // capture:true catches scroll events on any element in the document tree,
    // not just window — this is the only reliable way to track all scroll sources.
    document.addEventListener('scroll', this._scrollHandler, { capture: true, passive: true });
    window.addEventListener('resize', this._resizeHandler, { passive: true });
  }

  /**
   * Detach scroll and resize listeners
   */
  _detachScrollListeners() {
    if (this._scrollHandler) {
      document.removeEventListener('scroll', this._scrollHandler, { capture: true });
    }
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
    }
    this._scrollHandler = null;
    this._resizeHandler = null;
  }

  /**
   * One Tab from the field reaches the microphone (SC 2.4.3). The button lives at the end of the
   * body, so without this it is a dozen tab stops away from the field it belongs to. Focus is
   * only redirected, never held: Tab from the button carries on to whatever follows the field.
   *
   * @param {HTMLElement} field
   */
  _attachFieldKeyHandler(field) {
    this._detachFieldKeyHandler();

    this._fieldKeyHandler = e => {
      if (e.key !== 'Tab' || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) {
        return;
      }
      // The field used Tab itself (a rich editor indenting a list item): leave it alone.
      if (e.defaultPrevented) {
        return;
      }
      if (!this.button || !this.button.parentElement || this._offscreen) {
        return;
      }
      e.preventDefault();
      this.button.focus();
    };

    field.addEventListener('keydown', this._fieldKeyHandler);
    this._keyField = field;
  }

  /**
   * Stop listening to the field's keystrokes.
   */
  _detachFieldKeyHandler() {
    if (this._keyField && this._fieldKeyHandler) {
      this._keyField.removeEventListener('keydown', this._fieldKeyHandler);
    }
    this._keyField = null;
    this._fieldKeyHandler = null;
  }

  /**
   * The focusable element that follows the target field in the page's own tab order.
   * @returns {HTMLElement|null}
   */
  _nextFocusableAfterField() {
    if (!this.targetField) {
      return null;
    }

    const candidates = Array.from(document.querySelectorAll(FOCUSABLE_SELECTOR)).filter(el => {
      if (el === this.button || el.hasAttribute('hidden') || el.disabled) {
        return false;
      }
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });

    const index = candidates.indexOf(frameHolding(this.targetField) || this.targetField);
    if (index === -1) {
      return null;
    }
    return candidates[index + 1] || null;
  }

  /**
   * Toggle: idle → start, starting → cancel, recording → pause, paused → resume
   */
  toggle() {
    if (this.state === 'starting') {
      // The student pressed again while the microphone was still coming up: cancel.
      this.stopRecording();
    } else if (this.state === 'paused') {
      this.resumeRecording();
    } else if (this.state === 'recording') {
      this.pauseRecording();
    } else {
      this.startRecording();
    }
  }

  /**
   * Ask for dictation. The button says "starting" — NOT "recording" — until the recognition
   * engine reports that it really began (see updateState), or until the wait runs out.
   */
  startRecording() {
    if (!this.targetField) {
      console.error('[MicButton] No target field set');
      return;
    }
    if (this.state !== 'idle' || this._asking) {
      return;
    }
    if (this.confirmStart) {
      this._asking = true;
      const field = this.targetField;
      Promise.resolve(this.confirmStart(field))
        .catch(() => false)
        .then(allowed => {
          this._asking = false;
          if (allowed && this.button && this.state === 'idle') {
            this._beginStart();
          }
        });
      return;
    }
    this._beginStart();
  }

  /** The start itself: "starting", the timer, and the request to the controller. */
  _beginStart() {
    this._setState('starting');

    this._clearStartTimer();
    this._startTimer = setTimeout(() => {
      this._startTimer = null;
      if (this.state !== 'starting') {
        return;
      }
      console.warn('[MicButton] Recognition never started');
      // Call the start off as well, so recognition cannot come up after the student has been
      // told it did not and flip the button back to Recording on its own.
      this.stopRecording();
      this.onError(START_TIMEOUT_MESSAGE);
    }, START_TIMEOUT_MS);

    this.onStart(this.targetField);
  }

  /**
   * Stop dictation. Works from every state, including a start that has not landed yet — the
   * controller aborts the pending recognition.
   */
  stopRecording() {
    this._clearStartTimer();
    this._setState('idle');
    this.hideInterimDisplay();
    this.onStop();

    console.log('[MicButton] Recording stopped');
  }

  /**
   * Pause recording
   */
  pauseRecording() {
    if (this.state !== 'recording') {
      return;
    }

    this._setState('paused');
    this.onPause();

    console.log('[MicButton] Recording paused (still listening, ignoring results)');
  }

  /**
   * Resume recording
   */
  resumeRecording() {
    if (this.state !== 'paused') {
      return;
    }

    this._setState('recording');
    this.onResume();

    console.log('[MicButton] Recording resumed');
  }

  /**
   * Move to a state and make every visible thing agree with it.
   * @param {'idle'|'starting'|'recording'|'paused'} next
   */
  _setState(next) {
    this.state = next;
    this._applyState();
  }

  /**
   * Paint the current state onto the button, its icon and the status bar.
   */
  _applyState() {
    const text = stateText(this.state);

    this.button.classList.toggle('starting', this.state === 'starting');
    this.button.classList.toggle('recording', this.state === 'recording');
    this.button.classList.toggle('paused', this.state === 'paused');
    this.button.setAttribute('aria-label', text.ariaLabel);
    this.button.setAttribute('title', text.title);

    const icon = this.state === 'paused' ? PAUSE_ICON : MIC_ICON;
    if (this._iconMarkup !== icon) {
      this.button.innerHTML = sanitizeHTML(icon);
      this._iconMarkup = icon;
    }

    if (text.bar) {
      this._showStatusBar(text.bar);
    } else {
      this.hideRecordingIndicator();
    }

    if (this.tooltip) {
      this.tooltip.textContent = text.tooltip;
    }
  }

  /**
   * Show the status bar with a message, as a live region so start, pause, and the wait for the
   * microphone are all announced (SC 4.1.3).
   * @param {string} message
   */
  _showStatusBar(message) {
    let bar = document.getElementById('assist-stt-recording-bar');

    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'assist-stt-recording-bar';
      bar.className = 'assist-stt-recording-bar';
      bar.setAttribute('role', 'status');
      bar.setAttribute('aria-live', 'polite');
      bar.setAttribute('aria-atomic', 'true');
      // In the tree first, text second: a live region that arrives already filled is often
      // not announced at all.
      document.body.appendChild(bar);
    }

    bar.classList.toggle('starting', this.state === 'starting');
    bar.classList.toggle('paused', this.state === 'paused');
    bar.textContent = message;

    requestAnimationFrame(() => {
      if (bar.parentElement && stateText(this.state).bar) {
        bar.classList.add('visible');
      }
    });
  }

  /**
   * Hide recording indicator
   */
  hideRecordingIndicator() {
    const bar = document.getElementById('assist-stt-recording-bar');
    if (bar) {
      bar.classList.remove('visible');
      setTimeout(() => {
        // Not if dictation started again inside the fade — this timer would otherwise delete the
        // bar that is now showing the new state.
        if (bar.parentElement && !bar.classList.contains('visible')) {
          bar.parentElement.removeChild(bar);
        }
      }, 300);
    }
  }

  /**
   * Show interim transcription results
   * @param {string} text - Interim transcript text
   */
  showInterimResult(text) {
    if (!text) {
      this.hideInterimDisplay();
      return;
    }

    let display = document.getElementById('assist-stt-interim-display');

    if (!display) {
      display = document.createElement('div');
      display.id = 'assist-stt-interim-display';
      display.className = 'assist-stt-interim-display';
      display.setAttribute('role', 'status');
      display.setAttribute('aria-live', 'polite');
      document.body.appendChild(display);
    }

    display.textContent = text;
    this._interimWanted = true;

    // Both the box and the button are position:fixed, so the button's viewport rectangle is used
    // as it is — no scroll offsets.
    const buttonRect = this.button.getBoundingClientRect();
    display.style.left = `${buttonRect.left}px`;
    display.style.bottom = `${window.innerHeight - buttonRect.top + 10}px`;

    requestAnimationFrame(() => {
      if (display.parentElement && this._interimWanted) {
        display.classList.add('visible');
      }
    });
  }

  /**
   * Hide interim display
   */
  hideInterimDisplay() {
    this._interimWanted = false;
    const display = document.getElementById('assist-stt-interim-display');
    if (display) {
      display.classList.remove('visible');
      setTimeout(() => {
        // Not if new words arrived inside the fade.
        if (display.parentElement && !display.classList.contains('visible')) {
          display.parentElement.removeChild(display);
        }
      }, 300);
    }
  }

  /**
   * Show tooltip
   */
  showTooltip() {
    if (!this.tooltip) {
      this.tooltip = document.createElement('div');
      this.tooltip.className = 'assist-stt-mic-tooltip';
      document.body.appendChild(this.tooltip);
    }

    this.tooltip.textContent = stateText(this.state).tooltip;

    // Fixed box, fixed button: viewport coordinates, no scroll offsets (the old maths sent the
    // tooltip hundreds of pixels away from the button as soon as the page scrolled).
    const buttonRect = this.button.getBoundingClientRect();
    this.tooltip.style.left = `${buttonRect.left + buttonRect.width / 2}px`;
    this.tooltip.style.bottom = `${window.innerHeight - buttonRect.top + 10}px`;
    this.tooltip.style.transform = 'translateX(-50%)';

    requestAnimationFrame(() => {
      if (this.tooltip) {
        this.tooltip.classList.add('visible');
      }
    });
  }

  /**
   * Hide tooltip
   */
  hideTooltip() {
    if (this.tooltip) {
      this.tooltip.classList.remove('visible');
    }
  }

  /**
   * Update button state from the recognition engine.
   * @param {Object} state - State object { isRecording, error }
   */
  updateState(state) {
    if (state.isRecording === true) {
      // Recognition really started — this is the only path to "Recording".
      this._clearStartTimer();
      if (this.state !== 'recording' && this.state !== 'paused') {
        this._setState('recording');
      }
    } else if (state.isRecording === false && this.state !== 'idle') {
      // Recognition ended on its own; the callbacks have already run, so do not call onStop.
      this._clearStartTimer();
      this._setState('idle');
      this.hideInterimDisplay();
    }

    if (state.error) {
      this.showError(state.error);
    }
  }

  /**
   * Something went wrong: flash, and return to idle so the button can be pressed again.
   * The message is reported to the student by the caller (once), not from here.
   * @param {string} message - Plain-language error message
   */
  showError(message) {
    console.error('[MicButton] Error:', message);

    this._clearStartTimer();
    this._setState('idle');
    this.hideInterimDisplay();

    this.button.style.background = 'linear-gradient(135deg, #b00020 0%, #7f0000 100%)';
    setTimeout(() => {
      if (this.button) {
        this.button.style.background = '';
      }
    }, 300);
  }

  /**
   * Cancel the wait-for-microphone timer.
   */
  _clearStartTimer() {
    if (this._startTimer) {
      clearTimeout(this._startTimer);
      this._startTimer = null;
    }
  }

  /**
   * Cleanup and destroy button
   */
  destroy() {
    this._clearStartTimer();
    this.state = 'idle';

    unwatchDictationShortcut(this._repaintShortcut);

    this._detachScrollListeners();
    this._detachFieldKeyHandler();
    this.hideTooltip();
    this.hideInterimDisplay();
    this.hideRecordingIndicator();

    if (this.button.parentElement) {
      this.button.parentElement.removeChild(this.button);
    }

    if (this.tooltip && this.tooltip.parentElement) {
      this.tooltip.parentElement.removeChild(this.tooltip);
    }

    const style = document.getElementById('assist-stt-mic-styles');
    if (style && style.parentElement) {
      style.parentElement.removeChild(style);
    }

    this.button = null;
    this.tooltip = null;
    this.targetField = null;

    console.log('[MicButton] Destroyed');
  }
}

/** Exposed so tests and callers share one definition of the wait. */
MicrophoneButton.START_TIMEOUT_MS = START_TIMEOUT_MS;

export default MicrophoneButton;
