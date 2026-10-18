/**
 * @jest-environment jsdom
 */

import {
  exportAsJSON,
  exportAsCSV,
  exportAsBibTeX,
  exportAsRIS,
  looksLikeCSL,
  exportCitations,
} from '../../../src/features/citations/citation-export.js';
// The parsers live in citation-interchange.js; here they are the other half of a round-trip —
// what we write must be what we can read back.
import { parseBibTeX, parseRIS } from '../../../src/features/citations/citation-interchange.js';

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

    describe('a value with line breaks stays on its tag line', () => {
      // Zotero and EndNote read one tag per physical line; a stray line inside a value is either
      // dropped or read as garbage, so the rest of that field is lost from the record.
      const tagLine = /^[A-Z][A-Z0-9] {2}- /;
      const broken = 'first line\r\nsecond line\nthird line';
      const cases = [
        ['title', { title: broken }, 'TI'],
        ['notes', { notes: broken }, 'N1'],
        ['container', { journal: broken }, 'JO'],
        ['publisher', { publisher: broken }, 'PB'],
        ['place', { place: broken }, 'CY'],
        ['edition', { edition: broken }, 'ET'],
        ['author', { authors: ['Smith,\nJohn'] }, 'AU'],
        ['editor', { editors: ['Doe,\nJane'] }, 'A2'],
        ['tag', { tags: ['two\nlines'] }, 'KW'],
      ];

      test.each(cases)('%s', (_name, fields, tag) => {
        const result = exportAsRIS([{ type: 'book', title: 'A title', ...fields }]);
        const lines = result.split('\n');
        lines.forEach(line => expect(line).toMatch(tagLine));
        const value = lines.find(line => line.startsWith(`${tag}  - `));
        expect(value).not.toMatch(/[\r\n]/);
        expect(value).toMatch(/(first line second line third line|Smith, John|Doe, Jane|two lines)$/);
      });
    });
  });

  describe('BibTeX values with line breaks', () => {
    // A braced BibTeX value may legally span lines, so no text is lost; the round trip proves
    // that the note comes back whole.
    test('a multi-line note round-trips through the importer intact', () => {
      const bib = exportAsBibTeX([{ type: 'book', title: 'A title', notes: 'one\ntwo\n\nthree' }]);
      const [record] = parseBibTeX(bib);
      expect(record.notes.replace(/\s+/g, ' ')).toBe('one two three');
    });
  });

  describe('Round-trip export/import', () => {
    // A student who exports their library and re-imports it must get the same references back —
    // every field the styles read, not just the title. The parsers themselves are covered in
    // citation-interchange.test.js.
    const throughBibTeX = citation => parseBibTeX(exportAsBibTeX([citation]))[0];
    const throughRIS = citation => parseRIS(exportAsRIS([citation]))[0];

    const chapter = {
      title: 'Reading in the disciplines',
      authors: ['Roe, Richard'],
      type: 'chapter',
      publicationDate: '2015',
      publisher: 'Academic Press',
      siteName: 'The Handbook of Literacy',
      isbn: '978-0-00-000000-0',
      accessDate: '2026-09-04',
      extra: {
        editors: ['Smith, Ann', 'Jones, Bob'],
        edition: '2',
        place: 'London',
        pages: '10-20',
      },
    };

    const thesis = {
      title: 'Adaptive reading tools in higher education',
      authors: ['Ni Bhriain, Aoife'],
      type: 'thesis',
      publicationDate: '2021',
      url: 'https://example.edu/theses/42',
      accessDate: '2026-09-04',
      extra: {
        institution: 'University of Dublin',
        thesisType: "Master's thesis",
        place: 'Dublin',
      },
    };

    test('a journal article survives both formats whole', () => {
      for (const imported of [throughBibTeX(mockCitations[0]), throughRIS(mockCitations[0])]) {
        expect(imported.type).toBe('journal');
        expect(imported.title).toBe('Test Article Title');
        expect(imported.authors).toEqual(['Smith, John', 'Doe, Jane']);
        expect(imported.publicationDate).toBe('2024');
        expect(imported.siteName).toBe('Journal of Testing');
        expect(imported.extra.volume).toBe('15');
        expect(imported.extra.issue).toBe('3');
        expect(imported.extra.pages).toBe('100-120');
        expect(imported.doi).toBe('10.1234/test.123');
        expect(imported.tags).toEqual(['testing', 'research']);
        expect(imported.accessDate).toBe('2024-11-26');
      }
    });

    test('a chapter keeps its container, editors, edition and place', () => {
      for (const imported of [throughBibTeX(chapter), throughRIS(chapter)]) {
        expect(imported.type).toBe('chapter');
        expect(imported.title).toBe('Reading in the disciplines');
        expect(imported.siteName).toBe('The Handbook of Literacy');
        expect(imported.extra.editors).toEqual(['Smith, Ann', 'Jones, Bob']);
        expect(imported.extra.edition).toBe('2');
        expect(imported.extra.place).toBe('London');
        expect(imported.extra.pages).toBe('10-20');
        expect(imported.isbn).toBe('978-0-00-000000-0');
      }
    });

    test('a thesis keeps its degree and awarding institution', () => {
      for (const imported of [throughBibTeX(thesis), throughRIS(thesis)]) {
        expect(imported.type).toBe('thesis');
        expect(imported.authors).toEqual(['Ni Bhriain, Aoife']);
        expect(imported.publicationDate).toBe('2021');
        expect(imported.extra.institution).toBe('University of Dublin');
      }
      // Only BibTeX has a field for the degree; RIS states the institution alone.
      expect(throughBibTeX(thesis).extra.thesisType).toBe("Master's thesis");
      expect(throughBibTeX(thesis).extra.place).toBe('Dublin');
    });

    test('a month is not lost, and a year alone never gains an invented day', () => {
      const dated = { ...mockCitations[0], year: undefined, publicationDate: '2024-03' };
      expect(throughBibTeX(dated).publicationDate).toBe('2024-03');
      expect(throughRIS(dated).publicationDate).toBe('2024-03');
      expect(throughRIS(mockCitations[1]).publicationDate).toBe('2023');
    });

    test('the parsers are unshaken by empty and malformed files', () => {
      expect(parseRIS('')).toEqual([]);
      expect(parseBibTeX('')).toEqual([]);
      expect(parseBibTeX('not valid bibtex')).toEqual([]);
      expect(parseBibTeX('@article{key, title = {Test}')).toHaveLength(1);
      for (const input of ['random text', '@misc{}', '@article{key}']) {
        expect(parseBibTeX(input)).toEqual([]);
      }
    });
  });

});

describe('looksLikeCSL (CSL-vs-native import routing)', () => {
  it('detects a bare CSL array by capitalised keys / CSL-only fields', () => {
    expect(looksLikeCSL([{ type: 'article-journal', title: 'X', DOI: '10.1/x' }])).toBe(true);
    expect(looksLikeCSL([{ type: 'webpage', title: 'X', URL: 'https://x' }])).toBe(true);
    expect(looksLikeCSL([{ type: 'book', title: 'X', issued: { 'date-parts': [[2020]] } }])).toBe(
      true
    );
  });

  it('detects a CSL { items: [...] } wrapper and a single CSL item', () => {
    expect(looksLikeCSL({ items: [{ title: 'X', 'container-title': 'Journal' }] })).toBe(true);
    expect(looksLikeCSL({ title: 'X', 'assist:extras': { type: 'journal' } })).toBe(true);
  });

  it("does NOT match AssisT's native shape (lowercase doi/url, string authors)", () => {
    expect(looksLikeCSL([{ title: 'X', url: 'https://x', doi: '10.1/x', authors: ['Smith, J.'] }])).toBe(
      false
    );
    expect(looksLikeCSL({ citations: [{ title: 'X', url: 'https://x' }] })).toBe(false);
  });

  it('is false for empty / non-object input', () => {
    expect(looksLikeCSL([])).toBe(false);
    expect(looksLikeCSL(null)).toBe(false);
    expect(looksLikeCSL('nope')).toBe(false);
  });
});

describe('plain-text export', () => {
  beforeEach(() => {
    // downloadFile() needs an object-URL factory; jsdom has none.
    global.URL.createObjectURL = jest.fn(() => 'blob:test');
    global.URL.revokeObjectURL = jest.fn();
  });

  const written = () =>
    new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsText(global.URL.createObjectURL.mock.calls[0][0]);
    });

  const BOOK = {
    id: 'b1',
    type: 'book',
    title: 'A book',
    authors: ['Roe, Jane'],
    publisher: 'Pub House',
    publicationDate: '2020',
  };

  it('formats the bibliography in the style the student chose, not Harvard', async () => {
    await exportCitations('txt', [BOOK], 'apa7');
    expect(await written()).toBe('Roe, J. (2020). A book. Pub House.');
  });

  it('MLA and Chicago too', async () => {
    await exportCitations('txt', [BOOK], 'mla9');
    expect(await written()).toBe('Roe, Jane. A book. Pub House, 2020.');
    global.URL.createObjectURL.mockClear();
    await exportCitations('txt', [BOOK], 'chicago17');
    expect(await written()).toBe('Roe, Jane. 2020. A book. Pub House.');
  });
});
