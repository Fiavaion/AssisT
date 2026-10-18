/**
 * @jest-environment jsdom
 *
 * The one place read-aloud decides which voice speaks.
 *
 * On desktop Chrome the "Google ..." voices are network voices (`localService: false`): whatever
 * they read is sent to Google. Read-aloud used to prefer one by name, so a student who never
 * touched the voice picker had their coursework sent off the device without being told. The rule
 * now: unless the student chose a voice, read-aloud uses one that runs on the device.
 */

import {
  chooseVoice,
  createSavedUtterance,
  isOnlineVoice,
  pageLanguage,
  resolveSpeech,
  voiceOptionLabel,
  waitForVoices,
} from '../../../src/utils/speech-voice.js';

const GOOGLE_UK = {
  name: 'Google UK English Female',
  lang: 'en-GB',
  localService: false,
  default: false,
};
const GOOGLE_US = { name: 'Google US English', lang: 'en-US', localService: false, default: false };
const HAZEL = {
  name: 'Microsoft Hazel - English (United Kingdom)',
  lang: 'en-GB',
  localService: true,
  default: false,
};
const DAVID = {
  name: 'Microsoft David - English (United States)',
  lang: 'en-US',
  localService: true,
  default: true,
};
const HORTENSE = {
  name: 'Microsoft Hortense - French (France)',
  lang: 'fr-FR',
  localService: true,
  default: false,
};
const EDGE_ONLINE = {
  name: 'Microsoft Libby Online (Natural) - English (United Kingdom)',
  lang: 'en-GB',
  localService: false,
  default: false,
};

// Network voices first, the way Chrome on Windows lists some of them after a refresh.
const VOICES = [GOOGLE_UK, GOOGLE_US, DAVID, HAZEL, HORTENSE];

describe('chooseVoice: the default', () => {
  test('never picks an online voice while a device voice exists', () => {
    expect(chooseVoice(VOICES, { lang: 'en-GB' })).toBe(HAZEL);
    expect(chooseVoice(VOICES, {}).localService).toBe(true);
  });

  test('matches the language of the page, exact region first', () => {
    expect(chooseVoice(VOICES, { lang: 'en-US' })).toBe(DAVID);
    expect(chooseVoice(VOICES, { lang: 'fr-FR' })).toBe(HORTENSE);
  });

  test('falls back to the same language in another region', () => {
    expect(chooseVoice(VOICES, { lang: 'fr-CA' })).toBe(HORTENSE);
  });

  test('a language with no device voice gets the device default, not an online voice', () => {
    expect(chooseVoice(VOICES, { lang: 'ga-IE' })).toBe(DAVID);
  });

  test('"default" and a missing name both mean the student has not chosen', () => {
    expect(chooseVoice(VOICES, { savedName: 'default', lang: 'en-GB' })).toBe(HAZEL);
    expect(chooseVoice(VOICES, { savedName: '', lang: 'en-GB' })).toBe(HAZEL);
  });

  test('a saved voice that is no longer installed falls back to a device voice', () => {
    expect(chooseVoice(VOICES, { savedName: 'Gone Voice', lang: 'en-GB' })).toBe(HAZEL);
  });

  test('with only online voices, it picks none and leaves it to the engine', () => {
    expect(chooseVoice([GOOGLE_UK, GOOGLE_US], { lang: 'en-GB' })).toBeNull();
  });

  test('a voice that does not say where it runs is not treated as on the device', () => {
    expect(chooseVoice([{ name: 'Mystery', lang: 'en-GB' }], { lang: 'en-GB' })).toBeNull();
  });

  test('no voices at all is null, not a throw', () => {
    expect(chooseVoice([], { lang: 'en' })).toBeNull();
    expect(chooseVoice(undefined, { lang: 'en' })).toBeNull();
  });
});

describe('chooseVoice: the student chose', () => {
  test('a saved online voice is kept: choosing it was the student’s informed act', () => {
    expect(chooseVoice(VOICES, { savedName: 'Google UK English Female', lang: 'en-GB' })).toBe(
      GOOGLE_UK
    );
  });

  test('a saved device voice in another language is kept', () => {
    expect(chooseVoice(VOICES, { savedName: HORTENSE.name, lang: 'en-GB' })).toBe(HORTENSE);
  });
});

describe('isOnlineVoice and the picker label', () => {
  test('only localService false is online', () => {
    expect(isOnlineVoice(GOOGLE_UK)).toBe(true);
    expect(isOnlineVoice(HAZEL)).toBe(false);
    expect(isOnlineVoice(null)).toBe(false);
  });

  test('a device voice is labelled by name and language only', () => {
    expect(voiceOptionLabel(HAZEL)).toBe('Microsoft Hazel - English (United Kingdom) (en-GB)');
  });

  test('an online voice says so, and names Google when it is a Google voice', () => {
    expect(voiceOptionLabel(GOOGLE_UK)).toBe(
      'Google UK English Female (en-GB), online: sends the text to Google'
    );
  });

  test('an online Microsoft voice names Microsoft', () => {
    expect(voiceOptionLabel(EDGE_ONLINE)).toMatch(/online: sends the text to Microsoft$/);
  });

  test('an online voice from an unknown provider still says it is online', () => {
    expect(voiceOptionLabel({ name: 'Cloud Voice', lang: 'en', localService: false })).toBe(
      'Cloud Voice (en), online: sends the text over the internet'
    );
  });
});

describe('resolveSpeech: the saved numbers', () => {
  test('the saved rate, pitch and volume are used as they are', () => {
    const speech = resolveSpeech({ voice: 'default', rate: 1.4, pitch: 0.8, volume: 0.6 }, VOICES, {
      lang: 'en-GB',
    });
    expect(speech).toEqual({ voice: HAZEL, rate: 1.4, pitch: 0.8, volume: 0.6 });
  });

  test('a saved volume of 0 is honoured: the popup slider offers 0% and shows it', () => {
    expect(resolveSpeech({ volume: 0 }, VOICES).volume).toBe(0);
  });

  test('missing or nonsense numbers fall back to the defaults', () => {
    const speech = resolveSpeech({ rate: 'fast', pitch: NaN, volume: 7 }, VOICES);
    expect(speech.rate).toBe(1);
    expect(speech.pitch).toBe(1);
    expect(speech.volume).toBe(1);
    expect(resolveSpeech(undefined, VOICES).rate).toBe(1);
  });
});

describe('pageLanguage', () => {
  afterEach(() => document.documentElement.removeAttribute('lang'));

  test('the page’s own lang attribute wins', () => {
    document.documentElement.lang = 'fr-FR';
    expect(pageLanguage()).toBe('fr-FR');
  });

  test('a bare page language borrows the region from the browser when they agree', () => {
    document.documentElement.lang = 'en';
    expect(pageLanguage(document, { language: 'en-GB' })).toBe('en-GB');
    expect(pageLanguage(document, { language: 'de-DE' })).toBe('en');
  });

  test('no page language falls back to the browser’s', () => {
    expect(pageLanguage(document, { language: 'en-IE' })).toBe('en-IE');
  });
});

describe('waitForVoices', () => {
  function lateSynth() {
    const listeners = [];
    return {
      voices: [],
      getVoices() {
        return this.voices;
      },
      addEventListener(type, handler) {
        listeners.push(handler);
      },
      removeEventListener(type, handler) {
        listeners.splice(listeners.indexOf(handler), 1);
      },
      publish(list) {
        this.voices = list;
        [...listeners].forEach(handler => handler());
      },
      listeners,
    };
  }

  test('resolves at once when the engine already has its voices', async () => {
    const synth = lateSynth();
    synth.voices = VOICES;
    await expect(waitForVoices(synth)).resolves.toBe(VOICES);
  });

  test('waits for voiceschanged and then removes its listener', async () => {
    const synth = lateSynth();
    const pending = waitForVoices(synth, 5000);
    synth.publish(VOICES);
    await expect(pending).resolves.toBe(VOICES);
    expect(synth.listeners).toHaveLength(0);
  });

  test('gives up after the timeout with whatever the engine has', async () => {
    jest.useFakeTimers();
    const synth = lateSynth();
    const pending = waitForVoices(synth, 2000);
    jest.advanceTimersByTime(2000);
    await expect(pending).resolves.toEqual([]);
    expect(synth.listeners).toHaveLength(0);
    jest.useRealTimers();
  });
});

describe('createSavedUtterance', () => {
  const originalSynth = window.speechSynthesis;
  let stored;

  beforeEach(() => {
    stored = { tts: { voice: 'default', rate: 1.3, pitch: 1.1, volume: 0.5 } };
    chrome.storage.local.get.mockImplementation(() => Promise.resolve({ assist_settings: stored }));
    window.speechSynthesis = {
      getVoices: () => VOICES,
      addEventListener() {},
      removeEventListener() {},
    };
    global.SpeechSynthesisUtterance = class {
      constructor(text) {
        this.text = text;
      }
    };
    document.documentElement.lang = 'en-GB';
  });

  afterEach(() => {
    window.speechSynthesis = originalSynth;
    delete global.SpeechSynthesisUtterance;
    document.documentElement.removeAttribute('lang');
  });

  test('builds an utterance in the saved settings with a device voice by default', async () => {
    const utterance = await createSavedUtterance('Hello');
    expect(utterance.text).toBe('Hello');
    expect(utterance.voice).toBe(HAZEL);
    expect(utterance.rate).toBe(1.3);
    expect(utterance.pitch).toBe(1.1);
    expect(utterance.volume).toBe(0.5);
  });

  test('keeps a saved online voice', async () => {
    stored.tts.voice = GOOGLE_US.name;
    const utterance = await createSavedUtterance('Hello');
    expect(utterance.voice).toBe(GOOGLE_US);
  });

  test('an explicit language picks a device voice for that language', async () => {
    const utterance = await createSavedUtterance('Bonjour', { lang: 'fr' });
    expect(utterance.voice).toBe(HORTENSE);
    expect(utterance.lang).toBe('fr');
  });

  // A translation read aloud in French with the saved English voice is garbled, and if that voice
  // is online it sends the French text to Google for no benefit.
  test('an explicit language in another language than the saved voice reads with a device voice for it', async () => {
    stored.tts.voice = GOOGLE_US.name;
    const utterance = await createSavedUtterance('Bonjour', { lang: 'fr' });
    expect(utterance.voice).toBe(HORTENSE);
  });

  test('the saved voice stays when it already speaks that language', async () => {
    stored.tts.voice = HORTENSE.name;
    expect((await createSavedUtterance('Bonjour', { lang: 'fr-CA' })).voice).toBe(HORTENSE);
  });

  test('the saved voice stays when no device voice speaks that language', async () => {
    stored.tts.voice = DAVID.name;
    expect((await createSavedUtterance('Hallo', { lang: 'de' })).voice).toBe(DAVID);
  });

  test('unreadable settings still speak, in a device voice at the defaults', async () => {
    chrome.storage.local.get.mockImplementation(() => Promise.reject(new Error('gone')));
    const utterance = await createSavedUtterance('Hello');
    expect(utterance.voice).toBe(HAZEL);
    expect(utterance.rate).toBe(1);
    expect(utterance.volume).toBe(1);
  });
});
