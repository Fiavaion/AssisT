/**
 * @jest-environment jsdom
 *
 * Reading a translation aloud uses the student's saved voice settings and the TRANSLATION's
 * language, through the shared speech helper. It used to go through the page reader, which picks a
 * voice for the page's language (an English voice reading French), and its fallback built a bare
 * utterance that ignored the saved voice, rate and volume.
 */

jest.mock('../../../src/utils/speech-voice.js', () => ({
  ...jest.requireActual('../../../src/utils/speech-voice.js'),
  createSavedUtterance: jest.fn(),
}));

const { createSavedUtterance } = require('../../../src/utils/speech-voice.js');

let openModal;
let closeModal;

beforeAll(() => {
  chrome.storage.local.get = jest.fn().mockResolvedValue({});
  chrome.storage.local.set = jest.fn().mockResolvedValue(undefined);
  require('../../../src/features/translation/translation-ui.js');
  ({ openModal, closeModal } = window.assistFeatures.translationUI);
});

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  chrome.storage.local.get = jest.fn().mockResolvedValue({});
  chrome.storage.local.set = jest.fn().mockResolvedValue(undefined);
  window.assistFeatures.translation = {
    translate: jest.fn().mockResolvedValue({ translatedText: 'Bonjour à tous' }),
  };
  window.readText = jest.fn();
  window.speechSynthesis.speak = jest.fn();
  window.speechSynthesis.cancel = jest.fn();
  // Set here, not in the factory: the suite resets mocks before each test.
  createSavedUtterance.mockImplementation(async (text, { lang } = {}) => ({
    text,
    lang,
    fromHelper: true,
  }));
  document.body.innerHTML = '<p>Hello everyone</p>';
});

afterEach(() => closeModal());

const flush = async () => {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
};

test('the translation is read with the saved voice settings, in the language it was translated into', async () => {
  openModal('Hello everyone', 'en', 'fr');
  await new Promise(resolve => setTimeout(resolve, 150));
  await flush();

  const speak = document.querySelector('[aria-label="Read translated text aloud"]');
  speak.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await flush();

  expect(createSavedUtterance).toHaveBeenCalledWith(expect.any(String), { lang: 'fr' });
  expect(window.speechSynthesis.speak).toHaveBeenCalledWith(
    expect.objectContaining({ fromHelper: true, lang: 'fr' })
  );
  expect(window.readText).not.toHaveBeenCalled();
});
