/**
 * The mind map editor's keys, read from the shortcut registry instead of spelled out in the panes.
 *
 * Every other AssisT shortcut is a row in `utils/keyboard-shortcuts.js`, so a student can remap it,
 * the settings grid can warn about a clash, and the help page can print what they actually have.
 * The editor's keys were compared inline — `event.key.toLowerCase() === 's'` and so on — which made
 * them the one set of keys in the product nobody could change. A student who cannot reach Alt, or
 * whose screen reader has already claimed a chord, had no way out of a page that IS its keyboard.
 *
 * So the panes ask this module instead. It holds the bindings the student actually has, starting
 * from the shipped defaults so the keys work from the first paint rather than after a round trip to
 * storage, and it follows `chrome.storage` afterwards — a remap takes effect in an editor that is
 * already open, with no reload. The editor cannot use `registerShortcut()` the way a content-script
 * feature does: these keys are decided inside handlers that already weigh what has focus, whether a
 * modal is up and whether a map is open, and one `document` listener per chord would each have to
 * repeat that.
 *
 * @module pages/mind-map/shortcut-bindings
 */

import {
  DEFAULT_SHORTCUTS,
  MIND_MAP_SCOPE,
  matchesShortcut,
  normalizeShortcut,
  shortcutKeysInScope,
} from '../../utils/keyboard-shortcuts.js';

/** Every registry key the editor answers for, in registry order. */
export const MIND_MAP_KEYS = Object.freeze(shortcutKeysInScope(MIND_MAP_SCOPE));

/** The shipped chords, which is what the editor uses until storage says otherwise. */
const DEFAULTS = Object.freeze(
  Object.fromEntries(MIND_MAP_KEYS.map(key => [key, DEFAULT_SHORTCUTS[key]]))
);

/** What the student has right now. A '' value means they switched that key off, and off is a choice. */
let bindings = { ...DEFAULTS };

/** @type {null | (() => void)} */
let stopWatching = null;

/**
 * Take the student's saved map over the defaults, key by key.
 *
 * Laid over rather than used instead of: a map saved before a key shipped has no entry for it, and
 * dropping to nothing there would leave the new key dead for exactly the students who have been
 * here longest.
 *
 * @param {Object<string, string>} [saved] - `assist_settings.keyboardShortcuts`.
 */
export function applySavedBindings(saved) {
  const next = { ...DEFAULTS };
  for (const key of MIND_MAP_KEYS) {
    if (saved && Object.prototype.hasOwnProperty.call(saved, key)) {
      next[key] = typeof saved[key] === 'string' ? saved[key] : '';
    }
  }
  bindings = next;
}

/**
 * Read `assist_settings` whichever way this `chrome.storage` answers.
 *
 * The extension pages run against a callback API; the test environment and a few polyfills hand
 * back a promise instead. Asking both ways and taking whichever arrives keeps the page off a
 * read that never completes — and a page whose keys never arrive is a page with no keyboard.
 *
 * @returns {Promise<Object>}
 */
function readSettings() {
  return new Promise(resolve => {
    let done = false;
    const finish = result => {
      if (!done) {
        done = true;
        resolve(result?.assist_settings || {});
      }
    };
    try {
      const returned = chrome.storage.local.get('assist_settings', finish);
      if (returned && typeof returned.then === 'function') {
        returned.then(finish, () => finish({}));
      }
    } catch {
      finish({});
    }
  });
}

/** Anyone that prints the keys — the shortcuts list — so a remap shows up there too. */
const listeners = new Set();

/**
 * Load the student's bindings and follow them for as long as the editor is open.
 *
 * @returns {Promise<void>} resolves once the first read has been applied.
 */
export async function watchBindings() {
  if (!stopWatching) {
    const onChanged = (changes, area) => {
      if (area !== 'local' || !changes.assist_settings) {
        return;
      }
      applySavedBindings(changes.assist_settings.newValue?.keyboardShortcuts);
      for (const listener of listeners) {
        listener();
      }
    };
    const onChangedApi = chrome?.storage?.onChanged;
    if (onChangedApi?.addListener) {
      onChangedApi.addListener(onChanged);
      stopWatching = () => onChangedApi.removeListener?.(onChanged);
    } else {
      stopWatching = () => {};
    }
  }

  const settings = await readSettings();
  applySavedBindings(settings.keyboardShortcuts);
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Be told when the bindings change.
 *
 * @param {() => void} listener
 * @returns {() => void} stop listening
 */
export function onBindingsChanged(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Stop following storage. Called from the page's teardown. */
export function stopWatchingBindings() {
  if (stopWatching) {
    stopWatching();
    stopWatching = null;
  }
  listeners.clear();
  bindings = { ...DEFAULTS };
}

/**
 * The chord a key is bound to, normalised — or null when the student switched it off.
 *
 * @param {string} featureKey
 * @returns {string|null}
 */
export function bindingFor(featureKey) {
  const chord = bindings[featureKey];
  return typeof chord === 'string' && chord.trim() ? normalizeShortcut(chord) : null;
}

/**
 * Is this chord the student's own choice rather than the shipped one?
 *
 * @param {string} featureKey
 * @returns {boolean}
 */
export function isCustomised(featureKey) {
  const chord = bindingFor(featureKey);
  return chord !== normalizeShortcut(DEFAULTS[featureKey] || '');
}

/**
 * Does this keystroke match the key the student has bound to `featureKey`?
 *
 * @param {KeyboardEvent} event
 * @param {string} featureKey
 * @returns {boolean}
 */
export function matchesBinding(event, featureKey) {
  const chord = bindings[featureKey];
  if (typeof chord !== 'string' || !chord.trim()) {
    return false; // Switched off on purpose.
  }
  // Command counts as Control on a Mac, which is what the inline comparisons here did and what a Mac
  // student's hands do. The registry's own matcher looks only at `ctrlKey`, so the event is presented
  // to it with Command folded in rather than teaching every page's matcher about it.
  const chordEvent =
    event.metaKey && !event.ctrlKey ? { ...eventView(event), ctrlKey: true } : event;
  return matchesShortcut(chordEvent, chord);
}

/**
 * A plain copy of the parts of a keyboard event the matcher reads.
 *
 * @param {KeyboardEvent} event
 * @returns {Object}
 */
function eventView(event) {
  return {
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
    key: event.key,
    code: event.code,
  };
}

/**
 * Does this keystroke match the bound chord with Shift added on top?
 *
 * One key needs this: Undo-plus-Shift is the second spelling of Redo in every editor anyone has
 * used, and a student who has always pressed Ctrl+Shift+Z should keep it. It answers false once the
 * bound chord carries a Shift of its own, because then the two spellings would be the same keys.
 *
 * @param {KeyboardEvent} event
 * @param {string} featureKey
 * @returns {boolean}
 */
export function matchesBindingWithShift(event, featureKey) {
  if (!event.shiftKey) {
    return false;
  }
  return matchesBinding({ ...eventView(event), shiftKey: false }, featureKey);
}
