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
    chrome.storage.local.get.mockImplementation((keys) => {
      return Promise.resolve({});
    });

    chrome.storage.local.set.mockImplementation((items) => {
      return Promise.resolve();
    });
  });

  describe('Constants and Defaults', () => {
    test('should have correct storage keys', () => {
      expect(StorageManager.STORAGE_KEYS.SETTINGS).toBe('assist_settings');
      expect(StorageManager.STORAGE_KEYS.USER_PROFILE).toBe('assist_user_profile');
      expect(StorageManager.STORAGE_KEYS.LAST_SYNC).toBe('assist_last_sync');
    });

    test('should have comprehensive default settings', () => {
      const defaults = StorageManager.DEFAULT_SETTINGS;

      expect(defaults).toHaveProperty('tts');
      expect(defaults).toHaveProperty('stt');
      expect(defaults).toHaveProperty('waiAdapt');
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
  });

  describe('initializeDefaults()', () => {
    test('should initialize defaults when no settings exist', async () => {
      chrome.storage.local.get.mockResolvedValue({});

      const result = await StorageManager.initializeDefaults();

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        assist_settings: StorageManager.DEFAULT_SETTINGS,
        assist_last_sync: expect.any(Number)
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

    test('should set last sync timestamp', async () => {
      chrome.storage.local.get.mockResolvedValue({});
      const beforeTime = Date.now();

      await StorageManager.initializeDefaults();

      const setCall = chrome.storage.local.set.mock.calls[0][0];
      expect(setCall.assist_last_sync).toBeGreaterThanOrEqual(beforeTime);
      expect(setCall.assist_last_sync).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('getSettings()', () => {
    test('should retrieve stored settings', async () => {
      const mockSettings = { tts: { enabled: true, voice: 'Test Voice' } };
      chrome.storage.local.get.mockResolvedValue({
        assist_settings: mockSettings
      });

      const result = await StorageManager.getSettings();

      expect(chrome.storage.local.get).toHaveBeenCalledWith('assist_settings');
      expect(result).toEqual(mockSettings);
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
      const currentSettings = { ...StorageManager.DEFAULT_SETTINGS };
      chrome.storage.local.get.mockResolvedValue({
        assist_settings: currentSettings
      });

      await StorageManager.updateSetting('tts.enabled', true);

      const setCall = chrome.storage.local.set.mock.calls[0][0];
      expect(setCall.assist_settings.tts.enabled).toBe(true);
      expect(setCall.assist_last_sync).toBeDefined();
    });

    test('should update nested setting with dot notation', async () => {
      const currentSettings = { ...StorageManager.DEFAULT_SETTINGS };
      chrome.storage.local.get.mockResolvedValue({
        assist_settings: currentSettings
      });

      await StorageManager.updateSetting('textCustomization.fontFamily', 'opendyslexic');

      const setCall = chrome.storage.local.set.mock.calls[0][0];
      expect(setCall.assist_settings.textCustomization.fontFamily).toBe('opendyslexic');
    });

    test('should update deeply nested setting', async () => {
      const currentSettings = { ...StorageManager.DEFAULT_SETTINGS };
      chrome.storage.local.get.mockResolvedValue({
        assist_settings: currentSettings
      });

      await StorageManager.updateSetting('waiAdapt.textSpacing.lineHeight', 2.0);

      const setCall = chrome.storage.local.set.mock.calls[0][0];
      expect(setCall.assist_settings.waiAdapt.textSpacing.lineHeight).toBe(2.0);
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
      expect(setCall.assist_settings.stt).toEqual({ enabled: false });
    });

    test('should update last sync timestamp', async () => {
      const currentSettings = { ...StorageManager.DEFAULT_SETTINGS };
      chrome.storage.local.get.mockResolvedValue({
        assist_settings: currentSettings
      });
      const beforeTime = Date.now();

      await StorageManager.updateSetting('tts.enabled', true);

      const setCall = chrome.storage.local.set.mock.calls[0][0];
      expect(setCall.assist_last_sync).toBeGreaterThanOrEqual(beforeTime);
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

  describe('saveSettings()', () => {
    test('should save complete settings object', async () => {
      const newSettings = {
        tts: { enabled: true },
        stt: { enabled: false }
      };

      const result = await StorageManager.saveSettings(newSettings);

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        assist_settings: newSettings,
        assist_last_sync: expect.any(Number)
      });
      expect(result).toEqual(newSettings);
    });

    test('should update last sync timestamp', async () => {
      const beforeTime = Date.now();

      await StorageManager.saveSettings({ test: 'data' });

      const setCall = chrome.storage.local.set.mock.calls[0][0];
      expect(setCall.assist_last_sync).toBeGreaterThanOrEqual(beforeTime);
    });

    test('should throw error if save fails', async () => {
      chrome.storage.local.set.mockRejectedValue(new Error('Write failed'));

      await expect(StorageManager.saveSettings({}))
        .rejects.toThrow('Write failed');
    });
  });

  describe('resetToDefaults()', () => {
    test('should reset all settings to defaults', async () => {
      await StorageManager.resetToDefaults();

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        assist_settings: StorageManager.DEFAULT_SETTINGS,
        assist_last_sync: expect.any(Number)
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

  describe('exportSettings()', () => {
    test('should export settings as JSON string', async () => {
      const mockSettings = { tts: { enabled: true } };
      chrome.storage.local.get.mockResolvedValue({
        assist_settings: mockSettings
      });

      const result = await StorageManager.exportSettings();
      const parsed = JSON.parse(result);

      expect(parsed).toHaveProperty('version');
      expect(parsed).toHaveProperty('timestamp');
      expect(parsed).toHaveProperty('settings');
      expect(parsed.settings).toEqual(mockSettings);
    });

    test('should include version in export', async () => {
      chrome.storage.local.get.mockResolvedValue({
        assist_settings: StorageManager.DEFAULT_SETTINGS
      });

      const result = await StorageManager.exportSettings();
      const parsed = JSON.parse(result);

      expect(parsed.version).toBe('1.0');
    });

    test('should include ISO timestamp', async () => {
      chrome.storage.local.get.mockResolvedValue({
        assist_settings: StorageManager.DEFAULT_SETTINGS
      });

      const result = await StorageManager.exportSettings();
      const parsed = JSON.parse(result);

      expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO 8601 format
    });

    test('should format JSON with indentation', async () => {
      chrome.storage.local.get.mockResolvedValue({
        assist_settings: { test: 'data' }
      });

      const result = await StorageManager.exportSettings();

      // JSON.stringify with 2-space indent creates newlines
      expect(result).toContain('\n');
      expect(result).toContain('  ');
    });

    test('should be FERPA-compliant (no PII)', async () => {
      chrome.storage.local.get.mockResolvedValue({
        assist_settings: StorageManager.DEFAULT_SETTINGS
      });

      const result = await StorageManager.exportSettings();
      const parsed = JSON.parse(result);

      // Verify no common PII fields exist
      const jsonString = JSON.stringify(parsed).toLowerCase();
      expect(jsonString).not.toContain('name');
      expect(jsonString).not.toContain('email');
      expect(jsonString).not.toContain('student');
      expect(jsonString).not.toContain('user');
    });

    test('should return default settings if export fails to get settings', async () => {
      // getSettings() catches errors and returns defaults, so export will succeed with defaults
      chrome.storage.local.get.mockRejectedValue(new Error('Export failed'));

      const result = await StorageManager.exportSettings();
      const parsed = JSON.parse(result);

      expect(parsed.settings).toEqual(StorageManager.DEFAULT_SETTINGS);
    });
  });

  describe('importSettings()', () => {
    test('should import valid settings JSON', async () => {
      const exportData = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        settings: { tts: { enabled: true } }
      };
      const jsonString = JSON.stringify(exportData);

      const result = await StorageManager.importSettings(jsonString);

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        assist_settings: exportData.settings,
        assist_last_sync: expect.any(Number)
      });
      expect(result).toEqual(exportData.settings);
    });

    test('should reject invalid JSON format', async () => {
      const invalidJson = 'not valid json';

      await expect(StorageManager.importSettings(invalidJson))
        .rejects.toThrow();
    });

    test('should reject JSON without settings property', async () => {
      const invalidData = JSON.stringify({
        version: '1.0',
        timestamp: new Date().toISOString()
        // Missing settings property
      });

      await expect(StorageManager.importSettings(invalidData))
        .rejects.toThrow('Invalid import format');
    });

    test('should handle import with legacy version', async () => {
      const legacyData = {
        version: '0.9',
        settings: { tts: { enabled: false } }
      };

      const result = await StorageManager.importSettings(JSON.stringify(legacyData));

      expect(result).toEqual(legacyData.settings);
    });

    test('should throw error if save fails during import', async () => {
      chrome.storage.local.set.mockRejectedValue(new Error('Save failed'));
      const validData = JSON.stringify({
        settings: { test: 'data' }
      });

      await expect(StorageManager.importSettings(validData))
        .rejects.toThrow('Save failed');
    });
  });

  describe('FERPA Compliance', () => {
    test('should only use local storage, never sync storage', async () => {
      await StorageManager.getSettings();
      await StorageManager.saveSettings({});

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

      await expect(StorageManager.saveSettings({}))
        .rejects.toThrow('QuotaExceededError');
    });

    test('should handle permission errors', async () => {
      chrome.storage.local.get.mockRejectedValue(new Error('Permission denied'));

      const result = await StorageManager.getSettings();

      expect(result).toEqual(StorageManager.DEFAULT_SETTINGS);
    });
  });
});
