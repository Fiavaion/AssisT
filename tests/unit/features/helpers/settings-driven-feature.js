/**
 * A chrome.storage fake for the features that switch themselves on from storage.
 *
 * Four of the page supports (media control, reading progress, reduced motion, simplify) reach the
 * student's choices through `initFeatureSettings`, which reads `assist_settings` with a CALLBACK and
 * listens on `chrome.storage.onChanged`. The shared jest setup hands out a promise-only
 * `chrome.storage.local.get` and no `onChanged` at all, so a suite that leans on it tests nothing:
 * the feature's init callback never runs and its change listener throws. This harness gives the
 * real shapes — callback reads, writes that notify listeners the way Chrome does — so a test can
 * write the key the POPUP writes and watch the page change.
 *
 * It also snapshots the page, because "switched off" has to mean the student's document is back:
 * element counts by tag, our own ids, the head's style tags and the body style attribute.
 */

/**
 * Installs a callback-capable chrome.storage.local fake over `global.chrome`.
 *
 * @param {Object} [initialSettings] - The contents of `assist_settings` at page load. Pass nothing
 *   for a student who has never opened the popup, which is the case features most often get wrong.
 * @returns {{writeFeature: Function, writeRaw: Function, listenerCount: Function}} Test controls.
 */
export function installStorage(initialSettings) {
  const store = {};
  if (initialSettings !== undefined) {
    store.assist_settings = initialSettings;
  }
  const listeners = new Set();

  const read = (keys, callback) => {
    const wanted =
      typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
    const result = {};
    for (const key of wanted) {
      if (key in store) {
        result[key] = store[key];
      }
    }
    if (typeof callback === 'function') {
      callback(result);
    }
    return Promise.resolve(result);
  };

  const write = (items, callback) => {
    const changes = {};
    for (const [key, value] of Object.entries(items)) {
      changes[key] = { oldValue: store[key], newValue: value };
      store[key] = value;
    }
    if (typeof callback === 'function') {
      callback();
    }
    for (const listener of [...listeners]) {
      listener(changes, 'local');
    }
    return Promise.resolve();
  };

  global.chrome = {
    storage: {
      local: { get: jest.fn(read), set: jest.fn(write), remove: jest.fn(), clear: jest.fn() },
      sync: { get: jest.fn(read), set: jest.fn(write) },
      onChanged: {
        addListener: jest.fn(listener => listeners.add(listener)),
        removeListener: jest.fn(listener => listeners.delete(listener)),
      },
    },
    runtime: {
      id: 'test-extension-id',
      getURL: path => `chrome-extension://test-id/${path}`,
      sendMessage: jest.fn(),
      onMessage: { addListener: jest.fn(), removeListener: jest.fn() },
    },
  };

  return {
    /** Write one feature's settings the way the popup does: nested under `assist_settings`. */
    writeFeature(featureKey, patch) {
      const settings = { ...(store.assist_settings || {}) };
      settings[featureKey] = { ...settings[featureKey], ...patch };
      return write({ assist_settings: settings });
    },
    /** Write a top-level storage key. */
    writeRaw(items) {
      return write(items);
    },
    listenerCount() {
      return listeners.size;
    },
  };
}

/** Lets the promise chain inside `initFeatureSettings` finish before a test asserts. */
export function flush() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Everything about the page a student would notice a support having changed.
 *
 * @returns {Object} A comparable snapshot: one count per tag name, our own element ids, the ids of
 *   the style tags in the head, and the body's inline style attribute.
 */
export function snapshotPage() {
  const tagCounts = {};
  for (const element of document.querySelectorAll('*')) {
    tagCounts[element.tagName] = (tagCounts[element.tagName] || 0) + 1;
  }
  return {
    tagCounts,
    assistIds: [...document.querySelectorAll('[id^="assist-"]')].map(el => el.id).sort(),
    headStyleIds: [...document.head.querySelectorAll('style')].map(el => el.id).sort(),
    bodyStyle: document.body.getAttribute('style'),
    bodyClass: document.body.getAttribute('class'),
  };
}
