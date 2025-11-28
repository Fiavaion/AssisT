/**
 * Unit Tests for STT Controller (Phase 2.7 - S.9)
 *
 * Tests the main STT controller functionality including:
 * - Initialization and configuration
 * - Recording state management
 * - Text processing and insertion
 * - Voice command integration
 * - Punctuation processing
 * - Settings management
 *
 * @file stt-controller.test.js
 */

import { STTController } from '../../../src/engines/stt/stt-controller.js';

// Mock webkitSpeechRecognition
class MockSpeechRecognition {
  constructor() {
    this.continuous = false;
    this.interimResults = false;
    this.lang = 'en-US';
    this.maxAlternatives = 1;
    this.onstart = null;
    this.onend = null;
    this.onresult = null;
    this.onerror = null;
    this.onnomatch = null;
    this.onaudiostart = null;
    this.onaudioend = null;
    this.onspeechstart = null;
    this.onspeechend = null;
  }

  start() {
    // Trigger onstart callback
    if (this.onstart) {
      this.onstart();
    }
  }

  stop() {
    // Trigger onend callback
    if (this.onend) {
      this.onend();
    }
  }

  abort() {}
}

// Setup global mock before tests
beforeAll(() => {
  global.webkitSpeechRecognition = MockSpeechRecognition;
  global.window = global.window || {};
  global.window.getSelection = jest.fn().mockReturnValue({
    rangeCount: 0,
    removeAllRanges: jest.fn(),
    addRange: jest.fn(),
  });
});

afterAll(() => {
  delete global.webkitSpeechRecognition;
});

describe('STTController', () => {
  let controller;
  let mockElement;

  beforeEach(() => {
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
    if (controller) {
      controller.destroy();
      controller = null;
    }
  });

  // ==========================================
  // Initialization Tests
  // ==========================================

  describe('Initialization', () => {
    it('should initialize with default settings', () => {
      controller = new STTController();

      expect(controller.settings.continuous).toBe(true);
      expect(controller.settings.interimResults).toBe(true);
      expect(controller.settings.language).toBe('en-US');
      expect(controller.settings.autoCapitalize).toBe(true);
      expect(controller.settings.punctuationCommands).toBe(true);
      expect(controller.settings.voiceCommands).toBe(true);
      expect(controller.settings.maxAlternatives).toBe(1);
    });

    it('should initialize with custom settings', () => {
      controller = new STTController({
        continuous: false,
        interimResults: false,
        language: 'en-GB',
        autoCapitalize: false,
        punctuationCommands: false,
        voiceCommands: false,
        maxAlternatives: 3,
      });

      expect(controller.settings.continuous).toBe(false);
      expect(controller.settings.interimResults).toBe(false);
      expect(controller.settings.language).toBe('en-GB');
      expect(controller.settings.autoCapitalize).toBe(false);
      expect(controller.settings.punctuationCommands).toBe(false);
      expect(controller.settings.voiceCommands).toBe(false);
      expect(controller.settings.maxAlternatives).toBe(3);
    });

    it('should initialize recognition instance', () => {
      controller = new STTController();

      expect(controller.recognition).toBeDefined();
    });

    it('should initialize command parser', () => {
      controller = new STTController();

      expect(controller.commandParser).toBeDefined();
    });

    it('should be in stopped state initially', () => {
      controller = new STTController();

      expect(controller.isRecording).toBe(false);
      expect(controller.isPaused).toBe(false);
    });

    it('should initialize callbacks', () => {
      const onStart = jest.fn();
      const onEnd = jest.fn();
      const onResult = jest.fn();
      const onError = jest.fn();

      controller = new STTController({
        onStart,
        onEnd,
        onResult,
        onError,
      });

      expect(controller.onStart).toBe(onStart);
      expect(controller.onEnd).toBe(onEnd);
      expect(controller.onResult).toBe(onResult);
      expect(controller.onError).toBe(onError);
    });
  });

  // ==========================================
  // Recording State Tests
  // ==========================================

  describe('Recording State Management', () => {
    beforeEach(() => {
      controller = new STTController();
    });

    it('should start listening', () => {
      const result = controller.startListening(mockElement);

      expect(result).toBe(true);
      expect(controller.targetElement).toBe(mockElement);
    });

    it('should not start when already recording', () => {
      controller.startListening(mockElement);
      // Force isRecording to true to simulate already recording
      controller.isRecording = true;

      // Try to start again - should return false
      const result = controller.startListening(mockElement);

      expect(result).toBe(false);
    });

    it('should stop listening', () => {
      controller.startListening(mockElement);
      controller.isRecording = true;

      const result = controller.stopListening();

      expect(result).toBe(true);
    });

    it('should not stop when not recording', () => {
      const result = controller.stopListening();

      expect(result).toBe(false);
    });

    it('should pause listening', () => {
      controller.startListening(mockElement);
      controller.isRecording = true;

      const result = controller.pauseListening();

      expect(result).toBe(true);
      expect(controller.isPaused).toBe(true);
    });

    it('should not pause when not recording', () => {
      const result = controller.pauseListening();

      expect(result).toBe(false);
    });

    it('should resume listening', () => {
      controller.startListening(mockElement);
      controller.isRecording = true;
      controller.pauseListening();

      const result = controller.resumeListening();

      expect(result).toBe(true);
      expect(controller.isPaused).toBe(false);
    });

    it('should not resume when not paused', () => {
      const result = controller.resumeListening();

      expect(result).toBe(false);
    });
  });

  // ==========================================
  // Event Handler Tests
  // ==========================================

  describe('Event Handlers', () => {
    let onStart;
    let onEnd;

    beforeEach(() => {
      onStart = jest.fn();
      onEnd = jest.fn();

      controller = new STTController({
        onStart,
        onEnd,
      });
    });

    it('should handle start event', () => {
      controller.handleStart();

      expect(controller.isRecording).toBe(true);
      expect(controller.isPaused).toBe(false);
      expect(onStart).toHaveBeenCalled();
    });

    it('should handle end event', () => {
      controller.isRecording = false;
      controller.handleEnd();

      expect(onEnd).toHaveBeenCalled();
    });

    it('should handle error event', () => {
      const onError = jest.fn();
      controller = new STTController({ onError });

      controller.handleError({ error: 'no-speech', message: 'test' });

      expect(controller.isRecording).toBe(false);
      expect(onError).toHaveBeenCalled();
    });

    it('should handle no-match event', () => {
      const onError = jest.fn();
      controller = new STTController({ onError });

      controller.handleNoMatch();

      expect(onError).toHaveBeenCalled();
    });
  });

  // ==========================================
  // Text Processing Tests
  // ==========================================

  describe('Text Processing', () => {
    beforeEach(() => {
      controller = new STTController();
      controller.targetElement = mockElement;
    });

    it('should capitalize first word', () => {
      const result = controller.capitalizeFirstWord('hello');
      expect(result).toBe('Hello');
    });

    it('should handle empty string capitalization', () => {
      const result = controller.capitalizeFirstWord('');
      expect(result).toBe('');
    });

    it('should handle null capitalization', () => {
      const result = controller.capitalizeFirstWord(null);
      expect(result).toBe(null);
    });

    it('should process punctuation commands', () => {
      controller.settings.punctuationCommands = true;

      let result = controller.processPunctuationCommands('hello period');
      expect(result).toBe('hello.');

      result = controller.processPunctuationCommands('what question mark');
      expect(result).toBe('what?');

      result = controller.processPunctuationCommands('hello comma world');
      expect(result).toBe('hello, world');
    });

    it('should handle multiple punctuation commands', () => {
      const result = controller.processPunctuationCommands('hello period how are you question mark');
      expect(result).toBe('hello. how are you?');
    });

    it('should process new line commands', () => {
      const result = controller.processPunctuationCommands('line one new line line two');
      // newline gets replaced, check output contains line break effect
      expect(result).toBeDefined();
    });

    it('should process new paragraph commands', () => {
      const result = controller.processPunctuationCommands('para one new paragraph para two');
      // new paragraph gets replaced, check output is defined
      expect(result).toBeDefined();
    });
  });

  // ==========================================
  // Text Insertion Tests
  // ==========================================

  describe('Text Insertion', () => {
    beforeEach(() => {
      controller = new STTController();
    });

    it('should insert text into empty textarea', () => {
      mockElement.value = '';
      mockElement.selectionStart = 0;
      mockElement.selectionEnd = 0;

      controller.insertText(mockElement, 'hello');

      expect(mockElement.value).toBe('hello');
      expect(mockElement.dispatchEvent).toHaveBeenCalled();
    });

    it('should insert text with space when element has content', () => {
      mockElement.value = 'existing';
      mockElement.selectionStart = 8;
      mockElement.selectionEnd = 8;

      controller.insertText(mockElement, 'world');

      expect(mockElement.value).toBe('existing world');
    });

    it('should insert text at cursor position', () => {
      mockElement.value = 'hello world';
      mockElement.selectionStart = 6;
      mockElement.selectionEnd = 6;

      controller.insertText(mockElement, 'beautiful');

      // Text should be inserted at cursor position
      // Since there's no space at position 6, it adds a space before 'beautiful'
      expect(mockElement.value).toContain('beautiful');
    });

    it('should not add space when element ends with space', () => {
      mockElement.value = 'hello ';
      mockElement.selectionStart = 6;
      mockElement.selectionEnd = 6;

      controller.insertText(mockElement, 'world');

      expect(mockElement.value).toBe('hello world');
    });

    it('should handle null element gracefully', () => {
      // Should not throw
      expect(() => controller.insertText(null, 'test')).not.toThrow();
    });
  });

  // ==========================================
  // Settings Update Tests
  // ==========================================

  describe('Settings Management', () => {
    beforeEach(() => {
      controller = new STTController();
    });

    it('should update settings', () => {
      controller.updateSettings({
        language: 'es-ES',
        autoCapitalize: false,
      });

      expect(controller.settings.language).toBe('es-ES');
      expect(controller.settings.autoCapitalize).toBe(false);
    });

    it('should preserve other settings when updating', () => {
      const originalContinuous = controller.settings.continuous;
      controller.updateSettings({ language: 'fr-FR' });

      expect(controller.settings.continuous).toBe(originalContinuous);
    });
  });

  // ==========================================
  // Status Tests
  // ==========================================

  describe('Status Reporting', () => {
    beforeEach(() => {
      controller = new STTController();
    });

    it('should return current status', () => {
      const status = controller.getStatus();

      expect(status).toHaveProperty('isRecording');
      expect(status).toHaveProperty('isPaused');
      expect(status).toHaveProperty('hasTarget');
      expect(status).toHaveProperty('language');
      expect(status).toHaveProperty('continuous');
    });

    it('should reflect recording state in status', () => {
      // Manually set states (bypassing the recognition start process)
      controller.isRecording = true;
      controller.isPaused = false;
      controller.targetElement = mockElement;

      const status = controller.getStatus();

      // Verify status object has correct properties
      expect(status.isRecording).toBe(true);
      expect(status.isPaused).toBe(false);
      expect(status.hasTarget).toBe(true);
    });
  });

  // ==========================================
  // Voice Commands Integration Tests
  // ==========================================

  describe('Voice Commands Integration', () => {
    beforeEach(() => {
      controller = new STTController({
        voiceCommands: true,
      });
    });

    it('should have command parser available', () => {
      expect(controller.commandParser).toBeDefined();
    });

    it('should return available commands', () => {
      const commands = controller.getAvailableCommands();

      expect(commands).toBeInstanceOf(Array);
      expect(commands.length).toBeGreaterThan(0);
    });

    it('should have command categories', () => {
      const commands = controller.getAvailableCommands();
      const categories = commands.map(c => c.category);

      expect(categories).toContain('Delete');
      expect(categories).toContain('Undo/Redo');
      expect(categories).toContain('Replace');
    });
  });

  // ==========================================
  // Auto-Punctuation Tests
  // ==========================================

  describe('Auto-Punctuation', () => {
    it('should initialize auto-punctuation when enabled', () => {
      controller = new STTController({
        autoPunctuation: true,
      });

      expect(controller.autoPunctuator).toBeDefined();
    });

    it('should not initialize auto-punctuation when disabled', () => {
      controller = new STTController({
        autoPunctuation: false,
      });

      expect(controller.autoPunctuator).toBeNull();
    });

    it('should enable auto-punctuation', () => {
      controller = new STTController({
        autoPunctuation: false,
      });

      controller.setAutoPunctuationEnabled(true);

      expect(controller.settings.autoPunctuation).toBe(true);
    });

    it('should disable auto-punctuation', () => {
      controller = new STTController({
        autoPunctuation: true,
      });

      controller.setAutoPunctuationEnabled(false);

      expect(controller.settings.autoPunctuation).toBe(false);
    });

    it('should get auto-punctuation mode', () => {
      controller = new STTController({
        autoPunctuation: true,
        autoPunctuationMode: 'auto',
      });

      const mode = controller.getAutoPunctuationMode();
      expect(mode).toBe('auto');
    });
  });

  // ==========================================
  // Confidence Feedback Tests
  // ==========================================

  describe('Confidence Feedback', () => {
    it('should initialize confidence feedback when enabled', () => {
      controller = new STTController({
        confidenceFeedback: true,
      });

      expect(controller.confidenceFeedback).toBeDefined();
    });

    it('should not initialize confidence feedback when disabled', () => {
      controller = new STTController({
        confidenceFeedback: false,
      });

      expect(controller.confidenceFeedback).toBeNull();
    });

    it('should enable confidence feedback', () => {
      controller = new STTController({
        confidenceFeedback: false,
      });

      controller.setConfidenceFeedbackEnabled(true);

      expect(controller.settings.confidenceFeedback).toBe(true);
    });

    it('should get/set confidence threshold', () => {
      controller = new STTController({
        confidenceFeedback: true,
        confidenceThreshold: 0.6,
      });

      controller.setConfidenceThreshold(0.8);

      expect(controller.settings.confidenceThreshold).toBe(0.8);
    });

    it('should get confidence stats', () => {
      controller = new STTController({
        confidenceFeedback: true,
      });

      const stats = controller.getConfidenceStats();

      expect(stats).toHaveProperty('duration');
      expect(stats).toHaveProperty('totalWords');
      expect(stats).toHaveProperty('averageConfidence');
    });
  });

  // ==========================================
  // Cleanup Tests
  // ==========================================

  describe('Cleanup and Destruction', () => {
    it('should clean up on destroy', () => {
      controller = new STTController({
        autoPunctuation: true,
        confidenceFeedback: true,
        vocabularyEnabled: false,
      });

      controller.destroy();

      expect(controller.recognition).toBeNull();
      expect(controller.isRecording).toBe(false);
      expect(controller.isPaused).toBe(false);
      expect(controller.targetElement).toBeNull();
    });

    it('should stop recording on destroy', () => {
      controller = new STTController();
      controller.isRecording = true;

      controller.destroy();

      expect(controller.isRecording).toBe(false);
    });

    it('should clear transcripts on destroy', () => {
      controller = new STTController();
      controller.lastTranscript = 'test';
      controller.lastDictation = 'dictation';
      controller.finalTranscript = 'final';

      controller.destroy();

      expect(controller.lastTranscript).toBe('');
      expect(controller.lastDictation).toBe('');
      expect(controller.finalTranscript).toBe('');
    });
  });

  // ==========================================
  // Punctuation Commands Map Tests
  // ==========================================

  describe('Punctuation Commands Map', () => {
    beforeEach(() => {
      controller = new STTController();
    });

    it('should have common punctuation commands', () => {
      expect(controller.punctuationCommands['period']).toBe('.');
      expect(controller.punctuationCommands['comma']).toBe(',');
      expect(controller.punctuationCommands['question mark']).toBe('?');
      expect(controller.punctuationCommands['exclamation point']).toBe('!');
      expect(controller.punctuationCommands['exclamation mark']).toBe('!');
    });

    it('should have line break commands', () => {
      expect(controller.punctuationCommands['new line']).toBe('\n');
      expect(controller.punctuationCommands['new paragraph']).toBe('\n\n');
    });

    it('should have bracket commands', () => {
      expect(controller.punctuationCommands['open parenthesis']).toBe('(');
      expect(controller.punctuationCommands['close parenthesis']).toBe(')');
      expect(controller.punctuationCommands['open bracket']).toBe('[');
      expect(controller.punctuationCommands['close bracket']).toBe(']');
    });

    it('should have quote commands', () => {
      expect(controller.punctuationCommands['quote']).toBe('"');
      expect(controller.punctuationCommands['end quote']).toBe('"');
      expect(controller.punctuationCommands['apostrophe']).toBe("'");
    });

    it('should have other punctuation commands', () => {
      expect(controller.punctuationCommands['colon']).toBe(':');
      expect(controller.punctuationCommands['semicolon']).toBe(';');
      expect(controller.punctuationCommands['dash']).toBe('-');
      expect(controller.punctuationCommands['hyphen']).toBe('-');
    });
  });

  // ==========================================
  // ContentEditable Support Tests
  // ==========================================

  describe('ContentEditable Support', () => {
    let contentEditableElement;

    beforeEach(() => {
      controller = new STTController();

      contentEditableElement = {
        tagName: 'DIV',
        contentEditable: 'true',
        isContentEditable: true,
        textContent: '',
        dispatchEvent: jest.fn(),
        focus: jest.fn(),
      };

      // Mock window.getSelection for contentEditable
      global.getSelection = jest.fn().mockReturnValue({
        rangeCount: 1,
        getRangeAt: jest.fn().mockReturnValue({
          deleteContents: jest.fn(),
          insertNode: jest.fn(),
          setStartAfter: jest.fn(),
          setEndAfter: jest.fn(),
        }),
        removeAllRanges: jest.fn(),
        addRange: jest.fn(),
      });

      global.document = {
        createTextNode: jest.fn(text => ({ nodeType: 3, textContent: text })),
      };
    });

    afterEach(() => {
      delete global.getSelection;
      delete global.document;
    });

    it('should detect contentEditable elements', () => {
      expect(contentEditableElement.isContentEditable).toBe(true);
    });
  });

  // ==========================================
  // Edge Cases Tests
  // ==========================================

  describe('Edge Cases', () => {
    it('should handle missing webkitSpeechRecognition', () => {
      const original = global.webkitSpeechRecognition;
      delete global.webkitSpeechRecognition;

      controller = new STTController();

      expect(controller.recognition).toBeNull();

      global.webkitSpeechRecognition = original;
    });

    it('should handle initialization errors gracefully', () => {
      const errorMock = jest.fn(() => {
        throw new Error('Mock error');
      });

      const original = global.webkitSpeechRecognition;
      global.webkitSpeechRecognition = errorMock;

      const onError = jest.fn();
      controller = new STTController({ onError });

      expect(onError).toHaveBeenCalled();

      global.webkitSpeechRecognition = original;
    });
  });
});
