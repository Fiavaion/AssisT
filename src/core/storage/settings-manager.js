/**
 * Settings Manager Module
 *
 * Centralized management for all extension settings using Chrome's storage API.
 * Implements a pub/sub pattern for reactive settings changes.
 *
 * Handles storage interactions with chrome.storage.sync and emits events
 * whenever settings are modified, allowing other modules to react to changes
 * without tight coupling.
 *
 * @module core/storage/settings-manager
 */

/**
 * Default settings structure for all features
 * @type {Object}
 * @private
 */
const DEFAULT_SETTINGS = {
  tts: {
    enabled: false,
    highlightEnabled: true,
    highlightColor: '#FFEB3B',
    highlightOpacity: 0.7,
    wordByWordEnabled: false,
    rate: 1.0,
    pitch: 1.0,
    volume: 1.0,
    voice: null, // Voice name or null for default
  },
  stt: {
    enabled: false,
  },
  ocr: {
    autoActivateReadingMode: true, // Automatically activate reading mode before OCR capture
    filterNoise: true, // Remove cookie notices, social embeds, ads, and UI clutter from OCR text
  },
  waiAdapt: {
    textSpacing: false,
    focusMode: {
      enabled: false,
    },
    numericSimplification: false,
  },
  textCustomization: {
    fontFamily: 'default',
    fontSize: '16px',
    lineSpacing: 1.5,
    letterSpacing: 0,
  },
};

/**
 * SettingsManager class
 *
 * Provides centralized access to extension settings with support for:
 * - Getting and updating settings
 * - Persisting to Chrome storage
 * - Event-based notifications on changes
 * - Pub/sub pattern for reactive updates
 *
 * @class
 */
class SettingsManager {
  /**
   * Create a new SettingsManager instance
   * @constructor
   */
  constructor() {
    /** @private @type {Object} Current in-memory cache of settings */
    this.currentSettings = { ...DEFAULT_SETTINGS };

    /** @private @type {Map<string, Set<Function>>} Event listeners map */
    this.listeners = new Map();

    /** @private @type {number|null} Debounce timer for storage saves */
    this.saveDebounceTimer = null;

    /** @private @type {number} Debounce delay in milliseconds */
    this.DEBOUNCE_DELAY = 300;

    // Initialize listeners for storage changes from other tabs/windows
    this.initStorageListener();
  }

  /**
   * Initialize the storage change listener
   * Listens for changes from other tabs/windows and updates local cache
   *
   * @private
   */
  initStorageListener() {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'sync' && changes.assist_settings) {
        // Update cache with new values from storage
        this.currentSettings = { ...changes.assist_settings.newValue };
        // Notify all listeners of the change
        this.emit('settingsChanged', {
          newSettings: this.currentSettings,
          changes: changes.assist_settings,
        });
      }
    });
  }

  /**
   * Load settings from Chrome storage
   * Falls back to default settings if none exist
   *
   * @returns {Promise<Object>} Loaded settings object
   * @example
   * const settings = await settingsManager.loadSettings();
   * console.log(settings.tts.enabled);
   */
  async loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.sync.get('assist_settings', (result) => {
        if (result.assist_settings) {
          this.currentSettings = this.mergeSettings(
            DEFAULT_SETTINGS,
            result.assist_settings
          );
        } else {
          this.currentSettings = { ...DEFAULT_SETTINGS };
        }
        resolve(this.currentSettings);
      });
    });
  }

  /**
   * Get current settings (cached in memory)
   * Does NOT hit storage - use loadSettings() for fresh data from storage
   *
   * @returns {Object} Current settings object
   * @example
   * const settings = settingsManager.getSettings();
   * console.log(settings.tts.rate);
   */
  getSettings() {
    return { ...this.currentSettings };
  }

  /**
   * Get a specific feature's settings by path
   *
   * @param {string} path - Dot-separated path (e.g., 'tts.highlightColor')
   * @returns {*} The value at the specified path, or undefined
   * @example
   * const highlightColor = settingsManager.getSetting('tts.highlightColor');
   * const enabled = settingsManager.getSetting('tts.enabled');
   */
  getSetting(path) {
    return path.split('.').reduce((obj, key) => obj?.[key], this.currentSettings);
  }

  /**
   * Update settings and persist to Chrome storage
   * Implements debouncing to prevent excessive storage writes
   *
   * @param {Object} updatedSettings - Settings object or partial update
   * @param {boolean} [merge=true] - Whether to merge with existing settings
   * @returns {Promise<Object>} Updated settings after storage write
   * @example
   * await settingsManager.updateSettings({ tts: { enabled: true } });
   * await settingsManager.updateSettings({ tts: { rate: 1.5 } });
   */
  async updateSettings(updatedSettings, merge = true) {
    // Update in-memory cache
    if (merge) {
      this.currentSettings = this.mergeSettings(
        this.currentSettings,
        updatedSettings
      );
    } else {
      this.currentSettings = updatedSettings;
    }

    // Emit immediate notification (optimistic update)
    this.emit('settingsChanged', {
      newSettings: this.currentSettings,
      changes: updatedSettings,
    });

    // Debounce storage write
    return new Promise((resolve) => {
      clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = setTimeout(() => {
        chrome.storage.sync.set({ assist_settings: this.currentSettings }, () => {
          resolve(this.currentSettings);
        });
      }, this.DEBOUNCE_DELAY);
    });
  }

  /**
   * Update a specific setting by path
   * Useful for single setting updates without affecting others
   *
   * @param {string} path - Dot-separated path (e.g., 'tts.rate')
   * @param {*} value - The new value
   * @returns {Promise<Object>} Updated settings after storage write
   * @example
   * await settingsManager.updateSetting('tts.rate', 1.5);
   * await settingsManager.updateSetting('tts.highlightColor', '#FF0000');
   */
  async updateSetting(path, value) {
    const keys = path.split('.');
    const update = {};
    let current = update;

    // Build nested object from path
    for (let i = 0; i < keys.length - 1; i++) {
      current[keys[i]] = {};
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;

    return this.updateSettings(update, true);
  }

  /**
   * Reset all settings to defaults
   *
   * @returns {Promise<Object>} Reset settings
   * @example
   * await settingsManager.resetSettings();
   */
  async resetSettings() {
    this.currentSettings = { ...DEFAULT_SETTINGS };
    return new Promise((resolve) => {
      chrome.storage.sync.set({ assist_settings: this.currentSettings }, () => {
        resolve(this.currentSettings);
      });
    });
  }

  /**
   * Clear all settings from storage (complete wipe)
   *
   * @returns {Promise<void>}
   * @example
   * await settingsManager.clearStorage();
   */
  async clearStorage() {
    return new Promise((resolve) => {
      chrome.storage.sync.remove('assist_settings', () => {
        this.currentSettings = { ...DEFAULT_SETTINGS };
        resolve();
      });
    });
  }

  /**
   * Register a listener for settings changes
   * Listener will be called with { newSettings, changes } object
   *
   * @param {string} event - Event name (e.g., 'settingsChanged')
   * @param {Function} callback - Function to call on event
   * @returns {Function} Unsubscribe function
   * @example
   * const unsubscribe = settingsManager.on('settingsChanged', (data) => {
   *   console.log('Settings changed:', data.newSettings);
   * });
   *
   * // Later, unsubscribe
   * unsubscribe();
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.get(event).delete(callback);
    };
  }

  /**
   * Remove a specific listener
   *
   * @param {string} event - Event name
   * @param {Function} callback - Callback function to remove
   * @returns {void}
   * @example
   * settingsManager.off('settingsChanged', myCallback);
   */
  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  /**
   * Emit an event to all registered listeners
   *
   * @private
   * @param {string} event - Event name
   * @param {*} data - Data to pass to listeners
   * @returns {void}
   */
  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach((callback) => {
        try {
          callback(data);
        } catch (err) {
          console.error(`[SettingsManager] Error in ${event} listener:`, err);
        }
      });
    }
  }

  /**
   * Deep merge settings objects
   * Later values override earlier values
   *
   * @private
   * @param {Object} target - Target object
   * @param {Object} source - Source object to merge in
   * @returns {Object} Merged object
   */
  mergeSettings(target, source) {
    const result = { ...target };

    Object.keys(source).forEach((key) => {
      if (
        source[key] &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key]) &&
        result[key] &&
        typeof result[key] === 'object' &&
        !Array.isArray(result[key])
      ) {
        // Recursively merge objects
        result[key] = this.mergeSettings(result[key], source[key]);
      } else {
        // Override with source value
        result[key] = source[key];
      }
    });

    return result;
  }
}

/**
 * Singleton instance of SettingsManager
 * @type {SettingsManager}
 */
const settingsManager = new SettingsManager();

export { settingsManager, SettingsManager, DEFAULT_SETTINGS };
