/**
 * Companion settings — the per-feature toggle layer for the C20 evaluation branch.
 * Every C20 feature must be individually switchable; defaults are ON on this branch so the
 * behaviour is visible for evaluation (defaults are re-decided before any merge to dev).
 */
import {
  COMPANION_FEATURES,
  COMPANION_STORAGE_KEY,
  getCompanionSettings,
  isCompanionEnabled,
  setCompanionEnabled,
} from '../../../src/features/companion/companion-settings.js';

let store;

beforeEach(() => {
  store = {};
  chrome.storage.local.get.mockImplementation(async key => {
    const k = typeof key === 'string' ? key : key[0];
    return k in store ? { [k]: store[k] } : {};
  });
  chrome.storage.local.set.mockImplementation(async obj => {
    Object.assign(store, obj);
  });
});

describe('COMPANION_FEATURES', () => {
  test('covers the eight platform-neutral features with unique keys and numbers', () => {
    // The Canvas-specific features are parked on feature/canvas-companion-parked.
    expect(COMPANION_FEATURES).toHaveLength(8);
    const keys = COMPANION_FEATURES.map(f => f.key);
    const nums = COMPANION_FEATURES.map(f => f.num);
    expect(new Set(keys).size).toBe(8);
    expect(new Set(nums).size).toBe(8);
    expect(keys).toEqual([
      'studySuite',
      'personalisedAi',
      'mathReadAloud',
      'authorship',
      'flashcards',
      'summaryDial',
      'lecture',
      'voiceCommands',
    ]);
  });

  test('every feature has a label and description', () => {
    for (const f of COMPANION_FEATURES) {
      expect(typeof f.label).toBe('string');
      expect(f.label.length).toBeGreaterThan(0);
      expect(typeof f.description).toBe('string');
      expect(f.description.length).toBeGreaterThan(0);
    }
  });
});

describe('getCompanionSettings', () => {
  test('defaults every feature ON when nothing is stored', async () => {
    const settings = await getCompanionSettings();
    for (const f of COMPANION_FEATURES) {
      expect(settings[f.key]).toBe(true);
    }
  });

  test('merges stored overrides over the defaults', async () => {
    store[COMPANION_STORAGE_KEY] = { lecture: false };
    const settings = await getCompanionSettings();
    expect(settings.lecture).toBe(false);
    expect(settings.flashcards).toBe(true);
  });
});

describe('isCompanionEnabled / setCompanionEnabled', () => {
  test('round-trips a toggle', async () => {
    await expect(isCompanionEnabled('authorship')).resolves.toBe(true);
    await setCompanionEnabled('authorship', false);
    await expect(isCompanionEnabled('authorship')).resolves.toBe(false);
    await setCompanionEnabled('authorship', true);
    await expect(isCompanionEnabled('authorship')).resolves.toBe(true);
  });

  test('setting one feature does not disturb another stored override', async () => {
    await setCompanionEnabled('flashcards', false);
    await setCompanionEnabled('lecture', false);
    await expect(isCompanionEnabled('flashcards')).resolves.toBe(false);
    await expect(isCompanionEnabled('lecture')).resolves.toBe(false);
  });

  test('unknown keys read as disabled and refuse writes', async () => {
    await expect(isCompanionEnabled('nope')).resolves.toBe(false);
    await expect(setCompanionEnabled('nope', true)).rejects.toThrow(/unknown/i);
  });
});
