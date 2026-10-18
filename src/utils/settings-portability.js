/**
 * Settings portability — moving a student's setup between installs.
 *
 * Two jobs: write the way this extension is configured out to a plain JSON file, and read such a
 * file back. It serves a student getting a new laptop, a student reinstalling after a wipe, and
 * anyone who simply wants a backup before experimenting.
 *
 * WHAT LEAVES THE MACHINE — the security boundary
 * ----------------------------------------------
 * The file is ordinary JSON. A student will email it to themselves, drop it in OneDrive, or hand
 * it to an IT technician. It must therefore never contain a credential, and the way that is
 * guaranteed is an ALLOWLIST: `EXPORTED_KEYS` names every storage key that may be written out, and
 * nothing else is ever read. A denylist would leak the next key somebody adds.
 *
 * Deliberately never exported, and none of them appear in `EXPORTED_KEYS`:
 *   - `secure_apikey_*`      every encrypted API key
 *   - `institutionKey`       the signed institution branding token, pasted or from managed policy
 *   - `translationApiKeys`   plaintext keys for the withdrawn DeepL / Azure Translator providers
 *   - `assist_machine_id`, `assist_static_entropy`, `assist_password_hash`, `assist_password_salt`,
 *     `assist_temp_password*`, `assist_key_rotation_settings` — the material the encrypted keys are
 *     derived from, which is worth as much as the keys themselves
 *
 * `stripSecrets` is a second gate behind the allowlist, not the mechanism: it removes anything
 * credential-shaped that has found its way inside an allowlisted value. It also runs on IMPORT, so
 * a hand-edited or future-build file cannot write a key into storage.
 *
 * NOTE for anyone adding a setting: a field whose name ends in "key"/"token", or contains
 * "secret"/"password"/"credential", is dropped from exports. Name settings fields accordingly.
 *
 * SETTINGS, NOT CONTENT
 * ---------------------
 * Preferences only. Citations, annotations, sticky notes and study progress live in IndexedDB and
 * have their own export paths; caches, one-off install state (`onboardingComplete`,
 * `aiSetupDismissed`) and machine-local data (`webllmCachedModels`) are not settings and are left
 * behind on purpose.
 *
 * FOR THE ONBOARDING TRACK
 * ------------------------
 * `importSettingsFromFile(file)` and `importSettingsFromText(text)` are the whole API. Both resolve
 * to a result object and never throw; on success the result carries an `undo()`.
 *
 * @module utils/settings-portability
 */

import { importedWithoutUnchosenOnlineVoice } from './settings-migrations.js';

/** Marks a file as ours. Anything without it is refused before a single value is read. */
export const FILE_KIND = 'assist-settings-backup';

/** Bump when the *shape* of the file changes. The payload records the version it was written at. */
export const SCHEMA_VERSION = 1;

/**
 * The oldest schema this build can still read. Files between this and SCHEMA_VERSION are accepted
 * as-is: import merges, ignores keys it does not know, and leaves keys the file does not mention
 * alone, so an older file is simply a smaller file. When a future schema needs reshaping rather
 * than merging, add the migration at that point — there is no empty scaffolding here waiting for it.
 */
export const MIN_SUPPORTED_SCHEMA_VERSION = 1;

/**
 * THE ALLOWLIST. Every `chrome.storage.local` key that may be exported and imported.
 * Grouped by what the student would call it. Adding a key here is a decision about what leaves
 * their machine — check it holds no credential and no user content first.
 */
export const EXPORTED_KEYS = Object.freeze([
  // The master settings object: every feature toggle, ui_visibility, keyboard
  // shortcuts, and the TTS/STT/dyslexia/reading/OCR/maths/citation/LMS preference blocks.
  'assist_settings',

  // AI plane — which mode and which models, never the credentials that reach them.
  'aiMode',
  'llmEnabled',
  'cloudModeEnabled',
  'cloudProvider',
  'cloudModel',
  'geminiEnabled',
  'webllmEnabled',
  'webllmModel',
  'webllmTaskModels',
  'ollamaModel',
  'ollamaBaseUrl',
  'modelPreferences',

  // Per-feature AI preference blocks.
  'summarizationSettings',
  'textSimplificationSettings',
  'knowledgeGraphSettings',
  'assignmentBreakdownSettings',
  'citationAnalyzerSettings',
  // Deliberately absent: struggleDetectionSettings and cognitiveProfileSettings. Both record how a
  // student struggles, and both stay off until the student says otherwise. Consent is not the kind
  // of thing that should travel in a file somebody else wrote. The same goes for the
  // `assist_consent_<destination>` keys (utils/consent.js), the student's yes or no to each outside
  // service (ADR 0006).

  // Reading and writing surfaces.
  // 'readingModeSettings' was a top-level key nothing ever wrote: reading mode's appearance lives
  // in assist_settings.readingMode, which travels inside 'assist_settings' above.
  'dictionarySettings',
  'highlightMenuSettings',
  'textStatsAutoUpdate',
  'textStatsBadgeVisible',
  'textStatsReadingSpeed',
  'textStatsTargetWordCount',

  // Translation — language and cache choices. MyMemory is the only service, so there is no provider.
  'translationSettings',
  'translationRecentLanguages',
  'translation_lastSourceLang',
  'translation_lastTargetLang',

  // How citations and annotations behave — never what they hold.
  'citationStyle',
  'annotationStorageMode',

  // Popup presentation. The classic popup's 'layout_mode' and 'popup_hide_unused' are withdrawn
  // (settings-migrations.js, forgetClassicPopupLayout), so an older file's copies are not read.
  'popupTheme',
  'featureNotificationsEnabled',

  // Saved profiles and the setup profile that drives the presets.
  'assist_profiles',
  'assist_active_profile',
  'assist_stt_profile',
  'discoveryProfile',

  // Companion feature toggles.
  'companionFeatures',
]);

const ALLOWED = new Set(EXPORTED_KEYS);

/** Depth cap — storage holds JSON, so nothing legitimate goes this deep. */
const MAX_DEPTH = 12;

/**
 * Substrings that make a field name credential-shaped, tested against the name with punctuation
 * and case removed (so `api_key`, `apiKey` and `API-KEY` are all one case).
 */
const SECRET_NAME_FRAGMENTS = [
  'apikey',
  'secret',
  'password',
  'passwd',
  'credential',
  'privatekey',
  'accesskey',
  'accesstoken',
  'refreshtoken',
  'authtoken',
  'sessiontoken',
  'bearer',
  'oauth',
  'machineid',
  'entropy',
];

/** Endings that make a field name credential-shaped (`deeplKey`, `institutionKey`, `idToken`). */
const SECRET_NAME_SUFFIXES = ['key', 'keys', 'token', 'tokens'];

/** Prefixes of live provider credentials, so a raw key is caught by its value as well as its name. */
const SECRET_VALUE_PREFIXES = ['sk-', 'sk-ant-', 'AIza', 'Bearer ', 'ya29.'];

/**
 * Is this field name credential-shaped?
 * @param {string} name
 * @returns {boolean}
 */
export function isSecretShapedName(name) {
  if (typeof name !== 'string') {
    return false;
  }
  const flat = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!flat) {
    return false;
  }
  return (
    SECRET_NAME_FRAGMENTS.some(fragment => flat.includes(fragment)) ||
    SECRET_NAME_SUFFIXES.some(suffix => flat.endsWith(suffix))
  );
}

/**
 * Is this value credential-shaped? Catches a raw provider key and the envelope
 * `secure-key-storage` wraps an encrypted key in (`{ encrypted, createdAt, version }`).
 * @param {*} value
 * @returns {boolean}
 */
export function isSecretShapedValue(value) {
  if (typeof value === 'string') {
    return SECRET_VALUE_PREFIXES.some(prefix => value.startsWith(prefix));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return typeof value.encrypted === 'string';
  }
  return false;
}

/**
 * Return a deep copy with every credential-shaped field removed.
 *
 * The second gate behind the allowlist. Runs on the way out (so nothing key-shaped that was
 * mistakenly written into a settings object can reach the file) and on the way in (so a
 * hand-edited file cannot write one into storage).
 *
 * @param {*} value
 * @param {number} [depth=0]
 * @returns {*} a cleaned copy; primitives are returned unchanged
 */
export function stripSecrets(value, depth = 0) {
  if (depth > MAX_DEPTH || value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .filter(item => !isSecretShapedValue(item))
      .map(item => stripSecrets(item, depth + 1));
  }
  const cleaned = {};
  for (const [name, item] of Object.entries(value)) {
    if (isSecretShapedName(name) || isSecretShapedValue(item)) {
      continue;
    }
    cleaned[name] = stripSecrets(item, depth + 1);
  }
  return cleaned;
}

/**
 * Fields that a settings file may never carry, in or out, even though the key holding them is
 * allowlisted. Written as `<storage key>` → path inside it.
 *
 * `assist_settings.appearance.debug_mode` is the first: it is the switch that lets `debugLog()`
 * print the student's own words — their dictation, the page being read, an AI answer about their
 * essay. Every other setting here is a preference, and carrying a preference to a new machine is
 * the point of the file. This is not a preference; it is consent to have content logged, and an
 * import is exactly the path where a value arrives without anyone deciding to turn it on. Someone
 * sharing a "recommended settings" file would switch content logging on for everyone who loaded it.
 *
 * So it stays local: the student turns it on in Settings → Preferences on the browser in front of
 * them, and off when they are done. A second switch was considered and rejected — `debugLog()`
 * deliberately has one switch, and two would only mean two things to get wrong.
 *
 * `translationSettings.provider` is another: it chose between MyMemory, DeepL and Azure
 * Translator, and the last two were withdrawn (ADR 0006). An older file must not write it back.
 *
 * `assist_settings.newExperience` held the withdrawn "Try the new AssisT" switch, and
 * `assist_settings.ui_layout` the classic popup's section order. The new popup is the only popup
 * now, and update migrations delete both; an older file must not write them back either.
 */
const LOCAL_ONLY_FIELDS = Object.freeze({
  assist_settings: [['appearance', 'debug_mode'], ['newExperience'], ['ui_layout']],
  translationSettings: [['provider']],
});

/**
 * Remove that key's local-only fields from a copy of its value.
 *
 * @param {string} key - the storage key the value belongs to
 * @param {*} value - the value about to be written or exported
 * @returns {*} a copy without the local-only fields, or `value` when there are none to remove
 */
export function stripLocalOnly(key, value) {
  const paths = LOCAL_ONLY_FIELDS[key];
  if (!paths || !value || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }
  let result = value;
  for (const path of paths) {
    let parent = result;
    const parents = [];
    for (const step of path.slice(0, -1)) {
      if (!parent || typeof parent !== 'object' || !(step in parent)) {
        parent = null;
        break;
      }
      parents.push([parent, step]);
      parent = parent[step];
    }
    const leaf = path[path.length - 1];
    if (!parent || typeof parent !== 'object' || !(leaf in parent)) {
      continue;
    }
    // Copy only the branch being changed, so the caller's object is never mutated.
    const copiedLeafParent = { ...parent };
    delete copiedLeafParent[leaf];
    let rebuilt = copiedLeafParent;
    for (let i = parents.length - 1; i >= 0; i -= 1) {
      const [owner, step] = parents[i];
      rebuilt = { ...owner, [step]: rebuilt };
    }
    result = rebuilt;
  }
  return result;
}

/** The running extension's version, or 'unknown' outside an extension context. */
function currentExtensionVersion() {
  try {
    return chrome.runtime.getManifest().version || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Build the export payload from a raw storage snapshot. Pure — takes storage as data.
 * @param {Object} stored - a `chrome.storage.local` snapshot
 * @param {Object} [meta]
 * @param {string} [meta.extensionVersion]
 * @param {Date} [meta.now]
 * @returns {{kind: string, schemaVersion: number, extensionVersion: string, exportedAt: string, settings: Object}}
 */
export function buildExportPayload(stored, meta = {}) {
  const source = stored && typeof stored === 'object' ? stored : {};
  const settings = {};
  for (const key of EXPORTED_KEYS) {
    if (source[key] === undefined) {
      continue;
    }
    const value = stripLocalOnly(key, stripSecrets(source[key]));
    if (value !== undefined) {
      settings[key] = value;
    }
  }
  return {
    kind: FILE_KIND,
    schemaVersion: SCHEMA_VERSION,
    extensionVersion: meta.extensionVersion || currentExtensionVersion(),
    exportedAt: (meta.now instanceof Date ? meta.now : new Date()).toISOString(),
    settings,
  };
}

/**
 * A dated, human-recognisable filename.
 * @param {Date} [now]
 * @returns {string}
 */
export function suggestExportFilename(now = new Date()) {
  return `assist-settings-${now.toISOString().slice(0, 10)}.json`;
}

/** A rejection, shaped like every other result this module returns. */
function refuse(code, message) {
  return { ok: false, code, message };
}

/**
 * Validate a file's text and hand back its payload. Nothing is applied here — parsing and applying
 * are separate so a bad file is refused whole rather than half-written.
 *
 * @param {string} text - the raw file contents
 * @returns {{ok: true, payload: Object} | {ok: false, code: string, message: string}}
 */
export function parseSettingsFile(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return refuse('not-json', 'That file is empty.');
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return refuse(
      'not-json',
      'That file could not be read. It may be damaged or only partly downloaded.'
    );
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || parsed.kind !== FILE_KIND) {
    return refuse('not-an-assist-file', 'That is not an AssisT settings file.');
  }

  const version = parsed.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return refuse(
      'unreadable-version',
      "That settings file does not say which version it is, so it can't be used."
    );
  }
  if (version > SCHEMA_VERSION) {
    return refuse(
      'file-too-new',
      'That file was saved by a newer version of AssisT. Update the extension, then try again.'
    );
  }
  if (version < MIN_SUPPORTED_SCHEMA_VERSION) {
    return refuse(
      'file-too-old',
      'That file was saved by a version of AssisT that is too old to read. Set your options again in Advanced Options.'
    );
  }

  const settings = parsed.settings;
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return refuse('no-settings', 'That settings file has no settings in it.');
  }
  if (!Object.keys(settings).some(key => ALLOWED.has(key))) {
    return refuse(
      'nothing-to-restore',
      'There is nothing in that file this version of AssisT recognises.'
    );
  }

  return { ok: true, payload: parsed };
}

/** True for a plain object worth merging into (not an array, not null). */
function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Merge incoming over current. Objects merge key by key so a setting the file does not mention
 * keeps its current value; arrays and primitives replace outright.
 */
function mergeValue(current, incoming, depth = 0) {
  if (depth > MAX_DEPTH || !isPlainObject(current) || !isPlainObject(incoming)) {
    return incoming;
  }
  const merged = { ...current };
  for (const [name, value] of Object.entries(incoming)) {
    merged[name] = mergeValue(current[name], value, depth + 1);
  }
  return merged;
}

/**
 * Work out exactly what an import would write, without writing anything.
 *
 * @param {Object} payload - a payload from `parseSettingsFile`
 * @param {Object} current - the current values of the allowlisted keys
 * @returns {{values: Object, applied: string[], ignored: string[], previous: Object, removeOnUndo: string[]}}
 */
export function planImport(payload, current = {}) {
  const incoming = importedWithoutUnchosenOnlineVoice(
    (payload && payload.settings) || {},
    payload && payload.extensionVersion
  );
  const values = {};
  const ignored = [];
  const previous = {};
  const removeOnUndo = [];

  for (const [key, raw] of Object.entries(incoming)) {
    if (!ALLOWED.has(key)) {
      ignored.push(key);
      continue;
    }
    const cleaned = stripLocalOnly(key, stripSecrets(raw));
    values[key] = mergeValue(current[key], cleaned);
    if (current[key] === undefined) {
      removeOnUndo.push(key);
    } else {
      previous[key] = current[key];
    }
  }

  return { values, applied: Object.keys(values), ignored, previous, removeOnUndo };
}

/**
 * Read the current settings and produce the file to save.
 *
 * @returns {Promise<{json: string, filename: string, payload: Object, keyCount: number}>}
 */
export async function exportSettings() {
  const stored = await chrome.storage.local.get(EXPORTED_KEYS);
  const payload = buildExportPayload(stored);
  return {
    payload,
    json: JSON.stringify(payload, null, 2),
    filename: suggestExportFilename(),
    keyCount: Object.keys(payload.settings).length,
  };
}

/**
 * Validate a settings file and apply it.
 *
 * This is the API the onboarding "import settings from a previous install" track should call.
 * It never throws: every outcome, including a damaged file or a storage failure, comes back as a
 * result object with a code and a message written for a student to read.
 *
 * @param {string} text - the raw contents of an exported settings file
 * @returns {Promise<{ok: true, applied: string[], ignored: string[], meta: {schemaVersion: number, extensionVersion: string, exportedAt: string}, undo: () => Promise<void>}
 *                 | {ok: false, code: string, message: string}>}
 */
export async function importSettingsFromText(text) {
  const parsed = parseSettingsFile(text);
  if (!parsed.ok) {
    return parsed;
  }

  let current;
  try {
    current = await chrome.storage.local.get(EXPORTED_KEYS);
  } catch {
    return refuse(
      'read-failed',
      'Your current settings could not be read, so nothing was changed.'
    );
  }

  // parseSettingsFile has already established the file holds at least one allowlisted key, and
  // planImport keeps every one of them, so there is always something to write here.
  const plan = planImport(parsed.payload, current);

  try {
    // One write. Either the whole file lands or none of it does.
    await chrome.storage.local.set(plan.values);
  } catch {
    return refuse('write-failed', 'Your settings could not be saved, so nothing was changed.');
  }

  return {
    ok: true,
    applied: plan.applied,
    ignored: plan.ignored,
    meta: {
      schemaVersion: parsed.payload.schemaVersion,
      extensionVersion: parsed.payload.extensionVersion || 'unknown',
      exportedAt: parsed.payload.exportedAt || '',
    },
    undo: async () => {
      if (Object.keys(plan.previous).length > 0) {
        await chrome.storage.local.set(plan.previous);
      }
      if (plan.removeOnUndo.length > 0) {
        await chrome.storage.local.remove(plan.removeOnUndo);
      }
    },
  };
}

/**
 * Same as `importSettingsFromText`, for a `File` from a file input or a drop.
 *
 * @param {File} file
 * @returns {Promise<Object>} the same result shape as `importSettingsFromText`
 */
export async function importSettingsFromFile(file) {
  if (!file || typeof file.text !== 'function') {
    return refuse('no-file', 'No file was chosen.');
  }
  let text;
  try {
    text = await file.text();
  } catch {
    return refuse('unreadable-file', 'That file could not be opened.');
  }
  return importSettingsFromText(text);
}
