/**
 * @jest-environment jsdom
 *
 * The essay checker reads the words the formatters now write (STYLE-RULES.md, 2026-09-26):
 * year letters (2020a, n.d.-a, "no date a", n.d.a), a title in the author position, and MLA's
 * author-plus-short-title form. Every essay here is built from the formatters' own output for the
 * same reference list, so the checker and the formatter cannot drift apart unnoticed.
 */

import {
  checkReferences,
  extractInTextCitations,
} from '../../../src/features/citations/reference-check.js';
import { formatInText } from '../../../src/features/citations/citation-styles/index.js';

const book = (id, title, extra = {}) => ({
  id,
  type: 'book',
  authors: ['Smith, John'],
  title,
  publisher: 'Pub',
  publicationDate: '2020',
  ...extra,
});
const ANTS = book('a', 'The ants of Africa');
const ZEBRAS = book('z', 'Zebras of the plain');
const PAIR = [ANTS, ZEBRAS];

/** An essay citing every record in the list, in the given style, against that list. */
const essayCiting = (records, style, list = records) =>
  records.map(r => `A claim ${formatInText(r, style, { set: list, locator: '5' })}.`).join(' ');

const allCited = result => {
  expect(result.citedNotListed).toEqual([]);
  expect(result.listedNotCited).toEqual([]);
};

describe('year letters', () => {
  test.each(['apa7', 'harvard', 'chicago17'])(
    '%s: each lettered citation marks its own record',
    style => {
      const result = checkReferences(essayCiting(PAIR, style), PAIR);
      expect(result.counts.matched).toBe(2);
      allCited(result);
    }
  );

  test.each(['apa7', 'harvard', 'chicago17'])(
    '%s: undated pairs (n.d.-a / no date a / n.d.a)',
    style => {
      const undated = PAIR.map(r => ({ ...r, publicationDate: '' }));
      const result = checkReferences(essayCiting(undated, style), undated);
      expect(result.counts.matched).toBe(2);
      allCited(result);
    }
  );

  test('citing only 2020a leaves the b work reported as never cited', () => {
    const result = checkReferences(`One claim ${formatInText(ANTS, 'apa7', { set: PAIR })}.`, PAIR);
    expect(result.counts.matched).toBe(1);
    expect(result.listedNotCited.map(c => c.id)).toEqual(['z']);
  });

  test('the undated letter forms are read as undated', () => {
    const year = essay => extractInTextCitations(essay)[0].year;
    expect(year('Guidance (NHS, n.d.-a).')).toBe('n.d.a');
    expect(year('Guidance (NHS, no date b).')).toBe('n.d.b');
    expect(year('Guidance (NHS n.d.a).')).toBe('n.d.a');
  });

  test('letters are worked out per collection, as the formatter does', () => {
    const filed = [
      { ...ANTS, projectId: 'p1' },
      { ...ZEBRAS, projectId: 'p2' },
    ];
    // Each is alone in its collection, so each is cited without a letter.
    const essay = filed.map(r => formatInText(r, 'apa7', { set: [r] })).join(' and ');
    const result = checkReferences(`Both ${essay}.`, filed);
    expect(result.counts.matched).toBe(2);
    allCited(result);
  });
});

describe('a title in the author position', () => {
  const PAGE = {
    id: 'p',
    type: 'website',
    authors: [],
    title: 'Mystery page',
    publicationDate: '2020-05-01',
    url: 'https://x.example',
  };
  const ARTICLE = {
    id: 'j',
    type: 'journal',
    authors: [],
    title: 'Climate and health: a review of the evidence',
    siteName: 'The Lancet',
    publicationDate: '2021',
  };
  const NAMED = book('n', 'Other work', { authors: ['Doe, Ann'] });
  const LIST = [PAGE, ARTICLE, NAMED];

  test.each(['apa7', 'harvard', 'chicago17', 'mla9'])('%s: every form is recognised', style => {
    const result = checkReferences(essayCiting(LIST, style), LIST);
    expect(result.counts.matched).toBe(3);
    allCited(result);
  });

  test('a title-form citation with the wrong year is reported, with the listed year offered', () => {
    const result = checkReferences('A claim ("Climate and health," 2019).', LIST);
    expect(result.counts.matched).toBe(0);
    expect(result.citedNotListed).toHaveLength(1);
    expect(result.citedNotListed[0].suggestion).toMatchObject({
      type: 'year-mismatch',
      year: '2021',
    });
  });

  test('a parenthetical that is not a known title is still ignored', () => {
    const result = checkReferences(
      'The results (in a quite unrelated sense, 2020) were mixed.',
      LIST
    );
    expect(result.counts.inText).toBe(0);
  });
});

describe('MLA 9: the author and a short title', () => {
  const BELOVED = {
    id: 'b',
    type: 'book',
    authors: ['Morrison, Toni'],
    title: 'Beloved',
    publicationDate: '1987',
  };
  const BLUEST = {
    id: 'e',
    type: 'book',
    authors: ['Morrison, Toni'],
    title: 'The Bluest Eye',
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
  const LIST = [BELOVED, BLUEST, REFORM, RHETORIC];

  test('each named work marks its own record', () => {
    const result = checkReferences(essayCiting(LIST, 'mla9'), LIST);
    expect(result.counts.matched).toBe(4);
    allCited(result);
  });

  test('(Morrison, Beloved 27) is one citation of Beloved', () => {
    const [entry] = extractInTextCitations(
      'As she writes (Morrison, Beloved 27).',
      ['morrison'],
      ['beloved']
    );
    expect(entry).toMatchObject({ families: ['Morrison'], year: null });
  });
});

describe('the checker letters with the chosen style’s rules', () => {
  // Cite Them Right never prints "Anonymous": a signed-Anonymous work is filed by its title, so
  // the two Beowulfs are 2010a and 2010b and Aardvark is unlettered. APA's rules would letter the
  // two Anonymous works instead, and the essay's 2010a would be matched to the wrong Beowulf.
  const signed = (id, title) => ({
    id,
    type: 'book',
    authors: ['Anonymous'],
    title,
    publisher: 'Pub',
    publicationDate: '2010',
  });
  const AARDVARK = signed('n1', 'Aardvark');
  const SIGNED_BEOWULF = signed('n2', 'Beowulf');
  const UNSIGNED_BEOWULF = { ...signed('n3', 'Beowulf'), authors: [] };
  const LIST = [AARDVARK, SIGNED_BEOWULF, UNSIGNED_BEOWULF];

  test('Harvard: each lettered Beowulf marks its own record', () => {
    const result = checkReferences(essayCiting(LIST, 'harvard'), LIST, 'harvard');
    allCited(result);
    for (const { inText, citation } of result.citedAndListed) {
      const record = LIST.find(r => r.id === citation.id);
      expect(inText.raw).toContain(
        formatInText(record, 'harvard', { set: LIST, locator: '5' }).slice(1, -1)
      );
    }
  });
});
