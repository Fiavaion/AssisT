/**
 * @jest-environment jsdom
 *
 * Add by DOI sends the DOI to CrossRef, so it goes through the consent the student gave (ADR 0006).
 * After a "not now", the library says that nothing was looked up and why, and offers Allow right
 * next to the form, instead of opening an empty wizard as if the lookup had simply found nothing.
 */

import 'fake-indexeddb/auto';
import { clearCitations } from '../citations/helpers/clear-citations.js';
import { installCitationRpcBridge } from '../citations/helpers/rpc-bridge.js';

jest.mock('../../../src/features/shared/ai-feature-client.js', () => ({
  getAIMode: jest.fn(async () => ({ isOff: true })),
}));

jest.mock('../../../src/features/citations/crossref-api.js', () => ({
  ...jest.requireActual('../../../src/features/citations/crossref-api.js'),
  lookUpDOI: jest.fn(),
}));

const SKELETON = `
  <header class="assist-lib-header" id="assist-lib-header"></header>
  <div class="assist-lib-layout">
    <div id="assist-lib-sidebar-host"></div>
    <main id="assist-lib-main" class="assist-lib-main" tabindex="-1" aria-label="Your citations">
      <p id="assist-lib-loading">Loading…</p>
    </main>
  </div>`;

// Generous: the page mounts over fake IndexedDB, which is slow when the whole suite is running.
async function waitFor(check, timeoutMs = 20000) {
  const start = Date.now();
  while (!check() && Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 25));
  }
}

jest.setTimeout(60000);

let lookUpDOI;

beforeEach(async () => {
  jest.resetModules();
  document.body.innerHTML = SKELETON;
  chrome.runtime.sendMessage.mockResolvedValue({});
  installCitationRpcBridge();
  ({ lookUpDOI } = require('../../../src/features/citations/crossref-api.js'));
  lookUpDOI.mockResolvedValue({ status: 'declined', metadata: null });
  await import('../../../src/pages/citation-library/library.js');
  await waitFor(() => !document.getElementById('assist-lib-loading'));
});

afterEach(async () => {
  await clearCitations();
});

test('after "not now", says nothing was looked up, offers Allow, and opens no wizard', async () => {
  const form = document.querySelector('.assist-lib-header__doiform');
  form.querySelector('input').value = '10.1000/xyz123';
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));

  await waitFor(() => document.querySelector('[data-assist-consent-notice]'));

  expect(lookUpDOI).toHaveBeenCalledWith('10.1000/xyz123');
  const notice = document.querySelector('[data-assist-consent-notice]');
  expect(notice.getAttribute('role')).toBe('alert');
  expect(notice.textContent).toMatch(/nothing was sent/i);
  expect(notice.querySelector('button').textContent).toMatch(/Allow Crossref/);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

test('a second try replaces the message rather than stacking another', async () => {
  const form = document.querySelector('.assist-lib-header__doiform');
  form.querySelector('input').value = '10.1000/xyz123';
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => document.querySelector('[data-assist-consent-notice]'));
  await waitFor(() => !form.querySelector('button').disabled);

  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => lookUpDOI.mock.calls.length === 2);
  await waitFor(() => !form.querySelector('button').disabled);

  expect(document.querySelectorAll('[data-assist-consent-notice]')).toHaveLength(1);
});

test('a DOI Crossref does not know says so, and opens no wizard holding only the DOI', async () => {
  lookUpDOI.mockResolvedValue({ status: 'not-found', metadata: null });
  const form = document.querySelector('.assist-lib-header__doiform');
  form.querySelector('input').value = '10.1000/nosuchthing';
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => lookUpDOI.mock.calls.length === 1);
  await waitFor(() => !form.querySelector('button').disabled);

  expect(document.body.textContent).toMatch(
    /Couldn’t find that DOI — check it, or add the source manually/
  );
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  // The DOI stays in the box, so a typo can be fixed rather than retyped.
  expect(form.querySelector('input').value).toBe('10.1000/nosuchthing');
});

test('a lookup that could not reach Crossref says so, and opens no empty wizard', async () => {
  lookUpDOI.mockResolvedValue({ status: 'failed', metadata: null });
  const form = document.querySelector('.assist-lib-header__doiform');
  form.querySelector('input').value = '10.1000/xyz123';
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await waitFor(() => lookUpDOI.mock.calls.length === 1);
  await waitFor(() => !form.querySelector('button').disabled);

  expect(document.body.textContent).toMatch(/could not reach Crossref/i);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

// Review finding: Add is disabled while the lookup runs, and Chrome drops the focus of a disabled
// button to <body>, so the toast that follows arrived with the keyboard user's place lost. (jsdom
// does not blur a disabled button, so the assertion is on where the focus is put, not on BODY.)
test('pressing Add keeps the keyboard place in the DOI box through the lookup', async () => {
  lookUpDOI.mockResolvedValue({ status: 'not-found', metadata: null });
  const form = document.querySelector('.assist-lib-header__doiform');
  const input = form.querySelector('input');
  const add = form.querySelector('button');
  input.value = '10.1000/nosuchthing';
  add.focus();
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  expect(document.activeElement).toBe(input);
  await waitFor(() => lookUpDOI.mock.calls.length === 1);
  await waitFor(() => !add.disabled);
  expect(document.activeElement).toBe(input);
});
