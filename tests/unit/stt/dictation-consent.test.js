/**
 * @jest-environment jsdom
 *
 * Dictation sends the student's voice to Google: Chrome's speech recognition is a Google service
 * (ADR 0006, owner decision 2026-09-26). So nothing starts speech recognition without a yes. The
 * first time a student starts dictation they are asked, once, with the consent panel; a no is
 * remembered, and pressing the microphone again explains that and offers Allow. A yes withdrawn in
 * the popup stops dictation that is running, at once.
 *
 * Every entry point goes through one of three starts: the dictation controller (the floating mic,
 * the shortcut, voice commands and citation voice capture all drive it), the sticky note's mic, and
 * the lecture companion. The last test holds the source to that.
 */

jest.mock('../../../src/utils/consent-panel.js', () => ({
  ...jest.requireActual('../../../src/utils/consent-panel.js'),
  askForConsent: jest.fn(),
}));

const fs = require('fs');
const path = require('path');
const { askForConsent } = require('../../../src/utils/consent-panel.js');
const { consentStorageKey } = require('../../../src/utils/consent.js');
const { allowDictation, onDictationWithdrawn } = require('../../../src/utils/dictation-consent.js');
const { STTController } = require('../../../src/engines/stt/stt-controller.js');

class FakeRecognition {
  constructor() {
    this.start = jest.fn(() => this.onstart && this.onstart());
    this.stop = jest.fn(() => this.onend && this.onend());
    this.abort = jest.fn();
    FakeRecognition.instances.push(this);
  }
}
FakeRecognition.instances = [];

let stored;
let changeListeners;

const flush = async () => {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
};

beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  stored = {};
  changeListeners = [];
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
  chrome.storage.onChanged = {
    addListener: jest.fn(listener => changeListeners.push(listener)),
    removeListener: jest.fn(listener => {
      changeListeners = changeListeners.filter(l => l !== listener);
    }),
  };
  askForConsent.mockReset();
  FakeRecognition.instances = [];
  global.webkitSpeechRecognition = FakeRecognition;
  window.webkitSpeechRecognition = FakeRecognition;
});

afterAll(() => {
  delete global.webkitSpeechRecognition;
  delete window.webkitSpeechRecognition;
});

function answered(granted) {
  stored[consentStorageKey('dictation')] = { granted, at: '2026-09-26T10:00:00.000Z' };
}

function withdraw() {
  const key = consentStorageKey('dictation');
  changeListeners.forEach(listener =>
    listener({ [key]: { newValue: { granted: false, at: 'now' } } }, 'local')
  );
}

describe('allowDictation', () => {
  it('asks once when nobody has answered, and says what the answer was', async () => {
    askForConsent.mockResolvedValue('granted');
    await expect(allowDictation()).resolves.toBe(true);
    expect(askForConsent).toHaveBeenCalledWith(
      'dictation',
      expect.objectContaining({ declinedBefore: false })
    );
  });

  it('does not ask again after a yes', async () => {
    answered(true);
    await expect(allowDictation()).resolves.toBe(true);
    expect(askForConsent).not.toHaveBeenCalled();
  });

  it('after a no, explains the earlier answer and offers Allow when the student presses again', async () => {
    answered(false);
    askForConsent.mockResolvedValue('declined');
    await expect(allowDictation()).resolves.toBe(false);
    expect(askForConsent).toHaveBeenCalledWith(
      'dictation',
      expect.objectContaining({ declinedBefore: true })
    );
  });

  it('asks lecture capture its own question, and a yes to dictation is not a yes to it', async () => {
    answered(true);
    askForConsent.mockResolvedValue('declined');
    await expect(allowDictation({ destination: 'lectureCapture' })).resolves.toBe(false);
    expect(askForConsent).toHaveBeenCalledWith(
      'lectureCapture',
      expect.objectContaining({ declinedBefore: false })
    );
  });

  it('stops lecture capture when its own yes is withdrawn', () => {
    const stop = jest.fn();
    onDictationWithdrawn(stop, 'lectureCapture');
    withdraw();
    expect(stop).not.toHaveBeenCalled();
    const key = consentStorageKey('lectureCapture');
    changeListeners.forEach(listener =>
      listener({ [key]: { newValue: { granted: false } } }, 'local')
    );
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('tells a listener when the yes is withdrawn, and nothing else', () => {
    const stop = jest.fn();
    const unsubscribe = onDictationWithdrawn(stop);
    changeListeners.forEach(listener =>
      listener({ [consentStorageKey('dictionary')]: { newValue: { granted: false } } }, 'local')
    );
    expect(stop).not.toHaveBeenCalled();
    withdraw();
    expect(stop).toHaveBeenCalledTimes(1);
    unsubscribe();
    expect(changeListeners).toHaveLength(0);
  });
});

describe('the dictation controller (mic button, shortcut, voice commands, citation voice capture)', () => {
  function controller(options = {}) {
    return new STTController({ onEnd: jest.fn(), ...options });
  }

  it('starts nothing while the question is open, and nothing after a no', async () => {
    let answer;
    askForConsent.mockReturnValue(new Promise(resolve => (answer = resolve)));
    const stt = controller();

    expect(stt.startListening(document.body)).toBe(true);
    await flush();
    expect(stt.recognition.start).not.toHaveBeenCalled();

    answer('declined');
    await flush();
    expect(stt.recognition.start).not.toHaveBeenCalled();
    expect(stt.isStarting).toBe(false);
    // The button goes back to its resting state.
    expect(stt.onEnd).toHaveBeenCalled();
  });

  it('a no is answered in words a screen reader announces, never with silence', async () => {
    document.getElementById('assist-toast')?.remove();
    askForConsent.mockResolvedValue('declined');
    const stt = controller();

    stt.startListening(document.body);
    await flush();

    const notice = document.getElementById('assist-toast');
    expect(notice).not.toBeNull();
    expect(notice.getAttribute('role')).toBe('status');
    expect(notice.textContent).toBe(
      'Nothing was recorded or sent. Press the microphone or the voice typing shortcut to be asked again.'
    );
  });

  it('starts once the student says yes', async () => {
    askForConsent.mockResolvedValue('granted');
    const stt = controller();
    stt.startListening(document.body);
    await flush();
    expect(stt.recognition.start).toHaveBeenCalledTimes(1);
    expect(stt.isRecording).toBe(true);
  });

  it('a Stop pressed while the question is open wins over a later yes', async () => {
    let answer;
    askForConsent.mockReturnValue(new Promise(resolve => (answer = resolve)));
    const stt = controller();
    stt.startListening(document.body);
    stt.stopListening();
    answer('granted');
    await flush();
    expect(stt.recognition.start).not.toHaveBeenCalled();
  });

  it('stops at once when the yes is withdrawn in the popup', async () => {
    answered(true);
    const stt = controller();
    stt.startListening(document.body);
    await flush();
    expect(stt.isRecording).toBe(true);

    withdraw();

    expect(stt.recognition.stop).toHaveBeenCalled();
    expect(stt.isRecording).toBe(false);
  });
});

test('nothing in the extension starts speech recognition without asking the dictation question', () => {
  const src = path.join(__dirname, '../../../src');
  const files = [];
  const walk = dir =>
    fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.js')) {
        files.push(full);
      }
    });
  walk(src);
  const code = text => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const starters = files
    .map(file => ({
      rel: path.relative(src, file).split(path.sep).join('/'),
      text: code(fs.readFileSync(file, 'utf8')),
    }))
    .filter(({ text }) => /SpeechRecognition\b/.test(text) && /\.start\(\)/.test(text));

  expect(starters.map(file => file.rel).sort()).toEqual([
    'engines/stt/stt-controller.js',
    'features/annotations/sticky-note.js',
    'features/companion/lecture-ui.js',
  ]);
  starters.forEach(({ rel, text }) => {
    expect([rel, /from\s+['"][./]*(?:utils\/)?dictation-consent\.js['"]/.test(text)]).toEqual([
      rel,
      true,
    ]);
  });
});

describe('the floating microphone', () => {
  const { MicrophoneButton } = require('../../../src/ui/components/microphone-button.js');

  function mount(options) {
    const field = document.createElement('textarea');
    document.body.appendChild(field);
    const mic = new MicrophoneButton(options);
    mic.show(field);
    return { mic, field };
  }

  afterEach(() => {
    jest.useRealTimers();
  });

  it('asks before its start timer runs, so reading the question never times out', async () => {
    jest.useFakeTimers();
    let answer;
    const confirmStart = jest.fn(() => new Promise(resolve => (answer = resolve)));
    const onStart = jest.fn();
    const onError = jest.fn();
    const { mic, field } = mount({ onStart, onError, confirmStart });

    mic.startRecording();
    jest.advanceTimersByTime(MicrophoneButton.START_TIMEOUT_MS * 3);

    expect(confirmStart).toHaveBeenCalledWith(field);
    expect(onError).not.toHaveBeenCalled();
    expect(onStart).not.toHaveBeenCalled();

    answer(true);
    await flush();
    expect(onStart).toHaveBeenCalledWith(field);
    expect(mic.isStarting).toBe(true);
    mic.destroy();
  });

  it('a no leaves it at rest, ready to be pressed again', async () => {
    const onStart = jest.fn();
    const { mic } = mount({ onStart, confirmStart: () => Promise.resolve(false) });

    mic.startRecording();
    await flush();

    expect(onStart).not.toHaveBeenCalled();
    expect(mic.state).toBe('idle');
    mic.destroy();
  });
});
