/**
 * One branch of a map, as a map of its own.
 *
 * Focus mode (a student working on "Argument 2" with the rest of the essay out of sight) is a VIEW:
 * nothing about the map changes, nothing is saved, nothing goes on the undo stack. The only honest
 * way to draw a view with the panes that already exist is to hand them a map — so this derives one.
 *
 * Three things make the derived map safe to hand to a pane that will write to the REAL history:
 *
 *  - the ids are unchanged, so a selection, an undo entry and every sentence that names a node
 *    still mean the same nodes they always did;
 *  - it is a whole, valid map: the top of the branch has no parent, and a cross-link with one end
 *    outside the branch is left out rather than left dangling. `validateMap` passes on it;
 *  - nothing is copied that does not have to be. Every node but the top one is the same object the
 *    map holds, which is what lets `sameBranchView` tell a change inside the branch from one
 *    outside it in a few comparisons rather than a walk — and every op in `core/` is pure, so a
 *    shared node is shared read-only.
 *
 * That last point is what makes focus mode affordable: the view is derived again on every change to
 * the map, and a caller that keeps the previous view can reuse it whenever `sameBranchView` says the
 * branch did not change. A change a student cannot see then costs no redraw at all — and the caller
 * can say so out loud, which is the difference between "Ctrl+Z did nothing" and "Undone: a change
 * outside this branch."
 *
 * @module features/mindMap/core/branch-view
 */

import { MindMapError, nodeAt } from './map-model.js';
import { subtreeIds } from './map-ops.js';

/**
 * The branch under a node, as a map whose root is that node.
 *
 * @param {Object} map - the whole map.
 * @param {string} id - the node the branch hangs from.
 * @returns {Object} a valid map holding that node and everything under it, collapsed branches
 *   included (they are in the branch; they are simply not on screen). The map itself is returned
 *   when `id` is already its root, so "focus on the centre" is the whole map rather than a copy of
 *   it.
 * @throws {MindMapError} UNKNOWN_NODE when the map holds no such node.
 */
export function branchView(map, id) {
  const top = nodeAt(map, id);
  if (!top) {
    throw new MindMapError('UNKNOWN_NODE', `No node with id ${String(id)}.`);
  }
  if (id === map.rootId) {
    return map;
  }

  const ids = subtreeIds(map, id);
  const nodes = {};
  for (const nodeId of ids) {
    nodes[nodeId] = map.nodes[nodeId];
  }
  // The one node the view rewrites: the top of a branch has no parent inside it, and its children
  // list is copied rather than shared because this node is the view's own.
  nodes[id] = { ...top, parentId: null, children: [...top.children] };

  const inside = new Set(ids);
  const links = map.links.filter(link => inside.has(link.from) && inside.has(link.to));

  return {
    ...map,
    rootId: id,
    nodes,
    // Kept by reference when every link survived, so a caller comparing two views sees no change.
    links: links.length === map.links.length ? map.links : links,
    // What this is a view OF. Every sentence that would otherwise call the top of the branch "the
    // centre of the map" asks this instead, so a refusal a student reads is true of what they are
    // looking at.
    branchOf: map.rootId,
  };
}

/**
 * Whether a map is a branch cut out of a larger one.
 *
 * @param {Object} map
 * @returns {boolean}
 */
export const isBranchView = map => typeof map?.branchOf === 'string';

/**
 * Whether two nodes hold the same thing, field by field.
 *
 * Only ever asked of the top of a branch, which is the one node `branchView` rewrites and so the one
 * node two derivations cannot share. Every field is compared by identity — an edited note, colour or
 * source is a new value — and the children by their ids, which is what the shape of the branch is.
 *
 * @param {Object} a
 * @param {Object|undefined} b
 * @returns {boolean}
 */
function sameTopNode(a, b) {
  if (!b) {
    return false;
  }
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) {
    return false;
  }
  return keys.every(key => {
    if (key !== 'children') {
      return a[key] === b[key];
    }
    return (
      a.children.length === b.children.length &&
      a.children.every((childId, at) => childId === b.children[at])
    );
  });
}

/**
 * Whether two derived views hold the same picture.
 *
 * Every node below the top of the branch is compared by identity, which is exact rather than
 * approximate: the ops share structure, so a node nobody edited is the same object and a node
 * anybody edited is a different one. What is compared is everything a pane draws from — the shape,
 * the nodes, the cross-links — plus the title, which the page shows in its own box.
 *
 * @param {Object|null} a
 * @param {Object|null} b
 * @returns {boolean} true when a caller may keep `a` and throw `b` away.
 */
export function sameBranchView(a, b) {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  if (a.rootId !== b.rootId || a.title !== b.title || a.branchOf !== b.branchOf) {
    return false;
  }
  if (a.links !== b.links) {
    if (a.links.length !== b.links.length) {
      return false;
    }
    if (a.links.some((link, at) => link !== b.links[at])) {
      return false;
    }
  }
  const ids = Object.keys(a.nodes);
  if (ids.length !== Object.keys(b.nodes).length) {
    return false;
  }
  return ids.every(id =>
    id === a.rootId ? sameTopNode(a.nodes[id], b.nodes[id]) : a.nodes[id] === b.nodes[id]
  );
}
