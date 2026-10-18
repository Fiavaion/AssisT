/**
 * @jest-environment jsdom
 *
 * Who a work is by, as each style prints it, and what the formatters make of the dates and titles
 * a student types.
 *
 * - Same author means the same author list. John Smith and Jane Smith are two people, even though
 *   APA prints both as "Smith, J."; "J. Smith" is John only when no other J. Smith is in the list.
 * - Sort and letter keys use what the style prints in the author position: Cite Them Right never
 *   prints "Anonymous", so a work signed Anonymous is filed and lettered by its title in Harvard.
 * - In-text citations have an HTML flavour with the same italics and escaping as the reference.
 * - Dates typed in the wizard keep every part that is certain.
 * - Short titles end on a noun phrase.
 * - APA web pages carry their full date, MLA journals their month, and MLA's in-text citation a
 *   page only when the student gave one.
 */

import {
  formatReference,
  formatInText,
  formatBibliography,
} from '../../../src/features/citations/citation-styles/index.js';
import { dateParts, shortTitle } from '../../../src/features/citations/citation-styles/shared.js';

const book = (id, authors, title, date = '2020', extra = {}) => ({
  id,
  type: 'book',
  authors,
  title,
  publisher: 'Pub',
  publicationDate: date,
  ...extra,
});

describe('same author means the same person', () => {
  const JOHN = book('j1', ['Smith, John'], 'Alpha');
  const JANE = book('j2', ['Smith, Jane'], 'Beta');
  const PAIR = [JOHN, JANE];

  test('John Smith and Jane Smith are not lettered in APA, Harvard or Chicago', () => {
    expect(formatInText(JOHN, 'apa7', { set: PAIR })).toBe('(Smith, 2020)');
    // Harvard: the same initials in the same year name the person in full (CTR CSL style).
    expect(formatInText(JANE, 'harvard', { set: PAIR })).toBe('(Jane Smith, 2020)');
    // Not lettered: told apart as namesakes instead (citation-styles-namesakes.test.js).
    expect(formatInText(JANE, 'chicago17', { set: PAIR })).toBe('(Smith, Beta, 2020)');
    for (const style of ['apa7', 'harvard', 'chicago17']) {
      expect(formatBibliography(PAIR, style)).not.toMatch(/2020[ab]/);
    }
  });

  test('MLA does not print "---." for a different Smith, and names the person, not the work', () => {
    expect(formatBibliography(PAIR, 'mla9')).toBe(
      'Smith, Jane. Beta. Pub, 2020.\n\nSmith, John. Alpha. Pub, 2020.'
    );
    expect(formatInText(JOHN, 'mla9', { set: PAIR })).toBe('(John Smith)');
  });

  test('initials match a full name when they agree and nobody else could be meant', () => {
    const initialled = book('j3', ['Smith, J.'], 'Gamma');
    expect(formatInText(initialled, 'apa7', { set: [JOHN, initialled] })).toBe('(Smith, 2020b)');
    expect(formatInText(JOHN, 'apa7', { set: [JOHN, initialled] })).toBe('(Smith, 2020a)');
  });

  test('"J. Smith" beside both John and Jane is not assumed to be either', () => {
    const initialled = book('j3', ['Smith, J.'], 'Gamma');
    const set = [JOHN, JANE, initialled];
    expect(formatInText(initialled, 'apa7', { set })).toBe('(Smith, 2020)');
    expect(formatInText(JOHN, 'apa7', { set })).toBe('(Smith, 2020)');
    expect(formatBibliography(set, 'mla9')).not.toContain('---');
  });

  test('the same full name written two ways is one author', () => {
    const natural = book('j4', ['John Smith'], 'Delta');
    expect(formatInText(natural, 'chicago17', { set: [JOHN, natural] })).toBe('(Smith 2020b)');
  });
});

describe('sort and letter keys follow what the style prints', () => {
  const BEOWULF = book('n1', ['Anonymous'], 'Beowulf', '2010');
  const KINGS = book('n2', ['Anonymous'], 'Kings of old', '2010');
  const JONES = book('n3', ['Jones, Ann'], 'Cats', '2018');
  const SET = [KINGS, JONES, BEOWULF];

  test('Harvard files a work signed Anonymous under its title', () => {
    expect(formatBibliography(SET, 'harvard')).toBe(
      [
        'Beowulf (2010) Pub.',
        'Jones, A. (2018) Cats. Pub.',
        'Kings of old (2010) Pub.',
      ].join('\n\n')
    );
  });

  test('Harvard does not letter two different titles because both were signed Anonymous', () => {
    expect(formatInText(BEOWULF, 'harvard', { set: SET })).toBe('(Beowulf, 2010)');
    expect(formatInText(KINGS, 'harvard', { set: SET })).toBe('(Kings of old, 2010)');
  });

  test('APA prints Anonymous, so it sorts and letters by Anonymous', () => {
    expect(formatInText(BEOWULF, 'apa7', { set: SET })).toBe('(Anonymous, 2010a)');
    expect(formatBibliography(SET, 'apa7').split('\n\n')[0]).toBe(
      'Anonymous. (2010a). Beowulf. Pub.'
    );
  });

  test('two works with no author and the same title in the same year are lettered', () => {
    const first = book('r1', [], 'Annual report', '2010', { publisher: 'North' });
    const second = book('r2', [], 'Annual report', '2010', { publisher: 'South' });
    const set = [first, second];
    expect(formatInText(first, 'harvard', { set })).toBe('(Annual report, 2010a)');
    expect(formatInText(second, 'apa7', { set })).toBe('(Annual Report, 2010b)');
    expect(formatInText(first, 'chicago17', { set })).toBe('(Annual report 2010a)');
  });

  test('no-author works with different titles are never lettered', () => {
    const first = book('r1', [], 'Annual report', '2010');
    const second = book('r2', [], 'Budget report', '2010');
    expect(formatInText(first, 'harvard', { set: [first, second] })).toBe('(Annual report, 2010)');
  });
});

describe('in-text citations have an HTML flavour', () => {
  const BELOVED = book('m1', ['Morrison, Toni'], 'Beloved', '1987');
  const JAZZ = book('m2', ['Morrison, Toni'], 'Jazz', '1992');
  const GUIDE = book('g1', [], 'The guide to note taking');

  test('MLA names the work in italics: (Morrison, <em>Beloved</em> 27)', () => {
    expect(
      formatInText(BELOVED, 'mla9', { set: [BELOVED, JAZZ], locator: '27', html: true })
    ).toBe('(Morrison, <em>Beloved</em> 27)');
  });

  test('an italic stand-in title is italic in APA, Harvard and Chicago', () => {
    expect(formatInText(GUIDE, 'apa7', { html: true })).toBe(
      '(<em>The Guide to Note Taking</em>, 2020)'
    );
    expect(formatInText(GUIDE, 'harvard', { html: true })).toBe(
      '(<em>The guide to note taking</em>, 2020)'
    );
    expect(formatInText(GUIDE, 'chicago17', { html: true })).toBe(
      '(<em>The guide to note taking</em> 2020)'
    );
  });

  test('plain text stays plain', () => {
    expect(formatInText(GUIDE, 'apa7')).toBe('(The Guide to Note Taking, 2020)');
    expect(formatInText(BELOVED, 'mla9', { set: [BELOVED, JAZZ] })).toBe('(Morrison, Beloved)');
  });

  test('page-derived text is escaped, and a stored marker cannot open an <em>', () => {
    const risky = book('x1', ['AT&T<i>'], 'Tom', '2020');
    const marked = book('x2', [], `Tom ${String.fromCharCode(1)}bold`, '2020');
    expect(formatInText(risky, 'apa7', { html: true })).toBe('(AT&amp;T&lt;i&gt;, 2020)');
    expect(formatInText(marked, 'apa7', { html: true })).toBe('(<em>Tom Bold</em>, 2020)');
  });
});

describe('dates typed in the wizard keep what is certain', () => {
  afterEach(() => jest.restoreAllMocks());

  test('an unambiguous day-first or month-first date keeps its day and month', () => {
    expect(dateParts('15/01/2020')).toEqual({ year: 2020, month: 1, day: 15, monthLong: 'January' });
    expect(dateParts('01/15/2020')).toEqual({ year: 2020, month: 1, day: 15, monthLong: 'January' });
  });

  test('an ambiguous numeric date follows the browser’s own order', () => {
    const language = jest.spyOn(window.navigator, 'language', 'get');
    language.mockReturnValue('en-US');
    expect(dateParts('03/04/2020')).toMatchObject({ month: 3, day: 4 });
    language.mockReturnValue('en-GB');
    expect(dateParts('03/04/2020')).toMatchObject({ month: 4, day: 3 });
  });

  test('month names in any common order', () => {
    expect(dateParts('Published June 2020')).toMatchObject({ year: 2020, month: 6, day: 0 });
    expect(dateParts('June 5, 2020')).toMatchObject({ year: 2020, month: 6, day: 5 });
    expect(dateParts('5 June 2020')).toMatchObject({ year: 2020, month: 6, day: 5 });
    expect(dateParts('Sept. 2020')).toMatchObject({ year: 2020, month: 9 });
    expect(dateParts('06/2020')).toMatchObject({ year: 2020, month: 6, day: 0 });
  });

  test('nothing is invented: an impossible date keeps only its year', () => {
    expect(dateParts('31/31/2020')).toEqual({ year: 2020, month: 0, day: 0, monthLong: '' });
    expect(dateParts('Marching season 2020')).toEqual({ year: 2020, month: 0, day: 0, monthLong: '' });
  });

  test('the wizard’s date reaches the reference', () => {
    const page = {
      type: 'website',
      authors: ['Smith, John'],
      title: 'Page',
      siteName: 'Site',
      publicationDate: '15/01/2020',
    };
    expect(formatReference(page, 'mla9')).toBe('Smith, John. "Page." Site, 15 Jan. 2020.');
  });
});

describe('short titles end on a noun phrase', () => {
  test('six words or fewer are kept whole', () => {
    expect(shortTitle('The guide to note taking')).toBe('The guide to note taking');
    expect(shortTitle('Reading support in the modern classroom: a review')).toBe(
      'Reading support in the modern classroom'
    );
  });

  test('a longer title is cut at a natural break, never on a little word or possessive', () => {
    expect(
      shortTitle('A history of the teaching of reading in English primary schools since 1950')
    ).toBe('A history of the teaching');
    expect(shortTitle('Strategies and tools for teachers supporting dyslexic learners today')).toBe(
      'Strategies and tools'
    );
    expect(shortTitle("Children's rights and their teachers' duties within modern schools")).toBe(
      "Children's rights and their teachers' duties"
    );
    expect(shortTitle("Notes on the teachers' and pupils' shared work in schools today")).toBe(
      'Notes'
    );
  });

  test('a long title with no break is cut to six words without a trailing little word', () => {
    expect(shortTitle('Seven quite remarkable unbroken words run the whole way')).toBe(
      'Seven quite remarkable unbroken words run'
    );
  });

  test('in text, no author: APA and MLA', () => {
    const guide = book('g1', [], 'The guide to note taking');
    expect(formatInText(guide, 'apa7')).toBe('(The Guide to Note Taking, 2020)');
    expect(formatInText(guide, 'mla9')).toBe('(Guide to note taking)');
  });
});

describe('dates and pages the styles print', () => {
  test('APA 7 web page with a full date: (2020, June 5)', () => {
    const page = {
      type: 'website',
      authors: ['Smith, John'],
      title: 'Page',
      siteName: 'Site',
      publicationDate: '2020-06-05',
      url: 'https://example.test/p',
    };
    expect(formatReference(page, 'apa7')).toBe(
      'Smith, J. (2020, June 5). Page. Site. https://example.test/p'
    );
  });

  test('APA 7 video and social-media post carry their full date, as APA’s examples do', () => {
    const video = {
      type: 'video',
      authors: ['Whitesides, George'],
      title: 'Soft robotic gripper for jellyfish',
      publicationDate: '2019-08-28',
      url: 'https://www.youtube.com/watch?v=guRoWTYfxMs',
    };
    const post = {
      type: 'social_media',
      authors: ['Gates, Bill'],
      title: 'Today is a great day',
      publicationDate: '2019-09-07',
      url: 'https://twitter.com/BillGates/status/1',
    };
    expect(formatReference(video, 'apa7')).toMatch(/^Whitesides, G\. \(2019, August 28\)\. /);
    expect(formatReference(post, 'apa7')).toMatch(/^Gates, B\. \(2019, September 7\)\. /);
    // The in-text citation keeps the year alone.
    expect(formatInText(video, 'apa7')).toBe('(Whitesides, 2019)');
  });

  test('MLA 9 journal keeps a recorded month', () => {
    const article = {
      type: 'journal',
      authors: ['Smith, John'],
      title: 'Article',
      siteName: 'Journal',
      publicationDate: '2020-06',
      extra: { volume: '3', issue: '2', pages: '45-67' },
    };
    expect(formatReference(article, 'mla9')).toBe(
      'Smith, John. "Article." Journal, vol. 3, no. 2, June 2020, pp. 45–67.'
    );
  });

  test('MLA in text gives a page only when the student gave one, never the article’s range', () => {
    const article = {
      type: 'journal',
      authors: ['Smith, John'],
      title: 'Article',
      siteName: 'Journal',
      publicationDate: '2020',
      extra: { pages: '45-67' },
    };
    expect(formatInText(article, 'mla9')).toBe('(Smith)');
    expect(formatInText(article, 'mla9', { locator: '50' })).toBe('(Smith 50)');
  });
});
