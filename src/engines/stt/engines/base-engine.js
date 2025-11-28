/**
 * Base STT Engine Interface (Phase 2.8 - S.8)
 * Abstract base class for all speech recognition engines
 *
 * @module BaseSTTEngine
 * @version 1.0.0
 */

/**
 * Engine status enumeration
 */
export const EngineStatus = {
  UNINITIALIZED: 'uninitialized',
  INITIALIZING: 'initializing',
  READY: 'ready',
  LISTENING: 'listening',
  PAUSED: 'paused',
  ERROR: 'error',
  UNAVAILABLE: 'unavailable',
};

/**
 * Engine type enumeration
 */
export const EngineType = {
  WEB_SPEECH: 'web-speech',
  WHISPER: 'whisper',
  AZURE: 'azure',
};

/**
 * Recognition result format
 */
export class RecognitionResult {
  constructor(options = {}) {
    this.transcript = options.transcript || '';
    this.confidence = options.confidence || 0;
    this.isFinal = options.isFinal !== undefined ? options.isFinal : true;
    this.alternatives = options.alternatives || [];
    this.timestamp = options.timestamp || Date.now();
    this.engineType = options.engineType || EngineType.WEB_SPEECH;
    this.processingTime = options.processingTime || 0;
  }
}

/**
 * Base STT Engine class
 * All engine implementations must extend this class
 */
export class BaseSTTEngine {
  constructor(options = {}) {
    if (new.target === BaseSTTEngine) {
      throw new Error('BaseSTTEngine is abstract and cannot be instantiated directly');
    }

    this.engineType = EngineType.WEB_SPEECH;
    this.status = EngineStatus.UNINITIALIZED;
    this.settings = {
      continuous: options.continuous !== undefined ? options.continuous : true,
      interimResults: options.interimResults !== undefined ? options.interimResults : true,
      language: options.language || 'en-US',
      maxAlternatives: options.maxAlternatives || 1,
    };

    // Callbacks
    this.onStart = options.onStart || (() => {});
    this.onEnd = options.onEnd || (() => {});
    this.onResult = options.onResult || (() => {});
    this.onError = options.onError || (() => {});
    this.onInterimResult = options.onInterimResult || (() => {});
    this.onStatusChange = options.onStatusChange || (() => {});

    // Performance metrics
    this.metrics = {
      initTime: 0,
      avgProcessingTime: 0,
      totalProcessed: 0,
      errors: 0,
    };
  }

  /**
   * Initialize the engine
   * @returns {Promise<boolean>} - Success status
   */
  async initialize() {
    throw new Error('initialize() must be implemented by subclass');
  }

  /**
   * Check if the engine is available in the current environment
   * @returns {Promise<boolean>} - Availability status
   */
  async isAvailable() {
    throw new Error('isAvailable() must be implemented by subclass');
  }

  /**
   * Start listening for speech
   * @returns {Promise<boolean>} - Success status
   */
  async startListening() {
    throw new Error('startListening() must be implemented by subclass');
  }

  /**
   * Stop listening
   * @returns {Promise<boolean>} - Success status
   */
  async stopListening() {
    throw new Error('stopListening() must be implemented by subclass');
  }

  /**
   * Pause listening (for continuous mode)
   * @returns {Promise<boolean>} - Success status
   */
  async pauseListening() {
    throw new Error('pauseListening() must be implemented by subclass');
  }

  /**
   * Resume listening (for continuous mode)
   * @returns {Promise<boolean>} - Success status
   */
  async resumeListening() {
    throw new Error('resumeListening() must be implemented by subclass');
  }

  /**
   * Update engine settings
   * @param {Object} newSettings - Settings to update
   */
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
  }

  /**
   * Get current engine status
   * @returns {string} - Current status
   */
  getStatus() {
    return this.status;
  }

  /**
   * Get engine type
   * @returns {string} - Engine type identifier
   */
  getEngineType() {
    return this.engineType;
  }

  /**
   * Get engine name for display
   * @returns {string} - Human-readable engine name
   */
  getDisplayName() {
    throw new Error('getDisplayName() must be implemented by subclass');
  }

  /**
   * Get engine capabilities
   * @returns {Object} - Capabilities object
   */
  getCapabilities() {
    return {
      offline: false,
      continuous: true,
      interimResults: true,
      languages: ['en-US'],
      customVocabulary: false,
      speakerIdentification: false,
      noiseCancellation: false,
    };
  }

  /**
   * Get performance metrics
   * @returns {Object} - Metrics object
   */
  getMetrics() {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics() {
    this.metrics = {
      initTime: 0,
      avgProcessingTime: 0,
      totalProcessed: 0,
      errors: 0,
    };
  }

  /**
   * Update status and notify listeners
   * @param {string} newStatus - New status
   * @protected
   */
  setStatus(newStatus) {
    const oldStatus = this.status;
    this.status = newStatus;
    if (oldStatus !== newStatus) {
      this.onStatusChange(newStatus, oldStatus);
    }
  }

  /**
   * Record processing time for metrics
   * @param {number} time - Processing time in ms
   * @protected
   */
  recordProcessingTime(time) {
    const total = this.metrics.avgProcessingTime * this.metrics.totalProcessed + time;
    this.metrics.totalProcessed++;
    this.metrics.avgProcessingTime = total / this.metrics.totalProcessed;
  }

  /**
   * Record an error for metrics
   * @protected
   */
  recordError() {
    this.metrics.errors++;
  }

  /**
   * Clean up resources
   */
  async destroy() {
    this.setStatus(EngineStatus.UNINITIALIZED);
  }
}

export default BaseSTTEngine;
