/**
 * STT Engines Module Index (Phase 2.8 - S.8)
 * Exports all STT engine classes and utilities
 *
 * @module STTEngines
 * @version 1.0.0
 */

// Base classes and types
export {
  BaseSTTEngine,
  EngineStatus,
  EngineType,
  RecognitionResult,
} from './base-engine.js';

// Engine manager
export { EngineManager } from './engine-manager.js';

// Engine implementations
export { WebSpeechEngine } from './web-speech-engine.js';
export { WhisperEngine, WhisperModel } from './whisper-engine.js';
export { AzureEngine, AzureRecognitionMode } from './azure-engine.js';

/**
 * Create and configure the default engine manager
 * @param {Object} options - Configuration options
 * @returns {EngineManager}
 */
export function createEngineManager(options = {}) {
  const manager = new EngineManager({
    autoFallback: options.autoFallback !== false,
    preferOffline: options.preferOffline !== false,
    priority: options.priority,
    onEngineChange: options.onEngineChange,
    onFallback: options.onFallback,
    onError: options.onError,
    onAllEnginesFailed: options.onAllEnginesFailed,
  });

  // Register Web Speech engine (always available)
  const webSpeechEngine = new WebSpeechEngine({
    continuous: options.continuous,
    interimResults: options.interimResults,
    language: options.language,
    maxAlternatives: options.maxAlternatives,
    onStart: options.onStart,
    onEnd: options.onEnd,
    onResult: options.onResult,
    onError: options.onError,
    onInterimResult: options.onInterimResult,
  });
  manager.registerEngine(EngineType.WEB_SPEECH, webSpeechEngine);

  // Register Whisper engine if enabled
  if (options.enableWhisper !== false) {
    const whisperEngine = new WhisperEngine({
      model: options.whisperModel,
      continuous: options.continuous,
      language: options.language,
      onStart: options.onStart,
      onEnd: options.onEnd,
      onResult: options.onResult,
      onError: options.onError,
      onInterimResult: options.onInterimResult,
      onModelLoadProgress: options.onModelLoadProgress,
      onModelLoadComplete: options.onModelLoadComplete,
    });
    manager.registerEngine(EngineType.WHISPER, whisperEngine);
  }

  // Register Azure engine if credentials provided
  if (options.azureSubscriptionKey || options.enableAzure) {
    const azureEngine = new AzureEngine({
      subscriptionKey: options.azureSubscriptionKey,
      region: options.azureRegion,
      customEndpointId: options.azureCustomEndpoint,
      recognitionMode: options.azureRecognitionMode,
      continuous: options.continuous,
      language: options.language,
      onStart: options.onStart,
      onEnd: options.onEnd,
      onResult: options.onResult,
      onError: options.onError,
      onInterimResult: options.onInterimResult,
    });
    manager.registerEngine(EngineType.AZURE, azureEngine);
  }

  return manager;
}

/**
 * Get engine display information
 * @returns {Array<Object>}
 */
export function getEngineInfo() {
  return [
    {
      type: EngineType.WHISPER,
      name: 'Whisper (Offline)',
      description: 'Local speech recognition using Whisper AI. Works offline.',
      icon: '🔇',
      offline: true,
      requiresSetup: false,
    },
    {
      type: EngineType.WEB_SPEECH,
      name: 'Web Speech API',
      description: 'Browser built-in speech recognition. Requires internet.',
      icon: '🌐',
      offline: false,
      requiresSetup: false,
    },
    {
      type: EngineType.AZURE,
      name: 'Azure Speech',
      description: 'Microsoft Azure cloud recognition. High accuracy, requires subscription.',
      icon: '☁️',
      offline: false,
      requiresSetup: true,
    },
  ];
}
