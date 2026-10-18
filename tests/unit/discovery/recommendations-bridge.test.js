/**
 * Tests for the P3 two-layer enable bridge in applyPreset / applyProfile.
 *
 * Enabling a feature must write BOTH layers:
 *   Layer 1 — assist_settings.<feature>.enabled  (runtime)
 *   Layer 2 — assist_settings.ui_visibility.show_* (popup section visibility)
 * Previously only Layer 1 was written, so a quiz-enabled feature stayed hidden in the popup.
 */

import { applyPreset, applyProfile } from '../../../src/pages/discovery/recommendations.js';

describe('two-layer enable bridge', () => {
  beforeEach(() => {
    chrome.storage.local.get.mockResolvedValue({});
    chrome.storage.local.set.mockResolvedValue(undefined);
  });

  test('applyPreset writes both runtime enable and popup visibility', async () => {
    await applyPreset({ name: 'Reading Support', features: ['sttEnabled', 'citationsEnabled'] });

    const written = chrome.storage.local.set.mock.calls.at(-1)[0].assist_settings;
    expect(written.stt.enabled).toBe(true);
    expect(written.citation.enabled).toBe(true);
    expect(written.ui_visibility.show_stt).toBe(true);
    expect(written.ui_visibility.show_citations).toBe(true);
  });

  test('a feature with no popup section writes only the runtime layer', async () => {
    // ttsEnabled maps to tts.enabled but has no show_* key (TTS is always shown).
    await applyPreset({ name: 'TTS Only', features: ['ttsEnabled'] });

    const written = chrome.storage.local.set.mock.calls.at(-1)[0].assist_settings;
    expect(written.tts.enabled).toBe(true);
    expect(written.ui_visibility).toBeUndefined();
  });

  test('applyProfile also writes the visibility layer', async () => {
    await applyProfile({ enabledFeatures: ['dyslexiaEnabled'] });

    const written = chrome.storage.local.set.mock.calls.at(-1)[0].assist_settings;
    expect(written.dyslexiaMode.enabled).toBe(true);
    expect(written.ui_visibility.show_dyslexia_mode).toBe(true);
  });

  test('merges into existing assist_settings without clobbering unrelated keys', async () => {
    chrome.storage.local.get.mockResolvedValue({
      assist_settings: { tts: { enabled: true, rate: 1.2 }, ui_visibility: { show_ocr: true } },
    });

    await applyPreset({ name: 'Add STT', features: ['sttEnabled'] });

    const written = chrome.storage.local.set.mock.calls.at(-1)[0].assist_settings;
    expect(written.tts.rate).toBe(1.2); // unrelated key preserved
    expect(written.ui_visibility.show_ocr).toBe(true); // existing visibility preserved
    expect(written.stt.enabled).toBe(true);
    expect(written.ui_visibility.show_stt).toBe(true);
  });
});

describe('registry-resolved feature state (defect: quiz writes keys nothing reads)', () => {
  beforeEach(() => {
    chrome.storage.local.get.mockResolvedValue({});
    chrome.storage.local.set.mockResolvedValue(undefined);
  });

  test('textStatsEnabled writes the keys the text-stats handler writes', async () => {
    await applyProfile({ enabledFeatures: ['textStatsEnabled'] });

    const written = chrome.storage.local.set.mock.calls.at(-1)[0];
    expect(written.assist_settings.ui_overlay.show_text_stats_badge).toBe(true);
    expect(written.assist_settings.ui_overlay.show_text_stats_notifications).toBe(true);
    expect(written.textStatsBadgeVisible).toBe(true);
    expect(written.textStatsNotificationsEnabled).toBe(true);
    expect(written.assist_settings.textStats).toBeUndefined();
  });

  test('dictionaryEnabled reaches the only switch that governs a dictionary affordance', async () => {
    await applyProfile({ enabledFeatures: ['dictionaryEnabled'] });

    const settings = chrome.storage.local.set.mock.calls.at(-1)[0].assist_settings;
    expect(settings.highlightMenu.showDictionary).toBe(true);
    expect(settings.highlightMenu.enabled).toBe(true);
    expect(settings.ui_visibility.show_highlight_menu).toBe(true);
    expect(settings.dictionary).toBeUndefined();
    expect(settings.ui_visibility.show_dictionary).toBeUndefined();
  });

  test('an STT sub-feature writes its own control and switches STT on', async () => {
    await applyProfile({ enabledFeatures: ['voiceCommandsEnabled'] });

    const settings = chrome.storage.local.set.mock.calls.at(-1)[0].assist_settings;
    expect(settings.stt.voiceCommands).toBe(true);
    expect(settings.stt.enabled).toBe(true);
    expect(settings.ui_visibility.show_stt).toBe(true);
  });

  test('annotationsEnabled surfaces its popup section', async () => {
    await applyProfile({ enabledFeatures: ['annotationsEnabled'] });

    const settings = chrome.storage.local.set.mock.calls.at(-1)[0].assist_settings;
    expect(settings.annotations.enabled).toBe(true);
    expect(settings.ui_visibility.show_annotations).toBe(true);
  });
});
