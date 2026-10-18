/**
 * @jest-environment jsdom
 *
 * Corner slots — the shared placement convention for the extension's persistent floating
 * controls. The rules under test are the ones a covered control breaks in practice:
 * no two controls that can be on screen together may resolve to the same place, and a
 * control nearest its corner must sit at the corner whatever else is switched on.
 */

import {
  CORNER,
  EDGE_INSET,
  MIN_SLOT_SIZE,
  SLOT_GAP,
  SLOTS,
  findClearSpot,
  layoutRail,
  onRailChange,
  overlapArea,
  placeInRail,
  planPlacements,
  railExtent,
  releaseFromRail,
  resetRails,
  slotFor,
  slotIdsFor,
} from '../../../src/utils/corner-slots.js';

/** A rectangle in the shape getBoundingClientRect returns. */
function rect(left, top, right, bottom) {
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

/** Mount a stand-in control of a known height and give it its slot. */
function mount(slotId, height = 0) {
  const el = document.createElement('button');
  el.textContent = slotId;
  Object.defineProperty(el, 'offsetHeight', { value: height, configurable: true });
  document.body.appendChild(el);
  placeInRail(el, slotId);
  return el;
}

beforeEach(() => {
  document.body.innerHTML = '';
  resetRails();
});

describe('the registry', () => {
  test('no two controls are assigned the same corner and index', () => {
    const seen = new Map();
    for (const [id, slot] of Object.entries(SLOTS)) {
      const key = `${slot.corner}#${slot.index}`;
      expect(seen.has(key)).toBe(false);
      seen.set(key, id);
    }
  });

  test('every default-on control resolves to a place of its own', () => {
    const defaultOn = Object.entries(SLOTS).filter(([, slot]) => slot.defaultOn);
    expect(defaultOn.length).toBeGreaterThan(1);

    const places = defaultOn.map(([, slot]) => `${slot.corner}#${slot.index}`);
    expect(new Set(places).size).toBe(places.length);
  });

  test('slotFor rejects an id that is not in the registry', () => {
    expect(() => slotFor('not-a-control')).toThrow(/unknown slot/);
  });

  test('slotIdsFor lists a corner nearest-first', () => {
    const ids = slotIdsFor(CORNER.BOTTOM_LEFT);
    const indexes = ids.map(id => SLOTS[id].index);
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
    expect(ids[0]).toBe('maths-fab');
  });
});

describe('rail layout', () => {
  test('the first control sits at the corner inset', () => {
    const fab = mount('maths-fab');
    expect(fab.style.position).toBe('fixed');
    expect(fab.style.left).toBe(`${EDGE_INSET}px`);
    expect(fab.style.bottom).toBe(`${EDGE_INSET}px`);
  });

  test('every default-on control on one rail gets a distinct offset', () => {
    const bottomLeft = slotIdsFor(CORNER.BOTTOM_LEFT);
    const els = bottomLeft.map(id => mount(id));
    const offsets = els.map(el => parseFloat(el.style.bottom));

    expect(new Set(offsets).size).toBe(offsets.length);
    for (let i = 1; i < offsets.length; i++) {
      expect(offsets[i] - offsets[i - 1]).toBeGreaterThanOrEqual(MIN_SLOT_SIZE);
    }
  });

  test('a measured control pushes its neighbour clear of its full height', () => {
    mount('maths-fab', 80);
    const next = mount('chip-dock', 40);
    expect(next.style.bottom).toBe(`${EDGE_INSET + 80 + SLOT_GAP}px`);
  });

  test('the control nearest the corner keeps the corner when a neighbour mounts first', () => {
    const later = mount('chip-dock');
    const fab = mount('maths-fab');
    expect(fab.style.bottom).toBe(`${EDGE_INSET}px`);
    expect(parseFloat(later.style.bottom)).toBeGreaterThan(EDGE_INSET);
  });

  test('releasing a slot closes the gap it leaves', () => {
    mount('maths-fab');
    const dock = mount('chip-dock');
    expect(parseFloat(dock.style.bottom)).toBeGreaterThan(EDGE_INSET);

    releaseFromRail('maths-fab');
    expect(dock.style.bottom).toBe(`${EDGE_INSET}px`);
  });

  test('the release function returned by placeInRail does the same', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const release = placeInRail(el, 'maths-fab');
    const dock = mount('chip-dock');

    release();
    release(); // idempotent
    expect(dock.style.bottom).toBe(`${EDGE_INSET}px`);
  });

  test('a control placed before it reaches the page is corrected once its rail moves', () => {
    const bar = document.createElement('div');
    Object.defineProperty(bar, 'offsetHeight', { value: 90, configurable: true });
    placeInRail(bar, 'maths-fab');
    expect(bar.style.bottom).toBe(`${EDGE_INSET}px`);

    document.body.appendChild(bar);
    const dock = mount('chip-dock');
    expect(dock.style.bottom).toBe(`${EDGE_INSET + 90 + SLOT_GAP}px`);
  });

  test('a member holds its place until it is released, so a gap is never an overlap', () => {
    const fab = mount('maths-fab');
    const dock = mount('chip-dock');
    const held = dock.style.bottom;
    fab.remove();

    layoutRail(CORNER.BOTTOM_LEFT);
    expect(dock.style.bottom).toBe(held);

    releaseFromRail('maths-fab');
    expect(dock.style.bottom).toBe(`${EDGE_INSET}px`);
  });

  test('a right-hand corner is measured from its own edges', () => {
    const badge = mount('text-stats-badge');
    expect(badge.style.right).toBe(`${EDGE_INSET}px`);
    expect(badge.style.bottom).toBe(`${EDGE_INSET}px`);
    expect(badge.style.left).toBe('');
  });

  test('the companion-card lane starts above the badge, and at the corner without it', () => {
    expect(railExtent(CORNER.BOTTOM_RIGHT)).toBe(EDGE_INSET);

    mount('text-stats-badge', 70);
    expect(railExtent(CORNER.BOTTOM_RIGHT)).toBe(EDGE_INSET + 70 + SLOT_GAP);
  });

  test('a control the student cannot see takes no space on its rail', () => {
    const badge = mount('text-stats-badge', 70);
    badge.style.display = 'none';
    expect(railExtent(CORNER.BOTTOM_RIGHT)).toBe(EDGE_INSET);

    badge.style.display = 'block';
    expect(railExtent(CORNER.BOTTOM_RIGHT)).toBe(EDGE_INSET + 70 + SLOT_GAP);
  });

  test('a hidden control does not push its neighbours up the rail', () => {
    const fab = mount('maths-fab', 48);
    const dock = mount('chip-dock', 34);
    expect(dock.style.bottom).toBe(`${EDGE_INSET + 48 + SLOT_GAP}px`);

    fab.hidden = true;
    layoutRail(CORNER.BOTTOM_LEFT);
    expect(dock.style.bottom).toBe(`${EDGE_INSET}px`);
  });

  test('railExtent reports where a panel must start to clear the rail', () => {
    expect(railExtent(CORNER.BOTTOM_LEFT)).toBe(EDGE_INSET);
    mount('maths-fab', 48);
    expect(railExtent(CORNER.BOTTOM_LEFT)).toBe(EDGE_INSET + 48 + SLOT_GAP);
  });

  test('resetRails forgets every placed control', () => {
    mount('maths-fab', 48);
    resetRails();
    expect(railExtent(CORNER.BOTTOM_LEFT)).toBe(EDGE_INSET);
  });
});

/**
 * The controls' real measured boxes, from the overnight 320px screenshot where they overlapped:
 * the text statistics badge is the wide one, and the three bottom-left members are the Maths
 * tools button and the chip dock in its two states.
 */
const REAL_BOXES = {
  'maths-fab': { width: 73, height: 57 },
  'chip-dock': { width: 288, height: 57 },
  'text-stats-badge': { width: 236, height: 179 },
  'companion-card-lane': { width: 300, height: 120 },
};

const overlaps = (a, b) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

describe('placement across both rails on one edge', () => {
  const controlsFor = ids => ids.map(id => ({ id, corner: SLOTS[id].corner, ...REAL_BOXES[id] }));
  const everyDefaultControl = controlsFor(Object.keys(REAL_BOXES));

  test.each([
    ['320x640, the narrowest supported screen', 320, 640],
    ['640x400, the 200% zoom equivalent', 640, 400],
    ['1280x800', 1280, 800],
  ])('no two controls overlap at %s', (_label, width, height) => {
    const placements = planPlacements(everyDefaultControl, { width, height });
    const rects = Object.entries(placements);

    expect(rects).toHaveLength(everyDefaultControl.length);
    for (const [idA, a] of rects) {
      for (const [idB, b] of rects) {
        if (idA !== idB && overlaps(a.rect, b.rect)) {
          throw new Error(`${idA} overlaps ${idB} at ${width}x${height}`);
        }
      }
    }
  });

  test('every control stays inside the viewport it was planned for', () => {
    const placements = planPlacements(everyDefaultControl, { width: 320, height: 640 });
    for (const [id, { rect }] of Object.entries(placements)) {
      expect({ id, left: rect.left >= 0, right: rect.right <= 320, top: rect.top >= 0 }).toEqual({
        id,
        left: true,
        right: true,
        top: true,
      });
    }
  });

  test('at 1280px each rail starts at its own corner', () => {
    const placements = planPlacements(everyDefaultControl, { width: 1280, height: 800 });
    expect(placements['maths-fab'].blockOffset).toBe(EDGE_INSET);
    expect(placements['text-stats-badge'].blockOffset).toBe(EDGE_INSET);
  });

  test('at 320px the facing rails share one stack, in slot order', () => {
    const placements = planPlacements(everyDefaultControl, { width: 320, height: 640 });
    const offsets = Object.values(placements).map(p => p.blockOffset);

    expect(new Set(offsets).size).toBe(offsets.length);
    expect(placements['maths-fab'].blockOffset).toBe(EDGE_INSET);
    expect(placements['text-stats-badge'].blockOffset).toBeGreaterThan(
      placements['chip-dock'].blockOffset
    );
  });

  test('a control keeps the edge it is anchored to on a narrow screen', () => {
    const placements = planPlacements(everyDefaultControl, { width: 320, height: 640 });
    expect(placements['chip-dock'].inline).toBe('left');
    expect(placements['text-stats-badge'].inline).toBe('right');
  });

  test('the badge and the chip dock get different bands of a narrow screen in the DOM too', () => {
    const size = (el, { width, height }) => {
      Object.defineProperty(el, 'offsetWidth', { value: width, configurable: true });
      Object.defineProperty(el, 'offsetHeight', { value: height, configurable: true });
    };
    window.innerWidth = 320;
    window.innerHeight = 640;

    const dock = document.createElement('div');
    size(dock, REAL_BOXES['chip-dock']);
    document.body.appendChild(dock);
    const badge = document.createElement('div');
    size(badge, REAL_BOXES['text-stats-badge']);
    document.body.appendChild(badge);

    placeInRail(dock, 'chip-dock');
    placeInRail(badge, 'text-stats-badge');

    expect(dock.style.bottom).toBe(`${EDGE_INSET}px`);
    expect(parseFloat(badge.style.bottom)).toBeGreaterThanOrEqual(
      EDGE_INSET + REAL_BOXES['chip-dock'].height + SLOT_GAP
    );
  });

  test('railExtent clears the whole shared stack, whichever corner is asked', () => {
    window.innerWidth = 320;
    window.innerHeight = 640;
    const tall = mount('text-stats-badge', 179);
    Object.defineProperty(tall, 'offsetWidth', { value: 236, configurable: true });
    const wide = mount('chip-dock', 57);
    Object.defineProperty(wide, 'offsetWidth', { value: 288, configurable: true });

    const left = railExtent(CORNER.BOTTOM_LEFT);
    const right = railExtent(CORNER.BOTTOM_RIGHT);
    expect(left).toBe(right);
    expect(left).toBe(EDGE_INSET + 57 + SLOT_GAP + 179 + SLOT_GAP);
  });
});

describe('a broken rail listener', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  test('does not stop the next listener, and reaches the console with its corner', () => {
    const other = jest.fn();
    onRailChange(CORNER.BOTTOM_LEFT, () => {
      throw new Error('dock listener blew up');
    });
    onRailChange(CORNER.BOTTOM_LEFT, other);

    expect(() => mount('chip-dock', 44)).not.toThrow();

    expect(other).toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
    expect(console.error.mock.calls[0].join(' ')).toMatch(/bottom-left/);
  });

  test("a control's broken adjustment does not stop the others, and names the slot", () => {
    const good = jest.fn();
    const first = document.createElement('div');
    document.body.appendChild(first);
    placeInRail(first, 'chip-dock', {
      adjust: () => {
        throw new Error('adjust blew up');
      },
    });
    const second = document.createElement('div');
    document.body.appendChild(second);

    expect(() => placeInRail(second, 'maths-fab', { adjust: good })).not.toThrow();

    expect(good).toHaveBeenCalled();
    const reported = console.error.mock.calls.map(call => call.join(' '));
    expect(reported.some(line => line.includes('chip-dock'))).toBe(true);
  });
});

describe('finding somewhere clear of the page itself', () => {
  // A browser pass over real sites found AssisT's launcher pill sitting on the host page's own
  // text: on English Wikipedia it covered a Contents entry, on GitHub it cut a folder name in the
  // file list down to a fragment. The rails and the dock's lift both only ever considered the
  // page's focusable controls, and a navigation column running the full height of the viewport
  // leaves nowhere on that edge to lift to. These are the real rectangles, at 1280x720.
  const VIEWPORT = { width: 1280, height: 720 };
  const PILL = { width: 70, height: 32 };

  /** Every candidate spot must still be a spot on the screen. */
  function isOnScreen(rect) {
    return rect.left >= 0 && rect.top >= 0 && rect.right <= VIEWPORT.width && rect.bottom <= VIEWPORT.height;
  }

  test('overlapArea is the area two rectangles share, and 0 when they only touch', () => {
    expect(overlapArea(rect(0, 0, 100, 100), rect(50, 50, 150, 150))).toBe(2500);
    expect(overlapArea(rect(0, 0, 100, 100), rect(100, 0, 200, 100))).toBe(0);
  });

  test('it leaves the control at home when the corner is empty', () => {
    const spot = findClearSpot(PILL, VIEWPORT, [rect(600, 100, 700, 140)]);

    expect(spot.clear).toBe(true);
    expect(spot.inline).toBe('left');
    expect(spot.inlineOffset).toBe(EDGE_INSET);
    expect(spot.blockOffset).toBe(EDGE_INSET);
  });

  test('a bottom-left column of text drives it to the clear side of the page', () => {
    // Wikipedia: the Contents column owns the whole left side down to the bottom edge, the
    // article fills the middle, and the Appearance panel stops short of the right margin.
    const contents = rect(40, 250, 230, 720);
    const article = rect(260, 290, 1000, 720);
    const appearance = rect(1040, 255, 1200, 690);

    const spot = findClearSpot(PILL, VIEWPORT, [contents, article, appearance]);

    expect(spot.clear).toBe(true);
    expect(spot.overlap).toBe(0);
    for (const box of [contents, article, appearance]) {
      expect(overlapArea(spot.rect, box)).toBe(0);
    }
    expect(isOnScreen(spot.rect)).toBe(true);
  });

  test('on a right-to-left page the corner it moves to is the mirror image', () => {
    // The same page laid out right-to-left: the navigation column is on the right, so the edge
    // that is safe is the opposite one, and the search has to start from the mirrored home edge.
    const contents = rect(1050, 250, 1240, 720);
    const article = rect(280, 290, 1020, 720);
    const appearance = rect(80, 255, 240, 690);

    const spot = findClearSpot(PILL, VIEWPORT, [contents, article, appearance], {
      homeInline: 'right',
    });

    expect(spot.clear).toBe(true);
    expect(spot.inline).toBe('left');
    for (const box of [contents, article, appearance]) {
      expect(overlapArea(spot.rect, box)).toBe(0);
    }
  });

  test('it hugs the margin rather than sitting an inset inside the text', () => {
    // A column that starts 72px in: there is room for the pill in the margin beside it, and
    // nowhere else on that edge, however far up the search climbs.
    const column = rect(72, 0, 400, 720);

    const spot = findClearSpot(PILL, VIEWPORT, [column]);

    expect(spot.clear).toBe(true);
    expect(spot.inline).toBe('left');
    expect(spot.inlineOffset).toBe(0);
  });

  test("it will not climb past halfway up what the student is reading", () => {
    const column = rect(0, 0, 400, 720);

    const spot = findClearSpot(PILL, VIEWPORT, [column]);

    expect(spot.rect.top).toBeGreaterThanOrEqual(VIEWPORT.height / 2 - PILL.height);
  });

  test('every corner busy: it reports that, and still names the least covered spot on screen', () => {
    // Some pages genuinely have no free corner. The caller shrinks to its smallest control and
    // leaves the student to put it away; the placement still has to be a real place.
    const wholePage = rect(0, 0, 1280, 720);
    const extraLeft = rect(0, 400, 300, 720);

    const spot = findClearSpot(PILL, VIEWPORT, [wholePage, extraLeft]);

    expect(spot.clear).toBe(false);
    expect(spot.overlap).toBeGreaterThan(0);
    expect(isOnScreen(spot.rect)).toBe(true);
    // The doubly covered left corner is worse than the singly covered right one, so it moves.
    expect(spot.inline).toBe('right');
  });

  test("AssisT's own other floating controls are obstructions too, so it cannot swap one cover for another", () => {
    const contents = rect(0, 0, 400, 720);
    // The text statistics badge, bottom-right, where the search would otherwise send the pill.
    const badge = rect(1024, 656, 1264, 704);

    const spot = findClearSpot(PILL, VIEWPORT, [contents, badge]);

    expect(overlapArea(spot.rect, badge)).toBe(0);
  });
});
