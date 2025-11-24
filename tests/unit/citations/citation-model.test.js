/**
 * @jest-environment jsdom
 */

import {
  CitationType,
  createCitation,
  validateCitation,
  detectCitationType,
  parseAuthors,
  formatAuthorHarvard,
  extractYear,
  createCitationKey,
} from '../../../src/features/citations/citation-model.js';

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
  });

  describe('validateCitation', () => {
    test('should validate complete citation', () => {
      const citation = createCitation({
        title: 'Test Title',
        authors: ['Smith, J.'],
        url: 'https://example.com',
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
      expect(result.errors).toContain('Title is required');
    });

    test('should reject citation without URL', () => {
      const citation = createCitation({
        title: 'Test',
        authors: ['Smith, J.'],
      });
      citation.url = '';

      const result = validateCitation(citation);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('URL is required');
    });

    test('should reject citation without authors', () => {
      const citation = createCitation({
        title: 'Test',
        url: 'https://example.com',
      });

      const result = validateCitation(citation);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one author is required (use "Anon." if unknown)');
    });
  });

  describe('detectCitationType', () => {
    test('should detect YouTube video', () => {
      const type = detectCitationType('https://www.youtube.com/watch?v=123', {});
      expect(type).toBe(CitationType.VIDEO);
    });

    test('should detect social media', () => {
      const type1 = detectCitationType('https://twitter.com/user/status/123', {});
      const type2 = detectCitationType('https://facebook.com/post/123', {});

      expect(type1).toBe(CitationType.SOCIAL_MEDIA);
      expect(type2).toBe(CitationType.SOCIAL_MEDIA);
    });

    test('should detect PDF', () => {
      const type = detectCitationType('https://example.com/document.pdf', {});
      expect(type).toBe(CitationType.PDF);
    });

    test('should detect book from JSON-LD', () => {
      const metadata = {
        jsonLD: { '@type': 'Book' },
      };
      const type = detectCitationType('https://example.com', metadata);
      expect(type).toBe(CitationType.BOOK);
    });

    test('should detect news article from JSON-LD', () => {
      const metadata = {
        jsonLD: { '@type': 'NewsArticle' },
      };
      const type = detectCitationType('https://example.com', metadata);
      expect(type).toBe(CitationType.NEWSPAPER);
    });

    test('should default to website', () => {
      const type = detectCitationType('https://example.com', {});
      expect(type).toBe(CitationType.WEBSITE);
    });
  });

  describe('parseAuthors', () => {
    test('should parse single author', () => {
      const authors = parseAuthors('Smith, John');
      expect(authors).toEqual(['Smith, John']);
    });

    test('should parse multiple authors with semicolon', () => {
      const authors = parseAuthors('Smith, John; Doe, Jane');
      expect(authors).toEqual(['Smith, John', 'Doe, Jane']);
    });

    test('should parse authors with "and"', () => {
      const authors = parseAuthors('Smith, John and Doe, Jane');
      expect(authors).toEqual(['Smith, John', 'Doe, Jane']);
    });

    test('should handle empty string', () => {
      const authors = parseAuthors('');
      expect(authors).toEqual([]);
    });

    test('should handle null', () => {
      const authors = parseAuthors(null);
      expect(authors).toEqual([]);
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

  describe('createCitationKey', () => {
    test('should create citation key with author and year', () => {
      const citation = createCitation({
        authors: ['Smith, John'],
        publicationDate: '2025-11-24',
        title: 'This is a test title',
      });

      const key = createCitationKey(citation);
      expect(key).toMatch(/^Smith2025-/);
    });

    test('should handle Anon author', () => {
      const citation = createCitation({
        authors: [],
        publicationDate: '2025-11-24',
        title: 'Test',
      });
      citation.authors = ['Anon.'];

      const key = createCitationKey(citation);
      expect(key).toMatch(/^Anon2025-/);
    });

    test('should truncate long titles', () => {
      const citation = createCitation({
        authors: ['Smith, John'],
        publicationDate: '2025-11-24',
        title: 'This is a very long title with many words that should be truncated',
      });

      const key = createCitationKey(citation);
      expect(key.length).toBeLessThan(50);
    });

    test('should use access date if no publication date', () => {
      const citation = createCitation({
        authors: ['Smith, John'],
        accessDate: '2025-11-24',
        title: 'Test',
      });

      const key = createCitationKey(citation);
      expect(key).toMatch(/^Smith2025-/);
    });
  });
});
