/**
 * @jest-environment jsdom
 *
 * A student's first translation was of English text, on the default settings, and it failed:
 * "Auto-detect" resolves to English, the target was already English, and the provider answered
 * "PLEASE SELECT TWO DISTINCT LANGUAGES" — which the extension showed them verbatim, with its
 * own prefix on it twice over ("Error: Translation failed: Translation failed: ...").
 *
 * So: a pair that is already the same language never reaches the network, and nothing a
 * provider says is ever put in front of a student.
 *
 * The request itself is made by the service worker (ADR 0006); this realm only sends it a
 * THIRD_PARTY_REQUEST, so "no request" means no message and no fetch.
 */

describe('translation API — same language, and what a failure is allowed to say', () => {
  let translate;

  beforeEach(async () => {
    jest.resetModules();
    global.fetch = jest.fn();
    chrome.runtime.sendMessage = jest.fn();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    chrome.storage.local.get = jest.fn().mockResolvedValue({});
    chrome.storage.local.set = jest.fn().mockResolvedValue(undefined);
    chrome.storage.onChanged = { addListener: jest.fn() };

    require('../../../src/features/translation/translation-api.js');
    // The module registers itself asynchronously from its own init.
    await Promise.resolve();
    await Promise.resolve();
    translate = window.assistFeatures.translation.translate;
  });

  test('English to English sends no request and says so plainly', async () => {
    const result = await translate('Dyslexia is a learning disability', 'en', 'en');

    expect(global.fetch).not.toHaveBeenCalled();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    expect(result.translatedText).toBeNull();
    expect(result.sameLanguage).toBe(true);
    expect(result.error).toMatch(/already in/i);
    expect(result.error).not.toMatch(/Translation failed/);
  });

  test('auto-detect against English is the same pair, so no request either', async () => {
    const result = await translate('Dyslexia is a learning disability', 'en', 'auto');

    expect(global.fetch).not.toHaveBeenCalled();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    expect(result.sameLanguage).toBe(true);
  });

  test('a different pair still goes to the provider', async () => {
    chrome.runtime.sendMessage.mockResolvedValue({
      success: true,
      data: { translatedText: 'Hola' },
    });

    const result = await translate('Hello', 'es', 'auto');

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'THIRD_PARTY_REQUEST',
      destination: 'translation',
      params: { text: 'Hello', source: 'en', target: 'es' },
    });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.translatedText).toBe('Hola');
  });

  test("the provider's own words never reach the student, and the prefix is not doubled", async () => {
    // The worker keeps the provider's wording in its own console and sends a code.
    chrome.runtime.sendMessage.mockResolvedValue({
      success: false,
      code: 'provider-error',
      error: 'The translation service could not translate that text',
    });

    const result = await translate('Hello', 'es', 'en');

    expect(result.error).not.toMatch(/PLEASE SELECT/i);
    expect(result.error).not.toMatch(/Translation failed: Translation failed/);
    expect(result.error.match(/Translation failed/g) || []).toHaveLength(1);
    expect(result.error).toMatch(/\.$/);
  });
});
