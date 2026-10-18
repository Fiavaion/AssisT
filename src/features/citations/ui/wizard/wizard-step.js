/**
 * Wizard Step
 *
 * Renders one executive-function-labelled step of the citation wizard: a plain-language legend
 * (the question — "Where did you find it?"), a short help line, and a small set of fields with
 * real labels, ghost-text examples, and per-field hints. Keeping each step to one concept reduces
 * the working-memory load of citing a source.
 *
 * Each field carries a real <label> (placeholders are examples, never the label — SC 3.3.2), is
 * described by its hint via aria-describedby, and surfaces validation as a plain-language,
 * role="alert" message tied to the field with aria-invalid + aria-describedby (SC 3.3.1 / 3.3.3).
 *
 * Public API:
 *   createWizardStep({ id, legend, help, fields, draft, onChange })
 *     -> { id, el, getControl(key), hasField(key), showError(key, message), clearErrors(),
 *          focusField(key), validate(), refresh(draft), destroy() }
 *
 * A field descriptor:
 *   { key, label, type?: 'text'|'textarea'|'select'|'select-other'|'authors'|'names'|'tags',
 *     placeholder?, hint?, required?, options?, showWhen?, otherLabel?, otherFieldLabel?,
 *     otherPlaceholder?, organisationsKey? }
 *   - `key` is a path into the draft, so 'extra.edition' reads and writes draft.extra.edition.
 *   - 'authors' renders a textarea (one name per line) and reads/writes an array of the lines
 *     exactly as typed; 'names' does the same but canonicalises each line to "Family, Given",
 *     accepting "Smith, A. and Jones, B." on one line as two names. An 'authors' field with an
 *     `organisationsKey` also shows one labelled checkbox per name, in a group of its own, for
 *     saying which of them are organisations; the ticked names are written to that key. A box is
 *     ticked only from the draft (what a capture or lookup said), never guessed from a typed name.
 *   - 'tags' renders a one-line input of comma-separated tags and reads/writes an array.
 *   - 'select' uses `options: [{ value, label }]`; 'select-other' adds a final "something else"
 *     option that reveals a labelled text box, so one stored value covers both the list and an
 *     answer that is not on it.
 *   - `label`, `hint` and `placeholder` may each be a function of the draft, for a field whose
 *     wording depends on the kind of source ("Site or journal name" / "Book title").
 *   - `showWhen(draft)` hides the field's row — out of the tab order and the accessibility tree —
 *     when it does not apply. What was typed stays in the box and in the draft, so a source type
 *     picked by mistake costs nothing.
 *   onChange(key, value) fires live as the user types/picks, so the draft stays current for the
 *   CHECK step's live preview and so navigating back and forth never loses an entry.
 */

import { splitAuthorList } from '../../author-names.js';

let stepSeq = 0;

/** The value a 'select-other' select carries while its own text box holds the answer. */
export const OTHER_OPTION = '__other__';

/**
 * Resolve a descriptor property that is allowed to depend on the draft.
 * @param {*} value - a literal, or a function of the draft
 * @param {Object} draft
 * @returns {*}
 */
function resolve(value, draft) {
  return typeof value === 'function' ? value(draft) : value;
}

/**
 * Read a draft value by field key, which may be a path ('extra.edition').
 * @param {Object} draft
 * @param {string} key
 * @returns {*}
 */
function readAt(draft, key) {
  return String(key)
    .split('.')
    .reduce((obj, part) => (obj === undefined || obj === null ? undefined : obj[part]), draft);
}

/**
 * Read a field's current value out of its control(s), typed per the descriptor.
 * @param {Object} field
 * @param {{ control: HTMLElement, otherControl: HTMLElement|null }} entry
 * @returns {string|string[]}
 */
function readValue(field, entry) {
  const { control } = entry;
  if (field.type === 'authors' || field.type === 'names') {
    const lines = control.value
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
    // A student writing editors out longhand puts them on one line joined by "and"; splitting
    // there too means the list is right whichever way they wrote it.
    return field.type === 'names' ? lines.flatMap(line => splitAuthorList(line)) : lines;
  }
  if (field.type === 'select-other') {
    return control.value === OTHER_OPTION ? entry.otherControl.value : control.value;
  }
  if (field.type === 'tags') {
    // Commas are how people already write a list, so that is what the box accepts. Blanks and
    // repeats are dropped rather than stored: a tag with no name filters nothing.
    return [
      ...new Set(
        control.value
          .split(',')
          .map(tag => tag.trim())
          .filter(Boolean)
      ),
    ];
  }
  return control.value;
}

/**
 * Write a draft value into a field's control(s).
 * @param {Object} field
 * @param {{ control: HTMLElement, otherControl: HTMLElement|null }} entry
 * @param {Object} draft
 */
function writeValue(field, entry, draft) {
  const { control } = entry;
  const value = readAt(draft, field.key);
  if (field.type === 'authors' || field.type === 'names') {
    control.value = (Array.isArray(value) ? value : []).join('\n');
    return;
  }
  if (field.type === 'tags') {
    control.value = (Array.isArray(value) ? value : []).join(', ');
    return;
  }
  const text = value === undefined || value === null ? '' : String(value);
  if (field.type === 'select-other') {
    // A saved answer that is not on the list belongs in the text box, with the list on "something
    // else" — otherwise reopening a record would silently drop the degree the student typed.
    const listed = (field.options || []).some(opt => String(opt.value) === text);
    const isOther = Boolean(text) && !listed;
    control.value = isOther ? OTHER_OPTION : text;
    entry.otherControl.value = isOther ? text : '';
    return;
  }
  control.value = text;
}

/**
 * The "which of these are organisations?" group under an authors box: one native checkbox per
 * author line, each labelled with the name, so it is reached with Tab and toggled with Space like
 * any form control. Rebuilt from the box's lines whenever they change; a name keeps its tick while
 * it stays in the list.
 * @param {Object} options
 * @param {string} options.idBase - unique id prefix for the checkboxes
 * @param {() => string[]} options.readNames - the author names now in the box
 * @param {(names: string[]) => void} options.onPick - called with the ticked names
 * @returns {{ el: HTMLFieldSetElement, render: (ticked: string[]) => void, ticked: () => string[],
 *            destroy: () => void }}
 */
function createOrganisationPicker({ idBase, readNames, onPick }) {
  const el = document.createElement('fieldset');
  el.className = 'assist-cite-step__organisations';

  const legend = document.createElement('legend');
  legend.className = 'assist-cite-step__label';
  legend.textContent = 'Which authors are organisations?';
  el.appendChild(legend);

  const help = document.createElement('p');
  help.className = 'assist-cite-step__hint';
  help.textContent =
    'Tick a university, company, news outlet or channel, so its name is printed whole.';
  el.appendChild(help);

  const list = document.createElement('div');
  list.className = 'assist-cite-step__organisation-list';
  el.appendChild(list);

  const ticked = () => [...list.querySelectorAll('input:checked')].map(box => box.value);

  /** @param {string[]} organisations - the names to show ticked */
  function render(organisations) {
    const chosen = new Set(organisations);
    const names = [...new Set(readNames())];
    list.replaceChildren(
      ...names.map((name, i) => {
        const row = document.createElement('div');
        row.className = 'assist-cite-step__organisation';
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.id = `${idBase}-org${i}`;
        box.value = name;
        box.checked = chosen.has(name);
        const label = document.createElement('label');
        label.setAttribute('for', box.id);
        label.textContent = name;
        row.append(box, label);
        return row;
      })
    );
    el.hidden = names.length === 0;
  }

  // Checkboxes bind `change` (the shared mousedown helper would cancel the tick); one listener on
  // the group serves every box, however often the list is rebuilt.
  const onChange = () => onPick(ticked());
  el.addEventListener('change', onChange);

  return {
    el,
    render,
    ticked,
    destroy: () => el.removeEventListener('change', onChange),
  };
}

/** True when a field's value counts as empty (for required-field validation). */
function isEmpty(value) {
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  return !String(value || '').trim();
}

/**
 * @param {Object} options
 * @returns {{ id: string, el: HTMLElement, getControl: Function, validate: Function, refresh: Function, destroy: Function }}
 */
export function createWizardStep(options = {}) {
  const { id, legend, help, onChange } = options;
  const fields = Array.isArray(options.fields) ? options.fields : [];
  const draft = options.draft && typeof options.draft === 'object' ? options.draft : {};

  // The draft currently on screen — the one refresh() last painted from, which is the object a
  // live edit lands in, so a field that turns another field on decides that against the same one.
  let shownDraft = draft;

  const uid = `assist-cite-step-${++stepSeq}`;

  const el = document.createElement('section');
  el.className = 'assist-cite-step';
  el.setAttribute('aria-labelledby', `${uid}-legend`);

  const legendEl = document.createElement('h2');
  legendEl.className = 'assist-cite-step__legend';
  legendEl.id = `${uid}-legend`;
  legendEl.textContent = legend || '';
  // Make the legend programmatically focusable so the wizard can move focus here on step change.
  legendEl.tabIndex = -1;
  el.appendChild(legendEl);

  if (help) {
    const helpEl = document.createElement('p');
    helpEl.className = 'assist-cite-step__help';
    helpEl.textContent = help;
    el.appendChild(helpEl);
  }

  /** Per-field bookkeeping: elements, descriptor, resolved label text, event bindings. */
  const entries = [];

  fields.forEach((field, index) => {
    const fieldId = `${uid}-f${index}`;
    const hintId = `${fieldId}-hint`;
    const errId = `${fieldId}-err`;

    const wrap = document.createElement('div');
    wrap.className = 'assist-cite-step__field-wrap';

    const label = document.createElement('label');
    label.className = 'assist-cite-step__label';
    label.setAttribute('for', fieldId);
    wrap.appendChild(label);

    let control;
    if (field.type === 'select' || field.type === 'select-other') {
      control = document.createElement('select');
      const options = [...(field.options || [])];
      if (field.type === 'select-other') {
        options.push({ value: OTHER_OPTION, label: field.otherLabel || 'Something else' });
      }
      options.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        control.appendChild(o);
      });
    } else if (field.type === 'textarea' || field.type === 'authors' || field.type === 'names') {
      control = document.createElement('textarea');
      control.rows = field.type === 'textarea' ? 2 : 3;
    } else {
      control = document.createElement('input');
      control.type = 'text';
    }
    control.id = fieldId;
    control.className = 'assist-cite-step__field';

    const describedBy = [];

    // A hint that depends on the draft may be empty for some source types; the element is built
    // either way and hidden when it has nothing to say, so aria-describedby stays stable.
    let hintEl = null;
    if (field.hint) {
      hintEl = document.createElement('p');
      hintEl.className = 'assist-cite-step__hint';
      hintEl.id = hintId;
      describedBy.push(hintId);
    }

    // Error message — empty until validate() flags this field. role="alert" announces it.
    const errEl = document.createElement('p');
    errEl.className = 'assist-cite-step__error';
    errEl.id = errId;
    errEl.setAttribute('role', 'alert');
    errEl.hidden = true;
    describedBy.push(errId);

    if (describedBy.length > 0) {
      control.setAttribute('aria-describedby', describedBy.join(' '));
    }

    wrap.appendChild(control);

    let organisations = null;
    if (field.type === 'authors' && field.organisationsKey) {
      organisations = createOrganisationPicker({
        idBase: fieldId,
        readNames: () => readValue(field, { control }),
        onPick: names => {
          if (typeof onChange === 'function') {
            onChange(field.organisationsKey, names);
          }
        },
      });
      wrap.appendChild(organisations.el);
    }

    // The "something else" answer gets its own labelled box rather than a placeholder standing in
    // for a label (SC 3.3.2), in its own row so it can be hidden without hiding the list.
    let otherControl = null;
    let otherWrap = null;
    if (field.type === 'select-other') {
      otherWrap = document.createElement('div');
      otherWrap.className = 'assist-cite-step__field-wrap';
      const otherLabel = document.createElement('label');
      otherLabel.className = 'assist-cite-step__label';
      otherLabel.setAttribute('for', `${fieldId}-other`);
      otherLabel.textContent = field.otherFieldLabel || 'Type it yourself';
      otherControl = document.createElement('input');
      otherControl.type = 'text';
      otherControl.id = `${fieldId}-other`;
      otherControl.className = 'assist-cite-step__field';
      if (field.otherPlaceholder) {
        otherControl.placeholder = field.otherPlaceholder;
      }
      otherWrap.appendChild(otherLabel);
      otherWrap.appendChild(otherControl);
      wrap.appendChild(otherWrap);
    }

    if (hintEl) {
      wrap.appendChild(hintEl);
    }
    wrap.appendChild(errEl);
    el.appendChild(wrap);

    const entry = {
      field,
      control,
      otherControl,
      wrap,
      otherWrap,
      label,
      hintEl,
      errEl,
      organisations,
    };

    const listener = () => {
      // Clear a previous error as soon as the user starts fixing the field.
      if (!errEl.hidden) {
        errEl.hidden = true;
        errEl.textContent = '';
        control.removeAttribute('aria-invalid');
      }
      if (typeof onChange === 'function') {
        onChange(field.key, readValue(field, entry));
      }
      // A name edited or removed from the authors box takes its tick with it.
      if (organisations) {
        organisations.render(organisations.ticked());
        if (typeof onChange === 'function') {
          onChange(field.organisationsKey, organisations.ticked());
        }
      }
      // The draft the step is showing is the one the wizard edits, so a change that decides
      // whether another field applies takes effect the moment it is made.
      applyVisibility(shownDraft);
    };

    const evt = field.type === 'select' || field.type === 'select-other' ? 'change' : 'input';
    entry.bindings = [{ target: control, evt, listener }];
    if (otherControl) {
      entry.bindings.push({ target: otherControl, evt: 'input', listener });
    }
    entry.bindings.forEach(b => b.target.addEventListener(b.evt, b.listener));

    entries.push(entry);
  });

  /**
   * The live control for a field key, so the wizard can manage a field it does not own — the
   * verification lock flips `readOnly` on the bibliographic controls scattered across steps.
   * @param {string} key
   * @returns {HTMLElement|null} null when this step has no such field
   */
  function getControl(key) {
    const entry = entries.find(e => e.field.key === key);
    return entry ? entry.control : null;
  }

  /**
   * Whether this step holds the field with this key.
   * @param {string} key
   * @returns {boolean}
   */
  function hasField(key) {
    return entries.some(e => e.field.key === key);
  }

  /**
   * Put a plain sentence beside one field and mark the control invalid — the same treatment
   * validate() gives a missing required field, so a problem raised at save time reads and
   * announces exactly like one raised on Next.
   * @param {string} key
   * @param {string} message
   * @returns {boolean} false when this step has no such field
   */
  function showError(key, message) {
    const entry = entries.find(e => e.field.key === key);
    if (!entry) {
      return false;
    }
    entry.errEl.textContent = message;
    entry.errEl.hidden = false;
    entry.control.setAttribute('aria-invalid', 'true');
    return true;
  }

  /** Clear every inline error on this step (nothing is invalid until it is checked again). */
  function clearErrors() {
    for (const { control, errEl } of entries) {
      errEl.hidden = true;
      errEl.textContent = '';
      control.removeAttribute('aria-invalid');
    }
  }

  /**
   * Move focus to one field's control, so the student lands on the box that fixes the problem.
   * @param {string} key
   * @returns {boolean} false when this step has no such field
   */
  function focusField(key) {
    const control = getControl(key);
    if (!control) {
      return false;
    }
    control.focus();
    return true;
  }

  /**
   * Validate required fields. Shows inline errors and focuses the first invalid control.
   * @returns {{ valid: boolean, firstInvalidKey: string|null }}
   */
  function validate() {
    let firstInvalid = null;
    for (const entry of entries) {
      const { field, control, errEl } = entry;
      if (field.required && isEmpty(readValue(field, entry))) {
        errEl.textContent = `Please add ${entry.labelText.toLowerCase()} before moving on.`;
        errEl.hidden = false;
        control.setAttribute('aria-invalid', 'true');
        if (!firstInvalid) {
          firstInvalid = { key: field.key, control };
        }
      } else {
        errEl.hidden = true;
        errEl.textContent = '';
        control.removeAttribute('aria-invalid');
      }
    }
    if (firstInvalid) {
      firstInvalid.control.focus();
      return { valid: false, firstInvalidKey: firstInvalid.key };
    }
    return { valid: true, firstInvalidKey: null };
  }

  /**
   * Show only the fields this draft's source type actually needs. A hidden row is out of the tab
   * order and the accessibility tree, but keeps what was typed in case the type changes back.
   * @param {Object} d
   */
  function applyVisibility(d) {
    for (const { field, control, wrap, otherWrap } of entries) {
      const visible = typeof field.showWhen === 'function' ? Boolean(field.showWhen(d)) : true;
      wrap.hidden = !visible;
      if (otherWrap) {
        otherWrap.hidden = !(visible && control.value === OTHER_OPTION);
      }
    }
  }

  /**
   * Word each field for this draft: a container box asks for a book title on a chapter and a site
   * name everywhere else, so label, example and hint are all resolved against the draft.
   * @param {Object} d
   */
  function applyWording(d) {
    for (const entry of entries) {
      const { field, control, label, hintEl } = entry;
      entry.labelText = String(resolve(field.label, d) || '');
      label.textContent = field.required ? `${entry.labelText} (required)` : entry.labelText;

      const placeholder = resolve(field.placeholder, d);
      if (placeholder) {
        control.placeholder = placeholder;
      } else {
        control.removeAttribute('placeholder');
      }

      if (hintEl) {
        const hint = String(resolve(field.hint, d) || '');
        hintEl.textContent = hint;
        hintEl.hidden = !hint;
      }
    }
  }

  /**
   * Re-populate every field control from a draft (used on prefill and when navigating back), and
   * re-word and re-show the fields for the source type it describes.
   * @param {Object} next
   */
  function refresh(next) {
    const d = next && typeof next === 'object' ? next : {};
    shownDraft = d;
    for (const entry of entries) {
      writeValue(entry.field, entry, d);
      if (entry.organisations) {
        const recorded = readAt(d, entry.field.organisationsKey);
        entry.organisations.render(Array.isArray(recorded) ? recorded : []);
      }
    }
    applyWording(d);
    applyVisibility(d);
  }

  function destroy() {
    for (const { bindings, organisations } of entries) {
      bindings.forEach(b => b.target.removeEventListener(b.evt, b.listener));
      if (organisations) {
        organisations.destroy();
      }
    }
    entries.length = 0;
  }

  // Initial paint: values pre-filled from the draft (redundant-entry avoidance — SC 3.3.7),
  // wording and visibility settled for the source type it describes.
  refresh(draft);

  return {
    id,
    el,
    getControl,
    hasField,
    showError,
    clearErrors,
    focusField,
    validate,
    refresh,
    destroy,
  };
}

export default { createWizardStep };
