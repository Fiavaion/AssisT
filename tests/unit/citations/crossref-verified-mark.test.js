/**
 * @jest-environment jsdom
 *
 * Tests for the provenance mark CrossRef leaves on the metadata it returns.
 *
 * The mark is what the wizard's verification lock reads, so it has to survive the merge with
 * whatever the page already knew, and it has to be CrossRef's own — a stale mark on the incoming
 * record must not be allowed to outlive a fresh lookup.
 */

jest.mock('../../../src/utils/consent-panel.js', () => ({ askForConsent: jest.fn() }));

import { fetchDOIMetadata, enrichMetadataWithDOI } from '../../../src/features/citations/crossref-api.js';
import { askForConsent } from '../../../src/utils/consent-panel.js';

const CROSSREF_WORK = {
  message: {
    type: 'journal-article',
    title: ['Attention Is All You Need'],
    author: [{ family: 'Vaswani', given: 'Ashish' }],
    'container-title': ['NeurIPS'],
    publisher: 'Curran',
    DOI: '10.1000/xyz123',
    volume: '30',
    published: { 'date-parts': [[2017, 6, 12]] },
    URL: 'https://doi.org/10.1000/xyz123',
  },
};

// The lookup is made by the service worker (ADR 0006); this realm receives its reply.
beforeEach(() => {
  global.fetch = jest.fn();
  askForConsent.mockReset();
});

function mockCrossRefOk(work = CROSSREF_WORK) {
  chrome.runtime.sendMessage = jest.fn().mockResolvedValue({
    success: true,
    data: { work: work.message },
  });
}

describe('fetchDOIMetadata()', () => {
  test('marks what it returns as verified by CrossRef, with the time of the lookup', async () => {
    mockCrossRefOk();
    const metadata = await fetchDOIMetadata('10.1000/xyz123');
    expect(metadata.extra.verified.source).toBe('crossref');
    expect(Date.parse(metadata.extra.verified.at)).not.toBeNaN();
  });
});

describe('enrichMetadataWithDOI()', () => {
  test('carries the mark onto the page metadata it enriches', async () => {
    mockCrossRefOk();
    const enriched = await enrichMetadataWithDOI(
      { title: 'Attention is all you need', extra: { source: 'page' } },
      '10.1000/xyz123'
    );
    expect(enriched.extra.verified.source).toBe('crossref');
    expect(enriched.extra.source).toBe('page');
  });

  test('replaces a stale mark rather than letting the incoming one win', async () => {
    mockCrossRefOk();
    const enriched = await enrichMetadataWithDOI(
      { title: 'X', extra: { verified: { source: 'crossref', at: '1999-01-01T00:00:00.000Z' } } },
      '10.1000/xyz123'
    );
    expect(enriched.extra.verified.at).not.toBe('1999-01-01T00:00:00.000Z');
  });

  test('leaves the record untouched, and unmarked, when CrossRef has nothing', async () => {
    chrome.runtime.sendMessage = jest.fn().mockResolvedValue({ success: false, code: 'not-found' });
    const original = { title: 'X', extra: { source: 'page' } };
    const enriched = await enrichMetadataWithDOI(original, '10.1000/nope');
    expect(enriched).toBe(original);
    expect(enriched.extra.verified).toBeUndefined();
  });
});

// ── What the mark actually vouches for ───────────────────────────────────────

describe('what the mark vouches for', () => {
  const PAGE_GUESSES = {
    title: 'Attention Is All You Need | ExampleBlog',
    authors: ['ExampleBlog Staff'],
    publicationDate: '2024',
    publisher: '',
    url: 'https://exampleblog.test/attention',
    extra: { source: 'page' },
  };

  test("the publisher's own record wins over the page's guesses", async () => {
    mockCrossRefOk();
    const enriched = await enrichMetadataWithDOI(PAGE_GUESSES, '10.1000/xyz123');
    expect(enriched.title).toBe('Attention Is All You Need');
    expect(enriched.authors).toEqual(['Vaswani, Ashish']);
    expect(enriched.publicationDate).toBe('2017-06-12');
    expect(enriched.publisher).toBe('Curran');
    expect(enriched.siteName).toBe('NeurIPS');
    expect(enriched.url).toBe('https://doi.org/10.1000/xyz123');
  });

  test('names the fields CrossRef actually supplied, so only those can be claimed', async () => {
    mockCrossRefOk();
    const enriched = await enrichMetadataWithDOI(PAGE_GUESSES, '10.1000/xyz123');
    expect(enriched.extra.verified.fields).toEqual(
      expect.arrayContaining(['title', 'authors', 'publicationDate', 'publisher', 'siteName', 'url', 'doi'])
    );
  });

  test('leaves a field CrossRef had nothing for to the page, and does not claim it', async () => {
    const sparse = {
      message: {
        type: 'journal-article',
        title: ['Attention Is All You Need'],
        DOI: '10.1000/xyz123',
        URL: 'https://doi.org/10.1000/xyz123',
      },
    };
    mockCrossRefOk(sparse);
    const enriched = await enrichMetadataWithDOI(PAGE_GUESSES, '10.1000/xyz123');
    expect(enriched.authors).toEqual(['ExampleBlog Staff']);
    expect(enriched.publicationDate).toBe('2024');
    expect(enriched.extra.verified.fields).toEqual(
      expect.arrayContaining(['title', 'url', 'doi'])
    );
    expect(enriched.extra.verified.fields).not.toContain('authors');
    expect(enriched.extra.verified.fields).not.toContain('publicationDate');
    expect(enriched.extra.verified.fields).not.toContain('publisher');
  });

  test("keeps the student's own type choice, which CrossRef never vouched for", async () => {
    mockCrossRefOk();
    const enriched = await enrichMetadataWithDOI({ ...PAGE_GUESSES, type: 'book' }, '10.1000/xyz123');
    expect(enriched.type).toBe('book');
    expect(enriched.extra.verified.fields).not.toContain('type');
  });
});
