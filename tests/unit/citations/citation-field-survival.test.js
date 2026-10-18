/**
 * @jest-environment jsdom
 *
 * Every field of the citation schema survives the whole round trip: add → get → update → get.
 *
 * This exists because it did not. The add path copied a hand-written list of fields that had never
 * been told about `quote` or `locator`, so the exact words a student highlighted — the point of the
 * capture flow, and what "Copy quote + citation" and "(Author, Year, p. X)" are built on — were
 * dropped on the way into the database, while an edit of the same record kept them. Anything that
 * only checks the fields it remembers to name would have passed then too, so this walks
 * CITATION_FIELD_KEYS instead: a field added to the schema and forgotten in a copy fails here.
 *
 * fake-indexeddb/auto MUST be imported before the module under test.
 */

import 'fake-indexeddb/auto';
import { CitationStorage } from '../../../src/features/citations/citation-storage.js';
import { clearCitations } from './helpers/clear-citations.js';
import { CITATION_FIELD_KEYS } from '../../../src/features/citations/citation-model.js';

/** One distinctive, non-empty value per schema field, so a dropped field cannot read as a default. */
const SAMPLE = Object.freeze({
  type: 'book',
  url: 'https://example.test/growth-and-form',
  title: 'On Growth and Form',
  authors: ['Thompson, D’Arcy'],
  publicationDate: '1917',
  accessDate: '2026-02-03',
  publisher: 'Cambridge University Press',
  siteName: 'Example Library',
  doi: '10.1234/growth',
  isbn: '978-0-521-43776-9',
  issn: '1234-5678',
  quote: 'Everything is what it is because it got that way.',
  locator: '402',
  notes: 'Backs up my point about form following process.',
  extra: { edition: '2nd', place: 'Cambridge' },
  tags: ['morphology', 'form'],
  projectId: '7',
});

/** A second, equally distinctive value per field, for the update leg. */
const EDITED = Object.freeze({
  type: 'chapter',
  url: 'https://example.test/edited',
  title: 'Drawing as thinking',
  authors: ['Roe, Richard', 'Okonkwo, Ada'],
  publicationDate: '2015',
  accessDate: '2026-03-04',
  publisher: 'Pub House',
  siteName: 'The Handbook of Art Education',
  doi: '10.1234/drawing',
  isbn: '978-0-14-103805-8',
  issn: '8765-4321',
  quote: 'The hand knows what the eye has not yet said.',
  locator: 'pp. 10-20',
  notes: 'Use for the chapter on tacit knowledge.',
  extra: { editors: ['Smith, Ann'], pages: '10-20' },
  tags: ['drawing'],
  projectId: '8',
});

afterEach(async () => {
  await clearCitations();
});

describe('the citation schema, end to end', () => {
  test('the samples cover every field the schema declares', () => {
    const keys = [...CITATION_FIELD_KEYS].sort();
    expect(Object.keys(SAMPLE).sort()).toEqual(keys);
    expect(Object.keys(EDITED).sort()).toEqual(keys);
  });

  test('every schema field survives add → get', async () => {
    const id = await CitationStorage.add(SAMPLE);
    const stored = await CitationStorage.get(id);

    CITATION_FIELD_KEYS.forEach(key => {
      expect(stored[key]).toEqual(SAMPLE[key]);
    });
  });

  test('every schema field survives add → get → update → get', async () => {
    const id = await CitationStorage.add(SAMPLE);
    await CitationStorage.update(id, EDITED);
    const stored = await CitationStorage.get(id);

    CITATION_FIELD_KEYS.forEach(key => {
      expect(stored[key]).toEqual(EDITED[key]);
    });
  });

  test('an update that touches one field leaves every other one alone', async () => {
    const id = await CitationStorage.add(SAMPLE);
    await CitationStorage.update(id, { title: 'On Growth and Form (revisited)' });
    const stored = await CitationStorage.get(id);

    expect(stored.title).toBe('On Growth and Form (revisited)');
    CITATION_FIELD_KEYS.filter(key => key !== 'title').forEach(key => {
      expect(stored[key]).toEqual(SAMPLE[key]);
    });
  });
});

describe('the quote and the locator a capture supplied', () => {
  test('a highlight saved with Alt+C keeps its exact words and its page', async () => {
    const id = await CitationStorage.add({
      title: 'Dyslexia',
      url: 'https://example.test/dyslexia',
      authors: ['Anon.'],
      quote: 'Dyslexia is a specific learning difficulty that mainly affects reading.',
      locator: '24',
    });

    const stored = await CitationStorage.get(id);
    expect(stored.quote).toBe(
      'Dyslexia is a specific learning difficulty that mainly affects reading.'
    );
    expect(stored.locator).toBe('24');
  });

  test('a source saved with no quote carries an empty one, never undefined', async () => {
    const id = await CitationStorage.add({ title: 'No quote', url: 'https://example.test/nq' });
    const stored = await CitationStorage.get(id);

    expect(stored.quote).toBe('');
    expect(stored.locator).toBe('');
  });
});

describe('what the store will and will not accept', () => {
  test('stores a printed book with a title and nothing else', async () => {
    const id = await CitationStorage.add({ title: 'A Borrowed Book', type: 'book' });
    const stored = await CitationStorage.get(id);

    expect(stored.title).toBe('A Borrowed Book');
    expect(stored.authors).toEqual([]);
    expect(stored.url).toBe('');
  });

  test('a record with no title is still refused — there would be nothing to find it by', async () => {
    await expect(CitationStorage.add({ url: 'https://example.test/untitled' })).rejects.toThrow(
      /title/i
    );
  });

  test('records stored before the rule was relaxed stay valid on edit', async () => {
    // A record from the old, stricter path: title + URL + author and nothing else.
    const id = await CitationStorage.add({
      title: 'Older record',
      url: 'https://example.test/older',
      authors: ['Smith, J.'],
    });

    await expect(CitationStorage.update(id, { notes: 'Still editable.' })).resolves.not.toThrow();
    expect((await CitationStorage.get(id)).notes).toBe('Still editable.');
  });
});
