/**
 * @jest-environment jsdom
 *
 * The popup's own `attachInteractiveHandler`, exercised on the real popup markup.
 *
 * Eighty-odd buttons in this popup are wired with this one helper, and it bound `mousedown` and
 * nothing else. A native button pressed with Enter fires `click`; Space fires `click` on the way
 * up. Neither is a mousedown, so every one of those buttons was mouse-only — SC 2.1.1 failed
 * across the entire surface, and no per-button test could have caught it because the defect was
 * in the shared helper. These assertions are on the helper for that reason.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '../../..');
const POPUP_HTML = fs.readFileSync(path.join(ROOT, 'src/popup/popup.html'), 'utf8');

let PopupController;

beforeAll(async () => {
  // popup.js registers a storage listener as it loads; the shared setup mock has no onChanged.
  chrome.storage.onChanged = { addListener: jest.fn(), removeListener: jest.fn() };
  ({ PopupController } = await import('../../../src/popup/popup.js'));
});

/**
 * The real popup body, and a real button out of it to wire.
 * @returns {{popup: Object, button: HTMLElement, handler: jest.Mock}}
 */
function wire() {
  document.body.innerHTML = POPUP_HTML.slice(POPUP_HTML.indexOf('<div class="popup-container">'));
  const popup = new PopupController();
  const button = document.getElementById('btn-options-compact');
  const handler = jest.fn();
  popup.attachInteractiveHandler(button, 'Advanced options', handler);
  return { popup, button, handler };
}

/** @param {HTMLElement} element @param {string} key */
function pressKey(element, key, init = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  element.dispatchEvent(event);
  return event;
}

describe('a button wired by the popup helper', () => {
  it('still answers the pointer on mousedown', () => {
    const { button, handler } = wire();
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('answers Enter', () => {
    const { button, handler } = wire();
    pressKey(button, 'Enter');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('answers Space', () => {
    const { button, handler } = wire();
    pressKey(button, ' ');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('cancels the default, so Space does not scroll the popup and no synthetic click follows', () => {
    const { button } = wire();
    expect(pressKey(button, ' ').defaultPrevented).toBe(true);
  });

  it('ignores a key it was not given', () => {
    const { button, handler } = wire();
    pressKey(button, 'a');
    pressKey(button, 'Tab');
    expect(handler).not.toHaveBeenCalled();
  });

  it('runs once for a held key rather than once per repeat', () => {
    const { button, handler } = wire();
    pressKey(button, 'Enter');
    pressKey(button, 'Enter', { repeat: true });
    pressKey(button, 'Enter', { repeat: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not fire twice when a press produces both a keydown and a click', () => {
    const { button, handler } = wire();
    pressKey(button, 'Enter');
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not fire on a bare click, which is what the mousedown rule is for', () => {
    const { button, handler } = wire();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(handler).not.toHaveBeenCalled();
  });

  it('replaces its keyboard listener when the same control is wired twice', () => {
    const { popup, button, handler } = wire();
    popup.attachInteractiveHandler(button, 'Advanced options', handler);
    pressKey(button, 'Enter');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('keeps the element free for its own keyboard wiring rather than taking the onkeydown slot', () => {
    const { button, handler } = wire();
    const own = jest.fn();
    button.onkeydown = own;
    pressKey(button, 'Enter');
    expect(own).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
