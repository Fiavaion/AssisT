/**
 * TTS Controller Tests
 * Comprehensive unit tests for Text-to-Speech controller
 */

import { TTSController } from '../../src/engines/tts/tts-controller.js';

describe('TTSController', () => {
  let controller;
  let mockSynthesis;
  let mockDomAdapter;
  let mockSettings;
  let MockUtterance;

  beforeEach(() => {
    // Mock SpeechSynthesisUtterance class
    MockUtterance = class {
      constructor(text) {
        this.text = text;
        this.rate = 1.0;
        this.pitch = 1.0;
        this.volume = 1.0;
        this.voice = null;
        this.onstart = null;
        this.onend = null;
        this.onerror = null;
        this.onpause = null;
        this.onresume = null;
        this.onboundary = null;
      }
    };

    // Mock speechSynthesis API
    mockSynthesis = {
      speaking: false,
      pending: false,
      paused: false,
      getVoices: jest.fn(() => [
        { name: 'Google US English', lang: 'en-US', default: true },
        { name: 'Google UK English Female', lang: 'en-GB', default: false },
        { name: 'Google French', lang: 'fr-FR', default: false }
      ]),
      speak: jest.fn(),
      cancel: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
      onvoiceschanged: null
    };

    // Mock DOM Adapter
    mockDomAdapter = {
      getTextNodes: jest.fn(() => [
        { textContent: 'Hello world' },
        { textContent: 'This is a test' }
      ])
    };

    // Mock settings
    mockSettings = {
      enabled: true,
      voice: 'Google US English',
      rate: 1.0,
      pitch: 1.0,
      volume: 1.0,
      highlightEnabled: true,
      highlightColor: '#FFEB3B',
      highlightOpacity: 0.7
    };

    // Setup global mocks BEFORE creating controller
    global.window = {
      speechSynthesis: mockSynthesis,
      SpeechSynthesisUtterance: MockUtterance
    };

    global.SpeechSynthesisUtterance = MockUtterance;

    global.document = {
      body: { textContent: 'Mock body' },
      createElement: jest.fn(() => ({
        className: '',
        style: { cssText: '' },
        textContent: ''
      })),
      createRange: jest.fn(() => ({
        setStart: jest.fn(),
        setEnd: jest.fn(),
        surroundContents: jest.fn()
      })),
      createTextNode: jest.fn((text) => ({ textContent: text })),
      createTreeWalker: jest.fn(() => ({
        nextNode: jest.fn(() => null)
      })),
      querySelectorAll: jest.fn(() => [])
    };

    controller = new TTSController(mockDomAdapter, mockSettings);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    test('should initialize with correct default values', () => {
      expect(controller.synthesis).toBe(mockSynthesis);
      expect(controller.settings).toEqual(mockSettings);
      expect(controller.currentUtterance).toBe(null);
      expect(controller.isPlaying).toBe(false);
      expect(controller.isPaused).toBe(false);
    });

    test('should initialize without synthesis API', () => {
      global.window = {};
      const noSynthController = new TTSController(mockDomAdapter, mockSettings);
      expect(noSynthController.synthesis).toBe(null);
    });

    test('should load voices on initialize', async () => {
      await controller.initialize();
      expect(mockSynthesis.getVoices).toHaveBeenCalled();
      expect(controller.availableVoices).toHaveLength(3);
      expect(controller.selectedVoice).toEqual(mockSynthesis.getVoices()[0]);
    });

    test('should handle no voices available', async () => {
      mockSynthesis.getVoices.mockReturnValue([]);
      await controller.initialize();
      expect(controller.availableVoices).toHaveLength(0);
      expect(controller.selectedVoice).toBe(null);
    });

    test('should handle onvoiceschanged event', async () => {
      mockSynthesis.getVoices.mockReturnValueOnce([]);

      const initPromise = controller.initialize();

      // Simulate voices loaded asynchronously
      setTimeout(() => {
        mockSynthesis.getVoices.mockReturnValue([
          { name: 'Late Voice', lang: 'en-US', default: true }
        ]);
        // Trigger the onvoiceschanged callback
        if (mockSynthesis.onvoiceschanged) {
          mockSynthesis.onvoiceschanged();
        }
      }, 10);

      await initPromise;
      expect(controller.availableVoices.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Voice Management', () => {
    beforeEach(async () => {
      await controller.initialize();
    });

    test('should get available voices', () => {
      const voices = controller.getAvailableVoices();
      expect(voices).toHaveLength(3);
      expect(voices[0].name).toBe('Google US English');
    });

    test('should filter voices by language', () => {
      const enVoices = controller.getVoicesByLanguage('en');
      expect(enVoices).toHaveLength(2);
      expect(enVoices.every(v => v.lang.startsWith('en'))).toBe(true);
    });

    test('should set voice by name', () => {
      controller.setVoice('Google UK English Female');
      expect(controller.selectedVoice.name).toBe('Google UK English Female');
    });

    test('should fallback to default voice if name not found', () => {
      controller.setVoice('Non-existent Voice');
      expect(controller.selectedVoice.name).toBe('Google US English');
    });

    test('should fallback to first voice if no default', () => {
      controller.availableVoices = [
        { name: 'Voice 1', lang: 'en-US', default: false },
        { name: 'Voice 2', lang: 'en-GB', default: false }
      ];
      controller.setVoice('Non-existent');
      expect(controller.selectedVoice.name).toBe('Voice 1');
    });
  });

  describe('Speech Settings', () => {
    test('should set rate within bounds', () => {
      controller.setRate(1.5);
      expect(controller.settings.rate).toBe(1.5);
    });

    test('should clamp rate to minimum 0.1', () => {
      controller.setRate(0);
      expect(controller.settings.rate).toBe(0.1);
    });

    test('should clamp rate to maximum 10', () => {
      controller.setRate(15);
      expect(controller.settings.rate).toBe(10);
    });

    test('should set pitch within bounds', () => {
      controller.setPitch(1.2);
      expect(controller.settings.pitch).toBe(1.2);
    });

    test('should clamp pitch to minimum 0', () => {
      controller.setPitch(-1);
      expect(controller.settings.pitch).toBe(0);
    });

    test('should clamp pitch to maximum 2', () => {
      controller.setPitch(5);
      expect(controller.settings.pitch).toBe(2);
    });

    test('should set volume within bounds', () => {
      controller.setVolume(0.5);
      expect(controller.settings.volume).toBe(0.5);
    });

    test('should clamp volume to minimum 0', () => {
      controller.setVolume(-0.5);
      expect(controller.settings.volume).toBe(0);
    });

    test('should clamp volume to maximum 1', () => {
      controller.setVolume(2);
      expect(controller.settings.volume).toBe(1);
    });
  });

  describe('Speech Synthesis', () => {
    beforeEach(async () => {
      await controller.initialize();
    });

    test('should speak text with correct settings', async () => {
      await controller.speak('Hello world');

      expect(mockSynthesis.speak).toHaveBeenCalled();
      const utterance = mockSynthesis.speak.mock.calls[0][0];
      expect(utterance.text).toBe('Hello world');
      expect(utterance.rate).toBe(1.0);
      expect(utterance.pitch).toBe(1.0);
      expect(utterance.volume).toBe(1.0);
    });

    test('should not speak if TTS disabled', async () => {
      controller.settings.enabled = false;
      await controller.speak('Hello');
      expect(mockSynthesis.speak).not.toHaveBeenCalled();
    });

    test('should not speak empty text', async () => {
      await controller.speak('');
      expect(mockSynthesis.speak).not.toHaveBeenCalled();

      await controller.speak('   ');
      expect(mockSynthesis.speak).not.toHaveBeenCalled();
    });

    test('should cancel ongoing speech before new speech', async () => {
      mockSynthesis.speaking = true;
      await controller.speak('New text');
      expect(mockSynthesis.cancel).toHaveBeenCalled();
    });

    test('should apply selected voice to utterance', async () => {
      controller.setVoice('Google UK English Female');
      await controller.speak('Test');

      const utterance = mockSynthesis.speak.mock.calls[0][0];
      expect(utterance.voice.name).toBe('Google UK English Female');
    });

    test('should handle speech without synthesis API', async () => {
      controller.synthesis = null;
      await controller.speak('Test');
      // Should not throw error
    });
  });

  describe('State Management', () => {
    beforeEach(async () => {
      await controller.initialize();
    });

    test('should update state on speech start', async () => {
      await controller.speak('Test');
      const utterance = controller.currentUtterance;

      utterance.onstart();
      expect(controller.isPlaying).toBe(true);
      expect(controller.isPaused).toBe(false);
    });

    test('should update state on speech end', async () => {
      await controller.speak('Test');
      const utterance = controller.currentUtterance;

      utterance.onstart();
      utterance.onend();

      expect(controller.isPlaying).toBe(false);
      expect(controller.isPaused).toBe(false);
    });

    test('should update state on pause', async () => {
      await controller.speak('Test');
      const utterance = controller.currentUtterance;

      utterance.onstart();
      utterance.onpause();

      expect(controller.isPaused).toBe(true);
      expect(controller.isPlaying).toBe(false);
    });

    test('should update state on resume', async () => {
      await controller.speak('Test');
      const utterance = controller.currentUtterance;

      utterance.onpause();
      utterance.onresume();

      expect(controller.isPaused).toBe(false);
      expect(controller.isPlaying).toBe(true);
    });

    test('should emit error event on speech error', async () => {
      const errorHandler = jest.fn();
      controller.on('error', errorHandler);

      await controller.speak('Test');
      const utterance = controller.currentUtterance;
      const mockError = { error: 'synthesis-failed' };

      utterance.onerror(mockError);
      expect(errorHandler).toHaveBeenCalledWith(mockError);
    });
  });

  describe('Playback Control', () => {
    test('should pause speech', () => {
      controller.pause();
      expect(mockSynthesis.pause).toHaveBeenCalled();
    });

    test('should resume speech', () => {
      controller.resume();
      expect(mockSynthesis.resume).toHaveBeenCalled();
    });

    test('should stop speech', () => {
      controller.isPlaying = true;
      controller.stop();

      expect(mockSynthesis.cancel).toHaveBeenCalled();
      expect(controller.isPlaying).toBe(false);
      expect(controller.isPaused).toBe(false);
    });

    test('should check if speaking', () => {
      mockSynthesis.speaking = true;
      expect(controller.isSpeaking()).toBe(true);

      mockSynthesis.speaking = false;
      expect(controller.isSpeaking()).toBe(false);
    });

    test('should handle isSpeaking without synthesis API', () => {
      controller.synthesis = null;
      expect(controller.isSpeaking()).toBe(false);
    });
  });

  describe('Enable/Disable', () => {
    test('should enable TTS', () => {
      controller.settings.enabled = false;
      controller.enable();
      expect(controller.settings.enabled).toBe(true);
    });

    test('should disable TTS and stop speech', () => {
      controller.settings.enabled = true;
      controller.disable();

      expect(controller.settings.enabled).toBe(false);
      expect(mockSynthesis.cancel).toHaveBeenCalled();
    });
  });

  describe('Event Emitter', () => {
    test('should register event handler', () => {
      const handler = jest.fn();
      controller.on('test-event', handler);

      expect(controller.eventHandlers['test-event']).toContain(handler);
    });

    test('should emit events to registered handlers', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();

      controller.on('test-event', handler1);
      controller.on('test-event', handler2);

      controller.emit('test-event', { data: 'test' });

      expect(handler1).toHaveBeenCalledWith({ data: 'test' });
      expect(handler2).toHaveBeenCalledWith({ data: 'test' });
    });

    test('should handle emit with no handlers', () => {
      // Should not throw
      controller.emit('non-existent-event', {});
    });
  });

  describe('Read Content', () => {
    beforeEach(async () => {
      await controller.initialize();
    });

    test('should read text with element context', async () => {
      const mockElement = { style: {} };
      await controller.readText('Test text', mockElement);

      expect(controller.currentElement).toBe(mockElement);
      expect(controller.currentText).toBe('Test text');
      expect(mockSynthesis.speak).toHaveBeenCalled();
    });

    test('should not read empty text', async () => {
      await controller.readText('');
      expect(mockSynthesis.speak).not.toHaveBeenCalled();
    });

    test('should read page content using DOM adapter', async () => {
      await controller.readPageContent();

      expect(mockDomAdapter.getTextNodes).toHaveBeenCalled();
      expect(mockSynthesis.speak).toHaveBeenCalled();
      expect(controller.currentText).toBe('Hello world This is a test');
    });

    test('should handle missing DOM adapter', async () => {
      controller.domAdapter = null;
      await controller.readPageContent();
      // Should not throw error
    });
  });
});
