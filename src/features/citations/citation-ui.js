/**
 * Citation UI Module
 *
 * Provides UI components for citation management:
 * - Citation edit modal
 * - Success/error toast notifications
 * - Citation preview
 *
 * Follows WCAG 2.2 Level AA guidelines
 * Integrates with CitationStorage and Harvard formatter
 */

import { validateCitation } from './citation-model.js';
import { Z } from '../../utils/z-index.js';
import { formatReference } from './citation-formatter.js';
import { sanitizeHTML } from '../../utils/sanitize.js';
import { attachInteractiveHandler } from '../../utils/event-handlers.js';
import { UI_TYPE_OPTIONS, normalizeType } from './citation-types.js';
import { trapFocus } from './citation-focus-trap.js';

/**
 * Inject the shared citation modal stylesheet into <head> once.
 * Guards by id="citation-modal-styles".
 * Z.MODAL === 100400 (from src/utils/z-index.js)
 */
function injectModalStyles() {
  if (document.getElementById('citation-modal-styles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'citation-modal-styles';
  // NOTE: Z.MODAL = 100400 — value read from imported constant and inlined below.
  style.textContent = `
    /* -----------------------------------------------------------------------
       Citation modal — scoped under .citation-modal-overlay
       ----------------------------------------------------------------------- */

    .citation-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.65);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: ${Z.MODAL};
      padding: 16px;
      box-sizing: border-box;
    }

    .citation-modal {
      background: #ffffff;
      border-radius: 10px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.28);
      width: 100%;
      max-width: 560px;
      max-height: 85vh;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 15px;
      line-height: 1.6;
      color: #1a1a1a;
    }

    .citation-modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 24px 16px;
      border-bottom: 1px solid #d0d0d0;
      flex-shrink: 0;
    }

    .citation-modal-header h2 {
      margin: 0;
      font-size: 19px;
      font-weight: 700;
      color: #111;
    }

    .citation-modal-close {
      background: transparent;
      border: 2px solid transparent;
      border-radius: 6px;
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
      padding: 6px 8px;
      color: #555;
      min-width: 44px;
      min-height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .citation-modal-close:hover {
      background: #f0f0f0;
      color: #111;
    }

    .citation-modal-close:focus-visible {
      outline: 2px solid #0055d4;
      outline-offset: 2px;
    }

    .citation-modal-body {
      padding: 20px 24px;
      flex: 1 1 auto;
      overflow-y: auto;
    }

    .citation-modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      padding: 16px 24px 20px;
      border-top: 1px solid #d0d0d0;
      flex-shrink: 0;
    }

    /* Form groups: label above input, generous spacing */
    .citation-modal-body .form-group {
      display: block;
      margin-bottom: 18px;
    }

    .citation-modal-body .form-group label {
      display: block;
      font-weight: 600;
      margin-bottom: 6px;
      color: #2a2a2a;
      font-size: 14px;
    }

    /* Two-column row on wider screens, stacks on narrow */
    .citation-modal-body .form-row {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }

    .citation-modal-body .form-row .form-group {
      flex: 1 1 200px;
      min-width: 0;
    }

    /* Input / select / textarea */
    .citation-modal-body input,
    .citation-modal-body select,
    .citation-modal-body textarea {
      display: block;
      width: 100%;
      box-sizing: border-box;
      padding: 10px 12px;
      border: 1.5px solid #aaa;
      border-radius: 6px;
      font-size: 14px;
      font-family: inherit;
      line-height: 1.5;
      color: #1a1a1a;
      background: #fff;
    }

    .citation-modal-body input:focus,
    .citation-modal-body select:focus,
    .citation-modal-body textarea:focus {
      outline: 2px solid #0055d4;
      outline-offset: 2px;
      border-color: #0055d4;
    }

    .citation-modal-body textarea {
      resize: vertical;
      min-height: 80px;
    }

    /* Buttons */
    .btn-cancel,
    .btn-save {
      min-width: 44px;
      min-height: 44px;
      padding: 10px 22px;
      border-radius: 7px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      border: 2px solid transparent;
    }

    .btn-cancel {
      background: #f4f4f4;
      color: #333;
      border-color: #ccc;
    }

    .btn-cancel:hover {
      background: #e8e8e8;
    }

    .btn-cancel:focus-visible {
      outline: 2px solid #0055d4;
      outline-offset: 2px;
    }

    .btn-save {
      background: #0055d4;
      color: #fff;
      border-color: #0055d4;
    }

    .btn-save:hover {
      background: #0044aa;
    }

    .btn-save:focus-visible {
      outline: 2px solid #000;
      outline-offset: 2px;
    }

    /* Citation preview panel */
    .citation-preview {
      background: #f7f7f9;
      border: 1px solid #ddd;
      border-radius: 6px;
      padding: 14px 16px;
      margin-top: 20px;
      font-size: 13px;
    }

    .citation-preview strong {
      display: block;
      margin-bottom: 8px;
      color: #333;
    }

    .preview-text {
      color: #555;
      line-height: 1.7;
      font-style: italic;
    }

    /* Toast show state — shared rule, injected once alongside modal styles */
    .citation-toast.show {
      opacity: 1 !important;
      transform: translateY(0) !important;
    }

    /* -----------------------------------------------------------------------
       Reduced-motion: strip all transitions
       ----------------------------------------------------------------------- */
    @media (prefers-reduced-motion: reduce) {
      .citation-modal,
      .citation-toast {
        transition: none !important;
      }
    }

    /* -----------------------------------------------------------------------
       High-contrast: thicker borders and outlines
       ----------------------------------------------------------------------- */
    @media (prefers-contrast: high) {
      .citation-modal {
        border: 3px solid #000;
      }

      .citation-modal-body input,
      .citation-modal-body select,
      .citation-modal-body textarea {
        border: 2px solid #000;
      }

      .citation-modal-body input:focus,
      .citation-modal-body select:focus,
      .citation-modal-body textarea:focus {
        outline: 3px solid #000;
        outline-offset: 2px;
      }

      .btn-cancel,
      .btn-save {
        border-width: 3px;
      }

      .btn-cancel:focus-visible,
      .btn-save:focus-visible,
      .citation-modal-close:focus-visible {
        outline: 3px solid #000;
        outline-offset: 2px;
      }
    }
  `;

  document.head.appendChild(style);
}

/**
 * Show success toast notification
 * @param {string} message - Success message
 * @param {number} duration - Display duration in ms (default 3000)
 */
export function showSuccessToast(message, duration = 3000) {
  const toast = createToast(message, 'success');
  document.body.appendChild(toast);

  // Trigger animation
  setTimeout(() => toast.classList.add('show'), 10);

  // Auto-hide after duration
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Show error toast notification
 * @param {string} message - Error message
 * @param {number} duration - Display duration in ms (default 4000)
 */
export function showErrorToast(message, duration = 4000) {
  const toast = createToast(message, 'error');
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 10);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Create toast element.
 * The `.citation-toast.show` transition rule is part of the shared
 * citation-modal-styles stylesheet (injected once). No extra <style>
 * is appended here.
 * @param {string} message
 * @param {string} type - 'success' or 'error'
 * @returns {HTMLElement}
 */
function createToast(message, type) {
  // Ensure shared styles (including toast .show rule) are present.
  injectModalStyles();

  const toast = document.createElement('div');
  toast.className = `citation-toast citation-toast-${type}`;
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'polite');

  const icon = type === 'success' ? '✓' : '✕';
  const bgColor = type === 'success' ? '#4caf50' : '#f44336';

  toast.innerHTML = sanitizeHTML(`
    <span class="citation-toast-icon">${icon}</span>
    <span class="citation-toast-message">${message}</span>
  `);

  // Inline styles for toast (self-contained — no external CSS dependency
  // beyond the .show rule above).
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    backgroundColor: bgColor,
    color: 'white',
    padding: '12px 20px',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '14px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    zIndex: String(Z.TOAST),
    opacity: '0',
    transform: 'translateY(20px)',
    transition: 'all 0.3s ease',
    maxWidth: '400px',
  });

  return toast;
}

/**
 * Show citation edit modal.
 *
 * Pass `citationData` with `_isEdit: true` to show "Edit Citation" in the
 * title, or with `_isEdit: false` (or omit it / pass null) for "Save Citation".
 * The flag is stripped before the resolved data reaches the caller.
 *
 * @param {Object|null} citationData - Initial citation data (or null for new)
 * @returns {Promise<Object|null>} - Edited citation data or null if cancelled
 */
export async function showCitationEditModal(citationData = null) {
  return new Promise(resolve => {
    const modal = createCitationModal(citationData, resolve);
    document.body.appendChild(modal);
    // trapFocus moves initial focus and restores it on release.
    // The release fn is stored on the overlay so createCitationModal
    // close paths can reach it via modal._releaseFocusTrap().
    modal._releaseFocusTrap = trapFocus(modal, {
      onEscape: () => {
        if (modal._releaseFocusTrap) {
          modal._releaseFocusTrap();
        }
        modal.remove();
        resolve(null);
      },
    });
  });
}

/**
 * Build the <option> elements string for the type <select>, with the
 * canonical value matching the citation's current (normalised) type
 * pre-selected.
 * @param {string} currentType - raw type from citation data
 * @returns {string} safe HTML string (values are from UI_TYPE_OPTIONS — no user input)
 */
function buildTypeOptions(currentType) {
  const canonical = normalizeType(currentType || '');
  return UI_TYPE_OPTIONS.map(({ value, label }) => {
    const selected = value === canonical ? ' selected' : '';
    // value and label come from the frozen UI_TYPE_OPTIONS constant — no
    // user-supplied content, so direct interpolation is safe here.
    return `<option value="${value}"${selected}>${label}</option>`;
  }).join('\n                ');
}

/**
 * Create citation edit modal DOM.
 * @param {Object|null} citationData - Initial data; may carry `_isEdit` flag
 * @param {Function} onClose - Callback when modal closes
 * @returns {HTMLElement}
 */
function createCitationModal(citationData, onClose) {
  // Inject shared stylesheet (guarded — no-op if already present).
  injectModalStyles();

  const overlay = document.createElement('div');
  overlay.className = 'citation-modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'citation-modal-title');

  // Determine whether this is an edit (existing citation) or a new save.
  // Callers may set `_isEdit: true` explicitly; otherwise we treat any
  // data object that already carries an `id` as an existing record.
  const isEdit =
    citationData !== null && (citationData._isEdit === true || Boolean(citationData.id));
  const data = citationData || {};

  overlay.innerHTML = sanitizeHTML(`
    <div class="citation-modal">
      <div class="citation-modal-header">
        <h2 id="citation-modal-title">${isEdit ? 'Edit' : 'Save'} Citation</h2>
        <button class="citation-modal-close" aria-label="Close modal">✕</button>
      </div>

      <div class="citation-modal-body">
        <form id="citation-form">
          <div class="form-group">
            <label for="citation-title">Title *</label>
            <input
              type="text"
              id="citation-title"
              name="title"
              value="${escapeHTML(data.title || '')}"
              required
              aria-required="true"
            />
          </div>

          <div class="form-group">
            <label for="citation-authors">Authors * (one per author, separated by semicolons)</label>
            <input
              type="text"
              id="citation-authors"
              name="authors"
              value="${escapeHTML((data.authors || []).join('; '))}"
              required
              aria-required="true"
              placeholder="Piwowar, Heather A.; Day, Roger S."
            />
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="citation-date">Publication Date</label>
              <input
                type="date"
                id="citation-date"
                name="publicationDate"
                value="${escapeHTML(data.publicationDate || '')}"
              />
            </div>

            <div class="form-group">
              <label for="citation-type">Type</label>
              <select id="citation-type" name="type">
                ${buildTypeOptions(data.type)}
              </select>
            </div>
          </div>

          <div class="form-group">
            <label for="citation-publisher">Publisher / Site Name</label>
            <input
              type="text"
              id="citation-publisher"
              name="publisher"
              value="${escapeHTML(data.publisher || '')}"
            />
          </div>

          <div class="form-group">
            <label for="citation-url">URL *</label>
            <input
              type="url"
              id="citation-url"
              name="url"
              value="${escapeHTML(data.url || '')}"
              required
              aria-required="true"
            />
          </div>

          <div class="form-group">
            <label for="citation-doi">DOI</label>
            <input
              type="text"
              id="citation-doi"
              name="doi"
              value="${escapeHTML(data.doi || '')}"
              placeholder="10.1000/xyz123"
            />
          </div>

          <div class="form-group">
            <label for="citation-tags">Tags (comma-separated)</label>
            <input
              type="text"
              id="citation-tags"
              name="tags"
              value="${escapeHTML((data.tags || []).join(', '))}"
              placeholder="research, education, psychology"
            />
          </div>

          <div class="form-group">
            <label for="citation-notes">Notes</label>
            <textarea
              id="citation-notes"
              name="notes"
              rows="3"
              placeholder="Add personal notes about this source..."
            >${escapeHTML(data.notes || '')}</textarea>
          </div>

          <div class="citation-preview">
            <strong>Harvard Citation Preview:</strong>
            <div id="citation-preview-text" class="preview-text">
              Enter citation details to see preview
            </div>
          </div>
        </form>
      </div>

      <div class="citation-modal-footer">
        <button type="button" class="btn-cancel">Cancel</button>
        <button type="submit" class="btn-save">Save Citation</button>
      </div>
    </div>
  `);

  // Event handlers
  const form = overlay.querySelector('#citation-form');
  const closeBtn = overlay.querySelector('.citation-modal-close');
  const cancelBtn = overlay.querySelector('.btn-cancel');
  const saveBtn = overlay.querySelector('.btn-save');

  // Update preview on input
  form.addEventListener('input', () => {
    updateCitationPreview(form);
  });

  // Initial preview
  setTimeout(() => updateCitationPreview(form), 100);

  // Close handlers
  const handleClose = () => {
    if (overlay._releaseFocusTrap) {
      overlay._releaseFocusTrap();
    }
    overlay.remove();
    onClose(null);
  };

  attachInteractiveHandler(closeBtn, 'Citation Close Button', handleClose);
  attachInteractiveHandler(cancelBtn, 'Citation Cancel Button', handleClose);
  overlay.addEventListener('click', e => {
    if (e.target === overlay) {
      handleClose();
    }
  });

  // Save handler — strip internal `_isEdit` flag before resolving
  attachInteractiveHandler(saveBtn, 'Citation Save Button', async () => {
    const formData = getFormData(form);
    const validation = validateCitation(formData);

    if (!validation.valid) {
      showErrorToast(`Invalid citation: ${validation.errors.join(', ')}`);
      return;
    }

    if (overlay._releaseFocusTrap) {
      overlay._releaseFocusTrap();
    }
    overlay.remove();
    onClose(formData);
  });

  // ESC is handled by trapFocus onEscape (set in showCitationEditModal).
  // No document-level keydown listener needed here.

  return overlay;
}

/**
 * Get form data as citation object
 * @param {HTMLFormElement} form
 * @returns {Object}
 */
function getFormData(form) {
  // Read by element id, NOT via FormData/name. DOMPurify's DOM-clobbering protection strips
  // `name="title"` from the sanitised modal markup (it collides with document.title/form.title),
  // so a name-based FormData read silently drops the title and validation fails even when the
  // field is filled. Ids (citation-*) are not clobbering names and are preserved.
  const value = id => {
    const el = form.querySelector(`#${id}`);
    return el ? el.value.trim() : '';
  };
  const splitList = (str, sep) =>
    str
      .split(sep)
      .map(s => s.trim())
      .filter(s => s.length > 0);

  return {
    title: value('citation-title'),
    // Authors are semicolon-separated so "Last, First" names (CrossRef/Highwire) aren't split
    // on the comma inside a single name.
    authors: splitList(value('citation-authors'), ';'),
    publicationDate: value('citation-date'),
    type: value('citation-type'),
    publisher: value('citation-publisher'),
    url: value('citation-url'),
    doi: value('citation-doi'),
    tags: splitList(value('citation-tags'), ','),
    notes: value('citation-notes'),
    accessDate: new Date().toISOString().split('T')[0],
  };
}

/**
 * Update citation preview in modal
 * @param {HTMLFormElement} form
 */
function updateCitationPreview(form) {
  const previewEl = form.querySelector('#citation-preview-text');
  const data = getFormData(form);

  if (!data.title || !data.authors || data.authors.length === 0) {
    previewEl.textContent = 'Enter citation details to see preview';
    return;
  }

  try {
    const formatted = formatReference(data);
    previewEl.textContent = formatted;
  } catch {
    previewEl.textContent = 'Unable to generate preview';
  }
}

/**
 * Escape HTML to prevent XSS
 * @param {string} str
 * @returns {string}
 */
function escapeHTML(str) {
  if (!str) {
    return '';
  }
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export default {
  showSuccessToast,
  showErrorToast,
  showCitationEditModal,
};
