/**
 * Plain indented text: the import for everything that is not a file format.
 *
 * It is what Coggle offers as a text export, what a student pastes out of a lecture handout or a
 * notes app, and what they type into a text editor when they are thinking rather than mapping.
 * There is no writer: Markdown already writes an indented outline, and a second one carrying less
 * would be a parallel path (ADR 0003).
 *
 * Reading is forgiving on purpose. Tabs or any number of spaces set the depth, a step that changes
 * part-way through the file is followed rather than refused, and a leading bullet of any common
 * shape is stripped. Ragged indentation produces an odd-looking tree, never an error — a student
 * who pasted the wrong thing should see it and fix it, not be told the file is invalid.
 *
 * The first line is the centre, and every later line at the margin becomes one of its children.
 * That is `markdown.js`'s convention for a document with a single top-level bullet, applied to the
 * case plain text always presents: the file has no heading to make a centre from, so its first line
 * is the only honest candidate.
 *
 * Pasted text is as untrusted as a file: the node and depth caps every importer shares apply here,
 * and the map is assembled once rather than grown an insert at a time (see `import-map.js`).
 */

import { startImport } from './import-map.js';

/** A tab is one step of indentation, whatever the file's space convention is. */
const indentWidth = whitespace => whitespace.replace(/\t/g, '    ').length;

/** `-`, `*`, `+`, `•`, `1.` or `1)` at the head of a line is a bullet, not part of the text. */
const BULLET = /^(?:[-*+•·‣◦]|\d{1,3}[.)])[ \t]*/;

/**
 * Pull one row out of each line that says something, with the depth its indentation implies.
 *
 * @returns {Array<{depth: number, text: string}>} in document order.
 */
function readRows(text) {
  const rows = [];
  const steps = [];

  for (const rawLine of String(text)
    .replace(/^\ufeff/, '')
    .split(/\r?\n/)) {
    const indent = (rawLine.match(/^[ \t]*/) || [''])[0];
    const body = rawLine.slice(indent.length).replace(BULLET, '').trim();
    if (body === '') {
      continue;
    }

    const width = indentWidth(indent);
    while (steps.length > 0 && width < steps[steps.length - 1]) {
      steps.pop();
    }
    if (steps.length === 0 || width > steps[steps.length - 1]) {
      steps.push(width);
    }
    rows.push({ depth: steps.length - 1, text: body });
  }

  return rows;
}

/**
 * Read an indented text outline into a map.
 *
 * @param {string} text
 * @param {Object} [options]
 * @param {string} [options.title='Imported map'] - the map's name when the file says nothing.
 * @param {string} [options.id] - map id; taken from `ids()` when absent.
 * @param {() => string} [options.ids] - fresh id source; core never calls crypto.
 * @param {number} [options.maxNodes] - a node cap below the shared 5,000.
 * @param {number} [options.maxDepth] - a depth cap below the shared 100.
 * @returns {Object} a valid map.
 * @throws {MindMapError} TOO_MANY_NODES or TOO_DEEP when the text is past the import caps.
 */
export function fromOutlineText(text, options = {}) {
  const { title: fallbackTitle = 'Imported map', id } = options;
  const build = startImport(options);
  const rows = readRows(text);
  const centre = rows.length > 0 ? rows[0].text : '';
  const mapId = id || build.ids();
  const root = build.add(null, { text: centre || fallbackTitle });

  // parents[depth] is the record a row at that depth attaches to; a later row back at the margin
  // finds nothing above it and lands on the centre, which is how several top-level lines become
  // children.
  const parents = [root];
  for (const row of rows.slice(1)) {
    const record = build.add(parents[row.depth - 1] || root, { text: row.text });
    parents[row.depth] = record;
    parents.length = row.depth + 1;
  }

  return build.finish({ id: mapId, title: centre || fallbackTitle, root });
}
