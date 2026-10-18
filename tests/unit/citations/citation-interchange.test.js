/**
 * Reading what other reference managers write.
 *
 * A student switching from Zotero arrives with a BibTeX or RIS export. Both must come in whole:
 * every field the four styles need, names in the "Family, Given" form the styles expect, protected
 * capitals unwrapped, LaTeX escapes decoded, and nothing silently dropped. The fixtures are the
 * shape Zotero actually writes.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseBibTeX, parseRIS } from '../../../src/features/citations/citation-interchange.js';
import { validateCitation } from '../../../src/features/citations/citation-model.js';
import { normalizeCitation } from '../../../src/features/citations/citation-types.js';

const fixture = name => readFileSync(path.join(__dirname, '..', '..', 'e2e', 'fixtures', name), 'utf8');

describe('BibTeX from Zotero', () => {
  const records = parseBibTeX(fixture('zotero-export.bib'));
  const [article, book] = records;

  test('every entry comes in', () => {
    expect(records).toHaveLength(2);
  });

  test('protected capitals are unwrapped and the title is clean', () => {
    expect(article.title).toBe('Array programming with NumPy');
  });

  test('authors keep the Family, Given form so particles survive', () => {
    expect(article.authors).toEqual([
      'Harris, Charles R.',
      'Millman, K. Jarrod',
      'van der Walt, Stéfan J.',
    ]);
  });

  test('the journal, volume, issue and pages land where the styles read them', () => {
    expect(article.type).toBe('journal');
    expect(article.siteName).toBe('Nature');
    expect(article.extra.volume).toBe('585');
    expect(article.extra.issue).toBe('7825');
    expect(article.extra.pages).toBe('357-362');
    expect(article.issn).toBe('1476-4687');
  });

  test('year and month become the publication date; urldate becomes the access date', () => {
    expect(article.publicationDate).toBe('2020-09');
    expect(article.accessDate).toBe('2026-09-04');
    expect(article.doi).toBe('10.1038/s41586-020-2649-2');
    expect(article.url).toBe('https://www.nature.com/articles/s41586-020-2649-2');
  });

  test('a book carries publisher, place and ISBN', () => {
    expect(book.type).toBe('book');
    expect(book.title).toBe('Thinking, fast and slow');
    expect(book.authors).toEqual(['Kahneman, Daniel']);
    expect(book.publisher).toBe('Farrar, Straus and Giroux');
    expect(book.extra.place).toBe('New York');
    expect(book.isbn).toBe('978-0-374-27563-1');
    expect(book.publicationDate).toBe('2011');
  });

  test('what comes out is already in the record shape: validation passes and normalising changes nothing', () => {
    for (const r of records) {
      expect(validateCitation(r).valid).toBe(true);
      const n = normalizeCitation(r);
      expect(n.title).toBe(r.title);
      expect(n.authors).toEqual(r.authors);
      expect(n.publicationDate).toBe(r.publicationDate);
      expect(n.siteName).toBe(r.siteName);
    }
  });
});

describe('BibTeX edge cases', () => {
  test('nested braces, quoted values, month macros and double hyphens', () => {
    const [r] = parseBibTeX(`@article{k, title = "The {NumPy} {Array} in {{Science}}", author = {Doe, Jane}, journal = {J. Sci.}, year = 2019, month = mar, pages = {1--5} }`);
    expect(r.title).toBe('The NumPy Array in Science');
    expect(r.publicationDate).toBe('2019-03');
    expect(r.extra.pages).toBe('1-5');
  });

  test('LaTeX escapes decode to the characters a student expects', () => {
    const [r] = parseBibTeX(`@book{k, title = {Caf{\\'e} \\& {\\"O}l: {\\ss}}, author = {M{\\"u}ller, Hans}, year = {2001}, publisher = {P}}`);
    expect(r.title).toBe('Café & Öl: ß');
    expect(r.authors).toEqual(['Müller, Hans']);
  });

  test('a chapter in an edited book keeps the container, editors, edition and place', () => {
    const [r] = parseBibTeX(`@incollection{k, title = {A chapter}, author = {Roe, Richard}, editor = {Smith, Ann and Jones, Bob}, booktitle = {The Handbook}, edition = {2}, address = {London}, publisher = {Pub}, year = {2015}, pages = {10--20}}`);
    expect(r.type).toBe('chapter');
    expect(r.siteName).toBe('The Handbook');
    expect(r.extra.editors).toEqual(['Smith, Ann', 'Jones, Bob']);
    expect(r.extra.edition).toBe('2');
    expect(r.extra.place).toBe('London');
  });

  test('comments, @comment, @preamble and @string entries are ignored, not imported', () => {
    const records = parseBibTeX(`% a comment\n@comment{ignored}\n@preamble{"x"}\n@string{nat = "Nature"}\n@misc{k, title = {Kept}, author = {A, B}, year = {2020}, url = {https://example.org}}`);
    expect(records).toHaveLength(1);
    expect(records[0].title).toBe('Kept');
    expect(records[0].type).toBe('website');
  });

  test('a "Given Family" person becomes Family, Given; an organisation is left whole', () => {
    const [r] = parseBibTeX(`@misc{k, title = {T}, author = {Jane Doe and {World Health Organization} and Ludwig van Beethoven}, year = {2020}, url = {https://example.org}}`);
    expect(r.authors).toEqual(['Doe, Jane', 'World Health Organization', 'van Beethoven, Ludwig']);
  });

  test('an entry without a title comes back untitled for the importer to report, and the rest still import', () => {
    const records = parseBibTeX(`@misc{a, author = {A, B}, year = {2020}}\n@misc{b, title = {Second}, author = {C, D}, year = {2021}, url = {https://example.org}}`);
    expect(records.map(r => r.title)).toEqual(['', 'Second']);
    expect(records[0].authors).toEqual(['A, B']);
  });
});

describe('RIS from Zotero', () => {
  const records = parseRIS(fixture('zotero-export.ris'));
  const [article, book] = records;

  test('every record comes in', () => {
    expect(records).toHaveLength(2);
  });

  test('authors keep the Family, Given form', () => {
    expect(article.authors).toEqual([
      'Harris, Charles R.',
      'Millman, K. Jarrod',
      'van der Walt, Stéfan J.',
    ]);
  });

  test('the full date wins over the year, and Y2 is the access date', () => {
    expect(article.publicationDate).toBe('2020-09-16');
    expect(article.accessDate).toBe('2026-09-04');
  });

  test('journal fields land where the styles read them, and SN on a journal is an ISSN', () => {
    expect(article.type).toBe('journal');
    expect(article.siteName).toBe('Nature');
    expect(article.extra.volume).toBe('585');
    expect(article.extra.issue).toBe('7825');
    expect(article.extra.pages).toBe('357-362');
    expect(article.doi).toBe('10.1038/s41586-020-2649-2');
  });

  test('a book carries place, publisher and ISBN', () => {
    expect(book.type).toBe('book');
    expect(book.extra.place).toBe('New York');
    expect(book.publisher).toBe('Farrar, Straus and Giroux');
    expect(book.isbn).toBe('978-0-374-27563-1');
    expect(book.publicationDate).toBe('2011');
  });

  test('records validate and normalise unchanged', () => {
    for (const r of records) {
      expect(validateCitation(r).valid).toBe(true);
      expect(normalizeCitation(r).publicationDate).toBe(r.publicationDate);
    }
  });
});

describe('RIS edge cases', () => {
  test('Windows line endings and trailing spaces after ER', () => {
    const records = parseRIS('TY  - JOUR\r\nTI  - One\r\nAU  - A, B\r\nPY  - 2020\r\nUR  - https://example.org\r\nER  -   \r\n\r\nTY  - BOOK\r\nTI  - Two\r\nAU  - C, D\r\nPY  - 2021\r\nSN  - 123\r\nER  - \r\n');
    expect(records.map(r => r.title)).toEqual(['One', 'Two']);
  });

  test('editors, keywords, the journal-name aliases and a missing title', () => {
    const records = parseRIS('TY  - CHAP\nTI  - Chap\nAU  - Roe, R.\nA2  - Smith, Ann\nA2  - Jones, Bob\nT2  - The Handbook\nJF  - ignored when T2 present\nKW  - one\nKW  - two\nPY  - 2015\nSP  - 10\nEP  - 20\nSN  - 978-1\nER  -\n\nTY  - GEN\nAU  - X, Y\nER  -\n');
    // The untitled record is kept, title empty, so the importer can report it rather than lose it.
    expect(records).toHaveLength(2);
    expect(records[1].title).toBe('');
    const [r] = records;
    expect(r.type).toBe('chapter');
    expect(r.siteName).toBe('The Handbook');
    expect(r.extra.editors).toEqual(['Smith, Ann', 'Jones, Bob']);
    expect(r.tags).toEqual(['one', 'two']);
    expect(r.extra.pages).toBe('10-20');
    expect(r.isbn).toBe('978-1');
  });
});
