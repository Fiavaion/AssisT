/**
 * @jest-environment jsdom
 *
 * The visible count in Quick View must agree with the cards on screen. It used to be set only
 * on load, so a search that left one card still read "2 citations".
 */

import { CitationManagerPanel } from '../../../src/popup/citation-manager-panel.js';

const OLD = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

const CITATIONS = [
  {
    id: 'c1',
    title: 'Array programming with NumPy',
    authors: ['Harris, C. R.'],
    url: 'https://example.org/numpy',
    createdAt: Date.now(),
  },
  {
    id: 'c2',
    title: 'Deep Residual Learning',
    authors: ['He, K.'],
    url: 'https://example.org/resnet',
    createdAt: OLD,
  },
];

let panel;
let container;

function type(value) {
  const search = container.querySelector('.citation-search-input');
  search.value = value;
  search.dispatchEvent(new window.Event('input', { bubbles: true }));
}

const count = () => container.querySelector('.citation-count').textContent;

beforeEach(async () => {
  document.body.innerHTML = '<div id="host"></div>';
  container = document.getElementById('host');
  chrome.tabs.sendMessage = jest
    .fn()
    .mockResolvedValue({ success: true, citations: CITATIONS, projects: [] });
  chrome.storage.local.get = jest.fn().mockResolvedValue({});
  Element.prototype.scrollIntoView = jest.fn();
  jest.spyOn(console, 'log').mockImplementation(() => {});

  panel = new CitationManagerPanel(container, { currentTab: { id: 7, url: 'https://x.test' } });
  await panel.initialize();
});

test('shows the library total when nothing is filtered', () => {
  expect(count()).toBe('2 citations');
});

test('a search that narrows the list says how many of the library are shown', () => {
  type('numpy');
  expect(container.querySelectorAll('.citation-card')).toHaveLength(1);
  expect(count()).toBe('1 of 2 citations');
});

test('clearing the search restores the plain total', () => {
  type('numpy');
  type('');
  expect(count()).toBe('2 citations');
});

test('a search with no match reads 0 of the total', () => {
  type('zzz');
  expect(count()).toBe('0 of 2 citations');
});

test('a view change updates the count too', () => {
  panel.setView('recent');
  expect(container.querySelectorAll('.citation-card')).toHaveLength(1);
  expect(count()).toBe('1 of 2 citations');
  panel.setView('all');
  expect(count()).toBe('2 citations');
});

test('the status element keeps announcing only the shown count', () => {
  type('numpy');
  expect(container.querySelector('.citation-list-status').textContent).toBe('1 citation');
});
