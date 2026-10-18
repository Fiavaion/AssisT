/**
 * @jest-environment jsdom
 *
 * Unit tests for the citation store migration (Phase 1).
 *
 * Two layers:
 *  1. Pure logic with in-memory fakes (storage / projection / flag) — fast, exhaustive.
 *  2. One integration test against the REAL CitationStorage on fake-indexeddb, proving recovered
 *     stubs pass real validation and actually persist.
 */

import 'fake-indexeddb/auto';
import {
  createMigrationRunner,
  buildRecoveredStub,
} from '../../../src/features/citations/citation-migration.js';
import { CitationStorage } from '../../../src/features/citations/citation-storage.js';
import { clearCitations } from './helpers/clear-citations.js';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

/** In-memory CitationStorage stand-in: tracks added records and exposes export(). */
function fakeStorage(initial = []) {
  const rows = [...initial];
  return {
    rows,
    add: jest.fn(async record => {
      // Mimic the real validation contract just enough to exercise the skip path.
      if (!record.title || !record.url || !record.authors?.length) {
        throw new Error('Invalid citation');
      }
      rows.push(record);
      return String(rows.length);
    }),
    export: jest.fn(async () => rows.map(r => ({ ...r }))),
  };
}

/** In-memory flag store. */
function fakeFlag(initial = null) {
  let value = initial;
  return {
    getFlag: jest.fn(async () => value),
    setFlag: jest.fn(async f => {
      value = f;
    }),
    get value() {
      return value;
    },
  };
}

const FIXED_NOW = 1_700_000_000_000;

function runner(over = {}) {
  const storage = over.storage || fakeStorage();
  const flag = over.flag || fakeFlag();
  const readIndex = over.readIndex || jest.fn(async () => []);
  const r = createMigrationRunner({
    storage,
    readIndex,
    getFlag: flag.getFlag,
    setFlag: flag.setFlag,
    now: () => FIXED_NOW,
  });
  return { r, storage, flag, readIndex };
}

// ---------------------------------------------------------------------------
// buildRecoveredStub
// ---------------------------------------------------------------------------

describe('buildRecoveredStub', () => {
  it('builds a review-flagged stub from a full projection row', () => {
    const stub = buildRecoveredStub({
      id: '12',
      title: 'Working Memory',
      firstAuthor: 'Okonkwo',
      year: '2021',
      assistType: 'journal',
      projectId: 'p1',
    });
    expect(stub).toMatchObject({
      type: 'journal',
      title: 'Working Memory',
      authors: ['Okonkwo'],
      publicationDate: '2021',
      projectId: 'p1',
      extra: { recovered: true, needsReview: true },
      tags: ['needs-review'],
    });
    expect(stub.url).toContain('recovered.invalid');
    expect(stub.notes).toMatch(/review/i);
  });

  it('stores no author when none is in the projection (never an "Anon." placeholder)', () => {
    const stub = buildRecoveredStub({ id: 1, title: 'X' });
    expect(stub.authors).toEqual([]);
    expect(stub.type).toBe('website');
  });

  it('returns null when there is no usable title (unrecoverable)', () => {
    expect(buildRecoveredStub({ id: 1, title: '   ' })).toBeNull();
    expect(buildRecoveredStub({ id: 2 })).toBeNull();
    expect(buildRecoveredStub(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getStatus
// ---------------------------------------------------------------------------

describe('getStatus', () => {
  it('reports not-done when the flag is absent', async () => {
    const { r } = runner();
    expect(await r.getStatus()).toEqual({ done: false, mode: null });
  });

  it('reports the recorded mode when done', async () => {
    const { r } = runner({ flag: fakeFlag({ done: true, mode: 'fresh' }) });
    expect(await r.getStatus()).toEqual({ done: true, mode: 'fresh' });
  });
});

// ---------------------------------------------------------------------------
// startFresh
// ---------------------------------------------------------------------------

describe('startFresh', () => {
  it('records completion and imports nothing', async () => {
    const { r, storage, flag } = runner();
    const result = await r.startFresh();
    expect(result).toEqual({ mode: 'fresh', imported: 0, skipped: 0 });
    expect(storage.add).not.toHaveBeenCalled();
    expect(flag.value).toEqual({ done: true, mode: 'fresh', at: FIXED_NOW });
  });
});

// ---------------------------------------------------------------------------
// bestEffortImport
// ---------------------------------------------------------------------------

describe('bestEffortImport', () => {
  it('reconstructs stubs from projection rows and records the count', async () => {
    const readIndex = jest.fn(async () => [
      { id: 1, title: 'Alpha', firstAuthor: 'A', year: '2020', assistType: 'journal' },
      { id: 2, title: 'Beta', firstAuthor: 'B', year: '2019', assistType: 'website' },
    ]);
    const { r, storage, flag } = runner({ readIndex });
    const result = await r.bestEffortImport();

    expect(result).toEqual({ mode: 'import', imported: 2, skipped: 0, total: 2 });
    expect(storage.add).toHaveBeenCalledTimes(2);
    expect(storage.rows.map(c => c.title)).toEqual(['Alpha', 'Beta']);
    expect(flag.value).toMatchObject({ done: true, mode: 'import', imported: 2, skipped: 0 });
  });

  it('skips rows already present in the canonical DB (dedupe by title)', async () => {
    const storage = fakeStorage([{ title: 'Alpha', url: 'https://a', authors: ['A'] }]);
    const readIndex = jest.fn(async () => [
      { id: 1, title: 'Alpha', firstAuthor: 'A' }, // dup of existing
      { id: 2, title: 'Gamma', firstAuthor: 'G' },
    ]);
    const { r } = runner({ storage, readIndex });
    const result = await r.bestEffortImport();
    expect(result).toMatchObject({ imported: 1, skipped: 1, total: 2 });
    expect(storage.rows.map(c => c.title).sort()).toEqual(['Alpha', 'Gamma']);
  });

  it('skips duplicate projection rows within the same run', async () => {
    const readIndex = jest.fn(async () => [
      { id: 1, title: 'Same', firstAuthor: 'A' },
      { id: 2, title: 'same', firstAuthor: 'B' }, // case-insensitive dup
    ]);
    const { r } = runner({ readIndex });
    const result = await r.bestEffortImport();
    expect(result).toMatchObject({ imported: 1, skipped: 1 });
  });

  it('counts unrecoverable (titleless) rows as skipped, not imported', async () => {
    const readIndex = jest.fn(async () => [
      { id: 1, title: '', firstAuthor: 'A' },
      { id: 2, title: 'Real', firstAuthor: 'B' },
    ]);
    const { r } = runner({ readIndex });
    const result = await r.bestEffortImport();
    expect(result).toMatchObject({ imported: 1, skipped: 1, total: 2 });
  });

  it('is idempotent — a second run imports nothing new', async () => {
    const readIndex = jest.fn(async () => [{ id: 1, title: 'Once', firstAuthor: 'A' }]);
    const { r, storage } = runner({ readIndex });
    await r.bestEffortImport();
    const second = await r.bestEffortImport();
    expect(second).toMatchObject({ imported: 0, skipped: 1 });
    expect(storage.add).toHaveBeenCalledTimes(1);
  });

  it('handles an empty projection cleanly', async () => {
    const { r } = runner();
    expect(await r.bestEffortImport()).toEqual({
      mode: 'import',
      imported: 0,
      skipped: 0,
      total: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// run() dispatch
// ---------------------------------------------------------------------------

describe('run', () => {
  it('routes fresh and import; throws on unknown mode', async () => {
    const { r } = runner();
    expect(await r.run('fresh')).toMatchObject({ mode: 'fresh' });
    expect(await r.run('import')).toMatchObject({ mode: 'import' });
    await expect(r.run('bogus')).rejects.toThrow(/Unknown migration mode/);
  });
});

// ---------------------------------------------------------------------------
// Integration — recovered stubs pass REAL validation and persist
// ---------------------------------------------------------------------------

describe('integration with real CitationStorage', () => {
  afterEach(async () => {
    await clearCitations();
  });

  it('imports projection stubs through real add()/validation and they persist', async () => {
    const flag = fakeFlag();
    const readIndex = jest.fn(async () => [
      { id: 101, title: 'Recovered One', firstAuthor: 'Lee', year: '2018', assistType: 'journal' },
      { id: 102, title: 'Recovered Two', year: '2017' }, // no author
    ]);
    const r = createMigrationRunner({
      storage: CitationStorage,
      readIndex,
      getFlag: flag.getFlag,
      setFlag: flag.setFlag,
    });

    const result = await r.bestEffortImport();
    expect(result).toMatchObject({ imported: 2, skipped: 0 });

    const all = await CitationStorage.getAll();
    expect(all).toHaveLength(2);
    const titles = all.map(c => c.title).sort();
    expect(titles).toEqual(['Recovered One', 'Recovered Two']);
    expect(all.every(c => c.extra?.needsReview === true)).toBe(true);
    expect(all.every(c => c.url.includes('recovered.invalid'))).toBe(true);
  });
});
