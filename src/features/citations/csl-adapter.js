/**
 * CSL-JSON adapter.
 *
 * CSL-JSON is the canonical INTERCHANGE model for citations: it is the input format a CSL
 * processor (citeproc) expects, it structures author names as objects, and it is the cleanest
 * shape to hand to AI features (e.g. the claim Sentinel) and to a CSL-JSON export.
 *
 * Storage stays in the flat AssisT shape (see citation-types.js `normalizeCitation`), which is
 * losslessly convertible to and from CSL-JSON via the two functions here. We deliberately do NOT
 * store a second nested CSL copy on every record — that would be a duplicate source of truth.
 *
 * Round-trip contract: `fromCSL(toCSL(x))` deep-equals `normalizeCitation(x)`. Fields CSL cannot
 * model (our canonical type, tags, projectId, timestamps, leftover `extra.*`) ride in a single
 * namespaced overflow key so the round-trip is exact; a foreign CSL item with no overflow still
 * converts to a sensible flat record.
 */

import { parseAuthor, shortTitle } from './citation-styles/shared.js';
import { normalizeType, normalizeCitation } from './citation-types.js';
import { extractYear } from './citation-model.js';
import { notesWithQuote, splitQuoteNote } from './citation-quote-note.js';

/** Overflow key carrying non-CSL fields needed for an exact flat round-trip. */
const OVERFLOW_KEY = 'assist:extras';

/** Canonical AssisT type → CSL-JSON `type`. */
const CANONICAL_TO_CSL = Object.freeze({
  website: 'webpage',
  book: 'book',
  chapter: 'chapter',
  journal: 'article-journal',
  newspaper: 'article-newspaper',
  video: 'motion_picture',
  social_media: 'post',
  pdf: 'webpage',
  thesis: 'thesis',
  other: 'document',
});

const pad = n => String(n).padStart(2, '0');

/** '' for null/undefined, the string otherwise. */
const safeString = v => (v === null || v === undefined ? '' : String(v));

/**
 * Flat name strings → CSL name objects ({family, given, suffix} or {literal} for organisations
 * and single tokens). Used for both `author` and `editor`.
 * @param {Array<string>} names
 * @param {Array<string>} [organisations] - the names the record says are organisations
 */
function namesToCSL(names, organisations = []) {
  return (names || [])
    .filter(a => typeof a === 'string' && a.trim())
    .map(a => {
      const { family, given, suffix } = parseAuthor(a);
      if (!given || organisations.includes(a.trim())) {
        return { literal: a.trim() };
      }
      return suffix ? { family, given, suffix } : { family, given };
    });
}

/** CSL name objects → flat name strings ("Family, Given, Jr." / literal). */
function namesFromCSL(cslNames) {
  return (cslNames || [])
    .map(a => {
      if (!a || typeof a !== 'object') {
        return '';
      }
      if (a.literal) {
        return String(a.literal);
      }
      const base = a.family && a.given ? `${a.family}, ${a.given}` : a.family || a.given || '';
      return base && a.suffix ? `${base}, ${a.suffix}` : base;
    })
    .filter(Boolean);
}

/** A date string → CSL `{ 'date-parts': [[y(, m(, d))]] }`, preserving the source's precision. */
function dateToCSL(dateString) {
  const s = String(dateString || '').trim();
  if (!s) {
    return undefined;
  }
  if (/^\d{4}$/.test(s)) {
    return { 'date-parts': [[Number(s)]] };
  }
  const iso = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/);
  if (iso) {
    const parts = [Number(iso[1]), Number(iso[2])];
    if (iso[3]) {
      parts.push(Number(iso[3]));
    }
    return { 'date-parts': [parts] };
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return { 'date-parts': [[d.getFullYear(), d.getMonth() + 1, d.getDate()]] };
  }
  const y = extractYear(s);
  return y ? { 'date-parts': [[Number(y)]] } : undefined;
}

/** CSL `issued`/`accessed` → flat date string ('YYYY' | 'YYYY-MM' | 'YYYY-MM-DD' | ''). */
function cslDateToString(issued) {
  const parts = issued && issued['date-parts'] && issued['date-parts'][0];
  if (!Array.isArray(parts) || parts.length === 0) {
    return '';
  }
  const [y, m, d] = parts;
  if (m && d) {
    return `${y}-${pad(m)}-${pad(d)}`;
  }
  if (m) {
    return `${y}-${pad(m)}`;
  }
  return String(y);
}

/**
 * Convert a flat AssisT citation to a CSL-JSON item.
 * @param {Object} flat - raw or normalised citation
 * @returns {Object} CSL-JSON item (with an `assist:extras` overflow key)
 */
export function toCSL(flat) {
  const c = normalizeCitation(flat) || {};
  const extra = c.extra || {};

  const csl = {
    type: CANONICAL_TO_CSL[c.type] || 'document',
    title: c.title || '',
  };
  // The short title the styles print in text, so a CSL processor can shorten a no-author work's
  // citation the same way.
  const short = shortTitle(c.title);
  if (short && short !== String(c.title || '').trim()) {
    csl['title-short'] = short;
  }
  // A video's platform is its publisher, with the genre "Video": the shape Zotero writes, and the
  // one CSL styles print as "[Video]. YouTube." rather than as a container.
  const isVideo = c.type === 'video';
  if (c.url) {
    csl.URL = c.url;
  }
  if (c.doi) {
    csl.DOI = c.doi;
  }
  if (c.isbn) {
    csl.ISBN = c.isbn;
  }
  if (c.issn) {
    csl.ISSN = c.issn;
  }
  if (c.siteName && !isVideo) {
    csl['container-title'] = c.siteName;
  }
  // A thesis names its institution where CSL expects a publisher, so a citeproc run or an export
  // shows the awarding body rather than nothing.
  const publisher =
    (isVideo && c.siteName) ||
    c.publisher ||
    (c.type === 'thesis' ? safeString(extra.institution) : '');
  if (publisher) {
    csl.publisher = publisher;
  }
  const authors = namesToCSL(c.authors, extra.organisationAuthors);
  if (authors.length) {
    csl.author = authors;
  }
  const editors = namesToCSL(extra.editors);
  if (editors.length) {
    csl.editor = editors;
  }
  if (extra.place) {
    csl['publisher-place'] = safeString(extra.place);
  }
  if (extra.edition) {
    csl.edition = safeString(extra.edition);
  }
  if (extra.thesisType) {
    csl.genre = safeString(extra.thesisType);
  } else if (isVideo) {
    csl.genre = 'Video';
  }
  const issued = dateToCSL(c.publicationDate);
  if (issued) {
    csl.issued = issued;
  }
  const accessed = dateToCSL(c.accessDate);
  if (accessed) {
    csl.accessed = accessed;
  }
  if (extra.volume) {
    csl.volume = String(extra.volume);
  }
  if (extra.issue) {
    csl.issue = String(extra.issue);
  }
  if (extra.pages) {
    csl.page = String(extra.pages);
  }
  // The student's note, then the captured quote and its page, which CSL has no field for.
  const note = notesWithQuote(c);
  if (note) {
    csl.note = note;
  }

  // Overflow: our own exact copy of the leftover flat fields. volume/issue/pages are dropped
  // because they map 1:1 onto CSL; editors/place/edition/thesisType stay, because rebuilding
  // them from CSL would re-order a name the student typed in their own order.
  const { volume, issue, pages, ...restExtra } = extra;
  void volume;
  void issue;
  void pages;
  const overflow = {
    type: c.type,
    extra: restExtra,
    tags: c.tags || [],
    projectId: c.projectId ?? null,
  };
  if (c.publisher !== (csl.publisher || '')) {
    // A thesis lends its institution, and a video its platform, to the CSL publisher slot; the
    // flat record kept them apart, so the flat value rides along and the round-trip stays exact.
    overflow.publisher = c.publisher || '';
  }
  if ((c.siteName || '') !== (csl['container-title'] || '')) {
    overflow.siteName = c.siteName || '';
  }
  if (c.id !== undefined) {
    overflow.id = c.id;
  }
  if (c.createdAt !== undefined) {
    overflow.createdAt = c.createdAt;
  }
  if (c.updatedAt !== undefined) {
    overflow.updatedAt = c.updatedAt;
  }
  csl[OVERFLOW_KEY] = overflow;

  return csl;
}

/**
 * Convert a CSL-JSON item to a flat AssisT citation. Reads the overflow bag when present (exact
 * round-trip); otherwise reconstructs best-effort from CSL fields (foreign import).
 * @param {Object} csl - CSL-JSON item
 * @returns {Object} normalised flat citation
 */
export function fromCSL(csl) {
  if (!csl || typeof csl !== 'object') {
    return csl;
  }
  const ov = csl[OVERFLOW_KEY] || {};
  const type = ov.type || normalizeType(csl.type);

  const extra = { ...(ov.extra || {}) };
  if (csl.volume) {
    extra.volume = String(csl.volume);
  }
  if (csl.issue) {
    extra.issue = String(csl.issue);
  }
  if (csl.page) {
    extra.pages = String(csl.page);
  }
  // A foreign item carries no overflow bag, so the chapter/thesis fields are read back out of
  // CSL proper. Our own items keep the bag's copy, which is exact.
  if (!csl[OVERFLOW_KEY]) {
    if (Array.isArray(csl.editor) && csl.editor.length) {
      extra.editors = namesFromCSL(csl.editor);
    }
    if (csl['publisher-place']) {
      extra.place = String(csl['publisher-place']);
    }
    if (csl.edition) {
      extra.edition = String(csl.edition);
    }
    // A video's genre ("Video") describes the medium, not a degree.
    if (csl.genre && type !== 'video') {
      extra.thesisType = String(csl.genre);
    }
    if (type === 'thesis' && csl.publisher) {
      extra.institution = String(csl.publisher);
    }
    // CSL writes an organisation as a `literal` name, which is never split or inverted.
    const organisations = (Array.isArray(csl.author) ? csl.author : [])
      .filter(a => a && typeof a === 'object' && a.literal)
      .map(a => String(a.literal));
    if (organisations.length) {
      extra.organisationAuthors = organisations;
    }
  }

  // A foreign video written as Zotero writes one names its platform as the publisher.
  const platformAsPublisher =
    !csl[OVERFLOW_KEY] && type === 'video' && !csl['container-title'] && csl.publisher;
  let siteName = csl['container-title'] || '';
  let publisher = csl.publisher || '';
  if (ov.siteName !== undefined) {
    siteName = ov.siteName;
  } else if (platformAsPublisher) {
    siteName = String(csl.publisher);
    publisher = '';
  }
  if (ov.publisher !== undefined) {
    publisher = ov.publisher;
  }

  // The quote line our own export wrote into the note comes back as the quote, once.
  const { notes, quote, locator } = splitQuoteNote(csl.note);
  const captured = { notes, ...(quote ? { quote, locator } : {}) };

  const flat = {
    type,
    url: csl.URL || '',
    title: csl.title || '',
    authors: namesFromCSL(csl.author),
    publicationDate: cslDateToString(csl.issued),
    accessDate: cslDateToString(csl.accessed),
    publisher,
    siteName,
    doi: csl.DOI || '',
    isbn: csl.ISBN || '',
    issn: csl.ISSN || '',
    extra,
    ...captured,
    tags: ov.tags || [],
    projectId: ov.projectId ?? null,
  };
  if (ov.id !== undefined) {
    flat.id = ov.id;
  }
  if (ov.createdAt !== undefined) {
    flat.createdAt = ov.createdAt;
  }
  if (ov.updatedAt !== undefined) {
    flat.updatedAt = ov.updatedAt;
  }

  return normalizeCitation(flat);
}

export default { toCSL, fromCSL };
