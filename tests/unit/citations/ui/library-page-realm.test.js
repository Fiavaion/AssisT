/**
 * @jest-environment jsdom
 *
 * The citation library page renders cards in ITS OWN realm.
 *
 * `src/pages/citation-library/library.html` loads one module — `library.js` — and nothing else.
 * It never installs `window.DOMPurify`; only `content-simple.js` and `popup.js` do. So anything a
 * card needs in order to paint has to work with that global ABSENT, and these tests run with it
 * deleted to reproduce the page as Chrome actually loads it.
 *
 * `tests/setup.js` installs `window.DOMPurify` for every suite, which is why the whole library
 * silently rendering zero cards in real Chrome was invisible to 6,800 passing jsdom tests.
 *
 * Both paths the student can arrive by are covered: a record saved while the page is open (the
 * `chrome.storage.onChanged` echo, which the store answers with `refresh()`), and records already
 * in the database when the page loads.
 */

import { createCitationStore } from '../../../../src/features/citations/citation-store.js';
import { createLibraryView } from '../../../../src/features/citations/ui/library-view.js';

// In-memory stand-in for the offscreen-owned database the RPC client talks to.
const mockDb = { citations: [], projects: [], trashed: [] };

jest.mock('../../../../src/features/citations/citation-rpc.js', () => ({
  CitationStorageRPC: {
    getAll: async () => mockDb.citations.map(c => ({ ...c })),
    getTrashed: async () => mockDb.trashed.map(c => ({ ...c })),
    purgeExpired: async () => 0,
  },
  ProjectStorageRPC: {
    getAll: async () => mockDb.projects.map(p => ({ ...p })),
  },
}));

function makeCitation(id, title) {
  return {
    id,
    type: 'journal',
    title,
    authors: ['Smith, Jane'],
    publicationDate: '2022',
    journal: 'Test Journal',
    url: `https://example.com/${id}`,
    accessDate: '2024-01-01',
    quote: '',
    locator: '',
  };
}

function cardTitles(view) {
  return [...view.el.querySelectorAll('.assist-cite-card__title')].map(el => el.textContent);
}

describe('citation library page realm (no window.DOMPurify)', () => {
  let purify;
  let store;
  let view;

  beforeEach(() => {
    purify = window.DOMPurify;
    delete window.DOMPurify;
    mockDb.citations = [];
    mockDb.projects = [];
    mockDb.trashed = [];
  });

  afterEach(() => {
    if (view) {
      view.destroy();
      view = null;
    }
    if (store) {
      store.destroy();
      store = null;
    }
    window.DOMPurify = purify;
    document.body.innerHTML = '';
  });

  test('a citation saved while the page is open appears as a card', async () => {
    store = createCitationStore();
    await store.init();

    view = createLibraryView({ store });
    document.body.appendChild(view.el);

    expect(cardTitles(view)).toEqual([]);

    // What a save in another context looks like from here: the row lands in the database and the
    // `citationIndex` change brings the store back for it. `refresh()` is the handler's whole body.
    mockDb.citations.push(makeCitation('probe-1', 'Probe title'));
    await store.refresh();

    expect(cardTitles(view)).toEqual(['Probe title']);
  });

  test('citations already saved are on screen when the page loads', async () => {
    mockDb.citations.push(makeCitation('seed-1', 'Seeded one'), makeCitation('seed-2', 'Seeded two'));

    store = createCitationStore();
    await store.init();

    view = createLibraryView({ store });
    document.body.appendChild(view.el);

    expect(view.el.querySelectorAll('.assist-cite-card')).toHaveLength(2);
    expect(cardTitles(view).sort()).toEqual(['Seeded one', 'Seeded two']);
  });

  test('the reference keeps the italics the style asked for', async () => {
    mockDb.citations.push(makeCitation('seed-1', 'Seeded one'));

    store = createCitationStore();
    await store.init();

    view = createLibraryView({ store });
    document.body.appendChild(view.el);

    const reference = view.el.querySelector('.assist-cite-card__reference');
    expect(reference.textContent).toContain('Seeded one');
    expect(reference.querySelector('em')).not.toBeNull();
  });
});
