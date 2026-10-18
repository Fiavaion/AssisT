/**
 * @jest-environment jsdom
 *
 * A page range the student gives as the locator of an in-text citation is printed the way that
 * style prints ranges in its reference list: an en dash everywhere, both numbers in APA and
 * Harvard, the second one shortened in MLA and Chicago. Anything that is not a plain numeric
 * range stays as the student typed it.
 */

import { formatInText } from '../../../src/features/citations/citation-styles/index.js';

const book = {
  type: 'book',
  authors: ['Morrison, Toni'],
  title: 'Beloved',
  publisher: 'Knopf',
  publicationDate: '1987',
};

describe('in-text page ranges', () => {
  test.each([
    ['apa7', '(Morrison, 1987, pp. 101–120)'],
    ['harvard', '(Morrison, 1987, pp. 101–120)'],
    ['mla9', '(Morrison 101–20)'],
    ['chicago17', '(Morrison 1987, 101–20)'],
  ])('%s prints 101-120 as its style does', (style, expected) => {
    expect(formatInText(book, style, { locator: '101-120' })).toBe(expected);
  });

  test('a locator that is not a plain range stays as typed', () => {
    expect(formatInText(book, 'mla9', { locator: 'e12-e19' })).toBe('(Morrison e12-e19)');
  });
});
