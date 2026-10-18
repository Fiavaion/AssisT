/**
 * @jest-environment jsdom
 *
 * The consent window's page (ADR 0009). It is where a question started in a web page is answered
 * when the service also needs a Chrome host: the same words as the in-page panel, and an Allow that
 * asks Chrome for the host and records the answer in the one press. Being an extension window, it
 * cannot be covered or clicked by the page, so it needs none of the panel's defences.
 */

import fs from 'fs';
import path from 'path';

import { initConsentWindow } from '../../../src/pages/consent/consent.js';
import { consentStorageKey } from '../../../src/utils/consent.js';

const ROOT = path.join(__dirname, '../../..');
const HTML = fs.readFileSync(path.join(ROOT, 'src/pages/consent/consent.html'), 'utf8');

let session;
let stored;

function button(name) {
  return [...document.querySelectorAll('button')].find(b => b.textContent.trim() === name);
}

function mousedown(target) {
  target.dispatchEvent(
    new window.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 })
  );
}

function press(key, target = document.activeElement, init = {}) {
  target.dispatchEvent(
    new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  );
}

async function settle() {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
}

async function open(entry = {}) {
  session['assist_consent_window_r1'] = {
    destination: 'dictionary',
    detail: 'dyslexia',
    detailLabel: '',
    declinedBefore: false,
    tabId: 7,
    frameId: 0,
    windowId: 42,
    ...entry,
  };
  await initConsentWindow(document, '?request=r1');
}

beforeEach(() => {
  document.documentElement.innerHTML = HTML.replace(/^<!doctype html>/i, '');
  jest.spyOn(console, 'log').mockImplementation(() => {});
  session = {};
  stored = {};
  chrome.storage.session = {
    get: jest.fn(async key =>
      Object.fromEntries([].concat(key).filter(k => k in session).map(k => [k, session[k]]))
    ),
  };
  chrome.storage.local.set = jest.fn(async values => Object.assign(stored, values));
  chrome.runtime.sendMessage = jest.fn().mockResolvedValue({ success: true });
  chrome.permissions = { request: jest.fn().mockResolvedValue(true) };
});

afterEach(() => {
  delete chrome.permissions;
  delete chrome.storage.session;
  jest.restoreAllMocks();
});

describe('what the window says', () => {
  test('names the service, says what is sent and shows exactly what this time', async () => {
    await open();
    expect(document.querySelector('h1').textContent).toBe('Use Free Dictionary?');
    expect(document.body.textContent).toContain(
      'To look up words, AssisT sends the word you selected to Free Dictionary, an online service.'
    );
    expect(document.body.textContent).toContain('“dyslexia”');
    expect(document.title).toBe('AssisT: use Free Dictionary?');
  });

  test('says when the student said no before', async () => {
    await open({ declinedBefore: true });
    expect(document.body.textContent).toContain(
      'Earlier you chose not to allow this, so nothing was sent.'
    );
  });

  test('for OCR languages, says only the language file is downloaded', async () => {
    await open({ destination: 'ocrLanguages', detail: 'Spanish', detailLabel: 'The language is:' });
    expect(document.querySelector('h1').textContent).toBe('Use jsDelivr?');
    expect(document.body.textContent).toMatch(/language file/);
    expect(document.body.textContent).toMatch(/no image and no text from the page/i);
    expect(document.body.textContent).toContain('The language is:');
  });

  test('starts on Not now, the answer that sends nothing', async () => {
    await open();
    expect(document.activeElement).toBe(button('Not now'));
  });

  test('a question that is no longer open says so and offers only Close', async () => {
    await initConsentWindow(document, '?request=gone');
    expect(document.body.textContent).toMatch(/no longer open/i);
    expect(button('Allow')).toBeUndefined();
    expect(button('Close')).toBeDefined();
  });
});

describe('answering', () => {
  function status() {
    return document.getElementById('consent-status');
  }
  const allowButton = () => button('Allow');
  const notNowButton = () => button('Not now');

  test('Allow asks Chrome for the host in the same press, then hands the yes to the worker', async () => {
    await open();
    mousedown(button('Allow'));

    expect(chrome.permissions.request).toHaveBeenCalledWith({
      origins: ['https://api.dictionaryapi.dev/*'],
    });
    await settle();
    // The worker records it, once it has checked the question is still open; the page does not.
    expect(stored[consentStorageKey('dictionary')]).toBeUndefined();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'CONSENT_WINDOW_ANSWERED',
      request: 'r1',
      answer: 'granted',
    });
  });

  test('says it is asking Chrome while Chrome’s own prompt is up', async () => {
    chrome.permissions.request.mockReturnValue(new Promise(() => {}));
    await open();
    mousedown(button('Allow'));
    expect(status().textContent).toBe('Asking Chrome for access…');
  });

  test('Allow from the keyboard does the same', async () => {
    await open();
    button('Allow').focus();
    press('Enter');
    expect(chrome.permissions.request).toHaveBeenCalledTimes(1);
  });

  test('a right-click or middle-click is not an answer', async () => {
    // As in the in-page panel: only the primary button says yes, or no.
    await open();
    for (const button of [1, 2]) {
      [allowButton(), notNowButton()].forEach(target =>
        target.dispatchEvent(
          new window.MouseEvent('mousedown', { bubbles: true, cancelable: true, button })
        )
      );
    }
    await settle();
    expect(chrome.permissions.request).not.toHaveBeenCalled();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  test('a key held down is not an answer', async () => {
    await open();
    button('Allow').focus();
    press('Enter', button('Allow'), { repeat: true });
    press('Escape', document.activeElement, { repeat: true });
    await settle();
    expect(chrome.permissions.request).not.toHaveBeenCalled();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  test('a refused Chrome prompt is answered as a no', async () => {
    chrome.permissions.request.mockResolvedValue(false);
    await open();
    mousedown(button('Allow'));
    await settle();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ answer: 'declined' })
    );
  });

  test.each([
    ['Not now', () => mousedown(button('Not now'))],
    ['Escape', () => press('Escape')],
  ])('%s answers no and asks Chrome nothing', async (_, act) => {
    await open();
    act();
    await settle();
    expect(chrome.permissions.request).not.toHaveBeenCalled();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'CONSENT_WINDOW_ANSWERED',
      request: 'r1',
      answer: 'declined',
    });
  });

  test('a question the worker no longer holds says so, with only Close', async () => {
    chrome.runtime.sendMessage.mockResolvedValue({ success: false });
    await open();
    mousedown(button('Not now'));
    await settle();
    expect(status().textContent).toBe(
      'This question was already closed, so nothing was recorded. You can close this window.'
    );
    expect(button('Allow')).toBeUndefined();
    expect(button('Close')).toBeDefined();
  });

  test('a second press while the first is answered does nothing more', async () => {
    await open();
    mousedown(button('Allow'));
    mousedown(button('Allow'));
    await settle();
    expect(chrome.permissions.request).toHaveBeenCalledTimes(1);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
  });
});
