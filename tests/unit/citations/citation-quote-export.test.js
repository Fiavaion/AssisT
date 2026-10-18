/**
 * @jest-environment jsdom
 *
 * A student's captured quote and its page travel with the source into Zotero and EndNote.
 *
 * Every interchange format carries them as a note (RIS N1, BibTeX note, CSL-JSON note, the CSV
 * Notes column), after the student's own note, in words a reference manager shows as they are:
 *   Quote (p. 24): “The exact words.”
 * Reading our own file back turns that note into the quote and locator again, once — the note is
 * not left holding a second copy, so a re-import matches the record it came from.
 */

import {
  exportAsCSV,
  exportAsBibTeX,
  exportAsRIS,
} from '../../../src/features/citations/citation-export.js';
import { exportAsCSL, importFromCSL } from '../../../src/features/citations/citation-csl-io.js';
import { parseBibTeX, parseRIS } from '../../../src/features/citations/citation-interchange.js';
import { dedupeCitations } from '../../../src/features/citations/citation-dedupe.js';

const QUOTED = {
  id: 'q1',
  type: 'book',
  title: 'Thinking, Fast and Slow',
  authors: ['Kahneman, Daniel'],
  publisher: 'Penguin',
  publicationDate: '2011',
  quote: 'Nothing in life is as important as you think it is.',
  locator: '24',
  notes: 'Use in the introduction',
};

const QUOTE_NOTE = 'Quote (p. 24): “Nothing in life is as important as you think it is.”';

describe('the quote is written as a note', () => {
  test('RIS: its own N1 line after the student’s note', () => {
    const ris = exportAsRIS([QUOTED]);
    expect(ris).toContain('N1  - Use in the introduction');
    expect(ris).toContain(`N1  - ${QUOTE_NOTE}`);
  });
  test('BibTeX: in the note field', () => {
    const bib = exportAsBibTeX([QUOTED]);
    expect(bib).toMatch(/note = \{Use in the introduction\s+Quote \(p\. 24\): “Nothing in life/);
  });
  test('CSL-JSON: in the note field', () => {
    const [item] = JSON.parse(exportAsCSL([QUOTED]));
    expect(item.note).toBe(`Use in the introduction\n${QUOTE_NOTE}`);
  });
  test('CSV: in the Notes column', () => {
    const csv = exportAsCSV([QUOTED]);
    expect(csv).toContain(QUOTE_NOTE.replace(/"/g, '""'));
  });
  test('a quote with no locator says so without a page', () => {
    const ris = exportAsRIS([{ ...QUOTED, locator: '', notes: '' }]);
    expect(ris).toContain('N1  - Quote: “Nothing in life is as important as you think it is.”');
    expect(ris).not.toContain('N1  - \n');
  });
  test('a citation with no quote gains no note', () => {
    const ris = exportAsRIS([{ ...QUOTED, quote: '', locator: '' }]);
    expect(ris).not.toContain('Quote');
  });
});

describe('reading our own file back restores the quote once', () => {
  const expectRestored = record => {
    expect(record.quote).toBe(QUOTED.quote);
    expect(record.locator).toBe('24');
    expect(record.notes).toBe('Use in the introduction');
  };

  test('RIS', () => {
    expectRestored(parseRIS(exportAsRIS([QUOTED]))[0]);
  });
  test('BibTeX', () => {
    expectRestored(parseBibTeX(exportAsBibTeX([QUOTED]))[0]);
  });
  test('CSL-JSON', () => {
    expectRestored(importFromCSL(exportAsCSL([QUOTED]))[0]);
  });
  test('a page range and a labelled locator come back as they were typed', () => {
    for (const locator of ['24-26', 'para. 3', '03:12']) {
      const [back] = parseRIS(exportAsRIS([{ ...QUOTED, locator }]));
      expect(back.locator).toBe(locator);
    }
  });
  test('the re-imported copy is a clean duplicate of the original, not a conflicting one', () => {
    const [back] = parseRIS(exportAsRIS([QUOTED]));
    const copy = { ...back, id: 'q2' };
    const plan = dedupeCitations([QUOTED, copy]);
    expect(plan.conflicts).toEqual([]);
    expect(plan.merges).toEqual([]);
    expect(plan.removed).toEqual([copy]);
  });
  test('a foreign note that merely mentions a quote is left in the note', () => {
    const ris = 'TY  - BOOK\nTI  - A book\nN1  - Quote: this is how the author opens\nER  - \n';
    const [record] = parseRIS(ris);
    expect(record.quote || '').toBe('');
    expect(record.notes).toBe('Quote: this is how the author opens');
  });
});
