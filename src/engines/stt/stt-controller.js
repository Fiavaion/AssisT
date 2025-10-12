/**
 * Speech-to-Text Controller (Sprint 5)
 * Handles voice recognition using Web Speech API
 *
 * Features:
 * - Real-time speech recognition
 * - Continuous listening mode
 * - Punctuation voice commands
 * - Auto-capitalization
 * - Text insertion into input fields
 *
 * @module STTController
 */

export class STTController {
  constructor(options = {}) {
    this.settings = {
      continuous: options.continuous !== undefined ? options.continuous : true,
      interimResults: options.interimResults !== undefined ? options.interimResults : true,
      language: options.language || 'en-US',
      autoCapitalize: options.autoCapitalize !== undefined ? options.autoCapitalize : true,
      punctuationCommands: options.punctuationCommands !== undefined ? options.punctuationCommands : true,
      maxAlternatives: options.maxAlternatives || 1
    };

    this.recognition = null;
    this.isRecording = false;
    this.isPaused = false;
    this.targetElement = null;
    this.lastTranscript = '';
    this.interimTranscript = '';
    this.finalTranscript = '';

    // Callbacks
    this.onStart = options.onStart || (() => {});
    this.onEnd = options.onEnd || (() => {});
    this.onResult = options.onResult || (() => {});
    this.onError = options.onError || (() => {});
    this.onInterimResult = options.onInterimResult || (() => {});

    // Punctuation command mappings
    this.punctuationCommands = {
      'period': '.',
      'comma': ',',
      'question mark': '?',
      'exclamation point': '!',
      'exclamation mark': '!',
      'new line': '\n',
      'new paragraph': '\n\n',
      'colon': ':',
      'semicolon': ';',
      'quote': '"',
      'end quote': '"',
      'apostrophe': "'",
      'dash': '-',
      'hyphen': '-',
      'open parenthesis': '(',
      'close parenthesis': ')',
      'open bracket': '[',
      'close bracket': ']'
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
      this.onError(new Error('Speech recognition not supported'));
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
      this.recognition.onresult = (event) => this.handleResult(event);
      this.recognition.onerror = (event) => this.handleError(event);
      this.recognition.onnomatch = () => this.handleNoMatch();
      this.recognition.onaudiostart = () => console.log('[STT] Audio capture started');
      this.recognition.onaudioend = () => console.log('[STT] Audio capture ended');
      this.recognition.onspeechstart = () => console.log('[STT] Speech detected');
      this.recognition.onspeechend = () => console.log('[STT] Speech ended');

      console.log('[STT] Controller initialized successfully');
      return true;
    } catch (error) {
      console.error('[STT] Initialization failed:', error);
      this.onError(error);
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

    this.targetElement = targetElement;
    this.lastTranscript = '';
    this.interimTranscript = '';
    this.finalTranscript = '';

    try {
      this.recognition.start();
      console.log('[STT] Started listening');
      return true;
    } catch (error) {
      console.error('[STT] Failed to start recognition:', error);
      this.onError(error);
      return false;
    }
  }

  /**
   * Stop listening
   */
  stopListening() {
    if (!this.recognition || !this.isRecording) {
      return false;
    }

    try {
      this.recognition.stop();
      console.log('[STT] Stopped listening');
      return true;
    } catch (error) {
      console.error('[STT] Failed to stop recognition:', error);
      return false;
    }
  }

  /**
   * Pause listening (for continuous mode)
   */
  pauseListening() {
    if (!this.recognition || !this.isRecording) {
      return false;
    }

    this.isPaused = true;
    this.recognition.stop();
    console.log('[STT] Paused listening');
    return true;
  }

  /**
   * Resume listening (for continuous mode)
   */
  resumeListening() {
    if (!this.recognition || !this.isPaused) {
      return false;
    }

    this.isPaused = false;
    try {
      this.recognition.start();
      console.log('[STT] Resumed listening');
      return true;
    } catch (error) {
      console.error('[STT] Failed to resume recognition:', error);
      return false;
    }
  }

  /**
   * Handle recognition start event
   */
  handleStart() {
    this.isRecording = true;
    this.isPaused = false;
    console.log('[STT] Recognition started');
    this.onStart();
  }

  /**
   * Handle recognition end event
   */
  handleEnd() {
    console.log('[STT] Recognition ended');

    // If continuous mode and not manually paused, restart
    if (this.settings.continuous && this.isRecording && !this.isPaused) {
      console.log('[STT] Restarting continuous recognition');
      try {
        this.recognition.start();
      } catch (error) {
        console.error('[STT] Failed to restart continuous recognition:', error);
        this.isRecording = false;
        this.onEnd();
      }
    } else {
      this.isRecording = false;
      this.onEnd();
    }
  }

  /**
   * Handle recognition result
   * @param {SpeechRecognitionEvent} event
   */
  handleResult(event) {
    let interimTranscript = '';
    let finalTranscript = '';

    // Process all results
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      const confidence = event.results[i][0].confidence;

      if (event.results[i].isFinal) {
        finalTranscript += transcript;
        console.log(`[STT] Final transcript: "${transcript}" (confidence: ${confidence})`);
      } else {
        interimTranscript += transcript;
        console.log(`[STT] Interim transcript: "${transcript}"`);
      }
    }

    // Update interim results
    if (interimTranscript) {
      this.interimTranscript = interimTranscript;
      this.onInterimResult(interimTranscript);
    }

    // Process final results
    if (finalTranscript) {
      let processedText = finalTranscript;

      // Process punctuation commands if enabled
      if (this.settings.punctuationCommands) {
        processedText = this.processPunctuationCommands(processedText);
      }

      // Auto-capitalize if enabled
      if (this.settings.autoCapitalize) {
        processedText = this.capitalizeFirstWord(processedText);
      }

      // Insert text into target element
      if (this.targetElement) {
        this.insertText(this.targetElement, processedText);
      }

      this.finalTranscript += processedText;
      this.lastTranscript = processedText;
      this.onResult(processedText, this.finalTranscript);
    }
  }

  /**
   * Handle recognition error
   * @param {SpeechRecognitionError} event
   */
  handleError(event) {
    console.error('[STT] Recognition error:', event.error, event.message);

    const errorMessages = {
      'no-speech': 'No speech detected. Please try again.',
      'audio-capture': 'No microphone detected. Please check your audio input.',
      'not-allowed': 'Microphone permission denied. Please allow microphone access.',
      'network': 'Network error. Please check your internet connection.',
      'aborted': 'Speech recognition aborted.',
      'bad-grammar': 'Speech recognition grammar error.',
      'language-not-supported': `Language "${this.settings.language}" is not supported.`
    };

    const userMessage = errorMessages[event.error] || `Speech recognition error: ${event.error}`;

    this.isRecording = false;
    this.onError(new Error(userMessage), event.error);
  }

  /**
   * Handle no match (speech not recognized)
   */
  handleNoMatch() {
    console.warn('[STT] No speech recognized');
    this.onError(new Error('Speech not recognized. Please try again.'), 'no-match');
  }

  /**
   * Process punctuation commands in transcript
   * @param {string} text - The transcript text
   * @returns {string} - Processed text with punctuation
   */
  processPunctuationCommands(text) {
    let processed = text;

    // Convert to lowercase for command matching
    const lowerText = text.toLowerCase();

    // Check each punctuation command
    for (const [command, punctuation] of Object.entries(this.punctuationCommands)) {
      const regex = new RegExp(`\\s*${command}\\s*`, 'gi');

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
    if (!text || text.length === 0) return text;

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
    const shouldAddSpace = element.value && element.value.trim().length > 0 && !element.value.endsWith(' ');
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
      // ContentEditable element
      const selection = window.getSelection();

      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();

        const textNode = document.createTextNode(textToInsert);
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

    console.log(`[STT] Inserted text: "${text}"`);
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

    console.log('[STT] Settings updated:', this.settings);
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
      continuous: this.settings.continuous
    };
  }

  /**
   * Cleanup and destroy controller
   */
  destroy() {
    if (this.recognition) {
      if (this.isRecording) {
        this.recognition.stop();
      }
      this.recognition = null;
    }

    this.isRecording = false;
    this.isPaused = false;
    this.targetElement = null;
    this.lastTranscript = '';
    this.interimTranscript = '';
    this.finalTranscript = '';

    console.log('[STT] Controller destroyed');
  }
}

export default STTController;
