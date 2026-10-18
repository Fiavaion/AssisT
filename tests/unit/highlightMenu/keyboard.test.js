/**
 * Highlight menu keyboard operation (WCAG 2.1.1, 2.4.3): a keyboard user can
 * open the menu from a keyboard selection, reach it with Tab, move with the
 * arrow keys, activate with Enter or Space, and Escape (or leaving with Tab)
 * closes it and puts focus back where it was. Mouse use keeps the selection.
 */

jest.mock('../../../src/core/ui/toast.js', () => ({ showToast: jest.fn() }));

const READ = '[aria-label="Read Aloud (TTS)"]';

function key(target, keyName, init = {}) {
  const event = new KeyboardEvent('keydown', {
    key: keyName,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

function selectWords() {
  const text = document.getElementById('a').firstChild;
  const range = document.createRange();
  range.setStart(text, 4);
  range.setEnd(text, 19);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function openWithMouse() {
  selectWords();
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
}

function buttons() {
  return Array.from(document.querySelectorAll('#assist-highlight-menu .assist-hm-btn'));
}

beforeAll(() => {
  Range.prototype.getBoundingClientRect = () => ({
    top: 0,
    bottom: 10,
    left: 0,
    right: 10,
    width: 10,
    height: 10,
  });
  global.chrome.storage.onChanged = { addListener: jest.fn() };
  require('../../../src/features/highlightMenu/highlightMenu.js');
});

let origin;
beforeEach(() => {
  document.body.innerHTML =
    '<button id="origin">Before</button><p id="a">The quick brown fox jumps over the lazy dog.</p>';
  origin = document.getElementById('origin');
  origin.focus();
  window.readSelection = jest.fn(() => true);
});

afterEach(() => {
  key(document.activeElement || document.body, 'Escape');
  jest.useRealTimers();
});

test('a keyboard select-all opens the menu without moving focus', () => {
  selectWords();
  document.dispatchEvent(new KeyboardEvent('keyup', { key: 'a', ctrlKey: true, bubbles: true }));
  expect(document.querySelector(READ)).not.toBeNull();
  expect(document.activeElement).toBe(origin);
});

test('Tab moves focus into the menu, on the first button', () => {
  openWithMouse();
  const event = key(origin, 'Tab');
  expect(event.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(buttons()[0]);
});

test('arrow keys, Home and End move focus between buttons', () => {
  openWithMouse();
  key(origin, 'Tab');
  const all = buttons();
  key(document.activeElement, 'ArrowRight');
  expect(document.activeElement).toBe(all[1]);
  key(document.activeElement, 'ArrowLeft');
  expect(document.activeElement).toBe(all[0]);
  key(document.activeElement, 'End');
  expect(document.activeElement).toBe(all[all.length - 1]);
  key(document.activeElement, 'Home');
  expect(document.activeElement).toBe(all[0]);
});

test('Enter activates the focused button and focus returns to where it was', () => {
  openWithMouse();
  key(origin, 'Tab');
  key(document.activeElement, 'Enter');
  expect(window.readSelection).toHaveBeenCalledTimes(1);
  expect(document.querySelector(READ)).toBeNull();
  expect(document.activeElement).toBe(origin);
});

test('Space activates the focused button', () => {
  openWithMouse();
  key(origin, 'Tab');
  key(document.activeElement, ' ');
  expect(window.readSelection).toHaveBeenCalledTimes(1);
});

test('Escape closes the menu and returns focus', () => {
  openWithMouse();
  key(origin, 'Tab');
  key(document.activeElement, 'Escape');
  expect(document.querySelector(READ)).toBeNull();
  expect(document.activeElement).toBe(origin);
});

test('Tab inside the menu leaves it and returns focus', () => {
  openWithMouse();
  key(origin, 'Tab');
  key(document.activeElement, 'Tab');
  expect(document.querySelector(READ)).toBeNull();
  expect(document.activeElement).toBe(origin);
});

test('arrow keys outside the menu are left to the page (Shift+Arrow extends a selection)', () => {
  openWithMouse();
  const event = key(origin, 'ArrowRight', { shiftKey: true });
  expect(event.defaultPrevented).toBe(false);
});

test('the menu does not auto-hide while focus is inside it', () => {
  jest.useFakeTimers();
  openWithMouse();
  key(origin, 'Tab');
  jest.advanceTimersByTime(10000);
  expect(document.querySelector(READ)).not.toBeNull();
});

test('a mouse press still keeps the page selection (default prevented)', () => {
  openWithMouse();
  const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
  document.querySelector(READ).dispatchEvent(press);
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  expect(press.defaultPrevented).toBe(true);
  expect(window.readSelection).toHaveBeenCalledTimes(1);
});

test('after Enter on a button, the next mouse selection opens the menu again', () => {
  openWithMouse();
  key(origin, 'Tab');
  key(document.activeElement, 'Enter');
  openWithMouse();
  expect(document.querySelector(READ)).not.toBeNull();
});
