/**
 * @jest-environment jsdom
 */

import {
  CitationType,
  CITATION_FIELD_KEYS,
  createCitation,
  validateCitation,
  formatAuthorHarvard,
  extractYear,
} from '../../../src/features/citations/citation-model.js';
import { assessCitation } from '../../../src/features/citations/reassurance-engine.js';

describe('Citation Model', () => {
  describe('createCitation', () => {
    test('should create citation with default values', () => {
      const citation = createCitation();

      expect(citation.id).toBeDefined();
      expect(citation.type).toBe(CitationType.WEBSITE);
      expect(citation.url).toBe('');
      expect(citation.title).toBe('');
      expect(citation.authors).toEqual([]);
      expect(citation.accessDate).toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(citation.createdAt).toBeGreaterThan(0);
    });

    test('should create citation with provided values', () => {
      const data = {
        title: 'Test Title',
        authors: ['Smith, J.'],
        url: 'https://example.com',
        type: CitationType.BOOK,
      };

      const citation = createCitation(data);

      expect(citation.title).toBe('Test Title');
      expect(citation.authors).toEqual(['Smith, J.']);
      expect(citation.url).toBe('https://example.com');
      expect(citation.type).toBe(CitationType.BOOK);
    });

    test('should generate unique IDs', () => {
      const citation1 = createCitation();
      const citation2 = createCitation();

      expect(citation1.id).not.toBe(citation2.id);
    });

    // The capture flow's whole point: the exact words a student highlighted, where they live, and
    // why they kept them. A hand-written field list in here dropped all three on the way in.
    test('keeps the quote, the locator and the note a capture supplied', () => {
      const citation = createCitation({
        title: 'Thinking, Fast and Slow',
        quote: 'The confidence people have in their beliefs is not a measure of quality.',
        locator: '402',
        notes: 'Backs up my point about overconfidence.',
      });

      expect(citation.quote).toBe(
        'The confidence people have in their beliefs is not a measure of quality.'
      );
      expect(citation.locator).toBe('402');
      expect(citation.notes).toBe('Backs up my point about overconfidence.');
    });

    test('carries every field of the schema, so nothing can be silently dropped', () => {
      const citation = createCitation({ title: 'T' });
      CITATION_FIELD_KEYS.forEach(key => {
        expect(citation[key]).toBeDefined();
      });
    });

    test('fills every schema field from the data it is given', () => {
      // One non-empty value per field, so a field missing from the copy shows up as a failure here
      // rather than as a lost detail in a student's library.
      const given = {
        type: 'book',
        url: 'https://example.com/x',
        title: 'A Book',
        authors: ['Okonkwo, A.'],
        publicationDate: '2019',
        accessDate: '2026-01-02',
        publisher: 'Pub House',
        siteName: 'Example',
        doi: '10.1234/x',
        isbn: '978-0-14-103805-8',
        issn: '1234-5678',
        quote: 'Exact words.',
        locator: 'p. 12',
        notes: 'My reason.',
        extra: { edition: '2nd' },
        tags: ['memory'],
        projectId: '3',
      };

      const citation = createCitation(given);

      CITATION_FIELD_KEYS.forEach(key => {
        expect(citation[key]).toEqual(given[key]);
      });
    });
  });

  describe('validateCitation', () => {
    test('should validate complete citation', () => {
      const citation = createCitation({
        title: 'Test Title',
        authors: ['Smith, J.'],
        url: 'https://example.com',
        publicationDate: '2019',
        accessDate: '2025-11-24',
      });

      const result = validateCitation(citation);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject citation without title', () => {
      const citation = createCitation({
        authors: ['Smith, J.'],
        url: 'https://example.com',
      });
      citation.title = '';

      const result = validateCitation(citation);

      expect(result.valid).toBe(false);
      expect(result.problems).toEqual([
        { field: 'title', message: expect.stringContaining('title') },
      ]);
    });

    test('a whitespace-only title is no title', () => {
      expect(validateCitation(createCitation({ title: '   ' })).valid).toBe(false);
    });

    // The blocker this rule was relaxed for: five of the ten source types vanished on save when a
    // student filled the wizard in the way the wizard invites. A printed book with a title and
    // nothing else is a source a student genuinely has, and refusing to store it lost it outright.
    test('stores a printed book with nothing but a title', () => {
      const citation = createCitation({ title: 'On Growth and Form', type: 'book' });

      expect(validateCitation(citation).valid).toBe(true);
    });

    test('stores a thesis, chapter or other source with no link and no author', () => {
      ['thesis', 'chapter', 'other', 'pdf'].forEach(type => {
        const citation = createCitation({ title: 'A source', type });
        expect(validateCitation(citation).valid).toBe(true);
      });
    });

    test('accepts a DOI-bearing article with no URL (Zotero-style import)', () => {
      const citation = createCitation({
        title: 'Working Memory',
        authors: ['Smith, J.'],
        doi: '10.1234/x',
      });
      citation.url = '';
      expect(validateCitation(citation).valid).toBe(true);
    });

    test('accepts an ISBN-bearing book with no URL', () => {
      const citation = createCitation({
        title: 'A Book',
        authors: ['Okonkwo, A.'],
        isbn: '978-0-13-468599-1',
      });
      citation.url = '';
      expect(validateCitation(citation).valid).toBe(true);
    });

    test('a missing author, link or year is not a refusal', () => {
      expect(
        validateCitation(createCitation({ title: 'Test', url: 'https://example.com' })).valid
      ).toBe(true);
      expect(
        validateCitation(createCitation({ title: 'Test', authors: ['Smith, J.'] })).valid
      ).toBe(true);
    });

    test('never throws on a malformed record', () => {
      expect(() => validateCitation({})).not.toThrow();
      expect(() => validateCitation(null)).not.toThrow();
      expect(validateCitation({ title: 'T', authors: undefined }).valid).toBe(true);
    });

    // Relaxing the rule must not lose the advice. The missing author, year and link are demoted
    // from refusals to the "worth a check" verdict that reassurance-engine.js already owns and the
    // wizard's CHECK step already shows — so they are checked THERE, not restated here.
    test('a missing author, year and link are still said, by the reassurance engine', () => {
      const { level, reasons } = assessCitation(
        createCitation({ title: 'A Borrowed Book', type: 'book' })
      );

      expect(level).toBe('amber');
      expect(reasons.map(r => r.field).sort()).toEqual(['author', 'link', 'year']);
    });

    // The access date is the day the student opened the page, not the year the source was
    // published: every formatter refuses it as a year and prints "no date", so a verdict that
    // accepted it said "looks complete" about a reference the student was about to hand in
    // undated. The publication year is now the only year assessCitation reads.
    test('a missing publication year is flagged even when an access date was recorded', () => {
      const withAccessDate = assessCitation(createCitation({ title: 'A Borrowed Book' }));
      expect(withAccessDate.reasons.map(r => r.field)).toContain('year');

      const undated = assessCitation({ ...createCitation({ title: 'A Book' }), accessDate: '' });
      expect(undated.reasons.map(r => r.field)).toContain('year');
    });
  });

  describe('formatAuthorHarvard', () => {
    test('should format "Last, First" format', () => {
      const formatted = formatAuthorHarvard('Smith, John');
      expect(formatted).toBe('Smith, J.');
    });

    test('should format "First Last" format', () => {
      const formatted = formatAuthorHarvard('John Smith');
      expect(formatted).toBe('Smith, J.');
    });

    test('should handle single name', () => {
      const formatted = formatAuthorHarvard('Organization');
      expect(formatted).toBe('Organization');
    });

    test('should uppercase initial', () => {
      const formatted = formatAuthorHarvard('smith, john');
      expect(formatted).toBe('smith, J.');
    });
  });

  describe('extractYear', () => {
    test('should extract year from ISO date', () => {
      const year = extractYear('2025-11-24');
      expect(year).toBe('2025');
    });

    test('should extract year from datetime', () => {
      const year = extractYear('2025-11-24T10:30:00Z');
      expect(year).toBe('2025');
    });

    test('should extract year from year-only string', () => {
      const year = extractYear('2025');
      expect(year).toBe('2025');
    });

    test('should handle empty string', () => {
      const year = extractYear('');
      expect(year).toBe('');
    });

    test('should handle invalid date', () => {
      const year = extractYear('invalid');
      expect(year).toBe('');
    });
  });

});
