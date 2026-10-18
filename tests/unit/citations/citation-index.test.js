/**
 * Citation popup-index tests — projection shape, library build, the chrome.storage projection
 * write, and the read-back helper.
 */

import 'fake-indexeddb/auto';
import { CitationStorage } from '../../../src/features/citations/citation-storage.js';
import { clearCitations } from './helpers/clear-citations.js';
import {
  projectCitation,
  buildIndex,
  rebuildIndex,
  readIndex,
  configureIndexStorage,
  INDEX_KEY,
} from '../../../src/features/citations/citation-index.js';

afterEach(async () => {
  configureIndexStorage(null);
  await clearCitations();
});

describe('projectCitation', () => {
  it('projects the small popup shape', () => {
    const p = projectCitation({
      id: 7,
      type: 'journal',
      title: 'Memory',
      authors: ['Okonkwo, Amara'],
      publicationDate: '2021',
      url: 'https://x',
      accessDate: '2024-01-01',
    });
    expect(p).toEqual({
      id: '7',
      title: 'Memory',
      firstAuthor: 'Okonkwo',
      year: '2021',
      assistType: 'journal',
      projectId: null,
      sentinelState: null,
    });
  });

  it('an undated citation is "n.d.", never the year it was read', () => {
    // The styles print "n.d." for an undated source; the projection must agree with them, or the
    // popup list dates a source by the day the student happened to open it.
    const p = projectCitation({
      id: 8,
      title: 'Undated',
      authors: ['Doe, J.'],
      url: 'https://x',
      accessDate: '2026-09-04',
    });
    expect(p.year).toBe('n.d.');
  });

  it('reads sentinel state from extra when present', () => {
    const p = projectCitation({
      id: 1,
      title: 'T',
      url: 'https://x',
      authors: ['A'],
      extra: { sentinel: { state: 'Supported' } },
    });
    expect(p.sentinelState).toBe('Supported');
  });
});

describe('buildIndex / rebuildIndex / readIndex', () => {
  it('buildIndex projects every stored citation', async () => {
    await CitationStorage.add({ title: 'Alpha', url: 'https://a', authors: ['Smith, J.'] });
    await CitationStorage.add({ title: 'Beta', url: 'https://b', authors: ['Doe, A.'] });

    const idx = await buildIndex();
    expect(idx).toHaveLength(2);
    expect(idx.map(e => e.title).sort()).toEqual(['Alpha', 'Beta']);
    expect(idx.every(e => typeof e.id === 'string' && e.id)).toBe(true);
  });

  it('rebuildIndex writes the projection to chrome.storage.local', async () => {
    await CitationStorage.add({ title: 'Gamma', url: 'https://g', authors: ['Lee, K.'] });

    await rebuildIndex();

    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({
        [INDEX_KEY]: expect.arrayContaining([
          expect.objectContaining({ title: 'Gamma', firstAuthor: 'Lee' }),
        ]),
      })
    );
  });

  it('readIndex returns [] when unset and the stored value when set', async () => {
    chrome.storage.local.get.mockResolvedValueOnce({});
    expect(await readIndex()).toEqual([]);

    chrome.storage.local.get.mockResolvedValueOnce({ [INDEX_KEY]: [{ id: '1', title: 'X' }] });
    expect(await readIndex()).toEqual([{ id: '1', title: 'X' }]);
  });
});

/**
 * The offscreen document — the realm that owns the citation DB — has no `chrome.storage` at all.
 * It injects a bridge to the service worker instead, and the module must then leave `chrome` alone.
 */
describe('configureIndexStorage — the injected adapter', () => {
  it('rebuildIndex writes through the adapter and never touches chrome.storage', async () => {
    const adapter = { get: jest.fn().mockResolvedValue({}), set: jest.fn().mockResolvedValue() };
    configureIndexStorage(adapter);
    await CitationStorage.add({ title: 'Delta', url: 'https://d', authors: ['Ng, P.'] });

    await rebuildIndex();

    expect(adapter.set).toHaveBeenCalledWith(
      expect.objectContaining({
        [INDEX_KEY]: expect.arrayContaining([
          expect.objectContaining({ title: 'Delta', firstAuthor: 'Ng' }),
        ]),
      })
    );
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it('readIndex works in a realm with no chrome object at all', async () => {
    const adapter = {
      get: jest.fn().mockResolvedValue({ [INDEX_KEY]: [{ id: '9', title: 'Epsilon' }] }),
      set: jest.fn(),
    };
    configureIndexStorage(adapter);

    const saved = global.chrome;
    delete global.chrome;
    try {
      expect(await readIndex()).toEqual([{ id: '9', title: 'Epsilon' }]);
    } finally {
      global.chrome = saved;
    }
    expect(adapter.get).toHaveBeenCalledWith(INDEX_KEY);
  });
});

describe('projectCitation — an organisation author', () => {
  test('the popup list names the organisation whole', () => {
    const p = projectCitation({
      id: 'who',
      title: 'World health statistics 2020',
      authors: ['World Health Organization'],
      extra: { organisationAuthors: ['World Health Organization'] },
    });
    expect(p.firstAuthor).toBe('World Health Organization');
  });
});
