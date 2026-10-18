/**
 * @jest-environment jsdom
 *
 * The learning profile records how a student struggles, so it must not record anything until the
 * student has asked for it.
 *
 * The audit before 1.0.0 found this feature defaulting to on, self-starting from the content
 * script, writing `assist_cognitive_profile` on first page load, and having no control anywhere in
 * the popup. These tests hold the opposite: silent while off, stops the moment it is switched off,
 * and its stored record can actually be deleted.
 */

jest.mock('../../../src/core/ui/toast.js', () => ({ showToast: jest.fn() }));

const FEATURE = '../../../src/features/cognitiveProfile/cognitiveProfile.js';
const STORAGE = '../../../src/features/cognitiveProfile/profile-storage.js';
const ADDENDUM = '../../../src/features/companion/profile-addendum.js';
const COMPANION = '../../../src/features/companion/companion-settings.js';

jest.mock('../../../src/features/companion/companion-settings.js', () => ({
  // The popup registry this file reads declares a tool per companion feature, from the real list.
  ...jest.requireActual('../../../src/features/companion/companion-settings.js'),
  isCompanionEnabled: jest.fn(async () => true),
  COMPANION_STORAGE_KEY: 'assist_companion',
}));

const PROFILE_KEY = 'assist_cognitive_profile';
const SETTINGS_KEY = 'cognitiveProfileSettings';

/** The listeners chrome.storage.onChanged was given, so a test can fire a real change. */
let changeListeners = [];

function fireSettingsChange(newValue, area = 'local') {
  for (const listener of changeListeners) {
    listener({ [SETTINGS_KEY]: { newValue } }, area);
  }
}

/** Import the feature fresh; importing it starts it, as it does in a content script. */
async function loadFeature() {
  const mod = await import(FEATURE);
  await mod.profile_initialize();
  return mod;
}

/** Whether anything has been written to the profile key. */
function wroteProfile() {
  return chrome.storage.local.set.mock.calls.some(
    ([payload]) => payload && Object.prototype.hasOwnProperty.call(payload, PROFILE_KEY)
  );
}

beforeEach(() => {
  jest.resetModules();
  changeListeners = [];
  delete window.assistFeatures;
  chrome.storage.onChanged = {
    addListener: jest.fn(listener => changeListeners.push(listener)),
    removeListener: jest.fn(),
  };
  chrome.storage.local.get.mockResolvedValue({});
});

afterEach(() => {
  delete chrome.storage.onChanged;
});

describe('off unless the student opts in', () => {
  test('the feature ships off', async () => {
    const mod = await loadFeature();
    expect(mod.profile_settings.enabled).toBe(false);
  });

  test('nothing is stored on a page load with no opt-in', async () => {
    await loadFeature();
    expect(wroteProfile()).toBe(false);
  });

  test('a tracked interaction while off writes nothing', async () => {
    const mod = await loadFeature();
    await mod.profile_trackInteraction('summarization', { wordCount: 400 });
    await mod.profile_trackFeedback('simpler');
    expect(wroteProfile()).toBe(false);
  });

  test('the popup and the feature agree on the key the opt-in is stored under', async () => {
    const { PROFILE_SETTINGS_KEY, PROFILE_KEY: RECORD_KEY } = await import(STORAGE);
    const popupJs = require('fs').readFileSync(
      require('path').join(__dirname, '../../../src/popup/popup.js'),
      'utf8'
    );
    expect(PROFILE_SETTINGS_KEY).toBe(SETTINGS_KEY);
    expect(RECORD_KEY).toBe(PROFILE_KEY);
    expect(popupJs).toContain(`'${SETTINGS_KEY}'`);
  });

  test('the popup registry declares it off by default', async () => {
    const { toolById } = await import('../../../src/popup/registry/tool-registry.js');
    const tool = toolById('learning-profile');
    expect(tool).toBeDefined();
    expect(tool.state).toEqual(
      expect.objectContaining({ store: 'local', default: false, path: `${SETTINGS_KEY}.enabled` })
    );
  });
});

describe('opting in, then out', () => {
  test('an opted-in student is recorded, and switching off stops the writes', async () => {
    chrome.storage.local.get.mockResolvedValue({ [SETTINGS_KEY]: { enabled: true } });
    const mod = await loadFeature();

    await mod.profile_trackInteraction('summarization', { wordCount: 400 });
    expect(wroteProfile()).toBe(true);

    fireSettingsChange({ enabled: false });
    chrome.storage.local.set.mockClear();
    await mod.profile_trackInteraction('summarization', { wordCount: 400 });

    expect(wroteProfile()).toBe(false);
  });

  test('a change in another storage area is not an opt-out', async () => {
    chrome.storage.local.get.mockResolvedValue({ [SETTINGS_KEY]: { enabled: true } });
    const mod = await loadFeature();

    fireSettingsChange({ enabled: false }, 'sync');
    await mod.profile_trackInteraction('summarization', {});

    expect(wroteProfile()).toBe(true);
  });
});

describe('deleting what was recorded', () => {
  test('the profile key and every sibling of it go', async () => {
    const { eraseProfileData } = await import(STORAGE);
    chrome.storage.local.get.mockResolvedValue({
      [PROFILE_KEY]: { stats: {} },
      [`${PROFILE_KEY}_v0`]: { stats: {} },
      citationStyle: 'apa',
    });

    const removed = await eraseProfileData();

    expect(removed.sort()).toEqual([PROFILE_KEY, `${PROFILE_KEY}_v0`]);
    expect(chrome.storage.local.remove).toHaveBeenCalledWith(
      expect.arrayContaining([PROFILE_KEY, `${PROFILE_KEY}_v0`])
    );
    expect(chrome.storage.local.remove.mock.calls[0][0]).not.toContain('citationStyle');
  });

  test('deleting with nothing stored is harmless', async () => {
    const { eraseProfileData } = await import(STORAGE);
    chrome.storage.local.get.mockResolvedValue({ citationStyle: 'apa' });

    await expect(eraseProfileData()).resolves.toEqual([]);
    expect(chrome.storage.local.remove).not.toHaveBeenCalled();
  });

  /**
   * Deleting the record is not withdrawing consent, and the two used to be confused: erase left the
   * in-memory record null, so with the opt-in still on nothing was recorded again until the page was
   * reloaded, and "See what is recorded" answered that the record was switched off — which it was
   * not. Empty and recording is the honest state.
   */
  test('erasing while still opted in starts an empty record and keeps recording', async () => {
    chrome.storage.local.get.mockResolvedValue({ [SETTINGS_KEY]: { enabled: true } });
    const mod = await loadFeature();
    await mod.profile_trackInteraction('summarization', {});
    chrome.storage.local.get.mockResolvedValue({ [PROFILE_KEY]: {} });

    await window.assistFeatures.cognitiveProfile.erase();

    expect(chrome.storage.local.remove).toHaveBeenCalled();
    const afterErase = window.assistFeatures.cognitiveProfile.get();
    expect(afterErase).not.toBeNull();
    expect(afterErase.stats.totalInteractions).toBe(0);
    expect(afterErase.stats.summarizationsUsed).toBe(0);

    chrome.storage.local.set.mockClear();
    await mod.profile_trackInteraction('summarization', {});
    expect(chrome.storage.local.set).toHaveBeenCalled();
    expect(window.assistFeatures.cognitiveProfile.get().stats.summarizationsUsed).toBe(1);
  });

  test('erasing after the opt-in is off leaves nothing in memory at all', async () => {
    chrome.storage.local.get.mockResolvedValue({ [SETTINGS_KEY]: { enabled: true } });
    const mod = await loadFeature();
    await mod.profile_trackInteraction('summarization', {});

    const listener = chrome.storage.onChanged.addListener.mock.calls.at(-1)[0];
    await listener({ [SETTINGS_KEY]: { newValue: { enabled: false } } }, 'local');
    chrome.storage.local.get.mockResolvedValue({ [PROFILE_KEY]: {} });

    await window.assistFeatures.cognitiveProfile.erase();

    expect(window.assistFeatures.cognitiveProfile.get()).toBeNull();
  });

  /**
   * A fresh record must not be the defaults object itself: every counter on it is incremented in
   * place, so sharing it would make the "defaults" climb for the rest of the session.
   */
  test('the fresh record is a copy, so counting does not move the defaults', async () => {
    chrome.storage.local.get.mockResolvedValue({ [SETTINGS_KEY]: { enabled: true } });
    const mod = await loadFeature();
    chrome.storage.local.get.mockResolvedValue({ [PROFILE_KEY]: {} });
    await window.assistFeatures.cognitiveProfile.erase();

    await mod.profile_trackInteraction('summarization', {});
    const first = window.assistFeatures.cognitiveProfile.get().stats.summarizationsUsed;

    await window.assistFeatures.cognitiveProfile.erase();
    expect(window.assistFeatures.cognitiveProfile.get().stats.summarizationsUsed).toBe(0);
    expect(first).toBe(1);
  });
});

describe('consumers when the profile is absent', () => {
  test('prompt modifiers are empty while the feature is off', async () => {
    const mod = await loadFeature();
    expect(mod.profile_getPromptModifiers()).toEqual({});
    expect(mod.profile_getRecommendedComplexity('summarization')).toBe('moderate');
  });

  test('the AI prompt addendum stays empty', async () => {
    await loadFeature();
    const { isCompanionEnabled } = await import(COMPANION);
    isCompanionEnabled.mockResolvedValue(true);
    const { getProfileAddendum } = await import(ADDENDUM);

    await expect(getProfileAddendum()).resolves.toBe('');
  });

  test('the window API is registered even while off, so callers do not throw', async () => {
    await loadFeature();
    const api = window.assistFeatures.cognitiveProfile;
    expect(typeof api.track).toBe('function');
    await expect(api.track('knowledgeGraph', { nodes: 3 })).resolves.toBeUndefined();
    expect(api.getDominantStyle()).toBe('balanced');
  });
});
