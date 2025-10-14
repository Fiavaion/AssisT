/**
 * Storage Utilities
 * Centralized storage access for all features
 */

/**
 * Get all settings from chrome.storage
 * @returns {Promise<Object>} Settings object
 */
export async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get('assist_settings', (result) => {
      resolve(result.assist_settings || {});
    });
  });
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
  return new Promise((resolve) => {
    chrome.storage.local.set({ assist_settings: settings }, resolve);
  });
}

/**
 * Save complete settings object
 * @param {Object} settings - Complete settings object
 * @returns {Promise<void>}
 */
export async function saveSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ assist_settings: settings }, resolve);
  });
}

/**
 * Listen for settings changes
 * @param {Function} callback - Callback function to handle changes
 */
export function onSettingsChange(callback) {
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.assist_settings) {
      callback(changes.assist_settings.newValue || {});
    }
  });
}
