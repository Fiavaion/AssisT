/**
 * @jest-environment jsdom
 *
 * The content script's main message router is not the only listener on the page. Feature modules
 * register their own: the learning record answers COGNITIVE_PROFILE_SHOW, the annotation sidebar
 * answers toggleAnnotationSidebar, image descriptions answer DESCRIBE_IMAGE (sent with `action`, not
 * `type`). Chrome delivers the FIRST reply only, and the router is registered first, so a router that
 * answers messages it does not own wins every time and the feature's own answer is dropped. That is
 * how "See what is recorded" opened its panel and still told the student it had failed.
 *
 * So: a message the router does not handle gets no reply from it, and the channel is not held open.
 */

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
  router = findRouter();
  expect(router).toBeDefined();
});

describe.each([
  ['the learning record', { type: 'COGNITIVE_PROFILE_SHOW' }],
  ['the annotation sidebar', { type: 'toggleAnnotationSidebar' }],
  ['image descriptions', { action: 'DESCRIBE_IMAGE', imageUrl: 'https://example.com/a.png' }],
  ['a type nobody knows', { type: 'NOT_A_REAL_MESSAGE' }],
])("a message for %s is left to its own listener", (_name, message) => {
  test('the router does not answer it and does not hold the channel open', () => {
    const sendResponse = jest.fn();

    const keepOpen = router(message, { id: chrome.runtime.id }, sendResponse);

    expect(sendResponse).not.toHaveBeenCalled();
    expect(keepOpen).toBe(false);
  });
});

test('the router still answers its own messages', () => {
  const sendResponse = jest.fn();

  router({ type: 'PING' }, { id: chrome.runtime.id }, sendResponse);

  expect(sendResponse).toHaveBeenCalledWith({ success: true, loaded: true });
});
