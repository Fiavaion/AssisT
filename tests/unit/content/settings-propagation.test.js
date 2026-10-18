/**
 * @jest-environment jsdom
 *
 * A setting the student changes in the popup reaches the page they are looking at.
 *
 * There used to be two ways for that to happen: the popup wrote the whole settings object through an
 * `UPDATE_SETTINGS` message, and the background broadcast it to every Canvas tab. Both are gone. The
 * popup now writes only the paths it changed, through `applySettingWrites`, and the content script
 * learns about it from `chrome.storage.onChanged` — nothing else. That listener is the only thing
 * left carrying a preference from the popup to an open page, and nothing proved it end to end, which
 * is precisely how the broadcast came to look load-bearing long after it had stopped being.
 *
 * So this drives the real path: the shared writer against a storage that fires onChanged the way
 * Chrome does, into the real content script, and asserts the page changed.
 */

import { applySettingWrites } from '../../../src/utils/setting-writes.js';

/** Stand-in for window.speechSynthesis. Plain object — jest's resetMocks would wipe mock impls. */
const synth = {
  speaking: false,
  paused: false,
  pending: false,
  cancelCount: 0,
  spoken: [],
  getVoices: () => [],
  speak(utterance) {
    this.spoken.push(utterance);
    this.speaking = true;
  },
  cancel() {
    this.cancelCount += 1;
    this.speaking = false;
    this.paused = false;
  },
  pause() {
    this.paused = true;
  },
  resume() {
    this.paused = false;
  },
  addEventListener() {},
  removeEventListener() {},
};

/**
 * `chrome.storage.local` that actually stores, and an `onChanged` that actually fires — plain
 * objects, because this test is about the two halves meeting, and a jest.fn whose implementation
 * `resetMocks` had wiped would let it pass with nothing connected.
 */
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

/**
 * The orchestrator is not the only module that registers a runtime message listener, so pick it out
 * by the one message only it answers: PING replies {loaded: true}.
 */
function findContentScriptListener() {
  const listeners = global.chrome.runtime.onMessage.addListener.mock.calls.map(call => call[0]);
  return listeners.find(listener => {
    let response = null;
    try {
      listener({ type: 'PING' }, { id: chrome.runtime.id }, reply => {
        response = reply;
      });
    } catch {
      return false;
    }
    return Boolean(response && response.loaded);
  });
}

/** The content script's chrome.runtime.onMessage handler, captured at load. */
let messageListener;

function sendTtsCommand(command, data = {}) {
  messageListener(
    { type: 'TTS_COMMAND', data: { command, ...data } },
    { id: chrome.runtime.id },
    () => {}
  );
}

function givenParagraph(text) {
  document.body.innerHTML = '';
  const paragraph = document.createElement('p');
  paragraph.id = 'p1';
  paragraph.textContent = text;
  document.body.appendChild(paragraph);
  return paragraph;
}

/** readText defers speaking by 100 ms so Chrome can settle after cancel(). */
function afterSpeechStarts() {
  return new Promise(resolve => setTimeout(resolve, 200));
}

/** onSettingsChanged debounces its work by 100 ms. */
function afterSettingsSettle() {
  return new Promise(resolve => setTimeout(resolve, 250));
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

  await import('../../../src/content/content-simple.js');
  messageListener = findContentScriptListener();
  expect(messageListener).toBeDefined();
});

beforeEach(() => {
  global.chrome.storage = fakeStorage;
  synth.speaking = false;
  synth.paused = false;
  synth.cancelCount = 0;
  synth.spoken = [];
  stored.assist_settings = {
    tts: { enabled: true, highlightEnabled: true, rate: 1, pitch: 1, volume: 1 },
  };
  sendTtsCommand('enable');
  sendTtsCommand('setHighlighting', { enabled: true });
  sendTtsCommand('setWordByWord', { enabled: false });
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('a setting written through the shared helper reaches an open page', () => {
  test('the writer fires onChanged with the merged settings object', async () => {
    const seen = [];
    const spy = changes => seen.push(changes);
    chrome.storage.onChanged.addListener(spy);

    await applySettingWrites([{ path: 'tts.rate', value: 1.6 }]);

    chrome.storage.onChanged.removeListener(spy);
    expect(seen).toHaveLength(1);
    expect(seen[0].assist_settings.newValue.tts.rate).toBe(1.6);
    // Only the changed path was written, so the rest of the student's settings came through intact.
    expect(seen[0].assist_settings.newValue.tts.highlightEnabled).toBe(true);
  });

  test("switching TTS off in the popup stops the page's read and clears the highlight", async () => {
    const paragraph = givenParagraph('Working memory holds only a little at a time.');
    window.readText(paragraph.textContent, paragraph, [paragraph]);
    await afterSpeechStarts();
    expect(paragraph.getAttribute('style')).toBeTruthy();
    const cancelsBefore = synth.cancelCount;

    // Exactly what the popup does when the student turns TTS off: one path, through the writer.
    await applySettingWrites([{ path: 'tts.enabled', value: false }]);
    await afterSettingsSettle();

    expect(synth.cancelCount).toBeGreaterThan(cancelsBefore);
    expect(paragraph.getAttribute('style')).toBeNull();
  });
});
