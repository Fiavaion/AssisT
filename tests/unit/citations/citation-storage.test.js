/**
 * @jest-environment jsdom
 *
 * Unit tests for CitationStorage and ProjectStorage (Dexie / fake-indexeddb).
 *
 * fake-indexeddb/auto MUST be imported BEFORE the module under test so that
 * the global indexedDB shim is in place when Dexie initialises its database.
 */

import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {
  CitationStorage,
  ProjectStorage,
  openCitationDatabase,
  tokenizeRecord,
} from '../../../src/features/citations/citation-storage.js';
import { clearCitations } from './helpers/clear-citations.js';
import { TRASH_RETENTION_DAYS } from '../../../src/config/citation-messages.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let urlCounter = 0;

/** Build a minimal valid citation. Each call gets a unique URL. */
function makeCitation(overrides = {}) {
  urlCounter += 1;
  return {
    title: `Test Citation ${urlCounter}`,
    url: `https://example.test/${urlCounter}`,
    authors: ['Smith, J.'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Teardown — clear the citations table between every test so state is isolated.
// ---------------------------------------------------------------------------

afterEach(async () => {
  await clearCitations();
});

// ---------------------------------------------------------------------------
// CitationStorage
// ---------------------------------------------------------------------------

describe('CitationStorage', () => {
  // ── add / get round-trip ─────────────────────────────────────────────────

  describe('add() and get()', () => {
    test('add() returns a numeric-string id (not a UUID)', async () => {
      const id = await CitationStorage.add(makeCitation());

      // The returned value must be a string …
      expect(typeof id).toBe('string');
      // … whose round-trip through Number() is stable: String(Number(id)) === id.
      // This asserts Dexie assigned an auto-increment key, not the model's UUID.
      expect(String(Number(id))).toBe(id);
    });

    test('get(id) round-trips the stored title', async () => {
      const data = makeCitation({ title: 'Round-trip Title' });
      const id = await CitationStorage.add(data);

      const stored = await CitationStorage.get(id);

      expect(stored).not.toBeNull();
      expect(stored.title).toBe('Round-trip Title');
    });

    test('get() returns null for a non-existent id', async () => {
      const result = await CitationStorage.get('99999');
      expect(result).toBeNull();
    });

    test('add() strips the model UUID so Dexie owns the numeric key', async () => {
      const id = await CitationStorage.add(makeCitation());
      const stored = await CitationStorage.get(id);

      // The stored record's key (id field from Dexie) should equal the numeric id
      // returned by add(), not a UUID string like "xxxxxxxx-xxxx-4xxx-…".
      expect(stored.id).toBe(Number(id));
    });
  });

  // ── update / delete ──────────────────────────────────────────────────────

  describe('update()', () => {
    test('reflects changes when fetched after update', async () => {
      const id = await CitationStorage.add(makeCitation({ title: 'Original' }));
      await CitationStorage.update(id, { title: 'Updated' });

      const stored = await CitationStorage.get(id);
      expect(stored.title).toBe('Updated');
    });

    test('sets updatedAt to a later timestamp', async () => {
      const id = await CitationStorage.add(makeCitation());
      const before = await CitationStorage.get(id);
      const createdAt = before.updatedAt;

      // Small sleep to guarantee the timestamp advances.
      await new Promise(r => setTimeout(r, 10));
      await CitationStorage.update(id, { notes: 'changed' });

      const after = await CitationStorage.get(id);
      expect(after.updatedAt).toBeGreaterThan(createdAt);
    });

    test('throws when updating a non-existent id', async () => {
      await expect(CitationStorage.update('99999', { title: 'X' })).rejects.toThrow();
    });
  });

  describe('delete()', () => {
    test('get() returns null after delete()', async () => {
      const id = await CitationStorage.add(makeCitation());

      // Verify it exists first.
      expect(await CitationStorage.get(id)).not.toBeNull();

      await CitationStorage.delete(id);

      expect(await CitationStorage.get(id)).toBeNull();
    });
  });

  // ── getByURL / exists ────────────────────────────────────────────────────

  describe('getByURL()', () => {
    test('returns matching records for the given URL', async () => {
      const url = `https://unique-url.test/${Date.now()}`;
      await CitationStorage.add(makeCitation({ url }));

      const results = await CitationStorage.getByURL(url);

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].url).toBe(url);
    });

    test('returns an empty array for a URL that has no citations', async () => {
      const results = await CitationStorage.getByURL('https://never-added.test/nope');
      expect(results).toEqual([]);
    });
  });

  describe('exists()', () => {
    test('returns true when a citation with that URL exists', async () => {
      const url = `https://exists-check.test/${Date.now()}`;
      await CitationStorage.add(makeCitation({ url }));

      expect(await CitationStorage.exists(url)).toBe(true);
    });

    test('returns false when no citation with that URL exists', async () => {
      expect(await CitationStorage.exists('https://no-such-url.test/xyz')).toBe(false);
    });
  });

  // ── getAll / count ───────────────────────────────────────────────────────

  describe('getAll() and count()', () => {
    test('getAll() returns an array of all stored citations', async () => {
      await CitationStorage.add(makeCitation());
      await CitationStorage.add(makeCitation());

      const all = await CitationStorage.getAll();

      expect(Array.isArray(all)).toBe(true);
      expect(all.length).toBeGreaterThanOrEqual(2);
    });

    test('count() matches the number of stored records', async () => {
      await CitationStorage.add(makeCitation());
      await CitationStorage.add(makeCitation());
      await CitationStorage.add(makeCitation());

      const count = await CitationStorage.count();
      const all = await CitationStorage.getAll();

      expect(count).toBe(all.length);
    });

    test('getAll() returns empty array when store is empty', async () => {
      const all = await CitationStorage.getAll();
      expect(all).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// ProjectStorage
// ---------------------------------------------------------------------------

describe('ProjectStorage', () => {
  // We intentionally do NOT clear citations between project tests — the project
  // tests do not write citations so there is no cross-contamination.

  describe('create() and getAll()', () => {
    test('create() returns a numeric-string id', async () => {
      const id = await ProjectStorage.create('My Project');
      expect(typeof id).toBe('string');
      expect(String(Number(id))).toBe(id);
    });

    test('getAll() includes the created project', async () => {
      const id = await ProjectStorage.create('Research 101');
      const all = await ProjectStorage.getAll();

      const found = all.find(p => String(p.id) === id);
      expect(found).toBeDefined();
      expect(found.name).toBe('Research 101');
    });
  });

  describe('get()', () => {
    test('round-trips the name and description', async () => {
      const id = await ProjectStorage.create('BioPaper', 'Biology final');
      const project = await ProjectStorage.get(id);

      expect(project).not.toBeNull();
      expect(project.name).toBe('BioPaper');
      expect(project.description).toBe('Biology final');
    });

    test('returns null for a non-existent id', async () => {
      const result = await ProjectStorage.get('88888');
      expect(result).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// search() — index-backed token-prefix AND-match
// ---------------------------------------------------------------------------

describe('CitationStorage.search()', () => {
  test('finds by a title token prefix', async () => {
    await CitationStorage.add(makeCitation({ title: 'Working Memory and Dyslexia' }));
    await CitationStorage.add(makeCitation({ title: 'Unrelated Topic' }));

    const hits = await CitationStorage.search('memo');
    expect(hits).toHaveLength(1);
    expect(hits[0].title).toBe('Working Memory and Dyslexia');
  });

  test('finds by an author token prefix', async () => {
    await CitationStorage.add(makeCitation({ authors: ['Okonkwo, Amara'] }));

    const hits = await CitationStorage.search('okon');
    expect(hits.map(h => h.authors[0])).toContain('Okonkwo, Amara');
  });

  test('AND-matches every query token', async () => {
    await CitationStorage.add(makeCitation({ title: 'Working Memory in ADHD' }));
    await CitationStorage.add(makeCitation({ title: 'Working Alone' }));

    const hits = await CitationStorage.search('working memory');
    expect(hits).toHaveLength(1);
    expect(hits[0].title).toBe('Working Memory in ADHD');
  });

  test('returns [] for an empty or punctuation-only query', async () => {
    await CitationStorage.add(makeCitation());
    expect(await CitationStorage.search('   ')).toEqual([]);
    expect(await CitationStorage.search('!!!')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// v1 → v2 migration — backfills the searchTokens index on existing rows.
// Reproduces the production upgrade (same schema + tokenizeRecord) on a throwaway db, since the
// singleton opens fresh at v2 (so its upgrade callback never runs in tests).
// ---------------------------------------------------------------------------

describe('schema migration v1 → v2', () => {
  test('backfills searchTokens on a pre-existing row and makes it index-searchable', async () => {
    const name = `MigrationProbe_${Math.random().toString(36).slice(2)}`;

    // Phase 1 — open at v1 (no searchTokens index) and insert a legacy row.
    const v1 = new Dexie(name);
    v1.version(1).stores({ citations: '++id, url', projects: '++id, name' });
    await v1.open();
    await v1.table('citations').add({
      title: 'Legacy Source',
      authors: ['Brown, B.'],
      url: 'https://legacy.test/1',
      publisher: '',
      siteName: '',
      notes: '',
    });
    v1.close();

    // Phase 2 — reopen at v2 with the index + the same backfill the production class uses.
    const v2 = new Dexie(name);
    v2.version(1).stores({ citations: '++id, url', projects: '++id, name' });
    v2.version(2)
      .stores({ citations: '++id, url, *searchTokens', projects: '++id, name' })
      .upgrade(tx =>
        tx
          .table('citations')
          .toCollection()
          .modify(row => {
            row.searchTokens = tokenizeRecord(row);
          })
      );
    await v2.open();

    const row = await v2.table('citations').toCollection().first();
    expect(row.searchTokens).toEqual(expect.arrayContaining(['legacy', 'source', 'brown']));

    const hit = await v2.table('citations').where('searchTokens').startsWith('legac').first();
    expect(hit.title).toBe('Legacy Source');

    v2.close();
  });
});

// ---------------------------------------------------------------------------
// Trash (soft delete) — a Remove must never be final by accident.
// ---------------------------------------------------------------------------

describe('CitationStorage trash', () => {
  test('delete() hides the record from getAll() but keeps it in the trash', async () => {
    const id = await CitationStorage.add(makeCitation({ title: 'Doomed' }));

    await CitationStorage.delete(id);

    expect(await CitationStorage.getAll()).toHaveLength(0);
    const trashed = await CitationStorage.getTrashed();
    expect(trashed).toHaveLength(1);
    expect(trashed[0].title).toBe('Doomed');
    expect(typeof trashed[0].deletedAt).toBe('string');
    expect(Number.isNaN(Date.parse(trashed[0].deletedAt))).toBe(false);
  });

  test('getAll({ includeTrashed: true }) is the only read that sees the trash', async () => {
    const id = await CitationStorage.add(makeCitation({ title: 'Doomed' }));
    await CitationStorage.add(makeCitation({ title: 'Kept' }));
    await CitationStorage.delete(id);

    const all = await CitationStorage.getAll({ includeTrashed: true });
    expect(all.map(c => c.title).sort()).toEqual(['Doomed', 'Kept']);
  });

  test('a trashed record is invisible to every other read', async () => {
    const citation = makeCitation({ title: 'Hidden Source', tags: ['ghost'] });
    const id = await CitationStorage.add(citation);
    await CitationStorage.delete(id);

    expect(await CitationStorage.get(id)).toBeNull();
    expect(await CitationStorage.getByURL(citation.url)).toEqual([]);
    expect(await CitationStorage.exists(citation.url)).toBe(false);
    expect(await CitationStorage.search('Hidden')).toEqual([]);
    expect(await CitationStorage.getAllTags()).toEqual([]);
    expect(await CitationStorage.count()).toBe(0);
    expect(await CitationStorage.export()).toEqual([]);
  });

  test('a project filter never counts trashed records', async () => {
    const kept = await CitationStorage.add(makeCitation({ projectId: 'p1' }));
    const gone = await CitationStorage.add(makeCitation({ projectId: 'p1' }));
    await CitationStorage.delete(gone);

    expect(await ProjectStorage.getCitations('p1')).toHaveLength(1);
    expect(await ProjectStorage.countCitations('p1')).toBe(1);
    const filtered = await CitationStorage.getAll({ projectId: 'p1' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe(Number(kept));
  });

  test('restore() brings the record back into the library', async () => {
    const id = await CitationStorage.add(makeCitation({ title: 'Second Thoughts' }));
    await CitationStorage.delete(id);

    await CitationStorage.restore(id);

    const all = await CitationStorage.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe('Second Thoughts');
    expect(all[0].deletedAt).toBeNull();
    expect(await CitationStorage.getTrashed()).toEqual([]);
  });

  test('restore() puts the record back into the search index', async () => {
    const id = await CitationStorage.add(makeCitation({ title: 'Findable Again' }));
    await CitationStorage.delete(id);
    await CitationStorage.restore(id);

    const hits = await CitationStorage.search('Findable');
    expect(hits.map(c => c.title)).toEqual(['Findable Again']);
  });

  test('purge() deletes for good — nothing left to restore', async () => {
    const id = await CitationStorage.add(makeCitation());
    await CitationStorage.delete(id);

    await CitationStorage.purge(id);

    expect(await CitationStorage.getTrashed()).toEqual([]);
    expect(await CitationStorage.getAll({ includeTrashed: true })).toEqual([]);
  });

  test('emptyTrash() removes every trashed record and leaves the library alone', async () => {
    const a = await CitationStorage.add(makeCitation());
    const b = await CitationStorage.add(makeCitation());
    await CitationStorage.add(makeCitation({ title: 'Still Here' }));
    await CitationStorage.delete(a);
    await CitationStorage.delete(b);

    const purged = await CitationStorage.emptyTrash();

    expect(purged).toBe(2);
    expect(await CitationStorage.getTrashed()).toEqual([]);
    expect((await CitationStorage.getAll()).map(c => c.title)).toEqual(['Still Here']);
  });

  test('getTrashed() lists the most recently removed first', async () => {
    const first = await CitationStorage.add(makeCitation({ title: 'First out' }));
    const second = await CitationStorage.add(makeCitation({ title: 'Second out' }));
    await CitationStorage.delete(first);
    // The removal stamp has millisecond resolution; two deletes in the same tick would tie.
    await new Promise(resolve => setTimeout(resolve, 5));
    await CitationStorage.delete(second);

    expect((await CitationStorage.getTrashed()).map(c => c.title)).toEqual([
      'Second out',
      'First out',
    ]);
  });
});

describe('CitationStorage.purgeExpiredTrash()', () => {
  const DAY = 24 * 60 * 60 * 1000;

  /** Trash a record and report the exact moment it was removed. */
  async function trash(overrides = {}) {
    const id = await CitationStorage.add(makeCitation(overrides));
    await CitationStorage.delete(id);
    const row = (await CitationStorage.getTrashed()).find(c => String(c.id) === String(id));
    return Date.parse(row.deletedAt);
  }

  test('keeps a record removed exactly at the retention boundary', async () => {
    const removedAt = await trash();

    const purged = await CitationStorage.purgeExpiredTrash({
      now: removedAt + TRASH_RETENTION_DAYS * DAY,
    });

    expect(purged).toBe(0);
    expect(await CitationStorage.getTrashed()).toHaveLength(1);
  });

  test('purges a record removed one millisecond past the boundary', async () => {
    const removedAt = await trash();

    const purged = await CitationStorage.purgeExpiredTrash({
      now: removedAt + TRASH_RETENTION_DAYS * DAY + 1,
    });

    expect(purged).toBe(1);
    expect(await CitationStorage.getTrashed()).toEqual([]);
  });

  test('never touches live records or recently removed ones', async () => {
    await CitationStorage.add(makeCitation({ title: 'Live' }));
    const oldRemoval = await trash({ title: 'Long gone' });
    // Separate the two removals in time, so the cutoff can fall between them.
    await new Promise(resolve => setTimeout(resolve, 5));
    await trash({ title: 'Recently removed' });

    const purged = await CitationStorage.purgeExpiredTrash({
      now: oldRemoval + TRASH_RETENTION_DAYS * DAY + 1,
    });

    expect(purged).toBe(1);
    expect((await CitationStorage.getAll()).map(c => c.title)).toEqual(['Live']);
    expect((await CitationStorage.getTrashed()).map(c => c.title)).toEqual(['Recently removed']);
  });
});

// ---------------------------------------------------------------------------
// v2 → v3 migration — every existing row is live, and the record says so.
//
// Seeded as a REAL v2 database (the schema an install carried before the trash existed) and then
// opened through the production CitationDatabase, so what runs here is the upgrade a student's
// install will run — not a copy of it written out again in the test.
// ---------------------------------------------------------------------------

describe('schema migration v2 → v3', () => {
  /** The citations store exactly as v2 shipped it — no deletedAt index, no trash. */
  const V2_CITATIONS = '++id, url, *authors, publicationDate, projectId, *tags, createdAt';

  /** Seed a database at v2 holding one pre-trash row. */
  async function seedV2Database(name) {
    const v2 = new Dexie(name);
    v2.version(1).stores({
      citations: '++id, url, *authors, publicationDate, projectId, *tags, createdAt',
      projects: '++id, name, createdAt',
    });
    v2.version(2).stores({
      citations: `${V2_CITATIONS}, *searchTokens`,
      projects: '++id, name, createdAt',
    });
    await v2.open();
    await v2.table('citations').add({ title: 'Pre-trash', url: 'https://legacy.test/2' });
    v2.close();
  }

  test('the production upgrade backfills deletedAt and indexes it', async () => {
    const name = `TrashMigrationProbe_${Math.random().toString(36).slice(2)}`;
    await seedV2Database(name);

    const db = openCitationDatabase({ name });
    await db.open();

    const row = await db.citations.toCollection().first();
    expect(row.title).toBe('Pre-trash');
    expect(row.deletedAt).toBeNull();

    // The index is real, not just declared: this query is the one getTrashed() runs, and it
    // throws on an unindexed field.
    await db.citations.update(row.id, { deletedAt: '2026-09-01T10:00:00Z' });
    const trashed = await db.citations.where('deletedAt').above('').toArray();
    expect(trashed.map(c => c.title)).toEqual(['Pre-trash']);

    db.close();
  });

  test('re-opening runs no upgrade and leaves the row exactly as it was', async () => {
    const name = `TrashMigrationProbe_${Math.random().toString(36).slice(2)}`;
    await seedV2Database(name);

    const first = openCitationDatabase({ name });
    await first.open();
    const row = await first.citations.toCollection().first();
    first.close();

    const again = openCitationDatabase({ name });
    await again.open();
    expect(await again.citations.toCollection().first()).toEqual(row);
    again.close();
  });
});
