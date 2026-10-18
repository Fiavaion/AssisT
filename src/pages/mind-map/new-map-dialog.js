/**
 * Starting a map: a title, and what to start it from.
 *
 * There is one of this dialog and two places it is reached from — the library's New map button and
 * the editor's File menu. It was written twice for a while, and two dialogs that must agree on the
 * template list, the ids the browser suite types into and the words a student reads is one dialog
 * with a second copy waiting to drift.
 *
 * It owns no database. The caller says what happens with the title and the template it collected,
 * and a refusal comes back as a message the student can act on with the dialog still open.
 *
 * @module pages/mind-map/new-map-dialog
 */

import { TEMPLATES } from '../../features/mindMap/core/templates.js';
import { attachAccessibleHandler } from '../../utils/event-handlers.js';

import { createDialogShell } from './dialog-shell.js';

/** Radio group name for the template picker. */
const TEMPLATE_FIELD = 'assist-mm-template';

/**
 * Mount the new-map dialog.
 *
 * @param {HTMLElement} host - the dialog is appended to it.
 * @param {Object} options
 * @param {(templateId: string, title: string) => Promise<void>} options.onCreate - a rejection
 *   keeps the dialog open and shows its message.
 * @returns {{ open: () => void, close: () => void, isOpen: () => boolean, destroy: () => void }}
 */
export function mountNewMapDialog(host, { onCreate }) {
  const doc = host.ownerDocument;
  const shell = createDialogShell(host, { name: 'new', title: 'Start a new map' });
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

  const label = el('label', 'assist-mm-field__label', 'What is the map about?');
  label.htmlFor = 'assist-mm-new-input';
  const input = doc.createElement('input');
  input.type = 'text';
  input.id = 'assist-mm-new-input';
  input.className = 'assist-mm-field__input';
  // No `required`: the browser's own bubble would answer an empty box and this handler would
  // answer a box holding two spaces, which is two refusals worded differently and only one of
  // them under our control. The handler owns the whole of it, so there is one path and one
  // sentence whatever the student typed.

  // A live region, so the refusal is spoken as it appears; `aria-describedby` then reads it again
  // to anyone who arrives at the box afterwards. `role="alert"` would interrupt mid-sentence, and
  // the page's own toast and live region are behind the modal where nobody hears them.
  const hint = el('p', 'assist-mm-dialog__hint');
  hint.id = 'assist-mm-new-hint';
  hint.setAttribute('role', 'status');
  input.setAttribute('aria-describedby', hint.id);

  const templates = doc.createElement('fieldset');
  templates.className = 'assist-mm-templates';
  templates.appendChild(el('legend', 'assist-mm-templates__legend', 'Start from'));
  TEMPLATES.forEach((template, at) => {
    const option = el('div', 'assist-mm-templates__option');
    const radio = doc.createElement('input');
    radio.type = 'radio';
    radio.name = TEMPLATE_FIELD;
    radio.value = template.id;
    radio.id = `assist-mm-template-${template.id}`;
    radio.checked = at === 0;
    const optionLabel = el('label', 'assist-mm-templates__label');
    optionLabel.htmlFor = radio.id;
    optionLabel.appendChild(el('span', 'assist-mm-templates__name', template.name));
    optionLabel.appendChild(el('span', 'assist-mm-templates__description', template.description));
    option.append(radio, optionLabel);
    templates.appendChild(option);
  });

  const actions = el('div', 'assist-mm-dialog__actions');
  const cancel = el('button', 'assist-mm-button', 'Cancel');
  cancel.type = 'button';
  cancel.dataset.command = 'cancel';
  cancel.dataset.action = 'cancel';
  const create = el('button', 'assist-mm-button assist-mm-button--primary', 'Create map');
  create.type = 'submit';
  actions.append(cancel, create);

  form.append(label, input, hint, templates, actions);
  shell.element.appendChild(form);

  cleanups.push(attachAccessibleHandler(cancel, 'Cancel new map', () => shell.close()));

  const onSubmit = async event => {
    event.preventDefault();
    const title = input.value.trim();
    if (!title) {
      hint.textContent = 'Give the map a title so you can find it again.';
      input.focus();
      return;
    }
    const chosen = form.querySelector(`input[name="${TEMPLATE_FIELD}"]:checked`);
    try {
      await onCreate(chosen.value, title);
      shell.close();
    } catch (problem) {
      hint.textContent = problem?.message || 'The map could not be created.';
      // Said by the live region, and put in front of whoever is driving by pointer or by caret.
      input.focus();
    }
  };
  form.addEventListener('submit', onSubmit);

  return {
    /** Show the dialog, empty: the last title and the last complaint are not this map's. */
    open() {
      if (shell.isOpen()) {
        // A second press of the same command must not wipe what is already being typed.
        input.focus();
        return;
      }
      input.value = '';
      hint.textContent = '';
      shell.open(input);
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
