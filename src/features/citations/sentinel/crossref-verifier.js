/**
 * CrossRef Verifier
 *
 * Pure async function: takes a citation, queries CrossRef by DOI, and returns a
 * deterministic verdict. No DOM, no storage, no state.
 *
 * Verdicts:
 *   'verified'     — DOI found in CrossRef and title matches the saved title
 *   'flagged'      — DOI found but title is substantially different (possible mis-cite)
 *   'unverifiable' — no DOI, invalid DOI, network error, or CrossRef 404
 */

import { fetchDOIMetadata, isValidDOI } from '../crossref-api.js';

/**
 * Normalise a title for loose comparison: lowercase, strip non-alphanumeric, collapse whitespace.
 * @param {string} title
 * @returns {string}
 */
function normalizeTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Return true when either normalized title contains the other.
 * CrossRef records often include subtitles the user omitted — containment handles both directions.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function titlesMatch(a, b) {
  return a.includes(b) || b.includes(a);
}

/**
 * Verify a citation against CrossRef.
 *
 * @param {Object} citation - at minimum { doi, title }
 * @returns {Promise<{ status: 'verified'|'flagged'|'unverifiable', details: Object }>}
 */
export async function verifyCitation(citation) {
  const doi = citation && citation.doi;

  if (!doi || !isValidDOI(doi)) {
    return { status: 'unverifiable', details: { reason: 'no-doi' } };
  }

  let crossrefData;
  try {
    // Runs on its own when a card is drawn, so it never opens the consent panel (ADR 0006).
    crossrefData = await fetchDOIMetadata(doi, { ask: false });
  } catch {
    return { status: 'unverifiable', details: { reason: 'network-error' } };
  }

  if (!crossrefData) {
    return { status: 'unverifiable', details: { reason: 'not-found' } };
  }

  const savedNorm = normalizeTitle(citation.title);
  const crossrefNorm = normalizeTitle(crossrefData.title);

  if (!savedNorm || !crossrefNorm) {
    return { status: 'unverifiable', details: { reason: 'no-title' } };
  }

  return titlesMatch(savedNorm, crossrefNorm)
    ? { status: 'verified', details: { crossrefTitle: crossrefData.title } }
    : {
        status: 'flagged',
        details: { crossrefTitle: crossrefData.title, savedTitle: citation.title },
      };
}

export default { verifyCitation };
