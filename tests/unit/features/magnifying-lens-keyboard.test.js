/**
 * @jest-environment jsdom
 *
 * A magnifier a keyboard-only student can aim.
 *
 * The lens was driven entirely by mousemove: no key moved it, resized it, or put it away. A
 * student who magnifies because they cannot see the page is exactly the student most likely to
 * be driving it from the keyboard or a switch, so this was the feature failing the people it
 * was written for (WCAG 2.2 SC 2.1.1).
 */

const mockShowToast = jest.fn();
jest.mock('../../../src/core/ui/toast.js', () => ({
  showToast: (...args) => mockShowToast(...args),
}));

const mockSaveSetting = jest.fn();
jest.mock('../../../src/content/utils/storage-utils.js', () => ({
  initFeatureSettings: jest.fn(),
  getSettings: jest.fn(),
  onSettingsChange: jest.fn(),
  saveSetting: (...args) => mockSaveSetting(...args),
}));

import { applySettings, cleanup } from '../../../src/features/magnifyingLens/magnifying-lens.js';
import { Z } from '../../../src/utils/z-index.js';

const LENS = '#assist-magnifying-lens';
const lens = () => document.querySelector(LENS);
const left = () => parseFloat(lens().style.left);

const BASE = { enabled: true, scale: 2.0, size: 275, offsetEnabled: false, lock: false };

/** Give an element a real box, which jsdom otherwise reports as all zeroes. */
function withBox(element, box) {
  element.getBoundingClientRect = () => ({
    top: box.top,
    bottom: box.top + box.height,
    left: box.left,
    right: box.left + box.width,
    width: box.width,
    height: box.height,
    x: box.left,
    y: box.top,
  });
  return element;
}

function turnOn(overrides = {}) {
  applySettings({ ...BASE, ...overrides }, true);
}

beforeEach(() => {
  document.body.innerHTML = '';
  mockSaveSetting.mockClear();
  mockShowToast.mockClear();
});

afterEach(() => {
  cleanup();
});

test('the magnified copy of the page is hidden from assistive tech', () => {
  turnOn();
  expect(lens().getAttribute('aria-hidden')).toBe('true');
});

test('nothing in the magnified copy of the page is a second tab stop', () => {
  // aria-hidden silenced the clone but left every cloned control focusable, so with the lens on a
  // student tabbing through the page hit each one twice, the second time with nothing announced.
  document.body.insertAdjacentHTML(
    'beforeend',
    '<a href="#syllabus">Syllabus</a><input id="answer" aria-label="Answer">'
  );

  turnOn();

  expect(lens().hasAttribute('inert')).toBe(true);
  // The clone really is in there, and it really is the thing inert is covering.
  expect(lens().querySelectorAll('a[href], input')).not.toHaveLength(0);
  for (const control of lens().querySelectorAll('a[href], input, button, [tabindex]')) {
    expect(control.closest('[inert]')).toBe(lens());
  }
});

test('switch-on says how to start and where the whole key list lives', () => {
  turnOn();

  expect(mockShowToast).toHaveBeenCalledTimes(1);
  const [message] = mockShowToast.mock.calls[0];
  // Short enough to be held: the old announcement was 45 words in a two-second toast.
  expect(message.split(/\s+/).length).toBeLessThanOrEqual(25);
  expect(message).toMatch(/Escape/);
  // Consistent help (SC 3.2.6): the keys are somewhere the student can go back to.
  expect(message).toMatch(/help page/i);
});

test('the lens stacks on a layer from the shared scale, not a raw literal', () => {
  turnOn();
  expect(lens().style.zIndex).toBe(String(Z.FOCUS));
});

test('the lens goes to the element the student tabs to', () => {
  const para = withBox(document.createElement('p'), { top: 300, left: 400, width: 200, height: 40 });
  document.body.appendChild(para);
  turnOn();

  para.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

  expect(left()).toBe(500 - 275 / 2);
  expect(parseFloat(lens().style.top)).toBe(320 - 275 / 2);
});

test('the lens follows the caret into a text field', () => {
  const field = withBox(document.createElement('textarea'), {
    top: 200,
    left: 300,
    width: 200,
    height: 40,
  });
  document.body.appendChild(field);
  turnOn();
  field.focus();

  document.dispatchEvent(new Event('selectionchange'));

  expect(left()).toBe(400 - 275 / 2);
});

test('Alt and the arrow keys nudge the lens, Shift nudges it further', () => {
  const para = withBox(document.createElement('p'), { top: 300, left: 400, width: 200, height: 40 });
  document.body.appendChild(para);
  turnOn();
  para.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  const start = left();

  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true }));
  expect(left()).toBe(start + 40);

  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true, shiftKey: true })
  );
  expect(left()).toBe(start + 40 - 160);
});

test('a bare arrow key is left to the page', () => {
  turnOn();
  const before = left();

  const event = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true });
  document.dispatchEvent(event);

  expect(left()).toBe(before);
  expect(event.defaultPrevented).toBe(false);
});

test('the student can change the zoom from the keyboard, and it is remembered', () => {
  turnOn();

  document.dispatchEvent(new KeyboardEvent('keydown', { key: '=', altKey: true }));

  expect(mockSaveSetting).toHaveBeenCalledWith(
    'magnifyingLens',
    expect.objectContaining({ scale: 2.25 })
  );
});

test('the student can change the lens size from the keyboard, and it is remembered', () => {
  turnOn();

  document.dispatchEvent(new KeyboardEvent('keydown', { key: ']', altKey: true }));

  expect(mockSaveSetting).toHaveBeenCalledWith(
    'magnifyingLens',
    expect.objectContaining({ size: 300 })
  );
});

test('Escape puts the lens away and remembers that it is off', () => {
  turnOn();

  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

  expect(lens()).toBeNull();
  expect(mockSaveSetting).toHaveBeenCalledWith(
    'magnifyingLens',
    expect.objectContaining({ enabled: false })
  );
});

test('switching off drops every keyboard listener it added', () => {
  turnOn();
  applySettings({ ...BASE, enabled: false }, false);

  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true }));

  expect(lens()).toBeNull();
});
