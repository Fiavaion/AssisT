/**
 * @jest-environment jsdom
 */

import {
  DEFAULT_SHORTCUTS,
  MIND_MAP_SCOPE,
  PAGE_SCOPE,
  SHORTCUT_LABELS,
  scopeOf,
  shortcutKeysInScope,
  parseShortcut,
  normalizeShortcut,
  isValidShortcut,
  isConflictWithChrome,
  isConflictWithExtension,
  validateShortcut,
  eventToShortcut,
  matchesShortcut,
  isFocusedControl,
  loadShortcuts,
  registerShortcut,
  unregisterShortcut,
  reloadShortcuts,
} from '../../src/utils/keyboard-shortcuts.js';

/** Answer `chrome.storage.local.get` from a stored settings object, callback-style. */
function storedSettings(settings) {
  chrome.storage.local.get = jest.fn((key, callback) =>
    callback(settings === undefined ? {} : { assist_settings: settings })
  );
}

describe('isFocusedControl — single-key page shortcuts leave focused controls alone', () => {
  function el(html) {
    document.body.innerHTML = html;
    return document.getElementById('t');
  }

  test.each([
    ['a button', '<button id="t">Go</button>'],
    ['a link', '<a id="t" href="/x">Link</a>'],
    ['a select', '<select id="t"><option>1</option></select>'],
    ['a checkbox', '<input id="t" type="checkbox">'],
    ['a text input', '<input id="t" type="text">'],
    ['a textarea', '<textarea id="t"></textarea>'],
    ['a summary', '<details><summary id="t">More</summary></details>'],
    ['an ARIA button', '<div id="t" role="button" tabindex="0">Go</div>'],
    ['an ARIA tab', '<div id="t" role="tab" tabindex="0">Tab</div>'],
    ['an ARIA menu item', '<div id="t" role="menuitem" tabindex="-1">Item</div>'],
    ['a contenteditable', '<div id="t" contenteditable="true">Draft</div>'],
    ['inside a contenteditable', '<div contenteditable=""><p id="t">Draft</p></div>'],
    ['a plaintext-only editor', '<div id="t" contenteditable="plaintext-only">x</div>'],
  ])('%s is a focused control', (_name, html) => {
    expect(isFocusedControl(el(html))).toBe(true);
  });

  test.each([
    ['the page body', null],
    ['a paragraph', '<p id="t">Text</p>'],
    ['a link with no href', '<a id="t">Anchor</a>'],
    ['a non-editable region', '<div id="t" contenteditable="false">Text</div>'],
  ])('%s is not', (_name, html) => {
    const target = html === null ? document.body : el(html);
    expect(isFocusedControl(target)).toBe(false);
  });
});

describe('Keyboard Shortcuts', () => {
  describe('Configuration', () => {
    test('every registry key belongs to a scope, and both scopes are populated', () => {
      // A hard-coded count sat here and went stale the moment the mind map editor's keys were
      // registered. What it was really protecting is that every key is accounted for: named, scoped
      // and bound. So that is what is asserted, key by key, rather than a total.
      const keys = Object.keys(DEFAULT_SHORTCUTS);
      expect(keys.length).toBe(
        shortcutKeysInScope(PAGE_SCOPE).length + shortcutKeysInScope(MIND_MAP_SCOPE).length
      );
      expect(shortcutKeysInScope(PAGE_SCOPE).length).toBeGreaterThan(0);
      expect(shortcutKeysInScope(MIND_MAP_SCOPE).length).toBeGreaterThan(0);

      // The keys each feature that shipped one is entitled to expect to still be there.
      expect(DEFAULT_SHORTCUTS).toHaveProperty('citation_save');
      expect(DEFAULT_SHORTCUTS).toHaveProperty('open_mind_map');
      expect(DEFAULT_SHORTCUTS.stt_dictate).toBe('Alt+Shift+V');
      expect(DEFAULT_SHORTCUTS.action_tray_focus).toBe('Alt+Shift+U');
    });

    test.each([PAGE_SCOPE, MIND_MAP_SCOPE])(
      'no two features in the %s scope claim the same default binding',
      scope => {
        // A clash means whichever handler registered last silently wins — WITHIN one scope. Across
        // scopes there is nothing to clash: a content script never runs on the mind map's own
        // extension page, so Ctrl+Shift+S can be TTS: Stop out on a Canvas page and Save a copy
        // inside the editor without the two ever being pressed in the same document.
        const bindings = shortcutKeysInScope(scope)
          .map(key => DEFAULT_SHORTCUTS[key])
          .filter(Boolean)
          .map(normalizeShortcut);
        expect(new Set(bindings).size).toBe(bindings.length);
      }
    );

    test('All default shortcuts should have labels', () => {
      for (const key of Object.keys(DEFAULT_SHORTCUTS)) {
        expect(SHORTCUT_LABELS[key]).toBeDefined();
        expect(SHORTCUT_LABELS[key].length).toBeGreaterThan(0);
      }
    });

    test('All default shortcuts should be valid', () => {
      for (const shortcut of Object.values(DEFAULT_SHORTCUTS)) {
        expect(isValidShortcut(shortcut)).toBe(true);
      }
    });

    test('No default shortcuts should conflict with Chrome', () => {
      // Asked in the scope the shortcut actually fires in. On somebody else's page AssisT is a
      // guest and keeps off every key a browser or a page might want. The mind map editor is a
      // document editor at its own URL: Ctrl+S, Ctrl+Z, Ctrl+Y, Ctrl+F and Ctrl+A are the keys the
      // student already knows for save, undo, redo, find and select, and taking them there is what
      // every editor on the web does. Only the chords Chrome never hands over at all are barred.
      for (const [key, shortcut] of Object.entries(DEFAULT_SHORTCUTS)) {
        expect(isConflictWithChrome(shortcut, scopeOf(key))).toBeNull();
      }
    });

    test('the editor is still barred from the chords Chrome never hands over', () => {
      for (const shortcut of ['Ctrl+T', 'Ctrl+W', 'Ctrl+Shift+I', 'Ctrl+0']) {
        expect(isConflictWithChrome(shortcut, MIND_MAP_SCOPE)).not.toBeNull();
      }
    });
  });

  describe('parseShortcut', () => {
    test('should parse Ctrl+A correctly', () => {
      const result = parseShortcut('Ctrl+A');
      expect(result).toEqual({
        ctrl: true,
        alt: false,
        shift: false,
        key: 'A',
      });
    });

    test('should parse Ctrl+Shift+Space correctly', () => {
      const result = parseShortcut('Ctrl+Shift+Space');
      expect(result).toEqual({
        ctrl: true,
        alt: false,
        shift: true,
        key: 'Space',
      });
    });

    test('should parse Alt+O correctly', () => {
      const result = parseShortcut('Alt+O');
      expect(result).toEqual({
        ctrl: false,
        alt: true,
        shift: false,
        key: 'O',
      });
    });

    test('should parse Escape correctly', () => {
      const result = parseShortcut('Escape');
      expect(result).toEqual({
        ctrl: false,
        alt: false,
        shift: false,
        key: 'Escape',
      });
    });
  });

  describe('normalizeShortcut', () => {
    test('should normalize ctrl+a to Ctrl+A', () => {
      expect(normalizeShortcut('ctrl+a')).toBe('Ctrl+A');
    });

    test('should normalize shift+ctrl+x to Ctrl+Shift+X', () => {
      expect(normalizeShortcut('shift+ctrl+x')).toBe('Ctrl+Shift+X');
    });

    test('should normalize ALT+SHIFT+B to Alt+Shift+B', () => {
      expect(normalizeShortcut('ALT+SHIFT+B')).toBe('Alt+Shift+B');
    });

    test('should handle mixed case modifiers', () => {
      expect(normalizeShortcut('cTrL+aLt+ShIfT+z')).toBe('Ctrl+Alt+Shift+Z');
    });

    test('should preserve special keys', () => {
      expect(normalizeShortcut('Ctrl+Space')).toBe('Ctrl+Space');
      expect(normalizeShortcut('Shift+Escape')).toBe('Shift+Escape');
    });
  });

  describe('isValidShortcut', () => {
    test('should accept shortcuts with Ctrl modifier', () => {
      expect(isValidShortcut('Ctrl+A')).toBe(true);
      expect(isValidShortcut('Ctrl+Shift+A')).toBe(true);
    });

    test('should accept shortcuts with Alt modifier', () => {
      expect(isValidShortcut('Alt+A')).toBe(true);
      expect(isValidShortcut('Alt+Shift+A')).toBe(true);
    });

    test('should accept shortcuts with Shift modifier', () => {
      expect(isValidShortcut('Shift+A')).toBe(true);
    });

    test('should accept Escape without modifiers', () => {
      expect(isValidShortcut('Escape')).toBe(true);
    });

    test('should reject shortcuts without modifiers', () => {
      expect(isValidShortcut('A')).toBe(false);
      expect(isValidShortcut('Space')).toBe(false);
      expect(isValidShortcut('Enter')).toBe(false);
    });

    test('should handle case-insensitive input', () => {
      expect(isValidShortcut('ctrl+a')).toBe(true);
      expect(isValidShortcut('ALT+B')).toBe(true);
    });
  });

  describe('isConflictWithChrome', () => {
    test('should detect Chrome tab management shortcuts', () => {
      expect(isConflictWithChrome('Ctrl+T')).not.toBeNull();
      expect(isConflictWithChrome('Ctrl+W')).not.toBeNull();
      expect(isConflictWithChrome('Ctrl+Shift+T')).not.toBeNull();
    });

    test('should detect Chrome navigation shortcuts', () => {
      expect(isConflictWithChrome('Ctrl+L')).not.toBeNull();
      expect(isConflictWithChrome('Alt+D')).not.toBeNull();
    });

    test('should detect Chrome text editing shortcuts', () => {
      expect(isConflictWithChrome('Ctrl+A')).not.toBeNull();
      expect(isConflictWithChrome('Ctrl+C')).not.toBeNull();
      expect(isConflictWithChrome('Ctrl+V')).not.toBeNull();
    });

    test('should detect Chrome DevTools shortcuts', () => {
      expect(isConflictWithChrome('F12')).not.toBeNull();
      expect(isConflictWithChrome('Ctrl+Shift+I')).not.toBeNull();
    });

    test('should not flag non-Chrome shortcuts', () => {
      expect(isConflictWithChrome('Ctrl+Shift+X')).toBeNull();
      expect(isConflictWithChrome('Alt+O')).toBeNull();
      expect(isConflictWithChrome('Ctrl+Shift+Space')).toBeNull();
    });

    test('should be case-insensitive', () => {
      expect(isConflictWithChrome('ctrl+t')).not.toBeNull();
      expect(isConflictWithChrome('CTRL+W')).not.toBeNull();
    });
  });

  describe('isConflictWithExtension', () => {
    const testShortcuts = {
      feature1: 'Ctrl+Shift+X',
      feature2: 'Alt+B',
      feature3: 'Ctrl+Shift+C',
    };

    test('should detect conflicts with existing shortcuts', () => {
      expect(isConflictWithExtension('Ctrl+Shift+X', testShortcuts)).toBe('feature1');
      expect(isConflictWithExtension('Alt+B', testShortcuts)).toBe('feature2');
    });

    test('should not flag non-conflicting shortcuts', () => {
      expect(isConflictWithExtension('Ctrl+Shift+D', testShortcuts)).toBeNull();
      expect(isConflictWithExtension('Alt+E', testShortcuts)).toBeNull();
    });

    test('should exclude specified key from conflict check', () => {
      expect(isConflictWithExtension('Ctrl+Shift+X', testShortcuts, 'feature1')).toBeNull();
      expect(isConflictWithExtension('Alt+B', testShortcuts, 'feature2')).toBeNull();
    });

    test('should still detect conflicts with other shortcuts when excluding', () => {
      expect(isConflictWithExtension('Ctrl+Shift+X', testShortcuts, 'feature2')).toBe('feature1');
    });

    test('should be case-insensitive', () => {
      expect(isConflictWithExtension('ctrl+shift+x', testShortcuts)).toBe('feature1');
      expect(isConflictWithExtension('ALT+B', testShortcuts)).toBe('feature2');
    });
  });

  describe('validateShortcut', () => {
    const testShortcuts = {
      feature1: 'Ctrl+Shift+X',
      feature2: 'Alt+B',
    };

    test('should accept valid, non-conflicting shortcuts', () => {
      const result = validateShortcut('Ctrl+Shift+M', testShortcuts);
      expect(result.valid).toBe(true);
      expect(result.error).toBeNull();
      expect(result.conflictWith).toBeNull();
    });

    test('should reject shortcuts without modifiers', () => {
      const result = validateShortcut('A', testShortcuts);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('modifier key');
    });

    test('should reject Chrome reserved shortcuts', () => {
      const result = validateShortcut('Ctrl+T', testShortcuts);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Conflicts with Chrome');
      expect(result.conflictWith).toBe('Chrome');
    });

    test('should reject conflicting extension shortcuts', () => {
      const result = validateShortcut('Ctrl+Shift+X', testShortcuts);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('already used');
      expect(result.conflictWith).toBe('feature1');
    });

    test('should allow editing existing shortcut', () => {
      const result = validateShortcut('Ctrl+Shift+X', testShortcuts, 'feature1');
      expect(result.valid).toBe(true);
    });

    test('should accept Escape without modifiers', () => {
      const result = validateShortcut('Escape', testShortcuts);
      expect(result.valid).toBe(true);
    });
  });

  describe('eventToShortcut', () => {
    test('should convert Ctrl+A event to string', () => {
      const event = new KeyboardEvent('keydown', {
        key: 'a',
        ctrlKey: true,
      });
      expect(eventToShortcut(event)).toBe('Ctrl+A');
    });

    test('should convert Ctrl+Shift+Space event to string', () => {
      const event = new KeyboardEvent('keydown', {
        key: ' ',
        ctrlKey: true,
        shiftKey: true,
      });
      expect(eventToShortcut(event)).toBe('Ctrl+Shift+Space');
    });

    test('should convert Alt+O event to string', () => {
      const event = new KeyboardEvent('keydown', {
        key: 'o',
        altKey: true,
      });
      expect(eventToShortcut(event)).toBe('Alt+O');
    });

    test('should handle Escape key', () => {
      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
      });
      expect(eventToShortcut(event)).toBe('Escape');
    });

    test('should handle all modifiers together', () => {
      const event = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        altKey: true,
        shiftKey: true,
      });
      expect(eventToShortcut(event)).toBe('Ctrl+Alt+Shift+Z');
    });
  });

  describe('matchesShortcut', () => {
    test('should match Ctrl+A events', () => {
      const event = new KeyboardEvent('keydown', {
        key: 'a',
        ctrlKey: true,
      });
      expect(matchesShortcut(event, 'Ctrl+A')).toBe(true);
      expect(matchesShortcut(event, 'Ctrl+B')).toBe(false);
    });

    test('should match Ctrl+Shift+Space events', () => {
      const event = new KeyboardEvent('keydown', {
        key: ' ',
        ctrlKey: true,
        shiftKey: true,
      });
      expect(matchesShortcut(event, 'Ctrl+Shift+Space')).toBe(true);
      expect(matchesShortcut(event, 'Ctrl+Space')).toBe(false);
    });

    test('should be case-insensitive for shortcut string', () => {
      const event = new KeyboardEvent('keydown', {
        key: 'a',
        ctrlKey: true,
      });
      expect(matchesShortcut(event, 'ctrl+a')).toBe(true);
      expect(matchesShortcut(event, 'CTRL+A')).toBe(true);
    });

    test('matches the physical key when the layout rewrites Alt+letter', () => {
      // macOS turns Alt+Shift+V into '◊' and Alt+O into 'ø'. The student pressed the key the
      // shortcut names, so the physical key decides when the character no longer does.
      const mac = new KeyboardEvent('keydown', {
        key: '◊',
        code: 'KeyV',
        altKey: true,
        shiftKey: true,
      });
      expect(matchesShortcut(mac, 'Alt+Shift+V')).toBe(true);
      expect(matchesShortcut(mac, 'Alt+Shift+M')).toBe(false);
    });

    test('a physical key without the right modifiers is not a match', () => {
      const event = new KeyboardEvent('keydown', { key: 'v', code: 'KeyV' });
      expect(matchesShortcut(event, 'Alt+Shift+V')).toBe(false);
    });
  });

  describe('loadShortcuts', () => {
    test('returns the defaults when nothing has been saved', async () => {
      storedSettings(undefined);
      await expect(loadShortcuts()).resolves.toEqual(DEFAULT_SHORTCUTS);
    });

    test('gives a shortcut added after the student saved theirs its default', async () => {
      // A map saved before the mind map existed: every other key is there, this one is not.
      const stored = { ...DEFAULT_SHORTCUTS };
      delete stored.open_mind_map;
      storedSettings({ keyboardShortcuts: stored });

      const shortcuts = await loadShortcuts();

      expect(shortcuts.open_mind_map).toBe('Alt+Shift+M');
      expect(Object.keys(shortcuts).sort()).toEqual(Object.keys(DEFAULT_SHORTCUTS).sort());
    });

    test('keeps a shortcut the student changed', async () => {
      storedSettings({ keyboardShortcuts: { ...DEFAULT_SHORTCUTS, open_mind_map: 'Alt+Shift+K' } });

      await expect(loadShortcuts()).resolves.toMatchObject({ open_mind_map: 'Alt+Shift+K' });
    });

    test('keeps a shortcut the student deliberately cleared', async () => {
      // '' is off, not absent: restoring the default here would put back a key they removed.
      storedSettings({ keyboardShortcuts: { ...DEFAULT_SHORTCUTS, open_mind_map: '' } });

      const shortcuts = await loadShortcuts();

      expect(shortcuts.open_mind_map).toBe('');
      expect(shortcuts.ocr_activate).toBe(DEFAULT_SHORTCUTS.ocr_activate);
    });
  });

  describe('registerShortcut', () => {
    test('a capture-phase shortcut still fires when the page stops the event', async () => {
      // Voice typing has to reach a rich editor (Google Docs) that swallows keydown before it
      // ever reaches the document.
      storedSettings(undefined);
      const fired = jest.fn();
      const unregister = await registerShortcut('stt_dictate', fired, { capture: true });

      const field = document.createElement('textarea');
      document.body.appendChild(field);
      field.addEventListener('keydown', event => event.stopPropagation());
      field.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'V',
          code: 'KeyV',
          altKey: true,
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        })
      );

      expect(fired).toHaveBeenCalledTimes(1);

      unregister();
      field.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'V',
          code: 'KeyV',
          altKey: true,
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        })
      );
      expect(fired).toHaveBeenCalledTimes(1);
      field.remove();
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty shortcut strings', () => {
      expect(() => parseShortcut('')).not.toThrow();
      expect(() => normalizeShortcut('')).not.toThrow();
      expect(() => isValidShortcut('')).not.toThrow();
    });

    test('should handle shortcuts with extra spaces', () => {
      expect(normalizeShortcut('Ctrl + Shift + A')).toBe('Ctrl+Shift+A');
    });

    test('should handle duplicate modifiers', () => {
      expect(normalizeShortcut('Ctrl+Ctrl+A')).toBe('Ctrl+A');
    });
  });
});

// Found in review: switching voice typing off unregistered its key, but the next settings change
// reloaded every shortcut ever registered, so the key came back, swallowed the press
// (preventDefault) and did nothing, even for the page underneath.
describe('a shortcut switched off stays off', () => {
  test('reloading after unregistering does not bring the key back', async () => {
    storedSettings({});
    const callback = jest.fn();
    await registerShortcut('stt_dictate', callback);
    unregisterShortcut('stt_dictate');

    await reloadShortcuts();
    const press = new KeyboardEvent('keydown', {
      key: 'V',
      code: 'KeyV',
      altKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(press);

    expect(callback).not.toHaveBeenCalled();
    expect(press.defaultPrevented).toBe(false);
  });

  test('a shortcut still registered comes back on its new key after a reload', async () => {
    storedSettings({});
    const callback = jest.fn();
    await registerShortcut('stt_dictate', callback);
    storedSettings({ keyboardShortcuts: { stt_dictate: 'Alt+Shift+K' } });

    await reloadShortcuts();
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'K', code: 'KeyK', altKey: true, shiftKey: true, bubbles: true })
    );

    expect(callback).toHaveBeenCalledTimes(1);
    unregisterShortcut('stt_dictate');
  });
});

// Found in review: forgetting a feature on unregister also forgot every feature whose key was
// cleared at the moment of a reload, so clearing a key in the popup and setting it again left it
// dead on open tabs until they were reloaded.
describe('a cleared shortcut comes back when it is set again', () => {
  const pressAltShiftV = () => {
    const press = new KeyboardEvent('keydown', {
      key: 'V',
      code: 'KeyV',
      altKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(press);
    return press;
  };
  const pressCtrlShiftS = () =>
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'S', code: 'KeyS', ctrlKey: true, shiftKey: true, bubbles: true })
    );

  afterEach(() => {
    unregisterShortcut('stt_dictate');
    unregisterShortcut('tts_stop');
  });

  test('clear then restore', async () => {
    storedSettings({});
    const callback = jest.fn();
    await registerShortcut('stt_dictate', callback);

    storedSettings({ keyboardShortcuts: { stt_dictate: '' } });
    await reloadShortcuts();
    const whileCleared = pressAltShiftV();
    expect(callback).not.toHaveBeenCalled();
    expect(whileCleared.defaultPrevented).toBe(false);

    storedSettings({ keyboardShortcuts: { stt_dictate: 'Alt+Shift+V' } });
    await reloadShortcuts();
    pressAltShiftV();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  test('clear all then reset to defaults', async () => {
    storedSettings({});
    const dictate = jest.fn();
    const stop = jest.fn();
    await registerShortcut('stt_dictate', dictate);
    await registerShortcut('tts_stop', stop);

    const cleared = Object.fromEntries(Object.keys(DEFAULT_SHORTCUTS).map(key => [key, '']));
    storedSettings({ keyboardShortcuts: cleared });
    await reloadShortcuts();
    pressAltShiftV();
    pressCtrlShiftS();
    expect(dictate).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();

    storedSettings({ keyboardShortcuts: { ...DEFAULT_SHORTCUTS } });
    await reloadShortcuts();
    pressAltShiftV();
    pressCtrlShiftS();
    expect(dictate).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  test('a feature registered while its key is cleared starts working once the key is set', async () => {
    storedSettings({ keyboardShortcuts: { stt_dictate: '' } });
    const callback = jest.fn();
    await registerShortcut('stt_dictate', callback);
    pressAltShiftV();
    expect(callback).not.toHaveBeenCalled();

    storedSettings({});
    await reloadShortcuts();
    pressAltShiftV();
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
