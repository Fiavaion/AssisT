/**
 * The student's captured quote, as a note other reference managers can carry.
 *
 * RIS, BibTeX, CSL-JSON and CSV have no field for "the source's exact words, and where they are",
 * so an export writes them as the last line of the note, in words Zotero and EndNote show as
 * they are:
 *
 *   Quote (p. 24): “The exact words.”
 *
 * and an import of such a note turns it back into the quote and locator — once, leaving the
 * student's own note as it was — so a file exported and read back matches the record it came
 * from instead of arriving as a duplicate with a second copy of the quote in its note.
 *
 * Pure string functions: no DOM, no Chrome APIs.
 */

import { formatLocator } from './citation-styles/shared.js';

/**
 * The note line an export writes: "Quote (p. 24): “…”" as its last line. Only curly quotation
 * marks round the whole passage count, so a foreign note that merely starts "Quote:" is left alone.
 */
const QUOTE_NOTE = /(?:^|\s)Quote(?: \(([^()]*)\))?: “([\s\S]+)”\s*$/;

/** The page label the export adds to a bare page or range, taken off again on the way back in. */
const ADDED_PAGE_LABEL = /^pp?\. (\d+(?:\s*[-–—]\s*\d+)?)$/;

/**
 * The quote as a note line, or '' when the citation holds no quote.
 * @param {Object} citation
 * @returns {string}
 */
export function quoteNote(citation) {
  const quote = String((citation && citation.quote) || '').trim();
  if (!quote) {
    return '';
  }
  const where = formatLocator(citation.locator, { pageLabels: true });
  return `Quote${where ? ` (${where})` : ''}: “${quote}”`;
}

/**
 * The note an export writes: the student's own note, then the quote line.
 * @param {Object} citation
 * @returns {string}
 */
export function notesWithQuote(citation) {
  return [String((citation && citation.notes) || '').trim(), quoteNote(citation)]
    .filter(Boolean)
    .join('\n');
}

/**
 * Split an imported note into the student's note and the quote line an export wrote, if any.
 * @param {string} notes
 * @returns {{notes: string, quote: string, locator: string}}
 */
export function splitQuoteNote(notes) {
  const text = String(notes || '');
  const found = text.match(QUOTE_NOTE);
  if (!found) {
    return { notes: text, quote: '', locator: '' };
  }
  const where = (found[1] || '').trim();
  const bare = where.match(ADDED_PAGE_LABEL);
  return {
    notes: text.slice(0, found.index).trim(),
    quote: found[2].trim(),
    locator: bare ? bare[1] : where,
  };
}

export default { quoteNote, notesWithQuote, splitQuoteNote };
