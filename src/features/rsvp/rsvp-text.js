/**
 * RSVP Text Processing Module
 *
 * Handles text tokenization and punctuation-aware delay calculation.
 * Part of the modular RSVP system - all features call into this centralized implementation.
 *
 * Based on RSVP specification: punctuation-aware pauses for improved comprehension
 * @module features/rsvp/rsvp-text
 */

/**
 * Tokenize text into words
 * Splits on whitespace and filters empty strings
 *
 * @param {string} text - Raw text to tokenize
 * @returns {string[]} Array of words
 */
export function tokenizeText(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  return text.split(/\s+/).filter(word => word.length > 0);
}

/**
 * Calculate word delay based on WPM and punctuation
 *
 * Punctuation-aware delays (spec requirements):
 * - Period, !, ?: 2.0× multiplier (400ms at 300 WPM)
 * - Colon, semicolon: 1.5× multiplier (300ms at 300 WPM)
 * - Comma: 1.25× multiplier (250ms at 300 WPM)
 * - Long words (10+ chars): 1.2× multiplier (240ms at 300 WPM)
 * - Paragraph break: 3.0× multiplier (600ms at 300 WPM)
 *
 * @param {string} word - Word to calculate delay for
 * @param {number} wpm - Words per minute setting
 * @param {boolean} isParagraphEnd - Is this the end of a paragraph?
 * @returns {number} Delay in milliseconds
 */
export function getWordDelay(word, wpm, isParagraphEnd = false) {
  const baseDelay = 60000 / wpm; // Base delay in ms

  // Paragraph break has highest priority
  if (isParagraphEnd) {
    return baseDelay * 3.0;
  }

  // Sentence ending punctuation
  if (/[.!?]$/.test(word)) {
    return baseDelay * 2.0;
  }

  // Mid-sentence punctuation
  if (/[,;:]$/.test(word)) {
    return baseDelay * 1.5;
  }

  // Long words
  const cleanWord = word.replace(/[^\w]/g, '');
  if (cleanWord.length >= 10) {
    return baseDelay * 1.2;
  }

  return baseDelay;
}

/**
 * Detect if a word ends a paragraph
 * Useful for determining when to apply paragraph-break pause
 *
 * @param {string} word - Current word
 * @param {string} nextWord - Next word (if available)
 * @returns {boolean} True if this word ends a paragraph
 */
export function isParagraphEnd(word, nextWord) {
  // Simple heuristic: sentence-ending punctuation followed by capitalized word
  // More sophisticated detection could be added later
  if (/[.!?]$/.test(word) && nextWord) {
    return /^[A-Z]/.test(nextWord);
  }
  return false;
}

/**
 * Clean and prepare text for RSVP reading
 * Removes excessive whitespace and normalizes line breaks
 *
 * @param {string} text - Raw text to clean
 * @returns {string} Cleaned text ready for tokenization
 */
export function cleanText(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  return text
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive line breaks
    .trim();
}

/**
 * Calculate reading time estimate
 *
 * @param {number} wordCount - Number of words
 * @param {number} wpm - Words per minute
 * @returns {object} Time estimate {minutes, seconds, totalSeconds}
 */
export function calculateReadingTime(wordCount, wpm) {
  const totalSeconds = Math.ceil((wordCount / wpm) * 60);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return {
    minutes,
    seconds,
    totalSeconds,
    formatted: `${minutes}:${String(seconds).padStart(2, '0')}`,
  };
}
