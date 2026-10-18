/**
 * XMind, read only (ADR 0003).
 *
 * A student who has been mapping in XMind arrives with a folder of `.xmind` files, and asking them
 * to open each one and re-export it is asking them not to bother. XMind reads FreeMind, so AssisT
 * writes `.mm` and never writes `.xmind`; this module is the other direction.
 *
 * An `.xmind` file is a zip. Unpacking it is `src/utils/zip-reader.js`'s job, so that this module
 * stays inside the `core/` contract — pure, no DOM, no `chrome.*` — and can be tested with two
 * strings. Current files hold `content.json`; files written before XMind 2021 hold `content.xml`,
 * and both layouts are read here because a student's folder holds both.
 *
 * What travels, and what does not:
 *
 * | XMind | AssisT |
 * | --- | --- |
 * | first sheet's `rootTopic` | the map; other sheets are counted and named, not imported |
 * | `title` | `text`, whitespace collapsed to one line |
 * | `children.attached` | children, in order |
 * | `children.detached` (floating topics) | children of one "Floating topics" node under the root |
 * | `notes.plain.content` | `notes` |
 * | `labels` | a last line of the notes, `Labels: a, b` |
 * | `href` | `source.url`, but only `http`, `https` and `mailto` |
 * | `markerRefs` | `done` for `task-done`, otherwise a symbol from MARKER_SYMBOLS |
 * | `branch: "folded"` | `collapsed` |
 * | `relationships` | cross-links, when both ends are in the imported sheet |
 * | `style.properties["svg:fill"]` | the nearest branch colour, or inherited; current layout only |
 * | positions, layout, images, attachments, summaries, boundaries | dropped (ADR 0001) |
 *
 * The file is treated as hostile throughout: no recursion anywhere, so depth cannot exhaust the
 * stack; the node and depth caps every importer shares; markup in a title kept as text and never
 * as markup; the legacy layout read by the strict scanner every XML importer shares, which refuses
 * a document that declares its own entities; every table probed by a key from the file is a `Map`,
 * so a marker called `constructor` finds nothing rather than a function; and the finished map put
 * through the same `validateMap` as our own JSON before it is handed back.
 */

import { MindMapError } from '../map-model.js';
import { nearestBranchColour } from '../palette.js';
import { startImport, tooDeep, tooManyNodes } from './import-map.js';
import { safeLink, scanXml } from './xml-scan.js';

/**
 * Each level of topic nesting costs four XML elements — `topic > children > topics > topic` — so
 * the document may nest four times as deep as the topics may, with room for the sheet and content
 * wrappers.
 */
const XML_LEVELS_PER_TOPIC = 4;
const XML_WRAPPER_LEVELS = 8;

/**
 * A topic in the legacy layout is a handful of elements; thirty-two apiece is room for a title,
 * notes, markers and labels on every one, and still a bound on what is held in memory.
 */
const XML_ELEMENTS_PER_TOPIC = 32;

/** XMind ships these markers in eight colours; the colour carries nothing AssisT can keep. */
const family = (prefix, symbol) =>
  ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'dark-blue', 'gray'].map(colour => [
    `${prefix}-${colour}`,
    symbol,
  ]);

/**
 * XMind markers to AssisT symbols, for the markers where AssisT has something that means the same
 * thing. `task-done` is not here: it sets the node's done tick rather than a symbol. Anything
 * absent — the progress fractions, the smileys, the month and people markers — is dropped rather
 * than approximated, because a symbol that means something else is worse than no symbol.
 *
 * A `Map`, because the key comes from the file: an object literal would answer `constructor` with
 * a function, and the first attempt to store the map would throw.
 *
 * @type {ReadonlyMap<string, string>}
 */
const MARKER_SYMBOLS = new Map([
  ['priority-1', '❗'],
  ['priority-2', '⚠️'],
  ['priority-3', '📌'],
  ['symbol-exclam', '❗'],
  ['symbol-question', '❓'],
  ['symbol-right', '✅'],
  ['symbol-info', '📖'],
  ...family('star', '⭐'),
  ...family('flag', '🎯'),
]);

/** The marker that ticks a node off rather than decorating it. */
const DONE_MARKER = 'task-done';

/** The one node floating topics hang from, so they are in the map without pretending to be in it. */
const FLOATING_TITLE = 'Floating topics';

const isObject = value => typeof value === 'object' && value !== null && !Array.isArray(value);

/** A topic title is one line in the outline, so a title spread over several becomes one. */
const oneLine = value =>
  String(value === undefined || value === null ? '' : value)
    .replace(/\s+/g, ' ')
    .trim();

/** The first marker with a symbol wins; a node carries one symbol, not a row of them. */
function readMarkers(ids) {
  let symbol = null;
  let done = false;
  for (const markerId of ids) {
    if (markerId === DONE_MARKER) {
      done = true;
    } else if (symbol === null && MARKER_SYMBOLS.has(markerId)) {
      symbol = MARKER_SYMBOLS.get(markerId);
    }
  }
  return { symbol, done };
}

/**
 * Labels are words the student typed, and AssisT has no field for them, so they follow the notes
 * rather than being lost.
 */
function notesWithLabels(notes, labels) {
  const kept = labels.map(oneLine).filter(label => label !== '');
  return [notes, kept.length > 0 ? `Labels: ${kept.join(', ')}` : '']
    .filter(part => part !== '')
    .join('\n\n');
}

// ---------------------------------------------------------------------------------------------
// The current layout: content.json
// ---------------------------------------------------------------------------------------------

/** One topic's fields, in the shape the builder consumes, from the current JSON layout. */
function jsonTopic(raw) {
  const topic = isObject(raw) ? raw : {};
  const children = isObject(topic.children) ? topic.children : {};
  const refs = Array.isArray(topic.markerRefs)
    ? topic.markerRefs
    : Array.isArray(topic.markers)
      ? topic.markers
      : [];
  const notes =
    isObject(topic.notes) && isObject(topic.notes.plain) ? topic.notes.plain.content : '';
  const style =
    isObject(topic.style) && isObject(topic.style.properties) ? topic.style.properties : {};
  const labels = Array.isArray(topic.labels) ? topic.labels : [];

  return {
    id: typeof topic.id === 'string' ? topic.id : null,
    text: oneLine(topic.title),
    notes: notesWithLabels(
      typeof notes === 'string' ? notes.trim() : '',
      labels.filter(label => typeof label === 'string')
    ),
    href: safeLink(topic.href),
    // A ref is `{markerId}` in every version seen, but older exporters wrote the bare id.
    markers: refs.map(ref =>
      typeof ref === 'string' ? ref : isObject(ref) ? String(ref.markerId || '') : ''
    ),
    collapsed: topic.branch === 'folded',
    colour: nearestBranchColour(style['svg:fill']),
    attached: Array.isArray(children.attached) ? children.attached : [],
    detached: Array.isArray(children.detached) ? children.detached : [],
  };
}

/** The sheets of a content.json, or the sentence saying why it is not a usable one. */
function readJsonSheets(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { error: `The XMind content.json is not valid JSON: ${error.message}.` };
  }
  const sheets = (Array.isArray(parsed) ? parsed : [parsed]).filter(isObject);
  if (sheets.length === 0) {
    return { error: 'The XMind content.json holds no sheets, so there is nothing to import.' };
  }
  const first = sheets[0];
  if (!isObject(first.rootTopic)) {
    return {
      error:
        'The first sheet in this XMind file has no central topic, so there is nothing to import.',
    };
  }
  return {
    sheetCount: sheets.length,
    sheetTitle: oneLine(first.title),
    root: first.rootTopic,
    readTopic: jsonTopic,
    relationships: (Array.isArray(first.relationships) ? first.relationships : [])
      .filter(isObject)
      .map(link => ({
        from: typeof link.end1Id === 'string' ? link.end1Id : '',
        to: typeof link.end2Id === 'string' ? link.end2Id : '',
        label: oneLine(link.title),
      })),
  };
}

// ---------------------------------------------------------------------------------------------
// The legacy layout: content.xml
// ---------------------------------------------------------------------------------------------

/**
 * Read XML into elements of `{name, attributes, parts}`, where `parts` holds this element's text
 * and child elements in document order.
 *
 * The scanning is `scanXml`'s; this only keeps what it announces, because the legacy layout puts a
 * sheet's title after its topics and so cannot be read in one forward pass. Element names lose any
 * namespace prefix, since a file may bind the content namespace to a prefix instead of making it
 * the default. Nesting and element count are capped as the tree grows, so a generated file is
 * refused rather than held in memory.
 *
 * @param {string} xml
 * @param {{maxNodes: number, maxDepth: number}} caps
 * @returns {Object} a synthetic document element holding the top-level elements.
 */
function parseXml(xml, { maxNodes, maxDepth }) {
  const document = { name: '#document', attributes: {}, parts: [] };
  const stack = [document];
  const deepest = maxDepth * XML_LEVELS_PER_TOPIC + XML_WRAPPER_LEVELS;
  const most = maxNodes * XML_ELEMENTS_PER_TOPIC;
  let elements = 0;

  scanXml(xml, {
    open(name, attributes) {
      elements += 1;
      if (elements > most) {
        throw tooManyNodes(maxNodes);
      }
      if (stack.length > deepest) {
        throw tooDeep(maxDepth);
      }
      const element = { name: name.slice(name.lastIndexOf(':') + 1), attributes, parts: [] };
      stack[stack.length - 1].parts.push(element);
      stack.push(element);
    },
    close() {
      stack.pop();
    },
    text(value) {
      stack[stack.length - 1].parts.push(value);
    },
  });

  return document;
}

const elementsOf = element => element.parts.filter(part => typeof part !== 'string');
const childrenNamed = (element, name) => elementsOf(element).filter(child => child.name === name);
const childNamed = (element, name) => childrenNamed(element, name)[0] || null;

/** Every descendant's text in document order, which is what a title or a note really is. */
function textOf(element) {
  if (!element) {
    return '';
  }
  let text = '';
  const stack = [element];
  while (stack.length > 0) {
    const current = stack.pop();
    if (typeof current === 'string') {
      text += current;
      continue;
    }
    for (let at = current.parts.length - 1; at >= 0; at -= 1) {
      stack.push(current.parts[at]);
    }
  }
  return text;
}

/** Every element with this name, anywhere below the given one, in document order. */
function descendantsNamed(element, name) {
  const found = [];
  const stack = [element];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current.name === name) {
      found.push(current);
    }
    const children = elementsOf(current);
    for (let at = children.length - 1; at >= 0; at -= 1) {
      stack.push(children[at]);
    }
  }
  return found;
}

/** One topic's fields from the legacy layout. */
function xmlTopic(element) {
  const children = childNamed(element, 'children');
  const lists = children ? childrenNamed(children, 'topics') : [];
  const topicsOfType = type =>
    lists
      .filter(list => (list.attributes.type || 'attached') === type)
      .flatMap(list => childrenNamed(list, 'topic'));
  const markerRefs = childNamed(element, 'marker-refs');
  const notes = childNamed(element, 'notes');
  const labels = childNamed(element, 'labels');

  return {
    id: element.attributes.id || null,
    text: oneLine(textOf(childNamed(element, 'title'))),
    notes: notesWithLabels(
      notes ? textOf(childNamed(notes, 'plain')).trim() : '',
      labels ? childrenNamed(labels, 'label').map(textOf) : []
    ),
    href: safeLink(element.attributes['xlink:href'] || element.attributes.href),
    markers: markerRefs
      ? childrenNamed(markerRefs, 'marker-ref').map(ref => ref.attributes['marker-id'] || '')
      : [],
    collapsed: element.attributes.branch === 'folded',
    colour: null, // Legacy files keep style in a separate styles.xml, which is not read.
    attached: topicsOfType('attached'),
    detached: topicsOfType('detached'),
  };
}

/** The sheets of a content.xml. */
function readXmlSheets(text, caps) {
  const document = parseXml(text, caps);
  const sheets = descendantsNamed(document, 'sheet');
  const first = sheets[0] || document;
  const root = childNamed(first, 'topic') || descendantsNamed(document, 'topic')[0] || null;

  if (!root) {
    throw new MindMapError(
      'BAD_XMIND',
      "This XMind file's content.xml holds no topics, so there is nothing to import."
    );
  }

  const relationships = first === document ? null : childNamed(first, 'relationships');
  return {
    sheetCount: Math.max(sheets.length, 1),
    sheetTitle: sheets.length > 0 ? oneLine(textOf(childNamed(first, 'title'))) : '',
    root,
    readTopic: xmlTopic,
    relationships: (relationships ? childrenNamed(relationships, 'relationship') : []).map(
      link => ({
        from: link.attributes.end1 || '',
        to: link.attributes.end2 || '',
        label: oneLine(textOf(childNamed(link, 'title'))),
      })
    ),
  };
}

// ---------------------------------------------------------------------------------------------
// Building the map
// ---------------------------------------------------------------------------------------------

/**
 * Walk one sheet into a map. The walk is an explicit stack rather than recursion, so a file nested
 * a thousand deep is refused by the depth cap instead of ending the page with a stack overflow.
 */
function buildSheet(sheet, build, { title, id }) {
  const { readTopic } = sheet;
  const byXmindId = new Map();
  const floating = [];
  const mapId = id || build.ids();

  const add = (raw, parent) => {
    const topic = readTopic(raw);
    const record = build.add(parent, {
      text: topic.text,
      notes: topic.notes,
      // A collapsed root would open the map with nothing to see.
      collapsed: parent !== null && topic.collapsed,
      colour: topic.colour,
      url: topic.href,
      ...readMarkers(topic.markers),
    });
    if (topic.id && !byXmindId.has(topic.id)) {
      byXmindId.set(topic.id, record);
    }
    // Not a spread: a generated file can list more floating topics than a call can take arguments.
    for (const loose of topic.detached) {
      floating.push(loose);
    }
    return { record, attached: topic.attached };
  };

  const addBranches = (topics, parent) => {
    const stack = topics
      .slice()
      .reverse()
      .map(raw => ({ raw, parent }));
    while (stack.length > 0) {
      const { raw, parent: above } = stack.pop();
      const { record, attached } = add(raw, above);
      for (let at = attached.length - 1; at >= 0; at -= 1) {
        stack.push({ raw: attached[at], parent: record });
      }
    }
  };

  const centre = add(sheet.root, null);
  const root = centre.record;
  addBranches(centre.attached, root);

  // Floating topics are not attached to anything in XMind, so they get one home of their own
  // rather than being scattered through the outline or dropped. One of them may hold floating
  // topics of its own, which join the same home.
  if (floating.length > 0) {
    const bucket = build.add(root, { text: FLOATING_TITLE });
    while (floating.length > 0) {
      addBranches(floating.splice(0), bucket);
    }
  }

  const links = [];
  for (const link of sheet.relationships) {
    const from = byXmindId.get(link.from);
    const to = byXmindId.get(link.to);
    if (from && to) {
      links.push({ from, to, label: link.label });
    }
  }

  return build.finish({ id: mapId, title: sheet.sheetTitle || root.text || title, root, links });
}

/**
 * Read an XMind file's text parts into a map.
 *
 * The caller unpacks the archive — `readZip` from `src/utils/zip-reader.js` — and hands over the
 * two entries that matter, so this module has no zip knowledge and no I/O of any kind. Whichever
 * part is present is used; when both are, the current layout wins, and a `content.json` that will
 * not parse falls back to `content.xml` rather than failing a file that holds both.
 *
 * @param {Object} parts
 * @param {string} [parts.contentJson] - the text of `content.json`.
 * @param {string} [parts.contentXml] - the text of `content.xml`.
 * @param {Object} [options]
 * @param {string} [options.title='Imported map'] - used when neither the sheet nor the central
 *   topic is named.
 * @param {string} [options.id] - map id; taken from `ids()` when absent.
 * @param {() => string} [options.ids] - fresh id source; core never calls crypto.
 * @param {number} [options.maxNodes] - a node cap below the shared 5,000.
 * @param {number} [options.maxDepth] - a depth cap below the shared 100.
 * @returns {{map: Object, sheetCount: number}} the map built from the first sheet and how many
 *   sheets the file held, so the import can say "imported the first of 3 sheets" rather than
 *   silently dropping the rest. The sheet's own name is the map's title, so it is not repeated
 *   here.
 * @throws {MindMapError} BAD_XMIND when there is nothing to import, BAD_JSON when the only part is
 *   unparseable JSON, BAD_XML or UNSAFE_XML when the legacy part is malformed or declares its own
 *   entities, TOO_MANY_NODES or TOO_DEEP when the file is past the caps, INVALID_MAP (with a
 *   `problems` array) if what was read somehow does not make a map.
 */
export function fromXMind(parts = {}, options = {}) {
  const { title = 'Imported map', id } = options;
  const build = startImport(options);
  const contentJson = typeof parts.contentJson === 'string' ? parts.contentJson : '';
  const contentXml = typeof parts.contentXml === 'string' ? parts.contentXml : '';

  if (contentJson.trim() === '' && contentXml.trim() === '') {
    throw new MindMapError(
      'BAD_XMIND',
      'This XMind file holds no content.json or content.xml, so there is nothing to import.'
    );
  }

  let sheet = null;
  let jsonError = null;
  if (contentJson.trim() !== '') {
    const read = readJsonSheets(contentJson);
    if (read.error) {
      jsonError = read.error;
    } else {
      sheet = read;
    }
  }
  if (!sheet && contentXml.trim() !== '') {
    sheet = readXmlSheets(contentXml, build);
  }
  if (!sheet) {
    throw new MindMapError(
      jsonError.startsWith('The XMind content.json is not valid JSON') ? 'BAD_JSON' : 'BAD_XMIND',
      jsonError
    );
  }

  const map = buildSheet(sheet, build, { title, id });
  return { map, sheetCount: sheet.sheetCount };
}
