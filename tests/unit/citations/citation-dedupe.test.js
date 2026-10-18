/**
 * Duplicate-detection tests — citationKey signal priority, URL/DOI normalisation,
 * content fingerprinting, findDuplicateGroups, and dedupeCitations. Pure and
 * deterministic (no chrome, no AI).
 */

import {
  citationKey,
  findDuplicateGroups,
  dedupeCitations,
  MERGED_NOTES_SEPARATOR,
} from '../../../src/features/citations/citation-dedupe.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const base = {
  type: 'website',
  title: 'A Good Source',
  authors: ['Smith, J.'],
  publicationDate: '2021',
  url: 'https://example.com/article',
  accessDate: '2024-01-01',
};

const withDoi = { ...base, doi: '10.1000/xyz123' };
const withDoiUrl = { ...base, doi: 'https://doi.org/10.1000/xyz123' };

// ---------------------------------------------------------------------------
// citationKey — signal priority
// ---------------------------------------------------------------------------

describe('citationKey — DOI wins over URL and content', () => {
  it('returns a doi: key when DOI is present', () => {
    expect(citationKey(withDoi)).toBe('doi:10.1000/xyz123');
  });

  it('strips https://doi.org/ prefix before keying', () => {
    expect(citationKey(withDoiUrl)).toBe('doi:10.1000/xyz123');
  });

  it('strips http://doi.org/ prefix', () => {
    const c = { ...base, doi: 'http://doi.org/10.1000/xyz123' };
    expect(citationKey(c)).toBe('doi:10.1000/xyz123');
  });

  it('strips bare doi.org/ prefix', () => {
    const c = { ...base, doi: 'doi.org/10.1000/xyz123' };
    expect(citationKey(c)).toBe('doi:10.1000/xyz123');
  });

  it('doi: key is the same whether doi.org prefix is present or not', () => {
    expect(citationKey(withDoi)).toBe(citationKey(withDoiUrl));
  });

  it('falls through to URL when DOI is absent', () => {
    const k = citationKey(base);
    expect(k).toMatch(/^url:/);
  });

  it('falls through to content fingerprint when both DOI and URL are absent', () => {
    const c = { ...base, doi: undefined, url: '' };
    const k = citationKey(c);
    expect(k).toMatch(/^c:/);
  });
});

// ---------------------------------------------------------------------------
// citationKey — URL normalisation
// ---------------------------------------------------------------------------

describe('citationKey — URL normalisation', () => {
  it('removes trailing slash', () => {
    const a = { ...base, doi: undefined, url: 'https://example.com/article' };
    const b = { ...base, doi: undefined, url: 'https://example.com/article/' };
    expect(citationKey(a)).toBe(citationKey(b));
  });

  it('ignores querystring', () => {
    const a = { ...base, doi: undefined, url: 'https://example.com/article' };
    const b = { ...base, doi: undefined, url: 'https://example.com/article?ref=newsletter' };
    expect(citationKey(a)).toBe(citationKey(b));
  });

  it('ignores fragment/hash', () => {
    const a = { ...base, doi: undefined, url: 'https://example.com/article' };
    const b = { ...base, doi: undefined, url: 'https://example.com/article#section2' };
    expect(citationKey(a)).toBe(citationKey(b));
  });

  it('ignores URL case differences in host', () => {
    const a = { ...base, doi: undefined, url: 'https://Example.COM/article' };
    const b = { ...base, doi: undefined, url: 'https://example.com/article' };
    expect(citationKey(a)).toBe(citationKey(b));
  });

  it('falls back gracefully when URL is unparseable', () => {
    const c = { ...base, doi: undefined, url: 'not a valid url @@' };
    const k = citationKey(c);
    expect(k).toMatch(/^url:/);
    expect(k).toBe('url:not a valid url @@');
  });
});

// ---------------------------------------------------------------------------
// citationKey — content fingerprint
// ---------------------------------------------------------------------------

describe('citationKey — content fingerprint (no doi, no url)', () => {
  const noLink = { ...base, doi: undefined, url: '' };

  it('starts with c:', () => {
    expect(citationKey(noLink)).toMatch(/^c:/);
  });

  it('matches two records with same title, author, and year', () => {
    const a = { ...noLink };
    const b = { ...noLink, accessDate: '2023-12-31', notes: 'different note' };
    expect(citationKey(a)).toBe(citationKey(b));
  });

  it('different year produces a different key', () => {
    const a = { ...noLink, publicationDate: '2021' };
    const b = { ...noLink, publicationDate: '2022' };
    expect(citationKey(a)).not.toBe(citationKey(b));
  });

  it('collapses extra whitespace in title before keying', () => {
    const a = { ...noLink, title: 'A  Good   Source' };
    const b = { ...noLink, title: 'A Good Source' };
    expect(citationKey(a)).toBe(citationKey(b));
  });

  it('extracts family name before the comma for "Family, Given" authors', () => {
    const a = { ...noLink, authors: ['Smith, J.'] };
    const b = { ...noLink, authors: ['Smith, Jane'] };
    expect(citationKey(a)).toBe(citationKey(b));
  });

  it('uses the last word as family name when no comma ("Jane Smith")', () => {
    const a = { ...noLink, authors: ['Smith, J.'] };
    const b = { ...noLink, authors: ['Jane Smith'] };
    expect(citationKey(a)).toBe(citationKey(b));
  });

  it('handles missing authors gracefully', () => {
    const k = citationKey({ ...noLink, authors: [] });
    expect(k).toMatch(/^c:/);
    expect(k).toContain('||');
  });

  it('handles missing publicationDate gracefully (year becomes empty)', () => {
    const k = citationKey({ ...noLink, publicationDate: '' });
    expect(k).toMatch(/^c:/);
    expect(k).toContain('|');
  });

  it('extracts year from a full date string "2021-05-03"', () => {
    const a = { ...noLink, publicationDate: '2021' };
    const b = { ...noLink, publicationDate: '2021-05-03' };
    expect(citationKey(a)).toBe(citationKey(b));
  });
});

// ---------------------------------------------------------------------------
// findDuplicateGroups
// ---------------------------------------------------------------------------

describe('findDuplicateGroups', () => {
  it('returns an empty array for an empty input', () => {
    expect(findDuplicateGroups([])).toEqual([]);
  });

  it('returns an empty array when all citations are unique', () => {
    const a = { ...base, url: 'https://example.com/a' };
    const b = { ...base, url: 'https://example.com/b' };
    expect(findDuplicateGroups([a, b])).toEqual([]);
  });

  it('returns only groups with more than one member', () => {
    const a = { ...base, url: 'https://example.com/a' };
    const b = { ...base, url: 'https://example.com/a' }; // duplicate of a
    const c = { ...base, url: 'https://example.com/c' }; // singleton
    const groups = findDuplicateGroups([a, b, c]);
    expect(groups).toHaveLength(1);
    expect(groups[0].members).toHaveLength(2);
  });

  it('group members are in input order', () => {
    const a = { ...base, url: 'https://example.com/x', id: 'first' };
    const b = { ...base, url: 'https://example.com/x', id: 'second' };
    const groups = findDuplicateGroups([a, b]);
    expect(groups[0].members[0].id).toBe('first');
    expect(groups[0].members[1].id).toBe('second');
  });

  it('groups appear in the order of their first member', () => {
    const a1 = { ...base, url: 'https://example.com/a', id: 'a1' };
    const b1 = { ...base, url: 'https://example.com/b', id: 'b1' };
    const a2 = { ...base, url: 'https://example.com/a', id: 'a2' };
    const b2 = { ...base, url: 'https://example.com/b', id: 'b2' };
    const groups = findDuplicateGroups([a1, b1, a2, b2]);
    expect(groups).toHaveLength(2);
    expect(groups[0].members[0].id).toBe('a1');
    expect(groups[1].members[0].id).toBe('b1');
  });

  it('exposes the shared key on each group', () => {
    const a = { ...base, doi: '10.1/test' };
    const b = { ...base, doi: '10.1/test' };
    const groups = findDuplicateGroups([a, b]);
    expect(groups[0].key).toBe('doi:10.1/test');
  });
});

// ---------------------------------------------------------------------------
// dedupeCitations
// ---------------------------------------------------------------------------

describe('dedupeCitations', () => {
  it('returns empty kept, removed, merges and conflicts for empty input', () => {
    expect(dedupeCitations([])).toEqual({ kept: [], removed: [], merges: [], conflicts: [] });
  });

  it('keeps all when there are no duplicates', () => {
    const a = { ...base, url: 'https://example.com/a' };
    const b = { ...base, url: 'https://example.com/b' };
    const { kept, removed } = dedupeCitations([a, b]);
    expect(kept).toHaveLength(2);
    expect(removed).toHaveLength(0);
  });

  it('keeps the first occurrence and removes subsequent duplicates', () => {
    const a = { ...base, url: 'https://example.com/x', id: 'first' };
    const b = { ...base, url: 'https://example.com/x', id: 'second' };
    const c = { ...base, url: 'https://example.com/x', id: 'third' };
    const { kept, removed } = dedupeCitations([a, b, c]);
    expect(kept).toHaveLength(1);
    expect(kept[0].id).toBe('first');
    expect(removed).toHaveLength(2);
    expect(removed.map(r => r.id)).toEqual(['second', 'third']);
  });

  it('invariant: kept.length + removed.length === citations.length', () => {
    const citations = [
      { ...base, url: 'https://example.com/a' },
      { ...base, url: 'https://example.com/a' },
      { ...base, url: 'https://example.com/b' },
      { ...base, url: 'https://example.com/c' },
      { ...base, url: 'https://example.com/c' },
    ];
    const { kept, removed } = dedupeCitations(citations);
    expect(kept.length + removed.length).toBe(citations.length);
  });

  it('preserves relative order in kept', () => {
    const a = { ...base, url: 'https://example.com/a', id: 'a' };
    const b = { ...base, url: 'https://example.com/b', id: 'b' };
    const a2 = { ...base, url: 'https://example.com/a', id: 'a2' };
    const c = { ...base, url: 'https://example.com/c', id: 'c' };
    const { kept } = dedupeCitations([a, b, a2, c]);
    expect(kept.map(k => k.id)).toEqual(['a', 'b', 'c']);
  });

  it('preserves relative order in removed', () => {
    const a1 = { ...base, url: 'https://example.com/a', id: 'a1' };
    const a2 = { ...base, url: 'https://example.com/a', id: 'a2' };
    const b1 = { ...base, url: 'https://example.com/b', id: 'b1' };
    const b2 = { ...base, url: 'https://example.com/b', id: 'b2' };
    const { removed } = dedupeCitations([a1, a2, b1, b2]);
    expect(removed.map(r => r.id)).toEqual(['a2', 'b2']);
  });

  it('handles a single citation with no duplicates', () => {
    const { kept, removed } = dedupeCitations([base]);
    expect(kept).toHaveLength(1);
    expect(removed).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// dedupeCitations — the student's own work survives
// ---------------------------------------------------------------------------

describe('dedupeCitations — a copy carrying the student\'s work is never discarded', () => {
  const url = 'https://example.com/same';

  it('does not remove a later copy that holds a quote and locator the first lacks', () => {
    const first = { ...base, url, id: 'first' };
    const later = { ...base, url, id: 'later', quote: 'the exact words', locator: 'p. 24' };
    const { kept, removed, merges } = dedupeCitations([first, later]);
    expect(removed).toEqual([]);
    expect(kept.map(k => k.id)).toEqual(['first', 'later']);
    expect(merges).toHaveLength(1);
    expect(merges[0].citation.id).toBe('first');
    expect(merges[0].citation.quote).toBe('the exact words');
    expect(merges[0].citation.locator).toBe('p. 24');
    expect(merges[0].absorbed.map(c => c.id)).toEqual(['later']);
  });

  it('removes a later copy whose student data the first already holds', () => {
    const first = { ...base, url, id: 'first', quote: 'q', notes: 'n', tags: ['a', 'b'] };
    const later = { ...base, url, id: 'later', quote: ' q ', tags: ['b'] };
    const { kept, removed, merges, conflicts } = dedupeCitations([first, later]);
    expect(kept.map(k => k.id)).toEqual(['first']);
    expect(removed.map(r => r.id)).toEqual(['later']);
    expect(merges).toEqual([]);
    expect(conflicts).toEqual([]);
  });

  it('joins two different notes rather than choosing one', () => {
    const first = { ...base, url, id: 'first', notes: 'Useful for the intro.' };
    const later = { ...base, url, id: 'later', notes: 'Counter-argument on p. 9.' };
    const { merges, removed, conflicts } = dedupeCitations([first, later]);
    expect(removed).toEqual([]);
    expect(conflicts).toEqual([]);
    expect(merges[0].citation.notes).toContain('Useful for the intro.');
    expect(merges[0].citation.notes).toContain('Counter-argument on p. 9.');
  });

  it('leaves a note that itself contains a rule line as the student wrote it', () => {
    const first = { ...base, url, id: 'first', notes: 'Part one\n---\nPart two' };
    // The same whole note: a student's own rule line never splits it into pieces to compare.
    const later = { ...base, url, id: 'later', notes: 'Part one\n---\nPart two' };
    const other = { ...base, url, id: 'other', notes: 'Something new' };
    const { merges, removed } = dedupeCitations([first, later, other]);
    expect(removed.map(r => r.id)).toEqual(['later']);
    expect(merges[0].citation.notes).toBe('Part one\n---\nPart two\n\n---\n\nSomething new');
  });

  it('unions tags and takes a collection only one copy was filed in', () => {
    const first = { ...base, url, id: 'first', tags: ['method'], projectId: null };
    const later = { ...base, url, id: 'later', tags: ['method', 'ethics'], projectId: 'essay-1' };
    const { merges } = dedupeCitations([first, later]);
    expect(merges[0].citation.tags).toEqual(['method', 'ethics']);
    expect(merges[0].citation.projectId).toBe('essay-1');
  });

  it('keeps the first copy\'s metadata in the merged record', () => {
    const first = { ...base, url, id: 'first', title: 'First Title' };
    const later = { ...base, url, id: 'later', title: 'Later Title', notes: 'mine' };
    const { merges } = dedupeCitations([first, later]);
    expect(merges[0].citation.title).toBe('First Title');
    expect(merges[0].citation.notes).toBe('mine');
  });

  it('keeps a group apart when two copies hold different quotes', () => {
    const first = { ...base, url, id: 'first', quote: 'one passage' };
    const later = { ...base, url, id: 'later', quote: 'another passage' };
    const { kept, removed, merges, conflicts } = dedupeCitations([first, later]);
    expect(removed).toEqual([]);
    expect(merges).toEqual([]);
    expect(kept.map(k => k.id)).toEqual(['first', 'later']);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].fields).toEqual(['quote']);
    expect(conflicts[0].members.map(m => m.id)).toEqual(['first', 'later']);
  });

  it('keeps a group apart when the copies are filed in different collections', () => {
    const first = { ...base, url, id: 'first', projectId: 'essay-1' };
    const later = { ...base, url, id: 'later', projectId: 'essay-2' };
    const { removed, conflicts } = dedupeCitations([first, later]);
    expect(removed).toEqual([]);
    expect(conflicts[0].fields).toEqual(['projectId']);
  });

  it('holds kept + removed = input across a mixed library', () => {
    const citations = [
      { ...base, url: 'https://example.com/a', id: 'a1' },
      { ...base, url: 'https://example.com/a', id: 'a2' },
      { ...base, url: 'https://example.com/b', id: 'b1' },
      { ...base, url: 'https://example.com/b', id: 'b2', notes: 'mine' },
      { ...base, url: 'https://example.com/c', id: 'c1', quote: 'x' },
      { ...base, url: 'https://example.com/c', id: 'c2', quote: 'y' },
    ];
    const { kept, removed } = dedupeCitations(citations);
    expect(kept.length + removed.length).toBe(citations.length);
    expect(removed.map(r => r.id)).toEqual(['a2']);
  });
});

/**
 * Notes were compared as substrings, so a copy whose note happened to be part of the kept note
 * ("p. 4" inside "p. 45 argues …") counted as adding nothing and went to the trash with its note.
 * A note is now compared whole, against each note already merged in.
 */
describe('dedupeCitations — a note is compared whole, never as part of another', () => {
  const kept = { ...base, id: 'k', notes: 'p. 45 argues the opposite' };

  test('a shorter note that is only a substring is merged, not discarded', () => {
    const copy = { ...base, id: 'c', notes: 'p. 4' };
    const { removed, merges } = dedupeCitations([kept, copy]);
    expect(removed).toEqual([]);
    expect(merges).toHaveLength(1);
    expect(merges[0].citation.notes).toBe(`p. 45 argues the opposite${MERGED_NOTES_SEPARATOR}p. 4`);
  });

  test('the same note again adds nothing', () => {
    const copy = { ...base, id: 'c', notes: '  p. 45 argues the opposite ' };
    expect(dedupeCitations([kept, copy]).removed.map(r => r.id)).toEqual(['c']);
  });

  test('a note already merged in once is recognised as one of the notes', () => {
    const merged = { ...kept, notes: `p. 45 argues the opposite${MERGED_NOTES_SEPARATOR}p. 4` };
    const copy = { ...base, id: 'c', notes: 'p. 4' };
    expect(dedupeCitations([merged, copy]).removed.map(r => r.id)).toEqual(['c']);
  });
});
