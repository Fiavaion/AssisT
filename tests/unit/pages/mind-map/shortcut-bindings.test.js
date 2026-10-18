/**
 * @jest-environment jsdom
 *
 * The mind map editor's keys, as registry entries rather than inline comparisons.
 *
 * This page IS its keyboard, and until these keys were registered they were the one set in the
 * product a student could not move: no remap, no conflict check, and no way out for somebody who
 * cannot reach Alt or whose screen reader has already claimed a chord. What is graded here is that a
 * remap reaches the page, that it reaches it WITHOUT a reload, and that the list of keys is printed
 * from the registry so it cannot drift from what the page answers.
 */

import {
  DEFAULT_SHORTCUTS,
  MIND_MAP_SCOPE,
  PAGE_SCOPE,
  SHORTCUT_LABELS,
  isConflictWithChrome,
  normalizeShortcut,
  scopeOf,
  shortcutKeysInScope,
  validateShortcut,
} from '../../../../src/utils/keyboard-shortcuts.js';
import {
  MIND_MAP_KEYS,
  applySavedBindings,
  bindingFor,
  isCustomised,
  matchesBinding,
  matchesBindingWithShift,
  onBindingsChanged,
  stopWatchingBindings,
  watchBindings,
} from '../../../../src/pages/mind-map/shortcut-bindings.js';
import {
  missingRegistryRows,
  mountShortcutsDialog,
} from '../../../../src/pages/mind-map/shortcuts-dialog.js';

/** A keystroke, named the way the matcher reads one. */
const press = init => new window.KeyboardEvent('keydown', { bubbles: true, ...init });

afterEach(() => {
  stopWatchingBindings();
});

describe('the registry entries the editor owns', () => {
  it('names and labels every one of them', () => {
    expect(MIND_MAP_KEYS.length).toBeGreaterThan(0);
    for (const key of MIND_MAP_KEYS) {
      expect(scopeOf(key)).toBe(MIND_MAP_SCOPE);
      expect(DEFAULT_SHORTCUTS[key]).toBeTruthy();
      expect(SHORTCUT_LABELS[key]).toBeTruthy();
    }
  });

  it('keeps the chords students have already learned as the defaults', () => {
    // Registering them must change nothing for anybody. These are the chords the page answered
    // before it had a registry entry for any of them.
    expect(DEFAULT_SHORTCUTS.mm_undo).toBe('Ctrl+Z');
    expect(DEFAULT_SHORTCUTS.mm_redo).toBe('Ctrl+Y');
    expect(DEFAULT_SHORTCUTS.mm_save).toBe('Ctrl+S');
    expect(DEFAULT_SHORTCUTS.mm_save_as).toBe('Ctrl+Shift+S');
    expect(DEFAULT_SHORTCUTS.mm_open_map).toBe('Ctrl+O');
    expect(DEFAULT_SHORTCUTS.mm_find).toBe('Ctrl+F');
    expect(DEFAULT_SHORTCUTS.mm_focus_branch).toBe('Alt+Shift+F');
    expect(DEFAULT_SHORTCUTS.mm_move_node).toBe('Alt+M');
    expect(DEFAULT_SHORTCUTS.mm_read_aloud).toBe('Alt+R');
    expect(DEFAULT_SHORTCUTS.mm_shortcuts_help).toBe('Ctrl+/');
    expect(DEFAULT_SHORTCUTS.mm_select_siblings).toBe('Ctrl+A');
    expect(DEFAULT_SHORTCUTS.mm_rename).toBe('F2');
  });

  it('holds no two of them on the same chord', () => {
    const chords = MIND_MAP_KEYS.map(key => normalizeShortcut(DEFAULT_SHORTCUTS[key]));
    expect(new Set(chords).size).toBe(chords.length);
  });

  it('shares a chord with a content-script shortcut only where the two can never meet', () => {
    // A content script does not run on the editor's own extension page, so these are not collisions
    // — but every one of them is a deliberate reuse, listed so an accidental new one fails here.
    const pageChords = new Map(
      shortcutKeysInScope(PAGE_SCOPE)
        .filter(key => DEFAULT_SHORTCUTS[key])
        .map(key => [normalizeShortcut(DEFAULT_SHORTCUTS[key]), key])
    );
    const shared = MIND_MAP_KEYS.map(key => [key, normalizeShortcut(DEFAULT_SHORTCUTS[key])])
      .filter(([, chord]) => pageChords.has(chord))
      .map(([key, chord]) => `${key} = ${pageChords.get(chord)} (${chord})`)
      .sort();

    expect(shared).toEqual([
      'mm_read_aloud = reading_mode_toggle (Alt+R)',
      'mm_save_as = tts_stop (Ctrl+Shift+S)',
    ]);
  });

  it('is allowed the editing keys an editor answers, and barred from the ones Chrome keeps', () => {
    for (const key of MIND_MAP_KEYS) {
      expect(isConflictWithChrome(DEFAULT_SHORTCUTS[key], MIND_MAP_SCOPE)).toBeNull();
    }
    // Still off limits, because the keystroke never reaches the document at all.
    expect(isConflictWithChrome('Ctrl+W', MIND_MAP_SCOPE)).not.toBeNull();
  });

  it('refuses a remap that would land on another editor key, through the recorder the popup uses', () => {
    const current = { ...DEFAULT_SHORTCUTS };

    // Onto another editor key: a real collision, and refused.
    const clash = validateShortcut('Ctrl+O', current, 'mm_find');
    expect(clash.valid).toBe(false);
    expect(clash.conflictWith).toBe('mm_open_map');

    // Onto a content-script key: not a collision, because the two surfaces never share a document.
    expect(validateShortcut('Alt+G', current, 'mm_find').valid).toBe(true);

    // Onto a chord Chrome never hands over: refused wherever it is asked.
    expect(validateShortcut('Ctrl+T', current, 'mm_find').valid).toBe(false);
  });
});

describe('matching a keystroke against the student own binding', () => {
  it('answers the shipped chord out of the box', () => {
    expect(matchesBinding(press({ key: 's', ctrlKey: true }), 'mm_save')).toBe(true);
    expect(matchesBinding(press({ key: 'k', altKey: true }), 'mm_save')).toBe(false);
  });

  it('moves to the new keys and off the old ones once the student remaps it', () => {
    applySavedBindings({ mm_save: 'Alt+K' });

    expect(matchesBinding(press({ key: 'k', code: 'KeyK', altKey: true }), 'mm_save')).toBe(true);
    expect(matchesBinding(press({ key: 's', ctrlKey: true }), 'mm_save')).toBe(false);
  });

  it('leaves every other key where it was', () => {
    applySavedBindings({ mm_save: 'Alt+K' });

    expect(matchesBinding(press({ key: 'o', ctrlKey: true }), 'mm_open_map')).toBe(true);
  });

  it('answers nothing for a key the student switched off', () => {
    applySavedBindings({ mm_read_aloud: '' });

    expect(matchesBinding(press({ key: 'r', altKey: true }), 'mm_read_aloud')).toBe(false);
    expect(bindingFor('mm_read_aloud')).toBeNull();
  });

  it('takes Command for Control, because that is what a Mac student presses', () => {
    expect(matchesBinding(press({ key: 's', code: 'KeyS', metaKey: true }), 'mm_save')).toBe(true);
  });

  it('reads the bound chord with Shift added as the second spelling of redo', () => {
    expect(matchesBindingWithShift(press({ key: 'Z', ctrlKey: true, shiftKey: true }), 'mm_undo')).toBe(
      true
    );
    expect(matchesBindingWithShift(press({ key: 'z', ctrlKey: true }), 'mm_undo')).toBe(false);
  });

  it('follows a remap made while the editor is open, with no reload', async () => {
    const listeners = [];
    chrome.storage.onChanged = {
      addListener: fn => listeners.push(fn),
      removeListener: fn => listeners.splice(listeners.indexOf(fn), 1),
    };
    chrome.storage.local.get = jest.fn((_key, callback) => callback({}));
    const seen = jest.fn();
    onBindingsChanged(seen);

    await watchBindings();
    expect(matchesBinding(press({ key: 's', ctrlKey: true }), 'mm_save')).toBe(true);

    listeners.forEach(listener =>
      listener({ assist_settings: { newValue: { keyboardShortcuts: { mm_save: 'Alt+K' } } } }, 'local')
    );

    expect(matchesBinding(press({ key: 'k', code: 'KeyK', altKey: true }), 'mm_save')).toBe(true);
    expect(matchesBinding(press({ key: 's', ctrlKey: true }), 'mm_save')).toBe(false);
    expect(seen).toHaveBeenCalled();
  });

  it('marks a chord as the student own only when it differs from the shipped one', () => {
    expect(isCustomised('mm_save')).toBe(false);
    applySavedBindings({ mm_save: 'Alt+K' });
    expect(isCustomised('mm_save')).toBe(true);
  });
});

describe('the shortcuts list the page shows', () => {
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function close() {
      this.open = false;
      this.dispatchEvent(new Event('close'));
    };
  });

  let host;
  let dialog;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    dialog = mountShortcutsDialog(host);
  });

  afterEach(() => {
    dialog.destroy();
    host.remove();
  });

  it('has a row for every registry entry the editor owns', () => {
    // A key registered and left out of the list is a key nobody can find out about.
    expect(missingRegistryRows()).toEqual([]);

    const listed = [...host.querySelectorAll('dt[data-shortcut-key]')].map(
      term => term.dataset.shortcutKey
    );
    for (const key of MIND_MAP_KEYS) {
      expect(listed).toContain(key);
    }
  });

  it('prints the chord from the registry rather than from prose in the file', () => {
    const chordFor = key =>
      host.querySelector(`dt[data-shortcut-key="${key}"] kbd`)?.textContent ?? null;

    for (const key of MIND_MAP_KEYS) {
      expect(chordFor(key)).toBe(normalizeShortcut(DEFAULT_SHORTCUTS[key]));
    }
  });

  it('shows the student own binding, and says it is theirs', () => {
    applySavedBindings({ mm_save: 'Alt+K' });
    dialog.open();

    const row = host.querySelector('dt[data-shortcut-key="mm_save"]');
    expect(row.querySelector('kbd').textContent).toBe('Alt+K');
    expect(row.nextElementSibling.textContent).toContain('your setting');
  });

  it('says so rather than printing a dead key when the student switched one off', () => {
    applySavedBindings({ mm_focus_branch: '' });
    dialog.open();

    const row = host.querySelector('dt[data-shortcut-key="mm_focus_branch"]');
    expect(row.querySelector('kbd')).toBeNull();
    expect(row.textContent).toBe('Not set');
    expect(row.nextElementSibling.textContent).toContain('switched this key off');
  });

  it('tells a student which keys Settings cannot move, so they do not go looking', () => {
    const note = host.querySelector('.assist-mm-shortcuts__fixed').textContent;

    expect(note).toMatch(/Enter/);
    expect(note).toMatch(/cannot be moved/);
    expect(note).toMatch(/Settings/);
  });
});
