/**
 * @jest-environment jsdom
 *
 * ProjectStorage: the collection (project) record, and the one rule that matters most —
 * deleting a collection must never delete the sources filed in it.
 *
 * fake-indexeddb/auto MUST be imported before the module under test so the global shim is in
 * place when Dexie initialises.
 */

import 'fake-indexeddb/auto';
import {
  CitationStorage,
  ProjectStorage,
  onCitationsChanged,
} from '../../../src/features/citations/citation-storage.js';
import { clearCitations } from './helpers/clear-citations.js';

let n = 0;
function makeCitation(overrides = {}) {
  n += 1;
  return {
    title: `Source ${n}`,
    url: `https://example.test/${n}`,
    authors: ['Smith, J.'],
    ...overrides,
  };
}

afterEach(async () => {
  await clearCitations();
  for (const p of await ProjectStorage.getAll()) {
    await ProjectStorage.delete(p.id);
  }
});

describe('ProjectStorage.create', () => {
  it('stores the name and the optional description, and returns a string id', async () => {
    const id = await ProjectStorage.create('Essay 1', 'Memory and rehearsal');
    expect(typeof id).toBe('string');

    const project = await ProjectStorage.get(id);
    expect(project.name).toBe('Essay 1');
    expect(project.description).toBe('Memory and rehearsal');
    expect(typeof project.createdAt).toBe('number');
  });

  it('defaults the description to an empty string', async () => {
    const id = await ProjectStorage.create('Essay 2');
    expect((await ProjectStorage.get(id)).description).toBe('');
  });
});

describe('ProjectStorage.update', () => {
  it('renames a collection without touching its citations', async () => {
    const id = await ProjectStorage.create('Draft name');
    await CitationStorage.add(makeCitation({ projectId: id }));

    await ProjectStorage.update(id, { name: 'Final name' });

    expect((await ProjectStorage.get(id)).name).toBe('Final name');
    expect(await ProjectStorage.countCitations(id)).toBe(1);
  });
});

describe('ProjectStorage.delete — citations must survive', () => {
  it('keeps every citation, unfiles them, and reports how many were unfiled', async () => {
    const id = await ProjectStorage.create('Doomed');
    const keepId = await CitationStorage.add(makeCitation({ title: 'Filed A', projectId: id }));
    await CitationStorage.add(makeCitation({ title: 'Filed B', projectId: id }));
    await CitationStorage.add(makeCitation({ title: 'Unfiled' }));

    const result = await ProjectStorage.delete(id);

    // The collection is gone…
    expect(await ProjectStorage.get(id)).toBeNull();
    // …and every citation is still there.
    expect(await CitationStorage.count()).toBe(3);
    // The filed ones came back to the library rather than following the collection down.
    expect((await CitationStorage.get(keepId)).projectId).toBeNull();
    expect(result).toEqual({ unfiled: 2 });
  });

  it('reports zero when the collection was empty', async () => {
    const id = await ProjectStorage.create('Empty');
    expect(await ProjectStorage.delete(id)).toEqual({ unfiled: 0 });
  });

  it('unfiles citations whose projectId was stored as a number', async () => {
    const id = await ProjectStorage.create('Numeric');
    await CitationStorage.add(makeCitation({ projectId: Number(id) }));

    expect(await ProjectStorage.delete(id)).toEqual({ unfiled: 1 });
    expect(await CitationStorage.count()).toBe(1);
  });

  it('announces the change so the cross-context projection cannot go stale', async () => {
    const id = await ProjectStorage.create('Watched');
    await CitationStorage.add(makeCitation({ projectId: id }));

    const seen = jest.fn();
    const off = onCitationsChanged(seen);
    await ProjectStorage.delete(id);
    off();

    expect(seen).toHaveBeenCalled();
  });
});
