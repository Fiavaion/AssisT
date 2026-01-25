/**
 * RSVP Engine Module
 *
 * Core timing engine with ORP (Optimal Recognition Point) calculation.
 * Manages playback state and word-by-word presentation timing.
 *
 * ORP Implementation based on spec:
 * - 1-2 letters: 1st character (index 0)
 * - 3-6 letters: 2nd character (index 1)
 * - 7-9 letters: 3rd character (index 2)
 * - 10+ letters: 4th character (index 3)
 *
 * @module features/rsvp/rsvp-engine
 */

import { getWordDelay, isParagraphEnd } from './rsvp-text.js';

/**
 * Calculate ORP (Optimal Recognition Point) index for a word
 * The ORP is positioned at approximately 30% into the word
 *
 * @param {string} word - Word to calculate ORP for
 * @returns {number} Character index for ORP (0-based)
 */
export function calculateORP(word) {
  const cleanWord = word.replace(/[^\w]/g, '');
  const len = cleanWord.length;

  if (len <= 2) {
    return 0;
  }
  if (len <= 6) {
    return 1;
  }
  if (len <= 9) {
    return 2;
  }
  return 3;
}

/**
 * Split word into ORP parts for display
 * Returns {before, orp, after} for styling
 *
 * @param {string} word - Word to split
 * @returns {object} {before: string, orp: string, after: string}
 */
export function splitWordForORP(word) {
  const orpIndex = calculateORP(word);

  return {
    before: word.slice(0, orpIndex),
    orp: word[orpIndex] || '',
    after: word.slice(orpIndex + 1),
  };
}

/**
 * RSVP Engine Class
 * Manages playback state, timing, and word progression
 */
export class RSVPEngine {
  constructor() {
    this.words = [];
    this.currentIndex = 0;
    this.wpm = 300; // Default speed
    this.isPlaying = false;
    this.timerId = null;
    this.onWordChange = null; // Callback for word updates
    this.onComplete = null; // Callback for completion
    this.onProgressChange = null; // Callback for progress updates
  }

  /**
   * Load text into the engine
   * @param {string[]} words - Array of words to display
   */
  loadWords(words) {
    this.words = words;
    this.currentIndex = 0;
    this.isPlaying = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  /**
   * Start or resume playback
   */
  play() {
    if (this.words.length === 0) {
      return;
    }
    if (this.currentIndex >= this.words.length) {
      this.currentIndex = 0; // Restart if at end
    }

    this.isPlaying = true;
    this.tick();
  }

  /**
   * Pause playback
   */
  pause() {
    this.isPlaying = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  /**
   * Stop playback and reset
   */
  stop() {
    this.pause();
    this.currentIndex = 0;
  }

  /**
   * Toggle play/pause
   */
  toggle() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  /**
   * Set playback speed
   * @param {number} wpm - Words per minute (60-1000)
   */
  setSpeed(wpm) {
    this.wpm = Math.max(60, Math.min(1000, wpm));
  }

  /**
   * Adjust speed by delta
   * @param {number} delta - Change in WPM (e.g., +25 or -25)
   */
  adjustSpeed(delta) {
    this.setSpeed(this.wpm + delta);
  }

  /**
   * Jump to specific word index
   * @param {number} index - Word index to jump to
   */
  jumpTo(index) {
    this.currentIndex = Math.max(0, Math.min(index, this.words.length - 1));
    if (this.isPlaying) {
      this.pause();
      this.play();
    } else {
      this.displayCurrentWord();
    }
  }

  /**
   * Go to previous word
   */
  previous() {
    this.jumpTo(this.currentIndex - 1);
  }

  /**
   * Go to next word
   */
  next() {
    this.jumpTo(this.currentIndex + 1);
  }

  /**
   * Get current progress
   * @returns {object} {current, total, percentage}
   */
  getProgress() {
    return {
      current: this.currentIndex + 1,
      total: this.words.length,
      percentage:
        this.words.length > 0 ? Math.round(((this.currentIndex + 1) / this.words.length) * 100) : 0,
    };
  }

  /**
   * Get remaining time estimate
   * @returns {number} Remaining seconds
   */
  getRemainingTime() {
    const remainingWords = this.words.length - this.currentIndex;
    return Math.ceil((remainingWords / this.wpm) * 60);
  }

  /**
   * Core tick function - displays word and schedules next
   * @private
   */
  tick() {
    if (!this.isPlaying || this.currentIndex >= this.words.length) {
      if (this.currentIndex >= this.words.length) {
        this.isPlaying = false;
        if (this.onComplete) {
          this.onComplete();
        }
      }
      return;
    }

    const word = this.words[this.currentIndex];
    this.displayCurrentWord();

    // Calculate delay with punctuation awareness
    const nextWord = this.words[this.currentIndex + 1];
    const isParaEnd = isParagraphEnd(word, nextWord);
    const delay = getWordDelay(word, this.wpm, isParaEnd);

    // Schedule next word
    this.timerId = window.setTimeout(() => {
      this.currentIndex++;
      this.tick();
    }, delay);
  }

  /**
   * Display current word via callback
   * @private
   */
  displayCurrentWord() {
    if (this.currentIndex >= this.words.length) {
      return;
    }

    const word = this.words[this.currentIndex];
    const orp = splitWordForORP(word);
    const progress = this.getProgress();

    if (this.onWordChange) {
      this.onWordChange({
        word,
        orp,
        index: this.currentIndex,
        progress,
      });
    }

    if (this.onProgressChange) {
      this.onProgressChange(progress);
    }
  }

  /**
   * Check if engine is currently active
   * @returns {boolean}
   */
  isActive() {
    return this.words.length > 0;
  }

  /**
   * Get current state
   * @returns {object} State snapshot
   */
  getState() {
    return {
      wordCount: this.words.length,
      currentIndex: this.currentIndex,
      wpm: this.wpm,
      isPlaying: this.isPlaying,
      progress: this.getProgress(),
      remainingTime: this.getRemainingTime(),
    };
  }
}
