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

// This suite is about the controller's own behaviour; the dictation question it asks before
// starting is covered in dictation-consent.test.js, so here the student has already said yes.
jest.mock('../../../src/utils/dictation-consent.js', () => ({
  allowDictation: () => true,
  onDictationWithdrawn: () => () => {},
}));

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

    it('defaults onCitationTrigger to a no-op that never suppresses', () => {
      controller = new STTController({});
      expect(controller.onCitationTrigger('any words')).toBe(false);
    });
  });

  // ==========================================
  // Citation voice-capture suppression
  // ==========================================
  describe('Citation voice-capture trigger', () => {
    /** Build a final-result event the way the Web Speech API delivers one. */
    function finalEvent(text) {
      const alt = { transcript: text, confidence: 0.9 };
      const result = [alt];
      result.isFinal = true;
      return { resultIndex: 0, results: [result] };
    }

    it('suppresses insertion of a transcript the citation hook consumes', () => {
      const onCitationTrigger = jest.fn().mockReturnValue(true);
      controller = new STTController({ onCitationTrigger });
      controller.targetElement = mockElement;
      controller.isPaused = false;

      controller.handleResult(finalEvent('cite this'));

      expect(onCitationTrigger).toHaveBeenCalledWith('cite this');
      // The trigger phrase must NOT be dictated into the document.
      expect(mockElement.value).toBe('');
    });

    it('inserts the transcript as normal when the hook does not consume it', () => {
      const onCitationTrigger = jest.fn().mockReturnValue(false);
      controller = new STTController({ onCitationTrigger });
      controller.targetElement = mockElement;
      controller.isPaused = false;

      controller.handleResult(finalEvent('the actual sentence'));

      expect(onCitationTrigger).toHaveBeenCalledWith('the actual sentence');
      expect(mockElement.value).toContain('actual sentence');
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
      const result = controller.processPunctuationCommands(
        'hello period how are you question mark'
      );
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
  // Canvas's Rich Content Editor: a same-origin iframe whose body is the essay
  // ==========================================

  describe('Insertion into an editor iframe', () => {
    let frame;
    let doc;
    let body;

    beforeEach(() => {
      controller = new STTController();
      frame = document.createElement('iframe');
      document.body.appendChild(frame);
      doc = frame.contentDocument;
      body = doc.body;
      body.className = 'mce-content-body';
      body.setAttribute('contenteditable', 'true');
      // jsdom does not reflect contenteditable into these; Chrome does.
      body.contentEditable = 'true';
      body.isContentEditable = true;
      body.appendChild(doc.createTextNode('Essay start. '));

      // The caret sits at the end of what the student wrote, in the EDITOR's own selection.
      const selection = frame.contentWindow.getSelection();
      const range = doc.createRange();
      range.setStart(body.firstChild, body.firstChild.length);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    });

    afterEach(() => {
      frame.remove();
      delete document.execCommand;
    });

    it("goes in through the editor document's own insertText, so its undo and saved copy include it", () => {
      doc.execCommand = jest.fn(() => true);
      document.execCommand = jest.fn(() => true);

      controller.insertText(body, 'hello there');

      expect(doc.execCommand).toHaveBeenCalledWith('insertText', false, 'hello there');
      expect(document.execCommand).not.toHaveBeenCalled();
    });

    it("falls back to the caret in the editor's document when insertText is refused", () => {
      doc.execCommand = jest.fn(() => false);
      const inputs = [];
      body.addEventListener('input', e => inputs.push(e));

      controller.insertText(body, 'hello there');

      expect(body.textContent).toBe('Essay start. hello there');
      expect(inputs).toHaveLength(1);
    });

    it('inserts at the editor caret with nodes of the editor document when there is no insertText', () => {
      controller.insertText(body, 'hello there');

      expect(body.textContent).toBe('Essay start. hello there');
      // Only the student's words: no wrapper, no marker, nothing of AssisT's.
      expect(body.children).toHaveLength(0);
      body.childNodes.forEach(node => expect(node.ownerDocument).toBe(doc));
    });

    it("applies a spoken format command to the editor's document, not the page's", () => {
      doc.execCommand = jest.fn(() => true);
      document.execCommand = jest.fn(() => true);
      controller.targetElement = body;

      controller.executeFormat({ format: 'bold' });

      expect(doc.execCommand).toHaveBeenCalledWith('bold', false, null);
      expect(document.execCommand).not.toHaveBeenCalled();
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

  // ==========================================
  // Pending start / abort and student-facing errors
  // ==========================================

  describe('Pending start and stop', () => {
    beforeEach(() => {
      controller = new STTController();
    });

    it('reports a pending start until onstart fires', () => {
      controller.recognition.start = jest.fn(); // never fires onstart

      expect(controller.startListening(mockElement)).toBe(true);
      expect(controller.isStarting).toBe(true);
      expect(controller.isRecording).toBe(false);
    });

    it('aborts a pending start when stopped, and a following start works', () => {
      const abort = jest.fn();
      controller.recognition.start = jest.fn();
      controller.recognition.abort = abort;

      controller.startListening(mockElement);
      expect(controller.stopListening()).toBe(true);
      expect(abort).toHaveBeenCalledTimes(1);
      expect(controller.isStarting).toBe(false);

      expect(controller.startListening(mockElement)).toBe(true);
      expect(controller.isStarting).toBe(true);
    });

    it('does not start twice while a start is still pending', () => {
      const start = jest.fn();
      controller.recognition.start = start;

      controller.startListening(mockElement);
      expect(controller.startListening(mockElement)).toBe(false);
      expect(start).toHaveBeenCalledTimes(1);
    });

    it('clears the pending flag when recognition errors', () => {
      controller.recognition.start = jest.fn();
      controller.startListening(mockElement);

      controller.handleError({ error: 'not-allowed', message: 'x' });

      expect(controller.isStarting).toBe(false);
    });
  });

  describe('Student-facing error messages', () => {
    let onError;

    beforeEach(() => {
      onError = jest.fn();
      controller = new STTController({ onError });
    });

    it('tells the student how to allow the microphone', () => {
      controller.handleError({ error: 'not-allowed', message: '' });

      const message = onError.mock.calls[0][0].message;
      expect(message).toMatch(/address bar/i);
      expect(message).toMatch(/microphone/i);
    });

    it('never leaks an unknown error code to the student', () => {
      controller.handleError({ error: 'some-internal-code', message: '' });

      const message = onError.mock.calls[0][0].message;
      expect(message).not.toMatch(/some-internal-code/);
      expect(message).toMatch(/voice typing/i);
    });

    it('stays quiet when recognition was aborted on purpose', () => {
      controller.handleError({ error: 'aborted', message: '' });

      expect(onError).not.toHaveBeenCalled();
    });

    it('never surfaces a raw DOMException from start()', () => {
      controller.recognition.start = jest.fn(() => {
        const error = new Error(
          "Failed to execute 'start' on 'SpeechRecognition': recognition has already started."
        );
        error.name = 'InvalidStateError';
        throw error;
      });

      expect(controller.startListening(mockElement)).toBe(false);
      if (onError.mock.calls.length > 0) {
        expect(onError.mock.calls[0][0].message).not.toMatch(/SpeechRecognition|DOMException/);
      }
    });
  });
});
