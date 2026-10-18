/**
 * @jest-environment jsdom
 *
 * Every floating control AssisT injects must occupy its own place, and none of them may sit on
 * the page's own controls.
 *
 * Regression for two defects caught in real Chrome, not by unit tests. First: on a Canvas page
 * with Maths Support on, the lecture companion toggle was drawn over the Maths tools FAB and
 * swallowed its pointer events, so the button was visible and unpressable (WCAG 2.2 SC 2.5.8).
 * Then, once each control had a slot of its own, the three small chips stacked up the left edge
 * and covered the page's Submit button — `elementFromPoint` over it returned
 * `assist-companion-lecture-toggle` and a real click never reached the page. The chips now share
 * one collapsible dock, which takes a single slot on the rail.
 */

jest.mock('../../../src/features/companion/companion-settings.js', () => ({
  ...jest.requireActual('../../../src/features/companion/companion-settings.js'),
  isCompanionEnabled: jest.fn(async () => true),
}));

jest.mock('../../../src/features/companion/companion-ui.js', () => ({
  ...jest.requireActual('../../../src/features/companion/companion-ui.js'),
  isLmsHost: jest.fn(() => true),
}));

import { isCompanionEnabled } from '../../../src/features/companion/companion-settings.js';
import { isLmsHost } from '../../../src/features/companion/companion-ui.js';
import {
  CORNER,
  MIN_SLOT_SIZE,
  SLOTS,
  placeInRail,
  resetRails,
} from '../../../src/utils/corner-slots.js';
import {
  createCompanionCard,
  restackFloatingCards,
} from '../../../src/features/companion/companion-ui.js';
import { dockExtent, unmountDock } from '../../../src/features/companion/chip-dock.js';
import {
  mountMathCalculator,
  unmountMathCalculator,
} from '../../../src/features/maths/math-calculator.js';
import * as lectureUi from '../../../src/features/companion/lecture-ui.js';
import * as authorshipUi from '../../../src/features/authorship/authorship-ui.js';
import { createCaptureButtons } from '../../../src/features/citations/capture/citation-capture-buttons.js';

const DOCK_ID = 'assist-companion-dock';

/** Flush the promise chains the companion features run before they mount. */
async function flush() {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  resetRails();
  // jest.config sets resetMocks, so the factory implementations are re-applied here.
  isCompanionEnabled.mockResolvedValue(true);
  isLmsHost.mockReturnValue(true);
  chrome.storage.local.get.mockResolvedValue({});
  chrome.storage.local.set.mockResolvedValue(undefined);
});

afterEach(() => {
  unmountMathCalculator();
  lectureUi.cleanup();
  authorshipUi.cleanup();
  unmountDock();
});

test('every small chip on an LMS page sits inside the one dock', async () => {
  const capture = createCaptureButtons();

  await lectureUi.init();
  await flush();

  const textarea = document.createElement('textarea');
  document.body.appendChild(textarea);
  await authorshipUi.init();
  await flush();

  const dock = document.getElementById(DOCK_ID);
  expect(dock).not.toBeNull();

  const chips = [
    capture.el,
    document.getElementById('assist-companion-lecture-toggle'),
    document.querySelector('.assist-authorship-indicator'),
  ];
  for (const chip of chips) {
    expect(chip).not.toBeNull();
    expect(dock.contains(chip)).toBe(true);
    // A chip inside the dock is laid out by the dock, so it must not place itself.
    expect(chip.style.position).toBe('');
  }

  // Fixed order, whatever order the features started in.
  const order = [...dock.querySelectorAll('.assist-companion-dock__chips > *')];
  expect(order[0]).toBe(capture.el);
  expect(order[1]).toBe(document.querySelector('.assist-authorship-indicator'));
  expect(order[2]).toBe(document.getElementById('assist-companion-lecture-toggle'));
});

test('the dock and the Maths tools FAB never share an offset', async () => {
  mountMathCalculator();
  await lectureUi.init();
  await flush();

  const fab = document.querySelector('button[aria-label="Maths tools"]');
  const dock = document.getElementById(DOCK_ID);

  expect(SLOTS['maths-fab'].corner).toBe(CORNER.BOTTOM_LEFT);
  expect(SLOTS['chip-dock'].corner).toBe(CORNER.BOTTOM_LEFT);
  for (const el of [fab, dock]) {
    expect(el.style.position).toBe('fixed');
    expect(el.style.left).toBe('16px');
  }
  expect(parseFloat(dock.style.bottom) - parseFloat(fab.style.bottom)).toBeGreaterThanOrEqual(
    MIN_SLOT_SIZE
  );
});

test('the Maths panel opens clear of the dock on the rail', async () => {
  const handle = mountMathCalculator();
  await lectureUi.init();
  await flush();

  handle.open();

  const panel = document.getElementById('assist-mathcalc-panel');
  const dock = document.getElementById(DOCK_ID);
  expect(parseFloat(panel.style.bottom)).toBeGreaterThan(parseFloat(dock.style.bottom));
});

test('closing a control lets the one above it move down to the corner', async () => {
  mountMathCalculator();
  await lectureUi.init();
  await flush();

  const dock = document.getElementById(DOCK_ID);
  expect(parseFloat(dock.style.bottom)).toBeGreaterThan(16);

  unmountMathCalculator();
  expect(dock.style.bottom).toBe('16px');
});

test('a companion card clears the chip dock instead of covering it', async () => {
  await lectureUi.init();
  await flush();

  const card = createCompanionCard({ id: 'assist-test-card', title: 'A card', floating: true });
  document.body.appendChild(card.root);
  restackFloatingCards();

  expect(dockExtent()).toBeGreaterThan(16);
  expect(parseFloat(card.root.style.bottom)).toBeGreaterThanOrEqual(dockExtent());
});

test('companion cards stack above the text statistics badge, never over it', () => {
  const badge = document.createElement('div');
  Object.defineProperty(badge, 'offsetHeight', { value: 70, configurable: true });
  document.body.appendChild(badge);
  placeInRail(badge, 'text-stats-badge');

  const card = createCompanionCard({ id: 'assist-test-card', title: 'A card', floating: true });
  document.body.appendChild(card.root);
  restackFloatingCards();

  expect(badge.style.bottom).toBe('16px');
  expect(parseFloat(card.root.style.bottom)).toBeGreaterThanOrEqual(70 + 16);
});

test('a card follows the badge when the student closes or reopens it', () => {
  const badge = document.createElement('div');
  Object.defineProperty(badge, 'offsetHeight', { value: 70, configurable: true });
  document.body.appendChild(badge);
  placeInRail(badge, 'text-stats-badge');

  const card = createCompanionCard({ id: 'assist-test-card', title: 'A card', floating: true });
  document.body.appendChild(card.root);
  restackFloatingCards();
  expect(parseFloat(card.root.style.bottom)).toBeGreaterThanOrEqual(86);

  // Closing the badge lets the card drop to the corner...
  badge.style.display = 'none';
  placeInRail(badge, 'text-stats-badge');
  expect(card.root.style.bottom).toBe('16px');

  // ...and reopening it pushes the card back up rather than letting the two overlap.
  badge.style.display = 'block';
  placeInRail(badge, 'text-stats-badge');
  expect(parseFloat(card.root.style.bottom)).toBeGreaterThanOrEqual(86);
});

test('a card returns to the corner when nothing is below it', () => {
  const card = createCompanionCard({ id: 'assist-test-card', title: 'A card', floating: true });
  document.body.appendChild(card.root);
  restackFloatingCards();

  expect(card.root.style.bottom).toBe('16px');
});
