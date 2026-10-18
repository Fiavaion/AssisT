/**
 * @jest-environment jsdom
 *
 * The "check capitals" hint. AssisT never changes a title's capitals (it would break proper
 * nouns), but it says so, in plain words and without blocking anything, when a title's capitals
 * do not match the chosen style: sentence case for APA and Harvard article and book titles, title
 * case for MLA and Chicago. The detection is conservative: a title that is plausibly right, or
 * mostly acronyms and proper nouns, is never flagged.
 */

import {
  assessCitation,
  LEVELS,
  FIELDS,
} from '../../../src/features/citations/reassurance-engine.js';

const complete = {
  type: 'journal',
  authors: ['Smith, Jane'],
  publicationDate: '2021',
  url: 'https://j.example/a',
  siteName: 'Journal of Things',
};

const hintFor = (title, style, type = 'journal') =>
  assessCitation({ ...complete, type, title }, { style }).reasons.find(
    r => r.field === FIELDS.TITLE && /capitals/.test(r.message)
  );

describe('sentence-case styles (APA 7, Harvard) flag a title-cased article or book title', () => {
  test('Harvard, article', () => {
    const hint = hintFor('The Effects of Climate Change on Coral Reefs', 'harvard');
    expect(hint).toEqual({
      level: LEVELS.AMBER,
      field: FIELDS.TITLE,
      message: 'Harvard writes article titles in sentence case: check the capitals.',
    });
  });
  test('APA, book', () => {
    expect(
      hintFor('Teaching Reading Across Diverse Primary Classrooms', 'apa7', 'book').message
    ).toBe('APA writes book titles in sentence case: check the capitals.');
  });
  test('the hint is advice, never a block: the verdict is amber at worst', () => {
    const verdict = assessCitation(
      { ...complete, title: 'The Effects of Climate Change on Coral Reefs' },
      { style: 'harvard' }
    );
    expect(verdict.level).toBe(LEVELS.AMBER);
  });
});

describe('title-case styles (MLA 9, Chicago 17) flag a sentence-cased title', () => {
  test('MLA', () => {
    expect(hintFor('The effects of climate change on coral reefs', 'mla9').message).toBe(
      'MLA writes titles in title case: check the capitals.'
    );
  });
  test('Chicago, a web page too', () => {
    expect(
      hintFor('Why reading aloud helps younger students remember', 'chicago17', 'website').message
    ).toBe('Chicago writes titles in title case: check the capitals.');
  });
});

describe('plausibly right titles are left alone', () => {
  test.each([
    ['sentence case under Harvard', 'The effects of climate change on coral reefs', 'harvard'],
    ['proper nouns under Harvard', 'Learning in the Irish Gaeltacht', 'harvard'],
    ['acronyms under APA', 'NASA and ESA: Joint Missions to the ISS', 'apa7'],
    ['a short title under APA', 'Half of a Yellow Sun', 'apa7'],
    ['title case under MLA', 'The Effects of Climate Change on Coral Reefs', 'mla9'],
    ['a short sentence-case title under Chicago', 'Learning at scale', 'chicago17'],
    ['little words lower case under Chicago', 'A Walk through the Woods of Kerry', 'chicago17'],
    [
      'a subtitle after a colon under Harvard',
      'Dyslexia: A practical guide for teachers',
      'harvard',
    ],
  ])('%s', (_, title, style) => {
    expect(hintFor(title, style)).toBeUndefined();
  });

  test('Harvard and APA say nothing about a web page title', () => {
    expect(
      hintFor('The Effects of Climate Change on Coral Reefs', 'harvard', 'website')
    ).toBeUndefined();
  });

  test('with no style given there is no hint', () => {
    expect(hintFor('The Effects of Climate Change on Coral Reefs', undefined)).toBeUndefined();
  });

  test('a complete record with a well-capitalised title is still green', () => {
    const verdict = assessCitation(
      { ...complete, title: 'The effects of climate change on coral reefs' },
      { style: 'apa7' }
    );
    expect(verdict.level).toBe(LEVELS.GREEN);
  });
});

describe('no author reads as the title, never "Anon."', () => {
  test('the missing-author reason says what the styles will do', () => {
    const verdict = assessCitation({ ...complete, title: 'A page', authors: [] });
    const reason = verdict.reasons.find(r => r.field === FIELDS.AUTHOR);
    expect(reason.message).not.toMatch(/Anon/);
    expect(reason.message).toMatch(/title/);
  });
  test('a work signed Anonymous is not an author problem', () => {
    const verdict = assessCitation({ ...complete, title: 'A page', authors: ['Anonymous'] });
    expect(verdict.reasons.find(r => r.field === FIELDS.AUTHOR)).toBeUndefined();
  });
});
