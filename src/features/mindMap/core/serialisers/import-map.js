/**
 * What every importer shares: the caps, the id source, the name an unnamed node is given, and the
 * one way a file becomes a map.
 *
 * An importer reads its format into plain records through `startImport`, and the map is assembled
 * once at the end. Inserting node by node through `map-ops` copies the whole `nodes` object on
 * every insert, which is the right price for one edit with undo behind it and a ruinous one for a
 * file: five thousand nodes took ten seconds that way and take milliseconds this way.
 *
 * The caps are enforced as records are added, so a generated file is refused on its five thousand
 * and first node rather than after it has been read. The depth cap also protects everything
 * downstream: an outline a thousand levels deep is a file no other tool opens and a canvas nobody
 * can read, and the exporters indent no further than this cap for the same reason.
 */

import { MindMapError, createMap, createNode, validateMap } from '../map-model.js';

/**
 * How many nodes an import will read. A student's map is a few dozen nodes and the largest real
 * one this project has seen is under 400. Five thousand is far past any of them and far short of
 * the hundred thousand a generated or malicious file uses to make the editor hang.
 */
const MAX_NODES = 5000;

/** How many levels an import will read. Nothing a person wrote by hand comes near a hundred. */
export const MAX_DEPTH = 100;

/**
 * What a node with no name is called. Other tools allow an empty topic and the editor does not: a
 * row with no text is a treeitem with no accessible name, which a screen reader announces as
 * nothing at all. The wording is the one the inspector and the AI panel already show for it.
 */
const UNNAMED = '(untitled)';

/**
 * @param {string} text - a node's text as a file gave it.
 * @param {string} [instead] - a better name than the placeholder, when the caller has one.
 * @returns {string} the text, or a readable name when the text is blank.
 */
export const namedOr = (text, instead = '') =>
  text.trim() !== '' ? text : instead.trim() !== '' ? instead : UNNAMED;

/** 5000 as a student reads it, without reaching for a locale. */
const grouped = value => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** A cap from the options may tighten the limit, for a caller with less room, and never loosen it. */
const capOf = (wanted, ceiling) =>
  Number.isInteger(wanted) && wanted > 0 ? Math.min(wanted, ceiling) : ceiling;

/**
 * @param {{maxNodes?: number, maxDepth?: number}} [options]
 * @returns {{maxNodes: number, maxDepth: number}} the caps this import runs under.
 */
export const importCaps = (options = {}) => ({
  maxNodes: capOf(options.maxNodes, MAX_NODES),
  maxDepth: capOf(options.maxDepth, MAX_DEPTH),
});

/**
 * @param {number} limit
 * @returns {MindMapError} TOO_MANY_NODES, in the one sentence every importer uses.
 */
export const tooManyNodes = limit =>
  new MindMapError(
    'TOO_MANY_NODES',
    `This file holds more than ${grouped(limit)} nodes, which is more than a mind map can show, so it has not been opened.`
  );

/**
 * @param {number} limit
 * @returns {MindMapError} TOO_DEEP, in the one sentence every importer uses.
 */
export const tooDeep = limit =>
  new MindMapError(
    'TOO_DEEP',
    `This file nests nodes more than ${grouped(limit)} levels deep, which is deeper than a mind map can be read, so it has not been opened.`
  );

/** Ids for a caller that did not bring its own: unique within this map, and nothing more. */
function defaultIds() {
  let seen = 0;
  return () => `imported-${++seen}`;
}

/**
 * Begin reading a file into records.
 *
 * @param {Object} [options] - the importer's own options, passed straight through.
 * @param {() => string} [options.ids] - fresh id source; core never calls crypto.
 * @param {number} [options.maxNodes] - a lower node cap than MAX_NODES.
 * @param {number} [options.maxDepth] - a lower depth cap than MAX_DEPTH.
 * @returns {{ids: () => string, maxNodes: number, maxDepth: number,
 *   add: (parent: Object|null, fields?: Object) => Object,
 *   finish: (spec: Object) => Object}}
 */
export function startImport(options = {}) {
  const ids = typeof options.ids === 'function' ? options.ids : defaultIds();
  const { maxNodes, maxDepth } = importCaps(options);
  const records = [];

  /**
   * Add one node under a parent record, or as a root when there is none. The record is mutable,
   * because a format like `.mm` says a node's notes after it has opened the node.
   *
   * @throws {MindMapError} TOO_DEEP or TOO_MANY_NODES, before the record is made.
   */
  const add = (parent, fields = {}) => {
    const depth = parent ? parent.depth + 1 : 0;
    if (depth >= maxDepth) {
      throw tooDeep(maxDepth);
    }
    if (records.length >= maxNodes) {
      throw tooManyNodes(maxNodes);
    }
    const record = {
      text: '',
      notes: '',
      collapsed: false,
      colour: null,
      symbol: null,
      done: false,
      url: null,
      ...fields,
      id: ids(),
      parent,
      depth,
      children: [],
    };
    records.push(record);
    if (parent) {
      parent.children.push(record);
    }
    return record;
  };

  /**
   * Assemble the records into a map, once, and check it as any untrusted map is checked. A
   * record with no name gets one here, so the rule holds for every format: the centre takes the
   * map's title, and any other node the placeholder.
   *
   * @param {Object} spec
   * @param {string} spec.id - the map id.
   * @param {string} spec.title
   * @param {Object} spec.root - the record that is the centre; every other record hangs from it.
   * @param {Array<{from: Object, to: Object, label?: string}>} [spec.links] - cross-links between
   *   records; one from a node to itself, or a second between the same two, is dropped.
   * @param {{url: string, title: string}|null} [spec.source] - the page the map started from.
   * @returns {Object} a valid map.
   * @throws {MindMapError} INVALID_MAP, with a `problems` array, if the records do not make a tree.
   */
  const finish = ({ id, title, root, links = [], source = null }) => {
    const base = createMap({ id, title, rootId: root.id, source });
    const nodes = {};
    for (const record of records) {
      nodes[record.id] = createNode({
        id: record.id,
        text: namedOr(String(record.text), record === root ? String(title) : ''),
        notes: record.notes,
        children: record.children.map(child => child.id),
        parentId: record.parent ? record.parent.id : null,
        collapsed: record.collapsed,
        // The centre always draws with a branch colour, so a file that names none still gets one.
        colour:
          record === root && record.colour === null ? base.nodes[root.id].colour : record.colour,
        symbol: record.symbol,
        source: record.url ? { url: record.url, quote: '', title: '' } : null,
        done: record.done,
      });
    }

    const crossLinks = [];
    const seen = new Set();
    for (const link of links) {
      const linkId = `${link.from.id}->${link.to.id}`;
      if (link.from !== link.to && !seen.has(linkId)) {
        seen.add(linkId);
        crossLinks.push({
          id: linkId,
          from: link.from.id,
          to: link.to.id,
          label: link.label || '',
        });
      }
    }

    const map = { ...base, nodes, links: crossLinks };
    const problems = validateMap(map);
    if (problems.length > 0) {
      const error = new MindMapError(
        'INVALID_MAP',
        `This file did not make a usable map: ${problems.map(problem => problem.message).join(' ')}`
      );
      error.problems = problems;
      throw error;
    }
    return map;
  };

  return { ids, maxNodes, maxDepth, add, finish };
}
