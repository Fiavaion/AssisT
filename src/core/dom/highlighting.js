/**
 * AssisT DOM Highlighting Module
 * Provides text and element highlighting functionality for TTS features
 * Phase 1, Step 3: Extracted from content-simple.js
 */

import { hexToRgba } from '../utils/color.js';
import { sanitizeHTML } from '../../utils/sanitize.js';

/**
 * Global reference to the currently highlighted element
 * Used for tracking and cleanup of highlight state
 * @type {HTMLElement|null}
 */
let currentHighlight = null;

/**
 * Interval ID for word-by-word highlighting animation
 * Used to track and clear the progressive highlighting timer
 * @type {number|null}
 */
let wordHighlightInterval = null;

/**
 * Removes all highlighting from the DOM
 * Cleans up both current highlight reference and any elements with 'assist-highlight' class
 * Restores original text nodes and normalizes parent elements
 *
 * @function removeHighlight
 * @returns {void}
 *
 * @example
 * // Remove all highlights after TTS stops
 * removeHighlight();
 */
export function removeHighlight() {
  if (currentHighlight) {
    const parent = currentHighlight.parentNode;
    if (parent) {
      const text = document.createTextNode(currentHighlight.textContent);
      parent.replaceChild(text, currentHighlight);
      parent.normalize();
    }
    currentHighlight = null;
  }

  document.querySelectorAll('.assist-highlight').forEach(el => {
    const parent = el.parentNode;
    if (parent) {
      const text = document.createTextNode(el.textContent);
      parent.replaceChild(text, el);
      parent.normalize();
    }
  });
}

/**
 * Applies background color highlight to a single element
 * Removes any existing highlights before applying new one
 * Only applies if highlighting is enabled in settings
 *
 * @function highlightElement
 * @param {HTMLElement} element - The DOM element to highlight
 * @returns {void}
 *
 * @example
 * // Highlight a paragraph element during TTS
 * const paragraph = document.querySelector('p');
 * highlightElement(paragraph);
 */
export function highlightElement(element, settings) {
  removeHighlight();

  // Only apply highlight if enabled
  if (settings.highlightEnabled) {
    const bgColor = hexToRgba(settings.highlightColor, settings.highlightOpacity);
    element.style.backgroundColor = bgColor;
    element.style.transition = 'background-color 0.2s';
  }
}

/**
 * Removes background color highlighting from a specific element
 * Resets the backgroundColor style property
 *
 * @function removeElementHighlight
 * @param {HTMLElement} element - The DOM element to remove highlight from
 * @returns {void}
 *
 * @example
 * // Clean up highlight after TTS finishes
 * const paragraph = document.querySelector('p');
 * removeElementHighlight(paragraph);
 */
export function removeElementHighlight(element) {
  if (element) {
    element.style.backgroundColor = '';
  }
}

/**
 * Implements word-by-word progressive highlighting synchronized with TTS playback
 * Splits text into individual words, wraps each in a span, and highlights progressively
 * Calculates timing based on reading rate (default 150 words/min at 1.0x)
 * Stores original HTML for cleanup restoration
 *
 * @function highlightWordByWord
 * @param {HTMLElement} element - The DOM element containing text to highlight
 * @param {string} text - The text content to be highlighted word by word
 * @param {number} rate - Speech rate multiplier (e.g., 1.0 = normal, 1.5 = faster)
 * @param {Object} settings - Settings object containing highlight configuration
 * @param {string} settings.highlightColor - Hex color code for highlight (e.g., '#FFEB3B')
 * @param {number} settings.highlightOpacity - Opacity value 0-1 (e.g., 0.7)
 * @returns {void}
 *
 * @example
 * // Highlight paragraph text word by word at 1.2x speed
 * const paragraph = document.querySelector('p');
 * const text = paragraph.textContent;
 * highlightWordByWord(paragraph, text, 1.2, settings);
 */
export function highlightWordByWord(element, text, rate, settings) {
  // Clear any existing word highlighting
  if (wordHighlightInterval) {
    clearInterval(wordHighlightInterval);
    wordHighlightInterval = null;
  }

  // Remove previous word highlights
  removeHighlight();

  // Split text into words
  const words = text.split(/\s+/);
  if (words.length === 0) {
    return;
  }

  // Estimate time per word (avg reading speed ~ 150 words/min at 1.0x rate)
  // Adjusted for rate setting
  const baseWordsPerMinute = 150;
  const adjustedWordsPerMinute = baseWordsPerMinute * rate;
  const msPerWord = (60 * 1000) / adjustedWordsPerMinute;

  let currentWordIndex = 0;

  // Wrap each word in the element with a span
  const bgColor = hexToRgba(settings.highlightColor, settings.highlightOpacity);
  const originalHTML = element.innerHTML;

  // Store original content for cleanup
  element.dataset.originalHTML = originalHTML;

  // Create wrapped HTML
  const wrappedHTML = text
    .split(/(\s+)/)
    .map((part, index) => {
      if (part.trim().length === 0) {
        // Keep whitespace as-is
        return part;
      } else {
        // Wrap words in spans
        return `<span class="assist-word" data-word-index="${Math.floor(index / 2)}">${part}</span>`;
      }
    })
    .join('');

  element.innerHTML = sanitizeHTML(wrappedHTML);

  // Highlight words progressively
  const wordSpans = element.querySelectorAll('.assist-word');

  function highlightWord(index) {
    // Remove previous highlight
    wordSpans.forEach(span => {
      span.style.backgroundColor = '';
    });

    // Highlight current word
    if (index < wordSpans.length) {
      wordSpans[index].style.backgroundColor = bgColor;
      wordSpans[index].style.transition = 'background-color 0.1s';
    }
  }

  // Start highlighting
  highlightWord(0);

  wordHighlightInterval = setInterval(() => {
    currentWordIndex++;
    if (currentWordIndex >= words.length) {
      clearInterval(wordHighlightInterval);
      wordHighlightInterval = null;
    } else {
      highlightWord(currentWordIndex);
    }
  }, msPerWord);
}

/**
 * Cleans up word-by-word highlighting and restores original element HTML
 * Clears any active highlight interval and restores pre-wrapped content
 * Safe to call multiple times or on elements without word highlighting
 *
 * @function cleanupWordByWord
 * @param {HTMLElement} element - The DOM element to restore
 * @returns {void}
 *
 * @example
 * // Restore paragraph to original state after TTS stops
 * const paragraph = document.querySelector('p');
 * cleanupWordByWord(paragraph);
 */
export function cleanupWordByWord(element) {
  if (wordHighlightInterval) {
    clearInterval(wordHighlightInterval);
    wordHighlightInterval = null;
  }

  // Restore original HTML if it was modified
  if (element && element.dataset.originalHTML) {
    element.innerHTML = sanitizeHTML(element.dataset.originalHTML);
    delete element.dataset.originalHTML;
  }
}
