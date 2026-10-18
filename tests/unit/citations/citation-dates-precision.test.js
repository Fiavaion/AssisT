/**
 * @jest-environment jsdom
 *
 * A date prints with exactly the precision it was recorded with. A year known only as "2020" is
 * not 1 January 2020, and a month is not its first day: printing "1 Jan. 2020" tells the reader
 * something the student never claimed. Every style, every clause that prints a date.
 */

import { formatReference } from '../../../src/features/citations/citation-styles/index.js';
import { dateParts } from '../../../src/features/citations/citation-styles/shared.js';

const web = date => ({
  type: 'website',
  authors: ['Smith, John'],
  title: 'Page',
  siteName: 'Site',
  url: 'https://ex.org/p',
  publicationDate: date,
  accessDate: date,
});

const news = date => ({
  type: 'newspaper',
  authors: ['Smith, John'],
  title: 'Story',
  siteName: 'The Paper',
  url: 'https://ex.org/n',
  publicationDate: date,
  accessDate: '2024-05-06',
});

const video = date => ({
  type: 'video',
  authors: ['Smith, John'],
  title: 'Clip',
  siteName: 'YouTube',
  url: 'https://ex.org/v',
  publicationDate: date,
});

describe('dateParts keeps the precision it was given', () => {
  test('a year alone has no month and no day', () => {
    expect(dateParts('2020')).toEqual({ year: 2020, month: 0, day: 0, monthLong: '' });
  });
  test('a month and year has no day', () => {
    expect(dateParts('2020-03')).toEqual({ year: 2020, month: 3, day: 0, monthLong: 'March' });
    expect(dateParts('March 2020')).toEqual({ year: 2020, month: 3, day: 0, monthLong: 'March' });
  });
  test('a full date keeps its own day, whatever the time zone', () => {
    const full = { year: 2020, month: 3, day: 4, monthLong: 'March' };
    expect(dateParts('2020-03-04')).toEqual(full);
    expect(dateParts('2020-03-04T00:00:00Z')).toEqual(full);
    expect(dateParts('4 March 2020')).toEqual(full);
    expect(dateParts('March 4, 2020')).toEqual(full);
    expect(dateParts('2020 Mar 4')).toEqual(full);
  });
  test('nothing, or no year, is null', () => {
    expect(dateParts('')).toBeNull();
    expect(dateParts('someday')).toBeNull();
  });
});

describe('APA 7', () => {
  test('newspaper: (2020), (2020, March), (2020, March 4)', () => {
    expect(formatReference(news('2020'), 'apa7')).toBe(
      'Smith, J. (2020). Story. The Paper. https://ex.org/n'
    );
    expect(formatReference(news('2020-03'), 'apa7')).toBe(
      'Smith, J. (2020, March). Story. The Paper. https://ex.org/n'
    );
    expect(formatReference(news('2020-03-04'), 'apa7')).toBe(
      'Smith, J. (2020, March 4). Story. The Paper. https://ex.org/n'
    );
  });
});

describe('Harvard (Cite Them Right)', () => {
  test('web accessed date: the year, the month and year, or the full date', () => {
    expect(formatReference(web('2020'), 'harvard')).toBe(
      'Smith, J. (2020) Page. Available at: https://ex.org/p (Accessed: 2020).'
    );
    expect(formatReference(web('2020-03'), 'harvard')).toBe(
      'Smith, J. (2020) Page. Available at: https://ex.org/p (Accessed: March 2020).'
    );
    expect(formatReference(web('2020-03-04'), 'harvard')).toBe(
      'Smith, J. (2020) Page. Available at: https://ex.org/p (Accessed: 4 March 2020).'
    );
  });
  test('newspaper: no day or month is invented after the paper', () => {
    expect(formatReference(news('2020'), 'harvard')).toBe(
      "Smith, J. (2020) 'Story', The Paper. Available at: https://ex.org/n (Accessed: 6 May 2024)."
    );
    expect(formatReference(news('2020-03'), 'harvard')).toBe(
      "Smith, J. (2020) 'Story', The Paper, March. Available at: https://ex.org/n (Accessed: 6 May 2024)."
    );
    expect(formatReference(news('2020-03-04'), 'harvard')).toBe(
      "Smith, J. (2020) 'Story', The Paper, 4 March. Available at: https://ex.org/n (Accessed: 6 May 2024)."
    );
  });
});

describe('MLA 9', () => {
  test('web: publication and accessed dates at their own precision', () => {
    expect(formatReference(web('2020'), 'mla9')).toBe(
      'Smith, John. "Page." Site, 2020, https://ex.org/p. Accessed 2020.'
    );
    expect(formatReference(web('2020-03'), 'mla9')).toBe(
      'Smith, John. "Page." Site, Mar. 2020, https://ex.org/p. Accessed Mar. 2020.'
    );
    expect(formatReference(web('2020-03-04'), 'mla9')).toBe(
      'Smith, John. "Page." Site, 4 Mar. 2020, https://ex.org/p. Accessed 4 Mar. 2020.'
    );
  });
  test('newspaper and video', () => {
    expect(formatReference(news('2020'), 'mla9')).toBe(
      'Smith, John. "Story." The Paper, 2020, https://ex.org/n.'
    );
    expect(formatReference(news('June 2020'), 'mla9')).toBe(
      'Smith, John. "Story." The Paper, June 2020, https://ex.org/n.'
    );
    expect(formatReference(video('2020'), 'mla9')).toBe(
      'Smith, John. "Clip." YouTube, 2020, https://ex.org/v.'
    );
  });
});

describe('Chicago 17 author-date', () => {
  test('web publication date, and the accessed date only for an undated page', () => {
    expect(formatReference(web('2020'), 'chicago17')).toBe(
      'Smith, John. 2020. "Page." Site. https://ex.org/p.'
    );
    expect(formatReference(web('2020-03'), 'chicago17')).toBe(
      'Smith, John. 2020. "Page." Site. March 2020. https://ex.org/p.'
    );
    expect(formatReference(web('2020-03-04'), 'chicago17')).toBe(
      'Smith, John. 2020. "Page." Site. March 4, 2020. https://ex.org/p.'
    );
    const undated = accessed => ({ ...web(''), accessDate: accessed });
    expect(formatReference(undated('2020'), 'chicago17')).toBe(
      'Smith, John. n.d. "Page." Site. Accessed 2020. https://ex.org/p.'
    );
    expect(formatReference(undated('2020-03'), 'chicago17')).toBe(
      'Smith, John. n.d. "Page." Site. Accessed March 2020. https://ex.org/p.'
    );
  });
  test('newspaper: a year alone is not repeated after the paper', () => {
    expect(formatReference(news('2020'), 'chicago17')).toBe(
      'Smith, John. 2020. "Story." The Paper. https://ex.org/n.'
    );
    expect(formatReference(news('2020-03'), 'chicago17')).toBe(
      'Smith, John. 2020. "Story." The Paper, March 2020. https://ex.org/n.'
    );
    expect(formatReference(news('2020-03-04'), 'chicago17')).toBe(
      'Smith, John. 2020. "Story." The Paper, March 4, 2020. https://ex.org/n.'
    );
  });
});
