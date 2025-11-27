/**
 * Voice Command Parser for Speech-to-Text
 *
 * Parses voice commands for editing, navigation, and formatting.
 * Designed for neurodivergent users with comprehensive command vocabulary.
 *
 * Features:
 * - Delete commands (word, sentence, paragraph, selection)
 * - Undo/Redo support with history tracking
 * - Replace/Change commands with pattern matching
 * - Select commands for text selection
 * - Navigation commands for cursor movement
 * - Formatting commands for rich text
 *
 * @module CommandParser
 * @version 1.0.0
 */

/**
 * Command types enum
 */
export const CommandType = {
  DELETE: 'delete',
  UNDO: 'undo',
  REDO: 'redo',
  REPLACE: 'replace',
  SELECT: 'select',
  NAVIGATE: 'navigate',
  FORMAT: 'format',
  PUNCTUATION: 'punctuation',
  TEXT: 'text', // Regular text, not a command
};

/**
 * Command result object
 * @typedef {Object} CommandResult
 * @property {string} type - Command type from CommandType enum
 * @property {string} command - The matched command phrase
 * @property {Object} params - Command-specific parameters
 * @property {string} remainingText - Text after command extraction
 * @property {boolean} consumed - Whether the entire input was a command
 */

/**
 * Edit history entry
 * @typedef {Object} HistoryEntry
 * @property {string} text - The text state
 * @property {number} cursorStart - Cursor start position
 * @property {number} cursorEnd - Cursor end position
 * @property {number} timestamp - When the edit occurred
 */

/**
 * Voice Command Parser
 */
export class CommandParser {
  constructor(options = {}) {
    this.settings = {
      enabled: options.enabled !== undefined ? options.enabled : true,
      caseSensitive: options.caseSensitive || false,
      maxHistorySize: options.maxHistorySize || 50,
      commandConfirmation:
        options.commandConfirmation !== undefined ? options.commandConfirmation : true,
    };

    // Edit history for undo/redo
    this.history = [];
    this.historyIndex = -1;
    this.currentElement = null;

    // Callbacks
    this.onCommandExecuted = options.onCommandExecuted || (() => {});
    this.onError = options.onError || (() => {});

    // Initialize command patterns
    this.initializeCommands();
  }

  /**
   * Initialize command patterns with regex matchers
   */
  initializeCommands() {
    // Delete commands - ordered by specificity (most specific first)
    this.deleteCommands = [
      // Delete with count
      {
        pattern: /^delete\s+last\s+(\d+)\s+words?$/i,
        handler: m => ({ count: parseInt(m[1]), unit: 'word' }),
      },
      {
        pattern: /^delete\s+(\d+)\s+words?$/i,
        handler: m => ({ count: parseInt(m[1]), unit: 'word' }),
      },
      {
        pattern: /^delete\s+last\s+(\d+)\s+sentences?$/i,
        handler: m => ({ count: parseInt(m[1]), unit: 'sentence' }),
      },
      {
        pattern: /^delete\s+last\s+(\d+)\s+paragraphs?$/i,
        handler: m => ({ count: parseInt(m[1]), unit: 'paragraph' }),
      },
      {
        pattern: /^delete\s+last\s+(\d+)\s+characters?$/i,
        handler: m => ({ count: parseInt(m[1]), unit: 'character' }),
      },
      {
        pattern: /^delete\s+last\s+(\d+)\s+lines?$/i,
        handler: m => ({ count: parseInt(m[1]), unit: 'line' }),
      },

      // Delete single units
      { pattern: /^delete\s+last\s+word$/i, handler: () => ({ count: 1, unit: 'word' }) },
      { pattern: /^delete\s+last\s+sentence$/i, handler: () => ({ count: 1, unit: 'sentence' }) },
      { pattern: /^delete\s+last\s+paragraph$/i, handler: () => ({ count: 1, unit: 'paragraph' }) },
      { pattern: /^delete\s+last\s+character$/i, handler: () => ({ count: 1, unit: 'character' }) },
      { pattern: /^delete\s+last\s+line$/i, handler: () => ({ count: 1, unit: 'line' }) },

      // Delete that/this (last dictation)
      { pattern: /^delete\s+that$/i, handler: () => ({ unit: 'lastDictation' }) },
      { pattern: /^scratch\s+that$/i, handler: () => ({ unit: 'lastDictation' }) },
      { pattern: /^delete\s+this$/i, handler: () => ({ unit: 'lastDictation' }) },

      // Delete selection
      { pattern: /^delete\s+selection$/i, handler: () => ({ unit: 'selection' }) },
      { pattern: /^delete\s+selected$/i, handler: () => ({ unit: 'selection' }) },

      // Delete all
      { pattern: /^delete\s+all$/i, handler: () => ({ unit: 'all' }) },
      { pattern: /^clear\s+all$/i, handler: () => ({ unit: 'all' }) },

      // Delete specific text
      { pattern: /^delete\s+["'](.+?)["']$/i, handler: m => ({ unit: 'text', text: m[1] }) },
      { pattern: /^delete\s+(.+)$/i, handler: m => ({ unit: 'text', text: m[1] }) },
    ];

    // Undo/Redo commands
    this.undoRedoCommands = [
      { pattern: /^undo$/i, handler: () => ({ action: 'undo', count: 1 }) },
      { pattern: /^undo\s+that$/i, handler: () => ({ action: 'undo', count: 1 }) },
      { pattern: /^undo\s+last$/i, handler: () => ({ action: 'undo', count: 1 }) },
      { pattern: /^undo\s+(\d+)$/i, handler: m => ({ action: 'undo', count: parseInt(m[1]) }) },
      {
        pattern: /^undo\s+(\d+)\s+times?$/i,
        handler: m => ({ action: 'undo', count: parseInt(m[1]) }),
      },
      { pattern: /^redo$/i, handler: () => ({ action: 'redo', count: 1 }) },
      { pattern: /^redo\s+that$/i, handler: () => ({ action: 'redo', count: 1 }) },
      { pattern: /^redo\s+(\d+)$/i, handler: m => ({ action: 'redo', count: parseInt(m[1]) }) },
      {
        pattern: /^redo\s+(\d+)\s+times?$/i,
        handler: m => ({ action: 'redo', count: parseInt(m[1]) }),
      },
    ];

    // Replace commands
    this.replaceCommands = [
      // Replace X with Y
      {
        pattern: /^replace\s+["'](.+?)["']\s+with\s+["'](.+?)["']$/i,
        handler: m => ({ find: m[1], replace: m[2] }),
      },
      {
        pattern: /^replace\s+(.+?)\s+with\s+(.+)$/i,
        handler: m => ({ find: m[1].trim(), replace: m[2].trim() }),
      },

      // Change X to Y
      {
        pattern: /^change\s+["'](.+?)["']\s+to\s+["'](.+?)["']$/i,
        handler: m => ({ find: m[1], replace: m[2] }),
      },
      {
        pattern: /^change\s+(.+?)\s+to\s+(.+)$/i,
        handler: m => ({ find: m[1].trim(), replace: m[2].trim() }),
      },

      // Correct X to Y (for dyslexia support)
      {
        pattern: /^correct\s+["'](.+?)["']\s+to\s+["'](.+?)["']$/i,
        handler: m => ({ find: m[1], replace: m[2] }),
      },
      {
        pattern: /^correct\s+(.+?)\s+to\s+(.+)$/i,
        handler: m => ({ find: m[1].trim(), replace: m[2].trim() }),
      },

      // Replace that with Y
      {
        pattern: /^replace\s+that\s+with\s+["'](.+?)["']$/i,
        handler: m => ({ find: 'lastDictation', replace: m[1] }),
      },
      {
        pattern: /^replace\s+that\s+with\s+(.+)$/i,
        handler: m => ({ find: 'lastDictation', replace: m[1].trim() }),
      },
    ];

    // Select commands
    this.selectCommands = [
      { pattern: /^select\s+all$/i, handler: () => ({ unit: 'all' }) },
      {
        pattern: /^select\s+last\s+word$/i,
        handler: () => ({ unit: 'word', count: 1, direction: 'last' }),
      },
      {
        pattern: /^select\s+last\s+(\d+)\s+words?$/i,
        handler: m => ({ unit: 'word', count: parseInt(m[1]), direction: 'last' }),
      },
      {
        pattern: /^select\s+last\s+sentence$/i,
        handler: () => ({ unit: 'sentence', count: 1, direction: 'last' }),
      },
      {
        pattern: /^select\s+last\s+(\d+)\s+sentences?$/i,
        handler: m => ({ unit: 'sentence', count: parseInt(m[1]), direction: 'last' }),
      },
      {
        pattern: /^select\s+last\s+paragraph$/i,
        handler: () => ({ unit: 'paragraph', count: 1, direction: 'last' }),
      },
      {
        pattern: /^select\s+last\s+line$/i,
        handler: () => ({ unit: 'line', count: 1, direction: 'last' }),
      },
      { pattern: /^select\s+["'](.+?)["']$/i, handler: m => ({ unit: 'text', text: m[1] }) },
      { pattern: /^select\s+(.+)$/i, handler: m => ({ unit: 'text', text: m[1] }) },
    ];

    // Navigation commands
    this.navigateCommands = [
      // Go to beginning/end
      {
        pattern: /^go\s+to\s+(?:the\s+)?beginning$/i,
        handler: () => ({ action: 'goto', position: 'start' }),
      },
      {
        pattern: /^go\s+to\s+(?:the\s+)?start$/i,
        handler: () => ({ action: 'goto', position: 'start' }),
      },
      {
        pattern: /^go\s+to\s+(?:the\s+)?end$/i,
        handler: () => ({ action: 'goto', position: 'end' }),
      },

      // Move cursor
      {
        pattern: /^move\s+left$/i,
        handler: () => ({ action: 'move', direction: 'left', unit: 'character', count: 1 }),
      },
      {
        pattern: /^move\s+right$/i,
        handler: () => ({ action: 'move', direction: 'right', unit: 'character', count: 1 }),
      },
      {
        pattern: /^move\s+up$/i,
        handler: () => ({ action: 'move', direction: 'up', unit: 'line', count: 1 }),
      },
      {
        pattern: /^move\s+down$/i,
        handler: () => ({ action: 'move', direction: 'down', unit: 'line', count: 1 }),
      },

      // Move by count
      {
        pattern: /^move\s+left\s+(\d+)\s+(?:words?|characters?)$/i,
        handler: m => ({ action: 'move', direction: 'left', unit: 'word', count: parseInt(m[1]) }),
      },
      {
        pattern: /^move\s+right\s+(\d+)\s+(?:words?|characters?)$/i,
        handler: m => ({ action: 'move', direction: 'right', unit: 'word', count: parseInt(m[1]) }),
      },
      {
        pattern: /^move\s+up\s+(\d+)\s+lines?$/i,
        handler: m => ({ action: 'move', direction: 'up', unit: 'line', count: parseInt(m[1]) }),
      },
      {
        pattern: /^move\s+down\s+(\d+)\s+lines?$/i,
        handler: m => ({ action: 'move', direction: 'down', unit: 'line', count: parseInt(m[1]) }),
      },

      // Go to line
      {
        pattern: /^go\s+to\s+line\s+(\d+)$/i,
        handler: m => ({ action: 'goto', position: 'line', line: parseInt(m[1]) }),
      },

      // Find/search
      { pattern: /^find\s+["'](.+?)["']$/i, handler: m => ({ action: 'find', text: m[1] }) },
      { pattern: /^find\s+(.+)$/i, handler: m => ({ action: 'find', text: m[1] }) },
      { pattern: /^next$/i, handler: () => ({ action: 'findNext' }) },
      { pattern: /^find\s+next$/i, handler: () => ({ action: 'findNext' }) },
      { pattern: /^previous$/i, handler: () => ({ action: 'findPrevious' }) },
      { pattern: /^find\s+previous$/i, handler: () => ({ action: 'findPrevious' }) },
    ];

    // Formatting commands (for rich text editors)
    this.formatCommands = [
      { pattern: /^bold\s+that$/i, handler: () => ({ format: 'bold', target: 'lastDictation' }) },
      {
        pattern: /^make\s+(?:that\s+)?bold$/i,
        handler: () => ({ format: 'bold', target: 'lastDictation' }),
      },
      {
        pattern: /^italicize\s+that$/i,
        handler: () => ({ format: 'italic', target: 'lastDictation' }),
      },
      {
        pattern: /^italic\s+that$/i,
        handler: () => ({ format: 'italic', target: 'lastDictation' }),
      },
      {
        pattern: /^make\s+(?:that\s+)?italic$/i,
        handler: () => ({ format: 'italic', target: 'lastDictation' }),
      },
      {
        pattern: /^underline\s+that$/i,
        handler: () => ({ format: 'underline', target: 'lastDictation' }),
      },
      {
        pattern: /^make\s+(?:that\s+)?underlined?$/i,
        handler: () => ({ format: 'underline', target: 'lastDictation' }),
      },

      // Paragraphs and lines
      { pattern: /^new\s+paragraph$/i, handler: () => ({ format: 'paragraph' }) },
      { pattern: /^new\s+line$/i, handler: () => ({ format: 'newline' }) },

      // Lists
      { pattern: /^bullet\s+point$/i, handler: () => ({ format: 'bulletList' }) },
      { pattern: /^numbered\s+list$/i, handler: () => ({ format: 'numberedList' }) },
      { pattern: /^number\s+list$/i, handler: () => ({ format: 'numberedList' }) },

      // Headings
      {
        pattern: /^heading\s+(\d)$/i,
        handler: m => ({ format: 'heading', level: parseInt(m[1]) }),
      },
      {
        pattern: /^make\s+(?:this\s+)?heading\s+(\d)$/i,
        handler: m => ({ format: 'heading', level: parseInt(m[1]) }),
      },

      // Quotes
      { pattern: /^quote\s+that$/i, handler: () => ({ format: 'quote', target: 'lastDictation' }) },
      { pattern: /^block\s+quote$/i, handler: () => ({ format: 'blockquote' }) },
    ];

    // All command groups for parsing
    this.commandGroups = [
      { type: CommandType.DELETE, commands: this.deleteCommands },
      { type: CommandType.UNDO, commands: this.undoRedoCommands },
      { type: CommandType.REPLACE, commands: this.replaceCommands },
      { type: CommandType.SELECT, commands: this.selectCommands },
      { type: CommandType.NAVIGATE, commands: this.navigateCommands },
      { type: CommandType.FORMAT, commands: this.formatCommands },
    ];
  }

  /**
   * Parse transcript for commands
   * @param {string} transcript - The speech transcript
   * @returns {CommandResult} - Parsed command result
   */
  parse(transcript) {
    if (!this.settings.enabled || !transcript) {
      return {
        type: CommandType.TEXT,
        command: null,
        params: null,
        remainingText: transcript,
        consumed: false,
      };
    }

    const trimmedText = transcript.trim();

    // Try to match against each command group
    for (const group of this.commandGroups) {
      for (const cmd of group.commands) {
        const match = trimmedText.match(cmd.pattern);
        if (match) {
          const params = cmd.handler(match);
          return {
            type: group.type,
            command: match[0],
            params,
            remainingText: '',
            consumed: true,
          };
        }
      }
    }

    // Check if transcript starts with a command (partial match)
    // This allows "delete last word hello world" to delete and keep "hello world"
    for (const group of this.commandGroups) {
      for (const cmd of group.commands) {
        // Create a pattern that matches at the start
        const startPattern = new RegExp(
          '^' + cmd.pattern.source.replace(/\$$/, ''),
          cmd.pattern.flags
        );
        const match = trimmedText.match(startPattern);
        if (match && match[0].length < trimmedText.length) {
          const params = cmd.handler(match);
          const remaining = trimmedText.slice(match[0].length).trim();
          return {
            type: group.type,
            command: match[0],
            params,
            remainingText: remaining,
            consumed: false,
          };
        }
      }
    }

    // No command matched - return as regular text
    return {
      type: CommandType.TEXT,
      command: null,
      params: null,
      remainingText: transcript,
      consumed: false,
    };
  }

  /**
   * Save current state to history
   * @param {HTMLElement} element - Target element
   */
  saveToHistory(element) {
    if (!element) {
      return;
    }

    const state = this.getElementState(element);

    // Remove any redo history if we're adding new edits
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }

    // Add new state
    this.history.push(state);
    this.historyIndex = this.history.length - 1;

    // Limit history size
    if (this.history.length > this.settings.maxHistorySize) {
      this.history.shift();
      this.historyIndex--;
    }

    this.currentElement = element;
  }

  /**
   * Get current state of an element
   * @param {HTMLElement} element
   * @returns {HistoryEntry}
   */
  getElementState(element) {
    if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
      return {
        text: element.value,
        cursorStart: element.selectionStart,
        cursorEnd: element.selectionEnd,
        timestamp: Date.now(),
      };
    } else if (element.isContentEditable) {
      const selection = window.getSelection();
      return {
        text: element.innerHTML,
        cursorStart: selection.anchorOffset,
        cursorEnd: selection.focusOffset,
        timestamp: Date.now(),
      };
    }
    return null;
  }

  /**
   * Restore state to element
   * @param {HTMLElement} element
   * @param {HistoryEntry} state
   */
  restoreElementState(element, state) {
    if (!state) {
      return;
    }

    if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
      element.value = state.text;
      element.selectionStart = state.cursorStart;
      element.selectionEnd = state.cursorEnd;
      element.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (element.isContentEditable) {
      element.innerHTML = state.text;
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  /**
   * Execute undo
   * @param {HTMLElement} element
   * @param {number} count - Number of undos
   * @returns {boolean} - Success
   */
  undo(element, count = 1) {
    if (this.historyIndex < 1) {
      this.onError(new Error('Nothing to undo'));
      return false;
    }

    // Save current state first if not already saved
    if (this.history.length === 0 || this.historyIndex === this.history.length - 1) {
      this.saveToHistory(element);
    }

    const targetIndex = Math.max(0, this.historyIndex - count);
    this.historyIndex = targetIndex;
    this.restoreElementState(element, this.history[targetIndex]);

    this.onCommandExecuted({
      type: CommandType.UNDO,
      message: `Undid ${count} change${count > 1 ? 's' : ''}`,
    });

    return true;
  }

  /**
   * Execute redo
   * @param {HTMLElement} element
   * @param {number} count - Number of redos
   * @returns {boolean} - Success
   */
  redo(element, count = 1) {
    if (this.historyIndex >= this.history.length - 1) {
      this.onError(new Error('Nothing to redo'));
      return false;
    }

    const targetIndex = Math.min(this.history.length - 1, this.historyIndex + count);
    this.historyIndex = targetIndex;
    this.restoreElementState(element, this.history[targetIndex]);

    this.onCommandExecuted({
      type: CommandType.REDO,
      message: `Redid ${count} change${count > 1 ? 's' : ''}`,
    });

    return true;
  }

  /**
   * Execute delete command
   * @param {HTMLElement} element
   * @param {Object} params - Delete parameters
   * @param {string} lastDictation - Last dictated text for "delete that"
   * @returns {boolean} - Success
   */
  executeDelete(element, params, lastDictation = '') {
    if (!element) {
      return false;
    }

    // Save state before deletion
    this.saveToHistory(element);

    const text =
      element.tagName === 'TEXTAREA' || element.tagName === 'INPUT'
        ? element.value
        : element.textContent;

    let newText = text;
    let deletedText = '';
    let cursorPos = element.selectionStart || text.length;

    switch (params.unit) {
      case 'word':
        const result = this.deleteWords(text, cursorPos, params.count);
        newText = result.text;
        deletedText = result.deleted;
        cursorPos = result.cursor;
        break;

      case 'sentence':
        const sentResult = this.deleteSentences(text, cursorPos, params.count);
        newText = sentResult.text;
        deletedText = sentResult.deleted;
        cursorPos = sentResult.cursor;
        break;

      case 'paragraph':
        const paraResult = this.deleteParagraphs(text, cursorPos, params.count);
        newText = paraResult.text;
        deletedText = paraResult.deleted;
        cursorPos = paraResult.cursor;
        break;

      case 'character':
        const charResult = this.deleteCharacters(text, cursorPos, params.count);
        newText = charResult.text;
        deletedText = charResult.deleted;
        cursorPos = charResult.cursor;
        break;

      case 'line':
        const lineResult = this.deleteLines(text, cursorPos, params.count);
        newText = lineResult.text;
        deletedText = lineResult.deleted;
        cursorPos = lineResult.cursor;
        break;

      case 'lastDictation':
        if (lastDictation) {
          const lastPos = text.lastIndexOf(lastDictation);
          if (lastPos !== -1) {
            newText = text.slice(0, lastPos) + text.slice(lastPos + lastDictation.length);
            deletedText = lastDictation;
            cursorPos = lastPos;
          }
        }
        break;

      case 'selection':
        if (element.selectionStart !== element.selectionEnd) {
          const start = element.selectionStart;
          const end = element.selectionEnd;
          deletedText = text.slice(start, end);
          newText = text.slice(0, start) + text.slice(end);
          cursorPos = start;
        }
        break;

      case 'all':
        deletedText = text;
        newText = '';
        cursorPos = 0;
        break;

      case 'text':
        if (params.text) {
          const pos = text.indexOf(params.text);
          if (pos !== -1) {
            newText = text.slice(0, pos) + text.slice(pos + params.text.length);
            deletedText = params.text;
            cursorPos = pos;
          }
        }
        break;
    }

    // Apply changes
    if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
      element.value = newText;
      element.selectionStart = cursorPos;
      element.selectionEnd = cursorPos;
      element.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (element.isContentEditable) {
      element.textContent = newText;
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }

    this.onCommandExecuted({
      type: CommandType.DELETE,
      message: deletedText
        ? `Deleted "${deletedText.substring(0, 30)}${deletedText.length > 30 ? '...' : ''}"`
        : 'Deleted',
      deletedText,
    });

    return true;
  }

  /**
   * Delete words from text
   */
  deleteWords(text, cursorPos, count) {
    const beforeCursor = text.slice(0, cursorPos);
    const afterCursor = text.slice(cursorPos);

    // Find word boundaries before cursor
    const words = beforeCursor.trimEnd().split(/\s+/);
    const wordsToKeep = words.slice(0, Math.max(0, words.length - count));

    const newBefore = wordsToKeep.length > 0 ? wordsToKeep.join(' ') + ' ' : '';
    const deleted = words.slice(-count).join(' ');

    return {
      text: newBefore + afterCursor,
      deleted,
      cursor: newBefore.length,
    };
  }

  /**
   * Delete sentences from text
   */
  deleteSentences(text, cursorPos, count) {
    const beforeCursor = text.slice(0, cursorPos);

    // Split by sentence endings
    const sentences = beforeCursor.split(/(?<=[.!?])\s+/);
    const toKeep = sentences.slice(0, Math.max(0, sentences.length - count));

    const newBefore = toKeep.length > 0 ? toKeep.join(' ') + ' ' : '';
    const deleted = sentences.slice(-count).join(' ');

    return {
      text: newBefore + text.slice(cursorPos),
      deleted,
      cursor: newBefore.length,
    };
  }

  /**
   * Delete paragraphs from text
   */
  deleteParagraphs(text, cursorPos, count) {
    const beforeCursor = text.slice(0, cursorPos);

    const paragraphs = beforeCursor.split(/\n\n+/);
    const toKeep = paragraphs.slice(0, Math.max(0, paragraphs.length - count));

    const newBefore = toKeep.length > 0 ? toKeep.join('\n\n') + '\n\n' : '';
    const deleted = paragraphs.slice(-count).join('\n\n');

    return {
      text: newBefore + text.slice(cursorPos),
      deleted,
      cursor: newBefore.length,
    };
  }

  /**
   * Delete characters from text
   */
  deleteCharacters(text, cursorPos, count) {
    const deleteStart = Math.max(0, cursorPos - count);
    const deleted = text.slice(deleteStart, cursorPos);

    return {
      text: text.slice(0, deleteStart) + text.slice(cursorPos),
      deleted,
      cursor: deleteStart,
    };
  }

  /**
   * Delete lines from text
   */
  deleteLines(text, cursorPos, count) {
    const beforeCursor = text.slice(0, cursorPos);

    const lines = beforeCursor.split('\n');
    const toKeep = lines.slice(0, Math.max(0, lines.length - count));

    const newBefore = toKeep.length > 0 ? toKeep.join('\n') + '\n' : '';
    const deleted = lines.slice(-count).join('\n');

    return {
      text: newBefore + text.slice(cursorPos),
      deleted,
      cursor: newBefore.length,
    };
  }

  /**
   * Execute replace command
   * @param {HTMLElement} element
   * @param {Object} params - Replace parameters
   * @param {string} lastDictation - Last dictated text for "replace that"
   * @returns {boolean} - Success
   */
  executeReplace(element, params, lastDictation = '') {
    if (!element) {
      return false;
    }

    // Save state before replacement
    this.saveToHistory(element);

    const text =
      element.tagName === 'TEXTAREA' || element.tagName === 'INPUT'
        ? element.value
        : element.textContent;

    let findText = params.find;

    // Handle "replace that" - use last dictation
    if (findText === 'lastDictation') {
      findText = lastDictation;
    }

    if (!findText) {
      this.onError(new Error('No text to replace'));
      return false;
    }

    const pos = text.indexOf(findText);
    if (pos === -1) {
      this.onError(new Error(`Could not find "${findText}"`));
      return false;
    }

    const newText = text.slice(0, pos) + params.replace + text.slice(pos + findText.length);
    const cursorPos = pos + params.replace.length;

    // Apply changes
    if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
      element.value = newText;
      element.selectionStart = cursorPos;
      element.selectionEnd = cursorPos;
      element.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (element.isContentEditable) {
      element.textContent = newText;
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }

    this.onCommandExecuted({
      type: CommandType.REPLACE,
      message: `Replaced "${findText}" with "${params.replace}"`,
    });

    return true;
  }

  /**
   * Execute select command
   * @param {HTMLElement} element
   * @param {Object} params - Select parameters
   * @returns {boolean} - Success
   */
  executeSelect(element, params) {
    if (!element) {
      return false;
    }

    const text =
      element.tagName === 'TEXTAREA' || element.tagName === 'INPUT'
        ? element.value
        : element.textContent;

    let start = 0;
    let end = text.length;

    switch (params.unit) {
      case 'all':
        start = 0;
        end = text.length;
        break;

      case 'word':
        if (params.direction === 'last') {
          const cursorPos = element.selectionStart || text.length;
          const beforeCursor = text.slice(0, cursorPos);
          const words = beforeCursor.trimEnd().split(/\s+/);
          const wordsToSelect = words.slice(-params.count);
          const selectText = wordsToSelect.join(' ');
          start = beforeCursor.lastIndexOf(selectText);
          end = cursorPos;
        }
        break;

      case 'sentence':
        if (params.direction === 'last') {
          const cursorPos = element.selectionStart || text.length;
          const beforeCursor = text.slice(0, cursorPos);
          const sentences = beforeCursor.split(/(?<=[.!?])\s+/);
          const toSelect = sentences.slice(-params.count);
          const selectText = toSelect.join(' ');
          start = beforeCursor.lastIndexOf(selectText);
          end = cursorPos;
        }
        break;

      case 'text':
        if (params.text) {
          start = text.indexOf(params.text);
          if (start !== -1) {
            end = start + params.text.length;
          }
        }
        break;
    }

    // Apply selection
    if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
      element.selectionStart = start;
      element.selectionEnd = end;
      element.focus();
    } else if (element.isContentEditable) {
      const range = document.createRange();
      const textNode = element.firstChild;
      if (textNode) {
        range.setStart(textNode, start);
        range.setEnd(textNode, end);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }

    this.onCommandExecuted({
      type: CommandType.SELECT,
      message: `Selected ${end - start} characters`,
    });

    return true;
  }

  /**
   * Get all available commands as a list
   * @returns {Array<{category: string, commands: string[]}>}
   */
  getAvailableCommands() {
    return [
      {
        category: 'Delete',
        commands: [
          'Delete last word',
          'Delete last [N] words',
          'Delete last sentence',
          'Delete last paragraph',
          'Delete that / Scratch that',
          'Delete all',
          'Delete "[text]"',
        ],
      },
      {
        category: 'Undo/Redo',
        commands: ['Undo', 'Undo [N] times', 'Redo', 'Redo [N] times'],
      },
      {
        category: 'Replace',
        commands: [
          'Replace [word] with [word]',
          'Change [phrase] to [phrase]',
          'Replace that with [word]',
          'Correct [word] to [word]',
        ],
      },
      {
        category: 'Select',
        commands: [
          'Select all',
          'Select last word',
          'Select last [N] words',
          'Select last sentence',
          'Select "[text]"',
        ],
      },
      {
        category: 'Navigate',
        commands: [
          'Go to beginning',
          'Go to end',
          'Move left/right',
          'Move up/down',
          'Go to line [N]',
          'Find "[text]"',
          'Next / Previous',
        ],
      },
      {
        category: 'Format',
        commands: [
          'Bold that',
          'Italic that',
          'Underline that',
          'New paragraph',
          'New line',
          'Bullet point',
          'Numbered list',
          'Heading [1-6]',
        ],
      },
    ];
  }

  /**
   * Update settings
   * @param {Object} newSettings
   */
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
  }

  /**
   * Clear history
   */
  clearHistory() {
    this.history = [];
    this.historyIndex = -1;
  }

  /**
   * Destroy and cleanup
   */
  destroy() {
    this.history = [];
    this.historyIndex = -1;
    this.currentElement = null;
  }
}

export default CommandParser;
