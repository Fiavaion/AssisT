/**
 * @jest-environment jsdom
 *
 * Dictionary lookup sends the selected word to the Free Dictionary service, so it asks first
 * (ADR 0006). The content script never fetches; it asks the service worker, and every case here
 * checks that no fetch happened in this realm at all.
 */

jest.mock('../../../src/utils/consent-panel.js', () => ({
  ...jest.requireActual('../../../src/utils/consent-panel.js'),
  askForConsent: jest.fn(),
}));

const { askForConsent } = require('../../../src/utils/consent-panel.js');

const DEFINITION = {
  success: true,
  data: [
    {
      word: 'dyslexia',
      phonetics: [],
      meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'A reading difficulty' }] }],
    },
  ],
};
const UNASKED = { success: false, code: 'consent-unasked', destination: 'dictionary' };
const DECLINED = { success: false, code: 'consent-declined', destination: 'dictionary' };

let lookup;

function modal() {
  return document.getElementById('assist-dictionary-modal');
}

async function flush() {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
  jest.advanceTimersByTime(50);
}

beforeAll(() => {
  chrome.storage.local.get = jest.fn(() => Promise.resolve({}));
  require('../../../src/features/dictionary/dictionary.js');
  lookup = window.assistFeatures.dictionary.lookup;
});

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  global.fetch = jest.fn();
  chrome.runtime.sendMessage = jest.fn();
  chrome.storage.local.get = jest.fn(() => Promise.resolve({}));
  chrome.storage.local.set = jest.fn(() => Promise.resolve());
  askForConsent.mockReset();
  document.body.innerHTML = '<p id="para">Dyslexia is a learning disability</p>';
});

afterEach(() => {
  window.assistFeatures.dictionary.hide();
  jest.useRealTimers();
});

test('first use asks, naming the word, and Allow completes the lookup', async () => {
  chrome.runtime.sendMessage.mockResolvedValueOnce(UNASKED).mockResolvedValueOnce(DEFINITION);
  askForConsent.mockResolvedValue('granted');

  await lookup('Dyslexia');
  await flush();

  expect(askForConsent).toHaveBeenCalledWith(
    'dictionary',
    expect.objectContaining({ detail: 'dyslexia' })
  );
  expect(modal().textContent).toMatch(/A reading difficulty/);
  expect(global.fetch).not.toHaveBeenCalled();
});

test('"not now" sends nothing and says so, with Allow in the message', async () => {
  chrome.runtime.sendMessage.mockResolvedValueOnce(UNASKED);
  askForConsent.mockResolvedValue('declined');

  await lookup('reading');
  await flush();

  expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
  expect(global.fetch).not.toHaveBeenCalled();
  expect(modal().getAttribute('role')).toBe('dialog');
  expect(modal().textContent).toMatch(/nothing was sent/i);
  expect(modal().textContent).toMatch(/Free Dictionary/);
  expect(modal().querySelector('[data-assist-consent-notice] button').textContent).toMatch(
    /Allow Free Dictionary/
  );
  expect(modal().contains(document.activeElement)).toBe(true);
  // Not "could not reach the dictionary", and not "word not found": neither is true.
  expect(modal().textContent).not.toMatch(/could not reach|could not find/i);
});

test('a recorded no is not asked again, and still explains itself', async () => {
  chrome.runtime.sendMessage.mockResolvedValue(DECLINED);

  await lookup('spelling');
  await flush();

  expect(askForConsent).not.toHaveBeenCalled();
  expect(global.fetch).not.toHaveBeenCalled();
  expect(modal().textContent).toMatch(/nothing was sent/i);
});

test('Allow in the message asks again saying the earlier answer was no, with the word', async () => {
  // The question asked from the message must carry what the first one did: the word that would
  // be sent, and that the student said no before (the consent window shows both).
  chrome.runtime.sendMessage.mockResolvedValue(DECLINED);
  await lookup('Spelling');
  await flush();

  // The notice asks through the real panel module, which from a page opens the consent window.
  const allow = modal().querySelector('[data-assist-consent-notice] button');
  allow.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await flush();

  expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'CONSENT_WINDOW_OPEN',
      destination: 'dictionary',
      detail: 'spelling',
      declinedBefore: true,
    })
  );
});

test('a word the dictionary does not know is still "not found"', async () => {
  chrome.runtime.sendMessage.mockResolvedValue({ success: false, code: 'not-found' });

  await lookup('zzqx');
  await flush();

  expect(modal().textContent).toMatch(/could not find a definition/i);
});
