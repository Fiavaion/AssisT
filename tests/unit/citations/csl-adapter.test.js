/**
 * CSL-JSON adapter tests.
 *
 * Locks the three guarantees:
 *   1. Internal round-trip is lossless: fromCSL(toCSL(x)) === normalizeCitation(x).
 *   2. toCSL emits well-formed CSL (type map, structured authors, date-parts).
 *   3. A foreign CSL item (no overflow bag) still converts to a sensible flat record.
 */

import { toCSL, fromCSL } from '../../../src/features/citations/csl-adapter.js';
import { normalizeCitation } from '../../../src/features/citations/citation-types.js';

describe('CSL adapter — lossless internal round-trip', () => {
  it('fromCSL(toCSL(flat)) equals normalizeCitation(flat)', () => {
    const flat = {
      type: 'journal',
      url: 'https://example.org/a',
      title: 'Working Memory in Dyslexia',
      authors: ['Smith, Jane', 'Doe, John'],
      publicationDate: '2021',
      accessDate: '2024-01-15',
      publisher: 'Elsevier',
      siteName: 'Journal of Learning',
      doi: '10.1/x',
      isbn: '',
      issn: '1234-5678',
      extra: { volume: '12', issue: '3', pages: '45-60', subtype: 'journal-article' },
      notes: 'key source',
      tags: ['memory', 'dyslexia'],
      projectId: 'p1',
      createdAt: 1700000000000,
      updatedAt: 1700000001000,
    };
    expect(fromCSL(toCSL(flat))).toEqual(normalizeCitation(flat));
  });

  it('emits CSL chapter and thesis for the two book-adjacent types', () => {
    const chapter = normalizeCitation({
      type: 'chapter',
      title: 'A chapter',
      siteName: 'The Handbook',
      publicationDate: '2015',
    });
    const thesis = normalizeCitation({ type: 'thesis', title: 'A thesis', publicationDate: '2022' });
    expect(toCSL(chapter).type).toBe('chapter');
    expect(toCSL(thesis).type).toBe('thesis');
    expect(fromCSL(toCSL(chapter)).type).toBe('chapter');
    expect(fromCSL(toCSL(thesis)).type).toBe('thesis');
  });

  it('preserves the canonical type for pdf/other (which both collapse to CSL webpage/document)', () => {
    const pdf = normalizeCitation({ type: 'pdf', title: 'T', url: 'https://x', accessDate: '2024-01-01' });
    const other = normalizeCitation({ type: 'other', title: 'T', url: 'https://x', accessDate: '2024-01-01' });
    expect(fromCSL(toCSL(pdf)).type).toBe('pdf');
    expect(fromCSL(toCSL(other)).type).toBe('other');
  });
});

describe('CSL adapter — toCSL emits well-formed CSL', () => {
  it('maps canonical type, structures a single-token org as literal, and emits date-parts', () => {
    const csl = toCSL({
      type: 'book',
      title: 'World Report',
      authors: ['UNESCO'],
      publicationDate: '2020',
      url: 'https://x',
      publisher: 'UN Press',
    });
    expect(csl.type).toBe('book');
    expect(csl.author).toEqual([{ literal: 'UNESCO' }]);
    expect(csl.issued).toEqual({ 'date-parts': [[2020]] });
    expect(csl.publisher).toBe('UN Press');
  });

  it('splits a "Family, Given" author into structured parts', () => {
    const csl = toCSL({ type: 'journal', title: 'T', authors: ['Okonkwo, Amara'], url: 'https://x' });
    expect(csl.author).toEqual([{ family: 'Okonkwo', given: 'Amara' }]);
  });
});

describe('CSL adapter — foreign CSL import', () => {
  it('converts an externally-authored CSL item with no overflow bag', () => {
    const foreign = {
      type: 'article-journal',
      title: 'External Paper',
      author: [{ family: 'Lee', given: 'Kim' }],
      issued: { 'date-parts': [[2019, 5]] },
      DOI: '10.2/y',
      'container-title': 'Nature',
    };
    const flat = fromCSL(foreign);
    expect(flat.type).toBe('journal');
    expect(flat.authors).toEqual(['Lee, Kim']);
    expect(flat.publicationDate).toBe('2019-05');
    expect(flat.doi).toBe('10.2/y');
    expect(flat.siteName).toBe('Nature');
  });
});

describe('CSL adapter — chapter and thesis fields ride in CSL, not only in the overflow bag', () => {
  const chapter = {
    type: 'chapter',
    title: 'Drawing as thinking',
    siteName: 'The Handbook of Art Education',
    authors: ['Roe, Richard'],
    publisher: 'Pub House',
    publicationDate: '2015',
    isbn: '',
    issn: '',
    projectId: null,
    createdAt: 1700000000000,
    extra: {
      editors: ['Smith, Ann', 'Jones, Bob'],
      edition: '2nd',
      place: 'London',
      pages: '10-20',
    },
  };

  const thesis = {
    type: 'thesis',
    title: 'Tactile interfaces for dyslexic readers',
    authors: ['Nolan, Aoife'],
    publicationDate: '2022',
    url: 'https://repo.ncad.ie/thesis',
    isbn: '',
    issn: '',
    projectId: null,
    createdAt: 1700000000000,
    extra: { thesisType: 'PhD thesis', institution: 'National College of Art and Design' },
  };

  it('emits a chapter as idiomatic CSL', () => {
    const csl = toCSL(chapter);
    expect(csl['container-title']).toBe('The Handbook of Art Education');
    expect(csl.editor).toEqual([
      { family: 'Smith', given: 'Ann' },
      { family: 'Jones', given: 'Bob' },
    ]);
    expect(csl.edition).toBe('2nd');
    expect(csl['publisher-place']).toBe('London');
    expect(csl.page).toBe('10-20');
  });

  it('emits a thesis as idiomatic CSL, the institution as its publisher', () => {
    const csl = toCSL(thesis);
    expect(csl.genre).toBe('PhD thesis');
    expect(csl.publisher).toBe('National College of Art and Design');
  });

  it('round-trips a chapter and a thesis without loss', () => {
    expect(fromCSL(toCSL(chapter))).toEqual(normalizeCitation(chapter));
    expect(fromCSL(toCSL(thesis))).toEqual(normalizeCitation(thesis));
  });

  it('keeps a thesis publisher of its own out of the institution slot', () => {
    const withPublisher = { ...thesis, publisher: 'ProQuest', extra: { thesisType: 'PhD thesis' } };
    expect(fromCSL(toCSL(withPublisher))).toEqual(normalizeCitation(withPublisher));
  });

  it('reads those fields back from a foreign CSL item that has no overflow bag', () => {
    const foreignChapter = {
      type: 'chapter',
      title: 'A chapter',
      'container-title': 'A Handbook',
      editor: [{ family: 'Smith', given: 'Ann' }],
      edition: '3rd',
      'publisher-place': 'Dublin',
      publisher: 'Pub House',
      page: '1-9',
    };
    const flat = fromCSL(foreignChapter);
    expect(flat.type).toBe('chapter');
    expect(flat.siteName).toBe('A Handbook');
    expect(flat.extra.editors).toEqual(['Smith, Ann']);
    expect(flat.extra.edition).toBe('3rd');
    expect(flat.extra.place).toBe('Dublin');
    expect(flat.extra.pages).toBe('1-9');

    const foreignThesis = {
      type: 'thesis',
      title: 'A thesis',
      genre: 'PhD thesis',
      publisher: 'University of Limerick',
    };
    const flatThesis = fromCSL(foreignThesis);
    expect(flatThesis.extra.thesisType).toBe('PhD thesis');
    expect(flatThesis.extra.institution).toBe('University of Limerick');
  });

  it('carries a generational suffix through the CSL name object', () => {
    const suffixed = { type: 'book', title: 'A book', authors: ['King, Martin Luther, Jr.'] };
    expect(toCSL(suffixed).author).toEqual([
      { family: 'King', given: 'Martin Luther', suffix: 'Jr.' },
    ]);
    expect(fromCSL(toCSL(suffixed)).authors).toEqual(['King, Martin Luther, Jr.']);
  });
});

describe('CSL adapter — the shapes a CSL processor reads', () => {
  // The fields fromCSL always writes back, as a stored record carries them.
  const stored = { isbn: '', issn: '', projectId: null };
  const video = {
    ...stored,
    type: 'video',
    title: 'Soft robotic gripper for jellyfish',
    authors: ['Harvard University'],
    siteName: 'YouTube',
    url: 'https://www.youtube.com/watch?v=1',
    publicationDate: '2019-08-28',
    extra: { organisationAuthors: ['Harvard University'] },
  };

  it('writes a video’s platform as its publisher, with genre Video (the shape Zotero writes)', () => {
    const csl = toCSL(video);
    expect(csl.publisher).toBe('YouTube');
    expect(csl.genre).toBe('Video');
    expect(csl['container-title']).toBeUndefined();
  });

  it('round-trips a video, and a video that also records a publisher, without loss', () => {
    const flat = normalizeCitation(video);
    expect(fromCSL(toCSL(flat))).toEqual(flat);
    const withPublisher = normalizeCitation({ ...video, publisher: 'Harvard Media' });
    expect(fromCSL(toCSL(withPublisher))).toEqual(withPublisher);
  });

  it('imports a Zotero-shaped video: the publisher is the platform, and Video is no degree', () => {
    const flat = fromCSL({
      type: 'motion_picture',
      title: 'A lecture',
      publisher: 'YouTube',
      genre: 'Video',
    });
    expect(flat.type).toBe('video');
    expect(flat.siteName).toBe('YouTube');
    expect(flat.publisher).toBe('');
    expect(flat.extra.thesisType).toBeUndefined();
  });

  it('writes title-short with the short title the styles print in text', () => {
    const page = {
      ...stored,
      type: 'website',
      title: 'Climate change and public health: a review of the evidence',
      url: 'https://example.org/stl1',
    };
    expect(toCSL(page)['title-short']).toBe('Climate change and public health');
    const flat = normalizeCitation(page);
    expect(fromCSL(toCSL(flat))).toEqual(flat);
  });

  it('writes no title-short when the title is already short', () => {
    expect(toCSL({ type: 'website', title: 'Accessible fonts explained' })['title-short']).toBe(
      undefined
    );
  });
});
