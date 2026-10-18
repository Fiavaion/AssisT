/**
 * Event Handler Utilities
 *
 * Provides robust event handling patterns to prevent race conditions
 * with document-level mousedown listeners.
 *
 * Why mousedown:
 * - Use mousedown instead of click to prevent race conditions
 * - Always call preventDefault() and stopPropagation()
 * - Provide visual feedback for accessibility
 * - Include error handling and debug logging
 *
 * The one exception is inline text living in a host page (annotation highlights, for
 * example): preventDefault() on mousedown cancels text selection, so a student can no
 * longer select or copy their own highlighted words. Those call sites pass
 * `allowTextSelection: true` — see attachInteractiveHandler below.
 *
 * @module utils/event-handlers
 */

// Configuration options
const DEFAULT_CONFIG = {
  enableVisualFeedback: true,
  feedbackScale: 1.05,
  enableLogging: true,
  logPrefix: '[EventHandler]',
  // Opt-out for inline text: activate on click, never preventDefault, and stand down
  // while the student has text selected. Default OFF — every other caller is unaffected.
  allowTextSelection: false,
};

/**
 * True when the user currently has a non-collapsed selection touching this element.
 *
 * A drag-select that ends inside the element still fires a click afterwards, and the
 * selection is still live at that moment (browsers only collapse it on the NEXT
 * mousedown). So reading the selection during the click is the authoritative way to
 * tell "finished selecting text" from "clicked the element".
 *
 * Exported so a feature that mirrors this guard in its own UI (the annotation delete cue)
 * asks the same question the activation path does, rather than keeping a second copy that
 * can drift and start promising a delete that will not happen.
 *
 * @param {HTMLElement} element - Element being activated
 * @returns {boolean} True if a selection intersects the element
 */
/**
 * Whether a keystroke is a particular letter, whatever the layout put on that key.
 *
 * `event.key` is the CHARACTER the layout produced, and with Alt held that is often not a letter at
 * all: on macOS Option+M produces µ, Option+R produces ® and Option+Shift+F produces Ï. Matching on
 * `event.key` alone, which is what every Alt shortcut here did, left them dead for every Mac student.
 * So the physical key is asked as well — `event.code` is the position, independent of the layout.
 *
 * One spelling, in one place, because three copies of it is three chances to fix two of them.
 *
 * @param {KeyboardEvent} event
 * @param {string} code - the physical key, e.g. 'KeyM'.
 * @param {string} letter - the lower-case letter it carries on a Latin layout, e.g. 'm'.
 * @returns {boolean}
 */
export function isChord(event, code, letter) {
  return event.key.toLowerCase() === letter || event.code === code;
}

export function hasSelectionOver(element) {
  try {
    const view = element.ownerDocument?.defaultView;
    const selection = view?.getSelection?.();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      return false;
    }

    for (let i = 0; i < selection.rangeCount; i++) {
      const range = selection.getRangeAt(i);
      if (range.collapsed) {
        continue;
      }
      if (typeof range.intersectsNode === 'function') {
        if (range.intersectsNode(element)) {
          return true;
        }
      } else if (element.contains(range.commonAncestorContainer)) {
        return true;
      }
    }
    return false;
  } catch {
    // A host page can hand us a detached or cross-document node; never block activation
    // because the selection could not be read.
    return false;
  }
}

/**
 * The control the pointer last activated through these helpers, until anything else happens.
 *
 * A mousedown that calls preventDefault() never moves the focus, so a dialog opened from a button
 * wired here finds <body> focused and has nothing to hand the focus back to when it closes
 * (SC 2.4.3). The focus trap asks for this element instead. The next pointer press, keystroke or
 * focus change anywhere in the document wipes it, so it only ever names the press that is
 * happening now, never an old one.
 * @type {HTMLElement|null}
 */
let pointerActivated = null;
const watchedDocuments = new WeakSet();

function forgetPointerActivation() {
  pointerActivated = null;
}

function rememberPointerActivation(element) {
  const doc = element.ownerDocument;
  if (doc && !watchedDocuments.has(doc)) {
    watchedDocuments.add(doc);
    // Capture phase, so a new press clears the old one before the pressed control records itself.
    for (const type of ['mousedown', 'keydown', 'focusin']) {
      doc.addEventListener(type, forgetPointerActivation, true);
    }
  }
  pointerActivated = element;
}

/**
 * The control being pressed with the pointer right now, if it is still on the page.
 * @returns {HTMLElement|null}
 */
export function pointerActivatedElement() {
  return pointerActivated && pointerActivated.isConnected ? pointerActivated : null;
}

/**
 * Attaches a robust interactive handler to an element.
 * Uses mousedown instead of click to prevent race conditions, unless the element is
 * selectable text (see options.allowTextSelection).
 *
 * @param {HTMLElement} element - Target element
 * @param {string} label - Debug label for logging
 * @param {Function} handler - Handler function (receives event)
 * @param {Object} options - Configuration options
 * @param {boolean} [options.allowTextSelection=false] - For inline text in a host page.
 *   Activates on click instead of mousedown and never calls preventDefault(), so the
 *   student can still select and copy the text; a click that merely ends a drag-select
 *   is ignored so the selection survives.
 * @returns {Function} Cleanup function to remove handlers
 *
 * @example
 * import { attachInteractiveHandler } from '../utils/event-handlers.js';
 *
 * const cleanup = attachInteractiveHandler(
 *   button,
 *   'Play Button',
 *   () => togglePlayback()
 * );
 *
 * // Later, to remove handlers:
 * cleanup();
 */
export function attachInteractiveHandler(element, label, handler, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };

  if (!element) {
    if (config.enableLogging) {
      console.warn(`${config.logPrefix} Element not found for: ${label}`);
    }
    return () => {};
  }

  // Selectable text activates on click (mousedown fires at the START of a drag, which
  // would open the editor the moment the student began selecting).
  const activationEvent = config.allowTextSelection ? 'click' : 'mousedown';

  const activationHandler = e => {
    // A click that merely finished a drag-select is not an activation.
    if (config.allowTextSelection && hasSelectionOver(element)) {
      return;
    }

    if (config.enableLogging) {
      console.log(`${config.logPrefix} ${label} triggered`);
    }

    // preventDefault() is what cancels text selection, so selectable text never calls it.
    if (!config.allowTextSelection) {
      e.preventDefault();
    }
    e.stopPropagation();
    rememberPointerActivation(element);

    try {
      handler(e);
    } catch (error) {
      console.error(`${config.logPrefix} ${label} error:`, error);
    }
  };

  // BUG-6 fix: use addEventListener instead of direct .onmousedown assignment
  // so we don't clobber existing handlers set by Canvas/Moodle on the same element.
  element.addEventListener(activationEvent, activationHandler);

  // Visual feedback for accessibility
  let mouseenterHandler = null;
  let mouseleaveHandler = null;
  if (config.enableVisualFeedback) {
    const originalTransform = element.style.transform || '';

    mouseenterHandler = () => {
      element.style.transform = `scale(${config.feedbackScale})`;
      element.style.cursor = 'pointer';
    };
    mouseleaveHandler = () => {
      element.style.transform = originalTransform;
    };

    element.addEventListener('mouseenter', mouseenterHandler);
    element.addEventListener('mouseleave', mouseleaveHandler);
  }

  // Return cleanup function
  return () => {
    element.removeEventListener(activationEvent, activationHandler);
    if (mouseenterHandler) {
      element.removeEventListener('mouseenter', mouseenterHandler);
    }
    if (mouseleaveHandler) {
      element.removeEventListener('mouseleave', mouseleaveHandler);
    }
  };
}

/**
 * Attaches handler without visual feedback (for subtle UI elements)
 *
 * @param {HTMLElement} element - Target element
 * @param {string} label - Debug label
 * @param {Function} handler - Handler function
 * @returns {Function} Cleanup function
 *
 * @example
 * // For elements where scale transform would look odd
 * attachQuietHandler(closeIcon, 'Close Icon', () => closeModal());
 */
export function attachQuietHandler(element, label, handler) {
  return attachInteractiveHandler(element, label, handler, {
    enableVisualFeedback: false,
  });
}

/**
 * Batch attaches handlers to multiple elements
 *
 * @param {Array<{element: HTMLElement, label: string, handler: Function}>} handlers
 * @param {Object} options - Shared configuration, forwarded to every handler
 *   (including allowTextSelection)
 * @returns {Function} Cleanup function for all handlers
 *
 * @example
 * const cleanup = attachHandlerBatch([
 *   { element: playBtn, label: 'Play', handler: play },
 *   { element: pauseBtn, label: 'Pause', handler: pause },
 *   { element: stopBtn, label: 'Stop', handler: stop }
 * ]);
 */
export function attachHandlerBatch(handlers, options = {}) {
  const cleanups = handlers.map(({ element, label, handler }) =>
    attachInteractiveHandler(element, label, handler, options)
  );

  return () => cleanups.forEach(cleanup => cleanup());
}

/**
 * Delegated handler for dynamically created elements, operable by keyboard (SC 2.1.1).
 *
 * Delegation here listens for `click` plus Enter/Space `keydown` on the container and
 * resolves the target with closest(). It does NOT use `mousedown` like the single-element
 * helpers above: a keyboard never produces one. Enter and Space on a native <button> fire
 * `click`, and a programmatic `.click()` fires `click` too, so a mousedown delegate is
 * dead to every keyboard-only student — which is exactly how the citation manager's Copy
 * and Open buttons shipped unreachable.
 *
 * The keydown path always calls preventDefault(), which is what stops the browser
 * synthesising the follow-up click on a native button — the handler runs once per
 * activation, whether it came from the mouse or the keyboard.
 *
 * Pass a selector list (`'.btn, .card'`) when nested targets overlap: closest() returns
 * the NEAREST match, so a hit on an inner button resolves to the button and not to the
 * card around it. Two separate delegates on one container would both fire instead.
 *
 * @param {HTMLElement} container - Parent container
 * @param {string} selector - CSS selector (or selector list) for target elements
 * @param {string} label - Debug label
 * @param {Function} handler - Handler function (receives event and matched element)
 * @returns {Function} Cleanup function
 *
 * @example
 * const cleanup = attachAccessibleDelegatedHandler(
 *   list,
 *   '.row-action, .row',
 *   'Result Row',
 *   (e, target) => activate(target)
 * );
 */
export function attachAccessibleDelegatedHandler(container, selector, label, handler) {
  if (!container) {
    console.warn(`[EventHandler] Container not found for delegated: ${label}`);
    return () => {};
  }

  const activate = (e, target) => {
    console.log(`[EventHandler] ${label} delegated to:`, target);
    e.preventDefault();
    e.stopPropagation();

    try {
      handler(e, target);
    } catch (error) {
      console.error(`[EventHandler] ${label} error:`, error);
    }
  };

  const matchedTarget = e => {
    const target = e.target?.closest?.(selector);
    return target && container.contains(target) ? target : null;
  };

  const clickHandler = e => {
    const target = matchedTarget(e);
    if (target) {
      activate(e, target);
    }
  };

  const keydownHandler = e => {
    if (e.key !== 'Enter' && e.key !== ' ') {
      return;
    }
    const target = matchedTarget(e);
    if (target) {
      activate(e, target);
    }
  };

  container.addEventListener('click', clickHandler);
  container.addEventListener('keydown', keydownHandler);

  return () => {
    container.removeEventListener('click', clickHandler);
    container.removeEventListener('keydown', keydownHandler);
  };
}

/**
 * Attaches handler with keyboard support for accessibility
 *
 * @param {HTMLElement} element - Target element
 * @param {string} label - Debug label
 * @param {Function} handler - Handler function
 * @param {Object} options - Configuration options, forwarded to attachInteractiveHandler
 *   (including allowTextSelection). Enter/Space activation is never selection-gated, so
 *   keyboard operability (SC 2.1.1) holds either way.
 * @returns {Function} Cleanup function
 *
 * @example
 * // For buttons that should respond to Enter and Space
 * attachAccessibleHandler(button, 'Submit Button', () => submitForm());
 */
export function attachAccessibleHandler(element, label, handler, options = {}) {
  const cleanup = attachInteractiveHandler(element, label, handler, options);

  if (!element) {
    return cleanup;
  }

  // Keyboard handler for Enter and Space
  const keydownHandler = e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      console.log(`[EventHandler] ${label} triggered (keyboard)`);

      try {
        handler(e);
      } catch (error) {
        console.error(`[EventHandler] ${label} error:`, error);
      }
    }
  };

  element.addEventListener('keydown', keydownHandler);

  // Return combined cleanup
  return () => {
    cleanup();
    element.removeEventListener('keydown', keydownHandler);
  };
}

export default {
  attachInteractiveHandler,
  attachQuietHandler,
  attachHandlerBatch,
  attachAccessibleDelegatedHandler,
  attachAccessibleHandler,
};
