/**
 * @jest-environment jsdom
 */

import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_LABELS,
  CHROME_RESERVED_SHORTCUTS,
  parseShortcut,
  normalizeShortcut,
  isValidShortcut,
  isConflictWithChrome,
  isConflictWithExtension,
  validateShortcut,
  eventToShortcut,
  matchesShortcut,
} from '../../src/utils/keyboard-shortcuts.js';

describe('Keyboard Shortcuts', () => {
  describe('Configuration', () => {
    test('DEFAULT_SHORTCUTS should contain 14 shortcuts', () => {
      const count = Object.keys(DEFAULT_SHORTCUTS).length;
      expect(count).toBe(14);
    });

    test('All default shortcuts should have labels', () => {
      for (const key of Object.keys(DEFAULT_SHORTCUTS)) {
        expect(SHORTCUT_LABELS[key]).toBeDefined();
        expect(SHORTCUT_LABELS[key].length).toBeGreaterThan(0);
      }
    });

    test('All default shortcuts should be valid', () => {
      for (const [key, shortcut] of Object.entries(DEFAULT_SHORTCUTS)) {
        expect(isValidShortcut(shortcut)).toBe(true);
      }
    });

    test('No default shortcuts should conflict with Chrome', () => {
      for (const [key, shortcut] of Object.entries(DEFAULT_SHORTCUTS)) {
        expect(isConflictWithChrome(shortcut)).toBeNull();
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
