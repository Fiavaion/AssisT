/**
 * Bibliography Manager Module
 *
 * Provides UI for managing saved citations and generating bibliographies.
 * Features:
 * - View all saved citations in a list
 * - Generate Harvard-formatted bibliography
 * - Export as TXT, HTML, or copy to clipboard
 * - Delete citations
 * - Search and filter citations
 *
 * @module features/citations/bibliography-manager
 * @version 1.0.0
 */

import { CitationStorage } from './citation-storage.js';
import {
  formatInText,
  formatReference,
  formatBibliography,
  formatReferenceHTML,
} from './citation-formatter.js';
import { showSuccessToast, showErrorToast, showCitationEditModal } from './citation-ui.js';
import { openProjectManager } from './project-manager.js';
import { SourceEvaluator, openCraapTest } from './source-evaluator.js';

/**
 * Bibliography Manager class
 * Manages the citation library UI and bibliography generation
 */
class BibliographyManager {
  constructor() {
    this.modal = null;
    this.citations = [];
    this.filteredCitations = [];
    this.searchQuery = '';
    this.sortBy = 'createdAt';
    this.sortOrder = 'desc';
  }

  /**
   * Open the Bibliography Manager modal
   */
  async open() {
    // Load citations
    this.citations = await CitationStorage.getAll();
    this.filteredCitations = [...this.citations];

    // Create and show modal
    this.modal = this.createModal();
    document.body.appendChild(this.modal);

    // Apply styles
    this.applyStyles();

    // Render initial content
    this.renderCitationList();

    // Focus search input
    setTimeout(() => {
      const searchInput = this.modal.querySelector('#bib-search');
      if (searchInput) {
        searchInput.focus();
      }
    }, 100);
  }

  /**
   * Close the modal
   */
  close() {
    if (this.modal) {
      this.modal.remove();
      this.modal = null;
    }
  }

  /**
   * Create the main modal structure
   */
  createModal() {
    const overlay = document.createElement('div');
    overlay.className = 'bib-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'bib-modal-title');

    overlay.innerHTML = `
      <div class="bib-modal">
        <div class="bib-modal-header">
          <h2 id="bib-modal-title">
            <span class="bib-icon">📚</span>
            Citation Library
          </h2>
          <div class="bib-header-actions">
            <span class="bib-count">${this.citations.length} citations</span>
            <button class="bib-close-btn" aria-label="Close">✕</button>
          </div>
        </div>

        <div class="bib-toolbar">
          <div class="bib-search-container">
            <input
              type="search"
              id="bib-search"
              placeholder="Search citations..."
              aria-label="Search citations"
            />
          </div>
          <div class="bib-sort-container">
            <select id="bib-sort" aria-label="Sort citations">
              <option value="createdAt-desc">Newest First</option>
              <option value="createdAt-asc">Oldest First</option>
              <option value="title-asc">Title (A-Z)</option>
              <option value="title-desc">Title (Z-A)</option>
              <option value="author-asc">Author (A-Z)</option>
              <option value="author-desc">Author (Z-A)</option>
            </select>
          </div>
        </div>

        <div class="bib-content">
          <div class="bib-citation-list" id="bib-citation-list">
            <!-- Citations rendered here -->
          </div>
        </div>

        <div class="bib-footer">
          <div class="bib-footer-left">
            <button class="bib-projects-btn" title="Open Project Manager">
              📁 Projects
            </button>
          </div>
          <div class="bib-export-section">
            <span class="bib-export-label">Export Bibliography:</span>
            <button class="bib-export-btn" data-format="copy" title="Copy to clipboard">
              📋 Copy
            </button>
            <button class="bib-export-btn" data-format="txt" title="Download as TXT">
              📄 TXT
            </button>
            <button class="bib-export-btn" data-format="html" title="Download as HTML">
              🌐 HTML
            </button>
          </div>
        </div>
      </div>
    `;

    // Event listeners
    this.attachEventListeners(overlay);

    return overlay;
  }

  /**
   * Attach event listeners to modal elements
   */
  attachEventListeners(overlay) {
    // Close button
    const closeBtn = overlay.querySelector('.bib-close-btn');
    closeBtn.addEventListener('click', () => this.close());

    // Click outside to close
    overlay.addEventListener('click', e => {
      if (e.target === overlay) {
        this.close();
      }
    });

    // ESC to close
    const handleEsc = e => {
      if (e.key === 'Escape') {
        this.close();
        document.removeEventListener('keydown', handleEsc);
      }
    };
    document.addEventListener('keydown', handleEsc);

    // Search input
    const searchInput = overlay.querySelector('#bib-search');
    searchInput.addEventListener('input', e => {
      this.searchQuery = e.target.value.toLowerCase();
      this.filterAndRender();
    });

    // Sort select
    const sortSelect = overlay.querySelector('#bib-sort');
    sortSelect.addEventListener('change', e => {
      const [sortBy, sortOrder] = e.target.value.split('-');
      this.sortBy = sortBy;
      this.sortOrder = sortOrder;
      this.filterAndRender();
    });

    // Export buttons
    const exportBtns = overlay.querySelectorAll('.bib-export-btn');
    exportBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const format = btn.dataset.format;
        this.exportBibliography(format);
      });
    });

    // Projects button - opens Project Manager
    const projectsBtn = overlay.querySelector('.bib-projects-btn');
    if (projectsBtn) {
      projectsBtn.addEventListener('click', async () => {
        this.close();
        await openProjectManager();
      });
    }
  }

  /**
   * Filter citations based on search query and sort
   */
  filterAndRender() {
    // Filter by search query
    if (this.searchQuery) {
      this.filteredCitations = this.citations.filter(citation => {
        const searchFields = [
          citation.title,
          citation.authors.join(' '),
          citation.publisher,
          citation.url,
          citation.notes,
          ...(citation.tags || []),
        ]
          .join(' ')
          .toLowerCase();

        return searchFields.includes(this.searchQuery);
      });
    } else {
      this.filteredCitations = [...this.citations];
    }

    // Sort
    this.filteredCitations.sort((a, b) => {
      let aVal, bVal;

      switch (this.sortBy) {
        case 'title':
          aVal = a.title.toLowerCase();
          bVal = b.title.toLowerCase();
          break;
        case 'author':
          aVal = a.authors[0]?.toLowerCase() || '';
          bVal = b.authors[0]?.toLowerCase() || '';
          break;
        default:
          aVal = a.createdAt || 0;
          bVal = b.createdAt || 0;
      }

      if (this.sortOrder === 'asc') {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      } else {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
      }
    });

    this.renderCitationList();
  }

  /**
   * Render the citation list
   */
  renderCitationList() {
    const container = this.modal.querySelector('#bib-citation-list');

    if (this.filteredCitations.length === 0) {
      container.innerHTML = `
        <div class="bib-empty">
          <span class="bib-empty-icon">📚</span>
          <p>${this.searchQuery ? 'No citations match your search' : 'No citations saved yet'}</p>
          <p class="bib-empty-hint">
            ${this.searchQuery ? 'Try a different search term' : 'Save citations using the "Save Citation" button'}
          </p>
        </div>
      `;
      return;
    }

    container.innerHTML = this.filteredCitations
      .map(citation => this.renderCitationCard(citation))
      .join('');

    // Attach card event listeners
    this.attachCardListeners(container);

    // Update count
    const countEl = this.modal.querySelector('.bib-count');
    if (countEl) {
      const total = this.citations.length;
      const filtered = this.filteredCitations.length;
      countEl.textContent = this.searchQuery
        ? `${filtered} of ${total} citations`
        : `${total} citations`;
    }
  }

  /**
   * Render a single citation card
   */
  renderCitationCard(citation) {
    const inText = formatInText(citation);
    const reference = formatReference(citation);
    const dateStr = citation.createdAt ? new Date(citation.createdAt).toLocaleDateString() : '';

    // Calculate credibility score
    const evaluation = SourceEvaluator.calculateCredibilityScore(citation, citation.craapScores);
    const badgeHTML = this.renderCredibilityBadge(evaluation);

    return `
      <div class="bib-card" data-id="${citation.id}">
        <div class="bib-card-header">
          <span class="bib-card-type">${this.getTypeIcon(citation.type)} ${citation.type || 'webpage'}</span>
          <div class="bib-card-header-right">
            ${badgeHTML}
            <span class="bib-card-date">${dateStr}</span>
          </div>
        </div>
        <h3 class="bib-card-title">${this.escapeHTML(citation.title)}</h3>
        <p class="bib-card-authors">${this.escapeHTML(citation.authors.join(', ') || 'Unknown author')}</p>
        <div class="bib-card-preview">
          <div class="bib-preview-label">Reference:</div>
          <div class="bib-preview-text">${this.escapeHTML(reference)}</div>
        </div>
        <div class="bib-card-intext">
          <span class="bib-intext-label">In-text:</span>
          <code class="bib-intext-code">${inText}</code>
          <button class="bib-copy-intext" title="Copy in-text citation">📋</button>
        </div>
        <div class="bib-card-actions">
          <button class="bib-action-btn bib-edit-btn" title="Edit citation">✏️ Edit</button>
          <button class="bib-action-btn bib-evaluate-btn" title="Evaluate source quality">📊 Evaluate</button>
          <button class="bib-action-btn bib-copy-btn" title="Copy reference">📋 Copy</button>
          <button class="bib-action-btn bib-delete-btn" title="Delete citation">🗑️ Delete</button>
        </div>
        ${
          citation.tags?.length
            ? `
          <div class="bib-card-tags">
            ${citation.tags.map(tag => `<span class="bib-tag">${this.escapeHTML(tag)}</span>`).join('')}
          </div>
        `
            : ''
        }
      </div>
    `;
  }

  /**
   * Render credibility badge
   */
  renderCredibilityBadge(evaluation) {
    const { score, level } = evaluation;
    return `
      <span class="bib-credibility-badge"
            style="background: ${level.color};"
            title="${level.label}: ${score}/100">
        ${level.icon} ${score}
      </span>
    `;
  }

  /**
   * Get icon for citation type
   */
  getTypeIcon(type) {
    const icons = {
      webpage: '🌐',
      website: '🌐',
      book: '📕',
      journal: '📰',
      newspaper: '📰',
      video: '🎬',
      social_media: '📱',
      pdf: '📄',
    };
    return icons[type] || '📄';
  }

  /**
   * Attach event listeners to citation cards
   */
  attachCardListeners(container) {
    // Copy in-text button
    container.querySelectorAll('.bib-copy-intext').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const card = btn.closest('.bib-card');
        const citation = this.citations.find(c => String(c.id) === card.dataset.id);
        if (citation) {
          const inText = formatInText(citation);
          await navigator.clipboard.writeText(inText);
          showSuccessToast('In-text citation copied!');
        }
      });
    });

    // Copy reference button
    container.querySelectorAll('.bib-copy-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const card = btn.closest('.bib-card');
        const citation = this.citations.find(c => String(c.id) === card.dataset.id);
        if (citation) {
          const reference = formatReference(citation);
          await navigator.clipboard.writeText(reference);
          showSuccessToast('Reference copied!');
        }
      });
    });

    // Edit button
    container.querySelectorAll('.bib-edit-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const card = btn.closest('.bib-card');
        const citation = this.citations.find(c => String(c.id) === card.dataset.id);
        if (citation) {
          const edited = await showCitationEditModal(citation);
          if (edited) {
            await CitationStorage.update(String(citation.id), edited);
            this.citations = await CitationStorage.getAll();
            this.filterAndRender();
            showSuccessToast('Citation updated!');
          }
        }
      });
    });

    // Evaluate button (CRAAP test)
    container.querySelectorAll('.bib-evaluate-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const card = btn.closest('.bib-card');
        const citation = this.citations.find(c => String(c.id) === card.dataset.id);
        if (citation) {
          openCraapTest(citation, async () => {
            this.citations = await CitationStorage.getAll();
            this.filterAndRender();
            showSuccessToast('Source evaluation saved!');
          });
        }
      });
    });

    // Delete button
    container.querySelectorAll('.bib-delete-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const card = btn.closest('.bib-card');
        const citation = this.citations.find(c => String(c.id) === card.dataset.id);
        if (citation && confirm(`Delete "${citation.title}"?`)) {
          await CitationStorage.delete(String(citation.id));
          this.citations = await CitationStorage.getAll();
          this.filterAndRender();
          showSuccessToast('Citation deleted');
        }
      });
    });
  }

  /**
   * Export bibliography in specified format
   */
  async exportBibliography(format) {
    if (this.filteredCitations.length === 0) {
      showErrorToast('No citations to export');
      return;
    }

    const bibliography = formatBibliography(this.filteredCitations);

    switch (format) {
      case 'copy':
        await navigator.clipboard.writeText(bibliography);
        showSuccessToast(`${this.filteredCitations.length} citations copied to clipboard!`);
        break;

      case 'txt':
        this.downloadFile(bibliography, 'bibliography.txt', 'text/plain');
        showSuccessToast('Bibliography downloaded as TXT');
        break;

      case 'html':
        const htmlContent = this.generateHTMLBibliography();
        this.downloadFile(htmlContent, 'bibliography.html', 'text/html');
        showSuccessToast('Bibliography downloaded as HTML');
        break;
    }
  }

  /**
   * Generate HTML formatted bibliography
   */
  generateHTMLBibliography() {
    const references = this.filteredCitations.map(citation => {
      const ref = formatReference(citation);
      return formatReferenceHTML(ref);
    });

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bibliography - AssisT</title>
  <style>
    body {
      font-family: 'Times New Roman', Times, serif;
      max-width: 800px;
      margin: 40px auto;
      padding: 0 20px;
      line-height: 2;
      font-size: 12pt;
    }
    h1 {
      text-align: center;
      font-size: 14pt;
      font-weight: bold;
      margin-bottom: 24pt;
    }
    p {
      margin-left: 0.5in;
      text-indent: -0.5in;
      margin-bottom: 12pt;
    }
  </style>
</head>
<body>
  <h1>References</h1>
  ${references.join('\n  ')}
  <footer style="margin-top: 40px; text-align: center; font-size: 10pt; color: #666;">
    Generated by AssisT Extension - ${new Date().toLocaleDateString()}
  </footer>
</body>
</html>`;
  }

  /**
   * Download file utility
   */
  downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHTML(str) {
    if (!str) {
      return '';
    }
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Apply styles for the modal
   */
  applyStyles() {
    if (document.getElementById('bib-manager-styles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'bib-manager-styles';
    style.textContent = `
      .bib-modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 999997;
        padding: 20px;
      }

      .bib-modal {
        background: white;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        width: 100%;
        max-width: 800px;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
      }

      .bib-modal-header {
        padding: 20px 24px;
        border-bottom: 1px solid #e0e0e0;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .bib-modal-header h2 {
        margin: 0;
        font-size: 20px;
        font-weight: 600;
        color: #333;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .bib-icon {
        font-size: 24px;
      }

      .bib-header-actions {
        display: flex;
        align-items: center;
        gap: 16px;
      }

      .bib-count {
        font-size: 14px;
        color: #666;
        background: #f0f0f0;
        padding: 4px 12px;
        border-radius: 20px;
      }

      .bib-close-btn {
        background: none;
        border: none;
        font-size: 24px;
        color: #666;
        cursor: pointer;
        padding: 4px;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        transition: background 0.2s;
      }

      .bib-close-btn:hover {
        background: #f5f5f5;
      }

      .bib-toolbar {
        padding: 16px 24px;
        display: flex;
        gap: 12px;
        border-bottom: 1px solid #e0e0e0;
      }

      .bib-search-container {
        flex: 1;
      }

      .bib-search-container input {
        width: 100%;
        padding: 10px 14px;
        border: 1px solid #d0d0d0;
        border-radius: 8px;
        font-size: 14px;
      }

      .bib-search-container input:focus {
        outline: none;
        border-color: #2196f3;
        box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.1);
      }

      .bib-sort-container select {
        padding: 10px 14px;
        border: 1px solid #d0d0d0;
        border-radius: 8px;
        font-size: 14px;
        background: white;
        cursor: pointer;
      }

      .bib-content {
        flex: 1;
        overflow-y: auto;
        padding: 16px 24px;
      }

      .bib-citation-list {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .bib-card {
        border: 1px solid #e0e0e0;
        border-radius: 10px;
        padding: 16px;
        transition: box-shadow 0.2s, border-color 0.2s;
      }

      .bib-card:hover {
        border-color: #2196f3;
        box-shadow: 0 4px 12px rgba(33, 150, 243, 0.1);
      }

      .bib-card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
      }

      .bib-card-type {
        font-size: 12px;
        color: #666;
        background: #f5f5f5;
        padding: 2px 8px;
        border-radius: 4px;
        text-transform: capitalize;
      }

      .bib-card-date {
        font-size: 12px;
        color: #999;
      }

      .bib-card-header-right {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .bib-credibility-badge {
        color: white;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .bib-card-title {
        margin: 0 0 6px 0;
        font-size: 16px;
        font-weight: 600;
        color: #333;
        line-height: 1.3;
      }

      .bib-card-authors {
        margin: 0 0 12px 0;
        font-size: 14px;
        color: #666;
      }

      .bib-card-preview {
        background: #f9f9f9;
        border-radius: 6px;
        padding: 12px;
        margin-bottom: 12px;
      }

      .bib-preview-label {
        font-size: 11px;
        font-weight: 600;
        color: #888;
        text-transform: uppercase;
        margin-bottom: 4px;
      }

      .bib-preview-text {
        font-size: 13px;
        line-height: 1.5;
        color: #333;
        font-style: italic;
      }

      .bib-card-intext {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
      }

      .bib-intext-label {
        font-size: 12px;
        color: #666;
      }

      .bib-intext-code {
        font-family: monospace;
        background: #e8f4fc;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 13px;
        color: #0066cc;
      }

      .bib-copy-intext {
        background: none;
        border: none;
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        transition: background 0.2s;
      }

      .bib-copy-intext:hover {
        background: #e0e0e0;
      }

      .bib-card-actions {
        display: flex;
        gap: 8px;
      }

      .bib-action-btn {
        padding: 6px 12px;
        border: 1px solid #e0e0e0;
        background: white;
        border-radius: 6px;
        font-size: 12px;
        cursor: pointer;
        transition: all 0.2s;
      }

      .bib-action-btn:hover {
        background: #f5f5f5;
        border-color: #d0d0d0;
      }

      .bib-delete-btn:hover {
        background: #ffebee;
        border-color: #f44336;
        color: #f44336;
      }

      .bib-card-tags {
        margin-top: 12px;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .bib-tag {
        font-size: 11px;
        background: #e3f2fd;
        color: #1976d2;
        padding: 2px 8px;
        border-radius: 12px;
      }

      .bib-empty {
        text-align: center;
        padding: 60px 20px;
        color: #666;
      }

      .bib-empty-icon {
        font-size: 48px;
        display: block;
        margin-bottom: 16px;
        opacity: 0.5;
      }

      .bib-empty p {
        margin: 0 0 8px 0;
        font-size: 16px;
      }

      .bib-empty-hint {
        font-size: 14px !important;
        color: #999 !important;
      }

      .bib-footer {
        padding: 16px 24px;
        border-top: 1px solid #e0e0e0;
        background: #f9f9f9;
        border-radius: 0 0 12px 12px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 12px;
      }

      .bib-footer-left {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .bib-projects-btn {
        padding: 8px 16px;
        border: 1px solid #9c27b0;
        background: white;
        color: #9c27b0;
        border-radius: 6px;
        font-size: 13px;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .bib-projects-btn:hover {
        background: #9c27b0;
        color: white;
      }

      .bib-export-section {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }

      .bib-export-label {
        font-size: 14px;
        font-weight: 500;
        color: #333;
      }

      .bib-export-btn {
        padding: 8px 16px;
        border: 1px solid #e0e0e0;
        background: white;
        border-radius: 6px;
        font-size: 13px;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .bib-export-btn:hover {
        background: #2196f3;
        color: white;
        border-color: #2196f3;
      }
    `;
    document.head.appendChild(style);
  }
}

// Singleton instance
let bibliographyManager = null;

/**
 * Open the Bibliography Manager
 * @returns {Promise<void>}
 */
export async function openBibliographyManager() {
  if (bibliographyManager?.modal) {
    // Already open, bring to focus
    return;
  }

  bibliographyManager = new BibliographyManager();
  await bibliographyManager.open();
}

/**
 * Close the Bibliography Manager
 */
export function closeBibliographyManager() {
  if (bibliographyManager) {
    bibliographyManager.close();
    bibliographyManager = null;
  }
}

export default {
  openBibliographyManager,
  closeBibliographyManager,
  BibliographyManager,
};
