/**
 * Shared primitives for all citation styles.
 *
 * Style modules (harvard, apa7, mla9, chicago17) receive an ALREADY-NORMALISED citation
 * (see normalizeCitation in ../citation-types.js): `authors` is always a string[], `type`
 * is canonical, journal fields live on `extra.*`, `siteName` holds the container title.
 *
 * These helpers only provide cross-style building blocks (year, dates, name parsing,
 * italic markers). Author-list grammar differs per style and lives in each style module.
 */

import { extractYear } from '../citation-model.js';

/**
 * Resolve the citation year, falling back to access year, then 'n.d.'.
 * @param {Object} citation - normalised citation
 * @returns {string}
 */
export function getYear(citation) {
  return extractYear(citation.publicationDate) || extractYear(citation.accessDate) || 'n.d.';
}

/**
 * Wrap text in an italic marker for HTML output; plain text passes through unchanged.
 * @param {string} text
 * @param {boolean} html
 * @returns {string}
 */
export function italic(text, html) {
  const value = safe(text);
  if (!value) {
    return '';
  }
  return html ? `<em>${value}</em>` : value;
}

/**
 * Break an ISO/parseable date string into display parts. Returns null when unparseable.
 * @param {string} dateString
 * @returns {{day:number, monthLong:string, monthShort:string, year:number}|null}
 */
export function dateParts(dateString) {
  if (!dateString) {
    return null;
  }
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  return {
    day: d.getDate(),
    monthLong: d.toLocaleString('en-GB', { month: 'long' }),
    monthShort: d.toLocaleString('en-US', { month: 'short' }),
    year: d.getFullYear(),
  };
}

/**
 * Parse an author token into family + given parts. Handles "Family, Given" and "Given Family".
 * A single token (e.g. an organisation) is treated as the family name with empty given.
 * @param {string} raw
 * @returns {{family:string, given:string}}
 */
export function parseAuthor(raw) {
  const name = safe(raw).trim();
  if (!name) {
    return { family: '', given: '' };
  }
  if (name.includes(',')) {
    const [family, ...rest] = name.split(',');
    return { family: family.trim(), given: rest.join(',').trim() };
  }
  const words = name.split(/\s+/);
  if (words.length === 1) {
    return { family: words[0], given: '' };
  }
  const family = words.pop();
  return { family, given: words.join(' ') };
}

/**
 * Build initials from a given-name string. "John Michael" -> "J.M." (or "J. M." when spaced).
 * @param {string} given
 * @param {{spaced?: boolean}} [opts]
 * @returns {string}
 */
export function initials(given, opts = {}) {
  const spaced = opts.spaced === true;
  const parts = safe(given)
    .split(/[\s.]+/)
    .filter(Boolean);
  const ini = parts.map(p => `${p.charAt(0).toUpperCase()}.`);
  return ini.join(spaced ? ' ' : '');
}

/**
 * Coerce a value to a safe string ('' for null/undefined).
 * @param {*} text
 * @returns {string}
 */
export function safe(text) {
  if (text === null || text === undefined) {
    return '';
  }
  return String(text);
}

/**
 * True when the value is an http(s) URL.
 * @param {string} url
 * @returns {boolean}
 */
export function isHttpUrl(url) {
  return /^https?:\/\//i.test(safe(url));
}

/**
 * Sort key for alphabetical bibliographies: first author family (or 'anon') + year.
 * @param {Object} citation - normalised citation
 * @returns {string}
 */
export function sortKey(citation) {
  const first = (citation.authors && citation.authors[0]) || '';
  const family = parseAuthor(first).family.toLowerCase() || 'anon';
  return `${family} ${getYear(citation)}`;
}
