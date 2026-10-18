/**
 * StorageManager Unit Tests
 * Testing FERPA-compliant Chrome storage operations
 * Following TDD: Testing actual implementation
 */

import { StorageManager } from '../../src/utils/storage-manager.js';

describe('StorageManager', () => {
  beforeEach(() => {
    // Reset chrome.storage mock before each test
    jest.clearAllMocks();

    // Setup default mock behavior
    chrome.storage.local.get.mockImplementation((_keys) => {
      return Promise.resolve({});
    });

    chrome.storage.local.set.mockImplementation((_items) => {
      return Promise.resolve();
    });
  });

  describe('Constants and Defaults', () => {
    test('should have correct storage keys', () => {
      expect(StorageManager.STORAGE_KEYS.SETTINGS).toBe('assist_settings');
    });

    test('declares no key it does not read back', () => {
      expect(Object.keys(StorageManager.STORAGE_KEYS)).toEqual(['SETTINGS']);
    });

    test('should have comprehensive default settings', () => {
      const defaults = StorageManager.DEFAULT_SETTINGS;

      expect(defaults).toHaveProperty('tts');
      expect(defaults).toHaveProperty('stt');
      expect(defaults).toHaveProperty('ocr');
      expect(defaults).toHaveProperty('accessibility');
      expect(defaults).toHaveProperty('textCustomization');
      expect(defaults).toHaveProperty('readingGuide');
      expect(defaults).toHaveProperty('focusMode');
      expect(defaults).toHaveProperty('canvasIntegration');
    });

    test('should have FERPA-compliant TTS defaults', () => {
      const tts = StorageManager.DEFAULT_SETTINGS.tts;

      expect(tts.enabled).toBe(false);
      expect(tts.voice).toBe('default');
      expect(tts.rate).toBe(1.0);
      expect(tts.pitch).toBe(1.0);
      expect(tts.volume).toBe(1.0);
      expect(tts.highlightEnabled).toBe(true);
    });

    test('should have WCAG-compliant text spacing defaults', () => {
      const spacing = StorageManager.DEFAULT_SETTINGS.textCustomization;

      expect(spacing.lineSpacing).toBeGreaterThanOrEqual(1.5); // WCAG min
      expect(spacing.letterSpacing).toBeGreaterThanOrEqual(0.12); // WCAG min
      expect(spacing.wordSpacing).toBeGreaterThanOrEqual(0.16); // WCAG min
      expect(spacing.paragraphSpacing).toBeGreaterThanOrEqual(2.0); // WCAG min
    });

    test('declares the Canvas quiz helper in the shape canvas.js and the popup read, and off', () => {
      expect(StorageManager.DEFAULT_SETTINGS.canvasIntegration.quizHelper).toEqual({
        enabled: false,
        readAnswers: true,
        autoRead: false,
        highlightQuestion: true,
        highlightColor: '#4A90E2',
        keyboardNavigation: true,
      });
    });

    test('declares the speech-to-text vocabulary branch the popup reads', () => {
      expect(StorageManager.DEFAULT_SETTINGS.stt.vocabulary).toEqual({
        autoLearn: true,
        enabledPresets: [],
        customWords: [],
      });
    });
  });

  describe('a Canvas quiz helper stored by an older version', () => {
    // Before the quiz helper had options it was stored as a bare boolean. The merge alone would keep
    // that boolean over the declared object, and every reader of quizHelper.<option> would get
    // undefined, so withDefaults() upgrades it first.
    test('a stored false becomes the declared object, still off', () => {
      const settings = StorageManager.withDefaults({ canvasIntegration: { quizHelper: false } });

      expect(settings.canvasIntegration.quizHelper).toEqual(
        StorageManager.DEFAULT_SETTINGS.canvasIntegration.quizHelper
      );
      expect(settings.canvasIntegration.quizHelper.enabled).toBe(false);
    });

    test('a stored true keeps the student’s choice: on, with the declared options', () => {
      const settings = StorageManager.withDefaults({ canvasIntegration: { quizHelper: true } });

      expect(settings.canvasIntegration.quizHelper).toEqual({
        ...StorageManager.DEFAULT_SETTINGS.canvasIntegration.quizHelper,
        enabled: true,
      });
    });

    test('the stored object handed in is left as it was', () => {
      const stored = { canvasIntegration: { enabled: true, quizHelper: false } };

      StorageManager.withDefaults(stored);

      expect(stored).toEqual({ canvasIntegration: { enabled: true, quizHelper: false } });
    });
  });

  describe('initializeDefaults()', () => {
    test('should initialize defaults when no settings exist', async () => {
      chrome.storage.local.get.mockResolvedValue({});

      const result = await StorageManager.initializeDefaults();

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        assist_settings: StorageManager.DEFAULT_SETTINGS
      });
      expect(result).toEqual(StorageManager.DEFAULT_SETTINGS);
    });

    test('should not overwrite existing settings', async () => {
      const existingSettings = { tts: { enabled: true } };
      chrome.storage.local.get.mockResolvedValue({
        assist_settings: existingSettings
      });

      const result = await StorageManager.initializeDefaults();

      expect(chrome.storage.local.set).not.toHaveBeenCalled();
      expect(result).toEqual(StorageManager.DEFAULT_SETTINGS);
    });

    test('should handle initialization errors gracefully', async () => {
      chrome.storage.local.get.mockRejectedValue(new Error('Storage error'));

      await expect(StorageManager.initializeDefaults()).rejects.toThrow('Storage error');
    });

    test('writes the settings key and nothing else', async () => {
      chrome.storage.local.get.mockResolvedValue({});

      await StorageManager.initializeDefaults();

      expect(Object.keys(chrome.storage.local.set.mock.calls[0][0])).toEqual(['assist_settings']);
    });
  });

  describe('getSettings()', () => {
    test('should retrieve stored settings', async () => {
      chrome.storage.local.get.mockResolvedValue({
        assist_settings: { tts: { enabled: true, voice: 'Test Voice' } }
      });

      const result = await StorageManager.getSettings();

      expect(chrome.storage.local.get).toHaveBeenCalledWith('assist_settings');
      expect(result.tts.enabled).toBe(true);
      expect(result.tts.voice).toBe('Test Voice');
    });

    test('should return defaults if no settings found', async () => {
      chrome.storage.local.get.mockResolvedValue({});

      const result = await StorageManager.getSettings();

      expect(result).toEqual(StorageManager.DEFAULT_SETTINGS);
    });

    test('should handle storage errors and return defaults', async () => {
      chrome.storage.local.get.mockRejectedValue(new Error('Access denied'));

      const result = await StorageManager.getSettings();

      expect(result).toEqual(StorageManager.DEFAULT_SETTINGS);
    });
  });

  describe('updateSetting()', () => {
    test('should update top-level setting', async () => {
      const currentSettings = structuredClone(StorageManager.DEFAULT_SETTINGS);
      chrome.storage.local.get.mockResolvedValue({
        assist_settings: currentSettings
      });

      await StorageManager.updateSetting('tts.enabled', true);

      const setCall = chrome.storage.local.set.mock.calls[0][0];
      expect(setCall.assist_settings.tts.enabled).toBe(true);
    });

    test('should update nested setting with dot notation', async () => {
      const currentSettings = structuredClone(StorageManager.DEFAULT_SETTINGS);
      chrome.storage.local.get.mockResolvedValue({
        assist_settings: currentSettings
      });

      await StorageManager.updateSetting('textCustomization.fontFamily', 'opendyslexic');

      const setCall = chrome.storage.local.set.mock.calls[0][0];
      expect(setCall.assist_settings.textCustomization.fontFamily).toBe('opendyslexic');
    });

    test('should update deeply nested setting', async () => {
      const currentSettings = structuredClone(StorageManager.DEFAULT_SETTINGS);
      chrome.storage.local.get.mockResolvedValue({
        assist_settings: currentSettings
      });

      await StorageManager.updateSetting('stt.vocabulary.autoLearn', true);

      const setCall = chrome.storage.local.set.mock.calls[0][0];
      expect(setCall.assist_settings.stt.vocabulary.autoLearn).toBe(true);
    });

    test('should preserve other settings when updating one', async () => {
      const currentSettings = {
        tts: { enabled: false, voice: 'Test Voice', rate: 1.5 },
        stt: { enabled: false }
      };
      chrome.storage.local.get.mockResolvedValue({
        assist_settings: currentSettings
      });

      await StorageManager.updateSetting('tts.enabled', true);

      const setCall = chrome.storage.local.set.mock.calls[0][0];
      expect(setCall.assist_settings.tts.enabled).toBe(true);
      expect(setCall.assist_settings.tts.voice).toBe('Test Voice');
      expect(setCall.assist_settings.tts.rate).toBe(1.5);
      expect(setCall.assist_settings.stt.enabled).toBe(false);
    });

    test('writes only the settings key', async () => {
      chrome.storage.local.get.mockResolvedValue({
        assist_settings: structuredClone(StorageManager.DEFAULT_SETTINGS)
      });

      await StorageManager.updateSetting('tts.enabled', true);

      expect(Object.keys(chrome.storage.local.set.mock.calls[0][0])).toEqual(['assist_settings']);
    });

    test('should throw error if update fails', async () => {
      chrome.storage.local.get.mockResolvedValue({
        assist_settings: StorageManager.DEFAULT_SETTINGS
      });
      chrome.storage.local.set.mockRejectedValue(new Error('Quota exceeded'));

      await expect(StorageManager.updateSetting('tts.enabled', true))
        .rejects.toThrow('Quota exceeded');
    });
  });

  describe('resetToDefaults()', () => {
    test('should reset all settings to defaults', async () => {
      await StorageManager.resetToDefaults();

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        assist_settings: StorageManager.DEFAULT_SETTINGS
      });
    });

    test('should return default settings', async () => {
      const result = await StorageManager.resetToDefaults();

      expect(result).toEqual(StorageManager.DEFAULT_SETTINGS);
    });

    test('should throw error if reset fails', async () => {
      chrome.storage.local.set.mockRejectedValue(new Error('Reset failed'));

      await expect(StorageManager.resetToDefaults())
        .rejects.toThrow('Reset failed');
    });
  });

  describe('getSettings() merges over the defaults', () => {
    /**
     * What a 0.9.3 install actually has on disk: the branches that existed then, with the
     * student's own values in them, and nothing at all for maths, citation or ui_visibility.
     */
    const storedFrom093 = () => ({
      tts: {
        enabled: true,
        voice: 'Microsoft Aria Online (Natural) - English (Ireland)',
        rate: 1.35,
        pitch: 1.0,
        volume: 0.8,
        highlightEnabled: true,
        highlightColor: '#B3E5FC',
        highlightOpacity: 0.5,
        autoStart: false,
      },
      stt: { enabled: true, language: 'en-IE' },
      textCustomization: { enabled: true, fontFamily: 'opendyslexic' },
      focusMode: { enabled: true, boxWidth: 500 },
      accessibility: { keyboardShortcuts: true },
      canvasIntegration: { enabled: true, assignmentReader: true },
    });

    test('fills in every branch the stored object never had', async () => {
      chrome.storage.local.get.mockResolvedValue({ assist_settings: storedFrom093() });

      const settings = await StorageManager.getSettings();

      // The three reads that crashed the popup on an upgraded install.
      expect(settings.maths.enabled).toBe(false);
      expect(settings.citation.enabled).toBe(true);
      expect(settings.citation.verifyOnline).toBeUndefined();
      expect(settings.ui_visibility.show_citations).toBe(true);
      expect(settings.ocr.enabled).toBe(false);
      expect(settings.readingGuide.lineThickness).toBe(3);
      expect(settings.googleClassroomIntegration.enabled).toBe(true);
    });

    test('every branch of the defaults survives the merge', async () => {
      chrome.storage.local.get.mockResolvedValue({ assist_settings: storedFrom093() });

      const settings = await StorageManager.getSettings();

      for (const branch of Object.keys(StorageManager.DEFAULT_SETTINGS)) {
        expect(settings[branch]).toBeDefined();
      }
    });

    test('never overwrites a value the student set', async () => {
      chrome.storage.local.get.mockResolvedValue({ assist_settings: storedFrom093() });

      const settings = await StorageManager.getSettings();

      expect(settings.tts.rate).toBe(1.35);
      expect(settings.tts.voice).toBe('Microsoft Aria Online (Natural) - English (Ireland)');
      expect(settings.tts.volume).toBe(0.8);
      expect(settings.stt.language).toBe('en-IE');
      expect(settings.textCustomization.fontFamily).toBe('opendyslexic');
    });

    test('keeps a stored false, which a naive merge would treat as missing', async () => {
      chrome.storage.local.get.mockResolvedValue({
        assist_settings: { citation: { enabled: false }, canvasIntegration: { enabled: false } },
      });

      const settings = await StorageManager.getSettings();

      expect(settings.citation.enabled).toBe(false);
      expect(settings.canvasIntegration.enabled).toBe(false);
      // Siblings the student never touched still come from the defaults.
      expect(settings.canvasIntegration.assignmentReader).toBe(true);
    });

    test('merges the deep branches, not just the top level', async () => {
      chrome.storage.local.get.mockResolvedValue({
        assist_settings: {
          readingGuide: { lineOpacity: 0.4 },
          stt: { vocabulary: { autoLearn: false, enabledPresets: ['medical'] } },
          canvasIntegration: { quizHelper: { autoRead: true } },
        },
      });

      const settings = await StorageManager.getSettings();

      expect(settings.readingGuide.lineOpacity).toBe(0.4);
      expect(settings.readingGuide.lineThickness).toBe(3);
      expect(settings.stt.vocabulary.autoLearn).toBe(false);
      expect(settings.stt.vocabulary.enabledPresets).toEqual(['medical']);
      expect(settings.stt.vocabulary.customWords).toEqual([]);
      expect(settings.stt.language).toBe('en-US');
      // Three levels down: the stored option wins, its siblings come from the defaults.
      expect(settings.canvasIntegration.quizHelper.autoRead).toBe(true);
      expect(settings.canvasIntegration.quizHelper.highlightColor).toBe('#4A90E2');
      expect(settings.canvasIntegration.quizHelper.enabled).toBe(false);
      expect(settings.canvasIntegration.assignmentReader).toBe(true);
    });

    test('keeps branches the defaults know nothing about', async () => {
      chrome.storage.local.get.mockResolvedValue({
        assist_settings: {
          appearance: { debug_mode: true },
          annotations: { storageMode: 'sync' },
          favouriteTools: ['tts', 'citations'],
        },
      });

      const settings = await StorageManager.getSettings();

      expect(settings.appearance.debug_mode).toBe(true);
      expect(settings.annotations.storageMode).toBe('sync');
      expect(settings.favouriteTools).toEqual(['tts', 'citations']);
    });

    test('a stored array replaces the default, it is not merged into it', async () => {
      chrome.storage.local.get.mockResolvedValue({
        assist_settings: { maths: { enabled: true } },
      });

      const settings = await StorageManager.getSettings();

      expect(settings.maths).toEqual({
        enabled: true,
        calculator: true,
        numberFormat: false,
        placeValue: false,
      });
    });

    test('hands back a fresh object, so a caller cannot edit the defaults', async () => {
      chrome.storage.local.get.mockResolvedValue({ assist_settings: { tts: { rate: 2 } } });

      const settings = await StorageManager.getSettings();
      settings.tts.voice = 'mutated';
      settings.maths.enabled = true;

      expect(StorageManager.DEFAULT_SETTINGS.tts.voice).toBe('default');
      expect(StorageManager.DEFAULT_SETTINGS.maths.enabled).toBe(false);
    });

    test('a corrupt stored value falls back to the defaults', async () => {
      chrome.storage.local.get.mockResolvedValue({ assist_settings: 'not an object' });

      const settings = await StorageManager.getSettings();

      expect(settings).toEqual(StorageManager.DEFAULT_SETTINGS);
    });
  });

  describe('FERPA Compliance', () => {
    test('should only use local storage, never sync storage', async () => {
      await StorageManager.getSettings();
      await StorageManager.updateSetting('tts.enabled', true);

      expect(chrome.storage.local.get).toHaveBeenCalled();
      expect(chrome.storage.local.set).toHaveBeenCalled();
      expect(chrome.storage.sync.get).not.toHaveBeenCalled();
      expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    });

    test('default settings should not contain PII', () => {
      const settingsString = JSON.stringify(StorageManager.DEFAULT_SETTINGS).toLowerCase();

      // Check for PII fields (but not substrings like "enabled" which contains "id")
      expect(settingsString).not.toContain('"name"');
      expect(settingsString).not.toContain('"email"');
      expect(settingsString).not.toContain('"student"');
      expect(settingsString).not.toContain('"userid"');
      expect(settingsString).not.toContain('"username"');
    });
  });

  describe('Error Handling', () => {
    test('should handle quota exceeded errors', async () => {
      chrome.storage.local.set.mockRejectedValue(new Error('QuotaExceededError'));

      await expect(StorageManager.updateSetting('tts.enabled', true))
        .rejects.toThrow('QuotaExceededError');
    });

    test('should handle permission errors', async () => {
      chrome.storage.local.get.mockRejectedValue(new Error('Permission denied'));

      const result = await StorageManager.getSettings();

      expect(result).toEqual(StorageManager.DEFAULT_SETTINGS);
    });
  });
});
