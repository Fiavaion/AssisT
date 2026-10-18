/**
 * citation-csl-io tests.
 *
 * Covers serialisation correctness, all three accepted input shapes, graceful skipping
 * of bad members, and the error path for un-parseable input.
 */

import { exportAsCSL, importFromCSL } from '../../../src/features/citations/citation-csl-io.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const JOURNAL = {
  type: 'journal',
  url: 'https://doi.org/10.1000/xyz',
  title: 'Working Memory in Dyslexia',
  authors: ['Smith, Jane', 'Doe, John'],
  publicationDate: '2021',
  accessDate: '2024-01-15',
  publisher: 'Elsevier',
  doi: '10.1000/xyz',
  issn: '1234-5678',
  extra: { volume: '12', issue: '3' },
  notes: 'key source',
  tags: ['memory', 'dyslexia'],
  projectId: 'p1',
  createdAt: 1700000000000,
  updatedAt: 1700000001000,
};

const WEBSITE = {
  type: 'website',
  url: 'https://example.com/article',
  title: 'Inclusive Design in Education',
  authors: ['Jones, Mark'],
  publicationDate: '2023-05-10',
  accessDate: '2024-03-01',
  siteName: 'Example Blog',
};

// ---------------------------------------------------------------------------
// exportAsCSL
// ---------------------------------------------------------------------------

describe('exportAsCSL', () => {
  it('returns "[]" for an empty array', () => {
    expect(exportAsCSL([])).toBe('[]');
  });

  it('returns "[]" for a non-array falsy value', () => {
    expect(exportAsCSL(null)).toBe('[]');
  });

  it('produces a valid JSON string parseable back to an array', () => {
    const out = exportAsCSL([JOURNAL, WEBSITE]);
    const parsed = JSON.parse(out);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
  });

  it('output length matches input length', () => {
    const out = exportAsCSL([JOURNAL]);
    expect(JSON.parse(out)).toHaveLength(1);
  });

  it('uses 2-space indentation (pretty-printed)', () => {
    const out = exportAsCSL([WEBSITE]);
    expect(out).toContain('\n  ');
  });
});

// ---------------------------------------------------------------------------
// importFromCSL — input shapes
// ---------------------------------------------------------------------------

describe('importFromCSL — accepted input shapes', () => {
  it('accepts a bare JSON array', () => {
    const cslArray = JSON.parse(exportAsCSL([JOURNAL]));
    const result = importFromCSL(JSON.stringify(cslArray));
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
  });

  it('accepts a single CSL item object', () => {
    const cslItem = JSON.parse(exportAsCSL([WEBSITE]))[0];
    const result = importFromCSL(JSON.stringify(cslItem));
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
  });

  it('accepts an {items:[...]} citation wrapper', () => {
    const cslItems = JSON.parse(exportAsCSL([JOURNAL, WEBSITE]));
    const wrapper = { items: cslItems };
    const result = importFromCSL(JSON.stringify(wrapper));
    expect(result).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// importFromCSL — skipping bad members
// ---------------------------------------------------------------------------

describe('importFromCSL — skipping non-object members', () => {
  it('skips non-object members but keeps valid ones', () => {
    const cslItem = JSON.parse(exportAsCSL([JOURNAL]))[0];
    const mixed = [null, 42, 'string', true, cslItem, cslItem];
    const result = importFromCSL(JSON.stringify(mixed));
    expect(result).toHaveLength(2);
  });

  it('returns an empty array when all members are non-objects', () => {
    const result = importFromCSL(JSON.stringify([null, 'foo', 99]));
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// importFromCSL — error path
// ---------------------------------------------------------------------------

describe('importFromCSL — error path', () => {
  it('throws /Invalid CSL-JSON/ when input is not valid JSON', () => {
    expect(() => importFromCSL('not json')).toThrow(/Invalid CSL-JSON/);
  });

  it('throws /Invalid CSL-JSON/ for a JSON primitive (number)', () => {
    expect(() => importFromCSL('42')).toThrow(/Invalid CSL-JSON/);
  });

  it('throws /Invalid CSL-JSON/ for a JSON primitive (boolean)', () => {
    expect(() => importFromCSL('true')).toThrow(/Invalid CSL-JSON/);
  });
});

// ---------------------------------------------------------------------------
// Round-trip
// ---------------------------------------------------------------------------

describe('round-trip: importFromCSL(exportAsCSL([cit]))', () => {
  it('preserves title, type, url, doi, and authors for a journal article', () => {
    const [result] = importFromCSL(exportAsCSL([JOURNAL]));
    expect(result.title).toBe(JOURNAL.title);
    expect(result.type).toBe(JOURNAL.type);
    expect(result.url).toBe(JOURNAL.url);
    expect(result.doi).toBe(JOURNAL.doi);
    expect(result.authors).toEqual(JOURNAL.authors);
  });

  it('preserves title, type, url, and authors for a website citation', () => {
    const [result] = importFromCSL(exportAsCSL([WEBSITE]));
    expect(result.title).toBe(WEBSITE.title);
    expect(result.type).toBe(WEBSITE.type);
    expect(result.url).toBe(WEBSITE.url);
    expect(result.authors).toEqual(WEBSITE.authors);
  });

  it('handles multiple citations in one round-trip', () => {
    const results = importFromCSL(exportAsCSL([JOURNAL, WEBSITE]));
    expect(results).toHaveLength(2);
    expect(results[0].title).toBe(JOURNAL.title);
    expect(results[1].title).toBe(WEBSITE.title);
  });
});
