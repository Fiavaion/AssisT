/**
 * @jest-environment jsdom
 */

import {
  formatInText,
  formatReference,
  formatBibliography,
} from '../../../src/features/citations/citation-formatter.js';
import { createCitation, CitationType } from '../../../src/features/citations/citation-model.js';

describe('Citation Formatter (Harvard)', () => {
  describe('formatInText', () => {
    test('should format single author citation', () => {
      const citation = createCitation({
        authors: ['Smith, John'],
        publicationDate: '2025-11-24',
      });

      const inText = formatInText(citation);
      expect(inText).toBe('(Smith, 2025)');
    });

    test('should format two authors citation', () => {
      const citation = createCitation({
        authors: ['Smith, John', 'Doe, Jane'],
        publicationDate: '2025-11-24',
      });

      const inText = formatInText(citation);
      expect(inText).toBe('(Smith and Doe, 2025)');
    });

    test('should format three or more authors with et al.', () => {
      const citation = createCitation({
        authors: ['Smith, John', 'Doe, Jane', 'Johnson, Mike'],
        publicationDate: '2025-11-24',
      });

      const inText = formatInText(citation);
      expect(inText).toBe('(Smith et al., 2025)');
    });

    test('should handle Anon author', () => {
      const citation = createCitation({
        authors: [],
        publicationDate: '2025-11-24',
      });

      const inText = formatInText(citation);
      expect(inText).toBe('(Anon., 2025)');
    });

    test('should use access date if no publication date', () => {
      const citation = createCitation({
        authors: ['Smith, John'],
        accessDate: '2025-11-24',
      });

      const inText = formatInText(citation);
      expect(inText).toBe('(Smith, 2025)');
    });
  });

  describe('formatReference', () => {
    test('should format website reference', () => {
      const citation = createCitation({
        type: CitationType.WEBSITE,
        title: 'Test Website Title',
        authors: ['Smith, J.'],
        publicationDate: '2025-11-24',
        url: 'https://example.com',
        accessDate: '2025-11-24',
      });

      const reference = formatReference(citation);

      expect(reference).toContain('Smith, J.');
      expect(reference).toContain('(2025)');
      expect(reference).toContain('Test Website Title');
      expect(reference).toContain('Available at: https://example.com');
      expect(reference).toContain('(Accessed: 24 November 2025)');
    });

    test('should format book reference', () => {
      const citation = createCitation({
        type: CitationType.BOOK,
        title: 'Test Book',
        authors: ['Smith, J.'],
        publicationDate: '2025-11-24',
        publisher: 'Test Publisher',
      });

      const reference = formatReference(citation);

      expect(reference).toContain('Smith, J.');
      expect(reference).toContain('(2025)');
      expect(reference).toContain('Test Book');
      expect(reference).toContain('Test Publisher');
      expect(reference).not.toContain('Available at:');
    });

    test('should format journal article with DOI', () => {
      const citation = createCitation({
        type: CitationType.JOURNAL,
        title: 'Research Article',
        authors: ['Smith, J.', 'Doe, M.'],
        publicationDate: '2025-11-24',
        siteName: 'Journal of Testing',
        doi: '10.1234/test',
        extra: {
          volume: '15',
          issue: '3',
          pages: '123-145',
        },
      });

      const reference = formatReference(citation);

      expect(reference).toContain('Smith, J. and Doe, M.');
      expect(reference).toContain('(2025)');
      expect(reference).toContain("'Research Article'");
      expect(reference).toContain('Journal of Testing');
      expect(reference).toContain('15(3)');
      expect(reference).toContain('pp. 123-145');
      expect(reference).toContain('doi: 10.1234/test');
    });

    test('should format video reference', () => {
      const citation = createCitation({
        type: CitationType.VIDEO,
        title: 'Test Video',
        authors: ['Creator, C.'],
        publicationDate: '2025-11-24',
        url: 'https://youtube.com/watch?v=123',
        accessDate: '2025-11-24',
      });

      const reference = formatReference(citation);

      expect(reference).toContain('Creator, C.');
      expect(reference).toContain('Test Video [Video]');
      expect(reference).toContain('Available at:');
    });

    test('should format social media post', () => {
      const citation = createCitation({
        type: CitationType.SOCIAL_MEDIA,
        title: 'This is a test social media post with some content',
        authors: ['User, T.'],
        publicationDate: '2025-11-24',
        url: 'https://twitter.com/user/status/123',
        accessDate: '2025-11-24',
      });

      const reference = formatReference(citation);

      expect(reference).toContain('User, T.');
      expect(reference).toContain('[Twitter/X]');
      expect(reference).toContain('Available at:');
    });
  });

  describe('formatBibliography', () => {
    test('should sort citations alphabetically', () => {
      const citations = [
        createCitation({
          authors: ['Zebra, Z.'],
          title: 'Last Title',
          url: 'https://example.com',
          publicationDate: '2025-11-24',
        }),
        createCitation({
          authors: ['Apple, A.'],
          title: 'First Title',
          url: 'https://example.com',
          publicationDate: '2025-11-24',
        }),
        createCitation({
          authors: ['Middle, M.'],
          title: 'Middle Title',
          url: 'https://example.com',
          publicationDate: '2025-11-24',
        }),
      ];

      const bibliography = formatBibliography(citations);
      const lines = bibliography.split('\n\n');

      expect(lines[0]).toContain('Apple, A.');
      expect(lines[1]).toContain('Middle, M.');
      expect(lines[2]).toContain('Zebra, Z.');
    });

    test('should handle empty array', () => {
      const bibliography = formatBibliography([]);
      expect(bibliography).toBe('');
    });

    test('should format multiple citations with newlines', () => {
      const citations = [
        createCitation({
          authors: ['Smith, J.'],
          title: 'First',
          url: 'https://example.com',
          publicationDate: '2025-11-24',
        }),
        createCitation({
          authors: ['Doe, J.'],
          title: 'Second',
          url: 'https://example.com',
          publicationDate: '2025-11-24',
        }),
      ];

      const bibliography = formatBibliography(citations);
      expect(bibliography).toContain('\n\n');
      expect(bibliography.split('\n\n')).toHaveLength(2);
    });
  });

  describe('Edge Cases', () => {
    test('should handle missing publication date', () => {
      const citation = createCitation({
        authors: ['Smith, J.'],
        title: 'Test',
        url: 'https://example.com',
        accessDate: '2025-11-24',
        publicationDate: '',
      });

      const inText = formatInText(citation);
      expect(inText).toContain('2025');
    });

    test('should handle special characters in title', () => {
      const citation = createCitation({
        type: CitationType.WEBSITE,
        title: 'Test & Title: A Study',
        authors: ['Smith, J.'],
        url: 'https://example.com',
        publicationDate: '2025-11-24',
        accessDate: '2025-11-24',
      });

      const reference = formatReference(citation);
      expect(reference).toContain('Test & Title: A Study');
    });

    test('should handle URLs with special characters', () => {
      const citation = createCitation({
        type: CitationType.WEBSITE,
        title: 'Test',
        authors: ['Smith, J.'],
        url: 'https://example.com/path?query=value&other=123',
        publicationDate: '2025-11-24',
        accessDate: '2025-11-24',
      });

      const reference = formatReference(citation);
      expect(reference).toContain('https://example.com/path?query=value&other=123');
    });
  });
});
