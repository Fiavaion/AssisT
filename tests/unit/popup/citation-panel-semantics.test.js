/**
 * @jest-environment jsdom
 *
 * WCAG 2.2 semantics for the popup's citation list.
 *
 * SC 4.1.3 Status Messages: the list used to be its own polite live region, and its markup is
 * replaced on every search keystroke, so a screen reader re-read the whole list after each letter.
 * Only a short count summary may be announced, from a separate status element, and only when
 * the count actually changes.
 *
 * SC 4.1.2 Name, Role, Value: a card was focusable and opened on Enter while exposing
 * role="listitem", which a screen reader presents as inert. The operable part is a real button
 * inside the list item.
 *
 * The view switcher is a tablist, so it needs the tabpanel it controls.
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
  {
    id: 'c3',
    title: 'Zebra finches and birdsong',
    authors: ['Song, B.'],
    url: 'https://example.org/zebra',
    createdAt: Date.now(),
  },
];

let panel;
let container;

function type(value) {
  const search = container.querySelector('.citation-search-input');
  search.value = value;
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
}

function status() {
  return container.querySelector('[role="status"]');
}

beforeEach(() => {
  document.body.innerHTML = '<div id="host"></div>';
  container = document.getElementById('host');
  chrome.tabs.sendMessage = jest.fn().mockResolvedValue({ success: true });
  chrome.storage.local.get = jest.fn().mockResolvedValue({});
  Element.prototype.scrollIntoView = jest.fn();
  jest.spyOn(console, 'log').mockImplementation(() => {});

  panel = new CitationManagerPanel(container, { currentTab: { id: 7, url: 'https://x.test' } });
  panel.render();
  panel.attachEventListeners();
  panel.citations = CITATIONS;
  panel.applyFilters();
  panel.renderCitationList();
});

describe('the list is not a live region (SC 4.1.3)', () => {
  test('neither the list nor anything around it is aria-live', () => {
    const list = container.querySelector('.citation-list');
    for (let el = list; el && el !== container; el = el.parentElement) {
      expect(el.hasAttribute('aria-live')).toBe(false);
    }
  });

  test('a separate status element outside the list states the count', () => {
    const list = container.querySelector('.citation-list-container');
    expect(status()).not.toBeNull();
    expect(list.contains(status())).toBe(false);
    expect(status().textContent.trim()).toBe('3 citations');
  });

  test('a search that changes the count updates the status once', () => {
    type('z');
    expect(status().textContent.trim()).toBe('1 citation');
  });

  test('a keystroke that leaves the count unchanged does not touch the status', () => {
    type('ze');
    const observer = new MutationObserver(() => {});
    observer.observe(status(), { childList: true, characterData: true, subtree: true });
    type('zeb');
    type('zebr');
    expect(observer.takeRecords()).toHaveLength(0);
    observer.disconnect();
  });

  test('a search with no results says so', () => {
    type('nothing like this');
    expect(status().textContent.trim()).toBe('No citations match your search');
  });
});

describe('cards are list items holding a real button (SC 4.1.2)', () => {
  test('each list item is not itself focusable and holds a button named by the title', () => {
    const items = Array.from(container.querySelectorAll('[role="listitem"]'));
    expect(items).toHaveLength(3);
    items.forEach((item, i) => {
      expect(item.hasAttribute('tabindex')).toBe(false);
      const button = item.querySelector('button.citation-open');
      expect(button).not.toBeNull();
      expect(button.textContent).toContain(CITATIONS[i].title);
    });
  });

  test('the list items belong to a list', () => {
    const item = container.querySelector('[role="listitem"]');
    expect(item.parentElement.getAttribute('role')).toBe('list');
  });

  test('an empty result leaves no list role holding a non-item', () => {
    type('nothing like this');
    expect(container.querySelector('[role="list"]')).toBeNull();
  });

  test('exactly one open button is tabbable', () => {
    const tabindexes = Array.from(container.querySelectorAll('.citation-open')).map(b =>
      b.getAttribute('tabindex')
    );
    expect(tabindexes).toEqual(['0', '-1', '-1']);
  });
});

describe('the view switcher controls a labelled tabpanel', () => {
  test('every tab points at the tabpanel that holds the list', () => {
    const tabs = Array.from(container.querySelectorAll('[role="tab"]'));
    const panelId = tabs[0].getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
    tabs.forEach(tab => expect(tab.getAttribute('aria-controls')).toBe(panelId));
    const tabpanel = document.getElementById(panelId);
    expect(tabpanel.getAttribute('role')).toBe('tabpanel');
    expect(tabpanel.contains(container.querySelector('.citation-list'))).toBe(true);
  });

  test('the tabpanel is labelled by the selected tab, and follows a view switch', () => {
    const tabpanel = container.querySelector('[role="tabpanel"]');
    const labelOf = () => document.getElementById(tabpanel.getAttribute('aria-labelledby'));
    expect(labelOf().dataset.view).toBe('all');
    panel.setView('recent');
    expect(labelOf().dataset.view).toBe('recent');
  });
});

describe('the open button is named by the title and described by the author line', () => {
  test('aria-labelledby resolves to the title, aria-describedby to the meta', () => {
    const button = container.querySelectorAll('.citation-open')[1];
    const name = document.getElementById(button.getAttribute('aria-labelledby'));
    const description = document.getElementById(button.getAttribute('aria-describedby'));
    expect(name.textContent.trim()).toBe('Deep Residual Learning');
    expect(description.textContent).toContain('He, K.');
  });
});
