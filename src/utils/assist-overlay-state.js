/**
 * Is one of AssisT's own surfaces open on top of the page?
 *
 * The Escape key needs an order. AssisT's page-wide reading aids — the magnifier and the reading
 * guide — have no surface of their own: they are switched on for a whole reading session and are
 * always the bottom of the Escape stack. Without a check like this one they answered the same
 * Escape as the dialog above them, so closing a summary panel also switched the magnifier and the
 * guide off, and the student had to go back to the popup for both.
 *
 * The rule: a page-wide aid ignores Escape while any AssisT dialog, alert dialog or menu is open,
 * and acts on it only when nothing is above it. This mirrors `modalIsOpen` in the mind map page
 * (src/pages/mind-map/mindmap.js), which guards that page's bare keys the same way.
 *
 * Only AssisT's own surfaces count. A host page's dialog is the host page's business, and AssisT
 * cannot know whether that page wants Escape.
 *
 * @module utils/assist-overlay-state
 */

/** Anything that owns the Escape key while it is open. */
const SURFACE_SELECTOR = 'dialog[open], [role="dialog"], [role="alertdialog"], [role="menu"]';

/** AssisT names every injected element with an `assist-` id or class. */
const ASSIST_OWNER_SELECTOR = '[id^="assist-"], [class*="assist-"]';

/**
 * An element hidden from assistive technology, or made inert, is not an open surface. This also
 * excludes the magnifier's own magnified copy of the page, which duplicates every dialog on it
 * inside an `aria-hidden`, `inert` container.
 *
 * @param {Element} element
 * @returns {boolean}
 */
function isHidden(element) {
  if (!element.isConnected || element.hidden) {
    return true;
  }
  if (element.closest('[aria-hidden="true"], [inert], [hidden]')) {
    return true;
  }
  // The walk up the ancestors is the whole point. `getComputedStyle` reports the element's OWN
  // display, never an ancestor's, so a menu sitting inside a container that was closed with
  // `display: none` reads as perfectly open. That is not a hypothetical: the annotation sidebar's
  // export menu is built once and then hidden by its container, and it stays in the page. So from
  // the first time a student opened that menu, the reading guide and the magnifier believed a menu
  // was open forever, and stopped answering Escape for the rest of the session.
  let node = element;
  while (node && node.nodeType === 1) {
    if (node.hidden) {
      return true;
    }
    const inline = node.style;
    if (inline && (inline.display === 'none' || inline.visibility === 'hidden')) {
      return true;
    }
    try {
      const computed = window.getComputedStyle(node);
      if (computed.display === 'none' || computed.visibility === 'hidden') {
        return true;
      }
    } catch {
      // A node we cannot measure is not evidence of anything; keep walking.
    }
    node = node.parentElement;
  }
  return false;
}

/**
 * Whether an AssisT dialog, alert dialog or menu is currently open on the page.
 *
 * @returns {boolean}
 */
export function assistOverlayIsOpen() {
  try {
    return Array.from(document.querySelectorAll(SURFACE_SELECTOR)).some(
      element => element.closest(ASSIST_OWNER_SELECTOR) && !isHidden(element)
    );
  } catch {
    // A page with no document to query cannot have one of our dialogs open on it.
    return false;
  }
}

export default { assistOverlayIsOpen };
