/**
 * What counts as a DOI, in one place: the content-side citation code checks a DOI before asking for
 * it, and the service worker checks it again before it builds a request from it.
 *
 * @module utils/doi
 */

/** DOI format: 10.{4-9 digits}/{suffix}. */
const DOI_PATTERN = /^10\.\d{4,9}\/[-._;()/:A-Z0-9]+$/i;

/** Longer than any registered DOI; a longer string is not one. */
const MAX_DOI_LENGTH = 200;

/**
 * Strip a doi.org link prefix, leaving the bare DOI.
 * @param {string} doi
 * @returns {string}
 */
export function cleanDOI(doi) {
  return String(doi === null || doi === undefined ? '' : doi)
    .trim()
    .replace(/^(https?:\/\/)?(dx\.)?doi\.org\//i, '');
}

/**
 * Is this a DOI, with or without a doi.org link prefix?
 * @param {string} doi
 * @returns {boolean}
 */
export function isValidDOI(doi) {
  if (!doi || typeof doi !== 'string') {
    return false;
  }
  const clean = cleanDOI(doi);
  return clean.length <= MAX_DOI_LENGTH && DOI_PATTERN.test(clean);
}
