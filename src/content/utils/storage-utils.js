/**
 * Storage Utilities
 * Centralized storage access for all features
 *
 * This module provides a consistent API for accessing Chrome storage,
 * reducing code duplication across feature modules.
 *
 * @module storage-utils
 */

/**
 * Get all settings from chrome.storage
 * @returns {Promise<Object>} Settings object
 */
export async function getSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get('assist_settings', result => {
      resolve(result.assist_settings || {});
    });
  });
}

/**
 * Get settings for a specific feature
 * @param {string} featureKey - The feature key (e.g., 'readingGuide', 'focusMode')
 * @returns {Promise<Object|null>} Feature settings or null if not found
 */
export async function getFeatureSettings(featureKey) {
  const settings = await getSettings();
  return settings[featureKey] || null;
}

/**
 * Save a specific setting key/value pair
 * @param {string} key - Setting key
 * @param {*} value - Setting value
 * @returns {Promise<void>}
 */
export async function saveSetting(key, value) {
  const settings = await getSettings();
  settings[key] = value;
  return new Promise(resolve => {
    chrome.storage.local.set({ assist_settings: settings }, resolve);
  });
}

/**
 * Save complete settings object
 * @param {Object} settings - Complete settings object
 * @returns {Promise<void>}
 */
export async function saveSettings(settings) {
  return new Promise(resolve => {
    chrome.storage.local.set({ assist_settings: settings }, resolve);
  });
}

/**
 * Listen for settings changes
 * @param {Function} callback - Callback function receiving full settings object
 */
export function onSettingsChange(callback) {
  chrome.storage.onChanged.addListener(changes => {
    if (changes.assist_settings) {
      callback(changes.assist_settings.newValue || {});
    }
  });
}

/**
 * Listen for changes to a specific feature's settings
 * @param {string} featureKey - The feature key (e.g., 'readingGuide', 'focusMode')
 * @param {Function} callback - Callback function receiving feature settings
 * @returns {Function} Unsubscribe function to remove the listener
 */
export function onFeatureSettingsChange(featureKey, callback) {
  const listener = changes => {
    if (changes.assist_settings?.newValue?.[featureKey]) {
      callback(changes.assist_settings.newValue[featureKey]);
    }
  };

  chrome.storage.onChanged.addListener(listener);

  // Return unsubscribe function
  return () => {
    chrome.storage.onChanged.removeListener(listener);
  };
}

/**
 * Initialize a feature with settings from storage and set up change listener
 * This is the recommended pattern for feature modules.
 *
 * @param {string} featureKey - The feature key (e.g., 'readingGuide', 'focusMode')
 * @param {Object} defaultSettings - Default settings if none exist in storage
 * @param {Function} onInit - Callback when settings are first loaded
 * @param {Function} onChange - Callback when settings change
 * @returns {Function} Unsubscribe function to remove the listener
 *
 * @example
 * initFeatureSettings('readingGuide',
 *   { enabled: false, lineColor: '#000000' },
 *   (settings) => { if (settings.enabled) enable(); },
 *   (settings) => { updateFromSettings(settings); }
 * );
 */
export function initFeatureSettings(featureKey, defaultSettings, onInit, onChange) {
  // Load initial settings
  getFeatureSettings(featureKey).then(settings => {
    onInit(settings || defaultSettings);
  });

  // Set up change listener
  return onFeatureSettingsChange(featureKey, onChange);
}
