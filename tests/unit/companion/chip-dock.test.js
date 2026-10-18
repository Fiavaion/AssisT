/**
 * @jest-environment jsdom
 *
 * The chip dock — one cluster for AssisT's small floating chips.
 *
 * What is under test is what real Chrome caught and jsdom could not: the chips covered the page's
 * own Submit button, so a real click never reached it. The placement maths is therefore exercised
 * as a pure function with real rectangles (jsdom reports every box as 0x0), and the dock's own
 * behaviour — one cluster, fixed order, on screen only while a chip in it is, a keyboard-operable
 * put-away that is remembered per site — is exercised against the DOM.
 *
 * EVENT DISPATCH NOTE: the put-away control and the handle use attachAccessibleHandler(), which
 * wires mousedown plus Enter/Space. Trigger them with a mousedown or a keydown, never a click.
 */

import {
  dockChip,
  undockChip,
  dockExtent,
  liftClearOf,
  unmountDock,
} from '../../../src/features/companion/chip-dock.js';
import {
  CORNER,
  EDGE_INSET,
  SLOT_GAP,
  layoutRail,
  onRailChange,
  overlapArea,
  placeInRail,
  railExtent,
  resetRails,
} from '../../../src/utils/corner-slots.js';

const DOCK_ID = 'assist-companion-dock';
const CHIPS = '#assist-companion-dock-chips';
const AWAY = '.assist-companion-dock__away';
const HANDLE = '.assist-companion-dock__handle';

function chip(id, text) {
  const el = document.createElement('button');
  el.type = 'button';
  el.id = `test-${id}`;
  el.textContent = text;
  return el;
}

function box(left, top, right, bottom) {
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  resetRails();
  chrome.storage.local.get.mockResolvedValue({});
  chrome.storage.local.set.mockResolvedValue(undefined);
});

afterEach(() => unmountDock());

describe('the cluster', () => {
  test('the first chip mounts the dock, and every chip lands inside it', () => {
    const cite = chip('cite', 'Cite this source');
    dockChip('citation-capture-bar', cite);

    const dock = document.getElementById(DOCK_ID);
    expect(dock).not.toBeNull();
    expect(dock.getAttribute('role')).toBe('region');
    expect(dock.getAttribute('aria-label')).toBe('AssisT controls');
    expect(dock.querySelector(CHIPS).contains(cite)).toBe(true);
    expect(document.querySelectorAll(`#${DOCK_ID}`)).toHaveLength(1);
  });

  test('chips keep a fixed order however they arrive', () => {
    const lecture = chip('lecture', '🎙️ lecture');
    const cite = chip('cite', 'Cite this source');
    dockChip('lecture-toggle', lecture);
    dockChip('citation-capture-bar', cite);

    const order = [...document.querySelectorAll(`${CHIPS} > *`)];
    expect(order).toEqual([cite, lecture]);
  });

  test('the tab order through the dock is the order the dock is read in', () => {
    // On screen the dock is one row: the chips, then the put-away control. Tab follows the document,
    // so the document order has to be that order - the chips used to be three separate elements
    // mounted in whatever order their features happened to start in, and Tab visited them in that
    // order rather than the one on screen (SC 2.4.3).
    const lecture = chip('lecture', '🎙️ lecture');
    const history = chip('history', '✍️ history');
    const cite = chip('cite', 'Cite this source');
    dockChip('lecture-toggle', lecture);
    dockChip('authorship-indicator', history);
    dockChip('citation-capture-bar', cite);

    const focusable = [
      ...document.getElementById(DOCK_ID).querySelectorAll('button:not([hidden])'),
    ];
    expect(focusable).toEqual([
      cite,
      history,
      lecture,
      document.querySelector(AWAY),
    ]);
  });

  test('the dock goes away with the last chip, leaving the corner to the page', () => {
    dockChip('lecture-toggle', chip('lecture', '🎙️ lecture'));
    dockChip('citation-capture-bar', chip('cite', 'Cite'));

    undockChip('lecture-toggle');
    expect(document.getElementById(DOCK_ID)).not.toBeNull();

    undockChip('citation-capture-bar');
    expect(document.getElementById(DOCK_ID)).toBeNull();
  });

  test('re-docking a chip id replaces the old element rather than leaving it behind', () => {
    const first = chip('lecture', '🎙️ lecture');
    const second = chip('lecture-2', '🎙️ lecture');
    dockChip('lecture-toggle', first);
    dockChip('lecture-toggle', second);

    expect([...document.querySelectorAll(`${CHIPS} > *`)]).toEqual([second]);
    expect(first.isConnected).toBe(false);
  });

  test('re-docking the same element keeps it in the dock', () => {
    const lecture = chip('lecture', '🎙️ lecture');
    dockChip('lecture-toggle', lecture);
    dockChip('lecture-toggle', lecture);

    expect([...document.querySelectorAll(`${CHIPS} > *`)]).toEqual([lecture]);
  });

  test('there is no collapse control: put away and the handle are the only ways to shrink it', () => {
    // Two controls for shrinking one corner confused the student who reported it, and the
    // collapse one looked broken: pressing it changed nothing on screen.
    dockChip('lecture-toggle', chip('lecture', '🎙️ lecture'));
    const dock = document.getElementById(DOCK_ID);

    expect(dock.querySelector('.assist-companion-dock__toggle')).toBeNull();
    expect(dock.querySelector('[aria-expanded]')).toBeNull();
    expect(document.getElementById('assist-companion-dock-styles').textContent).not.toContain(
      '__toggle'
    );
  });

  test('a collapsed state remembered by an older version is ignored', async () => {
    chrome.storage.local.get.mockResolvedValue({ companionDockCollapsed: true });
    dockChip('lecture-toggle', chip('lecture', '🎙️ lecture'));
    for (let i = 0; i < 4; i++) {
      await Promise.resolve();
    }

    expect(document.querySelector(CHIPS).hidden).toBe(false);
  });

  test('a 320px screen shows the chips too: the student puts them away if they are in the way', async () => {
    const width = window.innerWidth;
    window.innerWidth = 320;
    try {
      dockChip('lecture-toggle', chip('lecture', '🎙️ lecture'));
      for (let i = 0; i < 4; i++) {
        await Promise.resolve();
      }
      expect(document.querySelector(CHIPS).hidden).toBe(false);
    } finally {
      window.innerWidth = width;
    }
  });
});

describe('on screen only while a chip is', () => {
  const settle = () => new Promise(resolve => setTimeout(resolve, 0));

  test('a dock holding only a hidden chip leaves the corner to the page', () => {
    const lecture = chip('lecture', '🎙️ lecture');
    lecture.hidden = true;
    dockChip('lecture-toggle', lecture);

    const dock = document.getElementById(DOCK_ID);
    expect(dock.hidden).toBe(true);
    expect(dockExtent()).toBe(0);
    // An author-level display:flex beats the UA's [hidden] rule, so the dock needs its own.
    expect(document.getElementById('assist-companion-dock-styles').textContent).toContain(
      '.assist-companion-dock[hidden]'
    );
  });

  test('a chip with nothing in it does not count as shown', () => {
    dockChip('citation-capture-bar', document.createElement('div'));

    expect(document.getElementById(DOCK_ID).hidden).toBe(true);
  });

  test('a chip that hides itself with display:none takes the dock with it', async () => {
    const lecture = chip('lecture', '🎙️ lecture');
    dockChip('lecture-toggle', lecture);
    const dock = document.getElementById(DOCK_ID);
    expect(dock.hidden).toBe(false);

    lecture.style.display = 'none';
    await settle();
    expect(dock.hidden).toBe(true);

    lecture.style.display = '';
    await settle();
    expect(dock.hidden).toBe(false);
  });

  test('the dock comes back when a hidden chip shows itself', async () => {
    const history = chip('history', '✍️ history');
    history.hidden = true;
    dockChip('authorship-indicator', history);
    const dock = document.getElementById(DOCK_ID);

    history.hidden = false;
    await settle();

    expect(dock.hidden).toBe(false);
  });

  test('one shown chip is enough, whatever the others are doing', () => {
    const hiddenChip = chip('lecture', '🎙️ lecture');
    hiddenChip.hidden = true;
    dockChip('lecture-toggle', hiddenChip);
    dockChip('citation-capture-bar', chip('cite', 'Cite this source'));

    expect(document.getElementById(DOCK_ID).hidden).toBe(false);
  });

  test('a put-away dock with nothing to bring back shows no handle either', async () => {
    chrome.storage.local.get.mockResolvedValue({
      companionDockAwaySites: { [location.origin]: true },
    });
    const lecture = chip('lecture', '🎙️ lecture');
    dockChip('lecture-toggle', lecture);
    for (let i = 0; i < 4; i++) {
      await Promise.resolve();
    }
    expect(document.querySelector(HANDLE).hidden).toBe(false);

    lecture.hidden = true;
    await settle();

    expect(document.getElementById(DOCK_ID).hidden).toBe(true);
  });
});

describe('staying off the page own controls', () => {
  const VIEWPORT = 700;
  const dockBox = box(16, 640, 320, 690);

  test('it stays at the rail offset when nothing is underneath', () => {
    const away = box(600, 100, 700, 140);
    expect(liftClearOf(EDGE_INSET, 50, dockBox, [away], VIEWPORT)).toEqual({
      offset: EDGE_INSET,
      fits: true,
    });
  });

  test('it lifts above a page control it would otherwise cover', () => {
    // A Submit button at the bottom left — the exact shape the overnight run found.
    const submit = box(20, 650, 120, 682);
    const result = liftClearOf(EDGE_INSET, 50, dockBox, [submit], VIEWPORT);

    expect(result.fits).toBe(true);
    expect(result.offset).toBe(VIEWPORT - submit.top + SLOT_GAP);
    // The dock's new bottom edge is above the control's top edge, so clicks reach it.
    expect(VIEWPORT - result.offset).toBeLessThanOrEqual(submit.top);
  });

  test('a control beside the dock, not under it, never moves it', () => {
    const beside = box(400, 650, 500, 682);
    expect(liftClearOf(EDGE_INSET, 50, dockBox, [beside], VIEWPORT).offset).toBe(EDGE_INSET);
  });

  test('it clears a second control that the first lift brought it under', () => {
    const lower = box(20, 650, 120, 682);
    const higher = box(20, 570, 120, 602);
    const result = liftClearOf(EDGE_INSET, 50, dockBox, [lower, higher], VIEWPORT);

    expect(result.fits).toBe(true);
    expect(result.offset).toBe(VIEWPORT - higher.top + SLOT_GAP);
  });

  test('it reports that it does not fit rather than climbing up the page', () => {
    // A control filling the lower half of the viewport: lifting clear would put the dock
    // halfway up the page, which is worse than shrinking.
    const tall = box(0, 200, 400, 690);
    const result = liftClearOf(EDGE_INSET, 50, dockBox, [tall], VIEWPORT);

    expect(result.fits).toBe(false);
    expect(result.offset).toBe(EDGE_INSET);
  });
});

describe('staying off them once the dock is on a page', () => {
  // The rectangles real Chrome reported at 1280x720 on the release-pass fixture: the dock at the
  // bottom-left corner, and the page's own fixed Submit button underneath it. elementFromPoint at
  // the centre of Submit returned the dock's collapse toggle, so a real click never reached Submit.
  const VIEWPORT_HEIGHT = 720;
  const DOCK_BOX = box(16, 672, 86, 704);
  const SUBMIT_BOX = box(12, 687, 69, 708);
  const CLEAR_OF_SUBMIT = VIEWPORT_HEIGHT - SUBMIT_BOX.top + SLOT_GAP;

  let realHeight;

  /** jsdom measures every box as 0x0, so the dock is given the size the browser gave it. */
  function measureDockAs(el, rect) {
    el.getBoundingClientRect = () => ({ ...rect });
    Object.defineProperty(el, 'offsetHeight', { configurable: true, value: rect.height });
    Object.defineProperty(el, 'offsetWidth', { configurable: true, value: rect.width });
  }

  function pageSubmitButton() {
    const submit = document.createElement('button');
    submit.type = 'button';
    submit.id = 'bottom';
    submit.textContent = 'Submit';
    submit.getBoundingClientRect = () => ({ ...SUBMIT_BOX });
    document.body.appendChild(submit);
    return submit;
  }

  /** A dock mounted on a page whose Submit button is directly underneath it. */
  function dockOverSubmit() {
    pageSubmitButton();
    dockChip('lecture-toggle', chip('lecture', '🎙️ lecture'));
    const el = document.getElementById(DOCK_ID);
    measureDockAs(el, DOCK_BOX);
    return el;
  }

  beforeEach(() => {
    realHeight = window.innerHeight;
    window.innerHeight = VIEWPORT_HEIGHT;
  });

  afterEach(() => {
    window.innerHeight = realHeight;
  });

  test('the whole dock, put-away control included, lifts off a button underneath it', () => {
    const el = dockOverSubmit();

    layoutRail(CORNER.BOTTOM_LEFT);

    expect(parseFloat(el.style.bottom)).toBe(CLEAR_OF_SUBMIT);
    // The dock's bottom edge is now above the button's top edge, so a press reaches the button.
    expect(VIEWPORT_HEIGHT - parseFloat(el.style.bottom)).toBeLessThanOrEqual(SUBMIT_BOX.top);
  });

  test('another control laying the rails out again cannot put it back on the button', () => {
    const el = dockOverSubmit();
    // What the companion cards do: they follow the bottom-left rail and, to place a card, measure
    // the bottom-right one as well. That re-based the dock, and the notification that would have
    // lifted it again was dropped as re-entrant — so on a real page the dock sat on Submit.
    onRailChange(CORNER.BOTTOM_LEFT, () => railExtent(CORNER.BOTTOM_RIGHT));

    layoutRail(CORNER.BOTTOM_LEFT);

    expect(parseFloat(el.style.bottom)).toBe(CLEAR_OF_SUBMIT);
  });

  test('it settles again when the window is resized', async () => {
    const el = dockOverSubmit();
    el.style.bottom = `${EDGE_INSET}px`;

    window.dispatchEvent(new Event('resize'));
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(parseFloat(el.style.bottom)).toBe(CLEAR_OF_SUBMIT);
  });
});

test('dockExtent reports 0 with no dock, and a clearance once one is mounted', () => {
  expect(dockExtent()).toBe(0);
  dockChip('lecture-toggle', chip('lecture', '🎙️ lecture'));
  expect(dockExtent()).toBeGreaterThan(EDGE_INSET);
});

describe('staying off the page own content', () => {
  // What a browser pass over real sites found: the launcher pill on top of English Wikipedia's
  // Contents column, and cutting a folder name in GitHub's file list down to a fragment. A
  // navigation column running the full height of the viewport leaves nowhere on that edge to
  // lift to, so the dock has to leave the edge.
  const VIEWPORT_HEIGHT = 720;
  const VIEWPORT_WIDTH = 1280;
  const PILL = box(16, 672, 86, 704);

  let realHeight;
  let realWidth;

  function measureDockAs(el, rect) {
    el.getBoundingClientRect = () => ({ ...rect });
    Object.defineProperty(el, 'offsetHeight', { configurable: true, value: rect.height });
    Object.defineProperty(el, 'offsetWidth', { configurable: true, value: rect.width });
  }

  /** A column of the page's own links down the left of the viewport, as a contents list is. */
  function contentsColumn() {
    const column = document.createElement('nav');
    // Entries tiled the whole height of the viewport, right down to the bottom edge: there is no
    // offset on this edge the dock can lift to, which is what defeated the lift on Wikipedia.
    for (let top = 0; top < VIEWPORT_HEIGHT; top += 40) {
      const link = document.createElement('a');
      link.href = '#section';
      link.textContent = `Section ${top}`;
      const at = top;
      link.getBoundingClientRect = () => ({ ...box(40, at, 230, at + 36) });
      column.appendChild(link);
    }
    document.body.appendChild(column);
  }

  beforeEach(() => {
    realHeight = window.innerHeight;
    realWidth = window.innerWidth;
    window.innerHeight = VIEWPORT_HEIGHT;
    window.innerWidth = VIEWPORT_WIDTH;
  });

  afterEach(() => {
    window.innerHeight = realHeight;
    window.innerWidth = realWidth;
  });

  test('it leaves an edge it cannot clear and takes the one that is free', () => {
    contentsColumn();
    dockChip('lecture-toggle', chip('lecture', '🎙️ lecture'));
    const el = document.getElementById(DOCK_ID);
    measureDockAs(el, PILL);

    layoutRail(CORNER.BOTTOM_LEFT);

    expect(el.style.right).toBe(`${EDGE_INSET}px`);
    // The edge it left has to be released, or the dock is anchored to both at once.
    expect(el.style.left).toBe('');
  });

  test("it does not swap covering the page for covering AssisT's own badge", () => {
    contentsColumn();
    // The text statistics badge on the bottom-right rail, where the dock is about to move.
    const badge = document.createElement('div');
    badge.id = 'assist-text-stats-badge';
    badge.getBoundingClientRect = () => ({ ...box(1024, 656, 1264, 704) });
    Object.defineProperty(badge, 'offsetHeight', { configurable: true, value: 48 });
    Object.defineProperty(badge, 'offsetWidth', { configurable: true, value: 240 });
    document.body.appendChild(badge);
    placeInRail(badge, 'text-stats-badge');

    dockChip('lecture-toggle', chip('lecture', '🎙️ lecture'));
    const el = document.getElementById(DOCK_ID);
    measureDockAs(el, PILL);
    layoutRail(CORNER.BOTTOM_LEFT);

    const bottom = parseFloat(el.style.bottom);
    const inlineOffset = parseFloat(el.style.right);
    expect(el.style.right).not.toBe('');
    const left = VIEWPORT_WIDTH - inlineOffset - PILL.width;
    const dockRect = box(left, VIEWPORT_HEIGHT - bottom - PILL.height, left + PILL.width, VIEWPORT_HEIGHT - bottom);
    expect(overlapArea(dockRect, box(1024, 656, 1264, 704))).toBe(0);
  });

  test('it moves with its chips showing, never hiding them because the corner is busy', () => {
    // The dock used to hide its chips whenever it could not lift clear, and re-hid them on every
    // layout - so on a page with a full-height column, pressing the old collapse control to show
    // them changed nothing on screen.
    contentsColumn();
    dockChip('lecture-toggle', chip('lecture', '🎙️ lecture'));
    const el = document.getElementById(DOCK_ID);
    measureDockAs(el, PILL);

    layoutRail(CORNER.BOTTOM_LEFT);
    layoutRail(CORNER.BOTTOM_LEFT);

    expect(document.querySelector(CHIPS).hidden).toBe(false);
    expect(el.hidden).toBe(false);
  });
});

describe('putting AssisT away', () => {
  test('the put-away control is a named, keyboard-operable button with a 24px target', () => {
    dockChip('lecture-toggle', chip('lecture', '🎙️ lecture'));
    const awayBtn = document.querySelector(AWAY);

    expect(awayBtn.tagName).toBe('BUTTON');
    expect(awayBtn.getAttribute('aria-label')).toBe('Put AssisT away on this site');
    const styles = document.getElementById('assist-companion-dock-styles').textContent;
    expect(styles).toContain('.assist-companion-dock__away');
    // An author-level display:inline-flex beats the UA's [hidden] rule, exactly as it does for
    // the chip row, so a put-away dock would otherwise keep its controls on screen.
    expect(styles).toContain('.assist-companion-dock__away[hidden]');
    expect(styles).toContain('.assist-companion-dock__handle:focus-visible');
  });

  test('Enter on it leaves only the way back, and moves focus to it', () => {
    dockChip('lecture-toggle', chip('lecture', '🎙️ lecture'));

    document
      .querySelector(AWAY)
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    const handle = document.querySelector(HANDLE);
    expect(handle.hidden).toBe(false);
    expect(document.querySelector(AWAY).hidden).toBe(true);
    expect(document.querySelector(CHIPS).hidden).toBe(true);
    expect(document.activeElement).toBe(handle);
    expect(handle.getAttribute('aria-label')).toBe('Show AssisT controls on this site');
  });

  test('the choice is remembered against this site, not every site', async () => {
    chrome.storage.local.get.mockResolvedValue({});
    dockChip('lecture-toggle', chip('lecture', '🎙️ lecture'));

    document
      .querySelector(AWAY)
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    for (let i = 0; i < 4; i++) {
      await Promise.resolve();
    }

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      companionDockAwaySites: { [location.origin]: true },
    });
  });

  test('the way back brings it all back, and forgets the choice', async () => {
    const lecture = chip('lecture', '🎙️ lecture');
    dockChip('lecture-toggle', lecture);
    document
      .querySelector(AWAY)
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    chrome.storage.local.get.mockResolvedValue({
      companionDockAwaySites: { [location.origin]: true, 'https://elsewhere.example': true },
    });

    document
      .querySelector(HANDLE)
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    for (let i = 0; i < 4; i++) {
      await Promise.resolve();
    }

    expect(document.querySelector(HANDLE).hidden).toBe(true);
    expect(document.querySelector(CHIPS).hidden).toBe(false);
    expect(document.querySelector(AWAY).hidden).toBe(false);
    // Focus moves to the first control that replaced the handle, so a keyboard student is never
    // left on a button that has gone (SC 3.2.2).
    expect(document.activeElement).toBe(lecture);
    expect(chrome.storage.local.set).toHaveBeenLastCalledWith({
      companionDockAwaySites: { 'https://elsewhere.example': true },
    });
  });

  test('a site the student put AssisT away on starts with only the way back', async () => {
    chrome.storage.local.get.mockResolvedValue({
      companionDockAwaySites: { [location.origin]: true },
    });
    dockChip('lecture-toggle', chip('lecture', '🎙️ lecture'));

    for (let i = 0; i < 4; i++) {
      await Promise.resolve();
    }

    expect(document.querySelector(HANDLE).hidden).toBe(false);
    expect(document.querySelector(CHIPS).hidden).toBe(true);
  });

  test('another site is unaffected by a put-away elsewhere', async () => {
    chrome.storage.local.get.mockResolvedValue({
      companionDockAwaySites: { 'https://elsewhere.example': true },
    });
    dockChip('lecture-toggle', chip('lecture', '🎙️ lecture'));

    for (let i = 0; i < 4; i++) {
      await Promise.resolve();
    }

    expect(document.querySelector(HANDLE).hidden).toBe(true);
    expect(document.querySelector(CHIPS).hidden).toBe(false);
  });

  test('the way back focuses the first button inside a chip that is a group of them', () => {
    const bar = document.createElement('div');
    bar.setAttribute('role', 'group');
    const cite = chip('cite', 'Cite this source');
    bar.appendChild(cite);
    bar.appendChild(chip('voice', 'Voice capture'));
    dockChip('citation-capture-bar', bar);
    dockChip('lecture-toggle', chip('lecture', '🎙️ lecture'));

    document
      .querySelector(AWAY)
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    document
      .querySelector(HANDLE)
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(document.activeElement).toBe(cite);
  });
});
