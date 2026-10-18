/**
 * Duplicate-detection for citations.
 *
 * Computes a normalised identity key for each citation using the strongest available signal
 * (DOI > URL > content fingerprint), then surfaces duplicate groups and produces a stable
 * deduplicated set. Fully DETERMINISTIC — no chrome APIs, no DOM, no network, no AI.
 *
 * Philosophy: prefer the weakest possible signal that is still unambiguous. DOI is a canonical
 * global identifier; URL collapses protocol/case/trailing-slash noise; the content key handles
 * records with neither, using title + first-author family name + publication year.
 */

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Collapse runs of whitespace to a single space and trim.
 * @param {string} s
 * @returns {string}
 */
function collapseWS(s) {
  return String(s || '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Extract the "family" part from an author string.
 * Handles "Family, Given" (comma-separated) and "Given Family" (space-separated).
 * @param {string} author
 * @returns {string} lowercased family name, or '' if the author string is absent.
 */
function familyName(author) {
  const a = String(author || '').trim();
  if (!a) {
    return '';
  }
  const commaIdx = a.indexOf(',');
  if (commaIdx !== -1) {
    return a.slice(0, commaIdx).trim().toLowerCase();
  }
  const parts = a.split(/\s+/);
  return parts[parts.length - 1].toLowerCase();
}

/**
 * Extract the first 4-digit run from a date string, or return ''.
 * @param {string} date
 * @returns {string}
 */
function extractYear(date) {
  const m = String(date || '').match(/\d{4}/);
  return m ? m[0] : '';
}

/**
 * Normalise a URL to `host + pathname` (lowercased, trailing slash removed,
 * querystring and hash dropped). Returns null if the URL is empty.
 * Falls back to the raw lowercased-trimmed string if URL parsing throws.
 * @param {string} rawUrl
 * @returns {string|null}
 */
function normaliseUrl(rawUrl) {
  const u = String(rawUrl || '').trim();
  if (!u) {
    return null;
  }
  try {
    const parsed = new URL(u);
    const path = parsed.pathname.replace(/\/+$/, '') || '';
    return (parsed.host + path).toLowerCase();
  } catch {
    return u.toLowerCase();
  }
}

/**
 * Strip a leading "https://doi.org/" (or "http://doi.org/" or "doi.org/") prefix
 * from a DOI string and lowercase the result.
 * @param {string} doi
 * @returns {string}
 */
function normaliseDoi(doi) {
  return String(doi || '')
    .trim()
    .replace(/^https?:\/\/doi\.org\//i, '')
    .replace(/^doi\.org\//i, '')
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute a normalised identity key for a citation.
 *
 * Priority:
 *   a. DOI present  → `doi:<normalised-doi>`
 *   b. URL present  → `url:<normalised-url>`
 *   c. Otherwise    → `c:<title>|<firstAuthorFamily>|<year>` (all lowercased)
 *
 * Two citations are considered "the same" iff their `citationKey` values are equal.
 *
 * @param {object} citation - A flat citation record (see the project citation shape).
 * @returns {string} A normalised, stable identity string.
 */
export function citationKey(citation) {
  const { doi, url, title = '', authors = [], publicationDate = '' } = citation || {};

  // a. DOI
  const doiNorm = normaliseDoi(doi);
  if (doiNorm) {
    return `doi:${doiNorm}`;
  }

  // b. URL
  const urlNorm = normaliseUrl(url);
  if (urlNorm) {
    return `url:${urlNorm}`;
  }

  // c. Content fingerprint
  const t = collapseWS(title).toLowerCase();
  const f = familyName(Array.isArray(authors) && authors.length ? authors[0] : '');
  const y = extractYear(publicationDate);
  return `c:${t}|${f}|${y}`;
}

/**
 * Find groups of citations that share the same identity key.
 *
 * Only groups with MORE THAN ONE member are returned; singletons are omitted.
 * Input order is preserved within each group, and groups are returned in the
 * order their first member appears in the input array.
 *
 * @param {object[]} citations - Array of flat citation records.
 * @returns {{ key: string, members: object[] }[]} Duplicate groups only.
 */
export function findDuplicateGroups(citations) {
  /** @type {Map<string, object[]>} */
  const map = new Map();
  for (const c of citations) {
    const k = citationKey(c);
    if (!map.has(k)) {
      map.set(k, []);
    }
    map.get(k).push(c);
  }
  const groups = [];
  for (const [key, members] of map) {
    if (members.length > 1) {
      groups.push({ key, members });
    }
  }
  return groups;
}

/** Separator placed between two different notes when duplicate copies are merged. */
export const MERGED_NOTES_SEPARATOR = '\n\n---\n\n';

/** Single-valued fields the student wrote or chose; two different values cannot both be kept. */
const SINGLE_STUDENT_FIELDS = ['quote', 'locator', 'projectId'];

function text(value) {
  return String(value ?? '').trim();
}

function tagList(citation) {
  return Array.isArray(citation.tags) ? citation.tags.filter(t => text(t)) : [];
}

/**
 * Fold `other`'s student-authored data into `target` (a copy the caller owns).
 * Returns the single-valued fields where both hold different non-empty values.
 */
function absorbStudentData(target, other) {
  const conflicts = [];
  for (const field of SINGLE_STUDENT_FIELDS) {
    const mine = text(target[field]);
    const theirs = text(other[field]);
    if (!theirs || mine === theirs) {
      continue;
    }
    if (mine) {
      conflicts.push(field);
    } else {
      target[field] = other[field];
    }
  }

  // A note the target already holds (the same note, or one merged in earlier) is not repeated;
  // any other note is appended, never replaced. Notes are compared whole, one merged note at a
  // time: as substrings, "p. 4" read as already held inside "p. 45 argues …" and was discarded.
  const mineNotes = text(target.notes);
  const theirNotes = text(other.notes);
  const held = mineNotes.split(MERGED_NOTES_SEPARATOR).map(text);
  if (theirNotes && !held.includes(theirNotes)) {
    target.notes = mineNotes ? mineNotes + MERGED_NOTES_SEPARATOR + theirNotes : theirNotes;
  }

  const tags = tagList(target);
  for (const tag of tagList(other)) {
    if (!tags.some(t => text(t) === text(tag))) {
      tags.push(tag);
    }
  }
  if (tags.length) {
    target.tags = tags;
  }
  return conflicts;
}

/** True when folding `other` into `target` would change nothing the student wrote. */
function addsNothing(target, other) {
  const probe = { ...target, tags: tagList(target) };
  const conflicts = absorbStudentData(probe, other);
  return (
    conflicts.length === 0 &&
    SINGLE_STUDENT_FIELDS.every(f => text(probe[f]) === text(target[f])) &&
    text(probe.notes) === text(target.notes) &&
    probe.tags.length === tagList(target).length
  );
}

/**
 * Deduplicate a citation array without losing anything the student wrote.
 *
 * Metadata (title, authors, DOI, URL, ...) follows the first occurrence of each identity key.
 * The student's own material — quote, locator, notes, tags and collection (`projectId`) — is
 * never discarded:
 *
 * - A later copy whose student data the first copy already holds goes to `removed`.
 * - A later copy that adds student data stays in `kept`, and the group appears in `merges`:
 *   `citation` is the first copy (same id, same metadata) carrying the union of every copy's
 *   student data, and `absorbed` lists the copies it replaces. Tags are unioned; different notes
 *   are joined with MERGED_NOTES_SEPARATOR; a quote, locator or collection only one copy has is
 *   taken from it. A caller applies a merge by writing `citation` back and only then removing
 *   `absorbed` — removing without the write loses the work.
 * - When two copies hold different non-empty values for a quote, a locator or a collection,
 *   one record cannot hold both, so the whole group stays in `kept` untouched and appears in
 *   `conflicts` with the fields that differ, for the student to resolve.
 *
 * The operation is stable — relative order within `kept` and `removed` matches the input.
 *
 * Invariant: `kept.length + removed.length === citations.length`.
 *
 * @param {object[]} citations - Array of flat citation records.
 * @returns {{ kept: object[], removed: object[],
 *             merges: { citation: object, absorbed: object[] }[],
 *             conflicts: { key: string, members: object[], fields: string[] }[] }}
 */
export function dedupeCitations(citations) {
  const removedSet = new Set();
  const merges = [];
  const conflicts = [];

  for (const { key, members } of findDuplicateGroups(citations)) {
    const [first, ...rest] = members;
    const merged = { ...first, tags: tagList(first) };
    const fields = new Set();
    for (const other of rest) {
      absorbStudentData(merged, other).forEach(f => fields.add(f));
    }
    if (fields.size) {
      conflicts.push({ key, members, fields: SINGLE_STUDENT_FIELDS.filter(f => fields.has(f)) });
      continue;
    }
    const absorbed = [];
    for (const other of rest) {
      if (addsNothing(first, other)) {
        removedSet.add(other);
      } else {
        absorbed.push(other);
      }
    }
    if (absorbed.length) {
      merges.push({ citation: merged, absorbed });
    }
  }

  const kept = [];
  const removed = [];
  for (const c of citations) {
    (removedSet.has(c) ? removed : kept).push(c);
  }
  return { kept, removed, merges, conflicts };
}
