/**
 * Pure operations over a map: every one takes a map and returns a new map, never touching the one
 * it was given. Unchanged nodes are shared by reference, so an edit deep in a large map copies a
 * handful of objects rather than the tree.
 *
 * Two conventions the panes rely on:
 *  - an op that would change nothing returns the *same* map object, which is how `history` knows not
 *    to record an undo step for a keypress that did nothing;
 *  - a request that cannot make sense (an id nothing defines, a move that would eat its own tail)
 *    throws a MindMapError with a code, rather than quietly repairing itself.
 */

import { MindMapError, createNode, hasNode, nodeAt } from './map-model.js';
import { BRANCH_COLOURS } from './palette.js';

const requireNode = (map, id) => {
  const node = nodeAt(map, id);
  if (!node) {
    throw new MindMapError('UNKNOWN_NODE', `No node with id ${String(id)}.`);
  }
  return node;
};

const refuseRoot = (map, id, what) => {
  if (id === map.rootId) {
    throw new MindMapError('ROOT_IMMOVABLE', `The root node cannot ${what}.`);
  }
};

/** A map with some nodes replaced and updatedAt left alone — the store stamps time, not the ops. */
const withNodes = (map, replacements) => ({ ...map, nodes: { ...map.nodes, ...replacements } });

const withChildren = (map, parentId, children) =>
  withNodes(map, { [parentId]: { ...map.nodes[parentId], children } });

const insertAt = (list, item, index) => {
  const at =
    index === undefined || index === null ? list.length : Math.max(0, Math.min(index, list.length));
  return [...list.slice(0, at), item, ...list.slice(at)];
};

const insertMany = (list, items, index) => {
  const at =
    index === undefined || index === null ? list.length : Math.max(0, Math.min(index, list.length));
  return [...list.slice(0, at), ...items, ...list.slice(at)];
};

/** Set one field on one node, returning the same map when the value is already that. */
function setField(map, id, field, value) {
  const node = requireNode(map, id);
  if (node[field] === value) {
    return map;
  }
  return withNodes(map, { [id]: { ...node, [field]: value } });
}

const requireType = (value, ok, what) => {
  if (!ok) {
    throw new MindMapError(
      'INVALID_VALUE',
      `${what} got ${JSON.stringify(value) ?? String(value)}.`
    );
  }
};

/**
 * Depth-first walk in outline order.
 *
 * A loop over an explicit stack rather than recursion, so a map nested thousands deep is walked
 * rather than ending in a stack overflow. A child id that names no node is stepped over, and a
 * node is visited once however often it is listed, so a damaged map cannot make the walk spin.
 *
 * @param {Object} map
 * @param {(node: Object, depth: number, parent: Object|null) => void} visit
 * @param {Object} [options]
 * @param {boolean} [options.includeCollapsed=true] - false stops at a collapsed node's children.
 */
export function walk(map, visit, options = {}) {
  const { includeCollapsed = true } = options;
  const seen = new Set();
  const pending = [{ id: map.rootId, depth: 0, parent: null }];
  while (pending.length > 0) {
    const { id, depth, parent } = pending.pop();
    const node = nodeAt(map, id);
    if (!node || seen.has(id)) {
      continue;
    }
    seen.add(id);
    visit(node, depth, parent);
    if (node.collapsed && !includeCollapsed) {
      continue;
    }
    // Pushed last to first, so the first child is the next one popped.
    for (let at = node.children.length - 1; at >= 0; at -= 1) {
      pending.push({ id: node.children[at], depth: depth + 1, parent: node });
    }
  }
}

/**
 * Ids of a node and everything under it, in outline order.
 *
 * @param {Object} map
 * @param {string} id
 * @returns {string[]}
 */
export function subtreeIds(map, id) {
  const top = requireNode(map, id);
  const out = [];
  // The walk starts at the root, so the subtree is walked as a map whose root is this node.
  walk({ ...map, rootId: top.id }, node => out.push(node.id));
  return out;
}

/**
 * Ids from the root down to a node, inclusive — what the outline pane announces as the path.
 *
 * @param {Object} map
 * @param {string} id
 * @returns {string[]}
 */
export function pathTo(map, id) {
  let node = requireNode(map, id);
  const path = [node.id];
  while (node.parentId) {
    node = requireNode(map, node.parentId);
    path.push(node.id);
  }
  return path.reverse();
}

/**
 * Ids in outline order with collapsed subtrees hidden — the rows the outline shows and the nodes
 * the canvas lays out.
 *
 * @param {Object} map
 * @returns {string[]}
 */
export function visibleOrder(map) {
  const out = [];
  walk(map, node => out.push(node.id), { includeCollapsed: false });
  return out;
}

/**
 * How many nodes the tree holds, collapsed ones included.
 *
 * @param {Object} map
 * @returns {number}
 */
export function nodeCount(map) {
  let count = 0;
  walk(map, () => {
    count += 1;
  });
  return count;
}

/**
 * Add a node under a parent.
 *
 * @param {Object} map
 * @param {{parentId: string, node: Object, index?: number}} args - `node` may be a partial node;
 *   missing fields are filled from the contract defaults.
 * @returns {Object} a new map.
 */
export function addChild(map, { parentId, node, index } = {}) {
  const parent = requireNode(map, parentId);
  if (!node || typeof node !== 'object') {
    throw new MindMapError('INVALID_VALUE', 'addChild needs a node object.');
  }
  if (hasNode(map, node.id)) {
    throw new MindMapError('DUPLICATE_ID', `The map already holds a node with id ${node.id}.`);
  }
  const child = createNode({ ...node, parentId });
  return withNodes(map, {
    [parentId]: { ...parent, children: insertAt(parent.children, child.id, index) },
    [child.id]: child,
  });
}

/**
 * Add a node beside an existing one.
 *
 * @param {Object} map
 * @param {{siblingId: string, node: Object, after?: boolean}} args
 * @returns {Object} a new map.
 */
export function addSibling(map, { siblingId, node, after = true } = {}) {
  const sibling = requireNode(map, siblingId);
  refuseRoot(map, siblingId, 'have a sibling');
  const parent = requireNode(map, sibling.parentId);
  const at = parent.children.indexOf(siblingId) + (after ? 1 : 0);
  return addChild(map, { parentId: parent.id, node, index: at });
}

/**
 * Remove a node, everything under it, and any cross-link touching what went.
 *
 * @param {Object} map
 * @param {{id: string}} args
 * @returns {Object} a new map.
 */
export function removeNode(map, { id } = {}) {
  const node = requireNode(map, id);
  refuseRoot(map, id, 'be removed');
  const doomed = new Set(subtreeIds(map, id));
  // Built from entries, never by assignment: assigning under `__proto__` files nothing.
  const nodes = Object.fromEntries(
    Object.entries(map.nodes).filter(([nodeId]) => !doomed.has(nodeId))
  );
  const parent = nodes[node.parentId];
  nodes[node.parentId] = { ...parent, children: parent.children.filter(childId => childId !== id) };
  return {
    ...map,
    nodes,
    links: map.links.filter(link => !doomed.has(link.from) && !doomed.has(link.to)),
  };
}

/**
 * @param {Object} map
 * @param {{id: string, text: string}} args
 * @returns {Object} a new map.
 */
export function setText(map, { id, text } = {}) {
  requireType(text, typeof text === 'string', 'setText wants a string');
  return setField(map, id, 'text', text);
}

/**
 * @param {Object} map
 * @param {{id: string, notes: string}} args
 * @returns {Object} a new map.
 */
export function setNotes(map, { id, notes } = {}) {
  requireType(notes, typeof notes === 'string', 'setNotes wants a string');
  return setField(map, id, 'notes', notes);
}

/**
 * @param {Object} map
 * @param {{id: string, colour: number|null}} args - an index into BRANCH_COLOURS, or null to inherit.
 * @returns {Object} a new map.
 */
export function setColour(map, { id, colour } = {}) {
  const last = BRANCH_COLOURS.length - 1;
  if (colour !== null && !(Number.isInteger(colour) && colour >= 0 && colour <= last)) {
    throw new MindMapError(
      'INVALID_COLOUR',
      `Colour must be null or 0-${last}, got ${String(colour)}.`
    );
  }
  return setField(map, id, 'colour', colour);
}

/**
 * @param {Object} map
 * @param {{id: string, symbol: string|null}} args
 * @returns {Object} a new map.
 */
export function setSymbol(map, { id, symbol } = {}) {
  requireType(
    symbol,
    symbol === null || typeof symbol === 'string',
    'setSymbol wants a string or null'
  );
  return setField(map, id, 'symbol', symbol);
}

/**
 * @param {Object} map
 * @param {{id: string, source: {url: string, quote: string, title: string}|null}} args
 * @returns {Object} a new map.
 */
export function setSource(map, { id, source } = {}) {
  requireType(
    source,
    source === null || (typeof source === 'object' && !Array.isArray(source)),
    'setSource wants an object or null'
  );
  return setField(map, id, 'source', source);
}

/**
 * @param {Object} map
 * @param {{id: string, citationId: string|null}} args
 * @returns {Object} a new map.
 */
export function setCitation(map, { id, citationId } = {}) {
  requireType(
    citationId,
    citationId === null || typeof citationId === 'string',
    'setCitation wants a string or null'
  );
  return setField(map, id, 'citationId', citationId);
}

/**
 * @param {Object} map
 * @param {{id: string, done: boolean}} args
 * @returns {Object} a new map.
 */
export function setDone(map, { id, done } = {}) {
  requireType(done, typeof done === 'boolean', 'setDone wants a boolean');
  return setField(map, id, 'done', done);
}

/**
 * @param {Object} map
 * @param {{title: string}} args
 * @returns {Object} a new map.
 */
export function setTitle(map, { title } = {}) {
  requireType(title, typeof title === 'string', 'setTitle wants a string');
  return map.title === title ? map : { ...map, title };
}

/**
 * @param {Object} map
 * @param {{id: string}} args
 * @returns {Object} a new map.
 */
export function toggleCollapsed(map, { id } = {}) {
  const node = requireNode(map, id);
  return setField(map, id, 'collapsed', !node.collapsed);
}

/**
 * Re-parent a node, which is what a canvas drag and an outline indent both come down to.
 *
 * @param {Object} map
 * @param {{id: string, newParentId: string, index?: number}} args - index is clamped into range.
 * @returns {Object} a new map.
 * @throws {MindMapError} CYCLE when the new parent is the node itself or one of its descendants.
 */
export function moveNode(map, { id, newParentId, index } = {}) {
  const node = requireNode(map, id);
  const newParent = requireNode(map, newParentId);
  refuseRoot(map, id, 'be moved');

  if (subtreeIds(map, id).includes(newParentId)) {
    throw new MindMapError('CYCLE', `Node ${id} cannot be moved inside its own subtree.`);
  }

  const oldParentId = node.parentId;
  const detached = map.nodes[oldParentId].children.filter(childId => childId !== id);

  if (oldParentId === newParentId) {
    const reordered = insertAt(detached, id, index);
    if (reordered.every((childId, at) => childId === map.nodes[oldParentId].children[at])) {
      return map;
    }
    return withChildren(map, oldParentId, reordered);
  }

  return withNodes(map, {
    [oldParentId]: { ...map.nodes[oldParentId], children: detached },
    [newParentId]: { ...newParent, children: insertAt(newParent.children, id, index) },
    [id]: { ...node, parentId: newParentId },
  });
}

/**
 * Move several nodes under one parent, at one index, keeping the order they are given in.
 *
 * `moveNode` in a loop cannot do this. Each move shifts the indices the next one was counted
 * against, so five nodes aimed at one place land in five, and a node already among the destination's
 * children is counted once on the way out and again on the way in. Doing the whole block at once is
 * the only arithmetic there is only one of: every list the move touches is filtered of the moving
 * ids first, and the block is spliced into the destination as it stands after that.
 *
 * The index is therefore counted in the destination's children WITHOUT the moving nodes, which is
 * the same convention `siblingIndexForBlock` in node-edits.js counts a named place in.
 *
 * @param {Object} map
 * @param {{ids: string[], newParentId: string, index?: number}} args - `ids` in the order they
 *   should end up; the index is clamped into range, and omitting it appends.
 * @returns {Object} a new map, or the same one when every node is already there in that order.
 * @throws {MindMapError} INVALID_VALUE for an empty list, ROOT_IMMOVABLE for the root,
 *   DUPLICATE_ID for a repeated id, UNKNOWN_NODE for an id nothing defines, CYCLE when the
 *   destination is inside something that is moving — or when one moving node is inside another,
 *   which would carry it twice.
 */
export function moveNodes(map, { ids, newParentId, index } = {}) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new MindMapError('INVALID_VALUE', 'moveNodes wants a non-empty list of node ids.');
  }
  requireNode(map, newParentId);

  const moving = new Set();
  for (const id of ids) {
    requireNode(map, id);
    refuseRoot(map, id, 'be moved');
    if (moving.has(id)) {
      throw new MindMapError('DUPLICATE_ID', `moveNodes was given ${id} twice.`);
    }
    moving.add(id);
  }
  for (const id of ids) {
    const inside = subtreeIds(map, id);
    if (inside.includes(newParentId)) {
      throw new MindMapError('CYCLE', `Node ${id} cannot be moved inside its own subtree.`);
    }
    const nested = ids.find(other => other !== id && inside.includes(other));
    if (nested) {
      throw new MindMapError(
        'CYCLE',
        `Node ${nested} is already inside ${id}, which is moving as well.`
      );
    }
  }

  // A Map rather than an object: the keys are node ids, and ids arrive from files.
  const replacements = new Map();
  const detach = parentId => {
    if (!replacements.has(parentId)) {
      const parent = map.nodes[parentId];
      replacements.set(parentId, {
        ...parent,
        children: parent.children.filter(childId => !moving.has(childId)),
      });
    }
    return replacements.get(parentId);
  };
  for (const id of ids) {
    detach(map.nodes[id].parentId);
  }
  const destination = detach(newParentId);
  replacements.set(newParentId, {
    ...destination,
    children: insertMany(destination.children, ids, index),
  });
  for (const id of ids) {
    if (map.nodes[id].parentId !== newParentId) {
      replacements.set(id, { ...map.nodes[id], parentId: newParentId });
    }
  }

  const unchanged = [...replacements].every(([id, node]) => {
    const was = map.nodes[id];
    return (
      node.parentId === was.parentId &&
      node.children.length === was.children.length &&
      node.children.every((childId, at) => childId === was.children[at])
    );
  });
  return unchanged ? map : withNodes(map, Object.fromEntries(replacements));
}

/**
 * Make a node the last child of the sibling above it. Returns the map unchanged when there is no
 * sibling above — the outline's Tab key should feel inert at the top of a list, not error.
 *
 * @param {Object} map
 * @param {{id: string}} args
 * @returns {Object} a new map.
 */
export function indent(map, { id } = {}) {
  const node = requireNode(map, id);
  refuseRoot(map, id, 'be indented');
  const siblings = map.nodes[node.parentId].children;
  const at = siblings.indexOf(id);
  if (at <= 0) {
    return map;
  }
  return moveNode(map, { id, newParentId: siblings[at - 1] });
}

/**
 * Make a node the next sibling of its parent. Returns the map unchanged for a first-level node,
 * which has nowhere further out to go.
 *
 * @param {Object} map
 * @param {{id: string}} args
 * @returns {Object} a new map.
 */
export function outdent(map, { id } = {}) {
  const node = requireNode(map, id);
  refuseRoot(map, id, 'be outdented');
  const parent = map.nodes[node.parentId];
  if (parent.id === map.rootId) {
    return map;
  }
  const grandparent = map.nodes[parent.parentId];
  return moveNode(map, {
    id,
    newParentId: grandparent.id,
    index: grandparent.children.indexOf(parent.id) + 1,
  });
}

const shift = (map, id, delta) => {
  const node = requireNode(map, id);
  refuseRoot(map, id, 'be reordered');
  const siblings = map.nodes[node.parentId].children;
  const at = siblings.indexOf(id);
  const to = at + delta;
  if (to < 0 || to >= siblings.length) {
    return map;
  }
  const reordered = [...siblings];
  reordered[at] = siblings[to];
  reordered[to] = id;
  return withChildren(map, node.parentId, reordered);
};

/**
 * @param {Object} map
 * @param {{id: string}} args
 * @returns {Object} a new map, or the same one when the node is already first.
 */
export function moveUp(map, { id } = {}) {
  return shift(map, id, -1);
}

/**
 * @param {Object} map
 * @param {{id: string}} args
 * @returns {Object} a new map, or the same one when the node is already last.
 */
export function moveDown(map, { id } = {}) {
  return shift(map, id, 1);
}

/**
 * Add a cross-link, the secondary relation that lives beside the tree rather than inside it.
 *
 * @param {Object} map
 * @param {{id?: string, from: string, to: string, label?: string}} args - the id defaults to
 *   `from->to`, which also makes a second identical link a DUPLICATE_ID rather than a silent twin.
 * @returns {Object} a new map.
 */
export function addLink(map, { id, from, to, label = '' } = {}) {
  requireNode(map, from);
  requireNode(map, to);
  if (from === to) {
    throw new MindMapError('INVALID_LINK', 'A cross-link needs two different nodes.');
  }
  const linkId = typeof id === 'string' && id !== '' ? id : `${from}->${to}`;
  if (map.links.some(link => link.id === linkId)) {
    throw new MindMapError('DUPLICATE_ID', `The map already holds a link with id ${linkId}.`);
  }
  return { ...map, links: [...map.links, { id: linkId, from, to, label }] };
}

/**
 * @param {Object} map
 * @param {{id: string}} args
 * @returns {Object} a new map.
 */
export function removeLink(map, { id } = {}) {
  if (!map.links.some(link => link.id === id)) {
    throw new MindMapError('UNKNOWN_LINK', `No cross-link with id ${String(id)}.`);
  }
  return { ...map, links: map.links.filter(link => link.id !== id) };
}
