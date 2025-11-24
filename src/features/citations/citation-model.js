/**
 * Citation Data Model and Type Definitions
 *
 * Supports multiple citation types and metadata standards:
 * - OpenGraph (og:title, og:author, etc.)
 * - Dublin Core (DC.title, DC.creator, etc.)
 * - JSON-LD (Schema.org)
 * - COinS (ContextObjects in Spans)
 * - Manual entry
 *
 * Compatible with Cite Them Right (Harvard) formatting requirements
 */

/**
 * Citation types supported by the system
 * @enum {string}
 */
export const CitationType = {
  WEBSITE: 'website',
  BOOK: 'book',
  JOURNAL: 'journal',
  NEWSPAPER: 'newspaper',
  VIDEO: 'video',
  SOCIAL_MEDIA: 'social_media',
  PDF: 'pdf',
  OTHER: 'other',
};

/**
 * Citation metadata standard
 * @typedef {Object} CitationMetadata
 * @property {string} id - Unique identifier (UUID)
 * @property {CitationType} type - Type of citation
 * @property {string} url - Source URL
 * @property {string} title - Title of the work
 * @property {Array<string>} authors - List of author names
 * @property {string} publicationDate - ISO date string (YYYY-MM-DD)
 * @property {string} accessDate - ISO date string (YYYY-MM-DD)
 * @property {string} publisher - Publisher name
 * @property {string} siteName - Website/publication name
 * @property {string} doi - Digital Object Identifier (if available)
 * @property {string} isbn - ISBN for books
 * @property {string} issn - ISSN for journals
 * @property {Object} extra - Additional metadata fields
 * @property {string} notes - User notes
 * @property {Array<string>} tags - User-defined tags
 * @property {number} createdAt - Timestamp
 * @property {number} updatedAt - Timestamp
 * @property {string} projectId - Associated project (optional)
 */

/**
 * Extracted metadata from HTML page
 * @typedef {Object} ExtractedMetadata
 * @property {Object|null} openGraph - OpenGraph metadata
 * @property {Object|null} dublinCore - Dublin Core metadata
 * @property {Object|null} jsonLD - JSON-LD structured data
 * @property {Object|null} coins - COinS metadata
 * @property {Object|null} html - Standard HTML meta tags
 * @property {string|null} doi - Extracted DOI
 */

/**
 * Create a new citation object with default values
 * @param {Partial<CitationMetadata>} data - Initial citation data
 * @returns {CitationMetadata}
 */
export function createCitation(data = {}) {
  const now = Date.now();
  return {
    id: data.id || generateUUID(),
    type: data.type || CitationType.WEBSITE,
    url: data.url || '',
    title: data.title || '',
    authors: data.authors || [],
    publicationDate: data.publicationDate || '',
    accessDate: data.accessDate || new Date().toISOString().split('T')[0],
    publisher: data.publisher || '',
    siteName: data.siteName || '',
    doi: data.doi || '',
    isbn: data.isbn || '',
    issn: data.issn || '',
    extra: data.extra || {},
    notes: data.notes || '',
    tags: data.tags || [],
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now,
    projectId: data.projectId || null,
  };
}

/**
 * Generate a simple UUID v4
 * @returns {string}
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Validate citation data
 * @param {CitationMetadata} citation
 * @returns {{ valid: boolean, errors: Array<string> }}
 */
export function validateCitation(citation) {
  const errors = [];

  if (!citation.title || citation.title.trim() === '') {
    errors.push('Title is required');
  }

  if (!citation.url || citation.url.trim() === '') {
    errors.push('URL is required');
  }

  if (citation.authors.length === 0) {
    errors.push('At least one author is required (use "Anon." if unknown)');
  }

  if (!citation.accessDate) {
    errors.push('Access date is required');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Detect citation type from URL and metadata
 * @param {string} url
 * @param {ExtractedMetadata} metadata
 * @returns {CitationType}
 */
export function detectCitationType(url, metadata) {
  // Check URL patterns
  if (url.includes('youtube.com') || url.includes('vimeo.com')) {
    return CitationType.VIDEO;
  }

  if (
    url.includes('twitter.com') ||
    url.includes('facebook.com') ||
    url.includes('instagram.com')
  ) {
    return CitationType.SOCIAL_MEDIA;
  }

  if (url.endsWith('.pdf')) {
    return CitationType.PDF;
  }

  // Check metadata
  if (metadata?.openGraph?.ogType === 'article') {
    return CitationType.JOURNAL;
  }

  if (metadata?.jsonLD?.['@type'] === 'Book') {
    return CitationType.BOOK;
  }

  if (metadata?.jsonLD?.['@type'] === 'NewsArticle') {
    return CitationType.NEWSPAPER;
  }

  // Default to website
  return CitationType.WEBSITE;
}

/**
 * Parse author string into structured format
 * Handles formats: "Smith, John", "John Smith", "Smith, J.", etc.
 * @param {string} authorString
 * @returns {Array<string>}
 */
export function parseAuthors(authorString) {
  if (!authorString) {
    return [];
  }

  // Split by "and" first, then by semicolons
  const authors = authorString
    .split(/\s+and\s+/)
    .flatMap(part => part.split(/\s*;\s*/))
    .map(a => a.trim())
    .filter(a => a.length > 0);

  return authors;
}

/**
 * Format author name for citation (Harvard style)
 * @param {string} authorName - Full name or "Last, First" format
 * @returns {string} - Formatted as "Last, F." for Harvard
 */
export function formatAuthorHarvard(authorName) {
  const parts = authorName.split(',').map(p => p.trim());

  if (parts.length === 2) {
    // Already in "Last, First" format
    const [last, first] = parts;
    const initial = first.charAt(0).toUpperCase();
    return `${last}, ${initial}.`;
  }

  // Parse "First Last" format
  const words = authorName.trim().split(/\s+/);
  if (words.length === 1) {
    return words[0]; // Single name (e.g., organization)
  }

  const last = words[words.length - 1];
  const first = words[0];
  const initial = first.charAt(0).toUpperCase();
  return `${last}, ${initial}.`;
}

/**
 * Extract year from publication date
 * @param {string} dateString - ISO date or year string
 * @returns {string} - Year (YYYY) or empty string
 */
export function extractYear(dateString) {
  if (!dateString) {
    return '';
  }

  const match = dateString.match(/\d{4}/);
  return match ? match[0] : '';
}

/**
 * Create citation key for sorting and indexing
 * Format: "AuthorYear-ShortTitle"
 * @param {CitationMetadata} citation
 * @returns {string}
 */
export function createCitationKey(citation) {
  const author = citation.authors[0] || 'Anon';
  const lastName = author
    .split(',')[0]
    .trim()
    .replace(/[^a-zA-Z0-9]/g, '');
  const year = extractYear(citation.publicationDate) || extractYear(citation.accessDate);
  const shortTitle = citation.title
    .split(/\s+/)
    .slice(0, 3)
    .join('')
    .replace(/[^a-zA-Z0-9]/g, '')
    .substring(0, 20);

  return `${lastName}${year}-${shortTitle}`;
}

export default {
  CitationType,
  createCitation,
  validateCitation,
  detectCitationType,
  parseAuthors,
  formatAuthorHarvard,
  extractYear,
  createCitationKey,
};
