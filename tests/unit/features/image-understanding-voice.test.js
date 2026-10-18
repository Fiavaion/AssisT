/**
 * @jest-environment jsdom
 *
 * Image Understanding must do no speech work until a student asks it to speak.
 *
 * Every page load logged "[ImageUnderstanding] No suitable voice found in 6 voices" twice, on pages
 * where nobody had touched the feature: the module resolved the speech engine's voice list at init,
 * waiting on `voiceschanged` and warning about the result. The settings are now resolved when a
 * description is read aloud, and not before.
 */

const voices = [
  { name: 'Microsoft David - English (United States)', lang: 'en-US' },
  { name: 'Microsoft Zira - English (United States)', lang: 'en-US' },
];

let getVoices;

beforeEach(() => {
  jest.resetModules();
  getVoices = jest.fn(() => voices);
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      getVoices,
      speak: jest.fn(),
      cancel: jest.fn(),
      speaking: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    },
  });
  chrome.storage.local.get.mockImplementation((keys, cb) => {
    if (typeof cb === 'function') {
      cb({});
      return undefined;
    }
    return Promise.resolve({});
  });
});

test('loading the feature asks the speech engine for nothing', async () => {
  await import('../../../src/features/imageUnderstanding/imageUnderstanding.js');

  expect(getVoices).not.toHaveBeenCalled();
  expect(window.speechSynthesis.addEventListener).not.toHaveBeenCalled();
});

test('the module still registers itself, so nothing else has to change', async () => {
  await import('../../../src/features/imageUnderstanding/imageUnderstanding.js');

  expect(window.assistFeatures?.imageUnderstanding?.describe).toEqual(expect.any(Function));
});
