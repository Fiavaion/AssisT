/**
 * Citation Types — Single Source of Truth
 *
 * The citation manager historically carried FOUR incompatible `type` vocabularies:
 *   - the data model  (website/book/journal/newspaper/video/social_media/pdf/other)
 *   - the edit-modal <select>  (webpage/bookSection/conferencePaper/report)
 *   - CrossRef's mapper  (journal/book/bookSection/conferencePaper/report/dataset/preprint/webpage)
 *   - the exporter + source-evaluator  (journal-article/book-chapter/news-article/social-media …)
 *
 * Because nothing agreed, the formatter funnelled almost everything through `formatWebsite`,
 * export columns came back empty, and credibility scoring defaulted every item to 0.5.
 *
 * This module is the ONE place that defines the canonical vocabulary and the normalisation
 * that converges every producer/consumer onto it. Everything else imports from here.
 *
 * Design notes:
 * - Canonical formatting types are the 8 the data model uses (keeps the formatter small).
 * - Academically-meaningful sub-types that collapse during formatting (book-chapter,
 *   conference-paper, report, thesis, preprint, dataset) are preserved on `extra.subtype`
 *   so credibility weighting and BibTeX/RIS export keep their fidelity.
 */

/**
 * Canonical citation types used for formatting. Aligned with citation-model.js `CitationType`.
 * @enum {string}
 */
export const CITATION_TYPES = Object.freeze({
  WEBSITE: 'website',
  BOOK: 'book',
  JOURNAL: 'journal',
  NEWSPAPER: 'newspaper',
  VIDEO: 'video',
  SOCIAL_MEDIA: 'social_media',
  PDF: 'pdf',
  OTHER: 'other',
});

/** Set of canonical values for fast membership checks. */
const CANONICAL = new Set(Object.values(CITATION_TYPES));

/** Human-readable labels for canonical types (UI display). */
export const TYPE_LABELS = Object.freeze({
  website: 'Web Page',
  book: 'Book',
  journal: 'Journal Article',
  newspaper: 'Newspaper Article',
  video: 'Video',
  social_media: 'Social Media',
  pdf: 'PDF Document',
  other: 'Other',
});

/**
 * Options for the edit-modal <select>. These MUST emit canonical values so a saved
 * citation never carries a non-canonical type again.
 * @type {Array<{value: string, label: string}>}
 */
export const UI_TYPE_OPTIONS = Object.freeze([
  { value: CITATION_TYPES.WEBSITE, label: TYPE_LABELS.website },
  { value: CITATION_TYPES.JOURNAL, label: TYPE_LABELS.journal },
  { value: CITATION_TYPES.BOOK, label: TYPE_LABELS.book },
  { value: CITATION_TYPES.NEWSPAPER, label: TYPE_LABELS.newspaper },
  { value: CITATION_TYPES.PDF, label: TYPE_LABELS.pdf },
  { value: CITATION_TYPES.VIDEO, label: TYPE_LABELS.video },
  { value: CITATION_TYPES.SOCIAL_MEDIA, label: TYPE_LABELS.social_media },
  { value: CITATION_TYPES.OTHER, label: TYPE_LABELS.other },
]);

/**
 * Normalise a raw type token to a stable lookup key: lower-cased, with underscores and
 * whitespace collapsed to single hyphens. (camelCase is intentionally flattened, e.g.
 * `bookSection` -> `booksection`, and matched explicitly in the alias table below.)
 * @param {*} raw
 * @returns {string}
 */
function normalizeKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
}

/**
 * Alias table mapping every known legacy / CrossRef / export / evaluator token (in
 * normalizeKey form) to a canonical citation type.
 */
const TYPE_ALIASES = Object.freeze({
  // website family
  website: 'website',
  webpage: 'website',
  'web-page': 'website',
  web: 'website',
  html: 'website',
  blog: 'website',
  'blog-post': 'website',
  report: 'website',
  techreport: 'website',
  'technical-report': 'website',
  'working-paper': 'website',
  dataset: 'website',
  standard: 'website',
  // book family
  book: 'book',
  monograph: 'book',
  'reference-book': 'book',
  'edited-book': 'book',
  ebook: 'book',
  booksection: 'book',
  'book-section': 'book',
  'book-chapter': 'book',
  chapter: 'book',
  inbook: 'book',
  incollection: 'book',
  thesis: 'book',
  phdthesis: 'book',
  mastersthesis: 'book',
  dissertation: 'book',
  // journal family
  journal: 'journal',
  'journal-article': 'journal',
  journalarticle: 'journal',
  article: 'journal',
  'article-journal': 'journal',
  conferencepaper: 'journal',
  'conference-paper': 'journal',
  'proceedings-article': 'journal',
  'paper-conference': 'journal',
  proceedings: 'journal',
  preprint: 'journal',
  'posted-content': 'journal',
  // newspaper / magazine family
  newspaper: 'newspaper',
  newspaperarticle: 'newspaper',
  'news-article': 'newspaper',
  'article-newspaper': 'newspaper',
  news: 'newspaper',
  'magazine-article': 'newspaper',
  'article-magazine': 'newspaper',
  // video family
  video: 'video',
  'motion-picture': 'video',
  youtube: 'video',
  film: 'video',
  broadcast: 'video',
  // social media family
  'social-media': 'social_media',
  socialmedia: 'social_media',
  tweet: 'social_media',
  post: 'social_media',
  social: 'social_media',
  // pdf
  pdf: 'pdf',
  document: 'pdf',
  // other
  other: 'other',
  misc: 'other',
  unknown: 'other',
  entry: 'other',
});

/**
 * Map any raw / legacy / external type token to a canonical citation type.
 * Unknown tokens default to `website` (the safest formatting fallback for saved web content).
 * @param {*} raw
 * @returns {string} a value from CITATION_TYPES
 */
export function normalizeType(raw) {
  const key = normalizeKey(raw);
  if (!key) {
    return CITATION_TYPES.WEBSITE;
  }
  if (CANONICAL.has(key)) {
    return key;
  }
  return TYPE_ALIASES[key] || CITATION_TYPES.WEBSITE;
}

/**
 * Fine-grained credibility weights keyed by sub-type (normalizeKey form). Used by
 * source-evaluator so a CrossRef `journal-article` or `report` keeps its true weight even
 * though it formats as `journal` / `website`.
 */
const SUBTYPE_WEIGHTS = Object.freeze({
  'journal-article': 1.0,
  journal: 1.0,
  book: 0.95,
  'book-chapter': 0.9,
  booksection: 0.9,
  thesis: 0.85,
  'conference-paper': 0.85,
  conferencepaper: 0.85,
  'proceedings-article': 0.85,
  report: 0.8,
  preprint: 0.7,
  'posted-content': 0.7,
  dataset: 0.7,
  newspaper: 0.6,
  'news-article': 0.6,
  website: 0.5,
  webpage: 0.5,
  pdf: 0.5,
  'blog-post': 0.4,
  blog: 0.4,
  video: 0.4,
  social_media: 0.3,
  'social-media': 0.3,
  other: 0.5,
  unknown: 0.5,
});

/** Canonical-type fallback weights when no sub-type is recorded. */
const CANONICAL_WEIGHTS = Object.freeze({
  website: 0.5,
  book: 0.95,
  journal: 1.0,
  newspaper: 0.6,
  video: 0.4,
  social_media: 0.3,
  pdf: 0.5,
  other: 0.5,
});

/**
 * Get the credibility weight (0..1) for a citation, preferring the preserved sub-type.
 * @param {Object} citation - normalised citation (or raw with a `type`/`extra.subtype`)
 * @returns {number}
 */
export function getSourceTypeWeight(citation) {
  const subKey = normalizeKey(citation?.extra?.subtype || citation?.type);
  if (subKey && SUBTYPE_WEIGHTS[subKey] !== undefined) {
    return SUBTYPE_WEIGHTS[subKey];
  }
  const canonical = normalizeType(citation?.type);
  return CANONICAL_WEIGHTS[canonical] ?? 0.5;
}

/** BibTeX entry types keyed by sub-type (normalizeKey form). */
const BIBTEX_TYPES = Object.freeze({
  journal: 'article',
  'journal-article': 'article',
  newspaper: 'article',
  'news-article': 'article',
  book: 'book',
  booksection: 'inbook',
  'book-chapter': 'inbook',
  thesis: 'phdthesis',
  phdthesis: 'phdthesis',
  'conference-paper': 'inproceedings',
  conferencepaper: 'inproceedings',
  'proceedings-article': 'inproceedings',
  report: 'techreport',
  website: 'misc',
  webpage: 'misc',
  video: 'misc',
  social_media: 'misc',
  'social-media': 'misc',
  pdf: 'misc',
  other: 'misc',
});

/** RIS reference types keyed by sub-type (normalizeKey form). */
const RIS_TYPES = Object.freeze({
  journal: 'JOUR',
  'journal-article': 'JOUR',
  book: 'BOOK',
  booksection: 'CHAP',
  'book-chapter': 'CHAP',
  thesis: 'THES',
  'conference-paper': 'CONF',
  conferencepaper: 'CONF',
  report: 'RPRT',
  newspaper: 'NEWS',
  'news-article': 'NEWS',
  website: 'ELEC',
  webpage: 'ELEC',
  video: 'VIDEO',
  social_media: 'ELEC',
  'social-media': 'ELEC',
  pdf: 'ELEC',
  other: 'GEN',
});

/**
 * BibTeX entry type for a citation (prefers preserved sub-type, falls back to canonical).
 * @param {Object} citation
 * @returns {string}
 */
export function getBibTeXType(citation) {
  const subKey = normalizeKey(citation?.extra?.subtype || citation?.type);
  return BIBTEX_TYPES[subKey] || BIBTEX_TYPES[normalizeType(citation?.type)] || 'misc';
}

/**
 * RIS reference type for a citation (prefers preserved sub-type, falls back to canonical).
 * @param {Object} citation
 * @returns {string}
 */
export function getRISType(citation) {
  const subKey = normalizeKey(citation?.extra?.subtype || citation?.type);
  return RIS_TYPES[subKey] || RIS_TYPES[normalizeType(citation?.type)] || 'GEN';
}

/**
 * Defensive read-time normaliser. Returns a NEW citation object with guaranteed shapes so a
 * single malformed record can never crash a list render, a formatter, or an exporter.
 *
 * Idempotent and non-destructive: preserves id/projectId/updatedAt and any unknown fields,
 * reconciles field aliases (containerTitle/journal -> siteName, flat volume/issue/page ->
 * extra.*, year -> publicationDate, savedAt -> createdAt), and preserves the original
 * fine-grained type on extra.subtype for credibility/export fidelity.
 *
 * @param {Object} c - raw or partially-normalised citation
 * @returns {Object} normalised citation
 */
export function normalizeCitation(c) {
  if (!c || typeof c !== 'object') {
    return c;
  }

  const extra = c.extra && typeof c.extra === 'object' ? { ...c.extra } : {};

  // Preserve the original fine-grained type before collapsing to canonical.
  const rawType = c.type || extra.subtype || '';
  const type = normalizeType(rawType);
  if (rawType && normalizeKey(rawType) !== type && !extra.subtype) {
    extra.subtype = String(rawType);
  }

  // Reconcile flat journal fields into extra.*
  extra.volume = extra.volume || c.volume || '';
  extra.issue = extra.issue || c.issue || '';
  extra.pages = extra.pages || c.pages || c.page || '';
  if (
    (extra.edition === undefined || extra.edition === null) &&
    c.edition !== undefined &&
    c.edition !== null
  ) {
    extra.edition = c.edition;
  }

  // Authors: always an array of non-empty strings.
  let authors;
  if (Array.isArray(c.authors)) {
    authors = c.authors.filter(a => typeof a === 'string' && a.trim().length > 0);
  } else if (typeof c.authors === 'string' && c.authors.trim()) {
    authors = [c.authors.trim()];
  } else {
    authors = [];
  }

  const tags = Array.isArray(c.tags)
    ? c.tags.filter(t => typeof t === 'string' && t.trim().length > 0)
    : [];

  const hasYear = c.year !== undefined && c.year !== null;
  const publicationDate = c.publicationDate || (hasYear ? String(c.year) : '') || '';
  const siteName = c.siteName || c.containerTitle || c.journal || '';
  const createdAt = c.createdAt || c.savedAt || c.updatedAt || Date.now();

  let title = '';
  if (typeof c.title === 'string') {
    title = c.title;
  } else if (c.title !== undefined && c.title !== null) {
    title = String(c.title);
  }

  return {
    ...c,
    type,
    title,
    url: c.url || '',
    authors,
    tags,
    extra,
    siteName,
    publisher: c.publisher || '',
    publicationDate,
    accessDate: c.accessDate || '',
    doi: c.doi || '',
    notes: c.notes || '',
    createdAt,
  };
}

export default {
  CITATION_TYPES,
  TYPE_LABELS,
  UI_TYPE_OPTIONS,
  normalizeType,
  normalizeCitation,
  getSourceTypeWeight,
  getBibTeXType,
  getRISType,
};
