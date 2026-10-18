/**
 * When the highlight menu opens, screen reader users hear once, politely, that
 * it is there and how to reach it. Focus does not move, and selection changes
 * while it stays open do not repeat the announcement.
 */

jest.mock('../../../src/core/ui/toast.js', () => ({ showToast: jest.fn() }));

const STATUS = '#assist-hm-status';

function select(start, end) {
  const text = document.getElementById('a').firstChild;
  const range = document.createRange();
  range.setStart(text, start);
  range.setEnd(text, end);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  jest.advanceTimersByTime(100);
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

beforeEach(() => {
  jest.useFakeTimers();
  document.body.innerHTML =
    '<button id="origin">Before</button><p id="a">The quick brown fox jumps over the lazy dog.</p>';
  document.getElementById('origin').focus();
});

afterEach(() => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  jest.useRealTimers();
});

test('opening the menu announces it politely without moving focus', () => {
  select(4, 19);
  const status = document.querySelector(STATUS);
  expect(status.getAttribute('role')).toBe('status');
  expect(status.getAttribute('aria-live')).toBe('polite');
  expect(status.textContent).toMatch(/press tab/i);
  expect(document.activeElement).toBe(document.getElementById('origin'));
});

test('the announcement sits outside the menu, so it survives the menu being rebuilt', () => {
  select(4, 19);
  const status = document.querySelector(STATUS);
  expect(status).not.toBeNull();
  expect(document.querySelector('#assist-highlight-menu').contains(status)).toBe(false);
});

test('changing the selection while the menu is open does not announce again', () => {
  select(4, 19);
  const status = document.querySelector(STATUS);
  status.textContent = 'already heard';
  select(4, 25);
  expect(status.textContent).toBe('already heard');
});

test('closing and reopening the menu announces again', () => {
  select(4, 19);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(document.querySelector(STATUS).textContent).toBe('');
  select(4, 19);
  expect(document.querySelector(STATUS).textContent).toMatch(/press tab/i);
});
