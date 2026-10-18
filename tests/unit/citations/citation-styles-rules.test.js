/**
 * @jest-environment jsdom
 *
 * The verified style rules, one worked
 * example each, per style: APA 7, Harvard (Cite Them Right 13th), MLA 9, Chicago 17 author-date.
 *
 * - Same author, same year: a, b, c after the year, by title (initial A/An/The ignored), computed
 *   over the set being output. MLA instead: a short title in the text, "---." in the list.
 * - No author: the title takes the author's place, in the text and in the list. Never "Anon.".
 * - No date: APA and Chicago "n.d.", Harvard "no date", MLA nothing at all.
 * - Author thresholds and separators, in the text and in the list.
 * - DOI: always https://doi.org/…, placed and punctuated per style.
 * - Reference-list order.
 */

import {
  formatReference,
  formatInText,
  formatBibliography,
  referenceSetFor,
} from '../../../src/features/citations/citation-styles/index.js';

const book = (id, title, extra = {}) => ({
  id,
  type: 'book',
  authors: ['Smith, John'],
  title,
  publisher: 'Pub',
  publicationDate: '2020',
  ...extra,
});

// "The ants of Africa" sorts under A (the article is ignored), so it takes the "a".
const ZEBRAS = book('z', 'Zebras of the plain');
const ANTS = book('a', 'The ants of Africa');
const SAME_YEAR = [ZEBRAS, ANTS];

const UNDATED_ZEBRAS = { ...ZEBRAS, publicationDate: '' };
const UNDATED_ANTS = { ...ANTS, publicationDate: '' };
const UNDATED_PAIR = [UNDATED_ZEBRAS, UNDATED_ANTS];

describe('same author, same year: APA 7', () => {
  test('in text, letters follow title order and sit after the year', () => {
    expect(formatInText(ANTS, 'apa7', { set: SAME_YEAR })).toBe('(Smith, 2020a)');
    expect(formatInText(ZEBRAS, 'apa7', { set: SAME_YEAR })).toBe('(Smith, 2020b)');
  });
  test('with a locator: (Smith, 2020a, p. 5)', () => {
    expect(formatInText(ANTS, 'apa7', { set: SAME_YEAR, locator: '5' })).toBe(
      '(Smith, 2020a, p. 5)'
    );
  });
  test('the reference carries the same letter', () => {
    expect(formatReference(ANTS, 'apa7', { set: SAME_YEAR })).toBe(
      'Smith, J. (2020a). The ants of Africa. Pub.'
    );
  });
  test('undated works take n.d.-a, n.d.-b', () => {
    expect(formatInText(UNDATED_ANTS, 'apa7', { set: UNDATED_PAIR })).toBe('(Smith, n.d.-a)');
    expect(formatReference(UNDATED_ZEBRAS, 'apa7', { set: UNDATED_PAIR })).toBe(
      'Smith, J. (n.d.-b). Zebras of the plain. Pub.'
    );
  });
  test('the bibliography lists the group by title, lettered', () => {
    expect(formatBibliography(SAME_YEAR, 'apa7')).toBe(
      'Smith, J. (2020a). The ants of Africa. Pub.\n\nSmith, J. (2020b). Zebras of the plain. Pub.'
    );
  });
  test('a single citation with no set gets no letter', () => {
    expect(formatInText(ANTS, 'apa7')).toBe('(Smith, 2020)');
    expect(formatReference(ANTS, 'apa7')).toBe('Smith, J. (2020). The ants of Africa. Pub.');
  });
  test('a different author list is not the same author', () => {
    const coauthored = { ...ANTS, id: 'c', authors: ['Smith, John', 'Doe, Ann'] };
    expect(formatInText(ANTS, 'apa7', { set: [ANTS, coauthored] })).toBe('(Smith, 2020)');
  });
  test('different years by the same author are not lettered', () => {
    const later = { ...ZEBRAS, publicationDate: '2021' };
    expect(formatInText(ANTS, 'apa7', { set: [ANTS, later] })).toBe('(Smith, 2020)');
  });
});

describe('same author, same year: Harvard (Cite Them Right)', () => {
  test('in text and in the list', () => {
    expect(formatInText(ANTS, 'harvard', { set: SAME_YEAR })).toBe('(Smith, 2020a)');
    expect(formatInText(ZEBRAS, 'harvard', { set: SAME_YEAR, locator: '5' })).toBe(
      '(Smith, 2020b, p. 5)'
    );
    expect(formatReference(ANTS, 'harvard', { set: SAME_YEAR })).toBe(
      'Smith, J. (2020a) The ants of Africa. Pub.'
    );
  });
  test('undated works take "no date a" (by analogy, owner to confirm)', () => {
    expect(formatInText(UNDATED_ANTS, 'harvard', { set: UNDATED_PAIR })).toBe('(Smith, no date a)');
    expect(formatReference(UNDATED_ZEBRAS, 'harvard', { set: UNDATED_PAIR })).toBe(
      'Smith, J. (no date b) Zebras of the plain. Pub.'
    );
  });
});

describe('same author, same year: Chicago 17 author-date', () => {
  test('in text and in the list', () => {
    expect(formatInText(ANTS, 'chicago17', { set: SAME_YEAR })).toBe('(Smith 2020a)');
    expect(formatInText(ZEBRAS, 'chicago17', { set: SAME_YEAR, locator: '5' })).toBe(
      '(Smith 2020b, 5)'
    );
    expect(formatReference(ANTS, 'chicago17', { set: SAME_YEAR })).toBe(
      'Smith, John. 2020a. The ants of Africa. Pub.'
    );
  });
  test('undated works take n.d.-a, and a comma before n.d. in text (CMOS CSL style)', () => {
    expect(formatInText(UNDATED_ANTS, 'chicago17', { set: UNDATED_PAIR })).toBe('(Smith, n.d.-a)');
    expect(formatReference(UNDATED_ZEBRAS, 'chicago17', { set: UNDATED_PAIR })).toBe(
      'Smith, John. n.d.-b. Zebras of the plain. Pub.'
    );
  });
});

describe('same author: MLA 9 uses short titles and "---."', () => {
  const BELOVED = {
    id: 'b',
    type: 'book',
    authors: ['Morrison, Toni'],
    title: 'Beloved',
    publisher: 'Knopf',
    publicationDate: '1987',
  };
  const BLUEST = {
    id: 'e',
    type: 'book',
    authors: ['Morrison, Toni'],
    title: 'The Bluest Eye',
    publisher: 'Holt',
    publicationDate: '1970',
  };
  const REFORM = {
    id: 'r',
    type: 'journal',
    authors: ['Haynes, Cynthia'],
    title: 'Education Reform: A New Agenda',
    siteName: 'Review',
    publicationDate: '2019',
  };
  const RHETORIC = { ...REFORM, id: 's', title: 'Rhetoric and Pedagogy' };
  const MORRISON = [BLUEST, BELOVED];

  test('the text names the work: (Morrison, Beloved 27)', () => {
    expect(formatInText(BELOVED, 'mla9', { set: MORRISON, locator: '27' })).toBe(
      '(Morrison, Beloved 27)'
    );
    expect(formatInText(BLUEST, 'mla9', { set: MORRISON, locator: '12' })).toBe(
      '(Morrison, Bluest Eye 12)'
    );
  });
  test('an article title keeps its quotation marks: (Haynes, "Education Reform" 12)', () => {
    expect(formatInText(REFORM, 'mla9', { set: [REFORM, RHETORIC], locator: '12' })).toBe(
      '(Haynes, "Education Reform" 12)'
    );
  });
  test('one work by the author needs no title', () => {
    expect(formatInText(BELOVED, 'mla9', { set: [BELOVED], locator: '27' })).toBe('(Morrison 27)');
  });
  test('works cited: ordered by title, "---." for the second and later', () => {
    expect(formatBibliography(MORRISON, 'mla9')).toBe(
      'Morrison, Toni. Beloved. Knopf, 1987.\n\n---. The Bluest Eye. Holt, 1970.'
    );
  });
  test('MLA never letters a year', () => {
    expect(formatBibliography(SAME_YEAR, 'mla9')).not.toMatch(/2020[a-z]/);
  });
});

describe('no author: the title takes the author position', () => {
  const PAGE = {
    type: 'website',
    authors: [],
    title: 'Mystery page',
    siteName: 'Site',
    publicationDate: '2020-05-01',
    url: 'https://x.example',
  };
  const ARTICLE = {
    type: 'journal',
    authors: [],
    title: 'Climate and health',
    siteName: 'The Lancet',
    publicationDate: '2021',
    extra: { volume: '5' },
  };

  test('APA 7: the title leads the reference; in text, the title', () => {
    // A web page carries its full date (APA 7 §9.14).
    expect(formatReference(PAGE, 'apa7')).toBe(
      'Mystery page. (2020, May 1). Site. https://x.example'
    );
    expect(formatReference(PAGE, 'apa7', { html: true })).toBe(
      '<em>Mystery page</em>. (2020, May 1). Site. https://x.example'
    );
    expect(formatInText(PAGE, 'apa7')).toBe('(Mystery Page, 2020)');
    expect(formatReference(ARTICLE, 'apa7')).toBe('Climate and health. (2021). The Lancet, 5.');
    expect(formatInText(ARTICLE, 'apa7', { locator: '3' })).toBe(
      '("Climate and Health," 2021, p. 3)'
    );
  });
  test('Harvard: the italic title leads the reference', () => {
    expect(formatReference(PAGE, 'harvard')).toBe(
      'Mystery page (2020) Available at: https://x.example.'
    );
    expect(formatReference(PAGE, 'harvard', { html: true })).toBe(
      '<em>Mystery page</em> (2020) Available at: https://x.example.'
    );
    expect(formatInText(PAGE, 'harvard')).toBe('(Mystery page, 2020)');
  });
  test('MLA 9: the entry starts with the title', () => {
    expect(formatReference(PAGE, 'mla9')).toBe(
      '"Mystery page." Site, 1 May 2020, https://x.example.'
    );
    expect(formatInText(PAGE, 'mla9')).toBe('("Mystery page")');
  });
  test('Chicago 17: the title, then the year', () => {
    expect(formatReference(PAGE, 'chicago17')).toBe(
      '"Mystery page." 2020. Site. May 1, 2020. https://x.example.'
    );
    expect(formatInText(PAGE, 'chicago17')).toBe('("Mystery page" 2020)');
  });
  test('a long title is shortened in the text', () => {
    const long = {
      ...PAGE,
      title: 'Reading support for dyslexic learners in the modern classroom: a review',
    };
    // The main title, cut where a noun phrase ends, never on a little word like "in the".
    expect(formatInText(long, 'apa7')).toBe('(Reading Support for Dyslexic Learners, 2020)');
  });
  test('with neither author nor title, the in-text citation is the date alone, never stray quotes', () => {
    const bare = { type: 'journal', authors: [], publicationDate: '2023' };
    expect(formatInText(bare, 'apa7', { locator: '24' })).toBe('(2023, p. 24)');
    expect(formatInText(bare, 'harvard')).toBe('(2023)');
    expect(formatInText(bare, 'chicago17')).toBe('(2023)');
    expect(formatInText(bare, 'mla9', { locator: '24' })).toBe('(24)');
  });
  test('"Anon." is never printed, even for a record stored with it as the author', () => {
    const legacy = { ...PAGE, authors: ['Anon.'] };
    for (const style of ['apa7', 'harvard', 'mla9', 'chicago17']) {
      expect(formatReference(legacy, style)).not.toContain('Anon');
      expect(formatInText(legacy, style)).not.toContain('Anon');
    }
  });
  test('a work signed Anonymous says so (APA, MLA, Chicago)', () => {
    const signed = { ...PAGE, authors: ['Anonymous'] };
    expect(formatInText(signed, 'apa7')).toBe('(Anonymous, 2020)');
    expect(formatReference(signed, 'apa7')).toBe(
      'Anonymous. (2020, May 1). Mystery page. Site. https://x.example'
    );
    expect(formatInText(signed, 'chicago17')).toBe('(Anonymous 2020)');
    expect(formatReference(signed, 'mla9')).toMatch(/^Anonymous\. "Mystery page\."/);
  });
  test('Cite Them Right does not use Anonymous: Harvard uses the title', () => {
    const signed = { ...PAGE, authors: ['Anonymous'] };
    expect(formatInText(signed, 'harvard')).toBe('(Mystery page, 2020)');
    expect(formatReference(signed, 'harvard')).not.toContain('Anonymous');
  });
  test('sorting by title ignores an initial A/An/The', () => {
    const theZoo = { ...PAGE, title: 'The zoo', publicationDate: '2020' };
    const smith = { ...PAGE, authors: ['Smith, Ann'], title: 'Middle' };
    const out = formatBibliography([theZoo, smith], 'apa7');
    expect(out.indexOf('Smith')).toBeLessThan(out.indexOf('The zoo'));
  });
});

describe('no date', () => {
  const UNDATED = { type: 'book', authors: ['Roe, Jane'], title: 'A book', publisher: 'Pub House' };
  test('APA n.d., Chicago n.d., Harvard "no date", MLA no placeholder', () => {
    expect(formatReference(UNDATED, 'apa7')).toBe('Roe, J. (n.d.). A book. Pub House.');
    expect(formatReference(UNDATED, 'chicago17')).toBe('Roe, Jane. n.d. A book. Pub House.');
    expect(formatReference(UNDATED, 'harvard')).toBe('Roe, J. (no date) A book. Pub House.');
    expect(formatReference(UNDATED, 'mla9')).toBe('Roe, Jane. A book. Pub House.');
  });
  test('MLA gives an undated web page its access date', () => {
    const page = {
      type: 'website',
      authors: ['Roe, Jane'],
      title: 'A page',
      siteName: 'Site',
      url: 'https://x.example',
      accessDate: '2025-11-24',
    };
    expect(formatReference(page, 'mla9')).toBe(
      'Roe, Jane. "A page." Site, https://x.example. Accessed 24 Nov. 2025.'
    );
  });
});

/** "Name1, Quinn" … "NameN, Quinn": n authors in the order given. */
const authorsN = n => Array.from({ length: n }, (_, i) => `Name${i + 1}, Quinn`);
const withAuthors = n => ({
  type: 'book',
  authors: authorsN(n),
  title: 'A book',
  publisher: 'Pub',
  publicationDate: '2020',
});

describe('reference-list author lists', () => {
  test('APA 7 lists up to 20 authors, "&" before the last', () => {
    const ref = formatReference(withAuthors(20), 'apa7');
    expect(ref).toMatch(/^Name1, Q\., Name2, Q\., .*Name19, Q\., & Name20, Q\. \(2020\)\./);
  });
  test('APA 7 with 21 or more: first 19, an ellipsis, then the last', () => {
    const ref = formatReference(withAuthors(22), 'apa7');
    expect(ref).toMatch(/Name18, Q\., Name19, Q\., … Name22, Q\. \(2020\)\./);
    expect(ref).not.toContain('Name20');
    expect(ref).not.toContain('&');
  });
  test('Harvard lists all authors up to 10', () => {
    const ref = formatReference(withAuthors(10), 'harvard');
    expect(ref).toMatch(/Name9, Q\. and Name10, Q\. \(2020\)/);
  });
  test('Harvard uses et al. only with more than 10', () => {
    expect(formatReference(withAuthors(11), 'harvard')).toBe(
      'Name1, Q. et al. (2020) A book. Pub.'
    );
  });
  test('MLA 9 with three or more: first author, et al.', () => {
    expect(formatReference(withAuthors(3), 'mla9')).toBe('Name1, Quinn, et al. A book. Pub, 2020.');
  });
  test('Chicago 17 lists up to 10', () => {
    const ref = formatReference(withAuthors(10), 'chicago17');
    expect(ref).toMatch(/Quinn Name9, and Quinn Name10\. 2020\./);
  });
  test('Chicago 17 with 11 or more: first seven, then et al. (owner to confirm)', () => {
    expect(formatReference(withAuthors(11), 'chicago17')).toBe(
      'Name1, Quinn, Quinn Name2, Quinn Name3, Quinn Name4, Quinn Name5, Quinn Name6, ' +
        'Quinn Name7, et al. 2020. A book. Pub.'
    );
  });
});

describe('in-text et al.', () => {
  const cite = n => ({
    ...withAuthors(n),
    authors: ['Hill, A', 'Smith, B', 'Jones, C', 'Lee, D'].slice(0, n),
    publicationDate: '1997',
  });
  test('APA: 1 or 2 named with "&", 3 or more et al.', () => {
    expect(formatInText(cite(2), 'apa7')).toBe('(Hill & Smith, 1997)');
    expect(formatInText(cite(3), 'apa7')).toBe('(Hill et al., 1997)');
  });
  test('MLA: 1 or 2 named with "and", 3 or more et al.', () => {
    expect(formatInText(cite(2), 'mla9')).toBe('(Hill and Smith)');
    expect(formatInText(cite(3), 'mla9')).toBe('(Hill et al.)');
  });
  test('Harvard: up to 3 named, "Hill, Smith and Jones, 1997"', () => {
    expect(formatInText(cite(3), 'harvard')).toBe('(Hill, Smith and Jones, 1997)');
    expect(formatInText(cite(4), 'harvard')).toBe('(Hill et al., 1997)');
  });
  test('Chicago: up to 3 named with "and", 4 or more et al.', () => {
    expect(formatInText(cite(3), 'chicago17')).toBe('(Hill, Smith, and Jones 1997)');
    expect(formatInText(cite(4), 'chicago17')).toBe('(Hill et al. 1997)');
  });
});

describe('DOI', () => {
  const ARTICLE = {
    type: 'journal',
    authors: ['Smith, John'],
    title: 'Learning at scale',
    siteName: 'Journal of EdTech',
    publicationDate: '2021',
    extra: { volume: '12', issue: '3', pages: '45-60' },
    doi: 'doi:10.1/x',
    accessDate: '2025-11-24',
  };
  const DOI_FORMS = [
    '10.1/x',
    'doi:10.1/x',
    'DOI: 10.1/x',
    'https://dx.doi.org/10.1/x',
    'doi.org/10.1/x',
  ];

  test.each(DOI_FORMS)('every style prints https://doi.org/ for %p', doi => {
    for (const style of ['apa7', 'harvard', 'mla9', 'chicago17']) {
      const ref = formatReference({ ...ARTICLE, doi }, style);
      expect(ref).toContain('https://doi.org/10.1/x');
      expect(ref).not.toMatch(/doi:\s*10|dx\.doi|doi\.org\/doi/i);
    }
  });
  // Review finding 5: a www.doi.org link or "DOI 10…" with no colon used to be printed whole
  // inside a doi.org link; something that holds no DOI at all must print no doi.org link.
  test.each(['https://www.doi.org/10.1037/abc', 'DOI 10.1037/abc', 'see doi 10.1037/abc.'])(
    'the DOI is found inside %p',
    doi => {
      const ref = formatReference({ ...ARTICLE, doi }, 'apa7');
      expect(ref).toMatch(/ https:\/\/doi\.org\/10\.1037\/abc$/);
    }
  );
  test('a DOI field that holds no DOI prints no doi.org link', () => {
    for (const style of ['apa7', 'harvard', 'mla9', 'chicago17']) {
      expect(formatReference({ ...ARTICLE, doi: 'not recorded' }, style)).not.toContain('doi.org');
    }
  });
  test('APA: last, with no full stop after it', () => {
    expect(formatReference(ARTICLE, 'apa7')).toMatch(/45–60\. https:\/\/doi\.org\/10\.1\/x$/);
  });
  test('MLA and Chicago: the final element, with a full stop', () => {
    expect(formatReference(ARTICLE, 'mla9')).toMatch(/ https:\/\/doi\.org\/10\.1\/x\.$/);
    expect(formatReference(ARTICLE, 'chicago17')).toMatch(/ https:\/\/doi\.org\/10\.1\/x\.$/);
  });
  test('Harvard: "Available at:" the DOI, with no accessed date', () => {
    expect(formatReference(ARTICLE, 'harvard')).toBe(
      "Smith, J. (2021) 'Learning at scale', Journal of EdTech, 12(3), pp. 45–60. Available at: https://doi.org/10.1/x."
    );
  });
  test('Harvard: a URL without a DOI keeps its accessed date', () => {
    const online = { ...ARTICLE, doi: '', url: 'https://j.example/a' };
    expect(formatReference(online, 'harvard')).toBe(
      "Smith, J. (2021) 'Learning at scale', Journal of EdTech, 12(3), pp. 45–60. Available at: https://j.example/a (Accessed: 24 November 2025)."
    );
  });
  test('a book with a DOI prints it in every style', () => {
    const ebook = {
      type: 'book',
      authors: ['Smith, John'],
      title: 'A book',
      publisher: 'Pub',
      publicationDate: '2020',
      doi: '10.1/b',
    };
    expect(formatReference(ebook, 'apa7')).toBe(
      'Smith, J. (2020). A book. Pub. https://doi.org/10.1/b'
    );
    expect(formatReference(ebook, 'harvard')).toBe(
      'Smith, J. (2020) A book. Pub. Available at: https://doi.org/10.1/b.'
    );
    expect(formatReference(ebook, 'mla9')).toBe(
      'Smith, John. A book. Pub, 2020, https://doi.org/10.1/b.'
    );
    expect(formatReference(ebook, 'chicago17')).toBe(
      'Smith, John. 2020. A book. Pub. https://doi.org/10.1/b.'
    );
  });
});

describe('reference-list order', () => {
  const entry = (authors, title, year) => ({
    type: 'book',
    authors,
    title,
    publisher: 'Pub',
    publicationDate: year,
  });
  const LIST = [
    entry(['Smith, John'], 'Zeta', '2021'),
    entry([], 'The guide to everything', '2018'),
    entry(['Smith, John', 'Doe, Ann'], 'Alpha', '2018'),
    entry(['Smith, John'], 'Beta', '2019'),
    entry(['Adams, Amy'], 'Omega', '2022'),
  ];
  const order = (style, words) => {
    const out = formatBibliography(LIST, style);
    return words.map(w => out.indexOf(w));
  };
  const ascending = positions => positions.every((p, i) => i === 0 || p > positions[i - 1]);

  test('APA and Chicago: author, then earliest year first; a title stands in for no author', () => {
    for (const style of ['apa7', 'chicago17', 'harvard']) {
      expect(
        ascending(order(style, ['Omega', 'guide to everything', 'Beta', 'Zeta', 'Alpha']))
      ).toBe(true);
    }
  });
  describe('an undated work among the same author’s dated ones', () => {
    const SMITH = [
      entry(['Smith, John'], 'Later', '2021'),
      entry(['Smith, John'], 'Undated', ''),
      entry(['Smith, John'], 'Earlier', '2019'),
    ];
    const positions = (style, titles) => {
      const out = formatBibliography(SMITH, style);
      return titles.map(t => out.indexOf(t));
    };
    test('APA 7: n.d. first, then earliest year first', () => {
      expect(ascending(positions('apa7', ['Undated', 'Earlier', 'Later']))).toBe(true);
    });
    test('Harvard and Chicago: dated works earliest first, the undated one after', () => {
      for (const style of ['harvard', 'chicago17']) {
        expect(ascending(positions(style, ['Earlier', 'Later', 'Undated']))).toBe(true);
      }
    });
    test('MLA: by title only', () => {
      expect(ascending(positions('mla9', ['Earlier', 'Later', 'Undated']))).toBe(true);
    });
  });
  test('MLA: the same author by title only, whatever the year', () => {
    const late = entry(['Smith, John'], 'Aardvark', '2025');
    const out = formatBibliography([...LIST, late], 'mla9');
    expect(out.indexOf('Aardvark')).toBeLessThan(out.indexOf('Beta'));
  });
});

describe('the set is passed explicitly', () => {
  const inCollection = (c, projectId) => ({ ...c, projectId });

  test('referenceSetFor returns the citation’s collection', () => {
    const pool = [
      inCollection(ANTS, 'p1'),
      inCollection(ZEBRAS, 'p1'),
      inCollection(book('x', 'Other'), 'p2'),
    ];
    expect(referenceSetFor(pool[0], pool).map(c => c.id)).toEqual(['a', 'z']);
  });
  test('an unfiled citation belongs with every unfiled citation', () => {
    const pool = [ANTS, ZEBRAS, inCollection(book('x', 'Other'), 'p2')];
    expect(referenceSetFor(ANTS, pool).map(c => c.id)).toEqual(['a', 'z']);
  });
  test('the same pair in two collections is lettered only where both are', () => {
    const pool = [inCollection(ANTS, 'p1'), inCollection(ZEBRAS, 'p2')];
    expect(formatInText(pool[0], 'apa7', { set: referenceSetFor(pool[0], pool) })).toBe(
      '(Smith, 2020)'
    );
  });

  /** The in-text letter and the reference-list letter for one source must never disagree. */
  test.each(['apa7', 'harvard', 'chicago17'])('%s: in-text and list letters agree', style => {
    const third = book('m', 'Middle of nowhere');
    const set = [ZEBRAS, third, ANTS];
    const list = formatBibliography(set, style).split('\n\n');
    for (const c of set) {
      const letter = formatInText(c, style, { set }).match(/2020([a-z])/)[1];
      const line = list.find(l => l.includes(c.title.replace(/^The /, '')));
      expect(line).toMatch(new RegExp(`2020${letter}\\b`));
      expect(formatReference(c, style, { set })).toBe(line);
    }
  });
});
