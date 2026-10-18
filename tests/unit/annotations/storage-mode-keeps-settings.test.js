/**
 * Changing where annotations are kept must not touch anything else the student has set.
 *
 * It used to. The popup's annotation storage picker called a settings manager that held its own,
 * smaller idea of what `assist_settings` contains, and wrote that whole object back. Everything
 * outside its eight branches — citation style, maths, the learning platform switches, which parts
 * of the popup are shown — was replaced by defaults, silently, on one change of a dropdown.
 */

jest.mock('../../../src/features/annotations/storage-adapter.js', () => ({
  getStorageAdapter: jest.fn(),
}));

import { getStorageAdapter } from '../../../src/features/annotations/storage-adapter.js';

// Loaded inside the test, once `chrome` exists: this module must not need a live browser merely to
// be imported, and asking for it early is how we would find out if that changed.
let migrateAnnotations;

/** Everything a student who has used the extension for a term would have. */
function settingsOfARealStudent() {
  return {
    tts: { enabled: true, rate: 1.4, voice: 'Google UK English Female' },
    citation: { enabled: true, style: 'harvard', verifyOnline: true },
    maths: { enabled: true, readAloud: true },
    canvasIntegration: { enabled: true },
    moodleIntegration: { enabled: false },
    googleClassroomIntegration: { enabled: true },
    ui_visibility: { reading: true, writing: false },
    annotations: { storageMode: 'local', defaultColor: 'yellow' },
  };
}

/** A storage stub that behaves like the promise form the extension uses. */
function storageHolding(initial) {
  const store = { ...initial };
  return {
    store,
    // Both calling styles, because the extension uses both: a promise here and a callback there.
    api: {
      get: jest.fn((keys, callback) => {
        const wanted = keys === null || keys === undefined ? Object.keys(store) : [].concat(keys);
        const out = {};
        wanted.forEach(key => {
          if (key in store) {
            out[key] = store[key];
          }
        });
        if (typeof callback === 'function') {
          callback(out);
          return undefined;
        }
        return Promise.resolve(out);
      }),
      set: jest.fn((items, callback) => {
        Object.assign(store, items);
        if (typeof callback === 'function') {
          callback();
          return undefined;
        }
        return Promise.resolve();
      }),
      remove: jest.fn((keys, callback) => {
        [].concat(keys).forEach(key => delete store[key]);
        if (typeof callback === 'function') {
          callback();
          return undefined;
        }
        return Promise.resolve();
      }),
    },
  };
}

describe('changing where annotations are kept', () => {
  let storage;

  beforeEach(async () => {
    storage = storageHolding({ assist_settings: settingsOfARealStudent() });
    global.chrome = {
      storage: {
        local: storage.api,
        sync: storageHolding({}).api,
        onChanged: { addListener: () => {}, removeListener: () => {} },
      },
      runtime: { lastError: undefined },
    };
    ({ migrateAnnotations } = await import(
      '../../../src/features/annotations/migration-manager.js'
    ));
    getStorageAdapter.mockImplementation(() => ({
      export: jest.fn(async () => []),
      import: jest.fn(async () => {}),
      clear: jest.fn(async () => {}),
      count: jest.fn(async () => 0),
    }));
  });

  it('keeps every other setting the student has made, when there is nothing to move', async () => {
    const before = settingsOfARealStudent();

    const result = await migrateAnnotations('local', 'indexeddb');

    expect(result.success).toBe(true);
    const after = storage.store.assist_settings;
    expect(after.annotations.storageMode).toBe('indexeddb');
    expect(after.tts).toEqual(before.tts);
    expect(after.citation).toEqual(before.citation);
    expect(after.maths).toEqual(before.maths);
    expect(after.canvasIntegration).toEqual(before.canvasIntegration);
    expect(after.moodleIntegration).toEqual(before.moodleIntegration);
    expect(after.googleClassroomIntegration).toEqual(before.googleClassroomIntegration);
    expect(after.ui_visibility).toEqual(before.ui_visibility);
    expect(after.annotations.defaultColor).toBe('yellow');
  });

  it('keeps every other setting when annotations are actually moved', async () => {
    getStorageAdapter.mockImplementation(() => ({
      export: jest.fn(async () => [{ id: 'a1', text: 'one' }]),
      import: jest.fn(async () => {}),
      clear: jest.fn(async () => {}),
      count: jest.fn(async () => 1),
    }));
    const before = settingsOfARealStudent();

    const result = await migrateAnnotations('local', 'indexeddb');

    expect(result.success).toBe(true);
    const after = storage.store.assist_settings;
    expect(after.annotations.storageMode).toBe('indexeddb');
    expect(after.citation).toEqual(before.citation);
    expect(after.ui_visibility).toEqual(before.ui_visibility);
  });

  it('adds the branch rather than dropping the rest, when a setting has never been saved', async () => {
    storage.store.assist_settings = { tts: { enabled: true, rate: 1.4 } };

    await migrateAnnotations('local', 'indexeddb');

    const after = storage.store.assist_settings;
    expect(after.annotations.storageMode).toBe('indexeddb');
    expect(after.tts).toEqual({ enabled: true, rate: 1.4 });
  });
});
