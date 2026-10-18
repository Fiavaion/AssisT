/**
 * @jest-environment jsdom
 *
 * Rules confirmed against the official CSL styles (scripts/csl-crosscheck.mjs) and the style
 * guides they follow (STYLE-RULES.md):
 *   A. an edition stored as a number prints as an ordinal in every style
 *   B. APA 7 §8.14: a title in the author position of an in-text citation takes title case
 *   C. page ranges take an en dash; MLA 9 and CMOS 17 §9.61 shorten the second number
 *   D. MLA 9: the location (DOI or URL) follows the container's other elements after a comma
 *   E. Chicago 17 undated: (Walsh, n.d.), and n.d.-a / n.d.-b for one author's undated works
 *   F. Chicago 17 web page: a publication date replaces the accessed date
 *   G. Harvard (Cite Them Right): "(eds)" without a full stop, "(ed.)" with one
 *   H. Harvard: two people with the same surname, initials and year are told apart by given name
 */

import {
  formatReference,
  formatInText,
  formatBibliography,
} from '../../../src/features/citations/citation-styles/index.js';
import {
  editionLabel,
  pageRange,
  titleCase,
} from '../../../src/features/citations/citation-styles/shared.js';
import { checkReferences } from '../../../src/features/citations/reference-check.js';

const bookWithEdition = edition => ({
  type: 'book',
  authors: ['Murphy, Ciara'],
  title: 'Inclusive teaching: a practical guide',
  publisher: 'Routledge',
  publicationDate: '2019',
  extra: { edition, place: 'London' },
});

const article = (extra = {}) => ({
  type: 'journal',
  authors: ['Okafor, Chidi', 'Walsh, Niamh'],
  title: 'Text-to-speech and reading comprehension',
  siteName: 'Journal of Learning Sciences',
  publicationDate: '2021',
  doi: '10.5555/jls.2021.jd1',
  extra: { volume: '12', issue: '3', pages: '101-120' },
  ...extra,
});

describe('A. edition ordinals', () => {
  test('a numeric edition prints as an ordinal in every style', () => {
    const book = bookWithEdition('2');
    expect(formatReference(book, 'harvard')).toBe(
      'Murphy, C. (2019) Inclusive teaching: a practical guide. 2nd edn. London: Routledge.'
    );
    expect(formatReference(book, 'apa7')).toBe(
      'Murphy, C. (2019). Inclusive teaching: a practical guide (2nd ed.). Routledge.'
    );
    expect(formatReference(book, 'mla9')).toBe(
      'Murphy, Ciara. Inclusive teaching: a practical guide. 2nd ed., Routledge, 2019.'
    );
    expect(formatReference(book, 'chicago17')).toBe(
      'Murphy, Ciara. 2019. Inclusive teaching: a practical guide. 2nd ed. London: Routledge.'
    );
  });

  test.each([
    ['1', '1st'],
    ['2', '2nd'],
    ['3', '3rd'],
    ['4', '4th'],
    ['11', '11th'],
    ['12', '12th'],
    ['13', '13th'],
    ['21', '21st'],
    ['22', '22nd'],
    ['101', '101st'],
    ['111', '111th'],
  ])('edition %s is the %s', (edition, ordinal) => {
    expect(editionLabel(edition, 'ed.')).toBe(`${ordinal} ed.`);
  });

  test('a written edition is kept as typed, and its suffix is never doubled', () => {
    expect(editionLabel('Revised', 'ed.')).toBe('Revised ed.');
    expect(editionLabel('2nd', 'ed.')).toBe('2nd ed.');
    expect(editionLabel('2nd ed.', 'ed.')).toBe('2nd ed.');
    expect(editionLabel('2nd ed', 'edn.')).toBe('2nd edn.');
    expect(editionLabel('3rd edition', 'edn.')).toBe('3rd edn.');
    expect(editionLabel('2nd edn.', 'ed.')).toBe('2nd ed.');
    expect(editionLabel(' 2 ', 'ed.')).toBe('2nd ed.');
    expect(editionLabel('', 'ed.')).toBe('');
    expect(formatReference(bookWithEdition('Revised'), 'apa7')).toContain('(Revised ed.)');
    expect(formatReference(bookWithEdition('2nd ed.'), 'harvard')).toContain(' 2nd edn. ');
  });

  test('a chapter in a numbered edition prints the ordinal too', () => {
    const chapter = {
      type: 'chapter',
      authors: ['Kelly, Sean'],
      title: 'Assistive technology and dyslexia',
      siteName: 'Handbook of learning differences',
      publisher: 'Palgrave Macmillan',
      publicationDate: '2018',
      extra: { edition: '3', pages: '45-67', editors: ['Doyle, Mary'] },
    };
    expect(formatReference(chapter, 'harvard')).toContain('. 3rd edn. ');
    expect(formatReference(chapter, 'apa7')).toContain('(3rd ed., pp. 45–67)');
    expect(formatReference(chapter, 'mla9')).toContain(', 3rd ed., ');
    expect(formatReference(chapter, 'chicago17')).toContain(', 3rd ed., ');
  });
});

describe('B. APA 7 in-text title case', () => {
  const page = (title, date = '2023') => ({
    type: 'website',
    authors: [],
    title,
    siteName: 'Student Support Online',
    publicationDate: date,
    url: 'https://example.org/wna1',
  });

  test('a no-author title in text takes title case; the reference keeps it as recorded', () => {
    const p = page('Guidance on reasonable adjustments');
    expect(formatInText(p, 'apa7')).toBe('(Guidance on Reasonable Adjustments, 2023)');
    expect(formatReference(p, 'apa7')).toContain('Guidance on reasonable adjustments. (2023');
    expect(formatInText(page('Accessible fonts explained', ''), 'apa7')).toBe(
      '(Accessible Fonts Explained, n.d.)'
    );
  });

  test('the shortened title is title-cased too', () => {
    expect(
      formatInText(page('Climate change and public health: a review of the evidence', '2022'), 'apa7')
    ).toBe('(Climate Change and Public Health, 2022)');
    expect(
      formatInText(
        page('The long and winding history of assistive reading technologies in schools', '2020'),
        'apa7'
      )
    ).toBe('(The Long and Winding History, 2020)');
  });

  test('a quoted article title in text is title-cased inside its quotation marks', () => {
    expect(formatInText(article({ authors: [] }), 'apa7')).toBe(
      '("Text-to-Speech and Reading Comprehension," 2021)'
    );
  });

  test('the other styles leave the in-text title as recorded', () => {
    const p = page('Guidance on reasonable adjustments');
    expect(formatInText(p, 'harvard')).toBe('(Guidance on reasonable adjustments, 2023)');
  });

  test('the essay checker still matches the title-cased form', () => {
    const p = { ...page('Guidance on reasonable adjustments'), id: 'g' };
    const essay = `A claim ${formatInText(p, 'apa7')}.`;
    expect(checkReferences(essay, [p], 'apa7').counts.matched).toBe(1);
  });
});

describe('titleCase (APA 7 §6.17)', () => {
  test.each([
    ['guidance on reasonable adjustments', 'Guidance on Reasonable Adjustments'],
    ['the NHS guide to iPhone use', 'The NHS Guide to iPhone Use'],
    ['learning with and from peers', 'Learning With and From Peers'],
    ['what it is for', 'What It Is For'],
    ['a study of reading: the end of an era', 'A Study of Reading: The End of an Era'],
    ['text-to-speech in the classroom', 'Text-to-Speech in the Classroom'],
    ['self-report and on-screen reading', 'Self-Report and On-Screen Reading'],
    ['"quoted" words in a title', '"Quoted" Words in a Title'],
    ['Already Title Case Of A Kind', 'Already Title Case of a Kind'],
    ['', ''],
  ])('%s → %s', (input, output) => {
    expect(titleCase(input)).toBe(output);
  });
});

describe('C. page ranges', () => {
  test.each([
    // MLA 9: the second number in full through 99, else its last two digits unless more are needed
    ['mla', '21-48', '21–48'],
    ['mla', '96-101', '96–101'],
    ['mla', '101-120', '101–20'],
    ['mla', '101-108', '101–08'],
    ['mla', '923-1001', '923–1001'],
    ['mla', '1003-1005', '1003–05'],
    ['mla', '1608-1774', '1608–774'],
    // CMOS 17 §9.61
    ['chicago', '3-10', '3–10'],
    ['chicago', '71-72', '71–72'],
    ['chicago', '96-117', '96–117'],
    ['chicago', '100-104', '100–104'],
    ['chicago', '1100-1113', '1100–1113'],
    ['chicago', '101-108', '101–8'],
    ['chicago', '808-833', '808–33'],
    ['chicago', '1103-1104', '1103–4'],
    ['chicago', '321-328', '321–28'],
    ['chicago', '498-532', '498–532'],
    ['chicago', '1087-1089', '1087–89'],
    ['chicago', '1496-1500', '1496–500'],
    ['chicago', '1536-1538', '1536–38'],
    ['chicago', '11564-11615', '11564–615'],
    ['chicago', '12991-13001', '12991–3001'],
    ['chicago', '101-120', '101–20'],
    // APA and Harvard: both numbers in full
    ['full', '101-120', '101–120'],
    ['full', '1103 - 1104', '1103–1104'],
    ['full', '45–67', '45–67'],
  ])('%s: %s → %s', (mode, input, output) => {
    expect(pageRange(input, mode)).toBe(output);
  });

  test.each(['e12-e19', 'xii-xv', '45', 'S1-S8', '120-101', '12, 14'])(
    '%s is left as typed',
    input => {
      expect(pageRange(input, 'chicago')).toBe(input);
      expect(pageRange(input, 'mla')).toBe(input);
      expect(pageRange(input, 'full')).toBe(input);
    }
  );

  test('each style prints a journal page range its own way', () => {
    const a = article();
    expect(formatReference(a, 'harvard')).toContain(', pp. 101–120.');
    expect(formatReference(a, 'apa7')).toContain(', 101–120.');
    expect(formatReference(a, 'mla9')).toContain(', pp. 101–20,');
    expect(formatReference(a, 'chicago17')).toContain(': 101–20.');
  });

  test('a newspaper page range takes the en dash too', () => {
    const news = {
      type: 'newspaper',
      authors: ['Byrne, Aoife'],
      title: 'Exams go digital',
      siteName: 'The Irish Times',
      publicationDate: '2024-03-04',
      extra: { pages: '12-14' },
    };
    expect(formatReference(news, 'harvard')).toContain(', pp. 12–14.');
    expect(formatReference(news, 'apa7')).toContain('The Irish Times, pp. 12–14.');
    expect(formatReference(news, 'mla9')).toContain(', pp. 12–14.');
    expect(formatReference(news, 'chicago17')).toContain(', 12–14.');
  });
});

describe('D. MLA 9 location after a comma', () => {
  test('a journal article: the DOI is the last element of the container, after a comma', () => {
    expect(formatReference(article(), 'mla9')).toBe(
      'Okafor, Chidi, and Niamh Walsh. "Text-to-speech and reading comprehension." Journal of Learning Sciences, vol. 12, no. 3, 2021, pp. 101–20, https://doi.org/10.5555/jls.2021.jd1.'
    );
  });

  test('an article read at a URL takes the same comma', () => {
    const a = article({ doi: '', url: 'https://j.example/a' });
    expect(formatReference(a, 'mla9')).toMatch(/pp\. 101–20, https:\/\/j\.example\/a\.$/);
  });

  test('a book and a chapter found by DOI close the container with the DOI after a comma', () => {
    const book = { ...bookWithEdition(''), doi: '10.1/b' };
    expect(formatReference(book, 'mla9')).toBe(
      'Murphy, Ciara. Inclusive teaching: a practical guide. Routledge, 2019, https://doi.org/10.1/b.'
    );
    const chapter = {
      type: 'chapter',
      authors: ['Kelly, Sean'],
      title: 'Assistive technology and dyslexia',
      siteName: 'Handbook of learning differences',
      publisher: 'Palgrave Macmillan',
      publicationDate: '2018',
      doi: '10.1/c',
      extra: { pages: '45-67' },
    };
    expect(formatReference(chapter, 'mla9')).toBe(
      'Kelly, Sean. "Assistive technology and dyslexia." Handbook of learning differences, Palgrave Macmillan, 2018, pp. 45–67, https://doi.org/10.1/c.'
    );
  });
});

describe('E. Chicago 17 undated works', () => {
  const page = (id, title) => ({
    id,
    type: 'website',
    authors: ['Walsh, Peter'],
    title,
    siteName: 'Writing Centre',
    url: `https://example.org/${id}`,
    accessDate: '2026-03-14',
  });
  const planning = page('uda1', 'Planning an essay');
  const editing = page('uda2', 'Editing your draft');
  const pair = [planning, editing];

  test('a comma before n.d. in text', () => {
    expect(formatInText(planning, 'chicago17')).toBe('(Walsh, n.d.)');
    expect(formatInText(planning, 'chicago17', { locator: '2' })).toBe('(Walsh, n.d., 2)');
    expect(formatInText({ ...planning, authors: [] }, 'chicago17')).toBe(
      '("Planning an essay," n.d.)'
    );
  });

  test('one author’s undated works are lettered n.d.-a, n.d.-b in list and text', () => {
    expect(formatInText(editing, 'chicago17', { set: pair })).toBe('(Walsh, n.d.-a)');
    expect(formatInText(planning, 'chicago17', { set: pair, locator: '2' })).toBe(
      '(Walsh, n.d.-b, 2)'
    );
    expect(formatBibliography(pair, 'chicago17')).toBe(
      'Walsh, Peter. n.d.-a. "Editing your draft." Writing Centre. Accessed March 14, 2026. https://example.org/uda2.\n\n' +
        'Walsh, Peter. n.d.-b. "Planning an essay." Writing Centre. Accessed March 14, 2026. https://example.org/uda1.'
    );
  });

  test('a dated work keeps the plain form', () => {
    expect(formatInText({ ...planning, publicationDate: '2020' }, 'chicago17')).toBe(
      '(Walsh 2020)'
    );
  });

  test('the essay checker matches the lettered undated forms', () => {
    const essay = pair
      .map(r => `A claim ${formatInText(r, 'chicago17', { set: pair })}.`)
      .join(' ');
    expect(checkReferences(essay, pair, 'chicago17').counts.matched).toBe(2);
  });
});

describe('F. Chicago 17 web page with a publication date', () => {
  const page = publicationDate => ({
    type: 'website',
    authors: ['Quinlan, Rory'],
    title: 'How screen readers handle maths',
    siteName: 'Accessibility Weekly',
    url: 'https://example.org/wf1',
    publicationDate,
    accessDate: '2026-03-14',
  });

  test('a full publication date is printed and the accessed date left out', () => {
    expect(formatReference(page('2024-06-05'), 'chicago17')).toBe(
      'Quinlan, Rory. 2024. "How screen readers handle maths." Accessibility Weekly. June 5, 2024. https://example.org/wf1.'
    );
  });

  test('a year alone is not repeated, and there is still no accessed date', () => {
    expect(formatReference(page('2024'), 'chicago17')).toBe(
      'Quinlan, Rory. 2024. "How screen readers handle maths." Accessibility Weekly. https://example.org/wf1.'
    );
  });

  test('an undated page keeps its accessed date', () => {
    expect(formatReference(page(''), 'chicago17')).toBe(
      'Quinlan, Rory. n.d. "How screen readers handle maths." Accessibility Weekly. Accessed March 14, 2026. https://example.org/wf1.'
    );
  });
});

describe('G. Harvard editors', () => {
  const chapter = editors => ({
    type: 'chapter',
    authors: ['Kelly, Sean'],
    title: 'Assistive technology and dyslexia',
    siteName: 'Handbook of learning differences',
    publisher: 'Palgrave Macmillan',
    publicationDate: '2018',
    extra: { editors, place: 'Basingstoke', pages: '45-67' },
  });

  test('several editors take "(eds)" without a full stop', () => {
    expect(formatReference(chapter(['Doyle, Mary', 'Hart, Tom']), 'harvard')).toBe(
      "Kelly, S. (2018) 'Assistive technology and dyslexia', in Doyle, M. and Hart, T. (eds) Handbook of learning differences. Basingstoke: Palgrave Macmillan, pp. 45–67."
    );
  });

  test('one editor keeps "(ed.)"', () => {
    expect(formatReference(chapter(['Doyle, Mary']), 'harvard')).toContain(
      'in Doyle, M. (ed.) Handbook'
    );
  });
});

describe('H. Harvard: same surname, same initials, same year', () => {
  const art = (id, name, title, date = '2021') => ({
    id,
    type: 'book',
    authors: [name],
    title,
    publisher: 'Pub',
    publicationDate: date,
  });
  const john = art('john', 'Smith, John', 'Captioning lectures');
  const jane = art('jane', 'Smith, Jane', 'Reading rulers in practice');
  const mary = art('mary', 'Smith, Mary', 'Gamma');
  const jane2019 = art('jane19', 'Smith, Jane', 'Reading rulers in practice', '2019');

  test('the full given name tells them apart in list and text', () => {
    const list = [john, jane];
    expect(formatReference(john, 'harvard', { set: list })).toBe(
      'Smith, John (2021) Captioning lectures. Pub.'
    );
    expect(formatInText(john, 'harvard', { set: list })).toBe('(John Smith, 2021)');
    expect(formatInText(jane, 'harvard', { set: list, locator: '4' })).toBe(
      '(Jane Smith, 2021, p. 4)'
    );
  });

  test('different initials keep the initials rule; different years stay plain', () => {
    expect(formatInText(john, 'harvard', { set: [john, mary] })).toBe('(Smith, J., 2021)');
    expect(formatReference(john, 'harvard', { set: [john, mary] })).toBe(
      'Smith, J. (2021) Captioning lectures. Pub.'
    );
    expect(formatInText(john, 'harvard', { set: [john, jane2019] })).toBe('(Smith, 2021)');
    expect(formatReference(john, 'harvard', { set: [john, jane2019] })).toBe(
      'Smith, J. (2021) Captioning lectures. Pub.'
    );
  });

  test('the essay checker matches each Smith to their own work', () => {
    const list = [john, jane];
    const essay = list
      .map(r => `A claim ${formatInText(r, 'harvard', { set: list })}.`)
      .join(' ');
    const result = checkReferences(essay, list, 'harvard');
    expect(result.counts.matched).toBe(2);
    expect(result.listedNotCited).toEqual([]);
  });
});
