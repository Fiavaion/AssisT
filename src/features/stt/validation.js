/**
 * STT Validation Module
 * Provides text input field detection and validation for Speech-to-Text features
 *
 * @module src/features/stt/validation
 * @description Validates whether DOM elements are suitable for STT input,
 * including standard text inputs, textareas, contenteditable elements,
 * and Canvas Rich Text Editor fields.
 */

/**
 * Determines if a DOM element is a valid text input field for STT
 *
 * Checks for the following element types:
 * - Standard HTML text inputs (type: text, email, search, url, tel)
 * - Textarea elements
 * - Elements with contenteditable="true" attribute
 * - Canvas Rich Text Editor fields (.mce-content-body, [role="textbox"])
 *
 * @param {HTMLElement|null|undefined} element - The DOM element to validate
 * @returns {boolean} True if the element is a valid text input field, false otherwise
 *
 * @example
 * // Check if a focused element can accept STT input
 * document.addEventListener('focusin', (e) => {
 *   if (isTextInput(e.target)) {
 *     console.log('Text input detected, STT ready');
 *   }
 * });
 *
 * @example
 * // Validate before inserting text
 * const field = document.getElementById('essay-input');
 * if (isTextInput(field)) {
 *   field.value += transcribedText;
 * }
 */
export function isTextInput(element) {
  // Guard against null or undefined elements
  if (!element) {
    return false;
  }

  const tagName = element.tagName?.toLowerCase();
  const contentEditable = element.contentEditable === 'true' || element.isContentEditable;

  // Check for standard text inputs
  if (tagName === 'textarea') {
    return true;
  }
  if (tagName === 'input') {
    const type = element.type?.toLowerCase();
    return ['text', 'email', 'search', 'url', 'tel'].includes(type);
  }

  // Check for contenteditable elements
  if (contentEditable) {
    return true;
  }

  // Check for Canvas Rich Text Editor
  if (element.closest('.mce-content-body, [role="textbox"]')) {
    return true;
  }

  // Check for Google Docs editor elements
  // Google Docs uses custom divs (kix-*) and iframes for text input
  if (
    element.closest('.kix-page, .kix-paginateddocumentplugin, [contenteditable="true"]') ||
    element.classList?.contains('docs-texteventtarget-iframe') ||
    element.closest('[role="document"]') ||
    element.closest('.kix-appview-editor')
  ) {
    return true;
  }

  return false;
}
