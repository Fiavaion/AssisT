/**
 * @jest-environment jsdom
 *
 * WCAG 2.2 SC 2.1.1 Keyboard for the popup's citation list.
 *
 * The Copy and Open buttons on a citation card, and the card itself, were wired through a
 * delegated handler that listened for `mousedown`. A keyboard never produces one: Enter
 * and Space on a native <button> fire `click`. So a keyboard-only student could reach the
 * buttons with Tab, press Enter, and nothing happened.
 *
 * These tests pin the fix at the level a student experiences it — press a key, something
 * happens — and pin the two things that would quietly undo it: an activation that fires
 * twice because the list was re-rendered, and a Copy press that also opens the citation.
 */

import { CitationManagerPanel } from '../../../src/popup/citation-manager-panel.js';

const CITATIONS = [
  {
    id: 'c1',
    title: 'Attention Is All You Need',
    authors: ['Vaswani, A.'],
    url: 'https://example.org/attention',
    createdAt: Date.now(),
  },
  {
    id: 'c2',
    title: 'Deep Residual Learning',
    authors: ['He, K.'],
    url: 'https://example.org/resnet',
    createdAt: Date.now(),
  },
];

/** Six citations, exactly one of which a search for "Zebra" or project p1 keeps. */
const MANY = [
  ...Array.from({ length: 5 }, (_, i) => ({
    id: `m${i}`,
    title: `Ordinary paper ${i}`,
    authors: ['Author, A.'],
    url: `https://example.org/${i}`,
    createdAt: Date.now(),
  })),
  {
    id: 'zebra',
    title: 'Zebra finches and birdsong',
    authors: ['Song, B.'],
    url: 'https://example.org/zebra',
    projectId: 'p1',
    createdAt: Date.now(),
  },
];

/** Dispatch a real keydown, the way a browser does when the student presses a key. */
function press(element, key) {
  const event = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  element.dispatchEvent(event);
  return event;
}

/** Dispatch a real click, the way a browser does for a mouse press. */
function click(element) {
  const event = new window.MouseEvent('click', { bubbles: true, cancelable: true });
  element.dispatchEvent(event);
  return event;
}

describe('citation list — keyboard operability (SC 2.1.1)', () => {
  let panel;
  let container;

  beforeEach(() => {
    document.body.innerHTML = '<div id="host"></div>';
    container = document.getElementById('host');

    chrome.tabs.create = jest.fn();
    chrome.tabs.sendMessage = jest.fn().mockResolvedValue({ success: true });
    chrome.storage.local.get = jest.fn().mockResolvedValue({});

    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: jest.fn().mockResolvedValue(undefined) },
      configurable: true,
    });

    // jsdom has no layout, so the roving-focus code's scrollIntoView needs a stand-in.
    Element.prototype.scrollIntoView = jest.fn();

    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    panel = new CitationManagerPanel(container, { currentTab: { id: 7, url: 'https://x.test' } });
    panel.render();
    panel.attachEventListeners();
    panel.citations = CITATIONS;
    panel.filteredCitations = CITATIONS;
    panel.renderCitationList();
  });

  /** The Copy button of the first card. */
  function copyButton() {
    return container.querySelector('.citation-card [data-command="copy"]');
  }

  /** The Open button of the first card. */
  function openButton() {
    return container.querySelector('.citation-card [data-command="open"]');
  }

  test('Enter on the Copy button copies the citation', async () => {
    const spy = jest.spyOn(panel, 'copyCitation').mockResolvedValue(undefined);

    press(copyButton(), 'Enter');

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].id).toBe('c1');
  });

  test('Space on the Copy button copies the citation', async () => {
    const spy = jest.spyOn(panel, 'copyCitation').mockResolvedValue(undefined);

    const event = press(copyButton(), ' ');

    expect(spy).toHaveBeenCalledTimes(1);
    // Space must not scroll the popup while it is activating a button.
    expect(event.defaultPrevented).toBe(true);
  });

  test('a mouse click on the Copy button still copies the citation', () => {
    const spy = jest.spyOn(panel, 'copyCitation').mockResolvedValue(undefined);

    click(copyButton());

    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('Enter, Space and a click on the Open button all open the URL', () => {
    press(openButton(), 'Enter');
    press(openButton(), ' ');
    click(openButton());

    expect(chrome.tabs.create).toHaveBeenCalledTimes(3);
    expect(chrome.tabs.create).toHaveBeenLastCalledWith({ url: 'https://example.org/attention' });
  });

  test("Enter on a card's open button opens it, as a click does", () => {
    const spy = jest.spyOn(panel, 'openCitation').mockResolvedValue(undefined);
    const card = container.querySelectorAll('.citation-open')[1];

    press(card, 'Enter');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].id).toBe('c2');

    click(card);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[1][0].id).toBe('c2');
  });

  test('activating Copy does not also open the citation behind it', () => {
    const copy = jest.spyOn(panel, 'copyCitation').mockResolvedValue(undefined);
    const open = jest.spyOn(panel, 'openCitation').mockResolvedValue(undefined);

    press(copyButton(), 'Enter');
    click(copyButton());

    expect(copy).toHaveBeenCalledTimes(2);
    expect(open).not.toHaveBeenCalled();
  });

  test('re-rendering the list does not stack handlers — one press, one copy', () => {
    const spy = jest.spyOn(panel, 'copyCitation').mockResolvedValue(undefined);

    panel.renderCitationList();
    panel.renderCitationList();

    press(copyButton(), 'Enter');

    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('exactly one card is tabbable straight after a render, with no arrow key pressed', () => {
    // Two separate defects met here. The sanitizer stripped tabindex out of the rendered
    // markup entirely; and focusedIndex is -1 at construction and again after every view
    // switch, so keying the tab stop straight off it left NO card tabbable and Tab skipped
    // the list. A roving tabindex needs exactly one entry point, always.
    expect(panel.focusedIndex).toBe(-1);

    const tabindexes = () =>
      Array.from(container.querySelectorAll('.citation-open')).map(c => c.getAttribute('tabindex'));

    expect(tabindexes()).toEqual(['0', '-1']);

    // ...and after a view switch, which resets focusedIndex to -1 again.
    panel.setView('recent');
    panel.filteredCitations = CITATIONS;
    panel.renderCitationList();
    expect(panel.focusedIndex).toBe(-1);
    expect(tabindexes()).toEqual(['0', '-1']);
  });

  test('filtering to a shorter list leaves exactly one tab stop, not a stale index', () => {
    // Arrow down into the list, then search it down to one result. The focused position
    // indexed the old list; without a reset it points past the end of the new one and the
    // list renders with no tab stop at all.
    panel.citations = MANY;
    panel.applyFilters();
    panel.renderCitationList();

    const listContainer = container.querySelector('.citation-list-container');
    for (let i = 0; i < 4; i++) {
      press(listContainer, 'ArrowDown');
    }
    expect(panel.focusedIndex).toBe(3);

    const search = container.querySelector('.citation-search-input');
    search.value = 'Zebra';
    search.dispatchEvent(new window.Event('input', { bubbles: true }));

    const cards = Array.from(container.querySelectorAll('.citation-open'));
    expect(cards).toHaveLength(1);
    expect(cards.map(c => c.getAttribute('tabindex'))).toEqual(['0']);
  });

  // Quick View opens in a dialog that Escape closes. Escape in a search that has words in it
  // clears the search and goes no further; in an empty one it is left to close the dialog.
  test('Escape clears a search without reaching the dialog around the panel', () => {
    const heard = jest.fn();
    document.addEventListener('keydown', heard);
    const search = container.querySelector('.citation-search-input');
    search.value = 'Zebra';

    const event = press(search, 'Escape');

    expect(search.value).toBe('');
    expect(event.defaultPrevented).toBe(true);
    expect(heard).not.toHaveBeenCalled();
    document.removeEventListener('keydown', heard);
  });

  test('Escape in an empty search is left for the dialog to close', () => {
    const heard = jest.fn();
    document.addEventListener('keydown', heard);

    press(container.querySelector('.citation-search-input'), 'Escape');

    expect(heard).toHaveBeenCalledTimes(1);
    document.removeEventListener('keydown', heard);
  });

  test('choosing a project also leaves exactly one tab stop', () => {
    panel.citations = MANY;
    panel.projects = [{ id: 'p1', name: 'Thesis' }];
    panel.currentView = 'projects';
    panel.applyFilters();
    panel.renderCitationList();

    const listContainer = container.querySelector('.citation-list-container');
    for (let i = 0; i < 4; i++) {
      press(listContainer, 'ArrowDown');
    }
    expect(panel.focusedIndex).toBe(3);

    const select = container.querySelector('.project-select');
    select.innerHTML = '<option value="">All</option><option value="p1">Thesis</option>';
    select.value = 'p1';
    select.dispatchEvent(new window.Event('change', { bubbles: true }));

    const cards = Array.from(container.querySelectorAll('.citation-open'));
    expect(cards).toHaveLength(1);
    expect(cards.map(c => c.getAttribute('tabindex'))).toEqual(['0']);
  });

  test('the tab stop follows the student once an arrow key moves it', () => {
    press(container.querySelector('.citation-list-container'), 'ArrowDown');
    press(container.querySelector('.citation-list-container'), 'ArrowDown');

    expect(panel.focusedIndex).toBe(1);
    panel.renderCitationList();
    expect(
      Array.from(container.querySelectorAll('.citation-open')).map(c => c.getAttribute('tabindex'))
    ).toEqual(['-1', '0']);
  });

  test('Enter on the freshly rendered tabbable card opens it', () => {
    const spy = jest.spyOn(panel, 'openCitation').mockResolvedValue(undefined);

    // Tab lands here: no arrow navigation has run at all.
    const card = container.querySelector('.citation-open[tabindex="0"]');
    card.focus();
    expect(document.activeElement).toBe(card);

    press(card, 'Enter');

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].id).toBe('c1');
  });

  test('the action buttons have explicit accessible names matching their tooltips', () => {
    const copy = copyButton();
    const open = openButton();

    expect(copy.getAttribute('aria-label')).toBe('Copy citation');
    expect(copy.getAttribute('title')).toBe('Copy citation');
    expect(open.getAttribute('aria-label')).toBe('Open URL');
    expect(open.getAttribute('title')).toBe('Open URL');

    // The glyph must stay hidden, or the name becomes "Copy citation 📋".
    expect(copy.querySelector('span').getAttribute('aria-hidden')).toBe('true');
    expect(open.querySelector('span').getAttribute('aria-hidden')).toBe('true');
  });

  test('arrow keys still rove focus, and the roving tabindex is unchanged', () => {
    const listContainer = container.querySelector('.citation-list-container');
    const cards = () => Array.from(container.querySelectorAll('.citation-open'));

    press(listContainer, 'ArrowDown');

    expect(panel.focusedIndex).toBe(0);
    expect(cards().map(c => c.getAttribute('tabindex'))).toEqual(['0', '-1']);
    expect(document.activeElement).toBe(cards()[0]);
  });

  test('the card keeps the role the list depends on, and its open button is named by the title', () => {
    const card = container.querySelector('.citation-card');

    expect(card.getAttribute('role')).toBe('listitem');
    expect(card.querySelector('.citation-open').textContent).toContain('Attention Is All You Need');
    expect(container.querySelector('.citation-list').getAttribute('role')).toBe('list');
  });
});
