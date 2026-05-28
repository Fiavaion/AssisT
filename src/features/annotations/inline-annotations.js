/**
 * @fileoverview Inline Annotations Feature
 *
 * ARCHITECTURAL PATTERN: Self-Initializing Feature Module
 *
 * Provides inline text annotations with highlighting and comments.
 * Users can select text, add comments, and choose highlight colors.
 *
 * FEATURES:
 * - Text selection creates highlight with comment button
 * - Annotation modal with textarea, color picker, save/cancel
 * - Highlighted text shows border and background color
 * - Hover shows comment tooltip
 * - Click highlight to edit annotation
 * - Storage adapter integration (IndexedDB or chrome.storage.local)
 * - WCAG 2.2 Level AA compliant (keyboard accessible, ARIA labels)
 *
 * DEPENDENCIES:
 * - storage-adapter.js (DexieStorageAdapter or LocalStorageAdapter)
 * - settings-manager.js (for storage mode selection)
 *
 * @module features/annotations/inline-annotations
 * @see {@link storage-adapter.js} - Storage backend
 */

import { getStorageAdapter } from './storage-adapter.js';
import { Z } from '../../utils/z-index.js';
import { createTagInput } from './tag-manager.js';
import { sanitizeHTML } from '../../utils/sanitize.js';
import { attachAccessibleHandler, attachInteractiveHandler } from '../../utils/event-handlers.js';

// ============================================================
// STATE MANAGEMENT
// ============================================================

/** @type {BaseStorageAdapter} Current storage adapter instance */
let storageAdapter = null;

/** @type {string} Current storage mode ('local' or 'indexeddb') */
let storageMode = 'local';

/** @type {Map<number, Array<HTMLElement>>} Map of annotation ID to highlight elements */
const activeAnnotations = new Map();

/** @type {HTMLElement|null} Currently open modal */
let currentModal = null;

/** @type {Object|null} Currently editing annotation */
let currentEditingAnnotation = null;

/** @type {Range|null} Cloned range from selection — used directly for new annotation highlight, bypasses XPath recreation */
let pendingRange = null;

// ============================================================
// INITIALIZATION
// ============================================================

/**
 * Initialize the inline annotations system
 * - Load storage adapter based on settings
 * - Load existing annotations for current URL
 * - Set up Chrome message listeners
 */
async function initializeInlineAnnotations() {
  console.log('[InlineAnnotations] Initializing...');

  try {
    // Load storage mode from settings
    await loadStorageMode();

    // Initialize storage adapter
    storageAdapter = getStorageAdapter(storageMode);
    console.log(`[InlineAnnotations] Using storage mode: ${storageMode}`);

    // Load existing annotations for current page
    await loadAnnotationsForCurrentPage();

    // Listen for storage mode changes
    chrome.storage.local.onChanged.addListener(handleStorageChange);

    console.log('[InlineAnnotations] Initialized successfully');
  } catch (error) {
    console.error('[InlineAnnotations] Initialization failed:', error);
  }
}

/**
 * Load storage mode from settings
 */
async function loadStorageMode() {
  return new Promise(resolve => {
    chrome.storage.local.get(['annotationStorageMode'], result => {
      storageMode = result.annotationStorageMode || 'local';
      resolve();
    });
  });
}

/**
 * Load all annotations for the current page URL
 */
async function loadAnnotationsForCurrentPage() {
  try {
    const currentUrl = window.location.href;
    const annotations = await storageAdapter.getByUrl(currentUrl);

    console.log(`[InlineAnnotations] Loaded ${annotations.length} annotations for current page`);

    // Render each annotation
    for (const annotation of annotations) {
      if (annotation.type === 'annotation') {
        renderAnnotation(annotation);
      }
    }
  } catch (error) {
    console.error('[InlineAnnotations] Error loading annotations:', error);
  }
}

// ============================================================
// ANNOTATION CREATION
// ============================================================

/**
 * Create a new inline annotation from text selection
 * @param {Object} options - Annotation options
 * @param {string} options.selectedText - Selected text
 * @param {Object} options.position - Position data (start/end offsets)
 * @param {string} [options.comment=''] - Comment text
 * @param {string} [options.color='yellow'] - Highlight color
 * @param {Array<string>} [options.tags=[]] - Tags for the annotation
 * @returns {Promise<Object>} Created annotation data
 */
export async function createInlineAnnotation({
  selectedText,
  position,
  comment = '',
  color = 'yellow',
  tags = [],
  preInsertedSpan = null,
}) {
  try {
    const annotationData = {
      type: 'annotation',
      url: window.location.href,
      selectedText,
      comment,
      color,
      tags: tags || [],
      position,
    };

    const savedAnnotation = await storageAdapter.create(annotationData);
    console.log('[InlineAnnotations] Created annotation:', savedAnnotation.id);

    if (preInsertedSpan) {
      // Span already in DOM — just wire it up with the real ID
      preInsertedSpan.dataset.annotationId = String(savedAnnotation.id);
      preInsertedSpan.setAttribute('aria-label', `Annotation: ${comment || 'No comment'}`);
      attachAnnotationListeners(preInsertedSpan, savedAnnotation);
      activeAnnotations.set(savedAnnotation.id, [preInsertedSpan]);
    } else {
      // Programmatic call (no modal) — fall back to XPath-based rendering
      renderAnnotation(savedAnnotation);
    }

    return savedAnnotation;
  } catch (error) {
    console.error('[InlineAnnotations] Error creating annotation:', error);
    throw error;
  }
}

// ============================================================
// ANNOTATION RENDERING
// ============================================================

/**
 * Render an annotation on the page (used for annotations loaded from storage on page load)
 * @param {Object} annotation - Annotation data from storage
 */
function renderAnnotation(annotation) {
  // Don't render duplicates
  if (activeAnnotations.has(annotation.id)) {
    return;
  }

  try {
    const range = recreateRange(annotation.position);
    if (!range) {
      console.warn('[InlineAnnotations] Could not recreate range for annotation:', annotation.id);
      return;
    }

    // Wrap the range in highlight spans
    const highlightElements = highlightRange(range, annotation);

    // Store reference to highlight elements
    activeAnnotations.set(annotation.id, highlightElements);

    console.log('[InlineAnnotations] Rendered annotation:', annotation.id);
  } catch (error) {
    console.error('[InlineAnnotations] Error rendering annotation:', error);
  }
}

/**
 * Recreate a Range object from stored position data
 * @param {Object} position - Position data
 * @returns {Range|null} Recreated range
 */
function recreateRange(position) {
  try {
    const { startOffset, endOffset, containerXPath } = position;

    // Find container element using XPath
    const container = getElementByXPath(containerXPath);
    if (!container) {
      console.warn('[InlineAnnotations] Container not found:', containerXPath);
      return null;
    }

    // Create range
    const range = document.createRange();

    // Find text nodes and set range boundaries
    const textNodes = getTextNodesIn(container);
    let currentOffset = 0;
    let startNode = null;
    let startNodeOffset = 0;
    let endNode = null;
    let endNodeOffset = 0;

    for (const node of textNodes) {
      const nodeLength = node.textContent.length;
      const nodeStart = currentOffset;
      const nodeEnd = currentOffset + nodeLength;

      // Find start node
      if (startNode === null && startOffset >= nodeStart && startOffset < nodeEnd) {
        startNode = node;
        startNodeOffset = startOffset - nodeStart;
      }

      // Find end node
      if (endOffset > nodeStart && endOffset <= nodeEnd) {
        endNode = node;
        endNodeOffset = endOffset - nodeStart;
        break;
      }

      currentOffset += nodeLength;
    }

    if (startNode && endNode) {
      range.setStart(startNode, startNodeOffset);
      range.setEnd(endNode, endNodeOffset);
      return range;
    }

    return null;
  } catch (error) {
    console.error('[InlineAnnotations] Error recreating range:', error);
    return null;
  }
}

/**
 * Insert a highlight span synchronously from a live Range.
 * Must be called before any await so the Range is guaranteed valid.
 * Returns the span on success, null if insertion failed.
 */
function insertHighlightSpan(range, color, comment) {
  if (!range) {
    return null;
  }

  const span = document.createElement('span');
  span.className = 'assist-inline-annotation';
  span.setAttribute('role', 'mark');
  span.setAttribute('tabindex', '0');
  // Placeholder label — replaced with real ID after storage write
  span.setAttribute('aria-label', `Annotation: ${comment || 'No comment'}`);
  applyAnnotationColor(span, color);

  try {
    range.surroundContents(span);
    return span;
  } catch {
    try {
      const fragment = range.extractContents();
      span.appendChild(fragment);
      range.insertNode(span);
      return span;
    } catch (e) {
      console.warn('[InlineAnnotations] insertHighlightSpan failed:', e);
      return null;
    }
  }
}

/**
 * Highlight a range with annotation styling
 * @param {Range} range - Range to highlight
 * @param {Object} annotation - Annotation data
 * @returns {Array<HTMLElement>} Created highlight elements
 */
function highlightRange(range, annotation) {
  const highlightElements = [];

  // Create highlight wrapper
  const span = document.createElement('span');
  span.className = 'assist-inline-annotation';
  span.dataset.annotationId = annotation.id;
  span.setAttribute('role', 'mark');
  span.setAttribute('aria-label', `Annotation: ${annotation.comment || 'No comment'}`);
  span.setAttribute('tabindex', '0');

  // Apply color theme
  applyAnnotationColor(span, annotation.color);

  // Wrap the range
  try {
    range.surroundContents(span);
    highlightElements.push(span);
  } catch (error) {
    // If surroundContents fails (complex DOM), use alternative method
    console.warn('[InlineAnnotations] surroundContents failed, using extractContents:', error);
    const fragment = range.extractContents();
    span.appendChild(fragment);
    range.insertNode(span);
    highlightElements.push(span);
  }

  // Add event listeners
  attachAnnotationListeners(span, annotation);

  return highlightElements;
}

/**
 * Apply color theme to annotation highlight
 * @param {HTMLElement} element - Highlight element
 * @param {string} color - Color name
 */
function applyAnnotationColor(element, color) {
  const colorMap = {
    yellow: { bg: 'rgba(254, 243, 199, 0.5)', border: '#fbbf24' },
    blue: { bg: 'rgba(219, 234, 254, 0.5)', border: '#3b82f6' },
    green: { bg: 'rgba(209, 250, 229, 0.5)', border: '#10b981' },
    pink: { bg: 'rgba(252, 231, 243, 0.5)', border: '#ec4899' },
    purple: { bg: 'rgba(233, 213, 255, 0.5)', border: '#a855f7' },
  };

  const theme = colorMap[color] || colorMap.yellow;
  element.style.backgroundColor = theme.bg;
  element.style.borderBottom = `2px solid ${theme.border}`;
  element.style.cursor = 'pointer';
  element.style.transition = 'background-color 0.2s';
}

/**
 * Attach event listeners to annotation highlight
 * @param {HTMLElement} element - Highlight element
 * @param {Object} annotation - Annotation data
 */
function attachAnnotationListeners(element, annotation) {
  // Click/keyboard to edit (includes Enter/Space key support)
  attachAccessibleHandler(element, 'Annotation Highlight', () => {
    openEditModal(annotation);
  });

  // Hover to show tooltip
  let tooltip = null;

  element.addEventListener('mouseenter', e => {
    tooltip = createTooltip(annotation, e.target);
    document.body.appendChild(tooltip);
  });

  element.addEventListener('mouseleave', () => {
    if (tooltip) {
      tooltip.remove();
      tooltip = null;
    }
  });

  // Focus indicator
  element.addEventListener('focus', () => {
    element.style.outline = '2px solid #3b82f6';
    element.style.outlineOffset = '2px';
  });

  element.addEventListener('blur', () => {
    element.style.outline = 'none';
  });
}

/**
 * Create tooltip showing annotation comment
 * @param {Object} annotation - Annotation data
 * @param {HTMLElement} target - Target element for positioning
 * @returns {HTMLElement} Tooltip element
 */
function createTooltip(annotation, target) {
  const tooltip = document.createElement('div');
  tooltip.className = 'assist-annotation-tooltip';
  tooltip.textContent = annotation.comment || 'No comment';
  tooltip.setAttribute('role', 'tooltip');

  tooltip.style.cssText = `
    position: fixed;
    background: #374151;
    color: white;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 14px;
    line-height: 1.4;
    max-width: 300px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: ${Z.FLOATING};
    pointer-events: none;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;

  // Position below target
  const rect = target.getBoundingClientRect();
  tooltip.style.left = `${rect.left}px`;
  tooltip.style.top = `${rect.bottom + 8}px`;

  return tooltip;
}

// ============================================================
// ANNOTATION MODAL
// ============================================================

/**
 * Open annotation modal for creating/editing
 * @param {Object|null} annotation - Existing annotation to edit, or null for new
 * @param {string} selectedText - Selected text (for new annotations)
 * @param {Object} position - Position data (for new annotations)
 */
export function openAnnotationModal(
  annotation = null,
  selectedText = '',
  position = null,
  savedRange = null
) {
  // Close existing modal
  if (currentModal) {
    currentModal.remove();
  }

  currentEditingAnnotation = annotation;
  pendingRange = savedRange;

  // Create modal
  const modal = document.createElement('div');
  modal.className = 'assist-annotation-modal-overlay';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'annotation-modal-title');

  const isEdit = annotation !== null;

  modal.innerHTML = sanitizeHTML(`
    <div class="assist-annotation-modal" role="document">
      <div class="assist-annotation-modal-header">
        <h3 id="annotation-modal-title">${isEdit ? 'Edit Annotation' : 'Add Annotation'}</h3>
        <button class="assist-annotation-modal-close" aria-label="Close modal">×</button>
      </div>
      <div class="assist-annotation-modal-body">
        <div class="assist-annotation-selected-text">
          <strong>Selected text:</strong>
          <p>${annotation?.selectedText || selectedText}</p>
        </div>
        <label for="annotation-comment" class="assist-annotation-label">Comment:</label>
        <textarea
          id="annotation-comment"
          class="assist-annotation-textarea"
          placeholder="Add your comment here..."
          aria-label="Annotation comment"
          rows="4"
        >${annotation?.comment || ''}</textarea>

        <label class="assist-annotation-label">Highlight Color:</label>
        <div class="assist-annotation-color-picker" role="radiogroup" aria-label="Choose highlight color">
          ${createColorOptions(annotation?.color || 'yellow')}
        </div>

        <label class="assist-annotation-label" style="margin-top: 16px;">Tags:</label>
        <div id="annotation-tag-input-container"></div>
        <p class="assist-annotation-tag-help">Press Enter or comma to add tags. Backspace to remove last tag.</p>
      </div>
      <div class="assist-annotation-modal-footer">
        ${isEdit ? '<button class="assist-annotation-btn assist-annotation-btn-delete" aria-label="Delete annotation">Delete</button>' : ''}
        <button class="assist-annotation-btn assist-annotation-btn-cancel" aria-label="Cancel">Cancel</button>
        <button class="assist-annotation-btn assist-annotation-btn-save" aria-label="Save annotation">Save</button>
      </div>
    </div>
  `);

  // Attach event listeners
  const closeBtn = modal.querySelector('.assist-annotation-modal-close');
  const cancelBtn = modal.querySelector('.assist-annotation-btn-cancel');
  const saveBtn = modal.querySelector('.assist-annotation-btn-save');
  const deleteBtn = modal.querySelector('.assist-annotation-btn-delete');

  // Create tag input
  const tagInputContainer = modal.querySelector('#annotation-tag-input-container');
  const tagInput = createTagInput(tagInputContainer, annotation?.tags || []);

  attachInteractiveHandler(closeBtn, 'Annotation Modal Close', () => closeAnnotationModal());
  attachInteractiveHandler(cancelBtn, 'Annotation Modal Cancel', () => closeAnnotationModal());
  attachInteractiveHandler(saveBtn, 'Annotation Modal Save', () =>
    saveAnnotationFromModal(selectedText, position, tagInput, selectedColor)
  );

  if (deleteBtn) {
    attachInteractiveHandler(deleteBtn, 'Annotation Modal Delete', () =>
      deleteAnnotationFromModal()
    );
  }

  // Close on overlay click
  modal.addEventListener('click', e => {
    if (e.target === modal) {
      closeAnnotationModal();
    }
  });

  // Keyboard navigation
  modal.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeAnnotationModal();
    }
  });

  // Color picker handlers — track in closure var, not DOM class (DOM query unreliable on mousedown)
  let selectedColor = annotation?.color || 'yellow';
  const colorOptions = modal.querySelectorAll('.assist-annotation-color-option');
  colorOptions.forEach(option => {
    attachInteractiveHandler(option, 'Annotation Color', () => {
      colorOptions.forEach(opt => opt.classList.remove('selected'));
      option.classList.add('selected');
      selectedColor = option.dataset.color;
    });
  });

  document.body.appendChild(modal);
  currentModal = modal;

  // Focus textarea
  const textarea = modal.querySelector('#annotation-comment');
  textarea.focus();

  console.log('[InlineAnnotations] Modal opened');
}

/**
 * Create color picker options HTML
 * @param {string} selectedColor - Currently selected color
 * @returns {string} HTML string
 */
function createColorOptions(selectedColor) {
  const colors = [
    { name: 'yellow', label: 'Yellow', emoji: '💛' },
    { name: 'blue', label: 'Blue', emoji: '💙' },
    { name: 'green', label: 'Green', emoji: '💚' },
    { name: 'pink', label: 'Pink', emoji: '💗' },
    { name: 'purple', label: 'Purple', emoji: '💜' },
  ];

  return colors
    .map(
      color => `
    <button
      class="assist-annotation-color-option ${color.name === selectedColor ? 'selected' : ''}"
      data-color="${color.name}"
      role="radio"
      aria-checked="${color.name === selectedColor}"
      aria-label="${color.label}"
    >
      ${color.emoji}
    </button>
  `
    )
    .join('');
}

/**
 * Close annotation modal
 */
function closeAnnotationModal() {
  if (currentModal) {
    currentModal.remove();
    currentModal = null;
  }
  currentEditingAnnotation = null;
  pendingRange = null;
  console.log('[InlineAnnotations] Modal closed');
}

/**
 * Save annotation from modal
 * @param {string} selectedText - Selected text (for new annotations)
 * @param {Object} position - Position data (for new annotations)
 * @param {Object} tagInput - Tag input API object
 */
async function saveAnnotationFromModal(selectedText, position, tagInput, color = 'yellow') {
  const textarea = currentModal.querySelector('#annotation-comment');
  const comment = textarea.value.trim();
  const tags = tagInput.getTags();

  // Grab and clear pendingRange NOW — synchronously, before any await.
  // The Range must be used immediately; it can become invalid after async DOM mutations.
  const rangeSnapshot = pendingRange;
  pendingRange = null;

  try {
    if (currentEditingAnnotation) {
      await storageAdapter.update(currentEditingAnnotation.id, { comment, color, tags });
      const elements = activeAnnotations.get(currentEditingAnnotation.id);
      if (elements) {
        elements.forEach(el => {
          applyAnnotationColor(el, color);
          el.setAttribute('aria-label', `Annotation: ${comment || 'No comment'}`);
        });
      }
      console.log('[InlineAnnotations] Updated annotation:', currentEditingAnnotation.id);
    } else {
      // Insert highlight span SYNCHRONOUSLY before the storage await
      const span = insertHighlightSpan(rangeSnapshot, color, comment);
      await createInlineAnnotation({
        selectedText,
        position,
        comment,
        color,
        tags,
        preInsertedSpan: span,
      });
      console.log('[InlineAnnotations] Created new annotation');
    }

    closeAnnotationModal();
  } catch (error) {
    console.error('[InlineAnnotations] Error saving annotation:', error);
    alert('Failed to save annotation. Please try again.');
  }
}

/**
 * Delete annotation from modal
 */
async function deleteAnnotationFromModal() {
  if (!currentEditingAnnotation) {
    return;
  }

  if (!confirm('Are you sure you want to delete this annotation?')) {
    return;
  }

  try {
    await deleteAnnotation(currentEditingAnnotation.id);
    closeAnnotationModal();
  } catch (error) {
    console.error('[InlineAnnotations] Error deleting annotation:', error);
    alert('Failed to delete annotation. Please try again.');
  }
}

/**
 * Delete an annotation
 * @param {number} annotationId - Annotation ID
 */
async function deleteAnnotation(annotationId) {
  try {
    // Remove from storage
    await storageAdapter.delete(annotationId);

    // Remove from DOM
    const elements = activeAnnotations.get(annotationId);
    if (elements) {
      elements.forEach(el => {
        // Unwrap the highlight span
        const parent = el.parentNode;
        while (el.firstChild) {
          parent.insertBefore(el.firstChild, el);
        }
        el.remove();
      });
      activeAnnotations.delete(annotationId);
    }

    console.log('[InlineAnnotations] Deleted annotation:', annotationId);
  } catch (error) {
    console.error('[InlineAnnotations] Error deleting annotation:', error);
    throw error;
  }
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Get element by XPath
 * @param {string} xpath - XPath expression
 * @returns {Element|null} Found element
 */
function getElementByXPath(xpath) {
  const result = document.evaluate(
    xpath,
    document,
    null,
    XPathResult.FIRST_ORDERED_NODE_TYPE,
    null
  );
  return result.singleNodeValue;
}

/**
 * Get all text nodes within an element
 * @param {Element} element - Container element
 * @returns {Array<Text>} Array of text nodes
 */
function getTextNodesIn(element) {
  const textNodes = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);

  let node;
  while ((node = walker.nextNode())) {
    if (node.textContent.trim()) {
      textNodes.push(node);
    }
  }

  return textNodes;
}

/**
 * Get XPath for an element
 * @param {Element} element - Element to get XPath for
 * @returns {string} XPath expression
 */
function getXPath(element) {
  if (element.id) {
    return `//*[@id="${element.id}"]`;
  }

  if (element === document.body) {
    return '/html/body';
  }

  let ix = 0;
  const siblings = element.parentNode.childNodes;

  for (let i = 0; i < siblings.length; i++) {
    const sibling = siblings[i];
    if (sibling === element) {
      return (
        getXPath(element.parentNode) + '/' + element.tagName.toLowerCase() + '[' + (ix + 1) + ']'
      );
    }
    if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
      ix++;
    }
  }
}

/**
 * Get position data from a Range
 * @param {Range} range - Range object
 * @returns {Object} Position data
 */
export function getPositionFromRange(range) {
  const container =
    range.commonAncestorContainer.nodeType === Node.TEXT_NODE
      ? range.commonAncestorContainer.parentElement
      : range.commonAncestorContainer;

  // Get text offset within container
  const textNodes = getTextNodesIn(container);
  let startOffset = 0;
  let endOffset = 0;
  let currentOffset = 0;

  for (const node of textNodes) {
    if (node === range.startContainer) {
      startOffset = currentOffset + range.startOffset;
    }
    if (node === range.endContainer) {
      endOffset = currentOffset + range.endOffset;
      break;
    }
    currentOffset += node.textContent.length;
  }

  return {
    startOffset,
    endOffset,
    containerXPath: getXPath(container),
  };
}

// ============================================================
// STORAGE CHANGE HANDLER
// ============================================================

/**
 * Handle storage changes (storage mode switch)
 * @param {Object} changes - Changed keys
 */
function handleStorageChange(changes) {
  if (changes.annotationStorageMode) {
    const newMode = changes.annotationStorageMode.newValue;
    console.log(`[InlineAnnotations] Storage mode changed to: ${newMode}`);

    // Reload with new adapter
    storageMode = newMode;
    storageAdapter = getStorageAdapter(storageMode);

    // Clear existing annotations and reload
    activeAnnotations.forEach(elements => {
      elements.forEach(el => {
        const parent = el.parentNode;
        while (el.firstChild) {
          parent.insertBefore(el.firstChild, el);
        }
        el.remove();
      });
    });
    activeAnnotations.clear();
    loadAnnotationsForCurrentPage();
  }
}

// ============================================================
// STYLES (INJECTED INTO PAGE)
// ============================================================

/**
 * Inject annotation CSS into page
 */
function injectStyles() {
  const styleId = 'assist-inline-annotation-styles';
  if (document.getElementById(styleId)) {
    return; // Already injected
  }

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    .assist-inline-annotation {
      position: relative;
      border-radius: 2px;
    }

    .assist-inline-annotation:hover {
      filter: brightness(0.95);
    }

    .assist-inline-annotation:focus {
      outline: 2px solid #3b82f6;
      outline-offset: 2px;
    }

    .assist-annotation-tooltip {
      animation: assist-tooltip-fade-in 0.2s ease-out;
    }

    @keyframes assist-tooltip-fade-in {
      from {
        opacity: 0;
        transform: translateY(-4px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .assist-annotation-modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999998;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      animation: assist-modal-fade-in 0.2s ease-out;
    }

    @keyframes assist-modal-fade-in {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }

    .assist-annotation-modal {
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
      width: 90%;
      max-width: 500px;
      max-height: 80vh;
      overflow: auto;
      animation: assist-modal-slide-in 0.3s ease-out;
    }

    @keyframes assist-modal-slide-in {
      from {
        transform: translateY(-20px) scale(0.95);
        opacity: 0;
      }
      to {
        transform: translateY(0) scale(1);
        opacity: 1;
      }
    }

    .assist-annotation-modal-header {
      padding: 20px 24px;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .assist-annotation-modal-header h3 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      color: #111827;
    }

    .assist-annotation-modal-close {
      background: transparent;
      border: none;
      font-size: 32px;
      font-weight: 300;
      color: #6b7280;
      cursor: pointer;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 6px;
      transition: all 0.15s;
      line-height: 1;
      padding: 0;
    }

    .assist-annotation-modal-close:hover {
      background: #f3f4f6;
      color: #111827;
    }

    .assist-annotation-modal-close:focus {
      outline: 2px solid #3b82f6;
      outline-offset: 2px;
    }

    .assist-annotation-modal-body {
      padding: 24px;
    }

    .assist-annotation-selected-text {
      background: #f9fafb;
      border-left: 3px solid #3b82f6;
      padding: 12px 16px;
      margin-bottom: 20px;
      border-radius: 6px;
    }

    .assist-annotation-selected-text strong {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }

    .assist-annotation-selected-text p {
      margin: 0;
      color: #374151;
      font-size: 14px;
      line-height: 1.5;
    }

    .assist-annotation-label {
      display: block;
      font-weight: 600;
      font-size: 14px;
      color: #374151;
      margin-bottom: 8px;
    }

    .assist-annotation-textarea {
      width: 100%;
      padding: 12px;
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      font-size: 14px;
      font-family: inherit;
      color: #111827;
      resize: vertical;
      min-height: 100px;
      margin-bottom: 20px;
      transition: border-color 0.2s;
    }

    .assist-annotation-textarea:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .assist-annotation-color-picker {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }

    .assist-annotation-color-option {
      width: 44px;
      height: 44px;
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      font-size: 24px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      background: white;
      transition: all 0.2s;
    }

    .assist-annotation-color-option:hover {
      transform: scale(1.1);
      border-color: #d1d5db;
    }

    .assist-annotation-color-option.selected {
      border-color: #3b82f6;
      border-width: 3px;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .assist-annotation-color-option:focus {
      outline: 2px solid #3b82f6;
      outline-offset: 2px;
    }

    .assist-annotation-modal-footer {
      padding: 16px 24px;
      border-top: 1px solid #e5e7eb;
      display: flex;
      gap: 12px;
      justify-content: flex-end;
    }

    .assist-annotation-btn {
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
      font-family: inherit;
    }

    .assist-annotation-btn-cancel {
      background: white;
      color: #374151;
      border: 2px solid #e5e7eb;
    }

    .assist-annotation-btn-cancel:hover {
      background: #f9fafb;
      border-color: #d1d5db;
    }

    .assist-annotation-btn-save {
      background: #3b82f6;
      color: white;
    }

    .assist-annotation-btn-save:hover {
      background: #2563eb;
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
    }

    .assist-annotation-btn-delete {
      background: #dc2626;
      color: white;
      margin-right: auto;
    }

    .assist-annotation-btn-delete:hover {
      background: #b91c1c;
      box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3);
    }

    .assist-annotation-btn:focus {
      outline: 2px solid #3b82f6;
      outline-offset: 2px;
    }

    .assist-annotation-tag-help {
      margin: 8px 0 0;
      font-size: 12px;
      color: #6b7280;
      font-style: italic;
    }
  `;

  document.head.appendChild(style);
}

// ============================================================
// AUTO-INITIALIZATION
// ============================================================

// Self-initialize when script loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    injectStyles();
    initializeInlineAnnotations();
    registerFeature();
  });
} else {
  injectStyles();
  initializeInlineAnnotations();
  registerFeature();
}

/**
 * Register feature API with window.assistFeatures
 */
function registerFeature() {
  if (!window.assistFeatures) {
    window.assistFeatures = {};
  }

  window.assistFeatures.inlineAnnotations = {
    createInlineAnnotation,
    openAnnotationModal,
    deleteAnnotation,
    getPositionFromRange,
  };

  console.log('[InlineAnnotations] Feature API registered');
}

// Export for external use (highlight menu integration)
export { initializeInlineAnnotations, deleteAnnotation };
