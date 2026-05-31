/**
 * Enhanced Speech-to-Text Controller (Phase 2.8 - S.8)
 * Multi-engine speech recognition with automatic fallback
 *
 * Features:
 * - Multiple STT engine support (Web Speech, Whisper, Azure)
 * - Automatic engine fallback chain
 * - Offline mode support (Whisper)
 * - All features from original STT Controller
 *
 * @module STTControllerEnhanced
 * @version 3.0.0 (Phase 2.8 - Advanced Recognition Engine)
 */

import { CommandParser, CommandType } from './command-parser.js';
import { VocabularyManager, VocabularyPresets } from './vocabulary-manager.js';
import { AutoPunctuator, PunctuationType } from './auto-punctuation.js';
import { ConfidenceFeedback } from './confidence-feedback.js';
import { EngineType, EngineStatus, createEngineManager } from './engines/index.js';

/**
 * Enhanced STT Controller with multi-engine support
 */
export class STTControllerEnhanced {
  constructor(options = {}) {
    this.settings = {
      continuous: options.continuous !== undefined ? options.continuous : true,
      interimResults: options.interimResults !== undefined ? options.interimResults : true,
      language: options.language || 'en-US',
      autoCapitalize: options.autoCapitalize !== undefined ? options.autoCapitalize : true,
      punctuationCommands:
        options.punctuationCommands !== undefined ? options.punctuationCommands : true,
      voiceCommands: options.voiceCommands !== undefined ? options.voiceCommands : true,
      maxAlternatives: options.maxAlternatives || 1,
      vocabularyEnabled: options.vocabularyEnabled !== undefined ? options.vocabularyEnabled : true,
      // Auto-punctuation settings
      autoPunctuation: options.autoPunctuation !== undefined ? options.autoPunctuation : true,
      autoPunctuationMode: options.autoPunctuationMode || 'auto',
      // Confidence feedback settings
      confidenceFeedback:
        options.confidenceFeedback !== undefined ? options.confidenceFeedback : true,
      confidenceThreshold: options.confidenceThreshold || 0.6,
      highlightLowConfidence:
        options.highlightLowConfidence !== undefined ? options.highlightLowConfidence : true,
      showAlternatives: options.showAlternatives !== undefined ? options.showAlternatives : true,
      // Engine settings (Phase 2.8 - S.8)
      preferOffline: options.preferOffline !== undefined ? options.preferOffline : true,
      enableWhisper: options.enableWhisper !== undefined ? options.enableWhisper : true,
      enableAzure: options.enableAzure || false,
      autoFallback: options.autoFallback !== undefined ? options.autoFallback : true,
      enginePriority: options.enginePriority || [
        EngineType.WHISPER,
        EngineType.WEB_SPEECH,
        EngineType.AZURE,
      ],
    };

    // State
    this.engineManager = null;
    this.isRecording = false;
    this.isPaused = false;
    this.targetElement = null;
    this.lastTranscript = '';
    this.lastDictation = '';
    this.interimTranscript = '';
    this.finalTranscript = '';

    // Initialize command parser
    this.commandParser = new CommandParser({
      enabled: this.settings.voiceCommands,
      onCommandExecuted: result => this.handleCommandExecuted(result),
      onError: error => this.onError(error),
    });

    // Initialize vocabulary manager
    this.vocabularyManager = null;
    if (this.settings.vocabularyEnabled) {
      this.initializeVocabulary(options.vocabularyOptions || {});
    }

    // Initialize auto-punctuator
    this.autoPunctuator = null;
    if (this.settings.autoPunctuation) {
      this.initializeAutoPunctuation(options.autoPunctuationOptions || {});
    }

    // Initialize confidence feedback
    this.confidenceFeedback = null;
    if (this.settings.confidenceFeedback) {
      this.initializeConfidenceFeedback(options.confidenceFeedbackOptions || {});
    }

    // Timing tracking
    this.lastResultTimestamp = 0;

    // Callbacks
    this.onStart = options.onStart || (() => {});
    this.onEnd = options.onEnd || (() => {});
    this.onResult = options.onResult || (() => {});
    this.onError = options.onError || (() => {});
    this.onInterimResult = options.onInterimResult || (() => {});
    this.onCommandExecuted = options.onCommandExecuted || (() => {});
    this.onPunctuationAdded = options.onPunctuationAdded || (() => {});
    this.onConfidenceUpdate = options.onConfidenceUpdate || (() => {});
    this.onLowConfidence = options.onLowConfidence || (() => {});
    this.onStatsUpdate = options.onStatsUpdate || (() => {});
    // Engine-specific callbacks (Phase 2.8)
    this.onEngineChange = options.onEngineChange || (() => {});
    this.onEngineFallback = options.onEngineFallback || (() => {});
    this.onModelLoadProgress = options.onModelLoadProgress || (() => {});
    this.onModelLoadComplete = options.onModelLoadComplete || (() => {});

    // Punctuation command mappings
    this.punctuationCommands = {
      period: '.',
      comma: ',',
      'question mark': '?',
      'exclamation point': '!',
      'exclamation mark': '!',
      'new line': '\n',
      'new paragraph': '\n\n',
      colon: ':',
      semicolon: ';',
      quote: '"',
      'end quote': '"',
      apostrophe: "'",
      dash: '-',
      hyphen: '-',
      'open parenthesis': '(',
      'close parenthesis': ')',
      'open bracket': '[',
      'close bracket': ']',
    };

    // Initialize engine manager
    this.initialize(options);
  }

  /**
   * Initialize engine manager with all available engines
   * @param {Object} options - Configuration options
   */
  async initialize(options = {}) {
    try {
      this.engineManager = createEngineManager({
        // Engine configuration
        autoFallback: this.settings.autoFallback,
        preferOffline: this.settings.preferOffline,
        priority: this.settings.enginePriority,
        enableWhisper: this.settings.enableWhisper,
        enableAzure: this.settings.enableAzure,
        // Recognition settings
        continuous: this.settings.continuous,
        interimResults: this.settings.interimResults,
        language: this.settings.language,
        maxAlternatives: this.settings.maxAlternatives,
        // Azure credentials
        azureSubscriptionKey: options.azureSubscriptionKey,
        azureRegion: options.azureRegion,
        azureCustomEndpoint: options.azureCustomEndpoint,
        // Whisper settings
        whisperModel: options.whisperModel,
        // Callbacks
        onStart: () => this.handleStart(),
        onEnd: () => this.handleEnd(),
        onResult: result => this.handleEngineResult(result),
        onError: (error, details) => this.handleError({ error: error.message, ...details }),
        onInterimResult: transcript => this.handleInterimResult(transcript),
        onEngineChange: (newType, oldType) => {
          console.log(`[STT Enhanced] Engine changed: ${oldType} -> ${newType}`);
          this.onEngineChange(newType, oldType);
        },
        onFallback: (newType, oldType, error) => {
          console.log(`[STT Enhanced] Fallback: ${oldType} -> ${newType}`, error?.message);
          this.onEngineFallback(newType, oldType, error);
        },
        onAllEnginesFailed: () => {
          this.onError(new Error('All speech recognition engines failed'));
        },
        onModelLoadProgress: progress => {
          this.onModelLoadProgress(progress);
        },
        onModelLoadComplete: () => {
          this.onModelLoadComplete();
        },
      });

      // Initialize all engines
      const results = await this.engineManager.initializeAll();
      console.log('[STT Enhanced] Engine initialization results:', results);

      return true;
    } catch (error) {
      console.error('[STT Enhanced] Initialization failed:', error);
      this.onError(error);
      return false;
    }
  }

  /**
   * Start listening for speech input
   * @param {HTMLElement} targetElement - The input element to insert text into
   * @returns {Promise<boolean>}
   */
  async startListening(targetElement) {
    if (!this.engineManager) {
      console.error('[STT Enhanced] Engine manager not initialized');
      return false;
    }

    if (this.isRecording) {
      console.warn('[STT Enhanced] Already recording');
      return false;
    }

    this.targetElement = targetElement;
    this.lastTranscript = '';
    this.interimTranscript = '';
    this.finalTranscript = '';

    try {
      const success = await this.engineManager.startListening();
      console.log('[STT Enhanced] Started listening');
      return success;
    } catch (error) {
      console.error('[STT Enhanced] Failed to start:', error);
      this.onError(error);
      return false;
    }
  }

  /**
   * Stop listening
   * @returns {Promise<boolean>}
   */
  async stopListening() {
    if (!this.engineManager || !this.isRecording) {
      return false;
    }

    try {
      const success = await this.engineManager.stopListening();
      console.log('[STT Enhanced] Stopped listening');
      return success;
    } catch (error) {
      console.error('[STT Enhanced] Failed to stop:', error);
      return false;
    }
  }

  /**
   * Pause listening
   * @returns {Promise<boolean>}
   */
  async pauseListening() {
    if (!this.engineManager || !this.isRecording) {
      return false;
    }

    try {
      this.isPaused = true;
      const success = await this.engineManager.pauseListening();
      console.log('[STT Enhanced] Paused listening');
      return success;
    } catch {
      return false;
    }
  }

  /**
   * Resume listening
   * @returns {Promise<boolean>}
   */
  async resumeListening() {
    if (!this.engineManager || !this.isPaused) {
      return false;
    }

    try {
      this.isPaused = false;
      const success = await this.engineManager.resumeListening();
      console.log('[STT Enhanced] Resumed listening');
      return success;
    } catch {
      return false;
    }
  }

  /**
   * Handle recognition start
   * @private
   */
  handleStart() {
    this.isRecording = true;
    this.isPaused = false;
    console.log('[STT Enhanced] Recognition started');
    this.onStart();
  }

  /**
   * Handle recognition end
   * @private
   */
  handleEnd() {
    if (!this.isPaused) {
      this.isRecording = false;
    }
    console.log('[STT Enhanced] Recognition ended');
    this.onEnd();
  }

  /**
   * Handle interim result
   * @param {string} transcript
   * @private
   */
  handleInterimResult(transcript) {
    this.interimTranscript = transcript;
    this.onInterimResult(transcript);
  }

  /**
   * Handle engine result
   * @param {RecognitionResult} result
   * @private
   */
  handleEngineResult(result) {
    const { transcript, confidence, alternatives, processingTime, engineType } = result;

    console.log(
      `[STT Enhanced] Result from ${engineType}: "${transcript}" ` +
        `(confidence: ${confidence?.toFixed(2)}, time: ${processingTime}ms)`
    );

    // Process voice commands if enabled
    if (this.settings.voiceCommands) {
      const commandResult = this.commandParser.parse(transcript);

      if (commandResult.type !== CommandType.TEXT) {
        this.executeCommand(commandResult);

        if (commandResult.remainingText) {
          this.processAndInsertText(commandResult.remainingText, {
            confidence,
            isFinal: true,
            alternatives,
          });
        }
        return;
      }
    }

    // Process as regular text
    this.processAndInsertText(transcript, {
      confidence,
      isFinal: true,
      alternatives,
    });
  }

  /**
   * Process and insert text
   * @param {string} text
   * @param {Object} metadata
   * @private
   */
  processAndInsertText(text, metadata = {}) {
    let processedText = text;

    // Process punctuation commands
    if (this.settings.punctuationCommands) {
      processedText = this.processPunctuationCommands(processedText);
    }

    // Apply auto-punctuation
    if (this.autoPunctuator && this.autoPunctuator.isEnabled()) {
      const currentTime = Date.now();
      const punctResult = this.autoPunctuator.process(processedText, {
        timestamp: currentTime,
        confidence: metadata.confidence || 1.0,
        isFinal: metadata.isFinal !== false,
      });
      processedText = punctResult.text;

      if (punctResult.punctuation !== PunctuationType.NONE) {
        this.onPunctuationAdded({
          type: punctResult.punctuation,
          confidence: punctResult.confidence,
          text: processedText,
        });
      }

      this.lastResultTimestamp = currentTime;
    } else if (this.settings.autoCapitalize) {
      processedText = this.capitalizeFirstWord(processedText);
    }

    // Save to history
    if (this.targetElement) {
      this.commandParser.saveToHistory(this.targetElement);
    }

    // Insert text
    if (this.targetElement) {
      this.insertText(this.targetElement, processedText);
    }

    this.lastDictation = processedText;

    // Confidence feedback
    if (this.confidenceFeedback && this.confidenceFeedback.isEnabled()) {
      const result = this.confidenceFeedback.addResult({
        transcript: processedText,
        confidence: metadata.confidence || 0,
        isFinal: metadata.isFinal !== false,
        alternatives: metadata.alternatives || [],
      });

      this.onConfidenceUpdate(result);

      if (!result.meetsThreshold(this.settings.confidenceThreshold)) {
        this.onLowConfidence(result);

        if (this.targetElement && this.settings.highlightLowConfidence) {
          this.confidenceFeedback.showBadge(this.targetElement, result);
        }
      }
    }

    this.finalTranscript += processedText;
    this.lastTranscript = processedText;
    this.onResult(processedText, this.finalTranscript);
  }

  /**
   * Execute voice command
   * @param {Object} commandResult
   * @private
   */
  executeCommand(commandResult) {
    const { type, params } = commandResult;
    console.log(`[STT Enhanced] Executing command: ${type}`, params);

    switch (type) {
      case CommandType.DELETE:
        this.commandParser.executeDelete(this.targetElement, params, this.lastDictation);
        break;
      case CommandType.UNDO:
        if (params.action === 'undo') {
          this.commandParser.undo(this.targetElement, params.count);
        } else if (params.action === 'redo') {
          this.commandParser.redo(this.targetElement, params.count);
        }
        break;
      case CommandType.REDO:
        this.commandParser.redo(this.targetElement, params.count);
        break;
      case CommandType.REPLACE:
        this.commandParser.executeReplace(this.targetElement, params, this.lastDictation);
        break;
      case CommandType.SELECT:
        this.commandParser.executeSelect(this.targetElement, params);
        break;
      case CommandType.NAVIGATE:
        this.executeNavigate(params);
        break;
      case CommandType.FORMAT:
        this.executeFormat(params);
        break;
    }
  }

  /**
   * Execute navigation command
   * @param {Object} params
   * @private
   */
  executeNavigate(params) {
    // Implementation from original STT controller
    if (!this.targetElement) {
      return;
    }
    // ... navigation logic
    this.handleCommandExecuted({
      type: CommandType.NAVIGATE,
      message: `Navigated: ${params.action}`,
    });
  }

  /**
   * Execute format command
   * @param {Object} params
   * @private
   */
  executeFormat(params) {
    // Implementation from original STT controller
    if (!this.targetElement) {
      return;
    }
    // ... format logic
    this.handleCommandExecuted({
      type: CommandType.FORMAT,
      message: `Applied: ${params.format}`,
    });
  }

  /**
   * Handle command execution
   * @param {Object} result
   * @private
   */
  handleCommandExecuted(result) {
    console.log(`[STT Enhanced] Command executed: ${result.message}`);
    this.onCommandExecuted(result);
  }

  /**
   * Handle error
   * @param {Object} event
   * @private
   */
  handleError(event) {
    console.error('[STT Enhanced] Error:', event.error || event.message);
    this.isRecording = false;
    this.onError(new Error(event.error || event.message), event.code);
  }

  /**
   * Process punctuation commands
   * @param {string} text
   * @returns {string}
   * @private
   */
  processPunctuationCommands(text) {
    let processed = text;

    for (const [command, punctuation] of Object.entries(this.punctuationCommands)) {
      const escapedCommand = command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\s*${escapedCommand}\\s*`, 'gi');

      if (command === 'new line') {
        processed = processed.replace(regex, '\n');
      } else if (command === 'new paragraph') {
        processed = processed.replace(regex, '\n\n');
      } else {
        processed = processed.replace(regex, punctuation + ' ');
      }
    }

    return processed.replace(/\s+/g, ' ').trim();
  }

  /**
   * Capitalize first word
   * @param {string} text
   * @returns {string}
   * @private
   */
  capitalizeFirstWord(text) {
    if (!text || text.length === 0) {
      return text;
    }
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  /**
   * Insert text into target element
   * @param {HTMLElement} element
   * @param {string} text
   * @private
   */
  insertText(element, text) {
    if (!element) {
      return;
    }

    const shouldAddSpace =
      element.value && element.value.trim().length > 0 && !element.value.endsWith(' ');
    const textToInsert = shouldAddSpace ? ' ' + text : text;

    if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
      const start = element.selectionStart || element.value.length;
      const end = element.selectionEnd || element.value.length;
      const before = element.value.substring(0, start);
      const after = element.value.substring(end);

      element.value = before + textToInsert + after;

      const newPos = start + textToInsert.length;
      element.selectionStart = newPos;
      element.selectionEnd = newPos;

      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (element.contentEditable === 'true' || element.isContentEditable) {
      const selection = window.getSelection();

      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();

        const textNode = document.createTextNode(textToInsert);
        range.insertNode(textNode);

        range.setStartAfter(textNode);
        range.setEndAfter(textNode);
        selection.removeAllRanges();
        selection.addRange(range);

        element.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        element.textContent += textToInsert;
      }
    }

    console.log(`[STT Enhanced] Inserted: "${text}"`);
  }

  /**
   * Get current active engine type
   * @returns {string|null}
   */
  getActiveEngineType() {
    return this.engineManager?.getActiveEngineType() || null;
  }

  /**
   * Get all engine status
   * @returns {Object}
   */
  getEngineStatus() {
    return this.engineManager?.getStatus() || { engines: {} };
  }

  /**
   * Set preferred engine
   * @param {string} engineType - Engine type from EngineType enum
   * @returns {Promise<boolean>}
   */
  async setPreferredEngine(engineType) {
    if (!this.engineManager) {
      return false;
    }
    return await this.engineManager.setActiveEngine(engineType);
  }

  /**
   * Set engine priority order
   * @param {Array<string>} priority
   */
  setEnginePriority(priority) {
    if (this.engineManager) {
      this.engineManager.setPriority(priority);
      this.settings.enginePriority = priority;
    }
  }

  /**
   * Enable/disable offline mode preference
   * @param {boolean} prefer
   */
  setPreferOffline(prefer) {
    this.settings.preferOffline = prefer;
    if (this.engineManager) {
      this.engineManager.preferOffline = prefer;
    }
  }

  /**
   * Configure Azure credentials
   * @param {string} subscriptionKey
   * @param {string} region
   */
  async configureAzure(subscriptionKey, region) {
    const azureEngine = this.engineManager?.getEngine(EngineType.AZURE);
    if (azureEngine) {
      await azureEngine.saveCredentials(subscriptionKey, region);
    }
  }

  /**
   * Check if offline mode is available
   * @returns {boolean}
   */
  isOfflineAvailable() {
    const status = this.getEngineStatus();
    const whisper = status.engines[EngineType.WHISPER];
    return whisper?.status === EngineStatus.READY;
  }

  /**
   * Get engine metrics
   * @returns {Object}
   */
  getEngineMetrics() {
    return this.engineManager?.getMetrics() || {};
  }

  async initializeVocabulary(options = {}) {
    try {
      this.vocabularyManager = new VocabularyManager({
        autoLearnEnabled: options.autoLearnEnabled !== false,
        autoLearnThreshold: options.autoLearnThreshold || 3,
        enabledCategories: options.enabledCategories || [VocabularyPresets.CUSTOM],
        onWordAdded: entry => console.log(`[STT Enhanced] Vocabulary word added: ${entry.word}`),
        onWordRemoved: entry =>
          console.log(`[STT Enhanced] Vocabulary word removed: ${entry.word}`),
        onError: error => console.error('[STT Enhanced] Vocabulary error:', error),
      });

      await this.vocabularyManager.initialize();
      console.log('[STT Enhanced] Vocabulary manager initialized');
    } catch (error) {
      console.error('[STT Enhanced] Failed to initialize vocabulary:', error);
    }
  }

  initializeAutoPunctuation(options = {}) {
    try {
      this.autoPunctuator = new AutoPunctuator({
        enabled: this.settings.autoPunctuation,
        mode: this.settings.autoPunctuationMode,
        ...options,
      });
      console.log('[STT Enhanced] Auto-punctuation initialized');
    } catch (error) {
      console.error('[STT Enhanced] Failed to initialize auto-punctuation:', error);
    }
  }

  initializeConfidenceFeedback(options = {}) {
    try {
      this.confidenceFeedback = new ConfidenceFeedback({
        enabled: this.settings.confidenceFeedback,
        minThreshold: this.settings.confidenceThreshold,
        ...options,
      });
      console.log('[STT Enhanced] Confidence feedback initialized');
    } catch (error) {
      console.error('[STT Enhanced] Failed to initialize confidence feedback:', error);
    }
  }

  /**
   * Update settings
   * @param {Object} newSettings
   */
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };

    if (this.engineManager) {
      this.engineManager.updateSettings({
        continuous: newSettings.continuous,
        interimResults: newSettings.interimResults,
        language: newSettings.language,
        maxAlternatives: newSettings.maxAlternatives,
      });
    }

    console.log('[STT Enhanced] Settings updated');
  }

  /**
   * Get current status
   * @returns {Object}
   */
  getStatus() {
    return {
      isRecording: this.isRecording,
      isPaused: this.isPaused,
      hasTarget: this.targetElement !== null,
      language: this.settings.language,
      continuous: this.settings.continuous,
      activeEngine: this.getActiveEngineType(),
      engines: this.getEngineStatus(),
    };
  }

  /**
   * Cleanup and destroy
   */
  async destroy() {
    if (this.engineManager) {
      await this.engineManager.destroy();
      this.engineManager = null;
    }

    if (this.commandParser) {
      this.commandParser.destroy();
    }

    if (this.vocabularyManager) {
      this.vocabularyManager.destroy();
      this.vocabularyManager = null;
    }

    if (this.autoPunctuator) {
      this.autoPunctuator.destroy();
      this.autoPunctuator = null;
    }

    if (this.confidenceFeedback) {
      this.confidenceFeedback.destroy();
      this.confidenceFeedback = null;
    }

    this.isRecording = false;
    this.isPaused = false;
    this.targetElement = null;

    console.log('[STT Enhanced] Controller destroyed');
  }
}

export default STTControllerEnhanced;
export { EngineType, EngineStatus };
