/**
 * @jest-environment jsdom
 *
 * Page read-aloud speaks in the student's saved voice, or in a voice on their device.
 *
 * Two faults lived here. The default voice was "Google UK English Female", which on desktop Chrome
 * is a network voice: the text being read went to Google without the student being told. And the
 * saved voice was looked up once, when the settings arrived, which on a cold start is before Chrome
 * has published its voices; the lookup found nothing and the Google default took its place, so a
 * student's chosen voice silently lost to one they never chose.
 */

const GOOGLE_UK = { name: 'Google UK English Female', lang: 'en-GB', localService: false };
const HAZEL = {
  name: 'Microsoft Hazel - English (United Kingdom)',
  lang: 'en-GB',
  localService: true,
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
};
const VOICES = [GOOGLE_UK, DAVID, HAZEL, HORTENSE];

/** Plain object, not jest.fn: `resetMocks` would wipe mock implementations between tests. */
const synthListeners = [];
const synth = {
  speaking: false,
  paused: false,
  pending: false,
  voices: [],
  spoken: [],
  getVoices() {
    return this.voices;
  },
  speak(utterance) {
    this.spoken.push(utterance);
  },
  cancel() {
    this.speaking = false;
  },
  pause() {},
  resume() {},
  addEventListener(type, handler) {
    if (type === 'voiceschanged') {
      synthListeners.push(handler);
    }
  },
  removeEventListener(type, handler) {
    const at = synthListeners.indexOf(handler);
    if (at !== -1) {
      synthListeners.splice(at, 1);
    }
  },
  publish(list) {
    this.voices = list;
    [...synthListeners].forEach(handler => handler());
  },
};

const stored = {};
const changeListeners = [];
const fakeStorage = {
  local: {
    get(keys, callback) {
      const wanted = typeof keys === 'string' ? [keys] : keys;
      const result = {};
      wanted.forEach(key => {
        if (key in stored) {
          result[key] = stored[key];
        }
      });
      if (typeof callback === 'function') {
        callback(result);
        return undefined;
      }
      return Promise.resolve(result);
    },
    set(items) {
      const changes = {};
      Object.entries(items).forEach(([key, value]) => {
        changes[key] = { oldValue: stored[key], newValue: value };
        stored[key] = value;
      });
      changeListeners.forEach(listener => listener(changes, 'local'));
      return Promise.resolve();
    },
  },
  onChanged: {
    addListener(listener) {
      changeListeners.push(listener);
    },
    removeListener(listener) {
      const at = changeListeners.indexOf(listener);
      if (at !== -1) {
        changeListeners.splice(at, 1);
      }
    },
  },
};

function givenParagraph(text) {
  document.body.innerHTML = '';
  const paragraph = document.createElement('p');
  paragraph.textContent = text;
  document.body.appendChild(paragraph);
  return paragraph;
}

/** readText defers speaking by 100 ms so Chrome can settle after cancel(). */
const afterSpeechStarts = () => new Promise(resolve => setTimeout(resolve, 200));
/** onSettingsChanged debounces its work by 100 ms. */
const afterSettingsSettle = () => new Promise(resolve => setTimeout(resolve, 250));

async function readAndCapture() {
  synth.spoken = [];
  const paragraph = givenParagraph('Working memory holds only a little at a time.');
  window.readText(paragraph.textContent, paragraph, [paragraph]);
  await afterSpeechStarts();
  // The first speak after voices load can be the silent warm-up; the reading is the last one.
  return synth.spoken[synth.spoken.length - 1];
}

/** The content script's runtime message handler, picked out by the PING only it answers. */
let messageListener;

async function saveTts(tts) {
  await fakeStorage.local.set({
    assist_settings: { tts: { ...stored.assist_settings.tts, ...tts } },
  });
  await afterSettingsSettle();
}

beforeAll(async () => {
  global.chrome.storage = fakeStorage;
  global.window.speechSynthesis = synth;
  global.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
      this.rate = 1;
    }
  };
  global.window.SpeechSynthesisUtterance = global.SpeechSynthesisUtterance;
  global.window.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  });
  document.documentElement.lang = 'en-GB';

  // A cold start: the settings are read before Chrome has published a single voice.
  stored.assist_settings = {
    tts: { enabled: true, voice: HORTENSE.name, rate: 1, pitch: 1, volume: 1 },
  };
  await import('../../../src/content/content-simple.js');
  messageListener = global.chrome.runtime.onMessage.addListener.mock.calls
    .map(call => call[0])
    .find(candidate => {
      let reply = null;
      try {
        candidate({ type: 'PING' }, { id: chrome.runtime.id }, response => {
          reply = response;
        });
      } catch {
        return false;
      }
      return Boolean(reply && reply.loaded);
    });
  expect(messageListener).toBeDefined();
  synth.publish(VOICES);
});

beforeEach(() => {
  global.chrome.storage = fakeStorage;
});

test('a voice saved before the engine published its voices is still the one that speaks', async () => {
  const utterance = await readAndCapture();

  expect(utterance.voice).toBe(HORTENSE);
});

test('with no voice chosen, the page is read in a device voice for its language', async () => {
  await saveTts({ voice: 'default' });

  const utterance = await readAndCapture();

  expect(utterance.voice).toBe(HAZEL);
  expect(utterance.voice.localService).toBe(true);
});

test('a saved online voice is kept: the student chose it', async () => {
  await saveTts({ voice: GOOGLE_UK.name });

  const utterance = await readAndCapture();

  expect(utterance.voice).toBe(GOOGLE_UK);
});

test('switching back to automatic from the popup returns to a device voice', async () => {
  await saveTts({ voice: GOOGLE_UK.name });

  // What the popup sends when the student picks the automatic option.
  messageListener(
    { type: 'TTS_COMMAND', data: { command: 'setVoice', voice: 'default' } },
    { id: chrome.runtime.id },
    () => {}
  );

  const utterance = await readAndCapture();

  expect(utterance.voice).toBe(HAZEL);
});

test('the saved rate, pitch and volume are applied, and a volume of 0 stays 0', async () => {
  await saveTts({ voice: 'default', rate: 1.4, pitch: 0.8, volume: 0 });

  const utterance = await readAndCapture();

  expect(utterance.rate).toBe(1.4);
  expect(utterance.pitch).toBe(0.8);
  expect(utterance.volume).toBe(0);
});
