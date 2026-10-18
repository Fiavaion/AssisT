/**
 * Canvas pane: the pointer user's view of the tree the outline edits.
 *
 * ADR 0001 makes this a *rendering* of the model, not a second state. Every gesture here ends in a
 * `history.apply(...)` that the outline pane sees on the same subscription, and the picture is
 * brought up to date from `layoutMap` after a change — there are no node positions to keep in step,
 * because the layout is a pure function of the tree.
 *
 * Up to date, not rebuilt. What is on screen for a node — its group, its connector, its collapse
 * button — is kept for as long as the node is on screen, and moved to wherever the new layout puts
 * it (see `render`). Typing a name in the outline is a change per keystroke, and most keystrokes
 * change the size of a box and so the position of everything round it; answering each with a new
 * picture meant re-creating every element and re-binding every handler several times a second.
 * There is one path, so there is no second picture for it to disagree with.
 *
 * Two decisions are worth stating, because both look like extra work until you try the alternative:
 *
 *  - The SVG is one `role="img"` with a name. A screen reader crawling a box-and-line drawing gets
 *    a worse outline than the outline pane already gives it, so the picture announces itself and
 *    then stays out of the way.
 *  - The two controls that must work without a pointer — the collapse toggles and the inline text
 *    editor — are real HTML elements in an overlay div above the SVG. An SVG `<g role="button">`
 *    is inconsistently focusable across assistive technology, and `<foreignObject>` loses focus in
 *    ways that are hard to reproduce; a positioned `<button>` and `<input>` simply work.
 *
 * @module pages/mind-map/canvas-pane
 */

import { drag } from 'd3-drag';
import { select } from 'd3-selection';
import { zoom, zoomIdentity } from 'd3-zoom';

import { layoutMap, wrapText } from '../../features/mindMap/core/layout.js';
import { hasNode, nodeAt } from '../../features/mindMap/core/map-model.js';
import { nodeCount, pathTo, subtreeIds } from '../../features/mindMap/core/map-ops.js';
import { colourResolver } from '../../features/mindMap/core/palette.js';
import { attachAccessibleHandler, attachInteractiveHandler } from '../../utils/event-handlers.js';

import {
  NEW_NODE_DISCARDED,
  NOTHING_MOVED,
  wholeMapOf,
  alreadyThereSentence,
  cannotMoveIntoOwnBranchSentence,
  cannotMoveSetIntoOwnBranchSentence,
  discardCreatedNode,
  effectiveSet,
  keptNameSentence,
  keptNewNodeSentence,
  movedNodesSentence,
  movedSentence,
  nameOf,
  siblingIndexForBlock,
} from './node-edits.js';
import { OUTSIDE_BRANCH_NOW, keptOutsideBranchSentence } from './focus-sentences.js';
import { centreOn, fitInto, isClearOf, uncoveredRegion } from './view-geometry.js';

import './canvas-pane.css';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Characters per line — the same number `layoutMap` measured the boxes with. */
const WRAP_AT = 28;

/** Box geometry, matching core/serialisers/svg.js so the export looks like the screen. */
const CORNER_RADIUS = 8;
const LINE_HEIGHT = 18;

/** Breathing room around the map when it is fitted to the view. */
const FIT_PADDING = 32;

/** How close a node may sit to the edge before "follow the selection" pans to it. */
const EDGE_MARGIN = 24;

/** The narrowest strip beside a sheet worth moving a node into: room for a box and its margins. */
const MIN_FREE = 120;

/** WCAG 2.2 SC 2.5.8: a pointer target is never smaller than 24 by 24 CSS pixels. The collapse
 *  toggles sit on top of a picture that scales, so their size has a floor the zoom cannot cross. */
const MIN_TARGET = 24;

/**
 * The drop zones at each end of a target box: how much of its height means "before this one" or
 * "after this one" rather than "inside it".
 *
 * Measured on screen, because that is where the student aims. The first version of this was written
 * in the picture's own units with a screen-pixel floor that a ceiling always beat, so on a map
 * zoomed out to fit the bands were two and a half pixels of a seven pixel box — three outcomes
 * nobody could choose between. A band narrower than `BAND_MIN_PX` is not a target, so where the box
 * is too short on screen to hold three of them the middle one goes and the box means before or after
 * by halves. That is the choice that keeps what the pointer cannot otherwise do at all: reordering
 * siblings. Making a child is still one press away — Shift+Enter on an outline row, the toolbar,
 * "Move to…", or the same drag at any closer zoom.
 */
const EDGE_FRACTION = 0.3;
const BAND_MIN_PX = 8;

/**
 * How far the pointer must travel, in screen pixels, before a press is a drag rather than a click.
 *
 * Every pointer reports a pixel or two of movement on a plain click, and d3-drag passes all of it
 * on: without a threshold a click on a node was a drag that had moved and landed on nothing, which
 * the pane answered with "Nothing moved." Four is the usual slop — small enough that a real drag is
 * never mistaken for a click, large enough to cover a shaking hand on a trackpad.
 */
const DRAG_SLOP = 4;

/** How far off the target box the insertion mark is drawn: half the gap the layout leaves. */
const HINT_OFFSET = 7;

/** How far past the end of the insertion line the caret reaches, and how tall it is. */
const CARET_LENGTH = 10;
const CARET_HALF = 6;

/**
 * The quick-add handles are placed in screen pixels, and they are always exactly `MIN_TARGET` across.
 *
 * Not in the picture's units: a position worked out there and then inflated to the 24 pixel floor
 * lands somewhere else, and where it landed on an ordinary map was on top of the collapse badge —
 * so the student aimed at "collapse" and made a node instead. A handle that takes a press from an
 * existing control is a regression, whatever it adds.
 *
 * `HANDLE_GAP_PX` is the clear space the handles keep from the node, from its collapse button and
 * from each other.
 */
const HANDLE_GAP_PX = 6;

/**
 * Input types that hold nothing to write, so a press on the canvas leaves them where they are.
 *
 * The rule below takes the keyboard off a field the student was typing in, which is only ever right
 * for a field that commits what it holds when it loses focus. A button, a checkbox or a radio has
 * already written whatever it had to write, and moving the focus off one would be this pane deciding
 * where the student is.
 */
const NON_TEXT_INPUTS = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

/**
 * Whether an element writes what it is holding when it loses focus.
 *
 * A `select` is not one of them, for all that it looks like a field: it wrote its answer the moment
 * the student chose one, so there is nothing pending for a blur to flush — and taking the keyboard
 * off a control with nothing to save would be this pane deciding where the student is.
 */
function flushesOnBlur(element) {
  const tag = element.tagName;
  if (tag === 'TEXTAREA') {
    return true;
  }
  return tag === 'INPUT' && !NON_TEXT_INPUTS.has(element.type);
}

const MIN_SCALE = 0.2;
const MAX_SCALE = 3;
const ZOOM_STEP = 1.3;

/** Matches the transition in canvas-pane.css; the class comes off again just after it ends. */
const MOTION_MS = 150;

/** Quiet time after the last size change before the view moves; a drag of a divider is a burst. */
const RESIZE_SETTLE_MS = 120;

/** jsdom and a pane that has not been laid out yet both report a zero-sized host. */
const FALLBACK_WIDTH = 900;
const FALLBACK_HEIGHT = 600;

/**
 * The two quick-add handles, in the order Tab meets them.
 *
 * A glyph and a name rather than a word in the button: there is room for two characters beside a
 * node box and none for a label. The name is what a screen reader reads; the glyph is what a sighted
 * student reads, so it says which way the new node goes rather than only that there is one — a plus
 * with an elbow into the branch for a child, a plus with an arrow down the list for a sibling. There
 * is deliberately no `title`: a tooltip beside a label is read out twice.
 */
const HANDLE_KINDS = Object.freeze([
  { kind: 'child', glyph: '+↳', name: text => `Add a child to '${text}'` },
  { kind: 'sibling', glyph: '+↓', name: text => `Add a sibling after '${text}'` },
]);

/** Marker ids must be unique per document, and a page may hold more than one canvas. */
let paneSerial = 0;

const clamp = (value, low, high) => Math.min(Math.max(value, low), high);

/** Create an SVG element with attributes, since `innerHTML` may never carry map data. */
function svgEl(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, String(value));
  }
  return element;
}

/**
 * The topmost laid-out node whose box contains a point, in layout coordinates.
 *
 * @param {Array<{id: string, x: number, y: number, w: number, h: number}>} nodes - laid-out boxes.
 * @param {number} x
 * @param {number} y
 * @param {Set<string>} exclude - the nodes being dragged, none of which can be its own drop target.
 * @returns {string|null} the node id under the point, or null.
 */
function nodeAtPoint(nodes, x, y, exclude) {
  // Later boxes are painted over earlier ones, so the last match is the one the student sees.
  for (let at = nodes.length - 1; at >= 0; at -= 1) {
    const node = nodes[at];
    if (
      !exclude.has(node.id) &&
      x >= node.x &&
      x <= node.x + node.w &&
      y >= node.y &&
      y <= node.y + node.h
    ) {
      return node.id;
    }
  }
  return null;
}

/**
 * Which part of a target box the pointer is over: the place before it, the place after it, or
 * inside it.
 *
 * Leading and trailing are the top and the bottom of the box in both layouts and on both sides of
 * the map. `stack` in layout.js walks one cursor *down* a column to place sibling subtrees, and the
 * map layout mirrors its left half in x only (`box.x = rootSize.w - box.x - box.w`), leaving every
 * y where the right half put it. So a sibling's neighbour is always above or below it, never beside
 * it, and there is one rule rather than one per side.
 *
 * @param {{y: number, h: number}} box - the target's laid-out box.
 * @param {number} y - the pointer, in layout coordinates.
 * @param {number} scale - the current zoom, which is what turns the box into what the student sees.
 * @param {boolean} isRoot - the centre of the map has no siblings, so it has no edges either.
 * @returns {'before'|'after'|'into'}
 */
function dropZone(box, y, scale, isRoot) {
  if (isRoot) {
    return 'into';
  }
  const height = box.h * scale;
  const down = (y - box.y) * scale;
  // Too short on screen for three bands worth aiming at: before or after, by halves.
  if (height < 3 * BAND_MIN_PX) {
    return down < height / 2 ? 'before' : 'after';
  }
  const edge = Math.min(Math.max(height * EDGE_FRACTION, BAND_MIN_PX), (height - BAND_MIN_PX) / 2);
  if (down < edge) {
    return 'before';
  }
  if (down > height - edge) {
    return 'after';
  }
  return 'into';
}

/**
 * What a drop does, as history steps.
 *
 * A drop onto a shut branch is two operations — move it, then open the branch so the student can
 * see where it went — but it is ONE thing the student did with one gesture, so it has to cost one
 * Ctrl+Z. `applyBatch` records the pair as a single entry; this function is the pair itself.
 *
 * A drop beside the target needs no second step: the target is on screen, so the parent it shares
 * with the node is open already.
 *
 * One node or several: `moveNodes` is the same arithmetic for a block of one, so there is one path
 * rather than two that could drift a place apart.
 *
 * @param {Object} map
 * @param {string[]} ids - the nodes being dragged, in the order they should land.
 * @param {string} targetId - the node it was dropped on; `canDropOn` has already allowed it.
 * @param {'before'|'after'|'into'} zone - which part of the target it was dropped on.
 * @returns {Array<{op: string, args: Object}>} steps for `history.applyBatch`.
 */
function dropSteps(map, ids, targetId, zone) {
  const target = map.nodes[targetId];
  if (zone !== 'into') {
    const parentId = target.parentId;
    return [
      {
        op: 'moveNodes',
        args: {
          ids,
          newParentId: parentId,
          index: siblingIndexForBlock(map, {
            ids,
            parentId,
            siblingId: targetId,
            after: zone === 'after',
          }),
        },
      },
    ];
  }
  const steps = [
    { op: 'moveNodes', args: { ids, newParentId: targetId, index: target.children.length } },
  ];
  if (target.collapsed) {
    // Dropping into a shut branch would otherwise look like the node had vanished, so the branch
    // opens to show where it went.
    steps.push({ op: 'toggleCollapsed', args: { id: targetId } });
  }
  return steps;
}

/**
 * Whether a node may be dropped onto a target.
 *
 * A node cannot become its own descendant's child: `moveNode` throws CYCLE for that, and a drag
 * has to know before the drop so it can show the refusal rather than raise an error.
 *
 * @param {Object} map
 * @param {string[]} ids - the nodes being dragged.
 * @param {string|null} targetId
 * @returns {boolean} false unless every node being dragged may land there.
 */
function canDropOn(map, ids, targetId) {
  if (!targetId || !hasNode(map, targetId) || ids.length === 0) {
    return false;
  }
  return ids.every(
    id => id !== targetId && hasNode(map, id) && !subtreeIds(map, id).includes(targetId)
  );
}

/** "1 hidden node" reads better than "1 hidden nodes", and a student hears this often. */
const hiddenPhrase = count => (count === 1 ? '1 hidden node' : `${count} hidden nodes`);

/**
 * Render a map onto an SVG canvas inside `host`.
 *
 * @param {HTMLElement} host - the element the pane fills; emptied on mount.
 * @param {Object} options
 * @param {Object} options.history - a `createHistory` instance; every edit goes through `apply`.
 * @param {Object} options.selection - the shared selection store from selection.js.
 * @param {(text: string) => void} [options.announce] - writes to the page's live region.
 * @param {(text: string) => void} [options.notify] - the page's `showToast`, which writes the toast
 *   AND the live region in one call. For the three things this pane does that a student cannot read
 *   off the map: a name it put back into a node they emptied, a drop it refused, and a node they had
 *   started making that it threw away. All three were said into the live region alone, which a
 *   sighted student never hears — so the map simply snapped back, or a box vanished, with no word of
 *   why. Never called alongside `announce`: that would say it twice.
 * @param {() => ('map'|'tree')} [options.getLayoutMode]
 * @param {boolean} [options.reducedMotion] - defaults to the operating system preference.
 * @param {(id: string, options: {asChild: boolean}) => Object|null} [options.createNode] - the
 *   outline pane's own `addNode`, which the quick-add handles make nodes through: the outline is
 *   the editor (ADR 0001), so there is one way to make a node and this is not a second one.
 * @param {(id: string) => void} [options.rescueFocus] - where the keyboard goes when this pane has
 *   to take the inline editor away: the page puts it on that node's outline row.
 * @returns {{destroy: () => void, fitToView: () => void, zoomTo: (id: string) => void,
 *   ensureVisible: (id: string) => void, redraw: () => void,
 *   setCovered: (rect: {left: number, top: number, width: number, height: number}|null) => void,
 *   getSvgElement: () => SVGSVGElement}}
 */
export function mountCanvasPane(host, options = {}) {
  const {
    history,
    selection,
    announce = () => {},
    notify = () => {},
    getLayoutMode = () => 'map',
    createNode = () => null,
    rescueFocus = () => {},
    reducedMotion = Boolean(
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ),
  } = options;

  paneSerial += 1;
  const arrowId = `mm-link-arrow-${paneSerial}`;

  const root = document.createElement('div');
  root.className = 'mm-canvas';
  // Reachable by script and not by Tab: the picture is a rendering of the outline (ADR 0001), so it
  // is never a tab stop of its own — but it has to be somewhere the keyboard can be PUT. When a
  // press here takes the caret out of a field elsewhere on the page (`releaseOutsideEdit`), this is
  // where it goes: the student pressed the canvas, so the canvas is where they are. Dropped on
  // `document.body` instead, the page's own shortcuts still worked but the next Tab started again at
  // the top of the document, and nothing owned the focus the student had just moved. It takes no
  // name and no role of its own: the host section is already named "Map view" (mindmap.html) and the
  // picture inside carries its own description, so this is the same view, now able to hold the
  // keyboard. The ring is for the keyboard only (`:focus-visible` in canvas-pane.css), because a
  // press is the student looking at what they pressed rather than asking where they are.
  root.tabIndex = -1;

  const zoomCluster = document.createElement('div');
  zoomCluster.className = 'mm-canvas__zoom';
  zoomCluster.setAttribute('role', 'group');
  zoomCluster.setAttribute('aria-label', 'Canvas view');

  // The level is written for the eye only: every change to it is already spoken through the live
  // region by `zoomByStep` and by Fit, and a second announcement per wheel notch would be noise.
  const zoomLevel = document.createElement('span');
  zoomLevel.className = 'mm-canvas__zoomLevel';
  zoomLevel.setAttribute('aria-hidden', 'true');

  const svg = svgEl('svg', {
    class: 'mm-canvas__svg',
    role: 'img',
    focusable: 'false',
    'data-testid': 'canvas-svg',
  });

  const defs = svgEl('defs');
  const marker = svgEl('marker', {
    id: arrowId,
    viewBox: '0 0 10 10',
    refX: 9,
    refY: 5,
    markerWidth: 6,
    markerHeight: 6,
    orient: 'auto-start-reverse',
  });
  marker.appendChild(svgEl('path', { class: 'mm-link__arrow', d: 'M 0 0 L 10 5 L 0 10 z' }));
  defs.appendChild(marker);
  svg.appendChild(defs);

  const viewport = svgEl('g', { class: 'mm-canvas__viewport' });
  const edgesGroup = svgEl('g', { class: 'mm-canvas__edges' });
  const linksGroup = svgEl('g', { class: 'mm-canvas__links' });
  const nodesGroup = svgEl('g', { class: 'mm-canvas__nodes' });

  // Where a dragged node will land between two siblings: a line with a caret at its leading end. It
  // is a shape rather than a colour (SC 1.4.1), it lives inside the viewport so it follows the pan
  // and the zoom without any arithmetic of its own, and it is painted over the nodes because the
  // place it marks is the gap between two of them.
  const hintGroup = svgEl('g', {
    class: 'mm-canvas__dropHint',
    display: 'none',
    'aria-hidden': 'true',
  });
  const hintLine = svgEl('path', { class: 'mm-canvas__dropLine' });
  const hintCaret = svgEl('path', { class: 'mm-canvas__dropCaret' });
  hintGroup.append(hintLine, hintCaret);

  viewport.append(edgesGroup, linksGroup, nodesGroup, hintGroup);
  svg.appendChild(viewport);

  const overlay = document.createElement('div');
  overlay.className = 'mm-canvas__overlay';

  root.append(svg, overlay, zoomCluster);
  host.replaceChildren(root);

  /** Overlay children and the layout box each one tracks, so a zoom can reposition them. */
  let overlayItems = [];
  /**
   * What is on screen for each laid-out node, by node id: `{ group, cleanups, drawnFrom, toggle }`.
   * An entry lives exactly as long as its node is in the layout; `render` moves it, never remakes
   * it. `toggle` is `{ item, cleanup }` while the node has children to collapse, otherwise null.
   */
  const nodeEntries = new Map();
  /**
   * The quick-add handles, which belong to one node at a time: `{ id, buttons: Map<kind, entry> }`,
   * where each entry is `{ item, cleanup }` as the collapse toggles are. Null when nothing that is
   * on screen is selected.
   */
  let handles = null;
  /** The connector into each node, by that node's id, and the parts of each cross-link by its id. */
  let edgeElements = new Map();
  let linkElements = new Map();
  let layout = null;
  /** The sheet lying over part of the view, in this pane's own coordinates; null when none is. */
  let covered = null;
  let transform = zoomIdentity;
  let motionTimer = 0;
  let resizeTimer = 0;
  let editor = null;
  let destroyed = false;
  /** The node the keyboard goes to once this render has finished taking the editor away. */
  let pendingRescue = null;

  const viewWidth = () => root.clientWidth || FALLBACK_WIDTH;
  const viewHeight = () => root.clientHeight || FALLBACK_HEIGHT;

  const zoomBehaviour = zoom()
    .scaleExtent([MIN_SCALE, MAX_SCALE])
    // The default extent measures the SVG through geometry jsdom does not implement, and a pane
    // that has not been laid out yet measures zero either way; the host's box is the honest answer.
    .extent(() => [
      [0, 0],
      [viewWidth(), viewHeight()],
    ])
    .on('zoom', event => {
      transform = event.transform;
      viewport.setAttribute('transform', transform.toString());
      positionOverlay();
      showZoomLevel();
    });

  /** Keep the number in the zoom cluster honest, whatever moved the view — button, wheel or pinch. */
  function showZoomLevel() {
    zoomLevel.textContent = `${Math.round(transform.k * 100)}%`;
  }

  // Double-click means "edit this node" here, so d3's double-click-to-zoom would fight the editor.
  select(svg).call(zoomBehaviour).on('dblclick.zoom', null);

  /**
   * Where an overlay control is drawn now, in the pane's own pixels.
   *
   * The control follows the zoom, but only upwards: a map zoomed out to a fifth would otherwise
   * leave the collapse toggles at four pixels across, which is unusable with a finger and a
   * failure of SC 2.5.8. Below the floor the control is grown about its own centre, so it stays
   * on the badge it belongs to. `ensureVisible` reads the same boxes, so a node is only counted as
   * on screen when its handles are too.
   *
   * @returns {{left: number, top: number, width: number, height: number}}
   */
  function drawnBox(item) {
    const drawnWidth = item.w * transform.k;
    const drawnHeight = item.h * transform.k;
    const width = Math.max(drawnWidth, MIN_TARGET);
    const height = Math.max(drawnHeight, MIN_TARGET);
    return {
      left: transform.applyX(item.x) - (width - drawnWidth) / 2,
      top: transform.applyY(item.y) - (height - drawnHeight) / 2,
      width,
      height,
    };
  }

  /**
   * Where an overlay control ends up: over the layout box it tracks, or at the screen position it
   * was given. The quick-add handles are the second kind — see `placeHandles`.
   *
   * @param {Object} item
   * @returns {{left: number, top: number, width: number, height: number}}
   */
  const shownBox = item => item.screen || drawnBox(item);

  function placeOverlay(item) {
    const { left, top, width, height } = shownBox(item);
    item.element.style.left = `${left}px`;
    item.element.style.top = `${top}px`;
    item.element.style.width = `${width}px`;
    item.element.style.height = `${height}px`;
  }

  /** Two rectangles in the pane's own pixels, overlapping by any amount at all. */
  const overlaps = (a, b) =>
    a.left < b.left + b.width &&
    b.left < a.left + a.width &&
    a.top < b.top + b.height &&
    b.top < a.top + a.height;

  function positionOverlay() {
    // The handles are placed in screen pixels, so a pan or a zoom is a new position for them rather
    // than the same position seen from further away.
    if (handles) {
      placeHandles();
    }
    for (const item of overlayItems) {
      placeOverlay(item);
    }
  }

  /** @returns {{element: HTMLElement, x: number, y: number, w: number, h: number}} the item, so a
   *   control that outlives a re-render can be moved to the box its node ended up in. */
  function addOverlay(element, x, y, w, h) {
    const item = { element, x, y, w, h };
    overlayItems.push(item);
    overlay.appendChild(element);
    placeOverlay(item);
    return item;
  }

  /**
   * Put a parent's children into the given order, moving only the ones that are out of place and
   * dropping whatever is not on the list.
   *
   * Only the ones out of place, because moving an element takes it out of the document for an
   * instant, and a button that leaves the document loses the keyboard focus it was holding.
   */
  function arrange(parent, elements) {
    elements.forEach((element, at) => {
      if (parent.children[at] !== element) {
        parent.insertBefore(element, parent.children[at] || null);
      }
    });
    while (parent.children.length > elements.length) {
      parent.lastElementChild.remove();
    }
  }

  /**
   * Move the view. Programmatic moves ease over 150 ms unless the student asked for less motion;
   * an interactive pan never gets the class, so it tracks the pointer exactly.
   */
  function applyTransform(next, animate) {
    if (animate && !reducedMotion) {
      viewport.classList.add('mm-canvas__viewport--moving');
      overlay.classList.add('mm-canvas__overlay--moving');
      window.clearTimeout(motionTimer);
      motionTimer = window.setTimeout(() => {
        viewport.classList.remove('mm-canvas__viewport--moving');
        overlay.classList.remove('mm-canvas__overlay--moving');
      }, MOTION_MS + 20);
    }
    zoomBehaviour.transform(select(svg), next);
  }

  const boxOf = id => (layout ? layout.nodes.find(node => node.id === id) : undefined);

  /** The part of the view a student can actually see: all of it, unless a sheet lies over some. */
  const freeRegion = () => uncoveredRegion({ w: viewWidth(), h: viewHeight() }, covered, MIN_FREE);

  /**
   * Put a node in the middle of the view at the current scale.
   *
   * The page's handle for "show me this node", and the move the pane makes for itself when a
   * selection arrives from the outline, the inspector or a programmatic jump.
   *
   * @param {string} id
   * @param {boolean} [animate=true]
   */
  function zoomTo(id, animate = true) {
    const box = boxOf(id);
    if (!box) {
      return;
    }
    const k = transform.k;
    const move = centreOn(freeRegion(), { x: box.x + box.w / 2, y: box.y + box.h / 2 }, k);
    applyTransform(zoomIdentity.translate(move.x, move.y).scale(k), animate);
  }

  /**
   * Everything a node takes up on screen: its box, and the quick-add handles when it is the node
   * carrying them. A node whose handles are under a sheet is a node whose controls the student
   * cannot reach, so the handles count as part of it for "is this on screen".
   *
   * @param {string} id
   * @param {{x: number, y: number, w: number, h: number}} box
   * @returns {{left: number, top: number, right: number, bottom: number}}
   */
  function occupiedBy(id, box) {
    const region = {
      left: transform.applyX(box.x),
      top: transform.applyY(box.y),
      right: transform.applyX(box.x + box.w),
      bottom: transform.applyY(box.y + box.h),
    };
    if (!handles || handles.id !== id) {
      return region;
    }
    for (const { item } of handles.buttons.values()) {
      // A handle there was no room for is not drawn, so it is not part of the node either.
      if (item.element.hidden) {
        continue;
      }
      const drawn = shownBox(item);
      region.left = Math.min(region.left, drawn.left);
      region.top = Math.min(region.top, drawn.top);
      region.right = Math.max(region.right, drawn.left + drawn.width);
      region.bottom = Math.max(region.bottom, drawn.top + drawn.height);
    }
    return region;
  }

  /** Pan only when the node is not already comfortably on screen — an arrow key should not lurch. */
  function ensureVisible(id, animate) {
    const box = boxOf(id);
    if (!box) {
      return;
    }
    if (!isClearOf(occupiedBy(id, box), freeRegion(), EDGE_MARGIN)) {
      zoomTo(id, animate);
    }
  }

  /**
   * @param {boolean} [animate=true] - the first fit at mount arrives with the page, so it does not
   *   ease; every later fit is a move the student asked for and reads better with the transition.
   */
  function fitToView(animate = true) {
    if (!layout || layout.nodes.length === 0) {
      return;
    }
    const fit = fitInto(freeRegion(), layout.bounds, {
      padding: FIT_PADDING,
      minScale: MIN_SCALE,
      maxScale: MAX_SCALE,
    });
    applyTransform(zoomIdentity.translate(fit.x, fit.y).scale(fit.k), animate);
  }

  /** Keep the selection in view, or the whole map when nothing is selected. */
  function keepInView(animate) {
    const id = selection.get();
    if (id && boxOf(id)) {
      ensureVisible(id, animate);
      return;
    }
    fitToView(animate);
  }

  /**
   * Hear that a sheet has opened over part of the view, or closed again.
   *
   * Below 900px the docks are laid over the canvas rather than beside it, so the host never changes
   * size and the resize watcher below never fires: the node the student was working on is simply
   * under the sheet. Opening one moves it clear; closing one moves nothing, because everything
   * that was in view still is.
   *
   * @param {{left: number, top: number, width: number, height: number}|null} rect - the sheet's
   *   `getBoundingClientRect()`, or null when no sheet is open.
   */
  function setCovered(rect) {
    if (!rect) {
      covered = null;
      return;
    }
    const own = root.getBoundingClientRect();
    covered = { x: rect.left - own.left, y: rect.top - own.top, w: rect.width, h: rect.height };
    // Eased, and `applyTransform` drops the easing for a student who asked for less motion.
    keepInView(true);
  }

  /**
   * Where the view goes when a zoom button is pressed: about the selected node, or about the middle
   * of the view when nothing is selected.
   *
   * About the selection, because a student presses Zoom in to look closer at the node they have just
   * chosen. Zooming about the middle of the view moves everything away from the centre, so the node
   * they were working on walked towards the edge a step at a time and then off it — at which point
   * the control that was supposed to help them see it had hidden it.
   *
   * A node that is already off the edge cannot be held where it is, so the zoom brings it to the
   * middle instead: that is the one move that answers what the button was pressed for.
   *
   * @param {number} k - the scale the view is going to.
   * @returns {{x: number, y: number}} the translation to go with it.
   */
  function zoomStepMove(k) {
    const id = selection.get();
    const box = id ? boxOf(id) : null;
    if (!box) {
      const cx = viewWidth() / 2;
      const cy = viewHeight() / 2;
      return {
        x: cx - (cx - transform.x) * (k / transform.k),
        y: cy - (cy - transform.y) * (k / transform.k),
      };
    }
    const point = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    const held = { x: transform.applyX(point.x), y: transform.applyY(point.y) };
    const region = freeRegion();
    const onScreen = isClearOf(
      { left: held.x, top: held.y, right: held.x, bottom: held.y },
      region,
      EDGE_MARGIN
    );
    return onScreen
      ? { x: held.x - k * point.x, y: held.y - k * point.y }
      : centreOn(region, point, k);
  }

  function zoomByStep(factor) {
    const k = clamp(transform.k * factor, MIN_SCALE, MAX_SCALE);
    const move = zoomStepMove(k);
    applyTransform(zoomIdentity.translate(move.x, move.y).scale(k), true);
    announce(`Zoom ${Math.round(k * 100)} per cent`);
  }

  /**
   * Take the inline editor off the screen, writing nothing.
   *
   * The second half of every way out of the field: whatever decided what to write has written it
   * already, and `settle` is called before the input goes so that the blur a removal raises cannot
   * commit a second time with a value the student has left behind.
   */
  function removeEditor() {
    if (editor) {
      const { input, settle } = editor;
      editor = null;
      settle();
      overlayItems = overlayItems.filter(item => item.element !== input);
      input.remove();
    }
  }

  /**
   * Close the inline editor because something else needs it gone: a drag starting on another node, a
   * field opening somewhere else, a handle making a new node.
   *
   * It COMMITS, by the same rules as Enter and through the same function. `settle` used to be called
   * before the input was removed, which suppressed the blur that would have committed: a drag begun
   * while renaming threw the typed name away without a word, and a node a quick-add handle had just
   * made stayed on the map with no name at all. Escape is the one way out of this field that
   * discards, and it is the only one that says so.
   */
  function closeEditor() {
    if (editor) {
      editor.commit();
    }
  }

  /**
   * Take the field away because its node has left the picture, keeping what the student typed.
   *
   * The words are theirs whether the node went behind a fold, out of the branch on show or off the
   * map altogether, so they are written first — and a node they never named is thrown away rather
   * than left on the map as a blank box, which is the rule every other way out of this field keeps.
   * The caller owns the sentence, because only the caller knows where the node went.
   *
   * @param {Object} map - the map this render pass is drawing.
   * @param {string} id - the node the field was opened on.
   * @returns {'blank'|'discarded'|'written'|'restarted'} what happened: nothing to write; a node the
   *   student never named thrown away; the name written; or written as a step that has already drawn
   *   the picture from a newer map, which the caller must leave alone.
   */
  function partWithEditor(map, id) {
    const { input, edit } = editor;
    const typed = input.value;
    removeEditor();
    if (typed.trim() === '') {
      if (!edit) {
        return 'blank';
      }
      discardNewNode(edit, false);
      return 'discarded';
    }
    return history.apply('setText', { id, text: typed }) === map ? 'written' : 'restarted';
  }

  /**
   * Write the first name of a node a handle made, as part of the step that made it.
   *
   * Under the creation's mark, and then folded into it: making a node and naming it is two
   * operations and one thing the student did, so it has to cost one Ctrl+Z. Left as two, the first
   * undo after naming took the name off and left an empty box — which is the one thing every editor
   * on this page refuses to write.
   *
   * @param {string} id
   * @param {string} text
   * @param {{mark: symbol}} edit
   */
  function commitNewName(id, text, edit) {
    history.apply('setText', { id, text }, { mark: edit.mark });
    history.squashSince(edit.mark, { name: 'addNode' });
  }

  /**
   * Throw away a node a quick-add handle made and the student never named.
   *
   * The same rule the outline's own editor keeps, through the same function: the creation is
   * forgotten rather than reversed, so the first Ctrl+Z after it does not put an empty box back.
   *
   * @param {{id: string, from: string, mark: symbol, handle: string}} edit
   * @param {boolean} byKey - true when a key in this field ended the edit. The keyboard is then
   *   nowhere (the field it was in has gone), so it goes back to the handle that was pressed and the
   *   pointer and the keyboard leave the student in the same place. A blur is the student saying
   *   where they are going, and pulling them back out of it would be this pane taking the keyboard
   *   off them.
   */
  function discardNewNode(edit, byKey) {
    discardCreatedNode(history, edit);
    // Shown as well as said (`notify` does both, so it is never paired with `announce`): a box the
    // student was looking at disappears, and a sighted student was given no word for why.
    notify(NEW_NODE_DISCARDED);
    const map = history.current();
    selection.set(hasNode(map, edit.from) ? edit.from : map.rootId, { source: 'canvas' });
    const handle = byKey && handles ? handles.buttons.get(edit.handle) : null;
    if (handle) {
      handle.item.element.focus();
    }
  }

  /**
   * Edit a node's text in place. The input is an HTML `<input>` in the overlay rather than an SVG
   * `<foreignObject>`, because focus into a foreignObject is unreliable across browsers and this
   * has to work the first time, every time.
   *
   * @param {string} id
   * @param {{original: string, created: true, from: string, mark: symbol, handle: string}} [edit] -
   *   the record of a node a quick-add handle has just made. With one, the field keeps the rules
   *   the outline's editor keeps for a brand-new node: a blank one is discarded on every way out,
   *   what is typed is written under the creation's mark, and Enter offers another node after it.
   */
  function openEditor(id, edit = null) {
    closeEditor();
    // The field belongs to one node, so opening it says which node the student is working on.
    // `said` for a node that has just been made: it has no name for the count sentence to quote.
    if (selection.ids().length > 1) {
      selection.set(id, { source: 'canvas', said: Boolean(edit && edit.created) });
    }
    const box = boxOf(id);
    const node = history.current().nodes[id];
    if (!box || !node) {
      return;
    }
    const created = Boolean(edit && edit.created);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'mm-canvas__editor';
    input.value = node.text;
    input.setAttribute('aria-label', 'Node text');

    let settled = false;
    const finish = (commit, { andAnother = false, byKey = false } = {}) => {
      if (settled) {
        return;
      }
      const text = input.value;
      removeEditor();
      // Read again rather than closed over: the editor outlives a re-render, so the node may have
      // been renamed elsewhere while this field was open — or taken off the map, and then there is
      // nothing left to write to and `render` has already said so.
      const current = nodeAt(history.current(), id);
      if (!current) {
        return;
      }
      if (!commit) {
        if (!created) {
          // Nothing was written while the field was open, so the node already has the name it had.
          return;
        }
        if (text.trim() === '') {
          discardNewNode(edit, byKey);
          return;
        }
        // Escape cancels the naming, not the node. This field writes nothing to the map until it
        // commits — unlike the outline's, which writes as the student types — so the name they typed
        // has to be written on the way out or it goes with the keystroke that kept the node.
        commitNewName(id, text, edit);
        announce(keptNewNodeSentence(text));
        return;
      }
      // A node with no name is a blank box here and an empty line in every export, so an emptied
      // field commits nothing: the same rule the outline's editor keeps on every way out of it.
      if (text.trim() === '') {
        if (created) {
          discardNewNode(edit, byKey);
        } else if (current.text.trim() !== '') {
          // A repair the student did not ask for: they emptied the box and the old name came back.
          // Shown as well as said, or the field simply appears to have ignored them.
          notify(keptNameSentence(current.text));
        }
        return;
      }
      if (created) {
        commitNewName(id, text, edit);
      } else {
        history.apply('setText', { id, text });
      }
      if (created && andAnother) {
        addFromHandle(id, 'sibling');
      }
    };

    // An input binds its own events: the shared helper's preventDefault on mousedown would stop the
    // student placing a caret in the text they are editing.
    input.addEventListener('keydown', event => {
      // Nothing typed in here belongs to the page. Ctrl+Z has to put back the word just deleted
      // rather than take a step off the map, and Ctrl+F must not throw the student out of the node
      // they are part way through renaming — the same rule the outline's own editor follows.
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        // Enter finishes and offers the next node, the way it does on an outline row; Ctrl+Enter
        // finishes and stays. A node opened by double-click is only being renamed, so there is
        // nothing for Enter to follow it with.
        finish(true, { andAnother: !event.ctrlKey && !event.metaKey, byKey: true });
      } else if (event.key === 'Escape') {
        event.preventDefault();
        finish(false, { byKey: true });
      }
    });
    input.addEventListener('blur', () => finish(true));

    editor = {
      id,
      input,
      // The record of a node a handle has just made, so that whatever ends the edit can keep the
      // rules for a brand-new node: a blank one is thrown away rather than left as a blank box.
      edit,
      // Every way out other than Escape, including something else closing the field, goes through
      // the one function that decides what to write.
      commit: () => finish(true),
      // The node's text as of the last render. This field writes NOTHING to the map until it commits,
      // so the field differing from the map is the ordinary state of a half-typed name — what says
      // somebody else changed the node under it is the MAP moving, which is what this remembers.
      mapText: node.text,
      // Kept up to date by `render`, so that a node taken off the map still has somewhere to send
      // the keyboard.
      parentId: node.parentId,
      item: addOverlay(input, box.x, box.y, box.w, box.h),
      settle: () => {
        settled = true;
      },
    };
    input.focus();
    input.select();
  }

  function toggleCollapse(id) {
    const node = history.current().nodes[id];
    if (!node) {
      return;
    }
    const hidden = subtreeIds(history.current(), id).length - 1;
    history.apply('toggleCollapsed', { id });
    announce(
      node.collapsed ? `Expanded ${node.text}` : `Collapsed ${node.text}, ${hiddenPhrase(hidden)}`
    );
  }

  const textOf = id => {
    const node = history.current().nodes[id];
    return node ? node.text : id;
  };

  /**
   * Carry out a drop, as one undo step, and say what it did in the words every move on this page
   * uses.
   *
   * A drop that puts a node back where it already was changes nothing: `applyBatch` hands back the
   * same map and no step is recorded. It is still said, because the student aimed at a gap between
   * two siblings and let go, and a silent answer is indistinguishable from a move they cannot see.
   *
   * @param {string[]} ids - the nodes being dragged, in the order they should land.
   * @param {string} targetId
   * @param {'before'|'after'|'into'} zone
   */
  function applyDrop(ids, targetId, zone) {
    const before = history.current();
    const target = before.nodes[targetId];
    const expanded = zone === 'into' && target.collapsed ? target.text : null;
    const text = textOf(ids[0]);
    const after = history.applyBatch(dropSteps(before, ids, targetId, zone), { name: 'moveNode' });
    if (after === before) {
      announce(ids.length === 1 ? alreadyThereSentence(text) : NOTHING_MOVED);
      return;
    }
    announce(
      ids.length === 1
        ? movedSentence({ text, where: zone, targetText: target.text, expanded })
        : movedNodesSentence({
            count: ids.length,
            where: zone,
            targetText: target.text,
            expanded,
          })
    );
  }

  /** Everything a drag needs to remember between its start and its end. */
  let dragging = null;

  /**
   * How far the pointer has come from where it took hold, in layout units.
   *
   * @param {{x: number, y: number}} event - a d3-drag event, in container coordinates.
   * @returns {number}
   */
  const travelOf = event => Math.hypot(event.x - dragging.startX, event.y - dragging.startY);

  /**
   * The node a plain press landed on while it was already in a set, waiting to find out what the
   * press was.
   *
   * A plain press means "just this one", and a press on a node of a set is also how that set is
   * dragged. Collapsing the set as the button goes down would leave the drag holding one node, so
   * the collapse waits for the release: a press that never moved was a click after all. This is what
   * every file manager does with a multiple selection, for the same reason.
   */
  let pendingCollapse = null;

  /**
   * Whether a press is one the drag behaviour will take.
   *
   * The one predicate both halves of the pointer answer to, and the reason this is a predicate at
   * all: a press d3-drag takes reaches this pane through the drag's own `start`, and a press it
   * refuses reaches it through the mousedown listener. Two conditions written twice would leave a
   * press answered twice or not at all — which is precisely the defect this replaced, where a plain
   * press was handled by a mousedown listener and d3-drag's own `stopImmediatePropagation` decided
   * whether it ever ran.
   *
   * What it refuses: a modifier press, because that is "add to the selection" and never a drag, and
   * because d3-drag's default filter already refuses Ctrl (Ctrl+click is the context menu on macOS)
   * but not Shift or Command; anything but the left button; and the centre of the map, which cannot
   * move (ADR 0001) and whose drag would otherwise reach `moveNodes` and be refused as an error
   * rather than as an answer.
   *
   * @param {MouseEvent} event
   * @param {string} id - the node the press landed on.
   * @returns {boolean}
   */
  const dragsFrom = (event, id) =>
    !event.button &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    id !== history.current().rootId;

  /**
   * Show where a drop would land.
   *
   * The two cues never appear together, because they say different things: the box outline means
   * "inside this node", and the insertion line means "between these two". Neither is a colour
   * change alone (SC 1.4.1) — one is a dashed stroke, the other a line with a caret on it.
   *
   * @param {string|null} id - the node under the pointer.
   * @param {boolean} valid - whether a drop on it is allowed.
   * @param {'before'|'after'|'into'|null} [zone]
   * @param {Object|null} [box] - the target's laid-out box, for the line's position.
   */
  function markTarget(id, valid, zone = null, box = null) {
    const inside = valid && zone === 'into';
    for (const [nodeId, { group }] of nodeEntries) {
      group.classList.toggle('mm-node--dropTarget', inside && nodeId === id);
      group.classList.toggle('mm-node--invalidTarget', !valid && nodeId === id);
    }
    showInsertion(valid && (zone === 'before' || zone === 'after') ? { zone, box } : null);
  }

  /**
   * Draw the insertion mark in the gap the node would go into, or take it away.
   *
   * @param {{zone: 'before'|'after', box: Object}|null} where
   */
  function showInsertion(where) {
    if (!where) {
      hintGroup.setAttribute('display', 'none');
      return;
    }
    const { zone, box } = where;
    const y = zone === 'before' ? box.y - HINT_OFFSET : box.y + box.h + HINT_OFFSET;
    const from = box.x - 8;
    const to = box.x + box.w + 8;
    hintLine.setAttribute('d', `M ${from} ${y} L ${to} ${y}`);
    hintCaret.setAttribute(
      'd',
      `M ${from} ${y - CARET_HALF} L ${from + CARET_LENGTH} ${y} L ${from} ${y + CARET_HALF} Z`
    );
    hintGroup.removeAttribute('display');
  }

  const dragBehaviour = drag()
    // Dragging in layout coordinates means the drop test is the same arithmetic as the layout,
    // whatever the zoom happens to be.
    .container(() => viewport)
    // Stated rather than left to the default, which refuses Ctrl and the right button and nothing
    // else. A press this refuses is a press the mousedown listener answers, and the other way about.
    .filter(function takesPress(event) {
      return dragsFrom(event, this.dataset.nodeId);
    })
    .on('start', function onDragStart(event) {
      closeEditor();
      const pressed = this.dataset.nodeId;
      // The selection is decided HERE, in the gesture that took the press, rather than in a second
      // mousedown listener: this is the only place that sees the press, the movement and the release
      // as one thing, so it is the only place that can tell a click from the start of a drag.
      //
      // A press on a node that is not in the selection selects it there and then, which is what a
      // press has always done. A press on a node that IS in a set holds off: the same press is how
      // the whole set is dragged, and collapsing the set as the button went down would leave the drag
      // holding one node. The release decides — see `onDragEnd`.
      if (selection.ids().length > 1 && selection.has(pressed)) {
        pendingCollapse = pressed;
      } else {
        pendingCollapse = null;
        selection.set(pressed, { source: 'canvas' });
      }
      dragging = {
        ids: draggedWith(pressed),
        startX: event.x,
        startY: event.y,
        moved: false,
        targetId: null,
        valid: false,
        zone: null,
      };
      for (const id of dragging.ids) {
        nodeEntries.get(id)?.group.classList.add('mm-node--dragging');
      }
    })
    .on('drag', function onDrag(event) {
      if (!dragging) {
        return;
      }
      // A hand shakes, and a trackpad reports a pixel or two of travel on a plain click. d3-drag
      // has no threshold of its own, so every such click was a drag that had "moved" — it let go
      // over nothing, and the map answered "Nothing moved." to a student who had not tried to move
      // anything. Below the threshold the gesture is still a click: nothing follows the pointer and
      // nothing is said. Measured in screen pixels — `transform.k` is the zoom — so it is the same
      // movement of the hand however far in the student is.
      if (!dragging.moved && travelOf(event) * transform.k < DRAG_SLOP) {
        return;
      }
      // Every node of the set follows the pointer, so a student dragging five points can see that
      // all five are coming.
      const offset = `translate(${event.x - dragging.startX} ${event.y - dragging.startY})`;
      for (const id of dragging.ids) {
        nodeEntries.get(id)?.group.setAttribute('transform', offset);
      }
      const map = history.current();
      const moving = new Set(dragging.ids);
      const targetId = nodeAtPoint(layout.nodes, event.x, event.y, moving);
      const valid = canDropOn(map, dragging.ids, targetId);
      const box = valid ? boxOf(targetId) : null;
      const zone = box ? dropZone(box, event.y, transform.k, targetId === map.rootId) : null;
      dragging.moved = true;
      dragging.targetId = targetId;
      dragging.valid = valid;
      dragging.zone = zone;
      markTarget(targetId, valid, zone, box);
    })
    .on('end', function onDragEnd() {
      const drop = dragging;
      // An abandoned drag already put these groups back and took the cues off; d3 still delivers the
      // release, and there is nothing left for it to do.
      if (!drop) {
        return;
      }
      dragging = null;
      restDragged(drop.ids);
      const collapseTo = pendingCollapse;
      pendingCollapse = null;
      // A press that never moved was a click: the set the press held off collapsing collapses now.
      if (!drop.moved) {
        if (collapseTo) {
          selection.set(collapseTo, { source: 'canvas' });
        }
        return;
      }
      markTarget(null, false);
      if (drop.targetId && drop.valid) {
        // The map changed, so the history subscription redraws.
        applyDrop(drop.ids, drop.targetId, drop.zone);
        return;
      }
      if (drop.targetId) {
        // A refusal, and the only thing the student sees is their node springing back to where it
        // was. The reason is shown as well as said, or the map looks as though it dropped the drag.
        notify(
          drop.ids.length === 1
            ? cannotMoveIntoOwnBranchSentence(textOf(drop.ids[0]))
            : cannotMoveSetIntoOwnBranchSentence(drop.ids.length)
        );
        return;
      }
      // Let go where nothing can land: the nodes are back where the layout has them, and a student
      // who cannot see that has been told. An abandoned drag never reaches here — the student asked
      // for no change there, and no change is not worth a word.
      announce(NOTHING_MOVED);
    });

  /**
   * Which nodes a drag of one node is a drag of.
   *
   * Dragging any node of a selection drags the whole selection — the one gesture that makes
   * restructuring an essay plan worth doing with a pointer. A node that is not in the selection is
   * dragged on its own, so the student can still move something without first selecting it.
   *
   * The effective set, so a heading carries its own points rather than being moved alongside them,
   * and never the centre: it does not move, and the rest of the set goes without it.
   *
   * @param {string} id - the node the pointer took hold of.
   * @returns {string[]} the block, in the order it should land.
   */
  function draggedWith(id) {
    const chosen = selection.ids();
    if (chosen.length <= 1 || !selection.has(id)) {
      return [id];
    }
    const map = history.current();
    const block = effectiveSet(
      map,
      chosen.filter(nodeId => nodeId !== map.rootId)
    );
    return block.length === 0 ? [id] : block;
  }

  /**
   * Put the dragged groups back where the layout has them.
   *
   * Positions are the layout's to decide: without the offset each node is back where it belongs.
   *
   * @param {string[]} ids
   */
  function restDragged(ids) {
    for (const id of ids) {
      const entry = nodeEntries.get(id);
      if (entry) {
        entry.group.removeAttribute('transform');
        entry.group.classList.remove('mm-node--dragging');
      }
    }
  }

  /**
   * Give up on a drag the student never finished.
   *
   * d3-drag ends on a release it may never be given: the window can lose focus mid-gesture, and a
   * touch can be taken over by the browser's own scrolling. Escape is the third way, and the one a
   * student reaches for when they have changed their mind. All three used to leave the insertion mark
   * or the box outline painted on the map until the next drag started. Nothing is moved and nothing
   * is said: the student asked for no change, so no change is a change worth announcing.
   *
   * @returns {boolean} true when there was a drag to abandon.
   */
  function abandonDrag() {
    if (!dragging) {
      return false;
    }
    const { ids } = dragging;
    dragging = null;
    pendingCollapse = null;
    markTarget(null, false);
    restDragged(ids);
    return true;
  }

  const onAbandonKey = event => {
    if (event.key === 'Escape' && abandonDrag()) {
      event.preventDefault();
    }
  };
  document.addEventListener('keydown', onAbandonKey);
  window.addEventListener('blur', abandonDrag);
  svg.addEventListener('pointercancel', abandonDrag);

  /**
   * Let go of an edit the student had going elsewhere on the page, before this press changes what
   * the rest of the page is showing.
   *
   * The shared event helper calls `preventDefault` on mousedown, which is what wins the race against
   * a document-level listener — and also what stops the browser moving the focus. So a student who
   * was typing in the Details panel's Text field and then clicked a node kept the caret in that
   * field while the selection moved under it: their next Backspace edited the field, and the field
   * wrote its value to whichever node the panel had swung round to. Nothing said a word.
   *
   * The field is given its blur first, so it flushes against the node it was showing, and the press
   * is then the student's answer for where they are now. This pane's own inline editor is exempt: it
   * is inside the canvas, and a press in it is a caret being placed.
   *
   * Then the pane takes the keyboard itself. A blur alone left it on `document.body`, which is
   * nobody: the panel's own rescue (`releaseFields` in inspector.js) never ran, because it looks for
   * one of its fields holding the focus and by then none did, and the student's next Tab started
   * again at the top of the page instead of carrying on from the map. This element is the honest
   * home for it — they pressed the canvas — and it is not a text box, so every page-level shortcut
   * still reaches the map.
   */
  function releaseOutsideEdit() {
    const active = document.activeElement;
    if (active && !root.contains(active) && flushesOnBlur(active)) {
      active.blur();
      // Without scrolling: the pane is the size of its dock and the view is moved by the map's own
      // commands, so letting the browser bring a focused container into view would be a jump the
      // student did not ask for.
      root.focus({ preventScroll: true });
    }
  }

  // On the pane's own element, in the capture phase, because both halves of the pointer decide the
  // selection for themselves: d3's handlers stop immediate propagation once they take a press, so a
  // listener on the SVG or a node would be reached for some presses and not for others.
  const onPress = () => releaseOutsideEdit();
  root.addEventListener('mousedown', onPress, true);

  /** The dashed ring that marks a selection with a shape as well as a heavier stroke. */
  const selectionRing = box =>
    svgEl('rect', {
      class: 'mm-node__ring',
      x: box.x - 5,
      y: box.y - 5,
      width: box.w + 10,
      height: box.h + 10,
      rx: CORNER_RADIUS + 4,
    });

  /**
   * Show the selection: a class for the heavier stroke and a ring for the shape.
   *
   * The only owner of the ring. A selection change calls this and nothing else, and `render`
   * finishes with it, because redrawing the inside of a group takes the ring out with the rest.
   */
  function applySelection() {
    const primaryId = selection.get();
    // Only while there is more than one: with one node selected there is nothing to tell it apart
    // from, and the ring it has always had is the ring it keeps.
    const many = selection.ids().length > 1;
    for (const [id, { group }] of nodeEntries) {
      const isSelected = selection.has(id);
      group.classList.toggle('mm-node--selected', isSelected);
      group.classList.toggle('mm-node--primary', many && id === primaryId);
      const ring = group.querySelector('rect.mm-node__ring');
      if (isSelected && !ring) {
        group.insertBefore(selectionRing(boxOf(id)), group.firstChild);
      } else if (!isSelected && ring) {
        ring.remove();
      }
    }
  }

  /**
   * Write a node's text into its `<text>` element, wrapped to the box the layout measured.
   *
   * @param {SVGTextElement} element
   * @param {Object} node
   * @param {{x: number, y: number, w: number, h: number}} box
   */
  function drawLabel(element, node, box) {
    const lines = wrapText(node.text, WRAP_AT);
    const centreX = box.x + box.w / 2;
    element.setAttribute('x', String(centreX));
    element.setAttribute(
      'y',
      String(box.y + box.h / 2 - ((lines.length - 1) * LINE_HEIGHT) / 2 + 5)
    );
    element.replaceChildren();
    lines.forEach((line, at) => {
      const tspan = svgEl('tspan', { x: centreX, dy: at === 0 ? 0 : LINE_HEIGHT });
      // The symbol is a prefix on the first line, so it reads as part of the label rather than as
      // a second thing floating beside it.
      tspan.textContent = at === 0 && node.symbol ? `${node.symbol} ${line}` : line;
      element.appendChild(tspan);
    });
  }

  /** The collapse button's name, which carries the node's text. */
  const toggleName = (node, hidden) =>
    node.collapsed ? `Expand ${node.text}, ${hiddenPhrase(hidden)}` : `Collapse ${node.text}`;

  /**
   * Draw the inside of a node's group: box, wrapped text, source and done glyphs, collapse badge.
   *
   * The group itself is not touched — it carries the handlers and may be the thing a drag is
   * holding — and neither is the selection ring, which `applySelection` owns.
   */
  function drawGroup(group, node, box, colour, hidden) {
    const parts = [
      svgEl('rect', {
        class: 'mm-node__box',
        x: box.x,
        y: box.y,
        width: box.w,
        height: box.h,
        rx: CORNER_RADIUS,
        fill: colour.fill,
      }),
    ];

    const text = svgEl('text', {
      class: 'mm-node__text',
      fill: colour.ink,
      'text-anchor': 'middle',
    });
    drawLabel(text, node, box);
    parts.push(text);

    if (node.source && node.source.url) {
      const glyph = svgEl('text', {
        class: 'mm-node__glyph',
        x: box.x + box.w - 6,
        y: box.y + 14,
        fill: colour.ink,
        'text-anchor': 'end',
      });
      glyph.textContent = '\u{1F517}';
      parts.push(glyph);
    }

    if (node.done) {
      const tick = svgEl('text', {
        class: 'mm-node__glyph',
        x: box.x + 6,
        y: box.y + box.h - 6,
        fill: colour.ink,
      });
      tick.textContent = '✓';
      parts.push(tick);
    }

    if (node.children.length > 0) {
      const badgeX = box.x + box.w;
      const badgeY = box.y + box.h / 2;
      parts.push(svgEl('circle', { class: 'mm-node__badge', cx: badgeX, cy: badgeY, r: 11 }));
      const badgeText = svgEl('text', {
        class: 'mm-node__badgeText',
        x: badgeX,
        y: badgeY + 4,
        'text-anchor': 'middle',
      });
      badgeText.textContent = node.collapsed ? String(hidden) : '−';
      parts.push(badgeText);
    }

    group.replaceChildren(...parts);
  }

  /**
   * Keep a parent's collapse button in step with its node, making it when the node gains its first
   * child and taking it away with the last.
   *
   * A real `<button>` in the overlay, and the same one for as long as the node has children: a
   * keyboard student who presses it is still on it after the branch has shut.
   */
  function syncToggle(entry, node, box, hidden) {
    if (node.children.length === 0) {
      if (entry.toggle) {
        entry.toggle.cleanup();
        entry.toggle.item.element.remove();
        entry.toggle = null;
      }
      return;
    }

    if (!entry.toggle) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mm-canvas__toggle';
      button.dataset.toggleFor = box.id;
      entry.toggle = {
        item: { element: button, x: 0, y: 0, w: 22, h: 22 },
        cleanup: attachAccessibleHandler(
          button,
          `Mind map collapse ${box.id}`,
          () => toggleCollapse(box.id),
          { enableVisualFeedback: false }
        ),
      };
    }

    const { item } = entry.toggle;
    item.element.textContent = node.collapsed ? '+' : '−';
    item.element.setAttribute('aria-label', toggleName(node, hidden));
    item.element.setAttribute('aria-expanded', node.collapsed ? 'false' : 'true');
    item.x = box.x + box.w - 11;
    item.y = box.y + box.h / 2 - 11;
  }

  /**
   * Make a node from the handle the student pressed, and open THIS pane's editor on it.
   *
   * The node itself is made by the outline pane (ADR 0001: it is the editor), so the mark, the
   * opening of a shut branch and the announcement are its. Where the name is typed is this pane's
   * business: the student is looking at the canvas, so the field opens over the box in front of
   * them, with the same rules the outline's row editor keeps.
   *
   * @param {string} id - the node the handle belongs to.
   * @param {'child'|'sibling'} kind
   */
  function addFromHandle(id, kind) {
    closeEditor();
    const record = createNode(id, { asChild: kind === 'child' });
    if (!record) {
      return;
    }
    openEditor(record.id, { ...record, handle: kind });
  }

  /** Take the handles off, with their handlers. */
  function releaseHandles() {
    if (!handles) {
      return;
    }
    for (const { item, cleanup } of handles.buttons.values()) {
      cleanup();
      item.element.remove();
    }
    handles = null;
  }

  /**
   * Whether the handles have room where they have been put.
   *
   * Tested against what is on screen rather than against a zoom threshold, because the space beside
   * a node is not a function of the zoom alone: a leaf has an empty column beside it and a parent has
   * its first child there, and the bands its neighbours took fall differently in each layout. So a
   * map zoomed out to fit can have room beside one node and none beside the next.
   *
   * A handle over another node's box takes the press that would have selected it; a handle over a
   * collapse button takes the press that would have opened the branch. Losing an existing control to
   * a new affordance is never a trade worth making, so where either would happen the handles are not
   * drawn.
   *
   * @param {Array<{left: number, top: number, width: number, height: number}>} rects
   * @param {string|null} [ownId] - the selected node, when the handles are being placed on its own
   *   box: that one box is theirs to sit on (see `placeHandles`), and every other node's is not.
   * @returns {boolean}
   */
  function handlesFit(rects, ownId = null) {
    for (const rect of rects) {
      for (const box of layout.nodes) {
        if (box.id === ownId) {
          continue;
        }
        const drawn = {
          left: transform.applyX(box.x),
          top: transform.applyY(box.y),
          width: box.w * transform.k,
          height: box.h * transform.k,
        };
        if (overlaps(rect, drawn)) {
          return false;
        }
      }
      // Every collapse button on screen, the selected node's own included: `ownId` lets the handles
      // sit on that node's BOX, and its badge is not part of that permission.
      for (const entry of nodeEntries.values()) {
        if (entry.toggle && overlaps(rect, drawnBox(entry.toggle.item))) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Put the handles where the student can reach them: beside the node, or on the node itself.
   *
   * Beside it is the right place and the first one tried. Where that space is taken — which on an
   * ordinary map fitted to the view it usually is — the node's own box is the fallback, because a
   * handle nobody can see is the same as no handle at all. The two placements are asked of the same
   * predicate, so neither can end up over another node's box or over ANY collapse button — the
   * selected node's own badge included, which is the one control inside the fallback's own rectangle
   * — and where neither has room the handles are taken away as they always were.
   */
  function placeHandles() {
    const box = boxOf(handles.id);
    if (!box) {
      return;
    }
    const rows = [...handles.buttons.values()];
    // The badge sits on the box's right edge with a radius of 11, whichever side the branch runs to,
    // so on a left-hand branch it is behind the node and the handles beside it never meet it.
    const badge = drawnBox({ x: box.x + box.w - 11, y: box.y + box.h / 2 - 11, w: 22, h: 22 });
    const beside = besideNode(box, rows.length, badge);
    const chosen = [
      { rects: beside, ownId: null },
      { rects: insideNode(box, rows.length, badge), ownId: handles.id },
    ].find(({ rects, ownId }) => rects !== null && handlesFit(rects, ownId));

    rows.forEach(({ item }, at) => {
      // A handle with nowhere to go is still given the place beside the node: the overlay positions
      // every child it holds, hidden or not.
      item.screen = (chosen ? chosen.rects : beside)[at];
      // An affordance, not a state: nothing is announced, and every keyboard way to make a node is
      // untouched.
      item.element.hidden = !chosen;
    });
  }

  /**
   * The handles beside the node, outside it, in screen pixels.
   *
   * Beside rather than below, because a row of buttons under the box would reach into the vertical
   * band the next sibling's subtree owns. Outward, because that is where the branch runs and where
   * the layout leaves its 40 unit gap between columns — to the right on a tree and on the right-hand
   * half of a map, to the left on the other half.
   *
   * Clear of the collapse button *vertically* rather than horizontally: the button is 24 pixels
   * whatever the zoom does to the badge drawn under it, and stepping around it sideways would push
   * the handles a further twelve pixels into a gap that is only forty units wide to begin with. Going
   * over and under it costs nothing, because the space above and below a node in its own column holds
   * nothing at all — the columns either side are what the handles have to stay out of.
   *
   * @param {Object} box - the selected node's laid-out box.
   * @param {number} count - how many handles the node has.
   * @param {{left: number, top: number, width: number, height: number}} badge - its collapse target.
   * @returns {Array<{left: number, top: number, width: number, height: number}>}
   */
  function besideNode(box, count, badge) {
    const outward =
      box.side === 'left'
        ? transform.applyX(box.x) - HANDLE_GAP_PX - MIN_TARGET
        : transform.applyX(box.x + box.w) + HANDLE_GAP_PX;
    const overBadge = outward < badge.left + badge.width && badge.left < outward + MIN_TARGET;
    const stack = count * MIN_TARGET + (count - 1) * HANDLE_GAP_PX;
    const centred = transform.applyY(box.y + box.h / 2) - stack / 2;

    return Array.from({ length: count }, (_unused, at) => ({
      // Over the button and then under it, in the order Tab meets them; or simply stacked on the
      // node's middle where the button is on the other side of the box.
      left: outward,
      top: !overBadge
        ? centred + at * (MIN_TARGET + HANDLE_GAP_PX)
        : at === 0
          ? badge.top - HANDLE_GAP_PX - MIN_TARGET
          : badge.top + badge.height + HANDLE_GAP_PX + (at - 1) * (MIN_TARGET + HANDLE_GAP_PX),
      width: MIN_TARGET,
      height: MIN_TARGET,
    }));
  }

  /**
   * The handles on the node's own box, which is where they go when the column beside it is taken.
   *
   * On an ordinary map fitted to the view that column usually IS taken: a sibling with a longer name
   * reaches into it from below, and the handles were simply not drawn — so on a seventeen-node map
   * most nodes offered a pointer no way of adding to them at all. The node's own box is the one
   * rectangle that belongs to the selected node and to nothing else: a handle on it takes no press
   * from any other control, and the press it does take from the node underneath is a press that node
   * has no use for, because the handles are only ever on the node that is already selected.
   *
   * In a row from the box's leading edge and centred on the box's middle. Nothing is bent to make
   * them fit, and two things refuse the placement outright:
   *
   *   - The node has to be left something of itself. A box the row all but fills is a box the student
   *     can no longer double-click to rename or press to drag, because nearly every pixel of it
   *     answers to a button instead — and on a middling box the strip left over was thirteen pixels,
   *     which is not a target at all. So the row goes here only while at least `MIN_TARGET` of the
   *     drawn width is still the node's own (SC 2.5.8, the floor the handles themselves keep).
   *   - The collapse badge's place is not the row's to sit on, drawn there yet or not. It is inside
   *     this same rectangle, on the box's trailing edge, and a handle over it takes the press that
   *     would have opened the branch — while a leaf gains that badge the moment the child handle
   *     beside it is pressed, so the spot is kept rather than surrendered and taken back a frame
   *     later. `handlesFit` refuses every badge that IS drawn, the selected node's own included,
   *     whose box it is otherwise told to allow; this keeps the row off the place one belongs in.
   *
   * @param {Object} box - the selected node's laid-out box.
   * @param {number} count
   * @param {{left: number, top: number, width: number, height: number}} badge - where this node's
   *   collapse target is drawn, or would be drawn the moment it had a child.
   * @returns {Array<{left: number, top: number, width: number, height: number}>|null} null when the
   *   box on screen has no room the row can honestly take.
   */
  function insideNode(box, count, badge) {
    const left = transform.applyX(box.x);
    const row = count * MIN_TARGET + (count - 1) * HANDLE_GAP_PX;
    if (box.w * transform.k < row + MIN_TARGET || box.h * transform.k < MIN_TARGET) {
      return null;
    }
    const top = transform.applyY(box.y + box.h / 2) - MIN_TARGET / 2;
    const rects = Array.from({ length: count }, (_unused, at) => ({
      left: left + at * (MIN_TARGET + HANDLE_GAP_PX),
      top,
      width: MIN_TARGET,
      height: MIN_TARGET,
    }));
    return rects.some(rect => overlaps(rect, badge)) ? null : rects;
  }

  /**
   * Keep the quick-add handles on the selected node, and nowhere else.
   *
   * One node's worth at a time, because every extra pair is two more stops between a student and
   * their map. The buttons are kept for as long as the same node is selected, so a keyboard student
   * who presses one is still standing on it afterwards; nothing here moves the focus, because a
   * selection changing is not the student asking to go anywhere.
   */
  function syncHandles() {
    const map = history.current();
    const id = selection.get();
    // One node's worth or none: a handle beside every node of a set of five would be ten buttons
    // offering to add a node to whichever of them the student happened to hit.
    if (selection.ids().length > 1) {
      releaseHandles();
      return;
    }
    const box = id ? boxOf(id) : null;
    const node = box ? map.nodes[id] : null;
    if (!node) {
      releaseHandles();
      return;
    }

    if (!handles || handles.id !== id) {
      releaseHandles();
      handles = { id, buttons: new Map() };
      for (const spec of HANDLE_KINDS) {
        // The centre has no siblings (ADR 0001: one root), so that handle has nothing to do there.
        if (spec.kind === 'sibling' && id === map.rootId) {
          continue;
        }
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'mm-canvas__handle';
        button.dataset.addFor = spec.kind;
        const mark = document.createElement('span');
        mark.setAttribute('aria-hidden', 'true');
        mark.textContent = spec.glyph;
        button.appendChild(mark);
        handles.buttons.set(spec.kind, {
          // Placed in screen pixels by `placeHandles`, so it carries no layout box of its own.
          item: { element: button, screen: null },
          cleanup: attachAccessibleHandler(
            button,
            `Mind map add ${spec.kind} ${id}`,
            () => addFromHandle(id, spec.kind),
            { enableVisualFeedback: false }
          ),
        });
      }
    }

    // The name carries the node's text, which the student may be renaming while these sit there.
    for (const spec of HANDLE_KINDS) {
      const entry = handles.buttons.get(spec.kind);
      if (entry) {
        entry.item.element.setAttribute('aria-label', spec.name(nameOf(node.text)));
      }
    }
    placeHandles();
  }

  /**
   * Put the overlay's controls in the order Tab meets them, and each over the box it belongs to.
   *
   * Node order is layout order, and a node's own controls go together: its collapse toggle, then its
   * quick-add handles. The inline editor goes last, where `addOverlay` put it, so the buttons keep
   * their order and the input is the child least often out of place.
   */
  function layOutOverlay() {
    overlayItems = [];
    for (const box of layout.nodes) {
      const entry = nodeEntries.get(box.id);
      if (entry.toggle) {
        overlayItems.push(entry.toggle.item);
      }
      if (handles && handles.id === box.id) {
        for (const { item } of handles.buttons.values()) {
          overlayItems.push(item);
        }
      }
    }

    // The inline editor stays open across a re-render, over the box its node has moved to. `render`
    // has already closed it if its node no longer has a box, so there is one here.
    if (editor) {
      const box = boxOf(editor.id);
      Object.assign(editor.item, { x: box.x, y: box.y, w: box.w, h: box.h });
      overlayItems.push(editor.item);
    }

    // A control appearing or going takes the input out of order, and an element moved inside its
    // parent leaves the document for an instant and drops the keyboard with the caret. The student
    // is mid-word: put both back exactly where they were.
    const typing =
      editor && document.activeElement === editor.input
        ? {
            start: editor.input.selectionStart,
            end: editor.input.selectionEnd,
            direction: editor.input.selectionDirection,
          }
        : null;
    arrange(
      overlay,
      overlayItems.map(item => item.element)
    );
    if (typing && editor && document.activeElement !== editor.input) {
      editor.input.focus();
      editor.input.setSelectionRange(typing.start, typing.end, typing.direction);
    }

    positionOverlay();
  }

  /** Make what a node needs for as long as it is on screen: its group and the handlers on it. */
  function createEntry(id) {
    const group = svgEl('g', { class: 'mm-node' });
    group.dataset.nodeId = id;

    // dblclick has no equivalent in the shared helper, and the race the helper guards against —
    // a document mousedown listener hiding the element first — cannot apply to a node the student
    // has already single-clicked. stopPropagation keeps the gesture off the zoom behaviour.
    const onDoubleClick = event => {
      event.preventDefault();
      event.stopPropagation();
      openEditor(id);
    };

    const cleanups = [
      // Selection is bound before the drag behaviour on purpose: d3-drag stops immediate
      // propagation once it takes a mousedown, so a handler registered after it would never run.
      // This is the pointer half only: an SVG `<g>` cannot take focus, so the keyboard reaches
      // these nodes through the outline tree, which is the canonical editor (ADR 0001).
      attachInteractiveHandler(
        group,
        `Mind map node ${id}`,
        event => {
          // Only the presses the drag behaviour turned down: everything else is answered by the
          // drag's own `start`, which is the half of this that can tell a click from a drag.
          if (dragsFrom(event, id)) {
            return;
          }
          // Ctrl, Command and Shift all mean "as well as", because "everything between these two"
          // has no meaning on a picture — the outline is where a range is a range.
          if (event.ctrlKey || event.metaKey || event.shiftKey) {
            selection.toggle(id, { source: 'canvas' });
            return;
          }
          // The centre, or a button that is not the left one: there is no drag coming, so there is
          // nothing to wait for and the press means what a plain press always means.
          selection.set(id, { source: 'canvas' });
        },
        { enableVisualFeedback: false }
      ),
      () => group.removeEventListener('dblclick', onDoubleClick),
      () => select(group).on('.drag', null),
    ];
    group.addEventListener('dblclick', onDoubleClick);
    select(group).call(dragBehaviour);

    const entry = { group, cleanups, drawnFrom: null, toggle: null };
    nodeEntries.set(id, entry);
    return entry;
  }

  /** The closest ancestor folded over a node — the thing to press to see the node again. */
  const nearestFolded = (map, id) =>
    pathTo(map, id)
      .slice(0, -1)
      .reverse()
      .find(ancestorId => map.nodes[ancestorId].collapsed) || map.rootId;

  /**
   * Send the keyboard somewhere it can act, once this render has finished.
   *
   * Chrome drops the focus on `<body>` when the element holding it is removed, which is the top of
   * the page with the student's place lost. The page decides where it goes instead — the node's
   * outline row, or the map region — and it is done after the picture is up to date, so the move
   * cannot land on a row that is about to be rebuilt.
   */
  function flushRescue() {
    const id = pendingRescue;
    pendingRescue = null;
    if (id) {
      rescueFocus(id);
    }
  }

  function removeEntry(id) {
    const entry = nodeEntries.get(id);
    for (const cleanup of entry.cleanups) {
      cleanup();
    }
    if (entry.toggle) {
      entry.toggle.cleanup();
    }
    nodeEntries.delete(id);
  }

  /**
   * Bring the nodes on screen up to date with the layout: drop the ones that have gone, make the
   * ones that are new, and redraw only those whose node, box, colour or hidden count has changed.
   * Ops share structure, so a node nobody touched is the same object it was last time.
   */
  function syncNodes(map, colourFor) {
    const laidOut = new Set(layout.nodes.map(box => box.id));
    for (const id of [...nodeEntries.keys()]) {
      if (!laidOut.has(id)) {
        removeEntry(id);
      }
    }

    for (const box of layout.nodes) {
      const node = map.nodes[box.id];
      const entry = nodeEntries.get(box.id) || createEntry(box.id);
      const colour = colourFor(box.id);
      // Counted for parents only: it is what their badge and their button say.
      const hidden = node.children.length > 0 ? subtreeIds(map, box.id).length - 1 : 0;
      const drawnFrom = { node, x: box.x, y: box.y, w: box.w, h: box.h, colour, hidden };
      const stale =
        !entry.drawnFrom ||
        Object.keys(drawnFrom).some(key => entry.drawnFrom[key] !== drawnFrom[key]);

      if (stale) {
        entry.group.classList.toggle('mm-node--root', box.id === map.rootId);
        drawGroup(entry.group, node, box, colour, hidden);
        syncToggle(entry, node, box, hidden);
        entry.drawnFrom = drawnFrom;
      }
    }

    // Layout order is paint order, which is what decides the node a drop lands on; the overlay's
    // order is the order Tab meets its buttons in.
    arrange(
      nodesGroup,
      layout.nodes.map(box => nodeEntries.get(box.id).group)
    );

    syncHandles();
    layOutOverlay();
    applySelection();
  }

  function syncEdges(colourFor) {
    const next = new Map();
    for (const edge of layout.edges) {
      const path = edgeElements.get(edge.to) || svgEl('path', { class: 'mm-canvas__edge' });
      path.setAttribute('d', edge.path);
      path.setAttribute('stroke', colourFor(edge.to).fill);
      next.set(edge.to, path);
    }
    edgeElements = next;
    arrange(edgesGroup, [...next.values()]);
  }

  function syncLinks(map) {
    const placed = new Map(layout.nodes.map(node => [node.id, node]));
    const next = new Map();
    const order = [];
    for (const link of map.links) {
      const from = placed.get(link.from);
      const to = placed.get(link.to);
      // A cross-link into a collapsed subtree has nowhere to land; the inspector still lists it.
      if (!from || !to) {
        continue;
      }
      const fromX = from.x + from.w / 2;
      const fromY = from.y + from.h / 2;
      const toX = to.x + to.w / 2;
      const toY = to.y + to.h / 2;
      const midX = (fromX + toX) / 2;
      // Bowing the path clear of the straight line keeps it readable when it crosses the tree.
      const midY = (fromY + toY) / 2 - 40;

      const parts = linkElements.get(link.id) || {
        path: svgEl('path', { class: 'mm-link', 'marker-end': `url(#${arrowId})` }),
        label: svgEl('text', { class: 'mm-link__label', 'text-anchor': 'middle' }),
      };
      parts.path.setAttribute('d', `M ${fromX} ${fromY} Q ${midX} ${midY} ${toX} ${toY}`);
      order.push(parts.path);
      if (link.label) {
        parts.label.setAttribute('x', String(midX));
        parts.label.setAttribute('y', String(midY + 10));
        parts.label.textContent = link.label;
        order.push(parts.label);
      }
      next.set(link.id, parts);
    }
    linkElements = next;
    arrange(linksGroup, order);
  }

  /**
   * Bring the picture up to date with the map.
   *
   * Every element is keyed by the node (or link) it draws, kept while that node is laid out, and
   * moved rather than remade. A pane that has just been mounted has nothing to keep, so the first
   * render and every later one are the same code: there is no second picture to fall out of step.
   */
  function render(opName = null) {
    if (destroyed) {
      return;
    }
    const map = history.current();
    const stepped = opName === 'undo' || opName === 'redo';
    const mode = getLayoutMode() === 'tree' ? 'tree' : 'map';
    layout = layoutMap(map, { mode });

    // Read while the node is still there, so that when it goes there is a parent to fall back to.
    if (editor && hasNode(map, editor.id)) {
      editor.parentId = map.nodes[editor.id].parentId;
    }

    // The inline editor sits over a box that is about to move, and it stays open across the move:
    // the same input element, the typed name, the caret and the keyboard all kept, and `syncNodes`
    // puts it over the node's new box. A re-render is somebody else's change arriving — an AI
    // generation, another tab, an autosave, an undo — and taking the field away took the half-typed
    // name with it without a word. Composition is safe for the same reason: the element is never
    // rebuilt. The two things that cannot be kept are a node that has gone and a node that has just
    // gone behind a collapse, because neither has a box to sit on.
    if (editor && !hasNode(map, editor.id)) {
      const { id, input, parentId } = editor;
      // Gone from the map the pane is DRAWING is not the same as gone from the student's map: the
      // page can narrow what is drawn to one branch, and a move out of that branch is a real edit
      // rather than a deletion. The name they typed is theirs either way, so it is written first.
      const outside = hasNode(wholeMapOf(history), id);
      const typed = input.value;
      // The field is going, so the keyboard has to go somewhere: the parent the node hung from is
      // the nearest thing left that the student can act on.
      if (document.activeElement === input) {
        pendingRescue = hasNode(map, parentId) ? parentId : map.rootId;
      }
      if (!outside) {
        removeEditor();
        announce('The node you were naming was removed.');
      } else {
        const outcome = partWithEditor(map, id);
        if (outcome === 'blank') {
          announce(OUTSIDE_BRANCH_NOW);
        } else if (outcome !== 'discarded') {
          announce(keptOutsideBranchSentence(typed));
        }
        if (outcome === 'discarded' || outcome === 'restarted') {
          // That step drew the picture from the map it produced; this pass holds the older one.
          return;
        }
      }
    } else if (editor && !boxOf(editor.id)) {
      // A fold over the node is not a reason to lose the name: the field has nowhere left to sit,
      // but the words are the student's, so they are written as one undo step before it goes. An
      // emptied field still commits nothing, which is the rule every editor on this page keeps.
      const { id, input } = editor;
      const typed = input.value;
      // The branch that swallowed the node is what the student presses to see it again, so that is
      // where the keyboard goes.
      if (document.activeElement === input) {
        pendingRescue = nearestFolded(map, id);
      }
      const outcome = partWithEditor(map, id);
      if (outcome === 'blank') {
        announce('The node you were naming is hidden now.');
      } else if (outcome !== 'discarded') {
        announce(`Kept '${typed}'. It is inside a folded branch now.`);
      }
      if (outcome === 'discarded' || outcome === 'restarted') {
        // That step drew the picture from the map it produced; this pass holds the older one.
        return;
      }
    }

    // An undo or a redo can change the node under an open field. The field then FOLLOWS the map, as
    // the outline's does: the student asked to go back, so the map is right and what is in the field
    // is out of date. Only when the MAP moved — this field writes nothing until it commits, so a field
    // that merely differs from the map is an ordinary half-typed name and is left alone.
    //
    // A step that leaves a node this field had just made with no name cannot arrive here: the step
    // that made the node is the step being undone, so the node is gone and the branch above has
    // already said so.
    if (stepped && editor && hasNode(map, editor.id)) {
      const text = map.nodes[editor.id].text;
      if (text !== editor.mapText) {
        editor.input.value = text;
      }
    }
    if (editor && hasNode(map, editor.id)) {
      editor.mapText = map.nodes[editor.id].text;
    }

    // The export menu reads these to render a picture of the layout the student is looking at.
    svg.dataset.layoutMode = mode;
    svg.setAttribute(
      'aria-label',
      `Map canvas, ${nodeCount(map)} nodes; the outline pane is the keyboard editor`
    );

    // One resolver for the whole picture: `colourOf` builds a cache and climbs the branch on every
    // call, so asking it per node and per edge walked the map once per element.
    const colourFor = colourResolver(map);
    syncEdges(colourFor);
    syncLinks(map);
    syncNodes(map, colourFor);
    flushRescue();
  }

  /**
   * The zoom cluster, in the order it reads: out, the level, in, fit.
   *
   * The glyphs are decoration — `aria-hidden`, with the real name on the button — except for Fit,
   * whose whole label is a word. Fit carries the page's `assist-mm-fit` id because this is now the
   * only Fit control: the toolbar's copy of it is gone, so the page wiring and the tests have one
   * target rather than two that could drift apart.
   */
  const zoomButtons = [
    { name: 'Zoom out', glyph: '−', run: () => zoomByStep(1 / ZOOM_STEP) },
    { name: 'Zoom in', glyph: '+', run: () => zoomByStep(ZOOM_STEP) },
    {
      name: 'Fit',
      id: 'assist-mm-fit',
      run: () => {
        fitToView();
        announce('Fitted the whole map into the view');
      },
    },
  ];
  const zoomCleanups = zoomButtons.map(({ name, glyph, id, run }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mm-canvas__zoomButton';
    if (id) {
      button.id = id;
    }
    if (glyph) {
      const mark = document.createElement('span');
      mark.setAttribute('aria-hidden', 'true');
      mark.textContent = glyph;
      button.appendChild(mark);
      button.setAttribute('aria-label', name);
    } else {
      button.textContent = name;
    }
    zoomCluster.appendChild(button);
    // "Zoom out −  100%  + Fit": the level goes between the two zoom controls it belongs to.
    if (name === 'Zoom out') {
      zoomCluster.appendChild(zoomLevel);
    }
    return attachAccessibleHandler(button, `Mind map ${name}`, run);
  });

  const unsubscribeHistory = history.subscribe((_map, opName) => render(opName));

  /**
   * Keep the view honest when the canvas changes size.
   *
   * Opening a dock takes a column off this pane, and nothing was watching for it: the map stayed
   * fitted to a view it no longer had, and the node the student was working on could end up
   * behind the panel that had just opened. A drag of the outline divider is a burst of these, so
   * the move waits for the resizing to stop.
   */
  const onHostResize = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      if (!destroyed) {
        // Not an easing: a size change is not a move the student asked for.
        keepInView(false);
      }
    }, RESIZE_SETTLE_MS);
  };

  // jsdom has no ResizeObserver, and neither has a very old browser; the pane simply does not
  // re-fit there, exactly as it did not before.
  const resizeObserver =
    typeof ResizeObserver === 'function' ? new ResizeObserver(onHostResize) : null;
  if (resizeObserver) {
    resizeObserver.observe(host);
  }

  render();
  fitToView(false);
  showZoomLevel();

  // Subscribed after the first render, so the handles and the overlay order are always restated
  // against a layout that exists.
  const unsubscribeSelection = selection.subscribe((id, meta) => {
    applySelection();
    syncHandles();
    layOutOverlay();
    // A click on the canvas is already in view; only a selection made elsewhere needs a pan.
    if (id && (!meta || meta.source !== 'canvas')) {
      ensureVisible(id, true);
    }
  });

  return {
    destroy() {
      destroyed = true;
      window.clearTimeout(motionTimer);
      window.clearTimeout(resizeTimer);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      unsubscribeHistory();
      unsubscribeSelection();
      releaseHandles();
      for (const id of [...nodeEntries.keys()]) {
        removeEntry(id);
      }
      for (const cleanup of zoomCleanups) {
        cleanup();
      }
      document.removeEventListener('keydown', onAbandonKey);
      window.removeEventListener('blur', abandonDrag);
      svg.removeEventListener('pointercancel', abandonDrag);
      root.removeEventListener('mousedown', onPress, true);
      select(svg).on('.zoom', null);
      root.remove();
    },
    fitToView,
    zoomTo,

    /**
     * Bring a node into view if it is not comfortably on screen already. The page's handle for
     * "the student has just moved this node from the Details panel, keep it where they can see it".
     *
     * @param {string} id
     */
    ensureVisible: id => ensureVisible(id, true),

    /**
     * Bring the picture up to date with something the history does not carry. The layout mode is
     * a preference, not part of the map, so changing it is a change no subscription reports.
     */
    redraw: render,
    setCovered,
    getSvgElement() {
      return svg;
    },
  };
}
