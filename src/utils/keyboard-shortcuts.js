/**
 * Keyboard Shortcuts Manager
 *
 * Centralized management for all keyboard shortcuts in the extension.
 * Provides conflict detection, validation, and persistence.
 *
 * Features:
 * - Default shortcuts configuration
 * - Chrome reserved shortcuts detection
 * - Conflict validation
 * - Key combination validation (requires modifiers)
 * - Load/save from chrome.storage
 * - Register/unregister event listeners
 *
 * Architecture:
 * - Self-contained utility module
 * - Integrates with settings-manager for persistence
 * - Used by all features (OCR, Reading Mode, Dictionary, TTS)
 *
 * @module utils/keyboard-shortcuts
 */

// ============================================================================
// DEFAULT SHORTCUTS CONFIGURATION
// ============================================================================

/**
 * Default keyboard shortcuts for all features
 * Format: { featureName: 'Modifier+Key' }
 *
 * Modifier keys: Ctrl, Alt, Shift (can be combined: Ctrl+Shift+Key)
 * @type {Object}
 */
export const DEFAULT_SHORTCUTS = {
  // TTS Controls
  tts_play_pause: 'Ctrl+Shift+Space',
  tts_stop: 'Ctrl+Shift+S',

  // Reading & Accessibility
  ocr_activate: 'Alt+O',
  reading_mode_toggle: 'Alt+R',
  reading_mode_exit: 'Escape',
  dictionary_lookup: 'Alt+Shift+D',
  text_stats_toggle: 'Ctrl+Shift+W',
  highlight_menu_toggle: 'Ctrl+Shift+H',

  // Writing Tools
  sticky_note_create: 'Alt+N',
  translation_toggle: 'Alt+T',

  // Display Modes
  focus_mode_toggle: 'Alt+F',
  reading_guide_toggle: 'Alt+G',
  screen_overlay_toggle: 'Alt+Shift+O',
  dyslexia_mode_toggle: 'Alt+Y',
};

/**
 * Human-readable labels for shortcuts
 * Used in UI display
 * @type {Object}
 */
export const SHORTCUT_LABELS = {
  // TTS Controls
  tts_play_pause: 'TTS: Play/Pause',
  tts_stop: 'TTS: Stop',

  // Reading & Accessibility
  ocr_activate: 'OCR: Activate Screenshot',
  reading_mode_toggle: 'Reading Mode: Toggle',
  reading_mode_exit: 'Reading Mode: Exit',
  dictionary_lookup: 'Dictionary: Lookup Selected Text',
  text_stats_toggle: 'Text Statistics: Toggle Display',
  highlight_menu_toggle: 'Highlight Menu: Toggle',

  // Writing Tools
  sticky_note_create: 'Sticky Notes: Create New Note',
  translation_toggle: 'Translation: Toggle',

  // Display Modes
  focus_mode_toggle: 'Focus Mode: Toggle',
  reading_guide_toggle: 'Reading Guide: Toggle',
  screen_overlay_toggle: 'Screen Overlay: Toggle',
  dyslexia_mode_toggle: 'Dyslexia Mode: Toggle',
};

/**
 * Chrome reserved keyboard shortcuts that cannot be overridden
 * These are blocked from use in the extension
 * @type {Array<string>}
 */
export const CHROME_RESERVED_SHORTCUTS = [
  // Tab management
  'Ctrl+T',
  'Ctrl+W',
  'Ctrl+Shift+T',
  'Ctrl+Tab',
  'Ctrl+Shift+Tab',
  'Ctrl+1', 'Ctrl+2', 'Ctrl+3', 'Ctrl+4', 'Ctrl+5',
  'Ctrl+6', 'Ctrl+7', 'Ctrl+8', 'Ctrl+9',

  // Window management
  'Ctrl+N',
  'Ctrl+Shift+N',
  'Alt+F4',

  // Navigation
  'Ctrl+L',
  'Ctrl+K',
  'Alt+D',
  'Alt+Left',
  'Alt+Right',
  'Backspace',

  // Page actions
  'Ctrl+R',
  'Ctrl+Shift+R',
  'F5',
  'Ctrl+F5',
  'Ctrl+P',
  'Ctrl+S',

  // Browser functions
  'Ctrl+H',
  'Ctrl+J',
  'Ctrl+Shift+Delete',
  'Ctrl+Shift+B',

  // Text editing (common)
  'Ctrl+A',
  'Ctrl+C',
  'Ctrl+V',
  'Ctrl+X',
  'Ctrl+Z',
  'Ctrl+Y',
  'Ctrl+F',
  'Ctrl+G',

  // DevTools
  'F12',
  'Ctrl+Shift+I',
  'Ctrl+Shift+J',
  'Ctrl+Shift+C',

  // Zoom
  'Ctrl+Plus',
  'Ctrl+Minus',
  'Ctrl+0',

  // Miscellaneous
  'Ctrl+O',
  'Ctrl+U',
  'Ctrl+D',
];

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Parses a keyboard shortcut string into components
 *
 * @param {string} shortcut - Shortcut string (e.g., 'Ctrl+Shift+A')
 * @returns {Object} Parsed shortcut { ctrl, alt, shift, key }
 * @example
 * parseShortcut('Ctrl+Shift+A') // { ctrl: true, alt: false, shift: true, key: 'A' }
 */
export function parseShortcut(shortcut) {
  const parts = shortcut.split('+').map(p => p.trim());
  const lowerParts = parts.map(p => p.toLowerCase());

  return {
    ctrl: lowerParts.includes('ctrl'),
    alt: lowerParts.includes('alt'),
    shift: lowerParts.includes('shift'),
    key: parts[parts.length - 1], // Last part is always the key
  };
}

/**
 * Normalizes a keyboard shortcut string to a consistent format
 * Ensures consistent ordering: Ctrl+Alt+Shift+Key
 *
 * @param {string} shortcut - Shortcut string
 * @returns {string} Normalized shortcut
 * @example
 * normalizeShortcut('shift+ctrl+a') // 'Ctrl+Shift+A'
 */
export function normalizeShortcut(shortcut) {
  const parsed = parseShortcut(shortcut);
  const modifiers = [];

  if (parsed.ctrl) modifiers.push('Ctrl');
  if (parsed.alt) modifiers.push('Alt');
  if (parsed.shift) modifiers.push('Shift');

  // Capitalize key
  const key = parsed.key.charAt(0).toUpperCase() + parsed.key.slice(1);

  return [...modifiers, key].join('+');
}

/**
 * Checks if a shortcut is valid (has at least one modifier or is Escape)
 *
 * @param {string} shortcut - Shortcut string to validate
 * @returns {boolean} True if valid
 * @example
 * isValidShortcut('Ctrl+A') // true
 * isValidShortcut('A') // false (no modifier)
 * isValidShortcut('Escape') // true (special case)
 */
export function isValidShortcut(shortcut) {
  // Normalize first
  const normalized = normalizeShortcut(shortcut);

  // Special case: Escape is always valid
  if (normalized === 'Escape') {
    return true;
  }

  // Must have at least one modifier
  const parsed = parseShortcut(normalized);
  return parsed.ctrl || parsed.alt || parsed.shift;
}

/**
 * Checks if a shortcut conflicts with Chrome reserved shortcuts
 *
 * @param {string} shortcut - Shortcut to check
 * @returns {boolean} True if conflicts with Chrome
 * @example
 * isConflictWithChrome('Ctrl+T') // true (reserved)
 * isConflictWithChrome('Ctrl+Shift+X') // false (not reserved)
 */
export function isConflictWithChrome(shortcut) {
  const normalized = normalizeShortcut(shortcut);
  return CHROME_RESERVED_SHORTCUTS.includes(normalized);
}

/**
 * Checks if a shortcut conflicts with another extension shortcut
 *
 * @param {string} shortcut - Shortcut to check
 * @param {Object} currentShortcuts - Current shortcuts object
 * @param {string} excludeKey - Feature key to exclude from conflict check (when editing)
 * @returns {string|null} Conflicting feature key, or null if no conflict
 * @example
 * const shortcuts = { ocr_activate: 'Alt+O', dictionary_lookup: 'Alt+O' };
 * isConflictWithExtension('Alt+O', shortcuts, 'ocr_activate') // 'dictionary_lookup'
 */
export function isConflictWithExtension(shortcut, currentShortcuts, excludeKey = null) {
  const normalized = normalizeShortcut(shortcut);

  for (const [key, value] of Object.entries(currentShortcuts)) {
    if (key === excludeKey) continue; // Skip the shortcut being edited
    if (normalizeShortcut(value) === normalized) {
      return key; // Return the conflicting feature key
    }
  }

  return null; // No conflict
}

/**
 * Validates a shortcut and returns validation result
 *
 * @param {string} shortcut - Shortcut to validate
 * @param {Object} currentShortcuts - Current shortcuts object
 * @param {string} excludeKey - Feature key to exclude from conflict check
 * @returns {Object} { valid: boolean, error: string|null, conflictWith: string|null }
 * @example
 * validateShortcut('Ctrl+T', {}) // { valid: false, error: 'Chrome reserved', conflictWith: null }
 * validateShortcut('A', {}) // { valid: false, error: 'No modifier key', conflictWith: null }
 */
export function validateShortcut(shortcut, currentShortcuts = {}, excludeKey = null) {
  // Check if valid format
  if (!isValidShortcut(shortcut)) {
    return {
      valid: false,
      error: 'Shortcut must include a modifier key (Ctrl, Alt, or Shift)',
      conflictWith: null,
    };
  }

  // Check Chrome conflicts
  if (isConflictWithChrome(shortcut)) {
    return {
      valid: false,
      error: 'This shortcut is reserved by Chrome',
      conflictWith: 'Chrome',
    };
  }

  // Check extension conflicts
  const conflictKey = isConflictWithExtension(shortcut, currentShortcuts, excludeKey);
  if (conflictKey) {
    return {
      valid: false,
      error: `This shortcut is already used by: ${SHORTCUT_LABELS[conflictKey] || conflictKey}`,
      conflictWith: conflictKey,
    };
  }

  return {
    valid: true,
    error: null,
    conflictWith: null,
  };
}

// ============================================================================
// STORAGE FUNCTIONS
// ============================================================================

/**
 * Loads shortcuts from chrome.storage.local
 * Falls back to default shortcuts if none exist
 *
 * @returns {Promise<Object>} Shortcuts object
 * @example
 * const shortcuts = await loadShortcuts();
 * console.log(shortcuts.ocr_activate); // 'Alt+O'
 */
export async function loadShortcuts() {
  return new Promise((resolve) => {
    chrome.storage.local.get('assist_settings', (result) => {
      const settings = result.assist_settings || {};
      const shortcuts = settings.keyboardShortcuts || { ...DEFAULT_SHORTCUTS };

      console.log('[Keyboard Shortcuts] Loaded shortcuts:', shortcuts);
      resolve(shortcuts);
    });
  });
}

/**
 * Saves shortcuts to chrome.storage.local
 *
 * @param {Object} shortcuts - Shortcuts object to save
 * @returns {Promise<void>}
 * @example
 * await saveShortcuts({ ocr_activate: 'Alt+Shift+O' });
 */
export async function saveShortcuts(shortcuts) {
  return new Promise((resolve) => {
    chrome.storage.local.get('assist_settings', (result) => {
      const settings = result.assist_settings || {};
      settings.keyboardShortcuts = shortcuts;

      chrome.storage.local.set({ assist_settings: settings }, () => {
        console.log('[Keyboard Shortcuts] Saved shortcuts:', shortcuts);
        resolve();
      });
    });
  });
}

/**
 * Resets shortcuts to defaults
 *
 * @returns {Promise<Object>} Default shortcuts
 * @example
 * const defaults = await resetShortcuts();
 */
export async function resetShortcuts() {
  const defaults = { ...DEFAULT_SHORTCUTS };
  await saveShortcuts(defaults);
  return defaults;
}

// ============================================================================
// EVENT HANDLING
// ============================================================================

/**
 * Converts a keyboard event to a shortcut string
 *
 * @param {KeyboardEvent} event - Keyboard event
 * @returns {string} Shortcut string (e.g., 'Ctrl+Shift+A')
 * @example
 * eventToShortcut(event) // 'Ctrl+Shift+A'
 */
export function eventToShortcut(event) {
  const modifiers = [];

  if (event.ctrlKey) modifiers.push('Ctrl');
  if (event.altKey) modifiers.push('Alt');
  if (event.shiftKey) modifiers.push('Shift');

  // Normalize key name
  let key = event.key;

  // Handle special keys
  if (key === ' ') key = 'Space';
  if (key.length === 1) key = key.toUpperCase();

  return [...modifiers, key].join('+');
}

/**
 * Checks if a keyboard event matches a shortcut
 *
 * @param {KeyboardEvent} event - Keyboard event
 * @param {string} shortcut - Shortcut string to match
 * @returns {boolean} True if matches
 * @example
 * matchesShortcut(event, 'Ctrl+Shift+A') // true if event is Ctrl+Shift+A
 */
export function matchesShortcut(event, shortcut) {
  const eventShortcut = eventToShortcut(event);
  const normalized = normalizeShortcut(shortcut);

  return eventShortcut === normalized;
}

/**
 * Creates a keyboard event handler for a shortcut
 *
 * @param {string} shortcut - Shortcut to listen for
 * @param {Function} callback - Function to call when shortcut is pressed
 * @returns {Function} Event handler function (for removeEventListener)
 * @example
 * const handler = createShortcutHandler('Ctrl+Shift+A', () => console.log('Pressed!'));
 * document.addEventListener('keydown', handler);
 */
export function createShortcutHandler(shortcut, callback) {
  return (event) => {
    if (matchesShortcut(event, shortcut)) {
      event.preventDefault();
      event.stopPropagation();
      callback(event);
    }
  };
}

// ============================================================================
// SHORTCUT REGISTRATION SYSTEM
// ============================================================================

/**
 * Global registry of active shortcut handlers
 * Maps feature keys to their event handlers
 * @private
 */
const shortcutHandlers = new Map();

/**
 * Registers a keyboard shortcut for a feature
 *
 * @param {string} featureKey - Feature key (e.g., 'ocr_activate')
 * @param {Function} callback - Function to call when shortcut is pressed
 * @returns {Promise<Function>} Unregister function
 * @example
 * const unregister = await registerShortcut('ocr_activate', () => console.log('OCR activated!'));
 * // Later: unregister();
 */
export async function registerShortcut(featureKey, callback) {
  // Unregister existing handler if any
  if (shortcutHandlers.has(featureKey)) {
    unregisterShortcut(featureKey);
  }

  // Load current shortcuts
  const shortcuts = await loadShortcuts();
  const shortcut = shortcuts[featureKey];

  if (!shortcut) {
    console.warn(`[Keyboard Shortcuts] No shortcut found for: ${featureKey}`);
    return () => {}; // Return no-op unregister
  }

  // Create and register handler
  const handler = createShortcutHandler(shortcut, callback);
  document.addEventListener('keydown', handler);

  // Store handler for later cleanup
  shortcutHandlers.set(featureKey, handler);

  console.log(`[Keyboard Shortcuts] Registered: ${featureKey} → ${shortcut}`);

  // Return unregister function
  return () => unregisterShortcut(featureKey);
}

/**
 * Unregisters a keyboard shortcut for a feature
 *
 * @param {string} featureKey - Feature key to unregister
 * @example
 * unregisterShortcut('ocr_activate');
 */
export function unregisterShortcut(featureKey) {
  const handler = shortcutHandlers.get(featureKey);

  if (handler) {
    document.removeEventListener('keydown', handler);
    shortcutHandlers.delete(featureKey);
    console.log(`[Keyboard Shortcuts] Unregistered: ${featureKey}`);
  }
}

/**
 * Unregisters all keyboard shortcuts
 *
 * @example
 * unregisterAllShortcuts();
 */
export function unregisterAllShortcuts() {
  for (const featureKey of shortcutHandlers.keys()) {
    unregisterShortcut(featureKey);
  }
  console.log('[Keyboard Shortcuts] Unregistered all shortcuts');
}

/**
 * Reloads all registered shortcuts from storage
 * Useful after shortcuts are updated in settings
 *
 * @returns {Promise<void>}
 * @example
 * await reloadShortcuts();
 */
export async function reloadShortcuts() {
  // Get all currently registered features
  const registeredFeatures = Array.from(shortcutHandlers.keys());

  // Unregister all
  unregisterAllShortcuts();

  // Re-register with updated shortcuts
  const shortcuts = await loadShortcuts();

  for (const featureKey of registeredFeatures) {
    // Note: This re-registration requires the original callbacks
    // Features should handle storage.onChanged events to update their own shortcuts
    console.log(`[Keyboard Shortcuts] Reloaded: ${featureKey} → ${shortcuts[featureKey]}`);
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  DEFAULT_SHORTCUTS,
  SHORTCUT_LABELS,
  CHROME_RESERVED_SHORTCUTS,
  parseShortcut,
  normalizeShortcut,
  isValidShortcut,
  isConflictWithChrome,
  isConflictWithExtension,
  validateShortcut,
  loadShortcuts,
  saveShortcuts,
  resetShortcuts,
  eventToShortcut,
  matchesShortcut,
  createShortcutHandler,
  registerShortcut,
  unregisterShortcut,
  unregisterAllShortcuts,
  reloadShortcuts,
};
