/**
 * @fileoverview Corner slots - the one place that decides where AssisT's persistent
 * floating controls sit on a host page.
 *
 * Every feature used to pick its own `position: fixed` corner and inset, so controls from
 * unrelated features landed on the same few pixels: the Maths tools FAB, the citation
 * capture bar, the lecture companion toggle and the Authorship Shield indicator all claimed
 * the bottom-left corner at 16-20px. Whichever mounted last swallowed the others' pointer
 * events, so a student could see a control and never be able to press it - WCAG 2.2
 * SC 2.5.8 Target Size in practice, and invisible to unit tests because each control is
 * perfectly correct on its own.
 *
 * The convention: each corner is a rail. A control declares a slot (corner + index) in
 * SLOTS below, then calls placeInRail() once it is in the DOM. A control that has to fine-tune
 * the offset it is given - the chip dock steps up over the page's own buttons - passes an
 * `adjust` function there, and the rail runs it as the last step of every layout. The rail stacks its members
 * in index order, measuring each one, so the control nearest the corner always sits at the
 * corner however many of its neighbours are switched on. Index order is fixed, so a control
 * never swaps places with another between page loads.
 *
 * Small chips share one slot instead of taking three: the citation capture bar, the writing-history
 * indicator and the lecture toggle sit inside the chip dock (see
 * src/features/companion/chip-dock.js), which takes the slot on their behalf and can be collapsed
 * to a single control. Three chips stacked up the left edge covered the page's own Submit button.
 *
 * Wide, variable-height surfaces get a lane instead of a slot: they own the rest of their
 * corner and stack themselves inside it (the companion cards, see restackFloatingCards),
 * starting above whatever slots sit below them. A lane still takes a slot entry so nothing
 * else can be assigned its place by accident.
 *
 * No rail runs from the top-right corner. That is where the pomodoro timer - which the
 * student positions and drags for themselves - now defaults, and where the transient
 * feature panels appear; keep it free of persistent controls.
 *
 * Z-order stays with src/utils/z-index.js; this module decides position only.
 */

/** The four corners a rail can run from. */
export const CORNER = Object.freeze({
  TOP_LEFT: 'top-left',
  TOP_RIGHT: 'top-right',
  BOTTOM_LEFT: 'bottom-left',
  BOTTOM_RIGHT: 'bottom-right',
});

/**
 * Distance from the viewport edges to the first slot, in px. Wide enough to clear a host
 * page's own scrollbars (~15px in Chrome), so a rail never sits on top of one.
 */
export const EDGE_INSET = 16;

/** Clear space between two neighbouring slots, in px. */
export const SLOT_GAP = 12;

/**
 * Height a slot is assumed to take when the element cannot be measured (jsdom, or an
 * element laid out after placement). 44px is the target size the extension guarantees, so
 * the fallback can never stack two controls closer than a full target.
 */
export const MIN_SLOT_SIZE = 44;

/**
 * How far up the viewport findClearSpot will climb looking for somewhere clear. Past half the
 * screen a floating control has stopped being furniture at the edge of the page and become
 * something in the middle of what the student is reading.
 */
export const MAX_SEARCH_RATIO = 0.5;

/**
 * Every persistent floating control AssisT injects into a host page.
 *
 * `defaultOn` means "on screen without the student turning anything on": always-on, or on
 * by default on an LMS page. Those are the ones that must never share a place.
 *
 * @type {Readonly<Record<string, {corner: string, index: number, defaultOn: boolean,
 *   lane?: boolean, label: string}>>}
 */
export const SLOTS = Object.freeze({
  'maths-fab': {
    corner: CORNER.BOTTOM_LEFT,
    index: 0,
    defaultOn: false,
    label: 'Maths tools button',
  },
  'chip-dock': {
    corner: CORNER.BOTTOM_LEFT,
    index: 1,
    defaultOn: true,
    label: 'AssisT chip dock (citation capture, writing history, lecture)',
  },
  'text-stats-badge': {
    corner: CORNER.BOTTOM_RIGHT,
    index: 0,
    defaultOn: true,
    label: 'Text statistics badge',
  },
  'grammar-legend': {
    corner: CORNER.BOTTOM_RIGHT,
    index: 1,
    defaultOn: false,
    label: 'Grammar colours key (dyslexia mode)',
  },
  'companion-card-lane': {
    corner: CORNER.BOTTOM_RIGHT,
    index: 2,
    defaultOn: true,
    lane: true,
    label: 'Companion cards',
  },
});

/** Which viewport edges a corner is measured from. */
function edgesOf(corner) {
  return {
    block: corner === CORNER.TOP_LEFT || corner === CORNER.TOP_RIGHT ? 'top' : 'bottom',
    inline: corner === CORNER.TOP_LEFT || corner === CORNER.BOTTOM_LEFT ? 'left' : 'right',
  };
}

/**
 * @param {string} slotId
 * @returns {{corner: string, index: number, defaultOn: boolean, lane?: boolean, label: string}}
 */
export function slotFor(slotId) {
  const slot = SLOTS[slotId];
  if (!slot) {
    throw new Error(`corner-slots: unknown slot "${slotId}" - add it to SLOTS first`);
  }
  return slot;
}

/** Slot ids on one corner, nearest the corner first. */
export function slotIdsFor(corner) {
  return Object.keys(SLOTS)
    .filter(id => SLOTS[id].corner === corner)
    .sort((a, b) => SLOTS[a].index - SLOTS[b].index);
}

/** Live rail members: slot id -> element. */
const members = new Map();

/** slot id -> a control's own last word on the offset the rail gave it (see placeInRail). */
const adjusters = new Map();

/** Guards against an adjuster that re-enters the layout it is part of. */
let adjusting = false;

/** corner -> listeners told whenever that rail is laid out again. */
const listeners = new Map();

/** Guards against a listener that re-enters the layout it was told about. */
let notifying = false;

/**
 * Be told when a rail is laid out again, so a surface that stacks itself above the rail can
 * follow it - the companion cards do this when the text statistics badge below them appears
 * or goes away.
 *
 * @param {string} corner - a CORNER value
 * @param {() => void} fn
 * @returns {() => void} unsubscribe
 */
export function onRailChange(corner, fn) {
  if (!listeners.has(corner)) {
    listeners.set(corner, new Set());
  }
  listeners.get(corner).add(fn);
  return () => listeners.get(corner)?.delete(fn);
}

function notify(corner) {
  const fns = listeners.get(corner);
  if (notifying || !fns || fns.size === 0) {
    return;
  }
  notifying = true;
  try {
    for (const fn of fns) {
      try {
        fn();
      } catch (error) {
        // A listener must never break the layout of the controls themselves — but a rail that
        // silently stops following its corner degrades the layout for the rest of the session, so
        // the failure has to be findable.
        console.error(`corner-slots: a ${corner} rail listener failed:`, error);
      }
    }
  } finally {
    notifying = false;
  }
}

function measure(el) {
  return Math.max(el.offsetHeight || 0, MIN_SLOT_SIZE);
}

function measureWidth(el) {
  return Math.max(el.offsetWidth || 0, MIN_SLOT_SIZE);
}

/** A control the student cannot see takes no space on its rail. */
function isHidden(el) {
  return el.hidden === true || el.style.display === 'none';
}

/** The corner facing this one across the same edge of the screen. */
function facingCorner(corner) {
  switch (corner) {
    case CORNER.BOTTOM_LEFT:
      return CORNER.BOTTOM_RIGHT;
    case CORNER.BOTTOM_RIGHT:
      return CORNER.BOTTOM_LEFT;
    case CORNER.TOP_LEFT:
      return CORNER.TOP_RIGHT;
    default:
      return CORNER.TOP_LEFT;
  }
}

/**
 * Where every control on one edge of the screen goes, as pure arithmetic over measured boxes.
 *
 * Two rails on the same edge are laid out together because keeping each corner clear of itself
 * is not enough. A rail knows nothing about the rail facing it, and on a narrow screen the two
 * meet in the middle: overnight release testing at 320px found the text statistics badge (236px
 * wide, bottom-right) sitting on top of the chip dock and the Maths tools button in the
 * bottom-left, hiding the badge's own figures and half of its Speed Read button. Both rails were
 * individually correct.
 *
 * So when the widest control on each side cannot fit beside the other, the two rails share one
 * vertical stack: each control keeps the edge it is anchored to, and no two are ever given the
 * same band of the screen. jsdom reports every box as 0x0, which is exactly where a bug like
 * that hides, so this takes measurements as arguments and returns rectangles a test can check
 * for overlap.
 *
 * @param {Array<{id: string, corner: string, width: number, height: number}>} controls - the
 *   visible controls, in any order; each id must be in SLOTS
 * @param {{width: number, height: number}} viewport
 * @returns {Object<string, {inline: string, inlineOffset: number, block: string,
 *   blockOffset: number, rect: {left: number, top: number, right: number, bottom: number,
 *   width: number, height: number}}>} placement per control id
 */
export function planPlacements(controls, viewport) {
  const byId = new Map(controls.map(control => [control.id, control]));
  const placements = {};

  for (const block of ['bottom', 'top']) {
    // Left first, so a shared stack always fills from the same side.
    const corners = [
      CORNER.BOTTOM_LEFT,
      CORNER.BOTTOM_RIGHT,
      CORNER.TOP_LEFT,
      CORNER.TOP_RIGHT,
    ].filter(corner => edgesOf(corner).block === block);

    const onCorner = corner =>
      slotIdsFor(corner)
        .map(id => byId.get(id))
        .filter(Boolean);

    const widest = corner =>
      onCorner(corner).reduce((max, control) => Math.max(max, control.width), 0);

    const [near, far] = corners;
    const sideBySide =
      widest(near) === 0 ||
      widest(far) === 0 ||
      widest(near) + widest(far) + EDGE_INSET * 2 + SLOT_GAP <= viewport.width;

    let shared = EDGE_INSET;
    for (const corner of corners) {
      const inline = edgesOf(corner).inline;
      let offset = sideBySide ? EDGE_INSET : shared;

      for (const control of onCorner(corner)) {
        const left =
          inline === 'left' ? EDGE_INSET : Math.max(0, viewport.width - EDGE_INSET - control.width);
        const top =
          block === 'top' ? offset : Math.max(0, viewport.height - offset - control.height);
        placements[control.id] = {
          inline,
          inlineOffset: EDGE_INSET,
          block,
          blockOffset: offset,
          rect: {
            left,
            top,
            right: left + control.width,
            bottom: top + control.height,
            width: control.width,
            height: control.height,
          },
        };
        offset += control.height + SLOT_GAP;
      }

      if (!sideBySide) {
        shared = offset;
      }
    }
  }

  return placements;
}

/**
 * Position every member of one rail, nearest the corner first, and the rail facing it when the
 * two have to share a stack (see planPlacements).
 *
 * A member holds its place until it is released, even if its element has left the page: a
 * feature that forgets to release leaves a gap, never an overlap, and the map is keyed by
 * slot id so it cannot grow past the registry. Heights are re-measured on every layout, so
 * a control placed before it was in the document is corrected as soon as its rail moves.
 *
 * @param {string} corner - a CORNER value
 * @returns {number} the offset, in px, where the next slot on this rail would start
 */
export function layoutRail(corner) {
  const controls = [];
  for (const [id, el] of members) {
    if (!el || isHidden(el)) {
      continue;
    }
    controls.push({
      id,
      corner: SLOTS[id].corner,
      width: measureWidth(el),
      height: measure(el),
    });
  }

  const viewport = {
    width: (typeof window !== 'undefined' && window.innerWidth) || 0,
    height: (typeof window !== 'undefined' && window.innerHeight) || 0,
  };
  const placements = planPlacements(controls, viewport);

  for (const control of controls) {
    const placement = placements[control.id];
    const el = members.get(control.id);
    el.style.position = 'fixed';
    el.style[placement.inline] = `${placement.inlineOffset}px`;
    el.style[placement.block] = `${placement.blockOffset}px`;
  }

  // A control's own adjustment is part of the layout, not a reaction to it. It used to listen on
  // onRailChange, and that lost the chip dock's step over the page's Submit button on a real page:
  // a listener that lays the rails out again (the companion cards measure both) re-based the dock,
  // and the nested notification that would have lifted it again was dropped as re-entrant.
  if (!adjusting) {
    adjusting = true;
    try {
      for (const control of controls) {
        try {
          adjusters.get(control.id)?.();
        } catch (error) {
          // A control's own adjustment must never break the layout of the others, and must not
          // leave that control sitting on a neighbour with no trace of why.
          console.error(`corner-slots: the "${control.id}" adjustment failed:`, error);
        }
      }
    } finally {
      adjusting = false;
    }
  }

  // The extent of a shared stack is where its last control ends, whichever corner that control
  // belongs to: a panel on either side of a narrow screen has to clear the whole stack.
  const shared = sharesStack(placements, corner, facingCorner(corner));
  let offset = EDGE_INSET;
  for (const control of controls) {
    if (control.corner !== corner && !(shared && control.corner === facingCorner(corner))) {
      continue;
    }
    // Where the control actually sits: an adjusted control (the chip dock) has moved since it was
    // offered its place, and a panel above it has to clear where it ended up.
    const applied = parseFloat(members.get(control.id).style[placements[control.id].block]);
    const blockOffset = Number.isFinite(applied) ? applied : placements[control.id].blockOffset;
    offset = Math.max(offset, blockOffset + control.height + SLOT_GAP);
  }

  // One layout moves every control on the screen, not only this corner's, so everyone watching a
  // rail that has just been re-placed hears about it - a control that lifts itself off the offset
  // it was given (the chip dock steps over the page's own buttons) has to lift again afterwards.
  const touched = new Set(controls.map(control => control.corner));
  touched.add(corner);
  for (const moved of touched) {
    notify(moved);
  }
  return offset;
}

/** True when two corners were laid out as one stack rather than side by side. */
function sharesStack(placements, corner, other) {
  if (corner === other) {
    return true;
  }
  if (other !== facingCorner(corner)) {
    return false;
  }
  const mine = slotIdsFor(corner).filter(id => placements[id]);
  const theirs = slotIdsFor(other).filter(id => placements[id]);
  if (mine.length === 0 || theirs.length === 0) {
    return false;
  }
  // Side by side, both rails start at the edge inset; sharing, only the first one does.
  return !(
    placements[mine[0]].blockOffset === EDGE_INSET &&
    placements[theirs[0]].blockOffset === EDGE_INSET
  );
}

/**
 * Give an element its declared slot and lay its rail out again.
 *
 * @param {HTMLElement} el - the control
 * @param {string} slotId - a key of SLOTS
 * @param {{adjust?: () => void}} [options] - `adjust` is the control's own last word on where it
 *   sits: the rail calls it at the end of every layout, after the element has been given its
 *   offset, so the control can move itself from there (the chip dock lifts clear of the page's
 *   own buttons). Placing the same slot again without one drops any previous adjustment.
 * @returns {() => void} a release function, safe to call more than once
 */
export function placeInRail(el, slotId, options = {}) {
  const slot = slotFor(slotId);
  members.set(slotId, el);
  if (typeof options.adjust === 'function') {
    adjusters.set(slotId, options.adjust);
  } else {
    adjusters.delete(slotId);
  }
  layoutRail(slot.corner);
  return () => releaseFromRail(slotId);
}

/**
 * Drop a control out of its rail and close the gap it leaves.
 * @param {string} slotId - a key of SLOTS
 */
export function releaseFromRail(slotId) {
  const slot = slotFor(slotId);
  adjusters.delete(slotId);
  if (members.delete(slotId)) {
    layoutRail(slot.corner);
  }
}

/**
 * How far a rail currently reaches from its corner, in px - i.e. the offset a panel must
 * clear to sit above every control on that rail. Lays the rail out on the way, so the
 * answer reflects the controls' measured heights right now.
 *
 * @param {string} corner - a CORNER value
 * @returns {number}
 */
export function railExtent(corner) {
  return layoutRail(corner);
}

/**
 * Area, in px², where two rectangles overlap. 0 when they do not touch.
 *
 * @param {{left: number, top: number, right: number, bottom: number}} a
 * @param {{left: number, top: number, right: number, bottom: number}} b
 * @returns {number}
 */
export function overlapArea(a, b) {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return width > 0 && height > 0 ? width * height : 0;
}

/**
 * Find somewhere along the screen edges for one control to sit where it covers none of the
 * rectangles it is given.
 *
 * The rails keep AssisT's controls off each other, and the chip dock lifts itself off the page's
 * own buttons, but neither considers the page's *text*. A browser pass over real sites found the
 * consequence: on English Wikipedia the bottom-left corner is the contents column, so every offset
 * the dock could lift to was still on top of a contents entry; on GitHub the corner is the file
 * list and the dock cut a folder name down to a fragment. A column of content running the full
 * height of the viewport is a common layout, and no amount of lifting escapes it.
 *
 * So this searches instead of assuming: it walks candidate spots in order of preference - the
 * control's home edge at its usual inset first, climbing the edge; then hugging the very edge, so
 * it sits in the page's margin rather than its text; then the facing edge, which on a
 * right-to-left page is the mirror image and usually the clear one - and takes the first that
 * covers nothing. When every candidate is covered, because some pages have no free corner at all,
 * it returns the least-covered one so the caller can put the smallest possible control there and
 * leave the student to put it away.
 *
 * Pure, and takes measured rectangles, because jsdom reports every box as 0x0 and this is exactly
 * the kind of arithmetic that hides a bug behind a green test suite.
 *
 * @param {{width: number, height: number}} size - measured size of the control
 * @param {{width: number, height: number}} viewport
 * @param {Array<{left: number, top: number, right: number, bottom: number}>} obstructions -
 *   everything the control must not cover: the page's controls, the page's text, and AssisT's
 *   own other floating controls
 * @param {{block?: string, homeInline?: string, baseBlockOffset?: number,
 *   maxBlockRatio?: number}} [options] - `homeInline` is the edge the control is anchored to
 *   ('left' or 'right'); mirror it for a right-to-left page. `maxBlockRatio` caps how far up the
 *   viewport the search will climb.
 * @returns {{inline: string, inlineOffset: number, block: string, blockOffset: number,
 *   rect: {left: number, top: number, right: number, bottom: number, width: number,
 *   height: number}, overlap: number, clear: boolean}}
 */
export function findClearSpot(size, viewport, obstructions, options = {}) {
  const {
    block = 'bottom',
    homeInline = 'left',
    baseBlockOffset = EDGE_INSET,
    maxBlockRatio = MAX_SEARCH_RATIO,
  } = options;

  const step = Math.max(size.height, MIN_SLOT_SIZE) + SLOT_GAP;
  const ceiling = viewport.height * maxBlockRatio - size.height;
  const blockOffsets = [];
  for (let offset = baseBlockOffset; offset <= ceiling; offset += step) {
    blockOffsets.push(offset);
  }
  if (blockOffsets.length === 0) {
    blockOffsets.push(baseBlockOffset);
  }

  const inlineEdges = homeInline === 'right' ? ['right', 'left'] : ['left', 'right'];
  let best = null;

  for (const inline of inlineEdges) {
    // The usual inset first, then hugging the very edge: a control in the page's margin covers
    // less of it than one a full inset inside the text.
    for (const inlineOffset of [EDGE_INSET, 0]) {
      for (const blockOffset of blockOffsets) {
        const left =
          inline === 'left'
            ? inlineOffset
            : Math.max(0, viewport.width - inlineOffset - size.width);
        const top =
          block === 'top' ? blockOffset : Math.max(0, viewport.height - blockOffset - size.height);
        const rect = {
          left,
          top,
          right: left + size.width,
          bottom: top + size.height,
          width: size.width,
          height: size.height,
        };
        let overlap = 0;
        for (const box of obstructions) {
          overlap += overlapArea(rect, box);
        }
        const spot = { inline, inlineOffset, block, blockOffset, rect, overlap, clear: false };
        if (overlap === 0) {
          spot.clear = true;
          return spot;
        }
        if (!best || overlap < best.overlap) {
          best = spot;
        }
      }
    }
  }

  return best;
}

/**
 * Measured rectangles of every control currently on a rail except one.
 *
 * A control that has to leave its corner (the chip dock, when the page's own content owns that
 * corner) needs to know where the rest of AssisT's furniture is, or it swaps covering the page
 * for covering the text statistics badge. Hidden controls take no space, exactly as they take
 * none on their rail.
 *
 * @param {string} [exceptSlotId] - the control asking; left out of the answer
 * @returns {Array<DOMRect>}
 */
export function otherControlBoxes(exceptSlotId) {
  const boxes = [];
  for (const [id, el] of members) {
    if (id === exceptSlotId || !el || isHidden(el)) {
      continue;
    }
    const box = el.getBoundingClientRect?.();
    if (box && box.width > 0 && box.height > 0) {
      boxes.push(box);
    }
  }
  return boxes;
}

/** Test seam: forget every placed control and everyone listening for a layout. */
export function resetRails() {
  members.clear();
  adjusters.clear();
  listeners.clear();
}
