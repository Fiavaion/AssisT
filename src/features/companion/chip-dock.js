/**
 * Chip dock — the single cluster AssisT's small floating chips live in.
 *
 * Each chip used to take its own slot on the bottom-left rail: the citation capture bar, the
 * "✍️ history" indicator and the "🎙️ lecture" toggle stacked up the left edge and, between them,
 * claimed about 160px of the page's bottom-left corner. Overnight release testing found the
 * consequence on a real page: `elementFromPoint` over a page's own Submit button returned
 * `assist-companion-lecture-toggle`, and a real mouse click never reached the Submit handler.
 * At 320px wide the same stack covered the label and text of the fields beside it.
 *
 * Two things fix that, and both belong in one place rather than in each chip:
 *
 *   1. One cluster instead of a column — a single row, on screen only while at least one chip in
 *      it is. One footprint to keep clear of, not three, and none at all when every chip is
 *      hidden.
 *   2. The cluster steps aside. Before it settles it looks at what is underneath: if a focusable
 *      control of the page's own would be behind it, the cluster lifts above that control, and it
 *      re-checks whenever the page scrolls or the window resizes.
 *
 * A later browser pass, the first onto sites outside a learning platform, found the half of that
 * which was missing: the page's *text* is content too, and lifting cannot escape it. On English
 * Wikipedia the bottom-left corner is the Contents column, on GitHub it is the file list, and both
 * run the full height of the viewport, so the dock sat on a contents entry and cut a folder name
 * down to a fragment. Two more things follow from that, in the same order a student
 * would want them tried:
 *
 *   3. When there is no offset on this edge to lift to, the dock goes looking. It asks the browser
 *      what is actually painted down each edge of the screen (pageContentBoxes) and hands the
 *      rectangles to findClearSpot, which walks the home edge, then the very margin, then the
 *      facing edge - the mirror image, and usually the clear one on a right-to-left page.
 *   4. The student has the last word. "Put AssisT away" (✕) leaves one small handle in the corner
 *      and is remembered for that site; the handle brings everything back. Measuring covers the
 *      pages it can; this covers the ones it cannot. It is the only way to shrink the dock: a
 *      second, collapse control used to sit beside it, and the dock re-collapsed itself on every
 *      layout it could not lift clear of, so pressing that control changed nothing on screen.
 *
 * Placement still comes from the shared rail (src/utils/corner-slots.js) so the dock cannot land
 * on the Maths tools FAB; the rail gives the base offset and this module only ever lifts from it.
 * The lift is registered with the rail (placeInRail's `adjust`) rather than listening for a layout,
 * so every layout of that corner - first paint, a chip arriving, a scroll, a resize, or another
 * control's own re-layout - ends with the dock back off the page's buttons.
 *
 * @module features/companion/chip-dock
 */

import { Z } from '../../utils/z-index.js';
import {
  CORNER,
  EDGE_INSET,
  MAX_SEARCH_RATIO,
  MIN_SLOT_SIZE,
  SLOT_GAP,
  findClearSpot,
  layoutRail,
  otherControlBoxes,
  placeInRail,
  releaseFromRail,
} from '../../utils/corner-slots.js';
import { attachAccessibleHandler } from '../../utils/event-handlers.js';

const DOCK_ID = 'assist-companion-dock';
const CHIPS_ID = 'assist-companion-dock-chips';
const STYLE_ID = 'assist-companion-dock-styles';
const AWAY_KEY = 'companionDockAwaySites';

/**
 * Fixed chip order, so a chip never swaps places with another between page loads. A chip not
 * listed here is appended after the known ones.
 */
const CHIP_ORDER = ['citation-capture-bar', 'authorship-indicator', 'lecture-toggle'];

/** Page controls the dock must not sit on top of. */
const FOCUSABLE_PAGE_CONTROL =
  'a[href], button, input:not([type="hidden"]), select, textarea, summary, ' +
  '[role="button"], [role="link"], [role="checkbox"], [role="tab"], [tabindex]';

/** How far up the viewport the dock may lift itself before it gives up and moves instead. */
const MAX_LIFT_RATIO = 0.5;

/**
 * The grid the dock probes the page with when it has to find somewhere clear. Three columns
 * across each edge band and six rows up it: enough to catch a column of links or a paragraph,
 * few enough that the whole sweep is a handful of hit tests.
 */
const PROBE_COLUMNS = 3;
const PROBE_ROWS = 6;

let dock = null;
let chipRow = null;
let awayBtn = null;
let handleBtn = null;
let awayCleanup = null;
let handleCleanup = null;
/** Watches the docked chips for one showing or hiding itself. */
let chipWatcher = null;
/** Put away by the student on this site, remembered per site. */
let away = false;
let frameRequest = null;
let viewportListening = false;

const chips = new Map();

function injectDockStyles() {
  if (document.getElementById(STYLE_ID)) {
    return;
  }
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .assist-companion-dock {
      position: fixed;
      display: flex;
      align-items: flex-end;
      gap: 8px;
      box-sizing: border-box;
      max-width: calc(100% - ${EDGE_INSET * 2}px);
      padding: 0;
      margin: 0;
      z-index: ${Z.CONTROLS};
    }
    /* The dock's own display:flex beats the UA's [hidden] rule, so a dock with no chip on screen
       would keep its put-away control in the corner without this. */
    .assist-companion-dock[hidden] {
      display: none;
    }
    .assist-companion-dock__chips {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: 6px;
      max-width: calc(100vw - ${EDGE_INSET * 2 + 56}px);
    }
    /* An author-level display:flex beats the UA's [hidden] rule, so putting AssisT away would
       leave the chips on screen without this. */
    .assist-companion-dock__chips[hidden] {
      display: none;
    }
    .assist-companion-dock__chips > * {
      min-height: 32px;
    }
    .assist-companion-dock__away,
    .assist-companion-dock__handle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 32px;
      min-height: 32px;
      padding: 4px 8px;
      border: 1px solid #4e6f78;
      border-radius: 999px;
      background: #ffffff;
      color: #33525b;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 12px;
      font-weight: 700;
      line-height: 1;
      cursor: pointer;
      box-shadow: 0 2px 10px rgba(31, 41, 51, 0.18);
    }
    /* Same trap as the chip row: an author-level display:inline-flex beats the UA's [hidden]
       rule, so a put-away dock would keep its controls on screen without this. */
    .assist-companion-dock__away[hidden],
    .assist-companion-dock__handle[hidden] {
      display: none;
    }
    .assist-companion-dock__away:focus-visible,
    .assist-companion-dock__handle:focus-visible {
      outline: 3px solid #1f6feb;
      outline-offset: 2px;
    }
    @media (forced-colors: active) {
      .assist-companion-dock__away,
      .assist-companion-dock__handle { border: 1px solid ButtonText; }
    }
  `;
  document.head.appendChild(style);
}

/** The site the student's put-away choice is remembered against. */
function siteKey() {
  const origin = location.origin;
  if (origin && origin !== 'null') {
    return origin;
  }
  return location.hostname || 'page';
}

/**
 * The edge the dock calls home. On a right-to-left page the safe corner is the mirror image -
 * the page's own navigation column is on the other side - so the search for somewhere clear
 * starts from the mirrored edge.
 */
function homeInlineEdge() {
  const root = document.documentElement;
  const declared = root.getAttribute('dir');
  const direction =
    declared || (typeof getComputedStyle === 'function' ? getComputedStyle(root).direction : '');
  return direction === 'rtl' ? 'right' : 'left';
}

/**
 * Is this docked chip something the student can see? Read from the chip's own state rather than
 * measured, because a put-away dock hides the whole row and every chip in it would measure 0x0.
 * A chip with nothing in it counts as hidden: an empty pill is a sliver in the corner, not a
 * control.
 */
function isChipShown(el) {
  if (el.hidden) {
    return false;
  }
  const style = getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') {
    return false;
  }
  return el.textContent.trim() !== '' || el.querySelector('img, svg, canvas, input') !== null;
}

function applyDockState() {
  if (!dock) {
    return;
  }
  handleBtn.hidden = !away;
  awayBtn.hidden = away;
  // Written only on a change: the row is what chipWatcher observes, and setting an attribute
  // queues a mutation even when its value is unchanged, which would call this again forever.
  if (chipRow.hidden !== away) {
    chipRow.hidden = away;
  }
  // The corner is left to the page unless at least one chip in the dock is actually there to
  // see - a put-away handle with nothing behind it would bring back nothing.
  const shown = [...chips.values()].some(isChipShown);
  if (dock.hidden === shown) {
    dock.hidden = !shown;
    // A hidden member takes no place on the rail, so the rail has to hear about the change.
    layoutRail(CORNER.BOTTOM_LEFT);
  }
}

/**
 * Where the dock should sit so it covers none of the page's own focusable controls.
 *
 * Pure so it can be tested with real rectangles: jsdom reports every box as 0x0, which is
 * exactly the case where a layout bug hides.
 *
 * @param {number} base - offset from the bottom edge the rail assigned, in px
 * @param {number} dockHeight - measured height of the dock, in px
 * @param {{left: number, right: number, top: number, bottom: number}} dockBox - horizontal
 *   extent of the dock (top/bottom are ignored; the offset decides those)
 * @param {Array<{left: number, right: number, top: number, bottom: number}>} obstructions
 * @param {number} viewportHeight
 * @returns {{offset: number, fits: boolean}} where to sit, and whether it cleared everything
 */
export function liftClearOf(base, dockHeight, dockBox, obstructions, viewportHeight) {
  const ceiling = viewportHeight * MAX_LIFT_RATIO;
  let offset = base;

  // Lifting past one control can bring the dock under another, so relax a few times rather
  // than assuming one pass settles it. Four is plenty for a corner of a page.
  for (let pass = 0; pass < 4; pass += 1) {
    const top = viewportHeight - offset - dockHeight;
    const bottom = viewportHeight - offset;
    let lifted = offset;

    for (const box of obstructions) {
      const clearsVertically = box.bottom <= top || box.top >= bottom;
      const clearsHorizontally = box.right <= dockBox.left || box.left >= dockBox.right;
      if (clearsVertically || clearsHorizontally) {
        continue;
      }
      lifted = Math.max(lifted, viewportHeight - box.top + SLOT_GAP);
    }

    if (lifted === offset) {
      return { offset, fits: true };
    }
    if (lifted > ceiling) {
      return { offset: base, fits: false };
    }
    offset = lifted;
  }

  return { offset, fits: false };
}

/** Rectangles of the page's own focusable controls that are on screen right now. */
function pageControlBoxes() {
  const boxes = [];
  const viewportHeight = window.innerHeight || 0;
  const viewportWidth = window.innerWidth || 0;

  for (const el of document.querySelectorAll(FOCUSABLE_PAGE_CONTROL)) {
    if (el.closest('[id^="assist-"], [class*="assist-"]')) {
      continue;
    }
    if (el.disabled === true || el.tabIndex < 0) {
      continue;
    }
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) {
      continue;
    }
    if (box.bottom < 0 || box.top > viewportHeight || box.right < 0 || box.left > viewportWidth) {
      continue;
    }
    boxes.push(box);
  }
  return boxes;
}

/** Is this element some of the page's own content, rather than a box that merely contains it? */
function isPageContent(el) {
  if (['IMG', 'SVG', 'CANVAS', 'VIDEO', 'PICTURE'].includes(el.tagName)) {
    return true;
  }
  if (el.matches(FOCUSABLE_PAGE_CONTROL)) {
    return true;
  }
  // Text the element holds itself. A wrapper whose text all belongs to its children is not
  // content: counting it would report a page-sized obstruction and leave nowhere to go.
  for (const node of el.childNodes) {
    if (node.nodeType === 3 && node.textContent.trim() !== '') {
      return true;
    }
  }
  return false;
}

/**
 * Rectangles of the page's own content - its text, not only its controls - in the bands of the
 * viewport the dock can sit in.
 *
 * Measured rather than guessed, because the pages a student opens cannot be predicted: the dock
 * asks the browser what is actually painted at a grid of points down each edge. It hides itself
 * for the sweep, since elementFromPoint returns the topmost element and that is the dock wherever
 * it already sits.
 *
 * @returns {Array<DOMRect>}
 */
function pageContentBoxes() {
  if (!dock || typeof document.elementFromPoint !== 'function') {
    return [];
  }
  const viewportWidth = window.innerWidth || 0;
  const viewportHeight = window.innerHeight || 0;
  if (viewportWidth === 0 || viewportHeight === 0) {
    return [];
  }

  const bandWidth = Math.min(
    viewportWidth,
    Math.max(dock.offsetWidth || 0, MIN_SLOT_SIZE) + EDGE_INSET * 2
  );
  const bands = [
    [0, bandWidth],
    [Math.max(0, viewportWidth - bandWidth), viewportWidth],
  ];
  const ceiling = viewportHeight * (1 - MAX_SEARCH_RATIO);

  const boxes = [];
  const seen = new Set();
  const wasVisible = dock.style.visibility;
  dock.style.visibility = 'hidden';
  try {
    for (const [from, to] of bands) {
      for (let column = 0; column < PROBE_COLUMNS; column += 1) {
        const x = from + ((to - from) * (column + 0.5)) / PROBE_COLUMNS;
        for (let row = 0; row < PROBE_ROWS; row += 1) {
          const y = ceiling + ((viewportHeight - ceiling) * (row + 0.5)) / PROBE_ROWS;
          const hit = document.elementFromPoint(x, y);
          if (!hit || hit === document.body || hit === document.documentElement) {
            continue;
          }
          if (seen.has(hit) || hit.closest('[id^="assist-"], [class*="assist-"]')) {
            continue;
          }
          seen.add(hit);
          if (!isPageContent(hit)) {
            continue;
          }
          const box = hit.getBoundingClientRect();
          if (box.width > 0 && box.height > 0) {
            boxes.push(box);
          }
        }
      }
    }
  } finally {
    dock.style.visibility = wasVisible;
  }
  return boxes;
}

/** Put the dock at one spot, dropping whichever edge it is no longer anchored to. */
function applySpot(inline, inlineOffset, blockOffset) {
  dock.style.left = '';
  dock.style.right = '';
  dock.style[inline] = `${inlineOffset}px`;
  dock.style.bottom = `${blockOffset}px`;
}

/**
 * Settle the dock: take the offset the rail assigned, lift clear of what is underneath, and go
 * looking along the edges of the screen when lifting alone cannot clear it.
 */
function settlePlacement() {
  if (!dock) {
    return;
  }
  const base = parseFloat(dock.style.bottom) || EDGE_INSET;
  const obstructions = [...pageControlBoxes(), ...pageContentBoxes()];
  const box = dock.getBoundingClientRect();
  const height = dock.offsetHeight || box.height || 0;
  const viewportHeight = window.innerHeight || 0;

  const result = liftClearOf(base, height, box, obstructions, viewportHeight);

  if (result.fits) {
    applySpot('left', EDGE_INSET, result.offset);
    return;
  }

  // Lifting cannot escape a navigation column that runs the full height of the viewport - the
  // shape a browser pass found on Wikipedia and on GitHub - so look along the edges instead.
  const settled = dock.getBoundingClientRect();
  const spot = findClearSpot(
    {
      width: dock.offsetWidth || settled.width || MIN_SLOT_SIZE,
      height: dock.offsetHeight || settled.height || MIN_SLOT_SIZE,
    },
    { width: window.innerWidth || 0, height: viewportHeight },
    // AssisT's own other floating controls count too: the corner the dock moves to is where the
    // text statistics badge and the companion cards live.
    [...obstructions, ...otherControlBoxes('chip-dock')],
    { homeInline: homeInlineEdge(), baseBlockOffset: base }
  );
  applySpot(spot.inline, spot.inlineOffset, spot.blockOffset);
}

function scheduleSettle() {
  if (!dock) {
    return;
  }
  if (typeof requestAnimationFrame !== 'function') {
    layoutRail(CORNER.BOTTOM_LEFT);
    return;
  }
  if (frameRequest !== null) {
    return;
  }
  frameRequest = requestAnimationFrame(() => {
    frameRequest = null;
    // Re-run the rail so the base offset is current, then settle on top of it.
    layoutRail(CORNER.BOTTOM_LEFT);
  });
}

function startViewportWatch() {
  if (viewportListening) {
    return;
  }
  viewportListening = true;
  window.addEventListener('scroll', scheduleSettle, { passive: true, capture: true });
  window.addEventListener('resize', scheduleSettle, { passive: true });
}

function stopViewportWatch() {
  if (!viewportListening) {
    return;
  }
  viewportListening = false;
  window.removeEventListener('scroll', scheduleSettle, { capture: true });
  window.removeEventListener('resize', scheduleSettle);
  if (frameRequest !== null && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(frameRequest);
  }
  frameRequest = null;
}

/** Remember, or forget, that the student put AssisT away on this site. */
async function storeAway(value) {
  try {
    const stored = await chrome.storage.local.get(AWAY_KEY);
    const sites = { ...(stored?.[AWAY_KEY] || {}) };
    if (value) {
      sites[siteKey()] = true;
    } else {
      delete sites[siteKey()];
    }
    await chrome.storage.local.set({ [AWAY_KEY]: sites });
  } catch {
    // The choice still applies for this page; remembering it is a convenience.
  }
}

async function loadRememberedState() {
  let stored;
  try {
    stored = await chrome.storage.local.get(AWAY_KEY);
  } catch {
    // No remembered choice: the dock stays as it is.
  }
  const nextAway = (stored?.[AWAY_KEY] || {})[siteKey()] === true;
  if (dock && nextAway !== away) {
    away = nextAway;
    applyDockState();
    layoutRail(CORNER.BOTTOM_LEFT);
  }
}

/** Page controls a chip may be, or hold, for focus to land on. */
const FOCUSABLE_IN_CHIP =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The first control in the first chip on screen: what takes the handle's place when the student
 * brings AssisT back. Falls back to the put-away control, which is always there with the chips.
 */
function firstChipControl() {
  for (const el of chipRow.children) {
    if (!isChipShown(el)) {
      continue;
    }
    const control = el.matches(FOCUSABLE_IN_CHIP) ? el : el.querySelector(FOCUSABLE_IN_CHIP);
    if (control) {
      return control;
    }
  }
  return awayBtn;
}

function mountDock() {
  if (dock) {
    return dock;
  }
  injectDockStyles();

  dock = document.createElement('div');
  dock.id = DOCK_ID;
  dock.className = 'assist-companion-dock';
  // A named landmark, not a plain group: everything AssisT puts in the corner of the page is
  // inside it, so a student navigating the host page by landmark can reach our controls and skip
  // past them, and none of it is content outside every landmark any more (the citation capture bar
  // was reported that way). The chips follow in the order they are read on screen, so the tab order
  // through the dock is its visual order (SC 2.4.3).
  dock.setAttribute('role', 'region');
  dock.setAttribute('aria-label', 'AssisT controls');

  // The way back from being put away. First in the dock, because when it is showing it is the
  // only thing showing, and it is what the student's Tab reaches.
  handleBtn = document.createElement('button');
  handleBtn.type = 'button';
  handleBtn.className = 'assist-companion-dock__handle';
  handleBtn.textContent = 'A';
  handleBtn.title = 'Show AssisT controls on this site';
  handleBtn.setAttribute('aria-label', 'Show AssisT controls on this site');

  chipRow = document.createElement('div');
  chipRow.id = CHIPS_ID;
  chipRow.className = 'assist-companion-dock__chips';

  // Measuring and moving covers most pages; the student having the last word covers the rest.
  awayBtn = document.createElement('button');
  awayBtn.type = 'button';
  awayBtn.className = 'assist-companion-dock__away';
  awayBtn.textContent = '✕';
  awayBtn.title = 'Put AssisT away on this site';
  awayBtn.setAttribute('aria-label', 'Put AssisT away on this site');

  dock.appendChild(handleBtn);
  dock.appendChild(chipRow);
  dock.appendChild(awayBtn);
  // Hidden until a chip that is actually on screen arrives (applyDockState decides).
  dock.hidden = true;
  applyDockState();

  awayCleanup = attachAccessibleHandler(awayBtn, 'Put AssisT away', () => {
    away = true;
    applyDockState();
    layoutRail(CORNER.BOTTOM_LEFT);
    // Focus follows the control that replaced the one the student just pressed, so a keyboard
    // student is never left with focus on a button that has gone (SC 3.2.2).
    handleBtn.focus();
    storeAway(true);
  });

  handleCleanup = attachAccessibleHandler(handleBtn, 'Show AssisT', () => {
    away = false;
    applyDockState();
    layoutRail(CORNER.BOTTOM_LEFT);
    firstChipControl().focus();
    storeAway(false);
  });

  // A chip can show or hide itself after it is docked (the writing-history indicator, a chip
  // whose feature is switched off), so the dock follows the chips rather than each chip telling
  // it. Only the dock's own state is written back, outside the watched row, so this cannot loop.
  chipWatcher = new MutationObserver(applyDockState);
  chipWatcher.observe(chipRow, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['hidden', 'style', 'class'],
  });

  document.body.appendChild(dock);
  placeInRail(dock, 'chip-dock', { adjust: settlePlacement });
  startViewportWatch();
  loadRememberedState();

  return dock;
}

/** Put the chips back in their fixed order after one has been added or removed. */
function reorderChips() {
  if (!chipRow) {
    return;
  }
  const ordered = [...chips.entries()].sort(
    (a, b) =>
      (CHIP_ORDER.indexOf(a[0]) + 1 || CHIP_ORDER.length + 1) -
      (CHIP_ORDER.indexOf(b[0]) + 1 || CHIP_ORDER.length + 1)
  );
  for (const [, el] of ordered) {
    chipRow.appendChild(el);
  }
}

/**
 * Put a chip in the dock, mounting the dock if this is the first one.
 *
 * The chip keeps its own markup, name and role — the dock only decides where it sits — so a
 * feature can be reverted by removing its call without touching anything else.
 *
 * @param {string} id - a CHIP_ORDER key; re-docking the same id replaces it
 * @param {HTMLElement} el
 * @returns {() => void} remove this chip from the dock (safe to call more than once)
 */
export function dockChip(id, el) {
  mountDock();
  const previous = chips.get(id);
  if (previous && previous !== el) {
    previous.remove();
  }
  chips.set(id, el);
  reorderChips();
  applyDockState();
  layoutRail(CORNER.BOTTOM_LEFT);
  return () => undockChip(id);
}

/**
 * Take a chip out of the dock, unmounting the dock once the last chip has gone so the corner is
 * left to the page.
 * @param {string} id
 */
export function undockChip(id) {
  const el = chips.get(id);
  if (!el) {
    return;
  }
  chips.delete(id);
  el.remove();
  if (chips.size === 0) {
    unmountDock();
    return;
  }
  applyDockState();
  layoutRail(CORNER.BOTTOM_LEFT);
}

/**
 * How far the dock reaches up from the bottom edge, in px — what a wide floating surface has to
 * clear to avoid covering the chips. 0 when no dock is on screen.
 * @returns {number}
 */
export function dockExtent() {
  if (!dock || dock.hidden) {
    return 0;
  }
  const bottom = parseFloat(dock.style.bottom) || EDGE_INSET;
  // Same floor the rail uses when an element cannot be measured, so a card can never be placed
  // closer to the dock than one target height.
  const height = Math.max(dock.offsetHeight || 0, MIN_SLOT_SIZE);
  return bottom + height + SLOT_GAP;
}

/** Remove the dock and everything in it. Idempotent. */
export function unmountDock() {
  stopViewportWatch();
  chipWatcher?.disconnect();
  chipWatcher = null;
  awayCleanup?.();
  handleCleanup?.();
  awayCleanup = null;
  handleCleanup = null;
  releaseFromRail('chip-dock');
  chips.clear();
  dock?.remove();
  document.getElementById(STYLE_ID)?.remove();
  dock = null;
  chipRow = null;
  awayBtn = null;
  handleBtn = null;
  // The next dock reads the remembered choice from storage for itself.
  away = false;
}
