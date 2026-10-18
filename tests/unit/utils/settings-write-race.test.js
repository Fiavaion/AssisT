/**
 * Two realms write the settings object: the popup and the content script. Read the whole object,
 * change one branch, write the whole object back, and whatever the other realm stored in between is
 * gone — a student's voice or spacing silently reset by a toggle they flipped somewhere else.
 *
 * The first block proves the race with a real store: a held snapshot loses the other realm's branch,
 * and the shared writer in `src/utils/setting-writes.js` does not, because it reads, merges and
 * writes in one place at write time.
 *
 * The rest hold the line: every module that persists a setting delegates to that writer instead of
 * keeping its own copy of the merge.
 */

import { applySettingWrites } from '../../../src/utils/setting-writes.js';

/**
 * A `chrome.storage.local` that actually stores things, so a lost write shows up as a lost value
 * rather than as an argument assertion.
 * @param {Object} initial
 */
function installStore(initial = {}) {
  const data = structuredClone(initial);

  chrome.storage.local.get.mockImplementation((keys, callback) => {
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

  chrome.storage.local.set.mockImplementation((payload, callback) => {
    Object.assign(data, structuredClone(payload));
    if (typeof callback === 'function') {
      callback();
      return undefined;
    }
    return Promise.resolve();
  });

  return data;
}

/** The other realm, storing a branch of its own while our caller is mid-flight. */
async function otherRealmWrites(path, value) {
  await applySettingWrites([{ path, value }]);
}

describe('the settings write race', () => {
  it('loses the other realm’s branch when a held snapshot is written back whole', async () => {
    const data = installStore({ assist_settings: { tts: { rate: 1, voice: 'Ada' } } });

    // Realm A reads, and holds what it read while it does something else.
    const held = (await chrome.storage.local.get('assist_settings')).assist_settings;

    // Realm B stores a setting of its own.
    await otherRealmWrites('tts.rate', 2);

    // Realm A changes its own branch and writes the whole object back.
    held.magnifyingLens = { enabled: true };
    await chrome.storage.local.set({ assist_settings: held });

    expect(data.assist_settings.magnifyingLens).toEqual({ enabled: true });
    expect(data.assist_settings.tts.rate).toBe(1); // realm B's write is gone
  });

  it('keeps the other realm’s branch when the write goes through the shared writer', async () => {
    const data = installStore({ assist_settings: { tts: { rate: 1, voice: 'Ada' } } });

    await chrome.storage.local.get('assist_settings');
    await otherRealmWrites('tts.rate', 2);
    await applySettingWrites([{ path: 'magnifyingLens', value: { enabled: true } }]);

    expect(data.assist_settings.magnifyingLens).toEqual({ enabled: true });
    expect(data.assist_settings.tts.rate).toBe(2);
    expect(data.assist_settings.tts.voice).toBe('Ada');
  });

  it('keeps a top-level local key out of the settings object', async () => {
    const data = installStore({ aiMode: 'off', assist_settings: { tts: { rate: 1 } } });

    await applySettingWrites([{ store: 'local', path: 'aiMode', value: 'local' }]);

    expect(data.aiMode).toBe('local');
    expect(data.assist_settings.tts.rate).toBe(1);
  });
});

describe('the writers that persist a setting', () => {
  it('storage-utils offers no whole-object write to hold a stale copy in', async () => {
    const module = await import('../../../src/content/utils/storage-utils.js');
    expect(module.saveSettings).toBeUndefined();
  });

  it('saveSetting() merges one feature key and leaves the rest', async () => {
    const data = installStore({ assist_settings: { tts: { rate: 1 } } });
    const { saveSetting } = await import('../../../src/content/utils/storage-utils.js');

    const held = (await chrome.storage.local.get('assist_settings')).assist_settings;
    await otherRealmWrites('tts.rate', 2);
    await saveSetting('magnifyingLens', { ...(held.magnifyingLens || {}), enabled: true });

    expect(data.assist_settings.magnifyingLens).toEqual({ enabled: true });
    expect(data.assist_settings.tts.rate).toBe(2);
  });

  it('saveShortcuts() keeps a setting stored after it read', async () => {
    const data = installStore({ assist_settings: { tts: { rate: 1 } } });
    const { saveShortcuts, loadShortcuts } = await import('../../../src/utils/keyboard-shortcuts.js');

    const shortcuts = await loadShortcuts();
    await otherRealmWrites('tts.rate', 2);
    await saveShortcuts({ ...shortcuts, ocr_activate: 'Alt+Shift+O' });

    expect(data.assist_settings.keyboardShortcuts.ocr_activate).toBe('Alt+Shift+O');
    expect(data.assist_settings.tts.rate).toBe(2);
  });

  it('StorageManager.updateSetting() creates the branch a dotted path needs', async () => {
    const data = installStore({ assist_settings: {} });
    const { StorageManager } = await import('../../../src/utils/storage-manager.js');

    await StorageManager.updateSetting('stt.vocabulary.autoLearn', true);

    expect(data.assist_settings.stt.vocabulary.autoLearn).toBe(true);
  });
});
