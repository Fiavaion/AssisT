/**
 * Speech-to-Text Controller
 * Handles voice recognition using Web Speech API
 *
 * Features:
 * - Real-time speech recognition
 * - Continuous listening mode
 * - Punctuation voice commands
 * - Auto-capitalization
 * - Text insertion into input fields
 * - Voice editing commands (delete, undo, redo, replace)
 * - Voice navigation commands (cursor movement)
 * - Voice formatting commands (bold, italic, etc.)
 * - Custom vocabulary support
 *
 * @module STTController
 * @version 2.1.0 (Custom Vocabulary)
 */

import { CommandParser, CommandType } from './command-parser.js';
import { VocabularyManager, VocabularyPresets } from './vocabulary-manager.js';
import { STTProfileManager, STTProfileType, mapNeurodivergentProfile } from './stt-profiles.js';
import {
  AutoPunctuator,
  PunctuationType,
  DEFAULT_CONFIG as AUTO_PUNCT_CONFIG,
} from './auto-punctuation.js';
import {
  ConfidenceFeedback,
  ConfidenceLevel,
  DEFAULT_CONFIG as CONFIDENCE_CONFIG,
} from './confidence-feedback.js';
import { debugLog } from '../../utils/debug-log.js';
import { allowDictation, onDictationWithdrawn } from '../../utils/dictation-consent.js';
import { showToast } from '../../core/ui/toast.js';

/**
 * What a no to the dictation question is answered with: the same words the floating microphone
 * and the shortcut use, naming both ways this controller is started so the student knows how to
 * be asked again.
 */
const DECLINED_NOTICE =
  'Nothing was recorded or sent. Press the microphone or the voice typing shortcut to be asked again.';

/**
 * What the student is told when recognition fails. Every sentence names the thing to do next, and
 * no browser error code or DOMException text reaches the page: "not-allowed" means a blocked
 * microphone, and the fix is in the address bar, so that is what it says.
 */
export const STT_ERROR_MESSAGES = {
  'no-speech': 'Nothing was heard. Press the microphone button and speak again.',
  'audio-capture':
    'No microphone was found. Plug one in, or pick one in your computer sound settings, then try again.',
  'not-allowed':
    'AssisT needs permission to use your microphone. Click the microphone icon in the address bar, choose Allow, then press the microphone button again.',
  'service-not-allowed':
    'Your browser blocked the speech service. Allow the microphone for this site in its settings, then try again.',
  network: 'Voice typing needs an internet connection. Check your connection and try again.',
  'language-not-supported':
    'Voice typing does not support the language it is set to. Choose another language in AssisT settings.',
  'bad-grammar':
    'Voice typing could not understand that. Press the microphone button and try again.',
};

/** Said when voice typing has nowhere to run. */
export const UNSUPPORTED_BROWSER =
  'Voice typing is not available in this browser. Open the page in Google Chrome to dictate.';

/** Said when the cause is something the student can do nothing specific about. */
export const GENERIC_START_FAILURE = 'Voice typing could not start. Please try again in a moment.';

export class STTController {
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
      autoPunctuationMode: options.autoPunctuationMode || 'auto', // 'auto', 'assisted', 'manual'
      // Confidence feedback settings
      confidenceFeedback:
        options.confidenceFeedback !== undefined ? options.confidenceFeedback : true,
      confidenceThreshold: options.confidenceThreshold || 0.6,
      highlightLowConfidence:
        options.highlightLowConfidence !== undefined ? options.highlightLowConfidence : true,
      showAlternatives: options.showAlternatives !== undefined ? options.showAlternatives : true,
    };

    this.recognition = null;
    this.isRecording = false;
    // True from the moment start() is called until onstart, onerror or onend answers. Nothing
    // else can tell a pending start from an idle controller, which is why Stop used to do
    // nothing while the microphone was still coming up.
    this.isStarting = false;
    this.isPaused = false;
    this.targetElement = null;
    this.lastTranscript = '';
    this.lastDictation = ''; // Track last dictated text for "delete that" / "replace that"
    this.interimTranscript = '';
    this.finalTranscript = '';

    // Initialize command parser for voice commands
    this.commandParser = new CommandParser({
      enabled: this.settings.voiceCommands,
      onCommandExecuted: result => this.handleCommandExecuted(result),
      onError: error => this.onError(error),
    });

    // Initialize vocabulary manager for custom word recognition
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

    // Timing tracking for auto-punctuation
    this.lastResultTimestamp = 0;

    // Dictation sends the voice to Google (Chrome's speech recognition), so nothing starts without
    // the student's yes (ADR 0006). A caller that has already asked may pass its own check.
    this.confirmStart = options.confirmStart || allowDictation;
    this.startAttempt = 0;
    this.releaseWithdrawal = () => {};

    // Others who need to know the recogniser started, stopped or failed (citation Voice capture)
    // subscribe here; the callbacks below belong to whoever created the controller.
    this.stateListeners = new Set();

    // Callbacks
    this.onStart = options.onStart || (() => {});
    this.onEnd = options.onEnd || (() => {});
    this.onResult = options.onResult || (() => {});
    this.onError = options.onError || (() => {});
    this.onInterimResult = options.onInterimResult || (() => {});
    this.onCommandExecuted = options.onCommandExecuted || (() => {}); // Callback for voice commands
    this.onPunctuationAdded = options.onPunctuationAdded || (() => {}); // Callback for auto-punctuation
    // Citation voice-capture hook. Given a final transcript, returns true if it was a citation
    // trigger phrase (e.g. "cite this") that it consumed — in which case the phrase is NOT inserted
    // as dictated text. Default no-op so STT behaves identically when citation capture is unwired.
    this.onCitationTrigger = options.onCitationTrigger || (() => false);
    // Companion voice-palette hook. Given a final transcript, returns true if it was a spoken
    // command it executed — in which case the phrase is NOT inserted as dictated text. Default
    // no-op so STT behaves identically when the palette is unwired.
    this.onAssistCommand = options.onAssistCommand || (() => false);
    this.onConfidenceUpdate = options.onConfidenceUpdate || (() => {}); // Callback for confidence feedback
    this.onLowConfidence = options.onLowConfidence || (() => {}); // Callback for low confidence warning
    this.onStatsUpdate = options.onStatsUpdate || (() => {}); // Callback for session stats update

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

    this.initialize();
  }

  /**
   * Initialize Web Speech API
   */
  initialize() {
    // Check browser support
    if (!('webkitSpeechRecognition' in window)) {
      console.error('[STT] Web Speech API not supported in this browser');
      this.onError(new Error(UNSUPPORTED_BROWSER), 'unsupported');
      return false;
    }

    try {
      this.recognition = new webkitSpeechRecognition();

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
      this.recognition.onaudiostart = () => console.log('[STT] Audio capture started');
      this.recognition.onaudioend = () => console.log('[STT] Audio capture ended');
      this.recognition.onspeechstart = () => console.log('[STT] Speech detected');
      this.recognition.onspeechend = () => console.log('[STT] Speech ended');

      console.log('[STT] Controller initialized successfully');
      return true;
    } catch (error) {
      // The raw error is for the console; the student gets a sentence.
      console.error('[STT] Initialization failed:', error);
      this.onError(new Error(GENERIC_START_FAILURE), 'init-failed');
      return false;
    }
  }

  /**
   * Start listening for speech input
   * @param {HTMLElement} targetElement - The input element to insert text into
   */
  startListening(targetElement) {
    if (!this.recognition) {
      console.error('[STT] Recognition not initialized');
      return false;
    }

    if (this.isRecording) {
      console.warn('[STT] Already recording');
      return false;
    }

    if (this.isStarting) {
      console.warn('[STT] A start is already pending');
      return false;
    }

    this.targetElement = targetElement;
    this.lastTranscript = '';
    this.interimTranscript = '';
    this.finalTranscript = '';

    // Starting is pending from here, question included, so Stop works while the student decides.
    this.isStarting = true;
    const attempt = ++this.startAttempt;
    const verdict = this.confirmStart({ returnFocus: targetElement });
    if (verdict === true) {
      return this.beginRecognition();
    }
    Promise.resolve(verdict)
      .catch(() => false)
      .then(allowed => {
        if (attempt !== this.startAttempt || !this.isStarting) {
          // Stopped, or started again, while the question was open.
          return;
        }
        if (!allowed) {
          // Nothing was started and nothing was sent; the button goes back to rest, and the
          // student is told so in a live region rather than left with silence.
          this.isStarting = false;
          this.onEnd();
          this.emitState({ type: 'end' });
          showToast(DECLINED_NOTICE, 6000, { force: true });
          return;
        }
        this.beginRecognition();
      });
    return true;
  }

  /**
   * Start the browser's recognition, once the student has said yes.
   * @returns {boolean} whether the start was requested
   */
  beginRecognition() {
    try {
      this.recognition.start();
      console.log('[STT] Start requested, waiting for onstart');
      return true;
    } catch (error) {
      // A DOMException here reads "Failed to execute 'start' on 'SpeechRecognition': recognition
      // has already started." — engine wording that means nothing to a student, so it never
      // leaves this method.
      console.error('[STT] Failed to start recognition:', error);
      this.isStarting = false;
      if (error && error.name === 'InvalidStateError') {
        // Recognition is already running: nothing is broken and nothing needs saying.
        return false;
      }
      this.onError(new Error(GENERIC_START_FAILURE), 'start-failed');
      this.emitState({ type: 'error', code: 'start-failed', message: GENERIC_START_FAILURE });
      return false;
    }
  }

  /**
   * Stop listening
   */
  stopListening() {
    if (!this.recognition || (!this.isRecording && !this.isStarting)) {
      return false;
    }

    // A start that has not landed yet is aborted, not stopped: stop() on a recognition that never
    // started is a no-op, which is how Stop came to do nothing and the next press hit
    // "recognition has already started".
    const pendingStart = !this.isRecording && this.isStarting;
    this.releaseWithdrawal();
    this.releaseWithdrawal = () => {};

    // CRITICAL: Set isRecording to false BEFORE calling stop()
    // This prevents handleEnd() from restarting recognition
    this.isRecording = false;
    this.isStarting = false;
    this.isPaused = false;

    try {
      if (pendingStart) {
        this.recognition.abort();
        console.log('[STT] Pending start aborted');
      } else {
        this.recognition.stop();
        console.log('[STT] Stopped listening (isRecording set to false before stop)');
      }
      return true;
    } catch (error) {
      console.error('[STT] Failed to stop recognition:', error);
      return false;
    }
  }

  /**
   * Pause listening (for continuous mode)
   * NOTE: Keeps recognition running to avoid permission prompts on resume
   */
  pauseListening() {
    if (!this.recognition || !this.isRecording) {
      return false;
    }

    this.isPaused = true;
    console.log('[STT] Paused listening (recognition still running, ignoring results)');
    return true;
  }

  /**
   * Resume listening (for continuous mode)
   * NOTE: Doesn't restart recognition, just resumes processing results
   */
  resumeListening() {
    if (!this.recognition || !this.isPaused) {
      return false;
    }

    this.isPaused = false;
    console.log('[STT] Resumed listening (processing results again)');
    return true;
  }

  /**
   * Handle recognition start event
   */
  handleStart() {
    this.isRecording = true;
    this.isStarting = false;
    this.isPaused = false;
    // A yes withdrawn in the popup stops dictation now, not at the next start.
    this.releaseWithdrawal();
    this.releaseWithdrawal = onDictationWithdrawn(() => this.stopListening());
    console.log('[STT] Recognition started');
    this.onStart();
    this.emitState({ type: 'start' });
  }

  /**
   * Handle recognition end event
   */
  handleEnd() {
    console.log(
      '[STT] Recognition ended, isRecording:',
      this.isRecording,
      'isPaused:',
      this.isPaused
    );

    // If continuous mode and still recording (even if paused), restart
    // This keeps recognition running in background during pause to avoid permission prompts
    if (this.settings.continuous && this.isRecording) {
      console.log('[STT] Restarting continuous recognition (paused:', this.isPaused, ')');
      try {
        this.recognition.start();
      } catch (error) {
        console.error('[STT] Failed to restart continuous recognition:', error);
        // stopListening() keeps the flags consistent; this.stop() never existed and threw here.
        this.stopListening();
        this.onEnd();
        this.emitState({ type: 'end' });
      }
    } else {
      // User stopped recording (not just paused)
      console.log('[STT] Recording fully stopped');
      this.releaseWithdrawal();
      this.releaseWithdrawal = () => {};
      this.isRecording = false;
      this.isStarting = false;
      this.isPaused = false;
      this.onEnd();
      this.emitState({ type: 'end' });
    }
  }

  /**
   * Handle recognition result
   * @param {SpeechRecognitionEvent} event
   */
  handleResult(event) {
    // Ignore results when paused (recognition stays running to avoid permission prompts)
    if (this.isPaused) {
      console.log('[STT] Ignoring result while paused');
      return;
    }

    let interimTranscript = '';
    let finalTranscript = '';
    let avgConfidence = 0;
    let confidenceCount = 0;

    // Process all results
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      const confidence = event.results[i][0].confidence;

      if (event.results[i].isFinal) {
        finalTranscript += transcript;
        avgConfidence += confidence || 1.0;
        confidenceCount++;
        // Don't log the transcript text — dictated speech is the student's own words and can be
        // sensitive on a shared/lab machine. Log only length + confidence for debugging.
        console.log(
          `[STT] Final transcript: ${transcript.length} chars (confidence: ${confidence})`
        );
      } else {
        interimTranscript += transcript;
      }
    }

    // Calculate average confidence
    if (confidenceCount > 0) {
      avgConfidence /= confidenceCount;
    }

    // Update interim results
    if (interimTranscript) {
      this.interimTranscript = interimTranscript;
      this.onInterimResult(interimTranscript);
    }

    // Process final results
    if (finalTranscript) {
      // First, check for voice commands if enabled
      if (this.settings.voiceCommands) {
        const commandResult = this.commandParser.parse(finalTranscript);

        if (commandResult.type !== CommandType.TEXT) {
          // Execute the voice command
          this.executeCommand(commandResult);

          // If there's remaining text after the command, process it
          if (commandResult.remainingText) {
            this.processAndInsertText(commandResult.remainingText, {
              confidence: avgConfidence,
              isFinal: true,
            });
          }
          return;
        }
      }

      // Citation voice-capture: a trigger phrase snapshots a draft and must NOT be inserted as
      // dictated text. If the hook consumes it, stop here.
      if (this.onCitationTrigger(finalTranscript)) {
        return;
      }

      // Companion voice palette: a recognised command is executed, never inserted as text.
      if (this.onAssistCommand(finalTranscript)) {
        return;
      }

      // No command detected - process as regular text
      this.processAndInsertText(finalTranscript, {
        confidence: avgConfidence,
        isFinal: true,
      });
    }
  }

  /**
   * Process and insert text (with punctuation and capitalization)
   * @param {string} text - Text to process and insert
   * @param {Object} metadata - Optional metadata from recognition event
   */
  processAndInsertText(text, metadata = {}) {
    let processedText = text;

    // Process manual punctuation commands if enabled (spoken "period", "comma", etc.)
    if (this.settings.punctuationCommands) {
      processedText = this.processPunctuationCommands(processedText);
    }

    // Apply auto-punctuation if enabled
    if (this.autoPunctuator && this.autoPunctuator.isEnabled()) {
      const currentTime = Date.now();
      const punctResult = this.autoPunctuator.process(processedText, {
        timestamp: currentTime,
        confidence: metadata.confidence || 1.0,
        isFinal: metadata.isFinal !== false,
      });
      processedText = punctResult.text;

      // Notify about auto-punctuation
      if (punctResult.punctuation !== PunctuationType.NONE) {
        this.onPunctuationAdded({
          type: punctResult.punctuation,
          confidence: punctResult.confidence,
          text: processedText,
        });
      }

      this.lastResultTimestamp = currentTime;
    } else if (this.settings.autoCapitalize) {
      // Only apply basic capitalization if auto-punctuation is disabled
      processedText = this.capitalizeFirstWord(processedText);
    }

    // Save to history for undo/redo
    if (this.targetElement) {
      this.commandParser.saveToHistory(this.targetElement);
    }

    // Insert text into target element
    if (this.targetElement) {
      this.insertText(this.targetElement, processedText);
    }

    // Track last dictation for "delete that" / "replace that" commands
    this.lastDictation = processedText;

    // Track confidence feedback
    if (this.confidenceFeedback && this.confidenceFeedback.isEnabled()) {
      const result = this.confidenceFeedback.addResult({
        transcript: processedText,
        confidence: metadata.confidence || 0,
        isFinal: metadata.isFinal !== false,
        alternatives: metadata.alternatives || [],
      });

      // Fire confidence update callback
      this.onConfidenceUpdate(result);

      // Check for low confidence warning
      if (!result.meetsThreshold(this.settings.confidenceThreshold)) {
        this.onLowConfidence(result);

        // Show confidence badge if target element exists
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
   * Execute a parsed voice command
   * @param {Object} commandResult - Parsed command from CommandParser
   */
  executeCommand(commandResult) {
    const { type, params } = commandResult;

    console.log(`[STT] Executing voice command: ${type}`, params);

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

      default:
        console.warn(`[STT] Unknown command type: ${type}`);
    }
  }

  /**
   * Execute navigation command
   * @param {Object} params - Navigation parameters
   */
  executeNavigate(params) {
    if (!this.targetElement) {
      return;
    }

    const element = this.targetElement;
    const isTextArea = element.tagName === 'TEXTAREA' || element.tagName === 'INPUT';
    const text = isTextArea ? element.value : element.textContent;

    switch (params.action) {
      case 'goto':
        if (params.position === 'start') {
          if (isTextArea) {
            element.selectionStart = 0;
            element.selectionEnd = 0;
          }
        } else if (params.position === 'end') {
          if (isTextArea) {
            element.selectionStart = text.length;
            element.selectionEnd = text.length;
          }
        } else if (params.position === 'line' && params.line) {
          const lines = text.split('\n');
          let charPos = 0;
          for (let i = 0; i < Math.min(params.line - 1, lines.length); i++) {
            charPos += lines[i].length + 1;
          }
          if (isTextArea) {
            element.selectionStart = charPos;
            element.selectionEnd = charPos;
          }
        }
        break;

      case 'move':
        if (isTextArea) {
          let pos = element.selectionStart;
          const moveAmount = params.count || 1;

          if (params.direction === 'left') {
            if (params.unit === 'word') {
              // Move left by words
              for (let i = 0; i < moveAmount; i++) {
                const before = text.slice(0, pos);
                const match = before.match(/\S+\s*$/);
                pos = match ? pos - match[0].length : 0;
              }
            } else {
              pos = Math.max(0, pos - moveAmount);
            }
          } else if (params.direction === 'right') {
            if (params.unit === 'word') {
              for (let i = 0; i < moveAmount; i++) {
                const after = text.slice(pos);
                const match = after.match(/^\s*\S+/);
                pos = match ? pos + match[0].length : text.length;
              }
            } else {
              pos = Math.min(text.length, pos + moveAmount);
            }
          } else if (params.direction === 'up' || params.direction === 'down') {
            const lines = text.split('\n');
            let currentLine = 0;
            let charCount = 0;
            for (let i = 0; i < lines.length; i++) {
              if (charCount + lines[i].length >= pos) {
                currentLine = i;
                break;
              }
              charCount += lines[i].length + 1;
            }

            const colPos = pos - charCount;
            const targetLine =
              params.direction === 'up'
                ? Math.max(0, currentLine - moveAmount)
                : Math.min(lines.length - 1, currentLine + moveAmount);

            let newPos = 0;
            for (let i = 0; i < targetLine; i++) {
              newPos += lines[i].length + 1;
            }
            newPos += Math.min(colPos, lines[targetLine].length);
            pos = newPos;
          }

          element.selectionStart = pos;
          element.selectionEnd = pos;
        }
        break;

      case 'find':
        if (params.text) {
          const searchPos = text.indexOf(params.text, element.selectionEnd);
          if (searchPos !== -1) {
            if (isTextArea) {
              element.selectionStart = searchPos;
              element.selectionEnd = searchPos + params.text.length;
            }
            this.lastSearchText = params.text;
            this.lastSearchPos = searchPos;
          }
        }
        break;

      case 'findNext':
        if (this.lastSearchText) {
          const searchPos = text.indexOf(this.lastSearchText, (this.lastSearchPos || 0) + 1);
          if (searchPos !== -1) {
            if (isTextArea) {
              element.selectionStart = searchPos;
              element.selectionEnd = searchPos + this.lastSearchText.length;
            }
            this.lastSearchPos = searchPos;
          }
        }
        break;

      case 'findPrevious':
        if (this.lastSearchText) {
          const searchPos = text.lastIndexOf(
            this.lastSearchText,
            (this.lastSearchPos || text.length) - 1
          );
          if (searchPos !== -1) {
            if (isTextArea) {
              element.selectionStart = searchPos;
              element.selectionEnd = searchPos + this.lastSearchText.length;
            }
            this.lastSearchPos = searchPos;
          }
        }
        break;
    }

    element.focus();
    this.handleCommandExecuted({
      type: CommandType.NAVIGATE,
      message: `Navigated: ${params.action}`,
    });
  }

  /**
   * Execute formatting command
   * @param {Object} params - Format parameters
   */
  executeFormat(params) {
    if (!this.targetElement) {
      return;
    }

    const element = this.targetElement;
    const isContentEditable = element.isContentEditable;

    // Formatting only works for contentEditable elements (rich text)
    if (!isContentEditable) {
      // For plain text, we can still handle some commands
      if (params.format === 'paragraph' || params.format === 'newline') {
        const text = params.format === 'paragraph' ? '\n\n' : '\n';
        this.insertText(element, text);
        return;
      }

      this.handleCommandExecuted({
        type: CommandType.FORMAT,
        message: 'Formatting not supported in plain text fields',
      });
      return;
    }

    // Execute rich text formatting using execCommand, in the field's own document: an editor's
    // iframe (Canvas's Rich Content Editor) has a selection of its own, which the page's does not see.
    const doc = element.ownerDocument || document;
    switch (params.format) {
      case 'bold':
        doc.execCommand('bold', false, null);
        break;
      case 'italic':
        doc.execCommand('italic', false, null);
        break;
      case 'underline':
        doc.execCommand('underline', false, null);
        break;
      case 'paragraph':
        doc.execCommand('insertParagraph', false, null);
        break;
      case 'newline':
        doc.execCommand('insertLineBreak', false, null);
        break;
      case 'bulletList':
        doc.execCommand('insertUnorderedList', false, null);
        break;
      case 'numberedList':
        doc.execCommand('insertOrderedList', false, null);
        break;
      case 'heading':
        if (params.level >= 1 && params.level <= 6) {
          doc.execCommand('formatBlock', false, `h${params.level}`);
        }
        break;
      case 'quote':
      case 'blockquote':
        doc.execCommand('formatBlock', false, 'blockquote');
        break;
    }

    this.handleCommandExecuted({
      type: CommandType.FORMAT,
      message: `Applied: ${params.format}`,
    });
  }

  /**
   * Handle command execution feedback
   * @param {Object} result - Command result
   */
  handleCommandExecuted(result) {
    console.log(`[STT] Command executed: ${result.message}`);
    this.onCommandExecuted(result);
  }

  /**
   * Handle recognition error
   * @param {SpeechRecognitionError} event
   */
  handleError(event) {
    console.error('[STT] Recognition error:', event.error, event.message);

    this.isRecording = false;
    this.isStarting = false;

    // A deliberate abort (Stop, or a cancelled start) is not a failure and needs no message.
    if (event.error === 'aborted') {
      return;
    }

    const userMessage = STT_ERROR_MESSAGES[event.error] || GENERIC_START_FAILURE;

    this.onError(new Error(userMessage), event.error);
    this.emitState({ type: 'error', code: event.error, message: userMessage });
  }

  /**
   * Hear the recogniser start, stop and fail without taking over the owner's callbacks.
   * @param {(event: {type: 'start'|'end'|'error', code?: string, message?: string}) => void} listener
   * @returns {() => void} unsubscribe
   */
  addStateListener(listener) {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  /**
   * Tell every state listener; one that throws does not stop the rest hearing.
   * @param {{type: 'start'|'end'|'error', code?: string, message?: string}} event
   * @param {Set<Function>} [listeners]
   */
  emitState(event, listeners = this.stateListeners) {
    for (const listener of [...listeners]) {
      try {
        listener(event);
      } catch (error) {
        console.error('[STT] A state listener failed:', error);
      }
    }
  }

  /**
   * Handle no match (speech not recognized)
   */
  handleNoMatch() {
    console.warn('[STT] No speech recognized');
    this.onError(
      new Error('That was not clear. Press the microphone button and try again.'),
      'no-match'
    );
  }

  /**
   * Process punctuation commands in transcript
   * @param {string} text - The transcript text
   * @returns {string} - Processed text with punctuation
   */
  processPunctuationCommands(text) {
    let processed = text;

    // Check each punctuation command
    for (const [command, punctuation] of Object.entries(this.punctuationCommands)) {
      const escapedCommand = command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\s*${escapedCommand}\\s*`, 'gi');

      // Replace command with punctuation
      if (command === 'new line') {
        processed = processed.replace(regex, '\n');
      } else if (command === 'new paragraph') {
        processed = processed.replace(regex, '\n\n');
      } else {
        // For regular punctuation, don't add space before
        processed = processed.replace(regex, punctuation + ' ');
      }
    }

    // Clean up extra spaces
    processed = processed.replace(/\s+/g, ' ').trim();

    return processed;
  }

  /**
   * Capitalize first word of text
   * @param {string} text
   * @returns {string}
   */
  capitalizeFirstWord(text) {
    if (!text || text.length === 0) {
      return text;
    }

    // Capitalize first letter
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  /**
   * Insert text into target element
   * @param {HTMLElement} element - Target input element
   * @param {string} text - Text to insert
   */
  insertText(element, text) {
    if (!element) {
      console.error('[STT] No target element provided');
      return;
    }

    // Add space before text if element already has content
    const shouldAddSpace =
      element.value && element.value.trim().length > 0 && !element.value.endsWith(' ');
    const textToInsert = shouldAddSpace ? ' ' + text : text;

    // Handle different element types
    if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
      // Standard input/textarea
      const start = element.selectionStart || element.value.length;
      const end = element.selectionEnd || element.value.length;
      const before = element.value.substring(0, start);
      const after = element.value.substring(end);

      element.value = before + textToInsert + after;

      // Set cursor position after inserted text
      const newPos = start + textToInsert.length;
      element.selectionStart = newPos;
      element.selectionEnd = newPos;

      // Trigger input event for frameworks (React, Vue, etc.)
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (element.contentEditable === 'true' || element.isContentEditable) {
      // ContentEditable element. Everything is done in the element's own document: the body of an
      // editor's iframe (Canvas's Rich Content Editor) has its own selection and makes its own nodes.
      const doc = element.ownerDocument || document;
      const selection = (doc.defaultView || window).getSelection();
      const caretInElement =
        selection.rangeCount > 0 &&
        typeof element.contains === 'function' &&
        element.contains(selection.anchorNode);

      // The browser's own typing path first: the editor sees a real input event, its undo history
      // holds the words, and what it saves includes them.
      const typed =
        caretInElement &&
        typeof doc.execCommand === 'function' &&
        doc.execCommand('insertText', false, textToInsert);

      if (typed) {
        // Nothing more to do: the browser inserted the words and told the editor.
      } else if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();

        const textNode = doc.createTextNode(textToInsert);
        range.insertNode(textNode);

        // Move cursor to end of inserted text
        range.setStartAfter(textNode);
        range.setEndAfter(textNode);
        selection.removeAllRanges();
        selection.addRange(range);

        // Trigger input event
        element.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        // Fallback: append to end
        element.textContent += textToInsert;
      }
    }

    console.log(`[STT] Inserted ${text.length} characters`);
    debugLog('[STT] Inserted text:', text);
  }

  /**
   * Update settings
   * @param {Object} newSettings - New settings to apply
   */
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };

    // Update recognition settings if already initialized
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

    // Update command parser settings
    if (this.commandParser && newSettings.voiceCommands !== undefined) {
      this.commandParser.updateSettings({ enabled: newSettings.voiceCommands });
    }

    console.log('[STT] Settings updated:', Object.keys(newSettings).join(', '));
  }

  /**
   * Apply STT profile settings
   * @param {string} profileType - Profile type from STTProfileType enum
   * @param {Object} customizations - Optional customizations
   */
  applyProfile(profileType, customizations = {}) {
    if (!this.profileManager) {
      this.profileManager = new STTProfileManager({
        onProfileChange: profile => this.handleProfileChange(profile),
      });
    }

    this.profileManager.setProfile(profileType, customizations);
  }

  /**
   * Apply profile from neurodivergent profile name
   * @param {string} profileName - Profile name from popup (e.g., "ADHD Focus")
   */
  applyNeurodivergentProfile(profileName) {
    const sttProfileType = mapNeurodivergentProfile(profileName);
    this.applyProfile(sttProfileType);
  }

  /**
   * Handle profile change from profile manager
   * @param {Object} profile - New profile configuration
   */
  handleProfileChange(profile) {
    // Apply recognition settings
    if (profile.recognition) {
      this.updateSettings({
        continuous: profile.recognition.continuous,
        interimResults: profile.recognition.interimResults,
        maxAlternatives: profile.recognition.maxAlternatives,
        language: profile.recognition.language,
      });

      // Store timing settings for use in recognition
      this.timingSettings = {
        silenceTimeout: profile.recognition.silenceTimeout,
        speechTimeout: profile.recognition.speechTimeout,
        startDelay: profile.recognition.startDelay,
      };
    }

    // Apply command settings
    if (profile.commands && this.commandParser) {
      this.commandParser.updateSettings({
        enabled: profile.commands.enabled,
        mode: profile.commands.mode,
        commandPrefix: profile.commands.commandPrefix,
      });

      // Update punctuation commands setting
      this.settings.punctuationCommands = profile.commands.punctuationCommands;
    }

    // Apply processing settings
    if (profile.processing) {
      this.settings.autoCapitalize = profile.processing.autoCapitalize;
    }

    // Store UI and feedback settings for external components
    this.currentProfileUI = profile.ui;
    this.currentProfileFeedback = profile.feedback;
    this.currentProfileAccessibility = profile.accessibility;

    // Emit profile change event for UI components
    if (this.onProfileChange) {
      this.onProfileChange(profile);
    }

    console.log('[STT] Profile applied:', profile.name);
  }

  /**
   * Get current profile
   * @returns {Object} Current profile configuration
   */
  getCurrentProfile() {
    return this.profileManager ? this.profileManager.getProfile() : null;
  }

  /**
   * Get current profile type
   * @returns {string} Current profile type
   */
  getCurrentProfileType() {
    return this.profileManager ? this.profileManager.getProfileType() : STTProfileType.DEFAULT;
  }

  /**
   * Get all available profiles
   * @returns {Array} List of profile info objects
   */
  getAvailableProfiles() {
    if (!this.profileManager) {
      this.profileManager = new STTProfileManager({
        onProfileChange: profile => this.handleProfileChange(profile),
      });
    }
    return this.profileManager.getProfileList();
  }

  /**
   * Cycle to next profile (for keyboard shortcut)
   * @returns {Object} New active profile
   */
  cycleProfile() {
    if (!this.profileManager) {
      this.profileManager = new STTProfileManager({
        onProfileChange: profile => this.handleProfileChange(profile),
      });
    }
    return this.profileManager.cycleProfile();
  }

  /**
   * Setup keyboard shortcut for profile quick-switch
   */
  setupProfileShortcut() {
    if (!this.profileManager) {
      this.profileManager = new STTProfileManager({
        onProfileChange: profile => this.handleProfileChange(profile),
      });
    }
    this.profileManager.setupKeyboardShortcut();
  }

  /**
   * Get UI styles for current profile
   * @returns {Object} UI configuration
   */
  getProfileUI() {
    return this.currentProfileUI || null;
  }

  /**
   * Get feedback settings for current profile
   * @returns {Object} Feedback configuration
   */
  getProfileFeedback() {
    return this.currentProfileFeedback || null;
  }

  /**
   * Get available voice commands
   * @returns {Array} List of available commands by category
   */
  getAvailableCommands() {
    return this.commandParser ? this.commandParser.getAvailableCommands() : [];
  }

  /**
   * Get current status
   * @returns {Object} - Status object
   */
  getStatus() {
    return {
      isRecording: this.isRecording,
      isPaused: this.isPaused,
      hasTarget: this.targetElement !== null,
      language: this.settings.language,
      continuous: this.settings.continuous,
    };
  }

  /**
   * Cleanup and destroy controller
   */
  destroy() {
    // Listeners hear one end, now: the recogniser's own end event would arrive after they are gone.
    const wasActive = this.isRecording || this.isStarting;
    const listeners = this.stateListeners;
    this.stateListeners = new Set();

    if (this.recognition) {
      if (this.isRecording) {
        this.recognition.stop();
      }
      this.recognition = null;
    }

    // Cleanup command parser
    if (this.commandParser) {
      this.commandParser.destroy();
    }

    // Cleanup vocabulary manager
    if (this.vocabularyManager) {
      this.vocabularyManager.destroy();
      this.vocabularyManager = null;
    }

    // Cleanup auto-punctuation
    if (this.autoPunctuator) {
      this.autoPunctuator.destroy();
      this.autoPunctuator = null;
    }

    // Cleanup confidence feedback
    if (this.confidenceFeedback) {
      this.confidenceFeedback.destroy();
      this.confidenceFeedback = null;
    }

    this.isRecording = false;
    this.isStarting = false;
    this.isPaused = false;
    this.targetElement = null;
    this.lastTranscript = '';
    this.lastDictation = '';
    this.interimTranscript = '';
    this.finalTranscript = '';

    if (wasActive) {
      this.emitState({ type: 'end' }, listeners);
    }
    console.log('[STT] Controller destroyed');
  }

  /**
   * Initialize vocabulary manager
   * @param {Object} options - Vocabulary options
   */
  async initializeVocabulary(options = {}) {
    try {
      this.vocabularyManager = new VocabularyManager({
        autoLearnEnabled: options.autoLearnEnabled !== false,
        autoLearnThreshold: options.autoLearnThreshold || 3,
        enabledCategories: options.enabledCategories || [VocabularyPresets.CUSTOM],
        onWordAdded: entry => {
          debugLog(`[STT] Vocabulary word added: ${entry.word}`);
        },
        onWordRemoved: entry => {
          debugLog(`[STT] Vocabulary word removed: ${entry.word}`);
        },
        onError: error => {
          console.error('[STT] Vocabulary error:', error);
        },
      });

      await this.vocabularyManager.initialize();
      console.log('[STT] Vocabulary manager initialized');
    } catch (error) {
      console.error('[STT] Failed to initialize vocabulary manager:', error);
    }
  }

  /**
   * Load a vocabulary preset
   * @param {string} preset - Preset name (medical, legal, academic, stem)
   * @returns {Promise<number>} - Number of words added
   */
  async loadVocabularyPreset(preset) {
    if (!this.vocabularyManager) {
      console.warn('[STT] Vocabulary manager not initialized');
      return 0;
    }
    return this.vocabularyManager.loadPreset(preset);
  }

  /**
   * Unload a vocabulary preset
   * @param {string} preset - Preset name
   */
  async unloadVocabularyPreset(preset) {
    if (!this.vocabularyManager) {
      return;
    }
    return this.vocabularyManager.unloadPreset(preset);
  }

  /**
   * Add a custom word to vocabulary
   * @param {string} word - Word or phrase
   * @param {string} phonetic - Optional phonetic hint
   * @returns {Promise<number>} - Entry ID
   */
  async addVocabularyWord(word, phonetic = '') {
    if (!this.vocabularyManager) {
      console.warn('[STT] Vocabulary manager not initialized');
      return null;
    }
    return this.vocabularyManager.addWord(word, { phonetic });
  }

  /**
   * Delete a word from vocabulary
   * @param {string} word - Word to delete
   */
  async deleteVocabularyWord(word) {
    if (!this.vocabularyManager) {
      return false;
    }

    const entries = await this.vocabularyManager.search(word);
    const exactMatch = entries.find(e => e.word.toLowerCase() === word.toLowerCase());
    if (exactMatch) {
      return this.vocabularyManager.deleteWord(exactMatch.id);
    }
    return false;
  }

  /**
   * Clear all custom vocabulary
   */
  async clearVocabulary() {
    if (!this.vocabularyManager) {
      return;
    }
    return this.vocabularyManager.clear(VocabularyPresets.CUSTOM);
  }

  /**
   * Import vocabulary from file content
   * @param {Array<{word: string, phonetic?: string}>} words
   */
  async importVocabulary(words) {
    if (!this.vocabularyManager) {
      return { added: 0, skipped: 0 };
    }
    return this.vocabularyManager.addWords(words, VocabularyPresets.CUSTOM);
  }

  /**
   * Get vocabulary statistics
   * @returns {Promise<Object>}
   */
  async getVocabularyStats() {
    if (!this.vocabularyManager) {
      return { customCount: 0, presetCount: 0 };
    }

    const stats = await this.vocabularyManager.getStats();
    return {
      customCount: stats.byCategory?.[VocabularyPresets.CUSTOM] || 0,
      presetCount:
        (stats.byCategory?.[VocabularyPresets.MEDICAL] || 0) +
        (stats.byCategory?.[VocabularyPresets.LEGAL] || 0) +
        (stats.byCategory?.[VocabularyPresets.ACADEMIC] || 0) +
        (stats.byCategory?.[VocabularyPresets.STEM] || 0),
      totalWords: stats.totalWords,
      autoLearnedCount: stats.autoLearnedCount,
    };
  }

  /**
   * Update vocabulary settings
   * @param {Object} settings
   */
  async updateVocabularySettings(settings) {
    if (!this.vocabularyManager) {
      return;
    }
    return this.vocabularyManager.updateSettings(settings);
  }

  /**
   * Track a correction for auto-learning
   * @param {string} original - Original recognized text
   * @param {string} corrected - User's correction
   */
  trackVocabularyCorrection(original, corrected) {
    if (this.vocabularyManager) {
      this.vocabularyManager.trackCorrection(original, corrected);
    }
  }

  /**
   * Initialize auto-punctuation engine
   * @param {Object} options - Auto-punctuation options
   */
  initializeAutoPunctuation(options = {}) {
    try {
      this.autoPunctuator = new AutoPunctuator({
        enabled: this.settings.autoPunctuation,
        mode: this.settings.autoPunctuationMode,
        ...options,
        onPunctuationAdded: result => {
          console.log(
            `[STT] Auto-punctuation: ${result.type} (confidence: ${result.confidence.toFixed(2)})`
          );
        },
      });
      console.log('[STT] Auto-punctuation engine initialized');
    } catch (error) {
      console.error('[STT] Failed to initialize auto-punctuation:', error);
    }
  }

  /**
   * Enable/disable auto-punctuation
   * @param {boolean} enabled
   */
  setAutoPunctuationEnabled(enabled) {
    this.settings.autoPunctuation = enabled;
    if (this.autoPunctuator) {
      this.autoPunctuator.setEnabled(enabled);
    } else if (enabled) {
      this.initializeAutoPunctuation();
    }
  }

  /**
   * Set auto-punctuation mode
   * @param {string} mode - 'auto', 'assisted', or 'manual'
   */
  setAutoPunctuationMode(mode) {
    this.settings.autoPunctuationMode = mode;
    if (this.autoPunctuator) {
      this.autoPunctuator.setMode(mode);
    }
  }

  /**
   * Get auto-punctuation mode
   * @returns {string} Current mode
   */
  getAutoPunctuationMode() {
    return this.autoPunctuator ? this.autoPunctuator.getMode() : this.settings.autoPunctuationMode;
  }

  /**
   * Check if auto-punctuation is enabled
   * @returns {boolean}
   */
  isAutoPunctuationEnabled() {
    return this.autoPunctuator ? this.autoPunctuator.isEnabled() : false;
  }

  /**
   * Update auto-punctuation configuration
   * @param {Object} config - Configuration options
   */
  updateAutoPunctuationConfig(config) {
    if (this.autoPunctuator) {
      this.autoPunctuator.updateConfig(config);
    }
  }

  /**
   * Get auto-punctuation statistics
   * @returns {Object} Statistics
   */
  getAutoPunctuationStats() {
    return this.autoPunctuator
      ? this.autoPunctuator.getStats()
      : {
          periodsAdded: 0,
          commasAdded: 0,
          questionsAdded: 0,
          exclamationsAdded: 0,
          capitalizations: 0,
        };
  }

  /**
   * Reset auto-punctuation state (e.g., when starting new dictation)
   */
  resetAutoPunctuation() {
    if (this.autoPunctuator) {
      this.autoPunctuator.reset();
    }
    this.lastResultTimestamp = 0;
  }

  /**
   * Get auto-punctuation configuration
   * @returns {Object} Current configuration
   */
  getAutoPunctuationConfig() {
    return this.autoPunctuator ? this.autoPunctuator.getConfig() : AUTO_PUNCT_CONFIG;
  }

  /**
   * Initialize confidence feedback engine
   * @param {Object} options - Confidence feedback options
   */
  initializeConfidenceFeedback(options = {}) {
    try {
      this.confidenceFeedback = new ConfidenceFeedback({
        enabled: this.settings.confidenceFeedback,
        minThreshold: this.settings.confidenceThreshold,
        highlightLowConfidence: this.settings.highlightLowConfidence,
        showAlternatives: this.settings.showAlternatives,
        maxAlternatives: this.settings.maxAlternatives,
        ...options,
        onConfidenceUpdate: result => {
          console.log(`[STT] Confidence: ${result.getPercentage()}% (${result.getLevel()})`);
          this.onConfidenceUpdate(result);
        },
        onLowConfidence: result => {
          console.log(`[STT] Low confidence warning (${result.getPercentage()}%)`);
          debugLog('[STT] Low confidence transcript:', result.transcript);
          this.onLowConfidence(result);
        },
        onStatsUpdate: stats => {
          this.onStatsUpdate(stats);
        },
      });
      console.log('[STT] Confidence feedback engine initialized');
    } catch (error) {
      console.error('[STT] Failed to initialize confidence feedback:', error);
    }
  }

  /**
   * Enable/disable confidence feedback
   * @param {boolean} enabled
   */
  setConfidenceFeedbackEnabled(enabled) {
    this.settings.confidenceFeedback = enabled;
    if (this.confidenceFeedback) {
      this.confidenceFeedback.setEnabled(enabled);
    } else if (enabled) {
      this.initializeConfidenceFeedback();
    }
  }

  /**
   * Check if confidence feedback is enabled
   * @returns {boolean}
   */
  isConfidenceFeedbackEnabled() {
    return this.confidenceFeedback ? this.confidenceFeedback.isEnabled() : false;
  }

  /**
   * Set minimum confidence threshold
   * @param {number} threshold - Threshold (0-1)
   */
  setConfidenceThreshold(threshold) {
    this.settings.confidenceThreshold = threshold;
    if (this.confidenceFeedback) {
      this.confidenceFeedback.setMinThreshold(threshold);
    }
  }

  /**
   * Get minimum confidence threshold
   * @returns {number}
   */
  getConfidenceThreshold() {
    return this.confidenceFeedback
      ? this.confidenceFeedback.getMinThreshold()
      : this.settings.confidenceThreshold;
  }

  /**
   * Update confidence feedback configuration
   * @param {Object} config - Configuration options
   */
  updateConfidenceFeedbackConfig(config) {
    if (config.enabled !== undefined) {
      this.settings.confidenceFeedback = config.enabled;
    }
    if (config.confidenceThreshold !== undefined) {
      this.settings.confidenceThreshold = config.confidenceThreshold;
    }
    if (config.highlightLowConfidence !== undefined) {
      this.settings.highlightLowConfidence = config.highlightLowConfidence;
    }
    if (config.showAlternatives !== undefined) {
      this.settings.showAlternatives = config.showAlternatives;
    }

    if (this.confidenceFeedback) {
      this.confidenceFeedback.updateConfig({
        enabled: this.settings.confidenceFeedback,
        minThreshold: this.settings.confidenceThreshold,
        highlightLowConfidence: this.settings.highlightLowConfidence,
        showAlternatives: this.settings.showAlternatives,
      });
    }
  }

  /**
   * Get confidence feedback statistics
   * @returns {Object} Statistics
   */
  getConfidenceStats() {
    return this.confidenceFeedback
      ? this.confidenceFeedback.getStats()
      : {
          duration: 0,
          totalWords: 0,
          totalResults: 0,
          wordsPerMinute: 0,
          averageConfidence: 0,
          acceptanceRate: 0,
          correctionRate: 0,
          confidenceDistribution: { high: 0, medium: 0, low: 0 },
        };
  }

  /**
   * Reset confidence feedback session
   */
  resetConfidenceSession() {
    if (this.confidenceFeedback) {
      this.confidenceFeedback.resetSession();
    }
  }

  /**
   * Mark a result as corrected (for accuracy tracking)
   * @param {string} resultId - Result ID
   * @param {string} correctedText - Corrected text
   */
  markResultCorrected(resultId, correctedText) {
    if (this.confidenceFeedback) {
      this.confidenceFeedback.markCorrected(resultId, correctedText);
    }
  }

  /**
   * Show stats panel
   */
  showConfidenceStatsPanel() {
    if (this.confidenceFeedback) {
      this.confidenceFeedback.showStatsPanel();
    }
  }

  /**
   * Hide stats panel
   */
  hideConfidenceStatsPanel() {
    if (this.confidenceFeedback) {
      this.confidenceFeedback.hideStatsPanel();
    }
  }

  /**
   * Toggle stats panel visibility
   */
  toggleConfidenceStatsPanel() {
    if (this.confidenceFeedback) {
      this.confidenceFeedback.toggleStatsPanel();
    }
  }

  /**
   * Get confidence feedback configuration
   * @returns {Object} Current configuration
   */
  getConfidenceFeedbackConfig() {
    return this.confidenceFeedback ? this.confidenceFeedback.getConfig() : CONFIDENCE_CONFIG;
  }
}

export default STTController;
export { VocabularyPresets, PunctuationType, ConfidenceLevel };
