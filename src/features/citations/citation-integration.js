/**
 * Citation Integration Module
 *
 * Main entry point for citation functionality in content script
 * Coordinates metadata extraction, storage, UI, and CrossRef API
 *
 * Exposed to window.assistFeatures.citation for message handlers
 */

import { extractMetadata, mergeMetadata, isPDF, extractPDFMetadata } from './metadata-extractor.js';
import { CitationStorage, ProjectStorage } from './citation-storage.js';
import { showCitationEditModal, showSuccessToast, showErrorToast } from './citation-ui.js';
import { enrichMetadataWithDOI } from './crossref-api.js';
import { openBibliographyManager } from './bibliography-manager.js';
import { openProjectManager } from './project-manager.js';
import { normalizeCitation } from './citation-types.js';
import { showSaveTray, showInfoTray } from './citation-save-tray.js';

/**
 * Save citation from current page.
 *
 * Default flow is ONE-CLICK ("quick"): extract → normalise → save immediately → show a
 * non-blocking tray with Undo + Edit. This replaces the old forced confirm-modal-on-save,
 * which research showed adds friction for neurodivergent users. Pass `{ mode: 'review' }`
 * to open the edit modal before saving.
 *
 * @param {string} [selectedText] - Optional selected text to pre-fill as excerpt in notes
 * @param {{mode?: 'quick'|'review'}} [options]
 * @returns {Promise<Object|null>} - Saved citation, the existing duplicate, or null if cancelled
 */
export async function saveCitationFromCurrentPage(selectedText = '', options = {}) {
  const mode = options.mode === 'review' ? 'review' : 'quick';
  try {
    // Extract metadata from current page
    let citationData;
    if (isPDF()) {
      citationData = extractPDFMetadata();
    } else {
      const metadata = extractMetadata(document);
      citationData = mergeMetadata(metadata, window.location.href);
    }

    // Pre-fill notes with selected text as excerpt
    if (selectedText && selectedText.trim()) {
      citationData.notes = `Excerpt: "${selectedText.trim()}"`;
    }

    // Enrich with DOI if available
    if (citationData.doi) {
      citationData = await enrichMetadataWithDOI(citationData, citationData.doi);
    }

    // Normalise so journal fields / canonical type survive the save.
    citationData = normalizeCitation(citationData);

    // Duplicate check — NON-blocking: inform and offer to edit, never throw.
    const existingCitations = await CitationStorage.getByURL(citationData.url);
    if (existingCitations.length > 0) {
      showInfoTray({
        message: 'Already saved for this page',
        actionLabel: 'Edit',
        onAction: () => openEditFor(existingCitations[0]),
      });
      return existingCitations[0];
    }

    // Review mode: confirm/edit before saving.
    if (mode === 'review') {
      const editedData = await showCitationEditModal(citationData);
      if (!editedData) {
        return null; // user cancelled — not an error
      }
      const merged = normalizeCitation({ ...citationData, ...editedData });
      const reviewId = await CitationStorage.add(merged);
      const reviewSaved = await CitationStorage.get(reviewId);
      await showSavedTray(reviewSaved);
      return reviewSaved;
    }

    // Quick mode: save immediately, then offer Undo / Edit.
    const citationId = await CitationStorage.add(citationData);
    const savedCitation = await CitationStorage.get(citationId);
    await showSavedTray(savedCitation);
    return savedCitation;
  } catch (error) {
    console.error('[Citation] Save failed:', error);
    showErrorToast(`Failed to save citation: ${error.message}`, 4000);
    throw error;
  }
}

/**
 * Resolve a friendly destination name for a saved citation (project name or "Library").
 * @param {Object} citation
 * @returns {Promise<string>}
 */
async function resolveProjectName(citation) {
  if (!citation || !citation.projectId) {
    return 'Library';
  }
  try {
    const project = await ProjectStorage.get(citation.projectId);
    return project && project.name ? project.name : 'Library';
  } catch {
    return 'Library';
  }
}

/**
 * Show the post-save tray (Undo deletes the just-saved citation; Edit opens the modal).
 * @param {Object} saved
 */
async function showSavedTray(saved) {
  if (!saved) {
    showSuccessToast('Citation saved', 2500);
    return;
  }
  const projectName = await resolveProjectName(saved);
  showSaveTray({
    title: saved.title,
    projectName,
    onUndo: async () => {
      try {
        await CitationStorage.delete(saved.id);
        showInfoTray({ message: 'Citation removed' });
      } catch (err) {
        console.error('[Citation] Undo failed:', err);
        showErrorToast('Could not undo — please remove it from your library.', 3500);
      }
    },
    onEdit: () => openEditFor(saved),
  });
}

/**
 * Open the edit modal for an existing citation and persist any changes.
 * @param {Object} citation - existing (saved) citation with an id
 */
async function openEditFor(citation) {
  const edited = await showCitationEditModal({ ...citation, _isEdit: true });
  if (!edited) {
    return;
  }
  const merged = normalizeCitation({ ...citation, ...edited });
  try {
    await CitationStorage.update(citation.id, merged);
    showSuccessToast('Citation updated', 2500);
  } catch (err) {
    console.error('[Citation] Update failed:', err);
    showErrorToast(`Update failed: ${err.message}`, 3500);
  }
}

/**
 * Get citation count for current URL
 * @returns {Promise<number>}
 */
export async function getCitationCountForCurrentPage() {
  const citations = await CitationStorage.getByURL(window.location.href);
  return citations.length;
}

/**
 * Check if current page has citation
 * @returns {Promise<boolean>}
 */
export async function hasCurrentPageCitation() {
  return await CitationStorage.exists(window.location.href);
}

/**
 * Get all citations for current URL
 * @returns {Promise<Array>}
 */
export async function getCitationsForCurrentPage() {
  return await CitationStorage.getByURL(window.location.href);
}

/**
 * Get all citations from storage
 * @returns {Promise<Array>}
 */
export async function getAllCitations() {
  return await CitationStorage.getAll();
}

/**
 * Get all projects from storage
 * @returns {Promise<Array>}
 */
export async function getAllProjects() {
  return await ProjectStorage.getAll();
}

/**
 * Initialize citation feature
 */
export function initCitation() {
  console.log('[Citation] Initializing citation feature');

  // Expose API to window.assistFeatures
  if (!window.assistFeatures) {
    window.assistFeatures = {};
  }

  window.assistFeatures.citation = {
    saveCitationFromCurrentPage,
    getCitationCountForCurrentPage,
    hasCurrentPageCitation,
    getCitationsForCurrentPage,
    getAllCitations,
    getAllProjects,
    openBibliographyManager,
    openProjectManager,
  };

  console.log('[Citation] Citation feature initialized');
}

export default {
  initCitation,
  saveCitationFromCurrentPage,
  getCitationCountForCurrentPage,
  hasCurrentPageCitation,
  getCitationsForCurrentPage,
  getAllCitations,
  getAllProjects,
  openBibliographyManager,
  openProjectManager,
};
