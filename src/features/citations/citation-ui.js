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
import { formatReference } from './citation-formatter.js';

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
 * Create toast element
 * @param {string} message
 * @param {string} type - 'success' or 'error'
 * @returns {HTMLElement}
 */
function createToast(message, type) {
  const toast = document.createElement('div');
  toast.className = `citation-toast citation-toast-${type}`;
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'polite');

  const icon = type === 'success' ? '✓' : '✕';
  const bgColor = type === 'success' ? '#4caf50' : '#f44336';

  toast.innerHTML = `
    <span class="citation-toast-icon">${icon}</span>
    <span class="citation-toast-message">${message}</span>
  `;

  // Inline styles for toast (no external CSS dependency)
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
    zIndex: '999999',
    opacity: '0',
    transform: 'translateY(20px)',
    transition: 'all 0.3s ease',
    maxWidth: '400px',
  });

  // Add show class styles
  const style = document.createElement('style');
  style.textContent = `
    .citation-toast.show {
      opacity: 1 !important;
      transform: translateY(0) !important;
    }
  `;
  document.head.appendChild(style);

  return toast;
}

/**
 * Show citation edit modal
 * @param {Object} citationData - Initial citation data (or null for new)
 * @returns {Promise<Object|null>} - Edited citation data or null if cancelled
 */
export async function showCitationEditModal(citationData = null) {
  return new Promise(resolve => {
    const modal = createCitationModal(citationData, resolve);
    document.body.appendChild(modal);

    // Focus first input
    setTimeout(() => {
      modal.querySelector('input')?.focus();
    }, 100);
  });
}

/**
 * Create citation edit modal
 * @param {Object} citationData - Initial data
 * @param {Function} onClose - Callback when modal closes
 * @returns {HTMLElement}
 */
function createCitationModal(citationData, onClose) {
  const overlay = document.createElement('div');
  overlay.className = 'citation-modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'citation-modal-title');

  const isEdit = citationData !== null;
  const data = citationData || {};

  overlay.innerHTML = `
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
            <label for="citation-authors">Authors * (comma-separated)</label>
            <input
              type="text"
              id="citation-authors"
              name="authors"
              value="${escapeHTML((data.authors || []).join(', '))}"
              required
              aria-required="true"
              placeholder="Smith, John, Doe, Jane"
            />
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="citation-date">Publication Date</label>
              <input
                type="date"
                id="citation-date"
                name="publicationDate"
                value="${data.publicationDate || ''}"
              />
            </div>

            <div class="form-group">
              <label for="citation-type">Type</label>
              <select id="citation-type" name="type">
                <option value="webpage" ${data.type === 'webpage' ? 'selected' : ''}>Web Page</option>
                <option value="journal" ${data.type === 'journal' ? 'selected' : ''}>Journal Article</option>
                <option value="book" ${data.type === 'book' ? 'selected' : ''}>Book</option>
                <option value="bookSection" ${data.type === 'bookSection' ? 'selected' : ''}>Book Chapter</option>
                <option value="conferencePaper" ${data.type === 'conferencePaper' ? 'selected' : ''}>Conference Paper</option>
                <option value="report" ${data.type === 'report' ? 'selected' : ''}>Report</option>
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
  `;

  // Apply styles
  applyCitationModalStyles(overlay);

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
    overlay.remove();
    onClose(null);
  };

  closeBtn.addEventListener('click', handleClose);
  cancelBtn.addEventListener('click', handleClose);
  overlay.addEventListener('click', e => {
    if (e.target === overlay) {
      handleClose();
    }
  });

  // Save handler
  saveBtn.addEventListener('click', async () => {
    const formData = getFormData(form);
    const validation = validateCitation(formData);

    if (!validation.valid) {
      showErrorToast(`Invalid citation: ${validation.errors.join(', ')}`);
      return;
    }

    overlay.remove();
    onClose(formData);
  });

  // ESC key to close
  const handleEsc = e => {
    if (e.key === 'Escape') {
      handleClose();
      document.removeEventListener('keydown', handleEsc);
    }
  };
  document.addEventListener('keydown', handleEsc);

  return overlay;
}

/**
 * Get form data as citation object
 * @param {HTMLFormElement} form
 * @returns {Object}
 */
function getFormData(form) {
  const formData = new FormData(form);
  const data = {};

  for (const [key, value] of formData.entries()) {
    if (key === 'authors' || key === 'tags') {
      data[key] = value
        .split(',')
        .map(s => s.trim())
        .filter(s => s.length > 0);
    } else {
      data[key] = value;
    }
  }

  // Add timestamps
  data.accessDate = new Date().toISOString().split('T')[0];

  return data;
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

/**
 * Apply styles to citation modal
 * @param {HTMLElement} _overlay
 */
function applyCitationModalStyles(_overlay) {
  const style = document.createElement('style');
  style.textContent = `
    .citation-modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999998;
      padding: 20px;
    }

    .citation-modal {
      background: white;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      max-width: 600px;
      width: 100%;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
    }

    .citation-modal-header {
      padding: 20px 24px;
      border-bottom: 1px solid #e0e0e0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .citation-modal-header h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      color: #333;
    }

    .citation-modal-close {
      background: none;
      border: none;
      font-size: 24px;
      color: #666;
      cursor: pointer;
      padding: 0;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      transition: background 0.2s;
    }

    .citation-modal-close:hover {
      background: #f5f5f5;
    }

    .citation-modal-body {
      padding: 24px;
      overflow-y: auto;
      flex: 1;
    }

    .form-group {
      margin-bottom: 16px;
    }

    .form-group label {
      display: block;
      margin-bottom: 6px;
      font-weight: 500;
      color: #333;
      font-size: 14px;
    }

    .form-group input,
    .form-group select,
    .form-group textarea {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #d0d0d0;
      border-radius: 6px;
      font-size: 14px;
      font-family: system-ui, -apple-system, sans-serif;
      transition: border-color 0.2s;
    }

    .form-group input:focus,
    .form-group select:focus,
    .form-group textarea:focus {
      outline: none;
      border-color: #2196f3;
      box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.1);
    }

    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }

    .citation-preview {
      margin-top: 24px;
      padding: 16px;
      background: #f9f9f9;
      border-radius: 8px;
      border: 1px solid #e0e0e0;
    }

    .citation-preview strong {
      display: block;
      margin-bottom: 8px;
      color: #555;
      font-size: 13px;
    }

    .preview-text {
      font-size: 13px;
      line-height: 1.6;
      color: #333;
      font-style: italic;
    }

    .citation-modal-footer {
      padding: 16px 24px;
      border-top: 1px solid #e0e0e0;
      display: flex;
      justify-content: flex-end;
      gap: 12px;
    }

    .citation-modal-footer button {
      padding: 10px 20px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      border: none;
    }

    .btn-cancel {
      background: #f5f5f5;
      color: #666;
    }

    .btn-cancel:hover {
      background: #e0e0e0;
    }

    .btn-save {
      background: #2196f3;
      color: white;
    }

    .btn-save:hover {
      background: #1976d2;
    }
  `;

  document.head.appendChild(style);
}

export default {
  showSuccessToast,
  showErrorToast,
  showCitationEditModal,
};
