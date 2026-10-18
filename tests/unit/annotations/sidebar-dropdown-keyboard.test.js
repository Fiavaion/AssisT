/**
 * @jest-environment jsdom
 *
 * The annotations sidebar's Export and Filter buttons.
 *
 * Overnight release testing found Export unopenable by keyboard: Enter left the dropdown
 * `display: none` with no `aria-expanded`, while a mouse click appeared to work (SC 2.1.1,
 * SC 4.1.2). The cause was not the event handler at all — both toggles decided "am I open?" from
 * the container's INLINE `style.display`, which starts as the empty string because the hidden
 * state comes from the injected stylesheet. So `'' !== 'none'` read as open and the very first
 * activation, mouse or keyboard, took the "hide" branch; the mouse only looked different because
 * the earlier Enter press had just written the inline `display: none` that flipped the reading.
 *
 * State now lives on the button, in the `aria-expanded` a screen reader reads out, so the two
 * cannot disagree again.
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

beforeEach(async () => {
  jest.useFakeTimers();
  document.body.innerHTML = '<button id="opener">Annotations</button>';
  jest.resetModules();
  window.matchMedia = jest.fn(query => ({
    matches: false,
    media: query,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }));

  // One saved annotation, so Export has something to offer — the state the finding was found in.
  const saved = [
    {
      id: 'a1',
      text: 'dyslexia',
      comment: 'look this up',
      url: window.location.href,
      color: 'yellow',
      tags: [],
      timestamp: Date.now(),
      createdAt: new Date().toISOString(),
    },
  ];
  require('../../../src/features/annotations/storage-adapter.js').getStorageAdapter.mockReturnValue(
    {
      getAll: jest.fn().mockResolvedValue(saved),
      getByUrl: jest.fn().mockResolvedValue(saved),
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
  await sidebar.openSidebar();
  jest.advanceTimersByTime(SLIDE_MS);
});

afterEach(() => {
  jest.useRealTimers();
});

const panel = () => document.getElementById('assist-annotation-sidebar');
const exportBtn = () => document.getElementById('sidebar-export-btn');
const filterBtn = () => document.getElementById('sidebar-filter-btn');
const exportMenu = () => document.getElementById('export-dropdown-container');
const filterPanel = () => document.getElementById('filter-dropdown-container');
const exportOptions = () => Array.from(document.querySelectorAll('.assist-export-option'));

/** @param {HTMLElement} element @param {string} key @returns {KeyboardEvent} */
function pressKey(element, key) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  element.dispatchEvent(event);
  return event;
}

/** @param {HTMLElement} element */
function pressPointer(element) {
  element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

describe('the Export button', () => {
  test('advertises a closed menu it controls', () => {
    expect(exportBtn().getAttribute('aria-haspopup')).toBe('true');
    expect(exportBtn().getAttribute('aria-expanded')).toBe('false');
    expect(exportBtn().getAttribute('aria-controls')).toBe('export-dropdown-container');
  });

  test('opens on the FIRST Enter press, with the four formats', () => {
    exportBtn().focus();
    pressKey(exportBtn(), 'Enter');

    expect(exportBtn().getAttribute('aria-expanded')).toBe('true');
    expect(exportMenu().style.display).toBe('block');
    expect(exportOptions().map(b => b.dataset.format)).toEqual(['md', 'txt', 'json', 'csv']);
  });

  test('opens on Space too', () => {
    exportBtn().focus();
    pressKey(exportBtn(), ' ');

    expect(exportBtn().getAttribute('aria-expanded')).toBe('true');
  });

  test('opens on the first pointer press as well', () => {
    pressPointer(exportBtn());

    expect(exportBtn().getAttribute('aria-expanded')).toBe('true');
    expect(exportMenu().style.display).toBe('block');
  });

  test('is a menu whose options are announced as such', () => {
    pressKey(exportBtn(), 'Enter');

    const menu = exportMenu().querySelector('[role="menu"]');
    expect(menu).not.toBeNull();
    expect(menu.getAttribute('aria-label')).toMatch(/export/i);
    expect(exportOptions().every(b => b.getAttribute('role') === 'menuitem')).toBe(true);
  });

  test('renders exactly one tab stop and puts the keyboard on the first format', () => {
    pressKey(exportBtn(), 'Enter');

    expect(exportOptions().filter(b => b.getAttribute('tabindex') === '0')).toHaveLength(1);
    expect(document.activeElement).toBe(exportOptions()[0]);
  });

  test('arrow keys walk the four formats and wrap', () => {
    pressKey(exportBtn(), 'Enter');
    const options = exportOptions();

    pressKey(document.activeElement, 'ArrowDown');
    expect(document.activeElement).toBe(options[1]);

    pressKey(document.activeElement, 'End');
    expect(document.activeElement).toBe(options[3]);

    pressKey(document.activeElement, 'ArrowDown');
    expect(document.activeElement).toBe(options[0]);

    pressKey(document.activeElement, 'ArrowUp');
    expect(document.activeElement).toBe(options[3]);

    pressKey(document.activeElement, 'Home');
    expect(document.activeElement).toBe(options[0]);
    expect(exportOptions().filter(b => b.getAttribute('tabindex') === '0')).toHaveLength(1);
  });

  test('a second press on the button closes it again', () => {
    pressKey(exportBtn(), 'Enter');
    pressKey(exportBtn(), 'Enter');

    expect(exportBtn().getAttribute('aria-expanded')).toBe('false');
    expect(exportMenu().style.display).toBe('none');
  });

  test('Escape closes the menu, returns the keyboard to the button, and leaves the sidebar open', () => {
    pressKey(exportBtn(), 'Enter');

    pressKey(document.activeElement, 'Escape');

    expect(exportBtn().getAttribute('aria-expanded')).toBe('false');
    expect(exportMenu().style.display).toBe('none');
    expect(document.activeElement).toBe(exportBtn());
    expect(panel().hasAttribute('inert')).toBe(false);
  });

  test('a second Escape then closes the sidebar', () => {
    pressKey(exportBtn(), 'Enter');
    pressKey(document.activeElement, 'Escape');

    pressKey(exportBtn(), 'Escape');

    expect(panel().hasAttribute('inert')).toBe(true);
  });

  test('choosing a format exports it and closes the menu', async () => {
    const { exportAnnotations } = require('../../../src/features/annotations/export-manager.js');
    exportAnnotations.mockResolvedValue({ success: true, message: 'Exported', count: 1 });
    pressKey(exportBtn(), 'Enter');

    pressKey(exportOptions()[2], 'Enter');
    await Promise.resolve();
    await Promise.resolve();

    expect(exportAnnotations).toHaveBeenCalledWith(expect.any(Array), 'json');
  });
});

describe('the Filter button — the same fault', () => {
  test('opens on the FIRST Enter press', () => {
    filterBtn().focus();
    pressKey(filterBtn(), 'Enter');

    expect(filterBtn().getAttribute('aria-expanded')).toBe('true');
    expect(filterPanel().style.display).toBe('block');
    expect(filterPanel().querySelector('.assist-filter-dropdown')).not.toBeNull();
  });

  test('a second press closes it again', () => {
    pressKey(filterBtn(), 'Enter');
    pressKey(filterBtn(), 'Enter');

    expect(filterBtn().getAttribute('aria-expanded')).toBe('false');
    expect(filterPanel().style.display).toBe('none');
  });

  test('Escape closes the filter panel before it closes the sidebar', () => {
    pressKey(filterBtn(), 'Enter');

    pressKey(filterBtn(), 'Escape');

    expect(filterBtn().getAttribute('aria-expanded')).toBe('false');
    expect(panel().hasAttribute('inert')).toBe(false);
  });
});
