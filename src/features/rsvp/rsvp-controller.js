/**
 * RSVP Controller - Public API
 *
 * Single entry point for all RSVP functionality.
 * All features (textStats, highlightMenu, keyboard shortcuts, etc.) call into this controller.
 *
 * This is the ONLY module that should be imported by other features.
 * Internal modules (engine, ui, text) are implementation details.
 *
 * Benefits of centralized controller:
 * - One place to fix bugs
 * - Consistent behavior across all integration points
 * - Easy to test and maintain
 * - Simple to upgrade (e.g., swap ORP algorithm)
 *
 * @module features/rsvp/rsvp-controller
 */

import { RSVPEngine } from './rsvp-engine.js';
import { RSVPUI } from './rsvp-ui.js';
import {
  tokenizeText,
  cleanText,
  calculateReadingTime as _calculateReadingTime,
} from './rsvp-text.js';

/**
 * RSVP Controller Class
 * Coordinates engine, UI, and user interactions
 */
class RSVPController {
  constructor() {
    this.engine = new RSVPEngine();
    this.ui = new RSVPUI();
    this.isActive = false;

    // Bind UI callbacks to engine
    this.ui.onClose = () => this.stop();
    this.ui.onPlayPause = () => this.toggle();
    this.ui.onSpeedChange = delta => this.adjustSpeed(delta);
    this.ui.onNavigate = direction => {
      if (direction < 0) {
        this.engine.previous();
      } else {
        this.engine.next();
      }
    };

    // Bind engine callbacks to UI
    this.engine.onWordChange = data => {
      this.ui.updateWord(data);
      this.ui.updateProgress(data.progress);
      this.ui.updateTime(this.engine.getRemainingTime());
    };

    this.engine.onProgressChange = progress => {
      this.ui.updateProgress(progress);
    };

    this.engine.onComplete = () => {
      this.ui.updatePlayPauseButton(false);
      // Auto-close on completion (optional - can be configured)
      setTimeout(() => this.stop(), 1000);
    };
  }

  /**
   * Start RSVP with given text
   * This is the main entry point used by all features
   *
   * @param {string} text - Text to display in RSVP mode
   * @param {object} options - Optional configuration
   * @param {number} options.wpm - Words per minute (default: 300)
   * @param {boolean} options.autoPlay - Start playing immediately (default: true)
   * @returns {boolean} Success status
   */
  start(text, options = {}) {
    if (!text || typeof text !== 'string') {
      console.warn('[RSVP] No text provided');
      return false;
    }

    // Clean and tokenize text
    const cleanedText = cleanText(text);
    const words = tokenizeText(cleanedText);

    if (words.length === 0) {
      console.warn('[RSVP] No words to display');
      return false;
    }

    // Load into engine
    this.engine.loadWords(words);

    // Apply options
    if (options.wpm) {
      this.engine.setSpeed(options.wpm);
    }

    // Show UI
    this.ui.show();
    this.isActive = true;

    // Update UI with initial state
    this.ui.updateSpeed(this.engine.wpm);
    this.ui.updateTime(this.engine.getRemainingTime());
    this.ui.updateProgress(this.engine.getProgress());

    // Display first word
    this.engine.displayCurrentWord();

    // Auto-play if requested (default: true)
    const autoPlay = options.autoPlay !== undefined ? options.autoPlay : true;
    if (autoPlay) {
      this.engine.play();
      this.ui.updatePlayPauseButton(true);
    }

    console.log(`[RSVP] Started with ${words.length} words at ${this.engine.wpm} WPM`);
    return true;
  }

  /**
   * Stop RSVP and close UI
   */
  stop() {
    this.engine.stop();
    this.ui.cleanup();
    this.isActive = false;
    console.log('[RSVP] Stopped');
  }

  /**
   * Pause playback (keeps UI open)
   */
  pause() {
    this.engine.pause();
    this.ui.updatePlayPauseButton(false);
  }

  /**
   * Resume playback
   */
  resume() {
    this.engine.play();
    this.ui.updatePlayPauseButton(true);
  }

  /**
   * Toggle play/pause
   */
  toggle() {
    this.engine.toggle();
    this.ui.updatePlayPauseButton(this.engine.isPlaying);
  }

  /**
   * Adjust speed by delta
   * @param {number} delta - Change in WPM (e.g., +25 or -25)
   */
  adjustSpeed(delta) {
    this.engine.adjustSpeed(delta);
    this.ui.updateSpeed(this.engine.wpm);
    this.ui.updateTime(this.engine.getRemainingTime());
    console.log(`[RSVP] Speed adjusted to ${this.engine.wpm} WPM`);
  }

  /**
   * Set specific speed
   * @param {number} wpm - Words per minute (60-1000)
   */
  setSpeed(wpm) {
    this.engine.setSpeed(wpm);
    this.ui.updateSpeed(this.engine.wpm);
    this.ui.updateTime(this.engine.getRemainingTime());
  }

  /**
   * Check if RSVP is currently active
   * @returns {boolean}
   */
  isRSVPActive() {
    return this.isActive;
  }

  /**
   * Get current state (for debugging/monitoring)
   * @returns {object} Current state snapshot
   */
  getState() {
    return this.engine.getState();
  }
}

// Create singleton instance
const rsvpController = new RSVPController();

// Initialize and expose public API
console.log('[RSVP] Controller initialized');

// Expose on window for global access
if (!window.assistFeatures) {
  window.assistFeatures = {};
}

window.assistFeatures.rsvp = {
  start: (text, options) => rsvpController.start(text, options),
  stop: () => rsvpController.stop(),
  pause: () => rsvpController.pause(),
  resume: () => rsvpController.resume(),
  toggle: () => rsvpController.toggle(),
  setSpeed: wpm => rsvpController.setSpeed(wpm),
  isActive: () => rsvpController.isRSVPActive(),
  getState: () => rsvpController.getState(),
};

console.log('[RSVP] Public API exposed at window.assistFeatures.rsvp');
