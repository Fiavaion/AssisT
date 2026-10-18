/**
 * What the discovery quiz's vocabulary means, in terms of the popup's tool registry.
 *
 * The quiz asks a student about their needs and then switches things on for them. It used to do
 * that through two hand-written maps — quiz key to settings path, quiz key to `show_*` key — which
 * drifted from the code and took the student's answers with them. `textStatsEnabled` wrote
 * `textStats.enabled` and `dictionaryEnabled` wrote `dictionary.enabled`; nothing in the extension
 * has ever read either, so those answers did nothing at all and said so nowhere.
 *
 * The registry already declares, for all 28 tools, where each one's state lives, what its default
 * is, which further keys its switch writes, and which `ui_visibility` key surfaces it — read off
 * the handlers that own them and held to that by `tests/unit/popup/registry/path-reality.test.js`.
 * So the quiz stops keeping its own copy of any of that. The one thing left by hand is the
 * sentence below: which tool each quiz word means. That is a translation between two vocabularies,
 * it cannot be derived, and `mappingProblems()` is the gate that stops it drifting in turn.
 *
 * The quiz keeps its own words (`ttsEnabled`, `dyslexiaEnabled`, …) because they are what
 * `questions.js` and the presets are written in and what a stored `discoveryProfile` already
 * contains. Only what they resolve to has changed.
 */

import { toolById } from '../../popup/registry/tool-registry.js';
import { mirrorTargets } from '../../popup/registry/tool-schema.js';

/**
 * Each quiz `settingKey` from `questions.js`, and the registry tool it means.
 *
 * Two forms:
 *   - `{ tool }` — the whole tool. Switching it on is what the quiz is recommending.
 *   - `{ tool, control }` — one control inside a tool, for the three quiz entries that describe a
 *     sub-feature rather than a support of its own (the STT ones, and Dictionary Lookup, whose
 *     only switch is the Dictionary button in the quick-actions menu). Enabling one of these also
 *     switches its tool on: a control of a tool that is off does nothing.
 *
 * There is deliberately no `darkModeEnabled` here. The web-page dark mode it named was removed
 * from the extension — `setupDarkMode()` in popup.js is a no-op that says so, and popup.js:1282
 * records `show_dark_mode` going with it. The old map aliased the key to `screenOverlay.enabled`,
 * which quietly gave a student who asked for a dark page a warm sepia tint instead. The quiz entry
 * has been retired rather than re-pointed; see the note in questions.js.
 *
 * @type {Object<string, {tool: string, control?: string}>}
 */
export const QUIZ_TOOL_MAP = {
  // Reading
  ttsEnabled: { tool: 'tts' },
  readingModeEnabled: { tool: 'reading-mode' },
  readingGuideEnabled: { tool: 'reading-guide' },
  readingProgressEnabled: { tool: 'reading-progress' },
  dyslexiaEnabled: { tool: 'dyslexia-mode' },

  // Writing. Auto-Punctuation and Voice Commands are switches inside Speech-to-Text, not supports
  // of their own; Custom Vocabulary is not a switch at all — the word list, the subject presets
  // and auto-learn are simply there whenever STT is, which is what the quiz card's "Open STT
  // settings and add words" already tells the student.
  sttEnabled: { tool: 'stt' },
  autoPunctuationEnabled: { tool: 'stt', control: 'stt-punctuation' },
  voiceCommandsEnabled: { tool: 'stt', control: 'stt-voice-commands' },
  customVocabularyEnabled: { tool: 'stt' },

  // Focus
  focusModeEnabled: { tool: 'focus-mode' },
  reducedMotionEnabled: { tool: 'reduced-motion' },
  pomodoroEnabled: { tool: 'pomodoro' },
  mediaControlEnabled: { tool: 'media-control' },

  // Visual
  screenOverlayEnabled: { tool: 'screen-overlay' },
  textCustomizationEnabled: { tool: 'text-customization' },

  // Organisation
  annotationsEnabled: { tool: 'annotations' },
  citationsEnabled: { tool: 'citation' },
  textStatsEnabled: { tool: 'text-stats' },
  highlightMenuEnabled: { tool: 'highlight-menu' },

  // Language. Translate Page is declared action-only — nothing reads a `translation.enabled`, so
  // there is no switch to set and the writer sets none. Dictionary lookup is likewise always
  // running in the content script; the one switch a student has over it is whether the Dictionary
  // button appears when they select a word.
  translationEnabled: { tool: 'translation' },
  dictionaryEnabled: { tool: 'highlight-menu', control: 'highlight-menu-show-dictionary' },
  simplifyEnabled: { tool: 'simplify' },
};

/**
 * The tool, and where applicable the control, a quiz key names.
 *
 * @param {string} settingKey
 * @param {Object} [map] - the mapping to resolve through; the real one unless a test supplies one
 * @returns {{tool: Object, control: Object|null}|null} null when the key names nothing real
 */
export function resolveQuizKey(settingKey, map = QUIZ_TOOL_MAP) {
  const entry = map[settingKey];
  if (!entry) {
    return null;
  }
  const tool = toolById(entry.tool);
  if (!tool) {
    return null;
  }
  if (!entry.control) {
    return { tool, control: null };
  }
  const control = (tool.controls || []).find(candidate => candidate.id === entry.control);
  return control ? { tool, control } : null;
}

/**
 * Every write that switching one declaration on requires: its own path, and each further key the
 * popup's own handler sets at the same time.
 *
 * @param {{store?:string, path:string}} declaration - a tool's `state`, or one of its controls
 * @returns {Array<{store:string, path:string, value:boolean}>}
 */
function writesFor(declaration) {
  const store = declaration.store || 'settings';
  return [
    { store, path: declaration.path, value: true },
    ...mirrorTargets(declaration).map(mirror => ({ ...mirror, value: true })),
  ];
}

/**
 * Switching a tool on: its state, its mirrors, and the `ui_visibility` key that surfaces it.
 *
 * Both layers, always. A tool enabled in `assist_settings` but left hidden in `ui_visibility` is
 * running with no way for the student to find or adjust it, which is how a quiz-enabled support
 * used to end up invisible in the popup.
 *
 * @param {Object} tool
 * @returns {Array<{store:string, path:string, value:boolean}>}
 */
function toolWrites(tool) {
  // Action-only tools — Translate Page — have no state by declaration. There is nothing to switch
  // on: the feature is always there, and inventing a flag for it would write another key nothing
  // reads, which is the whole defect this file exists to end.
  if (tool.actionOnly === true || !tool.state) {
    return [];
  }
  const writes = writesFor(tool.state);
  if (tool.visibilityKey) {
    writes.push({ store: 'settings', path: `ui_visibility.${tool.visibilityKey}`, value: true });
  }
  return writes;
}

/**
 * Every storage write needed to give a student the features their quiz answers asked for.
 *
 * The single path `applyProfile` and `applyPreset` both take, so neither can drift from the other.
 * Duplicates are collapsed, since presets and profiles routinely name a tool and one of its
 * controls together.
 *
 * @param {string[]} settingKeys - quiz keys, from a profile's `enabledFeatures` or a preset
 * @param {Object} [map]
 * @returns {Array<{store:string, path:string, value:boolean}>}
 */
export function enableWrites(settingKeys, map = QUIZ_TOOL_MAP) {
  const writes = [];
  const seen = new Set();

  (settingKeys || []).forEach(settingKey => {
    const resolved = resolveQuizKey(settingKey, map);
    if (!resolved) {
      return;
    }
    const planned = [
      ...toolWrites(resolved.tool),
      ...(resolved.control ? writesFor(resolved.control) : []),
    ];
    planned.forEach(write => {
      const identity = `${write.store}:${write.path}`;
      if (!seen.has(identity)) {
        seen.add(identity);
        writes.push(write);
      }
    });
  });

  return writes;
}

/**
 * Everything wrong with a mapping — the gate that keeps this file honest.
 *
 * The maps this replaced were wrong for a year because nothing could tell anyone they were. Three
 * ways to go wrong, all of them silent at runtime and all of them caught here:
 *   - a quiz key naming a tool or control the registry does not have (a renamed or deleted tool);
 *   - a quiz key the quiz can recommend that nothing maps (a new question, a forgotten entry) —
 *     this is what `autoPunctuationEnabled` and its two siblings already were;
 *   - a mapping onto something that is not a switch, which a writer could only enable by guessing.
 *
 * @param {Object} options
 * @param {Object} [options.map] - the mapping under test
 * @param {string[]} [options.featureKeys] - every `settingKey` the quiz can recommend
 * @param {string[]} [options.presetKeys] - every key the presets name
 * @returns {string[]} empty when the mapping is sound
 */
export function mappingProblems({ map = QUIZ_TOOL_MAP, featureKeys = [], presetKeys = [] } = {}) {
  const problems = [];

  Object.entries(map).forEach(([settingKey, entry]) => {
    const tool = toolById(entry.tool);
    if (!tool) {
      problems.push(`${settingKey}: names no tool in the registry (${entry.tool})`);
      return;
    }
    if (entry.control) {
      const control = (tool.controls || []).find(candidate => candidate.id === entry.control);
      if (!control) {
        problems.push(`${settingKey}: ${entry.tool} has no control ${entry.control}`);
      } else if (control.type !== 'switch') {
        problems.push(
          `${settingKey}: ${entry.control} is a ${control.type}, not something to switch on`
        );
      }
      return;
    }
    // A tool the quiz recommends must be one a student can be given. Action-only tools are the
    // deliberate exception: they are always available, so there is nothing to switch.
    if (tool.actionOnly !== true && tool.state && typeof tool.state.default !== 'boolean') {
      problems.push(`${settingKey}: ${entry.tool} is not a switch (default ${tool.state.default})`);
    }
  });

  [...new Set([...featureKeys, ...presetKeys])].forEach(settingKey => {
    if (!map[settingKey]) {
      problems.push(`${settingKey}: the quiz can recommend it and nothing maps it`);
    }
  });

  presetKeys.forEach(settingKey => {
    if (!featureKeys.includes(settingKey)) {
      problems.push(`${settingKey}: a preset names it but the quiz has no such feature`);
    }
  });

  return problems;
}
