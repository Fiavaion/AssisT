/**
 * @jest-environment jsdom
 *
 * Something other than the dictation feature can need to know when the page's one recogniser
 * starts, stops or fails: citation Voice capture listens on it, and its button must never stay
 * pressed after the microphone has gone quiet. The controller's own onStart/onEnd/onError belong
 * to the feature that created it, so other listeners subscribe instead of replacing them.
 */

jest.mock('../../../src/utils/dictation-consent.js', () => ({
  allowDictation: () => true,
  onDictationWithdrawn: () => () => {},
}));

import { STTController } from '../../../src/engines/stt/stt-controller.js';

class MockSpeechRecognition {
  start() {
    this.onstart?.();
  }
  stop() {
    this.onend?.();
  }
  abort() {}
}

beforeAll(() => {
  global.webkitSpeechRecognition = MockSpeechRecognition;
});

afterAll(() => {
  delete global.webkitSpeechRecognition;
});

describe('STTController state listeners', () => {
  let controller;
  let events;

  beforeEach(() => {
    events = [];
    controller = new STTController({ onStart: jest.fn(), onEnd: jest.fn(), onError: jest.fn() });
    controller.addStateListener(event => events.push(event));
  });

  afterEach(() => {
    controller?.destroy();
    controller = null;
  });

  test('hears the recogniser start and stop, and the owner still gets its own callbacks', () => {
    controller.startListening(null);
    controller.stopListening();

    expect(events.map(e => e.type)).toEqual(['start', 'end']);
    expect(controller.onStart).toHaveBeenCalledTimes(1);
    expect(controller.onEnd).toHaveBeenCalledTimes(1);
  });

  test('hears an error with the engine code and the sentence a student can read', () => {
    controller.startListening(null);
    controller.handleError({ error: 'not-allowed' });

    const error = events.find(e => e.type === 'error');
    expect(error.code).toBe('not-allowed');
    expect(error.message).toMatch(/microphone/i);
  });

  test('a deliberate abort is not reported as an error', () => {
    controller.startListening(null);
    controller.handleError({ error: 'aborted' });

    expect(events.some(e => e.type === 'error')).toBe(false);
  });

  test('hears the end when consent is declined before anything started', async () => {
    controller.confirmStart = () => Promise.resolve(false);
    controller.startListening(null);
    await Promise.resolve();
    await Promise.resolve();

    expect(events.map(e => e.type)).toEqual(['end']);
  });

  test('hears the end when the controller is destroyed mid-recording', () => {
    controller.startListening(null);
    events.length = 0;
    controller.destroy();
    controller = null;

    expect(events.map(e => e.type)).toEqual(['end']);
  });

  test('stops hearing anything once unsubscribed', () => {
    const own = [];
    const unsubscribe = controller.addStateListener(e => own.push(e));
    unsubscribe();
    controller.startListening(null);

    expect(own).toEqual([]);
  });

  test('a listener that throws does not stop the others or the owner hearing', () => {
    controller.addStateListener(() => {
      throw new Error('broken listener');
    });
    const later = [];
    controller.addStateListener(e => later.push(e));
    controller.startListening(null);

    expect(later.map(e => e.type)).toEqual(['start']);
    expect(controller.onStart).toHaveBeenCalledTimes(1);
  });
});
