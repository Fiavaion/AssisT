/**
 * @jest-environment jsdom
 *
 * Unit tests for the four citation styles (Harvard, APA 7, MLA 9, Chicago 17) and the style
 * registry. Expected strings are the verified outputs of the formatter engine; these guard
 * against regressions in author grammar, n.d. handling, italics, and the Chicago tidy-up.
 */

import {
  formatReference,
  formatInText,
  formatBibliography,
  STYLES,
  DEFAULT_STYLE,
} from '../../../src/features/citations/citation-styles/index.js';

const journalFixture = {
  type: 'journal',
  authors: ['Smith, John Michael', 'Doe, Jane'],
  title: 'Learning at scale',
  siteName: 'Journal of EdTech',
  publicationDate: '2021-03-04',
  extra: { volume: '12', issue: '3', pages: '45-60' },
  doi: '10.1/x',
  url: 'https://doi.org/10.1/x',
  accessDate: '2025-11-24',
};

const websiteFixture = {
  type: 'webpage',
  authors: ['Jane Roe'],
  title: 'A page about cats',
  siteName: 'CatWorld',
  publicationDate: '2025-01-01',
  url: 'https://cats.example/page',
  accessDate: '2025-11-24',
};

const bookFixture = {
  type: 'book',
  authors: ['Adichie, Chimamanda Ngozi'],
  title: 'Half of a Yellow Sun',
  publisher: 'Knopf',
  publicationDate: '2006',
  extra: { place: 'New York' },
};

describe('reference output — journal across all styles', () => {
  test('Harvard', () => {
    expect(formatReference(journalFixture, 'harvard')).toBe(
      "Smith, J.M. and Doe, J. (2021) 'Learning at scale', Journal of EdTech, 12(3), pp. 45-60. doi: 10.1/x."
    );
  });
  test('APA 7', () => {
    expect(formatReference(journalFixture, 'apa7')).toBe(
      'Smith, J. M., & Doe, J. (2021). Learning at scale. Journal of EdTech, 12(3), 45-60. https://doi.org/10.1/x'
    );
  });
  test('MLA 9', () => {
    expect(formatReference(journalFixture, 'mla9')).toBe(
      'Smith, John Michael, and Jane Doe. "Learning at scale." Journal of EdTech, vol. 12, no. 3, 2021, pp. 45-60. 10.1/x.'
    );
  });
  test('Chicago 17', () => {
    expect(formatReference(journalFixture, 'chicago17')).toBe(
      'Smith, John Michael, and Jane Doe. 2021. "Learning at scale." Journal of EdTech 12 (3): 45-60. https://doi.org/10.1/x.'
    );
  });
});

describe('book place of publication', () => {
  test('Harvard includes "Place: Publisher"', () => {
    expect(formatReference(bookFixture, 'harvard')).toBe(
      'Adichie, C.N. (2006) Half of a Yellow Sun. New York: Knopf.'
    );
  });
  test('Chicago includes "Place: Publisher"', () => {
    expect(formatReference(bookFixture, 'chicago17')).toBe(
      'Adichie, Chimamanda Ngozi. 2006. Half of a Yellow Sun. New York: Knopf.'
    );
  });
});

describe('webpage type normalises and formats', () => {
  test('Harvard treats "webpage" as a website', () => {
    expect(formatReference(websiteFixture, 'harvard')).toBe(
      'Roe, J. (2025) A page about cats. Available at: https://cats.example/page (Accessed: 24 November 2025).'
    );
  });
});

describe('n.d. and missing-date handling', () => {
  const noDate = { type: 'website', authors: [], title: 'Mystery page', url: 'https://x.example' };

  test('Harvard in-text uses (Anon., n.d.)', () => {
    expect(formatInText(noDate, 'harvard')).toBe('(Anon., n.d.)');
  });
  test('Chicago in-text uses (Anon. n.d.) with no comma', () => {
    expect(formatInText(noDate, 'chicago17')).toBe('(Anon. n.d.)');
  });
  test('Chicago reference has no double period and a space before the URL', () => {
    const ref = formatReference(noDate, 'chicago17');
    expect(ref).not.toMatch(/\.\.(\s|$)/); // no "n.d.." style double period
    expect(ref).not.toMatch(/"https?:\/\//); // never a quote glued to a URL
    expect(ref).toBe('Anon. n.d. "Mystery page." https://x.example.');
  });
});

describe('in-text author grammar', () => {
  const one = { type: 'journal', authors: ['Smith, John'], publicationDate: '2020' };
  const two = { type: 'journal', authors: ['Smith, John', 'Doe, Jane'], publicationDate: '2020' };
  const three = {
    type: 'journal',
    authors: ['Smith, John', 'Doe, Jane', 'Lee, Chris'],
    publicationDate: '2020',
  };

  test('APA uses & and et al.', () => {
    expect(formatInText(one, 'apa7')).toBe('(Smith, 2020)');
    expect(formatInText(two, 'apa7')).toBe('(Smith & Doe, 2020)');
    expect(formatInText(three, 'apa7')).toBe('(Smith et al., 2020)');
  });
  test('Harvard uses "and" and et al.', () => {
    expect(formatInText(two, 'harvard')).toBe('(Smith and Doe, 2020)');
    expect(formatInText(three, 'harvard')).toBe('(Smith et al., 2020)');
  });
  test('Chicago omits the comma', () => {
    expect(formatInText(two, 'chicago17')).toBe('(Smith and Doe 2020)');
  });
});

describe('html option wraps italics', () => {
  test('APA journal: journal name and volume italicised', () => {
    const html = formatReference(journalFixture, 'apa7', { html: true });
    expect(html).toContain('<em>Journal of EdTech</em>');
    expect(html).toContain('<em>12</em>');
  });
  test('plain output contains no markup', () => {
    expect(formatReference(journalFixture, 'apa7')).not.toContain('<em>');
  });
});

describe('registry behaviour', () => {
  test('exposes four styles and a default', () => {
    expect(STYLES.map(s => s.id)).toEqual(['harvard', 'apa7', 'mla9', 'chicago17']);
    expect(DEFAULT_STYLE).toBe('harvard');
  });

  test('unknown style id falls back to the default (Harvard)', () => {
    expect(formatReference(journalFixture, 'does-not-exist')).toBe(
      formatReference(journalFixture, 'harvard')
    );
  });

  test('formatBibliography sorts by author family and joins with blank lines', () => {
    const list = [
      { type: 'book', authors: ['Young, Zoe'], title: 'Zed', publisher: 'P', publicationDate: '2001' },
      { type: 'book', authors: ['Adams, Amy'], title: 'Alpha', publisher: 'P', publicationDate: '2002' },
    ];
    const out = formatBibliography(list, 'harvard');
    expect(out.indexOf('Adams')).toBeLessThan(out.indexOf('Young'));
    expect(out).toContain('\n\n');
  });
});

describe('robustness — malformed records never throw', () => {
  const crashy = { type: undefined, title: null, authors: 'Org Name', url: '' };
  test.each(['harvard', 'apa7', 'mla9', 'chicago17'])('%s survives a crashy fixture', style => {
    expect(() => formatReference(crashy, style)).not.toThrow();
    expect(() => formatInText(crashy, style)).not.toThrow();
    expect(typeof formatReference(crashy, style)).toBe('string');
  });
});
