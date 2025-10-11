/**
 * TTS Controller Unit Tests
 * Following TDD: Write tests first, then implement functionality
 */

import { TTSController } from '../../src/engines/tts/tts-controller.js';

describe('TTSController', () => {
  let ttsController;
  let mockDOMAdapter;
  let mockSettings;
  let mockSpeechSynthesis;
  let mockSpeechSynthesisUtterance;

  beforeEach(() => {
    // Mock Web Speech API
    mockSpeechSynthesis = {
      getVoices: jest.fn(() => [
        { name: 'English (US)', lang: 'en-US', default: true },
        { name: 'English (UK)', lang: 'en-GB', default: false }
      ]),
      speak: jest.fn(),
      cancel: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
      speaking: false,
      pending: false,
      paused: false
    };

    mockSpeechSynthesisUtterance = jest.fn().mockImplementation(() => ({
      text: '',
      lang: 'en-US',
      voice: null,
      volume: 1,
      rate: 1,
      pitch: 1,
      onstart: null,
      onend: null,
      onerror: null,
      onpause: null,
      onresume: null,
      onboundary: null
    }));

    global.speechSynthesis = mockSpeechSynthesis;
    global.SpeechSynthesisUtterance = mockSpeechSynthesisUtterance;

    // Mock DOM Adapter
    mockDOMAdapter = {
      getTextNodes: jest.fn(() => [
        { textContent: 'Hello world', parentElement: document.createElement('p') }
      ]),
      getMainContentArea: jest.fn(() => document.createElement('div')),
      highlightWord: jest.fn(),
      removeHighlight: jest.fn()
    };

    // Mock Settings
    mockSettings = {
      enabled: true,
      voice: 'default',
      rate: 1.0,
      pitch: 1.0,
      volume: 1.0,
      highlightEnabled: true,
      highlightColor: '#FFEB3B',
      autoStart: false
    };

    ttsController = new TTSController(mockDOMAdapter, mockSettings);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    test('should initialize with provided settings', () => {
      expect(ttsController).toBeDefined();
      expect(ttsController.settings).toEqual(mockSettings);
    });

    test('should load available voices on initialization', async () => {
      await ttsController.initialize();
      expect(mockSpeechSynthesis.getVoices).toHaveBeenCalled();
      expect(ttsController.availableVoices).toHaveLength(2);
    });

    test('should handle missing speech synthesis API gracefully', () => {
      global.speechSynthesis = undefined;
      expect(() => new TTSController(mockDOMAdapter, mockSettings)).not.toThrow();
    });

    test('should set default voice if none specified', async () => {
      await ttsController.initialize();
      expect(ttsController.selectedVoice).toBeDefined();
    });
  });

  describe('Voice Management', () => {
    test('should get list of available voices', async () => {
      await ttsController.initialize();
      const voices = ttsController.getAvailableVoices();
      expect(voices).toHaveLength(2);
      expect(voices[0].name).toBe('English (US)');
    });

    test('should set voice by name', async () => {
      await ttsController.initialize();
      ttsController.setVoice('English (UK)');
      expect(ttsController.selectedVoice.name).toBe('English (UK)');
    });

    test('should fallback to default voice if specified voice not found', async () => {
      await ttsController.initialize();
      ttsController.setVoice('NonexistentVoice');
      expect(ttsController.selectedVoice.name).toBe('English (US)');
    });

    test('should filter voices by language', async () => {
      await ttsController.initialize();
      const enVoices = ttsController.getVoicesByLanguage('en');
      expect(enVoices).toHaveLength(2);
    });
  });

  describe('Speech Synthesis', () => {
    beforeEach(async () => {
      await ttsController.initialize();
    });

    test('should speak provided text', async () => {
      await ttsController.speak('Hello world');
      expect(mockSpeechSynthesisUtterance).toHaveBeenCalledWith('Hello world');
      expect(mockSpeechSynthesis.speak).toHaveBeenCalled();
    });

    test('should apply rate settings to utterance', async () => {
      ttsController.setRate(1.5);
      await ttsController.speak('Test');
      const utterance = mockSpeechSynthesisUtterance.mock.results[0].value;
      expect(utterance.rate).toBe(1.5);
    });

    test('should apply pitch settings to utterance', async () => {
      ttsController.setPitch(0.8);
      await ttsController.speak('Test');
      const utterance = mockSpeechSynthesisUtterance.mock.results[0].value;
      expect(utterance.pitch).toBe(0.8);
    });

    test('should apply volume settings to utterance', async () => {
      ttsController.setVolume(0.5);
      await ttsController.speak('Test');
      const utterance = mockSpeechSynthesisUtterance.mock.results[0].value;
      expect(utterance.volume).toBe(0.5);
    });

    test('should not speak if TTS is disabled', async () => {
      ttsController.disable();
      await ttsController.speak('Test');
      expect(mockSpeechSynthesis.speak).not.toHaveBeenCalled();
    });

    test('should handle empty text gracefully', async () => {
      await ttsController.speak('');
      expect(mockSpeechSynthesis.speak).not.toHaveBeenCalled();
    });

    test('should cancel ongoing speech before starting new', async () => {
      mockSpeechSynthesis.speaking = true;
      await ttsController.speak('New text');
      expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();
    });
  });

  describe('Playback Controls', () => {
    beforeEach(async () => {
      await ttsController.initialize();
      await ttsController.speak('Test text');
    });

    test('should pause speech', () => {
      ttsController.pause();
      expect(mockSpeechSynthesis.pause).toHaveBeenCalled();
    });

    test('should resume paused speech', () => {
      ttsController.resume();
      expect(mockSpeechSynthesis.resume).toHaveBeenCalled();
    });

    test('should stop and cancel speech', () => {
      ttsController.stop();
      expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();
    });

    test('should report speaking state correctly', () => {
      mockSpeechSynthesis.speaking = true;
      expect(ttsController.isSpeaking()).toBe(true);
    });

    test('should report paused state correctly', () => {
      mockSpeechSynthesis.paused = true;
      expect(ttsController.isPaused()).toBe(true);
    });
  });

  describe('Text Highlighting', () => {
    beforeEach(async () => {
      await ttsController.initialize();
    });

    test('should enable highlighting when configured', async () => {
      await ttsController.speak('Hello world');
      const utterance = mockSpeechSynthesisUtterance.mock.results[0].value;
      expect(utterance.onboundary).toBeDefined();
    });

    test('should not set up highlighting when disabled', async () => {
      ttsController.settings.highlightEnabled = false;
      await ttsController.speak('Hello world');
      const utterance = mockSpeechSynthesisUtterance.mock.results[0].value;
      expect(utterance.onboundary).toBeNull();
    });

    test('should highlight word on boundary event', async () => {
      await ttsController.speak('Hello world');
      const utterance = mockSpeechSynthesisUtterance.mock.results[0].value;

      // Simulate boundary event
      utterance.onboundary({ name: 'word', charIndex: 0, charLength: 5 });
      expect(mockDOMAdapter.highlightWord).toHaveBeenCalled();
    });

    test('should remove highlight when speech ends', async () => {
      await ttsController.speak('Hello world');
      const utterance = mockSpeechSynthesisUtterance.mock.results[0].value;

      // Simulate end event
      utterance.onend();
      expect(mockDOMAdapter.removeHighlight).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await ttsController.initialize();
    });

    test('should handle speech synthesis errors', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      await ttsController.speak('Test');
      const utterance = mockSpeechSynthesisUtterance.mock.results[0].value;

      utterance.onerror({ error: 'synthesis-failed' });
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test('should emit error event on failure', async () => {
      const errorHandler = jest.fn();
      ttsController.on('error', errorHandler);

      await ttsController.speak('Test');
      const utterance = mockSpeechSynthesisUtterance.mock.results[0].value;
      utterance.onerror({ error: 'synthesis-failed' });

      expect(errorHandler).toHaveBeenCalledWith(expect.objectContaining({
        error: 'synthesis-failed'
      }));
    });
  });

  describe('Settings Updates', () => {
    beforeEach(async () => {
      await ttsController.initialize();
    });

    test('should update rate setting', () => {
      ttsController.setRate(1.2);
      expect(ttsController.settings.rate).toBe(1.2);
    });

    test('should constrain rate to valid range (0.1 - 10)', () => {
      ttsController.setRate(15);
      expect(ttsController.settings.rate).toBeLessThanOrEqual(10);

      ttsController.setRate(0.05);
      expect(ttsController.settings.rate).toBeGreaterThanOrEqual(0.1);
    });

    test('should update pitch setting', () => {
      ttsController.setPitch(1.5);
      expect(ttsController.settings.pitch).toBe(1.5);
    });

    test('should constrain pitch to valid range (0 - 2)', () => {
      ttsController.setPitch(5);
      expect(ttsController.settings.pitch).toBeLessThanOrEqual(2);

      ttsController.setPitch(-1);
      expect(ttsController.settings.pitch).toBeGreaterThanOrEqual(0);
    });

    test('should update volume setting', () => {
      ttsController.setVolume(0.7);
      expect(ttsController.settings.volume).toBe(0.7);
    });

    test('should constrain volume to valid range (0 - 1)', () => {
      ttsController.setVolume(2);
      expect(ttsController.settings.volume).toBeLessThanOrEqual(1);

      ttsController.setVolume(-0.5);
      expect(ttsController.settings.volume).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Content Reading', () => {
    beforeEach(async () => {
      await ttsController.initialize();
    });

    test('should read content from DOM adapter', async () => {
      await ttsController.readPageContent();
      expect(mockDOMAdapter.getTextNodes).toHaveBeenCalled();
      expect(mockSpeechSynthesis.speak).toHaveBeenCalled();
    });

    test('should combine multiple text nodes', async () => {
      mockDOMAdapter.getTextNodes.mockReturnValue([
        { textContent: 'First paragraph.' },
        { textContent: 'Second paragraph.' }
      ]);

      await ttsController.readPageContent();
      expect(mockSpeechSynthesisUtterance).toHaveBeenCalledWith(
        expect.stringContaining('First paragraph')
      );
    });

    test('should skip empty text nodes', async () => {
      mockDOMAdapter.getTextNodes.mockReturnValue([
        { textContent: 'Content' },
        { textContent: '   ' },
        { textContent: '' }
      ]);

      await ttsController.readPageContent();
      expect(mockSpeechSynthesisUtterance).toHaveBeenCalledWith('Content');
    });
  });

  describe('Enable/Disable', () => {
    beforeEach(async () => {
      await ttsController.initialize();
    });

    test('should enable TTS', () => {
      ttsController.disable();
      ttsController.enable();
      expect(ttsController.settings.enabled).toBe(true);
    });

    test('should disable TTS', () => {
      ttsController.disable();
      expect(ttsController.settings.enabled).toBe(false);
    });

    test('should stop speech when disabling', async () => {
      await ttsController.speak('Test');
      ttsController.disable();
      expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();
    });
  });
});
