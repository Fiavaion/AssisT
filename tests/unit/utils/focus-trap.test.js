/**
 * @jest-environment jsdom
 *
 * The shared focus trap, tested on its own.
 *
 * Every modal dialog in the product goes through this helper, and the containment it claimed
 * did not hold: it only swallowed Tab when the active element WAS the first or the last
 * focusable. The moment the focused control was re-rendered away, focus sat on <body>, matched
 * neither end, and the next Tab walked out onto the page behind the dialog (SC 2.1.2).
 */

import { trapFocus } from '../../../src/utils/focus-trap.js';
import { attachAccessibleHandler } from '../../../src/utils/event-handlers.js';

/**
 * jsdom has no layout, so `offsetParent` is always null and the helper's visibility filter
 * would discard every candidate but the active element — which is exactly what made the
 * panel-level test vacuous. Report layout the way a browser would instead.
 */
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get() {
      return this.isConnected && this.style.display !== 'none' ? document.body : null;
    },
  });
});

/** trapFocus moves focus in on the next macrotask. */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

/** @param {EventTarget} target @param {boolean} [shiftKey] */
function pressTab(target, shiftKey = false) {
  const event = new KeyboardEvent('keydown', {
    key: 'Tab',
    shiftKey,
    bubbles: true,
    cancelable: true,
    // Real key events are composed: they cross a shadow boundary to the document's listeners.
    composed: true,
  });
  target.dispatchEvent(event);
  return event;
}

describe('trapFocus', () => {
  let outside;
  let dialog;
  let release;

  beforeEach(async () => {
    outside = document.createElement('button');
    outside.id = 'outside';
    document.body.appendChild(outside);

    dialog = document.createElement('div');
    dialog.innerHTML = `
      <button id="first">First</button>
      <input id="middle" type="text">
      <button id="last">Last</button>
    `;
    document.body.appendChild(dialog);

    release = trapFocus(dialog);
    await settle();
  });

  afterEach(() => {
    release();
    dialog.remove();
    outside.remove();
  });

  const el = id => document.getElementById(id);

  test('Tab from the last focusable wraps to the first', () => {
    el('last').focus();

    expect(pressTab(el('last')).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(el('first'));
  });

  test('Shift+Tab from the first focusable wraps to the last', () => {
    el('first').focus();

    expect(pressTab(el('first'), true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(el('last'));
  });

  test('Tab from inside the dialog is left to the browser', () => {
    el('first').focus();

    expect(pressTab(el('first')).defaultPrevented).toBe(false);
  });

  test('Tab pulls focus back in when the focused control has been re-rendered away', () => {
    el('middle').focus();
    el('middle').remove(); // a re-render: focus falls to <body>
    expect(document.activeElement).toBe(document.body);

    const event = pressTab(document.activeElement);

    expect(event.defaultPrevented).toBe(true);
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(el('first'));
  });

  test('Shift+Tab pulls focus back in from outside the dialog as well', () => {
    outside.focus();

    const event = pressTab(outside, true);

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(el('last'));
  });

  test('Tab pulls focus back in from a control on the page behind the dialog', () => {
    outside.focus();

    expect(pressTab(outside).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(el('first'));
  });

  test('release stops trapping', () => {
    release();
    outside.focus();

    expect(pressTab(outside).defaultPrevented).toBe(false);
  });
});

/**
 * Where focus goes when a dialog closes, for a dialog opened by the MOUSE.
 *
 * The shared button helper cancels mousedown (see event-handlers.js for why), so a button pressed
 * with the mouse never takes the focus. A dialog it opens therefore saw <body> as "what was focused",
 * and closing the dialog left a keyboard or screen-reader user at the top of the page (SC 2.4.3).
 */
describe('trapFocus return target after a mouse-opened dialog', () => {
  let opener;
  let dialog;
  let release;
  let cleanup;

  const mousedown = target =>
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    opener = document.createElement('button');
    opener.textContent = 'New collection';
    document.body.appendChild(opener);
    dialog = document.createElement('div');
    dialog.innerHTML = '<button id="inside">Inside</button>';
    cleanup = attachAccessibleHandler(opener, 'Open', () => {
      document.body.appendChild(dialog);
      release = trapFocus(dialog);
    });
    document.body.focus();
  });

  afterEach(() => {
    cleanup();
    if (release) {
      release();
    }
    release = undefined;
    dialog.remove();
    opener.remove();
    document.querySelectorAll('input.field').forEach(el => el.remove());
  });

  test('returns focus to the button that opened it, not to <body>', async () => {
    mousedown(opener);
    expect(document.activeElement).toBe(document.body); // the helper kept the focus where it was
    await settle();
    release();

    expect(document.activeElement).toBe(opener);
  });

  test('a field that held the focus when the dialog opened keeps it: typing picks up where it was', async () => {
    const field = document.createElement('input');
    field.className = 'field';
    document.body.appendChild(field);
    field.focus();

    mousedown(opener);
    await settle();
    release();

    expect(document.activeElement).toBe(field);
  });

  test('a press that has since been overtaken by the keyboard is not used', async () => {
    mousedown(opener);
    release();
    release = undefined;
    document.activeElement.blur();
    expect(document.activeElement).toBe(document.body);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));

    document.body.appendChild(dialog);
    release = trapFocus(dialog);
    await settle();
    release();
    dialog.remove();

    expect(document.activeElement).toBe(document.body);
  });

  test('an opener that has left the page is not focused', async () => {
    mousedown(opener);
    await settle();
    opener.remove();
    release();
    dialog.remove();

    expect(document.activeElement).toBe(document.body);
  });
});

describe('trapFocus inside a shadow root', () => {
  // The consent panel lives in a closed shadow root, where document.activeElement is the host.
  // A trap that read document.activeElement saw focus "outside" on every Tab and yanked it.
  let host;
  let root;
  let release;

  beforeEach(() => {
    document.body.innerHTML = '<button id="page">Page</button>';
    host = document.createElement('div');
    document.body.appendChild(host);
    root = host.attachShadow({ mode: 'closed' });
    root.innerHTML =
      '<div role="dialog"><button id="a">A</button><button id="b">B</button><button id="c">C</button></div>';
    release = trapFocus(root.querySelector('[role="dialog"]'));
  });

  afterEach(() => release());

  test('Tab between controls inside the root is left to the browser', () => {
    root.getElementById('b').focus();
    expect(pressTab(root.getElementById('b')).defaultPrevented).toBe(false);
    expect(root.activeElement).toBe(root.getElementById('b'));
  });

  test('Tab from the last control inside the root wraps to the first', () => {
    root.getElementById('c').focus();
    expect(pressTab(root.getElementById('c')).defaultPrevented).toBe(true);
    expect(root.activeElement).toBe(root.getElementById('a'));
  });
});
