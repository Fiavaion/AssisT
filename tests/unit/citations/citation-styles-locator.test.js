/**
 * @jest-environment jsdom
 *
 * Locator (page-number) support in formatInText across the four citation styles.
 * `options.locator` is strictly additive: absent/empty locator must produce output
 * byte-identical to today's. Expected strings follow each style's documented rules:
 *   APA 7 / Harvard: (Smith, 2023, p. 24) — "p." single page, "pp." range.
 *   Chicago 17 author–date: (Smith 2023, 24) — bare number(s), no "p.".
 *   MLA 9: (Smith 24) — no year, no "p.".
 * Pre-labelled locators ("pp. 24-26", "para. 2", "chap. 3") and timestamps ("03:12")
 * pass through verbatim.
 */

import { formatInText } from '../../../src/features/citations/citation-styles/index.js';
import { formatLocator } from '../../../src/features/citations/citation-styles/shared.js';

const one = { type: 'journal', authors: ['Jane Smith'], publicationDate: '2023' };
const two = { type: 'journal', authors: ['Jane Smith', 'Ada Doe'], publicationDate: '2023' };
// No author: the title takes the author position in every style (STYLE-RULES.md, "No author").
const anon = { type: 'journal', title: 'Reading in class', authors: [], publicationDate: '2023' };

describe('formatLocator (shared helper)', () => {
  test('empty/undefined/null → empty string', () => {
    expect(formatLocator(undefined)).toBe('');
    expect(formatLocator(null)).toBe('');
    expect(formatLocator('')).toBe('');
    expect(formatLocator('   ')).toBe('');
  });
  test('bare number gets a page label when pageLabels is on', () => {
    expect(formatLocator('24', { pageLabels: true })).toBe('p. 24');
    expect(formatLocator(' 24 ', { pageLabels: true })).toBe('p. 24');
  });
  test('numeric range gets "pp."', () => {
    expect(formatLocator('24-26', { pageLabels: true })).toBe('pp. 24-26');
    expect(formatLocator('24–26', { pageLabels: true })).toBe('pp. 24–26');
  });
  test('without pageLabels, numbers stay bare', () => {
    expect(formatLocator('24')).toBe('24');
    expect(formatLocator('24-26')).toBe('24-26');
  });
  test('pre-labelled locators pass through verbatim', () => {
    expect(formatLocator('p. 24', { pageLabels: true })).toBe('p. 24');
    expect(formatLocator('pp. 3-4', { pageLabels: true })).toBe('pp. 3-4');
    expect(formatLocator('para. 2', { pageLabels: true })).toBe('para. 2');
    expect(formatLocator('chap. 3')).toBe('chap. 3');
    expect(formatLocator('03:12', { pageLabels: true })).toBe('03:12');
  });
  test('never throws on odd input', () => {
    expect(() => formatLocator(42)).not.toThrow();
    expect(() => formatLocator({})).not.toThrow();
    expect(formatLocator(42, { pageLabels: true })).toBe('p. 42');
  });
});

describe('APA 7 in-text locator', () => {
  test('single page', () => {
    expect(formatInText(one, 'apa7', { locator: '24' })).toBe('(Smith, 2023, p. 24)');
  });
  test('range', () => {
    expect(formatInText(one, 'apa7', { locator: '24-26' })).toBe('(Smith, 2023, pp. 24–26)');
  });
  test('pre-labelled passes through', () => {
    expect(formatInText(one, 'apa7', { locator: 'pp. 24-26' })).toBe('(Smith, 2023, pp. 24-26)');
    expect(formatInText(one, 'apa7', { locator: 'para. 2' })).toBe('(Smith, 2023, para. 2)');
  });
  test('timestamp passes through', () => {
    expect(formatInText(one, 'apa7', { locator: '03:12' })).toBe('(Smith, 2023, 03:12)');
  });
  test('absent/empty locator → unchanged', () => {
    expect(formatInText(one, 'apa7')).toBe('(Smith, 2023)');
    expect(formatInText(one, 'apa7', { locator: '' })).toBe('(Smith, 2023)');
    expect(formatInText(one, 'apa7', { locator: '  ' })).toBe('(Smith, 2023)');
  });
  test('no author + locator', () => {
    expect(formatInText(anon, 'apa7', { locator: '24' })).toBe('("Reading in Class," 2023, p. 24)');
  });
  test('two authors + locator', () => {
    expect(formatInText(two, 'apa7', { locator: '24' })).toBe('(Smith & Doe, 2023, p. 24)');
  });
});

describe('Harvard in-text locator', () => {
  test('single page', () => {
    expect(formatInText(one, 'harvard', { locator: '24' })).toBe('(Smith, 2023, p. 24)');
  });
  test('range', () => {
    expect(formatInText(one, 'harvard', { locator: '24-26' })).toBe('(Smith, 2023, pp. 24–26)');
  });
  test('pre-labelled passes through', () => {
    expect(formatInText(one, 'harvard', { locator: 'pp. 24-26' })).toBe('(Smith, 2023, pp. 24-26)');
  });
  test('timestamp passes through', () => {
    expect(formatInText(one, 'harvard', { locator: '03:12' })).toBe('(Smith, 2023, 03:12)');
  });
  test('absent/empty locator → unchanged', () => {
    expect(formatInText(one, 'harvard')).toBe('(Smith, 2023)');
    expect(formatInText(one, 'harvard', { locator: '' })).toBe('(Smith, 2023)');
  });
  test('no author + locator', () => {
    expect(formatInText(anon, 'harvard', { locator: '24' })).toBe('(Reading in class, 2023, p. 24)');
  });
  test('two authors + locator', () => {
    expect(formatInText(two, 'harvard', { locator: '24' })).toBe('(Smith and Doe, 2023, p. 24)');
  });
});

describe('Chicago 17 in-text locator', () => {
  test('single page — bare number, no "p."', () => {
    expect(formatInText(one, 'chicago17', { locator: '24' })).toBe('(Smith 2023, 24)');
  });
  test('range — bare numbers', () => {
    expect(formatInText(one, 'chicago17', { locator: '24-26' })).toBe('(Smith 2023, 24–26)');
  });
  test('non-numeric locator passes through after the comma', () => {
    expect(formatInText(one, 'chicago17', { locator: 'chap. 3' })).toBe('(Smith 2023, chap. 3)');
  });
  test('timestamp passes through', () => {
    expect(formatInText(one, 'chicago17', { locator: '03:12' })).toBe('(Smith 2023, 03:12)');
  });
  test('absent/empty locator → unchanged', () => {
    expect(formatInText(one, 'chicago17')).toBe('(Smith 2023)');
    expect(formatInText(one, 'chicago17', { locator: '' })).toBe('(Smith 2023)');
  });
  test('no author + locator', () => {
    expect(formatInText(anon, 'chicago17', { locator: '24' })).toBe('("Reading in class" 2023, 24)');
  });
  test('two authors + locator', () => {
    expect(formatInText(two, 'chicago17', { locator: '24' })).toBe('(Smith and Doe 2023, 24)');
  });
});

describe('MLA 9 in-text locator', () => {
  test('single page — bare number, no year, no "p."', () => {
    expect(formatInText(one, 'mla9', { locator: '24' })).toBe('(Smith 24)');
  });
  test('range — bare numbers', () => {
    expect(formatInText(one, 'mla9', { locator: '24-26' })).toBe('(Smith 24–26)');
  });
  test('pre-labelled passes through verbatim', () => {
    expect(formatInText(one, 'mla9', { locator: 'pp. 24-26' })).toBe('(Smith pp. 24-26)');
  });
  test('timestamp passes through', () => {
    expect(formatInText(one, 'mla9', { locator: '03:12' })).toBe('(Smith 03:12)');
  });
  test('absent/empty locator → no page, not even the article’s own page range', () => {
    expect(formatInText(one, 'mla9')).toBe('(Smith)');
    expect(formatInText(one, 'mla9', { locator: '' })).toBe('(Smith)');
    const withPages = { ...one, extra: { pages: '45-60' } };
    expect(formatInText(withPages, 'mla9')).toBe('(Smith)');
  });
  test('locator takes precedence over extra.pages (quote-specific page wins)', () => {
    const withPages = { ...one, extra: { pages: '45-60' } };
    expect(formatInText(withPages, 'mla9', { locator: '24' })).toBe('(Smith 24)');
  });
  test('no author + locator', () => {
    expect(formatInText(anon, 'mla9', { locator: '24' })).toBe('("Reading in class" 24)');
  });
  test('two authors + locator', () => {
    expect(formatInText(two, 'mla9', { locator: '24' })).toBe('(Smith and Doe 24)');
  });
});
