/**
 * The shared offscreen document is created on demand and must be LISTENING before anyone sends to
 * it. `chrome.offscreen.createDocument` resolves when the document exists, not when its module
 * script has registered `onMessage`, and that gap killed the first request from a freshly opened
 * citation library with "Receiving end does not exist".
 */

import { createOffscreenHost } from '../../../src/background/offscreen-host.js';

const URL = 'src/pages/assist-offscreen/offscreen.html';

function fakeChrome({ existing = [], createError = null, contextsError = null } = {}) {
  return {
    runtime: { getURL: path => `chrome-extension://abc/${path}` },
    offscreen: {
      createDocument: jest.fn(async () => {
        if (createError) {
          throw createError;
        }
      }),
    },
    runtimeContexts: jest.fn(async () => {
      if (contextsError) {
        throw contextsError;
      }
      return existing;
    }),
  };
}

function host(chrome, opts = {}) {
  chrome.runtime.getContexts = chrome.runtimeContexts;
  return createOffscreenHost({ chrome, url: URL, readyTimeoutMs: 1000, ...opts });
}

/** Let pending microtasks settle without touching the (faked) timers. */
async function flush() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('offscreen host', () => {
  test('after creating the document, ensure() resolves only once the document reports ready', async () => {
    const chrome = fakeChrome();
    const h = host(chrome);
    let settled = false;
    const p = h.ensure().then(() => {
      settled = true;
    });
    await flush();
    expect(chrome.offscreen.createDocument).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);

    h.markReady();
    await p;
    expect(settled).toBe(true);
  });

  test('does not wait, or create, when the document already exists', async () => {
    const chrome = fakeChrome({ existing: [{ documentUrl: 'chrome-extension://abc/' + URL }] });
    const h = host(chrome);
    await h.ensure();
    expect(chrome.offscreen.createDocument).not.toHaveBeenCalled();
  });

  test('concurrent callers share one creation and one wait', async () => {
    const chrome = fakeChrome();
    const h = host(chrome);
    const a = h.ensure();
    const b = h.ensure();
    await flush();
    expect(chrome.offscreen.createDocument).toHaveBeenCalledTimes(1);
    h.markReady();
    await Promise.all([a, b]);
  });

  test('rejects with a clear error when the document never reports ready', async () => {
    const chrome = fakeChrome();
    const h = host(chrome);
    const p = h.ensure();
    await flush();
    jest.advanceTimersByTime(1000);
    await expect(p).rejects.toThrow(/did not become ready/);
  });

  test('a later ensure() after a timeout tries again rather than staying stuck', async () => {
    const chrome = fakeChrome();
    const h = host(chrome);
    const first = h.ensure();
    await flush();
    jest.advanceTimersByTime(1000);
    await expect(first).rejects.toThrow();

    chrome.runtimeContexts.mockResolvedValue([{ documentUrl: 'chrome-extension://abc/' + URL }]);
    await expect(h.ensure()).resolves.toBeUndefined();
  });

  test("treats Chrome's 'only a single offscreen document' error as the document already existing", async () => {
    const chrome = fakeChrome({
      contextsError: new Error('getContexts is not a function'),
      createError: new Error('Only a single offscreen document may be created.'),
    });
    const h = host(chrome);
    await expect(h.ensure()).resolves.toBeUndefined();
  });

  test('any other creation error is handed to the caller', async () => {
    const chrome = fakeChrome({ createError: new Error('boom') });
    const h = host(chrome);
    await expect(h.ensure()).rejects.toThrow('boom');
  });
});
