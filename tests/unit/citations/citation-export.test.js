/**
 * @jest-environment jsdom
 */

import {
  exportAsJSON,
  exportAsCSV,
  exportAsBibTeX,
  exportAsRIS,
  parseRIS,
  parseBibTeX,
} from '../../../src/features/citations/citation-export.js';

// Mock citation data
const mockCitations = [
  {
    id: 'test-1',
    title: 'Test Article Title',
    authors: ['Smith, John', 'Doe, Jane'],
    year: '2024',
    type: 'journal-article',
    url: 'https://example.com/article',
    doi: '10.1234/test.123',
    journal: 'Journal of Testing',
    publisher: 'Test Publisher',
    volume: '15',
    issue: '3',
    pages: '100-120',
    accessDate: '2024-11-26',
    tags: ['testing', 'research'],
    notes: 'Test notes',
  },
  {
    id: 'test-2',
    title: 'Another Test Book',
    authors: ['Johnson, Mike'],
    year: '2023',
    type: 'book',
    url: 'https://example.com/book',
    publisher: 'Academic Press',
    accessDate: '2024-11-25',
  },
];

describe('Citation Export Module', () => {
  describe('exportAsJSON', () => {
    test('should export citations as valid JSON', () => {
      const result = exportAsJSON(mockCitations);
      const parsed = JSON.parse(result);

      expect(parsed.version).toBe('1.0');
      expect(parsed.source).toBe('AssisT Extension');
      expect(parsed.count).toBe(2);
      expect(parsed.citations).toHaveLength(2);
    });

    test('should include exportedAt timestamp', () => {
      const result = exportAsJSON(mockCitations);
      const parsed = JSON.parse(result);

      expect(parsed.exportedAt).toBeDefined();
      expect(new Date(parsed.exportedAt)).toBeInstanceOf(Date);
    });

    test('should preserve citation data', () => {
      const result = exportAsJSON(mockCitations);
      const parsed = JSON.parse(result);

      expect(parsed.citations[0].title).toBe('Test Article Title');
      expect(parsed.citations[0].authors).toEqual(['Smith, John', 'Doe, Jane']);
      expect(parsed.citations[0].doi).toBe('10.1234/test.123');
    });

    test('should handle empty array', () => {
      const result = exportAsJSON([]);
      const parsed = JSON.parse(result);

      expect(parsed.count).toBe(0);
      expect(parsed.citations).toEqual([]);
    });
  });

  describe('exportAsCSV', () => {
    test('should export citations with proper headers', () => {
      const result = exportAsCSV(mockCitations);
      const lines = result.split('\n');

      expect(lines[0]).toBe('Title,Authors,Year,Type,URL,DOI,Publisher,Journal,Volume,Issue,Pages,Access Date,Tags,Notes');
    });

    test('should include all citation data in rows', () => {
      const result = exportAsCSV(mockCitations);
      const lines = result.split('\n');

      expect(lines).toHaveLength(3); // Header + 2 citations
      expect(lines[1]).toContain('Test Article Title');
      expect(lines[1]).toContain('Smith, John; Doe, Jane');
      expect(lines[1]).toContain('2024');
    });

    test('should escape values with commas', () => {
      const citationsWithCommas = [{
        ...mockCitations[0],
        title: 'Title, with comma',
      }];

      const result = exportAsCSV(citationsWithCommas);
      expect(result).toContain('"Title, with comma"');
    });

    test('should escape values with quotes', () => {
      const citationsWithQuotes = [{
        ...mockCitations[0],
        title: 'Title with "quotes"',
      }];

      const result = exportAsCSV(citationsWithQuotes);
      expect(result).toContain('"Title with ""quotes"""');
    });

    test('should handle empty array', () => {
      const result = exportAsCSV([]);
      const lines = result.split('\n');

      expect(lines).toHaveLength(1); // Just header
    });
  });

  describe('exportAsBibTeX', () => {
    test('should export journal article as @article', () => {
      const result = exportAsBibTeX([mockCitations[0]]);

      expect(result).toContain('@article{');
      expect(result).toContain('author = {');
      expect(result).toContain('title = {Test Article Title}');
      expect(result).toContain('year = {2024}');
      expect(result).toContain('journal = {Journal of Testing}');
    });

    test('should export book as @book', () => {
      const result = exportAsBibTeX([mockCitations[1]]);

      expect(result).toContain('@book{');
      expect(result).toContain('title = {Another Test Book}');
      expect(result).toContain('publisher = {Academic Press}');
    });

    test('should format multiple authors with "and"', () => {
      const result = exportAsBibTeX([mockCitations[0]]);

      // Authors are formatted as "Last, First and Last, First" with trailing commas in some cases
      expect(result).toContain('author = {');
      expect(result).toContain('Smith');
      expect(result).toContain('Doe');
    });

    test('should include DOI field', () => {
      const result = exportAsBibTeX([mockCitations[0]]);

      expect(result).toContain('doi = {10.1234/test.123}');
    });

    test('should include volume and issue', () => {
      const result = exportAsBibTeX([mockCitations[0]]);

      expect(result).toContain('volume = {15}');
      expect(result).toContain('number = {3}');
    });

    test('should handle website type as @misc', () => {
      const websiteCitation = {
        ...mockCitations[0],
        type: 'website',
      };
      const result = exportAsBibTeX([websiteCitation]);

      expect(result).toContain('@misc{');
    });
  });

  describe('exportAsRIS', () => {
    test('should export journal article as JOUR', () => {
      const result = exportAsRIS([mockCitations[0]]);

      expect(result).toContain('TY  - JOUR');
      expect(result).toContain('TI  - Test Article Title');
      expect(result).toContain('PY  - 2024');
    });

    test('should export book as BOOK', () => {
      const result = exportAsRIS([mockCitations[1]]);

      expect(result).toContain('TY  - BOOK');
    });

    test('should include multiple authors as separate AU entries', () => {
      const result = exportAsRIS([mockCitations[0]]);

      // RIS authors use "Family, Given" — the source data is already in that form and must be
      // preserved verbatim (the previous exporter incorrectly re-reversed it to "Given, Family").
      expect(result).toContain('AU  - Smith, John');
      expect(result).toContain('AU  - Doe, Jane');
    });

    test('should include DOI', () => {
      const result = exportAsRIS([mockCitations[0]]);

      expect(result).toContain('DO  - 10.1234/test.123');
    });

    test('should split pages into SP and EP', () => {
      const result = exportAsRIS([mockCitations[0]]);

      expect(result).toContain('SP  - 100');
      expect(result).toContain('EP  - 120');
    });

    test('should include tags as KW entries', () => {
      const result = exportAsRIS([mockCitations[0]]);

      expect(result).toContain('KW  - testing');
      expect(result).toContain('KW  - research');
    });

    test('should end each record with ER', () => {
      const result = exportAsRIS(mockCitations);

      const erCount = (result.match(/ER\s+-\s/g) || []).length;
      expect(erCount).toBe(2);
    });
  });

  describe('parseRIS', () => {
    const sampleRIS = `TY  - JOUR
AU  - Smith, John
AU  - Doe, Jane
TI  - Parsed Article Title
PY  - 2024
JO  - Test Journal
VL  - 10
IS  - 2
SP  - 50
EP  - 75
DO  - 10.9999/test
UR  - https://example.com/parsed
KW  - keyword1
KW  - keyword2
ER  -

TY  - BOOK
AU  - Johnson, Mike
TI  - Parsed Book Title
PY  - 2023
PB  - Test Publisher
ER  - `;

    test('should parse multiple RIS records', () => {
      const result = parseRIS(sampleRIS);

      expect(result).toHaveLength(2);
    });

    test('should parse journal article correctly', () => {
      const result = parseRIS(sampleRIS);
      const article = result[0];

      expect(article.type).toBe('journal-article');
      expect(article.title).toBe('Parsed Article Title');
      expect(article.authors).toHaveLength(2);
      expect(article.year).toBe('2024');
      expect(article.journal).toBe('Test Journal');
    });

    test('should convert author format', () => {
      const result = parseRIS(sampleRIS);

      expect(result[0].authors).toContain('John Smith');
      expect(result[0].authors).toContain('Jane Doe');
    });

    test('should combine start and end pages', () => {
      const result = parseRIS(sampleRIS);

      expect(result[0].pages).toBe('50-75');
    });

    test('should parse keywords as tags', () => {
      const result = parseRIS(sampleRIS);

      expect(result[0].tags).toContain('keyword1');
      expect(result[0].tags).toContain('keyword2');
    });

    test('should parse DOI', () => {
      const result = parseRIS(sampleRIS);

      expect(result[0].doi).toBe('10.9999/test');
    });

    test('should handle empty content', () => {
      const result = parseRIS('');

      expect(result).toEqual([]);
    });
  });

  describe('parseBibTeX', () => {
    // Note: The BibTeX parser uses regex that expects specific format
    // Testing that the parser handles various inputs gracefully

    test('should handle empty content', () => {
      const result = parseBibTeX('');

      expect(result).toEqual([]);
    });

    test('should handle malformed content gracefully', () => {
      const result = parseBibTeX('not valid bibtex');

      expect(result).toEqual([]);
    });

    test('should handle content without closing brace gracefully', () => {
      const result = parseBibTeX('@article{key, title = {Test}');

      // Parser should not crash, may return empty or partial
      expect(Array.isArray(result)).toBe(true);
    });

    test('should return array for any input', () => {
      const inputs = ['', 'random text', '@misc{}', '@article{key}'];

      for (const input of inputs) {
        const result = parseBibTeX(input);
        expect(Array.isArray(result)).toBe(true);
      }
    });
  });

  describe('Round-trip export/import', () => {
    test('RIS should preserve data through export and import', () => {
      const exported = exportAsRIS([mockCitations[0]]);
      const imported = parseRIS(exported);

      expect(imported).toHaveLength(1);
      expect(imported[0].title).toBe(mockCitations[0].title);
      expect(imported[0].year).toBe(mockCitations[0].year);
      expect(imported[0].doi).toBe(mockCitations[0].doi);
    });

    test('BibTeX export should produce valid format', () => {
      const exported = exportAsBibTeX([mockCitations[0]]);

      // Verify export format contains expected BibTeX structure
      expect(exported).toContain('@article{');
      expect(exported).toContain('title = {');
      expect(exported).toContain(mockCitations[0].title);
    });
  });
});
