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
 * Consent (ADR 0006): a whole page is its own question, `pageTranslation`, because it sends far more
 * than a selection and on a course page that can include other people's names. It is asked once,
 * before anything is sent, with a sample of what the page holds. Only text the student can see is
 * sent: nothing hidden, nothing aria-hidden, none of AssisT's own interface.
 *
 * @module features/translation/full-page-translate
 */

import { attachAccessibleHandler } from '../../utils/event-handlers.js';
import { Z } from '../../utils/z-index.js';
import { getConsent } from '../../utils/consent.js';
import { askForConsent } from '../../utils/consent-panel.js';

/** What a student is told when they chose not to send the page. */
const PAGE_DECLINED_MESSAGE =
  'Nothing was sent. You chose not to use MyMemory to translate the whole page.';

/** How many passages the consent sample is drawn from. */
const SAMPLE_PASSAGES = 3;

let fullPageTranslate_isTranslated = false;
let fullPageTranslate_progressModal = null;
let fullPageTranslate_revertButton = null;

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

  attachAccessibleHandler(button, 'Full Page Translate Revert Button', () =>
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

/**
 * Whether an element hides its text from a sighted student, or is AssisT's own interface.
 * @param {Element} element
 * @returns {boolean}
 */
function fullPageTranslate_isHiddenOrOwn(element) {
  if (
    element.hasAttribute('hidden') ||
    element.hasAttribute('inert') ||
    element.getAttribute('aria-hidden') === 'true' ||
    element.hasAttribute('data-no-translate') ||
    element.hasAttribute('data-assist-consent-panel') ||
    (typeof element.id === 'string' && element.id.startsWith('assist-')) ||
    [...element.classList].some(name => name.startsWith('assist-'))
  ) {
    return true;
  }
  const style = window.getComputedStyle(element);
  if (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    style.visibility === 'collapse'
  ) {
    return true;
  }
  // Chrome answers for what the rules above cannot see: content-visibility, a zero opacity, and
  // text clipped to nothing for screen readers only.
  if (typeof element.checkVisibility === 'function') {
    if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
      return true;
    }
    const box = element.getBoundingClientRect();
    if (box.width <= 1 && box.height <= 1) {
      return true;
    }
  }
  return false;
}

/**
 * Gets the text nodes a sighted student can see on the page.
 * Skips script, style, code and form controls, hidden and aria-hidden content, and AssisT's own UI.
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
    'TEMPLATE',
  ]);
  /** @type {Map<Element, boolean>} each element's verdict, so a deep page is walked once */
  const excluded = new Map();
  const isExcluded = element => {
    if (!element || element === document.body) {
      return false;
    }
    if (!excluded.has(element)) {
      excluded.set(
        element,
        skipTags.has(element.tagName.toUpperCase()) ||
          fullPageTranslate_isHiddenOrOwn(element) ||
          isExcluded(element.parentElement)
      );
    }
    return excluded.get(element);
  };

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const text = node.textContent ? node.textContent.trim() : '';
      // Only text nodes with substantial content (more than 2 chars)
      if (text.length < 3 || isExcluded(node.parentElement)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let node;
  while ((node = walker.nextNode())) {
    textNodes.push(node);
  }

  console.log(`[FullPageTranslate] Found ${textNodes.length} text nodes`);
  return textNodes;
}

/**
 * Whether the student allows this page to be sent: asked once, before anything is sent, with a
 * sample of what the page holds. After an earlier no, pressing Translate Page is the student
 * asking, so the question comes back saying so, with Allow in it.
 *
 * @param {Array<Node>} textNodes - what would be sent
 * @returns {Promise<boolean>}
 */
async function fullPageTranslate_isAllowed(textNodes) {
  const state = await getConsent('pageTranslation');
  if (state === 'granted') {
    return true;
  }
  const passages = textNodes.map(node => node.textContent.trim().replace(/\s+/g, ' '));
  const words = passages.join(' ').split(' ').filter(Boolean).length;
  const count = passages.length === 1 ? '1 passage' : `${passages.length} passages`;
  const answer = await askForConsent('pageTranslation', {
    detail: passages.slice(0, SAMPLE_PASSAGES).join(' / '),
    detailLabel: `This page has ${count} of visible text, about ${words} words. It starts:`,
    declinedBefore: state === 'declined',
  });
  return answer === 'granted';
}

/**
 * Translates an array of text nodes in batches
 *
 * @param {Array<Node>} textNodes - Text nodes to translate
 * @param {string} targetLang - Target language code
 * @param {string} sourceLang - Source language code (default: 'auto')
 * @returns {Promise<string|null>} the explanation when the student has not allowed MyMemory and
 *   nothing was sent, otherwise null
 */
async function fullPageTranslate_translateNodes(textNodes, targetLang, sourceLang = 'auto') {
  console.log(`[FullPageTranslate] Translating ${textNodes.length} nodes to ${targetLang}`);

  // Get translation API
  const translationAPI = window.assistFeatures?.translation;
  if (!translationAPI) {
    throw new Error('Translation API not available');
  }

  let processedNodes = 0;
  let declined = null;
  // The first passage sent may ask, and is asked about only when Chrome does not hold MyMemory's
  // host (ADR 0009: a yes without it is no consent). Every later passage never asks.
  let firstSent = true;

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

      // Translate. The student has already answered for the whole page, so a refusal here (the
      // answer withdrawn mid-run) ends the run rather than asking again per passage.
      const result = await translationAPI.translate(originalText, targetLang, sourceLang, {
        destination: 'pageTranslation',
        ask: firstSent,
      });
      firstSent = false;

      // The student said no to sending the page: one refusal answers for the whole page.
      if (result.consentDeclined) {
        declined = result.error;
        break;
      }

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
  return declined;
}

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
    // Get all text nodes
    const textNodes = fullPageTranslate_getTextNodes();

    if (textNodes.length === 0) {
      console.warn('[FullPageTranslate] No text nodes found');
      if (window.showToast) {
        window.showToast('No translatable text found on this page');
      }
      return;
    }

    if (!(await fullPageTranslate_isAllowed(textNodes))) {
      if (window.showToast) {
        window.showToast(PAGE_DECLINED_MESSAGE);
      }
      return;
    }

    // Show progress modal
    fullPageTranslate_showProgressModal();

    // Translate all nodes
    const declined = await fullPageTranslate_translateNodes(textNodes, targetLang, sourceLang);
    if (declined) {
      fullPageTranslate_hideProgressModal();
      if (window.showToast) {
        window.showToast(declined);
      }
      return;
    }

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
