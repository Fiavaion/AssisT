/**
 * Storage Manager
 * Handles all Chrome storage API interactions with FERPA-compliant data handling
 * Stores user preferences locally for privacy
 */

export class StorageManager {
  static STORAGE_KEYS = {
    SETTINGS: 'assist_settings',
    USER_PROFILE: 'assist_user_profile',
    LAST_SYNC: 'assist_last_sync'
  };

  static DEFAULT_SETTINGS = {
    tts: {
      enabled: false,
      voice: 'default',
      rate: 1.0,
      pitch: 1.0,
      volume: 1.0,
      highlightEnabled: true,
      highlightColor: '#FFEB3B',
      autoStart: false
    },
    stt: {
      enabled: false,
      language: 'en-US',
      continuous: false,
      interimResults: true,
      maxAlternatives: 3,
      domainAdaptation: true
    },
    waiAdapt: {
      textSpacing: {
        enabled: false,
        lineHeight: 1.5,
        paragraphSpacing: 2.0,
        letterSpacing: 0.12,
        wordSpacing: 0.16
      },
      focusMode: {
        enabled: false,
        hideExtraneous: true,
        simplifyNavigation: true
      },
      numericSimplification: {
        enabled: false,
        useText: true,
        useGraphics: false
      },
      typography: {
        font: 'system',
        fontSize: 16,
        useOpenDyslexic: false
      },
      colorScheme: {
        mode: 'default',
        backgroundColor: '#FFFFFF',
        textColor: '#000000',
        contrast: 'normal'
      }
    },
    accessibility: {
      keyboardShortcuts: true,
      screenReaderOptimized: false,
      reducedMotion: false
    }
  };

  /**
   * Initialize default settings on first install
   */
  static async initializeDefaults() {
    try {
      const existing = await chrome.storage.local.get(this.STORAGE_KEYS.SETTINGS);

      if (!existing[this.STORAGE_KEYS.SETTINGS]) {
        await chrome.storage.local.set({
          [this.STORAGE_KEYS.SETTINGS]: this.DEFAULT_SETTINGS,
          [this.STORAGE_KEYS.LAST_SYNC]: Date.now()
        });

        console.log('[Storage] Default settings initialized');
      }

      return this.DEFAULT_SETTINGS;
    } catch (error) {
      console.error('[Storage] Failed to initialize defaults:', error);
      throw error;
    }
  }

  /**
   * Get all user settings
   */
  static async getSettings() {
    try {
      const result = await chrome.storage.local.get(this.STORAGE_KEYS.SETTINGS);
      return result[this.STORAGE_KEYS.SETTINGS] || this.DEFAULT_SETTINGS;
    } catch (error) {
      console.error('[Storage] Failed to get settings:', error);
      return this.DEFAULT_SETTINGS;
    }
  }

  /**
   * Update specific setting
   */
  static async updateSetting(path, value) {
    try {
      const settings = await this.getSettings();
      const keys = path.split('.');

      let current = settings;
      for (let i = 0; i < keys.length - 1; i++) {
        current = current[keys[i]];
      }
      current[keys[keys.length - 1]] = value;

      await chrome.storage.local.set({
        [this.STORAGE_KEYS.SETTINGS]: settings,
        [this.STORAGE_KEYS.LAST_SYNC]: Date.now()
      });

      console.log('[Storage] Setting updated:', path, value);
      return settings;
    } catch (error) {
      console.error('[Storage] Failed to update setting:', error);
      throw error;
    }
  }

  /**
   * Save complete settings object
   */
  static async saveSettings(settings) {
    try {
      await chrome.storage.local.set({
        [this.STORAGE_KEYS.SETTINGS]: settings,
        [this.STORAGE_KEYS.LAST_SYNC]: Date.now()
      });

      console.log('[Storage] Settings saved');
      return settings;
    } catch (error) {
      console.error('[Storage] Failed to save settings:', error);
      throw error;
    }
  }

  /**
   * Reset to defaults
   */
  static async resetToDefaults() {
    try {
      await chrome.storage.local.set({
        [this.STORAGE_KEYS.SETTINGS]: this.DEFAULT_SETTINGS,
        [this.STORAGE_KEYS.LAST_SYNC]: Date.now()
      });

      console.log('[Storage] Settings reset to defaults');
      return this.DEFAULT_SETTINGS;
    } catch (error) {
      console.error('[Storage] Failed to reset settings:', error);
      throw error;
    }
  }

  /**
   * Export settings for backup (FERPA-compliant - no PII)
   */
  static async exportSettings() {
    try {
      const settings = await this.getSettings();
      const exportData = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        settings: settings
      };

      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error('[Storage] Failed to export settings:', error);
      throw error;
    }
  }

  /**
   * Import settings from backup
   */
  static async importSettings(jsonString) {
    try {
      const importData = JSON.parse(jsonString);

      if (!importData.settings) {
        throw new Error('Invalid import format');
      }

      await this.saveSettings(importData.settings);
      console.log('[Storage] Settings imported successfully');

      return importData.settings;
    } catch (error) {
      console.error('[Storage] Failed to import settings:', error);
      throw error;
    }
  }
}
