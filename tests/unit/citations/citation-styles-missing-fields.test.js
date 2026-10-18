/**
 * @jest-environment jsdom
 *
 * Style fixes from the W5 release pass, plus the thin-record cases.
 *
 *  - MLA 9 prints a DOI as an https://doi.org/ link (§5.93), not as a bare "10.1038/…".
 *  - MLA 9 and Chicago 17 print a book's edition, which Harvard and APA already did.
 *  - Every style survives a record with no author, no date and no link without throwing and
 *    without printing "undefined" / "null" / "NaN" — a title-only book can now be stored.
 *  - A source with no link prints no "Available at:" clause in ANY style (Harvard used to promise
 *    a link that was not there).
 *  - The html flavour escapes the record it was given, so no formatter sink can be unsafe.
 */

import {
  formatReference,
  formatInText,
  formatBibliography,
  STYLES,
} from '../../../src/features/citations/citation-styles/index.js';

const SECOND_EDITION_BOOK = {
  type: 'book',
  authors: ['Kahneman, Daniel'],
  title: 'Thinking, Fast and Slow',
  publisher: 'Penguin',
  publicationDate: '2011',
  extra: { place: 'London', edition: '2nd' },
};

const DOI_ARTICLE = {
  type: 'journal',
  authors: ['Harris, Charles R.'],
  title: 'Array programming with NumPy',
  siteName: 'Nature',
  publicationDate: '2020-09-16',
  extra: { volume: '585', pages: '357-362' },
  doi: '10.1038/s41586-020-2649-2',
};

describe('MLA 9 prints a DOI as a link', () => {
  test('a journal article gives the doi.org form, not the bare DOI', () => {
    const ref = formatReference(DOI_ARTICLE, 'mla9');
    expect(ref).toContain('https://doi.org/10.1038/s41586-020-2649-2');
    expect(ref).not.toMatch(/\s10\.1038/);
  });

  test('a DOI already written as a URL is not doubled up', () => {
    const ref = formatReference(
      { ...DOI_ARTICLE, doi: 'https://doi.org/10.1038/s41586-020-2649-2' },
      'mla9'
    );
    expect(ref).toContain('https://doi.org/10.1038/s41586-020-2649-2');
    expect(ref).not.toContain('doi.org/https');
  });

  test('a thesis read online gives the doi.org form too', () => {
    const ref = formatReference(
      {
        type: 'thesis',
        authors: ['Nolan, Fiona'],
        title: 'Reading and the dyslexic learner',
        publicationDate: '2019',
        doi: '10.5555/abc',
        extra: { thesisType: 'PhD thesis', institution: 'NCAD' },
      },
      'mla9'
    );
    expect(ref).toContain('https://doi.org/10.5555/abc');
  });
});

describe("a book's edition survives in every style", () => {
  test('MLA 9 prints "2nd ed." before the publisher', () => {
    expect(formatReference(SECOND_EDITION_BOOK, 'mla9')).toBe(
      'Kahneman, Daniel. Thinking, Fast and Slow. 2nd ed., Penguin, 2011.'
    );
  });

  test('Chicago 17 prints "2nd ed." after the title', () => {
    expect(formatReference(SECOND_EDITION_BOOK, 'chicago17')).toBe(
      'Kahneman, Daniel. 2011. Thinking, Fast and Slow. 2nd ed. London: Penguin.'
    );
  });

  test('Harvard and APA still print theirs', () => {
    expect(formatReference(SECOND_EDITION_BOOK, 'harvard')).toContain('2nd edn.');
    expect(formatReference(SECOND_EDITION_BOOK, 'apa7')).toContain('(2nd ed.)');
  });

  test('a book with no edition gains no stray separator', () => {
    const plain = { ...SECOND_EDITION_BOOK, extra: { place: 'London' } };
    expect(formatReference(plain, 'mla9')).toBe(
      'Kahneman, Daniel. Thinking, Fast and Slow. Penguin, 2011.'
    );
    expect(formatReference(plain, 'chicago17')).toBe(
      'Kahneman, Daniel. 2011. Thinking, Fast and Slow. London: Penguin.'
    );
  });
});

describe('thin records never print placeholder rubbish', () => {
  /** Records a relaxed wizard can now store: a title and little or nothing else. */
  const THIN = [
    ['title-only book', { type: 'book', title: 'An Untitled Manuscript' }],
    ['title-only web page', { type: 'webpage', title: 'A page' }],
    ['journal with no author or date', { type: 'journal', title: 'A paper', siteName: 'Nature' }],
    ['chapter with nothing but a title', { type: 'chapter', title: 'A chapter' }],
    ['thesis with nothing but a title', { type: 'thesis', title: 'A thesis' }],
    ['newspaper with nothing but a title', { type: 'newspaper', title: 'A story' }],
    ['empty record', {}],
    ['authors: null', { type: 'book', title: 'X', authors: null, publicationDate: null, url: null }],
  ];

  for (const { id } of STYLES) {
    for (const [label, citation] of THIN) {
      test(`${id} formats a ${label} cleanly`, () => {
        let ref;
        expect(() => {
          ref = formatReference(citation, id);
        }).not.toThrow();
        expect(ref).not.toMatch(/undefined|null|NaN/);
        expect(() => formatInText(citation, id)).not.toThrow();
        expect(formatInText(citation, id)).not.toMatch(/undefined|null|NaN/);
      });
    }
  }

  test('an undated source is marked as such in each style', () => {
    const undated = { type: 'book', title: 'A book', authors: ['Smith, Jo'], publisher: 'Press' };
    expect(formatReference(undated, 'harvard')).toContain('no date');
    expect(formatReference(undated, 'apa7')).toContain('n.d.');
    // MLA 9 has no placeholder: the date is simply left out (STYLE-RULES.md, "No date").
    expect(formatReference(undated, 'mla9')).toBe('Smith, Jo. A book. Press.');
    expect(formatReference(undated, 'chicago17')).toContain('n.d.');
  });

  test('a bibliography of thin records still builds', () => {
    expect(() =>
      formatBibliography([{ type: 'book', title: 'A' }, {}], 'mla9')
    ).not.toThrow();
  });
});

describe('a source with no link makes no promise of one', () => {
  const NO_LINK = {
    type: 'website',
    authors: ['Nolan, Fiona'],
    title: 'A page saved from a PDF reader',
    publicationDate: '2024',
    accessDate: '2026-05-03',
  };

  // Harvard printed "Available at:  (Accessed: 3 May 2026)." — a marker told to follow a link the
  // student never had, and a blank where the URL should be. The other three styles already gate the
  // clause on a real http(s) URL.
  test.each(['website', 'pdf', 'other', 'video', 'social_media'])(
    'Harvard drops the whole clause for a %s with no URL',
    type => {
      const ref = formatReference({ ...NO_LINK, type }, 'harvard');
      expect(ref).not.toContain('Available at');
      expect(ref).not.toContain('Accessed');
      expect(ref).not.toMatch(/\s{2}/);
    }
  );

  test('a URL that is not a link is not printed as one', () => {
    const ref = formatReference({ ...NO_LINK, url: 'file:///C:/notes.pdf' }, 'harvard');
    expect(ref).not.toContain('Available at');
  });

  test('the clause is still there when there IS a link', () => {
    const ref = formatReference({ ...NO_LINK, url: 'https://example.com/page' }, 'harvard');
    expect(ref).toContain('Available at: https://example.com/page (Accessed: 3 May 2026).');
  });

  test('every style survives a linkless source of each of those types', () => {
    for (const { id } of STYLES) {
      for (const type of ['website', 'pdf', 'other', 'video', 'social_media']) {
        const ref = formatReference({ ...NO_LINK, type }, id);
        expect(ref).not.toMatch(/undefined|null|NaN/);
        expect(ref).not.toMatch(/Available at:\s*(\(|$)/);
      }
    }
  });
});

describe('html output cannot be a sink for scraped metadata', () => {
  const HOSTILE = {
    type: 'book',
    authors: ['Nolan, Fiona'],
    title: '<img src=x onerror="alert(1)"> A Book',
    publisher: 'Press & Sons',
    publicationDate: '2024',
  };

  test.each(['harvard', 'apa7', 'mla9', 'chicago17'])('%s escapes the record it is given', style => {
    const html = formatReference(HOSTILE, style, { html: true });
    // The only markup in the output is the italics the style asked for.
    expect(html.replace(/<\/?em>/g, '')).not.toMatch(/[<>]/);
    expect(html).toContain(String.raw`&lt;img src=x onerror="alert(1)"&gt;`);
    expect(html).toContain('Press &amp; Sons');
    expect(html).toMatch(/<em>.+<\/em>/);
  });

  test('the plain flavour is left exactly as it was', () => {
    const plain = formatReference(HOSTILE, 'harvard');
    expect(plain).toContain('<img src=x onerror="alert(1)"> A Book');
    expect(plain).toContain('Press & Sons');
    expect(plain).not.toContain('&amp;');
  });

  test('a bibliography escapes every entry it joins', () => {
    const html = formatBibliography([HOSTILE], 'harvard', { html: true });
    expect(html.replace(/<\/?em>/g, '')).not.toMatch(/[<>]/);
  });
});
