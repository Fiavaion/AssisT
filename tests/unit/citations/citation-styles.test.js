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
  // Cite Them Right gives a DOI as "Available at: https://doi.org/…" (STYLE-RULES.md, "DOI").
  test('Harvard', () => {
    expect(formatReference(journalFixture, 'harvard')).toBe(
      "Smith, J.M. and Doe, J. (2021) 'Learning at scale', Journal of EdTech, 12(3), pp. 45–60. Available at: https://doi.org/10.1/x."
    );
  });
  test('APA 7', () => {
    expect(formatReference(journalFixture, 'apa7')).toBe(
      'Smith, J. M., & Doe, J. (2021). Learning at scale. Journal of EdTech, 12(3), 45–60. https://doi.org/10.1/x'
    );
  });
  test('MLA 9', () => {
    // MLA 9 §5.93 gives a DOI as a link the reader can follow, not as a bare identifier.
    expect(formatReference(journalFixture, 'mla9')).toBe(
      'Smith, John Michael, and Jane Doe. "Learning at scale." Journal of EdTech, vol. 12, no. 3, 4 Mar. 2021, pp. 45–60, https://doi.org/10.1/x.'
    );
  });
  test('Chicago 17', () => {
    expect(formatReference(journalFixture, 'chicago17')).toBe(
      'Smith, John Michael, and Jane Doe. 2021. "Learning at scale." Journal of EdTech 12 (3): 45–60. https://doi.org/10.1/x.'
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

  // No author: the title stands in for it (STYLE-RULES.md); "Anon." is never printed.
  test('Harvard in-text uses (Title, no date) — Cite Them Right spells it out', () => {
    expect(formatInText(noDate, 'harvard')).toBe('(Mystery page, no date)');
  });
  test('Chicago in-text puts a comma before n.d.: ("Title," n.d.)', () => {
    expect(formatInText(noDate, 'chicago17')).toBe('("Mystery page," n.d.)');
  });
  test('Chicago reference has no double period and a space before the URL', () => {
    const ref = formatReference(noDate, 'chicago17');
    expect(ref).not.toMatch(/\.\.(\s|$)/); // no "n.d.." style double period
    expect(ref).not.toMatch(/"https?:\/\//); // never a quote glued to a URL
    expect(ref).toBe('"Mystery page." n.d. https://x.example.');
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
  test('Harvard (Cite Them Right) names up to three authors, and uses et al. from four', () => {
    const four = { ...three, authors: [...three.authors, 'Park, Min'] };
    expect(formatInText(two, 'harvard')).toBe('(Smith and Doe, 2020)');
    expect(formatInText(three, 'harvard')).toBe('(Smith, Doe and Lee, 2020)');
    expect(formatInText(three, 'harvard', { locator: '24' })).toBe('(Smith, Doe and Lee, 2020, p. 24)');
    expect(formatInText(four, 'harvard')).toBe('(Smith et al., 2020)');
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
    expect(STYLES.map(s => s.id)).toEqual([
      'harvard',
      'apa7',
      'mla9',
      'chicago17',
    ]);
    expect(DEFAULT_STYLE).toBe('harvard');
  });

  test('the two engines the picker never offered are gone, not hidden', () => {
    // Vancouver numbers references in order of first use and nothing here numbers them; OSCOLA is
    // a footnote style and there is no footnote surface. Kept callable by id, either would have
    // handed a student a reference list that is wrong in a way they cannot see. They are now
    // unknown ids like any other.
    expect(formatReference(journalFixture, 'vancouver')).toBe(
      formatReference(journalFixture, 'harvard')
    );
    expect(formatReference(journalFixture, 'oscola')).toBe(
      formatReference(journalFixture, 'harvard')
    );
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

/**
 * A generational suffix belongs to neither the given name nor the family name. Read as a family
 * name it produces "Jr., M." — an author no reader could look up.
 */
describe('generational suffixes', () => {
  const suffixed = {
    type: 'book',
    authors: ['King, Martin Luther, Jr.'],
    title: 'Why We Cant Wait',
    publisher: 'Harper',
    publicationDate: '1964',
  };
  const naturalOrder = { ...suffixed, authors: ['Martin Luther King Jr.'] };

  test('Harvard keeps the suffix after the initials', () => {
    expect(formatReference(suffixed, 'harvard')).toBe(
      'King, M.L., Jr. (1964) Why We Cant Wait. Harper.'
    );
  });

  test('APA 7 keeps the suffix after the initials', () => {
    expect(formatReference(suffixed, 'apa7')).toBe(
      'King, M. L., Jr. (1964). Why We Cant Wait. Harper.'
    );
  });

  test('MLA 9 keeps the suffix after the given name', () => {
    expect(formatReference(suffixed, 'mla9')).toBe(
      'King, Martin Luther, Jr. Why We Cant Wait. Harper, 1964.'
    );
  });

  test('Chicago 17 keeps the suffix after the given name', () => {
    expect(formatReference(suffixed, 'chicago17')).toBe(
      'King, Martin Luther, Jr. 1964. Why We Cant Wait. Harper.'
    );
  });

  test('a suffix written in natural order is never read as the family name', () => {
    ['harvard', 'apa7', 'mla9', 'chicago17'].forEach(style => {
      expect(formatReference(naturalOrder, style)).toContain('King');
      expect(formatReference(naturalOrder, style)).not.toMatch(/^Jr/);
      expect(formatInText(naturalOrder, style)).toContain('King');
    });
  });

  test('the in-text citation names the family only', () => {
    expect(formatInText(suffixed, 'harvard')).toBe('(King, 1964)');
    expect(formatInText(suffixed, 'chicago17')).toBe('(King 1964)');
  });

  test('a second author in natural order carries its suffix without a comma', () => {
    const two = { ...suffixed, authors: ['Smith, Ann', 'Sammy Davis Jr'] };
    expect(formatReference(two, 'mla9')).toContain('Smith, Ann, and Sammy Davis Jr.');
    expect(formatReference(two, 'chicago17')).toContain('Smith, Ann, and Sammy Davis Jr.');
  });
});

/**
 * A newspaper article the student read in print has a page number, and every style prints it —
 * the wizard now asks for it, so losing it in the reference would be a mark lost for nothing.
 */
describe('newspaper page numbers', () => {
  const printEdition = {
    type: 'newspaper',
    authors: ['Doyle, Maria'],
    title: 'Students trial new reading tools',
    siteName: 'The Irish Times',
    publicationDate: '2021-03-04',
    extra: { pages: '12' },
  };
  const onlineEdition = {
    ...printEdition,
    url: 'https://irishtimes.example/story',
    accessDate: '2025-11-24',
  };
  const noPages = { ...printEdition, extra: {} };

  test('Harvard puts the page after the date', () => {
    expect(formatReference(printEdition, 'harvard')).toBe(
      "Doyle, M. (2021) 'Students trial new reading tools', The Irish Times, 4 March, p. 12."
    );
    expect(formatReference(onlineEdition, 'harvard')).toBe(
      "Doyle, M. (2021) 'Students trial new reading tools', The Irish Times, 4 March, p. 12. Available at: https://irishtimes.example/story (Accessed: 24 November 2025)."
    );
  });

  test('APA 7 puts the page after the newspaper title', () => {
    expect(formatReference(printEdition, 'apa7')).toBe(
      'Doyle, M. (2021, March 4). Students trial new reading tools. The Irish Times, p. 12.'
    );
    expect(formatReference(onlineEdition, 'apa7')).toBe(
      'Doyle, M. (2021, March 4). Students trial new reading tools. The Irish Times, p. 12. https://irishtimes.example/story'
    );
  });

  test('MLA 9 ends the entry on the page', () => {
    expect(formatReference(printEdition, 'mla9')).toBe(
      'Doyle, Maria. "Students trial new reading tools." The Irish Times, 4 Mar. 2021, p. 12.'
    );
    expect(formatReference(onlineEdition, 'mla9')).toBe(
      'Doyle, Maria. "Students trial new reading tools." The Irish Times, 4 Mar. 2021, p. 12, https://irishtimes.example/story.'
    );
  });

  test('Chicago 17 puts a bare page after the date, as it does for a chapter', () => {
    expect(formatReference(printEdition, 'chicago17')).toBe(
      'Doyle, Maria. 2021. "Students trial new reading tools." The Irish Times, March 4, 2021, 12.'
    );
    expect(formatReference(onlineEdition, 'chicago17')).toBe(
      'Doyle, Maria. 2021. "Students trial new reading tools." The Irish Times, March 4, 2021, 12. https://irishtimes.example/story.'
    );
  });

  test('a page range takes the plural label where the style uses one', () => {
    const range = { ...printEdition, extra: { pages: '12-14' } };
    expect(formatReference(range, 'harvard')).toContain(', pp. 12–14.');
    expect(formatReference(range, 'apa7')).toContain('The Irish Times, pp. 12–14.');
    expect(formatReference(range, 'mla9')).toContain(', pp. 12–14.');
    expect(formatReference(range, 'chicago17')).toContain(', March 4, 2021, 12–14.');
  });

  test('an article with no recorded page reads exactly as before, with no dangling separator', () => {
    expect(formatReference(noPages, 'harvard')).toBe(
      "Doyle, M. (2021) 'Students trial new reading tools', The Irish Times, 4 March."
    );
    expect(formatReference(noPages, 'apa7')).toBe(
      'Doyle, M. (2021, March 4). Students trial new reading tools. The Irish Times.'
    );
    expect(formatReference(noPages, 'mla9')).toBe(
      'Doyle, Maria. "Students trial new reading tools." The Irish Times, 4 Mar. 2021.'
    );
    expect(formatReference(noPages, 'chicago17')).toBe(
      'Doyle, Maria. 2021. "Students trial new reading tools." The Irish Times, March 4, 2021.'
    );
    ['harvard', 'apa7', 'mla9', 'chicago17'].forEach(style => {
      expect(formatReference(noPages, style)).not.toMatch(/,\s*$/);
    });
  });
});

describe('DOI normalisation across styles', () => {
  const journalWith = doi => ({ ...journalFixture, doi, url: '' });
  const thesisWith = doi => ({
    type: 'thesis',
    authors: ['Roe, Jane'],
    title: 'On reading',
    publicationDate: '2019',
    extra: { thesisType: 'PhD thesis', institution: 'NCAD' },
    doi,
  });
  const stored = [
    '10.1037/abc',
    'doi:10.1037/abc',
    'DOI: 10.1037/abc',
    'https://doi.org/10.1037/abc',
    'http://dx.doi.org/10.1037/abc',
  ];

  test.each(stored)('APA prints a resolvable link for a journal DOI stored as %p', doi => {
    expect(formatReference(journalWith(doi), 'apa7')).toBe(
      'Smith, J. M., & Doe, J. (2021). Learning at scale. Journal of EdTech, 12(3), 45–60. https://doi.org/10.1037/abc'
    );
  });

  test('APA regression: a "doi:" prefix never lands inside the link', () => {
    const ref = formatReference(journalWith('doi:10.1037/abc'), 'apa7');
    expect(ref).not.toContain('doi.org/doi:');
  });

  test.each(stored)('APA prints a resolvable link for a thesis DOI stored as %p', doi => {
    expect(formatReference(thesisWith(doi), 'apa7')).toBe(
      'Roe, J. (2019). On reading [Doctoral dissertation, NCAD]. https://doi.org/10.1037/abc'
    );
  });

  // Cite Them Right: "Available at: https://doi.org/…", no accessed date (STYLE-RULES.md, "DOI").
  test.each(stored)('Harvard prints a clean journal DOI stored as %p', doi => {
    expect(formatReference(journalWith(doi), 'harvard')).toBe(
      "Smith, J.M. and Doe, J. (2021) 'Learning at scale', Journal of EdTech, 12(3), pp. 45–60. Available at: https://doi.org/10.1037/abc."
    );
  });

  test.each(stored)('Harvard prints a clean thesis DOI stored as %p', doi => {
    expect(formatReference(thesisWith(doi), 'harvard')).toBe(
      'Roe, J. (2019) On reading. PhD thesis. NCAD. Available at: https://doi.org/10.1037/abc.'
    );
  });

  test('Harvard regression: a stored "doi:" prefix is never doubled', () => {
    expect(formatReference(journalWith('doi:10.1037/abc'), 'harvard')).not.toContain('doi: doi:');
    expect(formatReference(journalWith('https://doi.org/10.1037/abc'), 'harvard')).not.toContain(
      'doi: https://'
    );
  });

  test('a blank DOI adds no DOI clause in APA or Harvard', () => {
    expect(formatReference(journalWith('  '), 'apa7')).not.toContain('doi');
    expect(formatReference(journalWith('  '), 'harvard')).not.toContain('doi');
  });
});

describe('Chicago 17 in-text author threshold (et al. from four authors)', () => {
  const withAuthors = authors => ({ type: 'journal', authors, publicationDate: '2023' });
  const one = withAuthors(['Smith, John']);
  const two = withAuthors(['Smith, John', 'Doe, Jane']);
  const three = withAuthors(['Smith, John', 'Doe, Jane', 'Lee, Chris']);
  const four = withAuthors(['Smith, John', 'Doe, Jane', 'Lee, Chris', 'Park, Min']);

  test.each([
    [one, '(Smith 2023)', '(Smith 2023, 24)'],
    [two, '(Smith and Doe 2023)', '(Smith and Doe 2023, 24)'],
    [three, '(Smith, Doe, and Lee 2023)', '(Smith, Doe, and Lee 2023, 24)'],
    [four, '(Smith et al. 2023)', '(Smith et al. 2023, 24)'],
  ])('%#: without and with a locator', (citation, bare, located) => {
    expect(formatInText(citation, 'chicago17')).toBe(bare);
    expect(formatInText(citation, 'chicago17', { locator: '24' })).toBe(located);
  });

  test('regression: three authors are all named, not "et al."', () => {
    expect(formatInText(three, 'chicago17')).not.toContain('et al.');
  });
});
