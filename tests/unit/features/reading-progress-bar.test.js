/**
 * @jest-environment jsdom
 *
 * The reading progress bar: it has to tell the truth about where the student is.
 *
 * This bar is the only thing telling a student with poor working memory how much of a long Canvas
 * page is left, so a number that does not move, or one that says 0% on a page that does not scroll,
 * is the whole feature failing. Pinned here: the arithmetic at the top, the middle, the bottom and
 * on a page shorter than the window; the percentage badge only when they asked for it; the bar never
 * entering the tab order; and switching it off returning the document exactly.
 *
 * There was no test of this feature at all before 1.0.0.
 */

import { installStorage, flush, snapshotPage } from './helpers/settings-driven-feature.js';

jest.mock('../../../src/core/ui/toast.js', () => ({ showToast: jest.fn() }));

const CONTAINER = '#assist-reading-progress-container';
const FILL = '#assist-reading-progress-fill';
const PERCENT = '#assist-reading-progress-percent';
const STYLES = '#assist-reading-progress-styles';

let storage;
let showToast;
let clock;

// Each `load()` is a new module instance with its own window scroll listener, and jsdom keeps one
// window for the file. Instances are switched off when their test ends so one test's bar cannot
// answer another test's scroll.
const loaded = [];

async function load(settings) {
  jest.resetModules();
  storage = installStorage(settings);
  const module = await import('../../../src/features/readingProgress/readingProgress.js');
  ({ showToast } = await import('../../../src/core/ui/toast.js'));
  loaded.push(module);
  await flush();
  return module;
}

/**
 * Describes a page of a given length to the feature. jsdom lays nothing out, so the three numbers
 * the percentage is computed from are defined here.
 *
 * @param {Object} page - `{ scrollHeight, clientHeight, scrollTop }` in pixels.
 */
function describePage({ scrollHeight, clientHeight, scrollTop = 0 }) {
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    value: scrollHeight,
    configurable: true,
  });
  Object.defineProperty(document.documentElement, 'clientHeight', {
    value: clientHeight,
    configurable: true,
  });
  Object.defineProperty(document.documentElement, 'scrollTop', {
    value: scrollTop,
    writable: true,
    configurable: true,
  });
}

/** Scrolls to a pixel offset and lets the throttled handler through. */
function scrollTo(offset) {
  document.documentElement.scrollTop = offset;
  clock += 100; // clear of the 16 ms throttle
  window.dispatchEvent(new Event('scroll'));
}

function fillWidth() {
  return document.querySelector(FILL).style.width;
}

beforeEach(() => {
  clock = 1000;
  jest.spyOn(Date, 'now').mockImplementation(() => clock);
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  document.body.removeAttribute('style');
  describePage({ scrollHeight: 2000, clientHeight: 1000 });
});

afterEach(() => {
  while (loaded.length) {
    loaded.pop().progress_disable();
  }
});

describe('a student who has never opened the popup', () => {
  test('gets no bar and an untouched page', async () => {
    document.body.innerHTML = '<h1>Week 3</h1><p>Notes</p>';
    const before = snapshotPage();

    await load(); // no assist_settings key at all

    expect(document.querySelector(CONTAINER)).toBeNull();
    expect(snapshotPage()).toEqual(before);
    expect(showToast).not.toHaveBeenCalled();
  });

  test('gets the bar as soon as the popup writes readingProgress.enabled', async () => {
    await load();

    await storage.writeFeature('readingProgress', { enabled: true });
    await flush();

    expect(document.querySelector(CONTAINER)).not.toBeNull();
    expect(document.querySelector(STYLES)).not.toBeNull();
  });
});

describe('the percentage it shows', () => {
  test('is 0 at the top of a long page', async () => {
    await load({ readingProgress: { enabled: true } });
    expect(fillWidth()).toBe('0%');
  });

  test('tracks the scroll to the middle and to the end', async () => {
    await load({ readingProgress: { enabled: true } });

    scrollTo(500); // half of the 1000px that can scroll
    expect(fillWidth()).toBe('50%');

    scrollTo(1000);
    expect(fillWidth()).toBe('100%');
  });

  test('is 100 on a page shorter than the window, not 0', async () => {
    describePage({ scrollHeight: 600, clientHeight: 900 });

    await load({ readingProgress: { enabled: true } });

    expect(fillWidth()).toBe('100%');
  });

  test('never leaves 0-100, even when the browser reports a scroll past the end', async () => {
    await load({ readingProgress: { enabled: true } });

    scrollTo(-200);
    expect(fillWidth()).toBe('0%');

    scrollTo(99999);
    expect(fillWidth()).toBe('100%');
  });

  test('copes with a page ten million pixels long', async () => {
    describePage({ scrollHeight: 10000000, clientHeight: 800 });

    await load({ readingProgress: { enabled: true } });
    scrollTo(4999600);

    expect(Number.parseFloat(fillWidth())).toBeCloseTo(50, 0);
  });

  test('recalculates when the window is resized', async () => {
    await load({ readingProgress: { enabled: true } });
    scrollTo(1000);
    expect(fillWidth()).toBe('100%');

    describePage({ scrollHeight: 4000, clientHeight: 1000, scrollTop: 1000 });
    window.dispatchEvent(new Event('resize'));

    expect(Number.parseFloat(fillWidth())).toBeCloseTo(33.33, 1);
  });
});

describe('the percentage badge', () => {
  test('is hidden unless the student asked for it', async () => {
    await load({ readingProgress: { enabled: true } });

    expect(document.querySelector(STYLES).textContent).toMatch(/#assist-reading-progress-percent/);
    expect(document.querySelector(STYLES).textContent).toContain('display: none');
    expect(document.querySelector(PERCENT).textContent).toBe('0%');
  });

  test('shows a rounded number that follows the scroll when they did', async () => {
    await load({ readingProgress: { enabled: true, showPercentage: true } });

    scrollTo(333);

    expect(document.querySelector(PERCENT).textContent).toBe('33%');
    expect(document.querySelector(STYLES).textContent).toContain('display: block');
  });
});

describe('where it sits and what colour it is', () => {
  test('follows the position the student chose', async () => {
    await load({ readingProgress: { enabled: true, position: 'bottom' } });

    expect(document.querySelector(STYLES).textContent).toContain('bottom: 0');
    expect(document.querySelector(STYLES).textContent).toContain('top: auto');
  });

  test('ignores a position that is neither top nor bottom', async () => {
    const module = await load({ readingProgress: { enabled: true, position: 'bottom' } });

    module.progress_setPosition('sideways');

    expect(module.progress_getSettings().position).toBe('bottom');
    expect(document.querySelector(STYLES).textContent).toContain('bottom: 0');
  });

  test('takes the student’s colour and keeps exactly one style tag', async () => {
    const module = await load({ readingProgress: { enabled: true, color: '#1B5E20' } });
    expect(document.querySelector(STYLES).textContent).toContain('#1B5E20');

    module.progress_setColor('#0D47A1');

    expect(document.querySelectorAll('style[id="assist-reading-progress-styles"]')).toHaveLength(1);
    expect(document.querySelector(STYLES).textContent).toContain('#0D47A1');
    expect(document.querySelector(STYLES).textContent).not.toContain('#1B5E20');
  });

  test('changing a colour is not announced a second time', async () => {
    const module = await load({ readingProgress: { enabled: true } });
    expect(showToast).toHaveBeenCalledTimes(1);

    module.progress_setColor('#0D47A1');
    await storage.writeFeature('readingProgress', { enabled: true, color: '#0D47A1' });
    await flush();

    // Only switching on and off is news. A restyle is not, and a student who hears "enabled" again
    // for a change they did not make has been told something false.
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll(CONTAINER)).toHaveLength(1);
  });

  test('hides itself at the end only when the student asked it to', async () => {
    await load({ readingProgress: { enabled: true, hideOnComplete: true } });
    scrollTo(1000);
    expect(document.querySelector(CONTAINER).style.opacity).toBe('0');

    scrollTo(200);
    expect(document.querySelector(CONTAINER).style.opacity).toBe('1');
  });
});

describe('a student who cannot see the bar', () => {
  test('the bar reports how far through the page they are', async () => {
    await load({ readingProgress: { enabled: true, showPercentage: true } });

    const container = document.querySelector(CONTAINER);
    expect(container.getAttribute('role')).toBe('progressbar');
    expect(container.getAttribute('aria-valuemin')).toBe('0');
    expect(container.getAttribute('aria-valuemax')).toBe('100');
    expect(container.getAttribute('aria-label')).toMatch(/reading progress/i);

    scrollTo(0);
    expect(container.getAttribute('aria-valuenow')).toBe('0');

    scrollTo(1000);
    expect(container.getAttribute('aria-valuenow')).toBe('100');
  });

  test('the percentage badge is not read out a second time', async () => {
    await load({ readingProgress: { enabled: true, showPercentage: true } });

    expect(document.querySelector(PERCENT).getAttribute('aria-hidden')).toBe('true');
  });
});

describe('it stays out of the student’s way', () => {
  test('takes no focus and adds nothing focusable', async () => {
    document.body.innerHTML = '<button id="submit">Submit</button>';
    document.getElementById('submit').focus();

    await load({ readingProgress: { enabled: true, showPercentage: true } });

    expect(document.activeElement.id).toBe('submit');
    expect(document.querySelectorAll('[id^="assist-reading-progress"][tabindex]')).toHaveLength(0);
    expect(document.querySelector(STYLES).textContent).toContain('pointer-events: none');
  });
});

describe('switching it off', () => {
  test('gives the document back exactly as it was', async () => {
    document.body.innerHTML = '<h1>Week 3</h1><p>Notes</p>';
    const before = snapshotPage();

    await load({ readingProgress: { enabled: true, showPercentage: true } });
    expect(snapshotPage()).not.toEqual(before);

    await storage.writeFeature('readingProgress', { enabled: false });
    await flush();

    expect(snapshotPage()).toEqual(before);
    expect(document.querySelector(CONTAINER)).toBeNull();
    expect(document.querySelector(PERCENT)).toBeNull();
    expect(document.querySelector(STYLES)).toBeNull();
    expect(showToast).toHaveBeenCalledTimes(2);
  });

  test('stops listening, so a later scroll rebuilds nothing', async () => {
    await load({ readingProgress: { enabled: true } });
    await storage.writeFeature('readingProgress', { enabled: false });
    await flush();

    scrollTo(700);

    expect(document.querySelector(CONTAINER)).toBeNull();
  });

  test('and back on again leaves one bar, not two', async () => {
    await load({ readingProgress: { enabled: true } });
    await storage.writeFeature('readingProgress', { enabled: false });
    await flush();
    await storage.writeFeature('readingProgress', { enabled: true });
    await flush();

    expect(document.querySelectorAll(CONTAINER)).toHaveLength(1);
    expect(document.querySelectorAll(PERCENT)).toHaveLength(1);
  });

  test('on an empty page nothing throws either way', async () => {
    await load({ readingProgress: { enabled: true } });
    await storage.writeFeature('readingProgress', { enabled: false });
    await storage.writeFeature('readingProgress', { enabled: false });
    await flush();

    expect(document.body.children).toHaveLength(0);
  });
});
