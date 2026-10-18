/**
 * The dialog that names a collection.
 *
 * One dialog serves both jobs a collection needs: creating a new one, and renaming an existing one.
 * They ask the same two questions, so they are the same form with different words on the heading and
 * the submit button — a second, near-identical dialog would be a second thing to keep accessible.
 *
 * It is mounted through the shared citation overlay, which supplies role="dialog", aria-modal, the
 * shared focus trap (Tab stays inside, Escape closes, focus returns to whatever opened it) and
 * click-outside-to-dismiss. Dismissing is always safe: nothing is written until the student submits.
 *
 * Public API:
 *   showCollectionDialog({ heading, name, description, submitLabel, takenNames })
 *     -> Promise<{name, description}|null>
 */

import { openOverlay } from '../../features/citations/ui/citation-overlay.js';
import { attachAccessibleHandler } from '../../utils/event-handlers.js';

/** Distinguishes the ids of two dialogs opened in one session (labels must point at their own field). */
let dialogSeq = 0;

/**
 * Build one labelled field with an optional hint.
 * @param {Object} spec
 * @returns {{ wrap: HTMLElement, control: HTMLElement }}
 */
function buildField({ id, label, value, hint, multiline }) {
  const wrap = document.createElement('div');
  wrap.className = 'assist-cite-step__field-wrap';

  const labelEl = document.createElement('label');
  labelEl.className = 'assist-cite-step__label';
  labelEl.setAttribute('for', id);
  labelEl.textContent = label;
  wrap.appendChild(labelEl);

  const control = document.createElement(multiline ? 'textarea' : 'input');
  control.id = id;
  control.className = 'assist-cite-step__field';
  if (multiline) {
    control.rows = 2;
  } else {
    control.type = 'text';
  }
  control.value = value || '';
  wrap.appendChild(control);

  if (hint) {
    const hintEl = document.createElement('p');
    hintEl.className = 'assist-cite-step__hint';
    hintEl.id = `${id}-hint`;
    hintEl.textContent = hint;
    control.setAttribute('aria-describedby', hintEl.id);
    wrap.appendChild(hintEl);
  }

  return { wrap, control };
}

/**
 * Open the collection dialog and resolve with what the student entered, or null if they backed out.
 *
 * @param {Object} [options]
 * @param {string} [options.heading='New collection'] - dialog title and accessible name
 * @param {string} [options.name=''] - existing name, prefilled when renaming
 * @param {string} [options.description=''] - existing description, prefilled when renaming
 * @param {string} [options.submitLabel='Create'] - label on the confirming button
 * @param {string[]} [options.takenNames=[]] - names of the OTHER collections; a match, ignoring case
 *   and surrounding spaces, is refused. A rename leaves its own collection out, so changing only the
 *   case of a name is allowed.
 * @returns {Promise<{name: string, description: string}|null>}
 */
export function showCollectionDialog(options = {}) {
  const {
    heading = 'New collection',
    name = '',
    description = '',
    submitLabel = 'Create',
    takenNames = [],
  } = options;
  // Two collections with one name are indistinguishable in the rail and in every card's picker.
  // Compared trimmed and case-blind, so "essay " is taken by "Essay".
  const nameKey = value => value.trim().toLowerCase();
  const taken = new Map(takenNames.map(taken => [nameKey(taken), taken]));

  return new Promise(resolve => {
    const uid = `assist-lib-collection-${++dialogSeq}`;
    let settled = false;
    let overlay = null;

    const finish = result => {
      if (settled) {
        return;
      }
      settled = true;
      cancelCleanup();
      submitCleanup();
      form.removeEventListener('submit', onSubmit);
      nameField.control.removeEventListener('input', clearError);
      if (overlay) {
        overlay.close();
      }
      resolve(result);
    };

    const form = document.createElement('form');
    form.className = 'assist-cite-root assist-cite-collection-form';
    form.noValidate = true;

    const headingEl = document.createElement('h2');
    headingEl.className = 'assist-cite-step__legend';
    headingEl.id = `${uid}-heading`;
    headingEl.textContent = heading;
    form.appendChild(headingEl);

    const nameField = buildField({
      id: `${uid}-name`,
      label: 'Name',
      value: name,
      hint: 'One assignment or module, so you can narrow the library to it later.',
    });
    form.appendChild(nameField.wrap);

    // The error is announced where the problem is, in plain language, rather than as an alert box
    // the student has to dismiss before they can fix anything (SC 3.3.1 / 3.3.3).
    const error = document.createElement('p');
    error.className = 'assist-cite-step__error';
    error.id = `${uid}-error`;
    error.setAttribute('role', 'alert');
    error.hidden = true;
    nameField.wrap.appendChild(error);

    const descriptionField = buildField({
      id: `${uid}-description`,
      label: 'Description (optional)',
      value: description,
      multiline: true,
    });
    form.appendChild(descriptionField.wrap);

    const nav = document.createElement('div');
    nav.className = 'assist-cite-step__nav';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'assist-cite-btn assist-cite-btn--ghost';
    cancelBtn.textContent = 'Cancel';

    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'assist-cite-btn assist-cite-btn--primary';
    submitBtn.textContent = submitLabel;

    nav.appendChild(cancelBtn);
    nav.appendChild(submitBtn);
    form.appendChild(nav);

    /** Take the error down the moment the student starts fixing it. */
    function clearError() {
      if (!error.hidden) {
        error.hidden = true;
        error.textContent = '';
        nameField.control.removeAttribute('aria-invalid');
        nameField.control.removeAttribute('aria-errormessage');
      }
    }
    nameField.control.addEventListener('input', clearError);

    /** Say what is wrong at the Name field, and put the student back in it to fix it. */
    function refuse(message) {
      error.textContent = message;
      error.hidden = false;
      nameField.control.setAttribute('aria-invalid', 'true');
      nameField.control.setAttribute('aria-errormessage', error.id);
      nameField.control.focus();
    }

    function submit() {
      const typedName = nameField.control.value.trim();
      if (!typedName) {
        refuse('Please give the collection a name before saving it.');
        return;
      }
      const clash = taken.get(nameKey(typedName));
      if (clash !== undefined) {
        refuse(`You already have a collection called “${clash}”. Please choose a different name.`);
        return;
      }
      finish({ name: typedName, description: descriptionField.control.value.trim() });
    }

    // Enter anywhere in the form submits, which is what a two-field dialog should do.
    const onSubmit = event => {
      event.preventDefault();
      submit();
    };
    form.addEventListener('submit', onSubmit);

    const cancelCleanup = attachAccessibleHandler(cancelBtn, 'Cancel', () => finish(null));
    const submitCleanup = attachAccessibleHandler(submitBtn, submitLabel, submit);

    overlay = openOverlay({
      content: form,
      label: heading,
      initialFocus: nameField.control,
      onClose: () => finish(null),
    });
  });
}

export default { showCollectionDialog };
