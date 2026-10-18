/**
 * @jest-environment jsdom
 *
 * After Allow on the first-use question, the keyboard ends up in the definition the student asked
 * for (ADR 0006, SC 2.4.3). Found in headed Chrome: the definition appeared and focus was not in
 * it, because each dictionary dialog took focus only on a timer after it was drawn, so for a
 * moment focus sat on the page behind (and before the panel opened, the panel could remember the
 * page rather than the dialog as the place to go back to). Driven with the real dictionary and
 * the real consent route, which from a page is the consent window (ADR 0009).
 */

const settle = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms));

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

let lookup;
let hide;

beforeAll(() => {
  chrome.storage.local.get = jest.fn(() => Promise.resolve({}));
  require('../../../src/features/dictionary/dictionary.js');
  ({ lookup, hide } = window.assistFeatures.dictionary);
});

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  chrome.storage.local.get = jest.fn(() => Promise.resolve({}));
  chrome.storage.local.set = jest.fn(() => Promise.resolve());
  document.body.innerHTML = '<p id="para">People with <span id="word">dyslexia</span></p>';
});

afterEach(() => {
  hide();
});

test('Allow in the consent window leaves the keyboard in the definition', async () => {
  // A page has no chrome.permissions, so the question comes from the consent window (ADR 0009);
  // its answer arrives as a message, and focus has to land in the definition all the same.
  let windowAnswer;
  chrome.runtime.onMessage.addListener.mockImplementation(listener => {
    windowAnswer = listener;
  });
  chrome.runtime.sendMessage = jest
    .fn()
    .mockResolvedValueOnce({ success: false, code: 'consent-unasked', destination: 'dictionary' })
    .mockResolvedValueOnce({ success: true, request: 'r1' })
    .mockResolvedValueOnce(DEFINITION);

  const done = lookup('dyslexia', { returnFocus: document.getElementById('para') });
  await settle();
  windowAnswer({ type: 'CONSENT_WINDOW_ANSWER', request: 'r1', answer: 'granted' });
  await done;

  // The moment the definition is on screen, not a tick later: in Chrome a check made as soon as
  // the text appeared found focus outside it, because the dialog only took focus on a timer.
  const modal = document.getElementById('assist-dictionary-modal');
  expect(modal.textContent).toMatch(/A reading difficulty/);
  expect(modal.contains(document.activeElement)).toBe(true);

  await settle();
  expect(modal.contains(document.activeElement)).toBe(true);
});

test('the waiting dialog holds the keyboard from the moment it opens', async () => {
  chrome.runtime.sendMessage = jest.fn(() => new Promise(() => {}));
  lookup('dyslexia', { returnFocus: document.getElementById('para') });
  const modal = document.getElementById('assist-dictionary-modal');
  expect(modal.contains(document.activeElement)).toBe(true);
});
