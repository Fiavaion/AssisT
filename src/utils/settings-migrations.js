/**
 * One-off changes to settings already stored by an earlier version, run on update.
 *
 * Each runs once per install and records that it has, so a choice a student makes afterwards is
 * never overruled by the same migration again. A fresh install has nothing to migrate, so it
 * records every one as done straight away (markSettingsMigrationsDone); otherwise the first update
 * after it would treat the student's own choices as leftovers from an earlier version.
 *
 * @module utils/settings-migrations
 */

import { applySettingWrites } from './setting-writes.js';

const OCR_AUTO_PLAY_MARKER = 'migration_ocrAutoPlayDefaultOff';

/**
 * Switch OCR auto-play off where an earlier version stored it on.
 *
 * Auto-play shipped switched on, older popup code wrote `ocr.autoTTS: true` whenever it created
 * the OCR settings, and the switch did nothing until 1.0.0. A stored true is therefore the old
 * default rather than a student's choice, and the default is now off, because a voice starting
 * unprompted can talk over a screen reader.
 *
 * @returns {Promise<boolean>} whether the stored value was changed
 */
export async function resetUnchosenOcrAutoPlay() {
  const stored = await chrome.storage.local.get([OCR_AUTO_PLAY_MARKER, 'assist_settings']);
  if (stored[OCR_AUTO_PLAY_MARKER]) {
    return false;
  }
  const wasOn = stored.assist_settings?.ocr?.autoTTS === true;
  const writes = wasOn ? [{ path: 'ocr.autoTTS', value: false }] : [];
  await applySettingWrites(writes, { [OCR_AUTO_PLAY_MARKER]: true });
  return wasOn;
}

const TEXT_CUSTOMIZATION_SYNC_MARKER = 'migration_textCustomizationSyncWithdrawn';

/**
 * Forget the Text Customization "Apply to all windows" switch.
 *
 * With the switch off, which is how it shipped, font and spacing changes went to one tab and were
 * never stored. The choice is now always stored and applied on every page, so the switch is gone
 * and its stored state means nothing. The student's text choices themselves are not touched.
 *
 * @returns {Promise<void>}
 */
export async function forgetTextCustomizationSyncSwitch() {
  const stored = await chrome.storage.local.get([TEXT_CUSTOMIZATION_SYNC_MARKER]);
  if (stored[TEXT_CUSTOMIZATION_SYNC_MARKER]) {
    return;
  }
  await chrome.storage.local.remove('textCustomSync');
  await chrome.storage.local.set({ [TEXT_CUSTOMIZATION_SYNC_MARKER]: true });
}

const AZURE_SPEECH_MARKER = 'migration_azureSpeechWithdrawn';

/** Every shape an Azure Speech key was ever stored in: encrypted, plain text, and CryptoJS. */
const AZURE_SPEECH_KEYS = ['secure_apikey_azure', 'azure_api_key', 'apiKey_azure_encrypted'];

/**
 * Delete what the withdrawn Azure Speech engine left behind.
 *
 * The engine was removed because nothing could reach it, so a key stored for it is a credential the
 * extension can never use, and it is deleted rather than kept. A stored choice of the engine goes
 * back to the browser's own speech recognition, which is what dictation used all along.
 *
 * @returns {Promise<void>}
 */
export async function withdrawAzureSpeech() {
  const stored = await chrome.storage.local.get([AZURE_SPEECH_MARKER, 'assist_settings']);
  if (stored[AZURE_SPEECH_MARKER]) {
    return;
  }
  await chrome.storage.local.remove(AZURE_SPEECH_KEYS);
  const writes =
    stored.assist_settings?.stt?.engine === 'azure' ? [{ path: 'stt.engine', value: 'auto' }] : [];
  await applySettingWrites(writes, { [AZURE_SPEECH_MARKER]: true });
}

const TRANSLATION_KEY_FIELD_MARKER = 'migration_translationKeyFieldWithdrawn';

/** The translation fields the withdrawn engine choice and key field wrote. */
const WITHDRAWN_TRANSLATION_FIELDS = ['googleApiKey', 'preferredEngine'];

/**
 * Delete what the withdrawn Google Translate engine choice left behind.
 *
 * Advanced options offered "LibreTranslate" or "Google Translate" with a key field, and wrote the
 * key into the settings in plain text. Nothing ever read either: translation only ever used
 * MyMemory. A stored credential nothing can use is deleted, from the settings the popup wrote and
 * from the translation feature's own copy. Every other translation choice is kept.
 *
 * @returns {Promise<void>}
 */
export async function withdrawTranslationKeyField() {
  const stored = await chrome.storage.local.get([
    TRANSLATION_KEY_FIELD_MARKER,
    'assist_settings',
    'translationSettings',
  ]);
  if (stored[TRANSLATION_KEY_FIELD_MARKER]) {
    return;
  }
  const inSettings = stored.assist_settings?.translationSettings || {};
  const inFeature = stored.translationSettings || {};
  const writes = WITHDRAWN_TRANSLATION_FIELDS.flatMap(field => [
    ...(field in inSettings ? [{ path: `translationSettings.${field}`, value: undefined }] : []),
    ...(field in inFeature
      ? [{ store: 'local', path: `translationSettings.${field}`, value: undefined }]
      : []),
  ]);
  await applySettingWrites(writes, { [TRANSLATION_KEY_FIELD_MARKER]: true });
}

const ONLINE_VOICE_MARKER = 'migration_unchosenOnlineVoiceReset';

/** The voice an earlier popup saved on first open, whatever the student did. */
const VOICE_SAVED_FOR_THE_STUDENT = 'Google UK English Female';

/** The first version whose popup no longer saved that voice without being asked. */
const VOICE_STOPPED_BEING_SAVED_IN = [1, 0, 0];

/**
 * Settings with the voice the old popup saved put back to the automatic choice, or the same object
 * when it holds any other voice.
 * @param {Object|undefined} settings - an `assist_settings`, or a profile's `settings`
 * @returns {Object|undefined}
 */
function withoutVoiceSavedForThem(settings) {
  if (settings?.tts?.voice !== VOICE_SAVED_FOR_THE_STUDENT) {
    return settings;
  }
  return { ...settings, tts: { ...settings.tts, voice: 'default' } };
}

/**
 * Saved profiles with that voice reset inside each, or the same object when none holds it.
 * @param {Object|undefined} profiles - `assist_profiles`, by profile name
 * @returns {Object|undefined}
 */
function profilesWithoutVoiceSavedForThem(profiles) {
  if (!profiles || typeof profiles !== 'object') {
    return profiles;
  }
  let changed = false;
  const next = {};
  Object.entries(profiles).forEach(([name, profile]) => {
    const settings = withoutVoiceSavedForThem(profile?.settings);
    changed = changed || settings !== profile?.settings;
    next[name] = settings === profile?.settings ? profile : { ...profile, settings };
  });
  return changed ? next : profiles;
}

/**
 * Whether a settings file was written before the old popup stopped saving that voice. A version
 * that cannot be read is treated as older: every real export records one, and resetting a voice
 * the student did choose costs them one pick in the popup, while keeping one they did not choose
 * sends what they read to Google.
 * @param {*} extensionVersion - the `extensionVersion` a settings export records
 * @returns {boolean}
 */
function predatesVoiceFix(extensionVersion) {
  const parts = String(extensionVersion || '')
    .split('.')
    .map(part => Number.parseInt(part, 10));
  if (parts.length < 2 || parts.some(part => !Number.isInteger(part))) {
    return true;
  }
  for (let i = 0; i < VOICE_STOPPED_BEING_SAVED_IN.length; i += 1) {
    const part = parts[i] || 0;
    if (part !== VOICE_STOPPED_BEING_SAVED_IN[i]) {
      return part < VOICE_STOPPED_BEING_SAVED_IN[i];
    }
  }
  return false;
}

/**
 * The settings in an imported file, with the voice the old popup saved reset when the file comes
 * from before it stopped doing so: importing an old backup must not undo the migration below.
 * @param {Object} settings - the file's `settings`, by storage key
 * @param {*} extensionVersion - the version the file records
 * @returns {Object}
 */
export function importedWithoutUnchosenOnlineVoice(settings, extensionVersion) {
  if (!settings || !predatesVoiceFix(extensionVersion)) {
    return settings;
  }
  const next = { ...settings };
  if ('assist_settings' in settings) {
    next.assist_settings = withoutVoiceSavedForThem(settings.assist_settings);
  }
  if ('assist_profiles' in settings) {
    next.assist_profiles = profilesWithoutVoiceSavedForThem(settings.assist_profiles);
  }
  return next;
}

/**
 * Put the read-aloud voice an earlier popup chose back to the automatic choice, in the settings
 * and in every saved profile.
 *
 * The old popup saved "Google UK English Female" the first time it opened, so most students have
 * it stored without having chosen it, and a profile saved then holds it too, ready to bring it
 * back when loaded. It is an online voice: what it reads is sent to Google. The automatic choice
 * ('default') lets the speech helper pick a voice on the device. Only that exact name is reset;
 * any other voice, online or not, is a choice the student made and is kept.
 *
 * @returns {Promise<boolean>} whether a stored voice was changed
 */
export async function resetUnchosenOnlineVoice() {
  const stored = await chrome.storage.local.get([
    ONLINE_VOICE_MARKER,
    'assist_settings',
    'assist_profiles',
  ]);
  if (stored[ONLINE_VOICE_MARKER]) {
    return false;
  }
  const writes = [];
  if (withoutVoiceSavedForThem(stored.assist_settings) !== stored.assist_settings) {
    writes.push({ path: 'tts.voice', value: 'default' });
  }
  const profiles = profilesWithoutVoiceSavedForThem(stored.assist_profiles);
  if (profiles !== stored.assist_profiles) {
    writes.push({ store: 'local', path: 'assist_profiles', value: profiles });
  }
  await applySettingWrites(writes, { [ONLINE_VOICE_MARKER]: true });
  return writes.length > 0;
}

const NEW_EXPERIENCE_MARKER = 'migration_newExperienceSwitchWithdrawn';

/**
 * Forget the "Try the new AssisT" switch.
 *
 * It chose between the classic popup and the new one. The new popup is now the only popup, so the
 * switch is gone and its stored state means nothing.
 *
 * @returns {Promise<void>}
 */
export async function forgetNewExperienceSwitch() {
  const stored = await chrome.storage.local.get([NEW_EXPERIENCE_MARKER, 'assist_settings']);
  if (stored[NEW_EXPERIENCE_MARKER]) {
    return;
  }
  const writes =
    stored.assist_settings && 'newExperience' in stored.assist_settings
      ? [{ path: 'newExperience', value: undefined }]
      : [];
  await applySettingWrites(writes, { [NEW_EXPERIENCE_MARKER]: true });
}

const CLASSIC_LAYOUT_MARKER = 'migration_classicPopupLayoutWithdrawn';

/** The top-level keys the classic popup's layout controls stored. */
const CLASSIC_LAYOUT_KEYS = ['layout_mode', 'popup_hide_unused'];

/**
 * Forget what the classic popup's layout controls stored.
 *
 * Organize mode (`ui_layout`: section order, visibility and titles), the hide-unused filter
 * (`popup_hide_unused`) and the Layout mode option (`layout_mode`) arranged the accordion. The new
 * popup is the only popup and the accordion is never shown, so the controls are gone and what they
 * stored means nothing. Hiding a tool in Advanced Options (`ui_visibility`) is a different feature
 * and is kept.
 *
 * @returns {Promise<void>}
 */
export async function forgetClassicPopupLayout() {
  const stored = await chrome.storage.local.get([CLASSIC_LAYOUT_MARKER, 'assist_settings']);
  if (stored[CLASSIC_LAYOUT_MARKER]) {
    return;
  }
  await chrome.storage.local.remove(CLASSIC_LAYOUT_KEYS);
  const writes =
    stored.assist_settings && 'ui_layout' in stored.assist_settings
      ? [{ path: 'ui_layout', value: undefined }]
      : [];
  await applySettingWrites(writes, { [CLASSIC_LAYOUT_MARKER]: true });
}

const STUCK_READER_MARKER = 'migration_stuckReaderSwitchWithdrawn';

/**
 * Forget the "Stuck-reader rescue" companion switch.
 *
 * It did nothing on its own. The help it named is offered by "Offer help when reading gets hard"
 * (`struggleDetectionSettings`), and it only worked while that was on too, with nothing linking
 * the two. That switch is now the only one, so what this one stored means nothing. The other
 * companion switches are kept.
 *
 * @returns {Promise<void>}
 */
export async function forgetStuckReaderSwitch() {
  const stored = await chrome.storage.local.get([STUCK_READER_MARKER, 'companionFeatures']);
  if (stored[STUCK_READER_MARKER]) {
    return;
  }
  const companion = stored.companionFeatures;
  const items = { [STUCK_READER_MARKER]: true };
  if (companion && typeof companion === 'object' && 'stuckReader' in companion) {
    const { stuckReader: _withdrawn, ...kept } = companion;
    items.companionFeatures = kept;
  }
  await chrome.storage.local.set(items);
}

/**
 * Record every migration in this module as done, without changing any setting. Run on a fresh
 * install, where nothing stored can come from an earlier version.
 *
 * @returns {Promise<void>}
 */
export async function markSettingsMigrationsDone() {
  await chrome.storage.local.set({
    [OCR_AUTO_PLAY_MARKER]: true,
    [TEXT_CUSTOMIZATION_SYNC_MARKER]: true,
    [AZURE_SPEECH_MARKER]: true,
    [TRANSLATION_KEY_FIELD_MARKER]: true,
    [ONLINE_VOICE_MARKER]: true,
    [NEW_EXPERIENCE_MARKER]: true,
    [CLASSIC_LAYOUT_MARKER]: true,
    [STUCK_READER_MARKER]: true,
  });
}
