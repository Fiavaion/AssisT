/**
 * @jest-environment jsdom
 *
 * The annotations sidebar is injected into every page and starts closed. It used to be
 * hidden by `transform: translateX(100%)` alone: still `visibility: visible`,
 * `display: flex` and not inert, so its filter, export, close and search controls stayed
 * in the tab order off-screen. Overnight testing found four dead Tab presses on every
 * page before a keyboard user reached anything real (SC 2.4.3, 2.4.7, 2.4.11).
 *
 * Closed means gone: inert, out of the accessibility tree, and invisible once the
 * slide-out has finished. Open means focus moves in; close means focus goes back to
 * whatever opened it.
 */

jest.mock('../../../src/features/annotations/storage-adapter.js', () => ({
  getStorageAdapter: jest.fn(),
}));
jest.mock('../../../src/features/annotations/export-manager.js', () => ({
  exportAnnotations: jest.fn(),
}));
jest.mock('../../../src/features/annotations/tag-manager.js', () => ({
  getExistingTags: jest.fn(),
}));

/** The transition the panel slides out over, in ms — matches the injected CSS. */
const SLIDE_MS = 300;

let sidebar;

/** Pretend the student has asked the system for reduced motion (or not). */
function setReducedMotion(reduce) {
  window.matchMedia = jest.fn(query => ({
    matches: reduce === true && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }));
}

beforeEach(async () => {
  jest.useFakeTimers();
  document.body.innerHTML = '<button id="opener">Annotations</button>';
  jest.resetModules();
  setReducedMotion(false);

  require('../../../src/features/annotations/storage-adapter.js').getStorageAdapter.mockReturnValue(
    {
      getAll: jest.fn().mockResolvedValue([]),
      getByUrl: jest.fn().mockResolvedValue([]),
    }
  );
  require('../../../src/features/annotations/tag-manager.js').getExistingTags.mockResolvedValue([]);

  chrome.storage.local.get = jest.fn((keys, callback) => {
    if (typeof callback === 'function') {
      callback({});
      return undefined;
    }
    return Promise.resolve({});
  });
  chrome.storage.local.onChanged = { addListener: jest.fn() };

  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});

  sidebar = require('../../../src/features/annotations/annotation-sidebar.js');
  await sidebar.initializeAnnotationSidebar();
});

afterEach(() => {
  jest.useRealTimers();
});

/** The panel as it sits in the page. */
function panel() {
  return document.getElementById('assist-annotation-sidebar');
}

describe('annotations sidebar — closed is gone, not merely off-screen', () => {
  test('is inert, hidden from assistive tech and invisible as injected', () => {
    const el = panel();

    expect(el).not.toBeNull();
    expect(el.hasAttribute('inert')).toBe(true);
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.style.visibility).toBe('hidden');
  });

  test('opening puts it back in the tab order and the accessibility tree', async () => {
    await sidebar.openSidebar();

    const el = panel();
    expect(el.hasAttribute('inert')).toBe(false);
    expect(el.hasAttribute('aria-hidden')).toBe(false);
    expect(el.style.visibility).toBe('visible');
    expect(el.style.transform).toBe('translateX(0)');
  });

  test('opening moves focus into the panel', async () => {
    await sidebar.openSidebar();
    jest.advanceTimersByTime(SLIDE_MS);

    expect(document.activeElement.id).toBe('sidebar-search-input');
  });

  test('closing returns focus to the control that opened it', async () => {
    const opener = document.getElementById('opener');
    opener.focus();

    await sidebar.openSidebar();
    jest.advanceTimersByTime(SLIDE_MS);
    expect(document.activeElement.id).toBe('sidebar-search-input');

    sidebar.closeSidebar();

    expect(document.activeElement).toBe(opener);
  });

  test('closing makes it inert immediately, invisible after the slide-out', async () => {
    await sidebar.openSidebar();
    jest.advanceTimersByTime(SLIDE_MS);

    sidebar.closeSidebar();
    const el = panel();

    // Inert at once: no Tab stop survives the animation.
    expect(el.hasAttribute('inert')).toBe(true);
    expect(el.getAttribute('aria-hidden')).toBe('true');

    jest.advanceTimersByTime(SLIDE_MS);
    expect(el.style.visibility).toBe('hidden');
  });

  test('reduced motion hides it without waiting for a transition', async () => {
    setReducedMotion(true);
    await sidebar.openSidebar();

    // Focus lands without a 300ms wait too.
    jest.advanceTimersByTime(0);
    expect(document.activeElement.id).toBe('sidebar-search-input');

    sidebar.closeSidebar();
    expect(panel().style.visibility).toBe('hidden');
  });

  test('reopening after a close cancels the pending hide', async () => {
    await sidebar.openSidebar();
    jest.advanceTimersByTime(SLIDE_MS);
    sidebar.closeSidebar();

    await sidebar.openSidebar();
    jest.advanceTimersByTime(SLIDE_MS * 2);

    expect(panel().style.visibility).toBe('visible');
    expect(panel().hasAttribute('inert')).toBe(false);
  });
});
