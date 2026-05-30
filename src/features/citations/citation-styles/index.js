/**
 * Citation style registry.
 *
 * Single entry point for multi-style formatting. Normalises the citation once (so every style
 * module can assume a clean shape), then delegates to the requested style.
 *
 * Public API:
 *   formatReference(citation, style, options)   -> reference-list entry
 *   formatInText(citation, style, options)      -> in-text citation
 *   formatBibliography(citations, style, options) -> alphabetised, joined references
 *   STYLES / DEFAULT_STYLE                       -> for the style-picker UI
 *
 * `options.html === true` wraps italic parts in <em> (popup preview); default plain text.
 */

import { normalizeCitation } from '../citation-types.js';
import { sortKey } from './shared.js';
import * as harvard from './harvard.js';
import * as apa7 from './apa7.js';
import * as mla9 from './mla9.js';
import * as chicago17 from './chicago17.js';

const FORMATTERS = { harvard, apa7, mla9, chicago17 };

/** Ordered list for the style-picker dropdown. */
export const STYLES = Object.freeze([
  { id: 'harvard', label: 'Harvard (Cite Them Right)' },
  { id: 'apa7', label: 'APA 7th edition' },
  { id: 'mla9', label: 'MLA 9th edition' },
  { id: 'chicago17', label: 'Chicago 17th (author–date)' },
]);

export const DEFAULT_STYLE = 'harvard';

function pick(style) {
  return FORMATTERS[style] || FORMATTERS[DEFAULT_STYLE];
}

/**
 * @param {Object} citation
 * @param {string} [style]
 * @param {{html?: boolean}} [options]
 * @returns {string}
 */
export function formatReference(citation, style = DEFAULT_STYLE, options = {}) {
  return pick(style).formatReference(normalizeCitation(citation), options);
}

/**
 * @param {Object} citation
 * @param {string} [style]
 * @param {{html?: boolean}} [options]
 * @returns {string}
 */
export function formatInText(citation, style = DEFAULT_STYLE, options = {}) {
  return pick(style).formatInText(normalizeCitation(citation), options);
}

/**
 * Alphabetised reference list (by first-author family, then year).
 * @param {Array<Object>} citations
 * @param {string} [style]
 * @param {{html?: boolean}} [options]
 * @returns {string}
 */
export function formatBibliography(citations, style = DEFAULT_STYLE, options = {}) {
  const f = pick(style);
  const normalised = (citations || []).map(normalizeCitation);
  const sorted = [...normalised].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  return sorted.map(c => f.formatReference(c, options)).join('\n\n');
}

export default { STYLES, DEFAULT_STYLE, formatReference, formatInText, formatBibliography };
