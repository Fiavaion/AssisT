/**
 * Settings portability — export/import of a student's setup.
 *
 * The load-bearing test in this file is "no secret can reach the exported file". The export file
 * is a plain JSON file a student may email themselves or hand to IT; a leaked API key in it is the
 * worst outcome this feature can produce, so that test builds a storage snapshot containing every
 * secret the extension is capable of holding and asserts none of it survives.
 */

import {
  EXPORTED_KEYS,
  FILE_KIND,
  SCHEMA_VERSION,
  MIN_SUPPORTED_SCHEMA_VERSION,
  stripSecrets,
  buildExportPayload,
  suggestExportFilename,
  parseSettingsFile,
  planImport,
  exportSettings,
  importSettingsFromText,
  importSettingsFromFile,
} from '../../../src/utils/settings-portability.js';
import { StorageManager } from '../../../src/utils/storage-manager.js';
import { DEFAULT_SHORTCUTS } from '../../../src/utils/keyboard-shortcuts.js';

/** Every storage key that holds a secret, or material used to derive one. */
const SENSITIVE_KEYS = [
  'secure_apikey_claude',
  'secure_apikey_anthropic',
  'secure_apikey_azure',
  'secure_apikey_azure-translator',
  'secure_apikey_deepl',
  'secure_apikey_google',
  'institutionKey',
  'translationApiKeys',
  'assist_machine_id',
  'assist_static_entropy',
  'assist_password_hash',
  'assist_password_salt',
  'assist_temp_password',
  'assist_temp_password_ts',
  'assist_key_rotation_settings',
];

/** A storage snapshot holding real settings AND every flavour of secret. */
function storageWithSecrets() {
  return {
    assist_settings: {
      tts: { enabled: true, rate: 1.2 },
      keyboardShortcuts: { ...DEFAULT_SHORTCUTS },
      // Key-shaped fields that should never have been written here, but might be.
      deeplKey: 'SEKRIT-deepl-0000',
      nested: { apiKey: 'SEKRIT-nested-1111', label: 'keep me' },
    },
    aiMode: 'cloud',
    popupTheme: 'dark',
    citationStyle: 'apa7',
    ollamaBaseUrl: 'http://localhost:11434',
    assist_profiles: {
      Mine: { settings: { tts: { enabled: true } }, apiKey: 'SEKRIT-profile-2222' },
    },

    secure_apikey_claude: { encrypted: 'SEKRIT-envelope-3333', createdAt: 1, version: 2 },
    secure_apikey_anthropic: { encrypted: 'SEKRIT-envelope-4444', createdAt: 1, version: 2 },
    secure_apikey_azure: { encrypted: 'SEKRIT-envelope-5555', createdAt: 1, version: 2 },
    'secure_apikey_azure-translator': { encrypted: 'SEKRIT-envelope-6666', version: 2 },
    secure_apikey_deepl: { encrypted: 'SEKRIT-envelope-7777', version: 2 },
    secure_apikey_google: { encrypted: 'SEKRIT-envelope-8888', version: 2 },
    institutionKey: 'eyJhbGciOiJFZDI1NTE5In0.SEKRIT-institution-9999',
    translationApiKeys: { deepl: 'SEKRIT-plaintext-aaaa', azure: 'SEKRIT-plaintext-bbbb' },
    azureRegion: 'northeurope',
    translationSettings: { provider: 'deepl', cacheEnabled: true },
    assist_machine_id: 'SEKRIT-machineid-cccc',
    assist_static_entropy: 'SEKRIT-entropy-dddd',
    assist_password_hash: 'SEKRIT-pwhash-eeee',
    assist_password_salt: 'SEKRIT-pwsalt-ffff',
    assist_temp_password: 'SEKRIT-temppw-1010',
    assist_temp_password_ts: 1,
    assist_key_rotation_settings: { enabled: true, secret: 'SEKRIT-rotation-1212' },
    oauthToken: 'SEKRIT-oauth-1313',
    geminiApiKey: 'AIzaSEKRITgemini1414',
  };
}

function validFile(settings = { aiMode: 'off' }, over = {}) {
  return JSON.stringify({
    kind: FILE_KIND,
    schemaVersion: SCHEMA_VERSION,
    extensionVersion: '0.10.0',
    exportedAt: '2026-08-31T10:00:00.000Z',
    settings,
    ...over,
  });
}

describe('settings-portability — the allowlist', () => {
  test('names the settings a student expects to move with them', () => {
    for (const key of [
      'assist_settings',
      'aiMode',
      'popupTheme',
      'citationStyle',
      'ollamaBaseUrl',
    ]) {
      expect(EXPORTED_KEYS).toContain(key);
    }
  });

  test('names no secret-bearing storage key', () => {
    for (const key of SENSITIVE_KEYS) {
      expect(EXPORTED_KEYS).not.toContain(key);
    }
    expect(EXPORTED_KEYS.filter(k => k.startsWith('secure_apikey_'))).toEqual([]);
  });

  test('is a frozen list with no duplicates', () => {
    expect(Object.isFrozen(EXPORTED_KEYS)).toBe(true);
    expect(new Set(EXPORTED_KEYS).size).toBe(EXPORTED_KEYS.length);
  });
});

describe('settings-portability — stripSecrets', () => {
  test('drops credential-shaped fields at any depth', () => {
    const cleaned = stripSecrets({
      keep: 1,
      apiKey: 'x',
      deeplKey: 'x',
      accessToken: 'x',
      password: 'x',
      clientSecret: 'x',
      privateKey: 'x',
      deep: { nested: { authToken: 'x', keep: 2 } },
    });
    expect(cleaned).toEqual({ keep: 1, deep: { nested: { keep: 2 } } });
  });

  test('drops an encrypted-key envelope wherever it appears', () => {
    const cleaned = stripSecrets({
      a: { encrypted: 'blob', createdAt: 1, version: 2 },
      b: [{ encrypted: 'blob' }, 'fine'],
    });
    expect(cleaned).toEqual({ b: ['fine'] });
  });

  test('drops strings that look like a live provider key', () => {
    const cleaned = stripSecrets({
      one: 'sk-ant-api03-abcdef',
      two: 'AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ012345',
      three: 'Bearer abcdefghijklmno',
      four: 'apa7',
    });
    expect(cleaned).toEqual({ four: 'apa7' });
  });

  test('leaves the shipped defaults completely untouched (no over-stripping)', () => {
    const settings = { ...StorageManager.DEFAULT_SETTINGS, keyboardShortcuts: DEFAULT_SHORTCUTS };
    expect(stripSecrets(settings)).toEqual(settings);
  });

  test('passes primitives and arrays through', () => {
    expect(stripSecrets('hello')).toBe('hello');
    expect(stripSecrets(null)).toBe(null);
    expect(stripSecrets([1, 'two', { apiKey: 'x', ok: true }])).toEqual([1, 'two', { ok: true }]);
  });
});

describe('settings-portability — buildExportPayload', () => {
  test('carries the file kind, schema version and a timestamp', () => {
    const payload = buildExportPayload({ aiMode: 'off' }, { extensionVersion: '9.9.9' });
    expect(payload.kind).toBe(FILE_KIND);
    expect(payload.schemaVersion).toBe(SCHEMA_VERSION);
    expect(payload.extensionVersion).toBe('9.9.9');
    expect(typeof payload.exportedAt).toBe('string');
  });

  test('exports only allowlisted keys that are actually present', () => {
    const payload = buildExportPayload({ aiMode: 'off', notAThing: true });
    expect(payload.settings).toEqual({ aiMode: 'off' });
  });

  // THE SECURITY TEST.
  test('no secret can reach the exported file', () => {
    const json = JSON.stringify(buildExportPayload(storageWithSecrets()));

    // Not one secret value survives, by whatever route it was stored.
    expect(json).not.toMatch(/SEKRIT/);
    expect(json).not.toMatch(/AIza/);

    // Nor any of the storage keys that hold them.
    for (const key of SENSITIVE_KEYS) {
      expect(json).not.toContain(key);
    }

    // Nor any credential-shaped field name.
    expect(json).not.toMatch(/apikey|accesstoken|authtoken|password|secret|privatekey|oauth/i);

    // And the real settings did survive, so this is not passing by exporting nothing.
    const payload = JSON.parse(json);
    expect(payload.settings.aiMode).toBe('cloud');
    expect(payload.settings.assist_settings.tts.rate).toBe(1.2);
    expect(payload.settings.assist_settings.nested.label).toBe('keep me');
    expect(payload.settings.translationSettings).toEqual({ cacheEnabled: true });
  });
});

describe('settings-portability — suggestExportFilename', () => {
  test('is dated and ends in .json', () => {
    expect(suggestExportFilename(new Date('2026-08-31T10:00:00Z'))).toBe(
      'assist-settings-2026-08-31.json'
    );
  });
});

describe('settings-portability — parseSettingsFile', () => {
  test('accepts a well-formed current file', () => {
    const result = parseSettingsFile(validFile({ aiMode: 'off' }));
    expect(result.ok).toBe(true);
    expect(result.payload.settings).toEqual({ aiMode: 'off' });
  });

  test('accepts a file from an older but still supported schema', () => {
    expect(MIN_SUPPORTED_SCHEMA_VERSION).toBeLessThanOrEqual(SCHEMA_VERSION);
    const result = parseSettingsFile(
      validFile({ aiMode: 'off' }, { schemaVersion: MIN_SUPPORTED_SCHEMA_VERSION })
    );
    expect(result.ok).toBe(true);
  });

  test.each([
    ['not JSON at all', 'this is not json', 'not-json'],
    ['truncated JSON', '{"kind":"assist-settings-backup","sett', 'not-json'],
    ['a JSON array', '[1,2,3]', 'not-an-assist-file'],
    ['some other JSON file', '{"hello":"world"}', 'not-an-assist-file'],
    ['an empty string', '', 'not-json'],
  ])('refuses %s', (_label, text, code) => {
    const result = parseSettingsFile(text);
    expect(result.ok).toBe(false);
    expect(result.code).toBe(code);
    expect(typeof result.message).toBe('string');
    expect(result.message.length).toBeGreaterThan(0);
  });

  test('refuses a file from a newer build rather than half-applying it', () => {
    const result = parseSettingsFile(validFile({ aiMode: 'off' }, { schemaVersion: 999 }));
    expect(result.ok).toBe(false);
    expect(result.code).toBe('file-too-new');
    expect(result.message).toMatch(/newer/i);
  });

  test('refuses a file whose schema version is unreadable', () => {
    for (const schemaVersion of [undefined, null, 'one', 1.5, -1, 0]) {
      const result = parseSettingsFile(validFile({ aiMode: 'off' }, { schemaVersion }));
      expect(result.ok).toBe(false);
      expect(['unreadable-version', 'file-too-old']).toContain(result.code);
    }
  });

  test('refuses a file with no settings object', () => {
    expect(parseSettingsFile(validFile(null)).code).toBe('no-settings');
    expect(parseSettingsFile(validFile('nope')).code).toBe('no-settings');
    expect(parseSettingsFile(validFile([])).code).toBe('no-settings');
  });

  test('refuses a file holding nothing this build recognises', () => {
    const result = parseSettingsFile(validFile({ somethingElse: 1 }));
    expect(result.ok).toBe(false);
    expect(result.code).toBe('nothing-to-restore');
  });
});

describe('settings-portability — planImport', () => {
  test('ignores keys outside the allowlist instead of writing them blindly', () => {
    const plan = planImport({ settings: { aiMode: 'off', futureKey: 'x' } }, {});
    expect(plan.values).toEqual({ aiMode: 'off' });
    expect(plan.ignored).toContain('futureKey');
  });

  test('ignores secret-shaped fields inside an allowlisted value', () => {
    const plan = planImport(
      { settings: { assist_settings: { tts: { enabled: true }, apiKey: 'sk-ant-nope' } } },
      {}
    );
    expect(plan.values.assist_settings).toEqual({ tts: { enabled: true } });
  });

  test('deep-merges over current settings so unmentioned keys survive', () => {
    const plan = planImport(
      { settings: { assist_settings: { tts: { rate: 2 } } } },
      { assist_settings: { tts: { rate: 1, enabled: true }, ocr: { enabled: true } } }
    );
    expect(plan.values.assist_settings).toEqual({
      tts: { rate: 2, enabled: true },
      ocr: { enabled: true },
    });
  });

  test('an explicit false in the file wins over a true already stored', () => {
    const plan = planImport(
      { settings: { assist_settings: { citation: { enabled: false } } } },
      { assist_settings: { citation: { enabled: true } } }
    );
    expect(plan.values.assist_settings.citation.enabled).toBe(false);
  });

  test('replaces arrays wholesale rather than merging them element-wise', () => {
    const plan = planImport(
      { settings: { translationRecentLanguages: ['fr'] } },
      { translationRecentLanguages: ['de', 'es', 'it'] }
    );
    expect(plan.values.translationRecentLanguages).toEqual(['fr']);
  });

  test('records the previous values so the write can be undone', () => {
    const plan = planImport({ settings: { aiMode: 'off' } }, { aiMode: 'cloud' });
    expect(plan.previous).toEqual({ aiMode: 'cloud' });
  });
});

describe('settings-portability — exportSettings', () => {
  test('reads storage once and returns the file text plus a filename', async () => {
    chrome.storage.local.get.mockResolvedValue(storageWithSecrets());
    chrome.runtime.getManifest = jest.fn(() => ({ version: '0.10.0' }));

    const result = await exportSettings();

    expect(chrome.storage.local.get).toHaveBeenCalledTimes(1);
    expect(result.json).not.toMatch(/SEKRIT/);
    expect(result.filename).toMatch(/^assist-settings-\d{4}-\d{2}-\d{2}\.json$/);
    expect(JSON.parse(result.json).extensionVersion).toBe('0.10.0');
  });

  test('asks storage only for allowlisted keys, never for the whole store', async () => {
    chrome.storage.local.get.mockResolvedValue({});
    await exportSettings();
    expect(chrome.storage.local.get).toHaveBeenCalledWith(EXPORTED_KEYS);
  });
});

describe('settings-portability — importSettingsFromText', () => {
  test('applies the file in a single atomic write', async () => {
    chrome.storage.local.get.mockResolvedValue({ aiMode: 'cloud' });
    const result = await importSettingsFromText(validFile({ aiMode: 'off', popupTheme: 'light' }));

    expect(result.ok).toBe(true);
    expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ aiMode: 'off', popupTheme: 'light' });
    expect(result.applied.sort()).toEqual(['aiMode', 'popupTheme']);
  });

  test('writes nothing at all when the file is rejected', async () => {
    for (const bad of ['garbage', validFile({ aiMode: 'off' }, { schemaVersion: 999 }), '{}']) {
      const result = await importSettingsFromText(bad);
      expect(result.ok).toBe(false);
      expect(typeof result.message).toBe('string');
    }
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  test('never resurrects a secret a hand-edited file tries to smuggle in', async () => {
    chrome.storage.local.get.mockResolvedValue({});
    const smuggled = validFile({
      aiMode: 'cloud',
      secure_apikey_claude: { encrypted: 'SEKRIT' },
      institutionKey: 'SEKRIT',
      translationApiKeys: { deepl: 'SEKRIT' },
      assist_settings: { apiKey: 'sk-ant-SEKRIT', tts: { enabled: true } },
    });

    const result = await importSettingsFromText(smuggled);

    expect(result.ok).toBe(true);
    const written = chrome.storage.local.set.mock.calls[0][0];
    expect(JSON.stringify(written)).not.toMatch(/SEKRIT/);
    expect(written.assist_settings).toEqual({ tts: { enabled: true } });
  });

  test('hands back an undo that puts the previous values back', async () => {
    chrome.storage.local.get.mockResolvedValue({ aiMode: 'cloud', popupTheme: 'dark' });
    const result = await importSettingsFromText(validFile({ aiMode: 'off' }));

    expect(typeof result.undo).toBe('function');
    await result.undo();

    expect(chrome.storage.local.set).toHaveBeenLastCalledWith({ aiMode: 'cloud' });
  });

  test('undoing a key that was previously absent removes it again', async () => {
    chrome.storage.local.get.mockResolvedValue({});
    const result = await importSettingsFromText(validFile({ aiMode: 'off' }));
    await result.undo();

    expect(chrome.storage.local.remove).toHaveBeenCalledWith(['aiMode']);
  });

  test('reports a storage failure instead of throwing', async () => {
    chrome.storage.local.get.mockResolvedValue({});
    chrome.storage.local.set.mockRejectedValue(new Error('quota exceeded'));

    const result = await importSettingsFromText(validFile({ aiMode: 'off' }));
    expect(result.ok).toBe(false);
    expect(result.code).toBe('write-failed');
  });
});

describe('settings-portability — importSettingsFromFile', () => {
  test('reads a File and applies it', async () => {
    chrome.storage.local.get.mockResolvedValue({});
    const file = { text: () => Promise.resolve(validFile({ aiMode: 'off' })) };

    const result = await importSettingsFromFile(file);
    expect(result.ok).toBe(true);
    expect(result.applied).toEqual(['aiMode']);
  });

  test('refuses a missing or unreadable file without throwing', async () => {
    expect((await importSettingsFromFile(null)).code).toBe('no-file');
    const broken = {
      text: () => Promise.reject(new Error('nope')),
    };
    expect((await importSettingsFromFile(broken)).code).toBe('unreadable-file');
  });
});

describe('settings-portability — the online voice an earlier popup chose for the student', () => {
  const V = 'Google UK English Female';
  const withVoice = version =>
    validFile(
      {
        assist_settings: { tts: { voice: V, rate: 1.1 } },
        assist_profiles: {
          Mine: { settings: { tts: { voice: V } } },
          Chosen: { settings: { tts: { voice: 'Google US English' } } },
        },
      },
      { extensionVersion: version }
    );

  test.each(['0.10.0', '0.9.3', 'unknown'])(
    'a file from before the fix (%s) brings that voice back as the automatic choice',
    async version => {
      chrome.storage.local.get.mockResolvedValue({});
      const result = await importSettingsFromText(withVoice(version));

      expect(result.ok).toBe(true);
      const written = chrome.storage.local.set.mock.calls[0][0];
      expect(written.assist_settings.tts).toEqual({ voice: 'default', rate: 1.1 });
      expect(written.assist_profiles.Mine.settings.tts.voice).toBe('default');
      expect(written.assist_profiles.Chosen.settings.tts.voice).toBe('Google US English');
    }
  );

  test('a file from this version keeps it: by then only the student could have chosen it', async () => {
    chrome.storage.local.get.mockResolvedValue({});
    await importSettingsFromText(withVoice('1.0.0'));

    const written = chrome.storage.local.set.mock.calls[0][0];
    expect(written.assist_settings.tts.voice).toBe(V);
    expect(written.assist_profiles.Mine.settings.tts.voice).toBe(V);
  });
});

describe('settings-portability — withdrawn translation providers (ADR 0006)', () => {
  test('the allowlist no longer carries the Azure Translator region', () => {
    expect(EXPORTED_KEYS).not.toContain('azureRegion');
  });

  test('an export carries no DeepL or Azure Translator setting', () => {
    const json = JSON.stringify(buildExportPayload(storageWithSecrets()));

    expect(json).not.toMatch(/deepl|azure|northeurope|translationApiKeys|provider/i);
    expect(JSON.parse(json).settings.translationSettings).toEqual({ cacheEnabled: true });
  });

  test('an import from an older file ignores them', async () => {
    chrome.storage.local.get.mockResolvedValue({});
    const older = validFile({
      aiMode: 'off',
      azureRegion: 'westeurope',
      translationApiKeys: { deepl: 'SEKRIT', azure: 'SEKRIT', azureRegion: 'westeurope' },
      'secure_apikey_azure-translator': { encrypted: 'SEKRIT' },
      secure_apikey_deepl: { encrypted: 'SEKRIT' },
      translationSettings: { provider: 'azure', cacheEnabled: false },
    });

    const result = await importSettingsFromText(older);

    expect(result.ok).toBe(true);
    const written = chrome.storage.local.set.mock.calls[0][0];
    expect(JSON.stringify(written)).not.toMatch(/deepl|azure|westeurope|SEKRIT|provider/i);
    expect(written.translationSettings).toEqual({ cacheEnabled: false });
  });
});

describe('settings-portability — the withdrawn "Try the new AssisT" switch', () => {
  test('an import from an older file does not bring it back', async () => {
    chrome.storage.local.get.mockResolvedValue({});
    const older = validFile({
      assist_settings: { tts: { rate: 1.2 }, newExperience: { enabled: false } },
    });

    const result = await importSettingsFromText(older);

    expect(result.ok).toBe(true);
    const written = chrome.storage.local.set.mock.calls[0][0];
    expect(written.assist_settings).toEqual({ tts: { rate: 1.2 } });
  });

  test('an export does not carry it', () => {
    const payload = buildExportPayload({
      assist_settings: { tts: { rate: 1 }, newExperience: { enabled: true } },
    });

    expect(payload.settings.assist_settings).toEqual({ tts: { rate: 1 } });
  });
});

describe('settings-portability — the classic popup layout controls', () => {
  // Organize mode, the hide-unused filter and the Layout mode option arranged the accordion, which
  // no student sees now. An update migration deletes what they stored; files must not carry it.
  test('an export does not carry what they stored', () => {
    const payload = buildExportPayload({
      assist_settings: { tts: { rate: 1 }, ui_layout: { sectionOrder: ['school'] } },
      layout_mode: 'user-need',
      popup_hide_unused: true,
    });

    expect(payload.settings.assist_settings).toEqual({ tts: { rate: 1 } });
    expect('layout_mode' in payload.settings).toBe(false);
    expect('popup_hide_unused' in payload.settings).toBe(false);
  });

  test('an import from an older file does not bring it back', async () => {
    chrome.storage.local.get.mockResolvedValue({});
    const older = validFile({
      assist_settings: { tts: { rate: 1.2 }, ui_layout: { sectionOrder: ['school'] } },
      layout_mode: 'user-need',
      popup_hide_unused: true,
    });

    const result = await importSettingsFromText(older);

    expect(result.ok).toBe(true);
    const written = chrome.storage.local.set.mock.calls[0][0];
    expect(written.assist_settings).toEqual({ tts: { rate: 1.2 } });
    expect('layout_mode' in written).toBe(false);
    expect('popup_hide_unused' in written).toBe(false);
  });
});
