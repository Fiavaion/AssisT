/**
 * @jest-environment jsdom
 *
 * Voice capture has to work on its own. Pressing it used to bind a trigger on the dictation
 * controller and nothing else, so with voice typing not running the button turned blue, nothing
 * listened and nothing was said. The session now starts listening itself (after the dictation
 * question), piggybacks on dictation that is already running, and never shows the pressed state
 * while nothing is listening.
 *
 * resetMocks:true wipes factory implementations, so every mock is armed in beforeEach.
 */

jest.mock('../../../../src/utils/dictation-consent.js', () => ({
  allowDictation: jest.fn(),
}));
jest.mock('../../../../src/engines/stt/stt-controller-facade.js', () => ({
  STTController: jest.fn(),
}));

import { createVoiceCaptureSession } from '../../../../src/features/citations/capture/voice-capture-session.js';
import { allowDictation } from '../../../../src/utils/dictation-consent.js';
import { STTController } from '../../../../src/engines/stt/stt-controller-facade.js';

/** A recogniser double that behaves like STTController's public surface. */
function fakeRecogniser(state = {}) {
  const listeners = new Set();
  const r = {
    isRecording: false,
    isStarting: false,
    onCitationTrigger: () => false,
    options: null,
    startListening: jest.fn(() => {
      r.isStarting = true;
      return true;
    }),
    stopListening: jest.fn(() => {
      r.isRecording = false;
      r.isStarting = false;
      return true;
    }),
    destroy: jest.fn(),
    addStateListener: jest.fn(fn => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }),
    emit(event) {
      if (event.type === 'start') {
        r.isRecording = true;
        r.isStarting = false;
      } else {
        r.isRecording = false;
        r.isStarting = false;
      }
      [...listeners].forEach(fn => fn(event));
    },
    get listenerCount() {
      return listeners.size;
    },
    ...state,
  };
  return r;
}

const flush = () => new Promise(r => setTimeout(r, 0));

let shared;
let own;
let changes;
let onTrigger;
let session;

function last() {
  return changes[changes.length - 1];
}

beforeEach(() => {
  shared = null;
  own = fakeRecogniser();
  changes = [];
  onTrigger = jest.fn(() => true);
  allowDictation.mockResolvedValue(true);
  STTController.mockImplementation(options => {
    own.options = options;
    if (options.onCitationTrigger) {
      own.onCitationTrigger = options.onCitationTrigger;
    }
    return own;
  });
  session = createVoiceCaptureSession({
    getDictation: () => shared,
    onTrigger,
    onChange: change => changes.push(change),
    returnFocus: () => document.body,
  });
});

describe('with dictation not running', () => {
  test('asks the dictation question, then starts its own recogniser with no field to type into', async () => {
    session.toggle();
    await flush();

    expect(allowDictation).toHaveBeenCalledTimes(1);
    expect(STTController).toHaveBeenCalledTimes(1);
    expect(own.startListening).toHaveBeenCalledWith(null);
    // Nothing the student says is typed or treated as an editing command.
    expect(own.options.voiceCommands).toBe(false);
    // Asked here already, so the controller does not ask a second time.
    expect(own.options.confirmStart()).toBe(true);
  });

  test('is not shown pressed until the microphone is actually listening', async () => {
    session.toggle();
    await flush();

    expect(changes.every(c => c.listening === false)).toBe(true);
    expect(last().message).toMatch(/starting|microphone/i);

    own.emit({ type: 'start' });

    expect(last().listening).toBe(true);
  });

  test('says what to do, using the trigger phrases the recogniser listens for', async () => {
    session.toggle();
    await flush();
    own.emit({ type: 'start' });

    expect(last().message).toMatch(/^Listening\./);
    expect(last().message).toContain('"cite this"');
    expect(last().message).toContain('"capture source"');
    expect(last().message).toContain('"save citation"');
  });

  test('a trigger heard by its own recogniser reaches the capture', async () => {
    session.toggle();
    await flush();

    expect(own.onCitationTrigger('cite this')).toBe(true);
    expect(onTrigger).toHaveBeenCalledWith('cite this');
  });

  test('declining the dictation question leaves it off, says why, and starts nothing', async () => {
    allowDictation.mockResolvedValue(false);
    session.toggle();
    await flush();

    expect(STTController).not.toHaveBeenCalled();
    expect(last().listening).toBe(false);
    expect(last().message).toMatch(/off/i);
    expect(last().message).toMatch(/not allowed|nothing was recorded/i);
    expect(session.state).toBe('off');
  });

  test('a blocked microphone turns it off and says how to fix it', async () => {
    session.toggle();
    await flush();
    own.emit({ type: 'start' });
    own.emit({ type: 'error', code: 'not-allowed', message: 'engine sentence' });

    expect(last().listening).toBe(false);
    expect(last().message).toMatch(/off/i);
    expect(last().message).toMatch(/microphone/i);
    expect(last().message).toMatch(/Voice capture again/);
    expect(own.destroy).toHaveBeenCalled();
    expect(session.state).toBe('off');
  });

  describe('silence', () => {
    async function listening() {
      session.toggle();
      await flush();
      own.emit({ type: 'start' });
      changes.length = 0;
    }

    test('no-speech restarts listening quietly and the button stays pressed', async () => {
      await listening();
      own.emit({ type: 'error', code: 'no-speech', message: 'engine sentence' });
      own.emit({ type: 'end' });

      expect(own.startListening).toHaveBeenCalledTimes(2);
      expect(own.destroy).not.toHaveBeenCalled();
      expect(session.state).toBe('listening');
      expect(changes).toEqual([]);

      own.emit({ type: 'start' });
      expect(session.state).toBe('listening');
      expect(own.onCitationTrigger('cite this')).toBe(true);
    });

    test('keeps listening through several silent stretches', async () => {
      await listening();
      for (let i = 0; i < 3; i++) {
        own.emit({ type: 'error', code: 'no-speech' });
        own.emit({ type: 'end' });
        own.emit({ type: 'start' });
      }

      expect(own.startListening).toHaveBeenCalledTimes(4);
      expect(session.state).toBe('listening');
      expect(changes).toEqual([]);
    });

    test('pressing stop while a restart is pending does not restart', async () => {
      await listening();
      own.emit({ type: 'error', code: 'no-speech' });
      session.toggle();
      own.emit({ type: 'end' });

      expect(own.startListening).toHaveBeenCalledTimes(1);
      expect(session.state).toBe('off');
      expect(last().listening).toBe(false);
    });

    test('a restart that cannot start turns it off and says so', async () => {
      await listening();
      own.startListening.mockReturnValue(false);
      own.emit({ type: 'error', code: 'no-speech' });
      own.emit({ type: 'end' });

      expect(session.state).toBe('off');
      expect(last().message).toMatch(/could not start/i);
    });

    test('silence straight after a restart, with nothing heard starting, gives up rather than spinning', async () => {
      await listening();
      own.emit({ type: 'error', code: 'no-speech' });
      own.emit({ type: 'end' });
      own.emit({ type: 'error', code: 'no-speech' });
      own.emit({ type: 'end' });

      expect(own.startListening).toHaveBeenCalledTimes(2);
      expect(session.state).toBe('off');
      expect(last().listening).toBe(false);
      expect(last().message).toMatch(/nothing was heard/i);
    });

    test('real errors still stop and show their message', async () => {
      await listening();
      own.emit({ type: 'error', code: 'audio-capture', message: 'No microphone was found.' });

      expect(session.state).toBe('off');
      expect(last().message).toBe('Voice capture is off. No microphone was found.');
      expect(own.startListening).toHaveBeenCalledTimes(1);
    });
  });

  test('a recogniser that stops by itself turns the button off and says so', async () => {
    session.toggle();
    await flush();
    own.emit({ type: 'start' });
    own.emit({ type: 'end' });

    expect(last().listening).toBe(false);
    expect(last().message).toMatch(/off/i);
    expect(session.state).toBe('off');
  });

  test('pressing again stops the microphone it started and says so', async () => {
    session.toggle();
    await flush();
    own.emit({ type: 'start' });
    session.toggle();

    expect(own.stopListening).toHaveBeenCalled();
    expect(own.destroy).toHaveBeenCalled();
    expect(last()).toEqual({ listening: false, message: expect.stringMatching(/off/i) });
    expect(last().message).toMatch(/microphone has stopped/i);
  });

  test('pressing again while the question is still open cancels the start', async () => {
    let answer;
    allowDictation.mockReturnValue(new Promise(r => (answer = r)));
    session.toggle();
    session.toggle();
    answer(true);
    await flush();

    expect(STTController).not.toHaveBeenCalled();
    expect(session.state).toBe('off');
    expect(last().listening).toBe(false);
  });

  test('a recogniser that cannot start at all leaves it off and says so', async () => {
    own.startListening.mockReturnValue(false);
    session.toggle();
    await flush();

    expect(last().listening).toBe(false);
    expect(last().message).toMatch(/could not start/i);
    expect(session.state).toBe('off');
  });
});

describe('with dictation already running', () => {
  beforeEach(() => {
    shared = fakeRecogniser({ isRecording: true });
  });

  test('listens on the running recogniser: no second recogniser and no second question', () => {
    session.toggle();

    expect(STTController).not.toHaveBeenCalled();
    expect(allowDictation).not.toHaveBeenCalled();
    expect(last().listening).toBe(true);
    expect(shared.onCitationTrigger('cite this')).toBe(true);
    expect(onTrigger).toHaveBeenCalled();
  });

  test('pressing again unbinds the trigger but leaves voice typing running', () => {
    session.toggle();
    session.toggle();

    expect(shared.stopListening).not.toHaveBeenCalled();
    expect(shared.onCitationTrigger('cite this')).toBe(false);
    expect(shared.listenerCount).toBe(0);
    expect(last().listening).toBe(false);
    expect(last().message).toMatch(/voice typing is still on/i);
  });

  test('voice typing stopping turns Voice capture off and says so', () => {
    session.toggle();
    shared.emit({ type: 'end' });

    expect(last().listening).toBe(false);
    expect(last().message).toMatch(/off/i);
    expect(shared.onCitationTrigger('cite this')).toBe(false);
    expect(session.state).toBe('off');
  });
});

describe('stop()', () => {
  test('tears down quietly and releases the microphone it started', async () => {
    session.toggle();
    await flush();
    own.emit({ type: 'start' });
    session.stop();

    expect(own.destroy).toHaveBeenCalled();
    expect(own.listenerCount).toBe(0);
    expect(session.state).toBe('off');
  });
});
