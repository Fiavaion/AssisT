/**
 * Shared focus-trap helper for modal dialogs.
 *
 * WCAG 2.2 SC 2.1.2 (No Keyboard Trap) + 2.4.3 (Focus Order): a modal dialog must keep Tab
 * focus within itself and restore focus to the triggering element on close. None of the
 * dialogs did this. Grown out of the citations feature into a shared utility once the OCR and
 * annotation modals needed the same guarantee — one implementation, no per-feature copies.
 *
 * Usage:
 *   const release = trapFocus(modalEl, { onEscape: () => close() });
 *   // ...on close:
 *   release();   // removes the listener and returns focus to the previously focused element
 */

import { pointerActivatedElement } from './event-handlers.js';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * The focused element as the container sees it. Inside a shadow root, `document.activeElement` is
 * the shadow host, so the root's own `activeElement` is the one that can be inside the container.
 * @param {HTMLElement} container
 * @returns {Element|null}
 */
function activeElementFor(container) {
  const root = typeof container.getRootNode === 'function' ? container.getRootNode() : null;
  if (root && root !== document && 'activeElement' in root) {
    return root.activeElement;
  }
  return document.activeElement;
}

/**
 * Visible, focusable descendants of a container, in DOM order.
 * @param {HTMLElement} container
 * @returns {HTMLElement[]}
 */
function getFocusable(container) {
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(el => {
    if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') {
      return false;
    }
    // offsetParent is null for display:none; allow the active element through regardless.
    return el.offsetParent !== null || el === activeElementFor(container);
  });
}

/**
 * Every trap currently held, oldest first. The keydown listener is document-wide, so without
 * this a dialog opened over another dialog would have both traps answer the same Escape.
 * @type {object[]}
 */
const activeTraps = [];

/**
 * Trap Tab focus inside `container` and (optionally) call `onEscape` on the Escape key.
 * Moves initial focus into the dialog and restores focus on release.
 *
 * @param {HTMLElement} container
 * @param {{onEscape?: Function, initialFocus?: HTMLElement}} [options]
 * @returns {() => void} release function (idempotent)
 */
export function trapFocus(container, options = {}) {
  const { onEscape, initialFocus } = options;
  // A button pressed with the mouse through the shared helpers never takes the focus (its
  // mousedown is cancelled), so <body> is what looks focused. The button is the real opener, and
  // the place a keyboard or screen-reader user expects to be put back. Anything else that held the
  // focus, such as the field the student was typing in, keeps its claim.
  const active = document.activeElement;
  const focusWasNowhere = !active || active === document.body;
  const previouslyFocused = (focusWasNowhere && pointerActivatedElement()) || active;
  const token = {};
  let released = false;

  function onKeydown(e) {
    // The listener is document-wide, so a dialog torn out of the DOM without its release()
    // being called must not go on swallowing the page's keys.
    if (!container.isConnected || activeTraps[activeTraps.length - 1] !== token) {
      return;
    }
    if (e.key === 'Escape') {
      if (typeof onEscape === 'function') {
        e.preventDefault();
        onEscape();
      }
      return;
    }
    if (e.key !== 'Tab') {
      return;
    }
    const focusable = getFocusable(container);
    if (focusable.length === 0) {
      e.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = activeElementFor(container);

    // Focus outside the dialog is the case this trap kept missing: a re-render removes the
    // focused control, focus falls to <body>, and <body> is neither end of the list. Pull it
    // back in rather than letting the next Tab walk onto the page behind the dialog.
    if (!container.contains(active)) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
      return;
    }

    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // On the document, not the container: keydown from <body> or from a control on the page
  // behind the dialog never reaches a container listener, which is how Tab escaped.
  document.addEventListener('keydown', onKeydown);
  activeTraps.push(token);

  // Move focus into the dialog (after the current paint so the node is laid out).
  const target = initialFocus || getFocusable(container)[0] || container;
  const focusTimer = setTimeout(() => {
    if (target && typeof target.focus === 'function') {
      target.focus();
    }
  }, 0);

  return function release() {
    if (released) {
      return;
    }
    released = true;
    // Cancel the pending initial-focus if the dialog closed before it fired,
    // so focus isn't yanked into a now-detached node.
    clearTimeout(focusTimer);
    document.removeEventListener('keydown', onKeydown);
    const held = activeTraps.indexOf(token);
    if (held !== -1) {
      activeTraps.splice(held, 1);
    }
    if (
      previouslyFocused &&
      previouslyFocused.isConnected &&
      typeof previouslyFocused.focus === 'function'
    ) {
      try {
        previouslyFocused.focus();
      } catch {
        /* element may be gone; ignore */
      }
    }
  };
}

export default { trapFocus };
