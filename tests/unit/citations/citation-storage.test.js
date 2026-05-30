/**
 * @jest-environment jsdom
 *
 * Unit tests for CitationStorage and ProjectStorage (Dexie / fake-indexeddb).
 *
 * fake-indexeddb/auto MUST be imported BEFORE the module under test so that
 * the global indexedDB shim is in place when Dexie initialises its database.
 */

import 'fake-indexeddb/auto';
import { CitationStorage, ProjectStorage } from '../../../src/features/citations/citation-storage.js';

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
  await CitationStorage.clear();
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
