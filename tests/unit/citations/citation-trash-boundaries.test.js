/**
 * @jest-environment jsdom
 *
 * The trash must not leak. A soft-deleted citation is out of the library, and every path that
 * reads the library — backup/export, duplicate detection, the popup projection, the first-run
 * migration — has to agree, or a student meets a source they thought they had removed (or, worse,
 * watches a removed source come back).
 *
 * fake-indexeddb/auto MUST be imported before the storage module.
 */

import 'fake-indexeddb/auto';
import { CitationStorage } from '../../../src/features/citations/citation-storage.js';
import { clearCitations } from './helpers/clear-citations.js';
import { exportCitations } from '../../../src/features/citations/citation-export.js';
import { dedupeCitations, findDuplicateGroups } from '../../../src/features/citations/citation-dedupe.js';
import { buildIndex } from '../../../src/features/citations/citation-index.js';
import { createMigrationRunner } from '../../../src/features/citations/citation-migration.js';
import { installCitationRpcBridge } from './helpers/rpc-bridge.js';

beforeEach(() => {
  installCitationRpcBridge();
  // downloadFile() needs an object-URL factory; jsdom has none.
  global.URL.createObjectURL = jest.fn(() => 'blob:test');
  global.URL.revokeObjectURL = jest.fn();
});

afterEach(async () => {
  await clearCitations();
});

function makeCitation(overrides = {}) {
  return {
    title: 'Kept Source',
    url: `https://example.test/${Math.random().toString(36).slice(2)}`,
    authors: ['Smith, J.'],
    ...overrides,
  };
}

describe('backup and export', () => {
  // The JSON export is the student's backup: the guide tells them to restore it through Import.
  it('the JSON export carries the library, never the trash', async () => {
    await CitationStorage.add(makeCitation({ title: 'Kept Source' }));
    const gone = await CitationStorage.add(makeCitation({ title: 'Removed Source' }));
    await CitationStorage.delete(gone);

    await exportCitations('json');

    const blob = global.URL.createObjectURL.mock.calls[0][0];
    const written = await new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsText(blob);
    });
    expect(JSON.parse(written).citations.map(c => c.title)).toEqual(['Kept Source']);
  });
});

describe('duplicate detection', () => {
  it('ignores a trashed twin, so the surviving copy is not reported as a duplicate', async () => {
    const url = 'https://example.test/same-source';
    await CitationStorage.add(makeCitation({ title: 'Original', url }));
    const twin = await CitationStorage.add(makeCitation({ title: 'Duplicate', url }));

    const before = findDuplicateGroups(await CitationStorage.getAll());
    expect(before).toHaveLength(1);

    await CitationStorage.delete(twin);

    const after = await CitationStorage.getAll();
    expect(findDuplicateGroups(after)).toEqual([]);
    expect(dedupeCitations(after).removed).toEqual([]);
  });
});

describe('the popup projection', () => {
  it('drops a trashed citation, so no other context can resurrect it', async () => {
    await CitationStorage.add(makeCitation({ title: 'Kept Source' }));
    const gone = await CitationStorage.add(makeCitation({ title: 'Removed Source' }));
    await CitationStorage.delete(gone);

    const projection = await buildIndex();

    expect(projection.map(row => row.title)).toEqual(['Kept Source']);
  });
});

describe('first-run migration', () => {
  it('does not rebuild a stub for a citation the student has removed', async () => {
    const trashedRow = {
      title: 'Removed Source',
      url: 'https://example.test/removed',
      authors: ['Smith, J.'],
      deletedAt: '2026-09-01T00:00:00.000Z',
    };
    const storage = {
      add: jest.fn(async () => '1'),
      // Mirrors the real signature: the trash is visible only when explicitly asked for.
      export: jest.fn(async (options = {}) => (options.includeTrashed ? [trashedRow] : [])),
    };
    const runner = createMigrationRunner({
      storage,
      readIndex: async () => [{ id: '4', title: 'Removed Source', firstAuthor: 'Smith' }],
      getFlag: async () => ({ done: false }),
      setFlag: async () => {},
    });

    const result = await runner.bestEffortImport();

    expect(storage.export).toHaveBeenCalledWith({ includeTrashed: true });
    expect(storage.add).not.toHaveBeenCalled();
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
  });
});

describe('an imported record arrives alive', () => {
  it('strips a deletedAt stamp carried in by a single add', async () => {
    await CitationStorage.add({
      ...makeCitation({ title: 'Restored' }),
      deletedAt: '2026-01-01T00:00:00.000Z',
    });

    expect((await CitationStorage.getAll()).map(c => c.title)).toEqual(['Restored']);
    expect(await CitationStorage.getTrashed()).toEqual([]);
  });
});
