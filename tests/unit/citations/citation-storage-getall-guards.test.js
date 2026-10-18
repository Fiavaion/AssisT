/**
 * @jest-environment jsdom
 *
 * Regression tests for CitationStorage.getAll() robustness against malformed records.
 *
 * Rows written by older builds (legacy data) never passed through normalizeCitation, so they can
 * lack `tags` or `title`. getAll() must not crash when filtering/sorting over them. The rows are
 * written straight into the database, as an older build left them, through a second handle on
 * the real schema.
 *
 * fake-indexeddb/auto MUST be imported BEFORE the module under test.
 */

import 'fake-indexeddb/auto';
import {
  CitationStorage,
  openCitationDatabase,
} from '../../../src/features/citations/citation-storage.js';
import { clearCitations } from './helpers/clear-citations.js';

/** A second handle on the same database, for writing rows exactly as given. */
const raw = openCitationDatabase();

/** Store rows as they are: no validation, no normalising, as a legacy build left them. */
const seedRaw = rows => raw.citations.bulkAdd(rows);

afterEach(async () => {
  await clearCitations();
});

describe('CitationStorage.getAll() — malformed-record guards', () => {
  test('tags filter does not crash when a record has no tags array', async () => {
    // Written as-is, so this record has no `tags` key at all.
    await seedRaw([
      { url: 'https://example.test/no-tags', title: 'No Tags', authors: ['Smith, J.'] },
    ]);

    await expect(CitationStorage.getAll({ tags: ['important'] })).resolves.toBeDefined();
  });

  test('sortBy:"title" does not crash when a record has a null/missing title', async () => {
    await seedRaw([
      { url: 'https://example.test/a', title: null, authors: ['Smith, J.'] },
      { url: 'https://example.test/b', authors: ['Jones, A.'] }, // title missing entirely
      { url: 'https://example.test/c', title: 'Has Title', authors: [] },
    ]);

    const result = await CitationStorage.getAll({ sortBy: 'title' });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(3);
  });

  test('sortBy:"author" does not crash when authors is missing or empty', async () => {
    await seedRaw([
      { url: 'https://example.test/x', title: 'X' }, // no authors
      { url: 'https://example.test/y', title: 'Y', authors: [] },
      { url: 'https://example.test/z', title: 'Z', authors: ['Adams, B.'] },
    ]);

    const result = await CitationStorage.getAll({ sortBy: 'author' });
    expect(result.length).toBe(3);
  });

  test('sortBy:"date" does not crash when both dates are missing', async () => {
    await seedRaw([
      { url: 'https://example.test/d1', title: 'D1' },
      { url: 'https://example.test/d2', title: 'D2', publicationDate: '2020-01-01' },
    ]);

    const result = await CitationStorage.getAll({ sortBy: 'date' });
    expect(result.length).toBe(2);
  });
});
