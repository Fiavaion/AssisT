/**
 * Deterministic layout: a pure function from the tree to boxes and edges.
 *
 * ADR 0001 makes the canvas a rendering of the outline, not a second state, so nothing here reads
 * the map back or measures the page. Text is sized by the arithmetic in the build contract rather
 * than by a real font metric, which is what lets the whole layout be graded in jest — including the
 * property that matters most on a crowded map: no two node boxes overlap.
 *
 * Coordinates are the top-left corner of a node box, in layout units the renderer treats as pixels.
 */

import { MindMapError } from './map-model.js';
import { walk } from './map-ops.js';

/** Characters per line before text wraps. */
const WRAP_AT = 28;

/** Node box geometry, from the build contract. */
const MIN_WIDTH = 80;
const MAX_WIDTH = 260;
const WIDTH_PER_CHAR = 8;
const WIDTH_PADDING = 24;
const LINE_HEIGHT = 18;
const BASE_HEIGHT = 36;

/** Space between a parent column and its children, and between stacked subtrees. */
const H_GAP = 40;
const V_GAP = 14;

/**
 * Two decimals is finer than any screen and keeps path strings stable across platforms. Adding zero
 * folds -0 into 0, so a mirrored branch cannot produce "-0" in a path string on one run and "0" on
 * the next.
 */
const round = value => Math.round(value * 100) / 100 + 0;

/**
 * Break text into lines of at most `width` characters, on word boundaries where it can be and
 * mid-word where a single word is longer than the line.
 *
 * Exported because the SVG renderer and the canvas pane must wrap identically to the boxes that
 * were measured here; two wrapping rules would mean text overflowing its own rectangle.
 *
 * @param {string} text
 * @param {number} [width=28]
 * @returns {string[]} at least one line, possibly empty.
 */
export function wrapText(text, width = WRAP_AT) {
  const words = String(text)
    .trim()
    .split(/\s+/)
    .filter(word => word !== '');
  const lines = [];
  let line = '';

  const push = () => {
    if (line !== '') {
      lines.push(line);
      line = '';
    }
  };

  for (let word of words) {
    while (word.length > width) {
      push();
      lines.push(word.slice(0, width));
      word = word.slice(width);
    }
    if (line === '') {
      line = word;
    } else if (line.length + 1 + word.length <= width) {
      line += ` ${word}`;
    } else {
      push();
      line = word;
    }
  }
  push();

  return lines.length > 0 ? lines : [''];
}

/**
 * Box size for a node's text, per the contract: width from the character count, height from the
 * number of wrapped lines.
 *
 * @param {string} text
 * @returns {{w: number, h: number}}
 */
function sizeOf(text) {
  const lines = wrapText(text, WRAP_AT).length;
  const w = Math.max(
    MIN_WIDTH,
    Math.min(WIDTH_PER_CHAR * String(text).length + WIDTH_PADDING, MAX_WIDTH)
  );
  return { w, h: BASE_HEIGHT + LINE_HEIGHT * (lines - 1) };
}

/**
 * The visible tree: each visible node's id against the ids of its visible children, in outline
 * order. Taken from `walk`, so the layout crosses exactly the nodes the outline shows: a collapsed
 * node has no children here, and an id that names no node is not in it.
 *
 * @param {Object} map
 * @returns {Map<string, string[]>}
 */
function visibleTree(map) {
  const kidsOf = new Map();
  walk(
    map,
    (node, _depth, parent) => {
      kidsOf.set(node.id, []);
      if (parent) {
        kidsOf.get(parent.id).push(node.id);
      }
    },
    { includeCollapsed: false }
  );
  return kidsOf;
}

/**
 * Place one subtree into a column per depth, stacked downwards from `top`.
 *
 * Every node sits inside the vertical band its own subtree reserved, and sibling bands never
 * overlap, so within a column no two boxes can collide. Columns are as wide as their widest node
 * plus the gap, so boxes in different columns cannot collide either. That pair of invariants is the
 * whole no-overlap guarantee.
 *
 * A parent is placed after its children, which recursion would do for free; the explicit stack of
 * frames does the same without a call per level, so depth cannot overflow the stack.
 *
 * @returns {number} the height the subtree reserved.
 */
function placeSubtree(map, kidsOf, id, depth, top, columnX, boxes) {
  const frameFor = (nodeId, nodeDepth, nodeTop) => ({
    id: nodeId,
    depth: nodeDepth,
    top: nodeTop,
    kids: kidsOf.get(nodeId),
    next: 0,
    cursor: nodeTop,
  });
  const frames = [frameFor(id, depth, top)];
  let reserved = 0;

  while (frames.length > 0) {
    const frame = frames[frames.length - 1];
    if (frame.next < frame.kids.length) {
      frames.push(frameFor(frame.kids[frame.next], frame.depth + 1, frame.cursor));
      frame.next += 1;
      continue;
    }

    const { w, h } = sizeOf(map.nodes[frame.id].text);
    let y = frame.top;
    let height = h;
    if (frame.kids.length > 0) {
      const childrenHeight = frame.cursor - V_GAP - frame.top;
      const first = boxes.get(frame.kids[0]);
      const last = boxes.get(frame.kids[frame.kids.length - 1]);
      const centre = (first.y + first.h / 2 + (last.y + last.h / 2)) / 2;
      height = Math.max(childrenHeight, h);
      // Centre the parent on its children, but never let it stray outside the band its subtree owns.
      y = Math.min(Math.max(centre - h / 2, frame.top), frame.top + height - h);
    }
    boxes.set(frame.id, { id: frame.id, x: columnX(frame.depth), y, w, h, depth: frame.depth });

    frames.pop();
    if (frames.length > 0) {
      frames[frames.length - 1].cursor += height + V_GAP;
    } else {
      reserved = height;
    }
  }
  return reserved;
}

/** Widest box at each depth among the given ids and their visible descendants. */
function columnWidths(map, kidsOf, rootIds, startDepth) {
  const widths = [];
  const pending = rootIds.map(id => ({ id, depth: startDepth }));
  while (pending.length > 0) {
    const { id, depth } = pending.pop();
    widths[depth] = Math.max(widths[depth] || 0, sizeOf(map.nodes[id].text).w);
    for (const childId of kidsOf.get(id)) {
      pending.push({ id: childId, depth: depth + 1 });
    }
  }
  return widths;
}

/** Column x positions from a starting edge, each column as wide as its widest node. */
function columnsFrom(widths, startDepth, startX) {
  const xs = [];
  let x = startX;
  for (let column = startDepth; column < widths.length; column += 1) {
    xs[column] = x;
    x += (widths[column] || 0) + H_GAP;
  }
  return depth => xs[depth];
}

/** Stack a list of subtrees vertically, returning the boxes and the height used. */
function stack(map, kidsOf, ids, startDepth, columnX, boxes) {
  let cursor = 0;
  for (const id of ids) {
    cursor += placeSubtree(map, kidsOf, id, startDepth, cursor, columnX, boxes) + V_GAP;
  }
  return ids.length === 0 ? 0 : cursor - V_GAP;
}

const shiftBoxes = (boxes, dy) => {
  for (const box of boxes.values()) {
    box.y += dy;
  }
};

/** Left-to-right tiers: depth is the column, the root is the only node in column 0. */
function layoutTree(map, kidsOf) {
  const boxes = new Map();
  const columnX = columnsFrom(columnWidths(map, kidsOf, [map.rootId], 0), 0, 0);
  placeSubtree(map, kidsOf, map.rootId, 0, 0, columnX, boxes);
  for (const box of boxes.values()) {
    box.side = box.depth === 0 ? 'root' : 'right';
  }
  return boxes;
}

/**
 * Root centred, first-level branches alternating right then left.
 *
 * The left half is laid out exactly like the right and then mirrored about the root's centre line,
 * which keeps one placement routine for both sides and makes the two halves symmetrical.
 */
function layoutRadial(map, kidsOf) {
  const rootSize = sizeOf(map.nodes[map.rootId].text);
  const branches = kidsOf.get(map.rootId);
  const rightIds = branches.filter((_id, at) => at % 2 === 0);
  const leftIds = branches.filter((_id, at) => at % 2 === 1);

  const rightBoxes = new Map();
  const rightX = columnsFrom(columnWidths(map, kidsOf, rightIds, 1), 1, rootSize.w + H_GAP);
  const rightHeight = stack(map, kidsOf, rightIds, 1, rightX, rightBoxes);

  const leftBoxes = new Map();
  const leftX = columnsFrom(columnWidths(map, kidsOf, leftIds, 1), 1, rootSize.w + H_GAP);
  const leftHeight = stack(map, kidsOf, leftIds, 1, leftX, leftBoxes);
  for (const box of leftBoxes.values()) {
    box.x = rootSize.w - box.x - box.w;
  }

  const height = Math.max(rightHeight, leftHeight, rootSize.h);
  shiftBoxes(rightBoxes, (height - rightHeight) / 2);
  shiftBoxes(leftBoxes, (height - leftHeight) / 2);

  const boxes = new Map();
  boxes.set(map.rootId, {
    id: map.rootId,
    x: 0,
    y: (height - rootSize.h) / 2,
    w: rootSize.w,
    h: rootSize.h,
    depth: 0,
    side: 'root',
  });
  for (const [side, sideBoxes] of [
    ['right', rightBoxes],
    ['left', leftBoxes],
  ]) {
    for (const [id, box] of sideBoxes) {
      boxes.set(id, { ...box, side });
    }
  }
  return boxes;
}

/**
 * Cubic bezier from the edge of the parent box to the edge of the child box, bending horizontally.
 * The same formula serves a left-hand branch, where the child is behind the parent and the control
 * points simply lean the other way.
 */
function edgePath(from, to) {
  const fromRight = to.x >= from.x;
  const x1 = fromRight ? from.x + from.w : from.x;
  const y1 = from.y + from.h / 2;
  const x2 = fromRight ? to.x : to.x + to.w;
  const y2 = to.y + to.h / 2;
  const bend = (x2 - x1) / 2;
  return `M ${round(x1)} ${round(y1)} C ${round(x1 + bend)} ${round(y1)}, ${round(x2 - bend)} ${round(y2)}, ${round(x2)} ${round(y2)}`;
}

/**
 * Lay a map out for the canvas.
 *
 * @param {Object} map
 * @param {Object} [options]
 * @param {'map'|'tree'} [options.mode='map'] - 'map' centres the root with branches either side;
 *   'tree' tiers strictly left to right.
 * @returns {{
 *   nodes: Array<{id: string, x: number, y: number, w: number, h: number, depth: number, side: string}>,
 *   edges: Array<{from: string, to: string, path: string}>,
 *   bounds: {minX: number, minY: number, maxX: number, maxY: number}
 * }} boxes in outline order; collapsed subtrees appear in neither list.
 * @throws {MindMapError} UNKNOWN_MODE for any other mode.
 */
export function layoutMap(map, options = {}) {
  const { mode = 'map' } = options;
  if (mode !== 'map' && mode !== 'tree') {
    throw new MindMapError(
      'UNKNOWN_MODE',
      `Unknown layout mode ${String(mode)}; expected map or tree.`
    );
  }

  const kidsOf = visibleTree(map);
  const boxes = mode === 'tree' ? layoutTree(map, kidsOf) : layoutRadial(map, kidsOf);
  const nodes = Array.from(kidsOf.keys(), id => {
    const box = boxes.get(id);
    return {
      id,
      x: round(box.x),
      y: round(box.y),
      w: box.w,
      h: box.h,
      depth: box.depth,
      side: box.side,
    };
  });

  // Placement and this loop read the same visible tree, so every visible child has a box.
  const placed = new Map(nodes.map(node => [node.id, node]));
  const edges = [];
  for (const node of nodes) {
    for (const childId of kidsOf.get(node.id)) {
      edges.push({ from: node.id, to: childId, path: edgePath(node, placed.get(childId)) });
    }
  }

  const bounds = nodes.reduce(
    (acc, node) => ({
      minX: Math.min(acc.minX, node.x),
      minY: Math.min(acc.minY, node.y),
      maxX: Math.max(acc.maxX, node.x + node.w),
      maxY: Math.max(acc.maxY, node.y + node.h),
    }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  );

  return { nodes, edges, bounds };
}
