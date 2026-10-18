/**
 * @jest-environment jsdom
 *
 * Unit tests for lecture-ui.js — the mic-based live captions/notes companion card.
 *
 * EVENT DISPATCH NOTE:
 *   companionButton()/the toggle button use attachAccessibleHandler(), which wires mousedown
 *   (not click) and calls preventDefault()/stopPropagation(). Trigger handlers by dispatching a
 *   mousedown MouseEvent (bubbles + cancelable).
 */

jest.mock('../../../src/features/companion/companion-settings.js', () => ({
  ...jest.requireActual('../../../src/features/companion/companion-settings.js'),
  isCompanionEnabled: jest.fn(),
}));

// Starting sends the lecture audio to Google (Chrome's speech recognition), so Start asks first.
jest.mock('../../../src/utils/dictation-consent.js', () => ({
  allowDictation: jest.fn(),
  onDictationWithdrawn: jest.fn(),
}));

jest.mock('../../../src/features/companion/companion-ui.js', () => ({
  ...jest.requireActual('../../../src/features/companion/companion-ui.js'),
  isLmsHost: jest.fn(),
}));

const { isCompanionEnabled } = require('../../../src/features/companion/companion-settings.js');
const { isLmsHost } = require('../../../src/features/companion/companion-ui.js');
const lectureUi = require('../../../src/features/companion/lecture-ui.js');
const { allowDictation, onDictationWithdrawn } = require('../../../src/utils/dictation-consent.js');

const TOGGLE_ID = 'assist-companion-lecture-toggle';
const CARD_ID = 'assist-companion-lecture';

function fireMousedown(el) {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

/** Start waits for the student's answer to the dictation question. */
async function flush() {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}

/** A minimal SpeechRecognition stub that records every constructed instance. */
class FakeSpeechRecognition {
  constructor() {
    this.continuous = false;
    this.interimResults = false;
    this.onresult = null;
    this.onstart = null;
    this.onerror = null;
    this.onend = null;
    this.start = jest.fn();
    this.stop = jest.fn();
    FakeSpeechRecognition.instances.push(this);
  }
}
FakeSpeechRecognition.instances = [];

function fakeFinalEvent(transcript) {
  const result = [{ transcript }];
  result.isFinal = true;
  return { resultIndex: 0, results: [result] };
}

function fakeInterimEvent(transcript) {
  const result = [{ transcript }];
  result.isFinal = false;
  return { resultIndex: 0, results: [result] };
}

async function startListening() {
  await openCardViaToggle();
  const card = document.getElementById(CARD_ID);
  const startBtn = Array.from(card.querySelectorAll('button')).find(b =>
    b.textContent.includes('Start listening')
  );
  fireMousedown(startBtn);
  await flush();
  return { card, instance: FakeSpeechRecognition.instances.at(-1) };
}

async function openCardViaToggle() {
  await lectureUi.init();
  fireMousedown(document.getElementById(TOGGLE_ID));
}

beforeEach(() => {
  FakeSpeechRecognition.instances = [];
  window.SpeechRecognition = FakeSpeechRecognition;
  delete window.webkitSpeechRecognition;
  isCompanionEnabled.mockResolvedValue(true);
  isLmsHost.mockReturnValue(true);
  allowDictation.mockResolvedValue(true);
  onDictationWithdrawn.mockReturnValue(() => {});
  chrome.storage.local.get.mockResolvedValue({});
  chrome.storage.local.set.mockResolvedValue(undefined);
  document.body.innerHTML = '';
  URL.createObjectURL = jest.fn(() => 'blob:fake-url');
  URL.revokeObjectURL = jest.fn();
});

afterEach(() => {
  lectureUi.cleanup();
  delete window.SpeechRecognition;
  delete window.webkitSpeechRecognition;
});

describe('init()', () => {
  test('renders only the small floating toggle button — no card', async () => {
    await lectureUi.init();
    const btn = document.getElementById(TOGGLE_ID);
    expect(btn).not.toBeNull();
    expect(btn.textContent).toBe('🎙️ lecture');
    expect(btn.getAttribute('aria-label')).toBe(
      'Lecture companion — live captions from your microphone'
    );
    expect(document.getElementById(CARD_ID)).toBeNull();
  });

  test('disabled feature renders nothing', async () => {
    isCompanionEnabled.mockResolvedValue(false);
    await lectureUi.init();
    expect(document.getElementById(TOGGLE_ID)).toBeNull();
  });

  test('is idempotent — a second call does not duplicate the button', async () => {
    await lectureUi.init();
    await lectureUi.init();
    expect(document.querySelectorAll(`#${TOGGLE_ID}`).length).toBe(1);
  });
});

describe('opening the card', () => {
  test('clicking the toggle opens the lecture-notes card with a Start button', async () => {
    await openCardViaToggle();
    const card = document.getElementById(CARD_ID);
    expect(card).not.toBeNull();
    const startBtn = Array.from(card.querySelectorAll('button')).find(b =>
      b.textContent.includes('Start listening')
    );
    expect(startBtn).toBeTruthy();
  });

  test('no SpeechRecognition support shows an honest message instead of Start', async () => {
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
    await openCardViaToggle();
    const card = document.getElementById(CARD_ID);
    expect(card.textContent).toMatch(/not supported in this browser/i);
    const startBtn = Array.from(card.querySelectorAll('button')).find(b =>
      b.textContent.includes('Start listening')
    );
    expect(startBtn).toBeUndefined();
  });
});

describe('recording flow', () => {
  test('Start begins recognition', async () => {
    await openCardViaToggle();
    const card = document.getElementById(CARD_ID);
    const startBtn = Array.from(card.querySelectorAll('button')).find(b =>
      b.textContent.includes('Start listening')
    );
    fireMousedown(startBtn);
    await flush();
    expect(FakeSpeechRecognition.instances.length).toBe(1);
    expect(FakeSpeechRecognition.instances[0].start).toHaveBeenCalled();
  });

  test('a final recognition result appends a timestamped transcript line', async () => {
    await openCardViaToggle();
    const card = document.getElementById(CARD_ID);
    const startBtn = Array.from(card.querySelectorAll('button')).find(b =>
      b.textContent.includes('Start listening')
    );
    fireMousedown(startBtn);
    await flush();

    const instance = FakeSpeechRecognition.instances[0];
    instance.onresult(fakeFinalEvent('the mitochondria is the powerhouse of the cell'));

    const transcript = card.querySelector('.assist-companion-lecture__transcript');
    expect(transcript.textContent).toMatch(/the mitochondria is the powerhouse of the cell/);
    expect(transcript.textContent).toMatch(/\(\d{2}:\d{2}\)/);
  });

  test('Stop stops the active recognition instance', async () => {
    await openCardViaToggle();
    const card = document.getElementById(CARD_ID);
    const startBtn = Array.from(card.querySelectorAll('button')).find(b =>
      b.textContent.includes('Start listening')
    );
    fireMousedown(startBtn);
    await flush();
    const instance = FakeSpeechRecognition.instances[0];

    const stopBtn = Array.from(card.querySelectorAll('button')).find(b =>
      b.textContent.includes('Stop')
    );
    fireMousedown(stopBtn);
    expect(instance.stop).toHaveBeenCalled();
  });
});

describe('what the student is told while the microphone starts, fails and pauses', () => {
  const status = card => card.querySelector('[role="status"]').textContent;

  afterEach(() => {
    jest.useRealTimers();
  });

  test('Listening appears only once the recogniser has actually started', async () => {
    const { card, instance } = await startListening();
    expect(status(card)).not.toBe('Listening');
    instance.onstart();
    expect(status(card)).toBe('Listening');
  });

  test.each(['not-allowed', 'service-not-allowed'])(
    '%s stops, does not restart, and says to allow the microphone for this site',
    async code => {
      jest.useFakeTimers();
      const { card, instance } = await startListening();
      instance.onstart();
      instance.onerror({ error: code });
      instance.onend?.();
      jest.advanceTimersByTime(5000);
      expect(instance.start).toHaveBeenCalledTimes(1);
      expect(status(card)).toMatch(/allow the microphone.*address bar.*press Start/i);
    }
  );

  test('audio-capture and network each get their own plain message and no restart', async () => {
    jest.useFakeTimers();
    const first = await startListening();
    first.instance.onerror({ error: 'audio-capture' });
    first.instance.onend?.();
    jest.advanceTimersByTime(5000);
    expect(first.instance.start).toHaveBeenCalledTimes(1);
    expect(status(first.card)).toMatch(/no microphone was found/i);

    lectureUi.cleanup();
    document.body.innerHTML = '';
    const second = await startListening();
    second.instance.onerror({ error: 'network' });
    expect(status(second.card)).toMatch(/could not reach its service/i);
  });

  test('a terminal error releases the withdrawal listener', async () => {
    const release = jest.fn();
    onDictationWithdrawn.mockReturnValue(release);
    const { instance } = await startListening();
    instance.onerror({ error: 'not-allowed' });
    expect(release).toHaveBeenCalled();
  });

  test('no-speech restarts the recogniser while the student still wants recording', async () => {
    jest.useFakeTimers();
    const { instance } = await startListening();
    instance.onstart();
    instance.onerror({ error: 'no-speech' });
    instance.onend();
    jest.advanceTimersByTime(1000);
    expect(instance.start).toHaveBeenCalledTimes(2);
  });

  test('pressing Stop while a restart is waiting means it never restarts', async () => {
    jest.useFakeTimers();
    const { card, instance } = await startListening();
    instance.onstart();
    const onend = instance.onend;
    onend();
    const stopBtn = Array.from(card.querySelectorAll('button')).find(b =>
      b.textContent.includes('Stop')
    );
    fireMousedown(stopBtn);
    jest.advanceTimersByTime(5000);
    expect(instance.start).toHaveBeenCalledTimes(1);
  });

  test('a recogniser that keeps ending without starting is given up on, not looped', async () => {
    jest.useFakeTimers();
    const { card, instance } = await startListening();
    for (let i = 0; i < 10; i += 1) {
      instance.onend?.();
      jest.advanceTimersByTime(1000);
    }
    expect(instance.start.mock.calls.length).toBeLessThan(6);
    expect(status(card)).toMatch(/press Start/i);
  });

  test('interim words show in one partial line that the final line replaces', async () => {
    const { card, instance } = await startListening();
    instance.onresult(fakeInterimEvent('the mito'));
    instance.onresult(fakeInterimEvent('the mitochondria'));
    const transcript = card.querySelector('.assist-companion-lecture__transcript');
    const partials = transcript.querySelectorAll('.assist-companion-lecture__partial');
    expect(partials).toHaveLength(1);
    expect(partials[0].textContent).toBe('the mitochondria');
    expect(partials[0].getAttribute('aria-hidden')).toBe('true');

    instance.onresult(fakeFinalEvent('the mitochondria is the powerhouse'));
    expect(transcript.querySelectorAll('.assist-companion-lecture__partial')).toHaveLength(0);
    expect(transcript.querySelectorAll('.assist-companion-lecture__line')).toHaveLength(1);
  });

  test('language comes from the page, falling back to the browser', async () => {
    document.documentElement.lang = 'fr-CA';
    const first = await startListening();
    expect(first.instance.lang).toBe('fr-CA');
    lectureUi.cleanup();
    document.body.innerHTML = '';
    document.documentElement.lang = '';
    const second = await startListening();
    expect(second.instance.lang).toBe(navigator.language);
  });
});

describe('asking before any audio is sent', () => {
  test('a no to the dictation question starts nothing and says nothing was sent', async () => {
    allowDictation.mockResolvedValue(false);
    await openCardViaToggle();
    const card = document.getElementById(CARD_ID);
    const startBtn = Array.from(card.querySelectorAll('button')).find(b =>
      b.textContent.includes('Start listening')
    );
    fireMousedown(startBtn);
    await flush();

    expect(allowDictation).toHaveBeenCalledTimes(1);
    // The room is heard, not the student alone: lecture capture has its own question.
    expect(allowDictation).toHaveBeenCalledWith({ destination: 'lectureCapture' });
    expect(FakeSpeechRecognition.instances).toHaveLength(0);
    expect(card.textContent).toMatch(/Nothing was recorded or sent/);
  });

  test('a yes withdrawn in the popup stops listening', async () => {
    let stopOnWithdrawal;
    onDictationWithdrawn.mockImplementation(stop => {
      stopOnWithdrawal = stop;
      return () => {};
    });
    await openCardViaToggle();
    const card = document.getElementById(CARD_ID);
    const startBtn = Array.from(card.querySelectorAll('button')).find(b =>
      b.textContent.includes('Start listening')
    );
    fireMousedown(startBtn);
    await flush();

    expect(onDictationWithdrawn).toHaveBeenCalledWith(expect.any(Function), 'lectureCapture');
    stopOnWithdrawal();
    expect(FakeSpeechRecognition.instances[0].stop).toHaveBeenCalled();
  });
});

describe('save notes', () => {
  test('writes the session to chrome.storage.local, capped at 20 sessions', async () => {
    // A stateful fake so writes are actually visible to the next read (cap-logic proof).
    let stored = { companionLectureNotes: Array.from({ length: 20 }, (_, i) => ({
      title: `old-${i}`,
      startedAt: i,
      lines: ['x'],
    })) };
    chrome.storage.local.get.mockImplementation(async () => ({ ...stored }));
    chrome.storage.local.set.mockImplementation(async update => {
      stored = { ...stored, ...update };
    });

    await openCardViaToggle();
    const card = document.getElementById(CARD_ID);
    const startBtn = Array.from(card.querySelectorAll('button')).find(b =>
      b.textContent.includes('Start listening')
    );
    fireMousedown(startBtn);
    await flush();
    const instance = FakeSpeechRecognition.instances[0];
    instance.onresult(fakeFinalEvent('new session content'));

    const saveBtn = Array.from(card.querySelectorAll('button')).find(b =>
      b.textContent.includes('Save notes')
    );
    fireMousedown(saveBtn);
    await Promise.resolve();
    await Promise.resolve();

    expect(chrome.storage.local.set).toHaveBeenCalled();
    const sessions = stored.companionLectureNotes;
    expect(sessions.length).toBe(20);
    expect(sessions[sessions.length - 1].lines[0]).toMatch(/new session content/);
    // The oldest session (old-0) was dropped to keep the cap.
    expect(sessions.find(s => s.title === 'old-0')).toBeUndefined();
  });
});

describe('cleanup()', () => {
  test('removes the toggle button and the card, and stops recognition', async () => {
    await openCardViaToggle();
    const card = document.getElementById(CARD_ID);
    const startBtn = Array.from(card.querySelectorAll('button')).find(b =>
      b.textContent.includes('Start listening')
    );
    fireMousedown(startBtn);
    await flush();
    const instance = FakeSpeechRecognition.instances[0];

    lectureUi.cleanup();

    expect(document.getElementById(TOGGLE_ID)).toBeNull();
    expect(document.getElementById(CARD_ID)).toBeNull();
    expect(instance.stop).toHaveBeenCalled();
  });
});

/**
 * The popup's "Start lecture captions" button. The chip is only drawn on LMS hosts and can be put
 * away per site, so the popup's way in has to work without it: on any page the content script runs
 * on, chip or no chip.
 */
describe('openLectureNotes() — the way in from the popup', () => {
  const startButton = () =>
    Array.from(document.getElementById(CARD_ID).querySelectorAll('button')).find(b =>
      b.textContent.includes('Start listening')
    );

  test('opens the card on a page that is not an LMS, where no chip is drawn', async () => {
    isLmsHost.mockReturnValue(false);
    await lectureUi.init();
    expect(document.getElementById(TOGGLE_ID)).toBeNull();

    await expect(lectureUi.openLectureNotes()).resolves.toBe(true);

    expect(document.getElementById(CARD_ID)).not.toBeNull();
    expect(document.getElementById(TOGGLE_ID)).toBeNull();
  });

  test('opens the card when the chip is not on the page (put away, or never mounted)', async () => {
    await expect(lectureUi.openLectureNotes()).resolves.toBe(true);
    expect(document.getElementById(CARD_ID)).not.toBeNull();
  });

  test('moves focus to Start listening', async () => {
    await lectureUi.openLectureNotes();
    expect(document.activeElement).toBe(startButton());
  });

  test('a second press keeps the card open, with what it has heard, and focuses it again', async () => {
    await lectureUi.openLectureNotes();
    fireMousedown(startButton());
    await flush();
    FakeSpeechRecognition.instances[0].onresult(fakeFinalEvent('first point'));
    document.activeElement.blur();

    await expect(lectureUi.openLectureNotes()).resolves.toBe(true);

    const card = document.getElementById(CARD_ID);
    expect(card).not.toBeNull();
    expect(card.textContent).toContain('first point');
    expect(FakeSpeechRecognition.instances[0].stop).not.toHaveBeenCalled();
    expect(card.contains(document.activeElement)).toBe(true);
  });

  test('opens nothing while the lecture companion is switched off', async () => {
    isCompanionEnabled.mockResolvedValue(false);
    await expect(lectureUi.openLectureNotes()).resolves.toBe(false);
    expect(document.getElementById(CARD_ID)).toBeNull();
  });

  test('without speech recognition, focus still lands in the card', async () => {
    delete window.SpeechRecognition;
    await lectureUi.openLectureNotes();
    expect(document.getElementById(CARD_ID).contains(document.activeElement)).toBe(true);
  });

  test('Start asks the same consent question as the chip-opened card', async () => {
    allowDictation.mockResolvedValue(false);
    await lectureUi.openLectureNotes();
    fireMousedown(startButton());
    await flush();
    expect(allowDictation).toHaveBeenCalledWith({ destination: 'lectureCapture' });
    expect(FakeSpeechRecognition.instances).toHaveLength(0);
  });
});

describe('the chip', () => {
  test('stays on LMS hosts only', async () => {
    isLmsHost.mockReturnValue(false);
    await lectureUi.init();
    expect(document.getElementById(TOGGLE_ID)).toBeNull();
  });

  test('moves focus into the card it opens', async () => {
    await openCardViaToggle();
    expect(document.getElementById(CARD_ID).contains(document.activeElement)).toBe(true);
  });
});
