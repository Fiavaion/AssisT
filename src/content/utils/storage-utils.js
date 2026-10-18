/**
 * Storage Utilities
 * Centralized storage access for all features
 *
 * This module provides a consistent API for accessing Chrome storage,
 * reducing code duplication across feature modules.
 *
 * @module storage-utils
 */

import { applySettingWrites } from '../../utils/setting-writes.js';

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
 * Save a specific setting key/value pair.
 *
 * The write goes through the shared writer, which re-reads and merges at write time: the popup and
 * the content script both store settings, and a whole-object write built from an earlier read
 * discards whatever the other realm stored in between. There is deliberately no whole-object save
 * here for the same reason.
 *
 * @param {string} key - Setting key, or a dotted path inside the settings object
 * @param {*} value - Setting value
 * @returns {Promise<void>}
 */
export async function saveSetting(key, value) {
  return applySettingWrites([{ path: key, value }]);
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
    // Use 'in' operator to check property existence, not truthy value
    // This ensures callback fires even if settings value is falsy (false, null, 0)
    if (changes.assist_settings?.newValue && featureKey in changes.assist_settings.newValue) {
      console.log(
        `[StorageUtils] ${featureKey} settings changed:`,
        changes.assist_settings.newValue[featureKey]
      );
      // One feature's callback throwing must not take the others' listeners down with it.
      try {
        callback(changes.assist_settings.newValue[featureKey]);
      } catch (error) {
        console.error(`[StorageUtils] ${featureKey} change handler failed:`, error);
      }
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
  // Load initial settings. About ten features call this at module top level, so a failed read — or
  // an onInit that throws — used to switch that one feature off for the whole page as an unhandled
  // rejection: no console line, and a student left with a tool that never appeared.
  getFeatureSettings(featureKey)
    .then(settings => {
      onInit(settings || defaultSettings);
    })
    .catch(error => {
      console.error(`[StorageUtils] ${featureKey} failed to initialise:`, error);
    });

  // Set up change listener
  return onFeatureSettingsChange(featureKey, onChange);
}
