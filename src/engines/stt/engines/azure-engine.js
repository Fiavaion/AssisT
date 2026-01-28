/**
 * Azure Speech Services Engine (Phase 2.8 - S.8.2)
 * Cloud-based speech recognition using Microsoft Azure Cognitive Services
 *
 * Features:
 * - High accuracy transcription
 * - Custom speech models (institutional vocabulary)
 * - Real-time and batch transcription
 * - Speaker diarization (multi-speaker)
 *
 * @module AzureEngine
 * @version 1.0.0
 */

import { BaseSTTEngine, EngineStatus, EngineType, RecognitionResult } from './base-engine.js';
import { saveSecureAPIKey, getSecureAPIKey } from '../../../core/storage/secure-key-storage.js';

/**
 * Azure Speech recognition modes
 */
export const AzureRecognitionMode = {
  INTERACTIVE: 'interactive', // Short utterances
  CONVERSATION: 'conversation', // Multi-turn conversation
  DICTATION: 'dictation', // Long-form dictation
};

/**
 * Azure Speech Services Engine
 */
export class AzureEngine extends BaseSTTEngine {
  constructor(options = {}) {
    super(options);

    this.engineType = EngineType.AZURE;

    // Azure configuration
    this.subscriptionKey = options.subscriptionKey || '';
    this.region = options.region || 'eastus';
    this.recognitionMode = options.recognitionMode || AzureRecognitionMode.INTERACTIVE;
    this.customEndpointId = options.customEndpointId || ''; // For custom speech models

    // SDK objects
    this.speechConfig = null;
    this.audioConfig = null;
    this.recognizer = null;
    this.mediaStream = null;

    // Processing state
    this.isPaused = false;

    console.log(`[Azure] Engine created for region: ${this.region}`);
  }

  /**
   * Get display name
   * @returns {string}
   */
  getDisplayName() {
    return 'Azure Speech Services';
  }

  /**
   * Get engine capabilities
   * @returns {Object}
   */
  getCapabilities() {
    return {
      offline: false,
      continuous: true,
      interimResults: true,
      languages: this.getSupportedLanguages(),
      customVocabulary: true, // Azure supports custom speech models
      speakerIdentification: true, // Azure supports speaker diarization
      noiseCancellation: true,
    };
  }

  /**
   * Get supported languages
   * @returns {Array<string>}
   * @private
   */
  getSupportedLanguages() {
    // Azure supports 100+ languages - common ones listed
    return [
      'en-US',
      'en-GB',
      'en-AU',
      'en-IN',
      'es-ES',
      'es-MX',
      'fr-FR',
      'fr-CA',
      'de-DE',
      'it-IT',
      'pt-BR',
      'pt-PT',
      'ja-JP',
      'ko-KR',
      'zh-CN',
      'zh-TW',
      'ru-RU',
      'ar-SA',
      'ar-EG',
      'hi-IN',
      'nl-NL',
      'pl-PL',
      'sv-SE',
      'da-DK',
      'fi-FI',
      'no-NO',
      'th-TH',
      'vi-VN',
      'id-ID',
      'ms-MY',
    ];
  }

  /**
   * Check if Azure SDK is loaded and configured
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    // Check if subscription key is configured
    if (!this.subscriptionKey) {
      console.warn('[Azure] No subscription key configured');
      // Could still be available via settings
      return true;
    }

    // Check for required browser APIs
    const hasMediaDevices =
      typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia;

    if (!hasMediaDevices) {
      console.warn('[Azure] MediaDevices API not available');
      this.setStatus(EngineStatus.UNAVAILABLE);
      return false;
    }

    return true;
  }

  /**
   * Load Azure Speech SDK dynamically
   * @returns {Promise<void>}
   * @private
   */
  async loadSDK() {
    if (window.SpeechSDK) {
      return;
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://aka.ms/csspeech/jsbrowserpackageraw';
      script.async = true;
      script.onload = () => {
        console.log('[Azure] Speech SDK loaded');
        resolve();
      };
      script.onerror = () => {
        reject(new Error('Failed to load Azure Speech SDK'));
      };
      document.head.appendChild(script);
    });
  }

  /**
   * Initialize Azure Speech Services
   * @returns {Promise<boolean>}
   */
  async initialize() {
    const startTime = Date.now();
    this.setStatus(EngineStatus.INITIALIZING);

    if (!(await this.isAvailable())) {
      this.setStatus(EngineStatus.UNAVAILABLE);
      throw new Error('Azure Speech Services not available');
    }

    try {
      // Load SDK if not already loaded
      await this.loadSDK();

      if (!this.subscriptionKey) {
        // Try to get from storage
        await this.loadCredentialsFromStorage();
      }

      if (!this.subscriptionKey) {
        console.warn('[Azure] No credentials configured - engine ready but needs setup');
        this.metrics.initTime = Date.now() - startTime;
        this.setStatus(EngineStatus.READY);
        return true;
      }

      // Create speech config
      this.speechConfig = window.SpeechSDK.SpeechConfig.fromSubscription(
        this.subscriptionKey,
        this.region
      );

      // Configure speech recognition
      this.speechConfig.speechRecognitionLanguage = this.settings.language;
      this.speechConfig.enableDictation();

      // Enable detailed output (word-level timing, confidence)
      this.speechConfig.outputFormat = window.SpeechSDK.OutputFormat.Detailed;

      // Set custom endpoint if configured
      if (this.customEndpointId) {
        this.speechConfig.endpointId = this.customEndpointId;
        console.log('[Azure] Using custom endpoint:', this.customEndpointId);
      }

      this.metrics.initTime = Date.now() - startTime;
      this.setStatus(EngineStatus.READY);

      console.log(`[Azure] Initialized in ${this.metrics.initTime}ms`);
      return true;
    } catch (error) {
      this.setStatus(EngineStatus.ERROR);
      this.recordError();
      console.error('[Azure] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Load credentials from Chrome storage (encrypted, local-only)
   * SECURITY: Uses chrome.storage.local with AES-GCM-256 encryption
   * to prevent keys from syncing to Google Account in plain text
   * @private
   */
  async loadCredentialsFromStorage() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        // Load encrypted subscription key from secure storage
        const subscriptionKey = await getSecureAPIKey('azure');
        if (subscriptionKey) {
          this.subscriptionKey = subscriptionKey;
          console.log('[Azure] Subscription key loaded from secure storage');
        }

        // Load region from local storage (not sensitive)
        const result = await chrome.storage.local.get('azureRegion');
        if (result.azureRegion) {
          this.region = result.azureRegion;
        }
      }
    } catch (error) {
      console.error('[Azure] Failed to load credentials:', error.message);
    }
  }

  /**
   * Save credentials to Chrome storage (encrypted, local-only)
   * SECURITY: Uses chrome.storage.local with AES-GCM-256 encryption
   * to prevent keys from syncing to Google Account in plain text
   * @param {string} subscriptionKey
   * @param {string} region
   */
  async saveCredentials(subscriptionKey, region) {
    this.subscriptionKey = subscriptionKey;
    this.region = region;

    if (typeof chrome !== 'undefined' && chrome.storage) {
      // Save subscription key using secure encrypted storage
      await saveSecureAPIKey('azure', subscriptionKey);

      // Save region to local storage (not sensitive, no encryption needed)
      await chrome.storage.local.set({ azureRegion: region });

      console.log('[Azure] Credentials saved to secure storage');
    }

    // Reinitialize with new credentials
    if (this.status !== EngineStatus.UNINITIALIZED) {
      await this.initialize();
    }
  }

  /**
   * Start listening
   * @returns {Promise<boolean>}
   */
  async startListening() {
    if (!this.speechConfig) {
      throw new Error('Azure Speech not configured. Please provide subscription key.');
    }

    if (this.status === EngineStatus.LISTENING) {
      console.warn('[Azure] Already listening');
      return false;
    }

    try {
      // Get microphone stream
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Create audio config from stream
      this.audioConfig = window.SpeechSDK.AudioConfig.fromStreamInput(this.mediaStream);

      // Create recognizer
      this.recognizer = new window.SpeechSDK.SpeechRecognizer(this.speechConfig, this.audioConfig);

      // Set up event handlers
      this.recognizer.recognizing = (sender, event) => {
        this.handleRecognizing(event);
      };

      this.recognizer.recognized = (sender, event) => {
        this.handleRecognized(event);
      };

      this.recognizer.canceled = (sender, event) => {
        this.handleCanceled(event);
      };

      this.recognizer.sessionStarted = () => {
        console.log('[Azure] Session started');
        this.setStatus(EngineStatus.LISTENING);
        this.onStart();
      };

      this.recognizer.sessionStopped = () => {
        console.log('[Azure] Session stopped');
        if (!this.isPaused) {
          this.setStatus(EngineStatus.READY);
          this.onEnd();
        }
      };

      // Start continuous recognition
      if (this.settings.continuous) {
        await this.recognizer.startContinuousRecognitionAsync();
      } else {
        await this.recognizer.recognizeOnceAsync();
      }

      console.log('[Azure] Started listening');
      return true;
    } catch (error) {
      this.recordError();
      console.error('[Azure] Failed to start listening:', error);
      throw error;
    }
  }

  /**
   * Handle recognizing (interim) event
   * @param {Object} event
   * @private
   */
  handleRecognizing(event) {
    if (event.result.reason === window.SpeechSDK.ResultReason.RecognizingSpeech) {
      const transcript = event.result.text;
      console.log(`[Azure] Recognizing: "${transcript}"`);
      this.onInterimResult(transcript);
    }
  }

  /**
   * Handle recognized (final) event
   * @param {Object} event
   * @private
   */
  handleRecognized(event) {
    const startTime = Date.now();

    if (event.result.reason === window.SpeechSDK.ResultReason.RecognizedSpeech) {
      const transcript = event.result.text;

      // Extract detailed results if available
      let confidence = 0.9; // Default confidence
      const alternatives = [];

      try {
        const detailedResult = JSON.parse(event.result.json);
        if (detailedResult.NBest && detailedResult.NBest.length > 0) {
          confidence = detailedResult.NBest[0].Confidence;

          // Get alternatives
          for (let i = 1; i < Math.min(detailedResult.NBest.length, 5); i++) {
            alternatives.push({
              transcript: detailedResult.NBest[i].Display,
              confidence: detailedResult.NBest[i].Confidence,
            });
          }
        }
      } catch {
        // Use default confidence
      }

      const processingTime = Date.now() - startTime;
      this.recordProcessingTime(processingTime);

      const result = new RecognitionResult({
        transcript,
        confidence,
        isFinal: true,
        alternatives,
        engineType: this.engineType,
        processingTime,
      });

      console.log(`[Azure] Recognized: "${transcript}" (confidence: ${confidence})`);
      this.onResult(result);
    } else if (event.result.reason === window.SpeechSDK.ResultReason.NoMatch) {
      console.log('[Azure] No speech recognized');
    }
  }

  /**
   * Handle canceled event
   * @param {Object} event
   * @private
   */
  handleCanceled(event) {
    const cancellation = window.SpeechSDK.CancellationDetails.fromResult(event.result);

    if (cancellation.reason === window.SpeechSDK.CancellationReason.Error) {
      const error = new Error(`Azure error: ${cancellation.errorDetails}`);
      this.recordError();

      // Determine if this should trigger fallback
      const shouldFallback =
        cancellation.ErrorCode === window.SpeechSDK.CancellationErrorCode.ConnectionFailure ||
        cancellation.ErrorCode === window.SpeechSDK.CancellationErrorCode.ServiceTimeout;

      this.onError(error, {
        code: cancellation.ErrorCode,
        recoverable: false,
        shouldFallback,
      });

      console.error('[Azure] Canceled:', cancellation.errorDetails);
    } else {
      console.log('[Azure] Recognition canceled:', cancellation.reason);
    }
  }

  /**
   * Stop listening
   * @returns {Promise<boolean>}
   */
  async stopListening() {
    if (this.status !== EngineStatus.LISTENING) {
      return false;
    }

    try {
      this.isPaused = false;

      if (this.recognizer) {
        if (this.settings.continuous) {
          await this.recognizer.stopContinuousRecognitionAsync();
        }
        this.recognizer.close();
        this.recognizer = null;
      }

      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop());
        this.mediaStream = null;
      }

      if (this.audioConfig) {
        this.audioConfig.close();
        this.audioConfig = null;
      }

      this.setStatus(EngineStatus.READY);
      console.log('[Azure] Stopped listening');
      this.onEnd();
      return true;
    } catch {
      this.recordError();
      return false;
    }
  }

  /**
   * Pause listening
   * @returns {Promise<boolean>}
   */
  async pauseListening() {
    if (this.status !== EngineStatus.LISTENING) {
      return false;
    }

    try {
      this.isPaused = true;

      if (this.recognizer && this.settings.continuous) {
        await this.recognizer.stopContinuousRecognitionAsync();
      }

      this.setStatus(EngineStatus.PAUSED);
      console.log('[Azure] Paused listening');
      return true;
    } catch {
      this.recordError();
      return false;
    }
  }

  /**
   * Resume listening
   * @returns {Promise<boolean>}
   */
  async resumeListening() {
    if (this.status !== EngineStatus.PAUSED) {
      return false;
    }

    try {
      this.isPaused = false;

      if (this.recognizer && this.settings.continuous) {
        await this.recognizer.startContinuousRecognitionAsync();
      }

      this.setStatus(EngineStatus.LISTENING);
      console.log('[Azure] Resumed listening');
      return true;
    } catch {
      this.recordError();
      return false;
    }
  }

  /**
   * Update settings
   * @param {Object} newSettings
   */
  updateSettings(newSettings) {
    super.updateSettings(newSettings);

    if (this.speechConfig && newSettings.language) {
      this.speechConfig.speechRecognitionLanguage = newSettings.language;
    }
  }

  /**
   * Set recognition mode
   * @param {string} mode - Mode from AzureRecognitionMode
   */
  setRecognitionMode(mode) {
    this.recognitionMode = mode;
    console.log(`[Azure] Recognition mode set to: ${mode}`);
  }

  /**
   * Set custom endpoint for custom speech models
   * @param {string} endpointId
   */
  setCustomEndpoint(endpointId) {
    this.customEndpointId = endpointId;
    if (this.speechConfig) {
      this.speechConfig.endpointId = endpointId;
    }
    console.log(`[Azure] Custom endpoint set: ${endpointId}`);
  }

  /**
   * Check if credentials are configured
   * @returns {boolean}
   */
  hasCredentials() {
    return !!this.subscriptionKey;
  }

  /**
   * Get configuration status
   * @returns {Object}
   */
  getConfigurationStatus() {
    return {
      hasCredentials: this.hasCredentials(),
      region: this.region,
      customEndpoint: this.customEndpointId || null,
      recognitionMode: this.recognitionMode,
    };
  }

  /**
   * Clean up resources
   */
  async destroy() {
    await this.stopListening();

    if (this.speechConfig) {
      this.speechConfig.close();
      this.speechConfig = null;
    }

    await super.destroy();
    console.log('[Azure] Destroyed');
  }
}

export default AzureEngine;
