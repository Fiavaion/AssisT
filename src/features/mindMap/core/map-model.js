/**
 * Mind map data model — the v1 shape every other module builds on: a map of nodes keyed by id,
 * with a root, ordered children, optional cross-links, and the page the map started from.
 *
 * This module and everything else under `core/` is plain JavaScript: no `chrome.*`, no DOM, no
 * import reaching outside `core/`. ADR 0001 makes the outline the canonical editor and the canvas
 * a rendering of it, which only holds if the model can be reasoned about — and tested — without a
 * browser in the room.
 *
 * Ids and timestamps come from the caller. The core never reaches for crypto or the clock, so the
 * same input always produces the same output and a test never has to freeze time.
 */

import { BRANCH_COLOURS } from './palette.js';

/** Schema tag written into every map, checked on import. */
export const MAP_SCHEMA = 'assist-mindmap/1';

/** Branch colour the root falls back to when nothing sets one. */
const DEFAULT_COLOUR = 0;

/**
 * An error with a code a caller can branch on, so the editor can tell "no such node" from
 * "that would make a cycle" without parsing English.
 */
export class MindMapError extends Error {
  /**
   * @param {string} code - machine-readable reason, e.g. `UNKNOWN_NODE`.
   * @param {string} message - human-readable explanation.
   */
  constructor(code, message) {
    super(message);
    this.name = 'MindMapError';
    this.code = code;
  }
}

const isObject = value => typeof value === 'object' && value !== null && !Array.isArray(value);

/** A control character has no place in an id: it cannot be seen, typed or safely logged. */
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

/**
 * Whether a value can be the id of a node.
 *
 * `map.nodes` is an object keyed by id, and ids arrive from files. A name every object inherits
 * (`constructor`, `toString`, `__proto__`, ...) would answer a lookup before any node had been
 * filed under it, and assigning to `__proto__` files nothing at all, so those names are not ids.
 * Everything the editor mints (a UUID, `<map>-root`, `imported-7`) passes.
 *
 * @param {*} id
 * @returns {boolean} true for a non-empty string with no control character that is not the name
 *   of an `Object.prototype` member.
 */
export const isSafeId = id =>
  typeof id === 'string' && id !== '' && !CONTROL_CHARACTER.test(id) && !(id in Object.prototype);

/**
 * Whether the map holds a node under this id, asked of the map's own keys and never of what an
 * object inherits. Every existence test in `core/` goes through here or through `nodeAt`.
 *
 * @param {Object} map
 * @param {*} id
 * @returns {boolean}
 */
export const hasNode = (map, id) => typeof id === 'string' && Object.hasOwn(map.nodes, id);

/**
 * @param {Object} map
 * @param {*} id
 * @returns {Object|null} the node filed under this id, or null when there is none.
 */
export const nodeAt = (map, id) => (hasNode(map, id) ? map.nodes[id] : null);

const isColourIndex = value =>
  Number.isInteger(value) && value >= 0 && value < BRANCH_COLOURS.length;

/**
 * What each scalar field of a node may hold. A key that is absent is left alone, so a map stored
 * before a field existed still saves; a key that is present and wrong is a fault, because the
 * renderer draws `symbol` as text and the store clones every field it is given.
 */
const FIELD_RULES = Object.freeze([
  ['text', value => typeof value === 'string', 'a string'],
  ['notes', value => typeof value === 'string', 'a string'],
  ['symbol', value => value === null || typeof value === 'string', 'a string or null'],
  ['colour', value => value === null || isColourIndex(value), 'a palette index or null'],
  ['done', value => typeof value === 'boolean', 'true or false'],
  ['collapsed', value => typeof value === 'boolean', 'true or false'],
]);

/**
 * Build a node with every field of the v1 contract present.
 *
 * @param {Object} spec
 * @param {string} spec.id - unique within the map; supplied by the caller.
 * @param {string} [spec.text] - the label shown in the outline and on the canvas.
 * @param {string} [spec.notes] - longer prose behind the node.
 * @param {string[]} [spec.children] - ordered child ids.
 * @param {string|null} [spec.parentId] - null only for the root.
 * @param {boolean} [spec.collapsed]
 * @param {number|null} [spec.colour] - index into BRANCH_COLOURS; null inherits from an ancestor.
 * @param {string|null} [spec.symbol] - one emoji or short symbol, a WAI-Adapt style hint.
 * @param {{url: string, quote: string, title: string}|null} [spec.source] - highlight capture.
 * @param {string|null} [spec.citationId] - id in the citation library.
 * @param {boolean} [spec.done] - task tick, used by project-plan maps.
 * @returns {Object} a new node.
 * @throws {MindMapError} INVALID_ID when the id is not one `isSafeId` accepts.
 */
export function createNode(spec = {}) {
  const {
    id,
    text = '',
    notes = '',
    children = [],
    parentId = null,
    collapsed = false,
    colour = null,
    symbol = null,
    source = null,
    citationId = null,
    done = false,
  } = spec;

  if (!isSafeId(id)) {
    throw new MindMapError(
      'INVALID_ID',
      'A node needs an id that is a non-empty string, free of control characters, and not a name every object inherits.'
    );
  }

  return {
    id,
    text: String(text),
    notes: String(notes),
    children: [...children],
    parentId,
    collapsed: Boolean(collapsed),
    colour,
    symbol,
    source,
    citationId,
    done: Boolean(done),
  };
}

/**
 * Build an empty map holding a single root node.
 *
 * @param {Object} spec
 * @param {string} spec.id - map id; the caller generates it (crypto.randomUUID in the extension).
 * @param {string} [spec.title]
 * @param {string} [spec.rootId] - defaults to `<id>-root`, so a caller with one id can still build.
 * @param {string} [spec.rootText] - defaults to the title.
 * @param {{url: string, title: string}|null} [spec.source] - the page the map started from.
 * @param {number} [spec.now] - epoch ms for createdAt/updatedAt; the store stamps the real value.
 * @returns {Object} a valid map.
 * @throws {MindMapError} INVALID_ID when the map id is missing.
 */
export function createMap(spec = {}) {
  const { id, title = 'Untitled map', rootId, rootText, source = null, now = 0 } = spec;

  if (typeof id !== 'string' || id === '') {
    throw new MindMapError('INVALID_ID', 'A map needs a non-empty string id.');
  }

  const resolvedRootId = typeof rootId === 'string' && rootId !== '' ? rootId : `${id}-root`;
  const root = createNode({
    id: resolvedRootId,
    text: rootText === undefined ? title : rootText,
    colour: DEFAULT_COLOUR,
  });

  return {
    schema: MAP_SCHEMA,
    id,
    title: String(title),
    rootId: resolvedRootId,
    nodes: { [resolvedRootId]: root },
    links: [],
    source,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Check a map for every structural fault the editor cannot recover from.
 *
 * Used on import (a file from disk is untrusted) and by the test suite after every structural op.
 * Reporting a list rather than throwing on the first fault means an import error can tell a student
 * everything that is wrong with the file at once.
 *
 * @param {Object} map
 * @returns {Array<{code: string, message: string, id?: string}>} empty when the map is sound.
 */
export function validateMap(map) {
  const problems = [];
  const add = (code, message, id) =>
    problems.push(id === undefined ? { code, message } : { code, message, id });

  if (!isObject(map)) {
    add('NOT_A_MAP', 'A map must be an object.');
    return problems;
  }
  if (map.schema !== MAP_SCHEMA) {
    add('BAD_SCHEMA', `Unknown schema ${String(map.schema)}; this build reads ${MAP_SCHEMA}.`);
  }
  if (!isObject(map.nodes)) {
    add('NOT_A_MAP', 'A map must carry a nodes object.');
    return problems;
  }
  if (!Array.isArray(map.links)) {
    add('NOT_A_MAP', 'A map must carry a links array.');
  }

  const ids = Object.keys(map.nodes);
  for (const id of ids) {
    const node = map.nodes[id];
    if (!isObject(node)) {
      add('NOT_A_NODE', `The entry for ${id} is not a node object.`, id);
      continue;
    }
    if (!isSafeId(id)) {
      add('BAD_ID', `${JSON.stringify(id)} cannot be the id of a node.`, id);
    }
    if (node.id !== id) {
      add('ID_MISMATCH', `Node ${id} is filed under a different id (${String(node.id)}).`, id);
    }
    if (!Array.isArray(node.children)) {
      add('NOT_A_NODE', `Node ${id} has no children array.`, id);
    }
    for (const [field, allowed, wanted] of FIELD_RULES) {
      if (node[field] !== undefined && !allowed(node[field])) {
        add('BAD_FIELD', `Node ${id} has a ${field} that is not ${wanted}.`, id);
      }
    }
    if (node.parentId !== null && node.parentId !== undefined && !hasNode(map, node.parentId)) {
      add(
        'MISSING_PARENT',
        `Node ${id} names a parent (${String(node.parentId)}) that does not exist.`,
        id
      );
    }
  }

  const rootId = map.rootId;
  const root = nodeAt(map, rootId);
  if (!root) {
    add('BAD_ROOT', `The map root ${String(rootId)} names no node.`);
  } else if (root.parentId !== null && root.parentId !== undefined) {
    add('ROOT_HAS_PARENT', 'The root node must not have a parent.', rootId);
  }

  // A node claimed by two parents, or listed twice by one, breaks the tree before any walk does.
  const claimedBy = new Map();
  for (const id of ids) {
    const node = map.nodes[id];
    if (!isObject(node) || !Array.isArray(node.children)) {
      continue;
    }
    for (const childId of node.children) {
      if (!hasNode(map, childId)) {
        add(
          'MISSING_CHILD',
          `Node ${id} lists a child (${String(childId)}) that does not exist.`,
          id
        );
        continue;
      }
      if (claimedBy.has(childId)) {
        add(
          'DUPLICATE_CHILD',
          `Node ${childId} is listed as a child by both ${claimedBy.get(childId)} and ${id}.`,
          childId
        );
      } else {
        claimedBy.set(childId, id);
      }
    }
  }

  if (root) {
    // Depth-first with the current path held alongside the visited set: a child already on the path
    // is a back edge and so a real cycle, while a child merely visited before is a second parent —
    // already reported as DUPLICATE_CHILD, and not a cycle.
    const seen = new Set();
    const onPath = new Set();
    let cyclic = false;
    const stack = [{ id: rootId, next: 0 }];
    seen.add(rootId);
    onPath.add(rootId);
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const node = map.nodes[frame.id];
      const children = isObject(node) && Array.isArray(node.children) ? node.children : [];
      if (frame.next >= children.length) {
        onPath.delete(frame.id);
        stack.pop();
        continue;
      }
      const childId = children[frame.next];
      frame.next += 1;
      if (!hasNode(map, childId)) {
        continue;
      }
      if (onPath.has(childId)) {
        cyclic = true;
      } else if (!seen.has(childId)) {
        seen.add(childId);
        onPath.add(childId);
        stack.push({ id: childId, next: 0 });
      }
    }
    if (cyclic) {
      add('CYCLE', 'The child links form a cycle, so the map is not a tree.');
    }
    for (const id of ids) {
      if (!seen.has(id)) {
        add('ORPHAN', `Node ${id} cannot be reached from the root.`, id);
      }
    }
  }

  if (Array.isArray(map.links)) {
    for (const link of map.links) {
      if (!isObject(link) || !hasNode(map, link.from) || !hasNode(map, link.to)) {
        add(
          'UNKNOWN_LINK_ENDPOINT',
          `Cross-link ${String(link && link.id)} points at a node that does not exist.`
        );
      }
    }
  }

  return problems;
}
