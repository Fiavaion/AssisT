/**
 * @jest-environment jsdom
 *
 * The popup's "Start lecture captions" button sends OPEN_LECTURE_NOTES to the active tab. The
 * content script's router answers it by opening the lecture-notes card, on any page the content
 * script runs on, and tells the popup whether the card opened so the popup can say so.
 */

jest.mock('../../../src/features/companion/companion-init.js', () => ({
  companion_reinit: jest.fn(async () => {}),
  companion_cleanup: jest.fn(),
  companion_openLectureNotes: jest.fn(),
}));

const synth = {
  speaking: false,
  paused: false,
  pending: false,
  getVoices: () => [],
  speak() {},
  cancel() {},
  pause() {},
  resume() {},
  addEventListener() {},
  removeEventListener() {},
};

let router;
let companion;

/** Pick the router out by the one message only it answers: PING replies {loaded: true}. */
function findRouter() {
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

beforeAll(async () => {
  global.chrome.storage.onChanged = { addListener: jest.fn(), removeListener: jest.fn() };
  global.window.speechSynthesis = synth;
  global.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
    }
  };
  global.window.SpeechSynthesisUtterance = global.SpeechSynthesisUtterance;
  global.window.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  });

  await import('../../../src/content/content-simple.js');
  companion = await import('../../../src/features/companion/companion-init.js');
  router = findRouter();
  expect(router).toBeDefined();
});

/** Send one message through the router and wait for its reply. */
function send(message) {
  return new Promise(resolve => {
    const keepOpen = router(message, { id: chrome.runtime.id }, resolve);
    expect(keepOpen).toBe(true);
  });
}

test('opens the lecture-notes card and says it did', async () => {
  companion.companion_openLectureNotes.mockResolvedValue(true);

  await expect(send({ type: 'OPEN_LECTURE_NOTES' })).resolves.toEqual({ success: true });
  expect(companion.companion_openLectureNotes).toHaveBeenCalledTimes(1);
});

test('says when the card did not open, so the popup can tell the student', async () => {
  companion.companion_openLectureNotes.mockResolvedValue(false);

  const reply = await send({ type: 'OPEN_LECTURE_NOTES' });
  expect(reply.success).toBe(false);
  expect(reply.error).toEqual(expect.any(String));
});

test('answers even when opening throws', async () => {
  companion.companion_openLectureNotes.mockRejectedValue(new Error('chunk failed'));

  const reply = await send({ type: 'OPEN_LECTURE_NOTES' });
  expect(reply.success).toBe(false);
});

test('rejects the message from another extension', () => {
  const sendResponse = jest.fn();
  router({ type: 'OPEN_LECTURE_NOTES' }, { id: 'someone-else' }, sendResponse);
  expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Unauthorized sender' });
  expect(companion.companion_openLectureNotes).not.toHaveBeenCalled();
});
