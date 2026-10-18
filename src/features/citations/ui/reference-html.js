/**
 * The one way a formatted reference reaches the screen.
 *
 * A reference is the only citation string that is NOT plain text: the styles italicise a book
 * title, a journal name, a volume number, and a student needs to see what their reference list is
 * going to look like before they paste it. The card showed those italics; the wizard's CHECK step
 * and the style switcher showed the same reference as flat text, so the preview the student
 * reviewed was not the reference they got.
 *
 * So all three come through here. `formatReference(…, { html: true })` escapes the record's own
 * metadata and emits only <em> (see citation-styles/index.js), and this module allows only <em>/<i>
 * with no attributes at all — two independent reasons a scraped title cannot become markup.
 *
 * DOMPurify is imported here rather than read off `window`. `utils/sanitize.js` takes the global
 * that `content-simple.js` and `popup.js` install, and THROWS when it is absent — but a card is
 * also drawn on the full-page citation library, which loads `library.js` and nothing else. Reading
 * the global there threw inside every card's constructor, so the page rendered an empty library
 * over a database full of the student's sources. A card must not depend on which entry point
 * happened to load it.
 *
 * Public API:
 *   renderReference(target, citation, style, set) -> paints one reference into `target`, as it
 *                                               reads in its reference list `set`
 *   sanitizeReferenceHtml(html)              -> for a caller that already has reference HTML in
 *                                               hand (the style switcher diffs it before painting)
 */

import DOMPurify from 'dompurify';
import { formatReference } from '../citation-styles/index.js';

/** Italics and nothing else — no attributes, so there is no sink for an event handler or a URL. */
const REFERENCE_HTML = Object.freeze({ ALLOWED_TAGS: ['em', 'i'], ALLOWED_ATTR: [] });

/**
 * Sanitise a reference that is already in HTML form (a diffed fragment, say).
 * @param {string} html
 * @returns {string}
 */
export function sanitizeReferenceHtml(html) {
  if (!html || typeof html !== 'string') {
    return '';
  }
  return DOMPurify.sanitize(html, REFERENCE_HTML);
}

/**
 * Paint a citation's reference — italics and all — into an element.
 * @param {HTMLElement} target - the element that holds the reference
 * @param {Object} citation
 * @param {string} style - citation style id
 * @param {Object[]} [set] - the reference list it belongs to (its year letter comes from here)
 */
export function renderReference(target, citation, style, set = []) {
  target.innerHTML = sanitizeReferenceHtml(formatReference(citation, style, { html: true, set }));
}

export default { sanitizeReferenceHtml, renderReference };
