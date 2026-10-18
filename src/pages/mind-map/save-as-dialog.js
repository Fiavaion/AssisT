/**
 * Save a copy of this map under a new name.
 *
 * The name is prefilled from the map it was opened over and selected, so the common case is one
 * keystroke to accept and the uncommon one is typing over a selection rather than clearing a box.
 *
 * It owns no database: where the copy is written, and what happens to the map it was taken from,
 * are the page's business. A refusal comes back as a message with the dialog still open and the
 * typing still in it.
 *
 * @module pages/mind-map/save-as-dialog
 */

import { attachAccessibleHandler } from '../../utils/event-handlers.js';

import { createDialogShell } from './dialog-shell.js';

/**
 * Mount the save-as dialog.
 *
 * @param {HTMLElement} host - the dialog is appended to it.
 * @param {Object} options
 * @param {(title: string) => Promise<void>} options.onSaveAs - a rejection keeps the dialog open
 *   and shows its message.
 * @returns {{
 *   open: (currentTitle: string) => void,
 *   close: () => void,
 *   isOpen: () => boolean,
 *   destroy: () => void
 * }}
 */
export function mountSaveAsDialog(host, { onSaveAs }) {
  const doc = host.ownerDocument;
  const shell = createDialogShell(host, { name: 'save-as', title: 'Save a copy' });
  const cleanups = [];

  const el = (tag, className, text) => {
    const node = doc.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text !== undefined) {
      node.textContent = text;
    }
    return node;
  };

  const form = doc.createElement('form');

  const body = el(
    'p',
    'assist-mm-dialog__body',
    'The copy is a map of its own. This one is saved and left as it is.'
  );

  const label = el('label', 'assist-mm-field__label', 'Name for the copy');
  label.htmlFor = 'assist-mm-save-as-input';
  const input = doc.createElement('input');
  input.type = 'text';
  input.id = 'assist-mm-save-as-input';
  input.className = 'assist-mm-field__input';
  // No `required`, for the reason set out in new-map-dialog.js: the handler owns the refusal, so
  // an empty box and a box holding two spaces are answered in the same words by the same code.

  // A live region, so the refusal is spoken as it appears; `aria-describedby` reads it again to
  // anyone arriving at the box afterwards. The page's toast is behind the modal, unheard.
  const hint = el('p', 'assist-mm-dialog__hint');
  hint.id = 'assist-mm-save-as-hint';
  hint.setAttribute('role', 'status');
  input.setAttribute('aria-describedby', hint.id);

  const actions = el('div', 'assist-mm-dialog__actions');
  const cancel = el('button', 'assist-mm-button', 'Cancel');
  cancel.type = 'button';
  cancel.dataset.command = 'cancel';
  cancel.dataset.action = 'cancel';
  const save = el('button', 'assist-mm-button assist-mm-button--primary', 'Save the copy');
  save.type = 'submit';
  actions.append(cancel, save);

  form.append(body, label, input, hint, actions);
  shell.element.appendChild(form);

  cleanups.push(attachAccessibleHandler(cancel, 'Cancel save as', () => shell.close()));

  const onSubmit = async event => {
    event.preventDefault();
    const title = input.value.trim();
    if (!title) {
      hint.textContent = 'Give the copy a title so you can find it again.';
      input.focus();
      return;
    }
    try {
      await onSaveAs(title);
      shell.close();
    } catch (problem) {
      hint.textContent = problem?.message || 'The copy could not be saved.';
      // Said by the live region, and put in front of whoever is driving by pointer or by caret.
      input.focus();
    }
  };
  form.addEventListener('submit', onSubmit);

  return {
    /**
     * Show the dialog over a map.
     * @param {string} currentTitle - the name the copy starts from.
     */
    open(currentTitle) {
      if (shell.isOpen()) {
        // A second press of the same command must not wipe what is already being typed.
        input.focus();
        return;
      }
      input.value = `${String(currentTitle || 'Mind map').trim()} copy`;
      hint.textContent = '';
      shell.open(input);
      // Selected rather than merely focused: the student who wants a different name types over it,
      // and the one who wants this name presses Enter.
      input.select();
    },

    close: shell.close,
    isOpen: shell.isOpen,

    destroy() {
      for (const cleanup of cleanups) {
        cleanup();
      }
      form.removeEventListener('submit', onSubmit);
      shell.destroy();
    },
  };
}
