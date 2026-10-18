/**
 * OPML: the outline interchange format every outliner reads, so a map can leave for MindNode,
 * OmniOutliner or Workflowy and come back.
 *
 * Standard `<outline text="" _note="">`; a node's captured source rides in `_source`, and the page
 * the map started from in `<head><sourceUrl>`. Underscore-prefixed attributes are OPML's own
 * convention for extensions, so a reader that does not know them ignores them.
 *
 * Reading goes through the scanner every XML importer shares (`xml-scan.js`), because core has no
 * DOM (ADR 0001). It accepts single quotes, comments, a missing declaration, stray whitespace and
 * `>` inside an attribute value, and decodes named and numeric escapes; it refuses a file that is
 * cut short or declares its own entities, rather than importing the half it could read. The node
 * and depth caps every importer shares apply, and a source link survives only in a scheme a
 * student can safely follow.
 */

import { MindMapError } from '../map-model.js';
import { walk } from '../map-ops.js';
import { MAX_DEPTH, startImport } from './import-map.js';
import { escapeXml, safeLink, scanXml } from './xml-scan.js';

/**
 * Indentation is for a person reading the file and carries no structure, so it stops growing at the
 * deepest level an import reads — depths run 0 to MAX_DEPTH - 1 — and levels past that are written
 * at the same inset. Without the clamp a very deep map is mostly spaces, by the hundred megabyte.
 */
const padFor = depth => '  '.repeat(Math.min(depth, MAX_DEPTH - 1) + 2);

/**
 * Write a map as OPML 2.0.
 *
 * @param {Object} map
 * @returns {string} an OPML document ending in a newline.
 */
export function toOPML(map) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    '  <head>',
    `    <title>${escapeXml(map.title)}</title>`,
  ];
  if (map.source && map.source.url) {
    lines.push(`    <sourceUrl>${escapeXml(map.source.url)}</sourceUrl>`);
  }
  lines.push('  </head>', '  <body>');

  const open = [];
  walk(map, (node, depth) => {
    // Close every outline deeper than or level with this one before opening it.
    while (open.length > depth) {
      lines.push(`${padFor(open.pop())}</outline>`);
    }
    const pad = padFor(depth);
    const attributes = [`text="${escapeXml(node.text)}"`];
    if (node.notes) {
      attributes.push(`_note="${escapeXml(node.notes)}"`);
    }
    if (node.source && node.source.url) {
      attributes.push(`_source="${escapeXml(node.source.url)}"`);
    }
    if (node.children.length === 0) {
      lines.push(`${pad}<outline ${attributes.join(' ')}/>`);
    } else {
      lines.push(`${pad}<outline ${attributes.join(' ')}>`);
      open.push(depth);
    }
  });
  while (open.length > 0) {
    lines.push(`${padFor(open.pop())}</outline>`);
  }

  lines.push('  </body>', '</opml>');
  return `${lines.join('\n')}\n`;
}

/**
 * The outline rows of a document, in order, with the head's title and source.
 *
 * Rows rather than records, because whether the file's one top-level outline is the centre or
 * several of them hang from a centre made of the title is only known once the body has ended.
 */
function readRows(xml) {
  const rows = [];
  let depth = 0;
  let bodies = 0;
  let sawOpml = false;
  let title = null;
  let sourceUrl = null;
  let collecting = null;
  let collected = '';

  scanXml(xml, {
    open(name, attributes) {
      if (name === 'opml') {
        sawOpml = true;
      } else if (name === 'body') {
        bodies += 1;
      } else if (name === 'outline' && bodies > 0) {
        rows.push({
          depth,
          text: attributes.text || '',
          notes: attributes._note || '',
          url: safeLink(attributes._source),
        });
        depth += 1;
      } else if (collecting === null && (name === 'title' || name === 'sourceurl')) {
        collecting = name;
        collected = '';
      }
    },
    close(name) {
      if (name === 'body') {
        bodies -= 1;
      } else if (name === 'outline' && bodies > 0) {
        depth -= 1;
      } else if (name === collecting) {
        if (name === 'title' && title === null) {
          title = collected.trim();
        } else if (name === 'sourceurl' && sourceUrl === null) {
          sourceUrl = collected.trim();
        }
        collecting = null;
      }
    },
    text(value) {
      if (collecting !== null) {
        collected += value;
      }
    },
  });

  return { sawOpml, title, sourceUrl: safeLink(sourceUrl), rows };
}

/**
 * Read an OPML document into a map.
 *
 * @param {string} xmlText
 * @param {Object} [options]
 * @param {string} [options.title='Imported map'] - used when the file has no head title.
 * @param {string} [options.id] - map id; taken from `ids()` when absent.
 * @param {() => string} [options.ids] - fresh id source; core never calls crypto.
 * @param {number} [options.maxNodes] - a node cap below the shared 5,000.
 * @param {number} [options.maxDepth] - a depth cap below the shared 100.
 * @returns {Object} a valid map.
 * @throws {MindMapError} BAD_OPML when the text holds no opml element, BAD_XML when it is cut short
 *   or malformed, UNSAFE_XML when it declares its own entities, TOO_MANY_NODES or TOO_DEEP when it
 *   is past the import caps.
 */
export function fromOPML(xmlText, options = {}) {
  const { title: fallbackTitle = 'Imported map', id } = options;
  const build = startImport(options);
  const { sawOpml, title, sourceUrl, rows } = readRows(String(xmlText));

  if (!sawOpml) {
    throw new MindMapError('BAD_OPML', 'This file has no <opml> element, so it is not an outline.');
  }

  const mapTitle = title || fallbackTitle;
  const mapId = id || build.ids();
  const single = rows.length > 0 && rows.filter(row => row.depth === 0).length === 1;
  const root = build.add(null, single ? rows[0] : { text: mapTitle });

  // parents[depth] is the record a row at that depth attaches to.
  const parents = [root];
  for (const row of rows.slice(single ? 1 : 0)) {
    const depth = single ? row.depth : row.depth + 1;
    const record = build.add(parents[depth - 1] || root, row);
    parents[depth] = record;
    parents.length = depth + 1;
  }

  return build.finish({
    id: mapId,
    title: mapTitle,
    root,
    source: sourceUrl ? { url: sourceUrl, title: mapTitle } : null,
  });
}
