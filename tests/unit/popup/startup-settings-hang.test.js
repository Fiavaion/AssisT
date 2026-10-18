/**
 * @jest-environment jsdom
 *
 * A settings request that never answers must not leave the popup busy for ever.
 *
 * While the popup starts it holds the student's clicks and marks itself aria-busy, and it lets go
 * only once start-up has finished. The settings request is the first thing start-up waits on. When
 * it never came back (a service worker that hung rather than failed), start-up never finished: the
 * popup swallowed every click, told a screen reader it was still busy, and the banner that explains
 * a settings failure never appeared.
 */

import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '../../..');
const POPUP_HTML = fs.readFileSync(path.join(ROOT, 'src/popup/popup.html'), 'utf8');

beforeAll(async () => {
  chrome.storage.onChanged = { addListener: jest.fn(), removeListener: jest.fn() };
  await import('../../../src/popup/popup.js');
});

beforeEach(() => {
  document.body.innerHTML = POPUP_HTML.slice(POPUP_HTML.indexOf('<div class="popup-container">'));
  document.documentElement.classList.add('assist-starting');
  delete document.documentElement.dataset.popupReady;
  localStorage.clear();
  window.matchMedia = jest.fn(() => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  chrome.tabs.query = jest.fn().mockResolvedValue([{ id: 7, url: 'https://example.test/' }]);
  chrome.storage.local.get = jest.fn().mockResolvedValue({});
  chrome.storage.local.set = jest.fn().mockResolvedValue(undefined);
  // The worker takes the request and never answers it.
  chrome.runtime.sendMessage = jest.fn(() => new Promise(() => {}));
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

/** Let pending promise callbacks run, a few rounds deep. */
async function settle() {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
}

it('shows the settings banner, lets clicks through and is marked ready', async () => {
  const container = document.querySelector('.popup-container');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await settle();
  expect(container.getAttribute('aria-busy')).toBe('true');

  jest.advanceTimersByTime(5000);
  await settle();
  // The requestAnimationFrame that declares the popup ready.
  jest.advanceTimersByTime(50);
  await settle();

  expect(document.getElementById('settings-failure-banner')).not.toBeNull();
  expect(container.hasAttribute('aria-busy')).toBe(false);
  expect(document.documentElement.dataset.popupReady).toBe('true');
  // The click hold is released in the same step as aria-busy; jsdom cannot send a trusted click to
  // prove it directly. The way out is usable.
  expect(document.querySelector('.settings-failure__retry').disabled).toBe(false);
});
