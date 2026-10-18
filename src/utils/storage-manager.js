/**
 * Storage Manager
 * Handles all Chrome storage API interactions with FERPA-compliant data handling
 * Stores user preferences locally for privacy
 */

import { applySettingWrites } from './setting-writes.js';

/** True for an object literal — not an array, a Date, or null. */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Returns a new object with `override`'s values laid over `base`, recursing only where both sides
 * are plain objects. Nothing in either argument is mutated.
 */
function deepMerge(base, override) {
  const merged = {};

  for (const key of Object.keys(base)) {
    merged[key] = isPlainObject(base[key]) ? deepMerge(base[key], {}) : base[key];
  }

  for (const key of Object.keys(override)) {
    const incoming = override[key];
    merged[key] =
      isPlainObject(merged[key]) && isPlainObject(incoming)
        ? deepMerge(merged[key], incoming)
        : isPlainObject(incoming)
          ? deepMerge(incoming, {})
          : incoming;
  }

  return merged;
}

/**
 * Rewrites values an older version stored in a shape the defaults no longer declare, so the merge
 * can fill them in. The merge keeps any stored non-object over a default object, which is right for
 * a student's choice and wrong for an old shape: the value would survive and every reader of its
 * options would get undefined.
 *
 * - `canvasIntegration.quizHelper` was a bare boolean before the quiz helper had options. It
 *   becomes `{ enabled: <that boolean> }`, so a student who had it on keeps it on and the options
 *   take their defaults.
 *
 * @param {Object} stored the stored settings object; not mutated
 * @returns {Object} the same object when nothing needed upgrading, otherwise an upgraded copy
 */
function upgradeStored(stored) {
  const quizHelper = stored.canvasIntegration?.quizHelper;
  if (typeof quizHelper !== 'boolean') {
    return stored;
  }
  return {
    ...stored,
    canvasIntegration: { ...stored.canvasIntegration, quizHelper: { enabled: quizHelper } },
  };
}

export class StorageManager {
  static STORAGE_KEYS = {
    SETTINGS: 'assist_settings',
  };

  /**
   * The shape of the settings, and the value of every branch on a fresh install.
   *
   * This is the one place a default lives. Nothing hands this object out or writes into it —
   * `withDefaults()` copies it — so a caller cannot leave a stale value behind for the next one.
   */
  static DEFAULT_SETTINGS = {
    tts: {
      enabled: false,
      voice: 'default',
      rate: 1.0,
      pitch: 1.0,
      volume: 1.0,
      highlightEnabled: true,
      highlightColor: '#FFEB3B',
      highlightOpacity: 0.7,
      autoStart: false,
    },
    // Sprint 5 Features
    stt: {
      enabled: false, // Default OFF
      continuousMode: true, // Keep listening vs single utterance
      interimResults: true, // Show partial results
      language: 'en-US', // Recognition language
      autoCapitalize: true, // Capitalize first word of sentences
      punctuationCommands: true, // Voice punctuation ("period", "comma")
      floatingButton: true, // Show mic button on text field focus
      vocabulary: {
        autoLearn: true, // Learn a word the student keeps correcting
        enabledPresets: [], // Subject word lists: 'medical' | 'legal' | 'academic' | 'stem'
        customWords: [], // [{ word, phonetic }] the student added
      },
    },
    accessibility: {
      keyboardShortcuts: true,
      screenReaderOptimized: false,
      reducedMotion: false,
    },
    // Sprint 3 Features
    textCustomization: {
      enabled: false,
      fontFamily: 'system', // 'system' | 'lexend' | 'opendyslexic' | 'comic-sans' | 'arial'
      lineSpacing: 1.5, // WCAG min: 1.5
      letterSpacing: 0.12, // WCAG min: 0.12em (displayed as 12%)
      wordSpacing: 0.16, // WCAG min: 0.16em (displayed as 16%)
      paragraphSpacing: 2.0, // WCAG min: 2.0em
    },
    readingGuide: {
      enabled: false,
      lineColor: '#000000',
      lineThickness: 3, // px, range: 1-10px
      lineOpacity: 0.7, // 0.0-1.0
    },
    focusMode: {
      enabled: false,
      boxWidth: 400, // px, min: 150, max: 800, step: 5
      boxHeight: 100, // px, min: 50, max: 250, step: 5
      overlayOpacity: 0.7, // 0.0-1.0 (darkness of surrounding area)
    },
    // OCR (Optical Character Recognition)
    ocr: {
      enabled: false, // Default OFF - requires user activation
      autoActivateReadingMode: true,
      filterNoise: true,
      upscaleFactor: 1.5,
      offlineAccuracy: false, // Opt-in image preprocessing (changes recognition output)
      autoTTS: false, // Read the result aloud unprompted: opt-in, it can talk over a screen reader
    },
    // Maths Support tools — opt-in accommodation set for dyscalculic students
    maths: {
      enabled: false, // Master toggle
      calculator: true, // Floating calculator + scratchpad (when enabled)
      numberFormat: false, // Group large numbers + screen-reader-correct labels
      placeValue: false, // Colour place-value groups when formatting
    },
    // Citation manager — default ON and visible from 1.0.
    citation: {
      enabled: true,
    },
    // Sprint 4 Features
    canvasIntegration: {
      enabled: true, // Default ON from 1.0
      assignmentReader: true, // Auto-reader for Canvas assignments
      quizHelper: {
        enabled: false,
        readAnswers: true, // Read the answer options after the question
        autoRead: false, // Read each question on arrival by keyboard navigation
        highlightQuestion: true,
        highlightColor: '#4A90E2',
        keyboardNavigation: true,
      },
      keyboardNav: false, // Future: Keyboard navigation enhancements
    },
    // Sprint 9 Features - Multi-Platform LMS Support
    moodleIntegration: {
      enabled: true, // Default ON from 1.0
      assignmentReader: true, // Auto-reader for Moodle assignments
      forumReader: true, // Read forum posts
      pageReader: true, // Read page resources
      quizHelper: false, // Future: Quiz content extraction
    },
    googleClassroomIntegration: {
      enabled: true, // Default ON from 1.0
      assignmentReader: true, // Auto-reader for Google Classroom assignments
      streamReader: true, // Read stream posts/announcements
      classworkReader: true, // Read classwork items
    },
    // Popup section visibility — LMS + Citations surface by default from 1.0.
    ui_visibility: {
      show_citations: true,
      show_canvas_integration: true,
      show_moodle_integration: true,
      show_google_classroom_integration: true,
    },
  };

  /**
   * Initialize default settings on first install
   */
  static async initializeDefaults() {
    try {
      const existing = await chrome.storage.local.get(this.STORAGE_KEYS.SETTINGS);

      if (!existing[this.STORAGE_KEYS.SETTINGS]) {
        await chrome.storage.local.set({
          [this.STORAGE_KEYS.SETTINGS]: this.withDefaults(null),
        });

        console.log('[Storage] Default settings initialized');
      }

      return this.withDefaults(null);
    } catch (error) {
      console.error('[Storage] Failed to initialize defaults:', error);
      throw error;
    }
  }

  /**
   * Every setting the student has, with every branch present.
   *
   * The stored object is whatever the version that wrote it happened to know about, so an install
   * upgraded from 0.9.3 has no `maths`, `citation` or `ui_visibility` branch at all. Readers in the
   * popup dereference those branches, and an undefined one there took the whole popup down with it
   * — every control on screen and none of them working. Merging the stored object over the defaults
   * closes that off at the source. An added branch is exactly what the merge supplies; a value whose
   * shape changed is not, and is upgraded first — see upgradeStored().
   */
  static async getSettings() {
    try {
      const result = await chrome.storage.local.get(this.STORAGE_KEYS.SETTINGS);
      return this.withDefaults(result[this.STORAGE_KEYS.SETTINGS]);
    } catch (error) {
      console.error('[Storage] Failed to get settings:', error);
      return this.withDefaults(null);
    }
  }

  /**
   * Merges a stored settings object over the defaults, deeply.
   *
   * The stored value always wins where it has one, including `false` and `0` — those are choices a
   * student made, not gaps. Only a genuinely absent key takes the default. Branches the defaults do
   * not describe (appearance, annotations, the AI keys) are carried through untouched, and arrays
   * and other non-plain values replace rather than merge, so a saved list is never spliced together
   * with a default one.
   *
   * @param {*} stored value read out of chrome.storage, of any shape
   * @returns {Object} a fresh object safe for the caller to mutate
   */
  static withDefaults(stored) {
    return deepMerge(this.DEFAULT_SETTINGS, upgradeStored(isPlainObject(stored) ? stored : {}));
  }

  /**
   * Update specific setting at a dotted path.
   *
   * The merge and the write belong to the shared settings writer, which re-reads immediately before
   * it writes: two realms store settings here, and a copy of this merge in every caller is how one
   * realm's write comes to discard another's. It also creates the branches a path needs, which the
   * merge that used to live here did not.
   */
  static async updateSetting(path, value) {
    try {
      await applySettingWrites([{ path, value }]);
      console.log('[Storage] Setting updated:', path);
      return this.getSettings();
    } catch (error) {
      console.error('[Storage] Failed to update setting:', error);
      throw error;
    }
  }

  /**
   * Reset to defaults
   */
  static async resetToDefaults() {
    try {
      const defaults = this.withDefaults(null);
      await chrome.storage.local.set({
        [this.STORAGE_KEYS.SETTINGS]: defaults,
      });

      console.log('[Storage] Settings reset to defaults');
      return defaults;
    } catch (error) {
      console.error('[Storage] Failed to reset settings:', error);
      throw error;
    }
  }
}
