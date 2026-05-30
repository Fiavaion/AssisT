/**
 * @jest-environment jsdom
 *
 * Tests for citation metadata extraction — focused on the Highwire Press (citation_*) academic
 * tags (the standard the old extractor ignored) and the title fallback that guarantees a save
 * never fails validation with "Title is required".
 */

import { extractMetadata, mergeMetadata } from '../../../src/features/citations/metadata-extractor.js';

function setHead(html) {
  document.head.innerHTML = html;
}

afterEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('Highwire citation_* extraction', () => {
  test('auto-fills title, authors, journal, doi, volume/issue/pages and infers journal type', () => {
    setHead(`
      <meta name="citation_title" content="Attention Is All You Need">
      <meta name="citation_author" content="Vaswani, Ashish">
      <meta name="citation_author" content="Shazeer, Noam">
      <meta name="citation_journal_title" content="Advances in Neural Information Processing Systems">
      <meta name="citation_publication_date" content="2017/06/12">
      <meta name="citation_doi" content="10.5555/3295222.3295349">
      <meta name="citation_volume" content="30">
      <meta name="citation_issue" content="2">
      <meta name="citation_firstpage" content="5998">
      <meta name="citation_lastpage" content="6008">
    `);

    const merged = mergeMetadata(extractMetadata(document), 'https://example.org/paper');

    expect(merged.title).toBe('Attention Is All You Need');
    expect(merged.authors).toEqual(['Vaswani, Ashish', 'Shazeer, Noam']);
    expect(merged.siteName).toBe('Advances in Neural Information Processing Systems');
    expect(merged.doi).toBe('10.5555/3295222.3295349');
    expect(merged.publicationDate).toBe('2017-06-12'); // separators normalised
    expect(merged.volume).toBe('30');
    expect(merged.issue).toBe('2');
    expect(merged.pages).toBe('5998-6008');
    expect(merged.type).toBe('journal');
  });

  test('strips a doi.org prefix from citation_doi', () => {
    setHead(`
      <meta name="citation_title" content="X">
      <meta name="citation_doi" content="https://doi.org/10.1/abc">
    `);
    const merged = mergeMetadata(extractMetadata(document), 'https://e.org/x');
    expect(merged.doi).toBe('10.1/abc');
  });
});

describe('title fallback (never empty)', () => {
  test('uses an <h1> when there is no <title> or citation_title', () => {
    document.body.innerHTML = '<h1>  Heading As Title  </h1>';
    const merged = mergeMetadata(extractMetadata(document), 'https://host.test/a');
    expect(merged.title).toBe('Heading As Title');
  });

  test('falls back to the hostname when no title is available anywhere', () => {
    // No <title>, no <h1>, no meta — title must still be non-empty for validation.
    const merged = mergeMetadata(extractMetadata(document), 'https://news.example.com/story');
    expect(merged.title).toBe('news.example.com');
  });

  test('falls back to "Untitled page" when the URL cannot be parsed', () => {
    const merged = mergeMetadata(extractMetadata(document), 'not a url');
    expect(merged.title).toBe('Untitled page');
  });
});
