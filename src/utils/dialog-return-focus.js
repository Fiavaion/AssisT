/**
 * Where focus lands when a dialog opened from the highlight menu closes.
 *
 * `trapFocus` restores focus to whatever was focused when the dialog opened. For a dialog
 * opened from the highlight menu there is nothing to restore to: the menu's buttons activate
 * on mousedown (before the browser has moved focus onto them) and the menu is removed the
 * instant the action runs, so the remembered element is either <body> or a node that no
 * longer exists. Focus then drops to the top of the page and the student has to Tab back
 * through everything they had already passed — SC 2.4.3.
 *
 * So after releasing the trap, the dialog hands focus back to the text the student selected.
 * Page prose is not focusable, so the container is made programmatically focusable for as
 * long as it holds focus and restored to the page's own markup on blur.
 *
 * @module utils/dialog-return-focus
 */

/**
 * The element a selection lives in, as a focus target.
 *
 * @param {Range|null} range - A (possibly cloned) selection range.
 * @returns {HTMLElement|null} The containing element, or null when there is nothing to use.
 */
export function selectionContainer(range) {
  if (!range) {
    return null;
  }
  const container = range.commonAncestorContainer;
  if (!container) {
    return null;
  }
  const element = container.nodeType === 3 ? container.parentElement : container;
  return element && element.nodeType === 1 ? element : null;
}

/**
 * Put focus back on `fallback` if closing the dialog left focus nowhere useful.
 *
 * Called after the focus trap has been released, so a dialog that did have a real opener to
 * return to keeps it — this only steps in when focus has landed on <body> or nothing at all.
 *
 * @param {HTMLElement|null} fallback - Element to focus, usually the selection's container.
 * @returns {void}
 */
export function returnFocusAfterDialog(fallback) {
  if (!fallback || typeof fallback.focus !== 'function') {
    return;
  }
  if (!document.body || !document.body.contains(fallback)) {
    return;
  }

  const active = document.activeElement;
  const focusIsLost = !active || active === document.body || !document.body.contains(active);
  if (!focusIsLost) {
    return;
  }

  const hadTabindex = fallback.hasAttribute('tabindex');
  if (!hadTabindex) {
    fallback.setAttribute('tabindex', '-1');
    fallback.addEventListener(
      'blur',
      () => {
        fallback.removeAttribute('tabindex');
      },
      { once: true }
    );
  }

  fallback.focus();
}

export default { selectionContainer, returnFocusAfterDialog };
