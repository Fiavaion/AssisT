/**
 * Secure key storage — the legacy-key sweep and the deletion of withdrawn translator keys.
 *
 * Node's Web Crypto drives the real AES-GCM encrypt/decrypt path (jsdom has no SubtleCrypto), and a
 * stateful chrome.storage.local stub lets migrateLegacyKeys read and rewrite storage like the real
 * API. DeepL and Azure Translator were withdrawn (ADR 0006), so their keys are deleted, never migrated;
 * A live provider's key must survive that deletion.
 */
import { webcrypto } from 'crypto';
import * as secureKeyStorage from '../../../src/core/storage/secure-key-storage.js';
import {
  saveSecureAPIKey,
  getSecureAPIKey,
  migrateLegacyKeys,
} from '../../../src/core/storage/secure-key-storage.js';

let store;

function statefulStorage() {
  return {
    get: jest.fn(async keys => {
      if (keys === null || keys === undefined) {
        return { ...store };
      }
      if (typeof keys === 'string') {
        return keys in store ? { [keys]: store[keys] } : {};
      }
      if (Array.isArray(keys)) {
        const out = {};
        for (const k of keys) {
          if (k in store) {
            out[k] = store[k];
          }
        }
        return out;
      }
      const out = {};
      for (const [k, fallback] of Object.entries(keys)) {
        out[k] = k in store ? store[k] : fallback;
      }
      return out;
    }),
    set: jest.fn(async obj => {
      Object.assign(store, obj);
    }),
    remove: jest.fn(async keys => {
      for (const k of [].concat(keys)) {
        delete store[k];
      }
    }),
    clear: jest.fn(async () => {
      store = {};
    }),
  };
}

beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
});

beforeEach(() => {
  store = {};
  global.chrome.storage.local = statefulStorage();
});

const ANTHROPIC_KEY = 'sk-ant-roundtrip-00000000000000000000000000000000';
const DEEPL_KEY = 'deepl-legacy-key-aaaaaaaa-bbbb-cccc-dddd-eeeeeeee:fx';
const AZURE_TRANSLATOR_KEY = 'azuretranslatorlegacykey00000000';
const GOOGLE_KEY = 'AIzaSy-roundtrip-000000000000000000000';

describe('saveSecureAPIKey / getSecureAPIKey', () => {
  test('round-trips a key and never stores the plaintext', async () => {
    await saveSecureAPIKey('anthropic', ANTHROPIC_KEY);

    const record = store.secure_apikey_anthropic;
    expect(record?.encrypted).toBeDefined();
    expect(JSON.stringify(store)).not.toContain(ANTHROPIC_KEY);

    await expect(getSecureAPIKey('anthropic')).resolves.toBe(ANTHROPIC_KEY);
  });
});

/**
 * An install that used the withdrawn DeepL / Azure Translator fields, in every shape a past build
 * could have left behind: encrypted under both provider slugs, the plaintext `translationApiKeys`
 * object, the older `deepl_api_key` / `apiKey_deepl_encrypted` shapes, and the provider choice.
 */
async function seedWithdrawnTranslatorState() {
  await saveSecureAPIKey('deepl', DEEPL_KEY);
  await saveSecureAPIKey('azure-translator', AZURE_TRANSLATOR_KEY);
  store.translationApiKeys = {
    deepl: DEEPL_KEY,
    azure: AZURE_TRANSLATOR_KEY,
    azureRegion: 'westeurope',
  };
  store.deepl_api_key = DEEPL_KEY;
  store.apiKey_deepl_encrypted = 'U2FsdGVkX1-legacy-cryptojs';
  store.translationSettings = { provider: 'deepl', cacheEnabled: true, cacheDuration: 7 };
}

describe('migrateLegacyKeys — withdrawn translator credentials are deleted', () => {
  test('removes every stored DeepL and Azure Translator key and the region', async () => {
    await seedWithdrawnTranslatorState();

    await migrateLegacyKeys();

    for (const key of [
      'secure_apikey_deepl',
      'secure_apikey_azure-translator',
      'translationApiKeys',
      'deepl_api_key',
      'apiKey_deepl_encrypted',
    ]) {
      expect(store[key]).toBeUndefined();
    }
    await expect(getSecureAPIKey('deepl')).resolves.toBeNull();
    await expect(getSecureAPIKey('azure-translator')).resolves.toBeNull();
    expect(JSON.stringify(store)).not.toContain('westeurope');
  });

  test('drops the provider choice but keeps the MyMemory translation settings', async () => {
    await seedWithdrawnTranslatorState();

    await migrateLegacyKeys();

    expect(store.translationSettings).toEqual({ cacheEnabled: true, cacheDuration: 7 });
  });

  test('never re-encrypts a withdrawn key on its way out', async () => {
    store.translationApiKeys = { deepl: DEEPL_KEY, azure: AZURE_TRANSLATOR_KEY };

    const stats = await migrateLegacyKeys();

    expect(stats.migrated).toBe(0);
    expect(Object.keys(store).filter(k => k.startsWith('secure_apikey_'))).toEqual([]);
  });

  test('does NOT touch the key of a provider still in use', async () => {
    await saveSecureAPIKey('google', GOOGLE_KEY);
    await seedWithdrawnTranslatorState();

    await migrateLegacyKeys();

    await expect(getSecureAPIKey('google')).resolves.toBe(GOOGLE_KEY);
  });

  test('running it twice is harmless', async () => {
    await saveSecureAPIKey('google', GOOGLE_KEY);
    await seedWithdrawnTranslatorState();

    await migrateLegacyKeys();
    const afterFirst = JSON.parse(JSON.stringify(store));
    const second = await migrateLegacyKeys();

    expect(second).toEqual({ migrated: 0, errors: 0 });
    expect(store).toEqual(afterFirst);
    await expect(getSecureAPIKey('google')).resolves.toBe(GOOGLE_KEY);
  });

  test('leaves an install that never used them untouched', async () => {
    store.translationSettings = { cacheEnabled: false };

    await migrateLegacyKeys();

    expect(store).toEqual({ translationSettings: { cacheEnabled: false } });
  });

  test('never carries a plain-text Azure Speech key into encrypted storage', async () => {
    // The Azure Speech engine is withdrawn; its keys are deleted by utils/settings-migrations.js.
    store.azure_api_key = 'azurespeechservicekey00000000000';

    const stats = await migrateLegacyKeys();

    expect(stats.migrated).toBe(0);
    expect(store).not.toHaveProperty('secure_apikey_azure');
  });

  test('still migrates the legacy <provider>_api_key shape (regression)', async () => {
    const legacy = 'sk-ant-legacy-000000000000000000000000000000';
    store.anthropic_api_key = legacy;

    const stats = await migrateLegacyKeys();

    expect(stats.migrated).toBe(1);
    expect(store.anthropic_api_key).toBeUndefined();
    await expect(getSecureAPIKey('anthropic')).resolves.toBe(legacy);
  });

  test('never overwrites a live encrypted key with an older plain-text one', async () => {
    await saveSecureAPIKey('openai', 'sk-openai-current-000000000000000000000');
    const live = store.secure_apikey_openai;
    store.openai_api_key = 'sk-openai-old-plaintext-0000000000000000';

    const stats = await migrateLegacyKeys();

    expect(store.secure_apikey_openai).toBe(live);
    await expect(getSecureAPIKey('openai')).resolves.toBe('sk-openai-current-000000000000000000000');
    expect(stats.migrated).toBe(0);
    // The plain copy is superseded by the live key, so nothing is lost by deleting it.
    expect(store.openai_api_key).toBeUndefined();
  });

  test('keeps the plain-text copy when the encrypted save fails, so the key is not lost', async () => {
    const legacy = 'sk-ant-legacy-111111111111111111111111111111';
    store.anthropic_api_key = legacy;
    const realSubtle = globalThis.crypto.subtle;
    Object.defineProperty(globalThis, 'crypto', {
      value: { ...webcrypto, subtle: undefined, getRandomValues: v => webcrypto.getRandomValues(v) },
      configurable: true,
    });
    try {
      const stats = await migrateLegacyKeys();
      expect(stats.errors).toBe(1);
      expect(stats.migrated).toBe(0);
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
    }
    expect(realSubtle).toBeDefined();
    expect(store.anthropic_api_key).toBe(legacy);
    expect(store.secure_apikey_anthropic).toBeUndefined();
  });
});

/**
 * Earlier builds carried a user-password layer and a key-rotation layer that no screen could reach.
 * Either may have left storage behind on an install; the sweep removes it once, and the API keys
 * encrypted alongside it must come through unchanged and still readable.
 */
const STALE_SECURITY_STATE = {
  assist_key_rotation_settings: { enabled: true, intervalDays: 90, lastRotation: 1 },
  assist_temp_password: 'stale-session-password',
  assist_temp_password_ts: 1,
  assist_password_hash: 'a'.repeat(64),
  assist_password_salt: 'b'.repeat(32),
};

describe('migrateLegacyKeys — leftovers of the removed password and rotation layers', () => {
  test('removes the rotation settings, the session password and the password hash', async () => {
    Object.assign(store, STALE_SECURITY_STATE);

    await migrateLegacyKeys();

    for (const key of Object.keys(STALE_SECURITY_STATE)) {
      expect(store).not.toHaveProperty(key);
    }
  });

  test('stored API keys are untouched and still readable afterwards', async () => {
    await saveSecureAPIKey('anthropic', ANTHROPIC_KEY);
    await saveSecureAPIKey('google', GOOGLE_KEY);
    const before = JSON.parse(
      JSON.stringify({ a: store.secure_apikey_anthropic, z: store.secure_apikey_google })
    );
    Object.assign(store, STALE_SECURITY_STATE);

    await migrateLegacyKeys();

    expect({ a: store.secure_apikey_anthropic, z: store.secure_apikey_google }).toEqual(before);
    await expect(getSecureAPIKey('anthropic')).resolves.toBe(ANTHROPIC_KEY);
    await expect(getSecureAPIKey('google')).resolves.toBe(GOOGLE_KEY);
  });

  test('a leftover session password never changes the key used to decrypt', async () => {
    await saveSecureAPIKey('anthropic', ANTHROPIC_KEY);
    store.assist_temp_password = 'stale-session-password';
    store.assist_temp_password_ts = Date.now();

    await expect(getSecureAPIKey('anthropic')).resolves.toBe(ANTHROPIC_KEY);
  });

  test('the password and rotation API is gone', () => {
    for (const name of [
      'hasUserPassword',
      'setUserPassword',
      'unlockWithPassword',
      'lockEncryption',
      'removeUserPassword',
      'getRotationSettings',
      'setRotationSettings',
      'checkRotationNeeded',
      'rotateKeys',
      'autoRotateIfNeeded',
    ]) {
      expect(secureKeyStorage).not.toHaveProperty(name);
      expect(secureKeyStorage.default).not.toHaveProperty(name);
    }
  });
});
