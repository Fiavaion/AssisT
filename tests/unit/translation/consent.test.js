/**
 * @jest-environment jsdom
 *
 * Translation sends the selected text to MyMemory, so it asks first (ADR 0006). The content script
 * never fetches; it asks the service worker, and every case checks no fetch happened here.
 */

jest.mock('../../../src/utils/consent-panel.js', () => ({
  ...jest.requireActual('../../../src/utils/consent-panel.js'),
  askForConsent: jest.fn(),
}));

const UNASKED = { success: false, code: 'consent-unasked', destination: 'translation' };
const DECLINED = { success: false, code: 'consent-declined', destination: 'translation' };

let translate;
let askForConsent;

beforeEach(async () => {
  jest.resetModules();
  ({ askForConsent } = require('../../../src/utils/consent-panel.js'));
  askForConsent.mockReset();
  global.fetch = jest.fn();
  chrome.runtime.sendMessage = jest.fn();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  chrome.storage.local.get = jest.fn().mockResolvedValue({});
  chrome.storage.local.set = jest.fn().mockResolvedValue(undefined);
  chrome.storage.onChanged = { addListener: jest.fn() };
  require('../../../src/features/translation/translation-api.js');
  await Promise.resolve();
  await Promise.resolve();
  translate = window.assistFeatures.translation.translate;
});

test('first use asks, showing the text, and Allow completes the translation', async () => {
  chrome.runtime.sendMessage
    .mockResolvedValueOnce(UNASKED)
    .mockResolvedValueOnce({ success: true, data: { translatedText: 'Hola' } });
  askForConsent.mockResolvedValue('granted');

  const result = await translate('Hello', 'es', 'en');

  expect(askForConsent).toHaveBeenCalledWith(
    'translation',
    expect.objectContaining({ detail: 'Hello' })
  );
  expect(result.translatedText).toBe('Hola');
  expect(global.fetch).not.toHaveBeenCalled();
});

test('"not now" sends nothing and comes back as a plain explanation, not a failure', async () => {
  chrome.runtime.sendMessage.mockResolvedValueOnce(UNASKED);
  askForConsent.mockResolvedValue('declined');

  const result = await translate('Good morning', 'fr', 'en');

  expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
  expect(global.fetch).not.toHaveBeenCalled();
  expect(result.translatedText).toBeNull();
  expect(result.consentDeclined).toBe(true);
  expect(result.error).toMatch(/nothing was sent/i);
  expect(result.error).toMatch(/MyMemory/);
  expect(result.error).not.toMatch(/Translation failed/);
});

test('a recorded no is not asked again', async () => {
  chrome.runtime.sendMessage.mockResolvedValue(DECLINED);
  const result = await translate('Good night', 'de', 'en');
  expect(askForConsent).not.toHaveBeenCalled();
  expect(result.consentDeclined).toBe(true);
  expect(global.fetch).not.toHaveBeenCalled();
});

test('a long text stops at the first refusal instead of asking once per piece', async () => {
  chrome.runtime.sendMessage.mockResolvedValue(DECLINED);
  const long = 'This is a sentence about reading. '.repeat(40);
  const result = await translate(long, 'es', 'en');
  expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
  expect(result.consentDeclined).toBe(true);
});

test('a dropped connection still says to check the connection', async () => {
  chrome.runtime.sendMessage.mockResolvedValue({
    success: false,
    code: 'network',
    error: 'Network error — check your internet connection',
  });
  const result = await translate('Thank you', 'it', 'en');
  expect(result.error).toMatch(/check your internet connection/i);
});

test('a finished daily quota says so', async () => {
  chrome.runtime.sendMessage.mockResolvedValue({ success: false, code: 'quota-exceeded' });
  const result = await translate('Thanks', 'pt', 'en');
  expect(result.error).toMatch(/daily translation limit/i);
});

describe('Translate Page', () => {
  const PAGE_UNASKED = { success: false, code: 'consent-unasked', destination: 'pageTranslation' };

  test('goes as its own destination and never opens a panel per passage', async () => {
    chrome.runtime.sendMessage.mockResolvedValue(PAGE_UNASKED);

    const result = await translate('A passage of the page', 'es', 'en', {
      destination: 'pageTranslation',
      ask: false,
    });

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'THIRD_PARTY_REQUEST', destination: 'pageTranslation' })
    );
    expect(askForConsent).not.toHaveBeenCalled();
    expect(result.consentDeclined).toBe(true);
    expect(result.error).toMatch(/whole page/);
  });
});

describe('what the translation feature publishes', () => {
  test('only functions that work: no language detection or language list from a removed service', () => {
    const published = window.assistFeatures.translation;
    expect(published.detectLanguage).toBeUndefined();
    expect(published.getSupportedLanguages).toBeUndefined();
    expect(typeof published.translate).toBe('function');
  });
});
