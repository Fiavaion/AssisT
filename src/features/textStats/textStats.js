/**
 * Text Statistics Engine
 *
 * Provides real-time text analysis and writing metrics for selected text,
 * page content, or full documents.
 *
 * Features:
 * - Word count, character count (with/without spaces)
 * - Sentence and paragraph counting
 * - Reading time estimation (200-250 WPM)
 * - Unique words and average word length
 * - WCAG 2.2 Level AA compliant
 *
 * @module textStats
 */

/**
 * Text Statistics Class
 * Provides comprehensive text analysis functionality
 */
export class TextStats {
  constructor() {
    this.enabled = false;
    this.targetWordCount = 0;
    this.readingSpeed = 225; // WPM (average 200-250)
  }

  /**
   * Initialize the text statistics engine
   * @param {Object} settings - Configuration settings
   */
  async initialize(settings = {}) {
    this.enabled = settings.enabled !== false;
    this.targetWordCount = settings.targetWordCount || 0;
    this.readingSpeed = settings.readingSpeed || 225;

    console.log('[TextStats] Engine initialized', {
      enabled: this.enabled,
      targetWordCount: this.targetWordCount,
      readingSpeed: this.readingSpeed,
    });
  }

  /**
   * Count words in text
   * Algorithm: Split by whitespace, filter empty strings, count valid words
   *
   * @param {string} text - Input text to analyze
   * @returns {number} Word count
   */
  countWords(text) {
    if (!text || typeof text !== 'string') {
      return 0;
    }

    // Normalize whitespace and trim
    const normalized = text.trim().replace(/\s+/g, ' ');

    if (normalized.length === 0) {
      return 0;
    }

    // Split by whitespace and filter empty strings
    const words = normalized.split(' ').filter(word => {
      // Remove empty strings and pure punctuation
      return word.length > 0 && /\w/.test(word);
    });

    return words.length;
  }

  /**
   * Count characters in text
   *
   * @param {string} text - Input text to analyze
   * @param {boolean} includeSpaces - Whether to include spaces in count
   * @returns {number} Character count
   */
  countCharacters(text, includeSpaces = true) {
    if (!text || typeof text !== 'string') {
      return 0;
    }

    if (includeSpaces) {
      return text.length;
    } else {
      // Remove all whitespace
      return text.replace(/\s/g, '').length;
    }
  }

  /**
   * Count sentences in text
   * Algorithm: Split by sentence terminators (. ! ?) followed by whitespace or end
   *
   * @param {string} text - Input text to analyze
   * @returns {number} Sentence count
   */
  countSentences(text) {
    if (!text || typeof text !== 'string') {
      return 0;
    }

    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return 0;
    }

    // Split by sentence terminators: . ! ?
    // Account for common abbreviations (Mr. Dr. etc.)
    const sentences = trimmed
      .replace(/([.!?])\s+/g, '$1|') // Add marker after terminators
      .replace(/([.!?])$/g, '$1|') // Handle end of text
      .split('|')
      .filter(s => s.trim().length > 0);

    return sentences.length;
  }

  /**
   * Count paragraphs in text
   * Algorithm: Split by multiple newlines (2+)
   *
   * @param {string} text - Input text to analyze
   * @returns {number} Paragraph count
   */
  countParagraphs(text) {
    if (!text || typeof text !== 'string') {
      return 0;
    }

    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return 0;
    }

    // Split by 2+ newlines (paragraph breaks)
    const paragraphs = trimmed.split(/\n\s*\n/).filter(p => p.trim().length > 0);

    return paragraphs.length;
  }

  /**
   * Estimate reading time in minutes
   * Uses configurable reading speed (default 225 WPM)
   *
   * @param {string} text - Input text to analyze
   * @returns {number} Reading time in minutes (rounded to 1 decimal)
   */
  estimateReadingTime(text) {
    const wordCount = this.countWords(text);

    if (wordCount === 0) {
      return 0;
    }

    const minutes = wordCount / this.readingSpeed;
    return Math.round(minutes * 10) / 10; // Round to 1 decimal
  }

  /**
   * Count unique words (case-insensitive)
   *
   * @param {string} text - Input text to analyze
   * @returns {number} Unique word count
   */
  countUniqueWords(text) {
    if (!text || typeof text !== 'string') {
      return 0;
    }

    const normalized = text.trim().replace(/\s+/g, ' ').toLowerCase();

    if (normalized.length === 0) {
      return 0;
    }

    // Extract words (alphanumeric + apostrophes)
    const words = normalized.match(/\b[\w']+\b/g) || [];

    // Use Set to get unique words
    const uniqueWords = new Set(words);

    return uniqueWords.size;
  }

  /**
   * Calculate average word length
   *
   * @param {string} text - Input text to analyze
   * @returns {number} Average word length (rounded to 1 decimal)
   */
  calculateAverageWordLength(text) {
    if (!text || typeof text !== 'string') {
      return 0;
    }

    const normalized = text.trim().replace(/\s+/g, ' ');

    if (normalized.length === 0) {
      return 0;
    }

    const words = normalized.match(/\b[\w']+\b/g) || [];

    if (words.length === 0) {
      return 0;
    }

    const totalLength = words.reduce((sum, word) => sum + word.length, 0);
    const average = totalLength / words.length;

    return Math.round(average * 10) / 10; // Round to 1 decimal
  }

  /**
   * Get comprehensive statistics for text
   * Returns all metrics in a single object
   *
   * @param {string} text - Input text to analyze
   * @returns {Object} Complete statistics object
   */
  analyzeText(text) {
    return {
      words: this.countWords(text),
      characters: this.countCharacters(text, true),
      charactersNoSpaces: this.countCharacters(text, false),
      sentences: this.countSentences(text),
      paragraphs: this.countParagraphs(text),
      readingTime: this.estimateReadingTime(text),
      uniqueWords: this.countUniqueWords(text),
      averageWordLength: this.calculateAverageWordLength(text),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Calculate progress toward target word count
   *
   * @param {number} currentWords - Current word count
   * @returns {Object} Progress information
   */
  calculateProgress(currentWords) {
    if (this.targetWordCount === 0) {
      return {
        percentage: 0,
        remaining: 0,
        status: 'none', // none, under, target, over
      };
    }

    const percentage = Math.round((currentWords / this.targetWordCount) * 100);
    const remaining = this.targetWordCount - currentWords;

    let status = 'under';
    if (currentWords >= this.targetWordCount) {
      status = 'target';
    }
    if (currentWords > this.targetWordCount * 1.1) {
      status = 'over';
    }

    return {
      percentage: Math.min(percentage, 100),
      remaining,
      status,
    };
  }

  /**
   * Enable text statistics engine
   */
  enable() {
    this.enabled = true;
    console.log('[TextStats] Engine enabled');
  }

  /**
   * Disable text statistics engine
   */
  disable() {
    this.enabled = false;
    console.log('[TextStats] Engine disabled');
  }

  /**
   * Update reading speed (WPM)
   *
   * @param {number} speed - Reading speed in words per minute (200-250 typical)
   */
  setReadingSpeed(speed) {
    if (speed < 50 || speed > 1000) {
      console.warn('[TextStats] Invalid reading speed, using default 225 WPM');
      this.readingSpeed = 225;
      return;
    }
    this.readingSpeed = speed;
    console.log('[TextStats] Reading speed set to', speed, 'WPM');
  }

  /**
   * Set target word count
   *
   * @param {number} target - Target word count
   */
  setTargetWordCount(target) {
    if (target < 0) {
      console.warn('[TextStats] Invalid target word count, using 0');
      this.targetWordCount = 0;
      return;
    }
    this.targetWordCount = target;
    console.log('[TextStats] Target word count set to', target);
  }
}

// Export singleton instance
export const textStatsEngine = new TextStats();
