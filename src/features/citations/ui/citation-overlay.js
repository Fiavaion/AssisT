/**
 * Citation modal overlay (content-script host).
 *
 * The single in-page modal that hosts the citation library and the capture/edit wizard. It replaces
 * the three retired god-class overlays (bibliography-manager, project-manager, citation-ui modal)
 * with one accessible container: a backdrop, a role="dialog" aria-modal surface, focus trapping +
 * restoration (via the shared trapFocus helper), Escape-to-close, and backdrop-click-to-close.
 *
 * Public API:
 *   openOverlay({ content, label, onClose, initialFocus }) -> { el, close() }
 */

import { injectCitationStyles } from './citation-styles.js';
import { trapFocus } from '../../../utils/focus-trap.js';
import { Z } from '../../../utils/z-index.js';

/**
 * Mount an element inside a modal overlay.
 * @param {Object} options
 * @param {HTMLElement} options.content - the element to show inside the dialog
 * @param {string} [options.label='Citations'] - accessible dialog label
 * @param {Function} [options.onClose] - called once when the overlay closes (any cause)
 * @param {HTMLElement} [options.initialFocus] - element to focus on open
 * @param {string} [options.describedBy] - id of the element that describes the dialog
 * @returns {{ el: HTMLElement, close: () => void }}
 */
export function openOverlay(options = {}) {
  const { content, label = 'Citations', onClose, initialFocus, describedBy } = options;

  injectCitationStyles();

  const backdrop = document.createElement('div');
  backdrop.className = 'assist-cite-root assist-cite-overlay-backdrop';
  backdrop.style.zIndex = String(Z.MODAL);

  const dialog = document.createElement('div');
  dialog.className = 'assist-cite-overlay-dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', label);
  if (describedBy) {
    dialog.setAttribute('aria-describedby', describedBy);
  }

  if (content) {
    dialog.appendChild(content);
  }
  backdrop.appendChild(dialog);

  let closed = false;
  let release = () => {};

  function close() {
    if (closed) {
      return;
    }
    closed = true;
    release();
    backdrop.remove();
    if (typeof onClose === 'function') {
      onClose();
    }
  }

  // Backdrop click (outside the dialog) closes — a deliberate, undo-safe dismissal.
  backdrop.addEventListener('mousedown', e => {
    if (e.target === backdrop) {
      close();
    }
  });

  (document.body || document.documentElement).appendChild(backdrop);

  // Trap focus inside the dialog and close on Escape; focus is restored to the trigger on release.
  release = trapFocus(dialog, { onEscape: close, initialFocus });

  return { el: backdrop, close };
}

export default { openOverlay };
