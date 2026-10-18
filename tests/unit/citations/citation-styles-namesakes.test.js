/**
 * @jest-environment jsdom
 *
 * Different people who share a surname (STYLE-RULES.md, "Same surname, different people"). Who
 * counts is decided over the same reference list as the year letters: the collection the work is
 * filed in. Only the first author's surname is compared, as every style's rule is written.
 *
 * - APA 7 (§8.20): different initials → the first author's initials in every in-text citation,
 *   whatever the years; the same initials → the standard citation in text, and the given name in
 *   square brackets in the reference list: Smith, J. [Jane].
 * - MLA 9: the first initial in text, or the full first name when the initials also match.
 * - Chicago 17: an initial in text; the same initials in the same year → a short title.
 * - Harvard (Cite Them Right): initials in text when the same surname has works in the same year.
 */

import {
  formatReference,
  formatInText,
  formatBibliography,
  referenceSetFor,
} from '../../../src/features/citations/citation-styles/index.js';
import { checkReferences } from '../../../src/features/citations/reference-check.js';

const book = (id, authors, title, date = '2020', extra = {}) => ({
  id,
  type: 'book',
  authors,
  title,
  publisher: 'Pub',
  publicationDate: date,
  ...extra,
});

const JOHN = book('john', ['Smith, John'], 'Alpha');
const JANE = book('jane', ['Smith, Jane'], 'Beta');
const JANE_2021 = book('jane21', ['Smith, Jane'], 'Beta', '2021');
const MARY = book('mary', ['Smith, Mary'], 'Gamma');
const MARY_2021 = book('mary21', ['Smith, Mary'], 'Gamma', '2021');

const inText = (c, style, set, extra = {}) => formatInText(c, style, { set, ...extra });

describe('APA 7', () => {
  test('different initials: initials in text, same year or not', () => {
    expect(inText(JOHN, 'apa7', [JOHN, MARY])).toBe('(J. Smith, 2020)');
    expect(inText(MARY, 'apa7', [JOHN, MARY])).toBe('(M. Smith, 2020)');
    expect(inText(JOHN, 'apa7', [JOHN, MARY_2021])).toBe('(J. Smith, 2020)');
    expect(inText(MARY_2021, 'apa7', [JOHN, MARY_2021], { locator: '4' })).toBe(
      '(M. Smith, 2021, p. 4)'
    );
  });

  test('only the first author is given initials, and only a first-author namesake counts', () => {
    const coauthored = book('co', ['Smith, Mary', 'Doe, Ann'], 'Delta', '2021');
    expect(inText(coauthored, 'apa7', [JOHN, coauthored])).toBe('(M. Smith & Doe, 2021)');
    const second = book('second', ['Doe, Ann', 'Smith, Mary'], 'Delta', '2021');
    expect(inText(JOHN, 'apa7', [JOHN, second])).toBe('(Smith, 2020)');
  });

  test('same initials: the standard citation in text, the given name in brackets in the list', () => {
    expect(inText(JOHN, 'apa7', [JOHN, JANE])).toBe('(Smith, 2020)');
    expect(inText(JANE_2021, 'apa7', [JOHN, JANE_2021])).toBe('(Smith, 2021)');
    expect(formatReference(JANE, 'apa7', { set: [JOHN, JANE] })).toBe(
      'Smith, J. [Jane]. (2020). Beta. Pub.'
    );
    expect(formatBibliography([JOHN, JANE], 'apa7')).toBe(
      'Smith, J. [Jane]. (2020). Beta. Pub.\n\nSmith, J. [John]. (2020). Alpha. Pub.'
    );
  });

  test('no brackets for different initials, for one person, or with only an initial to give', () => {
    expect(formatReference(JOHN, 'apa7', { set: [JOHN, MARY] })).toBe(
      'Smith, J. (2020). Alpha. Pub.'
    );
    const alsoJohn = book('john2', ['John Smith'], 'Epsilon', '2019');
    expect(formatReference(JOHN, 'apa7', { set: [JOHN, alsoJohn] })).toBe(
      'Smith, J. (2020). Alpha. Pub.'
    );
    const initialOnly = book('ji', ['Smith, J.'], 'Zeta');
    expect(formatReference(initialOnly, 'apa7', { set: [JOHN, JANE, initialOnly] })).toBe(
      'Smith, J. (2020). Zeta. Pub.'
    );
  });

  test('alone in its list, a Smith is plain', () => {
    expect(formatInText(JOHN, 'apa7')).toBe('(Smith, 2020)');
    expect(formatReference(JOHN, 'apa7')).toBe('Smith, J. (2020). Alpha. Pub.');
  });
});

describe('MLA 9', () => {
  test('different first initials: the first initial', () => {
    expect(inText(JOHN, 'mla9', [JOHN, MARY], { locator: '45' })).toBe('(J. Smith 45)');
    expect(inText(MARY_2021, 'mla9', [JOHN, MARY_2021])).toBe('(M. Smith)');
  });

  test('the same first initial: the full first name', () => {
    expect(inText(JOHN, 'mla9', [JOHN, JANE], { locator: '45' })).toBe('(John Smith 45)');
    expect(inText(JANE_2021, 'mla9', [JOHN, JANE_2021])).toBe('(Jane Smith)');
  });

  test('the works-cited list is unchanged', () => {
    expect(formatBibliography([JOHN, JANE], 'mla9')).toBe(
      'Smith, Jane. Beta. Pub, 2020.\n\nSmith, John. Alpha. Pub, 2020.'
    );
  });
});

describe('Chicago 17 author-date', () => {
  test('different initials: an initial in text, same year or not', () => {
    expect(inText(JOHN, 'chicago17', [JOHN, MARY])).toBe('(J. Smith 2020)');
    expect(inText(MARY_2021, 'chicago17', [JOHN, MARY_2021], { locator: '4' })).toBe(
      '(M. Smith 2021, 4)'
    );
  });

  test('the same initials in the same year: a short title', () => {
    expect(inText(JOHN, 'chicago17', [JOHN, JANE])).toBe('(Smith, Alpha, 2020)');
    expect(inText(JANE, 'chicago17', [JOHN, JANE], { html: true })).toBe(
      '(Smith, <em>Beta</em>, 2020)'
    );
  });

  test('the same initials in different years: the year tells them apart', () => {
    expect(inText(JOHN, 'chicago17', [JOHN, JANE_2021])).toBe('(Smith 2020)');
    expect(inText(JANE_2021, 'chicago17', [JOHN, JANE_2021])).toBe('(Smith 2021)');
  });
});

describe('Harvard (Cite Them Right)', () => {
  test('same surname, same year: initials', () => {
    expect(inText(JOHN, 'harvard', [JOHN, MARY])).toBe('(Smith, J., 2020)');
    expect(inText(MARY, 'harvard', [JOHN, MARY], { locator: '12' })).toBe(
      '(Smith, M., 2020, p. 12)'
    );
  });

  test('different years: the year tells them apart', () => {
    expect(inText(JOHN, 'harvard', [JOHN, MARY_2021])).toBe('(Smith, 2020)');
  });
});

describe('the reference list decides who is a namesake', () => {
  test('a Smith in another collection changes nothing', () => {
    const pool = [
      { ...JOHN, projectId: 'essay-1' },
      { ...MARY, projectId: 'essay-2' },
    ];
    expect(formatInText(pool[0], 'apa7', { set: referenceSetFor(pool[0], pool) })).toBe(
      '(Smith, 2020)'
    );
  });

  test('a bibliography drawn from a pool uses each entry’s own collection', () => {
    const pool = [
      { ...JOHN, projectId: 'essay-1' },
      { ...JANE, projectId: 'essay-1' },
      { ...MARY, projectId: 'essay-2' },
    ];
    expect(formatBibliography([pool[0]], 'apa7', { pool })).toBe(
      'Smith, J. [John]. (2020). Alpha. Pub.'
    );
  });
});

describe('the essay checker reads every namesake form', () => {
  const essayCiting = (records, style) =>
    records
      .map(r => `A claim ${formatInText(r, style, { set: records, locator: '5' })}.`)
      .join(' ');

  test.each([
    ['apa7', [JOHN, MARY_2021]],
    ['mla9', [JOHN, MARY]],
    ['mla9', [JOHN, JANE]],
    ['chicago17', [JOHN, MARY_2021]],
    ['chicago17', [JOHN, JANE]],
    ['harvard', [JOHN, MARY]],
  ])('%s: each Smith is matched to their own work', (style, list) => {
    const result = checkReferences(essayCiting(list, style), list, style);
    expect(result.citedNotListed).toEqual([]);
    expect(result.listedNotCited).toEqual([]);
    expect(result.counts.matched).toBe(2);
  });

  test.each(['apa7', 'mla9', 'harvard', 'chicago17'])(
    '%s: citing only Mary Smith leaves John Smith reported as never cited',
    style => {
      const list = [JOHN, MARY];
      const essay = `A claim ${formatInText(MARY, style, { set: list, locator: '5' })}.`;
      const result = checkReferences(essay, list, style);
      expect(result.citedAndListed.map(m => m.citation.id)).toEqual(['mary']);
      expect(result.listedNotCited.map(c => c.id)).toEqual(['john']);
    }
  );
});
