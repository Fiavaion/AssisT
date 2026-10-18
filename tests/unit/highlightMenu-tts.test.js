/**
 * Highlight menu "Read Aloud (TTS)": hands the selection range to the content
 * script's selection reader (word-by-word over the selected words only) and
 * never blocks the page with a native alert.
 */

jest.mock('../../src/core/ui/toast.js', () => ({ showToast: jest.fn() }));

import { showToast } from '../../src/core/ui/toast.js';

function selectWords(text, start, end) {
  const range = document.createRange();
  range.setStart(text, start);
  range.setEnd(text, end);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  return range;
}

function pressRead() {
  const button = document.querySelector('[aria-label="Read Aloud (TTS)"]');
  // A whole click. The menu is gone by mouseup, so the release lands on the page, where it is
  // swallowed so the menu does not reopen.
  button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
}

beforeAll(() => {
  // jsdom has no layout; the menu only needs a rectangle to position itself.
  Range.prototype.getBoundingClientRect = () => ({
    top: 0,
    bottom: 10,
    left: 0,
    right: 10,
    width: 10,
    height: 10,
  });
  // The menu self-initialises on load and subscribes to settings changes.
  global.chrome.storage.onChanged = { addListener: jest.fn() };
  require('../../src/features/highlightMenu/highlightMenu.js');
});

beforeEach(() => {
  document.body.innerHTML = '<p id="a">The quick brown fox jumps over the lazy dog.</p>';
  window.alert = jest.fn();
});

afterEach(() => {
  delete window.readSelection;
});

test('reads the selection range, not the whole surrounding element', () => {
  window.readSelection = jest.fn(() => true);
  selectWords(document.getElementById('a').firstChild, 4, 19);
  pressRead();
  expect(window.readSelection).toHaveBeenCalledTimes(1);
  expect(window.readSelection.mock.calls[0][0].toString()).toBe('quick brown fox');
});

test('closes the menu after starting to read', () => {
  window.readSelection = jest.fn(() => true);
  selectWords(document.getElementById('a').firstChild, 4, 19);
  pressRead();
  expect(document.querySelector('[aria-label="Read Aloud (TTS)"]')).toBeNull();
});

test('when reading is unavailable it tells the student in the page, never with alert()', () => {
  selectWords(document.getElementById('a').firstChild, 4, 19);
  pressRead();
  expect(window.alert).not.toHaveBeenCalled();
  expect(showToast).toHaveBeenCalledTimes(1);
  expect(showToast.mock.calls[0][0]).toMatch(/read aloud/i);
});
