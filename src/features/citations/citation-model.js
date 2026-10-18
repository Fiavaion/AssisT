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
 * Citation types supported by the system. Mirrors the canonical ids registered in
 * type-registry.js, which is the single source of truth for their labels and export types.
 * What a page can reveal about its own type is decided in metadata-extractor.js; chapter and
 * thesis arrive from manual entry, a DOI/CrossRef lookup, or a BibTeX/RIS import instead, because
 * page markup never says which one it is.
 * @enum {string}
 */
export const CitationType = {
  WEBSITE: 'website',
  BOOK: 'book',
  CHAPTER: 'chapter',
  JOURNAL: 'journal',
  NEWSPAPER: 'newspaper',
  VIDEO: 'video',
  SOCIAL_MEDIA: 'social_media',
  PDF: 'pdf',
  THESIS: 'thesis',
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
 * @property {string} quote - The source's exact words, captured at read time
 * @property {string} locator - Where in the source the quote lives (page, paragraph, timestamp)
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
 * THE field list. Every field a stored citation carries, with the value a missing one falls back
 * to. `createCitation` (the add path) builds a record from exactly these keys, and
 * `CitationStorage.update` merges over a record that already has them — so what an add stores and
 * what an update keeps cannot drift apart. Adding a field to the schema is one entry here.
 *
 * It exists because they DID drift: the add path copied a hand-written list that had never been
 * told about `quote`, `locator` or `notes`, so the exact words a student captured with Alt+C —
 * the whole point of the capture flow — were dropped on the way into the database, while an edit
 * of the same record kept them.
 * @type {Readonly<Record<string, () => any>>}
 */
export const CITATION_FIELDS = Object.freeze({
  type: () => CitationType.WEBSITE,
  url: () => '',
  title: () => '',
  authors: () => [],
  publicationDate: () => '',
  accessDate: () => todayLocal(),
  publisher: () => '',
  siteName: () => '',
  doi: () => '',
  isbn: () => '',
  issn: () => '',
  // The student's own material, captured while reading: the source's exact words, where in the
  // source they live (so an in-text citation can carry "p. 24"), and why it was worth saving.
  quote: () => '',
  locator: () => '',
  notes: () => '',
  extra: () => ({}),
  tags: () => [],
  projectId: () => null,
});

/** The schema's field names, in order. */
export const CITATION_FIELD_KEYS = Object.freeze(Object.keys(CITATION_FIELDS));

/**
 * Create a new citation object with default values
 * @param {Partial<CitationMetadata>} data - Initial citation data
 * @returns {CitationMetadata}
 */
export function createCitation(data = {}) {
  const now = Date.now();
  const citation = { id: data.id || generateUUID() };
  for (const key of CITATION_FIELD_KEYS) {
    const value = data[key];
    const missing = value === undefined || value === null || value === '';
    citation[key] = missing ? CITATION_FIELDS[key]() : value;
  }
  citation.createdAt = data.createdAt || now;
  citation.updatedAt = data.updatedAt || now;
  return citation;
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

/** True when a field holds nothing a reference list could print. */
function blank(value) {
  if (Array.isArray(value)) {
    return value.filter(v => String(v ?? '').trim()).length === 0;
  }
  return String(value ?? '').trim() === '';
}

/**
 * Validate citation data.
 *
 * A title is the ONLY thing a stored citation must have, because it is the only thing a student
 * cannot be given a sane default for: everything else has a printing convention for its absence —
 * the title in the author's place for a missing author, "n.d." / "no date" for a missing year, no
 * "Available at" clause when there is no link. Refusing to store a printed book with no URL and no
 * ISBN (which is most printed books, as a student meets them) threw the source away instead, and
 * there is no version of that which is better for the student than an imperfect reference they
 * can finish later.
 *
 * The missing link, author and year are NOT restated here as warnings. They are already the
 * "worth a check" advice `assessCitation` gives in reassurance-engine.js — amber, in the student's
 * words, on the wizard's CHECK step and on the save tray — and a second copy of three rules is a
 * second answer waiting to disagree with the first. Demoting them means dropping them from the
 * errors below; the advice itself never moved.
 *
 * `problems` names the field each error concerns, so the wizard can put the sentence beside the
 * box that fixes it instead of parsing prose; `errors` is the same messages as plain strings.
 *
 * @param {CitationMetadata} citation
 * @returns {{ valid: boolean, errors: Array<string>,
 *             problems: Array<{field: string, message: string}> }}
 */
export function validateCitation(citation) {
  const c = citation || {};
  const problems = [];

  if (blank(c.title)) {
    problems.push({
      field: 'title',
      message: 'Give the source a title, so you can find it again.',
    });
  }

  return {
    valid: problems.length === 0,
    errors: problems.map(p => p.message),
    problems,
  };
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
 * Today on the student's own calendar, as YYYY-MM-DD: the access date a source is stamped with.
 * Not the UTC day, which east of Greenwich after midnight (or west of it in the evening) is a day
 * the student did not read the source on.
 * @returns {string}
 */
export function todayLocal() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
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

export default {
  CitationType,
  CITATION_FIELDS,
  CITATION_FIELD_KEYS,
  createCitation,
  validateCitation,
  formatAuthorHarvard,
  extractYear,
  todayLocal,
};
