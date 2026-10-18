/**
 * Study-suite discovery tip — shows once, dismisses forever, and stays out of the way of the text
 * it is talking about.
 *
 * The first version was a 360x420px panel that covered the right-hand end of the body text until
 * the student pressed "Got it" (overnight release testing, W1 finding 7): a hint about reading that
 * stopped them reading. So the shape is under test as well as the behaviour.
 */
jest.mock('../../../src/features/companion/companion-settings.js', () => ({
  isCompanionEnabled: jest.fn(),
}));
jest.mock('../../../src/features/companion/companion-ui.js', () => ({
  ...jest.requireActual('../../../src/features/companion/companion-ui.js'),
  isLmsHost: jest.fn(() => true),
}));
jest.mock('../../../src/content/utils/frame.js', () => ({ isTopFrame: jest.fn(() => true) }));

import { isCompanionEnabled } from '../../../src/features/companion/companion-settings.js';
import { isLmsHost } from '../../../src/features/companion/companion-ui.js';
import { isTopFrame } from '../../../src/content/utils/frame.js';
import { init, cleanup } from '../../../src/features/companion/study-suite-ui.js';

let store;

beforeEach(() => {
  store = {};
  document.body.innerHTML = '';
  isCompanionEnabled.mockResolvedValue(true);
  isLmsHost.mockReturnValue(true);
  isTopFrame.mockReturnValue(true);
  chrome.storage.local.get.mockImplementation(async key => {
    return key in store ? { [key]: store[key] } : {};
  });
  chrome.storage.local.set.mockImplementation(async obj => {
    Object.assign(store, obj);
  });
});

afterEach(() => cleanup());

test('shows the tip card on first visit with the tool list', async () => {
  await init();
  const card = document.getElementById('assist-companion-study-tip');
  expect(card).not.toBeNull();
  expect(card.textContent).toContain('Summarize');
  expect(card.textContent).toContain('Tutor');
});

test('does nothing when the feature is toggled off', async () => {
  isCompanionEnabled.mockResolvedValue(false);
  await init();
  expect(document.getElementById('assist-companion-study-tip')).toBeNull();
});

test('never shows again after Got it', async () => {
  await init();
  const gotIt = [...document.querySelectorAll('button')].find(b =>
    b.textContent.includes('Got it')
  );
  gotIt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  await Promise.resolve();
  expect(store.companionStudyTipSeen).toBe(true);
  expect(document.getElementById('assist-companion-study-tip')).toBeNull();

  await init();
  expect(document.getElementById('assist-companion-study-tip')).toBeNull();
});

test('double init does not duplicate the card', async () => {
  await init();
  await init();
  expect(document.querySelectorAll('#assist-companion-study-tip')).toHaveLength(1);
});

test('is a compact card, not a panel over the text', async () => {
  await init();
  const card = document.getElementById('assist-companion-study-tip');

  expect(card.classList.contains('assist-companion-card--compact')).toBe(true);
  // A quarter of the viewport height, floored at a height a hint is still readable in, and
  // narrow enough for a 320px screen.
  const compactRule = document
    .getElementById('assist-companion-styles')
    .textContent.split('.assist-companion-card--compact {')[1]
    .split('}')[0];
  expect(compactRule).toContain('max-height: max(120px, 25vh)');
  expect(compactRule).toContain('width: min(300px, calc(100% - 32px))');
});

test('Escape dismisses it, and it does not come back', async () => {
  await init();
  expect(document.getElementById('assist-companion-study-tip')).not.toBeNull();

  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await Promise.resolve();

  expect(document.getElementById('assist-companion-study-tip')).toBeNull();
  expect(store.companionStudyTipSeen).toBe(true);

  await init();
  expect(document.getElementById('assist-companion-study-tip')).toBeNull();
});

test('a later Escape does nothing once the card has gone', async () => {
  await init();
  const card = document.getElementById('assist-companion-study-tip');
  card.querySelector('.assist-companion-card__close').dispatchEvent(
    new MouseEvent('mousedown', { bubbles: true, cancelable: true })
  );
  await Promise.resolve();
  expect(document.getElementById('assist-companion-study-tip')).toBeNull();

  // The listener must have gone with the card, not stayed on the document.
  expect(() =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  ).not.toThrow();
  expect(document.getElementById('assist-companion-study-tip')).toBeNull();
});

test('never appears inside an iframe', async () => {
  isTopFrame.mockReturnValue(false);
  await init();
  expect(document.getElementById('assist-companion-study-tip')).toBeNull();
});

test('an SPA teardown is not a dismissal, so the tip is still owed', async () => {
  await init();
  cleanup();

  expect(store.companionStudyTipSeen).toBeUndefined();

  await init();
  expect(document.getElementById('assist-companion-study-tip')).not.toBeNull();
});
