/**
 * Where the learning profile lives, and how a student gets rid of it.
 *
 * Kept apart from `cognitiveProfile.js` on purpose: that module self-initialises against `window`
 * and belongs to the content script, and the popup needs the same three facts — which key holds the
 * record, which key holds the opt-in, and how to erase the record — without starting the feature.
 * Nothing here touches the DOM or registers anything, so both realms can import it.
 *
 * @module features/cognitiveProfile/profile-storage
 */

/** The chrome.storage.local key holding the recorded profile. */
export const PROFILE_KEY = 'assist_cognitive_profile';

/** The chrome.storage.local key holding the student's opt-in. Absent means off. */
export const PROFILE_SETTINGS_KEY = 'cognitiveProfileSettings';

/**
 * Whether the student has asked for their learning to be recorded.
 *
 * Off is the answer to every uncertainty — a missing key, an unreadable store, a half-written
 * value. A feature that records how someone struggles does not get the benefit of the doubt.
 *
 * @returns {Promise<boolean>}
 */
export async function isProfileEnabled() {
  try {
    const stored = await chrome.storage.local.get(PROFILE_SETTINGS_KEY);
    return stored?.[PROFILE_SETTINGS_KEY]?.enabled === true;
  } catch {
    return false;
  }
}

/**
 * Delete the recorded profile, and anything stored beside it under the same name.
 *
 * The prefix sweep rather than a single `remove(PROFILE_KEY)` is deliberate: a migration or a
 * backup written as `assist_cognitive_profile_v0` would otherwise survive a student asking for
 * their record to be deleted, which is the one outcome that must not be possible.
 *
 * @returns {Promise<string[]>} the keys that were removed
 */
export async function eraseProfileData() {
  try {
    const everything = await chrome.storage.local.get(null);
    const keys = Object.keys(everything || {}).filter(key => key.startsWith(PROFILE_KEY));
    if (keys.length === 0) {
      return [];
    }
    await chrome.storage.local.remove(keys);
    return keys;
  } catch (error) {
    console.error('[CognitiveProfile] Could not erase the stored profile:', error);
    return [];
  }
}
