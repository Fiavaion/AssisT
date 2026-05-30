/**
 * @jest-environment jsdom
 *
 * Unit tests for the citation type keystone. These pin the normalisation that converges the
 * four historical type vocabularies onto one canonical set — the root-cause fix for the
 * "everything formats as a website / export columns empty / credibility always 0.5" bugs.
 */

import {
  CITATION_TYPES,
  UI_TYPE_OPTIONS,
  normalizeType,
  normalizeCitation,
  getSourceTypeWeight,
  getBibTeXType,
  getRISType,
} from '../../../src/features/citations/citation-types.js';

describe('normalizeType', () => {
  test.each([
    ['webpage', 'website'],
    ['web-page', 'website'],
    ['report', 'website'],
    ['dataset', 'website'],
    ['bookSection', 'book'],
    ['book-chapter', 'book'],
    ['thesis', 'book'],
    ['journal-article', 'journal'],
    ['conferencePaper', 'journal'],
    ['conference-paper', 'journal'],
    ['proceedings-article', 'journal'],
    ['preprint', 'journal'],
    ['news-article', 'newspaper'],
    ['social-media', 'social_media'],
    ['social_media', 'social_media'],
    ['video', 'video'],
    ['pdf', 'pdf'],
    ['misc', 'other'],
  ])('maps "%s" -> "%s"', (input, expected) => {
    expect(normalizeType(input)).toBe(expected);
  });

  test('passes through already-canonical values', () => {
    Object.values(CITATION_TYPES).forEach(t => {
      expect(normalizeType(t)).toBe(t);
    });
  });

  test('defaults empty / unknown / nullish to website', () => {
    expect(normalizeType('')).toBe('website');
    expect(normalizeType(undefined)).toBe('website');
    expect(normalizeType(null)).toBe('website');
    expect(normalizeType('totally-made-up-type')).toBe('website');
  });

  test('every UI option value is canonical', () => {
    UI_TYPE_OPTIONS.forEach(opt => {
      expect(Object.values(CITATION_TYPES)).toContain(opt.value);
      expect(normalizeType(opt.value)).toBe(opt.value);
    });
  });
});

describe('normalizeCitation', () => {
  test('guarantees array shapes and string fields on a malformed record', () => {
    const out = normalizeCitation({ type: undefined, title: null, authors: 'Org Name', tags: null });
    expect(Array.isArray(out.authors)).toBe(true);
    expect(out.authors).toEqual(['Org Name']);
    expect(out.title).toBe('');
    expect(Array.isArray(out.tags)).toBe(true);
    expect(out.type).toBe('website');
    expect(out.extra).toBeDefined();
  });

  test('reconciles field aliases (savedAt, containerTitle, journal, flat journal fields, year)', () => {
    const out = normalizeCitation({
      type: 'journal-article',
      title: 'X',
      authors: ['Smith, John'],
      savedAt: 1234,
      containerTitle: 'Journal of Edge Cases',
      volume: '4',
      issue: '2',
      page: '10-20',
      year: 2019,
    });
    expect(out.createdAt).toBe(1234);
    expect(out.siteName).toBe('Journal of Edge Cases');
    expect(out.extra.volume).toBe('4');
    expect(out.extra.issue).toBe('2');
    expect(out.extra.pages).toBe('10-20');
    expect(out.publicationDate).toBe('2019');
    expect(out.type).toBe('journal');
  });

  test('collapses type to canonical but preserves the fine-grained subtype', () => {
    const out = normalizeCitation({ type: 'book-chapter', title: 'Chapter', authors: [] });
    expect(out.type).toBe('book');
    expect(out.extra.subtype).toBe('book-chapter');
  });

  test('is idempotent (excluding the createdAt default, which stabilises after first pass)', () => {
    const once = normalizeCitation({
      type: 'webpage',
      title: 'T',
      authors: ['A B'],
      url: 'https://e.x',
      createdAt: 999,
      id: 7,
      projectId: 3,
    });
    const twice = normalizeCitation(once);
    expect(twice).toEqual(once);
    expect(twice.id).toBe(7);
    expect(twice.projectId).toBe(3);
  });

  test('filters out empty author / tag entries', () => {
    const out = normalizeCitation({ authors: ['Smith, J', '', '   ', 5], tags: ['a', '', null] });
    expect(out.authors).toEqual(['Smith, J']);
    expect(out.tags).toEqual(['a']);
  });
});

describe('getSourceTypeWeight', () => {
  test('uses the preserved subtype when present', () => {
    expect(getSourceTypeWeight({ type: 'journal', extra: { subtype: 'journal-article' } })).toBe(1.0);
    expect(getSourceTypeWeight({ type: 'website', extra: { subtype: 'report' } })).toBe(0.8);
    expect(getSourceTypeWeight({ type: 'book', extra: { subtype: 'book-chapter' } })).toBe(0.9);
  });

  test('falls back to canonical weight without a subtype', () => {
    expect(getSourceTypeWeight({ type: 'journal' })).toBe(1.0);
    expect(getSourceTypeWeight({ type: 'website' })).toBe(0.5);
    expect(getSourceTypeWeight({ type: 'social_media' })).toBe(0.3);
  });

  test('returns a safe default for unknown input', () => {
    expect(getSourceTypeWeight({})).toBe(0.5);
    expect(getSourceTypeWeight(null)).toBe(0.5);
  });
});

describe('getBibTeXType / getRISType', () => {
  test('BibTeX honours subtype then canonical', () => {
    expect(getBibTeXType({ type: 'journal' })).toBe('article');
    expect(getBibTeXType({ type: 'book', extra: { subtype: 'book-chapter' } })).toBe('inbook');
    expect(getBibTeXType({ type: 'journal', extra: { subtype: 'conference-paper' } })).toBe('inproceedings');
    expect(getBibTeXType({ type: 'website' })).toBe('misc');
  });

  test('RIS honours subtype then canonical', () => {
    expect(getRISType({ type: 'journal' })).toBe('JOUR');
    expect(getRISType({ type: 'book', extra: { subtype: 'book-chapter' } })).toBe('CHAP');
    expect(getRISType({ type: 'website' })).toBe('ELEC');
    expect(getRISType({ type: 'newspaper' })).toBe('NEWS');
  });
});
