/**
 * Floating Microphone Button Component (Sprint 5)
 * Creates a floating microphone button that appears when text fields are focused
 *
 * Features:
 * - Appears on text field focus
 * - Red pulse animation when recording
 * - Tooltip feedback
 * - Keyboard accessible
 * - Responsive positioning
 *
 * @module MicrophoneButton
 */

export class MicrophoneButton {
  constructor(options = {}) {
    this.onStart = options.onStart || (() => {});
    this.onStop = options.onStop || (() => {});
    this.onError = options.onError || (() => {});

    this.button = null;
    this.targetField = null;
    this.isRecording = false;
    this.tooltip = null;

    this.createButton();
    this.injectStyles();
  }

  /**
   * Create the microphone button element
   */
  createButton() {
    this.button = document.createElement('button');
    this.button.className = 'assist-stt-mic-button';
    this.button.type = 'button';
    this.button.setAttribute('aria-label', 'Start voice typing');
    this.button.setAttribute('title', 'Click to speak (Ctrl+Shift+M)');
    this.button.setAttribute('role', 'button');
    this.button.setAttribute('tabindex', '0');

    // Microphone icon (SVG for better control)
    this.button.innerHTML = `
      <svg class="mic-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 14C13.66 14 15 12.66 15 11V5C15 3.34 13.66 2 12 2C10.34 2 9 3.34 9 5V11C9 12.66 10.34 14 12 14Z" fill="white"/>
        <path d="M17 11C17 13.76 14.76 16 12 16C9.24 16 7 13.76 7 11H5C5 14.53 7.61 17.43 11 17.92V21H13V17.92C16.39 17.43 19 14.53 19 11H17Z" fill="white"/>
      </svg>
    `;

    // Click handler
    this.button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggle();
    });

    // Keyboard handler
    this.button.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.toggle();
      }
    });

    // Hover effects
    this.button.addEventListener('mouseenter', () => {
      this.showTooltip();
    });

    this.button.addEventListener('mouseleave', () => {
      this.hideTooltip();
    });

    console.log('[MicButton] Button created');
  }

  /**
   * Inject CSS styles for the button
   */
  injectStyles() {
    // Check if styles already injected
    if (document.getElementById('assist-stt-mic-styles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'assist-stt-mic-styles';
    style.textContent = `
      /* Microphone Button Base Styles */
      .assist-stt-mic-button {
        position: fixed;
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        border: 3px solid white;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        cursor: pointer;
        z-index: 99999;
        transition: all 0.3s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transform: scale(0.8);
        pointer-events: none;
      }

      .assist-stt-mic-button.visible {
        opacity: 1;
        transform: scale(1);
        pointer-events: auto;
      }

      .assist-stt-mic-button:hover {
        transform: scale(1.1);
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
      }

      .assist-stt-mic-button:active {
        transform: scale(0.95);
      }

      .assist-stt-mic-button:focus {
        outline: 3px solid #667eea;
        outline-offset: 2px;
      }

      /* Recording State */
      .assist-stt-mic-button.recording {
        background: linear-gradient(135deg, #ff4444 0%, #cc0000 100%);
        animation: mic-pulse 1.5s infinite;
      }

      @keyframes mic-pulse {
        0%, 100% {
          transform: scale(1);
          box-shadow: 0 4px 12px rgba(255, 68, 68, 0.5);
        }
        50% {
          transform: scale(1.05);
          box-shadow: 0 4px 20px rgba(255, 68, 68, 0.8);
        }
      }

      /* Recording State Hover */
      .assist-stt-mic-button.recording:hover {
        animation: mic-pulse-hover 1.5s infinite;
      }

      @keyframes mic-pulse-hover {
        0%, 100% {
          transform: scale(1.1);
          box-shadow: 0 6px 16px rgba(255, 68, 68, 0.6);
        }
        50% {
          transform: scale(1.15);
          box-shadow: 0 6px 24px rgba(255, 68, 68, 0.9);
        }
      }

      /* Icon Styles */
      .assist-stt-mic-button .mic-icon {
        width: 28px;
        height: 28px;
        transition: transform 0.2s ease;
      }

      .assist-stt-mic-button.recording .mic-icon {
        animation: mic-shake 0.5s ease-in-out infinite;
      }

      @keyframes mic-shake {
        0%, 100% { transform: translateY(0); }
        25% { transform: translateY(-2px); }
        75% { transform: translateY(2px); }
      }

      /* Tooltip */
      .assist-stt-mic-tooltip {
        position: fixed;
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 500;
        white-space: nowrap;
        z-index: 100000;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.2s ease;
      }

      .assist-stt-mic-tooltip.visible {
        opacity: 1;
      }

      /* Interim Results Display */
      .assist-stt-interim-display {
        position: fixed;
        background: rgba(255, 255, 255, 0.98);
        border: 2px solid #667eea;
        border-radius: 8px;
        padding: 12px 16px;
        font-size: 14px;
        color: #333;
        z-index: 99998;
        max-width: 400px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        opacity: 0;
        transform: translateY(10px);
        transition: all 0.3s ease;
        pointer-events: none;
      }

      .assist-stt-interim-display.visible {
        opacity: 1;
        transform: translateY(0);
      }

      .assist-stt-interim-display::before {
        content: '🎤 ';
        font-size: 16px;
      }

      /* Recording Indicator (Top Bar) */
      .assist-stt-recording-bar {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: 4px;
        background: linear-gradient(90deg, #ff4444 0%, #cc0000 100%);
        z-index: 99999;
        opacity: 0;
        transition: opacity 0.3s ease;
      }

      .assist-stt-recording-bar.visible {
        opacity: 1;
        animation: recording-bar-pulse 2s ease-in-out infinite;
      }

      @keyframes recording-bar-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.6; }
      }

      /* Disabled State */
      .assist-stt-mic-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        background: linear-gradient(135deg, #999 0%, #666 100%);
      }

      .assist-stt-mic-button:disabled:hover {
        transform: scale(1);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      }
    `;

    document.head.appendChild(style);
    console.log('[MicButton] Styles injected');
  }

  /**
   * Show the microphone button for a specific text field
   * @param {HTMLElement} field - The target text field
   */
  show(field) {
    if (!field) {
      console.warn('[MicButton] No field provided');
      return;
    }

    this.targetField = field;

    // Position button relative to field
    this.positionButton(field);

    // Add button to DOM if not already there
    if (!this.button.parentElement) {
      document.body.appendChild(this.button);
    }

    // Show with animation
    requestAnimationFrame(() => {
      this.button.classList.add('visible');
    });

    console.log('[MicButton] Shown for field:', field.tagName);
  }

  /**
   * Hide the microphone button
   */
  hide() {
    this.button.classList.remove('visible');
    this.hideTooltip();
    this.hideInterimDisplay();

    // Remove from DOM after animation
    setTimeout(() => {
      if (this.button.parentElement && !this.isRecording) {
        this.button.parentElement.removeChild(this.button);
      }
    }, 300);

    this.targetField = null;
    console.log('[MicButton] Hidden');
  }

  /**
   * Position button relative to target field
   * @param {HTMLElement} field - The target text field
   */
  positionButton(field) {
    const rect = field.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    // Position to the right and slightly below the field
    const left = rect.right + scrollX - 70; // 70px from right edge
    const top = rect.bottom + scrollY + 10;  // 10px below field

    this.button.style.left = `${left}px`;
    this.button.style.top = `${top}px`;
  }

  /**
   * Toggle recording state
   */
  toggle() {
    if (this.isRecording) {
      this.stopRecording();
    } else {
      this.startRecording();
    }
  }

  /**
   * Start recording
   */
  startRecording() {
    if (!this.targetField) {
      console.error('[MicButton] No target field set');
      return;
    }

    this.isRecording = true;
    this.button.classList.add('recording');
    this.button.setAttribute('aria-label', 'Stop voice typing');
    this.button.setAttribute('title', 'Recording... Click to stop');

    this.showRecordingIndicator();
    this.onStart(this.targetField);

    console.log('[MicButton] Recording started');
  }

  /**
   * Stop recording
   */
  stopRecording() {
    this.isRecording = false;
    this.button.classList.remove('recording');
    this.button.setAttribute('aria-label', 'Start voice typing');
    this.button.setAttribute('title', 'Click to speak (Ctrl+Shift+M)');

    this.hideRecordingIndicator();
    this.hideInterimDisplay();
    this.onStop();

    console.log('[MicButton] Recording stopped');
  }

  /**
   * Show recording indicator (top bar)
   */
  showRecordingIndicator() {
    let bar = document.getElementById('assist-stt-recording-bar');

    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'assist-stt-recording-bar';
      bar.className = 'assist-stt-recording-bar';
      document.body.appendChild(bar);
    }

    requestAnimationFrame(() => {
      bar.classList.add('visible');
    });
  }

  /**
   * Hide recording indicator
   */
  hideRecordingIndicator() {
    const bar = document.getElementById('assist-stt-recording-bar');
    if (bar) {
      bar.classList.remove('visible');
      setTimeout(() => {
        if (bar.parentElement) {
          bar.parentElement.removeChild(bar);
        }
      }, 300);
    }
  }

  /**
   * Show interim transcription results
   * @param {string} text - Interim transcript text
   */
  showInterimResult(text) {
    if (!text) {
      this.hideInterimDisplay();
      return;
    }

    let display = document.getElementById('assist-stt-interim-display');

    if (!display) {
      display = document.createElement('div');
      display.id = 'assist-stt-interim-display';
      display.className = 'assist-stt-interim-display';
      document.body.appendChild(display);
    }

    display.textContent = text;

    // Position above the button
    const buttonRect = this.button.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    display.style.left = `${buttonRect.left + scrollX}px`;
    display.style.bottom = `${window.innerHeight - buttonRect.top - scrollY + 10}px`;

    requestAnimationFrame(() => {
      display.classList.add('visible');
    });
  }

  /**
   * Hide interim display
   */
  hideInterimDisplay() {
    const display = document.getElementById('assist-stt-interim-display');
    if (display) {
      display.classList.remove('visible');
      setTimeout(() => {
        if (display.parentElement) {
          display.parentElement.removeChild(display);
        }
      }, 300);
    }
  }

  /**
   * Show tooltip
   */
  showTooltip() {
    if (!this.tooltip) {
      this.tooltip = document.createElement('div');
      this.tooltip.className = 'assist-stt-mic-tooltip';
      document.body.appendChild(this.tooltip);
    }

    this.tooltip.textContent = this.isRecording
      ? 'Click to stop recording'
      : 'Click to start voice typing';

    // Position above button
    const buttonRect = this.button.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    this.tooltip.style.left = `${buttonRect.left + scrollX + buttonRect.width / 2}px`;
    this.tooltip.style.bottom = `${window.innerHeight - buttonRect.top - scrollY + 10}px`;
    this.tooltip.style.transform = 'translateX(-50%)';

    requestAnimationFrame(() => {
      this.tooltip.classList.add('visible');
    });
  }

  /**
   * Hide tooltip
   */
  hideTooltip() {
    if (this.tooltip) {
      this.tooltip.classList.remove('visible');
    }
  }

  /**
   * Update button state
   * @param {Object} state - State object { isRecording, error }
   */
  updateState(state) {
    if (state.isRecording !== undefined) {
      if (state.isRecording && !this.isRecording) {
        this.startRecording();
      } else if (!state.isRecording && this.isRecording) {
        this.stopRecording();
      }
    }

    if (state.error) {
      this.showError(state.error);
    }
  }

  /**
   * Show error state
   * @param {string} message - Error message
   */
  showError(message) {
    console.error('[MicButton] Error:', message);

    // Briefly flash button red
    this.button.style.background = 'linear-gradient(135deg, #ff0000 0%, #990000 100%)';

    setTimeout(() => {
      this.button.style.background = '';
    }, 300);

    this.onError(message);
  }

  /**
   * Cleanup and destroy button
   */
  destroy() {
    if (this.isRecording) {
      this.stopRecording();
    }

    this.hideTooltip();
    this.hideInterimDisplay();
    this.hideRecordingIndicator();

    if (this.button.parentElement) {
      this.button.parentElement.removeChild(this.button);
    }

    if (this.tooltip && this.tooltip.parentElement) {
      this.tooltip.parentElement.removeChild(this.tooltip);
    }

    const style = document.getElementById('assist-stt-mic-styles');
    if (style && style.parentElement) {
      style.parentElement.removeChild(style);
    }

    this.button = null;
    this.tooltip = null;
    this.targetField = null;

    console.log('[MicButton] Destroyed');
  }
}

export default MicrophoneButton;
