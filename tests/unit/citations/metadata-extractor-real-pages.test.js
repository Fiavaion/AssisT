/**
 * Autofill measured against real pages, not invented ones.
 *
 * The fixtures are the <head> of pages fetched on 2026-09-04 (scripts and styles stripped, the
 * JSON-LD kept). Each expectation below is what a student would have to type by hand if the
 * extractor got it wrong.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { extractMetadata, mergeMetadata } from '../../../src/features/citations/metadata-extractor.js';

function load(name) {
  const html = readFileSync(path.join(__dirname, 'fixtures', 'pages', `${name}.html`), 'utf8');
  const url = html.match(/<!-- source: (\S+)/)[1];
  const dom = new JSDOM(html, { url, virtualConsole: new VirtualConsole() });
  const saved = { window: global.window, document: global.document, location: global.location };
  global.window = dom.window;
  global.document = dom.window.document;
  global.location = dom.window.location;
  try {
    return mergeMetadata(extractMetadata(dom.window.document), url);
  } finally {
    Object.assign(global, saved);
  }
}

describe('a Nature article (Highwire citation_* tags)', () => {
  const m = load('nature-article');
  test('type, title, authors in Family, Given form, journal and DOI', () => {
    expect(m.type).toBe('journal');
    expect(m.title).toBe('Array programming with NumPy');
    expect(m.authors.slice(0, 3)).toEqual(['Harris, Charles R.', 'Millman, K. Jarrod', 'van der Walt, Stéfan J.']);
    expect(m.siteName).toBe('Nature');
    expect(m.doi).toBe('10.1038/s41586-020-2649-2');
  });
  test('volume, issue and pages are read from the citation_* tags the page provides', () => {
    expect(m.extra.volume).toBe('585');
    expect(m.extra.issue).toBe('7825');
    expect(m.extra.pages).toBe('357-362');
  });
  test('the precise date wins: citation_publication_date says 2020/09, prism says 2020-09-16', () => {
    // Both tags state the same publication; the one with the day is the one a bibliography prints.
    expect(m.publicationDate).toBe('2020-09-16');
  });
});

describe('the same article on PubMed Central (names in Given Family order)', () => {
  const m = load('pmc-article');
  test('names are canonicalised to Family, Given with particles kept', () => {
    expect(m.authors.slice(0, 3)).toEqual(['Harris, Charles R', 'Millman, K Jarrod', 'van der Walt, Stéfan J']);
  });
  test('journal fields and an ISO date', () => {
    expect(m.type).toBe('journal');
    expect(m.siteName).toBe('Nature');
    expect(m.extra.volume).toBe('585');
    expect(m.publicationDate).toBe('2020-09-16');
  });
});

describe('a Wikipedia entry (JSON-LD headline is a description, not the title)', () => {
  const m = load('wikipedia-bauhaus');
  test('the title is the page name, not its one-line description', () => {
    expect(m.title).toBe('Bauhaus');
  });
  test('an encyclopaedia page is a website with the site as author when no person is named', () => {
    expect(m.type).toBe('website');
    expect(m.siteName).toBe('Wikipedia');
  });
});

describe('a Guardian review (article:author is a profile URL)', () => {
  const m = load('guardian-review');
  test('the author is a person’s name, never a URL', () => {
    expect(m.authors).toEqual(['Jones, Jonathan']);
  });
  test('a NewsArticle on a newspaper site is a newspaper article', () => {
    expect(m.type).toBe('newspaper');
    expect(m.siteName).toBe('The Guardian');
    expect(m.publicationDate).toMatch(/^2026-09-04/);
  });
});

describe('a GOV.UK guidance page (organisation as author)', () => {
  const m = load('govuk-guidance');
  test('an organisation containing "and" is one author, not two', () => {
    expect(m.authors).toEqual(['Women and Equalities Unit']);
  });
  test('site and date', () => {
    expect(m.siteName).toBe('GOV.UK');
    expect(m.publicationDate).toMatch(/^2013-02-27/);
  });
});

describe('a Stanford Encyclopedia of Philosophy entry', () => {
  const m = load('sep-entry');
  test('author, date and the encyclopaedia’s name rather than its hostname', () => {
    expect(m.authors).toEqual(['Guyer, Paul']);
    expect(m.publicationDate).toBe('2007-01-16');
    expect(m.siteName).toBe('Stanford Encyclopedia of Philosophy');
  });
});

describe('an arXiv abstract page', () => {
  const m = load('arxiv-abs');
  test('authors, date and DOI', () => {
    expect(m.authors.slice(0, 2)).toEqual(['Brown, Tom B.', 'Mann, Benjamin']);
    expect(m.publicationDate).toBe('2020-05-28');
    expect(m.doi).toBe('10.48550/arXiv.2005.14165');
    expect(m.siteName).toBe('arXiv');
  });
});

describe('a YouTube watch page (the channel is the author, the upload date the date)', () => {
  const m = load('youtube-watch');
  test('a video is recognised as a video, not a website', () => {
    expect(m.type).toBe('video');
  });
  test('title, channel and site', () => {
    expect(m.title).toBe('Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)');
    // The channel is stated only in the page's microdata, as a <link itemprop="name">.
    expect(m.authors).toEqual(['Astley, Rick']);
    expect(m.siteName).toBe('YouTube');
  });
  test('the upload date is the publication date', () => {
    expect(m.publicationDate).toBe('2009-10-24');
  });
});
