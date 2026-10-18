/**
 * A fresh install has nothing to migrate, so every run-once settings migration must count as done
 * from the moment of install.
 *
 * The migrations in utils/settings-migrations.js exist to correct values an earlier version stored.
 * They run on update and record a marker so they never run twice. If the marker is written only on
 * update, a student who installs this version fresh and then chooses the setting a migration resets
 * (OCR auto-play switched on) has that choice silently undone by the first update that follows.
 *
 * This suite runs the worker's real onInstalled listener against a disk-backed fake of
 * chrome.storage, install first and update second, the way a student meets them.
 */

/**
 * A stand-in for the `chrome` namespace: anything not overridden answers with a callable proxy, so
 * the worker can register its listeners without the test modelling APIs it does not exercise.
 */
function fakeChrome(overrides) {
  const listeners = new Map();

  const node = path => {
    const callable = function () {};
    return new Proxy(callable, {
      apply(_target, _thisArg, args) {
        const override = overrides[path];
        if (override) {
          return override(...args);
        }
        if (path.endsWith('.addListener')) {
          const event = path.slice(0, -'.addListener'.length);
          const found = listeners.get(event) || [];
          found.push(args[0]);
          listeners.set(event, found);
          return undefined;
        }
        return Promise.resolve(undefined);
      },
      get(_target, prop) {
        if (typeof prop !== 'string' || prop === 'then' || prop === 'inspect') {
          return undefined;
        }
        return node(path ? `${path}.${prop}` : prop);
      },
    });
  };

  return {
    api: node(''),
    listener(event) {
      const found = listeners.get(event) || [];
      if (found.length !== 1) {
        throw new Error(`expected one listener for ${event}, found ${found.length}`);
      }
      return found[0];
    },
  };
}

/** chrome.storage.local.get semantics over a plain object. */
function readFrom(disk, keys) {
  if (keys === null || keys === undefined) {
    return structuredClone(disk);
  }
  if (typeof keys === 'string') {
    keys = [keys];
  }
  if (Array.isArray(keys)) {
    return structuredClone(
      Object.fromEntries(keys.filter(key => key in disk).map(key => [key, disk[key]]))
    );
  }
  return structuredClone(
    Object.fromEntries(
      Object.entries(keys).map(([key, fallback]) => [key, key in disk ? disk[key] : fallback])
    )
  );
}

describe('a fresh install followed by an update', () => {
  let disk;
  let chromeFake;
  let realChrome;

  beforeEach(() => {
    realChrome = global.chrome;
    jest.resetModules();
    disk = {};
    const syncDisk = {};

    chromeFake = fakeChrome({
      'runtime.getManifest': () => ({ version: '1.0.0', content_scripts: [{ js: ['a.js'] }] }),
      'storage.local.get': keys => Promise.resolve(readFrom(disk, keys)),
      'storage.local.set': items =>
        Promise.resolve(void Object.assign(disk, structuredClone(items))),
      'storage.local.remove': keys =>
        Promise.resolve(void [].concat(keys).forEach(key => delete disk[key])),
      'storage.sync.get': keys => Promise.resolve(readFrom(syncDisk, keys)),
      'storage.sync.set': items =>
        Promise.resolve(void Object.assign(syncDisk, structuredClone(items))),
      'storage.session.get': () => Promise.resolve({}),
      'permissions.contains': () => Promise.resolve(false),
      'tabs.query': () => Promise.resolve([]),
    });

    global.chrome = chromeFake.api;
    require('../../../src/background/service-worker.js');
  });

  afterEach(() => {
    global.chrome = realChrome;
  });

  const install = () => chromeFake.listener('runtime.onInstalled')({ reason: 'install' });
  const update = () =>
    chromeFake.listener('runtime.onInstalled')({ reason: 'update', previousVersion: '1.0.0' });

  it('keeps OCR auto-play on when the student switched it on after installing', async () => {
    await install();
    disk.assist_settings = {
      ...(disk.assist_settings || {}),
      ocr: { enabled: true, autoTTS: true },
    };

    await update();

    expect(disk.assist_settings.ocr.autoTTS).toBe(true);
  });

  it('records every run-once migration as done at install', async () => {
    await install();

    expect(disk).toMatchObject({
      migration_ocrAutoPlayDefaultOff: true,
      migration_textCustomizationSyncWithdrawn: true,
      migration_azureSpeechWithdrawn: true,
      migration_translationKeyFieldWithdrawn: true,
      migration_unchosenOnlineVoiceReset: true,
      migration_newExperienceSwitchWithdrawn: true,
    });
  });

  it('keeps the online voice a student chose after installing', async () => {
    await install();
    disk.assist_settings = {
      ...(disk.assist_settings || {}),
      tts: { voice: 'Google UK English Female' },
    };

    await update();

    expect(disk.assist_settings.tts.voice).toBe('Google UK English Female');
  });

  it('resets the voice an earlier popup saved, once, across two updates', async () => {
    disk.assist_settings = { tts: { voice: 'Google UK English Female', rate: 1.1 } };

    await update();
    expect(disk.assist_settings.tts).toEqual({ voice: 'default', rate: 1.1 });

    disk.assist_settings.tts.voice = 'Google UK English Female';
    await update();
    expect(disk.assist_settings.tts.voice).toBe('Google UK English Female');
  });

  it('deletes a Google Translate key an earlier popup stored in the settings', async () => {
    disk.assist_settings = {
      translationSettings: { googleApiKey: 'AIza-stored-in-plain-text', defaultTargetLanguage: 'es' },
    };

    await update();

    expect(disk.assist_settings.translationSettings).toEqual({ defaultTargetLanguage: 'es' });
  });

  it('deletes the stored "Try the new AssisT" switch on update', async () => {
    disk.assist_settings = { tts: { rate: 1.1 }, newExperience: { enabled: true } };

    await update();

    expect(disk.assist_settings).toEqual({ tts: { rate: 1.1 } });
  });

  it('still migrates an install that came from an earlier version', async () => {
    disk.assist_settings = { ocr: { autoTTS: true } };

    await update();

    expect(disk.assist_settings.ocr.autoTTS).toBe(false);
  });
});
