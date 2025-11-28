/**
 * Unit Tests for Voice Command Parser (Phase 2.7 - S.9)
 *
 * Tests command parsing, execution, history management, and text manipulation.
 * 55 comprehensive tests covering all command types.
 *
 * @file command-parser.test.js
 */

import { CommandParser, CommandType } from '../../../src/engines/stt/command-parser.js';

describe('CommandParser', () => {
  let parser;
  let mockElement;
  let onCommandExecuted;
  let onError;

  beforeEach(() => {
    onCommandExecuted = jest.fn();
    onError = jest.fn();

    parser = new CommandParser({
      enabled: true,
      onCommandExecuted,
      onError,
    });

    // Create mock textarea element
    mockElement = {
      tagName: 'TEXTAREA',
      value: '',
      selectionStart: 0,
      selectionEnd: 0,
      dispatchEvent: jest.fn(),
      focus: jest.fn(),
    };
  });

  afterEach(() => {
    if (parser) {
      parser.destroy();
    }
    jest.clearAllMocks();
  });

  // ==========================================
  // Initialization Tests
  // ==========================================

  describe('Initialization', () => {
    it('should initialize with default settings', () => {
      const defaultParser = new CommandParser();
      expect(defaultParser.settings.enabled).toBe(true);
      expect(defaultParser.settings.caseSensitive).toBe(false);
      expect(defaultParser.settings.maxHistorySize).toBe(50);
      expect(defaultParser.settings.commandConfirmation).toBe(true);
    });

    it('should initialize with custom settings', () => {
      const customParser = new CommandParser({
        enabled: false,
        caseSensitive: true,
        maxHistorySize: 100,
        commandConfirmation: false,
      });
      expect(customParser.settings.enabled).toBe(false);
      expect(customParser.settings.caseSensitive).toBe(true);
      expect(customParser.settings.maxHistorySize).toBe(100);
      expect(customParser.settings.commandConfirmation).toBe(false);
    });

    it('should initialize command groups', () => {
      expect(parser.deleteCommands).toBeDefined();
      expect(parser.undoRedoCommands).toBeDefined();
      expect(parser.replaceCommands).toBeDefined();
      expect(parser.selectCommands).toBeDefined();
      expect(parser.navigateCommands).toBeDefined();
      expect(parser.formatCommands).toBeDefined();
    });

    it('should initialize empty history', () => {
      expect(parser.history).toEqual([]);
      expect(parser.historyIndex).toBe(-1);
    });
  });

  // ==========================================
  // Delete Command Parsing Tests
  // ==========================================

  describe('Delete Command Parsing', () => {
    it('should parse "delete last word"', () => {
      const result = parser.parse('delete last word');
      expect(result.type).toBe(CommandType.DELETE);
      expect(result.params.count).toBe(1);
      expect(result.params.unit).toBe('word');
      expect(result.consumed).toBe(true);
    });

    it('should parse "delete last 3 words"', () => {
      const result = parser.parse('delete last 3 words');
      expect(result.type).toBe(CommandType.DELETE);
      expect(result.params.count).toBe(3);
      expect(result.params.unit).toBe('word');
    });

    it('should parse "delete 5 words"', () => {
      const result = parser.parse('delete 5 words');
      expect(result.type).toBe(CommandType.DELETE);
      expect(result.params.count).toBe(5);
      expect(result.params.unit).toBe('word');
    });

    it('should parse "delete last sentence"', () => {
      const result = parser.parse('delete last sentence');
      expect(result.type).toBe(CommandType.DELETE);
      expect(result.params.count).toBe(1);
      expect(result.params.unit).toBe('sentence');
    });

    it('should parse "delete last 2 sentences"', () => {
      const result = parser.parse('delete last 2 sentences');
      expect(result.type).toBe(CommandType.DELETE);
      expect(result.params.count).toBe(2);
      expect(result.params.unit).toBe('sentence');
    });

    it('should parse "delete last paragraph"', () => {
      const result = parser.parse('delete last paragraph');
      expect(result.type).toBe(CommandType.DELETE);
      expect(result.params.count).toBe(1);
      expect(result.params.unit).toBe('paragraph');
    });

    it('should parse "delete last character"', () => {
      const result = parser.parse('delete last character');
      expect(result.type).toBe(CommandType.DELETE);
      expect(result.params.count).toBe(1);
      expect(result.params.unit).toBe('character');
    });

    it('should parse "delete last 10 characters"', () => {
      const result = parser.parse('delete last 10 characters');
      expect(result.type).toBe(CommandType.DELETE);
      expect(result.params.count).toBe(10);
      expect(result.params.unit).toBe('character');
    });

    it('should parse "delete last line"', () => {
      const result = parser.parse('delete last line');
      expect(result.type).toBe(CommandType.DELETE);
      expect(result.params.count).toBe(1);
      expect(result.params.unit).toBe('line');
    });

    it('should parse "delete that"', () => {
      const result = parser.parse('delete that');
      expect(result.type).toBe(CommandType.DELETE);
      expect(result.params.unit).toBe('lastDictation');
    });

    it('should parse "scratch that"', () => {
      const result = parser.parse('scratch that');
      expect(result.type).toBe(CommandType.DELETE);
      expect(result.params.unit).toBe('lastDictation');
    });

    it('should parse "delete this"', () => {
      const result = parser.parse('delete this');
      expect(result.type).toBe(CommandType.DELETE);
      expect(result.params.unit).toBe('lastDictation');
    });

    it('should parse "delete selection"', () => {
      const result = parser.parse('delete selection');
      expect(result.type).toBe(CommandType.DELETE);
      expect(result.params.unit).toBe('selection');
    });

    it('should parse "delete all"', () => {
      const result = parser.parse('delete all');
      expect(result.type).toBe(CommandType.DELETE);
      expect(result.params.unit).toBe('all');
    });

    it('should parse "clear all"', () => {
      const result = parser.parse('clear all');
      expect(result.type).toBe(CommandType.DELETE);
      expect(result.params.unit).toBe('all');
    });

    it('should parse delete with quoted text', () => {
      const result = parser.parse('delete "hello world"');
      expect(result.type).toBe(CommandType.DELETE);
      expect(result.params.unit).toBe('text');
      expect(result.params.text).toBe('hello world');
    });

    it('should be case insensitive', () => {
      const result1 = parser.parse('DELETE LAST WORD');
      const result2 = parser.parse('Delete Last Word');
      expect(result1.type).toBe(CommandType.DELETE);
      expect(result2.type).toBe(CommandType.DELETE);
    });
  });

  // ==========================================
  // Undo/Redo Command Parsing Tests
  // ==========================================

  describe('Undo/Redo Command Parsing', () => {
    it('should parse "undo"', () => {
      const result = parser.parse('undo');
      expect(result.type).toBe(CommandType.UNDO);
      expect(result.params.action).toBe('undo');
      expect(result.params.count).toBe(1);
    });

    it('should parse "undo that"', () => {
      const result = parser.parse('undo that');
      expect(result.type).toBe(CommandType.UNDO);
      expect(result.params.action).toBe('undo');
      expect(result.params.count).toBe(1);
    });

    it('should parse "undo 3"', () => {
      const result = parser.parse('undo 3');
      expect(result.type).toBe(CommandType.UNDO);
      expect(result.params.action).toBe('undo');
      expect(result.params.count).toBe(3);
    });

    it('should parse "undo 5 times"', () => {
      const result = parser.parse('undo 5 times');
      expect(result.type).toBe(CommandType.UNDO);
      expect(result.params.action).toBe('undo');
      expect(result.params.count).toBe(5);
    });

    it('should parse "redo"', () => {
      const result = parser.parse('redo');
      expect(result.type).toBe(CommandType.UNDO);
      expect(result.params.action).toBe('redo');
      expect(result.params.count).toBe(1);
    });

    it('should parse "redo 2"', () => {
      const result = parser.parse('redo 2');
      expect(result.type).toBe(CommandType.UNDO);
      expect(result.params.action).toBe('redo');
      expect(result.params.count).toBe(2);
    });

    it('should parse "redo 3 times"', () => {
      const result = parser.parse('redo 3 times');
      expect(result.type).toBe(CommandType.UNDO);
      expect(result.params.action).toBe('redo');
      expect(result.params.count).toBe(3);
    });
  });

  // ==========================================
  // Replace Command Parsing Tests
  // ==========================================

  describe('Replace Command Parsing', () => {
    it('should parse "replace X with Y" (quoted)', () => {
      const result = parser.parse('replace "hello" with "goodbye"');
      expect(result.type).toBe(CommandType.REPLACE);
      expect(result.params.find).toBe('hello');
      expect(result.params.replace).toBe('goodbye');
    });

    it('should parse "replace X with Y" (unquoted)', () => {
      const result = parser.parse('replace old with new');
      expect(result.type).toBe(CommandType.REPLACE);
      expect(result.params.find).toBe('old');
      expect(result.params.replace).toBe('new');
    });

    it('should parse "change X to Y" (quoted)', () => {
      const result = parser.parse('change "cat" to "dog"');
      expect(result.type).toBe(CommandType.REPLACE);
      expect(result.params.find).toBe('cat');
      expect(result.params.replace).toBe('dog');
    });

    it('should parse "correct X to Y" (for dyslexia support)', () => {
      const result = parser.parse('correct "teh" to "the"');
      expect(result.type).toBe(CommandType.REPLACE);
      expect(result.params.find).toBe('teh');
      expect(result.params.replace).toBe('the');
    });

    it('should parse "replace that with Y" - captures "that" as find text', () => {
      // Note: The general replace pattern matches first, so "that" is captured as the find text
      // The special "lastDictation" handling happens in executeReplace when find === 'that'
      const result = parser.parse('replace that with something new');
      expect(result.type).toBe(CommandType.REPLACE);
      expect(result.params.find).toBe('that');
      expect(result.params.replace).toBe('something new');
    });
  });

  // ==========================================
  // Select Command Parsing Tests
  // ==========================================

  describe('Select Command Parsing', () => {
    it('should parse "select all"', () => {
      const result = parser.parse('select all');
      expect(result.type).toBe(CommandType.SELECT);
      expect(result.params.unit).toBe('all');
    });

    it('should parse "select last word"', () => {
      const result = parser.parse('select last word');
      expect(result.type).toBe(CommandType.SELECT);
      expect(result.params.unit).toBe('word');
      expect(result.params.count).toBe(1);
      expect(result.params.direction).toBe('last');
    });

    it('should parse "select last 5 words"', () => {
      const result = parser.parse('select last 5 words');
      expect(result.type).toBe(CommandType.SELECT);
      expect(result.params.unit).toBe('word');
      expect(result.params.count).toBe(5);
    });

    it('should parse "select last sentence"', () => {
      const result = parser.parse('select last sentence');
      expect(result.type).toBe(CommandType.SELECT);
      expect(result.params.unit).toBe('sentence');
    });

    it('should parse "select" with quoted text', () => {
      const result = parser.parse('select "specific text"');
      expect(result.type).toBe(CommandType.SELECT);
      expect(result.params.unit).toBe('text');
      expect(result.params.text).toBe('specific text');
    });
  });

  // ==========================================
  // Navigate Command Parsing Tests
  // ==========================================

  describe('Navigate Command Parsing', () => {
    it('should parse "go to beginning"', () => {
      const result = parser.parse('go to beginning');
      expect(result.type).toBe(CommandType.NAVIGATE);
      expect(result.params.action).toBe('goto');
      expect(result.params.position).toBe('start');
    });

    it('should parse "go to end"', () => {
      const result = parser.parse('go to end');
      expect(result.type).toBe(CommandType.NAVIGATE);
      expect(result.params.position).toBe('end');
    });

    it('should parse "move left"', () => {
      const result = parser.parse('move left');
      expect(result.type).toBe(CommandType.NAVIGATE);
      expect(result.params.action).toBe('move');
      expect(result.params.direction).toBe('left');
      expect(result.params.count).toBe(1);
    });

    it('should parse "move left 3 words"', () => {
      const result = parser.parse('move left 3 words');
      expect(result.type).toBe(CommandType.NAVIGATE);
      expect(result.params.direction).toBe('left');
      expect(result.params.count).toBe(3);
    });

    it('should parse "go to line 5"', () => {
      const result = parser.parse('go to line 5');
      expect(result.type).toBe(CommandType.NAVIGATE);
      expect(result.params.position).toBe('line');
      expect(result.params.line).toBe(5);
    });

    it('should parse "find" with quoted text', () => {
      const result = parser.parse('find "search term"');
      expect(result.type).toBe(CommandType.NAVIGATE);
      expect(result.params.action).toBe('find');
      expect(result.params.text).toBe('search term');
    });

    it('should parse "next"', () => {
      const result = parser.parse('next');
      expect(result.type).toBe(CommandType.NAVIGATE);
      expect(result.params.action).toBe('findNext');
    });

    it('should parse "previous"', () => {
      const result = parser.parse('previous');
      expect(result.type).toBe(CommandType.NAVIGATE);
      expect(result.params.action).toBe('findPrevious');
    });
  });

  // ==========================================
  // Format Command Parsing Tests
  // ==========================================

  describe('Format Command Parsing', () => {
    it('should parse "bold that"', () => {
      const result = parser.parse('bold that');
      expect(result.type).toBe(CommandType.FORMAT);
      expect(result.params.format).toBe('bold');
    });

    it('should parse "italicize that"', () => {
      const result = parser.parse('italicize that');
      expect(result.type).toBe(CommandType.FORMAT);
      expect(result.params.format).toBe('italic');
    });

    it('should parse "underline that"', () => {
      const result = parser.parse('underline that');
      expect(result.type).toBe(CommandType.FORMAT);
      expect(result.params.format).toBe('underline');
    });

    it('should parse "new paragraph"', () => {
      const result = parser.parse('new paragraph');
      expect(result.type).toBe(CommandType.FORMAT);
      expect(result.params.format).toBe('paragraph');
    });

    it('should parse "new line"', () => {
      const result = parser.parse('new line');
      expect(result.type).toBe(CommandType.FORMAT);
      expect(result.params.format).toBe('newline');
    });

    it('should parse "bullet point"', () => {
      const result = parser.parse('bullet point');
      expect(result.type).toBe(CommandType.FORMAT);
      expect(result.params.format).toBe('bulletList');
    });

    it('should parse "numbered list"', () => {
      const result = parser.parse('numbered list');
      expect(result.type).toBe(CommandType.FORMAT);
      expect(result.params.format).toBe('numberedList');
    });

    it('should parse "heading 1"', () => {
      const result = parser.parse('heading 1');
      expect(result.type).toBe(CommandType.FORMAT);
      expect(result.params.format).toBe('heading');
      expect(result.params.level).toBe(1);
    });

    it('should parse "quote that"', () => {
      const result = parser.parse('quote that');
      expect(result.type).toBe(CommandType.FORMAT);
      expect(result.params.format).toBe('quote');
    });

    it('should parse "block quote"', () => {
      const result = parser.parse('block quote');
      expect(result.type).toBe(CommandType.FORMAT);
      expect(result.params.format).toBe('blockquote');
    });
  });

  // ==========================================
  // Non-Command Text Tests
  // ==========================================

  describe('Non-Command Text Parsing', () => {
    it('should return TEXT type for regular text', () => {
      const result = parser.parse('hello world');
      expect(result.type).toBe(CommandType.TEXT);
      expect(result.command).toBeNull();
      expect(result.remainingText).toBe('hello world');
      expect(result.consumed).toBe(false);
    });

    it('should return TEXT type for empty string', () => {
      const result = parser.parse('');
      expect(result.type).toBe(CommandType.TEXT);
    });

    it('should return TEXT type when disabled', () => {
      parser.updateSettings({ enabled: false });
      const result = parser.parse('delete last word');
      expect(result.type).toBe(CommandType.TEXT);
    });
  });

  // ==========================================
  // History Management Tests
  // ==========================================

  describe('History Management', () => {
    it('should save state to history', () => {
      mockElement.value = 'initial text';
      mockElement.selectionStart = 5;
      mockElement.selectionEnd = 5;

      parser.saveToHistory(mockElement);

      expect(parser.history).toHaveLength(1);
      expect(parser.history[0].text).toBe('initial text');
      expect(parser.historyIndex).toBe(0);
    });

    it('should limit history size', () => {
      parser.settings.maxHistorySize = 3;

      for (let i = 0; i < 5; i++) {
        mockElement.value = `text ${i}`;
        parser.saveToHistory(mockElement);
      }

      expect(parser.history).toHaveLength(3);
    });

    it('should not save history for null element', () => {
      parser.saveToHistory(null);
      expect(parser.history).toHaveLength(0);
    });

    it('should clear history on destroy', () => {
      mockElement.value = 'test';
      parser.saveToHistory(mockElement);

      parser.destroy();

      expect(parser.history).toEqual([]);
      expect(parser.historyIndex).toBe(-1);
    });
  });

  // ==========================================
  // Undo/Redo Execution Tests
  // ==========================================

  describe('Undo/Redo Execution', () => {
    it('should undo changes', () => {
      // Save initial state
      mockElement.value = 'first state';
      parser.saveToHistory(mockElement);

      // Make a change and save it
      mockElement.value = 'second state';
      parser.saveToHistory(mockElement);

      // Verify we have history
      expect(parser.history).toHaveLength(2);
      expect(parser.historyIndex).toBe(1);

      // Undo should go back to previous state
      // Note: undo() will save current state before undoing if at end of history
      const result = parser.undo(mockElement, 1);

      expect(result).toBe(true);
      // onCommandExecuted should have been called
      expect(onCommandExecuted).toHaveBeenCalled();
      // History index should have decreased
      expect(parser.historyIndex).toBeLessThan(parser.history.length - 1);
    });

    it('should fail undo when no history', () => {
      const result = parser.undo(mockElement, 1);
      expect(result).toBe(false);
      expect(onError).toHaveBeenCalled();
    });

    it('should redo changes', () => {
      mockElement.value = 'first';
      parser.saveToHistory(mockElement);
      mockElement.value = 'second';
      parser.saveToHistory(mockElement);

      parser.undo(mockElement, 1);
      const result = parser.redo(mockElement, 1);

      expect(result).toBe(true);
      expect(mockElement.value).toBe('second');
    });

    it('should fail redo when at end of history', () => {
      mockElement.value = 'state';
      parser.saveToHistory(mockElement);

      const result = parser.redo(mockElement, 1);
      expect(result).toBe(false);
    });
  });

  // ==========================================
  // Delete Execution Tests
  // ==========================================

  describe('Delete Command Execution', () => {
    it('should delete last word', () => {
      mockElement.value = 'hello world goodbye';
      mockElement.selectionStart = 19;
      mockElement.selectionEnd = 19;

      parser.executeDelete(mockElement, { count: 1, unit: 'word' });

      expect(mockElement.value).toBe('hello world ');
    });

    it('should delete characters', () => {
      mockElement.value = 'hello world';
      mockElement.selectionStart = 11;

      parser.executeDelete(mockElement, { count: 5, unit: 'character' });

      expect(mockElement.value).toBe('hello ');
    });

    it('should delete last dictation', () => {
      mockElement.value = 'existing text new dictation';
      mockElement.selectionStart = 27;

      parser.executeDelete(mockElement, { unit: 'lastDictation' }, 'new dictation');

      expect(mockElement.value).toBe('existing text ');
    });

    it('should delete selection', () => {
      mockElement.value = 'hello beautiful world';
      mockElement.selectionStart = 6;
      mockElement.selectionEnd = 16;

      parser.executeDelete(mockElement, { unit: 'selection' });

      expect(mockElement.value).toBe('hello world');
    });

    it('should delete all', () => {
      mockElement.value = 'delete all this text';

      parser.executeDelete(mockElement, { unit: 'all' });

      expect(mockElement.value).toBe('');
    });

    it('should return false for null element', () => {
      const result = parser.executeDelete(null, { unit: 'word', count: 1 });
      expect(result).toBe(false);
    });
  });

  // ==========================================
  // Replace Execution Tests
  // ==========================================

  describe('Replace Command Execution', () => {
    it('should replace text', () => {
      mockElement.value = 'hello world';
      mockElement.selectionStart = 11;

      const result = parser.executeReplace(mockElement, {
        find: 'world',
        replace: 'universe',
      });

      expect(result).toBe(true);
      expect(mockElement.value).toBe('hello universe');
    });

    it('should fail when text not found', () => {
      mockElement.value = 'hello world';

      const result = parser.executeReplace(mockElement, {
        find: 'nonexistent',
        replace: 'new',
      });

      expect(result).toBe(false);
      expect(onError).toHaveBeenCalled();
    });

    it('should return false for null element', () => {
      const result = parser.executeReplace(null, { find: 'a', replace: 'b' });
      expect(result).toBe(false);
    });
  });

  // ==========================================
  // Select Execution Tests
  // ==========================================

  describe('Select Command Execution', () => {
    it('should select all', () => {
      mockElement.value = 'hello world';

      parser.executeSelect(mockElement, { unit: 'all' });

      expect(mockElement.selectionStart).toBe(0);
      expect(mockElement.selectionEnd).toBe(11);
    });

    it('should select specific text', () => {
      mockElement.value = 'hello beautiful world';

      parser.executeSelect(mockElement, { unit: 'text', text: 'beautiful' });

      expect(mockElement.selectionStart).toBe(6);
      expect(mockElement.selectionEnd).toBe(15);
    });

    it('should return false for null element', () => {
      const result = parser.executeSelect(null, { unit: 'all' });
      expect(result).toBe(false);
    });
  });

  // ==========================================
  // Available Commands Tests
  // ==========================================

  describe('getAvailableCommands', () => {
    it('should return command categories', () => {
      const commands = parser.getAvailableCommands();

      expect(commands).toBeInstanceOf(Array);
      expect(commands.length).toBeGreaterThan(0);

      const categories = commands.map(c => c.category);
      expect(categories).toContain('Delete');
      expect(categories).toContain('Undo/Redo');
      expect(categories).toContain('Replace');
      expect(categories).toContain('Select');
      expect(categories).toContain('Navigate');
      expect(categories).toContain('Format');
    });
  });

  // ==========================================
  // Settings Update Tests
  // ==========================================

  describe('Settings Update', () => {
    it('should update settings', () => {
      parser.updateSettings({
        enabled: false,
        maxHistorySize: 100,
      });

      expect(parser.settings.enabled).toBe(false);
      expect(parser.settings.maxHistorySize).toBe(100);
    });
  });

  // ==========================================
  // Edge Cases
  // ==========================================

  describe('Edge Cases', () => {
    it('should handle whitespace-only input', () => {
      const result = parser.parse('   ');
      expect(result.type).toBe(CommandType.TEXT);
    });

    it('should trim input before parsing', () => {
      const result = parser.parse('  delete last word  ');
      expect(result.type).toBe(CommandType.DELETE);
    });

    it('should handle numbers in various positions', () => {
      const result = parser.parse('delete last 100 words');
      expect(result.type).toBe(CommandType.DELETE);
      expect(result.params.count).toBe(100);
    });
  });
});
