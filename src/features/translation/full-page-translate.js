/**
 * Full-Page Translation Module
 *
 * Provides full-page translation with:
 * - DOM traversal to find all text nodes
 * - Batch translation (chunks of 50 nodes)
 * - Progress indicator
 * - Original text preservation (for revert)
 * - HTML structure preservation
 * - Skip script, style, code tags
 *
 * Features:
 * - TreeWalker for efficient text node traversal
 * - Batch translation for better performance
 * - Progress tracking with real-time updates
 * - Revert button to restore original text
 * - Preserves data attributes for revert
 * - Skips interactive and semantic elements
 *
 * Architecture:
 * - Self-contained module following Feature Isolation Pattern
 * - All functions prefixed with 'fullPageTranslate_' to avoid naming conflicts
 * - Uses translation API via window.assistFeatures.translation
 * - Stores original text in data-original-text attribute
 *
 * @module features/translation/full-page-translate
 */

import { attachInteractiveHandler } from '../../utils/event-handlers.js';
import { Z } from '../../utils/z-index.js';

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let fullPageTranslate_isTranslated = false;
let fullPageTranslate_progressModal = null;
let fullPageTranslate_revertButton = null;

// ============================================================================
// PROGRESS MODAL
// ============================================================================

/**
 * Creates the progress modal for full-page translation
 *
 * @returns {HTMLElement} Progress modal element
 */
function fullPageTranslate_createProgressModal() {
  const modal = document.createElement('div');
  modal.id = 'assist-fullpage-translate-progress';
  modal.setAttribute('role', 'status');
  modal.setAttribute('aria-live', 'polite');
  modal.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: white;
    padding: 20px;
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
    z-index: ${Z.MODAL};
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    min-width: 300px;
  `;

  const title = document.createElement('div');
  title.textContent = 'Translating Page...';
  title.style.cssText = `
    font-size: 16px;
    font-weight: 600;
    color: #333;
    margin-bottom: 12px;
  `;

  const progressBar = document.createElement('div');
  progressBar.id = 'assist-translate-progress-bar';
  progressBar.style.cssText = `
    width: 100%;
    height: 8px;
    background: #e0e0e0;
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 8px;
  `;

  const progressFill = document.createElement('div');
  progressFill.id = 'assist-translate-progress-fill';
  progressFill.style.cssText = `
    width: 0%;
    height: 100%;
    background: #3b82f6;
    transition: width 0.3s ease;
  `;
  progressBar.appendChild(progressFill);

  const progressText = document.createElement('div');
  progressText.id = 'assist-translate-progress-text';
  progressText.textContent = 'Preparing...';
  progressText.style.cssText = `
    font-size: 14px;
    color: #666;
    text-align: center;
  `;

  modal.appendChild(title);
  modal.appendChild(progressBar);
  modal.appendChild(progressText);

  return modal;
}

/**
 * Shows the progress modal
 *
 * @returns {void}
 */
function fullPageTranslate_showProgressModal() {
  if (fullPageTranslate_progressModal) {
    fullPageTranslate_progressModal.remove();
  }

  fullPageTranslate_progressModal = fullPageTranslate_createProgressModal();
  document.body.appendChild(fullPageTranslate_progressModal);
}

/**
 * Updates progress modal
 *
 * @param {number} current - Current progress
 * @param {number} total - Total items
 * @returns {void}
 */
function fullPageTranslate_updateProgress(current, total) {
  const progressFill = document.getElementById('assist-translate-progress-fill');
  const progressText = document.getElementById('assist-translate-progress-text');

  if (!progressFill || !progressText) {
    return;
  }

  const percentage = Math.round((current / total) * 100);
  progressFill.style.width = `${percentage}%`;
  progressText.textContent = `Translating... ${current}/${total} nodes (${percentage}%)`;
}

/**
 * Hides the progress modal
 *
 * @returns {void}
 */
function fullPageTranslate_hideProgressModal() {
  if (fullPageTranslate_progressModal) {
    fullPageTranslate_progressModal.remove();
    fullPageTranslate_progressModal = null;
  }
}

// ============================================================================
// REVERT BUTTON
// ============================================================================

/**
 * Creates the revert button (floating action button)
 *
 * @returns {HTMLElement} Revert button element
 */
function fullPageTranslate_createRevertButton() {
  const button = document.createElement('button');
  button.id = 'assist-fullpage-translate-revert';
  button.textContent = 'Revert Translation';
  button.setAttribute('aria-label', 'Revert page to original language');
  button.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #ef4444;
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 24px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
    z-index: 999998;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    transition: all 0.2s;
  `;

  button.onmouseenter = () => {
    button.style.background = '#dc2626';
    button.style.transform = 'translateY(-2px)';
    button.style.boxShadow = '0 6px 16px rgba(239, 68, 68, 0.5)';
  };

  button.onmouseleave = () => {
    button.style.background = '#ef4444';
    button.style.transform = 'translateY(0)';
    button.style.boxShadow = '0 4px 12px rgba(239, 68, 68, 0.4)';
  };

  attachInteractiveHandler(button, 'Full Page Translate Revert Button', () =>
    fullPageTranslate_revert()
  );

  return button;
}

/**
 * Shows the revert button
 *
 * @returns {void}
 */
function fullPageTranslate_showRevertButton() {
  if (fullPageTranslate_revertButton) {
    fullPageTranslate_revertButton.remove();
  }

  fullPageTranslate_revertButton = fullPageTranslate_createRevertButton();
  document.body.appendChild(fullPageTranslate_revertButton);
}

/**
 * Hides the revert button
 *
 * @returns {void}
 */
function fullPageTranslate_hideRevertButton() {
  if (fullPageTranslate_revertButton) {
    fullPageTranslate_revertButton.remove();
    fullPageTranslate_revertButton = null;
  }
}

// ============================================================================
// DOM TRAVERSAL
// ============================================================================

/**
 * Gets all translatable text nodes in the document
 * Skips script, style, code, and interactive elements
 *
 * @returns {Array<Node>} Array of text nodes
 */
function fullPageTranslate_getTextNodes() {
  console.log('[FullPageTranslate] Finding text nodes...');

  const textNodes = [];
  const skipTags = new Set([
    'SCRIPT',
    'STYLE',
    'CODE',
    'PRE',
    'NOSCRIPT',
    'IFRAME',
    'SVG',
    'CANVAS',
    'VIDEO',
    'AUDIO',
    'INPUT',
    'TEXTAREA',
    'SELECT',
    'BUTTON',
  ]);

  // Use TreeWalker for efficient traversal
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function (node) {
        // Skip empty or whitespace-only text nodes
        if (!node.textContent || !node.textContent.trim()) {
          return NodeFilter.FILTER_REJECT;
        }

        // Skip if parent is a skip tag
        let parent = node.parentElement;
        while (parent) {
          if (skipTags.has(parent.tagName)) {
            return NodeFilter.FILTER_REJECT;
          }

          // Skip elements with data-no-translate attribute
          if (parent.hasAttribute('data-no-translate')) {
            return NodeFilter.FILTER_REJECT;
          }

          parent = parent.parentElement;
        }

        // Only accept text nodes with substantial content (more than 2 chars)
        if (node.textContent.trim().length < 3) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      },
    },
    false
  );

  let node;
  while ((node = walker.nextNode())) {
    textNodes.push(node);
  }

  console.log(`[FullPageTranslate] Found ${textNodes.length} text nodes`);
  return textNodes;
}

// ============================================================================
// BATCH TRANSLATION
// ============================================================================

/**
 * Translates an array of text nodes in batches
 *
 * @param {Array<Node>} textNodes - Text nodes to translate
 * @param {string} targetLang - Target language code
 * @param {string} sourceLang - Source language code (default: 'auto')
 * @returns {Promise<void>}
 */
async function fullPageTranslate_translateNodes(textNodes, targetLang, sourceLang = 'auto') {
  console.log(`[FullPageTranslate] Translating ${textNodes.length} nodes to ${targetLang}`);

  // Get translation API
  const translationAPI = window.assistFeatures?.translation;
  if (!translationAPI) {
    throw new Error('Translation API not available');
  }

  let processedNodes = 0;

  // Process each node sequentially to avoid rate limiting (was causing HTTP 429 errors)
  for (let i = 0; i < textNodes.length; i++) {
    const node = textNodes[i];

    try {
      const originalText = node.textContent.trim();

      // Skip if already translated (has data-original-text attribute)
      if (node.parentElement?.hasAttribute('data-original-text')) {
        processedNodes++;
        fullPageTranslate_updateProgress(processedNodes, textNodes.length);
        continue;
      }

      // Skip empty or whitespace-only nodes
      if (!originalText || originalText.length < 2) {
        processedNodes++;
        fullPageTranslate_updateProgress(processedNodes, textNodes.length);
        continue;
      }

      // Translate
      const result = await translationAPI.translate(originalText, targetLang, sourceLang);

      if (result.error) {
        console.warn(`[FullPageTranslate] Translation error: ${result.error}`);
        processedNodes++;
        fullPageTranslate_updateProgress(processedNodes, textNodes.length);
        continue;
      }

      if (result.translatedText && result.translatedText !== originalText) {
        // Store original text in parent element
        if (node.parentElement) {
          node.parentElement.setAttribute('data-original-text', originalText);
        }

        // Replace text content
        node.textContent = result.translatedText;
      }
    } catch (error) {
      console.error('[FullPageTranslate] Node translation error:', error);
    } finally {
      processedNodes++;
      fullPageTranslate_updateProgress(processedNodes, textNodes.length);
    }

    // Small delay between each request to avoid rate limiting (300ms)
    if (i < textNodes.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  console.log('[FullPageTranslate] Translation complete');
}

// ============================================================================
// MAIN TRANSLATION FUNCTION
// ============================================================================

/**
 * Translates the entire page to target language
 *
 * @param {string} targetLang - Target language code (default: 'en')
 * @param {string} sourceLang - Source language code (default: 'auto')
 * @returns {Promise<void>}
 */
async function fullPageTranslate_translate(targetLang = 'en', sourceLang = 'auto') {
  console.log('[FullPageTranslate] Starting full-page translation');

  if (fullPageTranslate_isTranslated) {
    console.warn('[FullPageTranslate] Page is already translated');
    if (window.showToast) {
      window.showToast('Page is already translated. Use Revert to restore original.');
    }
    return;
  }

  try {
    // Show progress modal
    fullPageTranslate_showProgressModal();

    // Get all text nodes
    const textNodes = fullPageTranslate_getTextNodes();

    if (textNodes.length === 0) {
      console.warn('[FullPageTranslate] No text nodes found');
      fullPageTranslate_hideProgressModal();
      if (window.showToast) {
        window.showToast('No translatable text found on this page');
      }
      return;
    }

    // Translate all nodes
    await fullPageTranslate_translateNodes(textNodes, targetLang, sourceLang);

    // Mark as translated
    fullPageTranslate_isTranslated = true;

    // Hide progress modal
    fullPageTranslate_hideProgressModal();

    // Show revert button
    fullPageTranslate_showRevertButton();

    // Show success toast
    if (window.showToast) {
      window.showToast(`Page translated to ${targetLang.toUpperCase()}`);
    }

    console.log('[FullPageTranslate] Full-page translation complete');
  } catch (error) {
    console.error('[FullPageTranslate] Translation failed:', error);
    fullPageTranslate_hideProgressModal();

    if (window.showToast) {
      window.showToast(`Translation failed: ${error.message}`);
    }
  }
}

// ============================================================================
// REVERT FUNCTION
// ============================================================================

/**
 * Reverts the page to original language
 *
 * @returns {void}
 */
function fullPageTranslate_revert() {
  console.log('[FullPageTranslate] Reverting to original language');

  if (!fullPageTranslate_isTranslated) {
    console.warn('[FullPageTranslate] Page is not translated');
    return;
  }

  // Find all elements with data-original-text attribute
  const translatedElements = document.querySelectorAll('[data-original-text]');
  console.log(`[FullPageTranslate] Reverting ${translatedElements.length} elements`);

  translatedElements.forEach(element => {
    const originalText = element.getAttribute('data-original-text');
    if (originalText) {
      // Find the text node child
      const textNode = Array.from(element.childNodes).find(
        node => node.nodeType === Node.TEXT_NODE
      );
      if (textNode) {
        textNode.textContent = originalText;
      }

      // Remove attribute
      element.removeAttribute('data-original-text');
    }
  });

  // Mark as not translated
  fullPageTranslate_isTranslated = false;

  // Hide revert button
  fullPageTranslate_hideRevertButton();

  // Show success toast
  if (window.showToast) {
    window.showToast('Page reverted to original language');
  }

  console.log('[FullPageTranslate] Revert complete');
}

// ============================================================================
// EXPORTS
// ============================================================================

// Auto-initialize when script loads
if (typeof window !== 'undefined') {
  // Ensure assistFeatures namespace exists
  window.assistFeatures = window.assistFeatures || {};

  // Register full-page translate functions
  window.assistFeatures.fullPageTranslate = {
    translate: fullPageTranslate_translate,
    revert: fullPageTranslate_revert,
    isTranslated: () => fullPageTranslate_isTranslated,
  };

  console.log('[FullPageTranslate] Module loaded');
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    fullPageTranslate_translate,
    fullPageTranslate_revert,
    fullPageTranslate_getTextNodes,
  };
}
