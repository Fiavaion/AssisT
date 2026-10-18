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

import { applySettingWrites } from './setting-writes.js';

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
  citation_save: 'Alt+C',
  stt_dictate: 'Alt+Shift+V',

  // Study Tools
  open_mind_map: 'Alt+Shift+M',

  // Confirmation tray (Saved … Undo)
  action_tray_focus: 'Alt+Shift+U',

  // Display Modes
  focus_mode_toggle: 'Alt+F',
  reading_guide_toggle: 'Alt+G',
  screen_overlay_toggle: 'Alt+Shift+O',
  dyslexia_mode_toggle: 'Alt+Y',

  // Mind map editor (its own page, so its keys live in the 'mindmap' scope below)
  mm_undo: 'Ctrl+Z',
  mm_redo: 'Ctrl+Y',
  mm_save: 'Ctrl+S',
  mm_save_as: 'Ctrl+Shift+S',
  mm_open_map: 'Ctrl+O',
  mm_find: 'Ctrl+F',
  mm_focus_branch: 'Alt+Shift+F',
  mm_move_node: 'Alt+M',
  mm_read_aloud: 'Alt+R',
  mm_shortcuts_help: 'Ctrl+/',
  mm_select_siblings: 'Ctrl+A',
  mm_rename: 'F2',
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
  citation_save: 'Citations: Save Selected Text',
  stt_dictate: 'Voice Typing: Start/Stop Dictation',

  // Study Tools
  open_mind_map: 'Open Mind Maps',

  // Confirmation tray (Saved … Undo)
  action_tray_focus: 'Saved tray: Move focus to Undo',

  // Display Modes
  focus_mode_toggle: 'Focus Mode: Toggle',
  reading_guide_toggle: 'Reading Guide: Toggle',
  screen_overlay_toggle: 'Screen Overlay: Toggle',
  dyslexia_mode_toggle: 'Dyslexia Mode: Toggle',

  // Mind map editor
  mm_undo: 'Mind map: Undo the last change',
  mm_redo: 'Mind map: Redo',
  mm_save: 'Mind map: Save now',
  mm_save_as: 'Mind map: Save a copy under a new name',
  mm_open_map: 'Mind map: Open another map',
  mm_find: 'Mind map: Search this map',
  mm_focus_branch: 'Mind map: Show just the branch you are on',
  mm_move_node: 'Mind map: Move this node somewhere else',
  mm_read_aloud: 'Mind map: Read the map aloud',
  mm_shortcuts_help: 'Mind map: Open the keyboard shortcuts list',
  mm_select_siblings: 'Mind map: Select this node and its siblings',
  mm_rename: 'Mind map: Edit the node text',
};

/** Shortcuts that fire on a page the student is browsing, through the content script. */
export const PAGE_SCOPE = 'page';

/** Shortcuts that fire only inside the mind map editor, which is an extension page of its own. */
export const MIND_MAP_SCOPE = 'mindmap';

/**
 * Which surface each shortcut belongs to.
 *
 * Two shortcuts only collide if they can be pressed in the same place. A content script never runs
 * on a `chrome-extension://` page, so the mind map editor can keep the keys an editor is expected to
 * have — Ctrl+S, Ctrl+Z, Ctrl+F — without fighting the reading tools, and the settings grid must not
 * flag them as clashes. Anything not named here is a page shortcut.
 *
 * @type {Readonly<Object<string, string>>}
 */
export const SHORTCUT_SCOPES = Object.freeze({
  mm_undo: MIND_MAP_SCOPE,
  mm_redo: MIND_MAP_SCOPE,
  mm_save: MIND_MAP_SCOPE,
  mm_save_as: MIND_MAP_SCOPE,
  mm_open_map: MIND_MAP_SCOPE,
  mm_find: MIND_MAP_SCOPE,
  mm_focus_branch: MIND_MAP_SCOPE,
  mm_move_node: MIND_MAP_SCOPE,
  mm_read_aloud: MIND_MAP_SCOPE,
  mm_shortcuts_help: MIND_MAP_SCOPE,
  mm_select_siblings: MIND_MAP_SCOPE,
  mm_rename: MIND_MAP_SCOPE,
});

/**
 * The surface a shortcut belongs to.
 *
 * @param {string} featureKey
 * @returns {string} PAGE_SCOPE or MIND_MAP_SCOPE
 */
export function scopeOf(featureKey) {
  return SHORTCUT_SCOPES[featureKey] || PAGE_SCOPE;
}

/**
 * Every registry key in one scope, in registry order.
 *
 * @param {string} scope
 * @returns {string[]}
 */
export function shortcutKeysInScope(scope) {
  return Object.keys(DEFAULT_SHORTCUTS).filter(key => scopeOf(key) === scope);
}

/**
 * The chords the browser and the operating system keep for themselves.
 *
 * A focused page can claim Ctrl+S or Ctrl+Z by preventing the default — which is exactly what every
 * text editor on the web does, and what the mind map editor does. It cannot claim these: the
 * keystroke never reaches the document, so offering one as a binding would offer a key that can
 * never fire. This is the floor for every scope; the page scope adds the wider
 * CHROME_RESERVED_SHORTCUTS list on top, because a shortcut that fights Ctrl+C on somebody's
 * coursework is a bad shortcut even though it would technically work.
 *
 * @type {ReadonlyArray<string>}
 */
export const BROWSER_OWNED_SHORTCUTS = Object.freeze([
  'Ctrl+T',
  'Ctrl+W',
  'Ctrl+Shift+T',
  'Ctrl+Tab',
  'Ctrl+Shift+Tab',
  'Ctrl+1',
  'Ctrl+2',
  'Ctrl+3',
  'Ctrl+4',
  'Ctrl+5',
  'Ctrl+6',
  'Ctrl+7',
  'Ctrl+8',
  'Ctrl+9',
  'Ctrl+N',
  'Ctrl+Shift+N',
  'Alt+F4',
  'Ctrl+L',
  'Ctrl+Shift+Delete',
  'Ctrl+Shift+B',
  'F12',
  'Ctrl+Shift+I',
  'Ctrl+Shift+J',
  'Ctrl+Shift+C',
  'Ctrl+Plus',
  'Ctrl+Minus',
  'Ctrl+0',
]);

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
  'Ctrl+1',
  'Ctrl+2',
  'Ctrl+3',
  'Ctrl+4',
  'Ctrl+5',
  'Ctrl+6',
  'Ctrl+7',
  'Ctrl+8',
  'Ctrl+9',

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

/**
 * Descriptions for Chrome reserved shortcuts
 * Maps each reserved shortcut to its functionality
 * @type {Object<string, string>}
 */
export const CHROME_SHORTCUT_DESCRIPTIONS = {
  // Tab management
  'Ctrl+T': 'Open new tab',
  'Ctrl+W': 'Close current tab',
  'Ctrl+Shift+T': 'Reopen closed tab',
  'Ctrl+Tab': 'Switch to next tab',
  'Ctrl+Shift+Tab': 'Switch to previous tab',
  'Ctrl+1': 'Switch to tab 1',
  'Ctrl+2': 'Switch to tab 2',
  'Ctrl+3': 'Switch to tab 3',
  'Ctrl+4': 'Switch to tab 4',
  'Ctrl+5': 'Switch to tab 5',
  'Ctrl+6': 'Switch to tab 6',
  'Ctrl+7': 'Switch to tab 7',
  'Ctrl+8': 'Switch to tab 8',
  'Ctrl+9': 'Switch to last tab',

  // Window management
  'Ctrl+N': 'Open new window',
  'Ctrl+Shift+N': 'Open incognito window',
  'Alt+F4': 'Close window',

  // Navigation
  'Ctrl+L': 'Focus address bar',
  'Ctrl+K': 'Search from address bar',
  'Alt+D': 'Focus address bar',
  'Alt+Left': 'Go back',
  'Alt+Right': 'Go forward',
  Backspace: 'Go back',

  // Page actions
  'Ctrl+R': 'Reload page',
  'Ctrl+Shift+R': 'Hard reload page',
  F5: 'Reload page',
  'Ctrl+F5': 'Hard reload page',
  'Ctrl+P': 'Print page',
  'Ctrl+S': 'Save page',

  // Browser functions
  'Ctrl+H': 'Open history',
  'Ctrl+J': 'Open downloads',
  'Ctrl+Shift+Delete': 'Clear browsing data',
  'Ctrl+Shift+B': 'Toggle bookmarks bar',

  // Text editing (common)
  'Ctrl+A': 'Select all',
  'Ctrl+C': 'Copy',
  'Ctrl+V': 'Paste',
  'Ctrl+X': 'Cut',
  'Ctrl+Z': 'Undo',
  'Ctrl+Y': 'Redo',
  'Ctrl+F': 'Find in page',
  'Ctrl+G': 'Find next',

  // DevTools
  F12: 'Open DevTools',
  'Ctrl+Shift+I': 'Open DevTools',
  'Ctrl+Shift+J': 'Open DevTools Console',
  'Ctrl+Shift+C': 'Inspect element',

  // Zoom
  'Ctrl+Plus': 'Zoom in',
  'Ctrl+Minus': 'Zoom out',
  'Ctrl+0': 'Reset zoom',

  // Miscellaneous
  'Ctrl+O': 'Open file',
  'Ctrl+U': 'View page source',
  'Ctrl+D': 'Bookmark current page',
};

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

  if (parsed.ctrl) {
    modifiers.push('Ctrl');
  }
  if (parsed.alt) {
    modifiers.push('Alt');
  }
  if (parsed.shift) {
    modifiers.push('Shift');
  }

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
 * isValidShortcut('F2') // true (a function key carries no character to type)
 */
export function isValidShortcut(shortcut) {
  // Normalize first
  const normalized = normalizeShortcut(shortcut);

  // Special case: Escape is always valid
  if (normalized === 'Escape') {
    return true;
  }

  // A function key is valid on its own. The modifier rule exists so a shortcut cannot eat a
  // character the student meant to type, and F1–F12 type nothing — which is why F2 has been the
  // rename key in every outliner since before the web.
  if (/^F([1-9]|1[0-2])$/.test(normalized)) {
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
 * @param {string} [scope=PAGE_SCOPE] - which surface the shortcut fires on. In the mind map editor
 *   only the chords the browser truly keeps are out of bounds; the editor is allowed the editing
 *   keys an editor is expected to answer.
 * @returns {Object|null} { shortcut, description } if conflicts, null otherwise
 * @example
 * isConflictWithChrome('Ctrl+T') // { shortcut: 'Ctrl+T', description: 'Open new tab' }
 * isConflictWithChrome('Ctrl+Shift+X') // null
 */
export function isConflictWithChrome(shortcut, scope = PAGE_SCOPE) {
  const normalized = normalizeShortcut(shortcut);
  const reserved = scope === PAGE_SCOPE ? CHROME_RESERVED_SHORTCUTS : BROWSER_OWNED_SHORTCUTS;

  if (reserved.includes(normalized)) {
    return {
      shortcut: normalized,
      description: CHROME_SHORTCUT_DESCRIPTIONS[normalized] || 'Chrome system function',
    };
  }

  return null;
}

/**
 * Checks if a shortcut conflicts with another extension shortcut
 *
 * @param {string} shortcut - Shortcut to check
 * @param {Object} currentShortcuts - Current shortcuts object
 * @param {string} excludeKey - Feature key to exclude from conflict check (when editing)
 * @param {string} [scope] - the surface to compare within; defaults to the scope of `excludeKey`,
 *   or the page scope. Two shortcuts on surfaces that can never be on screen together are not in
 *   each other's way, so the mind map editor's Ctrl+S is not a clash with TTS: Stop.
 * @returns {string|null} Conflicting feature key, or null if no conflict
 * @example
 * const shortcuts = { ocr_activate: 'Alt+O', dictionary_lookup: 'Alt+O' };
 * isConflictWithExtension('Alt+O', shortcuts, 'ocr_activate') // 'dictionary_lookup'
 */
export function isConflictWithExtension(shortcut, currentShortcuts, excludeKey = null, scope) {
  const normalized = normalizeShortcut(shortcut);
  const within = scope || (excludeKey ? scopeOf(excludeKey) : PAGE_SCOPE);

  for (const [key, value] of Object.entries(currentShortcuts)) {
    if (key === excludeKey || scopeOf(key) !== within) {
      continue;
    } // Skip the shortcut being edited, and everything on another surface
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
  const scope = excludeKey ? scopeOf(excludeKey) : PAGE_SCOPE;

  // Check if valid format
  if (!isValidShortcut(shortcut)) {
    return {
      valid: false,
      error: 'Shortcut must include a modifier key (Ctrl, Alt, or Shift)',
      conflictWith: null,
    };
  }

  // Check Chrome conflicts
  const chromeConflict = isConflictWithChrome(shortcut, scope);
  if (chromeConflict) {
    return {
      valid: false,
      error: `⚠️ Conflicts with Chrome: ${chromeConflict.description}`,
      conflictWith: 'Chrome',
      description: chromeConflict.description,
    };
  }

  // Check extension conflicts
  const conflictKey = isConflictWithExtension(shortcut, currentShortcuts, excludeKey, scope);
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

/**
 * Loads shortcuts from chrome.storage.local
 *
 * The saved map is laid OVER the defaults rather than used in place of them. A student who set
 * their shortcuts before a feature shipped has a map with no key for it, and returning that map
 * verbatim meant the new feature had no card in the settings grid and never registered its
 * handler — the shortcut existed everywhere except where the student is. Merging gives every new
 * key its default while every key they have touched keeps its value, including one they cleared
 * to '' on purpose: empty means off, and off is a choice, not an absence.
 *
 * @returns {Promise<Object>} Shortcuts object
 * @example
 * const shortcuts = await loadShortcuts();
 * console.log(shortcuts.ocr_activate); // 'Alt+O'
 */
export async function loadShortcuts() {
  return new Promise(resolve => {
    chrome.storage.local.get('assist_settings', result => {
      const settings = result.assist_settings || {};
      const shortcuts = { ...DEFAULT_SHORTCUTS, ...(settings.keyboardShortcuts || {}) };

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
  await applySettingWrites([{ path: 'keyboardShortcuts', value: shortcuts }]);
  console.log('[Keyboard Shortcuts] Saved shortcuts:', shortcuts);
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

// Elements that own Space (and other single keys) while they have focus.
const FOCUSED_CONTROL_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  '[contenteditable]:not([contenteditable="false"])',
  ...[
    'button',
    'link',
    'checkbox',
    'radio',
    'switch',
    'tab',
    'menuitem',
    'menuitemcheckbox',
    'menuitemradio',
    'option',
    'slider',
    'spinbutton',
    'combobox',
    'textbox',
    'treeitem',
    'gridcell',
  ].map(role => `[role="${role}"]`),
].join(', ');

/**
 * Whether a key event's target is a control that needs the key itself, so a
 * single-key page shortcut (e.g. Space to pause reading) must not take it
 * (SC 2.1.1, 2.1.4).
 *
 * @param {EventTarget} target - The keydown target (the focused element)
 * @returns {boolean}
 */
export function isFocusedControl(target) {
  if (!(target instanceof Element)) {
    return false;
  }
  return target.isContentEditable === true || target.closest(FOCUSED_CONTROL_SELECTOR) !== null;
}

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

  if (event.ctrlKey) {
    modifiers.push('Ctrl');
  }
  if (event.altKey) {
    modifiers.push('Alt');
  }
  if (event.shiftKey) {
    modifiers.push('Shift');
  }

  // Normalize key name
  let key = event.key;

  // Handle special keys
  if (key === ' ') {
    key = 'Space';
  }
  if (key.length === 1) {
    key = key.toUpperCase();
  }

  return [...modifiers, key].join('+');
}

/**
 * Does the event's physical key and modifier set match the shortcut?
 *
 * The character a key produces is not the key. With Alt held, macOS turns V into '◊' and O
 * into 'ø', and several European layouts do the same, so a student pressing exactly the keys
 * the shortcut names got nothing at all. `event.code` names the key they actually pressed.
 *
 * @param {KeyboardEvent} event
 * @param {string} normalized - An already-normalized shortcut string.
 * @returns {boolean}
 * @private
 */
function matchesPhysicalKey(event, normalized) {
  const parsed = parseShortcut(normalized);

  if (parsed.key.length !== 1) {
    return false; // Only letters and digits have a stable code we can name
  }
  if (parsed.ctrl !== event.ctrlKey || parsed.alt !== event.altKey) {
    return false;
  }
  if (parsed.shift !== event.shiftKey) {
    return false;
  }

  const key = parsed.key.toUpperCase();
  if (key >= 'A' && key <= 'Z') {
    return event.code === `Key${key}`;
  }
  if (key >= '0' && key <= '9') {
    return event.code === `Digit${key}`;
  }
  return false;
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

  if (eventShortcut === normalized) {
    return true;
  }

  return matchesPhysicalKey(event, normalized);
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
  return event => {
    if (matchesShortcut(event, shortcut)) {
      event.preventDefault();
      event.stopPropagation();
      callback(event);
    }
  };
}

/**
 * Global registry of active shortcut handlers
 * Maps feature keys to `{ handler, capture, shortcut }` — the flag has to travel with the handler
 * because removeEventListener only matches a listener registered in the same phase.
 * @private
 */
const shortcutHandlers = new Map();

/**
 * Every registered feature, whether or not its key is bound right now. A feature whose key the
 * student cleared stays here, so reloadShortcuts() can bind it again when they set a key.
 * Only unregisterShortcut() removes an entry.
 * @private
 */
const shortcutCallbacks = new Map();

/**
 * Stops listening for a feature's key without forgetting the feature.
 * @private
 */
function removeListener(featureKey) {
  const registration = shortcutHandlers.get(featureKey);
  if (registration) {
    document.removeEventListener('keydown', registration.handler, registration.capture);
    shortcutHandlers.delete(featureKey);
  }
}

/**
 * Listens for a feature's current key, replacing any listener it had. A cleared key ('')
 * leaves the feature registered but unbound.
 * @private
 */
function bindListener(featureKey, shortcut, callback, capture) {
  removeListener(featureKey);
  if (!shortcut) {
    console.log(`[Keyboard Shortcuts] No key set for: ${featureKey}`);
    return;
  }
  const handler = createShortcutHandler(shortcut, callback);
  document.addEventListener('keydown', handler, capture);
  shortcutHandlers.set(featureKey, { handler, capture, shortcut });
  console.log(`[Keyboard Shortcuts] Registered: ${featureKey} → ${shortcut}`);
}

/**
 * Registers a keyboard shortcut for a feature
 *
 * @param {string} featureKey - Feature key (e.g., 'ocr_activate')
 * @param {Function} callback - Function to call when shortcut is pressed
 * @param {Object} [options] - Registration options
 * @param {boolean} [options.capture=false] - Listen in the capture phase. Needed only where the
 *   page itself would swallow the key first: a rich editor (Google Docs) stops keydown before it
 *   reaches the document, which would leave voice typing unreachable in the very field the
 *   student is writing in.
 * @returns {Promise<Function>} Unregister function
 * @example
 * const unregister = await registerShortcut('ocr_activate', () => console.log('OCR activated!'));
 * // Later: unregister();
 */
export async function registerShortcut(featureKey, callback, options = {}) {
  const capture = options.capture === true;

  const shortcuts = await loadShortcuts();

  // Remembered even when the key is cleared, so setting a key later brings the feature back
  shortcutCallbacks.set(featureKey, { callback, capture });
  bindListener(featureKey, shortcuts[featureKey], callback, capture);

  return () => unregisterShortcut(featureKey);
}

/**
 * The key combination a feature is bound to right now, or null when it has none. It follows
 * reloadShortcuts(), so a feature that also listens somewhere the page's handler cannot reach (an
 * editor iframe's document) matches the key the student chose, not the one read at start-up.
 *
 * @param {string} featureKey - Feature key (e.g., 'stt_dictate')
 * @returns {string|null}
 */
export function boundShortcut(featureKey) {
  return shortcutHandlers.get(featureKey)?.shortcut || null;
}

/**
 * Unregisters a keyboard shortcut for a feature
 *
 * @param {string} featureKey - Feature key to unregister
 * @example
 * unregisterShortcut('ocr_activate');
 */
export function unregisterShortcut(featureKey) {
  removeListener(featureKey);
  // Forget the feature too, or the next reloadShortcuts() would bring back a key the feature
  // gave up, swallowing the press for nothing.
  if (shortcutCallbacks.delete(featureKey)) {
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
  for (const featureKey of [...shortcutCallbacks.keys()]) {
    unregisterShortcut(featureKey);
  }
  console.log('[Keyboard Shortcuts] Unregistered all shortcuts');
}

/**
 * Rebinds every registered feature to its key in storage, including features whose key was
 * cleared and has now been set again. Called after the student changes their shortcuts.
 *
 * @returns {Promise<void>}
 * @example
 * await reloadShortcuts();
 */
export async function reloadShortcuts() {
  const shortcuts = await loadShortcuts();

  // Read after the await, so a feature unregistered meanwhile is not brought back
  for (const [featureKey, { callback, capture }] of shortcutCallbacks) {
    bindListener(featureKey, shortcuts[featureKey], callback, capture);
  }

  console.log(`[Keyboard Shortcuts] Reloaded ${shortcutCallbacks.size} shortcuts`);
}

export default {
  DEFAULT_SHORTCUTS,
  SHORTCUT_LABELS,
  CHROME_RESERVED_SHORTCUTS,
  BROWSER_OWNED_SHORTCUTS,
  SHORTCUT_SCOPES,
  PAGE_SCOPE,
  MIND_MAP_SCOPE,
  scopeOf,
  shortcutKeysInScope,
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
  boundShortcut,
  unregisterShortcut,
  unregisterAllShortcuts,
  reloadShortcuts,
};
