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
import {
  applyAnnotationColor,
  labelHighlightGroup,
  unwrapHighlights,
  wrapRangeInHighlights,
} from './annotation-range.js';
import { describeRange, resolveAnchor } from './annotation-anchor.js';
import { Z } from '../../utils/z-index.js';
import { createTagInput } from './tag-manager.js';
import { sanitizeHTML } from '../../utils/sanitize.js';
import { attachAccessibleHandler, hasSelectionOver } from '../../utils/event-handlers.js';
import { showInfoTray } from '../../utils/action-tray.js';
import { trapFocus } from '../../utils/focus-trap.js';
import { returnFocusAfterDialog, selectionContainer } from '../../utils/dialog-return-focus.js';

/** @type {BaseStorageAdapter} Current storage adapter instance */
let storageAdapter = null;

/** @type {string} Current storage mode ('local' or 'indexeddb') */
let storageMode = 'local';

/** @type {Map<number, Array<HTMLElement>>} Map of annotation ID to highlight elements */
const activeAnnotations = new Map();

/**
 * Latest saved record per annotation ID. Highlight listeners read through this rather
 * than closing over the record they were attached with, so an edit is reflected by the
 * tooltip and the edit modal without re-attaching anything.
 * @type {Map<number, Object>}
 */
const annotationRecords = new Map();

/** @type {HTMLElement|null} Currently open modal */
let currentModal = null;

/** @type {Object|null} Currently editing annotation */
let currentEditingAnnotation = null;

/** @type {Range|null} Cloned range from selection — used directly for new annotation highlight, bypasses XPath recreation */
let pendingRange = null;

/** @type {Function|null} Releases the open modal's focus trap (restores focus to the opener) */
let releaseModalFocus = null;
/** Where focus goes when the dialog closes, when there is no opener left to return it to. */
let modalReturnFocus = null;

/** @type {boolean} True once Delete has been pressed once and is awaiting confirmation */
let deleteArmed = false;

/** @type {HTMLElement|null} The tooltip currently on screen (only ever one). */
let activeTooltip = null;

/** @type {HTMLElement|null} Highlight currently pointed at the tooltip by aria-describedby. */
let describedElement = null;

/** Id the single live tooltip carries, so a focused highlight can be described by it. */
const TOOLTIP_ID = 'assist-annotation-tooltip-live';

/** @type {number|string|null} Annotation the pointer is currently over. */
let hoveredAnnotationId = null;

/** @type {boolean} Whether Alt is held right now. */
let altHeld = false;

/** @type {boolean} Guards the one-time install of the document-level Alt listeners. */
let altListenersInstalled = false;

/** Class marking every span of the annotation Alt+click is about to delete. */
const DELETE_CUE_CLASS = 'assist-inline-annotation-delete-cue';

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

/**
 * Create a new inline annotation from text selection
 * @param {Object} options - Annotation options
 * @param {string} options.selectedText - Selected text
 * @param {Object} options.position - Position data (start/end offsets)
 * @param {string} [options.comment=''] - Comment text
 * @param {string} [options.color='yellow'] - Highlight color
 * @param {Array<string>} [options.tags=[]] - Tags for the annotation
 * @param {Array<HTMLElement>|null} [options.preInsertedSpans=null] - Spans already wrapped
 *   synchronously from the live Range; wired to the stored id instead of being re-created.
 * @returns {Promise<Object>} Created annotation data
 */
export async function createInlineAnnotation({
  selectedText,
  position,
  comment = '',
  color = 'yellow',
  tags = [],
  preInsertedSpans = null,
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

    if (preInsertedSpans && preInsertedSpans.length) {
      // Spans already in the DOM — just wire them up with the real ID
      preInsertedSpans.forEach(span => {
        span.dataset.annotationId = String(savedAnnotation.id);
        attachAnnotationListeners(span, savedAnnotation);
      });
      labelHighlightGroup(preInsertedSpans, comment);
      activeAnnotations.set(savedAnnotation.id, preInsertedSpans);
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
    // Nothing is deleted when this fails. The page may be mid-render, or may simply have
    // changed; the record stays in storage so it can anchor again when the text comes back.
    const anchored = resolveAnchor(annotation.position);
    if (!anchored) {
      console.warn(
        '[InlineAnnotations] Could not find the annotated text on this page; leaving',
        annotation.id,
        'stored but unanchored'
      );
      return;
    }
    const range = anchored.range;

    // Wrap the range in highlight spans — one per text run
    const highlightElements = highlightRange(range, annotation);
    if (highlightElements.length === 0) {
      console.warn('[InlineAnnotations] Range wrapped no text for annotation:', annotation.id);
      return;
    }

    // Store reference to highlight elements
    activeAnnotations.set(annotation.id, highlightElements);

    console.log(
      `[InlineAnnotations] Rendered annotation ${annotation.id} via ${anchored.strategy} anchor`
    );
  } catch (error) {
    console.error('[InlineAnnotations] Error rendering annotation:', error);
  }
}

/**
 * Insert the highlight spans synchronously from a live Range.
 * Must be called before any await so the Range is guaranteed valid.
 *
 * @param {Range} range - Live range from the selection.
 * @param {string} color - Palette name.
 * @param {string} comment - Comment, used for the accessible name.
 * @returns {Array<HTMLElement>} Spans in document order (empty when nothing was wrapped).
 */
function insertHighlightSpans(range, color, comment) {
  if (!range) {
    return [];
  }
  try {
    return wrapRangeInHighlights(range, { color, comment });
  } catch (error) {
    console.warn('[InlineAnnotations] insertHighlightSpans failed:', error);
    return [];
  }
}

/**
 * Highlight a range with annotation styling (restore-from-storage path)
 * @param {Range} range - Range to highlight
 * @param {Object} annotation - Annotation data
 * @returns {Array<HTMLElement>} Created highlight elements
 */
function highlightRange(range, annotation) {
  const highlightElements = wrapRangeInHighlights(range, {
    color: annotation.color,
    comment: annotation.comment,
    annotationId: annotation.id,
  });

  highlightElements.forEach(element => attachAnnotationListeners(element, annotation));

  return highlightElements;
}

/**
 * Spans belonging to one annotation, in document order.
 * @param {number|string} annotationId - Annotation ID.
 * @returns {Array<HTMLElement>} Its highlight spans (empty when it is not on the page).
 */
function spansFor(annotationId) {
  return activeAnnotations.get(annotationId) || [];
}

/**
 * Whether Alt+click on this annotation would actually delete it.
 *
 * The highlight opts into `allowTextSelection`, so activation is suppressed while a
 * selection intersects it - a click that merely finished a drag-select is not a click.
 * The cue asks the same question through the same helper, because a cue promising a
 * delete that will not happen is worse than no cue at all.
 *
 * @param {number|string} annotationId - Annotation ID.
 * @returns {boolean} True when the delete would fire.
 */
function deleteWouldFire(annotationId) {
  const spans = spansFor(annotationId);
  return spans.length > 0 && !spans.some(span => hasSelectionOver(span));
}

/**
 * Mark every span of an annotation as about to be deleted, or clear the marks.
 *
 * Every span, not just the hovered one: an annotation can run across two paragraphs, and
 * seeing the whole of it struck through is how the student knows how much text is going.
 *
 * @param {number|string|null} annotationId - Annotation to cue, or null to clear.
 */
function setDeleteCue(annotationId) {
  document
    .querySelectorAll('.' + DELETE_CUE_CLASS)
    .forEach(span => span.classList.remove(DELETE_CUE_CLASS));

  if (annotationId === null || annotationId === undefined) {
    return;
  }
  spansFor(annotationId).forEach(span => span.classList.add(DELETE_CUE_CLASS));
}

/**
 * Whether the pointer is over an annotation that is still on the page. A host page can
 * replace its content under us (SPA navigation), which detaches the spans without ever
 * firing mouseleave - and a stale hover must not make Alt behave differently.
 * @returns {boolean} True when the hovered annotation still has spans in the document.
 */
function hoveringLiveAnnotation() {
  return (
    hoveredAnnotationId !== null && spansFor(hoveredAnnotationId).some(span => span.isConnected)
  );
}

/** Re-evaluate the cue from the current hover and Alt state. */
function refreshDeleteCue() {
  const show = altHeld && hoveringLiveAnnotation() && deleteWouldFire(hoveredAnnotationId);
  setDeleteCue(show ? hoveredAnnotationId : null);
}

/** Forget that Alt is down and take the cue off. Used wherever a keyup may never arrive. */
function releaseAlt() {
  altHeld = false;
  setDeleteCue(null);
}

/**
 * Install the document-level Alt tracking once, for every annotation on the page.
 *
 * One shared pair of listeners rather than one per span: Alt is a single piece of global
 * state, and a page can carry dozens of annotations across hundreds of spans. Per-span
 * listeners would all fire for the same keystroke and would each need tearing down; this
 * pair is installed once and answers for all of them. The genuinely per-span listeners
 * (hover, activation, delete keys) stay per-span and die with the span when it is unwrapped.
 */
function installAltCueListeners() {
  if (altListenersInstalled) {
    return;
  }
  altListenersInstalled = true;

  document.addEventListener('keydown', e => {
    if (e.key !== 'Alt') {
      return;
    }
    altHeld = true;
    if (hoveringLiveAnnotation()) {
      // On Windows a bare Alt press-and-release moves focus to the browser menu bar, which
      // would pull focus off the page mid-gesture. Suppressed ONLY while the pointer is over
      // an annotation, so Alt keeps behaving normally everywhere else on the page.
      e.preventDefault();
    }
    refreshDeleteCue();
  });

  document.addEventListener('keyup', e => {
    if (e.key === 'Alt') {
      releaseAlt();
    }
  });

  // Alt+Tab is the trap: the keydown arrives, then the window loses focus and the keyup is
  // delivered to the next window, never to us. Without these two the cue would still be on
  // when the student came back, promising a delete they are no longer asking for.
  window.addEventListener('blur', releaseAlt);
  document.addEventListener('visibilitychange', releaseAlt);
}

/**
 * Attach event listeners to annotation highlight
 * @param {HTMLElement} element - Highlight element
 * @param {Object} annotation - Annotation data
 */
function attachAnnotationListeners(element, annotation) {
  annotationRecords.set(annotation.id, annotation);
  const current = () => annotationRecords.get(annotation.id) || annotation;
  installAltCueListeners();

  // Click/keyboard to edit (includes Enter/Space key support).
  // allowTextSelection keeps the highlighted words selectable and copyable - the text a
  // student most wants to lift into their notes - while a plain click still opens the editor.
  // enableVisualFeedback is off because its hover treatment is written for buttons: it sets
  // a scale transform (inert on an inline box) and forces cursor:pointer inline, which would
  // overrule the I-beam the stylesheet deliberately keeps on selectable text.
  attachAccessibleHandler(
    element,
    'Annotation Highlight',
    e => {
      // Alt+click is the one-action delete. Pointer path only: the same handler serves Enter
      // and Space, and Alt+Enter must not quietly become a delete.
      if (e?.altKey && e.type === 'click') {
        quickDeleteAnnotation(current());
        return;
      }
      openAnnotationModal(current());
    },
    { allowTextSelection: true, enableVisualFeedback: false }
  );

  // SC 2.1.1: the same one-action delete without a mouse. Enter and Space keep opening the
  // editor - they are handled by attachAccessibleHandler and never reach this listener.
  element.addEventListener('keydown', e => {
    // SC 1.4.13: content shown on focus must be dismissible without moving focus away.
    if (e.key === 'Escape' && activeTooltip) {
      hideTooltip();
      return;
    }
    if (e.key !== 'Delete' && e.key !== 'Backspace') {
      return;
    }
    // Backspace navigates the page back when nothing consumes it.
    e.preventDefault();
    e.stopPropagation();
    quickDeleteAnnotation(current());
  });

  element.addEventListener('mouseenter', e => {
    hoveredAnnotationId = annotation.id;
    showTooltip(current(), e.target);
    refreshDeleteCue();
  });

  element.addEventListener('mouseleave', () => {
    if (hoveredAnnotationId === annotation.id) {
      hoveredAnnotationId = null;
    }
    hideTooltip();
    setDeleteCue(null);
  });

  // The tooltip carries the delete hint, and a keyboard user cannot hover. Showing it on
  // focus too - and describing the highlight with it - is what stops the shortcut being
  // knowledge only a mouse user can reach.
  element.addEventListener('focus', e => showTooltip(current(), e.target, element));
  element.addEventListener('blur', hideTooltip);
}

/**
 * Show the hover tooltip for an annotation, replacing any tooltip already up.
 * @param {Object} annotation - Annotation data.
 * @param {HTMLElement} target - Element to position against.
 */
function showTooltip(annotation, target, describes = null) {
  hideTooltip();
  activeTooltip = createTooltip(annotation, target);
  activeTooltip.id = TOOLTIP_ID;
  document.body.appendChild(activeTooltip);

  // Only the focus path describes: on hover there is nothing listening for a description,
  // and a permanent aria-describedby would read the hint out on every annotation.
  if (describes) {
    describedElement = describes;
    describes.setAttribute('aria-describedby', TOOLTIP_ID);
  }
}

/**
 * Take the tooltip down. Called from mouseleave, and from the delete path, where the span
 * the tooltip is pointing at is about to stop existing.
 */
function hideTooltip() {
  if (describedElement) {
    describedElement.removeAttribute('aria-describedby');
    describedElement = null;
  }
  if (activeTooltip) {
    activeTooltip.remove();
    activeTooltip = null;
  }
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
  tooltip.setAttribute('role', 'tooltip');

  const comment = document.createElement('div');
  comment.className = 'assist-annotation-tooltip-comment';
  comment.textContent = annotation.comment || 'No comment';
  tooltip.appendChild(comment);

  // Alt+click is invisible, so it is named here, quietly, under the comment - which stays the
  // primary content. The keyboard route is named beside it so it is not mouse-only knowledge.
  const hint = document.createElement('div');
  hint.className = 'assist-annotation-tooltip-hint';
  hint.textContent = 'Alt+click, or press Delete, to remove';
  tooltip.appendChild(hint);

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

/**
 * Delete an annotation in one action, offering Undo instead of asking first.
 *
 * The old route was three actions to undo one: click the highlight, press Delete, press
 * Confirm delete. For a student who highlights heavily that is a tax on every mistake, so
 * the delete happens immediately and the tray carries the way back. The tray is a live
 * region, so the deletion is announced and not only seen.
 *
 * @param {Object} annotation - The annotation to remove.
 */
async function quickDeleteAnnotation(annotation) {
  if (!annotation) {
    return;
  }

  // Snapshot BEFORE the delete: everything Undo needs to build the annotation again.
  const { selectedText, position, comment, color, tags } = annotation;

  try {
    await deleteAnnotation(annotation.id);
  } catch (error) {
    console.error('[InlineAnnotations] Quick delete failed:', error);
    showInfoTray({
      message: 'Could not delete that annotation. It is still here.',
      variant: 'error',
    });
    return;
  }

  showInfoTray({
    message: 'Annotation deleted',
    actionLabel: 'Undo',
    onAction: () => restoreAnnotation({ selectedText, position, comment, color, tags }),
    duration: 8000,
  });
}

/**
 * Put a just-deleted annotation back: the stored record and its highlight spans.
 *
 * Goes through createInlineAnnotation, the same path that stores an annotation and re-wraps
 * it from its stored position, so Undo cannot drift from ordinary rendering. The record
 * comes back with a fresh id (both adapters mint their own); everything the student can see
 * - the text, the comment, the colour, the tags - is restored exactly.
 *
 * @param {Object} snapshot - The deleted annotation's restorable fields.
 */
async function restoreAnnotation(snapshot) {
  try {
    const restored = await createInlineAnnotation(snapshot);
    // Land focus on the annotation that just came back, so a keyboard user who pressed Undo
    // is standing on it rather than back at the top of the page (SC 2.4.3).
    spansFor(restored.id)[0]?.focus();
  } catch (error) {
    console.error('[InlineAnnotations] Undo failed:', error);
    showInfoTray({ message: 'Could not bring that annotation back.', variant: 'error' });
  }
}

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
    closeAnnotationModal();
  }

  currentEditingAnnotation = annotation;
  pendingRange = savedRange;
  deleteArmed = false;

  // The highlight menu that opened this dialog activates on mousedown and is removed before the
  // dialog exists, so the focus trap has nothing to restore to and focus was landing on <body>.
  // Cancel and Escape put it back on the student's own text instead (SC 2.4.3).
  modalReturnFocus = annotation
    ? spansFor(annotation.id)[0] || null
    : selectionContainer(savedRange);

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
      <p id="annotation-modal-status" class="assist-annotation-status" role="status" aria-live="polite"></p>
      <div class="assist-annotation-modal-footer">
        ${isEdit ? '<button class="assist-annotation-btn assist-annotation-btn-delete">Delete</button>' : ''}
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

  attachAccessibleHandler(closeBtn, 'Annotation Modal Close', () => closeAnnotationModal());
  attachAccessibleHandler(cancelBtn, 'Annotation Modal Cancel', () => closeAnnotationModal());
  attachAccessibleHandler(saveBtn, 'Annotation Modal Save', () =>
    saveAnnotationFromModal(selectedText, position, tagInput, selectedColor)
  );

  if (deleteBtn) {
    attachAccessibleHandler(deleteBtn, 'Annotation Modal Delete', () =>
      deleteAnnotationFromModal(deleteBtn)
    );
  }

  // Close on overlay click
  modal.addEventListener('click', e => {
    if (e.target === modal) {
      closeAnnotationModal();
    }
  });

  // Color picker handlers — track in closure var, not DOM class (DOM query unreliable on mousedown)
  let selectedColor = annotation?.color || 'yellow';
  const colorOptions = modal.querySelectorAll('.assist-annotation-color-option');
  colorOptions.forEach(option => {
    attachAccessibleHandler(option, 'Annotation Color', () => {
      colorOptions.forEach(opt => opt.classList.remove('selected'));
      option.classList.add('selected');
      selectedColor = option.dataset.color;
    });
  });

  document.body.appendChild(modal);
  currentModal = modal;

  // aria-modal="true" is a promise to assistive technology that the rest of the page is
  // unavailable. Without a trap, Tab walked out into the page behind and Escape — bound to
  // the modal — stopped working, which is a keyboard trap (SC 2.1.2). The shared trap also
  // returns focus to whatever opened the dialog on release (SC 2.4.3).
  releaseModalFocus = trapFocus(modal, {
    onEscape: () => closeAnnotationModal(),
    initialFocus: modal.querySelector('#annotation-comment'),
  });

  console.log('[InlineAnnotations] Modal opened');
}

/**
 * Announce a message in the modal's live region, where it sits inside the focus trap
 * next to the controls it is about — rather than a blocking alert()/confirm().
 * @param {string} message - Text to announce, or '' to clear.
 */
function setModalStatus(message) {
  const status = currentModal?.querySelector('#annotation-modal-status');
  if (status) {
    status.textContent = message;
  }
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
  // Release before removing: the trap restores focus to the element that opened the dialog,
  // which must happen while there is still something to move focus away from.
  if (releaseModalFocus) {
    releaseModalFocus();
    releaseModalFocus = null;
  }
  if (currentModal) {
    currentModal.remove();
    currentModal = null;
  }
  currentEditingAnnotation = null;
  pendingRange = null;
  deleteArmed = false;
  returnFocusAfterDialog(modalReturnFocus);
  modalReturnFocus = null;
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

  // Wrap the highlight SYNCHRONOUSLY too, for the same reason: async DOM mutation
  // invalidates the Range, so nothing may be awaited before it is consumed.
  const spans = currentEditingAnnotation
    ? null
    : insertHighlightSpans(rangeSnapshot, color, comment);

  try {
    if (currentEditingAnnotation) {
      await storageAdapter.update(currentEditingAnnotation.id, { comment, color, tags });
      const updated = { ...currentEditingAnnotation, comment, color, tags };
      annotationRecords.set(updated.id, updated);
      const elements = activeAnnotations.get(updated.id);
      if (elements) {
        elements.forEach(el => applyAnnotationColor(el, color));
        labelHighlightGroup(elements, comment);
      }
      console.log('[InlineAnnotations] Updated annotation:', currentEditingAnnotation.id);
      closeAnnotationModal();
    } else {
      await createInlineAnnotation({
        selectedText,
        position,
        comment,
        color,
        tags,
        preInsertedSpans: spans,
      });
      console.log('[InlineAnnotations] Created new annotation');
      closeAnnotationModal();
      // The menu that opened the dialog is gone by now, so the trap has nowhere to put
      // focus back. Land it on the annotation the student just made instead (SC 2.4.3).
      spans?.[0]?.focus();
    }
  } catch (error) {
    console.error('[InlineAnnotations] Error saving annotation:', error);
    // The storage write failed, so the highlight it belongs to must not stay on the page.
    unwrapHighlights(spans || []);
    setModalStatus('Could not save your annotation. Your comment is still here — try Save again.');
  }
}

/**
 * Delete annotation from modal.
 *
 * Deleting is irreversible, so it is confirmed — but a native confirm() is a separate
 * window a screen reader has to be chased into and a keyboard user cannot reach from the
 * trapped dialog. Instead the Delete button arms itself: the first press turns it into
 * "Confirm delete" and announces what will happen in the modal's live region; the second
 * press deletes. Cancel, Close and Escape all disarm it, and so does closing the dialog.
 *
 * @param {HTMLElement} deleteBtn - The Delete button, whose label doubles as the state.
 */
async function deleteAnnotationFromModal(deleteBtn) {
  if (!currentEditingAnnotation) {
    return;
  }

  if (!deleteArmed) {
    deleteArmed = true;
    deleteBtn.textContent = 'Confirm delete';
    deleteBtn.classList.add('assist-annotation-btn-delete-armed');
    setModalStatus(
      'Press Confirm delete to remove this annotation for good, or Cancel to keep it.'
    );
    deleteBtn.focus();
    return;
  }

  try {
    await deleteAnnotation(currentEditingAnnotation.id);
    closeAnnotationModal();
  } catch (error) {
    console.error('[InlineAnnotations] Error deleting annotation:', error);
    deleteArmed = false;
    deleteBtn.textContent = 'Delete';
    deleteBtn.classList.remove('assist-annotation-btn-delete-armed');
    setModalStatus('Could not delete this annotation. It is still here — try again.');
  }
}

/**
 * Delete an annotation
 * @param {number} annotationId - Annotation ID
 */
async function deleteAnnotation(annotationId) {
  try {
    // Whatever route the delete came in by, the hover state must not outlive the spans:
    // a tooltip pointing at text that no longer exists is left floating on the page.
    hideTooltip();
    setDeleteCue(null);
    if (hoveredAnnotationId === annotationId) {
      hoveredAnnotationId = null;
    }

    // Remove from storage
    await storageAdapter.delete(annotationId);

    // Remove from DOM — every span of the annotation, text lifted back into the page
    const elements = activeAnnotations.get(annotationId);
    if (elements) {
      unwrapHighlights(elements);
      activeAnnotations.delete(annotationId);
    }
    annotationRecords.delete(annotationId);

    console.log('[InlineAnnotations] Deleted annotation:', annotationId);
  } catch (error) {
    console.error('[InlineAnnotations] Error deleting annotation:', error);
    throw error;
  }
}

/**
 * Describe a selection so the annotation can be found again on a later visit.
 *
 * The public name the highlight menu calls. The record it returns carries the quote and
 * text-position selectors alongside the original offsets and XPath, so an annotation saved
 * today survives the page being restructured, and one saved before this existed still reads.
 *
 * @param {Range} range - Range object.
 * @returns {Object|null} Position data, or null for a selection covering no text.
 */
export function getPositionFromRange(range) {
  return describeRange(range);
}

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
    hideTooltip();
    hoveredAnnotationId = null;
    releaseAlt();
    activeAnnotations.forEach(elements => unwrapHighlights(elements));
    activeAnnotations.clear();
    annotationRecords.clear();
    loadAnnotationsForCurrentPage();
  }
}

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
    /*
     * No cursor: pointer. These are words in the page, not a button: the student is meant
     * to be able to select and copy their own highlighted text, and the I-beam is what says
     * so. A pointer would promise a link and hide the selection affordance; the highlight is
     * still activatable, which role="mark", the focus ring and the tooltip already convey.
     */
    .assist-inline-annotation {
      position: relative;
      border-radius: 2px;
      transition: filter 0.2s;
    }

    .assist-inline-annotation:hover {
      filter: brightness(0.9);
    }

    .assist-inline-annotation:focus {
      outline: 2px solid #1d4ed8;
      outline-offset: 2px;
    }

    /*
     * The Alt-held delete cue: what Alt+click is about to remove, shown on EVERY span of the
     * annotation so a highlight running across two paragraphs shows its full extent.
     * line-through and the dashed outline are both shape, not colour (SC 1.4.1): struck-through
     * text reads as "this is going away" with no legend to learn, and both survive
     * forced-colors, where the fill and underline are already replaced by Mark/MarkText.
     * Deliberately NOT dimmed with opacity - the words underneath are what the student is
     * reading, and fading them would cost contrast in the state where it matters most.
     */
    .assist-inline-annotation-delete-cue {
      text-decoration: line-through;
      text-decoration-thickness: 2px;
      outline: 2px dashed currentColor;
      outline-offset: 1px;
    }

    @media (prefers-reduced-motion: reduce) {
      .assist-inline-annotation {
        transition: none;
      }
      .assist-annotation-tooltip {
        animation: none;
      }
    }

    @media (forced-colors: active) {
      .assist-inline-annotation-delete-cue {
        text-decoration: line-through;
        outline: 2px dashed MarkText;
      }
    }

    /*
     * The comment is the primary content; the hint sits under it, quieter and smaller, and
     * still clears 4.5:1 against the tooltip's #374151 ground.
     */
    .assist-annotation-tooltip-hint {
      margin-top: 4px;
      font-size: 12px;
      color: #d1d5db;
    }

    /*
     * High contrast mode discards the inline fill and underline, which would leave an
     * annotation with no visible trace at all. Mark/MarkText are the system colours the
     * platform reserves for highlighted text, which is exactly what role="mark" is.
     * The fill and underline are set per-annotation as inline styles, and a style
     * attribute outranks a normal rule in this sheet — so these must be !important to
     * land at all.
     */
    @media (forced-colors: active) {
      .assist-inline-annotation {
        forced-color-adjust: none;
        background-color: Mark !important;
        color: MarkText !important;
        border-bottom: 3px solid MarkText !important;
      }
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
      z-index: ${Z.MODAL};
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

    /*
     * The dialog itself does not scroll: its body does. It used to be one scrolling block, so
     * at 1280x800 the footer sat on the bottom edge under a horizontal scrollbar. And every
     * control in here measures its own padding and border - the comment box and the tag input
     * are width:100% with 12px of padding and a 2px border, which without box-sizing made each
     * of them 28px wider than the space it had and pushed "Add tags" off the right edge.
     */
    .assist-annotation-modal,
    .assist-annotation-modal * {
      box-sizing: border-box;
    }

    .assist-annotation-modal {
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
      width: 90%;
      max-width: 500px;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
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
      overflow-y: auto;
      overflow-x: hidden;
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

    /* Wrapping, so five 44px targets never widen the dialog on a narrow screen. */
    .assist-annotation-color-picker {
      display: flex;
      flex-wrap: wrap;
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

    /*
     * Empty until something needs saying, so it takes no room and announces nothing until
     * then. It is inside the dialog, above the buttons it talks about.
     */
    .assist-annotation-status {
      margin: 0;
      padding: 0 24px;
      color: #b91c1c;
      font-size: 14px;
      line-height: 1.5;
    }

    .assist-annotation-status:not(:empty) {
      padding-bottom: 12px;
    }

    .assist-annotation-modal-footer {
      padding: 16px 24px;
      border-top: 1px solid #e5e7eb;
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      justify-content: flex-end;
      flex-shrink: 0;
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

    /* Armed for confirmation — the changed wording carries the meaning, not the outline. */
    .assist-annotation-btn-delete-armed {
      background: #991b1b;
      outline: 3px solid #991b1b;
      outline-offset: 2px;
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

    @media (prefers-reduced-motion: reduce) {
      .assist-inline-annotation,
      .assist-annotation-tooltip,
      .assist-annotation-modal-overlay,
      .assist-annotation-modal {
        transition: none;
        animation: none;
      }
    }
  `;

  document.head.appendChild(style);
}

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
