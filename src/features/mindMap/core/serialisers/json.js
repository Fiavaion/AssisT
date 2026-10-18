/**
 * JSON: the lossless export, and the only import that carries colours, symbols, cross-links,
 * citation ids and timestamps as well as the outline.
 *
 * A file is untrusted input — it may have been hand-edited, truncated by a sync client, or written
 * by an older build — so reading one validates the whole structure and refuses anything the editor
 * could not open, rather than loading a broken map and failing later in the renderer. It is held
 * to the node and depth caps every importer shares, and a node the file left without a name gets
 * one, as in every other import (see `import-map.js`).
 */

import { MAP_SCHEMA, MindMapError, createNode, isSafeId, validateMap } from '../map-model.js';
import { walk } from '../map-ops.js';
import { importCaps, namedOr, tooDeep, tooManyNodes } from './import-map.js';

/**
 * @param {Object} map
 * @returns {string} indented JSON, so a student who opens the file can read it.
 */
export function toJSON(map) {
  return JSON.stringify(map, null, 2);
}

/**
 * Read a map from JSON text.
 *
 * @param {string} text
 * @param {Object} [options]
 * @param {number} [options.maxNodes] - a node cap below the shared 5,000.
 * @param {number} [options.maxDepth] - a depth cap below the shared 100.
 * @returns {Object} a valid map.
 * @throws {MindMapError} BAD_JSON if the text will not parse, BAD_SCHEMA if it is not a map of a
 *   version this build reads, TOO_MANY_NODES or TOO_DEEP when it is past the import caps,
 *   INVALID_MAP (with a `problems` array) if the structure is broken or an id is not one a node
 *   may have.
 */
export function fromJSON(text, options = {}) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new MindMapError('BAD_JSON', `This file is not valid JSON: ${error.message}`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new MindMapError('BAD_SCHEMA', 'This file does not hold a mind map object.');
  }
  if (parsed.schema !== MAP_SCHEMA) {
    throw new MindMapError(
      'BAD_SCHEMA',
      `Unknown schema ${String(parsed.schema)}; this build reads ${MAP_SCHEMA}.`
    );
  }

  const { maxNodes, maxDepth } = importCaps(options);
  const entries = Object.entries(
    parsed.nodes && typeof parsed.nodes === 'object' ? parsed.nodes : {}
  );
  if (entries.length > maxNodes) {
    throw tooManyNodes(maxNodes);
  }

  const title = typeof parsed.title === 'string' ? parsed.title : 'Untitled map';

  // Fill fields an older export left out before validating, so a file that is merely thin opens
  // while one that is actually broken still does not. An entry that is not a node, whose
  // children are not a list, or that is filed under an id no node may have, is left as it came
  // for validateMap to name. The bag is built
  // from entries and never by assignment, because assigning under `__proto__` files nothing.
  const nodes = Object.fromEntries(
    entries.map(([id, node]) => {
      const usable =
        node &&
        typeof node === 'object' &&
        !Array.isArray(node) &&
        isSafeId(id) &&
        (node.children === undefined || Array.isArray(node.children));
      if (!usable) {
        return [id, node];
      }
      return [
        id,
        createNode({
          ...node,
          id: isSafeId(node.id) ? node.id : id,
          text: namedOr(String(node.text ?? ''), id === parsed.rootId ? title : ''),
        }),
      ];
    })
  );

  const map = {
    schema: parsed.schema,
    id: parsed.id,
    title,
    rootId: parsed.rootId,
    nodes,
    links: Array.isArray(parsed.links) ? parsed.links : [],
    source: parsed.source || null,
    createdAt: Number.isFinite(parsed.createdAt) ? parsed.createdAt : 0,
    updatedAt: Number.isFinite(parsed.updatedAt) ? parsed.updatedAt : 0,
  };

  const problems = validateMap(map);
  if (problems.length > 0) {
    const error = new MindMapError(
      'INVALID_MAP',
      `This mind map file is damaged: ${problems.map(p => p.message).join(' ')}`
    );
    error.problems = problems;
    throw error;
  }

  // Only a tree has a depth, so this waits for validation; the walk is a loop, so a file nested
  // six thousand deep is refused here rather than by the stack.
  walk(map, (_node, depth) => {
    if (depth >= maxDepth) {
      throw tooDeep(maxDepth);
    }
  });

  return map;
}
