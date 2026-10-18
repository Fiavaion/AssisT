/**
 * Markdown outline: the export a student can paste into an essay draft, and the import that lets a
 * map start life in any outliner or notes app.
 *
 * Written form — `# Title`, then one bullet per node indented two spaces per level, `> ` lines under
 * a bullet for its notes, and a trailing ` [src](url)` for where the node came from. A lone
 * `[src](url)` line under the heading records where the whole map started.
 *
 * A node that is ticked off writes as a task list item, `- [x] text`, which is what GitHub, Obsidian
 * and every outliner that understands Markdown will show as a checked box. Its unticked siblings
 * write as `- [ ]` so the list reads as one set of tasks rather than a tick loose among bullets;
 * branches with nothing ticked in them stay plain bullets.
 *
 * Indentation stops at the deepest level an import reads — depths run 0 to MAX_DEPTH - 1. A map
 * nested deeper than that writes its deepest levels as siblings at the last one: a file indented
 * further could not be opened again here, and indentation that grows with every level turns a very
 * deep map into hundreds of megabytes of spaces. Losing levels is worth a word, so the page says so
 * after exporting a map that deep, and names the formats that keep them (see file-menu.js).
 *
 * Reading is deliberately more forgiving than writing, because the file may have come from
 * somewhere else: tabs or any number of spaces per level, `-`, `*` or `+` bullets, Windows line
 * endings, an inconsistent indent step, prose between the bullets, and no heading at all.
 *
 * Forgiving of layout is not trusting of content. The node and depth caps every importer shares
 * apply, a `[src]` link survives only in a scheme a student can safely follow, and the map is
 * assembled once rather than grown an insert at a time (see `import-map.js`).
 */

import { walk } from '../map-ops.js';
import { MAX_DEPTH, startImport } from './import-map.js';
import { safeLink } from './xml-scan.js';

const INDENT = '  ';

/** A tab is one step of indentation, whatever the file's space convention is. */
const indentWidth = whitespace => whitespace.replace(/\t/g, '    ').length;

/** Text a reader would take for a checkbox, and which therefore needs one of its own to survive. */
const LOOKS_LIKE_A_TASK = /^\[[ xX]\]/;

/**
 * Write a map as a markdown outline.
 *
 * @param {Object} map
 * @returns {string} markdown text ending in a newline.
 */
export function toMarkdown(map) {
  const lines = [`# ${map.title}`];
  if (map.source && map.source.url) {
    lines.push(`[src](${map.source.url})`);
  }
  lines.push('');

  // A tick only means something against the other things on the same list, so one done node puts a
  // box on all of its siblings.
  const ticked = new Set();
  walk(map, node => {
    if (node.done && node.parentId) {
      ticked.add(node.parentId);
    }
  });

  walk(map, (node, depth) => {
    const pad = INDENT.repeat(Math.min(depth, MAX_DEPTH - 1));
    const source = node.source && node.source.url ? ` [src](${node.source.url})` : '';
    // A bullet is one line. Text that somehow arrived with a newline in it would otherwise write a
    // second, unindented line that reads back as prose between the bullets — the node's words gone.
    const text = node.text.replace(/\s+/g, ' ').trim();
    const box =
      node.done || ticked.has(node.parentId) || LOOKS_LIKE_A_TASK.test(text)
        ? `[${node.done ? 'x' : ' '}] `
        : '';
    lines.push(`${pad}- ${box}${text}${source}`.trimEnd());
    if (node.notes) {
      for (const noteLine of node.notes.split('\n')) {
        lines.push(`${pad}${INDENT}> ${noteLine}`.trimEnd());
      }
    }
  });

  return `${lines.join('\n')}\n`;
}

/** Pull the rows out of the text: one per bullet, with its notes and source folded in. */
function readRows(text) {
  const rows = [];
  const stack = [];
  let title = null;
  let source = null;

  for (const rawLine of String(text).split(/\r?\n/)) {
    const heading = rawLine.match(/^#{1,6}\s+(.*)$/);
    if (heading && title === null && rows.length === 0) {
      title = heading[1].trim();
      continue;
    }

    const bullet = rawLine.match(/^([ \t]*)[-*+][ \t]*(.*)$/);
    if (bullet) {
      const width = indentWidth(bullet[1]);
      while (stack.length > 0 && width < stack[stack.length - 1]) {
        stack.pop();
      }
      if (stack.length === 0 || width > stack[stack.length - 1]) {
        stack.push(width);
      }
      // A leading checkbox is the tick, not the words; anything after it is the node's own text,
      // including a second checkbox a student actually typed.
      const task = bullet[2].match(/^\[([ xX])\][ \t]*(.*)$/);
      const body = task ? task[2] : bullet[2];
      const withSource = body.match(/^(.*?)\s*\[src\]\(([^)]*)\)$/);
      rows.push({
        depth: stack.length - 1,
        text: withSource ? withSource[1] : body.trim(),
        notes: [],
        url: withSource ? withSource[2] : null,
        done: Boolean(task) && task[1] !== ' ',
      });
      continue;
    }

    const note = rawLine.match(/^[ \t]*>[ \t]?(.*)$/);
    if (note) {
      if (rows.length > 0) {
        rows[rows.length - 1].notes.push(note[1]);
      }
      continue;
    }

    const mapSource = rawLine.match(/^[ \t]*\[src\]\(([^)]*)\)[ \t]*$/);
    if (mapSource && rows.length === 0) {
      source = mapSource[1];
    }
  }

  return { title, source, rows };
}

/**
 * Read a markdown outline into a map.
 *
 * A file with exactly one top-level bullet keeps that bullet as its root, which is what makes an
 * AssisT export round-trip exactly. A file with none, or with several, gets a root built from the
 * title — the shape most outliners write.
 *
 * @param {string} text
 * @param {Object} [options]
 * @param {string} [options.title='Imported map'] - used when the file carries no heading.
 * @param {string} [options.id] - map id; taken from `ids()` when absent.
 * @param {() => string} [options.ids] - fresh id source; the caller owns id generation because core
 *   never calls crypto.
 * @param {number} [options.maxNodes] - a node cap below the shared 5,000.
 * @param {number} [options.maxDepth] - a depth cap below the shared 100.
 * @returns {Object} a valid map.
 * @throws {MindMapError} TOO_MANY_NODES or TOO_DEEP when the file is past the import caps.
 */
export function fromMarkdown(text, options = {}) {
  const { title: fallbackTitle = 'Imported map', id } = options;
  const build = startImport(options);
  const { title, source, rows } = readRows(text);
  const mapTitle = title || fallbackTitle;
  const mapId = id || build.ids();

  const fieldsOf = row => ({
    text: row.text,
    notes: row.notes.join('\n'),
    url: safeLink(row.url),
    done: row.done,
  });

  const single = rows.length > 0 && rows.filter(row => row.depth === 0).length === 1;
  const root = build.add(null, single ? fieldsOf(rows[0]) : { text: mapTitle });

  // parents[depth] is the record a row at that depth attaches to.
  const parents = [root];
  for (const row of rows.slice(single ? 1 : 0)) {
    const depth = single ? row.depth : row.depth + 1;
    const record = build.add(parents[depth - 1] || root, fieldsOf(row));
    parents[depth] = record;
    parents.length = depth + 1;
  }

  const sourceUrl = safeLink(source);
  return build.finish({
    id: mapId,
    title: mapTitle,
    root,
    source: sourceUrl ? { url: sourceUrl, title: mapTitle } : null,
  });
}
