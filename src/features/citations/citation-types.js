/**
 * Citation Types — Single Source of Truth
 *
 * The citation manager historically carried FOUR incompatible `type` vocabularies:
 *   - the data model  (website/book/journal/newspaper/video/social_media/pdf/other)
 *   - the edit-modal <select>  (webpage/bookSection/conferencePaper/report)
 *   - CrossRef's mapper  (journal/book/bookSection/conferencePaper/report/dataset/preprint/webpage)
 *   - the exporter and the credibility weights  (journal-article/book-chapter/news-article …)
 *
 * Because nothing agreed, the formatter funnelled almost everything through `formatWebsite`,
 * export columns came back empty, and credibility scoring defaulted every item to 0.5.
 *
 * This module is the ONE place that defines the canonical vocabulary and the normalisation
 * that converges every producer/consumer onto it. Everything else imports from here.
 *
 * Design notes:
 * - Canonical formatting types are the 10 the registry declares (keeps the formatter small).
 * - Academically-meaningful sub-types that collapse during formatting (conference-paper,
 *   report, preprint, dataset) are preserved on `extra.subtype` so credibility weighting and
 *   BibTeX/RIS export keep their fidelity.
 */

import { getTypeIds, getTypes, getType, UI_ORDER } from './type-registry.js';

/**
 * Canonical citation types used for formatting. Derived from the type registry (single source of
 * truth); aligned with citation-model.js `CitationType`. Adding a canonical type is one
 * registerType() call in type-registry.js — these tables follow automatically.
 * @enum {string}
 */
export const CITATION_TYPES = Object.freeze(
  Object.fromEntries(getTypeIds().map(id => [id.toUpperCase(), id]))
);

/** Set of canonical values for fast membership checks. */
const CANONICAL = new Set(getTypeIds());

/** Human-readable labels for canonical types (UI display), derived from the registry. */
export const TYPE_LABELS = Object.freeze(Object.fromEntries(getTypes().map(t => [t.id, t.label])));

/**
 * Options for the edit-modal <select>. These MUST emit canonical values so a saved
 * citation never carries a non-canonical type again. Ordered per the registry's UI_ORDER.
 * @type {Array<{value: string, label: string}>}
 */
export const UI_TYPE_OPTIONS = Object.freeze(
  UI_ORDER.map(id => ({ value: id, label: (getType(id) || {}).label }))
);

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
  // chapter family (a chapter in an edited book — its own canonical type)
  booksection: 'chapter',
  'book-section': 'chapter',
  'book-chapter': 'chapter',
  bookchapter: 'chapter',
  inbook: 'chapter',
  incollection: 'chapter',
  // thesis family
  phdthesis: 'thesis',
  mastersthesis: 'thesis',
  dissertation: 'thesis',
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
 * Fine-grained credibility weights. Canonical weights come from the type registry; the keys below
 * are academic SUB-types and legacy aliases that carry a different weight from their canonical
 * parent, so a CrossRef `journal-article` or `report` keeps its true weight even though it
 * formats as `journal` / `website`.
 */
const SUBTYPE_WEIGHTS = Object.freeze({
  ...Object.fromEntries(getTypes().map(t => [t.id, t.weight])),
  'journal-article': 1.0,
  'book-chapter': 0.9,
  booksection: 0.9,
  'conference-paper': 0.85,
  conferencepaper: 0.85,
  'proceedings-article': 0.85,
  report: 0.8,
  preprint: 0.7,
  'posted-content': 0.7,
  dataset: 0.7,
  'news-article': 0.6,
  webpage: 0.5,
  'blog-post': 0.4,
  blog: 0.4,
  'social-media': 0.3,
  unknown: 0.5,
});

/** Canonical-type fallback weights when no sub-type is recorded (from the registry). */
const CANONICAL_WEIGHTS = Object.freeze(Object.fromEntries(getTypes().map(t => [t.id, t.weight])));

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

/** BibTeX entry types. Canonical types come from the registry; sub-types/aliases override. */
const BIBTEX_TYPES = Object.freeze({
  ...Object.fromEntries(getTypes().map(t => [t.id, t.bibtex])),
  'journal-article': 'article',
  'news-article': 'article',
  booksection: 'incollection',
  'book-chapter': 'incollection',
  phdthesis: 'phdthesis',
  'conference-paper': 'inproceedings',
  conferencepaper: 'inproceedings',
  'proceedings-article': 'inproceedings',
  report: 'techreport',
  webpage: 'misc',
  'social-media': 'misc',
});

/** RIS reference types. Canonical types come from the registry; sub-types/aliases override. */
const RIS_TYPES = Object.freeze({
  ...Object.fromEntries(getTypes().map(t => [t.id, t.ris])),
  'journal-article': 'JOUR',
  booksection: 'CHAP',
  'book-chapter': 'CHAP',
  'conference-paper': 'CONF',
  conferencepaper: 'CONF',
  report: 'RPRT',
  'news-article': 'NEWS',
  webpage: 'ELEC',
  'social-media': 'ELEC',
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

/** The "no author" placeholder older captures stored in the author field. */
const ANON_PLACEHOLDER = /^anon\.?$/i;

/** A run of C0 control characters and DEL. */
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]+/g;

/**
 * A name or title without control characters. The styles use some as private marks (italics, an
 * organisation author), so one arriving in a record could mark itself, and none belongs in a
 * BibTeX or RIS file. A line break or tab becomes one space ("\r\n" included), so the words either
 * side stay apart.
 * @param {string} text
 * @returns {string}
 */
function withoutControlCharacters(text) {
  return text.replace(CONTROL_CHARACTERS, run => (/\s/.test(run) ? ' ' : ''));
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

  // Chapter / thesis fields. Kept on `extra` (no schema change) and only when they carry a
  // value, so an ordinary web page never grows empty book-chapter keys. Flat top-level forms
  // (a BibTeX importer writing `place`, a manual form writing `institution`) fold into `extra`.
  for (const key of ['place', 'chapter', 'institution', 'thesisType']) {
    const value = extra[key] !== undefined && extra[key] !== null ? extra[key] : c[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      extra[key] = String(value);
    }
  }

  // Editors of the containing book: always an array of non-empty "Family, Given" strings.
  const rawEditors = extra.editors !== undefined ? extra.editors : c.editors;
  if (rawEditors !== undefined && rawEditors !== null) {
    const editors = Array.isArray(rawEditors) ? rawEditors : [rawEditors];
    const cleaned = editors
      .filter(e => typeof e === 'string')
      .map(withoutControlCharacters)
      .filter(e => e.trim().length > 0);
    if (cleaned.length > 0) {
      extra.editors = cleaned;
    } else {
      delete extra.editors;
    }
  }

  // Authors: always an array of real names. "Anon." is the placeholder older captures stored when a
  // page named nobody; it is not a name, and no style prints it (the title takes the author's
  // place), so it is dropped here. A work signed "Anonymous" keeps that author.
  let authors;
  if (Array.isArray(c.authors)) {
    authors = c.authors.filter(a => typeof a === 'string').map(withoutControlCharacters);
  } else if (typeof c.authors === 'string') {
    authors = [withoutControlCharacters(c.authors).trim()];
  } else {
    authors = [];
  }
  authors = authors.filter(a => a.trim().length > 0 && !ANON_PLACEHOLDER.test(a.trim()));

  // Which authors are organisations, by name exactly as it stands in `authors`, so the styles
  // print "World Health Organization" whole rather than as "Organization, W. H.". A name that is no
  // longer among the authors has nothing to describe, and an empty list is no list.
  if (extra.organisationAuthors !== undefined) {
    const named = new Set(authors.map(a => a.trim()));
    const organisations = Array.isArray(extra.organisationAuthors)
      ? extra.organisationAuthors
          .filter(o => typeof o === 'string')
          .map(withoutControlCharacters)
          .filter(o => named.has(o.trim()))
      : [];
    if (organisations.length > 0) {
      extra.organisationAuthors = [...new Set(organisations.map(o => o.trim()))];
    } else {
      delete extra.organisationAuthors;
    }
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
    title = withoutControlCharacters(c.title);
  } else if (c.title !== undefined && c.title !== null) {
    title = withoutControlCharacters(String(c.title));
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
    // Grade-protection fields (non-indexed — no schema migration needed):
    // quote = the source's exact words captured at read time (kept visibly "not your words");
    // locator = where it lives (page, paragraph, timestamp) so a quoted in-text citation can
    // carry "(Author, Year, p. X)" — the attribution details markers penalise hardest.
    quote: typeof c.quote === 'string' ? c.quote : '',
    locator: typeof c.locator === 'string' ? c.locator.trim() : '',
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
