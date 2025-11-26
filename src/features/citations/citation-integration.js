/**
 * Citation Integration Module
 *
 * Main entry point for citation functionality in content script
 * Coordinates metadata extraction, storage, UI, and CrossRef API
 *
 * Exposed to window.assistFeatures.citation for message handlers
 */

import { extractMetadata, mergeMetadata, isPDF, extractPDFMetadata } from './metadata-extractor.js';
import { CitationStorage } from './citation-storage.js';
import { showCitationEditModal, showSuccessToast, showErrorToast } from './citation-ui.js';
import { enrichMetadataWithDOI } from './crossref-api.js';
import { openBibliographyManager } from './bibliography-manager.js';
import { openProjectManager } from './project-manager.js';

/**
 * Save citation from current page with user confirmation
 * @returns {Promise<Object>} - Saved citation object
 */
export async function saveCitationFromCurrentPage() {
  try {
    // Extract metadata from current page
    let citationData;

    if (isPDF()) {
      citationData = extractPDFMetadata();
    } else {
      const metadata = extractMetadata(document);
      citationData = mergeMetadata(metadata, window.location.href);
    }

    console.log('[Citation] Extracted metadata:', citationData);

    // Enrich with DOI if available
    if (citationData.doi) {
      console.log('[Citation] Enriching with DOI:', citationData.doi);
      citationData = await enrichMetadataWithDOI(citationData, citationData.doi);
    }

    // Check if citation already exists
    const existingCitations = await CitationStorage.getByURL(citationData.url);
    if (existingCitations.length > 0) {
      const message = `Citation already saved for this page (${existingCitations.length} ${existingCitations.length === 1 ? 'entry' : 'entries'})`;
      showErrorToast(message, 4000);
      throw new Error(message);
    }

    // Show edit modal for user confirmation/editing
    const editedData = await showCitationEditModal(citationData);

    if (!editedData) {
      console.log('[Citation] User cancelled citation save');
      throw new Error('Citation save cancelled by user');
    }

    // Save to storage
    const citationId = await CitationStorage.add(editedData);
    console.log('[Citation] Saved with ID:', citationId);

    // Get the saved citation with all fields
    const savedCitation = await CitationStorage.get(citationId);

    // Show success toast
    showSuccessToast('Citation saved successfully!', 3000);

    return savedCitation;
  } catch (error) {
    console.error('[Citation] Save failed:', error);
    if (!error.message.includes('cancelled')) {
      showErrorToast(`Failed to save citation: ${error.message}`, 4000);
    }
    throw error;
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
  openBibliographyManager,
  openProjectManager,
};
