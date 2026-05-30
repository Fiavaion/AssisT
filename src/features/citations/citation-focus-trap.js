/**
 * Shared focus-trap helper for citation dialogs.
 *
 * WCAG 2.2 SC 2.1.2 (No Keyboard Trap) + 2.4.3 (Focus Order): a modal dialog must keep Tab
 * focus within itself and restore focus to the triggering element on close. None of the
 * citation dialogs (edit modal, bibliography manager, project manager, source-evaluator) did
 * this. This helper is local to the citations feature (does not touch global utils).
 *
 * Usage:
 *   const release = trapFocus(modalEl, { onEscape: () => close() });
 *   // ...on close:
 *   release();   // removes the listener and returns focus to the previously focused element
 */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

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
    return el.offsetParent !== null || el === document.activeElement;
  });
}

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
  const previouslyFocused = document.activeElement;
  let released = false;

  function onKeydown(e) {
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
    const active = document.activeElement;

    if (e.shiftKey && (active === first || !container.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  container.addEventListener('keydown', onKeydown);

  // Move focus into the dialog (after the current paint so the node is laid out).
  const target = initialFocus || getFocusable(container)[0] || container;
  setTimeout(() => {
    if (target && typeof target.focus === 'function') {
      target.focus();
    }
  }, 0);

  return function release() {
    if (released) {
      return;
    }
    released = true;
    container.removeEventListener('keydown', onKeydown);
    if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
      try {
        previouslyFocused.focus();
      } catch {
        /* element may be gone; ignore */
      }
    }
  };
}

export default { trapFocus };
