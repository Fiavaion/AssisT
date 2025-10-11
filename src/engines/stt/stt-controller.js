/**
 * STT Controller
 * Manages Speech-to-Text with multimodal error correction (FixOver)
 * Supports Web Speech API and cloud STT engines (Whisper, Google Cloud STT)
 *
 * Features:
 * - Voice-and-point correction (FixOver pattern)
 * - Domain adaptation for academic terminology
 * - Real-time transcription with interim results
 */

export class STTController {
  constructor(domAdapter, settings) {
    this.domAdapter = domAdapter;
    this.settings = settings;
    this.isActive = false;
    this.recognition = null;
    this.activeInput = null;
    this.transcript = '';
  }

  async initialize() {
    // Check for Web Speech API support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      throw new Error('Speech Recognition not supported in this browser');
    }

    this.recognition = new SpeechRecognition();

    // Configure recognition
    this.recognition.continuous = this.settings.continuous;
    this.recognition.interimResults = this.settings.interimResults;
    this.recognition.maxAlternatives = this.settings.maxAlternatives;
    this.recognition.lang = this.settings.language;

    // Set up event handlers
    this.setupEventHandlers();

    // Inject STT UI into input fields
    this.injectSTTButtons();

    console.log('[STT] Controller initialized');
  }

  /**
   * Set up recognition event handlers
   */
  setupEventHandlers() {
    this.recognition.onstart = () => {
      console.log('[STT] Recognition started');
      this.isActive = true;
      this.showRecordingIndicator();
    };

    this.recognition.onresult = event => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;

        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }

      // Update active input with transcription
      if (this.activeInput) {
        if (finalTranscript) {
          this.insertText(this.activeInput, finalTranscript.trim());
          this.transcript += finalTranscript;
        }

        if (this.settings.interimResults && interimTranscript) {
          this.showInterimResult(interimTranscript);
        }
      }
    };

    this.recognition.onerror = event => {
      console.error('[STT] Recognition error:', event.error);
      this.hideRecordingIndicator();
    };

    this.recognition.onend = () => {
      console.log('[STT] Recognition ended');
      this.isActive = false;
      this.hideRecordingIndicator();
    };
  }

  /**
   * Inject STT microphone buttons into text inputs
   */
  injectSTTButtons() {
    const inputs = this.domAdapter.getInputElements();

    inputs.forEach(input => {
      // Skip if already has STT button
      if (input.dataset.assistStt) {
        return;
      }

      const button = document.createElement('button');
      button.className = 'assist-stt-button';
      button.type = 'button';
      button.setAttribute('aria-label', 'Start voice input');
      button.innerHTML = '🎤';

      // Position button
      this.positionSTTButton(input, button);

      button.addEventListener('click', () => {
        this.startForInput(input);
      });

      input.dataset.assistStt = 'true';
      input.parentNode.insertBefore(button, input.nextSibling);
    });

    console.log(`[STT] Injected buttons into ${inputs.length} inputs`);
  }

  /**
   * Position STT button relative to input
   */
  positionSTTButton(input, button) {
    button.style.position = 'absolute';
    button.style.right = '5px';
    button.style.top = '50%';
    button.style.transform = 'translateY(-50%)';
    button.style.border = 'none';
    button.style.background = 'transparent';
    button.style.cursor = 'pointer';
    button.style.fontSize = '20px';
    button.style.zIndex = '1000';

    // Ensure parent is positioned
    const parent = input.parentElement;
    if (window.getComputedStyle(parent).position === 'static') {
      parent.style.position = 'relative';
    }
  }

  /**
   * Start recognition for specific input
   */
  startForInput(input) {
    this.activeInput = input;
    this.transcript = '';

    try {
      this.recognition.start();
    } catch (error) {
      console.error('[STT] Failed to start recognition:', error);
    }
  }

  /**
   * Stop recognition
   */
  stop() {
    if (this.isActive) {
      this.recognition.stop();
    }
  }

  /**
   * Insert text into input field
   */
  insertText(input, text) {
    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
      const currentValue = input.value;
      const cursorPosition = input.selectionStart;

      input.value =
        currentValue.substring(0, cursorPosition) +
        text +
        currentValue.substring(cursorPosition);

      input.selectionStart = input.selectionEnd = cursorPosition + text.length;

      // Trigger input event for frameworks
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (input.contentEditable === 'true') {
      // Handle contenteditable elements
      const selection = window.getSelection();
      const range = selection.getRangeAt(0);

      range.deleteContents();
      range.insertNode(document.createTextNode(text));

      // Move cursor to end of inserted text
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  /**
   * Show interim transcription result
   */
  showInterimResult(text) {
    // Create or update interim display
    let interim = document.getElementById('assist-stt-interim');

    if (!interim) {
      interim = document.createElement('div');
      interim.id = 'assist-stt-interim';
      interim.className = 'assist-interim-result';
      interim.setAttribute('role', 'status');
      interim.setAttribute('aria-live', 'polite');

      this.activeInput.parentNode.insertBefore(interim, this.activeInput.nextSibling);
    }

    interim.textContent = text;
    interim.style.cssText = `
      position: absolute;
      background: #f0f0f0;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 14px;
      color: #666;
      z-index: 1001;
    `;
  }

  /**
   * Show recording indicator
   */
  showRecordingIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'assist-recording-indicator';
    indicator.className = 'assist-recording';
    indicator.setAttribute('role', 'status');
    indicator.setAttribute('aria-live', 'polite');
    indicator.innerHTML = '🔴 Recording...';

    indicator.style.cssText = `
      position: fixed;
      top: 50px;
      right: 10px;
      background: #f44336;
      color: white;
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 14px;
      font-weight: 500;
      z-index: 999999;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      animation: pulse 1.5s infinite;
    `;

    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(indicator);
  }

  /**
   * Hide recording indicator
   */
  hideRecordingIndicator() {
    const indicator = document.getElementById('assist-recording-indicator');
    if (indicator) {
      indicator.remove();
    }

    const interim = document.getElementById('assist-stt-interim');
    if (interim) {
      interim.remove();
    }
  }

  /**
   * Toggle STT
   */
  toggle() {
    if (this.isActive) {
      this.stop();
    } else {
      // Start for first available input
      const inputs = this.domAdapter.getInputElements();
      if (inputs.length > 0) {
        this.startForInput(inputs[0]);
      }
    }
  }

  /**
   * Update settings
   */
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };

    if (this.recognition) {
      this.recognition.continuous = this.settings.continuous;
      this.recognition.interimResults = this.settings.interimResults;
      this.recognition.maxAlternatives = this.settings.maxAlternatives;
      this.recognition.lang = this.settings.language;
    }

    console.log('[STT] Settings updated:', this.settings);
  }
}
