/**
 * Companion settings: one on/off switch per companion feature, stored under companionFeatures.
 *
 * Each feature is on by default and has its own switch in the popup (src/popup/registry/tools/
 * companion.js builds those switches from this list). Clean setup switches them all off.
 *
 * @module features/companion/companion-settings
 */

export const COMPANION_STORAGE_KEY = 'companionFeatures';

export const COMPANION_FEATURES = [
  {
    num: 1,
    key: 'studySuite',
    label: 'Study tools discovery',
    description: 'A one-time tip that shows the AI study tools in the select-text menu',
  },
  {
    num: 2,
    key: 'personalisedAi',
    label: 'Personalised AI',
    description: 'Your learning profile shapes the answers every AI feature gives you',
  },
  {
    num: 3,
    key: 'mathReadAloud',
    label: 'Read equations aloud',
    description: 'Read aloud speaks equations and highlights them along with the rest of the page',
  },
  {
    num: 6,
    key: 'authorship',
    label: 'Authorship Shield',
    description: 'A private, local writing history you can export if your work is questioned',
  },
  {
    num: 15,
    key: 'flashcards',
    label: 'Flashcards',
    description: 'Spaced-repetition cards made from your own highlights and citations',
  },
  {
    num: 16,
    key: 'summaryDial',
    label: 'Summary reading level',
    description: 'A reading-level dial for AI summaries and simplification',
  },
  {
    num: 18,
    key: 'lecture',
    label: 'Lecture companion',
    description: 'Live captions and structured notes from the microphone',
  },
  {
    num: 20,
    key: 'voiceCommands',
    label: 'Voice commands',
    description: 'Hands-free control: "read this page", "save citation", "open my library"',
  },
];
// Feature numbering is sparse on purpose: LMS-page-specific companions are developed separately.

const KNOWN_KEYS = new Set(COMPANION_FEATURES.map(f => f.key));

function defaults() {
  const out = {};
  for (const f of COMPANION_FEATURES) {
    out[f.key] = true;
  }
  return out;
}

/**
 * Read the merged companion settings (defaults overlaid with stored overrides).
 * @returns {Promise<Object<string, boolean>>}
 */
export async function getCompanionSettings() {
  const result = await chrome.storage.local.get(COMPANION_STORAGE_KEY);
  return { ...defaults(), ...(result[COMPANION_STORAGE_KEY] || {}) };
}

/**
 * @param {string} key - A COMPANION_FEATURES key
 * @returns {Promise<boolean>}
 */
export async function isCompanionEnabled(key) {
  if (!KNOWN_KEYS.has(key)) {
    return false;
  }
  const settings = await getCompanionSettings();
  return settings[key] === true;
}

/**
 * Be told, live, whenever the companion toggles change.
 *
 * A toggle used to take effect on the next page load, which is not what switching a support off
 * means to a student: overnight release testing switched every support off and the Authorship
 * Shield's "history" chip stayed on the page, over the article's own contents list. The
 * bootstrapper (companion-init.js) uses this to start and stop features as the toggles move.
 *
 * @param {(settings: Object<string, boolean>) => void} callback - given the merged settings
 * @returns {() => void} unsubscribe
 */
export function onCompanionSettingsChange(callback) {
  const onChanged = chrome?.storage?.onChanged;
  if (!onChanged?.addListener) {
    return () => {};
  }
  const listener = (changes, area) => {
    if (area !== 'local' || !changes[COMPANION_STORAGE_KEY]) {
      return;
    }
    callback({ ...defaults(), ...(changes[COMPANION_STORAGE_KEY].newValue || {}) });
  };
  onChanged.addListener(listener);
  return () => onChanged.removeListener(listener);
}

/**
 * @param {string} key - A COMPANION_FEATURES key
 * @param {boolean} enabled
 */
export async function setCompanionEnabled(key, enabled) {
  if (!KNOWN_KEYS.has(key)) {
    throw new Error(`Unknown companion feature: ${key}`);
  }
  const result = await chrome.storage.local.get(COMPANION_STORAGE_KEY);
  const stored = { ...(result[COMPANION_STORAGE_KEY] || {}), [key]: enabled === true };
  await chrome.storage.local.set({ [COMPANION_STORAGE_KEY]: stored });
}
