/**
 * @jest-environment jsdom
 *
 * The sidebar excerpt is text the student selected on the HOST page, so it is untrusted
 * input that the extension renders back into the host page with innerHTML. It was being
 * interpolated raw: highlightMatches() escaped only on the branch where a search query
 * actually matched, and the plain annotation item never escaped at all.
 *
 * DOMPurify still stopped script, but not everything harmful survives as "safe" markup —
 * now that tabindex is allowed through sanitizeHTML, an <a tabindex="1"> in selected page
 * text would become a real tab stop ahead of the whole document (SC 2.4.3). Selected text
 * is text. It must render as text.
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

const HOSTILE = '<a href="#" tabindex="1">jump to the front</a>';

/** One annotation whose selected text is markup lifted off the host page. */
const annotation = {
  id: 1,
  type: 'highlight',
  url: 'https://example.test/page',
  selectedText: HOSTILE,
  color: 'yellow',
  createdAt: Date.now(),
};

describe('annotation sidebar — the excerpt is escaped, never markup', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    // Fresh module registry per test: the sidebar keeps its element and annotation list in
    // module state, and the jest.mock factories are re-applied on the next require.
    jest.resetModules();

    // resetMocks wipes factory implementations, so they are set here, on the instances the
    // freshly required sidebar will actually import.
    require('../../../src/features/annotations/storage-adapter.js').getStorageAdapter.mockReturnValue(
      {
        getAll: jest.fn().mockResolvedValue([annotation]),
        getByUrl: jest.fn().mockResolvedValue([annotation]),
      }
    );
    require('../../../src/features/annotations/tag-manager.js').getExistingTags.mockResolvedValue(
      []
    );

    // loadStorageMode() uses the CALLBACK form of storage.get; the shared mock only
    // resolves a promise, which would leave the sidebar waiting forever.
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

    const sidebar = require('../../../src/features/annotations/annotation-sidebar.js');
    await sidebar.initializeAnnotationSidebar();
    await sidebar.openSidebar();
  });

  test('renders the hostile selected text as visible characters, not as a link', () => {
    const excerpt = document.querySelector('.assist-sidebar-item-excerpt');

    expect(excerpt).not.toBeNull();
    expect(excerpt.querySelector('a')).toBeNull();
    expect(excerpt.textContent).toContain('<a href="#" tabindex="1">');
  });

  test('leaves no injected tab stop anywhere in the sidebar', () => {
    // Every tabindex in the sidebar must be one the extension itself wrote: 0 or -1.
    const values = Array.from(document.querySelectorAll('[tabindex]')).map(el =>
      el.getAttribute('tabindex')
    );

    expect(values.length).toBeGreaterThan(0);
    expect(values.every(v => v === '0' || v === '-1')).toBe(true);
  });

  test('the item keeps its own tab stop, so the list is still keyboard reachable', () => {
    const item = document.querySelector('.assist-sidebar-item');

    expect(item.getAttribute('tabindex')).toBe('0');
    expect(item.getAttribute('role')).toBe('button');
  });

  test('the accessible name carries the text, not the markup', () => {
    const item = document.querySelector('.assist-sidebar-item');

    expect(item.getAttribute('aria-label')).toContain('jump to the front');
    expect(item.querySelector('a')).toBeNull();
  });
});

describe('annotation sidebar — search highlighting does not split entities', () => {
  /** Type into the sidebar search box and let the 300ms debounce fire. */
  async function search(query) {
    const input = document.querySelector('#sidebar-search-input');
    input.value = query;
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    jest.advanceTimersByTime(400);
    // Let performSearch's awaits settle before the assertions read the DOM.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  }

  beforeEach(async () => {
    document.body.innerHTML = '';
    jest.resetModules();
    jest.useFakeTimers();

    const ampersand = {
      id: 2,
      type: 'highlight',
      url: 'https://example.test/page',
      selectedText: 'Rock & amplifier',
      color: 'yellow',
      createdAt: Date.now(),
    };

    require('../../../src/features/annotations/storage-adapter.js').getStorageAdapter.mockReturnValue(
      {
        getAll: jest.fn().mockResolvedValue([ampersand]),
        getByUrl: jest.fn().mockResolvedValue([ampersand]),
      }
    );
    require('../../../src/features/annotations/tag-manager.js').getExistingTags.mockResolvedValue(
      []
    );

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

    const sidebar = require('../../../src/features/annotations/annotation-sidebar.js');
    await sidebar.initializeAnnotationSidebar();
    await sidebar.openSidebar();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('a match inside an escaped entity leaves the text intact', async () => {
    // "amp" occurs in "amplifier" AND inside the "&amp;" the ampersand escapes to.
    // Highlighting over the escaped string used to split the entity, so the student saw
    // the literal characters "&amp;" in their own note.
    await search('amp');

    const excerpt = document.querySelector('.assist-sidebar-item-excerpt');

    expect(excerpt).not.toBeNull();
    expect(excerpt.textContent).toBe('Rock & amplifier');
    expect(excerpt.textContent.match(/&/g)).toHaveLength(1);
    expect(excerpt.textContent).not.toContain('amp;');
  });

  test('the match itself is still marked up', async () => {
    await search('amp');

    const marks = document.querySelectorAll('.assist-sidebar-item-excerpt strong');

    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe('amp');
  });
});
