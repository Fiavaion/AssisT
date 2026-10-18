/**
 * @jest-environment jsdom
 *
 * The popup's save must not discard what another realm stored while it was open.
 *
 * The popup reads the whole settings object when it opens and roughly 160 handlers mutate that
 * in-memory copy. Writing the copy back whole is how a feature switched off from the page, or a
 * preference the mind map saved, silently disappears. `saveSettings()` now diffs its copy against
 * the pristine one taken at load and writes only the paths the student actually changed, through the
 * shared writer in `src/utils/setting-writes.js`, which re-reads and merges at write time.
 *
 * @see src/popup/popup.js saveSettings
 * @see src/utils/setting-writes.js
 */

import { applySettingWrites } from '../../../src/utils/setting-writes.js';

let PopupController;

beforeAll(async () => {
  chrome.storage.onChanged = { addListener: jest.fn(), removeListener: jest.fn() };
  ({ PopupController } = await import('../../../src/popup/popup.js'));
});

/**
 * A `chrome.storage.local` that actually stores things, so a lost write shows up as a lost value
 * rather than as an argument assertion.
 * @param {Object} initial
 * @returns {Object} the live store
 */
function installStore(initial = {}) {
  const data = structuredClone(initial);

  chrome.storage.local.get = jest.fn((keys, callback) => {
    const names = keys === null || keys === undefined ? Object.keys(data) : [].concat(keys);
    const out = {};
    names.forEach(name => {
      if (name in data) {
        out[name] = structuredClone(data[name]);
      }
    });
    if (typeof callback === 'function') {
      callback(out);
      return undefined;
    }
    return Promise.resolve(out);
  });

  chrome.storage.local.set = jest.fn((payload, callback) => {
    Object.assign(data, structuredClone(payload));
    if (typeof callback === 'function') {
      callback();
      return undefined;
    }
    return Promise.resolve();
  });

  return data;
}

/**
 * A popup that has just opened over the given stored settings: `this.settings` and the pristine
 * copy both come from one `loadSettings()`, exactly as the real popup does it.
 * @param {Object} stored
 */
async function openedPopup(stored) {
  chrome.runtime.sendMessage = jest.fn(async message => {
    if (message.type === 'GET_SETTINGS') {
      return { success: true, data: structuredClone(stored) };
    }
    return { success: true };
  });

  const popup = new PopupController();
  const loaded = await popup.loadSettings();
  expect(loaded).toBe(true);
  return popup;
}

/** The other realm, storing a setting of its own while the popup sits open. */
async function otherRealmWrites(path, value) {
  await applySettingWrites([{ path, value }]);
}

describe('the popup saving over another realm', () => {
  it('keeps a setting another realm stored while the popup was open', async () => {
    const stored = { tts: { rate: 1, voice: 'Ada' }, citations: { style: 'apa' } };
    const data = installStore({ assist_settings: stored });
    const popup = await openedPopup(stored);

    await otherRealmWrites('tts.rate', 2);

    popup.settings.citations.style = 'harvard';
    await popup.saveSettings();

    expect(data.assist_settings.citations.style).toBe('harvard');
    expect(data.assist_settings.tts.rate).toBe(2);
    expect(data.assist_settings.tts.voice).toBe('Ada');
  });

  it('persists a value the student put back to its default', async () => {
    const stored = { tts: { rate: 1.5 } };
    const data = installStore({ assist_settings: stored });
    const popup = await openedPopup(stored);

    popup.settings.tts.rate = 1;
    popup.settings.tts.enabled = false;
    await popup.saveSettings();

    expect(data.assist_settings.tts.rate).toBe(1);
    expect(data.assist_settings.tts.enabled).toBe(false);
  });

  it('creates a branch the stored copy never had', async () => {
    const stored = { tts: { rate: 1 } };
    const data = installStore({ assist_settings: stored });
    const popup = await openedPopup(stored);

    popup.settings.stt = { vocabulary: { autoLearn: true } };
    await popup.saveSettings();

    expect(data.assist_settings.stt.vocabulary.autoLearn).toBe(true);
    expect(data.assist_settings.tts.rate).toBe(1);
  });

  it('writes an emptied list whole rather than merging the old entries back', async () => {
    const stored = { citations: { entries: ['a', 'b'] } };
    const data = installStore({ assist_settings: stored });
    const popup = await openedPopup(stored);

    popup.settings.citations.entries = [];
    await popup.saveSettings();

    expect(data.assist_settings.citations.entries).toEqual([]);
  });

  it('writes a key the student removed out of the stored branch', async () => {
    const stored = { tts: { rate: 1, voice: 'Ada' } };
    const data = installStore({ assist_settings: stored });
    const popup = await openedPopup(stored);

    delete popup.settings.tts.voice;
    await popup.saveSettings();

    expect(data.assist_settings.tts.voice).toBeUndefined();
    expect(data.assist_settings.tts.rate).toBe(1);
  });

  it('writes nothing at all when nothing changed', async () => {
    const stored = { tts: { rate: 1, voice: 'Ada' } };
    installStore({ assist_settings: stored });
    const popup = await openedPopup(stored);

    chrome.storage.local.set.mockClear();
    await popup.saveSettings();

    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it('refreshes its pristine copy, so a second save does not rewrite the first change', async () => {
    const stored = { tts: { rate: 1 }, citations: { style: 'apa' } };
    const data = installStore({ assist_settings: stored });
    const popup = await openedPopup(stored);

    popup.settings.citations.style = 'harvard';
    await popup.saveSettings();

    // The other realm now owns the citation style, and the popup's next save touches only tts.
    await otherRealmWrites('citations.style', 'mla');
    popup.settings.tts.rate = 2;
    await popup.saveSettings();

    expect(data.assist_settings.citations.style).toBe('mla');
    expect(data.assist_settings.tts.rate).toBe(2);
  });
});
