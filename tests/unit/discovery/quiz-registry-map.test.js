/**
 * The gate on the one thing the discovery quiz still keeps by hand.
 *
 * Everything else about a feature — its settings path, its store, the further keys its switch
 * writes, the `ui_visibility` key that surfaces it — now comes from the popup's tool registry. The
 * single remaining hand-written sentence is which registry tool each quiz word means, and that is
 * exactly the kind of thing that rotted last time: `textStatsEnabled` pointed at `textStats.enabled`
 * and `dictionaryEnabled` at `dictionary.enabled`, neither of which anything has ever read, so a
 * student's answers silently did nothing and no test noticed for a year.
 *
 * These tests fail the moment a mapping stops naming something real, or the quiz gains a
 * recommendation nothing maps.
 */

import {
  QUIZ_TOOL_MAP,
  enableWrites,
  mappingProblems,
  resolveQuizKey,
} from '../../../src/pages/discovery/feature-tools.js';
import { FEATURES } from '../../../src/pages/discovery/questions.js';
import { PRESETS } from '../../../src/pages/discovery/recommendations.js';

/** Every key the quiz can put into a profile's `enabledFeatures`. */
const featureKeys = Object.values(FEATURES).map(feature => feature.settingKey);
/** Every key the three presets hand to `applyPreset`. */
const presetKeys = Object.values(PRESETS).flatMap(preset => preset.features);

describe('quiz vocabulary ↔ tool registry', () => {
  it('maps every recommendation the quiz can make', () => {
    expect(mappingProblems({ featureKeys, presetKeys })).toEqual([]);
  });

  it('resolves every mapped key to a tool that exists', () => {
    const unresolved = Object.keys(QUIZ_TOOL_MAP).filter(key => resolveQuizKey(key) === null);
    expect(unresolved).toEqual([]);
  });
});

describe('the gate itself catches each way the mapping can rot', () => {
  it('catches a quiz key pointing at a tool the registry does not have', () => {
    // What a renamed or deleted tool looks like.
    const broken = { ...QUIZ_TOOL_MAP, ttsEnabled: { tool: 'read-aloud' } };
    expect(mappingProblems({ map: broken, featureKeys, presetKeys })).toEqual([
      'ttsEnabled: names no tool in the registry (read-aloud)',
    ]);
  });

  it('catches a quiz key pointing at a control the tool does not have', () => {
    const broken = {
      ...QUIZ_TOOL_MAP,
      dictionaryEnabled: { tool: 'highlight-menu', control: 'highlight-menu-show-definitions' },
    };
    expect(mappingProblems({ map: broken, featureKeys, presetKeys })).toEqual([
      'dictionaryEnabled: highlight-menu has no control highlight-menu-show-definitions',
    ]);
  });

  it('catches a recommendation nothing maps — the shape of the original defect', () => {
    const { textStatsEnabled, ...broken } = QUIZ_TOOL_MAP;
    expect(textStatsEnabled).toBeDefined();
    expect(mappingProblems({ map: broken, featureKeys, presetKeys })).toEqual([
      'textStatsEnabled: the quiz can recommend it and nothing maps it',
    ]);
  });

  it('catches a preset naming a feature the quiz does not have', () => {
    expect(
      mappingProblems({ featureKeys, presetKeys: [...presetKeys, 'nightShiftEnabled'] })
    ).toEqual([
      'nightShiftEnabled: the quiz can recommend it and nothing maps it',
      'nightShiftEnabled: a preset names it but the quiz has no such feature',
    ]);
  });

  it('catches a mapping onto something that is not a switch', () => {
    // AI Assist stores a mode string (`aiMode`), so "enabling" it would mean guessing a value.
    const broken = { ...QUIZ_TOOL_MAP, simplifyEnabled: { tool: 'ai' } };
    expect(mappingProblems({ map: broken, featureKeys, presetKeys })).toEqual([
      'simplifyEnabled: ai is not a switch (default off)',
    ]);
  });
});

describe('what a quiz key resolves to', () => {
  it('reads a tool state, its mirrors and its visibility key off the registry', () => {
    // The defect case: nothing has ever read `textStats.enabled`.
    expect(enableWrites(['textStatsEnabled'])).toEqual([
      { store: 'settings', path: 'ui_overlay.show_text_stats_badge', value: true },
      { store: 'settings', path: 'ui_overlay.show_text_stats_notifications', value: true },
      { store: 'local', path: 'textStatsBadgeVisible', value: true },
      { store: 'local', path: 'textStatsNotificationsEnabled', value: true },
    ]);
  });

  it('switches a control on together with the tool that owns it', () => {
    expect(enableWrites(['autoPunctuationEnabled'])).toEqual([
      { store: 'settings', path: 'stt.enabled', value: true },
      { store: 'settings', path: 'ui_visibility.show_stt', value: true },
      { store: 'settings', path: 'stt.punctuationCommands', value: true },
      { store: 'settings', path: 'stt.autoPunctuation', value: true },
    ]);
  });

  it('writes nothing for an action-only tool, because there is nothing to switch', () => {
    // Translate Page is always available; no handler reads a `translation.enabled`.
    expect(enableWrites(['translationEnabled'])).toEqual([]);
  });

  it('writes each key once when a preset names a tool and one of its controls', () => {
    const writes = enableWrites(['sttEnabled', 'voiceCommandsEnabled', 'customVocabularyEnabled']);
    const paths = writes.map(write => write.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toContain('stt.voiceCommands');
  });

  it('ignores a key it cannot resolve rather than writing a guess', () => {
    expect(enableWrites(['darkModeEnabled'])).toEqual([]);
  });
});
