/**
 * @jest-environment jsdom
 *
 * After Allow on the first-use question for translation, the keyboard stays in the translation
 * dialog (ADR 0006, SC 2.4.3). The dialog's Translate button is disabled while the request runs,
 * so it cannot take focus back when the consent panel closes; focus fell to the page behind an
 * aria-modal dialog. Driven with the real translation dialog, the real translation client and the
 * real consent route, which from a page is the consent window (ADR 0009): its answer arrives as a
 * message, after the student has been in another window.
 */

const settle = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms));

let openModal;
let closeModal;

// Chrome will not focus a disabled button; jsdom does. Without this the test would pass in jsdom
// on exactly the code that drops focus in Chrome.
const jsdomFocus = HTMLElement.prototype.focus;
beforeAll(() => {
  HTMLElement.prototype.focus = function focus(...args) {
    if (this.disabled === true) {
      return;
    }
    jsdomFocus.apply(this, args);
  };
});
afterAll(() => {
  HTMLElement.prototype.focus = jsdomFocus;
});

beforeAll(async () => {
  chrome.storage.local.get = jest.fn().mockResolvedValue({});
  chrome.storage.local.set = jest.fn().mockResolvedValue(undefined);
  chrome.storage.onChanged = { addListener: jest.fn() };
  require('../../../src/features/translation/translation-api.js');
  require('../../../src/features/translation/translation-ui.js');
  await settle();
  ({ openModal, closeModal } = window.assistFeatures.translationUI);
});

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  chrome.storage.local.get = jest.fn().mockResolvedValue({});
  chrome.storage.local.set = jest.fn().mockResolvedValue(undefined);
  document.body.innerHTML = '<p id="para">Good morning to everyone in the class.</p>';
});

afterEach(() => {
  closeModal();
});

let windowAnswer;

/** The consent window has been asked for (ADR 0009): a page has no chrome.permissions. */
async function untilWindowAsked() {
  const asked = () =>
    chrome.runtime.sendMessage.mock.calls.some(([m]) => m?.type === 'CONSENT_WINDOW_OPEN');
  for (let i = 0; i < 50 && !asked(); i += 1) {
    await settle(10);
  }
  await settle(10);
}

function answerFromWindow(answer) {
  windowAnswer({ type: 'CONSENT_WINDOW_ANSWER', request: 'r1', answer });
}

beforeEach(() => {
  chrome.runtime.onMessage.addListener.mockImplementation(listener => {
    windowAnswer = listener;
  });
});

test('Allow keeps the keyboard in the translation dialog', async () => {
  chrome.runtime.sendMessage = jest
    .fn()
    .mockResolvedValueOnce({ success: false, code: 'consent-unasked', destination: 'translation' })
    .mockResolvedValueOnce({ success: true, request: 'r1' })
    .mockResolvedValueOnce({ success: true, data: { translatedText: 'Bonjour à tous.' } });

  openModal('Good morning to everyone in the class.', 'en', 'fr', {
    returnFocus: document.getElementById('para'),
  });
  await untilWindowAsked();
  answerFromWindow('granted');
  await settle(0);

  const modal = document.getElementById('assist-translation-modal');
  // While the translation it allowed is still running, focus is already back inside the dialog.
  expect(modal.contains(document.activeElement)).toBe(true);

  await settle(60);
  expect(document.getElementById('assist-translation-translated-text').textContent).toBe(
    'Bonjour à tous.'
  );
  expect(modal.contains(document.activeElement)).toBe(true);
});

test('"Not now" also leaves the keyboard in the translation dialog, beside the explanation', async () => {
  chrome.runtime.sendMessage = jest
    .fn()
    .mockResolvedValueOnce({ success: false, code: 'consent-unasked', destination: 'translation' })
    .mockResolvedValueOnce({ success: true, request: 'r1' });

  openModal('See you tomorrow in the library.', 'en', 'fr', {
    returnFocus: document.getElementById('para'),
  });
  await untilWindowAsked();
  answerFromWindow('declined');
  await settle(60);

  const modal = document.getElementById('assist-translation-modal');
  expect(modal.textContent).toMatch(/Nothing was sent/);
  expect(modal.contains(document.activeElement)).toBe(true);
});
