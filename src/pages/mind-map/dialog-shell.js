/**
 * The bones every dialog on this page shares: a named modal that gives the keyboard back.
 *
 * A `<dialog>` closes itself on Escape and does not put focus anywhere afterwards, so a student
 * who dismissed a modal with the keyboard lands on `<body>` — the top of the page, their place
 * lost. Every way out is the same way out here, because the restore hangs off the element's own
 * `close` event rather than off the buttons that happen to call it.
 *
 * Layout and palette are the page's, in `mindmap.css` under `.assist-mm-dialog`.
 *
 * @module pages/mind-map/dialog-shell
 */

/**
 * Build an empty modal inside a host element.
 *
 * @param {HTMLElement} host - the dialog is appended to it, never replacing what is there.
 * @param {Object} options
 * @param {string} options.name - the `data-dialog` value, and the stem of the heading's id.
 * @param {string} options.title - the visible heading, which is also the accessible name.
 * @returns {{
 *   element: HTMLDialogElement,
 *   open: (focusTarget?: HTMLElement) => void,
 *   close: () => void,
 *   isOpen: () => boolean,
 *   destroy: () => void
 * }}
 */
export function createDialogShell(host, { name, title }) {
  const doc = host.ownerDocument;

  const element = doc.createElement('dialog');
  element.className = 'assist-mm-dialog';
  element.dataset.dialog = name;

  const heading = doc.createElement('h2');
  heading.id = `assist-mm-${name}-title`;
  heading.className = 'assist-mm-dialog__title';
  heading.textContent = title;
  element.setAttribute('aria-labelledby', heading.id);
  element.appendChild(heading);

  host.appendChild(element);

  /** What had the keyboard when the dialog opened, so it can be given back. */
  let opener = null;

  const onClose = () => {
    if (opener && opener.isConnected) {
      opener.focus();
    }
    opener = null;
  };
  element.addEventListener('close', onClose);

  return {
    element,

    /**
     * Show the modal.
     * @param {HTMLElement} [focusTarget] - where the keyboard goes; the browser's own default is
     *   the first focusable child, which is rarely the field the student came here to fill in.
     */
    open(focusTarget) {
      if (element.open) {
        return;
      }
      const active = doc.activeElement;
      opener = active && active !== doc.body ? active : null;
      element.showModal();
      if (focusTarget) {
        focusTarget.focus();
      }
    },

    close() {
      if (element.open) {
        element.close();
      }
    },

    /** @returns {boolean} */
    isOpen() {
      return element.open;
    },

    destroy() {
      element.removeEventListener('close', onClose);
      element.remove();
    },
  };
}
