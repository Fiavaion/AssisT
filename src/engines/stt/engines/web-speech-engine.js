/**
 * Web Speech API Engine (Phase 2.8 - S.8)
 * Wrapper for the browser's built-in Web Speech API
 *
 * @module WebSpeechEngine
 * @version 1.0.0
 */

import { BaseSTTEngine, EngineStatus, EngineType, RecognitionResult } from './base-engine.js';

/**
 * Web Speech API Engine
 * Uses webkitSpeechRecognition for speech-to-text
 */
export class WebSpeechEngine extends BaseSTTEngine {
  constructor(options = {}) {
    super(options);

    this.engineType = EngineType.WEB_SPEECH;
    this.recognition = null;
    this.isPaused = false;
    this.lastResultTime = 0;
  }

  /**
   * Get display name
   * @returns {string}
   */
  getDisplayName() {
    return 'Web Speech API';
  }

  /**
   * Get engine capabilities
   * @returns {Object}
   */
  getCapabilities() {
    return {
      offline: false, // Requires internet connection
      continuous: true,
      interimResults: true,
      languages: this.getSupportedLanguages(),
      customVocabulary: false,
      speakerIdentification: false,
      noiseCancellation: false,
    };
  }

  /**
   * Get supported languages (common ones)
   * @returns {Array<string>}
   * @private
   */
  getSupportedLanguages() {
    return [
      'en-US',
      'en-GB',
      'en-AU',
      'es-ES',
      'es-MX',
      'fr-FR',
      'de-DE',
      'it-IT',
      'pt-BR',
      'ja-JP',
      'ko-KR',
      'zh-CN',
      'zh-TW',
      'ru-RU',
      'ar-SA',
      'hi-IN',
    ];
  }

  /**
   * Check if Web Speech API is available
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    const available =
      typeof window !== 'undefined' &&
      ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);

    if (!available) {
      this.setStatus(EngineStatus.UNAVAILABLE);
    }

    return available;
  }

  /**
   * Initialize the Web Speech API
   * @returns {Promise<boolean>}
   */
  async initialize() {
    const startTime = Date.now();
    this.setStatus(EngineStatus.INITIALIZING);

    if (!(await this.isAvailable())) {
      this.setStatus(EngineStatus.UNAVAILABLE);
      throw new Error('Web Speech API not supported in this browser');
    }

    try {
      const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
      this.recognition = new SpeechRecognition();

      // Configure recognition settings
      this.recognition.continuous = this.settings.continuous;
      this.recognition.interimResults = this.settings.interimResults;
      this.recognition.lang = this.settings.language;
      this.recognition.maxAlternatives = this.settings.maxAlternatives;

      // Set up event handlers
      this.recognition.onstart = () => this.handleStart();
      this.recognition.onend = () => this.handleEnd();
      this.recognition.onresult = event => this.handleResult(event);
      this.recognition.onerror = event => this.handleError(event);
      this.recognition.onnomatch = () => this.handleNoMatch();
      this.recognition.onaudiostart = () => console.log('[WebSpeech] Audio capture started');
      this.recognition.onaudioend = () => console.log('[WebSpeech] Audio capture ended');
      this.recognition.onspeechstart = () => console.log('[WebSpeech] Speech detected');
      this.recognition.onspeechend = () => console.log('[WebSpeech] Speech ended');

      this.metrics.initTime = Date.now() - startTime;
      this.setStatus(EngineStatus.READY);

      console.log(`[WebSpeech] Initialized in ${this.metrics.initTime}ms`);
      return true;
    } catch (error) {
      this.setStatus(EngineStatus.ERROR);
      this.recordError();
      throw error;
    }
  }

  /**
   * Start listening
   * @returns {Promise<boolean>}
   */
  async startListening() {
    if (!this.recognition) {
      throw new Error('Recognition not initialized');
    }

    if (this.status === EngineStatus.LISTENING) {
      console.warn('[WebSpeech] Already listening');
      return false;
    }

    try {
      this.recognition.start();
      console.log('[WebSpeech] Started listening');
      return true;
    } catch (error) {
      this.recordError();
      throw error;
    }
  }

  /**
   * Stop listening
   * @returns {Promise<boolean>}
   */
  async stopListening() {
    if (!this.recognition || this.status !== EngineStatus.LISTENING) {
      return false;
    }

    try {
      this.isPaused = false;
      this.recognition.stop();
      console.log('[WebSpeech] Stopped listening');
      return true;
    } catch (error) {
      this.recordError();
      return false;
    }
  }

  /**
   * Pause listening
   * @returns {Promise<boolean>}
   */
  async pauseListening() {
    if (!this.recognition || this.status !== EngineStatus.LISTENING) {
      return false;
    }

    this.isPaused = true;
    this.recognition.stop();
    this.setStatus(EngineStatus.PAUSED);
    console.log('[WebSpeech] Paused listening');
    return true;
  }

  /**
   * Resume listening
   * @returns {Promise<boolean>}
   */
  async resumeListening() {
    if (!this.recognition || this.status !== EngineStatus.PAUSED) {
      return false;
    }

    try {
      this.isPaused = false;
      this.recognition.start();
      console.log('[WebSpeech] Resumed listening');
      return true;
    } catch (error) {
      this.recordError();
      return false;
    }
  }

  /**
   * Handle recognition start
   * @private
   */
  handleStart() {
    this.isPaused = false;
    this.setStatus(EngineStatus.LISTENING);
    console.log('[WebSpeech] Recognition started');
    this.onStart();
  }

  /**
   * Handle recognition end
   * @private
   */
  handleEnd() {
    console.log('[WebSpeech] Recognition ended');

    // If continuous mode and not paused, restart
    if (this.settings.continuous && this.status === EngineStatus.LISTENING && !this.isPaused) {
      console.log('[WebSpeech] Restarting continuous recognition');
      try {
        this.recognition.start();
      } catch (error) {
        console.error('[WebSpeech] Failed to restart:', error);
        this.setStatus(EngineStatus.READY);
        this.onEnd();
      }
    } else {
      this.setStatus(this.isPaused ? EngineStatus.PAUSED : EngineStatus.READY);
      this.onEnd();
    }
  }

  /**
   * Handle recognition result
   * @param {SpeechRecognitionEvent} event
   * @private
   */
  handleResult(event) {
    const startTime = Date.now();
    let interimTranscript = '';
    let finalTranscript = '';
    let totalConfidence = 0;
    let confidenceCount = 0;
    const alternatives = [];

    // Process results
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const transcript = result[0].transcript;
      const confidence = result[0].confidence;

      // Collect alternatives
      for (let j = 1; j < result.length && j < this.settings.maxAlternatives; j++) {
        alternatives.push({
          transcript: result[j].transcript,
          confidence: result[j].confidence,
        });
      }

      if (result.isFinal) {
        finalTranscript += transcript;
        totalConfidence += confidence || 1.0;
        confidenceCount++;
        console.log(`[WebSpeech] Final: "${transcript}" (confidence: ${confidence})`);
      } else {
        interimTranscript += transcript;
        console.log(`[WebSpeech] Interim: "${transcript}"`);
      }
    }

    // Handle interim results
    if (interimTranscript) {
      this.onInterimResult(interimTranscript);
    }

    // Handle final results
    if (finalTranscript) {
      const processingTime = Date.now() - startTime;
      this.recordProcessingTime(processingTime);

      const result = new RecognitionResult({
        transcript: finalTranscript,
        confidence: confidenceCount > 0 ? totalConfidence / confidenceCount : 0,
        isFinal: true,
        alternatives,
        engineType: this.engineType,
        processingTime,
      });

      this.lastResultTime = Date.now();
      this.onResult(result);
    }
  }

  /**
   * Handle recognition error
   * @param {SpeechRecognitionError} event
   * @private
   */
  handleError(event) {
    console.error('[WebSpeech] Error:', event.error, event.message);
    this.recordError();

    const errorMessages = {
      'no-speech': 'No speech detected. Please try again.',
      'audio-capture': 'No microphone detected. Please check your audio input.',
      'not-allowed': 'Microphone permission denied. Please allow microphone access.',
      network: 'Network error. Please check your internet connection.',
      aborted: 'Speech recognition aborted.',
      'bad-grammar': 'Speech recognition grammar error.',
      'language-not-supported': `Language "${this.settings.language}" is not supported.`,
    };

    const message = errorMessages[event.error] || `Speech recognition error: ${event.error}`;

    // Network errors should trigger fallback
    const isRecoverable = event.error === 'no-speech' || event.error === 'aborted';

    if (!isRecoverable) {
      this.setStatus(EngineStatus.ERROR);
    }

    this.onError(new Error(message), {
      code: event.error,
      recoverable: isRecoverable,
      shouldFallback: event.error === 'network' || event.error === 'not-allowed',
    });
  }

  /**
   * Handle no match
   * @private
   */
  handleNoMatch() {
    console.warn('[WebSpeech] No speech recognized');
    this.onError(new Error('Speech not recognized. Please try again.'), {
      code: 'no-match',
      recoverable: true,
      shouldFallback: false,
    });
  }

  /**
   * Update settings
   * @param {Object} newSettings
   */
  updateSettings(newSettings) {
    super.updateSettings(newSettings);

    if (this.recognition) {
      if (newSettings.continuous !== undefined) {
        this.recognition.continuous = newSettings.continuous;
      }
      if (newSettings.interimResults !== undefined) {
        this.recognition.interimResults = newSettings.interimResults;
      }
      if (newSettings.language !== undefined) {
        this.recognition.lang = newSettings.language;
      }
      if (newSettings.maxAlternatives !== undefined) {
        this.recognition.maxAlternatives = newSettings.maxAlternatives;
      }
    }
  }

  /**
   * Clean up resources
   */
  async destroy() {
    if (this.recognition) {
      if (this.status === EngineStatus.LISTENING) {
        this.recognition.stop();
      }
      this.recognition = null;
    }
    await super.destroy();
    console.log('[WebSpeech] Destroyed');
  }
}

export default WebSpeechEngine;
