/**
 * @jest-environment jsdom
 *
 * The popup's Quick View citation list.
 *
 * - No third party is contacted to draw it. Each card used to load
 *   https://www.google.com/s2/favicons?domain=<source host>, which told Google the domain of every
 *   source the student had saved, with no consent. A card now shows the icon the citation already
 *   holds when that is a data: image, and a local generic icon otherwise.
 * - Copy formats the citation within its reference list — its collection, or every unfiled
 *   citation — in the student's chosen style, as the library does.
 */

import { CitationManagerPanel } from '../../../src/popup/citation-manager-panel.js';

const DATA_ICON = 'data:image/png;base64,iVBORw0KGgo=';

const book = (id, title, extra = {}) => ({
  id,
  type: 'book',
  title,
  authors: ['Smith, John'],
  publisher: 'Pub',
  publicationDate: '2020',
  url: `https://source-${id}.example/page`,
  createdAt: Date.now(),
  ...extra,
});

const CITATIONS = [
  book('a', 'The ants of Africa', { projectId: 'essay' }),
  book('z', 'Zebras of the plain', { projectId: 'essay', favicon: DATA_ICON }),
  book('x', 'Aardvarks at home', { favicon: 'https://tracker.example/icon.png' }),
];

let panel;
let container;
let writeText;

beforeEach(() => {
  document.body.innerHTML = '<div id="host"></div>';
  container = document.getElementById('host');
  chrome.tabs.sendMessage = jest.fn().mockResolvedValue({ success: true });
  chrome.storage.local.get = jest.fn().mockResolvedValue({ citationStyle: 'apa7' });
  Element.prototype.scrollIntoView = jest.fn();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

  panel = new CitationManagerPanel(container, { currentTab: { id: 7, url: 'https://x.test' } });
  panel.render();
  panel.attachEventListeners();
  panel.citations = CITATIONS;
  panel.applyFilters();
  panel.renderCitationList();
});

describe('no third party is contacted to draw the list', () => {
  test('no card references an external image', () => {
    const images = [...container.querySelectorAll('img')];
    expect(images).toHaveLength(CITATIONS.length);
    for (const img of images) {
      expect(img.getAttribute('src')).toMatch(/^data:image\//);
    }
    expect(container.innerHTML).not.toMatch(/google\.com|s2\/favicons|tracker\.example/);
  });

  test('an icon the citation already holds as a data: image is kept', () => {
    const card = container.querySelector('.citation-card[data-id="z"]');
    expect(card.querySelector('img').getAttribute('src')).toBe(DATA_ICON);
  });

  test('the icon stays decorative', () => {
    for (const img of container.querySelectorAll('img')) {
      expect(img.getAttribute('alt')).toBe('');
    }
  });
});

describe('Copy formats within the card’s reference list', () => {
  test('a work in a collection carries the letter that collection gives it', async () => {
    await panel.copyCitation(CITATIONS[1]);
    expect(writeText).toHaveBeenCalledWith('Smith, J. (2020b). Zebras of the plain. Pub.');
  });

  test('an unfiled work is not lettered against a collection', async () => {
    await panel.copyCitation(CITATIONS[2]);
    expect(writeText).toHaveBeenCalledWith('Smith, J. (2020). Aardvarks at home. Pub.');
  });
});
