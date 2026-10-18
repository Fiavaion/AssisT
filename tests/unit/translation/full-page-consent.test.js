/**
 * @jest-environment jsdom
 *
 * Translate Page sends the text of a whole page to MyMemory. On a course page that can include
 * other people's names (a discussion, a grades list), so it is its own question (ADR 0006), not the
 * one a student answered for a selection: asked once, before anything is sent, with an honest
 * sample of what the page holds. Only text a sighted student can see on the page is sent: nothing
 * hidden, nothing marked aria-hidden, none of AssisT's own interface.
 */

jest.mock('../../../src/utils/consent-panel.js', () => ({
  ...jest.requireActual('../../../src/utils/consent-panel.js'),
  askForConsent: jest.fn(),
}));

const { askForConsent } = require('../../../src/utils/consent-panel.js');
const { consentStorageKey } = require('../../../src/utils/consent.js');

let fullPage;
let translate;
let stored;

beforeAll(() => {
  require('../../../src/features/translation/full-page-translate.js');
  fullPage = window.assistFeatures.fullPageTranslate;
});

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  stored = {};
  chrome.storage.local.get = jest.fn(async keys => {
    const out = {};
    [].concat(keys).forEach(key => {
      if (key in stored) {
        out[key] = stored[key];
      }
    });
    return out;
  });
  chrome.storage.local.set = jest.fn(async values => Object.assign(stored, values));
  askForConsent.mockReset();
  document.body.innerHTML = `
    <main>
      <h1>Week 3 discussion</h1>
      <p>Aoife Byrne replied to the thread.</p>
      <p hidden>Hidden grade note for the teacher.</p>
      <p aria-hidden="true">Decorative duplicate heading.</p>
      <div style="display: none"><p>Collapsed reply from Sam.</p></div>
      <p style="visibility: hidden">Invisible caption text.</p>
      <div id="assist-dictionary-modal"><p>AssisT dictionary words.</p></div>
      <p class="assist-annotation-toolbar">AssisT toolbar label.</p>
    </main>`;
  translate = jest.fn(async text => ({ translatedText: `[es] ${text}` }));
  window.assistFeatures.translation = { translate };
  window.showToast = jest.fn();
});

afterEach(() => {
  if (fullPage.isTranslated()) {
    fullPage.revert();
  }
});

function sentTexts() {
  return translate.mock.calls.map(([text]) => text);
}

test('asks about the whole page, once, before anything is sent, with a sample of what it holds', async () => {
  askForConsent.mockResolvedValue('declined');

  await fullPage.translate('es', 'en');

  expect(askForConsent).toHaveBeenCalledTimes(1);
  const [destination, options] = askForConsent.mock.calls[0];
  expect(destination).toBe('pageTranslation');
  expect(options.detailLabel).toMatch(/2 passages/);
  expect(options.detail).toMatch(/^Week 3 discussion/);
  expect(options.detail).toMatch(/Aoife Byrne/);
  expect(translate).not.toHaveBeenCalled();
  expect(window.showToast).toHaveBeenCalledWith(expect.stringMatching(/nothing was sent/i));
  expect(fullPage.isTranslated()).toBe(false);
});

test('sends only visible page text: nothing hidden, aria-hidden, or part of AssisT', async () => {
  askForConsent.mockResolvedValue('granted');

  await fullPage.translate('es', 'en');

  expect(sentTexts()).toEqual(['Week 3 discussion', 'Aoife Byrne replied to the thread.']);
});

test('every passage goes as a whole-page translation, never asking again per passage', async () => {
  stored[consentStorageKey('pageTranslation')] = { granted: true, at: '2026-09-26T10:00:00.000Z' };

  await fullPage.translate('es', 'en');

  expect(askForConsent).not.toHaveBeenCalled();
  expect(translate).toHaveBeenCalledTimes(2);
  translate.mock.calls.forEach(([, target, source]) => {
    expect([target, source]).toEqual(['es', 'en']);
  });
  // Only the first passage may ask, and the client asks only when Chrome does not hold MyMemory's
  // host (ADR 0009): a yes recorded without it is no consent. Every later passage never asks.
  expect(translate.mock.calls.map(([, , , options]) => options)).toEqual([
    { destination: 'pageTranslation', ask: true },
    { destination: 'pageTranslation', ask: false },
  ]);
});

test('a yes to translating a selection is not a yes to the whole page', async () => {
  stored[consentStorageKey('translation')] = { granted: true, at: '2026-09-26T10:00:00.000Z' };
  askForConsent.mockResolvedValue('declined');

  await fullPage.translate('es', 'en');

  expect(askForConsent).toHaveBeenCalledWith('pageTranslation', expect.any(Object));
  expect(translate).not.toHaveBeenCalled();
});

test('after an earlier no, pressing Translate Page says so and offers Allow again', async () => {
  stored[consentStorageKey('pageTranslation')] = { granted: false, at: '2026-09-26T10:00:00.000Z' };
  askForConsent.mockResolvedValue('declined');

  await fullPage.translate('es', 'en');

  expect(askForConsent).toHaveBeenCalledWith(
    'pageTranslation',
    expect.objectContaining({ declinedBefore: true })
  );
  expect(translate).not.toHaveBeenCalled();
});

test('a refusal from the service part-way stops the run and says nothing more was sent', async () => {
  askForConsent.mockResolvedValue('granted');
  translate.mockResolvedValue({
    translatedText: null,
    consentDeclined: true,
    error: 'Nothing was sent. You chose not to use MyMemory to translate the whole page.',
  });

  await fullPage.translate('es', 'en');

  expect(translate).toHaveBeenCalledTimes(1);
  expect(window.showToast).toHaveBeenCalledWith(expect.stringMatching(/nothing was sent/i));
  expect(window.showToast).not.toHaveBeenCalledWith(expect.stringMatching(/translated to/i));
  expect(fullPage.isTranslated()).toBe(false);
});
