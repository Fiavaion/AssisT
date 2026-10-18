/**
 * Drawing a control from its declaration.
 *
 * Every control in the popup is hand-written today: the same switch markup appears dozens of
 * times, each copy free to drift from the others in labelling, in keyboard behaviour, in whether
 * it announces anything at all. This builds one from its registry entry instead, so a control is
 * correct because of where it came from rather than because someone remembered.
 *
 * Two rules it exists to enforce, both of which the hand-written popup breaks in places:
 *
 *   1. Every control is named with its tool. A student meeting a bare "Speed" in a flat list of
 *      two dozen supports cannot tell what it belongs to, and a screen reader reads it with no
 *      more context than the eye gets.
 *   2. State is never carried by colour alone. A switch says on or off in words to assistive
 *      technology, via `role="switch"` and `aria-checked`, not only by where the slider sits.
 *
 * It builds DOM and returns it. It does not decide layout, does not read storage, and does not
 * know what a group or a filter is — the view owns all of that.
 */

import { attachAccessibleHandler } from '../../utils/event-handlers.js';
import { controlAriaLabel } from './tool-schema.js';

/** Class prefix for everything this module builds. */
const CSS = 'assist-reg';

/**
 * Prefix for every id this module writes.
 *
 * What it draws is a SECOND copy of a control the accordion popup already owns and still holds in
 * the document, hidden, because that control's handler does the actual work. A copy carrying the
 * original's id would put two elements with one id in the page: invalid markup, a `for`/`id`
 * pairing ambiguous enough to hand a screen reader the wrong label or none at all, and a
 * `getElementById` answering with whichever copy happens to be drawn first.
 *
 * It reads `flat-` because Flat is the view that draws these copies, and Flat's own tool switches
 * already used that wording. One convention, written down once.
 */
const RENDERED_ID_PREFIX = 'flat-';

/**
 * The id to give an element drawn here, from the id the registry declares.
 *
 * Every id this module writes goes through this, and there is no argument that can switch it off.
 * A prefix passed in as a render option would need a default, and the only default that makes
 * sense is the bare id — so a caller who forgot to pass one would quietly restore the collision.
 * A step you cannot reach around is a step nobody can forget.
 *
 * @param {string} id - the id as declared in the registry
 * @returns {string}
 */
export function renderedId(id) {
  return `${RENDERED_ID_PREFIX}${id}`;
}

/**
 * @typedef {Object} RenderOptions
 * @property {*} value - the control's current value
 * @property {(value:*) => void} [onChange] - called with the new value when the student changes it
 * @property {number[]} [presets] - a range's one-press values, when the student has not hidden them
 */

/**
 * Make an element with a class and optional text.
 * @param {string} tag
 * @param {string|null} className
 * @param {string} [text]
 * @returns {HTMLElement}
 */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    // Always textContent: a tool label or a stored value is not markup and must never be parsed
    // as any.
    node.textContent = text;
  }
  return node;
}

/**
 * The switch pattern the popup already uses: a checkbox with `role="switch"`, a slider span, and
 * a visible label.
 *
 * Checkboxes listen for `change`, never the shared mousedown handler — that handler calls
 * `preventDefault`, which stops a checkbox from flipping at all.
 *
 * @param {Object} tool
 * @param {Object} control
 * @param {RenderOptions} options
 * @returns {HTMLElement}
 */
function renderSwitch(tool, control, { value, onChange }) {
  const wrap = el('div', `${CSS}-control ${CSS}-control--switch`);
  const label = el('label', `${CSS}-switch`);
  label.setAttribute('for', renderedId(control.id));

  label.appendChild(el('span', `${CSS}-switch__text`, control.label));

  const box = el('div', `${CSS}-switch__box`);
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.id = renderedId(control.id);
  input.setAttribute('role', 'switch');
  input.checked = value === true;
  input.setAttribute('aria-checked', String(input.checked));
  input.setAttribute('aria-label', controlAriaLabel(tool, control));

  input.addEventListener('change', event => {
    input.setAttribute('aria-checked', String(event.target.checked));
    if (onChange) {
      onChange(event.target.checked);
    }
  });

  box.appendChild(input);
  box.appendChild(el('span', `${CSS}-switch__slider`));
  label.appendChild(box);
  wrap.appendChild(label);

  // A switch whose consequence is not obvious from its label says it here, and says it to a
  // screen reader too: turning the microphone button off is fine because the shortcut remains.
  if (control.hint) {
    const hint = el('span', `${CSS}-switch__hint`, control.hint);
    hint.id = `${renderedId(control.id)}-hint`;
    input.setAttribute('aria-describedby', hint.id);
    wrap.appendChild(hint);
  }

  return wrap;
}

/**
 * A slider, with its value shown as text beside it.
 *
 * `scale` bridges the two units a range can have: letter spacing is stored in em but shown in
 * whole percent points, so the widget works in scaled units and the value handed back is the
 * stored one. Without that a renderer would save 12em where 0.12em was meant.
 *
 * @param {Object} tool
 * @param {Object} control
 * @param {RenderOptions} options
 * @returns {HTMLElement}
 */
function renderRange(tool, control, { value, onChange, presets }) {
  const scale = typeof control.scale === 'number' && control.scale > 0 ? control.scale : 1;
  const wrap = el('div', `${CSS}-control ${CSS}-control--range`);

  const label = el('label', `${CSS}-control__label`, control.label);
  label.setAttribute('for', renderedId(control.id));

  const readout = el('span', `${CSS}-control__value`);
  readout.id = renderedId(`${control.id}-value`);

  // Fall back to the declared default rather than rendering NaN when no value is supplied.
  const current = value === undefined || value === null ? control.default : value;

  const input = document.createElement('input');
  input.type = 'range';
  input.id = renderedId(control.id);
  input.min = String(control.min * scale);
  input.max = String(control.max * scale);
  input.step = String(control.step * scale);
  input.value = String(Number(current) * scale);
  input.setAttribute('aria-label', controlAriaLabel(tool, control));

  const presetButtons = [];
  const show = () => {
    readout.textContent = `${input.value}${control.unit || ''}`;
    presetButtons.forEach(({ button, stored }) => {
      const on = Math.abs(Number(input.value) - stored * scale) < 1e-9;
      button.setAttribute('aria-pressed', String(on));
    });
  };

  input.addEventListener('input', () => {
    show();
    if (onChange) {
      onChange(Number(input.value) / scale);
    }
  });

  const head = el('div', `${CSS}-control__head`);
  head.appendChild(label);
  head.appendChild(readout);
  wrap.appendChild(head);
  wrap.appendChild(input);

  // Presets are passed in rather than read off the declaration: the student can hide them in
  // Advanced Options, and whether they have is the caller's to know.
  if (Array.isArray(presets) && presets.length) {
    const row = el('div', `${CSS}-presets`);
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', `${controlAriaLabel(tool, control)} presets`);
    presets.forEach(stored => {
      const words = `${stored}${control.unit || ''}`;
      const button = el('button', `${CSS}-preset`, words);
      button.type = 'button';
      // Named with the slider it sets, so "1.5x" is never heard on its own. `aria-pressed` says
      // which preset the slider is on now, in words rather than only by shading.
      button.setAttribute('aria-label', `${controlAriaLabel(tool, control)} ${words}`);
      attachAccessibleHandler(button, `${tool.name} — ${words}`, () => {
        input.value = String(stored * scale);
        show();
        if (onChange) {
          onChange(stored);
        }
      });
      presetButtons.push({ button, stored });
      row.appendChild(button);
    });
    wrap.appendChild(row);
  }

  show();
  return wrap;
}

/**
 * A select. Options may be declared or supplied at runtime — the installed speech voices are not
 * knowable until the engine has enumerated them.
 *
 * @param {Object} tool
 * @param {Object} control
 * @param {RenderOptions & {options?: Array<{value:string,label:string}>}} renderOptions
 * @returns {HTMLElement}
 */
function renderSelect(tool, control, { value, onChange, options }) {
  const wrap = el('div', `${CSS}-control ${CSS}-control--select`);

  const label = el('label', `${CSS}-control__label`, control.label);
  label.setAttribute('for', renderedId(control.id));

  const select = document.createElement('select');
  select.id = renderedId(control.id);
  select.setAttribute('aria-label', controlAriaLabel(tool, control));

  const list = Array.isArray(options) ? options : control.options || [];
  list.forEach(option => {
    const node = document.createElement('option');
    node.value = option.value;
    node.textContent = option.label;
    select.appendChild(node);
  });
  if (value !== undefined) {
    select.value = String(value);
  }

  select.addEventListener('change', event => {
    if (onChange) {
      onChange(event.target.value);
    }
  });

  wrap.appendChild(label);
  wrap.appendChild(select);
  return wrap;
}

/**
 * One radio option. The group is a `fieldset` built by `renderRadioGroup`, so that assistive
 * technology hears the question as well as the answers.
 *
 * @param {Object} tool
 * @param {Object} control
 * @param {RenderOptions} options
 * @returns {HTMLElement}
 */
function renderRadio(tool, control, { value, onChange }) {
  const wrap = el('label', `${CSS}-radio`);
  wrap.setAttribute('for', renderedId(control.id));

  const input = document.createElement('input');
  input.type = 'radio';
  input.id = renderedId(control.id);
  // Radios sharing a name are ONE group, document-wide. Left bare, choosing an option here would
  // unchoose the accordion's copy — and the accordion's is the radio the proxy sets and the radio
  // the current value is read back from, so the student's choice would land nowhere.
  input.name = renderedId(control.group);
  if (control.value !== undefined) {
    input.value = String(control.value);
    input.checked = String(value) === String(control.value);
  } else {
    // A variant stored as parallel booleans: this option is the selected one when every flag it
    // writes already matches.
    const flags = control.writes || {};
    input.value = control.id;
    input.checked =
      value !== null &&
      typeof value === 'object' &&
      Object.keys(flags).every(key => Boolean(value[key]) === Boolean(flags[key]));
  }
  input.setAttribute('aria-label', controlAriaLabel(tool, control));

  input.addEventListener('change', () => {
    if (input.checked && onChange) {
      // The chosen option is passed back too: a group reports through one handler, and the caller
      // needs to know which of the three was picked, not only what it writes.
      onChange(
        control.value !== undefined ? control.value : { ...(control.writes || {}) },
        control
      );
    }
  });

  wrap.appendChild(input);
  wrap.appendChild(el('span', `${CSS}-radio__text`, control.label));
  if (control.hint) {
    wrap.appendChild(el('span', `${CSS}-radio__hint`, control.hint));
  }
  return wrap;
}

/**
 * A chip group: several toggle buttons, any number of which may be on, writing their membership
 * of one array. `aria-pressed` carries the state, so it is announced rather than only shaded.
 *
 * @param {Object} tool
 * @param {Object} control
 * @param {RenderOptions} options
 * @returns {HTMLElement}
 */
function renderChips(tool, control, { value, onChange }) {
  const chosen = new Set(Array.isArray(value) ? value : []);
  const wrap = el('div', `${CSS}-control ${CSS}-control--chips`);
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-label', controlAriaLabel(tool, control));
  wrap.appendChild(el('p', `${CSS}-control__label`, control.label));

  const row = el('div', `${CSS}-chips`);
  control.options.forEach(option => {
    const chip = el('button', `${CSS}-chip`, option.label);
    chip.type = 'button';
    chip.id = renderedId(option.id);
    chip.setAttribute('aria-pressed', String(chosen.has(option.value)));

    attachAccessibleHandler(chip, `${tool.name} — ${option.label}`, () => {
      const on = chip.getAttribute('aria-pressed') === 'true';
      chip.setAttribute('aria-pressed', String(!on));
      if (on) {
        chosen.delete(option.value);
      } else {
        chosen.add(option.value);
      }
      if (onChange) {
        onChange([...chosen]);
      }
    });

    row.appendChild(chip);
  });

  wrap.appendChild(row);
  return wrap;
}

/**
 * The radio options of one group, wrapped in a fieldset with the group's own question as legend.
 *
 * @param {Object} tool
 * @param {Object[]} controls - the radio controls sharing a group
 * @param {string} legend
 * @param {RenderOptions} options
 * @returns {HTMLElement}
 */
export function renderRadioGroup(tool, controls, legend, options) {
  const fieldset = document.createElement('fieldset');
  fieldset.className = `${CSS}-control ${CSS}-control--radio`;
  const caption = document.createElement('legend');
  // The legend is the question, never one of the answers: a group captioned "Syllable colours"
  // tells a student nothing about what the three options are choosing between.
  caption.textContent = legend || tool.name;
  fieldset.appendChild(caption);
  controls.forEach(control => fieldset.appendChild(renderRadio(tool, control, options)));
  return fieldset;
}

/**
 * An action button. It changes no setting — it opens something, or does something once.
 *
 * @param {Object} tool
 * @param {{id:string, label:string}} action
 * @param {() => void} [onInvoke]
 * @returns {HTMLElement}
 */
export function renderAction(tool, action, onInvoke) {
  const button = el('button', `${CSS}-action`, action.label);
  button.type = 'button';
  button.id = renderedId(action.id);
  button.setAttribute('aria-label', controlAriaLabel(tool, action));
  attachAccessibleHandler(button, `${tool.name} — ${action.label}`, () => {
    if (onInvoke) {
      onInvoke(action);
    }
  });
  return button;
}

/**
 * Draw one control.
 *
 * @param {Object} tool
 * @param {Object} control
 * @param {RenderOptions} [options]
 * @returns {HTMLElement|null} null for a control type nothing can draw, rather than a broken node
 */
export function renderControl(tool, control, options = {}) {
  if (!tool || !control) {
    return null;
  }
  switch (control.type) {
    case 'switch':
      return renderSwitch(tool, control, options);
    case 'range':
      return renderRange(tool, control, options);
    case 'select':
      return renderSelect(tool, control, options);
    case 'chips':
      return renderChips(tool, control, options);
    case 'radio':
      // A lone radio is meaningless; groups go through renderRadioGroup.
      return renderRadioGroup(tool, [control], control.groupLabel || tool.name, options);
    default:
      return null;
  }
}

/**
 * A tool's controls, with radios collected into their groups and in declaration order.
 *
 * @param {Object} tool
 * @param {(control:Object) => RenderOptions} valuesFor - supplies each control's current value and
 *   change handler
 * @param {{surface?:string}} [filter] - draw only controls of one surface; omit for all
 * @returns {HTMLElement[]}
 */
export function renderControls(tool, valuesFor, filter = {}) {
  const controls = (tool.controls || []).filter(
    control => !filter.surface || (control.surface || 'popup') === filter.surface
  );

  const nodes = [];
  const groupsDone = new Set();

  controls.forEach(control => {
    if (control.type === 'radio') {
      if (groupsDone.has(control.group)) {
        return;
      }
      groupsDone.add(control.group);
      const members = controls.filter(other => other.group === control.group);
      const legend = members.map(member => member.groupLabel).find(Boolean) || tool.name;
      nodes.push(renderRadioGroup(tool, members, legend, valuesFor(control)));
      return;
    }
    const node = renderControl(tool, control, valuesFor(control));
    if (node) {
      nodes.push(node);
    }
  });

  return nodes;
}
