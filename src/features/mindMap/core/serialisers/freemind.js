/**
 * FreeMind `.mm`: the one interchange format that reaches the tools students actually use.
 *
 * A student arrives with a map made in Coggle, MindMeister, XMind or Freeplane and leaves for a
 * tutor or a group project using something else. `.mm` is plain XML, openly specified, and read by
 * all of those, so one reader and one writer reaches six tools (ADR 0003). Unlike Markdown and
 * OPML it carries colour, symbols, the done tick, collapsed state and cross-links.
 *
 * Export writes FreeMind 1.0.1, the oldest reader still in the field. Import accepts FreeMind and
 * Freeplane and ignores everything it does not know, because a file that is 90% readable should
 * open rather than fail.
 *
 * Reading goes through the scanner every XML importer shares (`xml-scan.js`), which is strict:
 * a `.mm` file is a real XML document from another program, so a mismatched or unclosed tag is
 * refused rather than half-read, and a DOCTYPE that declares entities is refused before anything
 * else. Text becomes a string in the model, never markup.
 *
 * Only what belongs to a node is read from it. Freeplane keeps its style sheet inside the root
 * node, as `<hook NAME="MapStyle">` holding `stylenode` elements that carry icons, arrowlinks
 * and richcontent of their own; an icon there styles a kind of node and says nothing about the
 * centre. So an `icon`, `arrowlink` or `richcontent` counts only as the direct child of a
 * `node`, and any other element, known or not, is skipped with everything inside it.
 *
 * Every import is hostile input: the node and depth caps every importer shares apply as the file
 * is read, nothing recurses, only http, https and mailto links survive, and the finished map goes
 * through the same `validateMap` as our own JSON.
 */

import { MindMapError } from '../map-model.js';
import { walk } from '../map-ops.js';
import { BRANCH_COLOURS, nearestBranchColour } from '../palette.js';
import { MAX_DEPTH, startImport } from './import-map.js';
import { escapeXml, safeLink, scanXml } from './xml-scan.js';

/** FreeMind's built-in icon for a completed task; ours is the `done` tick rather than a symbol. */
const DONE_ICON = 'button_ok';

/**
 * Symbols with a FreeMind equivalent, in both directions. The left column is eight of the twelve
 * symbols the inspector offers as quick picks, the ones FreeMind has a built-in icon for; the right
 * is that icon's name. A symbol with no honest equivalent is dropped on export and an icon outside
 * this table is ignored on import, which is what keeps the pairing reversible: no symbol ever turns
 * into a different symbol on the way back.
 */
const SYMBOL_ICONS = Object.freeze([
  ['⭐', 'bookmark'],
  ['❗', 'yes'],
  ['❓', 'help'],
  ['💡', 'idea'],
  ['⚠️', 'messagebox_warning'],
  ['🔑', 'password'],
  ['✍️', 'pencil'],
  ['🔗', 'attach'],
]);

const ICON_FOR_SYMBOL = new Map(SYMBOL_ICONS);
const SYMBOL_FOR_ICON = new Map(SYMBOL_ICONS.map(([symbol, icon]) => [icon, symbol]));

/**
 * Freeplane names a node it created, and the student never renamed, with a key into its own
 * translations rather than with text. The key it writes for a new node is given the words its
 * interface shows for it; any other key says nothing a student would recognise, so that node is
 * unnamed. The centre is not looked up here: an unnamed centre takes the file's name. A `Map`,
 * because the key comes from the file.
 */
const LOCALISED_TEXT = new Map([['new_node', 'New node']]);

/** XHTML elements that end a line of a note. Anything else is inline and keeps the line going. */
const BLOCK_ELEMENTS = new Set([
  'p',
  'div',
  'li',
  'tr',
  'blockquote',
  'pre',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
]);

/** Elements whose content is code, not prose, and so never becomes note text. */
const INERT_ELEMENTS = new Set(['script', 'style']);

/**
 * Indentation is for a person reading the file and carries no structure, so it stops growing at the
 * deepest level an import reads — depths run 0 to MAX_DEPTH - 1 — and levels past that are written
 * at the same inset. Without the clamp a very deep map is mostly spaces, by the hundred megabyte.
 */
const padFor = depth => '  '.repeat(Math.min(depth, MAX_DEPTH - 1) + 1);

/** The note as it is written to a file: the node's own notes, then what `.mm` has nowhere else. */
function noteLines(node) {
  const lines = node.notes ? node.notes.split('\n') : [];
  const source = node.source || {};
  if (source.quote) {
    lines.push(`“${source.quote}”`);
  }
  if (source.title) {
    lines.push(`Source: ${source.title}`);
  }
  return lines;
}

/**
 * Write a map as a FreeMind 1.0.1 document.
 *
 * Node ids are renumbered `ID_0`, `ID_1`, … in outline order rather than carried across: FreeMind
 * treats an ID as an XML name, our ids are whatever the store generated, and nothing outside the
 * file refers to them.
 *
 * @param {Object} map
 * @returns {string} a `.mm` document ending in a newline.
 */
export function toFreeMind(map) {
  const fileIds = new Map();
  let serial = 0;
  walk(map, node => {
    fileIds.set(node.id, `ID_${serial}`);
    serial += 1;
  });

  const arrowsFrom = new Map();
  for (const link of map.links) {
    if (!fileIds.has(link.from) || !fileIds.has(link.to)) {
      continue;
    }
    const existing = arrowsFrom.get(link.from) || [];
    existing.push(fileIds.get(link.to));
    arrowsFrom.set(link.from, existing);
  }

  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<map version="1.0.1">'];
  const open = [];
  const closeTo = depth => {
    while (open.length > depth) {
      lines.push(`${padFor(open.pop())}</node>`);
    }
  };

  walk(map, (node, depth, parent) => {
    closeTo(depth);
    const pad = padFor(depth);
    const attributes = [`ID="${fileIds.get(node.id)}"`, `TEXT="${escapeXml(node.text)}"`];

    // FreeMind hangs the first level of a map either side of the centre; anything deeper follows
    // its parent, so POSITION belongs on the root's children and nowhere else.
    if (parent && parent.id === map.rootId) {
      attributes.push(
        `POSITION="${parent.children.indexOf(node.id) % 2 === 0 ? 'right' : 'left'}"`
      );
    }
    if (node.collapsed) {
      attributes.push('FOLDED="true"');
    }
    const colour = BRANCH_COLOURS[node.colour];
    if (colour) {
      attributes.push(`BACKGROUND_COLOR="${colour.fill}"`, `COLOR="${colour.ink}"`);
    }
    const link = safeLink(node.source && node.source.url);
    if (link) {
      attributes.push(`LINK="${escapeXml(link)}"`);
    }

    const inner = [];
    const note = noteLines(node);
    if (note.length > 0) {
      inner.push(
        `${pad}  <richcontent TYPE="NOTE">`,
        `${pad}    <html>`,
        `${pad}      <head/>`,
        `${pad}      <body>`,
        ...note.map(line => `${pad}        <p>${escapeXml(line)}</p>`),
        `${pad}      </body>`,
        `${pad}    </html>`,
        `${pad}  </richcontent>`
      );
    }
    if (node.done) {
      inner.push(`${pad}  <icon BUILTIN="${DONE_ICON}"/>`);
    }
    const icon = ICON_FOR_SYMBOL.get(node.symbol);
    if (icon) {
      inner.push(`${pad}  <icon BUILTIN="${icon}"/>`);
    }
    for (const destination of arrowsFrom.get(node.id) || []) {
      inner.push(
        `${pad}  <arrowlink DESTINATION="${destination}" STARTARROW="None" ENDARROW="Default"/>`
      );
    }

    if (node.children.length > 0) {
      lines.push(`${pad}<node ${attributes.join(' ')}>`, ...inner);
      open.push(depth);
    } else if (inner.length > 0) {
      lines.push(`${pad}<node ${attributes.join(' ')}>`, ...inner, `${pad}</node>`);
    } else {
      lines.push(`${pad}<node ${attributes.join(' ')}/>`);
    }
  });

  closeTo(0);
  lines.push('</map>');
  return `${lines.join('\n')}\n`;
}

/**
 * Collect the text of a richcontent body, one line per block element.
 *
 * FreeMind and Freeplane indent their XHTML, so whitespace between two paragraphs would otherwise
 * read as a blank line between them. Flushing only at a block end, and trimming what was collected,
 * keeps the paragraph breaks a student wrote and discards the ones the file's layout invented.
 */
function richContentReader(kind, record, depth) {
  const lines = [];
  let buffer = '';
  let inert = 0;

  const flush = () => {
    lines.push(buffer.trim());
    buffer = '';
  };

  return {
    kind,
    record,
    /** The element depth of the `<richcontent>` itself, so its own close can be told apart. */
    depth,
    open(name) {
      if (inert > 0) {
        inert += 1;
      } else if (INERT_ELEMENTS.has(name)) {
        inert = 1;
      } else if (name === 'br') {
        flush();
      }
    },
    close(name) {
      if (inert > 0) {
        inert -= 1;
      } else if (BLOCK_ELEMENTS.has(name)) {
        flush();
      }
    },
    text(value) {
      if (inert === 0) {
        buffer += value;
      }
    },
    /** @returns {string[]} the collected lines, without the blank ones the layout added. */
    finish() {
      if (buffer.trim() !== '') {
        flush();
      }
      while (lines.length > 0 && lines[0] === '') {
        lines.shift();
      }
      while (lines.length > 0 && lines[lines.length - 1] === '') {
        lines.pop();
      }
      return lines;
    },
  };
}

const badFreeMind = detail => new MindMapError('BAD_FREEMIND', detail);

/**
 * Read a FreeMind or Freeplane document into a map.
 *
 * @param {string} xmlText
 * @param {Object} [options]
 * @param {string} [options.title='Imported map'] - the map's name when the centre has no text of
 *   its own, and the centre's text when Freeplane left it unnamed; the wiring passes the file's
 *   name, which is where `.mm` keeps a map's title.
 * @param {string} [options.id] - map id; taken from `ids()` when absent.
 * @param {() => string} [options.ids] - fresh id source; core never calls crypto.
 * @param {number} [options.maxNodes] - a node cap below the shared 5,000.
 * @param {number} [options.maxDepth] - a depth cap below the shared 100.
 * @returns {Object} a valid map.
 * @throws {MindMapError} UNSAFE_XML for a DOCTYPE declaring entities, BAD_XML when the file is
 *   malformed or cut short, BAD_FREEMIND when it is XML but holds no map, TOO_MANY_NODES and
 *   TOO_DEEP when it exceeds the import caps, INVALID_MAP (with a `problems` array) if what it
 *   describes is not a tree.
 */
export function fromFreeMind(xmlText, options = {}) {
  const { title: fallbackTitle = 'Imported map', id } = options;
  const build = startImport(options);

  const byFileId = new Map();
  const arrows = [];
  let root = null;
  const stack = [];
  let sawMap = false;
  let depth = 0;
  let rich = null;
  // The element depth at which a subtree that is not the node's own began, or 0 outside one.
  let skippingFrom = 0;

  const current = () => stack[stack.length - 1];

  const openNode = attributes => {
    // FreeMind allows one node under <map>; a file with more has been hand-edited or concatenated,
    // and hanging the extras under the first loses nothing. Adopting them as they open, rather
    // than once the file has been read, is what holds their subtrees to the depth cap.
    const parent = current() || root;
    const record = build.add(parent, {
      text: typeof attributes.text === 'string' ? attributes.text : '',
      collapsed: attributes.folded === 'true',
      // Freeplane fills a node with BACKGROUND_COLOR and inks its text with COLOR; Coggle and
      // FreeMind 0.9 use COLOR alone for the branch. Take the fill first, and the ink only as the
      // fallback, so a file that carries both does not come back the colour of its own lettering.
      colour: nearestBranchColour(attributes.background_color || attributes.color),
      url: safeLink(attributes.link),
      details: '',
      localised: typeof attributes.localized_text === 'string' ? attributes.localized_text : '',
    });
    if (!root) {
      root = record;
    }
    if (typeof attributes.id === 'string' && !byFileId.has(attributes.id)) {
      byFileId.set(attributes.id, record);
    }
    // Freeplane writes a link to another node of the same map as `LINK="#ID_123"`, which is a
    // cross-link by another name. It is resolved with the arrowlinks, once every ID is known.
    if (typeof attributes.link === 'string' && attributes.link.startsWith('#')) {
      arrows.push({ from: record, destination: attributes.link.slice(1) });
    }
    stack.push(record);
  };

  scanXml(String(xmlText), {
    open(name, attributes) {
      depth += 1;
      if (rich) {
        rich.open(name);
      } else if (skippingFrom > 0) {
        // Inside a hook, a style sheet or anything unknown: nothing here belongs to a node.
      } else if (name === 'map' && stack.length === 0) {
        sawMap = true;
      } else if (name === 'node') {
        openNode(attributes);
      } else if (name === 'richcontent' && current()) {
        rich = richContentReader(String(attributes.type || '').toUpperCase(), current(), depth);
      } else if (name === 'icon' && current()) {
        const builtin = attributes.builtin;
        if (builtin === DONE_ICON) {
          current().done = true;
        } else if (SYMBOL_FOR_ICON.has(builtin) && current().symbol === null) {
          current().symbol = SYMBOL_FOR_ICON.get(builtin);
        }
      } else if (name === 'arrowlink' && current() && attributes.destination) {
        arrows.push({ from: current(), destination: attributes.destination });
      } else {
        skippingFrom = depth;
      }
    },
    close(name) {
      if (rich) {
        if (depth === rich.depth) {
          const lines = rich.finish();
          if (rich.kind === 'NOTE') {
            rich.record.notes = lines.join('\n');
          } else if (rich.kind === 'DETAILS') {
            rich.record.details = lines.join('\n');
          } else if (rich.kind === 'NODE') {
            rich.record.text = lines.join(' ').replace(/\s+/g, ' ').trim();
          }
          rich = null;
        } else {
          rich.close(name);
        }
      } else if (skippingFrom > 0) {
        if (depth === skippingFrom) {
          skippingFrom = 0;
        }
      } else if (name === 'node') {
        const record = stack.pop();
        // Freeplane's details are a second, shorter note shown under the node. AssisT has one
        // notes field, so they follow the note rather than being lost.
        record.notes = [record.notes, record.details].filter(part => part !== '').join('\n\n');
        if (record.text.trim() === '' && record !== root) {
          record.text = LOCALISED_TEXT.get(record.localised) || '';
        }
      }
      depth -= 1;
    },
    text(value) {
      if (rich) {
        rich.text(value);
      }
    },
    // Rich content is XHTML from an HTML editor, which writes `&eacute;` where XML would not.
    xhtml: () => rich !== null,
  });

  if (!sawMap) {
    throw badFreeMind('This file has no <map> element, so it is not a FreeMind mind map.');
  }
  if (!root) {
    throw badFreeMind('This file holds no node, so there is no map in it to open.');
  }

  const links = [];
  for (const arrow of arrows) {
    const target = byFileId.get(arrow.destination);
    if (target) {
      links.push({ from: arrow.from, to: target });
    }
  }

  return build.finish({
    id: id || build.ids(),
    title: root.text.trim() || fallbackTitle,
    root,
    links,
  });
}
