/**
 * Citation Formatter — back-compat shim.
 *
 * The Harvard (Cite Them Right) implementation moved into ./citation-styles/ as part of the
 * multi-style overhaul. This module preserves the original import surface
 * (formatInText / formatReference / formatBibliography / formatReferenceHTML) so existing
 * callers keep working unchanged — now backed by the multi-style engine, defaulting to Harvard.
 *
 * New code should import directly from ./citation-styles/index.js and pass an explicit style id.
 */

import {
  formatInText as styleInText,
  formatReference as styleReference,
  formatBibliography as styleBibliography,
  DEFAULT_STYLE,
} from './citation-styles/index.js';

/**
 * In-text citation (Harvard by default).
 * @param {Object} citation
 * @param {string} [style]
 * @param {{html?: boolean}} [options]
 * @returns {string}
 */
export function formatInText(citation, style = DEFAULT_STYLE, options = {}) {
  return styleInText(citation, style, options);
}

/**
 * Full reference-list entry (Harvard by default).
 * @param {Object} citation
 * @param {string} [style]
 * @param {{html?: boolean}} [options]
 * @returns {string}
 */
export function formatReference(citation, style = DEFAULT_STYLE, options = {}) {
  return styleReference(citation, style, options);
}

/**
 * Alphabetised bibliography (Harvard by default).
 * @param {Array<Object>} citations
 * @param {string} [style]
 * @param {{html?: boolean}} [options]
 * @returns {string}
 */
export function formatBibliography(citations, style = DEFAULT_STYLE, options = {}) {
  return styleBibliography(citations, style, options);
}

/**
 * Wrap a formatted reference string in a hanging-indent paragraph for HTML display.
 * @param {string} reference
 * @returns {string}
 */
export function formatReferenceHTML(reference) {
  return `<p style="margin-left: 2em; text-indent: -2em;">${reference}</p>`;
}

export default {
  formatInText,
  formatReference,
  formatBibliography,
  formatReferenceHTML,
};
