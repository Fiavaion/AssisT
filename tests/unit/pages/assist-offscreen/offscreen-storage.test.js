/**
 * The offscreen storage bridge.
 *
 * An offscreen document has no `chrome.storage` — it must ask the service worker. These tests cover
 * both ends of that seam: the client the document calls, and the pure gate the worker applies before
 * it touches storage on the document's behalf.
 */

import {
  createOffscreenStorage,
  authorizeOffscreenStorageRequest,
} from '../../../../src/pages/assist-offscreen/offscreen-storage.js';
import {
  OFFSCREEN_STORAGE_GET,
  OFFSCREEN_STORAGE_SET,
  OFFSCREEN_STORAGE_TARGET,
  OFFSCREEN_DOCUMENT_PATH,
} from '../../../../src/config/citation-messages.js';

/** A runtime whose sendMessage returns whatever the test queues, recording what it was sent. */
function fakeRuntime(reply) {
  return {
    sendMessage: jest.fn(async () => (typeof reply === 'function' ? reply() : reply)),
  };
}

const senderContext = { extensionId: 'abc', offscreenUrl: OFFSCREEN_DOCUMENT_PATH };
const offscreenSender = { id: 'abc', url: 'chrome-extension://abc/' + OFFSCREEN_DOCUMENT_PATH };

describe('createOffscreenStorage — the client side', () => {
  it('asks the service worker for the named keys and returns the result', async () => {
    const runtime = fakeRuntime({ ok: true, result: { citationIndex: [{ id: '1' }] } });
    const storage = createOffscreenStorage({ runtime });

    const result = await storage.get(['citationIndex']);

    expect(runtime.sendMessage).toHaveBeenCalledWith({
      target: OFFSCREEN_STORAGE_TARGET,
      action: OFFSCREEN_STORAGE_GET,
      keys: ['citationIndex'],
    });
    expect(result).toEqual({ citationIndex: [{ id: '1' }] });
  });

  it('accepts a single key as a string', async () => {
    const runtime = fakeRuntime({ ok: true, result: {} });
    await createOffscreenStorage({ runtime }).get('citationIndex');
    expect(runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ keys: ['citationIndex'] })
    );
  });

  it('sends the items on a write and resolves once the worker confirms', async () => {
    const runtime = fakeRuntime({ ok: true, result: null });
    const storage = createOffscreenStorage({ runtime });

    await storage.set({ citationIndex: [] });

    expect(runtime.sendMessage).toHaveBeenCalledWith({
      target: OFFSCREEN_STORAGE_TARGET,
      action: OFFSCREEN_STORAGE_SET,
      items: { citationIndex: [] },
    });
  });

  it('round-trips a write and a read through one fake worker', async () => {
    const backing = {};
    const runtime = {
      sendMessage: jest.fn(async message => {
        if (message.action === OFFSCREEN_STORAGE_SET) {
          Object.assign(backing, message.items);
          return { ok: true, result: null };
        }
        const picked = {};
        for (const key of message.keys) {
          if (key in backing) {
            picked[key] = backing[key];
          }
        }
        return { ok: true, result: picked };
      }),
    };
    const storage = createOffscreenStorage({ runtime });

    await storage.set({ webllmModel: 'llama-3.2-1b' });
    expect(await storage.get(['webllmModel'])).toEqual({ webllmModel: 'llama-3.2-1b' });
  });

  it('rejects with the worker error when the reply says the request failed', async () => {
    const runtime = fakeRuntime({ ok: false, error: 'key not permitted: secretToken' });
    await expect(createOffscreenStorage({ runtime }).get(['secretToken'])).rejects.toThrow(
      'key not permitted: secretToken'
    );
  });

  it('rejects when nobody answers (no service worker on the other end)', async () => {
    const runtime = fakeRuntime(undefined);
    await expect(createOffscreenStorage({ runtime }).get(['citationIndex'])).rejects.toThrow(
      /no reply/i
    );
  });
});

describe('authorizeOffscreenStorageRequest — the worker-side gate', () => {
  it('admits a read of an allowed key from the offscreen document', () => {
    const decision = authorizeOffscreenStorageRequest(
      {
        target: OFFSCREEN_STORAGE_TARGET,
        action: OFFSCREEN_STORAGE_GET,
        keys: ['citationIndex'],
      },
      offscreenSender,
      senderContext
    );
    expect(decision).toEqual({
      ok: true,
      action: OFFSCREEN_STORAGE_GET,
      keys: ['citationIndex'],
      items: null,
    });
  });

  it('admits a write and hands back the items to store', () => {
    const decision = authorizeOffscreenStorageRequest(
      {
        target: OFFSCREEN_STORAGE_TARGET,
        action: OFFSCREEN_STORAGE_SET,
        items: { citationMigration: { done: true } },
      },
      offscreenSender,
      senderContext
    );
    expect(decision.ok).toBe(true);
    expect(decision.items).toEqual({ citationMigration: { done: true } });
    expect(decision.keys).toEqual(['citationMigration']);
  });

  it('refuses a key outside the allow-list', () => {
    const decision = authorizeOffscreenStorageRequest(
      { target: OFFSCREEN_STORAGE_TARGET, action: OFFSCREEN_STORAGE_GET, keys: ['apiKeys'] },
      offscreenSender,
      senderContext
    );
    expect(decision.ok).toBe(false);
    expect(decision.error).toMatch(/apiKeys/);
  });

  it('refuses a write that smuggles a disallowed key alongside an allowed one', () => {
    const decision = authorizeOffscreenStorageRequest(
      {
        target: OFFSCREEN_STORAGE_TARGET,
        action: OFFSCREEN_STORAGE_SET,
        items: { citationIndex: [], assist_settings: { evil: true } },
      },
      offscreenSender,
      senderContext
    );
    expect(decision.ok).toBe(false);
    expect(decision.error).toMatch(/assist_settings/);
  });

  it('refuses a sender from another extension', () => {
    const decision = authorizeOffscreenStorageRequest(
      { target: OFFSCREEN_STORAGE_TARGET, action: OFFSCREEN_STORAGE_GET, keys: ['citationIndex'] },
      { id: 'someone-else', url: 'chrome-extension://someone-else/' + OFFSCREEN_DOCUMENT_PATH },
      senderContext
    );
    expect(decision.ok).toBe(false);
    expect(decision.error).toMatch(/sender/i);
  });

  it('refuses a content script, even one running in our own extension', () => {
    const decision = authorizeOffscreenStorageRequest(
      { target: OFFSCREEN_STORAGE_TARGET, action: OFFSCREEN_STORAGE_GET, keys: ['citationIndex'] },
      { id: 'abc', tab: { id: 3 }, url: 'https://canvas.example/courses/1' },
      senderContext
    );
    expect(decision.ok).toBe(false);
    expect(decision.error).toMatch(/sender/i);
  });

  it('refuses another extension page of ours — only the offscreen document may use the bridge', () => {
    const decision = authorizeOffscreenStorageRequest(
      { target: OFFSCREEN_STORAGE_TARGET, action: OFFSCREEN_STORAGE_GET, keys: ['citationIndex'] },
      { id: 'abc', url: 'chrome-extension://abc/src/pages/citation-library/library.html' },
      senderContext
    );
    expect(decision.ok).toBe(false);
    expect(decision.error).toMatch(/sender/i);
  });

  it('refuses a message aimed at some other realm', () => {
    const decision = authorizeOffscreenStorageRequest(
      { target: 'offscreen-citations', action: OFFSCREEN_STORAGE_GET, keys: ['citationIndex'] },
      offscreenSender,
      senderContext
    );
    expect(decision.ok).toBe(false);
  });

  it('refuses a read with no keys and a write with no items', () => {
    expect(
      authorizeOffscreenStorageRequest(
        { target: OFFSCREEN_STORAGE_TARGET, action: OFFSCREEN_STORAGE_GET, keys: [] },
        offscreenSender,
        senderContext
      ).ok
    ).toBe(false);
    expect(
      authorizeOffscreenStorageRequest(
        { target: OFFSCREEN_STORAGE_TARGET, action: OFFSCREEN_STORAGE_SET, items: null },
        offscreenSender,
        senderContext
      ).ok
    ).toBe(false);
  });
});
