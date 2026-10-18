/**
 * @jest-environment jsdom
 *
 * Book chapters, theses, and undated sources across the four offered styles.
 *
 * A chapter in an edited book and a thesis are among the commonest sources in humanities and
 * art-and-design coursework, so every style must render both in-text and in the reference list,
 * and must degrade gracefully when the editors or the page range are missing.
 *
 * The undated cases pin the rule that a source with no publication date is cited by the style's
 * own marker — Harvard "no date", the rest "n.d." — and NEVER by the date the student happened to
 * save it. The access date still appears in the "Available at … (Accessed …)" clause.
 */

import {
  formatReference,
  formatInText,
  formatBibliography,
} from '../../../src/features/citations/citation-styles/index.js';

/** Chapter in an edited book: two editors, an edition, a place and a page range. */
const chapterFixture = {
  type: 'chapter',
  authors: ['Roe, Richard'],
  title: 'Drawing as thinking',
  siteName: 'The Handbook of Art Education',
  publisher: 'Pub House',
  publicationDate: '2015',
  extra: {
    editors: ['Smith, Ann', 'Jones, Bob'],
    edition: '2nd',
    place: 'London',
    pages: '10-20',
  },
};

/** The same chapter as a student who typed it in a hurry: no editors, no pages, no edition. */
const sparseChapterFixture = {
  type: 'chapter',
  authors: ['Roe, Richard'],
  title: 'Drawing as thinking',
  siteName: 'The Handbook of Art Education',
  publisher: 'Pub House',
  publicationDate: '2015',
  extra: { place: 'London' },
};

const thesisFixture = {
  type: 'thesis',
  authors: ['Nolan, Aoife'],
  title: 'Tactile interfaces for dyslexic readers',
  publicationDate: '2022',
  extra: { thesisType: 'PhD thesis', institution: 'National College of Art and Design' },
};

/** A web page with an access date but no publication date. */
const undatedFixture = {
  type: 'website',
  authors: ['Roe, Jane'],
  title: 'A page about cats',
  siteName: 'CatWorld',
  url: 'https://cats.example/page',
  accessDate: '2025-11-24',
};

describe('book chapter — reference list', () => {
  test('Harvard', () => {
    expect(formatReference(chapterFixture, 'harvard')).toBe(
      "Roe, R. (2015) 'Drawing as thinking', in Smith, A. and Jones, B. (eds) The Handbook of Art Education. 2nd edn. London: Pub House, pp. 10–20."
    );
  });
  test('APA 7', () => {
    expect(formatReference(chapterFixture, 'apa7')).toBe(
      'Roe, R. (2015). Drawing as thinking. In A. Smith & B. Jones (Eds.), The Handbook of Art Education (2nd ed., pp. 10–20). Pub House.'
    );
  });
  test('MLA 9', () => {
    expect(formatReference(chapterFixture, 'mla9')).toBe(
      'Roe, Richard. "Drawing as thinking." The Handbook of Art Education, edited by Ann Smith and Bob Jones, 2nd ed., Pub House, 2015, pp. 10–20.'
    );
  });
  test('Chicago 17', () => {
    expect(formatReference(chapterFixture, 'chicago17')).toBe(
      'Roe, Richard. 2015. "Drawing as thinking." In The Handbook of Art Education, edited by Ann Smith and Bob Jones, 2nd ed., 10–20. London: Pub House.'
    );
  });
});

describe('book chapter — no editors and no pages degrade gracefully', () => {
  test('Harvard omits the editor clause and the page range', () => {
    expect(formatReference(sparseChapterFixture, 'harvard')).toBe(
      "Roe, R. (2015) 'Drawing as thinking', in The Handbook of Art Education. London: Pub House."
    );
  });
  test('APA 7 omits the editor clause and the parenthetical', () => {
    expect(formatReference(sparseChapterFixture, 'apa7')).toBe(
      'Roe, R. (2015). Drawing as thinking. In The Handbook of Art Education. Pub House.'
    );
  });
  test('MLA 9 omits "edited by" and the page range', () => {
    expect(formatReference(sparseChapterFixture, 'mla9')).toBe(
      'Roe, Richard. "Drawing as thinking." The Handbook of Art Education, Pub House, 2015.'
    );
  });
  test('Chicago 17 omits "edited by" and the page range', () => {
    expect(formatReference(sparseChapterFixture, 'chicago17')).toBe(
      'Roe, Richard. 2015. "Drawing as thinking." In The Handbook of Art Education. London: Pub House.'
    );
  });
  test('no style leaves a dangling separator', () => {
    ['harvard', 'apa7', 'mla9', 'chicago17'].forEach(style => {
      const ref = formatReference(sparseChapterFixture, style);
      expect(ref).not.toMatch(/,\s*\./);
      expect(ref).not.toMatch(/\s,/);
      expect(ref).not.toMatch(/\.\./);
    });
  });
});

describe('book chapter — in-text', () => {
  test('Harvard', () => {
    expect(formatInText(chapterFixture, 'harvard')).toBe('(Roe, 2015)');
  });
  test('APA 7 with a locator', () => {
    expect(formatInText(chapterFixture, 'apa7', { locator: '14' })).toBe('(Roe, 2015, p. 14)');
  });
  test('MLA 9 gives no page without a locator: the chapter range is not where the words are', () => {
    expect(formatInText(chapterFixture, 'mla9')).toBe('(Roe)');
  });
  test('Chicago 17 omits the comma before the year', () => {
    expect(formatInText(chapterFixture, 'chicago17')).toBe('(Roe 2015)');
  });
});

describe('book chapter — html italicises the book, never the chapter title', () => {
  test.each(['harvard', 'apa7', 'mla9', 'chicago17'])('%s', style => {
    const html = formatReference(chapterFixture, style, { html: true });
    expect(html).toContain('<em>The Handbook of Art Education</em>');
    expect(html).not.toContain('<em>Drawing as thinking</em>');
    expect(formatReference(chapterFixture, style)).not.toContain('<em>');
  });
});

describe('thesis — reference list', () => {
  test('Harvard', () => {
    expect(formatReference(thesisFixture, 'harvard')).toBe(
      'Nolan, A. (2022) Tactile interfaces for dyslexic readers. PhD thesis. National College of Art and Design.'
    );
  });
  test('APA 7', () => {
    expect(formatReference(thesisFixture, 'apa7')).toBe(
      'Nolan, A. (2022). Tactile interfaces for dyslexic readers [Unpublished doctoral dissertation]. National College of Art and Design.'
    );
  });
  test('MLA 9', () => {
    expect(formatReference(thesisFixture, 'mla9')).toBe(
      'Nolan, Aoife. Tactile interfaces for dyslexic readers. 2022. National College of Art and Design, PhD dissertation.'
    );
  });
  test('Chicago 17', () => {
    expect(formatReference(thesisFixture, 'chicago17')).toBe(
      'Nolan, Aoife. 2022. "Tactile interfaces for dyslexic readers." PhD diss., National College of Art and Design.'
    );
  });
});

describe('thesis — degree wording follows the recorded degree', () => {
  const masters = {
    ...thesisFixture,
    extra: { thesisType: 'MA dissertation', institution: 'University of Limerick' },
  };
  test('Harvard prints the degree as the student recorded it', () => {
    expect(formatReference(masters, 'harvard')).toContain(
      'MA dissertation. University of Limerick.'
    );
  });
  test('APA 7 uses its own descriptor', () => {
    expect(formatReference(masters, 'apa7')).toContain(
      "[Unpublished master's thesis]. University of Limerick."
    );
  });
  test('MLA 9 uses its own descriptor', () => {
    expect(formatReference(masters, 'mla9')).toContain('University of Limerick, MA thesis.');
  });
  test('Chicago 17 uses its own descriptor', () => {
    expect(formatReference(masters, 'chicago17')).toContain(
      "Master's thesis, University of Limerick."
    );
  });
  test('an unrecorded degree and institution never leave dangling punctuation', () => {
    const bare = {
      type: 'thesis',
      authors: ['Nolan, Aoife'],
      title: 'A title',
      publicationDate: '2022',
    };
    ['harvard', 'apa7', 'mla9', 'chicago17'].forEach(style => {
      const ref = formatReference(bare, style);
      expect(ref).not.toMatch(/,\s*\./);
      expect(ref).not.toMatch(/\[\s*,/);
      expect(ref).toContain('A title');
    });
  });
});

describe('thesis — in-text', () => {
  test('Harvard', () => {
    expect(formatInText(thesisFixture, 'harvard')).toBe('(Nolan, 2022)');
  });
  test('APA 7', () => {
    expect(formatInText(thesisFixture, 'apa7')).toBe('(Nolan, 2022)');
  });
  test('MLA 9 carries no year', () => {
    expect(formatInText(thesisFixture, 'mla9')).toBe('(Nolan)');
  });
  test('Chicago 17', () => {
    expect(formatInText(thesisFixture, 'chicago17')).toBe('(Nolan 2022)');
  });
});

describe('undated source — the access date is never used as the publication year', () => {
  test('Harvard reference says "no date" and still records the access date', () => {
    expect(formatReference(undatedFixture, 'harvard')).toBe(
      'Roe, J. (no date) A page about cats. Available at: https://cats.example/page (Accessed: 24 November 2025).'
    );
  });
  test('APA 7 reference says "n.d."', () => {
    expect(formatReference(undatedFixture, 'apa7')).toBe(
      'Roe, J. (n.d.). A page about cats. CatWorld. https://cats.example/page'
    );
  });
  test('MLA 9 carries no year and keeps the access date', () => {
    expect(formatReference(undatedFixture, 'mla9')).toBe(
      'Roe, Jane. "A page about cats." CatWorld, https://cats.example/page. Accessed 24 Nov. 2025.'
    );
  });
  test('Chicago 17 reference says "n.d."', () => {
    expect(formatReference(undatedFixture, 'chicago17')).toBe(
      'Roe, Jane. n.d. "A page about cats." CatWorld. Accessed November 24, 2025. https://cats.example/page.'
    );
  });

  test('Harvard in-text says "no date"', () => {
    expect(formatInText(undatedFixture, 'harvard')).toBe('(Roe, no date)');
  });
  test('APA 7 in-text says "n.d."', () => {
    expect(formatInText(undatedFixture, 'apa7')).toBe('(Roe, n.d.)');
  });
  test('MLA 9 in-text has no year at all', () => {
    expect(formatInText(undatedFixture, 'mla9')).toBe('(Roe)');
  });
  test('Chicago 17 in-text says "n.d."', () => {
    expect(formatInText(undatedFixture, 'chicago17')).toBe('(Roe, n.d.)');
  });

  test('no style shows 2025 as the publication year', () => {
    ['harvard', 'apa7', 'chicago17'].forEach(style => {
      expect(formatReference(undatedFixture, style)).not.toMatch(/\(2025\)|\.\s2025\./);
    });
  });

  test('an undated book still falls back to the style marker, not to today', () => {
    const undatedBook = {
      type: 'book',
      authors: ['Roe, Jane'],
      title: 'A book',
      publisher: 'Pub House',
      accessDate: '2025-11-24',
    };
    expect(formatReference(undatedBook, 'harvard')).toBe('Roe, J. (no date) A book. Pub House.');
    expect(formatReference(undatedBook, 'apa7')).toBe('Roe, J. (n.d.). A book. Pub House.');
    // MLA 9 prints no placeholder for an undated work (STYLE-RULES.md, "No date").
    expect(formatReference(undatedBook, 'mla9')).toBe('Roe, Jane. A book. Pub House.');
    expect(formatReference(undatedBook, 'chicago17')).toBe('Roe, Jane. n.d. A book. Pub House.');
  });
});

// APA 7 puts its n.d. entry first instead (§9.46); citation-styles-rules.test.js covers it.
describe('bibliography order — Harvard and Chicago sort undated entries after dated ones', () => {
  const dated = {
    type: 'book',
    authors: ['Smith, Ann'],
    title: 'Dated work',
    publisher: 'Pub House',
    publicationDate: '2001',
  };
  const undated = {
    type: 'book',
    authors: ['Smith, Ann'],
    title: 'Undated work',
    publisher: 'Pub House',
    accessDate: '2025-11-24',
  };

  test('Harvard lists the dated entry first, whichever order they arrive in', () => {
    const out = formatBibliography([undated, dated], 'harvard');
    expect(out.indexOf('Dated work')).toBeLessThan(out.indexOf('Undated work'));
  });

  test('Chicago: an undated entry sorts after every dated one by the same author', () => {
    const out = formatBibliography(
      [undated, dated, { ...dated, title: 'Later work', publicationDate: '2019' }],
      'chicago17'
    );
    expect(out.indexOf('Undated work')).toBeGreaterThan(out.indexOf('Later work'));
  });
});

/**
 * A thesis a student can actually reach is one they found in a repository, so the link is part of
 * the reference. APA 7 §10.6 also changes the bracket: a thesis with no repository link is an
 * UNPUBLISHED one, and the institution moves out of the brackets.
 */
describe('thesis in a repository — the link is part of the reference', () => {
  const onlineThesis = {
    ...thesisFixture,
    url: 'https://repo.ncad.ie/thesis',
    accessDate: '2025-11-24',
    extra: { ...thesisFixture.extra, repository: 'NCAD Research Repository' },
  };

  test('APA 7 uses the published form: bracket, repository, URL', () => {
    expect(formatReference(onlineThesis, 'apa7')).toBe(
      'Nolan, A. (2022). Tactile interfaces for dyslexic readers [Doctoral dissertation, National College of Art and Design]. NCAD Research Repository. https://repo.ncad.ie/thesis'
    );
  });

  test('APA 7 omits the repository name when none was recorded', () => {
    const noRepo = { ...onlineThesis, extra: { ...thesisFixture.extra } };
    expect(formatReference(noRepo, 'apa7')).toBe(
      'Nolan, A. (2022). Tactile interfaces for dyslexic readers [Doctoral dissertation, National College of Art and Design]. https://repo.ncad.ie/thesis'
    );
  });

  test('APA 7 counts a DOI as published and links it', () => {
    const withDoi = { ...thesisFixture, doi: '10.1/thesis' };
    expect(formatReference(withDoi, 'apa7')).toBe(
      'Nolan, A. (2022). Tactile interfaces for dyslexic readers [Doctoral dissertation, National College of Art and Design]. https://doi.org/10.1/thesis'
    );
  });

  test('Harvard adds the Available at / Accessed clause', () => {
    expect(formatReference(onlineThesis, 'harvard')).toBe(
      'Nolan, A. (2022) Tactile interfaces for dyslexic readers. PhD thesis. National College of Art and Design. Available at: https://repo.ncad.ie/thesis (Accessed: 24 November 2025).'
    );
  });

  test('Harvard gives the DOI as "Available at:" with no accessed date', () => {
    expect(formatReference({ ...thesisFixture, doi: '10.1/thesis' }, 'harvard')).toBe(
      'Nolan, A. (2022) Tactile interfaces for dyslexic readers. PhD thesis. National College of Art and Design. Available at: https://doi.org/10.1/thesis.'
    );
  });

  test('MLA 9 appends the URL as it does for any online source', () => {
    expect(formatReference(onlineThesis, 'mla9')).toBe(
      'Nolan, Aoife. Tactile interfaces for dyslexic readers. 2022. National College of Art and Design, PhD dissertation. https://repo.ncad.ie/thesis.'
    );
  });

  test('Chicago 17 appends the URL as it does for any online source', () => {
    expect(formatReference(onlineThesis, 'chicago17')).toBe(
      'Nolan, Aoife. 2022. "Tactile interfaces for dyslexic readers." PhD diss., National College of Art and Design. https://repo.ncad.ie/thesis.'
    );
  });

  test('an offline thesis keeps its own wording in every style', () => {
    expect(formatReference(thesisFixture, 'apa7')).toContain('[Unpublished doctoral dissertation]');
    ['harvard', 'mla9', 'chicago17'].forEach(style => {
      expect(formatReference(thesisFixture, style)).not.toContain('http');
    });
  });
});

describe('book chapter — three or more editors', () => {
  const threeEditors = {
    ...chapterFixture,
    extra: { ...chapterFixture.extra, editors: ['Smith, Ann', 'Jones, Bob', 'Lee, Chris'] },
  };

  test('MLA 9 writes "et al." with no comma in the natural-order slot', () => {
    expect(formatReference(threeEditors, 'mla9')).toContain('edited by Ann Smith et al.,');
    expect(formatReference(threeEditors, 'mla9')).not.toContain('Ann Smith, et al.');
  });

  test('APA 7 names all three editors', () => {
    expect(formatReference(threeEditors, 'apa7')).toContain(
      'In A. Smith, B. Jones, & C. Lee (Eds.),'
    );
  });

  test('Harvard names all three editors', () => {
    expect(formatReference(threeEditors, 'harvard')).toContain(
      'in Smith, A., Jones, B. and Lee, C. (eds)'
    );
  });

  test('Chicago 17 names all three editors', () => {
    expect(formatReference(threeEditors, 'chicago17')).toContain(
      'edited by Ann Smith, Bob Jones, and Chris Lee'
    );
  });
});

describe('thesis repository falls back to the site name the wizard captures', () => {
  const withSite = {
    ...thesisFixture,
    url: 'https://repo.ncad.ie/thesis',
    siteName: 'NCAD Research Repository',
    extra: { ...thesisFixture.extra },
  };
  test('APA 7 prints the site name as the repository when no repository field exists', () => {
    expect(formatReference(withSite, 'apa7')).toBe(
      'Nolan, A. (2022). Tactile interfaces for dyslexic readers [Doctoral dissertation, National College of Art and Design]. NCAD Research Repository. https://repo.ncad.ie/thesis'
    );
  });
});
