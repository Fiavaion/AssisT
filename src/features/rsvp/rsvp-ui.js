/**
 * RSVP UI Module
 *
 * Renders the RSVP overlay with ORP-aligned word display, controls, and progress indicators.
 *
 * Design based on spec requirements:
 * - Dark theme (#121212 background) to reduce eye strain
 * - Monospace font for stable ORP positioning
 * - 32px font size with ORP character highlighted in red (#ff6b6b)
 * - Fixed ORP position at 40% from left edge
 * - Progress bar, percentage, and time remaining
 * - Keyboard shortcuts: Space (play/pause), ↑↓ (speed), ←→ (navigate), Esc (close)
 *
 * @module features/rsvp/rsvp-ui
 */

import { attachInteractiveHandler } from '../../utils/event-handlers.js';
import { Z } from '../../utils/z-index.js';

/**
 * RSVP UI Class
 * Manages the overlay rendering and user interactions
 */
export class RSVPUI {
  constructor() {
    this.overlay = null;
    this.wordDisplay = null;
    this.progressBar = null;
    this.progressText = null;
    this.timeText = null;
    this.speedText = null;
    this.playPauseBtn = null;
    this.onClose = null;
    this.onPlayPause = null;
    this.onSpeedChange = null;
    this.onNavigate = null;
  }

  /**
   * Create and show the RSVP overlay
   */
  show() {
    if (this.overlay) {
      return;
    } // Already visible

    this.overlay = document.createElement('div');
    this.overlay.id = 'assist-rsvp-overlay';

    // NOTE: No sanitization needed - this is our own trusted HTML, not user input
    this.overlay.innerHTML = `
      <style>
        #assist-rsvp-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.9);
          z-index: ${Z.MODAL};
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
        }

        .rsvp-container {
          background: #121212;
          border-radius: 8px;
          padding: 32px 48px;
          min-width: 500px;
          max-width: 800px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.6);
        }

        .rsvp-word-container {
          min-height: 80px;
          display: flex;
          align-items: center;
          justify-content: flex-start;
          padding-left: 40%;
          margin-bottom: 24px;
          position: relative;
        }

        .rsvp-word-container::before {
          content: '';
          position: absolute;
          left: 40%;
          top: 0;
          bottom: 0;
          width: 2px;
          background: rgba(255, 107, 107, 0.3);
        }

        .rsvp-word {
          font-size: 32px;
          font-weight: 500;
          letter-spacing: 1px;
          white-space: nowrap;
          display: flex;
        }

        .word-before,
        .word-after {
          color: rgba(255, 255, 255, 0.9);
        }

        .orp-character {
          color: #ff6b6b;
          font-weight: bold;
        }

        .rsvp-progress-bar {
          width: 100%;
          height: 6px;
          background: #2a2a2a;
          border-radius: 3px;
          overflow: hidden;
          margin-bottom: 16px;
        }

        .rsvp-progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
          transition: width 0.2s ease;
          width: 0%;
        }

        .rsvp-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
          color: #a0a0b0;
          font-size: 14px;
        }

        .rsvp-controls {
          display: flex;
          gap: 12px;
          justify-content: center;
        }

        .rsvp-btn {
          padding: 10px 20px;
          background: #6366f1;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-family: inherit;
          cursor: pointer;
          transition: background 0.2s;
          min-width: 80px;
        }

        .rsvp-btn:hover {
          background: #5558e3;
        }

        .rsvp-btn-secondary {
          background: #3a3a3a;
        }

        .rsvp-btn-secondary:hover {
          background: #4a4a4a;
        }

        .rsvp-help {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid #2a2a2a;
          color: #707080;
          font-size: 12px;
          text-align: center;
        }
      </style>

      <div class="rsvp-container">
        <div class="rsvp-word-container">
          <div class="rsvp-word" id="assist-rsvp-word">
            <span class="word-before"></span><span class="orp-character"></span><span class="word-after"></span>
          </div>
        </div>

        <div class="rsvp-progress-bar">
          <div class="rsvp-progress-fill" id="assist-rsvp-progress-fill"></div>
        </div>

        <div class="rsvp-info">
          <span id="assist-rsvp-progress-text">0 / 0 (0%)</span>
          <span id="assist-rsvp-speed-text">300 WPM</span>
          <span id="assist-rsvp-time-text">0:00</span>
        </div>

        <div class="rsvp-controls">
          <button class="rsvp-btn rsvp-btn-secondary" id="assist-rsvp-slower">← Slower</button>
          <button class="rsvp-btn" id="assist-rsvp-play-pause">Play</button>
          <button class="rsvp-btn rsvp-btn-secondary" id="assist-rsvp-faster">Faster →</button>
          <button class="rsvp-btn rsvp-btn-secondary" id="assist-rsvp-close">Close</button>
        </div>

        <div class="rsvp-help">
          <kbd>Space</kbd> Play/Pause  •  <kbd>↑↓</kbd> Speed  •  <kbd>←→</kbd> Navigate  •  <kbd>Esc</kbd> Close
        </div>
      </div>
    `;

    // Get references to elements
    this.wordDisplay = this.overlay.querySelector('#assist-rsvp-word');
    this.progressBar = this.overlay.querySelector('#assist-rsvp-progress-fill');
    this.progressText = this.overlay.querySelector('#assist-rsvp-progress-text');
    this.timeText = this.overlay.querySelector('#assist-rsvp-time-text');
    this.speedText = this.overlay.querySelector('#assist-rsvp-speed-text');
    this.playPauseBtn = this.overlay.querySelector('#assist-rsvp-play-pause');

    // Attach event listeners
    this.attachEventListeners();

    // Add to DOM
    document.body.appendChild(this.overlay);
  }

  /**
   * Hide and remove the overlay
   */
  hide() {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }

  /**
   * Update word display with ORP highlighting
   * @param {object} wordData - {word, orp: {before, orp, after}}
   */
  updateWord(wordData) {
    if (!this.wordDisplay) {
      return;
    }

    const { orp } = wordData;
    const beforeSpan = this.wordDisplay.querySelector('.word-before');
    const orpSpan = this.wordDisplay.querySelector('.orp-character');
    const afterSpan = this.wordDisplay.querySelector('.word-after');

    beforeSpan.textContent = orp.before;
    orpSpan.textContent = orp.orp;
    afterSpan.textContent = orp.after;
  }

  /**
   * Update progress bar and text
   * @param {object} progress - {current, total, percentage}
   */
  updateProgress(progress) {
    if (!this.progressBar || !this.progressText) {
      return;
    }

    this.progressBar.style.width = `${progress.percentage}%`;
    this.progressText.textContent = `${progress.current} / ${progress.total} (${progress.percentage}%)`;
  }

  /**
   * Update time remaining display
   * @param {number} seconds - Remaining seconds
   */
  updateTime(seconds) {
    if (!this.timeText) {
      return;
    }

    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    this.timeText.textContent = `${minutes}:${String(secs).padStart(2, '0')}`;
  }

  /**
   * Update speed display
   * @param {number} wpm - Words per minute
   */
  updateSpeed(wpm) {
    if (!this.speedText) {
      return;
    }
    this.speedText.textContent = `${wpm} WPM`;
  }

  /**
   * Update play/pause button text
   * @param {boolean} isPlaying - Current playback state
   */
  updatePlayPauseButton(isPlaying) {
    if (!this.playPauseBtn) {
      return;
    }
    this.playPauseBtn.textContent = isPlaying ? 'Pause' : 'Play';
  }

  /**
   * Attach event listeners to controls and keyboard
   * @private
   */
  attachEventListeners() {
    // Button controls
    const slowerBtn = this.overlay.querySelector('#assist-rsvp-slower');
    const fasterBtn = this.overlay.querySelector('#assist-rsvp-faster');
    const closeBtn = this.overlay.querySelector('#assist-rsvp-close');

    // Use mousedown pattern to prevent race conditions with document listeners
    attachInteractiveHandler(this.playPauseBtn, 'RSVP Play/Pause', () => {
      if (this.onPlayPause) {
        this.onPlayPause();
      }
    });

    attachInteractiveHandler(slowerBtn, 'RSVP Slower', () => {
      if (this.onSpeedChange) {
        this.onSpeedChange(-25);
      }
    });

    attachInteractiveHandler(fasterBtn, 'RSVP Faster', () => {
      if (this.onSpeedChange) {
        this.onSpeedChange(25);
      }
    });

    attachInteractiveHandler(closeBtn, 'RSVP Close', () => {
      if (this.onClose) {
        this.onClose();
      }
    });

    // Keyboard shortcuts
    this.keyboardHandler = e => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (this.onClose) {
          this.onClose();
        }
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        if (this.onPlayPause) {
          this.onPlayPause();
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (this.onSpeedChange) {
          this.onSpeedChange(25);
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (this.onSpeedChange) {
          this.onSpeedChange(-25);
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (this.onNavigate) {
          this.onNavigate(-1);
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (this.onNavigate) {
          this.onNavigate(1);
        }
      }
    };

    document.addEventListener('keydown', this.keyboardHandler);
  }

  /**
   * Remove keyboard event listener
   */
  cleanup() {
    if (this.keyboardHandler) {
      document.removeEventListener('keydown', this.keyboardHandler);
      this.keyboardHandler = null;
    }
    this.hide();
  }

  /**
   * Check if UI is visible
   * @returns {boolean}
   */
  isVisible() {
    return this.overlay !== null;
  }
}
