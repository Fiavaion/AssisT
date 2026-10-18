/**
 * The shape a highlighted selection takes on its way into a map.
 *
 * A branch label is one line: markdown writes a node as a single bullet, and a canvas box is
 * measured from a single run of text, so the newlines a page leaves in a selection have to go. The
 * quote is the student's own evidence and keeps its paragraphs — only the empty space a page
 * leaves between them is closed up, so the inspector shows the words rather than a column of gaps.
 */

/** The label cannot be longer than a branch can carry. */
const TEXT_LIMIT = 200;

/** Enough of the selection to recognise it later, without storing a whole article per node. */
const QUOTE_LIMIT = 1000;

/**
 * @param {string} selection - the raw selected text.
 * @returns {{text: string, quote: string}} the node label and the quote to keep beside it.
 */
export function captureFromSelection(selection) {
  const raw = String(selection ?? '').trim();
  return {
    text: raw.replace(/\s+/g, ' ').slice(0, TEXT_LIMIT),
    quote: raw
      .replace(/\r\n/g, '\n')
      .replace(/\n[ \t]*(?:\n[ \t]*)+/g, '\n\n')
      .slice(0, QUOTE_LIMIT),
  };
}
