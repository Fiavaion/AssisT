/**
 * @file readPage.js - Content Extraction Utility for Read Page Feature
 * @module core/content/readPage
 * @description Provides DOM traversal and content extraction for the Read Page feature.
 *              Intelligently identifies main content areas and filters out navigation,
 *              headers, and sidebars to provide clean, readable text for TTS processing.
 *
 * WCAG Compliance: SC 1.4.12 (Text Spacing) - Content extraction preserves semantic structure
 * WCAG Compliance: SC 3.2.6 (Consistent Help) - Error messaging guides user to enable TTS
 *
 * Architecture: Pure DOM operations, no external dependencies
 * Context: Used by content.js message handler for 'readPage' command
 *
 * @example
 * import { extractMainContent } from './core/content/readPage.js';
 *
 * const { text, element, count } = extractMainContent();
 * if (text && text.length > 50) {
 *   readText(text, element); // Pass to TTS engine
 * }
 */

/**
 * Extract main content from the current page, filtering out navigation and UI chrome.
 *
 * This function performs intelligent DOM traversal to identify the primary content area
 * of a page, then extracts readable text elements while skipping navigation, headers,
 * footers, sidebars, and other UI elements. It supports both semantic HTML (main, article)
 * and common class-based selectors including Canvas VLE-specific selectors.
 *
 * DOM Selection Strategy:
 * 1. Attempts to find semantic main content: <main>, <article>, [role="main"]
 * 2. Falls back to class-based selectors: .main-content, .content, #content
 * 3. Includes Canvas-specific selectors: .ic-Layout-contentMain, .assignment_description, .user_content
 * 4. Final fallback: document.body (least preferred, includes all content)
 *
 * Filtering Strategy:
 * 1. Builds skip list of excluded selectors (nav, header, footer, aside, etc.)
 * 2. Checks parent chain for each text element to determine exclusion
 * 3. Extracts text from semantic content elements: p, h1-h6, li, blockquote
 * 4. Filters out text nodes with length < 10 characters (avoid noise)
 * 5. Returns only text parts with meaningful content (10+ chars minimum)
 *
 * @returns {Object} Content extraction result object
 * @returns {string} result.text - Concatenated, space-separated text content
 * @returns {HTMLElement} result.element - Reference to the main content DOM element
 * @returns {number} result.count - Number of text segments extracted
 *
 * @example
 * const { text, element, count } = extractMainContent();
 * console.log(`Extracted ${count} sections, ${text.length} characters`);
 * // Output: "Extracted 12 sections, 3247 characters"
 *
 * @throws Will not throw. Returns object with empty text string if no content found.
 *
 * @accessibility
 * - Respects semantic HTML structure for accurate content hierarchy
 * - Skips ARIA landmark roles (navigation, banner, complementary) to avoid duplication
 * - Preserves heading structure for screen reader users who may process the output
 */
export function extractMainContent() {
  // Try to find main content area
  const mainContent =
    document.querySelector('main') ||
    document.querySelector('article') ||
    document.querySelector('[role="main"]') ||
    document.querySelector('.main-content') ||
    document.querySelector('.content') ||
    document.querySelector('#content') ||
    // Canvas-specific selectors
    document.querySelector('.ic-Layout-contentMain') ||
    document.querySelector('.assignment_description') ||
    document.querySelector('.user_content') ||
    // Fallback to body
    document.body;

  // Build skip list (elements to exclude)
  const skipElements = new Set();
  const skipSelectors = [
    'nav',
    'header',
    'footer',
    'aside',
    '[role="navigation"]',
    '[role="banner"]',
    '[role="complementary"]',
    '.menu',
    '.sidebar',
    '.navigation',
    '.breadcrumb',
    '.ic-app-header',
    '.header-bar',
    '.right-side',
  ];

  skipSelectors.forEach(selector => {
    document.querySelectorAll(selector).forEach(el => skipElements.add(el));
  });

  // Extract text from paragraphs, headings, etc.
  const textElements = mainContent.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote');

  const textParts = [];
  textElements.forEach(el => {
    // Skip if element is inside skip list
    let shouldSkip = false;
    let current = el;
    while (current && current !== document.body) {
      if (skipElements.has(current)) {
        shouldSkip = true;
        break;
      }
      current = current.parentElement;
    }

    if (!shouldSkip) {
      const text = el.textContent?.trim();
      if (text && text.length > 10) {
        textParts.push(text);
      }
    }
  });

  return {
    text: textParts.join(' '),
    element: mainContent,
    count: textParts.length,
  };
}
